// 백과사전 "내 후보"·산지 확인 체크리스트 저장소.
// 기본은 이 기기 브라우저(localStorage)에 두고, "기기 옮기기 코드"를 만들거나 입력하면 바뀔 때마다 서버(코드별 저장)에도 맞춰 둡니다.
// 이름·연락처·IP 같은 개인정보는 보내지 않습니다. 저장이 막힌 브라우저에서는 이 방문 동안만 기억합니다.
import { useSyncExternalStore } from "react";
import { apiFetch } from "./api";

const FAVORITES_KEY = "doogo:encyclopedia:favorites";
const CHECKS_KEY = "doogo:encyclopedia:checks";
const SYNC_KEY = "doogo:encyclopedia:sync";

export type SyncStatus = "off" | "saving" | "saved" | "error";
export type EncyclopediaState = {
  favorites: string[];
  checks: Record<string, boolean[]>;
  code: string | null;
  updatedAt: string | null;
  syncStatus: SyncStatus;
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장이 막힌 브라우저: 화면 안에서만 기억합니다.
  }
}

function initialState(): EncyclopediaState {
  const favorites = readJson<unknown>(FAVORITES_KEY, []);
  const checks = readJson<unknown>(CHECKS_KEY, {});
  const sync = readJson<{ code?: unknown; updatedAt?: unknown }>(SYNC_KEY, {});
  const code = typeof sync.code === "string" ? sync.code : null;
  return {
    favorites: Array.isArray(favorites) ? favorites.filter((id): id is string => typeof id === "string") : [],
    checks: checks && typeof checks === "object" && !Array.isArray(checks) ? (checks as Record<string, boolean[]>) : {},
    code,
    updatedAt: typeof sync.updatedAt === "string" ? sync.updatedAt : null,
    syncStatus: code ? "saved" : "off"
  };
}

let state: EncyclopediaState | null = null;
const listeners = new Set<() => void>();
let pushTimer: number | null = null;
let pulled = false;

function current() {
  if (!state) state = initialState();
  return state;
}

function emit(next: EncyclopediaState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function persist(next: EncyclopediaState) {
  writeJson(FAVORITES_KEY, next.favorites);
  writeJson(CHECKS_KEY, next.checks);
  writeJson(SYNC_KEY, { code: next.code, updatedAt: next.updatedAt });
}

async function readApi<T>(response: Response) {
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { message?: string } } | null;
  if (!response.ok || !payload?.ok || payload.data === undefined) throw new Error(payload?.error?.message ?? "저장 서버에 연결하지 못했어요.");
  return payload.data;
}

type RemoteSave = { code: string; favorites: string[]; checks: Record<string, boolean[]>; updatedAt: string };

function schedulePush() {
  const { code } = current();
  if (!code) return;
  if (pushTimer !== null) window.clearTimeout(pushTimer);
  emit({ ...current(), syncStatus: "saving" });
  pushTimer = window.setTimeout(() => {
    pushTimer = null;
    const snapshot = current();
    if (!snapshot.code) return;
    void apiFetch(`/catalog/encyclopedia/sync/${snapshot.code}`, {
      auth: false,
      silent: true,
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorites: snapshot.favorites, checks: snapshot.checks })
    })
      .then((response) => readApi<RemoteSave>(response))
      .then((saved) => {
        const next = { ...current(), updatedAt: saved.updatedAt, syncStatus: "saved" as const };
        persist(next);
        emit(next);
      })
      .catch(() => emit({ ...current(), syncStatus: "error" }));
  }, 700);
}

function update(change: (previous: EncyclopediaState) => Pick<EncyclopediaState, "favorites" | "checks">) {
  const previous = current();
  const next = { ...previous, ...change(previous), updatedAt: new Date().toISOString() };
  persist(next);
  emit(next);
  schedulePush();
}

export function toggleFavorite(id: string) {
  const added = !current().favorites.includes(id);
  update((previous) => ({ favorites: added ? [...previous.favorites, id] : previous.favorites.filter((value) => value !== id), checks: previous.checks }));
  return added;
}

export function addFavorites(ids: string[]) {
  update((previous) => ({ favorites: [...previous.favorites, ...ids.filter((id) => !previous.favorites.includes(id))], checks: previous.checks }));
}

export function setCheck(id: string, index: number, value: boolean, length: number) {
  update((previous) => {
    const list = Array.from({ length }, (_, position) => previous.checks[id]?.[position] === true);
    list[index] = value;
    return { favorites: previous.favorites, checks: { ...previous.checks, [id]: list } };
  });
}

// 지금 후보로 새 코드 만들기
export async function createSyncCode() {
  const snapshot = current();
  const saved = await readApi<RemoteSave>(await apiFetch("/catalog/encyclopedia/sync", {
    auth: false,
    silent: true,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ favorites: snapshot.favorites, checks: snapshot.checks })
  }));
  const next = { ...current(), code: saved.code, updatedAt: saved.updatedAt, syncStatus: "saved" as const };
  persist(next);
  emit(next);
  return saved.code;
}

// 다른 기기에서 만든 코드 입력 → 그 후보를 이 기기로 가져옵니다(이 기기의 후보는 코드의 후보로 바뀜).
export async function linkSyncCode(rawCode: string) {
  const code = rawCode.toUpperCase().replace(/[\s-]+/g, "");
  const saved = await readApi<RemoteSave>(await apiFetch(`/catalog/encyclopedia/sync/${encodeURIComponent(code)}`, { auth: false, silent: true }));
  const next: EncyclopediaState = { favorites: saved.favorites, checks: saved.checks, code: saved.code, updatedAt: saved.updatedAt, syncStatus: "saved" };
  persist(next);
  emit(next);
  return saved;
}

export function unlinkSync() {
  const next = { ...current(), code: null, syncStatus: "off" as const };
  persist(next);
  emit(next);
}

// 코드가 연결된 기기는 처음 열 때 서버의 더 새로운 후보를 가져옵니다.
export function pullSyncedOnce() {
  const snapshot = current();
  if (pulled || !snapshot.code) return;
  pulled = true;
  void apiFetch(`/catalog/encyclopedia/sync/${snapshot.code}`, { auth: false, silent: true })
    .then((response) => readApi<RemoteSave>(response))
    .then((saved) => {
      const local = current();
      if (local.updatedAt && saved.updatedAt <= local.updatedAt) return;
      const next: EncyclopediaState = { ...local, favorites: saved.favorites, checks: saved.checks, updatedAt: saved.updatedAt, syncStatus: "saved" };
      persist(next);
      emit(next);
    })
    .catch(() => emit({ ...current(), syncStatus: "error" }));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === FAVORITES_KEY || event.key === CHECKS_KEY || event.key === SYNC_KEY) emit(initialState());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useEncyclopediaStore() {
  return useSyncExternalStore(subscribe, current, current);
}

// 테스트용: 저장소를 처음 상태로
export function resetEncyclopediaStoreForTest() {
  state = null;
  pulled = false;
  if (pushTimer !== null) window.clearTimeout(pushTimer);
  pushTimer = null;
}
