"use strict";
/* 나만의 유튜브 채널 AI 자비스 — 웹 플랫폼 서버
   누구나 가입 → 유튜브 링크·키워드·레퍼럴 링크 입력 → 키워드 댓글에 자동 대댓글(인증코드 + 신청 폼)
   → 구독자가 폼에 이메일 제출 → 레퍼럴 링크 메일 자동 발송. 새 영상도 자동으로 따라간다.

   GET  /login /signup            로그인 · 가입 (테스트 계정 admin / admin)
   GET  /dashboard                요약 · 빠른 시작(유튜브 링크 넣기) · 캠페인 목록 · 최근 활동
   GET  /campaigns/new  POST /campaigns            캠페인 만들기
   GET  /campaigns/:id  POST /campaigns/:id        캠페인 기록 · 수정  (/toggle, /delete)
   POST /run                      지금 댓글 확인하기
   GET  /demo                     가상 유튜브 (구글 연결 없이 전체 흐름 시험)
   GET  /emails                   보낸 메일
   GET  /settings                 유튜브 연결 · 운영 모드 · 메일 발송 방식 · 비밀번호
   GET  /auth/google?kind=youtube|gmail  → /auth/google/callback   구글 계정 연결
   GET  /admin                    가입자 · 사용량 (관리자)
   GET  /f/:slug?c=코드  POST /f/:slug              구독자용 신청 폼 (공개)
   GET  /healthz */
const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createDb } = require("./db");
const { hashPassword, verifyPassword, createCipher, randomToken, createRateLimiter } = require("./security");
const { createGoogle } = require("./google");
const { createLiveProvider, createDemoProvider } = require("./providers");
const { createMailer } = require("./mail");
const E = require("./engine");
const V = require("./views");

const SESSION_DAYS = 14;
const STYLE = fs.readFileSync(path.join(__dirname, "..", "public", "style.css"));

const defaultSettings = () => ({
  mode: "demo", testMode: true, intervalMin: 10, dailyLimit: 150, firstHours: 168,
  newVideoAuto: true, notifyEmail: "", mail: { provider: "outbox" },
});

