// 공급사 거래명세서(2026-11-26): 관리자 공급사 정산 지급 탭 공급사 카드 오른쪽 위 '거래명세서' → 인보이스 팝업(판매 줄·날짜별 소계·합계),
// 입금 계좌 넣기, PDF·엑셀 내려받기. 공용 규칙(계좌 검사·번호·기간·파일 이름)도 함께 확인합니다.
import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import {
  formatBusinessNumber,
  invoiceFileName,
  invoiceNumber,
  invoicePayoutLabel,
  invoiceReference,
  invoiceWindow,
  parseBankAccount,
  type SupplierInvoice
} from "@repo/shared/supplier-invoice";

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock, Toaster: () => null }));

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
    calls.push({ url, method, body: typeof raw === "string" ? JSON.parse(raw) : raw });
    return handler(url, method, calls[calls.length - 1].body) ?? new Response(JSON.stringify({ ok: false, error: { message: "없는 주소" } }), { status: 404, headers: { "Content-Type": "application/json" } });
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

describe("거래명세서 공용 규칙", () => {
  it("입금 계좌 검사: 숫자·붙임표만, 6~20자리, 세 칸 모두 비우면 지우기", () => {
    expect(parseBankAccount({ bankName: " 국민은행 ", accountNumber: " 123-45-678901 ", accountHolder: "봄날농원" })).toEqual({ value: { bankName: "국민은행", accountNumber: "123-45-678901", accountHolder: "봄날농원" }, error: null });
    expect(parseBankAccount({ bankName: "", accountNumber: "", accountHolder: "" })).toEqual({ value: null, error: null });
    expect(parseBankAccount({ bankName: "국민은행", accountNumber: "12a45", accountHolder: "x" }).error).toBe("계좌번호는 숫자와 붙임표(-)만 써 주세요.");
    expect(parseBankAccount({ bankName: "국민은행", accountNumber: "12345", accountHolder: "x" }).error).toBe("계좌번호 숫자 자리 수를 확인해 주세요(6~20자리).");
    expect(parseBankAccount({ bankName: "", accountNumber: "123456", accountHolder: "x" }).error).toBe("은행 이름을 써 주세요.");
    expect(parseBankAccount({ bankName: "국민은행", accountNumber: "123456", accountHolder: "" }).error).toBe("예금주를 써 주세요.");
  });

  it("번호·기간·지급일·파일 이름", () => {
    const first = invoiceNumber("weekly", "2026-11-16", "대현에벤에셀");
    expect(first).toMatch(/^DF-W261116-[0-9A-Z]{5}$/);
    expect(invoiceNumber("weekly", "2026-11-16", " 대현에벤에셀 ")).toBe(first);
    expect(invoiceNumber("weekly", "2026-11-16", "다미")).not.toBe(first);
    expect(invoiceNumber("monthly", "2026-10", "다미")).toMatch(/^DF-M2610-/);
    expect(invoiceNumber("daily", "2026-11-26", "다미")).toMatch(/^DF-D261126-/);
    expect(invoiceWindow("weekly", "2026-11-16")).toEqual({ start: "2026-11-16", end: "2026-11-22", payoutStart: "2026-11-23", payoutEnd: "2026-11-23" });
    expect(invoiceWindow("monthly", "2026-12")).toEqual({ start: "2026-12-01", end: "2026-12-31", payoutStart: "2027-01-01", payoutEnd: "2027-01-03" });
    expect(invoiceWindow("daily", "2026-11-26")).toEqual({ start: "2026-11-26", end: "2026-11-26", payoutStart: "2026-11-26", payoutEnd: "2026-11-26" });
    expect(invoicePayoutLabel({ payoutStart: "2026-11-23", payoutEnd: "2026-11-23" })).toBe("2026.11.23(월)");
    expect(invoicePayoutLabel({ payoutStart: "2026-12-01", payoutEnd: "2026-12-03" })).toBe("2026.12.01 ~ 12.03");
    expect(invoiceReference({ kind: "monthly", start: "2026-10-01", end: "2026-10-31" })).toBe("2026.10월 월 정산 거래 금액");
    expect(invoiceFileName({ supplierName: "주식회사 대현/에벤에셀", kind: "weekly", start: "2026-11-16", end: "2026-11-22" }, "pdf")).toBe("두고푸드_거래명세서_주식회사 대현 에벤에셀_2026-11-16~11-22.pdf");
    expect(invoiceFileName({ supplierName: "다미", kind: "monthly", start: "2026-10-01", end: "2026-10-31" }, "xlsx")).toBe("두고푸드_거래명세서_다미_2026-10.xlsx");
    expect(formatBusinessNumber("1234567890")).toBe("123-45-67890");
    expect(formatBusinessNumber("")).toBe("");
  });
});

