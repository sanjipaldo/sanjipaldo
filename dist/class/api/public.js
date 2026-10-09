/* POST /api/public — 로그인 없이 하는 일
 *  { action: "signup", iid, cohortId, name, phone4 }   수강 신청 (승인 대기로 등록)
 *  { action: "free-question", iid, name, text }        무료강의 페이지 질문 남기기
 *  { action: "partner-apply", name, email, phone, where, course, link, message, agree }
 *                                                       강사 입점 문의 (마스터 → 입점 문의에서 관리) */
"use strict";
const crypto = require("crypto");
const { send, body, handler, ip } = require("./_lib/http");
const store = require("./_lib/store");
const auth = require("./_lib/auth");

const LIMIT = 15;
const kstToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const uid = (p) => p + Date.now().toString(36) + crypto.randomBytes(3).toString("hex").slice(0, 4);

async function signup(req, res, b) {
  const iid = String(b.iid || ""), cohortId = String(b.cohortId || ""), name = String(b.name || "").trim().slice(0, 30), phone4 = String(b.phone4 || "").trim();
  if (!iid || !cohortId || !name || !/^\d{4}$/.test(phone4)) return send(res, 400, { error: "input" });
  const k = "ip-signup:" + ip(req);
  if (await store.rlCheck([k], LIMIT)) return send(res, 429, { error: "locked" });
  const docs = await store.getDocs(["ins:" + iid, "cohorts:" + iid]);
  const ins = (docs["ins:" + iid] || {}).v, cos = (docs["cohorts:" + iid] || {}).v || [];
  if (!ins || ins.status !== "active") return send(res, 200, { error: "notfound" });
  const co = cos.find((c) => c.id === cohortId);
  if (!co || co.recruiting === false) return send(res, 200, { error: "cohort" });
  const list = (await store.listDocs({ prefixes: ["stu:" + iid + ":%"] })).map((r) => r.v);
  const dup = list.find((x) => auth.norm(x.name) === auth.norm(name) && x.phone4 === phone4 && (x.status === "pending" || x.status === "approved"));
  if (dup) return send(res, 200, { error: dup.status === "approved" ? "dup-approved" : "dup-pending" });
  await store.rlFail([k]);
  const s = { id: uid("s"), instructorId: iid, cohortId, name, phone4, status: "pending", appliedAt: kstToday() };
  await store.writeDoc("stu:" + iid + ":" + s.id, s, null);
  send(res, 200, { ok: true });
}

async function freeQuestion(req, res, b) {
  const iid = String(b.iid || ""), text = String(b.text || "").trim().slice(0, 1000), name = String(b.name || "").trim().slice(0, 30);
  if (!iid || !text) return send(res, 400, { error: "input" });
  const k = "ip-fq:" + ip(req);
  if (await store.rlCheck([k], LIMIT)) return send(res, 429, { error: "locked" });
  const q = { id: uid("fq"), name, text, at: Date.now() };
  for (let i = 0; i < 5; i++) {
    const row = await store.getDoc("content:" + iid);
    if (!row || !row.v) return send(res, 200, { error: "notfound" });
    (row.v.freeQuestions = Array.isArray(row.v.freeQuestions) ? row.v.freeQuestions : []).push(q);
    if ((await store.writeDoc("content:" + iid, row.v, row.ver)) !== false) { await store.rlFail([k]); return send(res, 200, { ok: true, q }); }
  }
  send(res, 503, { error: "busy" });
}

/* 강사 입점 문의 — 문서 inq:<id> 로 저장, 마스터만 읽고 고친다 */
async function partnerApply(req, res, b) {
  const t = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
  const a = {
    name: t(b.name, 40), email: t(b.email, 120), phone: t(b.phone, 30), where: t(b.where, 120),
    course: String(b.course == null ? "" : b.course).trim().slice(0, 1500), link: t(b.link, 300), message: String(b.message == null ? "" : b.message).trim().slice(0, 1500)
  };
  if (!a.name || !a.course || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email) || !/^[0-9+\-() ]{8,}$/.test(a.phone) || b.agree !== true) return send(res, 400, { error: "input" });
  if (a.link && !/^https?:\/\//i.test(a.link)) a.link = "https://" + a.link;
  const k = "ip-partner:" + ip(req);
  if (await store.rlCheck([k], 6)) return send(res, 429, { error: "locked" });
  const doc = Object.assign({ id: uid("inq"), at: Date.now(), status: "new", memo: "" }, a);
  await store.writeDoc("inq:" + doc.id, doc, null);
  await store.rlFail([k]);
  send(res, 200, { ok: true });
}

module.exports = handler(["POST"], async (req, res) => {
  const b = await body(req);
  if (b.action === "signup") return signup(req, res, b);
  if (b.action === "free-question") return freeQuestion(req, res, b);
  if (b.action === "partner-apply") return partnerApply(req, res, b);
  send(res, 400, { error: "action" });
});
