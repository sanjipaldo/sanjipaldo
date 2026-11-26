// 두고푸드 앱(홈 화면에 추가, 2026-11-26): 앱 영역·manifest 바꾸기 · 기기·브라우저 판별 · 설치 창·설치 기록 · 위 줄 '앱으로 설치' 칩 ·
// 설정 화면 설치 칸(아이폰·갤럭시·카카오톡·PC·앱으로 열림) · 관리자 설정 화면 · manifest·서비스 워커 파일.
import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock, Toaster: () => null }));

import {
  appAreaOf,
  applyAppHead,
  detectInstallPlatform,
  isStandaloneDisplay,
  markAppInstalled,
  promptAppInstall,
  readAppInstallState,
  readInstalled,
  registerAppServiceWorker,
  resetAppInstallForTest,
  shouldShowInstallChip,
  startAppInstallCapture
} from "@/lib/app-install";
import { AppInstallCard, AppInstallChip, installSteps } from "@/components/app-install/AppInstall";
import { AdminSettingsPage } from "@/pages/admin/AdminSettingsPage";

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  androidEdge: "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 EdgA/131.0.0.0",
  whale: "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Whale/4.29.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0",
  kakao: "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 KAKAOTALK 10.8.5",
  naverIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.6.1)",
  instagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0",
  windowsChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  windowsEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  windowsFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0"
};

function setUserAgent(ua: string, maxTouchPoints = 0) {
  Object.defineProperty(window.navigator, "userAgent", { configurable: true, get: () => ua });
  Object.defineProperty(window.navigator, "maxTouchPoints", { configurable: true, get: () => maxTouchPoints });
}

function setStandalone(on: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: on && /display-mode:\s*standalone/.test(query), media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })
  });
}

/** 설치 창을 받을 가짜 창(주소·앱으로 열림 여부만). 마지막으로 만든 창으로 fakeWindowDispatch가 이벤트를 보냅니다. */
let lastFakeWindow: Window | null = null;
function fakeWindow(pathname: string, standalone = false) {
  const target = new EventTarget();
  lastFakeWindow = Object.assign(target, {
    location: { pathname },
    navigator: {},
    matchMedia: (query: string) => ({ matches: standalone && query.includes("standalone"), media: query })
  }) as unknown as Window;
  return lastFakeWindow;
}
function fakeWindowDispatch(event: Event) {
  if (!lastFakeWindow) throw new Error("가짜 창이 없습니다");
  lastFakeWindow.dispatchEvent(event);
}

function installPromptEvent(outcome: "accepted" | "dismissed" = "accepted") {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: ReturnType<typeof vi.fn>; userChoice: Promise<{ outcome: string }> };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

function projectFile(relative: string) {
  const file = [resolve(process.cwd(), relative), resolve(process.cwd(), "apps/client", relative)].find((candidate) => existsSync(candidate));
  if (!file) throw new Error(`${relative}를 찾지 못했습니다.`);
  return file;
}

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  resetAppInstallForTest();
  window.localStorage.clear();
  window.sessionStorage.clear();
  toastMock.mockClear();
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});

afterEach(() => {
  cleanup();
  delete (window.navigator as unknown as Record<string, unknown>).userAgent;
  delete (window.navigator as unknown as Record<string, unknown>).maxTouchPoints;
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: originalMatchMedia });
});

