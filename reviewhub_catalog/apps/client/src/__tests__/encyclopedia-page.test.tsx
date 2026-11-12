// 백과사전 화면: 상세(두고푸드 공급가 카드 · 상품 구매하기 · 보유/미보유 · 네이버 검색량) · 시즌 캘린더 · 홈 · 첫 상품 찾기 ·
// 내 후보(기기 옮기기 코드) · 메인 홈 미리보기와 "단가표에서 보기"(/?q=) 연결.
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const categories = [
  { id: "c-farm", name: "🥕 농산", shippingType: "domestic", sortOrder: 1, isActive: true },
  { id: "c-health", name: "💊 건강식품", shippingType: "domestic", sortOrder: 2, isActive: true }
];

function product(id: string, name: string, categoryId: string, extra: Record<string, unknown> = {}) {
  return {
    id, productCode: null, name, imageUrl: null, origin: "경북 청송", aPrice: 21000, generalPrice: 23500, salePrice: null,
    salePriceMode: "autonomous", saleStartMonth: null, saleEndMonth: null, isAlwaysOnSale: true, shippingFee: "무료",
    releaseInfo: null, notes: null, optionsInfo: null, packaging: null, courier: null, shippingType: "domestic", categoryId,
    isVisible: true, isSoldOut: false, createdAt: "2026-11-01 00:00:00", updatedAt: "2026-11-01 00:00:00", options: [], ...extra
  };
}

const catalog = {
  categories,
  products: [
    product("p1", "[본] 청송 부사 사과 특품 5kg", "c-farm"),
    product("p2", "부사 사과 콜라겐 젤리 30포", "c-health"),
    product("p3", "[본] 노지감귤 로얄과 3kg", "c-farm", { aPrice: 9900, generalPrice: 11000 })
  ],
  priceHistory: [], recentSoldOutIssues: [], shippingPolicies: [], notices: [], settings: {}
};

const searchStats = {
  updatedAt: "2026-11-12T01:00:00.000Z",
  keywords: {
    부사사과: { keyword: "부사사과", pc: 2100, mobile: 9900, total: 12000, comp: "높음", months: [9000, 7000, 5000, 4000, 3000, 2500, 2500, 3000, 5000, 9000, 12000, 15000], related: [["청송부사사과", 1500]], updatedAt: "2026-11-12T01:00:00.000Z" }
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify({ ok: true, data }), { status, headers: { "Content-Type": "application/json" } });
}

let syncRequests: Array<{ method: string; url: string; body?: unknown }> = [];

