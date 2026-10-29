/* POST /api/public — 로그인 없이 하는 일
 *  { action: "signup", iid, cohortId, name, phone4 }   수강 신청 (승인 대기로 등록)
 *  { action: "free-question", iid, name, text }        무료강의 페이지 질문 남기기
 *  { action: "partner-apply", name, email, phone, where, course, link, message, agree }
 *                                                       강사 입점 문의 (마스터 → 입점 문의에서 관리)
 *  { action: "vdur", urls: [...] }                     강의 영상(비메오 · 유튜브)의 실제 길이(초) */
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

/* 영상 길이 — 비메오는 oEmbed, 유튜브는 YOUTUBE_API_KEY 가 있으면 Data API · 없으면 영상 페이지의 재생 시간으로 받아요.
 * 받은 길이는 문서 vdur 에 기억해서 같은 영상은 다시 묻지 않아요 (못 받은 영상은 하루 뒤 다시). 한 번에 40개까지 */
const VD_MAX = 40, VD_RETRY = 864e5, VD_KEEP = 4000;
function vidKey(u) {
  const s = String(u || "").trim();
  const vm = s.match(/vimeo\.com\/(?:video\/|channels\/[\w-]+\/|groups\/[\w-]+\/videos\/|manage\/videos\/)?(\d{5,12})(?:\/([0-9a-f]{6,}))?/i);
  if (vm) { const h = vm[2] || (s.match(/[?&]h=([0-9a-f]{6,})/i) || [])[1] || ""; return "vm:" + vm[1] + (h ? ":" + h : ""); }
  const yt = /^[\w-]{11}$/.test(s) ? s : (s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/) || [])[1];
  return yt ? "yt:" + yt : "";
}
const isoSec = (d) => { const m = String(d || "").match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/); return m ? Math.round((+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0)) : 0; };
async function grab(url, headers, json) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
  try { const r = await fetch(url, { headers: headers || {}, signal: ctl.signal }); if (!r.ok) return null; return json ? await r.json() : await r.text(); }
  catch (e) { return null; } finally { clearTimeout(t); }
}
async function vimeoSec(k, site) {
  const p = k.split(":"), j = await grab("https://vimeo.com/api/oembed.json?url=" + encodeURIComponent("https://vimeo.com/" + p[1] + (p[2] ? "/" + p[2] : "")), { Referer: site }, true);
  return Math.round(Number(j && j.duration) || 0);
}
async function youtubeSecs(ids) {
  const out = {}, key = process.env.YOUTUBE_API_KEY;
  if (key) {
    const j = await grab("https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=" + ids.join(",") + "&key=" + encodeURIComponent(key), null, true);
    ((j && j.items) || []).forEach((it) => { out[it.id] = isoSec(it.contentDetails && it.contentDetails.duration); });
    return out;
  }
  await Promise.all(ids.map(async (id) => {
    const h = await grab("https://www.youtube.com/watch?v=" + id + "&hl=ko", { "Accept-Language": "ko-KR,ko;q=0.9", Cookie: "CONSENT=YES+1" });
    const m = h && (h.match(/"lengthSeconds":"(\d+)"/) || h.match(/itemprop="duration" content="(PT[^"]+)"/));
    out[id] = m ? (/^PT/.test(m[1]) ? isoSec(m[1]) : Number(m[1]) || 0) : 0;
  }));
  return out;
}
async function vdur(req, res, b) {
  const urls = (Array.isArray(b.urls) ? b.urls : []).map((u) => String(u || "").slice(0, 300)).filter((u) => vidKey(u)).slice(0, VD_MAX);
  if (!urls.length) return send(res, 200, { ok: true, d: {} });
  const row = await store.getDoc("vdur"), memo = (row && row.v) || {}, now = Date.now();
  const need = Array.from(new Set(urls.map(vidKey))).filter((k) => { const x = memo[k]; return !x || (!(x.s > 0) && now - (x.at || 0) > VD_RETRY); });
  if (need.length) {
    const rk = "ip-vdur:" + ip(req);
    if (await store.rlCheck([rk], 60)) need.length = 0;
    else await store.rlFail([rk]);
  }
  if (need.length) {
    const site = "https://" + String(req.headers.host || "www.doogoclass.com").replace(/[^\w.:-]/g, "") + "/", got = {};
    const vms = need.filter((k) => k.indexOf("vm:") === 0), yts = need.filter((k) => k.indexOf("yt:") === 0).map((k) => k.slice(3));
    await Promise.all(vms.map(async (k) => { got[k] = await vimeoSec(k, site); }));
    for (let i = 0; i < yts.length; i += 40) { const r = await youtubeSecs(yts.slice(i, i + 40)); yts.slice(i, i + 40).forEach((id) => { got["yt:" + id] = r[id] || 0; }); }
    // 기억해 두기 (동시에 다른 요청이 썼으면 다시 읽어서 합쳐요) — 오래된 것부터 정리
    // 처음 쓰는 서버(빈 데이터베이스)면 기본 데이터를 먼저 넣어요 — 이 문서가 먼저 생기면 처음 채우기를 건너뛰어서
    if (!row) await require("./_lib/init").ensureSeeded();
    for (let i = 0; i < 4; i++) {
      const cur = i ? await store.getDoc("vdur") : row, v = Object.assign({}, (cur && cur.v) || {});
      Object.keys(got).forEach((k) => { v[k] = { s: got[k], at: now }; });
      const ks = Object.keys(v); if (ks.length > VD_KEEP) ks.sort((a, z) => (v[a].at || 0) - (v[z].at || 0)).slice(0, ks.length - VD_KEEP).forEach((k) => delete v[k]);
      if ((await store.writeDoc("vdur", v, cur ? cur.ver : null)) !== false) break;
    }
    Object.assign(memo, Object.keys(got).reduce((o, k) => { o[k] = { s: got[k], at: now }; return o; }, {}));
  }
  const d = {};
  urls.forEach((u) => { const x = memo[vidKey(u)]; d[u] = x && x.s > 0 ? x.s : 0; });
  send(res, 200, { ok: true, d });
}

module.exports = handler(["POST"], async (req, res) => {
  const b = await body(req);
  if (b.action === "signup") return signup(req, res, b);
  if (b.action === "free-question") return freeQuestion(req, res, b);
  if (b.action === "partner-apply") return partnerApply(req, res, b);
  if (b.action === "vdur") return vdur(req, res, b);
  send(res, 400, { error: "action" });
});
