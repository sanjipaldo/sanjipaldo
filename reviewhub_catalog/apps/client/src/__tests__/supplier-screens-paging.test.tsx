// 공급사 센터 화면 개선(2026-11-26 관리자 요청):
// 내 상품·변경 요청 내역 쪽 나누기(기본 10개 · 개수 바꾸기 · 1/2/3 쪽), 판매·정산 빈 공간 줄이기(판매 없는 기간 모으기),
// 공개 화면(사용방법·단가표) 맨 위 "공급사 화면으로 돌아가기".
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock, Toaster: () => null }));

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock("@/lib/auth", () => ({
  getAuthToken: () => "",
  clearAuthToken: () => undefined,
  authClient: {
    useSession: () => ({ data: { user: { id: "u-sup", emailVerified: true } }, isPending: false, refetch: async () => undefined }),
    signOut: async () => undefined
  }
}));

import { SupplierProducts } from "@/pages/supplier/SupplierProducts";
import { SupplierRequests } from "@/pages/supplier/SupplierRequests";
import { SupplierSales } from "@/pages/supplier/SupplierSales";
import { SupplierCenterRoute } from "@/pages/supplier/SupplierCenter";
import { SupplierReturnBar, readSupplierReturn, rememberSupplierReturn } from "@/pages/supplier/supplier-return";
import { buildPageNumbers } from "@/pages/supplier/supplier-ui";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify({ ok: status < 400, data }), { status, headers: { "Content-Type": "application/json" } });
}

function notFound() {
  return new Response(JSON.stringify({ ok: false, error: { message: "없는 주소" } }), { status: 404, headers: { "Content-Type": "application/json" } });
}

const product = (index: number) => ({
  id: `p-${index}`, productCode: `code-${index}`, name: `테스트 상품 ${String(index).padStart(2, "0")}`, imageUrl: null, origin: null, costPrice: 10000 + index,
  salePrice: null, salePriceMode: "autonomous", saleStartMonth: null, saleEndMonth: null, isAlwaysOnSale: true,
  shippingType: "domestic", categoryId: "c-produce", categoryName: "🥕 농산", isVisible: true, isSoldOut: false, isSeasonEnded: false,
  createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z", pendingRequestId: null
});

const request = (index: number) => ({
  id: `r-${index}`, supplierId: "s1", supplierName: "봄날농원", productId: `p-${index}`, productName: `요청 상품 ${String(index).padStart(2, "0")}`,
  kind: "update", status: index % 2 === 0 ? "approved" : "pending", changes: { costPrice: 20000 + index }, snapshot: { costPrice: 10000 + index },
  note: null, reviewNote: null, reviewedBy: null, reviewedAt: null, createdAt: "2026-11-20T01:00:00.000Z", updatedAt: "2026-11-20T01:00:00.000Z"
});

function rowNames(table: HTMLElement) {
  return within(table).getAllByRole("row").slice(1).map((row) => row.querySelector("strong")?.textContent);
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  apiFetch.mockReset();
  vi.useRealTimers();
  toastMock.mockClear();
});

describe("쪽 번호", () => {
  it("첫 쪽 · 마지막 쪽 · 지금 쪽 앞뒤 2쪽만 보여 줍니다", () => {
    expect(buildPageNumbers(1, 1)).toEqual([1]);
    expect(buildPageNumbers(16, 1)).toEqual([1, 2, 3, 16]);
    expect(buildPageNumbers(16, 8)).toEqual([1, 6, 7, 8, 9, 10, 16]);
  });
});

