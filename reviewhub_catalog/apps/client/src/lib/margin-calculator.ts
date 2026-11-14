// 마진계산기(2026-11-14, 관리자 요청 "위탁셀러에게 마진계산기는 필수"): 판매가 · 매입가(두고푸드 공급가) · 마켓 수수료 · 배송비로
// 정산금액 · 판매이익 · 마진율을 바로 계산합니다. 무료 마진계산기들이 쓰는 계산 항목(판매가·받은 배송비·매입가·보낸 배송비·마켓 수수료)에
// 목표 마진으로 판매가 구하기 · 마켓별 비교 · 계산표 저장(이 기기)을 더했습니다. 화면은 pages/catalog/MarginCalculator.tsx.
// 금액은 원, 수수료는 %(부가세 포함 값)입니다.

export type MarginMarket = {
  id: string;
  label: string;
  /** 비교표·계산표에 쓰는 짧은 이름 */
  short: string;
  /** 판매 수수료(상품 판매가에 붙는 %) */
  feeRate: number;
  /** 배송비 수수료(고객에게 받은 배송비에 붙는 %) */
  shipFeeRate: number;
  /** 기본값을 어떻게 정했는지 */
  basis: string;
  /** 카테고리·등급마다 크게 달라 참고값인 마켓 */
  approximate?: boolean;
};

// 기본 수수료(2026-11 공개 자료 기준, 부가세 포함). 실제 수수료는 카테고리·판매자 등급·유입 경로·프로모션마다 달라
// 화면에서 고쳐 쓰면 이 기기에 마켓별로 기억합니다(MARGIN_STORAGE_KEYS.fees).
export const MARGIN_MARKETS: MarginMarket[] = [
  {
    id: "smartstore",
    label: "네이버 스마트스토어",
    short: "스마트스토어",
    feeRate: 6.63,
    shipFeeRate: 3.63,
    basis: "네이버 쇼핑 유입 · 일반 등급: 주문관리 3.63% + 판매 3.0%(부가세 포함). 영세·중소 등급은 주문관리 수수료가 더 낮아요."
  },
  {
    id: "smartstore-link",
    label: "스마트스토어 (마케팅 링크 유입)",
    short: "스마트스토어(링크)",
    feeRate: 4.63,
    shipFeeRate: 3.63,
    basis: "내 마케팅 링크로 들어온 주문: 주문관리 3.63% + 판매 1.0%(부가세 포함)."
  },
  {
    id: "coupang-food",
    label: "쿠팡 (식품)",
    short: "쿠팡 식품",
    feeRate: 11.66,
    shipFeeRate: 3.3,
    basis: "마켓플레이스 식품 10.6% · 배송비 3%에 부가세 10%를 더한 참고값이에요. 세부 카테고리마다 달라요.",
    approximate: true
  },
  {
    id: "coupang-health",
    label: "쿠팡 (건강식품)",
    short: "쿠팡 건강식품",
    feeRate: 8.36,
    shipFeeRate: 3.3,
    basis: "헬스/건강식품 7.6% · 배송비 3%에 부가세 10%를 더한 참고값이에요. 세부 카테고리마다 달라요.",
    approximate: true
  },
  {
    id: "openmarket",
    label: "11번가 · G마켓 · 옥션",
    short: "11번가·G마켓·옥션",
    feeRate: 10,
    shipFeeRate: 3.3,
    basis: "식품·건강식품은 카테고리마다 약 9~13%예요. 판매자센터의 카테고리 수수료로 고쳐 쓰세요.",
    approximate: true
  },
  {
    id: "own-mall",
    label: "자사몰 (카드 결제 수수료만)",
    short: "자사몰",
    feeRate: 3.3,
    shipFeeRate: 3.3,
    basis: "카페24·아임웹 같은 자사몰은 결제(PG) 수수료만 들어요. 계약마다 달라요.",
    approximate: true
  },
  {
    id: "custom",
    label: "직접 입력",
    short: "직접 입력",
    feeRate: 0,
    shipFeeRate: 0,
    basis: "판매 수수료와 배송비 수수료를 직접 넣어 주세요."
  }
];

