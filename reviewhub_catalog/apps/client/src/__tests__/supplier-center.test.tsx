// 공급사 센터(2026-11-20): 공용 정산·변경 항목 계산, 공급사 "내 상품" 변경 요청, 판매·정산 달력,
// 관리자 "변경 요청" 승인, 공급사 로그인 실패 안내.
import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import {
  formatPayoutLabel,
  formatPeriodLabel,
  settlementPeriodFor,
  supplierChangeRows,
  supplierCommission,
  upcomingSettlement
} from "@repo/shared/supplier-portal";

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock, Toaster: () => null }));

// 로그인 클라이언트(better-auth)는 네트워크를 직접 쓰므로 이 파일에서는 가짜로 바꿉니다.
const authMock = vi.hoisted(() => ({
  signIn: vi.fn(async () => ({ error: { status: 401, code: "INVALID_USERNAME_OR_PASSWORD", message: "Invalid username or password" } }))
}));
vi.mock("@/lib/auth", () => ({
  getAuthToken: () => "",
  setAuthToken: () => undefined,
  clearAuthToken: () => undefined,
  syncAuthTokenFromResult: () => ({ token: "" }),
  authClient: {
    useSession: () => ({ data: null, isPending: false, refetch: async () => undefined }),
    signIn: { username: authMock.signIn },
    signOut: async () => undefined,
    getSession: async () => ({ data: null })
  }
}));

import { SupplierProducts } from "@/pages/supplier/SupplierProducts";
import { SupplierSales } from "@/pages/supplier/SupplierSales";
import { SupplierLoginPage } from "@/pages/supplier/SupplierCenter";
import { SupplierRequestsAdmin } from "@/pages/admin/SupplierPortalAdmin";

type Call = { url: string; method: string; body: unknown };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify({ ok: status < 400, data }), { status, headers: { "Content-Type": "application/json" } });
}

