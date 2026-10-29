/* 두잉고 — 수강생 센터
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
  let preview = false, previewBy = "instructor";
  let P = null;         // 내 진행 기록
  let TRACK = "live";   // 두잉고 버전: live(기수 · 주차 · 과제) | vod(DOOGO CLASS에서 VOD를 산 수강생)
  let draft = { missionId: null, files: [] };
  let calCursor = null, calSel = null;
  let loginPick = null; // 로그인 화면에서 고른 강사
  let botOpen = window.matchMedia("(max-width: 720px)").matches ? false : DB.store.get(KEY_BOT, false);
  let botThinking = false;
  let lastTop = null;   // 바로 전 화면의 메뉴 (자료실 안내 팝업용)
  let vodClosed = false; // VOD 수강 기간이 끝나 로그인이 닫혔을 때 로그인 화면에 한 번 안내

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
  // 체험 계정은 모든 주차를 열어 둔다 (강사 미리보기는 실제 수강생과 같은 일정으로)
  const isOpen = (w) => (!!me && !!me.demo && !preview) || todayStr() >= openOf(w);
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
  // 새 답변 · 새 검수 결과 (보면 사라져요)
  const newAnswers = () => (P.questions || []).filter((q) => q.answer && (q.answeredAt || 1) > (q.seenAt || 0)).length;
  const newFixes = () => Object.keys(P.submissions || {}).filter((k) => { const a = P.submissions[k] || [], s = a[a.length - 1]; return s && s.review && s.review.status !== "approved" && (s.review.at || 1) > (s.revSeenAt || 0); }).length;
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
      if (text.indexOf(k) === -1) reasons.push("‘" + k + "’" + (((c) => c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0)(String(k).charCodeAt(String(k).length - 1)) ? "이" : "가") + " 들어가도록 적어 주세요.");
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

  // 기본 이름은 DB.STUDENT_MENUS 에서 (강사가 메뉴 구성에서 바꾼 이름이 있으면 그 이름)
  const DEF_LABEL = (id) => ((TRACK === "vod" ? DB.VOD_MENUS.find((d) => d.key === id) : null) || DB.STUDENT_MENUS.find((d) => d.key === id) || DB.VOD_MENUS.find((d) => d.key === id) || {}).label || "";
  /** 메뉴 구성 ID: VOD 버전이면 "강사ID@vod:상품ID" (VOD마다 두잉고 강의실이 따로) */
  const MID = () => INS.id + (TRACK === "vod" ? "@vod" + (VP ? ":" + VP : "") : "");
  const NAV_DEFS = [
    { id: "home", icon: "home", href: "#/home" },
    { id: "vodclass", icon: "circlePlay", href: "#/vodclass" },
    { id: "curriculum", icon: "book", href: "#/curriculum" },
    { id: "replays", icon: "monitorPlay", href: "#/replays" },
    { id: "missions", icon: "checks", href: "#/missions",
      children: () => D.weeks.map((w) => ({ id: String(w.no), label: w.no + "주차", href: "#/missions/" + w.no, locked: !isOpen(w) })) },
    { id: "showcase", icon: "trophy", href: "#/showcase" },
    { id: "notes", icon: "notebookPen", href: "#/notes" },
    { id: "schedule", icon: "calendar", href: "#/schedule" },
    { id: "notices", icon: "megaphone", href: "#/notices" },
    { id: "qna", icon: "help", href: "#/qna" },
    { id: "docs", icon: "clipboard", href: "#/docs" },
    { id: "glossary", icon: "bookA", href: "#/glossary" },
    { id: "bot", label: () => D.brand.botName, icon: "bot", href: "#/bot" },
    { id: "library", icon: "library", href: "#/library",
      children: () => libList().map((c) => ({ id: c.id, label: c.label, href: "#/library/" + c.id })) },
    { id: "motivation", icon: "flame", href: "#/motivation" },
    { id: "channels", icon: "headset", href: "#/channels" },
    { id: "partners", icon: "handshake", href: "#/partners" },
    { id: "certificate", icon: "award", href: "#/certificate" }
  ];
  NAV_DEFS.forEach((n) => { if (!n.label) n.label = DEF_LABEL(n.id); });
  const LIB = [
    { id: "ebook", label: "전자책 · 가이드북", icon: "book", cls: "ri-1", desc: () => D.brand.instructor + " 전자책과 가이드북을 웹에서 열람" },
    { id: "file", label: "자료 파일", icon: "fileSheet", cls: "ri-2", desc: () => "상품 리스트 · 키워드 · 마진 계산기 등 실전 자료" },
    { id: "vod", label: "이커머스 실전 VOD", icon: "circlePlay", cls: "ri-3", desc: () => "쿠팡 · 네이버 판매, 도매몰 발주 · 대량 발주 강의 영상" },
    { id: "senior", label: "시니어 기초 가이드", icon: "book", cls: "ri-4", desc: () => "처음 시작하시는 분들을 위한 친절한 기초 안내" }
  ];
  const navLabel = (n) => (typeof n.label === "function" ? n.label() : n.label);
  // 마스터가 강사별로 정한 메뉴 구성(켜기·끄기·이름·순서·추가 메뉴)을 따른다
  // 라이브 다시보기 · 모범 과제 · 용어 사전은 강사가 내용을 올렸을 때만 메뉴에 보인다
  const NEEDS = { replays: () => (D.replays || []).length, showcase: () => (D.showcase || []).length, glossary: () => (D.glossary || []).length,
    docs: () => TRACK !== "vod" || (D.docsGuide || []).length, library: () => TRACK !== "vod" || libList().length > 0 };
  // VOD 버전 자료함: 내려받을 수 있는 자료만 (주소가 없는 ‘준비 중’ 자료는 숨김) + 강의마다 올린 수업 자료 모음
  const resOk = (it) => !!(it.url || it.tool || (it.attachments || []).length || (it.images || []).length || it.video || it.youtube || it.body);
  const resOf = (id) => (id === "lesson" ? lessonFiles() : TRACK === "vod" ? (D.resources[id] || []).filter(resOk) : D.resources[id] || []);
  function lessonFiles() {
    if (TRACK !== "vod" || !me || !window.VOD) return [];
    const out = [];
    vodList().forEach((x) => (x.p.curriculum || []).forEach((c) => (c.lessons || []).forEach((l) => (l.files || []).filter((f) => f.url).forEach((f) => out.push({ x, l, f })))));
    return out;
  }
  const LIB_LESSON = { id: "lesson", label: "수업 자료 모음", icon: "paperclip", cls: "ri-2", desc: () => "VOD 강의마다 강사님이 올린 교안 · 실습지를 한곳에 모았어요" };
  const on = (key) => DB.menuOn(MID(), key) && (!NEEDS[key] || !!NEEDS[key]());
  /** 화면 제목 · 경로에 쓰는 메뉴 이름 (강사가 바꾼 이름 우선) */
  const ML = (key) => { const it = DB.menuConfig(MID()).items.find((x) => x.key === key); const d = NAV_DEFS.find((n) => n.id === key); return (it && it.label) || (d ? navLabel(d) : DEF_LABEL(key)); };
  const libList = () => (TRACK === "vod" ? (lessonFiles().length ? [LIB_LESSON] : []).concat(LIB.filter((c) => DB.libOn(MID(), c.id) && resOf(c.id).length)) : LIB.filter((c) => DB.libOn(MID(), c.id)));
  function NAV() {
    return DB.menuConfig(MID()).items.filter((x) => x.on && (!NEEDS[x.key] || NEEDS[x.key]())).map((x) => {
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
  // 상세 화면 아래 이전 · 다음 카드 (+ 목록으로). 한쪽이 없으면 빈 칸으로 자리를 맞춘다 — p · n: { href, label, title } | null
  const pager = (p, n, back) => '<nav class="pager" aria-label="이전 · 다음">' +
      (p ? '<a class="pager-a prev" href="' + esc(p.href) + '"><span class="pager-ic">' + icon("chevLeft", "sm") + '</span><span class="pager-t"><small>' + esc(p.label) + "</small><b>" + esc(p.title) + "</b></span></a>" : '<span class="pager-empty"></span>') +
      (n ? '<a class="pager-a next" href="' + esc(n.href) + '"><span class="pager-t"><small>' + esc(n.label) + "</small><b>" + esc(n.title) + '</b></span><span class="pager-ic">' + icon("chevRight", "sm") + "</span></a>" : '<span class="pager-empty"></span>') +
    "</nav>" + (back ? '<div class="pager-back"><a class="btn btn-secondary" href="' + esc(back) + '">' + icon("menu", "sm") + "목록으로</a></div>" : "");
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
  // 강사를 고르기 전 첫 로그인 화면 — 특정 강사 색이 아니라 두잉고(흰 바탕 + 빨강, 타이탄클래스처럼 깔끔하게)
  function renderPicker(list) {
    document.title = "두잉고 · 수강생 로그인";
    window.applyStudentTheme(null);
    const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.setAttribute("content", "#ffffff");
    const lock = (cls) => (window.doogoClassLock ? window.doogoClassLock(cls) : window.doogoLogo("color"));
    const pts = [["book", "주차별 튜토리얼 · 과제 피드백"], ["award", "진행률 · 수료증"], ["heart", "수료 후에도 평생 이용"]];
    const opt = (x) => {
      const b = (DB.content(x.id) || {}).brand || {};
      const av = b.photo ? '<img src="' + esc(b.photo) + '" alt="" decoding="async">' : esc(x.displayName.slice(0, 1));
      const hay = [x.displayName, b.name, b.field, b.shortTitle, b.courseTitle].filter(Boolean).join(" ");
      return '<button type="button" class="dc-ins" role="radio" aria-checked="false" data-action="pick-instructor" data-id="' + x.id + '" data-q="' + esc(hay) + '">' +
        '<span class="dc-ins-av' + (b.photo ? " has-photo" : "") + '">' + av + '</span><span class="dc-ins-t"><b data-name="' + esc(x.displayName) + '">' + esc(x.displayName) + "</b><small>" + esc(b.field || b.shortTitle || b.courseTitle || "") + "</small></span>" + icon("chevRight", "sm") + "</button>";
    };
    root.innerHTML =
      '<main class="login login-dc">' +
        '<section class="dc-brand">' +
          '<a class="dc-logo" href="#/doinggo" aria-label="두잉고 홈으로 — Doing + GO">' + lock() + '<span class="dc-tag" aria-hidden="true">DOING <b>+</b> GO</span></a>' +
          '<div class="dc-hero">' +
            '<p class="dc-eyebrow"><i></i>DOINGGO · 수강생 로그인</p>' +
            '<h2 class="dc-headline">따라만 하면 완성되는<br><span>튜토리얼 강의 플랫폼</span></h2>' +
            '<p class="dc-sub">내 강사님이 준비해 둔 1주차부터 수료까지의 튜토리얼이 기다리고 있어요. 회원가입 없이, 수강 신청할 때 적은 정보로 들어와요.</p>' +
            '<ul class="dc-pts">' + pts.map((x) => "<li>" + icon(x[0], "sm") + x[1] + "</li>").join("") + "</ul>" +
          "</div>" +
          '<div class="dc-foot"><span>© 2026 DOOGO HOLDINGS</span><a href="#/doinggo">두잉고 소개 ' + icon("arrowRight", "xs") + "</a></div>" +
        "</section>" +
        '<section class="login-panel dc-panel">' +
          '<div class="login-topright"><a class="login-home-big" href="#/doinggo">' + icon("arrowLeft", "sm") + "<span>두잉고 홈페이지 이동하기</span></a><span>강사님이신가요?</span><a class=\"dc-center\" href=\"#/center\">강사센터</a></div>" +
          '<div class="login-stack">' +
            '<div class="login-card dc-card">' + svcTabs("dg") +
              '<div class="dc-card-logo">' + lock() + "</div>" +
              "<h1>두잉고 시작하기</h1>" +
              '<p class="lead">수강 신청할 때 등록한 정보로 로그인하세요.</p>' +
              '<div class="field"><span class="field-label">어떤 강사님의 강의를 듣고 계신가요?</span>' +
                '<label class="dc-search">' + icon("search", "sm") + '<input id="dc-q" type="search" placeholder="강사님 이름이나 강의 분야로 찾기" autocomplete="off" enterkeyhint="search" aria-label="강사님 검색" aria-controls="dc-ins-list">' +
                  '<button type="button" class="dc-q-clear" data-dc-clear aria-label="검색어 지우기">' + icon("x", "xs") + "</button></label>" +
                '<p class="dc-search-meta" id="dc-count" aria-live="polite">함께하는 강사님 <b>' + list.length + "</b>명</p>" +
                '<div class="dc-ins-list" id="dc-ins-list" role="radiogroup">' + list.map(opt).join("") + "</div>" +
                '<div class="dc-empty" id="dc-empty" hidden>' + icon("search") + "<b>찾는 강사님이 없어요</b><span>이름을 다시 확인하거나, 강사님께 받은 수강 안내 링크로 들어와 주세요.</span></div>" +
                '<span class="tiny">한 번 고르면 다음부터는 바로 로그인 화면이 열려요.</span></div>' +
            "</div>" +
            '<a class="dc-partner" href="#/partner">' + icon("handshake", "sm") + "<span><b>강사님이신가요?</b> 두잉고 입점을 문의해 보세요</span>" + icon("arrowRight", "xs") + "</a>" +
            '<nav class="login-legal" aria-label="약관">' +
              '<button type="button" data-action="legal" data-doc="terms">이용약관</button>' +
              '<button type="button" data-action="legal" data-doc="privacy">개인정보처리방침</button>' +
              '<button type="button" data-action="legal" data-doc="oss">오픈소스 라이선스</button>' +
            "</nav>" +
          "</div>" +
        "</section>" +
      "</main>";
    bindInsSearch(list.length);
  }
  // 강사 검색: 이름 · 강의 분야 · 초성(ㅁㄷㅍ)으로 바로 찾기
  const INS_CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  const insCho = (s) => Array.from(s).map((c) => { const k = c.charCodeAt(0) - 44032; return k >= 0 && k < 11172 ? INS_CHO[Math.floor(k / 588)] : c; }).join("");
  const insNorm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");
  function bindInsSearch(total) {
    const q = document.getElementById("dc-q"); if (!q) return;
    const box = q.closest(".dc-search"), items = Array.from(document.querySelectorAll(".dc-ins")), cnt = document.getElementById("dc-count"), empty = document.getElementById("dc-empty");
    const run = () => {
      const v = insNorm(q.value); let n = 0;
      box.classList.toggle("has-q", !!v);
      items.forEach((el) => {
        const hay = insNorm(el.dataset.q), hit = !v || hay.includes(v) || insCho(hay).includes(v);
        el.hidden = !hit; if (hit) n++;
        const nm = el.querySelector("[data-name]"), raw = nm.dataset.name, at = v ? raw.replace(/\s+/g, "").toLowerCase().indexOf(v) : -1;
        nm.innerHTML = at >= 0 && !/\s/.test(raw) ? esc(raw.slice(0, at)) + "<mark>" + esc(raw.slice(at, at + v.length)) + "</mark>" + esc(raw.slice(at + v.length)) : esc(raw);
      });
      cnt.innerHTML = v ? "검색 결과 <b>" + n + "</b>명" : "함께하는 강사님 <b>" + total + "</b>명";
      empty.hidden = n > 0;
    };
    q.addEventListener("input", run);
    q.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); const v = items.filter((el) => !el.hidden); if (v.length === 1) v[0].click(); } if (e.key === "Escape") { q.value = ""; run(); } });
    box.querySelector("[data-dc-clear]").addEventListener("click", (e) => { e.preventDefault(); q.value = ""; run(); q.focus(); });
  }
  // 강사 고르기 순서: 첫 화면 강사진과 같게 (문대표 → 초이 → 나머지)
  const PICK_ORDER = ["moon", "choi"];
  /** 로그인 카드 위 ‘어디로 들어갈까요?’ — 두잉고(기수 · 강사 강의실) / 두고클래스(VOD · 전자책 구매 회원) */
  const svcTabs = (on) => '<div class="lg-svc" role="tablist" aria-label="로그인할 곳 고르기"><a role="tab" class="lg-svc-dg' + (on === "dg" ? " on" : "") + '" href="#/login" aria-selected="' + (on === "dg") + '"><b>두잉고</b><small>기수 수강생 · 강사 강의실</small></a><a role="tab" class="lg-svc-vod' + (on === "vod" ? " on" : "") + '" href="#/vod/login?next=%23%2Fvod%2Fdg" aria-selected="' + (on === "vod") + '"><b>두고클래스</b><small>VOD 구매 회원 · 이메일 로그인</small></a></div>';
  function renderLogin() {
    const rank = (id) => { const i = PICK_ORDER.indexOf(id); return i < 0 ? 99 : i; };
    const list = DB.activeInstructors().slice().sort((a, b) => rank(a.id) - rank(b.id));
    const ins = loginInstructor();
    if (!ins && list.length) return renderPicker(list);
    const brandIns = ins || list[0];
    const B = brandIns ? DB.content(brandIns.id).brand : { name: "두잉고", loginEyebrow: "DOINGGO", loginHeadline: "온라인 강의\n함께 시작해요", loginSub: "" };
    document.title = (ins ? B.name : "두잉고") + " · 로그인";
    window.applyStudentTheme(DB.themeOf(B.theme));
    const lines = String(B.loginHeadline || B.courseTitle || "").split("\n");
    const headline = lines.map((l, i) => (i === lines.length - 1 && lines.length > 1 ? '<span class="accent">' + esc(l) + "</span>" : esc(l))).join("<br>");
    // 강사 동그라미: 프로필 사진이 있으면 사진 (없으면 이름 첫 글자)
    const insAv = (x) => { const ph = ((DB.content(x.id) || {}).brand || {}).photo; return '<span class="ins-avatar' + (ph ? " has-photo" : "") + '">' + (ph ? '<img src="' + esc(ph) + '" alt="" decoding="async">' : esc(x.displayName.slice(0, 1))) + "</span>"; };
    const picker = ins
      ? '<div class="ins-picked">' + insAv(ins) + '<span class="ins-txt"><small>수강 중인 강의</small><b>' + esc(ins.displayName) + "</b><span>" + esc(DB.content(ins.id).brand.shortTitle) + "</span></span>" +
        '<button type="button" class="link-btn" data-action="change-instructor">변경</button></div>'
      : '<div class="field"><span class="field-label">어떤 강사님의 강의를 듣고 계신가요?</span><div class="ins-list" role="radiogroup">' +
        list.map((x) => '<button type="button" class="ins-option" role="radio" aria-checked="false" data-action="pick-instructor" data-id="' + x.id + '">' + insAv(x) + "<b>" + esc(x.displayName) + "</b>" + icon("chevRight", "sm") + "</button>").join("") +
        '</div><span class="tiny">한 번 고르면 다음부터는 바로 로그인 화면이 열려요.</span></div>';
    root.innerHTML =
      '<main class="login">' +
        '<section class="login-brand">' + window.loginArt("wise", ["message", "play", "book", "award"]) +
          '<span class="login-logo"><a class="login-dg-home" href="#/doinggo" title="두잉고 홈으로" aria-label="두잉고 홈으로">' + window.doinggoB("white", "login-dg") + "</a>" + '<span class="login-logo-div" aria-hidden="true"></span><strong>' + esc(B.name) + "</strong><em>수강생</em></span>" +
          '<div class="login-hero">' +
            '<p class="login-eyebrow">' + esc(B.loginEyebrow || "DOINGGO") + "</p>" +
            '<h2 class="login-headline">' + headline + "</h2>" +
            (B.loginSub ? '<p class="login-sub">' + esc(B.loginSub) + "</p>" : "") +
          "</div>" +
          '<div class="login-foot"><span class="login-copy">© 2026 ' + esc(B.name) + "</span>" + window.poweredBy("white", "login-powered") + "</div>" +
        "</section>" +
        '<section class="login-panel">' +
          '<div class="login-topright"><a class="login-home-big" href="#/doinggo">' + icon("arrowLeft", "sm") + "<span>두잉고 홈페이지 이동하기</span></a><span>강사님이신가요?</span><a class=\"btn btn-dark btn-sm\" href=\"#/center\">강사센터</a></div>" +
          '<div class="login-stack">' +
            '<div class="login-card">' + svcTabs("dg") +
              '<p class="login-label">' + (window.doogoClassLock ? window.doogoClassLock() : window.doogoLogo("color")) + "</p>" +
              "<h1>" + esc(ins ? B.name : "두잉고") + " 시작하기</h1>" +
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
                    '<p class="login-help">휴대폰 번호 뒷자리 4자리가 비밀번호 대신 사용됩니다.</p>' +
                    (window.VOD && window.VOD.products && window.VOD.products().some((p) => p.iid === ins.id && window.VOD.dgOpen(p)) ? '<a class="login-help login-vod" href="#/vod/login?next=%23%2Fvod%2Fdg">' + icon("circlePlay", "xs") + "<span>DOOGO CLASS에서 " + esc(ins.displayName) + " 강사님 VOD를 사셨나요? 위 <b>‘두고클래스’ 탭</b>에서 가입한 <b>이메일 · 비밀번호</b>(또는 카카오)로 로그인하면 VOD 강의실로 바로 들어가요.</span>" + icon("chevRight", "xs") + "</a>" : "") +
                    (vodClosed ? '<p class="field-error">VOD 수강 기간이 끝나 두잉고 VOD 버전이 닫혔어요.</p>' : "")
                  : "") +
              "</form>" +
            "</div>" +
            (ins ? '<button type="button" class="login-alt" data-action="signup">' + icon("userPlus", "sm") + "아직 수강 신청 전이신가요? 수강 신청하기</button>" +
              ((DB.landingOf(ins.id) || {}).published ? '<a class="login-intro" href="#/p/' + esc(ins.id) + '">' + icon("book", "sm") + "강의 소개 보기 " + icon("arrowRight", "xs") + "</a>" : "") +
              "" : "") +
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
    if (DB.remote.on) { serverLogin(ins, name, phone4, err, form); return; }
    const matches = DB.studentsOf(ins.id).filter((x) => x.name.replace(/\s+/g, "") === name && x.phone4 === phone4);
    const newest = (a, b) => String((DB.cohort(b.cohortId) || {}).start || b.appliedAt || "").localeCompare(String((DB.cohort(a.cohortId) || {}).start || a.appliedAt || ""));
    const pick = (st) => matches.filter((x) => x.status === st).sort(newest)[0];
    let s = pick("approved") || pick("pending") || matches.slice().sort(newest)[0];
    // DOOGO CLASS VOD 구매 회원은 이 칸(기수 수강생용)이 아니라 ‘두고클래스’ 탭의 이메일 로그인으로 들어와요
    if (!s && window.VOD && window.VOD.findBuyer && window.VOD.findBuyer(ins.id, name, phone4)) { err.innerHTML = "DOOGO CLASS에서 VOD를 사신 회원이시네요. 위 <b>‘두고클래스’ 탭</b>에서 가입한 이메일 · 비밀번호로 로그인하면 VOD 강의실로 바로 들어가요."; return; }
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

  // 서버 모드: 이름·뒷자리는 서버에서만 확인한다 (다른 수강생 정보는 이 브라우저에 내려오지 않음)
  const LOGIN_ERR = {
    notfound: "등록된 수강생 정보와 일치하지 않아요. 이름과 뒷자리를 다시 확인해 주세요.",
    rejected: "수강 신청이 승인되지 않았어요. 강사님께 문의해 주세요.",
    withdrawn: "탈퇴 처리된 계정이에요. 다시 수강하려면 강사님께 문의해 주세요.",
    locked: "여러 번 틀려서 잠시 로그인이 막혔어요. 15분 뒤에 다시 시도해 주세요.",
    input: "이름과 전화번호 뒷자리 4자리를 확인해 주세요."
  };
  function serverLogin(ins, name, phone4, err, form) {
    const btn = form.querySelector("button[type=submit]");
    if (btn) btn.disabled = true;
    DB.remote.login({ action: "student", iid: ins.id, name, phone4 }).then((r) => {
      if (r.error) { err.textContent = r.error === "pending" ? "수강 신청이 접수됐어요. " + ins.displayName + " 강사님이 승인하면 로그인할 수 있어요." : LOGIN_ERR[r.error] || LOGIN_ERR.notfound; return; }
      return DB.remote.refresh().then(() => {
        DB.session.setInstructorPick(ins.id);
        DB.session.setStudent({ id: r.sid, at: Date.now() });
        startSession();
        location.hash = "#/home";
        toast(r.name + "님, 환영합니다!");
      });
    }).catch(() => { err.textContent = "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."; }).then(() => { if (btn) btn.disabled = false; });
  }

  // 강의 내용 중 커리큘럼(주차·강의·과제)만 내 기수가 고른 커리큘럼으로 바꿔 끼운다
  const cohortContent = (insId, co) => Object.assign({}, DB.content(insId), { weeks: DB.weeksOf(co) });
  // VOD 버전에서 지금 들어와 있는 강의실(VOD 상품). DOOGO CLASS ‘강의실 입장’으로 들어온 VOD → 없으면 가장 최근에 산 VOD
  let VP = "";
  function pickVp(want, iid, mid) {
    const X = window.VOD; if (!X) return "";
    const own = mid ? X.vodOrdersOf(mid, iid).map((x) => x.p.id) : X.products().filter((p) => p.iid === iid && X.dgOpen(p)).map((p) => p.id);
    return own.indexOf(want) >= 0 ? want : own[0] || "";
  }
  /** 다른 VOD 강의실로 바꾸기 (같은 강사의 VOD를 여러 개 샀을 때) */
  function setVp(pid) {
    if (TRACK !== "vod" || !pid || pid === VP) return;
    const p2 = pickVp(pid, INS.id, me && me.vodMid); if (p2 !== pid) return;
    VP = pid; D = DB.vodView(INS.id, VP);
    const s = DB.session.student(); if (s) DB.session.setStudent(Object.assign({}, s, { vpid: VP }));
  }
  function startSession() {
    me = null; preview = false; TRACK = "live"; VP = "";
    const sess = DB.session.student();
    if (!sess) return;
    if (sess.preview) {
      const ins = DB.instructor(sess.instructorId), vod = sess.track === "vod";
      const co = vod ? ins && DB.cohort(DB.vodCohortId(ins.id)) : DB.cohort(sess.cohortId) || (ins && DB.currentCohort(ins.id));
      if (!ins || !co) return;
      TRACK = vod ? "vod" : "live";
      if (vod) VP = pickVp(sess.vpid, ins.id, "");
      INS = ins; CO = co; D = vod ? DB.vodView(ins.id, VP) : cohortContent(ins.id, co); preview = true; previewBy = sess.by || "instructor";
      me = { id: "preview-" + ins.id + (vod ? "-vod" : ""), name: ins.displayName, instructorId: ins.id, cohortId: co.id, track: vod ? "vod" : undefined };
    } else {
      const s = DB.student(sess.id);
      if (!s || s.status !== "approved") { DB.session.setStudent(null); return; }
      const ins = DB.instructor(s.instructorId);
      if (!ins || ins.status !== "active") return;
      // VOD 버전: DOOGO CLASS 수강 기간이 끝났거나 환불했으면 닫는다
      if (DB.isVodStudent(s) && window.VOD && s.vodMid && !window.VOD.vodAccess(s.vodMid, s.instructorId)) { DB.session.setStudent(null); vodClosed = true; return; }
      CO = DB.cohort(s.cohortId);
      if (!CO) { me = null; return; }
      TRACK = DB.isVodStudent(s) ? "vod" : "live";
      if (TRACK === "vod") VP = pickVp(sess.vpid, ins.id, s.vodMid);
      INS = ins; D = TRACK === "vod" ? DB.vodView(ins.id, VP) : cohortContent(ins.id, CO); me = s;
    }
    P = DB.progress(me.id);
    // 시작 가이드에 ‘완료’ 버튼이 생기면서, 테스트하며 눌러 둔 체크를 한 번만 비운다 (이후에는 ‘완료’를 누른 가이드는 다시 안 뜬다)
    if (!preview && P.guideV !== 2) { P.guide = {}; P.guideClosed = {}; P.guideV = 2; saveProgress(); }
    checkLevelUp();
    draft = { missionId: null, files: [] };
    calCursor = null; calSel = null;
  }
  function logout() {
    const wasVod = TRACK === "vod";
    DB.session.setStudent(null);
    me = null; P = null;
    location.hash = wasVod ? "#/vod/my/classes" : "#/login";
    // 서버 모드: 로그인 쿠키를 지우고 내 정보가 남지 않게 새로 불러온다
    if (DB.remote.on) DB.remote.logout("student").catch(() => {}).then(() => location.reload());
  }
  // 서버에서 다른 사람이 바꾼 내용(예: 코치 검수 · 답변)이 들어오면 내 계정과 기록을 새로 읽는다
  DB.remote.listen((type) => {
    if (type !== "change" || !me || preview) return;
    const s = DB.student(me.id);
    if (!s) return;
    me = s; P = DB.progress(me.id);
    if (INS) { const ins = DB.instructor(INS.id); if (ins) INS = ins; }
    if (CO) { const co = DB.cohort(CO.id); if (co) { CO = co; D = TRACK === "vod" ? DB.vodView(INS.id, VP) : cohortContent(INS.id, CO); } }
  });

  /* ---------------- 앱 셸 ---------------- */
  /* ---------------- 한국 · 뉴질랜드 시간 ----------------
   * 시간대 데이터(Intl)로 계산해서 뉴질랜드 서머타임(9월 마지막 일요일 ~ 4월 첫 일요일)이 자동으로 반영된다 */
  const ZONES = [{ key: "kr", label: "한국", tz: "Asia/Seoul" }, { key: "nz", label: "뉴질랜드", tz: "Pacific/Auckland" }];
  function zoneNow(tz, d) {
    const p = {};
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d).forEach((x) => { p[x.type] = x.value; });
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
    return { hm: String(+p.hour % 24).padStart(2, "0") + ":" + p.minute, md: (+p.month) + "/" + (+p.day), dow: DOW[new Date(asUTC).getUTCDay()], offset: Math.round((asUTC - Math.floor(d.getTime() / 60000) * 60000) / 60000) };
  }
  // 동그란 국기 (SVG). 태극기는 태극 + 4괘, 뉴질랜드기는 유니언 잭 + 남십자성 4개
  let flagSeq = 0;
  function flagKR() {
    const bars = (pat) => pat.map((b, i) => { const y = (i - 1) * 4.6 - 1.5; return b ? '<rect x="-8" y="' + y + '" width="16" height="3"/>' : '<rect x="-8" y="' + y + '" width="7" height="3"/><rect x="1" y="' + y + '" width="7" height="3"/>'; }).join("");
    const tri = (x, y, a, pat) => '<g transform="translate(' + x + " " + y + ") rotate(" + a + ')">' + bars(pat) + "</g>";
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="#fff"/>' +
      '<g transform="rotate(33.69 50 50)"><path d="M28 50a22 22 0 0 1 44 0z" fill="#cd2e3a"/><path d="M28 50a22 22 0 0 0 44 0z" fill="#0047a0"/><circle cx="39" cy="50" r="11" fill="#cd2e3a"/><circle cx="61" cy="50" r="11" fill="#0047a0"/></g>' +
      '<g fill="#000">' + tri(21.7, 31.1, -33.69, [1, 1, 1]) + tri(78.3, 31.1, 33.69, [0, 1, 0]) + tri(21.7, 68.9, 33.69, [1, 0, 1]) + tri(78.3, 68.9, -33.69, [0, 0, 0]) + "</g></svg>";
  }
  function flagNZ() {
    const id = "fnz" + (++flagSeq);
    const star = (cx, cy, r) => { const pts = []; for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.4 : r, an = -Math.PI / 2 + i * Math.PI / 5; pts.push((cx + rr * Math.cos(an)).toFixed(1) + "," + (cy + rr * Math.sin(an)).toFixed(1)); } return '<polygon points="' + pts.join(" ") + '" fill="#c8102e" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/>'; };
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><defs><clipPath id="' + id + '"><rect width="50" height="50"/></clipPath></defs><rect width="100" height="100" fill="#012169"/>' +
      '<g clip-path="url(#' + id + ')"><path d="M0 0L50 50M50 0L0 50" stroke="#fff" stroke-width="10"/><path d="M0 0L50 50M50 0L0 50" stroke="#c8102e" stroke-width="3.4"/>' +
      '<path d="M25 0V50M0 25H50" stroke="#fff" stroke-width="16"/><path d="M25 0V50M0 25H50" stroke="#c8102e" stroke-width="9"/></g>' +
      star(75, 24, 9.5) + star(62, 50, 9) + star(87, 46, 7.5) + star(74, 75, 11) + "</svg>";
  }
  function worldClockHtml() {
    const d = new Date(), kr = zoneNow(ZONES[0].tz, d), nz = zoneNow(ZONES[1].tz, d);
    const diff = Math.round((nz.offset - kr.offset) / 60), summer = nz.offset === 13 * 60;
    const cell = (z, t, sub) => '<span class="wc-cell wc-' + z.key + '"><span class="wc-flag" title="' + z.label + '">' + (z.key === "kr" ? flagKR() : flagNZ()) + '</span><span class="wc-txt"><small>' + z.label + (t.md !== kr.md && z.key === "nz" ? " · " + t.md : "") + '</small><b>' + t.hm + "</b><em>(" + t.dow + ")</em></span>" + (sub ? '<span class="wc-sub">' + sub + "</span>" : "") + "</span>";
    return cell(ZONES[0], kr, "") + '<span class="wc-gap" aria-hidden="true">+' + diff + "h</span>" + cell(ZONES[1], nz, summer ? "서머타임" : "표준시");
  }
  function tickWorldClock() { document.querySelectorAll(".wclock").forEach((el) => { el.innerHTML = worldClockHtml(); }); }
  setInterval(() => { if (isActive() && document.querySelector(".wclock")) tickWorldClock(); }, 15000);
  function renderShell() {
    root.innerHTML =
      '<div class="app' + (preview ? " has-preview" : "") + '" id="app">' +
        (preview ? '<div class="preview-bar"><span>' + icon("eye", "sm") + "<b>" + (previewBy === "coach" ? "코치" : "강사") + " 미리보기</b> · " + esc(CO.name) + " 기준 수강생 화면이에요. 여기서 제출한 내용은 실제 수강생 기록에 섞이지 않아요.</span>" +
          '<span class="preview-actions"><button type="button" class="link-btn preview-exit" data-action="exit-preview">로그인 화면 보기</button><a class="btn btn-primary btn-sm" href="#/center">' + icon("arrowLeft", "sm") + (previewBy === "coach" ? "코치센터로" : "강사센터로") + " 돌아가기</a></span></div>" : "") +
        '<header class="topbar">' +
          '<button class="menu-toggle" type="button" data-action="toggle-nav" aria-label="메뉴 열기">' + icon("menu") + "</button>" +
          '<a class="brand" href="#/home">' + window.doinggoB("black", "brand-dg") + '<span class="brand-div" aria-hidden="true"></span><span class="sr-only">홈</span><span class="brand-text"><small>' + esc(D.brand.name) + "</small><strong>" + esc(D.brand.courseTitle) + "</strong></span></a>" +
          (D.brand.worldClock ? '<div class="wclock top" aria-label="한국 · 뉴질랜드 현재 시간">' + worldClockHtml() + "</div>" : "") +
          '<div class="topbar-right">' +
            (TRACK === "vod" ? '<a class="dc-back" href="#/vod" title="DOOGO CLASS 스토어로 이동"><span class="dc-back-t"><b>DOOGO CLASS</b> 바로가기</span>' + icon("arrowUpRight", "xs") + "</a>" : "") +
            (TRACK === "vod" ? '<button type="button" class="vmode" data-action="vod-mode" aria-label="블랙 / 화이트 화면 바꾸기" title="블랙 / 화이트 화면 바꾸기">' + modeInner() + "</button>" : "") +
            '<span class="hello"><span class="sprout lv-' + LV().cur.key + '" title="성장 레벨 · ' + esc(LV().cur.name) + '">' + icon(LV().cur.icon, "sm") + "</span><b>" + esc(me.name) + '</b><span class="txt">' + (preview ? "님 (미리보기)" : "님 환영합니다") + "</span></span>" +
            '<span class="cohort-chip">' + esc(CO.name) + "</span>" +
            (preview ? "" : '<button class="logout" type="button" data-action="logout" aria-label="로그아웃">' + icon("logout", "sm") + "<span>로그아웃</span></button>") +
          "</div>" +
        "</header>" +
        (D.brand.worldClock ? '<div class="wclock strip" aria-label="한국 · 뉴질랜드 현재 시간">' + worldClockHtml() + "</div>" : "") +
        '<div class="shell">' +
          '<aside class="sidebar" id="sidebar" aria-label="주 메뉴"></aside>' +
          '<div class="scrim" data-action="toggle-nav"></div>' +
          '<main class="main" id="main" tabindex="-1"></main>' +
        "</div>" +
        '<div class="bot-fab" id="bot-fab"></div>' +
        '<nav class="bw-tabbar" aria-label="빠른 메뉴">' + (TRACK === "vod" ? [["#/home", "home", "홈"], ["#/vodclass", "circlePlay", "VOD 강의"], ["#/library", "library", "자료함"], ["#/vod/my/classes", "store", "DOOGO"]] : [["#/home", "home", "홈"], ["#/curriculum", "book", "강의"], ["#/missions", "checks", "과제"], ["#/qna", "message", "질문"]].filter((x) => x[0] === "#/home" || on(x[0].slice(2)))).map((x) => '<a class="bw-tab" href="' + x[0] + '">' + icon(x[1]) + "<span>" + x[2] + "</span></a>").join("") + '<button type="button" class="bw-tab" data-action="toggle-nav">' + icon("menu") + "<span>전체</span></button></nav>" +
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
        icon(n.icon) + "<span>" + esc(navLabel(n)) + (n.id === "notices" && !/공지/.test(navLabel(n)) ? '<small class="nav-sub">공지사항</small>' : "") + "</span>" + (n.id === "notices" && unreadNotices() ? '<span class="nav-count">' + unreadNotices() + "</span>" : n.id === "qna" && newAnswers() ? '<span class="nav-count" title="새 답변">' + newAnswers() + "</span>" : n.id === "missions" && newFixes() ? '<span class="nav-count" title="보완 요청">' + newFixes() + "</span>" : "") + (kids ? icon("chevDown", "sm chev") : "") + "</a>";
      if (kids && active) {
        html += '<ul class="subnav">' + kids.map((k) =>
          '<li><a href="' + k.href + '" class="' + (sub === k.id ? "active" : "") + '">' + esc(k.label) + (k.locked ? '<span class="lock">' + icon("lock", "xs") + "</span>" : "") + "</a></li>").join("") + "</ul>";
      }
      return html + "</li>";
    }).join("");
    document.getElementById("sidebar").innerHTML =
      (TRACK === "vod" ? '<a class="dc-side" href="#/vod/my/classes"><img src="assets/brand/doogo-class-word.svg" alt="DOOGO CLASS"><span><b>DOOGO CLASS 내 강의실</b><small>구매 내역 · 다른 강의 둘러보기</small></span>' + icon("arrowUpRight", "sm") + "</a>" : "") +
      (D.brand.worldClock ? '<div class="wclock side" aria-label="한국 · 뉴질랜드 현재 시간">' + worldClockHtml() + "</div>" : "") +
      vpSwitch() +
      '<ul class="nav">' + items + "</ul>" +
      helpCard();
  }
  // VOD 강의실 바꾸기: 지금 강의실 이름 + (2개 이상이면) 고르기
  function vpSwitch() {
    if (TRACK !== "vod" || !VP || !window.VOD) return "";
    const X = VX(), list = vodList(), cur = X.product(VP); if (!cur) return "";
    return '<div class="vp-sw"><small>' + icon("circlePlay", "xs") + " 지금 강의실</small>" + (list.length > 1
      ? '<label class="vp-sel"><span class="sr-only">강의실 바꾸기</span><select id="vp-pick">' + list.map((x) => '<option value="' + esc(x.p.id) + '"' + (x.p.id === VP ? " selected" : "") + ">" + esc(x.p.title) + "</option>").join("") + "</select>" + icon("chevDown", "sm") + "</label><span class=\"vp-n\">VOD " + list.length + "개 · 강의마다 강의실이 따로예요</span>"
      : "<b>" + esc(cur.title) + "</b>") + "</div>";
  }
  // 왼쪽 메뉴 아래 ‘막힐 때’ 카드: AI 조교 → FAQ 검색 → 1:1 요청 순서로 안내 (켜진 메뉴만)
  function helpCard() {
    const steps = [];
    if (on("bot")) steps.push('<button type="button" class="hc-step" data-action="bot-open">' + '<span class="hc-ic">' + icon("bot", "sm") + '</span><span class="hc-t"><b>' + esc(D.brand.botName) + "에게 묻기</b><small>밤에도 바로 답해요</small></span></button>");
    if (on("qna")) {
      steps.push('<a class="hc-step" href="#/qna"><span class="hc-ic">' + icon("search", "sm") + '</span><span class="hc-t"><b>FAQ에서 찾기</b><small>자주 나오는 답을 모았어요</small></span></a>');
      if (TRACK === "vod" && addPid("coachOf")) steps.push('<a class="hc-step" href="' + (coachN() ? "#/qna/requests/new" : "#/qna") + '"><span class="hc-ic">' + icon("message", "sm") + '</span><span class="hc-t"><b>1:1 코칭 질문</b><small>' + (coachN() ? "남은 " + coachN() + "회 · 강사님이 직접 답해요" : "코칭권으로 강사에게 직접 질문") + "</small></span></a>");
      if (TRACK !== "vod") steps.push('<a class="hc-step" href="#/qna/requests/new"><span class="hc-ic">' + icon("message", "sm") + '</span><span class="hc-t"><b>1:1 요청 남기기</b><small>' + esc(D.brand.instructor) + "님이 직접 확인해요</small></span></a>");
    }
    return '<div class="help-card hc2"><div class="hc-top"><span class="hc-tag">' + icon("sparkles", "xs") + "막힐 땐</span><strong>혼자 고민하지 마세요</strong><p>위에서부터 차례로 해 보면 대부분 금방 풀려요.</p></div>" +
      (steps.length ? '<div class="hc-steps">' + steps.join("") + "</div>" : "") +
      (D.brand.kakaoChannel ? '<a class="btn btn-primary btn-sm btn-block hc-kakao" href="' + esc(D.brand.kakaoChannel) + '" target="_blank" rel="noopener">' + icon("message", "sm") + "카카오톡으로 문의</a>" : "") +
      '<a class="hc-ops" href="' + esc(DB.opsKakao().chat) + '" target="_blank" rel="noopener" data-kk-ops>' + icon("headset", "sm") + "<span><b>운영팀 상담 (카카오톡)</b><small>강의 재생 · 로그인 · 결제 오류는 여기로</small></span></a>" +
      '<div class="side-powered">' + window.poweredBy("color") + "</div></div>";
  }

  /* ---------------- 홈 ---------------- */
  // 시간대마다 다른 인사
  const greetWord = () => { const h = new Date().getHours(); return h >= 5 && h < 11 ? "좋은 아침이에요" : h >= 11 && h < 17 ? "오늘도 한 걸음 더 가 볼까요?" : h >= 17 && h < 22 ? "오늘 하루도 수고 많았어요" : "늦은 시간까지 공부 중이시네요"; };
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
    const guideCard = guideBlock();
    return '<div class="page">' +
      '<header class="page-head greet"><span class="greet-icon lv-' + lv.cur.key + '" title="성장 단계 · ' + esc(lv.cur.name) + '">' + icon(lv.cur.icon, "lg") + '</span><div><h1>' + esc(me.name) + "님, " + greetWord() + "</h1><p>" + esc(quote || (CO.name + " · " + (wk ? wk + "주차 진행 중" : fmtMD(CO.startDate) + " 시작"))) + "</p></div></header>" +
      mainLecCard() +
      guideCard +
      (todayLive ? '<section class="card live-today">' + icon("video") + '<div><b>오늘 ' + (todayLive.time ? esc(todayLive.time) + " " : "") + esc(todayLive.title) + '</b><span class="tiny">시간이 되면 아래 버튼으로 바로 들어오세요.</span></div>' + liveBtn(todayLive) + "</section>" : "") +
      (mv ? '<section class="card home-mv"><div class="home-video-head"><h2>' + icon("flame") + "오늘의 응원 영상</h2>" +
        '<a class="link-btn" href="#/motivation">' + esc(ML("motivation")) + " 더 보기 " + icon("arrowRight", "sm") + "</a></div>" + video(mv) +
        '<p class="tiny" style="margin:12px 0 0">' + esc(mv.title) + "</p></section>" : "") +
      (on("missions") ? levelCard(lv) : "") +
      weekFocusCard() +
      (on("missions") || on("schedule") ? '<div class="home-duo">' + (on("missions") ? progressCard() : "") + (on("schedule") ? upcomingCard(upcoming, today) : "") + "</div>" : "") +
      (on("missions") ? '<div class="section-head"><h2>이어서 할 과제</h2><a class="link-btn" href="#/missions">전체 과제 ' + icon("arrowRight", "sm") + "</a></div>" +
      (nm
        ? '<a class="card next-card plain-link" href="#/missions/' + nm.weekNo + "/" + nm.id + '"><span class="wk-icon">' + icon("checks") + "</span>" +
            '<div style="flex:1;min-width:0"><div class="tiny">' + nm.weekNo + "주차 · " + kindOf(nm).short + " · 마감 " + fmtMD(DB.weekDeadline(CO, nm.weekNo)) + '</div><div class="m-title">' + esc(nm.title) + " " + stateBadge(nm.id) + '</div><div class="m-desc">' + esc(nm.desc) + "</div></div>" +
            '<span class="btn btn-primary btn-sm">열기 ' + icon("arrowRight", "sm") + "</span></a>"
        : '<div class="card callout-ok callout">' + icon("check") + "<div>" + (D.weeks.length && !isOpen(D.weeks[0]) ? fmtMD(CO.startDate) + "에 1주차가 열려요. 조금만 기다려 주세요!" : "열린 주차의 과제를 모두 마쳤어요! 다음 주차가 열리면 바로 시작해 보세요.") + "</div></div>") : "") +
      (on("notices") ? '<section class="card" style="margin-top:14px"><div class="home-video-head"><h2>' + esc(NT()) + '</h2><a class="link-btn" href="#/notices">더보기 ' + icon("arrowRight", "sm") + "</a></div>" +
          (notices.length ? notices.map((n) => '<a class="list-row" href="#/notices/' + n.id + '">' + (n.pinned ? '<span class="badge badge-ink">필독</span>' : "") + '<span class="lr-title">' + esc(n.title) + "</span>" + newBadge(n) + '<span class="lr-date">' + fmtMD(n.date) + "</span></a>").join("") : '<p class="muted" style="margin:0">아직 공지가 없어요.</p>') +
        "</section>" : "") +
      quickLinks() +
    "</div>";
  }
  // 시작 가이드: 1주차 항목은 처음 한 번(온보딩), ‘주차’를 정한 항목은 그 주차가 열리면 그 주차 체크리스트로 다시 뜬다.
  // 보이는 주차의 항목을 모두 체크하면 카드가 사라진다. ‘바로가기’를 누르면 자동으로 체크된다.
  function guideGroup() {
    const G = D.guide || [], closed = P.guideClosed || {};
    const wkOf = (g) => Math.max(1, Number(g.week) || 1);
    const hid = (g) => { const m2 = /^#\/(docs|library)/.exec(g.url || ""); return !!m2 && !on(m2[1]); };
    if (TRACK === "vod" && me && vodPct() > 0) G.forEach((g) => { if (/^#\/vodclass/.test(g.url || "") && !(P.guide || {})[g.id]) { P.guide = P.guide || {}; P.guide[g.id] = Date.now(); } });
    const visible = G.filter((g) => !hid(g)).filter((g) => { const n = wkOf(g); if (n === 1) return true; const w = findWeek(n); return w ? isOpen(w) : false; });
    const weeks = visible.map(wkOf).filter((n, i, a) => a.indexOf(n) === i && !closed[n]).sort((a, b) => a - b);
    if (!weeks.length) return null;
    const items = visible.filter((g) => wkOf(g) === weeks[0]);
    return { wk: weeks[0], items, allDone: items.every((g) => (P.guide || {})[g.id]) };
  }
  // 모두 체크하면 ‘완료’ 버튼이 나오고, 누르면 그 가이드는 다시 뜨지 않는다
  function guideBlock() {
    const grp = guideGroup();
    if (!grp) return "";
    const done = grp.items.filter((g) => (P.guide || {})[g.id]).length;
    const title = grp.wk === 1 ? "처음 오셨나요? 시작 가이드" : grp.wk + "주차 시작 가이드";
    return '<section class="card start-guide' + (grp.allDone ? " all-done" : "") + '"><div class="home-video-head"><h2>' + icon("sparkles") + title + '</h2><span class="tiny">' + done + " / " + grp.items.length + " 완료</span></div>" + progressBar(Math.round(done / grp.items.length * 100), true) +
      '<ul class="guide-list">' + grp.items.map((g) => {
        const ok = !!(P.guide || {})[g.id], ext = /^https?:/i.test(g.url || "");
        return '<li class="' + (ok ? "done" : "") + '"><button type="button" class="g-check" data-action="toggle-guide" data-id="' + esc(g.id) + '" aria-pressed="' + ok + '" aria-label="' + esc(g.title) + (ok ? " 완료 취소" : " 완료") + '">' + (ok ? icon("check", "sm") : "") + "</button>" +
          '<div class="g-txt"><b>' + esc(g.title) + "</b>" + (g.desc ? "<span>" + esc(g.desc) + "</span>" : "") + "</div>" +
          (g.url ? '<a class="link-btn" data-guide="' + esc(g.id) + '" href="' + esc(g.url) + '"' + (ext ? ' target="_blank" rel="noopener"' : "") + ">바로가기 " + icon(ext ? "arrowUpRight" : "arrowRight", "sm") + "</a>" : "") + "</li>";
      }).join("") + "</ul>" +
      (grp.allDone
        ? '<div class="guide-finish"><span>' + icon("check", "sm") + "모두 마쳤어요! ‘완료’를 누르면 이 안내는 다시 나오지 않아요.</span>" + '<button type="button" class="btn btn-primary" data-action="guide-close" data-wk="' + grp.wk + '">완료</button></div>'
        : '<p class="tiny guide-tip">하나씩 체크하거나 ‘바로가기’를 눌러 보세요. 모두 마치면 ‘완료’ 버튼이 나와요.</p>') + "</section>";
  }
  function guideDoneCheck(before) {
    const g = guideGroup();
    if (before && !before.allDone && g && g.wk === before.wk && g.allDone) toast("모두 체크했어요! 아래 ‘완료’를 누르면 안내가 닫혀요.");
  }
  // 자주 찾는 페이지 (강사센터에서 정함)
  function quickLinks() {
    const list = DB.quickLinksOf(D).filter((l) => l.url && (/^https?:/i.test(l.url) || linkOk([l.title, l.url])));
    if (!list.length) return "";
    const card = (l) => {
      const ext = /^https?:/i.test(l.url), col = /^#[0-9a-f]{6}$/i.test(l.color || "") ? l.color : "";
      return '<a class="card ql-card' + (col ? " ql-color" : "") + '" href="' + esc(l.url) + '"' + (ext ? ' target="_blank" rel="noopener"' : "") + (col ? ' style="--ql:' + col + '"' : "") + '><span class="ql-ic">' + icon(l.icon || "link") + "</span>" + (ext ? '<span class="ql-ext">' + icon("arrowUpRight", "sm") + "</span>" : "") +
        "<b>" + esc(l.title) + "</b>" + (l.desc ? "<span>" + esc(l.desc) + "</span>" : "") + "</a>";
    };
    const inner = list.filter((l) => !/^https?:/i.test(l.url)), outer = list.filter((l) => /^https?:/i.test(l.url));
    return '<div class="section-head"><h2>빠른 이동</h2><span class="hint">자주 여는 화면</span></div>' +
      (inner.length ? '<div class="ql-grid">' + inner.map(card).join("") + "</div>" : "") +
      (outer.length ? '<div class="ql-grid ql-outer">' + outer.map(card).join("") + "</div>" : "");
  }
  // 이번 주(열린 주차) 또는 다음 주(아직 안 열린 주차) 한 장: 과제 공개일은 주차 시작일에 맞춰 자동으로 열린다
  function weekFocusCard() {
    if (!D.weeks.length) return "";
    const t = todayStr();
    const cur = D.weeks.find((w) => isOpen(w) && t <= deadlineOf(w));
    const next = D.weeks.find((w) => !isOpen(w));
    const card = (w, kind) => {
      const st = weekStats(w), open = kind === "now";
      return '<section class="card wf-card' + (open ? " now" : "") + '"><div class="wf-top"><span class="wf-tag">' + (open ? "이번 주" : "다음 주") + "</span>" +
          (open ? '<span class="wf-state">' + icon("clock", "xs") + "마감 " + fmtMD(deadlineOf(w)) + "</span>" : '<span class="wf-state">' + icon("lock", "xs") + "잠김</span>") + "</div>" +
        "<h3>" + w.no + "주차 · " + esc(w.title) + "</h3>" +
        '<p class="wf-date">강의일 · ' + fmtMD(DB.classDate(CO, w.no)) + (w.subtitle ? " · " + esc(w.subtitle) : "") + "</p>" +
        (open ? '<div class="wf-prog">' + progressBar(st.pct, true) + '<span class="tiny">' + kindCount(st) + " · " + st.done + "/" + st.total + " 완료</span></div>"
          : '<div class="wf-lock">' + fmtMD(openOf(w)) + "부터 과제 제출이 공개됩니다." + (daysUntil(openOf(w)) > 0 ? " <b>D-" + daysUntil(openOf(w)) + "</b>" : "") + "</div>") +
        '<a class="btn ' + (open ? "btn-primary" : "btn-secondary") + ' wf-btn" href="' + (open && on("missions") ? "#/missions/" + w.no : "#/curriculum") + '">' + (open && on("missions") ? w.no + "주차 과제 하러 가기" : ML("curriculum") + " 미리 보기") + " " + icon("arrowRight", "sm") + "</a></section>";
    };
    const out = (cur ? card(cur, "now") : "") + (next ? card(next, "next") : "");
    return out ? '<div class="wf-wrap' + (cur && next ? " two" : "") + '">' + out + "</div>" : "";
  }
  // 과제 전체 진행률: 필수 · 도전 · 마인드를 누르면 그 종류만 모아 본다
  function progressCard() {
    const s = overallStats(), ic = { required: "target", challenge: "sparkles", mind: "heart" };
    return '<section class="card prog-card"><div class="home-video-head"><h2>과제 전체 진행률</h2><span class="tiny">' + s.done + " / " + s.total + "</span></div>" +
      '<p class="tiny" style="margin:-6px 0 10px">필수 · 도전 · 마인드를 눌러 바로 확인하세요</p>' +
      DB.MISSION_KINDS.filter((k) => s.kinds[k.key].total).map((k) => {
        const x = s.kinds[k.key], pct = Math.round(x.done / x.total * 100);
        return '<a class="prog-row ' + k.key + '" href="#/missions?kind=' + k.key + '"><span class="prog-ic">' + icon(ic[k.key] || "checks", "sm") + '</span><span class="prog-name">' + k.label + "</span>" +
          '<span class="prog-num"><b>' + x.done + "</b> / " + x.total + "</span>" + icon("chevRight", "sm") + progressBar(pct, true) + "</a>";
      }).join("") +
      (s.reqTotal ? '<p class="tiny prog-foot">' + (s.reqDone === s.reqTotal ? "필수 과제를 모두 통과했어요! 수료증을 받아 보세요." : "필수 과제 " + (s.reqTotal - s.reqDone) + "개를 더 통과하면 수료증이 나와요.") + "</p>" : "") + "</section>";
  }
  function upcomingCard(upcoming, today) {
    return '<section class="card"><div class="home-video-head"><h2>' + icon("calendar") + '다가오는 일정</h2><a class="link-btn" href="#/schedule">전체 일정 ' + icon("arrowRight", "sm") + "</a></div>" +
      (upcoming.length ? upcoming.map((e) => {
        const d = parseDate(e.date);
        return '<div class="list-row"><span class="date-pill' + (e.date === today ? " today" : "") + '"><small>' + (d.getMonth() + 1) + "월</small><b>" + d.getDate() + '</b></span><span class="lr-title"><i class="ev-dot ' + e.type + '"></i> ' + esc(e.title) + '</span><span class="lr-date">' + DOW[d.getDay()] + (e.time ? " " + esc(e.time) : "") + "</span></div>";
      }).join("") : '<p class="muted" style="margin:0">예정된 일정이 없습니다.</p>') + "</section>";
  }

  /* ---------------- 성장 레벨 ---------------- */
  // 과제를 해낼수록 씨앗 → 풀잎 → 가지 → 나무 → 숲 (필수 과제를 모두 통과하면 숲 · 4주 강의는 나무 없이 숲)
  const LV = () => (TRACK === "vod" ? vodLevel() : DB.level(P, INS.id, CO));
  // VOD 버전: 과제가 없으니 VOD 진도로 씨앗(0%) → 풀잎(25%) → 가지(50%) → 나무(75%) → 숲(완강)
  function vodLevel() {
    const steps = DB.levelSteps(5), pc = vodPct(), idx = pc >= 100 ? 4 : Math.min(3, Math.floor(pc / 25));
    return { steps, idx, cur: steps[idx], next: steps[idx + 1] || null, need: 0, needText: idx < 4 ? "진도 " + [25, 50, 75, 100][idx] + "%" : "", pct: pc, stats: { total: 0, done: 0, reqTotal: 0, reqDone: 0, kinds: {}, pct: pc }, weeks: 0 };
  }
  function levelCard(lv) {
    return '<section class="card lv-card" aria-label="성장 레벨"><div class="lv-head"><span class="tiny">' + esc(me.name) + '님의 성장 단계</span><b>' + esc(lv.cur.name) + ' <small>' + (lv.idx + 1) + " / " + lv.steps.length + "단계</small></b></div>" +
      '<ol class="lv-path">' + lv.steps.map((st, i) => '<li class="' + (i < lv.idx ? "past" : i === lv.idx ? "now" : "") + '"><span class="lv-ic lv-' + st.key + '">' + icon(st.icon, "sm") + "</span><small>" + esc(st.name) + "</small></li>").join("") + "</ol>" +
      '<p class="lv-foot">' + (lv.next ? "다음 단계 ‘" + esc(lv.next.name) + "’까지 <b>" + esc(lv.needText) + "</b> 남았어요 · 과제를 해낼수록 한 단계씩 자라요" : "필수 과제를 모두 통과해 ‘" + esc(lv.cur.name) + "’이 되었어요. 정말 멋져요!") + "</p></section>";
  }
  // 지난번 접속 때보다 레벨이 올랐으면 한 번 축하
  function checkLevelUp() {
    const lv = LV();
    if (P.level == null) { P.level = lv.idx; saveProgress(); return; }
    if (lv.idx > P.level) { P.level = lv.idx; saveProgress(); setTimeout(() => toast("레벨업! 이제 ‘" + lv.cur.name + "’ 단계예요 🎉"), 400); }
    else if (lv.idx !== P.level) { P.level = lv.idx; saveProgress(); }
  }

  /* ---------------- VOD 버전 (DOOGO CLASS에서 VOD를 산 수강생) ----------------
   * 주차 · 과제 · 마감 없이: VOD 진도 · 이어 보기 · 업데이트 소식 · 자료함 · 실습 체크리스트 · 질문
   * 강의 재생은 DOOGO CLASS 강의장(#/vod/learn/…)에서 하고, 진도도 거기서 읽어 온다 */
  const VX = () => window.VOD;
  /* VOD 두잉고 화면: 어떤 강사든 똑같이 깔끔한 흰 화면(클린 화이트), 오른쪽 위 해 · 달 버튼으로 블랙 화면 전환 (이 브라우저에 기억) */
  const VMODE_KEY = "doinggo:vod-mode";
  const vodMode = () => { try { return localStorage.getItem(VMODE_KEY) === "dark" ? "dark" : "light"; } catch (e) { return "light"; } };
  const SUN = '<svg class="icon sm" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
  const MOON = '<svg class="icon sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
  const modeInner = () => (vodMode() === "dark" ? SUN + '<span class="vmode-t">화이트</span>' : MOON + '<span class="vmode-t">블랙</span>');
  function applyTheme() {
    if (TRACK !== "vod") { window.applyStudentTheme(DB.themeOf(D.brand.theme)); return; }
    window.applyStudentTheme(DB.themeOf(vodMode() === "dark" ? "night" : "white"));
    document.documentElement.classList.add("th-vod");
  }
  function vodList() {
    const X = VX(); if (!X || !INS) return [];
    const list = preview || !me.vodMid ? X.products().filter((p) => p.iid === INS.id && p.status === "on" && X.dgOpen(p)).map((p) => ({ p, o: null })) : X.vodOrdersOf(me.vodMid, INS.id);
    // 유료 강의 먼저 (무료 특강은 뒤로) · 같은 조건이면 최근 결제 순
    return list.sort((a, b) => (X.priceOf(b.p) > 0) - (X.priceOf(a.p) > 0) || ((b.o && b.o.paidAt) || 0) - ((a.o && a.o.paidAt) || 0));
  }
  const vodPctOf = (x) => (x.o && me.vodMid ? VX().pctDone(me.vodMid, x.p.id) : 0);
  function vodPct() { const l = vodList(); return l.length ? Math.round(l.reduce((a, x) => a + vodPctOf(x), 0) / l.length) : 0; }
  function vodNext(x) {
    const X = VX(), lz = X.lessons(x.p), pr = x.o && me.vodMid ? X.prog(me.vodMid, x.p.id) : { done: {}, last: "" };
    const cur = lz.find((l) => l.id === pr.last && !pr.done[l.id]) || lz.find((l) => !pr.done[l.id]) || null;
    return { lz, pr, cur, doneN: lz.filter((l) => pr.done[l.id]).length };
  }
  const opsKkBtn = (cls) => '<a class="' + cls + '" href="' + esc(DB.opsKakao().chat) + '" target="_blank" rel="noopener" data-kk-ops title="두잉고 · 두고클래스 운영 상담 (카카오톡)">' + icon("message", "sm") + "<span>문의하기</span></a>";
  const learnHref = (pid, lid) => "#/vodclass/" + encodeURIComponent(pid) + (lid ? "/" + encodeURIComponent(lid) : "");
  const vodExp = (x) => { const e = x.o && me.vodMid ? VX().accessEnd(me.vodMid, x.p.id) : 0; return e === Infinity ? "기간 제한 없음" : e ? fmtFull(DB.date.toStr(new Date(e))) + "까지 시청" : VX().accessTxt(x.p); };
  /* 1:1 코칭권 · TEA TIME (DOOGO CLASS에서 사는 부가 상품). 남은 횟수는 스토어 주문에 쌓이고, 질문을 남기면 1회씩 차감돼요 */
  const coachN = () => (me && me.vodMid && VX() ? VX().coachLeft(me.vodMid, INS.id) : 0);
  const addPid = (fn) => { const X = VX(); if (!X) return ""; const x = vodList().find((v) => X[fn](v.p)); return x ? x.p.id : ""; };
  const coachEnd = () => { const ps = me && me.vodMid ? VX().coachPasses(me.vodMid, INS.id).filter((x) => x.left > 0) : []; return ps.length ? fmtFull(DB.date.toStr(new Date(ps[ps.length - 1].end))) : ""; };
  const myCoachQs = () => (me ? DB.requests(INS.id, preview ? me : null).filter((x) => x.s.id === me.id) : []);
  function coachCard(compact) {
    const X = VX(), pid = addPid("coachOf"); if (!X || !pid) return "";
    const c = X.coachOf(X.product(pid)), n = coachN();
    return '<section class="card vh-add vh-coach' + (compact ? " sm" : "") + '"><span class="vh-add-ic">' + icon("message") + '</span><div class="vh-add-t"><small>1:1 코칭권</small><b>' + (n ? "남은 코칭 <em>" + n + "회</em>" : esc(INS.displayName) + " 강사에게 직접 질문하기") + "</b><p>" + (n ? esc(coachEnd()) + "까지 · 강의 내용 · 내 사업 적용 무엇이든 물어보세요" : c.n + "회 · " + c.days + "일 · " + won(c.price) + " (1회 " + won(c.per) + ") · 강사님이 직접 답해요") + '</p></div><div class="vh-add-b">' +
      (n ? '<a class="btn btn-primary btn-sm" href="#/qna/requests/new">' + icon("pen", "sm") + '질문 남기기</a><a class="btn btn-secondary btn-sm" href="#/qna/requests">내 코칭 질문</a>' : '<a class="btn btn-primary btn-sm" href="#/vod/checkout/' + esc(pid) + '?item=coach">' + icon("message", "sm") + "코칭권 사기</a>" + (myCoachQs().length ? '<a class="btn btn-secondary btn-sm" href="#/qna/requests">지난 코칭 질문</a>' : "")) + "</div></section>";
  }
  function teaCard() {
    const X = VX(), pid = addPid("teaOf"); if (!X || !pid) return "";
    const t = X.teaOf(X.product(pid)), list = me && me.vodMid ? X.teasOf(me.vodMid, INS.id) : [], cur = list.find((o) => ["req", "ok"].indexOf((o.tea || {}).st) >= 0);
    return '<section class="card vh-add vh-tea"><span class="vh-add-ic tea">' + X.icx("coffee") + '</span><div class="vh-add-t"><small>강사님과 TEA TIME</small><b>' + (cur ? esc(X.TEA_ST[cur.tea.st][0]) : t.min + "분 1:1 만남") + "</b><p>" + (cur ? esc(X.teaStTxt(cur)) : esc(X.TEA_MODE[t.mode]) + " · " + won(t.price) + " · 희망 날짜를 남기면 강사님이 확정해요") + '</p></div><div class="vh-add-b">' +
      (cur ? '<a class="btn btn-secondary btn-sm" href="#/vod/my/addons">신청 내역</a>' : '<a class="btn btn-secondary btn-sm" href="#/vod/checkout/' + esc(pid) + '?item=tea">' + X.icx("coffee", "sm") + "TEA TIME 신청</a>") + "</div></section>";
  }
  function extendNote() {
    const X = VX(); if (!X || !me || !me.vodMid) return "";
    const x = vodList().find((v) => v.o && X.canExtend(me.vodMid, v.p.id)); if (!x) return "";
    const e = X.extendOf(x.p);
    return '<div class="callout callout-warn vh-ext">' + icon("clock") + "<div><b>‘" + esc(x.p.title) + "’ 수강 기간이 " + Math.max(0, X.daysLeft(me.vodMid, x.p.id)) + '일 남았어요</b><span>1년 연장권(' + won(e.sale) + ')으로 진도 그대로 이어서 들을 수 있어요. <a href="#/vod/checkout/' + esc(x.p.id) + '?item=extend">연장하기</a></span></div></div>';
  }
  function pageVodHome() {
    const list = vodList(), pc = vodPct(), lv = LV(), X = VX();
    const today = todayStr(), quote = D.quotes && D.quotes.length ? D.quotes[parseDate(today).getDate() % D.quotes.length] : "";
    const notices = (D.notices || []).slice().sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date)).slice(0, 4);
    const main = list.find((x) => vodPctOf(x) < 100) || list[0], nx = main ? vodNext(main) : null;
    const mp = main ? vodPctOf(main) : 0, mLeft = main ? nx.lz.filter((l) => !nx.pr.done[l.id]).reduce((a, l) => a + (Number(l.min) || 0), 0) : 0;
    const hero = main
      ? '<section class="vh2"><a class="vh2-th" href="' + learnHref(main.p.id, nx.cur ? nx.cur.id : "") + '">' + X.thumbArt(main.p) + '<i class="vh2-play">' + icon("play") + "</i></a>" +
          '<div class="vh2-b"><span class="vh2-tag">' + (mp >= 100 ? "수강 완료" : nx.doneN ? "이어서 학습 중" : "학습 시작 전") + (list.length > 1 ? " · 강의 " + list.length + "개" : "") + "</span><h2>" + esc(main.p.title) + '</h2><small class="vh2-cr">' + esc(main.p.creator) + " 강사님</small>" +
            '<div class="vh2-pg"><div class="vh2-pg-t"><b>' + mp + '<em>%</em></b><span>' + nx.doneN + " / " + nx.lz.length + "강 완료" + (mLeft ? " · 남은 시간 약 " + (mLeft >= 60 ? Math.floor(mLeft / 60) + "시간 " + (mLeft % 60 ? (mLeft % 60) + "분" : "") : mLeft + "분") : "") + '</span></div><div class="vh2-bar"><i style="width:' + mp + '%"></i></div></div>' +
            '<p class="vh2-next">' + (nx.cur ? "<small>" + (nx.doneN ? "이어서 볼 강의" : "첫 강의") + "</small><b>" + esc(nx.cur.title) + "</b><span>" + (Number(nx.cur.min) || 0) + "분</span>" : "<small>완강</small><b>모든 강의를 다 봤어요! 필요할 때마다 다시 보세요.</b>") + "</p>" +
            '<div class="vh2-btns"><a class="btn vh2-go" href="' + learnHref(main.p.id, nx.cur ? nx.cur.id : "") + '">' + icon("play", "sm") + (nx.cur ? (nx.doneN ? "이어 보기" : "1강부터 보기") : "다시 보기") + "</a>" +
            '<a class="btn vh2-sub" href="#/vodclass">' + esc(ML("vodclass")) + "</a></div>" + (pc !== mp && list.length > 1 ? '<span class="vh2-all">전체 강의 평균 진도 ' + pc + "%</span>" : "") + "</div></section>"
      : '<section class="card">' + empty("circlePlay", "DOOGO CLASS에 올라간 VOD가 아직 없어요.") + "</section>";
    const sh = (t, sub) => '<div class="vh-sh"><h2>' + t + "</h2>" + (sub ? "<span>" + sub + "</span>" : "") + "</div>";
    return '<div class="page vh-page">' +
      '<header class="page-head greet"><span class="greet-icon lv-' + lv.cur.key + '" title="성장 단계 · ' + esc(lv.cur.name) + '">' + icon(lv.cur.icon, "lg") + "</span><div><h1>" + esc(me.name) + "님, " + greetWord() + "</h1><p>" + esc(quote || "VOD 수강생 전용 공간이에요. 필요할 때마다 들어와 보세요.") + "</p></div></header>" +
      (preview ? '<div class="callout vh-pv">' + icon("eye") + "<div><b>VOD 버전 미리보기</b><span>DOOGO CLASS에서 " + esc(INS.displayName) + " 강사님 VOD를 산 수강생에게 이렇게 보여요. 미리보기라 진도는 0%로 보여요.</span></div></div>" : "") +
      guideBlock() + sh("이어서 학습하기", "멈춘 곳부터 바로 이어 봐요") + hero +
      (list.length > 1 ? sh("다른 강의 " + (list.length - 1) + "개") + '<div class="vh-more">' + list.filter((x) => x !== main).map((x) => { const q = vodPctOf(x); return '<a class="card vh-mini" href="#/vodclass#vc-' + esc(x.p.id) + '"><span class="vh-mini-th">' + X.thumbArt(x.p) + "</span><span class=\"vh-mini-t\"><b>" + esc(x.p.title) + "</b>" + progressBar(q, true) + '<small class="tiny">진도 ' + q + "%</small></span></a>"; }).join("") + "</div>" : "") +
      extendNote() + ((coachCard() + teaCard()) ? sh("강사님과 직접", "1:1 코칭 · TEA TIME") + '<div class="vh-adds">' + coachCard() + teaCard() + "</div>" : "") +
      '<div class="callout vh-note">' + icon("checks") + "<div><b>VOD는 숙제 · 마감이 없어요</b><span>내 속도대로 보고, " + (on("docs") ? '<a href="#/docs">' + esc(ML("docs")) + "</a>로 실제로 해 봤는지 스스로 점검해 보세요." : "필요한 부분은 언제든 다시 보세요.") + "</span></div></div>" +
      (on("notices") ? '<section class="card" style="margin-top:14px"><div class="home-video-head"><h2>' + esc(NT()) + '</h2><a class="link-btn" href="#/notices">더보기 ' + icon("arrowRight", "sm") + "</a></div>" +
          (notices.length ? notices.map((n) => '<a class="list-row" href="#/notices/' + n.id + '">' + (n.pinned ? '<span class="badge badge-ink">필독</span>' : "") + '<span class="lr-title">' + esc(n.title) + "</span>" + newBadge(n) + '<span class="lr-date">' + fmtMD(n.date) + "</span></a>").join("") : '<p class="muted" style="margin:0">아직 소식이 없어요.</p>') +
        "</section>" : "") +
      quickLinks() + "</div>";
  }
  /* ---------------- VOD 강의실 (극장형) ----------------
   * 왼쪽 큰 영상 + 아래 강의 정보 · 강의 노트 · 수업 자료 / 오른쪽 탭 (목차 · 내 노트 · 자료).
   * 노트는 DOOGO CLASS 회원 기록(VOD 데이터 notes)에 강의별로 쌓여요. 탭을 바꾸거나 노트를 저장해도 영상은 다시 불러오지 않아요 */
  let vtTab = "toc", vtFilter = "all", vtQ = "", vtLast = { t: 0, at: 0 };
  const NOTE_TAGS = [["key", "핵심"], ["ask", "궁금한 점"], ["todo", "할 일"]];
  const noteMid = () => (preview || !me.vodMid ? "preview:" + me.id : me.vodMid);
  function noteBook() { const v = VX().V(); v.notes = v.notes || {}; return (v.notes[noteMid()] = v.notes[noteMid()] || {}); }
  const notesAll = (pid) => { const b = noteBook(); return (b[pid] = b[pid] || []); };
  const byTime = (a, b) => ((a.t == null ? 1e9 : a.t) - (b.t == null ? 1e9 : b.t)) || a.at - b.at;
  const notesOf = (pid, lid) => notesAll(pid).filter((n) => !lid || n.lid === lid).sort(byTime);
  const fmtT = (x) => { x = Math.max(0, Math.floor(x || 0)); const h = Math.floor(x / 3600), m = Math.floor(x % 3600 / 60), sec = x % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(sec).padStart(2, "0"); };
  const parseT = (str) => { const p = String(str || "").trim().split(":").map((y) => Number(y)); if (!p.length || p.some((y) => isNaN(y))) return null; return p.reduce((a, y) => a * 60 + y, 0); };
  const hhmm = (ms) => { const d = new Date(ms); return fmtMD(DB.date.toStr(d)) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  function findNote(id) { const b = noteBook(); for (const pid of Object.keys(b)) { const n = (b[pid] || []).find((y) => y.id === id); if (n) return { pid, n }; } return null; }
  const draftKey = (pid, lid) => "vt-draft:" + noteMid() + ":" + pid + ":" + lid;
  const draftGet = (pid, lid) => { try { return sessionStorage.getItem(draftKey(pid, lid)) || ""; } catch (e) { return ""; } };
  const draftSet = (pid, lid, v) => { try { if (v) sessionStorage.setItem(draftKey(pid, lid), v); else sessionStorage.removeItem(draftKey(pid, lid)); } catch (e) {} };
  // 영상 지금 시간: mp4는 바로 읽고, 비메오 · 유튜브는 1초마다 물어본 값을 써요 (못 읽으면 직접 적어요)
  function vtNow() { const v = document.querySelector(".vt-stage video"); if (v) return v.currentTime || 0; return vtLast.at && Date.now() - vtLast.at < 4000 ? vtLast.t : null; }
  function vtSeek(t) {
    const v = document.querySelector(".vt-stage video"); if (v) { v.currentTime = t; if (v.play) v.play().catch(() => {}); return true; }
    const f = document.querySelector(".vt-stage iframe"); if (!f || !f.contentWindow) return false;
    if (/vimeo/.test(f.src)) { f.contentWindow.postMessage(JSON.stringify({ method: "setCurrentTime", value: t }), "*"); f.contentWindow.postMessage(JSON.stringify({ method: "play" }), "*"); return true; }
    if (/youtube/.test(f.src)) { f.contentWindow.postMessage(JSON.stringify({ event: "command", func: "seekTo", args: [t, true] }), "*"); return true; }
    return false;
  }
  function vtWm() { const ph = String(me.phone || me.phone4 || "").replace(/\D/g, "").slice(-4); return (me.name || "수강생") + (ph ? " · " + ph : "") + " · " + (TRACK === "vod" ? "VOD 수강생" : CO ? CO.name : "") + " · " + fmtStamp(Date.now()); }
  // 워터마크: 영상 오른쪽 아래에 고정 (이름 · 휴대폰 뒷자리 · 시각). 화면 가운데를 떠다니면 강의에 집중하기 어려워 움직이는 워터마크는 뺐어요
  function vtWatermark() { return '<div class="vt-wm" aria-hidden="true"><span class="vt-wm-c">' + esc(vtWm()) + "</span></div>"; }
  setInterval(() => { const c = document.querySelector(".vt-wm-c"); if (c) c.textContent = vtWm(); }, 30000);
  function vtVideo(l, t) {
    let h = VX().videoHtml(l, false, "강사님이 영상을 연결하면 여기서 바로 재생돼요 (유튜브 · 비메오 · mp4)");
    // 영상 자체 전체 화면은 끄고(워터마크가 사라지니까), 강의실의 전체 화면 버튼으로 워터마크째 크게 봐요
    h = h.replace(/ allowfullscreen/g, "").replace(/fullscreen; /g, "").replace(/(player\.vimeo\.com\/video\/[^"]+?)(")/, "$1&amp;fullscreen=0$2");
    if (/youtube-nocookie\.com\/embed/.test(h)) h = h.replace(/(embed\/[^"?]+\?rel=0)/, "$1&amp;enablejsapi=1" + (t ? "&amp;start=" + t : ""));
    else if (/player\.vimeo\.com/.test(h) && t) h = h.replace(/(src="https:\/\/player\.vimeo\.com\/video\/[^"]+)"/, '$1#t=' + t + 's"');
    else if (/<video /.test(h) && t) h = h.replace("<video ", '<video data-t="' + t + '" ');
    return h;
  }
  const extOf = (n) => (String(n || "").match(/\.([a-z0-9]{2,5})$/i) || [])[1] || "file";
  function vtFiles(files) {
    return '<ul class="vt-files">' + files.map((f) => { const ext = extOf(f.name).toLowerCase(), has = !!f.url;
      return '<li class="vt-file"><span class="vt-fic e-' + esc(ext) + '">' + esc(ext.toUpperCase()) + '</span><div class="vt-file-t"><b>' + esc(f.name || "수업 자료") + "</b><small>" + esc(ext.toUpperCase()) + (f.size ? " · " + (f.size >= 1024 ? (f.size / 1024).toFixed(1) + "MB" : f.size + "KB") : "") + (has ? "" : " · 강사님이 곧 올려 드려요") + "</small></div>" +
        (has && /^idb:/.test(f.url) ? '<button type="button" class="btn btn-secondary btn-sm vt-fprev" data-action="vt-mat" data-m="view" data-u="' + esc(f.url) + '" data-n="' + esc(f.name || "") + '">' + icon("eye", "xs") + '<span>미리보기</span></button><button type="button" class="btn btn-primary btn-sm" data-action="vt-mat" data-m="dl" data-u="' + esc(f.url) + '" data-n="' + esc(f.name || "") + '">' + icon("download", "xs") + "<span>내려받기</span></button>"
        : has ? '<a class="btn btn-secondary btn-sm vt-fprev" href="' + esc(f.url) + '" target="_blank" rel="noopener">' + icon("eye", "xs") + '<span>미리보기</span></a><a class="btn btn-primary btn-sm" href="' + esc(f.url) + '" download="' + esc(f.name || "") + '" data-action="vt-dl">' + icon("download", "xs") + "<span>내려받기</span></a>" : '<button type="button" class="btn btn-secondary btn-sm" disabled>준비 중</button>') + "</li>"; }).join("") + "</ul>";
  }
  function noteItem(nt, pid, link) {
    const tg = NOTE_TAGS.find((t) => t[0] === nt.tag);
    const tchip = nt.t == null ? "" : link ? '<a class="vt-t" href="' + learnHref(pid, nt.lid) + "?t=" + Math.floor(nt.t) + '">' + icon("play", "xs") + fmtT(nt.t) + "</a>" : '<button type="button" class="vt-t" data-action="vt-seek" data-t="' + Math.floor(nt.t) + '" title="이 장면으로 이동">' + icon("play", "xs") + fmtT(nt.t) + "</button>";
    return '<li class="vt-nt' + (nt.done ? " is-done" : "") + '" data-id="' + esc(nt.id) + '"><div class="vt-nt-h">' + tchip + (tg ? '<span class="vt-tag t-' + tg[0] + '">' + tg[1] + "</span>" : "") + '<span class="vt-nt-d">' + hhmm(nt.upd || nt.at) + "</span>" +
      '<span class="vt-nt-a"><button type="button" data-action="vt-note-edit" data-id="' + esc(nt.id) + '" title="수정" aria-label="노트 수정">' + icon("pen", "xs") + '</button><button type="button" data-action="vt-note-del" data-id="' + esc(nt.id) + '" title="삭제" aria-label="노트 삭제">' + icon("trash", "xs") + "</button></span></div>" +
      (nt.tag === "todo" ? '<label class="vt-todo"><input type="checkbox" data-action="vt-note-todo" data-id="' + esc(nt.id) + '"' + (nt.done ? " checked" : "") + "><span>" + esc(nt.text).replace(/\n/g, "<br>") + "</span></label>" : '<p class="vt-nt-p">' + esc(nt.text).replace(/\n/g, "<br>") + "</p>") +
      (nt.tag === "ask" ? '<button type="button" class="vt-ask' + (nt.asked ? " sent" : "") + '" data-action="vt-note-ask" data-id="' + esc(nt.id) + '">' + icon("message", "xs") + (nt.asked ? "1:1 코칭 질문으로 보냈어요" : "1:1 코칭 질문으로 보내기") + "</button>" : "") + "</li>";
  }
  const noteFilterHtml = (list) => [["all", "전체"]].concat(NOTE_TAGS).map((t) => { const c = t[0] === "all" ? list.length : list.filter((n) => n.tag === t[0]).length; return '<button type="button" class="vt-fchip' + (vtFilter === t[0] ? " on" : "") + '" data-action="vt-filter" data-k="' + t[0] + '">' + t[1] + " <small>" + c + "</small></button>"; }).join("");
  function noteListHtml(pid, lid) {
    const list = notesOf(pid, lid), shown = list.filter((n) => vtFilter === "all" || n.tag === vtFilter);
    return shown.length ? shown.map((n) => noteItem(n, pid, false)).join("") : '<li class="vt-nl-empty">' + icon("pen") + "<b>" + (list.length ? "이 종류의 노트가 없어요" : "이 강의의 첫 노트를 남겨 보세요") + "</b><small>시간을 함께 저장하면 나중에 그 장면으로 바로 돌아갈 수 있어요.</small></li>";
  }
  function vtPaintNotes() {
    const w = document.querySelector(".vt"); if (!w) return render();
    const pid = w.dataset.p, lid = w.dataset.l, list = notesOf(pid, lid);
    const l = document.getElementById("vt-nl"), f = document.getElementById("vt-nf"); if (l) l.innerHTML = noteListHtml(pid, lid); if (f) f.innerHTML = noteFilterHtml(list);
    document.querySelectorAll("[data-ncount]").forEach((e) => { e.textContent = list.length ? String(list.length) : ""; });
    const tl = document.querySelector('.vt-ls.on [data-lnc]'); if (tl) tl.innerHTML = list.length ? icon("pen", "xs") + list.length : "";
  }
  function vtSaveNote() {
    const w = document.querySelector(".vt"); if (!w) return;
    const pid = w.dataset.p, lid = w.dataset.l, ta = document.getElementById("vt-note-text"), tf = document.getElementById("vt-note-t"), txt = ta.value.trim();
    if (!txt) { toast("노트 내용을 적어 주세요.", "warn"); ta.focus(); return; }
    const t = tf.value.trim() ? parseT(tf.value) : null;
    if (tf.value.trim() && t == null) { toast("시간은 3:12처럼 적어 주세요.", "warn"); tf.focus(); return; }
    const tag = (document.querySelector('input[name="vt-tag"]:checked') || {}).value || "";
    notesAll(pid).push({ id: DB.uid("nt"), lid, t, tag, text: txt.slice(0, 2000), at: Date.now() });
    VX().save(); ta.value = ""; tf.value = ""; draftSet(pid, lid, ""); vtFilter = "all";
    vtPaintNotes(); toast("노트를 저장했어요.");
  }
  function notesText(pid) {
    let out = me.name + "님의 강의 노트 · " + todayStr() + "\n";
    vodList().filter((x) => pid === "all" || x.p.id === pid).forEach((x) => {
      const ns = notesAll(x.p.id); if (!ns.length) return;
      out += "\n■ " + x.p.title + " (" + x.p.creator + ")\n";
      VX().lessons(x.p).forEach((l) => { const ln = ns.filter((n) => n.lid === l.id).sort(byTime); if (!ln.length) return; out += "\n  ▶ " + l.title + "\n"; ln.forEach((n) => { const tg = NOTE_TAGS.find((t) => t[0] === n.tag); out += "    " + (n.t != null ? "[" + fmtT(n.t) + "] " : "") + (tg ? "(" + tg[1] + ") " : "") + (n.tag === "todo" ? (n.done ? "☑ " : "☐ ") : "") + n.text.replace(/\n/g, "\n      ") + "\n"; }); });
    });
    return out;
  }
  function vtAfter() {
    const v = document.querySelector(".vt-stage video[data-t]"); if (v) v.addEventListener("loadedmetadata", () => { v.currentTime = Number(v.dataset.t) || 0; }, { once: true });
    const ta = document.getElementById("vt-note-text"); if (ta && vtTab === "note" && window.matchMedia("(min-width: 1101px)").matches) ta.focus({ preventScroll: true });
  }
  // 두잉고 강의실 안의 VOD 재생 화면 (진도는 DOOGO CLASS와 같은 기록에 쌓인다)
  function pageVodPlay(pid, lid, tq) {
    const X = VX(), x = vodList().find((v) => v.p.id === pid);
    if (!x) { const ext = me && me.vodMid && X.canExtend && X.canExtend(me.vodMid, pid);
      return '<div class="page">' + pageHead(ML("vodclass"), "") + '<section class="card">' + empty("lock", ext ? "수강 기간이 끝난 강의예요. 1년 연장권을 사면 진도 · 노트 그대로 다시 들을 수 있어요." : "볼 수 있는 강의가 아니에요. 수강 기간이 끝났거나 구매하지 않은 강의예요.") + '<div class="btn-row">' + (ext ? '<a class="btn btn-primary" href="#/vod/checkout/' + esc(pid) + '?item=extend">' + icon("refresh", "sm") + "1년 연장하기</a>" : "") + '<a class="btn btn-secondary" href="#/vodclass">' + icon("arrowLeft", "sm") + "VOD 강의 목록</a></div></section></div>"; }
    const n = vodNext(x), lz = n.lz, mid = x.o && me.vodMid ? me.vodMid : "";
    const cur = lz.find((l) => l.id === lid) || lz.find((l) => l.id === n.pr.last) || n.cur || lz[0];
    if (!cur) return '<div class="page">' + pageHead(x.p.title, "") + '<section class="card">' + empty("circlePlay", "아직 올라온 강의가 없어요.") + "</section></div>";
    if (mid) X.markLast(mid, pid, cur.id);
    const i = lz.indexOf(cur), prev = lz[i - 1], next = lz[i + 1], done = !!n.pr.done[cur.id], pc = vodPctOf(x), ch = X.chapOf(x.p, cur).ch || {}, fl = cur.files || [], ns = notesOf(pid, cur.id);
    const withFiles = lz.filter((l) => (l.files || []).length), nFiles = withFiles.reduce((a, l) => a + l.files.length, 0), tab = ["toc", "note", "files"].indexOf(vtTab) >= 0 ? vtTab : "toc";
    vtLast = { t: 0, at: 0 };
    const tabs = '<div class="vt-tabs" role="tablist">' + [["toc", "목차", n.doneN + "/" + lz.length], ["note", "내 노트", ns.length ? String(ns.length) : ""], ["files", "자료", nFiles ? String(nFiles) : ""]].map((t) => '<button type="button" role="tab" class="' + (tab === t[0] ? "on" : "") + '" data-action="vt-tab" data-k="' + t[0] + '">' + t[1] + "<small" + (t[0] === "note" ? " data-ncount" : "") + ">" + t[2] + "</small></button>").join("") + "</div>";
    const toc = (x.p.curriculum || []).map((c, ci) => '<div class="vt-sch"><p class="vt-sch-h"><span>' + String(ci + 1).padStart(2, "0") + "</span>" + esc(c.title) + "</p>" + (c.lessons || []).map((l) => { const d = !!n.pr.done[l.id], on = l.id === cur.id, nc = notesOf(pid, l.id).length;
      return '<a href="' + learnHref(pid, l.id) + '" class="vt-ls' + (on ? " on" : "") + (d ? " done" : "") + '"><i>' + (d ? icon("check", "xs") : on ? icon("play", "xs") : "") + "</i><span>" + esc(l.title) + '</span><em><span data-lnc>' + (nc ? icon("pen", "xs") + nc : "") + "</span>" + ((l.files || []).length ? icon("paperclip", "xs") : "") + "</em><small>" + (Number(l.min) || 0) + "분</small></a>"; }).join("") + "</div>").join("");
    const notePane = '<div class="vt-nn"><div class="vt-tags" role="radiogroup" aria-label="노트 종류">' + NOTE_TAGS.map((t, k) => '<label class="vt-tagr t-' + t[0] + '"><input type="radio" name="vt-tag" value="' + t[0] + '"' + (k === 0 ? " checked" : "") + "><span>" + t[1] + "</span></label>").join("") + "</div>" +
      '<textarea class="textarea vt-ta" id="vt-note-text" rows="4" maxlength="2000" placeholder="강의를 들으며 기억할 내용 · 궁금한 점 · 할 일을 적어 보세요 (Ctrl + Enter 저장)">' + esc(draftGet(pid, cur.id)) + "</textarea>" +
      '<div class="vt-nn-f"><label class="vt-tc" title="영상 시간 · 비우면 시간 없이 저장">' + icon("clock", "xs") + '<input id="vt-note-t" inputmode="numeric" autocomplete="off" placeholder="0:00" aria-label="영상 시간"></label><button type="button" class="link-btn vt-now" data-action="vt-now">지금 시간</button><button type="button" class="btn btn-primary btn-sm vt-save" data-action="vt-note-save">' + icon("check", "sm") + "저장</button></div></div>" +
      '<div class="vt-nf" id="vt-nf">' + noteFilterHtml(ns) + '</div><ul class="vt-nl" id="vt-nl">' + noteListHtml(pid, cur.id) + "</ul>" +
      '<div class="vt-nfoot"><a href="#/vodclass/notes">' + icon("book", "xs") + '전체 노트 보기</a><button type="button" data-action="vt-note-dl" data-p="' + esc(pid) + '">' + icon("download", "xs") + "이 강의 노트 내려받기</button></div>";
    const filePane = withFiles.length ? withFiles.map((l) => '<div class="vt-fg"><a class="vt-fg-h' + (l.id === cur.id ? " on" : "") + '" href="' + learnHref(pid, l.id) + '">' + icon("circlePlay", "xs") + esc(l.title) + "</a>" + vtFiles(l.files) + "</div>").join("") : '<p class="vt-empty">이 강의에는 아직 수업 자료가 없어요.</p>';
    const leftMin = lz.filter((l) => !n.pr.done[l.id]).reduce((a, l) => a + (Number(l.min) || 0), 0), allDone = lz.length > 0 && n.doneN >= lz.length;
    const progCard = allDone
      ? '<div class="vt-fin"><span class="vt-fin-ic">' + icon("award", "lg") + '</span><small>COURSE COMPLETE</small><b>강의를 모두 들었어요!</b><p>' + esc(x.p.title) + " · " + lz.length + "강 완강. 끝까지 해낸 " + esc(me.name || "") + "님, 정말 멋져요.</p>" +
          '<div class="vt-fin-a"><a class="btn btn-primary btn-sm" href="#/vod/my/reviews">' + icon("star", "sm") + "수강 후기 남기기</a><a class=\"btn btn-secondary btn-sm\" href=\"" + learnHref(pid, lz[0].id) + "\">처음부터 다시 보기</a></div></div>"
      : '<div class="vt-prog"><div class="vt-prog-h"><b>내 진도</b><span>' + n.doneN + " / " + lz.length + "강</span></div>" + '<div class="vt-prog-bar"><i style="width:' + pc + '%"></i></div>' +
          '<div class="vt-prog-n"><span><b>' + pc + "%</b> 완료</span><span>남은 시간 약 " + (leftMin >= 60 ? Math.floor(leftMin / 60) + "시간 " + (leftMin % 60 ? (leftMin % 60) + "분" : "") : leftMin + "분") + "</span></div>" +
          (next ? '<a class="vt-prog-next" href="' + learnHref(pid, next.id) + '"><small>다음 강의</small><b>' + esc(next.title) + "</b>" + icon("chevRight", "xs") + "</a>" : "") + "</div>";
    return '<div class="vt' + (allDone ? " is-fin" : "") + '" data-p="' + esc(pid) + '" data-l="' + esc(cur.id) + '">' +
      '<div class="vt-bar"><a class="vt-back" href="#/vodclass">' + icon("arrowLeft", "sm") + "<span>" + esc(ML("vodclass")) + '</span></a><div class="vt-tt"><small>' + esc(x.p.creator) + " · " + (i + 1) + " / " + lz.length + "강</small><b>" + esc(x.p.title) + '</b></div><div class="vt-pc" title="전체 진도"><span class="vt-pcbar"><i style="width:' + pc + '%"></i></span><b>' + pc + "%</b></div>" + opsKkBtn("vt-kk") + "</div>" +
      '<div class="vt-grid"><div class="vt-main"><div class="vt-stage" id="vt-stage">' + vtVideo(cur, tq) + vtWatermark() + '<button type="button" class="vt-fs" data-action="vt-fs" aria-label="전체 화면">' + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>' + "</button></div>" +
        '<section class="vt-info"><div class="vt-info-h"><div class="vt-info-t"><small class="vt-ch">' + esc(ch.title || "") + "</small><h1>" + esc(cur.title) + '</h1><span class="vt-meta">' + (Number(cur.min) || 0) + "분 · " + (i + 1) + " / " + lz.length + "강" + (fl.length ? " · 수업 자료 " + fl.length + "개" : "") + "</span></div>" +
          '<button type="button" class="vt-memo" data-action="vt-tab" data-k="note">' + icon("pen", "sm") + "메모하기<b data-ncount>" + (ns.length || "") + "</b></button></div>" +
          (done ? '<div class="vt-donebar">' + icon("check", "sm") + "<b>이 강의를 다 들었어요</b><span>" + esc(fmtStamp(Date.now())).split(" ")[0] + " 기준 · 진도에 반영됐어요</span></div>" : "") +
          '<div class="vt-btns">' + (done ? '<span class="vp-done">' + icon("check", "sm") + "완료한 강의</span>" : preview ? '<span class="vp-done off">' + icon("eye", "sm") + "미리보기라 완료 기록은 남지 않아요</span>" : '<button type="button" class="btn btn-primary" data-action="vod-done" data-p="' + esc(pid) + '" data-l="' + esc(cur.id) + '">' + icon("check", "sm") + (next ? "완료하고 다음 강의" : "완료하기") + "</button>") +
            // 이전 · 다음은 늘 한 쌍으로 (없는 쪽은 흐리게) — 모바일에서도 줄이 흐트러지지 않게
            '<div class="vt-nav">' + (prev ? '<a class="btn btn-secondary" href="' + learnHref(pid, prev.id) + '">' + icon("chevLeft", "sm") + "이전 강의</a>" : '<span class="btn btn-secondary is-off" aria-disabled="true">' + icon("chevLeft", "sm") + "이전 강의</span>") + (next ? '<a class="btn btn-secondary" href="' + learnHref(pid, next.id) + '">다음 강의 ' + icon("chevRight", "sm") + "</a>" : '<span class="btn btn-secondary is-off" aria-disabled="true">다음 강의 ' + icon("chevRight", "sm") + "</span>") + "</div>" +
            (on("bot") ? '<button type="button" class="btn btn-tertiary vt-bot" data-action="bot-open">' + icon("bot", "sm") + esc(D.brand.botName) + "에게 묻기</button>" : "") + "</div>" +
          (cur.desc ? '<div class="vt-sec"><h2>' + icon("book", "sm") + "강의 노트</h2><p>" + esc(cur.desc).replace(/\n/g, "<br>") + "</p></div>" : "") +
          '<div class="vt-sec"><h2>' + icon("paperclip", "sm") + "수업 자료" + (fl.length ? " <small>" + fl.length + "</small>" : "") + "</h2>" + (fl.length ? vtFiles(fl) : '<p class="vt-empty">이 강의에는 수업 자료가 없어요. 다른 강의 자료는 ‘자료’ 탭에서 모아 볼 수 있어요.</p>') + "</div>" +
        "</section></div>" +
        '<aside class="vt-side">' + tabs + '<div class="vt-pane' + (tab === "toc" ? " on" : "") + '" data-pane="toc">' + toc + progCard + '</div><div class="vt-pane' + (tab === "note" ? " on" : "") + '" data-pane="note">' + notePane + '</div><div class="vt-pane' + (tab === "files" ? " on" : "") + '" data-pane="files">' + filePane + "</div></aside>" +
      "</div></div>";
  }
  // 내 노트: 모든 VOD 강의 노트를 한 곳에서 (검색 · 종류 · 내려받기 · 인쇄)
  function pageVodNotes() {
    const list = vodList(), q = vtQ.trim().toLowerCase();
    const all = list.reduce((a, x) => a.concat(notesAll(x.p.id)), []);
    const groups = list.map((x) => ({ x, ns: notesAll(x.p.id).filter((nt) => (vtFilter === "all" || nt.tag === vtFilter) && (!q || nt.text.toLowerCase().indexOf(q) >= 0)) })).filter((g) => g.ns.length);
    return '<div class="page vn">' + pageHead("내 노트", "강의를 들으며 남긴 노트를 한 곳에서 봐요. 시간을 누르면 그 장면부터 다시 재생돼요.") +
      '<section class="card vn-bar"><div class="search">' + icon("search") + '<input class="input" id="vn-q" type="search" placeholder="노트 검색 (예: 통관, 프롬프트)" value="' + esc(vtQ) + '" aria-label="노트 검색"></div>' +
        '<div class="vn-row"><div class="vt-nf">' + noteFilterHtml(all) + '</div><div class="vn-acts"><button type="button" class="btn btn-secondary btn-sm" data-action="vt-note-dl" data-p="all">' + icon("download", "sm") + '내려받기</button><button type="button" class="btn btn-secondary btn-sm" data-action="vt-note-copy">' + icon("file", "sm") + '복사</button><button type="button" class="btn btn-secondary btn-sm" data-action="vt-print">' + icon("download", "sm") + "PDF로 저장</button></div></div></section>" +
      (groups.length ? groups.map((g) => { const lz = VX().lessons(g.x.p);
        return '<section class="card vn-c"><div class="vn-c-h"><span class="vn-th">' + VX().thumbArt(g.x.p) + "</span><div><small>" + esc(g.x.p.creator) + "</small><h2>" + esc(g.x.p.title) + '</h2><span class="tiny">노트 ' + g.ns.length + "개</span></div></div>" +
          lz.filter((l) => g.ns.some((nt) => nt.lid === l.id)).map((l) => '<div class="vn-l"><a class="vn-l-h" href="' + learnHref(g.x.p.id, l.id) + '">' + icon("circlePlay", "xs") + esc(l.title) + '</a><ul class="vt-nl">' + g.ns.filter((nt) => nt.lid === l.id).sort(byTime).map((nt) => noteItem(nt, g.x.p.id, true)).join("") + "</ul></div>").join("") + "</section>"; }).join("")
        : '<section class="card">' + empty("pen", q || vtFilter !== "all" ? "조건에 맞는 노트가 없어요." : "아직 남긴 노트가 없어요. 강의실에서 영상을 보며 ‘메모하기’를 눌러 보세요.") + "</section>") + "</div>";
  }
  function pageVodClass(r) {
    if (r && r.parts && r.parts[1] === "notes") return pageVodNotes();
    if (r && r.parts && r.parts[1]) return pageVodPlay(decodeURIComponent(r.parts[1]), r.parts[2] ? decodeURIComponent(r.parts[2]) : "", Number(r.params.get("t")) || 0);
    const list = vodList(), X = VX();
    const head = pageHead(ML("vodclass"), "DOOGO CLASS에서 구매한 " + esc(INS.displayName) + " 강사님의 VOD예요. 강의를 누르면 이 강의실에서 바로 재생되고, 진도는 DOOGO CLASS 마이페이지에도 똑같이 반영돼요.");
    const exp = me && me.vodMid && X.canExtend ? X.products().filter((p) => p.iid === INS.id && !list.some((v) => v.p.id === p.id) && X.canExtend(me.vodMid, p.id)) : [];
    const expBox = exp.length ? '<section class="card vc-exp"><div class="section-head"><h2>' + icon("clock", "sm") + " 기간이 끝난 강의</h2></div>" + exp.map((p) => '<div class="vc-exp-row"><span class="vc-th">' + X.thumbArt(p) + "</span><div><b>" + esc(p.title) + '</b><small>진도 · 노트는 그대로 남아 있어요</small></div><a class="btn btn-primary btn-sm" href="#/vod/checkout/' + esc(p.id) + '?item=extend">' + icon("refresh", "sm") + "1년 연장하기</a></div>").join("") + "</section>" : "";
    if (!list.length) return '<div class="page">' + head + (expBox || '<section class="card">' + empty("circlePlay", "볼 수 있는 VOD가 없어요.") + "</section>") + "</div>";
    return '<div class="page">' + head + list.map((x) => {
      const n = vodNext(x), pc = vodPctOf(x);
      return '<section class="card vc-card" id="vc-' + esc(x.p.id) + '"><div class="vc-head"><span class="vc-th">' + X.thumbArt(x.p) + '</span><div class="vc-meta"><small>' + esc(x.p.creator) + " · 강의 " + n.lz.length + "개 · " + esc(X.durTxt(X.totalMin(x.p))) + "</small><h2>" + esc(x.p.title) + "</h2>" + progressBar(pc, true) +
          '<p class="tiny">진도율 <b>' + pc + "%</b> · " + n.doneN + " / " + n.lz.length + "강 · " + esc(vodExp(x)) + "</p>" +
          '<a class="btn btn-primary btn-sm" href="' + learnHref(x.p.id, n.cur ? n.cur.id : "") + '">' + icon("play", "sm") + (n.cur ? (n.doneN ? "이어 보기" : "1강부터 보기") : "다시 보기") + "</a></div></div>" +
        (x.p.curriculum || []).map((c) => { const ls = c.lessons || [], dn = ls.filter((l) => n.pr.done[l.id]).length;
          return '<div class="vc-ch"><h3>' + esc(c.title) + "<small>" + dn + " / " + ls.length + "</small></h3><ol>" + ls.map((l) => {
            const dd = !!n.pr.done[l.id], now = n.cur && n.cur.id === l.id;
            return '<li class="' + (dd ? "done" : "") + (now ? " now" : "") + '"><a href="' + learnHref(x.p.id, l.id) + '"><i>' + (dd ? icon("check", "xs") : icon("play", "xs")) + "</i><span>" + esc(l.title) + (now ? '<em class="vc-now">' + (n.doneN ? "이어 보기" : "여기부터") + "</em>" : "") + "</span>" +
              ((l.files || []).length ? '<small class="vc-att">' + icon("paperclip", "xs") + (l.files || []).length + "</small>" : "") + "<small>" + (Number(l.min) || 0) + "분</small></a></li>";
          }).join("") + "</ol></div>"; }).join("") +
        "</section>";
    }).join("") + '<p class="tiny vc-foot">' + icon("store", "xs") + ' 구매 내역 · 영수증 · 다른 강의는 <a href="#/vod/my/classes">DOOGO CLASS 내 강의실</a>에서 볼 수 있어요.</p></div>';
  }

  /* ---------------- 커리큘럼 ---------------- */
  // 커리큘럼: 주차마다 강의일 · 핵심 목표 · 강의 내용 · 과제(필수 · 도전 · 마인드)를 한 장에. 강의 영상은 있으면 아래에 덧붙인다
  /* 메인 강의 (외부 강의 플랫폼 · 예: 아이비클래스): 강사센터 › 기본 정보에서 링크 · 버튼 이름을 바꾼다 */
  const mainLec = () => { const m = TRACK !== "vod" && D.brand && D.brand.mainLec; return m && m.on ? m : null; };
  const mainBtn = (url, cls, text) => { const m = mainLec(); if (!m) return ""; const u = url || m.url;
    return u ? '<a class="btn ' + (cls || "btn-primary") + ' ml-btn" href="' + esc(u) + '" target="_blank" rel="noopener">' + icon("arrowUpRight", "sm") + esc(text || m.label || "메인 강의 들으러 가기") + "</a>" : '<span class="btn ' + (cls || "btn-primary") + ' ml-btn is-off" aria-disabled="true">' + icon("clock", "sm") + "링크 준비 중</span>"; };
  function mainLecCard(compact) {
    const m = mainLec(); if (!m) return "";
    return '<section class="card ml-card' + (compact ? " sm" : "") + '"><span class="ml-ic">' + icon("monitorPlay") + '</span><div class="ml-t"><small>메인 강의' + (m.platform ? " · " + esc(m.platform) : "") + "</small><b>" + (m.platform ? esc(m.platform) + "에서 메인 강의를 들어요" : "메인 강의는 외부 강의실에서 들어요") + "</b>" + (m.note && !compact ? "<p>" + esc(m.note) + "</p>" : "") + "</div>" + mainBtn() + "</section>";
  }
  const lessonWord = () => (D.brand && D.brand.lessonLabel) || "강의 영상";
  function pageCurriculum(r) {
    if (r.parts[1]) return pageLesson(r.parts[1]);
    const cur = D.weeks.find((w) => isOpen(w) && todayStr() <= deadlineOf(w)) || D.weeks.filter(isOpen).slice(-1)[0];
    return '<div class="page">' + pageHead(ML("curriculum"), mainLec() ? "메인 강의는 " + (mainLec().platform || "외부 강의실") + "에서 듣고, 여기서는 주차마다 " + lessonWord() + "을 보며 과제를 바로 따라 해요." : "주차마다 무엇을 배우고 어떤 과제를 하는지 순서대로 정리했어요.") +
      mainLecCard(true) +
      (D.weeks.length ? '<div class="cw-list">' + D.weeks.map((w) => curWeekCard(w, cur === w)).join("") + "</div>"
        : '<section class="card">' + empty("book", "커리큘럼을 준비하고 있어요.") + "</section>") + "</div>";
  }
  function curWeekCard(w, now) {
    const open = isOpen(w), st = weekStats(w);
    const lectureDay = DB.classDate(CO, w.no);
    const head = '<div class="cw-head"><div class="cw-head-main">' +
        '<p class="cw-date">' + icon("calendar", "xs") + "강의일 · " + fmtMD(lectureDay) + (now ? '<span class="cw-now">이번 주</span>' : "") + "</p>" +
        "<h2>" + w.no + "주차 · " + esc(w.title) + "</h2>" + (w.subtitle || w.summary ? '<p class="cw-sub">' + esc(w.subtitle || w.summary) + "</p>" : "") + "</div>" +
        ((open && on("missions") && w.missions.length) || (open && mainLec()) ? '<div class="cw-acts">' + (open && mainLec() ? mainBtn(w.mainUrl, "btn-secondary", "메인 강의") : "") + (open && on("missions") && w.missions.length ? '<a class="btn btn-primary cw-go" href="#/missions/' + w.no + '">과제 보러 가기 ' + icon("arrowRight", "sm") + "</a>" : "") + "</div>" : "") + "</div>";
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
      (w.howto ? '<div class="cw-sec cw-howto"><h3>' + icon("checks", "sm") + "이번 주 진행 방법</h3>" + DB.rich(w.howto) + "</div>" : "") +
      (w.lessons.length ? '<details class="cw-lessons"' + " open" + '><summary>' + icon("play", "sm") + esc(lessonWord()) + " " + w.lessons.length + '개 <span class="tiny">' + watched + "개 시청 완료</span>" + icon("chevDown", "sm") + "</summary>" +
        w.lessons.map((l) => '<a class="lesson" href="#/curriculum/' + l.id + '">' + thumb(l) + '<div><div class="lesson-title">' + esc(l.title) + '</div><div class="lesson-desc">' + esc(l.desc) + "</div></div>" +
          (P.watched[l.id] ? '<span class="badge badge-positive">' + icon("check", "xs") + "시청 완료</span>" : '<span class="tiny">' + (l.minutes ? esc(l.minutes) + "분" : "") + "</span>") + "</a>").join("") + "</details>" : "") +
      ((w.topics || []).length ? '<div class="cw-sec"><h3>' + (mainLec() ? "메인 강의에서 다루는 내용" : "강의 내용") + '</h3><ul class="cw-topics">' + w.topics.map((t) => "<li>" + esc(t) + "</li>").join("") + "</ul></div>" : "") +
      (w.missions.length ? '<div class="cw-sec"><div class="cw-sec-head"><h3>과제</h3><span class="cw-period">' + icon("clock", "xs") + "과제 제출 기간 · " + fmtMD(openOf(w)) + " ~ " + fmtMD(deadlineOf(w)) + "</span>" +
          '<span class="cw-progress">' + st.done + "/" + st.total + " 완료</span></div>" +
        '<div class="cw-mgrid">' + groups + "</div></div>" : "") +

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
    return '<div class="page">' + pageHead(l.title, w.no + "주차 · " + w.title + (l.minutes ? " · " + l.minutes + "분" : ""), crumb([[ML("curriculum"), "#/curriculum"], [w.no + "주차", "#/curriculum"], [l.title]])) +
      '<section class="card">' + video(l) +
        (l.desc ? '<div class="lesson-body">' + DB.rich(l.desc) + "</div>" : "") + attachmentList(l.attachments) +
        '<div class="guide-actions" style="margin-top:20px">' +
          '<button class="btn ' + (done ? "btn-secondary" : "btn-primary") + '" data-action="toggle-watched" data-id="' + id + '">' + icon("check", "sm") + (done ? "시청 완료됨 · 취소" : "시청 완료로 표시") + "</button>" +
          (on("missions") ? '<a class="btn btn-tertiary" href="#/missions/' + w.no + '">' + w.no + "주차 과제 보기</a>" : "") +
        "</div></section>" +
      '<section class="card" style="margin-top:14px"><div class="home-video-head"><h2>' + icon("pen") + '내 메모</h2><span class="tiny" id="note-state">' + ((P.notes || {})[id] ? "저장됨" : "적으면 자동으로 저장돼요") + "</span></div>" +
        '<textarea class="textarea" id="lesson-note" data-id="' + esc(id) + '" rows="5" placeholder="강의를 보며 기억할 내용, 궁금한 점을 적어 두세요. 나만 볼 수 있어요.">' + esc((P.notes || {})[id] || "") + "</textarea></section>" +
      pager(prev && isOpen(prev.w) ? { href: "#/curriculum/" + prev.id, label: "이전 강의", title: prev.title } : null,
        next && isOpen(next.w) ? { href: "#/curriculum/" + next.id, label: "다음 강의", title: next.title } : null) +
      "</div>";
  }

  /* ---------------- 과제 ---------------- */
  function pageMissions(r) {
    const [, weekNo, missionId] = r.parts;
    if (missionId) return pageMissionDetail(weekNo, missionId);
    if (weekNo) return pageWeek(weekNo);
    const kind = DB.MISSION_KINDS.find((k) => k.key === r.params.get("kind"));
    if (kind) return pageMissionKind(kind);
    const o = overallStats();
    return '<div class="page">' + pageHead(ML("missions"), "주차를 고르고 과제를 내면 자동 검수 결과가 바로 나와요.") +
      '<section class="card overall"><div class="overall-top"><span>전체 진행률</span>' + pctText(o.pct) + "</div>" + progressBar(o.pct) +
        '<span class="tiny" style="color:var(--body)">전체 ' + o.total + "개 중 " + o.done + "개 완료</span></section>" +
      '<div class="section-head"><h2>주차 선택</h2><span class="hint">주차를 눌러 과제를 확인하세요</span></div>' +
      '<div class="grid-2">' + D.weeks.map(weekCard).join("") + "</div></div>";
  }
  // 종류별 모아 보기 (홈 ‘과제 전체 진행률’에서 들어옴)
  function pageMissionKind(k) {
    const st = overallStats().kinds[k.key];
    const tabs = '<div class="utabs" role="tablist">' + DB.MISSION_KINDS.map((x) => '<a role="tab" href="#/missions?kind=' + x.key + '" class="' + (x === k ? "on" : "") + '" aria-selected="' + (x === k) + '">' + x.label + "</a>").join("") + "</div>";
    const groups = D.weeks.map((w) => {
      const list = w.missions.filter((m) => DB.missionKind(m) === k.key);
      if (!list.length) return "";
      if (!isOpen(w)) return '<div class="section-head"><h2>' + w.no + "주차 · " + esc(w.title) + '</h2><span class="hint">' + icon("lock", "xs") + " " + fmtMD(openOf(w)) + " 공개 · " + list.length + "개</span></div>";
      return '<div class="section-head"><h2>' + w.no + "주차 · " + esc(w.title) + '</h2><span class="hint">마감 ' + fmtMD(deadlineOf(w)) + "</span></div>" + list.map((m) => missionCard(w, m)).join("");
    }).join("");
    return '<div class="page">' + pageHead(k.label, k.hint + " · " + st.done + " / " + st.total + " 완료", crumb([[ML("missions"), "#/missions"], [k.label]])) + tabs +
      '<section class="card overall" style="margin-top:14px"><div class="overall-top"><span>' + k.label + " 진행률</span>" + pctText(st.total ? Math.round(st.done / st.total * 100) : 0) + "</div>" + progressBar(st.total ? Math.round(st.done / st.total * 100) : 0) + "</section>" +
      (groups || '<section class="card" style="margin-top:14px">' + empty("checks", "이 종류의 과제가 아직 없어요.") + "</section>") + "</div>";
  }
  function missionRow(w, m) {
    const s = missionState(m.id);
    const typeLabel = { image: "사진 인증", link: "링크 제출", text: "글 작성" }[m.type] || "";
    return '<a class="mission" href="#/missions/' + w.no + "/" + m.id + '"><span class="m-check ' + (s === "done" ? "done" : s === "fix" ? "fix" : "") + '">' +
      (s === "done" ? icon("check", "sm") : s === "fix" ? "!" : icon(m.type === "image" ? "image" : m.type === "link" ? "link" : "pen", "sm")) + "</span>" +
      '<div style="min-width:0"><div class="m-title">' + esc(m.title) + " " + stateBadge(m.id) + '</div><div class="m-desc">' + typeLabel + " · " + esc(m.desc) + "</div></div>" + icon("chevRight") + "</a>";
  }
  function weekCard(w) {
    const st = weekStats(w), open = isOpen(w);
    const nm = open ? nextMission(w) : null;
    const top = '<div class="wk-top"><span class="wk-icon">' + icon("book") + '</span><div><div class="wk-title">' + w.no + '주차</div><div class="wk-meta">' + kindCount(st) + " · " + st.done + "/" + st.total + " 완료</div></div>" + pctText(st.pct) + "</div>";
    if (!open) return '<div class="week-card locked">' + top + progressBar(0, true) + '<div class="wk-foot"><span class="lock-msg">' + icon("lock", "sm") + fmtMD(openOf(w)) + "부터 과제 제출이 공개됩니다.</span></div></div>";
    return '<a class="week-card" href="#/missions/' + w.no + '">' + top + progressBar(st.pct, true) +
      '<div class="wk-foot"><span>' + (nm ? "<b>다음:</b> " + esc(nm.title) : "<b>모든 과제 완료!</b>") + '</span><span class="link-btn">열기 ' + icon("arrowRight", "sm") + "</span></div></a>";
  }
  // 주차 과제: 과제 양식 내려받기 + 과제 유형(전체·필수·도전·마인드) · 진행 상태(전체·미제출·보완 필요·체크 완료) 탭
  let wkFilter = { kind: "all", state: "all" };
  const STATE_TABS = [["all", "전체"], ["todo", "미제출"], ["fix", "보완 필요"], ["done", "체크 완료"]];
  const typeText = (m) => ({ image: "사진 · PDF 업로드", link: "링크 제출", text: "글 작성" }[m.type] || "") + (m.check && m.check.minLength ? " · 최소 " + m.check.minLength + "자" : "");
  const tplBtns = (m) => (m.templates || []).map((f) => '<a class="tpl-btn" href="' + esc(f.data || f.url || "#") + '"' + (f.data ? ' download="' + esc(f.name) + '"' : ' target="_blank" rel="noopener"') + ">" + icon("download", "xs") + "과제 양식 다운로드</a>").join("");
  function missionCard(w, m) {
    const s = missionState(m.id), k = kindOf(m), left = daysUntil(deadlineOf(w));
    const stLabel = { done: "체크 완료", fix: "보완 필요", todo: "미제출" }[s];
    return '<article class="mcard st-' + s + '"><span class="mcard-ic">' + icon(m.type === "image" ? "image" : m.type === "link" ? "link" : "pen", "sm") + "</span>" +
      '<div class="mcard-main"><div class="mcard-tags"><span class="kbadge ' + k.key + '">' + k.short + "</span>" +
        (s !== "done" && left >= 0 ? '<span class="mcard-d">' + icon("clock", "xs") + (left === 0 ? "오늘 마감" : "D-" + left) + "</span>" : "") + '<span class="mcard-due' + (left < 0 && s !== "done" ? " late" : "") + '">마감 ' + fmtMD(deadlineOf(w)) + (left < 0 && s !== "done" ? " (지남)" : "") + "</span></div>" +
        '<h3><a href="#/missions/' + w.no + "/" + m.id + '">' + esc(m.title) + "</a></h3>" +
        (m.desc ? '<p class="mcard-desc">' + esc(m.desc) + "</p>" : "") +
        '<p class="mcard-type">제출 방식: ' + typeText(m) + "</p>" + ((m.templates || []).length ? '<div class="mcard-tpl">' + tplBtns(m) + "</div>" : "") + "</div>" +
      '<span class="mcard-state ' + s + '">' + (s === "done" ? icon("check", "xs") : "") + stLabel + "</span>" +
      '<a class="btn ' + (s === "done" ? "btn-secondary" : "btn-primary") + ' btn-sm mcard-go" href="#/missions/' + w.no + "/" + m.id + '">' + (s === "done" ? "제출 내용 보기" : s === "fix" ? "다시 제출" : "과제 제출") + "</a></article>";
  }
  function pageWeek(no) {
    const w = findWeek(no);
    if (!w) return notFound();
    if (!isOpen(w)) return lockedPage(w);
    const st = weekStats(w);
    const late = todayStr() > deadlineOf(w);
    const f = wkFilter;
    const byKind = w.missions.filter((m) => f.kind === "all" || DB.missionKind(m) === f.kind);
    const shown = byKind.filter((m) => f.state === "all" || missionState(m.id) === f.state);
    const chip = (grp, key, label, n) => '<button type="button" class="fchip' + (f[grp] === key ? " on" : "") + '" data-action="wk-filter" data-grp="' + grp + '" data-k="' + key + '" aria-pressed="' + (f[grp] === key) + '">' + label + ' <span class="fnum">' + n + "</span></button>";
    const tpls = w.missions.filter((m) => (m.templates || []).length);
    return '<div class="page">' + pageHead(w.no + "주차 · " + w.title, w.summary, crumb([[ML("missions"), "#/missions"], [w.no + "주차"]])) +
      '<section class="card overall"><div class="overall-top"><span>' + w.no + "주차 진행률</span>" + pctText(st.pct) + "</div>" + progressBar(st.pct) +
        '<span class="tiny" style="color:var(--body)">' + kindCount(st) + " · " + st.total + "개 중 " + st.done + "개 완료 · " + fmtMD(openOf(w)) + " 공개 · <b" + (late ? ' style="color:var(--negative)"' : "") + ">" + fmtMD(deadlineOf(w)) + " 마감" + (late ? " (지남)" : "") + "</b></span></section>" +
      (w.no === 1 && on("docs") ? '<a class="card help-banner plain-link" href="#/docs"><span class="hb-ic">' + icon("clipboard") + '</span><span><b>서류 발급이 어렵다면?</b><span class="tiny">' + esc(ML("docs")) + '에서 단계별로 화면과 함께 안내해 드려요.</span></span>' + icon("chevRight") + "</a>" : "") +
      (on("showcase") && (D.showcase || []).some((x) => Number(x.week) === w.no) ? '<a class="card help-banner sc-banner plain-link" href="#/showcase?w=' + w.no + '"><span class="hb-ic">' + icon("trophy") + '</span><span><b>' + w.no + "주차 모범 과제 보기</b><span class=\"tiny\">" + esc(D.brand.instructor) + "님이 고른 잘한 예시를 먼저 보고 시작해 보세요.</span></span>" + icon("chevRight") + "</a>" : "") +
      (tpls.length ? '<section class="card tpl-box"><div class="home-video-head"><h2>' + icon("fileSheet") + '이 주차 과제 양식 <span class="tiny">' + tpls.length + '개</span></h2></div><p class="tiny" style="margin:-6px 0 10px">양식을 내려받아 엑셀에서 채운 뒤, 해당 과제에서 올려 주세요.</p>' +
        tpls.map((m) => m.templates.map((t) => '<a class="tpl-row" href="' + esc(t.data || t.url || "#") + '"' + (t.data ? ' download="' + esc(t.name) + '"' : ' target="_blank" rel="noopener"') + '><span class="tpl-ic">' + icon("download", "sm") + '</span><span class="tpl-txt"><b>' + esc(m.title) + "</b><small>" + esc(t.name) + "</small></span></a>").join("")).join("") + "</section>" : "") +
      '<div class="ffilters"><p class="ff-label">과제 유형</p><div class="fchips">' + chip("kind", "all", "전체", w.missions.length) + DB.MISSION_KINDS.map((k) => chip("kind", k.key, k.label, w.missions.filter((m) => DB.missionKind(m) === k.key).length)).join("") + "</div>" +
        '<p class="ff-label">진행 상태</p><div class="fchips">' + STATE_TABS.map((t) => chip("state", t[0], t[1], t[0] === "all" ? byKind.length : byKind.filter((m) => missionState(m.id) === t[0]).length)).join("") + "</div></div>" +
      DB.MISSION_KINDS.map((k) => {
        const list = shown.filter((m) => DB.missionKind(m) === k.key);
        return list.length ? '<div class="section-head"><h2>' + k.label + ' <span class="tiny">' + list.length + '개</span></h2><span class="hint">' + k.hint + "</span></div>" + list.map((m) => missionCard(w, m)).join("") : "";
      }).join("") +
      (!w.missions.length ? '<section class="card" style="margin-top:14px">' + empty("checks", "이번 주차 과제를 준비하고 있어요.") + "</section>"
        : !shown.length ? '<section class="card" style="margin-top:14px">' + empty("checks", "조건에 맞는 과제가 없어요.") + "</section>" : "") +
      "</div>";
  }
  function pageMissionDetail(no, id) {
    const w = findWeek(no);
    const m = w && w.missions.find((x) => x.id === id);
    if (!m) return notFound();
    if (!isOpen(w)) return lockedPage(w);
    if (draft.missionId !== id) draft = { missionId: id, files: [] };
    const subs = P.submissions[id] || [], lastS = subs[subs.length - 1];
    if (lastS && lastS.review && lastS.review.status !== "approved" && (lastS.review.at || 1) > (lastS.revSeenAt || 0)) { lastS.revSeenAt = Date.now(); saveProgress(); setTimeout(() => renderSidebar(route()), 0); }
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

    return '<div class="page">' + pageHead(m.title, "", crumb([[ML("missions"), "#/missions"], [w.no + "주차", "#/missions/" + w.no], [m.title]])) +
      '<div class="detail-grid">' +
        '<section class="card">' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">' + (m.required ? '<span class="badge badge-ink">필수</span>' : '<span class="badge badge-neutral">' + kindOf(m).short + "</span>") + '<span class="badge badge-neutral">' + typeLabel + "</span>" +
            '<span class="badge ' + (late ? "badge-negative" : "badge-neutral") + '">' + fmtMD(deadlineOf(w)) + " 마감" + (late ? " 지남" : "") + "</span>" + stateBadge(id) + "</div>" +
          '<p style="margin:0 0 20px;font-size:16px;line-height:1.75">' + esc(m.desc) + "</p>" +
          ((m.steps || []).length ? '<p class="side-label">이렇게 하세요</p><ol class="steps">' + m.steps.map((s) => "<li>" + esc(s) + "</li>").join("") + "</ol>" : "") +
          ((m.templates || []).length ? '<div class="mcard-tpl" style="margin-top:14px">' + tplBtns(m) + "</div>" : "") +
          '<hr style="border:0;border-top:1px solid var(--line-soft);margin:24px 0">' +
          form + '<div id="result">' + (last ? resultBox(last) : "") + "</div>" +
        "</section>" +
        '<aside class="stack">' +
          '<div class="card"><p class="side-label">자동검수 기준</p><ul class="history">' + (checkCriteria(m).map((t) => "<li><span>" + esc(t) + "</span></li>").join("") || "<li><span>제출하면 바로 통과</span></li>") + "</ul></div>" +
          '<div class="card"><p class="side-label">제출 이력</p>' + history + "</div>" + lastFiles +
          (on("showcase") && showcaseOf(m.id).length ? '<a class="card sc-hint plain-link" href="#/showcase?w=' + w.no + '"><span class="sc-hint-ic">' + icon("trophy", "sm") + "</span><span><b>모범 과제 " + showcaseOf(m.id).length + "개 보기</b><small>" + esc(D.brand.instructor) + "님이 고른 잘한 예시</small></span>" + icon("chevRight", "sm") + "</a>" : "") +
          (on("bot") ? '<div class="card ask-card"><p class="ask-t">' + icon("bot", "sm") + "어디서 막혔나요?</p><p class=\"tiny\">" + esc(D.brand.botName) + "가 이 과제 진행 방법을 단계별로 알려 드려요.</p>" +
            '<button class="btn btn-primary btn-sm btn-block" data-action="ask-bot" data-q="' + esc(m.title + " 어떻게 해요?") + '">' + icon("bot", "sm") + "이 과제 물어보기</button></div>" : "") +
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
    const CT = DB.calTypes(INS.id), used = CT.concat(Object.keys(T).filter((k) => CT.indexOf(k) < 0 && evs.some((e) => e.type === k))), L = (t) => DB.evLabel(INS.id, t);
    return '<div class="page">' + pageHead(ML("schedule"), "강의가 열리는 날, 과제 마감, 라이브 시간을 달력 한 장으로 챙겨요.") +
      '<section class="card cal-card"><div class="cal-head"><h2>' + y + "년 " + (m + 1) + "월</h2>" +
        '<div class="cal-nav"><button class="icon-btn ghost" data-action="cal-move" data-d="-1" aria-label="이전 달">' + icon("chevLeft") + '</button><button class="btn btn-tertiary btn-sm" data-action="cal-today">오늘</button><button class="icon-btn ghost" data-action="cal-move" data-d="1" aria-label="다음 달">' + icon("chevRight") + "</button></div></div>" +
        '<div class="cal">' + DOW.map((d, i) => '<div class="cal-dow' + (i === 0 ? " sun" : "") + '">' + d + "</div>").join("") +
          cells.map((k) => {
            const d = parseDate(k);
            const list = byDate[k] || [];
            const types = list.map((e) => e.type).filter((t, i, a) => a.indexOf(t) === i), main = types.indexOf("open") >= 0;
            // 강의(오프라인 강의) 날은 점이 아니라 칸 전체를 강사 색으로 칠해 한눈에 보이게
            return '<button type="button" class="cal-day' + (main ? " main" : "") + (d.getMonth() !== m ? " other" : "") + (k === today ? " today" : "") + (k === calSel ? " sel" : "") + (d.getDay() === 0 ? " sun" : "") +
              '" data-action="cal-pick" data-date="' + k + '" aria-label="' + esc(fmtKo(k) + (main ? " " + L("open") : "") + (list.length ? " 일정 " + list.length + "건" : "")) + '"><span class="d">' + d.getDate() + "</span>" + (main ? '<span class="cal-tag">' + esc(DB.calShort(INS.id)) + "</span>" : "") + '<span class="dots">' +
              types.filter((t) => t !== "open").slice(0, 4).map((t) => '<i class="ev-dot ' + t + '"></i>').join("") + "</span></button>";
          }).join("") +
        "</div>" +
        '<div class="legend">' + used.map((k) => '<span>' + (k === "open" ? '<i class="cal-sw"></i>' : '<i class="ev-dot ' + k + '"></i>') + esc(L(k)) + "</span>").join("") + "</div>" +
      "</section>" +
      '<section class="card" style="margin-top:14px"><div class="home-video-head"><h2>' + fmtKo(calSel) + '</h2><span class="tiny">' + sel.length + "건</span></div>" +
        (sel.length ? '<div class="stack">' + sel.map((e) =>
          '<div class="ev-card"><i class="ev-dot ' + e.type + '"></i><div style="flex:1;min-width:0"><div class="tiny">' + esc(L(e.type)) + (e.week ? " · " + e.week + "주차" : "") + (e.time && e.type !== "open" ? " · " + esc(e.time) : "") + '</div><div class="ev-title">' + esc(e.title) + "</div></div>" +
          (e.url && e.date >= today ? liveBtn(e, true) : "") +
          (e.type === "replay" && e.date <= today ? (mainLec() ? '<span class="ev-acts">' + mainBtn("", "btn-secondary btn-sm", (mainLec().platform || "메인 강의실") + "에서 녹화본 보기") + "</span>" : on("replays") ? '<span class="ev-acts"><a class="btn btn-secondary btn-sm" href="#/replays">' + icon("play", "sm") + esc(ML("replays")) + "</a></span>" : "") : "") +
          ((e.type === "open" || e.type === "deadline") && e.week && findWeek(e.week) ? '<span class="ev-acts">' + (on("curriculum") ? '<a class="btn btn-secondary btn-sm" href="#/curriculum">' + icon("book", "sm") + esc(ML("curriculum")) + " 보기</a>" : "") +
            (on("missions") ? '<a class="btn btn-primary btn-sm" href="#/missions/' + e.week + '">' + icon("checks", "sm") + (e.type === "open" ? "과제 보기" : "과제 제출하기") + "</a>" : "") + "</span>" : "") + "</div>").join("") + "</div>"
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
      return '<div class="page">' + pageHead(NT(), "", crumb([[NT(), "#/notices"], ["상세"]])) +
        '<article class="card article">' + (n.pinned ? '<span class="badge badge-ink" style="margin-bottom:10px">필독</span>' : "") + "<h2>" + esc(n.title) + '</h2><div class="meta">' + esc(D.brand.instructor) + " · " + fmtFull(n.date) + "</div>" + noticeBody(n) + "</article>" +
        '<div style="margin-top:14px"><a class="btn btn-secondary" href="#/notices">' + icon("chevLeft", "sm") + "목록으로</a></div></div>";
    }
    return '<div class="page">' + pageHead(NT(), "공지사항은 여기서 봐요. " + D.brand.instructor + "님이 전하는 수업 안내 · 새 소식 · 영상이 올라와요.") +
      '<section class="card">' + (list.length ? list.map((n) =>
        '<a class="notice-row" href="#/notices/' + n.id + '">' + (n.pinned ? '<span class="badge badge-ink">' + icon("pin", "xs") + "필독</span>" : '<span class="badge badge-neutral">공지</span>') +
        '<span class="lr-title">' + esc(n.title) + "</span>" + ((n.images || []).length ? '<span class="n-ic" title="사진 ' + n.images.length + '장">' + icon("image", "xs") + "</span>" : "") + (noticeVideos(n).length ? '<span class="n-ic" title="영상">' + icon("play", "xs") + "</span>" : "") + newBadge(n) + '<span class="lr-date">' + fmtFull(n.date) + "</span></a>").join("") : empty("megaphone", "아직 공지가 없어요.")) + "</section>" +
      (unreadNotices() ? '<div style="margin-top:12px;text-align:right"><button class="link-btn" data-action="read-all">모두 읽음으로 표시</button></div>' : "") + "</div>";
  }

  // 공지 본문: 글 → (본문에 [사진1] 자리가 있으면 그 자리에) 사진 → 유튜브 영상
  // 클래스 소식 = 공지사항: 메뉴 이름에 ‘공지’가 없으면 ‘· 공지사항’을 붙여 수강생이 한눈에 알게
  const NT = () => { const l = ML("notices"); return /공지/.test(l) ? l : l + " · 공지사항"; };
  // 공지 영상: 유튜브 · 비메오 링크 여러 개 (예전 youtubeId 하나도 그대로)
  const noticeVideos = (n) => (n.videos && n.videos.length ? n.videos : n.youtubeId ? [n.youtubeId] : []);
  function vimeoSrc(u) {
    const s = String(u || ""), m = s.match(/vimeo\.com\/(?:video\/|channels\/[\w-]+\/|groups\/[\w-]+\/videos\/|manage\/videos\/)?(\d+)(?:\/([0-9a-f]{6,}))?/i); if (!m) return "";
    const h = m[2] || (s.match(/[?&]h=([0-9a-f]+)/i) || [])[1];
    return "https://player.vimeo.com/video/" + m[1] + "?" + (h ? "h=" + h + "&" : "") + "title=0&byline=0&portrait=0&dnt=1";
  }
  function noticeBody(n) {
    const imgs = n.images || [], used = {};
    const fig = (im) => '<figure class="n-img"><img src="' + esc(im.data || im.url) + '" alt="' + esc(im.name || "") + '" loading="lazy"></figure>';
    const body = DB.rich(n.body, { token: (i) => { const im = imgs[i - 1]; if (!im) return ""; used[i - 1] = true; return fig(im); } });
    const rest = imgs.filter((_, i) => !used[i]);
    const vids = noticeVideos(n).map((u) => { const yid = DB.youtubeId(u), vm = vimeoSrc(u);
      return yid ? '<div class="n-video">' + video({ title: n.title, youtubeId: yid }) + "</div>" : vm ? '<div class="n-video"><div class="video"><iframe src="' + esc(vm) + '" title="' + esc(n.title) + '" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div></div>' : ""; }).join("");
    return '<div class="body">' + body + (rest.length ? '<div class="n-imgs">' + rest.map(fig).join("") + "</div>" : "") + vids + "</div>";
  }

  /* ---------------- Q&A ---------------- */
  // 자주 묻는 질문(분류·검색) + 요청사항(프로그램 오류·불편 신고 게시판, 모두 비공개, 사진 첨부)
  let faqCat = "전체";
  let reqDraft = [];
  const qnaTabs = (on) => '<div class="utabs" role="tablist">' +
    '<a role="tab" href="#/qna" class="' + (on === "faq" ? "on" : "") + '" aria-selected="' + (on === "faq") + '">' + icon("search", "xs") + "FAQ 검색</a>" +
    '<a role="tab" href="#/qna/requests" class="' + (on === "req" ? "on" : "") + '" aria-selected="' + (on === "req") + '">' + icon("message", "xs") + (TRACK === "vod" ? "1:1 코칭 질문" : "1:1 요청") + "</a></div>";
  function pageQna(r) {
    if (TRACK === "vod" && (r.parts[1] === "requests" || r.params.get("tab") === "request") && !(coachN() > 0 || (r.parts[2] !== "new" && myCoachQs().length))) { history.replaceState(null, "", "#/qna"); r = route(); }
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
    return '<div class="page">' + (TRACK === "vod" ? pageHead(ML("qna"), "많이 나오는 질문과 답을 먼저 찾아보세요. 강사에게 직접 묻고 싶다면 1:1 코칭권으로 질문할 수 있어요.") + (coachN() || myCoachQs().length ? qnaTabs("faq") : "") + coachCard(true) : pageHead(ML("qna"), "검색 한 번으로 답을 찾고, 화면 오류나 불편한 점은 1:1 요청으로 바로 알려 주세요.") + qnaTabs("faq")) +
      '<section class="card"><div class="search">' + icon("search") + '<input class="input" id="faq-search" type="search" placeholder="궁금한 내용을 검색해 보세요 (예: 통관, 마진, 로그인)" aria-label="자주 묻는 질문 검색"></div>' +
        '<div class="faq-cats" role="tablist">' + cats.map((c) => '<button type="button" class="chip' + (c === faqCat ? " on" : "") + '" data-action="faq-cat" data-cat="' + esc(c) + '">' + esc(c) + ' <span>' + (c === "전체" ? D.faqs.length : D.faqs.filter((f) => (f.category || "기타") === c).length) + "</span></button>").join("") + "</div>" +
        '<div id="faq-list">' + faqList("") + "</div></section>" +
      '<p class="tiny" style="margin-top:12px">' + (TRACK === "vod" ? "원하는 답이 없다면 " + esc(D.brand.botName) + "에게 물어보거나 1:1 코칭 질문을 남겨 주세요. 결제 · 환불 · 계정 문의는 " + '<a href="#/vod/my/help">DOOGO CLASS 고객센터</a>로 남겨 주세요.' : "원하는 답이 없다면 " + esc(D.brand.botName) + "에게 물어보거나 라이브 시간에 질문해 주세요.") + "</p></div>";
  }
  function faqList(q) {
    const t = q.trim().toLowerCase();
    const list = D.faqs.filter((f) => (faqCat === "전체" || (f.category || "기타") === faqCat) && (!t || (f.q + f.a + (f.tags || []).join(" ")).toLowerCase().indexOf(t) !== -1));
    if (!list.length) return '<div class="empty">' + icon("search") + '<div>검색 결과가 없어요.</div></div>';
    return list.map((f) => '<details class="faq"><summary><span class="q">Q</span><span><small class="faq-cat">' + esc(f.category || "기타") + "</small>" + esc(f.q) + "</span>" + icon("chevDown", "sm chev") + '</summary><div class="a">' + esc(f.a) + "</div></details>").join("");
  }
  const myRequests = () => DB.requests(INS.id, preview ? me : null).filter((x) => !DB.isVodStudent(x.s) || (me && x.s.id === me.id));
  function pageRequests() {
    const vod = TRACK === "vod", list = vod ? myCoachQs() : myRequests(), n = vod ? coachN() : 0, cp = vod ? addPid("coachOf") : "";
    return '<div class="page">' + pageHead(ML("qna"), vod ? "강사님께 남긴 1:1 코칭 질문이에요. 질문 1개에 코칭권 1회가 차감돼요." : "화면 오류나 불편한 점을 남기면 강사님이 직접 확인하고 답해 드려요.") + qnaTabs("req") +
      '<div class="req-bar"><span class="muted">총 <b>' + list.length + "</b>건의 " + (vod ? "코칭 질문" + (n ? " · 남은 코칭 <b>" + n + "회</b>" : "") : "1:1 요청") + "</span>" + (vod && !n ? (cp ? '<a class="btn btn-primary" href="#/vod/checkout/' + esc(cp) + '?item=coach">' + icon("message", "sm") + "코칭권 사기</a>" : "") : '<a class="btn btn-primary" href="#/qna/requests/new">' + icon("pen", "sm") + (vod ? "질문 남기기" : "요청 남기기") + "</a>") + "</div>" +
      '<div class="callout callout-ok req-note">' + icon("lock", "sm") + "<div>" + (vod ? "코칭 질문은 <b>비공개</b>예요. 나와 강사님만 볼 수 있어요." + (n ? " 코칭권은 " + esc(coachEnd()) + "까지 쓸 수 있어요." : "") : "모든 1:1 요청은 <b>비공개</b>예요. 작성자와 강사님만 볼 수 있어요. 수업 내용 질문은 라이브 시간이나 " + esc(D.brand.botName) + "에게 물어보면 더 빨라요.") + "</div></div>" +
      '<section class="card req-card">' + (list.length
        ? '<table class="req-table"><thead><tr><th class="c-no">번호</th><th class="c-st">상태</th><th>제목</th><th class="c-au">작성자</th><th class="c-dt">작성일</th><th class="c-an">답변</th></tr></thead><tbody>' +
          list.map((x) => {
            const mine = x.s.id === me.id;
            return '<tr class="' + (mine ? "mine" : "") + '" data-action="req-open" data-id="' + esc(x.q.id) + '" data-mine="' + (mine ? 1 : 0) + '" tabindex="0">' +
              '<td class="c-no num">' + x.no + '</td><td class="c-st">' + (x.q.answer ? '<span class="badge badge-positive">답변완료</span>' : '<span class="badge badge-neutral">답변대기</span>') + "</td>" +
              '<td class="c-title">' + (mine ? '<b>' + esc(x.q.title) + "</b>" + ((x.q.images || []).length ? icon("paperclip", "xs") : "") + '<span class="badge badge-ink mine-tag">내 글</span>' : '<span class="locked">' + icon("lock", "xs") + "(비공개)</span>") + (x.q.answer ? '<span class="re">RE</span>' : "") + "</td>" +
              '<td class="c-au">' + esc(mine ? me.name : DB.maskName(x.s.name)) + '</td><td class="c-dt num">' + DB.date.toStr(new Date(x.q.at)) + '</td><td class="c-an num">' + (x.q.answer ? "1" : "—") + "</td></tr>";
          }).join("") + "</tbody></table>"
        : empty("message", vod ? "아직 남긴 코칭 질문이 없어요." : "아직 남긴 1:1 요청이 없어요.")) + "</section></div>";
  }
  const COACH_CATS = ["강의 내용 질문", "내 사업에 적용", "자료 · 실습", "기타"];
  /** 강의실 노트의 ‘1:1 코칭 질문으로 보내기’ → 질문 쓰기 화면에 내용을 채워 둬요 (질문을 등록하면 노트에 표시) */
  const vtAskGet = () => { try { return JSON.parse(sessionStorage.getItem("vt-ask") || "null"); } catch (e) { return null; } };
  function vtAskDone(qid) { const a = vtAskGet(); try { sessionStorage.removeItem("vt-ask"); } catch (e) {} if (!a || !a.nid) return; const f = findNote(a.nid); if (f) { f.n.asked = qid; VX().save(); } }
  function pageRequestNew() {
    const vod = TRACK === "vod", n = vod ? coachN() : 0, cats = vod ? COACH_CATS : DB.REQUEST_CATEGORIES, ask = vod ? vtAskGet() : null;
    return '<div class="page">' + pageHead(ML("qna"), vod ? "강의를 보다 막힌 부분, 내 사업에 적용하는 방법을 강사님께 직접 물어보세요." : "화면 오류나 불편한 점을 남기면 강사님이 직접 확인하고 답해 드려요.") + qnaTabs("req") +
      '<a class="back-link" href="#/qna/requests">' + icon("arrowLeft", "sm") + (vod ? "코칭 질문 목록" : "1:1 요청 목록") + "</a>" +
      '<section class="card"><h2 class="card-title">' + (vod ? "1:1 코칭 질문 남기기" + (n ? ' <span class="badge badge-ink">남은 ' + n + "회</span>" : "") : "1:1 요청 남기기") + '</h2><p class="tiny" style="margin:0 0 18px">' + (vod ? "어떤 강의를 보다가, 지금 내 상황이 어떤지, 무엇이 궁금한지 적어 주시면 더 정확하게 답해 드려요." : "어떤 화면에서 무엇을 눌렀을 때 어떤 문제가 생겼는지 적고, 스크린샷을 함께 올려 주시면 더 빨리 고칠 수 있어요.") + "</p>" +
        '<form id="request-form" class="stack" novalidate>' +
          '<div class="field"><span class="field-label">분류</span><div class="req-cats">' + cats.map((c, i) => '<label class="chip-radio"><input type="radio" name="category" value="' + esc(c) + '"' + (i === 0 ? " checked" : "") + "><span>" + esc(c) + "</span></label>").join("") + "</div></div>" +
          '<div class="field"><label for="q-title">제목</label><input class="input" id="q-title" name="title" maxlength="80" placeholder="' + (vod ? "예: 공급처에 샘플을 요청할 때 단가도 같이 물어봐도 될까요?" : "예: 과제 사진을 올려도 제출 버튼이 안 눌려요") + '" value="' + esc(ask ? ask.title : "") + '"></div>' +
          '<div class="field"><label for="q-body">내용</label><textarea class="textarea" id="q-body" name="body" rows="7" placeholder="' + (vod ? "1. 어떤 강의를 보다가 (예: 3강 공급처 연락하기)\n2. 지금 내 상황 (예: 스마트스토어 월 매출 300만 원, 건기식 판매 중)\n3. 궁금한 점 (구체적일수록 답이 정확해져요)" : "1. 어느 화면에서 (예: 과제 제출하기 > 1주차 > 사업자등록증 발급)\n2. 무엇을 했을 때 (예: 사진을 고르고 제출 버튼을 눌렀을 때)\n3. 어떤 문제가 (예: 아무 반응이 없어요)\n4. 사용 기기 (예: 아이폰 사파리)") + '">' + esc(ask ? ask.body : "") + "</textarea></div>" +
          '<div class="field"><span class="field-label">' + (vod ? "사진 · 캡처 첨부" : "스크린샷 첨부") + ' <span class="tiny">(최대 3장)</span></span>' +
            '<label class="dropzone small" id="req-drop"><input type="file" id="req-file" accept="image/*" multiple class="sr-only">' + icon("image") + "<strong>" + (vod ? "사진을 끌어다 놓거나 눌러서 선택" : "스크린샷을 끌어다 놓거나 눌러서 선택") + "</strong><span class=\"tiny\">휴대폰은 화면을 캡처한 뒤 사진 앨범에서 고르면 돼요</span></label>" +
            '<div class="thumbs" id="req-thumbs">' + reqThumbs() + "</div></div>" +
          '<div class="callout callout-ok">' + icon("lock", "sm") + "<div>" + (vod ? "비공개로 등록돼요. 등록하면 <b>코칭권 1회가 차감</b>돼요" + (n ? " (남은 " + n + "회 → " + (n - 1) + "회)" : "") + ". 강사님 답변이 달리면 이 화면에서 바로 확인할 수 있어요." : "비공개로 등록돼요. 작성자와 강사님만 볼 수 있어요.") + "</div></div>" +
          '<div class="req-actions"><a class="btn btn-secondary" href="#/qna/requests">취소</a><button class="btn btn-primary" type="submit">' + icon("send", "sm") + (vod ? "질문 등록하기" : "등록하기") + "</button></div>" +
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
      return '<div class="page">' + pageHead(ML("qna"), "") + qnaTabs("req") + '<section class="card empty">' + icon("lock") + '<p style="font-size:18px;font-weight:800;color:var(--ink);margin:0 0 6px">비공개 글이에요</p><p style="margin:0 0 18px">1:1 요청은 작성자와 강사님만 볼 수 있어요.</p><a class="btn btn-primary" href="#/qna/requests">목록으로</a></section></div>';
    }
    const q = x.q;
    const myQ = x.s.id === me.id && (P.questions || []).find((y) => y.id === q.id);
    if (myQ && myQ.answer && (myQ.answeredAt || 1) > (myQ.seenAt || 0)) { myQ.seenAt = Date.now(); saveProgress(); setTimeout(() => renderSidebar(route()), 0); }
    const d = new Date(q.at);
    const vq = TRACK === "vod";
    return '<div class="page">' + pageHead(ML("qna"), vq ? "남긴 코칭 질문과 강사님 답변을 확인해요." : "남긴 요청과 강사님 답변을 확인해요.") + qnaTabs("req") +
      '<a class="back-link" href="#/qna/requests">' + icon("arrowLeft", "sm") + (vq ? "1:1 코칭 목록" : "1:1 요청 목록") + "</a>" +
      '<article class="card req-detail"><div class="req-detail-top">' + (q.answer ? '<span class="badge badge-positive">답변완료</span>' : '<span class="badge badge-neutral">답변대기</span>') + '<span class="badge badge-neutral">' + esc(q.category || "기타") + '</span><span class="badge badge-neutral">' + icon("lock", "xs") + "비공개</span><span class=\"req-no\">#" + x.no + "</span></div>" +
        "<h2>" + esc(q.title) + '</h2><div class="meta">' + esc(me.name) + " · " + DB.date.toStr(d) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") + "</div>" +
        '<div class="body">' + esc(q.body) + "</div>" +
        ((q.images || []).length ? '<div class="req-shots">' + q.images.map((im) => '<a href="' + im.data + '" target="_blank" rel="noopener"><img src="' + im.data + '" alt="' + esc(im.name) + '"></a>').join("") + "</div>" : "") +
      "</article>" +
      '<div class="section-head"><h2>강사 답변</h2></div>' +
      (q.answer
        ? '<section class="card req-answer"><div class="req-answer-top"><b>' + esc(D.brand.instructor) + " · 운영자</b><span>" + (q.answeredAt ? DB.date.toStr(new Date(q.answeredAt)) + " " + String(new Date(q.answeredAt).getHours()).padStart(2, "0") + ":" + String(new Date(q.answeredAt).getMinutes()).padStart(2, "0") : "") + '</span></div><div class="body">' + esc(q.answer) + "</div></section>"
        : '<section class="card empty">' + icon("clock") + "<div>강사님이 확인하고 있어요. 답변이 달리면 여기에 바로 보여요.</div>" + (preview ? "" : '<button type="button" class="btn btn-secondary btn-sm" data-action="req-cancel" data-id="' + esc(q.id) + '">' + (vq && q.coach ? "질문 취소하고 코칭권 돌려받기" : "요청 취소하기") + "</button>") + "</section>") +
      "</div>";
  }

  /* ---------------- 서류 준비 가이드 ---------------- */
  function pageDocs() {
    const G = D.docsGuide;
    const done = G.filter((g) => P.docs[g.id]).length;
    const pct = G.length ? Math.round((done / G.length) * 100) : 0;
    return '<div class="page">' + pageHead(ML("docs"), "판매를 시작하기 전에 챙길 서류와 준비 단계를 하나씩 체크해요.") +
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
  // 받침 있는 말이면 a, 없으면 b (예: 조교 → 예요 · 봇 → 이에요)
  const josa = (w, a, b) => { const c = String(w || "").trim().slice(-1).charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? a : b; };
  // 바로 물어볼 질문: 켜진 메뉴 · 올라온 내용에 맞춰 바뀐다
  function botChips() {
    if (TRACK === "vod") {
      const v = ["내 진도 알려줘", "수업 자료는 어디서 받아요?", "강사님께 직접 물어보고 싶어요", "수강 기간이 언제까지예요?"];
      if (on("glossary") && (D.glossary || [])[0]) v.push("‘" + D.glossary[0].term + "’ 뜻이 뭐예요?");
      return v;
    }
    const out = ["이번 주 과제 마감은?", "내 진도 알려줘", "다음 라이브 언제예요?"];
    if (on("replays")) out.push("지난 라이브 다시 볼래요");
    if (on("glossary") && (D.glossary || [])[0]) out.push("‘" + D.glossary[0].term + "’ 뜻이 뭐예요?");
    if (on("certificate")) out.push("수료하려면 뭘 해야 해요?");
    if (DB.libOn(MID(), "file") && (D.resources.file || []).some((x) => x.tool === "calculator")) out.push("마진 계산은 어떻게 해요?");
    return out.slice(0, 6);
  }
  const botGreeting = () => ({ from: "bot", text: me.name + "님, 반가워요! 저는 " + D.brand.instructor + "님의 강의 자료를 공부한 " + D.brand.botName + josa(D.brand.botName, "이에요", "예요") + ".\n과제 방법 · 서류 · 일정 · 내 진도까지, 막히는 건 뭐든 물어보세요. 밤에도 바로 답해 드려요." });
  // AI 조교 얼굴: 강사 사진이 있으면 사진, 없으면 로봇 아이콘
  const botFace = (size) => '<span class="bot-face' + (size ? " " + size : "") + '">' + (D.brand.photo ? '<img src="' + esc(D.brand.photo) + '" alt="">' : icon("bot", "sm")) + "</span>";
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
  // VOD 버전: 숙제 · 마감 · 라이브 · 수료증이 없는 대신 진도 · 수업 자료 · 수강 기간 · 1:1 코칭 · TEA TIME
  function askBotVod(t) {
    const l = vodList(), n = coachN();
    if (/^(안녕|hi|hello|하이|ㅎㅇ)/i.test(t)) return { text: me.name + "님 안녕하세요! 강의 내용 · 수업 자료 · 수강 기간 · 1:1 코칭, 무엇이든 물어보세요." };
    if (/(마감|숙제|과제|수료)/.test(t)) return { text: "VOD 클래스에는 숙제 · 마감 · 수료 조건이 없어요. 내 속도로 강의를 듣고, 끝까지 들으면 DOOGO CLASS에 ‘수강 완료’ 배지가 생겨요." + (on("docs") ? "\n실제로 해 볼 단계는 ‘" + ML("docs") + "’에서 하나씩 체크해 보세요." : ""), links: [[ML("vodclass"), "#/vodclass"]].concat(on("docs") ? [[ML("docs"), "#/docs"]] : []) };
    if (/(진도|진행률|몇\s*강|얼마나|어디까지)/.test(t)) {
      if (!l.length) return { text: "아직 열린 VOD가 없어요.", links: [["DOOGO CLASS", "#/vod"]] };
      return { text: l.map((x) => { const nx = vodNext(x); return "‘" + x.p.title + "’ " + vodPctOf(x) + "% (" + nx.doneN + " / " + nx.lz.length + "강)" + (nx.cur ? " · 다음: " + nx.cur.title : " · 다 들었어요!"); }).join("\n"), links: l.slice(0, 2).map((x) => { const nx = vodNext(x); return [nx.cur ? "이어 보기" : "다시 보기", learnHref(x.p.id, nx.cur ? nx.cur.id : "")]; }) };
    }
    if (/(자료|pdf|다운|교안|파일)/i.test(t)) return { text: "수업 자료는 강의 영상 아래 ‘수업 자료’나 오른쪽(휴대폰은 아래) ‘자료’ 탭에서 미리보기 · 내려받기를 할 수 있어요." + (on("library") ? " 모든 강의의 자료는 ‘" + ML("library") + "’에도 모여 있어요." : ""), links: [[ML("vodclass"), "#/vodclass"]].concat(on("library") ? [[ML("library"), "#/library"]] : []) };
    if (/(기간|언제까지|만료|연장)/.test(t)) return { text: l.length ? l.map((x) => "‘" + x.p.title + "’ · " + vodExp(x)).join("\n") + "\n기간이 30일 이내로 남으면 DOOGO CLASS 내 강의실에서 1년 연장권으로 진도 그대로 더 들을 수 있어요." : "열린 VOD가 없어요.", links: [["DOOGO CLASS 내 강의실", "#/vod/my/classes"]] };
    if (/(강사|직접|코칭|질문|물어|상담|티타임|tea|만나)/i.test(t)) return { text: n > 0 ? "1:1 코칭권이 " + n + "회 남았어요. 질문을 남기면 강사님이 직접 답해 드려요." + (coachEnd() ? " (" + coachEnd() + "까지)" : "") : "강사님께 직접 물어보려면 DOOGO CLASS에서 1:1 코칭권을 사면 돼요. 강사님과 직접 만나는 TEA TIME도 있어요.", links: n > 0 ? [["코칭 질문 남기기", "#/qna/requests/new"]] : [["코칭권 · TEA TIME 보기", "#/qna"]] };
    if (/(라이브|일정|강의\s*일정)/.test(t)) return { text: "VOD 클래스는 정해진 라이브 일정이 없어요. 원할 때 언제든 들으면 돼요. 강사님과 직접 이야기하고 싶다면 TEA TIME을 신청해 보세요.", links: [[ML("vodclass"), "#/vodclass"]] };
    return null;
  }
  function askBot(q) {
    const t = q.replace(/\s+/g, " ").trim();
    const today = todayStr();
    if (TRACK === "vod") { const vr = askBotVod(t); if (vr) return vr; }
    if (/^(안녕|hi|hello|하이|ㅎㅇ)/i.test(t)) return { text: me.name + "님 안녕하세요! 과제, 서류, 일정 무엇이든 물어보세요." };
    if (/(마감|언제까지)/.test(t)) {
      const w = D.weeks.find((x) => isOpen(x) && deadlineOf(x) >= today) || D.weeks.find((x) => !isOpen(x));
      return w ? { text: w.no + "주차 과제 마감은 " + fmtMD(deadlineOf(w)) + "입니다. 마감이 지나도 제출은 할 수 있지만 수료 전까지 필수 과제를 모두 통과해야 해요.", links: [[w.no + "주차 과제", "#/missions/" + w.no]] } : { text: "모든 주차의 마감이 지났어요. 남은 필수 과제를 확인해 보세요.", links: [[ML("certificate"), "#/certificate"]] };
    }
    if (on("replays") && /(다시\s*보기|다시\s*볼|놓쳤|지난\s*라이브|녹화|replay)/i.test(t)) {
      const list = replaysSorted().slice(0, 3);
      return { text: "지난 라이브는 ‘" + ML("replays") + "’에서 주차별로 다시 볼 수 있어요.\n최근 영상: " + list.map((x) => "‘" + x.title + "’").join(", "), links: [[ML("replays"), "#/replays"]].concat(list[0] ? [[list[0].title, "#/replays/" + list[0].id]] : []) };
    }
    // 용어 사전에 있는 단어를 물으면 바로 풀이
    const nt = t.replace(/\s/g, "").toLowerCase();
    // ‘마누카꿀 UMF · MGO’처럼 가운뎃점 · 괄호로 묶인 용어는 나눠서도 찾는다
    const termKeys = (g) => [g.term].concat(String(g.term).split(/[·\/(),]/)).map((x) => x.replace(/\s/g, "").toLowerCase()).filter((x, i, a) => x.length >= 2 && a.indexOf(x) === i);
    const hit = on("glossary") ? (D.glossary || []).filter((g) => g.term).map((g) => ({ g, k: termKeys(g).filter((x) => nt.indexOf(x) !== -1).sort((x, y) => y.length - x.length)[0] || "" })).filter((x) => x.k).sort((x, y) => y.k.length - x.k.length)[0] : null;
    const term = hit ? hit.g : null;
    if (term && (/(뭐|뜻|의미|이란|란\??$|무슨|설명|알려)/.test(t) || nt.length <= hit.k.length + 4)) {
      return { text: "‘" + term.term + "’" + (term.category ? " (" + term.category + ")" : "") + "\n" + term.desc, links: [[ML("glossary") + "에서 보기", "#/glossary?q=" + encodeURIComponent(term.term)]] };
    }
    if (/(라이브|강의\s*일정|다음\s*강의|언제.*(강의|라이브)|일정)/.test(t)) {
      const n = myEvents().find((e) => e.date >= today && e.type !== "deadline");
      return n ? { text: "다음 일정은 " + fmtMD(n.date) + (n.time ? " " + n.time : "") + " ‘" + n.title + "’ 입니다." + (on("replays") ? "\n지난 라이브는 ‘" + ML("replays") + "’에서 다시 볼 수 있어요." : ""), links: [[ML("schedule"), "#/schedule"]].concat(on("replays") ? [[ML("replays"), "#/replays"]] : []) }
        : { text: "예정된 일정이 없어요. ‘" + ML("notices") + "’에 새 안내가 있는지 확인해 주세요.", links: [[ML("notices"), "#/notices"]] };
    }
    if (/(진행률|진도|몇\s*개|얼마나\s*했|남은\s*과제)/.test(t)) {
      const o = overallStats(), nm = nextMissionOverall();
      return { text: me.name + "님은 전체 " + o.total + "개 과제 중 " + o.done + "개를 마쳤어요. (" + o.pct + "%)\n필수 과제는 " + o.reqTotal + "개 중 " + o.reqDone + "개 통과했어요." + (nm ? "\n다음으로 할 과제는 ‘" + nm.title + "’ 입니다." : ""),
        links: nm ? [["바로 하러 가기", "#/missions/" + nm.weekNo + "/" + nm.id]] : [["과제 보기", "#/missions"]] };
    }
    if (/수료/.test(t)) {
      const o = overallStats();
      return { text: "필수 과제 " + o.reqTotal + "개를 모두 통과하면 수료증이 발급돼요. 지금 " + o.reqDone + "개 통과, " + (o.reqTotal - o.reqDone) + "개 남았어요.", links: [[ML("certificate"), "#/certificate"]] };
    }
    if (/(마진|계산기|순이익|판매가)/.test(t) && DB.libOn(MID(), "file") && D.resources.file.some((x) => x.tool === "calculator")) {
      return { text: "자료실 ‘자료 파일’의 마진 계산기에 현지가·환율·배송비·수수료·광고비를 넣으면 순이익 · 마진율과 함께 지금 광고 ROAS · 최소 광고 ROAS(손익분기)가 바로 나와요. 제품 이름을 적어 저장하면 ‘내 제품 마진표’에 모여요. 판매가 기준 순이익 20~30%를 목표로 잡아 보세요.", links: [["마진 계산기 열기", "#/library/file?tool=calculator"]] };
    }
    const cands = [];
    D.faqs.forEach((f) => {
      let s = similarity(t, f.q) * 2;
      (f.tags || []).forEach((tag) => { if (tag && t.indexOf(tag) !== -1) s += 1.2; });
      cands.push({ s, text: f.a, links: [[ML("qna"), "#/qna"]] });
    });
    D.docsGuide.forEach((g) => {
      let s = similarity(t, g.title) * 2.2;
      if (t.replace(/\s/g, "").indexOf(g.title.replace(/\s/g, "")) !== -1) s += 2;
      cands.push({ s, text: "‘" + g.title + "’은(는) " + (g.where || "") + "에서 진행해요." + (g.time ? " (소요 " + g.time + (g.cost ? ", 비용 " + g.cost : "") + ")" : "") + "\n필요 서류: " + (g.docs || []).join(", ") + ((g.tips || []).length ? "\n팁: " + g.tips.join(" / ") : ""), links: [[ML("docs"), "#/docs"]] });
    });
    allMissions().forEach((m) => {
      cands.push({ s: similarity(t, m.title) * 1.8, text: "‘" + m.title + "’ 과제는 이렇게 하면 돼요.\n" + (m.steps || []).map((x, i) => (i + 1) + ". " + x).join("\n"), links: [[m.weekNo + "주차 과제로 이동", "#/missions/" + m.weekNo + "/" + m.id]] });
    });
    cands.sort((a, b) => b.s - a.s);
    if (cands[0] && cands[0].s >= 0.9) return cands[0];
    if (/(오류|버그|안\s*눌|안\s*돼|안\s*되|깨져|멈춰|에러|고장)/.test(t)) return { text: "화면이 이상하게 동작하나요? ‘" + ML("qna") + " → 1:1 요청’에 어떤 화면에서 무엇을 눌렀는지 적고 스크린샷을 올려 주시면 강사님이 확인 후 고쳐 드려요.", links: [["1:1 요청 남기기", "#/qna/requests/new"]] };
    return { text: "그 부분은 제가 정확히 답하기 어려워요. FAQ 검색에서 먼저 찾아보시고, 수업 내용은 라이브 시간에 " + D.brand.instructor + "님께 직접 물어봐 주세요.", links: [["FAQ 검색", "#/qna"], [ML("schedule"), "#/schedule"]] };
  }
  // 꺼진 메뉴로 가는 봇 답변 링크는 숨긴다
  function linkOk(l) {
    const top = String(l[1]).replace(/^#\/?/, "").split(/[/?]/)[0];
    if (top === "library") { const cat = String(l[1]).split("/")[2]; return on("library") && (!cat || DB.libOn(MID(), cat.split("?")[0])); }
    return !top || top === "home" || !NAV_DEFS.some((n) => n.id === top) || on(top);
  }
  function chatLog() {
    return [botGreeting()].concat(P.chat).map((m) =>
      '<div class="msg' + (m.from === "me" ? " me" : "") + '">' + (m.from === "me" ? "" : botFace("msg-avatar")) +
      '<div class="msg-bubble">' + esc(m.text) + (m.links && m.links.filter(linkOk).length ? '<div class="msg-links">' + m.links.filter(linkOk).map((l) => '<a href="' + esc(l[1]) + '">' + esc(l[0]) + "</a>").join("") + "</div>" : "") + "</div></div>").join("") +
      (botThinking ? '<div class="msg">' + botFace("msg-avatar") + '<div class="msg-bubble"><span class="typing-dots"><i></i><i></i><i></i></span></div></div>' : "");
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
  const chatForm = (id) => '<form class="chat-form" data-chat-form><input class="input" name="q" id="' + id + '" autocomplete="off" placeholder="궁금한 걸 편하게 적어 보세요" aria-label="질문 입력"><button class="btn btn-primary chat-send" type="submit" aria-label="보내기">' + icon("send", "sm") + "<span>보내기</span></button></form>";
  const chipRow = (cls) => '<div class="' + cls + '">' + botChips().map((c) => '<button class="chip" type="button" data-action="chip" data-q="' + esc(c) + '">' + esc(c) + "</button>").join("") + "</div>";
  function pageBot() {
    return '<div class="page">' + pageHead(D.brand.botName, D.brand.instructor + "님의 강의 자료 · FAQ · 과제 안내를 바탕으로 24시간 답해 드려요.") +
      '<section class="chat bot-full"><div class="bp-head">' + botFace("lg") + '<div class="bp-title"><strong>' + esc(D.brand.botName) + '</strong><small><i class="bp-dot"></i>지금 바로 답할 수 있어요</small></div></div>' +
        '<div class="chat-log" data-chat-log>' + chatLog() + "</div>" + chipRow("chips") + chatForm("chat-input-page") +
      "</section>" +
      '<p class="tiny" style="margin-top:12px">' + esc(D.brand.botName) + "의 답변은 참고용이에요. 사업자 · 통관처럼 법이 정한 일은 관할 기관 안내를 꼭 확인해 주세요. <button class=\"link-btn\" style=\"font-size:13px\" data-action=\"clear-chat\">대화 지우기</button></p></div>";
  }
  // 오른쪽 아래 AI 조교: 닫혀 있으면 말풍선 버튼, 열면 큰 대화창 (휴대폰은 아래에서 올라오는 시트)
  function renderBotFab(r) {
    const el = document.getElementById("bot-fab");
    if (!el) return;
    el.classList.toggle("open", !!botOpen);
    if (r.parts[0] === "bot" || !on("bot")) { el.innerHTML = ""; el.classList.remove("open"); return; }
    if (!botOpen) {
      el.innerHTML = '<button class="bot-launch" type="button" data-action="bot-open" aria-label="' + esc(D.brand.botName) + ' 열기">' + botFace() + '<span class="bl-txt"><small>' + esc(D.brand.botName) + "</small><b>무엇이든 물어보세요</b></span>" + '<span class="bl-go">' + icon("message", "sm") + "</span></button>";
      return;
    }
    el.innerHTML = '<button type="button" class="bp-scrim" data-action="bot-close" aria-label="닫기"></button>' +
      '<section class="bot-panel" role="dialog" aria-label="' + esc(D.brand.botName) + '"><span class="bp-grab" aria-hidden="true"></span><div class="bp-head">' + botFace("lg") +
        '<div class="bp-title"><strong>' + esc(D.brand.botName) + '</strong><small><i class="bp-dot"></i>' + esc(D.brand.instructor) + "님 강의 자료로 답해요 · 24시간</small></div>" +
        '<div class="tools"><a href="#/bot" aria-label="전체 화면으로 보기" title="전체 화면">' + icon("arrowUpRight", "sm") + '</a><button type="button" data-action="bot-close" aria-label="닫기" title="닫기">' + icon("x", "sm") + "</button></div></div>" +
      '<div class="chat-log" data-chat-log>' + chatLog() + "</div>" + chipRow("chips bp-chips") + chatForm("chat-input-fab") +
      '<p class="bp-foot">답변은 참고용이에요 · <button type="button" class="link-btn" data-action="clear-chat">대화 지우기</button></p></section>';
    const log = el.querySelector("[data-chat-log]");
    log.scrollTop = log.scrollHeight;
  }

  /* ---------------- 자료실 ---------------- */
  function pageLibrary(r) {
    const cat = r.parts[1];
    const warn = '<div class="callout callout-neg">' + icon("shield") + "<div>본 자료는 <b>유료 수강생 전용</b>입니다. 무단 다운로드·복사·캡처 배포 시 추적·법적 책임이 따릅니다.</div></div>";
    if (!cat) {
      return '<div class="page">' + pageHead(ML("library"), "수강생에게만 열리는 전자책 · 실전 자료 · 강의 영상을 분류별로 모았어요.") + warn +
        '<div class="grid-2" style="margin-top:14px">' + libList().map((c) =>
          '<a class="res-card" href="#/library/' + c.id + '"><div class="res-top"><span class="res-icon ' + c.cls + '">' + icon(c.icon) + '</span><div><div class="res-title">' + esc(c.label) + '</div><div class="tiny">자료 ' + resOf(c.id).length + "개</div></div></div>" +
          '<div class="res-desc">' + esc(c.desc()) + '</div><div class="res-foot"><span class="link-btn">열기 ' + icon("arrowRight", "sm") + "</span></div></a>").join("") + "</div></div>";
    }
    const c = libList().find((x) => x.id === cat);
    if (!c) return notFound();
    if (cat === "lesson") {
      const g = {}; lessonFiles().forEach((r2) => { const k = r2.x.p.id + "|" + r2.l.id; (g[k] = g[k] || { x: r2.x, l: r2.l, fs: [] }).fs.push(r2.f); });
      return '<div class="page">' + pageHead(c.label, c.desc(), crumb([[ML("library"), "#/library"], [c.label]])) + warn +
        '<div class="stack" style="margin-top:14px">' + Object.keys(g).map((k) => '<section class="card lib-lesson"><div class="lib-lesson-h"><small>' + esc(g[k].x.p.title) + "</small><b>" + esc(g[k].l.title) + '</b><a class="link-btn" href="' + learnHref(g[k].x.p.id, g[k].l.id) + '">강의 보기 ' + icon("arrowRight", "sm") + "</a></div>" + vtFiles(g[k].fs) + "</section>").join("") + "</div></div>";
    }
    const items = resOf(cat);
    if (r.parts[2]) return pageResDetail(c, r.parts[2]);
    const isVideo = cat === "vod" || cat === "senior";
    const showCalc = r.params.get("tool") === "calculator";
    let body;
    if (!items.length) body = '<section class="card">' + empty(c.icon, "자료를 준비하고 있어요.") + "</section>";
    else if (isVideo) {
      body = '<div class="vod-grid">' + items.map((it, i) =>
        '<a class="vod-card" href="#/library/' + cat + "/" + it.id + '">' + resThumb(it) +
          '<span class="vod-info"><span class="vod-no">' + (cat === "senior" ? "가이드 " : "VOD ") + (i + 1) + '</span><span class="vod-title">' + esc(it.title) + "</span>" +
          (it.desc ? '<span class="vod-desc">' + esc(it.desc) + "</span>" : "") +
          '<span class="vod-meta">' + (it.meta ? "<span>" + esc(it.meta) + "</span>" : "") + ((it.images || []).length ? "<span>" + icon("image", "xs") + "사진 " + it.images.length + "</span>" : "") +
          ((it.attachments || []).length ? "<span>" + icon("paperclip", "xs") + "첨부 " + it.attachments.length + "</span>" : "") + "</span></span></a>").join("") + "</div>";
    } else {
      body = items.map((it) => {
        const action = it.tool === "calculator"
          ? '<a class="btn btn-primary btn-sm" href="#/library/file?tool=calculator">' + icon("calculator", "sm") + "계산기 열기</a>"
          : it.url ? '<a class="btn btn-tertiary btn-sm" href="' + esc(it.url) + '" target="_blank" rel="noopener">' + icon(cat === "ebook" ? "book" : "download", "sm") + (cat === "ebook" ? "열람" : "다운로드") + "</a>"
          : '<button class="btn btn-secondary btn-sm" data-action="not-ready">준비 중</button>';
        return '<div class="res-item"><span class="res-icon ' + c.cls + '">' + icon(it.tool ? "calculator" : c.icon) + '</span><div style="min-width:0"><div class="m-title">' + esc(it.title) + '</div><div class="m-desc">' + esc([it.meta, it.desc].filter(Boolean).join(" · ")) + "</div></div>" + action + "</div>";
      }).join("");
    }
    return '<div class="page">' + pageHead(c.label, c.desc(), crumb([[ML("library"), "#/library"], [c.label]])) + warn +
      (showCalc ? '<div style="margin-top:14px">' + calculator() + "</div>" : "") + '<div style="margin-top:14px">' + body + "</div></div>";
  }
  // 자료 썸네일: 유튜브 썸네일 → 첫 사진 → 기본 그림
  function resThumb(it) {
    const yid = DB.youtubeId(it.youtubeId), img = (it.images || [])[0];
    const src = yid ? "https://i.ytimg.com/vi/" + yid + "/hqdefault.jpg" : img ? img.data || img.url : "";
    return '<span class="vod-thumb">' + (src ? '<img src="' + esc(src) + '" alt="" loading="lazy">' : '<span class="vod-ph">' + esc(it.title) + "</span>") + (yid ? '<span class="vod-play">' + icon("play") + "</span>" : "") + "</span>";
  }
  // 시니어 기초 가이드 · VOD 상세: 게시판처럼 영상(선택) + 글 + 사진 + 첨부 자료
  function pageResDetail(c, id) {
    const list = D.resources[c.id], i = list.findIndex((x) => x.id === id), it = list[i];
    if (!it) return notFound();
    const imgs = it.images || [], used = {};
    const fig = (im) => '<figure class="n-img"><img src="' + esc(im.data || im.url) + '" alt="' + esc(im.name || "") + '" loading="lazy"></figure>';
    const body = it.body ? DB.rich(it.body, { token: (n) => { const im = imgs[n - 1]; if (!im) return ""; used[n - 1] = true; return fig(im); } }) : "";
    const rest = imgs.filter((_, k) => !used[k]);
    const prev = list[i - 1], next = list[i + 1];
    return '<div class="page">' + pageHead(it.title, [it.meta, it.desc].filter(Boolean).join(" · "), crumb([[ML("library"), "#/library"], [c.label, "#/library/" + c.id], [it.title]])) +
      '<article class="card res-article">' + (DB.youtubeId(it.youtubeId) ? video(it) : "") +
        '<div class="body">' + body + (rest.length ? '<div class="n-imgs">' + rest.map(fig).join("") + "</div>" : "") + "</div>" +
        attachmentList(it.attachments) +
        (!body && !imgs.length && !DB.youtubeId(it.youtubeId) && !(it.attachments || []).length ? empty(c.icon, "내용을 준비하고 있어요.") : "") +
      "</article>" +
      pager(prev ? { href: "#/library/" + c.id + "/" + prev.id, label: "이전 자료", title: prev.title } : null, next ? { href: "#/library/" + c.id + "/" + next.id, label: "다음 자료", title: next.title } : null, "#/library/" + c.id) +
      "</div>";
  }
  // 자료실 이용 안내 팝업 + 열람자 표시(워터마크)
  function libNoticeModal() {
    const n = DB.libNoticeOf(D);
    modalRoot.innerHTML = '<div class="modal-backdrop lib-gate-back"><div class="modal lib-gate" role="dialog" aria-modal="true" aria-labelledby="lib-gate-title">' +
      '<div class="lib-gate-head"><span class="lib-gate-ico">' + icon("shieldCheck") + '</span><h2 id="lib-gate-title">' + esc(n.title) + "</h2></div>" +
      '<div class="lib-gate-body">' + DB.rich(n.intro) + DB.rich(n.items.map((x) => "- " + x).join("\n")) + (n.foot ? '<p class="lib-gate-foot">' + esc(n.foot) + "</p>" : "") +
      '<button class="btn btn-primary lib-gate-ok" data-action="lib-gate-ok">' + esc(n.button) + "</button></div></div></div>";
    document.body.classList.add("lib-gated");
    setTimeout(() => { const b = modalRoot.querySelector(".lib-gate-ok"); if (b) b.focus(); }, 30);
  }
  function watermark() {
    const label = (me.name || "") + " · " + (CO ? CO.name : "") + " · " + fmtStamp(Date.now());
    return '<div class="lib-wm" aria-hidden="true"><div class="lib-wm-in">' + Array.from({ length: 40 }, () => "<span>" + esc(label) + "</span>").join("") + "</div></div>";
  }
  // 마진 계산기: 숫자는 화면을 다시 그려도 그대로 남는다 · ‘내 제품’ 저장은 문대표 강의에서만 (수강생별 진행 기록에 저장)
  const CALC_F = [["nzd", "현지 상품가", "NZD"], ["rate", "환율 (1 NZD)", "원"], ["ship", "배송대행비", "원"], ["price", "판매가", "원"], ["fee", "판매 수수료", "%"], ["ad", "광고비 (판매가 대비)", "%"]];
  const CALC_DEF = { nzd: 39.9, rate: 820, ship: 12000, price: 74000, fee: 11, ad: 8 };
  let calcVals = Object.assign({}, CALC_DEF), calcEdit = "";
  const calcMine = () => !!INS && INS.id === "moon";
  const calcItems = () => (P && Array.isArray(P.calcItems) ? P.calcItems : []);
  const pct = (n) => (isFinite(n) ? Math.round(n).toLocaleString("ko-KR") + "%" : "-");
  /** 숫자 6개 → 원가 · 순이익 · 마진율 · ROAS
   *  지금 광고 ROAS = 판매가 ÷ 광고비 (광고비를 판매가의 n%로 쓴다는 뜻)
   *  최소 광고 ROAS = 판매가 ÷ 광고 쓰기 전 남는 돈 · 이보다 낮으면 광고할수록 손해 (손익분기 ROAS) */
  function calcOf(x) {
    const n = (k) => Number(x[k]) || 0;
    const cost = n("nzd") * n("rate") + n("ship"), price = n("price");
    const fee = price * n("fee") / 100, ad = price * n("ad") / 100;
    const preAd = price - cost - fee, profit = preAd - ad;
    return { cost, price, fee, ad, fees: fee + ad, preAd, profit, margin: price ? profit / price * 100 : 0,
      roas: ad > 0 ? price / ad * 100 : Infinity, minRoas: preAd > 0 ? price / preAd * 100 : Infinity, noAd: !(ad > 0), lossBase: !(preAd > 0) };
  }
  function calculator() {
    const f = (k, label, suffix) => '<div class="field"><label for="c-' + k + '">' + label + '</label><div class="input-wrap"><input class="input" id="c-' + k + '" data-calc="' + k + '" type="number" inputmode="decimal" step="any" min="0" value="' + esc(calcVals[k]) + '"><span class="input-addon" style="pointer-events:none">' + suffix + "</span></div></div>";
    const mine = calcMine(), editing = mine && calcItems().find((x) => x.id === calcEdit);
    return '<section class="card" id="calc"><div class="home-video-head"><h2>' + icon("calculator") + '마진 계산기</h2><span class="tiny">숫자를 바꾸면 바로 계산돼요</span></div>' +
      '<div class="calc">' + CALC_F.map((x) => f(x[0], x[1], x[2])).join("") + "</div>" +
      '<div class="calc-out" id="calc-out"></div>' +
      '<div class="calc-roas" id="calc-roas"></div>' +
      (mine ? '<form class="calc-save" id="calc-save" novalidate><label for="c-name">' + icon("pin", "sm") + (editing ? "‘" + esc(editing.name) + "’ 고치는 중" : "내 제품으로 저장") + "</label>" +
        '<div class="calc-save-row"><input class="input" id="c-name" name="name" maxlength="40" placeholder="예: 마누카꿀 UMF10+ 250g" value="' + esc(editing ? editing.name : "") + '">' +
        '<button class="btn btn-primary" type="submit">' + icon("check", "sm") + (editing ? "고친 내용 저장" : "저장") + "</button>" +
        (editing ? '<button class="btn btn-secondary" type="button" data-action="calc-new">새 제품으로</button>' : "") + "</div>" +
        '<p class="tiny">위 숫자 그대로 저장돼요. 저장한 제품은 아래 ‘내 제품 마진표’에 모여요.</p></form>' : "") +
      "</section>" + (mine ? calcMineHtml() : "");
  }
  function roasBox(r, x) {
    if (r.lossBase) return '<div class="calc-roas-in bad"><div class="cr-head"><span class="cr-chip bad">' + icon("alert", "xs") + "광고 없이도 적자</span><p>원가와 수수료만으로 판매가를 넘어요. 광고를 하기 전에 판매가나 원가부터 다시 잡아 보세요.</p></div></div>";
    const ok = r.noAd || r.roas >= r.minRoas, max = Math.max(r.minRoas * 1.6, r.noAd ? 0 : r.roas * 1.1, 300);
    const w = (v) => Math.max(4, Math.min(100, v / max * 100)).toFixed(1) + "%";
    const per = Math.ceil(r.minRoas / 100 * 10000 / 100) * 100;
    return '<div class="calc-roas-in ' + (ok ? "ok" : "bad") + '">' +
      '<div class="cr-grid">' +
        '<div class="cr-cell"><span class="stat-label">지금 광고 ROAS</span><b class="num">' + (r.noAd ? "광고 안 함" : pct(r.roas)) + "</b><small>" + (r.noAd ? "광고비를 0%로 넣었어요" : "광고비 " + (Number(x.ad) || 0) + "% 기준 · 광고비 1만 원에 매출 " + won(r.roas * 100)) + "</small></div>" +
        '<div class="cr-cell min"><span class="stat-label">최소 광고 ROAS</span><b class="num">' + pct(r.minRoas) + "</b><small>손익분기 · 광고비 1만 원에 매출 " + won(per) + " 이상</small></div>" +
      "</div>" +
      '<div class="cr-bar" aria-hidden="true"><span class="cr-zone" style="width:' + w(r.minRoas) + '"></span><i class="cr-min" style="left:' + w(r.minRoas) + '"></i>' + (r.noAd ? "" : '<i class="cr-now" style="left:' + w(r.roas) + '"></i>') + "</div>" +
      '<p class="cr-msg">' + (r.noAd ? "광고를 하면 ROAS가 <b>" + pct(r.minRoas) + "</b>보다 높아야 남아요." : ok ? icon("check", "xs") + " 지금 광고 ROAS가 최소보다 <b>" + pct(r.roas - r.minRoas).replace("%", "%p") + "</b> 높아요. 광고를 해도 남아요." : icon("alert", "xs") + " 지금 광고 ROAS가 최소보다 낮아요. 광고비를 <b>" + (100 / r.minRoas * 100).toFixed(1) + "%</b> 아래로 줄이거나 판매가를 올려 보세요.") + "</p></div>";
  }
  function calcMineHtml() {
    const list = calcItems();
    const rows = list.map((it) => {
      const r = calcOf(it.v), ok = !r.lossBase && (r.noAd || r.roas >= r.minRoas);
      return '<tr class="' + (it.id === calcEdit ? "on" : "") + '"><th scope="row"><b>' + esc(it.name) + "</b><small>" + fmtMD(DB.date.toStr(new Date(it.at))) + " 저장</small></th>" +
        '<td data-l="판매가">' + won(r.price) + '</td><td data-l="순이익" class="' + (r.profit < 0 ? "neg" : "") + '">' + won(r.profit) + '</td><td data-l="마진율" class="' + (r.profit < 0 ? "neg" : "") + '">' + r.margin.toFixed(1) + "%</td>" +
        '<td data-l="지금 광고 ROAS">' + (r.noAd ? "광고 안 함" : pct(r.roas)) + '</td><td data-l="최소 광고 ROAS"><b>' + (r.lossBase ? "적자" : pct(r.minRoas)) + "</b></td>" +
        '<td data-l="상태"><span class="cr-chip ' + (ok ? "ok" : "bad") + '">' + (ok ? "남아요" : "손해") + "</span></td>" +
        '<td class="act"><button type="button" class="btn btn-tertiary btn-sm" data-action="calc-load" data-id="' + esc(it.id) + '">불러오기</button><button type="button" class="btn btn-ghost btn-sm" data-action="calc-del" data-id="' + esc(it.id) + '" aria-label="' + esc(it.name) + ' 삭제">' + icon("trash", "sm") + "</button></td></tr>";
    }).join("");
    return '<section class="card calc-mine" id="calc-mine"><div class="home-video-head"><h2>' + icon("store") + '내 제품 마진표</h2><span class="tiny">' + list.length + "개 · 나만 볼 수 있어요</span></div>" +
      (list.length ? '<div class="calc-tbl-wrap"><table class="calc-tbl"><thead><tr><th>제품</th><th>판매가</th><th>순이익</th><th>마진율</th><th>지금 광고 ROAS</th><th>최소 광고 ROAS</th><th>상태</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>"
        : '<div class="calc-empty">' + icon("calculator") + "<p>위 계산기에 숫자를 넣고 제품 이름을 적어 저장해 보세요.<br>제품마다 마진과 최소 광고 ROAS를 한눈에 비교할 수 있어요.</p></div>") +
      "</section>";
  }
  function updateCalc() {
    const out = document.getElementById("calc-out");
    if (!out) return;
    CALC_F.forEach((x) => { const el = document.getElementById("c-" + x[0]); if (el) calcVals[x[0]] = el.value; });
    const r = calcOf(calcVals);
    out.innerHTML = '<div><span class="stat-label">원가 (상품+배송)</span><div class="stat-value" style="font-size:22px">' + won(r.cost) + "</div></div>" +
      '<div><span class="stat-label">수수료 + 광고비</span><div class="stat-value" style="font-size:22px">' + won(r.fees) + "</div></div>" +
      '<div class="hl"><span class="stat-label" style="color:#b8bdb2">순이익 · 마진율</span><div class="stat-value" style="font-size:22px">' + won(r.profit) + " · " + r.margin.toFixed(1) + "%</div></div>";
    const rb = document.getElementById("calc-roas"); if (rb) rb.innerHTML = roasBox(r, calcVals);
  }
  function saveCalc(f) {
    const name = f.name.value.trim();
    if (!name) { toast("제품 이름을 적어 주세요.", "warn"); f.name.focus(); return; }
    updateCalc();
    P.calcItems = calcItems();
    const v = {}; CALC_F.forEach((x) => { v[x[0]] = Number(calcVals[x[0]]) || 0; });
    let it = P.calcItems.find((x) => x.id === calcEdit) || P.calcItems.find((x) => x.name === name);
    const isNew = !it;
    if (isNew) { it = { id: DB.uid("cp"), name, v, at: Date.now() }; P.calcItems.unshift(it); } else Object.assign(it, { name, v, at: Date.now() });
    if (!saveProgress()) return;
    calcEdit = it.id; render();
    toast(isNew ? "‘" + name + "’을 내 제품 마진표에 저장했어요." : "‘" + name + "’ 숫자를 새로 저장했어요.");
  }

  /* ---------------- 동기부여 ---------------- */
  // 위에 큰 플레이어, 아래 썸네일을 누르면 위에서 바로 재생
  let mvSel = null, mvAuto = false;
  function mvPlayer(it) {
    const yid = DB.youtubeId(it.youtubeId);
    if (yid && mvAuto) return '<div class="video mv-player" data-yid="' + esc(yid) + '"><iframe src="https://www.youtube-nocookie.com/embed/' + esc(yid) + '?autoplay=1&rel=0&playsinline=1" title="' + esc(it.title) + '" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>';
    return '<div class="mv-player-wrap">' + video(it) + "</div>";
  }
  function pageMotivation() {
    const quote = D.quotes.length ? D.quotes[parseDate(todayStr()).getDate() % D.quotes.length] : "";
    const list = D.motivation;
    const cur = list.find((x) => x.id === mvSel) || list[0];
    return '<div class="page mv-page">' + pageHead(ML("motivation"), "지칠 때 다시 힘을 내도록 " + D.brand.instructor + "님이 고른 영상이에요.") +
      (cur ? '<section class="mv-stage" id="mv-stage">' + mvPlayer(cur) + '<div class="mv-now"><b>' + esc(cur.title) + "</b>" + (cur.minutes || cur.date ? '<span class="tiny">' + esc([cur.minutes, cur.date ? fmtMD(cur.date) : ""].filter(Boolean).join(" · ")) + "</span>" : "") + "</div></section>" +
        '<div class="section-head"><h2>오늘의 응원 영상</h2>' + (D.brand.youtubeChannel ? '<a class="link-btn" href="' + esc(D.brand.youtubeChannel) + '" target="_blank" rel="noopener">유튜브 채널 ' + icon("arrowUpRight", "sm") + "</a>" : "") + "</div>" +
        '<div class="mv-tiles">' + list.map((it, i) => {
          const yid = DB.youtubeId(it.youtubeId);
          return '<button type="button" class="mv-tile' + (it === cur ? " on" : "") + '" data-action="mv-pick" data-id="' + esc(it.id) + '" aria-pressed="' + (it === cur) + '" title="' + esc(it.title) + '">' +
            '<span class="mv-tile-img">' + (yid ? '<img src="https://i.ytimg.com/vi/' + esc(yid) + '/hqdefault.jpg" alt="" loading="lazy">' : '<span class="vod-ph">' + esc(it.title) + "</span>") + '<span class="mv-tile-play">' + icon("play") + "</span></span>" +
            '<span class="mv-tile-label">영상 ' + (i + 1) + (it === cur ? '<em>재생 중</em>' : "") + "</span></button>";
        }).join("") + "</div>"
        : '<section class="card" style="margin-top:14px">' + empty("flame", "응원 영상을 준비하고 있어요.") + "</section>") +
      (quote ? '<div class="quote" style="margin-top:20px">“' + esc(quote) + "”<small>— " + esc(D.brand.instructor) + "</small></div>" : "") + "</div>";
  }

  /* ---------------- 1:1 소통채널 ---------------- */
  // 강사가 강사센터에서 만든 상담 채널(카카오톡 · 채널톡 · 네이버 톡톡 · 이메일 · 전화 …)로 바로 연결
  function pageChannels() {
    const list = DB.channelsOf(D);
    const card = (ch) => {
      const t = DB.channelType(ch.type), ok = !!(ch.url || "").trim(), info = !ok && !!(ch.note || "").trim();
      const look = DB.channelLook(ch), style = look.color ? ' style="--ch:' + look.color + ";--chi:" + look.ink + '"' : "";
      const kakao = ch.type === "kakao" || ch.type === "openchat" || /kakao\.com/i.test(ch.url || "");
      const inner = '<span class="ch-bar" aria-hidden="true"></span>' + (ch.tag ? '<span class="ch-tag">' + esc(ch.tag) + "</span>" : "") +
        '<div class="res-top"><span class="ch-icon"' + style + ">" + icon(look.icon) + (kakao ? '<span class="ch-badge">' + window.brandMark("kakao") + "</span>" : "") + '</span><div><div class="res-title">' + esc(ch.title || t.label) + "</div>" +
          '<div class="tiny ch-via">' + (kakao ? window.brandMark("kakao", "xs") + "<span><b>" + esc(t.label) + "</b>" + (ok ? "로 바로 연결돼요" : "") + "</span>" : esc(t.label)) + (ch.hours ? " · " + esc(ch.hours) : "") + "</div></div></div>" +
        (ch.desc ? '<div class="res-desc">' + esc(ch.desc) + "</div>" : "") +
        '<div class="res-foot">' + (ok ? (kakao ? '<span class="ch-go kakao">' + window.brandMark("kakao", "sm") + esc(ch.label || "카카오톡으로 상담하기") + icon("arrowUpRight", "sm") + "</span>" : '<span class="ch-go"' + style + ">" + esc(ch.label || "상담하기") + icon("arrowUpRight", "sm") + "</span>")
          : info ? '<span class="ch-info">' + icon("lock", "sm") + "<span>" + esc(ch.note) + "</span></span>" : '<span class="tiny">링크를 준비하고 있어요</span>') + "</div>";
      return ok ? '<a class="res-card ch-card" href="' + esc(ch.url) + '" target="_blank" rel="noopener"' + style + ">" + inner + "</a>" : '<div class="res-card ch-card ' + (info ? "info" : "off") + '"' + (info ? "" : ' aria-disabled="true"') + style + ">" + inner + "</div>";
    };
    return '<div class="page">' + pageHead(ML("channels"), "상담이 필요할 때 편한 채널을 골라 바로 연결하세요.") +
      (list.length ? '<div class="grid-2 ch-grid">' + list.map(card).join("") + "</div>" : '<section class="card">' + empty("headset", "상담 채널을 준비하고 있어요.") + "</section>") +
      '<p class="ch-note">' + icon("clock", "xs") + " 운영 시간 밖에는 답변이 늦을 수 있어요." + (on("qna") ? ' 화면 오류는 <a href="#/qna/requests/new">1:1 요청</a>으로 남겨 주시면 더 빨라요.' : "") + "</p></div>";
  }

  /* ---------------- 제휴채널 ---------------- */
  // 두고그룹 회사 · 외부 제휴사를 탭(전체 · 두고그룹 · 제휴사)으로. featured(두고 N카페)는 맨 위 큰 카드 + 혜택 안내 띠
  function pagePartners(r) {
    const all = DB.partnersOf(D), G = DB.PARTNER_GROUPS;
    const tab = G.some((g) => g.key === r.params.get("tab")) ? r.params.get("tab") : "all";
    const feat = all.find((x) => x.featured && x.url);
    const isCafe = (u) => /cafe\.naver\.com/i.test(u || "");
    const card = (x) => {
      const t = DB.channelLook(Object.assign({ type: "other" }, x)), col = t.color || "var(--ink)", ink = t.color ? DB.inkOn(t.color) : "#fff";
      const style = ' style="--ch:' + col + ";--chi:" + ink + '"', ok = !!(x.url || "").trim(), cafe = isCafe(x.url);
      const go = ok ? (cafe && x.featured ? '<span class="ch-go naver">' + window.brandMark("naver", "sm") + esc(x.label || "카페 바로가기") + icon("arrowUpRight", "sm") + "</span>" : '<span class="ch-go"' + style + ">" + esc(x.label || "바로가기") + icon("arrowUpRight", "sm") + "</span>") : '<span class="tiny">링크를 준비하고 있어요</span>';
      const inner = '<span class="ch-bar" aria-hidden="true"></span>' + (x.tag ? '<span class="ch-tag">' + esc(x.tag) + "</span>" : "") +
        '<div class="res-top"><span class="ch-icon"' + style + ">" + icon(t.icon) + (cafe ? '<span class="ch-badge">' + window.brandMark("naver") + "</span>" : "") + '</span><div><div class="res-title">' + esc(x.title) + "</div>" +
          '<div class="tiny ch-via">' + (cafe ? window.brandMark("naver", "xs") + "<span><b>네이버 카페</b>" + (x.featured ? "" : " 글에서 혜택 확인") + "</span>" : esc((G.find((g) => g.key === x.group) || G[0]).label)) + "</div></div></div>" +
        (x.desc ? '<div class="res-desc">' + esc(x.desc) + "</div>" : "") +
        (x.featured && (x.points || []).length ? '<ul class="pt-points">' + x.points.map((p) => "<li>" + icon("check", "xs") + esc(p) + "</li>").join("") + "</ul>" : "") +
        '<div class="res-foot">' + go + "</div>";
      const cls = "res-card ch-card pt-card" + (x.featured ? " pt-feature" : "");
      return ok ? '<a class="' + cls + '" href="' + esc(x.url) + '" target="_blank" rel="noopener"' + style + ">" + inner + "</a>" : '<div class="' + cls + ' off"' + style + ">" + inner + "</div>";
    };
    const count = (k) => all.filter((x) => k === "all" || x.group === k).length;
    const tabs = '<div class="utabs pt-tabs" role="tablist">' + [["all", "전체보기"]].concat(G.map((g) => [g.key, g.label])).map((t) =>
      '<a role="tab" href="#/partners' + (t[0] === "all" ? "" : "?tab=" + t[0]) + '" class="' + (tab === t[0] ? "on" : "") + '" aria-selected="' + (tab === t[0]) + '">' + t[1] + ' <span class="fnum">' + count(t[0]) + "</span></a>").join("") + "</div>";
    const section = (g) => {
      const list = all.filter((x) => x.group === g.key).sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
      if (!list.length) return "";
      return '<section class="pt-sec"><div class="section-head"><h2>' + esc(g.label) + ' <span class="tiny">' + list.length + '곳</span></h2><span class="hint">' + esc(g.desc) + "</span></div>" +
        '<div class="grid-2 ch-grid">' + list.map(card).join("") + "</div></section>";
    };
    return '<div class="page">' + pageHead(ML("partners"), "수강생만 받을 수 있는 제휴 혜택과 두고그룹 서비스를 모았어요.") +
      (feat ? '<a class="pt-notice" href="' + esc(feat.url) + '" target="_blank" rel="noopener">' + window.brandMark(isCafe(feat.url) ? "naver" : "kakao", "md") + "<span><b>제휴 혜택 · 할인 코드는 모두 " + esc(feat.title) + "에서 안내해 드려요</b><small>" + esc(feat.tag || "") + (feat.tag ? " · " : "") + "카페에 가입하면 제휴사 할인 코드와 이용 방법을 바로 볼 수 있어요.</small></span>" + icon("arrowUpRight", "sm") + "</a>" : "") +
      tabs + (all.length ? G.filter((g) => tab === "all" || tab === g.key).map(section).join("") || '<section class="card" style="margin-top:14px">' + empty("handshake", "이 분류에는 아직 등록된 곳이 없어요.") + "</section>"
        : '<section class="card" style="margin-top:14px">' + empty("handshake", "제휴 혜택을 준비하고 있어요.") + "</section>") + "</div>";
  }

  /* ---------------- 수료증 ---------------- */
  // 체험 계정은 수료증을 열어 둔 채로 보여 주고, 강사 미리보기는 잠긴 수료증을 ‘미리보기’로 열어 볼 수 있다
  let certPreview = false;
  function certSeal(name) {
    const nm = esc(String(name || "").replace(/\s+/g, "").slice(0, 4));
    return '<svg class="cert-seal" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="60" cy="60" r="45" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
      '<text x="60" y="58" text-anchor="middle" font-size="' + (nm.length > 3 ? 21 : 26) + '" font-weight="900" fill="currentColor" font-family="Noto Serif KR, Nanum Myeongjo, serif">' + nm + '</text><text x="60" y="84" text-anchor="middle" font-size="15" font-weight="900" fill="currentColor" font-family="Noto Serif KR, Nanum Myeongjo, serif">之印</text></svg>';
  }
  function certRosette() {
    // 메달은 테마와 상관없이 금색
    return '<svg class="cert-rosette" viewBox="0 0 120 150" aria-hidden="true"><defs><linearGradient id="cert-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7e08a"/><stop offset=".45" stop-color="#d9a930"/><stop offset="1" stop-color="#a87412"/></linearGradient></defs><path d="M38 86 26 146l20-12 14 16 8-58zM82 86l12 60-20-12-14 16-8-58z" fill="var(--ink)"/>' +
      '<circle cx="60" cy="60" r="50" fill="url(#cert-gold)"/><circle cx="60" cy="60" r="50" fill="none" stroke="#8a5e0c" stroke-width="2" stroke-dasharray="3 4"/><circle cx="60" cy="60" r="38" fill="none" stroke="#8a5e0c" stroke-width="1.5"/>' +
      '<text x="60" y="56" text-anchor="middle" font-size="12" font-weight="900" letter-spacing="2" fill="#5a3d05">COMPLETE</text><text x="60" y="76" text-anchor="middle" font-size="18" font-weight="900" fill="#5a3d05">수 료</text></svg>';
  }
  const certNumber = () => DB.certNo(me);
  function pageCertificate() {
    const o = overallStats();
    const earned = o.reqTotal > 0 && o.reqDone === o.reqTotal;
    const demoOpen = !earned && !preview && !!me.demo;
    const canPreview = !earned && preview;
    const isPv = demoOpen || (canPreview && certPreview);
    const showOpen = earned || isPv;
    const remaining = allMissions().filter((m) => m.required && !isDone(m.id));
    let doneDate = todayStr();
    if (earned) {
      const ts = Math.max.apply(null, allMissions().filter((m) => m.required).map((m) => { const s = lastSub(m.id); return s ? s.at : 0; }));
      if (ts) doneDate = DB.date.toStr(new Date(ts));
    }
    const pct = o.reqTotal ? Math.round((o.reqDone / o.reqTotal) * 100) : 0;
    const canPrint = window.self === window.top;
    const d = parseDate(doneDate), ko = d.getFullYear() + "년 " + (d.getMonth() + 1) + "월 " + d.getDate() + "일";
    const cert = '<div class="cert-wrap"><article class="cert' + (showOpen ? "" : " locked") + (isPv ? " is-preview" : "") + '" aria-label="수료증">' +
        '<div class="cert-inner">' +
          '<span class="cert-corner tl"></span><span class="cert-corner tr"></span><span class="cert-corner bl"></span><span class="cert-corner br"></span>' +
          certRosette() +
          '<header class="cert-head">' + window.logoMark("cert-mark") + '<span class="cert-brand">' + esc(D.brand.name) + "</span></header>" +
          '<p class="cert-eyebrow">CERTIFICATE OF COMPLETION</p><h2 class="cert-title">수 료 증</h2>' +
          '<p class="cert-no">제 ' + esc(certNumber()) + " 호</p>" +
          '<div class="cert-name"><small>성 명</small><span>' + esc(me.name) + "</span></div>" +
          '<p class="cert-body">위 사람은 <b>' + esc(D.brand.courseTitle) + "</b> " + esc(CO.name) + " 과정을 성실히 이수하고,<br>필수 과제 " + o.reqTotal + "개를 모두 통과하였기에 이 증서를 수여합니다.</p>" +
          '<dl class="cert-meta"><div><dt>과정명</dt><dd>' + esc(D.brand.courseTitle) + "</dd></div><div><dt>교육 기간</dt><dd>" + fmtFull(CO.startDate) + " ~ " + fmtFull(DB.cohortEnd(CO)) + "</dd></div><div><dt>수료일</dt><dd>" + fmtFull(doneDate) + "</dd></div></dl>" +
          '<footer class="cert-foot"><p class="cert-date">' + ko + '</p><div class="cert-sign"><span class="cert-org">' + esc(D.brand.name) + '</span><span class="cert-who">대표 강사 <b>' + esc(D.brand.instructor) + "</b></span>" + certSeal(D.brand.instructor) + "</div></footer>" +
          '<p class="cert-powered">' + window.poweredBy("color") + "</p>" +
        "</div>" +
        (isPv ? '<div class="cert-ribbon">' + (demoOpen ? "체험 계정" : "미리보기") + "</div>" : "") +
        (showOpen ? "" : '<div class="cert-lock">' + icon("lock") + "<strong>필수 과제 " + remaining.length + '개가 남았어요</strong><span class="muted">모두 통과하면 이름이 새겨진 수료증이 열립니다.</span>' +
          (canPreview ? '<button class="btn btn-primary" data-action="cert-preview">' + icon("eye", "sm") + "강사 미리보기: 수료증 열어 보기" + "</button>" : "") + "</div>") +
      "</article></div>";
    return '<div class="page">' + pageHead(ML("certificate"), "필수 과제 " + o.reqTotal + "개를 모두 통과하면 수료증이 발급됩니다.") +
      '<section class="card overall no-print"><div class="overall-top"><span>필수 과제 통과</span>' + pctText(pct) + "</div>" + progressBar(pct) + '<span class="tiny" style="color:var(--body)">' + o.reqTotal + "개 중 " + o.reqDone + "개 통과" + (earned ? " · 수료 조건을 모두 채웠어요!" : " · " + remaining.length + "개 남음") + "</span></section>" +
      cert +
      (showOpen
        ? '<div class="guide-actions no-print" style="justify-content:center;margin-top:16px">' + (canPrint ? '<button class="btn btn-primary" data-action="print">' + icon("download", "sm") + "PDF로 내려받기</button>" : "") +
            (isPv && !demoOpen ? '<button class="btn btn-secondary" data-action="cert-preview">' + icon("lock", "sm") + "미리보기 닫기</button>" : "") + "</div>" +
            (isPv ? '<p class="tiny no-print" style="text-align:center;margin:10px 0 0">' + (demoOpen ? "체험 계정이라 수료증을 열어 두었어요." : "체험용 미리보기예요.") + " 실제 수강생은 필수 과제를 모두 통과해야 이 수료증이 열려요.</p>" : "")
        : "") +
      (!earned ? '<div class="section-head no-print"><h2>남은 필수 과제</h2></div><section class="card no-print">' + remaining.map((m) => {
            const w = findWeek(m.weekNo);
            return isOpen(w)
              ? '<a class="list-row" href="#/missions/' + m.weekNo + "/" + m.id + '"><span class="badge badge-neutral">' + m.weekNo + '주차</span><span class="lr-title">' + esc(m.title) + "</span>" + stateBadge(m.id) + "</a>"
              : '<div class="list-row" style="opacity:.6"><span class="badge badge-neutral">' + m.weekNo + '주차</span><span class="lr-title">' + esc(m.title) + '</span><span class="lr-date">' + icon("lock", "xs") + " " + fmtMD(openOf(w)) + "</span></div>";
          }).join("") + "</section>" : "") +
      "</div>";
  }

  /* ---------------- 라이브 다시보기 ---------------- */
  // 강사가 올린 지난 라이브 녹화를 주차별로. 다 본 영상은 ‘다 봤어요’로 표시해 둔다 (P.replays)
  let rpWeek = "all";
  const replaysSorted = () => (D.replays || []).slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const weekChips = (nums, cur, action, all) => '<div class="fchips wk-chips">' + [["all", "전체", all]].concat(nums.map((n) => [String(n), n + "주차", null])).map((x) =>
    '<button type="button" class="fchip' + (String(cur) === x[0] ? " on" : "") + '" data-action="' + action + '" data-k="' + x[0] + '" aria-pressed="' + (String(cur) === x[0]) + '">' + x[1] + (x[2] != null ? ' <span class="fnum">' + x[2] + "</span>" : "") + "</button>").join("") + "</div>";
  function pageReplays(r) {
    if (r.parts[1]) return pageReplay(r.parts[1]);
    const all = replaysSorted(), seen = P.replays || {};
    const weeks = all.map((x) => Number(x.week) || 0).filter((n, i, a) => n && a.indexOf(n) === i).sort((a, b) => a - b);
    if (rpWeek !== "all" && weeks.indexOf(Number(rpWeek)) === -1) rpWeek = "all";
    const list = all.filter((x) => rpWeek === "all" || Number(x.week) === Number(rpWeek));
    const done = all.filter((x) => seen[x.id]).length, pct = all.length ? Math.round(done / all.length * 100) : 0;
    const sub = !!mainLec();
    return '<div class="page">' + pageHead(ML("replays"), sub ? "메인 강의 외에, 수강생이 가장 헷갈려 하는 부분만 짧게 찍어 올린 보충 강의예요. 메인 강의 녹화본은 " + (mainLec().platform || "외부 강의실") + "에서 봐요." : "라이브를 놓쳤거나 한 번 더 듣고 싶을 때, 주차별로 골라 보세요.") +
      (sub ? mainLecCard(true) : "") +
      (all.length ? '<section class="card overall"><div class="overall-top"><span>' + (sub ? "보충 강의 시청" : "다시보기 시청") + "</span>" + pctText(pct) + "</div>" + progressBar(pct) + '<span class="tiny" style="color:var(--body)">' + all.length + "개 중 " + done + "개 시청 · 최근 영상이 맨 앞에 있어요</span></section>" +
        (weeks.length > 1 ? weekChips(weeks, rpWeek, "rp-week", all.length) : "") +
        '<div class="rp-grid">' + list.map((x) => {
          const yid = DB.youtubeId(x.youtubeId);
          return '<a class="card rp-card plain-link" href="#/replays/' + esc(x.id) + '"><span class="rp-thumb">' + (yid ? '<img src="https://i.ytimg.com/vi/' + esc(yid) + '/mqdefault.jpg" alt="" loading="lazy">' : "") + '<span class="rp-play">' + icon("play") + "</span>" + (x.minutes ? '<span class="rp-len">' + esc(x.minutes) + "</span>" : "") + "</span>" +
            '<span class="rp-body"><span class="rp-meta">' + (x.week ? '<span class="badge badge-neutral">' + Number(x.week) + "주차</span>" : "") + (x.date ? "<span>" + fmtMD(x.date) + (mainLec() ? " 업로드" : " 라이브") + "</span>" : "") + (seen[x.id] ? '<span class="badge badge-positive">' + icon("check", "xs") + "다 봤어요</span>" : "") + "</span>" +
            "<b>" + esc(x.title) + "</b>" + (x.summary ? '<span class="rp-sum">' + esc(String(x.summary).replace(/\s+/g, " ").slice(0, 90)) + "</span>" : "") + "</span></a>";
        }).join("") + "</div>"
        : '<section class="card">' + empty("monitorPlay", mainLec() ? "아직 올라온 보충 강의가 없어요." : "아직 올라온 다시보기 영상이 없어요.") + "</section>") + "</div>";
  }
  function pageReplay(id) {
    const all = replaysSorted(), i = all.findIndex((x) => x.id === id), x = all[i];
    if (!x) return notFound();
    const seen = !!(P.replays || {})[id], newer = all[i - 1], older = all[i + 1];
    return '<div class="page">' + pageHead(x.title, [x.week ? Number(x.week) + "주차" : "", x.date ? fmtFull(x.date) + (mainLec() ? " 업로드" : " 라이브") : "", x.minutes || ""].filter(Boolean).join(" · "), crumb([[ML("replays"), "#/replays"], [x.title]])) +
      '<section class="card">' + video(x) +
        (x.summary ? '<div class="rp-notes"><p class="side-label">' + icon("pin", "xs") + " 이번 라이브 핵심 정리</p>" + DB.rich(x.summary) + "</div>" : "") + attachmentList(x.attachments) +
        '<div class="guide-actions" style="margin-top:20px"><button class="btn ' + (seen ? "btn-secondary" : "btn-primary") + '" data-action="toggle-replay" data-id="' + esc(id) + '">' + icon("check", "sm") + (seen ? "다 봤어요 · 취소" : "다 봤어요") + "</button>" +
          (x.week && on("missions") && findWeek(x.week) && isOpen(findWeek(x.week)) ? '<a class="btn btn-tertiary" href="#/missions/' + Number(x.week) + '">' + Number(x.week) + "주차 과제 보기</a>" : "") +
          (on("notes") ? '<a class="btn btn-tertiary" href="#/notes">' + icon("notebookPen", "sm") + esc(ML("notes")) + "에 정리하기</a>" : "") + "</div></section>" +
      pager(older ? { href: "#/replays/" + older.id, label: "이전 라이브", title: older.title } : null, newer ? { href: "#/replays/" + newer.id, label: "다음 라이브", title: newer.title } : null, "#/replays") +
      "</div>";
  }

  /* ---------------- 모범 과제 ---------------- */
  // 강사가 고른 잘한 과제 예시 (사진 + 강사 코멘트). 과제와 이어 두면 과제 화면에서도 바로 보인다
  let scWeek = "all";
  const showcaseOf = (missionId) => (D.showcase || []).filter((x) => x.missionId && x.missionId === missionId);
  function pageShowcase(r) {
    if (r && r.params.get("w")) { scWeek = r.params.get("w"); history.replaceState(null, "", "#/showcase"); }
    const all = (D.showcase || []).slice().sort((a, b) => (Number(a.week) || 99) - (Number(b.week) || 99));
    const weeks = all.map((x) => Number(x.week) || 0).filter((n, i, a) => n && a.indexOf(n) === i).sort((a, b) => a - b);
    if (scWeek !== "all" && weeks.indexOf(Number(scWeek)) === -1) scWeek = "all";
    const list = all.filter((x) => scWeek === "all" || Number(x.week) === Number(scWeek));
    return '<div class="page">' + pageHead(ML("showcase"), D.brand.instructor + "님이 고른 잘한 과제예요. 어떻게 하면 좋은지 감을 잡고 내 과제에 적용해 보세요.") +
      (all.length ? (weeks.length > 1 ? weekChips(weeks, scWeek, "sc-week", all.length) : "") +
        '<div class="sc-grid">' + list.map(showcaseCard).join("") + "</div>"
        : '<section class="card">' + empty("trophy", "아직 등록된 모범 과제가 없어요.") + "</section>") + "</div>";
  }
  function showcaseCard(x) {
    const imgs = x.images || [], w = x.week ? findWeek(x.week) : null;
    const m = x.missionId && w ? w.missions.find((mm) => mm.id === x.missionId) : null;
    return '<article class="card sc-card">' +
      (imgs.length ? '<div class="sc-shots n' + Math.min(imgs.length, 3) + '">' + imgs.slice(0, 3).map((im, i) => '<button type="button" class="sc-shot" data-action="sc-zoom" data-id="' + esc(x.id) + '" data-i="' + i + '" aria-label="사진 크게 보기"><img src="' + esc(im.data || im.url) + '" alt="" loading="lazy">' + (i === 2 && imgs.length > 3 ? '<span class="sc-more">+' + (imgs.length - 3) + "</span>" : "") + "</button>").join("") + "</div>" : "") +
      '<div class="sc-body"><div class="sc-tags"><span class="sc-medal">' + icon("trophy", "xs") + "모범 과제</span>" + (x.week ? '<span class="badge badge-neutral">' + Number(x.week) + "주차</span>" : "") + (x.author ? '<span class="sc-author">' + esc(x.author) + "</span>" : "") + "</div>" +
        "<h3>" + esc(x.title) + "</h3>" +
        (x.desc ? '<div class="sc-comment"><span class="sc-c-label">' + icon("message", "xs") + esc(D.brand.instructor) + " 코멘트</span>" + DB.rich(x.desc) + "</div>" : "") +
        (m && on("missions") && isOpen(w) ? '<a class="link-btn sc-go" href="#/missions/' + w.no + "/" + m.id + '">‘' + esc(m.title) + "’ 과제 하러 가기 " + icon("arrowRight", "sm") + "</a>" : "") +
      "</div></article>";
  }
  function showcaseZoom(id, i) {
    const x = (D.showcase || []).find((s) => s.id === id);
    if (!x) return;
    const imgs = x.images || [];
    openModal(x.title, '<div class="sc-zoom">' + imgs.map((im, k) => '<img src="' + esc(im.data || im.url) + '" alt="' + esc(x.title + " 사진 " + (k + 1)) + '"' + (k === Number(i) ? ' id="sc-zoom-at"' : "") + ">").join("") + "</div>", '<button class="btn btn-primary" data-action="modal-close">닫기</button>', true);
    const at = document.getElementById("sc-zoom-at"); if (at) at.scrollIntoView({ block: "start" });
  }

  /* ---------------- 학습 노트 ---------------- */
  // 주차마다 회고 질문(강사가 정함, 없으면 기본 질문)에 답하고, 강의 화면에서 적은 메모도 주차별로 모아 본다 (P.journal · P.notes)
  const promptsOf = (no) => { const own = (D.notePrompts || []).filter((x) => Number(x.week) === Number(no) && x.q); return own.length ? own : DB.NOTE_PROMPTS.map((q, i) => ({ id: "d" + i, q })); };
  function pageNotes() {
    const J = P.journal || {}, N = P.notes || {};
    const open = D.weeks.filter(isOpen);
    const cur = D.weeks.find((w) => isOpen(w) && todayStr() <= deadlineOf(w)) || open[open.length - 1];
    const answered = open.filter((w) => Object.keys((J[w.no] || {}).a || {}).some((k) => (J[w.no].a[k] || "").trim())).length;
    const memoCount = Object.keys(N).filter((k) => (N[k] || "").trim()).length;
    return '<div class="page">' + pageHead(ML("notes"), "주차마다 배운 것을 짧게 돌아보고, 강의 메모까지 한곳에 모아 두는 나만의 노트예요.") +
      '<section class="card nt-sum"><div class="nt-stat"><b>' + answered + "<small> / " + open.length + '주</small></b><span>회고 작성</span></div><div class="nt-stat"><b>' + memoCount + '<small>개</small></b><span>강의 메모</span></div>' +
        '<button type="button" class="btn btn-secondary btn-sm nt-export" data-action="notes-export">' + icon("download", "sm") + "노트 내려받기</button></section>" +
      (D.weeks.length ? D.weeks.map((w) => {
        if (!isOpen(w)) return '<section class="card nt-week locked"><div class="nt-head"><span class="nt-no">' + w.no + '</span><div><b>' + w.no + "주차 · " + esc(w.title) + '</b><small>' + icon("lock", "xs") + " " + fmtMD(openOf(w)) + "에 열려요</small></div></div></section>";
        const ans = (J[w.no] || {}).a || {};
        const memos = w.lessons.filter((l) => (N[l.id] || "").trim());
        const filled = promptsOf(w.no).filter((p) => (ans[p.id] || "").trim()).length;
        return '<details class="card nt-week"' + (w === cur ? " open" : "") + '><summary class="nt-head"><span class="nt-no">' + w.no + '</span><div><b>' + w.no + "주차 · " + esc(w.title) + "</b><small>" + (filled ? "회고 " + filled + "개 작성" : "아직 비어 있어요") + (memos.length ? " · 강의 메모 " + memos.length + "개" : "") + (w === cur ? " · 이번 주" : "") + "</small></div>" + icon("chevDown", "sm chev") + "</summary>" +
          '<div class="nt-qs">' + promptsOf(w.no).map((p, i) => '<label class="nt-q"><span class="nt-q-t"><i>Q' + (i + 1) + "</i>" + esc(p.q) + '</span><textarea class="textarea" rows="3" data-journal="' + w.no + '" data-q="' + esc(p.id) + '" placeholder="생각나는 대로 짧게 적어도 좋아요">' + esc(ans[p.id] || "") + "</textarea></label>").join("") +
            '<p class="tiny nt-state" id="nt-state-' + w.no + '">' + ((J[w.no] || {}).at ? fmtStamp((J[w.no] || {}).at) + " 저장됨" : "적으면 자동으로 저장돼요") + "</p></div>" +
          (memos.length ? '<div class="nt-memos"><p class="side-label">' + icon("pen", "xs") + " 강의 메모</p>" + memos.map((l) => '<a class="nt-memo" href="#/curriculum/' + esc(l.id) + '"><b>' + esc(l.title) + "</b><span>" + esc(N[l.id]) + "</span></a>").join("") + "</div>"
            : '<p class="tiny nt-hint">' + icon("pen", "xs") + " 강의 화면의 ‘내 메모’에 적은 내용도 여기에 모여요.</p>") +
        "</details>";
      }).join("") : '<section class="card">' + empty("notebookPen", "주차가 열리면 노트를 쓸 수 있어요.") + "</section>") + "</div>";
  }
  function exportNotes() {
    const J = P.journal || {}, N = P.notes || {}, lines = [D.brand.courseTitle + " · " + me.name + "님의 " + ML("notes"), ""];
    D.weeks.filter(isOpen).forEach((w) => {
      lines.push("■ " + w.no + "주차 · " + w.title);
      const ans = (J[w.no] || {}).a || {};
      promptsOf(w.no).forEach((p) => { if ((ans[p.id] || "").trim()) lines.push("Q. " + p.q, "A. " + ans[p.id].trim(), ""); });
      w.lessons.filter((l) => (N[l.id] || "").trim()).forEach((l) => lines.push("[강의 메모] " + l.title, N[l.id].trim(), ""));
      lines.push("");
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }));
    a.download = ML("notes").replace(/\s/g, "") + "_" + todayStr() + ".txt";
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------------- 용어 사전 ---------------- */
  // 강의에 나오는 용어를 가나다 순으로. 검색 · 분류 · 초성 색인. AI 조교도 이 풀이로 답한다
  let glCat = "전체";
  const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  const initialOf = (s) => {
    const t = String(s || "").trim(), c = t.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) { const ch = CHO[Math.floor((c - 0xac00) / 588)]; return { "ㄲ": "ㄱ", "ㄸ": "ㄷ", "ㅃ": "ㅂ", "ㅆ": "ㅅ", "ㅉ": "ㅈ" }[ch] || ch; }
    return /[a-z]/i.test(t.charAt(0)) ? "A-Z" : "0-9";
  };
  function glossaryList(q) {
    const t = String(q || "").trim().toLowerCase().replace(/\s/g, "");
    const list = (D.glossary || []).filter((g) => (glCat === "전체" || (g.category || "기타") === glCat) && (!t || (g.term + g.desc + (g.category || "")).toLowerCase().replace(/\s/g, "").indexOf(t) !== -1))
      .sort((a, b) => String(a.term).localeCompare(String(b.term), "ko"));
    if (!list.length) return empty("search", "찾는 용어가 없어요. " + esc(D.brand.botName) + "에게 물어보세요.");
    const groups = [];
    list.forEach((g) => { const k = initialOf(g.term); let grp = groups.find((x) => x.k === k); if (!grp) groups.push(grp = { k, items: [] }); grp.items.push(g); });
    return (t ? "" : '<nav class="gl-index" aria-label="초성 색인">' + groups.map((g) => '<a href="#gl-' + encodeURIComponent(g.k) + '" data-action="gl-jump" data-k="' + esc(g.k) + '">' + esc(g.k) + "</a>").join("") + "</nav>") +
      groups.map((g) => '<div class="gl-group" id="gl-' + encodeURIComponent(g.k) + '"><h3 class="gl-k">' + esc(g.k) + "</h3>" + g.items.map((x) =>
        '<article class="gl-item"><div class="gl-term"><b>' + esc(x.term) + "</b>" + (x.category ? '<span class="badge badge-neutral">' + esc(x.category) + "</span>" : "") + "</div><p>" + esc(x.desc) + "</p></article>").join("") + "</div>").join("");
  }
  function pageGlossary(r) {
    const G = D.glossary || [], q = r.params.get("q") || "";
    const cats = ["전체"].concat(G.map((g) => g.category || "기타").filter((c, i, a) => a.indexOf(c) === i));
    if (cats.indexOf(glCat) === -1) glCat = "전체";
    return '<div class="page">' + pageHead(ML("glossary"), "강의에 나오는 낯선 용어를 쉬운 말로 풀어 두었어요. 모르는 말이 나오면 여기서 찾아보세요.") +
      '<section class="card gl-card"><div class="search">' + icon("search") + '<input class="input" id="gl-search" type="search" value="' + esc(q) + '" placeholder="용어를 검색해 보세요 (예: ' + esc((G[0] || {}).term || "마진율") + ')" aria-label="용어 검색"></div>' +
        (cats.length > 2 ? '<div class="faq-cats" role="tablist">' + cats.map((c) => '<button type="button" class="chip' + (c === glCat ? " on" : "") + '" data-action="gl-cat" data-cat="' + esc(c) + '">' + esc(c) + " <span>" + (c === "전체" ? G.length : G.filter((g) => (g.category || "기타") === c).length) + "</span></button>").join("") + "</div>" : "") +
        '<div id="gl-list">' + glossaryList(q) + "</div></section>" +
      (on("bot") ? '<p class="tiny" style="margin-top:12px">' + icon("bot", "xs") + " " + esc(D.brand.botName) + "에게 ‘○○가 뭐예요?’라고 물어봐도 이 풀이로 답해 드려요.</p>" : "") + "</div>";
  }

  /* ---------------- 추가 메뉴 (마스터가 만든 자유 페이지) ---------------- */
  function pageCustom(r) {
    const item = DB.menuConfig(MID()).items.find((x) => x.key === r.parts[1]);
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
    return '<div class="page">' + pageHead(w.no + "주차 · " + w.title, "", crumb([[cur ? ML("curriculum") : ML("missions"), cur ? "#/curriculum" : "#/missions"], [w.no + "주차"]])) +
      '<section class="card empty">' + icon("lock") + '<p style="font-size:18px;font-weight:800;color:var(--ink);margin:0 0 6px">' + fmtMD(openOf(w)) + '에 공개됩니다</p><p style="margin:0 0 20px">' + esc(w.summary) + "</p>" +
      '<a class="btn btn-primary" href="' + (cur ? "#/curriculum" : "#/missions") + '">' + (cur ? ML("curriculum") + "으로" : "주차 목록으로") + "</a></section></div>";
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
  // 약관 글은 legal.js (두잉고 www.doogoclass.com 기준). 없을 때만 아래 짧은 안내
  const LEGAL = window.CLASS_LEGAL || {
    terms: ["이용약관", "본 플랫폼은 강사의 유료 강의 수강생에게 강의 영상, 과제 관리, 학습 자료를 제공합니다.\n\n1. 계정은 수강생 본인만 사용할 수 있으며 타인과 공유할 수 없습니다.\n2. 강의 영상과 자료의 저작권은 강사에게 있으며 무단 복제·배포를 금지합니다.\n3. 수강 기간이 끝난 뒤의 다시보기 기간은 공지사항으로 안내합니다.\n\n정식 약관은 서비스 오픈 시 확정 후 게시됩니다."],
    privacy: ["개인정보처리방침", "수집 항목: 이름, 휴대폰 번호 뒷자리 4자리, 과제 제출 내용\n이용 목적: 수강생 확인, 학습 진행 관리, 수료증 발급\n보관 기간: 수강 종료 후 1년 또는 수강생 요청 시 즉시 파기\n\n현재 체험 버전에서는 모든 기록이 이 기기의 브라우저에만 저장됩니다."],
    oss: ["오픈소스 라이선스", "Pretendard — SIL Open Font License 1.1 (© Kil Hyung-jin)\nInter — SIL Open Font License 1.1 (© The Inter Project Authors)\nLucide Icons — ISC License (© Lucide Contributors)"]
  };
  window.CLASS_LEGAL = LEGAL; // 두잉고 첫 화면 바닥의 약관 팝업도 같은 내용
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
    if (DB.remote.on) { serverSignup(ins, f, name, phone4, err); return; }
    const dup = DB.studentsOf(ins.id).find((x) => x.name.replace(/\s+/g, "") === name.replace(/\s+/g, "") && x.phone4 === phone4 && x.cohortId === f.cohort.value && (x.status === "pending" || x.status === "approved"));
    if (dup) { err.textContent = dup.status === "approved" ? "이 기수에 이미 승인된 수강생이에요. 바로 로그인해 주세요." : "이 기수에 이미 신청이 접수돼 있어요. 승인을 기다려 주세요."; return; }
    DB.data.students.push({ id: DB.uid("s"), instructorId: ins.id, cohortId: f.cohort.value, name, phone4, status: "pending", appliedAt: todayStr() });
    DB.save();
    openModal("신청이 접수됐어요", name + "님, " + ins.displayName + " 강사님이 확인 후 승인해 드릴게요.\n승인되면 이름과 전화번호 뒷자리로 로그인할 수 있어요.", '<button class="btn btn-primary" data-action="modal-close">확인</button>');
  }
  function serverSignup(ins, f, name, phone4, err) {
    const MSG = { "dup-approved": "이미 승인된 수강생이에요. 바로 로그인해 주세요.", "dup-pending": "이미 신청이 접수돼 있어요. 승인을 기다려 주세요.", cohort: "이 기수는 지금 신청을 받지 않아요. 다른 기수를 골라 주세요.", locked: "신청이 너무 많아 잠시 막혔어요. 15분 뒤에 다시 시도해 주세요." };
    const btn = f.querySelector("button[type=submit]");
    if (btn) btn.disabled = true;
    DB.remote.call("public", { action: "signup", iid: ins.id, cohortId: f.cohort.value, name, phone4 }).then((r) => {
      if (r.error) { err.textContent = MSG[r.error] || "신청하지 못했어요. 입력 내용을 확인해 주세요."; return; }
      openModal("신청이 접수됐어요", name + "님, " + ins.displayName + " 강사님이 확인 후 승인해 드릴게요.\n승인되면 이름과 전화번호 뒷자리로 로그인할 수 있어요.", '<button class="btn btn-primary" data-action="modal-close">확인</button>');
    }).catch(() => { err.textContent = "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."; }).then(() => { if (btn) btn.disabled = false; });
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
  // 화면별 마지막 스크롤 위치: 과제 제출 화면에서 ‘‹ 1주차’ · 뒤로 가기로 돌아오면 보던 자리 그대로
  const scrollMemo = {};
  let navTrail = [];
  function restoreScroll(prevKey, key) {
    const m = scrollMemo[key];
    const child = !!prevKey && prevKey.indexOf(key + "/") === 0;
    const back = !!m && m.to === prevKey && (child || navTrail[navTrail.length - 2] === key);
    if (back && navTrail[navTrail.length - 2] === key) navTrail.pop(); else navTrail = navTrail.concat(key).slice(-30);
    if (!back && !child) { window.scrollTo(0, 0); return; }
    const place = () => {
      if (back) { window.scrollTo(0, m.y); return; }
      // 다른 화면에서 바로 들어갔던 과제라면 목록에서 그 과제 카드가 보이게
      const el = document.querySelector('#main a[href="' + prevKey.replace(/"/g, "") + '"]');
      if (el) el.scrollIntoView({ block: "center" }); else window.scrollTo(0, 0);
    };
    place();
    setTimeout(place, 80);
  }
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
    if (TRACK === "vod" && r.parts[0] === "vodclass" && r.parts[1] && r.parts[1] !== "notes") setVp(decodeURIComponent(r.parts[1]));
    applyTheme();
    // 꺼진 메뉴로 들어오면 홈으로
    const top = r.parts[0];
    const allowed = top === "home" || (top === "page" ? DB.menuConfig(MID()).items.some((x) => x.key === r.parts[1] && x.on) : NAV_DEFS.some((n) => n.id === top) ? on(top) : true);
    if (!allowed) { history.replaceState(null, "", "#/home"); return render(); }
    if (!document.getElementById("app") || root.dataset.who !== me.id) { renderShell(); root.dataset.who = me.id; }
    document.getElementById("app").classList.remove("nav-open");
    document.getElementById("app").classList.toggle("vt-focus", TRACK === "vod" && top === "vodclass" && !!r.parts[1] && r.parts[1] !== "notes");
    renderSidebar(r);
    const pages = { home: (rr) => (TRACK === "vod" ? pageVodHome(rr) : pageHome(rr)), vodclass: pageVodClass, curriculum: pageCurriculum, replays: pageReplays, showcase: pageShowcase, notes: pageNotes, glossary: pageGlossary, missions: pageMissions, schedule: pageSchedule, notices: pageNotices, qna: pageQna, docs: pageDocs, bot: pageBot, library: pageLibrary, motivation: pageMotivation, channels: pageChannels, partners: pagePartners, certificate: pageCertificate, page: pageCustom };
    const fn = pages[r.parts[0]] || notFound;
    const main = document.getElementById("main");
    const prevKey = main.dataset.key, key = location.hash;
    if (prevKey && prevKey !== key) scrollMemo[prevKey] = { y: window.scrollY, to: key };
    // 휴대폰에서는 화면을 옮기면 AI봇 창을 닫는다 (반쯤 가린 채로 따라다니지 않게)
    if (prevKey !== key && window.matchMedia("(max-width: 720px)").matches) botOpen = false;
    main.innerHTML = fn(r) + (top === "library" ? watermark() : "");
    main.dataset.key = key;
    if (window.VOD && window.VOD.hydrate) window.VOD.hydrate(main);
    vtAfter();
    // 유료강의 자료실: 다른 메뉴에서 들어올 때마다 이용 안내 팝업
    if (top === "library" && lastTop !== "library") libNoticeModal();
    else document.body.classList.remove("lib-gated");
    if (top !== "motivation") { mvAuto = false; mvSel = null; }
    if (top !== "certificate") certPreview = false;
    lastTop = top;
    if (prevKey !== key) restoreScroll(prevKey, key);
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
    { const gl = e.target.closest && e.target.closest("a[data-guide]"); if (gl && isActive() && P) { const before = guideGroup(); P.guide = P.guide || {}; if (!P.guide[gl.dataset.guide]) { P.guide[gl.dataset.guide] = Date.now(); saveProgress(); setTimeout(() => guideDoneCheck(before), 300); } } }
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
      case "legal": { const doc = LEGAL[a.dataset.doc]; openModal(doc[0], window.CLASS_LEGAL_HTML ? window.CLASS_LEGAL_HTML(doc[1]) : esc(doc[1]), '<button class="btn btn-primary" data-action="modal-close">확인</button>', true); break; }
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
      case "guide-close": { P.guideClosed = P.guideClosed || {}; P.guideClosed[a.dataset.wk] = Date.now(); saveProgress(); render(); toast(Number(a.dataset.wk) === 1 ? "시작 가이드를 완료했어요! 이제 1주차 과제를 시작해 보세요." : a.dataset.wk + "주차 시작 가이드를 완료했어요!"); break; }
      case "toggle-guide": { const g = a.dataset.id, before = guideGroup(); P.guide = P.guide || {}; if (P.guide[g]) delete P.guide[g]; else P.guide[g] = Date.now(); saveProgress(); render(); guideDoneCheck(before); break; }
      case "read-all": P.readNotices = P.readNotices || {}; D.notices.forEach((n) => { P.readNotices[n.id] = Date.now(); }); saveProgress(); render(); break;
      case "toggle-doc": { const s = a.dataset.id; if (P.docs[s]) delete P.docs[s]; else P.docs[s] = Date.now(); saveProgress(); render(); break; }
      case "chip": sendChat(a.dataset.q); break;
      case "ask-bot": botOpen = true; DB.store.set(KEY_BOT, true); renderBotFab(route()); sendChat(a.dataset.q); break;
      case "clear-chat": P.chat = []; saveProgress(); refreshChats(); break;
      case "bot-open": document.getElementById("app").classList.remove("nav-open"); botOpen = true; DB.store.set(KEY_BOT, true); renderBotFab(route()); { const i = document.getElementById("chat-input-fab") || document.getElementById("chat-input-page"); if (i && !window.matchMedia("(max-width: 720px)").matches) i.focus(); } break;
      case "bot-close": botOpen = false; DB.store.set(KEY_BOT, false); renderBotFab(route()); break;
      case "not-ready": toast("자료를 준비하고 있어요. 올라오면 공지로 알려 드릴게요."); break;
      case "play": playModal(a.dataset.cat, a.dataset.id); break;
      case "cert-preview": certPreview = !certPreview; document.getElementById("main").innerHTML = pageCertificate(); if (certPreview) { const c = document.querySelector(".cert-wrap"); if (c) c.scrollIntoView({ behavior: "smooth", block: "start" }); } break;
      case "rp-week": rpWeek = a.dataset.k; { const y = window.scrollY; render(); window.scrollTo(0, y); } break;
      case "sc-week": scWeek = a.dataset.k; { const y = window.scrollY; render(); window.scrollTo(0, y); } break;
      case "toggle-replay": { const id = a.dataset.id; P.replays = P.replays || {}; if (P.replays[id]) delete P.replays[id]; else P.replays[id] = Date.now(); saveProgress(); render(); if (P.replays[id]) toast("다 본 영상으로 표시했어요."); break; }
      case "sc-zoom": showcaseZoom(a.dataset.id, a.dataset.i); break;
      case "notes-export": exportNotes(); break;
      case "gl-cat": glCat = a.dataset.cat; { const i = document.getElementById("gl-search"); document.getElementById("gl-list").innerHTML = glossaryList(i ? i.value : ""); document.querySelectorAll("[data-action=gl-cat]").forEach((b) => b.classList.toggle("on", b.dataset.cat === glCat)); } break;
      case "gl-jump": { e.preventDefault(); const g = document.getElementById("gl-" + encodeURIComponent(a.dataset.k)); if (g) g.scrollIntoView({ behavior: "smooth", block: "start" }); break; }
      case "wk-filter": wkFilter[a.dataset.grp] = a.dataset.k; { const y = window.scrollY; document.getElementById("main").innerHTML = pageWeek(route().parts[1]); window.scrollTo(0, y); } break;
      case "lib-gate-ok": document.body.classList.remove("lib-gated"); closeModal(); break;
      case "mv-pick": {
        mvSel = a.dataset.id; mvAuto = true;
        document.getElementById("main").innerHTML = pageMotivation();
        const st = document.getElementById("mv-stage");
        if (st && st.getBoundingClientRect().top < 60) st.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
      }
      case "video-play": {
        if (e.target.closest(".vp-ext")) return; // 외부 링크는 그대로 연다
        const box = a.closest(".video");
        box.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + esc(box.dataset.yid) + '?autoplay=1&rel=0" title="영상" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>' +
          '<a class="video-out" href="https://www.youtube.com/watch?v=' + esc(box.dataset.yid) + '" target="_blank" rel="noopener">재생이 안 되면 유튜브에서 보기 ' + icon("arrowUpRight", "xs") + "</a>";
        break;
      }
      case "print": { const el = document.querySelector(".cert-wrap .cert") || document.querySelector(".cert"); if (window.DGFILE && el) window.DGFILE.pdfBtn(a, el, "수료증-" + ((me && me.name) || "수강생") + ".pdf", { margin: 8, title: "수료증" }, (msg) => toast(msg)); else window.print(); break; }
      case "calc-load": { const it = calcItems().find((x) => x.id === a.dataset.id); if (!it) break; calcVals = Object.assign({}, CALC_DEF, it.v); calcEdit = it.id; render(); const c = document.getElementById("calc"); if (c) c.scrollIntoView({ block: "start", behavior: "smooth" }); toast("‘" + it.name + "’ 숫자를 계산기에 불러왔어요."); break; }
      case "vod-mode": { try { localStorage.setItem(VMODE_KEY, vodMode() === "dark" ? "light" : "dark"); } catch (e2) {} applyTheme(); a.innerHTML = modeInner(); toast(vodMode() === "dark" ? "블랙 화면으로 바꿨어요." : "화이트 화면으로 바꿨어요."); break; }
      case "vt-tab": {
        vtTab = a.dataset.k;
        document.querySelectorAll(".vt-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.k === vtTab));
        document.querySelectorAll(".vt-pane").forEach((p) => p.classList.toggle("on", p.dataset.pane === vtTab));
        if (vtTab === "note") { const ta = document.getElementById("vt-note-text"); if (ta) { if (!window.matchMedia("(min-width: 1101px)").matches) document.querySelector(".vt-side").scrollIntoView({ behavior: "smooth", block: "start" }); ta.focus({ preventScroll: true }); } }
        break;
      }
      case "vt-filter": vtFilter = a.dataset.k; if (document.querySelector(".vt")) vtPaintNotes(); else render(); break;
      case "vt-now": { const t = vtNow(), tf = document.getElementById("vt-note-t"); if (t == null) toast("영상 시간을 읽지 못했어요. 3:12처럼 직접 적어 주세요.", "warn"); else if (tf) tf.value = fmtT(t); break; }
      case "vt-note-save": vtSaveNote(); break;
      case "vt-seek": { const t = Number(a.dataset.t) || 0; if (!vtSeek(t)) toast("강사님이 영상을 연결하면 " + fmtT(t) + " 장면으로 바로 이동해요."); break; }
      case "vt-note-todo": { const f = findNote(a.dataset.id); if (!f) break; f.n.done = a.checked; f.n.upd = Date.now(); VX().save(); const li = a.closest(".vt-nt"); if (li) li.classList.toggle("is-done", a.checked); break; }
      case "vt-note-del": {
        const f = findNote(a.dataset.id); if (!f) break;
        if (!a.classList.contains("arm")) { a.classList.add("arm"); a.innerHTML = "삭제?"; setTimeout(() => { if (a.isConnected) { a.classList.remove("arm"); a.innerHTML = icon("trash", "xs"); } }, 3000); break; }
        const arr = notesAll(f.pid); arr.splice(arr.indexOf(f.n), 1); VX().save();
        if (document.querySelector(".vt")) vtPaintNotes(); else render(); toast("노트를 지웠어요."); break;
      }
      case "vt-note-edit": {
        const f = findNote(a.dataset.id), li = a.closest(".vt-nt"); if (!f || !li || li.querySelector(".vt-edit")) break;
        const box = li.querySelector(".vt-nt-p, .vt-todo"); if (!box) break;
        box.outerHTML = '<div class="vt-edit"><textarea class="textarea" rows="3" maxlength="2000">' + esc(f.n.text) + '</textarea><div class="vt-edit-f"><button type="button" class="btn btn-secondary btn-sm" data-action="vt-note-ecancel">취소</button><button type="button" class="btn btn-primary btn-sm" data-action="vt-note-esave" data-id="' + esc(f.n.id) + '">저장</button></div></div>';
        const ta = li.querySelector(".vt-edit textarea"); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); break;
      }
      case "vt-note-ecancel": if (document.querySelector(".vt")) vtPaintNotes(); else render(); break;
      case "vt-note-esave": { const f = findNote(a.dataset.id), ta = a.closest(".vt-edit") && a.closest(".vt-edit").querySelector("textarea"); if (!f || !ta) break; const v = ta.value.trim(); if (!v) { toast("내용을 적어 주세요.", "warn"); break; } f.n.text = v.slice(0, 2000); f.n.upd = Date.now(); VX().save(); if (document.querySelector(".vt")) vtPaintNotes(); else render(); toast("노트를 고쳤어요."); break; }
      case "vt-note-ask": {
        const f = findNote(a.dataset.id); if (!f) break;
        const x = vodList().find((v) => v.p.id === f.pid), l = x ? VX().lessons(x.p).find((y) => y.id === f.n.lid) : null;
        const ref = (x ? x.p.title : "") + (l ? " · " + l.title : "") + (f.n.t != null ? " (" + fmtT(f.n.t) + ")" : "");
        if (!preview && coachN() <= 0) { const cp = addPid("coachOf"); toast("1:1 코칭권이 있으면 이 노트를 강사님께 바로 보낼 수 있어요.", "warn"); if (cp) location.hash = "#/vod/checkout/" + cp + "?item=coach"; break; }
        try { sessionStorage.setItem("vt-ask", JSON.stringify({ title: f.n.text.split("\n")[0].slice(0, 70), body: "[강의] " + ref + "\n\n" + f.n.text, nid: f.n.id })); } catch (e2) {}
        location.hash = "#/qna/requests/new"; break;
      }
      case "vt-note-dl": {
        const txt = notesText(a.dataset.p || "all");
        try { const url = URL.createObjectURL(new Blob(["\ufeff" + txt], { type: "text/plain;charset=utf-8" })), dl = document.createElement("a"); dl.href = url; dl.download = "강의노트_" + todayStr() + ".txt"; document.body.appendChild(dl); dl.click(); setTimeout(() => { URL.revokeObjectURL(url); dl.remove(); }, 1500); toast("노트를 텍스트 파일로 내려받았어요."); }
        catch (e2) { toast("이 브라우저에서는 내려받기가 막혀 있어요. ‘복사’를 이용해 주세요.", "warn"); }
        break;
      }
      case "vt-note-copy": { const txt = notesText("all"); if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => toast("노트를 복사했어요. 메모장 · 카톡에 붙여 넣어 보세요."), () => toast("복사가 막혀 있어요. ‘내려받기’를 이용해 주세요.", "warn")); else toast("복사가 막혀 있어요. ‘내려받기’를 이용해 주세요.", "warn"); break; }
      case "vt-print": { const el = document.querySelector(".page.vn") || document.querySelector(".page"); if (window.DGFILE && el) window.DGFILE.pdfBtn(a, el, "내노트_" + todayStr() + ".pdf", { width: 820, title: "내 노트" }, (msg) => toast(msg)); else window.print(); break; }
      case "req-cancel": { const i = (P.questions || []).findIndex((x) => x.id === a.dataset.id && !x.answer); if (i < 0) break; if (a.dataset.arm !== "1") { a.dataset.arm = "1"; a.textContent = "한 번 더 누르면 취소돼요"; setTimeout(() => { if (a.isConnected) { a.dataset.arm = ""; a.textContent = "취소하기"; } }, 3000); break; } const qq = P.questions[i]; P.questions.splice(i, 1); saveProgress(); if (qq.coach && me.vodMid && VX() && VX().giveBackCoach) VX().giveBackCoach(me.vodMid, qq.id); location.hash = "#/qna/requests"; toast(qq.coach ? "질문을 취소했어요. 코칭권 1회를 돌려드렸어요." : "요청을 취소했어요."); break; }
      case "vt-mat": if (a.dataset.m === "dl") { const st = DB.session.student(), vm = (me && me.vodMid) || (st && st.vodMid), mp = /^#\/vodclass\/([^/?]+)/.exec(location.hash); if (vm && mp && VX().markMat) VX().markMat(vm, decodeURIComponent(mp[1])); } VX().matOpen({ url: a.dataset.u, name: a.dataset.n }, a.dataset.m).then((ok) => { if (!ok) toast("이 브라우저에 저장된 파일이 아니에요. 강사님이 다시 올리면 받을 수 있어요.", "warn"); else if (a.dataset.m === "dl") toast("수업 자료를 내려받았어요."); }); break;
      case "vt-dl": toast("수업 자료를 내려받고 있어요. 안 열리면 ‘미리보기’에서 저장할 수 있어요."); break;
      case "vt-fs": { const st = document.getElementById("vt-stage"); if (!st) break; const d = document; if (d.fullscreenElement) d.exitFullscreen && d.exitFullscreen(); else if (st.requestFullscreen) st.requestFullscreen().catch(() => toast("이 화면에서는 전체 화면을 쓸 수 없어요.", "warn")); else if (st.webkitRequestFullscreen) st.webkitRequestFullscreen(); break; }
      case "vod-done": {
        const X = VX(); if (!X || !me.vodMid) break;
        if (!X.markDone(me.vodMid, a.dataset.p, a.dataset.l)) { toast("수강 기간이 끝난 강의예요.", "warn"); break; }
        const x = vodList().find((v) => v.p.id === a.dataset.p), lz = x ? X.lessons(x.p) : [], k = lz.findIndex((l) => l.id === a.dataset.l), nx = lz[k + 1];
        checkLevelUp();
        if (nx) location.hash = learnHref(a.dataset.p, nx.id); else { render(); toast(vodPctOf(x) >= 100 ? "모든 강의를 끝까지 봤어요! DOOGO CLASS 클래스 페이지에서 후기를 남겨 주세요." : "완료했어요."); }
        break;
      }
      case "calc-new": calcEdit = ""; render(); { const n = document.getElementById("c-name"); if (n) n.focus(); } break;
      case "calc-del": { const it = calcItems().find((x) => x.id === a.dataset.id); if (!it || !confirm("‘" + it.name + "’을 내 제품 마진표에서 지울까요?")) break; P.calcItems = calcItems().filter((x) => x !== it); if (calcEdit === it.id) calcEdit = ""; if (saveProgress()) { render(); toast("지웠어요."); } break; }
    }
  });
  // 강의실 노트: 임시 저장 · Ctrl + Enter 저장 · 노트 칸을 누르면 영상 시간 채우기 / 내 노트 검색
  document.addEventListener("input", (e) => {
    if (!isActive()) return;
    if (e.target.id === "vt-note-text") { const w = document.querySelector(".vt"); if (w) draftSet(w.dataset.p, w.dataset.l, e.target.value); }
    else if (e.target.id === "vn-q") { vtQ = e.target.value; const pos = e.target.selectionStart; render(); const i = document.getElementById("vn-q"); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (x) {} } }
  });
  document.addEventListener("keydown", (e) => { if (isActive() && e.target.id === "vt-note-text" && e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); vtSaveNote(); } });
  document.addEventListener("focusin", (e) => { if (!isActive() || e.target.id !== "vt-note-text") return; const tf = document.getElementById("vt-note-t"), t = vtNow(); if (tf && !tf.value && t != null && t > 0) tf.value = fmtT(t); });
  window.addEventListener("message", (e) => {
    let d = e.data; if (typeof d === "string") { if (d.charAt(0) !== "{") return; try { d = JSON.parse(d); } catch (x) { return; } }
    if (!d || typeof d !== "object") return;
    if (d.method === "getCurrentTime" && typeof d.value === "number") vtLast = { t: d.value, at: Date.now() };
    else if (d.event === "infoDelivery" && d.info && typeof d.info.currentTime === "number") vtLast = { t: d.info.currentTime, at: Date.now() };
  });
  setInterval(() => {
    const f = document.querySelector(".vt-stage iframe"); if (!f || !f.contentWindow || document.hidden) return;
    try { if (/vimeo/.test(f.src)) f.contentWindow.postMessage(JSON.stringify({ method: "getCurrentTime" }), "*"); else if (/youtube/.test(f.src)) f.contentWindow.postMessage(JSON.stringify({ event: "listening", id: "vt" }), "*"); } catch (x) {}
  }, 1000);
  document.addEventListener("submit", (e) => {
    if (!isActive()) return;
    const f = e.target;
    if (f.id === "login-form") { e.preventDefault(); if (f.name) doLogin(f); return; }
    if (f.id === "signup-form") { e.preventDefault(); doSignup(f); return; }
    if (f.id === "submit-form") { e.preventDefault(); submitMission(f); return; }
    if (f.id === "calc-save") { e.preventDefault(); saveCalc(f); return; }
    if (f.id === "request-form") {
      e.preventDefault();
      const title = f.title.value.trim(), body = f.body.value.trim();
      if (!title || !body) { toast("제목과 내용을 모두 적어 주세요.", "warn"); return; }
      const vod = TRACK === "vod";
      if (vod && !preview && coachN() <= 0) { toast("남은 1:1 코칭권이 없어요. DOOGO CLASS에서 코칭권을 사면 질문할 수 있어요.", "warn"); location.hash = "#/qna"; return; }
      const q = { id: DB.uid("q"), category: f.category.value, title, body, images: reqDraft.slice(), at: Date.now(), answer: "", answeredAt: 0 };
      if (vod) q.coach = true;
      P.questions.push(q);
      if (!saveProgress()) { P.questions.pop(); return; }
      if (vod && !preview && me.vodMid) VX().useCoach(me.vodMid, INS.id, q.id);
      if (vod) vtAskDone(q.id);
      reqDraft = [];
      location.hash = "#/qna/requests/" + q.id;
      toast(vod ? "코칭 질문을 남겼어요. 코칭권 1회가 차감됐어요" + (preview ? "" : " (남은 " + coachN() + "회)") + "." : "1:1 요청을 남겼어요. 강사님 답변이 달리면 여기서 확인할 수 있어요.");
      return;
    }
    if (f.hasAttribute("data-chat-form")) { e.preventDefault(); const v = f.q.value; f.q.value = ""; sendChat(v); f.q.focus(); }
  });
  let noteTimer = null, journalTimer = null;
  document.addEventListener("input", (e) => {
    if (!isActive()) return;
    const t = e.target;
    if (t.id === "lesson-note") {
      clearTimeout(noteTimer);
      const st = document.getElementById("note-state"); if (st) st.textContent = "저장 중…";
      noteTimer = setTimeout(() => { P.notes = P.notes || {}; const v = t.value.trim(); if (v) P.notes[t.dataset.id] = t.value; else delete P.notes[t.dataset.id]; saveProgress(); const s2 = document.getElementById("note-state"); if (s2) s2.textContent = "저장됨"; }, 500);
      return;
    }
    if (t.id === "gl-search") { document.getElementById("gl-list").innerHTML = glossaryList(t.value); return; }
    if (t.dataset && t.dataset.journal) {
      const wk = t.dataset.journal, st = document.getElementById("nt-state-" + wk);
      if (st) st.textContent = "저장 중…";
      clearTimeout(journalTimer);
      journalTimer = setTimeout(() => {
        P.journal = P.journal || {};
        const j = P.journal[wk] = P.journal[wk] || { a: {} };
        j.a = j.a || {};
        document.querySelectorAll('[data-journal="' + wk + '"]').forEach((el) => { if (el.value.trim()) j.a[el.dataset.q] = el.value; else delete j.a[el.dataset.q]; });
        j.at = Date.now();
        if (!Object.keys(j.a).length) delete P.journal[wk];
        saveProgress();
        const s2 = document.getElementById("nt-state-" + wk); if (s2) s2.textContent = "방금 저장됨";
      }, 600);
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
    if (e.target.id === "vp-pick") { setVp(e.target.value); if (location.hash === "#/home") render(); else location.hash = "#/home"; toast("‘" + (VX().product(VP) || {}).title + "’ 강의실로 바꿨어요."); }
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
    if (modalRoot.querySelector(".lib-gate")) return; // 자료실 안내는 ‘확인’을 눌러야 닫힌다
    if (modalRoot.innerHTML) closeModal();
    const app = document.getElementById("app");
    if (app) app.classList.remove("nav-open");
  });

  // 썸네일을 못 불러오면(네트워크 차단 등) 이미지를 지우고 기본 카드를 보여 준다
  document.addEventListener("error", (e) => { const t = e.target; if (t && t.tagName === "IMG" && t.closest && t.closest(".lesson-thumb, .video, .vod-thumb, .mv-tile-img")) t.remove(); }, true);

  window.StudentApp = { render, mount };
})();

/* 두잉고 시안: 아래 탭 막대 — 지금 화면에 맞는 탭 표시 */
(function () {
  function mark() { var h = location.hash || "#/home", best = null, bl = -1; document.querySelectorAll(".bw-tab[href]").forEach(function (a) { var k = a.getAttribute("href"); a.classList.remove("on"); if ((h === k || (!/^#\/center(\/master)?$/.test(k) && (h.indexOf(k + "/") === 0 || h.indexOf(k + "?") === 0))) && k.length > bl) { best = a; bl = k.length; } }); if (best) best.classList.add("on"); }
  window.addEventListener("hashchange", function () { setTimeout(mark, 0); });
  new MutationObserver(function () { if (document.querySelector(".bw-tabbar")) mark(); }).observe(document.getElementById("root") || document.body, { childList: true });
  mark();
})();
