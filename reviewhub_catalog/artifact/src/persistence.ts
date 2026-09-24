// 페이지 데이터베이스(claude db) ↔ 브라우저 SQLite 저장/불러오기.
// SQLite 파일을 160KB 조각으로 나누고, 조각 내용의 해시를 문서 id로 써서 바뀐 조각만 다시 씁니다.
// full/*  : 전체 DB (편집 권한자만 읽기·쓰기)
// pub/*   : 원가·매입처·요청자 연락처 등을 지운 공개용 DB (모든 열람자 읽기, 편집 권한자만 쓰기)
// inbox/<열람자 id> : 편집 권한이 없는 열람자가 보낸 소싱 요청 (본인만 쓰기, 편집 권한자만 읽기)
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import wasmBase64 from "virtual:sqljs-wasm";

export const SEGMENT_BYTES = 160 * 1024;

type DocSnap = { exists: boolean; data(): Record<string, unknown> | undefined };
type DocRef = {
  get(): Promise<DocSnap>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  onSnapshot(next: (snap: DocSnap) => void, error?: (e: unknown) => void): () => void;
};
type QuerySnap = { docs: Array<DocSnap & { id: string }> };
export type DbApi = {
  doc(path: string): DocRef;
  collection(path: string): { get(): Promise<QuerySnap> };
};
export type Meta = { version: number; segments: string[]; size: number; savedAt: string; previous: string[] };

let sqlPromise: Promise<SqlJsStatic> | null = null;
export function loadSqlJs() {
  sqlPromise ??= (async () => {
    return initSqlJs({ wasmBinary: base64ToBytes(wasmBase64).buffer as ArrayBuffer });
  })();
  return sqlPromise;
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function pipeThrough(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const response = new Response(new Blob([copy]).stream().pipeThrough(stream));
  return new Uint8Array(await response.arrayBuffer());
}

async function hashHex(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", copy));
  return Array.from(digest.subarray(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }));
  return results;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function readMeta(db: DbApi, prefix: string): Promise<Meta | null> {
  const snap = await db.doc(`${prefix}/meta`).get();
  return snap.exists ? (snap.data() as unknown as Meta) : null;
}

export async function readDatabaseBytes(db: DbApi, prefix: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const meta = await readMeta(db, prefix);
    if (!meta) return null;
    const parts = await mapLimit(meta.segments, 6, async (hash) => {
      const snap = await db.doc(`${prefix}/meta/seg/${hash}`).get();
      const data = snap.exists ? snap.data() : undefined;
      if (!data || typeof data.d !== "string") return null;
      return pipeThrough(base64ToBytes(data.d), new DecompressionStream("gzip"));
    });
    if (parts.every((part): part is Uint8Array => part !== null)) {
      const bytes = new Uint8Array(meta.size);
      let offset = 0;
      for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
      return { meta, bytes };
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error("저장된 데이터를 읽는 중 조각이 맞지 않습니다. 잠시 후 새로고침해 주세요.");
}

export async function writeDatabaseBytes(db: DbApi, prefix: string, bytes: Uint8Array, previous: Meta | null): Promise<Meta> {
  const segments: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += SEGMENT_BYTES) segments.push(bytes.subarray(offset, offset + SEGMENT_BYTES));
  const hashes = await Promise.all(segments.map(hashHex));
  const existing = new Set(previous?.segments ?? []);
  const pending = new Map<string, Uint8Array>();
  hashes.forEach((hash, index) => { if (!existing.has(hash)) pending.set(hash, segments[index]); });
  await mapLimit([...pending.entries()], 4, async ([hash, segment]) => {
    const gz = await pipeThrough(segment, new CompressionStream("gzip"));
    await db.doc(`${prefix}/meta/seg/${hash}`).set({ d: bytesToBase64(gz), n: segment.byteLength });
  });
  const meta: Meta = {
    version: (previous?.version ?? 0) + 1,
    segments: hashes,
    size: bytes.byteLength,
    savedAt: new Date().toISOString(),
    previous: previous?.segments ?? []
  };
  await db.doc(`${prefix}/meta`).set(meta as unknown as Record<string, unknown>);
  // 두 세대 전 조각 중 더 이상 쓰이지 않는 것만 정리합니다(읽는 중인 열람자를 위해 직전 세대는 남김).
  const keep = new Set([...meta.segments, ...meta.previous]);
  const stale = [...new Set(previous?.previous ?? [])].filter((hash) => !keep.has(hash));
  await mapLimit(stale, 4, (hash) => db.doc(`${prefix}/meta/seg/${hash}`).delete().catch(() => undefined));
  return meta;
}

// 공개용 DB: 관리자 전용 정보(원가, 매입처, 계정, 요청자 연락처, 연동 내역, 매출)를 지운 사본.
export const PUBLIC_SCRUB_SQL = `
DELETE FROM session; DELETE FROM account; DELETE FROM verification; DELETE FROM user;
DELETE FROM sourcing_requests; DELETE FROM product_sync_outbox; DELETE FROM sync_runs;
DELETE FROM external_product_links; DELETE FROM suppliers; DELETE FROM sales_daily_suppliers;
DELETE FROM storage_files; DELETE FROM todos;
DELETE FROM product_options WHERE productId IN (SELECT id FROM products WHERE deletedAt IS NOT NULL);
DELETE FROM products WHERE deletedAt IS NOT NULL;
UPDATE products SET costPrice = 0, supplierName = NULL;
UPDATE product_options SET costPrice = 0;
DELETE FROM price_histories WHERE field = 'costPrice';
`;

export function buildPublicBytes(SQL: SqlJsStatic, fullBytes: Uint8Array) {
  const copy: Database = new SQL.Database(fullBytes);
  try {
    copy.exec(PUBLIC_SCRUB_SQL);
    copy.exec("VACUUM");
    return copy.export();
  } finally {
    copy.close();
  }
}