function urlOf(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function stubApi(handler: (url: string, method: string, body: unknown) => Response | undefined) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
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
  toastMock.mockClear();
  toastMock.success.mockClear();
  toastMock.error.mockClear();
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

describe("공용 정산·변경 항목 계산", () => {
  it("월 정산은 그 달 1일~말일 → 다음 달 1~3일, 주 정산은 월~일 → 다음 주 월요일", () => {
    const monthly = settlementPeriodFor("2026-11-20", "monthly");
    expect(monthly).toMatchObject({ start: "2026-11-01", end: "2026-11-30", payoutStart: "2026-12-01", payoutEnd: "2026-12-03" });
    expect(formatPayoutLabel(monthly)).toBe("12월 1~3일");
    expect(formatPeriodLabel(monthly)).toBe("11.1 ~ 11.30");
    const weekly = settlementPeriodFor("2026-11-20", "weekly");
    expect(weekly).toMatchObject({ start: "2026-11-16", end: "2026-11-22", payoutStart: "2026-11-23", payoutEnd: "2026-11-23" });
    expect(formatPayoutLabel(weekly)).toBe("11월 23일(월)");
    // 지난달 입금 기간(1~3일)이 아직 남아 있으면 그 정산이 "다음 입금"
    expect(upcomingSettlement("2026-12-02", "monthly").start).toBe("2026-11-01");
    expect(upcomingSettlement("2026-12-04", "monthly").start).toBe("2026-12-01");
    expect(supplierCommission(1717800, 10)).toBe(171780);
    expect(supplierCommission(-5000, 10)).toBe(0);
  });

  it("수정 요청은 바뀐 칸만, 신규 등록은 빈 칸(이미지 없음·자율 판매가 금액)을 빼고 보여 줍니다", () => {
    const update = supplierChangeRows({ costPrice: 17000, salePriceMode: "autonomous", salePrice: null }, { costPrice: 16000, salePriceMode: "autonomous", salePrice: null });
    expect(update).toEqual([{ field: "costPrice", label: "공급가", before: "16,000원", after: "17,000원" }]);
    const create = supplierChangeRows({ name: "봄날 꿀사과 5kg", imageUrl: null, costPrice: 23000, salePriceMode: "autonomous", salePrice: null, isAlwaysOnSale: false, saleStartMonth: 10, saleEndMonth: 2 }, null);
    expect(create.map((row) => row.label)).toEqual(["상품명", "공급가", "권장 판매가 방식", "판매 기간 방식", "판매 시작월", "판매 종료월"]);
    expect(create.find((row) => row.field === "isAlwaysOnSale")?.after).toBe("기간 판매");
  });
});

const products = [
  {
    id: "p-melon", productCode: "ass633", name: "당도선별 머스크메론 3.2kg 2수", imageUrl: null, origin: "국내산", costPrice: 16000,
    salePrice: null, salePriceMode: "autonomous", saleStartMonth: null, saleEndMonth: null, isAlwaysOnSale: true,
    shippingType: "domestic", categoryId: "c-produce", categoryName: "🥕 농산", isVisible: true, isSoldOut: false, isSeasonEnded: false,
    createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z", pendingRequestId: null
  },
  {
    id: "p-potato", productCode: "ass00024", name: "해남 호박고구마 2kg", imageUrl: null, origin: null, costPrice: 5600,
    salePrice: 9900, salePriceMode: "fixed", saleStartMonth: 9, saleEndMonth: 4, isAlwaysOnSale: false,
    shippingType: "domestic", categoryId: "c-produce", categoryName: "🥕 농산", isVisible: true, isSoldOut: true, isSeasonEnded: false,
    createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z", pendingRequestId: null
  }
];

describe("공급사 내 상품 · 변경 요청", () => {
  it("목록에 공급가·권장 판매가를 보여 주고, 바꾼 칸만 변경 요청으로 보냅니다", async () => {
    const calls = stubApi((url, method) => {
      if (url.includes("/supplier/products") && method === "GET") return json({ products });
      if (url.includes("/supplier/requests") && method === "GET") return json({ requests: [] });
      if (url.includes("/supplier/requests") && method === "POST") return json({ request: { id: "r1" }, replaced: false }, 201);
      return undefined;
    });
    const onChanged = vi.fn();
    render(<MemoryRouter><SupplierProducts reloadKey={0} onCreate={vi.fn()} onChanged={onChanged} /></MemoryRouter>);
    expect(await screen.findByText("당도선별 머스크메론 3.2kg 2수")).toBeTruthy();
    expect(screen.getByText("16,000원")).toBeTruthy();
    expect(screen.getByText("9,900원")).toBeTruthy();
    expect(screen.getAllByText("품절").length).toBeGreaterThan(0);

    const melonRow = screen.getByText("당도선별 머스크메론 3.2kg 2수").closest("tr") as HTMLElement;
    fireEvent.click(within(melonRow).getByRole("button", { name: /변경 요청/ }));
    const dialog = await screen.findByRole("dialog");
    // 아무것도 안 바꾸고 보내면 안내
    fireEvent.click(within(dialog).getByRole("button", { name: /변경 요청 보내기/ }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("바뀐 내용이 없어요");

    const costInput = within(dialog).getByPlaceholderText("1개 공급가") as HTMLInputElement;
    fireEvent.change(costInput, { target: { value: "17,000" } });
    expect(costInput.value).toBe("17,000");
    expect(within(dialog).getByText(/바뀌는 항목/).textContent).toContain("1개");
    fireEvent.click(within(dialog).getByRole("button", { name: /변경 요청 보내기/ }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const post = calls.find((call) => call.method === "POST");
    expect(post?.body).toEqual({ kind: "update", productId: "p-melon", changes: { costPrice: 17000 }, note: null });
  });

  it("지정 판매가를 고르고 금액을 비우면 보내지 않고 안내합니다", async () => {
    stubApi((url, method) => {
      if (url.includes("/supplier/products") && method === "GET") return json({ products });
      if (url.includes("/supplier/requests") && method === "GET") return json({ requests: [] });
      return undefined;
    });
    render(<MemoryRouter><SupplierProducts reloadKey={0} onCreate={vi.fn()} onChanged={vi.fn()} /></MemoryRouter>);
    const row = (await screen.findByText("당도선별 머스크메론 3.2kg 2수")).closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /변경 요청/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByDisplayValue("판매자 자율"), { target: { value: "fixed" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /변경 요청 보내기/ }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("권장 판매가를 입력해 주세요");
  });
});

describe("공급사 판매·정산 달력", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T03:00:00.000Z"));
  });

  it("날짜별 판매·반품과 정산 입금일을 보여 주고, 날짜를 누르면 그날 내역", async () => {
    const totals = { saleAmount: 280000, saleQuantity: 20, returnAmount: 20000, returnQuantity: 1, orderCount: 18, netAmount: 260000, commission: 26000, payoutAmount: 260000, netIncome: 234000 };
    stubApi((url) => {
      if (url.includes("/supplier/sales")) {
        return json({
          month: "2026-11", today: "2026-11-20", cycle: "monthly", commissionRate: 10, hasAnySales: true, totals,
          days: [
            { date: "2026-11-02", saleAmount: 115400, saleQuantity: 14, returnAmount: 0, returnQuantity: 0, orderCount: 14, netAmount: 115400 },
            { date: "2026-11-06", saleAmount: 95000, saleQuantity: 6, returnAmount: 20000, returnQuantity: 1, orderCount: 4, netAmount: 75000 }
          ],
          ranking: [{ productId: "p-melon", productCode: "ass633", productName: "당도선별 머스크메론 3.2kg 2수", quantity: 20, amount: 280000, returnQuantity: 1, returnAmount: 20000, netAmount: 260000, netQuantity: 19 }],
          settlements: [{ cycle: "monthly", start: "2026-11-01", end: "2026-11-30", payoutStart: "2026-12-01", payoutEnd: "2026-12-03", netAmount: 260000, commission: 26000, payoutAmount: 260000, netIncome: 234000 }],
          payoutDays: [{ date: "2026-11-01", endDate: "2026-11-03", periodStart: "2026-10-01", periodEnd: "2026-10-31", amount: 2782200, done: true }]
        });
      }
      return undefined;
    });
    render(<MemoryRouter><SupplierSales /></MemoryRouter>);
    expect(await screen.findByText("2026년 11월")).toBeTruthy();
    expect(screen.getByRole("button", { name: /11월 1일\(일\).*정산 입금 2,782,200원/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /11월 6일\(금\).*반품 20,000원/ })).toBeTruthy();
    // 실 수령 예상 = 정산 대상 260,000 − 수수료 26,000
    expect(screen.getAllByText("234,000원").length).toBeGreaterThan(0);
    expect(screen.getAllByText("12월 1~3일 입금").length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^11월 2일\(월\)/ }));
    });
    const dayCard = screen.getByRole("heading", { name: "11월 2일(월)" }).closest("section") as HTMLElement;
    // 판매 금액·순매출(반품 없음) 두 줄
    expect(within(dayCard).getAllByText("115,400원")).toHaveLength(2);
    expect(within(dayCard).getByText("14건 · 14개")).toBeTruthy();
  });
});

