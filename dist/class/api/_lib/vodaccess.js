/* 두고클래스(VOD) 문서 — 누가 보고 고칠 수 있는지 (access.js 가 이어 받아요)
 *
 *  meta 의 vod           공개 정보: 클래스 · 카테고리 · 배너 · 쿠폰 · 설정 (마스터만 고침)
 *                        유료 강의 영상 · 수업 자료 · 전자책 파일 · LIVE 입장 링크는 산 회원(과 운영자)에게만 보내요
 *  vm:<회원>             회원 (+ 받은 쿠폰 · 찜 · 진도 · 학습 기록) — 본인 · 마스터
 *  vo:<주문번호>         주문 — 본인 · 마스터 · 그 클래스 강사(이름 가림). 만들기 · 결제 · 환불은 /api/vod-pay 로만
 *  vr:<id> · vpl:<id>    수강 후기 · 다짐 한마디 — 누구나 보기, 본인만 쓰기 (후기 포인트는 서버가 줘요)
 *  vq:<회원>:<id>        1:1 문의 — 본인 · 마스터 (답변은 마스터만)
 *  vpo:<강사>            VOD 정산 내역 — 그 강사 · 마스터 (강사는 세금계산서 알림 칸만)
 *  vstat                 찜 수 · 수강생 수 · 관심 부업 표 (서버가 세요 · 누구나 보기)
 * vme · vmk · vpay · vp · vcat 은 여기 없어서 /api/vod-* 로만 다뤄요. */
"use strict";
const store = require("./store");

const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
const mask = (n) => { n = String(n || ""); return n ? n.slice(0, 1) + "OO" : "회원"; };
const isMaster = (ids) => !!(ids.admin && ids.admin.role === "master");
const vodMid = (ids) => (ids.vod && ids.vod.mid) || "";

function parse(p) {
  if (p[0] === "vm" || p[0] === "vo" || p[0] === "vr" || p[0] === "vpl" || p[0] === "vpo") return p.length === 2 && p[1] ? { type: p[0], id: p[1] } : null;
  if (p[0] === "vq") return p.length === 3 && p[1] && p[2] ? { type: "vq", mid: p[1], id: p[2] } : null;
  if (p[0] === "vstat") return p.length === 1 ? { type: "vstat" } : null;
  return null;
}

/* ---------------- 지금 로그인한 VOD 회원 · 가진 클래스 ---------------- */
const DAY = 864e5;
function ownsOf(orders, cat, now) {
  const ps = {}; ((cat && cat.products) || []).forEach((p) => { ps[p.id] = p; });
  const by = {};
  orders.forEach((o) => { const k = o.kind || "course"; if (o.status === "paid" && (k === "course" || k === "extend")) (by[o.pid] = by[o.pid] || []).push(o); });
  const out = [];
  Object.keys(by).forEach((pid) => {
    const p = ps[pid], os = by[pid].sort((a, b) => (a.paidAt || 0) - (b.paidAt || 0));
    if (!p || (p.type || "vod") !== "vod") { out.push(pid); return; }
    let end = 0;
    for (const o of os) { const d = Number(o.days) || ((o.kind || "course") === "extend" ? 365 : Number(p.accessDays) || 0); if (!d) { end = Infinity; break; } end = Math.max(end, o.paidAt || 0) + d * DAY; }
    if (end > now) out.push(pid);
  });
  return out;
}
/** 회원ID → { mid, nos, owns } (없거나 이용 중지 · 탈퇴면 null) */
async function identity(mid) {
  const d = await store.getDocs(["vm:" + mid, "vcat"]);
  const m = (d["vm:" + mid] || {}).v;
  if (!m || m.blocked || m.withdrawnAt) return null;
  const nos = (m.orderNos || []).slice(-300);
  const od = nos.length ? await store.getDocs(nos.map((n) => "vo:" + n)) : {};
  const orders = nos.map((n) => (od["vo:" + n] || {}).v).filter(Boolean);
  return { mid, nos, owns: ownsOf(orders, (d.vcat || {}).v, Date.now()) };
}

