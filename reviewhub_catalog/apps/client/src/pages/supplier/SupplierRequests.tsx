// 공급사 센터 > 변경 요청 내역: 보낸 상품 수정·신규 등록 요청과 두고푸드 처리 결과.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CircleAlert, ClipboardList, Eye, Pencil, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { SUPPLIER_REQUEST_KIND_LABELS, type SupplierRequestStatus } from "@repo/shared/supplier-portal";
import { shortDateTime, supplierGet, supplierPost, type SupplierCategory, type SupplierRequestItem } from "./supplier-api";
import { ChangeRowList, RequestStatusPill, SupplierPager, SupplierPageSize, useSupplierPaging } from "./supplier-ui";

type RequestTab = "all" | SupplierRequestStatus;

const TABS: Array<[RequestTab, string]> = [
  ["all", "전체"],
  ["pending", "승인 대기"],
  ["approved", "승인 완료"],
  ["rejected", "반려"],
  ["cancelled", "요청 취소"]
];

function resultText(request: SupplierRequestItem) {
  if (request.status === "pending") return "두고푸드가 확인하고 있어요.";
  if (request.status === "approved") return request.reviewNote || (request.kind === "create" ? "상품이 등록됐어요." : "상품에 반영됐어요.");
  if (request.status === "rejected") return request.reviewNote || "반려됐어요. 자세한 내용은 두고푸드에 문의해 주세요.";
  return "요청을 취소했어요.";
}