function createApp(opts = {}) {
  const env = opts.env || process.env;
  const db = createDb(opts.dataFile === undefined ? path.join(__dirname, "..", "data", "db.json") : opts.dataFile);
  const data = db.data;
  if (!data.meta.secret) { data.meta.secret = randomToken(32); db.save(); }
  const cipher = createCipher(env.APP_SECRET || data.meta.secret);
  const fetchImpl = opts.fetchImpl || fetch;
  const google = createGoogle({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, fetchImpl });
  const mailer = createMailer({ db, cipher, google, fetchImpl });
  let port = Number(opts.port !== undefined ? opts.port : env.PORT || 3000);
  const baseUrl = () => (env.BASE_URL || data.meta.baseUrl || `http://localhost:${port}`).replace(/\/$/, "");
  const engine = E.createEngine({ db, mailer, baseUrl });
  const allowSignup = env.ALLOW_SIGNUP !== "false";
  const loginLimit = createRateLimiter(20, 10 * 60 * 1000);
  const formLimit = createRateLimiter(20, 10 * 60 * 1000);

  // 테스트 관리자 계정 (처음 실행할 때만)
  if (!data.users.length) {
    data.users.push({ id: db.id(), username: "admin", password: hashPassword("admin"), role: "admin", defaultPassword: true, createdAt: new Date().toISOString(), settings: defaultSettings(), state: {} });
    db.save();
  }

  // ── 사용자별 유튜브 제공자 ──
  function providerFor(user) {
    const tokens = user.google && cipher.decrypt(user.google.tokens);
    if (user.settings.mode === "live" && google.configured && tokens && user.youtube) {
      return createLiveProvider({
        fetchImpl: opts.youtubeFetch || fetchImpl,
        apiBase: opts.youtubeApiBase,
        getToken: () => google.accessToken(cipher.decrypt(user.google.tokens), next => { user.google.tokens = cipher.encrypt(next); db.save(); }),
      });
    }
    return createDemoProvider(db, user);
  }

  const running = new Set();
  async function runUser(user) {
    if (running.has(user.id)) return null;
    running.add(user.id);
    const provider = providerFor(user);
    let text;
    try {
      let newVideos = [];
      let nvError = "";
      try { newVideos = await engine.checkNewVideos(user, provider); } catch (e) { nvError = String(e.message || e); }
      const sum = await engine.checkComments(user, provider);
      const parts = [sum.testMode ? "[테스트모드]" : "", provider.kind === "demo" ? "[데모]" : "", `댓글 ${sum.scanned}개 확인`, `키워드 일치 ${sum.matched}`, `답글 ${sum.replied}`,
        sum.tested ? `테스트 기록 ${sum.tested}` : "", sum.skipped ? `중복 ${sum.skipped}` : "", sum.failed ? `실패 ${sum.failed}` : "",
        newVideos.length ? `새 영상 ${newVideos.length}개` : ""].filter(Boolean);
      text = parts.join(" · ") + (sum.stopReason ? ` · ${sum.stopReason}` : "") + (nvError ? ` · 새 영상 확인 오류: ${nvError}` : "");
    } catch (e) {
      text = `오류: ${String(e.message || e)}`;
    } finally {
      running.delete(user.id);
    }
    user.state = user.state || {};
    user.state.lastRun = { at: new Date().toISOString(), text };
    db.save();
    return text;
  }

  async function tick() {
    const now = Date.now();
    for (const user of data.users) {
      if (!data.campaigns.some(c => c.userId === user.id && c.active)) continue;
      const last = user.state && user.state.lastRun ? Date.parse(user.state.lastRun.at) : 0;
      if (now - last < (Number(user.settings.intervalMin) || 10) * 60 * 1000 - 5000) continue;
      await runUser(user);
    }
  }
  let timer = null;
  if (!opts.noScheduler) timer = setInterval(() => tick().catch(e => console.error("[자비스] 자동 확인 오류", e)), 30 * 1000);

  // ── HTTP 도우미 ──
  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, Object.assign({ "content-type": "text/html; charset=utf-8", "x-content-type-options": "nosniff", "referrer-policy": "same-origin", "x-frame-options": "DENY" }, headers));
    res.end(body);
  };
  const redirect = (res, to, headers = {}) => send(res, 303, "", Object.assign({ location: to }, headers));
  const parseCookies = req => Object.fromEntries(String(req.headers.cookie || "").split(";").map(s => s.trim().split("=")).filter(p => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]));
  const secureCookie = () => baseUrl().startsWith("https://");
  const sessionCookie = (token, maxAge) => `jsid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookie() ? "; Secure" : ""}`;
  const ipOf = req => String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on("data", c => { size += c.length; if (size > 256 * 1024) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
      req.on("end", () => resolve(Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString("utf8")))));
      req.on("error", reject);
    });
  }

  function getSession(req) {
    const token = parseCookies(req).jsid;
    const s = token && data.sessions[token];
    if (!s || s.exp < Date.now()) return null;
    const user = data.users.find(u => u.id === s.userId);
    return user ? { token, s, user } : null;
  }
  function startSession(res, user, to) {
    const token = randomToken();
    data.sessions[token] = { userId: user.id, csrf: randomToken(16), exp: Date.now() + SESSION_DAYS * 86400 * 1000 };
    for (const [k, v] of Object.entries(data.sessions)) if (v.exp < Date.now()) delete data.sessions[k];
    db.save();
    redirect(res, to, { "set-cookie": sessionCookie(token, SESSION_DAYS * 86400) });
  }
  const flash = (sess, type, text) => { sess.s.flash = { type, text }; db.save(); };
  const takeFlash = sess => { const f = sess.s.flash; if (f) { delete sess.s.flash; db.save(); } return f; };

  function campaignFromBody(b, existing) {
    const quick = b.quick === "1";
    const videos = E.parseVideoIds(b.videos);
    const c = Object.assign({}, existing || {}, {
      name: String(b.name || "").trim().slice(0, 60),
      active: quick ? true : b.active === "on",
      target: quick ? (String(b.videos || "").trim() ? "videos" : "channel") : (b.target === "channel" ? "channel" : "videos"),
      videos,
      keywords: E.splitList(b.keywords).slice(0, 20),
      exact: b.exact === "1",
      referralLink: String(b.referralLink || "").trim(),
    });
    if (quick) {
      Object.assign(c, { replyTemplate: E.DEFAULT_REPLY, mailSubject: E.DEFAULT_SUBJECT, mailBody: E.DEFAULT_BODY, announce: E.DEFAULT_ANNOUNCE, onePerPerson: true, onePerEmail: true });
    } else {
      Object.assign(c, {
        replyTemplate: String(b.replyTemplate || "").trim() || E.DEFAULT_REPLY,
        mailSubject: String(b.mailSubject || "").trim() || E.DEFAULT_SUBJECT,
        mailBody: String(b.mailBody || "").trim() || E.DEFAULT_BODY,
        announce: String(b.announce || "").trim(),
        onePerPerson: b.onePerPerson === "on",
        onePerEmail: b.onePerEmail === "on",
      });
    }
    let error = "";
    if (!c.name) error = "제휴사 이름을 입력하세요.";
    else if (!c.keywords.length) error = "반응할 키워드를 하나 이상 입력하세요.";
    else if (c.target === "videos" && !c.videos.length) error = "영상 링크를 확인하세요. (유튜브 영상 주소 또는 11자리 영상 ID)";
    else if (!/^https?:\/\/\S+$/.test(c.referralLink)) error = "레퍼럴 링크는 http:// 또는 https:// 로 시작해야 합니다.";
    else if (c.replyTemplate.includes(c.referralLink)) error = "대댓글 문구에 레퍼럴 링크를 넣지 마세요. 링크는 메일로만 보내야 새어 나가지 않습니다.";
    return { c, error };
  }

  const campaignStats = c => ({
    replies: data.replies.filter(r => r.campaignId === c.id && r.status === E.ST.REPLIED).length,
    subs: data.submissions.filter(s => s.campaignId === c.id).length,
    sent: data.submissions.filter(s => s.campaignId === c.id && (s.status === E.SUB.SENT || s.status === E.SUB.PREVIEW)).length,
  });

  function dashboardData(user) {
    const mineCamps = data.campaigns.filter(c => c.userId === user.id);
    const names = Object.fromEntries(mineCamps.map(c => [c.id, c.name]));
    const replies = data.replies.filter(r => r.userId === user.id);
    const subs = data.submissions.filter(s => s.userId === user.id);
    const recent = [
      ...replies.map(r => ({ at: r.at, kind: `댓글 · ${names[r.campaignId] || ""}`, text: `${r.author}: ${r.comment}`, status: r.status })),
      ...subs.map(s => ({ at: s.at, kind: `접수 · ${names[s.campaignId] || ""}`, text: s.email, status: s.status })),
      ...data.newVideos.filter(n => n.userId === user.id).map(n => ({ at: n.at, kind: "새 영상", text: n.title, status: n.status })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
    return {
      stats: {
        todayReplies: engine.todayReplies(user),
        replies: replies.filter(r => r.status === E.ST.REPLIED).length,
        submissions: subs.length,
        sent: subs.filter(s => s.status === E.SUB.SENT || s.status === E.SUB.PREVIEW).length,
        preview: subs.filter(s => s.status === E.SUB.PREVIEW).length,
      },
      campaigns: mineCamps.map(c => Object.assign({}, c, { stats: campaignStats(c) })),
      recent,
    };
  }

  // ── 라우팅 ──
  async function handle(req, res) {
    const url = new URL(req.url, "http://x");
    const p = url.pathname;
    const method = req.method;
    if (!env.BASE_URL && req.headers.host) {
      const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0];
      const b = `${proto}://${req.headers.host}`;
      // 서버 주소(신청 폼 링크에 쓰임)를 기억한다. 공개 주소가 한 번 잡히면 localhost 로 덮어쓰지 않는다
      const isLocal = /^http:\/\/(127\.0\.0\.1|localhost)/.test(b);
      if (!data.meta.baseUrl || (data.meta.baseUrl !== b && !isLocal)) { data.meta.baseUrl = b; db.save(); }
    }

    if (p === "/static/style.css") return send(res, 200, STYLE, { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=300" });
    if (p === "/healthz") return send(res, 200, "ok", { "content-type": "text/plain" });

    // 구독자용 신청 폼 (로그인 불필요)
    const fm = p.match(/^\/f\/([\w-]+)$/);
    if (fm) {
      const camp = data.campaigns.find(c => c.slug === fm[1]);
      const owner = camp && data.users.find(u => u.id === camp.userId);
      const channelTitle = owner ? (owner.youtube && owner.youtube.title) || owner.username : "";
      if (method === "GET") return send(res, camp ? 200 : 404, V.publicFormPage({ camp, channelTitle, code: url.searchParams.get("c") || "" }));
      if (method === "POST") {
        const b = await readBody(req);
        if (!formLimit(ipOf(req))) return send(res, 429, V.publicFormPage({ camp, channelTitle, code: b.code, email: b.email, result: { ok: false, message: "잠시 뒤 다시 시도해 주세요." } }));
        const result = await engine.handleSubmission({ slug: fm[1], email: b.email, code: b.code, consent: b.consent === "on" });
        return send(res, 200, V.publicFormPage({ camp, channelTitle, code: b.code, email: b.email, result }));
      }
    }

    const sess = getSession(req);

    if (p === "/" ) return redirect(res, sess ? "/dashboard" : "/login");
    if (p === "/login" || p === "/signup") {
      if (sess) return redirect(res, "/dashboard");
      const mode = p.slice(1);
      if (mode === "signup" && !allowSignup) return redirect(res, "/login");
      if (method === "GET") return send(res, 200, V.authPage({ mode, allowSignup }));
      const b = await readBody(req);
      const fail = msg => send(res, 400, V.authPage({ mode, allowSignup, error: msg }));
      if (!loginLimit(ipOf(req))) return fail("시도가 너무 많습니다. 10분 뒤 다시 시도하세요.");
      const username = String(b.username || "").trim().toLowerCase();
      if (mode === "login") {
        const user = data.users.find(u => u.username === username);
        if (!user || !verifyPassword(b.password, user.password)) return fail("아이디 또는 비밀번호가 맞지 않습니다.");
        return startSession(res, user, "/dashboard");
      }
      if (!/^[a-z0-9_.-]{3,30}$/.test(username)) return fail("아이디는 영문 소문자·숫자·_ . - 로 3~30자입니다.");
      if (data.users.some(u => u.username === username)) return fail("이미 있는 아이디입니다.");
      if (String(b.password || "").length < 8) return fail("비밀번호는 8자 이상으로 정해 주세요.");
      if (b.password !== b.password2) return fail("비밀번호 확인이 맞지 않습니다.");
      const user = { id: db.id(), username, password: hashPassword(b.password), role: "user", createdAt: new Date().toISOString(), settings: defaultSettings(), state: {} };
      data.users.push(user);
      db.save();
      return startSession(res, user, "/dashboard");
    }

    if (!sess) return redirect(res, "/login");
    const user = sess.user;
    const csrf = sess.s.csrf;
    let body = {};
    if (method === "POST") {
      body = await readBody(req);
      if (body._csrf !== csrf) return send(res, 403, "보안 확인에 실패했습니다. 페이지를 새로고침한 뒤 다시 시도하세요.", { "content-type": "text/plain; charset=utf-8" });
    }
    const providerKind = () => providerFor(user).kind;
    const page = (fn, extra) => send(res, 200, fn(Object.assign({ user, csrf, flash: takeFlash(sess), googleReady: google.configured, provider: providerKind() }, extra)));

    if (p === "/logout" && method === "POST") {
      delete data.sessions[sess.token];
      db.save();
      return redirect(res, "/login", { "set-cookie": sessionCookie("", 0) });
    }

    if (p === "/dashboard") {
      return page(V.dashboardPage, Object.assign(dashboardData(user), { formUrl: c => engine.formUrl(c) }));
    }

    if (p === "/run" && method === "POST") {
      const text = await runUser(user);
      flash(sess, text && text.startsWith("오류") ? "error" : "ok", text ? `확인 완료 — ${text}` : "이미 확인 중입니다. 잠시 뒤 다시 보세요.");
      return redirect(res, body.back === "/demo" ? "/demo" : "/dashboard");
    }

    if (p === "/campaigns/new") {
      const blank = { name: "", active: true, target: "channel", videos: [], keywords: [], exact: false, replyTemplate: E.DEFAULT_REPLY, referralLink: "", mailSubject: E.DEFAULT_SUBJECT, mailBody: E.DEFAULT_BODY, announce: E.DEFAULT_ANNOUNCE, onePerPerson: true, onePerEmail: true };
      return page(V.campaignPage, { camp: blank, isNew: true });
    }
    if (p === "/campaigns" && method === "POST") {
      const { c, error } = campaignFromBody(body);
      if (error) {
        if (body.quick === "1") { flash(sess, "error", error); return redirect(res, "/dashboard"); }
        return page(V.campaignPage, { camp: c, isNew: true, flash: { type: "error", text: error } });
      }
      Object.assign(c, { id: db.id(), userId: user.id, slug: randomToken(6), createdAt: new Date().toISOString() });
      data.campaigns.push(c);
      db.save();
      flash(sess, "ok", `"${c.name}" 캠페인을 만들었습니다. ${user.settings.intervalMin}분마다 자동으로 댓글을 확인합니다.`);
      return redirect(res, `/campaigns/${c.id}`);
    }
    const cm = p.match(/^\/campaigns\/([\w]+)(\/toggle|\/delete)?$/);
    if (cm) {
      const camp = data.campaigns.find(c => c.id === cm[1] && c.userId === user.id);
      if (!camp) return send(res, 404, "캠페인을 찾을 수 없습니다.", { "content-type": "text/plain; charset=utf-8" });
      if (method === "POST" && cm[2] === "/toggle") {
        camp.active = !camp.active;
        db.save();
        flash(sess, "ok", camp.active ? "다시 켰습니다." : "멈췄습니다.");
        return redirect(res, `/campaigns/${camp.id}`);
      }
      if (method === "POST" && cm[2] === "/delete") {
        data.campaigns.splice(data.campaigns.indexOf(camp), 1);
        db.save();
        flash(sess, "ok", `"${camp.name}" 캠페인을 삭제했습니다.`);
        return redirect(res, "/dashboard");
      }
      const view = extra => {
        const videoTitles = Object.fromEntries(data.demoVideos.filter(v => v.userId === user.id).map(v => [v.id, v.title]));
        return page(V.campaignPage, Object.assign({
          camp, formUrl: engine.formUrl(camp), videoTitles,
          replies: data.replies.filter(r => r.campaignId === camp.id).slice(-200).reverse(),
          subs: data.submissions.filter(s => s.campaignId === camp.id).slice(-200).reverse(),
        }, extra));
      };
      if (method === "POST") {
        const { c, error } = campaignFromBody(body, camp);
        if (error) return view({ flash: { type: "error", text: error } });
        Object.assign(camp, c);
        db.save();
        flash(sess, "ok", "저장했습니다. 다음 확인부터 바로 적용됩니다.");
        return redirect(res, `/campaigns/${camp.id}`);
      }
      return view();
    }

    if (p === "/demo") {
      return page(V.demoPage, {
        videos: data.demoVideos.filter(v => v.userId === user.id).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
        comments: data.demoComments.filter(c => c.userId === user.id),
      });
    }
    if (p === "/demo/videos" && method === "POST") {
      const title = String(body.title || "").trim().slice(0, 100) || "데모 영상";
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
      let vid = "";
      for (let i = 0; i < 11; i++) vid += chars[crypto.randomInt(chars.length)];
      data.demoVideos.push({ id: vid, userId: user.id, title, publishedAt: new Date().toISOString() });
      db.save();
      flash(sess, "ok", `가상 영상 "${title}"을 올렸습니다. 채널 전체 캠페인이 있으면 다음 확인 때 새 영상으로 감지됩니다.`);
      return redirect(res, "/demo");
    }
    if (p === "/demo/comments" && method === "POST") {
      const video = data.demoVideos.find(v => v.id === body.videoId && v.userId === user.id);
      const text = String(body.text || "").trim().slice(0, 1000);
      if (video && text) {
        const author = String(body.author || "").trim().slice(0, 40) || "@구독자";
        data.demoComments.push({ id: db.id(), userId: user.id, videoId: video.id, text, author, authorChannelId: `FAN_${Buffer.from(author).toString("hex").slice(0, 20)}`, publishedAt: new Date().toISOString() });
        db.save();
        flash(sess, "ok", "구독자 댓글을 달았습니다. \"자비스 지금 확인하기\"를 누르거나 자동 확인을 기다리세요.");
      }
      return redirect(res, "/demo");
    }

    if (p === "/emails") return page(V.emailsPage, { emails: data.emails.filter(e => e.userId === user.id).slice(-200).reverse() });

    if (p === "/settings" && method === "GET") return page(V.settingsPage);
    if (p === "/settings" && method === "POST") {
      const s = user.settings;
      s.mode = body.mode === "live" ? "live" : "demo";
      s.testMode = body.testMode === "on";
      s.intervalMin = [1, 5, 10, 15, 30].includes(Number(body.intervalMin)) ? Number(body.intervalMin) : 10;
      s.dailyLimit = Math.min(190, Math.max(1, Number(body.dailyLimit) || 150));
      s.firstHours = Math.min(720, Math.max(1, Number(body.firstHours) || 168));
      s.newVideoAuto = body.newVideoAuto === "on";
      s.notifyEmail = E.isEmail(body.notifyEmail) ? body.notifyEmail.trim() : "";
      s.mail = Object.assign({}, s.mail, {
        provider: ["outbox", "resend", "gmail"].includes(body.mailProvider) ? body.mailProvider : "outbox",
        senderName: String(body.senderName || "").trim().slice(0, 40),
        replyTo: E.isEmail(body.replyTo) ? body.replyTo.trim() : "",
        from: E.isEmail(body.mailFrom) ? body.mailFrom.trim() : "",
      });
      if (body.resendKey) s.mail.resendKey = cipher.encrypt(String(body.resendKey).trim());
      db.save();
      const warn = s.mode === "live" && !(user.youtube && google.configured) ? " 실제 유튜브 모드는 채널을 연결해야 동작합니다 (그 전까지는 데모로 동작)." : "";
      flash(sess, warn ? "error" : "ok", `설정을 저장했습니다.${warn}`);
      return redirect(res, "/settings");
    }
    if (p === "/settings/password" && method === "POST") {
      if (!verifyPassword(body.current, user.password)) { flash(sess, "error", "지금 비밀번호가 맞지 않습니다."); return redirect(res, "/settings#password"); }
      if (String(body.next || "").length < 8) { flash(sess, "error", "새 비밀번호는 8자 이상이어야 합니다."); return redirect(res, "/settings#password"); }
      user.password = hashPassword(body.next);
      delete user.defaultPassword;
      for (const [k, v] of Object.entries(data.sessions)) if (v.userId === user.id && k !== sess.token) delete data.sessions[k];
      db.save();
      flash(sess, "ok", "비밀번호를 바꿨습니다.");
      return redirect(res, "/settings");
    }

    // 구글 연결
    if (p === "/auth/google" && method === "GET") {
      if (!google.configured) { flash(sess, "error", "서버에 구글 연결 정보가 없습니다 (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)."); return redirect(res, "/settings"); }
      const kind = url.searchParams.get("kind") === "gmail" ? "gmail" : "youtube";
      sess.s.oauth = { state: randomToken(16), kind };
      db.save();
      return redirect(res, google.authUrl({ redirectUri: `${baseUrl()}/auth/google/callback`, state: sess.s.oauth.state, kind }));
    }
    if (p === "/auth/google/callback") {
      const o = sess.s.oauth;
      delete sess.s.oauth;
      if (!o || url.searchParams.get("state") !== o.state) { flash(sess, "error", "구글 연결이 만료되었습니다. 다시 시도하세요."); return redirect(res, "/settings"); }
      if (url.searchParams.get("error")) { flash(sess, "error", "구글 연결을 취소했습니다."); return redirect(res, "/settings"); }
      try {
        const t = await google.exchangeCode({ code: url.searchParams.get("code"), redirectUri: `${baseUrl()}/auth/google/callback` });
        const old = (user.google && cipher.decrypt(user.google.tokens)) || {};
        const merged = Object.assign({}, old, t, { refresh: t.refresh || old.refresh, scope: [old.scope, t.scope].filter(Boolean).join(" ") });
        user.google = Object.assign({}, user.google, { tokens: cipher.encrypt(merged) });
        if (o.kind === "youtube") {
          const ch = await createLiveProvider({ fetchImpl: opts.youtubeFetch || fetchImpl, apiBase: opts.youtubeApiBase, getToken: async () => t.access }).myChannel();
          user.youtube = { id: ch.id, title: ch.title };
          user.settings.mode = "live";
          user.state = Object.assign({}, user.state, { newSince_live: Date.now() });
          flash(sess, "ok", `유튜브 채널 "${ch.title}"을 연결했습니다. 처음에는 테스트모드로 결과를 확인한 뒤 끄세요.`);
        } else {
          const r = await fetchImpl("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${t.access}` } });
          const info = await r.json().catch(() => ({}));
          Object.assign(user.google, { gmail: true, email: info.email || "" });
          user.settings.mail = Object.assign({}, user.settings.mail, { provider: "gmail" });
          flash(sess, "ok", `Gmail(${info.email || ""}) 발송을 연결했습니다.`);
        }
        db.save();
      } catch (e) {
        flash(sess, "error", String(e.message || e));
      }
      return redirect(res, "/settings");
    }
    if (p === "/auth/google/disconnect" && method === "POST") {
      delete user.google;
      delete user.youtube;
      user.settings.mode = "demo";
      if (user.settings.mail.provider === "gmail") user.settings.mail.provider = "outbox";
      db.save();
      flash(sess, "ok", "구글 연결을 끊었습니다. 데모 모드로 바뀌었습니다.");
      return redirect(res, "/settings");
    }

    if (p === "/admin" && user.role === "admin") {
      const users = data.users.map(u => ({
        username: u.username, role: u.role, mode: providerFor(u).kind === "live" ? "실제 유튜브" : "데모", channel: u.youtube && u.youtube.title, createdAt: u.createdAt,
        campaigns: data.campaigns.filter(c => c.userId === u.id).length,
        replies: data.replies.filter(r => r.userId === u.id && r.status === E.ST.REPLIED).length,
        sent: data.submissions.filter(s => s.userId === u.id && (s.status === E.SUB.SENT || s.status === E.SUB.PREVIEW)).length,
      }));
      return page(V.adminPage, { users });
    }

    return send(res, 404, "페이지를 찾을 수 없습니다.", { "content-type": "text/plain; charset=utf-8" });
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch(e => {
      console.error(e);
      if (!res.headersSent) send(res, 500, "잠시 문제가 생겼습니다. 다시 시도해 주세요.", { "content-type": "text/plain; charset=utf-8" });
    });
  });

  return {
    server, db, engine, runUser, tick,
    listen(cb) { server.listen(port, () => { port = server.address().port; if (cb) cb(port); }); return server; },
    close() { clearInterval(timer); db.flush(); return new Promise(r => server.close(r)); },
  };
}

if (require.main === module) {
  const app = createApp();
  app.listen(port => console.log(`[자비스] http://localhost:${port} 에서 실행 중 (테스트 계정 admin / admin)`));
  const stop = () => app.close().then(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

module.exports = { createApp };
