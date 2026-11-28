// 발주오라 관리자 창을 하나로 다시 씁니다(2026-11-27 관리자 요청 "휴대폰(삼성 인터넷)에서는 책갈피를 누르기 어렵다 —
// DB센터가 연 발주오라 창 오른쪽 아래에 동기화 아이콘이 있으면 언제든 동기화할 수 있겠다").
//
// DB센터(doogofood.site)는 브라우저 보안 때문에 다른 사이트(console.baljuora.com) 창 안에서 아무것도 실행할 수 없어,
// 그 창에서 책갈피 '두고푸드 동기화'를 처음 한 번은 눌러야 합니다. 한 번 누른 창에는 책갈피 스크립트(1.12.0)가 남아
// 오른쪽 아래 '동기화' 버튼을 띄우고, 주소 뒤 #doogo-sync=코드가 바뀌면 그 작업을 바로 시작합니다.
// 그래서 DB센터는 늘 같은 이름의 창(doogo-baljuora)으로 열고(예전: 매번 새 탭 + noopener), 책갈피가 알려 준 그 창의 지금 경로로
// 코드를 보내 주소의 # 뒤만 바뀌게 합니다(경로가 다르면 창이 새로 열려 책갈피를 다시 눌러야 함).
// 책갈피는 이 창(DB센터)에 "켜져 있음 · 지금 경로 · 상태"만 postMessage로 알립니다(작업 코드·토큰·값 없음).
import { useSyncExternalStore } from "react";
import { BALJUORA_CONSOLE_ORIGIN } from "@repo/shared/baljuora-sync";

export const BALJUORA_WINDOW_NAME = "doogo-baljuora";
export const RUNNER_MESSAGE_TYPE = "doogo-runner";
const STORE_KEY = "doogo:baljuora-runner";
// 책갈피가 켜진 창 정보는 12시간까지만 씁니다. 그 사이 창이 닫혔으면 그 경로로 새 창이 열립니다(발주오라 화면이라 괜찮음).
export const RUNNER_KEEP_MS = 12 * 3600_000;

export type BaljuoraRunnerState = "ready" | "idle" | "running" | "done" | "error";
export type BaljuoraRunnerBeat = { version: string; state: BaljuoraRunnerState; path: string; search: string; at: number };

const STATES = new Set<string>(["ready", "idle", "running", "done", "error"]);
let current: BaljuoraRunnerBeat | null | undefined;
const subscribers = new Set<() => void>();
let listening = false;

// 경로는 발주오라 화면 경로만: "/주소이름/..." (영문·숫자·-·_·/, 200자까지)
export function cleanRunnerPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!/^\/[A-Za-z0-9_\-/]{1,200}$/.test(path) || path.includes("//")) return null;
  return path;
}

// 쿼리(?…)는 # 뒤만 바뀌게 하려면 그대로 있어야 해서 받습니다(500자까지, # 없이).
function cleanRunnerSearch(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("?") || value.length > 500 || value.includes("#") || /\s/.test(value)) return "";
  return value;
}

function cleanBeat(value: unknown): BaljuoraRunnerBeat | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const path = cleanRunnerPath(data.path);
  const at = Number(data.at);
  if (!path || !Number.isFinite(at) || typeof data.state !== "string" || !STATES.has(data.state)) return null;
  return { version: typeof data.version === "string" ? data.version.slice(0, 20) : "", state: data.state as BaljuoraRunnerState, path, search: cleanRunnerSearch(data.search), at };
}

