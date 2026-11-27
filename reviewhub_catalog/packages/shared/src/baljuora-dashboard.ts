/**
 * 발주오라 대시보드 숫자와 DB센터 판매 숫자 맞추기(2026-11-27 관리자 신고 "주문 동기화를 최신으로 했는데 나도건강 금액이 발주오라 대시보드와
 * 다르다 — 발주오라 102건 4,257,500 · DB센터 110건 385만원. 주문 동기화를 누르면 대시보드의 최근 7일 주문 현황·기간별 매출·매출처 TOP 5·
 * 상품별 매출까지 다 가져와 똑같이").
 *
 * 발주오라 대시보드는 '주문일자 기준 · 배송비 포함'으로 세고(화면 글자), DB센터는 배송비를 빼고 주문(orderId) 수를 셌습니다.
 * 책갈피(1.11.0)가 주문 동기화 때 발주오라 대시보드와 같은 API(statistics/…)를 읽어 보내면, 서버가
 *  ① 그 숫자를 그대로 보여 주고(아래 parse…) ② DB센터가 주문 줄로 계산하는 기준(SalesBasis)을 발주오라 숫자와 가장 많이 맞는 것으로 고릅니다
 *     (calibrateSalesBasis — 발주오라 응답 칸 이름·계산법이 공개되지 않아, 가능한 기준을 모두 계산해 맞춰 봄).
 */
import { addDays, monthRange, nextMonthKey } from "./supplier-portal";

// ─── DB센터 계산 기준 ─────────────────────────────────────────────────────────

export type SalesBasis = {
  // 주문대기(입금 전) 줄도 매출로 셀지
  pending: boolean;
  // net = 남은 수량이 있는 줄만(전량 취소·반품 처리된 줄은 뺌) · all = 매출 상태 줄 모두
  lines: "net" | "all";
  // 주문건 = 주문 상품 줄 수(lines) 또는 주문(orderId) 수(orders)
  count: "lines" | "orders";
  // 금액 = 공급가 × 남은 수량 + 매출 배송비(netShip) · 공급가 × 남은 수량(net) · 공급가 × 주문 수량 + 매출 배송비(grossShip)
  amount: "netShip" | "net" | "grossShip";
};

// 발주오라 대시보드 글자('주문일자기준 · 배송비 포함')와 같게: 배송비 포함 · 주문 상품 줄 · 전량 취소·반품 줄 뺌
export const DEFAULT_SALES_BASIS: SalesBasis = { pending: false, lines: "net", count: "lines", amount: "netShip" };
// 2026-11-27 전 DB센터 계산(배송비 뺌 · 주문 수 · 남은 수량 0인 줄의 주문도 셈)
export const LEGACY_SALES_BASIS: SalesBasis = { pending: false, lines: "all", count: "orders", amount: "net" };

export function sameBasis(first: SalesBasis, second: SalesBasis) {
  return first.pending === second.pending && first.lines === second.lines && first.count === second.count && first.amount === second.amount;
}

/** 맞춰 볼 기준 전부(기본 기준이 맨 앞 — 점수가 같으면 앞의 것) */
export function salesBasisCandidates(): SalesBasis[] {
  const list: SalesBasis[] = [DEFAULT_SALES_BASIS];
  for (const pending of [false, true]) {
    for (const lines of ["net", "all"] as const) {
      for (const count of ["lines", "orders"] as const) {
        for (const amount of ["netShip", "net", "grossShip"] as const) {
          const basis = { pending, lines, count, amount };
          if (!list.some((item) => sameBasis(item, basis))) list.push(basis);
        }
      }
    }
  }
  return list;
}

export function cleanSalesBasis(value: unknown): SalesBasis | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.pending !== "boolean") return null;
  if (record.lines !== "net" && record.lines !== "all") return null;
  if (record.count !== "lines" && record.count !== "orders") return null;
  if (record.amount !== "netShip" && record.amount !== "net" && record.amount !== "grossShip") return null;
  return { pending: record.pending, lines: record.lines, count: record.count, amount: record.amount };
}

