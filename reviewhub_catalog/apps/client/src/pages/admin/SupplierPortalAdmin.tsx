// 마스터 관리자: 공급사 센터 관련 화면(2026-11-20).
// - 변경 요청(/admin/supplierRequests): 공급사가 보낸 상품 수정·신규 등록 요청을 검토하고 승인·반려합니다.
//   승인하면 상품에 바로 반영되고(가격 이력·변경 대기열은 기존 상품 저장과 같음), 반려 사유는 공급사 화면에 보입니다.
// - 공급사 계정 창(공급사 관리 > 계정): 공급사 센터 로그인 아이디·비밀번호를 만들고 관리합니다(회원가입 없음).
// 이 파일은 처음 열 때만 불러옵니다(CatalogAdmin에서 lazy).
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, Copy, Eye, EyeOff, Inbox, KeyRound, Pause, Play, Save, Store, Trash2, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import {
  DEFAULT_SUPPLIER_COMMISSION_RATE,
  SUPPLIER_CYCLE_LABELS,
  SUPPLIER_FIELD_LABELS,
  SUPPLIER_PASSWORD_MIN,
  SUPPLIER_PASSWORD_RECOMMENDED,
  SUPPLIER_REQUEST_KIND_LABELS,
  SUPPLIER_REQUEST_STATUS_LABELS,
  SUPPLIER_USERNAME_PATTERN,
  formatSupplierChangeValue,
  type SupplierChangeField,
  type SupplierRequestStatus,
  type SupplierSettlementCycle
} from "@repo/shared/supplier-portal";
import { digitsOnly, shortDateTime, type SupplierRequestItem } from "../supplier/supplier-api";
import { ChangeRowList, RequestStatusPill } from "../supplier/supplier-ui";
import "../supplier/supplier-center.css";

async function readResult<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({ ok: false }))) as { ok?: boolean; data?: T; error?: { message?: string } };
  if (!response.ok || !payload.ok) {
    const error = new Error(payload.error?.message || "요청을 처리하지 못했습니다.") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return payload.data as T;
}

