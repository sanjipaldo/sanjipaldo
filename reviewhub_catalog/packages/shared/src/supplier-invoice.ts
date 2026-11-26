// 공급사 거래명세서(정산 인보이스, 2026-11-26 관리자 요청 "공급사 정산 금액이 며칠에 무엇이 얼마 팔리고 배송비가 얼마라서
// 이 금액이 됐는지 인보이스처럼 — 팝업으로 보고 엑셀·PDF로 받아 카카오톡·이메일로 공급사에 보냄").
// - From = (주) 두고홀딩스(DOOGO FOOD), To = 공급사(사업자등록번호·대표·연락처·주소·입금 계좌).
// - 줄 = 그 지급 기간(주 정산 월~일 · 월 정산 1일~말일 · 매일 정산 하루)의 판매 줄 하나하나:
//   판매일 · 주문자(매출처 = 위탁셀러·수강생) · 상품 코드·상품명 · 수량(반품 뺌) · 단가 · 금액(단가 × 수량) · 배송비 · 합계.
//   일반 도매(매입) 공급사는 단가 = 공급가(원가)이고 두고푸드 판매가는 넣지 않습니다. 판매수수료 공급사는 단가 = 판매 단가.
// - 맨 아래 합계 = 물품 대금 합계 + 배송비 합계 = 관리자 공급사 정산 화면의 '지급 합계'와 같은 금액.
// - 공급사 입금 계좌는 마이그레이션 없이 baljuora_sync_store "supplier_bank_accounts" = { [공급사 id]: 계좌 }에 둡니다.
import {
  SUPPLIER_CYCLE_HINTS,
  SUPPLIER_CYCLE_LABELS,
  SUPPLIER_SETTLEMENT_TYPE_LABELS,
  addDays,
  feeDueRange,
  isDateKey,
  monthRange,
  weekdayOf,
  type SettlementRecordKind,
  type SupplierSettlementSettings,
  type SupplierSettlementStatus
} from "./supplier-portal";

/** 거래명세서를 만드는 지급 기간 종류(판매 수수료 청구 탭은 빼고) */
export type InvoiceKind = Exclude<SettlementRecordKind, "fee">;
export const INVOICE_KINDS: readonly InvoiceKind[] = ["weekly", "monthly", "daily"];
export function isInvoiceKind(value: unknown): value is InvoiceKind {
  return value === "weekly" || value === "monthly" || value === "daily";
}

/** 한 거래명세서에 넣는 판매 줄 수 한도(넘으면 기간을 나눠 받도록 안내) */
export const INVOICE_MAX_LINES = 5000;

// ── 공급사 입금 계좌 ──────────────────────────────────────────────────────────

export type SupplierBankAccount = { bankName: string; accountNumber: string; accountHolder: string };
export type StoredBankAccount = SupplierBankAccount & { updatedAt: string; updatedBy: string | null };
export const BANK_ACCOUNT_STORE_KEY = "supplier_bank_accounts";
export const BANK_ACCOUNT_LIMITS = { bankName: 30, accountNumber: 30, accountHolder: 40 } as const;
/** 은행 이름 고르기 도움말(직접 써도 됨) */
export const COMMON_BANKS = [
  "국민은행", "신한은행", "우리은행", "하나은행", "농협은행", "지역농협", "기업은행", "카카오뱅크", "토스뱅크", "케이뱅크",
  "새마을금고", "신협", "수협은행", "우체국", "SC제일은행", "부산은행", "대구은행(iM뱅크)", "경남은행", "광주은행", "전북은행", "제주은행", "산림조합"
] as const;

