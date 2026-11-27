// 운영 홈 동기화 버튼 2개(2026-11-27 관리자 요청 "DB센터 동기화를 2가지로 — ① 주문 동기화: 실제로 주문이 뭐가 들어왔고, 매출처·매입처가
// 누가 추가됐고, 발주오라 통계·거래처 관리·정산 관리·주문 관리·주문 입력 쪽을 동기화 ② 상품 동기화: DB센터에서 신규 상품 추가·가격 변경·
// 삭제·품절·미노출·카테고리·배송 정책 등 상품 수정이 바뀌면 동기화 버튼으로 발주오라도 다 같이 바뀌게").
// 발주오라는 서버가 대신 로그인하지 않으므로(5장 안전 경계) 두 버튼 모두 작업 코드 + 발주오라 관리자 창 + 책갈피 한 번입니다.
//   주문 동기화 = 판매 작업(sales, ops "orders"): 매출처(셀러) → 발주오라 매입처(merchant/suppliers) → 주문 상품 줄 → 과세 여부를 읽어
//     DB센터 판매 줄·매출처를 맞추고, DB센터 공급사 관리에 없는 매입처를 새로 등록합니다(있는 공급사는 바꾸지 않음).
//     판매 현황(통계)·공급사 정산·세금계산서는 이 주문 줄로 계산되므로 함께 최신이 됩니다.
//   상품 동기화 = 비교(compare, ops "products") → 책갈피가 같은 창에서 이어서 보내기(push) 작업을 받아(/runner/:code/next) 실행:
//     DB센터에서 바꾼 칸(보낼 변경 전체와 같은 규칙) · 발주오라에 없는 공개 상품 신규 등록 · DB센터에서 지운 상품 → 발주오라 미노출·품절 ·
//     카테고리 트리 맞추기. 발주오라에서 바뀐 칸·발주오라에만 있는 상품·처음부터 다른 상품 정보 칸은 저절로 바꾸지 않고 수만 알려 줍니다.
// 상태는 baljuora_sync_store `ops_sync` = { orders: { run, last }, products: { run, last } } — run = 지금(마지막으로 시작한) 회차의 작업 id,
// last = 마지막으로 끝난 회차 요약(버튼 밑 "마지막 동기화" 시각). 끝난 요약은 상태를 볼 때 작업 결과로 한 번 만들어 둡니다.
import { and, eq, inArray, lt } from "drizzle-orm";
import { canPushDiff, type BaljuoraFieldDiff, type BaljuoraSyncField } from "@repo/shared/baljuora-sync";
import { DatabaseError, getDb } from "../_core/db";
import { baljuoraSyncJobs, baljuoraSyncStore } from "../db/schema";
import {
  createBaljuoraJob,
  getBaljuoraJob,
  getBaljuoraSettings,
  listBaljuoraChanges,
  loadCategoryTreeSummary,
  reissueBaljuoraJobCode,
  runnerJobByCode,
  type SupplierSyncResult
} from "./baljuora-sync";
import { getOfficialRecentOrders, recentOrderStatus, type RecentOrderStatus } from "./baljuora-sales";

const STORE_OPS = "ops_sync";
// 비교가 끝난 뒤 이 시간 안에만 책갈피가 이어서 보내기를 받을 수 있습니다(작업 코드 만료와 같은 30분).
const CONTINUE_WINDOW_MS = 30 * 60_000;

export type ProductSyncOptions = { updates: boolean; creates: boolean; hides: boolean; categories: boolean };
const DEFAULT_OPTIONS: ProductSyncOptions = { updates: true, creates: true, hides: true, categories: true };

