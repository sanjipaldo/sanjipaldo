// 두고푸드 앱(홈 화면에 추가) — 2026-11-26 관리자 요청 "셈처럼 휴대폰 홈 화면에 아이콘으로 빼서, 누르면 관리자 화면이 바로 나오게 ·
// 마이페이지 > 설정에서 설치 버튼 · 아직 설치하지 않은 휴대폰이면 위 줄에 '앱으로 설치할 수 있어요'".
// - 관리자(/admin…)·공급사 센터(/supplier…) 화면만 앱용 manifest를 씁니다(관리자 앱은 /admin, 공급사 앱은 /supplier에서 시작).
//   공개 화면(단가표 등)은 예전 site.webmanifest(브라우저로 열기) 그대로라 셀러의 홈 화면 바로가기는 바뀌지 않습니다.
// - 안드로이드(크롬·삼성 인터넷 등)는 브라우저가 주는 설치 창(beforeinstallprompt)을 받아 두었다가 버튼으로 띄우고,
//   아이폰은 설치 창이 없어 Safari 공유 → 홈 화면에 추가 안내를 보여 줍니다.
// - 원클릭 설치(2026-11-26 관리자 요청 "셈처럼 설치하기를 누르면 바로 '앱스 화면에 이 웹페이지를 추가할까요? 취소/추가'가 뜨게"):
//   삼성 인터넷은 서비스 워커가 페이지를 열 때부터 있어야 설치할 수 있는 앱으로 보므로 index.html 첫 스크립트에서 바로 등록하고,
//   설치 창이 아직 없으면(처음 방문이라 서비스 워커가 페이지를 맡기 전) '설치하기'가 한 번만 새로고침해 설치 창을 받습니다.
// - 설치했는지: 앱으로 열려 있으면(display-mode standalone) 확실하고, 브라우저로 열었을 때는 이 기기에 남긴 기록
//   (설치 완료 이벤트·앱으로 연 적 있음·"이미 추가했어요")으로 봅니다. 설치 창이 다시 오면(크롬은 설치된 앱이면 보내지 않음) 기록을 지웁니다.
import { useEffect, useState } from "react";

export type AppArea = "admin" | "supplier";

export const APP_AREAS: Record<AppArea, { manifest: string; scope: string; start: string; title: string; settings: string; name: string }> = {
  admin: { manifest: "/admin.webmanifest", scope: "/admin", start: "/admin", title: "두고푸드", settings: "/admin/settings", name: "두고푸드 관리자" },
  supplier: { manifest: "/supplier.webmanifest", scope: "/supplier", start: "/supplier", title: "두고푸드 공급사", settings: "/supplier/account", name: "두고푸드 공급사센터" }
};

const PUBLIC_MANIFEST = "/site.webmanifest";
const PUBLIC_TITLE = "두고푸드 DB센터";

/** 주소 → 앱 영역(관리자·공급사 센터), 공개 화면이면 null */
export function appAreaOf(pathname: string): AppArea | null {
  if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/auth") return "admin";
  if (pathname === "/supplier" || pathname.startsWith("/supplier/")) return "supplier";
  return null;
}

function headMeta(doc: Document, name: string) {
  let meta = doc.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = doc.createElement("meta");
    meta.name = name;
    doc.head.appendChild(meta);
  }
  return meta;
}

/** 화면 영역에 맞춰 manifest·아이폰 홈 화면 이름을 바꿉니다(index.html 첫 스크립트와 같은 규칙, 화면 이동 때마다). */
export function applyAppHead(area: AppArea | null, doc: Document = document) {
  let link = doc.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) {
    link = doc.createElement("link");
    link.rel = "manifest";
    doc.head.appendChild(link);
  }
  const href = area ? APP_AREAS[area].manifest : PUBLIC_MANIFEST;
  if (link.getAttribute("href") !== href) link.setAttribute("href", href);
  headMeta(doc, "apple-mobile-web-app-title").content = area ? APP_AREAS[area].title : PUBLIC_TITLE;
  // 아이폰: 관리자·공급사 화면을 홈 화면에 추가하면 주소창 없이(앱처럼) 열리게
  if (area) {
    headMeta(doc, "apple-mobile-web-app-capable").content = "yes";
    headMeta(doc, "mobile-web-app-capable").content = "yes";
    headMeta(doc, "apple-mobile-web-app-status-bar-style").content = "default";
  } else {
    for (const name of ["apple-mobile-web-app-capable", "mobile-web-app-capable", "apple-mobile-web-app-status-bar-style"]) doc.head.querySelector(`meta[name="${name}"]`)?.remove();
  }
}

