/* 카카오 로그인 · 카카오싱크 — 서버에서만 (Client Secret · Admin 키는 화면으로 보내지 않아요)
 *
 *  KAKAO_REST_KEY       Kakao Developers › 앱 › 플랫폼 키 › REST API 키
 *  KAKAO_CLIENT_SECRET  같은 화면의 Client Secret (비밀)
 *  KAKAO_REDIRECT_URI   https://www.doogoclass.com/api/vod-kakao  (콘솔 ‘리다이렉트 URI’에도 똑같이 등록)
 *  KAKAO_ADMIN_KEY      앱 › 플랫폼 키 › Admin 키 — 연결 끊기 알림(웹훅) 확인 · 탈퇴 때 연결 끊기 (비밀)
 *  KAKAO_MKT_TAG        카카오싱크 약관 중 ‘광고성 정보 수신’ 약관의 태그 (기본 marketing)
 * 공식 문서: https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api */
"use strict";
const AUTH = "https://kauth.kakao.com", API = "https://kapi.kakao.com";
const env = (k) => process.env[k] || "";
const on = () => !!(env("KAKAO_REST_KEY") && env("KAKAO_CLIENT_SECRET") && env("KAKAO_REDIRECT_URI"));

function authorizeUrl(state) {
  const q = new URLSearchParams({ client_id: env("KAKAO_REST_KEY"), redirect_uri: env("KAKAO_REDIRECT_URI"), response_type: "code", state });
  return AUTH + "/oauth/authorize?" + q.toString();
}
async function form(url, data, headers) {
  const r = await fetch(url, { method: "POST", headers: Object.assign({ "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" }, headers || {}), body: new URLSearchParams(data).toString() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error_description || j.msg || "kakao " + r.status); e.status = r.status; e.body = j; throw e; }
  return j;
}
async function getJson(url, token) {
  const r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.msg || "kakao " + r.status); e.status = r.status; e.body = j; throw e; }
  return j;
}
/** 인가 코드 → 토큰 */
const token = (code) => form(AUTH + "/oauth/token", { grant_type: "authorization_code", client_id: env("KAKAO_REST_KEY"), redirect_uri: env("KAKAO_REDIRECT_URI"), code, client_secret: env("KAKAO_CLIENT_SECRET") });
const me = (at) => getJson(API + "/v2/user/me", at);
/** 카카오싱크 약관 동의 내역 (광고성 정보 수신 약관을 동의했는지) — 없거나 실패하면 null */
async function terms(at) { try { const j = await getJson(API + "/v2/user/service_terms", at); return j.service_terms || j.allowed_service_terms || []; } catch (e) { return null; } }
/** 카카오톡 채널 친구인지 (동의항목 ‘카카오톡 채널 추가 상태 및 내역’이 필요) — 모르면 null */
async function channelAdded(at) { try { const j = await getJson(API + "/v2/api/talk/channels", at); return (j.channels || []).some((c) => c.relation === "ADDED"); } catch (e) { return null; } }
/** 우리 쪽에서 탈퇴하면 카카오 연결도 끊어요 */
const unlink = (kakaoId) => form(API + "/v1/user/unlink", { target_id_type: "user_id", target_id: String(kakaoId) }, { Authorization: "KakaoAK " + env("KAKAO_ADMIN_KEY") });

const localPhone = (p) => { const s = String(p || "").replace(/^\+82\s*/, "0").replace(/\s+/g, ""); return /^01[016789]-?\d{3,4}-?\d{4}$/.test(s) ? s : ""; };
/** 사용자 정보 → 회원 DB 에 쓸 모양 */
function profileOf(j) {
  const ka = (j && j.kakao_account) || {}, pf = ka.profile || {}, bd = ka.birthday || "";
  return {
    kakaoId: String(j.id),
    email: ka.email && ka.is_email_valid !== false ? String(ka.email).toLowerCase() : "",
    emailVerified: !!(ka.email && ka.is_email_verified && ka.is_email_valid !== false),
    name: ka.name || pf.nickname || "",
    phone: localPhone(ka.phone_number),
    birth: /^\d{4}$/.test(bd) ? bd.slice(0, 2) + "-" + bd.slice(2) : "",
    gender: ka.gender || "",
    age: ka.age_range ? String(ka.age_range).replace("~", "~") : ""
  };
}

module.exports = { on, authorizeUrl, token, me, terms, channelAdded, unlink, profileOf, localPhone };