describe("내 상품 쪽 나누기", () => {
  it("기본 10개씩, 아래 쪽 번호로 넘기고, 개수를 5개로 바꾸면 기억합니다", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path === "/supplier/products") return json({ products: Array.from({ length: 23 }, (_, index) => product(index + 1)) });
      if (path === "/supplier/requests") return json({ requests: [] });
      return notFound();
    });
    render(<MemoryRouter><SupplierProducts reloadKey={0} onCreate={vi.fn()} onChanged={vi.fn()} /></MemoryRouter>);
    const table = (await screen.findByText("테스트 상품 01")).closest("table") as HTMLElement;
    expect(rowNames(table)).toHaveLength(10);
    expect(screen.getByText("23개 상품")).toBeTruthy();
    const pager = screen.getByRole("navigation", { name: "내 상품 페이지" });
    expect(within(pager).getAllByRole("button").map((button) => button.textContent || button.getAttribute("aria-label"))).toEqual(["이전 페이지", "1", "2", "3", "다음 페이지"]);
    expect(pager.parentElement?.textContent).toContain("1–10개");

    fireEvent.click(within(pager).getByRole("button", { name: "2" }));
    expect(rowNames(table)[0]).toBe("테스트 상품 11");
    fireEvent.click(within(pager).getByRole("button", { name: "다음 페이지" }));
    expect(rowNames(table)).toEqual(["테스트 상품 21", "테스트 상품 22", "테스트 상품 23"]);
    expect(within(pager).getByRole("button", { name: "다음 페이지" })).toHaveProperty("disabled", true);

    // 페이지당 개수 5개 → 1쪽부터 5개, 이 브라우저에 기억
    fireEvent.change(screen.getByRole("spinbutton", { name: "페이지당 상품 수" }), { target: { value: "5" } });
    expect(rowNames(table)).toEqual(["테스트 상품 01", "테스트 상품 02", "테스트 상품 03", "테스트 상품 04", "테스트 상품 05"]);
    expect(window.localStorage.getItem("doogo-page-size:supplier-products")).toBe("5");

    // 검색하면 1쪽부터
    fireEvent.click(within(screen.getByRole("navigation", { name: "내 상품 페이지" })).getByRole("button", { name: "3" }));
    fireEvent.change(screen.getByRole("textbox", { name: "상품명·상품코드 검색" }), { target: { value: "테스트 상품 2" } });
    expect(rowNames(table)).toEqual(["테스트 상품 20", "테스트 상품 21", "테스트 상품 22", "테스트 상품 23"]);
  });
});

describe("변경 요청 내역 쪽 나누기", () => {
  it("기본 10줄씩, 2쪽으로 넘기고 탭을 바꾸면 1쪽부터", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path === "/supplier/requests") return json({ requests: Array.from({ length: 12 }, (_, index) => request(index + 1)) });
      if (path === "/supplier/categories") return json({ categories: [] });
      return notFound();
    });
    render(<MemoryRouter><SupplierRequests reloadKey={0} onChanged={vi.fn()} /></MemoryRouter>);
    const table = (await screen.findByText("요청 상품 01")).closest("table") as HTMLElement;
    expect(rowNames(table)).toHaveLength(10);
    expect(screen.getByRole("spinbutton", { name: "페이지당 요청 수" })).toHaveProperty("value", "10");
    const pager = screen.getByRole("navigation", { name: "변경 요청 내역 페이지" });
    fireEvent.click(within(pager).getByRole("button", { name: "2" }));
    expect(rowNames(table)).toEqual(["요청 상품 11", "요청 상품 12"]);
    fireEvent.click(screen.getByRole("tab", { name: /승인 대기/ }));
    expect(rowNames(table)).toEqual(["요청 상품 01", "요청 상품 03", "요청 상품 05", "요청 상품 07", "요청 상품 09", "요청 상품 11"]);
  });
});

