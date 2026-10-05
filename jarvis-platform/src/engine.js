"use strict";
/* 자비스 엔진: 댓글 확인 → 대댓글, 새 영상 → 안내 댓글, 신청 폼 접수 → 레퍼럴 메일
   (Apps Script 버전 youtube-referral-bot/Code.gs 와 같은 규칙) */
const crypto = require("node:crypto");

const ST = { REPLIED: "답글완료", TEST: "테스트", DUP: "중복(답글 안 함)", FAIL: "실패" };
const SUB = { SENT: "발송완료", PREVIEW: "미리보기", FAIL: "발송실패", BAD_EMAIL: "이메일 오류", NO_CODE: "코드 없음", USED: "이미 사용된 코드", DUP_EMAIL: "중복 이메일", NO_CONSENT: "동의 안 함", NO_LINK: "레퍼럴 링크 없음" };
const NV = { DONE: "안내 완료", TEST: "테스트", NONE: "안내 댓글 없음", FAIL: "실패" };

const OVERLAP_MS = 6 * 3600 * 1000;
const MAX_PAGES = 20;
const MAX_FAILS = 3;
const MAX_RUN_MS = 4 * 60 * 1000;
const CODE_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_CHARS = CODE_LETTERS + "23456789";
const EMAIL_RE = /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[^\s@<>()"',;:]{2,}$/;

const DEFAULT_REPLY =
  "{name}님 댓글 감사합니다! 🎁\n" +
  "아래 링크에서 이메일만 입력하시면 {campaign} 전용 혜택 링크를 메일로 바로 보내드려요.\n" +
  "👉 {form}\n" +
  "(인증코드: {code} · 1회용)\n" +
  "---\n" +
  "{name}님 고마워요 🙌 {campaign} 혜택 링크는 여기서 신청해주세요!\n" +
  "👉 {form}\n" +
  "인증코드 {code}";
const DEFAULT_SUBJECT = "[{campaign}] 요청하신 전용 레퍼럴 링크입니다";
const DEFAULT_BODY =
  "안녕하세요 {name}님!\n\n" +
  "영상에 댓글 남겨주셔서 감사합니다.\n" +
  "요청하신 {campaign} 전용 레퍼럴 링크를 보내드립니다.\n\n" +
  "👉 {link}\n\n" +
  "앞으로도 좋은 영상으로 찾아뵐게요. 감사합니다!\n" +
  "- {channel} 드림";
const DEFAULT_ANNOUNCE = '📢 이 영상 댓글에 "{keyword}" 를 남겨주시면 {campaign} 전용 혜택 링크를 답글로 보내드려요!\n좋아요 · 구독은 큰 힘이 됩니다 🙏';

// ── 도우미 ──
const normalize = s => String(s || "").normalize("NFC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");

function extractVideoId(s) {
  s = String(s || "").trim();
  if (!s) return "";
  const m = s.match(/(?:[?&]v=|youtu\.be\/|\/shorts\/|\/live\/|\/embed\/)([\w-]{11})/);
  if (m) return m[1];
  return /^[\w-]{11}$/.test(s) ? s : "";
}
const parseVideoIds = v => [...new Set(String(v || "").split(/[\s,]+/).map(extractVideoId).filter(Boolean))];
const splitList = v => String(v || "").split(/[,\n]/).map(s => s.trim()).filter(Boolean);
const splitVariants = t => String(t || "").split(/\r?\n\s*-{3,}\s*(?:\r?\n|$)/).map(v => v.trim()).filter(Boolean);
const render = (tpl, vars) => String(tpl || "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
const pick = list => list[crypto.randomInt(list.length)];
const isEmail = s => EMAIL_RE.test(String(s || ""));

function newCode(taken) {
  let code;
  do {
    code = CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)];
    for (let i = 0; i < 5; i++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  } while (taken.has(code));
  taken.add(code);
  return code;
}

function campaignApplies(c, videoId) {
  return c.target === "channel" ? true : c.videos.includes(videoId);
}

function findCampaign(campaigns, videoId, text, channelVideoIds) {
  const t = normalize(text);
  if (!t) return null;
  return campaigns.find(c => {
    if (c.target === "channel" ? channelVideoIds && !channelVideoIds.has(videoId) : !c.videos.includes(videoId)) return false;
    const keys = c.keywords.map(normalize).filter(Boolean);
    return keys.some(k => (c.exact ? t === k : t.includes(k)));
  }) || null;
}

// YouTube 할당량은 미국 태평양시간 자정 기준
const quotaDay = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);

