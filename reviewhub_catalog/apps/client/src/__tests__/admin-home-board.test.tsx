// 관리자 운영 홈(2026-11-24): 판매 요약·매출처·공급사 증감·상품 현황 등 칸(위젯), 칸 빼기·넣기·순서 바꾸기(아이디마다 서버 저장),
// 날짜별 판매 막대 금액 말풍선, 잘 팔린 상품 썸네일.
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "u-admin", name: "마스터 관리자" } }, isPending: false }), signOut: async () => undefined },
  clearAuthToken: () => undefined
}));
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import { AdminHomeBoard, DEFAULT_HOME_LAYOUT, normalizeHomeLayout } from "@/pages/admin/AdminHomeBoard";
import type { AdminHomeData } from "@/pages/catalog/types";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify({ ok: status < 400, data: body }), { status, headers: { "Content-Type": "application/json" } });
}

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const monthStart = `${today.slice(0, 7)}-01`;

const totals = { amount: 9_921_066, quantity: 632, orders: 332, buyers: 38, cost: 9_628_040, returnAmount: 1_213_455, lines: 631 };
const summary = {
  from: monthStart,
  to: today,
  today,
  hasData: true,
  totals,
  previous: { from: "2026-10-08", to: "2026-10-31", amount: 6_116_000, orders: 200 },
  pending: { count: 0, amount: 0 },
  todaySales: {
    totals: { ...totals, amount: 673_663, orders: 18 },
    topProducts: [
      { key: "p1", productId: "p1", name: "지리산 도라지 진액 30포", supplierName: "대현에덴", categoryName: "건강식품", amount: 104_500, quantity: 11, orders: 3, imageUrl: "https://img.test/doraji.jpg" },
      { key: "p2", productId: null, name: "발주오라에만 있는 김", supplierName: null, categoryName: "DB센터 미연결 상품", amount: 58_410, quantity: 3, orders: 1, imageUrl: null }
    ]
  },
  daily: [{ date: monthStart, amount: 1_234_500, orders: 21, quantity: 40 }, { date: today, amount: 673_663, orders: 18, quantity: 30 }],
  topProducts: [{ key: "p1", productId: "p1", name: "지리산 도라지 진액 30포", supplierName: "대현에덴", categoryName: "건강식품", amount: 862_500, quantity: 69, orders: 21, imageUrl: "https://img.test/doraji.jpg" }],
  topSuppliers: [{ name: "대현에덴", amount: 5_510_000, quantity: 432, products: 50 }],
  categories: [{ categoryId: "cat-health", categoryName: "건강식품", amount: 5_870_000, quantity: 465 }],
  topBuyers: [{ key: "b1", name: "나도건강", amount: 3_460_000, orders: 99, quantity: 270 }],
  // 두고푸드 수익 나눠 보기(2026-11-25)
  breakdown: {
    commission: { amount: 8_921_066, fee: 892_107, suppliers: 12, minRate: 10, maxRate: 10 },
    wholesale: { amount: 1_000_000, cost: 820_000, margin: 180_000, suppliers: 2, costMissing: 0 },
    shipping: { received: 99_000, paid: 72_000, margin: 27_000 },
    unassigned: { amount: 0, suppliers: 0 },
    profit: 1_099_107
  },
  sync: null
};

const memberStats = {
  asOf: today,
  since: "2026-10-25",
  buyers: { total: 816, previous: 783, change: 33, changeRate: 4.2, basis: "joined", recent: 33, activeBuyers: 38 },
  suppliers: { total: 52, previous: 53, change: -1, changeRate: -1.9, basis: "snapshot", recent: 0, accounts: 3 }
};

const overview: AdminHomeData = {
  overview: {
    productCount: 2076,
    visibleProductCount: 1837,
    soldOutProductCount: 235,
    priceHistoryCount: 3958,
    sourcingCounts: { received: 2, reviewing: 3, completed: 3 },
    recentNotices: [{ id: "n1", title: "발주 마감시간 안내", isPinned: true, updatedAt: "2026-09-26T00:00:00Z" }]
  } as AdminHomeData["overview"],
  baljuora: { ready: true, linkedCount: 2071, lastCompareAt: null, lastPushAt: "2026-11-24T06:01:00Z", lastPushSummary: null }
};

