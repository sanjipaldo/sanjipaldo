// 건강식품 백과사전(자료·상품 연결·화면) + 백과사전 전환(농축수산 | 건강식품) + 단가표 마진율 칸.
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  HEALTH_GROUPS,
  concernsOfIngredient,
  findHealthConcern,
  findHealthIngredient,
  groupProductsByIngredient,
  healthConcerns,
  healthIngredients,
  matchesHealthIngredient,
  searchHealth
} from "@/lib/health-encyclopedia";
import { formatMarginRate, saleMargin } from "@/lib/sale-margin";
import { BODY_VIEWBOX, HEALTH_BODY_PARTS } from "@/lib/health-body-map";

const categories = [
  { id: "c-farm", name: "🥕 농산", shippingType: "domestic", sortOrder: 1, isActive: true },
  { id: "c-health", name: "💊 건강식품", shippingType: "domestic", sortOrder: 2, isActive: true },
  { id: "c-overseas", name: "✈️ 해외 건강식품", shippingType: "overseas", sortOrder: 3, isActive: true }
];

function product(id: string, name: string, categoryId: string, extra: Record<string, unknown> = {}) {
  return {
    id, productCode: null, name, imageUrl: null, origin: null, aPrice: 13000, generalPrice: 15000, salePrice: null,
    salePriceMode: "autonomous", saleStartMonth: null, saleEndMonth: null, isAlwaysOnSale: true, shippingFee: "무료",
    releaseInfo: null, notes: "예전 상품 안내 문구", optionsInfo: null, packaging: null, courier: null, shippingType: "overseas", categoryId,
    isVisible: true, isSoldOut: false, createdAt: "2026-11-01 00:00:00", updatedAt: "2026-11-01 00:00:00", options: [], ...extra
  };
}

