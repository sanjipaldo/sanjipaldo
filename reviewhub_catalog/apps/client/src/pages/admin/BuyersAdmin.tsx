// 관리자 > 매출처(셀러)(2026-11-23, 관리자 요청 "매출처(회원)를 DB로 가져와 따로 보기"): 발주오라 동기화 때마다 매출처 회원을 가져옵니다.
// 세금계산서(홈택스)에 쓰는 칸(상호·대표자·사업자번호·업태·종목·주소·이메일)이 비면 여기서 DB센터 값으로 고칠 수 있습니다(발주오라는 바꾸지 않음).
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Pencil, Search, Users, X } from "lucide-react";
import { toast } from "sonner";
import { BUYER_FIELD_LABELS, BUYER_OVERRIDE_FIELDS, type BuyerOverrideField, type BuyerOverrides } from "@repo/shared/baljuora-sales";
import { apiFetch } from "@/lib/api";
import { SalesSyncCard, formatDateTime, jsonInit, monthLabel, readData, won, type SalesSyncState } from "./sales-admin-shared";
import "./sales-admin.css";

type Buyer = {
  id: string;
  companyName: string;
  representativeName: string | null;
  businessNumber: string | null;
  businessType: string | null;
  businessCategory: string | null;
  email: string | null;
  phone: string | null;
  managerName: string | null;
  zipCode: string | null;
  address: string | null;
  addressDetail: string | null;
  groupName: string | null;
  status: string | null;
  orderAcceptType: string | null;
  username: string | null;
  lastLoginAt: string | null;
  joinedAt: string | null;
  memo: string | null;
  overrides: BuyerOverrides;
  invoice: { companyName: string; ceoName: string; businessNumber: string; businessType: string; businessItem: string; address: string; email: string; overridden: string[] };
  invoiceProblems: string[];
  lastSyncedAt: string | null;
  totalAmount: number;
  orderCount: number;
  lastOrderDate: string | null;
  monthAmount: number;
};
type BuyerList = { buyers: Buyer[]; total: number; month: string; unknownSellers: Array<{ name: string; amount: number; orders: number }>; sync: SalesSyncState };
type Filter = "all" | "ordered" | "problem";

const STATUS_LABELS: Record<string, string> = { ACTIVE: "사용", INACTIVE: "미사용", PENDING: "인증대기", SUSPENDED: "정지" };
const ACCEPT_LABELS: Record<string, string> = { PREPAID: "선결제", POSTPAID: "후결제" };

