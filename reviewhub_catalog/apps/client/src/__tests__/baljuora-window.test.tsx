// 발주오라 창 하나로 다시 쓰기 · 창에 남는 동기화 버튼 안내 · 휴대폰 책갈피 만들기(2026-11-27, 책갈피 1.12.0)
// 관리자 요청 "휴대폰(삼성 인터넷)에서는 책갈피를 누르기 어렵다 — DB센터가 연 발주오라 창 오른쪽 아래에 동기화 아이콘이 있으면".
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock, Toaster: () => null }));
const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import {
  BALJUORA_WINDOW_NAME,
  RUNNER_KEEP_MS,
  baljuoraRunner,
  baljuoraWindowUrl,
  bookmarkletHref,
  cleanRunnerPath,
  handleRunnerMessage,
  openBaljuoraWindow,
  resetBaljuoraRunnerForTest,
  runnerOpenMessage
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
  it("책갈피가 켜진 창이 있으면 '그 창에서 바로 시작', 없으면 '처음 한 번만 책갈피'(휴대폰은 쓰는 법 링크)", () => {
    setUserAgent(UA.samsung);
    const view = render(<MemoryRouter><BaljuoraRunnerHint /></MemoryRouter>);
    expect(screen.getByRole("note").textContent).toContain("처음 한 번만 책갈피를 누르면");
    expect(screen.getByRole("link", { name: /휴대폰에서 책갈피 쓰는 법/ }).getAttribute("href")).toBe("/admin/sync#bookmarklet-mobile");
    act(() => { beat({}); });
    expect(screen.getByRole("note").textContent).toContain("동기화 버튼이 켜져 있어요");
    view.unmount();
    act(() => { beat({ state: "gone" }); });
    setUserAgent(UA.windowsChrome);
    render(<MemoryRouter><BaljuoraRunnerHint /></MemoryRouter>);
    expect(screen.queryByRole("link", { name: /휴대폰에서 책갈피 쓰는 법/ })).toBeNull();
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
    expect(String(writeText.mock.calls[0][0])).toMatch(/^javascript:\(function\(\)\{var o="https:\/\/doogofood\.site"/);
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
