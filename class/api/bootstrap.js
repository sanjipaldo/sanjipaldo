/* GET /api/bootstrap            처음 불러오기 — 이 사람이 볼 수 있는 문서 전부
 * GET /api/bootstrap?since=ms   그 뒤로 바뀐 문서만 (다른 기기·다른 사람의 변경 받기) */
"use strict";
const { send, query, handler } = require("./_lib/http");
const store = require("./_lib/store");
const auth = require("./_lib/auth");
const access = require("./_lib/access");
const init = require("./_lib/init");

module.exports = handler(["GET"], async (req, res) => {
  const q = query(req);
  const since = q.since != null && q.since !== "" ? Number(q.since) : null;
  if (since == null) await init.ensureSeeded();
  const ids = await auth.identify(req);
  const now = Date.now();
  const pre = access.prefixesFor(ids);
  const rows = await store.listDocs({ since, prefixes: pre ? pre.concat("sys") : null });
  const docs = [];
  let epoch = null;
  rows.forEach((r) => {
    if (r.k === "sys") { epoch = r.v && r.v.epoch; return; }
    const v = access.view(r.k, r.v, ids);
    if (v !== undefined) docs.push([r.k, v, r.ver]);
  });
  send(res, 200, { mode: "server", now, epoch, me: auth.publicMe(ids), docs });
});
