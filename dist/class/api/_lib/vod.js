/* 두고클래스(VOD 스토어) 서버 저장소 — 회원 · 주문 · 결제 · 진도 · 카탈로그
 *
 *  vm:<회원ID>        회원 (비밀번호는 scrypt 로 바꿔 저장 · 쿠폰 · 포인트는 서버가 기준)
 *  vme:<이메일>       이메일 → 회원ID          vmk:<카카오 회원번호> → 회원ID
 *  vo:<주문번호>      주문 (ready 결제 대기 → paid → refunded · failed)
 *  vpay:<paymentId>   포트원 결제 → 주문번호들
 *  vp:<회원ID>        진도 { 상품ID: { seen: {강의: 시각}, done: {강의: true}, mat: 자료 내려받은 횟수 } } — 환불 판단에 써요
 *  vcat               카탈로그 (마스터가 올린 클래스 가격 · 쿠폰 · 설정 · 환불 규정)
 *
 * 이 키들은 access.parseKey 에 없어서 /api/bootstrap · /api/sync 로는 누구에게도 보이거나 바뀌지 않아요 (이 API 로만). */
"use strict";
const crypto = require("crypto");
const store = require("./store");
const auth = require("./auth");
const { pricer, kstDay, addDays } = require("./vodprice");

const K = { member: (id) => "vm:" + id, email: (e) => "vme:" + String(e).toLowerCase(), kakao: (k) => "vmk:" + k, order: (no) => "vo:" + no, pay: (p) => "vpay:" + p, prog: (mid) => "vp:" + mid, cat: "vcat" };
const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = (p) => p + Date.now().toString(36) + crypto.randomBytes(4).toString("hex");

async function get(k) { const r = await store.getDoc(k); return r && r.v != null ? r.v : null; }
/** 낙관적 잠금으로 고치기: fn(지금 값 | null) → 새 값 (undefined 면 그대로) */
async function update(k, fn) {
  for (let i = 0; i < 8; i++) {
    const r = await store.getDoc(k), cur = r && r.v != null ? clone(r.v) : null;
    const next = fn(cur);
    if (next === undefined) return cur;
    const ver = await store.writeDoc(k, next, r ? r.ver : null);
    if (ver !== false) return next;
  }
  throw new Error("busy");
}
async function create(k, v) { return (await store.writeDoc(k, v, null)) !== false; }

/* ---------------- 로그인 쿠키 (dc_v) ---------------- */
const COOKIE = "dc_v", MAX_AGE = 30 * 24 * 3600;
function cookies(req) { const out = {}; String(req.headers.cookie || "").split(";").forEach((c) => { const i = c.indexOf("="); if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); }); return out; }
const secure = (req) => !/^(localhost|127\.0\.0\.1)(:|$)/.test(String(req.headers.host || ""));
function setCookie(req, res, name, value, maxAge) {
  const parts = [name + "=" + (value ? encodeURIComponent(value) : ""), "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=" + (value ? maxAge || MAX_AGE : 0)];
  if (secure(req)) parts.push("Secure");
  res.setHeader("Set-Cookie", [].concat(res.getHeader("Set-Cookie") || [], parts.join("; ")));
}
const login = (req, res, mid) => setCookie(req, res, COOKIE, auth.sign({ r: "vod", mid }));
const logout = (req, res) => setCookie(req, res, COOKIE, "");
/** 지금 로그인한 VOD 회원 (이용 중지 · 탈퇴면 null) */
async function current(req) {
  const p = auth.verify(cookies(req)[COOKIE]);
  if (!p || p.r !== "vod" || !p.mid) return null;
  const m = await get(K.member(p.mid));
  return m && !m.blocked && !m.withdrawnAt ? m : null;
}

/* ---------------- 비밀번호 (scrypt) ---------------- */
function hashPw(pw) { const salt = crypto.randomBytes(16); return "s1$" + salt.toString("base64") + "$" + crypto.scryptSync(String(pw), salt, 32).toString("base64"); }
function checkPw(pw, h) { const t = String(h || "").split("$"); if (t[0] !== "s1" || t.length !== 3) return false; const want = Buffer.from(t[2], "base64"), got = crypto.scryptSync(String(pw), Buffer.from(t[1], "base64"), 32); return got.length === want.length && crypto.timingSafeEqual(got, want); }

