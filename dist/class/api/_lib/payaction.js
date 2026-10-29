/* 페이액션(PayAction) — 무통장 입금 자동 확인 (서버에서만 써요 · 키는 화면으로 보내지 않아요)
 *
 *  PAYACTION_API_KEY      대시보드 › API › API 키 (비밀)
 *  PAYACTION_MALL_ID      대시보드 › API › 상점 ID
 *  PAYACTION_WEBHOOK_KEY  대시보드 › API › 웹훅 키 (비밀) — 페이액션이 보내는 ‘매칭완료’ 알림이 진짜인지 확인해요
 *
 * 흐름: 무통장 주문을 받으면 바로 주문 등록(입금자명 · 금액) → 우리 계좌에 같은 이름 · 금액이 들어오면
 *       페이액션이 /api/vod-bank 로 { order_number, order_status: "매칭완료" } 를 보내요 → 입금 확인 → 바로 수강.
 *       입금이 주문 등록보다 먼저 들어오면 맞추지 못해요 (그래서 주문을 만들자마자 등록해요).
 * 주문 등록: POST https://api.payaction.app/order  (헤더 x-api-key · x-mall-id)
 *   응답이 HTTP 200 이어도 { status: "error" } 일 수 있어 본문까지 확인해요.
 * 공식 문서(연결 전에 다시 확인): https://payaction.app/developer */
"use strict";
const crypto = require("crypto");

const API = "https://api.payaction.app";
const on = () => !!(process.env.PAYACTION_API_KEY && process.env.PAYACTION_MALL_ID);
/** 화면에 ‘24시간 자동 확인’을 보여도 되는지: 주문 등록 키 + 웹훅 키가 모두 있을 때 */
const auto = () => on() && !!process.env.PAYACTION_WEBHOOK_KEY;
const hdr = () => ({ "Content-Type": "application/json", "x-api-key": process.env.PAYACTION_API_KEY, "x-mall-id": process.env.PAYACTION_MALL_ID });
const kst = (t) => new Date(t + 9 * 36e5).toISOString().replace(/\.\d+Z$/, "+09:00");

async function call(path, body) {
  const r = await fetch(API + path, { method: "POST", headers: hdr(), body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || (j && j.status && j.status !== "success")) { const e = new Error((j && j.response && j.response.message) || "payaction " + r.status); e.status = r.status; throw e; }
  return j;
}
/** 무통장 주문 등록 — 같은 결제로 묶인 주문은 합계 금액 하나로 */
async function register(o, total, depositor, buyer, email) {
  return call("/order", {
    order_number: o.no, order_amount: total, order_date: kst(o.at || Date.now()),
    billing_name: depositor, orderer_name: (buyer && buyer.name) || depositor,
    orderer_phone_number: String((buyer && buyer.phone) || "").replace(/\D/g, "") || undefined,
    orderer_email: email || undefined
  });
}
/** 입금 전에 취소한 주문은 맞추기에서 빼요 */
async function exclude(no) { return call("/order-exclude", { order_number: no }); }
/** 웹훅 키 확인 (문서에 따라 x-webhook-key 또는 x-api-key 로 와요) */
function verify(headers) {
  const want = Buffer.from(String(process.env.PAYACTION_WEBHOOK_KEY || ""));
  if (!want.length) return false;
  return ["x-webhook-key", "x-api-key"].some((h) => { const got = Buffer.from(String(headers[h] || "")); return got.length === want.length && crypto.timingSafeEqual(got, want); });
}

module.exports = { on, auto, register, exclude, verify };