const catalog = {
  categories,
  products: [
    product("h1", "모레나 프리미엄 루테인 플러스 30캡슐", "c-overseas", { aPrice: 13000, generalPrice: 15000, salePrice: 20000, salePriceMode: "fixed" }),
    product("h2", "뉴와이즈 아이즈 빌베리 50000 루테인 20mg 90캡슐", "c-overseas"),
    product("h3", "하이웰 마누카허니 UMF10+ 250g MGO261", "c-overseas", { aPrice: 30000, generalPrice: 30000, salePrice: 45000, salePriceMode: "fixed" }),
    product("h4", "피터앤존 프로폴리스 치약 100g", "c-overseas"),
    product("h5", "[본] 여주 호박고구마 한입 3kg", "c-farm", { shippingType: "domestic" })
  ],
  priceHistory: [], recentSoldOutIssues: [], shippingPolicies: [], notices: [], settings: {}
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify({ ok: true, data }), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.resetModules();
  window.localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (/\/catalog(\/initial)?(\?|$)/.test(url)) return json(catalog);
    if (url.includes("/catalog/produce-search")) return json({ updatedAt: null, keywords: {} });
    return new Response(JSON.stringify({ ok: false }), { status: 503, headers: { "Content-Type": "application/json" } });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

async function renderHealth(path: string) {
  const pages = await import("@/pages/catalog/HealthEncyclopedia");
  const produce = await import("@/pages/catalog/Encyclopedia");
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/encyclopedia" element={<produce.EncyclopediaHomePage />} />
        <Route path="/encyclopedia/health" element={<pages.HealthHomePage />} />
        <Route path="/encyclopedia/health/ingredients" element={<pages.HealthIngredientsPage />} />
        <Route path="/encyclopedia/health/guide" element={<pages.HealthGuidePage />} />
        <Route path="/encyclopedia/health/concern/:id" element={<pages.HealthConcernPage />} />
        <Route path="/encyclopedia/health/ingredient/:id" element={<pages.HealthIngredientPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("건강식품 백과사전 자료", () => {
  it("모든 원료·고민: 고유 id · 바른 참조 · 종류별 문구 규칙", () => {
    const ingredientIds = new Set(healthIngredients.map((item) => item.id));
    expect(ingredientIds.size).toBe(healthIngredients.length);
    expect(new Set(healthConcerns.map((item) => item.id)).size).toBe(healthConcerns.length);
    expect(healthIngredients.length).toBeGreaterThanOrEqual(70);
    expect(healthConcerns.length).toBeGreaterThanOrEqual(20);
    for (const concern of healthConcerns) {
      for (const id of [...concern.ingredients, ...(concern.foods ?? [])]) expect(ingredientIds.has(id), `${concern.id} → ${id}`).toBe(true);
      for (const id of concern.related) expect(findHealthConcern(id), `${concern.id} related ${id}`).toBeTruthy();
      expect(HEALTH_GROUPS.some((group) => group.id === concern.group)).toBe(true);
      expect(concern.ok.length).toBeGreaterThan(0);
      expect(concern.ng.length).toBeGreaterThan(0);
      // 팔기 좋은 원료에는 일반식품을 넣지 않습니다(일반식품은 "함께 찾는 상품"으로만).
      for (const item of concern.ingredients.map((id) => findHealthIngredient(id)!)) expect(item.type).not.toBe("food");
    }
    for (const item of healthIngredients) {
      if (item.type === "functional" || item.type === "nutrient") expect(item.claims.length, item.id).toBeGreaterThan(0);
      if (item.type === "food") {
        expect(item.claims, item.id).toEqual([]);
        expect(item.ok?.length && item.ng?.length, item.id).toBeTruthy();
      }
      expect(concernsOfIngredient(item.id).length, `${item.id}는 어떤 고민에도 없음`).toBeGreaterThan(0);
    }
  });

  it("인정 문구 예: 루테인 황반색소밀도, 프로폴리스는 면역이 아니라 항산화·구강 항균", () => {
    expect(findHealthIngredient("lutein")!.claims[0]).toContain("황반색소밀도");
    const propolis = findHealthIngredient("propolis")!;
    expect(propolis.claims.join(" ")).toContain("구강에서의 항균작용");
    expect(propolis.claims.join(" ")).not.toContain("면역");
    expect(findHealthIngredient("vitamin-c")!.claims.join(" ")).not.toContain("면역");
    expect(findHealthIngredient("zinc")!.claims).toContain("정상적인 면역기능에 필요");
  });

  it("두고푸드 상품 연결: 건강식품 카테고리만, 화장품·생활용품·반려동물은 빼고, 비슷한 이름은 구분", () => {
    const lutein = findHealthIngredient("lutein")!;
    const omega3 = findHealthIngredient("omega3")!;
    const probiotics = findHealthIngredient("probiotics")!;
    const colostrum = findHealthIngredient("colostrum")!;
    const iron = findHealthIngredient("iron")!;
    const propolis = findHealthIngredient("propolis")!;
    const greenMussel = findHealthIngredient("green-mussel")!;
    expect(matchesHealthIngredient(lutein, "광동365 루테인 30캡슐")).toBe(true);
    expect(matchesHealthIngredient(omega3, "피터앤존 오메가 데일리 rTG 200캡슐")).toBe(true);
    expect(matchesHealthIngredient(omega3, "오로니아 오메가 구미 (2.3g*60구미)")).toBe(true);
    expect(matchesHealthIngredient(omega3, "오메가 엔자임효소 30포")).toBe(false);
    expect(matchesHealthIngredient(probiotics, "모레나 고트스트럼 락토페린 300정")).toBe(false);
    expect(matchesHealthIngredient(colostrum, "모레나 고트스트럼 락토페린 300정")).toBe(true);
    expect(matchesHealthIngredient(iron, "오스틴제약)캐비어철갑상어진액VIP")).toBe(false);
    expect(matchesHealthIngredient(propolis, "피터앤존 프로폴리스 치약 100g")).toBe(false);
    expect(matchesHealthIngredient(greenMussel, "하이웰 초록입홍합 오일 히트크림 200g")).toBe(false);
    expect(matchesHealthIngredient(greenMussel, "하이웰 액티브원 강아지 관절케어 120캡슐")).toBe(false);

    const grouped = groupProductsByIngredient(catalog.products, new Map(categories.map((category) => [category.id, category.name])));
    expect(grouped.get("lutein")?.map((item) => item.id)).toEqual(["h1", "h2"]);
    expect(grouped.get("bilberry")?.map((item) => item.id)).toEqual(["h2"]);
    expect(grouped.get("propolis")).toBeUndefined();
    // 농산 카테고리의 "여주 호박고구마"는 여주(일반식품)에 잇지 않습니다.
    expect(grouped.get("berberine")).toBeUndefined();
  });

  it("검색: 고민·원료 이름과 검색어로 찾습니다", () => {
    expect(searchHealth("관절").concerns.map((item) => item.id)).toContain("joint");
    expect(searchHealth("루테인").ingredients.map((item) => item.id)).toContain("lutein");
    expect(searchHealth("  ").concerns).toHaveLength(0);
  });
});

describe("단가표 마진율", () => {
  it("(판매가 − A단가) ÷ 판매가, 소수점 한 자리 · 계산할 수 없으면 null", () => {
    expect(saleMargin(71500, 110000)).toEqual({ rate: 35, amount: 38500 });
    expect(formatMarginRate(saleMargin(27000, 49000)!.rate)).toBe("44.9%");
    expect(formatMarginRate(saleMargin(10000, 10000)!.rate)).toBe("0.0%");
    expect(saleMargin(12000, 10000)).toEqual({ rate: -20, amount: -2000 });
    expect(saleMargin(13000, null)).toBeNull();
    expect(saleMargin(0, 20000)).toBeNull();
  });

  it("단가표 표에서 상품 안내 칸 대신 마진율(지정 판매가) · 판매가 자율 안내를 보여 줍니다", async () => {
    const { CatalogProductTable } = await import("@/pages/catalog/PublicCatalog");
    render(
      <MemoryRouter>
        <CatalogProductTable products={catalog.products.slice(0, 2) as never} categories={categories as never} policyById={new Map()} currentMonth={11} onImage={() => undefined} onShipping={() => undefined} />
      </MemoryRouter>
    );
    expect(screen.getByRole("columnheader", { name: "마진율" })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "상품 안내" })).toBeNull();
    expect(screen.queryByText("예전 상품 안내 문구")).toBeNull();
    const cells = Array.from(document.querySelectorAll(".catalog-margin-cell")).map((cell) => cell.textContent);
    // 칸 맨 끝은 마진계산기를 여는 "계산" 버튼(2026-11-14)
    expect(cells[0]).toBe("35.0%개당 7,000원 계산");
    expect(cells[1]).toBe("-판매가 자율 계산");
  });
});

describe("백과사전 화면", () => {
  it("맨 위 전환: 농축수산 백과사전과 건강식품 백과사전을 오갑니다", async () => {
    await renderHealth("/encyclopedia");
    const kind = screen.getByRole("navigation", { name: "백과사전 종류" });
    expect(within(kind).getByRole("link", { name: /농축수산 백과사전/ }).getAttribute("aria-current")).toBe("true");
    expect(within(kind).getByRole("link", { name: /건강식품 백과사전/ }).getAttribute("href")).toBe("/encyclopedia/health");
  });

  it("고민별 찾기: 고민 카드 · 분류 · 검색", async () => {
    await renderHealth("/encyclopedia/health");
    const kind = screen.getByRole("navigation", { name: "백과사전 종류" });
    expect(within(kind).getByRole("link", { name: /건강식품 백과사전/ }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("heading", { level: 1, name: "어떤 고민을 가진 고객에게 팔까요?" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /눈 건강/ }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /체중 관리/ }));
    const grid = document.querySelector(".hl-concerns .hl-concern-grid") as HTMLElement;
    expect(within(grid).getAllByRole("link")).toHaveLength(healthConcerns.filter((item) => item.group === "weight").length);
    fireEvent.change(screen.getByRole("textbox", { name: "고민·원료 검색" }), { target: { value: "루테인" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(await screen.findByRole("heading", { name: "'루테인' 검색 결과" })).toBeTruthy();
  });

  it("고민 상세: 팔기 좋은 원료 · 써도 되는/안 되는 문구 · 두고푸드 상품(마진율)", async () => {
    await renderHealth("/encyclopedia/health/concern/eye");
    expect(screen.getByRole("heading", { level: 1, name: "눈 건강" })).toBeTruthy();
    const ranks = Array.from(document.querySelectorAll(".hl-rank-title strong")).map((element) => element.textContent);
    expect(ranks[0]).toBe("루테인");
    expect(screen.getByText("시력 회복·시력이 좋아짐")).toBeTruthy();
    expect(await screen.findByText("35.0%")).toBeTruthy();
    expect(screen.getByRole("link", { name: /상품 구매하기/ }).getAttribute("href")).toBe("https://shop.baljuora.com/doogofood");
    expect(screen.getByRole("link", { name: /단가표에서 보기/ }).getAttribute("href")).toBe(`/?q=${encodeURIComponent("루테인")}`);
  });

  it("원료 상세: 기능성 원료는 인정 문구, 일반식품은 효능 표현 불가 안내", async () => {
    await renderHealth("/encyclopedia/health/ingredient/lutein");
    expect(screen.getByRole("heading", { level: 1, name: "루테인" })).toBeTruthy();
    expect(screen.getByText(/황반색소밀도를 유지하여 눈 건강에 도움을 줄 수 있음/)).toBeTruthy();
    expect(await screen.findByText(/두고푸드 보유 2개/)).toBeTruthy();
    document.body.innerHTML = "";
    await renderHealth("/encyclopedia/health/ingredient/manuka");
    expect(screen.getByRole("heading", { name: "일반식품이라 효능을 말할 수 없어요" })).toBeTruthy();
    expect(screen.getByText("항균 작용·위 건강 개선")).toBeTruthy();
  });

  it("원료 사전: 종류로 거르기 · 판매 전 체크 6가지", async () => {
    await renderHealth("/encyclopedia/health/ingredients?type=food");
    const names = Array.from(document.querySelectorAll(".hl-ing-row-title strong")).map((element) => element.textContent);
    expect(names).toContain("마누카꿀");
    expect(names).not.toContain("루테인");
    document.body.innerHTML = "";
    await renderHealth("/encyclopedia/health/guide");
    expect(document.querySelectorAll(".hl-guide-card")).toHaveLength(6);
    expect(screen.getByText("복용하세요")).toBeTruthy();
  });
});

describe("몸에서 고민 찾기", () => {
  it("21개 고민이 모두 한 곳 이상 · 점은 그림 안 · 같은 쪽 이름표는 겹치지 않게", () => {
    const covered = new Set(HEALTH_BODY_PARTS.flatMap((part) => part.concerns));
    for (const concern of healthConcerns) expect(covered.has(concern.id), concern.id).toBe(true);
    for (const part of HEALTH_BODY_PARTS) for (const id of part.concerns) expect(findHealthConcern(id), `${part.id}:${id}`).toBeTruthy();
    for (const part of HEALTH_BODY_PARTS) {
      if (!part.dot) continue;
      expect(part.dot.x).toBeGreaterThan(0);
      expect(part.dot.x).toBeLessThan(BODY_VIEWBOX.width);
      expect(part.dot.y).toBeGreaterThan(0);
      expect(part.dot.y).toBeLessThan(BODY_VIEWBOX.height);
    }
    for (const side of ["left", "right"] as const) {
      const ys = HEALTH_BODY_PARTS.flatMap((part) => (part.label?.side === side ? [part.label.y] : [])).sort((a, b) => a - b);
      for (let index = 1; index < ys.length; index += 1) expect(ys[index] - ys[index - 1]).toBeGreaterThanOrEqual(56);
    }
  });

  it("이름표를 누르면 그 부위 고민 카드 · 주소 ?part= 로 바로 열기 · 전신 버튼", async () => {
    await renderHealth("/encyclopedia/health");
    const map = screen.getByRole("group", { name: "몸에서 고민 고르기" });
    expect(within(map).getByRole("button", { name: "눈" }).getAttribute("aria-pressed")).toBe("true");
    const detail = document.querySelector(".hl-body-detail") as HTMLElement;
    expect(within(detail).getByRole("heading", { name: "눈" })).toBeTruthy();
    fireEvent.click(within(map).getByRole("button", { name: "심장·혈관" }));
    expect(within(detail).getByRole("heading", { name: "심장·혈관" })).toBeTruthy();
    expect(within(detail).getAllByRole("link")).toHaveLength(3);
    document.body.innerHTML = "";
    await renderHealth("/encyclopedia/health?part=whole");
    expect(screen.getByRole("button", { name: /전신/ }).getAttribute("aria-pressed")).toBe("true");
    expect(within(document.querySelector(".hl-body-detail") as HTMLElement).getByRole("heading", { name: "전신" })).toBeTruthy();
    // 검색 중에는 그림 대신 검색 결과
    document.body.innerHTML = "";
    await renderHealth("/encyclopedia/health?q=루테인");
    expect(screen.queryByRole("group", { name: "몸에서 고민 고르기" })).toBeNull();
  });
});