/* ---------------- 회원 ---------------- */
const consentOf = (on, at, how) => ({ mkt: !!on, ch: on ? ["sms", "email", "kakao"] : [], night: false, at, log: [{ at, on: !!on, how }] });
/** 화면으로 보낼 회원 모양 (비밀번호 · 내부 칸 빼고) */
/** 회원 본인에게 보내는 정보 — 비밀번호 · 운영 메모 · 태그(CRM)는 빼요 */
function pub(m) { const o = clone(m); ["pwHash", "withdrawnAt", "notes", "tags", "paidPays", "kakaoUnlinkWhy"].forEach((k) => delete o[k]); return o; }
async function newMember(fields, how) {
  const at = Date.now(), cat = await catalog(), id = uid("vm");
  const m = Object.assign({ id, via: "email", email: "", name: "", phone: "", marketing: false, consent: consentOf(false, at, how), src: { s: "direct", at }, kakaoCh: false, tags: [], notes: [], createdAt: at, points: 0, pointLog: [], coupons: [] }, fields);
  m.consent = consentOf(m.marketing, at, how);
  // 신규 가입 쿠폰 (카탈로그의 auto: signup)
  ((cat && cat.coupons) || []).filter((c) => c.auto === "signup" && c.on !== false).forEach((c) => m.coupons.push({ id: uid("mc"), cid: c.id, at, exp: c.days ? addDays(kstDay(at), c.days) : c.endAt || "", usedAt: null, orderNo: "" }));
  await create(K.member(id), m);
  return m;
}

/* ---------------- 카탈로그 ---------------- */
const catalog = () => get(K.cat);
const RF_DEF = { instant: true, days: 7, maxUsed: 0, matCounts: true, addons: true, restore: true, ebookDays: 7, eventDays: 3 };
const rfSet = (cat) => Object.assign({}, RF_DEF, ((cat && cat.settings) || {}).refund || {});

/* ---------------- 결제 금액 (서버가 정함) ---------------- */
/** req: { pid, kind, plan, coach, mcid, points, expect } → { ok, items[], total, orderName } | { ok:false, message } */
async function quote(m, req, orders) {
  const cat = await catalog();
  if (!cat) return { ok: false, message: "판매 정보가 아직 서버에 없어요. 운영팀에 알려 주세요." };
  const X = pricer(cat), p = X.product(String(req.pid || ""));
  if (!p || p.status !== "on") return { ok: false, message: "지금 살 수 없는 클래스예요." };
  const kind = ["course", "extend", "coach", "tea"].indexOf(req.kind) >= 0 ? req.kind : "course";
  const mine = (orders || []).filter((o) => o.pid === p.id && o.status === "paid");
  const hasCourse = mine.some((o) => (o.kind || "course") === "course");
  let pr = 0, list = 0, days = null, coach = 0, c = null;
  if (kind === "course") {
    if (X.isEvent(p) && p.seats) { const sold = await soldCount(p.id); if (sold >= Number(p.seats)) return { ok: false, message: "자리가 모두 찼어요." }; }
    const plan = X.plansOf(p).length ? X.planOf(p, req.plan) : null;
    pr = plan ? plan.sale : X.priceOf(p); list = plan ? plan.list : Number(p.price) || pr; days = plan ? plan.d : null;
    c = X.coachOf(p); coach = req.coach && c ? c.price : 0;
  } else {
    if (!hasCourse) return { ok: false, message: "먼저 강의를 구매해야 살 수 있어요." };
    pr = kind === "extend" ? ((X.extendOf(p) || {}).sale || 0) : kind === "coach" ? ((X.coachOf(p) || {}).price || 0) : ((X.teaOf(p) || {}).price || 0);
    list = pr; if (kind === "extend") days = 365; if (kind === "coach") c = X.coachOf(p);
  }
  // 쿠폰: 수강권에만 · 이 회원이 가진 쓸 수 있는 쿠폰
  let cp = 0, mc = null;
  if (kind === "course" && req.mcid) {
    mc = (m.coupons || []).find((x) => x.id === req.mcid && !x.usedAt && (!x.exp || x.exp >= X.today));
    const def = mc && ((cat.coupons || []).find((y) => y.id === mc.cid && y.on !== false));
    cp = def ? X.couponOff(def, p, pr) : 0;
    if (!cp) mc = null;
  }
  const sum = pr + coach, pt = Math.max(0, Math.min(Math.floor(Number(req.points) || 0), Number(m.points) || 0, sum - cp)), ptMain = Math.min(pt, pr - cp), ptC = pt - ptMain;
  const total = Math.max(0, sum - cp - pt);
  if (req.expect != null && Number(req.expect) !== total) return { ok: false, message: "가격이 방금 바뀌었어요. 새로고침한 뒤 다시 결제해 주세요.", total };
  const items = [{ kind, pid: p.id, title: p.title, list, sale: pr, amount: pr - cp - ptMain, days, couponOff: cp || 0, mcid: mc ? mc.id : "", pointOff: ptMain || 0, iid: p.iid || "", share: p.share }];
  if (coach) items.push({ kind: "coach", pid: p.id, title: p.title, list: coach, sale: coach, amount: coach - ptC, days: null, couponOff: 0, mcid: "", pointOff: ptC || 0, coach: { n: c.n, days: c.days, price: c.price, used: 0 }, iid: p.iid || "" });
  if (kind === "coach" && c) items[0].coach = { n: c.n, days: c.days, price: c.price, used: 0 };
  return { ok: true, items, total, points: pt, orderName: (p.title.length > 40 ? p.title.slice(0, 40) + "…" : p.title) + (days && kind === "course" ? " · " + (days === 1095 ? "3년" : days + "일") + " 수강권" : "") + (coach ? " + 1:1 코칭권" : "") };
}
async function soldCount(pid) {
  const rows = await store.listDocs({ prefixes: ["vo:%"] });
  return rows.filter((r) => r.v && r.v.pid === pid && (r.v.kind || "course") === "course" && (r.v.status === "paid" || r.v.status === "pending" || (r.v.status === "ready" && Date.now() - r.v.createdAt < 15 * 6e4))).length;
}
/** 회원의 주문 — 회원 문서의 orderNos(서버가 주문을 만들 때 적어 둠)로 찾아요 */
async function ordersOf(mid) {
  const m = await get(K.member(mid)), nos = (m && m.orderNos) || [];
  if (!nos.length) return [];
  const d = await store.getDocs(nos.map((n) => K.order(n)));
  return nos.map((n) => (d[K.order(n)] || {}).v).filter((o) => o && o.mid === mid).sort((a, b) => b.createdAt - a.createdAt);
}
async function addOrderNos(mid, nos) {
  await update(K.member(mid), (m) => { if (!m) return undefined; m.orderNos = (m.orderNos || []).concat(nos.filter((n) => (m.orderNos || []).indexOf(n) < 0)).slice(-500); return m; });
}
const newNo = () => "DC" + kstDay(Date.now()).replace(/-/g, "").slice(2) + String(crypto.randomInt(100000, 999999));

