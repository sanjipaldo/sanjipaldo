/* 강사 AI 조교 — 강사가 보낸 학습 자료(tutor/<강사>.md) + 강의 자료(FAQ · 용어 사전 · 서류 가이드 · 주차)를 바탕으로 답해요.
 *
 *  ANTHROPIC_API_KEY 가 있으면 Claude(모델은 Vercel 환경 변수 AI_TUTOR_MODEL, effort low)로 답하고, 둘 중 하나가 없거나 실패하면
 *  학습 자료에서 가장 가까운 단락을 찾아 그대로 보여 줘요 (지어내지 않음).
 *  학습 자료 · 강의 자료는 매번 같은 순서라 프롬프트 캐시(cache_control)로 다시 읽는 비용을 줄여요.
 *  관세 회피(언더밸류) · 질병 효능 표현처럼 법에 걸리는 안내는 하지 않아요. */
"use strict";
const fs = require("fs");
const path = require("path");
const store = require("./store");

/** 쓸 모델 이름은 코드에 적지 않고 Vercel 환경 변수로 정해요 (모델을 바꿀 때 배포 없이 바꿀 수 있게) */
const model = () => String(process.env.AI_TUTOR_MODEL || "").trim();
const KB_DIR = path.join(__dirname, "tutor");
const kbCache = {};
/** 강사가 보낸 학습 자료 (없으면 빈 문자열) */
function kbOf(iid) {
  if (!/^[a-z0-9_-]{1,40}$/i.test(iid)) return "";
  if (kbCache[iid] == null) { try { kbCache[iid] = fs.readFileSync(path.join(KB_DIR, iid + ".md"), "utf8"); } catch (e) { kbCache[iid] = ""; } }
  return kbCache[iid];
}
const clip = (s, n) => { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n) + "…" : s; };
/** 강의 자료를 짧은 글로 (FAQ · 용어 · 서류 가이드 · 주차 제목) */
function courseText(c) {
  if (!c) return "";
  const out = [];
  (c.faqs || []).slice(0, 60).forEach((f) => { if (f && f.q && f.a) out.push("Q. " + clip(f.q, 120) + "\nA. " + clip(f.a, 600)); });
  const gl = (c.glossary || []).slice(0, 120).filter((g) => g && g.term).map((g) => "- " + clip(g.term, 40) + ": " + clip(g.desc, 240));
  const dg = (c.docsGuide || []).slice(0, 20).filter((g) => g && g.title).map((g) => "- " + clip(g.title, 60) + " (" + clip([g.where, g.time, g.cost].filter(Boolean).join(" · "), 120) + ")" + ((g.docs || []).length ? " 필요 서류: " + clip(g.docs.join(", "), 200) : ""));
  const wk = (c.weeks || []).slice(0, 12).filter((w) => w && w.title).map((w) => "- " + w.no + "주차 " + clip(w.title, 60) + (w.summary ? ": " + clip(w.summary, 160) : ""));
  return [out.length ? "### 자주 묻는 질문\n" + out.join("\n\n") : "", gl.length ? "### 용어 사전\n" + gl.join("\n") : "", dg.length ? "### 서류 준비 가이드\n" + dg.join("\n") : "", wk.length ? "### 주차별 강의\n" + wk.join("\n") : ""].filter(Boolean).join("\n\n");
}
function systemText(brand, kb, course) {
  const ins = clip((brand && brand.instructor) || "강사", 30), bot = clip((brand && brand.botName) || ins + " AI 조교", 40);
  return "너는 " + ins + "님의 수업을 돕는 ‘" + bot + "’야. 수강생 질문에 아래 [학습 자료]와 [강의 자료]를 바탕으로 답해.\n\n" +
    "답하는 법\n" +
    "- 해요체로, 3~6문장 안에서 핵심부터 말해. 순서가 있으면 1. 2. 3. 줄바꿈 목록으로 써.\n" +
    "- 채팅 말풍선에 그대로 보여서 마크다운 기호(**, #, 표)는 쓰지 마.\n" +
    "- 자료에 없는 내용은 지어내지 마. 모르면 모른다고 하고, ‘질문 · 요청’ 메뉴의 1:1 요청이나 라이브 시간에 " + ins + "님께 물어보라고 안내해.\n" +
    "- 가격 · 계좌 · 숫자 · 링크는 자료에 적힌 그대로만 알려 줘.\n" +
    "- 관세나 세금을 줄이려고 가격을 낮춰 신고(언더밸류)하거나 쪼개 보내는 등 법을 피하는 방법은 알려 주지 마. 실제 가격대로 신고해야 한다고 말해 줘.\n" +
    "- 건강식품의 질병 예방 · 치료 효과처럼 과장된 효능은 말하지 마.\n" +
    "- 통관 · 세금 · 영업 신고처럼 법으로 정한 일은 기준이 바뀔 수 있으니 관세청 · 식약처 같은 관할 기관 안내를 확인하라고 덧붙여.\n\n" +
    (kb ? "[학습 자료]\n" + kb.trim() + "\n\n" : "") + (course ? "[강의 자료]\n" + course : "");
}
/* ---------- 학습 자료에서 찾기 (키가 없거나 Claude 호출이 실패했을 때) ---------- */
const grams = (s) => { const t = String(s || "").toLowerCase().replace(/[^0-9a-z가-힣]/g, ""), g = new Set(); for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2)); return g; };
function score(q, text) { const A = grams(q), B = grams(text); if (!A.size || !B.size) return 0; let n = 0; A.forEach((x) => { if (B.has(x)) n++; }); return n / A.size; }
function kbAnswer(q, kb, c) {
  const parts = [];
  kb.split(/\n(?=## )/).forEach((sec) => { const lines = sec.split("\n"), head = lines[0].replace(/^#+\s*/, ""); lines.slice(1).filter((l) => /^\s*(-|\d+\))/.test(l) || l.trim()).forEach((l) => parts.push({ head, text: l.replace(/^\s*-\s*/, "").trim() })); });
  ((c && c.faqs) || []).forEach((f) => { if (f && f.q && f.a) parts.push({ head: f.q, text: f.a, faq: true }); });
  const ranked = parts.map((p) => ({ p, s: score(q, p.head + " " + p.text) + (p.faq ? 0 : 0.05) })).filter((x) => x.p.text).sort((a, b) => b.s - a.s);
  if (!ranked.length || ranked[0].s < 0.34) return null;
  const top = ranked[0].p, same = ranked.filter((x) => x.s >= ranked[0].s * 0.8 && x.p.head === top.head && !x.p.faq).slice(0, 4);
  return top.faq ? top.text : "‘" + top.head + "’ 자료를 찾았어요.\n" + (same.length ? same : [{ p: top }]).map((x) => "- " + x.p.text).join("\n");
}
/* ---------- 묻기 ---------- */
async function ask(iid, q, history) {
  const row = await store.getDoc("content:" + iid), c = (row && row.v) || null, brand = (c && c.brand) || {}, kb = kbOf(iid);
  const fallback = (why) => { const t = kbAnswer(q, kb, c); return { ok: true, src: "kb", why, text: t || "그 부분은 제가 가진 자료로는 정확히 답하기 어려워요. ‘질문 · 요청’ 메뉴의 1:1 요청이나 라이브 시간에 " + (brand.instructor || "강사") + "님께 직접 물어봐 주세요." }; };
  if (!process.env.ANTHROPIC_API_KEY || !model()) return fallback("no-key");
  const Anthropic = require("@anthropic-ai/sdk").default;
  // 대화: 최근 8개까지 · 사용자 → 조교 순서가 맞게 (첫 메시지는 사용자)
  const msgs = [];
  (Array.isArray(history) ? history.slice(-8) : []).forEach((m) => {
    const role = m && m.from === "me" ? "user" : "assistant", text = clip(m && m.text, 1500).trim();
    if (!text) return;
    if (!msgs.length && role !== "user") return;
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += "\n" + text; else msgs.push({ role, content: text });
  });
  if (msgs.length && msgs[msgs.length - 1].role === "user") msgs.pop();
  msgs.push({ role: "user", content: clip(q, 1500) });
  // 함수 최대 60초(vercel.json) 안에 끝나게: 한 번 25초 · 다시 시도 1번
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 25000, maxRetries: 1 });
  try {
    const res = await client.beta.messages.create({
      model: model(),
      max_tokens: 4096,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: systemText(brand, kb, courseText(c)), cache_control: { type: "ephemeral" } }],
      messages: msgs
    });
    if (res.stop_reason === "refusal") return { ok: true, src: "ai", text: "그 질문에는 제가 답하기 어려워요. ‘질문 · 요청’ 메뉴의 1:1 요청으로 " + (brand.instructor || "강사") + "님께 직접 물어봐 주세요." };
    const text = (res.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    if (!text) return fallback("empty");
    return { ok: true, src: "ai", text: clip(text, 3000) };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) console.error("[tutor] ANTHROPIC_API_KEY 를 확인해 주세요 (인증 실패)");
    else if (e instanceof Anthropic.RateLimitError) console.error("[tutor] 요청이 많아 잠시 막힘 (429)");
    else if (e instanceof Anthropic.APIError) console.error("[tutor] Claude API 오류", e.status, e.message);
    else console.error("[tutor] 연결 실패", e && e.message);
    return fallback("error");
  }
}

module.exports = { ask, kbOf, kbAnswer, systemText, courseText };
