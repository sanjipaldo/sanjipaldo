// 공급사 센터 공용 정의(서버·화면 공용, 2026-11-20 관리자 요청).
// - 공급사가 바꿀 수 있는 상품 값(변경 요청)과 이름표
// - 요청 상태 이름
// - 정산 주기(월 정산·주 정산·매일 정산)별 판매 기간과 입금일 계산
// 공급사에게 보이는 화면에는 "발주오라"를 쓰지 않습니다(CLAUDE.md 공급사 거래 방식).

export type SupplierSettlementCycle = "monthly" | "weekly" | "daily";
export type SupplierRequestKind = "update" | "create";
export type SupplierRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

// 공급사가 요청할 수 있는 상품 값. 공급가 = 두고푸드가 공급사에게 주는 값(관리자 화면의 "원가"),
// 권장 판매가 = 소비자 판매가(관리자 화면의 "지정 판매가", 자율이면 비움).
export type SupplierProductChanges = {
  name?: string;
  imageUrl?: string | null;
  origin?: string | null;
  costPrice?: number;
  salePriceMode?: "autonomous" | "fixed";
  salePrice?: number | null;
  isAlwaysOnSale?: boolean;
  saleStartMonth?: number | null;
  saleEndMonth?: number | null;
  isSoldOut?: boolean;
  // 신규 등록 요청에서만: 배송 · 희망 카테고리 · 상품 설명
  shippingType?: "domestic" | "overseas";
  categoryId?: string | null;
  description?: string | null;
};

export type SupplierChangeField = keyof SupplierProductChanges;

// 수정 요청에서 바꿀 수 있는 값(신규 등록 요청은 여기에 배송·카테고리·설명이 더해집니다)
export const SUPPLIER_UPDATE_FIELDS = [
  "name",
  "imageUrl",
  "origin",
  "costPrice",
  "salePriceMode",
  "salePrice",
  "isAlwaysOnSale",
  "saleStartMonth",
  "saleEndMonth",
  "isSoldOut"
] as const satisfies readonly SupplierChangeField[];

export const SUPPLIER_CREATE_FIELDS = [
  ...SUPPLIER_UPDATE_FIELDS,
  "shippingType",
  "categoryId",
  "description"
] as const satisfies readonly SupplierChangeField[];

export const SUPPLIER_FIELD_LABELS: Record<SupplierChangeField, string> = {
  name: "상품명",
  imageUrl: "상품 이미지",
  origin: "원산지",
  costPrice: "공급가",
  salePriceMode: "권장 판매가 방식",
  salePrice: "권장 판매가",
  isAlwaysOnSale: "판매 기간 방식",
  saleStartMonth: "판매 시작월",
  saleEndMonth: "판매 종료월",
  isSoldOut: "판매 상태",
  shippingType: "배송",
  categoryId: "카테고리",
  description: "상품 설명"
};

export const SUPPLIER_REQUEST_STATUS_LABELS: Record<SupplierRequestStatus, string> = {
  pending: "승인 대기",
  approved: "승인 완료",
  rejected: "반려",
  cancelled: "요청 취소"
};

export const SUPPLIER_REQUEST_KIND_LABELS: Record<SupplierRequestKind, string> = {
  update: "상품 수정",
  create: "신규 등록"
};

export const SUPPLIER_CYCLE_LABELS: Record<SupplierSettlementCycle, string> = {
  monthly: "월 정산",
  weekly: "주 정산",
  daily: "매일 정산"
};
/** 지급 주기 고르는 순서(주 정산 기본) */
export const SUPPLIER_SETTLEMENT_CYCLES: readonly SupplierSettlementCycle[] = ["weekly", "monthly", "daily"];
/** 지급 주기 설명(고르기·공급사 내 정보) */
export const SUPPLIER_CYCLE_HINTS: Record<SupplierSettlementCycle, string> = {
  weekly: "월~일 판매분 → 다음 주 월요일",
  monthly: "1일~말일 → 다음 달 1~3일",
  daily: "그날 판매분 → 그날 입금"
};
/** 목록 칸에 쓰는 짧은 설명 */
export const SUPPLIER_CYCLE_SHORT: Record<SupplierSettlementCycle, string> = {
  weekly: "주 정산 · 월요일",
  monthly: "월 정산 · 1~3일",
  daily: "매일 정산 · 당일"
};

