// 발주오라 판매·매출처·홈택스 신고 파일·공급사 월 정산(2026-11-23, 관리자 요청 "1차 개발", migration 036).
// - 관리자가 동기화(책갈피)를 할 때마다 발주오라 주문 상품 줄(orders/items)과 매출처(merchant/sellers)를 읽어 옵니다.
//   고른 기간은 통째로 다시 읽어 덮어써서 취소·반품으로 바뀐 수량이 반영됩니다(끝까지 다 읽은 경우에만 사라진 줄을 지움).
// - 판매 줄은 DB센터 상품(발주오라 연결)으로 공급사·카테고리를 붙이고, 공급사 센터가 쓰는 supplier_sales(날짜·상품별 판매·반품)를 다시 만듭니다.
// - 과세 여부: 발주오라 상품의 isTaxable → (모르면) DB센터 카테고리가 건강식품이면 과세 → 그 밖은 면세.
// - 홈택스: 그 달 매출처별 월 합계 세금계산서(과세)·계산서(면세) 엑셀(홈택스 일괄발급 양식과 같은 칸)을 만듭니다.
// - 공급사 정산: 공급사별 월 판매 금액·수수료(기본 10%)와 마스터가 바꾸는 정산 상태(정산 대기 → 판매 대금 입금 → 정산 완료).
// 판매 줄에는 받는 사람 이름·연락처를 넣지 않고, 매출처 계좌·비밀번호는 가져오지 않습니다. 로그에 값을 남기지 않습니다.
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { and, asc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { plainCategoryName } from "@repo/shared/baljuora-sync";
import {
  BUYER_OVERRIDE_FIELDS,
  DEFAULT_HOMETAX_SETTINGS,
  HOMETAX_DATA_START_ROW,
  HOMETAX_KIND_LABELS,
  HOMETAX_LAYOUT,
  HOMETAX_MAX_ROWS,
  HOMETAX_SHEET_NAME,
  SALES_EXCLUDED_STATUSES,
  buildHometaxInvoices,
  hometaxBuyerProblems,
  hometaxRowCells,
  hometaxSupplierProblems,
  normalizeBusinessNumber,
  seoulDateOf,
  type BaljuoraBuyerInput,
  type BaljuoraSalesLineInput,
  type BuyerOverrides,
  type HometaxBuyer,
  type HometaxInvoice,
  type HometaxKind,
  type HometaxSaleLine,
  type HometaxSettings
} from "@repo/shared/baljuora-sales";
import {
  addDays,
  feeDueRange,
  isSettlementPeriod,
  monthRange,
  nextMonthKey,
  seoulDateKey,
  settlementAmounts,
  settlementRecordKey,
  weekStartOf,
  type SettlementRecordKind,
  type SupplierSettlementSettings,
  type SupplierSettlementStatus
} from "@repo/shared/supplier-portal";
import { DatabaseError, getDb } from "../_core/db";
import {
  emptyLedgerRow,
  feeState,
  ledgerBySupplier,
  loadSettlementDirectory,
  payoutState,
  recordState,
  settlementRecords,
  type LedgerRow,
  type SettlementDirectory
} from "./supplier-settlement";
import {
  baljuoraBuyers,
  baljuoraSalesLines,
  baljuoraSyncStore,
  categories,
  externalProductLinks,
  products,
  supplierSales,
  supplierSettlements,
  type BaljuoraBuyer
} from "../db/schema";

const PROVIDER = "baljuora";
const STORE_PRODUCT_TAX = "product_tax";
const STORE_SALES_STATE = "sales_state";
const STORE_HOMETAX = "hometax_settings";
const SALES_SOURCE = "baljuora";
export const MAX_SALES_LINES_PER_POST = 2000;
export const MAX_BUYERS_PER_POST = 2000;

export function isMissingSalesTable(error: unknown) {
  const texts = [error instanceof Error ? error.message : String(error), (error as { cause?: { message?: string } })?.cause?.message ?? ""];
  return texts.some((text) => /no such table/i.test(text) && /(baljuora_sales_lines|baljuora_buyers|supplier_settlements)/i.test(text));
}

async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isMissingSalesTable(error)) {
      throw new DatabaseError("DATABASE_QUERY_FAILED", "DB 업데이트(036 판매·매출처 표)가 아직 적용되지 않았습니다. 운영 배포 후 사용할 수 있어요.", 503);
    }
    throw error;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function readStore<T>(key: string, fallback: T): Promise<T> {
  const rows = await getDb().select().from(baljuoraSyncStore).where(eq(baljuoraSyncStore.key, key)).limit(1);
  return parseJson(rows[0]?.value, fallback);
}

async function writeStore(key: string, value: unknown) {
  const text = JSON.stringify(value);
  const updatedAt = nowIso();
  await getDb().insert(baljuoraSyncStore).values({ key, value: text, updatedAt })
    .onConflictDoUpdate({ target: baljuoraSyncStore.key, set: { value: text, updatedAt } });
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

// ─── 책갈피가 보낸 값 정리 ─────────────────────────────────────────────────────

function cleanText(value: unknown, max: number): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value).slice(0, max);
  if (typeof value !== "string") return null;
  // 제어 문자(줄바꿈·탭 등)는 띄어쓰기로 바꿉니다.
  const text = Array.from(value, (char) => { const code = char.charCodeAt(0); return code < 32 || code === 127 ? " " : char; }).join("").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

function cleanInt(value: unknown, min: number, max: number): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.replace(/[,\s원]/g, "")) : Number.NaN;
  if (!Number.isFinite(number)) return null;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export function sanitizeSalesLine(raw: unknown): BaljuoraSalesLineInput | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = cleanText(record.id, 80);
  const orderedAt = cleanText(record.orderedAt, 40);
  if (!id || !seoulDateOf(orderedAt)) return null;
  const quantity = cleanInt(record.quantity, 0, 1_000_000) ?? 0;
  const netQuantity = Math.min(quantity, cleanInt(record.netQuantity, 0, 1_000_000) ?? quantity);
  return {
    id,
    orderId: cleanText(record.orderId, 80),
    orderedAt,
    status: cleanText(record.status, 40)?.toLowerCase() ?? null,
    productId: cleanText(record.productId, 80),
    productCode: cleanText(record.productCode, 60),
    productName: cleanText(record.productName, 200) ?? "이름 없는 상품",
    supplierId: cleanText(record.supplierId, 80),
    supplierName: cleanText(record.supplierName, 120),
    sellerId: cleanText(record.sellerId, 80),
    sellerName: cleanText(record.sellerName, 120),
    quantity,
    netQuantity,
    supplyPrice: cleanInt(record.supplyPrice, 0, 1_000_000_000) ?? 0,
    purchaseCost: cleanInt(record.purchaseCost, 0, 1_000_000_000),
    salesShippingFee: cleanInt(record.salesShippingFee, 0, 100_000_000) ?? 0,
    purchaseShippingFee: cleanInt(record.purchaseShippingFee, 0, 100_000_000) ?? 0
  };
}

export function sanitizeBuyer(raw: unknown): BaljuoraBuyerInput | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = cleanText(record.id, 80);
  const companyName = cleanText(record.companyName, 120);
  if (!id || !companyName) return null;
  return {
    id,
    companyName,
    representativeName: cleanText(record.representativeName, 60),
    businessNumber: cleanText(record.businessNumber, 30),
    businessType: cleanText(record.businessType, 80),
    businessCategory: cleanText(record.businessCategory, 120),
    email: cleanText(record.email, 120),
    phone: cleanText(record.phone, 40),
    managerName: cleanText(record.managerName, 60),
    zipCode: cleanText(record.zipCode, 12),
    address: cleanText(record.address, 200),
    addressDetail: cleanText(record.addressDetail, 200),
    groupId: cleanText(record.groupId, 80),
    groupName: cleanText(record.groupName, 120),
    status: cleanText(record.status, 30),
    orderAcceptType: cleanText(record.orderAcceptType, 30),
    username: cleanText(record.username, 80),
    lastLoginAt: cleanText(record.lastLoginAt, 40),
    joinedAt: cleanText(record.joinedAt, 40)
  };
}

