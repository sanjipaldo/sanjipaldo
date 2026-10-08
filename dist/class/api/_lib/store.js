/* 저장소 — Turso(운영, HTTP) 또는 node:sqlite(로컬 개발) 위에 문서(doc) 테이블을 둔다.
 *
 *  docs        k(키) · v(JSON, 지우면 NULL) · ver(버전) · updated(바뀐 시각) · created(순서)
 *  files       사진·첨부 (data: URL 을 떼어 내 보관, 주소는 /api/file?h=해시)
 *  file_scopes 파일마다 누가 볼 수 있는지 (pub · content:강사 · prog:강사:학생 …)
 *  rl          로그인 실패 횟수 (무차별 대입 막기)
 *  backups     문서 전체 백업 (배포 · 초기화 · 복원 · 일회성 작업 전에 자동으로, 최근 40개)
 *  oplog       사용자가 요청한 일회성 데이터 작업을 언제 했는지 (같은 작업을 두 번 하지 않게)
 *
 * 데이터 보존 원칙: 배포할 때 이미 저장된 내용은 지우거나 바꾸지 않는다 (빠진 칸만 채움).
 * 지우기는 강사센터 · 마스터에서 사람이 직접 할 때만. 요청받은 데이터 수정은 oneoff.js 에 한 번만 도는 작업으로.
 */
"use strict";

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS docs (k TEXT PRIMARY KEY, v TEXT, ver INTEGER NOT NULL DEFAULT 1, updated INTEGER NOT NULL, created INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS docs_updated ON docs(updated)",
  "CREATE TABLE IF NOT EXISTS files (h TEXT PRIMARY KEY, mime TEXT NOT NULL, b64 TEXT NOT NULL, size INTEGER NOT NULL, created INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS file_scopes (h TEXT NOT NULL, scope TEXT NOT NULL, PRIMARY KEY (h, scope))",
  "CREATE TABLE IF NOT EXISTS rl (k TEXT PRIMARY KEY, n INTEGER NOT NULL, until INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS backups (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, reason TEXT, docs INTEGER, size INTEGER, data TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS oplog (id TEXT PRIMARY KEY, at INTEGER NOT NULL, note TEXT, result TEXT)"
];

/* Turso HTTP API (Hrana v2 pipeline) — 의존성 없이 fetch 로 부른다 */
function tursoClient(url, token) {
  const base = url.replace(/^libsql:\/\//, "https://").replace(/\/+$/, "");
  const toArg = (v) => {
    if (v === null || v === undefined) return { type: "null" };
    if (typeof v === "number") return Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: v };
    return { type: "text", value: String(v) };
  };
  const fromVal = (x) => {
    if (!x || x.type === "null") return null;
    if (x.type === "integer") return Number(x.value);
    if (x.type === "float") return Number(x.value);
    if (x.type === "blob") return Buffer.from(x.base64 || "", "base64").toString("utf8");
    return x.value;
  };
  async function batch(stmts) {
    const body = { requests: stmts.map((s) => ({ type: "execute", stmt: { sql: s.sql, args: (s.args || []).map(toArg) } })).concat([{ type: "close" }]) };
    const r = await fetch(base + "/v2/pipeline", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error("turso " + r.status + ": " + (await r.text()).slice(0, 300));
    const j = await r.json();
    return stmts.map((s, i) => {
      const res = j.results[i];
      if (!res || res.type !== "ok") throw new Error("turso: " + ((res && res.error && res.error.message) || "unknown error") + " — " + s.sql.slice(0, 80));
      const rs = res.response.result;
      const cols = rs.cols.map((c) => c.name);
      return { rows: rs.rows.map((row) => { const o = {}; row.forEach((v, k) => { o[cols[k]] = fromVal(v); }); return o; }), affected: rs.affected_row_count || 0 };
    });
  }
  return { kind: "turso", batch };
}

/* 로컬 개발용: Node 22+ 내장 SQLite (같은 SQL) */
function sqliteClient(file) {
  const { DatabaseSync } = require("node:sqlite");
  const d = new DatabaseSync(file);
  const run = (s) => {
    const st = d.prepare(s.sql);
    const args = s.args || [];
    if (/^\s*(select|with|pragma)\b/i.test(s.sql) || /\breturning\b/i.test(s.sql)) return { rows: st.all(...args), affected: 0 };
    const info = st.run(...args);
    return { rows: [], affected: Number(info.changes) || 0 };
  };
  return { kind: "sqlite", batch: async (stmts) => stmts.map(run) };
}

let client = null, ready = null;
function getClient() {
  if (client) return client;
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) client = tursoClient(process.env.TURSO_DATABASE_URL, process.env.TURSO_AUTH_TOKEN);
  else if (process.env.CLASS_SQLITE) client = sqliteClient(process.env.CLASS_SQLITE);
  else throw new Error("데이터베이스 설정이 없어요 (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN)");
  return client;
}
async function db() {
  const c = getClient();
  if (!ready) ready = c.batch(SCHEMA.map((sql) => ({ sql }))).catch((e) => { ready = null; throw e; });
  await ready;
  return c;
}
async function exec(sql, args) { return (await (await db()).batch([{ sql, args }]))[0]; }
async function batch(stmts) { return (await db()).batch(stmts); }

