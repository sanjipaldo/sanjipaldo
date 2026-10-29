/* /api/vod-kakao — 카카오가 돌아오는 주소 (Kakao Developers 의 리다이렉트 URI 와 연결 끊기 웹훅 둘 다 여기)
 *  GET ?code=…&state=…          로그인 · 가입 마치기 → /?vodlogin=ok#/vod… 로 돌아가요
 *  GET ?error=access_denied     동의 취소 → /?vodlogin=deny
 *  GET|POST ?user_id=…&referrer_type=…  (Authorization: KakaoAK <Admin 키>)  사용자가 카카오 쪽에서 연결을 끊었을 때 */
"use strict";
const { send, body, query, handler } = require("./_lib/http");
const auth = require("./_lib/auth");
const edge = require("./_lib/edge");
const kakao = require("./_lib/kakao");
const V = require("./_lib/vod");

const back = (res, st, next) => { res.statusCode = 302; res.setHeader("Location", "/?vodlogin=" + st + (next || "#/vod/login")); res.end(); };

async function unlinkHook(req, res) {
  const want = process.env.KAKAO_ADMIN_KEY ? "KakaoAK " + process.env.KAKAO_ADMIN_KEY : "";
  if (!want || !edge.eq(req.headers.authorization, want)) return send(res, 401, { ok: false });
  const q = Object.assign({}, query(req), req.method === "POST" ? await body(req).catch(() => ({})) : {});
  const kid = String(q.user_id || ""), idx = kid ? await V.get(V.K.kakao(kid)) : null;
  if (idx) {
    await V.update(V.K.member(idx.id), (m) => m && Object.assign(m, { kakaoId: "", kakaoUnlinkedAt: Date.now(), kakaoUnlinkWhy: String(q.referrer_type || "") }));
    await V.update(V.K.kakao(kid), () => null);
  }
  send(res, 200, { ok: true });
}

module.exports = handler(["GET", "POST"], async (req, res) => {
  const q = query(req);
  if (q.user_id || q.referrer_type || req.headers.authorization) return unlinkHook(req, res);
  if (!kakao.on() || process.env.VOD_SERVER_AUTH !== "1") return back(res, "fail");
  const ck = auth.verify(V.cookies(req).dc_ks);
  V.setCookie(req, res, "dc_ks", "");
  if (!ck || ck.r !== "kakao-state" || !(ck.until > Date.now()) || !q.state || !edge.eq(q.state, ck.st)) return back(res, "fail");
  if (q.error) return back(res, q.error === "access_denied" ? "deny" : "fail");
  try {
    const tk = await kakao.token(String(q.code || "")), at = tk.access_token;
    const pf = kakao.profileOf(await kakao.me(at)), terms = await kakao.terms(at), chAdded = await kakao.channelAdded(at);
    const tag = process.env.KAKAO_MKT_TAG || "marketing", mt = terms ? terms.find((t) => t.tag === tag) : null, mkt = !!(mt && (mt.agreed === true || mt.agreed_at));
    const known = await V.get(V.K.kakao(pf.kakaoId));
    // 1) 이메일 회원에 카카오 연결 (마이페이지에서 ‘카카오 연결’)
    if (ck.link && !known) {
      if (!(await V.create(V.K.kakao(pf.kakaoId), { id: ck.link }))) return back(res, "fail");
      await V.update(V.K.member(ck.link), (m) => m && Object.assign(m, { kakaoId: pf.kakaoId, kakaoCh: chAdded == null ? m.kakaoCh : chAdded, kakaoLinkedAt: Date.now() }));
      V.login(req, res, ck.link); return back(res, "ok", ck.next || "#/vod/my/account");
    }
    // 2) 이미 카카오로 가입한 회원 → 로그인
    if (known) {
      const m = await V.update(V.K.member(known.id), (cur) => cur && Object.assign(cur, { lastLoginAt: Date.now(), loginN: (cur.loginN || 0) + 1, kakaoCh: chAdded == null ? cur.kakaoCh : chAdded }));
      if (!m || m.blocked || m.withdrawnAt) return back(res, "blocked");
      V.login(req, res, m.id); return back(res, "ok", ck.next);
    }
    // 3) 같은 이메일로 이메일 가입한 회원이 있으면 자동으로 합치지 않아요 (그 계정으로 로그인 → 카카오 연결)
    if (pf.email && (await V.get(V.K.email(pf.email)))) return back(res, "dup");
    // 4) 새로 가입 (카카오싱크 동의 = 가입)
    const m = await V.newMember({ via: "kakao", kakaoId: pf.kakaoId, email: pf.email, emailVerified: pf.emailVerified, name: pf.name, phone: pf.phone, birth: pf.birth, gender: pf.gender, age: pf.age, kakaoCh: !!chAdded, marketing: mkt, loginN: 1, lastLoginAt: Date.now() }, "카카오 가입");
    if (!(await V.create(V.K.kakao(pf.kakaoId), { id: m.id }))) { await V.update(V.K.member(m.id), () => null); const again = await V.get(V.K.kakao(pf.kakaoId)); if (again) { V.login(req, res, again.id); return back(res, "ok", ck.next); } return back(res, "fail"); }
    if (pf.email) await V.create(V.K.email(pf.email), { id: m.id });
    V.login(req, res, m.id); return back(res, "ok", ck.next);
  } catch (e) {
    console.error("[vod-kakao]", e.status || "", e.message);
    return back(res, "fail");
  }
});
