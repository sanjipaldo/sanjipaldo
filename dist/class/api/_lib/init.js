/* 처음 데이터 넣기 · 초기화 · 정리 */
"use strict";
const store = require("./store");
const seed = require("./seed");
const { extractFiles } = require("./ops");
const access = require("./access");

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
/** 마스터: 처음 상태로 / 백업으로 되돌리기 */
async function replaceAll(map) {
  await store.wipe();
  const n = await insertAll(map);
  await setEpoch();
  return n;
}
/** 배포할 때: 지금 데이터에 새 기본값·정리를 적용 (바뀐 문서만 버전을 올려 저장) */
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

module.exports = { ensureSeeded, replaceAll, migrate, insertAll, setEpoch };