export const DEFAULT_MARKET_ID = "smartstore";

// 팝업 열기 신호는 단가표 첫 화면에서도 쓰여 작은 파일(lib/margin-open.ts)로 나눴습니다.
export { MARGIN_OPEN_EVENT, type MarginPrefill, openMarginCalculator } from "./margin-open";
export function findMarket(id: string | null | undefined) {
  return MARGIN_MARKETS.find((market) => market.id === id) ?? null;
}

export type MarginInput = {
  /** 판매가격(고객이 내는 상품 가격) */
  salePrice: number | null;
  /** 받은 배송비(고객에게 받은 배송비, 무료배송이면 0) */
  shippingIn: number | null;
  /** 매입가(두고푸드 공급가) */
  cost: number | null;
  /** 보낸 배송비(택배비·포장비 = 두고푸드 주문 때 내는 배송비) */
  shippingOut: number | null;
  /** 기타 비용(광고비·사은품 등 1개당) */
  extraCost: number | null;
  feeRate: number | null;
  shipFeeRate: number | null;
  /** 부가세(10%)까지 빼고 보기 — 과세 상품 · 일반과세자 기준 */
  vat: boolean;
};

export type MarginResult = {
  /** 고객 결제 금액(판매가 + 받은 배송비) */
  revenue: number;
  saleFee: number;
  shipFee: number;
  /** 정산금액(마켓이 보내 주는 돈) */
  settlement: number;
  /** 매입가 + 보낸 배송비 + 기타 비용 */
  costTotal: number;
  /** 부가세(켰을 때만, 남는 돈 ÷ 11) */
  vatAmount: number;
  /** 판매이익(남는 돈) */
  profit: number;
  /** 마진율(판매가 기준, 소수점 한 자리) */
  marginRate: number;
  /** 광고 손익분기 ROAS(%) = 판매가 ÷ 판매이익 — 이익이 있을 때만 */
  breakEvenRoas: number | null;
};

const num = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const money = (value: number | null | undefined) => Math.max(0, Math.round(num(value)));
const rate = (value: number | null | undefined) => Math.min(100, Math.max(0, num(value)));
const round1 = (value: number) => {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
};

export function computeMargin(input: MarginInput): MarginResult | null {
  const salePrice = money(input.salePrice);
  if (salePrice <= 0) return null;
  const shippingIn = money(input.shippingIn);
  const saleFee = Math.round((salePrice * rate(input.feeRate)) / 100);
  const shipFee = Math.round((shippingIn * rate(input.shipFeeRate)) / 100);
  const revenue = salePrice + shippingIn;
  const settlement = revenue - saleFee - shipFee;
  const costTotal = money(input.cost) + money(input.shippingOut) + money(input.extraCost);
  const beforeVat = settlement - costTotal;
  // 과세 상품을 일반과세자가 팔면 낼 부가세 = (매출 − 매입 − 수수료 − 배송비) ÷ 11 (모두 부가세 포함 금액이고 세금계산서를 받는다고 봄)
  const vatAmount = input.vat ? Math.round(beforeVat / 11) : 0;
  const profit = beforeVat - vatAmount;
  return {
    revenue,
    saleFee,
    shipFee,
    settlement,
    costTotal,
    vatAmount,
    profit,
    marginRate: round1((profit / salePrice) * 100),
    breakEvenRoas: profit > 0 ? Math.round((salePrice / profit) * 100) : null
  };
}

