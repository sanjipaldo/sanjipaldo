// 공급사 센터 공용 정의(서버·화면 공용, 2026-11-20 관리자 요청).
// - 공급사가 바꿀 수 있는 상품 값(변경 요청)과 이름표
// - 요청 상태 이름
// - 정산 주기(월 정산·주 정산)별 판매 기간과 입금일 계산
// 공급사에게 보이는 화면에는 "발주오라"를 쓰지 않습니다(CLAUDE.md 공급사 거래 방식).

export type SupplierSettlementCycle = "monthly" | "weekly";
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
  weekly: "주 정산"
};

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
// 주 정산 = 그 주 월~일 → 다음 주 월요일 입금(공급사 사용방법·제안서와 같은 기준).
export function settlementPeriodFor(saleDate: string, cycle: SupplierSettlementCycle): SettlementPeriod {
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

// "11.1 ~ 11.30" · "11.16 ~ 11.22"
export function formatPeriodLabel(period: Pick<SettlementPeriod, "start" | "end">) {
  const [, startMonth, startDay] = period.start.split("-").map(Number);
  const [, endMonth, endDay] = period.end.split("-").map(Number);
  return `${startMonth}.${startDay} ~ ${endMonth}.${endDay}`;
}

// 수수료(판매 대금 × 수수료율, 원 단위 반올림)
export function supplierCommission(netAmount: number, rate: number) {
  if (!Number.isFinite(netAmount) || !Number.isFinite(rate) || netAmount <= 0 || rate <= 0) return 0;
  return Math.round((netAmount * rate) / 100);
}
