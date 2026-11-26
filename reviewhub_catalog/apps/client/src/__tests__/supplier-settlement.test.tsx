// 정산 방식 2가지(2026-11-25): 판매수수료(물품 대금 100% 주 정산 + 다음 달 1~3일 수수료) / 일반 도매(원가 × 수량, 수수료 없음).
// 공급사 대시보드(그래프·달력·썸네일·자동 계산 정산 금액·반품 책임), 관리자 정산 방식 고르기, 관리자 공급사 정산 탭.
import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import {
  cleanSettlementSettings,
  emptyLedger,
  formatPeriodLabel,
  isSettlementPeriod,
  settlementAmounts,
  settlementPeriodFor,
  settlementPlanText,
  settlementRecordKey,
  supplierFacingAmounts,
  upcomingSettlement
} from "@repo/shared/supplier-portal";

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock, Toaster: () => null }));

import { SupplierHome } from "@/pages/supplier/supplier-dashboard";
import { SupplierSettlementFields, saveSupplierSettlement, settlementDraft, type SettlementDraft } from "@/pages/admin/SupplierSettlementFields";
import { SupplierSettlementsAdmin } from "@/pages/admin/SupplierSettlementsAdmin";

type Call = { url: string; method: string; body: unknown };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify({ ok: status < 400, data }), { status, headers: { "Content-Type": "application/json" } });
}

function stubApi(handler: (url: string, method: string, body: unknown) => Response | undefined) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const raw = init?.body ?? null;
    const body = typeof raw === "string" ? JSON.parse(raw) : raw;
    calls.push({ url, method, body });
    return handler(url, method, body) ?? new Response(JSON.stringify({ ok: false, error: { message: "없는 주소" } }), { status: 404, headers: { "Content-Type": "application/json" } });
  }));
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  toastMock.success.mockClear();
  toastMock.error.mockClear();
  document.body.innerHTML = "";
});

describe("정산 계산 규칙(공용)", () => {
  it("판매수수료 = 물품 대금 100% + 배송비, 수수료는 따로 / 도매 = 원가 × 수량 + 배송비, 수수료 없음", () => {
    const ledger = { ...emptyLedger(), saleAmount: 300000, returnAmount: 20000, netAmount: 280000, costAmount: 220000, costReturnAmount: 15000, shippingFee: 6000, shippingReceived: 9000 };
    expect(settlementAmounts(ledger, { type: "commission", commissionRate: 10 })).toEqual({ goodsAmount: 280000, shippingFee: 6000, payoutAmount: 286000, commission: 28000, netIncome: 258000, doogoProfit: 28000 });
    expect(settlementAmounts(ledger, { type: "wholesale", commissionRate: 10 })).toEqual({ goodsAmount: 220000, shippingFee: 6000, payoutAmount: 226000, commission: 0, netIncome: 226000, doogoProfit: 60000 });
    // 도매 공급사 화면에는 원가 기준 금액만
    expect(supplierFacingAmounts(ledger, "wholesale")).toEqual({ saleAmount: 235000, returnAmount: 15000, netAmount: 220000 });
    expect(supplierFacingAmounts(ledger, "commission")).toEqual({ saleAmount: 300000, returnAmount: 20000, netAmount: 280000 });
    expect(cleanSettlementSettings({ type: "wholesale" })).toEqual({ type: "wholesale", commissionRate: 10, cycle: "weekly" });
    expect(cleanSettlementSettings({ type: "commission", commissionRate: 7.25, cycle: "monthly" })).toEqual({ type: "commission", commissionRate: 7.3, cycle: "monthly" });
    expect(cleanSettlementSettings({ type: "consign" })).toBeNull();
    expect(cleanSettlementSettings({ type: "commission", commissionRate: 120 })).toBeNull();
  });

  it("매일 정산(2026-11-26): 그날 판매분 → 그날 입금, 기록 열쇠 d:판매일, 수수료는 다음 달 1~3일 한 달 판매 대금(배송비 제외)", () => {
    expect(settlementPeriodFor("2026-11-26", "daily")).toEqual({ cycle: "daily", start: "2026-11-26", end: "2026-11-26", payoutStart: "2026-11-26", payoutEnd: "2026-11-26" });
    expect(upcomingSettlement("2026-11-26", "daily")).toMatchObject({ start: "2026-11-26", payoutStart: "2026-11-26" });
    expect(formatPeriodLabel({ start: "2026-11-26", end: "2026-11-26" })).toBe("11.26");
    expect(settlementRecordKey("daily", "2026-11-26")).toBe("d:2026-11-26");
    expect(isSettlementPeriod("daily", "2026-11-26")).toBe(true);
    expect(isSettlementPeriod("daily", "2026-11")).toBe(false);
    expect(isSettlementPeriod("daily", "2026-02-30")).toBe(false);
    expect(cleanSettlementSettings({ type: "commission", cycle: "daily" })).toEqual({ type: "commission", commissionRate: 10, cycle: "daily" });
    expect(cleanSettlementSettings({ type: "commission", cycle: "yearly" })).toBeNull();
    expect(settlementPlanText({ type: "commission", commissionRate: 10, cycle: "daily" })).toBe("판매수수료 10% · 매일 정산: 그날 판매분은 그날 판매 대금 100%와 배송비를 먼저 입금해요(입금이 확인되면 출고). 판매 수수료 10%는 한 달 판매 대금(배송비 제외) 기준으로 두고푸드가 다음 달 초에 청구하면 1~3일에 보내 주시고, 입금이 확인되면 두고푸드가 '판매대행·마케팅대행 수수료' 세금계산서를 발행해요.");
    expect(settlementPlanText({ type: "wholesale", commissionRate: 10, cycle: "daily" })).toMatch(/^일반 도매\(매입\) · 매일 정산: 그날 판매분은 그날 공급가\(원가\) × 판매 수량과 배송비를 입금해요\(입금이 확인되면 출고\)/);
  });
});

