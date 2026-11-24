// 공개 화면 새로고침(2026-11-24 Vercel CPU 줄이기): 예전에는 단가표·신규상품·가격변동·품절이슈 화면이 1분마다, 그리고 창에 돌아올 때마다
// 전체 상품 목록(/api/catalog, 서버 CPU 약 0.33초)을 다시 받았습니다. 이제는
//   - 화면이 보일 때만 1분마다 '바뀐 게 있는지'(GET /api/catalog/version, 아주 가벼움)만 묻고,
//   - 창 포커스·탭 복귀 때도 같은 것만 묻고,
//   - 버전이 지금 화면의 catalogVersion과 다를 때만 전체 목록을 다시 받습니다.
// 관리자가 저장하면 서버의 버전이 바뀌므로 공개 화면에는 예전처럼 1분 안에 반영됩니다.
import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { isPageVisible, startVisibleInterval } from "@/lib/visible-interval";

export const CATALOG_VERSION_INTERVAL_MS = 60 * 1000;
// 버전을 못 받을 때(예전 서버·일시 오류)는 이 횟수에 한 번만 전체를 다시 받습니다(1분 × 5 = 약 5분).
const FALLBACK_EVERY = 5;
// 창 포커스와 탭 복귀가 한꺼번에 오므로 짧은 시간 안의 중복 확인은 건너뜁니다.
const MIN_CHECK_GAP_MS = 3000;

export async function loadCatalogVersion(): Promise<string | null> {
  try {
    const response = await apiFetch("/catalog/version", { auth: false, silent: true });
    if (!response.ok) return null;
    const payload = (await response.json()) as { ok?: boolean; data?: { version?: unknown } };
    return payload.ok && typeof payload.data?.version === "string" && payload.data.version ? payload.data.version : null;
  } catch {
    return null;
  }
}

type WatchOptions = {
  // 지금 화면에 있는 단가표의 버전(응답의 catalogVersion). 아직 전체를 못 받았으면 undefined.
  currentVersion: () => string | null | undefined;
  // 버전이 바뀌었을 때(또는 버전을 오래 못 받을 때) 전체를 다시 받습니다.
  onChange: () => void;
  intervalMs?: number;
  loadVersion?: () => Promise<string | null>;
};

export function watchCatalogVersion({ currentVersion, onChange, intervalMs = CATALOG_VERSION_INTERVAL_MS, loadVersion = loadCatalogVersion }: WatchOptions): () => void {
  let stopped = false;
  let checking = false;
  let lastCheck = 0;
  let failures = 0;
  const check = () => {
    if (stopped || checking || !isPageVisible()) return;
    const now = Date.now();
    if (now - lastCheck < MIN_CHECK_GAP_MS) return;
    lastCheck = now;
    checking = true;
    void loadVersion().then((version) => {
      checking = false;
      if (stopped) return;
      if (version === null) {
        failures += 1;
        if (failures % FALLBACK_EVERY === 0) onChange();
        return;
      }
      failures = 0;
      if (version !== currentVersion()) onChange();
    });
  };
  const stopInterval = startVisibleInterval(check, intervalMs);
  const onFocus = () => check();
  const onVisibility = () => check();
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    stopped = true;
    stopInterval();
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

// 화면의 단가표 버전을 watchCatalogVersion에 넘기기 위한 ref(렌더마다 새 함수를 만들지 않게).
export function useCatalogVersionRef(version: string | null | undefined) {
  const ref = useRef(version);
  useEffect(() => {
    ref.current = version;
  }, [version]);
  return ref;
}