/** 화면에 보여 줄 기준 설명 */
export function describeSalesBasis(basis: SalesBasis) {
  return [
    basis.amount === "net" ? "배송비 뺌" : "배송비 포함",
    basis.count === "lines" ? "주문 상품 줄 수" : "주문 수",
    basis.lines === "net" ? "전량 취소·반품 줄 뺌" : "취소 처리 줄 포함",
    basis.pending ? "주문대기 포함" : "주문대기 뺌"
  ].join(" · ");
}

// 계산에 쓰는 주문 줄(baljuora_sales_lines 일부 칸)
export type DashboardSalesLine = {
  id: string;
  orderId: string | null;
  saleDate: string;
  status: string | null;
  sellerName: string | null;
  productName: string;
  quantity: number;
  netQuantity: number;
  unitPrice: number;
  amount: number;
  costAmount: number | null;
  salesShippingFee: number;
  purchaseShippingFee: number;
};

const ALWAYS_EXCLUDED = ["deleted", "cancelled", "canceled"];

/** 이 줄이 매출·주문건에 들어가는지 */
export function lineCounts(line: Pick<DashboardSalesLine, "status" | "netQuantity">, basis: SalesBasis) {
  const status = String(line.status ?? "").trim().toLowerCase();
  if (ALWAYS_EXCLUDED.includes(status)) return false;
  if (status === "pending" && !basis.pending) return false;
  if (basis.lines === "net" && !(line.netQuantity > 0)) return false;
  return true;
}

export function lineSalesAmount(line: Pick<DashboardSalesLine, "amount" | "quantity" | "unitPrice" | "salesShippingFee">, basis: SalesBasis) {
  if (basis.amount === "net") return line.amount;
  if (basis.amount === "grossShip") return line.quantity * line.unitPrice + line.salesShippingFee;
  return line.amount + line.salesShippingFee;
}

/** 매입 = 매입원가 × 남은 수량 + 매입 배송비 */
export function linePurchaseAmount(line: Pick<DashboardSalesLine, "costAmount" | "purchaseShippingFee">) {
  return (line.costAmount ?? 0) + line.purchaseShippingFee;
}

export type DashboardPeriodKey = "today" | "yesterday" | "thisMonth" | "lastMonth";
export type DashboardRange = { key: DashboardPeriodKey; label: string; from: string; to: string };
export const DASHBOARD_PERIOD_LABELS: Record<DashboardPeriodKey, string> = { today: "오늘", yesterday: "어제", thisMonth: "이번달", lastMonth: "저번달" };

/** 발주오라 대시보드 '기간별 매출'의 네 기간(주문일, 한국 날짜) */
export function dashboardRanges(today: string): DashboardRange[] {
  const month = today.slice(0, 7);
  const last = monthRange(nextMonthKey(month, -1));
  const yesterday = addDays(today, -1);
  return [
    { key: "today", label: DASHBOARD_PERIOD_LABELS.today, from: today, to: today },
    { key: "yesterday", label: DASHBOARD_PERIOD_LABELS.yesterday, from: yesterday, to: yesterday },
    { key: "thisMonth", label: DASHBOARD_PERIOD_LABELS.thisMonth, from: `${month}-01`, to: today },
    { key: "lastMonth", label: DASHBOARD_PERIOD_LABELS.lastMonth, from: last.start, to: last.end }
  ];
}

function inRange(line: Pick<DashboardSalesLine, "saleDate">, from: string, to: string) {
  return line.saleDate >= from && line.saleDate <= to;
}

function orderKey(line: Pick<DashboardSalesLine, "orderId" | "id">) {
  return line.orderId || line.id;
}

