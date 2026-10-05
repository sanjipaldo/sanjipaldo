/* GET /api/file?h=해시 — 사진·첨부 파일. 볼 수 있는 사람에게만 (공개 페이지 사진은 누구나) */
"use strict";
const { send, query, handler } = require("./_lib/http");
const store = require("./_lib/store");
const auth = require("./_lib/auth");
const access = require("./_lib/access");

module.exports = handler(["GET"], async (req, res) => {
  const h = String(query(req).h || "");
  if (!/^[0-9a-f]{16,64}$/.test(h)) return send(res, 400, { error: "input" });
  const f = await store.getFile(h);
  if (!f) return send(res, 404, { error: "notfound" });
  const pub = f.scopes.indexOf("pub") !== -1;
  if (!pub && !access.canReadFile(f.scopes, await auth.identify(req))) return send(res, 403, { error: "forbidden" });
  const buf = Buffer.from(f.b64, "base64");
  res.statusCode = 200;
  res.setHeader("Content-Type", f.mime);
  res.setHeader("Content-Length", String(buf.length));
  res.setHeader("Cache-Control", (pub ? "public" : "private") + ", max-age=31536000, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!/^image\//.test(f.mime) || /svg/.test(f.mime)) res.setHeader("Content-Disposition", "attachment");
  res.end(buf);
});
