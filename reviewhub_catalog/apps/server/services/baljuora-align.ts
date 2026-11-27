// 발주오라와 똑같이 맞추기(1차) — 2026-11-27 관리자 요청
// "발주오라 전체 상품이 품절이든 미노출이든 2,998개인데 DB센터는 2,140개. 2,998개 전체를 DB센터로 가져오고
//  판매중·품절·미노출·전체 상품 수를 DB센터와 발주오라가 똑같게(상품도 다 가져와야 한다는 뜻)."
//
// 마지막으로 읽은 발주오라 값(연결 기록 + '발주오라에만 있음', 묶음 상품 제외)을 기준으로 DB센터를 맞춥니다. 발주오라는 바꾸지 않습니다.
//   ① 이름 같은 상품 연결(안전한 것만) → ② 발주오라에만 있는 상품 가져오기(지운 상품 되살림, 발주오라 노출·품절 그대로, 진열순서 맨 뒤)
//   → ③ 연결 상품의 품절·노출을 발주오라 값으로.
// 오래전부터 발주오라에 있던 상품이라 공개 '가격변동'·'품절이슈'·'신규상품'에 오늘 일로 남기지 않습니다(quiet, 새로 만든 상품은 신규상품에서 뺌).
// 한 번에 다 못 하면(서버 함수 60초) 나눠서 이어 합니다: 관리자 화면이 끝날 때까지 POST /api/baljuora/admin/align/run을 되풀이하고,
// 운영 배포 때는 빌드가 한 번만 끝까지 돌립니다(runAlignOnDeploy, deploy-tasks.ts).
import { eq } from "drizzle-orm";
import { DatabaseError, getDb } from "../_core/db";
import { baljuoraSyncStore, contentSettings } from "../db/schema";
import {
  alignLinkedStates,
  getBaljuoraAlignState,
  linkSameNameProducts,
  pullFromBaljuora,
  resurfaceOrphanSnapshots,
  type BaljuoraAlignCounts,
  type BaljuoraAlignState
} from "./baljuora-sync";
import { assertNothingRunning } from "./baljuora-ops-sync";
import { saveSetting } from "./catalog";
import { bumpCatalogRevision } from "./catalog-version";

const STORE_ALIGN = "align_all";
const SAME_NAME_CHUNK = 50;
const IMPORT_CHUNK = 40;
const STATE_CHUNK = 150;
const MAX_FAILURES = 40;
// 다른 창·배포가 같은 때 맞추지 않게 잡는 시간(한 번 부를 때의 시간 + 여유)
const LOCK_EXTRA_MS = 30_000;

export type AlignTrigger = "deploy" | "admin";
type AlignTotals = { linked: number; removed: number; imported: number; restored: number; created: number; states: number; failed: number };
type AlignFailure = { step: "link" | "import" | "state"; id: string; name: string; error: string };
type AlignSide = { doogo: BaljuoraAlignCounts; baljuora: BaljuoraAlignCounts & { unknown: number } };
type AlignRun = {
  startedAt: string;
  by: string;
  trigger: AlignTrigger;
  lockUntil: string | null;
  // 실패했거나 바뀌지 않은 것은 같은 회차에서 다시 하지 않음(끝없이 되풀이하지 않게)
  skip: { sameName: string[]; imports: string[]; states: string[] };
  totals: AlignTotals;
  failures: AlignFailure[];
  createdIds: string[];
  before: AlignSide;
  lastCompareAt: string | null;
};
export type AlignLast = {
  startedAt: string;
  finishedAt: string;
  by: string;
  trigger: AlignTrigger;
  totals: AlignTotals;
  failures: AlignFailure[];
  before: AlignSide;
  after: AlignSide;
  doogoOnly: number;
  sameNameReview: number;
  bundles: number;
  lastCompareAt: string | null;
  // 맞춘 뒤 전체·판매중·품절·노출·미노출 수가 같은지(DB센터에만 있는 상품이 있으면 그만큼 다름)
  matched: boolean;
};
type AlignStore = { run: AlignRun | null; last: AlignLast | null; deployTasks: Record<string, { at: string; result: string }> };

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

