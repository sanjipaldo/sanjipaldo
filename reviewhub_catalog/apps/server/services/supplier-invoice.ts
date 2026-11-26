// 공급사 거래명세서(정산 인보이스) 데이터와 공급사 입금 계좌(2026-11-26 관리자 요청).
// 관리자 공급사 정산 화면(주 정산 · 월 정산 · 매일 정산 탭)의 공급사 한 줄 → 그 기간 판매 줄 하나하나로 지급 합계가 어떻게 나왔는지 보여 줍니다.
// - 판매 줄: 발주오라 판매 줄(baljuora_sales_lines, 매출로 치는 상태만) 중 이 공급사(이름 앞뒤 빈칸 무시)·이 기간 판매일.
// - 일반 도매(매입): 단가 = 공급가(발주오라 매입원가 → 없으면 DB센터 원가). 두고푸드 판매가·판매 금액 칸은 읽지 않습니다(공급사에게 보내는 문서).
// - 판매수수료: 단가 = 판매 단가, 금액 = 판매 줄 금액(반품 뺌). 수수료는 빼지 않고 다음 달 1~3일에 따로 청구합니다.
// - 배송비 = 공급사 매입 배송비(100% 지급). 합계를 정산 장부(공급사 정산 화면과 같은 계산)와 맞춰 보고 다르면 알려 줍니다.
// - From = 세금계산서 신고 화면의 공급자(두고푸드) 정보, 비어 있으면 (주) 두고홀딩스 기본 정보. To = 공급사 관리 정보 + 입금 계좌.
// - 입금 계좌는 마이그레이션 없이 baljuora_sync_store "supplier_bank_accounts"(공급사 id별)에 둡니다. 로그에 계좌 값을 남기지 않습니다.
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import {
  BANK_ACCOUNT_STORE_KEY,
  DOOGO_COMPANY,
  INVOICE_MAX_LINES,
  formatBusinessNumber,
  invoiceNotes,
  invoiceNumber,
  invoiceWindow,
  parseBankAccount,
  type InvoiceKind,
  type InvoiceParty,
  type StoredBankAccount,
  type SupplierBankAccount,
  type SupplierInvoice,
  type SupplierInvoiceDay,
  type SupplierInvoiceLine
} from "@repo/shared/supplier-invoice";
import { isSettlementPeriod, seoulDateKey, settlementAmounts, settlementRecordKey, supplierCommission } from "@repo/shared/supplier-portal";
import { DatabaseError, getDb } from "../_core/db";
import { baljuoraSalesLines, baljuoraSyncStore, products, suppliers } from "../db/schema";
import { getHometaxSettings, isMissingSalesTable } from "./baljuora-sales";
import { loadSettlementDirectory, payoutState, revenueLines, settlementRecords, sumLedgers, supplierLedgerByDay } from "./supplier-settlement";

const UNNAMED_SUPPLIER = "(공급사 미지정)";

function fail(message: string, status = 400): never {
  throw new DatabaseError("DATABASE_QUERY_FAILED", message, status);
}

async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isMissingSalesTable(error)) fail("DB 업데이트(036 판매·매출처 표)가 아직 적용되지 않았습니다. 운영 배포 후 사용할 수 있어요.", 503);
    throw error;
  }
}

// ── 공급사 입금 계좌 ──────────────────────────────────────────────────────────

async function readBankStore(): Promise<Record<string, StoredBankAccount>> {
  const row = (await getDb().select({ value: baljuoraSyncStore.value }).from(baljuoraSyncStore).where(eq(baljuoraSyncStore.key, BANK_ACCOUNT_STORE_KEY)).limit(1))[0];
  if (!row) return {};
  try {
    const parsed = JSON.parse(row.value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, StoredBankAccount> : {};
  } catch {
    return {};
  }
}

async function writeBankStore(value: Record<string, StoredBankAccount>) {
  const text = JSON.stringify(value);
  const updatedAt = new Date().toISOString();
  await getDb().insert(baljuoraSyncStore).values({ key: BANK_ACCOUNT_STORE_KEY, value: text, updatedAt })
    .onConflictDoUpdate({ target: baljuoraSyncStore.key, set: { value: text, updatedAt } });
}

function bankOf(stored: StoredBankAccount | undefined): SupplierBankAccount | null {
  const { value } = parseBankAccount(stored);
  return value;
}

/** 공급사 입금 계좌 저장(세 칸을 모두 비우면 지움). 공급사 관리에 등록된 공급사만. */
export async function saveSupplierBankAccount(supplierId: string, input: unknown, updatedBy: string | null) {
  const supplier = (await getDb().select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, supplierId)).limit(1))[0];
  if (!supplier) fail("공급사를 찾지 못했어요. 공급사 관리에 먼저 등록해 주세요.", 404);
  const { value, error } = parseBankAccount(input);
  if (error) fail(error);
  const stored = await readBankStore();
  if (value) stored[supplierId] = { ...value, updatedAt: new Date().toISOString(), updatedBy: updatedBy ? updatedBy.slice(0, 120) : null };
  else delete stored[supplierId];
  await writeBankStore(stored);
  return value;
}