describe("앱 영역 · manifest 바꾸기", () => {
  it("관리자(/admin…, 로그인 /auth)와 공급사 센터(/supplier…)만 앱 영역이고 공개 화면은 아닙니다", () => {
    expect(appAreaOf("/admin")).toBe("admin");
    expect(appAreaOf("/admin/home")).toBe("admin");
    expect(appAreaOf("/admin/settings")).toBe("admin");
    expect(appAreaOf("/auth")).toBe("admin");
    expect(appAreaOf("/supplier")).toBe("supplier");
    expect(appAreaOf("/supplier/sales")).toBe("supplier");
    expect(appAreaOf("/")).toBeNull();
    expect(appAreaOf("/how-to/supplier")).toBeNull();
    expect(appAreaOf("/administrator")).toBeNull();
    expect(appAreaOf("/suppliers")).toBeNull();
  });

  it("화면 이동 때 manifest·아이폰 홈 화면 이름·앱처럼 열기 표시를 영역에 맞춰 바꾸고, 공개 화면으로 오면 되돌립니다", () => {
    document.head.innerHTML = '<link rel="manifest" href="/site.webmanifest" /><meta name="apple-mobile-web-app-title" content="두고푸드 DB센터" />';
    const manifest = () => document.head.querySelector('link[rel="manifest"]')?.getAttribute("href");
    const meta = (name: string) => document.head.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? null;

    applyAppHead("admin");
    expect(manifest()).toBe("/admin.webmanifest");
    expect(meta("apple-mobile-web-app-title")).toBe("두고푸드");
    expect(meta("apple-mobile-web-app-capable")).toBe("yes");
    expect(meta("mobile-web-app-capable")).toBe("yes");

    applyAppHead("supplier");
    expect(manifest()).toBe("/supplier.webmanifest");
    expect(meta("apple-mobile-web-app-title")).toBe("두고푸드 공급사");
    expect(document.head.querySelectorAll('meta[name="apple-mobile-web-app-capable"]')).toHaveLength(1);

    applyAppHead(null);
    expect(manifest()).toBe("/site.webmanifest");
    expect(meta("apple-mobile-web-app-title")).toBe("두고푸드 DB센터");
    expect(meta("apple-mobile-web-app-capable")).toBeNull();
    expect(meta("mobile-web-app-capable")).toBeNull();
  });

  it("index.html 첫 스크립트도 같은 규칙으로 처음 연 주소의 manifest를 고르고, 서비스 워커를 그 영역 범위로 바로 등록합니다(삼성 인터넷 원클릭 설치)", () => {
    const html = readFileSync(projectFile("index.html"), "utf8");
    const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).find((body) => body.includes(".webmanifest"));
    expect(script).toBeTruthy();
    const run = (pathname: string) => {
      document.head.innerHTML = '<link rel="manifest" href="/site.webmanifest" /><meta name="apple-mobile-web-app-title" content="두고푸드 DB센터" />';
      const register = vi.fn().mockResolvedValue({});
      new Function("location", "document", "navigator", script as string)({ pathname }, document, { serviceWorker: { register } });
      return {
        manifest: document.head.querySelector('link[rel="manifest"]')?.getAttribute("href"),
        title: document.head.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute("content"),
        capable: document.head.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute("content") ?? null,
        worker: register.mock.calls[0] ?? null
      };
    };
    const adminWorker = ["/sw.js", { scope: "/admin" }];
    expect(run("/admin")).toEqual({ manifest: "/admin.webmanifest", title: "두고푸드", capable: "yes", worker: adminWorker });
    expect(run("/admin/home")).toEqual({ manifest: "/admin.webmanifest", title: "두고푸드", capable: "yes", worker: adminWorker });
    expect(run("/supplier/home")).toEqual({ manifest: "/supplier.webmanifest", title: "두고푸드 공급사", capable: "yes", worker: ["/sw.js", { scope: "/supplier" }] });
    expect(run("/")).toEqual({ manifest: "/site.webmanifest", title: "두고푸드 DB센터", capable: null, worker: null });
    expect(run("/administrator")).toEqual({ manifest: "/site.webmanifest", title: "두고푸드 DB센터", capable: null, worker: null });
    // 서비스 워커가 없는 브라우저도 오류 없이 manifest만 바꿈
    document.head.innerHTML = '<link rel="manifest" href="/site.webmanifest" />';
    expect(() => new Function("location", "document", "navigator", script as string)({ pathname: "/admin" }, document, {})).not.toThrow();
    expect(document.head.querySelector('link[rel="manifest"]')?.getAttribute("href")).toBe("/admin.webmanifest");
  });

  it("서비스 워커는 영역마다 한 번, 그 영역 범위로만 등록합니다(서비스 워커가 없는 브라우저는 건너뜀)", async () => {
    const register = vi.fn().mockResolvedValue({});
    const nav = { serviceWorker: { register } } as unknown as Navigator;
    registerAppServiceWorker("admin", nav);
    registerAppServiceWorker("admin", nav);
    registerAppServiceWorker("supplier", nav);
    expect(register).toHaveBeenCalledTimes(2);
    expect(register).toHaveBeenNthCalledWith(1, "/sw.js", { scope: "/admin" });
    expect(register).toHaveBeenNthCalledWith(2, "/sw.js", { scope: "/supplier" });
    expect(() => registerAppServiceWorker("admin", {} as Navigator)).not.toThrow();
  });
});

