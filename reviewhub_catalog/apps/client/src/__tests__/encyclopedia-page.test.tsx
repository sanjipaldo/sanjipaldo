// 백과사전 화면: 두고푸드 공급가(단가표 카드) · 소싱 요청 안내 · 문의 메시지 복사 · 내 후보 · 체크리스트 · 달/검색 목록,
// 메인 홈 미리보기와 "단가표에서 보기"(/?q=) 연결.
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const categories = [
  { id: "c-farm", name: "🥕 농산", shippingType: "domestic", sortOrder: 1, isActive: true },
  { id: "c-health", name: "💊 건강식품", shippingType: "domestic", sortOrder: 2, isActive: true }
];

function product(id: string, name: string, categoryId: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    productCode: null,
    name,
    imageUrl: null,
    origin: "경북 청송",
    aPrice: 21000,
    generalPrice: 23500,
    salePrice: null,
    salePriceMode: "autonomous",
    saleStartMonth: null,
    saleEndMonth: null,
    isAlwaysOnSale: true,
    shippingFee: "무료",
    releaseInfo: null,
    notes: null,
    optionsInfo: null,
    packaging: null,
    courier: null,
    shippingType: "domestic",
    categoryId,
    isVisible: true,
    isSoldOut: false,
    createdAt: "2026-11-01 00:00:00",
    updatedAt: "2026-11-01 00:00:00",
    options: [],
    ...extra
  };
}

const catalog = {
  categories,
  products: [
    product("p1", "[본] 청송 부사 사과 특품 5kg", "c-farm"),
    product("p2", "부사 사과 콜라겐 젤리 30포", "c-health"),
    product("p3", "[본] 노지감귤 로얄과 3kg", "c-farm", { aPrice: 9900, generalPrice: 11000 })
  ],
  priceHistory: [],
  recentSoldOutIssues: [],
  shippingPolicies: [],
  notices: [],
  settings: {}
};

function json(data: unknown) {
  return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.resetModules();
  window.localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (/\/catalog(\/initial)?(\?|$)/.test(url)) return json(catalog);
    return new Response(JSON.stringify({ ok: false }), { status: 503, headers: { "Content-Type": "application/json" } });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

async function renderEncyclopedia(path: string) {
  const { EncyclopediaDetailPage, EncyclopediaPage } = await import("@/pages/catalog/Encyclopedia");
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/encyclopedia" element={<EncyclopediaPage />} />
        <Route path="/encyclopedia/:id" element={<EncyclopediaDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("백과사전 상세", () => {
  it("두고푸드에 있는 품목은 단가표 카드로 A단가·일반공급가를 보여 주고, 신선 카테고리 상품만 잇습니다", async () => {
    await renderEncyclopedia("/encyclopedia/apple-fuji");
    expect(screen.getByRole("heading", { level: 1, name: "사과(부사)" })).toBeTruthy();
    expect(await screen.findByText("[본] 청송 부사 사과 특품 5kg")).toBeTruthy();
    expect(screen.getAllByText("21,000원").length).toBeGreaterThan(0);
    expect(screen.getAllByText("23,500원").length).toBeGreaterThan(0);
    expect(screen.queryByText("부사 사과 콜라겐 젤리 30포")).toBeNull();
    expect(screen.getByRole("link", { name: /단가표에서 보기/ }).getAttribute("href")).toBe(`/?q=${encodeURIComponent("부사")}`);
    expect(screen.getByText("산지 연락 시기").nextElementSibling?.textContent).toBe("9월");
  });

  it("두고푸드에 없는 품목은 소싱 요청으로 안내합니다", async () => {
    await renderEncyclopedia("/encyclopedia/fig");
    const request = await screen.findByRole("link", { name: /소싱 요청하기/ });
    expect(request.getAttribute("href")).toBe("/sourcing");
    expect(screen.getByText(/무화과은\(는\) 아직 두고푸드 단가표에 없는 품목이에요/)).toBeTruthy();
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
    expect(JSON.parse(window.localStorage.getItem("doogo:encyclopedia:check:fig") ?? "[]")[0]).toBe(true);
  });

  it("없는 품목 주소는 안내를 보여 줍니다", async () => {
    await renderEncyclopedia("/encyclopedia/no-such-item");
    expect(screen.getByText("찾는 품목이 없어요.")).toBeTruthy();
  });
});

const cardNames = () => Array.from(document.querySelectorAll(".produce-card-body strong")).map((element) => element.textContent ?? "");

describe("백과사전 목록", () => {
  it("고른 달(?month=7)의 성수기 품목을 보여 주고, 검색하면 모든 달에서 찾습니다", async () => {
    await renderEncyclopedia("/encyclopedia?month=7&cat=과일");
    expect(screen.getByRole("heading", { level: 2, name: /7월 성수기/ })).toBeTruthy();
    expect(cardNames()).toContain("복숭아");
    expect(cardNames()).not.toContain("감귤");

    fireEvent.change(screen.getByRole("searchbox", { name: "백과사전 품목 검색" }), { target: { value: "고구마" } });
    expect(await screen.findByRole("heading", { level: 2, name: /검색 결과/ })).toBeTruthy();
    // 분류(과일)가 골라져 있어 채소인 고구마는 없고, 전체로 바꾸면 3개가 나옵니다.
    fireEvent.click(screen.getByRole("button", { name: /^전체/ }));
    await waitFor(() => expect(cardNames().filter((name) => name.includes("고구마"))).toHaveLength(3));
  });

  it("두고푸드에 있는 품목 카드에 공급 상품 수를 보여 줍니다", async () => {
    await renderEncyclopedia("/encyclopedia?month=11");
    const fujiCard = await screen.findByRole("link", { name: /사과\(부사\)/ });
    await waitFor(() => expect(fujiCard.textContent).toContain("두고푸드 공급 1개"));
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