function RequestDetailModal({ request, categoryName, busy, onCancel, onClose }: {
  request: SupplierRequestItem;
  categoryName: (id: string) => string | undefined;
  busy: boolean;
  onCancel: (request: SupplierRequestItem) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const canEdit = request.status === "pending" && request.kind === "update" && request.productId;
  return (
    <div className="editor-overlay" role="presentation" onMouseDown={onClose}>
      <section className="editor-panel sup-request-detail" role="dialog" aria-modal="true" aria-labelledby="sup-request-detail-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="editor-header">
          <div><span>REQUEST DETAIL</span><h2 id="sup-request-detail-title">{request.productName}</h2><p>{SUPPLIER_REQUEST_KIND_LABELS[request.kind]} 요청 · {shortDateTime(request.createdAt)}</p></div>
          <button type="button" onClick={onClose} aria-label="요청 자세히 닫기"><X size={20} /></button>
        </div>
        <div className="editor-grid sup-detail-body">
          <dl className="sup-detail-meta full">
            <div><dt>상태</dt><dd><RequestStatusPill status={request.status} /></dd></div>
            <div><dt>보낸 때</dt><dd>{shortDateTime(request.createdAt)}{request.updatedAt !== request.createdAt && request.status === "pending" ? ` (고침 ${shortDateTime(request.updatedAt)})` : ""}</dd></div>
            <div><dt>처리한 때</dt><dd>{request.reviewedAt ? shortDateTime(request.reviewedAt) : "-"}</dd></div>
          </dl>
          <section className="sup-diff-preview full">
            <h3>{request.kind === "create" ? "등록 요청한 내용" : "바꾸려는 항목"}</h3>
            <ChangeRowList changes={request.changes} snapshot={request.kind === "update" ? request.snapshot : null} categoryName={categoryName} />
          </section>
          {request.note && <div className="sup-detail-text full"><span>요청 메모</span><p>{request.note}</p></div>}
          <div className={`sup-detail-text full is-${request.status}`}><span>두고푸드 답변</span><p>{resultText(request)}</p></div>
        </div>
        <div className="editor-footer sup-editor-footer">
          {request.status === "pending" && <button type="button" className="sup-danger-button" onClick={() => onCancel(request)} disabled={busy}><Undo2 size={15} /> {busy ? "취소하는 중…" : "요청 취소"}</button>}
          {canEdit ? <Link className="primary-action" to={`/supplier/products?edit=${encodeURIComponent(request.productId as string)}`}><Pencil size={15} /> 요청 고치기</Link> : <button type="button" className="primary-action" onClick={onClose}>확인</button>}
        </div>
      </section>
    </div>
  );
}

export function SupplierRequests({ reloadKey, onChanged }: { reloadKey: number; onChanged: () => void }) {
  const [requests, setRequests] = useState<SupplierRequestItem[] | null>(null);
  const [categories, setCategories] = useState<SupplierCategory[]>([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<RequestTab>("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    try {
      const [requestData, categoryData] = await Promise.all([
        supplierGet<{ requests: SupplierRequestItem[] }>("/requests"),
        supplierGet<{ categories: SupplierCategory[] }>("/categories").catch(() => ({ categories: [] as SupplierCategory[] }))
      ]);
      setRequests(requestData.requests);
      setCategories(categoryData.categories);
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "요청 내역을 불러오지 못했어요.");
    }
  }, []);

  useEffect(() => { void load(); }, [load, reloadKey]);

  const categoryNames = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);
  const categoryName = useCallback((id: string) => categoryNames.get(id), [categoryNames]);
  const list = requests ?? [];
  const counts = Object.fromEntries(TABS.map(([key]) => [key, key === "all" ? list.length : list.filter((request) => request.status === key).length])) as Record<RequestTab, number>;
  const filtered = tab === "all" ? list : list.filter((request) => request.status === tab);
  // 쪽 나누기: 기본 10줄씩, 공급사가 개수를 바꿀 수 있어요(이 브라우저에 기억). 탭을 바꾸면 1쪽부터.
  const paging = useSupplierPaging(filtered, "supplier-requests");
  const detail = detailId ? list.find((request) => request.id === detailId) ?? null : null;

  const cancel = async (request: SupplierRequestItem) => {
    if (!window.confirm(`'${request.productName}' ${SUPPLIER_REQUEST_KIND_LABELS[request.kind]} 요청을 취소할까요?`)) return;
    setBusyId(request.id);
    try {
      await supplierPost(`/requests/${encodeURIComponent(request.id)}/cancel`, {});
      toast.success("요청을 취소했어요.");
      setDetailId(null);
      onChanged();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "요청을 취소하지 못했어요.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <>
      <div className="admin-page-heading">
        <div><span>CHANGE REQUESTS</span><h1>변경 요청 내역</h1><p>보낸 상품 수정·신규 등록 요청과 두고푸드의 처리 결과를 확인합니다. 승인 대기 중인 요청은 고치거나 취소할 수 있어요.</p></div>
      </div>
      {error && !requests ? (
        <section className="admin-card"><div className="empty-state"><CircleAlert size={28} /><strong>요청 내역을 불러오지 못했어요.</strong><span>{error}</span><button type="button" className="sup-retry" onClick={() => void load()}>다시 불러오기</button></div></section>
      ) : !requests ? (
        <div className="admin-loading inline"><div className="spinner" /><span>요청 내역을 불러오는 중…</span></div>
      ) : (
        <section className="admin-card sup-requests-card" ref={paging.listRef}>
          <div className="sup-tabs-row">
            <div className="request-status-tabs sup-request-tabs" role="tablist" aria-label="요청 상태로 거르기">
              {TABS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => { setTab(key); paging.resetPage(); }}>{label}<small>{counts[key]}</small></button>)}
            </div>
            <SupplierPageSize paging={paging} label="페이지당 요청 수" />
          </div>
          {filtered.length === 0 ? (
            <div className="empty-state"><ClipboardList size={28} /><strong>{list.length === 0 ? "아직 보낸 요청이 없어요." : "이 상태의 요청이 없어요."}</strong><span>{list.length === 0 ? "내 상품에서 '변경 요청'을 누르거나, 왼쪽 위 '상품 등록 요청'으로 새 상품을 보내 보세요." : "다른 탭을 눌러 보세요."}</span></div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table stackable-table sup-request-table">
                <thead><tr><th>상품</th><th>바뀌는 내용</th><th>상태</th><th>두고푸드 답변</th><th>관리</th></tr></thead>
                <tbody>
                  {paging.shown.map((request) => (
                    <tr key={request.id}>
                      <td data-label="상품" className="stack-wide">
                        <div className="sup-request-product">
                          <span className={`sup-kind is-${request.kind}`}>{SUPPLIER_REQUEST_KIND_LABELS[request.kind]}</span>
                          <strong>{request.productName}</strong>
                          <small>보낸 때 {shortDateTime(request.createdAt)}</small>
                        </div>
                      </td>
                      <td data-label="바뀌는 내용" className="stack-wide"><ChangeRowList changes={request.changes} snapshot={request.kind === "update" ? request.snapshot : null} categoryName={categoryName} compact limit={3} /></td>
                      <td data-label="상태"><RequestStatusPill status={request.status} />{request.reviewedAt && <small className="sup-cell-note">{shortDateTime(request.reviewedAt)}</small>}</td>
                      <td data-label="두고푸드 답변"><span className={`sup-result is-${request.status}`}>{resultText(request)}</span></td>
                      <td data-label="관리" className="stack-wide">
                        <div className="row-actions">
                          <button type="button" onClick={() => setDetailId(request.id)}><Eye size={14} /> 자세히</button>
                          {request.status === "pending" && <button type="button" className="danger" onClick={() => void cancel(request)} disabled={busyId === request.id}><Undo2 size={14} /> 취소</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <SupplierPager paging={paging} label="변경 요청 내역 페이지" />
        </section>
      )}
      {detail && <RequestDetailModal request={detail} categoryName={categoryName} busy={busyId === detail.id} onCancel={(request) => void cancel(request)} onClose={() => setDetailId(null)} />}
    </>
  );
}