describe("기기·브라우저 판별", () => {
  it.each([
    ["아이폰 Safari", UA.iphoneSafari, 5, { os: "ios", browser: "safari", inApp: null, mobile: true }],
    ["아이폰 크롬", UA.iphoneChrome, 5, { os: "ios", browser: "chrome", inApp: null, mobile: true }],
    ["아이패드(데스크톱 모드)", UA.macSafari, 5, { os: "ios", browser: "safari", inApp: null, mobile: true }],
    ["Mac Safari", UA.macSafari, 0, { os: "desktop", browser: "safari", inApp: null, mobile: false }],
    ["갤럭시 크롬", UA.androidChrome, 5, { os: "android", browser: "chrome", inApp: null, mobile: true }],
    ["삼성 인터넷", UA.samsung, 5, { os: "android", browser: "samsung", inApp: null, mobile: true }],
    ["안드로이드 엣지", UA.androidEdge, 5, { os: "android", browser: "edge", inApp: null, mobile: true }],
    ["웨일", UA.whale, 5, { os: "android", browser: "whale", inApp: null, mobile: true }],
    ["안드로이드 파이어폭스", UA.androidFirefox, 5, { os: "android", browser: "firefox", inApp: null, mobile: true }],
    ["카카오톡", UA.kakao, 5, { os: "android", browser: "inapp", inApp: "카카오톡", mobile: true }],
    ["네이버 앱", UA.naverIos, 5, { os: "ios", browser: "inapp", inApp: "네이버 앱", mobile: true }],
    ["인스타그램", UA.instagram, 5, { os: "ios", browser: "inapp", inApp: "인스타그램", mobile: true }],
    ["윈도 크롬", UA.windowsChrome, 0, { os: "desktop", browser: "chrome", inApp: null, mobile: false }],
    ["윈도 엣지", UA.windowsEdge, 0, { os: "desktop", browser: "edge", inApp: null, mobile: false }]
  ])("%s", (_name, ua, touch, expected) => {
    expect(detectInstallPlatform(ua, touch)).toEqual(expected);
  });

  it("앱으로 열렸는지: 안드로이드는 display-mode, 아이폰은 navigator.standalone", () => {
    expect(isStandaloneDisplay(fakeWindow("/admin", true))).toBe(true);
    expect(isStandaloneDisplay(fakeWindow("/admin", false))).toBe(false);
    const iosApp = Object.assign(fakeWindow("/admin"), { navigator: { standalone: true } }) as unknown as Window;
    expect(isStandaloneDisplay(iosApp)).toBe(true);
  });

  it("위 줄 칩은 휴대폰·태블릿에서, 앱으로 열지 않았고 설치 기록이 없을 때만 보입니다", () => {
    const phone = detectInstallPlatform(UA.iphoneSafari, 5);
    const pc = detectInstallPlatform(UA.windowsChrome, 0);
    expect(shouldShowInstallChip({ platform: phone, standalone: false, installed: false })).toBe(true);
    expect(shouldShowInstallChip({ platform: phone, standalone: true, installed: true })).toBe(false);
    expect(shouldShowInstallChip({ platform: phone, standalone: false, installed: true })).toBe(false);
    expect(shouldShowInstallChip({ platform: pc, standalone: false, installed: false })).toBe(false);
  });
});