function readStored(): BaljuoraRunnerBeat | null {
  try {
    const raw = window.sessionStorage.getItem(STORE_KEY);
    return raw ? cleanBeat(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function setBeat(beat: BaljuoraRunnerBeat | null) {
  current = beat;
  try {
    if (beat) window.sessionStorage.setItem(STORE_KEY, JSON.stringify(beat));
    else window.sessionStorage.removeItem(STORE_KEY);
  } catch {
    // 저장이 막힌 브라우저: 이 화면에서만 기억합니다.
  }
  subscribers.forEach((notify) => notify());
}

// 발주오라 창(책갈피)이 보낸 알림만 받습니다: 보낸 곳이 console.baljuora.com이고 type이 doogo-runner일 때.
export function handleRunnerMessage(event: Pick<MessageEvent, "origin" | "data">) {
  if (event.origin !== BALJUORA_CONSOLE_ORIGIN) return false;
  const data = event.data as Record<string, unknown> | null;
  if (!data || typeof data !== "object" || data.type !== RUNNER_MESSAGE_TYPE) return false;
  if (data.state === "gone") {
    setBeat(null);
    return true;
  }
  const beat = cleanBeat({ ...data, at: Date.now() });
  if (!beat) return false;
  setBeat(beat);
  return true;
}

const onMessage = (event: MessageEvent) => { handleRunnerMessage(event); };

// 관리자 화면이 열려 있는 동안 발주오라 창의 알림(·책갈피 시험)을 듣습니다(관리자 틀 CatalogAdmin에서 한 번).
export function listenBaljuoraRunner() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("message", onMessage);
  window.addEventListener(BOOKMARKLET_TEST_EVENT, onBookmarkletTest);
}

// 책갈피가 켜진 발주오라 창(12시간 안에 알림을 받은 창) 정보 — 없으면 null
export function baljuoraRunner(now = Date.now()): BaljuoraRunnerBeat | null {
  if (current === undefined) current = typeof window === "undefined" ? null : readStored();
  if (!current || now - current.at > RUNNER_KEEP_MS) return null;
  return current;
}

function subscribe(notify: () => void) {
  subscribers.add(notify);
  return () => { subscribers.delete(notify); };
}

export function useBaljuoraRunner() {
  return useSyncExternalStore(subscribe, () => baljuoraRunner(), () => null);
}

// 코드가 든 발주오라 주소(…/<주소 이름>/dashboard#doogo-sync=코드)를 책갈피가 켜진 창의 지금 경로로 바꿉니다.
// 같은 주소 이름(가게) 아래 경로일 때만 — 로그인 화면 등은 쓰지 않고 원래 주소 그대로.
export function baljuoraWindowUrl(consoleUrl: string, runner: BaljuoraRunnerBeat | null = baljuoraRunner()): string {
  if (!runner) return consoleUrl;
  let url: URL;
  try {
    url = new URL(consoleUrl);
  } catch {
    return consoleUrl;
  }
  if (url.origin !== BALJUORA_CONSOLE_ORIGIN) return consoleUrl;
  const slug = url.pathname.split("/")[1];
  if (!slug || runner.path.split("/")[1] !== slug || /log-?in|sign-?in|log-?out|auth/i.test(runner.path)) return consoleUrl;
  url.pathname = runner.path;
  url.search = runner.search;
  return url.toString();
}

// 발주오라 관리자 창 열기: 늘 같은 이름의 창으로(이미 열려 있으면 그 창에 코드만 보냄 → 책갈피가 켜진 창이면 바로 시작)
export function openBaljuoraWindow(consoleUrl: string): Window | null {
  listenBaljuoraRunner();
  let opened: Window | null = null;
  try {
    opened = window.open(baljuoraWindowUrl(consoleUrl), BALJUORA_WINDOW_NAME);
  } catch {
    opened = null;
  }
  try {
    opened?.focus();
  } catch {
    // 창을 앞으로 가져오지 못해도 코드는 이미 보냈습니다.
  }
  return opened;
}

// 작업을 만든 뒤 알림 문구: 책갈피가 켜진 발주오라 창이 있으면 "그 창에서 바로 시작", 없으면 화면마다 쓰던 문구
export function runnerOpenMessage(fallback: string) {
  return baljuoraRunner()
    ? "발주오라 창으로 작업을 보냈어요. 오른쪽 아래 동기화 버튼이 켜진 창이라 그 창에서 바로 시작돼요(책갈피를 다시 누르지 않아도 돼요)."
    : fallback;
}

// 책갈피(북마클릿) 주소: 발주오라 관리자 창에 DB센터의 동기화 스크립트를 불러옵니다(누를 때마다 새로 받음 ?t=).
// 삼성 인터넷(2026-11-28 관리자 신고 "삼성 인터넷에서는 발주오라 창에 동기화 버튼이 안 생긴다")은
//  ① 북마크 주소에 띄어쓰기가 있으면 저장하지 않고 2048자까지만 받으며
//  ② 북마크 목록에서 누르면 실행하지 않고, 주소창에 북마크 이름을 쳐서 별(★)이 붙은 줄을 눌러야 실행하는데
//  ③ 그때도 주소가 끝에 //% 로 끝나지 않으면 실행 대신 검색해 버리는 경우가 있습니다
// (갤럭시에서 확인한 공개 프로젝트 relaxedbrownie/eruda-tools 의 삼성 브라우저용 짧은 북마클릿과 같은 방식).
// 그래서 한글은 \uXXXX, 띄어쓰기·따옴표·중괄호 등은 %XX로 바꿔 영문·숫자·기호만 남기고 끝에 //% 를 붙입니다(PC 브라우저도 같은 주소로 동작).
const BOOKMARKLET_SAFE = /^[A-Za-z0-9!$&'()*+,\-./:;=?@[\]_~]$/;
export const BOOKMARKLET_MAX_LENGTH = 2048;

function asciiJs(text: string) {
  return text.replace(/[^\x20-\x7e]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function encodeBookmarklet(code: string) {
  return Array.from(code).map((char) => (BOOKMARKLET_SAFE.test(char) ? char : encodeURIComponent(char))).join("");
}

export function bookmarkletHref(origin: string) {
  const failed = asciiJs("두고푸드 동기화 스크립트를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.");
  const code = `!function(){var o=${JSON.stringify(origin)};window.__doogoSyncOrigin=o;var s=document.createElement("script");s.src=o+"/baljuora-sync.js?t="+Date.now();s.onerror=function(){alert("${failed}")};(document.head||document.documentElement).appendChild(s)}();`;
  return `javascript:${encodeBookmarklet(code)}//%`;
}

// ─── 책갈피 시험하기(책갈피 1.12.1) ─────────────────────────────────────────────
// 휴대폰에서 북마크를 만든 뒤 DB센터 화면에서 먼저 눌러 보면, 책갈피 스크립트가 발주오라 대신 이 화면에 이 이벤트를 보내고
// DB센터는 "책갈피가 잘 작동해요"를 보여 줍니다(이 기기에 마지막 확인 시각을 기억).
export const BOOKMARKLET_TEST_EVENT = "doogo-bookmarklet-test";
const BOOKMARKLET_OK_KEY = "doogo:bookmarklet-ok";
export type BookmarkletCheck = { version: string; at: number };
const checkSubscribers = new Set<() => void>();
const testCallbacks = new Set<(check: BookmarkletCheck) => void>();
let lastCheck: BookmarkletCheck | null | undefined;

function readCheck(): BookmarkletCheck | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BOOKMARKLET_OK_KEY) ?? "null");
    return parsed && typeof parsed.at === "number" ? { version: String(parsed.version ?? "").slice(0, 20), at: parsed.at } : null;
  } catch {
    return null;
  }
}

export function bookmarkletCheck(): BookmarkletCheck | null {
  if (lastCheck === undefined) lastCheck = typeof window === "undefined" ? null : readCheck();
  return lastCheck;
}

const onBookmarkletTest = (event: Event) => {
  // 같은 화면에서 실행된 책갈피 스크립트만 보냅니다(다른 사이트는 이 창에 이벤트를 보낼 수 없음).
  event.preventDefault();
  const detail = (event as CustomEvent<{ version?: unknown }>).detail;
  lastCheck = { version: typeof detail?.version === "string" ? detail.version.slice(0, 20) : "", at: Date.now() };
  try {
    window.localStorage.setItem(BOOKMARKLET_OK_KEY, JSON.stringify(lastCheck));
  } catch {
    // 저장이 막힌 브라우저: 이 화면에서만 보입니다.
  }
  checkSubscribers.forEach((notify) => notify());
  testCallbacks.forEach((callback) => callback(lastCheck as BookmarkletCheck));
};

// 책갈피 시험이 성공하면 부를 함수(관리자 틀이 알림을 띄움). 돌려준 함수로 해제.
export function whenBookmarkletTested(callback: (check: BookmarkletCheck) => void) {
  testCallbacks.add(callback);
  return () => { testCallbacks.delete(callback); };
}

function subscribeCheck(notify: () => void) {
  checkSubscribers.add(notify);
  return () => { checkSubscribers.delete(notify); };
}

export function useBookmarkletCheck() {
  return useSyncExternalStore(subscribeCheck, () => bookmarkletCheck(), () => null);
}

// ─── 휴대폰에서 발주오라 창을 열기 전 '할 일' 안내 ────────────────────────────────
// 휴대폰은 창이 열리면 바로 그 창으로 넘어가 DB센터 안내를 볼 수 없어서, 책갈피가 켜진 창이 없으면 열기 전에 할 일을 보여 줍니다.
const OPEN_GUIDE_HIDDEN_KEY = "doogo:baljuora-open-guide-hidden";

export function openGuideHidden() {
  try {
    return window.localStorage.getItem(OPEN_GUIDE_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function setOpenGuideHidden(hidden: boolean) {
  try {
    if (hidden) window.localStorage.setItem(OPEN_GUIDE_HIDDEN_KEY, "1");
    else window.localStorage.removeItem(OPEN_GUIDE_HIDDEN_KEY);
  } catch {
    // 저장이 막힌 브라우저: 다음에도 안내가 나옵니다.
  }
}

// 테스트용: 기억한 창 정보·책갈피 시험 기록을 지웁니다.
export function resetBaljuoraRunnerForTest() {
  current = undefined;
  lastCheck = undefined;
  try {
    window.sessionStorage.removeItem(STORE_KEY);
    window.localStorage.removeItem(BOOKMARKLET_OK_KEY);
    window.localStorage.removeItem(OPEN_GUIDE_HIDDEN_KEY);
  } catch {
    // 무시
  }
}
