// 공개 단가표 CPU 줄이기(2026-11-24, 관리자 요청 "Vercel CPU가 과도하게 잡힌다").
// 예전에는 단가표 화면이 열려 있는 동안 1분마다 전체 상품 목록(/api/catalog)을 서버에서 새로 만들었습니다(한 번에 CPU 약 0.33초).
// 이제는
//   ① 관리자·동기화가 무언가를 저장할 때마다 "바뀜 표시"(revision)를 새로 적고,
//   ② 화면은 1분마다 아주 가벼운 /api/catalog/version 으로 바뀐 게 있는지만 묻고, 바뀌었을 때만 전체 목록을 받습니다.
//   ③ 전체 목록도 같은 버전이면 서버가 이미 만들어 둔 응답을 그대로 돌려줍니다.
// 버전 = 바뀜 표시 + 상품·가격변동·활동기록 마지막 번호(rowid, 표를 다 읽지 않음) + 배포 + 한국 시각(시간 단위: 날짜가 바뀌면
// 가격변동 4일·품절 7일 기간이 움직이므로). 진열순서처럼 updatedAt을 바꾸지 않는 저장도 관리자 저장이라 바뀜 표시로 잡힙니다.
import { createHash, randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { apiSuccess } from "@repo/shared/http";
import { executeSql, getDb } from "../_core/db";
import { getPublicCatalog } from "./catalog";

export const CATALOG_REVISION_KEY = "catalog_revision";
// 같은 버전이어도 이 시간이 지나면 한 번 새로 만듭니다(관리자 화면을 거치지 않은 저장에 대비한 안전장치).
const CATALOG_CACHE_MAX_AGE_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function seoulHourKey(now: number) {
  return new Date(now + 9 * HOUR_MS).toISOString().slice(0, 13);
}

let bumpWarned = false;

// 관리자·동기화 저장 뒤에 부릅니다. 실패해도 저장 자체는 성공한 것이므로 오류를 밖으로 던지지 않습니다.
export async function bumpCatalogRevision() {
  const now = new Date().toISOString();
  try {
    await executeSql(
      "insert into baljuora_sync_store (key, value, updatedAt) values (?, ?, ?) on conflict(key) do update set value = excluded.value, updatedAt = excluded.updatedAt",
      [CATALOG_REVISION_KEY, randomUUID(), now]
    );
  } catch (error) {
    if (!bumpWarned) {
      bumpWarned = true;
      console.warn("[catalog-version] revision bump failed:", error instanceof Error ? error.message : String(error));
    }
  }
}

// 공개 단가표 버전(짧은 글자). 표 전체를 읽지 않도록 키 한 줄 + 마지막 번호만 봅니다.
export async function getCatalogVersion(now = Date.now()): Promise<string> {
  const result = await executeSql(
    "select (select value from baljuora_sync_store where key = ?) as revision, (select max(rowid) from products) as productRow, (select max(rowid) from price_histories) as historyRow, (select max(rowid) from catalog_activity_logs) as logRow",
    [CATALOG_REVISION_KEY]
  );
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  const deployment = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || "";
  const parts = [row.revision, row.productRow, row.historyRow, row.logRow, deployment, seoulHourKey(now)].map((value) => (value === null || value === undefined ? "" : String(value)));
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
}

// 관리자(/admin/*)·동기화 결과(/runner/:code/results) 라우터에 붙입니다. 저장(GET·HEAD·OPTIONS가 아닌 요청)이 성공하면 바뀜 표시를 새로 적습니다.
// 운영 홈 화면 배치·관리자 계정처럼 공개 단가표와 상관없는 저장은 바뀜 표시를 적지 않습니다(공개 화면이 괜히 전체를 다시 받지 않게).
const NON_CATALOG_ADMIN_PATH = /\/admin\/(home-layout|admins)(\/|$)/;

export const catalogRevisionMiddleware: MiddlewareHandler = async (c, next) => {
  await next();
  const method = c.req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  if (c.res.status >= 400) return;
  if (NON_CATALOG_ADMIN_PATH.test(c.req.path)) return;
  await bumpCatalogRevision();
};

// 서버에 만들어 둔 응답 재사용은 Vercel(운영·미리보기)에서만 켭니다. 테스트·로컬 개발은 DB를 직접 고치는 일이 많아 늘 새로 만듭니다
// (테스트에서 재사용을 확인할 때는 CATALOG_CACHE=1). 운영 현황(services/catalog-operations.ts)도 같은 기준을 씁니다.
export function catalogCacheEnabled() {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV) || process.env.CATALOG_CACHE === "1";
}

type CachedCatalog = { db: unknown; version: string; body: string; at: number };
let cachedCatalog: CachedCatalog | null = null;
let buildingCatalog: { db: unknown; version: string; promise: Promise<string> } | null = null;

// /api/catalog 응답(JSON 글자). 버전을 먼저 정하고 그 버전으로 저장해, 만드는 도중에 바뀐 저장이 옛 버전에 섞이지 않게 합니다.
export async function publicCatalogBody(now = Date.now()): Promise<string> {
  const db = getDb();
  let version: string | null = null;
  try {
    version = await getCatalogVersion(now);
  } catch {
    version = null;
  }
  if (version && catalogCacheEnabled() && cachedCatalog && cachedCatalog.db === db && cachedCatalog.version === version && now - cachedCatalog.at < CATALOG_CACHE_MAX_AGE_MS) {
    return cachedCatalog.body;
  }
  if (version && catalogCacheEnabled() && buildingCatalog && buildingCatalog.db === db && buildingCatalog.version === version) {
    return buildingCatalog.promise;
  }
  const promise = getPublicCatalog().then((data) => JSON.stringify(apiSuccess({ ...data, catalogVersion: version })));
  if (!version || !catalogCacheEnabled()) return promise;
  const building = { db, version, promise };
  buildingCatalog = building;
  try {
    const body = await promise;
    cachedCatalog = { db, version, body, at: Date.now() };
    return body;
  } finally {
    if (buildingCatalog === building) buildingCatalog = null;
  }
}
