// 옵션 팝업(단가표·신규상품·백과사전 공용, 2026-11-22 관리자 신고 "확인할 옵션을 누르면 계속 꺼진다")
// - 단가표는 시계 때문에 1초마다 다시 그려져 닫기 함수가 매번 새로 옵니다. 그래도 열어 둔 옵션 목록의 포커스를 빼앗지 않아야 합니다.
// - 지정 판매가(이름표 + 금액)와 마진은 각각 한 줄로 보여 줍니다.
import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCatalogCards, ProductOptionsModal } from "@/pages/catalog/product-cards";
import type { Category, Product } from "@/pages/catalog/types";

const categories: Category[] = [{ id: "c-farm", name: "🥕 농산", shippingType: "domestic", sortOrder: 1, isActive: true }];

function product(id: string, name: string, generalPrice: number, extra: Partial<Product> = {}): Product {
  return {
    id, productCode: id.toUpperCase(), name, imageUrl: null, origin: null, aPrice: 0, generalPrice, salePrice: 0,
    salePriceMode: "autonomous", saleStartMonth: null, saleEndMonth: null, isAlwaysOnSale: true, shippingFee: "무료", releaseInfo: null, notes: null,
    optionsInfo: null, packaging: null, courier: null, shippingType: "domestic", categoryId: "c-farm", isVisible: true, isSoldOut: false,
    createdAt: "2026-11-01 00:00:00", updatedAt: "2026-11-01 00:00:00", options: [], ...extra
  } as Product;
}

const apples = [
  product("ap1", "[다] [실속형] 부사 사과 1kg (중대과)", 6120, { aPrice: 5610 }),
  product("ap2", "[다] [실속형] 부사 사과 3kg (중대과)", 14000, { aPrice: 12800, salePriceMode: "fixed", salePrice: 29000 }),
  product("ap3", "[다] [실속형] 부사 사과 5kg (중대과)", 21000, { aPrice: 19500, salePriceMode: "fixed", salePrice: null })
];
const group = { id: "auto-apple", name: "[다] [실속형] 부사 사과 (중대과)", imageUrl: null, categoryId: "c-farm", productIds: ["ap1", "ap2", "ap3"], auto: true };
const days = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"];
const trend = (general: number, student: number) => ({ general: days.map(() => general), student: days.map(() => student), current: { general, student, since: "2026-11-16" }, previous: null });
const detail = {
  group: { id: group.id, name: group.name, imageUrl: null, description: null, shippingNote: null, materialsUrl: null, auto: true },
  productIds: ["ap1", "ap2", "ap3"], optionLabels: {}, today: days[6], days,
  trends: { ap1: trend(6120, 5610), ap2: trend(14000, 12800), ap3: trend(21000, 19500) }
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, data: detail }), { status: 200, headers: { "Content-Type": "application/json" } })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});

describe("옵션 팝업", () => {
  it("화면이 1초마다 다시 그려져도(새 닫기 함수) '확인할 옵션' 목록의 포커스를 빼앗지 않습니다", async () => {
    const [card] = buildCatalogCards(apples, apples, [group]);
    const props = { card, categories, policyById: new Map(), currentMonth: 11, onShipping: () => undefined };
    const view = render(<ProductOptionsModal {...props} onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByLabelText("확인할 옵션")).toBeTruthy());
    const select = screen.getByLabelText("확인할 옵션") as HTMLSelectElement;
    select.focus();
    expect(document.activeElement).toBe(select);
    for (let tick = 0; tick < 3; tick += 1) view.rerender(<ProductOptionsModal {...props} onClose={() => undefined} />);
    expect(document.activeElement).toBe(select);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("지정 판매가는 이름표와 금액, 마진은 다음 줄에 따로 보여 줍니다", async () => {
    const [card] = buildCatalogCards(apples, apples, [group]);
    render(<ProductOptionsModal card={card} categories={categories} policyById={new Map()} currentMonth={11} onShipping={() => undefined} onClose={() => undefined} />);
    const sale = await waitFor(() => {
      const element = document.querySelector(".product-option-sale");
      if (!element) throw new Error("지정 판매가 줄이 없습니다");
      return element as HTMLElement;
    });
    const price = within(sale).getByText("지정 판매가").closest(".product-option-sale-price") as HTMLElement;
    expect(price.textContent).toBe("지정 판매가29,000원");
    const margin = sale.querySelector(".product-option-sale-margin") as HTMLElement;
    // 마진 = (29,000 − 12,800) ÷ 29,000 = 55.9%
    expect(margin.textContent).toBe("마진55.9%");
    expect(price.parentElement).toBe(margin.parentElement);
    // 지정 판매가인데 금액이 비어 있으면 "미설정"만 보이고 마진 줄은 없습니다.
    const lines = Array.from(document.querySelectorAll(".product-option-sale"));
    expect(lines).toHaveLength(2);
    expect(lines[1].querySelector(".product-option-sale-price")?.textContent).toBe("지정 판매가미설정");
    expect(lines[1].querySelector(".product-option-sale-margin")).toBeNull();
  });
});