function formatBusinessNumber(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}` : value || "-";
}

function BuyerEditModal({ buyer, onClose, onSaved }: { buyer: Buyer; onClose: () => void; onSaved: () => void }) {
  const synced: Record<BuyerOverrideField, string> = {
    companyName: buyer.companyName,
    representativeName: buyer.representativeName ?? "",
    businessNumber: buyer.businessNumber ?? "",
    businessType: buyer.businessType ?? "",
    businessCategory: buyer.businessCategory ?? "",
    email: buyer.email ?? "",
    address: buyer.address ?? "",
    addressDetail: buyer.addressDetail ?? ""
  };
  const [draft, setDraft] = useState<Record<BuyerOverrideField, string>>(() => Object.fromEntries(BUYER_OVERRIDE_FIELDS.map((field) => [field, buyer.overrides[field] ?? synced[field]])) as Record<BuyerOverrideField, string>);
  const [memo, setMemo] = useState(buyer.memo ?? "");
  const [saving, setSaving] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await readData(await apiFetch(`/baljuora/admin/buyers/${encodeURIComponent(buyer.id)}`, jsonInit("PUT", { overrides: draft, memo })));
      toast.success("매출처 정보를 저장했어요. 발주오라 값은 바꾸지 않았어요.");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop sa-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="sa-modal" role="dialog" aria-modal="true" aria-labelledby="buyer-edit-title" onSubmit={(event) => void save(event)}>
        <div className="sa-modal-head">
          <div><span>매출처</span><h2 id="buyer-edit-title">{buyer.companyName}</h2></div>
          <button type="button" className="sa-icon-button" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        </div>
        <p className="sa-modal-help">홈택스 세금계산서·계산서에 들어가는 칸입니다. 발주오라 값과 다르게 고친 칸은 다음 동기화 때도 그대로 둡니다(지우면 발주오라 값으로 돌아감).</p>
        <div className="sa-form-grid">
          {BUYER_OVERRIDE_FIELDS.map((field) => (
            <label key={field} className={field === "address" || field === "addressDetail" ? "is-wide" : ""}>
              <span>{BUYER_FIELD_LABELS[field]}{draft[field] !== synced[field] && draft[field].trim() && <em>DB센터에서 고침</em>}</span>
              <input value={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} maxLength={field.startsWith("address") ? 200 : 120} placeholder={synced[field] || "발주오라에 없음"} />
              {draft[field] !== synced[field] && synced[field] && <small>발주오라: {synced[field]}</small>}
            </label>
          ))}
          <label className="is-wide"><span>메모(DB센터 전용)</span><textarea value={memo} onChange={(event) => setMemo(event.target.value)} maxLength={500} rows={2} /></label>
        </div>
        <div className="sa-modal-actions">
          <button type="button" className="outline-button" onClick={onClose}>닫기</button>
          <button type="submit" className="primary-action" disabled={saving}>저장</button>
        </div>
      </form>
    </div>
  );
}

export function BuyersAdmin() {
  const [data, setData] = useState<BuyerList | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Buyer | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await readData<BuyerList>(await apiFetch("/baljuora/admin/buyers", { silent: true })));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "매출처를 불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return (data?.buyers ?? [])
      .filter((buyer) => filter === "all" || (filter === "ordered" ? buyer.orderCount > 0 : buyer.invoiceProblems.length > 0))
      .filter((buyer) => !keyword || [buyer.companyName, buyer.representativeName, buyer.businessNumber, buyer.username, buyer.managerName, buyer.email, buyer.phone, buyer.groupName].some((value) => value?.toLowerCase().includes(keyword)))
      .sort((first, second) => second.monthAmount - first.monthAmount || second.totalAmount - first.totalAmount || first.companyName.localeCompare(second.companyName, "ko"));
  }, [data, query, filter]);
  const problemCount = (data?.buyers ?? []).filter((buyer) => buyer.invoiceProblems.length > 0).length;
  const orderedCount = (data?.buyers ?? []).filter((buyer) => buyer.orderCount > 0).length;

  return (
    <div className="sa-page">
      <div className="admin-page-heading">
        <div><span>BUYERS</span><h1>매출처(셀러)</h1><p>발주오라 매출처 회원을 동기화 때마다 가져와 DB센터에서 따로 봅니다. 세금계산서에 빠진 정보는 여기서 채워요.</p></div>
      </div>
      <SalesSyncCard sync={data?.sync ?? null} onDone={() => void load()} compact />
      {!data ? (
        <div className="admin-loading inline"><div className="spinner" /><span>매출처를 불러오는 중…</span></div>
      ) : (
        <>
          <section className="sales-kpi-grid sa-kpi">
            <article><span>매출처</span><strong>{data.total.toLocaleString("ko-KR")}곳</strong><small>발주오라 회원</small></article>
            <article><span>주문한 매출처</span><strong>{orderedCount.toLocaleString("ko-KR")}곳</strong><small>불러온 기간 안</small></article>
            <article><span>{monthLabel(data.month)} 매출</span><strong>{won(data.buyers.reduce((sum, buyer) => sum + buyer.monthAmount, 0))}</strong><small>매출처 합계</small></article>
            <article className={problemCount ? "is-warning" : ""}><span>세금계산서 정보 부족</span><strong>{problemCount.toLocaleString("ko-KR")}곳</strong><small>사업자번호·대표자 확인</small></article>
          </section>
          <div className="sa-toolbar">
            <div className="sa-filter" role="group" aria-label="보기">
              {([["all", "전체"], ["ordered", "주문한 매출처"], ["problem", "정보 부족"]] as Array<[Filter, string]>).map(([key, label]) => <button key={key} type="button" className={filter === key ? "is-active" : ""} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}
            </div>
            <label className="sa-search"><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="상호·대표자·사업자번호·아이디 검색" aria-label="매출처 검색" /></label>
          </div>
          {data.total === 0 ? (
            <section className="admin-card sa-empty"><Users size={30} aria-hidden="true" /><strong>아직 가져온 매출처가 없어요.</strong><p>위의 <b>불러오기</b>로 발주오라 매출처 회원을 가져오세요.</p></section>
          ) : (
            <section className="admin-card">
              <div className="admin-table-wrap">
                <table className="admin-table stackable-table sa-table sa-buyer-table">
                  <thead><tr><th>매출처</th><th>사업자 정보</th><th>담당·연락처</th><th>그룹·결제</th><th>{monthLabel(data.month)}</th><th>누적·최근 주문</th><th>세금계산서</th><th aria-label="고치기" /></tr></thead>
                  <tbody>
                    {rows.map((buyer) => (
                      <tr key={buyer.id}>
                        <td data-label="매출처" className="stack-wide"><strong>{buyer.invoice.companyName}</strong><small>{buyer.username ? `아이디 ${buyer.username}` : "아이디 없음"}{buyer.status ? ` · ${STATUS_LABELS[buyer.status] ?? buyer.status}` : ""}</small></td>
                        <td data-label="사업자 정보"><span>{formatBusinessNumber(buyer.invoice.businessNumber)}</span><small>{buyer.invoice.ceoName || "대표자 없음"} · {[buyer.invoice.businessType, buyer.invoice.businessItem].filter(Boolean).join(" / ") || "업태·종목 없음"}</small></td>
                        <td data-label="담당·연락처"><span>{buyer.managerName || "-"}</span><small>{[buyer.phone, buyer.invoice.email].filter(Boolean).join(" · ") || "-"}</small></td>
                        <td data-label="그룹·결제"><span>{buyer.groupName || "-"}</span><small>{buyer.orderAcceptType ? ACCEPT_LABELS[buyer.orderAcceptType] ?? buyer.orderAcceptType : "-"}</small></td>
                        <td data-label={monthLabel(data.month)}><b>{buyer.monthAmount ? won(buyer.monthAmount) : "-"}</b></td>
                        <td data-label="누적·최근 주문"><span>{buyer.totalAmount ? won(buyer.totalAmount) : "-"}</span><small>{buyer.orderCount ? `${buyer.orderCount.toLocaleString("ko-KR")}건 · ${buyer.lastOrderDate}` : "주문 없음"}</small></td>
                        <td data-label="세금계산서">
                          {buyer.invoiceProblems.length === 0
                            ? <span className="sa-badge is-ok"><CheckCircle2 size={13} aria-hidden="true" /> 준비됨{buyer.invoice.overridden.length ? " · 고친 칸 있음" : ""}</span>
                            : <span className="sa-badge is-warn" title={buyer.invoiceProblems.join(", ")}><AlertTriangle size={13} aria-hidden="true" /> {buyer.invoiceProblems.join(", ")}</span>}
                          {buyer.memo && <small className="sa-memo">메모: {buyer.memo}</small>}
                        </td>
                        <td data-label="고치기"><button type="button" className="sa-icon-button" onClick={() => setEditing(buyer)} aria-label={`${buyer.companyName} 정보 고치기`}><Pencil size={15} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length === 0 && <p className="sa-muted sa-pad">조건에 맞는 매출처가 없어요.</p>}
              <p className="sa-foot">마지막으로 가져온 때: {formatDateTime(data.buyers[0]?.lastSyncedAt)} · 계좌·비밀번호는 가져오지 않습니다.</p>
            </section>
          )}
          {data.unknownSellers.length > 0 && (
            <section className="admin-card sa-unknown">
              <div className="card-heading"><AlertTriangle size={19} aria-hidden="true" /><div><h2>매출처 목록에 없는 주문처 {data.unknownSellers.length}곳</h2><p>판매 줄에는 있는데 매출처 회원으로 찾지 못했어요. 매출처를 다시 불러오면 대부분 연결됩니다.</p></div></div>
              <ul>{data.unknownSellers.map((seller) => <li key={seller.name}><strong>{seller.name}</strong><span>{seller.orders.toLocaleString("ko-KR")}건 · {won(seller.amount)}</span></li>)}</ul>
            </section>
          )}
        </>
      )}
      {editing && <BuyerEditModal buyer={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}
