/* POST /api/ai-tutor { iid, q, history } — 강의실 AI 조교에게 묻기 → { ok, src: "ai"|"kb", text }
 *  묻는 사람: 그 강사의 수강생 · 그 강사의 VOD를 산 회원 · 강사 본인 · 코치 · 마스터
 *  15분에 30번까지 (사람마다). 학습 자료 · 답하는 법은 _lib/tutor.js */
"use strict";
const { send, body, handler } = require("./_lib/http");
const store = require("./_lib/store");
const auth = require("./_lib/auth");
const tutor = require("./_lib/tutor");

const LIMIT = 30;
/** 이 강사의 강의실을 쓰는 사람인지 → 제한 키 (아니면 "") */
async function who(ids, iid) {
  if (ids.admin && (ids.admin.role === "master" || ids.admin.iid === iid)) return "adm:" + (ids.admin.staffId || ids.admin.cid || ids.admin.iid || "master");
  if (ids.student && ids.student.iid === iid) return "stu:" + iid + ":" + ids.student.sid;
  if (ids.vod && (ids.vod.owns || []).length) {
    const meta = ((await store.getDoc("meta")) || {}).v || {}, mine = (((meta.vod || {}).products) || []).filter((p) => p && p.iid === iid).map((p) => String(p.id));
    if (mine.some((id) => ids.vod.owns.indexOf(id) >= 0)) return "vm:" + ids.vod.mid;
  }
  return "";
}

module.exports = handler(["POST"], async (req, res) => {
  const b = await body(req), iid = String(b.iid || "").slice(0, 40), q = String(b.q || "").trim().slice(0, 1500);
  if (!/^[a-z0-9_-]+$/i.test(iid) || !q) return send(res, 400, { error: "input" });
  const k = await who(await auth.identify(req), iid);
  if (!k) return send(res, 403, { error: "forbidden" });
  const rk = "ai:" + k;
  if (await store.rlCheck([rk], LIMIT)) return send(res, 429, { error: "busy", text: "질문이 많아 잠깐 쉬어 갈게요. 15분쯤 뒤에 다시 물어봐 주세요." });
  await store.rlFail([rk]);
  const r = await tutor.ask(iid, q, Array.isArray(b.history) ? b.history.slice(-8) : []);
  send(res, 200, { ok: true, src: r.src, text: r.text });
});
