// 오른쪽 아래 빠른 버튼(2026-11-14, 관리자 요청): 위에서부터 마진계산기 · 소싱요청 · 톡상담.
// 모든 공개 화면(PageFrame)에 붙고, PC·태블릿은 이름이 보이는 둥근 버튼, 휴대폰은 아이콘 + 짧은 이름의 세로 묶음입니다.
// 태블릿(721~1050px)은 아래 고정 메뉴 위에 띄웁니다. 마진계산기 화면(/margin)에서는 마진계산기 버튼을 숨깁니다.
import { Calculator, PackageSearch } from "lucide-react";
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
  return (
    <nav className="doogo-fab" aria-label="빠른 메뉴">
      {!onMarginPage && (
        <button type="button" className="doogo-fab-item is-margin" onClick={onMargin} onPointerEnter={onPrefetchMargin} onFocus={onPrefetchMargin}>
          <span className="doogo-fab-icon" aria-hidden="true"><Calculator size={21} strokeWidth={2.3} /></span>
          <span className="doogo-fab-label">마진계산기</span>
        </button>
      )}
      <button type="button" className="doogo-fab-item is-sourcing" onClick={onSourcing}>
        <span className="doogo-fab-icon" aria-hidden="true"><PackageSearch size={21} strokeWidth={2.3} /></span>
        <span className="doogo-fab-label">소싱요청</span>
      </button>
      <a className="doogo-fab-item is-kakao" href={KAKAO_CHANNEL_URL} target="_blank" rel="noreferrer" aria-label="톡상담 (카카오톡 채널, 새 창)">
        <span className="doogo-fab-icon" aria-hidden="true"><KakaoBubble /></span>
        <span className="doogo-fab-label" aria-hidden="true">톡상담</span>
      </a>
    </nav>
  );
}
