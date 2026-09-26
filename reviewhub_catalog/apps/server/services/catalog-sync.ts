import { desc, eq, sql } from "drizzle-orm";
import { DatabaseError, getDb } from "../_core/db";
import { env } from "../_core/env";
import { externalProductLinks, integrationConnections, productSyncOutbox, products, syncRuns } from "../db/schema";

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
  const [links, pending, failed, blocked, latestRun, productCount, connection] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(externalProductLinks).where(eq(externalProductLinks.provider, provider)),
    db.select({ count: sql<number>`count(*)` }).from(productSyncOutbox).where(eq(productSyncOutbox.status, "pending")),
    db.select({ count: sql<number>`count(*)` }).from(productSyncOutbox).where(eq(productSyncOutbox.status, "failed")),
    db.select({ count: sql<number>`count(*)` }).from(productSyncOutbox).where(eq(productSyncOutbox.status, "blocked")),
    db.select().from(syncRuns).where(eq(syncRuns.provider, provider)).orderBy(desc(syncRuns.startedAt)).limit(1),
    db.select({ count: sql<number>`count(*)` }).from(products),
    getConnection()
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
      status: connection.status === "connected" ? "connected" as const : connection.status === "failed" ? "error" as const : connection.status === "key_registered" ? "verification_required" as const : "disconnected" as const,
      account: connection.mallId,
      connectedAt: connection.status === "connected" ? connection.lastVerifiedAt : null,
      reason: connection.lastError ?? "",
      safeMode: connection.status !== "connected"
    },
    connection
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

// ── 발주오라 오픈 API 연결 설정 ─────────────────────────────────────────────
// 비밀번호는 받지도 저장하지도 않습니다. API 키는 서버 비밀값(BETTER_AUTH_SECRET)에서 만든 키로 AES-GCM 암호화해 보관합니다.
// "연결됨"은 발주오라 API 주소가 실제로 응답했을 때만 표시합니다(가짜 성공 금지).

export type ConnectionView = {
  mallId: string | null;
  username: string | null;
  apiBaseUrl: string | null;
  apiKeyRegistered: boolean;
  apiKeyLast4: string | null;
  status: "not_configured" | "key_registered" | "connected" | "failed";
  lastVerifiedAt: string | null;
  lastError: string | null;
  autoPush: boolean;
  autoPull: boolean;
};

