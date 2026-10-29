/* CRM 메시지 실제 발송 — 문자 · 카카오 알림톡 · 카카오 브랜드 메시지는 솔라피(SOLAPI), 이메일은 Resend
 *
 *  SOLAPI_API_KEY · SOLAPI_API_SECRET  솔라피 콘솔 › 개발/연동 › API Key (비밀)
 *  SOLAPI_SENDER                        솔라피에 등록 · 인증한 발신번호 (예: 0212345678)
 *  SOLAPI_PFID                          솔라피에 연동한 카카오톡 채널의 pfId (알림톡 · 브랜드 메시지)
 *  RESEND_API_KEY                       Resend › API Keys (비밀)
 *  MAIL_FROM                            보내는 사람 (예: 두고클래스 <hello@doogoclass.com> · Resend 에서 도메인 인증 필요)
 *
 * 받는 사람 고르기 · 광고 규칙은 서버가 다시 확인해요(화면 값을 믿지 않음):
 *  - 광고(브랜드 메시지 · 문자 · 이메일 광고): 소식 받기 동의 + 그 채널 동의 회원만 · 맨 앞 (광고) · 끝에 수신 거부 방법
 *  - 문자 광고 밤 9시~아침 8시는 야간 수신 동의 회원만 · 브랜드 메시지는 08:00~20:50(한국 시간)에만
 *  - 알림톡은 정보성만, 카카오가 승인한 템플릿 그대로(#{이름} 같은 변수만 채움)
 * 발송 API
 *  솔라피  POST https://api.solapi.com/messages/v4/send-many/detail  헤더 Authorization: HMAC-SHA256 apiKey=…, date=…, salt=…, signature=…
 *          signature = HMAC-SHA256(API Secret, date + salt) hex · 메시지 종류 SMS / LMS / ATA(알림톡) / BMS_TEXT(브랜드 메시지)
 *  Resend  POST https://api.resend.com/emails/batch (100통씩)  헤더 Authorization: Bearer <키> */
"use strict";
const crypto = require("crypto");

const env = () => process.env;
const smsOn = () => !!(env().SOLAPI_API_KEY && env().SOLAPI_API_SECRET && env().SOLAPI_SENDER);
const kakaoOn = () => smsOn() && !!env().SOLAPI_PFID;
const emailOn = () => !!(env().RESEND_API_KEY && env().MAIL_FROM);
const on = (ch) => (ch === "sms" ? smsOn() : ch === "alim" || ch === "brand" ? kakaoOn() : ch === "email" ? emailOn() : false);
/** 화면에 보여 줄 연결 상태 (비밀 값은 빼고) */
function status() {
  const s = env().SOLAPI_SENDER || "", f = env().MAIL_FROM || "";
  return { sms: smsOn(), alim: kakaoOn(), brand: kakaoOn(), email: emailOn(), sender: s ? s.replace(/\D/g, "").replace(/^(02|0\d{2})\d+(\d{4})$/, "$1-****-$2") : "", from: f, pfId: !!env().SOLAPI_PFID };
}