export function nameKey(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

export type OurSummary = { sales: number; purchase: number; margin: number; orders: number; quantity: number };

export function summarizeLines(lines: DashboardSalesLine[], basis: SalesBasis, from: string, to: string): OurSummary {
  let sales = 0;
  let purchase = 0;
  let quantity = 0;
  const orders = new Set<string>();
  let lineCount = 0;
  for (const line of lines) {
    if (!inRange(line, from, to) || !lineCounts(line, basis)) continue;
    sales += lineSalesAmount(line, basis);
    purchase += linePurchaseAmount(line);
    quantity += line.netQuantity;
    lineCount += 1;
    orders.add(orderKey(line));
  }
  return { sales, purchase, margin: sales - purchase, orders: basis.count === "lines" ? lineCount : orders.size, quantity };
}

export type OurRankRow = { name: string; orders: number; quantity: number; amount: number };

function rankBy(lines: DashboardSalesLine[], basis: SalesBasis, from: string, to: string, nameOf: (line: DashboardSalesLine) => string | null) {
  const groups = new Map<string, { name: string; orders: Set<string>; lines: number; quantity: number; amount: number }>();
  for (const line of lines) {
    if (!inRange(line, from, to) || !lineCounts(line, basis)) continue;
    const name = nameOf(line);
    const key = nameKey(name);
    if (!key) continue;
    const group = groups.get(key) ?? { name: String(name).replace(/\s+/g, " ").trim(), orders: new Set<string>(), lines: 0, quantity: 0, amount: 0 };
    group.orders.add(orderKey(line));
    group.lines += 1;
    group.quantity += line.netQuantity;
    group.amount += lineSalesAmount(line, basis);
    groups.set(key, group);
  }
  return new Map([...groups].map(([key, group]) => [key, { name: group.name, orders: basis.count === "lines" ? group.lines : group.orders.size, quantity: group.quantity, amount: group.amount }]));
}

export function sellersBy(lines: DashboardSalesLine[], basis: SalesBasis, from: string, to: string) {
  return rankBy(lines, basis, from, to, (line) => line.sellerName);
}

export function productsBy(lines: DashboardSalesLine[], basis: SalesBasis, from: string, to: string) {
  return rankBy(lines, basis, from, to, (line) => line.productName);
}

// ─── 발주오라 대시보드 응답 읽기 ───────────────────────────────────────────────
// 발주오라 화면 코드에서 확인한 주소: statistics/recent-orders · statistics/summary-by-period · statistics/top-sellers · statistics/top-products.
// 응답 칸 이름은 공개되지 않아(대시보드 화면 코드는 로그인해야 받음) 흔한 칸 이름 → 칸 이름 모양 → 숫자 크기 순서로 찾습니다.
// 못 읽은 칸은 null로 두고 서버 기록에 응답 구조(칸 이름만)를 남깁니다.

export const DASHBOARD_ENDPOINTS = ["statistics/recent-orders", "statistics/summary-by-period", "statistics/top-sellers", "statistics/top-products"] as const;
export type DashboardEndpoint = (typeof DASHBOARD_ENDPOINTS)[number];

export type DashboardResponse = {
  endpoint: DashboardEndpoint;
  params: Record<string, string>;
  fromPage: boolean;
  status: number;
  data?: unknown;
  error?: string | null;
};

export type BaljuoraDashboardRaw = { at: string; jobId: string | null; page: string | null; responses: DashboardResponse[] };

export type OfficialRecentItem = { key: string; label: string; count: number };
export type OfficialPeriodRow = { key: DashboardPeriodKey; label: string; sales: number | null; purchase: number | null; margin: number | null };
export type OfficialRankPeriod = { key: "thisMonth" | "lastMonth" | "custom"; from: string; to: string; label: string };
export type OfficialSeller = { name: string; orders: number | null; amount: number | null };
export type OfficialProduct = { name: string; quantity: number | null; amount: number | null };

export type BaljuoraDashboardView = {
  at: string;
  recentOrders: { items: OfficialRecentItem[] } | null;
  periods: OfficialPeriodRow[] | null;
  topSellers: { period: OfficialRankPeriod; rows: OfficialSeller[] } | null;
  topProducts: { period: OfficialRankPeriod; rows: OfficialProduct[] } | null;
  errors: Array<{ endpoint: string; status: number; message: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** 숫자 또는 숫자 글자("4,257,500", "4257500원") */
export function dashboardNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const text = value.replace(/[,\s원건개]/g, "");
    if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

const LIST_KEYS = ["items", "data", "list", "rows", "results", "content", "sellers", "products", "ranking", "rankings", "top", "records"];

function findArray(value: unknown, depth = 0): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!isRecord(value) || depth > 3) return null;
  for (const key of LIST_KEYS) if (Array.isArray(value[key])) return value[key] as unknown[];
  for (const key of Object.keys(value)) {
    const found = findArray(value[key], depth + 1);
    if (found && found.some(isRecord)) return found;
  }
  return null;
}

const ID_LIKE = /(^id$|Id$|^no$|^rank|^index$|^order$|^seq|^sort|^position$|code$)/i;

function numbersOf(record: Record<string, unknown>) {
  return Object.entries(record)
    .filter(([key]) => !ID_LIKE.test(key))
    .map(([key, value]) => [key, dashboardNumber(value)] as const)
    .filter((entry): entry is readonly [string, number] => entry[1] !== null);
}

function pickNumber(record: Record<string, unknown>, preferred: string[], pattern: RegExp, avoid?: RegExp): { key: string; value: number } | null {
  const lower = new Map(Object.keys(record).map((key) => [key.toLowerCase(), key]));
  for (const name of preferred) {
    const key = lower.get(name.toLowerCase());
    if (!key) continue;
    const value = dashboardNumber(record[key]);
    if (value !== null) return { key, value };
  }
  for (const [key, value] of numbersOf(record)) {
    if (pattern.test(key) && !(avoid && avoid.test(key))) return { key, value };
  }
  return null;
}

function pickName(record: Record<string, unknown>, preferred: string[], nested: string[]): string | null {
  const lower = new Map(Object.keys(record).map((key) => [key.toLowerCase(), key]));
  for (const name of preferred) {
    const key = lower.get(name.toLowerCase());
    if (key && typeof record[key] === "string" && String(record[key]).trim()) return String(record[key]).replace(/\s+/g, " ").trim();
  }
  for (const name of nested) {
    const key = lower.get(name.toLowerCase());
    const inner = key ? record[key] : undefined;
    if (isRecord(inner)) {
      const found = pickName(inner, preferred.concat(["companyName", "name", "title"]), []);
      if (found) return found;
    }
  }
  for (const [key, value] of Object.entries(record)) {
    if (/name|title|label/i.test(key) && typeof value === "string" && value.trim()) return value.replace(/\s+/g, " ").trim();
  }
  return null;
}

const COUNT_KEYS = ["orderCount", "orders", "orderCnt", "totalOrderCount", "orderItemCount", "itemCount", "orderItems", "count", "cnt"];
const COUNT_PATTERN = /(order|count|cnt|건)/i;
const QUANTITY_KEYS = ["quantity", "salesQuantity", "totalQuantity", "qty", "soldQuantity", "salesCount", "sumQuantity", "count"];
const QUANTITY_PATTERN = /(quantity|qty|count|cnt|sold|판매량|수량)/i;
const AMOUNT_KEYS = ["totalAmount", "amount", "totalSalesAmount", "salesAmount", "totalPrice", "totalSales", "sales", "revenue", "sum", "total"];
const AMOUNT_PATTERN = /(amount|total|sales|revenue|price|sum|금액)/i;
const COUNTISH = /(count|cnt|quantity|qty)/i;

function rankRow(record: Record<string, unknown>, kind: "seller" | "product") {
  const name = kind === "seller"
    ? pickName(record, ["sellerName", "sellerCompanyName", "companyName", "buyerName", "storeName", "shopName", "name"], ["seller", "buyer", "sellerTarget", "store", "shop"])
    : pickName(record, ["productName", "name", "title"], ["product", "item"]);
  const first = kind === "seller" ? pickNumber(record, COUNT_KEYS, COUNT_PATTERN, /(amount|price|sales|revenue|sum)/i) : pickNumber(record, QUANTITY_KEYS, QUANTITY_PATTERN, /(amount|price|sales|revenue|sum)/i);
  const amount = pickNumber(record, AMOUNT_KEYS, AMOUNT_PATTERN, COUNTISH);
  let small = first && (!amount || first.key !== amount.key) ? first.value : null;
  let large = amount && (!first || first.key !== amount.key) ? amount.value : null;
  // 칸 이름으로 못 찾으면 숫자 크기로: 작은 정수 = 건수·수량, 큰 수 = 금액
  if (small === null || large === null) {
    const values = numbersOf(record).map(([, value]) => value).sort((a, b) => a - b);
    if (values.length >= 2) {
      if (small === null) small = values[0];
      if (large === null) large = values[values.length - 1];
    }
  }
  return { name, small, large };
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}/;

/** 매출처 TOP·상품별 매출 요청 조건 → 기간(조건이 없으면 대시보드처럼 이번달) */
export function rankPeriodOf(params: Record<string, string>, today: string): OfficialRankPeriod {
  const dates = Object.entries(params).filter(([, value]) => DATE_KEY.test(value)).map(([key, value]) => ({ key: key.toLowerCase(), value: value.slice(0, 10) }));
  const start = dates.find((item) => /start|from|begin/.test(item.key))?.value;
  const end = dates.find((item) => /end|to|until/.test(item.key))?.value;
  if (start && end) return { key: "custom", from: start, to: end, label: `${start} ~ ${end}` };
  const ranges = dashboardRanges(today);
  const text = Object.values(params).join(" ");
  if (/(last|prev|previous|before|저번|지난)/i.test(text)) {
    const range = ranges.find((item) => item.key === "lastMonth") as DashboardRange;
    return { key: "lastMonth", from: range.from, to: range.to, label: "저번달" };
  }
  const range = ranges.find((item) => item.key === "thisMonth") as DashboardRange;
  return { key: "thisMonth", from: range.from, to: range.to, label: "이번달" };
}

export function parseTopRows(data: unknown, kind: "seller"): OfficialSeller[] | null;
export function parseTopRows(data: unknown, kind: "product"): OfficialProduct[] | null;
export function parseTopRows(data: unknown, kind: "seller" | "product"): Array<OfficialSeller | OfficialProduct> | null {
  const list = findArray(data);
  if (!list) return null;
  const rows = list.filter(isRecord).map((record) => rankRow(record, kind)).filter((row) => row.name);
  if (rows.length === 0) return null;
  return kind === "seller"
    ? rows.map((row) => ({ name: row.name as string, orders: row.small, amount: row.large }))
    : rows.map((row) => ({ name: row.name as string, quantity: row.small, amount: row.large }));
}

const PERIOD_PATTERNS: Array<[DashboardPeriodKey, RegExp]> = [
  ["yesterday", /yesterday|어제/i],
  ["today", /today|오늘|^day$|^daily$/i],
  ["lastMonth", /(last|prev|previous|before)[_\s-]?month|lastmonth|저번\s*달|지난\s*달/i],
  ["thisMonth", /(this|current|cur)[_\s-]?month|thismonth|이번\s*달|^month$|^monthly$/i]
];

function periodKeyOf(text: string): DashboardPeriodKey | null {
  for (const [key, pattern] of PERIOD_PATTERNS) if (pattern.test(text)) return key;
  return null;
}

function periodValues(record: Record<string, unknown>) {
  let sales = pickNumber(record, ["sales", "salesAmount", "sale", "saleAmount", "revenue", "totalSales", "sellAmount", "salesTotal", "매출"], /(sale|revenue|sell|매출)/i, /(count|cnt|quantity)/i)?.value ?? null;
  let purchase = pickNumber(record, ["purchase", "purchaseAmount", "purchases", "cost", "costAmount", "buy", "buyAmount", "purchaseTotal", "매입"], /(purchase|cost|buy|매입)/i, /(count|cnt|quantity)/i)?.value ?? null;
  let margin = pickNumber(record, ["margin", "marginAmount", "profit", "profitAmount", "grossProfit", "마진"], /(margin|profit|마진)/i)?.value ?? null;
  if (sales !== null && purchase !== null && margin === null) margin = sales - purchase;
  if (sales !== null && margin !== null && purchase === null) purchase = sales - margin;
  if (purchase !== null && margin !== null && sales === null) sales = purchase + margin;
  // 칸 이름으로 못 찾으면: 세 숫자 중 '큰 수 − 가운데 = 작은 수'면 매출·매입·마진
  if (sales === null || purchase === null || margin === null) {
    const values = numbersOf(record).map(([, value]) => value).sort((a, b) => b - a);
    if (values.length === 3 && values[0] - values[1] === values[2]) [sales, purchase, margin] = values;
  }
  return { sales, purchase, margin };
}

export function parsePeriods(data: unknown): OfficialPeriodRow[] | null {
  const found = new Map<DashboardPeriodKey, OfficialPeriodRow>();
  const add = (key: DashboardPeriodKey | null, record: unknown) => {
    if (!key || found.has(key) || !isRecord(record)) return;
    const values = periodValues(record);
    if (values.sales === null && values.purchase === null && values.margin === null) return;
    found.set(key, { key, label: DASHBOARD_PERIOD_LABELS[key], ...values });
  };
  const visit = (value: unknown, depth: number) => {
    if (depth > 3) return;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (!isRecord(item)) continue;
        const label = ["period", "type", "key", "name", "label", "range", "title", "구분"].map((key) => item[key]).find((text) => typeof text === "string") as string | undefined;
        add(label ? periodKeyOf(label) : null, item);
      }
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, inner] of Object.entries(value)) {
      const period = periodKeyOf(key);
      if (period && isRecord(inner)) add(period, inner);
      else if (isRecord(inner) || Array.isArray(inner)) visit(inner, depth + 1);
    }
  };
  visit(data, 0);
  if (found.size === 0) return null;
  return (["today", "yesterday", "thisMonth", "lastMonth"] as const).map((key) => found.get(key)).filter((row): row is OfficialPeriodRow => Boolean(row));
}

