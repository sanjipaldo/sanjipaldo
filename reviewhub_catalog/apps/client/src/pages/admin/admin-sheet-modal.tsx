// 관리자 팝업 틀(2026-11-27, 운영 홈 상품 동기화 미리보기·발주오라 동기화 숫자 카드 팝업이 같이 씀).
// 4장 규칙: 스크롤해도 맨 위 제목 + 닫기(X)가 고정되고 아래 버튼 줄도 항상 보입니다(PC는 가운데 창, 720px 이하는 화면 전체 시트).
// 처음 열 때만 창 안으로 포커스를 옮기고(1초마다 다시 그려지는 화면에서도 목록·입력이 닫히지 않게 닫기 함수는 ref로), Esc·바깥 누르기로 닫습니다.
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import "./admin-sheet-modal.css";

export function AdminSheetModal({ kicker, title, description, onClose, children, footer, wide = false, className = "" }: {
  kicker?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="asm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeRef.current(); }}>
      <div ref={dialogRef} className={`asm-dialog${wide ? " is-wide" : ""}${className ? ` ${className}` : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="asm-head">
          <div className="asm-head-text">
            {kicker && <span className="asm-kicker">{kicker}</span>}
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="asm-close" onClick={() => closeRef.current()} aria-label="닫기"><X size={19} aria-hidden="true" /></button>
        </div>
        <div className="asm-body">{children}</div>
        {footer && <div className="asm-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

// 20개씩 쪽 번호(관리자 상품 목록과 같은 모양: "1–20개 / 총 N개" + ‹ 1 2 3 … 마지막 ›)
export function pageNumbers(page: number, pages: number) {
  const wanted = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2].filter((value) => value >= 1 && value <= pages));
  const sorted = [...wanted].sort((first, second) => first - second);
  const result: Array<number | "gap"> = [];
  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1]! > 1) result.push("gap");
    result.push(value);
  });
  return result;
}

export function SheetPager({ page, pages, total, size, onPage, label = "개" }: { page: number; pages: number; total: number; size: number; onPage: (page: number) => void; label?: string }) {
  if (total === 0) return null;
  const from = (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  return (
    <nav className="asm-pager" aria-label="쪽 이동">
      <span className="asm-pager-count">{from.toLocaleString("ko-KR")}–{to.toLocaleString("ko-KR")}{label} / 총 {total.toLocaleString("ko-KR")}{label}</span>
      {pages > 1 && (
        <div className="asm-pager-buttons">
          <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="이전 쪽">‹</button>
          {pageNumbers(page, pages).map((value, index) => value === "gap"
            ? <span key={`gap-${index}`} className="asm-pager-gap" aria-hidden="true">…</span>
            : <button key={value} type="button" className={value === page ? "is-current" : ""} aria-current={value === page ? "page" : undefined} onClick={() => onPage(value)}>{value}</button>)}
          <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="다음 쪽">›</button>
        </div>
      )}
    </nav>
  );
}
