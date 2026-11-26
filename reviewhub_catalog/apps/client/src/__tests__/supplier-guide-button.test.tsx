// 공급사 센터 위 줄 "공급사 안내" 버튼(2026-11-26): 로그인한 공급사 화면에만 있고, 설명서 링크가 있으면 새 탭으로 엽니다.
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock, Toaster: () => null }));

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock("@/lib/auth", () => ({
  getAuthToken: () => "",
  clearAuthToken: () => undefined,
  authClient: {
    useSession: () => ({ data: { user: { id: "u-sup", emailVerified: true } }, isPending: false, refetch: async () => undefined }),
    signOut: async () => undefined
  }
}));

import { SupplierCenterRoute } from "@/pages/supplier/SupplierCenter";
import { SUPPLIER_GUIDE_PENDING_MESSAGE, SupplierGuideButton } from "@/pages/supplier/supplier-guide";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const profile = {
  supplier: { id: "s1", name: "봄날농원", representative: "김봄", phone: null, email: null, address: null, businessNumber: null },
  account: { id: "a1", username: "spring", isActive: true, commissionRate: 10, settlementCycle: "weekly", lastLoginAt: null, createdAt: "2026-11-20T00:00:00.000Z" },
  settlement: { type: "commission", commissionRate: 10, cycle: "weekly" }
};

function renderCenter() {
  return render(
    <MemoryRouter initialEntries={["/supplier/account"]}>
      <Routes>
        <Route path="/supplier/:section" element={<SupplierCenterRoute />} />
        <Route path="/supplier" element={<div>공급사 로그인</div>} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  apiFetch.mockReset();
  toastMock.mockClear();
});

describe("공급사 안내 버튼", () => {
  it("공급사로 로그인하면 위 줄 공급사 이름 옆에 있고, 링크가 없으면 준비 중이라고 안내합니다", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path === "/supplier/me") return json({ ok: true, data: profile });
      if (path === "/supplier/requests") return json({ ok: true, data: { requests: [] } });
      return json({ ok: false, error: { message: "없는 주소" } }, 404);
    });
    renderCenter();
    const header = (await screen.findByText("DOOGO FOOD 공급사 센터")).closest("header") as HTMLElement;
    const button = within(header).getByRole("button", { name: "공급사 안내" });
    expect(within(header).getByText("봄날농원")).toBeTruthy();
    fireEvent.click(button);
    expect(toastMock).toHaveBeenCalledWith(SUPPLIER_GUIDE_PENDING_MESSAGE);
  });

  it("관리자 계정처럼 공급사가 아니면 공급사 센터 대신 안내 화면이라 버튼이 없습니다", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path === "/supplier/me") return json({ ok: false, error: { message: "공급사 계정이 아니에요." } }, 403);
      if (path === "/me/profile") return json({ ok: true, data: { profile: { role: "admin" } } });
      return json({ ok: false }, 404);
    });
    renderCenter();
    expect(await screen.findByText("공급사 센터를 열 수 없어요")).toBeTruthy();
    expect(screen.queryByText("공급사 안내")).toBeNull();
  });

  it("설명서 링크가 있으면 새 탭으로 엽니다", () => {
    render(<SupplierGuideButton url="https://example.com/doogo-food-supplier-guide.pdf" />);
    const link = screen.getByRole("link", { name: "공급사 안내" });
    expect(link.getAttribute("href")).toBe("https://example.com/doogo-food-supplier-guide.pdf");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(toastMock).not.toHaveBeenCalled();
  });
});