const base = { registered: true, hasAccount: true, explicit: true, saleAmount: 0, returnAmount: 0, costAmount: 0, costMissing: 0, quantity: 3, orders: 2, paidAt: null, doneAt: null, memo: null, updatedAt: null, updatedBy: null, recorded: null, changedAfterRecord: false, status: "pending" };
const weekly = {
  kind: "weekly", period: "2026-11-16", start: "2026-11-16", end: "2026-11-22", payoutFrom: "2026-11-23", payoutTo: "2026-11-23", closed: true,
  rows: [
    { ...base, supplierName: "주식회사 대현에벤에셀", supplierId: "sup-d", type: "commission", cycle: "weekly", commissionRate: 10, netAmount: 60000, goodsAmount: 60000, shippingFee: 3500, payoutAmount: 63500, commission: 6000, netIncome: 57500, doogoProfit: 6000 },
    { ...base, supplierName: "(공급사 미지정)", supplierId: null, registered: false, hasAccount: false, type: "commission", cycle: "weekly", commissionRate: 10, netAmount: 5000, goodsAmount: 5000, shippingFee: 0, payoutAmount: 5000, commission: 500, netIncome: 4500, doogoProfit: 500 }
  ],
  totals: { netAmount: 65000, goodsAmount: 65000, shippingFee: 3500, payoutAmount: 68500, commission: 6500, doogoProfit: 6500, done: 0, paid: 0, pending: 2 },
  otherCycle: { suppliers: 0, payoutAmount: 0 },
  sync: null
};

function invoiceData(bank: SupplierInvoice["bank"]): SupplierInvoice {
  const party = { name: "", brand: "", businessNumber: "", ceoName: "", address: "", phone: "", email: "", businessType: "", businessItem: "", website: "" };
  return {
    number: "DF-W261116-ABCDE", issueDate: "2026-11-26", kind: "weekly", period: "2026-11-16", start: "2026-11-16", end: "2026-11-22", payoutStart: "2026-11-23", payoutEnd: "2026-11-23",
    supplierName: "주식회사 대현에벤에셀", settings: { type: "commission", commissionRate: 10, cycle: "weekly" }, status: "pending", paidAt: null,
    from: { ...party, name: "(주) 두고홀딩스", brand: "DOOGO FOOD", businessNumber: "726-87-03167", ceoName: "문원오", address: "세종특별자치시 갈매로 353", website: "doogofood.site" },
    to: { ...party, name: "주식회사 대현에벤에셀", businessNumber: "123-45-67890", ceoName: "홍대표", supplierId: "sup-d", registered: true },
    bank,
    lines: [
      { id: "l1", date: "2026-11-16", orderedAt: "2026-11-16T01:00:00Z", orderId: "ORD-1", buyer: "하루마켓", productCode: "P-1", productName: "청송 사과 5kg", orderedQuantity: 2, quantity: 2, returnQuantity: 0, unitPrice: 20000, amount: 40000, shippingFee: 3500, total: 43500, costMissing: false },
      { id: "l2", date: "2026-11-18", orderedAt: null, orderId: "ORD-2", buyer: "봄상회", productCode: null, productName: "신고배 7.5kg", orderedQuantity: 2, quantity: 1, returnQuantity: 1, unitPrice: 20000, amount: 20000, shippingFee: 0, total: 20000, costMissing: false }
    ],
    days: [
      { date: "2026-11-16", lines: 1, orders: 1, quantity: 2, goodsAmount: 40000, shippingFee: 3500, total: 43500 },
      { date: "2026-11-18", lines: 1, orders: 1, quantity: 1, goodsAmount: 20000, shippingFee: 0, total: 20000 }
    ],
    totals: { goodsAmount: 60000, shippingFee: 3500, total: 63500, quantity: 3, returnQuantity: 1, orders: 2, lines: 2, costMissing: 0 },
    settlement: { goodsAmount: 60000, shippingFee: 3500, payoutAmount: 63500, matches: true },
    commission: { rate: 10, amount: 6000 },
    warnings: bank ? [] : ["공급사 입금 계좌가 없어요. 아래 '입금 계좌'에서 넣어 주세요."],
    notes: ["2026.11.16 ~ 2026.11.22 판매분 → 2026.11.23(월) 입금(월~일 판매분 → 다음 주 월요일)", "판매수수료 10%: 판매 대금 100%와 배송비 100%를 입금합니다."]
  };
}