function sendJson(path: string, method: "POST" | "PUT" | "DELETE", body?: unknown) {
  return apiFetch(path, {
    method,
    silent: true,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

function won(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : `${value.toLocaleString("ko-KR")}원`;
}

// 판매가 기준 마진(%) 이상이 되는 끝자리 00원 금액(저가라 마진이 2%p 넘게 커지면 50원 단위).
// 상품 리스트 "엑셀 대량 업로드"(공급사 단가표)와 같은 식입니다.
function priceForMargin(cost: number, marginPercent: number) {
  if (!cost || cost <= 0) return 0;
  const tenths = Math.round(marginPercent * 10);
  const roundUp = (unit: number) => Math.ceil((cost * 1000) / ((1000 - tenths) * unit)) * unit;
  const hundreds = roundUp(100);
  const marginTenths = hundreds > 0 ? ((hundreds - cost) * 1000) / hundreds : 0;
  return marginTenths > tenths + 20 ? roundUp(50) : hundreds;
}

function marginText(price: number | null, cost: number) {
  if (!price || price <= 0) return "-";
  const rate = ((price - cost) / price) * 100;
  return `${rate.toFixed(1)}% · 개당 ${won(price - cost)}`;
}

// 상품 리스트 엑셀 업로드에서 관리자가 마지막에 쓴 마진(브라우저에 저장)을 그대로 씁니다.
function savedMargins() {
  try {
    const saved = JSON.parse(localStorage.getItem("doogo-contract-options") || "null") as { aMargin?: unknown; generalMargin?: unknown } | null;
    const pick = (value: unknown, fallback: number) => (typeof value === "number" && value >= 0 && value <= 90 ? value : fallback);
    return { a: pick(saved?.aMargin, 10), general: pick(saved?.generalMargin, 20) };
  } catch {
    return { a: 10, general: 20 };
  }
}

// ── 변경 요청 목록 ──────────────────────────────────────────────────────
type CurrentProduct = {
  id: string;
  productCode: string | null;
  name: string;
  imageUrl: string | null;
  costPrice: number;
  aPrice: number;
  generalPrice: number;
  salePrice: number | null;
  salePriceMode: "autonomous" | "fixed";
  categoryId: string;
  isVisible: boolean;
  isSoldOut: boolean;
  deletedAt: string | null;
};

type AdminSupplierRequest = SupplierRequestItem & { current: CurrentProduct | null };
type AdminCategory = { id: string; name: string; shippingType: "domestic" | "overseas"; isActive: boolean; sortOrder: number };
type AdminShippingPolicy = { id: string; name: string; shippingType: "domestic" | "overseas"; isActive: boolean };
type AdminRequestList = {
  requests: AdminSupplierRequest[];
  counts: Record<SupplierRequestStatus, number>;
  categories: AdminCategory[];
  shippingPolicies: AdminShippingPolicy[];
};

type StatusTab = SupplierRequestStatus | "all";

const STATUS_TABS: Array<[StatusTab, string]> = [
  ["pending", "승인 대기"],
  ["approved", "승인 완료"],
  ["rejected", "반려"],
  ["cancelled", "요청 취소"],
  ["all", "전체"]
];

export function SupplierRequestsAdmin({ onChanged }: { onChanged?: () => void }) {
  const [status, setStatus] = useState<StatusTab>("pending");
  const [data, setData] = useState<AdminRequestList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; unavailable: boolean } | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);

  const load = useCallback(async (nextStatus: StatusTab) => {
    setLoading(true);
    try {
      const value = await readResult<AdminRequestList>(await apiFetch(`/catalog/admin/supplier-requests?status=${nextStatus}`, { silent: true }));
      setData(value);
      setError(null);
    } catch (failure) {
      const typed = failure as Error & { status?: number };
      setError({ message: typed.message, unavailable: typed.status === 503 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(status); }, [load, status]);

  const categoryNames = useMemo(() => new Map((data?.categories ?? []).map((category) => [category.id, category.name])), [data]);
  const categoryName = useCallback((id: string) => categoryNames.get(id), [categoryNames]);
  const counts = data?.counts;
  const total = counts ? Object.values(counts).reduce((sum, value) => sum + value, 0) : 0;
  const review = reviewId ? data?.requests.find((request) => request.id === reviewId) ?? null : null;

  const done = async () => {
    setReviewId(null);
    await load(status);
    onChanged?.();
  };

  return (
    <>
      <div className="admin-page-heading">
        <div><span>SUPPLIER REQUESTS</span><h1>변경 요청</h1><p>공급사가 공급사 센터에서 보낸 상품 수정·신규 등록 요청입니다. 승인하면 상품에 바로 반영되고, 반려하면 사유가 공급사 화면에 보여요.</p></div>
      </div>
      {error && !data ? (
        <section className="admin-card"><div className="empty-state"><Inbox size={28} /><strong>{error.unavailable ? "운영 배포 후 쓸 수 있어요." : "변경 요청을 불러오지 못했어요."}</strong><span>{error.unavailable ? "공급사 센터용 새 DB 표(migration 032)는 운영 배포 때 만들어집니다. 미리보기에서는 목록이 비어 있어요." : error.message}</span>{!error.unavailable && <button type="button" className="sup-retry" onClick={() => void load(status)}>다시 불러오기</button>}</div></section>
      ) : (
        <section className="admin-card sup-requests-card">
          <div className="sup-tabs-row">
            <div className="request-status-tabs sup-request-tabs" role="tablist" aria-label="요청 상태로 거르기">
              {STATUS_TABS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={status === key} className={status === key ? "active" : ""} onClick={() => setStatus(key)}>{label}<small>{key === "all" ? total : counts?.[key] ?? 0}</small></button>)}
            </div>
          </div>
          {loading && !data ? (
            <div className="admin-loading inline compact"><div className="spinner" /><span>변경 요청을 불러오는 중…</span></div>
          ) : !data || data.requests.length === 0 ? (
            <div className="empty-state"><ClipboardList size={28} /><strong>{status === "pending" ? "승인을 기다리는 요청이 없어요." : "이 상태의 요청이 없어요."}</strong><span>공급사 관리에서 공급사 계정을 만들어 주면, 공급사가 공급사 센터에서 상품 수정·등록을 요청할 수 있어요.</span></div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table stackable-table sup-request-table sup-admin-request-table">
                <thead><tr><th>상품</th><th>공급사</th><th>바뀌는 내용</th><th>상태</th><th>관리</th></tr></thead>
                <tbody>
                  {data.requests.map((request) => (
                    <tr key={request.id}>
                      <td data-label="상품" className="stack-wide">
                        <div className="sup-request-product">
                          <span className={`sup-kind is-${request.kind}`}>{SUPPLIER_REQUEST_KIND_LABELS[request.kind]}</span>
                          <strong>{request.productName}</strong>
                          <small>{request.current?.productCode ? `${request.current.productCode} · ` : ""}요청 {shortDateTime(request.createdAt)}</small>
                        </div>
                      </td>
                      <td data-label="공급사"><strong className="sup-admin-supplier">{request.supplierName}</strong></td>
                      <td data-label="바뀌는 내용" className="stack-wide"><ChangeRowList changes={request.changes} snapshot={request.kind === "update" ? request.snapshot : null} categoryName={categoryName} compact limit={3} /></td>
                      <td data-label="상태"><RequestStatusPill status={request.status} />{request.reviewedAt && <small className="sup-cell-note">{shortDateTime(request.reviewedAt)}{request.reviewedBy ? ` · ${request.reviewedBy}` : ""}</small>}</td>
                      <td data-label="관리" className="stack-wide">
                        <div className="row-actions">
                          <button type="button" className={request.status === "pending" ? "sup-review-button" : ""} onClick={() => setReviewId(request.id)}>{request.status === "pending" ? <><CheckCircle2 size={14} /> 검토하기</> : <><Eye size={14} /> 자세히</>}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {review && data && <SupplierRequestReview request={review} categories={data.categories} policies={data.shippingPolicies} categoryName={categoryName} onClose={() => setReviewId(null)} onDone={() => void done()} />}
    </>
  );
}

// ── 요청 검토 창 ────────────────────────────────────────────────────────
const DRIFT_FIELDS: SupplierChangeField[] = ["name", "imageUrl", "costPrice", "salePriceMode", "salePrice", "isSoldOut"];

function SupplierRequestReview({ request, categories, policies, categoryName, onClose, onDone }: {
  request: AdminSupplierRequest;
  categories: AdminCategory[];
  policies: AdminShippingPolicy[];
  categoryName: (id: string) => string | undefined;
  onClose: () => void;
  onDone: () => void;
}) {
  const isCreate = request.kind === "create";
  const pending = request.status === "pending";
  const current = request.current;
  const changes = request.changes;
  const requestedCost = typeof changes.costPrice === "number" ? changes.costPrice : current?.costPrice ?? 0;
  const [costPrice, setCostPrice] = useState(String(requestedCost || ""));
  const [aPrice, setAPrice] = useState(isCreate ? "" : String(current?.aPrice ?? ""));
  const [generalPrice, setGeneralPrice] = useState(isCreate ? "" : String(current?.generalPrice ?? ""));
  const [productCode, setProductCode] = useState("");
  const [categoryId, setCategoryId] = useState(changes.categoryId ?? "");
  const [shippingType, setShippingType] = useState<"domestic" | "overseas">(changes.shippingType === "overseas" ? "overseas" : "domestic");
  const [shippingPolicyId, setShippingPolicyId] = useState("");
  const [isVisible, setIsVisible] = useState(true);
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"" | "approve" | "reject">("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const cost = Number(costPrice || 0);
  const margins = savedMargins();
  const productGone = !isCreate && (!current || Boolean(current.deletedAt));
  // 요청 뒤에 관리자가 상품 값을 바꿨으면 알려 줍니다(요청할 때 값 ≠ 지금 값).
  const drift = !isCreate && current && request.snapshot
    ? DRIFT_FIELDS.filter((field) => field in request.snapshot! && field in current && (request.snapshot![field] ?? null) !== ((current as Record<string, unknown>)[field] ?? null))
    : [];
  const categoryOptions = categories.filter((category) => category.shippingType === shippingType && category.isActive);
  const policyOptions = policies.filter((policy) => policy.shippingType === shippingType);

  const applyMargins = () => {
    if (cost <= 0) {
      setFormError("원가(공급가)를 먼저 입력해 주세요.");
      return;
    }
    setAPrice(String(priceForMargin(cost, margins.a)));
    setGeneralPrice(String(priceForMargin(cost, margins.general)));
    setFormError("");
  };

  const approve = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pending || busy) return;
    const a = aPrice === "" ? null : Number(aPrice);
    const general = generalPrice === "" ? null : Number(generalPrice);
    if (isCreate) {
      if (!productCode.trim()) return setFormError("상품코드를 입력해 주세요. 발주 엑셀과 맞추는 코드라 꼭 필요해요.");
      if (!categoryId) return setFormError("카테고리를 골라 주세요.");
      if (!a || !general) return setFormError("A단가와 일반공급가를 입력해 주세요.");
    } else if (a === null || general === null) {
      return setFormError("A단가와 일반공급가를 확인해 주세요.");
    }
    setBusy("approve");
    setFormError("");
    try {
      const body = isCreate
        ? { productCode: productCode.trim(), categoryId, shippingType, shippingPolicyId: shippingPolicyId || null, aPrice: a, generalPrice: general, costPrice: cost || null, isVisible, note: note.trim() || null }
        : { aPrice: a, generalPrice: general, costPrice: cost !== requestedCost ? cost : null, note: note.trim() || null };
      await readResult(await sendJson(`/catalog/admin/supplier-requests/${encodeURIComponent(request.id)}/approve`, "POST", body));
      toast.success(isCreate ? `'${request.productName}' 상품을 등록했습니다.` : `'${request.productName}' 변경 요청을 승인해 상품에 반영했습니다.`);
      onDone();
    } catch (failure) {
      setFormError(failure instanceof Error ? failure.message : "승인하지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  const reject = async () => {
    if (!pending || busy) return;
    setBusy("reject");
    try {
      await readResult(await sendJson(`/catalog/admin/supplier-requests/${encodeURIComponent(request.id)}/reject`, "POST", { reason: reason.trim() || null }));
      toast.success("요청을 반려했습니다. 공급사 화면에 사유가 보여요.");
      onDone();
    } catch (failure) {
      setFormError(failure instanceof Error ? failure.message : "반려하지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="editor-overlay" role="presentation" onMouseDown={onClose}>
      <form className="editor-panel sup-request-editor sup-review-panel" role="dialog" aria-modal="true" aria-labelledby="sup-review-title" onSubmit={approve} onMouseDown={(event) => event.stopPropagation()} noValidate>
        <div className="editor-header">
          <div><span>SUPPLIER REQUEST</span><h2 id="sup-review-title">{request.productName}</h2><p>{request.supplierName} · {SUPPLIER_REQUEST_KIND_LABELS[request.kind]} 요청 · {shortDateTime(request.createdAt)}{request.updatedAt !== request.createdAt && pending ? ` (고침 ${shortDateTime(request.updatedAt)})` : ""}</p></div>
          <button type="button" onClick={onClose} aria-label="요청 검토 닫기"><X size={20} /></button>
        </div>
        <div className="editor-grid">
          {!pending && (
            <div className={`sup-detail-text full is-${request.status}`}>
              <span>처리 결과 · {SUPPLIER_REQUEST_STATUS_LABELS[request.status]}{request.reviewedAt ? ` · ${shortDateTime(request.reviewedAt)}` : ""}{request.reviewedBy ? ` · ${request.reviewedBy}` : ""}</span>
              <p>{request.reviewNote || (request.status === "cancelled" ? "공급사가 요청을 취소했어요." : "처리 메모 없음")}</p>
            </div>
          )}
          {productGone && pending && <p className="sup-form-error full">상품이 삭제되었거나 찾을 수 없어 승인할 수 없어요. 반려해 주세요.</p>}
          {current && !isCreate && (
            <dl className="sup-detail-meta sup-current-meta full">
              <div><dt>상품코드</dt><dd>{current.productCode || "-"}</dd></div>
              <div><dt>지금 원가</dt><dd>{won(current.costPrice)}</dd></div>
              <div><dt>지금 A단가</dt><dd>{won(current.aPrice)}</dd></div>
              <div><dt>지금 일반공급가</dt><dd>{won(current.generalPrice)}</dd></div>
              <div><dt>지금 판매가</dt><dd>{current.salePriceMode === "fixed" ? won(current.salePrice) : "자율"}</dd></div>
              <div><dt>지금 상태</dt><dd>{current.isSoldOut ? "품절" : "판매중"}{current.isVisible ? "" : " · 숨김"}</dd></div>
            </dl>
          )}
          {drift.length > 0 && pending && (
            <p className="sup-form-note full">요청을 보낸 뒤 상품 값이 바뀌었어요: {drift.map((field) => field === "imageUrl" ? SUPPLIER_FIELD_LABELS[field] : `${SUPPLIER_FIELD_LABELS[field]}(${formatSupplierChangeValue(field, request.snapshot?.[field])} → 지금 ${formatSupplierChangeValue(field, (current as Record<string, unknown> | null)?.[field])})`).join(", ")}. 승인하면 요청에 들어 있는 항목만 요청한 값으로 바뀝니다.</p>
          )}
          <section className="sup-diff-preview full">
            <h3>{isCreate ? "공급사가 보낸 상품 정보" : "바꾸려는 항목(요청할 때 값 → 요청 값)"}</h3>
            <ChangeRowList changes={changes} snapshot={isCreate ? null : request.snapshot} categoryName={categoryName} />
          </section>
          {request.note && <div className="sup-detail-text full"><span>공급사 메모</span><p>{request.note}</p></div>}
          {pending && !productGone && (
            <>
              <div className="sup-approve-head full">
                <strong>{isCreate ? "등록 정보(두고푸드가 정함)" : "승인하면서 두고푸드 판매가 확인"}</strong>
                <button type="button" className="sup-margin-button" onClick={applyMargins}>A {margins.a}% · 일반 {margins.general}% 마진으로 계산</button>
              </div>
              {isCreate && (
                <>
                  <label>상품코드*<input value={productCode} onChange={(event) => setProductCode(event.target.value)} maxLength={80} placeholder="발주 엑셀과 같은 코드" /></label>
                  <label>배송
                    <select value={shippingType} onChange={(event) => { setShippingType(event.target.value === "overseas" ? "overseas" : "domestic"); setCategoryId(""); setShippingPolicyId(""); }}>
                      <option value="domestic">국내배송</option>
                      <option value="overseas">해외배송</option>
                    </select>
                  </label>
                  <label>카테고리*
                    <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                      <option value="">카테고리 선택</option>
                      {categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                    {changes.categoryId && <small>공급사 희망: {categoryName(changes.categoryId) ?? "알 수 없는 카테고리"}</small>}
                  </label>
                  <label>배송 정책
                    <select value={shippingPolicyId} onChange={(event) => setShippingPolicyId(event.target.value)}>
                      <option value="">나중에 연결</option>
                      {policyOptions.map((policy) => <option key={policy.id} value={policy.id}>{policy.name}</option>)}
                    </select>
                  </label>
                </>
              )}
              <label>원가(공급가)<span className="sup-price-input"><input inputMode="numeric" value={costPrice ? Number(costPrice).toLocaleString("ko-KR") : ""} onChange={(event) => setCostPrice(digitsOnly(event.target.value))} /><em>원</em></span><small>공급사 요청 값 {won(requestedCost)}{cost !== requestedCost ? " · 고친 값으로 저장돼요" : ""}</small></label>
              <label>A단가{isCreate ? "*" : ""}<span className="sup-price-input"><input inputMode="numeric" value={aPrice ? Number(aPrice).toLocaleString("ko-KR") : ""} onChange={(event) => setAPrice(digitsOnly(event.target.value))} /><em>원</em></span><small>마진 {marginText(aPrice === "" ? null : Number(aPrice), cost)}</small></label>
              <label>일반공급가{isCreate ? "*" : ""}<span className="sup-price-input"><input inputMode="numeric" value={generalPrice ? Number(generalPrice).toLocaleString("ko-KR") : ""} onChange={(event) => setGeneralPrice(digitsOnly(event.target.value))} /><em>원</em></span><small>마진 {marginText(generalPrice === "" ? null : Number(generalPrice), cost)}</small></label>
              {isCreate && <label className="check-label sup-visible-check"><input type="checkbox" checked={isVisible} onChange={(event) => setIsVisible(event.target.checked)} /> 승인하면 단가표에 바로 보이기</label>}
              <label className="full">처리 메모(공급사에게 보여요)<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={2} placeholder="예: 12월 1일 출고분부터 반영했습니다." /></label>
              {rejecting && <label className="full sup-reject-field">반려 사유(공급사에게 보여요)<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={3} placeholder="예: 공급가 인상 폭이 커서 협의가 필요해요. 담당자가 연락드릴게요." autoFocus /></label>}
            </>
          )}
        </div>
        <div className="editor-footer sup-editor-footer">
          {formError && <p className="sup-form-error" role="alert">{formError}</p>}
          {pending ? (
            rejecting ? (
              <>
                <button type="button" onClick={() => setRejecting(false)} disabled={Boolean(busy)}>반려 취소</button>
                <button type="button" className="sup-reject-confirm" onClick={() => void reject()} disabled={Boolean(busy)}><XCircle size={16} /> {busy === "reject" ? "반려하는 중…" : "반려하기"}</button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => { setRejecting(true); setFormError(""); }} disabled={Boolean(busy)}><XCircle size={16} /> 반려</button>
                {!productGone && <button className="primary-action" type="submit" disabled={Boolean(busy)}><CheckCircle2 size={16} /> {busy === "approve" ? "반영하는 중…" : isCreate ? "승인하고 상품 등록" : "승인하고 반영"}</button>}
              </>
            )
          ) : <button type="button" className="primary-action" onClick={onClose}>확인</button>}
        </div>
      </form>
    </div>
  );
}

// ── 공급사 계정 창(공급사 관리 > 계정) ──────────────────────────────────
export type SupplierAccountView = {
  id: string;
  supplierId: string;
  username: string;
  isActive: boolean;
  commissionRate: number;
  settlementCycle: SupplierSettlementCycle;
  lastLoginAt: string | null;
  createdAt: string;
};

type SupplierLite = { id: string; name: string; isActive: boolean };

function PasswordInput({ value, onChange, placeholder, autoComplete = "new-password" }: { value: string; onChange: (value: string) => void; placeholder?: string; autoComplete?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="sup-password-input">
      <input type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete={autoComplete} maxLength={128} spellCheck={false} />
      <button type="button" onClick={() => setVisible((state) => !state)} aria-label={visible ? "비밀번호 숨기기" : "비밀번호 보기"}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button>
    </span>
  );
}

export function SupplierAccountModal({ supplier, account, portalReady, productCount, onClose, onChanged }: {
  supplier: SupplierLite;
  account: SupplierAccountView | null;
  portalReady: boolean;
  productCount: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [commissionRate, setCommissionRate] = useState(String(account?.commissionRate ?? DEFAULT_SUPPLIER_COMMISSION_RATE));
  const [settlementCycle, setSettlementCycle] = useState<SupplierSettlementCycle>(account?.settlementCycle ?? "monthly");
  const [busy, setBusy] = useState("");
  const loginUrl = `${window.location.origin}/supplier`;
  const normalizedUsername = username.trim().toLowerCase();
  const usernameValid = SUPPLIER_USERNAME_PATTERN.test(normalizedUsername);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    try {
      await work();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "처리하지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  const rateNumber = () => {
    const rate = Number(commissionRate);
    if (commissionRate.trim() === "" || !Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error("수수료율은 0~100% 사이로 입력해 주세요.");
    return rate;
  };

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run("create", async () => {
      if (!usernameValid) throw new Error("아이디는 영문 소문자·숫자·밑줄(_)·마침표(.)로 3~30자 입력해 주세요.");
      if (password.length < SUPPLIER_PASSWORD_MIN) throw new Error(`비밀번호는 ${SUPPLIER_PASSWORD_MIN}자 이상 입력해 주세요.`);
      await readResult(await sendJson(`/catalog/admin/suppliers/${encodeURIComponent(supplier.id)}/account`, "POST", { username: normalizedUsername, password, commissionRate: rateNumber(), settlementCycle }));
      toast.success(`'${normalizedUsername}' 공급사 계정을 만들었습니다. 아이디·비밀번호와 로그인 주소를 공급사에 전해 주세요.`);
      setPassword("");
      onChanged();
    });
  };

  const saveSettings = () => run("settings", async () => {
    await readResult(await sendJson(`/catalog/admin/suppliers/${encodeURIComponent(supplier.id)}/account`, "PUT", { commissionRate: rateNumber(), settlementCycle }));
    toast.success("정산 설정을 저장했습니다.");
    onChanged();
  });

  const changePassword = () => run("password", async () => {
    if (newPassword.length < SUPPLIER_PASSWORD_MIN) throw new Error(`비밀번호는 ${SUPPLIER_PASSWORD_MIN}자 이상 입력해 주세요.`);
    await readResult(await sendJson(`/catalog/admin/suppliers/${encodeURIComponent(supplier.id)}/account`, "PUT", { password: newPassword }));
    setNewPassword("");
    toast.success("비밀번호를 바꿨습니다. 공급사가 로그인해 있던 기기는 로그아웃됩니다.");
    onChanged();
  });

  const toggleActive = () => run("active", async () => {
    if (!account) return;
    if (account.isActive && !window.confirm(`'${account.username}' 계정을 멈출까요? 공급사가 바로 로그아웃되고 다시 켤 때까지 로그인할 수 없습니다.`)) return;
    await readResult(await sendJson(`/catalog/admin/suppliers/${encodeURIComponent(supplier.id)}/account`, "PUT", { isActive: !account.isActive }));
    toast.success(account.isActive ? "계정을 멈췄습니다." : "계정을 다시 쓸 수 있게 했습니다.");
    onChanged();
  });

  const remove = () => run("delete", async () => {
    if (!account) return;
    if (!window.confirm(`'${account.username}' 계정을 삭제할까요? 공급사 정보·상품·요청 내역은 그대로 두고 로그인 계정만 지웁니다.`)) return;
    await readResult(await sendJson(`/catalog/admin/suppliers/${encodeURIComponent(supplier.id)}/account`, "DELETE"));
    toast.success("공급사 계정을 삭제했습니다.");
    onChanged();
  });

  const copyLoginUrl = async () => {
    try {
      await navigator.clipboard.writeText(loginUrl);
      toast.success("로그인 주소를 복사했습니다.");
    } catch {
      toast.error(`복사하지 못했습니다. 주소: ${loginUrl}`);
    }
  };

  const weakPassword = (value: string) => value.length > 0 && value.length < SUPPLIER_PASSWORD_RECOMMENDED;

  return (
    <div className="editor-overlay" role="presentation" onMouseDown={onClose}>
      <section className="editor-panel sup-account-panel" role="dialog" aria-modal="true" aria-labelledby="sup-account-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="editor-header">
          <div><span>SUPPLIER ACCOUNT</span><h2 id="sup-account-title">{supplier.name} 공급사 센터 계정</h2><p>공급사가 이 아이디로 로그인해 내 상품(매입처 = {supplier.name}, 지금 {productCount.toLocaleString("ko-KR")}개)·판매·정산을 보고, 상품 수정·등록을 요청합니다.</p></div>
          <button type="button" onClick={onClose} aria-label="공급사 계정 닫기"><X size={20} /></button>
        </div>
        <div className="editor-grid sup-account-body">
          <div className="sup-login-url full">
            <Store size={17} aria-hidden="true" />
            <span>로그인 주소 <b>{loginUrl}</b></span>
            <button type="button" onClick={() => void copyLoginUrl()}><Copy size={14} /> 복사</button>
          </div>
          {!portalReady ? (
            <p className="sup-form-note full">공급사 계정은 운영 배포가 끝난 뒤 만들 수 있어요(공급사 센터용 새 DB 표가 운영 배포 때 만들어집니다).</p>
          ) : !supplier.isActive ? (
            <p className="sup-form-note full">사용 중지된 공급사예요. 공급사를 다시 사용하면 계정을 만들 수 있어요.</p>
          ) : !account ? (
            <form className="sup-account-create full" onSubmit={create}>
              <div className="sup-form-grid">
                <label>아이디*<input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="예: bomnal" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={30} /><small>{username && !usernameValid ? "영문 소문자·숫자·밑줄(_)·마침표(.)로 3~30자" : "영문 소문자·숫자 3~30자 · 로그인할 때 대소문자는 구분하지 않아요."}</small></label>
                <label>비밀번호*<PasswordInput value={password} onChange={setPassword} placeholder={`${SUPPLIER_PASSWORD_MIN}자 이상`} /><small className={weakPassword(password) ? "is-warning" : ""}>{weakPassword(password) ? `${SUPPLIER_PASSWORD_RECOMMENDED}자 이상을 권장해요. 짧은 비밀번호는 추측되기 쉬워요.` : `${SUPPLIER_PASSWORD_RECOMMENDED}자 이상, 영문·숫자를 섞어 주세요.`}</small></label>
                <label>판매 수수료(%)<input inputMode="decimal" value={commissionRate} onChange={(event) => setCommissionRate(event.target.value.replace(/[^\d.]/g, "").slice(0, 5))} /><small>판매 대금에서 받는 수수료 · 기본 {DEFAULT_SUPPLIER_COMMISSION_RATE}%</small></label>
                <label>정산 방식
                  <select value={settlementCycle} onChange={(event) => setSettlementCycle(event.target.value === "weekly" ? "weekly" : "monthly")}>
                    <option value="monthly">월 정산 (1일~말일 → 다음 달 1~3일)</option>
                    <option value="weekly">주 정산 (월~일 → 다음 주 월요일)</option>
                  </select>
                </label>
              </div>
              <div className="sup-account-actions"><button className="primary-action" type="submit" disabled={busy === "create"}><KeyRound size={16} /> {busy === "create" ? "만드는 중…" : "계정 만들기"}</button></div>
            </form>
          ) : (
            <>
              <dl className="sup-detail-meta full">
                <div><dt>아이디</dt><dd>{account.username}</dd></div>
                <div><dt>상태</dt><dd><span className={`status-pill ${account.isActive ? "active" : "danger"}`}>{account.isActive ? "사용 중" : "멈춤"}</span></dd></div>
                <div><dt>마지막 접속</dt><dd>{shortDateTime(account.lastLoginAt)}</dd></div>
              </dl>
              <section className="sup-account-section full">
                <h3>정산 설정</h3>
                <div className="sup-form-grid">
                  <label>판매 수수료(%)<input inputMode="decimal" value={commissionRate} onChange={(event) => setCommissionRate(event.target.value.replace(/[^\d.]/g, "").slice(0, 5))} /></label>
                  <label>정산 방식
                    <select value={settlementCycle} onChange={(event) => setSettlementCycle(event.target.value === "weekly" ? "weekly" : "monthly")}>
                      <option value="monthly">{SUPPLIER_CYCLE_LABELS.monthly} (1일~말일 → 다음 달 1~3일)</option>
                      <option value="weekly">{SUPPLIER_CYCLE_LABELS.weekly} (월~일 → 다음 주 월요일)</option>
                    </select>
                  </label>
                </div>
                <div className="sup-account-actions"><button type="button" className="primary-action" onClick={() => void saveSettings()} disabled={Boolean(busy)}><Save size={16} /> {busy === "settings" ? "저장 중…" : "설정 저장"}</button></div>
              </section>
              <section className="sup-account-section full">
                <h3>비밀번호 새로 정하기</h3>
                <div className="sup-form-grid">
                  <label className="full">새 비밀번호<PasswordInput value={newPassword} onChange={setNewPassword} placeholder={`${SUPPLIER_PASSWORD_MIN}자 이상`} /><small className={weakPassword(newPassword) ? "is-warning" : ""}>{weakPassword(newPassword) ? `${SUPPLIER_PASSWORD_RECOMMENDED}자 이상을 권장해요.` : "바꾸면 공급사가 로그인해 있던 모든 기기가 로그아웃돼요."}</small></label>
                </div>
                <div className="sup-account-actions"><button type="button" className="primary-action" onClick={() => void changePassword()} disabled={Boolean(busy) || !newPassword}><KeyRound size={16} /> {busy === "password" ? "바꾸는 중…" : "비밀번호 바꾸기"}</button></div>
              </section>
              <section className="sup-account-section is-danger full">
                <h3>계정 멈추기 · 삭제</h3>
                <p>멈추면 바로 로그아웃되고 다시 켤 때까지 로그인할 수 없어요. 삭제해도 공급사 정보·상품·요청 내역은 그대로입니다.</p>
                <div className="sup-account-actions">
                  <button type="button" onClick={() => void toggleActive()} disabled={Boolean(busy)}>{account.isActive ? <><Pause size={15} /> 계정 멈추기</> : <><Play size={15} /> 다시 쓰기</>}</button>
                  <button type="button" className="sup-delete-account" onClick={() => void remove()} disabled={Boolean(busy)}><Trash2 size={15} /> 계정 삭제</button>
                </div>
              </section>
            </>
          )}
        </div>
        <div className="editor-footer"><button type="button" onClick={onClose}>닫기</button></div>
      </section>
    </div>
  );
}
