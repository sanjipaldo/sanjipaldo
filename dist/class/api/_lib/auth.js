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
  const ps = verify(c[COOKIE.student]), pa = verify(c[COOKIE.admin]), pv = verify(c.dc_v);
  const ids = { student: null, admin: null, vod: null, partner: null };
  const keys = [];
  if (ps && ps.r === "student") keys.push("ins:" + ps.iid, "stu:" + ps.iid + ":" + ps.sid);
  if (pa && (pa.r === "instructor" || pa.r === "coach")) keys.push("ins:" + pa.iid);
  // 파트너 · 운영자 계정은 meta(affiliates · staff)에 있어요 — 멈춘 계정이면 바로 막혀요
  if (pa && (pa.r === "partner" || (pa.r === "master" && pa.staffId))) keys.push("meta");
  const docs = keys.length ? await store.getDocs(keys) : {};
  const ins = (iid) => (docs["ins:" + iid] || {}).v;
  if (ps && ps.r === "student") {
    const i = ins(ps.iid), s = (docs["stu:" + ps.iid + ":" + ps.sid] || {}).v;
    if (i && i.status === "active" && s && s.status === "approved") ids.student = { sid: ps.sid, iid: ps.iid, vodMid: s.vodMid || "" };
  }
  // 두고클래스 회원 (dc_v) — 없으면 두잉고 강의실에 들어온 VOD 구매자(수강생 계정에 vodMid)로
  const vmid = pv && pv.r === "vod" && pv.mid ? pv.mid : ids.student && ids.student.vodMid ? ids.student.vodMid : "";
  if (vmid) ids.vod = await require("./vodaccess").identity(vmid);
  const meta = (docs.meta || {}).v || {};
  if (pa) {
    if (pa.r === "master" && !pa.staffId) ids.admin = { role: "master" };
    else if (pa.r === "master") { const st = (meta.staff || []).find((x) => x && x.id === pa.staffId); if (st && st.status === "active") ids.admin = { role: "master", staffId: st.id }; }
    else if (pa.r === "partner") { const pt = (meta.affiliates || []).find((x) => x && x.id === pa.pid); if (pt && pt.status === "active") ids.partner = { pid: pt.id, iids: (pt.instructors || []).map((x) => x && x.iid).filter(Boolean) }; }
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
  admin: ids.admin ? { role: ids.admin.role, iid: ids.admin.iid || null, cid: ids.admin.cid || null, staffId: ids.admin.staffId || null } : ids.partner ? { role: "partner", pid: ids.partner.pid } : null,
  vod: ids.vod ? { mid: ids.vod.mid } : null
});

module.exports = { sign, verify, identify, setCookie, publicMe, norm };
