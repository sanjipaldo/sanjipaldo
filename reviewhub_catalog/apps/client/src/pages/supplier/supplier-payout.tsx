// 공급사 필수 정보(사업자등록번호 · 정산 계좌, 2026-11-27 관리자 요청 "공급사가 로그인할 때 무조건 적게 — 팝업으로,
// 적으면 자동 저장되고 자기 설정 페이지에서 쉽게 바꾸고, 바꾸면 관리자에게 알림").
// - SupplierPayoutGate: 공급사 센터에 들어왔는데 둘 중 하나라도 없으면(또는 사업자등록번호가 틀리면) 닫을 수 없는 팝업.
//   저장해야 공급사 센터를 쓸 수 있고, 아래 '로그아웃'만 있습니다.
// - SupplierPayoutCard: 내 정보의 "사업자등록번호 · 정산 계좌" 칸(보기 → '수정' → 같은 입력 칸).
// 저장하면 거래명세서 To 칸(사업자등록번호 · 입금 계좌)에 바로 들어가고, 두고푸드 관리자 화면에 '공급사가 변경' 알림이 남습니다.
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { BadgeCheck, Landmark, LogOut, Pencil, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { COMMON_BANKS, type SupplierBankAccount } from "@repo/shared/supplier-invoice";
import { parseBusinessNumber, parseRequiredBankAccount, type SupplierProfileField } from "@repo/shared/supplier-profile";
import { supplierPut, type SupplierPayout, type SupplierProfile } from "./supplier-api";

type Draft = { businessNumber: string; bankName: string; accountNumber: string; accountHolder: string };
type FieldKey = keyof Draft;

function draftOf(payout: SupplierPayout | undefined): Draft {
  return {
    businessNumber: payout?.businessNumber ?? "",
    bankName: payout?.bank?.bankName ?? "",
    accountNumber: payout?.bank?.accountNumber ?? "",
    accountHolder: payout?.bank?.accountHolder ?? ""
  };
}

/** 사업자등록번호를 치는 동안 붙임표 자동(123-45-67890) */
function formatBusinessInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

/** 칸마다 무엇이 틀렸는지(저장 전에 화면에서 먼저 확인) */
function checkDraft(draft: Draft): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {};
  const number = parseBusinessNumber(draft.businessNumber);
  if (number.error) errors.businessNumber = number.error;
  if (!draft.bankName.trim()) errors.bankName = "은행 이름을 써 주세요.";
  const bank = parseRequiredBankAccount(draft);
  if (bank.error && !errors.bankName) {
    if (/계좌번호/.test(bank.error)) errors.accountNumber = bank.error;
    else if (/예금주/.test(bank.error)) errors.accountHolder = bank.error;
    else if (/은행/.test(bank.error)) errors.bankName = bank.error;
    else errors.accountNumber = bank.error;
  }
  if (!draft.accountNumber.trim()) errors.accountNumber = "계좌번호를 써 주세요.";
  if (!draft.accountHolder.trim()) errors.accountHolder = "예금주를 써 주세요.";
  return errors;
}

type SavedPayout = { businessNumber: string; bank: SupplierBankAccount; missing: SupplierProfileField[]; changed: SupplierProfileField[] };

