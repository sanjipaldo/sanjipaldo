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
      '<div class="lp-foot-bottom"><span>© 2026 ' + esc(ct.company || c.brand.name) + "</span>" + window.poweredBy("color") +
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
    const vars = "--lp-p:" + t.primary + ";--lp-pa:" + t.active + ";--lp-on:" + (t.onPrimary || t.deep) + ";--lp-pd:" + t.deep + ";--lp-pale:" + t.pale + ";--lp-rgb:" + t.rgb + ";--lp-ac:" + (t.accent || t.primary);
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
      list.map((x) => { const c = DB.content(x.id), t = DB.themeOf(c.brand.theme), co = recruiting(x.id); return '<a class="lp-index-card" href="#/p/' + x.id + '" style="--lp-p:' + t.primary + ";--lp-on:" + (t.onPrimary || t.deep) + '"><span class="lp-index-top">' + window.logoMark() + "<b>" + esc(x.displayName) + "</b></span><h3>" + esc(c.brand.courseTitle) + "</h3><p>" + esc(c.brand.tagline || "") + "</p>" + (co ? cohortBadge(co) : "") + "</a>"; }).join("") +
      "</div></div></main></div>";
  }

  /* ================= 무료강의 페이지 (#/free/<강사 id>) ================= */
  const DOWK = ["일", "월", "화", "수", "목", "금", "토"];
  const pad = (n) => String(n).padStart(2, "0");
  function liveText(iso) {
    const d = new Date(iso); if (isNaN(d)) return "";
    const h = d.getHours();
    return (d.getMonth() + 1) + "월 " + d.getDate() + "일 (" + DOWK[d.getDay()] + ") " + (h < 12 ? "오전 " : "오후 ") + ((h % 12) || 12) + "시" + (d.getMinutes() ? " " + d.getMinutes() + "분" : "");
  }
  const dayDiff = (dateStr) => diffDays(dateStr, todayStr());
  let tick = null;
  function updateCountdown() {
    const box = document.getElementById("fc-count");
    if (!box || !isActive()) { clearInterval(tick); tick = null; return; }
    const ms = new Date(box.dataset.at) - Date.now();
    const set = (k, v) => { const el = box.querySelector('[data-u="' + k + '"]'); if (el) el.textContent = pad(v); };
    const st = document.getElementById("fc-count-state");
    if (ms <= 0) {
      ["d", "h", "m", "s"].forEach((k) => set(k, 0));
      if (st) st.textContent = ms > -3 * 3600000 ? "지금 강의가 진행 중이에요" : "강의가 끝났어요. 다음 강의를 기다려 주세요";
      return;
    }
    set("d", Math.floor(ms / 86400000)); set("h", Math.floor(ms / 3600000) % 24); set("m", Math.floor(ms / 60000) % 60); set("s", Math.floor(ms / 1000) % 60);
  }
  const FC = {};
  FC.countdown = (F) => '<section class="fc-count-wrap"><div class="fc-count" id="fc-count" data-at="' + esc(F.liveAt) + '"><p class="fc-count-label">강의 시작까지 <b>LIVE</b></p><div class="fc-units">' +
      [["d", "일"], ["h", "시간"], ["m", "분"], ["s", "초"]].map((u, i) => (i ? '<span class="fc-colon">:</span>' : "") + '<div class="fc-unit"><b data-u="' + u[0] + '">00</b><small>' + u[1] + "</small></div>").join("") +
      '</div><p class="fc-count-foot"><i class="lp-dot"></i><span id="fc-count-state">' + esc(liveText(F.liveAt)) + " 강의 시작</span></p></div></section>";
  FC.question = (F) => { const q = F.question; return '<section class="fc-card fc-glow"><span class="fc-pill">' + esc(q.badge) + "</span><h2>" + esc(q.title) + "</h2>" + (q.desc ? "<p>" + nl(q.desc) + "</p>" : "") +
      '<button type="button" class="lp-btn lp-btn-primary lp-btn-lg fc-wide" data-fc="question">' + icon("message", "sm") + esc(q.label) + "</button>" + (q.note ? '<small class="fc-note">' + esc(q.note) + "</small>" : "") + "</section>"; };
  FC.gifts = (F) => {
    const g = F.gifts, items = (g.items || []).filter((x) => x.title);
    if (!items.length) return "";
    return '<section class="fc-sec"><p class="lp-kicker fc-center">' + esc(g.kicker) + '</p><h2 class="fc-h2">' + esc(g.title) + "</h2>" + (g.desc ? '<p class="fc-lead">' + nl(g.desc) + "</p>" : "") +
      '<div class="fc-gifts">' + items.map((x, i) => {
        const left = x.openAt ? dayDiff(x.openAt) : 0, open = left <= 0;
        const badge = open ? "공개" : "D-" + left;
        const cover = '<div class="fc-cover fc-c-' + esc(x.color || "accent") + '"><span class="fc-cover-top"><b>' + (i + 1) + '번 선물</b><small>' + esc(F.hero.instructor) + " 무료강의 선물</small></span><strong>" + esc(x.title) + "</strong><small>전자책 · 강사 " + esc(F.hero.instructor) + '</small><span class="fc-cover-open">' + icon(open ? "book" : "lock", "sm") + (open ? "전자책 열기" : fmtMD(x.openAt) + " 공개") + '</span><i class="fc-cover-no">' + pad(i + 1) + "</i></div>";
        const tag = open && x.url ? 'a href="' + esc(x.url) + '" target="_blank" rel="noopener"' : 'button type="button" data-fc="gift" data-open="' + (open ? 1 : 0) + '" data-date="' + esc(x.openAt || "") + '"';
        return '<article class="fc-gift' + (open ? " open" : " locked") + '"><span class="fc-dday">' + badge + "</span><" + tag + ' class="fc-cover-btn">' + cover + "</" + tag.split(" ")[0] + ">" +
          "<h3>" + esc(x.title) + "</h3>" + (x.desc ? "<p>" + nl(x.desc) + "</p>" : "") + '<span class="fc-gift-state">' + icon(open ? "download" : "lock", "xs") + (open ? (x.url ? "공개됨 · 표지를 눌러 열기" : "공개됨 · 곧 링크가 올라와요") : fmtFull(x.openAt) + " 자동 공개") + "</span></article>";
      }).join("") + "</div>" +
      '<div class="fc-chips">' + items.map((x, i) => '<span class="fc-chip' + (x.openAt && dayDiff(x.openAt) > 0 ? "" : " on") + '"><b>' + (x.openAt && dayDiff(x.openAt) > 0 ? "D-" + dayDiff(x.openAt) : "OPEN") + "</b>" + (i + 1) + "번째 선물 " + (x.openAt ? fmtMD(x.openAt) : "") + "</span>").join("") + "</div></section>";
  };
  FC.videos = (F) => {
    const v = F.videos, items = (v.items || []).filter((x) => DB.youtubeId(x.youtube));
    if (!items.length) return "";
    return '<section class="fc-sec"><p class="lp-kicker fc-center">' + esc(v.kicker) + '</p><h2 class="fc-h2">' + esc(v.title) + '</h2><div class="fc-videos">' +
      items.map((x) => { const y = DB.youtubeId(x.youtube); return '<a class="fc-video" href="https://www.youtube.com/watch?v=' + esc(y) + '" target="_blank" rel="noopener"><span class="fc-thumb"><img src="https://i.ytimg.com/vi/' + esc(y) + '/hqdefault.jpg" alt="" loading="lazy">' + icon("play") + "</span><b>" + esc(x.title || "영상") + "</b></a>"; }).join("") + "</div></section>";
  };
  FC.kakao = (F) => { const k = F.kakao; if (!k.url) return ""; return '<section class="fc-card fc-kakao"><span class="fc-pill fc-pill-kakao">' + esc(k.badge) + "</span><h2>" + esc(k.title) + "</h2>" + (k.desc ? "<p>" + nl(k.desc) + "</p>" : "") +
      '<a class="lp-btn lp-btn-lg fc-wide fc-kakao-btn" href="' + esc(k.url) + '" target="_blank" rel="noopener">' + esc(k.label) + icon("arrowRight", "sm") + "</a>" + (k.note ? '<small class="fc-note">' + esc(k.note) + "</small>" : "") + "</section>"; };
  FC.live = (F, c) => {
    const L = F.live;
    const poster = L.image ? '<img src="' + esc(L.image) + '" alt="">' : '<div class="fc-poster"><span class="fc-poster-date">' + esc(liveText(F.liveAt)) + " 무료강의</span><strong>" + headline(F.hero.title) + "</strong><small>" + esc(c.brand.courseTitle) + " · " + esc(F.hero.instructor) + "</small></div>";
    return '<section class="fc-sec"><p class="lp-kicker fc-center">' + esc(L.kicker) + '</p><h2 class="fc-h2">' + esc(L.title) + "</h2>" + (L.desc ? '<p class="fc-lead">' + nl(L.desc) + "</p>" : "") +
      '<div class="fc-live"><div class="fc-live-img"><span class="fc-live-tag">' + esc(L.tag) + "</span>" + poster + "</div>" +
      '<div class="fc-live-info">' + (L.platform ? '<span class="fc-live-plat">[강의 Live] <b>' + esc(L.platform) + "</b></span>" : "") +
        '<p class="fc-live-when">' + icon("calendar", "sm") + esc(liveText(F.liveAt)) + "</p><small>강사 <b>" + esc(F.hero.instructor) + "</b></small><h3>" + headline(F.hero.title).replace(/<\/?span[^>]*>/g, "") + "</h3>" +
        (L.summary ? "<p>" + nl(L.summary) + "</p>" : "") + ((L.points || []).length ? '<ul class="lp-incl">' + L.points.map((x) => "<li>" + icon("check", "sm") + esc(x) + "</li>").join("") + "</ul>" : "") +
        '<a class="lp-btn lp-btn-primary lp-btn-lg lp-btn-block" href="' + esc(L.url || "#") + '"' + (L.url ? ' target="_blank" rel="noopener"' : ' data-fc="nolink"') + ">" + esc(L.label) + icon("arrowUpRight", "sm") + "</a>" + (L.note ? '<small class="fc-note">' + esc(L.note) + "</small>" : "") +
      "</div></div></section>";
  };
  function renderFree(id) {
    const ins = DB.instructor(id);
    const F = ins && ins.status === "active" ? DB.freeOf(id) : null;
    const adm = DB.session.admin();
    const canSee = adm && (adm.role === "master" || adm.instructorId === id);
    if (!F || (!F.published && !canSee)) {
      document.title = "두고 클래스";
      root.innerHTML = '<main class="lp lp-empty"><div>' + window.doogoLogo("mark", "lp-empty-mark") + "<h1>준비 중인 페이지예요</h1><p>곧 무료강의 안내가 올라와요.</p></div></main>";
      return;
    }
    const c = DB.content(id), t = DB.themeOf(c.brand.theme);
    document.title = F.hero.title.replace(/\n/g, " ") + " · " + F.hero.instructor + " 무료강의";
    const vars = "--lp-p:" + t.primary + ";--lp-pa:" + t.active + ";--lp-on:" + (t.onPrimary || t.deep) + ";--lp-pd:" + t.deep + ";--lp-pale:" + t.pale + ";--lp-rgb:" + t.rgb + ";--lp-ac:" + (t.accent || t.primary);
    const h = F.hero;
    root.innerHTML = '<div class="lp fc" style="' + vars + '">' +
      (!F.published ? '<div class="lp-draft">' + icon("eyeOff", "sm") + "비공개 상태예요. 강사센터 ‘무료강의 페이지’에서 공개로 바꾸면 누구나 볼 수 있어요.</div>" : "") +
      '<main class="fc-main"><section class="fc-hero">' + (h.badge ? '<span class="fc-pill fc-pill-top"><i class="lp-dot"></i>' + esc(h.badge) + "</span>" : "") +
        '<p class="fc-ins">강사 · <b>' + esc(h.instructor) + "</b></p><h1>" + headline(h.title) + "</h1>" + (h.sub ? '<p class="fc-sub">' + nl(h.sub) + "</p>" : "") + (h.note ? '<p class="fc-disc">' + esc(h.note) + "</p>" : "") + "</section>" +
        F.order.filter((k) => !F.off[k] && FC[k]).map((k) => FC[k](F, c)).join("") +
      "</main>" +
      '<footer class="fc-foot"><span>© 2026 ' + esc(F.company || c.brand.name) + "</span>" + window.poweredBy("color") + "</footer></div>";
    clearInterval(tick); updateCountdown(); tick = setInterval(updateCountdown, 1000);
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
      if (k === "question") { const F = DB.freeOf(insIdFromHash()); if (F.question.url) window.open(F.question.url, "_blank", "noopener"); else questionModal(insIdFromHash()); }
      else if (k === "close" || (k === "close-bg" && e.target === f)) mr.innerHTML = "";
      else if (k === "gift") fcToast(f.dataset.open === "1" ? "공개됐어요. 전자책 링크가 곧 올라와요." : fmtFull(f.dataset.date) + "에 자동으로 열려요. 조금만 기다려 주세요!");
      else if (k === "nolink") { e.preventDefault(); fcToast("신청 페이지가 곧 열려요."); }
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