type Sample = { id: string; name: string; code: string | null };
type Counts = { updates: number; creates: number; hides: number; categories: number };
// 이번 동기화에서 저절로 바꾸지 않은 것(운영 홈 '확인할 것' → 발주오라 동기화 화면)
export type ProductSyncLeftovers = {
  // 발주오라에서 바뀐 칸이 있는 상품(DB센터 값으로 되돌리지도, DB센터로 가져오지도 않음)
  pull: number;
  // 처음부터 다른 상품 정보 칸(판매 상태·원산지 등)만 남은 상품 — 맞추기 카드에서 방향을 고름
  initial: number;
  // 발주오라에만 있는 상품(DB센터에서 지운 상품 제외)
  only: number;
  // 신규 등록에서 뺀 공개 상품: 발주오라에 이름이 같은 상품이 있음 · 발주오라에 같은 매입처 상품이 없음(새 매입처)
  sameName: number;
  newSupplier: number;
  // 배송비 정책만 다른데 그 DB센터 정책과 연결한 발주오라 정책이 없어 보내지 못하는 상품
  shippingUnlinked: number;
};

export type ProductSyncPreview = {
  compared: boolean;
  lastCompareAt: string | null;
  linkedCount: number;
  updates: { count: number; conflicts: number; fields: Array<{ field: BaljuoraSyncField; count: number }>; samples: Sample[] };
  creates: { count: number; samples: Sample[] };
  hides: { count: number; samples: Sample[] };
  categories: { count: number; samples: Array<{ name: string; type: string }>; notes: number };
  leftovers: ProductSyncLeftovers;
};

type OrdersRun = { jobId: string; createdAt: string; createdBy: string | null };
export type OrdersSummary = {
  jobId: string;
  finishedAt: string;
  start: string | null;
  end: string | null;
  lines: number;
  newLines: number;
  newOrders: number;
  buyers: number;
  newBuyers: number;
  newBuyerNames: string[];
  suppliers: SupplierSyncResult | null;
  complete: boolean;
  error: string | null;
};
type ProductsRun = {
  compareJobId: string;
  pushJobId: string | null;
  createdAt: string;
  createdBy: string | null;
  options: ProductSyncOptions;
  planned: Counts | null;
  leftovers: ProductSyncLeftovers | null;
  // 비교 뒤 보낼 것이 없었음(보내기 작업을 만들지 않음)
  nothing: boolean;
  error: string | null;
};
export type ProductsSummary = {
  compareJobId: string;
  pushJobId: string | null;
  finishedAt: string;
  received: number | null;
  planned: Counts | null;
  result: { succeeded: number; failed: number; created: number; updated: number; hidden: number; categoryApplied: number; categorySkipped: number } | null;
  failures: Array<{ name: string; error: string }>;
  leftovers: ProductSyncLeftovers | null;
  nothing: boolean;
  error: string | null;
};
type OpsStore = { orders: { run: OrdersRun | null; last: OrdersSummary | null }; products: { run: ProductsRun | null; last: ProductsSummary | null } };

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

async function readOps(): Promise<OpsStore> {
  const row = (await getDb().select({ value: baljuoraSyncStore.value }).from(baljuoraSyncStore).where(eq(baljuoraSyncStore.key, STORE_OPS)).limit(1))[0];
  const parsed = parseJson<Partial<OpsStore> | null>(row?.value, null);
  return {
    orders: { run: parsed?.orders?.run ?? null, last: parsed?.orders?.last ?? null },
    products: { run: parsed?.products?.run ?? null, last: parsed?.products?.last ?? null }
  };
}

async function writeOps(store: OpsStore) {
  const value = JSON.stringify(store);
  const updatedAt = nowIso();
  await getDb().insert(baljuoraSyncStore).values({ key: STORE_OPS, value, updatedAt })
    .onConflictDoUpdate({ target: baljuoraSyncStore.key, set: { value, updatedAt } });
}

type JobView = Awaited<ReturnType<typeof getBaljuoraJob>>;

