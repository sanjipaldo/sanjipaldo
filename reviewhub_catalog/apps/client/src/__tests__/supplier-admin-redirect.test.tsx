// 공급사 계정으로 관리자 주소(/admin/...)를 열면 403 대신 공급사 센터(/supplier/home)로 보냅니다(관리자 권한은 그대로 역할로만 판단).
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminGuard } from "@/components/auth/AdminGuard";

const apiFetch = vi.fn();
vi.mock("@/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "u-sup", emailVerified: true } }, isPending: false }), signOut: async () => undefined },
  clearAuthToken: () => undefined
}));
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={["/admin/home"]}>
      <Routes>
        <Route path="/admin/home" element={<AdminGuard redirectTo="/admin"><div>Admin Dashboard</div></AdminGuard>} />
        <Route path="/supplier/home" element={<div>Supplier Home</div>} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  apiFetch.mockReset();
});

describe("관리자 주소의 공급사 계정", () => {
  it("공급사 계정이면 공급사 센터로 이동", async () => {
    apiFetch.mockImplementation(async (path: string) => path === "/me/profile"
      ? json({ ok: true, data: { profile: { role: "user" } } })
      : json({ ok: true, data: { supplier: { id: "s1", name: "봄날농원" }, account: { username: "sup" } } }));
    renderGuard();
    expect(await screen.findByText("Supplier Home")).toBeTruthy();
    expect(screen.queryByText("Admin Dashboard")).toBeNull();
  });

  it("공급사도 관리자도 아니면 403 안내(한국어)", async () => {
    apiFetch.mockImplementation(async (path: string) => path === "/me/profile"
      ? json({ ok: true, data: { profile: { role: "user" } } })
      : json({ ok: false, error: { message: "공급사 계정이 아니에요." } }, 403));
    renderGuard();
    expect(await screen.findByText("관리자 권한이 없어요")).toBeTruthy();
    expect(screen.queryByText("Supplier Home")).toBeNull();
  });
});