async function cipherKey() {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${env.BETTER_AUTH_SECRET}:baljuora-api-key`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const fromBase64 = (value: string) => new Uint8Array(Buffer.from(value, "base64"));

async function encryptApiKey(apiKey: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cipherKey(), new TextEncoder().encode(apiKey)));
  return `${toBase64(iv)}.${toBase64(cipher)}`;
}

async function decryptApiKey(stored: string) {
  const [iv, data] = stored.split(".");
  if (!iv || !data) throw new DatabaseError("DATABASE_QUERY_FAILED", "저장된 API 키를 읽을 수 없습니다. 키를 다시 등록해 주세요.", 400);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, await cipherKey(), fromBase64(data));
  return new TextDecoder().decode(plain);
}

async function getConnectionRow() {
  const rows = await getDb().select().from(integrationConnections).where(eq(integrationConnections.provider, provider)).limit(1);
  return rows[0] ?? null;
}

export async function getConnection(): Promise<ConnectionView> {
  const row = await getConnectionRow();
  return {
    mallId: row?.mallId ?? null,
    username: row?.username ?? null,
    apiBaseUrl: row?.apiBaseUrl ?? null,
    apiKeyRegistered: Boolean(row?.apiKeyCipher),
    apiKeyLast4: row?.apiKeyLast4 ?? null,
    status: row?.status ?? "not_configured",
    lastVerifiedAt: row?.lastVerifiedAt ?? null,
    lastError: row?.lastError ?? null,
    autoPush: row?.autoPush ?? false,
    autoPull: row?.autoPull ?? false
  };
}

// 발주오라 도메인(https)만 허용해 다른 서버로 API 키가 나가지 않게 합니다.
export function normalizeBaljuoraApiUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "API 주소 형식이 올바르지 않습니다. 예: https://api.baljuora.com", 400);
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !(host === "baljuora.com" || host.endsWith(".baljuora.com"))) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "API 주소는 https://…baljuora.com 형식의 발주오라 주소만 등록할 수 있습니다.", 400);
  }
  return url.toString().replace(/\/+$/, "");
}

export async function saveConnection(input: { mallId?: string | null; username?: string | null; apiKey?: string | null; apiBaseUrl?: string | null }) {
  const current = await getConnectionRow();
  const apiBaseUrl = input.apiBaseUrl === undefined ? current?.apiBaseUrl ?? null : normalizeBaljuoraApiUrl(input.apiBaseUrl);
  const newKey = input.apiKey?.trim();
  const apiKeyCipher = newKey ? await encryptApiKey(newKey) : current?.apiKeyCipher ?? null;
  const apiKeyLast4 = newKey ? newKey.slice(-4) : current?.apiKeyLast4 ?? null;
  const credentialsChanged = Boolean(newKey) || apiBaseUrl !== (current?.apiBaseUrl ?? null);
  // 키·주소가 바뀌면 다시 연결 확인이 필요합니다(자동 동기화도 끔).
  const status = !apiKeyCipher ? "not_configured" as const : credentialsChanged || !current ? "key_registered" as const : current.status;
  const values = {
    provider,
    mallId: input.mallId === undefined ? current?.mallId ?? null : input.mallId?.trim() || null,
    username: input.username === undefined ? current?.username ?? null : input.username?.trim() || null,
    apiBaseUrl,
    apiKeyCipher,
    apiKeyLast4,
    status,
    lastError: credentialsChanged ? null : current?.lastError ?? null,
    lastVerifiedAt: credentialsChanged ? null : current?.lastVerifiedAt ?? null,
    autoPush: status === "connected" ? current?.autoPush ?? false : false,
    autoPull: status === "connected" ? current?.autoPull ?? false : false,
    updatedAt: new Date().toISOString()
  };
  await getDb().insert(integrationConnections).values(values).onConflictDoUpdate({ target: integrationConnections.provider, set: values });
  return getConnection();
}

async function updateStatus(status: ConnectionView["status"], lastError: string | null, verified: boolean) {
  const now = new Date().toISOString();
  await getDb().update(integrationConnections).set({
    status,
    lastError,
    ...(verified ? { lastVerifiedAt: now } : {}),
    ...(status !== "connected" ? { autoPush: false, autoPull: false } : {}),
    updatedAt: now
  }).where(eq(integrationConnections.provider, provider));
}

export async function verifyConnection() {
  const row = await getConnectionRow();
  if (!row?.apiKeyCipher) throw new DatabaseError("DATABASE_QUERY_FAILED", "먼저 발주오라에서 받은 API 키를 등록해 주세요.", 400);
  if (!row.apiBaseUrl) {
    const message = "발주오라 오픈 API 주소가 아직 공개되지 않았습니다. 발주오라에서 API 주소를 받으면 등록 후 다시 확인해 주세요.";
    await updateStatus("key_registered", message, false);
    return { ok: false, message, connection: await getConnection() };
  }
  const apiKey = await decryptApiKey(row.apiKeyCipher);
  try {
    const response = await fetch(row.apiBaseUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, "X-API-Key": apiKey, Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(8000)
    });
    if (response.ok) {
      await updateStatus("connected", null, true);
      return { ok: true, message: "발주오라 API가 응답했습니다. 연결됨으로 표시합니다.", connection: await getConnection() };
    }
    const message = response.status === 401 || response.status === 403
      ? `발주오라가 API 키를 거절했습니다(${response.status}). 키를 확인해 주세요.`
      : `발주오라 API 응답 오류(${response.status})로 연결을 확인하지 못했습니다.`;
    await updateStatus("failed", message, true);
    return { ok: false, message, connection: await getConnection() };
  } catch {
    const message = "발주오라 API 주소에 접속하지 못했습니다. 주소를 확인하거나 잠시 후 다시 시도해 주세요.";
    await updateStatus("failed", message, true);
    return { ok: false, message, connection: await getConnection() };
  }
}

export async function disconnectConnection() {
  await getDb().update(integrationConnections).set({
    apiKeyCipher: null,
    apiKeyLast4: null,
    status: "not_configured",
    lastError: null,
    lastVerifiedAt: null,
    autoPush: false,
    autoPull: false,
    updatedAt: new Date().toISOString()
  }).where(eq(integrationConnections.provider, provider));
  return getConnection();
}

export async function setAutoSync(input: { autoPush?: boolean; autoPull?: boolean }) {
  const current = await getConnection();
  if ((input.autoPush || input.autoPull) && current.status !== "connected") {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "발주오라 API 연결이 확인된 뒤에 자동 동기화를 켤 수 있습니다.", 409);
  }
  await getDb().update(integrationConnections).set({
    ...(input.autoPush !== undefined ? { autoPush: input.autoPush } : {}),
    ...(input.autoPull !== undefined ? { autoPull: input.autoPull } : {}),
    updatedAt: new Date().toISOString()
  }).where(eq(integrationConnections.provider, provider));
  return getConnection();
}
