// 마진계산기(계산·목표 마진 역산·마켓 비교·계산표·이 기기 저장) + 오른쪽 아래 빠른 버튼 + 상단 메뉴 + 단가표 "계산" 버튼.
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  MARGIN_MARKETS,
  MARGIN_OPEN_EVENT,
  MARGIN_STORAGE_KEYS,
  type MarginRow,
  type MarginSheet,
  compareMarkets,
  computeMargin,
  loadDraft,
  loadSheetRows,
  parseMoneyText,
  parseRateText,
  salePriceForMargin,
  sheetSummary,
  sheetToCsv,
  upsertSave
} from "@/lib/margin-calculator";

const base = { salePrice: 29000, shippingIn: 3000, cost: 13000, shippingOut: 3500, extraCost: null, feeRate: 6.63, shipFeeRate: 3.63, vat: false };
const row = (id: string, name: string, extra: Partial<MarginRow> = {}): MarginRow => ({ ...base, id, name, marketId: "smartstore", quantity: 1, productId: null, ...extra });

const categories = [{ id: "c-overseas", name: "✈️ 해외 건강식품", shippingType: "overseas", sortOrder: 1, isActive: true }];
const fixedProduct = {
  id: "h1", productCode: "AA1", name: "모레나 프리미엄 루테인 플러스 30캡슐", imageUrl: null, origin: null, aPrice: 13000, generalPrice: 15000, salePrice: 20000,
  salePriceMode: "fixed", saleStartMonth: null, saleEndMonth: null, isAlwaysOnSale: true, shippingFee: "무료", releaseInfo: null, notes: null, optionsInfo: null,
  packaging: null, courier: null, shippingType: "overseas", categoryId: "c-overseas", isVisible: true, isSoldOut: false, createdAt: "2026-11-01 00:00:00", updatedAt: "2026-11-01 00:00:00", options: []
};
const catalog = { categories, products: [fixedProduct], priceHistory: [], recentSoldOutIssues: [], shippingPolicies: [], notices: [], settings: {} };

