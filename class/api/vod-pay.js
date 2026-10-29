/* /api/vod-pay — 두고클래스 결제 · 취소 · 환불 (포트원 V2)
 *
 *  회원 (dc_v 로그인)
 *   { action: "prepare", pid, kind, plan, coach, mcid, points, method, buyer, tea, expect }
 *        → 서버가 금액을 계산해 ‘결제 대기’ 주문을 만들고 { paymentId, amount, orderName, no } 를 돌려줘요 (0원이면 바로 완료)
 *   { action: "complete", paymentId }   포트원에 결제를 다시 물어 PAID · 금액 · 통화가 맞을 때만 결제 완료
 *   { action: "abort", paymentId }      결제창을 닫았거나 실패 → 결제 대기 주문을 실패로
 *        method: card · kakao · toss · naver (포트원) | bank (무통장 입금 · depositor 입금자명 → 자동 입금 확인 또는 마스터 확인) — 0원은 바로 완료
 *   { action: "cancel", no }            환불 규정에 맞으면 바로 100% 취소 (포트원 결제 취소까지)
 *   { action: "cancelPending", no }     입금 전 무통장 주문 취소 (쓴 쿠폰 · 포인트 돌려받기)
 *   { action: "dg", iid }               산 VOD 의 두잉고 강의실 들어가기 — 서버가 두잉고 수강생 계정을 만들고 로그인시켜요
 *   { action: "claim", code | cid }       쿠폰 코드 등록 · 쿠폰 받기 (회원 쿠폰은 서버에 저장)
 *   { action: "track", pid, lid, ev }   강의 열기(seen) · 완료(done) · 자료 내려받기(mat) 기록 — 바로 취소 판단에 써요
 *   { action: "orders" }                내 주문
 *  마스터 (dc_a 마스터 로그인)
 *   { action: "refund", no, amount, reason }   부분 · 전액 환불 (포트원 결제 취소)
 *   { action: "catalog", catalog }             클래스 가격 · 쿠폰 · 설정 · 환불 규정 올리기
 *   { action: "bankOk", no }                   무통장 입금 확인 → 바로 수강 (같은 결제로 산 코칭권도 같이)
 *   { action: "bankCancel", no }               입금 전 무통장 주문 취소 (쿠폰 · 포인트 돌려주기)
 *   { action: "bankLog" }                      최근 입금 알림(자동 입금 확인) · 못 맞춘 입금
 *   { action: "bankLink", id, no }             못 맞춘 입금을 주문에 직접 연결 → 입금 확인
 *  포트원 웹훅 (webhook-id · webhook-signature 헤더)  결제 완료 · 취소 알림 → 같은 확인 과정을 한 번 더 */
"use strict";
const { send, body, handler } = require("./_lib/http");
const auth = require("./_lib/auth");
const edge = require("./_lib/edge");
const portone = require("./_lib/portone");
const V = require("./_lib/vod");
const VA = require("./_lib/vodaccess");
const store = require("./_lib/store");
const { kstDay, addDays } = require("./_lib/vodprice");
const BM = require("./_lib/bank");
const PA = require("./_lib/payaction");

const fail = (res, status, message) => send(res, status, { ok: false, message });

