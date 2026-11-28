// 발주오라 창 하나로 다시 쓰기 · 창에 남는 동기화 버튼 안내 · 휴대폰 책갈피 만들기(2026-11-27, 책갈피 1.12.0)
// 관리자 요청 "휴대폰(삼성 인터넷)에서는 책갈피를 누르기 어렵다 — DB센터가 연 발주오라 창 오른쪽 아래에 동기화 아이콘이 있으면".
// 2026-11-28 관리자 신고 "삼성 인터넷에서는 발주오라 창에 동기화 버튼이 안 생긴다"(책갈피 1.12.1): 삼성 인터넷이 받는 책갈피 주소 ·
// DB센터 화면에서 책갈피 시험 · 휴대폰에서 발주오라 창을 열기 전 '발주오라 창에서 할 일'.
import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock, Toaster: () => null }));
const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import {
  BALJUORA_WINDOW_NAME,
  BOOKMARKLET_MAX_LENGTH,
  RUNNER_KEEP_MS,
  baljuoraRunner,
  baljuoraWindowUrl,
  bookmarkletCheck,
  bookmarkletHref,
  cleanRunnerPath,
  handleRunnerMessage,
  listenBaljuoraRunner,
  openBaljuoraWindow,
  openGuideHidden,
  resetBaljuoraRunnerForTest,
  runnerOpenMessage,
  whenBookmarkletTested
} from "@/lib/baljuora-window";
import { BaljuoraRunnerHint, BaljuoraWindowLink, MobileBookmarkletGuide } from "@/pages/admin/baljuora-window-ui";
import { OpsSyncButtons, OpsSyncPanel, useOpsSync, type OpsStatus } from "@/pages/admin/OpsSync";

const CONSOLE = "https://console.baljuora.com";
const UA = {
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  windowsChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
};

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", { configurable: true, get: () => ua });
}

function beat(data: Record<string, unknown>, origin = CONSOLE) {
  return handleRunnerMessage({ origin, data: { type: "doogo-runner", version: "1.12.0", state: "idle", path: "/doogobiz24/dashboard", search: "", ...data } });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(status < 400 ? { ok: true, data } : { ok: false, error: { message: "실패" } }), { status, headers: { "Content-Type": "application/json" } });
}

