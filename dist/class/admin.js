/* 두고 클래스 — 강사센터 · 마스터 관리자
 *
 *  #/center/login            로그인 (탭: 강사 / 마스터)
 *  #/center                  강사 대시보드 (마스터는 #/center/master)
 *  #/center/<메뉴>            수강생·기수·과제 검수·문의·콘텐츠 관리
 *  #/center/master/<메뉴>     강사 플랫폼 분양·전체 수강생
 *
 *  강사 로그인 = 강사 이름 + 전화번호 뒷자리, 마스터 = ADMIN / ADMIN (대소문자 무관)
 */
(function () {
  "use strict";

  const root = document.getElementById("root");
  const modalRoot = document.getElementById("modal-root");
  const toastRoot = document.getElementById("toast-root");
  const { esc } = DB;
  const { DOW, todayStr, parseDate, fmtMD, fmtFull, fmtStamp, addDays } = DB.date;
  const icon = window.icon;
  const isActive = () => document.body.dataset.mode === "admin";

  let S = null; // 관리자 세션 { role: "instructor"|"master", instructorId?, actingAs? }
  let loginTab = "instructor";
  let confirmFn = null;
  const ui = { stuCohort: "all", stuStatus: "pending", stuQuery: "", picked: new Set(), revCohort: null, revWeek: "all", revFilter: "pending", revPicked: new Set(), qFilter: "open", libTab: "ebook", schedCohort: null, mIns: "all", mStatus: "all", mMenuIns: null, mRepIns: "all" };

  const STU = {
    pending: { label: "승인 대기", cls: "warn" },
    approved: { label: "수강 중", cls: "ok" },
    rejected: { label: "거절", cls: "bad" },
    withdrawn: { label: "탈퇴", cls: "mute" }
  };
  const COHORT_CLS = { upcoming: "info", running: "ok", ended: "mute" };

  /* ---------------- 공통 ---------------- */
  function route() {
    const h = (location.hash || "").replace(/^#\/?center\/?/, "");
    const [path, query] = h.split("?");
    return { parts: path.split("/").filter(Boolean), params: new URLSearchParams(query || "") };
  }
  const IID = () => (S.role === "instructor" ? S.instructorId : S.actingAs);
  const INS = () => DB.instructor(IID());
  const C = () => DB.content(IID());
  // 커리큘럼 편집 화면에서 지금 고른 커리큘럼 (기본: 기본 커리큘럼)
  const CUR = () => { const cu = DB.curriculum(IID(), ui.curId); ui.curId = cu ? cu.id : "main"; return cu; };
  const usedBy = (curId) => DB.cohortsOf(IID()).filter((co) => (co.curriculumId || "main") === curId);
  const classText = (co) => (co.classDow !== undefined && co.classDow !== null && co.classDow !== "" ? "매주 " + DOW[Number(co.classDow)] + "요일" : "주차 시작일") + (co.classTime ? " " + co.classTime : "");
  const pill = (label, cls) => '<span class="a-pill ' + cls + '">' + esc(label) + "</span>";
  const btn = (label, action, cls, attrs) => '<button type="button" class="a-btn ' + (cls || "a-btn-ghost") + '" data-action="' + action + '"' + (attrs || "") + ">" + label + "</button>";
  const head = (title, sub, right) => '<header class="a-head"><div><h1>' + esc(title) + "</h1>" + (sub ? "<p>" + sub + "</p>" : "") + "</div>" + (right ? '<div class="a-head-actions">' + right + "</div>" : "") + "</header>";
  const emptyBox = (ic, text, extra) => '<div class="a-empty">' + icon(ic) + "<p>" + text + "</p>" + (extra || "") + "</div>";
  function toast(msg, kind) {
    const t = document.createElement("div");
    t.className = "toast a-toast" + (kind === "warn" ? " warn" : "");
    t.innerHTML = icon(kind === "warn" ? "alert" : "check", "sm") + "<span>" + esc(msg) + "</span>";
    toastRoot.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }
  function openModal(title, body, actions, size) {
    modalRoot.innerHTML = '<div class="a-modal-backdrop" data-action="modal-bg"><div class="a-modal ' + (size || "") + '" role="dialog" aria-modal="true" aria-labelledby="a-modal-title">' +
      '<div class="a-modal-head"><h3 id="a-modal-title">' + esc(title) + '</h3><button class="a-icon-btn" data-action="modal-close" aria-label="닫기">' + icon("x") + "</button></div>" +
      '<div class="a-modal-body">' + body + "</div>" + (actions ? '<div class="a-modal-actions">' + actions + "</div>" : "") + "</div></div>";
    const f = modalRoot.querySelector(".a-modal-body input:not([type=checkbox]), .a-modal-body textarea, .a-modal-body select");
    if (f) f.focus();
  }
  const closeModal = () => { modalRoot.innerHTML = ""; confirmFn = null; };
  function confirmModal(title, msg, okLabel, danger, fn) {
    openModal(title, '<p class="a-confirm">' + msg + "</p>", btn("취소", "modal-close") + btn(okLabel, "confirm-ok", danger ? "a-btn-danger" : "a-btn-primary"));
    confirmFn = fn;
  }
  const commit = (msg) => { DB.save(); closeModal(); render(); if (msg) toast(msg); };

  function studentProgressRows(iid, filter) {
    return DB.studentsOf(iid).filter(filter || (() => true)).map((s) => {
      const p = DB.progress(s.id), co = DB.cohort(s.cohortId);
      return { s, p, st: DB.stats(p, iid, co), lv: DB.level(p, iid, co) };
    });
  }
  // 수강생 성장 단계 (과제 성취 기준): 씨앗 → 풀잎 → 가지 → 나무 → 숲
  const levelOfStudent = (s) => DB.level(DB.progress(s.id), s.instructorId, DB.cohort(s.cohortId));
  const lvBadge = (lv) => '<span class="a-lv lv-' + lv.cur.key + '" title="' + esc(lv.cur.name + " · " + (lv.idx + 1) + "/" + lv.steps.length + "단계" + (lv.next ? " · 다음까지 " + lv.needText : "")) + '">' + icon(lv.cur.icon, "xs") + esc(lv.cur.name) + "<small>" + (lv.idx + 1) + "/" + lv.steps.length + "</small></span>";
  // 단계별 인원과 이름 (대시보드 · 마스터)
  function levelBoard(rows, compact) {
    if (!rows.length) return emptyBox("users", "수강 중인 학생이 없어요.");
    const keys = {}; rows.forEach((r) => r.lv.steps.forEach((st) => { keys[st.key] = true; }));
    const steps = DB.LEVEL_SET.filter((st) => keys[st.key]);
    const max = Math.max(1, ...steps.map((st) => rows.filter((r) => r.lv.cur.key === st.key).length));
    return '<div class="a-lvboard">' + steps.slice().reverse().map((st) => {
      const who = rows.filter((r) => r.lv.cur.key === st.key).sort((a, b) => b.st.pct - a.st.pct);
      return '<div class="a-lvrow"><span class="a-lv lv-' + st.key + '">' + icon(st.icon, "xs") + esc(st.name) + "</span>" +
        '<div class="a-lvbar"><span style="width:' + Math.round(who.length / max * 100) + '%"></span></div><b class="num">' + who.length + "명</b>" +
        (compact || !who.length ? "" : '<div class="a-lvwho">' + (who.length ? who.map((r) => '<button type="button" class="a-lvchip" data-action="student-open" data-id="' + r.s.id + '">' + esc(r.s.name) + " <small>" + r.st.pct + "%</small></button>").join("") : '<span class="a-muted">-</span>') + "</div>") + "</div>";
    }).join("") + "</div>";
  }
  function allSubmissions(iid, cohortId) {
    const c = DB.content(iid);
    const out = [];
    DB.studentsOf(iid).filter((s) => s.status === "approved" && (!cohortId || cohortId === "all" || s.cohortId === cohortId)).forEach((s) => {
      const p = DB.progress(s.id), co = DB.cohort(s.cohortId);
      (co ? DB.weeksOf(co) : c.weeks).forEach((w) => w.missions.forEach((m) => {
        const list = p.submissions[m.id];
        if (!list || !list.length) return;
        const sub = list[list.length - 1];
        out.push({ s, p, w, m, sub, count: list.length, review: sub.review ? sub.review.status : "pending" });
      }));
    });
    return out.sort((a, b) => b.sub.at - a.sub.at);
  }
  function counts(iid) {
    return {
      pending: DB.studentsOf(iid).filter((s) => s.status === "pending").length,
      review: allSubmissions(iid, "all").filter((x) => x.review === "pending").length,
      questions: DB.requests(iid).filter((x) => !x.q.answer).length
    };
  }

  /* ---------------- 로그인 ---------------- */
  function renderLogin() {
    const ins = loginTab === "instructor";
    document.title = (ins ? "강사센터" : "마스터 관리자") + " · 로그인";
    const L = ins
      ? { theme: "blue", tag: "강사센터", eyebrow: "DOOGO INSTRUCTOR CENTER", h: "수강생 관리부터<br>커리큘럼까지 한 곳에서", sub: "기수별 수강생 승인, 과제 검수, 강의 영상과 일정 업로드를 간편하게 운영할 수 있습니다.", icons: ["users", "play", "calendar", "settings"], label: "INSTRUCTOR", title: "강사 로그인", lead: "강사 이름과 전화번호 뒷자리로 로그인하세요." }
      : { theme: "violet", tag: "마스터", eyebrow: "DOOGO MASTER CONSOLE", h: "강사 플랫폼을<br>분양하고 관리하세요", sub: "새 강사 플랫폼 개설, 운영 중지, 강사센터 대신 접속과 전체 수강생 현황을 한 곳에서 봅니다.", icons: ["store", "layers", "users", "shieldCheck"], label: "MASTER", title: "마스터 로그인", lead: "운영자 전용 관리자 계정으로 로그인하세요." };
    root.innerHTML =
      '<main class="adm a-login a-login-' + L.theme + '">' +
        '<section class="a-login-brand">' + window.loginArt(L.theme, L.icons) +
          '<span class="a-logo a-logo-doogo">' + window.doogoLogo("white") + '<span class="a-logo-sub">CLASS</span><em>' + L.tag + "</em></span>" +
          '<div class="a-login-hero"><p class="a-eyebrow">' + L.eyebrow + "</p><h2>" + L.h + "</h2><p>" + L.sub + "</p></div>" +
          '<div class="a-login-foot"><span>© 2026 (주) 두고홀딩스 · doogo</span><span>Secure ' + (ins ? "instructor" : "admin") + " workspace</span></div>" +
        "</section>" +
        '<section class="a-login-panel">' +
          '<div class="a-login-topright"><span>수강생이신가요?</span><a class="a-btn a-btn-primary a-btn-sm" href="#/login" data-action="to-student">바로가기</a></div>' +
          '<div class="a-login-stack"><div class="a-login-card">' +
            '<p class="a-login-label">' + window.doogoLogo("color") + "<span>" + L.label + "</span></p>" +
            "<h1>" + L.title + '</h1><p class="a-muted a-center">' + L.lead + "</p>" +
            '<div class="a-seg" role="tablist">' +
              '<button type="button" role="tab" aria-selected="' + ins + '" class="' + (ins ? "on" : "") + '" data-action="login-tab" data-tab="instructor">' + icon("user", "sm") + "강사</button>" +
              '<button type="button" role="tab" aria-selected="' + !ins + '" class="' + (!ins ? "on" : "") + '" data-action="login-tab" data-tab="master">' + icon("shieldCheck", "sm") + "마스터 관리자</button>" +
            "</div>" +
            '<form id="a-login-form" class="a-form" novalidate>' +
              '<div class="a-field"><label for="al-id">' + (ins ? "강사 이름" : "아이디") + '</label><div class="a-input-icon">' + icon("user", "sm") + '<input class="a-input" id="al-id" name="uid" autocomplete="' + (ins ? "name" : "username") + '" placeholder="' + (ins ? "예: 문원오" : "관리자 아이디") + '"></div></div>' +
              '<div class="a-field"><label for="al-pw">' + (ins ? "전화번호 뒷자리" : "비밀번호") + '</label><div class="a-input-icon">' + icon("lock", "sm") + '<input class="a-input" id="al-pw" name="pw" type="password"' + (ins ? ' inputmode="numeric" maxlength="4" placeholder="숫자 4자리"' : ' autocomplete="current-password" placeholder="비밀번호"') + '>' +
                '<button type="button" class="a-eye" data-action="toggle-pw" aria-label="보기">' + icon("eye", "sm") + "</button></div>" +
                '<small class="a-field-note">' + (ins ? "휴대폰 번호 뒷자리 4자리" : "관리자 계정 전용") + "</small></div>" +
              '<p class="a-error" id="al-error" role="alert"></p>' +
              '<button class="a-btn a-btn-primary a-btn-lg a-btn-block" type="submit">로그인</button>' +
              '<p class="a-login-help">' + (ins ? "마스터에서 등록한 강사 정보로 로그인해 주세요" : "관리자 전용 계정으로 로그인해 주세요") + "</p>" +
            "</form>" +
          "</div>" +
          '<a class="a-login-alt" href="#/login" data-action="to-student">' + icon("home", "sm") + "수강생 센터 보기 " + icon("arrowUpRight", "xs") + "</a>" +
          '<div class="a-demo">' + (ins ? "체험 계정 · 이름 <b>문원오</b> / 뒷자리 <b>2186</b>" : "체험 계정 · <b>ADMIN</b> / <b>ADMIN</b> (대소문자 상관없음)") + "</div>" +
        "</div></section>" +
      "</main>";
  }
  function doLogin(f) {
    const id = f.uid.value.trim(), pw = f.pw.value.trim();
    const err = document.getElementById("al-error");
    if (loginTab === "master") {
      if (id.toUpperCase() === "ADMIN" && pw.toUpperCase() === "ADMIN") { S = { role: "master" }; DB.session.setAdmin(S); DB.store.remove("moonclass:after-login"); location.hash = "#/center/master"; toast("마스터 관리자로 로그인했어요."); }
      else err.textContent = "아이디 또는 비밀번호가 맞지 않아요.";
      return;
    }
    const ins = DB.data.instructors.find((x) => x.name.replace(/\s+/g, "") === id.replace(/\s+/g, "") && x.phone4 === pw);
    if (!ins) { err.textContent = "등록된 강사 정보와 일치하지 않아요. 이름과 뒷자리를 확인해 주세요."; return; }
    if (ins.status !== "active") { err.textContent = "운영이 중지된 플랫폼이에요. 마스터 관리자에게 문의해 주세요."; return; }
    S = { role: "instructor", instructorId: ins.id };
    DB.session.setAdmin(S);
    const next = DB.store.get("moonclass:after-login", ""); DB.store.remove("moonclass:after-login");
    location.hash = next && /^#\/center\/(?!master)/.test(next) ? next : "#/center";
    toast(ins.name + " 강사님, 환영합니다!");
  }
  function logout() { S = null; DB.session.setAdmin(null); location.hash = "#/center/login"; }

  /* ---------------- 셸 ---------------- */
  function instructorNav() {
    const iid = IID(), n = counts(iid), on = (k) => DB.menuOn(iid, k);
    const content = [
      ["brand", "기본 정보 · 색상 · AI봇", "settings", null],
      ["menus", "메뉴 구성", "sliders", null],
      ["guide", "시작 가이드 · 자주 찾는 페이지", "sparkles", null],
      ["curriculum", "커리큘럼", "book", "curriculum"],
      ["missions", "과제", "clipboard", "missions"],
      ["schedule", "강의 일정", "calendar", "schedule"],
      ["notices", "공지사항", "megaphone", "notices"],
      ["faq", "Q&A 자주 묻는 질문", "help", "qna"],
      ["docs", "서류 준비 가이드", "file", "docs"],
      ["library", "유료강의 자료실", "library", "library"],
      ["motivation", "동기부여", "flame", "motivation"],
      ["channels", "1:1 소통채널", "headset", "channels"],
      ["partners", "제휴채널", "handshake", "partners"]
    ].filter((x) => !x[3] || on(x[3])).map((x) => x.slice(0, 3));
    if (customPages(iid).length) content.push(["pages", "추가 메뉴", "star"]);
    return [
      ["운영", [
        ["", "대시보드", "grid"],
        ["students", "수강생 관리", "users", n.pending],
        ["cohorts", "기수 관리", "layers"]
      ].concat(on("missions") ? [["reviews", "과제 검수", "checks", n.review]] : []).concat(on("qna") ? [["questions", "요청사항 답변", "bug", n.questions]] : [])],
      ["수강생 화면 콘텐츠", content],
      ["홍보", [["free", "무료강의 페이지", "video"], ["landing", "강의 소개 페이지", "store"]]]
    ];
  }
  const customPages = (iid) => DB.menuConfig(iid).items.filter((x) => DB.isCustom(x.key) && x.type !== "link");
  const allRequests = () => DB.data.instructors.flatMap((ins) => DB.requests(ins.id).map((x) => Object.assign({ ins }, x))).sort((a, b) => b.q.at - a.q.at);
  const masterNav = () => [
    ["운영", [["master", "대시보드", "grid"], ["master/instructors", "강사 플랫폼 관리", "store"], ["master/menus", "메뉴 · 색상 설정", "sliders"], ["master/health", "플랫폼 현황", "activity"]]],
    ["지원", [["master/students", "전체 수강생", "users"], ["master/reports", "오류 신고 모아보기", "bug", allRequests().filter((x) => !x.q.answer).length], ["master/notices", "강사 공지", "megaphone"], ["master/data", "데이터 관리", "database"]]]
  ];

  function renderShell(r) {
    const master = S.role === "master" && !S.actingAs;
    const groups = master ? masterNav() : instructorNav();
    const cur = r.parts.join("/");
    const curKey = master ? (cur || "master") : (r.parts[0] || "");
    const ins = master ? null : INS();
    const co = ins ? DB.currentCohort(ins.id) : null;
    root.innerHTML =
      '<div class="adm a-app" id="a-app">' +
        (S.role === "master" && S.actingAs ? '<div class="a-acting">' + icon("shieldCheck", "sm") + "<span>마스터 권한으로 <b>" + esc(ins.name) + "</b> 강사센터를 보고 있어요.</span>" + btn("마스터로 돌아가기", "stop-acting", "a-btn-light a-btn-sm") + "</div>" : "") +
        '<header class="a-top">' +
          '<button class="a-icon-btn a-menu" type="button" data-action="toggle-nav" aria-label="메뉴">' + icon("menu") + "</button>" +
          '<a class="a-logo" href="#/center' + (master ? "/master" : "") + '"><span class="a-logo-mark">' + window.doogoLogo("markWhite") + "</span><b>" + (master ? "마스터 관리자" : "강사센터") + "</b>" + (ins ? '<em class="a-hide-sm">' + esc(ins.displayName) + "</em>" : "") + "</a>" +
          '<div class="a-top-right">' +
            (ins ? '<span class="a-chip a-hide-sm">' + (co ? esc(co.name) + " · " + DB.STATUS_LABEL[DB.cohortStatus(co)] : "기수 없음") + "</span>" +
              btn(icon("eye", "sm") + '<span class="a-hide-sm">수강생 화면 보기</span>', "preview", "a-btn-outline a-btn-sm") : "") +
            '<span class="a-user a-hide-sm">' + icon(master ? "shieldCheck" : "user", "sm") + esc(master ? "ADMIN" : S.role === "master" ? "ADMIN" : ins.name + " 강사님") + "</span>" +
            btn(icon("logout", "sm") + '<span class="a-hide-sm">로그아웃</span>', "logout", "a-btn-text a-btn-sm") +
          "</div>" +
        "</header>" +
        '<div class="a-shell">' +
          '<aside class="a-side" aria-label="관리 메뉴">' +
            groups.map((g) => '<div class="a-nav-group"><p class="a-nav-label">' + esc(g[0]) + "</p>" + g[1].map((it) => {
              const on = it[0] === curKey || (!master && it[0] && r.parts[0] === it[0]);
              return '<a class="a-nav' + (on ? " on" : "") + '" href="#/center' + (it[0] ? "/" + it[0] : "") + '"' + (on ? ' aria-current="page"' : "") + ">" + icon(it[2], "sm") + "<span>" + esc(it[1]) + "</span>" + (it[3] ? '<span class="a-count">' + it[3] + "</span>" : "") + "</a>";
            }).join("") + "</div>").join("") +
            (master ? "" : '<div class="a-side-card"><b>수강생 화면과 똑같은 메뉴</b><p>‘수강생 화면 콘텐츠’에서 고친 내용이 수강생 화면에 바로 반영돼요.</p>' + btn(icon("eye", "sm") + "수강생 화면 보기", "preview", "a-btn-primary a-btn-sm a-btn-block") + "</div>") +
            '<div class="a-side-foot"><a href="#/login" data-action="to-student">' + icon("arrowLeft", "xs") + "수강생 로그인 화면</a>" + window.poweredBy("color") + "</div>" +
          "</aside>" +
          '<div class="a-scrim" data-action="toggle-nav"></div>' +
          '<main class="a-main" id="a-main"></main>' +
        "</div>" +
      "</div>";
  }

  /* ---------------- 강사: 대시보드 ---------------- */
  function pageDashboard() {
    const iid = IID(), ins = INS(), c = C();
    const co = DB.currentCohort(iid);
    const n = counts(iid);
    const rows = co ? studentProgressRows(iid, (s) => s.cohortId === co.id && s.status === "approved") : [];
    const subs = allSubmissions(iid, "all").slice(0, 6);
    const pend = DB.studentsOf(iid).filter((s) => s.status === "pending").slice(0, 5);
    const wk = co ? DB.currentWeek(co) : 0;
    const avg = rows.length ? Math.round(rows.reduce((a, r) => a + r.st.pct, 0) / rows.length) : 0;
    const anns = (DB.data.announcements || []).slice().sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date)).slice(0, 2);
    return head(ins.name + " 강사님, 안녕하세요", esc(c.brand.courseTitle), btn(icon("userPlus", "sm") + "수강생 추가", "student-add", "a-btn-outline") + btn(icon("plus", "sm") + "새 기수", "cohort-add", "a-btn-primary")) +
      (anns.length ? '<section class="a-ann">' + icon("megaphone", "sm") + '<div class="a-ann-list">' + anns.map((a) => '<details><summary><b>' + esc(a.title) + "</b><small>두고 클래스 운영팀 · " + fmtMD(a.date) + "</small></summary>" + DB.rich(a.body) + "</details>").join("") + "</div></section>" : "") +
      '<div class="a-kpis">' +
        kpi("승인 대기", n.pending + "명", "새 수강 신청", "#/center/students?status=pending", n.pending ? "warn" : "") +
        kpi("진행 중 기수", co ? co.name : "-", co ? (DB.cohortStatus(co) === "running" ? wk + "주차 진행 중" : fmtMD(co.startDate) + " 시작") : "기수를 만들어 주세요", "#/center/cohorts") +
        kpi("수강생 평균 진행률", avg + "%", (co ? co.name + " · " : "") + rows.length + "명 기준", "#/center/students?status=approved") +
        kpi("검수 대기 · 미답변", n.review + " · " + n.questions, "과제 검수 / 요청사항", "#/center/reviews", n.review + n.questions ? "info" : "") +
      "</div>" +
      (co ? '<section class="a-card"><div class="a-card-head"><h2>' + esc(co.name) + " 주차 일정</h2>" + pill(DB.STATUS_LABEL[DB.cohortStatus(co)], COHORT_CLS[DB.cohortStatus(co)]) + '<a class="a-link" href="#/center/cohorts">기수 관리 ' + icon("arrowRight", "xs") + "</a></div>" + weekStrip(co) + "</section>" : "") +
      '<div class="a-grid-2">' +
        '<section class="a-card"><div class="a-card-head"><h2>승인 대기</h2><a class="a-link" href="#/center/students?status=pending">전체 ' + icon("arrowRight", "xs") + "</a></div>" +
          (pend.length ? '<ul class="a-list">' + pend.map((s) => '<li><div class="a-who"><span class="a-avatar">' + esc(s.name.slice(0, 1)) + "</span><div><b>" + esc(s.name) + "</b><small>" + esc(cohortName(s.cohortId)) + " · 뒷자리 " + esc(s.phone4) + " · " + fmtMD(s.appliedAt) + " 신청</small></div></div>" +
            '<div class="a-row-actions">' + btn("거절", "stu-reject", "a-btn-ghost a-btn-sm", ' data-id="' + s.id + '"') + btn("승인", "stu-approve", "a-btn-primary a-btn-sm", ' data-id="' + s.id + '"') + "</div></li>").join("") + "</ul>"
            : emptyBox("check", "대기 중인 신청이 없어요.")) + "</section>" +
        '<section class="a-card"><div class="a-card-head"><h2>최근 과제 제출</h2><a class="a-link" href="#/center/reviews">과제 검수 ' + icon("arrowRight", "xs") + "</a></div>" +
          (subs.length ? '<ul class="a-list">' + subs.map((x) => '<li class="clickable" data-action="review-open" data-sid="' + x.s.id + '" data-mid="' + x.m.id + '"><div class="a-who"><span class="a-avatar">' + esc(x.s.name.slice(0, 1)) + "</span><div><b>" + esc(x.s.name) + " · " + esc(x.m.title) + "</b><small>" + x.w.no + "주차 · " + fmtStamp(x.sub.at) + "</small></div></div>" + reviewPill(x) + "</li>").join("") + "</ul>"
            : emptyBox("inbox", "아직 제출된 과제가 없어요.")) + "</section>" +
      "</div>" +
      (co ? '<section class="a-card"><div class="a-card-head"><h2>' + esc(co.name) + ' 성장 단계 현황</h2><span class="a-muted">과제를 해낼수록 단계가 올라가요 · 필수 과제를 모두 통과하면 숲</span></div>' + levelBoard(rows) + "</section>" : "") +
      (co ? '<section class="a-card"><div class="a-card-head"><h2>' + esc(co.name) + " 수강생 진행 현황</h2><span class=\"a-muted\">" + rows.length + "명</span></div>" + progressTable(rows, { weeks: DB.weeksOf(co) }) + "</section>" : "");
  }
  const kpi = (label, value, sub, href, tone) => '<a class="a-kpi ' + (tone || "") + '" href="' + href + '"><span>' + esc(label) + "</span><b>" + esc(value) + "</b><small>" + esc(sub) + "</small></a>";
  const cohortName = (id) => { const c = DB.cohort(id); return c ? c.name : "기수 없음"; };
  function weekStrip(co) {
    const c = { weeks: DB.weeksOf(co) };
    const t = todayStr();
    return '<div class="a-weeks">' + c.weeks.map((w) => {
      const open = DB.weekOpen(co, w.no), dl = DB.weekDeadline(co, w.no);
      const st = t > dl ? "past" : t >= open ? "now" : "next";
      return '<div class="a-week ' + st + '"><b>' + w.no + "주차</b><span>" + fmtMD(open) + " ~ " + fmtMD(dl) + "</span><small>" + esc(w.title) + "</small></div>";
    }).join("") + "</div>";
  }
  function progressTable(rows, c) {
    if (!rows.length) return emptyBox("users", "수강 중인 학생이 없어요.");
    rows.sort((a, b) => (b.lv ? b.lv.idx : 0) - (a.lv ? a.lv.idx : 0) || b.st.pct - a.st.pct);
    return '<div class="a-table-wrap"><table class="a-table a-prog-table"><thead><tr><th>이름</th><th>성장 단계</th>' + c.weeks.map((w) => "<th>" + w.no + "주차</th>").join("") + "<th>필수 통과</th><th>전체 진행률</th></tr></thead><tbody>" +
      rows.map((r) => "<tr class=\"clickable\" data-action=\"student-open\" data-id=\"" + r.s.id + "\"><td><b>" + esc(r.s.name) + "</b></td><td>" + lvBadge(r.lv || levelOfStudent(r.s)) + "</td>" +
        c.weeks.map((w) => { const d = w.missions.filter((m) => DB.subState(r.p, m.id) === "done").length; return '<td class="num' + (d === w.missions.length && d ? " full" : "") + '">' + d + "/" + w.missions.length + "</td>"; }).join("") +
        '<td class="num">' + r.st.reqDone + "/" + r.st.reqTotal + '</td><td><div class="a-bar"><span style="width:' + r.st.pct + '%"></span></div><small class="num">' + r.st.pct + "%</small></td></tr>").join("") +
      "</tbody></table></div>";
  }
  function reviewPill(x) {
    if (x.review === "approved") return pill("승인", "ok");
    if (x.review === "fix") return pill("보완 요청", "bad");
    return x.sub.result.pass ? pill("검수 대기 · 자동 통과", "info") : pill("검수 대기 · 자동 보완", "warn");
  }

  /* ---------------- 강사: 수강생 관리 ---------------- */
  function pageStudents(r) {
    const iid = IID();
    if (r.params.get("status")) ui.stuStatus = r.params.get("status");
    if (r.params.get("cohort")) ui.stuCohort = r.params.get("cohort");
    const cos = DB.cohortsOf(iid);
    if (ui.stuCohort !== "all" && !cos.some((x) => x.id === ui.stuCohort)) ui.stuCohort = "all";
    const all = DB.studentsOf(iid).filter((s) => ui.stuCohort === "all" || s.cohortId === ui.stuCohort);
    const q = ui.stuQuery.trim();
    const list = all.filter((s) => (ui.stuStatus === "all" || s.status === ui.stuStatus) && (!q || (s.name + s.phone4).indexOf(q) !== -1))
      .sort((a, b) => (b.appliedAt || "").localeCompare(a.appliedAt || ""));
    const cnt = (k) => all.filter((s) => k === "all" || s.status === k).length;
    const c = C();
    const tabs = ["pending", "approved", "rejected", "withdrawn", "all"].map((k) =>
      '<button type="button" class="a-tab' + (ui.stuStatus === k ? " on" : "") + '" data-action="stu-tab" data-k="' + k + '">' + (k === "all" ? "전체" : STU[k].label) + ' <span class="num">' + cnt(k) + "</span></button>").join("");
    const pendingVisible = list.filter((s) => s.status === "pending");
    return head("수강생 관리", "수강 신청을 승인·거절하고, 기수를 옮기거나 탈퇴 처리할 수 있어요.", btn(icon("userPlus", "sm") + "수강생 추가", "student-add", "a-btn-primary")) +
      '<section class="a-card">' +
        '<div class="a-toolbar"><div class="a-tabs">' + tabs + "</div>" +
          '<div class="a-filters"><select class="a-input a-sm" id="stu-cohort" aria-label="기수">' + '<option value="all">전체 기수</option>' + cos.map((co) => '<option value="' + co.id + '"' + (ui.stuCohort === co.id ? " selected" : "") + ">" + esc(co.name) + " (" + DB.STATUS_LABEL[DB.cohortStatus(co)] + ")</option>").join("") + "</select>" +
          '<div class="a-search">' + icon("search", "sm") + '<input class="a-input a-sm" id="stu-q" type="search" placeholder="이름 · 뒷자리 검색" value="' + esc(ui.stuQuery) + '"></div></div></div>' +
        (ui.stuStatus === "pending" && pendingVisible.length ? '<div class="a-bulk"><label class="a-check"><input type="checkbox" id="stu-all"' + (pendingVisible.every((s) => ui.picked.has(s.id)) ? " checked" : "") + '><span>모두 선택</span></label><span class="a-muted">' + ui.picked.size + "명 선택</span>" +
          btn("선택 거절", "bulk-reject", "a-btn-ghost a-btn-sm") + btn("선택 승인", "bulk-approve", "a-btn-primary a-btn-sm") + "</div>" : "") +
        (list.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr>' + (ui.stuStatus === "pending" ? '<th class="w-check"></th>' : "") + "<th>이름</th><th>뒷자리</th><th>기수</th><th>신청일</th><th>상태</th><th>성장 단계</th><th>진행률</th><th class=\"right\">관리</th></tr></thead><tbody>" +
          list.map((s) => {
            const st = s.status === "approved" ? DB.stats(DB.progress(s.id), iid, DB.cohort(s.cohortId)) : null;
            return '<tr><td' + (ui.stuStatus === "pending" ? ' class="w-check"><input type="checkbox" class="stu-pick" data-id="' + s.id + '"' + (ui.picked.has(s.id) ? " checked" : "") + ' aria-label="' + esc(s.name) + ' 선택"></td><td' : "") + '><button class="a-name" data-action="student-open" data-id="' + s.id + '">' + esc(s.name) + "</button>" + (s.memo ? '<small class="a-memo">' + esc(s.memo) + "</small>" : "") + "</td>" +
              '<td class="num">' + esc(s.phone4) + "</td><td>" + esc(cohortName(s.cohortId)) + '</td><td class="num">' + (s.appliedAt ? fmtMD(s.appliedAt) : "-") + "</td><td>" + pill(STU[s.status].label, STU[s.status].cls) + "</td>" +
              "<td>" + (st ? lvBadge(levelOfStudent(s)) : '<span class="a-muted">-</span>') + "</td>" +
              "<td>" + (st ? '<div class="a-bar"><span style="width:' + st.pct + '%"></span></div><small class="num">' + st.pct + "% · 필수 " + st.reqDone + "/" + st.reqTotal + "</small>" : '<span class="a-muted">-</span>') + "</td>" +
              '<td class="right"><div class="a-row-actions">' + stuActions(s) + "</div></td></tr>";
          }).join("") + "</tbody></table></div>"
          : emptyBox("users", ui.stuStatus === "pending" ? "승인 대기 중인 신청이 없어요." : "조건에 맞는 수강생이 없어요.")) +
      "</section>" +
      '<p class="a-hint">' + icon("alert", "xs") + " 수강생은 로그인 화면의 ‘수강 신청하기’로 신청하면 여기에 ‘승인 대기’로 들어와요. 승인한 수강생만 로그인할 수 있어요.</p>";
  }
  function stuActions(s) {
    const id = ' data-id="' + s.id + '"';
    if (s.status === "pending") return btn("거절", "stu-reject", "a-btn-ghost a-btn-sm", id) + btn("승인", "stu-approve", "a-btn-primary a-btn-sm", id);
    if (s.status === "approved") return btn("상세", "student-open", "a-btn-ghost a-btn-sm", id) + btn("탈퇴", "stu-withdraw", "a-btn-ghost a-btn-sm danger", id);
    if (s.status === "rejected") return btn("승인으로 변경", "stu-approve", "a-btn-ghost a-btn-sm", id) + btn("삭제", "stu-delete", "a-btn-ghost a-btn-sm danger", id);
    return btn("복구", "stu-approve", "a-btn-ghost a-btn-sm", id) + btn("삭제", "stu-delete", "a-btn-ghost a-btn-sm danger", id);
  }
  function setStatus(ids, status, msg) {
    ids.forEach((id) => { const s = DB.student(id); if (s) { s.status = status; if (status === "approved") s.approvedAt = todayStr(); } });
    ui.picked.clear();
    commit(msg);
  }
  function studentForm(s) {
    const iid = IID();
    const cos = DB.cohortsOf(iid);
    const isNew = !s;
    s = s || { name: "", phone4: "", cohortId: (DB.currentCohort(iid) || {}).id, status: "approved", memo: "" };
    let extra = "";
    if (!isNew && s.status === "approved") {
      const p = DB.progress(s.id), co0 = DB.cohort(s.cohortId), st = DB.stats(p, iid, co0), c = { weeks: co0 ? DB.weeksOf(co0) : C().weeks };
      const lv0 = DB.level(p, iid, co0);
      extra = '<div class="a-detail-stats"><div><span>성장 단계</span><b>' + lvBadge(lv0) + "</b>" + (lv0.next ? "<small>다음 ‘" + esc(lv0.next.name) + "’까지 " + esc(lv0.needText) + "</small>" : "") + '</div><div><span>전체 진행률</span><b>' + st.pct + "%</b></div><div><span>필수 통과</span><b>" + st.reqDone + "/" + st.reqTotal + "</b></div><div><span>문의</span><b>" + p.questions.length + "건</b></div></div>" +
        '<div class="a-weekbars">' + c.weeks.map((w) => { const d = w.missions.filter((m) => DB.subState(p, m.id) === "done").length; return '<div><span>' + w.no + '주차</span><div class="a-bar"><span style="width:' + (w.missions.length ? Math.round(d / w.missions.length * 100) : 0) + '%"></span></div><small class="num">' + d + "/" + w.missions.length + "</small></div>"; }).join("") + "</div>";
    }
    openModal(isNew ? "수강생 추가" : s.name + " 수강생",
      extra +
      '<form id="student-form" class="a-form" data-id="' + (isNew ? "" : s.id) + '" novalidate>' +
        '<div class="a-form-row"><div class="a-field"><label for="sf-name">이름</label><input class="a-input" id="sf-name" name="name" value="' + esc(s.name) + '"></div>' +
        '<div class="a-field"><label for="sf-phone">전화번호 뒷자리</label><input class="a-input" id="sf-phone" name="phone4" inputmode="numeric" maxlength="4" value="' + esc(s.phone4) + '"></div></div>' +
        '<div class="a-form-row"><div class="a-field"><label for="sf-cohort">기수</label><select class="a-input" id="sf-cohort" name="cohortId">' + cos.map((co) => '<option value="' + co.id + '"' + (co.id === s.cohortId ? " selected" : "") + ">" + esc(co.name) + " · " + fmtMD(co.startDate) + " 시작</option>").join("") + "</select></div>" +
        '<div class="a-field"><label for="sf-status">상태</label><select class="a-input" id="sf-status" name="status">' + Object.keys(STU).map((k) => '<option value="' + k + '"' + (k === s.status ? " selected" : "") + ">" + STU[k].label + "</option>").join("") + "</select></div></div>" +
        '<div class="a-field"><label for="sf-memo">메모 <small>(강사만 보여요)</small></label><input class="a-input" id="sf-memo" name="memo" value="' + esc(s.memo || "") + '" placeholder="예: 결제 확인 완료"></div>' +
        '<p class="a-error" id="sf-error"></p>' +
      "</form>",
      (isNew ? "" : btn("탈퇴 처리", "stu-withdraw", "a-btn-ghost danger", ' data-id="' + s.id + '"')) + '<span class="a-spacer"></span>' + btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="student-form">저장</button>', "md");
  }
  function saveStudent(f) {
    const iid = IID();
    const name = f.name.value.trim(), phone4 = f.phone4.value.trim();
    const err = document.getElementById("sf-error");
    if (!name) { err.textContent = "이름을 입력해 주세요."; return; }
    if (!/^\d{4}$/.test(phone4)) { err.textContent = "전화번호 뒷자리는 숫자 4자리예요."; return; }
    if (!f.cohortId.value) { err.textContent = "기수를 먼저 만들어 주세요."; return; }
    const id = f.dataset.id;
    const dup = DB.studentsOf(iid).find((x) => x.id !== id && x.name === name && x.phone4 === phone4 && (x.status === "approved" || x.status === "pending"));
    if (dup && (f.status.value === "approved" || f.status.value === "pending")) { err.textContent = "같은 이름·뒷자리의 수강생이 이미 있어요 (" + cohortName(dup.cohortId) + ")."; return; }
    if (id) Object.assign(DB.student(id), { name, phone4, cohortId: f.cohortId.value, status: f.status.value, memo: f.memo.value.trim() });
    else DB.data.students.push({ id: DB.uid("s"), instructorId: iid, cohortId: f.cohortId.value, name, phone4, status: f.status.value, memo: f.memo.value.trim(), appliedAt: todayStr() });
    commit(id ? "수강생 정보를 저장했어요." : name + " 수강생을 추가했어요.");
  }

  /* ---------------- 강사: 기수 관리 ---------------- */
  function pageCohorts() {
    const iid = IID();
    const cos = DB.cohortsOf(iid).slice().reverse();
    return head("기수 관리", "기수마다 1주차 시작일만 정하면 주차별 공개일과 과제 마감일이 자동으로 계산돼요.", btn(icon("plus", "sm") + "새 기수 만들기", "cohort-add", "a-btn-primary")) +
      (cos.length ? '<div class="a-stack">' + cos.map((co) => {
        const st = DB.cohortStatus(co);
        const ss = DB.studentsOf(iid).filter((s) => s.cohortId === co.id);
        const ap = ss.filter((s) => s.status === "approved").length, pe = ss.filter((s) => s.status === "pending").length;
        return '<section class="a-card a-cohort"><div class="a-card-head"><h2>' + esc(co.name) + "</h2>" + pill(DB.STATUS_LABEL[st], COHORT_CLS[st]) + (co.recruiting && st !== "ended" ? pill("신청 받는 중", "info") : "") +
          '<span class="a-muted">' + fmtFull(co.startDate) + " ~ " + fmtFull(DB.cohortEnd(co)) + (st === "running" ? " · " + DB.currentWeek(co) + "주차" : "") + "</span>" +
          '<span class="a-cur-chip">' + icon("book", "xs") + esc(DB.curriculumOf(co).name) + " · " + DB.cohortWeeks(co) + "주</span>" + '<span class="a-cur-chip">' + icon("calendar", "xs") + esc(classText(co)) + "</span>" +
          '<div class="a-row-actions">' + btn(icon("eye", "sm") + "미리보기", "preview", "a-btn-ghost a-btn-sm", ' data-cohort="' + co.id + '"') + btn("수정", "cohort-edit", "a-btn-ghost a-btn-sm", ' data-id="' + co.id + '"') + "</div></div>" +
          '<div class="a-cohort-stats"><a href="#/center/students?cohort=' + co.id + '&status=approved"><b class="num">' + ap + "</b><span>수강 중</span></a><a href=\"#/center/students?cohort=" + co.id + '&status=pending"><b class="num">' + pe + "</b><span>승인 대기</span></a><div><b class=\"num\">" + ss.length + "</b><span>전체 신청</span></div></div>" +
          weekStrip(co) + "</section>";
      }).join("") + "</div>" : '<section class="a-card">' + emptyBox("layers", "아직 기수가 없어요. 첫 기수를 만들어 주세요.", btn(icon("plus", "sm") + "새 기수 만들기", "cohort-add", "a-btn-primary")) + "</section>");
  }
  function cohortForm(co) {
    const iid = IID();
    const isNew = !co;
    const last = DB.cohortsOf(iid).slice(-1)[0];
    co = co || { name: DB.nextCohortName(iid), classDow: last ? last.classDow : undefined, classTime: last ? last.classTime : undefined, startDate: last ? addDays(DB.cohortEnd(last), 1 + ((4 - parseDate(addDays(DB.cohortEnd(last), 1)).getDay() + 7) % 7)) : todayStr(), recruiting: true };
    const n = (DB.studentsOf(iid).filter((s) => s.cohortId === co.id)).length;
    openModal(isNew ? "새 기수 만들기" : co.name + " 수정",
      '<form id="cohort-form" class="a-form" data-id="' + (isNew ? "" : co.id) + '" novalidate>' +
        '<div class="a-form-row"><div class="a-field"><label for="cf-name">기수 이름</label><input class="a-input" id="cf-name" name="name" value="' + esc(co.name) + '"></div>' +
        '<div class="a-field"><label for="cf-start">1주차 시작일</label><input class="a-input" id="cf-start" name="startDate" type="date" value="' + esc(co.startDate) + '"></div></div>' +
        '<div class="a-field"><label for="cf-cur">커리큘럼</label><select class="a-input" id="cf-cur" name="curriculumId">' + DB.curricula(iid).map((x) => '<option value="' + x.id + '"' + (x.id === (co.curriculumId || (isNew && last ? last.curriculumId || "main" : "main")) ? " selected" : "") + ">" + esc(x.name) + " · " + x.weeks.length + "주</option>").join("") + "</select>" +
          '<small class="a-muted">커리큘럼은 ‘커리큘럼’ 메뉴에서 새로 만들 수 있어요. 진행 중인 기수의 커리큘럼을 바꾸면, 새 커리큘럼에 없는 과제 기록은 진행률에서 빠져요.</small></div>' +
        '<div class="a-form-row"><div class="a-field"><label for="cf-dow">주차 강의 요일</label><select class="a-input" id="cf-dow" name="classDow"><option value="">주차 시작일에 맞춤</option>' + DOW.map((d, i) => '<option value="' + i + '"' + (String(co.classDow) === String(i) ? " selected" : "") + ">매주 " + d + "요일</option>").join("") + "</select></div>" +
          '<div class="a-field"><label for="cf-time">강의 시간</label><input class="a-input" id="cf-time" name="classTime" type="time" value="' + esc(co.classTime || C().brand.liveTime || "") + '"></div></div>' +
        '<div class="a-field"><label for="cf-url">강의 입장 링크 <small>(줌 등, 비우면 기본 정보의 링크)</small></label><input class="a-input" id="cf-url" name="classUrl" type="url" value="' + esc(co.classUrl || "") + '" placeholder="https://zoom.us/j/…"></div>' +
        '<label class="a-check"><input type="checkbox" name="recruiting"' + (co.recruiting ? " checked" : "") + "><span>수강생 로그인 화면에서 이 기수로 수강 신청 받기</span></label>" +
        '<div class="a-field"><span class="a-label">주차 일정 미리보기</span><div id="cf-preview" class="a-preview-weeks">' + weekPreview(co.startDate, co.curriculumId || (isNew && last ? last.curriculumId : ""), co.classDow, co.classTime || C().brand.liveTime) + "</div></div>" +
        '<p class="a-error" id="cf-error"></p>' +
      "</form>",
      (isNew ? "" : btn("기수 삭제", "cohort-delete", "a-btn-ghost danger", ' data-id="' + co.id + '"' + (n ? ' disabled title="수강생이 있는 기수는 삭제할 수 없어요"' : ""))) + '<span class="a-spacer"></span>' + btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="cohort-form">' + (isNew ? "만들기" : "저장") + "</button>", "md");
  }
  function weekPreview(start, curId, dow, time) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start || "")) return '<span class="a-muted">날짜를 고르면 주차 일정이 보여요.</span>';
    const fake = { id: "_preview", startDate: start, instructorId: IID(), curriculumId: curId, classDow: dow, classTime: time };
    const lect = DB.events(IID(), fake).filter((e) => e.type === "open");
    return DB.weeksOf(fake).map((w, i) => "<span><b>" + w.no + "주차</b> " + (lect[i] ? "강의 " + fmtMD(lect[i].date) + (lect[i].time ? " " + esc(lect[i].time) : "") + " · " : "") + fmtMD(DB.weekDeadline(fake, w.no)) + " 과제 마감</span>").join("") +
      '<span class="a-muted">총 ' + DB.weeksOf(fake).length + "주 · " + fmtMD(start) + " ~ " + fmtMD(DB.cohortEnd(fake)) + "</span>";
  }
  function refreshWeekPreview() {
    const f = document.getElementById("cohort-form"), p = document.getElementById("cf-preview");
    if (f && p) p.innerHTML = weekPreview(f.startDate.value, f.curriculumId.value, f.classDow.value, f.classTime.value);
  }
  function curForm(mode) {
    const cur = CUR();
    if (mode === "rename") {
      openModal("커리큘럼 이름 바꾸기", '<form id="cur-form" class="a-form" data-mode="rename" novalidate><div class="a-field"><label for="cu-name">이름</label><input class="a-input" id="cu-name" name="name" value="' + esc(cur.name) + '"></div><p class="a-error" id="cu-error"></p></form>',
        btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="cur-form">저장</button>', "md");
      return;
    }
    openModal("새 커리큘럼 만들기",
      '<form id="cur-form" class="a-form" data-mode="new" novalidate><p class="a-muted" style="margin:0">기수마다 다른 커리큘럼으로 수업할 때 써요. 만든 뒤 ‘기수 관리’에서 기수에 연결하면 그 기수 수강생에게 이 커리큘럼이 보여요.</p>' +
        '<div class="a-field"><label for="cu-name">이름</label><input class="a-input" id="cu-name" name="name" placeholder="예: 4주 압축 과정 · 3기부터"></div>' +
        '<div class="a-field"><span class="a-label">시작 방법</span><div class="a-radio-cards">' +
          '<label><input type="radio" name="base" value="copy" checked><span><b>‘' + esc(cur.name) + '’ 복사해서 고치기 (추천)</b><small>' + cur.weeks.length + "주 · 강의 · 과제를 그대로 복사해요. 필요 없는 주차는 지우고, 바꿀 부분만 고치면 돼요.</small></span></label>" +
          '<label><input type="radio" name="base" value="blank"><span><b>빈 커리큘럼</b><small>주차 틀만 만들어요. 강의와 과제는 직접 채워요.</small></span></label></div></div>' +
        '<div class="a-field" data-show-blank hidden><label for="cu-weeks">주차 수</label><input class="a-input" id="cu-weeks" name="weeks" type="number" min="1" max="12" value="4"></div>' +
        '<p class="a-error" id="cu-error"></p></form>',
      btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="cur-form">만들기</button>', "md");
  }
  function saveCur(f) {
    const c = C(), name = f.name.value.trim(), err = document.getElementById("cu-error");
    if (!name) { err.textContent = "이름을 입력해 주세요."; return; }
    if (f.dataset.mode === "rename") {
      const cur = CUR();
      if (cur.main) c.curriculumName = name; else c.curricula.find((x) => x.id === cur.id).name = name;
      commit("이름을 바꿨어요."); return;
    }
    const blank = (f.querySelector("input[name=base]:checked") || {}).value === "blank";
    const n = Math.max(1, Math.min(12, Number(f.weeks.value) || 4));
    const weeks = blank ? Array.from({ length: n }, (_, i) => ({ no: i + 1, title: (i + 1) + "주차 주제를 적어 주세요", summary: "", lessons: [], missions: [] })) : DB.clone(CUR().weeks);
    const id = DB.uid("cur");
    c.curricula.push({ id, name, weeks });
    ui.curId = id;
    commit("‘" + name + "’ 커리큘럼을 만들었어요. 이제 바꿀 부분을 고쳐 주세요.");
  }
  function saveCohort(f) {
    const name = f.name.value.trim(), start = f.startDate.value;
    const err = document.getElementById("cf-error");
    if (!name) { err.textContent = "기수 이름을 입력해 주세요."; return; }
    if (!start) { err.textContent = "1주차 시작일을 골라 주세요."; return; }
    const id = f.dataset.id;
    const extra = { curriculumId: f.curriculumId.value === "main" ? undefined : f.curriculumId.value, classDow: f.classDow.value === "" ? undefined : Number(f.classDow.value), classTime: f.classTime.value || undefined, classUrl: f.classUrl.value.trim() || undefined };
    if (extra.classUrl && !/^https?:\/\//i.test(extra.classUrl)) { err.textContent = "입장 링크는 http:// 또는 https:// 로 시작해야 해요."; return; }
    if (id) Object.assign(DB.cohort(id), { name, startDate: start, recruiting: f.recruiting.checked }, extra);
    else DB.data.cohorts.push(Object.assign({ id: DB.uid("c"), instructorId: IID(), name, startDate: start, recruiting: f.recruiting.checked }, extra));
    commit(id ? name + " 일정을 저장했어요." : name + "를 만들었어요.");
  }

  /* ---------------- 강사: 과제 검수 ---------------- */
  function pageReviews() {
    const iid = IID(), c = C();
    const cos = DB.cohortsOf(iid);
    if (!ui.revCohort || (ui.revCohort !== "all" && !cos.some((x) => x.id === ui.revCohort))) ui.revCohort = (DB.currentCohort(iid) || {}).id || "all";
    let list = allSubmissions(iid, ui.revCohort);
    if (ui.revWeek !== "all") list = list.filter((x) => String(x.w.no) === ui.revWeek);
    const cnt = (k) => list.filter((x) => k === "all" || x.review === k).length;
    const shown = list.filter((x) => ui.revFilter === "all" || x.review === ui.revFilter);
    const tabs = [["pending", "검수 대기"], ["fix", "보완 요청"], ["approved", "승인"], ["all", "전체"]].map((t) =>
      '<button type="button" class="a-tab' + (ui.revFilter === t[0] ? " on" : "") + '" data-action="rev-tab" data-k="' + t[0] + '">' + t[1] + ' <span class="num">' + cnt(t[0]) + "</span></button>").join("");
    return head("과제 검수", "수강생 제출물은 자동검수 결과가 먼저 반영되고, 강사님이 승인하거나 보완을 요청하면 그 결과가 최종이 돼요.") +
      '<section class="a-card"><div class="a-toolbar"><div class="a-tabs">' + tabs + "</div>" +
        '<div class="a-filters"><select class="a-input a-sm" id="rev-cohort" aria-label="기수"><option value="all">전체 기수</option>' + cos.map((co) => '<option value="' + co.id + '"' + (ui.revCohort === co.id ? " selected" : "") + ">" + esc(co.name) + "</option>").join("") + "</select>" +
        '<select class="a-input a-sm" id="rev-week" aria-label="주차"><option value="all">전체 주차</option>' + Array.from({ length: Math.max(0, ...DB.curricula(iid).map((x) => x.weeks.length)) }, (_, i) => i + 1).map((no) => '<option value="' + no + '"' + (ui.revWeek === String(no) ? " selected" : "") + ">" + no + "주차</option>").join("") + "</select></div></div>" +
        (shown.length ? bulkBar(shown) + '<div class="a-table-wrap"><table class="a-table a-rev-table"><thead><tr><th class="w-check"><input type="checkbox" id="rev-all" aria-label="모두 선택"' + (shown.every((x) => ui.revPicked.has(x.s.id + "|" + x.m.id)) ? " checked" : "") + '></th><th>제출 시각</th><th>수강생</th><th>과제</th><th>제출</th><th>상태</th><th class="right"></th></tr></thead><tbody>' +
          shown.map((x) => { const key = x.s.id + "|" + x.m.id; return '<tr class="clickable" data-action="review-open" data-sid="' + x.s.id + '" data-mid="' + x.m.id + '"><td class="w-check"><input type="checkbox" class="rev-pick" data-key="' + key + '"' + (ui.revPicked.has(key) ? " checked" : "") + ' aria-label="' + esc(x.s.name + " " + x.m.title) + ' 선택"></td><td class="num">' + fmtStamp(x.sub.at) + "</td><td><b>" + esc(x.s.name) + "</b><small class=\"a-memo\">" + esc(cohortName(x.s.cohortId)) + "</small></td><td>" + x.w.no + "주차 · " + esc(x.m.title) + (x.m.required ? "" : ' <small class="a-muted">' + DB.MISSION_KINDS.find((k) => k.key === DB.missionKind(x.m)).short + "</small>") + '</td><td class="num">' + x.count + "회</td><td>" + reviewPill(x) + '</td><td class="right">' + btn("열기", "review-open", "a-btn-ghost a-btn-sm", ' data-sid="' + x.s.id + '" data-mid="' + x.m.id + '"') + "</td></tr>"; }).join("") +
          "</tbody></table></div>" : emptyBox("inbox", ui.revFilter === "pending" ? "검수할 제출물이 없어요." : "해당하는 제출물이 없어요.")) +
      "</section>";
  }
  function bulkBar(shown) {
    const keys = shown.map((x) => x.s.id + "|" + x.m.id);
    const n = keys.filter((k) => ui.revPicked.has(k)).length;
    return '<div class="a-bulk a-rev-bulk"><label class="a-check"><input type="checkbox" id="rev-all-2"' + (n && n === keys.length ? " checked" : "") + '><span>전체 선택 (' + keys.length + ')</span></label><span class="a-muted">' + n + "개 선택</span>" +
      btn(icon("alert", "sm") + "선택 보완 요청", "rev-bulk-fix", "a-btn-ghost a-btn-sm danger") + btn(icon("check", "sm") + "선택 승인", "rev-bulk-approve", "a-btn-primary a-btn-sm") + "</div>";
  }
  function bulkReview(status, comment) {
    const keys = Array.from(ui.revPicked);
    const bySid = {};
    keys.forEach((k) => { const [sid, mid] = k.split("|"); (bySid[sid] = bySid[sid] || []).push(mid); });
    let n = 0;
    Object.keys(bySid).forEach((sid) => {
      const p = DB.progress(sid);
      bySid[sid].forEach((mid) => { const l = p.submissions[mid]; if (l && l.length) { l[l.length - 1].review = { status, comment: comment || "", at: Date.now() }; n++; } });
      DB.saveProgress(sid, p);
    });
    ui.revPicked.clear();
    closeModal(); render();
    toast(n + "개를 " + (status === "approved" ? "승인했어요." : "보완 요청했어요."));
  }
  function reviewModal(sid, mid) {
    const s = DB.student(sid), p = DB.progress(sid), sco = DB.cohort(s.cohortId), c = { weeks: sco ? DB.weeksOf(sco) : C().weeks };
    const w = c.weeks.find((x) => x.missions.some((m) => m.id === mid));
    if (!w) return;
    const m = w.missions.find((x) => x.id === mid);
    const subs = p.submissions[mid] || [];
    const sub = subs[subs.length - 1];
    if (!sub) return;
    const files = (sub.files || []).map((f) => f.type === "image" ? '<a class="a-shot" href="' + f.data + '" target="_blank" rel="noopener"><img src="' + f.data + '" alt="' + esc(f.name) + '"></a>' : f.data ? '<a class="a-file" href="' + f.data + '" download="' + esc(f.name) + '">' + icon("download", "sm") + esc(f.name) + "</a>" : '<span class="a-file" title="1MB가 넘어 이름만 올라온 파일">' + icon("file", "sm") + esc(f.name) + "</span>").join("");
    openModal(s.name + " · " + m.title,
      '<div class="a-review-meta">' + pill(w.no + "주차", "mute") + kindPill(m) + "<span>" + subs.length + "번째 제출 · " + fmtStamp(sub.at) + "</span></div>" +
      '<div class="a-review-box">' +
        (files ? '<div class="a-shots">' + files + "</div>" : "") +
        (sub.link ? '<p><b>링크</b> <a href="' + esc(sub.link) + '" target="_blank" rel="noopener">' + esc(sub.link) + "</a></p>" : "") +
        (sub.text ? '<div class="a-text">' + esc(sub.text) + "</div>" : "") +
        (!files && !sub.link && !sub.text ? '<p class="a-muted">제출 내용이 비어 있어요.</p>' : "") +
      "</div>" +
      '<div class="a-auto ' + (sub.result.pass ? "ok" : "warn") + '"><b>' + icon(sub.result.pass ? "check" : "alert", "sm") + "자동검수 " + (sub.result.pass ? "통과" : "보완 필요") + "</b>" +
        (sub.result.pass ? (sub.result.ok.length ? "<span>" + esc(sub.result.ok.join(" · ")) + "</span>" : "") : "<span>" + esc(sub.result.reasons.join(" / ")) + "</span>") + "</div>" +
      (sub.review ? '<p class="a-muted">현재 강사 검수: <b>' + (sub.review.status === "approved" ? "승인" : "보완 요청") + "</b> · " + fmtStamp(sub.review.at) + "</p>" : "") +
      '<div class="a-field"><label for="rv-comment">수강생에게 남길 말 <small>(보완 요청 시 꼭 적어 주세요)</small></label><textarea class="a-input" id="rv-comment" rows="3" placeholder="예: 사업자등록증 전체가 보이게 다시 찍어 주세요.">' + esc(sub.review ? sub.review.comment || "" : "") + "</textarea></div>",
      '<span class="a-spacer"></span>' + btn(icon("alert", "sm") + "보완 요청", "review-save", "a-btn-outline danger", ' data-sid="' + sid + '" data-mid="' + mid + '" data-status="fix"') + btn(icon("check", "sm") + "승인", "review-save", "a-btn-primary", ' data-sid="' + sid + '" data-mid="' + mid + '" data-status="approved"'), "lg");
  }

  /* ---------------- 강사: 문의 답변 ---------------- */
  function pageQuestions() {
    const iid = IID();
    const list = DB.requests(iid);
    const shown = list.filter((x) => ui.qFilter === "all" || (ui.qFilter === "open" ? !x.q.answer : !!x.q.answer));
    const tabs = [["open", "답변 대기", list.filter((x) => !x.q.answer).length], ["done", "답변 완료", list.filter((x) => x.q.answer).length], ["all", "전체", list.length]].map((t) =>
      '<button type="button" class="a-tab' + (ui.qFilter === t[0] ? " on" : "") + '" data-action="q-tab" data-k="' + t[0] + '">' + t[1] + ' <span class="num">' + t[2] + "</span></button>").join("");
    return head("요청사항 답변", "수강생이 Q&A ‘요청사항’에 남긴 프로그램 오류·불편 신고예요. 모두 비공개로, 작성자와 강사님만 봐요. 답변하면 수강생 화면에 바로 보여요.") +
      '<section class="a-card"><div class="a-toolbar"><div class="a-tabs">' + tabs + "</div></div>" +
        (shown.length ? '<div class="a-stack">' + shown.map((x) =>
          '<article class="a-q"><div class="a-q-head"><span class="a-avatar">' + esc(x.s.name.slice(0, 1)) + "</span><div><b>#" + x.no + " " + esc(x.q.title) + "</b><small>" + esc(x.s.name) + " · " + esc(cohortName(x.s.cohortId)) + " · " + fmtStamp(x.q.at) + "</small></div>" + pill(x.q.category || "기타", "mute") + (x.q.answer ? pill("답변 완료", "ok") : pill("답변 대기", "warn")) + "</div>" +
          '<p class="a-q-body">' + esc(x.q.body) + "</p>" +
          ((x.q.images || []).length ? '<div class="a-shots a-q-shots">' + x.q.images.map((im) => '<a class="a-shot" href="' + im.data + '" target="_blank" rel="noopener"><img src="' + im.data + '" alt="' + esc(im.name) + '"></a>').join("") + "</div>" : "") +
          '<form class="a-q-form" data-sid="' + x.s.id + '" data-qid="' + x.q.id + '"><textarea class="a-input" name="answer" rows="3" placeholder="예: 확인해 보니 ○○ 문제였어요. 지금 고쳤으니 새로고침 후 다시 해 주세요." aria-label="답변">' + esc(x.q.answer || "") + '</textarea><button class="a-btn a-btn-primary a-btn-sm" type="submit">' + (x.q.answer ? "답변 수정" : "답변 등록") + "</button></form></article>").join("") + "</div>"
          : emptyBox("bug", ui.qFilter === "open" ? "답변을 기다리는 요청사항이 없어요." : "요청사항이 없어요.")) +
      "</section>";
  }

  /* ---------------- 콘텐츠 편집 (공통 목록 편집기) ---------------- */
  const LINES = (v) => String(v || "").split("\n").map((x) => x.trim()).filter(Boolean);
  const TAGS = (v) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
  const F = (key, label, type, opts) => Object.assign({ key, label, type: type || "text" }, opts || {});
  const COLL = {
    week: { name: "주차", list: () => CUR().weeks, fields: [F("title", "주차 제목"), F("subtitle", "부제 (제목 아래 한 줄)", "text", { hint: "예: 판매를 시작할 수 있는 ‘몸’ 만들기" }),
      F("goal", "핵심 목표", "textarea", { rows: 2, hint: "이번 주를 마치면 수강생이 어떤 상태가 되는지 한두 문장으로 적어요." }),
      F("topics", "강의 내용 (한 줄에 하나)", "lines", { rows: 7, hint: "수강생 커리큘럼에 두 줄로 나눠 점 목록으로 보여요." }),
      F("summary", "한 줄 소개 (과제 화면 위에 보여요)", "textarea", { rows: 2 })],
      init: () => ({ lessons: [], missions: [], topics: [] }), after: () => CUR().weeks.forEach((w, i) => { w.no = i + 1; }) },
    lesson: { name: "강의", list: (c, ctx) => weekOf(c, ctx).lessons, fields: [F("title", "강의 제목"), F("youtubeId", "유튜브 주소", "youtube"), F("minutes", "길이(분)", "number"), F("desc", "강의 설명", "textarea", { rows: 4, rich: true }), F("attachments", "강의 자료 (교재·PDF·엑셀 등, 영상 아래에 보여요)", "attachments")], idp: "l", init: () => ({ attachments: [] }) },
    mission: { name: "과제", list: (c, ctx) => weekOf(c, ctx).missions, idp: "m",
      init: () => ({ required: true, kind: "required", type: "image", steps: [], check: { image: true } }),
      fields: [
        F("title", "과제 제목"),
        F("kind", "과제 종류", "select", { options: DB.MISSION_KINDS.map((k) => [k.key, k.label + " · " + k.hint]), get: (m) => DB.missionKind(m), set: (m, v) => { m.kind = v; m.required = v === "required"; },
          hint: "필수 과제를 모두 통과해야 수료증이 나와요. 도전 · 마인드 과제는 선택이에요." }),
        F("type", "제출 방식", "select", { options: [["image", "사진 · PDF 인증"], ["link", "링크 제출"], ["text", "글 작성"]] }),
        F("desc", "과제 설명", "textarea", { rows: 3 }),
        F("steps", "진행 방법 (한 줄에 하나)", "lines", { rows: 3 }),
        F("templates", "과제 양식 (엑셀·한글 등 · 수강생이 내려받아 채워서 올려요)", "attachments"),
        F("chkImage", "자동검수: 사진·PDF 1개 이상", "checkbox", { get: (m) => !!(m.check || {}).image, set: (m, v) => { (m.check = m.check || {}).image = v; } }),
        F("chkLink", "자동검수: 올바른 링크", "checkbox", { get: (m) => !!(m.check || {}).link, set: (m, v) => { (m.check = m.check || {}).link = v; } }),
        F("linkHint", "링크에 꼭 들어갈 주소 (예: smartstore.naver.com)", "text", { get: (m) => (m.check || {}).linkHint || "", set: (m, v) => { (m.check = m.check || {}).linkHint = v || undefined; } }),
        F("minLength", "자동검수: 최소 글자 수 (공백 제외)", "number", { get: (m) => (m.check || {}).minLength || "", set: (m, v) => { (m.check = m.check || {}).minLength = v || undefined; } }),
        F("keywords", "자동검수: 꼭 들어갈 단어 (쉼표로 구분)", "tags", { get: (m) => ((m.check || {}).keywords || []).join(", "), set: (m, v) => { (m.check = m.check || {}).keywords = v.length ? v : undefined; } })
      ] },
    event: { name: "일정", list: (c) => c.schedule, idp: "e",
      init: () => ({ type: "qna", scope: "all", week: 1, dow: 2, time: "21:00", cohortId: (DB.currentCohort(IID()) || {}).id, date: todayStr() }),
      fields: [
        F("type", "종류", "select", { options: [["qna", "라이브 Q&A"], ["notice", "공지"], ["challenge", "챌린지"], ["event", "행사"]] }),
        F("title", "일정 이름"),
        F("time", "시간 (비워도 돼요)", "time"),
        F("url", "입장 링크 (줌·유튜브 라이브 등, 선택)", "url", { hint: "넣으면 수강생 일정과 홈에 ‘입장하기’ 버튼이 생겨요." }),
        F("scope", "반복", "select", { options: [["all", "모든 기수에 반복 (주차·요일로 지정)"], ["cohort", "특정 기수 하루만"]] }),
        F("week", "주차", "number", { showIf: "scope=all", min: 1 }),
        F("dow", "요일", "select", { showIf: "scope=all", options: DOW.map((d, i) => [String(i), d + "요일"]) }),
        F("cohortId", "기수", "select", { showIf: "scope=cohort", options: () => DB.cohortsOf(IID()).map((co) => [co.id, co.name + " · " + fmtMD(co.startDate) + " 시작"]) }),
        F("date", "날짜", "date", { showIf: "scope=cohort" })
      ] },
    notice: { name: "공지", list: (c) => c.notices, idp: "n", init: () => ({ date: todayStr(), pinned: false }),
      fields: [F("title", "제목"), F("body", "내용", "textarea", { rows: 9, rich: true, photos: true }), F("images", "사진 (여러 장 가능)", "images"),
        F("youtubeId", "유튜브 영상 (선택)", "youtube", { hint: "넣으면 공지 맨 아래에 영상이 보여요." }), F("date", "게시일", "date"), F("pinned", "상단 고정 (필독)", "checkbox")] },
    faq: { name: "질문", list: (c) => c.faqs, idp: "q", init: () => ({ category: "기타" }), fields: [F("q", "질문"), F("category", "분류", "combo", { options: () => faqCats(), hint: "목록에서 고르거나 새 분류를 적으면 돼요." }), F("a", "답변", "textarea", { rows: 4 }), F("tags", "AI봇 검색어 (쉼표로 구분)", "tags", { hint: "수강생이 이 단어로 물어보면 AI봇이 이 답변을 보여 줘요." })] },
    doc: { name: "서류 단계", list: (c) => c.docsGuide, idp: "d",
      fields: [F("title", "단계 이름"), F("where", "어디서 (기관·사이트)"), F("url", "바로가기 주소", "url"), F("time", "소요 시간"), F("cost", "비용"), F("docs", "필요 서류 (한 줄에 하나)", "lines", { rows: 3 }), F("tips", "팁 (한 줄에 하나)", "lines", { rows: 3 })] },
    guide: { name: "시작 가이드 단계", list: (c) => c.guide, idp: "g",
      fields: [F("title", "할 일"), F("desc", "한 줄 설명"), F("url", "바로가기 (선택)", "text", { hint: "수강생 화면 주소(예: #/schedule, #/curriculum) 또는 https:// 로 시작하는 외부 주소. 수강생이 ‘바로가기’를 누르면 자동으로 체크돼요." }),
        F("week", "보이는 주차", "number", { min: 1, hint: "비우거나 1이면 처음 들어왔을 때 한 번(온보딩). 2 이상이면 그 주차가 열릴 때 ‘N주차 시작 가이드’로 다시 떠요." })] },
    channel: { name: "소통채널", list: (c) => c.channels || (c.channels = DB.defaultChannels()), idp: "ch", init: () => ({ type: "kakao", label: "상담하기" }),
      fields: [F("title", "채널 이름 (카드 제목)", "text", { hint: "예: 카카오톡 1:1 상담, 채널톡 실시간 상담" }),
        F("tag", "작은 머리말 (선택)", "text", { hint: "카드 맨 위 작은 글씨. 예: STEP 1 · 제조 상담" }),
        F("type", "채널 종류", "select", { options: () => DB.CHANNEL_TYPES.map((t) => [t.key, t.label]), hint: "아이콘 · 색을 따로 고르지 않으면 종류에 맞는 기본 아이콘 · 색이 쓰여요." }),
        F("icon", "카드 아이콘", "select", { options: () => [["", "채널 종류 기본 아이콘"]].concat(DB.CHANNEL_ICONS) }),
        F("color", "카드 색 (아이콘 · 버튼)", "select", { options: () => [["", "채널 종류 기본 색"]].concat(DB.CHANNEL_COLORS), hint: "같은 카카오톡 채널이 여러 개면 색을 다르게 해 주면 한눈에 구분돼요." }),
        F("desc", "설명 (어떤 상담을 이 채널로 하면 되는지)", "textarea", { rows: 3 }),
        F("url", "연결 주소", "text", { hint: "https:// 링크 (카카오톡 채널 · 채널톡 · 톡톡 등). 이메일은 주소만, 전화는 번호만 적어도 돼요." }),
        F("hours", "운영 시간 (선택)", "text", { hint: "예: 평일 10:00 ~ 18:00" }),
        F("label", "버튼 글자", "text", { hint: "예: 카카오톡으로 상담하기" }),
        F("note", "링크가 없을 때 보일 안내 (선택)", "textarea", { rows: 2, hint: "개별 카톡방처럼 공개 링크가 없는 채널이면 주소는 비우고 여기에 안내를 적어요. 예: 입금이 확인되면 담당 팀이 링크를 보내 드려요." })] },
    partner: { name: "제휴채널", list: (c) => c.partners || (c.partners = DB.defaultPartners(c)), idp: "pt", init: () => ({ group: "partner", label: "바로가기", icon: "handshake", color: "#0a5de2" }),
      fields: [F("title", "이름 (카드 제목)", "text", { hint: "예: 두고 N카페, 코워크시티" }),
        F("group", "분류 (수강생 화면의 탭)", "select", { options: () => DB.PARTNER_GROUPS.map((g) => [g.key, g.label + " — " + g.desc]) }),
        F("featured", "맨 위에 크게 보이기 (제휴 혜택을 안내하는 대표 카페 등 · 하나만 켜 주세요)", "checkbox"),
        F("tag", "작은 머리말 (선택)", "text", { hint: "예: 비상주 사무실, 해외송금" }),
        F("desc", "설명", "textarea", { rows: 3 }),
        F("points", "강조 항목 (크게 보일 때만 · 한 줄에 하나)", "lines", { rows: 3 }),
        F("url", "연결 주소", "url", { hint: "누르면 새 창으로 열려요. 네이버 카페 주소면 카드에 네이버 표시가 붙어요." }),
        F("label", "버튼 글자", "text", { hint: "예: 제휴 혜택 보기" }),
        F("icon", "카드 아이콘", "select", { options: () => DB.PARTNER_ICONS }),
        F("color", "카드 색", "select", { options: () => DB.CHANNEL_COLORS.concat([["#0d9488", "청록"], ["#4f46e5", "남색"]]) })] },
    ql: { name: "자주 찾는 페이지", list: (c) => c.quickLinks || (c.quickLinks = DB.defaultQuickLinks(c)), idp: "ql", init: () => ({ icon: "link" }),
      fields: [F("title", "이름"), F("desc", "한 줄 설명"), F("url", "주소", "text", { hint: "수강생 화면(#/notices, #/qna, #/docs, #/qna/requests, #/bot, #/library …) 또는 https:// 외부 주소(유튜브·카페·카카오톡 등, 새 창으로 열려요)" }),
        F("color", "아이콘 색 (외부 링크용 · 비우면 기본 색)", "text", { hint: "예: 유튜브 #ff0000 · 네이버 #03c75a · 두고 #0a5de2. # 뒤에 6자리 색 코드를 적어요." }),
        F("icon", "아이콘", "select", { options: () => DB.QL_ICONS.map((k) => [k, ({ layers: "층층 (제조 · OEM)",  megaphone: "확성기 (공지)", help: "물음표 (FAQ)", clipboard: "클립보드 (서류)", bug: "벌레 (오류 신고)", sparkles: "반짝이 (AI)", play: "재생 (유튜브)", message: "말풍선 (카톡)", book: "책", calendar: "달력", library: "자료실", flame: "불꽃 (동기부여)", award: "메달 (수료증)", link: "링크", store: "가게", users: "사람들 (카페)", video: "비디오 (라이브)" })[k] || k]) })] },
    ann: { name: "강사 공지", list: () => DB.data.announcements, idp: "an", init: () => ({ date: todayStr(), pinned: false }),
      fields: [F("title", "제목"), F("body", "내용", "textarea", { rows: 6, rich: true }), F("date", "날짜", "date"), F("pinned", "맨 위에 고정", "checkbox")] },
    mv: { name: "동기부여 영상", prepend: true, list: (c) => c.motivation, idp: "mv", init: () => ({ date: todayStr() }),
      fields: [F("title", "영상 제목"), F("youtubeId", "유튜브 주소", "youtube"), F("minutes", "영상 길이 (예: 31:57)"), F("date", "올린 날", "date")] }
  };
  ["ebook", "file"].forEach((k) => { COLL["res-" + k] = { name: "자료", list: (c) => c.resources[k], idp: k[0], fields: [F("title", "자료 이름"), F("meta", "형식 (예: 전자책 · 86쪽)"), F("desc", "한 줄 설명"), F("url", "열람·다운로드 주소 (구글 드라이브 등)", "url")] }; });
  ["vod", "senior"].forEach((k) => { COLL["res-" + k] = { name: "영상", list: (c) => c.resources[k], idp: k[0], init: () => ({ body: "", attachments: [] }),
    fields: [F("title", "영상 제목 (팝업 제목)"), F("meta", "형식 (예: 기초 · 15분)"), F("desc", "한 줄 설명 (목록에 보여요)"), F("youtubeId", "유튜브 주소", "youtube"),
      F("body", "본문 (게시판처럼 글을 쓰고, 사진은 [사진1] 자리에 들어가요)", "textarea", { rows: 14, rich: true, photos: true }), F("images", "사진 (여러 장 가능 · 첫 사진은 영상이 없을 때 썸네일)", "images"),
      F("attachments", "첨부 자료 (교습지·엑셀·PDF 등)", "attachments")] }; });
  const faqCats = () => C().faqs.map((f) => f.category || "기타").filter((c, i, a) => a.indexOf(c) === i);
  const kindPill = (m) => { const k = DB.missionKind(m); return pill(DB.MISSION_KINDS.find((x) => x.key === k).short, k === "required" ? "dark" : k === "mind" ? "warn" : "info"); };
  function weekOf(c, ctx) { return CUR().weeks.find((w) => String(w.no) === String(ctx)); }

  function fieldHtml(f, item) {
    const id = "cf-" + f.key;
    let v = f.get ? f.get(item) : item[f.key];
    if (v == null) v = "";
    const show = f.showIf ? ' data-show-if="' + f.showIf + '"' : "";
    if (f.type === "attachments") return '<div class="a-field"><span class="a-label">' + esc(f.label) + '</span><div id="att-editor">' + attEditorHtml() + "</div></div>";
    if (f.type === "images") return '<div class="a-field"><span class="a-label">' + esc(f.label) + '</span><div id="img-editor">' + imgEditorHtml() + "</div></div>";
    if (f.type === "checkbox") return '<label class="a-check"' + show + '><input type="checkbox" name="' + f.key + '" id="' + id + '"' + (v ? " checked" : "") + "><span>" + esc(f.label) + "</span></label>";
    let input;
    if (f.type === "textarea" || f.type === "lines") input = (f.rich ? richBar(id, f.photos) : "") + '<textarea class="a-input' + (f.rich ? " a-rich-input" : "") + '" id="' + id + '" name="' + f.key + '" rows="' + (f.rows || 3) + '">' + esc(f.type === "lines" ? (v || []).join("\n") : v) + "</textarea>" + (f.rich ? '<small class="a-muted">## 소제목 · - 목록 · 1. 번호 · **굵게** · &gt; 강조 상자 · 주소는 자동으로 링크가 돼요.</small>' : "");
    else if (f.type === "select") { const opts = typeof f.options === "function" ? f.options() : f.options; input = '<select class="a-input" id="' + id + '" name="' + f.key + '">' + opts.map((o) => '<option value="' + esc(o[0]) + '"' + (String(v) === String(o[0]) ? " selected" : "") + ">" + esc(o[1]) + "</option>").join("") + "</select>"; }
    else if (f.type === "combo") { const opts = f.options(); input = '<input class="a-input" id="' + id + '" name="' + f.key + '" list="' + id + '-list" value="' + esc(v) + '"><datalist id="' + id + '-list">' + opts.map((o) => '<option value="' + esc(o) + '"></option>').join("") + "</datalist>"; }
    else if (f.type === "tags") input = '<input class="a-input" id="' + id + '" name="' + f.key + '" value="' + esc(Array.isArray(v) ? v.join(", ") : v) + '">';
    else if (f.type === "youtube") input = '<input class="a-input" id="' + id + '" name="' + f.key + '" value="' + esc(v ? "https://youtu.be/" + v : "") + '" placeholder="https://www.youtube.com/watch?v=… 또는 youtu.be/…">';
    else input = '<input class="a-input" id="' + id + '" name="' + f.key + '" type="' + ({ number: "number", date: "date", time: "time", url: "url" }[f.type] || "text") + '"' + (f.min ? ' min="' + f.min + '"' : "") + ' value="' + esc(v) + '">';
    return '<div class="a-field"' + show + '><label for="' + id + '">' + esc(f.label) + "</label>" + input + (f.hint ? '<small class="a-muted">' + esc(f.hint) + "</small>" : "") + "</div>";
  }
  // 본문 서식 버튼: 줄 앞에 표시를 넣거나 고른 글자를 굵게
  const RICH_BTNS = [["h", "소제목"], ["ul", "• 목록"], ["ol", "1. 번호"], ["b", "굵게"], ["note", "강조 상자"], ["hr", "구분선"]];
  const richBar = (id, photos) => '<div class="a-rich-bar" role="toolbar" aria-label="본문 서식">' + RICH_BTNS.map((b) => '<button type="button" class="a-rich-btn" data-action="rich-ins" data-k="' + b[0] + '" data-for="' + id + '">' + b[1] + "</button>").join("") +
    (photos ? '<button type="button" class="a-rich-btn" data-action="rich-ins" data-k="img" data-for="' + id + '" title="올린 사진을 글 중간에 넣을 자리">' + icon("image", "xs") + "사진 자리</button>" : "") + "</div>";
  function richInsert(id, k) {
    const ta = document.getElementById(id);
    if (!ta) return;
    const v = ta.value, a = ta.selectionStart, b = ta.selectionEnd;
    const ls = v.lastIndexOf("\n", a - 1) + 1;
    let le = v.indexOf("\n", b); if (le < 0) le = v.length;
    let nv, ca, cb;
    if (k === "b") {
      const sel = v.slice(a, b) || "굵게 쓸 글자";
      nv = v.slice(0, a) + "**" + sel + "**" + v.slice(b); ca = a + 2; cb = ca + sel.length;
    } else if (k === "hr" || k === "img") {
      const n = k === "img" ? Math.max(1, (v.match(/\[사진\s*\d+\]/g) || []).length + 1) : 0;
      const tok = k === "hr" ? "---" : "[사진" + n + "]";
      const before = v.slice(0, le), pre = before && !before.endsWith("\n") ? "\n" : "";
      nv = before + pre + tok + "\n" + v.slice(le).replace(/^\n/, ""); ca = cb = before.length + pre.length + tok.length + 1;
      if (k === "img" && n > imgDraft.length) toast("사진 " + n + "번을 아래 ‘사진’에 올려 주세요. 올린 순서대로 1, 2, 3…이에요.");
    } else {
      const mark = { h: "## ", ul: "- ", ol: "", note: "> " }[k];
      let i = 0;
      const block = v.slice(ls, le).split("\n").map((line) => {
        const bare = line.replace(/^(#{1,3}\s+|[-·•]\s+|\d{1,2}[.)]\s+|>\s?)/, "");
        return (k === "ol" ? (++i) + ". " : mark) + bare;
      }).join("\n");
      nv = v.slice(0, ls) + block + v.slice(le); ca = ls; cb = ls + block.length;
    }
    ta.value = nv; ta.focus(); ta.setSelectionRange(ca, cb);
  }
  // 공지 사진 (모달이 열려 있는 동안의 임시 목록) — 긴 변 1280px JPEG 로 줄여서 저장
  let imgDraft = [];
  function imgEditorHtml() {
    return (imgDraft.length ? '<ul class="a-img-list">' + imgDraft.map((im, i) => '<li><img src="' + esc(im.data || im.url) + '" alt=""><span class="a-img-no">사진' + (i + 1) + "</span>" +
      '<span class="a-img-tools"><button type="button" class="a-icon-btn sm" data-action="img-move" data-i="' + i + '" data-dir="-1" aria-label="앞으로"' + (i === 0 ? " disabled" : "") + ">" + icon("chevLeft", "sm") + "</button>" +
      '<button type="button" class="a-icon-btn sm" data-action="img-move" data-i="' + i + '" data-dir="1" aria-label="뒤로"' + (i === imgDraft.length - 1 ? " disabled" : "") + ">" + icon("chevRight", "sm") + "</button>" +
      '<button type="button" class="a-icon-btn sm" data-action="img-remove" data-i="' + i + '" aria-label="사진 삭제">' + icon("trash", "sm") + "</button></span></li>").join("") + "</ul>" : "") +
      '<div class="a-att-add"><label class="a-btn a-btn-ghost a-btn-sm">' + icon("image", "sm") + '사진 올리기<input type="file" id="img-file" class="sr-only" accept="image/*" multiple></label>' +
      '<span class="a-muted">' + (imgDraft.length ? "본문에 [사진1] 처럼 적은 자리에 들어가고, 나머지는 글 아래에 순서대로 보여요." : "사진은 글 아래에 순서대로 보여요. 본문에 [사진1]을 적으면 그 자리에 들어가요.") + "</span></div>";
  }
  const refreshImg = () => { const el = document.getElementById("img-editor"); if (el) el.innerHTML = imgEditorHtml(); };
  function addImgFiles(files) {
    Array.from(files || []).filter((f) => /^image\//.test(f.type)).forEach((file) => {
      const r = new FileReader();
      r.onload = () => {
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, 1280 / Math.max(img.width, img.height));
          const cv = document.createElement("canvas");
          cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
          const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
          imgDraft.push({ id: DB.uid("im"), name: file.name, data: cv.toDataURL("image/jpeg", 0.82) });
          refreshImg();
        };
        img.onerror = () => toast(file.name + " 은(는) 열 수 없는 사진이에요.", "warn");
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }
  // 첨부 자료 편집 (모달이 열려 있는 동안의 임시 목록)
  let attDraft = [];
  const MAX_FILE = 2 * 1024 * 1024;
  const fsize = (n) => (!n ? "" : n < 1048576 ? Math.max(1, Math.round(n / 1024)) + "KB" : (n / 1048576).toFixed(1) + "MB");
  function attEditorHtml() {
    return (attDraft.length ? '<ul class="a-att-list">' + attDraft.map((f, i) => '<li><span class="a-att-ext">' + esc((f.name.split(".").pop() || "").toUpperCase().slice(0, 4)) + '</span><span class="a-att-name">' + esc(f.name) + "<small>" + (f.data ? "파일 · " + fsize(f.size) : "링크 · " + esc(f.url)) + '</small></span><button type="button" class="a-icon-btn sm" data-action="att-remove" data-i="' + i + '" aria-label="삭제">' + icon("trash", "sm") + "</button></li>").join("") + "</ul>" : '<p class="a-muted a-att-empty">아직 첨부한 자료가 없어요.</p>') +
      '<div class="a-att-add"><label class="a-btn a-btn-ghost a-btn-sm">' + icon("paperclip", "sm") + '파일 올리기<input type="file" id="att-file" class="sr-only" multiple></label>' +
      '<span class="a-muted">파일은 2MB까지 · 큰 파일은 링크로</span></div>' +
      '<div class="a-att-link"><input class="a-input a-sm" id="att-link-name" placeholder="자료 이름 (예: 1주차 교습지.pdf)"><input class="a-input a-sm" id="att-link-url" type="url" placeholder="https://drive.google.com/…">' + btn(icon("link", "sm") + "링크 추가", "att-link-add", "a-btn-ghost a-btn-sm") + "</div>";
  }
  const refreshAtt = () => { const el = document.getElementById("att-editor"); if (el) el.innerHTML = attEditorHtml(); };
  function addAttFiles(files) {
    Array.from(files || []).forEach((file) => {
      if (file.size > MAX_FILE) { toast(file.name + " 은(는) 2MB가 넘어요. 구글 드라이브 링크로 추가해 주세요.", "warn"); return; }
      const r = new FileReader();
      r.onload = () => { attDraft.push({ id: DB.uid("a"), name: file.name, data: r.result, size: file.size }); refreshAtt(); };
      r.readAsDataURL(file);
    });
  }

  function editItem(coll, id, ctx) {
    const def = COLL[coll], c = C();
    const list = def.list(c, ctx);
    const item = id ? list.find((x) => (x.id || String(x.no)) === id) : Object.assign({}, def.init ? def.init() : {});
    if (!item) return;
    const attF = def.fields.find((f) => f.type === "attachments");
    attDraft = DB.clone((attF && item[attF.key]) || []);
    imgDraft = DB.clone(item.images || []);
    openModal((id ? def.name + " 수정" : def.name + " 추가"),
      '<form id="coll-form" class="a-form" data-coll="' + coll + '" data-id="' + esc(id || "") + '" data-ctx="' + esc(ctx || "") + '" novalidate>' + def.fields.map((f) => fieldHtml(f, item)).join("") + '<p class="a-error" id="coll-error"></p></form>',
      (id ? btn(icon("trash", "sm") + "삭제", "item-delete", "a-btn-ghost danger", ' data-coll="' + coll + '" data-id="' + esc(id) + '" data-ctx="' + esc(ctx || "") + '"') : "") + '<span class="a-spacer"></span>' + btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="coll-form">저장</button>', "md");
    applyShowIf();
  }
  function applyShowIf() {
    const form = document.getElementById("coll-form");
    if (!form) return;
    form.querySelectorAll("[data-show-if]").forEach((el) => {
      const [k, v] = el.dataset.showIf.split("=");
      el.hidden = !form[k] || form[k].value !== v;
    });
  }
  function saveItem(form) {
    const def = COLL[form.dataset.coll], c = C(), ctx = form.dataset.ctx, id = form.dataset.id;
    const list = def.list(c, ctx);
    const item = id ? list.find((x) => (x.id || String(x.no)) === id) : Object.assign({}, def.init ? def.init() : {});
    const err = document.getElementById("coll-error");
    for (const f of def.fields) {
      const el = f.type === "attachments" || f.type === "images" ? true : form[f.key];
      if (!el) continue;
      let v;
      if (f.type === "checkbox") v = el.checked;
      else if (f.type === "attachments") v = attDraft.slice();
      else if (f.type === "images") v = imgDraft.slice();
      else if (f.type === "lines") v = LINES(el.value);
      else if (f.type === "tags") v = TAGS(el.value);
      else if (f.type === "number") v = el.value === "" ? "" : Number(el.value);
      else if (f.type === "youtube") { v = DB.youtubeId(el.value); if (el.value.trim() && !v) { err.textContent = "유튜브 주소를 확인해 주세요. (youtube.com/watch?v=… 또는 youtu.be/…)"; return; } }
      else v = el.value.trim();
      if (f.set) f.set(item, v); else item[f.key] = v;
    }
    const titleKey = def.fields[0].key;
    if (def.fields[0].type === "text" && !item[titleKey] && titleKey !== "type") { err.textContent = def.fields[0].label + "을(를) 입력해 주세요."; return; }
    if (form.dataset.coll === "mission") {
      // 제출 방식에 없는 입력을 자동검수가 요구하면 영영 통과할 수 없으니 맞춰 준다
      const ck = item.check = item.check || {};
      if (item.type !== "image") delete ck.image;
      if (item.type !== "link") { delete ck.link; delete ck.linkHint; }
      if (item.type === "link" && ck.linkHint) ck.link = true;
    }
    if (form.dataset.coll === "channel") {
      // 이메일 · 전화는 주소만 적어도 바로 열리게
      const u = (item.url || "").trim();
      if (u && item.type === "email" && !/^mailto:/i.test(u) && /@/.test(u)) item.url = "mailto:" + u;
      else if (u && item.type === "phone" && !/^tel:/i.test(u) && /^[\d\s+()-]+$/.test(u)) item.url = "tel:" + u.replace(/[^\d+]/g, "");
      else if (u && !/^(https?:|mailto:|tel:)/i.test(u)) item.url = "https://" + u.replace(/^\/+/, "");
    }
    if (form.dataset.coll === "partner" && item.featured) list.forEach((x) => { if (x !== item) x.featured = false; });
    if (form.dataset.coll === "event") {
      if (!item.title) { err.textContent = "일정 이름을 입력해 주세요."; return; }
      if (item.scope === "cohort" && (!item.cohortId || !item.date)) { err.textContent = "기수와 날짜를 골라 주세요."; return; }
      if (item.scope === "cohort") { delete item.week; delete item.dow; } else { delete item.cohortId; delete item.date; item.week = Math.max(1, Number(item.week) || 1); }
    }
    if (!id) {
      if (form.dataset.coll === "week") item.no = list.length + 1;
      else item.id = DB.uid(def.idp || "x");
      if (def.prepend) list.unshift(item); else list.push(item);
    }
    if (def.after) def.after(c);
    if (!DB.save()) { if (!id) list.splice(list.indexOf(item), 1); toast("저장 공간이 부족해요. 큰 파일은 지우고 링크로 바꿔 주세요.", "warn"); DB.load(); return; }
    commit(def.name + "을(를) 저장했어요.");
  }
  function deleteItem(coll, id, ctx) {
    const def = COLL[coll], c = C();
    const list = def.list(c, ctx);
    const i = list.findIndex((x) => (x.id || String(x.no)) === id);
    if (i < 0) return;
    const label = list[i].title || list[i].q || def.name;
    confirmModal(def.name + " 삭제", "‘" + esc(label) + "’을(를) 삭제할까요?" + (coll === "week" ? "<br>이 주차의 강의와 과제도 함께 삭제돼요." : "") + "<br>수강생 화면에서도 바로 사라져요.", "삭제", true, () => {
      list.splice(i, 1);
      if (def.after) def.after(c);
      commit("삭제했어요.");
    });
  }
  function moveItem(coll, id, ctx, dir) {
    const def = COLL[coll], c = C();
    const list = def.list(c, ctx);
    const i = list.findIndex((x) => (x.id || String(x.no)) === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    if (def.after) def.after(c);
    DB.save(); render();
  }
  const rowTools = (coll, id, ctx, i, n) => '<div class="a-row-actions">' +
    '<button class="a-icon-btn sm" data-action="item-move" data-coll="' + coll + '" data-id="' + esc(id) + '" data-ctx="' + esc(ctx || "") + '" data-dir="-1" aria-label="위로"' + (i === 0 ? " disabled" : "") + ">" + icon("arrowUp", "sm") + "</button>" +
    '<button class="a-icon-btn sm" data-action="item-move" data-coll="' + coll + '" data-id="' + esc(id) + '" data-ctx="' + esc(ctx || "") + '" data-dir="1" aria-label="아래로"' + (i === n - 1 ? " disabled" : "") + ">" + icon("arrowDown", "sm") + "</button>" +
    btn(icon("pen", "sm") + "수정", "item-edit", "a-btn-ghost a-btn-sm", ' data-coll="' + coll + '" data-id="' + esc(id) + '" data-ctx="' + esc(ctx || "") + '"') + "</div>";
  const addBtn = (coll, label, ctx, cls) => btn(icon("plus", "sm") + label, "item-add", cls || "a-btn-primary", ' data-coll="' + coll + '" data-ctx="' + esc(ctx || "") + '"');
  function simpleList(coll, items, render1, emptyText) {
    if (!items.length) return emptyBox("inbox", emptyText);
    return '<ul class="a-items">' + items.map((it, i) => "<li>" + render1(it) + rowTools(coll, it.id || String(it.no), "", i, items.length) + "</li>").join("") + "</ul>";
  }
  const ytBadge = (it) => (DB.youtubeId(it.youtubeId) ? pill("영상 연결됨", "ok") : pill("영상 없음", "mute"));

  /* ---------------- 콘텐츠 화면들 ---------------- */
  function pageBrand() {
    const b = C().brand;
    const f = (k, label, v, hint, type) => '<div class="a-field"><label for="bf-' + k + '">' + label + "</label>" + (type === "textarea" ? '<textarea class="a-input" id="bf-' + k + '" name="' + k + '" rows="3">' + esc(v) + "</textarea>" : '<input class="a-input" id="bf-' + k + '" name="' + k + '" value="' + esc(v) + '"' + (type ? ' type="' + type + '"' : "") + ">") + (hint ? '<small class="a-muted">' + hint + "</small>" : "") + "</div>";
    return head("기본 정보 · 색상 · AI봇", "수강생 화면의 색상, 상단 이름, 로그인 화면 문구, AI봇 이름을 정해요.") +
      '<form id="brand-form" class="a-card a-form">' +
        '<h2 class="a-sub">수강생 화면 색상</h2><p class="a-muted" style="margin:-6px 0 0">수강생 로그인 화면과 학습 화면 전체가 이 색으로 바뀌어요. 강사센터는 늘 파란색이에요.</p>' + themePicker(b.theme) +
        '<h2 class="a-sub">브랜드</h2><div class="a-form-row">' + f("name", "브랜드 이름", b.name, "로그인 화면 왼쪽 위·상단 작은 글씨") + f("instructor", "강사 표시 이름", b.instructor, "공지·수료증 서명·AI봇 인사말에 쓰여요") + "</div>" +
        f("courseTitle", "강의 이름", b.courseTitle, "수강생 화면 맨 위 제목") +
        '<div class="a-form-row">' + f("shortTitle", "짧은 강의 이름", b.shortTitle, "로그인 화면 배지") + f("tagline", "한 줄 소개", b.tagline) + "</div>" +
        '<h2 class="a-sub">로그인 화면</h2>' +
        f("loginEyebrow", "헤드라인 위 작은 글씨", b.loginEyebrow, "영문 대문자로 적으면 잘 어울려요 (예: DOOGO CLASS)") +
        f("loginHeadline", "헤드라인 (두 줄까지, 줄바꿈 가능)", b.loginHeadline, "마지막 줄은 고른 색으로 강조돼요", "textarea") +
        f("loginSub", "헤드라인 아래 설명", b.loginSub, "", "textarea") +
        '<div class="a-form-row">' + f("youtubeChannel", "유튜브 채널 주소", b.youtubeChannel, "", "url") + f("freeCourseUrl", "무료 강의 · 소개 페이지 주소", b.freeCourseUrl, "", "url") + "</div>" +
        '<h2 class="a-sub">강의 운영</h2><div class="a-form-row">' + f("liveTime", "주차 강의 오픈 시간", b.liveTime, "강의 일정의 ‘강의 오픈’ 옆에 표시", "time") + f("botName", "AI봇 이름", b.botName, "수강생 메뉴와 채팅창 이름") + "</div>" +
        '<div class="a-form-row">' + f("liveUrl", "주차 강의 입장 링크 (줌 등)", b.liveUrl || "", "넣으면 강의 오픈일에 수강생 홈·일정에 ‘입장하기’ 버튼이 생겨요", "url") + f("kakaoChannel", "카카오톡 문의 주소", b.kakaoChannel || "", "오픈채팅·채널 주소. 수강생 왼쪽 메뉴 아래에 ‘카카오톡 문의’ 버튼이 생겨요", "url") + "</div>" +
        '<label class="a-check"><input type="checkbox" name="worldClock"' + (b.worldClock ? " checked" : "") + '><span>수강생 화면 위에 <b>한국 · 뉴질랜드 현재 시간</b> 보이기 <small class="a-muted">(뉴질랜드 서머타임 자동 반영)</small></span></label>' +
        f("quotes", "오늘의 한마디 (한 줄에 하나)", (C().quotes || []).join("\n"), "홈·동기부여 화면에 날마다 돌아가며 보여요", "textarea") +
        '<div class="a-form-foot"><button class="a-btn a-btn-primary" type="submit">저장</button></div>' +
      "</form>";
  }
  function saveBrand(f) {
    const c = C(), b = c.brand;
    ["name", "instructor", "courseTitle", "shortTitle", "tagline", "loginEyebrow", "loginSub", "youtubeChannel", "freeCourseUrl", "liveTime", "botName", "liveUrl", "kakaoChannel"].forEach((k) => { b[k] = f[k].value.trim(); });
    if (f.theme) { b.theme = f.theme.value; b.themeSet = true; }
    b.worldClock = !!(f.worldClock && f.worldClock.checked);
    b.loginHeadline = f.loginHeadline.value.split("\n").map((x) => x.trim()).filter(Boolean).join("\n");
    c.quotes = LINES(f.quotes.value);
    if (!b.name) { toast("브랜드 이름을 입력해 주세요.", "warn"); return; }
    const ins = INS();
    commit("기본 정보를 저장했어요.");
    if (ins) { /* 수강생 로그인 선택지 이름은 마스터가 관리 */ }
  }
  function curBar() {
    const iid = IID(), cur = CUR(), list = DB.curricula(iid), used = usedBy(cur.id);
    return '<section class="a-card a-cur-bar"><div class="a-cur-top"><label class="a-label" for="cur-pick">편집할 커리큘럼</label>' +
        '<select class="a-input" id="cur-pick">' + list.map((x) => '<option value="' + x.id + '"' + (x.id === cur.id ? " selected" : "") + ">" + esc(x.name) + " · " + x.weeks.length + "주" + (usedBy(x.id).length ? " · " + usedBy(x.id).map((co) => co.name).join(", ") : " · 쓰는 기수 없음") + "</option>").join("") + "</select>" +
        '<div class="a-row-actions">' + btn(icon("plus", "sm") + "새 커리큘럼", "cur-new", "a-btn-primary a-btn-sm") + btn(icon("pen", "sm") + "이름", "cur-rename", "a-btn-ghost a-btn-sm") + (cur.main ? "" : btn(icon("trash", "sm") + "삭제", "cur-delete", "a-btn-ghost a-btn-sm danger")) + "</div></div>" +
        '<p class="a-cur-info">' + icon("layers", "xs") + " <b>" + esc(cur.name) + "</b> · " + cur.weeks.length + "주 · 강의 " + cur.weeks.reduce((a, w) => a + w.lessons.length, 0) + "개 · 과제 " + cur.weeks.reduce((a, w) => a + w.missions.length, 0) + "개 · " +
          (used.length ? "쓰는 기수: " + used.map((co) => esc(co.name) + " (" + esc(classText(co)) + ")").join(", ") : "아직 이 커리큘럼을 쓰는 기수가 없어요. ‘기수 관리’에서 기수마다 커리큘럼을 고를 수 있어요.") + "</p></section>";
  }
  function pageCurriculum() {
    const c = { weeks: CUR().weeks };
    const co = usedBy(CUR().id).find((x) => DB.cohortStatus(x) !== "ended") || usedBy(CUR().id).slice(-1)[0];
    return head("커리큘럼", "커리큘럼을 여러 개 만들어 두고 기수마다 골라 쓸 수 있어요 (예: 1·2기 5주 과정, 3기부터 4주 과정). 주차를 더하거나 지우면 그 커리큘럼을 쓰는 기수의 기간·일정이 자동으로 바뀌어요" + (co ? " (" + esc(co.name) + " 기준 날짜 표시)" : "") + ".", addBtn("week", "주차 추가")) + curBar() +
      (c.weeks.length ? '<div class="a-stack">' + c.weeks.map((w, wi) =>
        '<section class="a-card"><div class="a-card-head"><span class="a-weekno">' + w.no + "주차</span><div class=\"a-grow\"><h2>" + esc(w.title) + '</h2><p class="a-muted">' + esc(w.subtitle || w.summary || "") + (co ? " · 강의일 " + fmtMD(DB.classDate(co, w.no)) : "") + "</p></div>" + rowTools("week", String(w.no), "", wi, c.weeks.length) + "</div>" +
          (w.goal || (w.topics || []).length ? '<div class="a-cw-info">' + (w.goal ? "<p><b>핵심 목표</b>" + esc(w.goal) + "</p>" : "") + ((w.topics || []).length ? "<p><b>강의 내용 " + w.topics.length + "</b>" + esc(w.topics.join(" · ")) + "</p>" : "") + "</div>"
            : '<p class="a-cw-empty">' + icon("alert", "xs") + " 핵심 목표와 강의 내용을 적으면 수강생 커리큘럼에 보여요. ‘수정’을 눌러 채워 주세요.</p>") +
          (w.lessons.length ? '<ul class="a-items">' + w.lessons.map((l, i) => '<li><div class="a-item-main"><b>' + esc(l.title) + "</b><small>" + (l.minutes ? l.minutes + "분 · " : "") + esc(l.desc || "") + "</small></div>" + ytBadge(l) + rowTools("lesson", l.id, w.no, i, w.lessons.length) + "</li>").join("") + "</ul>" : '<p class="a-muted a-pad">아직 강의가 없어요.</p>') +
          '<div class="a-card-foot">' + addBtn("lesson", "강의 추가", w.no, "a-btn-ghost a-btn-sm") + '<a class="a-link" href="#/center/missions">이 주차 과제 ' + w.missions.length + "개 " + icon("arrowRight", "xs") + "</a></div></section>").join("") + "</div>"
        : '<section class="a-card">' + emptyBox("book", "주차를 추가해서 커리큘럼을 만들어 주세요.", addBtn("week", "주차 추가")) + "</section>");
  }
  function pageMissions() {
    const c = { weeks: CUR().weeks };
    const total = c.weeks.reduce((a, w) => a + w.missions.length, 0);
    const req = c.weeks.reduce((a, w) => a + w.missions.filter((m) => m.required).length, 0);
    const typeL = { image: "사진", link: "링크", text: "글" };
    return head("과제", "주차별 과제와 자동검수 기준을 정해요. 필수 과제 " + req + "개를 모두 통과하면 수료증이 발급돼요. (전체 " + total + "개)") + curBar() +
      (c.weeks.length ? '<div class="a-stack">' + c.weeks.map((w) =>
        '<section class="a-card"><div class="a-card-head"><span class="a-weekno">' + w.no + '주차</span><h2 class="a-grow">' + esc(w.title) + "</h2>" + addBtn("mission", "과제 추가", w.no, "a-btn-ghost a-btn-sm") + "</div>" +
          (w.missions.length ? '<ul class="a-items">' + w.missions.map((m, i) => '<li><div class="a-item-main"><b>' + esc(m.title) + "</b><small>" + esc(m.desc || "") + "</small></div>" + kindPill(m) + pill(typeL[m.type] || m.type, "mute") + ((m.templates || []).length ? pill("양식 " + m.templates.length, "info") : "") + rowTools("mission", m.id, w.no, i, w.missions.length) + "</li>").join("") + "</ul>" : '<p class="a-muted a-pad">아직 과제가 없어요.</p>') +
        "</section>").join("") + "</div>"
        : '<section class="a-card">' + emptyBox("clipboard", "커리큘럼에서 주차를 먼저 만들어 주세요.", '<a class="a-btn a-btn-primary" href="#/center/curriculum">커리큘럼으로</a>') + "</section>");
  }
  function pageSchedule() {
    const iid = IID(), c = C();
    const cos = DB.cohortsOf(iid);
    if (!ui.schedCohort || !cos.some((x) => x.id === ui.schedCohort)) ui.schedCohort = (DB.currentCohort(iid) || {}).id;
    const co = DB.cohort(ui.schedCohort);
    const T = DB.EVENT_TYPES;
    const cls = { qna: "warn", notice: "mute", challenge: "ok", event: "dark", open: "info", deadline: "bad" };
    return head("강의 일정", "‘강의 오픈’과 ‘과제 마감’은 기수 시작일로 자동 계산돼요. 라이브 Q&A·공지·챌린지 같은 일정만 추가하세요.", addBtn("event", "일정 추가")) +
      '<section class="a-card"><div class="a-card-head"><h2>추가한 일정</h2><span class="a-muted">' + c.schedule.length + "개</span></div>" +
        simpleList("event", c.schedule, (e) => '<div class="a-item-main"><b>' + esc(e.title) + "</b><small>" + esc(DB.ruleText(e)) + (e.time ? " · " + esc(e.time) : "") + "</small></div>" + pill(T[e.type].label, cls[e.type]), "추가한 일정이 없어요.") + "</section>" +
      '<section class="a-card"><div class="a-card-head"><h2>기수별 전체 일정 미리보기</h2><select class="a-input a-sm" id="sched-cohort" aria-label="기수">' + cos.map((x) => '<option value="' + x.id + '"' + (x.id === ui.schedCohort ? " selected" : "") + ">" + esc(x.name) + "</option>").join("") + "</select></div>" +
        (co ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>날짜</th><th>종류</th><th>일정</th></tr></thead><tbody>' + DB.events(iid, co).map((e) => '<tr><td class="num">' + fmtMD(e.date) + (e.time ? " " + esc(e.time) : "") + "</td><td>" + pill(T[e.type].label, cls[e.type]) + "</td><td>" + esc(e.title) + (e.auto ? ' <small class="a-muted">자동</small>' : "") + "</td></tr>").join("") + "</tbody></table></div>" : emptyBox("calendar", "기수를 먼저 만들어 주세요.")) +
      "</section>";
  }
  function pageNotices() {
    const list = C().notices.slice().sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date));
    return head("공지사항", "수강생 홈과 공지사항 메뉴에 보여요. ‘필독’으로 고정하면 맨 위에 떠요.", addBtn("notice", "공지 쓰기")) +
      '<section class="a-card">' + (list.length ? '<ul class="a-items">' + list.map((n) => '<li><div class="a-item-main"><b>' + esc(n.title) + "</b><small>" + fmtFull(n.date) + " · " + esc((n.body || "").slice(0, 60)) + "</small></div>" + ((n.images || []).length ? pill("사진 " + n.images.length, "info") : "") + (DB.youtubeId(n.youtubeId) ? pill("영상", "info") : "") + (n.pinned ? pill("필독", "dark") : "") +
        '<div class="a-row-actions">' + btn(icon("pen", "sm") + "수정", "item-edit", "a-btn-ghost a-btn-sm", ' data-coll="notice" data-id="' + n.id + '"') + "</div></li>").join("") + "</ul>" : emptyBox("megaphone", "아직 공지가 없어요.")) + "</section>";
  }
  function pageFaq() {
    const c = C();
    const cats = faqCats();
    return head("Q&A 자주 묻는 질문", "수강생 Q&A 메뉴에 분류별로 보이고, AI봇도 이 답변을 바탕으로 대답해요.", btn(icon("clipboard", "sm") + "한꺼번에 붙여넣기", "faq-bulk", "a-btn-outline") + addBtn("faq", "질문 추가")) +
      (c.faqs.length ? cats.map((cat) => {
        const items = c.faqs.filter((f) => (f.category || "기타") === cat);
        return '<section class="a-card"><div class="a-card-head"><h2>' + esc(cat) + '</h2><span class="a-muted">' + items.length + "개</span></div>" +
          '<ul class="a-items">' + items.map((f) => { const i = c.faqs.indexOf(f); return '<li><div class="a-item-main"><b>Q. ' + esc(f.q) + "</b><small>" + esc(f.a) + "</small></div>" + rowTools("faq", f.id, "", i, c.faqs.length) + "</li>"; }).join("") + "</ul></section>";
      }).join("") : '<section class="a-card">' + emptyBox("help", "자주 묻는 질문이 없어요.", btn(icon("clipboard", "sm") + "한꺼번에 붙여넣기", "faq-bulk", "a-btn-primary")) + "</section>") +
      '<p class="a-hint">' + icon("bug", "xs") + " 수강생의 오류·불편 신고는 ‘요청사항 답변’ 메뉴에서 답해 주세요.</p>";
  }
  // 붙여넣기 형식: [분류] 줄, Q. 질문 줄, A. 답변(여러 줄 가능)
  function parseFaqText(text) {
    const out = [];
    let cat = "기타", cur = null, mode = null;
    String(text || "").split(/\r?\n/).forEach((raw) => {
      const line = raw.trim();
      if (!line) { return; }
      let m;
      if ((m = line.match(/^(?:\[(.+)\]|#+\s*(.+))$/))) { cat = (m[1] || m[2]).trim(); return; }
      if ((m = line.match(/^(?:Q|질문)\s*[.:)\]]?\s*(.+)$/i))) { cur = { category: cat, q: m[1].trim(), a: "", tags: [] }; out.push(cur); mode = "q"; return; }
      if ((m = line.match(/^(?:A|답변?)\s*[.:)\]]?\s*(.*)$/i)) && cur) { cur.a = m[1].trim(); mode = "a"; return; }
      if (cur && mode === "a") cur.a += (cur.a ? "\n" : "") + line;
      else if (cur && mode === "q") cur.q += " " + line;
    });
    return out.filter((x) => x.q && x.a);
  }
  function faqBulkModal() {
    openModal("자주 묻는 질문 한꺼번에 붙여넣기",
      '<form id="faq-bulk-form" class="a-form" novalidate><p class="a-muted" style="margin:0">다른 곳의 FAQ를 복사해서 아래 형식으로 붙여 넣으면 한 번에 등록돼요. 분류 줄은 없어도 돼요.</p>' +
      '<pre class="a-format">[수강 · 로그인]\nQ. 로그인이 안 돼요.\nA. 이름과 휴대폰 번호 뒷자리로 로그인합니다.\n\n[과제 · 수료]\nQ. 과제 마감은 언제인가요?\nA. 주차가 열리고 6일 뒤입니다.</pre>' +
      '<div class="a-field"><label for="fb-text">붙여넣을 내용</label><textarea class="a-input" id="fb-text" name="text" rows="10" placeholder="Q. 질문&#10;A. 답변"></textarea><small class="a-muted" id="fb-count">0개 인식됨</small></div>' +
      '<label class="a-check"><input type="checkbox" name="replace"><span>기존 질문을 모두 지우고 이걸로 바꾸기</span></label></form>',
      btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="faq-bulk-form">등록</button>', "lg");
  }

  function pageGuide() {
    const qls = DB.quickLinksOf(C());
    return head("시작 가이드 · 자주 찾는 페이지", "수강생 홈 맨 위에 체크리스트로 보여요. 수강생이 모두 체크하면 자동으로 사라져요. 1주차 항목은 처음 한 번, ‘보이는 주차’를 정한 항목은 그 주차가 열릴 때 다시 떠요.", addBtn("guide", "단계 추가")) +
      '<section class="a-card">' + simpleList("guide", C().guide, (g) => '<div class="a-item-main"><b>' + esc(g.title) + "</b><small>" + esc([g.desc, g.url].filter(Boolean).join(" · ")) + "</small></div>" + pill((Number(g.week) || 1) <= 1 ? "처음 한 번" : g.week + "주차", (Number(g.week) || 1) <= 1 ? "mute" : "info"), "단계가 없어요. 단계가 없으면 홈에 시작 가이드가 보이지 않아요.") + "</section>" +
      '<p class="a-hint">' + icon("alert", "xs") + " 예: 오픈채팅방 입장 → 공지 읽기 → 1주차 첫 강의 보기 → AI봇에게 질문해 보기 · 2주차: 2주차 라이브 다시보기 → 마진 계산기 써 보기</p>" +
      '<div class="a-card-head" style="margin-top:28px"><h2 class="a-grow">자주 찾는 페이지</h2>' + btn("기본 목록으로", "ql-reset", "a-btn-ghost a-btn-sm") + addBtn("ql", "페이지 추가") + "</div>" +
      '<p class="a-muted" style="margin:0 0 12px">수강생 홈 공지사항 밑에 카드로 보여요. 플랫폼 안 메뉴는 윗줄(기본 색), https:// 외부 링크는 아랫줄(아이콘 색)로 나뉘어요. 꺼진 메뉴나 주소가 빈 카드는 보이지 않아요.</p>' +
      '<section class="a-card">' + simpleList("ql", qls, (l) => '<div class="a-item-main"><b>' + icon(l.icon || "link", "xs") + " " + esc(l.title) + "</b><small>" + esc([l.desc, l.url || "주소 없음 (숨김)"].filter(Boolean).join(" · ")) + "</small></div>" + (l.color ? '<span class="a-ql-swatch" style="background:' + esc(l.color) + '"></span>' : "") + (/^https?:/i.test(l.url || "") ? pill("외부 링크 · 아랫줄", "info") : !l.url ? pill("숨김", "mute") : pill("플랫폼 · 윗줄", "mute")), "자주 찾는 페이지가 없어요.") + "</section>";
  }
  function pageMenus() {
    ui.mMenuIns = IID();
    return pageMasterMenus({ params: new URLSearchParams() }, true);
  }
  function pageDocs() {
    return head("서류 준비 가이드", "판매 시작 전에 필요한 서류를 단계별로 안내해요. 순서는 화살표로 바꿀 수 있어요.", addBtn("doc", "단계 추가")) +
      '<section class="a-card">' + simpleList("doc", C().docsGuide, (g) => '<div class="a-item-main"><b>' + esc(g.title) + "</b><small>" + esc([g.where, g.time, g.cost].filter(Boolean).join(" · ")) + "</small></div>", "서류 단계가 없어요.") + "</section>";
  }
  function pageChannels() {
    const list = DB.channelsOf(C());
    return head("1:1 소통채널", "수강생 메뉴 ‘1:1 소통채널’에 카드로 보여요. 카카오톡 채널 · 채널톡 · 네이버 톡톡 · 이메일 · 전화 등 강사님이 실제로 쓰는 상담 창구를 넣어 두면, 수강생이 누르는 순간 그 채널로 연결돼요.", addBtn("channel", "채널 추가")) +
      '<section class="a-card">' + simpleList("channel", list, (ch) => { const t = DB.channelType(ch.type), lk = DB.channelLook(ch); return '<span class="a-ch-ic" style="background:' + (lk.color || "var(--m-primary)") + ";color:" + (lk.ink || "#fff") + '">' + icon(lk.icon, "sm") + '</span><div class="a-item-main"><b>' + esc(ch.title || t.label) + "</b><small>" + esc([ch.tag, t.label, ch.hours, ch.url || ((ch.note || "").trim() ? "링크 없이 안내 문구만 보여요" : "주소 없음 (수강생에게 ‘준비 중’으로 보여요)")].filter(Boolean).join(" · ")) + "</small></div>" + (ch.url ? pill("연결됨", "ok") : (ch.note || "").trim() ? pill("안내만 (링크 없음)", "info") : pill("준비 중", "mute")); }, "채널이 없어요. ‘채널 추가’로 상담 창구를 만들어 주세요.") + "</section>" +
      '<p class="a-hint">' + icon("alert", "xs") + " 순서는 화살표로 바꿀 수 있어요. 메뉴를 숨기려면 ‘메뉴 구성’에서 1:1 소통채널을 꺼 주세요.</p>";
  }
  function pagePartners() {
    const c = C(), list = DB.partnersOf(c), G = DB.PARTNER_GROUPS;
    return head("제휴채널", "수강생 메뉴 ‘제휴채널’에 탭(전체보기 · 두고그룹 · 제휴사)으로 보여요. ‘맨 위에 크게’를 켠 곳(예: 두고 N카페)은 가장 위에 큰 카드와 ‘제휴 혜택 · 할인 코드 안내’ 띠로 보여요.", addBtn("partner", "제휴처 추가")) +
      '<section class="a-card">' + simpleList("partner", list, (x) => { const lk = DB.channelLook(Object.assign({ type: "other" }, x)); return '<span class="a-ch-ic" style="background:' + (lk.color || "var(--m-primary)") + ";color:" + DB.inkOn(lk.color) + '">' + icon(lk.icon, "sm") + '</span><div class="a-item-main"><b>' + esc(x.title) + "</b><small>" + esc([x.tag, x.url || "주소 없음 (‘준비 중’으로 보여요)"].filter(Boolean).join(" · ")) + "</small></div>" +
        pill((G.find((g) => g.key === x.group) || G[0]).label, x.group === "doogo" ? "dark" : "info") + (x.featured ? pill("맨 위 크게", "ok") : ""); }, "제휴처가 없어요. ‘제휴처 추가’로 만들어 주세요.") + "</section>" +
      '<p class="a-hint">' + icon("alert", "xs") + " 순서는 화살표로 바꿀 수 있어요. 메뉴를 숨기려면 ‘메뉴 구성’에서 제휴채널을 꺼 주세요. " + (Array.isArray(c.partners) || IID() === "moon" ? "" : "지금은 문대표 기본 구성(강사님 이름으로 바뀜)이 보이고 있어요. 하나라도 수정하면 강사님 것으로 저장돼요.") + "</p>";
  }
  function pageLibrary() {
    const c = C();
    const tabs = [["ebook", "전자책 · 가이드북"], ["file", "자료 파일"], ["vod", "이커머스 실전 VOD"], ["senior", "시니어 기초 가이드"]];
    const k = ui.libTab;
    const items = c.resources[k];
    const isVideo = k === "vod" || k === "senior";
    const ln = DB.libNoticeOf(c);
    return head("유료강의 자료실", "수강생 자료실 4개 분류에 자료와 영상을 올려요. VOD · 시니어 기초 가이드는 게시판처럼 영상(선택) + 글 + 사진 + 첨부 자료를 한 페이지로 보여 줘요.", addBtn("res-" + k, isVideo ? "글 쓰기" : "자료 추가")) +
      '<section class="a-card a-libnote"><div class="a-card-head"><span class="a-menu-ico">' + icon("shield", "sm") + '</span><div class="a-grow"><h2>자료실 이용 안내 팝업</h2><p class="a-muted">수강생이 자료실에 들어올 때마다 떠요. ‘' + esc(ln.button) + "’을 눌러야 자료가 보이고, 자료실 화면에는 열람자 이름 · 기수 · 시각이 옅게 표시돼요.</p></div>" +
        btn(icon("pen", "sm") + "문구 수정", "libnote-edit", "a-btn-ghost a-btn-sm") + "</div></section>" +
      '<section class="a-card"><div class="a-toolbar"><div class="a-tabs">' + tabs.map((t) => '<button type="button" class="a-tab' + (k === t[0] ? " on" : "") + '" data-action="lib-tab" data-k="' + t[0] + '">' + t[1] + ' <span class="num">' + c.resources[t[0]].length + "</span></button>").join("") + "</div></div>" +
        simpleList("res-" + k, items, (it) => '<div class="a-item-main"><b>' + esc(it.title) + "</b><small>" + esc([it.meta, it.desc].filter(Boolean).join(" · ")) + "</small></div>" + ((it.attachments || []).length ? pill("첨부 " + it.attachments.length, "info") : "") + (it.tool ? pill("계산기", "info") : isVideo ? ytBadge(it) : it.url ? pill("링크 연결됨", "ok") : pill("준비 중", "mute")), "아직 자료가 없어요.") + "</section>";
  }
  function pageMotivation() {
    return head("동기부여", "맨 위 영상이 수강생 홈의 ‘오늘의 동기부여’로 보여요. 새로 올린 영상은 맨 위에 들어가요. 한마디 문구는 기본 정보에서 고쳐요.", addBtn("mv", "영상 추가")) +
      '<section class="a-card">' + simpleList("mv", C().motivation, (it) => '<div class="a-item-main"><b>' + esc(it.title) + "</b><small>" + esc([it.minutes, it.date ? fmtMD(it.date) : ""].filter(Boolean).join(" · ")) + "</small></div>" + ytBadge(it), "동기부여 영상이 없어요.") + "</section>";
  }

  /* ---------------- 홍보 랜딩페이지 편집 ---------------- */
  // 편집 중인 내용은 ui.lp 에 두고, ‘저장’을 눌러야 공개 페이지에 반영된다
  function lpGet(obj, path) { return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj); }
  function lpSet(obj, path, v) { const ks = path.split("."); const last = ks.pop(); const o = ks.reduce((a, k) => (a[k] = a[k] == null ? {} : a[k]), obj); o[last] = v; }
  // ui.lpKind: "landing"(강의 소개) | "free"(무료강의 페이지) — 같은 편집 도구를 같이 쓴다
  function lpDraft() {
    const key = IID() + ":" + (ui.lpKind || "landing");
    if (!ui.lp || ui.lpFor !== key) { ui.lp = ui.lpKind === "free" ? DB.freeOf(IID()) : DB.landingOf(IID()); ui.lpFor = key; ui.lpDirty = false; ui.lpOpen = ui.lpOpen || { hero: true }; }
    return ui.lp;
  }
  const LP_HINT = { stats: "비워 두면 커리큘럼 기준으로 자동 표시 (주차·강의·과제 수)", curriculum: "주차와 강의 목록은 ‘커리큘럼’ 메뉴 내용이 그대로 나와요.", faq: "비워 두면 ‘Q&A 자주 묻는 질문’ 앞의 6개가 나와요.", platform: "결제 후 열리는 이 학습 플랫폼의 기능을 소개해요. (기능 목록은 자동)", reviews: "후기가 없으면 이 칸은 보이지 않아요. ‘예시 표시’를 켜 두면 카드에 ‘예시 후기’ 표시가 붙어요." };
  function lpField(path, label, type, hint) {
    const v = lpGet(ui.lp, path);
    const id = "lp-" + path.replace(/\./g, "-");
    let input;
    if (type === "textarea") input = '<textarea class="a-input" id="' + id + '" data-lp="' + path + '" rows="3">' + esc(v || "") + "</textarea>";
    else if (type === "lines") input = '<textarea class="a-input" id="' + id + '" data-lp-lines="' + path + '" rows="4">' + esc((v || []).join("\n")) + "</textarea>";
    else if (type === "image") input = '<div class="a-lp-img">' + (v ? '<img src="' + esc(v) + '" alt="">' + btn(icon("trash", "sm") + "지우기", "lp-img-del", "a-btn-ghost a-btn-sm", ' data-path="' + path + '"') : '<span class="a-muted">아직 사진이 없어요.</span>') + '<label class="a-btn a-btn-ghost a-btn-sm">' + icon("image", "sm") + "사진 올리기<input type=\"file\" accept=\"image/*\" class=\"sr-only\" data-lp-img=\"" + path + '"></label></div>';
    else input = '<input class="a-input" id="' + id + '" data-lp="' + path + '" value="' + esc(v || "") + '"' + (type === "url" ? ' type="url" placeholder="https://"' : type === "datetime" ? ' type="datetime-local"' : type === "date" ? ' type="date"' : "") + ">";
    return '<div class="a-field"><label' + (type === "image" ? "" : ' for="' + id + '"') + ">" + esc(label) + "</label>" + input + (hint ? '<small class="a-muted">' + esc(hint) + "</small>" : "") + "</div>";
  }
  function lpRows(path, cols, addLabel) {
    const list = lpGet(ui.lp, path) || [];
    return '<div class="a-lp-rows">' + list.map((row, i) => '<div class="a-lp-row">' +
        cols.map((c) => c[2] === "select"
          ? '<select class="a-input a-sm" data-lp="' + path + "." + i + "." + c[0] + '" aria-label="' + esc(c[1]) + '">' + c[3].map((o) => '<option value="' + o[0] + '"' + ((row[c[0]] || c[3][0][0]) === o[0] ? " selected" : "") + ">" + esc(c[1]) + " · " + esc(o[1]) + "</option>").join("") + "</select>"
          : c[2] === "datetime"
          ? '<input class="a-input a-sm" type="datetime-local" data-lp="' + path + "." + i + "." + c[0] + '" value="' + esc(row[c[0]] || "") + '" aria-label="' + esc(c[1]) + '" title="' + esc(c[1]) + '">'
          : c[2] === "date"
          ? '<input class="a-input a-sm" type="date" data-lp="' + path + "." + i + "." + c[0] + '" value="' + esc(row[c[0]] || "") + '" aria-label="' + esc(c[1]) + '" title="' + esc(c[1]) + '">'
          : c[2] === "check"
          ? '<label class="a-check"><input type="checkbox" data-lp-check="' + path + "." + i + "." + c[0] + '"' + (row[c[0]] ? " checked" : "") + "><span>" + esc(c[1]) + "</span></label>"
          : c[2] === "textarea"
            ? '<textarea class="a-input a-sm" data-lp="' + path + "." + i + "." + c[0] + '" rows="2" placeholder="' + esc(c[1]) + '" aria-label="' + esc(c[1]) + '">' + esc(row[c[0]] || "") + "</textarea>"
            : '<input class="a-input a-sm" data-lp="' + path + "." + i + "." + c[0] + '" value="' + esc(row[c[0]] || "") + '" placeholder="' + esc(c[1]) + '" aria-label="' + esc(c[1]) + '">').join("") +
        '<div class="a-lp-row-tools"><button type="button" class="a-icon-btn sm" data-action="lp-row-move" data-path="' + path + '" data-i="' + i + '" data-dir="-1" aria-label="위로"' + (i === 0 ? " disabled" : "") + ">" + icon("arrowUp", "sm") + '</button><button type="button" class="a-icon-btn sm" data-action="lp-row-del" data-path="' + path + '" data-i="' + i + '" aria-label="삭제">' + icon("trash", "sm") + "</button></div></div>").join("") +
      btn(icon("plus", "sm") + addLabel, "lp-row-add", "a-btn-ghost a-btn-sm", ' data-path="' + path + '" data-cols="' + cols.map((c) => c[0]).join(",") + '"') + "</div>";
  }
  function lpSectionBody(k) {
    switch (k) {
      case "hero": return lpField("hero.eyebrow", "헤드라인 위 작은 글씨") + lpField("hero.title", "헤드라인 (줄바꿈 가능, 마지막 줄은 강조)", "textarea") + lpField("hero.sub", "설명", "textarea") +
        '<div class="a-form-row">' + lpField("hero.ctaLabel", "버튼 글자") + lpField("hero.ctaUrl", "버튼 연결 주소 (결제 페이지 등)", "url", "비워 두면 이 플랫폼의 ‘수강 신청’ 창이 열려요") + "</div>" + lpField("hero.image", "오른쪽 사진 (없으면 학습 화면 모형이 보여요)", "image");
      case "stats": return lpRows("stats", [["value", "숫자 (예: 1,200명)"], ["label", "설명 (예: 누적 수강생)"]], "숫자 추가");
      case "about": return '<div class="a-form-row">' + lpField("about.name", "이름") + lpField("about.role", "한 줄 소개") + "</div>" + lpField("about.body", "소개 글", "textarea") + lpField("about.career", "경력 · 이력 (한 줄에 하나)", "lines") + lpField("about.photo", "강사 사진", "image") + lpField("about.title", "작은 제목");
      case "points": return lpField("points.title", "제목") + lpRows("points.items", [["title", "제목"], ["desc", "설명", "textarea"]], "항목 추가") + lpField("points.forWho", "이런 분께 추천해요 (한 줄에 하나)", "lines");
      case "curriculum": return lpField("curriculum.title", "제목") + lpField("curriculum.sub", "설명");
      case "platform": return lpField("platform.title", "제목") + lpField("platform.sub", "설명");
      case "reviews": return lpField("reviews.title", "제목") + lpRows("reviews.items", [["name", "이름 (예: 김*진)"], ["meta", "기수 · 결과 (예: 2기 수료)"], ["text", "후기 내용", "textarea"], ["sample", "예시 표시", "check"]], "후기 추가");
      case "pricing": return lpField("pricing.title", "제목") + '<div class="a-form-row">' + lpField("pricing.price", "가격 (예: 590,000원)", "", "비워 두면 강의 이름이 크게 보여요") + lpField("pricing.original", "원래 가격 (취소선)") + "</div>" + lpField("pricing.period", "진행 방식 (예: 5주 과정 + 다시보기)") +
        lpField("pricing.includes", "포함 내용 (한 줄에 하나)", "lines") + '<div class="a-form-row">' + lpField("pricing.ctaLabel", "버튼 글자") + lpField("pricing.ctaUrl", "버튼 연결 주소", "url", "비워 두면 ‘수강 신청’ 창") + "</div>" + lpField("pricing.note", "버튼 아래 안내");
      case "faq": return lpField("faq.title", "제목") + lpRows("faq.items", [["q", "질문"], ["a", "답변", "textarea"]], "질문 추가") + btn(icon("clipboard", "sm") + "Q&A 자주 묻는 질문에서 6개 가져오기", "lp-faq-import", "a-btn-ghost a-btn-sm");
      case "cta": return lpField("cta.title", "제목") + lpField("cta.sub", "설명") + '<div class="a-form-row">' + lpField("cta.label", "버튼 글자") + lpField("cta.url", "버튼 연결 주소", "url", "비워 두면 ‘수강 신청’ 창") + "</div>";
    }
    return "";
  }
  function lpSecCards(L, defs, bodyFn, hints) {
    return L.order.map((k, i) => {
      const def = defs.find((x) => x.key === k);
      const on = !L.off[k];
      return '<details class="a-card a-lp-sec' + (on ? "" : " off") + '" data-k="' + k + '"' + (ui.lpOpen[k] ? " open" : "") + "><summary>" +
        '<span class="a-lp-move"><button type="button" class="a-icon-btn sm" data-action="lp-move" data-k="' + k + '" data-dir="-1" aria-label="위로"' + (i === 0 ? " disabled" : "") + ">" + icon("arrowUp", "sm") + '</button><button type="button" class="a-icon-btn sm" data-action="lp-move" data-k="' + k + '" data-dir="1" aria-label="아래로"' + (i === L.order.length - 1 ? " disabled" : "") + ">" + icon("arrowDown", "sm") + "</button></span>" +
        "<b>" + esc(def.label) + "</b>" + (on ? pill("보임", "ok") : pill("숨김", "mute")) +
        '<button type="button" class="a-switch' + (on ? " on" : "") + '" data-action="lp-toggle" data-k="' + k + '" role="switch" aria-checked="' + on + '" aria-label="' + esc(def.label) + ' 보이기"><i></i></button>' + icon("chevDown", "sm a-lp-chev") + "</summary>" +
        '<div class="a-lp-body">' + (hints[k] ? '<p class="a-hint" style="margin:0">' + icon("alert", "xs") + " " + esc(hints[k]) + "</p>" : "") + bodyFn(k) + "</div></details>";
    }).join("");
  }
  const FREE_HINT = {
    countdown: "강의 날짜·시간까지 남은 시간이 1초 단위로 줄어들어요. 시간이 지나면 ‘LIVE’로 바뀌어요.",
    videos: "유튜브 주소를 넣은 영상만 보여요. 3개를 넣으면 doogo.site처럼 좌·가운데·우로 넘겨 볼 수 있어요. 강의가 시작되면 자동으로 숨겨져요.",
    question: "‘질문 받는 주소’에 구글폼 같은 링크를 넣으면 버튼이 그 주소로 바로 열려요. 비워 두면 이 페이지에서 질문을 받아 아래 ‘받은 사전 질문’에 모아요.",
    gifts: "선물마다 공개 날짜·시간을 정하면 그때 자동으로 잠금이 풀리고 표지를 누르면 전자책 주소가 열려요. ‘지금 공개’를 켜면 날짜와 상관없이 바로 열려요.",
    kakao: "강사님 오픈채팅방 주소를 넣으면 노란 ‘입장하기’ 버튼이 생겨요. 주소가 없으면 이 칸은 보이지 않아요.",
    about: "비워 두면 ‘강의 소개 페이지’의 강사 소개를 가져와요.",
    live: "썸네일·플랫폼 로고·문구·신청 링크를 언제든 바꿀 수 있어요. 썸네일이 없으면 날짜와 제목으로 자동으로 만들어요. 썸네일은 가로 16:9 (예: 1920×1067)가 가장 잘 맞아요.",
    faq: "무료강의를 신청하려는 분들이 궁금해할 질문을 적어요. 질문이 하나도 없으면 이 칸은 보이지 않아요.",
    apply: "신청 링크를 비워 두면 ‘진행 예정 강의’의 신청 링크로 연결돼요."
  };
  function freeSectionBody(k) {
    switch (k) {
      case "countdown": return lpField("liveAt", "강의 날짜 · 시간", "datetime");
      case "videos": return '<div class="a-form-row">' + lpField("videos.kicker", "작은 영문 제목") + lpField("videos.title", "제목") + "</div>" + lpField("videos.desc", "설명") +
        lpRows("videos.items", [["title", "영상 제목"], ["channel", "채널명"], ["youtube", "유튜브 주소"]], "영상 추가");
      case "question": return lpField("question.badge", "작은 배지") + lpField("question.title", "제목") + lpField("question.desc", "설명", "textarea") + '<div class="a-form-row">' + lpField("question.label", "버튼 글자") + lpField("question.url", "질문 받는 주소 (구글폼 등)", "url", "비우면 이 페이지에서 질문을 받아요") + "</div>" + lpField("question.note", "버튼 아래 안내");
      case "gifts": return '<div class="a-form-row">' + lpField("gifts.kicker", "작은 영문 제목") + lpField("gifts.title", "제목") + "</div>" + lpField("gifts.desc", "설명 (두 번째 줄)") +
        lpRows("gifts.items", [["title", "전자책 제목"], ["openAt", "공개 날짜 · 시간", "datetime"], ["color", "표지 색", "select", [["blue", "파랑"], ["cyan", "청록"], ["ice", "골드"]]], ["forceOpen", "지금 공개", "check"], ["url", "전자책 주소 (https://)"], ["desc", "소개", "textarea"]], "선물 추가");
      case "kakao": return lpField("kakao.url", "카카오톡 오픈채팅 주소", "url", "강사님마다 자기 오픈채팅방 주소를 넣어요") + lpField("kakao.badge", "작은 배지") + lpField("kakao.title", "제목") + lpField("kakao.desc", "설명", "textarea") + '<div class="a-form-row">' + lpField("kakao.label", "버튼 글자") + lpField("kakao.note", "버튼 아래 안내") + "</div>";
      case "about": return '<div class="a-form-row">' + lpField("about.name", "이름") + lpField("about.role", "한 줄 소개") + "</div>" + lpField("about.body", "소개 글", "textarea") + lpField("about.career", "경력 · 이력 (한 줄에 하나)", "lines") + lpField("about.photo", "강사 사진", "image") + lpField("about.title", "작은 제목");
      case "live": return lpField("live.image", "썸네일 (가로 16:9)", "image") + '<div class="a-form-row">' + lpField("live.tag", "썸네일 위 배지") + lpField("live.platform", "강의 플랫폼 이름 (예: 아이비클래스)") + "</div>" + lpField("live.platformLogo", "플랫폼 로고", "image") +
        lpField("live.liveTitle", "강의 제목 (줄바꿈 가능, 비우면 맨 위 헤드라인)", "textarea") + lpField("live.summary", "강의 소개", "textarea") + lpField("live.points", "이런 걸 배워요 (한 줄에 하나)", "lines") +
        '<div class="a-form-row">' + lpField("live.label", "신청 버튼 글자") + lpField("live.url", "무료강의 신청 주소", "url") + "</div>" + lpField("live.note", "버튼 아래 안내") +
        '<div class="a-form-row">' + lpField("live.kicker", "작은 영문 제목") + lpField("live.title", "칸 제목") + "</div>" + lpField("live.desc", "칸 설명");
      case "faq": return '<div class="a-form-row">' + lpField("faq.kicker", "작은 영문 제목") + lpField("faq.title", "제목") + "</div>" + lpRows("faq.items", [["q", "질문"], ["a", "답변", "textarea"]], "질문 추가") + btn(icon("clipboard", "sm") + "Q&A 자주 묻는 질문에서 6개 가져오기", "lp-faq-import", "a-btn-ghost a-btn-sm");
      case "apply": return lpField("apply.badge", "작은 배지") + lpField("apply.title", "제목") + lpField("apply.desc", "설명", "textarea") + '<div class="a-form-row">' + lpField("apply.price", "가격 (선택, 예: 무료)") + lpField("apply.original", "원래 가격 (취소선, 선택)") + "</div>" +
        lpField("apply.includes", "신청하면 받는 것 (한 줄에 하나)", "lines") + '<div class="a-form-row">' + lpField("apply.label", "버튼 글자") + lpField("apply.url", "신청 주소", "url", "비우면 ‘진행 예정 강의’의 신청 주소") + "</div>" + lpField("apply.note", "버튼 아래 안내");
    }
    return "";
  }
  // 공개 스위치 (공개 중 / 비공개)
  const pubSwitch = (on) => '<div class="a-pub"><button type="button" class="a-switch a-switch-lg' + (on ? " on" : "") + '" data-action="lp-pub" role="switch" aria-checked="' + on + '" aria-label="페이지 공개"><i></i></button>' +
    '<div><b class="' + (on ? "on" : "") + '">' + (on ? "공개 중" : "비공개") + "</b><small>" + (on ? "누구나 주소로 볼 수 있어요" : "강사님과 마스터만 볼 수 있어요") + "</small></div></div>";
  // doogo.site 관리자처럼 칸별 탭 하나씩: 꼭 필요한 것만 보이고, 문구는 ‘문구 바꾸기’ 안에 접어 둔다
  const FREE_TABS = [
    { id: "schedule", label: "강의 일정", desc: "날짜와 카운트다운", icon: "calendar", sec: "countdown" },
    { id: "hero", label: "맨 위 제목", desc: "헤드라인 · 강사 이름", icon: "pen" },
    { id: "videos", label: "YouTube 영상", desc: "좌 · 가운데 · 우 영상", icon: "circlePlay", sec: "videos" },
    { id: "question", label: "질문 버튼", desc: "질문 남기기 링크", icon: "message", sec: "question" },
    { id: "gifts", label: "전자책", desc: "선물과 공개일", icon: "book", sec: "gifts" },
    { id: "kakao", label: "카카오톡", desc: "오픈채팅 링크", icon: "message", sec: "kakao" },
    { id: "live", label: "진행 예정 강의", desc: "썸네일과 신청 정보", icon: "video", sec: "live" },
    { id: "faq", label: "자주 묻는 질문", desc: "질문과 답", icon: "help", sec: "faq" },
    { id: "inbox", label: "받은 질문", desc: "페이지에서 남긴 질문", icon: "inbox" }
  ];
  const more = (inner) => '<details class="a-more"><summary>' + icon("pen", "xs") + "문구 바꾸기 (선택)</summary><div class=\"a-more-body\">" + inner + "</div></details>";
  function lpCards(path, fields, addLabel, opts) {
    opts = opts || {};
    const list = lpGet(ui.lp, path) || [];
    return '<div class="a-fc-cards">' + list.map((row, i) => '<div class="a-fc-card"><div class="a-fc-card-head"><b>' + esc(opts.title ? opts.title(i) : (i + 1) + "번") + "</b>" +
        '<button type="button" class="a-icon-btn sm" data-action="lp-row-del" data-path="' + path + '" data-i="' + i + '" aria-label="삭제">' + icon("trash", "sm") + "</button></div>" +
        fields.map((f) => {
          const p = path + "." + i + "." + f[0], v = row[f[0]];
          if (f[2] === "check") return '<label class="a-check"><input type="checkbox" data-lp-check="' + p + '"' + (v ? " checked" : "") + "><span>" + esc(f[1]) + "</span></label>";
          if (f[2] === "select") return '<div class="a-field"><label>' + esc(f[1]) + '</label><div class="a-seg-pick">' + f[3].map((o) => '<label><input type="radio" name="' + esc(p) + '" data-lp-radio="' + p + '" value="' + o[0] + '"' + ((v || f[3][0][0]) === o[0] ? " checked" : "") + '><span class="a-swatch-dot a-sw-' + o[0] + '"></span>' + esc(o[1]) + "</label>").join("") + "</div></div>";
          const input = f[2] === "textarea" ? '<textarea class="a-input" data-lp="' + p + '" rows="2">' + esc(v || "") + "</textarea>" : '<input class="a-input" data-lp="' + p + '" value="' + esc(v || "") + '"' + (f[2] === "datetime" ? ' type="datetime-local"' : f[2] === "url" ? ' type="url" placeholder="https://"' : "") + ">";
          return '<div class="a-field"><label>' + esc(f[1]) + "</label>" + input + (f[3] ? '<small class="a-muted">' + esc(f[3]) + "</small>" : "") + "</div>";
        }).join("") + "</div>").join("") +
      (!opts.max || list.length < opts.max ? btn(icon("plus", "sm") + addLabel, "lp-row-add", "a-btn-ghost a-btn-sm", ' data-path="' + path + '" data-cols="' + fields.map((f) => f[0]).join(",") + '"') : "") + "</div>";
  }
  function freeTabBody(id) {
    const c = C();
    switch (id) {
      case "schedule": return lpField("liveAt", "강의 날짜 · 시간", "datetime", "이 시간까지 남은 시간이 카운트다운으로 보이고, 지나면 ‘LIVE’로 바뀌어요.");
      case "hero": return lpField("hero.title", "헤드라인 (두 줄, 아래 줄이 강조돼요)", "textarea") + lpField("hero.instructor", "강사 이름") + lpField("hero.sub", "설명", "textarea") + more(lpField("hero.badge", "맨 위 작은 배지") + lpField("hero.note", "작은 안내 문구") + lpField("company", "맨 아래 상호 (© 표시)"));
      case "videos": return lpCards("videos.items", [["youtube", "유튜브 주소", "url"], ["title", "영상 제목"], ["channel", "채널명"]], "영상 추가", { max: 3, title: (i) => ["왼쪽 영상", "가운데 영상", "오른쪽 영상"][i] || (i + 1) + "번 영상" }) +
        more(lpField("videos.title", "칸 제목") + lpField("videos.desc", "칸 설명") + lpField("videos.kicker", "작은 영문 제목"));
      case "question": return lpField("question.url", "‘내 질문 남기러 가기’ 버튼 링크", "url", "구글폼 등. 비워 두면 이 페이지에서 질문을 받아 ‘받은 질문’에 모아요.") + more(lpField("question.title", "제목") + lpField("question.desc", "설명", "textarea") + lpField("question.label", "버튼 글자") + lpField("question.badge", "작은 배지") + lpField("question.note", "버튼 아래 안내"));
      case "gifts": return lpCards("gifts.items", [["title", "전자책 제목"], ["openAt", "공개 날짜 · 시간", "datetime", "이 시간이 되면 자동으로 열려요"], ["url", "전자책 링크", "url"], ["desc", "소개", "textarea"], ["color", "표지", "select", [["blue", "진한 색"], ["cyan", "강사 색"], ["ice", "연한 색"]]], ["forceOpen", "날짜와 상관없이 지금 공개", "check"]], "선물 추가", { max: 6, title: (i) => (i + 1) + "번 선물" }) +
        more(lpField("gifts.title", "칸 제목") + lpField("gifts.desc", "칸 설명") + lpField("gifts.kicker", "작은 영문 제목"));
      case "kakao": return lpField("kakao.url", "카카오톡 오픈채팅 링크", "url", "노란 ‘오픈채팅방 입장하기’ 버튼을 누르면 이 주소로 가요. 비우면 칸이 숨겨져요.") + more(lpField("kakao.title", "제목") + lpField("kakao.desc", "설명", "textarea") + lpField("kakao.label", "버튼 글자") + lpField("kakao.badge", "작은 배지") + lpField("kakao.note", "버튼 아래 안내"));
      case "about": return lpField("about.photo", "강사 사진", "image") + '<div class="a-form-row">' + lpField("about.name", "이름") + lpField("about.role", "한 줄 소개") + "</div>" + lpField("about.body", "소개 글", "textarea") + lpField("about.career", "경력 (한 줄에 하나)", "lines");
      case "live": return lpField("live.image", "썸네일 (가로 16:9, 예: 1920×1080)", "image") + lpField("live.url", "무료강의 신청 링크", "url") +
        lpField("live.liveTitle", "강의 제목 (두 줄 가능)", "textarea") + lpField("live.summary", "강의 소개", "textarea") + lpField("live.points", "이런 걸 배워요 (한 줄에 하나)", "lines") +
        more('<div class="a-form-row">' + lpField("live.platform", "강의 플랫폼 이름") + lpField("live.tag", "썸네일 위 배지") + "</div>" + lpField("live.platformLogo", "플랫폼 로고", "image") + lpField("live.label", "신청 버튼 글자") + lpField("live.note", "버튼 아래 안내") + lpField("live.title", "칸 제목") + lpField("live.desc", "칸 설명"));
      case "faq": return lpCards("faq.items", [["q", "질문"], ["a", "답변", "textarea"]], "질문 추가", { title: (i) => "Q" + (i + 1) }) + btn(icon("clipboard", "sm") + "Q&A 자주 묻는 질문에서 가져오기", "lp-faq-import", "a-btn-ghost a-btn-sm") + more(lpField("faq.title", "칸 제목"));
      case "apply": return lpField("apply.url", "신청 링크", "url", "비우면 ‘진행 예정 강의’의 신청 링크로 연결돼요.") + lpField("apply.title", "제목") + lpField("apply.includes", "신청하면 받는 것 (한 줄에 하나)", "lines") +
        more(lpField("apply.desc", "설명", "textarea") + lpField("apply.label", "버튼 글자") + '<div class="a-form-row">' + lpField("apply.price", "가격 (선택)") + lpField("apply.original", "원래 가격 (선택)") + "</div>" + lpField("apply.badge", "작은 배지") + lpField("apply.note", "버튼 아래 안내"));
      case "inbox": { const qs = (c.freeQuestions || []).slice().reverse();
        return qs.length ? '<ul class="a-items">' + qs.map((q) => '<li><div class="a-item-main"><b>' + esc(q.text) + "</b><small>" + esc(q.name || "이름 없음") + " · " + fmtStamp(q.at) + "</small></div>" + btn(icon("trash", "sm"), "fq-del", "a-btn-ghost a-btn-sm", ' data-id="' + q.id + '" aria-label="삭제"') + "</li>").join("") + "</ul>" : emptyBox("message", "아직 받은 질문이 없어요. ‘질문 버튼’ 링크를 비워 두면 이 페이지에서 질문을 받아요."); }
    }
    return "";
  }
  function pageFree() {
    ui.lpKind = "free";
    const F = lpDraft(), iid = IID(), c = C();
    const url = location.href.split("#")[0] + "#/free/" + iid;
    if (!FREE_TABS.some((x) => x.id === ui.fcTab)) ui.fcTab = "schedule";
    const tab = FREE_TABS.find((x) => x.id === ui.fcTab);
    const nq = (c.freeQuestions || []).length;
    return head("무료강의 페이지", "doogo.site와 같은 화면이에요. 왼쪽에서 바꿀 칸을 고르고, 다 고치면 ‘저장’을 눌러 주세요.",
        '<a class="a-btn a-btn-outline" href="#/free/' + iid + '">' + icon("eye", "sm") + "페이지 보기</a>" + btn(icon("check", "sm") + "저장", "lp-save", "a-btn-primary")) +
      '<section class="a-card a-lp-top a-fc-top">' + pubSwitch(F.published) +
        '<div class="a-lp-url"><input class="a-input a-sm a-mono" id="lp-url" value="' + esc(url) + '" readonly aria-label="페이지 주소">' + btn(icon("clipboard", "sm") + "주소 복사", "lp-copy", "a-btn-ghost a-btn-sm") + "</div>" +
        (ui.lpDirty ? '<p class="a-lp-dirty">' + icon("alert", "xs") + " 저장하지 않은 변경이 있어요.</p>" : "") + "</section>" +
      '<div class="a-fc-layout"><nav class="a-fc-tabs" aria-label="바꿀 칸">' + FREE_TABS.map((x) => {
          const off = x.sec && F.off[x.sec];
          return '<button type="button" class="a-fc-tab' + (x.id === tab.id ? " on" : "") + (off ? " off" : "") + '" data-action="fc-tab" data-k="' + x.id + '"><span class="a-fc-ic">' + icon(x.icon, "sm") + "</span><span><b>" + esc(x.label) + (x.id === "inbox" && nq ? ' <em class="a-count">' + nq + "</em>" : "") + "</b><small>" + esc(off ? "숨김" : x.desc) + "</small></span></button>";
        }).join("") + "</nav>" +
        '<section class="a-card a-fc-panel" style="--swp:' + DB.themeOf(c.brand.theme).primary + ";--swpale:" + DB.themeOf(c.brand.theme).pale + '"><div class="a-fc-panel-head"><div><span class="a-fc-eyebrow">' + esc(tab.desc) + "</span><h2>" + esc(tab.label) + "</h2></div>" +
          (tab.sec ? '<label class="a-fc-show">' + (F.off[tab.sec] ? "숨김" : "보임") + '<button type="button" class="a-switch' + (F.off[tab.sec] ? "" : " on") + '" data-action="lp-toggle" data-k="' + tab.sec + '" role="switch" aria-checked="' + !F.off[tab.sec] + '" aria-label="이 칸 페이지에 보이기"><i></i></button></label>' : "") + "</div>" +
          '<div class="a-fc-body">' + freeTabBody(tab.id) + "</div></section></div>" +
      '<div class="a-lp-savebar">' + (ui.lpDirty ? '<span class="a-muted">저장하지 않은 변경이 있어요</span>' : '<span class="a-muted">저장된 상태예요</span>') + btn("변경 취소", "lp-revert", "a-btn-ghost a-btn-sm") + btn(icon("check", "sm") + "저장", "lp-save", "a-btn-primary") + "</div>";
  }
  function pageLanding() {
    ui.lpKind = "landing";
    const L = lpDraft(), iid = IID();
    const url = location.href.split("#")[0] + "#/p/" + iid;
    const secs = lpSecCards(L, DB.LANDING_SECTIONS, lpSectionBody, LP_HINT);
    return head("강의 소개 페이지", "강사님과 강의를 소개하는 공개 페이지예요. 결제 전 수강생이 보고, 신청 버튼을 누르면 수강 신청이나 결제 페이지로 이어져요. 배경은 흰색, 버튼과 강조는 수강생 화면 색상을 따라가요.",
        '<a class="a-btn a-btn-outline" href="#/p/' + iid + '">' + icon("eye", "sm") + "페이지 보기</a>" + btn(icon("check", "sm") + "저장", "lp-save", "a-btn-primary")) +
      '<section class="a-card a-lp-top">' + pubSwitch(L.published) +
        '<div class="a-lp-url"><input class="a-input a-sm a-mono" id="lp-url" value="' + esc(url) + '" readonly aria-label="페이지 주소">' + btn(icon("clipboard", "sm") + "주소 복사", "lp-copy", "a-btn-ghost a-btn-sm") + "</div>" +
        (ui.lpDirty ? '<p class="a-lp-dirty">' + icon("alert", "xs") + " 저장하지 않은 변경이 있어요.</p>" : "") + "</section>" +
      '<div class="a-stack">' + secs + "</div>" +
      '<section class="a-card"><div class="a-card-head"><h2>연락처 · 페이지 맨 아래</h2></div><div class="a-form-row">' + lpField("contact.kakao", "카카오톡 문의 주소", "url") + lpField("contact.instagram", "인스타그램 주소", "url") + "</div>" +
        '<div class="a-form-row">' + lpField("contact.youtube", "유튜브 주소", "url") + lpField("contact.company", "상호 (맨 아래 © 표시)") + "</div>" +
        '<div class="a-form-row">' + lpField("contact.email", "이메일") + lpField("contact.phone", "전화번호") + "</div></section>" +
      '<div class="a-lp-savebar">' + (ui.lpDirty ? '<span class="a-muted">저장하지 않은 변경이 있어요</span>' : '<span class="a-muted">저장된 상태예요</span>') + btn("변경 취소", "lp-revert", "a-btn-ghost a-btn-sm") + btn(icon("check", "sm") + "저장", "lp-save", "a-btn-primary") + "</div>";
  }
  function lpCompress(file, cb) {
    const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = () => { const sc = Math.min(1, 1400 / Math.max(img.width, img.height)); const cv = document.createElement("canvas"); cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc); cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height); cb(cv.toDataURL("image/jpeg", 0.8)); }; img.onerror = () => toast("사진을 읽지 못했어요.", "warn"); img.src = r.result; };
    r.readAsDataURL(file);
  }
  const lpChanged = () => { if (!ui.lpDirty) { ui.lpDirty = true; const bar = document.querySelector(".a-lp-savebar .a-muted"); if (bar) bar.textContent = "저장하지 않은 변경이 있어요"; } };

  /* ---------------- 수강생 화면 색상 고르기 ---------------- */
  function themePicker(current, name) {
    name = name || "theme";
    return '<div class="a-swatches" role="radiogroup" aria-label="수강생 화면 색상">' + Object.keys(DB.THEMES).map((k) => {
      const t = DB.THEMES[k];
      return '<label class="a-swatch"><input type="radio" name="' + name + '" value="' + k + '"' + (k === (current || "lime") ? " checked" : "") + '><span class="sw" style="--sw:' + t.primary + ";--swd:" + (t.onPrimary || t.deep) + ";--swbg:" + (t.swRing || t.bg[1]) + '"><i></i></span><b>' + t.label + "</b></label>";
    }).join("") + "</div>" + '<div id="theme-preview-' + name + '">' + themePreview(current) + "</div>";
  }
  function themePreview(k) {
    const t = DB.themeOf(k);
    return '<div class="a-theme-preview" style="--p:' + t.primary + ";--pa:" + t.active + ";--pd:" + t.deep + ";--po:" + (t.onPrimary || t.deep) + ";--ac:" + (t.accent || t.primary) + ";--aa:" + (t.accentActive || t.active) + ";--pp:" + t.pale + ";--bg1:" + t.bg[0] + ";--bg2:" + t.bg[1] + '">' +
      '<div class="tp-login"><span class="tp-eyebrow">로그인 화면</span><b>내 브랜드<br><em>만들기</em></b><span class="tp-tile">' + icon("play", "sm") + "</span></div>" +
      '<div class="tp-app"><span class="tp-nav on">' + icon("home", "xs") + '홈</span><span class="tp-nav">' + icon("book", "xs") + '커리큘럼</span><span class="tp-bar"><i></i></span><span class="tp-btn">제출하고 검수받기</span></div></div>';
  }

  /* ---------------- 마스터: 메뉴 · 색상 설정 ---------------- */
  function pageMasterMenus(r, own) {
    const list = DB.data.instructors;
    if (r.params.get("ins")) ui.mMenuIns = r.params.get("ins");
    if (!ui.mMenuIns || !DB.instructor(ui.mMenuIns)) ui.mMenuIns = list[0] && list[0].id;
    const ins = DB.instructor(ui.mMenuIns);
    if (!ins) return head("메뉴 · 색상 설정", "") + '<section class="a-card">' + emptyBox("store", "강사 플랫폼을 먼저 만들어 주세요.") + "</section>";
    const m = DB.menuConfig(ins.id), c = DB.content(ins.id);
    const def = (key) => DB.STUDENT_MENUS.find((d) => d.key === key);
    const nameOf = (x) => x.label || (def(x.key) ? (x.key === "bot" ? c.brand.botName : def(x.key).label) : "추가 메뉴");
    const iconOf = (x) => (def(x.key) ? def(x.key).icon : x.icon || "file");
    const onItems = m.items.filter((x) => x.on), offItems = m.items.filter((x) => !x.on);
    const row = (x, i) => {
      const d = def(x.key), custom = DB.isCustom(x.key);
      return '<li class="a-menu-row"><span class="a-menu-move"><button class="a-icon-btn sm" data-action="menu-move" data-key="' + x.key + '" data-dir="-1" aria-label="위로"' + (i === 0 ? " disabled" : "") + ">" + icon("arrowUp", "sm") + '</button><button class="a-icon-btn sm" data-action="menu-move" data-key="' + x.key + '" data-dir="1" aria-label="아래로"' + (i === onItems.length - 1 ? " disabled" : "") + ">" + icon("arrowDown", "sm") + "</button></span>" +
        '<span class="a-menu-ico">' + icon(iconOf(x), "sm") + "</span>" +
        '<div class="a-menu-main"><input class="a-input a-sm a-menu-label" data-key="' + x.key + '" value="' + esc(x.label || "") + '" placeholder="' + esc(nameOf(Object.assign({}, x, { label: "" }))) + '" aria-label="메뉴 이름">' +
          "<small>" + (custom ? (x.type === "link" ? "외부 링크 · " + esc(x.url || "") : "추가 메뉴 · 강사가 내용 작성") : "기본 메뉴" + (x.key === "home" ? " · 항상 보여요" : "")) + "</small>" +
          (x.key === "library" ? '<div class="a-lib-chips">' + DB.LIB_MENUS.map((l) => '<button type="button" class="a-chip-toggle' + (m.library[l.key] !== false ? " on" : "") + '" data-action="lib-toggle" data-k="' + l.key + '">' + icon(m.library[l.key] !== false ? "check" : "plus", "xs") + esc(l.label) + "</button>").join("") + "</div>" : "") +
        "</div>" +
        (custom ? '<button class="a-icon-btn sm" data-action="menu-edit" data-key="' + x.key + '" aria-label="수정">' + icon("pen", "sm") + "</button>" : "") +
        (x.key === "home" ? '<span class="a-pm locked" title="홈은 뺄 수 없어요">' + icon("lock", "sm") + "</span>" : '<button class="a-pm minus" data-action="menu-off" data-key="' + x.key + '" aria-label="' + esc(nameOf(x)) + ' 빼기">' + icon("minus", "sm") + "</button>") + "</li>";
    };
    return (own
      ? head("메뉴 구성", "수강생 화면 왼쪽 메뉴를 더하고(＋) 빼고(−), 이름과 순서를 바꿔요. 필요한 페이지나 링크 메뉴도 새로 만들 수 있어요. 바꾸면 바로 저장돼요.", btn(icon("eye", "sm") + "수강생 화면 보기", "preview", "a-btn-outline"))
      : head("메뉴 · 색상 설정", "강사와 협의한 대로 수강생 화면의 메뉴를 더하고(＋) 빼고(−), 이름과 순서, 화면 색상을 정해요. 바꾸면 바로 저장돼요.") +
      '<section class="a-card a-menu-top"><label class="a-label" for="m-menu-ins">강사 플랫폼</label><select class="a-input" id="m-menu-ins">' + list.map((x) => '<option value="' + x.id + '"' + (x.id === ins.id ? " selected" : "") + ">" + esc(x.displayName) + " · " + esc(x.name) + "</option>").join("") + "</select>" +
        btn(icon("eye", "sm") + "수강생 화면 보기", "m-preview", "a-btn-outline a-btn-sm", ' data-id="' + ins.id + '"') + "</section>") +
      '<div class="a-menu-grid">' +
        '<div class="a-stack">' +
          '<section class="a-card"><div class="a-card-head"><h2>수강생에게 보이는 메뉴</h2><span class="a-muted">' + onItems.length + "개</span></div>" +
            '<ul class="a-menu-list">' + onItems.map(row).join("") + "</ul></section>" +
          '<section class="a-card"><div class="a-card-head"><h2>더할 수 있는 메뉴</h2><span class="a-muted">' + offItems.length + "개</span></div>" +
            (offItems.length ? '<ul class="a-menu-list off">' + offItems.map((x) => '<li class="a-menu-row"><span class="a-menu-ico">' + icon(iconOf(x), "sm") + '</span><div class="a-menu-main"><b>' + esc(nameOf(x)) + "</b><small>" + (DB.isCustom(x.key) ? "추가 메뉴" : "기본 메뉴") + "</small></div>" +
              (DB.isCustom(x.key) ? '<button class="a-icon-btn sm" data-action="menu-delete" data-key="' + x.key + '" aria-label="삭제">' + icon("trash", "sm") + "</button>" : "") +
              '<button class="a-pm plus" data-action="menu-on" data-key="' + x.key + '" aria-label="' + esc(nameOf(x)) + ' 더하기">' + icon("plus", "sm") + "</button></li>").join("") + "</ul>" : '<p class="a-muted a-pad">모든 기본 메뉴가 켜져 있어요.</p>') +
            '<div class="a-card-foot">' + btn(icon("plus", "sm") + "새 메뉴 만들기 (페이지)", "menu-new", "a-btn-primary a-btn-sm", ' data-type="page"') + btn(icon("link", "sm") + "외부 링크 메뉴", "menu-new", "a-btn-ghost a-btn-sm", ' data-type="link"') + "</div>" +
          "</section>" +
        "</div>" +
        '<div class="a-stack">' +
          '<section class="a-card"><div class="a-card-head"><h2>수강생 화면 색상</h2></div><form id="m-theme-form">' + themePicker(c.brand.theme, "mtheme") + "</form></section>" +
          (own ? '<p class="a-hint">' + icon("star", "xs") + " 새로 만든 페이지 메뉴의 내용은 ‘추가 메뉴’에서 채워요.</p>" : "") +
          '<section class="a-card"><div class="a-card-head"><h2>메뉴 미리보기</h2></div>' + sidebarPreview(ins.id) + "</section>" +
          '<p class="a-hint">' + icon("alert", "xs") + " 메뉴를 빼도 강사가 올린 내용은 지워지지 않아요. 다시 더하면 그대로 돌아와요.</p>" +
        "</div>" +
      "</div>";
  }
  function sidebarPreview(iid) {
    const m = DB.menuConfig(iid), c = DB.content(iid), t = DB.themeOf(c.brand.theme);
    const def = (key) => DB.STUDENT_MENUS.find((d) => d.key === key);
    return '<ul class="a-sidebar-preview" style="--p:' + t.pale + ";--pd:" + t.deep + '">' + m.items.filter((x) => x.on).map((x, i) => {
      const d = def(x.key);
      const name = x.label || (d ? (x.key === "bot" ? c.brand.botName : d.label) : "추가 메뉴");
      return "<li" + (i === 0 ? ' class="on"' : "") + ">" + icon(d ? d.icon : x.icon || "file", "sm") + "<span>" + esc(name) + "</span>" + (x.type === "link" ? icon("arrowUpRight", "xs") : "") + "</li>";
    }).join("") + "</ul>";
  }
  function menuItemForm(key, type) {
    const m = DB.menuConfig(ui.mMenuIns);
    const it = key ? m.items.find((x) => x.key === key) : { type: type || "page", icon: type === "link" ? "link" : "file", label: "" };
    const isLink = it.type === "link";
    openModal(key ? "메뉴 수정" : isLink ? "외부 링크 메뉴 만들기" : "새 메뉴 만들기",
      '<form id="menu-item-form" class="a-form" data-key="' + (key || "") + '" data-type="' + it.type + '" novalidate>' +
        (isLink ? "" : '<p class="a-muted" style="margin:0">강사센터 ‘추가 메뉴’에서 강사가 제목·본문·영상·첨부 자료를 채우는 자유 페이지예요. 예: 오프라인 모임 안내, 협력사 혜택, 추천 도구 모음</p>') +
        '<div class="a-field"><label for="mi-label">메뉴 이름</label><input class="a-input" id="mi-label" name="label" value="' + esc(it.label || "") + '" placeholder="' + (isLink ? "예: 오픈채팅방" : "예: 오프라인 모임") + '"></div>' +
        (isLink ? '<div class="a-field"><label for="mi-url">연결할 주소</label><input class="a-input" id="mi-url" name="url" type="url" value="' + esc(it.url || "") + '" placeholder="https://open.kakao.com/…"></div>' : "") +
        '<div class="a-field"><span class="a-label">아이콘</span><div class="a-icon-pick">' + DB.CUSTOM_ICONS.map((ic) => '<label><input type="radio" name="icon" value="' + ic + '"' + (ic === (it.icon || "file") ? " checked" : "") + "><span>" + icon(ic, "sm") + "</span></label>").join("") + "</div></div>" +
        '<p class="a-error" id="mi-error"></p></form>',
      btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="menu-item-form">' + (key ? "저장" : "만들기") + "</button>", "md");
  }
  function saveMenuItem(f) {
    const m = DB.menuConfig(ui.mMenuIns);
    const label = f.label.value.trim(), err = document.getElementById("mi-error");
    if (!label) { err.textContent = "메뉴 이름을 입력해 주세요."; return; }
    const url = f.url ? f.url.value.trim() : "";
    if (f.dataset.type === "link" && !/^https?:\/\//i.test(url)) { err.textContent = "http:// 또는 https:// 로 시작하는 주소를 넣어 주세요."; return; }
    const ic = (f.querySelector("input[name=icon]:checked") || {}).value || "file";
    if (f.dataset.key) Object.assign(m.items.find((x) => x.key === f.dataset.key), { label, url, icon: ic });
    else m.items.push({ key: DB.uid("cp_"), type: f.dataset.type, label, url, icon: ic, on: true });
    commit(f.dataset.key ? "메뉴를 저장했어요." : "‘" + label + "’ 메뉴를 더했어요.");
  }

  /* ---------------- 마스터: 플랫폼 현황 ---------------- */
  function pageMasterHealth() {
    const rows = DB.data.instructors.map((ins) => {
      const co = DB.currentCohort(ins.id);
      const st = co ? studentProgressRows(ins.id, (s) => s.cohortId === co.id && s.status === "approved") : [];
      const avg = st.length ? Math.round(st.reduce((a, r) => a + r.st.pct, 0) / st.length) : 0;
      const done = st.filter((r) => r.st.reqTotal && r.st.reqDone === r.st.reqTotal).length;
      const subs = allSubmissions(ins.id, "all");
      const pend = subs.filter((x) => x.review === "pending").length;
      const reqs = DB.requests(ins.id).filter((x) => !x.q.answer).length;
      const waiting = DB.studentsOf(ins.id).filter((s) => s.status === "pending").length;
      const last = subs[0] ? subs[0].sub.at : 0;
      const flags = [];
      if (reqs) flags.push(pill("오류 신고 " + reqs, "bad"));
      if (pend >= 10) flags.push(pill("검수 밀림 " + pend, "warn"));
      if (waiting) flags.push(pill("승인 대기 " + waiting, "warn"));
      if (!co) flags.push(pill("기수 없음", "mute"));
      return { ins, co, st, avg, done, pend, reqs, last, flags };
    });
    const totalReq = rows.reduce((a, r) => a + r.reqs, 0);
    return head("플랫폼 현황", "강사별로 수강생 진행률, 검수 밀림, 답변 안 된 오류 신고를 한눈에 보고 도움이 필요한 강사를 먼저 챙겨요.") +
      '<div class="a-kpis">' +
        kpi("운영 중 플랫폼", rows.filter((r) => r.ins.status === "active").length + "개", "전체 " + rows.length + "개", "#/center/master/instructors") +
        kpi("진행 중 수강생", rows.reduce((a, r) => a + r.st.length, 0) + "명", "현재 기수 기준", "#/center/master/students") +
        kpi("수료 조건 달성", rows.reduce((a, r) => a + r.done, 0) + "명", "필수 과제 모두 통과", "#/center/master/health") +
        kpi("답변 안 된 오류 신고", totalReq + "건", "모든 플랫폼 합계", "#/center/master/reports", totalReq ? "warn" : "") +
      "</div>" +
      '<section class="a-card"><div class="a-card-head"><h2>강사별 현황</h2></div><div class="a-table-wrap"><table class="a-table"><thead><tr><th>강사</th><th>현재 기수</th><th>수강생</th><th>평균 진행률</th><th>수료 가능</th><th>검수 대기</th><th>최근 제출</th><th>살펴볼 점</th><th class="right"></th></tr></thead><tbody>' +
        rows.map((r) => "<tr><td><b>" + esc(r.ins.displayName) + '</b><small class="a-memo">' + esc(r.ins.name) + "</small></td><td>" + (r.co ? esc(r.co.name) + ' <small class="a-memo">' + DB.STATUS_LABEL[DB.cohortStatus(r.co)] + "</small>" : "-") + '</td><td class="num">' + r.st.length + "명</td>" +
          '<td><div class="a-bar"><span style="width:' + r.avg + '%"></span></div><small class="num">' + r.avg + '%</small></td><td class="num">' + r.done + '명</td><td class="num">' + r.pend + '건</td><td class="num">' + (r.last ? fmtStamp(r.last) : "-") + "</td>" +
          "<td>" + (r.flags.length ? '<div class="a-flags">' + r.flags.join("") + "</div>" : pill("좋아요", "ok")) + '</td><td class="right"><div class="a-row-actions">' + btn("강사센터 접속", "ins-enter", "a-btn-primary a-btn-sm", ' data-id="' + r.ins.id + '"') + "</div></td></tr>").join("") +
      "</tbody></table></div></section>";
  }

  /* ---------------- 마스터: 오류 신고 모아보기 ---------------- */
  function pageMasterReports() {
    const all = allRequests();
    const list = all.filter((x) => ui.mRepIns === "all" || x.ins.id === ui.mRepIns);
    const shown = list.filter((x) => ui.qFilter === "all" || (ui.qFilter === "open" ? !x.q.answer : !!x.q.answer));
    const tabs = [["open", "답변 대기", list.filter((x) => !x.q.answer).length], ["done", "답변 완료", list.filter((x) => x.q.answer).length], ["all", "전체", list.length]].map((t) =>
      '<button type="button" class="a-tab' + (ui.qFilter === t[0] ? " on" : "") + '" data-action="q-tab" data-k="' + t[0] + '">' + t[1] + ' <span class="num">' + t[2] + "</span></button>").join("");
    return head("오류 신고 모아보기", "모든 강사 플랫폼에서 수강생이 남긴 프로그램 오류·불편 신고예요. 플랫폼 문제는 마스터가 직접 답하고 고칠 수 있어요. (강사도 자기 강사센터에서 볼 수 있어요)") +
      '<section class="a-card"><div class="a-toolbar"><div class="a-tabs">' + tabs + '</div><div class="a-filters"><select class="a-input a-sm" id="m-rep-ins" aria-label="강사"><option value="all">전체 강사</option>' + DB.data.instructors.map((x) => '<option value="' + x.id + '"' + (ui.mRepIns === x.id ? " selected" : "") + ">" + esc(x.displayName) + "</option>").join("") + "</select></div></div>" +
        requestCards(shown, true) + "</section>";
  }
  function requestCards(shown, showIns) {
    if (!shown.length) return emptyBox("bug", ui.qFilter === "open" ? "답변을 기다리는 신고가 없어요." : "신고가 없어요.");
    return '<div class="a-stack">' + shown.map((x) =>
      '<article class="a-q"><div class="a-q-head"><span class="a-avatar">' + esc(x.s.name.slice(0, 1)) + "</span><div><b>#" + x.no + " " + esc(x.q.title) + "</b><small>" + (showIns ? esc(x.ins.displayName) + " · " : "") + esc(x.s.name) + " · " + esc(cohortName(x.s.cohortId)) + " · " + fmtStamp(x.q.at) + "</small></div>" + pill(x.q.category || "기타", "mute") + (x.q.answer ? pill("답변 완료", "ok") : pill("답변 대기", "warn")) + "</div>" +
      '<p class="a-q-body">' + esc(x.q.body) + "</p>" +
      ((x.q.images || []).length ? '<div class="a-shots a-q-shots">' + x.q.images.map((im) => '<a class="a-shot" href="' + im.data + '" target="_blank" rel="noopener"><img src="' + im.data + '" alt="' + esc(im.name) + '"></a>').join("") + "</div>" : "") +
      '<form class="a-q-form" data-sid="' + x.s.id + '" data-qid="' + x.q.id + '"><textarea class="a-input" name="answer" rows="3" placeholder="예: 확인해 보니 ○○ 문제였어요. 지금 고쳤으니 새로고침 후 다시 해 주세요." aria-label="답변">' + esc(x.q.answer || "") + '</textarea><button class="a-btn a-btn-primary a-btn-sm" type="submit">' + (x.q.answer ? "답변 수정" : "답변 등록") + "</button></form></article>").join("") + "</div>";
  }

  /* ---------------- 마스터: 강사 공지 ---------------- */
  function pageMasterNotices() {
    const list = DB.data.announcements.slice().sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date));
    return head("강사 공지", "모든 강사센터 대시보드 맨 위에 보여요. 기능 업데이트, 점검 안내, 운영 정책을 알릴 때 써요.", addBtn("ann", "공지 쓰기")) +
      '<section class="a-card">' + (list.length ? '<ul class="a-items">' + list.map((n) => '<li><div class="a-item-main"><b>' + esc(n.title) + "</b><small>" + fmtFull(n.date) + " · " + esc((n.body || "").slice(0, 70)) + "</small></div>" + (n.pinned ? pill("고정", "dark") : "") +
        '<div class="a-row-actions">' + btn(icon("pen", "sm") + "수정", "item-edit", "a-btn-ghost a-btn-sm", ' data-coll="ann" data-id="' + n.id + '"') + "</div></li>").join("") + "</ul>" : emptyBox("megaphone", "강사에게 보낸 공지가 없어요.")) + "</section>";
  }

  /* ---------------- 마스터: 데이터 관리 ---------------- */
  function snapshot() {
    const progress = {};
    DB.store.keys().filter((k) => k.indexOf("moonclass:progress:") === 0).forEach((k) => { progress[k.slice(19)] = DB.store.get(k, {}); });
    return { exportedAt: new Date().toISOString(), db: DB.data, progress };
  }
  function pageMasterData() {
    const json = JSON.stringify(snapshot());
    const kb = Math.round(new Blob([json]).size / 1024);
    return head("데이터 관리", "지금은 서버 없이 이 브라우저에 저장돼요. 다른 컴퓨터로 옮기거나 혹시 모를 상황에 대비해 백업해 두세요.") +
      '<div class="a-kpis">' + kpi("저장된 데이터", kb + "KB", "브라우저 저장 공간 약 5MB 중", "#/center/master/data", kb > 3500 ? "warn" : "") + kpi("강사 플랫폼", DB.data.instructors.length + "개", "콘텐츠 포함", "#/center/master/instructors") + kpi("수강생", DB.data.students.length + "명", "제출 기록 포함", "#/center/master/students") + kpi("강사 공지", DB.data.announcements.length + "건", "", "#/center/master/notices") + "</div>" +
      '<section class="a-card"><div class="a-card-head"><h2>백업</h2><span class="a-muted">아래 내용을 복사해서 메모장 등에 보관하세요</span></div><textarea class="a-input a-mono" id="backup-out" rows="5" readonly>' + esc(json) + '</textarea><div class="a-card-foot">' + btn(icon("clipboard", "sm") + "백업 내용 복사", "backup-copy", "a-btn-primary a-btn-sm") + "</div></section>" +
      '<section class="a-card"><div class="a-card-head"><h2>복원</h2><span class="a-muted">백업해 둔 내용을 붙여 넣으면 그 시점으로 돌아가요</span></div><textarea class="a-input a-mono" id="backup-in" rows="4" placeholder="{&quot;exportedAt&quot;: … }"></textarea><div class="a-card-foot">' + btn(icon("refresh", "sm") + "이 내용으로 복원", "backup-restore", "a-btn-outline a-btn-sm") + "</div></section>" +
      '<section class="a-card"><div class="a-card-head"><h2>체험 데이터 처음으로</h2></div><p class="a-muted" style="margin:0 0 12px">모든 강사·수강생·제출 기록을 지우고 처음 체험 상태로 되돌려요. 되돌릴 수 없으니 먼저 백업하세요.</p>' + btn(icon("trash", "sm") + "처음 상태로 초기화", "data-reset", "a-btn-ghost a-btn-sm danger") + "</section>";
  }

  /* ---------------- 강사: 추가 메뉴 내용 ---------------- */
  function pageCustomPages() {
    const iid = IID(), c = C();
    const items = customPages(iid);
    return head("추가 메뉴", "‘메뉴 구성’에서 만든 페이지 메뉴의 내용을 채워요. 수강생 화면 왼쪽 메뉴에 그대로 보여요.") +
      (items.length ? '<div class="a-stack">' + items.map((it) => {
        const pg = c.pages[it.key] || {};
        return '<section class="a-card"><div class="a-card-head"><span class="a-menu-ico">' + icon(it.icon || "file", "sm") + '</span><h2 class="a-grow">' + esc(it.label) + "</h2>" + (it.on ? pill("수강생에게 보임", "ok") : pill("꺼짐", "mute")) + btn(icon("pen", "sm") + "내용 수정", "page-edit", "a-btn-primary a-btn-sm", ' data-key="' + it.key + '"') + "</div>" +
          '<p class="a-muted" style="margin:0">' + (pg.body ? esc(pg.body.slice(0, 120)) : "아직 내용이 없어요.") + "</p>" + ((pg.attachments || []).length ? '<p class="a-muted" style="margin:8px 0 0">' + icon("paperclip", "xs") + " 첨부 " + pg.attachments.length + "개</p>" : "") + "</section>";
      }).join("") + "</div>" : '<section class="a-card">' + emptyBox("star", "추가 메뉴가 없어요. ‘메뉴 구성’에서 새 메뉴를 만들 수 있어요.", '<a class="a-btn a-btn-primary" href="#/center/menus">메뉴 구성으로</a>') + "</section>");
  }
  function pageForm(key) {
    const it = customPages(IID()).find((x) => x.key === key);
    const pg = C().pages[key] || {};
    attDraft = DB.clone(pg.attachments || []);
    openModal(it.label + " 내용",
      '<form id="page-form" class="a-form" data-key="' + key + '" novalidate>' +
        '<div class="a-field"><label for="pf-title">페이지 제목</label><input class="a-input" id="pf-title" name="title" value="' + esc(pg.title || it.label) + '"></div>' +
        '<div class="a-field"><label for="pf-summary">한 줄 소개</label><input class="a-input" id="pf-summary" name="summary" value="' + esc(pg.summary || "") + '"></div>' +
        '<div class="a-field"><label for="pf-yt">유튜브 주소 (선택)</label><input class="a-input" id="pf-yt" name="youtubeId" value="' + esc(pg.youtubeId ? "https://youtu.be/" + pg.youtubeId : "") + '"></div>' +
        '<div class="a-field"><label for="pf-body">본문</label>' + richBar("pf-body") + '<textarea class="a-input a-rich-input" id="pf-body" name="body" rows="10">' + esc(pg.body || "") + '</textarea><small class="a-muted">## 소제목 · - 목록 · 1. 번호 · **굵게** · &gt; 강조 상자 · 주소는 자동으로 링크가 돼요.</small></div>' +
        '<div class="a-field"><span class="a-label">첨부 자료</span><div id="att-editor">' + attEditorHtml() + "</div></div>" +
        '<p class="a-error" id="pf-error"></p></form>',
      btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="page-form">저장</button>', "lg");
  }
  function libNoteForm() {
    const c = C(), n = c.libNotice || {}, d = DB.libNoticeOf(Object.assign({}, c, { libNotice: {} }));
    const fld = (id, label, val, ph, area, rows) => '<div class="a-field"><label for="' + id + '">' + label + "</label>" + (area ? '<textarea class="a-input" id="' + id + '" name="' + id + '" rows="' + (rows || 2) + '" placeholder="' + esc(ph) + '">' + esc(val) + "</textarea>" : '<input class="a-input" id="' + id + '" name="' + id + '" value="' + esc(val) + '" placeholder="' + esc(ph) + '">') + "</div>";
    openModal("자료실 이용 안내 팝업",
      '<form id="libnote-form" class="a-form" novalidate><p class="a-muted" style="margin:0">비워 두면 회색 기본 문구가 들어가요. **굵게** 를 쓸 수 있어요.</p>' +
        fld("ln-title", "제목", n.title || "", d.title) + fld("ln-intro", "첫 문장", n.intro || "", d.intro, true, 2) +
        fld("ln-items", "안내 항목 (한 줄에 하나)", (n.items || []).join("\n"), d.items.join("\n"), true, 4) + fld("ln-foot", "아래 작은 글", n.foot || "", d.foot, true, 2) + fld("ln-button", "버튼 글자", n.button || "", d.button) + "</form>",
      btn("기본 문구로", "libnote-reset", "a-btn-ghost") + '<span class="a-spacer"></span>' + btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="libnote-form">저장</button>', "md");
  }
  function saveLibNote(f) {
    C().libNotice = { title: f["ln-title"].value.trim(), intro: f["ln-intro"].value.trim(), items: LINES(f["ln-items"].value), foot: f["ln-foot"].value.trim(), button: f["ln-button"].value.trim() };
    DB.save(); commit("자료실 안내 문구를 저장했어요.");
  }
  function savePage(f) {
    const yt = f.youtubeId.value.trim(), yid = DB.youtubeId(yt);
    if (yt && !yid) { document.getElementById("pf-error").textContent = "유튜브 주소를 확인해 주세요."; return; }
    const c = C();
    c.pages[f.dataset.key] = { title: f.title.value.trim(), summary: f.summary.value.trim(), youtubeId: yid, body: f.body.value, attachments: attDraft.slice() };
    if (!DB.save()) { toast("저장 공간이 부족해요. 큰 파일은 링크로 바꿔 주세요.", "warn"); DB.load(); return; }
    commit("추가 메뉴 내용을 저장했어요.");
  }

  /* ---------------- 마스터 ---------------- */
  function pageMasterHome() {
    const ins = DB.data.instructors;
    const st = DB.data.students;
    const running = DB.data.cohorts.filter((c) => DB.cohortStatus(c) === "running").length;
    return head("마스터 대시보드", "강사 플랫폼을 만들어 분양하고, 전체 운영 현황을 봐요.", btn(icon("plus", "sm") + "새 강사 플랫폼", "ins-add", "a-btn-primary")) +
      '<div class="a-kpis">' +
        kpi("강사 플랫폼", ins.length + "개", "운영 중 " + ins.filter((x) => x.status === "active").length + "개", "#/center/master/instructors") +
        kpi("전체 수강생", st.filter((s) => s.status === "approved").length + "명", "수강 중 기준", "#/center/master/students") +
        kpi("진행 중 기수", running + "개", "모든 강사 합계", "#/center/master/instructors") +
        kpi("승인 대기", st.filter((s) => s.status === "pending").length + "명", "강사 승인 전", "#/center/master/students", "warn") +
      "</div>" + masterLevels() + insTable();
  }
  // 강사별 성장 단계 분포 (수강 중인 학생 기준)
  function masterLevels() {
    const list = DB.data.instructors.map((x) => ({ x, rows: studentProgressRows(x.id, (s) => s.status === "approved" && !!DB.cohort(s.cohortId)) })).filter((o) => o.rows.length);
    if (!list.length) return "";
    return '<section class="a-card"><div class="a-card-head"><h2>강사별 성장 단계 현황</h2><span class="a-muted">수강 중인 학생 기준 · 과제를 해낼수록 단계가 올라가요</span></div><div class="a-lvmaster">' +
      list.map((o) => {
        const avg = Math.round(o.rows.reduce((a, r) => a + r.st.pct, 0) / o.rows.length);
        const top = o.rows.slice().sort((a, b) => b.lv.idx - a.lv.idx || b.st.pct - a.st.pct).slice(0, 3);
        return '<div class="a-lvm"><div class="a-lvm-head"><b>' + esc(o.x.displayName) + '</b><span class="a-muted">' + o.rows.length + "명 · 평균 진행률 " + avg + "%</span></div>" + levelBoard(o.rows, true) +
          '<p class="a-lvm-top">잘하고 있는 학생: ' + top.map((r) => esc(r.s.name) + " (" + esc(r.lv.cur.name) + " · " + r.st.pct + "%)").join(", ") + "</p></div>";
      }).join("") + "</div></section>";
  }
  function insTable() {
    const list = DB.data.instructors;
    return '<section class="a-card"><div class="a-card-head"><h2>강사 플랫폼</h2><span class="a-muted">' + list.length + "개</span></div>" +
      (list.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>수강생에게 보이는 이름</th><th>강사 로그인</th><th>강의</th><th>기수</th><th>수강생</th><th>상태</th><th class="right">관리</th></tr></thead><tbody>' +
        list.map((x) => {
          const c = DB.content(x.id), cos = DB.cohortsOf(x.id), cur = DB.currentCohort(x.id);
          const ss = DB.studentsOf(x.id);
          return "<tr><td><b>" + esc(x.displayName) + '</b><small class="a-memo">' + fmtMD(x.createdAt || todayStr()) + " 개설</small></td><td>" + esc(x.name) + ' <span class="a-muted num">/ ' + esc(x.phone4) + "</span></td><td>" + esc(c ? c.brand.courseTitle : "-") + "</td>" +
            "<td>" + cos.length + "개" + (cur ? ' <small class="a-memo">' + esc(cur.name) + " " + DB.STATUS_LABEL[DB.cohortStatus(cur)] + "</small>" : "") + '</td><td class="num">' + ss.filter((s) => s.status === "approved").length + "명" + (ss.filter((s) => s.status === "pending").length ? ' <small class="a-memo">대기 ' + ss.filter((s) => s.status === "pending").length + "</small>" : "") + "</td>" +
            "<td>" + (x.status === "active" ? pill("운영 중", "ok") : pill("중지", "mute")) + '</td><td class="right"><div class="a-row-actions">' +
            btn("강사센터 접속", "ins-enter", "a-btn-primary a-btn-sm", ' data-id="' + x.id + '"') + '<a class="a-btn a-btn-ghost a-btn-sm" href="#/center/master/menus?ins=' + x.id + '">' + icon("sliders", "sm") + "메뉴·색상</a>" + '<a class="a-btn a-btn-ghost a-btn-sm" href="#/free/' + x.id + '">' + icon("video", "sm") + "무료강의</a>" + '<a class="a-btn a-btn-ghost a-btn-sm" href="#/p/' + x.id + '">' + icon("store", "sm") + "소개</a>" + btn("수정", "ins-edit", "a-btn-ghost a-btn-sm", ' data-id="' + x.id + '"') + "</div></td></tr>";
        }).join("") + "</tbody></table></div>" : emptyBox("store", "강사 플랫폼이 없어요.")) + "</section>";
  }
  function pageMasterInstructors() {
    return head("강사 플랫폼 관리", "새 강사에게 플랫폼을 만들어 주면 문대표 플랫폼 구성(메뉴·커리큘럼·과제·FAQ 등)이 들어간 상태로 시작해요. 강사는 이름 + 전화번호 뒷자리로 강사센터에 로그인해요.", btn(icon("plus", "sm") + "새 강사 플랫폼", "ins-add", "a-btn-primary")) + insTable();
  }
  function pageMasterStudents() {
    const ins = DB.data.instructors;
    const list = DB.data.students.filter((s) => (ui.mIns === "all" || s.instructorId === ui.mIns) && (ui.mStatus === "all" || s.status === ui.mStatus));
    return head("전체 수강생", "모든 강사 플랫폼의 수강생이에요. 승인·탈퇴는 각 강사센터에서 해요.") +
      '<section class="a-card"><div class="a-toolbar"><div class="a-filters">' +
        '<select class="a-input a-sm" id="m-ins" aria-label="강사"><option value="all">전체 강사</option>' + ins.map((x) => '<option value="' + x.id + '"' + (ui.mIns === x.id ? " selected" : "") + ">" + esc(x.displayName) + "</option>").join("") + "</select>" +
        '<select class="a-input a-sm" id="m-status" aria-label="상태"><option value="all">전체 상태</option>' + Object.keys(STU).map((k) => '<option value="' + k + '"' + (ui.mStatus === k ? " selected" : "") + ">" + STU[k].label + "</option>").join("") + "</select>" +
      '</div><span class="a-muted">' + list.length + "명</span></div>" +
      (list.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>이름</th><th>강사</th><th>기수</th><th>신청일</th><th>상태</th><th>성장 단계</th><th>진행률</th></tr></thead><tbody>' +
        list.map((s) => { const x = DB.instructor(s.instructorId); return "<tr><td><b>" + esc(s.name) + '</b> <span class="a-muted num">' + esc(s.phone4) + "</span></td><td>" + esc(x ? x.displayName : "-") + "</td><td>" + esc(cohortName(s.cohortId)) + '</td><td class="num">' + (s.appliedAt ? fmtMD(s.appliedAt) : "-") + "</td><td>" + pill(STU[s.status].label, STU[s.status].cls) + "</td>" +
          (s.status === "approved" && DB.cohort(s.cohortId) ? (() => { const lv = levelOfStudent(s); return "<td>" + lvBadge(lv) + '</td><td><div class="a-bar"><span style="width:' + lv.pct + '%"></span></div><small class="num">' + lv.pct + "% · 필수 " + lv.stats.reqDone + "/" + lv.stats.reqTotal + "</small></td>"; })() : '<td><span class="a-muted">-</span></td><td><span class="a-muted">-</span></td>') + "</tr>"; }).join("") +
        "</tbody></table></div>" : emptyBox("users", "조건에 맞는 수강생이 없어요.")) + "</section>";
  }
  function insForm(x) {
    const isNew = !x;
    x = x || { name: "", phone4: "", displayName: "", status: "active" };
    const c = isNew ? null : DB.content(x.id);
    openModal(isNew ? "새 강사 플랫폼 만들기" : x.displayName + " 수정",
      '<form id="ins-form" class="a-form" data-id="' + (isNew ? "" : x.id) + '" novalidate>' +
        '<div class="a-form-row"><div class="a-field"><label for="if-name">강사 이름 <small>(강사센터 로그인)</small></label><input class="a-input" id="if-name" name="name" value="' + esc(x.name) + '"></div>' +
        '<div class="a-field"><label for="if-phone">전화번호 뒷자리 <small>(비밀번호)</small></label><input class="a-input" id="if-phone" name="phone4" inputmode="numeric" maxlength="4" value="' + esc(x.phone4) + '"></div></div>' +
        '<div class="a-field"><label for="if-display">수강생에게 보이는 이름</label><input class="a-input" id="if-display" name="displayName" value="' + esc(x.displayName) + '" placeholder="예: 황금농부"><small class="a-muted">수강생 로그인 화면의 강사 선택 목록에 보여요.</small></div>' +
        (isNew ? '<div class="a-field"><label for="if-course">강의 이름</label><input class="a-input" id="if-course" name="courseTitle" placeholder="예: 황금농부와 함께하는 스마트스토어 실전 클래스"></div>' +
          '<div class="a-field"><span class="a-label">처음 내용</span><div class="a-radio-cards">' +
            '<label><input type="radio" name="seed" value="moon" checked><span><b>문대표 플랫폼 그대로 시작 (추천)</b><small>메뉴 구성·5주 커리큘럼·과제·FAQ·서류 가이드·자료실 틀을 복사해요. 강사는 필요 없는 건 지우고 바꾸기만 하면 돼요.</small></span></label>' +
            '<label><input type="radio" name="seed" value="blank"><span><b>간단한 빈 틀</b><small>4주 예시 커리큘럼과 기본 FAQ 3개만 넣어요.</small></span></label></div></div>' +
          '<div class="a-field"><label for="if-start">1기 1주차 시작일</label><input class="a-input" id="if-start" name="startDate" type="date" value="' + addDays(todayStr(), 14) + '"></div>' +
          '<div class="a-field"><span class="a-label">수강생 화면 색상</span>' + themePicker("orange", "itheme") + "</div>"
          : '<div class="a-field"><label for="if-status">상태</label><select class="a-input" id="if-status" name="status"><option value="active"' + (x.status === "active" ? " selected" : "") + '>운영 중</option><option value="paused"' + (x.status !== "active" ? " selected" : "") + ">운영 중지 (강사·수강생 로그인 막기)</option></select></div>" +
            '<p class="a-muted">강의: ' + esc(c ? c.brand.courseTitle : "-") + "</p>") +
        '<p class="a-error" id="if-error"></p></form>',
      (isNew ? "" : btn(icon("trash", "sm") + "플랫폼 삭제", "ins-delete", "a-btn-ghost danger", ' data-id="' + x.id + '"')) + '<span class="a-spacer"></span>' + btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="ins-form">' + (isNew ? "만들기" : "저장") + "</button>", "md");
  }
  function saveIns(f) {
    const err = document.getElementById("if-error");
    const name = f.name.value.trim(), phone4 = f.phone4.value.trim(), displayName = f.displayName.value.trim();
    if (!name || !displayName) { err.textContent = "강사 이름과 보이는 이름을 입력해 주세요."; return; }
    if (!/^\d{4}$/.test(phone4)) { err.textContent = "전화번호 뒷자리는 숫자 4자리예요."; return; }
    const id = f.dataset.id;
    if (DB.data.instructors.some((x) => x.id !== id && x.name === name && x.phone4 === phone4)) { err.textContent = "같은 이름·뒷자리의 강사가 이미 있어요."; return; }
    if (id) { Object.assign(DB.instructor(id), { name, phone4, displayName, status: f.status.value }); commit("강사 정보를 저장했어요."); return; }
    const nid = DB.uid("i");
    DB.data.instructors.push({ id: nid, name, phone4, displayName, status: "active", createdAt: todayStr() });
    const th = (f.querySelector("input[name=itheme]:checked") || {}).value || "lime";
    const brand = { name: displayName, instructor: displayName, courseTitle: f.courseTitle.value.trim() || displayName + " 실전 클래스", theme: th };
    const fromMoon = (f.querySelector("input[name=seed]:checked") || {}).value !== "blank";
    DB.data.content[nid] = fromMoon ? DB.templateFromMoon(brand) : DB.normalizeContent(DB.template(brand));
    if (fromMoon) DB.instructor(nid).menu = DB.moonMenu();
    DB.data.content[nid].brand.themeSet = true;
    DB.data.cohorts.push({ id: DB.uid("c"), instructorId: nid, name: "1기", startDate: f.startDate.value || addDays(todayStr(), 14), recruiting: true });
    commit(displayName + " 플랫폼을 만들었어요. 강사 로그인: " + name + " / " + phone4);
  }

  /* ---------------- 렌더 ---------------- */
  const PAGES = { "": pageDashboard, students: pageStudents, cohorts: pageCohorts, reviews: pageReviews, questions: pageQuestions, brand: pageBrand, menus: pageMenus, guide: pageGuide, landing: pageLanding, free: pageFree, curriculum: pageCurriculum, missions: pageMissions, schedule: pageSchedule, notices: pageNotices, faq: pageFaq, docs: pageDocs, library: pageLibrary, motivation: pageMotivation, channels: pageChannels, partners: pagePartners, pages: pageCustomPages };
  const MPAGES = { "": pageMasterHome, instructors: pageMasterInstructors, students: pageMasterStudents, menus: pageMasterMenus, health: pageMasterHealth, reports: pageMasterReports, notices: pageMasterNotices, data: pageMasterData };
  function render() {
    closeModal();
    const r = route();
    S = DB.session.admin();
    if (S && S.role === "instructor" && !(DB.instructor(S.instructorId) || {}).status) S = null;
    if (S && S.actingAs && !DB.instructor(S.actingAs)) { S.actingAs = null; DB.session.setAdmin(S); }
    if (!S) {
      document.body.dataset.master = loginTab === "master" ? "1" : "";
      // 로그인 후 원래 가려던 화면(예: 무료강의 페이지 편집)으로 돌아간다
      if (r.parts[0] !== "login" && r.parts.length) DB.store.set("moonclass:after-login", location.hash);
      if (r.parts[0] !== "login") history.replaceState(null, "", "#/center/login");
      renderLogin();
      return;
    }
    if (r.parts[0] === "login") { history.replaceState(null, "", S.role === "master" && !S.actingAs ? "#/center/master" : "#/center"); return render(); }
    const master = S.role === "master" && !S.actingAs;
    if (master && r.parts[0] !== "master") { history.replaceState(null, "", "#/center/master"); return render(); }
    if (!master && r.parts[0] === "master") { history.replaceState(null, "", "#/center"); return render(); }
    document.body.dataset.master = master ? "1" : "";
    renderShell(r);
    const main = document.getElementById("a-main");
    const fn = master ? (MPAGES[r.parts[1] || ""] || pageMasterHome) : (PAGES[r.parts[0] || ""] || pageDashboard);
    main.innerHTML = '<div class="a-page">' + fn(r) + "</div>";
    labelTables(main);
    document.title = (master ? "마스터" : "강사센터") + " · 두고 클래스";
  }
  // 모바일에서 표를 카드로 바꿀 때 쓰는 칸 이름(data-label)을 표 머리글에서 채운다
  function labelTables(scope) {
    scope.querySelectorAll(".a-table").forEach((tb) => {
      const heads = Array.from(tb.querySelectorAll("thead th")).map((th) => th.textContent.trim());
      tb.querySelectorAll("tbody tr").forEach((tr) => {
        let mainSet = false;
        Array.from(tr.children).forEach((td, i) => {
          td.setAttribute("data-label", heads[i] || "");
          if (!mainSet && !td.classList.contains("w-check")) { td.classList.add("cell-main"); mainSet = true; }
        });
      });
    });
  }
  function mount() { root.innerHTML = ""; render(); window.scrollTo(0, 0); }

  function openPreview(cohortId) {
    const iid = IID();
    const co = DB.cohort(cohortId) || DB.currentCohort(iid);
    if (!co) { toast("기수를 먼저 만들어 주세요.", "warn"); return; }
    DB.session.setStudent({ preview: true, instructorId: iid, cohortId: co.id, at: Date.now() });
    location.hash = "#/home";
  }

  /* ---------------- 이벤트 ---------------- */
  document.addEventListener("click", (e) => {
    if (!isActive()) return;
    const a = e.target.closest("[data-action]");
    if (!a) { if (e.target.closest(".a-side a")) { const app = document.getElementById("a-app"); if (app) app.classList.remove("nav-open"); } return; }
    if (a.disabled) return;
    const d = a.dataset;
    switch (d.action) {
      case "login-tab": loginTab = d.tab; document.body.dataset.master = loginTab === "master" ? "1" : ""; renderLogin(); break;
      case "toggle-pw": { const inp = document.getElementById("al-pw"); const show = inp.type === "password"; inp.type = show ? "text" : "password"; a.innerHTML = icon(show ? "eyeOff" : "eye", "sm"); break; }
      case "logout": logout(); break;
      case "toggle-nav": document.getElementById("a-app").classList.toggle("nav-open"); break;
      case "modal-close": closeModal(); break;
      case "modal-bg": if (e.target === a) closeModal(); break;
      case "confirm-ok": { const fn = confirmFn; confirmFn = null; if (fn) fn(); break; }
      case "preview": openPreview(d.cohort); break;
      case "to-student": { const st = DB.session.student(); if (st && st.preview) DB.session.setStudent(null); break; }
      case "stop-acting": S.actingAs = null; DB.session.setAdmin(S); location.hash = "#/center/master"; break;
      // 수강생
      case "stu-tab": ui.stuStatus = d.k; ui.picked.clear(); if (location.hash.indexOf("?") > -1) location.hash = "#/center/students"; else render(); break;
      case "stu-approve": { const s = DB.student(d.id); setStatus([d.id], "approved", s.name + "님을 승인했어요."); break; }
      case "stu-reject": { const s = DB.student(d.id); confirmModal("수강 신청 거절", esc(s.name) + "님의 신청을 거절할까요?<br>거절하면 로그인할 수 없어요.", "거절", true, () => setStatus([d.id], "rejected", s.name + "님의 신청을 거절했어요.")); break; }
      case "stu-withdraw": { const s = DB.student(d.id); confirmModal("탈퇴 처리", esc(s.name) + "님을 탈퇴 처리할까요?<br>탈퇴하면 로그인할 수 없고, 진행 기록은 남아 있어 복구할 수 있어요.", "탈퇴 처리", true, () => setStatus([d.id], "withdrawn", s.name + "님을 탈퇴 처리했어요.")); break; }
      case "stu-delete": { const s = DB.student(d.id); confirmModal("수강생 삭제", esc(s.name) + "님을 목록에서 완전히 삭제할까요?<br>되돌릴 수 없어요.", "삭제", true, () => { DB.data.students = DB.data.students.filter((x) => x.id !== d.id); DB.store.remove("moonclass:progress:" + d.id); commit("삭제했어요."); }); break; }
      case "bulk-approve": if (!ui.picked.size) { toast("승인할 수강생을 선택해 주세요.", "warn"); break; } setStatus(Array.from(ui.picked), "approved", ui.picked.size + "명을 승인했어요."); break;
      case "bulk-reject": if (!ui.picked.size) { toast("거절할 수강생을 선택해 주세요.", "warn"); break; } { const ids = Array.from(ui.picked); confirmModal("선택 거절", ids.length + "명의 신청을 거절할까요?", "거절", true, () => setStatus(ids, "rejected", ids.length + "명을 거절했어요.")); } break;
      case "student-add": studentForm(null); break;
      case "student-open": studentForm(DB.student(d.id)); break;
      // 기수
      case "cohort-add": cohortForm(null); break;
      case "cohort-edit": cohortForm(DB.cohort(d.id)); break;
      case "cohort-delete": { const co = DB.cohort(d.id); confirmModal("기수 삭제", esc(co.name) + "를 삭제할까요?", "삭제", true, () => { DB.data.cohorts = DB.data.cohorts.filter((x) => x.id !== d.id); commit("기수를 삭제했어요."); }); break; }
      // 검수 · 문의
      case "rev-tab": ui.revFilter = d.k; ui.revPicked.clear(); render(); break;
      case "review-open": if (e.target.closest(".rev-pick, .w-check")) break; e.stopPropagation(); reviewModal(d.sid, d.mid); break;
      case "rev-bulk-approve":
        if (!ui.revPicked.size) { toast("승인할 과제를 선택해 주세요.", "warn"); break; }
        { const n = ui.revPicked.size; confirmModal("선택 승인", n + "개 과제를 한 번에 승인할까요?<br>수강생 화면에 ‘강사 승인’으로 표시돼요.", "승인", false, () => bulkReview("approved")); }
        break;
      case "rev-bulk-fix":
        if (!ui.revPicked.size) { toast("보완 요청할 과제를 선택해 주세요.", "warn"); break; }
        openModal("선택 보완 요청 (" + ui.revPicked.size + "개)", '<div class="a-field"><label for="bulk-comment">수강생에게 남길 말</label><textarea class="a-input" id="bulk-comment" rows="3" placeholder="예: 화면 전체가 보이게 다시 캡처해 주세요."></textarea></div>', btn("취소", "modal-close") + btn("보완 요청", "rev-bulk-fix-ok", "a-btn-danger"));
        break;
      case "rev-bulk-fix-ok": { const c = document.getElementById("bulk-comment").value.trim(); if (!c) { toast("보완 요청 내용을 적어 주세요.", "warn"); break; } bulkReview("fix", c); break; }
      case "att-remove": attDraft.splice(Number(d.i), 1); refreshAtt(); break;
      case "img-remove": imgDraft.splice(Number(d.i), 1); refreshImg(); break;
      case "img-move": { const i = Number(d.i), j = i + Number(d.dir); if (j >= 0 && j < imgDraft.length) { [imgDraft[i], imgDraft[j]] = [imgDraft[j], imgDraft[i]]; refreshImg(); } break; }
      case "rich-ins": richInsert(d.for, d.k); break;
      case "att-link-add": {
        const nm = document.getElementById("att-link-name").value.trim(), url = document.getElementById("att-link-url").value.trim();
        if (!/^https?:\/\//i.test(url)) { toast("http:// 또는 https:// 로 시작하는 주소를 넣어 주세요.", "warn"); break; }
        attDraft.push({ id: DB.uid("a"), name: nm || url.replace(/^https?:\/\//, "").slice(0, 40), url });
        refreshAtt();
        break;
      }
      case "review-save": {
        const comment = (document.getElementById("rv-comment") || {}).value || "";
        if (d.status === "fix" && !comment.trim()) { toast("보완 요청 내용을 적어 주세요.", "warn"); document.getElementById("rv-comment").focus(); break; }
        const p = DB.progress(d.sid), list = p.submissions[d.mid];
        list[list.length - 1].review = { status: d.status, comment: comment.trim(), at: Date.now() };
        DB.saveProgress(d.sid, p);
        closeModal(); render();
        toast(d.status === "approved" ? "승인했어요." : "보완을 요청했어요.");
        break;
      }
      case "q-tab": ui.qFilter = d.k; render(); break;
      // 콘텐츠
      case "lib-tab": ui.libTab = d.k; render(); break;
      case "faq-bulk": faqBulkModal(); break;
      case "menu-off": case "menu-on": {
        const m = DB.menuConfig(ui.mMenuIns), it = m.items.find((x) => x.key === d.key);
        it.on = d.action === "menu-on";
        // 다시 켠 메뉴는 보이는 메뉴의 맨 아래로
        if (it.on) { m.items.splice(m.items.indexOf(it), 1); const lastOn = m.items.map((x) => x.on).lastIndexOf(true); m.items.splice(lastOn + 1, 0, it); }
        DB.save(); render(); toast(it.on ? "메뉴를 더했어요." : "메뉴를 뺐어요.");
        break;
      }
      case "menu-move": {
        const m = DB.menuConfig(ui.mMenuIns), onList = m.items.filter((x) => x.on);
        const i = onList.findIndex((x) => x.key === d.key), j = i + Number(d.dir);
        if (j < 0 || j >= onList.length) break;
        const a1 = m.items.indexOf(onList[i]), a2 = m.items.indexOf(onList[j]);
        [m.items[a1], m.items[a2]] = [m.items[a2], m.items[a1]];
        DB.save(); render();
        break;
      }
      case "lib-toggle": { const m = DB.menuConfig(ui.mMenuIns); m.library[d.k] = m.library[d.k] === false; DB.save(); render(); break; }
      case "menu-new": menuItemForm("", d.type); break;
      case "menu-edit": menuItemForm(d.key); break;
      case "menu-delete": {
        const m = DB.menuConfig(ui.mMenuIns), it = m.items.find((x) => x.key === d.key);
        confirmModal("메뉴 삭제", "‘" + esc(it.label) + "’ 메뉴를 완전히 삭제할까요?<br>강사가 작성한 내용도 함께 지워져요.", "삭제", true, () => {
          m.items = m.items.filter((x) => x.key !== d.key);
          const c = DB.content(ui.mMenuIns); if (c && c.pages) delete c.pages[d.key];
          commit("메뉴를 삭제했어요.");
        });
        break;
      }
      case "m-preview": {
        const co = DB.currentCohort(d.id);
        if (!co) { toast("기수가 없어 미리볼 수 없어요.", "warn"); break; }
        DB.session.setStudent({ preview: true, instructorId: d.id, cohortId: co.id, at: Date.now() });
        location.hash = "#/home";
        break;
      }
      case "page-edit": pageForm(d.key); break;
      case "libnote-edit": libNoteForm(); break;
      case "ql-reset": confirmModal("자주 찾는 페이지", "기본 목록(윗줄: 공지사항 · 자주 묻는 질문 · 서류 준비 가이드 · 요청사항 / 아랫줄: 유튜브 · 네이버 카페 · 두고커넥트 · 두고푸드)으로 되돌릴까요?", "되돌리기", false, () => { delete C().quickLinks; commit("기본 목록으로 되돌렸어요."); }); break;
      case "libnote-reset": delete C().libNotice; DB.save(); commit("기본 문구로 되돌렸어요."); break;
      case "backup-copy": {
        const ta = document.getElementById("backup-out");
        const done = () => toast("백업 내용을 복사했어요.");
        if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(done, () => { ta.select(); toast("내용을 선택했어요. 길게 눌러 복사해 주세요."); });
        else { ta.select(); toast("내용을 선택했어요. 길게 눌러 복사해 주세요."); }
        break;
      }
      case "backup-restore": {
        let data;
        try { data = JSON.parse(document.getElementById("backup-in").value); } catch (err) { toast("백업 내용을 읽지 못했어요. 처음부터 끝까지 그대로 붙여 넣어 주세요.", "warn"); break; }
        if (!data || !data.db || !Array.isArray(data.db.instructors)) { toast("두고 클래스 백업 형식이 아니에요.", "warn"); break; }
        confirmModal("백업으로 복원", "지금 데이터를 지우고 " + esc((data.exportedAt || "").slice(0, 16).replace("T", " ")) + " 백업으로 되돌릴까요?", "복원", true, () => {
          DB.store.keys().filter((k) => k.indexOf("moonclass:progress:") === 0).forEach((k) => DB.store.remove(k));
          Object.keys(data.progress || {}).forEach((sid) => DB.store.set("moonclass:progress:" + sid, data.progress[sid]));
          DB.store.set("moonclass:db:v2", data.db);
          DB.load(); closeModal(); render(); toast("백업으로 복원했어요.");
        });
        break;
      }
      case "data-reset":
        confirmModal("처음 상태로 초기화", "모든 강사·수강생·제출 기록이 지워지고 체험 데이터로 돌아가요.<br>되돌릴 수 없어요.", "초기화", true, () => {
          DB.reset(); S = { role: "master" }; DB.session.setAdmin(S); closeModal(); render(); toast("처음 상태로 되돌렸어요.");
        });
        break;
      case "lp-toggle": e.preventDefault(); lpDraft(); ui.lp.off[d.k] = !ui.lp.off[d.k]; ui.lpDirty = true; render(); break;
      case "lp-move": { e.preventDefault(); const L = lpDraft(), i = L.order.indexOf(d.k), j = i + Number(d.dir); if (j < 0 || j >= L.order.length) break; [L.order[i], L.order[j]] = [L.order[j], L.order[i]]; ui.lpDirty = true; render(); break; }
      case "lp-row-add": { const L = lpDraft(); const list = lpGet(L, d.path) || []; const row = {}; d.cols.split(",").forEach((k) => { row[k] = ""; }); list.push(row); lpSet(L, d.path, list); ui.lpDirty = true; render(); break; }
      case "lp-row-del": { const L = lpDraft(); lpGet(L, d.path).splice(Number(d.i), 1); ui.lpDirty = true; render(); break; }
      case "lp-row-move": { const L = lpDraft(), list = lpGet(L, d.path), i = Number(d.i), j = i + Number(d.dir); if (j < 0) break; [list[i], list[j]] = [list[j], list[i]]; ui.lpDirty = true; render(); break; }
      case "lp-img-del": lpSet(lpDraft(), d.path, ""); ui.lpDirty = true; render(); break;
      case "lp-faq-import": { const L = lpDraft(); L.faq = L.faq || {}; L.faq.items = C().faqs.slice(0, 6).map((f) => ({ q: f.q, a: f.a })); ui.lpDirty = true; ui.lpOpen.faq = true; render(); toast("자주 묻는 질문 " + L.faq.items.length + "개를 가져왔어요. 저장을 눌러 주세요."); break; }
      case "lp-save": {
        const c = C(), field = ui.lpKind === "free" ? "freeClass" : "landing", prev = c[field];
        c[field] = DB.clone(lpDraft());
        if (!DB.save()) { c[field] = prev; toast("저장 공간이 부족해요. 사진 크기를 줄여 주세요.", "warn"); break; }
        ui.lpDirty = false; render(); toast((ui.lpKind === "free" ? "무료강의 페이지" : "강의 소개 페이지") + "를 저장했어요. ‘페이지 보기’로 확인해 보세요.");
        break;
      }
      case "fc-tab": ui.fcTab = d.k; render(); window.scrollTo(0, 0); break;
      case "lp-pub": lpDraft().published = !lpDraft().published; ui.lpDirty = true; render(); toast(ui.lp.published ? "‘공개 중’으로 바꿨어요. 저장하면 적용돼요." : "‘비공개’로 바꿨어요. 저장하면 적용돼요."); break;
      case "lp-revert": ui.lp = null; render(); toast("저장된 내용으로 되돌렸어요."); break;
      case "fq-del": { const c = C(); c.freeQuestions = (c.freeQuestions || []).filter((x) => x.id !== d.id); commit("질문을 지웠어요."); break; }
      case "lp-copy": { const el = document.getElementById("lp-url"); const done = () => toast("주소를 복사했어요."); if (navigator.clipboard) navigator.clipboard.writeText(el.value).then(done, () => { el.select(); toast("주소를 선택했어요. 길게 눌러 복사해 주세요."); }); else { el.select(); toast("주소를 선택했어요."); } break; }
      case "cur-new": curForm("new"); break;
      case "cur-rename": curForm("rename"); break;
      case "cur-delete": {
        const cur = CUR(), used = usedBy(cur.id);
        if (used.length) { toast(used.map((x) => x.name).join(", ") + "가 쓰고 있어서 지울 수 없어요. 기수 관리에서 다른 커리큘럼으로 바꿔 주세요.", "warn"); break; }
        confirmModal("커리큘럼 삭제", "‘" + esc(cur.name) + "’을(를) 삭제할까요?<br>이 커리큘럼의 주차·강의·과제가 모두 지워져요.", "삭제", true, () => { const c = C(); c.curricula = c.curricula.filter((x) => x.id !== cur.id); ui.curId = "main"; commit("커리큘럼을 삭제했어요."); });
        break;
      }
      case "item-add": editItem(d.coll, "", d.ctx); break;
      case "item-edit": editItem(d.coll, d.id, d.ctx); break;
      case "item-delete": deleteItem(d.coll, d.id, d.ctx); break;
      case "item-move": moveItem(d.coll, d.id, d.ctx, Number(d.dir)); break;
      // 마스터
      case "ins-add": insForm(null); break;
      case "ins-edit": insForm(DB.instructor(d.id)); break;
      case "ins-enter": S.actingAs = d.id; DB.session.setAdmin(S); location.hash = "#/center"; toast(DB.instructor(d.id).displayName + " 강사센터로 들어왔어요."); break;
      case "ins-delete": {
        const x = DB.instructor(d.id);
        confirmModal("플랫폼 삭제", esc(x.displayName) + " 플랫폼을 삭제할까요?<br>콘텐츠·기수·수강생이 모두 삭제되고 되돌릴 수 없어요.", "삭제", true, () => {
          DB.studentsOf(d.id).forEach((s) => DB.store.remove("moonclass:progress:" + s.id));
          DB.data.students = DB.data.students.filter((s) => s.instructorId !== d.id);
          DB.data.cohorts = DB.data.cohorts.filter((c) => c.instructorId !== d.id);
          DB.data.instructors = DB.data.instructors.filter((i) => i.id !== d.id);
          delete DB.data.content[d.id];
          commit("플랫폼을 삭제했어요.");
        });
        break;
      }
    }
  });
  document.addEventListener("submit", (e) => {
    if (!isActive()) return;
    const f = e.target;
    if (f.id === "faq-bulk-form") {
      e.preventDefault();
      const items = parseFaqText(f.text.value);
      if (!items.length) { toast("Q. 와 A. 로 시작하는 줄을 찾지 못했어요. 형식을 확인해 주세요.", "warn"); return; }
      const c = C();
      if (f.replace.checked) c.faqs = [];
      items.forEach((it) => c.faqs.push(Object.assign({ id: DB.uid("q") }, it)));
      commit(items.length + "개 질문을 등록했어요.");
      return;
    }
    const forms = { "cur-form": saveCur, "a-login-form": doLogin, "student-form": saveStudent, "cohort-form": saveCohort, "coll-form": saveItem, "brand-form": saveBrand, "ins-form": saveIns, "menu-item-form": saveMenuItem, "page-form": savePage, "libnote-form": saveLibNote };
    if (forms[f.id]) { e.preventDefault(); forms[f.id](f); return; }
    if (f.classList.contains("a-q-form")) {
      e.preventDefault();
      const ans = f.answer.value.trim();
      if (!ans) { toast("답변을 적어 주세요.", "warn"); return; }
      const p = DB.progress(f.dataset.sid);
      const q = p.questions.find((x) => x.id === f.dataset.qid);
      q.answer = ans; q.answeredAt = Date.now();
      DB.saveProgress(f.dataset.sid, p);
      render(); toast("답변을 등록했어요. 수강생 화면에 바로 보여요.");
    }
  });
  document.addEventListener("change", (e) => {
    if (!isActive()) return;
    const t = e.target;
    if (t.id === "stu-cohort") { ui.stuCohort = t.value; ui.picked.clear(); if (location.hash.indexOf("?") > -1) location.hash = "#/center/students"; else render(); }
    else if (t.id === "rev-cohort") { ui.revCohort = t.value; ui.revPicked.clear(); render(); }
    else if (t.id === "rev-week") { ui.revWeek = t.value; ui.revPicked.clear(); render(); }
    else if (t.id === "sched-cohort") { ui.schedCohort = t.value; render(); }
    else if (t.id === "cur-pick") { ui.curId = t.value; render(); }
    else if (t.id === "cf-cur" || t.id === "cf-dow") refreshWeekPreview();
    else if (t.name === "base" && t.closest("#cur-form")) { const b = document.querySelector("[data-show-blank]"); if (b) b.hidden = t.value !== "blank"; }
    else if (t.id === "m-ins") { ui.mIns = t.value; render(); }
    else if (t.id === "m-menu-ins") { ui.mMenuIns = t.value; if (location.hash.indexOf("?") > -1) location.hash = "#/center/master/menus"; else render(); }
    else if (t.id === "m-rep-ins") { ui.mRepIns = t.value; render(); }
    else if (t.classList.contains("a-menu-label")) { const it = DB.menuConfig(ui.mMenuIns).items.find((x) => x.key === t.dataset.key); it.label = t.value.trim(); DB.save(); render(); toast("메뉴 이름을 저장했어요."); }
    else if (t.name === "mtheme") { const c = DB.content(ui.mMenuIns); c.brand.theme = t.value; c.brand.themeSet = true; DB.save(); render(); toast(DB.themeOf(t.value).label + " 색으로 바꿨어요."); }
    else if (t.name === "theme" || t.name === "itheme") { const box = document.getElementById("theme-preview-" + t.name); if (box) box.innerHTML = themePreview(t.value); }
    else if (t.id === "m-status") { ui.mStatus = t.value; render(); }
    else if (t.classList.contains("rev-pick")) { if (t.checked) ui.revPicked.add(t.dataset.key); else ui.revPicked.delete(t.dataset.key); render(); }
    else if (t.id === "rev-all" || t.id === "rev-all-2") {
      const keys = Array.from(document.querySelectorAll(".rev-pick")).map((x) => x.dataset.key);
      keys.forEach((k) => (t.checked ? ui.revPicked.add(k) : ui.revPicked.delete(k)));
      render();
    }
    else if (t.id === "att-file") { addAttFiles(t.files); t.value = ""; }
    else if (t.id === "img-file") { addImgFiles(t.files); t.value = ""; }
    else if (t.dataset && t.dataset.lpImg) { const f = t.files && t.files[0]; const path = t.dataset.lpImg; t.value = ""; if (f) lpCompress(f, (data) => { lpSet(lpDraft(), path, data); ui.lpDirty = true; render(); }); }
    else if (t.dataset && t.dataset.lpRadio) { lpSet(lpDraft(), t.dataset.lpRadio, t.value); lpChanged(); }
    else if (t.dataset && t.dataset.lpCheck) { lpSet(lpDraft(), t.dataset.lpCheck, t.checked); lpChanged(); }
    else if (t.id === "lp-pub") { lpDraft().published = t.checked; ui.lpDirty = true; render(); }
    else if (t.classList.contains("stu-pick")) { if (t.checked) ui.picked.add(t.dataset.id); else ui.picked.delete(t.dataset.id); render(); }
    else if (t.id === "stu-all") {
      const ids = Array.from(document.querySelectorAll(".stu-pick")).map((x) => x.dataset.id);
      ids.forEach((id) => (t.checked ? ui.picked.add(id) : ui.picked.delete(id)));
      render();
    }
    else if (t.closest && t.closest("#coll-form")) {
      const form = t.closest("#coll-form");
      if (form.dataset.coll === "mission" && t.name === "type") {
        if (form.chkImage) form.chkImage.checked = t.value === "image";
        if (form.chkLink) form.chkLink.checked = t.value === "link";
        toast(t.value === "image" ? "자동검수를 ‘사진·PDF 1개 이상’으로 맞췄어요." : t.value === "link" ? "자동검수를 ‘올바른 링크’로 맞췄어요." : "글 작성 과제는 ‘최소 글자 수’를 정하면 좋아요.");
      }
      applyShowIf();
    }
  });
  document.addEventListener("toggle", (e) => { const el = e.target; if (isActive() && el.classList && el.classList.contains("a-lp-sec") && ui.lpOpen) ui.lpOpen[el.dataset.k] = el.open; }, true);
  let qTimer = null;
  document.addEventListener("input", (e) => {
    if (!isActive()) return;
    const t = e.target;
    if (t.id === "stu-q") {
      ui.stuQuery = t.value;
      clearTimeout(qTimer);
      qTimer = setTimeout(() => { render(); const el = document.getElementById("stu-q"); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 250);
    }
    if (t.dataset && t.dataset.lp) { lpSet(lpDraft(), t.dataset.lp, t.value); lpChanged(); return; }
    if (t.dataset && t.dataset.lpLines) { lpSet(lpDraft(), t.dataset.lpLines, LINES(t.value)); lpChanged(); return; }
    if (t.id === "fb-text") { const n = parseFaqText(t.value).length; const el = document.getElementById("fb-count"); if (el) el.textContent = n + "개 인식됨"; }
    if (t.id === "cf-start" || t.id === "cf-time") refreshWeekPreview();
    if (t.id === "al-pw" && loginTab === "instructor") t.value = t.value.replace(/\D/g, "").slice(0, 4);
    if (t.id === "sf-phone" || t.id === "if-phone") t.value = t.value.replace(/\D/g, "").slice(0, 4);
    if (t.id === "al-id" || t.id === "al-pw") { const er = document.getElementById("al-error"); if (er) er.textContent = ""; }
  });
  document.addEventListener("keydown", (e) => {
    if (!isActive()) return;
    if (e.key === "Escape") { if (modalRoot.innerHTML) closeModal(); const app = document.getElementById("a-app"); if (app) app.classList.remove("nav-open"); }
  });

  window.AdminApp = { render, mount };
})();
