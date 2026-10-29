/* Cloudflare 앞단 대비 — 진짜 방문자 IP · 원본 직접 접속 막기 · Turnstile(사람 확인)
 *
 *  CF_ORIGIN_SECRET  Cloudflare › Rules › Transform Rules(요청 헤더)에서 모든 요청에 X-Origin-Auth: <이 값> 을 붙이게 하고 같은 값을 Vercel 에도 넣어요.
 *                    넣으면 Cloudflare 를 거치지 않은 요청(…vercel.app 주소로 바로 오는 요청)은 API 에서 막고, 방문자 IP 는 CF-Connecting-IP 를 믿어요.
 *  TURNSTILE_SECRET  Cloudflare › Turnstile 의 비밀 키. 넣으면 가입 · 로그인 때 사람 확인 토큰을 서버가 다시 확인해요 (사이트 키는 TURNSTILE_SITE_KEY). */
"use strict";
const crypto = require("crypto");

const eq = (a, b) => { const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || "")); return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y); };
// 내 컴퓨터 개발 서버만 예외 (Vercel 위에서는 Host 헤더를 믿지 않아요)
const local = (req) => !process.env.VERCEL && /^(localhost|127\.0\.0\.1)(:|$)/.test(String(req.headers.host || ""));
const viaCf = (req) => !!process.env.CF_ORIGIN_SECRET && eq(req.headers["x-origin-auth"], process.env.CF_ORIGIN_SECRET);

function clientIp(req) {
  if (viaCf(req) && req.headers["cf-connecting-ip"]) return String(req.headers["cf-connecting-ip"]).trim();
  return String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || (req.socket && req.socket.remoteAddress) || "").split(",")[0].trim();
}
/** CF_ORIGIN_SECRET 을 넣었으면 Cloudflare 를 거친 요청만 받아요 (내 컴퓨터 개발 서버는 예외) */
const originOk = (req) => !process.env.CF_ORIGIN_SECRET || viaCf(req) || local(req);

async function turnstileOk(token, ip) {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return true;
  if (!token) return false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ secret, response: String(token), remoteip: ip || "" }).toString() });
    const j = await r.json();
    return !!(j && j.success);
  } catch (e) { return false; }
}

module.exports = { clientIp, originOk, turnstileOk, viaCf, eq };
