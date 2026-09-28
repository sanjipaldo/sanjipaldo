"use strict";
/* 구독 카드 환불·매출 보고 발송: 외부 API에 규격대로 요청하는지 가짜 fetch로 확인한다. */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { refundPayment, sendDailyReport, solapiAuth } = require("../src/ops");

function fakeFetch(reply = () => ({ status: 200, body: {} })) {
  const calls = [];
  const impl = async (url, init) => { calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null }); const out = reply(url, init); return { ok: out.status < 400, status: out.status, text: async () => JSON.stringify(out.body) }; };
  return { calls, impl };
}

test("구독 해지 환불: 토스페이먼츠 결제 부분 취소 요청", async () => {
  const f = fakeFetch(() => ({ status: 200, body: { status: "PARTIAL_CANCELED", cancels: [{ cancelAmount: 3300, canceledAt: "2026-09-28T10:00:00+09:00" }] } }));
  const out = await refundPayment({ paymentKey: "pay_abc", cancelAmount: 3300, cancelReason: "구독 해지", refundId: "BL-1" }, { env: { TOSS_SECRET_KEY: "test_sk" }, fetchImpl: f.impl });
  assert.equal(out.canceledAmount, 3300);
  assert.equal(f.calls[0].url, "https://api.tosspayments.com/v1/payments/pay_abc/cancel");
  assert.equal(f.calls[0].init.headers.Authorization, `Basic ${Buffer.from("test_sk:").toString("base64")}`);
  assert.equal(f.calls[0].init.headers["Idempotency-Key"], "BL-1");
  assert.deepEqual(f.calls[0].body, { cancelReason: "구독 해지", cancelAmount: 3300 });
});

test("구독 해지 환불: 키나 결제 번호가 없으면 요청하지 않는다", async () => {
  const f = fakeFetch();
  await assert.rejects(refundPayment({ paymentKey: "p", cancelAmount: 100 }, { env: {}, fetchImpl: f.impl }), /시크릿 키/);
  await assert.rejects(refundPayment({ paymentKey: "", cancelAmount: 100 }, { env: { TOSS_SECRET_KEY: "k" }, fetchImpl: f.impl }), /paymentKey/);
  await assert.rejects(refundPayment({ paymentKey: "p", cancelAmount: 0 }, { env: { TOSS_SECRET_KEY: "k" }, fetchImpl: f.impl }), /금액/);
  assert.equal(f.calls.length, 0);
});

test("솔라피 인증 헤더: HMAC-SHA256(date+salt)", () => {
  const now = new Date("2026-09-28T00:00:00.000Z");
  const header = solapiAuth("KEY", "SECRET", now, "salt123");
  const expected = crypto.createHmac("sha256", "SECRET").update("2026-09-28T00:00:00.000Zsalt123").digest("hex");
  assert.equal(header, `HMAC-SHA256 apiKey=KEY, date=2026-09-28T00:00:00.000Z, salt=salt123, signature=${expected}`);
});

test("매출 보고: 알림톡 템플릿 변수 + 이메일 동시 발송", async () => {
  const f = fakeFetch(url => ({ status: 200, body: url.includes("resend") ? { id: "em_1" } : { failedMessageList: [] } }));
  const env = { SOLAPI_API_KEY: "k", SOLAPI_API_SECRET: "s", SOLAPI_PFID: "KA01PF", SOLAPI_SENDER: "02-000-0000", SOLAPI_TEMPLATE_ID: "TPL1", RESEND_API_KEY: "re_1", REPORT_FROM_EMAIL: "report@doogo.kr" };
  const out = await sendDailyReport({ title: "[두고] 9월 27일 매출 보고", text: "순이익 7,595원", kakao: ["010-1111-2222", "010-1111-2222"], email: ["ceo@doogo.kr", "bad"] }, { env, fetchImpl: f.impl });
  assert.equal(out.ok, true);
  const kakao = f.calls.find(call => call.url.includes("solapi"));
  assert.equal(kakao.body.messages.length, 1);
  assert.equal(kakao.body.messages[0].to, "01011112222");
  assert.equal(kakao.body.messages[0].from, "020000000");
  assert.equal(kakao.body.messages[0].kakaoOptions.templateId, "TPL1");
  assert.equal(kakao.body.messages[0].kakaoOptions.variables["#{본문}"], "순이익 7,595원");
  assert.match(kakao.init.headers.Authorization, /^HMAC-SHA256 apiKey=k, date=/);
  const mail = f.calls.find(call => call.url.includes("resend"));
  assert.deepEqual(mail.body.to, ["ceo@doogo.kr"]);
  assert.equal(mail.body.subject, "[두고] 9월 27일 매출 보고");
});

test("매출 보고: 설정이 없는 채널은 실패로 알려 준다", async () => {
  const f = fakeFetch();
  const out = await sendDailyReport({ title: "t", text: "본문", kakao: ["01012345678"], email: ["a@b.kr"] }, { env: {}, fetchImpl: f.impl });
  assert.equal(out.ok, false);
  assert.deepEqual(out.results.map(item => item.channel), ["카카오톡", "이메일"]);
  assert.equal(f.calls.length, 0);
  await assert.rejects(sendDailyReport({ title: "t", text: "본문" }, { env: {}, fetchImpl: f.impl }), /받을/);
});

test("서버 경로: /api/reports/daily 는 토큰이 있어야 하고 결과를 돌려준다", async () => {
  const { createApp } = require("../src/server");
  const f = fakeFetch(() => ({ status: 200, body: { id: "em_2" } }));
  const { createCredentialStore } = require("../src/store");
  const store = createCredentialStore({ key: crypto.randomBytes(32).toString("hex"), file: require("node:path").join(require("node:os").tmpdir(), `doogo-ops-${Date.now()}.json`) });
  const app = createApp({ token: "t0k", store, opsOptions: { env: { RESEND_API_KEY: "re", REPORT_FROM_EMAIL: "r@doogo.kr" }, fetchImpl: f.impl } });
  const base = await new Promise(resolve => app.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${app.address().port}`)));
  try {
    const denied = await fetch(`${base}/api/reports/daily`, { method: "POST", body: "{}" });
    assert.equal(denied.status, 401);
    const res = await fetch(`${base}/api/reports/daily`, { method: "POST", headers: { Authorization: "Bearer t0k", "Content-Type": "application/json" }, body: JSON.stringify({ title: "보고", text: "본문", email: ["ceo@doogo.kr"] }) });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.results[0].channel, "이메일");
    assert.equal(data.results[0].ok, true);
  } finally { app.close(); }
});