/** 결제 완료로 바꾸기: 포트원 결제 조회 → 상태 · 금액 · 통화 확인 → 주문 paid · 쿠폰 사용 · 포인트 차감 (두 번 와도 한 번만) */
async function finalize(paymentId) {
  const idx = await V.get(V.K.pay(paymentId));
  if (!idx) return { ok: false, message: "주문을 찾지 못했어요." };
  const orders = (await Promise.all(idx.nos.map((no) => V.get(V.K.order(no))))).filter(Boolean);
  if (orders.length && orders.every((o) => o.status === "paid")) return { ok: true, no: idx.nos[0], orders };
  const total = orders.reduce((a, o) => a + o.amount, 0);
  let pay = null;
  if (total > 0) {
    pay = await portone.getPayment(paymentId);
    if (pay.status !== "PAID") return { ok: false, message: "결제가 끝나지 않았어요. (" + pay.status + ")" };
    if (!pay.amount || Number(pay.amount.total) !== total) { console.error("[vod-pay] amount mismatch", paymentId, pay.amount && pay.amount.total, total); return { ok: false, message: "결제 금액이 주문과 달라요. 고객센터로 알려 주세요." }; }
    if (pay.currency && pay.currency !== "KRW" && pay.currency !== "CURRENCY_KRW") return { ok: false, message: "결제 통화가 달라요." };
    if (process.env.PORTONE_STORE_ID && pay.storeId && pay.storeId !== process.env.PORTONE_STORE_ID) return { ok: false, message: "다른 상점의 결제예요." };
  }
  const at = Date.now(), done = [];
  for (const o0 of orders) {
    const o = await V.update(V.K.order(o0.no), (o) => { if (!o || o.status === "paid") return undefined; return Object.assign(o, { status: "paid", paidAt: at, pg: pay ? { st: "paid", paymentId, txId: pay.transactionId || "", method: (pay.method && pay.method.type) || "", receiptUrl: pay.receiptUrl || "" } : { st: "free" } }); });
    if (o && o.status === "paid" && o0.status !== "paid") await VA.afterOrder(o0, o);
    done.push(o || o0);
  }
  // 쿠폰 · 포인트는 결제가 확인된 뒤에만 써요
  await useCouponPoints(orders[0] && orders[0].mid, orders, paymentId, idx.nos[0]);
  return { ok: true, no: idx.nos[0], orders: done };
}
/** 환불 반영: 주문 refunded + 쿠폰 · 포인트 돌려주기(전액 환불이고 규정이 켜져 있을 때) */
async function markRefunded(o, amount, info, restore) {
  const at = Date.now();
  const next = await V.update(V.K.order(o.no), (x) => x && x.status === "paid" ? Object.assign(x, { status: "refunded", refundedAt: at, refundAmount: amount, refundKind: info.kind, refundWhy: info.why, refundBy: info.by, pg: Object.assign({}, x.pg || {}, { cancel: info.cancel || null }) }) : undefined);
  if (next && next.status === "refunded") await VA.afterOrder(o, next);
  if (restore && amount === o.amount && (o.pointOff || o.mcid)) await V.update(V.K.member(o.mid), (m) => { if (!m) return undefined; if (o.pointOff) { m.points = (Number(m.points) || 0) + o.pointOff; (m.pointLog = m.pointLog || []).push({ at, amt: o.pointOff, why: "환불 · 포인트 돌려받음 (" + o.no + ")" }); } if (o.mcid) { const c = (m.coupons || []).find((x) => x.id === o.mcid); if (c) { c.usedAt = null; c.orderNo = ""; } } return m; });
  return next;
}

