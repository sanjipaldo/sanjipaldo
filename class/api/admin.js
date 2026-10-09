/* POST /api/admin — 마스터 전용
 *  { action: "reset" }                     처음 체험 상태로 되돌리기
 *  { action: "import", db, progress, inquiries, bills }  백업 파일로 되돌리기
 *  { action: "backups" }                   서버 자동 백업 목록
 *  { action: "backup" }                    지금 상태를 서버에 백업
 *  { action: "restore-backup", id }        서버 백업으로 되돌리기
 * 초기화 · 되돌리기 전에는 지금 상태를 서버 백업에 먼저 남긴다 */
"use strict";
const { send, body, handler } = require("./_lib/http");
const auth = require("./_lib/auth");
const access = require("./_lib/access");
const seed = require("./_lib/seed");
const init = require("./_lib/init");
const store = require("./_lib/store");

module.exports = handler(["POST"], async (req, res) => {
  const ids = await auth.identify(req);
  if (!access.isMaster(ids)) return send(res, 403, { error: "forbidden" });
  const b = await body(req);
  if (b.action === "reset") return send(res, 200, { ok: true, docs: await init.replaceAll(seed.seedDocs(), "처음 상태로 되돌리기 전 자동 백업") });
  if (b.action === "import") {
    if (!b.db || b.db.version !== 3 || !Array.isArray(b.db.instructors)) return send(res, 400, { error: "format" });
    const map = seed.split(b.db, b.progress || {});
    const safe = (v) => String(v).replace(/[^a-z0-9_-]/gi, "");
    (Array.isArray(b.inquiries) ? b.inquiries : []).forEach((x) => { if (x && x.id) map["inq:" + safe(x.id)] = x; });
    (Array.isArray(b.bills) ? b.bills : []).forEach((x) => { if (x && x.id && x.instructorId) map["bill:" + safe(x.instructorId) + ":" + safe(x.id)] = x; });
    return send(res, 200, { ok: true, docs: await init.replaceAll(map, "백업 파일 불러오기 전 자동 백업") });
  }
  if (b.action === "backups") return send(res, 200, { ok: true, backups: await store.listBackups() });
  if (b.action === "backup") return send(res, 200, { ok: true, backup: await store.backup("마스터가 직접 백업") });
  if (b.action === "restore-backup") {
    const n = await init.restoreBackup(b.id);
    return n == null ? send(res, 404, { error: "not_found" }) : send(res, 200, { ok: true, docs: n });
  }
  send(res, 400, { error: "action" });
});