// ─── 판매 줄 받기 ─────────────────────────────────────────────────────────────

type LineContext = {
  linkByExternal: Map<string, { productId: string; taxable: boolean | null }>;
  productById: Map<string, { supplierName: string | null; categoryId: string | null; productCode: string | null }>;
  categoryName: Map<string, string>;
  productTax: Record<string, boolean>;
  // 주문 줄에 매출처 id가 없을 때 상호로 찾기(같은 상호가 하나뿐일 때만)
  buyerIdByName: Map<string, string>;
};

async function loadLineContext(): Promise<LineContext> {
  const db = getDb();
  const [links, productRows, categoryRows, productTax, buyerRows] = await Promise.all([
    db.select({ externalProductId: externalProductLinks.externalProductId, productId: externalProductLinks.productId, rawSnapshot: externalProductLinks.rawSnapshot })
      .from(externalProductLinks).where(eq(externalProductLinks.provider, PROVIDER)),
    db.select({ id: products.id, supplierName: products.supplierName, categoryId: products.categoryId, productCode: products.productCode }).from(products),
    db.select({ id: categories.id, name: categories.name }).from(categories),
    readStore<Record<string, boolean>>(STORE_PRODUCT_TAX, {}),
    db.select({ id: baljuoraBuyers.id, companyName: baljuoraBuyers.companyName }).from(baljuoraBuyers)
  ]);
  const nameCounts = new Map<string, number>();
  for (const row of buyerRows) nameCounts.set(row.companyName, (nameCounts.get(row.companyName) ?? 0) + 1);
  const buyerIdByName = new Map(buyerRows.filter((row) => nameCounts.get(row.companyName) === 1).map((row) => [row.companyName, row.id]));
  const linkByExternal = new Map<string, { productId: string; taxable: boolean | null }>();
  for (const link of links) {
    const state = parseJson<{ snapshot?: { isTaxable?: unknown } } | null>(link.rawSnapshot, null);
    const taxable = typeof state?.snapshot?.isTaxable === "boolean" ? state.snapshot.isTaxable : null;
    linkByExternal.set(link.externalProductId, { productId: link.productId, taxable });
  }
  return {
    linkByExternal,
    productById: new Map(productRows.map((row) => [row.id, { supplierName: row.supplierName, categoryId: row.categoryId, productCode: row.productCode }])),
    categoryName: new Map(categoryRows.map((row) => [row.id, row.name])),
    productTax,
    buyerIdByName
  };
}

function resolveTax(baljuoraProductId: string | null, context: LineContext, categoryId: string | null): { isTaxable: boolean; source: string } {
  if (baljuoraProductId && typeof context.productTax[baljuoraProductId] === "boolean") return { isTaxable: context.productTax[baljuoraProductId], source: "baljuora" };
  const linked = baljuoraProductId ? context.linkByExternal.get(baljuoraProductId) : undefined;
  if (linked && linked.taxable !== null) return { isTaxable: linked.taxable, source: "baljuora" };
  const categoryName = categoryId ? context.categoryName.get(categoryId) : undefined;
  if (categoryName) return { isTaxable: plainCategoryName(categoryName).includes("건강식품"), source: "category" };
  // 모르면 면세(두고푸드 상품 대부분이 농축수산물). 홈택스 화면에서 몇 줄인지 알려 줍니다.
  return { isTaxable: false, source: "default" };
}

function lineRow(line: BaljuoraSalesLineInput, context: LineContext, jobId: string): typeof baljuoraSalesLines.$inferInsert {
  // 예전 발주오라 엑셀로 가져온 상품은 DB센터 id가 "baljuora-<발주오라 상품 id>"입니다.
  const linkedId = line.productId ? context.linkByExternal.get(line.productId)?.productId ?? (context.productById.has(`baljuora-${line.productId}`) ? `baljuora-${line.productId}` : null) : null;
  const product = linkedId ? context.productById.get(linkedId) : undefined;
  const categoryId = product?.categoryId ?? null;
  const tax = resolveTax(line.productId, context, categoryId);
  const supplierName = product?.supplierName?.trim() || line.supplierName || null;
  return {
    id: line.id,
    orderId: line.orderId,
    saleDate: seoulDateOf(line.orderedAt) as string,
    orderedAt: line.orderedAt,
    status: line.status,
    baljuoraProductId: line.productId,
    productId: linkedId,
    productCode: product?.productCode ?? line.productCode,
    productName: line.productName,
    categoryId,
    supplierName,
    baljuoraSupplierName: line.supplierName,
    sellerId: line.sellerId ?? (line.sellerName ? context.buyerIdByName.get(line.sellerName) ?? null : null),
    sellerName: line.sellerName,
    quantity: line.quantity,
    netQuantity: line.netQuantity,
    unitPrice: line.supplyPrice,
    unitCost: line.purchaseCost,
    amount: line.supplyPrice * line.netQuantity,
    costAmount: line.purchaseCost === null ? null : line.purchaseCost * line.netQuantity,
    salesShippingFee: line.salesShippingFee,
    purchaseShippingFee: line.purchaseShippingFee,
    isTaxable: tax.isTaxable,
    taxSource: tax.source,
    syncJobId: jobId,
    updatedAt: nowIso()
  };
}

/** 책갈피가 보낸 판매 줄을 저장합니다(같은 줄 id는 새 값으로 덮어씀). 저장한 줄 수를 돌려줍니다. */
export async function ingestSalesLines(jobId: string, rawLines: unknown[]) {
  return guarded(async () => {
    const lines = rawLines.slice(0, MAX_SALES_LINES_PER_POST).map(sanitizeSalesLine).filter((line): line is BaljuoraSalesLineInput => line !== null);
    if (lines.length === 0) return 0;
    const context = await loadLineContext();
    const unique = new Map(lines.map((line) => [line.id, lineRow(line, context, jobId)]));
    const db = getDb();
    for (const part of chunk([...unique.values()], 40)) {
      await db.insert(baljuoraSalesLines).values(part).onConflictDoUpdate({
        target: baljuoraSalesLines.id,
        set: {
          orderId: sql`excluded.orderId`,
          saleDate: sql`excluded.saleDate`,
          orderedAt: sql`excluded.orderedAt`,
          status: sql`excluded.status`,
          baljuoraProductId: sql`excluded.baljuoraProductId`,
          productId: sql`excluded.productId`,
          productCode: sql`excluded.productCode`,
          productName: sql`excluded.productName`,
          categoryId: sql`excluded.categoryId`,
          supplierName: sql`excluded.supplierName`,
          baljuoraSupplierName: sql`excluded.baljuoraSupplierName`,
          sellerId: sql`excluded.sellerId`,
          sellerName: sql`excluded.sellerName`,
          quantity: sql`excluded.quantity`,
          netQuantity: sql`excluded.netQuantity`,
          unitPrice: sql`excluded.unitPrice`,
          unitCost: sql`excluded.unitCost`,
          amount: sql`excluded.amount`,
          costAmount: sql`excluded.costAmount`,
          salesShippingFee: sql`excluded.salesShippingFee`,
          purchaseShippingFee: sql`excluded.purchaseShippingFee`,
          isTaxable: sql`excluded.isTaxable`,
          taxSource: sql`excluded.taxSource`,
          syncJobId: sql`excluded.syncJobId`,
          updatedAt: sql`excluded.updatedAt`
        }
      });
    }
    return unique.size;
  });
}