const PG_METHODS = { card: "PORTONE_CHANNEL_CARD", kakao: "PORTONE_CHANNEL_KAKAOPAY", toss: "PORTONE_CHANNEL_TOSSPAY", naver: "PORTONE_CHANNEL_NAVERPAY" };
/** 쿠폰 사용 · 포인트 차감 (결제가 확인됐거나 무통장 주문을 받았을 때 한 번만) */
async function useCouponPoints(mid, orders, key, no) {
  const pts = orders.reduce((a, o) => a + (o.pointOff || 0), 0), mcid = (orders.find((o) => o.mcid) || {}).mcid, at = Date.now();
  if (!mid || !(pts || mcid)) return;
  await V.update(V.K.member(mid), (m) => { if (!m || (m.paidPays || []).indexOf(key) >= 0) return undefined; if (pts) { m.points = Math.max(0, (Number(m.points) || 0) - pts); (m.pointLog = m.pointLog || []).push({ at, amt: -pts, why: "결제에 사용 (" + no + ")" }); } if (mcid) { const c = (m.coupons || []).find((x) => x.id === mcid); if (c) { c.usedAt = at; c.orderNo = no; } } m.paidPays = (m.paidPays || []).concat(key).slice(-50); return m; });
}
async function prepare(res, m, b) {
  const orders = await V.ordersOf(m.id), q = await V.quote(m, b, orders);
  if (!q.ok) return fail(res, 409, q.message);
  const method = String(b.method || "card");
  if (q.total > 0) {
    if (PG_METHODS[method] && !(portone.on() && process.env[PG_METHODS[method]])) return fail(res, 409, method === "card" ? "카드 결제는 PG 심사가 끝나면 열려요. 지금은 무통장 입금으로 결제해 주세요." : "이 간편결제는 아직 준비 중이에요. 다른 결제 방법을 골라 주세요.");
    if (!PG_METHODS[method] && method !== "bank") return fail(res, 400, "결제 방법을 골라 주세요.");
  }
  const bank = q.total > 0 && method === "bank", bk = bank ? await BM.info() : null;
  if (bank && !bk) return fail(res, 409, "무통장 입금 계좌가 아직 준비되지 않았어요. 고객센터로 문의해 주세요.");
  // 입금자명: 자동 입금 확인이 이 이름 + 금액으로 주문을 찾아요 (비우면 주문자 이름)
  const depositor = bank ? String(b.depositor || (b.buyer && b.buyer.name) || m.name || "").replace(/\s+/g, "").slice(0, 20) : "";
  if (bank && !depositor) return fail(res, 400, "입금자명을 적어 주세요.");
  const paymentId = "pay_" + Date.now().toString(36) + V.uid("_").slice(1), at = Date.now(), nos = [];
  const buyer = b.buyer && typeof b.buyer === "object" ? { name: String(b.buyer.name || m.name || "").slice(0, 20), phone: String(b.buyer.phone || m.phone || "").replace(/\s/g, "").slice(0, 14) } : null;
  for (let i = 0; i < q.items.length; i++) {
    let no = V.newNo(); const it = q.items[i];
    const ch = ["web", "ins", "ad"].indexOf(b.ch) >= 0 ? b.ch : "web";
    const o = Object.assign({ id: "", no, mid: m.id, method: q.total > 0 ? method.slice(0, 12) : q.points ? "point" : "free", status: bank ? "pending" : "ready", createdAt: at, at, paymentId, ch }, it, i ? { grp: nos[0] } : {}, buyer ? { buyer } : {}, bank ? { pg: { st: "bank" }, depositor, dueAt: at + bk.days * 864e5, bankTo: { bank: bk.bank, account: bk.account, holder: bk.holder } } : {});
    if (i === 0 && it.kind === "tea" && b.tea && typeof b.tea === "object") o.tea = { d1: String(b.tea.d1 || "").slice(0, 10), d2: String(b.tea.d2 || "").slice(0, 10), slot: String(b.tea.slot || "").slice(0, 30), mode: String(b.tea.mode || "").slice(0, 10), topic: String(b.tea.topic || "").slice(0, 500), st: "req" };
    // id: 마스터 화면이 주문을 찾는 칸 (주문 번호와 같게)
    for (let t = 0; t < 4 && !(await V.create(V.K.order(no), Object.assign(o, { id: "vo-" + no, no }))); t++) no = V.newNo();
    nos.push(no);
  }
  await V.create(V.K.pay(paymentId), { nos, mid: m.id, total: q.total, at, bank });
  await V.addOrderNos(m.id, nos);
  if (q.total === 0) { const r = await finalize(paymentId); return send(res, 200, Object.assign({ free: true }, r)); }
  if (bank) {
    let made = (await Promise.all(nos.map((n) => V.get(V.K.order(n))))).filter(Boolean);
    await useCouponPoints(m.id, made, paymentId, nos[0]);
    // 자동 입금 확인(페이액션): 입금보다 먼저 주문을 등록해 둬요 (실패해도 주문은 그대로 · 마스터가 직접 확인)
    if (PA.on()) {
      const r = await PA.register(made[0], q.total, depositor, buyer, m.email).then(() => "ok", (e) => { console.error("[vod-pay] payaction register", nos[0], e.message); return "fail"; });
      await V.update(V.K.order(nos[0]), (x) => (x ? Object.assign(x, { pg: Object.assign({}, x.pg || {}, { pa: r }) }) : undefined));
      made = (await Promise.all(nos.map((n) => V.get(V.K.order(n))))).filter(Boolean);
    }
    return send(res, 200, { ok: true, bank: true, no: nos[0], orders: made, amount: q.total, to: bk, depositor });
  }
  send(res, 200, { ok: true, paymentId, amount: q.total, orderName: q.orderName, no: nos[0] });
}
async function cancel(res, m, b) {
  const o = await V.get(V.K.order(String(b.no || "")));
  if (!o || o.mid !== m.id) return fail(res, 404, "주문을 찾지 못했어요.");
  if (!(o.pg && o.pg.st === "paid")) return fail(res, 409, "무통장 입금 주문은 환불 요청으로 처리해요. 계좌로 돌려드려요.");
  const ok = await V.instantOf(o);
  if (!ok.ok) return fail(res, 409, ok.why);
  const rf = V.rfSet(await V.catalog()), orders = await V.ordersOf(m.id);
  const adds = rf.addons ? orders.filter((x) => x.grp === o.no && x.status === "paid" && !(x.coach && Number(x.coach.used) > 0)) : [];
  const amount = o.amount + adds.reduce((a, x) => a + x.amount, 0);
  let cancelId = "";
  if (o.pg && o.pg.st === "paid" && amount > 0) { const r = await portone.cancelPayment(o.paymentId, amount, "회원 바로 취소 (결제 후 " + rf.days + "일 이내 · 미수강)"); cancelId = (r && r.cancellation && r.cancellation.id) || ""; }
  for (const x of [o].concat(adds)) await markRefunded(x, x.amount, { kind: "instant", why: x === o ? "회원 바로 취소" : "함께 결제한 상품 같이 취소", by: "회원", cancel: { id: cancelId, at: Date.now() } }, rf.restore);
  send(res, 200, { ok: true, cancelId, amount });
}
async function cancelPending(res, m, b) {
  const o = await V.get(V.K.order(String(b.no || "")));
  if (!o || o.mid !== m.id) return fail(res, 404, "주문을 찾지 못했어요.");
  if (o.status !== "pending") return fail(res, 409, "입금 전 주문만 취소할 수 있어요.");
  await BM.drop(o, "회원");
  send(res, 200, { ok: true });
}