describe("설치 창(beforeinstallprompt) · 설치 기록", () => {
  it("관리자 화면에서 받은 설치 창은 우리 버튼으로 띄우고, 설치하면 이 기기에 설치 기록을 남깁니다", async () => {
    startAppInstallCapture(fakeWindow("/admin/home"));
    const event = installPromptEvent("accepted");
    fakeWindowDispatch(event);
    expect(event.defaultPrevented).toBe(true);
    expect(readAppInstallState("admin").canPrompt).toBe(true);
    expect(readAppInstallState("supplier").canPrompt).toBe(false);

    await expect(promptAppInstall("admin")).resolves.toBe("accepted");
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(readInstalled("admin")).toBe(true);
    expect(readAppInstallState("admin")).toMatchObject({ installed: true, justInstalled: true, canPrompt: false });
    // 설치 창은 한 번만 쓸 수 있음
    await expect(promptAppInstall("admin")).resolves.toBe("unavailable");
  });

  it("설치 창에서 취소하면 기록을 남기지 않습니다", async () => {
    startAppInstallCapture(fakeWindow("/supplier/home"));
    fakeWindowDispatch(installPromptEvent("dismissed"));
    await expect(promptAppInstall("admin")).resolves.toBe("unavailable");
    await expect(promptAppInstall("supplier")).resolves.toBe("dismissed");
    expect(readInstalled("supplier")).toBe(false);
  });

  it("공개 화면의 설치 창은 건드리지 않습니다(셀러가 쓰는 공개 단가표는 예전 그대로)", () => {
    startAppInstallCapture(fakeWindow("/"));
    const event = installPromptEvent();
    fakeWindowDispatch(event);
    expect(event.defaultPrevented).toBe(false);
    expect(readAppInstallState("admin").canPrompt).toBe(false);
  });

  it("설치 창이 다시 오면(앱을 지운 기기) 남아 있던 설치 기록을 지우고, 설치 완료 이벤트가 오면 기록합니다", () => {
    markAppInstalled("admin");
    startAppInstallCapture(fakeWindow("/admin/settings"));
    fakeWindowDispatch(installPromptEvent());
    expect(readInstalled("admin")).toBe(false);
    fakeWindowDispatch(new Event("appinstalled"));
    expect(readInstalled("admin")).toBe(true);
    expect(readAppInstallState("admin").justInstalled).toBe(true);
  });

  it("앱(홈 화면 아이콘)으로 열면 그 영역을 설치된 것으로 기록합니다", () => {
    startAppInstallCapture(fakeWindow("/supplier/home", true));
    expect(readInstalled("supplier")).toBe(true);
    expect(readInstalled("admin")).toBe(false);
  });
});

