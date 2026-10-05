"use strict";
/* 메일 발송. 사용자마다 방식을 고른다.
   - outbox : 실제로 보내지 않고 '보낸 메일'에 미리보기로만 남김 (기본값, 시험용)
   - resend : Resend(https://resend.com) API 키로 발송
   - gmail  : 연결한 구글 계정의 Gmail 로 발송 (gmail.send 권한) */

function toHtml(text) {
  const escaped = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const linked = escaped.replace(/https?:\/\/[^\s<]+/g, url => `<a href="${url}">${url}</a>`);
  return `<div style="font-family:sans-serif;font-size:15px;line-height:1.7">${linked.replace(/\r?\n/g, "<br>")}</div>`;
}

const b64 = s => Buffer.from(s, "utf8").toString("base64");
const encodeHeader = s => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

function buildMime({ from, to, replyTo, subject, text }) {
  const boundary = `jarvis_${Date.now().toString(36)}`;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    replyTo ? `Reply-To: ${replyTo}` : "",
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean);
  return [
    ...headers, "",
    `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(text),
    `--${boundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(toHtml(text)),
    `--${boundary}--`, "",
  ].join("\r\n");
}

function createMailer({ db, cipher, google, fetchImpl = fetch }) {
  async function deliver(user, msg) {
    const s = user.settings.mail || {};
    const provider = s.provider || "outbox";
    const name = (s.senderName || user.username).replace(/[<>"\r\n]/g, "");
    if (provider === "outbox") return { provider, status: "미리보기" };

    if (provider === "resend") {
      const key = cipher.decrypt(s.resendKey);
      if (!key || !s.from) throw new Error("Resend API 키와 보내는 주소를 설정에서 입력하세요");
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ from: `${name} <${s.from}>`, to: [msg.to], subject: msg.subject, text: msg.text, html: toHtml(msg.text), reply_to: s.replyTo || undefined }),
      });
      if (!res.ok) throw new Error(`Resend 발송 실패 (${res.status}): ${(await res.text()).slice(0, 200)}`);
      return { provider, status: "발송완료" };
    }

    if (provider === "gmail") {
      const tokens = cipher.decrypt(user.google && user.google.tokens);
      const access = await google.accessToken(tokens, next => { user.google.tokens = cipher.encrypt(next); db.save(); });
      const from = `${encodeHeader(name)} <${(user.google && user.google.email) || "me"}>`;
      const raw = Buffer.from(buildMime({ from, to: msg.to, replyTo: s.replyTo, subject: msg.subject, text: msg.text })).toString("base64url");
      const res = await fetchImpl("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      if (!res.ok) throw new Error(`Gmail 발송 실패 (${res.status}): ${(await res.text()).slice(0, 200)}`);
      return { provider, status: "발송완료" };
    }
    throw new Error(`알 수 없는 발송 방식: ${provider}`);
  }

  /** 보내고 결과를 '보낸 메일'에 기록한다. 실패해도 throw 하지 않고 { ok:false } */
  async function send(user, msg, kind = "레퍼럴") {
    const row = { id: db.id(), userId: user.id, kind, to: msg.to, subject: msg.subject, text: msg.text, at: new Date().toISOString() };
    try {
      const r = await deliver(user, msg);
      Object.assign(row, { provider: r.provider, status: r.status });
    } catch (e) {
      Object.assign(row, { provider: (user.settings.mail || {}).provider || "outbox", status: "발송실패", error: String(e.message || e).slice(0, 300) });
    }
    db.data.emails.push(row);
    db.save();
    return { ok: row.status !== "발송실패", row };
  }

  return { send };
}

module.exports = { createMailer, toHtml, buildMime };
