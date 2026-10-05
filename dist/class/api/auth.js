/* POST /api/auth
 *  { action: "student", iid, name, phone4 }        수강생 로그인
 *  { action: "admin", tab, id, pw }                 강사 · 코치 · 마스터 로그인 (tab: instructor | coach | master)
 *  { action: "logout", which: "student"|"admin" }
 * 비밀번호(전화번호 뒷자리)는 서버에서만 확인하고, 15분에 여러 번 틀리면 잠시 막는다. */
"use strict";
const crypto = require("crypto");
const { send, body, handler, ip } = require("./_lib/http");
const store = require("./_lib/store");
const auth = require("./_lib/auth");

const IP_LIMIT = 40, NAME_LIMIT = 8;
const norm = auth.norm;
const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

async function limited(req, nameKey) {
  return (await store.rlCheck(["ip:" + ip(req)], IP_LIMIT)) || (await store.rlCheck([nameKey], NAME_LIMIT));
}
const fail = (req, nameKey) => store.rlFail(["ip:" + ip(req), nameKey]);

async function studentLogin(req, res, b) {
  const iid = String(b.iid || ""), name = norm(b.name), phone4 = String(b.phone4 || "").trim();
  if (!iid || !name || !/^\d{4}$/.test(phone4)) return send(res, 400, { error: "input" });
  const nameKey = "stu:" + iid + ":" + name;
  if (await limited(req, nameKey)) return send(res, 429, { error: "locked" });
  const ins = await store.getDoc("ins:" + iid);
  if (!ins || !ins.v || ins.v.status !== "active") return send(res, 200, { error: "notfound" });
  const list = (await store.listDocs({ prefixes: ["stu:" + iid + ":%"] })).map((r) => r.v);
  const matches = list.filter((s) => norm(s.name) === name && s.phone4 === phone4);
  const s = matches.find((x) => x.status === "approved") || matches[0];
  if (!s) { await fail(req, nameKey); return send(res, 200, { error: "notfound" }); }
  await store.rlClear([nameKey]);
  if (s.status !== "approved") return send(res, 200, { error: s.status });
  auth.setCookie(req, res, "student", auth.sign({ r: "student", sid: s.id, iid }));
  send(res, 200, { ok: true, sid: s.id, name: s.name });
}

/** 코치 최근 접속 시각 남기기 (실패해도 로그인은 그대로) */
async function touchCoach(iid, cid) {
  for (let i = 0; i < 3; i++) {
    const row = await store.getDoc("ins:" + iid);
    if (!row || !row.v) return;
    const c = (row.v.coaches || []).find((x) => x.id === cid);
    if (!c) return;
    c.lastLoginAt = Date.now();
    if ((await store.writeDoc("ins:" + iid, row.v, row.ver)) !== false) return;
  }
}

async function adminLogin(req, res, b) {
  const tab = String(b.tab || "instructor"), id = String(b.id || "").trim(), pw = String(b.pw || "").trim();
  if (tab === "master") {
    const nameKey = "master";
    if (await limited(req, nameKey)) return send(res, 429, { error: "locked" });
    const want = process.env.MASTER_PASSWORD;
    if (!want) return send(res, 200, { error: "master-disabled" });
    if (id.toUpperCase() !== "ADMIN" || !eq(pw, want)) { await fail(req, nameKey); return send(res, 200, { error: "notfound" }); }
    await store.rlClear([nameKey]);
    auth.setCookie(req, res, "admin", auth.sign({ r: "master" }));
    return send(res, 200, { ok: true, role: "master" });
  }
  const name = norm(id);
  if (!name || !/^\d{4}$/.test(pw)) return send(res, 400, { error: "input" });
  const nameKey = "adm:" + name;
  if (await limited(req, nameKey)) return send(res, 429, { error: "locked" });
  const all = (await store.listDocs({ prefixes: ["ins:%"] })).map((r) => r.v);
  const ins = all.find((x) => norm(x.name) === name && x.phone4 === pw);
  const findCoach = () => {
    for (const i of all) {
      if (i.status !== "active") continue;
      const c = (i.coaches || []).find((x) => norm(x.name) === name && x.phone4 === pw);
      if (c) return { i, c };
    }
    return null;
  };
  const okIns = async () => {
    if (ins.status !== "active") return send(res, 200, { error: "paused-platform" });
    await store.rlClear([nameKey]);
    auth.setCookie(req, res, "admin", auth.sign({ r: "instructor", iid: ins.id }));
    return send(res, 200, { ok: true, role: "instructor", iid: ins.id, name: ins.name });
  };
  const okCoach = async (hit) => {
    if (hit.c.status !== "active") return send(res, 200, { error: "paused-coach" });
    await store.rlClear([nameKey]);
    await touchCoach(hit.i.id, hit.c.id).catch(() => {});
    auth.setCookie(req, res, "admin", auth.sign({ r: "coach", iid: hit.i.id, cid: hit.c.id }));
    return send(res, 200, { ok: true, role: "coach", iid: hit.i.id, cid: hit.c.id, name: hit.c.name });
  };
  // 코치 탭은 코치를 먼저, 강사 탭은 강사를 먼저 찾는다 (탭을 잘못 골라도 들어갈 수 있게)
  const hit = findCoach();
  if (tab === "coach" && hit) return okCoach(hit);
  if (ins) return okIns();
  if (hit) return okCoach(hit);
  await fail(req, nameKey);
  return send(res, 200, { error: "notfound" });
}

module.exports = handler(["POST"], async (req, res) => {
  const b = await body(req);
  if (b.action === "student") return studentLogin(req, res, b);
  if (b.action === "admin") return adminLogin(req, res, b);
  if (b.action === "logout") {
    const w = b.which === "admin" ? ["admin"] : b.which === "student" ? ["student"] : ["student", "admin"];
    w.forEach((x) => auth.setCookie(req, res, x, ""));
    return send(res, 200, { ok: true });
  }
  send(res, 400, { error: "action" });
});
