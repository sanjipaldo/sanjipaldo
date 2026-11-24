// 관리자 운영 홈(2026-11-24 관리자 요청 "판매 현황을 운영 홈에서, 매출처(셀러)·공급사 총수와 한 달 증감(%),
// 아이디마다 원하는 칸을 골라 순서를 바꿔 보기"). 마이그레이션 없이 baljuora_sync_store(key-value)에 둡니다.
//   - 회원 현황: 매출처(셀러) = 발주오라에서 불러온 매출처(baljuora_buyers), 공급사 = 공급사 관리(suppliers, 사용 중).
//     30일 전 수는 하루 한 번 적어 두는 기록(member_count_history)이 있으면 그 값으로, 아직 없으면
//     가입일(발주오라 매출처 createdAt → joinedAt)·등록일(suppliers.createdAt)로 추정합니다.
//   - 화면 배치: admin_home_layout:<사용자 id> — 보이는 칸 순서·넓이. 칸 이름은 화면이 정하고 서버는 모양만 검사합니다.
import { and, eq, gte, sql } from "drizzle-orm";
import { addDays, seoulDateKey } from "@repo/shared/supplier-portal";
import { getDb } from "../_core/db";
import { baljuoraBuyers, baljuoraSalesLines, baljuoraSyncStore, supplierAccounts, suppliers } from "../db/schema";
import { revenueWhere } from "./baljuora-sales";

export const MEMBER_HISTORY_KEY = "member_count_history";
const HISTORY_KEEP_DAYS = 400;
const MEMBER_WINDOW_DAYS = 30;

type HistoryEntry = { b: number | null; s: number };
type History = Record<string, HistoryEntry>;

export type CountChange = {
  total: number;
  // 30일 전 수와 그 차이·비율(%, 소수점 한 자리). 비교할 수 없으면 null
  previous: number | null;
  change: number | null;
  changeRate: number | null;
  // "snapshot" = 30일 전에 적어 둔 수 · "joined" = 가입일·등록일로 추정
  basis: "snapshot" | "joined";
  // 최근 30일 새로 들어온 수(가입일·등록일 기준)
  recent: number;
};

export type MemberStats = {
  asOf: string;
  since: string;
  buyers: (CountChange & { activeBuyers: number }) | null;
  suppliers: CountChange & { accounts: number | null };
};

function isMissingTable(error: unknown) {
  const texts = [error instanceof Error ? error.message : String(error), (error as { cause?: { message?: string } })?.cause?.message ?? ""];
  return texts.some((text) => /no such table/i.test(text));
}