describe("관리자 공급사 정산: 거래명세서 팝업", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-26T03:00:00.000Z"));
  });

  it("공급사 카드의 '거래명세서' → 판매 줄·날짜별 소계·지급 합계, 입금 계좌 넣기, PDF·엑셀 받기(판매 수수료 탭에는 버튼 없음)", async () => {
    let bank: SupplierInvoice["bank"] = null;
    const calls = stubApi((url, method, body) => {
      if (url.includes("/settlements/invoice/file")) return new Response(new Blob(["%PDF-"]), { status: 200, headers: { "Content-Type": url.includes("format=pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(url.includes("format=pdf") ? "두고푸드_거래명세서_주식회사 대현에벤에셀_2026-11-16~11-22.pdf" : "두고푸드_거래명세서_주식회사 대현에벤에셀_2026-11-16~11-22.xlsx")}` } });
      if (url.includes("/settlements/invoice")) return json(invoiceData(bank));
      if (url.includes("/settlements/bank-account") && method === "PUT") {
        const value = body as { bankName: string; accountNumber: string; accountHolder: string };
        bank = { bankName: value.bankName, accountNumber: value.accountNumber, accountHolder: value.accountHolder };
        return json({ bank });
      }
      if (url.includes("/baljuora/admin/settlements") && method === "GET") return json(url.includes("kind=fee") ? { ...weekly, kind: "fee", period: "2026-10", rows: [{ ...weekly.rows[0], invoice: { issued: false, issuedAt: null, amount: null }, taxProblems: [] }], invoice: null } : weekly);
      return undefined;
    });
    const downloads: string[] = [];
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:test", revokeObjectURL: () => undefined }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
    render(<MemoryRouter><SupplierSettlementsAdmin /></MemoryRouter>);
    expect(await screen.findByText("63,500원")).toBeTruthy();
    // 공급사 이름이 없는 판매 줄에는 버튼이 없음
    const buttons = screen.getAllByRole("button", { name: /거래명세서 보기/ });
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(["주식회사 대현에벤에셀 거래명세서 보기"]);

    fireEvent.click(buttons[0]);
    const dialog = await screen.findByRole("dialog", { name: "주식회사 대현에벤에셀" });
    await within(dialog).findByText("INVOICE");
    expect(calls.some((call) => call.url.includes("/settlements/invoice?kind=weekly&period=2026-11-16&supplier=%EC%A3%BC%EC%8B%9D%ED%9A%8C%EC%82%AC"))).toBe(true);
    expect(within(dialog).getByText("# DF-W261116-ABCDE")).toBeTruthy();
    expect(within(dialog).getAllByText("₩63,500").length).toBe(3); // 머리 지급 합계 · 총합계 · 지급 합계
    expect(within(dialog).getByText("하루마켓")).toBeTruthy();
    expect(within(dialog).getByText("청송 사과 5kg")).toBeTruthy();
    expect(within(dialog).getByText("P-1 · 주문 ORD-1")).toBeTruthy();
    expect(within(dialog).getByText("반품 1")).toBeTruthy();
    expect(within(dialog).getByText("11.16(월) 소계 · 주문 1건")).toBeTruthy();
    expect(within(dialog).getByText("11.18(수) 소계 · 주문 1건")).toBeTruthy();
    expect(within(dialog).getByText("공급사 입금 계좌가 없어요. 아래 '입금 계좌'에서 넣어 주세요.")).toBeTruthy();
    expect(within(dialog).getByText("판매 수수료 10%는 빼지 않았어요(다음 달 1~3일 따로 청구).")).toBeTruthy();

    // 입금 계좌 넣기(예금주 기본값 = 공급사 이름) → 저장 → 다시 불러옴
    fireEvent.click(within(dialog).getByRole("button", { name: /입금 계좌 넣기/ }));
    const form = within(dialog).getByRole("form", { name: "공급사 입금 계좌" });
    expect((within(form).getByLabelText("예금주") as HTMLInputElement).value).toBe("주식회사 대현에벤에셀");
    fireEvent.change(within(form).getByLabelText("은행"), { target: { value: "국민은행" } });
    fireEvent.change(within(form).getByLabelText("계좌번호"), { target: { value: "12x" } });
    fireEvent.click(within(form).getByRole("button", { name: "저장" }));
    expect(toastMock.error).toHaveBeenCalledWith("계좌번호는 숫자와 붙임표(-)만 써 주세요.");
    fireEvent.change(within(form).getByLabelText("계좌번호"), { target: { value: "123-45-678901" } });
    fireEvent.click(within(form).getByRole("button", { name: "저장" }));
    await within(dialog).findByText("국민은행 123-45-678901 (예금주 주식회사 대현에벤에셀)");
    expect(calls.find((call) => call.url.includes("/settlements/bank-account"))?.body).toEqual({ supplierId: "sup-d", bankName: "국민은행", accountNumber: "123-45-678901", accountHolder: "주식회사 대현에벤에셀" });
    expect(within(dialog).getByText("ACCOUNT NUMBER · 계좌번호 : 123-45-678901")).toBeTruthy();

    // PDF · 엑셀 받기
    fireEvent.click(within(dialog).getByRole("button", { name: "PDF 다운로드" }));
    await waitFor(() => expect(downloads).toEqual(["두고푸드_거래명세서_주식회사 대현에벤에셀_2026-11-16~11-22.pdf"]));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "엑셀 다운로드" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(within(dialog).getByRole("button", { name: "엑셀 다운로드" }));
    await waitFor(() => expect(downloads[1]).toBe("두고푸드_거래명세서_주식회사 대현에벤에셀_2026-11-16~11-22.xlsx"));
    expect(calls.filter((call) => call.url.includes("/settlements/invoice/file")).map((call) => call.url.split("format=")[1])).toEqual(["pdf", "xlsx"]);

    // Esc로 닫기
    await act(async () => { fireEvent.keyDown(window, { key: "Escape" }); });
    expect(screen.queryByRole("dialog", { name: "주식회사 대현에벤에셀" })).toBeNull();

    // 판매 수수료 탭에는 거래명세서 버튼이 없음
    fireEvent.click(screen.getByRole("tab", { name: /판매 수수료 청구/ }));
    await screen.findByText("판매 대금");
    expect(screen.queryAllByRole("button", { name: /거래명세서 보기/ })).toHaveLength(0);
    click.mockRestore();
  });
});
