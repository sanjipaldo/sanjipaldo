"use strict";
/* 두고 본사 운영 기능: 구독 카드 환불 · 일일 매출 보고 발송
   ┌──────────────┬───────────────────────────────────────────────────────────────┐
   │ 구독 해지 환불 │ 토스페이먼츠 결제 취소 POST /v1/payments/{paymentKey}/cancel (부분 취소) │
   │ 매출 보고 카톡 │ 솔라피 알림톡 POST /messages/v4/send-many/detail (HMAC-SHA256 인증)      │
   │ 매출 보고 메일 │ Resend POST /emails                                              │
   └──────────────┴───────────────────────────────────────────────────────────────┘
   키는 모두 서버 환경변수에만 둔다. 브라우저에는 결과만 돌려준다. */
const crypto = require("node:crypto");

const TOSS_BASE = "https://api.tosspayments.com";
const SOLAPI_BASE = "https://api.solapi.com";
const RESEND_BASE = "https://api.resend.com";

async function readBody(res) { const text = await res.text(); try { return text ? JSON.parse(text) : {}; } catch { return { raw: text }; } }

/* 구독 해지 일할 환불: 결제 때 받은 paymentKey로 남은 금액만 부분 취소한다 */
async function refundPayment({ paymentKey, cancelAmount, cancelReason, refundId }, { env = process.env, fetchImpl = fetch, base = TOSS_BASE } = {}) {
  if (!env.TOSS_SECRET_KEY) throw Object.assign(new Error("결제대행(토스페이먼츠) 시크릿 키가 서버에 없어요."), { status: 503 });
  if (!paymentKey) throw Object.assign(new Error("결제 번호(paymentKey)가 없어 카드 취소를 할 수 없어요. PG 관리자 화면에서 취소해 주세요."), { status: 400 });
  const amount = Math.floor(Number(cancelAmount));
  if (!(amount > 0)) throw Object.assign(new Error("환불 금액이 올바르지 않아요."), { status: 400 });
  const res = await fetchImpl(`${base}/v1/payments/${encodeURIComponent(paymentKey)}/cancel`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${env.TOSS_SECRET_KEY}:`).toString("base64")}`, "Content-Type": "application/json", ...(refundId ? { "Idempotency-Key": String(refundId) } : {}) },
    body: JSON.stringify({ cancelReason: String(cancelReason || "구독 해지 일할 환불").slice(0, 200), cancelAmount: amount })
  });
  const data = await readBody(res);
  if (!res.ok) throw Object.assign(new Error(data.message || `카드 취소 실패 (${res.status})`), { status: 502 });
  const cancel = (data.cancels || []).at(-1) || {};
  return { ok: true, status: data.status, canceledAmount: cancel.cancelAmount ?? amount, canceledAt: cancel.canceledAt || "" };
}

function solapiAuth(apiKey, apiSecret, now = new Date(), salt = crypto.randomBytes(16).toString("hex")) {
  const date = now.toISOString();
  const signature = crypto.createHmac("sha256", apiSecret).update(date + salt).digest("hex");
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

const digits = value => String(value || "").replace(/\D/g, "");

/* 매출 보고: 카카오 알림톡(승인된 템플릿) + 이메일. 채널마다 성공/실패를 따로 돌려준다. */
async function sendDailyReport({ title, text, kakao = [], email = [] }, { env = process.env, fetchImpl = fetch, now = new Date(), bases = {} } = {}) {
  const results = [];
  const phones = [...new Set(kakao.map(digits).filter(phone => phone.length >= 10))].slice(0, 20);
  const emails = [...new Set(email.map(value => String(value || "").trim()).filter(value => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)))].slice(0, 20);
  if (!String(text || "").trim()) throw Object.assign(new Error("보낼 내용이 없어요."), { status: 400 });

  if (phones.length) {
    if (!env.SOLAPI_API_KEY || !env.SOLAPI_API_SECRET || !env.SOLAPI_PFID || !env.SOLAPI_SENDER) results.push({ channel: "카카오톡", ok: false, error: "알림톡 발신 프로필이 서버에 설정되지 않았어요" });
    else {
      const messages = phones.map(to => ({
        to, from: digits(env.SOLAPI_SENDER),
        kakaoOptions: { pfId: env.SOLAPI_PFID, ...(env.SOLAPI_TEMPLATE_ID ? { templateId: env.SOLAPI_TEMPLATE_ID, variables: { "#{제목}": String(title || ""), "#{본문}": String(text) } } : {}), disableSms: false },
        ...(env.SOLAPI_TEMPLATE_ID ? {} : { text: String(text) })
      }));
      try {
        const res = await fetchImpl(`${bases.solapi || SOLAPI_BASE}/messages/v4/send-many/detail`, { method: "POST", headers: { Authorization: solapiAuth(env.SOLAPI_API_KEY, env.SOLAPI_API_SECRET, now), "Content-Type": "application/json" }, body: JSON.stringify({ messages }) });
        const data = await readBody(res);
        const failed = (data.failedMessageList || []).length;
        results.push(res.ok ? { channel: "카카오톡", ok: failed === 0, sent: phones.length - failed, error: failed ? `${failed}건 실패` : undefined } : { channel: "카카오톡", ok: false, error: data.errorMessage || `발송 실패 (${res.status})` });
      } catch (error) { results.push({ channel: "카카오톡", ok: false, error: error.message }); }
    }
  }

  if (emails.length) {
    if (!env.RESEND_API_KEY || !env.REPORT_FROM_EMAIL) results.push({ channel: "이메일", ok: false, error: "이메일 발송 키가 서버에 설정되지 않았어요" });
    else {
      try {
        const res = await fetchImpl(`${bases.resend || RESEND_BASE}/emails`, { method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: env.REPORT_FROM_EMAIL, to: emails, subject: String(title || "두고 매출 보고"), text: String(text) }) });
        const data = await readBody(res);
        results.push(res.ok ? { channel: "이메일", ok: true, sent: emails.length, id: data.id } : { channel: "이메일", ok: false, error: data.message || `발송 실패 (${res.status})` });
      } catch (error) { results.push({ channel: "이메일", ok: false, error: error.message }); }
    }
  }
  if (!results.length) throw Object.assign(new Error("받을 카카오톡 번호나 이메일이 없어요."), { status: 400 });
  return { ok: results.every(item => item.ok), results };
}

module.exports = { refundPayment, sendDailyReport, solapiAuth };
