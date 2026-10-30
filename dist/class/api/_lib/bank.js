/* 무통장 입금 — 받을 계좌 · 입금 확인 · 자동 입금 확인(입금 알림 ↔ 주문 맞추기)
 *
 *  주문 (vo:<번호>)   pg.st "bank" · depositor(입금자명) · dueAt(입금 기한) · bankTo(주문할 때 안내한 계좌)
 *  입금 확인          마스터 ‘입금 확인’ 버튼(/api/vod-pay bankOk) · 자동 입금 확인(/api/vod-bank)이 같은 confirm() 을 써요
 *                     → 주문 paid · 수강생 수 반영 → 회원이 바로 수강 (같은 결제로 산 코칭권도 같이)
 *  vbank (서버 전용)  최근 입금 알림 200건 { id, at, name, amount, bank, st, no } — 마스터 화면에서 ‘못 맞춘 입금’을 직접 연결
 *     st: ok 자동 확인 · none 맞는 주문 없음 · many 같은 이름 · 금액 주문이 여럿 · linked 마스터가 연결 · fail 확인 실패
 * 자동 확인은 ‘입금자명 + 금액’이 같은 입금 대기 주문이 딱 하나일 때만 해요. 애매하면 마스터가 고르게 남겨요. */
"use strict";
const store = require("./store");
const V = require("./vod");
const VA = require("./vodaccess");

/** 받을 계좌: VOD 설정(전시 · 쿠폰 · 설정) → 비어 있으면 기수 입금 계좌(매출 · 기수 정산) */
async function info() {
  const r = await store.getDoc("meta"), meta = (r && r.v) || {}, s = (meta.vod || {}).settings || {}, bl = meta.billing || {};
  const x = s.bank && s.account ? s : bl.bank && bl.account ? bl : null;
  return x ? { bank: String(x.bank).slice(0, 20), account: String(x.account).slice(0, 40), holder: String(x.holder || s.holder || bl.holder || "").slice(0, 30), days: Math.min(14, Math.max(1, Number(s.payDays) || 3)) } : null;
}
/** 이름 비교용: 띄어쓰기 · 괄호 · 점 빼고 소문자 (은행 앱마다 ‘홍길동’ · ‘홍 길동’ · ‘(주)두고’ 처럼 달라서) */
const nameKey = (x) => String(x || "").replace(/[\s()（）[\].,·_-]/g, "").toLowerCase();

/** 같은 결제(무통장 주문 1건)로 묶인 주문 번호 — 수강권 + 함께 산 코칭권 */
async function groupNos(o) { const idx = o.paymentId ? await V.get(V.K.pay(o.paymentId)) : null; return idx && Array.isArray(idx.nos) && idx.nos.length ? idx.nos : [o.no]; }

/** 주문을 받으면서 쓴 쿠폰 · 포인트 돌려주기 (입금 전에 취소했을 때) */
async function giveBack(o) {
  if (!(o.pointOff || o.mcid)) return;
  const at = Date.now();
  await V.update(V.K.member(o.mid), (m) => { if (!m) return undefined; if (o.pointOff) { m.points = (Number(m.points) || 0) + o.pointOff; (m.pointLog = m.pointLog || []).push({ at, amt: o.pointOff, why: "주문 취소 · 포인트 돌려받음 (" + o.no + ")" }); } if (o.mcid) { const c = (m.coupons || []).find((x) => x.id === o.mcid); if (c) { c.usedAt = null; c.orderNo = ""; } } return m; });
}
/** 입금 전 주문 취소 (회원 · 마스터) — 자동 입금 확인(페이액션)에 등록한 주문이면 맞추기에서도 빼요 */
async function drop(o, by) {
  if (o.pg && o.pg.pa === "ok") await require("./payaction").exclude(o.no).catch((e) => console.error("[bank] payaction exclude", o.no, e.message));
  // 가상계좌는 발급 계좌를 닫아요. 닫히지 않으면 그 사이 입금됐는지 포트원에 물어 — 입금됐으면 취소하지 않고 결제 완료로 돌려요
  if (o.method === "vbank" && o.paymentId && o.pg && o.pg.st === "issued") {
    const po = require("./portone");
    if (po.on()) {
      try { await po.closeVirtualAccount(o.paymentId); } catch (e) {
        console.error("[bank] vbank close", o.no, e.message);
        const pay = await po.getPayment(o.paymentId).catch(() => null);
        if (pay && pay.status === "PAID") return { ok: false, paid: true, message: "방금 가상계좌 입금이 확인돼 주문을 취소하지 않았어요." };
      }
    }
  }
  for (const no of await groupNos(o)) {
    const x = await V.get(V.K.order(no));
    const done = x && (await V.update(V.K.order(no), (y) => (y && y.status === "pending" ? Object.assign(y, { status: "canceled", canceledAt: Date.now(), cancelBy: by }) : undefined)));
    if (done && done.status === "canceled" && x.status === "pending") await giveBack(x);
  }
  return { ok: true };
}
/** 입금 확인 → 바로 수강. 두 번 와도 한 번만 (이미 결제 완료면 already) */
async function confirm(no, by, extra) {
  const o = await V.get(V.K.order(String(no || "")));
  if (!o) return { ok: false, message: "주문을 찾지 못했어요." };
  if (o.status === "paid") return { ok: true, already: true, no: o.no, orders: [] };
  if (o.status !== "pending") return { ok: false, message: "입금 대기 주문이 아니에요. (" + o.status + ")" };
  if (o.method === "vbank") return { ok: false, message: "가상계좌는 회원이 입금하면 포트원이 알려 줘서 자동으로 확인돼요." };
  const at = Date.now(), done = [];
  for (const n of await groupNos(o)) {
    const prev = await V.get(V.K.order(n));
    const next = await V.update(V.K.order(n), (x) => (x && x.status === "pending" ? Object.assign(x, { status: "paid", paidAt: at, depositBy: by, pg: Object.assign({}, x.pg || {}, { st: "bank", okAt: at, okBy: by }, extra || {}) }) : undefined));
    if (next && next.status === "paid" && prev && prev.status === "pending") { await VA.afterOrder(prev, next); done.push(next); }
  }
  return { ok: true, no: o.no, orders: done, amount: done.reduce((a, x) => a + (Number(x.amount) || 0), 0) };
}

