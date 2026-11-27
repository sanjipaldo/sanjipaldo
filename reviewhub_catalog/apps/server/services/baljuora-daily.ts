// 아침 동기화(2026-11-26 관리자 요청 "운영 홈에 아침 출근할 때 누르는 (발주오라 = DB센터 동기화) 버튼 하나 — 발주오라에서 바뀐 데이터를
// 정산·매출·주문·상품 변경사항 싹다 DB센터에 일치하게, 몇 일 몇 시에 업데이트됐는지 버튼 밑에").
// 발주오라는 공개 API가 없고 로그인에 사람 확인이 있어, 서버가 대신 로그인하지 않습니다(5장 안전 경계). 그래서 흐름은:
//   ① 운영 홈 버튼 → 비교 작업(daily, 판매·주문·매출처를 늘 함께 읽음) + 발주오라 관리자 창 열기
//   ② 그 창에서 책갈피 '두고푸드 동기화' 한 번 → 상품·카테고리·배송비 정책·주문 상품 줄·매출처·과세 여부를 읽어 DB센터로 보냄
//   ③ 끝나면 운영 홈이 이 파일의 applyDailySync를 25개씩 불러 발주오라에서 바뀐 칸(가져올 변경 pull)을 DB센터에 반영하고,
//      발주오라에만 있는 새 상품을 DB센터에 숨김으로 등록(설정)한 뒤 마지막 동기화 시각·요약을 남깁니다.
// - 양쪽에서 바뀐 칸(both)과 처음부터 다른 칸(initial)은 저절로 바꾸지 않습니다(동기화 화면에서 관리자가 고름).
// - 정산(공급사 정산·판매 수수료)은 불러온 주문·판매 줄로 계산되므로 함께 최신이 됩니다.
// - 진행 상태는 baljuora_sync_store `daily_sync` = { run: 반영 중인 회차, last: 마지막으로 끝난 회차 }에 둡니다(같은 회차를 두 번 반영하지 않음).
import { and, desc, eq, like } from "drizzle-orm";
import { canPullDiff, canPushDiff } from "@repo/shared/baljuora-sync";
import { DatabaseError, getDb } from "../_core/db";
import { baljuoraSyncJobs, baljuoraSyncStore, type BaljuoraSyncJob } from "../db/schema";
import { expireStaleJobs, getBaljuoraSettings, jobView, listBaljuoraChanges, pullFromBaljuora } from "./baljuora-sync";

const STORE_DAILY = "daily_sync";
const CHUNK = 25;
// 같은 회차를 두 창에서 동시에 반영하지 않게 잠깐 잠급니다(멈춘 요청이 있어도 이 시간이 지나면 다시 반영).
const LOCK_MS = 90_000;
// 이보다 오래된 아침 동기화 읽기 결과는 운영 홈이 저절로 반영하지 않습니다(다시 누르라고 안내).
export const DAILY_APPLY_WINDOW_HOURS = 12;

export type DailySummary = {
  jobId: string;
  // 발주오라를 다 읽은 때(책갈피 끝)와 DB센터 반영을 마친 때(= 마지막 동기화)
  comparedAt: string | null;
  startedAt: string;
  finishedAt: string | null;
  totalProducts: number;
  totalOnly: number;
  updated: number;
  created: number;
  unchanged: number;
  failed: number;
  skippedFields: number;
  failures: Array<{ name: string; error: string }>;
  // 양쪽에서 바뀐 칸이 있는 상품(저절로 바꾸지 않음)
  conflicts: number;
  // 반영 뒤 남은 것: DB센터에서 바꿔 발주오라로 보낼 상품 · 발주오라에 새로 등록할 노출 상품 · 처음부터 다른 칸만 있는 상품
  pushPending: number;
  newPending: number;
  initialPending: number;
  products: { received: number; linked: number; baljuoraOnly: number } | null;
  sales: { lines: number; buyers: number; complete: boolean; error: string | null; start: string | null; end: string | null } | null;
};
type DailyRun = DailySummary & { pendingProducts: string[]; pendingOnly: string[]; lockedUntil: string | null };
type DailyStore = { run: DailyRun | null; last: DailySummary | null };