// ── 거래명세서 ────────────────────────────────────────────────────────────────

const L = baljuoraSalesLines;
// 공급가(일반 도매): 발주오라 매입원가 → 없거나 0원이면 DB센터 상품 원가 → 그래도 없으면 모름(null) — 정산 장부와 같은 규칙
const unitCost = sql<number | null>`coalesce(nullif(${L.unitCost}, 0), nullif(${products.costPrice}, 0))`;

function isoTime(value: string | null) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

async function invoiceLines(supplierName: string, start: string, end: string, wholesale: boolean): Promise<SupplierInvoiceLine[]> {
  const rows = await getDb().select({
    id: L.id,
    orderId: L.orderId,
    saleDate: L.saleDate,
    orderedAt: L.orderedAt,
    sellerName: L.sellerName,
    productCode: L.productCode,
    productName: L.productName,
    quantity: L.quantity,
    netQuantity: L.netQuantity,
    // 일반 도매는 공급가만 읽습니다(두고푸드 판매가·판매 금액은 읽지 않음).
    unit: wholesale ? unitCost : sql<number | null>`${L.unitPrice}`,
    lineAmount: wholesale ? sql<number | null>`null` : sql<number | null>`${L.amount}`,
    shippingFee: L.purchaseShippingFee
  }).from(L).leftJoin(products, eq(products.id, L.productId))
    .where(and(gte(L.saleDate, start), lte(L.saleDate, end), revenueLines(), sql`trim(coalesce(${L.supplierName}, '')) = ${supplierName}`))
    .orderBy(asc(L.saleDate), asc(L.orderedAt), asc(L.sellerName), asc(L.orderId), asc(L.id))
    .limit(INVOICE_MAX_LINES + 1);
  if (rows.length > INVOICE_MAX_LINES) {
    fail(`이 기간 판매 줄이 ${INVOICE_MAX_LINES.toLocaleString("ko-KR")}줄을 넘어 거래명세서 한 장에 담기 어려워요. 주 정산·매일 정산 기간으로 나눠 받아 주세요.`);
  }
  const lines: SupplierInvoiceLine[] = [];
  for (const row of rows) {
    const orderedQuantity = Number(row.quantity ?? 0);
    const quantity = Number(row.netQuantity ?? 0);
    const shippingFee = Number(row.shippingFee ?? 0);
    if (orderedQuantity <= 0 && quantity === 0 && shippingFee === 0) continue;
    const unitPrice = row.unit === null || row.unit === undefined ? null : Number(row.unit);
    const amount = wholesale ? (unitPrice ?? 0) * quantity : Number(row.lineAmount ?? (unitPrice ?? 0) * quantity);
    lines.push({
      id: row.id,
      date: row.saleDate,
      orderedAt: isoTime(row.orderedAt),
      orderId: row.orderId?.trim() || null,
      buyer: row.sellerName?.trim() || "(매출처 미지정)",
      productCode: row.productCode?.trim() || null,
      productName: row.productName,
      orderedQuantity,
      quantity,
      returnQuantity: Math.max(0, orderedQuantity - quantity),
      unitPrice,
      amount,
      shippingFee,
      total: amount + shippingFee,
      costMissing: wholesale && unitPrice === null && quantity > 0
    });
  }
  return lines;
}

function daySummaries(lines: SupplierInvoiceLine[]): SupplierInvoiceDay[] {
  const byDate = new Map<string, SupplierInvoiceDay & { orderKeys: Set<string> }>();
  for (const line of lines) {
    const day = byDate.get(line.date) ?? { date: line.date, lines: 0, orders: 0, quantity: 0, goodsAmount: 0, shippingFee: 0, total: 0, orderKeys: new Set<string>() };
    day.lines += 1;
    day.orderKeys.add(line.orderId ?? line.id);
    day.quantity += line.quantity;
    day.goodsAmount += line.amount;
    day.shippingFee += line.shippingFee;
    day.total += line.total;
    byDate.set(line.date, day);
  }
  return [...byDate.values()].sort((first, second) => first.date.localeCompare(second.date)).map(({ orderKeys, ...day }) => ({ ...day, orders: orderKeys.size }));
}

async function fromParty(): Promise<InvoiceParty> {
  const { supplier } = await getHometaxSettings();
  return {
    name: supplier.companyName || DOOGO_COMPANY.name,
    brand: DOOGO_COMPANY.brand,
    businessNumber: formatBusinessNumber(supplier.businessNumber) || DOOGO_COMPANY.businessNumber,
    ceoName: supplier.ceoName || DOOGO_COMPANY.ceoName,
    address: supplier.address || DOOGO_COMPANY.address,
    phone: DOOGO_COMPANY.phone,
    email: supplier.email || DOOGO_COMPANY.email,
    businessType: supplier.businessType,
    businessItem: supplier.businessItem,
    website: DOOGO_COMPANY.website
  };
}