/* ---------------- 공개용으로 줄이기 ---------------- */
const PRIV = ["members", "orders", "memberCoupons", "likes", "progress", "studyLog", "reviews", "pledges", "inquiries", "payouts", "stat"];
const STAFF = ["crm", "adSpend", "insRates"];
const P_SECRET = ["kakao", "ytLive", "replayUrl", "link", "zoom", "pdf", "file"];
function lockedProduct(p) {
  const q = clone(p);
  P_SECRET.forEach((k) => { if (q[k]) q[k] = ""; });
  if (Array.isArray(q.gifts)) q.gifts = q.gifts.map((g) => Object.assign({}, g, { file: "" }));
  (q.curriculum || []).forEach((c) => (c.lessons || []).forEach((l) => {
    if (l.preview) return;
    if (l.video) l.video = "";
    if (Array.isArray(l.files)) l.files = l.files.map((f) => ({ name: f && f.name, size: f && f.size, locked: true }));
  }));
  q.locked = true;
  return q;
}
/** meta.vod 를 이 사람에게 맞게 — 운영자는 전부, 회원은 산 클래스만 잠금 해제 */
function publicVod(v, ids) {
  if (!v || typeof v !== "object") return v;
  const o = Object.assign({}, v);
  PRIV.forEach((k) => delete o[k]);
  if (ids.admin) return o;
  STAFF.forEach((k) => delete o[k]);
  const owns = new Set((ids.vod && ids.vod.owns) || []);
  o.products = (v.products || []).map((p) => (p && owns.has(p.id) ? p : lockedProduct(p)));
  return o;
}
const M_HIDE = ["pwHash", "paidPays"];
const M_HIDE_SELF = M_HIDE.concat(["notes", "tags", "kakaoUnlinkWhy", "withdrawnAt"]);
const omit = (v, keys) => { const o = clone(v); keys.forEach((k) => delete o[k]); return o; };
function maskOrder(o) {
  const x = clone(o);
  if (x.buyer) x.buyer = { name: mask(x.buyer.name) };
  delete x.paymentId; if (x.pg) x.pg = { st: x.pg.st };
  return x;
}

function view(K, v, ids) {
  const me = vodMid(ids), master = isMaster(ids);
  switch (K.type) {
    case "vm":
      if (master) return v == null ? null : omit(v, M_HIDE);
      if (me && me === K.id) return v == null ? null : omit(v, M_HIDE_SELF);
      return undefined;
    case "vo":
      if (v == null) return master ? null : undefined;
      if (master || (me && v.mid === me)) return v;
      if (ids.admin && ids.admin.iid && v.iid === ids.admin.iid) return maskOrder(v);
      return undefined;
    case "vr": case "vpl": case "vstat":
      return v == null ? null : v;
    case "vq":
      if (master || (me && me === K.mid)) return v == null ? null : v;
      return undefined;
    case "vpo":
      if (master || (ids.admin && ids.admin.role === "instructor" && ids.admin.iid === K.id)) return v == null ? null : v;
      return undefined;
  }
  return undefined;
}
/** 목록 조회 범위 (마스터는 전부라 여기 안 와요) */
function prefixes(ids) {
  const p = ["vr:%", "vpl:%", "vstat"];
  if (ids.vod) {
    p.push("vm:" + ids.vod.mid, "vq:" + ids.vod.mid + ":%");
    (ids.vod.nos || []).forEach((n) => p.push("vo:" + n));
  }
  if (ids.admin && ids.admin.iid) {
    p.push("vo:%");
    if (ids.admin.role === "instructor") p.push("vpo:" + ids.admin.iid);
  }
  return p;
}

