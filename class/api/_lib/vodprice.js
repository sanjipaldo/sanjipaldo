/* 두고클래스 가격 계산 (서버) — 화면(vod.js)과 같은 규칙으로 서버가 금액을 다시 계산해요.
 * 결제 금액은 언제나 서버가 정해요: 화면이 보낸 금액(expect)은 ‘화면과 서버가 같은지’ 확인하는 데만 써요.
 * 카탈로그(vcat)는 마스터가 클래스 · 쿠폰 · 설정을 저장할 때 서버로 올려요 (가격에 필요한 칸만). */
"use strict";

const PLAN_DAYS = [[180, "180일", 1], [365, "365일", 1.1], [1095, "3년", 1.2]];
const BIZ_DEF = { ebook: true, live: false, free: false, flive: false };
const TYPES = { vod: 1, ebook: 1, live: 1, offline: 1 };
const r1k = (n) => Math.round(n / 1000) * 1000;
const KST = 9 * 3600e3;
const kstDay = (ms) => new Date(ms + KST).toISOString().slice(0, 10);
const addDays = (d, n) => kstDay(Date.parse(d + "T00:00:00+09:00") + n * 864e5);
/** "2026-11-17T19:30" 처럼 시간대 없이 적은 시각은 한국 시간으로 읽어요 (화면은 한국 브라우저 기준) */
const kst = (s) => { if (!s) return 0; const str = String(s); const t = Date.parse(/([zZ]|[+-]\d\d:?\d\d)$/.test(str) ? str : str + (str.length <= 16 ? ":00" : "") + "+09:00"); return isNaN(t) ? 0 : t; };

function pricer(cat, nowMs) {
  const now = nowMs || Date.now(), P = (cat && cat.products) || [], S = (cat && cat.settings) || {}, B = (cat && cat.biz) || {};
  const today = kstDay(now);
  const product = (id) => P.find((p) => p.id === id) || null;
  const typeOf = (p) => (p && TYPES[p.type] ? p.type : "vod");
  const isEvent = (p) => /^(live|offline)$/.test(typeOf(p));
  const bizOn = (k) => (B[k] != null ? B[k] !== false : BIZ_DEF[k] !== false);
  const basePrice = (p) => (p.sale != null && p.sale !== "" && (!p.saleEnd || today <= p.saleEnd) ? Number(p.sale) : Number(p.price) || 0);
  const isFreeEv = (p) => !!p && isEvent(p) && !(Number(p.price) > 0);
  const evEnd = (p) => kst(p.eventAt) + (Number(p.eventMin) || 60) * 6e4;
  function funnelOf(f) {
    if (!isFreeEv(f) || !f.next || !kst(f.eventAt)) return null;
    const end = evEnd(f), ebDay = addDays(kstDay(end), Math.max(1, Math.min(60, Number(f.ebDays) || 3))), ebEnd = kst(ebDay + "T23:59:59");
    return { end, ebEnd, ebPrice: Number(f.ebPrice) || 0, phase: now < end ? "before" : now <= ebEnd ? "eb" : "done" };
  }
  function funnelTo(p) {
    if (!p || isFreeEv(p) || !bizOn("flive")) return null;
    const fs = P.filter((f) => f.status === "on" && f.next === p.id).map(funnelOf).filter(Boolean);
    return fs.filter((x) => x.phase === "eb").sort((a, b) => b.end - a.end)[0] || fs.filter((x) => x.phase === "before").sort((a, b) => a.end - b.end)[0] || null;
  }
  function ebOf(p) { const fn = funnelTo(p); return fn && fn.phase === "eb" && fn.ebPrice > 0 && fn.ebPrice < basePrice(p) ? { price: fn.ebPrice } : null; }
  const priceOf = (p) => { const e = ebOf(p); return e ? e.price : basePrice(p); };
  function plansOf(p) {
    if (!p || typeOf(p) !== "vod" || priceOf(p) === 0) return [];
    const cfg = p.plans || {}, base = priceOf(p), list0 = Number(p.price) || base, eb = ebOf(p), er = eb ? eb.price / basePrice(p) : 1;
    return PLAN_DAYS.map((x) => { const c = cfg[x[0]] || {}; if (c.on === false) return null; const sale = c.price != null && c.price !== "" ? (eb ? r1k(Number(c.price) * er) : Number(c.price)) : r1k(base * x[2]); return { d: x[0], label: x[1], sale, list: Math.max(sale, r1k(list0 * x[2])) }; }).filter(Boolean);
  }
  const defPlan = (p) => { const ps = plansOf(p); return ps.find((x) => x.d === 365) || ps[0] || null; };
  const planOf = (p, d) => plansOf(p).find((x) => x.d === Number(d)) || defPlan(p);
  function coachOf(p) {
    if (!p || typeOf(p) !== "vod" || priceOf(p) === 0 || !p.dg) return null;
    const c = p.coach || {}, d = S.coach || {};
    if (c.on === false) return null;
    return { n: Number(c.n) || Number(d.n) || 5, days: Number(c.days) || Number(d.days) || 180, price: c.price != null && c.price !== "" ? Number(c.price) : Number(d.price) || 150000 };
  }
  function teaOf(p) {
    if (!p || typeOf(p) !== "vod" || priceOf(p) === 0 || !p.dg) return null;
    const t = p.tea || {}, d = S.tea || {};
    if (t.on === false) return null;
    return { min: Number(t.min) || Number(d.min) || 60, price: t.price != null && t.price !== "" ? Number(t.price) : Number(d.price) || 99000 };
  }
  const extendPct = () => { const n = Number(S.extendPct); return n > 0 && n <= 100 ? n : 50; };
  function extendOf(p) { const y = plansOf(p).find((x) => x.d === 365) || defPlan(p); return y ? { d: 365, sale: r1k(y.sale * extendPct() / 100), list: y.sale } : null; }
  function couponOff(c, p, amount) {
    if (!c || amount <= 0) return 0;
    if ((c.types || []).length && c.types.indexOf(typeOf(p)) < 0) return 0;
    if (c.min && amount < c.min) return 0;
    const off = c.kind === "pct" ? Math.floor(amount * c.value / 100 / 10) * 10 : Number(c.value) || 0;
    return Math.min(amount, c.kind === "pct" && c.max ? Math.min(off, c.max) : off);
  }
  return { now, today, product, typeOf, isEvent, isFreeEv, basePrice, priceOf, plansOf, planOf, coachOf, teaOf, extendOf, couponOff, evEnd, kst };
}

module.exports = { pricer, PLAN_DAYS, r1k, kst, kstDay, addDays };