/** 책갈피가 보낸 매출처를 저장합니다. DB센터에서 고친 칸(overrides)과 메모는 그대로 둡니다. */
export async function ingestBuyers(rawBuyers: unknown[]) {
  return guarded(async () => {
    const buyers = rawBuyers.slice(0, MAX_BUYERS_PER_POST).map(sanitizeBuyer).filter((buyer): buyer is BaljuoraBuyerInput => buyer !== null);
    if (buyers.length === 0) return 0;
    const now = nowIso();
    const unique = new Map(buyers.map((buyer) => [buyer.id, { ...buyer, firstSyncedAt: now, lastSyncedAt: now, updatedAt: now }]));
    const db = getDb();
    for (const part of chunk([...unique.values()], 40)) {
      await db.insert(baljuoraBuyers).values(part).onConflictDoUpdate({
        target: baljuoraBuyers.id,
        set: {
          companyName: sql`excluded.companyName`,
          representativeName: sql`excluded.representativeName`,
          businessNumber: sql`excluded.businessNumber`,
          businessType: sql`excluded.businessType`,
          businessCategory: sql`excluded.businessCategory`,
          email: sql`excluded.email`,
          phone: sql`excluded.phone`,
          managerName: sql`excluded.managerName`,
          zipCode: sql`excluded.zipCode`,
          address: sql`excluded.address`,
          addressDetail: sql`excluded.addressDetail`,
          groupId: sql`excluded.groupId`,
          groupName: sql`excluded.groupName`,
          status: sql`excluded.status`,
          orderAcceptType: sql`excluded.orderAcceptType`,
          username: sql`excluded.username`,
          lastLoginAt: sql`excluded.lastLoginAt`,
          joinedAt: sql`excluded.joinedAt`,
          lastSyncedAt: sql`excluded.lastSyncedAt`,
          updatedAt: sql`excluded.updatedAt`
        }
      });
    }
    return unique.size;
  });
}

/** 책갈피가 상품 상세에서 읽은 과세 여부(발주오라 상품 id → 과세)를 모아 둡니다. */
export async function ingestProductTax(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return 0;
  const current = await readStore<Record<string, boolean>>(STORE_PRODUCT_TAX, {});
  let added = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "boolean" || !/^[\w-]{1,80}$/.test(key)) continue;
    current[key] = value;
    added += 1;
  }
  if (added > 0) {
    const entries = Object.entries(current);
    await writeStore(STORE_PRODUCT_TAX, Object.fromEntries(entries.slice(Math.max(0, entries.length - 30_000))));
  }
  return added;
}

/** 과세 여부를 이미 아는 발주오라 상품 id(책갈피가 상세를 다시 읽지 않게) */
export async function knownTaxProductIds() {
  const [productTax, links] = await Promise.all([
    readStore<Record<string, boolean>>(STORE_PRODUCT_TAX, {}),
    getDb().select({ externalProductId: externalProductLinks.externalProductId, rawSnapshot: externalProductLinks.rawSnapshot }).from(externalProductLinks).where(eq(externalProductLinks.provider, PROVIDER))
  ]);
  const ids = new Set(Object.keys(productTax));
  for (const link of links) {
    const state = parseJson<{ snapshot?: { isTaxable?: unknown } } | null>(link.rawSnapshot, null);
    if (typeof state?.snapshot?.isTaxable === "boolean") ids.add(link.externalProductId);
  }
  return [...ids].slice(0, 20_000);
}

export type SalesSyncState = {
  at: string;
  jobId: string;
  start: string;
  end: string;
  complete: boolean;
  lines: number;
  buyers: number;
  error: string | null;
};

export const revenueWhere = (): SQL => sql`(${baljuoraSalesLines.status} IS NULL OR lower(${baljuoraSalesLines.status}) NOT IN (${sql.join(SALES_EXCLUDED_STATUSES.map((status) => sql`${status}`), sql`, `)}))`;

/** 공급사 센터용 supplier_sales(날짜·공급사·상품별 판매·반품)를 판매 줄로 다시 만듭니다. */
async function rebuildSupplierSales(start: string, end: string) {
  const db = getDb();
  const productKey = sql<string>`coalesce(${baljuoraSalesLines.productId}, 'bj:' || ${baljuoraSalesLines.baljuoraProductId}, 'name:' || ${baljuoraSalesLines.productName})`;
  const rows = await db.select({
    saleDate: baljuoraSalesLines.saleDate,
    supplierName: baljuoraSalesLines.supplierName,
    productKey,
    productId: sql<string | null>`max(${baljuoraSalesLines.productId})`,
    productCode: sql<string | null>`max(${baljuoraSalesLines.productCode})`,
    productName: sql<string>`max(${baljuoraSalesLines.productName})`,
    quantity: sql<number>`sum(${baljuoraSalesLines.quantity})`,
    gross: sql<number>`sum(${baljuoraSalesLines.quantity} * ${baljuoraSalesLines.unitPrice})`,
    returnQuantity: sql<number>`sum(${baljuoraSalesLines.quantity} - ${baljuoraSalesLines.netQuantity})`,
    returnAmount: sql<number>`sum((${baljuoraSalesLines.quantity} - ${baljuoraSalesLines.netQuantity}) * ${baljuoraSalesLines.unitPrice})`,
    orders: sql<number>`count(distinct coalesce(${baljuoraSalesLines.orderId}, ${baljuoraSalesLines.id}))`
  }).from(baljuoraSalesLines)
    .where(and(gte(baljuoraSalesLines.saleDate, start), lte(baljuoraSalesLines.saleDate, end), revenueWhere(), sql`coalesce(trim(${baljuoraSalesLines.supplierName}), '') <> ''`))
    .groupBy(baljuoraSalesLines.saleDate, baljuoraSalesLines.supplierName, productKey);
  await db.delete(supplierSales).where(and(eq(supplierSales.source, SALES_SOURCE), gte(supplierSales.saleDate, start), lte(supplierSales.saleDate, end)));
  const now = nowIso();
  const inserts: Array<typeof supplierSales.$inferInsert> = [];
  for (const row of rows) {
    const supplierName = String(row.supplierName ?? "").trim();
    const base = { saleDate: row.saleDate, supplierName, productId: row.productId?.startsWith("bj:") ? null : row.productId, productCode: row.productCode, productName: row.productName, source: SALES_SOURCE, createdAt: now, updatedAt: now };
    const key = `${row.saleDate}|${supplierName}|${row.productKey}`;
    if (Number(row.quantity) > 0) inserts.push({ ...base, id: randomUUID(), kind: "sale", quantity: Number(row.quantity), amount: Number(row.gross), orderCount: Number(row.orders), externalId: `bj:${key}:sale` });
    if (Number(row.returnQuantity) > 0) inserts.push({ ...base, id: randomUUID(), kind: "return", quantity: Number(row.returnQuantity), amount: Number(row.returnAmount), orderCount: 0, externalId: `bj:${key}:return` });
  }
  for (const part of chunk(inserts, 60)) await db.insert(supplierSales).values(part);
  return inserts.length;
}

/** 책갈피가 판매 읽기를 마쳤을 때: 끝까지 읽었으면 기간 안의 사라진 줄을 지우고 공급사 센터 판매 내역을 다시 만듭니다. */
export async function finalizeSalesSync(input: { jobId: string; start: string; end: string; complete: boolean; lines: number; buyers: number; error: string | null }) {
  return guarded(async () => {
    const db = getDb();
    if (!isDateKey(input.start) || !isDateKey(input.end)) throw new DatabaseError("DATABASE_QUERY_FAILED", "판매 기간이 올바르지 않습니다.", 400);
    if (input.complete) {
      await db.delete(baljuoraSalesLines).where(and(
        gte(baljuoraSalesLines.saleDate, input.start),
        lte(baljuoraSalesLines.saleDate, input.end),
        sql`(${baljuoraSalesLines.syncJobId} IS NULL OR ${baljuoraSalesLines.syncJobId} <> ${input.jobId})`
      ));
    }
    await rebuildSupplierSales(input.start, input.end);
    const state: SalesSyncState = { at: nowIso(), jobId: input.jobId, start: input.start, end: input.end, complete: input.complete, lines: input.lines, buyers: input.buyers, error: input.error };
    await writeStore(STORE_SALES_STATE, state);
    return state;
  });
}

export async function getSalesSyncState() {
  return readStore<SalesSyncState | null>(STORE_SALES_STATE, null);
}