async function readAlign(): Promise<AlignStore> {
  const row = (await getDb().select({ value: baljuoraSyncStore.value }).from(baljuoraSyncStore).where(eq(baljuoraSyncStore.key, STORE_ALIGN)).limit(1))[0];
  const parsed = parseJson<Partial<AlignStore> | null>(row?.value, null);
  return { run: parsed?.run ?? null, last: parsed?.last ?? null, deployTasks: parsed?.deployTasks && typeof parsed.deployTasks === "object" ? parsed.deployTasks : {} };
}

async function writeAlign(store: AlignStore) {
  const value = JSON.stringify(store);
  const updatedAt = nowIso();
  await getDb().insert(baljuoraSyncStore).values({ key: STORE_ALIGN, value, updatedAt })
    .onConflictDoUpdate({ target: baljuoraSyncStore.key, set: { value, updatedAt } });
}

function sideOf(state: BaljuoraAlignState): AlignSide {
  return { doogo: { ...state.doogo }, baljuora: { ...state.baljuora } };
}

function emptyTotals(): AlignTotals {
  return { linked: 0, removed: 0, imported: 0, restored: 0, created: 0, states: 0, failed: 0 };
}

// 맞춘 뒤 수가 같은지: DB센터 품절은 상품 리스트 '품절' 칸(isSoldOut), 판매중은 품절도 시즌종료도 아닌 상품
function sideMatched(side: AlignSide) {
  const { doogo, baljuora } = side;
  return doogo.total === baljuora.total && doogo.soldOut === baljuora.soldOut && doogo.selling === baljuora.selling
    && doogo.visible === baljuora.visible && doogo.hidden === baljuora.hidden;
}

function pendingOf(state: BaljuoraAlignState, run: AlignRun | null) {
  const skip = run?.skip ?? { sameName: [], imports: [], states: [] };
  const sameName = state.sameNameIds.filter((id) => !skip.sameName.includes(id));
  const imports = state.importIds.filter((id) => !skip.imports.includes(id));
  const states = state.stateIds.filter((id) => !skip.states.includes(id));
  return { sameName, imports, states };
}

function lockActive(run: AlignRun | null) {
  return Boolean(run?.lockUntil && Date.parse(run.lockUntil) > Date.now());
}

// 화면에 보여 줄 모양(상품 id 목록 대신 수만)
function viewOf(state: BaljuoraAlignState, store: AlignStore) {
  const pending = pendingOf(state, store.run);
  return {
    compared: state.compared,
    lastCompareAt: state.lastCompareAt,
    bundles: state.bundles,
    doogo: state.doogo,
    baljuora: state.baljuora,
    linked: state.linked,
    doogoOnly: state.doogoOnly,
    pending: {
      sameName: pending.sameName.length,
      sameNameReview: state.sameNameReview,
      imports: pending.imports.length,
      importRestore: state.importRestore,
      orphans: state.orphans,
      states: pending.states.length,
      stateDetail: state.stateDetail,
      total: pending.sameName.length + pending.imports.length + pending.states.length
    },
    matched: sideMatched(sideOf(state)),
    run: store.run ? {
      startedAt: store.run.startedAt,
      trigger: store.run.trigger,
      active: lockActive(store.run),
      totals: store.run.totals,
      failures: store.run.failures.length
    } : null,
    last: store.last
  };
}

export type AlignView = ReturnType<typeof viewOf>;

export async function getAlignOverview(): Promise<AlignView> {
  const [state, store] = await Promise.all([getBaljuoraAlignState(), readAlign()]);
  return viewOf(state, store);
}

function pushFailures(run: AlignRun, step: AlignFailure["step"], failed: Array<{ id: string; name: string; error: string }>) {
  run.totals.failed += failed.length;
  for (const item of failed) {
    if (run.failures.length >= MAX_FAILURES) break;
    run.failures.push({ step, id: item.id, name: item.name, error: item.error.slice(0, 300) });
  }
}

// 이번에 새로 만든 상품은 공개 '신규상품'에서 뺍니다(발주오라에 오래 있던 상품 — 신규상품 설정의 '신규상품에서 빼기'와 같음).
async function hideFromNewProducts(ids: string[]) {
  if (ids.length === 0) return;
  const row = (await getDb().select({ value: contentSettings.value }).from(contentSettings).where(eq(contentSettings.key, "new_products")).limit(1))[0];
  const parsed = parseJson<{ days?: unknown; hidden?: unknown } | null>(row?.value, null);
  const days = typeof parsed?.days === "number" && Number.isInteger(parsed.days) && parsed.days >= 1 && parsed.days <= 30 ? parsed.days : 7;
  const previous = Array.isArray(parsed?.hidden) ? parsed.hidden.filter((id): id is string => typeof id === "string" && id.trim().length > 0) : [];
  const hidden = [...new Set([...previous, ...ids])].slice(-5000);
  await saveSetting("new_products", JSON.stringify({ days, hidden }));
}

