// 화면에 보이는 동안만 주기적으로 실행합니다(2026-11-24 Vercel CPU 줄이기).
// 다른 탭을 보거나 창을 최소화한 동안에는 실행하지 않고, 다시 보이면 주기가 지났을 때 바로 한 번 실행합니다.
// 예전 setInterval은 숨은 탭에서도 1분마다 서버를 불러, 열어 두기만 한 단가표가 하루 종일 서버 CPU를 썼습니다.
export function isPageVisible() {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

export function startVisibleInterval(callback: () => void, intervalMs: number): () => void {
  if (typeof window === "undefined") return () => undefined;
  let last = Date.now();
  const run = () => {
    last = Date.now();
    callback();
  };
  // 탭 복귀로 방금 실행했으면 다음 정기 실행은 건너뜁니다(짧은 시간에 두 번 부르지 않게).
  const timer = window.setInterval(() => {
    if (isPageVisible() && Date.now() - last >= intervalMs * 0.9) run();
  }, intervalMs);
  const onVisibility = () => {
    if (isPageVisible() && Date.now() - last >= intervalMs) run();
  };
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