/** 동기화할 판매 기간: 이번 달 포함 최근 N개월(1일 ~ 오늘) */
export function salesRangeFor(months: number, today = seoulDateKey()) {
  const count = Math.min(12, Math.max(1, Math.round(months || 1)));
  return { start: `${nextMonthKey(today.slice(0, 7), -(count - 1))}-01`, end: today };
}

// ─── 판매 현황(대시보드) ─────────────────────────────────────────────────────

type Totals = { amount: number; quantity: number; orders: number; buyers: number; cost: number; returnAmount: number; lines: number };

async function totalsFor(where: SQL | undefined): Promise<Totals> {
  const rows = await getDb().select({
    amount: sql<number>`coalesce(sum(${baljuoraSalesLines.amount}), 0)`,
    quantity: sql<number>`coalesce(sum(${baljuoraSalesLines.netQuantity}), 0)`,
    orders: sql<number>`count(distinct coalesce(${baljuoraSalesLines.orderId}, ${baljuoraSalesLines.id}))`,
    buyers: sql<number>`count(distinct coalesce(${baljuoraSalesLines.sellerId}, ${baljuoraSalesLines.sellerName}))`,
    cost: sql<number>`coalesce(sum(${baljuoraSalesLines.costAmount}), 0)`,
    returnAmount: sql<number>`coalesce(sum((${baljuoraSalesLines.quantity} - ${baljuoraSalesLines.netQuantity}) * ${baljuoraSalesLines.unitPrice}), 0)`,
    lines: sql<number>`count(*)`
  }).from(baljuoraSalesLines).where(where);
  const row = rows[0];
  return { amount: Number(row?.amount ?? 0), quantity: Number(row?.quantity ?? 0), orders: Number(row?.orders ?? 0), buyers: Number(row?.buyers ?? 0), cost: Number(row?.cost ?? 0), returnAmount: Number(row?.returnAmount ?? 0), lines: Number(row?.lines ?? 0) };
}

async function topProducts(where: SQL | undefined, limit: number) {
  const key = sql<string>`coalesce(${baljuoraSalesLines.productId}, ${baljuoraSalesLines.baljuoraProductId}, ${baljuoraSalesLines.productName})`;
  const rows = await getDb().select({
    key,
    productId: sql<string | null>`max(${baljuoraSalesLines.productId})`,
    name: sql<string>`max(${baljuoraSalesLines.productName})`,
    supplierName: sql<string | null>`max(${baljuoraSalesLines.supplierName})`,
    categoryId: sql<string | null>`max(${baljuoraSalesLines.categoryId})`,
    amount: sql<number>`sum(${baljuoraSalesLines.amount})`,
    quantity: sql<number>`sum(${baljuoraSalesLines.netQuantity})`,
    orders: sql<number>`count(distinct coalesce(${baljuoraSalesLines.orderId}, ${baljuoraSalesLines.id}))`
  }).from(baljuoraSalesLines).where(where).groupBy(key).orderBy(sql`sum(${baljuoraSalesLines.amount}) desc`).limit(limit);
  return rows.map((row) => ({ key: row.key, productId: row.productId, name: row.name, supplierName: row.supplierName, categoryId: row.categoryId, amount: Number(row.amount), quantity: Number(row.quantity), orders: Number(row.orders) }));
}

function shiftDays(from: string, to: string) {
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  return { start: addDays(from, -days), end: addDays(from, -1), days };
}

export async function getSalesDashboard(input: { from?: string | null; to?: string | null }) {
  return guarded(async () => {
    const db = getDb();
    const today = seoulDateKey();
    let from = isDateKey(input.from) ? input.from : `${today.slice(0, 7)}-01`;
    let to = isDateKey(input.to) ? input.to : today;
    if (from > to) [from, to] = [to, from];
    const inRange = and(gte(baljuoraSalesLines.saleDate, from), lte(baljuoraSalesLines.saleDate, to), revenueWhere());
    const todayWhere = and(eq(baljuoraSalesLines.saleDate, today), revenueWhere());
    const previous = shiftDays(from, to);
    const previousWhere = and(gte(baljuoraSalesLines.saleDate, previous.start), lte(baljuoraSalesLines.saleDate, previous.end), revenueWhere());

    const supplierKey = sql<string>`coalesce(nullif(trim(${baljuoraSalesLines.supplierName}), ''), '(공급사 미지정)')`;
    const buyerKey = sql<string>`coalesce(${baljuoraSalesLines.sellerId}, ${baljuoraSalesLines.sellerName}, '(매출처 미지정)')`;
    const [totals, todayTotals, previousTotals, pendingRows, daily, products10, todayTop, suppliers10, categoryRows, buyers10, anyRows, categoryNames, syncState] = await Promise.all([
      totalsFor(inRange),
      totalsFor(todayWhere),
      totalsFor(previousWhere),
      db.select({ count: sql<number>`count(*)`, amount: sql<number>`coalesce(sum(${baljuoraSalesLines.amount}), 0)` }).from(baljuoraSalesLines)
        .where(and(gte(baljuoraSalesLines.saleDate, from), lte(baljuoraSalesLines.saleDate, to), sql`lower(${baljuoraSalesLines.status}) = 'pending'`)),
      db.select({ date: baljuoraSalesLines.saleDate, amount: sql<number>`sum(${baljuoraSalesLines.amount})`, orders: sql<number>`count(distinct coalesce(${baljuoraSalesLines.orderId}, ${baljuoraSalesLines.id}))`, quantity: sql<number>`sum(${baljuoraSalesLines.netQuantity})` })
        .from(baljuoraSalesLines).where(inRange).groupBy(baljuoraSalesLines.saleDate).orderBy(asc(baljuoraSalesLines.saleDate)),
      topProducts(inRange, 10),
      topProducts(todayWhere, 5),
      db.select({ name: supplierKey, amount: sql<number>`sum(${baljuoraSalesLines.amount})`, quantity: sql<number>`sum(${baljuoraSalesLines.netQuantity})`, products: sql<number>`count(distinct coalesce(${baljuoraSalesLines.productId}, ${baljuoraSalesLines.baljuoraProductId}, ${baljuoraSalesLines.productName}))` })
        .from(baljuoraSalesLines).where(inRange).groupBy(supplierKey).orderBy(sql`sum(${baljuoraSalesLines.amount}) desc`).limit(10),
      db.select({ categoryId: baljuoraSalesLines.categoryId, amount: sql<number>`sum(${baljuoraSalesLines.amount})`, quantity: sql<number>`sum(${baljuoraSalesLines.netQuantity})` })
        .from(baljuoraSalesLines).where(inRange).groupBy(baljuoraSalesLines.categoryId).orderBy(sql`sum(${baljuoraSalesLines.amount}) desc`),
      db.select({ key: buyerKey, name: sql<string>`coalesce(max(${baljuoraSalesLines.sellerName}), '(매출처 미지정)')`, amount: sql<number>`sum(${baljuoraSalesLines.amount})`, orders: sql<number>`count(distinct coalesce(${baljuoraSalesLines.orderId}, ${baljuoraSalesLines.id}))`, quantity: sql<number>`sum(${baljuoraSalesLines.netQuantity})` })
        .from(baljuoraSalesLines).where(inRange).groupBy(buyerKey).orderBy(sql`sum(${baljuoraSalesLines.amount}) desc`).limit(10),
      db.select({ id: baljuoraSalesLines.id }).from(baljuoraSalesLines).limit(1),
      db.select({ id: categories.id, name: categories.name }).from(categories),
      getSalesSyncState()
    ]);
    const categoryName = new Map(categoryNames.map((row) => [row.id, row.name]));
    const named = <T extends { categoryId: string | null }>(row: T) => ({ ...row, categoryName: row.categoryId ? categoryName.get(row.categoryId) ?? "(삭제된 카테고리)" : "DB센터 미연결 상품" });
    // 상품 썸네일(2026-11-24 관리자 요청 "잘 팔린 상품·TOP 10 앞에 상품 이미지"): DB센터 상품과 이어진 줄만 그 상품 이미지를 붙입니다.
    const imageIds = [...new Set([...products10, ...todayTop].map((row) => row.productId).filter((id): id is string => Boolean(id)))];
    const imageRows = imageIds.length > 0 ? await db.select({ id: products.id, imageUrl: products.imageUrl }).from(products).where(inArray(products.id, imageIds)) : [];
    const imageById = new Map(imageRows.map((row) => [row.id, row.imageUrl]));
    const withImage = <T extends { productId: string | null; categoryId: string | null }>(row: T) => ({ ...named(row), imageUrl: row.productId ? imageById.get(row.productId) ?? null : null });
    // 두고푸드 수익 나눠 보기(판매수수료 예상 · 일반 도매 마진 · 배송비 차익 · 공급사에 줄 배송비)
    const [ledgers, directory] = await Promise.all([ledgerBySupplier(from, to), loadSettlementDirectory()]);
    return {
      from,
      to,
      today,
      hasData: anyRows.length > 0,
      totals,
      breakdown: profitBreakdown(ledgers, directory),
      previous: { from: previous.start, to: previous.end, amount: previousTotals.amount, orders: previousTotals.orders },
      pending: { count: Number(pendingRows[0]?.count ?? 0), amount: Number(pendingRows[0]?.amount ?? 0) },
      todaySales: { totals: todayTotals, topProducts: todayTop.map(withImage) },
      daily: daily.map((row) => ({ date: row.date, amount: Number(row.amount), orders: Number(row.orders), quantity: Number(row.quantity) })),
      topProducts: products10.map(withImage),
      topSuppliers: suppliers10.map((row) => ({ name: row.name, amount: Number(row.amount), quantity: Number(row.quantity), products: Number(row.products) })),
      categories: categoryRows.map((row) => named({ categoryId: row.categoryId, amount: Number(row.amount), quantity: Number(row.quantity) })),
      topBuyers: buyers10.map((row) => ({ key: row.key, name: row.name, amount: Number(row.amount), orders: Number(row.orders), quantity: Number(row.quantity) })),
      sync: syncState
    };
  });
}