function createEngine({ db, mailer, baseUrl }) {
  const data = db.data;
  const formUrl = (camp, code) => `${baseUrl()}/f/${camp.slug}${code ? `?c=${code}` : ""}`;

  function state(user) {
    user.state = user.state || {};
    user.state.replyCounts = user.state.replyCounts || {};
    return user.state;
  }
  const todayReplies = user => state(user).replyCounts[quotaDay()] || 0;
  function bumpReplies(user) {
    const s = state(user);
    const day = quotaDay();
    s.replyCounts = { [day]: (s.replyCounts[day] || 0) + 1 };
  }
  const budget = user => (Number(user.settings.dailyLimit) || 150) - todayReplies(user);
  const testModeOf = (user, provider) => provider.kind === "live" && Boolean(user.settings.testMode);

  /** 댓글 확인 → 대댓글. 한 사용자 분량을 처리하고 요약을 돌려준다 */
  async function checkComments(user, provider) {
    const started = Date.now();
    const testMode = testModeOf(user, provider);
    const sum = { testMode, scanned: 0, matched: 0, replied: 0, tested: 0, skipped: 0, failed: 0, stopReason: "" };
    const campaigns = data.campaigns.filter(c => c.userId === user.id && c.active && c.keywords.length && splitVariants(c.replyTemplate).length);
    if (!campaigns.length) {
      sum.stopReason = "사용 중인 캠페인이 없습니다";
      return sum;
    }
    const me = await provider.myChannel();

    const processed = new Set();
    const fails = {};
    const done = new Set();
    const codes = new Set(data.replies.map(r => r.code).filter(Boolean));
    for (const r of data.replies) {
      if (r.userId !== user.id) continue;
      if (r.status === ST.REPLIED || r.status === ST.DUP || (testMode && r.status === ST.TEST)) processed.add(r.threadId);
      if (r.status === ST.FAIL) fails[r.threadId] = (fails[r.threadId] || 0) + 1;
      if (r.status === ST.REPLIED || (testMode && r.status === ST.TEST)) done.add(`${r.campaignId}|${r.authorChannelId}`);
    }

    const s = state(user);
    const wmKey = `wm_${provider.kind}${testMode ? "_test" : ""}`;
    const watermark = s[wmKey] || 0;
    const since = watermark ? watermark - OVERLAP_MS : started - (Number(user.settings.firstHours) || 168) * 3600 * 1000;
    let newest = watermark;

    // 어디서 댓글을 읽을지: 채널 전체 캠페인이 있으면 채널 전체, 특정 영상 캠페인은 영상별
    const sources = [];
    if (campaigns.some(c => c.target === "channel")) sources.push({ channelId: me.id });
    const videoIds = new Set(campaigns.filter(c => c.target === "videos").flatMap(c => c.videos));
    for (const v of videoIds) sources.push({ videoId: v });

    const threads = new Map();
    const channelVideoIds = new Set();
    for (const src of sources) {
      let pageToken = "";
      let pages = 0;
      do {
        const res = await provider.listThreads(src, pageToken);
        pages++;
        pageToken = res.nextPageToken;
        for (const t of res.items) {
          const at = Date.parse(t.publishedAt);
          if (at < since) { pageToken = ""; break; }
          if (src.channelId) channelVideoIds.add(t.videoId);
          if (!threads.has(t.id)) threads.set(t.id, t);
        }
      } while (pageToken && pages < MAX_PAGES);
    }

    const list = [...threads.values()].sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
    let interrupted = false;
    for (const t of list) {
      sum.scanned++;
      const at = Date.parse(t.publishedAt);
      if (at > newest) newest = at;
      if (processed.has(t.id) || (fails[t.id] || 0) >= MAX_FAILS) continue;
      if (t.authorChannelId && t.authorChannelId === me.id) continue;
      if (!t.videoId) continue;
      const camp = findCampaign(campaigns, t.videoId, t.text, channelVideoIds);
      if (!camp) continue;
      sum.matched++;

      if (Date.now() - started > MAX_RUN_MS) { interrupted = true; sum.stopReason = "실행 시간 한도 → 다음 확인 때 이어서"; break; }
      const base = { id: db.id(), userId: user.id, campaignId: camp.id, videoId: t.videoId, threadId: t.id, author: t.author, authorChannelId: t.authorChannelId, comment: t.text.slice(0, 1000), at: new Date().toISOString() };

      if (camp.onePerPerson && t.authorChannelId && done.has(`${camp.id}|${t.authorChannelId}`)) {
        data.replies.push(Object.assign(base, { status: ST.DUP, note: "이미 답글을 받은 사람" }));
        processed.add(t.id);
        sum.skipped++;
        continue;
      }
      if (!testMode && budget(user) <= 0) { interrupted = true; sum.stopReason = "하루 최대 답글 수 도달 → 내일 이어서"; break; }

      const code = newCode(codes);
      const text = render(pick(splitVariants(camp.replyTemplate)), { name: t.author, code, campaign: camp.name, form: formUrl(camp, code), form_code: formUrl(camp, code) });

      if (testMode) {
        data.replies.push(Object.assign(base, { reply: text, code, status: ST.TEST, note: "테스트모드 - 유튜브에 실제로 달지 않음" }));
        processed.add(t.id);
        done.add(`${camp.id}|${t.authorChannelId}`);
        sum.tested++;
        continue;
      }
      try {
        await provider.reply(t.id, text);
        bumpReplies(user);
        data.replies.push(Object.assign(base, { reply: text, code, status: ST.REPLIED }));
        processed.add(t.id);
        done.add(`${camp.id}|${t.authorChannelId}`);
        sum.replied++;
      } catch (e) {
        data.replies.push(Object.assign(base, { reply: text, status: ST.FAIL, note: String(e.message || e).slice(0, 300) }));
        sum.failed++;
        if (e.quota) { interrupted = true; sum.stopReason = "YouTube API 하루 할당량 초과 → 내일 이어서"; break; }
      }
      db.save();
    }

    if (!interrupted && newest) s[wmKey] = newest;
    db.save();
    return sum;
  }

  /** 새 영상 감지 → 채널 전체 캠페인의 안내 댓글 + 주인에게 알림 메일 */
  async function checkNewVideos(user, provider) {
    if (user.settings.newVideoAuto === false) return [];
    const campaigns = data.campaigns.filter(c => c.userId === user.id && c.active && c.target === "channel");
    if (!campaigns.length) return [];
    const s = state(user);
    const sinceKey = `newSince_${provider.kind}`;
    if (!s[sinceKey]) { s[sinceKey] = Date.now(); db.save(); return []; }

    const testMode = testModeOf(user, provider);
    const me = await provider.myChannel();
    const handled = new Set();
    const fails = {};
    for (const n of data.newVideos) {
      if (n.userId !== user.id) continue;
      if (n.status === NV.DONE || n.status === NV.NONE || (testMode && n.status === NV.TEST)) handled.add(n.videoId);
      if (n.status === NV.FAIL) fails[n.videoId] = (fails[n.videoId] || 0) + 1;
    }
    const uploads = (await provider.recentUploads(me.uploads))
      .filter(v => v.isPublic && Date.parse(v.publishedAt) >= s[sinceKey] && !handled.has(v.id) && (fails[v.id] || 0) < MAX_FAILS)
      .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));

    const results = [];
    for (const v of uploads) {
      const texts = campaigns.filter(c => c.announce && c.announce.trim()).map(c =>
        render(c.announce, { campaign: c.name, keyword: c.keywords[0] || "", title: v.title, channel: me.title }));
      const text = texts.join("\n\n");
      const row = { id: db.id(), userId: user.id, videoId: v.id, title: v.title, campaigns: campaigns.map(c => c.name).join(", "), text, at: new Date().toISOString() };
      if (!text) row.status = NV.NONE;
      else if (testMode) row.status = NV.TEST;
      else if (budget(user) <= 0) continue; // 다음 확인 때 다시
      else {
        try {
          await provider.postComment(v.id, text);
          bumpReplies(user);
          row.status = NV.DONE;
        } catch (e) {
          if (e.quota) break;
          row.status = NV.FAIL;
          row.note = String(e.message || e).slice(0, 300);
        }
      }
      data.newVideos.push(row);
      db.save();
      results.push(row);
      const notify = (user.settings.notifyEmail || "").trim();
      if (row.status !== NV.FAIL && isEmail(notify)) {
        const body = [
          "새 영상이 올라온 것을 자비스가 감지했습니다.", "",
          `🎬 ${v.title}`, provider.kind === "live" ? `https://www.youtube.com/watch?v=${v.id}` : "(데모 영상)", "",
          `✅ 적용된 캠페인: ${row.campaigns}`,
          `💬 안내 댓글: ${row.status === NV.DONE ? "작성 완료 — 유튜브 스튜디오에서 고정해 주세요" : row.status === NV.TEST ? "테스트모드라 작성 안 함" : "없음"}`,
          text ? `\n${text}` : "", "",
          "이제 이 영상의 키워드 댓글에도 자동으로 답글이 달립니다.", "- 나만의 유튜브 채널 AI 자비스",
        ].join("\n");
        await mailer.send(user, { to: notify, subject: `[자비스] 새 영상 감지: ${v.title}`, text: body }, "새 영상 알림");
      }
    }
    return results;
  }

  /** 신청 폼 접수 1건 처리. 결과를 기록하고 접수자에게 보여줄 문구를 돌려준다 */
  async function handleSubmission({ slug, email, code, consent }) {
    const camp = data.campaigns.find(c => c.slug === slug);
    if (!camp) return { ok: false, message: "신청 페이지를 찾을 수 없습니다." };
    const user = data.users.find(u => u.id === camp.userId);
    email = String(email || "").trim();
    code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const row = { id: db.id(), userId: camp.userId, campaignId: camp.id, email, code, at: new Date().toISOString() };
    const finish = (status, ok, message, extra) => {
      Object.assign(row, { status }, extra || {});
      data.submissions.push(row);
      db.save();
      return { ok, status, message };
    };

    if (!consent) return finish(SUB.NO_CONSENT, false, "개인정보 수집·이용에 동의해 주세요.");
    if (!isEmail(email)) return finish(SUB.BAD_EMAIL, false, "이메일 주소를 다시 확인해 주세요.");
    const rep = data.replies.find(r => r.campaignId === camp.id && r.code && r.code === code);
    if (!rep) return finish(SUB.NO_CODE, false, "인증코드를 찾을 수 없습니다. 유튜브 답글에 적힌 코드를 그대로 입력해 주세요.");
    row.author = rep.author;
    if (rep.usedBy) {
      const same = rep.usedBy.toLowerCase() === email.toLowerCase();
      return finish(SUB.USED, same, same ? "이미 이 이메일로 보내드렸어요. 메일함(스팸함 포함)을 확인해 주세요." : "이미 사용된 인증코드입니다.");
    }
    if (!camp.referralLink) return finish(SUB.NO_LINK, false, "지금은 신청을 받을 수 없습니다. 잠시 뒤 다시 시도해 주세요.");
    const sentBefore = data.submissions.some(x => x.campaignId === camp.id && (x.status === SUB.SENT || x.status === SUB.PREVIEW) && x.email.toLowerCase() === email.toLowerCase());
    if (camp.onePerEmail && sentBefore) return finish(SUB.DUP_EMAIL, true, "이미 이 이메일로 보내드렸어요. 메일함(스팸함 포함)을 확인해 주세요.");

    const vars = { name: rep.author, email, code, campaign: camp.name, link: camp.referralLink, channel: (user.youtube && user.youtube.title) || user.username };
    let text = render(camp.mailBody || DEFAULT_BODY, vars);
    if (!text.includes(camp.referralLink)) text += `\n\n${camp.referralLink}`;
    const sent = await mailer.send(user, { to: email, subject: render(camp.mailSubject || DEFAULT_SUBJECT, vars), text });
    if (!sent.ok) return finish(SUB.FAIL, false, "메일 발송에 실패했습니다. 잠시 뒤 다시 시도해 주세요.", { note: sent.row.error });

    rep.usedBy = email;
    rep.usedAt = new Date().toISOString();
    const status = sent.row.status === "미리보기" ? SUB.PREVIEW : SUB.SENT;
    return finish(status, true, "신청 완료! 몇 분 안에 메일이 도착합니다. 메일이 안 보이면 스팸함·프로모션함도 확인해 주세요.");
  }

  return { checkComments, checkNewVideos, handleSubmission, todayReplies, formUrl };
}

module.exports = {
  createEngine, normalize, extractVideoId, parseVideoIds, splitList, splitVariants, render, newCode, isEmail, findCampaign, campaignApplies, quotaDay,
  ST, SUB, NV, DEFAULT_REPLY, DEFAULT_SUBJECT, DEFAULT_BODY, DEFAULT_ANNOUNCE,
};