const RECENT_KEYS: Array<{ key: string; label: string; pattern: RegExp }> = [
  { key: "pending", label: "주문대기", pattern: /^(pending|wait|waiting|orderwait|beforepayment|unpaid|paymentpending|paymentwait|주문대기)/ },
  { key: "accepted", label: "주문접수", pattern: /^(accepted|accept|received|receipt|orderreceived|confirmed|주문접수)/ },
  { key: "purchased", label: "발주완료", pattern: /^(purchased|purchase|ordered|purchasecompleted|placed|발주완료)/ },
  { key: "preparing", label: "배송준비중", pattern: /^(preparing|prepare|ready|readytoship|shippingready|배송준비)/ },
  { key: "shipping", label: "배송중", pattern: /^(shipping|shipped|intransit|indelivery|delivering|배송중)/ },
  { key: "delivered", label: "배송완료", pattern: /^(delivered|deliverycompleted|completed|complete|배송완료)/ },
  { key: "total", label: "전체주문", pattern: /^(total|all|totalorders|totalorder|allorders|전체)/ },
  { key: "cancelled", label: "취소", pattern: /^(cancel|cancelled|canceled|cancellation|취소)/ },
  { key: "returned", label: "반품", pattern: /^(return|returned|returns|반품)/ },
  { key: "exchanged", label: "교환", pattern: /^(exchange|exchanged|exchanges|교환)/ }
];

