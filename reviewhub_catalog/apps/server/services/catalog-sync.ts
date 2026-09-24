import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../_core/db";
import { externalProductLinks, productSyncOutbox, products, syncRuns } from "../db/schema";

const provider = "baljuora";

export async function enqueueProductSync(
  productId: string,
  action: "create" | "update" | "price" | "visibility" | "soldout" | "delete" | "image",
  payload: Record<string, unknown>
) {
  const now = new Date().toISOString();
  const rows = await getDb().insert(productSyncOutbox).values({
    provider,
    productId,
    action,
    payload: JSON.stringify(payload),
    status: "blocked",
    attempts: 0,
    lastError: "발주오라 공식 쓰기 API 계약이 확인되지 않아 대기 중입니다.",
    createdAt: now
  }).returning();
  return rows[0] ?? null;
}

export async function getCatalogSyncOverview() {
  const db = getDb();
  const [links, pending, failed, blocked, latestRun, productCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(externalProductLinks).where(eq(externalProductLinks.provider, provider)),
    db.select({ count: sql<number>`count(*)` }).from(productSyncOutbox).where(eq(productSyncOutbox.status, "pending")),
    db.select({ count: sql<number>`count(*)` }).from(productSyncOutbox).where(eq(productSyncOutbox.status, "failed")),
    db.select({ count: sql<number>`count(*)` }).from(productSyncOutbox).where(eq(productSyncOutbox.status, "blocked")),
    db.select().from(syncRuns).where(eq(syncRuns.provider, provider)).orderBy(desc(syncRuns.startedAt)).limit(1),
    db.select({ count: sql<number>`count(*)` }).from(products)
  ]);
  return {
    provider,
    sourceOfTruth: "doogofood",
    target: "baljuora",
    initialImport: {
      status: latestRun[0]?.status ?? "not_started",
      total: latestRun[0]?.total ?? 0,
      imported: latestRun[0]?.createdCount ?? 0,
      lastRunAt: latestRun[0]?.finishedAt ?? latestRun[0]?.startedAt ?? null
    },
    products: Number(productCount[0]?.count ?? 0),
    linkedProducts: Number(links[0]?.count ?? 0),
    outbox: {
      pending: Number(pending[0]?.count ?? 0),
      failed: Number(failed[0]?.count ?? 0),
      blocked: Number(blocked[0]?.count ?? 0)
    },
    writeIntegration: {
      status: "verification_required",
      account: null,
      connectedAt: null,
      reason: "발주오라 로그인은 Cloudflare 사람 인증을 요구합니다. 공식 API 키·OAuth·서버용 토큰이 필요합니다.",
      safeMode: true
    }
  };
}

export async function listSyncRuns(limit = 20) {
  return getDb().select().from(syncRuns)
    .where(eq(syncRuns.provider, provider))
    .orderBy(desc(syncRuns.startedAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function listSyncOutbox(limit = 100) {
  const rows = await getDb().select({
    id: productSyncOutbox.id,
    productId: productSyncOutbox.productId,
    productName: products.name,
    action: productSyncOutbox.action,
    status: productSyncOutbox.status,
    attempts: productSyncOutbox.attempts,
    payload: productSyncOutbox.payload,
    lastError: productSyncOutbox.lastError,
    createdAt: productSyncOutbox.createdAt,
    processedAt: productSyncOutbox.processedAt
  }).from(productSyncOutbox)
    .leftJoin(products, eq(products.id, productSyncOutbox.productId))
    .where(eq(productSyncOutbox.provider, provider))
    .orderBy(desc(productSyncOutbox.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));
  return rows.map((row) => {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(row.payload) as Record<string, unknown>;
    } catch {
      payload = {};
    }
    return { ...row, payload };
  });
}