/** 산 VOD 의 두잉고 강의실: 이 회원의 두잉고 수강생 계정(없으면 만들기) → 수강생 로그인 쿠키 */
async function enterDg(req, res, m, b) {
  const iid = String(b.iid || ""), cat = (await V.catalog()) || {};
  const ids = await auth.identify(req), owns = new Set((ids.vod && ids.vod.owns) || []);
  const p = (cat.products || []).find((x) => x.iid === iid && x.dg && owns.has(x.id));
  if (!p) return fail(res, 403, "이 강사님의 VOD를 구매한 회원만 들어갈 수 있어요.");
  const ins = await V.get("ins:" + iid);
  if (!ins || ins.status !== "active") return fail(res, 409, "강사님 강의실이 잠시 닫혀 있어요.");
  const rows = await store.listDocs({ prefixes: ["stu:" + iid + ":%"] });
  let s = rows.map((r) => r.v).find((x) => x && x.vodMid === m.id);
  const last4 = String(m.phone || "").replace(/\D/g, "").slice(-4);
  if (!s) {
    s = { id: V.uid("vs"), instructorId: iid, cohortId: "vod:" + iid, track: "vod", name: m.name || "회원", phone4: last4, status: "approved", appliedAt: new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10), vodMid: m.id, source: "doogoclass", joinedAt: Date.now() };
    if (!(await V.create("stu:" + iid + ":" + s.id, s))) return fail(res, 409, "잠시 후 다시 시도해 주세요.");
  } else if (s.status === "withdrawn") return fail(res, 403, "강사님이 두잉고 이용을 멈춘 계정이에요. 고객센터로 문의해 주세요.");
  else if (s.name !== m.name || (last4 && s.phone4 !== last4)) await V.update("stu:" + iid + ":" + s.id, (x) => x && Object.assign(x, { name: m.name || x.name, phone4: last4 || x.phone4 }));
  auth.setCookie(req, res, "student", auth.sign({ r: "student", iid, sid: s.id }));
  send(res, 200, { ok: true, sid: s.id, iid });
}
async function refund(res, b) {
  const o = await V.get(V.K.order(String(b.no || "")));
  if (!o || o.status !== "paid") return fail(res, 404, "환불할 수 있는 주문이 아니에요.");
  const amount = Math.round(Number(b.amount));
  if (!(amount >= 0 && amount <= o.amount)) return fail(res, 400, "환불 금액은 0원 ~ 결제 금액 사이로 적어 주세요.");
  let cancelId = "";
  // 포트원으로 결제한 주문만 포트원 취소 — 무통장 입금은 마스터가 계좌로 돌려줘요 (기록만)
  if (o.pg && o.pg.st === "paid" && amount > 0) { const r = await portone.cancelPayment(o.paymentId, amount, String(b.reason || "운영자 환불")); cancelId = (r && r.cancellation && r.cancellation.id) || ""; }
  const rf = V.rfSet(await V.catalog());
  const next = await markRefunded(o, amount, { kind: amount < o.amount ? "partial" : "master", why: String(b.reason || "운영자 환불").slice(0, 100), by: "마스터", cancel: { id: cancelId, at: Date.now() } }, rf.restore);
  send(res, 200, { ok: true, cancelId, order: next });
}
/** 쿠폰 받기: 쿠폰 코드 등록(code) · 상세 페이지 "쿠폰 받기"(cid, 내려받기 쿠폰만) */
async function claim(res, m, b) {
  const list = (await V.catalog()).coupons || [], today = kstDay(Date.now()), code = String(b.code || "").trim().toUpperCase();
  const c = code ? list.find((x) => String(x.code || "").toUpperCase() === code) : list.find((x) => x.id === String(b.cid || "") && (x.dl || x.auto === "signup"));
  if (!c || c.on === false) return fail(res, 404, code ? "쿠폰 코드를 다시 확인해 주세요." : "받을 수 없는 쿠폰이에요.");
  if (c.endAt && c.endAt < today) return fail(res, 409, "기간이 끝난 쿠폰이에요.");
  let dup = false;
  const next = await V.update(V.K.member(m.id), (x) => {
    if (!x) return undefined;
    x.coupons = x.coupons || [];
    if (x.coupons.some((y) => y.cid === c.id)) { dup = true; return undefined; }
    const exp = c.days ? addDays(today, c.days) : c.endAt || "";
    x.coupons.push({ id: V.uid("mc"), cid: c.id, at: Date.now(), exp: c.endAt && exp > c.endAt ? c.endAt : exp, usedAt: null, orderNo: "" });
    return x;
  });
  if (dup) return fail(res, 409, "이미 받은 쿠폰이에요.");
  send(res, 200, { ok: true, name: c.name, member: V.pub(next || m) });
}
async function track(res, m, b) {
  const pid = String(b.pid || ""), lid = String(b.lid || "").slice(0, 80), ev = String(b.ev || "");
  if (!pid || ["seen", "done", "mat"].indexOf(ev) < 0 || (ev !== "mat" && !lid)) return fail(res, 400, "input");
  const owns = (await V.ordersOf(m.id)).some((o) => o.pid === pid && o.status === "paid");
  if (!owns) return fail(res, 403, "구매한 강의가 아니에요.");
  await V.update(V.K.prog(m.id), (p) => { p = p || {}; const x = (p[pid] = p[pid] || { seen: {}, done: {}, mat: 0 }); if (ev === "seen" && !x.seen[lid]) x.seen[lid] = Date.now(); else if (ev === "done") { x.done[lid] = true; if (!x.seen[lid]) x.seen[lid] = Date.now(); } else if (ev === "mat") x.mat = (Number(x.mat) || 0) + 1; else return undefined; return p; });
  send(res, 200, { ok: true });
}
/** 카탈로그: 가격 계산에 필요한 칸만 받아요 */
const P_KEYS = ["id", "title", "type", "status", "price", "sale", "saleEnd", "plans", "accessDays", "eventAt", "eventMin", "seats", "next", "ebPrice", "ebDays", "coach", "tea", "dg", "iid", "share"];
const C_KEYS = ["id", "code", "name", "kind", "value", "max", "min", "days", "endAt", "types", "auto", "dl", "on"];
const pick = (o, ks) => { const r = {}; ks.forEach((k) => { if (o && o[k] !== undefined) r[k] = o[k]; }); return r; };
async function saveCatalog(res, b) {
  const c = b.catalog || {};
  if (!Array.isArray(c.products)) return fail(res, 400, "products");
  const v = { at: Date.now(), products: c.products.slice(0, 500).map((p) => pick(p, P_KEYS)), coupons: (c.coupons || []).slice(0, 200).map((x) => pick(x, C_KEYS)), settings: pick(c.settings || {}, ["coach", "tea", "extendPct", "refund"]), biz: c.biz || {} };
  await V.update(V.K.cat, () => v);
  send(res, 200, { ok: true, at: v.at, n: v.products.length });
}
async function readRaw(req) {
  if (typeof req.rawBody === "string") return req.rawBody;
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString("utf8");
  if (req.readable) { const ch = []; for await (const c of req) ch.push(c); return Buffer.concat(ch).toString("utf8"); }
  return typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
}
async function webhook(req, res) {
  const raw = await readRaw(req);
  if (!portone.verifyWebhook(raw, req.headers)) return send(res, 401, { ok: false });
  let ev = {}; try { ev = JSON.parse(raw); } catch (e) { return send(res, 400, { ok: false }); }
  const pid = ev && ev.data && ev.data.paymentId;
  if (pid && /Paid$/.test(ev.type || "")) { const r = await finalize(pid).catch((e) => ({ ok: false, message: e.message })); if (!r.ok) console.error("[vod-pay webhook] paid", pid, r.message); }
  else if (pid && /Cancel/.test(ev.type || "")) {
    // 포트원 콘솔에서 직접 취소한 경우도 주문에 맞춰요
    const idx = await V.get(V.K.pay(pid)), pay = idx ? await portone.getPayment(pid).catch(() => null) : null;
    if (idx && pay && /CANCELLED/.test(pay.status || "")) { for (const no of idx.nos) { const o = await V.get(V.K.order(no)); if (o && o.status === "paid" && pay.status === "CANCELLED") await markRefunded(o, o.amount, { kind: "master", why: "포트원에서 취소", by: "포트원", cancel: { at: Date.now() } }, false); } }
  }
  send(res, 200, { ok: true });
}