let savedLayout: unknown = null;
const puts: Array<{ visible: string[]; sizes: Record<string, string> }> = [];

beforeEach(() => {
  savedLayout = null;
  puts.length = 0;
  window.localStorage.clear();
  apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.startsWith("/baljuora/admin/sales/summary")) return json(summary);
    if (path === "/catalog/admin/member-stats") return json(memberStats);
    if (path === "/catalog/admin/home-layout") {
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        puts.push(body);
        savedLayout = body;
        return json({ layout: body });
      }
      if (init?.method === "DELETE") {
        savedLayout = null;
        return json({ reset: true });
      }
      return json({ layout: savedLayout });
    }
    return json({}, 404);
  });
});

afterEach(() => {
  cleanup();
  apiFetch.mockReset();
  vi.useRealTimers();
});

function renderBoard() {
  return render(<MemoryRouter><AdminHomeBoard overview={overview} /></MemoryRouter>);
}

function widgetOrder(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(".ahb-widget")).map((element) => element.dataset.widget);
}

describe("운영 홈 배치 규칙", () => {
  it("저장한 배치가 없으면 기본 배치, 모르는 칸은 빼고 저장 뒤 새로 생긴 칸은 끝에 붙입니다", () => {
    expect(normalizeHomeLayout(null).visible).toEqual(DEFAULT_HOME_LAYOUT);
    const next = normalizeHomeLayout({ visible: ["notices", "unknown-widget", "sales-kpi", "notices"], known: ["notices", "sales-kpi", "members", "catalog-stats", "sales-today", "sales-daily", "sales-top10", "sourcing", "baljuora"], sizes: { notices: "full", "sales-kpi": "tiny" } });
    expect(next.visible).toEqual(["notices", "sales-kpi", "rank-buyers"]);
    expect(next.sizes).toEqual({ notices: "full" });
  });
});

