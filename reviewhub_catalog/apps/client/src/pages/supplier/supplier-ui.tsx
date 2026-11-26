// 공급사 센터·관리자 "변경 요청" 화면이 같이 쓰는 작은 부품: 요청 상태 뱃지, 바뀌는 항목 목록(이전 → 이후),
// 공급사 목록 쪽 나누기(내 상품·변경 요청 내역).
import { Fragment, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { PageSizeInput, readStoredPageSize } from "@/components/PageSizeInput";
import {
  SUPPLIER_REQUEST_STATUS_LABELS,
  SUPPLIER_SETTLEMENT_STATUS_HINTS,
  SUPPLIER_SETTLEMENT_STATUS_LABELS,
  supplierChangeRows,
  type SupplierChangeField,
  type SupplierProductChanges,
  type SupplierRequestStatus,
  type SupplierSettlementState
} from "@repo/shared/supplier-portal";

export function RequestStatusPill({ status }: { status: SupplierRequestStatus }) {
  return <span className={`status-pill sup-status is-${status}`}>{SUPPLIER_REQUEST_STATUS_LABELS[status]}</span>;
}

function shortDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `${date.getMonth() + 1}.${date.getDate()}`;
}

/** 두고푸드가 바꾼 월 정산 상태(없으면 정산 대기). detail = 안내 글·메모까지 */
export function SettlementStatus({ state, detail = false }: { state: SupplierSettlementState | null | undefined; detail?: boolean }) {
  const status = state?.status ?? "pending";
  const when = status === "done" ? shortDate(state?.doneAt ?? null) : status === "paid" ? shortDate(state?.paidAt ?? null) : "";
  return (
    <span className={`sup-settle-status is-${status} ${detail ? "is-detail" : ""}`}>
      <b>{SUPPLIER_SETTLEMENT_STATUS_LABELS[status]}{when ? ` · ${when}` : ""}</b>
      {detail && <small>{SUPPLIER_SETTLEMENT_STATUS_HINTS[status]}{state?.memo ? ` · 메모: ${state.memo}` : ""}</small>}
    </span>
  );
}

function ImageValue({ url, label }: { url: string | null; label: string }) {
  if (!url) return <span className="sup-diff-image is-empty"><ImageOff size={16} aria-hidden="true" /><small>{label}</small></span>;
  return <span className="sup-diff-image" title={label}><img src={url} alt="" loading="lazy" /></span>;
}

type ChangeRowListProps = {
  changes: SupplierProductChanges;
  // 수정 요청: 요청할 때의 상품 값(이전 값). 신규 등록 요청은 null.
  snapshot: Partial<Record<SupplierChangeField, unknown>> | null;
  categoryName?: (id: string) => string | undefined;
  // 목록 칸처럼 좁은 곳: 이미지를 글자로, 긴 설명은 줄여서
  compact?: boolean;
  limit?: number;
};

export function ChangeRowList({ changes, snapshot, categoryName, compact = false, limit }: ChangeRowListProps) {
  const rows = supplierChangeRows(changes, snapshot, categoryName);
  if (rows.length === 0) return <p className="sup-diff-empty">바뀌는 항목이 없어요.</p>;
  const shown = limit ? rows.slice(0, limit) : rows;
  return (
    <ul className={`sup-diff ${compact ? "is-compact" : ""} ${snapshot ? "" : "is-create"}`}>
      {shown.map((row) => {
        if (row.field === "imageUrl") {
          const before = typeof snapshot?.imageUrl === "string" && snapshot.imageUrl ? snapshot.imageUrl : null;
          const after = typeof changes.imageUrl === "string" && changes.imageUrl ? changes.imageUrl : null;
          if (compact) {
            const text = snapshot ? `${before ? "기존 이미지" : "없음"} → ${after ? "새 이미지" : "이미지 빼기"}` : after ? "이미지 있음" : "없음";
            return <li key={row.field}><span>{row.label}</span><b>{text}</b></li>;
          }
          return (
            <li key={row.field} className="is-image">
              <span>{row.label}</span>
              {snapshot && <><ImageValue url={before} label={before ? "기존 이미지" : "기존 이미지 없음"} /><ArrowRight size={14} aria-hidden="true" /></>}
              <ImageValue url={after} label={after ? "새 이미지" : snapshot ? "이미지 빼기" : "이미지 없음"} />
            </li>
          );
        }
        const long = row.field === "description";
        return (
          <li key={row.field} className={long ? "is-long" : ""} aria-label={snapshot ? `${row.label}: ${row.before}에서 ${row.after}(으)로` : `${row.label}: ${row.after}`}>
            <span>{row.label}</span>
            {snapshot && <><del>{row.before}</del><ArrowRight size={13} aria-hidden="true" /></>}
            <b className={long && compact ? "is-clamped" : ""}>{row.after}</b>
          </li>
        );
      })}
      {limit && rows.length > limit && <li className="sup-diff-more">외 {rows.length - limit}개 항목</li>}
    </ul>
  );
}