async function readStore<T>(key: string, fallback: T): Promise<T> {
  const row = (await getDb().select({ value: baljuoraSyncStore.value }).from(baljuoraSyncStore).where(eq(baljuoraSyncStore.key, key)).limit(1))[0];
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

async function writeStore(key: string, value: unknown) {
  const text = JSON.stringify(value);
  const now = new Date().toISOString();
  await getDb().insert(baljuoraSyncStore).values({ key, value: text, updatedAt: now })
    .onConflictDoUpdate({ target: baljuoraSyncStore.key, set: { value: text, updatedAt: now } });
}

function change(total: number, previous: number | null, basis: CountChange["basis"], recent: number): CountChange {
  if (previous === null) return { total, previous: null, change: null, changeRate: null, basis, recent };
  const diff = total - previous;
  return { total, previous, change: diff, changeRate: previous > 0 ? Math.round((diff / previous) * 1000) / 10 : null, basis, recent };
}

// 한국 날짜 0시(=전날 15:00 UTC)를 SQLite datetime()으로 비교할 수 있는 ISO 글자로
function seoulDayStartIso(dateKey: string) {
  return new Date(`${dateKey}T00:00:00+09:00`).toISOString();
}

export async function getMemberStats(now = new Date()): Promise<MemberStats> {
  const db = getDb();
  const asOf = seoulDateKey(now);
  const since = addDays(asOf, -MEMBER_WINDOW_DAYS);
  const sinceIso = seoulDayStartIso(since);

  const supplierRow = (await db.select({
    total: sql<number>`count(*)`,
    recent: sql<number>`coalesce(sum(case when datetime(${suppliers.createdAt}) >= datetime(${sinceIso}) then 1 else 0 end), 0)`
  }).from(suppliers).where(eq(suppliers.isActive, true)))[0];
  const supplierTotal = Number(supplierRow?.total ?? 0);
  const supplierRecent = Number(supplierRow?.recent ?? 0);
  let supplierLogins: number | null = null;
  try {
    supplierLogins = Number((await db.select({ count: sql<number>`count(*)` }).from(supplierAccounts).where(eq(supplierAccounts.isActive, true)))[0]?.count ?? 0);
  } catch (error) {
    if (!isMissingTable(error)) throw error;
  }

  let buyers: { total: number; recent: number; activeBuyers: number } | null = null;
  try {
    const [buyerRow, activeRow] = await Promise.all([
      db.select({
        total: sql<number>`count(*)`,
        recent: sql<number>`coalesce(sum(case when ${baljuoraBuyers.joinedAt} is not null and datetime(${baljuoraBuyers.joinedAt}) >= datetime(${sinceIso}) then 1 else 0 end), 0)`
      }).from(baljuoraBuyers),
      db.select({ count: sql<number>`count(distinct coalesce(${baljuoraSalesLines.sellerId}, ${baljuoraSalesLines.sellerName}))` })
        .from(baljuoraSalesLines).where(and(gte(baljuoraSalesLines.saleDate, since), revenueWhere()))
    ]);
    buyers = { total: Number(buyerRow[0]?.total ?? 0), recent: Number(buyerRow[0]?.recent ?? 0), activeBuyers: Number(activeRow[0]?.count ?? 0) };
  } catch (error) {
    if (!isMissingTable(error)) throw error;
  }

  // 하루 한 번 오늘 수를 적어 둡니다(바뀌었을 때만). 30일 전 기록이 있으면 그 값과 비교합니다.
  const history = await readStore<History>(MEMBER_HISTORY_KEY, {});
  const todayEntry: HistoryEntry = { b: buyers ? buyers.total : null, s: supplierTotal };
  const saved = history[asOf];
  if (!saved || saved.b !== todayEntry.b || saved.s !== todayEntry.s) {
    const keepFrom = addDays(asOf, -HISTORY_KEEP_DAYS);
    const next: History = {};
    for (const [date, entry] of Object.entries(history)) if (date >= keepFrom && /^\d{4}-\d{2}-\d{2}$/.test(date)) next[date] = entry;
    next[asOf] = todayEntry;
    try {
      await writeStore(MEMBER_HISTORY_KEY, next);
    } catch (error) {
      console.warn("[admin-home] member history save failed:", error instanceof Error ? error.message : String(error));
    }
  }
  const snapshotDate = Object.keys(history).filter((date) => date <= since).sort().at(-1);
  const snapshot = snapshotDate ? history[snapshotDate] : undefined;

  const supplierChange = snapshot
    ? change(supplierTotal, snapshot.s, "snapshot", supplierRecent)
    : change(supplierTotal, supplierTotal - supplierRecent, "joined", supplierRecent);
  const buyerChange = buyers
    ? (snapshot && snapshot.b !== null
      ? change(buyers.total, snapshot.b, "snapshot", buyers.recent)
      : change(buyers.total, buyers.total - buyers.recent, "joined", buyers.recent))
    : null;

  return {
    asOf,
    since,
    buyers: buyers && buyerChange ? { ...buyerChange, activeBuyers: buyers.activeBuyers } : null,
    suppliers: { ...supplierChange, accounts: supplierLogins }
  };
}

// ── 화면 배치(아이디마다) ─────────────────────────────────────────────

const LAYOUT_ID = /^[a-z0-9][a-z0-9-]{1,39}$/;
const LAYOUT_MAX = 40;

export type AdminHomeLayout = {
  visible: string[];
  known: string[];
  sizes: Record<string, "full" | "half">;
  updatedAt: string;
};

function layoutKey(userId: string) {
  return `admin_home_layout:${userId}`;
}

function cleanIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item === "string" && LAYOUT_ID.test(item) && !seen.has(item)) seen.add(item);
    if (seen.size >= LAYOUT_MAX) break;
  }
  return [...seen];
}

export function cleanLayout(input: unknown): Omit<AdminHomeLayout, "updatedAt"> | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  if (!Array.isArray(record.visible)) return null;
  const visible = cleanIds(record.visible);
  const known = cleanIds([...(Array.isArray(record.known) ? record.known : []), ...visible]);
  const sizes: Record<string, "full" | "half"> = {};
  if (record.sizes && typeof record.sizes === "object") {
    for (const [id, size] of Object.entries(record.sizes as Record<string, unknown>)) {
      if (LAYOUT_ID.test(id) && (size === "full" || size === "half") && Object.keys(sizes).length < LAYOUT_MAX) sizes[id] = size;
    }
  }
  return { visible, known, sizes };
}

export async function getAdminHomeLayout(userId: string): Promise<AdminHomeLayout | null> {
  const stored = await readStore<unknown>(layoutKey(userId), null);
  const cleaned = cleanLayout(stored);
  if (!cleaned) return null;
  const updatedAt = stored && typeof stored === "object" && typeof (stored as { updatedAt?: unknown }).updatedAt === "string" ? (stored as { updatedAt: string }).updatedAt : "";
  return { ...cleaned, updatedAt };
}

export async function saveAdminHomeLayout(userId: string, input: unknown): Promise<AdminHomeLayout | null> {
  const cleaned = cleanLayout(input);
  if (!cleaned) return null;
  const layout: AdminHomeLayout = { ...cleaned, updatedAt: new Date().toISOString() };
  await writeStore(layoutKey(userId), layout);
  return layout;
}

export async function resetAdminHomeLayout(userId: string) {
  await getDb().delete(baljuoraSyncStore).where(eq(baljuoraSyncStore.key, layoutKey(userId)));
  return { reset: true };
}