beforeEach(() => {
  vi.resetModules();
  window.localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (/\/catalog(\/initial)?(\?|$)/.test(url)) return new Response(JSON.stringify({ ok: true, data: catalog }), { status: 200, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ ok: false }), { status: 503, headers: { "Content-Type": "application/json" } });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("마진 계산", () => {
  it("정산금액 = 판매가 + 받은 배송비 − 수수료, 판매이익 = 정산금액 − 매입가 − 보낸 배송비 − 기타 비용", () => {
    expect(computeMargin(base)).toEqual({ revenue: 32000, saleFee: 1923, shipFee: 109, settlement: 29968, costTotal: 16500, vatAmount: 0, profit: 13468, marginRate: 46.4, breakEvenRoas: 215 });
    expect(computeMargin({ ...base, extraCost: 2000 })?.profit).toBe(11468);
  });

  it("부가세까지 빼고 보기: 남는 돈 ÷ 11을 뺍니다", () => {
    const result = computeMargin({ ...base, vat: true });
    expect(result?.vatAmount).toBe(1224);
    expect(result?.profit).toBe(12244);
    expect(result?.marginRate).toBe(42.2);
  });

  it("판매가가 없으면 계산하지 않고, 손해면 마이너스 · 손익분기 ROAS 없음", () => {
    expect(computeMargin({ ...base, salePrice: null })).toBeNull();
    const loss = computeMargin({ ...base, salePrice: 12000 });
    expect(loss?.profit).toBeLessThan(0);
    expect(loss?.breakEvenRoas).toBeNull();
  });

  it("목표 마진으로 판매가 구하기: 10원 단위로 올려 목표 이상, 낼 수 없으면 null", () => {
    expect(salePriceForMargin(base, 30)).toBe(21480);
    expect(computeMargin({ ...base, salePrice: 21480 })?.marginRate).toBeGreaterThanOrEqual(30);
    for (const target of [10, 20, 40]) {
      const price = salePriceForMargin({ ...base, vat: true }, target) as number;
      expect(price % 10).toBe(0);
      expect(computeMargin({ ...base, vat: true, salePrice: price })?.marginRate).toBeGreaterThanOrEqual(target);
    }
    expect(salePriceForMargin({ ...base, cost: null, shippingOut: null }, 30)).toBeNull();
    expect(salePriceForMargin(base, 95)).toBeNull();
  });

  it("마켓별 비교: 직접 입력은 빼고 많이 남는 순 · 내가 고친 수수료를 씁니다", () => {
    const rows = compareMarkets(base, {});
    expect(rows).toHaveLength(MARGIN_MARKETS.length - 1);
    expect(rows.map((item) => item.market.id)).not.toContain("custom");
    for (let index = 1; index < rows.length; index += 1) expect(rows[index - 1].result!.profit).toBeGreaterThanOrEqual(rows[index].result!.profit);
    const custom = compareMarkets(base, { smartstore: { feeRate: 0, shipFeeRate: 0 } });
    expect(custom[0].market.id).toBe("smartstore");
    expect(custom[0].customized).toBe(true);
  });

  it("기본 수수료: 스마트스토어 6.63%(주문관리 3.63% + 판매 3.0%) · 참고값 표시", () => {
    const smartstore = MARGIN_MARKETS.find((market) => market.id === "smartstore");
    expect(smartstore).toMatchObject({ feeRate: 6.63, shipFeeRate: 3.63 });
    expect(smartstore?.approximate).toBeFalsy();
    expect(MARGIN_MARKETS.find((market) => market.id === "coupang-health")?.approximate).toBe(true);
  });
});

describe("계산표 · 이 기기 저장", () => {
  it("요약: 평균 마진율 · 예상 이익(수량 반영) · 마진 10% 미만 · 가장 많이 남는 상품", () => {
    const rows = [row("a", "마누카꿀", { quantity: 10 }), row("b", "저마진", { salePrice: 16000 }), row("c", "판매가 없음", { salePrice: null })];
    const summary = sheetSummary(rows);
    expect(summary.count).toBe(3);
    expect(summary.computedCount).toBe(2);
    expect(summary.lowCount).toBe(1);
    expect(summary.best?.row.name).toBe("마누카꿀");
    expect(summary.totalProfit).toBe(13468 * 10 + (computeMargin(rows[1])?.profit ?? 0));
  });

  it("엑셀(CSV): 한글 깨짐 방지 BOM · 머리줄 · 수식으로 읽히는 이름 막기", () => {
    const csv = sheetToCsv([row("a", "=HYPERLINK(\"x\")")]);
    expect(csv.startsWith("\uFEFF\"상품명\"")).toBe(true);
    expect(csv).toContain("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csv.split("\r\n")[1]).toContain("\"네이버 스마트스토어\",29000,3000,13000,3500,0,6.63,3.63,\"아니오\",29968,13468,46.4,215,1,13468");
  });

  it("저장: 같은 이름은 새 내용으로 바꾸고, 최대 30개(오래된 것부터 뺌)", () => {
    let saves: MarginSheet[] = [];
    for (let index = 0; index < 32; index += 1) saves = upsertSave(saves, `표 ${index}`, [row("a", "x")]).saves;
    expect(saves).toHaveLength(30);
    expect(saves[0].name).toBe("표 31");
    expect(saves.some((save) => save.name === "표 0")).toBe(false);
    const again = upsertSave(saves, "표 31", [row("a", "x"), row("b", "y")]);
    expect(again.saves).toHaveLength(30);
    expect(again.saves[0].rows).toHaveLength(2);
  });

  it("저장 값이 망가져도 기본값으로 엽니다", () => {
    window.localStorage.setItem(MARGIN_STORAGE_KEYS.draft, "{broken");
    window.localStorage.setItem(MARGIN_STORAGE_KEYS.sheet, JSON.stringify([{ id: "", name: 1 }, { id: "ok", name: "정상", salePrice: 1000, marketId: "nope" }]));
    expect(loadDraft()).toMatchObject({ marketId: "smartstore", feeRate: 6.63, salePrice: null });
    const rows = loadSheetRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "ok", marketId: "custom", salePrice: 1000 });
  });

  it("입력칸 글자 → 숫자(원은 정수, %는 소수점 둘째 자리까지)", () => {
    expect(parseMoneyText("29,000원")).toBe(29000);
    expect(parseMoneyText("")).toBeNull();
    expect(parseRateText("6.635")).toBe(6.63);
    expect(parseRateText("120")).toBe(100);
  });
});