/** 저장된 값 → 지급 주기(모르는 값이면 fallback) */
export function settlementCycleOf(value: unknown, fallback: SupplierSettlementCycle = "monthly"): SupplierSettlementCycle {
  return value === "weekly" || value === "monthly" || value === "daily" ? value : fallback;
}

export const DEFAULT_SUPPLIER_COMMISSION_RATE = 10;

// 아이디: 영문 소문자·숫자·밑줄·마침표 3~30자(로그인할 때 대소문자는 구분하지 않음)
export const SUPPLIER_USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;
export const SUPPLIER_PASSWORD_MIN = 3;
export const SUPPLIER_PASSWORD_RECOMMENDED = 8;

function won(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

// 바뀌는 값 한 칸을 사람이 읽는 글로 바꿉니다(관리자·공급사 화면 공용).
export function formatSupplierChangeValue(
  field: SupplierChangeField,
  value: unknown,
  categoryName?: (id: string) => string | undefined
): string {
  if (value === null || value === undefined || value === "") {
    if (field === "salePrice") return "자율";
    if (field === "saleStartMonth" || field === "saleEndMonth") return "미설정";
    return "없음";
  }
  switch (field) {
    case "costPrice":
    case "salePrice":
      return typeof value === "number" ? won(value) : String(value);
    case "salePriceMode":
      return value === "fixed" ? "지정 판매가" : "판매자 자율";
    case "isAlwaysOnSale":
      return value ? "상시 판매" : "기간 판매";
    case "saleStartMonth":
    case "saleEndMonth":
      return `${value}월`;
    case "isSoldOut":
      return value ? "품절" : "판매중";
    case "shippingType":
      return value === "overseas" ? "해외배송" : "국내배송";
    case "categoryId":
      return categoryName?.(String(value)) ?? "선택한 카테고리";
    case "imageUrl":
      return "새 이미지";
    default:
      return String(value);
  }
}

export type SupplierChangeRow = { field: SupplierChangeField; label: string; before: string; after: string };

// 요청에서 실제로 바뀌는 항목만 골라 "이전 → 이후" 줄로 만듭니다. snapshot이 없으면(신규 등록) 이전은 "-"이고,
// 비어 있는 칸(이미지 없음, 자율 판매가의 금액, 상시 판매의 판매월 등)은 줄을 만들지 않습니다.
export function supplierChangeRows(
  changes: SupplierProductChanges,
  snapshot?: Partial<Record<SupplierChangeField, unknown>> | null,
  categoryName?: (id: string) => string | undefined
): SupplierChangeRow[] {
  const rows: SupplierChangeRow[] = [];
  for (const field of SUPPLIER_CREATE_FIELDS) {
    if (!(field in changes)) continue;
    const after = changes[field];
    const before = snapshot ? snapshot[field] : undefined;
    if (snapshot && normalizeCompare(before) === normalizeCompare(after)) continue;
    if (!snapshot && normalizeCompare(after) === null) continue;
    rows.push({
      field,
      label: SUPPLIER_FIELD_LABELS[field],
      before: snapshot ? formatSupplierChangeValue(field, before, categoryName) : "-",
      after: formatSupplierChangeValue(field, after, categoryName)
    });
  }
  return rows;
}

function normalizeCompare(value: unknown) {
  if (value === undefined || value === "") return null;
  return value;
}

// ── 한국 날짜 · 정산 기간 ───────────────────────────────────────────────
export function seoulDateKey(value: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

function keyToUtc(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function utcToKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function addDays(key: string, days: number) {
  const date = keyToUtc(key);
  date.setUTCDate(date.getUTCDate() + days);
  return utcToKey(date);
}

// "2026-11" → { start: "2026-11-01", end: "2026-11-30" }
export function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

export function nextMonthKey(month: string, amount = 1) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isMonthKey(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
}

// 0=일 … 6=토
export function weekdayOf(key: string) {
  return keyToUtc(key).getUTCDay();
}

export type SettlementPeriod = {
  cycle: SupplierSettlementCycle;
  start: string; // 판매 기간 시작(포함)
  end: string; // 판매 기간 끝(포함)
  payoutStart: string; // 판매 대금 입금(예정) 시작일
  payoutEnd: string; // 입금(예정) 마지막 날
};

// 판매일이 속한 정산 기간: 월 정산 = 그 달 1일~말일 → 다음 달 1~3일 입금,
// 주 정산 = 그 주 월~일 → 다음 주 월요일 입금(공급사 사용방법·제안서와 같은 기준),
// 매일 정산(2026-11-26 관리자 요청: 입금이 돼야 출고하는 공급사) = 그날 판매분 → 그날 입금.
export function settlementPeriodFor(saleDate: string, cycle: SupplierSettlementCycle): SettlementPeriod {
  if (cycle === "daily") return { cycle, start: saleDate, end: saleDate, payoutStart: saleDate, payoutEnd: saleDate };
  if (cycle === "weekly") {
    const offset = (weekdayOf(saleDate) + 6) % 7; // 월요일까지 며칠 전인지
    const start = addDays(saleDate, -offset);
    const end = addDays(start, 6);
    const payout = addDays(end, 1);
    return { cycle, start, end, payoutStart: payout, payoutEnd: payout };
  }
  const month = saleDate.slice(0, 7);
  const { start, end } = monthRange(month);
  const next = nextMonthKey(month);
  return { cycle, start, end, payoutStart: `${next}-01`, payoutEnd: `${next}-03` };
}

// 오늘 기준 "다음 입금": 아직 입금일이 지나지 않은 가장 가까운 정산 기간(지난 기간 입금일이 남아 있으면 그것)
export function upcomingSettlement(today: string, cycle: SupplierSettlementCycle): SettlementPeriod {
  // 매일 정산은 오늘 판매분을 오늘 입금합니다.
  if (cycle === "daily") return settlementPeriodFor(today, cycle);
  if (cycle === "weekly") {
    const previous = settlementPeriodFor(addDays(today, -7), cycle);
    if (previous.payoutEnd >= today) return previous;
    return settlementPeriodFor(today, cycle);
  }
  const lastMonth = settlementPeriodFor(`${nextMonthKey(today.slice(0, 7), -1)}-01`, cycle);
  if (lastMonth.payoutEnd >= today) return lastMonth;
  return settlementPeriodFor(today, cycle);
}

// "12월 1~3일" · "11월 23일(월)"
export function formatPayoutLabel(period: Pick<SettlementPeriod, "payoutStart" | "payoutEnd">) {
  const [, startMonth, startDay] = period.payoutStart.split("-").map(Number);
  const [, , endDay] = period.payoutEnd.split("-").map(Number);
  if (period.payoutStart === period.payoutEnd) {
    const weekday = ["일", "월", "화", "수", "목", "금", "토"][weekdayOf(period.payoutStart)];
    return `${startMonth}월 ${startDay}일(${weekday})`;
  }
  return `${startMonth}월 ${startDay}~${endDay}일`;
}

// "11.1 ~ 11.30" · "11.16 ~ 11.22" · 하루면 "11.26"
export function formatPeriodLabel(period: Pick<SettlementPeriod, "start" | "end">) {
  const [, startMonth, startDay] = period.start.split("-").map(Number);
  const [, endMonth, endDay] = period.end.split("-").map(Number);
  if (period.start === period.end) return `${startMonth}.${startDay}`;
  return `${startMonth}.${startDay} ~ ${endMonth}.${endDay}`;
}

// 수수료(판매 대금 × 수수료율, 원 단위 반올림)
export function supplierCommission(netAmount: number, rate: number) {
  if (!Number.isFinite(netAmount) || !Number.isFinite(rate) || netAmount <= 0 || rate <= 0) return 0;
  return Math.round((netAmount * rate) / 100);
}

// ── 월 정산 상태(2026-11-23, migration 036) ─────────────────────────────────
// 마스터가 바꾸고 공급사 센터에서 함께 봅니다: 정산 대기 → 판매 대금 입금(두고푸드 → 공급사 100%) → 정산 완료(수수료까지 확인).
export type SupplierSettlementStatus = "pending" | "paid" | "done";
export const SUPPLIER_SETTLEMENT_STATUSES: SupplierSettlementStatus[] = ["pending", "paid", "done"];
export const SUPPLIER_SETTLEMENT_STATUS_LABELS: Record<SupplierSettlementStatus, string> = {
  pending: "정산 대기",
  paid: "판매 대금 입금 완료",
  done: "정산 완료"
};
export const SUPPLIER_SETTLEMENT_STATUS_HINTS: Record<SupplierSettlementStatus, string> = {
  pending: "두고푸드가 판매 대금을 아직 보내지 않았어요.",
  paid: "판매 대금 100%를 보냈어요. 수수료 입금을 확인하면 정산 완료로 바뀝니다.",
  done: "판매 대금 입금과 수수료 확인까지 끝났어요."
};

/** 마스터가 적어 둔 월 정산 상태(없으면 정산 대기) */
export type SupplierSettlementState = {
  month: string;
  status: SupplierSettlementStatus;
  saleAmount: number;
  commission: number;
  payoutAmount: number;
  commissionRate: number;
  paidAt: string | null;
  doneAt: string | null;
  memo: string | null;
  updatedAt: string | null;
};

// ── 정산 방식(2026-11-25 관리자 요청 "정산 시스템 2가지: 판매수수료 / 일반 도매") ──────────────────────
// - 판매수수료(commission, 기본·권장): 원가 = 수강생 단가 = 일반공급가를 같게 등록합니다. 물품 대금(판매 금액) 100%를
//   정산일에 먼저 보내고, 판매 수수료(기본 10%)는 한 달 판매 대금 기준으로 다음 달 1~3일에 공급사가 두고푸드에 보냅니다
//   (두고푸드가 '마케팅·세일즈 수수료' 세금계산서를 발행). 매출 1억이면 1,000만원이 두고푸드 수익으로 바로 잡힙니다.
// - 일반 도매(wholesale, 매입): 공급사 원가로 사서 두고푸드가 10~20% 마진을 붙여 수강생 단가·일반공급가로 팝니다.
//   원가 × 판매 수량을 정산일에 보내고 수수료는 없습니다. 공급사 화면에는 두고푸드 판매가 대신 원가 기준 금액만 보입니다.
// - 지급 주기: 주 정산(월~일 판매분 → 다음 주 월요일, 기본) · 월 정산(1일~말일 → 다음 달 1~3일)
//   · 매일 정산(2026-11-26: 입금이 확인돼야 출고하는 공급사 — 그날 판매분 물품 대금 + 배송비를 그날 입금,
//     판매수수료 방식이면 수수료는 다른 주기와 같이 한 달 물품 금액(배송비 제외) × 수수료율을 다음 달 1~3일에 받음).
// - 배송비: 공급사 매입 배송비는 100% 공급사에 줍니다(정산 입금에 더함).
export type SupplierSettlementType = "commission" | "wholesale";
export const SUPPLIER_SETTLEMENT_TYPES: readonly SupplierSettlementType[] = ["commission", "wholesale"];
export const SUPPLIER_SETTLEMENT_TYPE_LABELS: Record<SupplierSettlementType, string> = {
  commission: "판매수수료",
  wholesale: "일반 도매(매입)"
};
export type SupplierSettlementSettings = { type: SupplierSettlementType; commissionRate: number; cycle: SupplierSettlementCycle };
export const DEFAULT_SETTLEMENT_SETTINGS: SupplierSettlementSettings = { type: "commission", commissionRate: DEFAULT_SUPPLIER_COMMISSION_RATE, cycle: "weekly" };
/** 판매 수수료 세금계산서 품목 이름(두고푸드 → 공급사, 2026-11-25 관리자 결정 "판매 대행·마케팅 대행 수수료") */
export const COMMISSION_INVOICE_ITEM = "판매대행·마케팅대행 수수료";
/** 반품·환불 책임(공급사 화면·관리자 정산 설정에 같은 글) */
export const SUPPLIER_RETURN_POLICY = "반품·환불: 공급사 귀책(상품 문제)이면 위탁셀러(수강생) 응대(CS)는 두고푸드가 맡고, 제품 파손·변질은 공급사가 100% 책임지고 보상해요. 반품·환불된 금액은 정산 금액에서 빠져요.";

/** 저장·입력 값 정리(모르는 값이면 null). 빠진 칸은 base 값을 씁니다. 수수료율은 0~100%, 소수 첫째 자리까지. */
export function cleanSettlementSettings(input: unknown, base: SupplierSettlementSettings = DEFAULT_SETTLEMENT_SETTINGS): SupplierSettlementSettings | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const type = value.type === undefined ? base.type : value.type;
  if (type !== "commission" && type !== "wholesale") return null;
  const cycle = value.cycle === undefined ? base.cycle : value.cycle;
  if (cycle !== "weekly" && cycle !== "monthly" && cycle !== "daily") return null;
  const rate = value.commissionRate === undefined || value.commissionRate === null || value.commissionRate === "" ? base.commissionRate : Number(value.commissionRate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return null;
  return { type, cycle, commissionRate: Math.round(rate * 10) / 10 };
}

/** "판매수수료 10% · 주 정산" · "일반 도매(매입) · 월 정산" */
export function settlementSettingsLabel(settings: SupplierSettlementSettings) {
  const type = settings.type === "commission" ? `판매수수료 ${settings.commissionRate}%` : SUPPLIER_SETTLEMENT_TYPE_LABELS.wholesale;
  return `${type} · ${SUPPLIER_CYCLE_LABELS[settings.cycle]}`;
}

/** 정산 방식 안내(공급사 화면·관리자 설정 창) */
export function settlementPlanText(settings: SupplierSettlementSettings) {
  const when = settings.cycle === "daily"
    ? "그날 판매분은 그날"
    : settings.cycle === "weekly" ? "월요일~일요일 판매분을 다음 주 월요일에" : "매달 1일~말일 판매분을 다음 달 1~3일에";
  const afterPay = settings.cycle === "daily" ? "(입금이 확인되면 출고)" : "";
  if (settings.type === "wholesale") {
    return `일반 도매(매입) · ${SUPPLIER_CYCLE_LABELS[settings.cycle]}: ${when} 공급가(원가) × 판매 수량과 배송비를 입금해요${afterPay}. 판매 수수료는 없어요.`;
  }
  return `판매수수료 ${settings.commissionRate}% · ${SUPPLIER_CYCLE_LABELS[settings.cycle]}: ${when} 판매 대금 100%와 배송비를 먼저 입금해요${afterPay}. 판매 수수료 ${settings.commissionRate}%는 한 달 판매 대금(배송비 제외) 기준으로 두고푸드가 다음 달 초에 청구하면 1~3일에 보내 주시고, 입금이 확인되면 두고푸드가 '${COMMISSION_INVOICE_ITEM}' 세금계산서를 발행해요.`;
}

/** 판매 줄을 모은 금액(정산 계산 재료). 반품 = 취소·반품 처리 수량. 원가를 모르는 줄은 원가 0원으로 세고 costMissing에 셉니다. */
export type SettlementLedger = {
  saleAmount: number; // 판매 금액(두고푸드 공급가 × 판매 수량)
  returnAmount: number; // 취소·반품(두고푸드 공급가 기준)
  netAmount: number; // 판매 − 반품
  costAmount: number; // 원가 × 남은 수량(도매 정산 물품 대금)
  costReturnAmount: number; // 원가 × 반품 수량
  costMissing: number; // 원가를 모르는 판매 줄 수
  shippingFee: number; // 공급사 매입 배송비(100% 지급)
  shippingReceived: number; // 매출처(셀러)가 낸 배송비
};

export function emptyLedger(): SettlementLedger {
  return { saleAmount: 0, returnAmount: 0, netAmount: 0, costAmount: 0, costReturnAmount: 0, costMissing: 0, shippingFee: 0, shippingReceived: 0 };
}

export function addLedger<T extends SettlementLedger>(target: T, source: SettlementLedger): T {
  target.saleAmount += source.saleAmount;
  target.returnAmount += source.returnAmount;
  target.netAmount += source.netAmount;
  target.costAmount += source.costAmount;
  target.costReturnAmount += source.costReturnAmount;
  target.costMissing += source.costMissing;
  target.shippingFee += source.shippingFee;
  target.shippingReceived += source.shippingReceived;
  return target;
}

export type SettlementAmounts = {
  goodsAmount: number; // 물품 대금(판매수수료 = 판매 금액, 도매 = 원가 × 수량)
  shippingFee: number; // 배송비(100% 지급)
  payoutAmount: number; // 두고푸드 → 공급사 입금 합계
  commission: number; // 판매 수수료(공급사 → 두고푸드, 다음 달 1~3일)
  netIncome: number; // 공급사 실 수령(입금 − 수수료)
  doogoProfit: number; // 두고푸드 몫(수수료 또는 도매 마진)
};

export function settlementAmounts(ledger: SettlementLedger, settings: Pick<SupplierSettlementSettings, "type" | "commissionRate">): SettlementAmounts {
  const net = Math.max(0, ledger.netAmount);
  const cost = Math.max(0, ledger.costAmount);
  const shipping = Math.max(0, ledger.shippingFee);
  if (settings.type === "wholesale") {
    return { goodsAmount: cost, shippingFee: shipping, payoutAmount: cost + shipping, commission: 0, netIncome: cost + shipping, doogoProfit: net - cost };
  }
  const commission = supplierCommission(net, settings.commissionRate);
  return { goodsAmount: net, shippingFee: shipping, payoutAmount: net + shipping, commission, netIncome: net + shipping - commission, doogoProfit: commission };
}

/** 공급사 화면에 보이는 판매 금액: 판매수수료 = 판매 금액, 도매 = 원가 기준 공급 금액(두고푸드 판매가는 보여 주지 않음) */
export function supplierFacingAmounts(ledger: SettlementLedger, type: SupplierSettlementType) {
  if (type === "wholesale") return { saleAmount: ledger.costAmount + ledger.costReturnAmount, returnAmount: ledger.costReturnAmount, netAmount: ledger.costAmount };
  return { saleAmount: ledger.saleAmount, returnAmount: ledger.returnAmount, netAmount: ledger.netAmount };
}

// ── 정산 기록(supplier_settlements.month 칸에 기간 열쇠를 적음) ─────────────────────────────
// 주 정산 지급 = "w:<판매 주 월요일>", 월 정산 지급 = "YYYY-MM"(예전 월 정산 기록과 같은 열쇠), 매일 정산 지급 = "d:<판매일>",
// 판매 수수료 = "fee:YYYY-MM".
export type SettlementRecordKind = "weekly" | "monthly" | "daily" | "fee";
export const SETTLEMENT_RECORD_KINDS: readonly SettlementRecordKind[] = ["weekly", "monthly", "daily", "fee"];

export function isDateKey(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return utcToKey(keyToUtc(value)) === value;
}

/** 그 날짜가 든 주의 월요일 */
export function weekStartOf(date: string) {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

/** 기록 열쇠. 주 정산은 판매 주 월요일 날짜, 매일 정산은 판매일, 나머지는 YYYY-MM */
export function settlementRecordKey(kind: SettlementRecordKind, period: string) {
  if (kind === "weekly") return `w:${period}`;
  if (kind === "daily") return `d:${period}`;
  if (kind === "fee") return `fee:${period}`;
  return period;
}

/** 기간이 그 종류에 맞는지(주 정산 = 월요일 날짜, 매일 정산 = 날짜, 월·수수료 = YYYY-MM) */
export function isSettlementPeriod(kind: SettlementRecordKind, period: string | null | undefined): period is string {
  if (kind === "weekly") return isDateKey(period) && weekdayOf(period) === 1;
  if (kind === "daily") return isDateKey(period);
  return isMonthKey(period);
}

/** 판매 수수료 납부 기간: 그 달 판매분 → 다음 달 1~3일 */
export function feeDueRange(month: string) {
  const next = nextMonthKey(month);
  return { payoutStart: `${next}-01`, payoutEnd: `${next}-03` };
}

export const PAYOUT_STATUS_LABELS: Record<SupplierSettlementStatus, string> = { pending: "지급 대기", paid: "지급 완료", done: "지급 완료" };
// 판매 수수료(2026-11-25 관리자 확정 순서): 청구 전 → 청구함(공급사 입금 대기, 공급사 센터 달력에 입금일·금액) → 입금 확인 = 정산 완료.
// 수수료 세금계산서(두고푸드 → 공급사)는 입금을 확인한 뒤 따로 발행하고 "inv:YYYY-MM" 기록으로 남깁니다(feeInvoiceKey).
export const FEE_STATUS_LABELS: Record<SupplierSettlementStatus, string> = { pending: "청구 전", paid: "청구함 · 입금 대기", done: "입금 확인 · 정산 완료" };
export const SUPPLIER_PAYOUT_STATUS_LABELS: Record<SupplierSettlementStatus, string> = { pending: "입금 예정", paid: "입금 완료", done: "입금 완료" };
export const SUPPLIER_FEE_STATUS_LABELS: Record<SupplierSettlementStatus, string> = { pending: "청구 전", paid: "청구됨 · 두고푸드로 입금해 주세요", done: "입금 확인 · 정산 완료" };

/** 판매 수수료 세금계산서 발행 기록 열쇠(supplier_settlements.month): 발행하면 status "done" */
export function feeInvoiceKey(month: string) {
  return `inv:${month}`;
}

/** 판매 수수료 세금계산서(두고푸드 → 공급사) 발행 상태 */
export type FeeInvoiceState = { issued: boolean; issuedAt: string | null; amount: number | null };

/**
 * 판매 수수료 금액 나누기: 수수료에 부가세가 들어 있으면(기본) 공급가액 = round(수수료 × 10 ÷ 11)·세액 = 나머지·입금할 금액 = 수수료,
 * 부가세 별도면 공급가액 = 수수료·세액 = round(수수료 × 10%)·입금할 금액 = 수수료 + 세액.
 */
export function commissionInvoiceAmounts(commission: number, vatIncluded: boolean) {
  const amount = Math.max(0, Math.round(Number.isFinite(commission) ? commission : 0));
  if (vatIncluded) {
    const supply = Math.round((amount * 10) / 11);
    return { supply, tax: amount - supply, total: amount };
  }
  const tax = Math.round(amount / 10);
  return { supply: amount, tax, total: amount + tax };
}
