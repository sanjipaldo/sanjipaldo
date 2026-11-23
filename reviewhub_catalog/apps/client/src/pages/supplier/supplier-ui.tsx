// 공급사 센터·관리자 "변경 요청" 화면이 같이 쓰는 작은 부품: 요청 상태 뱃지, 바뀌는 항목 목록(이전 → 이후).
import { ArrowRight, ImageOff } from "lucide-react";
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