function logLine(event: string, data: Record<string, unknown>) {
  // 운영 확인용: 수만 남깁니다(상품 이름·값 없음).
  console.info(`[baljuora-align] ${event} ${JSON.stringify(data)}`);
}

// 한 번 부를 때 budgetMs 동안 할 수 있는 만큼 합니다. 다 끝나면 done: true와 마지막 결과(last)를 돌려줍니다.
export async function runAlignStep(input: { budgetMs: number; by: string; trigger: AlignTrigger }) {
  const startedAt = Date.now();
  const store = await readAlign();
  if (lockActive(store.run)) {
    return { done: false, busy: true, view: viewOf(await getBaljuoraAlignState(), store) };
  }
  await assertNothingRunning();
  let state = await getBaljuoraAlignState();
  if (!state.compared) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "발주오라 상품을 아직 읽지 않았어요. 동기화 화면에서 '발주오라 상품 불러오기(비교)'를 먼저 해 주세요.", 400);
  }
  if (!store.run) {
    store.run = {
      startedAt: nowIso(),
      by: input.by,
      trigger: input.trigger,
      lockUntil: null,
      skip: { sameName: [], imports: [], states: [] },
      totals: emptyTotals(),
      failures: [],
      createdIds: [],
      before: sideOf(state),
      lastCompareAt: state.lastCompareAt
    };
    logLine("start", { trigger: input.trigger, before: store.run.before, sameName: state.sameNameIds.length, imports: state.importIds.length, importRestore: state.importRestore, states: state.stateIds.length, stateDetail: state.stateDetail, doogoOnly: state.doogoOnly.total, bundles: state.bundles });
  }
  const run = store.run;
  run.lockUntil = new Date(Date.now() + input.budgetMs + LOCK_EXTRA_MS).toISOString();
  await writeAlign(store);

  let finished = false;
  try {
    while (Date.now() - startedAt < input.budgetMs) {
      const pending = pendingOf(state, run);
      // ① 이름 같은 상품 연결
      if (pending.sameName.length > 0) {
        const chunk = pending.sameName.slice(0, SAME_NAME_CHUNK);
        const result = await linkSameNameProducts(chunk);
        run.totals.linked += result.linked;
        run.totals.removed += result.removed;
        const linkedIds = new Set(result.items.map((item) => item.productId));
        // 잇지 못한 것은 이번 회차에서 다시 하지 않고 '신규 등록' 탭에 남깁니다.
        run.skip.sameName.push(...chunk.filter((id) => !linkedIds.has(id)));
        pushFailures(run, "link", result.failed);
        logLine("link", { tried: chunk.length, linked: result.linked, removed: result.removed, failed: result.failed.length });
      } else if (pending.imports.length > 0) {
        // ② 발주오라에만 있는 상품 가져오기(발주오라 노출·품절 그대로, 진열순서 맨 뒤, 공개 기록 없이)
        // 마지막 비교 뒤 DB센터에서 지운 상품과 이어져 있던 발주오라 상품은 먼저 '발주오라에만 있음'에 다시 넣습니다.
        if (state.orphans > 0) {
          const added = await resurfaceOrphanSnapshots();
          logLine("resurface", { added });
        }
        const chunk = pending.imports.slice(0, IMPORT_CHUNK);
        const result = await pullFromBaljuora({ baljuoraIds: chunk, placeAtEnd: true, visibility: "baljuora", quiet: true }, input.by);
        run.totals.imported += result.created;
        run.totals.restored += result.restored;
        run.totals.created += result.created - result.restored;
        run.createdIds.push(...result.createdIds);
        pushFailures(run, "import", result.failed);
        // 실패한 것·찾지 못한 것은 다시 하지 않음(가져온 것은 '발주오라에만 있음'에서 빠짐)
        const failedIds = new Set(result.failed.map((item) => item.id));
        const after = await getBaljuoraAlignState();
        const stillOnly = new Set(after.importIds);
        run.skip.imports.push(...chunk.filter((id) => failedIds.has(id) || stillOnly.has(id)));
        logLine("import", { tried: chunk.length, imported: result.created, restored: result.restored, failed: result.failed.length, left: after.importIds.length });
        state = after;
        await writeAlign(store);
        continue;
      } else if (pending.states.length > 0) {
        // ③ 연결 상품의 품절·노출을 발주오라 값으로
        const chunk = pending.states.slice(0, STATE_CHUNK);
        const result = await alignLinkedStates(chunk, input.by);
        run.totals.states += result.updated;
        pushFailures(run, "state", result.failed);
        const after = await getBaljuoraAlignState();
        const stillDifferent = new Set(after.stateIds);
        run.skip.states.push(...chunk.filter((id) => stillDifferent.has(id)));
        logLine("states", { tried: chunk.length, updated: result.updated, failed: result.failed.length, left: after.stateIds.length });
        state = after;
        await writeAlign(store);
        continue;
      } else {
        finished = true;
        break;
      }
      state = await getBaljuoraAlignState();
      await writeAlign(store);
    }
  } finally {
    if (!finished) {
      run.lockUntil = null;
      await writeAlign(store);
    }
  }
  if (!finished) {
    return { done: false, busy: false, view: viewOf(state, store) };
  }

  // 끝: 새로 만든 상품은 신규상품에서 빼고, 공개 단가표 바뀜 표시를 올리고, 결과를 남깁니다.
  try {
    await hideFromNewProducts(run.createdIds);
  } catch (error) {
    logLine("new-products-skip", { error: error instanceof Error ? error.message.slice(0, 120) : "unknown" });
  }
  const after = sideOf(state);
  const last: AlignLast = {
    startedAt: run.startedAt,
    finishedAt: nowIso(),
    by: run.by,
    trigger: run.trigger,
    totals: run.totals,
    failures: run.failures,
    before: run.before,
    after,
    doogoOnly: state.doogoOnly.total,
    sameNameReview: state.sameNameReview,
    bundles: state.bundles,
    lastCompareAt: run.lastCompareAt,
    matched: sideMatched(after)
  };
  store.run = null;
  store.last = last;
  await writeAlign(store);
  if (run.totals.imported + run.totals.states + run.totals.linked > 0) {
    try {
      await bumpCatalogRevision();
    } catch {
      // 바뀜 표시를 못 올려도 공개 화면은 늦어도 1시간 안에 새로 받습니다.
    }
  }
  logLine("done", { trigger: run.trigger, seconds: Math.round((Date.parse(last.finishedAt) - Date.parse(last.startedAt)) / 1000), totals: last.totals, before: last.before, after: last.after, matched: last.matched, doogoOnly: last.doogoOnly, sameNameReview: last.sameNameReview, bundles: last.bundles });
  return { done: true, busy: false, view: viewOf(state, store) };
}

