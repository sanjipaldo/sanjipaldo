// 농수산물 백과사전 "기기 옮기기 코드": 내 후보·산지 확인 체크리스트를 6자리 코드로 저장해 다른 기기에서 불러옵니다.
// 코드만 알면 누구나 읽고 바꿀 수 있는 공개 메모장이라 개인정보(이름·연락처·IP)는 저장하지 않습니다.
import { eq } from "drizzle-orm";
import { getDb } from "../_core/db";
import { encyclopediaSaves } from "../db/schema";

export const SYNC_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const SYNC_CODE_LENGTH = 6;
const CODE_PATTERN = new RegExp(`^[${SYNC_CODE_ALPHABET}]{${SYNC_CODE_LENGTH}}$`);

export type EncyclopediaSavePayload = { favorites: string[]; checks: Record<string, boolean[]> };
export type EncyclopediaSave = EncyclopediaSavePayload & { code: string; updatedAt: string };

// 입력한 코드(소문자·띄어쓰기·하이픈 섞여도 됨) → 표준 코드, 형식이 틀리면 null
export function normalizeSyncCode(value: string | null | undefined) {
  const code = (value ?? "").toUpperCase().replace(/[\s-]+/g, "");
  return CODE_PATTERN.test(code) ? code : null;
}

export function randomSyncCode() {
  const bytes = new Uint8Array(SYNC_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => SYNC_CODE_ALPHABET[byte % SYNC_CODE_ALPHABET.length]).join("");
}

function parsePayload(value: string): EncyclopediaSavePayload {
  try {
    const parsed = JSON.parse(value) as Partial<EncyclopediaSavePayload>;
    return {
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites.filter((id): id is string => typeof id === "string") : [],
      checks: parsed.checks && typeof parsed.checks === "object" ? parsed.checks : {}
    };
  } catch {
    return { favorites: [], checks: {} };
  }
}

const nowText = () => new Date().toISOString();

export async function createEncyclopediaSave(payload: EncyclopediaSavePayload): Promise<EncyclopediaSave> {
  const db = getDb();
  const updatedAt = nowText();
  // 31^6 ≈ 8.9억 가지라 겹칠 일은 드물지만, 겹치면 새 코드로 다시 시도합니다.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = randomSyncCode();
    const existing = await db.select({ code: encyclopediaSaves.code }).from(encyclopediaSaves).where(eq(encyclopediaSaves.code, code)).limit(1);
    if (existing.length > 0) continue;
    await db.insert(encyclopediaSaves).values({ code, payload: JSON.stringify(payload), createdAt: updatedAt, updatedAt });
    return { code, ...payload, updatedAt };
  }
  throw new Error("could not allocate a sync code");
}

export async function getEncyclopediaSave(code: string): Promise<EncyclopediaSave | null> {
  const rows = await getDb().select().from(encyclopediaSaves).where(eq(encyclopediaSaves.code, code)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return { code: row.code, ...parsePayload(row.payload), updatedAt: row.updatedAt };
}

export async function updateEncyclopediaSave(code: string, payload: EncyclopediaSavePayload): Promise<EncyclopediaSave | null> {
  const db = getDb();
  const existing = await db.select({ code: encyclopediaSaves.code }).from(encyclopediaSaves).where(eq(encyclopediaSaves.code, code)).limit(1);
  if (existing.length === 0) return null;
  const updatedAt = nowText();
  await db.update(encyclopediaSaves).set({ payload: JSON.stringify(payload), updatedAt }).where(eq(encyclopediaSaves.code, code));
  return { code, ...payload, updatedAt };
}

// migration 031 전 DB(운영 DB를 쓰는 미리보기)에는 encyclopedia_saves 표가 없습니다. 그때는 DB 오류 문구 대신 안내만 돌려줍니다.
export function isMissingSyncTable(error: unknown) {
  const texts = [error instanceof Error ? error.message : String(error), (error as { cause?: { message?: string } })?.cause?.message ?? ""];
  return texts.some((text) => text.includes("no such table") && text.includes("encyclopedia_saves"));
}

// 새 코드 만들기 남용 방지: 같은 접속 주소에서 1시간에 20개까지(메모리에만 잠깐 두고 저장하지 않음)
const createLog = new Map<string, number[]>();
export function allowSyncCreate(clientKey: string, now = Date.now()) {
  const hourAgo = now - 60 * 60 * 1000;
  const recent = (createLog.get(clientKey) ?? []).filter((time) => time > hourAgo);
  if (recent.length >= 20) {
    createLog.set(clientKey, recent);
    return false;
  }
  recent.push(now);
  createLog.set(clientKey, recent);
  if (createLog.size > 5000) {
    for (const [key, times] of createLog) if (times.every((time) => time <= hourAgo)) createLog.delete(key);
  }
  return true;
}
