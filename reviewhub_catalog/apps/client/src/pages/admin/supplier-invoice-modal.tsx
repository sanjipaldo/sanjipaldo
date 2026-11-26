// 관리자 > 공급사 정산 > 공급사 카드 오른쪽 위 '거래명세서'(2026-11-26 관리자 요청).
// 지급 합계가 며칠에 누가(주문자 = 매출처·수강생) 무엇을 몇 개·얼마에 사고 배송비가 얼마라서 나왔는지 인보이스 모양으로 보여 주고,
// PDF(두고푸드 로고 인보이스) · 엑셀(발주서 예시와 같은 칸 + 합계)로 받아 카카오톡·이메일로 공급사에 보냅니다.
// From = (주) 두고홀딩스, To = 공급사(사업자 정보는 공급사 관리, 입금 계좌는 여기서 넣음 — 마이그레이션 없이 저장).
import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, FileSpreadsheet, FileText, Landmark, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import {
  COMMON_BANKS,
  bankAccountLabel,
  invoiceDate,
  invoiceDayLabel,
  invoicePayoutLabel,
  invoicePeriodLabel,
  invoiceReference,
  invoiceSettingsLabel,
  invoiceStatusLabel,
  orderNumberLabel,
  parseBankAccount,
  type InvoiceKind,
  type InvoiceParty,
  type SupplierInvoice,
  type SupplierInvoiceLine
} from "@repo/shared/supplier-invoice";
import { seoulDateKey } from "@repo/shared/supplier-portal";
import { apiFetch } from "@/lib/api";
import { jsonInit, readData, saveResponseFile } from "./sales-admin-shared";

/** 팝업 표에 그리는 줄 수(넘는 줄은 PDF·엑셀에 모두 들어감) */
export const INVOICE_PREVIEW_LINES = 400;

const KIND_NAMES: Record<InvoiceKind, string> = { weekly: "주 정산", monthly: "월 정산", daily: "매일 정산" };

const num = (value: number) => Math.round(value).toLocaleString("ko-KR");
const krw = (value: number) => `₩${num(value)}`;

function paidDate(invoice: SupplierInvoice) {
  if (!invoice.paidAt) return "";
  const date = new Date(invoice.paidAt);
  return Number.isNaN(date.getTime()) ? "" : invoiceDate(seoulDateKey(date));
}

function fromLines(party: InvoiceParty) {
  return [
    [party.businessNumber && `사업자등록번호 ${party.businessNumber}`, party.ceoName && `대표 ${party.ceoName}`].filter(Boolean).join(" · "),
    party.address,
    [party.businessType && `업태 ${party.businessType}`, party.businessItem && `종목 ${party.businessItem}`].filter(Boolean).join(" · "),
    [party.website, party.email].filter(Boolean).join(" · ")
  ].filter(Boolean);
}

function toLines(party: InvoiceParty) {
  return [
    [party.businessNumber ? `사업자등록번호 ${party.businessNumber}` : "사업자등록번호 미등록", party.ceoName && `대표 ${party.ceoName}`].filter(Boolean).join(" · "),
    [party.phone && `연락처 ${party.phone}`, party.email && `이메일 ${party.email}`].filter(Boolean).join(" · "),
    party.address && `주소 ${party.address}`
  ].filter(Boolean);
}