// 목표 마진율(%)을 남기는 최소 판매가(10원 단위로 올림). 그 마진을 낼 수 없는 수수료·비용이면 null.
export function salePriceForMargin(input: MarginInput, targetRate: number): number | null {
  if (!Number.isFinite(targetRate) || targetRate >= 100) return null;
  const target = targetRate / 100;
  const fee = rate(input.feeRate) / 100;
  const shipFee = rate(input.shipFeeRate) / 100;
  const keep = input.vat ? 10 / 11 : 1;
  const fixed = money(input.cost) + money(input.shippingOut) + money(input.extraCost) - money(input.shippingIn) * (1 - shipFee);
  const denominator = (1 - fee) * keep - target;
  if (fixed <= 0 || !(denominator > 0)) return null;
  let price = Math.ceil((fixed * keep) / denominator / 10) * 10;
  // 수수료를 원 단위로 반올림하므로, 계산 결과가 목표에 조금 못 미치면 10원씩 올려 맞춥니다.
  for (let step = 0; step < 200; step += 1) {
    const result = computeMargin({ ...input, salePrice: price });
    if (result && result.marginRate >= round1(targetRate)) return price;
    price += 10;
  }
  return price;
}

export type MarketRates = Record<string, { feeRate: number; shipFeeRate: number }>;

export function marketRates(market: MarginMarket, overrides: MarketRates) {
  const custom = overrides[market.id];
  return custom ? { feeRate: custom.feeRate, shipFeeRate: custom.shipFeeRate, customized: true } : { feeRate: market.feeRate, shipFeeRate: market.shipFeeRate, customized: false };
}

// 같은 상품을 마켓마다 팔 때(직접 입력 제외) 남는 돈 — 많이 남는 순
export function compareMarkets(input: MarginInput, overrides: MarketRates) {
  return MARGIN_MARKETS.filter((market) => market.id !== "custom")
    .map((market) => {
      const rates = marketRates(market, overrides);
      return { market, ...rates, result: computeMargin({ ...input, feeRate: rates.feeRate, shipFeeRate: rates.shipFeeRate }) };
    })
    .sort((a, b) => (b.result?.profit ?? Number.NEGATIVE_INFINITY) - (a.result?.profit ?? Number.NEGATIVE_INFINITY));
}

// ---------- 계산표(여러 상품) ----------

export type MarginRow = MarginInput & {
  id: string;
  name: string;
  marketId: string;
  /** 예상 판매 수량(합계 계산용, 기본 1) */
  quantity: number | null;
  productId?: string | null;
};

export type MarginSheet = { id: string; name: string; savedAt: string; rows: MarginRow[] };

export const MARGIN_LIMITS = { rows: 200, saves: 30, name: 60 } as const;
export const LOW_MARGIN_RATE = 10;

export function rowQuantity(row: Pick<MarginRow, "quantity">) {
  const quantity = Math.round(num(row.quantity));
  return quantity > 0 ? Math.min(quantity, 1_000_000) : 1;
}

export function sheetSummary(rows: MarginRow[]) {
  const computed = rows.flatMap((row) => {
    const result = computeMargin(row);
    return result ? [{ row, result }] : [];
  });
  const averageRate = computed.length ? round1(computed.reduce((sum, item) => sum + item.result.marginRate, 0) / computed.length) : null;
  const totalProfit = computed.reduce((sum, item) => sum + item.result.profit * rowQuantity(item.row), 0);
  const lowCount = computed.filter((item) => item.result.marginRate < LOW_MARGIN_RATE).length;
  const best = computed.reduce<(typeof computed)[number] | null>((top, item) => (!top || item.result.marginRate > top.result.marginRate ? item : top), null);
  return { count: rows.length, computedCount: computed.length, averageRate, totalProfit, lowCount, best };
}