function recentKeyOf(raw: string) {
  // 발주오라 주문 상태 값(orders/items status)은 pending·accepted·purchased·preparing·shipping·delivered(DB센터 ORDER_STATUS_ORDER와 같음)
  const base = raw.toLowerCase().replace(/[^a-z가-힣]/g, "");
  const trimmed = base.replace(/(counts|count|cnt|orders|order)$/, "") || base;
  for (const text of [trimmed, trimmed.replace(/^(orders?|status)/, ""), base]) {
    if (!text) continue;
    const found = RECENT_KEYS.find((item) => item.pattern.test(text));
    if (found) return found;
  }
  return null;
}

export function parseRecentOrders(data: unknown): { items: OfficialRecentItem[] } | null {
  const found = new Map<string, OfficialRecentItem>();
  const visit = (value: unknown, depth: number) => {
    if (depth > 3) return;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (!isRecord(item)) continue;
        const status = ["status", "key", "type", "name", "label", "code"].map((key) => item[key]).find((text) => typeof text === "string") as string | undefined;
        const count = pickNumber(item, ["count", "cnt", "total", "value", "orderCount"], /(count|cnt|total|value)/i);
        const match = status ? recentKeyOf(status) : null;
        if (match && count && !found.has(match.key)) found.set(match.key, { key: match.key, label: match.label, count: count.value });
      }
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, inner] of Object.entries(value)) {
      const number = dashboardNumber(inner);
      if (number !== null) {
        const match = recentKeyOf(key);
        if (match && !found.has(match.key)) found.set(match.key, { key: match.key, label: match.label, count: number });
      } else if (isRecord(inner) || Array.isArray(inner)) visit(inner, depth + 1);
    }
  };
  visit(data, 0);
  if (found.size === 0) return null;
  return { items: RECENT_KEYS.map((item) => found.get(item.key)).filter((item): item is OfficialRecentItem => Boolean(item)) };
}

