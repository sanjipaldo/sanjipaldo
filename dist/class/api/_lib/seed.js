/* 처음 데이터와 데이터 정리(마이그레이션) — 브라우저와 똑같은 data.js · db.js 를 그대로 돌려서 만든다.
 * (db.js 의 load() 가 하는 기본값 채우기·정리를 서버에서도 그대로 쓰기 위해) */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const COLLS = ["instructors", "content", "cohorts", "students"];

/** db.js 를 가짜 localStorage 위에서 실행 → { DB, ls } */
function runDbJs(initial) {
  const ls = new Map(Object.entries(initial || {}));
  const localStorage = {
    getItem: (k) => (ls.has(k) ? ls.get(k) : null),
    setItem: (k, v) => { ls.set(k, String(v)); },
    removeItem: (k) => { ls.delete(k); },
    key: (i) => Array.from(ls.keys())[i] || null,
    get length() { return ls.size; }
  };
  const sandbox = { console, Date, Math, JSON, Intl, localStorage };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  ["data.js", "db.js"].forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f }));
  // vm 안의 Object.keys(localStorage) 는 가짜 객체의 키를 못 보므로 store.keys 를 바꿔 준다
  sandbox.DB.store.keys = () => Array.from(ls.keys());
  return { DB: sandbox.DB, ls };
}

/** 데이터 한 덩어리 → 문서들 { 키: 값 } */
function split(db, progress) {
  const out = {};
  const meta = {};
  Object.keys(db).forEach((k) => { if (COLLS.indexOf(k) === -1) meta[k] = db[k]; });
  out.meta = meta;
  (db.instructors || []).forEach((i) => { out["ins:" + i.id] = i; });
  Object.keys(db.content || {}).forEach((iid) => { out["content:" + iid] = db.content[iid]; });
  const byIns = {};
  (db.cohorts || []).forEach((c) => { (byIns[c.instructorId] = byIns[c.instructorId] || []).push(c); });
  Object.keys(byIns).forEach((iid) => { out["cohorts:" + iid] = byIns[iid]; });
  const sIns = {};
  (db.students || []).forEach((s) => { sIns[s.id] = s.instructorId; out["stu:" + s.instructorId + ":" + s.id] = s; });
  Object.keys(progress || {}).forEach((sid) => { if (sIns[sid]) out["prog:" + sIns[sid] + ":" + sid] = progress[sid]; });
  return out;
}
/** 문서들(순서대로) → 데이터 한 덩어리 + 진행 기록 */
function assemble(docs) {
  const db = { instructors: [], content: {}, cohorts: [], students: [] };
  const progress = {};
  docs.forEach(({ k, v }) => {
    if (v == null) return;
    const p = k.split(":");
    if (k === "meta") Object.assign(db, v, { instructors: db.instructors, content: db.content, cohorts: db.cohorts, students: db.students });
    else if (p[0] === "ins") db.instructors.push(v);
    else if (p[0] === "content") db.content[p[1]] = v;
    else if (p[0] === "cohorts") db.cohorts.push(...v);
    else if (p[0] === "stu") db.students.push(v);
    else if (p[0] === "prog") progress[p[2]] = v;
  });
  return { db, progress };
}

/** 처음 상태 (체험 데이터) */
function seedDocs() {
  const { DB, ls } = runDbJs({});
  DB.load();
  const progress = {};
  ls.forEach((v, k) => { if (k.indexOf("moonclass:progress:") === 0) progress[k.slice(19)] = JSON.parse(v); });
  return split(JSON.parse(JSON.stringify(DB.data)), progress);
}

/** 지금 데이터에 db.js 의 정리(새 기본값·마이그레이션)를 적용 → 바뀐 문서만 { 키: 값 } */
function migrateDocs(docs) {
  const { db, progress } = assemble(docs);
  if (db.version !== 3 || !db.instructors.length) throw new Error("데이터 형식이 예상과 달라 정리를 건너뜁니다");
  const init = { "moonclass:db:v2": JSON.stringify(db) };
  Object.keys(progress).forEach((sid) => { init["moonclass:progress:" + sid] = JSON.stringify(progress[sid]); });
  const { DB, ls } = runDbJs(init);
  DB.load();
  const after = JSON.parse(JSON.stringify(DB.data));
  // 안전장치: 강사·수강생이 줄었다면 (예: 처음 상태로 되돌아감) 아무것도 쓰지 않는다
  const ids = (list) => new Set((list || []).map((x) => x.id));
  const bi = ids(db.instructors), ai = ids(after.instructors), bs = ids(db.students), as = ids(after.students);
  if ([...bi].some((x) => !ai.has(x)) || [...bs].some((x) => !as.has(x))) throw new Error("정리 후 데이터가 줄어 쓰지 않습니다");
  const prog = {};
  ls.forEach((v, k) => { if (k.indexOf("moonclass:progress:") === 0) prog[k.slice(19)] = JSON.parse(v); });
  const next = split(after, prog);
  const before = {};
  docs.forEach(({ k, v }) => { if (v != null) before[k] = JSON.stringify(v); });
  const changed = {};
  Object.keys(next).forEach((k) => { if (before[k] !== JSON.stringify(next[k])) changed[k] = next[k]; });
  return changed;
}

module.exports = { seedDocs, migrateDocs, split, assemble };
