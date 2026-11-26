// 판매·정산 날짜 카드 '세부내역 보기'(2026-11-26 관리자 요청):
// 펼치면 그날 어떤 상품이 얼마(일반 도매 = 공급가(원가), 판매수수료 = 판매가)에 몇 개 팔렸는지, 반품·배송비와 합계를 보여 줍니다.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }));
const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import { SupplierSales } from "@/pages/supplier/SupplierSales";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(status < 400 ? { ok: true, data } : { ok: false, error: { message: "잠시 후 다시 시도해 주세요." } }), { status, headers: { "Content-Type": "application/json" } });
}

const day18 = { date: "2026-11-18", saleAmount: 111000, saleQuantity: 6, returnAmount: 20000, returnQuantity: 1, orderCount: 4, netAmount: 91000, shippingFee: 4000 };
const day19 = { date: "2026-11-19", saleAmount: 8750, saleQuantity: 1, returnAmount: 0, returnQuantity: 0, orderCount: 1, netAmount: 8750, shippingFee: 0 };

function monthBody(type: "wholesale" | "commission") {
  return {
    month: "2026-11", today: "2026-11-26", hasAnySales: true,
    settings: { type, commissionRate: 10, cycle: "weekly" },
    totals: { saleAmount: 119750, saleQuantity: 7, returnAmount: 20000, returnQuantity: 1, orderCount: 5, netAmount: 99750, goodsAmount: 99750, shippingFee: 4000, commission: 0, payoutAmount: 103750, netIncome: 103750 },
    days: [day18, day19],
    ranking: [], settlements: [], payoutDays: [], fees: []
  };
}

const line = (values: Record<string, unknown>) => ({ productId: null, productCode: null, imageUrl: null, orders: 1, shippingFee: 0, returnQuantity: 0, returnAmount: 0, costMissing: false, ...values });

const wholesaleDetail = {
  date: "2026-11-18", type: "wholesale", settings: { type: "wholesale", commissionRate: 10, cycle: "weekly" },
  lines: [
    line({ key: "p-a1|20000", productId: "p-a1", productCode: "TST-A1", productName: "봄날 사과 5kg", unitPrice: 20000, quantity: 3, netQuantity: 2, returnQuantity: 1, saleAmount: 60000, returnAmount: 20000, netAmount: 40000, shippingFee: 4000 }),
    line({ key: "p-a2|30000", productId: "p-a2", productName: "봄날 배 7.5kg", unitPrice: 30000, quantity: 1, netQuantity: 1, saleAmount: 30000, netAmount: 30000 }),
    line({ key: "p-a1|21000", productId: "p-a1", productName: "봄날 사과 5kg", unitPrice: 21000, quantity: 1, netQuantity: 1, saleAmount: 21000, netAmount: 21000 }),
    line({ key: "name:모르는 상품|-", productName: "모르는 상품", unitPrice: null, quantity: 1, netQuantity: 1, saleAmount: 0, netAmount: 0, costMissing: true })
  ],
  totals: { ...day18, goodsAmount: 91000, shippingFee: 4000, payoutAmount: 95000, costMissing: 1 }
};

const kammeDetail = {
  date: "2026-11-19", type: "wholesale", settings: { type: "wholesale", commissionRate: 10, cycle: "weekly" },
  lines: [line({ key: "p-k1|8750", productId: "p-k1", productName: "캄므 드립백 10입", unitPrice: 8750, quantity: 1, netQuantity: 1, saleAmount: 8750, netAmount: 8750 })],
  totals: { ...day19, goodsAmount: 8750, shippingFee: 0, payoutAmount: 8750, costMissing: 0 }
};

const commissionDetail = {
  date: "2026-11-18", type: "commission", settings: { type: "commission", commissionRate: 10, cycle: "weekly" },
  lines: [
    line({ key: "p-a2|30000", productId: "p-a2", productName: "봄날 배 7.5kg", unitPrice: 30000, quantity: 6, netQuantity: 6, saleAmount: 180000, netAmount: 180000, shippingFee: 3000 })
  ],
  totals: { ...day18, saleAmount: 180000, returnAmount: 0, returnQuantity: 0, netAmount: 180000, goodsAmount: 180000, shippingFee: 3000, payoutAmount: 183000, costMissing: 0 }
};

function mockApi(type: "wholesale" | "commission", details: Record<string, unknown>, failFirst = false) {
  let failed = false;
  apiFetch.mockImplementation(async (path: string) => {
    const match = path.match(/^\/supplier\/sales\/day\?date=(\d{4}-\d{2}-\d{2})$/);
    if (match) {
      if (failFirst && !failed) {
        failed = true;
        return json(null, 502);
      }
      return details[match[1]] ? json(details[match[1]]) : json({ date: match[1], type, settings: monthBody(type).settings, lines: [], totals: {} });
    }
    if (path.startsWith("/supplier/sales")) return json(monthBody(type));
    return json(null, 404);
  });
}

const dayCalls = (date: string) => apiFetch.mock.calls.filter(([path]) => path === `/supplier/sales/day?date=${date}`).length;

// 단가 줄·합계 이름은 좁은 화면 줄바꿈 때문에 여러 조각(span)으로 나뉘어 있어 칸 전체 글자로 찾습니다.
function label(container: HTMLElement, text: string) {
  const found = Array.from(container.querySelectorAll<HTMLElement>("dt, dd, strong, small, p, span")).find((element) => element.textContent?.replace(/\s+/g, " ").trim() === text);
  if (!found) throw new Error(`찾지 못함: ${text}`);
  return found;
}
const amountOf = (container: HTMLElement, text: string) => label(container, text).nextElementSibling?.textContent;
const waitLabel = (container: HTMLElement, text: string) => waitFor(() => label(container, text));