describe("판매·정산 화면", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-26T03:00:00.000Z"));
  });

  it("정산 칸은 달력 옆이 아니라 아래 전체 너비에 두고, 판매 없는 주는 한 칸에 모아 보여 줍니다", async () => {
    const week = (start: string, end: string, payout: string, amount: number) => ({
      cycle: "weekly", start, end, payoutStart: payout, payoutEnd: payout, netAmount: amount, goodsAmount: amount, shippingFee: 0,
      commission: Math.round(amount / 10), payoutAmount: amount, netIncome: amount - Math.round(amount / 10), state: null
    });
    const totals = { saleAmount: 500000, saleQuantity: 20, returnAmount: 0, returnQuantity: 0, orderCount: 18, netAmount: 500000, goodsAmount: 500000, shippingFee: 0, commission: 50000, payoutAmount: 500000, netIncome: 450000 };
    apiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/supplier/sales")) {
        return json({
          month: "2026-11", today: "2026-11-26", hasAnySales: true, totals,
          settings: { type: "commission", commissionRate: 10, cycle: "weekly" },
          days: [{ date: "2026-11-10", saleAmount: 500000, saleQuantity: 20, returnAmount: 0, returnQuantity: 0, orderCount: 18, netAmount: 500000 }],
          ranking: [],
          settlements: [
            week("2026-10-26", "2026-11-01", "2026-11-02", 0),
            week("2026-11-02", "2026-11-08", "2026-11-09", 0),
            week("2026-11-09", "2026-11-15", "2026-11-16", 500000),
            week("2026-11-16", "2026-11-22", "2026-11-23", 0),
            week("2026-11-23", "2026-11-29", "2026-11-30", 0)
          ],
          payoutDays: [],
          fees: []
        });
      }
      return notFound();
    });
    render(<MemoryRouter><SupplierSales /></MemoryRouter>);
    const settleCard = (await screen.findByRole("heading", { name: "2026년 11월 판매분 정산" })).closest("section") as HTMLElement;
    expect(settleCard.closest(".sup-sales-aside")).toBeNull();
    // 판매가 있는 주는 금액 칸, 없는 주 4개는 "판매가 없는 기간" 한 칸에
    expect(within(settleCard).getByText("11월 16일(월) 입금")).toBeTruthy();
    const empty = within(settleCard).getByText("판매가 없는 기간").closest("article") as HTMLElement;
    expect(within(empty).getAllByRole("listitem")).toHaveLength(4);
    expect(settleCard.querySelectorAll(".sup-settle-list > article")).toHaveLength(2);
  });
});

describe("공급사 화면으로 돌아가기", () => {
  it("공급사 센터에서 사용방법으로 가면 그 탭의 공개 화면 맨 위에 돌아가기 줄이 생기고, 그냥 들어온 방문자에게는 없습니다", async () => {
    // 공개 화면 틀이 직접 부르는 주소(공지 등)는 모두 실패로 돌려줍니다.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 503, headers: { "Content-Type": "application/json" } })));
    const { PageFrame } = await import("@/pages/catalog/PublicCatalog");
    apiFetch.mockImplementation(async () => notFound());
    render(<MemoryRouter><PageFrame><div>공개 화면</div></PageFrame></MemoryRouter>);
    expect(screen.queryByRole("link", { name: "공급사 화면으로 돌아가기" })).toBeNull();
    cleanup();

    const profile = {
      supplier: { id: "s1", name: "봄날농원", representative: "김봄", phone: null, email: null, address: null, businessNumber: null },
      account: { id: "a1", username: "spring", isActive: true, commissionRate: 10, settlementCycle: "monthly", lastLoginAt: null, createdAt: "2026-11-20T00:00:00.000Z" },
      settlement: { type: "commission", commissionRate: 10, cycle: "monthly" }
    };
    apiFetch.mockImplementation(async (path: string) => {
      if (path === "/supplier/me") return json(profile);
      if (path === "/supplier/requests") return json({ requests: [] });
      return notFound();
    });
    render(
      <MemoryRouter initialEntries={["/supplier/account"]}>
        <Routes>
          <Route path="/supplier/:section" element={<SupplierCenterRoute />} />
          <Route path="/how-to/supplier" element={<PageFrame><div>공급사 사용방법 화면</div></PageFrame>} />
        </Routes>
      </MemoryRouter>
    );
    const menu = await screen.findByRole("complementary", { name: "공급사 센터 메뉴" });
    await act(async () => {
      fireEvent.click(within(menu).getByRole("link", { name: /공급사 사용방법/ }));
    });
    expect(await screen.findByText("공급사 사용방법 화면")).toBeTruthy();
    expect(readSupplierReturn()).toBe("/supplier/account");
    const back = screen.getByRole("link", { name: "공급사 화면으로 돌아가기" });
    expect(back.getAttribute("href")).toBe("/supplier/account");
    await act(async () => {
      fireEvent.click(back);
    });
    await waitFor(() => expect(screen.getByText("DOOGO FOOD 공급사 센터")).toBeTruthy());
  });

  it("이상한 주소는 기록하지 않고 공급사 대시보드로 돌아갑니다", () => {
    rememberSupplierReturn("https://example.com/");
    expect(readSupplierReturn()).toBe("/supplier/home");
    render(<MemoryRouter><SupplierReturnBar /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "공급사 화면으로 돌아가기" }).getAttribute("href")).toBe("/supplier/home");
  });
});
