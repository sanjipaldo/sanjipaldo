// 관리자 > 세금계산서 신고(2026-11-23, 관리자 요청 "매월 초 면세·과세 나눠 홈택스 신고 → 버튼 누르면 그 달 양식대로"):
// 발주오라에서 불러온 판매로 매출처별 월 합계 세금계산서(과세 상품)·계산서(면세 상품, 농축수산물) 엑셀을 홈택스 일괄발급 양식과 같은 칸으로 만듭니다.
// 홈택스 > 전자(세금)계산서 > 발급 > 일괄발급(엑셀 업로드)에 그대로 올립니다(100건씩 나눔, 발급은 50건씩 처리).
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Info, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { HOMETAX_KIND_LABELS, HOMETAX_MAX_ROWS, type HometaxKind, type HometaxSettings } from "@repo/shared/baljuora-sales";
import { nextMonthKey, seoulDateKey } from "@repo/shared/supplier-portal";
import { apiFetch } from "@/lib/api";
import { SalesSyncCard, jsonInit, monthLabel, readData, saveResponseFile, won, type SalesSyncState } from "./sales-admin-shared";
import "./sales-admin.css";

type InvoiceSummary = {
  buyerKey: string;
  companyName: string;
  businessNumber: string;
  ceoName: string;
  email: string;
  supplyTotal: number;
  taxTotal: number;
  grossTotal: number;
  productCount: number;
  shippingTotal: number;
  items: Array<{ name: string; quantity: number | null; unitPrice: number | null; supply: number; tax: number }>;
};
type KindBlock = { count: number; files: number; supplyTotal: number; taxTotal: number; grossTotal: number; invoices: InvoiceSummary[] };
type Preview = {
  month: string;
  writeDate: string;
  settings: HometaxSettings;
  supplierProblems: string[];
  lineCount: number;
  taxSources: { baljuora: number; category: number; default: number };
  taxable: KindBlock;
  exempt: KindBlock;
  skipped: Array<{ buyerKey: string; buyerName: string; kind: HometaxKind; grossTotal: number; reasons: string[] }>;
};

const SUPPLIER_FIELDS: Array<{ key: keyof HometaxSettings["supplier"]; label: string; placeholder: string; required?: boolean; wide?: boolean }> = [
  { key: "businessNumber", label: "사업자등록번호", placeholder: "숫자 10자리", required: true },
  { key: "companyName", label: "상호", placeholder: "두고푸드", required: true },
  { key: "ceoName", label: "대표자 성명", placeholder: "대표자", required: true },
  { key: "branchNumber", label: "종사업장번호", placeholder: "없으면 비움" },
  { key: "businessType", label: "업태", placeholder: "예: 도소매" },
  { key: "businessItem", label: "종목", placeholder: "예: 농축수산물" },
  { key: "email", label: "이메일", placeholder: "발급 내역을 받을 이메일" },
  { key: "address", label: "사업장 주소", placeholder: "사업장 주소", wide: true }
];

function formatBusinessNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}` : value || "-";
}

function KindCard({ kind, block, month, disabled, onDownload, downloading }: { kind: HometaxKind; block: KindBlock; month: string; disabled: boolean; onDownload: (kind: HometaxKind, part: number) => void; downloading: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`admin-card sa-kind is-${kind}`}>
      <div className="sa-kind-head">
        <div>
          <span className="sa-kind-tag">{kind === "taxable" ? "과세 상품" : "면세 상품 · 농축수산물"}</span>
          <h2>{HOMETAX_KIND_LABELS[kind]}</h2>
          <p>{monthLabel(month)} · 매출처 {block.count.toLocaleString("ko-KR")}곳{block.files > 1 ? ` · 파일 ${block.files}개(100건씩)` : ""}</p>
        </div>
        <dl>
          <div><dt>공급가액</dt><dd>{won(block.supplyTotal)}</dd></div>
          {kind === "taxable" && <div><dt>세액</dt><dd>{won(block.taxTotal)}</dd></div>}
          <div className="is-total"><dt>합계</dt><dd>{won(block.grossTotal)}</dd></div>
        </dl>
      </div>
      <div className="sa-kind-actions">
        {block.count === 0 ? <p className="sa-muted">이 달 {kind === "taxable" ? "과세" : "면세"} 판매가 없어요.</p> : Array.from({ length: block.files }, (_, index) => (
          <button key={index} type="button" className="primary-action" onClick={() => onDownload(kind, index + 1)} disabled={disabled || downloading === `${kind}-${index + 1}`}>
            <Download size={16} /> {block.files > 1 ? `엑셀 ${index + 1}/${block.files} (${Math.min(HOMETAX_MAX_ROWS, block.count - index * HOMETAX_MAX_ROWS)}건)` : `엑셀 내려받기 (${block.count}건)`}
          </button>
        ))}
        {block.count > 0 && <button type="button" className="outline-button" onClick={() => setOpen(!open)} aria-expanded={open}><ChevronDown size={15} className={open ? "sa-rotate" : ""} /> 매출처별 내용 {open ? "접기" : "보기"}</button>}
      </div>
      {open && (
        <ul className="sa-invoice-list" aria-label={`${HOMETAX_KIND_LABELS[kind]} 매출처별 내용`}>
          {block.invoices.map((invoice) => (
            <li key={invoice.buyerKey}>
              <div className="sa-invoice-head">
                <span><strong>{invoice.companyName}</strong><small>{formatBusinessNumber(invoice.businessNumber)} · {invoice.ceoName}{invoice.email ? ` · ${invoice.email}` : ""}</small></span>
                <b>{won(invoice.grossTotal)}</b>
              </div>
              <ul className="sa-items">{invoice.items.map((item, index) => <li key={index}><span>{item.name}</span><small>{item.quantity ? `${item.quantity.toLocaleString("ko-KR")}개 · ` : ""}{won(item.supply + item.tax)}</small></li>)}</ul>
              <small className="sa-invoice-sum">공급가액 {won(invoice.supplyTotal)}{kind === "taxable" ? ` · 세액 ${won(invoice.taxTotal)}` : ""}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TaxInvoiceAdmin() {
  // 매월 초에 지난달을 신고하므로 지난달을 먼저 보여 줍니다.
  const [month, setMonth] = useState(() => nextMonthKey(seoulDateKey().slice(0, 7), -1));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sync, setSync] = useState<SalesSyncState>(null);
  const [draft, setDraft] = useState<HometaxSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [next, summary] = await Promise.all([
        readData<Preview>(await apiFetch(`/baljuora/admin/hometax?month=${month}`, { silent: true })),
        readData<{ sync: SalesSyncState }>(await apiFetch(`/baljuora/admin/sales/summary?from=${month}-01&to=${month}-01`, { silent: true }))
      ]);
      setPreview(next);
      setSync(summary.sync);
      setDraft((current) => current ?? next.settings);
      setSettingsOpen((open) => open || next.supplierProblems.length > 0);
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "신고 자료를 만들지 못했습니다.");
    }
  }, [month]);

  useEffect(() => { void load(); }, [load]);

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await readData<{ settings: HometaxSettings }>(await apiFetch("/baljuora/admin/hometax/settings", jsonInit("PUT", draft)));
      setDraft(saved.settings);
      toast.success("홈택스 신고 설정을 저장했어요.");
      await load();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const download = async (kind: HometaxKind, part: number) => {
    setDownloading(`${kind}-${part}`);
    try {
      const response = await apiFetch(`/baljuora/admin/hometax/file?month=${month}&kind=${kind}&part=${part}`);
      if (!response.ok) return;
      await saveResponseFile(response, `홈택스_${kind === "taxable" ? "세금계산서" : "계산서"}_${month}.xlsx`);
    } finally {
      setDownloading("");
    }
  };

  const blocked = Boolean(preview && preview.supplierProblems.length > 0);
  return (
    <div className="sa-page">
      <div className="admin-page-heading">
        <div><span>HOMETAX</span><h1>세금계산서 신고</h1><p>매출처별 월 합계 <b>세금계산서(과세)</b>와 <b>계산서(면세)</b>를 홈택스 일괄발급 엑셀 양식 그대로 만들어요.</p></div>
        <div className="sa-month" role="group" aria-label="신고할 달">
          <button type="button" onClick={() => { setPreview(null); setMonth(nextMonthKey(month, -1)); }} aria-label="이전 달"><ChevronLeft size={17} /></button>
          <strong>{monthLabel(month)}</strong>
          <button type="button" onClick={() => { setPreview(null); setMonth(nextMonthKey(month, 1)); }} aria-label="다음 달" disabled={month >= seoulDateKey().slice(0, 7)}><ChevronRight size={17} /></button>
        </div>
      </div>
      <SalesSyncCard sync={sync} onDone={() => void load()} compact />

      <section className="admin-card sa-howto">
        <h2><FileSpreadsheet size={18} aria-hidden="true" /> 신고 순서</h2>
        <ol>
          <li>지난달 판매를 <b>불러오기</b>로 최신으로 맞춥니다(취소·반품 반영).</li>
          <li>아래에서 <b>세금계산서(과세)</b>·<b>계산서(면세)</b> 엑셀을 각각 내려받습니다. 작성일자는 그 달 말일, 품목은 4줄까지(많으면 "OO 외 N건")입니다.</li>
          <li>홈택스 › 전자(세금)계산서 › 발급 › <b>일괄발급</b>에서 종류(세금계산서 / 계산서)를 고르고 엑셀을 올린 뒤, 오류 행을 확인하고 발급합니다(한 번에 50건씩 발급).</li>
        </ol>
      </section>

      {draft && (
        <section className={`admin-card sa-settings ${blocked ? "is-blocked" : ""}`}>
          <button type="button" className="sa-settings-toggle" onClick={() => setSettingsOpen(!settingsOpen)} aria-expanded={settingsOpen}>
            <Settings2 size={18} aria-hidden="true" />
            <span><strong>공급자(두고푸드) 정보 · 발급 설정</strong><small>{blocked ? `먼저 채워 주세요: ${preview?.supplierProblems.join(", ")}` : `${draft.supplier.companyName} · ${formatBusinessNumber(draft.supplier.businessNumber)} · ${draft.receiptType === "01" ? "영수" : "청구"} · 과세 금액 부가세 ${draft.vatIncluded ? "포함" : "별도"}`}</small></span>
            <ChevronDown size={16} className={settingsOpen ? "sa-rotate" : ""} aria-hidden="true" />
          </button>
          {settingsOpen && (
            <form onSubmit={(event) => void saveSettings(event)}>
              <div className="sa-form-grid">
                {SUPPLIER_FIELDS.map((field) => (
                  <label key={field.key} className={field.wide ? "is-wide" : ""}>
                    <span>{field.label}{field.required && <b aria-hidden="true"> *</b>}</span>
                    <input value={draft.supplier[field.key]} onChange={(event) => setDraft({ ...draft, supplier: { ...draft.supplier, [field.key]: event.target.value } })} placeholder={field.placeholder} required={field.required} />
                  </label>
                ))}
                <label>
                  <span>영수 / 청구</span>
                  <select value={draft.receiptType} onChange={(event) => setDraft({ ...draft, receiptType: event.target.value === "02" ? "02" : "01" })}>
                    <option value="01">영수(01) · 대가를 받은 경우</option>
                    <option value="02">청구(02) · 아직 못 받은 경우</option>
                  </select>
                </label>
                <label>
                  <span>과세 상품 금액</span>
                  <select value={draft.vatIncluded ? "in" : "out"} onChange={(event) => setDraft({ ...draft, vatIncluded: event.target.value === "in" })}>
                    <option value="in">부가세 포함(공급가액 = 금액 ÷ 1.1)</option>
                    <option value="out">부가세 별도(세액 = 금액 × 10%)</option>
                  </select>
                </label>
                <label className="sa-check"><input type="checkbox" checked={draft.includeShipping} onChange={(event) => setDraft({ ...draft, includeShipping: event.target.checked })} /> 매출처가 낸 배송비를 품목 "배송비"로 넣기</label>
              </div>
              <div className="sa-modal-actions"><button type="submit" className="primary-action" disabled={saving}>설정 저장</button></div>
            </form>
          )}
        </section>
      )}

      {error && !preview ? (
        <section className="admin-card sa-empty"><AlertTriangle size={28} aria-hidden="true" /><strong>신고 자료를 만들지 못했어요.</strong><p>{error}</p></section>
      ) : !preview ? (
        <div className="admin-loading inline"><div className="spinner" /><span>{monthLabel(month)} 신고 자료를 만드는 중…</span></div>
      ) : preview.lineCount === 0 ? (
        <section className="admin-card sa-empty"><FileSpreadsheet size={30} aria-hidden="true" /><strong>{monthLabel(month)} 판매가 아직 없어요.</strong><p>위의 <b>불러오기</b>로 그 달이 들어가는 기간을 불러온 뒤 다시 확인하세요.</p></section>
      ) : (
        <>
          {preview.taxSources.default > 0 && <p className="sa-notice"><Info size={15} aria-hidden="true" /><span>과세 여부를 알 수 없는 판매 {preview.taxSources.default.toLocaleString("ko-KR")}줄(DB센터에 연결되지 않은 발주오라 상품)은 <b>면세</b>로 넣었어요. 발주오라 상품 불러오기(비교)를 하면 상품의 과세 여부를 읽어 다음부터 맞게 나눠요.</span></p>}
          {blocked && <p className="sa-notice is-warn"><AlertTriangle size={15} aria-hidden="true" /><span>공급자(두고푸드) 정보를 채워야 엑셀을 내려받을 수 있어요.</span></p>}
          <div className="sa-grid-2">
            <KindCard kind="taxable" block={preview.taxable} month={month} disabled={blocked} onDownload={(kind, part) => void download(kind, part)} downloading={downloading} />
            <KindCard kind="exempt" block={preview.exempt} month={month} disabled={blocked} onDownload={(kind, part) => void download(kind, part)} downloading={downloading} />
          </div>
          {preview.skipped.length > 0 && (
            <section className="admin-card sa-unknown">
              <div className="card-heading"><AlertTriangle size={19} aria-hidden="true" /><div><h2>엑셀에서 뺀 매출처 {preview.skipped.length}곳</h2><p>공급받는자 필수 칸(사업자등록번호·상호·대표자 성명)이 비어 있어요. <a href="/admin/buyers">매출처</a>에서 채우면 바로 들어갑니다.</p></div></div>
              <ul>{preview.skipped.map((skip) => <li key={`${skip.kind}-${skip.buyerKey}`}><strong>{skip.buyerName}</strong><span>{HOMETAX_KIND_LABELS[skip.kind]} · {won(skip.grossTotal)} · {skip.reasons.join(", ")}</span></li>)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