describe("관리자 변경 요청 승인", () => {
  it("검토 창에서 마진 버튼으로 수강생 단가·일반공급가를 채워 승인합니다", async () => {
    const request = {
      id: "req-1", supplierId: "s1", supplierName: "봄날농원", productId: "p-melon", productName: "당도선별 머스크메론 3.2kg 2수",
      kind: "update", status: "pending", changes: { costPrice: 17000 }, snapshot: { costPrice: 16000 }, note: "12월부터 인상",
      reviewNote: null, reviewedBy: null, reviewedAt: null, createdAt: "2026-11-20T01:00:00.000Z", updatedAt: "2026-11-20T01:00:00.000Z",
      current: { id: "p-melon", productCode: "ass633", name: "당도선별 머스크메론 3.2kg 2수", imageUrl: null, costPrice: 16000, aPrice: 17800, generalPrice: 20000, salePrice: null, salePriceMode: "autonomous", categoryId: "c-produce", isVisible: true, isSoldOut: false, deletedAt: null }
    };
    let approved = false;
    const calls = stubApi((url, method) => {
      if (url.includes("/catalog/admin/supplier-requests/req-1/approve") && method === "POST") {
        approved = true;
        return json({ request: { ...request, status: "approved" } });
      }
      if (url.includes("/catalog/admin/supplier-requests") && method === "GET") {
        return json({ requests: approved ? [] : [request], counts: { pending: approved ? 0 : 1, approved: approved ? 1 : 0, rejected: 0, cancelled: 0 }, categories: [], shippingPolicies: [] });
      }
      return undefined;
    });
    const onChanged = vi.fn();
    render(<MemoryRouter><SupplierRequestsAdmin onChanged={onChanged} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /검토하기/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("12월부터 인상")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: /마진으로 계산/ }));
    expect((within(dialog).getByDisplayValue("18,900") as HTMLInputElement).value).toBe("18,900");
    expect((within(dialog).getByDisplayValue("21,300") as HTMLInputElement).value).toBe("21,300");
    fireEvent.click(within(dialog).getByRole("button", { name: /승인하고 반영/ }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const post = calls.find((call) => call.method === "POST");
    expect(post?.body).toEqual({ aPrice: 18900, generalPrice: 21300, costPrice: null, note: null });
    expect(await screen.findByText("승인을 기다리는 요청이 없어요.")).toBeTruthy();
  });
});

describe("공급사 로그인", () => {
  it("아이디·비밀번호가 틀리면 한국어로 안내합니다", async () => {
    stubApi(() => undefined);
    render(<MemoryRouter initialEntries={["/supplier"]}><SupplierLoginPage /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText("아이디"), { target: { value: "sup" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("아이디 또는 비밀번호가 맞지 않아요."));
    expect(authMock.signIn).toHaveBeenCalledWith({ username: "sup", password: "wrong" });
  });
});
