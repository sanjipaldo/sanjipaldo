// 공개 화면 새로고침 줄이기(2026-11-24 Vercel CPU): 화면이 보일 때만 1분마다 버전만 묻고, 바뀌었을 때만 전체를 다시 받습니다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startVisibleInterval } from "@/lib/visible-interval";
import { watchCatalogVersion } from "@/pages/catalog/catalog-updates";

let visibility: DocumentVisibilityState = "visible";

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startVisibleInterval", () => {
  it("보이는 동안만 주기마다 실행하고, 숨은 동안은 멈췄다가 다시 보이면 바로 한 번 실행합니다", async () => {
    const callback = vi.fn();
    const stop = startVisibleInterval(callback, 60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(callback).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(callback).toHaveBeenCalledTimes(2);

    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(callback).toHaveBeenCalledTimes(2);

    setVisibility("visible");
    expect(callback).toHaveBeenCalledTimes(3);
    // 방금 실행했으니 곧 오는 정기 실행은 건너뜁니다.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(callback).toHaveBeenCalledTimes(3);

    stop();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it("잠깐 숨었다가(주기 전) 돌아오면 바로 실행하지 않습니다", async () => {
    const callback = vi.fn();
    const stop = startVisibleInterval(callback, 60_000);
    await vi.advanceTimersByTimeAsync(10_000);
    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(10_000);
    setVisibility("visible");
    expect(callback).not.toHaveBeenCalled();
    stop();
  });
});

describe("watchCatalogVersion", () => {
  it("버전이 같으면 전체를 다시 받지 않고, 바뀌었을 때만 다시 받습니다", async () => {
    let current = "v1";
    const versions = ["v1", "v1", "v2"];
    const loadVersion = vi.fn(async () => versions.shift() ?? current);
    const onChange = vi.fn(() => { current = "v2"; });
    const stop = watchCatalogVersion({ currentVersion: () => current, onChange, loadVersion });

    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(loadVersion).toHaveBeenCalledTimes(2);
    expect(onChange).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(onChange).toHaveBeenCalledTimes(1);

    // 다시 받은 뒤(v2)에는 같은 v2가 와도 또 받지 않습니다.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  it("숨은 탭에서는 버전도 묻지 않고, 창으로 돌아오면 바로 한 번 묻습니다", async () => {
    const loadVersion = vi.fn(async () => "v9");
    const onChange = vi.fn();
    const stop = watchCatalogVersion({ currentVersion: () => "v1", onChange, loadVersion });

    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(loadVersion).not.toHaveBeenCalled();

    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(loadVersion).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);

    // 창 포커스가 바로 이어서 와도(3초 안) 한 번만 묻습니다.
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
    expect(loadVersion).toHaveBeenCalledTimes(1);
    stop();
  });

  it("버전을 못 받으면(예전 서버·일시 오류) 5번에 한 번만 전체를 다시 받습니다", async () => {
    const loadVersion = vi.fn(async () => null);
    const onChange = vi.fn();
    const stop = watchCatalogVersion({ currentVersion: () => "v1", onChange, loadVersion });
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect(onChange).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(loadVersion).toHaveBeenCalledTimes(5);
    stop();
  });
});