describe("위 줄 '앱으로 설치할 수 있어요' 칩", () => {
  const renderChip = (area: "admin" | "supplier") => render(<MemoryRouter><AppInstallChip area={area} /></MemoryRouter>);

  it("휴대폰에서 아직 설치하지 않았으면 보이고, 누르면 설정의 설치 칸으로 갑니다", () => {
    setUserAgent(UA.iphoneSafari, 5);
    renderChip("admin");
    const chip = screen.getByRole("link", { name: "앱으로 설치할 수 있어요 · 설치 방법 보기" });
    expect(chip.getAttribute("href")).toBe("/admin/settings#app");
    expect(chip.textContent).toContain("앱으로 설치");
    expect(chip.textContent).toContain("할 수 있어요");
    cleanup();
    renderChip("supplier");
    expect(screen.getByRole("link", { name: "앱으로 설치할 수 있어요 · 설치 방법 보기" }).getAttribute("href")).toBe("/supplier/account#app");
  });

  it("PC, 설치 기록이 있는 기기, 앱으로 연 화면에서는 보이지 않고, 설치하면 바로 사라집니다", () => {
    setUserAgent(UA.windowsChrome, 0);
    renderChip("admin");
    expect(screen.queryByRole("link")).toBeNull();
    cleanup();

    setUserAgent(UA.samsung, 5);
    renderChip("admin");
    expect(screen.getByRole("link")).toBeTruthy();
    act(() => markAppInstalled("admin"));
    expect(screen.queryByRole("link")).toBeNull();
    cleanup();

    window.localStorage.clear();
    setStandalone(true);
    renderChip("admin");
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("설정 화면 '앱으로 설치' 칸", () => {
  const renderCard = (area: "admin" | "supplier" = "admin") => render(<MemoryRouter><AppInstallCard area={area} /></MemoryRouter>);
  const steps = () => within(document.querySelector(".app-install-steps") as HTMLElement).getAllByRole("listitem");

  it("아이폰: 공유 → 홈 화면에 추가 → 추가 순서를 보여 주고, '이미 추가했어요'를 누르면 위 줄 칩을 더 띄우지 않습니다", () => {
    setUserAgent(UA.iphoneSafari, 5);
    renderCard();
    expect(screen.getByRole("heading", { name: "두고푸드를 앱처럼 쓰세요" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("아이폰·아이패드는 공유 메뉴에서 홈 화면에 추가해요.");
    expect(steps()).toHaveLength(3);
    expect(steps()[0].textContent).toContain("공유 버튼");
    expect(steps()[1].textContent).toContain("홈 화면에 추가");
    expect(screen.queryByRole("button", { name: /앱으로 설치하기/ })).toBeNull();
    expect(screen.getByText(/아이폰은 앱에서 처음 한 번 다시 로그인해요/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "이미 홈 화면에 추가했어요" }));
    expect(readInstalled("admin")).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("이 기기에 설치했어요");
    expect(document.querySelector(".app-install-steps")).toBeNull();
    expect(toastMock.success).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "설치 안내 다시 보기" }));
    expect(readInstalled("admin")).toBe(false);
    expect(steps()).toHaveLength(3);
  });

  it("갤럭시(크롬): '설치하기' 한 번 → 브라우저 설치 창 → 설치됨(순서 안내는 접혀 있음)", async () => {
    setUserAgent(UA.androidChrome, 5);
    const win = fakeWindow("/admin/settings");
    startAppInstallCapture(win);
    renderCard();
    expect(screen.getByRole("button", { name: /^설치하기$/ })).toBeTruthy();
    expect(document.querySelector(".app-install-steps")).toBeNull();
    const event = installPromptEvent("accepted");
    act(() => {
      win.dispatchEvent(event);
    });
    expect(screen.getByRole("status").textContent).toContain("누르면 바로 설치 창이 떠요");
    fireEvent.click(screen.getByRole("button", { name: /^설치하기$/ }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("설치했어요 · 홈 화면을 확인해 주세요"));
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(toastMock.success).toHaveBeenCalledWith(expect.stringContaining("두고푸드 앱을 설치하고 있어요"));
    expect(screen.queryByRole("button", { name: /설치하기/ })).toBeNull();
  });

  it("설치 창에서 취소하면 안내하고, 브라우저가 설치 창을 다시 주면 한 번 더 눌러 설치할 수 있습니다", async () => {
    setUserAgent(UA.androidChrome, 5);
    const win = fakeWindow("/admin/settings");
    startAppInstallCapture(win);
    renderCard();
    const first = installPromptEvent("dismissed");
    act(() => {
      win.dispatchEvent(first);
    });
    fireEvent.click(screen.getByRole("button", { name: /^설치하기$/ }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("설치를 취소했어요. 다음에 다시 설치할 수 있어요."));
    expect(first.prompt).toHaveBeenCalledTimes(1);
    expect(readInstalled("admin")).toBe(false);
    const again = installPromptEvent("accepted");
    act(() => {
      win.dispatchEvent(again);
    });
    fireEvent.click(screen.getByRole("button", { name: /^설치하기$/ }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("설치했어요"));
    expect(again.prompt).toHaveBeenCalledTimes(1);
  });

  it("처음 방문이라 설치 창이 아직 없으면 '설치하기'가 한 번만 새로고침해 설치 창을 받습니다", () => {
    setUserAgent(UA.samsung, 5);
    const reload = vi.fn();
    resetAppInstallForTest(reload);
    Object.defineProperty(window.navigator, "serviceWorker", { configurable: true, value: { controller: null } });
    try {
      startAppInstallCapture(fakeWindow("/admin/settings"));
      renderCard();
      fireEvent.click(screen.getByRole("button", { name: /^설치하기$/ }));
      expect(reload).toHaveBeenCalledTimes(1);
      expect(Number(window.sessionStorage.getItem("doogo:app-install-retry"))).toBeGreaterThan(0);
      expect((screen.getByRole("button", { name: /설치 준비 중/ }) as HTMLButtonElement).disabled).toBe(true);
    } finally {
      delete (window.navigator as unknown as Record<string, unknown>).serviceWorker;
    }
  });

  it("새로고침 직후에는 '설치 준비 중…'으로 설치 창을 기다렸다가, 오면 '설치하기'로 바뀝니다", () => {
    setUserAgent(UA.samsung, 5);
    window.sessionStorage.setItem("doogo:app-install-retry", String(Date.now()));
    const win = fakeWindow("/admin/settings");
    startAppInstallCapture(win);
    renderCard();
    const waiting = screen.getByRole("button", { name: /설치 준비 중/ }) as HTMLButtonElement;
    expect(waiting.disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("설치 준비 중이에요");
    act(() => {
      win.dispatchEvent(installPromptEvent());
    });
    const ready = screen.getByRole("button", { name: /^설치하기$/ }) as HTMLButtonElement;
    expect(ready.disabled).toBe(false);
    expect(screen.getByRole("status").textContent).toContain("누르면 바로 설치 창이 떠요");
  });

  it("새로고침해도 설치 창이 오지 않으면 삼성 인터넷 순서(현재 페이지 추가 › 앱스 화면)를 펼칩니다", () => {
    setUserAgent(UA.samsung, 5);
    window.sessionStorage.setItem("doogo:app-install-retry", String(Date.now() - 40_000));
    startAppInstallCapture(fakeWindow("/admin/settings"));
    renderCard();
    expect(screen.getByRole("status").textContent).toBe("이 브라우저가 설치 창을 열지 않았어요. 아래 순서대로 추가해 주세요.");
    expect(steps()[1].textContent).toContain("현재 페이지 추가 › 앱스 화면");
    expect(steps()[2].textContent).toContain("앱스 화면·홈 화면에 두고푸드 아이콘");
  });

  it("삼성 인터넷: 설치 창도 새로고침도 쓸 수 없으면 '설치하기'가 순서 안내를 펼치고, '직접 추가하는 방법 보기'로도 볼 수 있습니다", () => {
    setUserAgent(UA.samsung, 5);
    renderCard();
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.querySelector(".app-install-steps")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "직접 추가하는 방법 보기" }));
    expect(steps()[1].textContent).toContain("현재 페이지 추가 › 앱스 화면");
    expect(screen.queryByRole("button", { name: "직접 추가하는 방법 보기" })).toBeNull();
    cleanup();
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /^설치하기$/ }));
    expect(screen.getByRole("status").textContent).toContain("이 브라우저가 설치 창을 열지 않았어요");
    expect(steps()).toHaveLength(3);
  });

  it("카카오톡 안 브라우저: 다른 브라우저로 여는 법 + 주소 복사", async () => {
    setUserAgent(UA.kakao, 5);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText } });
    renderCard();
    expect(screen.getByRole("status").textContent).toContain("카카오톡 안의 브라우저에서는 앱으로 설치할 수 없어요");
    expect(steps()[1].textContent).toContain("다른 브라우저로 열기");
    fireEvent.click(screen.getByRole("button", { name: "주소 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/admin/settings`));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(expect.stringContaining("주소를 복사했어요")));
    delete (window.navigator as unknown as Record<string, unknown>).clipboard;
  });

  it("PC 크롬·엣지도 '설치하기' 한 번(설치 창이 없으면 주소창 설치 아이콘 안내), 파이어폭스는 다른 브라우저 안내", () => {
    setUserAgent(UA.windowsChrome, 0);
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /^설치하기$/ }));
    expect(screen.getByRole("status").textContent).toContain("이 브라우저가 설치 창을 열지 않았어요");
    expect(steps()).toHaveLength(2);
    expect(screen.getByText(/앱 창 오른쪽 위 메뉴\(⋮\)에서 제거/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "이미 설치했어요" })).toBeTruthy();
    const firefox = installSteps({ platform: detectInstallPlatform(UA.windowsFirefox, 0) }, "두고푸드");
    expect(firefox.steps).toHaveLength(0);
    expect(firefox.copyLink).toBe(true);
  });

  it("앱으로 열려 있으면 '지금 앱으로 열려 있어요'만 보이고 설치 안내·'이미 추가했어요'는 없습니다", () => {
    setUserAgent(UA.androidChrome, 5);
    setStandalone(true);
    renderCard();
    expect(screen.getByRole("status").textContent).toContain("지금 앱으로 열려 있어요");
    expect(document.querySelector(".app-install-steps")).toBeNull();
    expect(screen.queryByRole("button", { name: "이미 홈 화면에 추가했어요" })).toBeNull();
  });

  it("공급사 센터 칸은 '두고푸드 공급사' 이름으로 안내합니다", () => {
    setUserAgent(UA.iphoneSafari, 5);
    renderCard("supplier");
    expect(screen.getByRole("heading", { name: "두고푸드 공급사를 앱처럼 쓰세요" })).toBeTruthy();
    expect(screen.getByText(/누르자마자 공급사 센터가 열려요/)).toBeTruthy();
    expect(steps()[2].textContent).toContain("두고푸드 공급사 아이콘");
  });
});