// 작업 하나를 가볍게(진행·요약만) 읽습니다. 없으면 null.
async function lightJob(id: string | null | undefined): Promise<JobView | null> {
  if (!id) return null;
  try {
    return await getBaljuoraJob(id, { light: true });
  } catch (error) {
    if (error instanceof DatabaseError && error.status === 404) return null;
    throw error;
  }
}

const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : Number(value ?? 0) || 0);

function cleanOptions(input: Partial<ProductSyncOptions> | null | undefined): ProductSyncOptions {
  return {
    updates: input?.updates ?? DEFAULT_OPTIONS.updates,
    creates: input?.creates ?? DEFAULT_OPTIONS.creates,
    hides: input?.hides ?? DEFAULT_OPTIONS.hides,
    categories: input?.categories ?? DEFAULT_OPTIONS.categories
  };
}

// 다른 발주오라 작업이 발주오라 창에서 돌고 있으면 새로 시작하지 않습니다(두 창이 함께 보내면 발주오라 요청 제한(429)에 더 자주 걸림).
export async function assertNothingRunning() {
  const db = getDb();
  await db.update(baljuoraSyncJobs).set({ status: "expired", finishedAt: nowIso() })
    .where(and(inArray(baljuoraSyncJobs.status, ["waiting", "running"]), lt(baljuoraSyncJobs.expiresAt, nowIso())));
  const running = await db.select({ id: baljuoraSyncJobs.id, type: baljuoraSyncJobs.type }).from(baljuoraSyncJobs).where(eq(baljuoraSyncJobs.status, "running")).limit(1);
  if (running[0]) {
    const label = running[0].type === "push" ? "발주오라로 보내기" : running[0].type === "sales" ? "주문·매출처 읽기" : "발주오라 상품 읽기";
    throw new DatabaseError("DATABASE_QUERY_FAILED", `발주오라 창에서 다른 동기화(${label})가 진행 중이에요. 끝난 뒤 다시 눌러 주세요. 창을 닫았다면 진행 칸의 '취소'를 누르거나 30분 뒤 다시 시도해 주세요.`, 409);
  }
}

// ─── 상품 동기화: 무엇을 보낼지 ───────────────────────────────────────────────

function sampleOf(items: Array<{ productId?: string; id?: string; name: string; code: string | null }>, limit = 4): Sample[] {
  return items.slice(0, limit).map((item) => ({ id: item.productId ?? item.id ?? "", name: item.name, code: item.code }));
}

async function productSelection() {
  const [changes, tree, settings] = await Promise.all([listBaljuoraChanges(), loadCategoryTreeSummary(), getBaljuoraSettings()]);
  const map = settings.shippingPolicyMap ?? {};
  // 보낼 변경(전체)과 같은 규칙: 가격 등은 '발주오라에서 바뀜'만 빼고, 상품 정보 칸은 DB센터에서 바꾼 칸만.
  // 배송비 정책은 그 DB센터 정책과 연결한 발주오라 정책이 있을 때만 보낼 수 있습니다.
  const sendable = (diff: BaljuoraFieldDiff) => canPushDiff(diff, false) && (diff.field !== "shippingPolicy" || !diff.doogo || Boolean(map[String(diff.doogo)]));
  const updateItems = changes.items.filter((item) => item.kind === "update");
  const updates = updateItems.filter((item) => item.diffs.some(sendable));
  const shippingUnlinked = updateItems.filter((item) => !item.diffs.some(sendable) && item.diffs.some((diff) => canPushDiff(diff, false))).length;
  const newVisible = changes.items.filter((item) => item.kind === "new" && item.isVisible);
  const creates = newVisible.filter((item) => !item.sameName && !item.newSupplier);
  // DB센터에서 지운 상품과 상품코드가 같은 '발주오라에만 있음' 상품 중 아직 발주오라에서 노출 중이거나 품절이 아닌 것
  const hides = changes.baljuoraOnly.filter((snapshot) => snapshot.deletedMatch && (snapshot.isVisible !== false || snapshot.isSoldOut !== true));
  const fieldCounts = new Map<BaljuoraSyncField, number>();
  for (const item of updates) for (const diff of item.diffs.filter(sendable)) fieldCounts.set(diff.field, (fieldCounts.get(diff.field) ?? 0) + 1);
  const leftovers: ProductSyncLeftovers = {
    pull: updateItems.filter((item) => item.diffs.some((diff) => diff.direction === "pull")).length,
    initial: updateItems.filter((item) => !item.diffs.some(sendable) && item.diffs.some((diff) => diff.direction === "initial")).length,
    only: changes.baljuoraOnly.filter((snapshot) => !snapshot.deletedMatch).length,
    sameName: newVisible.filter((item) => item.sameName).length,
    newSupplier: newVisible.filter((item) => !item.sameName && item.newSupplier).length,
    shippingUnlinked
  };
  return { changes, tree, updates, creates, hides, fieldCounts, leftovers };
}