/* ---------------- 바로 취소 (환불 규정) ---------------- */
async function usedOf(mid, pid, rf) {
  const pr = ((await get(K.prog(mid))) || {})[pid]; if (!pr) return 0;
  const ids = {}; Object.keys(pr.done || {}).forEach((k) => { ids[k] = 1; }); Object.keys(pr.seen || {}).forEach((k) => { ids[k] = 1; });
  return Object.keys(ids).length + (rf.matCounts && pr.mat ? 1 : 0);
}
/** 회원이 바로 100% 취소할 수 있는지 (화면과 같은 규칙 · 서버 기록 기준) */
async function instantOf(o) {
  const cat = await catalog(), rf = rfSet(cat), X = pricer(cat || {}), p = X.product(o.pid);
  if (!o || o.status !== "paid" || !(o.amount > 0) || (o.kind || "course") !== "course" || !p) return { ok: false, why: "바로 취소할 수 없는 주문이에요." };
  if (!rf.instant) return { ok: false, why: "바로 취소는 지금 쉬고 있어요. 환불 요청을 남겨 주세요." };
  if (o.method === "vbank") return { ok: false, why: "가상계좌 결제는 환불 요청으로 처리해요. 환불 받을 계좌로 돌려드려요." };
  const t = X.typeOf(p), paid = o.paidAt || o.createdAt, lim = (t === "ebook" ? rf.ebookDays : rf.days) * 864e5;
  if (X.isEvent(p)) { const ev = X.kst(p.eventAt); return ev && ev - Date.now() >= rf.eventDays * 864e5 ? { ok: true } : { ok: false, why: "강의 " + rf.eventDays + "일 전이 지나 환불 요청으로 처리해요." }; }
  if (Date.now() - paid > lim) return { ok: false, why: "결제 후 " + (t === "ebook" ? rf.ebookDays : rf.days) + "일이 지나 환불 요청으로 처리해요." };
  if (t === "ebook") return o.dlAt ? { ok: false, why: "전자책을 내려받아 바로 취소할 수 없어요." } : { ok: true };
  const used = await usedOf(o.mid, o.pid, rf);
  return used > rf.maxUsed ? { ok: false, why: "강의를 " + used + "개 들어 환불 요청으로 처리해요." } : { ok: true, used };
}

module.exports = { K, get, update, create, uid, clone, current, login, logout, setCookie, cookies, hashPw, checkPw, pub, newMember, consentOf, catalog, rfSet, quote, ordersOf, addOrderNos, newNo, instantOf, usedOf };