beforeEach(() => {
  vi.resetModules();
  window.localStorage.clear();
  syncRequests = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (/\/catalog(\/initial)?(\?|$)/.test(url)) return json(catalog);
    if (url.includes("/catalog/produce-search")) return json(searchStats);
    if (url.includes("/catalog/encyclopedia/sync")) {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      syncRequests.push({ method, url, body });
      if (method === "POST") return json({ code: "ABC234", ...body, updatedAt: "2026-11-12T02:00:00.000Z" }, 201);
      if (method === "PUT") return json({ code: url.split("/").pop(), ...body, updatedAt: "2026-11-12T03:00:00.000Z" });
      if (url.endsWith("/XYZ789")) return json({ code: "XYZ789", favorites: ["kiwi", "mandarin"], checks: {}, updatedAt: "2026-11-12T04:00:00.000Z" });
      return new Response(JSON.stringify({ ok: false, error: { message: "그 코드로 저장된 후보가 없어요." } }), { status: 404, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: false }), { status: 503, headers: { "Content-Type": "application/json" } });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

let lastLocation = "";
function LocationProbe() {
  const location = useLocation();
  lastLocation = `${location.pathname}${location.search}`;
  return null;
}

async function renderEncyclopedia(path: string) {
  const pages = await import("@/pages/catalog/Encyclopedia");
  const { EncyclopediaFinderPage } = await import("@/pages/catalog/EncyclopediaFinder");
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/encyclopedia" element={<pages.EncyclopediaHomePage />} />
        <Route path="/encyclopedia/calendar" element={<><pages.EncyclopediaCalendarPage /><LocationProbe /></>} />
        <Route path="/encyclopedia/finder" element={<EncyclopediaFinderPage />} />
        <Route path="/encyclopedia/favorites" element={<pages.EncyclopediaFavoritesPage />} />
        <Route path="/encyclopedia/:id" element={<pages.EncyclopediaDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const rowNames = () => Array.from(document.querySelectorAll(".enc-calendar-main strong")).map((element) => element.textContent ?? "");

describe("백과사전 상세", () => {
  it("두고푸드에 있는 품목: 단가표 카드(A단가·일반공급가) · 보유 표시 · 상품 구매하기(도매몰) · 네이버 검색량", async () => {
    await renderEncyclopedia("/encyclopedia/apple-fuji");
    expect(screen.getByRole("heading", { level: 1, name: "사과(부사)" })).toBeTruthy();
    expect(await screen.findByText("[본] 청송 부사 사과 특품 5kg")).toBeTruthy();
    expect(screen.getAllByText("21,000원").length).toBeGreaterThan(0);
    expect(screen.getAllByText("23,500원").length).toBeGreaterThan(0);
    expect(screen.queryByText("부사 사과 콜라겐 젤리 30포")).toBeNull();
    expect(screen.getByRole("link", { name: /단가표에서 보기/ }).getAttribute("href")).toBe(`/?q=${encodeURIComponent("부사")}`);
    const buy = screen.getByRole("link", { name: /상품 구매하기/ });
    expect(buy.getAttribute("href")).toBe("https://shop.baljuora.com/doogofood");
    expect(buy.getAttribute("target")).toBe("_blank");
    expect(screen.getAllByText("두고푸드 보유 1개").length).toBeGreaterThan(0);
    expect(screen.getByText("산지 연락 시기").nextElementSibling?.textContent).toBe("9월");
    expect(screen.getByText("재배·형태").nextElementSibling?.textContent).toBe("노지·저장");
    // 네이버 검색량(관리자가 모아 둔 값)
    expect(await screen.findByText("12,000")).toBeTruthy();
    expect(screen.getByText("12월")).toBeTruthy();
    expect(screen.getByText(/청송부사사과/)).toBeTruthy();
  });

  it("두고푸드에 없는 품목은 미보유로 보이고 소싱 요청으로 안내합니다", async () => {
    await renderEncyclopedia("/encyclopedia/fig");
    const request = await screen.findByRole("link", { name: /소싱 요청하기/ });
    expect(request.getAttribute("href")).toBe("/sourcing");
    expect(screen.getAllByText("두고푸드 미보유").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /상품 구매하기/ })).toBeNull();
  });

  it("문의 메시지 복사 · 내 후보 담기 · 체크리스트를 이 기기에 저장합니다", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText } });
    await renderEncyclopedia("/encyclopedia/fig");
    fireEvent.click(screen.getByRole("button", { name: /문의 메시지 복사하기/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(String((writeText.mock.calls[0] as unknown[])[0])).toContain("무화과 위탁판매");

    fireEvent.click(screen.getByRole("button", { name: /내 후보에 담기/ }));
    expect(screen.getByRole("button", { name: /내 후보에 담김/ })).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem("doogo:encyclopedia:favorites") ?? "[]")).toEqual(["fig"]);

    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(6);
    fireEvent.click(boxes[0]);
    expect(screen.getByText("1/6")).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem("doogo:encyclopedia:checks") ?? "{}").fig[0]).toBe(true);
    // 기기 옮기기 코드를 만들지 않았으면 서버로 보내지 않습니다.
    expect(syncRequests).toHaveLength(0);
  });

  it("없는 품목 주소는 안내를 보여 줍니다", async () => {
    await renderEncyclopedia("/encyclopedia/no-such-item");
    expect(screen.getByText("찾는 품목이 없어요.")).toBeTruthy();
  });
});

describe("시즌 캘린더", () => {
  it("고른 달·분류로 줄을 보여 주고, 조건·검색으로 좁힙니다", async () => {
    await renderEncyclopedia("/encyclopedia/calendar?month=7&cat=과일");
    expect(rowNames()).toContain("복숭아");
    expect(rowNames()).toContain("감귤");
    fireEvent.click(screen.getByRole("button", { name: /7월 판매중/ }));
    await waitFor(() => expect(rowNames()).not.toContain("감귤"));
    expect(rowNames()).toContain("복숭아");
    expect(lastLocation).toContain("selling=1");

    fireEvent.click(screen.getByRole("button", { name: /^전체/ }));
    fireEvent.change(screen.getByRole("searchbox", { name: "시즌 캘린더 품목 검색" }), { target: { value: "고구마" } });
    fireEvent.click(screen.getByRole("button", { name: /7월 판매중/ }));
    await waitFor(() => expect(rowNames().filter((name) => name.includes("고구마"))).toEqual(expect.arrayContaining(["꿀고구마(베니하루카)", "밤고구마", "호박고구마", "고구마말랭이"])));
  });

  it("두고푸드 보유만 켜면 보유 품목만 남고, 줄마다 보유 표시가 나옵니다", async () => {
    await renderEncyclopedia("/encyclopedia/calendar?month=11&doogo=1");
    await waitFor(() => expect(rowNames()).toEqual(expect.arrayContaining(["사과(부사)", "감귤"])));
    expect(rowNames()).toHaveLength(2);
    expect(screen.getAllByText(/두고푸드 보유 1개/).length).toBeGreaterThanOrEqual(2);
  });
});