function previewOf(selection: Awaited<ReturnType<typeof productSelection>>): ProductSyncPreview {
  const { changes, tree, updates, creates, hides, fieldCounts, leftovers } = selection;
  return {
    compared: changes.compared,
    lastCompareAt: changes.lastCompareAt,
    linkedCount: changes.linkedCount,
    updates: {
      count: updates.length,
      conflicts: updates.filter((item) => item.diffs.some((diff) => diff.direction === "both")).length,
      fields: [...fieldCounts.entries()].map(([field, count]) => ({ field, count })).sort((first, second) => second.count - first.count),
      samples: sampleOf(updates)
    },
    creates: { count: creates.length, samples: sampleOf(creates) },
    hides: { count: hides.length, samples: sampleOf(hides) },
    categories: { count: tree.ops.length, samples: tree.ops.slice(0, 4).map((op) => ({ name: op.type === "add" ? op.name : `${op.from} → ${op.to}`, type: op.type })), notes: tree.notes.length },
    leftovers
  };
}

/** 상품 동기화 버튼을 눌렀을 때 보여 줄 '보낼 것' 미리보기(마지막 비교 기준 — 실제로는 발주오라 값을 새로 읽은 뒤 같은 규칙으로 다시 정함) */
export async function previewProductSync(): Promise<ProductSyncPreview> {
  return previewOf(await productSelection());
}

// ─── 시작 ─────────────────────────────────────────────────────────────────────

export async function startOrderSync(createdBy: string | null) {
  await assertNothingRunning();
  const created = await createBaljuoraJob({ type: "sales", ops: "orders" }, createdBy);
  const store = await readOps();
  store.orders.run = { jobId: created.job.id, createdAt: nowIso(), createdBy };
  await writeOps(store);
  return { job: created.job, code: created.code, consoleUrl: created.consoleUrl };
}

export async function startProductSync(options: Partial<ProductSyncOptions> | null, createdBy: string | null) {
  const chosen = cleanOptions(options);
  if (!chosen.updates && !chosen.creates && !chosen.hides && !chosen.categories) throw new DatabaseError("DATABASE_QUERY_FAILED", "보낼 것을 하나 이상 골라 주세요.", 400);
  await assertNothingRunning();
  const created = await createBaljuoraJob({ type: "compare", ops: "products" }, createdBy);
  const store = await readOps();
  store.products.run = { compareJobId: created.job.id, pushJobId: null, createdAt: nowIso(), createdBy, options: chosen, planned: null, leftovers: null, nothing: false, error: null };
  await writeOps(store);
  return { job: created.job, code: created.code, consoleUrl: created.consoleUrl };
}

