// 공급사 정산 방식·정산 장부(2026-11-25 관리자 요청 "정산 시스템 2가지: 판매수수료 / 일반 도매").
// - 공급사마다 정산 방식(판매수수료 n% · 일반 도매(매입))과 지급 주기(주 정산 · 월 정산 · 매일 정산)를 둡니다. 저장은 마이그레이션 없이
//   baljuora_sync_store "supplier_settlement_settings" = { [공급사 id]: { type, commissionRate, cycle, updatedAt, updatedBy } }.
//   저장한 적 없는 공급사는 공급사 센터 계정의 수수료율·주기(없으면 10% · 주 정산)와 판매수수료 방식으로 봅니다.
//   설정을 저장하면 공급사 센터 계정(있으면)의 수수료율·주기도 같은 값으로 맞춥니다.
// - 정산 장부는 발주오라 판매 줄(baljuora_sales_lines, 매출로 치는 상태만)을 공급사·날짜·상품별로 모읍니다:
//   판매·반품(두고푸드 공급가), 원가(발주오라 매입원가, 없으면 DB센터 원가) × 수량, 매입 배송비(100% 공급사 지급), 매출처가 낸 배송비.
// - 정산 기록(지급·수수료 상태)은 supplier_settlements에 기간 열쇠로 적습니다(주 정산 "w:<월요일>", 월 정산 "YYYY-MM", 매일 정산 "d:<판매일>",
//   수수료 "fee:YYYY-MM").
import { and, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { SALES_EXCLUDED_STATUSES } from "@repo/shared/baljuora-sales";
import {
  DEFAULT_SETTLEMENT_SETTINGS,
  DEFAULT_SUPPLIER_COMMISSION_RATE,
  SUPPLIER_SETTLEMENT_STATUSES,
  cleanSettlementSettings,
  emptyLedger,
  settlementCycleOf,
  settlementRecordKey,
  type SettlementLedger,
  type SettlementRecordKind,
  type SupplierSettlementCycle,
  type SupplierSettlementSettings,
  type SupplierSettlementState,
  type SupplierSettlementType,
  type FeeInvoiceState,
  type SupplierSettlementStatus
} from "@repo/shared/supplier-portal";
import { DatabaseError, getDb } from "../_core/db";
import { baljuoraSalesLines, baljuoraSyncStore, products, supplierAccounts, supplierSettlements, suppliers } from "../db/schema";

export const SETTLEMENT_SETTINGS_KEY = "supplier_settlement_settings";

type StoredSettlement = SupplierSettlementSettings & { updatedAt: string; updatedBy: string | null };

export type EffectiveSettlement = SupplierSettlementSettings & {
  supplierId: string | null;
  supplierName: string;
  registered: boolean; // DB센터 공급사 목록에 있는 이름인지
  explicit: boolean; // 정산 방식을 직접 저장했는지(아니면 계정 값·기본값)
  hasAccount: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

function fail(message: string, status = 400): never {
  throw new DatabaseError("DATABASE_QUERY_FAILED", message, status);
}

function isMissingTable(error: unknown, name: string) {
  const texts = [error instanceof Error ? error.message : String(error), (error as { cause?: { message?: string } })?.cause?.message ?? ""];
  return texts.some((text) => text.includes("no such table") && text.includes(name));
}

async function readStore(): Promise<Record<string, StoredSettlement>> {
  try {
    const row = (await getDb().select({ value: baljuoraSyncStore.value }).from(baljuoraSyncStore).where(eq(baljuoraSyncStore.key, SETTLEMENT_SETTINGS_KEY)).limit(1))[0];
    if (!row) return {};
    const parsed = JSON.parse(row.value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, StoredSettlement> : {};
  } catch (error) {
    if (isMissingTable(error, "baljuora_sync_store") || error instanceof SyntaxError) return {};
    throw error;
  }
}

async function writeStore(value: Record<string, StoredSettlement>) {
  const text = JSON.stringify(value);
  const now = new Date().toISOString();
  await getDb().insert(baljuoraSyncStore).values({ key: SETTLEMENT_SETTINGS_KEY, value: text, updatedAt: now })
    .onConflictDoUpdate({ target: baljuoraSyncStore.key, set: { value: text, updatedAt: now } });
}

async function accountRows() {
  try {
    return await getDb().select({ supplierId: supplierAccounts.supplierId, commissionRate: supplierAccounts.commissionRate, settlementCycle: supplierAccounts.settlementCycle }).from(supplierAccounts);
  } catch (error) {
    if (isMissingTable(error, "supplier_accounts")) return [];
    throw error;
  }
}

export type SettlementDirectory = {
  byId: Map<string, EffectiveSettlement>;
  byName: Map<string, EffectiveSettlement>;
  /** 판매 줄의 공급사 이름 → 정산 방식(공급사 목록에 없는 이름·이름 없음은 기본값) */
  resolve: (supplierName: string | null | undefined) => EffectiveSettlement;
};

/** 모든 공급사의 정산 방식(저장한 값 → 공급사 센터 계정 값 → 기본값 판매수수료 10% · 주 정산) */
export async function loadSettlementDirectory(): Promise<SettlementDirectory> {
  const [stored, supplierRows, accounts] = await Promise.all([
    readStore(),
    getDb().select({ id: suppliers.id, name: suppliers.name }).from(suppliers),
    accountRows()
  ]);
  const accountById = new Map(accounts.map((row) => [row.supplierId, row]));
  const byId = new Map<string, EffectiveSettlement>();
  const byName = new Map<string, EffectiveSettlement>();
  for (const supplier of supplierRows) {
    const account = accountById.get(supplier.id);
    const base: SupplierSettlementSettings = {
      type: DEFAULT_SETTLEMENT_SETTINGS.type,
      commissionRate: account?.commissionRate ?? DEFAULT_SUPPLIER_COMMISSION_RATE,
      cycle: account ? settlementCycleOf(account.settlementCycle, "monthly") : DEFAULT_SETTLEMENT_SETTINGS.cycle
    };
    const saved = stored[supplier.id];
    const clean = saved ? cleanSettlementSettings(saved, base) : null;
    const effective: EffectiveSettlement = {
      ...(clean ?? base),
      supplierId: supplier.id,
      supplierName: supplier.name,
      registered: true,
      explicit: Boolean(clean),
      hasAccount: Boolean(account),
      updatedAt: clean ? saved.updatedAt ?? null : null,
      updatedBy: clean ? saved.updatedBy ?? null : null
    };
    byId.set(supplier.id, effective);
    byName.set(supplier.name, effective);
    byName.set(supplier.name.trim(), effective);
  }
  const resolve = (supplierName: string | null | undefined): EffectiveSettlement => {
    const name = String(supplierName ?? "").trim();
    return byName.get(name) ?? {
      ...DEFAULT_SETTLEMENT_SETTINGS,
      supplierId: null,
      supplierName: name || "(공급사 미지정)",
      registered: false,
      explicit: false,
      hasAccount: false,
      updatedAt: null,
      updatedBy: null
    };
  };
  return { byId, byName, resolve };
}

export async function effectiveSettlementFor(supplierId: string) {
  const directory = await loadSettlementDirectory();
  const found = directory.byId.get(supplierId);
  if (!found) fail("공급사를 찾을 수 없어요.", 404);
  return found;
}

/** 관리자: 공급사 정산 방식 저장(계정이 있으면 계정 수수료율·주기도 같게) */
export async function saveSupplierSettlementSettings(supplierId: string, input: unknown, updatedBy: string | null) {
  const current = await effectiveSettlementFor(supplierId);
  const next = cleanSettlementSettings(input, current);
  if (!next) fail("정산 방식·수수료율(0~100%)·지급 주기를 확인해 주세요.");
  const stored = await readStore();
  stored[supplierId] = { ...next, updatedAt: new Date().toISOString(), updatedBy: updatedBy ? updatedBy.slice(0, 120) : null };
  await writeStore(stored);
  if (current.hasAccount) {
    await getDb().update(supplierAccounts)
      .set({ commissionRate: next.commissionRate, settlementCycle: next.cycle, updatedAt: new Date().toISOString() })
      .where(eq(supplierAccounts.supplierId, supplierId));
  }
  console.info(`[supplier-settlement] ${supplierId.slice(0, 8)} → ${next.type} ${next.commissionRate}% ${next.cycle}`);
  return effectiveSettlementFor(supplierId);
}

/** 공급사 센터 계정 화면에서 수수료율·주기만 바꿨을 때 저장한 정산 방식에도 같은 값을 적습니다(방식은 그대로). */
export async function syncStoredSettlementFromAccount(supplierId: string, input: { commissionRate?: number | null; settlementCycle?: SupplierSettlementCycle }) {
  const stored = await readStore();
  const saved = stored[supplierId];
  if (!saved) return;
  const next = cleanSettlementSettings({ type: saved.type, commissionRate: input.commissionRate ?? saved.commissionRate, cycle: input.settlementCycle ?? saved.cycle }, saved);
  if (!next) return;
  stored[supplierId] = { ...saved, ...next, updatedAt: new Date().toISOString() };
  await writeStore(stored);
}

// ── 정산 장부(판매 줄 모으기) ────────────────────────────────────────────────

const L = baljuoraSalesLines;
// 원가: 발주오라 매입원가(주문 때 값) → 없거나 0원이면 DB센터 상품 원가 → 그래도 없으면 모름(null)
const unitCost = sql`coalesce(nullif(${L.unitCost}, 0), nullif(${products.costPrice}, 0))`;

export const revenueLines = (): SQL => sql`(${L.status} IS NULL OR lower(${L.status}) NOT IN (${sql.join(SALES_EXCLUDED_STATUSES.map((status) => sql`${status}`), sql`, `)}))`;

const ledgerColumns = {
  saleAmount: sql<number>`coalesce(sum(${L.quantity} * ${L.unitPrice}), 0)`,
  returnAmount: sql<number>`coalesce(sum((${L.quantity} - ${L.netQuantity}) * ${L.unitPrice}), 0)`,
  netAmount: sql<number>`coalesce(sum(${L.amount}), 0)`,
  costAmount: sql<number>`coalesce(sum(${L.netQuantity} * coalesce(${unitCost}, 0)), 0)`,
  costReturnAmount: sql<number>`coalesce(sum((${L.quantity} - ${L.netQuantity}) * coalesce(${unitCost}, 0)), 0)`,
  costMissing: sql<number>`coalesce(sum(case when ${unitCost} is null and ${L.netQuantity} > 0 then 1 else 0 end), 0)`,
  shippingFee: sql<number>`coalesce(sum(${L.purchaseShippingFee}), 0)`,
  shippingReceived: sql<number>`coalesce(sum(${L.salesShippingFee}), 0)`,
  quantity: sql<number>`coalesce(sum(${L.quantity}), 0)`,
  netQuantity: sql<number>`coalesce(sum(${L.netQuantity}), 0)`,
  orders: sql<number>`count(distinct coalesce(${L.orderId}, ${L.id}))`
};

export type LedgerRow = SettlementLedger & { quantity: number; netQuantity: number; returnQuantity: number; orders: number };

function toLedger(row: Record<keyof typeof ledgerColumns, unknown>): LedgerRow {
  const quantity = Number(row.quantity ?? 0);
  const netQuantity = Number(row.netQuantity ?? 0);
  return {
    saleAmount: Number(row.saleAmount ?? 0),
    returnAmount: Number(row.returnAmount ?? 0),
    netAmount: Number(row.netAmount ?? 0),
    costAmount: Number(row.costAmount ?? 0),
    costReturnAmount: Number(row.costReturnAmount ?? 0),
    costMissing: Number(row.costMissing ?? 0),
    shippingFee: Number(row.shippingFee ?? 0),
    shippingReceived: Number(row.shippingReceived ?? 0),
    quantity,
    netQuantity,
    returnQuantity: Math.max(0, quantity - netQuantity),
    orders: Number(row.orders ?? 0)
  };
}

export function emptyLedgerRow(): LedgerRow {
  return { ...emptyLedger(), quantity: 0, netQuantity: 0, returnQuantity: 0, orders: 0 };
}

function inRange(start: string, end: string, supplierName?: string) {
  const conditions: SQL[] = [gte(L.saleDate, start), lte(L.saleDate, end), revenueLines()];
  if (supplierName !== undefined) conditions.push(sql`trim(coalesce(${L.supplierName}, '')) = ${supplierName.trim()}`);
  return and(...conditions);
}

/** 한 공급사의 날짜별 장부 */
export async function supplierLedgerByDay(supplierName: string, start: string, end: string) {
  const rows = await getDb().select({ date: L.saleDate, ...ledgerColumns })
    .from(L).leftJoin(products, eq(products.id, L.productId))
    .where(inRange(start, end, supplierName))
    .groupBy(L.saleDate);
  return new Map(rows.map((row) => [row.date, toLedger(row)]));
}

/** 한 공급사의 상품별 장부(썸네일 포함, 큰 순서) */
export async function supplierLedgerByProduct(supplierName: string, start: string, end: string) {
  const key = sql<string>`coalesce(${L.productId}, 'bj:' || ${L.baljuoraProductId}, 'name:' || ${L.productName})`;
  const rows = await getDb().select({
    key,
    productId: sql<string | null>`max(${L.productId})`,
    productCode: sql<string | null>`max(${L.productCode})`,
    productName: sql<string>`max(${L.productName})`,
    imageUrl: sql<string | null>`max(${products.imageUrl})`,
    ...ledgerColumns
  }).from(L).leftJoin(products, eq(products.id, L.productId))
    .where(inRange(start, end, supplierName))
    .groupBy(key);
  return rows.map((row) => ({
    key: row.key,
    productId: row.productId && !row.productId.startsWith("bj:") ? row.productId : null,
    productCode: row.productCode,
    productName: row.productName,
    imageUrl: row.imageUrl ?? null,
    ...toLedger(row)
  }));
}

/** 하루 세부내역 한 줄: 같은 상품·같은 단가끼리 모은 판매(공급사 센터 '세부내역 보기') */
export type SupplierDayLine = {
  key: string;
  productId: string | null;
  productCode: string | null;
  productName: string;
  imageUrl: string | null;
  unitPrice: number | null; // 일반 도매 = 공급가(원가, 모르면 null), 판매수수료 = 판매 단가
  quantity: number;
  netQuantity: number;
  returnQuantity: number;
  saleAmount: number; // 단가 × 판매 수량
  returnAmount: number; // 단가 × 반품 수량
  netAmount: number; // 반품 뺀 금액(날짜 카드 '공급 금액(반품 뺌)'·'순매출'과 같은 계산)
  shippingFee: number; // 공급사 매입 배송비(100% 지급)
  orders: number;
  costMissing: boolean; // 일반 도매인데 공급가(원가)를 모르는 줄
};

/**
 * 한 공급사의 하루 판매를 상품·단가별로 모읍니다(2026-11-26 관리자 요청: 판매·정산 달력 날짜 '세부내역 보기').
 * - 일반 도매: 공급가(원가)로만 묶고 계산합니다. 두고푸드 판매가·판매 금액 칸은 읽지도 않습니다(공급사에게 보내지 않음).
 * - 판매수수료: 판매 단가(두고푸드 공급가)로 묶고, 반품 뺀 금액은 장부와 같이 판매 줄 금액을 더합니다.
 * 같은 상품이라도 날마다 원가·단가가 다를 수 있어 상품 + 단가로 나눕니다. 줄을 모두 더하면 같은 날 장부(supplierLedgerByDay) 금액과 같습니다.
 */
export async function supplierDayLines(supplierName: string, date: string, type: SupplierSettlementType): Promise<SupplierDayLine[]> {
  const wholesale = type === "wholesale";
  const key = sql<string>`coalesce(${L.productId}, 'bj:' || ${L.baljuoraProductId}, 'name:' || ${L.productName})`;
  const unit = wholesale ? sql<number | null>`${unitCost}` : sql<number | null>`${L.unitPrice}`;
  const rows = await getDb().select({
    key,
    unit,
    productId: sql<string | null>`max(${L.productId})`,
    productCode: sql<string | null>`max(${L.productCode})`,
    productName: sql<string>`max(${L.productName})`,
    imageUrl: sql<string | null>`max(${products.imageUrl})`,
    quantity: sql<number>`coalesce(sum(${L.quantity}), 0)`,
    netQuantity: sql<number>`coalesce(sum(${L.netQuantity}), 0)`,
    // 판매 줄 금액은 두고푸드 판매가 기준이라 판매수수료 방식에서만 더합니다.
    lineAmount: wholesale ? sql<number>`0` : sql<number>`coalesce(sum(${L.amount}), 0)`,
    shippingFee: sql<number>`coalesce(sum(${L.purchaseShippingFee}), 0)`,
    orders: sql<number>`count(distinct coalesce(${L.orderId}, ${L.id}))`
  }).from(L).leftJoin(products, eq(products.id, L.productId))
    .where(inRange(date, date, supplierName))
    .groupBy(key, unit);
  return rows.map((row) => {
    const quantity = Number(row.quantity ?? 0);
    const netQuantity = Number(row.netQuantity ?? 0);
    const returnQuantity = Math.max(0, quantity - netQuantity);
    const unitPrice = row.unit === null || row.unit === undefined ? null : Number(row.unit);
    const price = unitPrice ?? 0;
    return {
      key: `${row.key}|${unitPrice ?? "-"}`,
      productId: row.productId && !row.productId.startsWith("bj:") ? row.productId : null,
      productCode: row.productCode,
      productName: row.productName,
      imageUrl: row.imageUrl ?? null,
      unitPrice,
      quantity,
      netQuantity,
      returnQuantity,
      saleAmount: price * quantity,
      returnAmount: price * returnQuantity,
      netAmount: wholesale ? price * netQuantity : Number(row.lineAmount ?? 0),
      shippingFee: Number(row.shippingFee ?? 0),
      orders: Number(row.orders ?? 0),
      costMissing: wholesale && unitPrice === null && netQuantity > 0
    };
  }).sort((first, second) => second.netAmount - first.netAmount || second.quantity - first.quantity || first.productName.localeCompare(second.productName, "ko"));
}

/** 공급사별 장부(이름 없는 판매는 "(공급사 미지정)") */
export async function ledgerBySupplier(start: string, end: string) {
  const name = sql<string>`coalesce(nullif(trim(${L.supplierName}), ''), '(공급사 미지정)')`;
  const rows = await getDb().select({ supplierName: name, ...ledgerColumns })
    .from(L).leftJoin(products, eq(products.id, L.productId))
    .where(inRange(start, end))
    .groupBy(name);
  return new Map(rows.map((row) => [row.supplierName, toLedger(row)]));
}

/** 공급사·날짜별 장부(주 정산 목록용) */
export async function ledgerBySupplierDay(start: string, end: string) {
  const name = sql<string>`coalesce(nullif(trim(${L.supplierName}), ''), '(공급사 미지정)')`;
  const rows = await getDb().select({ supplierName: name, date: L.saleDate, ...ledgerColumns })
    .from(L).leftJoin(products, eq(products.id, L.productId))
    .where(inRange(start, end))
    .groupBy(name, L.saleDate);
  return rows.map((row) => ({ supplierName: row.supplierName, date: row.date, ...toLedger(row) }));
}

export function sumLedgers(rows: Iterable<LedgerRow>) {
  const total = emptyLedgerRow();
  for (const row of rows) {
    total.saleAmount += row.saleAmount;
    total.returnAmount += row.returnAmount;
    total.netAmount += row.netAmount;
    total.costAmount += row.costAmount;
    total.costReturnAmount += row.costReturnAmount;
    total.costMissing += row.costMissing;
    total.shippingFee += row.shippingFee;
    total.shippingReceived += row.shippingReceived;
    total.quantity += row.quantity;
    total.netQuantity += row.netQuantity;
    total.returnQuantity += row.returnQuantity;
    total.orders += row.orders;
  }
  return total;
}

/** 날짜별 장부에서 start~end만 더하기 */
export function ledgerBetween(byDay: Map<string, LedgerRow>, start: string, end: string) {
  return sumLedgers([...byDay.entries()].filter(([date]) => date >= start && date <= end).map(([, row]) => row));
}

// ── 정산 기록(지급·수수료 상태) ──────────────────────────────────────────────

export type SettlementRecord = typeof supplierSettlements.$inferSelect;

export function recordState(row: SettlementRecord | undefined): SupplierSettlementState | null {
  if (!row) return null;
  return {
    month: row.month,
    status: SUPPLIER_SETTLEMENT_STATUSES.includes(row.status as SupplierSettlementStatus) ? row.status as SupplierSettlementStatus : "pending",
    saleAmount: row.saleAmount,
    commission: row.commission,
    payoutAmount: row.payoutAmount,
    commissionRate: row.commissionRate,
    paidAt: row.paidAt,
    doneAt: row.doneAt,
    memo: row.memo,
    updatedAt: row.updatedAt
  };
}

/** 기록 열쇠들로 읽기(표가 없으면 빈 값 — 운영 배포 전 미리보기) */
export async function settlementRecords(keys: string[], supplierName?: string) {
  const wanted = [...new Set(keys.filter(Boolean))];
  const result = new Map<string, SettlementRecord>();
  if (wanted.length === 0) return result;
  try {
    const conditions = [inArray(supplierSettlements.month, wanted)];
    if (supplierName !== undefined) conditions.push(eq(supplierSettlements.supplierName, supplierName));
    const rows = await getDb().select().from(supplierSettlements).where(and(...conditions));
    for (const row of rows) result.set(`${row.supplierName}|${row.month}`, row);
  } catch (error) {
    if (!isMissingTable(error, "supplier_settlements")) throw error;
  }
  return result;
}

/** 판매 수수료 세금계산서(두고푸드 → 공급사) 발행 기록("inv:YYYY-MM", 발행하면 status "done") */
export function invoiceState(row: SettlementRecord | undefined): FeeInvoiceState {
  if (!row || row.status !== "done") return { issued: false, issuedAt: null, amount: null };
  return { issued: true, issuedAt: row.doneAt ?? row.updatedAt ?? null, amount: row.commission };
}

/** 공급사 세금계산서 정보(공급받는자): 공급사 관리의 매입처명·사업자등록번호·대표자·주소·이메일 */
export type SupplierTaxProfile = { id: string; name: string; businessNumber: string; representative: string; address: string; email: string };

export async function supplierTaxProfiles() {
  const rows = await getDb().select({ id: suppliers.id, name: suppliers.name, businessNumber: suppliers.businessNumber, representative: suppliers.representative, address: suppliers.address, email: suppliers.email }).from(suppliers);
  const byId = new Map<string, SupplierTaxProfile>();
  for (const row of rows) {
    byId.set(row.id, { id: row.id, name: row.name, businessNumber: row.businessNumber ?? "", representative: row.representative ?? "", address: row.address ?? "", email: row.email ?? "" });
  }
  return byId;
}

/** 지급 상태: 예전 월 정산 기록의 "정산 완료"도 지급 완료로 봅니다. */
export function payoutState(row: SettlementRecord | undefined) {
  return recordState(row);
}

/** 판매 수수료 상태: 수수료 기록이 없고 예전 월 정산 기록이 "정산 완료"면 수수료도 확인된 것으로 봅니다. */
export function feeState(feeRow: SettlementRecord | undefined, legacyMonthRow: SettlementRecord | undefined): SupplierSettlementState | null {
  if (feeRow) return recordState(feeRow);
  if (legacyMonthRow?.status === "done") return recordState(legacyMonthRow);
  return null;
}

export function recordKeysFor(kind: SettlementRecordKind, periods: string[]) {
  return periods.map((period) => settlementRecordKey(kind, period));
}
