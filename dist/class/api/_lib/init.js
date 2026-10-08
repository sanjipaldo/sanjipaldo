/* 처음 데이터 넣기 · 초기화 · 정리 */
"use strict";
const store = require("./store");
const seed = require("./seed");
const { extractFiles } = require("./ops");
const access = require("./access");
const oneoff = require("./oneoff");

/** 문서들을 한 번에 넣는다 (이미 있는 키는 건너뜀). order 는 화면 순서(created) */
async function insertAll(map) {
  const now = Date.now();
  const stmts = [], files = [];
  Object.keys(map).forEach((k, i) => {
    const ex = extractFiles(JSON.parse(JSON.stringify(map[k])), (p) => access.fileScope(k, p));
    ex.files.forEach((f) => files.push(f));
    stmts.push({ sql: "INSERT INTO docs (k, v, ver, updated, created) VALUES (?, ?, 1, ?, ?) ON CONFLICT(k) DO NOTHING", args: [k, JSON.stringify(ex.value), now, i] });
  });
  for (let i = 0; i < stmts.length; i += 40) await store.batch(stmts.slice(i, i + 40));
  for (const f of files) await store.putFile(f.h, f.mime, f.b64, f.scope);
  return stmts.length;
}
async function setEpoch() {
  const row = await store.getDoc("sys");
  const v = { epoch: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) };
  if (row) await store.exec("UPDATE docs SET v = ?, ver = ver + 1, updated = ? WHERE k = 'sys'", [JSON.stringify(v), Date.now()]);
  else await store.exec("INSERT INTO docs (k, v, ver, updated, created) VALUES ('sys', ?, 1, ?, -1) ON CONFLICT(k) DO NOTHING", [JSON.stringify(v), Date.now()]);
  return v.epoch;
}
/** 비어 있으면 체험 데이터로 시작 */
async function ensureSeeded() {
  if ((await store.countDocs()) > 0) return false;
  await insertAll(seed.seedDocs());
  await setEpoch();
  return true;
}
/** 마스터: 처음 상태로 / 백업 파일로 되돌리기 (지금 상태를 먼저 서버 백업에 남긴다) */
async function replaceAll(map, reason) {
  await store.backup(reason || "초기화 전 자동 백업");
  await store.wipe();
  const n = await insertAll(map);
  await setEpoch();
  return n;
}
/** 서버 백업으로 되돌리기 (지금 상태도 먼저 백업) */
async function restoreBackup(id) {
  const rows = await store.backupRows(id);
  if (!rows) return null;
  await store.backup("백업 #" + id + " 되돌리기 전 자동 백업");
  const n = await store.restoreRows(rows);
  await setEpoch();
  return n;
}
/** 배포할 때: 아직 안 한 일회성 작업(oneoff.js)을 한 번씩 실행 */
async function runPendingOps(log) {
  const done = await store.opsDone();
  const pending = oneoff.OPS.filter((op) => !done.has(op.id));
  if (!pending.length) return [];
  const rows = (await store.exec("SELECT k, v, ver FROM docs")).rows;
  const cur = {}, ver = {};
  rows.forEach((r) => { cur[r.k] = r.v == null ? null : JSON.parse(r.v); ver[r.k] = r.ver; });
  const get = (k) => (cur[k] == null ? cur[k] : JSON.parse(JSON.stringify(cur[k])));
  const keys = (prefix) => Object.keys(cur).filter((k) => k.indexOf(prefix) === 0).sort();
  const ran = [];
  for (const op of pending) {
    const { writes, result } = op.run(get, keys);
    let ok = true;
    for (const k of Object.keys(writes)) {
      let v = writes[k];
      if (v != null) {
        const ex = extractFiles(v, (p) => access.fileScope(k, p));
        for (const f of ex.files) await store.putFile(f.h, f.mime, f.b64, f.scope);
        v = ex.value;
      }
      if (v == null && cur[k] == null) continue;
      const nv = await store.writeDoc(k, v, ver[k] == null ? null : ver[k]);
      if (nv === false) { ok = false; continue; }
      cur[k] = v; ver[k] = nv;
    }
    // 겹친 변경이 있으면 기록하지 않아 다음 배포 때 다시 시도한다 (작업은 여러 번 돌아도 결과가 같게 짜여 있음)
    if (ok) await store.opMark(op.id, op.note, result);
    ran.push({ id: op.id, note: op.note, ok, result, writes: Object.keys(writes).length });
    if (log) log(op, ok, result, Object.keys(writes).length);
  }
  return ran;
}
/** 배포할 때: 지금 데이터에 새 기본값을 적용 — 빠진 칸만 채우고 저장된 내용은 바꾸지 않는다 */
async function migrate() {
  const rows = await store.listDocs({});
  const docs = rows.filter((r) => r.k !== "sys");
  if (!docs.length) return { changed: [] };
  const changed = seed.migrateDocs(docs);
  const ver = {};
  rows.forEach((r) => { ver[r.k] = r.ver; });
  const done = [];
  for (const k of Object.keys(changed)) {
    const ex = extractFiles(changed[k], (p) => access.fileScope(k, p));
    for (const f of ex.files) await store.putFile(f.h, f.mime, f.b64, f.scope);
    const ok = await store.writeDoc(k, ex.value, ver[k] == null ? null : ver[k]);
    done.push(k + (ok === false ? " (다른 변경과 겹쳐 건너뜀)" : ""));
  }
  return { changed: done };
}

module.exports = { ensureSeeded, replaceAll, restoreBackup, runPendingOps, migrate, insertAll, setEpoch };