// 비교가 끝난 뒤: 새로 읽은 발주오라 값으로 보낼 것을 다시 정해 보내기 작업을 만듭니다. 이미 만들었으면(응답을 못 받아 다시 물을 때)
// 그 작업이 아직 기다리는 중이면 새 작업 코드를 줍니다(코드는 SHA-256만 저장해 다시 보여 줄 수 없음).
export async function continueProductSync(compareJobId: string) {
  const store = await readOps();
  const run = store.products.run;
  if (!run || run.compareJobId !== compareJobId) throw new DatabaseError("DATABASE_QUERY_FAILED", "운영 홈 상품 동기화의 마지막 회차가 아니에요. 운영 홈에서 상품 동기화를 다시 눌러 주세요.", 409);
  if (run.pushJobId) {
    const reissued = await reissueBaljuoraJobCode(run.pushJobId);
    return { nothing: false as const, job: reissued.job, code: reissued.code, consoleUrl: reissued.consoleUrl, planned: run.planned };
  }
  if (run.nothing) return { nothing: true as const, planned: run.planned };
  const selection = await productSelection();
  const options = run.options ?? DEFAULT_OPTIONS;
  const productIds = [...(options.updates ? selection.updates.map((item) => item.productId) : []), ...(options.creates ? selection.creates.map((item) => item.productId) : [])];
  const hideBaljuoraIds = options.hides ? selection.hides.map((snapshot) => snapshot.id) : [];
  const categoryTree = options.categories && selection.tree.ops.length > 0;
  run.leftovers = selection.leftovers;
  const markNothing = async () => {
    run.nothing = true;
    run.planned = { updates: 0, creates: 0, hides: 0, categories: 0 };
    run.error = null;
    store.products.run = run;
    await writeOps(store);
    return { nothing: true as const, planned: run.planned };
  };
  if (productIds.length === 0 && hideBaljuoraIds.length === 0 && !categoryTree) return markNothing();
  try {
    const created = await createBaljuoraJob({
      type: "push",
      productIds,
      hideBaljuoraIds,
      categoryTree: categoryTree && productIds.length === 0 && hideBaljuoraIds.length === 0,
      skipCategoryTree: !options.categories,
      ops: "products",
      compareJobId
    }, run.createdBy);
    run.pushJobId = created.job.id;
    run.planned = created.counts ? { updates: created.counts.updates, creates: created.counts.creates, hides: created.counts.hides, categories: created.counts.categories } : null;
    run.error = null;
    store.products.run = run;
    await writeOps(store);
    return { nothing: false as const, job: created.job, code: created.code, consoleUrl: created.consoleUrl, planned: run.planned };
  } catch (error) {
    // 고른 상품이 모두 이미 같아 보낼 칸이 없으면(400) 보낼 것이 없는 회차로 끝냅니다.
    if (error instanceof DatabaseError && error.status === 400) return markNothing();
    run.error = error instanceof Error ? error.message.slice(0, 300) : "보내기 작업을 만들지 못했습니다.";
    store.products.run = run;
    await writeOps(store);
    throw error;
  }
}

/** 책갈피(발주오라 창)가 상품 동기화 비교를 마친 뒤 부릅니다: 같은 창에서 이어서 실행할 보내기 작업 코드를 줍니다. */
export async function runnerNextJob(code: string) {
  const { row, plan } = await runnerJobByCode(code);
  if (!plan || plan.type !== "compare" || plan.ops !== "products") throw new DatabaseError("DATABASE_QUERY_FAILED", "이어서 할 작업이 없는 작업 코드예요.", 400);
  if (row.status !== "done") throw new DatabaseError("DATABASE_QUERY_FAILED", row.status === "failed" ? "발주오라 상품을 다 읽지 못해 보내지 않았어요. 운영 홈에서 상품 동기화를 다시 눌러 주세요." : "발주오라 상품 읽기가 아직 끝나지 않았어요.", 409);
  if (!row.finishedAt || Date.now() - Date.parse(row.finishedAt) > CONTINUE_WINDOW_MS) throw new DatabaseError("DATABASE_QUERY_FAILED", "발주오라 상품을 읽은 지 30분이 지나 이어서 보내지 않았어요. 운영 홈에서 상품 동기화를 다시 눌러 주세요.", 409);
  const result = await continueProductSync(row.id);
  if (result.nothing) return { next: null, planned: result.planned, message: "보낼 변경이 없어요. DB센터 상품과 발주오라 상품이 같습니다." };
  return { next: { code: result.code, type: "push" as const, total: result.job.total ?? 0 }, planned: result.planned, message: null };
}

