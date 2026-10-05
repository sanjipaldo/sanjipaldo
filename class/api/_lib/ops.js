/* 문서 바꾸기 — 브라우저는 바뀐 부분(경로 + 값)만 보내고, 서버는 지금 값 위에 적용한다.
 * 그래서 같은 문서의 다른 부분을 두 사람이 동시에 고쳐도 둘 다 남는다
 * (예: 코치가 과제를 승인하는 사이 수강생이 다른 과제를 제출).
 *
 * op = { p: [경로…], v: 값 }       해당 위치를 값으로
 *      { p: [경로…], d: 1 }        해당 키를 지움
 *      { p: [경로…, 번호], v, a: 1 } 배열 끝에 추가 (동시에 추가해도 둘 다 남음)
 */
"use strict";
const crypto = require("crypto");

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const BAD_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function applyOps(doc, ops) {
  for (const op of ops || []) {
    const p = Array.isArray(op.p) ? op.p : [];
    if (p.some((x) => BAD_KEYS.has(String(x)))) continue;
    if (!p.length) { doc = op.d ? null : op.v; continue; }
    if (doc === null || typeof doc !== "object") doc = typeof p[0] === "number" ? [] : {};
    let cur = doc;
    for (let i = 0; i < p.length - 1; i++) {
      const k = p[i], nextIsIndex = typeof p[i + 1] === "number";
      if (cur[k] === null || typeof cur[k] !== "object") cur[k] = nextIsIndex ? [] : {};
      cur = cur[k];
    }
    const last = p[p.length - 1];
    if (op.d) { if (Array.isArray(cur)) cur.splice(Number(last), 1); else delete cur[last]; }
    else if (op.a && Array.isArray(cur)) cur.push(op.v);
    else cur[last] = op.v;
  }
  return doc;
}

/* data: URL(사진·첨부)을 떼어 files 에 보관하고 /api/file?h= 주소로 바꾼다 */
const DATA_RE = /^data:([a-z0-9.+\/-]+)(;[a-z0-9=.+-]+)*;base64,/i;
function extractFiles(value, scopeOf) {
  const found = [];
  const walk = (x, path) => {
    if (typeof x === "string") {
      if (x.length > 120 && x.startsWith("data:")) {
        const m = x.match(DATA_RE);
        if (!m) return x;
        const b64 = x.slice(m[0].length);
        const h = crypto.createHash("sha256").update(b64).digest("hex").slice(0, 40);
        found.push({ h, mime: m[1].toLowerCase(), b64, scope: scopeOf(path) });
        return "/api/file?h=" + h;
      }
      return x;
    }
    if (Array.isArray(x)) { for (let i = 0; i < x.length; i++) x[i] = walk(x[i], path.concat(i)); return x; }
    if (isObj(x)) { Object.keys(x).forEach((k) => { x[k] = walk(x[k], path.concat(k)); }); return x; }
    return x;
  };
  const out = walk(value, []);
  return { value: out, files: found };
}

module.exports = { applyOps, extractFiles, isObj };
