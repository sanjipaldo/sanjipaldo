// 메인 홈 공지에서 넘어온 주소(/guide?notice=공지 id)로 공지사항 화면을 열면 그 공지 팝업이 바로 열리고, 주소의 notice는 지워집니다.
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { GuidePage } from "@/pages/catalog/PublicCatalog";

const notices = [
  { id: "pinned", title: "발주 마감시간 안내", content: "오전 9시 30분까지 들어온 주문을 당일 발주합니다.", isPinned: true, isActive: true, createdAt: "2026-10-01 00:00:00", updatedAt: "2026-10-01 00:00:00" },
  { id: "card", title: "[긴급공지] 카드결제 중단 안내", content: "빠른 정상화를 위해 최선을 다하겠습니다!", isPinned: false, isActive: true, createdAt: "2026-11-10 01:00:00", updatedAt: "2026-11-10 01:00:00" },
  { id: "pay", title: "[결제 안내] 신용카드 결제 가능", content: "도매몰에서 신용카드 이용이 가능해졌습니다.", isPinned: false, isActive: true, createdAt: "2026-10-22 01:00:00", updatedAt: "2026-10-22 01:00:00" }
];

function json(data: unknown) {
  return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "Content-Type": "application/json" } });
}

let lastSearch = "";
function LocationProbe() {
  lastSearch = useLocation().search;
  return null;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("공지사항 화면 ?notice= 바로 열기", () => {
  it("주소의 공지를 팝업으로 열고 notice는 주소에서 지웁니다", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/catalog/notices")) return json({ notices });
      if (url.includes("/catalog/guide")) return json({ settings: {} });
      return new Response(JSON.stringify({ ok: false }), { status: 503, headers: { "Content-Type": "application/json" } });
    }));
    render(
      <MemoryRouter initialEntries={["/guide?notice=card"]}>
        <Routes><Route path="/guide" element={<><GuidePage /><LocationProbe /></>} /></Routes>
      </MemoryRouter>
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("[긴급공지] 카드결제 중단 안내");
    await waitFor(() => expect(lastSearch).toBe(""));
  });
});