describe("마진계산기 화면", () => {
  it("팝업: 단가표 상품으로 채우고 판매가를 넣으면 바로 계산 · A단가/일반공급가 전환 · 계산표에 담기", async () => {
    const { MarginCalculatorModal } = await import("@/pages/catalog/MarginCalculator");
    render(
      <MemoryRouter>
        <MarginCalculatorModal prefill={{ productId: "h9", name: "루테인 30캡슐", aPrice: 13000, generalPrice: 15000, salePrice: null, shippingOut: 3000 }} onClose={() => undefined} />
      </MemoryRouter>
    );
    expect(screen.getByRole("dialog", { name: "마진계산기" })).toBeTruthy();
    expect(screen.getByText("판매가가 자율이에요. 내 판매가를 넣어 주세요.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("판매가격"), { target: { value: "29000" } });
    const result = screen.getByRole("region", { name: "계산 결과" });
    expect(within(result).getByText("27,077원")).toBeTruthy();
    expect(within(result).getByText("11,077원")).toBeTruthy();
    expect(within(result).getByText("38.2%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "일반공급가 15,000원" }));
    expect(within(result).getByText("31.3%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /계산표에 담기/ }));
    const stored = JSON.parse(window.localStorage.getItem(MARGIN_STORAGE_KEYS.sheet) ?? "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ name: "루테인 30캡슐", cost: 15000, salePrice: 29000, marketId: "smartstore" });
  });

  it("화면(/margin): 마켓별 비교 · 계산표에 담고 이름 붙여 저장 · 불러오기", async () => {
    const { MarginCalculatorPage } = await import("@/pages/catalog/MarginCalculator");
    render(
      <MemoryRouter initialEntries={["/margin"]}>
        <Routes>
          <Route path="/margin" element={<MarginCalculatorPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { level: 1, name: "마진계산기" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("판매가격"), { target: { value: "29000" } });
    fireEvent.change(screen.getByLabelText("매입가"), { target: { value: "13000" } });
    const compare = screen.getByRole("region", { name: "마켓별로 남는 돈" });
    expect(within(compare).getAllByRole("button")).toHaveLength(MARGIN_MARKETS.length - 1);
    fireEvent.click(screen.getByRole("button", { name: /계산표에 담기/ }));
    expect(document.querySelectorAll(".mc-table tbody tr")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /^저장$/ }));
    fireEvent.change(screen.getByLabelText("계산표 이름"), { target: { value: "11월 루테인" } });
    fireEvent.click(screen.getByRole("button", { name: "저장하기" }));
    const saves = JSON.parse(window.localStorage.getItem(MARGIN_STORAGE_KEYS.saves) ?? "[]");
    expect(saves[0]).toMatchObject({ name: "11월 루테인" });
    expect(saves[0].rows).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /불러오기/ }));
    expect(screen.getByRole("button", { name: "11월 루테인 지우기" })).toBeTruthy();
    expect(document.querySelector(".mc-load-main")?.textContent).toContain("11월 루테인상품 1개");
  });

  it("오른쪽 아래 빠른 버튼: 위에서부터 마진계산기 · 소싱요청 · 톡상담(마진계산기 화면에서는 마진계산기 숨김)", async () => {
    const { FloatingActions } = await import("@/pages/catalog/FloatingActions");
    const onMargin = vi.fn();
    const onSourcing = vi.fn();
    render(<MemoryRouter initialEntries={["/"]}><FloatingActions onMargin={onMargin} onSourcing={onSourcing} /></MemoryRouter>);
    const nav = screen.getByRole("navigation", { name: "빠른 메뉴" });
    expect(nav.textContent).toBe("마진계산기소싱요청톡상담");
    fireEvent.click(within(nav).getByRole("button", { name: "마진계산기" }));
    fireEvent.click(within(nav).getByRole("button", { name: "소싱요청" }));
    expect(onMargin).toHaveBeenCalledTimes(1);
    expect(onSourcing).toHaveBeenCalledTimes(1);
    expect(within(nav).getByRole("link", { name: /톡상담/ }).getAttribute("href")).toBe("https://pf.kakao.com/_NyuVn");
    document.body.innerHTML = "";
    render(<MemoryRouter initialEntries={["/margin"]}><FloatingActions onMargin={onMargin} onSourcing={onSourcing} /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "마진계산기" })).toBeNull();
  });

  it("상단 메뉴: '소싱해주세요!' 자리에 마진계산기 · 오른쪽 아래 버튼으로 계산기 팝업", async () => {
    const { PageFrame } = await import("@/pages/catalog/PublicCatalog");
    render(<MemoryRouter><PageFrame><div /></PageFrame></MemoryRouter>);
    const nav = screen.getByRole("navigation", { name: "주요 메뉴" });
    expect(within(nav).getByRole("link", { name: /마진계산기/ }).getAttribute("href")).toBe("/margin");
    expect(within(nav).queryByRole("button", { name: /소싱해주세요/ })).toBeNull();
    fireEvent.click(within(screen.getByRole("navigation", { name: "빠른 메뉴" })).getByRole("button", { name: "마진계산기" }));
    expect(await screen.findByRole("dialog", { name: "마진계산기" })).toBeTruthy();
  });

  it("단가표 마진율 칸 '계산': 그 상품 A단가·일반공급가·지정 판매가로 계산기를 엽니다", async () => {
    const { CatalogProductTable } = await import("@/pages/catalog/PublicCatalog");
    const listener = vi.fn();
    window.addEventListener(MARGIN_OPEN_EVENT, listener);
    render(
      <MemoryRouter>
        <CatalogProductTable products={[fixedProduct] as never} categories={categories as never} policyById={new Map()} currentMonth={11} onImage={() => undefined} onShipping={() => undefined} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: `${fixedProduct.name} 마진계산기로 계산하기` }));
    window.removeEventListener(MARGIN_OPEN_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ productId: "h1", name: fixedProduct.name, aPrice: 13000, generalPrice: 15000, salePrice: 20000, shippingOut: null });
  });
});