function oneLine(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return Array.from(value, (char) => (char.charCodeAt(0) < 32 ? " " : char)).join("").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * 입력한 입금 계좌 정리. 세 칸이 모두 비면 지우기(value null, error null).
 * 계좌번호는 숫자와 붙임표(-)만, 숫자 6~20자리입니다.
 */
export function parseBankAccount(input: unknown): { value: SupplierBankAccount | null; error: string | null } {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const bankName = oneLine(record.bankName, BANK_ACCOUNT_LIMITS.bankName);
  const accountHolder = oneLine(record.accountHolder, BANK_ACCOUNT_LIMITS.accountHolder);
  const rawNumber = oneLine(record.accountNumber, BANK_ACCOUNT_LIMITS.accountNumber).replace(/\s+/g, "");
  if (!bankName && !accountHolder && !rawNumber) return { value: null, error: null };
  if (!bankName) return { value: null, error: "은행 이름을 써 주세요." };
  if (!rawNumber) return { value: null, error: "계좌번호를 써 주세요." };
  if (!/^[0-9-]+$/.test(rawNumber)) return { value: null, error: "계좌번호는 숫자와 붙임표(-)만 써 주세요." };
  const digits = rawNumber.replace(/-/g, "").length;
  if (digits < 6 || digits > 20) return { value: null, error: "계좌번호 숫자 자리 수를 확인해 주세요(6~20자리)." };
  if (!accountHolder) return { value: null, error: "예금주를 써 주세요." };
  const accountNumber = rawNumber.replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
  return { value: { bankName, accountNumber, accountHolder }, error: null };
}

export function bankAccountLabel(bank: SupplierBankAccount | null | undefined) {
  if (!bank) return "";
  return `${bank.bankName} ${bank.accountNumber} (예금주 ${bank.accountHolder})`;
}

// ── 거래명세서 ────────────────────────────────────────────────────────────────

export type InvoiceParty = {
  name: string;
  brand: string;
  businessNumber: string; // "123-45-67890"(모르면 빈칸)
  ceoName: string;
  address: string;
  phone: string;
  email: string;
  businessType: string;
  businessItem: string;
  website: string;
};

export type SupplierInvoiceLine = {
  id: string;
  date: string; // 판매일(한국 날짜)
  orderedAt: string | null; // 주문 시각(ISO)
  orderId: string | null; // 주문 번호(상품주문코드)
  buyer: string; // 주문자 = 매출처(위탁셀러·수강생)
  productCode: string | null;
  productName: string;
  orderedQuantity: number; // 주문 수량
  quantity: number; // 반품 뺀 수량(금액 계산 수량)
  returnQuantity: number;
  unitPrice: number | null; // 일반 도매 = 공급가(원가, 모르면 null), 판매수수료 = 판매 단가
  amount: number; // 단가 × 수량
  shippingFee: number; // 공급사 배송비(100% 지급)
  total: number; // 금액 + 배송비
  costMissing: boolean; // 일반 도매인데 공급가를 모르는 줄(금액 0원으로 셈)
};

export type SupplierInvoiceDay = { date: string; lines: number; orders: number; quantity: number; goodsAmount: number; shippingFee: number; total: number };

export type SupplierInvoiceTotals = {
  goodsAmount: number;
  shippingFee: number;
  total: number;
  quantity: number;
  returnQuantity: number;
  orders: number;
  lines: number;
  costMissing: number;
};

export type SupplierInvoice = {
  number: string;
  issueDate: string;
  kind: InvoiceKind;
  period: string;
  start: string;
  end: string;
  payoutStart: string;
  payoutEnd: string;
  supplierName: string;
  settings: SupplierSettlementSettings;
  status: SupplierSettlementStatus;
  paidAt: string | null;
  from: InvoiceParty;
  to: InvoiceParty & { supplierId: string | null; registered: boolean };
  bank: SupplierBankAccount | null;
  lines: SupplierInvoiceLine[];
  days: SupplierInvoiceDay[];
  totals: SupplierInvoiceTotals;
  /** 관리자 정산 화면 금액(같은 기간·같은 계산)과 맞는지 */
  settlement: { goodsAmount: number; shippingFee: number; payoutAmount: number; matches: boolean };
  /** 판매수수료 공급사: 이 기간 판매 대금 × 수수료율(참고 — 실제 청구는 한 달 합계로 다음 달 1~3일) */
  commission: { rate: number; amount: number } | null;
  warnings: string[];
  notes: string[];
};

/** 두고푸드(From) 기본 정보 — 공개 단가표 아래 사업자 정보와 같음. 세금계산서 신고 화면의 공급자 정보가 있으면 그 값을 씁니다. */
export const DOOGO_COMPANY: InvoiceParty = {
  name: "(주) 두고홀딩스",
  brand: "DOOGO FOOD",
  businessNumber: "726-87-03167",
  ceoName: "문원오",
  address: "세종특별자치시 갈매로 353 에비뉴힐 5층 5023호 (우) 30121",
  phone: "",
  email: "",
  businessType: "",
  businessItem: "",
  website: "doogofood.site"
};

/** "1234567890" → "123-45-67890"(10자리가 아니면 그대로) */
export function formatBusinessNumber(value: string | null | undefined) {
  const text = (value ?? "").trim();
  const digits = text.replace(/\D/g, "");
  return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}` : text;
}

// 공급사 이름 → 짧은 글자(FNV-1a). 같은 공급사·같은 기간이면 언제 받아도 같은 번호입니다.
function shortKey(value: string) {
  let hash = 0x811c9dc5;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).toUpperCase().padStart(5, "0").slice(-5);
}

/** 거래명세서 번호: DF-W261116-XXXXX(주 정산: 판매 주 월요일) · DF-M2611-XXXXX(월 정산) · DF-D261126-XXXXX(매일 정산) */
export function invoiceNumber(kind: InvoiceKind, period: string, supplierName: string) {
  const letter = kind === "weekly" ? "W" : kind === "monthly" ? "M" : "D";
  return `DF-${letter}${period.replace(/-/g, "").slice(2)}-${shortKey(supplierName.trim())}`;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** "11.16(월)" */
export function invoiceDayLabel(date: string) {
  if (!isDateKey(date)) return date;
  const [, month, day] = date.split("-").map(Number);
  return `${month}.${day}(${WEEKDAYS[weekdayOf(date)]})`;
}

/** "2026.11.16" */
export function invoiceDate(date: string) {
  return date.replace(/-/g, ".");
}

/** 거래 기간: "2026.11.16 ~ 2026.11.22" · 하루면 "2026.11.26" */
export function invoicePeriodLabel(invoice: Pick<SupplierInvoice, "start" | "end">) {
  return invoice.start === invoice.end ? invoiceDate(invoice.start) : `${invoiceDate(invoice.start)} ~ ${invoiceDate(invoice.end)}`;
}

/** 지급 예정일: "2026.11.23(월)" · "2026.12.01 ~ 12.03" */
export function invoicePayoutLabel(invoice: Pick<SupplierInvoice, "payoutStart" | "payoutEnd">) {
  if (invoice.payoutStart === invoice.payoutEnd) return `${invoiceDate(invoice.payoutStart)}(${WEEKDAYS[weekdayOf(invoice.payoutStart)]})`;
  return `${invoiceDate(invoice.payoutStart)} ~ ${invoice.payoutEnd.slice(5).replace("-", ".")}`;
}

/** "판매수수료 10% · 주 정산" · "일반 도매(매입) · 월 정산" */
export function invoiceSettingsLabel(settings: SupplierSettlementSettings) {
  const type = settings.type === "commission" ? `${SUPPLIER_SETTLEMENT_TYPE_LABELS.commission} ${settings.commissionRate}%` : SUPPLIER_SETTLEMENT_TYPE_LABELS.wholesale;
  return `${type} · ${SUPPLIER_CYCLE_LABELS[settings.cycle]}`;
}

/** 참조(Ref): "2026.11.16 ~ 11.22 주 정산 거래 금액" */
export function invoiceReference(invoice: Pick<SupplierInvoice, "kind" | "start" | "end">) {
  const label = invoice.kind === "weekly" ? "주 정산" : invoice.kind === "monthly" ? "월 정산" : "매일 정산";
  if (invoice.kind === "monthly") return `${invoice.start.slice(0, 7).replace("-", ".")}월 ${label} 거래 금액`;
  if (invoice.start === invoice.end) return `${invoiceDate(invoice.start)} ${label} 거래 금액`;
  return `${invoiceDate(invoice.start)} ~ ${invoice.end.slice(5).replace("-", ".")} ${label} 거래 금액`;
}

/** 지급 상태 글 */
export function invoiceStatusLabel(status: SupplierSettlementStatus) {
  return status === "pending" ? "지급 대기" : "지급 완료";
}

/** 메모(팝업·PDF·엑셀 공용) */
export function invoiceNotes(invoice: Pick<SupplierInvoice, "settings" | "start" | "end" | "payoutStart" | "payoutEnd" | "kind">) {
  const { settings } = invoice;
  const when = `${invoicePeriodLabel(invoice)} 판매분 → ${invoicePayoutLabel(invoice)} 입금(${SUPPLIER_CYCLE_HINTS[settings.cycle]})`;
  const notes = [when];
  if (settings.type === "wholesale") {
    notes.push("일반 도매(매입): 공급가(원가) × 판매 수량과 배송비 100%를 입금합니다. 판매 수수료는 없습니다.");
  } else {
    notes.push(`판매수수료 ${settings.commissionRate}%: 판매 대금 100%와 배송비 100%를 입금합니다. 판매 수수료 ${settings.commissionRate}%는 이 금액에서 빼지 않고, 한 달 판매 대금(배송비 제외) 기준으로 다음 달 1~3일에 따로 청구합니다.`);
  }
  notes.push("수량은 취소·반품을 뺀 수량이고, 금액 = 단가 × 수량, 합계 = 금액 + 배송비입니다.");
  return notes;
}

/** 내려받기 파일 이름: 두고푸드_거래명세서_대현에벤에셀_2026-11-16~11-22.pdf */
export function invoiceFileName(invoice: Pick<SupplierInvoice, "supplierName" | "start" | "end" | "kind">, extension: "pdf" | "xlsx") {
  const supplier = invoice.supplierName.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40) || "공급사";
  const period = invoice.kind === "monthly" ? invoice.start.slice(0, 7) : invoice.start === invoice.end ? invoice.start : `${invoice.start}~${invoice.end.slice(5)}`;
  return `두고푸드_거래명세서_${supplier}_${period}.${extension}`;
}

/** 지급 기간(판매 기간 + 지급 예정일). 주 정산 period = 판매 주 월요일, 월 정산 = YYYY-MM, 매일 정산 = 판매일 */
export function invoiceWindow(kind: InvoiceKind, period: string) {
  if (kind === "daily") return { start: period, end: period, payoutStart: period, payoutEnd: period };
  if (kind === "weekly") {
    const payout = addDays(period, 7);
    return { start: period, end: addDays(period, 6), payoutStart: payout, payoutEnd: payout };
  }
  return { ...monthRange(period), ...feeDueRange(period) };
}
