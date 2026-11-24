// 발주오라 작업 코드(2026-11-25 관리자 신고 "책갈피를 누르면 코드를 물어보는데 정상 작동 안 되는 것 같다"):
// 코드는 서버에 SHA-256만 있어 작업을 만든 화면을 새로 열면 사라졌습니다 → 이 기기에 기억 + "작업 코드 다시 받기".
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock, Toaster: () => null }));

import { clearJobCode, latestJobCode, loadJobCode, saveJobCode } from "@/lib/baljuora-job-code";
import { BaljuoraJobCode } from "@/pages/admin/BaljuoraJobCode";

const future = () => new Date(Date.now() + 20 * 60_000).toISOString();

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.body.innerHTML = "";
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});

describe("작업 코드 기억(이 기기)", () => {
  it("만든 작업의 코드를 기억하고, 만료되거나 지우면 돌려주지 않습니다", () => {
    saveJobCode({ id: "job-1", type: "compare", code: "ABCDE23456", consoleUrl: "https://console.baljuora.com/x/dashboard#doogo-sync=ABCDE23456", expiresAt: future() });
    saveJobCode({ id: "job-2", type: "sales", code: "FGHJK23456", consoleUrl: "https://console.baljuora.com/x/dashboard#doogo-sync=FGHJK23456", expiresAt: future() });
    saveJobCode({ id: "job-old", type: "sales", code: "OLDOL23456", consoleUrl: "u", expiresAt: "2000-01-01T00:00:00.000Z" });
    expect(loadJobCode("job-1")?.code).toBe("ABCDE23456");
    expect(loadJobCode("job-old")).toBeNull();
    expect(latestJobCode("sales")?.id).toBe("job-2");
    clearJobCode("job-2");
    expect(loadJobCode("job-2")).toBeNull();
    expect(latestJobCode("sales")).toBeNull();
  });

  it("저장이 막힌 브라우저에서도 오류 없이 지나갑니다", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => saveJobCode({ id: "job-1", type: "compare", code: "ABCDE23456", consoleUrl: "u", expiresAt: future() })).not.toThrow();
    spy.mockRestore();
  });
});

describe("작업 코드 칸", () => {
  it("코드가 있으면 ABCDE-23456처럼 크게 보여 주고 복사할 수 있습니다", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...window.navigator, clipboard: { writeText } });
    render(<BaljuoraJobCode jobId="job-1" code="ABCDE23456" expiresAt={future()} onReissued={() => undefined} />);
    expect(screen.getByText("ABCDE-23456")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "작업 코드 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("ABCDE-23456"));
    expect(screen.getByText(/복사됨/)).toBeTruthy();
  });

  it("화면을 새로 열어 코드를 모르면 '작업 코드 다시 받기'로 새 코드를 받습니다", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calls.push(`${(init?.method ?? "GET").toUpperCase()} ${url}`);
      return new Response(JSON.stringify({ ok: true, data: { job: { id: "job-1", status: "waiting" }, code: "NEWCD23456", consoleUrl: "https://console.baljuora.com/x/dashboard#doogo-sync=NEWCD23456" } }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    const onReissued = vi.fn();
    render(<BaljuoraJobCode jobId="job-1" code={null} onReissued={onReissued} />);
    expect(screen.getByText(/작업 코드가 안 보여요/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /작업 코드 다시 받기/ }));
    await waitFor(() => expect(onReissued).toHaveBeenCalledWith(expect.objectContaining({ code: "NEWCD23456" })));
    expect(calls.some((call) => call.startsWith("POST") && call.includes("/baljuora/admin/jobs/job-1/code"))).toBe(true);
    expect(toastMock.success).toHaveBeenCalled();
  });
});
