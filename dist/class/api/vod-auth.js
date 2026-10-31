/* /api/vod-auth — 두고클래스 회원 로그인
 *  GET  ?action=kakao&next=#/vod…(&link=1)   카카오 동의 화면으로 (link=1: 로그인한 이메일 회원에 카카오 연결)
 *  POST { action: "signup", email, pw, pw2, name, phone, agree, mkt, src, ts }
 *  POST { action: "login", email, pw, ts }
 *  POST { action: "me" } · { action: "logout" } · { action: "withdraw", pw? } · { action: "pw", pw0, pw1 } (비밀번호 바꾸기)
 * 15분 안에 여러 번 틀리면 잠시 막아요 (IP · 이메일). Turnstile 비밀 키가 있으면 사람 확인 토큰(ts)도 확인해요. */
"use strict";
const crypto = require("crypto");
const { send, body, query, handler } = require("./_lib/http");
const store = require("./_lib/store");
const auth = require("./_lib/auth");
const edge = require("./_lib/edge");
const kakao = require("./_lib/kakao");
const V = require("./_lib/vod");

const on = () => process.env.VOD_SERVER_AUTH === "1";
const pwOk = (s) => typeof s === "string" && s.length >= 8 && s.length <= 64 && /[A-Za-z]/.test(s) && /\d/.test(s);
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const PHONE = /^01[016789]-?\d{3,4}-?\d{4}$/;

async function signup(req, res, b, ip) {
  const email = String(b.email || "").trim().toLowerCase(), name = String(b.name || "").trim().slice(0, 20), phone = String(b.phone || "").replace(/\s/g, "");
  if (await store.rlCheck(["vip:" + ip], 20)) return send(res, 429, { ok: false, message: "잠시 후 다시 시도해 주세요." });
  if (!(await edge.turnstileOk(b.ts, ip))) return send(res, 400, { ok: false, message: "사람 확인을 다시 해 주세요." });
  if (!EMAIL.test(email)) return send(res, 400, { ok: false, message: "이메일 형식이 올바르지 않아요. 다시 확인해 주세요." });
  if (!name) return send(res, 400, { ok: false, message: "이름을 적어 주세요." });
  if (!PHONE.test(phone)) return send(res, 400, { ok: false, message: "휴대폰 번호를 010-0000-0000 형식으로 적어 주세요." });
  if (!pwOk(b.pw)) return send(res, 400, { ok: false, message: "비밀번호는 영문과 숫자를 섞어 8자 이상으로 정해 주세요." });
  if (b.pw2 != null && b.pw !== b.pw2) return send(res, 400, { ok: false, message: "비밀번호 확인이 맞지 않아요." });
  if (!b.agree) return send(res, 400, { ok: false, message: "필수 약관에 동의해 주세요." });
  if (await V.get(V.K.email(email))) { await store.rlFail(["vip:" + ip]); return send(res, 409, { ok: false, message: "이미 가입한 이메일이에요. 로그인해 주세요." }); }
  const src = b.src && typeof b.src === "object" ? { s: String(b.src.s || "direct").slice(0, 30), c: String(b.src.c || "").slice(0, 40), by: String(b.src.by || "").slice(0, 40), at: Number(b.src.at) || Date.now() } : { s: "direct", at: Date.now() };
  const m = await V.newMember({ via: "email", email, name, phone, pwHash: V.hashPw(b.pw), marketing: !!b.mkt, src, loginN: 1, lastLoginAt: Date.now() }, "가입");
  if (!(await V.create(V.K.email(email), { id: m.id }))) { await V.update(V.K.member(m.id), () => null); return send(res, 409, { ok: false, message: "이미 가입한 이메일이에요. 로그인해 주세요." }); }
  V.login(req, res, m.id);
  send(res, 200, { ok: true, member: V.pub(m) });
}
/** 체험 계정(vod@gmail.com): 마스터가 VOD 설정에서 끄면 로그인 막기 */
async function demoOff() { const r = await store.getDoc("meta"); return ((((r && r.v) || {}).vod || {}).settings || {}).demoLogin === false; }
async function login(req, res, b, ip) {
  const email = String(b.email || "").trim().toLowerCase(), keys = ["vip:" + ip, "vem:" + email];
  if ((await store.rlCheck(["vip:" + ip], 40)) || (await store.rlCheck(["vem:" + email], 8))) return send(res, 429, { ok: false, message: "여러 번 틀려서 15분 동안 잠시 막았어요. 잠시 후 다시 시도해 주세요." });
  if (!(await edge.turnstileOk(b.ts, ip))) return send(res, 400, { ok: false, message: "사람 확인을 다시 해 주세요." });
  const idx = EMAIL.test(email) ? await V.get(V.K.email(email)) : null, m = idx ? await V.get(V.K.member(idx.id)) : null;
  if (!m || !m.pwHash || !V.checkPw(String(b.pw || ""), m.pwHash)) { await store.rlFail(keys); return send(res, 401, { ok: false, message: m && !m.pwHash && m.via === "kakao" ? "카카오로 가입한 계정이에요. ‘카카오로 1초 만에 시작하기’로 로그인해 주세요." : "이메일 또는 비밀번호가 맞지 않아요. 다시 확인해 주세요." }); }
  if (m.blocked || m.withdrawnAt) return send(res, 403, { ok: false, message: "이용이 중지된 계정이에요. 고객센터로 문의해 주세요." });
  if (m.demo && (await demoOff())) return send(res, 403, { ok: false, message: "체험 계정은 지금 쉬고 있어요. 이메일로 회원가입해 주세요." });
  await store.rlClear(["vem:" + email]);
  const next = await V.update(V.K.member(m.id), (cur) => cur && Object.assign(cur, { lastLoginAt: Date.now(), loginN: (cur.loginN || 0) + 1 }));
  V.login(req, res, m.id);
  send(res, 200, { ok: true, member: V.pub(next || m) });
}
async function changePw(req, res, b) {
  const m = await V.current(req); if (!m) return send(res, 401, { ok: false, message: "로그인이 필요해요." });
  if (!m.pwHash) return send(res, 400, { ok: false, message: "카카오로 가입한 계정은 비밀번호가 없어요." });
  if (m.demo) return send(res, 403, { ok: false, message: "체험 계정은 비밀번호를 바꿀 수 없어요." });
  if (await store.rlCheck(["vpw:" + m.id], 8)) return send(res, 429, { ok: false, message: "여러 번 틀려서 15분 동안 잠시 막았어요." });
  if (!V.checkPw(String(b.pw0 || ""), m.pwHash)) { await store.rlFail(["vpw:" + m.id]); return send(res, 401, { ok: false, message: "지금 비밀번호가 맞지 않아요." }); }
  if (!pwOk(b.pw1)) return send(res, 400, { ok: false, message: "새 비밀번호는 영문과 숫자를 섞어 8자 이상으로 정해 주세요." });
  await V.update(V.K.member(m.id), (cur) => cur && Object.assign(cur, { pwHash: V.hashPw(b.pw1), pwAt: Date.now() }));
  await store.rlClear(["vpw:" + m.id]);
  send(res, 200, { ok: true });
}
async function withdraw(req, res, b) {
  const m = await V.current(req); if (!m) return send(res, 401, { ok: false, message: "로그인이 필요해요." });
  if (m.demo) return send(res, 403, { ok: false, message: "체험 계정은 탈퇴할 수 없어요." });
  if (m.pwHash && !V.checkPw(String(b.pw || ""), m.pwHash)) return send(res, 401, { ok: false, message: "비밀번호가 맞지 않아요." });
  if (m.kakaoId && process.env.KAKAO_ADMIN_KEY) { try { await kakao.unlink(m.kakaoId); } catch (e) { console.error("[vod-auth] kakao unlink", e.message); } }
  // 결제 · 환불 기록은 전자상거래법에 따라 5년 보관 — 회원 정보만 지우고 주문의 회원번호는 남겨요
  await V.update(V.K.member(m.id), (cur) => cur && { id: cur.id, via: cur.via, name: "탈퇴 회원", email: "", phone: "", withdrawnAt: Date.now(), createdAt: cur.createdAt, points: 0, coupons: [] });
  if (m.email) await V.update(V.K.email(m.email), () => null);
  if (m.kakaoId) await V.update(V.K.kakao(m.kakaoId), () => null);
  V.logout(req, res);
  send(res, 200, { ok: true });
}