// 운영 배포 때 한 번만(빌드가 부름): 관리자가 요청한 1차 맞추기를 끝까지 돌립니다. 같은 taskKey는 다시 하지 않습니다.
// 시간 안에 못 끝내면 남은 일은 관리자 화면 '발주오라와 똑같이 맞추기' 버튼이 이어서 합니다.
export async function runAlignOnDeploy(options: { taskKey: string; maxMs: number }) {
  const startedAt = Date.now();
  const store = await readAlign();
  if (store.deployTasks[options.taskKey]) {
    return { task: options.taskKey, skipped: "already done" };
  }
  const mark = async (result: string) => {
    const latest = await readAlign();
    latest.deployTasks[options.taskKey] = { at: nowIso(), result };
    await writeAlign(latest);
    logLine("deploy-task", { task: options.taskKey, result });
    return { task: options.taskKey, result };
  };
  let steps = 0;
  try {
    while (Date.now() - startedAt < options.maxMs) {
      const remaining = options.maxMs - (Date.now() - startedAt);
      const outcome = await runAlignStep({ budgetMs: Math.max(5_000, Math.min(120_000, remaining - 5_000)), by: "발주오라 맞추기(배포 때 자동)", trigger: "deploy" });
      steps += 1;
      if (outcome.done) return mark(`done: ${JSON.stringify(outcome.view.last?.totals ?? {})} matched=${outcome.view.last?.matched ?? false}`);
      if (outcome.busy) return mark("skipped: another align run is in progress");
    }
    return mark(`partial after ${steps} steps — 관리자 화면 버튼으로 이어서`);
  } catch (error) {
    return mark(`skipped: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}`);
  }
}