const registered = new Set<AppArea>();

/** 앱 영역에서만 서비스 워커를 등록합니다(화면·자료를 저장하지 않고, 인터넷이 끊겼을 때 안내만 — public/sw.js). */
export function registerAppServiceWorker(area: AppArea, nav: Navigator = navigator) {
  if (registered.has(area) || !("serviceWorker" in nav)) return;
  registered.add(area);
  void nav.serviceWorker.register("/sw.js", { scope: APP_AREAS[area].scope }).catch(() => registered.delete(area));
}

// ── 기기·브라우저 ─────────────────────────────────────────────────────────────

export type InstallBrowser = "safari" | "chrome" | "samsung" | "edge" | "whale" | "firefox" | "inapp" | "other";
export type InstallPlatform = { os: "ios" | "android" | "desktop"; browser: InstallBrowser; inApp: string | null; mobile: boolean };

const IN_APP: Array<[RegExp, string]> = [
  [/KAKAOTALK/i, "카카오톡"],
  [/NAVER\(inapp|NAVER\/\d/i, "네이버 앱"],
  [/Instagram/i, "인스타그램"],
  [/FBAN|FBAV|FB_IAB/i, "페이스북"],
  [/\bLine\//i, "라인"],
  [/\bBAND\//i, "밴드"],
  [/DaumApps|DaumDevice/i, "다음 앱"],
  [/everytimeApp/i, "에브리타임"]
];

export function detectInstallPlatform(ua: string = typeof navigator === "undefined" ? "" : navigator.userAgent, maxTouchPoints = typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints ?? 0): InstallPlatform {
  const ipadDesktop = /Macintosh/.test(ua) && maxTouchPoints > 1;
  const ios = /iPhone|iPad|iPod/.test(ua) || ipadDesktop;
  const android = /Android/i.test(ua);
  const inApp = IN_APP.find(([pattern]) => pattern.test(ua))?.[1] ?? null;
  let browser: InstallBrowser = "other";
  if (inApp) browser = "inapp";
  else if (/SamsungBrowser/i.test(ua)) browser = "samsung";
  else if (/EdgA|EdgiOS|Edg\//.test(ua)) browser = "edge";
  else if (/Whale/i.test(ua)) browser = "whale";
  else if (/FxiOS|Firefox/i.test(ua)) browser = "firefox";
  else if (/CriOS|Chrome|Chromium/i.test(ua)) browser = "chrome";
  else if (ios || /Safari/i.test(ua)) browser = "safari";
  return { os: ios ? "ios" : android ? "android" : "desktop", browser, inApp, mobile: ios || android || /Mobile/i.test(ua) };
}

/** 앱(홈 화면 아이콘)으로 열려 있는지 */
export function isStandaloneDisplay(win: Window = window) {
  const media = (query: string) => typeof win.matchMedia === "function" && win.matchMedia(query).matches;
  return media("(display-mode: standalone)") || media("(display-mode: fullscreen)") || media("(display-mode: minimal-ui)") || (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// ── 설치 기록(이 기기 브라우저) ─────────────────────────────────────────────────

const installedKey = (area: AppArea) => `doogo:app-installed:${area}`;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readInstalled(area: AppArea) {
  try {
    return Boolean(storage()?.getItem(installedKey(area)));
  } catch {
    return false;
  }
}

function writeInstalled(area: AppArea, installed: boolean) {
  try {
    if (installed) storage()?.setItem(installedKey(area), new Date().toISOString());
    else storage()?.removeItem(installedKey(area));
  } catch {
    // 저장이 막힌 브라우저: 이 화면에서만 기억
  }
  emit();
}

// ── 설치 창(beforeinstallprompt) ────────────────────────────────────────────────

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: { event: InstallPromptEvent; area: AppArea } | null = null;
let installedNow: AppArea | null = null;
let capturing = false;
const listeners = new Set<() => void>();

/** 설치 창(beforeinstallprompt)을 주는 브라우저: 안드로이드 크롬·삼성 인터넷·엣지·웨일 등, PC 크롬·엣지·웨일(앱 안 브라우저·파이어폭스·Safari는 없음) */
export function supportsInstallPrompt(platform: InstallPlatform) {
  if (platform.inApp || platform.os === "ios") return false;
  if (platform.os === "android") return platform.browser !== "firefox";
  return platform.browser === "chrome" || platform.browser === "edge" || platform.browser === "whale";
}

// 설치 창이 없을 때 한 번만 새로고침해 다시 받기(이 탭에서 한 번, sessionStorage)
const RETRY_KEY = "doogo:app-install-retry";
/** 새로고침한 뒤 설치 창을 기다리는 시간 */
export const PROMPT_WAIT_MS = 5000;
let controlledAtStart = false;
let retriedAt = 0;
let waitUntil = 0;
let reloadPage = () => window.location.reload();

function session(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** 설치 창이 없을 때: 표시를 남기고 한 번 새로고침(서비스 워커가 처음부터 페이지를 맡은 상태로 브라우저가 다시 확인) */
export function retryInstallWithReload() {
  try {
    session()?.setItem(RETRY_KEY, String(Date.now()));
  } catch {
    // 저장이 막힌 브라우저: 그래도 한 번 새로고침
  }
  reloadPage();
}

function emit() {
  for (const listener of listeners) listener();
}

/** 앱을 시작할 때 한 번(main.tsx): 설치 창·설치 완료를 받아 둡니다. */
export function startAppInstallCapture(win: Window = window) {
  if (capturing) return;
  capturing = true;
  win.addEventListener("beforeinstallprompt", (event) => {
    const area = appAreaOf(win.location.pathname);
    if (!area) return;
    // 브라우저의 작은 설치 띠 대신 우리 버튼으로 띄웁니다.
    event.preventDefault();
    deferred = { event: event as InstallPromptEvent, area };
    // 크롬은 이미 설치된 앱이면 이 창을 보내지 않으므로, 남아 있던 기록(지운 앱)을 지웁니다.
    if (readInstalled(area) && !isStandaloneDisplay(win)) writeInstalled(area, false);
    emit();
  });
  win.addEventListener("appinstalled", () => {
    const area = deferred?.area ?? appAreaOf(win.location.pathname);
    deferred = null;
    if (area) {
      installedNow = area;
      writeInstalled(area, true);
    }
  });
  // 앱으로 열었으면 그 영역은 설치된 것으로 기록(브라우저와 저장 공간을 같이 쓰는 안드로이드에서 위 칩이 안 보이게)
  const area = appAreaOf(win.location.pathname);
  if (area && isStandaloneDisplay(win)) writeInstalled(area, true);
  // 이 페이지를 열 때 이미 서비스 워커가 맡고 있었는지(처음 방문이면 아님 → 설치하기가 한 번 새로고침)
  controlledAtStart = Boolean((win.navigator as Navigator | undefined)?.serviceWorker?.controller);
  try {
    retriedAt = Number(session()?.getItem(RETRY_KEY) || 0) || 0;
  } catch {
    retriedAt = 0;
  }
  if (retriedAt && Date.now() - retriedAt < 30_000) {
    waitUntil = Date.now() + PROMPT_WAIT_MS;
    setTimeout(emit, PROMPT_WAIT_MS + 30);
  }
}

export type AppInstallState = {
  area: AppArea;
  platform: InstallPlatform;
  standalone: boolean;
  installed: boolean;
  /** 지금 누르면 브라우저 설치 창이 뜸 */
  canPrompt: boolean;
  justInstalled: boolean;
  /** 이 브라우저는 설치 창을 주는 종류(버튼 한 번으로 설치하는 화면) */
  promptSupported: boolean;
  /** 새로고침 직후 설치 창을 기다리는 중 */
  waitingPrompt: boolean;
  /** 새로고침 직후인데 설치 창이 오지 않음(순서 안내로) */
  retriedNoPrompt: boolean;
  /** 설치 창이 없을 때 한 번 새로고침해 볼 수 있음(처음 방문이라 서비스 워커가 페이지를 맡기 전) */
  canRetry: boolean;
  /** 이 탭에서 아직 새로고침 재시도를 하지 않음(설치 창에서 취소한 뒤 다시 누르면 새로고침해 설치 창을 다시 받음) */
  retryAllowed: boolean;
};

export function readAppInstallState(area: AppArea): AppInstallState {
  const standalone = typeof window !== "undefined" && isStandaloneDisplay(window);
  const platform = detectInstallPlatform();
  const promptSupported = supportsInstallPrompt(platform);
  const canPrompt = deferred?.area === area;
  const justRetried = Boolean(retriedAt) && Date.now() - retriedAt < 60_000;
  const waitingPrompt = promptSupported && !canPrompt && Date.now() < waitUntil;
  const hasWorkerApi = typeof navigator !== "undefined" && "serviceWorker" in navigator;
  return {
    area,
    platform,
    standalone,
    installed: standalone || readInstalled(area),
    canPrompt,
    justInstalled: installedNow === area,
    promptSupported,
    waitingPrompt,
    retriedNoPrompt: promptSupported && !canPrompt && justRetried && !waitingPrompt,
    canRetry: promptSupported && !canPrompt && hasWorkerApi && !controlledAtStart && !retriedAt,
    retryAllowed: promptSupported && !canPrompt && !retriedAt
  };
}

/** 위 줄 '앱으로 설치' 칩: 휴대폰·태블릿에서 앱으로 열지 않았고 설치 기록이 없을 때만 */
export function shouldShowInstallChip(state: Pick<AppInstallState, "platform" | "standalone" | "installed">) {
  return state.platform.mobile && !state.standalone && !state.installed;
}

/** 브라우저 설치 창 띄우기 */
export async function promptAppInstall(area: AppArea): Promise<"accepted" | "dismissed" | "unavailable"> {
  const current = deferred;
  if (!current || current.area !== area) return "unavailable";
  deferred = null;
  emit();
  try {
    await current.event.prompt();
    const choice = await current.event.userChoice;
    if (choice.outcome === "accepted") {
      installedNow = area;
      writeInstalled(area, true);
    }
    return choice.outcome;
  } catch {
    return "unavailable";
  }
}

export function markAppInstalled(area: AppArea) {
  writeInstalled(area, true);
}

export function clearAppInstalled(area: AppArea) {
  writeInstalled(area, false);
}

export function useAppInstall(area: AppArea): AppInstallState {
  const [state, setState] = useState(() => readAppInstallState(area));
  useEffect(() => {
    const update = () => setState(readAppInstallState(area));
    update();
    listeners.add(update);
    const media = typeof window.matchMedia === "function" ? window.matchMedia("(display-mode: standalone)") : null;
    media?.addEventListener?.("change", update);
    return () => {
      listeners.delete(update);
      media?.removeEventListener?.("change", update);
    };
  }, [area]);
  return state;
}

/** 테스트 전용: 모듈 상태 비우기 */
export function resetAppInstallForTest(reload?: () => void) {
  deferred = null;
  installedNow = null;
  capturing = false;
  controlledAtStart = false;
  retriedAt = 0;
  waitUntil = 0;
  reloadPage = reload ?? (() => window.location.reload());
  registered.clear();
  listeners.clear();
}