/* ---------------- 문서 ---------------- */
const parse = (row) => (row.v == null ? null : JSON.parse(row.v));
async function getDocs(keys) {
  if (!keys.length) return {};
  const out = {};
  const res = await exec("SELECT k, v, ver FROM docs WHERE k IN (" + keys.map(() => "?").join(",") + ")", keys);
  res.rows.forEach((r) => { out[r.k] = { v: parse(r), ver: r.ver }; });
  return out;
}
async function getDoc(k) { return (await getDocs([k]))[k] || null; }
/** 문서 목록 — prefixes 를 주면 그 접두사(예: "stu:moon:")로 시작하는 것만 */
async function listDocs(opts) {
  opts = opts || {};
  const where = [], args = [];
  if (opts.since != null) { where.push("updated > ?"); args.push(opts.since); } else where.push("v IS NOT NULL");
  if (opts.prefixes) {
    where.push("(" + opts.prefixes.map((p) => { if (p.endsWith("%")) { args.push(p); return "k LIKE ?"; } args.push(p); return "k = ?"; }).join(" OR ") + ")");
  }
  const res = await exec("SELECT k, v, ver, created FROM docs WHERE " + where.join(" AND ") + " ORDER BY created, k", args);
  return res.rows.map((r) => ({ k: r.k, v: parse(r), ver: r.ver }));
}
/** 낙관적 잠금으로 쓰기 — 그새 다른 사람이 바꿨으면 false (다시 읽어서 다시 적용) */
async function writeDoc(k, v, prevVer, created) {
  const now = Date.now();
  const json = v == null ? null : JSON.stringify(v);
  if (prevVer == null) {
    const r = await exec("INSERT INTO docs (k, v, ver, updated, created) VALUES (?, ?, 1, ?, ?) ON CONFLICT(k) DO NOTHING", [k, json, now, created == null ? now : created]);
    return r.affected ? 1 : false;
  }
  const r = await exec("UPDATE docs SET v = ?, ver = ver + 1, updated = ? WHERE k = ? AND ver = ?", [json, now, k, prevVer]);
  return r.affected ? prevVer + 1 : false;
}
async function countDocs() { return (await exec("SELECT COUNT(*) AS n FROM docs WHERE v IS NOT NULL")).rows[0].n; }

/* ---------------- 파일 ---------------- */
async function putFile(h, mime, b64, scope) {
  await batch([
    { sql: "INSERT INTO files (h, mime, b64, size, created) VALUES (?, ?, ?, ?, ?) ON CONFLICT(h) DO NOTHING", args: [h, mime, b64, Math.floor(b64.length * 0.75), Date.now()] },
    { sql: "INSERT INTO file_scopes (h, scope) VALUES (?, ?) ON CONFLICT(h, scope) DO NOTHING", args: [h, scope] }
  ]);
}
async function getFile(h) {
  const [f, s] = await batch([
    { sql: "SELECT mime, b64 FROM files WHERE h = ?", args: [h] },
    { sql: "SELECT scope FROM file_scopes WHERE h = ?", args: [h] }
  ]);
  if (!f.rows.length) return null;
  return { mime: f.rows[0].mime, b64: f.rows[0].b64, scopes: s.rows.map((x) => x.scope) };
}

