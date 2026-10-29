/* GET /api/vod-config — 화면에 ‘무엇이 연결됐는지’만 알려 줘요 (비밀 값은 보내지 않아요)
 *  auth      VOD_SERVER_AUTH=1 이면 이메일 가입 · 로그인을 서버가 해요 (비밀번호는 서버에만 암호화 저장)
 *  kakao     카카오 키 3개(REST · Client Secret · Redirect URI)가 있으면 진짜 카카오 로그인
 *  portone   상점 ID · API Secret · 카드 채널 키가 있으면 진짜 포트원 결제창 (채널 키 · 상점 ID 는 공개 값)
 *  turnstile Turnstile 사이트 키 (비밀 키도 있을 때만) */
"use strict";
const { send, handler } = require("./_lib/http");
const kakao = require("./_lib/kakao");
const portone = require("./_lib/portone");

module.exports = handler(["GET"], async (req, res) => {
  const e = process.env, auth = e.VOD_SERVER_AUTH === "1";
  const ch = {}; [["card", "PORTONE_CHANNEL_CARD"], ["kakao", "PORTONE_CHANNEL_KAKAOPAY"], ["toss", "PORTONE_CHANNEL_TOSSPAY"], ["naver", "PORTONE_CHANNEL_NAVERPAY"]].forEach((x) => { if (e[x[1]]) ch[x[0]] = e[x[1]]; });
  send(res, 200, { cfg: {
    auth,
    kakao: auth && kakao.on(),
    portone: auth && portone.on() && ch.card ? { storeId: e.PORTONE_STORE_ID, channels: ch } : null,
    turnstile: e.TURNSTILE_SITE_KEY && e.TURNSTILE_SECRET ? e.TURNSTILE_SITE_KEY : ""
  } });
});