describe("관리자 > 설정(마이페이지)", () => {
  it("내 계정(MASTER·이름·아이디) · 비밀번호 바꾸기 · 로그아웃 · 앱으로 설치 칸", () => {
    setUserAgent(UA.iphoneSafari, 5);
    const onSignOut = vi.fn();
    render(<MemoryRouter><AdminSettingsPage name="마스터 관리자" username="admin" isPrimary onSignOut={onSignOut} /></MemoryRouter>);
    const account = screen.getByRole("region", { name: "내 계정" });
    expect(account.textContent).toContain("MASTER");
    expect(account.textContent).toContain("마스터 관리자");
    expect(account.textContent).toContain("아이디 admin");
    expect(within(account).getByRole("link", { name: /비밀번호 바꾸기/ }).getAttribute("href")).toBe("/admin/admins");
    fireEvent.click(within(account).getByRole("button", { name: /로그아웃/ }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "두고푸드를 앱처럼 쓰세요" })).toBeTruthy();
    cleanup();
    render(<MemoryRouter><AdminSettingsPage name="MD 김두고" username="subadmin" isPrimary={false} onSignOut={onSignOut} /></MemoryRouter>);
    expect(screen.getByRole("region", { name: "내 계정" }).textContent).toContain("SUB MASTER");
  });
});

