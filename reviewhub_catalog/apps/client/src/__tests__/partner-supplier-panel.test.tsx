// 입점 성공 → 공급사 등록·정산 방식·계정(2026-11-25 관리자 요청 "입점 신청 → 상담으로 정산 방식 결정 → ID를 만들고 계약대로 세팅"):
// 입점 신청 상세에서 공급사로 등록(같은 이름이면 연결)하고, 정산 방식을 계약대로 맞춘 뒤, 공급사 관리의 계정 만들기 창으로 이어집니다.
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PartnerSupplierLink } from "@repo/shared/partner-deal";

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock, Toaster: () => null }));

import { PartnerSupplierPanel } from "@/pages/admin/PartnerSupplierPanel";
import type { SourcingRequest } from "@/pages/catalog/types";

const DEAL = { requestId: "req-1", stage: "contracted" as const, contractType: "commission" as const, commissionRate: 12, contractMemo: null, contactedAt: null, closedAt: null, history: [], createdAt: "2026-11-20T00:00:00Z", updatedAt: "2026-11-25T00:00:00Z" };

function request(partial: Partial<SourcingRequest> = {}): SourcingRequest {
  return {
    id: "req-1",
    productName: "사과, 배",
    desiredPrice: null,
    referenceUrl: null,
    requesterName: "박담당",
    contact: "010-1234-5678",
    details: "[업체 정보]\n대표자: 김대표\n사업자등록번호: 123-45-67890\n\n[업체·상품 소개]\n부사 위주",
    status: "completed",
    requestType: "partner",
    companyName: "봄빛농장",
    email: "farm@example.com",
    createdAt: "2026-11-20T00:00:00Z",
    updatedAt: "2026-11-25T00:00:00Z",
    deal: DEAL,
    supplierLink: null,
    ...partial
  };
}

function link(partial: Partial<PartnerSupplierLink> = {}): PartnerSupplierLink {
  return { supplierId: "sup-1", supplierName: "봄빛농장", linked: true, linkedAt: "2026-11-25T01:00:00Z", isActive: true, hasAccount: false, username: null, settlement: { type: "commission", commissionRate: 12, cycle: "weekly", explicit: true }, taxProblems: [], ...partial };
}

function show(value: SourcingRequest, onSaved = vi.fn(async () => undefined)) {
  render(<MemoryRouter><PartnerSupplierPanel request={value} onSaved={onSaved} /></MemoryRouter>);
  return onSaved;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});

describe("입점 성공 → 공급사 등록 칸", () => {
  it("입점 성공(계약 형태 저장) 전에는 보이지 않습니다", () => {
    show(request({ deal: { ...DEAL, stage: "negotiating", contractType: null, commissionRate: null } }));
    expect(screen.queryByRole("region", { name: "공급사 등록·정산 방식·계정" })).toBeNull();
  });

  it("신청서 정보로 공급사를 등록하고 정산 방식을 계약대로 맞춥니다(매입처명·지급 주기 고르기)", async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calls.push({ url, method: (init?.method ?? "GET").toUpperCase(), body: init?.body ? JSON.parse(String(init.body)) : null });
      return new Response(JSON.stringify({ ok: true, data: { created: true, reactivated: false, filled: ["사업자등록번호", "대표자", "연락처", "이메일"], settlementApplied: true, supplierId: "sup-1", supplierName: "봄빛농장 본점", request: request({ supplierLink: link({ supplierName: "봄빛농장 본점", settlement: { type: "commission", commissionRate: 12, cycle: "monthly", explicit: true } }) }) } }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    const onSaved = show(request());
    expect(screen.getByText(/계약\(수수료 12%\)대로 정산 방식이 맞춰지고/)).toBeTruthy();
    expect(screen.getByText("김대표")).toBeTruthy();
    expect(screen.getByText("123-45-67890")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("매입처명(공급사 이름)"), { target: { value: "봄빛농장 본점" } });
    fireEvent.change(screen.getByLabelText("정산(지급) 주기"), { target: { value: "monthly" } });
    fireEvent.click(screen.getByRole("button", { name: /공급사로 등록하고 정산 방식 맞추기/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(calls).toEqual([{ url: expect.stringContaining("/api/catalog/admin/partner/req-1/register-supplier"), method: "POST", body: { name: "봄빛농장 본점", cycle: "monthly" } }]);
    expect(toastMock.success.mock.calls[0][0]).toContain("'봄빛농장 본점' 공급사를 등록했어요");
    expect(toastMock.success.mock.calls[0][0]).toContain("공급사 센터 계정(ID)을 만들어 주세요");
  });

  it("이름이 같은 공급사가 있으면 연결한다고 알려 줍니다", () => {
    show(request({ supplierLink: link({ linked: false, linkedAt: null, isActive: false, settlement: { type: "commission", commissionRate: 10, cycle: "weekly", explicit: false } }) }));
    expect(screen.getByText(/이름이 같은 공급사 '봄빛농장'가 이미 있어요/)).toBeTruthy();
    expect(screen.getByText(/사용 중지 상태 → 사용 중으로 바꿈/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /공급사와 연결하고 정산 방식 맞추기/ })).toBeTruthy();
  });

  it("등록한 뒤에는 계정 만들기로 이어지고, 정산 방식이 계약과 다르거나 세금계산서 정보가 없으면 알려 줍니다", () => {
    show(request({ deal: { ...DEAL, contractType: "wholesale", commissionRate: null }, supplierLink: link({ taxProblems: ["대표자 성명 없음"] }) }));
    expect(screen.getByText(/정산 방식이 계약\(일반 도소매\(매입\)\)과 달라요/)).toBeTruthy();
    expect(screen.getByText(/세금계산서 정보 부족: 대표자 성명 없음/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "정산 방식 계약대로 맞추기" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /공급사 센터 계정\(ID\) 만들기/ }).getAttribute("href")).toBe("/admin/suppliers?account=sup-1");
    expect(screen.getByRole("link", { name: "공급사 관리에서 보기" }).getAttribute("href")).toBe("/admin/suppliers?supplier=sup-1");
  });

  it("계정까지 만들면 세 단계가 모두 끝난 것으로 보입니다", () => {
    show(request({ supplierLink: link({ hasAccount: true, username: "bomfarm" }) }));
    expect(screen.getByText("계정 있음 · bomfarm")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "정산 방식 계약대로 맞추기" })).toBeNull();
    expect(document.querySelectorAll(".partner-supplier-steps li.is-done")).toHaveLength(3);
  });
});
