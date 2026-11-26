// 두고푸드 앱(홈 화면에 추가) 화면 조각 — 2026-11-26 관리자 요청.
// - AppInstallChip: 관리자·공급사 센터 위 줄(제목과 '오늘 운영' 사이). 휴대폰·태블릿에서 앱으로 열지 않았고 설치 기록이 없을 때만
//   "앱으로 설치할 수 있어요" → 누르면 설정(관리자 /admin/settings · 공급사 /supplier/account)의 설치 칸으로.
// - AppInstallCard: 설정 화면의 "앱으로 설치" 칸. 안드로이드·PC 크롬/엣지는 '설치하기' 한 번으로 브라우저 설치 창(셈처럼 "앱스 화면에 이 웹페이지를
//   추가할까요? 취소/추가"), 설치 창이 아직 없으면 한 번 새로고침해 받고, 그래도 없으면 순서 안내. 아이폰은 순서 안내,
//   카카오톡 같은 앱 안 브라우저는 다른 브라우저로 여는 법 + 주소 복사, 이미 설치했으면 완료 표시.
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Copy, Download, EllipsisVertical, ExternalLink, Menu, MonitorDown, Share, Smartphone, SquarePlus } from "lucide-react";
import { toast } from "sonner";
import {
  APP_AREAS,
  clearAppInstalled,
  markAppInstalled,
  promptAppInstall,
  retryInstallWithReload,
  shouldShowInstallChip,
  useAppInstall,
  type AppArea,
  type AppInstallState
} from "@/lib/app-install";
import "./app-install.css";

export const APP_ICON_SRC = "/icon-192.png";

export function AppInstallChip({ area }: { area: AppArea }) {
  const state = useAppInstall(area);
  if (!shouldShowInstallChip(state)) return null;
  return (
    <Link to={`${APP_AREAS[area].settings}#app`} className="app-install-chip" aria-label="앱으로 설치할 수 있어요 · 설치 방법 보기" title="휴대폰 홈 화면에 두고푸드 앱 아이콘 만들기">
      <img src={APP_ICON_SRC} alt="" width={24} height={24} />
      <span className="app-install-chip-text" aria-hidden="true">
        <b className="is-long">앱으로 설치</b>
        <small className="is-long">할 수 있어요</small>
        <b className="is-short">앱 설치</b>
      </span>
    </Link>
  );
}

type Step = { key: string; title: ReactNode; detail?: ReactNode; icon?: ReactNode };

