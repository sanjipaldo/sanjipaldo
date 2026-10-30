/* 포트원(PortOne) V2 — 서버에서만 쓰는 부분 (API Secret 은 절대 화면으로 보내지 않아요)
 *
 *  PORTONE_STORE_ID        상점 ID (store-…) — 공개 값, 화면 결제창에도 써요
 *  PORTONE_API_SECRET      V2 API Secret — 결제 확인 · 취소에 써요 (비밀)
 *  PORTONE_WEBHOOK_SECRET  웹훅 시크릿 (whsec_…) — 포트원이 보내는 결제 알림이 진짜인지 확인해요 (비밀)
 *
 * 결제 확인: GET  https://api.portone.io/payments/{paymentId}
 * 결제 취소: POST https://api.portone.io/payments/{paymentId}/cancel  { reason, amount(부분 취소일 때만), refundAccount(가상계좌 환불) }
 * 가상계좌 말소: POST https://api.portone.io/payments/{paymentId}/virtual-account/close (입금 전 주문 취소)
 * 공식 문서(정식 연결 전에 다시 확인): https://developers.portone.io/api/rest-v2 */
"use strict";
const crypto = require("crypto");

const API = "https://api.portone.io";
const on = () => !!(process.env.PORTONE_STORE_ID && process.env.PORTONE_API_SECRET);
const hdr = () => ({ Authorization: "PortOne " + process.env.PORTONE_API_SECRET, "Content-Type": "application/json" });
const storeQ = () => (process.env.PORTONE_STORE_ID ? "?storeId=" + encodeURIComponent(process.env.PORTONE_STORE_ID) : "");

async function call(method, path, body) {
  const r = await fetch(API + path, { method, headers: hdr(), body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error((j && (j.message || j.type)) || "portone " + r.status); e.status = r.status; e.body = j; throw e; }
  return j;
}
/** 결제 한 건 조회 → { status: "PAID" | "READY" | "FAILED" | "CANCELLED" | "PARTIAL_CANCELLED" …, amount: { total, paid, cancelled }, currency, … } */
const getPayment = (paymentId) => call("GET", "/payments/" + encodeURIComponent(paymentId) + storeQ());
/** 결제 취소 — amount 를 빼면 남은 금액 전부 취소. 가상계좌는 refundAccount { bank(표준 은행 코드), number, holderName } 가 꼭 있어야 해요 */
function cancelPayment(paymentId, amount, reason, refundAccount) {
  const body = { reason: String(reason || "회원 요청 취소").slice(0, 100) };
  if (process.env.PORTONE_STORE_ID) body.storeId = process.env.PORTONE_STORE_ID;
  if (amount != null) body.amount = Math.round(amount);
  if (refundAccount) body.refundAccount = refundAccount;
  return call("POST", "/payments/" + encodeURIComponent(paymentId) + "/cancel", body);
}
/** 발급한 가상계좌 말소 (입금 전에 주문을 취소할 때) */
const closeVirtualAccount = (paymentId) => call("POST", "/payments/" + encodeURIComponent(paymentId) + "/virtual-account/close" + storeQ());
/** 웹훅 서명 확인 (Standard Webhooks: webhook-id · webhook-timestamp · webhook-signature 헤더, 5분 안의 요청만) */
function verifyWebhook(raw, headers) {
  const secret = process.env.PORTONE_WEBHOOK_SECRET;
  if (!secret) return false;
  const id = headers["webhook-id"], ts = headers["webhook-timestamp"], sigs = String(headers["webhook-signature"] || "");
  if (!id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const want = crypto.createHmac("sha256", key).update(id + "." + ts + "." + raw).digest();
  return sigs.split(" ").some((s) => { const v = s.split(",")[1]; if (!v) return false; const got = Buffer.from(v, "base64"); return got.length === want.length && crypto.timingSafeEqual(got, want); });
}

/** 결제수단의 채널 키 (없으면 그 결제수단은 닫혀 있어요)
 *  계좌이체 · 가상계좌는 카드와 같은 PG 계약(채널)을 쓰는 경우가 많아요: PORTONE_TRANSFER=1 · PORTONE_VBANK=1 이면 카드 채널로,
 *  따로 받은 채널이 있으면 PORTONE_CHANNEL_TRANSFER · PORTONE_CHANNEL_VBANK 에 넣어요 */
function channel(method) {
  const e = process.env;
  if (method === "card") return e.PORTONE_CHANNEL_CARD || "";
  if (method === "kakao") return e.PORTONE_CHANNEL_KAKAOPAY || "";
  if (method === "toss") return e.PORTONE_CHANNEL_TOSSPAY || "";
  if (method === "naver") return e.PORTONE_CHANNEL_NAVERPAY || "";
  if (method === "transfer") return e.PORTONE_CHANNEL_TRANSFER || (e.PORTONE_TRANSFER === "1" ? e.PORTONE_CHANNEL_CARD || "" : "");
  if (method === "vbank") return e.PORTONE_CHANNEL_VBANK || (e.PORTONE_VBANK === "1" ? e.PORTONE_CHANNEL_CARD || "" : "");
  return "";
}
const PG_METHOD_KEYS = ["card", "kakao", "toss", "naver", "transfer", "vbank"];
/** 가상계좌 입금 기한 (시간) */
const vbankHours = () => Math.min(168, Math.max(1, Number(process.env.PORTONE_VBANK_HOURS) || 72));

module.exports = { on, getPayment, cancelPayment, closeVirtualAccount, verifyWebhook, channel, PG_METHOD_KEYS, vbankHours };