/* ---------------- 쓰기 ---------------- */
const str = (x, n) => String(x == null ? "" : x).slice(0, n);
const M_SELF = { name: (x) => str(x, 20).trim(), phone: (x) => str(x, 14).replace(/\s/g, ""), marketing: (x) => !!x, consent: (x) => (x && typeof x === "object" ? clone(x) : undefined), devices: (x) => (Array.isArray(x) ? clone(x).slice(0, 10) : []), seenAt: (x) => Math.min(Date.now() + 6e4, Number(x) || 0), topics: (x) => (Array.isArray(x) ? x.map((t) => str(t, 40)).slice(0, 30) : []), likes: (x) => (Array.isArray(x) ? x.map((t) => str(t, 40)).slice(0, 300) : []), prog: (x) => (x && typeof x === "object" ? clone(x) : {}), study: (x) => (x && typeof x === "object" ? clone(x) : {}) };
function fixSelfMember(o, n) {
  if (!o) return null;
  const out = clone(o);
  if (n == null) return out;
  Object.keys(M_SELF).forEach((k) => { if (n[k] !== undefined) { const v = M_SELF[k](n[k]); if (v === undefined) delete out[k]; else out[k] = v; } });
  return out;
}
const keepServer = (o, n, keys) => { if (n == null || !o) return n; keys.forEach((k) => { if (o[k] !== undefined) n[k] = o[k]; else delete n[k]; }); return n; };
/** 회원이 자기 주문에서 고칠 수 있는 칸: 코칭 질문 목록 · TEA TIME 신청(확정 전) · 환불 요청 · 전자책 내려받은 때 */
function fixSelfOrder(o, n) {
  const out = clone(o);
  if (!n) return out;
  if (out.coach && n.coach && Array.isArray(n.coach.qs)) {
    const cap = Number(out.coach.n) || 0;
    out.coach.qs = n.coach.qs.map((q) => str(q, 60)).slice(0, cap || 0);
    out.coach.used = out.coach.qs.length;
  }
  if (out.tea && n.tea && out.tea.st === "req") {
    ["d1", "d2", "slot", "mode", "topic"].forEach((k) => { if (n.tea[k] !== undefined) out.tea[k] = str(n.tea[k], k === "topic" ? 500 : 30); });
    if (n.tea.st === "cancel") out.tea.st = "cancel";
  }
  if (out.status === "paid" && n.refundReq && !out.refundReq) {
    out.refundReq = { at: Date.now(), why: str(n.refundReq.why, 40), text: str(n.refundReq.text, 1000) };
    const a = n.refundReq.acct;
    if ((out.method === "bank" || out.method === "vbank") && a && typeof a === "object" && /^[A-Z_]{2,40}$/.test(String(a.bank || ""))) out.refundReq.acct = { bank: String(a.bank), number: str(a.number, 30).replace(/[^0-9]/g, ""), holder: str(a.holder, 20).trim() };
  }
  if (out.status === "paid" && out.refundReq && n.refundReq === undefined) delete out.refundReq;
  if (n.dlAt && !out.dlAt) out.dlAt = Date.now();
  return out;
}
const REVIEW_STAFF = ["reply", "replyAt", "replyBy", "hidden", "best", "pin"];
function writer(K, ids, creating, ctx) {
  const me = vodMid(ids), master = isMaster(ids);
  if (master) {
    if (K.type === "vstat") return null;
    if (K.type === "vm") return { fix: (o, n) => keepServer(o, n, ["pwHash", "paidPays", "orderNos", "kakaoId"]) };
    if (K.type === "vo") return { fix: (o, n) => keepServer(o, n, ["paymentId"]) };
    return { fix: (o, n) => n };
  }
  switch (K.type) {
    case "vm":
      if (!creating && me && me === K.id) return { fix: fixSelfMember };
      return null;
    case "vo":
      if (!creating && me) return { fix: (o, n) => (o && o.mid === me ? fixSelfOrder(o, n) : clone(o)) };
      return null;
    case "vr":
      if (!me) return null;
      return { fix: (o, n) => {
        if (o && o.mid !== me) return clone(o);
        if (n == null) return null;
        const owns = (ids.vod.owns || []).indexOf(String(n.pid)) >= 0 || (o && o.pid === n.pid);
        if (!o && !owns) return null;
        const out = { id: K.id, pid: str(o ? o.pid : n.pid, 40), mid: me, name: str(n.name, 20), rating: Math.max(1, Math.min(5, Math.round(Number(n.rating) || 5))), text: str(n.text, 2000), at: o ? o.at : Number(n.at) || Date.now() };
        ["tags", "photos", "plan", "editedAt"].forEach((k) => { if (n[k] !== undefined) out[k] = clone(n[k]); });
        if (o) REVIEW_STAFF.forEach((k) => { if (o[k] !== undefined) out[k] = o[k]; });
        return out;
      } };
    case "vpl":
      if (!me) return null;
      return { fix: (o, n) => {
        if (!o) return n == null ? null : { id: K.id, pid: str(n.pid, 40), mid: me, nick: str(n.nick, 20), text: str(n.text, 500), at: Date.now(), up: 0, upBy: [] };
        if (o.mid === me) { if (n == null) return null; const out = clone(o); out.text = str(n.text, 500); return out; }
        // 남의 다짐: 공감(나 한 명)만 넣거나 빼요
        const out = clone(o), had = (o.upBy || []).indexOf(me) >= 0, want = !!(n && (n.upBy || []).indexOf(me) >= 0);
        const base = (Number(o.up) || 0) - (o.upBy || []).length;
        out.upBy = (o.upBy || []).filter((x) => x !== me).concat(want ? [me] : []);
        out.up = Math.max(0, base) + out.upBy.length;
        return had === want ? clone(o) : out;
      } };
    case "vq":
      if (!me || me !== K.mid) return null;
      return { fix: (o, n) => {
        if (n == null) return o && !o.answer ? null : clone(o);
        const out = { id: K.id, mid: me, cat: str(n.cat, 20), order: str(n.order, 30), title: str(n.title, 100), text: str(n.text, 1000), at: o ? o.at : Date.now() };
        if (o) ["answer", "answeredAt", "answeredBy"].forEach((k) => { if (o[k] !== undefined) out[k] = o[k]; });
        else out.answer = "";
        return out;
      } };
    case "vpo":
      if (ids.admin && ids.admin.role === "instructor" && ids.admin.iid === K.id && !creating) return { fix: (o, n) => {
        const out = clone(o) || [];
        (Array.isArray(n) ? n : []).forEach((x) => { const t = out.find((y) => y && x && y.id === x.id); if (t && !t.paidAt) { if (x.invReqAt) t.invReqAt = Number(x.invReqAt) || Date.now(); if (x.invNo) t.invNo = str(x.invNo, 40); } });
        return out;
      } };
  }
  return null;
}