/** 저장해 둔 발주오라 대시보드 응답 → 화면에 보여 줄 숫자 */
export function parseBaljuoraDashboard(raw: BaljuoraDashboardRaw, today: string): BaljuoraDashboardView {
  const ok = (endpoint: DashboardEndpoint) => raw.responses.filter((item) => item.endpoint === endpoint && item.status >= 200 && item.status < 300);
  const recent = ok("statistics/recent-orders")[0];
  const periods = ok("statistics/summary-by-period")[0];
  // 매출처·상품: 대시보드가 부른 조건이 여러 개면 이번달을 먼저
  const pickRank = (endpoint: DashboardEndpoint) => {
    const list = ok(endpoint).map((item) => ({ item, period: rankPeriodOf(item.params, today) }));
    return list.find((entry) => entry.period.key === "thisMonth") ?? list[0] ?? null;
  };
  const sellers = pickRank("statistics/top-sellers");
  const productsRank = pickRank("statistics/top-products");
  const sellerRows = sellers ? parseTopRows(sellers.item.data, "seller") : null;
  const productRows = productsRank ? parseTopRows(productsRank.item.data, "product") : null;
  return {
    at: raw.at,
    recentOrders: recent ? parseRecentOrders(recent.data) : null,
    periods: periods ? parsePeriods(periods.data) : null,
    topSellers: sellers && sellerRows ? { period: sellers.period, rows: sellerRows } : null,
    topProducts: productsRank && productRows ? { period: productsRank.period, rows: productRows } : null,
    errors: raw.responses.filter((item) => item.status < 200 || item.status >= 300).map((item) => ({ endpoint: item.endpoint, status: item.status, message: String(item.error ?? "").slice(0, 200) }))
  };
}

