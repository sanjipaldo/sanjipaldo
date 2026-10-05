/* POST /api/sync  { changes: [ { k, base, ops } | { k, base, put } | { k, base, del: true } ] }
 * 바뀐 문서를 저장한다. 권한은 문서마다 확인하고, 그새 다른 사람이 바꿨으면 지금 값 위에 다시 적용한다.
 * 응답의 doc 은 서버에 저장된 결과가 보낸 사람의 화면과 다를 때만 (합쳐졌거나 사진 주소가 바뀌었을 때) 돌려준다. */
"use strict";
const { send, body, handler } = require("./_lib/http");
const store = require("./_lib/store");
const auth = require("./_lib/auth");
const access = require("./_lib/access");
const { applyOps, extractFiles } = require("./_lib/ops");

const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
const MAX_DOC = 2 * 1024 * 1024;

async function applyChange(ch, ids) {
  const k = String((ch && ch.k) || "");
  if (!access.parseKey(k)) return { k, error: "key" };
  for (let attempt = 0; attempt < 6; attempt++) {
    const row = await store.getDoc(k);
    const exists = !!(row && row.v != null);
    const w = access.writer(k, ids, !exists);
    if (!w) return { k, error: "forbidden" };
    let naive;
    if (ch.del) naive = null;
    else if (ch.put !== undefined) naive = clone(ch.put);
    else naive = applyOps(clone(exists ? row.v : null), ch.ops);
    if (!exists && naive == null) return { k, ver: row ? row.ver : 0, doc: null };
    let next = w.fix(exists ? clone(row.v) : null, clone(naive));
    let modified = (Number(ch.base) || 0) !== (row ? row.ver : 0) || JSON.stringify(next) !== JSON.stringify(naive);
    if (next != null) {
      const ex = extractFiles(next, (p) => access.fileScope(k, p));
      next = ex.value;
      if (ex.files.length) {
        modified = true;
        for (const f of ex.files) await store.putFile(f.h, f.mime, f.b64, f.scope);
      }
      if (JSON.stringify(next).length > MAX_DOC) return { k, error: "too-large" };
    }
    const ver = await store.writeDoc(k, next, row ? row.ver : null);
    if (ver === false) continue;
    const out = { k, ver };
    if (modified) out.doc = next == null ? null : access.view(k, next, ids);
    return out;
  }
  return { k, error: "busy" };
}

module.exports = handler(["POST"], async (req, res) => {
  const ids = await auth.identify(req);
  const b = await body(req);
  const changes = Array.isArray(b.changes) ? b.changes.slice(0, 300) : [];
  const results = [];
  for (const ch of changes) results.push(await applyChange(ch, ids));
  send(res, 200, { now: Date.now(), me: auth.publicMe(ids), results });
});
