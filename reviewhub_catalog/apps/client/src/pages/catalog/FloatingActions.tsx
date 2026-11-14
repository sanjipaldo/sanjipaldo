// 오른쪽 아래 빠른 메뉴(2026-11-14, 관리자 요청): 처음에는 항상 닫혀 있고(둥근 "빠른 메뉴" 버튼 하나만 보여 화면을 가리지 않음),
// 누르면 위로 마진계산기 · 소싱요청 · 톡상담이 펼쳐집니다. 바깥을 누르거나 Esc · 다른 화면으로 이동 · 메뉴를 고르면 다시 닫힙니다.
// 모든 공개 화면(PageFrame)에 붙고, PC는 이름이 보이는 둥근 버튼, 태블릿·휴대폰은 아이콘 + 짧은 이름의 세로 묶음으로 펼칩니다.
// 태블릿(721~1050px)은 아래 고정 메뉴 위에 띄웁니다. 마진계산기 화면(/margin)에서는 마진계산기 항목을 숨깁니다.
import { Calculator, PackageSearch, Plus, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

export const KAKAO_CHANNEL_URL = "https://pf.kakao.com/_NyuVn";

function KakaoBubble() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M12 3.2C6.6 3.2 2.3 6.6 2.3 10.8c0 2.7 1.8 5.1 4.5 6.4l-1 3.6c-.1.4.3.7.6.5l4.3-2.8c.4 0 .9.1 1.3.1 5.4 0 9.7-3.4 9.7-7.6S17.4 3.2 12 3.2Z" />
    </svg>
  );
}

export function FloatingActions({ onSourcing, onMargin, onPrefetchMargin }: { onSourcing: () => void; onMargin: () => void; onPrefetchMargin?: () => void }) {
  const { pathname } = useLocation();
  const onMarginPage = pathname === "/margin";
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);
  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  return (
    <div ref={rootRef} className={`doogo-fab${open ? " is-open" : ""}`}>
      <nav id={menuId} className="doogo-fab-menu" aria-label="빠른 메뉴" hidden={!open}>
        {!onMarginPage && (
          <button type="button" className="doogo-fab-item is-margin" onClick={choose(onMargin)} onPointerEnter={onPrefetchMargin} onFocus={onPrefetchMargin}>
            <span className="doogo-fab-icon" aria-hidden="true"><Calculator size={21} strokeWidth={2.3} /></span>
            <span className="doogo-fab-label">마진계산기</span>
          </button>
        )}
        <button type="button" className="doogo-fab-item is-sourcing" onClick={choose(onSourcing)}>
          <span className="doogo-fab-icon" aria-hidden="true"><PackageSearch size={21} strokeWidth={2.3} /></span>
          <span className="doogo-fab-label">소싱요청</span>
        </button>
        <a className="doogo-fab-item is-kakao" href={KAKAO_CHANNEL_URL} target="_blank" rel="noreferrer" aria-label="톡상담 (카카오톡 채널, 새 창)" onClick={() => setOpen(false)}>
          <span className="doogo-fab-icon" aria-hidden="true"><KakaoBubble /></span>
          <span className="doogo-fab-label" aria-hidden="true">톡상담</span>
        </a>
      </nav>
      <button
        type="button"
        className="doogo-fab-toggle"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={open ? "빠른 메뉴 닫기" : "빠른 메뉴 열기 (마진계산기 · 소싱요청 · 톡상담)"}
        onClick={() => setOpen((value) => !value)}
        onPointerEnter={onMarginPage ? undefined : onPrefetchMargin}
      >
        <span className="doogo-fab-toggle-icon" aria-hidden="true">{open ? <X size={22} strokeWidth={2.4} /> : <Plus size={24} strokeWidth={2.4} />}</span>
        <span className="doogo-fab-toggle-label" aria-hidden="true">{open ? "닫기" : "빠른 메뉴"}</span>
      </button>
    </div>
  );
}
