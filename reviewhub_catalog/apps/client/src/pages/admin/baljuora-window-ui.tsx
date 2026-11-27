// 발주오라 관리자 창 열기 링크 · 창에 남는 동기화 버튼 안내 · 휴대폰 책갈피 만들기(2026-11-27 관리자 요청
// "휴대폰(삼성 인터넷)에서는 책갈피를 누르기 어렵다 — 발주오라 창 오른쪽 아래에 동기화 아이콘이 있으면", 책갈피 1.12.0).
// DB센터는 브라우저 보안 때문에 발주오라 창 안에서 책갈피를 대신 누를 수 없어, 그 창에서 처음 한 번은 직접 눌러야 합니다.
// 한 번 누른 창에는 오른쪽 아래 '동기화' 버튼이 남고, DB센터 버튼을 누르면 같은 창에서 바로 시작합니다(lib/baljuora-window.ts).
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Copy, RefreshCw, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { detectInstallPlatform } from "@/lib/app-install";
import { BALJUORA_WINDOW_NAME, bookmarkletHref, openBaljuoraWindow, useBaljuoraRunner } from "@/lib/baljuora-window";
import "./baljuora-window.css";

// '발주오라 관리자 창 다시 열기' 같은 링크: 새 탭 대신 같은 이름의 창으로(책갈피가 켜진 창이면 그 창에서 바로 시작)
export function BaljuoraWindowLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openBaljuoraWindow(href);
  };
  return <a className={className} href={href} target={BALJUORA_WINDOW_NAME} onClick={onClick}>{children}</a>;
}

// 작업을 기다리는 칸 아래 한 줄: 책갈피가 켜진 발주오라 창이 있으면 "그 창에서 바로 시작", 없으면 "처음 한 번만 책갈피"
export function BaljuoraRunnerHint() {
  const runner = useBaljuoraRunner();
  const mobile = detectInstallPlatform().mobile;
  if (runner) {
    return (
      <p className="bjw-hint is-on" role="note">
        <RefreshCw size={15} aria-hidden="true" />
        <span>발주오라 창 오른쪽 아래 <b>동기화</b> 버튼이 켜져 있어요. 그 창이 작업을 받아 바로 시작해요(휴대폰은 그 창으로 가면 시작) — 책갈피를 다시 누르지 않아도 돼요. 창이 새로 열렸다면 책갈피를 한 번 눌러 주세요.</span>
      </p>
    );
  }
  return (
    <p className="bjw-hint" role="note">
      <RefreshCw size={15} aria-hidden="true" />
      <span>
        처음 한 번만 책갈피를 누르면 그 발주오라 창 오른쪽 아래에 <b>동기화</b> 버튼이 생겨요. 그 창을 닫지 않으면 다음부터는 DB센터 버튼만 눌러도 그 창에서 바로 시작돼요.
        {mobile && <> <Link to="/admin/sync#bookmarklet-mobile">휴대폰에서 책갈피 쓰는 법 ›</Link></>}
      </span>
    </p>
  );
}

type GuideTab = "samsung" | "chrome" | "ios";
const GUIDE_TABS: Array<{ id: GuideTab; label: string }> = [
  { id: "samsung", label: "삼성 인터넷" },
  { id: "chrome", label: "크롬" },
  { id: "ios", label: "아이폰" }
];

function defaultGuideTab(): GuideTab {
  const platform = detectInstallPlatform();
  if (platform.os === "ios") return "ios";
  if (platform.os === "android" && platform.browser !== "samsung") return "chrome";
  return "samsung";
}

