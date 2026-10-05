/* POST /api/admin — 마스터 전용
 *  { action: "reset" }                     처음 체험 상태로 되돌리기
 *  { action: "import", db, progress }      백업으로 되돌리기 */
"use strict";
const { send, body, handler } = require("./_lib/http");
const auth = require("./_lib/auth");
const access = require("./_lib/access");
const seed = require("./_lib/seed");
const init = require("./_lib/init");

module.exports = handler(["POST"], async (req, res) => {
  const ids = await auth.identify(req);
  if (!access.isMaster(ids)) return send(res, 403, { error: "forbidden" });
  const b = await body(req);
  if (b.action === "reset") return send(res, 200, { ok: true, docs: await init.replaceAll(seed.seedDocs()) });
  if (b.action === "import") {
    if (!b.db || b.db.version !== 3 || !Array.isArray(b.db.instructors)) return send(res, 400, { error: "format" });
    return send(res, 200, { ok: true, docs: await init.replaceAll(seed.split(b.db, b.progress || {})) });
  }
  send(res, 400, { error: "action" });
});