const profile = {
  supplier: { id: "sup-a", name: "봄날농원", representative: null, phone: null, email: null, address: null, businessNumber: null },
  account: { id: "acc-1", username: "spring", isActive: true, commissionRate: 10, settlementCycle: "weekly" as const, lastLoginAt: null, createdAt: "2026-11-20T00:00:00Z" }
};

function dashboard(type: "commission" | "wholesale") {
  const commission = type === "commission";
  return {
    ...profile,
    settlement: { type, commissionRate: 10, cycle: "weekly" },
    today: "2026-11-20",
    month: "2026-11",
    sales: {
      totals: { saleAmount: 300000, saleQuantity: 20, returnAmount: 20000, returnQuantity: 1, orderCount: 12, netAmount: 280000, goodsAmount: 280000, shippingFee: 6000, payoutAmount: 286000, commission: commission ? 28000 : 0, netIncome: commission ? 258000 : 286000, costMissing: 0 },
      ranking: [
        { productId: "p1", productCode: "A1", productName: "봄날 사과 5kg", quantity: 10, amount: 200000, returnQuantity: 1, returnAmount: 20000, netAmount: 180000, netQuantity: 9, imageUrl: "https://img.test/apple.jpg" },
        { productId: null, productCode: null, productName: "봄날 배 7.5kg", quantity: 4, amount: 100000, returnQuantity: 0, returnAmount: 0, netAmount: 100000, netQuantity: 4, imageUrl: null }
      ],
      hasAnySales: true,
      days: [
        { date: "2026-11-02", saleAmount: 120000, saleQuantity: 8, returnAmount: 0, returnQuantity: 0, orderCount: 5, netAmount: 120000, shippingFee: 3000 },
        { date: "2026-11-18", saleAmount: 180000, saleQuantity: 12, returnAmount: 20000, returnQuantity: 1, orderCount: 7, netAmount: 160000, shippingFee: 3000 }
      ],
      payoutDays: [
        { date: "2026-11-09", endDate: "2026-11-09", periodStart: "2026-11-02", periodEnd: "2026-11-08", amount: 123000, done: true, state: { month: "w:2026-11-02", status: "paid", saleAmount: 120000, commission: 12000, payoutAmount: 123000, commissionRate: 10, paidAt: "2026-11-09T01:00:00Z", doneAt: null, memo: null, updatedAt: null } },
        { date: "2026-11-23", endDate: "2026-11-23", periodStart: "2026-11-16", periodEnd: "2026-11-22", amount: 163000, done: false, state: null }
      ]
    },
    upcomingSettlement: { cycle: "weekly", start: "2026-11-16", end: "2026-11-22", payoutStart: "2026-11-23", payoutEnd: "2026-11-23", netAmount: 160000, goodsAmount: 160000, shippingFee: 3000, payoutAmount: 163000, commission: commission ? 16000 : 0, netIncome: commission ? 147000 : 163000, costMissing: 0, state: null },
    fees: commission ? [
      { month: "2026-10", netAmount: 500000, commission: 50000, commissionRate: 10, payoutStart: "2026-11-01", payoutEnd: "2026-11-03", closed: true, state: { month: "fee:2026-10", status: "paid", saleAmount: 500000, commission: 50000, payoutAmount: 0, commissionRate: 10, paidAt: "2026-11-02T01:00:00Z", doneAt: null, memo: null, updatedAt: null }, vatIncluded: true, amounts: { supply: 45455, tax: 4545, total: 50000 }, invoice: { issued: false, issuedAt: null, amount: null } },
      { month: "2026-11", netAmount: 280000, commission: 28000, commissionRate: 10, payoutStart: "2026-12-01", payoutEnd: "2026-12-03", closed: false, state: null, vatIncluded: true, amounts: { supply: 25455, tax: 2545, total: 28000 }, invoice: { issued: false, issuedAt: null, amount: null } }
    ] : [],
    products: { total: 12, soldOut: 2, hidden: 0 },
    requests: { pending: 1, recent: [] }
  };
}