/**
 * 공급사 거래명세서. kind = weekly(period = 판매 주 월요일) · monthly(YYYY-MM) · daily(판매일).
 * 줄 금액을 모두 더하면 공급사 정산 화면의 물품 대금·배송비·지급 합계와 같습니다.
 */
export async function getSupplierInvoice(input: { kind: InvoiceKind; period: string; supplier: string }): Promise<SupplierInvoice> {
  return guarded(async () => {
    const supplierName = input.supplier.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!supplierName || supplierName === UNNAMED_SUPPLIER) fail("공급사 이름이 있는 판매만 거래명세서를 만들 수 있어요.");
    if (!isSettlementPeriod(input.kind, input.period)) fail("정산 기간을 확인해 주세요.");
    const window = invoiceWindow(input.kind, input.period);
    const directory = await loadSettlementDirectory();
    const settings = directory.resolve(supplierName);
    const wholesale = settings.type === "wholesale";
    const key = settlementRecordKey(input.kind, input.period);
    const [lines, byDay, records, from, bankStore, profileRows] = await Promise.all([
      invoiceLines(supplierName, window.start, window.end, wholesale),
      supplierLedgerByDay(supplierName, window.start, window.end),
      settlementRecords([key], supplierName),
      fromParty(),
      readBankStore(),
      settings.supplierId
        ? getDb().select({ name: suppliers.name, businessNumber: suppliers.businessNumber, representative: suppliers.representative, phone: suppliers.phone, email: suppliers.email, address: suppliers.address }).from(suppliers).where(eq(suppliers.id, settings.supplierId)).limit(1)
        : Promise.resolve([])
    ]);
    const profile = profileRows[0];
    const registered = Boolean(settings.registered && profile);
    const bank = settings.supplierId ? bankOf(bankStore[settings.supplierId]) : null;
    const days = daySummaries(lines);
    const orderKeys = new Set(lines.map((line) => line.orderId ?? line.id));
    const totals = lines.reduce((sum, line) => ({
      ...sum,
      goodsAmount: sum.goodsAmount + line.amount,
      shippingFee: sum.shippingFee + line.shippingFee,
      total: sum.total + line.total,
      quantity: sum.quantity + line.quantity,
      returnQuantity: sum.returnQuantity + line.returnQuantity,
      costMissing: sum.costMissing + (line.costMissing ? 1 : 0)
    }), { goodsAmount: 0, shippingFee: 0, total: 0, quantity: 0, returnQuantity: 0, orders: orderKeys.size, lines: lines.length, costMissing: 0 });
    const amounts = settlementAmounts(sumLedgers(byDay.values()), settings);
    const matches = amounts.goodsAmount === totals.goodsAmount && amounts.shippingFee === totals.shippingFee;
    const state = payoutState(records.get(`${supplierName}|${key}`));
    const to = {
      name: profile?.name ?? supplierName,
      brand: "",
      businessNumber: formatBusinessNumber(profile?.businessNumber),
      ceoName: profile?.representative?.trim() ?? "",
      address: profile?.address?.trim() ?? "",
      phone: profile?.phone?.trim() ?? "",
      email: profile?.email?.trim() ?? "",
      businessType: "",
      businessItem: "",
      website: "",
      supplierId: settings.supplierId,
      registered
    };
    const warnings: string[] = [];
    if (lines.length === 0) warnings.push("이 기간에는 판매가 없어요.");
    if (!registered) warnings.push("공급사 관리에 없는 이름이에요. 공급사로 등록하면 사업자 정보와 입금 계좌를 넣을 수 있어요.");
    else {
      if (!to.businessNumber) warnings.push("공급사 사업자등록번호가 비어 있어요. 공급사 관리에서 넣어 주세요.");
      if (!bank) warnings.push("공급사 입금 계좌가 없어요. 아래 '입금 계좌'에서 넣어 주세요.");
    }
    if (totals.costMissing > 0) warnings.push(`공급가(원가)를 모르는 줄 ${totals.costMissing}개는 0원으로 셌어요. 상품 원가를 채운 뒤 다시 받아 주세요.`);
    if (!matches) warnings.push("정산 화면 금액과 줄 합계가 달라요. 화면을 새로 고친 뒤 다시 열어 주세요.");
    const base = { kind: input.kind, period: input.period, ...window, settings: { type: settings.type, commissionRate: settings.commissionRate, cycle: settings.cycle } };
    return {
      number: invoiceNumber(input.kind, input.period, supplierName),
      issueDate: seoulDateKey(),
      ...base,
      supplierName,
      status: state?.status ?? "pending",
      paidAt: state?.status && state.status !== "pending" ? state.paidAt : null,
      from,
      to,
      bank,
      lines,
      days,
      totals,
      settlement: { goodsAmount: amounts.goodsAmount, shippingFee: amounts.shippingFee, payoutAmount: amounts.payoutAmount, matches },
      commission: settings.type === "commission" ? { rate: settings.commissionRate, amount: supplierCommission(totals.goodsAmount, settings.commissionRate) } : null,
      warnings,
      notes: invoiceNotes(base)
    };
  });
}