module.exports = handler(["POST"], async (req, res) => {
  if (req.headers["webhook-id"]) return webhook(req, res);
  if (!edge.originOk(req)) return fail(res, 403, "forbidden");
  if (process.env.VOD_SERVER_AUTH !== "1") return fail(res, 404, "서버 결제가 아직 꺼져 있어요.");
  const b = await body(req), a = String(b.action || "");
  if (a === "refund" || a === "catalog" || a === "bankOk" || a === "bankCancel" || a === "bankLog" || a === "bankLink") {
    const ids = await auth.identify(req);
    if (!(ids.admin && ids.admin.role === "master")) return fail(res, 403, "마스터만 할 수 있어요.");
    const by = String((ids.admin && (ids.admin.name || ids.admin.id)) || "마스터").slice(0, 20);
    if (a === "bankOk") { const r = await BM.confirm(b.no, by, { okHow: "manual" }); return send(res, r.ok ? 200 : 409, r); }
    if (a === "bankCancel") { const o = await V.get(V.K.order(String(b.no || ""))); if (!o || o.status !== "pending") return fail(res, 409, "입금 대기 주문만 취소할 수 있어요."); await BM.drop(o, by); return send(res, 200, { ok: true }); }
    if (a === "bankLog") return send(res, 200, Object.assign({ ok: true }, await BM.log()));
    if (a === "bankLink") return send(res, 200, await BM.link(String(b.id || ""), String(b.no || ""), by));
    return a === "refund" ? refund(res, b) : saveCatalog(res, b);
  }
  const m = await V.current(req);
  if (!m) return fail(res, 401, "로그인이 필요해요.");
  try {
    if (a === "prepare") return await prepare(res, m, b);
    if (a === "complete") { const idx = await V.get(V.K.pay(String(b.paymentId || ""))); if (!idx || idx.mid !== m.id) return fail(res, 404, "주문을 찾지 못했어요."); const r = await finalize(String(b.paymentId)); return send(res, r.ok ? 200 : 409, r); }
    if (a === "abort") { const idx = await V.get(V.K.pay(String(b.paymentId || ""))); if (!idx || idx.mid !== m.id) return send(res, 200, { ok: true }); for (const no of idx.nos) await V.update(V.K.order(no), (o) => (o && o.status === "ready" ? Object.assign(o, { status: "failed", failedAt: Date.now(), failCode: String(b.code || "").slice(0, 40) }) : undefined)); return send(res, 200, { ok: true }); }
    if (a === "cancel") return await cancel(res, m, b);
    if (a === "cancelPending") return await cancelPending(res, m, b);
    if (a === "dg") return await enterDg(req, res, m, b);
    if (a === "track") return await track(res, m, b);
    if (a === "claim") return await claim(res, m, b);
    if (a === "orders") return send(res, 200, { ok: true, orders: await V.ordersOf(m.id) });
  } catch (e) {
    console.error("[vod-pay]", a, e.status || "", e.message);
    return fail(res, 502, e.status ? "결제 회사(PG) 응답에 문제가 있어요. 잠시 후 다시 시도해 주세요." : "처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  fail(res, 400, "action");
});