describe("공급사 대시보드: 판매 현황 · 자동 계산 정산 금액", () => {
  it("판매수수료 방식: 그래프·달력·썸네일과 물품 대금 + 배송비 = 입금, 수수료 청구·반품 책임을 보여 줍니다", async () => {
    stubApi((url) => (url.includes("/supplier/dashboard") ? json(dashboard("commission")) : undefined));
    const { container } = render(<MemoryRouter><SupplierHome profile={profile} reloadKey={0} onCreate={() => undefined} /></MemoryRouter>);
    expect(await screen.findByText(/163,000원 입금 예정이에요/)).toBeTruthy();
    // 날짜별 그래프(막대마다 금액) — 그래프가 판매 칸 맨 앞
    const chart = container.querySelector(".sup-dash-chart") as HTMLElement;
    expect(within(chart).getByRole("button", { name: /11월 18일\(수\) 판매 160,000원/ })).toBeTruthy();
    // 달력: 날짜마다 판매 금액, 정산 입금일
    expect(screen.getByRole("link", { name: /^11월 2일\(월\), 판매 120,000원, 2026년 10월 판매 수수료 50,000원 두고푸드로 입금/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "11월 23일(월), 판매 없음, 정산 입금 163,000원" })).toBeTruthy();
    // 잘 팔린 상품 썸네일(이미지가 없으면 상자 그림)
    expect(container.querySelector(".sup-rank-list img.sa-thumb")?.getAttribute("src")).toBe("https://img.test/apple.jpg");
    expect(container.querySelectorAll(".sup-rank-list .sa-thumb.is-empty")).toHaveLength(1);
    // 정산 금액(자동 계산)
    const settle = container.querySelector(".sup-settle-panel") as HTMLElement;
    const row = (label: RegExp) => within(settle).getByText(label).closest("div") as HTMLElement;
    expect(within(row(/물품 대금 \(판매 금액 100%\)/)).getByText("160,000원")).toBeTruthy();
    expect(within(row(/배송비 \(100%\)/)).getByText("3,000원")).toBeTruthy();
    expect(within(row(/입금 합계/)).getByText("163,000원")).toBeTruthy();
    expect(within(row(/실 수령 예상/)).getByText("147,000원")).toBeTruthy();
    // 판매 수수료: 두고푸드가 청구 → 1~3일 입금 → 입금 확인 → 세금계산서(판매대행·마케팅대행 수수료)
    expect(within(settle).getByText("2026년 11월 판매분 수수료")).toBeTruthy();
    expect(within(settle).getByText("청구 전")).toBeTruthy();
    expect(within(settle).getByText("청구됨 · 두고푸드로 입금해 주세요")).toBeTruthy();
    const invoiceNotes = [...settle.querySelectorAll(".sup-fee-invoice")].map((node) => node.textContent);
    expect(invoiceNotes).toEqual(["입금이 확인되면 두고푸드가 '판매대행·마케팅대행 수수료' 세금계산서를 발행해요", "입금이 확인되면 두고푸드가 '판매대행·마케팅대행 수수료' 세금계산서를 발행해요"]);
    // 달력: 지난달 판매분 수수료 입금일(11월 1~3일, 공급사 → 두고푸드)
    expect(screen.getByRole("link", { name: /^11월 1일\(일\), 판매 없음, 2026년 10월 판매 수수료 50,000원 두고푸드로 입금/ })).toBeTruthy();
    expect(container.querySelectorAll(".sup-mini-cell.is-fee")).toHaveLength(3);
    expect(within(settle).getByText(/제품 파손·변질은 공급사가 100% 책임지고 보상/)).toBeTruthy();
    expect(screen.getByText("2026년 11월 판매 금액")).toBeTruthy();
  });

  it("매일 정산: '오늘 판매분은 오늘 입금', 입금을 확인한 뒤 출고 안내", async () => {
    const base = dashboard("commission");
    const daily = {
      ...base,
      settlement: { type: "commission", commissionRate: 10, cycle: "daily" },
      upcomingSettlement: { ...base.upcomingSettlement, cycle: "daily", start: "2026-11-20", end: "2026-11-20", payoutStart: "2026-11-20", payoutEnd: "2026-11-20", netAmount: 40000, goodsAmount: 40000, shippingFee: 3000, payoutAmount: 43000, commission: 4000, netIncome: 39000 }
    };
    stubApi((url) => (url.includes("/supplier/dashboard") ? json(daily) : undefined));
    const { container } = render(<MemoryRouter><SupplierHome profile={profile} reloadKey={0} onCreate={() => undefined} /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "오늘 판매분은 11월 20일(금) 43,000원 입금 예정이에요." })).toBeTruthy();
    expect(screen.getByText(/11\.20 판매분 · 물품 대금 40,000원 \+ 배송비 3,000원 · 입금을 확인한 뒤 출고해 주세요/)).toBeTruthy();
    expect(screen.getByText("오늘 입금 예정")).toBeTruthy();
    // 머리 표시("봄날농원 · 판매수수료 10% · 매일 정산")와 정산 안내 문구 모두
    expect(screen.getAllByText(/판매수수료 10% · 매일 정산/).length).toBeGreaterThanOrEqual(2);
    const settle = container.querySelector(".sup-settle-panel") as HTMLElement;
    expect(within(settle).getByText("11.20 판매분 → 11월 20일(금) 입금")).toBeTruthy();
  });

  it("일반 도매 방식: '공급 금액'으로 부르고 수수료 칸 없이 공급가 × 판매 수량 + 배송비", async () => {
    stubApi((url) => (url.includes("/supplier/dashboard") ? json(dashboard("wholesale")) : undefined));
    const { container } = render(<MemoryRouter><SupplierHome profile={profile} reloadKey={0} onCreate={() => undefined} /></MemoryRouter>);
    expect(await screen.findByText("2026년 11월 공급 금액")).toBeTruthy();
    expect(screen.getByText("일반 도매(매입)")).toBeTruthy();
    const settle = container.querySelector(".sup-settle-panel") as HTMLElement;
    expect(within(settle).getByText(/물품 대금 \(공급가 × 판매 수량\)/)).toBeTruthy();
    expect(within(settle).queryByText(/공급사 → 두고푸드/)).toBeNull();
    expect(within(settle).queryByText(/실 수령 예상/)).toBeNull();
    expect(within(settle).getByText(/판매 수수료는 없어요/)).toBeTruthy();
  });
});