/* ---------------- 로그인 실패 제한 ---------------- */
const RL_WINDOW = 15 * 60 * 1000;
async function rlCheck(keys, limit) {
  const res = await exec("SELECT k, n, until FROM rl WHERE k IN (" + keys.map(() => "?").join(",") + ")", keys);
  const now = Date.now();
  return res.rows.some((r) => r.until > now && r.n >= limit);
}
async function rlFail(keys) {
  const now = Date.now();
  await batch(keys.map((k) => ({
    sql: "INSERT INTO rl (k, n, until) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = CASE WHEN until < ? THEN 1 ELSE n + 1 END, until = CASE WHEN until < ? THEN ? ELSE until END",
    args: [k, now + RL_WINDOW, now, now, now + RL_WINDOW]
  })));
}
async function rlClear(keys) { await batch(keys.map((k) => ({ sql: "DELETE FROM rl WHERE k = ?", args: [k] }))); }

/* 초기화(마스터) — 문서를 지운다. 사진·첨부(files)는 백업으로 되돌릴 때 필요하니 남겨 둔다 */
async function wipe() { await batch([{ sql: "DELETE FROM docs" }, { sql: "DELETE FROM rl" }]); }

/* ---------------- 백업 ---------------- */
const KEEP_BACKUPS = 40;
async function backup(reason) {
  const rows = (await exec("SELECT k, v, ver, updated, created FROM docs")).rows;
  if (!rows.length) return null;
  const data = JSON.stringify(rows);
  await exec("INSERT INTO backups (at, reason, docs, size, data) VALUES (?, ?, ?, ?, ?)", [Date.now(), String(reason || "").slice(0, 120), rows.length, data.length, data]);
  await exec("DELETE FROM backups WHERE id NOT IN (SELECT id FROM backups ORDER BY id DESC LIMIT " + KEEP_BACKUPS + ")");
  return { docs: rows.length, size: data.length };
}
async function listBackups() { return (await exec("SELECT id, at, reason, docs, size FROM backups ORDER BY id DESC LIMIT " + KEEP_BACKUPS)).rows; }
async function backupRows(id) {
  const r = (await exec("SELECT data FROM backups WHERE id = ?", [Number(id)])).rows[0];
  return r ? JSON.parse(r.data) : null;
}
/** 백업 그대로 문서를 되돌린다 (지금 상태도 먼저 백업) */
async function restoreRows(rows) {
  // 버전은 지금보다 크게 — 되돌리기 전에 열려 있던 화면의 저장이 되돌린 내용을 덮어쓰지 못하게
  const cur = {};
  (await exec("SELECT k, ver FROM docs")).rows.forEach((r) => { cur[r.k] = r.ver; });
  await batch([{ sql: "DELETE FROM docs" }]);
  const now = Date.now();
  const stmts = rows.map((r) => ({ sql: "INSERT INTO docs (k, v, ver, updated, created) VALUES (?, ?, ?, ?, ?) ON CONFLICT(k) DO NOTHING", args: [r.k, r.v, Math.max(r.ver || 1, cur[r.k] || 0) + 1, now, r.created] }));
  for (let i = 0; i < stmts.length; i += 40) await batch(stmts.slice(i, i + 40));
  return stmts.length;
}

/* ---------------- 일회성 작업 기록 ---------------- */
async function opsDone() { return new Set((await exec("SELECT id FROM oplog")).rows.map((r) => r.id)); }
async function opMark(id, note, result) { await exec("INSERT INTO oplog (id, at, note, result) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING", [id, Date.now(), note || "", JSON.stringify(result || {}).slice(0, 2000)]); }

module.exports = { exec, batch, getDoc, getDocs, listDocs, writeDoc, countDocs, putFile, getFile, rlCheck, rlFail, rlClear, wipe, backup, listBackups, backupRows, restoreRows, opsDone, opMark, kind: () => getClient().kind };
