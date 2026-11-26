// 공급사 필수 정보(2026-11-27 관리자 요청 "공급사가 로그인할 때 사업자등록번호·정산 받을 통장을 무조건 적게 — 팝업으로,
// 적으면 자동 저장되고 자기 설정 페이지에서 쉽게 바꾸고, 공급사가 바꾸면 관리자에게 '공급사가 변경했다' 알림 로그"):
// - 사업자등록번호 = 공급사 관리의 사업자등록번호(suppliers.businessNumber)
// - 정산 계좌 = 거래명세서의 입금 계좌(baljuora_sync_store "supplier_bank_accounts") — 둘 다 거래명세서 To 칸에 바로 들어갑니다.
// - 둘 중 하나라도 없으면(또는 사업자등록번호가 틀리면) 공급사 센터에 들어오자마자 닫을 수 없는 팝업으로 받습니다.
// - 공급사가 등록·변경하면 supplier_profile_changes(migration 038)에 남겨 관리자 화면에 알림을 띄웁니다. 계좌번호는 끝 4자리만 남깁니다.
import { parseBankAccount, type SupplierBankAccount } from "./supplier-invoice";

export type SupplierProfileField = "businessNumber" | "bank";
export const SUPPLIER_PROFILE_FIELDS: readonly SupplierProfileField[] = ["businessNumber", "bank"];
export const SUPPLIER_PROFILE_FIELD_LABELS: Record<SupplierProfileField, string> = { businessNumber: "사업자등록번호", bank: "정산 계좌" };

const BUSINESS_NUMBER_WEIGHTS = [1, 3, 7, 1, 3, 7, 1, 3, 5];

/** 사업자등록번호 마지막 자리(검증 숫자)가 맞는지 — 국세청 규칙(가중치 1·3·7·1·3·7·1·3·5) */
export function isValidBusinessNumber(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length !== 10 || (value ?? "").replace(/[\d\s-]/g, "") !== "") return false;
  let sum = 0;
  for (let index = 0; index < 9; index += 1) sum += Number(digits[index]) * BUSINESS_NUMBER_WEIGHTS[index];
  sum += Math.floor((Number(digits[8]) * 5) / 10);
  return (10 - (sum % 10)) % 10 === Number(digits[9]);
}

/** 입력한 사업자등록번호 확인. 맞으면 "123-45-67890" 모양으로 돌려줍니다. */
export function parseBusinessNumber(input: unknown): { value: string | null; error: string | null } {
  const text = typeof input === "string" ? input.trim() : "";
  if (!text) return { value: null, error: "사업자등록번호를 써 주세요." };
  if (!/^[\d\s-]+$/.test(text)) return { value: null, error: "사업자등록번호는 숫자와 붙임표(-)만 써 주세요." };
  const digits = text.replace(/\D/g, "");
  if (digits.length !== 10) return { value: null, error: "사업자등록번호는 숫자 10자리예요(예: 123-45-67890)." };
  if (!isValidBusinessNumber(digits)) return { value: null, error: "사업자등록번호를 다시 확인해 주세요. 숫자가 하나 틀린 것 같아요." };
  return { value: `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`, error: null };
}

/** 정산 계좌 확인(세 칸 모두 필요 — 공급사 필수 정보라 비워 둘 수 없음) */
export function parseRequiredBankAccount(input: unknown): { value: SupplierBankAccount | null; error: string | null } {
  const checked = parseBankAccount(input);
  if (checked.error) return checked;
  if (!checked.value) return { value: null, error: "정산 받을 계좌(은행·계좌번호·예금주)를 써 주세요." };
  return checked;
}

/** 이 공급사에 아직 없는(또는 틀린) 필수 정보 */
export function missingSupplierProfile(input: { businessNumber: string | null | undefined; bank: SupplierBankAccount | null | undefined }): SupplierProfileField[] {
  const missing: SupplierProfileField[] = [];
  if (!isValidBusinessNumber(input.businessNumber)) missing.push("businessNumber");
  if (!input.bank || !parseBankAccount(input.bank).value) missing.push("bank");
  return missing;
}

/** 계좌번호 끝 4자리만: "···1234" */
export function maskAccountNumber(accountNumber: string) {
  const digits = accountNumber.replace(/\D/g, "");
  return `···${digits.slice(-4)}`;
}

/** 알림·기록에 남기는 계좌(끝 4자리만): "농협은행 ···1234 (예금주 봄날농원)" */
export function maskedBankLabel(bank: SupplierBankAccount | null | undefined) {
  if (!bank) return null;
  return `${bank.bankName} ${maskAccountNumber(bank.accountNumber)} (예금주 ${bank.accountHolder})`;
}

// ── 관리자 알림 기록(공급사가 등록·변경) ─────────────────────────────────────────
export type SupplierProfileChangeValue = { before: string | null; after: string | null };
export type SupplierProfileChange = {
  id: string;
  supplierId: string;
  supplierName: string;
  /** 바꾼 사람(공급사 아이디) */
  changedBy: string | null;
  fields: SupplierProfileField[];
  summary: Partial<Record<SupplierProfileField, SupplierProfileChangeValue>>;
  checkedAt: string | null;
  checkedBy: string | null;
  createdAt: string;
};

/** 칸 하나: 전에 없었으면 "등록", 있었으면 "변경" */
export function profileChangeAction(value: SupplierProfileChangeValue | undefined) {
  return value?.before ? "변경" : "등록";
}

/** "정산 계좌 변경 · 사업자등록번호 등록" */
export function profileChangeText(change: Pick<SupplierProfileChange, "fields" | "summary">) {
  return change.fields.map((field) => `${SUPPLIER_PROFILE_FIELD_LABELS[field]} ${profileChangeAction(change.summary[field])}`).join(" · ");
}

/** 기록에 남길 바뀐 칸(전 → 후). 바뀐 게 없으면 빈 목록 */
export function profileChangeSummary(
  before: { businessNumber: string | null; bank: SupplierBankAccount | null },
  after: { businessNumber: string | null; bank: SupplierBankAccount | null }
) {
  const fields: SupplierProfileField[] = [];
  const summary: SupplierProfileChange["summary"] = {};
  const beforeNumber = before.businessNumber?.trim() || null;
  const digitsOf = (value: string | null) => (value ?? "").replace(/\D/g, "");
  // 붙임표만 다른 같은 번호("1234567890" → "123-45-67890")는 바뀐 것으로 치지 않습니다.
  if (digitsOf(beforeNumber) !== digitsOf(after.businessNumber)) {
    fields.push("businessNumber");
    summary.businessNumber = { before: beforeNumber, after: after.businessNumber };
  }
  const sameBank = before.bank && after.bank
    && before.bank.bankName === after.bank.bankName
    && before.bank.accountNumber === after.bank.accountNumber
    && before.bank.accountHolder === after.bank.accountHolder;
  if (!sameBank && (before.bank || after.bank)) {
    fields.push("bank");
    summary.bank = { before: maskedBankLabel(before.bank), after: maskedBankLabel(after.bank) };
  }
  return { fields, summary };
}