describe("운영 홈", () => {
  it("판매 요약·매출처·공급사 증감·상품 현황·공지를 보여 주고 '데이터센터가 오늘도…' 띠는 없습니다", async () => {
    const { container } = renderBoard();
    expect(await screen.findByText("9,921,066원")).toBeTruthy();
    expect(widgetOrder(container)).toEqual(DEFAULT_HOME_LAYOUT);
    expect(screen.queryByText(/데이터센터가 오늘도 준비되어 있습니다/)).toBeNull();
    // 판매 요약: 두고푸드 예상 수익 + 판매수수료 예상 · 일반 도매 · 배송비 차익 · 공급사에 줄 배송비(100%)
    const kpi = container.querySelector<HTMLElement>('[data-widget="sales-kpi"]')!;
    expect(within(kpi).getByText("두고푸드 예상 수익")).toBeTruthy();
    expect(within(kpi).getByText("1,099,107원")).toBeTruthy();
    expect(within(kpi).getByText("892,107원")).toBeTruthy();
    expect(within(kpi).getByText(/마진 180,000원 \(원가 820,000원\)/)).toBeTruthy();
    expect(within(kpi).getByText("27,000원")).toBeTruthy();
    expect(within(kpi).getByText("72,000원")).toBeTruthy();
    // 매출처·공급사 증감
    const members = container.querySelector<HTMLElement>('[data-widget="members"]')!;
    expect(await within(members).findByText("816")).toBeTruthy();
    expect(within(members).getByText(/증가 4.2%/)).toBeTruthy();
    expect(within(members).getByText(/하락 1.9%/)).toBeTruthy();
    expect(within(members).getByText(/최근 30일 새로 가입 33곳 · 주문한 셀러 38곳/)).toBeTruthy();
    // 상품 현황·입점·발주오라·최근 공지는 그대로
    expect(screen.getByText("2,076")).toBeTruthy();
    expect(screen.getByText("입점·소싱 요청")).toBeTruthy();
    expect(screen.getByText("2,071개")).toBeTruthy();
    expect(screen.getByText("발주 마감시간 안내")).toBeTruthy();
    // 잘 팔린 상품 썸네일(이미지가 없는 상품은 상자 그림)
    const today = container.querySelector<HTMLElement>('[data-widget="sales-today"]')!;
    expect(today.querySelector('img.sa-thumb')?.getAttribute("src")).toBe("https://img.test/doraji.jpg");
    expect(today.querySelectorAll(".sa-thumb.is-empty").length).toBe(1);
  });

  it("날짜별 판매 막대에 마우스를 올리면 그날 판매 금액을 원 단위로 보여 줍니다", async () => {
    const { container } = renderBoard();
    await screen.findByText("9,921,066원");
    const chart = container.querySelector<HTMLElement>('[data-widget="sales-daily"]')!;
    const firstBar = within(chart).getAllByRole("button").find((button) => button.getAttribute("aria-label")?.includes("판매 1,234,500원"))!;
    fireEvent.mouseEnter(firstBar);
    const tip = chart.querySelector(".sa-bar-tip");
    expect(tip?.textContent).toContain("1,234,500원");
    expect(tip?.textContent).toContain("주문 21건");
  });

  it("휴대폰에서 막대를 누르면 말풍선이 바로 닫히지 않습니다(누른 직후 크롬이 보내는 mouseleave 무시)", async () => {
    const { container } = renderBoard();
    await screen.findByText("9,921,066원");
    const chart = container.querySelector<HTMLElement>('[data-widget="sales-daily"]')!;
    const bars = chart.querySelector<HTMLElement>(".sa-bars")!;
    const firstBar = within(chart).getAllByRole("button").find((button) => button.getAttribute("aria-label")?.includes("판매 1,234,500원"))!;
    fireEvent.touchStart(firstBar);
    fireEvent.click(firstBar);
    fireEvent.mouseLeave(bars);
    expect(chart.querySelector(".sa-bar-tip")?.textContent).toContain("1,234,500원");
    // 마우스로 보던 때는 그대로 막대 밖으로 나가면 닫힘
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 5_000);
    fireEvent.mouseEnter(firstBar);
    fireEvent.mouseLeave(bars);
    expect(chart.querySelector(".sa-bar-tip")).toBeNull();
    clock.mockRestore();
  });

  it("칸을 빼고 다시 넣고 순서를 바꾸면 이 아이디 배치로 서버에 저장합니다", async () => {
    const { container } = renderBoard();
    await screen.findByText("9,921,066원");
    fireEvent.click(screen.getByRole("button", { name: "최근 공지 빼기" }));
    expect(widgetOrder(container)).not.toContain("notices");
    fireEvent.click(screen.getByRole("button", { name: /칸 추가/ }));
    fireEvent.click(within(screen.getByText("최근 공지", { selector: ".ahb-add-list strong" }).closest("li")!).getByRole("button", { name: /넣기/ }));
    expect(widgetOrder(container).at(-1)).toBe("notices");
    fireEvent.click(screen.getByRole("button", { name: "판매 요약 뒤로" }));
    expect(widgetOrder(container).slice(0, 2)).toEqual(["members", "sales-kpi"]);
    await waitFor(() => expect(puts.length).toBeGreaterThan(0), { timeout: 2000 });
    expect(puts.at(-1)?.visible.slice(0, 2)).toEqual(["members", "sales-kpi"]);
    expect(puts.at(-1)?.visible.at(-1)).toBe("notices");
    // 이 기기에도 기억해서 다음에 바로 그 배치로 그립니다.
    expect(JSON.parse(window.localStorage.getItem("doogo:admin-home-layout:u-admin") ?? "{}").visible.slice(0, 2)).toEqual(["members", "sales-kpi"]);
  });

  it("저장한 배치(서버)대로 그리고, 기본 배치로 되돌릴 수 있습니다", async () => {
    savedLayout = { visible: ["notices", "sales-kpi"], known: DEFAULT_HOME_LAYOUT, sizes: { notices: "full" } };
    const { container } = renderBoard();
    await waitFor(() => expect(widgetOrder(container)).toEqual(["notices", "sales-kpi"]));
    expect(container.querySelector('[data-widget="notices"]')?.className).toContain("size-full");
    fireEvent.click(screen.getByRole("button", { name: /화면 편집/ }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /기본 배치로/ })); });
    expect(widgetOrder(container)).toEqual(DEFAULT_HOME_LAYOUT);
    expect(apiFetch.mock.calls.some(([path, init]) => path === "/catalog/admin/home-layout" && (init as RequestInit | undefined)?.method === "DELETE")).toBe(true);
  });
});