// ─── 상태(운영 홈이 버튼 밑 마지막 동기화·진행 칸을 그림) ─────────────────────────

function ordersSummaryFrom(job: JobView): OrdersSummary {
  const summary = (job.summary ?? {}) as Record<string, unknown>;
  const suppliers = summary.suppliers && typeof summary.suppliers === "object" ? summary.suppliers as SupplierSyncResult : null;
  return {
    jobId: job.id,
    finishedAt: job.finishedAt ?? nowIso(),
    start: typeof summary.start === "string" ? summary.start : job.salesRange?.start ?? null,
    end: typeof summary.end === "string" ? summary.end : job.salesRange?.end ?? null,
    lines: number(summary.lines),
    newLines: number(summary.newLines),
    newOrders: number(summary.newOrders),
    buyers: number(summary.buyers),
    newBuyers: number(summary.newBuyers),
    newBuyerNames: Array.isArray(summary.newBuyerNames) ? summary.newBuyerNames.filter((name): name is string => typeof name === "string").slice(0, 8) : [],
    suppliers: suppliers ? { read: number(suppliers.read), added: number(suppliers.added), names: Array.isArray(suppliers.names) ? suppliers.names.filter((name): name is string => typeof name === "string").slice(0, 30) : [], fromLines: number(suppliers.fromLines), error: typeof suppliers.error === "string" ? suppliers.error : null } : null,
    complete: summary.complete === true,
    error: typeof summary.error === "string" ? summary.error : null
  };
}

async function productsSummaryFrom(run: ProductsRun, compareJob: JobView | null, pushJob: JobView | null): Promise<ProductsSummary> {
  const compare = (compareJob?.summary ?? {}) as Record<string, unknown>;
  const push = (pushJob?.summary ?? null) as Record<string, unknown> | null;
  const tree = push?.categoryTree && typeof push.categoryTree === "object" ? push.categoryTree as Record<string, unknown> : null;
  let failures: ProductsSummary["failures"] = [];
  if (pushJob && push && number(push.failed) > 0) {
    // 실패한 상품 몇 개만(이름·까닭) — 끝난 작업을 한 번 자세히 읽습니다.
    const detail = await getBaljuoraJob(pushJob.id);
    failures = (detail.items ?? []).filter((item) => !item.ok).slice(0, 6).map((item) => ({ name: item.name ?? item.productId, error: String(item.error ?? "실패") }));
  }
  return {
    compareJobId: run.compareJobId,
    pushJobId: run.pushJobId,
    finishedAt: pushJob?.finishedAt ?? compareJob?.finishedAt ?? nowIso(),
    received: compareJob ? number(compare.received) : null,
    planned: run.planned,
    result: push ? {
      succeeded: number(push.succeeded),
      failed: number(push.failed),
      created: number(push.created),
      updated: number(push.updated),
      hidden: number(push.hidden),
      categoryApplied: tree ? number(tree.applied) : 0,
      categorySkipped: tree ? number(tree.skipped) : 0
    } : null,
    failures,
    leftovers: run.leftovers,
    nothing: run.nothing,
    error: typeof push?.error === "string" ? push.error : null
  };
}

export type ProductSyncPhase = "idle" | "waiting" | "reading" | "linking" | "sending" | "done" | "failed";

