// 발주오라 동기화 작업 코드(10글자)를 이 기기 브라우저에 잠깐 기억합니다.
// 서버는 코드의 SHA-256만 저장해 다시 보여 줄 수 없어서, 예전에는 작업을 만든 그 화면을 새로 열면 코드가 사라져
// 발주오라 창이 코드를 물어볼 때 넣을 수 없었습니다(2026-11-25 관리자 신고). 코드는 30분 뒤 만료되는 일회용입니다.
const KEY = "doogo:baljuora-job-code";

export type SavedJobCode = {
  id: string;
  type: string;
  code: string;
  consoleUrl: string;
  expiresAt: string | null;
};

function readAll(): SavedJobCode[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.id === "string" && typeof item.code === "string") : [];
  } catch {
    return [];
  }
}

function writeAll(items: SavedJobCode[]) {
  try {
    const now = new Date().toISOString();
    const alive = items.filter((item) => !item.expiresAt || item.expiresAt > now).slice(-5);
    if (alive.length) window.localStorage.setItem(KEY, JSON.stringify(alive));
    else window.localStorage.removeItem(KEY);
  } catch {
    // 저장이 막힌 브라우저: 이 화면에서만 보입니다.
  }
}

export function saveJobCode(entry: SavedJobCode) {
  writeAll([...readAll().filter((item) => item.id !== entry.id), entry]);
}

export function loadJobCode(jobId: string): SavedJobCode | null {
  const now = new Date().toISOString();
  return readAll().find((item) => item.id === jobId && (!item.expiresAt || item.expiresAt > now)) ?? null;
}

/** 가장 최근에 만든(아직 만료 전) 작업 코드: 판매 현황 화면처럼 진행 중 작업 목록을 따로 읽지 않는 화면이 씁니다. */
export function latestJobCode(type?: string): SavedJobCode | null {
  const now = new Date().toISOString();
  const items = readAll().filter((item) => (!type || item.type === type) && (!item.expiresAt || item.expiresAt > now));
  return items[items.length - 1] ?? null;
}

export function clearJobCode(jobId: string) {
  writeAll(readAll().filter((item) => item.id !== jobId));
}