/** 입금 대기 무통장 주문 — 같은 결제로 묶인 주문은 합계 금액으로 (입금은 한 번에 들어오니까) */
async function pendingGroups() {
  const rows = await store.listDocs({ prefixes: ["vo:%"] }), g = {};
  rows.forEach((r) => {
    const o = r.v;
    if (!o || o.status !== "pending" || !(o.pg && o.pg.st === "bank")) return;
    const k = o.paymentId || o.no, x = (g[k] = g[k] || { head: null, amount: 0 });
    x.amount += Number(o.amount) || 0;
    if (!o.grp) x.head = o;
  });
  return Object.keys(g).map((k) => g[k]).filter((x) => x.head);
}
const LOG = "vbank", KEEP = 200;
async function remember(e) {
  await V.update(LOG, (x) => { x = x || { recent: [] }; x.recent = [e].concat((x.recent || []).filter((y) => y.id !== e.id)).slice(0, KEEP); return x; });
}
/** 입금 알림 1건 → 맞는 주문 찾기 · 확인. dep = { id(은행 거래 고유값), name(입금자명), amount, at, bank } */
async function match(dep) {
  const id = String(dep.id || "").slice(0, 80), name = String(dep.name || "").slice(0, 30), amount = Math.round(Number(dep.amount) || 0);
  if (!id || !name || !(amount > 0)) return { ok: false, message: "입금 정보가 모자라요." };
  const seen = ((await V.get(LOG)) || { recent: [] }).recent.find((y) => y.id === id);
  if (seen) return { ok: true, dup: true, st: seen.st, no: seen.no || "" };
  const hit = (await pendingGroups()).filter((x) => x.amount === amount && nameKey(x.head.depositor || (x.head.buyer && x.head.buyer.name)) === nameKey(name));
  let st = hit.length === 1 ? "ok" : hit.length ? "many" : "none", no = hit.length === 1 ? hit[0].head.no : "";
  if (st === "ok") { const r = await confirm(no, "자동 입금 확인", { okHow: "auto", depId: id }); if (!r.ok) st = "fail"; }
  await remember({ id, at: Number(dep.at) || Date.now(), got: Date.now(), name, amount, bank: String(dep.bank || "").slice(0, 20), st, no });
  return { ok: true, st, no };
}
/** 마스터 화면: 최근 입금 알림 + 지금 입금 대기 주문 */
async function log() {
  const x = (await V.get(LOG)) || { recent: [] };
  return { recent: x.recent || [] };
}
/** 마스터가 ‘못 맞춘 입금’을 주문에 직접 연결 → 입금 확인 */
async function link(id, no, by) {
  const x = (await V.get(LOG)) || { recent: [] }, e = (x.recent || []).find((y) => y.id === id);
  if (!e) return { ok: false, message: "입금 알림을 찾지 못했어요." };
  if (e.st === "ok" || e.st === "linked") return { ok: false, message: "이미 주문에 연결된 입금이에요." };
  const r = await confirm(no, by, { okHow: "linked", depId: id });
  if (r.ok) await remember(Object.assign({}, e, { st: "linked", no: r.no, by }));
  return r;
}

module.exports = { info, nameKey, groupNos, giveBack, drop, confirm, pendingGroups, match, log, link, remember };