describe("백과사전 홈", () => {
  it("이달 요약·시작 순서·분류 칸을 보여 주고, 예전 목록 주소는 시즌 캘린더로 보냅니다", async () => {
    await renderEncyclopedia("/encyclopedia?month=11");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("11월");
    expect(screen.getByRole("heading", { level: 2, name: "처음이라면 이 순서로 시작해 보세요" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /첫 상품 찾기 질문 4개/ }).getAttribute("href")).toBe("/encyclopedia/finder");
    expect(screen.getByText(/김장 본시즌/)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "분류별로 보기" })).toBeTruthy();
    document.body.innerHTML = "";
    await renderEncyclopedia("/encyclopedia?q=굴");
    expect(await screen.findByRole("heading", { level: 1, name: "시즌 캘린더" })).toBeTruthy();
  });
});

describe("첫 상품 찾기", () => {
  it("질문 4개에 답하면 품목 5개를 이유와 함께 추천하고, 한 번에 내 후보에 담습니다", async () => {
    await renderEncyclopedia("/encyclopedia/finder");
    fireEvent.click(screen.getByRole("radio", { name: /^11월/ }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("radio", { name: /상온 택배만/ }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("radio", { name: /처음이에요/ }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("radio", { name: /상관없어요/ }));
    fireEvent.click(screen.getByRole("button", { name: /추천 받기/ }));
    const list = await screen.findByRole("list", { name: "" }).catch(() => document.querySelector(".enc-finder-picks") as HTMLElement);
    const picks = within(list as HTMLElement).getAllByRole("listitem");
    expect(picks).toHaveLength(5);
    expect(screen.getAllByText("상온 배송").length).toBeGreaterThanOrEqual(5);
    // 두고푸드 보유 여부는 카드마다 배지 한 번만(이유 칩에 다시 쓰지 않음)
    await waitFor(() => picks.forEach((pick) => expect(within(pick).getAllByText(/두고푸드 (보유 \d+개|미보유)/)).toHaveLength(1)));
    fireEvent.click(screen.getByRole("button", { name: /모두 내 후보에 담기/ }));
    expect(JSON.parse(window.localStorage.getItem("doogo:encyclopedia:favorites") ?? "[]")).toHaveLength(5);
  });
});

describe("내 후보 · 기기 옮기기 코드", () => {
  it("코드를 만들면 지금 후보를 서버에 저장하고, 다른 기기 코드를 입력하면 그 후보를 불러옵니다", async () => {
    window.localStorage.setItem("doogo:encyclopedia:favorites", JSON.stringify(["apple-fuji"]));
    await renderEncyclopedia("/encyclopedia/favorites");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("1개");
    fireEvent.click(screen.getByRole("button", { name: /기기 옮기기 코드 만들기/ }));
    expect(await screen.findByText("ABC234")).toBeTruthy();
    expect(syncRequests[0]).toMatchObject({ method: "POST", body: { favorites: ["apple-fuji"], checks: {} } });
    expect(JSON.parse(window.localStorage.getItem("doogo:encyclopedia:sync") ?? "{}").code).toBe("ABC234");

    // 연결을 끊고 다른 코드로 불러오기
    fireEvent.click(screen.getByRole("button", { name: /연결 끊기/ }));
    Object.defineProperty(window, "confirm", { configurable: true, value: vi.fn(() => true) });
    fireEvent.change(screen.getByRole("textbox", { name: "기기 옮기기 코드 입력" }), { target: { value: "xyz 789" } });
    fireEvent.click(screen.getByRole("button", { name: "불러오기" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("2개"));
    expect(rowNames()).toEqual(["키위", "감귤"]);
    expect(syncRequests.some((request) => request.method === "GET" && request.url.endsWith("/XYZ789"))).toBe(true);
  });
});

describe("메인 홈", () => {
  it("이번 달 제철 백과사전 미리보기를 보여 주고, /?q=부사로 들어오면 단가표를 그 이름으로 찾습니다", async () => {
    const { CatalogHome } = await import("@/pages/catalog/PublicCatalog");
    render(
      <MemoryRouter initialEntries={[`/?q=${encodeURIComponent("부사")}`]}>
        <Routes><Route path="/" element={<CatalogHome />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByRole("heading", { level: 2, name: /제철 백과사전/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /백과사전 전체 보기/ }).getAttribute("href")).toBe("/encyclopedia");
    expect((screen.getByPlaceholderText("상품명, 원산지 검색") as HTMLInputElement).value).toBe("부사");
  });
});