/* ---------- 한국 시간 · 광고 규칙 ---------- */
const kstHour = (ms) => { const d = new Date(ms + 9 * 36e5); return d.getUTCHours() + d.getUTCMinutes() / 60; };
const brandClosed = (ms) => { const h = kstHour(ms); return h >= 20 + 50 / 60 || h < 8; };
const smsNight = (ms) => { const h = kstHour(ms); return h >= 21 || h < 8; };
const AD = { alim: false, brand: true, sms: true, email: true };
const subOf = (m) => { const c = m.consent || {}; return !!(c.mkt != null ? c.mkt : m.marketing); };
const chsOf = (m) => (m.consent ? m.consent.ch || [] : m.marketing ? ["sms", "email", "kakao"] : []);
const phoneOf = (m) => String(m.phone || "").replace(/\D/g, "");
/** 이 회원에게 이 채널로 보내도 되는지 → "" (보냄) 또는 빠지는 이유 */
function why(m, ch, at) {
  if (!m) return "회원 없음";
  if (m.blocked || m.withdrawnAt) return "이용 중지 · 탈퇴";
  if ((ch === "sms" || ch === "alim" || ch === "brand") && !/^01\d{8,9}$/.test(phoneOf(m))) return "휴대폰 번호 없음";
  if (ch === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(m.email || ""))) return "이메일 없음";
  if (AD[ch]) {
    if (!subOf(m)) return "소식 받기 미동의";
    if (chsOf(m).indexOf(ch === "brand" ? "kakao" : ch) < 0) return "이 채널 미동의";
    if (ch === "sms" && smsNight(at) && !(m.consent || {}).night) return "야간 수신 미동의";
  }
  return "";
}
/** 받는 사람마다 글 만들기: {이름} 채우기 · 광고면 (광고) + 수신 거부 */
function textFor(ch, text, m, opt) {
  let s = String(text || "").replace(/\{이름\}/g, m.name || "회원");
  if (AD[ch] && !/^\(광고\)/.test(s)) s = "(광고) " + s;
  if (AD[ch]) s += "\n\n" + (ch === "sms" ? "무료 수신거부 " + opt.optout : ch === "email" ? "" : "수신 거부: DOOGO CLASS 마이페이지 › 회원 정보 수정");
  return s.trim();
}

/* ---------- 솔라피 ---------- */
function solapiAuth() {
  const date = new Date().toISOString(), salt = crypto.randomBytes(16).toString("hex");
  const sig = crypto.createHmac("sha256", env().SOLAPI_API_SECRET).update(date + salt).digest("hex");
  return "HMAC-SHA256 apiKey=" + env().SOLAPI_API_KEY + ", date=" + date + ", salt=" + salt + ", signature=" + sig;
}
const bytes = (s) => Buffer.byteLength(String(s), "utf8"); // 한글 3바이트로 넉넉히 셈 (SMS 90바이트 넘으면 LMS)
async function solapi(messages, at) {
  const body = { messages };
  if (at && at > Date.now() + 60e3) body.scheduledDate = new Date(at).toISOString();
  const r = await fetch("https://api.solapi.com/messages/v4/send-many/detail", { method: "POST", headers: { "Content-Type": "application/json", Authorization: solapiAuth() }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error((j && (j.errorMessage || j.message)) || "solapi " + r.status); e.status = r.status; throw e; }
  const failed = Array.isArray(j.failedMessageList) ? j.failedMessageList.length : 0;
  return { group: (j.groupInfo && j.groupInfo._id) || "", failed };
}
function solapiMsg(ch, m, text, opt) {
  const to = phoneOf(m), from = String(env().SOLAPI_SENDER).replace(/\D/g, "");
  if (ch === "sms") return Object.assign({ to, from, text }, bytes(text) > 90 ? { type: "LMS", subject: opt.subject || "DOOGO CLASS" } : { type: "SMS" });
  if (ch === "alim") return { to, from, type: "ATA", text, kakaoOptions: { pfId: env().SOLAPI_PFID, templateId: opt.templateId, variables: { "#{이름}": m.name || "회원" }, disableSms: true } };
  return { to, from, type: "BMS_TEXT", text, kakaoOptions: { pfId: env().SOLAPI_PFID, bms: { targeting: opt.targeting || "I", chatBubbleType: "TEXT" } } };
}

/* ---------- Resend (이메일) ---------- */
const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function mailHtml(text, ad) {
  return '<div style="font-family:Pretendard,Apple SD Gothic Neo,Malgun Gothic,sans-serif;font-size:15px;line-height:1.7;color:#222;max-width:560px">' +
    escHtml(text).replace(/\n/g, "<br>") +
    '<hr style="border:0;border-top:1px solid #eee;margin:24px 0"><p style="font-size:12px;color:#888">DOOGO CLASS · 주식회사 두고홀딩스 · doogobiz@gmail.com' +
    (ad ? '<br>이 메일은 소식 받기에 동의한 회원에게 보내는 광고성 메일이에요. 더 받지 않으려면 DOOGO CLASS 마이페이지 › 회원 정보 수정에서 소식 받기를 끄거나 이 메일에 ‘수신 거부’라고 답장해 주세요.' : "") + "</p></div>";
}
async function resend(mails) {
  const r = await fetch("https://api.resend.com/emails/batch", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + env().RESEND_API_KEY }, body: JSON.stringify(mails) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error((j && (j.message || j.name)) || "resend " + r.status); e.status = r.status; throw e; }
  return { ids: ((j && j.data) || []).map((x) => x.id) };
}

