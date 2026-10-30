/* GET /api/vod-config — 화면에 ‘무엇이 연결됐는지’만 알려 줘요 (비밀 값은 보내지 않아요)
 *  auth      VOD_SERVER_AUTH=1 이면 이메일 가입 · 로그인을 서버가 해요 (비밀번호는 서버에만 암호화 저장)
 *  kakao     카카오 키 3개(REST · Client Secret · Redirect URI)가 있으면 진짜 카카오 로그인
 *  portone   상점 ID · API Secret · 카드 채널 키가 있으면 진짜 포트원 결제창 (채널 키 · 상점 ID 는 공개 값)
 *            계좌이체 · 가상계좌는 PORTONE_TRANSFER=1 · PORTONE_VBANK=1 (카드 채널) 또는 따로 받은 채널 키가 있을 때만 열려요
 *  turnstile Turnstile 사이트 키 (비밀 키도 있을 때만)
 *  bankAuto  페이액션 키 3개가 있으면 무통장 입금을 24시간 자동 확인 (결제 화면 안내 문구가 바뀌어요) */
"use strict";
const { send, handler } = require("./_lib/http");
const kakao = require("./_lib/kakao");
const portone = require("./_lib/portone");
const payaction = require("./_lib/payaction");

module.exports = handler(["GET"], async (req, res) => {
  const e = process.env, auth = e.VOD_SERVER_AUTH === "1";
  const ch = {}; portone.PG_METHOD_KEYS.forEach((m) => { const k = portone.channel(m); if (k) ch[m] = k; });
  send(res, 200, { cfg: {
    auth,
    kakao: auth && kakao.on(),
    portone: auth && portone.on() && ch.card ? { storeId: e.PORTONE_STORE_ID, channels: ch, vbankHours: portone.vbankHours() } : null,
    turnstile: e.TURNSTILE_SITE_KEY && e.TURNSTILE_SECRET ? e.TURNSTILE_SITE_KEY : "",
    bankAuto: auth && payaction.auto()
  } });
});