function PayoutFields({ initial, submitLabel, busyLabel, onSaved, onCancel, autoFocus = false }: {
  initial: Draft;
  submitLabel: string;
  busyLabel: string;
  onSaved: (payout: SupplierPayout, changed: SupplierProfileField[]) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState<Draft>(initial);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const initialRef = useRef(initial);

  // 처음 빈 칸에 바로 커서(열 때 한 번만 — 위 화면이 다시 그려져도 커서가 튀지 않게)
  useEffect(() => {
    if (!autoFocus) return;
    const order: FieldKey[] = ["businessNumber", "bankName", "accountNumber", "accountHolder"];
    const first = order.find((key) => !initialRef.current[key].trim()) ?? "businessNumber";
    formRef.current?.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
  }, [autoFocus]);

  const change = (key: FieldKey, value: string) => {
    setDraft((current) => ({ ...current, [key]: key === "businessNumber" ? formatBusinessInput(value) : value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = checkDraft(draft);
    setErrors(found);
    const firstError = (Object.keys(found) as FieldKey[]).find((key) => found[key]);
    if (firstError) {
      formRef.current?.querySelector<HTMLInputElement>(`[name="${firstError}"]`)?.focus();
      return;
    }
    setSaving(true);
    try {
      const data = await supplierPut<{ payout: SavedPayout }>("/payout", draft);
      onSaved({ businessNumber: data.payout.businessNumber, bank: data.payout.bank, missing: data.payout.missing }, data.payout.changed);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  // 칸 이름은 <label>만(읽어 주는 이름이 깔끔하게), 도움말·틀린 곳 안내는 aria-describedby로 연결
  const HINTS: Partial<Record<FieldKey, string>> = {
    businessNumber: "사업자등록증에 있는 숫자 10자리",
    accountNumber: "한 번 더 확인해 주세요. 정산 대금이 이 계좌로 들어가요."
  };
  const field = (key: FieldKey, label: string, input: ReactNode) => (
    <div className={`sup-payout-field${errors[key] ? " has-error" : ""}${key === "businessNumber" ? " is-solo" : ""}`}>
      <label htmlFor={`${id}-${key}`}>{label}</label>
      {input}
      {errors[key] ? <small className="sup-payout-error" id={`${id}-${key}-error`} role="alert">{errors[key]}</small> : HINTS[key] ? <small id={`${id}-${key}-hint`}>{HINTS[key]}</small> : null}
    </div>
  );
  const describedBy = (key: FieldKey) => (errors[key] ? `${id}-${key}-error` : HINTS[key] ? `${id}-${key}-hint` : undefined);

  return (
    <form ref={formRef} className="sup-payout-form" onSubmit={(event) => void submit(event)} noValidate>
      <fieldset className="sup-payout-group">
        <legend><BadgeCheck size={16} aria-hidden="true" /> 사업자등록번호</legend>
        {field("businessNumber", "사업자등록번호", (
          <input id={`${id}-businessNumber`} name="businessNumber" value={draft.businessNumber} onChange={(event) => change("businessNumber", event.target.value)} inputMode="numeric" autoComplete="off" placeholder="123-45-67890" maxLength={12} aria-invalid={Boolean(errors.businessNumber)} aria-describedby={describedBy("businessNumber")} />
        ))}
      </fieldset>
      <fieldset className="sup-payout-group">
        <legend><Landmark size={16} aria-hidden="true" /> 정산 받을 계좌</legend>
        <div className="sup-payout-bank">
          {field("bankName", "은행", (
            <input id={`${id}-bankName`} name="bankName" value={draft.bankName} onChange={(event) => change("bankName", event.target.value)} list={`${id}-banks`} autoComplete="off" placeholder="예: 농협은행" maxLength={30} aria-invalid={Boolean(errors.bankName)} aria-describedby={describedBy("bankName")} />
          ))}
          {field("accountHolder", "예금주", (
            <input id={`${id}-accountHolder`} name="accountHolder" value={draft.accountHolder} onChange={(event) => change("accountHolder", event.target.value)} autoComplete="off" placeholder="통장 이름" maxLength={40} aria-invalid={Boolean(errors.accountHolder)} aria-describedby={describedBy("accountHolder")} />
          ))}
        </div>
        {field("accountNumber", "계좌번호", (
          <input id={`${id}-accountNumber`} name="accountNumber" value={draft.accountNumber} onChange={(event) => change("accountNumber", event.target.value)} inputMode="numeric" autoComplete="off" placeholder="숫자와 - 만" maxLength={30} aria-invalid={Boolean(errors.accountNumber)} aria-describedby={describedBy("accountNumber")} />
        ))}
        <datalist id={`${id}-banks`}>{COMMON_BANKS.map((name) => <option key={name} value={name} />)}</datalist>
      </fieldset>
      <div className="sup-payout-actions">
        {onCancel && <button type="button" className="sup-payout-cancel" onClick={onCancel} disabled={saving}>취소</button>}
        <button type="submit" className="primary-action sup-payout-submit" disabled={saving}><ShieldCheck size={17} aria-hidden="true" /> {saving ? busyLabel : submitLabel}</button>
      </div>
    </form>
  );
}

/** 로그인 직후: 필수 정보가 없으면 닫을 수 없는 팝업(저장해야 공급사 센터를 씀) */
export function SupplierPayoutGate({ profile, onSaved, onSignOut }: { profile: SupplierProfile; onSaved: (payout: SupplierPayout) => void; onSignOut: () => void }) {
  const titleId = useId();
  const [initial] = useState(() => draftOf(profile.payout));
  const missing = profile.payout?.missing ?? [];
  const wrongNumber = missing.includes("businessNumber") && Boolean(profile.payout?.businessNumber);

  // 팝업이 떠 있는 동안 뒤 화면이 스크롤되지 않게
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  return (
    <div className="sup-payout-overlay" role="presentation">
      <section className="sup-payout-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="sup-payout-head">
          <span className="sup-payout-icon" aria-hidden="true"><Landmark size={22} /></span>
          <div>
            <span className="sup-payout-kicker">처음 한 번만</span>
            <h2 id={titleId}>정산 정보를 등록해 주세요</h2>
            <p>{profile.supplier.name}의 <b>사업자등록번호</b>와 <b>정산 받을 계좌</b>예요. 거래명세서와 정산 대금 입금에 쓰이고, 등록한 뒤에도 <b>내 정보</b>에서 언제든 바꿀 수 있어요.</p>
            {wrongNumber && <p className="sup-payout-warn">지금 등록된 사업자등록번호가 맞지 않아요. 사업자등록증을 보고 다시 확인해 주세요.</p>}
          </div>
        </header>
        <PayoutFields
          initial={initial}
          submitLabel="저장하고 시작하기"
          busyLabel="저장하는 중…"
          autoFocus
          onSaved={(payout) => {
            toast.success("정산 정보를 저장했어요. 거래명세서에 바로 들어가요.");
            onSaved(payout);
          }}
        />
        <button type="button" className="sup-payout-signout" onClick={onSignOut}><LogOut size={14} aria-hidden="true" /> 지금은 로그아웃</button>
      </section>
    </div>
  );
}

/** 내 정보: 사업자등록번호 · 정산 계좌 보기 → 수정 */
export function SupplierPayoutCard({ profile, onSaved }: { profile: SupplierProfile; onSaved: (payout: SupplierPayout) => void }) {
  const [editing, setEditing] = useState(false);
  const payout = profile.payout;
  const rows: Array<[string, string | null | undefined]> = [
    ["사업자등록번호", payout?.businessNumber],
    ["은행", payout?.bank?.bankName],
    ["계좌번호", payout?.bank?.accountNumber],
    ["예금주", payout?.bank?.accountHolder]
  ];
  return (
    <section className="admin-card sup-payout-card" id="payout" aria-labelledby="sup-payout-card-title">
      <div className="card-heading">
        <Landmark size={19} aria-hidden="true" />
        <div><h2 id="sup-payout-card-title">사업자등록번호 · 정산 계좌</h2><p>거래명세서와 정산 대금 입금에 쓰여요. 바꾸면 두고푸드 담당자에게도 알림이 가요.</p></div>
        {!editing && payout && <button type="button" className="sup-payout-edit" onClick={() => setEditing(true)}><Pencil size={14} aria-hidden="true" /> 수정</button>}
      </div>
      {editing ? (
        <PayoutFields
          initial={draftOf(payout)}
          submitLabel="저장"
          busyLabel="저장하는 중…"
          autoFocus
          onCancel={() => setEditing(false)}
          onSaved={(next, changed) => {
            toast.success(changed.length ? "저장했어요. 다음 정산부터 바뀐 정보로 보내 드려요." : "바뀐 내용이 없어요.");
            setEditing(false);
            onSaved(next);
          }}
        />
      ) : (
        <dl className="sup-info-list">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={value ? undefined : "is-missing"}>{value || "미등록"}</dd></div>)}</dl>
      )}
    </section>
  );
}
