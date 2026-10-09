/* 두고 클래스 — 플랫폼 소개 첫 화면 (주소 맨 앞 · #/about)
 *
 *  - 두고 클래스가 어떤 플랫폼인지, 수강생 · 강사에게 무엇을 해 주는지 한 화면에 소개한다
 *  - ‘로그인’을 누르면 지금의 수강생 로그인(강사 선택 → 이름 → 휴대폰 뒷자리)으로 간다
 *  - 강사 목록 · 숫자는 지금 운영 중인 강사 데이터에서 바로 가져온다 (꾸며 낸 숫자 없음)
 *  - 회원가입 없이 승인된 수강생만 들어오는 플랫폼이라, 가입 버튼은 두지 않는다
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
    { key: "tutorial", ic: "book", title: "주차별 튜토리얼", img: "st-curriculum", desc: "이번 주에 볼 강의와 할 과제가 순서대로 정리돼 있어요. 1주차부터 차근차근 따라오면 되고, 다 본 강의는 ‘시청 완료’로 체크해요." },
    { key: "mission", ic: "checks", title: "과제 제출 · 피드백", img: "st-missions", desc: "사진 · 링크 · 글로 과제를 내면 자동 검수로 바로 확인하고, 강사님과 코치가 승인하거나 보완할 점을 알려 줘요." },
    { key: "cert", ic: "award", title: "진행률 · 수료증", img: "st-cert", desc: "내가 잘 따라가고 있는지 진행률로 바로 보여요. 필수 과제를 모두 통과하면 이름이 새겨진 수료증이 발급돼요." },
    { key: "bot", ic: "sparkles", title: "24시간 AI 도우미", img: "st-bot", desc: "과제 방법 · 서류 · 일정 · 내 진도를 물어보면 강사님이 올린 자료를 바탕으로 바로 답해 줘요. 새벽에도요." },
    { key: "channel", ic: "message", title: "강사 · 코치 1:1 소통", img: "st-channels", desc: "막히는 순간 강사님과 코치에게 바로 연결돼요. 카카오톡 채널 · 오픈채팅 등 강사님이 정한 창구로 이어져요." },
    { key: "guide", ic: "clipboard", title: "실무 가이드", img: "st-docs", desc: "사업자 등록처럼 강의에 필요한 준비를 단계별로 안내해요. 기관 · 기간 · 필요 서류 · 강사님 팁까지 한 화면에." },
    { key: "library", ic: "library", title: "유료강의 자료실", img: "st-library", desc: "전자책 · 엑셀 양식 · VOD · 기초 가이드 영상까지, 강사님의 노하우가 한 권의 책처럼 정리돼 있어요." },
    { key: "schedule", ic: "calendar", title: "강의 일정 · 공지", img: "st-schedule", desc: "라이브 · 과제 마감 · 공지를 달력으로 한눈에. 해외에 있는 강사님과도 시간을 헷갈리지 않아요." }
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
    ["palette", "내 이름의 강의 플랫폼", "강의 이름 · 색상 · 메뉴 · 로그인 화면까지 강사님 브랜드로 운영해요."],
    ["layers", "커리큘럼 · 과제 직접 편집", "주차 · 강의 · 과제 · 엑셀 양식을 직접 고치고, 기수마다 다른 커리큘럼도 써요."],
    ["activity", "수강생 진척도 한눈에", "누가 어디까지 했는지, 누가 멈춰 있는지 바로 보여서 먼저 챙길 수 있어요."],
    ["checks", "과제 검수 · 일괄 승인", "자동 검수 결과를 보고 한 번에 승인하거나 보완을 요청해요."],
    ["users", "코치와 함께 운영", "코치 계정을 만들고 필요한 메뉴만 열어 줘서 검수 · 답변을 나눠요."],
    ["userPlus", "승인제 수강생 관리", "수강 신청을 확인하고 승인한 사람만 들어와요. 기수별로 관리해요."],
    ["megaphone", "홍보 · 무료강의 페이지", "강의 소개 페이지와 무료강의 신청 페이지를 바로 만들어 알려요."],
    ["refresh", "끝난 기수에게도 계속", "새 영상 · 자료를 올리면 이전 기수 수강생도 함께 보고 다시 찾아와요."]
  ];
  const STEPS = [
    ["수강 신청", "강사님의 강의 소개 페이지에서 수강을 신청해요."],
    ["승인", "강사님 · 운영진이 확인하고 승인해 드려요."],
    ["로그인", "강사 선택 → 이름 → 휴대폰 번호 뒷자리 4자리"],
    ["1주차부터", "튜토리얼대로 강의를 보고 과제를 제출해요."],
    ["피드백 · 수료", "강사 · 코치 피드백을 받고, 필수 과제를 마치면 수료증!"],
    ["평생 함께", "수료 후에도 새 자료와 네트워크가 이어져요."]
  ];
  const FAQS = [
    ["회원가입은 어떻게 하나요?", "두고 클래스는 따로 회원가입이 없는 승인제 플랫폼이에요. 강사님 강의를 신청하면 강사님(운영진)이 확인한 뒤 승인해 드리고, 승인되면 바로 로그인할 수 있어요."],
    ["로그인은 어떻게 하나요?", "로그인 화면에서 수강 중인 강사님을 고르고, 신청할 때 적은 이름과 휴대폰 번호 뒷자리 4자리를 넣으면 돼요. 한 번 고른 강사님은 다음부터 바로 열려요."],
    ["강의가 끝나면 더 이상 못 보나요?", "수료한 뒤에도 내 강의실은 그대로 남아요. 강사님 재량에 따라 새 영상 · 자료가 계속 올라오고, 이전 기수 수강생도 함께 볼 수 있어요."],
    ["휴대폰에서도 쓸 수 있나요?", "네. 휴대폰 · 태블릿 · PC 어디서든 같은 내 강의실로 들어와요. 과제 사진도 휴대폰으로 바로 찍어서 올릴 수 있어요."],
    ["막히는 부분은 어디에 물어보나요?", "24시간 AI 도우미에게 먼저 물어보고, 더 필요한 건 1:1 소통채널로 강사님 · 코치에게 바로 연락하면 돼요. 오류나 불편한 점은 요청사항으로 남겨 주세요."],
    ["강사로 두고 클래스를 쓰고 싶어요.", "강사님의 노하우를 튜토리얼 강의 플랫폼으로 만들어 드려요. 운영사 (주)두고홀딩스로 문의해 주세요. 이미 등록된 강사님은 ‘강사센터’로 들어가면 돼요."]
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
  const brandMark = (cls) => '<span class="hm-sym ' + (cls || "") + '" aria-hidden="true"></span>';
  const kicker = (t) => '<p class="hm-kicker">' + t + "</p>";
  const phone = (img, cls, alt) => '<div class="hm-phone ' + (cls || "") + '"><span class="hm-phone-notch"></span><img src="' + IMG + img + '.webp" alt="' + esc(alt || "") + '" loading="lazy" decoding="async"></div>';
  const browser = (img, cls, alt, eager) => '<div class="hm-browser ' + (cls || "") + '"><div class="hm-browser-bar"><i></i><i></i><i></i><span>doogo-class.vercel.app</span></div><img src="' + IMG + img + '.webp" alt="' + esc(alt || "") + '"' + (eager ? "" : ' loading="lazy"') + ' decoding="async"></div>';
  const scrollBtn = (to, label, cls) => '<button type="button" class="' + cls + '" data-hm-scroll="' + to + '">' + label + "</button>";

  let stTab = "tutorial", adTab = "dash";

  function header() {
    return '<header class="hm-top" id="hm-top"><div class="hm-wrap hm-top-in">' +
      '<button type="button" class="hm-logo" data-hm-scroll="top" aria-label="두고 클래스 맨 위로">' + brandLock() + "</button>" +
      '<nav class="hm-nav" aria-label="소개 메뉴">' +
        scrollBtn("hm-platform", "플랫폼", "hm-nav-a") + scrollBtn("hm-students", "수강생", "hm-nav-a") + scrollBtn("hm-teachers", "강사", "hm-nav-a") +
        scrollBtn("hm-classes", "강사 소개", "hm-nav-a") + scrollBtn("hm-faq", "자주 묻는 질문", "hm-nav-a") +
      "</nav>" +
      '<div class="hm-top-r"><a class="hm-btn hm-btn-ghost hm-btn-sm" href="#/center">강사센터</a><a class="hm-btn hm-btn-p hm-btn-sm" href="#/login">로그인</a></div>' +
    "</div></header>";
  }

  function hero(list) {
    const names = list.map((x) => esc(x.name));
    return '<section class="hm-hero" id="hm-hero"><div class="hm-hero-glow" aria-hidden="true"></div><div class="hm-wrap hm-hero-in">' +
      '<div class="hm-hero-copy">' +
        '<p class="hm-pill"><i class="hm-dot"></i>승인된 수강생만 들어오는 강의 플랫폼</p>' +
        '<h1 class="hm-h1">따라만 하면 완성되는<br>' + mark("튜토리얼 강의 플랫폼") + "</h1>" +
        '<p class="hm-lead">두고 클래스는 강사님의 노하우를 <b>1주차부터 수료까지</b> 순서대로 담은 강의 플랫폼이에요. 수강생은 튜토리얼대로 따라오고, 강사님은 모든 수강생의 진도를 한눈에 봅니다.</p>' +
        '<div class="hm-cta"><a class="hm-btn hm-btn-p hm-btn-lg" href="#/login">수강생 로그인' + icon("arrowRight", "sm") + "</a>" + scrollBtn("hm-platform", "플랫폼 둘러보기", "hm-btn hm-btn-sec hm-btn-lg") + "</div>" +
        '<p class="hm-note">' + icon("shieldCheck", "xs") + "회원가입 없이, 강사님이 승인한 수강생만 로그인할 수 있어요</p>" +
      "</div>" +
      '<div class="hm-hero-art">' +
        browser("ad-dash", "hm-hero-browser", "강사센터 대시보드 화면", true) +
        '<div class="hm-hero-phone-wrap">' + phone("st-home", "hm-hero-phone", "수강생 홈 화면").replace(' loading="lazy"', "") + "</div>" +
        '<div class="hm-chip hm-chip-a">' + icon("check", "sm ok") + "<span><b>1주차 과제 승인</b><small>OOO 강사님 · 방금</small></span></div>" +
        '<div class="hm-chip hm-chip-b"><span><small>3기 평균 진도</small><b>72%</b></span><i class="hm-chip-bar"><i style="width:72%"></i></i></div>' +
        '<div class="hm-chip hm-chip-c">' + icon("award", "sm") + "<span><b>수료증 발급</b><small>필수 과제 23개 통과</small></span></div>" +
      "</div>" +
    "</div>" +
    (names.length ? '<div class="hm-ticker" aria-label="함께하는 강사"><div class="hm-wrap hm-ticker-in"><span class="hm-ticker-l">함께하는 강사</span><div class="hm-ticker-names">' + names.map((n) => "<span>" + n + "</span>").join("") + "</div></div></div>" : "") +
    "</section>";
  }

  function stats(list) {
    const weeks = list.reduce((n, x) => n + x.weeks, 0), missions = list.reduce((n, x) => n + x.missions, 0);
    const item = (num, unit, label) => '<div class="hm-stat"><b>' + num + "<small>" + unit + "</small></b><span>" + label + "</span></div>";
    return '<section class="hm-stats" aria-label="두고 클래스 숫자"><div class="hm-wrap hm-stats-in">' +
      item(list.length, "명", "두고 클래스로 강의하는 강사") + item(weeks, "주", "튜토리얼 커리큘럼") + item(missions, "개", "주차별 실전 과제") + item(24, "시간", "AI 도우미 응답") +
    "</div></section>";
  }

  function problem() {
    const card = (ic, t, d) => '<article class="hm-pain hm-reveal">' + '<span class="hm-pain-ic">' + icon(ic) + "</span><h3>" + t + "</h3><p>" + d + "</p></article>";
    return '<section class="hm-sec hm-soft" id="hm-platform"><div class="hm-wrap">' +
      '<div class="hm-head hm-reveal">' + kicker("WHY DOOGO CLASS") + '<h2 class="hm-h2">강의를 듣고도<br>혼자 헤맨 적 있으신가요?</h2></div>' +
      '<div class="hm-pains">' +
        card("layers", "자료가 여기저기 흩어져 있어요", "영상은 유튜브에, 자료는 단톡방에, 과제는 메일로. 무엇을 어디서 봐야 할지부터 막혀요.") +
        card("target", "어디까지 했는지 모르겠어요", "지금 잘 따라가고 있는지, 다음엔 무엇을 해야 하는지 알려 주는 곳이 없어요.") +
        card("users", "기수가 끝나면 연결도 끝나요", "강의가 끝나는 순간 강사님과도, 함께 배운 동기들과도 멀어져요.") +
      "</div>" +
      '<div class="hm-answer hm-reveal"><span class="hm-answer-mark">' + brandMark() + "</span><p>두고 클래스는 이 모든 것을 " + mark("하나의 강의 플랫폼") + "에 담았습니다.</p></div>" +
    "</div></section>";
  }

  function pillars() {
    const p = (no, ic, t, d, pts) => '<article class="hm-pillar hm-reveal"><div class="hm-pillar-top"><span class="hm-pillar-no">' + no + '</span><span class="hm-pillar-ic">' + icon(ic) + "</span></div><h3>" + t + "</h3><p>" + d + '</p><ul class="hm-pillar-list">' + pts.map((x) => "<li>" + icon("check", "xs") + x + "</li>").join("") + "</ul></article>";
    return '<section class="hm-sec"><div class="hm-wrap">' +
      '<div class="hm-head hm-reveal">' + kicker("PLATFORM") + '<h2 class="hm-h2">강의 하나에 필요한 모든 것,<br>' + mark("두고 클래스 하나로") + "</h2>" +
        '<p class="hm-sub">강사님마다 자기 이름과 색으로 운영하는 독립된 강의 플랫폼이에요. 교육 자료이자 한 권의 전자책처럼, 강의의 처음부터 끝까지가 여기 들어 있어요.</p></div>' +
      '<div class="hm-pillars">' +
        p("01", "book", "튜토리얼 커리큘럼", "주차별 강의 · 과제 · 자료가 순서대로. 처음 시작하는 분도 1주차부터 차근차근 따라오면 돼요.", ["주차별 강의 · 핵심 목표", "과제 단계 안내 · 엑셀 양식", "실무 가이드 · 자료실"]) +
        p("02", "activity", "진도 관리와 케어", "수강생은 내 진도를, 강사님과 코치는 모든 수강생의 진도를 봐요. 멈춘 사람을 먼저 챙길 수 있어요.", ["진행률 · 수료증", "자동 검수 + 강사 · 코치 피드백", "AI 도우미 · 1:1 소통채널"]) +
        p("03", "heart", "평생 네트워크", "수료한 뒤에도 내 강의실은 남아요. 새 영상과 정보가 계속 올라오고, 강사와 수강생이 계속 연결돼요.", ["수료 후에도 계속 이용", "이전 기수에게도 새 자료", "단골 수강생 · 나만의 팬"]) +
      "</div>" +
    "</div></section>";
  }

  function students() {
    const cur = STUDENT_TABS.find((x) => x.key === stTab) || STUDENT_TABS[0];
    return '<section class="hm-sec hm-soft" id="hm-students"><div class="hm-wrap">' +
      '<div class="hm-head hm-reveal">' + kicker("FOR STUDENTS · 수강생") + '<h2 class="hm-h2">1주차부터 수료까지,<br>' + mark("길을 잃지 않게") + "</h2>" +
        '<p class="hm-sub">로그인하면 내가 듣는 강사님의 강의실이 열려요. 오늘 무엇을 해야 하는지, 잘 따라가고 있는지 언제나 보여요.</p></div>' +
      '<div class="hm-show">' +
        '<div class="hm-show-tabs" role="tablist" aria-label="수강생 기능">' + STUDENT_TABS.map((x) =>
          '<button type="button" role="tab" class="hm-tab' + (x.key === cur.key ? " on" : "") + '" aria-selected="' + (x.key === cur.key) + '" data-hm-st="' + x.key + '">' +
            '<span class="hm-tab-ic">' + icon(x.ic) + '</span><span class="hm-tab-t"><b>' + x.title + "</b><small>" + x.desc + "</small></span></button>").join("") +
        "</div>" +
        '<div class="hm-show-art"><div class="hm-show-glow" aria-hidden="true"></div>' + phone(cur.img, "hm-show-phone", cur.title + " 화면") +
          '<p class="hm-show-cap"><b>' + cur.title + "</b><span>" + cur.desc + "</span></p></div>" +
      "</div>" +
      '<div class="hm-more">' + STUDENT_MORE.map((x) => '<div class="hm-more-i hm-reveal">' + icon(x[0]) + "<b>" + x[1] + "</b><span>" + x[2] + "</span></div>").join("") + "</div>" +
    "</div></section>";
  }

  function teachers() {
    const cur = ADMIN_TABS.find((x) => x.key === adTab) || ADMIN_TABS[0];
    return '<section class="hm-sec" id="hm-teachers"><div class="hm-wrap">' +
      '<div class="hm-head hm-reveal">' + kicker("FOR INSTRUCTORS · 강사") + '<h2 class="hm-h2">강사님의 노하우가<br>' + mark("일하는 강의 플랫폼") + "이 됩니다</h2>" +
        '<p class="hm-sub">커리큘럼을 올려 두면 수강생은 혼자서도 따라오고, 강사님은 강사센터에서 모든 수강생의 진도와 과제를 확인해요. 코치와 나눠서 운영할 수도 있어요.</p></div>' +
      '<div class="hm-atabs" role="tablist" aria-label="강사센터 화면">' + ADMIN_TABS.map((x) => '<button type="button" role="tab" class="hm-atab' + (x.key === cur.key ? " on" : "") + '" aria-selected="' + (x.key === cur.key) + '" data-hm-ad="' + x.key + '">' + x.title + "</button>").join("") + "</div>" +
      '<div class="hm-ashot hm-reveal">' + browser(cur.img, "hm-admin-browser", "강사센터 " + cur.title + " 화면") + '<p class="hm-cap">실제 강사센터 화면 일부 · 예시 데이터 (이름은 가렸어요)</p></div>' +
      '<div class="hm-feats">' + ADMIN_FEATURES.map((x) => '<article class="hm-feat hm-reveal"><span class="hm-feat-ic">' + icon(x[0]) + "</span><h3>" + x[1] + "</h3><p>" + x[2] + "</p></article>").join("") + "</div>" +
    "</div></section>";
  }

  function journey() {
    return '<section class="hm-sec hm-soft" id="hm-how"><div class="hm-wrap">' +
      '<div class="hm-head hm-reveal">' + kicker("HOW IT WORKS") + '<h2 class="hm-h2">수강생은 이렇게 시작해요</h2>' +
        '<p class="hm-sub">회원가입 대신 승인제로 운영해요. 내 강사님이 승인한 수강생만 강의실에 들어올 수 있어요.</p></div>' +
      '<ol class="hm-steps">' + STEPS.map((s, i) => '<li class="hm-step hm-reveal"><span class="hm-step-no">' + String(i + 1).padStart(2, "0") + "</span><b>" + s[0] + "</b><p>" + s[1] + "</p></li>").join("") + "</ol>" +
      '<div class="hm-login-demo hm-reveal">' +
        '<div class="hm-ld-copy"><h3>로그인은 이 세 가지면 끝</h3><p>아이디 · 비밀번호를 따로 만들 필요가 없어요. 신청할 때 적은 정보 그대로 들어와요.</p><a class="hm-btn hm-btn-p" href="#/login">로그인 화면으로' + icon("arrowRight", "sm") + "</a></div>" +
        '<div class="hm-ld-card" aria-hidden="true">' +
          '<div class="hm-ld-f"><small>1. 수강 중인 강사님</small><span>' + window.logoMark() + "두고보는 문대표" + icon("chevRight", "xs") + "</span></div>" +
          '<div class="hm-ld-f"><small>2. 이름</small><span>OOO</span></div>' +
          '<div class="hm-ld-f"><small>3. 휴대폰 번호 뒷자리</small><span class="hm-ld-pw">● ● ● ●</span></div>' +
          '<span class="hm-ld-btn">로그인</span>' +
        "</div>" +
      "</div>" +
    "</div></section>";
  }

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
    const card = (x) => {
      const photo = '<span class="hm-tc-shape" aria-hidden="true"></span>' + (x.photo ? '<img src="' + esc(x.photo) + '" alt="' + esc(x.who) + ' 강사" loading="lazy" decoding="async">' : SILHOUETTE) +
        '<span class="hm-tc-tag">' + x.weeks + "주 과정 · 과제 " + x.missions + "개</span>";
      return '<article class="hm-tc hm-reveal" style="--c-p:' + esc(x.t.primary) + '">' +
        (x.landing ? '<a class="hm-tc-photo" href="#/p/' + esc(x.id) + '" aria-label="' + esc(x.who) + ' 강의 소개">' + photo + "</a>" : '<div class="hm-tc-photo">' + photo + "</div>") +
        '<div class="hm-tc-body"><h3>' + esc(x.who) + '</h3><p class="hm-tc-field">' + esc(x.field) + '</p><p class="hm-tc-course">' + esc(x.title) + "</p></div>" +
        '<div class="hm-tc-foot"><span class="hm-tc-sns">' + sns(x) + '</span><span class="hm-tc-links">' +
          (x.landing ? '<a href="#/p/' + esc(x.id) + '">강의 소개</a>' : "") + (x.free ? '<a href="#/free/' + esc(x.id) + '">무료 강의</a>' : "") +
          '<a class="hm-tc-login" href="#/login?ins=' + esc(x.id) + '">로그인</a></span></div>' +
      "</article>";
    };
    return '<section class="hm-sec" id="hm-classes"><div class="hm-wrap">' +
      '<div class="hm-head hm-head-row hm-reveal"><div>' + kicker("CLASSES") + '<h2 class="hm-h2">지금 두고 클래스로<br>강의하는 강사님</h2>' +
        '<p class="hm-sub">강사님마다 자기 이름과 커리큘럼으로 운영하는 강의 플랫폼이에요. 수강생은 로그인할 때 내 강사님을 골라 들어가요.</p></div></div>' +
      '<div class="hm-tcs">' + list.map(card).join("") + "</div>" +
      '<div class="hm-join hm-reveal"><span class="hm-next-ic">' + icon("plus") + '</span><div class="hm-join-t"><b>다음 강사님의 자리</b><p>강사님의 노하우도 두고 클래스로 만들어 보세요. 운영사 (주)두고홀딩스가 도와드려요.</p></div>' +
        '<a class="hm-btn hm-btn-sec hm-btn-sm" href="#/center">강사센터</a></div>' +
    "</div></section>";
  }

  function lifelong() {
    const loop = ["새 영상 · 자료 업데이트", "수강생이 다시 찾아와요", "질문 · 소통 · 피드백", "단골 수강생 · 나만의 팬"];
    return '<section class="hm-sec hm-soft hm-life"><div class="hm-wrap hm-life-in">' +
      '<div class="hm-life-copy hm-reveal">' + kicker("LIFETIME NETWORK") + '<h2 class="hm-h2 hm-h2-xl">한 번 들어오면,<br>' + mark("평생 함께") + ".</h2>" +
        "<p>강의가 끝나도 플랫폼은 남아요. 강사님은 끝난 기수에게도 좋은 영상과 새 정보를 계속 올리고, 수강생은 언제든 다시 찾아와 배우고 물어봐요.</p>" +
        "<p>그렇게 끊임없이 이어지는 연결이 <b>강사님만의 단골 수강생, 나만의 팬</b>을 만들어요. 두고 클래스는 한 번 팔고 끝나는 강의가 아니라, 계속 함께 성장하는 강의를 위한 플랫폼이에요.</p>" +
      "</div>" +
      '<div class="hm-loop hm-reveal" aria-label="평생 네트워크가 만들어지는 순서">' +
        '<div class="hm-loop-center">' + brandMark() + "<b>강사 · 수강생 · 코치</b><small>한 플랫폼에서 계속 연결</small></div>" +
        loop.map((t, i) => '<div class="hm-loop-i hm-loop-' + i + '"><span>' + String(i + 1).padStart(2, "0") + "</span>" + t + "</div>").join("") +
      "</div>" +
    "</div></section>";
  }

  function faq() {
    return '<section class="hm-sec" id="hm-faq"><div class="hm-wrap hm-faq-in">' +
      '<div class="hm-head hm-reveal">' + kicker("FAQ") + '<h2 class="hm-h2">자주 묻는 질문</h2></div>' +
      '<div class="hm-faqs">' + FAQS.map((q, i) => '<details class="hm-faq"' + (i === 0 ? " open" : "") + "><summary><span>Q</span>" + q[0] + icon("chevDown", "sm") + "</summary><p>" + q[1] + "</p></details>").join("") + "</div>" +
    "</div></section>";
  }

  function finalCta() {
    return '<section class="hm-final"><div class="hm-wrap hm-final-in">' +
      '<h2 class="hm-h2">오늘의 한 걸음이<br>수료증이 되는 곳</h2>' +
      "<p>내 강사님이 준비해 둔 튜토리얼이 기다리고 있어요.</p>" +
      '<div class="hm-cta hm-cta-c"><a class="hm-btn hm-btn-inv hm-btn-lg" href="#/login">수강생 로그인' + icon("arrowRight", "sm") + '</a><a class="hm-btn hm-btn-onred hm-btn-lg" href="#/center">강사센터</a></div>' +
    "</div></section>";
  }

  function footer() {
    return '<footer class="hm-foot"><div class="hm-wrap hm-foot-in">' +
      '<div class="hm-foot-brand">' + brandLock() + "<small>두고 클래스 · 튜토리얼 강의 플랫폼</small></div>" +
      '<nav class="hm-foot-links" aria-label="바로가기"><a href="#/login">수강생 로그인</a><a href="#/center">강사센터</a><a href="https://www.doogoconnect.com/" target="_blank" rel="noopener">두고커넥트</a><a href="https://www.doogofood.com/" target="_blank" rel="noopener">두고푸드</a></nav>' +
      '<div class="hm-foot-bottom"><span>운영 (주)두고홀딩스 · © 2026 doogo. All rights reserved.</span></div>' +
    "</div></footer>";
  }

  /* ---------- 그리기 ---------- */
  let io = null;
  function reveal() {
    if (io) io.disconnect();
    const els = root.querySelectorAll(".hm-reveal:not(.in)");
    if (!("IntersectionObserver" in window)) { els.forEach((el) => el.classList.add("in")); return; }
    io = new IntersectionObserver((list) => list.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach((el) => io.observe(el));
  }
  function render() {
    window.applyStudentTheme(null);
    document.title = "두고 클래스 — 따라만 하면 완성되는 튜토리얼 강의 플랫폼";
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", "#ffffff");
    const list = classes();
    root.innerHTML = '<div class="hm">' + header() + "<main>" + hero(list) + stats(list) + problem() + pillars() + students() + teachers() + journey() + classList(list) + lifelong() + faq() + finalCta() + "</main>" + footer() + "</div>";
    onScroll();
    reveal();
  }
  function mount() { root.innerHTML = ""; render(); window.scrollTo(0, 0); }

  // 탭은 그 부분만 바꾼다 (화면 위치가 튀지 않게)
  function swapTab(sel, html) {
    const old = root.querySelector(sel);
    if (!old) return;
    const t = document.createElement("div");
    t.innerHTML = html;
    const next = t.querySelector(sel);
    next.querySelectorAll(".hm-reveal").forEach((el) => el.classList.add("in"));
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
    if (ad) { adTab = ad.dataset.hmAd; const y = window.scrollY; swapTab("#hm-teachers", teachers()); window.scrollTo(0, y); }
  });

  window.HomeApp = { render, mount };
})();
