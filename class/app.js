/* 두고 클래스 — 수강생 센터
 *
 *  - 데이터: db.js (DB) — 강사별 콘텐츠·기수·수강생, 수강생별 진행 기록
 *  - 라우팅: #/home, #/missions/1 … (강사센터는 #/center… 로 admin.js 가 맡는다)
 *  - 로그인: 강사 선택(기억됨) → 이름 + 전화번호 뒷자리
 */
(function () {
  "use strict";

  const root = document.getElementById("root");
  const modalRoot = document.getElementById("modal-root");
  const toastRoot = document.getElementById("toast-root");
  const { esc } = DB;
  const { DOW, todayStr, parseDate, fmtMD, fmtFull, fmtKo, fmtStamp } = DB.date;
  const icon = window.icon;
  const KEY_BOT = "moonclass:bot-open";

  let INS = null;       // 강사
  let D = null;         // 강사 콘텐츠
  let CO = null;        // 내 기수
  let me = null;        // 로그인한 수강생 (미리보기면 가상 수강생)
  let preview = false;
  let P = null;         // 내 진행 기록
  let draft = { missionId: null, files: [] };
  let calCursor = null, calSel = null;
  let loginPick = null; // 로그인 화면에서 고른 강사
  let botOpen = window.matchMedia("(max-width: 720px)").matches ? false : DB.store.get(KEY_BOT, false);
  let botThinking = false;

  const isActive = () => document.body.dataset.mode === "student";

  function saveProgress() {
    if (!DB.saveProgress(me.id, P)) { toast("저장 공간이 부족해요. 사진 수를 줄여 다시 시도해 주세요.", "warn"); return false; }
    return true;
  }
  const daysUntil = (s) => DB.date.diffDays(s, todayStr());
  const won = (n) => (Math.round(n) || 0).toLocaleString("ko-KR") + "원";

  /* ---------------- 과제 · 진행률 ---------------- */
  const allMissions = () => D.weeks.flatMap((w) => w.missions.map((m) => Object.assign({ weekNo: w.no }, m)));
  const findWeek = (no) => D.weeks.find((w) => w.no === Number(no));
  const findMission = (id) => allMissions().find((m) => m.id === id);
  const openOf = (w) => DB.weekOpen(CO, w.no);
  const deadlineOf = (w) => DB.weekDeadline(CO, w.no);
  const isOpen = (w) => todayStr() >= openOf(w);
  const lastSub = (id) => DB.lastSub(P, id);
  const missionState = (id) => DB.subState(P, id);
  const isDone = (id) => missionState(id) === "done";
  function weekStats(w) {
    const req = w.missions.filter((m) => m.required).length;
    const done = w.missions.filter((m) => isDone(m.id)).length;
    const challenge = w.missions.filter((m) => DB.missionKind(m) === "challenge").length;
    return { req, challenge, mind: w.missions.length - req - challenge, opt: w.missions.length - req, done, total: w.missions.length, pct: w.missions.length ? Math.round((done / w.missions.length) * 100) : 0 };
  }
  const kindOf = (m) => DB.MISSION_KINDS.find((k) => k.key === DB.missionKind(m));
  const kindCount = (st) => "필수 " + st.req + (st.challenge ? " · 도전 " + st.challenge : "") + (st.mind ? " · 마인드 " + st.mind : "");
  const overallStats = () => DB.stats(P, INS.id, CO);
  const nextMission = (w) => w.missions.find((m) => m.required && !isDone(m.id)) || w.missions.find((m) => !isDone(m.id));
  function nextMissionOverall() {
    for (const w of D.weeks) {
      if (!isOpen(w)) continue;
      const m = nextMission(w);
      if (m) return Object.assign({ weekNo: w.no }, m);
    }
    return null;
  }
  const myEvents = () => DB.events(INS.id, CO);
  // 안 읽은 공지 (읽으면 진행 기록에 남는다)
  const isUnread = (n) => !(P.readNotices || {})[n.id];
  const unreadNotices = () => D.notices.filter(isUnread).length;
  const newBadge = (n) => (isUnread(n) ? '<span class="badge badge-new">NEW</span>' : "");
  // 입장 링크: 외부 주소(줌·유튜브 라이브)는 새 창으로
  const liveBtn = (e, small) => e.url ? '<a class="btn btn-primary' + (small ? " btn-sm" : "") + '" href="' + esc(e.url) + '"' + (/^https?:/i.test(e.url) ? ' target="_blank" rel="noopener"' : "") + ">" + icon("video", "sm") + "입장하기</a>" : "";

  // 자동검수: 과제별 규칙(check)으로 제출 즉시 판정. 강사가 검수하면 강사 결과가 우선한다.
  function autoCheck(m, sub) {
    const c = m.check || {};
    const reasons = [], ok = [];
    const text = (sub.text || "").trim();
    const plain = text.replace(/\s+/g, "");
    // 제출 방식에 없는 입력은 검사하지 않는다 (예: 링크 과제에 남은 사진 규칙)
    if (c.image && m.type === "image") {
      if (!sub.files.length) reasons.push("인증 사진(또는 PDF)을 1개 이상 올려 주세요.");
      else ok.push("인증 파일 " + sub.files.length + "개 확인");
    }
    if (c.link && m.type === "link") {
      const url = (sub.link || "").trim();
      if (!/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(url)) reasons.push("http:// 또는 https:// 로 시작하는 올바른 링크를 입력해 주세요.");
      else if (c.linkHint && url.toLowerCase().indexOf(c.linkHint) === -1) reasons.push("‘" + c.linkHint + "’ 주소가 맞는지 확인해 주세요.");
      else ok.push("링크 형식 확인");
    }
    if (c.minLength) {
      if (plain.length < c.minLength) reasons.push("내용을 조금 더 자세히 적어 주세요. (현재 " + plain.length + "자 / 최소 " + c.minLength + "자)");
      else ok.push("분량 " + plain.length + "자 확인");
    }
    (c.keywords || []).forEach((k) => {
      if (text.indexOf(k) === -1) reasons.push("‘" + k + "’ 이(가) 들어가도록 적어 주세요.");
      else ok.push("‘" + k + "’ 포함 확인");
    });
    return { pass: reasons.length === 0, reasons, ok };
  }

  /* ---------------- 라우터 ---------------- */
  function route() {
    const h = (location.hash || "#/home").replace(/^#\/?/, "");
    const [path, query] = h.split("?");
    const parts = path.split("/").filter(Boolean);
    return { parts: parts.length ? parts : ["home"], params: new URLSearchParams(query || "") };
  }

  const NAV_DEFS = [
    { id: "home", label: "홈", icon: "home", href: "#/home" },
    { id: "curriculum", label: "커리큘럼", icon: "book", href: "#/curriculum" },
    { id: "missions", label: "과제 제출하기", icon: "checks", href: "#/missions",
      children: () => D.weeks.map((w) => ({ id: String(w.no), label: w.no + "주차", href: "#/missions/" + w.no, locked: !isOpen(w) })) },
    { id: "schedule", label: "강의 일정", icon: "calendar", href: "#/schedule" },
    { id: "notices", label: "공지사항", icon: "megaphone", href: "#/notices" },
    { id: "qna", label: "Q&A", icon: "help", href: "#/qna" },
    { id: "docs", label: "서류 준비 가이드", icon: "clipboard", href: "#/docs" },
    { id: "bot", label: () => D.brand.botName, icon: "sparkles", href: "#/bot" },
    { id: "library", label: "유료강의 자료실", icon: "library", href: "#/library",
      children: () => libList().map((c) => ({ id: c.id, label: c.label, href: "#/library/" + c.id })) },
    { id: "motivation", label: "동기부여", icon: "flame", href: "#/motivation" },
    { id: "certificate", label: "수료증", icon: "award", href: "#/certificate" }
  ];
  const LIB = [
    { id: "ebook", label: "전자책 · 가이드북", icon: "book", cls: "ri-1", desc: () => D.brand.instructor + " 전자책과 가이드북을 웹에서 열람" },
    { id: "file", label: "자료 파일", icon: "fileSheet", cls: "ri-2", desc: () => "상품 리스트 · 키워드 · 마진 계산기 등 실전 자료" },
    { id: "vod", label: "이커머스 실전 VOD", icon: "circlePlay", cls: "ri-3", desc: () => "쿠팡 · 네이버 판매, 도매몰 발주 · 대량 발주 강의 영상" },
    { id: "senior", label: "시니어 기초 가이드", icon: "book", cls: "ri-4", desc: () => "처음 시작하시는 분들을 위한 친절한 기초 안내" }
  ];
  const navLabel = (n) => (typeof n.label === "function" ? n.label() : n.label);
  // 마스터가 강사별로 정한 메뉴 구성(켜기·끄기·이름·순서·추가 메뉴)을 따른다
  const on = (key) => DB.menuOn(INS.id, key);
  const libList = () => LIB.filter((c) => DB.libOn(INS.id, c.id));
  function NAV() {
    return DB.menuConfig(INS.id).items.filter((x) => x.on).map((x) => {
      if (DB.isCustom(x.key)) {
        return x.type === "link"
          ? { id: x.key, label: x.label || "링크", icon: x.icon || "link", href: x.url || "#", external: true }
          : { id: "page", sub: x.key, label: x.label || "추가 메뉴", icon: x.icon || "file", href: "#/page/" + x.key };
      }
      const d = NAV_DEFS.find((n) => n.id === x.key);
      return d ? Object.assign({}, d, x.label ? { label: x.label } : {}) : null;
    }).filter(Boolean);
  }

  /* ---------------- 공통 컴포넌트 ---------------- */
  // 유튜브: 썸네일 카드 → 누르면 재생. 내장 재생이 막힌 환경을 위해 "유튜브에서 보기" 링크도 항상 둔다.
  function video(item, opts) {
    opts = opts || {};
    const yid = DB.youtubeId(item.youtubeId);
    const minutes = item.minutes ? (typeof item.minutes === "number" ? item.minutes + "분" : item.minutes) : "";
    if (yid) {
      return '<div class="video" data-yid="' + esc(yid) + '"><div class="video-ph" role="button" tabindex="0" data-action="video-play" aria-label="' + esc(item.title) + ' 재생">' +
        '<img class="vp-img" src="https://i.ytimg.com/vi/' + esc(yid) + '/hqdefault.jpg" alt="" loading="lazy">' +
        '<span class="vp-title">' + esc(opts.headline || item.title) + '</span><span class="vp-play">' + icon("play") + "</span>" +
        '<span class="vp-foot"><a href="https://www.youtube.com/watch?v=' + esc(yid) + '" target="_blank" rel="noopener" class="vp-ext">유튜브에서 보기 ' + icon("arrowUpRight", "xs") + "</a>" +
        (minutes ? '<span class="vp-time">' + esc(minutes) + "</span>" : "") + "</span></div></div>";
    }
    const ch = D.brand.youtubeChannel;
    const tag = ch ? 'a class="video-ph" href="' + esc(ch) + '" target="_blank" rel="noopener"' : 'div class="video-ph"';
    return '<div class="video"><' + tag + ">" +
      '<span class="vp-title">' + esc(opts.headline || item.title) + '</span><span class="vp-play">' + icon("play") + "</span>" +
      '<span class="vp-foot"><span>영상 준비 중' + (ch ? " · " + esc(D.brand.name) + " 채널에서 보기" : "") + "</span>" +
      (minutes ? '<span class="vp-time">' + esc(minutes) + "</span>" : "") + "</span></" + (ch ? "a" : "div") + "></div>";
  }
  function thumb(item) {
    const yid = DB.youtubeId(item.youtubeId);
    return '<span class="lesson-thumb">' + (yid ? '<img src="https://i.ytimg.com/vi/' + esc(yid) + '/mqdefault.jpg" alt="" loading="lazy">' : "") + icon("play") + "</span>";
  }
  const progressBar = (pct, thin) => '<div class="progress' + (thin ? " thin" : "") + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><span style="width:' + pct + '%"></span></div>';
  const pctText = (pct) => '<span class="big-pct">' + pct + "<small>%</small></span>";
  const pageHead = (title, sub, crumbs) =>
    '<header class="page-head">' + (crumbs ? '<nav class="crumbs">' + crumbs + "</nav>" : "") + "<h1>" + esc(title) + "</h1>" + (sub ? "<p>" + esc(sub) + "</p>" : "") + "</header>";
  const crumb = (items) => items.map((c, i) => (i < items.length - 1 ? '<a href="' + c[1] + '">' + esc(c[0]) + "</a>" + icon("chevRight", "xs") : "<span>" + esc(c[0]) + "</span>")).join("");
  function stateBadge(id) {
    const s = missionState(id);
    const l = lastSub(id);
    if (s === "done") return '<span class="badge badge-positive">' + icon("check", "xs") + (l && l.review ? "강사 승인" : "통과") + "</span>";
    if (s === "fix") return '<span class="badge badge-warning">' + (l && l.review ? "강사 보완 요청" : "보완 필요") + "</span>";
    return '<span class="badge badge-neutral">미제출</span>';
  }
  const empty = (ic, text) => '<div class="empty">' + icon(ic) + "<div>" + text + "</div></div>";

  /* ---------------- 로그인 ---------------- */
  function loginInstructor() {
    const list = DB.activeInstructors();
    const id = loginPick || DB.session.instructorPick();
    return list.find((x) => x.id === id) || null;
  }
  function renderLogin() {
    const list = DB.activeInstructors();
    const ins = loginInstructor();
    const brandIns = ins || list[0];
    const B = brandIns ? DB.content(brandIns.id).brand : { name: "두고 클래스", loginEyebrow: "DOOGO CLASS", loginHeadline: "온라인 강의\n함께 시작해요", loginSub: "" };
    document.title = (ins ? B.name : "두고 클래스") + " · 로그인";
    window.applyStudentTheme(DB.themeOf(B.theme));
    const lines = String(B.loginHeadline || B.courseTitle || "").split("\n");
    const headline = lines.map((l, i) => (i === lines.length - 1 && lines.length > 1 ? '<span class="accent">' + esc(l) + "</span>" : esc(l))).join("<br>");
    const picker = ins
      ? '<div class="ins-picked"><span class="ins-avatar">' + esc(ins.displayName.slice(0, 1)) + '</span><span class="ins-txt"><small>수강 중인 강의</small><b>' + esc(ins.displayName) + "</b><span>" + esc(DB.content(ins.id).brand.shortTitle) + "</span></span>" +
        '<button type="button" class="link-btn" data-action="change-instructor">변경</button></div>'
      : '<div class="field"><span class="field-label">어떤 강사님의 강의를 듣고 계신가요?</span><div class="ins-list" role="radiogroup">' +
        list.map((x) => '<button type="button" class="ins-option" role="radio" aria-checked="false" data-action="pick-instructor" data-id="' + x.id + '"><span class="ins-avatar">' + esc(x.displayName.slice(0, 1)) + "</span><b>" + esc(x.displayName) + "</b>" + icon("chevRight", "sm") + "</button>").join("") +
        '</div><span class="tiny">한 번 고르면 다음부터는 바로 로그인 화면이 열려요.</span></div>';
    root.innerHTML =
      '<main class="login">' +
        '<section class="login-brand">' + window.loginArt("wise", ["message", "play", "book", "award"]) +
          '<span class="login-logo">' + window.logoMark() + '<strong>' + esc(B.name) + "</strong><em>수강생</em></span>" +
          '<div class="login-hero">' +
            '<p class="login-eyebrow">' + esc(B.loginEyebrow || "DOOGO CLASS") + "</p>" +
            '<h2 class="login-headline">' + headline + "</h2>" +
            (B.loginSub ? '<p class="login-sub">' + esc(B.loginSub) + "</p>" : "") +
          "</div>" +
          '<div class="login-foot"><span class="login-copy">© 2026 ' + esc(B.name) + "</span>" + window.poweredBy("white", "login-powered") + "</div>" +
        "</section>" +
        '<section class="login-panel">' +
          '<div class="login-topright"><span>강사님이신가요?</span><a class="btn btn-dark btn-sm" href="#/center">강사센터</a></div>' +
          '<div class="login-stack">' +
            '<div class="login-card">' +
              '<p class="login-label">' + window.doogoLogo("color") + "<span>CLASS</span></p>" +
              "<h1>" + esc(ins ? B.name : "두고 클래스") + " 시작하기</h1>" +
              '<p class="lead">수강 신청할 때 등록한 정보로 로그인하세요.</p>' +
              '<form class="login-form" id="login-form" novalidate>' + picker +
                (ins
                  ? '<div class="field"><label for="lg-name">이름</label><div class="input-icon">' + icon("user", "sm") + '<input class="input" id="lg-name" name="name" autocomplete="name" placeholder="예: 홍길동" required></div></div>' +
                    '<div class="field"><label for="lg-phone">전화번호 뒷자리</label>' +
                      '<div class="input-icon input-wrap">' + icon("lock", "sm") + '<input class="input" id="lg-phone" name="phone4" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="숫자 4자리" required>' +
                      '<button type="button" class="input-addon" data-action="toggle-pw" data-for="lg-phone" aria-label="번호 보기">' + icon("eye", "sm") + "</button></div></div>" +
                    '<div class="row-end"><button type="button" data-action="forgot">로그인 정보를 잊으셨나요?</button></div>' +
                    '<p class="field-error" id="lg-error" role="alert"></p>' +
                    '<button class="btn btn-primary btn-block" type="submit">로그인</button>' +
                    '<p class="login-help">휴대폰 번호 뒷자리 4자리가 비밀번호 대신 사용됩니다.</p>'
                  : "") +
              "</form>" +
            "</div>" +
            (ins ? '<button type="button" class="login-alt" data-action="signup">' + icon("userPlus", "sm") + "아직 수강 신청 전이신가요? 수강 신청하기</button>" +
              ((DB.landingOf(ins.id) || {}).published ? '<a class="login-intro" href="#/p/' + esc(ins.id) + '">' + icon("book", "sm") + "강의 소개 보기 " + icon("arrowRight", "xs") + "</a>" : "") +
              (ins.id === "moon" ? '<div class="login-demo">체험 계정 · 이름 <b>이수진</b> / 뒷자리 <b>2186</b></div>' : "") : "") +
            '<nav class="login-legal" aria-label="약관">' +
              '<button type="button" data-action="legal" data-doc="terms">이용약관</button>' +
              '<button type="button" data-action="legal" data-doc="privacy">개인정보처리방침</button>' +
              '<button type="button" data-action="legal" data-doc="oss">오픈소스 라이선스</button>' +
            "</nav>" +
          "</div>" +
        "</section>" +
      "</main>";
  }

  function doLogin(form) {
    const ins = loginInstructor();
    const err = document.getElementById("lg-error");
    const name = form.name.value.replace(/\s+/g, "");
    const phone4 = form.phone4.value.trim();
    if (!name) { err.textContent = "이름을 입력해 주세요."; form.name.focus(); return; }
    if (!/^\d{4}$/.test(phone4)) { err.textContent = "전화번호 뒷자리 숫자 4자리를 입력해 주세요."; form.phone4.focus(); return; }
    const matches = DB.studentsOf(ins.id).filter((x) => x.name.replace(/\s+/g, "") === name && x.phone4 === phone4);
    const s = matches.find((x) => x.status === "approved") || matches[0];
    if (!s) { err.textContent = "등록된 수강생 정보와 일치하지 않아요. 이름과 뒷자리를 다시 확인해 주세요."; return; }
    if (s.status === "pending") { err.textContent = "수강 신청이 접수됐어요. " + ins.displayName + " 강사님이 승인하면 로그인할 수 있어요."; return; }
    if (s.status === "rejected") { err.textContent = "수강 신청이 승인되지 않았어요. 강사님께 문의해 주세요."; return; }
    if (s.status === "withdrawn") { err.textContent = "탈퇴 처리된 계정이에요. 다시 수강하려면 강사님께 문의해 주세요."; return; }
    DB.session.setInstructorPick(ins.id);
    DB.session.setStudent({ id: s.id, at: Date.now() });
    startSession();
    location.hash = "#/home";
    toast(s.name + "님, 환영합니다!");
  }

  // 강의 내용 중 커리큘럼(주차·강의·과제)만 내 기수가 고른 커리큘럼으로 바꿔 끼운다
  const cohortContent = (insId, co) => Object.assign({}, DB.content(insId), { weeks: DB.weeksOf(co) });
  function startSession() {
    me = null; preview = false;
    const sess = DB.session.student();
    if (!sess) return;
    if (sess.preview) {
      const ins = DB.instructor(sess.instructorId);
      const co = DB.cohort(sess.cohortId) || (ins && DB.currentCohort(ins.id));
      if (!ins || !co) return;
      INS = ins; CO = co; D = cohortContent(ins.id, co); preview = true;
      me = { id: "preview-" + ins.id, name: ins.displayName, instructorId: ins.id, cohortId: co.id };
    } else {
      const s = DB.student(sess.id);
      if (!s || s.status !== "approved") { DB.session.setStudent(null); return; }
      const ins = DB.instructor(s.instructorId);
      if (!ins || ins.status !== "active") return;
      CO = DB.cohort(s.cohortId);
      if (!CO) { me = null; return; }
      INS = ins; D = cohortContent(ins.id, CO); me = s;
    }
    P = DB.progress(me.id);
    checkLevelUp();
    draft = { missionId: null, files: [] };
    calCursor = null; calSel = null;
  }
  function logout() {
    DB.session.setStudent(null);
    me = null; P = null;
    location.hash = "#/login";
  }

  /* ---------------- 앱 셸 ---------------- */
  function renderShell() {
    root.innerHTML =
      '<div class="app' + (preview ? " has-preview" : "") + '" id="app">' +
        (preview ? '<div class="preview-bar"><span>' + icon("eye", "sm") + "<b>강사 미리보기</b> · " + esc(CO.name) + " 기준 수강생 화면이에요. 여기서 제출한 내용은 실제 수강생 기록에 섞이지 않아요.</span>" +
          '<span class="preview-actions"><button type="button" class="link-btn preview-exit" data-action="exit-preview">로그인 화면 보기</button><a class="btn btn-primary btn-sm" href="#/center">' + icon("arrowLeft", "sm") + "강사센터로 돌아가기</a></span></div>" : "") +
        '<header class="topbar">' +
          '<button class="menu-toggle" type="button" data-action="toggle-nav" aria-label="메뉴 열기">' + icon("menu") + "</button>" +
          '<a class="brand" href="#/home">' + window.logoMark() + '<span class="sr-only">홈</span><span class="brand-text"><small>' + esc(D.brand.name) + "</small><strong>" + esc(D.brand.courseTitle) + "</strong></span></a>" +
          '<div class="topbar-right">' +
            '<span class="hello"><span class="sprout lv-' + LV().cur.key + '" title="성장 레벨 · ' + esc(LV().cur.name) + '">' + icon(LV().cur.icon, "sm") + "</span><b>" + esc(me.name) + '</b><span class="txt">' + (preview ? "님 (미리보기)" : "님 환영합니다") + "</span></span>" +
            '<span class="cohort-chip">' + esc(CO.name) + "</span>" +
            (preview ? "" : '<button class="logout" type="button" data-action="logout">' + icon("logout", "sm") + "<span>로그아웃</span></button>") +
          "</div>" +
        "</header>" +
        '<div class="shell">' +
          '<aside class="sidebar" id="sidebar" aria-label="주 메뉴"></aside>' +
          '<div class="scrim" data-action="toggle-nav"></div>' +
          '<main class="main" id="main" tabindex="-1"></main>' +
        "</div>" +
        '<div class="bot-fab" id="bot-fab"></div>' +
      "</div>";
  }

  function renderSidebar(r) {
    const top = r.parts[0], sub = r.parts[1];
    const items = NAV().map((n) => {
      if (n.external) return '<li><a class="nav-item" href="' + esc(n.href) + '" target="_blank" rel="noopener">' + icon(n.icon) + "<span>" + esc(n.label) + "</span>" + icon("arrowUpRight", "sm chev") + "</a></li>";
      if (n.id === "page") { const act = top === "page" && sub === n.sub; return '<li><a class="nav-item' + (act ? " active" : "") + '" href="' + n.href + '">' + icon(n.icon) + "<span>" + esc(n.label) + "</span></a></li>"; }
      const active = top === n.id;
      const kids = n.children ? n.children() : null;
      const exact = active && (!kids || !sub);
      let html = '<li><a class="nav-item' + (exact ? " active" : active ? " parent-active open" : "") + '" href="' + n.href + '"' + (exact ? ' aria-current="page"' : "") + ">" +
        icon(n.icon) + "<span>" + esc(navLabel(n)) + "</span>" + (n.id === "notices" && unreadNotices() ? '<span class="nav-count">' + unreadNotices() + "</span>" : "") + (kids ? icon("chevDown", "sm chev") : "") + "</a>";
      if (kids && active) {
        html += '<ul class="subnav">' + kids.map((k) =>
          '<li><a href="' + k.href + '" class="' + (sub === k.id ? "active" : "") + '">' + esc(k.label) + (k.locked ? '<span class="lock">' + icon("lock", "xs") + "</span>" : "") + "</a></li>").join("") + "</ul>";
      }
      return html + "</li>";
    }).join("");
    document.getElementById("sidebar").innerHTML =
      '<ul class="nav">' + items + "</ul>" +
      '<div class="help-card"><strong>도움이 필요하신가요?</strong><p>궁금한 점은 Q&A의 자주 묻는 질문에서 먼저 확인하시고, 화면이 이상하거나 기능이 안 되면 요청사항으로 알려 주세요.</p>' +
      (D.brand.kakaoChannel ? '<a class="btn btn-primary btn-sm btn-block" href="' + esc(D.brand.kakaoChannel) + '" target="_blank" rel="noopener" style="margin-bottom:8px">' + icon("message", "sm") + "카카오톡 문의</a>" : "") +
      (on("qna") ? '<a class="btn btn-tertiary btn-sm btn-block" href="#/qna/requests/new">' + icon("bug", "sm") + "오류 신고하기</a>" : "") + '<div class="side-powered">' + window.poweredBy("color") + "</div></div>";
  }

  /* ---------------- 홈 ---------------- */
  function pageHome() {
    const o = overallStats();
    const nm = nextMissionOverall();
    const today = todayStr();
    const evs = myEvents().filter((e) => e.date >= today);
    const upcoming = evs.slice(0, 4);
    const nextLive = evs.find((e) => e.type !== "deadline");
    const notices = D.notices.slice().sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date)).slice(0, 4);
    const quote = D.quotes.length ? D.quotes[parseDate(today).getDate() % D.quotes.length] : "";
    const mv = on("motivation") ? D.motivation[0] : null;
    const dday = nextLive ? daysUntil(nextLive.date) : null;
    const wk = DB.currentWeek(CO);
    const lv = LV();
    const todayLive = evs.find((e) => e.date === today && e.url);
    const G = D.guide || [], gDone = G.filter((g) => (P.guide || {})[g.id]).length;
    const guideCard = G.length && gDone < G.length
      ? '<section class="card start-guide"><div class="home-video-head"><h2>' + icon("sparkles") + "처음 오셨나요? 시작 가이드</h2><span class=\"tiny\">" + gDone + " / " + G.length + " 완료</span></div>" + progressBar(Math.round(gDone / G.length * 100), true) +
          '<ul class="guide-list">' + G.map((g) => {
            const ok = !!(P.guide || {})[g.id];
            return '<li class="' + (ok ? "done" : "") + '"><button type="button" class="g-check" data-action="toggle-guide" data-id="' + esc(g.id) + '" aria-pressed="' + ok + '" aria-label="' + esc(g.title) + (ok ? " 완료 취소" : " 완료") + '">' + (ok ? icon("check", "sm") : "") + "</button>" +
              '<div class="g-txt"><b>' + esc(g.title) + "</b>" + (g.desc ? "<span>" + esc(g.desc) + "</span>" : "") + "</div>" +
              (g.url ? '<a class="link-btn" href="' + esc(g.url) + '"' + (/^https?:/i.test(g.url) ? ' target="_blank" rel="noopener"' : "") + ">바로가기 " + icon(/^https?:/i.test(g.url) ? "arrowUpRight" : "arrowRight", "sm") + "</a>" : "") + "</li>";
          }).join("") + "</ul></section>"
      : "";
    return '<div class="page">' +
      '<header class="page-head greet"><span class="greet-icon lv-' + lv.cur.key + '" title="성장 레벨 · ' + esc(lv.cur.name) + '">' + icon(lv.cur.icon, "lg") + '</span><div><h1>' + esc(me.name) + "님, 다시 만나서 반갑습니다</h1><p>" + esc(quote || (CO.name + " · " + (wk ? wk + "주차 진행 중" : fmtMD(CO.startDate) + " 시작"))) + "</p></div></header>" +
      levelCard(lv) +

      (todayLive ? '<section class="card live-today">' + icon("video") + '<div><b>오늘 ' + (todayLive.time ? esc(todayLive.time) + " " : "") + esc(todayLive.title) + '</b><span class="tiny">시간이 되면 아래 버튼으로 바로 들어오세요.</span></div>' + liveBtn(todayLive) + "</section>" : "") +
      guideCard +
      (mv ? '<section class="card"><div class="home-video-head"><h2>' + icon("flame") + "오늘의 동기부여</h2>" +
        '<a class="link-btn" href="#/motivation">지난 영상 보기 ' + icon("arrowRight", "sm") + "</a></div>" + video(mv) +
        '<p class="tiny" style="margin:12px 0 0">' + esc(mv.title) + "</p></section>" : "") +

      (on("missions") || on("schedule") ? '<div class="grid-3" style="margin-top:14px">' +
        (on("missions") ? '<a class="card stat plain-link" href="#/missions"><span class="stat-label">전체 진행률</span><span class="stat-value">' + o.pct + "%</span>" + progressBar(o.pct, true) + "</a>" +
        '<a class="card stat plain-link" href="' + (on("certificate") ? "#/certificate" : "#/missions") + '"><span class="stat-label">필수 과제 통과</span><span class="stat-value">' + o.reqDone + ' <small class="tiny">/ ' + o.reqTotal + '</small></span><span class="tiny">모두 통과하면 수료증 발급</span></a>' : "") +
        (on("schedule") ? '<a class="card stat plain-link" href="#/schedule"><span class="stat-label">다음 일정</span><span class="stat-value">' + (nextLive ? (dday === 0 ? "오늘" : "D-" + dday) : "-") + '</span><span class="tiny">' + (nextLive ? esc(fmtMD(nextLive.date) + " " + DB.EVENT_TYPES[nextLive.type].label) : "예정된 일정 없음") + "</span></a>" : "") +
      "</div>" : "") +

      (on("missions") ? '<div class="section-head"><h2>이어서 할 과제</h2><a class="link-btn" href="#/missions">전체 과제 ' + icon("arrowRight", "sm") + "</a></div>" +
      (nm
        ? '<a class="card next-card plain-link" href="#/missions/' + nm.weekNo + "/" + nm.id + '"><span class="wk-icon">' + icon("checks") + "</span>" +
            '<div style="flex:1;min-width:0"><div class="tiny">' + nm.weekNo + "주차 · " + kindOf(nm).short + " · 마감 " + fmtMD(DB.weekDeadline(CO, nm.weekNo)) + '</div><div class="m-title">' + esc(nm.title) + " " + stateBadge(nm.id) + '</div><div class="m-desc">' + esc(nm.desc) + "</div></div>" +
            '<span class="btn btn-primary btn-sm">열기 ' + icon("arrowRight", "sm") + "</span></a>"
        : '<div class="card callout-ok callout">' + icon("check") + "<div>" + (D.weeks.length && !isOpen(D.weeks[0]) ? fmtMD(CO.startDate) + "에 1주차가 열려요. 조금만 기다려 주세요!" : "열린 주차의 과제를 모두 마쳤어요! 다음 주차가 열리면 바로 시작해 보세요.") + "</div></div>") : "") +

      (on("notices") || on("schedule") ? '<div class="grid-2" style="margin-top:14px">' +
        (on("notices") ? '<section class="card"><div class="home-video-head"><h2>공지사항</h2><a class="link-btn" href="#/notices">더보기 ' + icon("arrowRight", "sm") + "</a></div>" +
          (notices.length ? notices.map((n) => '<a class="list-row" href="#/notices/' + n.id + '">' + (n.pinned ? '<span class="badge badge-ink">필독</span>' : "") + '<span class="lr-title">' + esc(n.title) + "</span>" + newBadge(n) + '<span class="lr-date">' + fmtMD(n.date) + "</span></a>").join("") : '<p class="muted" style="margin:0">아직 공지가 없어요.</p>') +
        "</section>" : "") +
        (on("schedule") ? '<section class="card"><div class="home-video-head"><h2>다가오는 일정</h2><a class="link-btn" href="#/schedule">전체 일정 ' + icon("arrowRight", "sm") + "</a></div>" +
          (upcoming.length ? upcoming.map((e) => {
            const d = parseDate(e.date);
            return '<div class="list-row"><span class="date-pill' + (e.date === today ? " today" : "") + '"><small>' + (d.getMonth() + 1) + "월</small><b>" + d.getDate() + '</b></span><span class="lr-title"><i class="ev-dot ' + e.type + '"></i> ' + esc(e.title) + '</span><span class="lr-date">' + DOW[d.getDay()] + (e.time ? " " + esc(e.time) : "") + "</span></div>";
          }).join("") : '<p class="muted" style="margin:0">예정된 일정이 없습니다.</p>') +
        "</section>" : "") +
      "</div>" : "") +
    "</div>";
  }

  /* ---------------- 성장 레벨 ---------------- */
  // 주차가 지날 때마다 씨앗 → 풀잎 → 가지 → 나무 → 숲 (4주 강의는 나무 없이 숲)
  const LV = () => DB.level(CO);
  function levelCard(lv) {
    const left = lv.nextDate ? daysUntil(lv.nextDate) : null;
    return '<section class="card lv-card" aria-label="성장 레벨"><div class="lv-head"><span class="tiny">' + esc(me.name) + '님의 성장 단계</span><b>' + esc(lv.cur.name) + ' <small>' + (lv.idx + 1) + " / " + lv.steps.length + "단계</small></b></div>" +
      '<ol class="lv-path">' + lv.steps.map((st, i) => '<li class="' + (i < lv.idx ? "past" : i === lv.idx ? "now" : "") + '"><span class="lv-ic lv-' + st.key + '">' + icon(st.icon, "sm") + "</span><small>" + esc(st.name) + "</small></li>").join("") + "</ol>" +
      '<p class="lv-foot">' + (lv.next ? "다음 단계 ‘" + esc(lv.next.name) + "’까지 " + (left > 0 ? "D-" + left : "곧") + " · 주차가 지날 때마다 한 단계씩 자라요" : "마지막 단계까지 왔어요. 끝까지 함께해 주셔서 고마워요!") + "</p></section>";
  }
  // 지난번 접속 때보다 레벨이 올랐으면 한 번 축하
  function checkLevelUp() {
    const lv = LV();
    if (P.level == null) { P.level = lv.idx; saveProgress(); return; }
    if (lv.idx > P.level) { P.level = lv.idx; saveProgress(); setTimeout(() => toast("레벨업! 이제 ‘" + lv.cur.name + "’ 단계예요 🎉"), 400); }
    else if (lv.idx !== P.level) { P.level = lv.idx; saveProgress(); }
  }

  /* ---------------- 커리큘럼 ---------------- */
  // 커리큘럼: 주차마다 강의일 · 핵심 목표 · 강의 내용 · 과제(필수 · 도전 · 마인드)를 한 장에. 강의 영상은 있으면 아래에 덧붙인다
  function pageCurriculum(r) {
    if (r.parts[1]) return pageLesson(r.parts[1]);
    const cur = D.weeks.find((w) => isOpen(w) && todayStr() <= deadlineOf(w)) || D.weeks.filter(isOpen).slice(-1)[0];
    return '<div class="page">' + pageHead("커리큘럼", "주차별 강의 내용과 과제를 한눈에 확인하세요.") +
      (D.weeks.length ? '<div class="cw-list">' + D.weeks.map((w) => curWeekCard(w, cur === w)).join("") + "</div>"
        : '<section class="card">' + empty("book", "커리큘럼을 준비하고 있어요.") + "</section>") + "</div>";
  }
  function curWeekCard(w, now) {
    const open = isOpen(w), st = weekStats(w);
    const lectureDay = DB.classDate(CO, w.no);
    const head = '<div class="cw-head"><div class="cw-head-main">' +
        '<p class="cw-date">' + icon("calendar", "xs") + "강의일 · " + fmtMD(lectureDay) + (now ? '<span class="cw-now">이번 주</span>' : "") + "</p>" +
        "<h2>" + w.no + "주차 · " + esc(w.title) + "</h2>" + (w.subtitle || w.summary ? '<p class="cw-sub">' + esc(w.subtitle || w.summary) + "</p>" : "") + "</div>" +
        (open && on("missions") && w.missions.length ? '<a class="btn btn-primary cw-go" href="#/missions/' + w.no + '">과제 보러 가기 ' + icon("arrowRight", "sm") + "</a>" : "") + "</div>";
    if (!open) {
      return '<section class="card cw cw-locked">' + head +
        '<div class="cw-lock">' + icon("lock") + '<div><b>아직 열리지 않은 주차입니다</b><span>' + fmtMD(openOf(w)) + "부터 강의 내용이 공개됩니다</span></div></div></section>";
    }
    const mrow = (m) => {
      const s = missionState(m.id);
      const tag = on("missions") ? 'a href="#/missions/' + w.no + "/" + m.id + '"' : "a";
      return "<li><" + tag + '><span class="cw-mk ' + (s === "done" ? "done" : s === "fix" ? "fix" : "") + '">' + (s === "done" ? icon("check", "xs") : s === "fix" ? "!" : "") + "</span><span>" + esc(m.title) + "</span></a></li>";
    };
    const groups = DB.MISSION_KINDS.map((k) => {
      const list = w.missions.filter((m) => DB.missionKind(m) === k.key);
      return list.length ? '<div class="cw-mgroup ' + k.key + '"><h4>' + k.label + " <span>" + list.length + "개</span></h4><ul>" + list.map(mrow).join("") + "</ul></div>" : "";
    }).join("");
    const watched = w.lessons.filter((l) => P.watched[l.id]).length;
    return '<section class="card cw">' + head +
      (w.goal ? '<div class="cw-goal"><span class="cw-goal-label">' + icon("target", "sm") + "핵심 목표</span><p>" + esc(w.goal) + "</p></div>" : "") +
      ((w.topics || []).length ? '<div class="cw-sec"><h3>강의 내용</h3><ul class="cw-topics">' + w.topics.map((t) => "<li>" + esc(t) + "</li>").join("") + "</ul></div>" : "") +
      (w.missions.length ? '<div class="cw-sec"><div class="cw-sec-head"><h3>과제</h3><span class="cw-period">' + icon("clock", "xs") + "과제 제출 기간 · " + fmtMD(openOf(w)) + " ~ " + fmtMD(deadlineOf(w)) + "</span>" +
          '<span class="cw-progress">' + st.done + "/" + st.total + " 완료</span></div>" +
        '<div class="cw-mgrid">' + groups + "</div></div>" : "") +
      (w.lessons.length ? '<details class="cw-lessons"' + (watched < w.lessons.length ? " open" : "") + '><summary>' + icon("play", "sm") + "강의 영상 " + w.lessons.length + '개 <span class="tiny">' + watched + "개 시청 완료</span>" + icon("chevDown", "sm") + "</summary>" +
        w.lessons.map((l) => '<a class="lesson" href="#/curriculum/' + l.id + '">' + thumb(l) + '<div><div class="lesson-title">' + esc(l.title) + '</div><div class="lesson-desc">' + esc(l.desc) + "</div></div>" +
          (P.watched[l.id] ? '<span class="badge badge-positive">' + icon("check", "xs") + "시청 완료</span>" : '<span class="tiny">' + (l.minutes ? esc(l.minutes) + "분" : "") + "</span>") + "</a>").join("") + "</details>" : "") +
      "</section>";
  }
  function pageLesson(id) {
    const w = D.weeks.find((x) => x.lessons.some((l) => l.id === id));
    if (!w) return notFound();
    if (!isOpen(w)) return lockedPage(w, "curriculum");
    const all = D.weeks.flatMap((x) => x.lessons.map((l) => Object.assign({ w: x }, l)));
    const i = all.findIndex((l) => l.id === id);
    const l = all[i], prev = all[i - 1], next = all[i + 1];
    const done = !!P.watched[id];
    return '<div class="page">' + pageHead(l.title, w.no + "주차 · " + w.title + (l.minutes ? " · " + l.minutes + "분" : ""), crumb([["커리큘럼", "#/curriculum"], [w.no + "주차", "#/curriculum"], [l.title]])) +
      '<section class="card">' + video(l) +
        (l.desc ? '<div class="lesson-body">' + DB.rich(l.desc) + "</div>" : "") + attachmentList(l.attachments) +
        '<div class="guide-actions" style="margin-top:20px">' +
          '<button class="btn ' + (done ? "btn-secondary" : "btn-primary") + '" data-action="toggle-watched" data-id="' + id + '">' + icon("check", "sm") + (done ? "시청 완료됨 · 취소" : "시청 완료로 표시") + "</button>" +
          (on("missions") ? '<a class="btn btn-tertiary" href="#/missions/' + w.no + '">' + w.no + "주차 과제 보기</a>" : "") +
        "</div></section>" +
      '<section class="card" style="margin-top:14px"><div class="home-video-head"><h2>' + icon("pen") + '내 메모</h2><span class="tiny" id="note-state">' + ((P.notes || {})[id] ? "저장됨" : "적으면 자동으로 저장돼요") + "</span></div>" +
        '<textarea class="textarea" id="lesson-note" data-id="' + esc(id) + '" rows="5" placeholder="강의를 보며 기억할 내용, 궁금한 점을 적어 두세요. 나만 볼 수 있어요.">' + esc((P.notes || {})[id] || "") + "</textarea></section>" +
      '<div class="grid-2" style="margin-top:14px">' +
        (prev && isOpen(prev.w) ? '<a class="card list-row" href="#/curriculum/' + prev.id + '">' + icon("chevLeft") + '<span class="lr-title"><span class="tiny">이전 강의</span><br>' + esc(prev.title) + "</span></a>" : "<div></div>") +
        (next && isOpen(next.w) ? '<a class="card list-row" href="#/curriculum/' + next.id + '" style="text-align:right"><span class="lr-title"><span class="tiny">다음 강의</span><br>' + esc(next.title) + "</span>" + icon("chevRight") + "</a>" : "<div></div>") +
      "</div></div>";
  }

  /* ---------------- 과제 ---------------- */
  function pageMissions(r) {
    const [, weekNo, missionId] = r.parts;
    if (missionId) return pageMissionDetail(weekNo, missionId);
    if (weekNo) return pageWeek(weekNo);
    const o = overallStats();
    return '<div class="page">' + pageHead("과제 제출하기", "주차별 과제를 선택해서 제출하고, 자동검수 결과를 확인하세요.") +
      '<section class="card overall"><div class="overall-top"><span>전체 진행률</span>' + pctText(o.pct) + "</div>" + progressBar(o.pct) +
        '<span class="tiny" style="color:var(--body)">전체 ' + o.total + "개 중 " + o.done + "개 완료</span></section>" +
      '<div class="section-head"><h2>주차 선택</h2><span class="hint">주차를 눌러 과제를 확인하세요</span></div>' +
      '<div class="grid-2">' + D.weeks.map(weekCard).join("") + "</div></div>";
  }
  function weekCard(w) {
    const st = weekStats(w), open = isOpen(w);
    const nm = open ? nextMission(w) : null;
    const top = '<div class="wk-top"><span class="wk-icon">' + icon("book") + '</span><div><div class="wk-title">' + w.no + '주차</div><div class="wk-meta">' + kindCount(st) + " · " + st.done + "/" + st.total + " 완료</div></div>" + pctText(st.pct) + "</div>";
    if (!open) return '<div class="week-card locked">' + top + progressBar(0, true) + '<div class="wk-foot"><span class="lock-msg">' + icon("lock", "sm") + fmtMD(openOf(w)) + "부터 과제 제출이 공개됩니다.</span></div></div>";
    return '<a class="week-card" href="#/missions/' + w.no + '">' + top + progressBar(st.pct, true) +
      '<div class="wk-foot"><span>' + (nm ? "<b>다음:</b> " + esc(nm.title) : "<b>모든 과제 완료!</b>") + '</span><span class="link-btn">열기 ' + icon("arrowRight", "sm") + "</span></div></a>";
  }
  function pageWeek(no) {
    const w = findWeek(no);
    if (!w) return notFound();
    if (!isOpen(w)) return lockedPage(w);
    const st = weekStats(w);
    const row = (m) => {
      const s = missionState(m.id);
      const typeLabel = { image: "사진 인증", link: "링크 제출", text: "글 작성" }[m.type] || "";
      return '<a class="mission" href="#/missions/' + w.no + "/" + m.id + '"><span class="m-check ' + (s === "done" ? "done" : s === "fix" ? "fix" : "") + '">' +
        (s === "done" ? icon("check", "sm") : s === "fix" ? "!" : icon(m.type === "image" ? "image" : m.type === "link" ? "link" : "pen", "sm")) + "</span>" +
        '<div style="min-width:0"><div class="m-title">' + esc(m.title) + " " + stateBadge(m.id) + '</div><div class="m-desc">' + typeLabel + " · " + esc(m.desc) + "</div></div>" + icon("chevRight") + "</a>";
    };
    const late = todayStr() > deadlineOf(w);
    return '<div class="page">' + pageHead(w.no + "주차 · " + w.title, w.summary, crumb([["과제 제출하기", "#/missions"], [w.no + "주차"]])) +
      '<section class="card overall"><div class="overall-top"><span>' + w.no + "주차 진행률</span>" + pctText(st.pct) + "</div>" + progressBar(st.pct) +
        '<span class="tiny" style="color:var(--body)">' + kindCount(st) + " · " + st.total + "개 중 " + st.done + "개 완료 · " + fmtMD(openOf(w)) + " 공개 · <b" + (late ? ' style="color:var(--negative)"' : "") + ">" + fmtMD(deadlineOf(w)) + " 마감" + (late ? " (지남)" : "") + "</b></span></section>" +
      DB.MISSION_KINDS.map((k) => {
        const list = w.missions.filter((m) => DB.missionKind(m) === k.key);
        return list.length ? '<div class="section-head"><h2>' + k.label + ' <span class="tiny">' + list.length + '개</span></h2><span class="hint">' + k.hint + "</span></div>" + list.map(row).join("") : "";
      }).join("") +
      (!w.missions.length ? '<section class="card" style="margin-top:14px">' + empty("checks", "이번 주차 과제를 준비하고 있어요.") + "</section>" : "") +
      "</div>";
  }
  function pageMissionDetail(no, id) {
    const w = findWeek(no);
    const m = w && w.missions.find((x) => x.id === id);
    if (!m) return notFound();
    if (!isOpen(w)) return lockedPage(w);
    if (draft.missionId !== id) draft = { missionId: id, files: [] };
    const subs = P.submissions[id] || [];
    const last = subs[subs.length - 1];
    const typeLabel = { image: "사진 · PDF 인증", link: "링크 제출", text: "글 작성" }[m.type] || "";
    const c = m.check || {};
    const late = todayStr() > deadlineOf(w);

    let form = '<form id="submit-form" data-id="' + id + '" class="stack" novalidate>';
    if (m.type === "image") {
      form += '<label class="dropzone" id="dropzone"><input type="file" id="file-input" accept="image/*,.pdf" multiple class="sr-only">' + icon("image") +
        '<strong>사진 또는 PDF를 끌어다 놓거나 눌러서 선택</strong><span class="tiny">최대 3개 · 개인정보(주민번호·계좌번호)는 가리고 올려 주세요</span></label>' +
        '<div class="thumbs" id="thumbs">' + draftThumbs() + "</div>" +
        '<div class="field"><label for="sub-text">메모 <span class="tiny">(선택)</span></label><textarea class="textarea" id="sub-text" name="text" rows="3" style="min-height:96px" placeholder="강사님께 남길 말이 있으면 적어 주세요"></textarea></div>';
    } else if (m.type === "link") {
      form += '<div class="field"><label for="sub-link">링크</label><input class="input" id="sub-link" name="link" type="url" inputmode="url" placeholder="https://' + esc(c.linkHint || "") + (c.linkHint ? "/…" : "") + '" value="' + esc(last ? last.link : "") + '"></div>' +
        '<div class="field"><label for="sub-text">메모 <span class="tiny">(선택)</span></label><textarea class="textarea" id="sub-text" name="text" rows="3" style="min-height:96px">' + esc(last ? last.text : "") + "</textarea></div>";
    } else {
      form += '<div class="field"><label for="sub-text">내용 <span class="tiny" id="char-count">' + (c.minLength ? "최소 " + c.minLength + "자" : "") + "</span></label>" +
        '<textarea class="textarea" id="sub-text" name="text" rows="8" data-min="' + (c.minLength || 0) + '" placeholder="' + esc((m.steps || []).join(" / ")) + '">' + esc(last ? last.text : "") + "</textarea></div>";
    }
    form += '<button class="btn btn-primary" type="submit">' + icon("send", "sm") + (last ? "다시 제출하고 검수받기" : "제출하고 자동검수 받기") + "</button></form>";

    const lastFiles = last && last.files && last.files.length
      ? '<div class="card"><p class="side-label">마지막으로 낸 파일</p><div class="thumbs">' + last.files.map((f) => f.type === "pdf"
          ? '<a class="thumb" ' + (f.data ? 'href="' + f.data + '" download="' + esc(f.name) + '"' : "") + '><div class="thumb-pdf">' + icon("file") + esc(f.name) + "</div></a>"
          : '<a class="thumb" href="' + f.data + '" target="_blank" rel="noopener"><img src="' + f.data + '" alt="' + esc(f.name) + '"></a>').join("") + "</div></div>"
      : "";
    const history = subs.length
      ? '<ul class="history">' + subs.slice().reverse().map((s, i) => "<li><span>" + (subs.length - i) + "차 제출 · " + fmtStamp(s.at) + "</span>" +
          (s.review ? (s.review.status === "approved" ? '<span class="badge badge-positive">강사 승인</span>' : '<span class="badge badge-warning">보완 요청</span>') : s.result.pass ? '<span class="badge badge-positive">통과</span>' : '<span class="badge badge-warning">보완</span>') + "</li>").join("") + "</ul>"
      : '<p class="tiny" style="margin:0">아직 제출 기록이 없어요.</p>';

    return '<div class="page">' + pageHead(m.title, "", crumb([["과제 제출하기", "#/missions"], [w.no + "주차", "#/missions/" + w.no], [m.title]])) +
      '<div class="detail-grid">' +
        '<section class="card">' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">' + (m.required ? '<span class="badge badge-ink">필수</span>' : '<span class="badge badge-neutral">' + kindOf(m).short + "</span>") + '<span class="badge badge-neutral">' + typeLabel + "</span>" +
            '<span class="badge ' + (late ? "badge-negative" : "badge-neutral") + '">' + fmtMD(deadlineOf(w)) + " 마감" + (late ? " 지남" : "") + "</span>" + stateBadge(id) + "</div>" +
          '<p style="margin:0 0 20px;font-size:16px;line-height:1.75">' + esc(m.desc) + "</p>" +
          ((m.steps || []).length ? '<p class="side-label">이렇게 하세요</p><ol class="steps">' + m.steps.map((s) => "<li>" + esc(s) + "</li>").join("") + "</ol>" : "") +
          '<hr style="border:0;border-top:1px solid var(--line-soft);margin:24px 0">' +
          form + '<div id="result">' + (last ? resultBox(last) : "") + "</div>" +
        "</section>" +
        '<aside class="stack">' +
          '<div class="card"><p class="side-label">자동검수 기준</p><ul class="history">' + (checkCriteria(m).map((t) => "<li><span>" + esc(t) + "</span></li>").join("") || "<li><span>제출하면 바로 통과</span></li>") + "</ul></div>" +
          '<div class="card"><p class="side-label">제출 이력</p>' + history + "</div>" + lastFiles +
          '<div class="card card-dark"><p style="margin:0 0 12px;font-weight:800;color:var(--accent)">막히셨나요?</p><p class="tiny" style="color:#b8bdb2;margin:0 0 14px">' + esc(D.brand.botName) + "에게 바로 물어보세요.</p>" +
            '<button class="btn btn-primary btn-sm btn-block" data-action="ask-bot" data-q="' + esc(m.title + " 어떻게 해요?") + '">' + icon("sparkles", "sm") + "AI봇에게 물어보기</button></div>" +
        "</aside>" +
      "</div></div>";
  }
  function checkCriteria(m) {
    const c = m.check || {}, out = [];
    if (c.image && m.type === "image") out.push("인증 사진·PDF 1개 이상");
    if (c.link && m.type === "link") out.push("올바른 링크 형식" + (c.linkHint ? " (" + c.linkHint + ")" : ""));
    if (c.minLength) out.push("공백 제외 " + c.minLength + "자 이상");
    (c.keywords || []).forEach((k) => out.push("‘" + k + "’ 포함"));
    return out;
  }
  function resultBox(s) {
    let html = "";
    if (s.review) {
      html += s.review.status === "approved"
        ? '<div class="result pass"><h4>' + icon("check") + "강사님이 승인했어요</h4><p>" + esc(fmtStamp(s.review.at)) + (s.review.comment ? " · " + esc(s.review.comment) : "") + "</p></div>"
        : '<div class="result fix"><h4>' + icon("alert") + "강사님이 보완을 요청했어요</h4><p>" + esc(s.review.comment || "내용을 보완해서 다시 제출해 주세요.") + "</p></div>";
    }
    if (s.result.pass) {
      html += '<div class="result pass"' + (s.review ? ' style="opacity:.7"' : "") + "><h4>" + icon("check") + "자동검수 통과</h4><p>" + esc(fmtStamp(s.at)) + " 제출 · 진행률에 반영되었습니다." + (s.review ? "" : " 강사님이 한 번 더 확인할 수 있어요.") + "</p>" +
        (s.result.ok.length ? "<ul>" + s.result.ok.map((t) => "<li>" + esc(t) + "</li>").join("") + "</ul>" : "") + "</div>";
    } else {
      html += '<div class="result fix"><h4>' + icon("alert") + "자동검수 · 보완이 필요해요</h4><p>아래 항목을 채워서 다시 제출해 주세요.</p><ul>" + s.result.reasons.map((t) => "<li>" + esc(t) + "</li>").join("") + "</ul></div>";
    }
    return html;
  }
  function draftThumbs() {
    return draft.files.map((f, i) =>
      '<div class="thumb">' + (f.type === "pdf" ? '<div class="thumb-pdf">' + icon("file") + esc(f.name) + "</div>" : '<img src="' + f.data + '" alt="' + esc(f.name) + '">') +
      '<button type="button" data-action="remove-file" data-i="' + i + '" aria-label="삭제">' + icon("x", "xs") + "</button></div>").join("");
  }
  function addFiles(fileList) {
    Array.from(fileList || []).forEach((file) => {
      if (draft.files.length >= 3) { toast("파일은 최대 3개까지 올릴 수 있어요.", "warn"); return; }
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        // 1MB 이하 PDF는 강사가 열어 볼 수 있게 내용까지 보관 (그보다 크면 파일 이름만)
        if (file.size > 1048576) { draft.files.push({ type: "pdf", name: file.name }); refreshThumbs(); toast("1MB가 넘는 PDF는 이름만 올라가요. 사진으로 찍어 올리면 강사님이 바로 볼 수 있어요.", "warn"); return; }
        const fr = new FileReader();
        fr.onload = () => { if (draft.files.length < 3) draft.files.push({ type: "pdf", name: file.name, data: fr.result }); refreshThumbs(); };
        fr.readAsDataURL(file);
        return;
      }
      if (!/^image\//.test(file.type)) { toast("사진 또는 PDF만 올릴 수 있어요.", "warn"); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          // 브라우저 저장 공간을 아끼려고 긴 변 900px JPEG로 줄여서 보관
          const scale = Math.min(1, 900 / Math.max(img.width, img.height));
          const cv = document.createElement("canvas");
          cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          if (draft.files.length < 3) draft.files.push({ type: "image", name: file.name, data: cv.toDataURL("image/jpeg", 0.72) });
          refreshThumbs();
        };
        img.onerror = () => toast("사진을 읽지 못했어요. 다른 파일로 시도해 주세요.", "warn");
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  function compressImage(file, max, cb) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        cb(cv.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = () => toast("사진을 읽지 못했어요. 다른 파일로 시도해 주세요.", "warn");
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
  function refreshThumbs() { const t = document.getElementById("thumbs"); if (t) t.innerHTML = draftThumbs(); }
  function submitMission(form) {
    const id = form.dataset.id;
    const m = findMission(id);
    const sub = { at: Date.now(), text: form.text ? form.text.value : "", link: form.link ? form.link.value : "", files: m.type === "image" ? draft.files.slice() : [] };
    sub.result = autoCheck(m, sub);
    const before = isDone(id);
    (P.submissions[id] = P.submissions[id] || []).push(sub);
    if (!saveProgress()) { P.submissions[id].pop(); return; }
    if (sub.result.pass) draft.files = [];
    render();
    const res = document.getElementById("result");
    if (res) res.scrollIntoView({ behavior: "smooth", block: "center" });
    toast(sub.result.pass ? (before ? "다시 제출했어요." : "자동검수 통과! 진행률에 반영됐어요.") : "보완이 필요한 항목이 있어요.", sub.result.pass ? "" : "warn");
  }

  /* ---------------- 강의 일정 ---------------- */
  function pageSchedule() {
    const today = todayStr();
    const evs = myEvents();
    if (!calSel) calSel = today;
    if (!calCursor) { const t = parseDate(calSel); calCursor = { y: t.getFullYear(), m: t.getMonth() }; }
    const { y, m } = calCursor;
    const startOffset = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < Math.ceil((startOffset + days) / 7) * 7; i++) cells.push(DB.date.toStr(new Date(y, m, 1 - startOffset + i)));
    const byDate = {};
    evs.forEach((e) => { (byDate[e.date] = byDate[e.date] || []).push(e); });
    const sel = byDate[calSel] || [];
    const T = DB.EVENT_TYPES;
    const used = Object.keys(T).filter((k) => evs.some((e) => e.type === k) || ["open", "deadline", "qna", "notice", "challenge"].indexOf(k) !== -1);
    return '<div class="page">' + pageHead("강의 일정", "강의 오픈일, 과제 마감일, 라이브 Q&A 일정을 한눈에 확인하세요.") +
      '<section class="card cal-card"><div class="cal-head"><h2>' + y + "년 " + (m + 1) + "월</h2>" +
        '<div class="cal-nav"><button class="icon-btn ghost" data-action="cal-move" data-d="-1" aria-label="이전 달">' + icon("chevLeft") + '</button><button class="btn btn-tertiary btn-sm" data-action="cal-today">오늘</button><button class="icon-btn ghost" data-action="cal-move" data-d="1" aria-label="다음 달">' + icon("chevRight") + "</button></div></div>" +
        '<div class="cal">' + DOW.map((d, i) => '<div class="cal-dow' + (i === 0 ? " sun" : "") + '">' + d + "</div>").join("") +
          cells.map((k) => {
            const d = parseDate(k);
            const list = byDate[k] || [];
            const types = list.map((e) => e.type).filter((t, i, a) => a.indexOf(t) === i);
            return '<button type="button" class="cal-day' + (d.getMonth() !== m ? " other" : "") + (k === today ? " today" : "") + (k === calSel ? " sel" : "") + (d.getDay() === 0 ? " sun" : "") +
              '" data-action="cal-pick" data-date="' + k + '" aria-label="' + esc(fmtKo(k) + (list.length ? " 일정 " + list.length + "건" : "")) + '"><span class="d">' + d.getDate() + '</span><span class="dots">' +
              types.slice(0, 4).map((t) => '<i class="ev-dot ' + t + '"></i>').join("") + "</span></button>";
          }).join("") +
        "</div>" +
        '<div class="legend">' + used.map((k) => '<span><i class="ev-dot ' + k + '"></i>' + T[k].label + "</span>").join("") + "</div>" +
      "</section>" +
      '<section class="card" style="margin-top:14px"><div class="home-video-head"><h2>' + fmtKo(calSel) + '</h2><span class="tiny">' + sel.length + "건</span></div>" +
        (sel.length ? '<div class="stack">' + sel.map((e) =>
          '<div class="ev-card"><i class="ev-dot ' + e.type + '"></i><div style="flex:1;min-width:0"><div class="tiny">' + T[e.type].label + (e.week ? " · " + e.week + "주차" : "") + (e.time && e.type !== "open" ? " · " + esc(e.time) : "") + '</div><div class="ev-title">' + esc(e.title) + "</div></div>" +
          (e.url && e.date >= today ? liveBtn(e, true) : "") +
          ((e.type === "open" || e.type === "deadline") && e.week && findWeek(e.week) && !(e.url && e.date >= today) ? '<a class="link-btn" href="#/missions/' + e.week + '">' + (e.type === "open" ? "과제 보기" : "제출하기") + " " + icon("arrowRight", "sm") + "</a>" : "") + "</div>").join("") + "</div>"
          : '<p class="muted" style="margin:0">이 날은 일정이 없어요.</p>') +
      "</section></div>";
  }

  /* ---------------- 공지사항 ---------------- */
  function pageNotices(r) {
    const list = D.notices.slice().sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date));
    if (r.parts[1]) {
      const n = D.notices.find((x) => x.id === r.parts[1]);
      if (!n) return notFound();
      if (isUnread(n)) { P.readNotices = P.readNotices || {}; P.readNotices[n.id] = Date.now(); saveProgress(); setTimeout(() => renderSidebar(route()), 0); }
      return '<div class="page">' + pageHead("공지사항", "", crumb([["공지사항", "#/notices"], ["상세"]])) +
        '<article class="card article">' + (n.pinned ? '<span class="badge badge-ink" style="margin-bottom:10px">필독</span>' : "") + "<h2>" + esc(n.title) + '</h2><div class="meta">' + esc(D.brand.instructor) + " · " + fmtFull(n.date) + "</div>" + noticeBody(n) + "</article>" +
        '<div style="margin-top:14px"><a class="btn btn-secondary" href="#/notices">' + icon("chevLeft", "sm") + "목록으로</a></div></div>";
    }
    return '<div class="page">' + pageHead("공지사항", D.brand.instructor + "이 전하는 안내와 소식입니다.") +
      '<section class="card">' + (list.length ? list.map((n) =>
        '<a class="notice-row" href="#/notices/' + n.id + '">' + (n.pinned ? '<span class="badge badge-ink">' + icon("pin", "xs") + "필독</span>" : '<span class="badge badge-neutral">공지</span>') +
        '<span class="lr-title">' + esc(n.title) + "</span>" + ((n.images || []).length ? '<span class="n-ic" title="사진 ' + n.images.length + '장">' + icon("image", "xs") + "</span>" : "") + (DB.youtubeId(n.youtubeId) ? '<span class="n-ic" title="영상">' + icon("play", "xs") + "</span>" : "") + newBadge(n) + '<span class="lr-date">' + fmtFull(n.date) + "</span></a>").join("") : empty("megaphone", "아직 공지가 없어요.")) + "</section>" +
      (unreadNotices() ? '<div style="margin-top:12px;text-align:right"><button class="link-btn" data-action="read-all">모두 읽음으로 표시</button></div>' : "") + "</div>";
  }

  // 공지 본문: 글 → (본문에 [사진1] 자리가 있으면 그 자리에) 사진 → 유튜브 영상
  function noticeBody(n) {
    const imgs = n.images || [], used = {};
    const fig = (im) => '<figure class="n-img"><img src="' + esc(im.data || im.url) + '" alt="' + esc(im.name || "") + '" loading="lazy"></figure>';
    const body = DB.rich(n.body, { token: (i) => { const im = imgs[i - 1]; if (!im) return ""; used[i - 1] = true; return fig(im); } });
    const rest = imgs.filter((_, i) => !used[i]);
    const yid = DB.youtubeId(n.youtubeId);
    return '<div class="body">' + body + (rest.length ? '<div class="n-imgs">' + rest.map(fig).join("") + "</div>" : "") + (yid ? '<div class="n-video">' + video({ title: n.title, youtubeId: yid }) + "</div>" : "") + "</div>";
  }

  /* ---------------- Q&A ---------------- */
  // 자주 묻는 질문(분류·검색) + 요청사항(프로그램 오류·불편 신고 게시판, 모두 비공개, 사진 첨부)
  let faqCat = "전체";
  let reqDraft = [];
  const qnaTabs = (on) => '<div class="utabs" role="tablist">' +
    '<a role="tab" href="#/qna" class="' + (on === "faq" ? "on" : "") + '" aria-selected="' + (on === "faq") + '">자주 묻는 질문</a>' +
    '<a role="tab" href="#/qna/requests" class="' + (on === "req" ? "on" : "") + '" aria-selected="' + (on === "req") + '">요청사항</a></div>';
  function pageQna(r) {
    if (r.params.get("tab") === "request") { history.replaceState(null, "", "#/qna/requests"); r = route(); }
    const sub = r.parts[1];
    if (sub === "requests") {
      const id = r.parts[2];
      if (id === "new") return pageRequestNew();
      if (id) return pageRequestDetail(id);
      return pageRequests();
    }
    const cats = ["전체"].concat(D.faqs.map((f) => f.category || "기타").filter((c, i, a) => a.indexOf(c) === i));
    if (cats.indexOf(faqCat) === -1) faqCat = "전체";
    return '<div class="page">' + pageHead("Q&A", "자주 묻는 질문을 확인하거나, 프로그램이 이상할 때 요청사항을 남겨 주세요.") + qnaTabs("faq") +
      '<section class="card"><div class="search">' + icon("search") + '<input class="input" id="faq-search" type="search" placeholder="궁금한 내용을 검색해 보세요 (예: 통관, 마진, 로그인)" aria-label="자주 묻는 질문 검색"></div>' +
        '<div class="faq-cats" role="tablist">' + cats.map((c) => '<button type="button" class="chip' + (c === faqCat ? " on" : "") + '" data-action="faq-cat" data-cat="' + esc(c) + '">' + esc(c) + ' <span>' + (c === "전체" ? D.faqs.length : D.faqs.filter((f) => (f.category || "기타") === c).length) + "</span></button>").join("") + "</div>" +
        '<div id="faq-list">' + faqList("") + "</div></section>" +
      '<p class="tiny" style="margin-top:12px">찾는 답이 없으면 ' + esc(D.brand.botName) + "에게 물어보거나 라이브 Q&A 시간에 질문해 주세요.</p></div>";
  }
  function faqList(q) {
    const t = q.trim().toLowerCase();
    const list = D.faqs.filter((f) => (faqCat === "전체" || (f.category || "기타") === faqCat) && (!t || (f.q + f.a + (f.tags || []).join(" ")).toLowerCase().indexOf(t) !== -1));
    if (!list.length) return '<div class="empty">' + icon("search") + '<div>검색 결과가 없어요.</div></div>';
    return list.map((f) => '<details class="faq"><summary><span class="q">Q</span><span><small class="faq-cat">' + esc(f.category || "기타") + "</small>" + esc(f.q) + "</span>" + icon("chevDown", "sm chev") + '</summary><div class="a">' + esc(f.a) + "</div></details>").join("");
  }
  const myRequests = () => DB.requests(INS.id, preview ? me : null);
  function pageRequests() {
    const list = myRequests();
    return '<div class="page">' + pageHead("Q&A", "프로그램 오류나 불편한 점을 남겨 주시면 강사님이 확인 후 해결해 드려요.") + qnaTabs("req") +
      '<div class="req-bar"><span class="muted">총 <b>' + list.length + '</b>건의 요청사항</span><a class="btn btn-primary" href="#/qna/requests/new">' + icon("pen", "sm") + "문의하기</a></div>" +
      '<div class="callout callout-ok req-note">' + icon("lock", "sm") + "<div>모든 요청사항은 <b>비공개</b>예요. 내용은 작성자와 강사님만 볼 수 있어요. 수업 내용 질문은 라이브 Q&A나 AI봇을 이용해 주세요.</div></div>" +
      '<section class="card req-card">' + (list.length
        ? '<table class="req-table"><thead><tr><th class="c-no">번호</th><th class="c-st">상태</th><th>제목</th><th class="c-au">작성자</th><th class="c-dt">작성일</th><th class="c-an">답변</th></tr></thead><tbody>' +
          list.map((x) => {
            const mine = x.s.id === me.id;
            return '<tr class="' + (mine ? "mine" : "") + '" data-action="req-open" data-id="' + esc(x.q.id) + '" data-mine="' + (mine ? 1 : 0) + '" tabindex="0">' +
              '<td class="c-no num">' + x.no + '</td><td class="c-st">' + (x.q.answer ? '<span class="badge badge-positive">답변완료</span>' : '<span class="badge badge-neutral">답변대기</span>') + "</td>" +
              '<td class="c-title">' + (mine ? '<b>' + esc(x.q.title) + "</b>" + ((x.q.images || []).length ? icon("paperclip", "xs") : "") + '<span class="badge badge-ink mine-tag">내 글</span>' : '<span class="locked">' + icon("lock", "xs") + "(비공개)</span>") + (x.q.answer ? '<span class="re">RE</span>' : "") + "</td>" +
              '<td class="c-au">' + esc(mine ? me.name : DB.maskName(x.s.name)) + '</td><td class="c-dt num">' + DB.date.toStr(new Date(x.q.at)) + '</td><td class="c-an num">' + (x.q.answer ? "1" : "—") + "</td></tr>";
          }).join("") + "</tbody></table>"
        : empty("message", "아직 요청사항이 없어요.")) + "</section></div>";
  }
  function pageRequestNew() {
    return '<div class="page">' + pageHead("Q&A", "프로그램 오류나 불편한 점을 남겨 주시면 강사님이 확인 후 해결해 드려요.") + qnaTabs("req") +
      '<a class="back-link" href="#/qna/requests">' + icon("arrowLeft", "sm") + "요청사항 목록</a>" +
      '<section class="card"><h2 class="card-title">문의하기</h2><p class="tiny" style="margin:0 0 18px">어떤 화면에서 무엇을 눌렀을 때 어떤 문제가 생겼는지 적고, 스크린샷을 함께 올려 주시면 더 빨리 고칠 수 있어요.</p>' +
        '<form id="request-form" class="stack" novalidate>' +
          '<div class="field"><span class="field-label">분류</span><div class="req-cats">' + DB.REQUEST_CATEGORIES.map((c, i) => '<label class="chip-radio"><input type="radio" name="category" value="' + esc(c) + '"' + (i === 0 ? " checked" : "") + "><span>" + esc(c) + "</span></label>").join("") + "</div></div>" +
          '<div class="field"><label for="q-title">제목</label><input class="input" id="q-title" name="title" maxlength="80" placeholder="예: 과제 사진을 올려도 제출 버튼이 안 눌려요"></div>' +
          '<div class="field"><label for="q-body">내용</label><textarea class="textarea" id="q-body" name="body" rows="7" placeholder="1. 어느 화면에서 (예: 과제 제출하기 > 1주차 > 사업자등록증 발급)\n2. 무엇을 했을 때 (예: 사진을 고르고 제출 버튼을 눌렀을 때)\n3. 어떤 문제가 (예: 아무 반응이 없어요)\n4. 사용 기기 (예: 아이폰 사파리)"></textarea></div>' +
          '<div class="field"><span class="field-label">스크린샷 첨부 <span class="tiny">(최대 3장)</span></span>' +
            '<label class="dropzone small" id="req-drop"><input type="file" id="req-file" accept="image/*" multiple class="sr-only">' + icon("image") + "<strong>스크린샷을 끌어다 놓거나 눌러서 선택</strong><span class=\"tiny\">휴대폰은 화면을 캡처한 뒤 사진 앨범에서 고르면 돼요</span></label>" +
            '<div class="thumbs" id="req-thumbs">' + reqThumbs() + "</div></div>" +
          '<div class="callout callout-ok">' + icon("lock", "sm") + "<div>비공개로 등록돼요. 작성자와 강사님만 볼 수 있어요.</div></div>" +
          '<div class="req-actions"><a class="btn btn-secondary" href="#/qna/requests">취소</a><button class="btn btn-primary" type="submit">' + icon("send", "sm") + "등록하기</button></div>" +
        "</form></section></div>";
  }
  function reqThumbs() {
    return reqDraft.map((f, i) => '<div class="thumb"><img src="' + f.data + '" alt="' + esc(f.name) + '"><button type="button" data-action="req-remove" data-i="' + i + '" aria-label="삭제">' + icon("x", "xs") + "</button></div>").join("");
  }
  function addReqFiles(files) {
    Array.from(files || []).forEach((file) => {
      if (reqDraft.length >= 3) { toast("스크린샷은 최대 3장까지 올릴 수 있어요.", "warn"); return; }
      if (!/^image\//.test(file.type)) { toast("사진 파일만 올릴 수 있어요.", "warn"); return; }
      compressImage(file, 1200, (data) => { if (reqDraft.length < 3) reqDraft.push({ name: file.name, data }); const t = document.getElementById("req-thumbs"); if (t) t.innerHTML = reqThumbs(); });
    });
  }
  function pageRequestDetail(id) {
    const x = myRequests().find((r) => r.q.id === id);
    if (!x || x.s.id !== me.id) {
      return '<div class="page">' + pageHead("Q&A", "") + qnaTabs("req") + '<section class="card empty">' + icon("lock") + '<p style="font-size:18px;font-weight:800;color:var(--ink);margin:0 0 6px">비공개 글이에요</p><p style="margin:0 0 18px">요청사항은 작성자와 강사님만 볼 수 있어요.</p><a class="btn btn-primary" href="#/qna/requests">목록으로</a></section></div>';
    }
    const q = x.q;
    const d = new Date(q.at);
    return '<div class="page">' + pageHead("Q&A", "요청사항 내용을 확인하고, 강사님 답변을 받아 보세요.") + qnaTabs("req") +
      '<a class="back-link" href="#/qna/requests">' + icon("arrowLeft", "sm") + "요청사항 목록</a>" +
      '<article class="card req-detail"><div class="req-detail-top">' + (q.answer ? '<span class="badge badge-positive">답변완료</span>' : '<span class="badge badge-neutral">답변대기</span>') + '<span class="badge badge-neutral">' + esc(q.category || "기타") + '</span><span class="badge badge-neutral">' + icon("lock", "xs") + "비공개</span><span class=\"req-no\">#" + x.no + "</span></div>" +
        "<h2>" + esc(q.title) + '</h2><div class="meta">' + esc(me.name) + " · " + DB.date.toStr(d) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") + "</div>" +
        '<div class="body">' + esc(q.body) + "</div>" +
        ((q.images || []).length ? '<div class="req-shots">' + q.images.map((im) => '<a href="' + im.data + '" target="_blank" rel="noopener"><img src="' + im.data + '" alt="' + esc(im.name) + '"></a>').join("") + "</div>" : "") +
      "</article>" +
      '<div class="section-head"><h2>강사 답변</h2></div>' +
      (q.answer
        ? '<section class="card req-answer"><div class="req-answer-top"><b>' + esc(D.brand.instructor) + " · 운영자</b><span>" + (q.answeredAt ? DB.date.toStr(new Date(q.answeredAt)) + " " + String(new Date(q.answeredAt).getHours()).padStart(2, "0") + ":" + String(new Date(q.answeredAt).getMinutes()).padStart(2, "0") : "") + '</span></div><div class="body">' + esc(q.answer) + "</div></section>"
        : '<section class="card empty">' + icon("clock") + "<div>강사님이 확인하고 있어요. 답변이 달리면 여기에 바로 보여요.</div></section>") +
      "</div>";
  }

  /* ---------------- 서류 준비 가이드 ---------------- */
  function pageDocs() {
    const G = D.docsGuide;
    const done = G.filter((g) => P.docs[g.id]).length;
    const pct = G.length ? Math.round((done / G.length) * 100) : 0;
    return '<div class="page">' + pageHead("서류 준비 가이드", "판매를 시작하기 전에 필요한 서류를 순서대로 준비하세요.") +
      (G.length ? '<section class="card overall"><div class="overall-top"><span>서류 준비</span>' + pctText(pct) + "</div>" + progressBar(pct) + '<span class="tiny" style="color:var(--body)">' + G.length + "단계 중 " + done + "단계 완료</span></section>" +
      '<div class="callout callout-warn" style="margin-top:14px">' + icon("alert") + "<div>기관 이름·수수료·처리 기간은 바뀔 수 있어요. 신청 전에 각 기관 안내를 꼭 한 번 더 확인해 주세요.</div></div>" +
      '<div class="stack" style="margin-top:14px">' + G.map((g, i) => {
        const ok = !!P.docs[g.id];
        return '<section class="card guide-step' + (ok ? " done" : "") + '"><span class="guide-num">' + (ok ? icon("check") : i + 1) + "</span><div>" +
          "<h3>" + esc(g.title) + (ok ? ' <span class="badge badge-positive">준비 완료</span>' : "") + "</h3>" +
          '<div class="guide-facts">' + (g.where ? "<span>" + icon("mapPin", "sm") + esc(g.where) + "</span>" : "") + (g.time ? "<span>" + icon("clock", "sm") + esc(g.time) + "</span>" : "") + (g.cost ? "<span>" + icon("coins", "sm") + esc(g.cost) + "</span>" : "") + "</div>" +
          '<div class="guide-cols"><div class="guide-box"><h4>필요 서류</h4><ul>' + (g.docs || []).map((d) => "<li>" + esc(d) + "</li>").join("") + '</ul></div><div class="guide-box"><h4>' + esc(D.brand.instructor) + " 팁</h4><ul>" + (g.tips || []).map((d) => "<li>" + esc(d) + "</li>").join("") + "</ul></div></div>" +
          '<div class="guide-actions">' + (g.url ? '<a class="btn btn-tertiary btn-sm" href="' + esc(g.url) + '" target="_blank" rel="noopener">' + esc((g.where || "사이트").split(" · ")[0]) + " 바로가기 " + icon("arrowUpRight", "xs") + "</a>" : "") +
          '<button class="btn btn-sm ' + (ok ? "btn-secondary" : "btn-primary") + '" data-action="toggle-doc" data-id="' + g.id + '">' + icon("check", "sm") + (ok ? "완료 취소" : "준비 완료로 표시") + "</button></div>" +
        "</div></section>";
      }).join("") + "</div>" : '<section class="card">' + empty("clipboard", "서류 가이드를 준비하고 있어요.") + "</section>") + "</div>";
  }

  /* ---------------- AI 봇 ---------------- */
  // 강의 데이터(FAQ·서류 가이드·과제·일정)를 찾아서 답하는 규칙형 봇. 서버가 붙으면 askBot() 안쪽만 LLM 호출로 바꾸면 된다.
  const BOT_CHIPS = ["다음 라이브 언제예요?", "내 진행률 알려줘", "이번 주 과제 마감 언제예요?", "수료 조건이 뭐예요?", "마진 계산은 어떻게 해요?"];
  const botGreeting = () => ({ from: "bot", text: "안녕하세요! 24시간 언제든 물어보세요. " + D.brand.instructor + "의 노하우를 그대로 담은 " + D.brand.botName.replace(/^24시\s*/, "") + "이 바로 답변해 드릴게요." });
  function grams(s) {
    const t = s.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
    const out = new Set();
    for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
    return out;
  }
  function similarity(a, b) {
    const A = grams(a), B = grams(b);
    if (!A.size || !B.size) return 0;
    let n = 0;
    A.forEach((g) => { if (B.has(g)) n++; });
    return n / Math.min(A.size, B.size + 4);
  }
  function askBot(q) {
    const t = q.replace(/\s+/g, " ").trim();
    const today = todayStr();
    if (/^(안녕|hi|hello|하이|ㅎㅇ)/i.test(t)) return { text: me.name + "님 안녕하세요! 과제, 서류, 일정 무엇이든 물어보세요." };
    if (/(마감|언제까지)/.test(t)) {
      const w = D.weeks.find((x) => isOpen(x) && deadlineOf(x) >= today) || D.weeks.find((x) => !isOpen(x));
      return w ? { text: w.no + "주차 과제 마감은 " + fmtMD(deadlineOf(w)) + "입니다. 마감이 지나도 제출은 할 수 있지만 수료 전까지 필수 과제를 모두 통과해야 해요.", links: [[w.no + "주차 과제", "#/missions/" + w.no]] } : { text: "모든 주차의 마감이 지났어요. 남은 필수 과제를 확인해 보세요.", links: [["수료증", "#/certificate"]] };
    }
    if (/(라이브|강의\s*일정|다음\s*강의|언제.*(강의|라이브)|일정)/.test(t)) {
      const n = myEvents().find((e) => e.date >= today && e.type !== "deadline");
      return n ? { text: "다음 일정은 " + fmtMD(n.date) + (n.time ? " " + n.time : "") + " ‘" + n.title + "’ 입니다.\n지난 라이브 다시보기는 커리큘럼 메뉴에 올라가요.", links: [["강의 일정 보기", "#/schedule"]] }
        : { text: "예정된 일정이 없어요. 공지사항을 확인해 주세요.", links: [["공지사항", "#/notices"]] };
    }
    if (/(진행률|진도|몇\s*개|얼마나\s*했|남은\s*과제)/.test(t)) {
      const o = overallStats(), nm = nextMissionOverall();
      return { text: me.name + "님은 전체 " + o.total + "개 과제 중 " + o.done + "개를 마쳤어요. (" + o.pct + "%)\n필수 과제는 " + o.reqTotal + "개 중 " + o.reqDone + "개 통과했어요." + (nm ? "\n다음으로 할 과제는 ‘" + nm.title + "’ 입니다." : ""),
        links: nm ? [["바로 하러 가기", "#/missions/" + nm.weekNo + "/" + nm.id]] : [["과제 보기", "#/missions"]] };
    }
    if (/수료/.test(t)) {
      const o = overallStats();
      return { text: "필수 과제 " + o.reqTotal + "개를 모두 통과하면 수료증이 발급돼요. 지금 " + o.reqDone + "개 통과, " + (o.reqTotal - o.reqDone) + "개 남았어요.", links: [["수료증 보기", "#/certificate"]] };
    }
    if (/(마진|계산기|순이익|판매가)/.test(t) && DB.libOn(INS.id, "file") && D.resources.file.some((x) => x.tool === "calculator")) {
      return { text: "자료실 ‘자료 파일’의 마진 계산기에 현지가·환율·배송비·수수료·광고비를 넣으면 순이익과 마진율이 바로 나와요. 판매가 기준 순이익 20~30%를 목표로 잡아 보세요.", links: [["마진 계산기 열기", "#/library/file?tool=calculator"]] };
    }
    const cands = [];
    D.faqs.forEach((f) => {
      let s = similarity(t, f.q) * 2;
      (f.tags || []).forEach((tag) => { if (tag && t.indexOf(tag) !== -1) s += 1.2; });
      cands.push({ s, text: f.a, links: [["Q&A 더 보기", "#/qna"]] });
    });
    D.docsGuide.forEach((g) => {
      let s = similarity(t, g.title) * 2.2;
      if (t.replace(/\s/g, "").indexOf(g.title.replace(/\s/g, "")) !== -1) s += 2;
      cands.push({ s, text: "‘" + g.title + "’은(는) " + (g.where || "") + "에서 진행해요." + (g.time ? " (소요 " + g.time + (g.cost ? ", 비용 " + g.cost : "") + ")" : "") + "\n필요 서류: " + (g.docs || []).join(", ") + ((g.tips || []).length ? "\n팁: " + g.tips.join(" / ") : ""), links: [["서류 준비 가이드", "#/docs"]] });
    });
    allMissions().forEach((m) => {
      cands.push({ s: similarity(t, m.title) * 1.8, text: "‘" + m.title + "’ 과제는 이렇게 하면 돼요.\n" + (m.steps || []).map((x, i) => (i + 1) + ". " + x).join("\n"), links: [[m.weekNo + "주차 과제로 이동", "#/missions/" + m.weekNo + "/" + m.id]] });
    });
    cands.sort((a, b) => b.s - a.s);
    if (cands[0] && cands[0].s >= 0.9) return cands[0];
    if (/(오류|버그|안\s*눌|안\s*돼|안\s*되|깨져|멈춰|에러|고장)/.test(t)) return { text: "프로그램이 이상하게 동작하나요? Q&A ‘요청사항’에 어떤 화면에서 무엇을 눌렀는지 적고 스크린샷을 올려 주시면 강사님이 확인 후 고쳐 드려요.", links: [["오류 신고하기", "#/qna/requests/new"]] };
    return { text: "그 부분은 제가 정확히 답하기 어려워요. 자주 묻는 질문을 먼저 찾아보시고, 수업 내용은 라이브 Q&A 시간에 " + D.brand.instructor + "께 직접 물어봐 주세요.", links: [["자주 묻는 질문", "#/qna"], ["강의 일정", "#/schedule"]] };
  }
  // 꺼진 메뉴로 가는 봇 답변 링크는 숨긴다
  function linkOk(l) {
    const top = String(l[1]).replace(/^#\/?/, "").split(/[/?]/)[0];
    if (top === "library") { const cat = String(l[1]).split("/")[2]; return on("library") && (!cat || DB.libOn(INS.id, cat.split("?")[0])); }
    return !top || top === "home" || !NAV_DEFS.some((n) => n.id === top) || on(top);
  }
  function chatLog() {
    return [botGreeting()].concat(P.chat).map((m) =>
      '<div class="msg' + (m.from === "me" ? " me" : "") + '">' + (m.from === "me" ? "" : '<span class="msg-avatar">' + icon("sparkles", "sm") + "</span>") +
      '<div class="msg-bubble">' + esc(m.text) + (m.links && m.links.filter(linkOk).length ? '<div class="msg-links">' + m.links.filter(linkOk).map((l) => '<a href="' + esc(l[1]) + '">' + esc(l[0]) + "</a>").join("") + "</div>" : "") + "</div></div>").join("") +
      (botThinking ? '<div class="msg"><span class="msg-avatar">' + icon("sparkles", "sm") + '</span><div class="msg-bubble"><span class="typing-dots"><i></i><i></i><i></i></span></div></div>' : "");
  }
  function sendChat(text) {
    text = (text || "").trim();
    if (!text || botThinking) return;
    P.chat.push({ from: "me", text, at: Date.now() });
    if (P.chat.length > 60) P.chat = P.chat.slice(-60);
    botThinking = true;
    saveProgress(); refreshChats();
    setTimeout(() => {
      botThinking = false;
      if (!me) return;
      const a = askBot(text);
      P.chat.push({ from: "bot", text: a.text, links: a.links || [], at: Date.now() });
      saveProgress(); refreshChats();
    }, 550);
  }
  function refreshChats() { document.querySelectorAll("[data-chat-log]").forEach((el) => { el.innerHTML = chatLog(); el.scrollTop = el.scrollHeight; }); }
  const chatForm = (id) => '<form class="chat-form" data-chat-form><input class="input" name="q" id="' + id + '" autocomplete="off" placeholder="메시지 입력" aria-label="메시지 입력"><button class="btn btn-primary" type="submit">전송</button></form>';
  function pageBot() {
    return '<div class="page">' + pageHead(D.brand.botName, D.brand.instructor + "의 강의 내용과 자주 묻는 질문을 바탕으로 24시간 답해 드려요.") +
      '<section class="chat"><div class="chat-log" data-chat-log>' + chatLog() + "</div>" +
        '<div class="chips">' + BOT_CHIPS.map((c) => '<button class="chip" type="button" data-action="chip" data-q="' + esc(c) + '">' + esc(c) + "</button>").join("") + "</div>" + chatForm("chat-input-page") +
      "</section>" +
      '<p class="tiny" style="margin-top:12px">AI봇 답변은 참고용이에요. 사업자·통관 관련 최종 판단은 관할 기관 안내를 따라 주세요. <button class="link-btn" style="font-size:13px" data-action="clear-chat">대화 지우기</button></p></div>';
  }
  function renderBotFab(r) {
    const el = document.getElementById("bot-fab");
    if (!el) return;
    if (r.parts[0] === "bot" || !on("bot")) { el.innerHTML = ""; return; }
    if (!botOpen) {
      el.innerHTML = '<button class="bot-launch" type="button" data-action="bot-open"><span class="msg-avatar">' + icon("sparkles", "sm") + "</span><span>" + esc(D.brand.botName) + "</span></button>";
      return;
    }
    el.innerHTML = '<section class="bot-panel" aria-label="' + esc(D.brand.botName) + '"><div class="bot-panel-head"><span class="msg-avatar">' + icon("sparkles", "sm") + "</span><strong>" + esc(D.brand.botName) + "</strong>" +
      '<div class="tools"><a href="#/bot" aria-label="크게 보기">' + icon("arrowUpRight", "sm") + '</a><button type="button" data-action="bot-close" aria-label="닫기">' + icon("x", "sm") + "</button></div></div>" +
      '<div class="chat-log" data-chat-log>' + chatLog() + "</div>" + chatForm("chat-input-fab") + "</section>";
    const log = el.querySelector("[data-chat-log]");
    log.scrollTop = log.scrollHeight;
  }

  /* ---------------- 자료실 ---------------- */
  function pageLibrary(r) {
    const cat = r.parts[1];
    const warn = '<div class="callout callout-neg">' + icon("shield") + "<div>본 자료는 <b>유료 수강생 전용</b>입니다. 무단 다운로드·복사·캡처 배포 시 추적·법적 책임이 따릅니다.</div></div>";
    if (!cat) {
      return '<div class="page">' + pageHead("유료강의 자료실", "분류를 선택해서 자료를 확인하세요.") + warn +
        '<div class="grid-2" style="margin-top:14px">' + libList().map((c) =>
          '<a class="res-card" href="#/library/' + c.id + '"><div class="res-top"><span class="res-icon ' + c.cls + '">' + icon(c.icon) + '</span><div><div class="res-title">' + esc(c.label) + '</div><div class="tiny">자료 ' + D.resources[c.id].length + "개</div></div></div>" +
          '<div class="res-desc">' + esc(c.desc()) + '</div><div class="res-foot"><span class="link-btn">열기 ' + icon("arrowRight", "sm") + "</span></div></a>").join("") + "</div></div>";
    }
    const c = libList().find((x) => x.id === cat);
    if (!c) return notFound();
    const items = D.resources[cat];
    const isVideo = cat === "vod" || cat === "senior";
    const showCalc = r.params.get("tool") === "calculator";
    let body;
    if (!items.length) body = '<section class="card">' + empty(c.icon, "자료를 준비하고 있어요.") + "</section>";
    else if (isVideo) {
      body = '<div class="mv-grid">' + items.map((it) =>
        '<button type="button" class="mv-card" data-action="play" data-cat="' + cat + '" data-id="' + it.id + '">' + thumb(it) + '<span class="mv-title">' + esc(it.title) + '</span><span class="tiny">' + esc([it.meta, it.desc].filter(Boolean).join(" · ")) + "</span>" +
        ((it.attachments || []).length ? '<span class="badge badge-positive att-count">' + icon("paperclip", "xs") + "첨부 " + it.attachments.length + "개</span>" : "") + "</button>").join("") + "</div>";
    } else {
      body = items.map((it) => {
        const action = it.tool === "calculator"
          ? '<a class="btn btn-primary btn-sm" href="#/library/file?tool=calculator">' + icon("calculator", "sm") + "계산기 열기</a>"
          : it.url ? '<a class="btn btn-tertiary btn-sm" href="' + esc(it.url) + '" target="_blank" rel="noopener">' + icon(cat === "ebook" ? "book" : "download", "sm") + (cat === "ebook" ? "열람" : "다운로드") + "</a>"
          : '<button class="btn btn-secondary btn-sm" data-action="not-ready">준비 중</button>';
        return '<div class="res-item"><span class="res-icon ' + c.cls + '">' + icon(it.tool ? "calculator" : c.icon) + '</span><div style="min-width:0"><div class="m-title">' + esc(it.title) + '</div><div class="m-desc">' + esc([it.meta, it.desc].filter(Boolean).join(" · ")) + "</div></div>" + action + "</div>";
      }).join("");
    }
    return '<div class="page">' + pageHead(c.label, c.desc(), crumb([["유료강의 자료실", "#/library"], [c.label]])) + warn +
      (showCalc ? '<div style="margin-top:14px">' + calculator() + "</div>" : "") + '<div style="margin-top:14px">' + body + "</div></div>";
  }
  function calculator() {
    const f = (id, label, val, suffix) => '<div class="field"><label for="' + id + '">' + label + '</label><div class="input-wrap"><input class="input" id="' + id + '" data-calc type="number" inputmode="decimal" step="any" min="0" value="' + val + '"><span class="input-addon" style="pointer-events:none">' + suffix + "</span></div></div>";
    return '<section class="card" id="calc"><div class="home-video-head"><h2>' + icon("calculator") + '마진 계산기</h2><span class="tiny">숫자를 바꾸면 바로 계산돼요</span></div>' +
      '<div class="calc">' + f("c-nzd", "현지 상품가", 39.9, "NZD") + f("c-rate", "환율 (1 NZD)", 820, "원") + f("c-ship", "배송대행비", 12000, "원") + f("c-price", "판매가", 74000, "원") + f("c-fee", "판매 수수료", 11, "%") + f("c-ad", "광고비 (판매가 대비)", 8, "%") + "</div>" +
      '<div class="calc-out" id="calc-out"></div></section>';
  }
  function updateCalc() {
    const out = document.getElementById("calc-out");
    if (!out) return;
    const v = (id) => parseFloat(document.getElementById(id).value) || 0;
    const cost = v("c-nzd") * v("c-rate") + v("c-ship");
    const price = v("c-price");
    const fees = price * (v("c-fee") + v("c-ad")) / 100;
    const profit = price - cost - fees;
    const margin = price ? (profit / price) * 100 : 0;
    out.innerHTML = '<div><span class="stat-label">원가 (상품+배송)</span><div class="stat-value" style="font-size:22px">' + won(cost) + "</div></div>" +
      '<div><span class="stat-label">수수료 + 광고비</span><div class="stat-value" style="font-size:22px">' + won(fees) + "</div></div>" +
      '<div class="hl"><span class="stat-label" style="color:#b8bdb2">순이익 · 마진율</span><div class="stat-value" style="font-size:22px">' + won(profit) + " · " + margin.toFixed(1) + "%</div></div>";
  }

  /* ---------------- 동기부여 ---------------- */
  function pageMotivation() {
    const quote = D.quotes.length ? D.quotes[parseDate(todayStr()).getDate() % D.quotes.length] : "";
    const [first, ...rest] = D.motivation;
    return '<div class="page">' + pageHead("동기부여", "지칠 때 꺼내 보는 영상과 한마디. 먼저 해낸 사람들의 이야기를 들어 보세요.") +
      (quote ? '<div class="quote">“' + esc(quote) + "”<small>— " + esc(D.brand.instructor) + "</small></div>" : "") +
      (first ? '<div class="section-head"><h2>오늘의 영상</h2>' + (D.brand.youtubeChannel ? '<a class="link-btn" href="' + esc(D.brand.youtubeChannel) + '" target="_blank" rel="noopener">유튜브 채널 ' + icon("arrowUpRight", "sm") + "</a>" : "") + "</div>" +
        '<section class="card">' + video(first) + '<p style="margin:14px 0 0;font-weight:700">' + esc(first.title) + "</p></section>" : '<section class="card" style="margin-top:14px">' + empty("flame", "동기부여 영상을 준비하고 있어요.") + "</section>") +
      (rest.length ? '<div class="section-head"><h2>지난 영상</h2></div><div class="mv-grid">' + rest.map((it) => '<button type="button" class="mv-card" data-action="play" data-cat="motivation" data-id="' + it.id + '">' + thumb(it) + '<span class="mv-title">' + esc(it.title) + '</span><span class="tiny">' + esc([it.minutes, it.date ? fmtMD(it.date) : ""].filter(Boolean).join(" · ")) + "</span></button>").join("") + "</div>" : "") + "</div>";
  }

  /* ---------------- 수료증 ---------------- */
  function pageCertificate() {
    const o = overallStats();
    const unlocked = o.reqTotal > 0 && o.reqDone === o.reqTotal;
    const remaining = allMissions().filter((m) => m.required && !isDone(m.id));
    let doneDate = todayStr();
    if (unlocked) {
      const ts = Math.max.apply(null, allMissions().filter((m) => m.required).map((m) => { const s = lastSub(m.id); return s ? s.at : 0; }));
      if (ts) doneDate = DB.date.toStr(new Date(ts));
    }
    const pct = o.reqTotal ? Math.round((o.reqDone / o.reqTotal) * 100) : 0;
    const canPrint = window.self === window.top;
    return '<div class="page">' + pageHead("수료증", "필수 과제 " + o.reqTotal + "개를 모두 통과하면 수료증이 발급됩니다.") +
      '<section class="card overall no-print"><div class="overall-top"><span>필수 과제 통과</span>' + pctText(pct) + "</div>" + progressBar(pct) + '<span class="tiny" style="color:var(--body)">' + o.reqTotal + "개 중 " + o.reqDone + "개 통과" + (unlocked ? " · 수료 조건을 모두 채웠어요!" : " · " + remaining.length + "개 남음") + "</span></section>" +
      '<div class="cert' + (unlocked ? "" : " locked") + '" style="margin-top:14px">' +
        window.logoMark("cert-mark") +
        '<div class="cert-eyebrow">CERTIFICATE OF COMPLETION</div><h2>수 료 증</h2>' +
        '<div class="cert-name"><span>' + esc(me.name) + "</span></div>" +
        "<p>위 사람은 " + esc(D.brand.courseTitle) + " " + esc(CO.name) + " 과정의 필수 과제를 모두 성실히 수행하였기에 이 증서를 드립니다.</p>" +
        '<div class="cert-foot"><span>과정 기간 ' + fmtFull(CO.startDate) + " ~ " + fmtFull(DB.cohortEnd(CO)) + "<br>발급일 " + fmtFull(doneDate) + '</span><span class="cert-sign">' + esc(D.brand.name) + "<strong>" + esc(D.brand.instructor) + "</strong></span></div>" +
        (unlocked ? "" : '<div class="cert-lock">' + icon("lock") + "<strong>필수 과제 " + remaining.length + '개가 남았어요</strong><span class="muted">모두 통과하면 이름이 새겨진 수료증이 열립니다.</span></div>') +
      "</div>" +
      (unlocked
        ? (canPrint ? '<div class="guide-actions no-print" style="justify-content:center;margin-top:16px"><button class="btn btn-primary" data-action="print">' + icon("printer", "sm") + "인쇄 · PDF로 저장</button></div>" : "")
        : '<div class="section-head no-print"><h2>남은 필수 과제</h2></div><section class="card no-print">' + remaining.map((m) => {
            const w = findWeek(m.weekNo);
            return isOpen(w)
              ? '<a class="list-row" href="#/missions/' + m.weekNo + "/" + m.id + '"><span class="badge badge-neutral">' + m.weekNo + '주차</span><span class="lr-title">' + esc(m.title) + "</span>" + stateBadge(m.id) + "</a>"
              : '<div class="list-row" style="opacity:.6"><span class="badge badge-neutral">' + m.weekNo + '주차</span><span class="lr-title">' + esc(m.title) + '</span><span class="lr-date">' + icon("lock", "xs") + " " + fmtMD(openOf(w)) + "</span></div>";
          }).join("") + "</section>") +
      "</div>";
  }

  /* ---------------- 추가 메뉴 (마스터가 만든 자유 페이지) ---------------- */
  function pageCustom(r) {
    const item = DB.menuConfig(INS.id).items.find((x) => x.key === r.parts[1]);
    if (!item) return notFound();
    const pg = D.pages[item.key] || {};
    const has = pg.body || DB.youtubeId(pg.youtubeId) || (pg.attachments || []).length;
    return '<div class="page">' + pageHead(pg.title || item.label || "추가 메뉴", pg.summary || "") +
      '<section class="card custom-page">' + (has
        ? (DB.youtubeId(pg.youtubeId) ? video({ title: pg.title || item.label, youtubeId: pg.youtubeId }) : "") +
          (pg.body ? '<div class="body">' + DB.rich(pg.body) + "</div>" : "") + attachmentList(pg.attachments)
        : empty(item.icon || "file", "내용을 준비하고 있어요.")) +
      "</section></div>";
  }

  /* ---------------- 기타 ---------------- */
  function lockedPage(w, from) {
    const cur = from === "curriculum";
    return '<div class="page">' + pageHead(w.no + "주차 · " + w.title, "", crumb([[cur ? "커리큘럼" : "과제 제출하기", cur ? "#/curriculum" : "#/missions"], [w.no + "주차"]])) +
      '<section class="card empty">' + icon("lock") + '<p style="font-size:18px;font-weight:800;color:var(--ink);margin:0 0 6px">' + fmtMD(openOf(w)) + '에 공개됩니다</p><p style="margin:0 0 20px">' + esc(w.summary) + "</p>" +
      '<a class="btn btn-primary" href="' + (cur ? "#/curriculum" : "#/missions") + '">' + (cur ? "커리큘럼으로" : "주차 목록으로") + "</a></section></div>";
  }
  function notFound() {
    return '<div class="page"><section class="card empty">' + icon("alert") + '<p style="font-size:18px;font-weight:800;color:var(--ink)">페이지를 찾을 수 없어요</p><a class="btn btn-primary" href="#/home">홈으로</a></section></div>';
  }

  /* ---------------- 모달 · 토스트 ---------------- */
  function openModal(title, bodyHtml, actionsHtml, wide) {
    modalRoot.innerHTML = '<div class="modal-backdrop" data-action="modal-close-bg"><div class="modal' + (wide ? " wide" : "") + '" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
      '<div class="modal-head"><h3 id="modal-title">' + esc(title) + '</h3><button class="icon-btn" data-action="modal-close" aria-label="닫기">' + icon("x") + "</button></div>" +
      '<div class="modal-body">' + bodyHtml + "</div>" + (actionsHtml ? '<div class="modal-actions">' + actionsHtml + "</div>" : "") + "</div></div>";
    const f = modalRoot.querySelector("input, select, [data-action=modal-close]");
    if (f) f.focus();
  }
  const closeModal = () => { modalRoot.innerHTML = ""; };
  function toast(msg, kind) {
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = icon(kind === "warn" ? "alert" : "check", "sm") + "<span>" + esc(msg) + "</span>";
    toastRoot.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  }
  const LEGAL = {
    terms: ["이용약관", "본 플랫폼은 강사의 유료 강의 수강생에게 강의 영상, 과제 관리, 학습 자료를 제공합니다.\n\n1. 계정은 수강생 본인만 사용할 수 있으며 타인과 공유할 수 없습니다.\n2. 강의 영상과 자료의 저작권은 강사에게 있으며 무단 복제·배포를 금지합니다.\n3. 수강 기간이 끝난 뒤의 다시보기 기간은 공지사항으로 안내합니다.\n\n정식 약관은 서비스 오픈 시 확정 후 게시됩니다."],
    privacy: ["개인정보처리방침", "수집 항목: 이름, 휴대폰 번호 뒷자리 4자리, 과제 제출 내용\n이용 목적: 수강생 확인, 학습 진행 관리, 수료증 발급\n보관 기간: 수강 종료 후 1년 또는 수강생 요청 시 즉시 파기\n\n현재 체험 버전에서는 모든 기록이 이 기기의 브라우저에만 저장됩니다."],
    oss: ["오픈소스 라이선스", "Pretendard — SIL Open Font License 1.1 (© Kil Hyung-jin)\nInter — SIL Open Font License 1.1 (© The Inter Project Authors)\nLucide Icons — ISC License (© Lucide Contributors)"]
  };
  function openSignup() {
    const ins = loginInstructor();
    const cos = DB.cohortsOf(ins.id).filter((c) => c.recruiting && DB.cohortStatus(c) !== "ended");
    if (!cos.length) {
      openModal("수강 신청", ins.displayName + " 강사님의 지금 모집 중인 기수가 없어요.\n다음 기수 모집이 열리면 다시 신청해 주세요.", '<button class="btn btn-primary" data-action="modal-close">확인</button>');
      return;
    }
    openModal(ins.displayName + " · 수강 신청",
      '<form id="signup-form" class="stack" novalidate style="white-space:normal">' +
        '<p class="tiny" style="margin:0">신청 후 강사님이 승인하면 이름과 전화번호 뒷자리로 로그인할 수 있어요.</p>' +
        '<div class="field"><label for="su-cohort">기수</label><select class="input" id="su-cohort" name="cohort">' + cos.map((c) => '<option value="' + c.id + '">' + esc(c.name) + " · " + fmtMD(c.startDate) + " 시작</option>").join("") + "</select></div>" +
        '<div class="field"><label for="su-name">이름</label><input class="input" id="su-name" name="name" autocomplete="name" placeholder="입금자명과 같게 적어 주세요"></div>' +
        '<div class="field"><label for="su-phone">전화번호 뒷자리</label><input class="input" id="su-phone" name="phone4" inputmode="numeric" maxlength="4" placeholder="숫자 4자리"></div>' +
        '<p class="field-error" id="su-error" role="alert"></p>' +
        '<button class="btn btn-primary btn-block" type="submit">신청하기</button></form>');
  }
  function doSignup(f) {
    const ins = loginInstructor();
    const name = f.name.value.trim(), phone4 = f.phone4.value.trim();
    const err = document.getElementById("su-error");
    if (!name) { err.textContent = "이름을 입력해 주세요."; return; }
    if (!/^\d{4}$/.test(phone4)) { err.textContent = "전화번호 뒷자리 숫자 4자리를 입력해 주세요."; return; }
    const dup = DB.studentsOf(ins.id).find((x) => x.name.replace(/\s+/g, "") === name.replace(/\s+/g, "") && x.phone4 === phone4 && (x.status === "pending" || x.status === "approved"));
    if (dup) { err.textContent = dup.status === "approved" ? "이미 승인된 수강생이에요. 바로 로그인해 주세요." : "이미 신청이 접수돼 있어요. 승인을 기다려 주세요."; return; }
    DB.data.students.push({ id: DB.uid("s"), instructorId: ins.id, cohortId: f.cohort.value, name, phone4, status: "pending", appliedAt: todayStr() });
    DB.save();
    openModal("신청이 접수됐어요", name + "님, " + ins.displayName + " 강사님이 확인 후 승인해 드릴게요.\n승인되면 이름과 전화번호 뒷자리로 로그인할 수 있어요.", '<button class="btn btn-primary" data-action="modal-close">확인</button>');
  }
  function fileSize(n) { return !n ? "" : n < 1024 ? n + "B" : n < 1048576 ? Math.round(n / 1024) + "KB" : (n / 1048576).toFixed(1) + "MB"; }
  function attachmentList(list) {
    if (!list || !list.length) return "";
    return '<div class="att-box"><p class="side-label">첨부 자료 ' + list.length + '개</p><ul class="att-list">' + list.map((f) => {
      const ext = (f.name.split(".").pop() || "").toUpperCase().slice(0, 4);
      const href = f.data || f.url || "#";
      const attrs = f.data ? ' download="' + esc(f.name) + '"' : ' target="_blank" rel="noopener"';
      return '<li><span class="att-ext">' + esc(ext || "파일") + '</span><span class="att-name">' + esc(f.name) + (f.size ? '<small>' + fileSize(f.size) + "</small>" : f.url ? "<small>링크</small>" : "") + "</span>" +
        '<a class="btn btn-tertiary btn-sm" href="' + esc(href) + '"' + attrs + ">" + icon(f.data ? "download" : "arrowUpRight", "sm") + (f.data ? "다운로드" : "열기") + "</a></li>";
    }).join("") + "</ul></div>";
  }
  // 자료실 영상(VOD·시니어 기초 가이드)과 동기부여 영상: 팝업으로 영상 + 제목 + 본문 + 첨부 자료
  function playModal(cat, id) {
    const list = cat === "motivation" ? D.motivation : D.resources[cat];
    const it = list && list.find((x) => x.id === id);
    if (!it) return;
    openModal(it.title,
      '<div class="res-pop">' + video(it) +
        (it.meta || it.desc ? '<p class="res-pop-meta">' + esc([it.meta, it.desc].filter(Boolean).join(" · ")) + "</p>" : "") +
        (it.body ? '<div class="res-pop-body">' + DB.rich(it.body) + "</div>" : "") +
        attachmentList(it.attachments) +
      "</div>", '<button class="btn btn-primary" data-action="modal-close">닫기</button>', true);
  }

  /* ---------------- 렌더 ---------------- */
  function render() {
    closeModal();
    const r = route();
    if (!me) startSession();
    if (!me) {
      // 랜딩페이지에서 넘어온 경우: #/login?ins=강사&signup=1
      const want = r.params.get("ins");
      if (want && DB.activeInstructors().some((x) => x.id === want)) { loginPick = want; DB.session.setInstructorPick(want); }
      const openSign = r.params.get("signup") === "1" && loginInstructor();
      if (r.parts[0] !== "login" || want) history.replaceState(null, "", "#/login");
      renderLogin();
      if (openSign) openSignup();
      return;
    }
    if (r.parts[0] === "login") { history.replaceState(null, "", "#/home"); return render(); }
    window.applyStudentTheme(DB.themeOf(D.brand.theme));
    // 꺼진 메뉴로 들어오면 홈으로
    const top = r.parts[0];
    const allowed = top === "home" || (top === "page" ? DB.menuConfig(INS.id).items.some((x) => x.key === r.parts[1] && x.on) : NAV_DEFS.some((n) => n.id === top) ? on(top) : true);
    if (!allowed) { history.replaceState(null, "", "#/home"); return render(); }
    if (!document.getElementById("app") || root.dataset.who !== me.id) { renderShell(); root.dataset.who = me.id; }
    document.getElementById("app").classList.remove("nav-open");
    renderSidebar(r);
    const pages = { home: pageHome, curriculum: pageCurriculum, missions: pageMissions, schedule: pageSchedule, notices: pageNotices, qna: pageQna, docs: pageDocs, bot: pageBot, library: pageLibrary, motivation: pageMotivation, certificate: pageCertificate, page: pageCustom };
    const fn = pages[r.parts[0]] || notFound;
    const main = document.getElementById("main");
    const prevKey = main.dataset.key, key = location.hash;
    main.innerHTML = fn(r);
    main.dataset.key = key;
    if (prevKey !== key) window.scrollTo(0, 0);
    const nav = NAV().find((n) => n.id === r.parts[0] && (n.id !== "page" || n.sub === r.parts[1]));
    document.title = (nav ? navLabel(nav) + " · " : "") + D.brand.name;
    renderBotFab(r);
    refreshChats();
    if (document.getElementById("calc")) { updateCalc(); if (prevKey !== key) document.getElementById("calc").scrollIntoView({ block: "start" }); }
  }
  /** 강사센터에서 돌아올 때: 세션과 데이터를 새로 읽는다 */
  function mount() {
    me = null; loginPick = null; root.dataset.who = "";
    root.innerHTML = "";
    render();
  }

  /* ---------------- 이벤트 ---------------- */
  document.addEventListener("click", (e) => {
    if (!isActive()) return;
    const a = e.target.closest("[data-action]");
    if (!a) {
      if (e.target.closest(".sidebar a")) { const app = document.getElementById("app"); if (app) app.classList.remove("nav-open"); }
      return;
    }
    switch (a.dataset.action) {
      case "toggle-pw": {
        const inp = document.getElementById(a.dataset.for);
        const show = inp.type === "password";
        inp.type = show ? "text" : "password";
        a.innerHTML = icon(show ? "eyeOff" : "eye", "sm");
        a.setAttribute("aria-label", show ? "번호 숨기기" : "번호 보기");
        break;
      }
      case "pick-instructor": loginPick = a.dataset.id; DB.session.setInstructorPick(loginPick); renderLogin(); { const n = document.getElementById("lg-name"); if (n) n.focus(); } break;
      case "change-instructor": loginPick = null; DB.store.remove("moonclass:instructor"); renderLogin(); break;
      case "signup": openSignup(); break;
      case "forgot":
        openModal("로그인 정보를 잊으셨나요?", "이름은 수강 신청할 때 적은 이름 그대로, 비밀번호 칸에는 휴대폰 번호 뒷자리 4자리를 넣어 주세요.\n\n예) 010-1234-2186 → 2186\n\n수강 신청 후 강사님 승인 전이라면 로그인되지 않아요. 그래도 안 되면 강사님께 이름과 연락처를 보내 주세요.", '<button class="btn btn-primary" data-action="modal-close">확인</button>');
        break;
      case "legal": { const doc = LEGAL[a.dataset.doc]; openModal(doc[0], esc(doc[1]), '<button class="btn btn-primary" data-action="modal-close">확인</button>'); break; }
      case "modal-close": closeModal(); break;
      case "modal-close-bg": if (e.target === a) closeModal(); break;
      case "logout": logout(); break;
      case "exit-preview": if (INS) { loginPick = INS.id; DB.session.setInstructorPick(INS.id); } DB.session.setStudent(null); me = null; location.hash = "#/login"; break;
      case "toggle-nav": document.getElementById("app").classList.toggle("nav-open"); break;
      case "toggle-watched": {
        const id = a.dataset.id;
        if (P.watched[id]) delete P.watched[id]; else P.watched[id] = Date.now();
        saveProgress(); render();
        if (P.watched[id]) toast("시청 완료로 표시했어요.");
        break;
      }
      case "remove-file": draft.files.splice(Number(a.dataset.i), 1); refreshThumbs(); break;
      case "cal-move": { const d = new Date(calCursor.y, calCursor.m + Number(a.dataset.d), 1); calCursor = { y: d.getFullYear(), m: d.getMonth() }; render(); break; }
      case "cal-today": calSel = todayStr(); calCursor = null; render(); break;
      case "cal-pick": {
        calSel = a.dataset.date;
        const d = parseDate(calSel);
        if (d.getMonth() !== calCursor.m) calCursor = { y: d.getFullYear(), m: d.getMonth() };
        render();
        break;
      }
      case "faq-cat": faqCat = a.dataset.cat; render(); break;
      case "req-open":
        if (a.dataset.mine === "1") location.hash = "#/qna/requests/" + a.dataset.id;
        else toast("비공개 글은 작성자와 강사님만 볼 수 있어요.", "warn");
        break;
      case "req-remove": reqDraft.splice(Number(a.dataset.i), 1); { const t = document.getElementById("req-thumbs"); if (t) t.innerHTML = reqThumbs(); } break;
      case "toggle-guide": { const g = a.dataset.id; P.guide = P.guide || {}; if (P.guide[g]) delete P.guide[g]; else P.guide[g] = Date.now(); saveProgress(); render(); if ((D.guide || []).every((x) => P.guide[x.id])) toast("시작 가이드를 모두 마쳤어요! 이제 1주차 과제를 시작해 보세요."); break; }
      case "read-all": P.readNotices = P.readNotices || {}; D.notices.forEach((n) => { P.readNotices[n.id] = Date.now(); }); saveProgress(); render(); break;
      case "toggle-doc": { const s = a.dataset.id; if (P.docs[s]) delete P.docs[s]; else P.docs[s] = Date.now(); saveProgress(); render(); break; }
      case "chip": sendChat(a.dataset.q); break;
      case "ask-bot": botOpen = true; DB.store.set(KEY_BOT, true); renderBotFab(route()); sendChat(a.dataset.q); break;
      case "clear-chat": P.chat = []; saveProgress(); refreshChats(); break;
      case "bot-open": botOpen = true; DB.store.set(KEY_BOT, true); renderBotFab(route()); { const i = document.getElementById("chat-input-fab"); if (i) i.focus(); } break;
      case "bot-close": botOpen = false; DB.store.set(KEY_BOT, false); renderBotFab(route()); break;
      case "not-ready": toast("자료를 준비하고 있어요. 올라오면 공지로 알려 드릴게요."); break;
      case "play": playModal(a.dataset.cat, a.dataset.id); break;
      case "video-play": {
        if (e.target.closest(".vp-ext")) return; // 외부 링크는 그대로 연다
        const box = a.closest(".video");
        box.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + esc(box.dataset.yid) + '?autoplay=1&rel=0" title="영상" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>' +
          '<a class="video-out" href="https://www.youtube.com/watch?v=' + esc(box.dataset.yid) + '" target="_blank" rel="noopener">재생이 안 되면 유튜브에서 보기 ' + icon("arrowUpRight", "xs") + "</a>";
        break;
      }
      case "print": window.print(); break;
    }
  });
  document.addEventListener("submit", (e) => {
    if (!isActive()) return;
    const f = e.target;
    if (f.id === "login-form") { e.preventDefault(); if (f.name) doLogin(f); return; }
    if (f.id === "signup-form") { e.preventDefault(); doSignup(f); return; }
    if (f.id === "submit-form") { e.preventDefault(); submitMission(f); return; }
    if (f.id === "request-form") {
      e.preventDefault();
      const title = f.title.value.trim(), body = f.body.value.trim();
      if (!title || !body) { toast("제목과 내용을 모두 적어 주세요.", "warn"); return; }
      const q = { id: DB.uid("q"), category: f.category.value, title, body, images: reqDraft.slice(), at: Date.now(), answer: "", answeredAt: 0 };
      P.questions.push(q);
      if (!saveProgress()) { P.questions.pop(); return; }
      reqDraft = [];
      location.hash = "#/qna/requests/" + q.id;
      toast("요청사항을 등록했어요. 강사님 답변이 달리면 여기서 확인할 수 있어요.");
      return;
    }
    if (f.hasAttribute("data-chat-form")) { e.preventDefault(); const v = f.q.value; f.q.value = ""; sendChat(v); f.q.focus(); }
  });
  let noteTimer = null;
  document.addEventListener("input", (e) => {
    if (!isActive()) return;
    const t = e.target;
    if (t.id === "lesson-note") {
      clearTimeout(noteTimer);
      const st = document.getElementById("note-state"); if (st) st.textContent = "저장 중…";
      noteTimer = setTimeout(() => { P.notes = P.notes || {}; const v = t.value.trim(); if (v) P.notes[t.dataset.id] = t.value; else delete P.notes[t.dataset.id]; saveProgress(); const s2 = document.getElementById("note-state"); if (s2) s2.textContent = "저장됨"; }, 500);
      return;
    }
    if (t.id === "faq-search") { document.getElementById("faq-list").innerHTML = faqList(t.value); return; }
    if (t.hasAttribute && t.hasAttribute("data-calc")) { updateCalc(); return; }
    if (t.id === "sub-text" && t.dataset.min) {
      const n = t.value.replace(/\s+/g, "").length, min = Number(t.dataset.min);
      const c = document.getElementById("char-count");
      if (c && min) c.textContent = n + " / 최소 " + min + "자";
    }
    if (t.id === "lg-phone" || t.id === "su-phone") t.value = t.value.replace(/\D/g, "").slice(0, 4);
    if (t.id === "lg-name" || t.id === "lg-phone") { const er = document.getElementById("lg-error"); if (er) er.textContent = ""; }
  });
  document.addEventListener("change", (e) => {
    if (!isActive()) return;
    if (e.target.id === "file-input") { addFiles(e.target.files); e.target.value = ""; }
    if (e.target.id === "req-file") { addReqFiles(e.target.files); e.target.value = ""; }
  });
  ["dragover", "dragenter"].forEach((ev) => document.addEventListener(ev, (e) => {
    const z = isActive() && e.target.closest && e.target.closest("#dropzone, #req-drop");
    if (z) { e.preventDefault(); z.classList.add("drag"); }
  }));
  ["dragleave", "drop"].forEach((ev) => document.addEventListener(ev, (e) => {
    const z = isActive() && e.target.closest && e.target.closest("#dropzone, #req-drop");
    if (!z) return;
    e.preventDefault();
    z.classList.remove("drag");
    if (ev === "drop") { if (z.id === "req-drop") addReqFiles(e.dataTransfer.files); else addFiles(e.dataTransfer.files); }
  }));
  document.addEventListener("keydown", (e) => {
    if (!isActive()) return;
    if (e.key === "Enter" && e.target.matches && e.target.matches(".video-ph[role=button], tr[data-action=req-open]")) { e.target.click(); return; }
    if (e.key !== "Escape") return;
    if (modalRoot.innerHTML) closeModal();
    const app = document.getElementById("app");
    if (app) app.classList.remove("nav-open");
  });

  // 썸네일을 못 불러오면(네트워크 차단 등) 이미지를 지우고 기본 카드를 보여 준다
  document.addEventListener("error", (e) => { const t = e.target; if (t && t.tagName === "IMG" && t.closest && t.closest(".lesson-thumb, .video")) t.remove(); }, true);

  window.StudentApp = { render, mount };
})();
