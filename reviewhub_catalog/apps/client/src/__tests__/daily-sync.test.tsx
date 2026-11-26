// 운영 홈 > 발주오라 → DB센터 동기화(아침 동기화, 2026-11-26): 버튼 밑 마지막 동기화 시각, 누르면 작업 코드·발주오라 창,
// 읽기가 끝나면 저절로 DB센터에 반영(25개씩)하고 끝난 요약을 보여 줍니다.
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock, Toaster: () => null }));

import { DailySyncButton, DailySyncPanel, formatSyncTime, relativeTime, useDailySync, type DailySummary } from "@/pages/admin/DailySync";

function Board({ onApplied }: { onApplied?: () => void }) {
  const state = useDailySync(onApplied);
  return <MemoryRouter><DailySyncButton state={state} /><DailySyncPanel state={state} /></MemoryRouter>;
}

const LAST: DailySummary = {
  jobId: "job-0", comparedAt: "2026-11-26T00:10:00Z", finishedAt: "2026-11-26T00:12:00Z", totalProducts: 3, totalOnly: 1, updated: 3, created: 1, unchanged: 0, failed: 0, skippedFields: 0, failures: [],
  conflicts: 0, pushPending: 0, newPending: 0, initialPending: 0, products: { received: 2000, linked: 1900, baljuoraOnly: 1 }, sales: { lines: 120, buyers: 40, complete: true, error: null, start: "2026-10-01", end: "2026-11-26" }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(status < 400 ? { ok: true, data } : { ok: false, error: { message: String(data) } }), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = "";
  toastMock.success.mockClear();
  window.localStorage.clear();
});

describe("운영 홈 발주오라 → DB센터 동기화", () => {
  it("시각은 한국 시각(몇 일 몇 시)으로, 지난 시간도 보여 줍니다", () => {
    expect(formatSyncTime("2026-11-26T00:12:00Z")).toMatch(/11월 26일.*목.*오전 9:12/);
    expect(relativeTime("2026-11-26T00:12:00Z", Date.parse("2026-11-26T02:20:00Z"))).toBe("2시간 전");
    expect(relativeTime("2026-11-26T00:12:00Z", Date.parse("2026-11-26T00:12:20Z"))).toBe("방금");
  });

  it("버튼 밑에 마지막 동기화를 보여 주고, 누르면 작업 코드와 발주오라 창을 엽니다", async () => {
    const opened: string[] = [];
    vi.stubGlobal("open", vi.fn((url: string) => { opened.push(url); return null; }));
    let started = false;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.endsWith("/api/baljuora/admin/daily/start") && method === "POST") {
        started = true;
        return json({ job: { id: "job-1", type: "compare", status: "waiting", createdAt: new Date().toISOString(), finishedAt: null, expiresAt: new Date(Date.now() + 1800_000).toISOString(), progress: null, summary: null, daily: true }, code: "ABCDE23456", consoleUrl: "https://console.baljuora.com/doogobiz24/dashboard#doogo-sync=ABCDE23456" });
      }
      if (url.endsWith("/api/baljuora/admin/daily")) {
        return json({ ready: true, last: LAST, needsApply: false, stale: false, applying: null, job: started ? { id: "job-1", type: "compare", status: "waiting", createdAt: new Date().toISOString(), finishedAt: null, expiresAt: new Date(Date.now() + 1800_000).toISOString(), progress: null, summary: null, daily: true } : null });
      }
      return json("not found", 404);
    }));
    render(<Board />);
    expect(await screen.findByText(/마지막 동기화 11월 26일/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /발주오라 → DB센터 동기화/ }));
    expect(await screen.findByText("발주오라 창에서 책갈피를 눌러 주세요", { selector: "h2" })).toBeTruthy();
    expect(opened).toEqual(["https://console.baljuora.com/doogobiz24/dashboard#doogo-sync=ABCDE23456"]);
    expect(screen.getByText(/ABCDE/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /발주오라 → DB센터 동기화/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("발주오라를 다 읽었으면 저절로 DB센터에 반영하고(25개씩) 끝난 요약을 보여 줍니다", async () => {
    const steps = [
      { status: "applying", done: 25, total: 31, last: LAST },
      { status: "done", done: 31, total: 31, last: { ...LAST, jobId: "job-2", finishedAt: "2026-11-27T00:05:00Z", updated: 30, created: 1, conflicts: 2, pushPending: 3 } }
    ];
    let applied = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/baljuora/admin/daily/apply") && (init?.method ?? "GET").toUpperCase() === "POST") return json(steps[applied++]);
      if (url.endsWith("/api/baljuora/admin/daily")) {
        const done = applied >= steps.length;
        return json({ ready: true, last: done ? steps[1].last : LAST, needsApply: !done, stale: false, applying: null, job: { id: "job-2", type: "compare", status: "done", createdAt: new Date().toISOString(), finishedAt: new Date().toISOString(), expiresAt: new Date().toISOString(), progress: null, summary: null, daily: true } });
      }
      return json("not found", 404);
    }));
    const onApplied = vi.fn();
    render(<Board onApplied={onApplied} />);
    expect(await screen.findByText(/동기화 완료 · 11월 27일/)).toBeTruthy();
    expect(applied).toBe(2);
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/상품 30개 발주오라 값으로 바뀜 · 새 상품 1개 DB센터에 숨김 등록 · 주문 120줄 · 매출처 40곳/)).toBeTruthy();
    expect(screen.getByText(/양쪽에서 바뀐 상품 2개\(그대로 둠\) · DB센터에서 바꿔 발주오라로 보낼 상품 3개/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/마지막 동기화 11월 27일/)).toBeTruthy());
  });
});