// 브라우저가 javascript: 주소를 실행하듯 %XX만 풀고(잘못된 %는 그대로 — 끝의 //% 는 주석) 스크립트로 실행합니다.
function runBookmarklet(href: string, scope: { window: unknown; document: unknown; alert: unknown }) {
  const code = href.slice("javascript:".length).replace(/%([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  new Function("window", "document", "alert", code)(scope.window, scope.document, scope.alert);
}

// 책갈피가 불러오는 진짜 스크립트(public/baljuora-sync.js)
function runnerSource() {
  const file = [resolve(process.cwd(), "public/baljuora-sync.js"), resolve(process.cwd(), "apps/client/public/baljuora-sync.js")].find((candidate) => existsSync(candidate));
  if (!file) throw new Error("public/baljuora-sync.js를 찾지 못했습니다.");
  return readFileSync(file, "utf8");
}

beforeEach(() => {
  resetBaljuoraRunnerForTest();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  apiFetch.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  delete (window.navigator as unknown as Record<string, unknown>).userAgent;
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("발주오라 창 알림 받기(책갈피 → DB센터)", () => {
  it("발주오라 창(console.baljuora.com)이 보낸 doogo-runner 알림만 받고, 경로·상태를 이 탭에 12시간 기억합니다", () => {
    expect(baljuoraRunner()).toBeNull();
    // 다른 사이트·다른 종류·이상한 경로는 무시
    expect(beat({}, "https://evil.example")).toBe(false);
    expect(handleRunnerMessage({ origin: CONSOLE, data: { type: "other", path: "/a/b", state: "idle" } })).toBe(false);
    expect(beat({ path: "javascript:alert(1)" })).toBe(false);
    expect(beat({ path: "//evil.example/x" })).toBe(false);
    expect(beat({ state: "hacked" })).toBe(false);
    expect(baljuoraRunner()).toBeNull();
    expect(beat({ state: "running", path: "/doogobiz24/products", search: "?page=2" })).toBe(true);
    expect(baljuoraRunner()).toMatchObject({ state: "running", path: "/doogobiz24/products", search: "?page=2", version: "1.12.0" });
    expect(JSON.parse(window.sessionStorage.getItem("doogo:baljuora-runner") ?? "{}")).toMatchObject({ path: "/doogobiz24/products" });
    // 12시간이 지나면 쓰지 않음
    expect(baljuoraRunner(Date.now() + RUNNER_KEEP_MS + 1000)).toBeNull();
    // 창을 닫거나 다른 주소로 가면(gone) 지움
    expect(beat({ state: "gone" })).toBe(true);
    expect(baljuoraRunner()).toBeNull();
    expect(window.sessionStorage.getItem("doogo:baljuora-runner")).toBeNull();
    expect(cleanRunnerPath("/doogobiz24/settlement/bank-transaction")).toBe("/doogobiz24/settlement/bank-transaction");
    expect(cleanRunnerPath("/a b")).toBeNull();
  });

  it("책갈피가 켜진 창의 지금 경로로 코드를 보내 주소의 # 뒤만 바뀌게 합니다(같은 가게 주소 아래일 때만)", () => {
    const url = `${CONSOLE}/doogobiz24/dashboard#doogo-sync=ABCDE23456`;
    expect(baljuoraWindowUrl(url, null)).toBe(url);
    beat({ path: "/doogobiz24/settlement/bank-transaction", search: "?tab=wait" });
    expect(baljuoraWindowUrl(url)).toBe(`${CONSOLE}/doogobiz24/settlement/bank-transaction?tab=wait#doogo-sync=ABCDE23456`);
    // 다른 가게 주소·로그인 화면·발주오라가 아닌 주소는 원래 주소 그대로
    beat({ path: "/othershop/dashboard" });
    expect(baljuoraWindowUrl(url)).toBe(url);
    beat({ path: "/doogobiz24/login" });
    expect(baljuoraWindowUrl(url)).toBe(url);
    beat({ path: "/doogobiz24/products" });
    expect(baljuoraWindowUrl("https://example.com/doogobiz24/dashboard#doogo-sync=X")).toBe("https://example.com/doogobiz24/dashboard#doogo-sync=X");
  });

  it("발주오라 창은 늘 같은 이름(doogo-baljuora)으로 열고 noopener 없이(책갈피가 DB센터에 알릴 수 있게) 앞으로 가져옵니다", () => {
    const focus = vi.fn();
    const open = vi.fn(() => ({ focus }));
    vi.stubGlobal("open", open);
    beat({ path: "/doogobiz24/products" });
    openBaljuoraWindow(`${CONSOLE}/doogobiz24/dashboard#doogo-sync=QWERT67890`);
    expect(open).toHaveBeenCalledWith(`${CONSOLE}/doogobiz24/products#doogo-sync=QWERT67890`, BALJUORA_WINDOW_NAME);
    expect(open.mock.calls[0]).toHaveLength(2);
    expect(focus).toHaveBeenCalled();
    expect(runnerOpenMessage("예전 문구")).toContain("그 창에서 바로 시작돼요");
    beat({ state: "gone" });
    expect(runnerOpenMessage("예전 문구")).toBe("예전 문구");
  });

  it("'발주오라 관리자 창 다시 열기' 링크도 새 탭 대신 같은 창으로 엽니다(Ctrl·⌘ 누르고 누르면 브라우저 기본)", () => {
    const open = vi.fn(() => null);
    vi.stubGlobal("open", open);
    render(<BaljuoraWindowLink href={`${CONSOLE}/doogobiz24/dashboard#doogo-sync=ZXCVB23456`} className="primary-action">다시 열기</BaljuoraWindowLink>);
    const link = screen.getByRole("link", { name: "다시 열기" });
    expect(link.getAttribute("target")).toBe(BALJUORA_WINDOW_NAME);
    expect(link.getAttribute("rel")).toBeNull();
    fireEvent.click(link);
    expect(open).toHaveBeenCalledWith(`${CONSOLE}/doogobiz24/dashboard#doogo-sync=ZXCVB23456`, BALJUORA_WINDOW_NAME);
    // Ctrl을 누른 채 누르면 이 링크는 손대지 않습니다(테스트에서는 브라우저가 실제로 열지 않게 맨 끝에서 막음).
    const stopNavigation = (event: Event) => event.preventDefault();
    document.addEventListener("click", stopNavigation);
    fireEvent.click(link, { ctrlKey: true });
    document.removeEventListener("click", stopNavigation);
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe("작업 기다리는 칸 안내 · 휴대폰 책갈피 만들기", () => {
  it("책갈피가 켜진 창이 있으면 '그 창에서 바로 시작', 없으면 처음 한 번 할 일(삼성 인터넷·크롬은 주소창 ★, 아이폰은 북마크, PC는 책갈피)", () => {
    setUserAgent(UA.samsung);
    const view = render(<MemoryRouter><BaljuoraRunnerHint /></MemoryRouter>);
    const note = () => screen.getByRole("note").textContent ?? "";
    expect(note()).toContain("주소창에 두고동기화를 입력하고 별(★)이 붙은 줄을 누르면 시작돼요");
    expect(note()).toContain("북마크 목록에서 누르면 실행되지 않아요");
    expect(screen.getByRole("link", { name: /책갈피 만들기/ }).getAttribute("href")).toBe("/admin/sync#bookmarklet-mobile");
    act(() => { beat({}); });
    expect(note()).toContain("동기화 버튼이 켜져 있어요");
    view.unmount();
    act(() => { beat({ state: "gone" }); });
    setUserAgent(UA.iphone);
    const iphone = render(<MemoryRouter><BaljuoraRunnerHint /></MemoryRouter>);
    expect(note()).toContain("북마크(책 모양) › 두고동기화를 누르면 시작돼요");
    expect(note()).not.toContain("주소창");
    iphone.unmount();
    setUserAgent(UA.windowsChrome);
    render(<MemoryRouter><BaljuoraRunnerHint /></MemoryRouter>);
    expect(note()).toContain("처음 한 번만 책갈피를 누르면");
    expect(screen.queryByRole("link", { name: /책갈피 만들기/ })).toBeNull();
  });

  it("휴대폰 안내: 책갈피 주소 복사 · 삼성 인터넷이면 삼성 순서부터 · 크롬·아이폰 순서로 바꿔 보기", async () => {
    setUserAgent(UA.samsung);
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<MobileBookmarkletGuide origin="https://doogofood.site" open />);
    const panel = () => screen.getByRole("tabpanel");
    expect(screen.getByRole("tab", { name: "삼성 인터넷" }).getAttribute("aria-selected")).toBe("true");
    expect(panel().textContent).toContain("현재 페이지 추가");
    fireEvent.click(screen.getByRole("button", { name: /책갈피 주소 복사/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(bookmarkletHref("https://doogofood.site")));
    expect(String(writeText.mock.calls[0][0])).toMatch(/^javascript:!function\(\)%7Bvar%20o=%22https:\/\/doogofood\.site%22;/);
    expect(String(writeText.mock.calls[0][0]).endsWith("//%")).toBe(true);
    expect(screen.getByRole("button", { name: /복사했어요/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "크롬" }));
    expect(panel().textContent).toContain("주소창에서 골라야");
    fireEvent.click(screen.getByRole("tab", { name: "아이폰" }));
    expect(panel().textContent).toContain("북마크 추가");
    expect(document.body.textContent).toContain("오른쪽 아래에 동기화 버튼이 생겨요");
    delete (window.navigator as unknown as Record<string, unknown>).clipboard;
  });

  it("복사가 막힌 브라우저는 주소 칸을 보여 주고, 아이폰·크롬이면 그 순서부터 보여 줍니다", async () => {
    setUserAgent(UA.iphone);
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText: vi.fn(async () => { throw new Error("blocked"); }) } });
    const view = render(<MobileBookmarkletGuide origin="https://doogofood.site" open={false} />);
    expect(screen.getByRole("tab", { name: "아이폰", hidden: true }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /책갈피 주소 복사/, hidden: true }));
    await waitFor(() => expect((screen.getByLabelText("책갈피 주소") as HTMLTextAreaElement).value).toBe(bookmarkletHref("https://doogofood.site")));
    expect(toastMock.error).toHaveBeenCalled();
    view.unmount();
    setUserAgent(UA.androidChrome);
    render(<MobileBookmarkletGuide origin="https://doogofood.site" open />);
    expect(screen.getByRole("tab", { name: "크롬" }).getAttribute("aria-selected")).toBe("true");
    delete (window.navigator as unknown as Record<string, unknown>).clipboard;
  });
});

describe("운영 홈 주문 동기화가 책갈피가 켜진 발주오라 창으로 작업을 보냅니다", () => {
  const idle = (): OpsStatus => ({
    ready: true,
    orders: { job: null, last: null, recent: null },
    products: { phase: "idle", compareJob: null, pushJob: null, options: null, planned: null, stalled: false, error: null, last: null }
  });

  function Home() {
    const state = useOpsSync();
    return (
      <MemoryRouter>
        <OpsSyncButtons state={state} />
        <OpsSyncPanel state={state} />
      </MemoryRouter>
    );
  }

  it("버튼을 누르면 그 창의 지금 경로로 코드를 보내고 '그 창에서 바로 시작돼요'라고 알립니다", async () => {
    const open = vi.fn(() => null);
    vi.stubGlobal("open", open);
    beat({ path: "/doogobiz24/orders" });
    let started = false;
    apiFetch.mockImplementation(async (path: string) => {
      if (path === "/baljuora/admin/ops-sync/orders/start") {
        started = true;
        return json({ job: { id: "o-9", type: "sales", status: "waiting", createdAt: new Date().toISOString(), finishedAt: null, expiresAt: new Date(Date.now() + 1800_000).toISOString(), progress: null, summary: null }, code: "ABCDE23456", consoleUrl: `${CONSOLE}/doogobiz24/dashboard#doogo-sync=ABCDE23456` });
      }
      if (path === "/baljuora/admin/ops-sync") {
        return json(started ? { ...idle(), orders: { job: { id: "o-9", type: "sales", status: "waiting", createdAt: new Date().toISOString(), finishedAt: null, expiresAt: new Date(Date.now() + 1800_000).toISOString(), progress: null, summary: null }, last: null, recent: null } } : idle());
      }
      return json({});
    });
    render(<Home />);
    const button = await screen.findByRole("button", { name: /주문 동기화/ });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(open).toHaveBeenCalledWith(`${CONSOLE}/doogobiz24/orders#doogo-sync=ABCDE23456`, BALJUORA_WINDOW_NAME));
    expect(toastMock.success).toHaveBeenCalledWith(expect.stringContaining("그 창에서 바로 시작돼요"));
    await waitFor(() => expect(screen.getByRole("note").textContent).toContain("동기화 버튼이 켜져 있어요"));
  });
});

describe("삼성 인터넷이 받는 책갈피 주소 · DB센터 화면에서 책갈피 시험(1.12.1)", () => {
  it("책갈피 주소는 띄어쓰기·한글 없이 영문·숫자·기호만, 2048자 안, //% 로 끝나고 풀면 동기화 스크립트를 불러옵니다", () => {
    const href = bookmarkletHref("https://doogofood.site");
    expect(href.startsWith("javascript:!function()%7Bvar%20o=%22https://doogofood.site%22;")).toBe(true);
    expect(href.endsWith("//%")).toBe(true);
    expect(href.length).toBeLessThanOrEqual(BOOKMARKLET_MAX_LENGTH);
    expect(href).not.toMatch(/\s/);
    expect(href).toMatch(/^[\x21-\x7e]+$/);
    // %XX는 모두 영문 범위(한글은 \uXXXX로 바꿔 넣음 — 북마크 저장·주소창 실행에서 깨지지 않게)
    expect([...href.matchAll(/%([0-9A-Fa-f]{2})/g)].every((match) => parseInt(match[1]!, 16) < 0x80)).toBe(true);
    const appended: Array<Record<string, any>> = [];
    const fakeWindow: Record<string, unknown> = {};
    const fakeDocument = { createElement: (tag: string) => ({ tag }), head: { appendChild: (element: Record<string, any>) => appended.push(element) }, documentElement: null };
    const alert = vi.fn();
    runBookmarklet(href, { window: fakeWindow, document: fakeDocument, alert });
    expect(fakeWindow.__doogoSyncOrigin).toBe("https://doogofood.site");
    expect(appended).toHaveLength(1);
    expect(appended[0]!.tag).toBe("script");
    expect(appended[0]!.src).toMatch(/^https:\/\/doogofood\.site\/baljuora-sync\.js\?t=\d+$/);
    appended[0]!.onerror();
    expect(alert).toHaveBeenCalledWith("두고푸드 동기화 스크립트를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.");
  });

  it("DB센터 화면에서 책갈피를 실행하면(진짜 스크립트) 경고창 없이 '이 기기에서 책갈피가 잘 작동해요'가 보이고 이 기기에 기억합니다", async () => {
    setUserAgent(UA.samsung);
    // happy-dom 창에는 alert가 없어 가짜를 넣습니다(책갈피 스크립트가 경고창을 띄우면 여기로 옴).
    const alert = vi.fn();
    Object.defineProperty(window, "alert", { configurable: true, writable: true, value: alert });
    const tested = vi.fn();
    const stop = whenBookmarkletTested(tested);
    listenBaljuoraRunner();
    render(<MobileBookmarkletGuide origin={window.location.origin} open />);
    expect(screen.queryByRole("status")).toBeNull();
    // ① 책갈피(주소창 ★ 줄): 이 화면 주소를 DB센터 주소로 적고 스크립트 태그를 붙임 → ② 그 스크립트(public/baljuora-sync.js)가 실행됨
    const appended: Array<Record<string, any>> = [];
    runBookmarklet(bookmarkletHref(window.location.origin), { window, document: { createElement: (tag: string) => ({ tag }), head: { appendChild: (element: Record<string, any>) => appended.push(element) } }, alert: window.alert });
    expect(appended[0]!.src.startsWith(`${window.location.origin}/baljuora-sync.js?t=`)).toBe(true);
    await act(async () => {
      new Function(runnerSource())();
      await Promise.resolve();
    });
    expect(alert).not.toHaveBeenCalled();
    expect(tested).toHaveBeenCalledWith(expect.objectContaining({ version: expect.stringMatching(/^1\.12\./) }));
    expect(screen.getByRole("status").textContent).toContain("이 기기에서 책갈피가 잘 작동해요");
    expect(bookmarkletCheck()).toMatchObject({ version: expect.stringMatching(/^1\.12\./) });
    expect(JSON.parse(window.localStorage.getItem("doogo:bookmarklet-ok") ?? "null")).toMatchObject({ at: expect.any(Number) });
    // 발주오라 작업은 시작하지 않음(동기화 버튼·패널 없음)
    expect(document.getElementById("doogo-sync-fab")).toBeNull();
    stop();
    delete (window as unknown as Record<string, unknown>).alert;
    delete (window as unknown as Record<string, unknown>).__doogoSyncOrigin;
  });
});

describe("휴대폰에서 발주오라 창을 열기 전 '발주오라 창에서 할 일'(2026-11-28)", () => {
  const consoleUrl = `${CONSOLE}/doogobiz24/dashboard#doogo-sync=ABCDE23456`;
  const waitingJob = () => ({ id: "o-9", type: "sales", status: "waiting", createdAt: new Date().toISOString(), finishedAt: null, expiresAt: new Date(Date.now() + 1800_000).toISOString(), progress: null, summary: null });
  const idle = (): OpsStatus => ({
    ready: true,
    orders: { job: null, last: null, recent: null },
    products: { phase: "idle", compareJob: null, pushJob: null, options: null, planned: null, stalled: false, error: null, last: null }
  });

  function mockOrdersApi() {
    let started = false;
    apiFetch.mockImplementation(async (path: string) => {
      if (path === "/baljuora/admin/ops-sync/orders/start") {
        started = true;
        return json({ job: waitingJob(), code: "ABCDE23456", consoleUrl });
      }
      if (path === "/baljuora/admin/ops-sync") return json(started ? { ...idle(), orders: { job: waitingJob(), last: null, recent: null } } : idle());
      return json({});
    });
  }

  function Home() {
    const state = useOpsSync();
    return (
      <MemoryRouter>
        <OpsSyncButtons state={state} />
        <OpsSyncPanel state={state} />
      </MemoryRouter>
    );
  }

  async function pressOrders() {
    const button = await screen.findByRole("button", { name: /주문 동기화/ });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
  }

  it("삼성 인터넷 · 책갈피가 켜진 창 없음: 주문 동기화는 창을 바로 열지 않고 할 일(주소창 ★)을 보여 준 뒤 '발주오라 창 열기'로 엽니다", async () => {
    setUserAgent(UA.samsung);
    const open = vi.fn(() => null);
    vi.stubGlobal("open", open);
    mockOrdersApi();
    render(<Home />);
    await pressOrders();
    const dialog = await screen.findByRole("dialog", { name: "열리는 발주오라 창에서 책갈피를 한 번 실행해 주세요" });
    expect(open).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(dialog.textContent).toContain("주소창을 눌러 두고동기화를 입력하고");
    expect(dialog.textContent).toContain("별(★)이 붙은 두고동기화 줄을 누르세요");
    expect(dialog.textContent).toContain("아직 이 기기에서 책갈피를 확인하지 않았어요");
    expect(within(dialog).getByRole("link", { name: /책갈피 만들기/ }).getAttribute("href")).toBe("/admin/sync#bookmarklet-mobile");
    fireEvent.click(within(dialog).getByRole("button", { name: /발주오라 창 열기/ }));
    expect(open).toHaveBeenCalledWith(consoleUrl, BALJUORA_WINDOW_NAME);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(openGuideHidden()).toBe(false);
  });

  it("'다음부터 이 안내 없이 바로 열기'를 고르면 다음에는 바로 열고, 이 기기에서 책갈피를 확인했으면 그렇게 알려 줍니다", async () => {
    setUserAgent(UA.androidChrome);
    window.localStorage.setItem("doogo:bookmarklet-ok", JSON.stringify({ version: "1.12.1", at: Date.parse("2026-11-28T01:05:00Z") }));
    const open = vi.fn(() => null);
    vi.stubGlobal("open", open);
    render(<MemoryRouter><BaljuoraWindowLink href={consoleUrl}>다시 열기</BaljuoraWindowLink></MemoryRouter>);
    fireEvent.click(screen.getByRole("link", { name: "다시 열기" }));
    const dialog = screen.getByRole("dialog");
    expect(open).not.toHaveBeenCalled();
    expect(dialog.textContent).toContain("이 기기에서 책갈피가 잘 작동하는 걸 확인했어요");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /다음부터 이 안내 없이 바로 열기/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: /발주오라 창 열기/ }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(openGuideHidden()).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "다시 열기" }));
    expect(open).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("아이폰은 북마크(책 모양) 순서로 안내하고, 닫기(×)를 누르면 창을 열지 않습니다", () => {
    setUserAgent(UA.iphone);
    const open = vi.fn(() => null);
    vi.stubGlobal("open", open);
    render(<MemoryRouter><BaljuoraWindowLink href={consoleUrl}>다시 열기</BaljuoraWindowLink></MemoryRouter>);
    fireEvent.click(screen.getByRole("link", { name: "다시 열기" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("북마크(책 모양) › 두고동기화를 누르세요");
    expect(dialog.textContent).not.toContain("주소창을 눌러");
    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });

  it("PC이거나 책갈피가 켜진 발주오라 창이 있으면 안내 없이 바로 열어요", async () => {
    setUserAgent(UA.windowsChrome);
    const open = vi.fn(() => null);
    vi.stubGlobal("open", open);
    mockOrdersApi();
    const view = render(<Home />);
    await pressOrders();
    await waitFor(() => expect(open).toHaveBeenCalledWith(consoleUrl, BALJUORA_WINDOW_NAME));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(toastMock.success).toHaveBeenCalledWith(expect.stringContaining("발주오라 관리자 창을 열었어요"));
    view.unmount();
    // 휴대폰이어도 책갈피가 켜진 창(알림을 받은 창)이 있으면 그 창으로 바로 보냄
    setUserAgent(UA.samsung);
    open.mockClear();
    beat({ path: "/doogobiz24/dashboard" });
    render(<MemoryRouter><BaljuoraWindowLink href={consoleUrl}>다시 열기</BaljuoraWindowLink></MemoryRouter>);
    fireEvent.click(screen.getByRole("link", { name: "다시 열기" }));
    expect(open).toHaveBeenCalledWith(consoleUrl, BALJUORA_WINDOW_NAME);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