// ─── 기준 고르기 ──────────────────────────────────────────────────────────────

export type BasisScore = { basis: SalesBasis; score: number; total: number; sellers: number; periods: number; products: number };

/** 발주오라 대시보드 숫자와 가장 많이 같은 DB센터 계산 기준(같은 점수면 기본 기준). 맞춰 볼 숫자가 없으면 null. */
export function calibrateSalesBasis(lines: DashboardSalesLine[], view: BaljuoraDashboardView, today: string): BasisScore | null {
  const ranges = dashboardRanges(today);
  let best: BasisScore | null = null;
  for (const basis of salesBasisCandidates()) {
    let score = 0;
    let total = 0;
    let sellers = 0;
    let periods = 0;
    let productsMatched = 0;
    if (view.topSellers) {
      const ours = sellersBy(lines, basis, view.topSellers.period.from, view.topSellers.period.to);
      for (const row of view.topSellers.rows) {
        const mine = ours.get(nameKey(row.name));
        if (row.orders !== null) { total += 1; if (mine && mine.orders === row.orders) { score += 1; sellers += 1; } }
        if (row.amount !== null) { total += 1; if (mine && mine.amount === row.amount) { score += 1; sellers += 1; } }
      }
    }
    if (view.periods) {
      for (const row of view.periods) {
        const range = ranges.find((item) => item.key === row.key);
        if (!range || row.sales === null) continue;
        total += 1;
        if (summarizeLines(lines, basis, range.from, range.to).sales === row.sales) { score += 1; periods += 1; }
      }
    }
    if (view.topProducts) {
      const ours = productsBy(lines, basis, view.topProducts.period.from, view.topProducts.period.to);
      for (const row of view.topProducts.rows) {
        const mine = ours.get(nameKey(row.name));
        if (row.quantity !== null) { total += 1; if (mine && mine.quantity === row.quantity) { score += 1; productsMatched += 1; } }
        if (row.amount !== null) { total += 1; if (mine && mine.amount === row.amount) { score += 1; productsMatched += 1; } }
      }
    }
    if (total === 0) return null;
    if (!best || score > best.score) best = { basis, score, total, sellers, periods, products: productsMatched };
  }
  return best;
}