function BankEditor({ invoice, onSaved, onCancel }: { invoice: SupplierInvoice; onSaved: () => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(() => ({
    bankName: invoice.bank?.bankName ?? "",
    accountNumber: invoice.bank?.accountNumber ?? "",
    accountHolder: invoice.bank?.accountHolder ?? invoice.to.name
  }));
  const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent, clear = false) => {
    event.preventDefault();
    const body = clear ? { bankName: "", accountNumber: "", accountHolder: "" } : draft;
    const checked = parseBankAccount(body);
    if (checked.error) {
      toast.error(checked.error);
      return;
    }
    if (clear && !window.confirm(`${invoice.to.name} 입금 계좌를 지울까요?`)) return;
    setSaving(true);
    try {
      await readData(await apiFetch("/baljuora/admin/settlements/bank-account", jsonInit("PUT", { supplierId: invoice.to.supplierId, ...body })));
      toast.success(clear ? "입금 계좌를 지웠어요." : "입금 계좌를 저장했어요. 거래명세서에 바로 들어가요.");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "입금 계좌를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <form className="inv-bank-form" onSubmit={(event) => void save(event)} aria-label="공급사 입금 계좌">
      <label><span>은행</span><input value={draft.bankName} onChange={(event) => setDraft({ ...draft, bankName: event.target.value })} list="inv-bank-names" maxLength={30} placeholder="예: 농협은행" required /></label>
      <label><span>계좌번호</span><input value={draft.accountNumber} onChange={(event) => setDraft({ ...draft, accountNumber: event.target.value })} inputMode="numeric" maxLength={30} placeholder="숫자와 - 만" required /></label>
      <label><span>예금주</span><input value={draft.accountHolder} onChange={(event) => setDraft({ ...draft, accountHolder: event.target.value })} maxLength={40} required /></label>
      <datalist id="inv-bank-names">{COMMON_BANKS.map((name) => <option key={name} value={name} />)}</datalist>
      <div className="inv-bank-actions">
        {invoice.bank && <button type="button" className="outline-button inv-bank-clear" onClick={(event) => void save(event, true)} disabled={saving}>지우기</button>}
        <button type="button" className="outline-button" onClick={onCancel} disabled={saving}>취소</button>
        <button type="submit" className="primary-action" disabled={saving}>저장</button>
      </div>
    </form>
  );
}

function LineRow({ line, wholesale }: { line: SupplierInvoiceLine; wholesale: boolean }) {
  const [, month, day] = line.date.split("-").map(Number);
  return (
    <tr className="inv-line">
      <td className="inv-c-date"><span>{month}.{day}</span><small>{invoiceDayLabel(line.date).replace(/^[^(]*/, "")}</small></td>
      <td className="inv-c-buyer">{line.buyer}</td>
      <td className="inv-c-product">
        <span>{line.productName}</span>
        {/* 2026-11-27: 긴 주문 코드·상품 코드 대신 "주문번호 : 6자리"(긴 코드는 마우스를 올리면 관리자만 봄) */}
        {line.orderNumber && <small className="inv-order-number" title={line.orderId ? `주문 코드 ${line.orderId}` : undefined}>{orderNumberLabel(line)}</small>}
      </td>
      <td className="inv-c-num inv-c-qty" data-label="수량">{num(line.quantity)}{line.returnQuantity > 0 && <small className="is-return">반품 {num(line.returnQuantity)}</small>}</td>
      <td className="inv-c-num inv-c-unit" data-label={wholesale ? "공급가" : "단가"}>{line.unitPrice === null ? <small className="is-return">확인 필요</small> : num(line.unitPrice)}</td>
      <td className="inv-c-num inv-c-amount" data-label="금액">{num(line.amount)}</td>
      <td className="inv-c-num inv-c-ship" data-label="배송비">{num(line.shippingFee)}</td>
      <td className="inv-c-num inv-c-total" data-label="합계"><b>{num(line.total)}</b></td>
    </tr>
  );
}

function InvoicePaper({ invoice, onBankSaved }: { invoice: SupplierInvoice; onBankSaved: () => void }) {
  const [editingBank, setEditingBank] = useState(false);
  const wholesale = invoice.settings.type === "wholesale";
  const paid = invoice.status !== "pending";
  const shown = invoice.lines.slice(0, INVOICE_PREVIEW_LINES);
  const hidden = invoice.lines.length - shown.length;
  const showSubtotals = invoice.days.length > 1;
  const dayOf = new Map(invoice.days.map((day) => [day.date, day]));
  const bank = bankAccountLabel(invoice.bank);
  const meta: Array<[string, string]> = [
    ["발행일", invoiceDate(invoice.issueDate)],
    ["거래 기간", invoicePeriodLabel(invoice)],
    ["지급 예정일", invoicePayoutLabel(invoice)],
    ["정산 방식", invoiceSettingsLabel(invoice.settings)],
    ["지급 상태", `${invoiceStatusLabel(invoice.status)}${paidDate(invoice) ? ` (${paidDate(invoice)})` : ""}`],
    ["참조 (Ref.)", invoiceReference(invoice)]
  ];
  return (
    <article className="inv-paper" aria-label="거래명세서 미리보기">
      <header className="inv-paper-head">
        <div className="inv-from">
          <img src="/assets/brand/doogo-food-logo-color.png" alt="DOOGO FOOD" width={104} height={36} />
          <span className="inv-label">FROM 보내는 곳</span>
          <strong>{[invoice.from.name, invoice.from.brand].filter(Boolean).join(" · ")}</strong>
          {fromLines(invoice.from).map((text) => <p key={text}>{text}</p>)}
        </div>
        <div className="inv-title">
          <b>INVOICE</b>
          <strong>거래명세서</strong>
          <small># {invoice.number}</small>
          <span className="inv-due-label">지급 합계 (Balance Due)</span>
          <span className="inv-due">{krw(invoice.totals.total)}</span>
          <span className={`inv-status${paid ? " is-paid" : ""}`}>{invoiceStatusLabel(invoice.status)}{paid && paidDate(invoice) ? ` · ${paidDate(invoice)}` : ""}</span>
        </div>
      </header>

      <section className="inv-parties">
        <div className="inv-to">
          <span className="inv-label">TO 받는 곳 (공급사)</span>
          <strong>{invoice.to.name}</strong>
          {toLines(invoice.to).map((text) => <p key={text}>{text}</p>)}
          <div className="inv-bank">
            <Landmark size={14} aria-hidden="true" />
            <span>입금 계좌</span>
            {bank ? <b>{bank}</b> : <b className="is-missing">미등록</b>}
            {invoice.to.registered && invoice.to.supplierId && !editingBank && (
              <button type="button" className="inv-bank-edit" onClick={() => setEditingBank(true)}>
                <Pencil size={12} aria-hidden="true" /> {invoice.bank ? "수정" : "입금 계좌 넣기"}
              </button>
            )}
          </div>
          {!invoice.to.registered && <p className="inv-hint">공급사 관리에 등록하면 사업자 정보와 입금 계좌를 넣을 수 있어요. <Link to="/admin/suppliers">공급사 관리</Link></p>}
          {editingBank && <BankEditor invoice={invoice} onCancel={() => setEditingBank(false)} onSaved={() => { setEditingBank(false); onBankSaved(); }} />}
        </div>
        <dl className="inv-meta">
          {meta.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
      </section>

      <div className="inv-table-wrap">
        <p className="inv-unit">(단위: 원)</p>
        <table className="inv-table">
          <thead>
            <tr>
              <th>판매일</th><th>주문자(매출처)</th><th>상품명 · 주문번호</th>
              <th className="inv-c-num">수량</th><th className="inv-c-num">{wholesale ? "공급가" : "단가"}</th><th className="inv-c-num">금액</th><th className="inv-c-num">배송비</th><th className="inv-c-num">합계</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.length === 0 && <tr className="inv-empty"><td colSpan={8}>이 기간에는 판매가 없습니다.</td></tr>}
            {shown.map((line, index) => {
              const next = shown[index + 1];
              const day = dayOf.get(line.date);
              const lastOfDay = (!next && hidden === 0) || (next !== undefined && next.date !== line.date);
              return (
                <Fragment key={line.id}>
                  <LineRow line={line} wholesale={wholesale} />
                  {showSubtotals && lastOfDay && day && (
                  <tr className="inv-subtotal">
                    <td colSpan={3}>{invoiceDayLabel(line.date)} 소계 · 주문 {num(day.orders)}건</td>
                    <td className="inv-c-num inv-c-qty" data-label="수량">{num(day.quantity)}</td>
                    <td className="inv-c-num inv-c-unit" aria-hidden="true" />
                    <td className="inv-c-num inv-c-amount" data-label="금액">{num(day.goodsAmount)}</td>
                    <td className="inv-c-num inv-c-ship" data-label="배송비">{num(day.shippingFee)}</td>
                    <td className="inv-c-num inv-c-total" data-label="합계"><b>{num(day.total)}</b></td>
                  </tr>
                  )}
                </Fragment>
              );
            })}
            {hidden > 0 && <tr className="inv-more"><td colSpan={8}>… 나머지 {num(hidden)}줄은 PDF·엑셀에 모두 들어 있어요(합계는 전체 금액).</td></tr>}
          </tbody>
        </table>
      </div>

      <section className="inv-totals">
        <ul className="inv-summary">
          <li>판매 {num(invoice.days.length)}일 · 주문 {num(invoice.totals.orders)}건 · 판매 줄 {num(invoice.totals.lines)}개</li>
          <li>수량 {num(invoice.totals.quantity)}개{invoice.totals.returnQuantity ? ` (취소·반품 ${num(invoice.totals.returnQuantity)}개 뺌)` : ""}</li>
          {invoice.commission && <li>판매 수수료 {invoice.commission.rate}%는 빼지 않았어요(다음 달 1~3일 따로 청구).</li>}
          {invoice.totals.costMissing > 0 && <li className="is-warn">공급가 확인 필요 {num(invoice.totals.costMissing)}줄은 0원으로 셌어요.</li>}
        </ul>
        <dl className="inv-sum">
          <div><dt>물품 대금 합계 <small>({wholesale ? "공급가" : "판매 단가"} × 수량)</small></dt><dd>{num(invoice.totals.goodsAmount)}</dd></div>
          <div><dt>배송비 합계</dt><dd>{num(invoice.totals.shippingFee)}</dd></div>
          <div className="is-total"><dt>총합계 (Total)</dt><dd>{krw(invoice.totals.total)}</dd></div>
          <div className="is-due"><dt>지급 합계 (Balance Due)</dt><dd>{krw(invoice.totals.total)}</dd></div>
        </dl>
      </section>

      <section className="inv-notes">
        <h3>메모 (Memo)</h3>
        {invoice.notes.map((note) => <p key={note}>{note}</p>)}
        <p>두고푸드와 거래해 주셔서 감사합니다. THANKS FOR YOUR BUSINESS.</p>
        <h3>입금 계좌 (Terms &amp; Conditions)</h3>
        {invoice.bank ? (
          <>
            <p>BANK NAME · 은행 : {invoice.bank.bankName}</p>
            <p>ACCOUNT NAME · 예금주 : {invoice.bank.accountHolder}</p>
            <p><b>ACCOUNT NUMBER · 계좌번호 : {invoice.bank.accountNumber}</b></p>
          </>
        ) : <p className="is-warn">공급사 입금 계좌가 아직 등록되지 않았습니다. 공급사가 공급사 센터에 로그인하면 바로 등록하게 돼요.</p>}
      </section>
      <footer className="inv-paper-foot">(주) 두고홀딩스 · DOOGO FOOD · doogofood.site — 두고푸드 공급사 정산 거래명세서</footer>
    </article>
  );
}

export function SupplierInvoiceModal({ kind, period, supplierName, onClose }: { kind: InvoiceKind; period: string; supplierName: string; onClose: () => void }) {
  const [invoice, setInvoice] = useState<SupplierInvoice | null>(null);
  const [failure, setFailure] = useState("");
  const [downloading, setDownloading] = useState<"" | "pdf" | "xlsx">("");
  const closeRef = useRef<HTMLButtonElement>(null);
  const query = `kind=${kind}&period=${encodeURIComponent(period)}&supplier=${encodeURIComponent(supplierName)}`;

  const load = useCallback(async () => {
    try {
      setFailure("");
      setInvoice(await readData<SupplierInvoice>(await apiFetch(`/baljuora/admin/settlements/invoice?${query}`, { silent: true })));
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "거래명세서를 불러오지 못했습니다.");
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);
  // 열릴 때 한 번만 닫기 단추로 초점(부모가 다시 그려져도 입력 중인 칸에서 초점을 빼앗지 않게)
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const download = async (format: "pdf" | "xlsx") => {
    setDownloading(format);
    try {
      const response = await apiFetch(`/baljuora/admin/settlements/invoice/file?${query}&format=${format}`);
      if (!response.ok) return;
      await saveResponseFile(response, `두고푸드_거래명세서_${supplierName}.${format}`);
      toast.success(format === "pdf" ? "PDF를 받았어요. 카카오톡·이메일에 첨부해 보내 주세요." : "엑셀을 받았어요.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "파일을 받지 못했습니다.");
    } finally {
      setDownloading("");
    }
  };

  return (
    <div className="modal-backdrop sa-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="sa-modal inv-modal" role="dialog" aria-modal="true" aria-labelledby="inv-modal-title">
        <div className="sa-modal-head">
          <div>
            <span>거래명세서 · {KIND_NAMES[kind]}{invoice ? ` · ${invoicePeriodLabel(invoice)}` : ""}</span>
            <h2 id="inv-modal-title">{supplierName}</h2>
          </div>
          <button ref={closeRef} type="button" className="sa-icon-button" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        </div>
        <div className="inv-toolbar">
          <div className="inv-downloads">
            <button type="button" className="primary-action" onClick={() => void download("pdf")} disabled={!invoice || downloading !== ""}><FileText size={16} aria-hidden="true" /> {downloading === "pdf" ? "만드는 중…" : "PDF 다운로드"}</button>
            <button type="button" className="outline-button" onClick={() => void download("xlsx")} disabled={!invoice || downloading !== ""}><FileSpreadsheet size={16} aria-hidden="true" /> {downloading === "xlsx" ? "만드는 중…" : "엑셀 다운로드"}</button>
          </div>
          <p>받은 파일을 카카오톡·이메일에 그대로 첨부해 공급사에 보내요.</p>
        </div>
        {invoice && invoice.warnings.length > 0 && (
          <ul className="inv-warnings">
            {invoice.warnings.map((warning) => (
              <li key={warning}>
                <AlertTriangle size={14} aria-hidden="true" />
                <span>{warning}{warning.startsWith("공급사 사업자등록번호") && invoice.to.supplierId && <> <Link to={`/admin/suppliers?supplier=${encodeURIComponent(invoice.to.supplierId)}`}>공급사 관리에서 채우기</Link></>}</span>
              </li>
            ))}
          </ul>
        )}
        {failure && <p className="inv-failure" role="alert">{failure}</p>}
        {!invoice && !failure && <p className="inv-loading">거래명세서를 만드는 중…</p>}
        {invoice && <InvoicePaper invoice={invoice} onBankSaved={() => void load()} />}
      </section>
    </div>
  );
}