// ─── 매출처(셀러) ─────────────────────────────────────────────────────────────

function buyerOverrides(row: Pick<BaljuoraBuyer, "overrides">): BuyerOverrides {
  const value = parseJson<Record<string, unknown>>(row.overrides, {});
  const result: BuyerOverrides = {};
  for (const field of BUYER_OVERRIDE_FIELDS) if (typeof value[field] === "string" && value[field]) result[field] = value[field] as string;
  return result;
}

/** DB센터에서 고친 칸을 반영한 세금계산서용 매출처 정보 */
export function effectiveBuyer(row: BaljuoraBuyer): HometaxBuyer & { overridden: string[] } {
  const overrides = buyerOverrides(row);
  const pick = (field: keyof BuyerOverrides, value: string | null) => overrides[field] ?? value ?? "";
  const address = [pick("address", row.address), pick("addressDetail", row.addressDetail)].filter(Boolean).join(" ");
  return {
    key: row.id,
    name: pick("companyName", row.companyName),
    businessNumber: normalizeBusinessNumber(pick("businessNumber", row.businessNumber)),
    companyName: pick("companyName", row.companyName),
    ceoName: pick("representativeName", row.representativeName),
    address,
    businessType: pick("businessType", row.businessType),
    businessItem: pick("businessCategory", row.businessCategory),
    email: pick("email", row.email),
    overridden: Object.keys(overrides)
  };
}

export async function listBuyers(input: { search?: string | null } = {}) {
  return guarded(async () => {
    const db = getDb();
    const month = seoulDateKey().slice(0, 7);
    const { start, end } = monthRange(month);
    const buyerKey = sql<string>`coalesce(${baljuoraSalesLines.sellerId}, 'name:' || ${baljuoraSalesLines.sellerName})`;
    const [rows, stats, monthStats, state] = await Promise.all([
      db.select().from(baljuoraBuyers).orderBy(asc(baljuoraBuyers.companyName)),
      db.select({ key: buyerKey, name: sql<string | null>`max(${baljuoraSalesLines.sellerName})`, amount: sql<number>`sum(${baljuoraSalesLines.amount})`, orders: sql<number>`count(distinct coalesce(${baljuoraSalesLines.orderId}, ${baljuoraSalesLines.id}))`, lastDate: sql<string>`max(${baljuoraSalesLines.saleDate})` })
        .from(baljuoraSalesLines).where(revenueWhere()).groupBy(buyerKey),
      db.select({ key: buyerKey, amount: sql<number>`sum(${baljuoraSalesLines.amount})` })
        .from(baljuoraSalesLines).where(and(gte(baljuoraSalesLines.saleDate, start), lte(baljuoraSalesLines.saleDate, end), revenueWhere())).groupBy(buyerKey),
      getSalesSyncState()
    ]);
    const statByKey = new Map(stats.map((row) => [row.key, row]));
    const monthByKey = new Map(monthStats.map((row) => [row.key, Number(row.amount)]));
    const matched = new Set<string>();
    const keyword = (input.search ?? "").trim().toLowerCase();
    const buyers = rows.map((row) => {
      const effective = effectiveBuyer(row);
      const keys = [row.id, `name:${row.companyName}`];
      const stat = keys.map((key) => statByKey.get(key)).find(Boolean);
      keys.forEach((key) => { if (statByKey.has(key)) matched.add(key); });
      const monthAmount = keys.reduce((sum, key) => sum + (monthByKey.get(key) ?? 0), 0);
      return {
        id: row.id,
        companyName: row.companyName,
        representativeName: row.representativeName,
        businessNumber: row.businessNumber,
        businessType: row.businessType,
        businessCategory: row.businessCategory,
        email: row.email,
        phone: row.phone,
        managerName: row.managerName,
        zipCode: row.zipCode,
        address: row.address,
        addressDetail: row.addressDetail,
        groupName: row.groupName,
        status: row.status,
        orderAcceptType: row.orderAcceptType,
        username: row.username,
        lastLoginAt: row.lastLoginAt,
        joinedAt: row.joinedAt,
        memo: row.memo,
        overrides: buyerOverrides(row),
        invoice: effective,
        invoiceProblems: hometaxBuyerProblems(effective),
        lastSyncedAt: row.lastSyncedAt,
        totalAmount: Number(stat?.amount ?? 0),
        orderCount: Number(stat?.orders ?? 0),
        lastOrderDate: stat?.lastDate ?? null,
        monthAmount
      };
    }).filter((buyer) => !keyword || [buyer.companyName, buyer.representativeName, buyer.businessNumber, buyer.username, buyer.managerName, buyer.email, buyer.phone, buyer.groupName]
      .some((value) => value && value.toLowerCase().includes(keyword)));
    // 판매 줄에는 있는데 매출처 목록에 없는 이름(매출처를 아직 불러오지 않았거나 지워진 매출처)
    const unknownSellers = stats.filter((row) => !matched.has(row.key)).map((row) => ({ name: row.name ?? row.key, amount: Number(row.amount), orders: Number(row.orders) }))
      .sort((first, second) => second.amount - first.amount).slice(0, 50);
    return { buyers, total: rows.length, month, unknownSellers, sync: state };
  });
}