// 엑셀에서 열리는 CSV(한글 깨짐 방지 BOM, 수식으로 읽히는 첫 글자 막기)
export function sheetToCsv(rows: MarginRow[]) {
  const text = (value: string) => {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const header = ["상품명", "판매처", "판매가", "받은 배송비", "매입가", "보낸 배송비", "기타 비용", "판매 수수료(%)", "배송비 수수료(%)", "부가세 반영", "정산금액", "판매이익", "마진율(%)", "손익분기 ROAS(%)", "수량", "예상 이익"];
  const lines = rows.map((row) => {
    const result = computeMargin(row);
    const market = findMarket(row.marketId);
    return [
      text(row.name || "이름 없는 상품"),
      text(market?.label ?? "직접 입력"),
      money(row.salePrice),
      money(row.shippingIn),
      money(row.cost),
      money(row.shippingOut),
      money(row.extraCost),
      rate(row.feeRate),
      rate(row.shipFeeRate),
      text(row.vat ? "예" : "아니오"),
      result ? result.settlement : "",
      result ? result.profit : "",
      result ? result.marginRate : "",
      result?.breakEvenRoas ?? "",
      rowQuantity(row),
      result ? result.profit * rowQuantity(row) : ""
    ].join(",");
  });
  return `\uFEFF${[header.map(text).join(","), ...lines].join("\r\n")}`;
}

// ---------- 이 기기 저장(localStorage) ----------

export const MARGIN_STORAGE_KEYS = {
  draft: "doogo:margin:draft",
  sheet: "doogo:margin:sheet",
  saves: "doogo:margin:saves",
  fees: "doogo:margin:fees"
} as const;

export type MarginDraft = MarginInput & {
  name: string;
  marketId: string;
  productId: string | null;
  /** 두고푸드 상품을 불러왔을 때의 공급가(매입가 A단가/일반공급가 전환용) */
  aPrice: number | null;
  generalPrice: number | null;
  costBasis: "a" | "general" | "manual";
  targetRate: number | null;
};

export function emptyDraft(marketId = DEFAULT_MARKET_ID, overrides: MarketRates = {}): MarginDraft {
  const market = findMarket(marketId) ?? MARGIN_MARKETS[0];
  const rates = marketRates(market, overrides);
  return {
    name: "",
    marketId: market.id,
    productId: null,
    salePrice: null,
    shippingIn: 0,
    cost: null,
    shippingOut: null,
    extraCost: null,
    feeRate: rates.feeRate,
    shipFeeRate: rates.shipFeeRate,
    vat: false,
    aPrice: null,
    generalPrice: null,
    costBasis: "manual",
    targetRate: 30
  };
}

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const optionalNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const shortText = (value: unknown, max: number = MARGIN_LIMITS.name) => (typeof value === "string" ? value.slice(0, max) : "");

function sanitizeInput(raw: Record<string, unknown>): MarginInput {
  return {
    salePrice: optionalNumber(raw.salePrice),
    shippingIn: optionalNumber(raw.shippingIn),
    cost: optionalNumber(raw.cost),
    shippingOut: optionalNumber(raw.shippingOut),
    extraCost: optionalNumber(raw.extraCost),
    feeRate: optionalNumber(raw.feeRate),
    shipFeeRate: optionalNumber(raw.shipFeeRate),
    vat: raw.vat === true
  };
}

export function sanitizeRow(raw: unknown): MarginRow | null {
  if (!isRecord(raw)) return null;
  const id = shortText(raw.id, 40);
  if (!id) return null;
  return {
    ...sanitizeInput(raw),
    id,
    name: shortText(raw.name),
    marketId: findMarket(shortText(raw.marketId, 40))?.id ?? "custom",
    quantity: optionalNumber(raw.quantity),
    productId: typeof raw.productId === "string" ? raw.productId.slice(0, 80) : null
  };
}

export function sanitizeDraft(raw: unknown, overrides: MarketRates = {}): MarginDraft {
  if (!isRecord(raw)) return emptyDraft(DEFAULT_MARKET_ID, overrides);
  const base = emptyDraft(findMarket(shortText(raw.marketId, 40))?.id ?? DEFAULT_MARKET_ID, overrides);
  const costBasis = raw.costBasis === "a" || raw.costBasis === "general" ? raw.costBasis : "manual";
  return {
    ...base,
    ...sanitizeInput(raw),
    feeRate: optionalNumber(raw.feeRate) ?? base.feeRate,
    shipFeeRate: optionalNumber(raw.shipFeeRate) ?? base.shipFeeRate,
    name: shortText(raw.name),
    productId: typeof raw.productId === "string" ? raw.productId.slice(0, 80) : null,
    aPrice: optionalNumber(raw.aPrice),
    generalPrice: optionalNumber(raw.generalPrice),
    costBasis,
    targetRate: optionalNumber(raw.targetRate) ?? base.targetRate
  };
}

export function loadFeeOverrides(): MarketRates {
  const raw = readJson(MARGIN_STORAGE_KEYS.fees);
  if (!isRecord(raw)) return {};
  const result: MarketRates = {};
  for (const market of MARGIN_MARKETS) {
    const value = raw[market.id];
    if (!isRecord(value)) continue;
    const feeRate = optionalNumber(value.feeRate);
    const shipFeeRate = optionalNumber(value.shipFeeRate);
    if (feeRate === null || shipFeeRate === null) continue;
    result[market.id] = { feeRate: rate(feeRate), shipFeeRate: rate(shipFeeRate) };
  }
  return result;
}

export function saveFeeOverrides(overrides: MarketRates) {
  return writeJson(MARGIN_STORAGE_KEYS.fees, overrides);
}

export function loadDraft(overrides: MarketRates = {}) {
  return sanitizeDraft(readJson(MARGIN_STORAGE_KEYS.draft), overrides);
}

export function saveDraft(draft: MarginDraft) {
  return writeJson(MARGIN_STORAGE_KEYS.draft, draft);
}

export function loadSheetRows(): MarginRow[] {
  const raw = readJson(MARGIN_STORAGE_KEYS.sheet);
  return Array.isArray(raw) ? raw.flatMap((row) => sanitizeRow(row) ?? []).slice(0, MARGIN_LIMITS.rows) : [];
}

export function saveSheetRows(rows: MarginRow[]) {
  return writeJson(MARGIN_STORAGE_KEYS.sheet, rows.slice(0, MARGIN_LIMITS.rows));
}

export function loadSaves(): MarginSheet[] {
  const raw = readJson(MARGIN_STORAGE_KEYS.saves);
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((item): MarginSheet[] => {
      if (!isRecord(item) || !Array.isArray(item.rows)) return [];
      const id = shortText(item.id, 40);
      if (!id) return [];
      return [{ id, name: shortText(item.name) || "이름 없는 계산표", savedAt: shortText(item.savedAt, 40), rows: item.rows.flatMap((row) => sanitizeRow(row) ?? []).slice(0, MARGIN_LIMITS.rows) }];
    })
    .slice(0, MARGIN_LIMITS.saves);
}

export function writeSaves(saves: MarginSheet[]) {
  return writeJson(MARGIN_STORAGE_KEYS.saves, saves.slice(0, MARGIN_LIMITS.saves));
}

// 같은 이름이면 덮어쓰고, 새 이름이면 맨 앞에 추가합니다(최대 30개, 넘으면 가장 오래된 것부터 뺌).
export function upsertSave(saves: MarginSheet[], name: string, rows: MarginRow[], now = new Date()): { saves: MarginSheet[]; saved: MarginSheet } {
  const cleanName = name.trim().slice(0, MARGIN_LIMITS.name) || "이름 없는 계산표";
  const existing = saves.find((save) => save.name === cleanName);
  const saved: MarginSheet = { id: existing?.id ?? makeId(), name: cleanName, savedAt: now.toISOString(), rows: rows.slice(0, MARGIN_LIMITS.rows) };
  return { saves: [saved, ...saves.filter((save) => save.id !== saved.id)].slice(0, MARGIN_LIMITS.saves), saved };
}

export function makeId() {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// 입력칸 글자 → 숫자(원: 정수, %: 소수점 둘째 자리까지)
export function parseMoneyText(text: string): number | null {
  const digits = text.replace(/[^\d]/g, "").slice(0, 10);
  return digits ? Number(digits) : null;
}

export function parseRateText(text: string): number | null {
  const cleaned = text.replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  const [whole, ...rest] = cleaned.split(".");
  const value = Number(`${whole || "0"}${rest.length ? `.${rest.join("").slice(0, 2)}` : ""}`);
  return Number.isFinite(value) ? Math.min(100, value) : null;
}

export function formatWon(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function formatRate(value: number) {
  return `${value.toFixed(1)}%`;
}
