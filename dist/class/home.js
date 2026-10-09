/* 두고 클래스 — 플랫폼 소개 첫 화면 (주소 맨 앞 · #/about · #/partner)
 *
 *  - 두고 클래스가 어떤 플랫폼인지, 수강생 · 강사에게 무엇을 해 주는지 짧고 간결하게 (타이탄클래스 같은 구성)
 *  - ‘로그인’을 누르면 지금의 수강생 로그인(강사 선택 → 이름 → 휴대폰 뒷자리)으로 간다
 *  - 강사 목록 · 숫자는 지금 운영 중인 강사 데이터에서 바로 가져온다 (꾸며 낸 숫자 없음)
 *  - 회원가입 없이 승인된 수강생만 들어오는 플랫폼이라, 가입 버튼은 두지 않는다
 *  - ‘강사 입점 문의’ 팝업 → 마스터 → 강사 입점 문의에서 관리 (#/partner 로 바로 열 수 있음)
 */
(function () {
  "use strict";

  const root = document.getElementById("root");
  const { esc } = DB;
  const icon = window.icon;
  const isActive = () => document.body.dataset.mode === "home";
  const IMG = "assets/home/";

  /* ---------- 내용 ---------- */
  const STUDENT_TABS = [
    { key: "tutorial", ic: "book", title: "주차별 튜토리얼", img: "st-curriculum", desc: "이번 주에 볼 강의와 할 과제가 순서대로. 1주차부터 차근차근 따라오면 돼요." },
    { key: "mission", ic: "checks", title: "과제 제출 · 피드백", img: "st-missions", desc: "사진 · 링크 · 글로 내면 바로 확인하고, 강사님과 코치가 피드백해요." },
    { key: "cert", ic: "award", title: "진행률 · 수료증", img: "st-cert", desc: "잘 따라가고 있는지 진행률로 보이고, 다 마치면 수료증이 나와요." },
    { key: "bot", ic: "sparkles", title: "24시간 AI 도우미", img: "st-bot", desc: "과제 · 서류 · 일정을 물어보면 강사님 자료로 바로 답해요. 새벽에도요." },
    { key: "channel", ic: "message", title: "강사 · 코치 1:1 소통", img: "st-channels", desc: "막히는 순간 강사님과 코치에게 바로 연결돼요." },
    { key: "guide", ic: "clipboard", title: "실무 가이드", img: "st-docs", desc: "필요한 준비를 단계별로. 기관 · 기간 · 서류 · 강사님 팁까지." },
    { key: "library", ic: "library", title: "유료강의 자료실", img: "st-library", desc: "전자책 · 엑셀 양식 · VOD까지 한 권의 책처럼 정리돼 있어요." },
    { key: "schedule", ic: "calendar", title: "강의 일정 · 공지", img: "st-schedule", desc: "라이브 · 과제 마감 · 공지를 달력으로 한눈에 봐요." }
  ];
  const STUDENT_MORE = [
    ["flame", "동기부여 채널", "지칠 때 다시 힘을 주는 영상"],
    ["handshake", "제휴 혜택", "수강생 전용 할인 · 혜택"],
    ["sprout", "시작 가이드", "처음 들어와도 할 일이 보이게"],
    ["help", "요청사항 · Q&A", "불편한 점은 바로 강사님께"],
    ["phone", "휴대폰 · PC", "어디서든 같은 내 강의실"],
    ["shieldCheck", "승인제 입장", "승인된 수강생만 들어와요"]
  ];
  // 강사센터는 핵심 화면 세 개만 보여 준다 (메뉴 전체는 공개하지 않음)
  const ADMIN_TABS = [
    { key: "dash", title: "대시보드", img: "ad-dash" },
    { key: "students", title: "수강생 진척도", img: "ad-students" },
    { key: "review", title: "과제 검수", img: "ad-review-open" }
  ];
  const ADMIN_FEATURES = [
    ["palette", "내 이름의 강의 플랫폼", "강의 이름 · 색상 · 메뉴까지 강사님 브랜드로."],
    ["activity", "진척도 한눈에", "누가 멈춰 있는지 보이니 먼저 챙길 수 있어요."],
    ["users", "코치와 함께 운영", "검수 · 답변을 코치와 나눠서 해요."],
    ["refresh", "끝난 기수에게도 계속", "새 자료를 올리면 이전 기수도 다시 찾아와요."]
  ];
  const STEPS = [
    ["신청 · 승인", "강사님 강의를 신청하면 확인 후 승인해 드려요."],
    ["로그인", "강사 선택 → 이름 → 휴대폰 뒷자리 4자리"],
    ["1주차부터", "튜토리얼대로 강의를 보고 과제를 내요."],
    ["수료 · 평생 함께", "수료증을 받고, 그 뒤에도 계속 배워요."]
  ];
  const FAQS = [
    ["회원가입은 어떻게 하나요?", "따로 회원가입이 없는 승인제 플랫폼이에요. 강사님 강의를 신청하면 확인 후 승인해 드리고, 승인되면 바로 로그인할 수 있어요."],
    ["로그인은 어떻게 하나요?", "수강 중인 강사님을 고르고, 신청할 때 적은 이름과 휴대폰 번호 뒷자리 4자리를 넣으면 돼요."],
    ["강의가 끝나면 더 이상 못 보나요?", "수료한 뒤에도 내 강의실은 그대로 남아요. 강사님 재량에 따라 새 영상 · 자료가 계속 올라와요."],
    ["휴대폰에서도 쓸 수 있나요?", "네. 휴대폰 · 태블릿 · PC 어디서든 같은 내 강의실이에요. 과제 사진도 휴대폰으로 바로 올려요."],
    ["강사로 두고 클래스를 쓰고 싶어요.", "강사님의 노하우를 튜토리얼 강의 플랫폼으로 만들어 드려요. 아래 ‘강사 입점 문의’를 남겨 주시면 연락드릴게요.", true]
  ];

  /* ---------- 데이터 (지금 운영 중인 강사) ---------- */
  function classes() {
    return DB.activeInstructors().map((x) => {
      const c = DB.content(x.id) || {};
      const b = c.brand || {};
      const t = DB.themeOf(b.theme);
      const weeks = c.weeks || [];
      const L = DB.landingOf ? DB.landingOf(x.id) : null;
      const F = DB.freeOf ? DB.freeOf(x.id) : null;
      const ct = (L && L.contact) || {};
      return {
        id: x.id, name: b.name || x.displayName, who: b.instructor || x.displayName, title: b.courseTitle || "", t,
        photo: b.photo || "", field: b.field || b.shortTitle || "",
        yt: b.youtubeChannel || ct.youtube || "", ig: b.instagram || ct.instagram || "", kakao: b.kakaoChannel || ct.kakao || "",
        weeks: weeks.length, missions: weeks.reduce((n, w) => n + (w.missions || []).length, 0),
        landing: !!(L && L.published), free: !!(F && F.published)
      };
    });
  }

  /* ---------- 조각 ---------- */
  const mark = (t) => '<mark class="hm-mark">' + t + "</mark>";
  // 두고 원본 로고를 빨강 심볼 + 두 줄(doogo / CLASS)로 — 타이탄클래스 로고처럼
  const brandLock = (cls) => '<span class="hm-lock ' + (cls || "") + '" role="img" aria-label="doogo CLASS"><span class="hm-sym"></span><span class="hm-lock-t">' +
    '<img src="assets/brand/doogo-word.png" alt="" width="240" height="84"><span class="hm-lock-cls"><i>C</i><i>L</i><i>A</i><i>S</i><i>S</i></span></span></span>';
  const phone = (img, cls, alt, eager) => '<div class="hm-phone ' + (cls || "") + '"><span class="hm-phone-notch"></span><img src="' + IMG + img + '.webp" alt="' + esc(alt || "") + '"' + (eager ? "" : ' loading="lazy"') + ' decoding="async"></div>';
  const browser = (img, cls, alt, eager) => '<div class="hm-browser ' + (cls || "") + '"><div class="hm-browser-bar"><i></i><i></i><i></i><span>doogo-class.vercel.app</span></div><img src="' + IMG + img + '.webp" alt="' + esc(alt || "") + '"' + (eager ? "" : ' loading="lazy"') + ' decoding="async"></div>';
  const scrollBtn = (to, label, cls) => '<button type="button" class="' + cls + '" data-hm-scroll="' + to + '">' + label + "</button>";
  const applyBtn = (label, cls) => '<button type="button" class="' + cls + '" data-hm-apply>' + label + "</button>";
  const d = (i) => ' style="--i:' + i + '"';
  // 타이탄클래스처럼: 아이콘 + 굵은 제목 + 오른쪽 화살표 · 아래 구분선
  const secHead = (ic, title, sub, right) => '<div class="hm-shead hm-reveal"><div class="hm-shead-row"><h2 class="hm-h2"><span class="hm-shead-ic">' + icon(ic) + "</span>" + title + "</h2>" + (right || "") + "</div>" +
    (sub ? '<p class="hm-sub">' + sub + "</p>" : "") + "</div>";

  let stTab = "tutorial", adTab = "dash";

  function header() {
    return '<header class="hm-top" id="hm-top"><div class="hm-wrap hm-top-in">' +
      '<button type="button" class="hm-logo" data-hm-scroll="top" aria-label="두고 클래스 맨 위로">' + brandLock() + "</button>" +
      '<nav class="hm-nav" aria-label="소개 메뉴">' +
        scrollBtn("hm-classes", "강사진", "hm-nav-a") + scrollBtn("hm-platform", "플랫폼", "hm-nav-a") + scrollBtn("hm-students", "수강생", "hm-nav-a") +
        scrollBtn("hm-teachers", "강사", "hm-nav-a") + scrollBtn("hm-faq", "자주 묻는 질문", "hm-nav-a") + applyBtn("입점 문의", "hm-nav-a hm-nav-apply") +
      "</nav>" +
      '<div class="hm-top-r"><a class="hm-btn hm-btn-ghost hm-btn-sm" href="#/center">강사센터</a><a class="hm-btn hm-btn-p hm-btn-sm" href="#/login">로그인</a></div>' +
    "</div></header>";
  }

  function hero() {
    return '<section class="hm-hero" id="hm-hero"><div class="hm-hero-glow" aria-hidden="true"></div><div class="hm-wrap hm-hero-in">' +
      '<div class="hm-hero-copy">' +
        '<p class="hm-pill"><i class="hm-dot"></i>승인된 수강생만 들어오는 강의 플랫폼</p>' +
        '<h1 class="hm-h1">따라만 하면 완성되는<br>' + mark("튜토리얼 강의 플랫폼") + "</h1>" +
        '<p class="hm-lead">강사님의 노하우를 <b>1주차부터 수료까지</b> 순서대로 담았어요. 수강생은 따라오고, 강사님은 모든 진도를 한눈에 봐요.</p>' +
        '<div class="hm-cta"><a class="hm-btn hm-btn-p hm-btn-lg" href="#/login">수강생 로그인' + icon("arrowRight", "sm") + "</a>" + applyBtn("강사 입점 문의", "hm-btn hm-btn-sec hm-btn-lg") + "</div>" +
        '<p class="hm-note">' + icon("shieldCheck", "xs") + "회원가입 없이, 강사님이 승인한 수강생만 로그인할 수 있어요</p>" +
      "</div>" +
      '<div class="hm-hero-art">' +
        browser("ad-dash", "hm-hero-browser", "강사센터 대시보드 화면", true) +
        '<div class="hm-hero-phone-wrap">' + phone("st-home", "hm-hero-phone", "수강생 홈 화면", true) + "</div>" +
        '<div class="hm-chip hm-chip-a">' + icon("check", "sm ok") + "<span><b>1주차 과제 승인</b><small>OOO 강사님 · 방금</small></span></div>" +
        '<div class="hm-chip hm-chip-b"><span><small>3기 평균 진도</small><b>72%</b></span><i class="hm-chip-bar"><i style="width:72%"></i></i></div>' +
        '<div class="hm-chip hm-chip-c">' + icon("award", "sm") + "<span><b>수료증 발급</b><small>필수 과제 23개 통과</small></span></div>" +
      "</div>" +
    "</div></section>";
  }

  function stats(list) {
    const weeks = list.reduce((n, x) => n + x.weeks, 0), missions = list.reduce((n, x) => n + x.missions, 0);
    const item = (i, num, unit, label) => '<div class="hm-stat hm-reveal"' + d(i) + '><span>' + label + "</span><b>" + num + "<small>" + unit + "</small></b></div>";
    return '<section class="hm-stats" aria-label="두고 클래스 숫자"><div class="hm-wrap hm-stats-in">' +
      item(0, list.length, "명", "함께하는 강사") + item(1, weeks, "주", "튜토리얼 커리큘럼") + item(2, missions, "개", "주차별 실전 과제") + item(3, 24, "시간", "AI 도우미 응답") +
    "</div></section>";
  }

  /* 강사진 — 프로필 사진 카드 (타이탄클래스 강사진처럼: 사진 · 이름 · 분야 · 구분선 · SNS) */
  const SNS = {
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><path d="M17.5 6.5h.01"/></svg>',
    kakao: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>'
  };
  const SILHOUETTE = '<svg class="hm-tc-ph" viewBox="0 0 200 250" aria-hidden="true"><circle cx="100" cy="92" r="44"/><path d="M18 250c4-58 40-92 82-92s78 34 82 92Z"/></svg>';
  function classList(list) {
    const sns = (x) => [["youtube", x.yt, "유튜브"], ["instagram", x.ig, "인스타그램"], ["kakao", x.kakao, "카카오톡"]]
      .filter((v) => /^https?:\/\//i.test(v[1]))
      .map((v) => '<a class="hm-sns" href="' + esc(v[1]) + '" target="_blank" rel="noopener" aria-label="' + esc(x.who) + " " + v[2] + '">' + SNS[v[0]] + "</a>").join("");
    const card = (x, i) => {
      const photo = '<span class="hm-tc-shape" aria-hidden="true"></span>' + (x.photo ? '<img src="' + esc(x.photo) + '" alt="' + esc(x.who) + ' 강사" loading="lazy" decoding="async">' : SILHOUETTE) +
        '<span class="hm-tc-tag">' + x.weeks + "주 과정 · 과제 " + x.missions + "개</span>";
      return '<article class="hm-tc hm-reveal" style="--i:' + i + ";--c-p:" + esc(x.t.primary) + '">' +
        (x.landing ? '<a class="hm-tc-photo" href="#/p/' + esc(x.id) + '" aria-label="' + esc(x.who) + ' 강의 소개">' + photo + "</a>" : '<div class="hm-tc-photo">' + photo + "</div>") +
        '<div class="hm-tc-body"><h3>' + esc(x.who) + '</h3><p class="hm-tc-field">' + esc(x.field) + '</p><p class="hm-tc-course">' + esc(x.title) + "</p></div>" +
        '<div class="hm-tc-foot"><span class="hm-tc-sns">' + sns(x) + '</span><span class="hm-tc-links">' +
          (x.landing ? '<a href="#/p/' + esc(x.id) + '">강의 소개</a>' : "") + (x.free ? '<a href="#/free/' + esc(x.id) + '">무료 강의</a>' : "") +
          '<a class="hm-tc-login" href="#/login?ins=' + esc(x.id) + '">로그인</a></span></div>' +
      "</article>";
    };
    return '<section class="hm-sec" id="hm-classes"><div class="hm-wrap">' +
      secHead("award", "두고 클래스와 함께하는 강사진", "강사님마다 자기 이름과 커리큘럼으로 운영하는 강의 플랫폼이에요.", applyBtn("입점 문의" + icon("arrowRight", "sm"), "hm-shead-link")) +
      '<div class="hm-tcs">' + list.map(card).join("") + "</div>" +
      '<div class="hm-join hm-reveal"><span class="hm-join-ic">' + icon("plus") + '</span><div class="hm-join-t"><b>강사님의 노하우도 두고 클래스로</b><p>지금 하고 있는 강의를 튜토리얼 강의 플랫폼으로 만들어 드려요.</p></div>' +
        applyBtn("강사 입점 문의하기" + icon("arrowRight", "sm"), "hm-btn hm-btn-p") + "</div>" +
    "</div></section>";
  }

  function pillars() {
    const p = (i, ic, t, txt, pts) => '<article class="hm-pillar hm-hov hm-reveal"' + d(i) + '><span class="hm-ic">' + icon(ic) + "</span><h3>" + t + "</h3><p>" + txt + '</p><ul class="hm-pillar-list">' + pts.map((x) => "<li>" + icon("check", "xs") + x + "</li>").join("") + "</ul></article>";
    return '<section class="hm-sec hm-soft" id="hm-platform"><div class="hm-wrap">' +
      secHead("layers", "강의 하나에 필요한 모든 것", "흩어진 영상 · 자료 · 과제 · 소통을 한 곳에 모았어요.") +
      '<div class="hm-pillars">' +
        p(0, "book", "튜토리얼 커리큘럼", "1주차부터 순서대로, 처음 시작해도 차근차근.", ["주차별 강의 · 목표", "과제 단계 안내", "실무 가이드 · 자료실"]) +
        p(1, "activity", "진도 관리와 케어", "수강생도, 강사님도 진도가 한눈에 보여요.", ["진행률 · 수료증", "강사 · 코치 피드백", "AI 도우미 · 1:1 소통"]) +
        p(2, "heart", "평생 네트워크", "수료 후에도 강의실은 남고 연결은 이어져요.", ["수료 후에도 계속 이용", "이전 기수에게도 새 자료", "단골 수강생 · 나만의 팬"]) +
      "</div>" +
    "</div></section>";
  }

  function students() {
    const cur = STUDENT_TABS.find((x) => x.key === stTab) || STUDENT_TABS[0];
    return '<section class="hm-sec" id="hm-students"><div class="hm-wrap">' +
      secHead("book", "수강생은 길을 잃지 않아요", "로그인하면 내 강사님의 강의실이 열려요. 오늘 할 일과 내 진도가 언제나 보여요.") +
      '<div class="hm-show">' +
        '<div class="hm-show-tabs" role="tablist" aria-label="수강생 기능">' + STUDENT_TABS.map((x) =>
          '<button type="button" role="tab" class="hm-tab' + (x.key === cur.key ? " on" : "") + '" aria-selected="' + (x.key === cur.key) + '" data-hm-st="' + x.key + '">' +
            '<span class="hm-tab-ic">' + icon(x.ic) + '</span><span class="hm-tab-t"><b>' + x.title + "</b><small>" + x.desc + "</small></span></button>").join("") +
        "</div>" +
        '<div class="hm-show-art"><div class="hm-show-glow" aria-hidden="true"></div>' + phone(cur.img, "hm-show-phone", cur.title + " 화면") +
          '<p class="hm-show-cap"><b>' + cur.title + "</b><span>" + cur.desc + "</span></p></div>" +
      "</div>" +
      '<div class="hm-more">' + STUDENT_MORE.map((x, i) => '<div class="hm-more-i hm-hov hm-reveal"' + d(i) + '><span class="hm-ic hm-ic-sm">' + icon(x[0]) + "</span><b>" + x[1] + "</b><span>" + x[2] + "</span></div>").join("") + "</div>" +
    "</div></section>";
  }

  function teachers() {
    const cur = ADMIN_TABS.find((x) => x.key === adTab) || ADMIN_TABS[0];
    return '<section class="hm-sec hm-soft" id="hm-teachers"><div class="hm-wrap">' +
      secHead("activity", "강사님은 모든 수강생을 한눈에", "강사센터에서 진도 · 과제 · 수강생을 관리하고, 코치와 나눠서 운영해요.") +
      '<div class="hm-atabs" role="tablist" aria-label="강사센터 화면">' + ADMIN_TABS.map((x) => '<button type="button" role="tab" class="hm-atab' + (x.key === cur.key ? " on" : "") + '" aria-selected="' + (x.key === cur.key) + '" data-hm-ad="' + x.key + '">' + x.title + "</button>").join("") + "</div>" +
      '<div class="hm-ashot">' + browser(cur.img, "hm-admin-browser", "강사센터 " + cur.title + " 화면") + '<p class="hm-cap">실제 강사센터 화면 일부 · 예시 데이터 (이름은 가렸어요)</p></div>' +
      '<div class="hm-feats">' + ADMIN_FEATURES.map((x, i) => '<article class="hm-feat hm-hov hm-reveal"' + d(i) + '><span class="hm-ic">' + icon(x[0]) + "</span><h3>" + x[1] + "</h3><p>" + x[2] + "</p></article>").join("") + "</div>" +
    "</div></section>";
  }

  function journey() {
    return '<section class="hm-sec" id="hm-how"><div class="hm-wrap">' +
      secHead("checks", "시작은 이렇게 간단해요", "회원가입 대신 승인제로 운영해요.", '<a class="hm-shead-link" href="#/login">로그인 화면' + icon("arrowRight", "sm") + "</a>") +
      '<ol class="hm-steps">' + STEPS.map((s, i) => '<li class="hm-step hm-hov hm-reveal"' + d(i) + '><span class="hm-step-no">' + String(i + 1).padStart(2, "0") + "</span><b>" + s[0] + "</b><p>" + s[1] + "</p></li>").join("") + "</ol>" +
    "</div></section>";
  }

  function lifelong() {
    const pts = [["refresh", "새 영상 · 자료 업데이트"], ["message", "강사 · 코치와 계속 소통"], ["heart", "단골 수강생 · 나만의 팬"]];
    return '<section class="hm-sec hm-life"><div class="hm-wrap hm-life-in hm-reveal">' +
      '<h2 class="hm-h2 hm-h2-xl">한 번 들어오면,<br>' + mark("평생 함께") + ".</h2>" +
      '<p class="hm-sub">강의가 끝나도 강의실은 남아요. 강사님이 올리는 새 정보로 계속 연결되고, 그 연결이 강사님만의 단골과 팬이 돼요.</p>' +
      '<div class="hm-life-pts">' + pts.map((x, i) => '<span class="hm-life-pt hm-hov"' + d(i) + ">" + icon(x[0], "sm") + x[1] + "</span>").join("") + "</div>" +
    "</div></section>";
  }

  function faq() {
    return '<section class="hm-sec hm-soft" id="hm-faq"><div class="hm-wrap hm-faq-in">' +
      secHead("help", "자주 묻는 질문") +
      '<div class="hm-faqs hm-reveal">' + FAQS.map((q, i) => '<details class="hm-faq"' + (i === 0 ? " open" : "") + "><summary><span>Q</span>" + q[0] + icon("chevDown", "sm") + "</summary><p>" + q[1] + "</p>" +
        (q[2] ? '<div class="hm-faq-cta">' + applyBtn("강사 입점 문의하기" + icon("arrowRight", "sm"), "hm-btn hm-btn-p hm-btn-sm") + "</div>" : "") + "</details>").join("") + "</div>" +
    "</div></section>";
  }

  function finalCta() {
    return '<section class="hm-final"><div class="hm-wrap hm-final-in">' +
      '<h2 class="hm-h2">오늘의 한 걸음이<br>수료증이 되는 곳</h2>' +
      "<p>내 강사님이 준비해 둔 튜토리얼이 기다리고 있어요.</p>" +
      '<div class="hm-cta hm-cta-c"><a class="hm-btn hm-btn-inv hm-btn-lg" href="#/login">수강생 로그인' + icon("arrowRight", "sm") + "</a>" + applyBtn("강사 입점 문의", "hm-btn hm-btn-onred hm-btn-lg") + "</div>" +
    "</div></section>";
  }

  function footer() {
    return '<footer class="hm-foot"><div class="hm-wrap hm-foot-in">' +
      '<div class="hm-foot-brand">' + brandLock() + "<small>두고 클래스 · 튜토리얼 강의 플랫폼</small></div>" +
      '<nav class="hm-foot-links" aria-label="바로가기"><a href="#/login">수강생 로그인</a><a href="#/center">강사센터</a>' + applyBtn("강사 입점 문의", "hm-foot-apply") +
        '<a href="https://www.doogoconnect.com/" target="_blank" rel="noopener">두고커넥트</a><a href="https://www.doogofood.com/" target="_blank" rel="noopener">두고푸드</a></nav>' +
      '<div class="hm-foot-bottom"><span>운영 (주)두고홀딩스 · © 2026 doogo. All rights reserved.</span></div>' +
    "</div></footer>";
  }

  /* ---------- 강사 입점 문의 팝업 ---------- */
  const field = (name, label, opt) => {
    opt = opt || {};
    const req = opt.req ? ' <em aria-hidden="true">*</em>' : ' <small>(선택)</small>';
    const attrs = ' id="ap-' + name + '" name="' + name + '"' + (opt.req ? " required" : "") + (opt.ph ? ' placeholder="' + esc(opt.ph) + '"' : "") + (opt.ac ? ' autocomplete="' + opt.ac + '"' : "") + (opt.max ? ' maxlength="' + opt.max + '"' : "");
    const input = opt.area ? '<textarea class="hm-in"' + attrs + ' rows="' + (opt.rows || 3) + '"></textarea>' : '<input class="hm-in" type="' + (opt.type || "text") + '"' + attrs + (opt.im ? ' inputmode="' + opt.im + '"' : "") + ">";
    return '<div class="hm-fld' + (opt.wide ? " wide" : "") + '"><label for="ap-' + name + '">' + label + req + "</label>" + input + "</div>";
  };
  function openApply() {
    const mr = document.getElementById("modal-root");
    mr.innerHTML = '<div class="hm-mbg" data-hm-bg><div class="hm-modal" role="dialog" aria-modal="true" aria-labelledby="hm-ap-t">' +
      '<button type="button" class="hm-modal-x" data-hm-close aria-label="닫기">' + icon("x") + "</button>" +
      '<div class="hm-modal-in" id="hm-ap-body">' +
        '<div class="hm-modal-head">' + brandLock() + '<h2 id="hm-ap-t">강사 입점 문의</h2><p>강사님의 노하우를 두고 클래스 튜토리얼 강의 플랫폼으로 만들어 드려요. 남겨 주시면 확인 후 연락드릴게요.</p></div>' +
        '<form id="hm-apply" class="hm-form" novalidate>' +
          '<div class="hm-grid2">' + field("name", "성함", { req: true, ac: "name", max: 40, ph: "홍길동" }) + field("phone", "연락처", { req: true, type: "tel", im: "tel", ac: "tel", max: 30, ph: "010-0000-0000" }) + "</div>" +
          field("email", "이메일", { req: true, type: "email", im: "email", ac: "email", max: 120, ph: "name@example.com" }) +
          field("where", "지금 강의하고 있는 곳", { max: 120, ph: "예: 클래스101 · 유튜브 · 오프라인 · 아직 없어요" }) +
          field("course", "어떤 강의인가요", { req: true, area: true, rows: 3, max: 1500, ph: "강의 주제 · 대상 · 기간 · 수강생 수 등을 자유롭게 적어 주세요" }) +
          field("link", "강의 페이지 · 채널 주소", { type: "url", im: "url", max: 300, ph: "https://" }) +
          field("message", "하고 싶은 말", { area: true, rows: 2, max: 1500, ph: "궁금한 점이나 원하는 점을 남겨 주세요" }) +
          '<label class="hm-agree"><input type="checkbox" name="agree"><span>개인정보 수집 · 이용에 동의합니다 <em>(필수)</em><small>입점 상담을 위해 성함 · 연락처 · 이메일 · 강의 정보를 받아요. 상담에만 쓰고, 상담이 끝나면 지체 없이 지워요.</small></span></label>' +
          '<p class="hm-form-err" id="hm-ap-err" role="alert"></p>' +
          '<button type="submit" class="hm-btn hm-btn-p hm-btn-lg hm-btn-block">입점 문의 보내기' + icon("send", "sm") + "</button>" +
        "</form>" +
      "</div></div></div>";
    document.documentElement.classList.add("hm-noscroll");
    setTimeout(() => { const f = document.getElementById("ap-name"); if (f) f.focus(); }, 60);
  }
  function closeApply() {
    document.getElementById("modal-root").innerHTML = "";
    document.documentElement.classList.remove("hm-noscroll");
    if (/^#\/partner/.test(location.hash)) history.replaceState(null, "", "#/about");
  }
  async function submitApply(f) {
    const err = document.getElementById("hm-ap-err");
    const v = (n) => f[n].value.trim();
    const a = { name: v("name"), phone: v("phone"), email: v("email"), where: v("where"), course: v("course"), link: v("link"), message: v("message"), agree: f.agree.checked };
    const bad = (msg, n) => { err.textContent = msg; if (n && f[n]) f[n].focus(); };
    if (!a.name) return bad("성함을 적어 주세요.", "name");
    if (!/^[0-9+\-() ]{8,}$/.test(a.phone)) return bad("연락처를 숫자로 적어 주세요. (예: 010-0000-0000)", "phone");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) return bad("이메일 주소를 확인해 주세요.", "email");
    if (!a.course) return bad("어떤 강의인지 적어 주세요.", "course");
    if (!a.agree) return bad("개인정보 수집 · 이용에 동의해 주세요.");
    err.textContent = "";
    const btn = f.querySelector("button[type=submit]");
    btn.disabled = true; btn.classList.add("is-busy");
    try {
      const r = await DB.applyPartner(a);
      if (!r || r.error) { btn.disabled = false; btn.classList.remove("is-busy"); return bad(r && r.error === "locked" ? "문의가 많이 들어와 잠시 막혔어요. 조금 뒤에 다시 보내 주세요." : r && r.error === "input" ? "입력한 내용을 다시 확인해 주세요." : "보내지 못했어요. 잠시 후 다시 시도해 주세요."); }
      document.getElementById("hm-ap-body").innerHTML = '<div class="hm-done"><span class="hm-done-ic">' + icon("check") + '</span><h2 id="hm-ap-t">입점 문의가 접수됐어요</h2><p>' + esc(a.name) + " 강사님, 남겨 주신 연락처로 확인 후 연락드릴게요.<br>두고 클래스와 함께할 날을 기다릴게요.</p>" +
        '<button type="button" class="hm-btn hm-btn-p hm-btn-lg" data-hm-close>확인</button></div>';
    } catch (e) {
      btn.disabled = false; btn.classList.remove("is-busy");
      bad("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  /* ---------- 그리기 ---------- */
  let io = null;
  function reveal() {
    if (io) io.disconnect();
    const els = root.querySelectorAll(".hm-reveal:not(.in)");
    if (!("IntersectionObserver" in window)) { els.forEach((el) => el.classList.add("in")); return; }
    io = new IntersectionObserver((list) => list.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
    els.forEach((el) => io.observe(el));
  }
  function render() {
    window.applyStudentTheme(null);
    document.title = "두고 클래스 — 따라만 하면 완성되는 튜토리얼 강의 플랫폼";
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", "#ffffff");
    const list = classes();
    root.innerHTML = '<div class="hm">' + header() + "<main>" + hero() + stats(list) + classList(list) + pillars() + students() + teachers() + journey() + lifelong() + faq() + finalCta() + "</main>" + footer() + "</div>";
    onScroll();
    reveal();
    if (/^#\/partner/.test(location.hash)) openApply();
  }
  function mount() { root.innerHTML = ""; render(); window.scrollTo(0, 0); }

  // 탭은 그 부분만 바꾼다 (화면 위치가 튀지 않게)
  function swapTab(sel, html) {
    const old = root.querySelector(sel);
    if (!old) return;
    const t = document.createElement("div");
    t.innerHTML = html;
    const next = t.querySelector(sel);
    next.querySelectorAll(".hm-reveal").forEach((el) => el.classList.add("in", "now"));
    old.replaceWith(next);
  }

  function onScroll() {
    if (!isActive()) return;
    const top = document.getElementById("hm-top");
    if (top) top.classList.toggle("scrolled", window.scrollY > 12);
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  document.addEventListener("click", (e) => {
    if (!isActive()) return;
    if (e.target.closest("[data-hm-close]") || (e.target.matches && e.target.matches("[data-hm-bg]"))) { closeApply(); return; }
    if (e.target.closest("[data-hm-apply]")) { e.preventDefault(); openApply(); return; }
    const s = e.target.closest("[data-hm-scroll]");
    if (s) {
      e.preventDefault();
      const id = s.dataset.hmScroll, el = id === "top" ? null : document.getElementById(id);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!el) { window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }); return; }
      const y = el.getBoundingClientRect().top + window.scrollY - 64;
      window.scrollTo({ top: y, behavior: reduce ? "auto" : "smooth" });
      return;
    }
    const st = e.target.closest("[data-hm-st]");
    if (st) { stTab = st.dataset.hmSt; swapTab(".hm-show", students()); return; }
    const ad = e.target.closest("[data-hm-ad]");
    if (ad) { adTab = ad.dataset.hmAd; swapTab(".hm-ashot", teachers()); root.querySelectorAll("[data-hm-ad]").forEach((b) => { const on = b.dataset.hmAd === adTab; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); }); }
  });
  document.addEventListener("submit", (e) => {
    if (!isActive() || e.target.id !== "hm-apply") return;
    e.preventDefault();
    submitApply(e.target);
  });
  document.addEventListener("keydown", (e) => {
    if (isActive() && e.key === "Escape" && document.querySelector(".hm-mbg")) closeApply();
  });

  window.HomeApp = { render, mount, openApply };
})();