function nowIso() {
  return new Date().toISOString();
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function isMissingSyncTable(error: unknown) {
  const texts = [error instanceof Error ? error.message : String(error), (error as { cause?: { message?: string } })?.cause?.message ?? ""];
  return texts.some((text) => /no such table/i.test(text) && /baljuora_sync/i.test(text));
}

async function readDaily(): Promise<DailyStore> {
  const row = (await getDb().select({ value: baljuoraSyncStore.value }).from(baljuoraSyncStore).where(eq(baljuoraSyncStore.key, STORE_DAILY)).limit(1))[0];
  const parsed = parseJson<Partial<DailyStore> | null>(row?.value, null);
  return { run: parsed?.run ?? null, last: parsed?.last ?? null };
}

async function writeDaily(store: DailyStore) {
  const value = JSON.stringify(store);
  const updatedAt = nowIso();
  await getDb().insert(baljuoraSyncStore).values({ key: STORE_DAILY, value, updatedAt })
    .onConflictDoUpdate({ target: baljuoraSyncStore.key, set: { value, updatedAt } });
}

// 가장 최근 아침 동기화 작업(상태 상관없음)
// 운영 홈이 2초마다 부르므로 큰 칸(상품별 결과·발주오라에만 있는 상품·기술 정보)은 읽지 않습니다(2026-11-27).
async function latestDailyJob(): Promise<BaljuoraSyncJob | null> {
  const rows = await getDb().select({
    id: baljuoraSyncJobs.id,
    codeHash: baljuoraSyncJobs.codeHash,
    type: baljuoraSyncJobs.type,
    status: baljuoraSyncJobs.status,
    plan: baljuoraSyncJobs.plan,
    progress: baljuoraSyncJobs.progress,
    summary: baljuoraSyncJobs.summary,
    createdBy: baljuoraSyncJobs.createdBy,
    createdAt: baljuoraSyncJobs.createdAt,
    startedAt: baljuoraSyncJobs.startedAt,
    finishedAt: baljuoraSyncJobs.finishedAt,
    expiresAt: baljuoraSyncJobs.expiresAt
  }).from(baljuoraSyncJobs)
    .where(and(eq(baljuoraSyncJobs.type, "compare"), like(baljuoraSyncJobs.plan, '%"daily":true%')))
    .orderBy(desc(baljuoraSyncJobs.createdAt)).limit(1);
  return rows[0] ? { ...rows[0], results: null, diagnostics: null } : null;
}

function publicSummary(run: DailyRun | DailySummary | null): DailySummary | null {
  if (!run) return null;
  const summary: Partial<DailyRun> = { ...run };
  delete summary.pendingProducts;
  delete summary.pendingOnly;
  delete summary.lockedUntil;
  return summary as DailySummary;
}

function readJobFacts(job: BaljuoraSyncJob) {
  const summary = parseJson<{ received?: number; linked?: number; baljuoraOnly?: number; sales?: { lines?: number; buyers?: number; complete?: boolean; error?: string | null } | null } | null>(job.summary, null);
  const plan = parseJson<{ sales?: { start?: string; end?: string } | null } | null>(job.plan, null);
  return {
    products: summary ? { received: Number(summary.received ?? 0), linked: Number(summary.linked ?? 0), baljuoraOnly: Number(summary.baljuoraOnly ?? 0) } : null,
    sales: summary?.sales ? {
      lines: Number(summary.sales.lines ?? 0),
      buyers: Number(summary.sales.buyers ?? 0),
      complete: summary.sales.complete === true,
      error: typeof summary.sales.error === "string" ? summary.sales.error : null,
      start: plan?.sales?.start ?? null,
      end: plan?.sales?.end ?? null
    } : null
  };
}

// 운영 홈 버튼 아래: 마지막 동기화(끝난 회차)·지금 작업·반영할 것이 남았는지
export async function getDailySyncStatus() {
  try {
    const [store, latest] = await Promise.all([readDaily(), latestDailyJob()]);
    // 만료 시각이 지난 작업이 있을 때만 만료로 바꿉니다(2초마다 쓰기를 하지 않음).
    const stale = Boolean(latest && (latest.status === "waiting" || latest.status === "running") && latest.expiresAt < nowIso());
    if (stale) await expireStaleJobs();
    const job = stale ? await latestDailyJob() : latest;
    const run = store.run && job && store.run.jobId === job.id ? store.run : null;
    const fresh = Boolean(job?.finishedAt && Date.now() - Date.parse(job.finishedAt) < DAILY_APPLY_WINDOW_HOURS * 3600_000);
    const applied = Boolean(job && store.last?.jobId === job.id);
    return {
      ready: true,
      last: publicSummary(store.last),
      job: job ? jobView(job) : null,
      // 읽기가 끝났는데 아직 DB센터에 반영하지 않은 회차(운영 홈이 저절로 이어서 반영)
      needsApply: Boolean(job && job.status === "done" && !applied && fresh),
      stale: Boolean(job && job.status === "done" && !applied && !fresh),
      applying: run ? { done: run.totalProducts + run.totalOnly - run.pendingProducts.length - run.pendingOnly.length, total: run.totalProducts + run.totalOnly } : null
    };
  } catch (error) {
    if (isMissingSyncTable(error)) return { ready: false, last: null, job: null, needsApply: false, stale: false, applying: null };
    throw error;
  }
}

async function remainingCounts() {
  const changes = await listBaljuoraChanges();
  const updates = changes.items.filter((item) => item.kind === "update");
  return {
    changes,
    conflicts: updates.filter((item) => item.diffs.some((diff) => diff.direction === "both")).length,
    pushPending: updates.filter((item) => item.diffs.some((diff) => canPushDiff(diff, false))).length,
    newPending: changes.items.filter((item) => item.kind === "new" && item.isVisible).length,
    initialPending: updates.filter((item) => item.diffs.length > 0 && item.diffs.every((diff) => diff.direction === "initial" && !canPullDiff(diff, false))).length
  };
}

// 다음 25개를 반영합니다. 운영 홈이 status가 "done"이 될 때까지 되풀이해 부릅니다.
export async function applyDailySync(changedBy: string) {
  const job = await latestDailyJob();
  if (!job) throw new DatabaseError("DATABASE_QUERY_FAILED", "아침 동기화로 읽은 발주오라 값이 없어요. 운영 홈의 '발주오라 → DB센터 동기화'를 먼저 눌러 주세요.", 400);
  if (job.status !== "done") throw new DatabaseError("DATABASE_QUERY_FAILED", job.status === "waiting" || job.status === "running" ? "발주오라 값을 아직 읽는 중이에요. 책갈피가 끝나면 이어서 반영해요." : "마지막 아침 동기화가 끝나지 않았어요(만료·실패). 버튼을 다시 눌러 주세요.", 409);
  const store = await readDaily();
  if (store.last?.jobId === job.id && store.run?.jobId !== job.id) {
    return { status: "done" as const, done: store.last.totalProducts + store.last.totalOnly, total: store.last.totalProducts + store.last.totalOnly, last: store.last };
  }
  const now = nowIso();
  let run = store.run?.jobId === job.id ? store.run : null;
  if (run?.lockedUntil && Date.parse(run.lockedUntil) > Date.now()) {
    return { status: "busy" as const, done: run.totalProducts + run.totalOnly - run.pendingProducts.length - run.pendingOnly.length, total: run.totalProducts + run.totalOnly, last: publicSummary(store.last) };
  }
  if (!run) {
    // 이번 회차에 반영할 것: 발주오라에서 바뀐 칸(가져올 변경, 양쪽에서 바뀐 칸 제외)이 있는 상품 + 발주오라에만 있는 새 상품(설정)
    const [settings, remaining] = await Promise.all([getBaljuoraSettings(), remainingCounts()]);
    const pendingProducts = remaining.changes.items
      .filter((item) => item.kind === "update" && item.diffs.some((diff) => canPullDiff(diff, false) && diff.direction !== "both"))
      .map((item) => item.productId);
    // 자동 등록은 새 상품만: DB센터에서 지운 상품(상품코드가 같음)은 되살리지 않고, DB센터에 이름이 같은 신규 등록 상품이 있으면
    // 같은 상품이 두 개 생기지 않게 만들지 않습니다(둘 다 발주오라 동기화 화면에서 직접 고름 — 2026-11-27 직원 신고).
    const pendingOnly = settings.dailyRegisterNew ? remaining.changes.baljuoraOnly.filter((snapshot) => !snapshot.deletedMatch && !snapshot.sameNameProduct).map((snapshot) => snapshot.id) : [];
    run = {
      jobId: job.id,
      comparedAt: job.finishedAt,
      startedAt: now,
      finishedAt: null,
      totalProducts: pendingProducts.length,
      totalOnly: pendingOnly.length,
      updated: 0,
      created: 0,
      unchanged: 0,
      failed: 0,
      skippedFields: 0,
      failures: [],
      conflicts: remaining.conflicts,
      pushPending: 0,
      newPending: 0,
      initialPending: 0,
      ...readJobFacts(job),
      pendingProducts,
      pendingOnly,
      lockedUntil: null
    };
  }
  run.lockedUntil = new Date(Date.now() + LOCK_MS).toISOString();
  await writeDaily({ run, last: store.last });
  try {
    if (run.pendingProducts.length > 0) {
      const chunk = run.pendingProducts.slice(0, CHUNK);
      const result = await pullFromBaljuora({ productIds: chunk, onlyPulled: true, skipConflicts: true }, changedBy);
      run.updated += result.updated;
      run.unchanged += result.unchanged;
      run.failed += result.failed.length;
      run.skippedFields += result.skipped.length;
      run.failures = [...run.failures, ...result.failed.map((entry) => ({ name: entry.name, error: entry.error }))].slice(0, 10);
      run.pendingProducts = run.pendingProducts.slice(CHUNK);
    } else if (run.pendingOnly.length > 0) {
      const chunk = run.pendingOnly.slice(0, CHUNK);
      const result = await pullFromBaljuora({ baljuoraIds: chunk }, changedBy);
      run.created += result.created;
      run.failed += result.failed.length;
      run.failures = [...run.failures, ...result.failed.map((entry) => ({ name: entry.name, error: entry.error }))].slice(0, 10);
      run.pendingOnly = run.pendingOnly.slice(CHUNK);
    }
  } catch (error) {
    run.lockedUntil = null;
    await writeDaily({ run, last: store.last });
    throw error;
  }
  const total = run.totalProducts + run.totalOnly;
  const done = total - run.pendingProducts.length - run.pendingOnly.length;
  if (run.pendingProducts.length === 0 && run.pendingOnly.length === 0) {
    // 다 반영함 → 남은 것(보낼 변경·새 상품·처음부터 다름·양쪽에서 바뀜)을 세고 마지막 동기화로 남깁니다.
    const remaining = await remainingCounts();
    const finished: DailySummary = {
      ...(publicSummary(run) as DailySummary),
      finishedAt: nowIso(),
      conflicts: remaining.conflicts,
      pushPending: remaining.pushPending,
      newPending: remaining.newPending,
      initialPending: remaining.initialPending
    };
    await writeDaily({ run: null, last: finished });
    return { status: "done" as const, done, total, last: finished };
  }
  run.lockedUntil = null;
  await writeDaily({ run, last: store.last });
  return { status: "applying" as const, done, total, last: publicSummary(store.last) };
}
