/* 두잉고 — 강사 홍보 랜딩페이지 (#/p/<강사 id>)
 *
 *  - 로그인 없이 누구나 보는 강사 소개 페이지 — 어떤 사람이 어떤 강의를 하는지 궁금하게 만들고, ‘신청하기’는 강사가 정한 링크(오픈채팅 · 신청 폼)로 새 창
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

  function insIdFromHash() { return (ROUTE.hash.replace(/^#\/?(p|free)\/?/, "").split(/[/?]/)[0] || "").trim(); }

  // 신청하기: 강사센터 ‘강사 소개 페이지’의 신청 링크(applyUrl) 하나 — 언제나 새 창으로 열어요 (팝업 신청 창은 쓰지 않아요).
  // 아직 비어 있으면 예전에 버튼마다 넣어 둔 주소 → 카카오톡 문의 주소 순으로 대신 쓰고, 그것도 없으면 버튼을 감춰요
  const applyUrlOf = (L) => [L.applyUrl, L.hero.ctaUrl, L.cta.url, (L.pricing || {}).ctaUrl, (L.contact || {}).kakao].find(isExt) || "";
  const applyBtn = (L, label, cls) => { const u = applyUrlOf(L); return u ? '<a class="lp-btn ' + cls + '" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(label || "신청하기") + icon("arrowUpRight", "sm") + "</a>" : ""; };
  // 뉴질랜드 테마 강사(문대표): 은고사리 · 남십자성 · 국기로 뉴질랜드를 살려요
  const isNz = (c) => ((c && c.brand) || {}).theme === "nz";
  const NZ_FLAG = '<svg viewBox="0 0 60 30" aria-hidden="true"><rect width="60" height="30" fill="#012169"/><path d="M0 0l30 15M30 0L0 15" stroke="#fff" stroke-width="3"/><path d="M0 0l30 15M30 0L0 15" stroke="#c8102e" stroke-width="1.4"/><path d="M15 0v15M0 7.5h30" stroke="#fff" stroke-width="5"/><path d="M15 0v15M0 7.5h30" stroke="#c8102e" stroke-width="3"/>' +
    [[45, 6, 2.2], [40, 13, 2.2], [50, 12, 1.9], [45, 24, 2.5]].map((x) => { const pts = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? x[2] * 0.42 : x[2], a = -Math.PI / 2 + i * Math.PI / 5; pts.push((x[0] + r * Math.cos(a)).toFixed(2) + "," + (x[1] + r * Math.sin(a)).toFixed(2)); } return '<polygon points="' + pts.join(" ") + '" fill="#c8102e" stroke="#fff" stroke-width=".7"/>'; }).join("") + "</svg>";

  /* 뉴질랜드 그림 — 직접 그린 고사리 잎(실버펀 느낌, 상표 로고 아님) · 남알프스 산 · 초록 언덕 */
  const FERN = (() => {
    let g = '<path d="M100 396C97 300 105 170 100 18" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>';
    for (let i = 0; i < 19; i++) {
      const t = i / 19, y = 384 - t * 352, len = 92 * (1 - t * 0.82), w = 15 * (1 - t * 0.55);
      [-1, 1].forEach((d) => {
        const a = d * (64 - t * 22), r = a * Math.PI / 180, cx = 100 + (len / 2) * Math.sin(r), cy = y - (len / 2) * Math.cos(r);
        g += '<ellipse cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" rx="' + (w / 2).toFixed(1) + '" ry="' + (len / 2).toFixed(1) + '" transform="rotate(' + a.toFixed(1) + " " + cx.toFixed(1) + " " + cy.toFixed(1) + ')"/>';
      });
    }
    return '<svg viewBox="0 0 200 400" fill="currentColor" aria-hidden="true" focusable="false">' + g + '<ellipse cx="100" cy="22" rx="6" ry="14"/></svg>';
  })();
  const NZ_SCENE = '<svg class="nz-scene" viewBox="0 0 1440 260" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">' +
    '<path fill="#b9d3e6" d="M0 205L110 128L180 162L300 66L388 132L470 96L560 152L662 54L762 140L860 102L962 160L1064 76L1164 140L1262 96L1362 150L1440 118V260H0Z"/>' +
    '<path fill="#fff" d="M300 66L326 88L312 86L300 98L288 86L274 89ZM662 54L690 80L674 77L662 90L650 77L634 81ZM1064 76L1090 98L1076 95L1064 107L1052 95L1038 98ZM470 96L488 110L470 108L456 112Z"/>' +
    '<path fill="#8fb3d1" d="M0 232L150 166L262 204L384 152L522 212L644 168L784 216L924 172L1082 222L1222 178L1440 228V260H0Z"/>' +
    '<path fill="#3f9b6b" d="M0 240C200 204 362 252 562 226S902 196 1102 232S1342 214 1440 236V260H0Z"/>' +
    '<path fill="#1f7049" d="M0 254C240 236 520 262 760 248S1200 236 1440 252V260H0Z"/></svg>';
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
  // 첫 화면: 헤드라인 + 신청하기(새 창) + 강사 영상 보기 · 오른쪽은 강사 사진 (뉴질랜드 테마는 은고사리 · 남십자성 판 위에)
  S.hero = (L, c, ins, co) => {
    const h = L.hero, nz = isNz(c), ph = h.image || L.about.photo || c.brand.photo || "", nm = L.about.name || c.brand.instructor || ins.displayName;
    const more = !L.off.video && videoOf(ins.id, L) ? ["lp-video", "강사 영상 보기"] : ["lp-about", "강사 소개 보기"];
    const art = '<div class="lp-pf' + (nz ? " nz" : "") + (h.image ? " photo" : "") + '"><div class="lp-pf-bg" aria-hidden="true">' + (nz ? '<i class="lp-pf-fern"></i><i class="lp-pf-stars"></i>' : "") + "</div>" +
      (ph ? '<img class="lp-pf-img" src="' + esc(ph) + '" alt="' + esc(nm) + ' 강사" decoding="async">' : '<span class="lp-pf-av">' + esc(nm.slice(0, 1)) + "</span>") +
      '<div class="lp-pf-card">' + (nz ? '<span class="lp-pf-nz"><span class="lp-flag">' + NZ_FLAG + "</span>Aotearoa · New Zealand</span>" : "") + "<b>" + esc(nm) + "</b>" + (L.about.role ? "<small>" + esc(L.about.role) + "</small>" : "") + "</div></div>";
    return '<section class="lp-hero' + (nz ? " lp-hero-nz" : "") + '" id="top"><div class="lp-wrap lp-hero-grid"><div class="lp-hero-txt">' +
      (nz ? '<p class="lp-nz-pill"><span class="lp-flag">' + NZ_FLAG + "</span>Kia ora! 뉴질랜드에서 인사드려요</p>" : "") +
      (h.eyebrow ? '<p class="lp-eyebrow">' + esc(h.eyebrow) + "</p>" : "") +
      "<h1>" + headline(h.title) + "</h1>" +
      (h.sub ? '<p class="lp-sub">' + nl(h.sub) + "</p>" : "") +
      '<div class="lp-actions">' + applyBtn(L, h.ctaLabel || "신청하기", "lp-btn-primary lp-btn-lg") +
        '<a class="lp-btn lp-btn-ghost lp-btn-lg" href="#' + more[0] + '" data-lp-scroll="' + more[0] + '">' + (more[0] === "lp-video" ? icon("play", "sm") : "") + more[1] + "</a></div>" +
      cohortBadge(co) +
      '</div><div class="lp-hero-art">' + art + "</div></div></section>";
  };
  // 뉴질랜드 이야기 (뉴질랜드 테마일 때 첫 화면 바로 아래)
  function nzBand() {
    const tiles = [["sprout", "청정 자연에서 온 원료", "남반구 청정 섬나라의 자연에서 자란 원료로 만들어요."], ["shieldCheck", "까다로운 식품 안전 기준", "뉴질랜드 1차산업부(MPI)의 기준 아래 관리되는 제품을 골라요."], ["sparkles", "한국에서 사랑받는 품목", "마누카꿀 · 프로폴리스 · 초록입홍합 · 초유처럼 찾는 사람이 많은 품목."], ["mapPin", "현지에서 직접 소싱", "현지 공급처 · 통관 · 배송까지 직접 해 본 순서 그대로 알려 드려요."]];
    return '<section class="lp-nzb" aria-label="왜 뉴질랜드인가요"><div class="lp-nzb-deco" aria-hidden="true"><i></i></div><div class="lp-wrap"><p class="lp-kicker">WHY NEW ZEALAND</p><h2>왜 <em>뉴질랜드</em> 건강식품일까요?</h2>' +
      '<div class="lp-nzb-g">' + tiles.map((x, i) => '<div class="lp-nzb-t"><span class="lp-nzb-i">' + icon(x[0]) + "</span><small>0" + (i + 1) + "</small><b>" + x[1] + "</b><p>" + x[2] + "</p></div>").join("") + "</div></div></section>";
  }
  S.stats = (L) => {
    const items = (L.stats || []).filter((x) => x.value);
    if (!items.length) return "";
    return '<section class="lp-stats"><div class="lp-wrap lp-stats-grid">' + items.map((x) => '<div><b>' + esc(x.value) + "</b><span>" + esc(x.label) + "</span></div>").join("") + "</div></section>";
  };
  S.about = (L, c) => {
    const a = L.about, ph = a.photo || ((c && c.brand) || {}).photo || "", yt = !L.off.video && c && c.__id && videoOf(c.__id, L) ? "" : ((c && c.brand) || {}).youtubeChannel || (L.contact || {}).youtube || "";
    if (!a.body && !(a.career || []).length && !ph) return "";
    return '<section class="lp-sec" id="lp-about"><div class="lp-wrap lp-about">' +
      '<div class="lp-about-photo' + (ph ? " has-photo" : "") + '">' + (ph ? '<img src="' + esc(ph) + '" alt="' + esc(a.name) + ' 강사 프로필" decoding="async">' : '<span class="lp-avatar">' + esc((a.name || "강").slice(0, 1)) + "</span>") + "</div>" +
      '<div><p class="lp-kicker">' + esc(a.title || "강사 소개") + "</p><h2>" + esc(a.name) + "</h2>" + (a.role ? '<p class="lp-role">' + esc(a.role) + "</p>" : "") +
        (a.body ? '<p class="lp-body">' + nl(a.body) + "</p>" : "") +
        ((a.career || []).length ? '<ul class="lp-career">' + a.career.map((x) => "<li>" + icon("check", "sm") + esc(x) + "</li>").join("") + "</ul>" : "") +
        (yt ? '<a class="lp-yt" href="' + esc(yt) + '" target="_blank" rel="noopener"><span class="lp-yt-ic" aria-hidden="true"><svg viewBox="0 0 28 20"><rect width="28" height="20" rx="6" fill="#ff0033"/><path d="M11.2 6.1v7.8l6.6-3.9z" fill="#fff"/></svg></span><span class="lp-yt-t"><b>유튜브 채널 바로가기</b><small>' + esc((c.brand || {}).name || a.name || "") + " 채널에서 영상 보기</small></span>" + icon("arrowUpRight", "sm") + "</a>" : "") +
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
  S.platform = (L, c, ins) => {
    const P = L.platform;
    const feats = [["checks", "과제 제출 · 자동 검수", "사진·링크·글로 과제를 내면 바로 결과가 나와요"], ["calendar", "수업 캘린더", "강의 오픈·과제 마감·라이브가 달력에"], ["library", "강의 자료함", "전자책·자료 파일·VOD를 한 곳에"], ["bot", "AI 조교", "밤에도 바로 물어보고 답을 받아요"], ["award", "수료증", "필수 과제를 마치면 바로 발급"], ["help", "질문 · 1:1 요청", "막히면 강사에게 직접 남겨요"]];
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
  S.faq = (L, c) => {
    const items = (L.faq.items || []).filter((x) => x.q).length ? L.faq.items.filter((x) => x.q) : c.faqs.slice(0, 6);
    if (!items.length) return "";
    return '<section class="lp-sec lp-tint" id="lp-faq"><div class="lp-wrap lp-narrow"><p class="lp-kicker">FAQ</p><h2>' + esc(L.faq.title) + '</h2><div class="lp-faq">' +
      items.map((f) => '<details><summary>' + esc(f.q) + icon("chevDown", "sm") + "</summary><p>" + nl(f.a) + "</p></details>").join("") + "</div></div></section>";
  };
  S.cta = (L, c, ins, co) => {
    const x = L.cta;
    return '<section class="lp-cta"><div class="lp-wrap"><h2>' + esc(x.title) + "</h2>" + (x.sub ? "<p>" + esc(x.sub) + "</p>" : "") +
      applyBtn(L, x.label || "신청하기", "lp-btn-dark lp-btn-lg") + (co ? '<div class="lp-cta-co">' + cohortBadge(co) + "</div>" : "") + "</div></section>";
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
      document.title = "두잉고";
      root.innerHTML = '<main class="lp lp-empty"><div>' + window.logoMark() + "<h1>준비 중인 페이지예요</h1><p>곧 강사 소개가 올라와요.</p><a class=\"lp-btn lp-btn-ghost\" href=\"#/p\">다른 강사 보기</a></div></main>";
      return;
    }
    const co = recruiting(id);
    const c = Object.assign({}, DB.content(id), co ? { weeks: DB.weeksOf(co) } : {}, { __id: id }), t = DB.themeOf(c.brand.theme);
    document.title = c.brand.courseTitle + " · " + c.brand.name;
    const tv = t.vars || {};
    const vars = "--logo-accent:" + (t.accent || t.primary) + ";--lp-p:" + t.primary + ";--lp-pa:" + t.active + ";--lp-on:" + (t.onPrimary || t.deep) + ";--lp-pd:" + t.deep + ";--lp-pale:" + t.pale + ";--lp-rgb:" + t.rgb + ";--lp-ac:" + (t.accent || t.primary) + ";--lp-soft:" + (tv["--canvas-soft"] || "#e8ebe6") + ";--lp-ink:" + (tv["--ink"] || "#0e0f0c");
    const nz = isNz(c);
    const sections = L.order.filter((k) => !L.off[k] && S[k]).map((k) => S[k](L, c, ins, co) + (k === "hero" && nz ? nzBand() : "")).join("");
    const navs = [["lp-video", "강사 영상", !L.off.video && videoOf(id, L)], ["lp-about", "강사 소개", !L.off.about && (L.about.body || L.about.photo)], ["lp-reviews", "후기", !L.off.reviews && (L.reviews.items || []).some((x) => x.text)], ["lp-faq", "FAQ", !L.off.faq]].filter((x) => x[2]);
    root.innerHTML = '<div class="lp' + (nz ? " lp-nz" : "") + '" style="' + vars + '">' +
      (!L.published ? '<div class="lp-draft">' + icon("eyeOff", "sm") + "비공개 상태예요. 강사센터 ‘홍보 랜딩페이지’에서 공개로 바꾸면 누구나 볼 수 있어요.</div>" : "") +
      '<header class="lp-nav"><div class="lp-wrap lp-nav-in"><a class="lp-back" href="#/doinggo" aria-label="두잉고 홈으로">' + icon("arrowLeft", "sm") + window.doinggoB("black", "lp-back-dg") + '<span>홈</span></a><span class="lp-back-div" aria-hidden="true"></span><a class="lp-brand" href="#/p/' + esc(id) + '" data-lp-scroll="top">' + window.logoMark() + "<b>" + esc(c.brand.name) + "</b></a>" +
        '<nav class="lp-links">' + navs.map((n) => '<a href="#' + n[0] + '" data-lp-scroll="' + n[0] + '">' + n[1] + "</a>").join("") + "</nav>" +
        '<div class="lp-nav-r"><a class="lp-btn lp-btn-text" href="#/login?ins=' + esc(id) + '">수강생 로그인</a>' + applyBtn(L, "신청하기", "lp-btn-primary") + "</div></div></header>" +
      "<main>" + sections + "</main>" + footer(L, c, ins) +
      (applyUrlOf(L) ? '<div class="lp-sticky"><div>' + (co ? "<b>" + esc(co.name) + " 모집 중</b><small>" + fmtMD(co.startDate) + " 시작</small>" : "<b>" + esc(c.brand.courseTitle) + "</b>") + "</div>" + applyBtn(L, "신청하기", "lp-btn-primary") + "</div>" : "") +
      "</div>";
    lpMotion();
  }

  // #/p — 공개된 강사 랜딩페이지 모음
  function renderIndex() {
    const list = DB.activeInstructors().filter((x) => { const L = DB.landingOf(x.id); return L && L.published; });
    document.title = "강의 둘러보기 · 두잉고";
    root.innerHTML = '<div class="lp"><header class="lp-nav"><div class="lp-wrap lp-nav-in"><span class="lp-brand">' + window.doogoClassWord("lp-word") + '</span><div class="lp-nav-r"><a class="lp-btn lp-btn-text" href="#/login">수강생 로그인</a></div></div></header>' +
      '<main class="lp-sec"><div class="lp-wrap"><p class="lp-kicker">CLASSES</p><h2>강의 둘러보기</h2><div class="lp-index">' +
      list.map((x) => { const c = DB.content(x.id), t = DB.themeOf(c.brand.theme), co = recruiting(x.id); return '<a class="lp-index-card" href="#/p/' + x.id + '" style="--logo-accent:' + (t.accent || t.primary) + ";--lp-p:" + t.primary + ";--lp-on:" + (t.onPrimary || t.deep) + '"><span class="lp-index-top">' + window.logoMark() + "<b>" + esc(x.displayName) + "</b></span><h3>" + esc(c.brand.courseTitle) + "</h3><p>" + esc(c.brand.tagline || "") + "</p>" + (co ? cohortBadge(co) : "") + "</a>"; }).join("") +
      "</div></div></main></div>";
  }

  /* ================= 무료강의 페이지 (#/free/<강사 id>) — doogo.site 와 같은 화면 ================= */
  const DOWK = ["일", "월", "화", "수", "목", "금", "토"];
  const DOWL = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const pad = (n) => String(n).padStart(2, "0");
  // 강의 · 전자책 시간은 언제나 한국 시간(KST)으로 읽고 보여 줘요 — 뉴질랜드 · 해외에서 열어도 카운트다운 · 공개 시각이 어긋나지 않게
  const KST = 9 * 36e5;
  const at = (v) => { if (!v) return NaN; let s = String(v).trim(); if (!/T/.test(s)) s += "T00:00"; if (/T\d\d:\d\d$/.test(s)) s += ":00"; return new Date(/(Z|[+-]\d\d:?\d\d)$/.test(s) ? s : s + "+09:00").getTime(); };
  const kd = (v) => { const t = at(v); if (isNaN(t)) return null; const d = new Date(t + KST); return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), dt: d.getUTCDate(), dw: d.getUTCDay(), h: d.getUTCHours(), mi: d.getUTCMinutes() }; };
  const ampm = (k) => (k.h < 12 ? "오전 " : "오후 ") + ((k.h % 12) || 12) + "시";
  // 예: 10월 27일 (화) / 오후 07시 30분
  const whenParts = (v) => { const k = kd(v); return !k ? null : { day: (k.mo + 1) + "월 " + k.dt + "일 (" + DOWK[k.dw] + ")", time: (k.h < 12 ? "오전 " : "오후 ") + pad((k.h % 12) || 12) + "시" + (k.mi ? " " + pad(k.mi) + "분" : "") }; };
  const shortWhen = (v) => { const w = whenParts(v); return w ? w.day + " " + w.time : ""; };
  const longWhen = (v) => { const k = kd(v); return !k ? "" : k.y + "년 " + (k.mo + 1) + "월 " + k.dt + "일 " + DOWL[k.dw] + " " + ampm(k) + " " + pad(k.mi) + "분"; };
  const lockWhen = (v) => { const k = kd(v); return !k ? "공개일 확인 필요" : k.y + "-" + pad(k.mo + 1) + "-" + pad(k.dt) + " " + (k.h < 12 ? "오전" : "오후") + " " + ((k.h % 12) || 12) + ":" + pad(k.mi); };
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
    const st = box.querySelector(".countdown-eyebrow strong"); if (st) st.textContent = c.expired ? "지금 LIVE 중" : "D-" + Math.max(0, Math.ceil((at(box.dataset.at) - Date.now()) / 864e5));
    if (c.expired && at(box.dataset.at) + 3 * 36e5 < Date.now()) { renderFree(insIdFromHash()); return; }
    // 날짜가 된 전자책은 새로고침 없이 바로 열린다
    const now = Date.now();
    document.querySelectorAll(".gift-card[data-open-at]").forEach((g) => { if (!g.classList.contains("is-unlocked") && now >= at(g.dataset.openAt)) renderFree(insIdFromHash()); });
  }
  const FC = {};
  const freeEnded = (F) => !!F.liveAt && at(F.liveAt) + 3 * 36e5 < Date.now();
  FC.countdown = (F) => {
    if (freeEnded(F)) return '<section class="countdown-card is-ended" aria-label="무료강의 종료"><p class="countdown-eyebrow"><span>무료강의가 끝났어요</span><strong>종료</strong></p>' +
      '<p class="fc-ended-t">' + esc(longWhen(F.liveAt)) + "에 진행했어요. 다음 무료강의는 DOOGO CLASS에서 가장 먼저 알려 드려요.</p>" +
      '<div class="fc-ended-cta"><a class="primary-cta" href="#/vod/c/all?tab=free">다음 무료강의 보기</a><a class="fc-ended-link" href="#/vod/c/all?tab=vod">강사님 VOD 클래스 보기 →</a></div></section>';
    const c = countdownParts(F.liveAt);
    const w = whenParts(F.liveAt);
    return '<section class="countdown-card" id="fc-count" data-at="' + esc(F.liveAt) + '" aria-label="강의 시작 카운트다운"><p class="countdown-eyebrow"><span>강의 시작까지</span><strong>' + (c.expired ? "LIVE" : "D-" + Math.ceil((at(F.liveAt) - Date.now()) / 864e5)) + "</strong></p>" +
      '<div class="countdown-grid">' + [["d", "일", c.d], ["h", "시간", c.h], ["m", "분", c.m], ["s", "초", c.s]].map((u, i) => '<div class="countdown-unit-wrap"><div class="countdown-unit"><strong data-u="' + u[0] + '">' + pad(u[2]) + "</strong><span>" + u[1] + "</span></div>" + (i < 3 ? '<span class="countdown-colon" aria-hidden="true">:</span>' : "") + "</div>").join("") + "</div>" +
      (w ? '<p class="event-date"><span class="ed-dot" aria-hidden="true"></span><span class="ed-when"><b>' + esc(w.day) + '</b> <b class="ed-time">' + esc(w.time) + "</b></span><em>무료 강의 시작</em></p>" : "") + "</section>";
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
  // 대표 영상: 첫 화면 바로 아래 크게 (썸네일을 누르면 그 자리에서 재생 — 처음부터 유튜브 창을 띄우지 않아 빠르게 열려요)
  FC.intro = (F) => {
    const v = F.intro || {}, y = DB.youtubeId(v.youtube || "");
    if (!y || (F.off || {}).videos) return ""; // 강사센터 ‘YouTube 영상’ 탭의 보임 스위치가 대표 영상 · 좌우 영상을 함께 켜고 꺼요
    return '<section class="fc-intro" aria-labelledby="fc-intro-t"><div class="section-heading"><span>' + esc(v.kicker || "WATCH FIRST") + '</span><h2 id="fc-intro-t">' + esc(v.title || "영상으로 먼저 만나보세요") + "</h2>" + (v.desc ? "<p>" + esc(v.desc) + "</p>" : "") + "</div>" +
      '<div class="fc-intro-frame" data-y="' + esc(y) + '"><button type="button" class="fc-intro-play" data-fc="intro-play" aria-label="' + esc(v.title || "대표 영상") + ' 재생"><img src="https://i.ytimg.com/vi/' + esc(y) + '/maxresdefault.jpg" data-alt="https://i.ytimg.com/vi/' + esc(y) + '/hqdefault.jpg" alt="" decoding="async">' +
        '<span class="fc-intro-btn" aria-hidden="true">' + SV(IC.play, 30) + "</span>" + (v.caption ? '<span class="fc-intro-cap">' + esc(v.caption) + "</span>" : "") + "</button></div>" +
      '<a class="fc-yt-out" href="https://www.youtube.com/watch?v=' + esc(y) + '" target="_blank" rel="noopener">유튜브에서 보기 ↗</a></section>';
  };
  FC.question = (F) => { const q = F.question; return '<section class="question-cta"><span class="micro-badge"><i aria-hidden="true"></i>' + esc(q.badge) + "</span><h2>" + esc(q.title) + "</h2>" + (q.desc ? "<p>" + nl(q.desc) + "</p>" : "") +
      (q.promise ? '<p class="q-promise">' + SV(IC.check, 18) + "<span>" + nl(q.promise) + "</span></p>" : "") +
      (q.url ? '<a class="primary-cta" href="' + esc(q.url) + '" target="_blank" rel="noreferrer">' : '<a class="primary-cta" href="#" data-fc="question">') + SV(IC.msg) + esc(q.label) + "</a>" + (q.note ? "<small>" + esc(q.note) + "</small>" : "") + "</section>"; };
  FC.gifts = (F) => {
    const g = F.gifts, items = (g.items || []).filter((x) => x.title), now = Date.now();
    if (!items.length) return "";
    return '<section class="gift-section"><div class="section-heading"><span>' + esc(g.kicker) + "</span><h2>" + esc(g.title) + "</h2><p>" + items.map((x) => giftOpen(x, now) ? "D-DAY" : dayLabel(x.openAt, now)).join(" · ") + "에 한 권씩 순차 오픈됩니다.<br>" + esc(g.desc || "") + "</p></div>" +
      '<div class="gift-grid">' + items.map((x, i) => {
        const open = giftOpen(x, now), n = i + 1;
        return '<article class="gift-card gift-card--' + (ACCENT[x.color] || "blue") + (open ? " is-unlocked" : "") + '"' + (open ? "" : ' data-open-at="' + esc(x.openAt || "") + '"') + '><span class="gift-day">' + (open ? "D-DAY" : dayLabel(x.openAt, now)) + "</span>" +
          '<div class="gift-book"><div class="gift-book-3d"><span class="gift-pages" aria-hidden="true"></span><span class="gift-ribbon" aria-hidden="true"></span>' +
          '<a class="gift-cover"' + (open && x.url ? ' href="' + esc(x.url) + '" target="_blank" rel="noreferrer"' : ' href="#" data-fc="gift" data-open="' + (open ? 1 : 0) + '" data-date="' + esc(x.openAt || "") + '"') + ' aria-label="' + esc(x.title) + (open ? " 전자책 열기" : " 공개 전") + '">' +
            '<span class="gift-spine" aria-hidden="true"></span><span class="gift-cover-overlay" aria-hidden="true"></span><span class="gift-cover-number" aria-hidden="true">' + pad(n) + "</span>" +
            '<span class="gift-cover-top"><strong><small>VOL.</small>' + pad(n) + "</strong><i>" + esc(F.hero.instructor) + " 무료강의 선물</i></span>" +
            '<span class="gift-cover-bottom">' + (open ? "" : (() => { const w = whenParts(x.openAt); return '<span class="lock-state"><span class="lock-ic">' + SV(IC.lock, 20) + '</span><b>공개 예정 · ' + esc(dayLabel(x.openAt, now)) + "</b><em>" + (w ? esc(w.day) + "<br>" + esc(w.time) : esc(lockWhen(x.openAt))) + "</em></span>"; })()) + '<span class="gift-rule" aria-hidden="true"></span><strong>' + esc(x.title) + "</strong><small>" + esc(F.hero.instructor) + " 지음 · " + n + "번 선물</small>" +
              (open ? '<span class="open-hint">' + SV(IC.unlock, 16) + "전자책 열기</span>" : "") + "</span></a></div></div>" +
          "<h3>" + esc(x.title) + "</h3>" + (x.desc ? "<p>" + esc(x.desc) + "</p>" : "") +
          '<span class="gift-status' + (open ? " is-open" : "") + '">' + SV(open ? IC.down : IC.lock, open ? 15 : 14) + (open ? "공개됨 · 표지를 눌러 열기" : esc(leftLabel(x.openAt, now))) + "</span></article>";
      }).join("") + "</div>" +
      '<div class="gift-timeline" aria-label="선물 공개 일정">' + items.map((x, i) => "<span><strong>" + (giftOpen(x, now) ? "D-DAY" : dayLabel(x.openAt, now)) + "</strong>" + (i + 1) + "번째 선물 오픈</span>").join("") + "</div></section>";
  };
  FC.kakao = (F) => { const k = F.kakao; if (!k.url) return ""; return '<section class="question-cta question-cta--compact"><span class="micro-badge micro-badge--kakao">' + esc(k.badge) + "</span><h2>" + esc(k.title) + "</h2>" + (k.desc ? "<p>" + nl(k.desc) + "</p>" : "") +
      '<a class="kakao-cta" href="' + esc(k.url) + '" target="_blank" rel="noreferrer">' + esc(k.label) + '<span aria-hidden="true">→</span></a>' + (k.note ? "<small>" + esc(k.note) + "</small>" : "") + "</section>"; };
  FC.live = (F) => {
    const L = F.live, title = L.liveTitle || F.hero.title;
    // 강의 플랫폼 로고(예: 아이비클래스)는 섹션 맨 위에 크게 — 누르면 신청 페이지로
    const plat = L.platformLogo ? '<div class="bk-plat-hero"><span class="bk-plat-hero-tag"><i aria-hidden="true"></i>무료 LIVE 강의 진행 플랫폼</span>' +
      (L.url ? '<a class="bk-plat-hero-logo" href="' + esc(L.url) + '" target="_blank" rel="noreferrer" aria-label="' + esc(L.platform || "강의 플랫폼") + ' 신청 페이지 열기">' : '<span class="bk-plat-hero-logo">') +
      '<img src="' + esc(L.platformLogo) + '" alt="' + esc(L.platform || "강의 플랫폼") + '">' + (L.url ? "</a>" : "</span>") + "</div>" : "";
    return '<section class="upcoming-course" aria-labelledby="upcoming-course-title">' + plat + '<div class="upcoming-course-heading"><span>' + esc(L.kicker) + '</span><h2 id="upcoming-course-title">' + esc(L.title) + "</h2>" + (L.desc ? "<p>" + esc(L.desc) + "</p>" : "") + "</div>" +
      '<article class="upcoming-course-card"><div class="upcoming-course-image">' + (L.image ? '<img src="' + esc(L.image) + '" alt="' + esc(title.replace(/\n/g, " ")) + ' 대표 이미지">' : '<div class="fc-poster-auto"><b>' + esc(shortWhen(F.liveAt)) + " 무료강의</b><strong>" + esc(title).replace(/\n/g, "<br>") + "</strong><small>강사 " + esc(F.hero.instructor) + "</small></div>") + (L.tag ? "<span>" + esc(L.tag) + "</span>" : "") + "</div>" +
        '<div class="upcoming-course-content">' + (L.platform || L.platformLogo ? '<div class="upcoming-platform"><span class="bk-live-chip"><i aria-hidden="true"></i>LIVE 진행</span>' + (L.platform ? "<strong>" + esc(L.platform) + (L.platformLogo ? "에서 진행" : "") + "</strong>" : "") + "</div>" : "") +
          '<span class="upcoming-date">' + SV(IC.cal, 17) + esc(longWhen(F.liveAt)) + "</span>" +
          '<p class="upcoming-instructor">강사 <strong>' + esc(F.hero.instructor) + "</strong></p><h3>" + title.split("\n").map((x) => "<span>" + esc(x) + "<br></span>").join("") + "</h3>" +
          (L.summary ? '<p class="upcoming-description">' + esc(L.summary) + "</p>" : "") + ((L.points || []).length ? "<ul>" + L.points.map((x) => "<li>" + SV(IC.check, 17) + esc(x) + "</li>").join("") + "</ul>" : "") +
          (freeEnded(F) ? '<span class="upcoming-course-cta is-off" aria-disabled="true">신청이 마감됐어요</span>' : '<a class="upcoming-course-cta" href="' + esc(L.url || "#") + '"' + (L.url ? ' target="_blank" rel="noreferrer"' : ' data-fc="nolink"') + ">" + esc(L.label) + SV(IC.ext, 18) + "</a>") + (L.note ? "<small>" + esc(L.note) + "</small>" : "") +
        "</div></article></section>";
  };
  FC.faq = (F, c) => {
    const q = F.faq, items = (q.items || []).filter((x) => x.q);
    if (!items.length) return "";
    return '<section class="fc-faq" aria-label="자주 묻는 질문"><div class="section-heading"><span>' + esc(q.kicker) + "</span><h2>" + esc(q.title) + "</h2></div>" +
      '<div class="fc-faq-list">' + items.map((x) => "<details><summary>" + esc(x.q) + SV(IC.chev, 18) + "</summary><p>" + nl(x.a) + "</p></details>").join("") + "</div></section>";
  };
  function nzFreeBand(F) {
    const w = whenParts(F.liveAt), day = w ? w.day.replace(/ \(.\)$/, "") : "무료강의";
    const tiles = [["sprout", "청정 자연에서 온 원료", "남반구 청정 섬나라의 자연에서 자란 원료로 만들어요."], ["shieldCheck", "까다로운 식품 안전 기준", "뉴질랜드 1차산업부(MPI)의 기준 아래 관리되는 제품이에요."],
      ["sparkles", "한국에서 사랑받는 품목", "마누카꿀 · 프로폴리스 · 초록입홍합 · 초유처럼 찾는 사람이 많아요."], ["factory", "아시아 최초 공장 승인 · 소량 제조", "적은 수량으로 내 브랜드 제품을 만드는 방법, " + day + " 무료강의에서 모두 공개해요."]];
    return '<section class="nz-why" aria-labelledby="nz-why-t"><span class="nz-why-fern f1" aria-hidden="true">' + FERN + '</span><span class="nz-why-fern f2" aria-hidden="true">' + FERN + "</span>" +
      '<div class="nz-why-in"><p class="nz-why-k"><span class="nz-flag">' + NZ_FLAG + "</span>WHY NEW ZEALAND · AOTEAROA</p>" +
      '<h2 id="nz-why-t">왜 지금, <em>뉴질랜드</em> 건강식품일까요?</h2><p class="nz-why-d">‘길고 흰 구름의 나라’ 아오테아로아(Aotearoa). 청정 자연과 까다로운 기준이 만든 뉴질랜드 건강식품은 한국에서도 오래 사랑받아 왔어요.</p>' +
      '<div class="nz-why-g">' + tiles.map((x, i) => '<div class="nz-why-t' + (i === 3 ? " hot" : "") + '"><span class="nz-why-i">' + icon(x[0]) + "</span><small>0" + (i + 1) + "</small><b>" + x[1] + "</b><p>" + esc(x[2]) + "</p></div>").join("") + "</div></div></section>";
  }
  // 스토어에서 들어왔으면 보던 스토어 화면으로, 아니면 DOOGO CLASS 첫 화면으로
  function dcBack() { try { const h = sessionStorage.getItem("dc:last") || ""; return /^#\/vod(\/|\?|$)/.test(h) ? h : "#/vod"; } catch (e) { return "#/vod"; } }
  function renderFree(id, force) {
    const ins = DB.instructor(id);
    const F = ins && ins.status === "active" ? DB.freeOf(id) : null;
    const adm = DB.session.admin();
    const canSee = adm && (adm.role === "master" || adm.instructorId === id || adm.actingAs === id);
    if (!F || (!F.published && !canSee)) {
      document.title = "두잉고";
      root.innerHTML = '<main class="lp lp-empty"><div>' + window.doogoClassWord("lp-empty-word") + "<h1>준비 중인 페이지예요</h1><p>곧 무료강의 안내가 올라와요.</p></div></main>";
      return;
    }
    const c = DB.content(id), h = F.hero, lines = String(h.title || "").split("\n").filter(Boolean), nz = isNz(c);
    // 내용이 그대로면 다시 그리지 않아요 — 서버 새 소식 · 1초 카운트다운 때문에 보던 영상이 끊기지 않게 (영상 넘기기 · 공개일 · 종료는 다시 그려요)
    const now0 = Date.now(), sig = JSON.stringify([id, F, vIdx, !!canSee, freeEnded(F), countdownParts(F.liveAt).expired, (F.gifts.items || []).map((x) => giftOpen(x, now0))]);
    if (!force && root.__fcSig === sig && root.querySelector(".dg.bk")) return;
    root.__fcSig = sig;
    document.title = lines.join(" ") + " · " + h.instructor + " 무료강의";
    // 올블랙 바탕 + 강사 색 포인트. 강사마다 다른 건 색 · 썸네일 · 문구 — 뉴질랜드 테마(문대표)는 하늘 · 산 · 고사리 초록의 밝은 화면
    const t = DB.themeOf(c.brand.theme);
    const vars = nz ? "--p:#0e7a4b;--pa:#0b6a41;--on:#fff;--pale:#e6f4ec;--deep:#075234;--ac:#0e7a4b;--rgb:14,122,75"
      : "--p:" + t.primary + ";--pa:" + t.active + ";--on:" + (t.onPrimary || t.deep) + ";--pale:" + t.pale + ";--deep:" + t.deep + ";--ac:" + (t.accent || t.primary) + ";--rgb:" + t.rgb;
    const rest = F.order.filter((k) => k !== "countdown" && !F.off[k] && FC[k]).map((k) => FC[k](F, c)).join("");
    const L = F.live, thumb = L.image;
    const art = '<div class="bk-art" aria-hidden="true"><div class="bk-frame">' +
        (thumb ? '<img src="' + esc(thumb) + '" alt="">' : '<div class="fc-poster-auto"><b>' + esc(shortWhen(F.liveAt)) + " 무료강의</b><strong>" + esc(L.liveTitle || h.title).replace(/\n/g, "<br>") + "</strong><small>강사 " + esc(h.instructor) + "</small></div>") +
        '<span class="bk-shine"></span></div><span class="bk-frame-shadow"></span>' +
        (nz ? '<span class="nz-stamp"><span class="nz-flag">' + NZ_FLAG + "</span><b>NEW ZEALAND</b><small>Aotearoa</small></span>" : "") +
        '<span class="bk-tile t1">' + SV(IC.play, 26) + '</span><span class="bk-tile t2">' + SV(IC.msg, 24) + '</span><span class="bk-tile t3">' + SV(IC.cal, 22) + "</span></div>";
    root.innerHTML = '<div class="dg bk' + (nz ? " nz" : "") + '" style="' + vars + '"><div class="landing-page">' +
      (!F.published ? '<div class="fc-draft">' + icon("eyeOff", "sm") + "비공개 상태예요. 강사센터 ‘무료강의 페이지’에서 ‘공개 중’으로 바꾸면 누구나 볼 수 있어요.</div>" : "") +
      '<section class="bk-hero"><span class="bk-glow" aria-hidden="true"></span><span class="bk-floor" aria-hidden="true"></span>' +
      (nz ? '<span class="nz-sky" aria-hidden="true"><i class="nz-cloud c1"></i><i class="nz-cloud c2"></i><i class="nz-cloud c3"></i></span><span class="nz-hero-fern" aria-hidden="true">' + FERN + "</span>" + NZ_SCENE : "") +
      '<nav class="bk-nav" aria-label="사이트 이동"><a class="bk-nav-a bk-nav-dc" href="' + esc(dcBack()) + '">' + SV(IC.left, 16) + '<img src="assets/brand/doogo-class-word.svg" alt="DOOGO CLASS"><span>바로가기</span></a>' +
        '<a class="bk-nav-a bk-nav-dg" href="#/doinggo" aria-label="두잉고 홈으로">' + window.doinggoB(nz ? "black" : "white", "bk-nav-dgl") + "<span>홈</span></a></nav>" +
      '<div class="bk-hero-in">' +
        '<header class="hero bk-hero-txt">' + (nz ? '<p class="nz-hi"><span class="nz-flag">' + NZ_FLAG + '</span><b lang="mi">Kia ora!</b><span>뉴질랜드에서 인사드려요</span></p>' : "") + (h.badge ? '<span class="top-badge"><i aria-hidden="true"></i>' + esc(h.badge) + "</span>" : "") +
          '<p class="instructor">강사 · <strong>' + esc(h.instructor) + "</strong></p><h1>" + lines.map((l, i) => (i === lines.length - 1 && lines.length > 1 ? "<em>" + esc(l) + "</em>" : "<span>" + esc(l) + "</span>")).join("") + "</h1>" +
          (h.sub ? '<p class="hero-copy">' + nl(h.sub) + "</p>" : "") + (h.note ? '<small class="disclaimer">' + esc(h.note) + "</small>" : "") + "</header>" +
        art + (!F.off.countdown ? '<div class="bk-hero-count">' + FC.countdown(F, c) + "</div>" : "") +
      "</div></section>" + (nz ? nzFreeBand(F) : "") +
      "<main>" + rest + "</main>" +
      (nz ? (() => { const w = whenParts(F.liveAt); return '<div class="nz-bye"><span class="nz-bye-fern" aria-hidden="true">' + FERN + '</span><p><span class="nz-flag">' + NZ_FLAG + '</span><b lang="mi">Ka kite anō!</b></p><span>' + (w && !freeEnded(F) ? esc(w.day + " " + w.time) + ", 라이브에서 만나요" : "다음 무료강의에서 또 만나요") + "</span><small>‘다음에 또 만나요’라는 뜻의 마오리어 인사예요</small></div>"; })() : "") +
      // 맨 아래 상호를 누르면 강사센터의 무료강의 페이지 편집으로
      '<footer><a href="#/center/free" aria-label="강사센터 무료강의 페이지 편집으로 이동">© 2026 ' + esc(F.company || c.brand.name) + "</a></footer>" +
      '<div class="fc-powered-row">' + window.poweredBy("white") + "</div>" +
      "</div></div>";
    // 대표 영상 썸네일: 큰 그림(maxres)이 없는 영상은 기본 그림으로
    root.querySelectorAll(".fc-intro-play img[data-alt]").forEach((im) => im.addEventListener("error", function fb() { if (im.dataset.alt) { im.src = im.dataset.alt; im.removeAttribute("data-alt"); } else { im.style.visibility = "hidden"; im.removeEventListener("error", fb); } }));
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
  /* ---------- 강사 소개 페이지 모션: 첫 화면 등장 · 스크롤하면 하나씩 떠오르기 · 숫자 올라가기 · 로드맵 선 그리기 ---------- */
  let lpIO = null;
  function countUp(el) {
    const m = String(el.textContent).match(/^(\d+)(.*)$/); if (!m || el.dataset.counted) return;
    el.dataset.counted = "1";
    const to = +m[1], tail = m[2], t0 = performance.now(), dur = 1100;
    const tick = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e) + tail; if (k < 1) requestAnimationFrame(tick); };
    el.textContent = "0" + tail; requestAnimationFrame(tick);
  }
  function lpMotion() {
    const lp = document.querySelector(".lp"); if (!lp) return;
    if (lpIO) lpIO.disconnect();
    lp.classList.add("lp-motion");
    // 같은 줄(부모) 안에서 순서대로 조금씩 늦게
    const mark = (sel, step) => lp.querySelectorAll(sel).forEach((el) => {
      if (el.closest(".lp-hero")) return;
      const sib = Array.from(el.parentElement.children).filter((x) => x.matches(sel));
      el.classList.add("lp-rv"); el.style.setProperty("--d", String(Math.min(sib.indexOf(el), 6) * (step || 1)));
    });
    mark(".lp-sec .lp-kicker, .lp-sec h2, .lp-sec .lp-lead, .lp-cur-sum, .lp-stats-grid > div, .lp-about-photo, .lp-about > div:last-child, .lp-points article, .lp-forwho, .lp-road-i, .lp-feats > div, .lp-reviews figure, .lp-faq details, .lp-dday, .lp-flow li, .lp-sched, .lp-enroll-card, .lp-iv-copy, .lp-iv-v, .lp-cal-m, .lp-cta h2, .lp-cta p, .lp-cta .lp-btn, .lp-cta-co");
    lp.querySelectorAll(".lp-road, .lp-career li, .lp-incl li").forEach((el) => el.classList.add("lp-rv-k"));
    lpIO = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target; el.classList.add("in"); lpIO.unobserve(el);
      if (el.matches(".lp-stats-grid > div")) { const b = el.querySelector("b"); if (b) countUp(b); }
      if (el.matches(".lp-cur-sum")) el.querySelectorAll("b").forEach(countUp);
    }), { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    lp.querySelectorAll(".lp-rv, .lp-rv-k").forEach((el) => lpIO.observe(el));
    // 첫 화면은 바로 등장
    requestAnimationFrame(() => requestAnimationFrame(() => lp.classList.add("lp-ready")));
  }
  /* ---------- 강사 소개 영상 (무료강의 영상 중 ‘강사 이야기’에 맞는 것 하나) ---------- */
  function introVideo(id) {
    const items = ((DB.freeOf(id) || {}).videos || {}).items || [];
    const vids = items.filter((x) => DB.youtubeId(x.youtube));
    if (!vids.length) return null;
    return vids.find((x) => /인생|이야기|스토리|창업|시작/.test(x.title || "")) || vids[0];
  }
  // 강사 영상: 강사센터에 넣은 ‘강사 소개 영상’ → 없으면 무료강의 영상 중 하나
  function videoOf(id, L) {
    const u = ((L && L.about) || {}).video;
    if (DB.youtubeId(u)) return { youtube: u, title: (L.about.videoTitle || "").trim() };
    return introVideo(id);
  }
  S.video = (L, c, ins) => {
    const v = videoOf(ins.id, L), yt = (c.brand || {}).youtubeChannel || (L.contact || {}).youtube || "";
    if (!v) return "";
    const y = DB.youtubeId(v.youtube), nm = L.about.name || c.brand.instructor || ins.displayName;
    return '<section class="lp-sec lp-vsec" id="lp-video"><div class="lp-wrap"><div class="lp-iv">' +
      '<div class="lp-iv-copy"><p class="lp-kicker">MEET THE INSTRUCTOR</p><h2>' + esc(nm) + "는<br>어떤 사람일까요?</h2>" +
        (v.title ? '<p class="lp-iv-t">“' + esc(v.title) + "”</p>" : "") +
        '<p class="lp-iv-s">어떤 사람이 어떻게 해냈는지, 강의를 듣기 전에 영상으로 먼저 만나 보세요.</p>' +
        (yt ? '<a class="lp-yt" href="' + esc(yt) + '" target="_blank" rel="noopener"><span class="lp-yt-ic" aria-hidden="true"><svg viewBox="0 0 28 20"><rect width="28" height="20" rx="6" fill="#ff0033"/><path d="M11.2 6.1v7.8l6.6-3.9z" fill="#fff"/></svg></span><span class="lp-yt-t"><b>유튜브 채널에서 더 보기</b><small>' + esc((c.brand || {}).name || nm) + "</small></span>" + icon("arrowUpRight", "sm") + "</a>" : "") + "</div>" +
      '<div class="lp-iv-v"><button type="button" class="lp-iv-play" data-lp-yt="' + esc(ytEmbed(v.youtube)) + '" aria-label="' + esc(v.title || nm + " 소개 영상") + ' 재생">' +
        '<img src="https://i.ytimg.com/vi/' + esc(y) + '/hqdefault.jpg" alt="" loading="lazy" onerror="this.remove()">' +
        '<span class="lp-iv-shade"></span><span class="lp-iv-btn">' + SV('<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>', 30) + "</span>" +
        '<span class="lp-iv-cap"><b>' + esc(v.title || nm + " 소개 영상") + "</b><small>" + esc((c.brand || {}).name || nm) + " · 유튜브</small></span></button></div>" +
    "</div></div></section>";
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-lp-yt]"); if (!b) return;
    const src = b.getAttribute("data-lp-yt"); if (!src) return;
    const f = document.createElement("iframe");
    f.src = src + (src.indexOf("?") > -1 ? "&" : "?") + "autoplay=1";
    f.title = b.getAttribute("aria-label") || "강사 소개 영상"; f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen"; f.allowFullscreen = true;
    b.replaceWith(f);
  });
  function render() {
    window.applyStudentTheme(null);
    const id = insIdFromHash();
    if (/^#\/free/.test(ROUTE.hash)) { if (id) renderFree(id); else { root.innerHTML = ""; ROUTE.hash = "#/p"; } return; }
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
      else if (k === "intro-play") {
        const box = f.closest(".fc-intro-frame"), y = box && box.dataset.y; if (!y) return;
        box.innerHTML = '<iframe src="https://www.youtube.com/embed/' + esc(y) + '?rel=0&playsinline=1&autoplay=1" title="대표 영상" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
        box.classList.add("on");
      }
      else if (k === "v-prev" || k === "v-next" || k === "v-go") {
        const n = (DB.freeOf(insIdFromHash()).videos.items || []).filter((x) => DB.youtubeId(x.youtube)).length || 1;
        vIdx = k === "v-go" ? Number(f.dataset.i) : (vIdx + (k === "v-next" ? 1 : -1) + n) % n;
        const y = window.scrollY; renderFree(insIdFromHash(), true); window.scrollTo(0, y);
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
    const F = DB.freeOf(id);
    const done = () => {
      document.getElementById("modal-root").innerHTML = "";
      fcToast("질문을 남겼어요. 강의에서 꼭 다룰게요!");
      if (F.live.url) setTimeout(() => window.open(F.live.url, "_blank", "noopener"), 600);
    };
    // 서버 모드: 로그인 없이 남기는 질문은 서버가 받아서 저장한다 (방문자는 콘텐츠를 직접 고칠 수 없음)
    if (DB.remote.on) {
      DB.remote.call("public", { action: "free-question", iid: id, name: f.qname.value.trim(), text }).then((r) => {
        if (r.error) { document.getElementById("fcq-err").textContent = r.error === "locked" ? "질문이 너무 많아 잠시 막혔어요. 잠시 뒤 다시 남겨 주세요." : "질문을 남기지 못했어요. 잠시 후 다시 시도해 주세요."; return; }
        done();
        DB.remote.poll(true);
      }).catch(() => { document.getElementById("fcq-err").textContent = "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."; });
      return;
    }
    const c = DB.content(id);
    (c.freeQuestions = c.freeQuestions || []).push({ id: DB.uid("fq"), name: f.qname.value.trim(), text, at: Date.now() });
    DB.save();
    done();
  });

  window.LandingApp = { render, mount };
})();
