/* 로그인 — 서명한 토큰을 HttpOnly 쿠키에 담는다.
 *  dc_s: 수강생 { r:"student", sid, iid }
 *  dc_a: 강사센터 { r:"instructor"|"coach"|"master", iid, cid }
 * 요청마다 지금 데이터로 다시 확인한다 (중지된 강사·코치, 탈퇴한 수강생은 바로 막힘). */
"use strict";
const crypto = require("crypto");
const store = require("./store");

const COOKIE = { student: "dc_s", admin: "dc_a" };
const MAX_AGE = 30 * 24 * 3600;

const key = () => crypto.createHash("sha256").update("doogo-class-session:" + (process.env.SESSION_SECRET || process.env.TURSO_AUTH_TOKEN || "local-dev-secret")).digest();
const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");

function sign(payload) {
  const body = b64u(JSON.stringify(Object.assign({}, payload, { exp: Date.now() + MAX_AGE * 1000 })));
  return body + "." + b64u(crypto.createHmac("sha256", key()).update(body).digest());
}
function verify(token) {
  if (!token || token.indexOf(".") < 0) return null;
  const [body, sig] = token.split(".");
  const want = crypto.createHmac("sha256", key()).update(body).digest();
  const got = unb64u(sig);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try { const p = JSON.parse(unb64u(body).toString("utf8")); return p.exp > Date.now() ? p : null; } catch (e) { return null; }
}
function cookies(req) {
  const out = {};
  String(req.headers.cookie || "").split(";").forEach((c) => { const i = c.indexOf("="); if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); });
  return out;
}
const secure = (req) => !/^(localhost|127\.0\.0\.1)(:|$)/.test(String(req.headers.host || ""));
function setCookie(req, res, which, value) {
  const parts = [COOKIE[which] + "=" + (value ? encodeURIComponent(value) : ""), "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=" + (value ? MAX_AGE : 0)];
  if (secure(req)) parts.push("Secure");
  const prev = res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", [].concat(prev || [], parts.join("; ")));
}

const norm = (s) => String(s || "").replace(/\s+/g, "");

/** 쿠키 → 지금 유효한 신원 { student, admin } (없으면 null) */
async function identify(req) {
  const c = cookies(req);
  const ps = verify(c[COOKIE.student]), pa = verify(c[COOKIE.admin]);
  const ids = { student: null, admin: null };
  const keys = [];
  if (ps && ps.r === "student") keys.push("ins:" + ps.iid, "stu:" + ps.iid + ":" + ps.sid);
  if (pa && pa.r !== "master") keys.push("ins:" + pa.iid);
  const docs = keys.length ? await store.getDocs(keys) : {};
  const ins = (iid) => (docs["ins:" + iid] || {}).v;
  if (ps && ps.r === "student") {
    const i = ins(ps.iid), s = (docs["stu:" + ps.iid + ":" + ps.sid] || {}).v;
    if (i && i.status === "active" && s && s.status === "approved") ids.student = { sid: ps.sid, iid: ps.iid };
  }
  if (pa) {
    if (pa.r === "master") ids.admin = { role: "master" };
    else {
      const i = ins(pa.iid);
      if (i && i.status === "active") {
        if (pa.r === "instructor") ids.admin = { role: "instructor", iid: pa.iid };
        else if (pa.r === "coach") {
          const co = (i.coaches || []).find((x) => x.id === pa.cid);
          if (co && co.status === "active") ids.admin = { role: "coach", iid: pa.iid, cid: pa.cid, perms: co.perms || [] };
        }
      }
    }
  }
  return ids;
}
const publicMe = (ids) => ({
  student: ids.student ? { sid: ids.student.sid, iid: ids.student.iid } : null,
  admin: ids.admin ? { role: ids.admin.role, iid: ids.admin.iid || null, cid: ids.admin.cid || null } : null
});

module.exports = { sign, verify, identify, setCookie, publicMe, norm };