describe("관리자: 공급사 정산 방식 고르기", () => {
  it("판매수수료(수수료율) · 일반 도매(매입)와 지급 주기를 골라 저장합니다", async () => {
    function Harness({ onDraft }: { onDraft: (draft: SettlementDraft) => void }) {
      const [draft, setDraft] = React.useState(settlementDraft());
      return <SupplierSettlementFields value={draft} onChange={(next) => { setDraft(next); onDraft(next); }} idPrefix="t" />;
    }
    let latest = settlementDraft();
    render(<Harness onDraft={(draft) => { latest = draft; }} />);
    expect(screen.getByRole("radio", { name: /판매수수료/ })).toHaveProperty("checked", true);
    expect(screen.getByText(/판매수수료 10% · 주 정산: 월요일~일요일 판매분을 다음 주 월요일에 판매 대금 100%와 배송비를 먼저 입금/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /일반 도매\(매입\)/ }));
    expect(screen.queryByLabelText("판매 수수료(%)")).toBeNull();
    expect(screen.getByText(/공급가\(원가\) × 판매 수량과 배송비를 입금해요/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("지급 주기"), { target: { value: "monthly" } });
    expect(latest).toEqual({ type: "wholesale", commissionRate: "10", cycle: "monthly" });
    const calls = stubApi((url, method) => (url.includes("/settlement") && method === "PUT" ? json({ settlement: { type: "wholesale", commissionRate: 10, cycle: "monthly", explicit: true } }) : undefined));
    await saveSupplierSettlement("sup-a", latest);
    expect(calls[0]).toMatchObject({ method: "PUT", body: { type: "wholesale", commissionRate: 10, cycle: "monthly" } });
    expect(calls[0].url).toContain("/catalog/admin/suppliers/sup-a/settlement");
    await expect(saveSupplierSettlement("sup-a", { type: "commission", commissionRate: "", cycle: "weekly" })).rejects.toThrow(/0~100%/);
  });
});