/* ---------------- 파일 범위 ---------------- */
/** meta 안의 파일: 클래스 썸네일 · 배너 등은 공개, 강의 수업 자료 · 전자책은 그 클래스를 산 회원만 */
function metaFileScope(path, doc) {
  if (path[0] !== "vod") return null;
  if (path[1] === "products" && typeof path[2] === "number") {
    const p = doc && doc.vod && doc.vod.products && doc.vod.products[path[2]];
    const secret = path.indexOf("files") >= 0 || path[3] === "gifts" || P_SECRET.indexOf(String(path[3])) >= 0;
    if (secret && p && p.id) return "vodp:" + p.id;
  }
  return "pub";
}
/** 강사가 meta 에서 고칠 수 있는 것: 자기 VOD 클래스의 커리큘럼(강의 영상 · 수업 자료 · 설명)과 자기 제출 서류만 */
function fixInstructorMeta(o, n, iid) {
  const out = clone(o) || {};
  if (!n || !iid) return out;
  const mine = ((n.vod && n.vod.products) || []).filter((p) => p && p.iid === iid);
  ((out.vod && out.vod.products) || []).forEach((p, i) => {
    if (!p || p.iid !== iid) return;
    const np = mine.find((x) => x.id === p.id);
    if (np && Array.isArray(np.curriculum)) out.vod.products[i].curriculum = clone(np.curriculum);
  });
  const nc = n.contracts && n.contracts[iid];
  if (nc && nc.docs && typeof nc.docs === "object") { out.contracts = out.contracts || {}; out.contracts[iid] = Object.assign({}, out.contracts[iid] || {}, { docs: clone(nc.docs) }); }
  return out;
}
function canReadFile(s, ids) {
  if (s === "adm") return !!ids.admin;
  if (String(s).indexOf("vodp:") !== 0) return null;
  if (ids.admin) return true;
  return !!(ids.vod && (ids.vod.owns || []).indexOf(String(s).slice(5)) >= 0);
}

