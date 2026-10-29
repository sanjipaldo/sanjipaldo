/* 마스터 CRM 메시지 실제 발송 요청 처리 — /api/admin 의 action "msg-status" · "msg-send" (마스터 · 운영자만)
 *  (Vercel 무료 요금제는 배포 한 번에 서버 함수가 12개까지라 따로 /api 파일을 만들지 않고 admin 에 붙였어요)
 *  { action: "msg-status" }  → { cfg: 채널별 연결 여부 · 발신번호(가림) · 보내는 메일 }
 *  { action: "msg-send", ch: "sms"|"alim"|"brand"|"email", mids: [회원 id…], text, subject, templateId, at }
 *       → 서버가 회원 문서를 다시 읽어 동의 · 야간 · 연락처를 확인하고 보낸 뒤 { sent, failed, skip, to }
 *  080 수신거부 번호 · 브랜드 메시지 대상은 마스터 › 메시지 · 자동화 › 채널 · 발송 규칙(meta.vod.crm.send)에서 정해요.
 *  최근 발송 100건은 vmsg 문서(서버 전용)에 남겨요. 실제 보내는 일은 msg.js */
"use strict";
const store = require("./store");
const V = require("./vod");
const MSG = require("./msg");

const MAX = 5000;
/** ids: 확인된 마스터 · b: 요청 본문 → { status, json } */
async function run(ids, b) {
  if (b.action === "msg-status") return { status: 200, json: { ok: true, cfg: MSG.status() } };
  const ch = String(b.ch || ""), mids = Array.from(new Set((Array.isArray(b.mids) ? b.mids : []).map(String).filter((x) => /^[\w-]{1,40}$/.test(x)))).slice(0, MAX);
  if (["sms", "alim", "brand", "email"].indexOf(ch) < 0) return { status: 400, json: { error: "ch" } };
  const text = String(b.text || "").slice(0, 2000).trim();
  if (text.length < 2 || !mids.length) return { status: 400, json: { error: "input", message: "받는 사람과 내용을 확인해 주세요." } };
  const meta = ((await store.getDoc("meta")) || {}).v || {}, conf = ((((meta.vod || {}).crm) || {}).send) || {};
  const members = [];
  for (let i = 0; i < mids.length; i += 200) {
    const docs = await store.getDocs(mids.slice(i, i + 200).map(V.K.member));
    Object.keys(docs).forEach((k) => { if (docs[k] && docs[k].v) members.push(docs[k].v); });
  }
  const r = await MSG.send(ch, members, { text, subject: String(b.subject || "").slice(0, 120), templateId: String(b.templateId || "").slice(0, 80), at: Number(b.at) || 0, optout: String(conf.optout || ""), targeting: /^[IMN]$/.test(conf.targeting || "") ? conf.targeting : "I" });
  if (!r.ok) return { status: 409, json: r };
  const by = String((ids.admin && (ids.admin.staffId || "master")) || "master");
  await V.update("vmsg", (x) => { x = x || { recent: [] }; x.recent = [{ at: Date.now(), ch, by, n: mids.length, sent: r.sent, failed: r.failed, group: r.group || "", sched: Number(b.at) > Date.now() + 60e3 ? Number(b.at) : 0 }].concat(x.recent || []).slice(0, 100); return x; });
  return { status: 200, json: { ok: true, sent: r.sent, failed: r.failed, skip: r.skip, to: r.to } };
}
module.exports = { run };
