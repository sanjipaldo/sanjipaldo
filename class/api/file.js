/* GET /api/file?h=해시 — 사진·첨부 파일. 볼 수 있는 사람에게만 (공개 페이지 사진은 누구나)
 * POST /api/file { data: "data:…;base64,…", scope }  운영자(마스터 · 강사 · 코치)가 파일 하나 올리기 → { url }
 *   scope: pub (클래스 사진 · 배너 — 누구나) · adm (제출 서류 — 운영자만) · vodp:<클래스> (수업 자료 · 전자책 — 그 클래스를 산 회원 · 운영자만)
 *   전자책 파일을 산 회원이 받아 가면 그 주문에 내려받은 때(dlAt)를 남겨요 → 바로 취소(100% 환불) 판단 */
"use strict";
const crypto = require("crypto");
const { send, query, body, handler } = require("./_lib/http");
const store = require("./_lib/store");
const auth = require("./_lib/auth");
const access = require("./_lib/access");

const DATA_RE = /^data:([a-z0-9.+\/-]+)(;[a-z0-9=.+-]+)*;base64,/i;
const MAX_B64 = 4 * 1024 * 1024; // Vercel 함수 요청은 4.5MB 까지 → 파일은 약 3MB 까지
async function upload(req, res) {
  const ids = await auth.identify(req);
  if (!ids.admin) return send(res, 403, { error: "forbidden" });
  const b = await body(req), data = String(b.data || ""), m = data.match(DATA_RE);
  const scope = String(b.scope || "pub");
  if (!m) return send(res, 400, { error: "input" });
  if (!/^(pub|adm|vodp:[\w-]{1,40})$/.test(scope)) return send(res, 400, { error: "scope" });
  const b64 = data.slice(m[0].length);
  if (b64.length > MAX_B64) return send(res, 413, { error: "too-large" });
  const h = crypto.createHash("sha256").update(b64).digest("hex").slice(0, 40);
  await store.putFile(h, m[1].toLowerCase(), b64, scope);
  send(res, 200, { ok: true, url: "/api/file?h=" + h });
}

module.exports = handler(["GET", "POST"], async (req, res) => {
  if (req.method === "POST") return upload(req, res);
  const h = String(query(req).h || "");
  if (!/^[0-9a-f]{16,64}$/.test(h)) return send(res, 400, { error: "input" });
  const f = await store.getFile(h);
  if (!f) return send(res, 404, { error: "notfound" });
  const pub = f.scopes.indexOf("pub") !== -1, ids = pub ? null : await auth.identify(req);
  if (!pub && !access.canReadFile(f.scopes, ids)) return send(res, 403, { error: "forbidden" });
  // 산 회원이 전자책 파일을 받아 가면 주문에 내려받은 때를 남겨요 (바로 취소 판단)
  if (!pub && ids && ids.vod && !ids.admin) for (const sc of f.scopes) if (/^vodp:/.test(sc)) await require("./_lib/vodaccess").markEbookDl(ids, sc.slice(5)).catch((e) => console.error("[file] ebook dl", e && e.message));
  const buf = Buffer.from(f.b64, "base64");
  res.statusCode = 200;
  res.setHeader("Content-Type", f.mime);
  res.setHeader("Content-Length", String(buf.length));
  res.setHeader("Cache-Control", (pub ? "public" : "private") + ", max-age=31536000, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!/^image\//.test(f.mime) || /svg/.test(f.mime)) res.setHeader("Content-Disposition", "attachment");
  res.end(buf);
});