/** 보내기 — members: 회원 문서 배열 · opt: { text, subject, templateId, at, optout, targeting } → { sent, failed, skip:{이유:명}, group } */
async function send(ch, members, opt) {
  if (!on(ch)) return { ok: false, message: "아직 연결되지 않은 채널이에요." };
  const at = Number(opt.at) || Date.now();
  if (ch === "brand" && brandClosed(at)) return { ok: false, message: "카카오 브랜드 메시지는 한국 시간 08:00~20:50에만 보낼 수 있어요. 예약으로 아침 8시 이후를 골라 주세요." };
  if (ch === "alim" && !opt.templateId) return { ok: false, message: "알림톡은 카카오가 승인한 템플릿을 골라야 보낼 수 있어요." };
  if (ch === "sms" && !/^080-?\d{3,4}-?\d{4}$/.test(String(opt.optout || ""))) return { ok: false, message: "광고 문자에는 080 무료 수신거부 번호가 필요해요. 채널 · 발송 규칙에서 먼저 넣어 주세요." };
  const skip = {}, list = [];
  const seen = {};
  members.forEach((m) => { const w = why(m, ch, at); if (w) { skip[w] = (skip[w] || 0) + 1; return; } const k = ch === "email" ? String(m.email).toLowerCase() : phoneOf(m); if (seen[k]) { skip["같은 연락처"] = (skip["같은 연락처"] || 0) + 1; return; } seen[k] = 1; list.push(m); });
  if (!list.length) return { ok: true, sent: 0, failed: 0, skip, to: [] };
  let sent = 0, failed = 0, group = "";
  if (ch === "email") {
    const subj = (AD.email && !/^\(광고\)/.test(opt.subject || "") ? "(광고) " : "") + String(opt.subject || "DOOGO CLASS 소식").slice(0, 120);
    for (let i = 0; i < list.length; i += 100) {
      const part = list.slice(i, i + 100), mails = part.map((m) => { const t = textFor(ch, opt.text, m, opt); const x = { from: env().MAIL_FROM, to: [m.email], subject: subj.replace(/\{이름\}/g, m.name || "회원"), html: mailHtml(t, true), text: t, headers: { "List-Unsubscribe": "<mailto:doogobiz@gmail.com?subject=unsubscribe>" } }; if (at > Date.now() + 60e3) x.scheduled_at = new Date(at).toISOString(); return x; });
      try { await resend(mails); sent += part.length; } catch (e) { console.error("[msg] resend", e.status, e.message); failed += part.length; }
    }
  } else {
    for (let i = 0; i < list.length; i += 500) {
      const part = list.slice(i, i + 500);
      try { const r = await solapi(part.map((m) => solapiMsg(ch, m, ch === "alim" ? String(opt.text || "").replace(/#\{이름\}|\{이름\}/g, m.name || "회원") : textFor(ch, opt.text, m, opt), opt)), at); sent += part.length - r.failed; failed += r.failed; group = group || r.group; }
      catch (e) { console.error("[msg] solapi", e.status, e.message); failed += part.length; }
    }
  }
  return { ok: true, sent, failed, skip, group, to: list.map((m) => m.id) };
}

module.exports = { status, on, send, why, textFor, brandClosed, smsNight, kstHour };