describe("관리자: 지급 주기 '매일 정산' 고르기", () => {
  it("지급 주기 3가지 중 매일 정산을 고르면 안내가 바뀌고 cycle: daily로 저장합니다", async () => {
    function Harness({ onDraft }: { onDraft: (draft: SettlementDraft) => void }) {
      const [draft, setDraft] = React.useState(settlementDraft());
      return <SupplierSettlementFields value={draft} onChange={(next) => { setDraft(next); onDraft(next); }} idPrefix="d" />;
    }
    let latest = settlementDraft();
    render(<Harness onDraft={(draft) => { latest = draft; }} />);
    const select = screen.getByLabelText("지급 주기") as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual(["weekly", "monthly", "daily"]);
    expect([...select.options].map((option) => option.textContent)).toContain("매일 정산 (그날 판매분 → 그날 입금)");
    fireEvent.change(select, { target: { value: "daily" } });
    expect(latest).toEqual({ type: "commission", commissionRate: "10", cycle: "daily" });
    expect(screen.getByText(/판매수수료 10% · 매일 정산: 그날 판매분은 그날 판매 대금 100%와 배송비를 먼저 입금해요\(입금이 확인되면 출고\)\. 판매 수수료 10%는 한 달 판매 대금\(배송비 제외\)/)).toBeTruthy();
    expect(screen.getByText(/입금이 확인돼야 출고하는 공급사용이에요/)).toBeTruthy();
    const calls = stubApi((url, method) => (url.includes("/settlement") && method === "PUT" ? json({ settlement: { type: "commission", commissionRate: 10, cycle: "daily", explicit: true } }) : undefined));
    await saveSupplierSettlement("sup-a", latest);
    expect(calls[0]).toMatchObject({ method: "PUT", body: { type: "commission", commissionRate: 10, cycle: "daily" } });
  });
});