// ─── 화면: 발주오라 숫자 ↔ DB센터 계산 ─────────────────────────────────────────

export type DashboardCompare = {
  periods: Array<OfficialPeriodRow & { ours: OurSummary }>;
  sellers: Array<OfficialSeller & { ours: OurRankRow | null }>;
  products: Array<OfficialProduct & { ours: OurRankRow | null }>;
};

export function compareDashboard(lines: DashboardSalesLine[], view: BaljuoraDashboardView, basis: SalesBasis, today: string): DashboardCompare {
  const ranges = dashboardRanges(today);
  const periods = (view.periods ?? []).map((row) => {
    const range = ranges.find((item) => item.key === row.key) as DashboardRange;
    return { ...row, ours: summarizeLines(lines, basis, range.from, range.to) };
  });
  const sellerMap = view.topSellers ? sellersBy(lines, basis, view.topSellers.period.from, view.topSellers.period.to) : new Map<string, OurRankRow>();
  const productMap = view.topProducts ? productsBy(lines, basis, view.topProducts.period.from, view.topProducts.period.to) : new Map<string, OurRankRow>();
  return {
    periods,
    sellers: (view.topSellers?.rows ?? []).map((row) => ({ ...row, ours: sellerMap.get(nameKey(row.name)) ?? null })),
    products: (view.topProducts?.rows ?? []).map((row) => ({ ...row, ours: productMap.get(nameKey(row.name)) ?? null }))
  };
}

/** 응답 구조(칸 이름·형식만, 값 없음) — 서버 기록용 */
export function dashboardShape(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) return value.length === 0 ? "array(0)" : ["array", dashboardShape(value[0], depth + 1)];
  if (isRecord(value)) {
    if (depth > 3) return "object";
    const shape: Record<string, unknown> = {};
    for (const key of Object.keys(value).slice(0, 60)) shape[key] = dashboardShape(value[key], depth + 1);
    return shape;
  }
  return value === null ? "null" : typeof value;
}