/** 기기·브라우저마다 설치 순서(설치 창 버튼을 쓸 수 없을 때) */
export function installSteps(state: Pick<AppInstallState, "platform">, areaName: string): { lead: string; steps: Step[]; copyLink: boolean } {
  const { platform } = state;
  if (platform.inApp) {
    const browser = platform.os === "ios" ? "Safari" : "크롬이나 삼성 인터넷";
    return {
      lead: `${platform.inApp} 안의 브라우저에서는 앱으로 설치할 수 없어요. ${browser}에서 이 화면을 열어 주세요.`,
      copyLink: true,
      steps: [
        { key: "menu", title: <>오른쪽 위(또는 아래) <b>⋮ · …</b> 메뉴를 눌러요.</>, icon: <EllipsisVertical size={18} /> },
        { key: "open", title: <><b>다른 브라우저로 열기</b>{platform.os === "ios" ? " · Safari로 열기" : ""}를 눌러요.</>, detail: "메뉴가 없으면 아래 '주소 복사'를 눌러 브라우저 주소창에 붙여 넣어요.", icon: <ExternalLink size={18} /> },
        { key: "again", title: <>열린 화면의 <b>설정 › 앱으로 설치</b>에서 다시 진행해요.</>, icon: <Smartphone size={18} /> }
      ]
    };
  }
  if (platform.os === "ios") {
    const safari = platform.browser === "safari";
    return {
      lead: "아이폰·아이패드는 공유 메뉴에서 홈 화면에 추가해요.",
      copyLink: false,
      steps: [
        {
          key: "share",
          title: safari ? <>Safari 아래쪽 <b>공유 버튼</b>을 눌러요.</> : <>주소창 오른쪽 <b>공유 버튼</b>을 눌러요.</>,
          detail: safari ? "네모에 위쪽 화살표 모양이에요. 안 보이면 오른쪽 아래 ⋯ 버튼 안에 있고, 아이패드는 주소창 오른쪽 위에 있어요." : "네모에 위쪽 화살표 모양이에요.",
          icon: <Share size={18} />
        },
        { key: "add", title: <>목록을 위로 올려 <b>홈 화면에 추가</b>를 눌러요.</>, icon: <SquarePlus size={18} /> },
        { key: "done", title: <>오른쪽 위 <b>추가</b>를 누르면 홈 화면에 {areaName} 아이콘이 생겨요.</>, icon: <CheckCircle2 size={18} /> }
      ]
    };
  }
  if (platform.os === "android") {
    if (platform.browser === "samsung") {
      return {
        lead: "삼성 인터넷은 메뉴에서 홈 화면에 추가해요.",
        copyLink: false,
        steps: [
          { key: "menu", title: <>아래쪽 <b>메뉴(≡)</b>를 눌러요.</>, detail: "주소창에 설치(+) 아이콘이 보이면 그걸 눌러도 돼요.", icon: <Menu size={18} /> },
          { key: "add", title: <><b>현재 페이지 추가 › 앱스 화면</b>(또는 홈 화면)을 눌러요.</>, icon: <SquarePlus size={18} /> },
          { key: "done", title: <><b>추가</b>를 누르면 앱스 화면·홈 화면에 {areaName} 아이콘이 생겨요.</>, icon: <CheckCircle2 size={18} /> }
        ]
      };
    }
    return {
      lead: "브라우저 메뉴에서 앱을 설치해요.",
      copyLink: false,
      steps: [
        { key: "menu", title: <>오른쪽 위 <b>메뉴(⋮)</b>를 눌러요.</>, icon: <EllipsisVertical size={18} /> },
        { key: "add", title: <><b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 눌러요.</>, icon: <SquarePlus size={18} /> },
        { key: "done", title: <><b>설치</b>를 누르면 홈 화면에 {areaName} 아이콘이 생겨요.</>, icon: <CheckCircle2 size={18} /> }
      ]
    };
  }
  if (platform.browser === "firefox") {
    return { lead: "파이어폭스는 앱 설치를 지원하지 않아요. 크롬이나 엣지에서 이 화면을 열어 주세요.", copyLink: true, steps: [] };
  }
  if (platform.browser === "safari") {
    return {
      lead: "Mac Safari는 Dock에 추가할 수 있어요.",
      copyLink: false,
      steps: [{ key: "dock", title: <>위 메뉴 <b>파일 › Dock에 추가</b>를 눌러요.</>, icon: <MonitorDown size={18} /> }]
    };
  }
  return {
    lead: "PC에서도 크롬·엣지로 설치할 수 있어요.",
    copyLink: false,
    steps: [
      { key: "icon", title: <>주소창 오른쪽 <b>설치 아이콘(⊕)</b>을 눌러요.</>, detail: "아이콘이 없으면 오른쪽 위 메뉴(⋮) › 저장 및 공유 › 앱 설치(또는 페이지를 앱으로 설치)를 눌러요.", icon: <MonitorDown size={18} /> },
      { key: "done", title: <><b>설치</b>를 누르면 바탕화면·시작 메뉴에 {areaName} 아이콘이 생겨요.</>, icon: <CheckCircle2 size={18} /> }
    ]
  };
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function AppInstallCard({ area }: { area: AppArea }) {
  const state = useAppInstall(area);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"" | "dismissed" | "unavailable">("");
  const [showSteps, setShowSteps] = useState(false);
  const app = APP_AREAS[area];
  const place = area === "admin" ? "관리자 화면이" : "공급사 센터가";
  const guide = installSteps(state, app.title);
  // 버튼 한 번으로 설치(셈처럼): 설치 창을 주는 브라우저(안드로이드 크롬·삼성 인터넷·엣지, PC 크롬·엣지)
  const oneClick = state.promptSupported && !state.installed;
  const unavailable = result === "unavailable" || state.retriedNoPrompt;
  const stepsOpen = oneClick ? showSteps || unavailable : true;

  // 위 줄 칩(…/settings#app)으로 들어오면 이 칸으로 내려 줍니다.
  useEffect(() => {
    if (window.location.hash !== "#app") return;
    const timer = window.setTimeout(() => document.getElementById("app")?.scrollIntoView({ block: "start", behavior: "smooth" }), 60);
    return () => window.clearTimeout(timer);
  }, []);

  const install = async () => {
    if (state.canPrompt) {
      setBusy(true);
      try {
        const outcome = await promptAppInstall(area);
        if (outcome === "accepted") {
          setResult("");
          toast.success(`${app.title} 앱을 설치하고 있어요. 잠시 뒤 홈 화면(앱스 화면)을 확인해 주세요.`);
        } else if (outcome === "dismissed") setResult("dismissed");
        else {
          setResult("unavailable");
          setShowSteps(true);
        }
      } finally {
        setBusy(false);
      }
      return;
    }
    // 처음 방문이라 서비스 워커가 페이지를 맡기 전이거나, 설치 창에서 취소해 설치 창을 다 쓴 뒤: 한 번 새로고침하면 브라우저가 설치 창을 다시 줍니다.
    if (state.canRetry || (result === "dismissed" && state.retryAllowed)) {
      setBusy(true);
      retryInstallWithReload();
      return;
    }
    setResult("unavailable");
    setShowSteps(true);
  };

  const copyLink = async () => {
    const url = `${window.location.origin}${app.settings}`;
    if (await copyText(url)) toast.success("주소를 복사했어요. 브라우저 주소창에 붙여 넣어 주세요.");
    else toast.error(`주소를 복사하지 못했어요: ${url}`);
  };

  const status = state.standalone
    ? { tone: "done", text: "지금 앱으로 열려 있어요" }
    : state.installed
      ? { tone: "done", text: state.justInstalled ? "설치했어요 · 홈 화면을 확인해 주세요" : "이 기기에 설치했어요" }
      : oneClick
        ? null
        : { tone: "guide", text: guide.lead };

  const buttonLabel = busy ? (state.canPrompt ? "설치 창을 여는 중…" : "설치 준비 중…") : state.waitingPrompt ? "설치 준비 중…" : "설치하기";
  const resultText =
    result === "dismissed"
      ? "설치를 취소했어요. 다음에 다시 설치할 수 있어요."
      : unavailable
        ? "이 브라우저가 설치 창을 열지 않았어요. 아래 순서대로 추가해 주세요."
        : state.waitingPrompt
          ? "설치 준비 중이에요. 잠시만 기다려 주세요."
          : state.canPrompt
            ? "누르면 바로 설치 창이 떠요. 추가(설치)를 누르면 끝이에요."
            : "";

  return (
    <section id="app" className="admin-card app-install-card" aria-labelledby={`app-install-title-${area}`}>
      <div className="app-install-hero">
        <div className="app-install-preview" aria-hidden="true">
          <img src={APP_ICON_SRC} alt="" width={68} height={68} />
          <span>{app.title}</span>
        </div>
        <div className="app-install-copy">
          <span className="app-install-kicker"><Smartphone size={14} aria-hidden="true" /> 홈 화면에 추가</span>
          <h2 id={`app-install-title-${area}`}>{app.title}를 앱처럼 쓰세요</h2>
          <p>휴대폰 홈 화면에 {app.title} 아이콘을 만들어 두면, 누르자마자 {place} 열려요. 주소를 치거나 북마크를 찾을 필요가 없어요.</p>
          {status && <span className={`app-install-status is-${status.tone}`} role="status">{status.tone === "done" && <CheckCircle2 size={15} aria-hidden="true" />}{status.text}</span>}
        </div>
      </div>

      {oneClick && (
        <div className="app-install-prompt">
          <button type="button" className="app-install-primary" onClick={() => void install()} disabled={busy || state.waitingPrompt} aria-describedby={resultText ? `app-install-result-${area}` : undefined}>
            <Download size={19} aria-hidden="true" /> {buttonLabel}
          </button>
          {resultText && <p id={`app-install-result-${area}`} className={`app-install-result${result === "dismissed" || unavailable ? " is-notice" : ""}`} role="status">{resultText}</p>}
          {!stepsOpen && guide.steps.length > 0 && <button type="button" className="app-install-link" onClick={() => setShowSteps(true)}>직접 추가하는 방법 보기</button>}
        </div>
      )}

      {!state.installed && stepsOpen && (guide.steps.length > 0 || guide.copyLink) && (
        <div className="app-install-guide">
          {guide.steps.length > 0 && (
            <ol className="app-install-steps">
              {guide.steps.map((step) => (
                <li key={step.key}>
                  <span className="app-install-step-text"><span>{step.title}</span>{step.detail && <small>{step.detail}</small>}</span>
                  {step.icon && <span className="app-install-step-icon" aria-hidden="true">{step.icon}</span>}
                </li>
              ))}
            </ol>
          )}
          {guide.copyLink && <button type="button" className="app-install-secondary" onClick={() => void copyLink()}><Copy size={15} aria-hidden="true" /> 주소 복사</button>}
        </div>
      )}

      <ul className="app-install-notes">
        <li>{state.platform.os === "ios" ? "아이폰은 앱에서 처음 한 번 다시 로그인해요. 그다음부터는 로그인이 유지돼요." : "앱에서도 지금 로그인이 그대로 유지돼요."}</li>
        <li>새 기능이 나오면 앱을 다시 열 때 바로 반영돼요(따로 업데이트할 필요 없음).</li>
        <li>{state.platform.mobile ? "앱을 지우려면 홈 화면에서 아이콘을 길게 눌러 삭제하면 돼요." : "앱을 지우려면 앱 창 오른쪽 위 메뉴(⋮)에서 제거를 누르면 돼요."}</li>
      </ul>

      {!state.standalone && (
        <div className="app-install-footer">
          {state.installed
            ? <button type="button" className="app-install-link" onClick={() => clearAppInstalled(area)}>설치 안내 다시 보기</button>
            : <button type="button" className="app-install-link" onClick={() => { markAppInstalled(area); toast.success("위 줄의 '앱으로 설치' 안내를 더 띄우지 않을게요."); }}>{state.platform.mobile ? "이미 홈 화면에 추가했어요" : "이미 설치했어요"}</button>}
        </div>
      )}
    </section>
  );
}