describe("관리자: 공급사 정산(주 정산 지급 · 월 정산 지급 · 판매 수수료 청구)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T03:00:00.000Z"));
  });

  it("주 정산은 지난주 판매분 지급 합계(물품 대금 + 배송비), 판매 수수료 탭은 청구하기 → 입금 확인 → 세금계산서 파일·발행 표시", async () => {
    vi.stubGlobal("confirm", () => true);
    const base = { registered: true, hasAccount: false, explicit: true, saleAmount: 0, returnAmount: 0, costAmount: 0, costMissing: 0, quantity: 3, orders: 2, paidAt: null, doneAt: null, memo: null, updatedAt: null, updatedBy: null, recorded: null, changedAfterRecord: false, status: "pending" };
    const weekly = {
      kind: "weekly", period: "2026-11-16", start: "2026-11-16", end: "2026-11-22", payoutFrom: "2026-11-23", payoutTo: "2026-11-23", closed: true,
      rows: [
        { ...base, supplierName: "봄날농원", supplierId: "sup-a", type: "commission", cycle: "weekly", commissionRate: 10, netAmount: 160000, goodsAmount: 160000, shippingFee: 3000, payoutAmount: 163000, commission: 16000, netIncome: 147000, doogoProfit: 16000 },
        { ...base, supplierName: "캄므커머스", supplierId: "sup-k", type: "wholesale", cycle: "weekly", commissionRate: 10, netAmount: 120000, goodsAmount: 100000, shippingFee: 0, payoutAmount: 100000, commission: 0, netIncome: 100000, doogoProfit: 20000 }
      ],
      totals: { netAmount: 280000, goodsAmount: 260000, shippingFee: 3000, payoutAmount: 263000, commission: 16000, doogoProfit: 36000, done: 0, paid: 0, pending: 2 },
      otherCycle: { suppliers: 0, payoutAmount: 0 },
      sync: null
    };
    const feeRow = { ...base, type: "commission", cycle: "weekly", commissionRate: 10, shippingFee: 0, invoice: { issued: false, issuedAt: null, amount: null }, taxProblems: [] };
    const fee = {
      kind: "fee", period: "2026-10", start: "2026-10-01", end: "2026-10-31", payoutFrom: "2026-11-01", payoutTo: "2026-11-03", closed: true,
      rows: [
        { ...feeRow, supplierName: "봄날농원", supplierId: "sup-a", netAmount: 500000, goodsAmount: 500000, payoutAmount: 500000, commission: 50000, netIncome: 450000, doogoProfit: 50000, invoiceAmounts: { supply: 45455, tax: 4545, total: 50000 } },
        { ...feeRow, supplierName: "이웃농장", supplierId: "sup-b", netAmount: 300000, goodsAmount: 300000, payoutAmount: 300000, commission: 30000, netIncome: 270000, doogoProfit: 30000, invoiceAmounts: { supply: 27273, tax: 2727, total: 30000 } },
        { ...feeRow, supplierName: "다미", supplierId: "sup-d", status: "done", doneAt: "2026-11-02T03:00:00Z", netAmount: 200000, goodsAmount: 200000, payoutAmount: 200000, commission: 20000, netIncome: 180000, doogoProfit: 20000, invoiceAmounts: { supply: 18182, tax: 1818, total: 20000 } }
      ],
      totals: { netAmount: 1000000, goodsAmount: 1000000, shippingFee: 0, payoutAmount: 1000000, commission: 100000, doogoProfit: 100000, done: 1, paid: 0, pending: 2 },
      invoice: { vatIncluded: true, item: "판매대행·마케팅대행 수수료", writeDate: "2026-10-31", supplierProblems: [], issued: 0, ready: ["다미"], missingInfo: [] },
      sync: null
    };
    const calls = stubApi((url, method) => {
      if (url.includes("/settlements/fee-invoice-file")) return new Response(new Blob(["xlsx"]), { status: 200, headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "X-Doogo-Invoice-Suppliers": encodeURIComponent(JSON.stringify(["다미"])) } });
      if (url.includes("/settlements/fee-invoices") && method === "POST") return json({ updated: 1, states: [{ issued: true }] });
      if (url.includes("/settlements/bulk") && method === "PUT") return json({ updated: 2, states: [] });
      if (url.includes("/baljuora/admin/settlements") && method === "GET") return json(url.includes("kind=fee") ? fee : weekly);
      if (url.includes("/baljuora/admin/settlements") && method === "PUT") return json({ state: { status: "paid" } });
      return undefined;
    });
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:test", revokeObjectURL: () => undefined }));
    render(<MemoryRouter><SupplierSettlementsAdmin /></MemoryRouter>);
    expect(await screen.findByText("263,000원")).toBeTruthy();
    expect(calls[0].url).toContain("kind=weekly&period=2026-11-16");
    expect(screen.getByText("11.16 ~ 11.22 판매분")).toBeTruthy();
    expect(screen.getByText("수수료 10%")).toBeTruthy();
    expect(screen.getByText("도매(매입)")).toBeTruthy();
    expect(screen.getByText(/원가 × 수량 · 마진 20,000원/)).toBeTruthy();
    // 판매 수수료 탭: 지난달 판매분 — 청구하기(하나) · 한 번에 청구하기(청구 전 모두) · 입금 확인 · 세금계산서
    await act(async () => { fireEvent.click(screen.getByRole("tab", { name: /판매 수수료 청구/ })); });
    expect(await screen.findByText("2026년 10월 판매분")).toBeTruthy();
    await waitFor(() => expect(calls.some((call) => call.url.includes("kind=fee&period=2026-10"))).toBe(true));
    expect(screen.getByText("판매대행·마케팅대행 수수료 세금계산서 (두고푸드 → 공급사)")).toBeTruthy();
    const clicks = await screen.findAllByRole("button", { name: "청구하기" });
    expect(clicks).toHaveLength(2);
    await act(async () => { fireEvent.click(clicks[0]); });
    const put = calls.find((call) => call.method === "PUT" && !call.url.includes("/bulk"));
    expect(put?.body).toMatchObject({ supplierName: "봄날농원", kind: "fee", period: "2026-10", status: "paid" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /한 번에 청구하기/ })); });
    const bulk = calls.find((call) => call.url.includes("/settlements/bulk"));
    expect(bulk?.body).toEqual({ kind: "fee", period: "2026-10", status: "paid", supplierNames: ["봄날농원", "이웃농장"] });
    // 입금 확인한 다미 → 홈택스 일괄발급 파일 → 발행 완료로 표시
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /홈택스 일괄발급 파일 받기 \(1곳\)/ })); });
    const file = calls.find((call) => call.url.includes("/settlements/fee-invoice-file"));
    expect(file?.url).toContain("month=2026-10&supplier=%EB%8B%A4%EB%AF%B8");
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: /1곳 발행 완료로 표시/ })); });
    const mark = calls.find((call) => call.url.includes("/settlements/fee-invoices"));
    expect(mark?.body).toEqual({ month: "2026-10", supplierNames: ["다미"], issued: true });
  });

  it("매일 정산 지급 탭: 오늘 판매분 지급 합계, 지급 대기 날짜로 옮기기, 하루씩 이동, 지급 완료, 다른 주기 탭으로", async () => {
    vi.stubGlobal("confirm", () => true);
    const row = { supplierName: "새벽농장", supplierId: "sup-n", registered: true, hasAccount: true, explicit: true, type: "commission", cycle: "daily", commissionRate: 10, saleAmount: 50000, returnAmount: 0, netAmount: 50000, costAmount: 0, costMissing: 0, quantity: 5, orders: 3, goodsAmount: 50000, shippingFee: 3000, payoutAmount: 53000, commission: 5000, netIncome: 48000, doogoProfit: 5000, status: "pending", paidAt: null, doneAt: null, memo: null, updatedAt: null, updatedBy: null, recorded: null, changedAfterRecord: false };
    const daily = (period: string) => ({
      kind: "daily", period, start: period, end: period, payoutFrom: period, payoutTo: period, closed: period < "2026-11-25",
      rows: [row],
      totals: { netAmount: 50000, goodsAmount: 50000, shippingFee: 3000, payoutAmount: 53000, commission: 5000, doogoProfit: 5000, done: 0, paid: 0, pending: 1 },
      otherCycle: { suppliers: 1, payoutAmount: 20000, byCycle: { weekly: { suppliers: 1, payoutAmount: 20000 } } },
      pendingDays: [{ date: "2026-11-23", suppliers: 1, payoutAmount: 33000 }, { date: "2026-11-25", suppliers: 1, payoutAmount: 53000 }],
      sync: null
    });
    const weekly = { kind: "weekly", period: "2026-11-16", start: "2026-11-16", end: "2026-11-22", payoutFrom: "2026-11-23", payoutTo: "2026-11-23", closed: true, rows: [], totals: { netAmount: 0, goodsAmount: 0, shippingFee: 0, payoutAmount: 0, commission: 0, doogoProfit: 0, done: 0, paid: 0, pending: 0 }, otherCycle: { suppliers: 0, payoutAmount: 0 }, sync: null };
    const calls = stubApi((url, method) => {
      if (url.includes("/baljuora/admin/settlements") && method === "GET") {
        const period = new URL(url, "http://localhost").searchParams.get("period") ?? "";
        return json(url.includes("kind=daily") ? daily(period) : weekly);
      }
      if (url.includes("/baljuora/admin/settlements") && method === "PUT") return json({ state: { status: "paid" } });
      return undefined;
    });
    render(<MemoryRouter><SupplierSettlementsAdmin /></MemoryRouter>);
    await screen.findByText("11.16 ~ 11.22 판매분");
    await act(async () => { fireEvent.click(screen.getByRole("tab", { name: /매일 정산 지급/ })); });
    // 오늘(11월 25일 수요일) 판매분이 먼저
    expect(await screen.findByText("11월 25일(수) 판매분")).toBeTruthy();
    expect(calls.some((call) => call.url.includes("kind=daily&period=2026-11-25"))).toBe(true);
    expect(screen.getAllByText("53,000원").length).toBeGreaterThan(0);
    expect(screen.getByText(/11월 25일\(수\) 판매분은 아직 끝나지 않았어요.*지급 완료 뒤에 들어온 주문은 '금액이 바뀜'으로 알려 드려요/)).toBeTruthy();
    expect(screen.getByText(/그날 판매분을 그날 보내고\(공급사는 입금을 확인한 뒤 출고\)/)).toBeTruthy();
    // 지급 대기(최근 14일): 11월 23일로 옮기기 → '오늘' 버튼으로 돌아오기
    const pending = screen.getByRole("group", { name: "지급 대기 날짜" });
    await act(async () => { fireEvent.click(within(pending).getByRole("button", { name: /11월 23일\(월\) 1곳 · 33,000원/ })); });
    expect(await screen.findByText("11월 23일(월) 판매분")).toBeTruthy();
    expect(calls.some((call) => call.url.includes("kind=daily&period=2026-11-23"))).toBe(true);
    // 하루씩 옮기기(다음 날)
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "다음 날" })); });
    expect(await screen.findByText("11월 24일(화) 판매분")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "오늘" })); });
    expect(await screen.findByText("11월 25일(수) 판매분")).toBeTruthy();
    expect((screen.getByRole("button", { name: "다음 날" }) as HTMLButtonElement).disabled).toBe(true);
    // 지급 완료로
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "지급 완료로" })); });
    const put = calls.find((call) => call.method === "PUT");
    expect(put?.body).toMatchObject({ supplierName: "새벽농장", kind: "daily", period: "2026-11-25", status: "paid" });
    // 다른 지급 주기(주 정산) 공급사 → 그 탭으로
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /주 정산 1곳 · 20,000원/ })); });
    expect(await screen.findByText("11.16 ~ 11.22 판매분")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /주 정산 지급/ }).getAttribute("aria-selected")).toBe("true");
  });
});