export async function updateBuyer(id: string, input: { overrides?: Record<string, string | null> | null; memo?: string | null }) {
  return guarded(async () => {
    const db = getDb();
    const rows = await db.select().from(baljuoraBuyers).where(eq(baljuoraBuyers.id, id)).limit(1);
    const row = rows[0];
    if (!row) throw new DatabaseError("DATABASE_QUERY_FAILED", "매출처를 찾을 수 없습니다.", 404);
    const patch: Partial<typeof baljuoraBuyers.$inferInsert> = { updatedAt: nowIso() };
    if (input.overrides !== undefined) {
      const next: BuyerOverrides = { ...buyerOverrides(row) };
      for (const field of BUYER_OVERRIDE_FIELDS) {
        if (!input.overrides || !(field in input.overrides)) continue;
        const value = cleanText(input.overrides[field], field === "address" || field === "addressDetail" ? 200 : 120);
        // 발주오라 값과 같으면 고친 값으로 두지 않습니다(발주오라에서 바뀌면 그대로 따라감).
        const synced = (row as Record<string, unknown>)[field];
        if (!value || value === synced) delete next[field];
        else next[field] = field === "businessNumber" ? normalizeBusinessNumber(value) : value;
      }
      patch.overrides = Object.keys(next).length > 0 ? JSON.stringify(next) : null;
    }
    if (input.memo !== undefined) patch.memo = cleanText(input.memo, 500);
    await db.update(baljuoraBuyers).set(patch).where(eq(baljuoraBuyers.id, id));
    const updated = await db.select().from(baljuoraBuyers).where(eq(baljuoraBuyers.id, id)).limit(1);
    const effective = effectiveBuyer(updated[0]);
    return { id, overrides: buyerOverrides(updated[0]), memo: updated[0].memo, invoice: effective, invoiceProblems: hometaxBuyerProblems(effective) };
  });
}

// ─── 홈택스 신고 파일 ─────────────────────────────────────────────────────────

function cleanHometaxSettings(input: unknown, base: HometaxSettings): HometaxSettings {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const supplierInput = record.supplier && typeof record.supplier === "object" ? record.supplier as Record<string, unknown> : {};
  const field = (key: keyof HometaxSettings["supplier"], max: number) => key in supplierInput ? cleanText(supplierInput[key], max) ?? "" : base.supplier[key];
  return {
    supplier: {
      businessNumber: normalizeBusinessNumber(field("businessNumber", 20)).slice(0, 10),
      branchNumber: normalizeBusinessNumber(field("branchNumber", 10)).slice(0, 4),
      companyName: field("companyName", 70),
      ceoName: field("ceoName", 30),
      address: field("address", 150),
      businessType: field("businessType", 40),
      businessItem: field("businessItem", 60),
      email: field("email", 60)
    },
    vatIncluded: typeof record.vatIncluded === "boolean" ? record.vatIncluded : base.vatIncluded,
    receiptType: record.receiptType === "01" || record.receiptType === "02" ? record.receiptType : base.receiptType,
    includeShipping: typeof record.includeShipping === "boolean" ? record.includeShipping : base.includeShipping
  };
}

export async function getHometaxSettings(): Promise<HometaxSettings> {
  return cleanHometaxSettings(await readStore<unknown>(STORE_HOMETAX, {}), DEFAULT_HOMETAX_SETTINGS);
}

export async function saveHometaxSettings(input: unknown) {
  const next = cleanHometaxSettings(input, await getHometaxSettings());
  await writeStore(STORE_HOMETAX, next);
  return next;
}

async function hometaxData(month: string) {
  const db = getDb();
  const { start, end } = monthRange(month);
  const [lines, buyerRows, settings] = await Promise.all([
    db.select({
      sellerId: baljuoraSalesLines.sellerId,
      sellerName: baljuoraSalesLines.sellerName,
      productId: baljuoraSalesLines.productId,
      baljuoraProductId: baljuoraSalesLines.baljuoraProductId,
      productName: baljuoraSalesLines.productName,
      netQuantity: baljuoraSalesLines.netQuantity,
      unitPrice: baljuoraSalesLines.unitPrice,
      amount: baljuoraSalesLines.amount,
      salesShippingFee: baljuoraSalesLines.salesShippingFee,
      isTaxable: baljuoraSalesLines.isTaxable,
      taxSource: baljuoraSalesLines.taxSource
    }).from(baljuoraSalesLines).where(and(gte(baljuoraSalesLines.saleDate, start), lte(baljuoraSalesLines.saleDate, end), revenueWhere())),
    db.select().from(baljuoraBuyers),
    getHometaxSettings()
  ]);
  const buyers = new Map<string, HometaxBuyer>();
  for (const row of buyerRows) {
    const effective = effectiveBuyer(row);
    buyers.set(row.id, effective);
    if (!buyers.has(`name:${row.companyName}`)) buyers.set(`name:${row.companyName}`, effective);
  }
  const taxSources = { baljuora: 0, category: 0, default: 0 };
  const saleLines: HometaxSaleLine[] = lines.map((line) => {
    const nameKey = `name:${line.sellerName ?? ""}`;
    const buyerKey = line.sellerId && buyers.has(line.sellerId) ? line.sellerId : buyers.has(nameKey) ? (buyers.get(nameKey) as HometaxBuyer).key : line.sellerId ?? nameKey;
    const source = line.taxSource === "baljuora" || line.taxSource === "category" ? line.taxSource : "default";
    taxSources[source] += 1;
    return {
      buyerKey,
      productKey: line.productId ?? line.baljuoraProductId ?? line.productName,
      productName: line.productName,
      quantity: line.netQuantity,
      unitPrice: line.unitPrice,
      amount: line.amount,
      shippingFee: line.salesShippingFee,
      isTaxable: Boolean(line.isTaxable)
    };
  });
  const result = buildHometaxInvoices({ month, lines: saleLines, buyers, settings });
  return { ...result, settings, lineCount: lines.length, taxSources };
}

function invoiceSummary(invoice: HometaxInvoice) {
  return {
    buyerKey: invoice.buyerKey,
    companyName: invoice.buyer.companyName,
    businessNumber: invoice.buyer.businessNumber,
    ceoName: invoice.buyer.ceoName,
    email: invoice.buyer.email,
    supplyTotal: invoice.supplyTotal,
    taxTotal: invoice.taxTotal,
    grossTotal: invoice.grossTotal,
    productCount: invoice.productCount,
    shippingTotal: invoice.shippingTotal,
    items: invoice.items.map((item) => ({ name: item.name, quantity: item.quantity, unitPrice: item.unitPrice, supply: item.supply, tax: item.tax }))
  };
}

export async function getHometaxPreview(month: string) {
  return guarded(async () => {
    if (!isMonthKey(month)) throw new DatabaseError("DATABASE_QUERY_FAILED", "신고할 달을 YYYY-MM 형식으로 골라 주세요.", 400);
    const data = await hometaxData(month);
    const sum = (list: HometaxInvoice[], key: "supplyTotal" | "taxTotal" | "grossTotal") => list.reduce((total, invoice) => total + invoice[key], 0);
    return {
      month,
      writeDate: data.writeDate,
      settings: data.settings,
      supplierProblems: hometaxSupplierProblems(data.settings.supplier),
      lineCount: data.lineCount,
      taxSources: data.taxSources,
      taxable: { count: data.taxable.length, files: Math.ceil(data.taxable.length / HOMETAX_MAX_ROWS), supplyTotal: sum(data.taxable, "supplyTotal"), taxTotal: sum(data.taxable, "taxTotal"), grossTotal: sum(data.taxable, "grossTotal"), invoices: data.taxable.map(invoiceSummary) },
      exempt: { count: data.exempt.length, files: Math.ceil(data.exempt.length / HOMETAX_MAX_ROWS), supplyTotal: sum(data.exempt, "supplyTotal"), taxTotal: 0, grossTotal: sum(data.exempt, "grossTotal"), invoices: data.exempt.map(invoiceSummary) },
      skipped: data.skipped
    };
  });
}

const HEADER_FILL: Record<"required" | "optional", string> = { required: "FFFFCC99", optional: "FFCCFFCC" };