module.exports = handler(["GET", "POST"], async (req, res) => {
  if (!edge.originOk(req)) return send(res, 403, { ok: false, message: "forbidden" });
  if (!on()) return send(res, 404, { ok: false, message: "서버 로그인이 아직 꺼져 있어요." });
  const ip = edge.clientIp(req);
  if (req.method === "GET") {
    const q = query(req);
    if (q.action !== "kakao" || !kakao.on()) { res.statusCode = 302; res.setHeader("Location", "/?vodlogin=fail#/vod/login"); return res.end(); }
    // state 쿠키는 누른 주소에만 붙어요 — 카카오가 돌아오는 주소(www)가 아닌 곳(doinggo. · vercel.app · www 없는 주소)에서 눌렀으면 그 주소로 먼저 옮겨요
    const home = kakao.home(), here = String(req.headers.host || "").toLowerCase();
    if (home && here && here !== home && !/^(localhost|127\.0\.0\.1)(:|$)/.test(here)) { res.statusCode = 302; res.setHeader("Location", "https://" + home + "/api/vod-auth?" + new URLSearchParams(q).toString()); return res.end(); }
    const st = crypto.randomBytes(16).toString("hex"), cur = q.link === "1" ? await V.current(req) : null;
    const next = /^#\/vod[\w\-/?=&%.]*$/.test(String(q.next || "")) ? String(q.next) : "#/vod";
    // 카카오 다녀오기는 10분 안에 (쿠키도 토큰도 10분)
    V.setCookie(req, res, "dc_ks", auth.sign({ r: "kakao-state", st, next, link: cur ? cur.id : "", until: Date.now() + 600e3 }), 600);
    res.statusCode = 302; res.setHeader("Location", kakao.authorizeUrl(st)); return res.end();
  }
  const b = await body(req), a = String(b.action || "");
  if (a === "signup") return signup(req, res, b, ip);
  if (a === "login") return login(req, res, b, ip);
  if (a === "logout") { V.logout(req, res); return send(res, 200, { ok: true }); }
  if (a === "withdraw") return withdraw(req, res, b);
  if (a === "pw") return changePw(req, res, b);
  if (a === "me") { const m = await V.current(req); return send(res, 200, { ok: !!m, member: m ? V.pub(m) : null }); }
  send(res, 400, { ok: false, message: "action" });
});