describe("manifest · 서비스 워커 파일", () => {
  const readJson = (file: string) => JSON.parse(readFileSync(projectFile(`public/${file}`), "utf8"));

  it.each([
    ["admin.webmanifest", "/admin", "두고푸드 관리자", "두고푸드"],
    ["supplier.webmanifest", "/supplier", "두고푸드 공급사센터", "두고푸드 공급사"]
  ])("%s: 그 영역에서 시작해 앱처럼(standalone) 열리고, 아이콘 파일이 모두 있습니다", (file, start, name, shortName) => {
    const manifest = readJson(file);
    expect(manifest).toMatchObject({ id: start, start_url: start, scope: start, display: "standalone", name, short_name: shortName, lang: "ko" });
    const purposes = manifest.icons.map((icon: { sizes: string; purpose: string }) => `${icon.sizes} ${icon.purpose}`);
    expect(purposes).toEqual(expect.arrayContaining(["192x192 any", "512x512 any", "192x192 maskable", "512x512 maskable"]));
    for (const icon of manifest.icons) expect(existsSync(projectFile(`public${icon.src}`))).toBe(true);
    for (const shortcut of manifest.shortcuts) expect(shortcut.url.startsWith(`${start}/`)).toBe(true);
  });

  it("공개 화면 manifest(site.webmanifest)는 예전처럼 브라우저로 열립니다", () => {
    expect(readJson("site.webmanifest")).toMatchObject({ id: "/", start_url: "/", display: "browser" });
  });

  it("서비스 워커는 화면 이동만 다루고, 인터넷이 끊기면 안내 화면(아이콘 포함)을 돌려줍니다 — 화면·자료는 저장하지 않음", async () => {
    const source = readFileSync(projectFile("public/sw.js"), "utf8");
    expect(source).not.toMatch(/caches\.open|cache\.put|cache\.add/);
    const handlers: Record<string, (event: unknown) => void> = {};
    const fakeSelf = { addEventListener: (type: string, handler: (event: unknown) => void) => { handlers[type] = handler; }, skipWaiting: vi.fn(), registration: { navigationPreload: { enable: vi.fn() } }, clients: { claim: vi.fn() } };
    const network = vi.fn();
    new Function("self", "fetch", "Response", source)(fakeSelf, network, Response);
    expect(Object.keys(handlers).sort()).toEqual(["activate", "fetch", "install"]);

    const dispatch = (mode: string, preloadResponse: Promise<Response | undefined> = Promise.resolve(undefined)) => {
      let responded: Promise<Response> | null = null;
      handlers.fetch({ request: { mode }, preloadResponse, respondWith: (promise: Promise<Response>) => { responded = promise; } });
      return responded as Promise<Response> | null;
    };
    // API·그림 요청은 손대지 않음
    expect(dispatch("cors")).toBeNull();
    expect(dispatch("no-cors")).toBeNull();
    // 화면 이동: 네트워크 응답 그대로
    network.mockResolvedValueOnce(new Response("ok", { status: 200 }));
    expect((await dispatch("navigate"))?.status).toBe(200);
    // 미리 받은 응답(navigation preload)이 있으면 그것
    const preloaded = new Response("preloaded", { status: 200 });
    expect(await dispatch("navigate", Promise.resolve(preloaded))).toBe(preloaded);
    // 인터넷이 끊기면 안내 화면(상태 200: 브라우저의 '인터넷 없이 시작 주소가 열리는지' 확인에서도 앱으로 인정)
    network.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const offline = (await dispatch("navigate")) as Response;
    expect(offline.status).toBe(200);
    expect(offline.headers.get("Cache-Control")).toBe("no-store");
    const html = await offline.text();
    expect(html).toContain("인터넷 연결을 확인해 주세요");
    expect(html).toContain('src="data:image/webp;base64,');
    expect(html).not.toContain("/icon-192.png");
  });
});
