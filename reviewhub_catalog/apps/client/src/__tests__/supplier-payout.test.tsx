// 공급사 필수 정보(사업자등록번호 · 정산 계좌, 2026-11-27): 공용 규칙(검증 숫자·끝 4자리·바뀐 칸·주문번호) ·
// 공급사 센터 닫을 수 없는 팝업 · 내 정보 칸 수정 · 관리자 오른쪽 아래 알림 창 · 공급사 관리 변경 기록.
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { orderNumberOf } from "@repo/shared/supplier-invoice";
import {
  isValidBusinessNumber,
  maskedBankLabel,
  missingSupplierProfile,
  parseBusinessNumber,
  parseRequiredBankAccount,
  profileChangeSummary,
  profileChangeText,
  type SupplierProfileChange
} from "@repo/shared/supplier-profile";

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock, Toaster: () => null }));

import { SupplierPayoutCard, SupplierPayoutGate } from "@/pages/supplier/supplier-payout";
import type { SupplierProfile } from "@/pages/supplier/supplier-api";
import { SupplierProfileAlert, SupplierProfileChangeLog } from "@/pages/admin/supplier-profile-alerts";

type Call = { url: string; method: string; body: unknown };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify({ ok: status < 400, data, error: status >= 400 ? { message: String((data as { message?: string })?.message ?? "오류") } : undefined }), { status, headers: { "Content-Type": "application/json" } });
}

function stubApi(handler: (url: string, method: string, body: unknown) => Response | undefined) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const raw = init?.body ?? null;
    calls.push({ url, method, body: typeof raw === "string" ? JSON.parse(raw) : raw });
    return handler(url, method, calls[calls.length - 1].body) ?? json({ message: "없는 주소" }, 404);
  }));
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  toastMock.success.mockClear();
  toastMock.error.mockClear();
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

const BANK = { bankName: "농협은행", accountNumber: "302-1234-5678-91", accountHolder: "바른농장" };

function profile(payout: SupplierProfile["payout"]): SupplierProfile {
  return {
    supplier: { id: "sup-p", name: "바른농장", representative: "김바른", phone: null, email: null, address: null, businessNumber: payout?.businessNumber ?? null },
    account: { id: "acc-1", username: "barun", isActive: true, commissionRate: 10, settlementCycle: "weekly", lastLoginAt: null, createdAt: "2026-11-20T00:00:00Z" },
    payout
  };
}

describe("공급사 필수 정보 공용 규칙", () => {
  it("사업자등록번호: 숫자 10자리 + 검증 숫자, 붙임표 모양으로 정리", () => {
    expect(parseBusinessNumber("726-87-03167")).toEqual({ value: "726-87-03167", error: null });
    expect(parseBusinessNumber(" 2208162517 ")).toEqual({ value: "220-81-62517", error: null });
    expect(parseBusinessNumber("220 81 62517").value).toBe("220-81-62517");
    expect(parseBusinessNumber("220-81-62518").error).toBe("사업자등록번호를 다시 확인해 주세요. 숫자가 하나 틀린 것 같아요.");
    expect(parseBusinessNumber("220-81-625").error).toBe("사업자등록번호는 숫자 10자리예요(예: 123-45-67890).");
    expect(parseBusinessNumber("220-81-6251a").error).toBe("사업자등록번호는 숫자와 붙임표(-)만 써 주세요.");
    expect(parseBusinessNumber("").error).toBe("사업자등록번호를 써 주세요.");
    expect(isValidBusinessNumber("123-45-67890")).toBe(false);
    expect(isValidBusinessNumber(null)).toBe(false);
  });

  it("정산 계좌는 세 칸 모두 필요, 빠진 칸 · 끝 4자리 · 바뀐 칸", () => {
    expect(parseRequiredBankAccount({ bankName: "", accountNumber: "", accountHolder: "" }).error).toBe("정산 받을 계좌(은행·계좌번호·예금주)를 써 주세요.");
    expect(parseRequiredBankAccount(BANK)).toEqual({ value: BANK, error: null });
    expect(missingSupplierProfile({ businessNumber: null, bank: null })).toEqual(["businessNumber", "bank"]);
    expect(missingSupplierProfile({ businessNumber: "123-45-67890", bank: BANK })).toEqual(["businessNumber"]);
    expect(missingSupplierProfile({ businessNumber: "220-81-62517", bank: BANK })).toEqual([]);
    expect(maskedBankLabel(BANK)).toBe("농협은행 ···7891 (예금주 바른농장)");
    expect(maskedBankLabel(null)).toBeNull();

    const first = profileChangeSummary({ businessNumber: null, bank: null }, { businessNumber: "220-81-62517", bank: BANK });
    expect(first).toEqual({ fields: ["businessNumber", "bank"], summary: { businessNumber: { before: null, after: "220-81-62517" }, bank: { before: null, after: "농협은행 ···7891 (예금주 바른농장)" } } });
    expect(profileChangeText(first)).toBe("사업자등록번호 등록 · 정산 계좌 등록");
    // 붙임표만 다른 같은 번호·같은 계좌는 바뀐 것이 아님
    expect(profileChangeSummary({ businessNumber: "2208162517", bank: BANK }, { businessNumber: "220-81-62517", bank: { ...BANK } })).toEqual({ fields: [], summary: {} });
    const moved = profileChangeSummary({ businessNumber: "220-81-62517", bank: BANK }, { businessNumber: "220-81-62517", bank: { ...BANK, accountNumber: "110-555-123456" } });
    expect(moved.fields).toEqual(["bank"]);
    expect(profileChangeText(moved)).toBe("정산 계좌 변경");
    expect(JSON.stringify(moved)).not.toContain("123456");
  });

  it("주문번호: 긴 주문 코드 → 6자리(같은 코드는 늘 같은 번호, 헷갈리는 글자 없음)", () => {
    const code = "01a1e17e-159c-76b5-b68f-ab511d67e794";
    expect(orderNumberOf(code)).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{6}$/);
    expect(orderNumberOf(code)).toBe(orderNumberOf(` ${code.toUpperCase()} `));
    expect(orderNumberOf(code)).not.toBe(orderNumberOf("01a1e1dd-bfbb-72cb-92b2-47499697fad6"));
    expect(orderNumberOf(null)).toBe("");
    // 1,000개 주문에서 겹치지 않음
    const numbers = new Set(Array.from({ length: 1000 }, (_, index) => orderNumberOf(`01a1e17e-159c-76b5-b68f-${index.toString(16).padStart(12, "0")}`)));
    expect(numbers.size).toBe(1000);
  });
});