function productPhase(run: ProductsRun | null, compareJob: JobView | null, pushJob: JobView | null): ProductSyncPhase {
  if (!run || !compareJob) return "idle";
  if (compareJob.status === "waiting") return "waiting";
  if (compareJob.status === "running") return "reading";
  if (compareJob.status !== "done") return "failed";
  if (run.nothing) return "done";
  if (!pushJob) return run.error ? "failed" : "linking";
  if (pushJob.status === "waiting" || pushJob.status === "running") return "sending";
  return pushJob.status === "done" ? "done" : "failed";
}

export async function getOpsSyncStatus() {
  try {
    const store = await readOps();
    let changed = false;
    const ordersJob = await lightJob(store.orders.run?.jobId);
    if (ordersJob && ordersJob.status === "done" && store.orders.last?.jobId !== ordersJob.id) {
      store.orders.last = ordersSummaryFrom(ordersJob);
      changed = true;
    }
    const run = store.products.run;
    const [compareJob, pushJob] = await Promise.all([lightJob(run?.compareJobId), lightJob(run?.pushJobId)]);
    const phase = productPhase(run, compareJob, pushJob);
    if (run && phase === "done" && store.products.last?.compareJobId !== run.compareJobId) {
      store.products.last = await productsSummaryFrom(run, compareJob, pushJob);
      changed = true;
    }
    if (changed) await writeOps(store);
    let recent: RecentOrderStatus | null = null;
    try {
      recent = await recentOrderStatus(7);
    } catch {
      recent = null;
    }
    // 발주오라 대시보드 '최근 7일간 주문 현황'(주문 동기화 때 책갈피 1.11.0이 읽은 숫자 그대로, 없으면 null)
    const official = await getOfficialRecentOrders();
    return {
      ready: true,
      orders: { job: ordersJob, last: store.orders.last, recent, official },
      products: {
        phase,
        compareJob,
        pushJob,
        options: run?.options ?? null,
        planned: run?.planned ?? null,
        // 비교가 끝났는데 보내기 작업이 2분 넘게 안 만들어졌으면(책갈피 창을 닫았거나 이어 가기가 실패) 운영 홈에서 '이어서 보내기'
        stalled: phase === "linking" && Boolean(compareJob?.finishedAt && Date.now() - Date.parse(compareJob.finishedAt) > 120_000),
        error: run?.error ?? null,
        last: store.products.last
      }
    };
  } catch (error) {
    if (isMissingSyncTable(error)) {
      return { ready: false, orders: { job: null, last: null, recent: null, official: null }, products: { phase: "idle" as ProductSyncPhase, compareJob: null, pushJob: null, options: null, planned: null, stalled: false, error: null, last: null } };
    }
    throw error;
  }
}

/** 운영 홈 '이어서 보내기': 비교는 끝났는데 책갈피가 보내기로 이어 가지 못했을 때 보내기 작업을 만들어 발주오라 창을 다시 엽니다. */
export async function continueProductSyncFromAdmin() {
  const store = await readOps();
  const run = store.products.run;
  if (!run) throw new DatabaseError("DATABASE_QUERY_FAILED", "이어서 보낼 상품 동기화가 없어요. 상품 동기화를 눌러 주세요.", 409);
  const compareJob = await lightJob(run.compareJobId);
  if (!compareJob || compareJob.status !== "done") throw new DatabaseError("DATABASE_QUERY_FAILED", "발주오라 상품 읽기가 끝나지 않아 보낼 수 없어요. 상품 동기화를 다시 눌러 주세요.", 409);
  if (!compareJob.finishedAt || Date.now() - Date.parse(compareJob.finishedAt) > CONTINUE_WINDOW_MS) throw new DatabaseError("DATABASE_QUERY_FAILED", "발주오라 상품을 읽은 지 30분이 지났어요. 최신 값으로 보내도록 상품 동기화를 다시 눌러 주세요.", 409);
  const result = await continueProductSync(run.compareJobId);
  if (result.nothing) return { nothing: true as const, planned: result.planned };
  return { nothing: false as const, job: result.job, code: result.code, consoleUrl: result.consoleUrl, planned: result.planned };
}