/** 홈택스 일괄발급 양식(엑셀업로드양식 시트)과 같은 모양의 xlsx. 모든 값은 글자(텍스트)로 넣습니다. */
export async function hometaxWorkbook(kind: HometaxKind, rows: string[][]) {
  const layout = HOMETAX_LAYOUT[kind];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DOOGO FOOD DB CENTER";
  const sheet = workbook.addWorksheet(HOMETAX_SHEET_NAME);
  const columns = layout.headers.length;
  sheet.columns = layout.widths.map((width) => ({ width: Math.max(4, Math.round((width / 256) * 10) / 10) }));
  const font = { name: "돋움", size: 11 };
  sheet.mergeCells(1, 1, 1, 7);
  const title = sheet.getCell(1, 1);
  title.value = layout.title;
  title.font = { name: "돋움", size: 24, bold: true };
  title.alignment = { vertical: "middle" };
  layout.intro.forEach((text, index) => {
    const rowNumber = index + 2;
    sheet.mergeCells(rowNumber, 1, rowNumber, 12);
    const cell = sheet.getCell(rowNumber, 1);
    cell.value = text;
    cell.font = font;
    cell.alignment = { wrapText: true, vertical: "middle" };
  });
  const border = { style: "thin" as const, color: { argb: "FF000000" } };
  const required = new Set(layout.required);
  layout.headers.forEach((text, index) => {
    const cell = sheet.getCell(6, index + 1);
    cell.value = text;
    cell.font = { ...font, bold: true };
    cell.numFmt = "@";
    cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: required.has(index) ? HEADER_FILL.required : HEADER_FILL.optional } };
    cell.border = { top: border, left: border, bottom: border, right: border };
  });
  layout.heights.forEach((height, index) => { sheet.getRow(index + 1).height = Math.round((height / 20) * 10) / 10; });
  rows.forEach((values, index) => {
    const row = sheet.getRow(HOMETAX_DATA_START_ROW + index);
    for (let column = 0; column < columns; column += 1) {
      const cell = row.getCell(column + 1);
      cell.value = values[column] ?? "";
      cell.numFmt = "@";
      cell.font = font;
    }
    row.height = 24;
  });
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function buildHometaxFile(month: string, kind: HometaxKind, part: number) {
  return guarded(async () => {
    if (!isMonthKey(month)) throw new DatabaseError("DATABASE_QUERY_FAILED", "신고할 달을 YYYY-MM 형식으로 골라 주세요.", 400);
    const data = await hometaxData(month);
    const problems = hometaxSupplierProblems(data.settings.supplier);
    if (problems.length > 0) throw new DatabaseError("DATABASE_QUERY_FAILED", `공급자(두고푸드) 정보를 먼저 채워 주세요: ${problems.join(", ")}`, 400);
    const invoices = kind === "taxable" ? data.taxable : data.exempt;
    const files = Math.max(1, Math.ceil(invoices.length / HOMETAX_MAX_ROWS));
    const index = Math.min(Math.max(1, Math.floor(part || 1)), files);
    const slice = invoices.slice((index - 1) * HOMETAX_MAX_ROWS, index * HOMETAX_MAX_ROWS);
    if (slice.length === 0) throw new DatabaseError("DATABASE_QUERY_FAILED", `${month} ${HOMETAX_KIND_LABELS[kind]}로 낼 판매가 없습니다.`, 404);
    const rows = slice.map((invoice) => hometaxRowCells(kind, invoice, data.settings.supplier, data.settings.receiptType));
    const bytes = await hometaxWorkbook(kind, rows);
    const label = kind === "taxable" ? "세금계산서_과세" : "계산서_면세";
    const filename = `홈택스_${label}_${month}${files > 1 ? `_${index}of${files}` : ""}.xlsx`;
    return { bytes, filename, count: slice.length };
  });
}

// ─── 공급사 정산(2026-11-25: 주 정산 지급 · 월 정산 지급 · 판매 수수료 청구) ─────────────────────────────
// 정산 방식은 services/supplier-settlement.ts(공급사마다 판매수수료/일반 도매, 수수료율, 지급 주기).
// - 주 정산: 판매 주(월~일) → 다음 주 월요일 지급, 기록 열쇠 "w:<월요일>"(지급 대기 → 지급 완료)
// - 월 정산: 1일~말일 → 다음 달 1~3일 지급, 열쇠 "YYYY-MM"(예전 월 정산 기록과 같음 — 예전 "정산 완료"는 지급 완료 + 수수료 확인)
// - 판매 수수료: 판매수수료 방식 공급사의 한 달 판매 대금 × 수수료율 → 다음 달 1~3일 공급사가 두고푸드에 입금,
//   열쇠 "fee:YYYY-MM"(청구 전 → 세금계산서 발행 → 수수료 입금 확인)
type SettlementListInput = { kind?: string | null; period?: string | null; month?: string | null };

function settlementKind(value: string | null | undefined): SettlementRecordKind {
  return value === "weekly" || value === "fee" ? value : "monthly";
}

export function defaultSettlementPeriod(kind: SettlementRecordKind, today = seoulDateKey()) {
  // 주 정산은 지난주 판매분(이번 주 월요일 지급), 월 정산·수수료는 지난달 판매분(이번 달 1~3일)을 먼저 보여 줍니다.
  if (kind === "weekly") return weekStartOf(addDays(today, -7));
  return nextMonthKey(today.slice(0, 7), -1);
}

function settlementWindow(kind: SettlementRecordKind, period: string) {
  if (kind === "weekly") {
    const payout = addDays(period, 7);
    return { start: period, end: addDays(period, 6), payoutStart: payout, payoutEnd: payout };
  }
  return { ...monthRange(period), ...feeDueRange(period) };
}

function belongsTo(kind: SettlementRecordKind, settings: SupplierSettlementSettings) {
  if (kind === "fee") return settings.type === "commission";
  return settings.cycle === kind;
}

async function settlementRowsFor(kind: SettlementRecordKind, period: string) {
  const window = settlementWindow(kind, period);
  const key = settlementRecordKey(kind, period);
  const [ledgers, directory, records] = await Promise.all([
    ledgerBySupplier(window.start, window.end),
    loadSettlementDirectory(),
    settlementRecords(kind === "fee" ? [key, period] : [key])
  ]);
  const savedNames = [...records.values()].filter((row) => row.month === key).map((row) => row.supplierName);
  const names = new Set<string>([...savedNames]);
  const otherCycle = { suppliers: 0, payoutAmount: 0 };
  for (const [name, ledger] of ledgers) {
    if (ledger.quantity <= 0) continue;
    const settings = directory.resolve(name);
    if (belongsTo(kind, settings)) names.add(name);
    else if (kind !== "fee") {
      otherCycle.suppliers += 1;
      otherCycle.payoutAmount += settlementAmounts(ledger, settings).payoutAmount;
    }
  }
  const rows = [...names].map((supplierName) => {
    const ledger = ledgers.get(supplierName) ?? emptyLedgerRow();
    const settings = directory.resolve(supplierName);
    const amounts = settlementAmounts(ledger, settings);
    const row = records.get(`${supplierName}|${key}`);
    const state = kind === "fee" ? feeState(row, records.get(`${supplierName}|${period}`)) : payoutState(row);
    const recorded = state && state.status !== "pending" ? { saleAmount: state.saleAmount, commission: state.commission, payoutAmount: state.payoutAmount } : null;
    return {
      supplierName,
      supplierId: settings.supplierId,
      registered: settings.registered,
      hasAccount: settings.hasAccount,
      type: settings.type,
      cycle: settings.cycle,
      commissionRate: settings.commissionRate,
      explicit: settings.explicit,
      saleAmount: ledger.saleAmount,
      returnAmount: ledger.returnAmount,
      netAmount: ledger.netAmount,
      costAmount: ledger.costAmount,
      costMissing: settings.type === "wholesale" ? ledger.costMissing : 0,
      quantity: ledger.netQuantity,
      orders: ledger.orders,
      goodsAmount: amounts.goodsAmount,
      shippingFee: amounts.shippingFee,
      payoutAmount: amounts.payoutAmount,
      commission: amounts.commission,
      netIncome: amounts.netIncome,
      doogoProfit: amounts.doogoProfit,
      status: state?.status ?? "pending",
      paidAt: state?.paidAt ?? null,
      doneAt: state?.doneAt ?? null,
      memo: state?.memo ?? null,
      updatedAt: state?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
      recorded,
      changedAfterRecord: Boolean(recorded && (kind === "fee" ? recorded.commission !== amounts.commission : recorded.payoutAmount !== amounts.payoutAmount))
    };
  });
  return { window, key, rows, otherCycle };
}