describe("공급사 센터: 사업자등록번호 · 정산 계좌 팝업", () => {
  it("닫기 버튼 없이 뜨고, 칸마다 틀린 곳을 알려 주며, 저장하면 붙임표 모양으로 PUT /supplier/payout", async () => {
    const calls = stubApi((url, method, body) => {
      if (url.endsWith("/api/supplier/payout") && method === "PUT") {
        const value = body as typeof BANK & { businessNumber: string };
        return json({ payout: { businessNumber: "220-81-62517", bank: { bankName: value.bankName, accountNumber: value.accountNumber, accountHolder: value.accountHolder }, missing: [], changed: ["businessNumber", "bank"] } });
      }
      return undefined;
    });
    const onSaved = vi.fn();
    const onSignOut = vi.fn();
    render(<SupplierPayoutGate profile={profile({ businessNumber: null, bank: null, missing: ["businessNumber", "bank"] })} onSaved={onSaved} onSignOut={onSignOut} />);
    const dialog = screen.getByRole("dialog", { name: "정산 정보를 등록해 주세요" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(within(dialog).queryByRole("button", { name: /닫기/ })).toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
    // 처음 빈 칸(사업자등록번호)에 커서
    expect(document.activeElement?.getAttribute("name")).toBe("businessNumber");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();

    // 빈 채로 저장 → 칸마다 안내, 서버는 부르지 않음
    fireEvent.click(within(dialog).getByRole("button", { name: /저장하고 시작하기/ }));
    expect(await within(dialog).findByText("사업자등록번호를 써 주세요.")).toBeTruthy();
    expect(within(dialog).getByText("은행 이름을 써 주세요.")).toBeTruthy();
    expect(within(dialog).getByText("계좌번호를 써 주세요.")).toBeTruthy();
    expect(within(dialog).getByText("예금주를 써 주세요.")).toBeTruthy();
    expect(calls).toHaveLength(0);

    const number = within(dialog).getByLabelText("사업자등록번호") as HTMLInputElement;
    fireEvent.change(number, { target: { value: "2208162518" } });
    expect(number.value).toBe("220-81-62518");
    fireEvent.change(within(dialog).getByLabelText("은행"), { target: { value: BANK.bankName } });
    fireEvent.change(within(dialog).getByLabelText("계좌번호"), { target: { value: BANK.accountNumber } });
    fireEvent.change(within(dialog).getByLabelText("예금주"), { target: { value: BANK.accountHolder } });
    fireEvent.click(within(dialog).getByRole("button", { name: /저장하고 시작하기/ }));
    expect(await within(dialog).findByText("사업자등록번호를 다시 확인해 주세요. 숫자가 하나 틀린 것 같아요.")).toBeTruthy();
    expect(number.getAttribute("aria-invalid")).toBe("true");
    expect(calls).toHaveLength(0);

    fireEvent.change(number, { target: { value: "220-81-62517" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /저장하고 시작하기/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(calls).toEqual([{ url: expect.stringContaining("/api/supplier/payout"), method: "PUT", body: { businessNumber: "220-81-62517", ...BANK } }]);
    expect(onSaved).toHaveBeenCalledWith({ businessNumber: "220-81-62517", bank: BANK, missing: [] });
    expect(toastMock.success).toHaveBeenCalledWith(expect.stringContaining("정산 정보를 저장했어요"));

    fireEvent.click(within(dialog).getByRole("button", { name: /지금은 로그아웃/ }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("관리자가 넣어 둔 번호가 틀리면 그 값을 채운 채 다시 확인하라고 알려 줍니다", () => {
    render(<SupplierPayoutGate profile={profile({ businessNumber: "123-45-67890", bank: BANK, missing: ["businessNumber"] })} onSaved={vi.fn()} onSignOut={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/지금 등록된 사업자등록번호가 맞지 않아요/)).toBeTruthy();
    expect((within(dialog).getByLabelText("사업자등록번호") as HTMLInputElement).value).toBe("123-45-67890");
    expect((within(dialog).getByLabelText("계좌번호") as HTMLInputElement).value).toBe(BANK.accountNumber);
  });

  it("서버가 거절하면 안내만 하고 팝업은 그대로", async () => {
    stubApi((url, method) => (url.endsWith("/api/supplier/payout") && method === "PUT" ? json({ message: "사업자등록번호를 다시 확인해 주세요." }, 400) : undefined));
    const onSaved = vi.fn();
    render(<SupplierPayoutGate profile={profile({ businessNumber: "220-81-62517", bank: BANK, missing: ["bank"] })} onSaved={onSaved} onSignOut={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /저장하고 시작하기/ }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("사업자등록번호를 다시 확인해 주세요."));
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("공급사 센터 내 정보: 사업자등록번호 · 정산 계좌 칸", () => {
  it("값을 보여 주고 '수정' → 저장하면 새 값, 취소하면 그대로", async () => {
    const calls = stubApi((url, method, body) => {
      if (url.endsWith("/api/supplier/payout") && method === "PUT") {
        const value = body as typeof BANK & { businessNumber: string };
        return json({ payout: { businessNumber: value.businessNumber, bank: { bankName: value.bankName, accountNumber: value.accountNumber, accountHolder: value.accountHolder }, missing: [], changed: ["bank"] } });
      }
      return undefined;
    });
    const onSaved = vi.fn();
    render(<SupplierPayoutCard profile={profile({ businessNumber: "220-81-62517", bank: BANK, missing: [] })} onSaved={onSaved} />);
    const card = screen.getByRole("region", { name: "사업자등록번호 · 정산 계좌" });
    expect(card.textContent).toContain("220-81-62517");
    expect(card.textContent).toContain("302-1234-5678-91");
    fireEvent.click(within(card).getByRole("button", { name: /수정/ }));
    fireEvent.click(within(card).getByRole("button", { name: "취소" }));
    expect(within(card).queryByLabelText("계좌번호")).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: /수정/ }));
    fireEvent.change(within(card).getByLabelText("은행"), { target: { value: "신한은행" } });
    fireEvent.change(within(card).getByLabelText("계좌번호"), { target: { value: "110-555-123456" } });
    fireEvent.click(within(card).getByRole("button", { name: /^저장$/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(calls[0].body).toEqual({ businessNumber: "220-81-62517", bankName: "신한은행", accountNumber: "110-555-123456", accountHolder: "바른농장" });
    expect(toastMock.success).toHaveBeenCalledWith(expect.stringContaining("다음 정산부터"));
  });
});

const CHANGES: SupplierProfileChange[] = [
  { id: "c2", supplierId: "sup-p", supplierName: "바른농장", changedBy: "barun", fields: ["bank"], summary: { bank: { before: "농협은행 ···7891 (예금주 바른농장)", after: "신한은행 ···3456 (예금주 김바른)" } }, checkedAt: null, checkedBy: null, createdAt: "2026-11-27T05:02:00.000Z" },
  { id: "c1", supplierId: "sup-q", supplierName: "햇살농원", changedBy: "sunny", fields: ["businessNumber", "bank"], summary: { businessNumber: { before: null, after: "220-81-62517" }, bank: { before: null, after: "국민은행 ···1111 (예금주 햇살농원)" } }, checkedAt: null, checkedBy: null, createdAt: "2026-11-27T01:00:00.000Z" }
];

describe("관리자: 공급사 정보 변경 알림", () => {
  it("확인 전 알림이 있으면 오른쪽 아래 창 → '확인했어요'로 모두 확인, ×는 새 알림이 올 때까지 숨김", async () => {
    const calls = stubApi((url, method) => {
      if (url.includes("/api/catalog/admin/supplier-profile-changes?scope=unchecked")) return json({ available: true, unchecked: 2, changes: CHANGES });
      if (url.endsWith("/api/catalog/admin/supplier-profile-changes/check") && method === "POST") return json({ unchecked: 0 });
      return undefined;
    });
    const onChecked = vi.fn();
    const { rerender } = render(<MemoryRouter><SupplierProfileAlert count={0} onChecked={onChecked} /></MemoryRouter>);
    expect(screen.queryByRole("status", { name: "공급사 정보 변경 알림" })).toBeNull();
    expect(calls).toHaveLength(0);

    rerender(<MemoryRouter><SupplierProfileAlert count={2} onChecked={onChecked} /></MemoryRouter>);
    const alert = await screen.findByRole("status", { name: "공급사 정보 변경 알림" });
    // 알림 창은 "공급사 · 무엇을 바꿨는지" 한 줄씩(전·후 값은 '기록 보기'에서)
    expect(alert.textContent).toContain("바른농장");
    expect(alert.textContent).toContain("정산 계좌 변경");
    expect(alert.textContent).toContain("햇살농원");
    expect(alert.textContent).toContain("사업자등록번호 등록 · 정산 계좌 등록");
    expect(alert.textContent).not.toContain("···3456");
    expect(alert.textContent).toContain("11.27(금) 14:02");
    expect(within(alert).getByRole("link", { name: /기록 보기/ }).getAttribute("href")).toBe("/admin/suppliers#profile-changes");

    fireEvent.click(within(alert).getByRole("button", { name: /알림 창 닫기/ }));
    expect(screen.queryByRole("status", { name: "공급사 정보 변경 알림" })).toBeNull();
    rerender(<MemoryRouter><SupplierProfileAlert count={3} onChecked={onChecked} /></MemoryRouter>);
    const again = await screen.findByRole("status", { name: "공급사 정보 변경 알림" });
    fireEvent.click(within(again).getByRole("button", { name: /확인했어요/ }));
    await waitFor(() => expect(onChecked).toHaveBeenCalledTimes(1));
    expect(calls.find((call) => call.method === "POST")).toMatchObject({ url: expect.stringContaining("/supplier-profile-changes/check"), body: {} });
  });

  it("공급사 관리 변경 기록: 새 알림 · 전체, 한 건 확인, 운영 배포 전 안내", async () => {
    let unchecked = [...CHANGES];
    const calls = stubApi((url, method, body) => {
      if (url.includes("/supplier-profile-changes?scope=unchecked")) return json({ available: true, unchecked: unchecked.length, changes: unchecked });
      if (url.includes("/supplier-profile-changes?scope=all")) return json({ available: true, unchecked: unchecked.length, changes: CHANGES.map((change) => unchecked.some((item) => item.id === change.id) ? change : { ...change, checkedAt: "2026-11-27T06:00:00.000Z", checkedBy: "admin" }) });
      if (url.endsWith("/supplier-profile-changes/check") && method === "POST") {
        const ids = (body as { ids?: string[] }).ids ?? unchecked.map((item) => item.id);
        unchecked = unchecked.filter((item) => !ids.includes(item.id));
        return json({ unchecked: unchecked.length });
      }
      return undefined;
    });
    const onChecked = vi.fn();
    render(<MemoryRouter><SupplierProfileChangeLog onChecked={onChecked} /></MemoryRouter>);
    const log = screen.getByRole("region", { name: "공급사 정보 변경 기록" });
    expect(await within(log).findByText("햇살농원")).toBeTruthy();
    expect(within(log).getByRole("tab", { name: /새 알림 2/ }).getAttribute("aria-selected")).toBe("true");
    expect(log.textContent).toContain("사업자등록번호 등록 · 정산 계좌 등록");
    expect(log.textContent).toContain("공급사 아이디 sunny");

    const rows = within(log).getAllByRole("listitem").filter((item) => item.classList.contains("is-new"));
    expect(rows).toHaveLength(2);
    fireEvent.click(within(rows[0]).getByRole("button", { name: "확인" }));
    await waitFor(() => expect(onChecked).toHaveBeenCalledTimes(1));
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({ ids: ["c2"] });
    await waitFor(() => expect(within(log).getByRole("tab", { name: /새 알림 1/ })).toBeTruthy());

    fireEvent.click(within(log).getByRole("tab", { name: "전체 기록" }));
    expect(await within(log).findByText(/확인 · 11.27\(금\) 15:00 · admin/)).toBeTruthy();
  });

  it("migration 038 전이면 기록 대신 운영 배포 후 안내", async () => {
    stubApi((url) => (url.includes("/supplier-profile-changes?scope=") ? json({ available: false, unchecked: 0, changes: [] }) : undefined));
    render(<MemoryRouter><SupplierProfileChangeLog /></MemoryRouter>);
    expect(await screen.findByText(/운영 배포\(DB 업데이트 038\)가 끝나면/)).toBeTruthy();
  });
});
