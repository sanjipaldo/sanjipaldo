/* 두고 클래스 — 강사 홍보 랜딩페이지 (#/p/<강사 id>)
 *
 *  - 로그인 없이 누구나 보는 강사 소개 · 강의 판매 페이지
 *  - 배경은 모든 강사 공통 흰색, 버튼·강조만 강사가 고른 색
 *  - 내용은 강사센터 ‘홍보 랜딩페이지’에서 고친다 (DB.landingOf)
 */
(function () {
  "use strict";

  const root = document.getElementById("root");
  const { esc } = DB;
  const { fmtMD, fmtFull, todayStr, diffDays } = DB.date;
  const icon = window.icon;
  const isActive = () => document.body.dataset.mode === "landing";
  const isExt = (u) => /^https?:\/\//i.test(u || "");
  const linkAttrs = (u) => (isExt(u) ? ' target="_blank" rel="noopener"' : "");
  const nl = (t) => esc(t || "").replace(/\n/g, "<br>");

  function insIdFromHash() { return (location.hash.replace(/^#\/?(p|free)\/?/, "").split(/[/?]/)[0] || "").trim(); }

  // 신청 버튼: 강사가 결제 페이지 주소를 넣었으면 그곳으로, 아니면 이 플랫폼의 수강 신청 창으로
  const applyHref = (url, id) => url || "#/login?ins=" + encodeURIComponent(id) + "&signup=1";

  function headline(text) {
    const lines = String(text || "").split("\n").filter(Boolean);
    return lines.map((l, i) => (i === lines.length - 1 && lines.length > 1 ? '<span class="lp-mark">' + esc(l) + "</span>" : esc(l))).join("<br>");
  }

  function recruiting(id) {
    const cos = DB.cohortsOf(id).filter((c) => c.recruiting && DB.cohortStatus(c) !== "ended");
    return cos.find((c) => DB.cohortStatus(c) === "upcoming") || cos[0] || null;
  }
  function cohortBadge(co) {
    if (!co) return "";
    const d = diffDays(co.startDate, todayStr());
    return '<span class="lp-cohort">' + '<i class="lp-dot"></i>' + esc(co.name) + " 모집 중 · " + fmtMD(co.startDate) + " 시작" + (d > 0 ? " · D-" + d : d === 0 ? " · 오늘 시작" : "") + "</span>";
  }

  /* ---------- 섹션 ---------- */
  const S = {};
  S.hero = (L, c, ins, co) => {
    const h = L.hero;
    const art = h.image
      ? '<img class="lp-hero-img" src="' + esc(h.image) + '" alt="">'
      : '<div class="lp-mock" aria-hidden="true"><div class="lp-mock-top">' + window.logoMark() + "<b>" + esc(c.brand.courseTitle) + '</b></div>' +
          '<div class="lp-mock-card"><small>전체 진행률</small><b>68%</b><span class="lp-bar"><i style="width:68%"></i></span></div>' +
          '<ul class="lp-mock-list">' + (c.weeks.slice(0, 4).map((w, i) => '<li class="' + (i < 2 ? "done" : i === 2 ? "now" : "") + '"><span>' + (i < 2 ? icon("check", "xs") : w.no) + "</span>" + esc(w.no + "주차 · " + w.title) + "</li>").join("")) + "</ul>" +
          '<div class="lp-mock-bot">' + icon("sparkles", "sm") + esc(c.brand.botName) + "</div></div>";
    return '<section class="lp-hero" id="top"><div class="lp-wrap lp-hero-grid"><div class="lp-hero-txt">' +
      (h.eyebrow ? '<p class="lp-eyebrow">' + esc(h.eyebrow) + "</p>" : "") +
      "<h1>" + headline(h.title) + "</h1>" +
      (h.sub ? '<p class="lp-sub">' + nl(h.sub) + "</p>" : "") +
      '<div class="lp-actions"><a class="lp-btn lp-btn-primary lp-btn-lg" href="' + esc(applyHref(h.ctaUrl, ins.id)) + '"' + linkAttrs(h.ctaUrl) + ">" + esc(h.ctaLabel || "수강 신청하기") + icon("arrowRight", "sm") + "</a>" +
        '<a class="lp-btn lp-btn-ghost lp-btn-lg" href="#lp-curriculum" data-lp-scroll="lp-curriculum">커리큘럼 보기</a></div>' +
      cohortBadge(co) +
      '</div><div class="lp-hero-art">' + art + "</div></div></section>";
  };
  S.stats = (L, c) => {
    const lessons = c.weeks.reduce((a, w) => a + w.lessons.length, 0), missions = c.weeks.reduce((a, w) => a + w.missions.length, 0);
    const items = (L.stats || []).filter((x) => x.value).length ? L.stats.filter((x) => x.value)
      : [{ value: c.weeks.length + "주", label: "완성 커리큘럼" }, { value: lessons + "개", label: "강의 영상" }, { value: missions + "개", label: "실습 과제" }, { value: "24시", label: "AI봇 질문 답변" }];
    return '<section class="lp-stats"><div class="lp-wrap lp-stats-grid">' + items.map((x) => '<div><b>' + esc(x.value) + "</b><span>" + esc(x.label) + "</span></div>").join("") + "</div></section>";
  };
  S.about = (L) => {
    const a = L.about;
    if (!a.body && !(a.career || []).length && !a.photo) return "";
    return '<section class="lp-sec" id="lp-about"><div class="lp-wrap lp-about">' +
      '<div class="lp-about-photo">' + (a.photo ? '<img src="' + esc(a.photo) + '" alt="' + esc(a.name) + '">' : '<span class="lp-avatar">' + esc((a.name || "강").slice(0, 1)) + "</span>") + "</div>" +
      '<div><p class="lp-kicker">' + esc(a.title || "강사 소개") + "</p><h2>" + esc(a.name) + "</h2>" + (a.role ? '<p class="lp-role">' + esc(a.role) + "</p>" : "") +
        (a.body ? '<p class="lp-body">' + nl(a.body) + "</p>" : "") +
        ((a.career || []).length ? '<ul class="lp-career">' + a.career.map((x) => "<li>" + icon("check", "sm") + esc(x) + "</li>").join("") + "</ul>" : "") +
      "</div></div></section>";
  };
  S.points = (L) => {
    const p = L.points, items = (p.items || []).filter((x) => x.title);
    if (!items.length && !(p.forWho || []).length) return "";
    return '<section class="lp-sec lp-tint"><div class="lp-wrap">' +
      (items.length ? '<p class="lp-kicker">WHAT YOU GET</p><h2>' + esc(p.title) + '</h2><div class="lp-points">' + items.map((x, i) => '<article><span class="lp-num">' + String(i + 1).padStart(2, "0") + "</span><h3>" + esc(x.title) + "</h3>" + (x.desc ? "<p>" + nl(x.desc) + "</p>" : "") + "</article>").join("") + "</div>" : "") +
      ((p.forWho || []).length ? '<div class="lp-forwho"><h3>이런 분께 추천해요</h3><ul>' + p.forWho.map((x) => "<li>" + icon("check", "sm") + esc(x) + "</li>").join("") + "</ul></div>" : "") +
      "</div></section>";
  };
  S.curriculum = (L, c) => {
    if (!c.weeks.length) return "";
    return '<section class="lp-sec" id="lp-curriculum"><div class="lp-wrap"><p class="lp-kicker">CURRICULUM</p><h2>' + esc(L.curriculum.title) + "</h2>" + (L.curriculum.sub ? '<p class="lp-lead">' + esc(L.curriculum.sub) + "</p>" : "") +
      '<ol class="lp-weeks">' + c.weeks.map((w) => '<li><details' + (w.no === 1 ? " open" : "") + '><summary><span class="lp-wk">' + w.no + "주차</span><b>" + esc(w.title) + "</b><small>강의 " + w.lessons.length + " · 과제 " + w.missions.length + "</small>" + icon("chevDown", "sm") + "</summary>" +
        (w.summary ? '<p class="lp-wk-sum">' + esc(w.summary) + "</p>" : "") +
        (w.lessons.length ? '<ul class="lp-lessons">' + w.lessons.map((l) => "<li>" + icon("circlePlay", "sm") + esc(l.title) + (l.minutes ? "<small>" + esc(l.minutes) + "분</small>" : "") + "</li>").join("") + "</ul>" : "") +
        "</details></li>").join("") + "</ol></div></section>";
  };
  S.platform = (L, c, ins) => {
    const P = L.platform;
    const feats = [["checks", "과제 제출 · 자동 검수", "사진·링크·글로 과제를 내면 바로 결과가 나와요"], ["calendar", "강의 일정", "강의 오픈·과제 마감·라이브가 달력에"], ["library", "자료실", "전자책·자료 파일·VOD를 한 곳에"], ["sparkles", "24시 AI봇", "밤에도 바로 물어보고 답을 받아요"], ["award", "수료증", "필수 과제를 마치면 바로 발급"], ["help", "Q&A · 요청사항", "막히면 강사에게 직접 남겨요"]];
    return '<section class="lp-sec lp-dark"><div class="lp-wrap"><p class="lp-kicker">STUDENT PLATFORM</p><h2>' + esc(P.title) + "</h2>" + (P.sub ? '<p class="lp-lead">' + esc(P.sub) + "</p>" : "") +
      '<div class="lp-feats">' + feats.map((f) => '<div><span class="lp-feat-ic">' + icon(f[0]) + "</span><b>" + f[1] + "</b><small>" + f[2] + "</small></div>").join("") + "</div>" +
      '<p class="lp-dark-foot">이미 수강 중이신가요? <a href="#/login?ins=' + esc(ins.id) + '">수강생 로그인 ' + icon("arrowRight", "xs") + "</a></p></div></section>";
  };
  S.reviews = (L) => {
    const items = (L.reviews.items || []).filter((x) => x.text);
    if (!items.length) return "";
    return '<section class="lp-sec lp-tint" id="lp-reviews"><div class="lp-wrap"><p class="lp-kicker">REVIEWS</p><h2>' + esc(L.reviews.title) + '</h2><div class="lp-reviews">' +
      items.map((x) => '<figure>' + (x.sample ? '<span class="lp-sample">예시 후기</span>' : "") + '<blockquote>“' + nl(x.text) + '”</blockquote><figcaption><span class="lp-avatar sm">' + esc((x.name || "수").slice(0, 1)) + "</span><b>" + esc(x.name || "수강생") + "</b>" + (x.meta ? "<small>" + esc(x.meta) + "</small>" : "") + "</figcaption></figure>").join("") +
      "</div></div></section>";
  };
  S.pricing = (L, c, ins, co) => {
    const p = L.pricing;
    return '<section class="lp-sec" id="lp-pricing"><div class="lp-wrap lp-price-wrap"><div><p class="lp-kicker">ENROLL</p><h2>' + esc(p.title) + "</h2>" +
        (co ? '<ul class="lp-sched"><li><span>모집 기수</span><b>' + esc(co.name) + "</b></li><li><span>수업 기간</span><b>" + fmtFull(co.startDate) + " ~ " + fmtFull(DB.cohortEnd(co)) + "</b></li><li><span>진행 방식</span><b>" + esc(p.period || "온라인 · 주차별 강의 + 과제") + "</b></li></ul>" : '<p class="lp-lead">다음 기수 모집 일정은 곧 안내해 드려요.</p>') +
      "</div>" +
      '<div class="lp-price-card">' +
        (p.price ? '<div class="lp-price">' + (p.original ? "<s>" + esc(p.original) + "</s>" : "") + "<b>" + esc(p.price) + "</b></div>" : '<div class="lp-price"><b class="sm">' + esc(c.brand.courseTitle) + "</b></div>") +
        ((p.includes || []).length ? '<ul class="lp-incl">' + p.includes.map((x) => "<li>" + icon("check", "sm") + esc(x) + "</li>").join("") + "</ul>" : "") +
        '<a class="lp-btn lp-btn-primary lp-btn-lg lp-btn-block" href="' + esc(applyHref(p.ctaUrl, ins.id)) + '"' + linkAttrs(p.ctaUrl) + ">" + esc(p.ctaLabel || "수강 신청하기") + "</a>" +
        (p.note ? '<p class="lp-note">' + nl(p.note) + "</p>" : "") +
      "</div></div></section>";
  };
  S.faq = (L, c) => {
    const items = (L.faq.items || []).filter((x) => x.q).length ? L.faq.items.filter((x) => x.q) : c.faqs.slice(0, 6);
    if (!items.length) return "";
    return '<section class="lp-sec lp-tint" id="lp-faq"><div class="lp-wrap lp-narrow"><p class="lp-kicker">FAQ</p><h2>' + esc(L.faq.title) + '</h2><div class="lp-faq">' +
      items.map((f) => '<details><summary>' + esc(f.q) + icon("chevDown", "sm") + "</summary><p>" + nl(f.a) + "</p></details>").join("") + "</div></div></section>";
  };
  S.cta = (L, c, ins, co) => {
    const x = L.cta;
    return '<section class="lp-cta"><div class="lp-wrap"><h2>' + esc(x.title) + "</h2>" + (x.sub ? "<p>" + esc(x.sub) + "</p>" : "") +
      '<a class="lp-btn lp-btn-dark lp-btn-lg" href="' + esc(applyHref(x.url, ins.id)) + '"' + linkAttrs(x.url) + ">" + esc(x.label || "수강 신청하기") + icon("arrowRight", "sm") + "</a>" + (co ? '<div class="lp-cta-co">' + cohortBadge(co) + "</div>" : "") + "</div></section>";
  };

  function footer(L, c, ins) {
    const ct = L.contact || {};
    const links = [[ct.kakao, "message", "카카오톡 문의"], [ct.youtube, "circlePlay", "유튜브"], [ct.instagram, "image", "인스타그램"], [ct.email ? "mailto:" + ct.email : "", "message", ct.email], [ct.phone ? "tel:" + ct.phone : "", "user", ct.phone]].filter((x) => x[0]);
    return '<footer class="lp-foot"><div class="lp-wrap"><div class="lp-foot-top"><span class="lp-brand">' + window.logoMark() + "<b>" + esc(c.brand.name) + "</b></span>" +
      (links.length ? '<div class="lp-foot-links">' + links.map((x) => '<a href="' + esc(x[0]) + '"' + linkAttrs(x[0]) + ">" + icon(x[1], "sm") + esc(x[2]) + "</a>").join("") + "</div>" : "") + "</div>" +
      '<div class="lp-foot-bottom"><span>© 2026 ' + esc(ct.company || c.brand.name) + "</span>" + window.poweredBy("white") +
      '<span><a href="#/login?ins=' + esc(ins.id) + '">수강생 로그인</a> · <a href="#/center">강사센터</a></span></div></div></footer>';
  }

  function renderPage(id) {
    const ins = DB.instructor(id);
    const L = ins && ins.status === "active" ? DB.landingOf(id) : null;
    const adm = DB.session.admin();
    const canSee = adm && (adm.role === "master" || adm.instructorId === id);
    if (!L || (!L.published && !canSee)) {
      document.title = "두고 클래스";
      root.innerHTML = '<main class="lp lp-empty"><div>' + window.logoMark() + "<h1>준비 중인 페이지예요</h1><p>곧 강의 소개가 올라와요.</p><a class=\"lp-btn lp-btn-ghost\" href=\"#/p\">다른 강의 보기</a></div></main>";
      return;
    }
    const co = recruiting(id);
    // 커리큘럼·숫자는 모집 중인 기수가 쓰는 커리큘럼 기준
    const c = Object.assign({}, DB.content(id), co ? { weeks: DB.weeksOf(co) } : {}), t = DB.themeOf(c.brand.theme);
    document.title = c.brand.courseTitle + " · " + c.brand.name;
    const tv = t.vars || {};
    const vars = "--logo-accent:" + (t.accent || t.primary) + ";--lp-p:" + t.primary + ";--lp-pa:" + t.active + ";--lp-on:" + (t.onPrimary || t.deep) + ";--lp-pd:" + t.deep + ";--lp-pale:" + t.pale + ";--lp-rgb:" + t.rgb + ";--lp-ac:" + (t.accent || t.primary) + ";--lp-soft:" + (tv["--canvas-soft"] || "#e8ebe6") + ";--lp-ink:" + (tv["--ink"] || "#0e0f0c");
    const sections = L.order.filter((k) => !L.off[k] && S[k]).map((k) => S[k](L, c, ins, co)).join("");
    const navs = [["lp-about", "강사 소개", !L.off.about && (L.about.body || L.about.photo)], ["lp-curriculum", "커리큘럼", !L.off.curriculum], ["lp-reviews", "후기", !L.off.reviews && (L.reviews.items || []).some((x) => x.text)], ["lp-pricing", "수강 안내", !L.off.pricing], ["lp-faq", "FAQ", !L.off.faq]].filter((x) => x[2]);
    const href = applyHref(L.hero.ctaUrl, id);
    root.innerHTML = '<div class="lp" style="' + vars + '">' +
      (!L.published ? '<div class="lp-draft">' + icon("eyeOff", "sm") + "비공개 상태예요. 강사센터 ‘홍보 랜딩페이지’에서 공개로 바꾸면 누구나 볼 수 있어요.</div>" : "") +
      '<header class="lp-nav"><div class="lp-wrap lp-nav-in"><a class="lp-brand" href="#/p/' + esc(id) + '" data-lp-scroll="top">' + window.logoMark() + "<b>" + esc(c.brand.name) + "</b></a>" +
        '<nav class="lp-links">' + navs.map((n) => '<a href="#' + n[0] + '" data-lp-scroll="' + n[0] + '">' + n[1] + "</a>").join("") + "</nav>" +
        '<div class="lp-nav-r"><a class="lp-btn lp-btn-text" href="#/login?ins=' + esc(id) + '">수강생 로그인</a><a class="lp-btn lp-btn-primary" href="' + esc(href) + '"' + linkAttrs(L.hero.ctaUrl) + ">신청하기</a></div></div></header>" +
      "<main>" + sections + "</main>" + footer(L, c, ins) +
      '<div class="lp-sticky"><div>' + (co ? "<b>" + esc(co.name) + " 모집 중</b><small>" + fmtMD(co.startDate) + " 시작</small>" : "<b>" + esc(c.brand.courseTitle) + "</b>") + '</div><a class="lp-btn lp-btn-primary" href="' + esc(href) + '"' + linkAttrs(L.hero.ctaUrl) + ">신청하기</a></div>" +
      "</div>";
  }

  // #/p — 공개된 강사 랜딩페이지 모음
  function renderIndex() {
    const list = DB.activeInstructors().filter((x) => { const L = DB.landingOf(x.id); return L && L.published; });
    document.title = "강의 둘러보기 · 두고 클래스";
    root.innerHTML = '<div class="lp"><header class="lp-nav"><div class="lp-wrap lp-nav-in"><span class="lp-brand">' + window.logoMark() + '<b>DOOGO CLASS</b></span><div class="lp-nav-r"><a class="lp-btn lp-btn-text" href="#/login">수강생 로그인</a></div></div></header>' +
      '<main class="lp-sec"><div class="lp-wrap"><p class="lp-kicker">CLASSES</p><h2>강의 둘러보기</h2><div class="lp-index">' +
      list.map((x) => { const c = DB.content(x.id), t = DB.themeOf(c.brand.theme), co = recruiting(x.id); return '<a class="lp-index-card" href="#/p/' + x.id + '" style="--logo-accent:' + (t.accent || t.primary) + ";--lp-p:" + t.primary + ";--lp-on:" + (t.onPrimary || t.deep) + '"><span class="lp-index-top">' + window.logoMark() + "<b>" + esc(x.displayName) + "</b></span><h3>" + esc(c.brand.courseTitle) + "</h3><p>" + esc(c.brand.tagline || "") + "</p>" + (co ? cohortBadge(co) : "") + "</a>"; }).join("") +
      "</div></div></main></div>";
  }

  /* ================= 무료강의 페이지 (#/free/<강사 id>) — doogo.site 와 같은 화면 ================= */
  const DOWK = ["일", "월", "화", "수", "목", "금", "토"];
  const DOWL = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const pad = (n) => String(n).padStart(2, "0");
  const at = (v) => { if (!v) return NaN; const d = new Date(/T/.test(v) ? v : v + "T00:00"); return d.getTime(); };
  const ampm = (d) => (d.getHours() < 12 ? "오전 " : "오후 ") + ((d.getHours() % 12) || 12) + "시";
  const shortWhen = (v) => { const d = new Date(at(v)); return isNaN(d) ? "" : (d.getMonth() + 1) + "월 " + d.getDate() + " (" + DOWK[d.getDay()] + ") " + ampm(d) + " " + d.getMinutes() + "분"; };
  const longWhen = (v) => { const d = new Date(at(v)); return isNaN(d) ? "" : d.getFullYear() + "년 " + (d.getMonth() + 1) + "월 " + d.getDate() + "일 " + DOWL[d.getDay()] + " " + ampm(d) + " " + pad(d.getMinutes()) + "분"; };
  const lockWhen = (v) => { const d = new Date(at(v)); return isNaN(d) ? "공개일 확인 필요" : d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + (d.getHours() < 12 ? "오전" : "오후") + " " + ((d.getHours() % 12) || 12) + ":" + pad(d.getMinutes()); };
  const dayLabel = (v, now) => { const n = Math.max(0, at(v) - now); return n <= 0 || Math.floor(n / 864e5) <= 0 ? "D-DAY" : "D-" + Math.floor(n / 864e5); };
  const leftLabel = (v, now) => { const n = Math.max(0, at(v) - now); return n <= 0 ? "공개됨" : "공개까지 " + Math.floor(n / 864e5) + "일 " + Math.floor(n % 864e5 / 36e5) + "시간 남음"; };
  const giftOpen = (g, now) => !!g.forceOpen || (g.openAt && now >= at(g.openAt));
  const ACCENT = { blue: "blue", teal: "cyan", cyan: "cyan", gold: "ice", ice: "ice" };
  const SV = (d, w) => '<svg viewBox="0 0 24 24" width="' + (w || 20) + '" height="' + (w || 20) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  const IC = {
    msg: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>', lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    unlock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>', down: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
    cal: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>',
    check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>', ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>', play: '<polygon points="6 3 20 12 6 21 6 3" fill="currentColor"/>', chev: '<path d="m6 9 6 6 6-6"/>'
  };
  const ytEmbed = (u) => { const y = DB.youtubeId(u); if (!y) return ""; const m = String(u).match(/[?&](?:t|start)=(\d+)/); return "https://www.youtube.com/embed/" + y + "?rel=0&playsinline=1" + (m ? "&start=" + m[1] : ""); };
  let tick = null, vIdx = 1;
  function countdownParts(v) { const n = Math.max(0, at(v) - Date.now()); return n <= 0 ? { d: 0, h: 0, m: 0, s: 0, expired: true } : { d: Math.floor(n / 864e5), h: Math.floor(n % 864e5 / 36e5), m: Math.floor(n % 36e5 / 6e4), s: Math.floor(n % 6e4 / 1e3), expired: false }; }
  function updateCountdown() {
    const box = document.getElementById("fc-count");
    if (!box || !isActive()) { clearInterval(tick); tick = null; return; }
    const c = countdownParts(box.dataset.at);
    [["d", c.d], ["h", c.h], ["m", c.m], ["s", c.s]].forEach((x) => { const el = box.querySelector('[data-u="' + x[0] + '"]'); if (el) el.textContent = pad(x[1]); });
    const st = box.querySelector(".countdown-eyebrow strong"); if (st) st.textContent = c.expired ? "LIVE" : "D-" + Math.max(0, Math.ceil((at(box.dataset.at) - Date.now()) / 864e5));
    // 날짜가 된 전자책은 새로고침 없이 바로 열린다
    const now = Date.now();
    document.querySelectorAll(".gift-card[data-open-at]").forEach((g) => { if (!g.classList.contains("is-unlocked") && now >= at(g.dataset.openAt)) renderFree(insIdFromHash()); });
  }
  const FC = {};
  FC.countdown = (F) => {
    const c = countdownParts(F.liveAt);
    return '<section class="countdown-card" id="fc-count" data-at="' + esc(F.liveAt) + '" aria-label="강의 시작 카운트다운"><p class="countdown-eyebrow">강의 시작까지 <strong>' + (c.expired ? "LIVE" : "D-" + Math.ceil((at(F.liveAt) - Date.now()) / 864e5)) + "</strong></p>" +
      '<div class="countdown-grid">' + [["d", "일", c.d], ["h", "시간", c.h], ["m", "분", c.m], ["s", "초", c.s]].map((u, i) => '<div class="countdown-unit-wrap"><div class="countdown-unit"><strong data-u="' + u[0] + '">' + pad(u[2]) + "</strong><span>" + u[1] + "</span></div>" + (i < 3 ? '<span class="countdown-colon" aria-hidden="true">:</span>' : "") + "</div>").join("") + "</div>" +
      '<p class="event-date"><span aria-hidden="true"></span>' + esc(shortWhen(F.liveAt)) + " 강의 시작</p></section>";
  };
  FC.videos = (F) => {
    const v = F.videos, items = (v.items || []).filter((x) => DB.youtubeId(x.youtube));
    if (!items.length || countdownParts(F.liveAt).expired) return "";
    if (vIdx >= items.length) vIdx = items.length > 1 ? 1 : 0;
    const left = (vIdx - 1 + items.length) % items.length;
    return '<section class="youtube-showcase" aria-labelledby="youtube-showcase-title"><div class="youtube-heading"><span>' + esc(v.kicker) + '</span><h2 id="youtube-showcase-title">' + esc(v.title) + "</h2>" + (v.desc ? "<p>" + esc(v.desc) + "</p>" : "") + "</div>" +
      '<div class="video-carousel"><button class="carousel-control carousel-control--previous" type="button" data-fc="v-prev" aria-label="이전 영상 보기">' + SV(IC.left, 24) + "</button>" +
      '<div class="video-stage">' + items.map((x, i) => { const pos = i === vIdx ? "active" : i === left ? "left" : "right"; return '<article class="video-slide video-slide--' + pos + '"><div class="video-frame">' +
          (pos === "active" ? '<iframe src="' + esc(ytEmbed(x.youtube)) + '" title="' + esc(x.title) + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>' : '<img src="https://i.ytimg.com/vi/' + esc(DB.youtubeId(x.youtube)) + '/hqdefault.jpg" alt="" style="width:100%;height:100%;object-fit:cover;display:block">') +
          (pos !== "active" ? '<button class="video-select-overlay" type="button" data-fc="v-go" data-i="' + i + '" aria-label="' + esc(x.title) + ' 영상 가운데로 가져오기">' + SV(IC.play, 22) + "</button>" : "") +
          '</div><div class="video-meta"><span>' + esc(x.channel || "YouTube") + "</span><strong>" + esc(x.title) + "</strong></div></article>"; }).join("") + "</div>" +
      '<button class="carousel-control carousel-control--next" type="button" data-fc="v-next" aria-label="다음 영상 보기">' + SV(IC.right, 24) + "</button></div>" +
      '<div class="carousel-pagination" aria-label="영상 선택">' + items.map((x, i) => '<button type="button" class="' + (i === vIdx ? "is-active" : "") + '" data-fc="v-go" data-i="' + i + '" aria-label="' + (i + 1) + '번째 영상 보기"></button>').join("") + "</div>" +
      '<a class="fc-yt-out" href="https://www.youtube.com/watch?v=' + esc(DB.youtubeId(items[vIdx].youtube)) + '" target="_blank" rel="noopener">재생이 안 되면 유튜브에서 보기 ↗</a></section>';
  };
  FC.question = (F) => { const q = F.question; return '<section class="question-cta"><span class="micro-badge"><i aria-hidden="true"></i>' + esc(q.badge) + "</span><h2>" + esc(q.title) + "</h2>" + (q.desc ? "<p>" + nl(q.desc) + "</p>" : "") +
      (q.url ? '<a class="primary-cta" href="' + esc(q.url) + '" target="_blank" rel="noreferrer">' : '<a class="primary-cta" href="#" data-fc="question">') + SV(IC.msg) + esc(q.label) + "</a>" + (q.note ? "<small>" + esc(q.note) + "</small>" : "") + "</section>"; };
  FC.gifts = (F) => {
    const g = F.gifts, items = (g.items || []).filter((x) => x.title), now = Date.now();
    if (!items.length) return "";
    return '<section class="gift-section"><div class="section-heading"><span>' + esc(g.kicker) + "</span><h2>" + esc(g.title) + "</h2><p>" + items.map((x) => giftOpen(x, now) ? "D-DAY" : dayLabel(x.openAt, now)).join(" · ") + "에 한 권씩 순차 오픈됩니다.<br>" + esc(g.desc || "") + "</p></div>" +
      '<div class="gift-grid">' + items.map((x, i) => {
        const open = giftOpen(x, now), n = i + 1;
        return '<article class="gift-card gift-card--' + (ACCENT[x.color] || "blue") + (open ? " is-unlocked" : "") + '"' + (open ? "" : ' data-open-at="' + esc(x.openAt || "") + '"') + '><span class="gift-day">' + (open ? "D-DAY" : dayLabel(x.openAt, now)) + "</span>" +
          '<a class="gift-cover"' + (open && x.url ? ' href="' + esc(x.url) + '" target="_blank" rel="noreferrer"' : ' href="#" data-fc="gift" data-open="' + (open ? 1 : 0) + '" data-date="' + esc(x.openAt || "") + '"') + ' aria-label="' + esc(x.title) + (open ? " 전자책 열기" : " 공개 전") + '">' +
            '<span class="gift-cover-overlay" aria-hidden="true"></span><span class="gift-cover-number" aria-hidden="true">' + pad(n) + "</span>" +
            '<span class="gift-cover-top"><strong>' + n + "번 선물</strong><i>" + esc(F.hero.instructor) + " 무료강의 선물</i></span>" +
            '<span class="gift-cover-bottom">' + (open ? "" : '<span class="lock-state">' + SV(IC.lock, 30) + esc(lockWhen(x.openAt)) + " 공개 예정</span>") + "<strong>" + esc(x.title) + "</strong><small>전자책 · 강사 " + esc(F.hero.instructor) + "</small>" +
              (open ? '<span class="open-hint">' + SV(IC.unlock, 16) + "전자책 열기</span>" : "") + "</span></a>" +
          "<h3>" + esc(x.title) + "</h3>" + (x.desc ? "<p>" + esc(x.desc) + "</p>" : "") +
          '<span class="gift-status' + (open ? " is-open" : "") + '">' + SV(open ? IC.down : IC.lock, open ? 15 : 14) + (open ? "공개됨 · 표지를 눌러 열기" : esc(leftLabel(x.openAt, now))) + "</span></article>";
      }).join("") + "</div>" +
      '<div class="gift-timeline" aria-label="선물 공개 일정">' + items.map((x, i) => "<span><strong>" + (giftOpen(x, now) ? "D-DAY" : dayLabel(x.openAt, now)) + "</strong>" + (i + 1) + "번째 선물 오픈</span>").join("") + "</div></section>";
  };
  FC.kakao = (F) => { const k = F.kakao; if (!k.url) return ""; return '<section class="question-cta question-cta--compact"><span class="micro-badge micro-badge--kakao">' + esc(k.badge) + "</span><h2>" + esc(k.title) + "</h2>" + (k.desc ? "<p>" + nl(k.desc) + "</p>" : "") +
      '<a class="kakao-cta" href="' + esc(k.url) + '" target="_blank" rel="noreferrer">' + esc(k.label) + '<span aria-hidden="true">→</span></a>' + (k.note ? "<small>" + esc(k.note) + "</small>" : "") + "</section>"; };
  FC.live = (F) => {
    const L = F.live, title = L.liveTitle || F.hero.title;
    return '<section class="upcoming-course" aria-labelledby="upcoming-course-title"><div class="upcoming-course-heading"><span>' + esc(L.kicker) + '</span><h2 id="upcoming-course-title">' + esc(L.title) + "</h2>" + (L.desc ? "<p>" + esc(L.desc) + "</p>" : "") + "</div>" +
      '<article class="upcoming-course-card"><div class="upcoming-course-image">' + (L.image ? '<img src="' + esc(L.image) + '" alt="' + esc(title.replace(/\n/g, " ")) + ' 대표 이미지">' : '<div class="fc-poster-auto"><b>' + esc(shortWhen(F.liveAt)) + " 무료강의</b><strong>" + esc(title).replace(/\n/g, "<br>") + "</strong><small>" + esc(F.hero.instructor) + "</small></div>") + (L.tag ? "<span>" + esc(L.tag) + "</span>" : "") + "</div>" +
        '<div class="upcoming-course-content">' + (L.platform || L.platformLogo ? '<div class="upcoming-platform"><span class="bk-live-chip"><i aria-hidden="true"></i>LIVE 진행</span>' + (L.platformLogo ? '<span class="bk-plat-logo"><img src="' + esc(L.platformLogo) + '" alt="' + esc(L.platform || "강의 플랫폼") + '"></span>' : "<strong>" + esc(L.platform) + "</strong>") + "</div>" : "") +
          '<span class="upcoming-date">' + SV(IC.cal, 17) + esc(longWhen(F.liveAt)) + "</span>" +
          '<p class="upcoming-instructor">강사 <strong>' + esc(F.hero.instructor) + "</strong></p><h3>" + title.split("\n").map((x) => "<span>" + esc(x) + "<br></span>").join("") + "</h3>" +
          (L.summary ? '<p class="upcoming-description">' + esc(L.summary) + "</p>" : "") + ((L.points || []).length ? "<ul>" + L.points.map((x) => "<li>" + SV(IC.check, 17) + esc(x) + "</li>").join("") + "</ul>" : "") +
          '<a class="upcoming-course-cta" href="' + esc(L.url || "#") + '"' + (L.url ? ' target="_blank" rel="noreferrer"' : ' data-fc="nolink"') + ">" + esc(L.label) + SV(IC.ext, 18) + "</a>" + (L.note ? "<small>" + esc(L.note) + "</small>" : "") +
        "</div></article></section>";
  };
  FC.faq = (F, c) => {
    const q = F.faq, items = (q.items || []).filter((x) => x.q);
    if (!items.length) return "";
    return '<section class="fc-faq" aria-label="자주 묻는 질문"><div class="section-heading"><span>' + esc(q.kicker) + "</span><h2>" + esc(q.title) + "</h2></div>" +
      '<div class="fc-faq-list">' + items.map((x) => "<details><summary>" + esc(x.q) + SV(IC.chev, 18) + "</summary><p>" + nl(x.a) + "</p></details>").join("") + "</div></section>";
  };
  function renderFree(id) {
    const ins = DB.instructor(id);
    const F = ins && ins.status === "active" ? DB.freeOf(id) : null;
    const adm = DB.session.admin();
    const canSee = adm && (adm.role === "master" || adm.instructorId === id || adm.actingAs === id);
    if (!F || (!F.published && !canSee)) {
      document.title = "두고 클래스";
      root.innerHTML = '<main class="lp lp-empty"><div>' + window.doogoLogo("mark", "lp-empty-mark") + "<h1>준비 중인 페이지예요</h1><p>곧 무료강의 안내가 올라와요.</p></div></main>";
      return;
    }
    const c = DB.content(id), h = F.hero, lines = String(h.title || "").split("\n").filter(Boolean);
    document.title = lines.join(" ") + " · " + h.instructor + " 무료강의";
    // 올블랙 바탕 + 강사 색 포인트. 강사마다 다른 건 색 · 썸네일 · 문구
    const t = DB.themeOf(c.brand.theme);
    const vars = "--p:" + t.primary + ";--pa:" + t.active + ";--on:" + (t.onPrimary || t.deep) + ";--pale:" + t.pale + ";--deep:" + t.deep + ";--ac:" + (t.accent || t.primary) + ";--rgb:" + t.rgb;
    const rest = F.order.filter((k) => k !== "countdown" && !F.off[k] && FC[k]).map((k) => FC[k](F, c)).join("");
    const L = F.live, thumb = L.image;
    const art = '<div class="bk-art" aria-hidden="true"><div class="bk-frame">' +
        (thumb ? '<img src="' + esc(thumb) + '" alt="">' : '<div class="fc-poster-auto"><b>' + esc(shortWhen(F.liveAt)) + " 무료강의</b><strong>" + esc(L.liveTitle || h.title).replace(/\n/g, "<br>") + "</strong><small>" + esc(h.instructor) + "</small></div>") +
        '<span class="bk-shine"></span></div><span class="bk-frame-shadow"></span>' +
        '<span class="bk-tile t1">' + SV(IC.play, 26) + '</span><span class="bk-tile t2">' + SV(IC.msg, 24) + '</span><span class="bk-tile t3">' + SV(IC.cal, 22) + "</span></div>";
    root.innerHTML = '<div class="dg bk" style="' + vars + '"><div class="landing-page">' +
      (!F.published ? '<div class="fc-draft">' + icon("eyeOff", "sm") + "비공개 상태예요. 강사센터 ‘무료강의 페이지’에서 ‘공개 중’으로 바꾸면 누구나 볼 수 있어요.</div>" : "") +
      '<section class="bk-hero"><span class="bk-glow" aria-hidden="true"></span><span class="bk-floor" aria-hidden="true"></span><div class="bk-hero-in">' +
        '<header class="hero bk-hero-txt">' + (h.badge ? '<span class="top-badge"><i aria-hidden="true"></i>' + esc(h.badge) + "</span>" : "") +
          '<p class="instructor">강사 · <strong>' + esc(h.instructor) + "</strong></p><h1>" + lines.map((l, i) => (i === lines.length - 1 && lines.length > 1 ? "<em>" + esc(l) + "</em>" : "<span>" + esc(l) + "</span>")).join("") + "</h1>" +
          (h.sub ? '<p class="hero-copy">' + nl(h.sub) + "</p>" : "") + (h.note ? '<small class="disclaimer">' + esc(h.note) + "</small>" : "") + "</header>" +
        art + (!F.off.countdown ? '<div class="bk-hero-count">' + FC.countdown(F, c) + "</div>" : "") +
      "</div></section>" +
      "<main>" + rest + "</main>" +
      // 맨 아래 상호를 누르면 강사센터의 무료강의 페이지 편집으로
      '<footer><a href="#/center/free" aria-label="강사센터 무료강의 페이지 편집으로 이동">© 2026 ' + esc(F.company || c.brand.name) + "</a></footer>" +
      '<div class="fc-powered-row">' + window.poweredBy("white") + "</div>" +
      "</div></div>";
    clearInterval(tick); tick = setInterval(updateCountdown, 1000);
  }
  function questionModal(id) {
    const F = DB.freeOf(id), m = document.getElementById("modal-root");
    m.innerHTML = '<div class="modal-backdrop" data-fc="close-bg"><div class="modal fc-modal" role="dialog" aria-modal="true" aria-labelledby="fc-q-title"><div class="modal-head"><h3 id="fc-q-title">' + esc(F.question.title) + '</h3><button class="icon-btn" data-fc="close" aria-label="닫기">' + icon("x") + "</button></div>" +
      '<form id="fc-q-form" class="modal-body stack" style="white-space:normal"><div class="field"><label for="fcq-name">이름 (선택)</label><input class="input" id="fcq-name" name="qname" placeholder="예: 홍길동"></div>' +
      '<div class="field"><label for="fcq-text">질문</label><textarea class="textarea" id="fcq-text" name="qtext" rows="5" placeholder="예: 사업자 없이도 시작할 수 있나요? 제 상황은 …"></textarea></div><p class="field-error" id="fcq-err"></p>' +
      '<button class="btn btn-primary btn-block" type="submit">질문 남기기</button></form></div></div>';
    document.getElementById("fcq-text").focus();
  }
  function render() {
    window.applyStudentTheme(null);
    const id = insIdFromHash();
    if (/^#\/free/.test(location.hash)) { if (id) renderFree(id); else { root.innerHTML = ""; location.hash = "#/p"; } return; }
    if (id) renderPage(id); else renderIndex();
  }
  function mount() { root.innerHTML = ""; render(); window.scrollTo(0, 0); }

  document.addEventListener("click", (e) => {
    if (!isActive()) return;
    const f = e.target.closest("[data-fc]");
    if (f) {
      const k = f.dataset.fc, mr = document.getElementById("modal-root");
      if (k === "question") { e.preventDefault(); questionModal(insIdFromHash()); }
      else if (k === "close" || (k === "close-bg" && e.target === f)) mr.innerHTML = "";
      else if (k === "gift") { e.preventDefault(); fcToast(f.dataset.open === "1" ? "공개됐어요. 전자책 링크가 곧 올라와요." : lockWhen(f.dataset.date) + "에 자동으로 열려요. 조금만 기다려 주세요!"); }
      else if (k === "nolink") { e.preventDefault(); fcToast("신청 페이지가 곧 열려요."); }
      else if (k === "v-prev" || k === "v-next" || k === "v-go") {
        const n = (DB.freeOf(insIdFromHash()).videos.items || []).filter((x) => DB.youtubeId(x.youtube)).length || 1;
        vIdx = k === "v-go" ? Number(f.dataset.i) : (vIdx + (k === "v-next" ? 1 : -1) + n) % n;
        const y = window.scrollY; renderFree(insIdFromHash()); window.scrollTo(0, y);
      }
      return;
    }
    const a = e.target.closest("[data-lp-scroll]");
    if (!a) return;
    e.preventDefault();
    const el = document.getElementById(a.dataset.lpScroll);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); else window.scrollTo({ top: 0, behavior: "smooth" });
  });

  function fcToast(msg) { const t = document.createElement("div"); t.className = "toast"; t.innerHTML = icon("check", "sm") + "<span>" + esc(msg) + "</span>"; document.getElementById("toast-root").appendChild(t); setTimeout(() => t.remove(), 2600); }
  document.addEventListener("submit", (e) => {
    if (!isActive() || e.target.id !== "fc-q-form") return;
    e.preventDefault();
    const f = e.target, text = f.qtext.value.trim(), id = insIdFromHash();
    if (!text) { document.getElementById("fcq-err").textContent = "질문을 적어 주세요."; return; }
    const c = DB.content(id);
    (c.freeQuestions = c.freeQuestions || []).push({ id: DB.uid("fq"), name: f.qname.value.trim(), text, at: Date.now() });
    DB.save();
    const F = DB.freeOf(id);
    document.getElementById("modal-root").innerHTML = "";
    fcToast("질문을 남겼어요. 강의에서 꼭 다룰게요!");
    if (F.live.url) setTimeout(() => window.open(F.live.url, "_blank", "noopener"), 600);
  });

  window.LandingApp = { render, mount };
})();