// ── 목록 쪽 나누기(2026-11-26 관리자 요청 "10개씩 보여 주고 밑에 1/2/3/4 쪽, 5개든 10개든 공급사가 직접 바꾸게") ──
export const SUPPLIER_PAGE_SIZE = 10;
const SUPPLIER_PAGE_SIZE_MAX = 200;

/** 보이는 쪽 번호: 첫 쪽 · 마지막 쪽 · 지금 쪽 앞뒤 2쪽(사이가 비면 화면에서 …) */
export function buildPageNumbers(total: number, current: number) {
  const visible = new Set<number>([1, total]);
  for (let value = Math.max(1, current - 2); value <= Math.min(total, current + 2); value += 1) visible.add(value);
  return Array.from(visible).sort((first, second) => first - second);
}

/** 목록 쪽 나누기 상태. 페이지당 개수(기본 10개)는 이 브라우저에 기억합니다(storageKey). */
export function useSupplierPaging<T>(items: T[], storageKey: string) {
  const [pageSize, setPageSizeState] = useState(() => readStoredPageSize(storageKey, SUPPLIER_PAGE_SIZE, SUPPLIER_PAGE_SIZE_MAX));
  const [page, setPage] = useState(1);
  const listRef = useRef<HTMLElement>(null);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount);
  const goPage = (next: number) => {
    setPage(Math.max(1, Math.min(next, pageCount)));
    // 아래 쪽 번호를 눌렀으면 목록 맨 위로 올려 줍니다(목록 위가 이미 보이면 그대로 둡니다).
    const card = listRef.current;
    if (card && card.getBoundingClientRect().top < 80 && typeof card.scrollIntoView === "function") card.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  return {
    storageKey,
    page: current,
    pageSize,
    pageCount,
    total: items.length,
    shown: items.slice((current - 1) * pageSize, current * pageSize),
    listRef,
    goPage,
    resetPage: () => setPage(1),
    setPageSize: (value: number) => { setPageSizeState(value); setPage(1); }
  };
}

type SupplierPaging = ReturnType<typeof useSupplierPaging>;

/** 목록 위 오른쪽: "페이지당 [10] 개씩 보기"(숫자를 직접 넣거나 5·10·20·30·50 중에서 고름) */
export function SupplierPageSize({ paging, label }: { paging: SupplierPaging; label: string }) {
  return <PageSizeInput className="page-size-select sup-page-size" value={paging.pageSize} onChange={paging.setPageSize} label={label} presets={[5, 10, 20, 30, 50]} max={SUPPLIER_PAGE_SIZE_MAX} suffix="개씩 보기" storageKey={paging.storageKey} />;
}

/** 목록 아래: "1–10개 / 총 157개" + ‹ 1 2 3 … 16 › */
export function SupplierPager({ paging, label }: { paging: SupplierPaging; label: string }) {
  const { page, pageCount, pageSize, total, goPage } = paging;
  if (total === 0) return null;
  const numbers = buildPageNumbers(pageCount, page);
  return (
    <div className="catalog-pagination admin-product-pagination sup-pagination">
      <span>{((page - 1) * pageSize + 1).toLocaleString("ko-KR")}–{Math.min(page * pageSize, total).toLocaleString("ko-KR")}개 <small>/ 총 {total.toLocaleString("ko-KR")}개</small></span>
      <nav aria-label={label}>
        <button type="button" onClick={() => goPage(page - 1)} disabled={page === 1} aria-label="이전 페이지"><ChevronLeft size={15} /></button>
        {numbers.map((value, index) => (
          <Fragment key={value}>
            {index > 0 && numbers[index - 1] !== value - 1 ? <span aria-hidden="true">…</span> : null}
            <button type="button" className={value === page ? "active" : ""} aria-current={value === page ? "page" : undefined} onClick={() => goPage(value)}>{value}</button>
          </Fragment>
        ))}
        <button type="button" onClick={() => goPage(page + 1)} disabled={page === pageCount} aria-label="다음 페이지"><ChevronRight size={15} /></button>
      </nav>
    </div>
  );
}