const COPY_STEP = <>위 <b>책갈피 주소 복사</b>를 누릅니다.</>;
const GUIDE_STEPS: Record<GuideTab, ReactNode[]> = {
  samsung: [
    COPY_STEP,
    <>아무 페이지에서 메뉴(≡) › <b>현재 페이지 추가</b> › <b>북마크</b>로 북마크를 하나 저장합니다.</>,
    <>메뉴(≡) › <b>북마크</b>에서 방금 저장한 북마크를 길게 눌러 <b>편집</b> → 이름은 <b>두고동기화</b>, 주소(URL)는 지우고 복사한 주소를 붙여 넣어 저장합니다.</>,
    <>DB센터 버튼으로 열린 발주오라 창에서 메뉴(≡) › <b>북마크</b> › <b>두고동기화</b>를 누릅니다. 실행되지 않으면 주소창에 <b>두고동기화</b>를 입력하고 아래에 나오는 북마크를 누릅니다.</>
  ],
  chrome: [
    COPY_STEP,
    <>아무 페이지에서 ⋮ › ☆(별)을 눌러 북마크하고, 아래에 뜨는 <b>수정</b>(또는 ⋮ › 북마크 › 그 북마크의 ⋮ › 수정)을 누릅니다.</>,
    <>이름은 <b>두고동기화</b>, URL은 지우고 복사한 주소를 붙여 넣습니다.</>,
    <>발주오라 창의 주소창을 눌러 <b>두고동기화</b>를 입력하고, 아래 목록의 ★ <b>두고동기화</b>를 누릅니다. 크롬은 북마크 메뉴에서 누르면 실행되지 않고 <b>주소창에서 골라야</b> 실행돼요.</>
  ],
  ios: [
    COPY_STEP,
    <>아무 페이지에서 공유(□↑) › <b>북마크 추가</b> › 저장합니다.</>,
    <>북마크(책 모양) › <b>편집</b> › 방금 만든 북마크 → 이름은 <b>두고동기화</b>, 주소는 지우고 복사한 주소를 붙여 넣습니다.</>,
    <>발주오라 창에서 북마크(책 모양) › <b>두고동기화</b>를 누릅니다.</>
  ]
};

// 휴대폰에서 책갈피 쓰기: 북마크를 하나 만들고 주소를 책갈피 주소로 바꾸는 순서(삼성 인터넷 · 크롬 · 아이폰)
export function MobileBookmarkletGuide({ origin, open }: { origin: string; open: boolean }) {
  const [tab, setTab] = useState<GuideTab>(defaultGuideTab);
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const ref = useRef<HTMLDetailsElement>(null);
  const href = bookmarkletHref(origin);
  // 운영 홈의 '휴대폰에서 책갈피 쓰는 법' 링크(/admin/sync#bookmarklet-mobile)로 오면 펼쳐서 보여 줍니다.
  useEffect(() => {
    if (window.location.hash !== "#bookmarklet-mobile" || !ref.current) return;
    ref.current.open = true;
    ref.current.scrollIntoView?.({ block: "start" });
  }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      toast.success("책갈피 주소를 복사했어요. 북마크 주소(URL) 칸에 붙여 넣으세요.");
    } catch {
      setShowRaw(true);
      toast.error("자동으로 복사하지 못했어요. 아래 주소 칸을 길게 눌러 모두 선택한 뒤 복사해 주세요.");
    }
  };
  return (
    <details className="bjw-mobile" id="bookmarklet-mobile" ref={ref} open={open}>
      <summary>
        <Smartphone size={17} aria-hidden="true" />
        <span>휴대폰에서 책갈피 쓰기</span>
        <small>삼성 인터넷 · 크롬 · 아이폰</small>
      </summary>
      <div className="bjw-mobile-body">
        <div className="bjw-mobile-copy">
          <button type="button" className="primary-action" onClick={() => void copy()}><Copy size={15} aria-hidden="true" /> {copied ? "복사했어요" : "책갈피 주소 복사"}</button>
          <small>북마크를 하나 만들고 그 주소(URL)를 이 주소로 바꾸면 책갈피가 돼요. 이름은 <b>두고동기화</b>로 해 두면 찾기 쉬워요.</small>
        </div>
        {showRaw && <textarea className="bjw-mobile-raw" readOnly value={href} aria-label="책갈피 주소" onFocus={(event) => event.currentTarget.select()} />}
        <div className="bjw-mobile-tabs" role="tablist" aria-label="브라우저 고르기">
          {GUIDE_TABS.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "is-active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>
          ))}
        </div>
        <ol className="bjw-mobile-steps" role="tabpanel" aria-label={`${GUIDE_TABS.find((item) => item.id === tab)?.label} 순서`}>
          {GUIDE_STEPS[tab].map((step, index) => <li key={`${tab}-${index}`}>{step}</li>)}
        </ol>
        <p className="bjw-mobile-after">한 번 실행되면 그 발주오라 창 오른쪽 아래에 <b>동기화</b> 버튼이 생겨요. 그 창(탭)을 닫지 않으면 다음부터는 DB센터의 <b>주문 동기화</b>·<b>상품 동기화</b>만 누르면 그 창에서 바로 시작돼요.</p>
        <p className="bjw-mobile-note">홈 화면의 두고푸드 앱으로 열면 발주오라 창이 앱 안의 작은 창으로 열려 북마크를 쓸 수 없어요. 그 창 메뉴의 <b>브라우저에서 열기</b>를 누르거나 삼성 인터넷·크롬에서 DB센터를 열어 주세요. 북마크를 눌러도 실행되지 않는 브라우저라면 크롬에서 써 주세요.</p>
      </div>
    </details>
  );
}