export async function listSupplierSettlements(input: SettlementListInput) {
  return guarded(async () => {
    const kind = settlementKind(input.kind);
    const period = input.period ?? input.month ?? defaultSettlementPeriod(kind);
    if (!isSettlementPeriod(kind, period)) {
      throw new DatabaseError("DATABASE_QUERY_FAILED", kind === "weekly" ? "정산할 주를 월요일 날짜(YYYY-MM-DD)로 골라 주세요." : "정산할 달을 YYYY-MM 형식으로 골라 주세요.", 400);
    }
    const { window, rows, otherCycle } = await settlementRowsFor(kind, period);
    const sorted = rows.sort((first, second) => (kind === "fee" ? second.commission - first.commission : second.payoutAmount - first.payoutAmount) || first.supplierName.localeCompare(second.supplierName, "ko"));
    const owed = (row: (typeof rows)[number]) => (kind === "fee" ? row.commission > 0 : row.payoutAmount > 0);
    const totals = sorted.reduce((sum, row) => ({
      netAmount: sum.netAmount + row.netAmount,
      goodsAmount: sum.goodsAmount + row.goodsAmount,
      shippingFee: sum.shippingFee + row.shippingFee,
      payoutAmount: sum.payoutAmount + row.payoutAmount,
      commission: sum.commission + row.commission,
      doogoProfit: sum.doogoProfit + row.doogoProfit,
      done: sum.done + (row.status === "done" ? 1 : 0),
      paid: sum.paid + (row.status === "paid" ? 1 : 0),
      pending: sum.pending + (row.status === "pending" && owed(row) ? 1 : 0)
    }), { netAmount: 0, goodsAmount: 0, shippingFee: 0, payoutAmount: 0, commission: 0, doogoProfit: 0, done: 0, paid: 0, pending: 0 });
    return {
      kind,
      period,
      month: kind === "weekly" ? period.slice(0, 7) : period,
      start: window.start,
      end: window.end,
      payoutFrom: window.payoutStart,
      payoutTo: window.payoutEnd,
      closed: window.end < seoulDateKey(),
      rows: sorted,
      totals,
      otherCycle,
      sync: await getSalesSyncState()
    };
  });
}

const PAYOUT_STATUSES: Record<SettlementRecordKind, SupplierSettlementStatus[]> = {
  weekly: ["pending", "paid"],
  // 예전 월 정산 기록의 "정산 완료"(지급 + 수수료 확인)도 그대로 받습니다.
  monthly: ["pending", "paid", "done"],
  fee: ["pending", "paid", "done"]
};

export async function updateSupplierSettlement(
  input: { supplierName: string; kind?: string | null; period?: string | null; month?: string | null; status: SupplierSettlementStatus; memo?: string | null },
  updatedBy: string | null
) {
  return guarded(async () => {
    const supplierName = cleanText(input.supplierName, 120);
    const kind = settlementKind(input.kind);
    const period = input.period ?? input.month ?? "";
    if (!supplierName || !isSettlementPeriod(kind, period)) throw new DatabaseError("DATABASE_QUERY_FAILED", "공급사와 정산 기간을 확인해 주세요.", 400);
    if (!PAYOUT_STATUSES[kind].includes(input.status)) throw new DatabaseError("DATABASE_QUERY_FAILED", "정산 상태가 올바르지 않습니다.", 400);
    const db = getDb();
    const window = settlementWindow(kind, period);
    const key = settlementRecordKey(kind, period);
    const [ledgers, directory, existingRows] = await Promise.all([
      ledgerBySupplier(window.start, window.end),
      loadSettlementDirectory(),
      db.select().from(supplierSettlements).where(and(eq(supplierSettlements.supplierName, supplierName), eq(supplierSettlements.month, key))).limit(1)
    ]);
    const settings = directory.resolve(supplierName);
    const amounts = settlementAmounts(ledgers.get(supplierName) ?? emptyLedgerRow(), settings);
    const existing = existingRows[0];
    const now = nowIso();
    const values = {
      status: input.status,
      saleAmount: amounts.goodsAmount,
      commissionRate: settings.type === "commission" ? settings.commissionRate : 0,
      commission: amounts.commission,
      payoutAmount: amounts.payoutAmount,
      // 지급(수수료는 세금계산서 발행) 시각은 처음 바꾼 때를 남기고, 대기로 되돌리면 지웁니다.
      paidAt: input.status === "pending" ? null : existing?.paidAt ?? now,
      doneAt: input.status === "done" ? existing?.doneAt ?? now : null,
      memo: input.memo === undefined ? existing?.memo ?? null : cleanText(input.memo, 500),
      updatedBy: updatedBy ? updatedBy.slice(0, 120) : null,
      updatedAt: now
    };
    if (existing) await db.update(supplierSettlements).set(values).where(eq(supplierSettlements.id, existing.id));
    else await db.insert(supplierSettlements).values({ id: randomUUID(), supplierName, month: key, createdAt: now, ...values });
    const saved = await db.select().from(supplierSettlements).where(and(eq(supplierSettlements.supplierName, supplierName), eq(supplierSettlements.month, key))).limit(1);
    return recordState(saved[0]);
  });
}

// ─── 두고푸드 수익 나눠 보기(2026-11-25 관리자 요청) ─────────────────────────────────────
// 판매 금액을 정산 방식별로 나눠 두고푸드 몫을 바로 계산합니다: 판매수수료 공급사 = 판매 금액 × 수수료율(예상 수수료),
// 일반 도매 공급사 = 판매 금액 − 원가(마진), 배송비 = 매출처가 낸 배송비 − 공급사에 줄 매입 배송비(100% 지급).
export type ProfitBreakdown = {
  commission: { amount: number; fee: number; suppliers: number; minRate: number | null; maxRate: number | null };
  wholesale: { amount: number; cost: number; margin: number; suppliers: number; costMissing: number };
  shipping: { received: number; paid: number; margin: number };
  unassigned: { amount: number; suppliers: number };
  profit: number;
};

export function profitBreakdown(ledgers: Map<string, LedgerRow>, directory: SettlementDirectory): ProfitBreakdown {
  const result: ProfitBreakdown = {
    commission: { amount: 0, fee: 0, suppliers: 0, minRate: null, maxRate: null },
    wholesale: { amount: 0, cost: 0, margin: 0, suppliers: 0, costMissing: 0 },
    shipping: { received: 0, paid: 0, margin: 0 },
    unassigned: { amount: 0, suppliers: 0 },
    profit: 0
  };
  for (const [name, ledger] of ledgers) {
    if (ledger.quantity <= 0 && ledger.shippingFee === 0 && ledger.shippingReceived === 0) continue;
    const settings = directory.resolve(name);
    const amounts = settlementAmounts(ledger, settings);
    if (!settings.registered) {
      result.unassigned.amount += ledger.netAmount;
      result.unassigned.suppliers += 1;
    }
    if (settings.type === "wholesale") {
      result.wholesale.amount += ledger.netAmount;
      result.wholesale.cost += ledger.costAmount;
      result.wholesale.margin += amounts.doogoProfit;
      result.wholesale.costMissing += ledger.costMissing;
      result.wholesale.suppliers += 1;
    } else {
      result.commission.amount += ledger.netAmount;
      result.commission.fee += amounts.commission;
      result.commission.suppliers += 1;
      result.commission.minRate = result.commission.minRate === null ? settings.commissionRate : Math.min(result.commission.minRate, settings.commissionRate);
      result.commission.maxRate = result.commission.maxRate === null ? settings.commissionRate : Math.max(result.commission.maxRate, settings.commissionRate);
    }
    result.shipping.received += ledger.shippingReceived;
    result.shipping.paid += ledger.shippingFee;
  }
  result.shipping.margin = result.shipping.received - result.shipping.paid;
  result.profit = result.commission.fee + result.wholesale.margin + result.shipping.margin;
  return result;
}