async function openDay(name: RegExp) {
  fireEvent.click(await screen.findByRole("button", { name }));
  return (await screen.findByRole("heading", { level: 2, name: name })).closest("section") as HTMLElement;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-26T03:00:00.000Z"));
});

afterEach(() => {
  cleanup();
  apiFetch.mockReset();
  vi.useRealTimers();
});

describe("판매·정산 날짜 세부내역 보기", () => {
  it("일반 도매: 펼치면 상품별 공급가(원가) × 수량 · 반품 · 배송비 → 이 날 합계, 펼친 채로 날짜를 바꾸면 그날 내역을 보여 줍니다", async () => {
    mockApi("wholesale", { "2026-11-18": wholesaleDetail, "2026-11-19": kammeDetail });
    render(<MemoryRouter><SupplierSales /></MemoryRouter>);
    // 오늘(11/26)은 판매가 없어 세부내역 버튼이 없음
    await screen.findByRole("heading", { level: 2, name: /^11월 26일/ });
    expect(screen.queryByRole("button", { name: "세부내역 보기" })).toBeNull();

    const card = await openDay(/^11월 18일\(수\)/);
    expect(dayCalls("2026-11-18")).toBe(0); // 펼치기 전에는 묻지 않음
    const toggle = within(card).getByRole("button", { name: "세부내역 보기" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toContain("세부내역 접기");
    const panel = document.getElementById(toggle.getAttribute("aria-controls")!) as HTMLElement;
    await waitLabel(panel, "공급가 20,000원 × 3개");
    expect(within(panel).getByText("공급가(원가) × 수량으로 계산했어요.")).toBeTruthy();
    expect(within(panel).getByText("60,000원")).toBeTruthy();
    expect(within(panel).getByText("반품 1개")).toBeTruthy();
    expect(within(panel).getByText("-20,000원")).toBeTruthy();
    expect(amountOf(panel, "반품 뺀 금액")).toBe("40,000원");
    expect(within(panel).getByText("배송비 4,000원")).toBeTruthy();
    expect(label(panel, "공급가 30,000원 × 1개")).toBeTruthy();
    expect(label(panel, "공급가 21,000원 × 1개")).toBeTruthy();
    expect(label(panel, "공급가 확인 중 × 1개")).toBeTruthy();
    // 합계: 공급 금액 91,000원 + 배송비 4,000원 = 95,000원
    expect(amountOf(panel, "공급 금액 합계(반품 뺌)")).toBe("91,000원");
    expect(amountOf(panel, "배송비 합계")).toBe("+4,000원");
    expect(amountOf(panel, "이 날 판매분 정산 금액")).toBe("95,000원");
    expect(within(panel).getByText(/공급가\(원가\)를 확인 중인 판매 1줄/)).toBeTruthy();
    expect(within(panel).getByText("주 정산 · 11.16 ~ 11.22 판매분과 함께 11월 23일(월)에 입금해요. 판매 수수료는 없어요.")).toBeTruthy();
    expect(panel.textContent).not.toContain("판매가");

    // 펼친 채로 11/19 → 그날 내역(배송비 0원)
    await openDay(/^11월 19일\(목\)/);
    await within(panel).findByText("캄므 드립백 10입");
    expect(label(panel, "공급가 8,750원 × 1개")).toBeTruthy();
    expect(amountOf(panel, "배송비 합계")).toBe("0원");
    expect(amountOf(panel, "이 날 판매분 정산 금액")).toBe("8,750원");
    // 다시 11/18 → 받아 둔 내역(서버에 다시 묻지 않음)
    await openDay(/^11월 18일\(수\)/);
    await waitLabel(panel, "공급가 20,000원 × 3개");
    expect(dayCalls("2026-11-18")).toBe(1);
    expect(dayCalls("2026-11-19")).toBe(1);

    // 접기 → 내역 숨김
    fireEvent.click(within(card).getByRole("button", { name: "세부내역 접기" }));
    expect(panel.hidden).toBe(true);
    expect(() => label(panel, "공급가 20,000원 × 3개")).toThrow();
  });

  it("판매수수료: 판매가 × 수량과 판매 대금 합계, 수수료는 다음 달 1~3일에 따로 청구한다고 알려 줍니다", async () => {
    mockApi("commission", { "2026-11-18": commissionDetail });
    render(<MemoryRouter><SupplierSales /></MemoryRouter>);
    const card = await openDay(/^11월 18일\(수\)/);
    fireEvent.click(within(card).getByRole("button", { name: "세부내역 보기" }));
    await waitLabel(card, "판매가 30,000원 × 6개");
    expect(amountOf(card, "판매 대금 합계(반품 뺌)")).toBe("180,000원");
    expect(amountOf(card, "이 날 판매분 정산 금액")).toBe("183,000원");
    expect(within(card).getByText(/판매 수수료 10%는 한 달 판매 대금\(배송비 제외\)으로 계산해 다음 달 1~3일에 따로 청구해요/)).toBeTruthy();
  });

  it("불러오지 못하면 안내와 다시 불러오기 버튼을 보여 줍니다", async () => {
    mockApi("wholesale", { "2026-11-18": wholesaleDetail }, true);
    render(<MemoryRouter><SupplierSales /></MemoryRouter>);
    const card = await openDay(/^11월 18일\(수\)/);
    fireEvent.click(within(card).getByRole("button", { name: "세부내역 보기" }));
    await within(card).findByText("잠시 후 다시 시도해 주세요.");
    fireEvent.click(within(card).getByRole("button", { name: "다시 불러오기" }));
    await waitLabel(card, "공급가 20,000원 × 3개");
    await waitFor(() => expect(dayCalls("2026-11-18")).toBe(2));
  });
});