/* ---------------- 저장 뒤에 서버가 하는 일 ---------------- */
async function updateDoc(k, fn) {
  for (let i = 0; i < 8; i++) {
    const r = await store.getDoc(k), cur = r && r.v != null ? clone(r.v) : null;
    const next = fn(cur);
    if (next === undefined) return cur;
    if ((await store.writeDoc(k, next, r ? r.ver : null)) !== false) return next;
  }
  return null;
}
const isCourse = (o) => !!o && (o.kind || "course") === "course";
/** 수강생 수 · 찜 수 · 관심 부업 표를 바뀐 만큼만 */
async function bumpStat(fn) { return updateDoc("vstat", (s) => { const v = s || { likes: {}, topics: {}, sold: {} }; ["likes", "topics", "sold"].forEach((k) => { v[k] = v[k] || {}; }); return fn(v) === false ? undefined : v; }); }
const inc = (map, k, d) => { map[k] = Math.max(0, (Number(map[k]) || 0) + d); };
function soldDelta(prev, next) {
  const was = isCourse(prev) && prev.status === "paid", now = isCourse(next) && next.status === "paid";
  return was === now ? null : { pid: (next || prev).pid, d: now ? 1 : -1 };
}
async function afterOrder(prev, next) {
  const s = soldDelta(prev, next);
  if (s) await bumpStat((v) => { inc(v.sold, s.pid, s.d); });
}
async function after(K, prev, next, ids) {
  if (K.type === "vm" && prev && next) {
    const diffList = (a, b) => ({ add: (b || []).filter((x) => (a || []).indexOf(x) < 0), del: (a || []).filter((x) => (b || []).indexOf(x) < 0) });
    const l = diffList(prev.likes, next.likes), t = diffList(prev.topics, next.topics);
    if (l.add.length || l.del.length || t.add.length || t.del.length) await bumpStat((v) => { l.add.forEach((x) => inc(v.likes, x, 1)); l.del.forEach((x) => inc(v.likes, x, -1)); t.add.forEach((x) => inc(v.topics, x, 1)); t.del.forEach((x) => inc(v.topics, x, -1)); });
  }
  if (K.type === "vo") await afterOrder(prev, next);
  // 후기 포인트: 클래스마다 한 번 (마스터 설정 reviewPoint)
  if (K.type === "vr" && !prev && next && ids.vod && next.mid === ids.vod.mid) {
    const d = await store.getDocs(["meta", "vcat"]), rp = Number(((((d.meta || {}).v || {}).vod || {}).settings || {}).reviewPoint) || 0;
    const p = ((((d.vcat || {}).v || {}).products) || []).find((x) => x.id === next.pid), paid = !!p && (Number(p.sale != null && p.sale !== "" ? p.sale : p.price) || 0) > 0;
    if (rp > 0 && paid) await updateDoc("vm:" + next.mid, (m) => {
      if (!m || (m.rvPts || []).indexOf(next.pid) >= 0) return undefined;
      m.rvPts = (m.rvPts || []).concat(next.pid);
      m.points = (Number(m.points) || 0) + rp;
      (m.pointLog = m.pointLog || []).push({ at: Date.now(), amt: rp, why: "후기 작성 적립" });
      return m;
    });
  }
}

module.exports = { parse, identity, ownsOf, publicVod, lockedProduct, view, prefixes, writer, metaFileScope, canReadFile, fixInstructorMeta, after, afterOrder, bumpStat, PRIV };
