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
  const ui = { stuCohort: "all", stuStatus: "pending", stuQuery: "", picked: new Set(), revCohort: null, revWeek: "all", revFilter: "pending", qFilter: "open", libTab: "ebook", schedCohort: null, mIns: "all", mStatus: "all" };

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
      const p = DB.progress(s.id);
      return { s, p, st: DB.stats(p, iid) };
    });
  }
  function allSubmissions(iid, cohortId) {
    const c = DB.content(iid);
    const out = [];
    DB.studentsOf(iid).filter((s) => s.status === "approved" && (!cohortId || cohortId === "all" || s.cohortId === cohortId)).forEach((s) => {
      const p = DB.progress(s.id);
      c.weeks.forEach((w) => w.missions.forEach((m) => {
        const list = p.submissions[m.id];
        if (!list || !list.length) return;
        const sub = list[list.length - 1];
        out.push({ s, p, w, m, sub, count: list.length, review: sub.review ? sub.review.status : "pending" });
      }));
    });
    return out.sort((a, b) => b.sub.at - a.sub.at);
  }
  function allQuestions(iid) {
    const out = [];
    DB.studentsOf(iid).forEach((s) => {
      const p = DB.progress(s.id);
      p.questions.forEach((q) => out.push({ s, p, q }));
    });
    return out.sort((a, b) => b.q.at - a.q.at);
  }
  function counts(iid) {
    return {
      pending: DB.studentsOf(iid).filter((s) => s.status === "pending").length,
      review: allSubmissions(iid, "all").filter((x) => x.review === "pending").length,
      questions: allQuestions(iid).filter((x) => !x.q.answer).length
    };
  }

  /* ---------------- 로그인 ---------------- */
  function renderLogin() {
    document.title = "강사센터 · 로그인";
    const ins = loginTab === "instructor";
    root.innerHTML =
      '<main class="adm a-login">' +
        '<section class="a-login-brand">' +
          '<span class="a-logo"><span class="a-logo-mark">' + icon("layers") + "</span><b>두고 클래스</b><em>파트너</em></span>" +
          '<div class="a-login-hero"><p class="a-eyebrow">강사센터 · 마스터 관리자</p><h2>수강생 승인부터<br>커리큘럼까지,<br>한 곳에서.</h2>' +
            '<ul class="a-login-points"><li>' + icon("users", "sm") + "기수별 수강생 승인 · 거절 · 탈퇴</li><li>" + icon("calendar", "sm") + "기수 시작일만 정하면 주차 일정 자동 계산</li><li>" + icon("pen", "sm") + "커리큘럼 · 영상 · 공지 · 자료를 직접 올리기</li></ul></div>" +
          '<div class="a-login-foot"><a href="#/login" class="a-back-link">' + icon("arrowLeft", "sm") + "수강생 센터로</a><span>© 2026 두고 클래스</span></div>" +
        "</section>" +
        '<section class="a-login-panel"><div class="a-login-card">' +
          "<h1>파트너 로그인</h1><p class=\"a-muted\">강사님은 이름과 전화번호 뒷자리로, 운영자는 관리자 계정으로 로그인하세요.</p>" +
          '<div class="a-seg" role="tablist">' +
            '<button type="button" role="tab" aria-selected="' + ins + '" class="' + (ins ? "on" : "") + '" data-action="login-tab" data-tab="instructor">' + icon("user", "sm") + "강사</button>" +
            '<button type="button" role="tab" aria-selected="' + !ins + '" class="' + (!ins ? "on" : "") + '" data-action="login-tab" data-tab="master">' + icon("shieldCheck", "sm") + "마스터 관리자</button>" +
          "</div>" +
          '<form id="a-login-form" class="a-form" novalidate>' +
            (ins
              ? '<div class="a-field"><label for="al-id">강사 이름</label><input class="a-input" id="al-id" name="uid" autocomplete="name" placeholder="예: 문원오"></div>' +
                '<div class="a-field"><label for="al-pw">전화번호 뒷자리</label><input class="a-input" id="al-pw" name="pw" type="password" inputmode="numeric" maxlength="4" placeholder="숫자 4자리"></div>'
              : '<div class="a-field"><label for="al-id">아이디</label><input class="a-input" id="al-id" name="uid" autocomplete="username" placeholder="관리자 아이디"></div>' +
                '<div class="a-field"><label for="al-pw">비밀번호</label><input class="a-input" id="al-pw" name="pw" type="password" autocomplete="current-password" placeholder="비밀번호"></div>') +
            '<p class="a-error" id="al-error" role="alert"></p>' +
            '<button class="a-btn a-btn-primary a-btn-lg a-btn-block" type="submit">' + (ins ? "강사센터 들어가기" : "마스터로 들어가기") + "</button>" +
          "</form>" +
          '<div class="a-demo">' + (ins ? "체험 계정 · 이름 <b>문원오</b> / 뒷자리 <b>2186</b>" : "체험 계정 · <b>ADMIN</b> / <b>ADMIN</b> (대소문자 상관없음)") + "</div>" +
        "</div></section>" +
      "</main>";
  }
  function doLogin(f) {
    const id = f.uid.value.trim(), pw = f.pw.value.trim();
    const err = document.getElementById("al-error");
    if (loginTab === "master") {
      if (id.toUpperCase() === "ADMIN" && pw.toUpperCase() === "ADMIN") { S = { role: "master" }; DB.session.setAdmin(S); location.hash = "#/center/master"; toast("마스터 관리자로 로그인했어요."); }
      else err.textContent = "아이디 또는 비밀번호가 맞지 않아요.";
      return;
    }
    const ins = DB.data.instructors.find((x) => x.name.replace(/\s+/g, "") === id.replace(/\s+/g, "") && x.phone4 === pw);
    if (!ins) { err.textContent = "등록된 강사 정보와 일치하지 않아요. 이름과 뒷자리를 확인해 주세요."; return; }
    if (ins.status !== "active") { err.textContent = "운영이 중지된 플랫폼이에요. 마스터 관리자에게 문의해 주세요."; return; }
    S = { role: "instructor", instructorId: ins.id };
    DB.session.setAdmin(S);
    location.hash = "#/center";
    toast(ins.name + " 강사님, 환영합니다!");
  }
  function logout() { S = null; DB.session.setAdmin(null); location.hash = "#/center/login"; }

  /* ---------------- 셸 ---------------- */
  function instructorNav() {
    const n = counts(IID());
    return [
      ["운영", [
        ["", "대시보드", "grid"],
        ["students", "수강생 관리", "users", n.pending],
        ["cohorts", "기수 관리", "layers"],
        ["reviews", "과제 검수", "checks", n.review],
        ["questions", "문의 답변", "message", n.questions]
      ]],
      ["수강생 화면 콘텐츠", [
        ["brand", "기본 정보 · AI봇", "settings"],
        ["curriculum", "커리큘럼", "book"],
        ["missions", "과제", "clipboard"],
        ["schedule", "강의 일정", "calendar"],
        ["notices", "공지사항", "megaphone"],
        ["faq", "Q&A 자주 묻는 질문", "help"],
        ["docs", "서류 준비 가이드", "file"],
        ["library", "유료강의 자료실", "library"],
        ["motivation", "동기부여", "flame"]
      ]]
    ];
  }
  const masterNav = () => [["마스터", [["master", "대시보드", "grid"], ["master/instructors", "강사 플랫폼 관리", "store"], ["master/students", "전체 수강생", "users"]]]];

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
          '<a class="a-logo" href="#/center' + (master ? "/master" : "") + '"><span class="a-logo-mark">' + icon("layers") + "</span><b>" + (master ? "마스터 관리자" : "강사센터") + "</b>" + (ins ? '<em class="a-hide-sm">' + esc(ins.displayName) + "</em>" : "") + "</a>" +
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
            '<div class="a-side-foot"><a href="#/login" data-action="to-student">' + icon("arrowLeft", "xs") + "수강생 로그인 화면</a></div>" +
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
    return head(ins.name + " 강사님, 안녕하세요", esc(c.brand.courseTitle), btn(icon("userPlus", "sm") + "수강생 추가", "student-add", "a-btn-outline") + btn(icon("plus", "sm") + "새 기수", "cohort-add", "a-btn-primary")) +
      '<div class="a-kpis">' +
        kpi("승인 대기", n.pending + "명", "새 수강 신청", "#/center/students?status=pending", n.pending ? "warn" : "") +
        kpi("진행 중 기수", co ? co.name : "-", co ? (DB.cohortStatus(co) === "running" ? wk + "주차 진행 중" : fmtMD(co.startDate) + " 시작") : "기수를 만들어 주세요", "#/center/cohorts") +
        kpi("수강생 평균 진행률", avg + "%", (co ? co.name + " · " : "") + rows.length + "명 기준", "#/center/students?status=approved") +
        kpi("검수 대기 · 미답변", n.review + " · " + n.questions, "과제 검수 / 문의", "#/center/reviews", n.review + n.questions ? "info" : "") +
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
      (co ? '<section class="a-card"><div class="a-card-head"><h2>' + esc(co.name) + " 수강생 진행 현황</h2><span class=\"a-muted\">" + rows.length + "명</span></div>" + progressTable(rows, c) + "</section>" : "");
  }
  const kpi = (label, value, sub, href, tone) => '<a class="a-kpi ' + (tone || "") + '" href="' + href + '"><span>' + esc(label) + "</span><b>" + esc(value) + "</b><small>" + esc(sub) + "</small></a>";
  const cohortName = (id) => { const c = DB.cohort(id); return c ? c.name : "기수 없음"; };
  function weekStrip(co) {
    const c = DB.content(co.instructorId);
    const t = todayStr();
    return '<div class="a-weeks">' + c.weeks.map((w) => {
      const open = DB.weekOpen(co, w.no), dl = DB.weekDeadline(co, w.no);
      const st = t > dl ? "past" : t >= open ? "now" : "next";
      return '<div class="a-week ' + st + '"><b>' + w.no + "주차</b><span>" + fmtMD(open) + " ~ " + fmtMD(dl) + "</span><small>" + esc(w.title) + "</small></div>";
    }).join("") + "</div>";
  }
  function progressTable(rows, c) {
    if (!rows.length) return emptyBox("users", "수강 중인 학생이 없어요.");
    rows.sort((a, b) => b.st.pct - a.st.pct);
    return '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>이름</th>' + c.weeks.map((w) => "<th>" + w.no + "주차</th>").join("") + "<th>필수 통과</th><th>전체 진행률</th></tr></thead><tbody>" +
      rows.map((r) => "<tr class=\"clickable\" data-action=\"student-open\" data-id=\"" + r.s.id + "\"><td><b>" + esc(r.s.name) + "</b></td>" +
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
        (list.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr>' + (ui.stuStatus === "pending" ? '<th class="w-check"></th>' : "") + "<th>이름</th><th>뒷자리</th><th>기수</th><th>신청일</th><th>상태</th><th>진행률</th><th class=\"right\">관리</th></tr></thead><tbody>" +
          list.map((s) => {
            const st = s.status === "approved" ? DB.stats(DB.progress(s.id), iid) : null;
            return '<tr><td' + (ui.stuStatus === "pending" ? ' class="w-check"><input type="checkbox" class="stu-pick" data-id="' + s.id + '"' + (ui.picked.has(s.id) ? " checked" : "") + ' aria-label="' + esc(s.name) + ' 선택"></td><td' : "") + '><button class="a-name" data-action="student-open" data-id="' + s.id + '">' + esc(s.name) + "</button>" + (s.memo ? '<small class="a-memo">' + esc(s.memo) + "</small>" : "") + "</td>" +
              '<td class="num">' + esc(s.phone4) + "</td><td>" + esc(cohortName(s.cohortId)) + '</td><td class="num">' + (s.appliedAt ? fmtMD(s.appliedAt) : "-") + "</td><td>" + pill(STU[s.status].label, STU[s.status].cls) + "</td>" +
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
      const p = DB.progress(s.id), st = DB.stats(p, iid), c = C();
      extra = '<div class="a-detail-stats"><div><span>전체 진행률</span><b>' + st.pct + "%</b></div><div><span>필수 통과</span><b>" + st.reqDone + "/" + st.reqTotal + "</b></div><div><span>문의</span><b>" + p.questions.length + "건</b></div></div>" +
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
          '<div class="a-row-actions">' + btn(icon("eye", "sm") + "미리보기", "preview", "a-btn-ghost a-btn-sm", ' data-cohort="' + co.id + '"') + btn("수정", "cohort-edit", "a-btn-ghost a-btn-sm", ' data-id="' + co.id + '"') + "</div></div>" +
          '<div class="a-cohort-stats"><a href="#/center/students?cohort=' + co.id + '&status=approved"><b class="num">' + ap + "</b><span>수강 중</span></a><a href=\"#/center/students?cohort=" + co.id + '&status=pending"><b class="num">' + pe + "</b><span>승인 대기</span></a><div><b class=\"num\">" + ss.length + "</b><span>전체 신청</span></div></div>" +
          weekStrip(co) + "</section>";
      }).join("") + "</div>" : '<section class="a-card">' + emptyBox("layers", "아직 기수가 없어요. 첫 기수를 만들어 주세요.", btn(icon("plus", "sm") + "새 기수 만들기", "cohort-add", "a-btn-primary")) + "</section>");
  }
  function cohortForm(co) {
    const iid = IID();
    const isNew = !co;
    const last = DB.cohortsOf(iid).slice(-1)[0];
    co = co || { name: DB.nextCohortName(iid), startDate: last ? addDays(DB.cohortEnd(last), 1 + ((4 - parseDate(addDays(DB.cohortEnd(last), 1)).getDay() + 7) % 7)) : todayStr(), recruiting: true };
    const n = (DB.studentsOf(iid).filter((s) => s.cohortId === co.id)).length;
    openModal(isNew ? "새 기수 만들기" : co.name + " 수정",
      '<form id="cohort-form" class="a-form" data-id="' + (isNew ? "" : co.id) + '" novalidate>' +
        '<div class="a-form-row"><div class="a-field"><label for="cf-name">기수 이름</label><input class="a-input" id="cf-name" name="name" value="' + esc(co.name) + '"></div>' +
        '<div class="a-field"><label for="cf-start">1주차 시작일</label><input class="a-input" id="cf-start" name="startDate" type="date" value="' + esc(co.startDate) + '"></div></div>' +
        '<label class="a-check"><input type="checkbox" name="recruiting"' + (co.recruiting ? " checked" : "") + "><span>수강생 로그인 화면에서 이 기수로 수강 신청 받기</span></label>" +
        '<div class="a-field"><span class="a-label">주차 일정 미리보기</span><div id="cf-preview" class="a-preview-weeks">' + weekPreview(co.startDate) + "</div></div>" +
        '<p class="a-error" id="cf-error"></p>' +
      "</form>",
      (isNew ? "" : btn("기수 삭제", "cohort-delete", "a-btn-ghost danger", ' data-id="' + co.id + '"' + (n ? ' disabled title="수강생이 있는 기수는 삭제할 수 없어요"' : ""))) + '<span class="a-spacer"></span>' + btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="cohort-form">' + (isNew ? "만들기" : "저장") + "</button>", "md");
  }
  function weekPreview(start) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start || "")) return '<span class="a-muted">날짜를 고르면 주차 일정이 보여요.</span>';
    const fake = { startDate: start, instructorId: IID() };
    return C().weeks.map((w) => "<span><b>" + w.no + "주차</b> " + fmtMD(DB.weekOpen(fake, w.no)) + " 공개 · " + fmtMD(DB.weekDeadline(fake, w.no)) + " 마감</span>").join("");
  }
  function saveCohort(f) {
    const name = f.name.value.trim(), start = f.startDate.value;
    const err = document.getElementById("cf-error");
    if (!name) { err.textContent = "기수 이름을 입력해 주세요."; return; }
    if (!start) { err.textContent = "1주차 시작일을 골라 주세요."; return; }
    const id = f.dataset.id;
    if (id) Object.assign(DB.cohort(id), { name, startDate: start, recruiting: f.recruiting.checked });
    else DB.data.cohorts.push({ id: DB.uid("c"), instructorId: IID(), name, startDate: start, recruiting: f.recruiting.checked });
    commit(id ? name + " 일정을 저장했어요." : name + "를 만들었어요.");
  }

  /* ---------------- 강사: 과제 검수 ---------------- */
  function pageReviews() {
    const iid = IID(), c = C();
    const cos = DB.cohortsOf(iid);
    if (!ui.revCohort) ui.revCohort = (DB.currentCohort(iid) || {}).id || "all";
    let list = allSubmissions(iid, ui.revCohort);
    if (ui.revWeek !== "all") list = list.filter((x) => String(x.w.no) === ui.revWeek);
    const cnt = (k) => list.filter((x) => k === "all" || x.review === k).length;
    const shown = list.filter((x) => ui.revFilter === "all" || x.review === ui.revFilter);
    const tabs = [["pending", "검수 대기"], ["fix", "보완 요청"], ["approved", "승인"], ["all", "전체"]].map((t) =>
      '<button type="button" class="a-tab' + (ui.revFilter === t[0] ? " on" : "") + '" data-action="rev-tab" data-k="' + t[0] + '">' + t[1] + ' <span class="num">' + cnt(t[0]) + "</span></button>").join("");
    return head("과제 검수", "수강생 제출물은 자동검수 결과가 먼저 반영되고, 강사님이 승인하거나 보완을 요청하면 그 결과가 최종이 돼요.") +
      '<section class="a-card"><div class="a-toolbar"><div class="a-tabs">' + tabs + "</div>" +
        '<div class="a-filters"><select class="a-input a-sm" id="rev-cohort" aria-label="기수"><option value="all">전체 기수</option>' + cos.map((co) => '<option value="' + co.id + '"' + (ui.revCohort === co.id ? " selected" : "") + ">" + esc(co.name) + "</option>").join("") + "</select>" +
        '<select class="a-input a-sm" id="rev-week" aria-label="주차"><option value="all">전체 주차</option>' + c.weeks.map((w) => '<option value="' + w.no + '"' + (ui.revWeek === String(w.no) ? " selected" : "") + ">" + w.no + "주차</option>").join("") + "</select></div></div>" +
        (shown.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>제출 시각</th><th>수강생</th><th>과제</th><th>제출</th><th>상태</th><th class="right"></th></tr></thead><tbody>' +
          shown.map((x) => '<tr class="clickable" data-action="review-open" data-sid="' + x.s.id + '" data-mid="' + x.m.id + '"><td class="num">' + fmtStamp(x.sub.at) + "</td><td><b>" + esc(x.s.name) + "</b><small class=\"a-memo\">" + esc(cohortName(x.s.cohortId)) + "</small></td><td>" + x.w.no + "주차 · " + esc(x.m.title) + (x.m.required ? "" : ' <small class="a-muted">선택</small>') + '</td><td class="num">' + x.count + "회</td><td>" + reviewPill(x) + '</td><td class="right">' + btn("열기", "review-open", "a-btn-ghost a-btn-sm", ' data-sid="' + x.s.id + '" data-mid="' + x.m.id + '"') + "</td></tr>").join("") +
          "</tbody></table></div>" : emptyBox("inbox", ui.revFilter === "pending" ? "검수할 제출물이 없어요." : "해당하는 제출물이 없어요.")) +
      "</section>";
  }
  function reviewModal(sid, mid) {
    const s = DB.student(sid), p = DB.progress(sid), c = C();
    const w = c.weeks.find((x) => x.missions.some((m) => m.id === mid));
    const m = w.missions.find((x) => x.id === mid);
    const subs = p.submissions[mid] || [];
    const sub = subs[subs.length - 1];
    if (!sub) return;
    const files = (sub.files || []).map((f) => f.type === "image" ? '<a class="a-shot" href="' + f.data + '" target="_blank" rel="noopener"><img src="' + f.data + '" alt="' + esc(f.name) + '"></a>' : '<span class="a-file">' + icon("file", "sm") + esc(f.name) + "</span>").join("");
    openModal(s.name + " · " + m.title,
      '<div class="a-review-meta">' + pill(w.no + "주차", "mute") + (m.required ? pill("필수", "dark") : pill("선택", "mute")) + "<span>" + subs.length + "번째 제출 · " + fmtStamp(sub.at) + "</span></div>" +
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
    const list = allQuestions(iid);
    const shown = list.filter((x) => ui.qFilter === "all" || (ui.qFilter === "open" ? !x.q.answer : !!x.q.answer));
    const tabs = [["open", "미답변", list.filter((x) => !x.q.answer).length], ["done", "답변 완료", list.filter((x) => x.q.answer).length], ["all", "전체", list.length]].map((t) =>
      '<button type="button" class="a-tab' + (ui.qFilter === t[0] ? " on" : "") + '" data-action="q-tab" data-k="' + t[0] + '">' + t[1] + ' <span class="num">' + t[2] + "</span></button>").join("");
    return head("문의 답변", "수강생이 Q&A ‘요청사항’에 남긴 문의예요. 답변하면 수강생 화면에 바로 보여요.") +
      '<section class="a-card"><div class="a-toolbar"><div class="a-tabs">' + tabs + "</div></div>" +
        (shown.length ? '<div class="a-stack">' + shown.map((x) =>
          '<article class="a-q"><div class="a-q-head"><span class="a-avatar">' + esc(x.s.name.slice(0, 1)) + "</span><div><b>" + esc(x.q.title) + "</b><small>" + esc(x.s.name) + " · " + esc(cohortName(x.s.cohortId)) + " · " + fmtStamp(x.q.at) + "</small></div>" + (x.q.answer ? pill("답변 완료", "ok") : pill("미답변", "warn")) + "</div>" +
          '<p class="a-q-body">' + esc(x.q.body) + "</p>" +
          '<form class="a-q-form" data-sid="' + x.s.id + '" data-qid="' + x.q.id + '"><textarea class="a-input" name="answer" rows="2" placeholder="답변을 적어 주세요" aria-label="답변">' + esc(x.q.answer || "") + '</textarea><button class="a-btn a-btn-primary a-btn-sm" type="submit">' + (x.q.answer ? "답변 수정" : "답변 등록") + "</button></form></article>").join("") + "</div>"
          : emptyBox("message", ui.qFilter === "open" ? "답변을 기다리는 문의가 없어요." : "문의가 없어요.")) +
      "</section>";
  }

  /* ---------------- 콘텐츠 편집 (공통 목록 편집기) ---------------- */
  const LINES = (v) => String(v || "").split("\n").map((x) => x.trim()).filter(Boolean);
  const TAGS = (v) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
  const F = (key, label, type, opts) => Object.assign({ key, label, type: type || "text" }, opts || {});
  const COLL = {
    week: { name: "주차", list: (c) => c.weeks, fields: [F("title", "주차 제목"), F("summary", "한 줄 소개", "textarea", { rows: 2 })],
      init: () => ({ lessons: [], missions: [] }), after: (c) => c.weeks.forEach((w, i) => { w.no = i + 1; }) },
    lesson: { name: "강의", list: (c, ctx) => weekOf(c, ctx).lessons, fields: [F("title", "강의 제목"), F("youtubeId", "유튜브 주소", "youtube"), F("minutes", "길이(분)", "number"), F("desc", "강의 설명", "textarea", { rows: 3 })], idp: "l" },
    mission: { name: "과제", list: (c, ctx) => weekOf(c, ctx).missions, idp: "m",
      init: () => ({ required: true, type: "image", steps: [], check: { image: true } }),
      fields: [
        F("title", "과제 제목"),
        F("required", "필수 과제 (수료 조건에 들어가요)", "checkbox"),
        F("type", "제출 방식", "select", { options: [["image", "사진 · PDF 인증"], ["link", "링크 제출"], ["text", "글 작성"]] }),
        F("desc", "과제 설명", "textarea", { rows: 3 }),
        F("steps", "진행 방법 (한 줄에 하나)", "lines", { rows: 3 }),
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
        F("scope", "반복", "select", { options: [["all", "모든 기수에 반복 (주차·요일로 지정)"], ["cohort", "특정 기수 하루만"]] }),
        F("week", "주차", "number", { showIf: "scope=all", min: 1 }),
        F("dow", "요일", "select", { showIf: "scope=all", options: DOW.map((d, i) => [String(i), d + "요일"]) }),
        F("cohortId", "기수", "select", { showIf: "scope=cohort", options: () => DB.cohortsOf(IID()).map((co) => [co.id, co.name + " · " + fmtMD(co.startDate) + " 시작"]) }),
        F("date", "날짜", "date", { showIf: "scope=cohort" })
      ] },
    notice: { name: "공지", list: (c) => c.notices, idp: "n", init: () => ({ date: todayStr(), pinned: false }),
      fields: [F("title", "제목"), F("body", "내용", "textarea", { rows: 7 }), F("date", "게시일", "date"), F("pinned", "상단 고정 (필독)", "checkbox")] },
    faq: { name: "질문", list: (c) => c.faqs, idp: "q", fields: [F("q", "질문"), F("a", "답변", "textarea", { rows: 4 }), F("tags", "AI봇 검색어 (쉼표로 구분)", "tags", { hint: "수강생이 이 단어로 물어보면 AI봇이 이 답변을 보여 줘요." })] },
    doc: { name: "서류 단계", list: (c) => c.docsGuide, idp: "d",
      fields: [F("title", "단계 이름"), F("where", "어디서 (기관·사이트)"), F("url", "바로가기 주소", "url"), F("time", "소요 시간"), F("cost", "비용"), F("docs", "필요 서류 (한 줄에 하나)", "lines", { rows: 3 }), F("tips", "팁 (한 줄에 하나)", "lines", { rows: 3 })] },
    mv: { name: "동기부여 영상", list: (c) => c.motivation, idp: "mv", init: () => ({ date: todayStr() }),
      fields: [F("title", "영상 제목"), F("youtubeId", "유튜브 주소", "youtube"), F("minutes", "영상 길이 (예: 31:57)"), F("date", "올린 날", "date")] }
  };
  ["ebook", "file"].forEach((k) => { COLL["res-" + k] = { name: "자료", list: (c) => c.resources[k], idp: k[0], fields: [F("title", "자료 이름"), F("meta", "형식 (예: 전자책 · 86쪽)"), F("desc", "한 줄 설명"), F("url", "열람·다운로드 주소 (구글 드라이브 등)", "url")] }; });
  ["vod", "senior"].forEach((k) => { COLL["res-" + k] = { name: "영상", list: (c) => c.resources[k], idp: k[0], fields: [F("title", "영상 제목"), F("meta", "형식 (예: VOD · 32분)"), F("desc", "한 줄 설명"), F("youtubeId", "유튜브 주소", "youtube")] }; });
  function weekOf(c, ctx) { return c.weeks.find((w) => String(w.no) === String(ctx)); }

  function fieldHtml(f, item) {
    const id = "cf-" + f.key;
    let v = f.get ? f.get(item) : item[f.key];
    if (v == null) v = "";
    const show = f.showIf ? ' data-show-if="' + f.showIf + '"' : "";
    if (f.type === "checkbox") return '<label class="a-check"' + show + '><input type="checkbox" name="' + f.key + '" id="' + id + '"' + (v ? " checked" : "") + "><span>" + esc(f.label) + "</span></label>";
    let input;
    if (f.type === "textarea" || f.type === "lines") input = '<textarea class="a-input" id="' + id + '" name="' + f.key + '" rows="' + (f.rows || 3) + '">' + esc(f.type === "lines" ? (v || []).join("\n") : v) + "</textarea>";
    else if (f.type === "select") { const opts = typeof f.options === "function" ? f.options() : f.options; input = '<select class="a-input" id="' + id + '" name="' + f.key + '">' + opts.map((o) => '<option value="' + esc(o[0]) + '"' + (String(v) === String(o[0]) ? " selected" : "") + ">" + esc(o[1]) + "</option>").join("") + "</select>"; }
    else if (f.type === "tags") input = '<input class="a-input" id="' + id + '" name="' + f.key + '" value="' + esc(Array.isArray(v) ? v.join(", ") : v) + '">';
    else if (f.type === "youtube") input = '<input class="a-input" id="' + id + '" name="' + f.key + '" value="' + esc(v ? "https://youtu.be/" + v : "") + '" placeholder="https://www.youtube.com/watch?v=… 또는 youtu.be/…">';
    else input = '<input class="a-input" id="' + id + '" name="' + f.key + '" type="' + ({ number: "number", date: "date", time: "time", url: "url" }[f.type] || "text") + '"' + (f.min ? ' min="' + f.min + '"' : "") + ' value="' + esc(v) + '">';
    return '<div class="a-field"' + show + '><label for="' + id + '">' + esc(f.label) + "</label>" + input + (f.hint ? '<small class="a-muted">' + esc(f.hint) + "</small>" : "") + "</div>";
  }
  function editItem(coll, id, ctx) {
    const def = COLL[coll], c = C();
    const list = def.list(c, ctx);
    const item = id ? list.find((x) => (x.id || String(x.no)) === id) : Object.assign({}, def.init ? def.init() : {});
    if (!item) return;
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
      const el = form[f.key];
      if (!el) continue;
      let v;
      if (f.type === "checkbox") v = el.checked;
      else if (f.type === "lines") v = LINES(el.value);
      else if (f.type === "tags") v = TAGS(el.value);
      else if (f.type === "number") v = el.value === "" ? "" : Number(el.value);
      else if (f.type === "youtube") { v = DB.youtubeId(el.value); if (el.value.trim() && !v) { err.textContent = "유튜브 주소를 확인해 주세요. (youtube.com/watch?v=… 또는 youtu.be/…)"; return; } }
      else v = el.value.trim();
      if (f.set) f.set(item, v); else item[f.key] = v;
    }
    const titleKey = def.fields[0].key;
    if (def.fields[0].type === "text" && !item[titleKey] && titleKey !== "type") { err.textContent = def.fields[0].label + "을(를) 입력해 주세요."; return; }
    if (form.dataset.coll === "event") {
      if (!item.title) { err.textContent = "일정 이름을 입력해 주세요."; return; }
      if (item.scope === "cohort" && (!item.cohortId || !item.date)) { err.textContent = "기수와 날짜를 골라 주세요."; return; }
      if (item.scope === "cohort") { delete item.week; delete item.dow; } else { delete item.cohortId; delete item.date; item.week = Math.max(1, Number(item.week) || 1); }
    }
    if (!id) {
      if (form.dataset.coll === "week") item.no = list.length + 1;
      else item.id = DB.uid(def.idp || "x");
      list.push(item);
    }
    if (def.after) def.after(c);
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
    return head("기본 정보 · AI봇", "수강생 화면의 상단 이름, 로그인 화면 문구, AI봇 이름을 정해요.") +
      '<form id="brand-form" class="a-card a-form">' +
        '<h2 class="a-sub">브랜드</h2><div class="a-form-row">' + f("name", "브랜드 이름", b.name, "로그인 화면 왼쪽 위·상단 작은 글씨") + f("instructor", "강사 표시 이름", b.instructor, "공지·수료증 서명·AI봇 인사말에 쓰여요") + "</div>" +
        f("courseTitle", "강의 이름", b.courseTitle, "수강생 화면 맨 위 제목") +
        '<div class="a-form-row">' + f("shortTitle", "짧은 강의 이름", b.shortTitle, "로그인 화면 배지") + f("tagline", "한 줄 소개", b.tagline) + "</div>" +
        '<h2 class="a-sub">로그인 화면</h2>' +
        f("loginPhrases", "타이핑 문구 (한 줄에 하나)", (b.loginPhrases || []).join("\n"), "한 단어씩 바뀌며 타이핑돼요", "textarea") +
        f("loginHeadlineSuffix", "헤드라인 마지막 문장", b.loginHeadlineSuffix) +
        '<div class="a-form-row">' + f("youtubeChannel", "유튜브 채널 주소", b.youtubeChannel, "", "url") + f("freeCourseUrl", "무료 강의 · 소개 페이지 주소", b.freeCourseUrl, "", "url") + "</div>" +
        '<h2 class="a-sub">강의 운영</h2><div class="a-form-row">' + f("liveTime", "주차 강의 오픈 시간", b.liveTime, "강의 일정의 ‘강의 오픈’ 옆에 표시", "time") + f("botName", "AI봇 이름", b.botName, "수강생 메뉴와 채팅창 이름") + "</div>" +
        f("quotes", "오늘의 한마디 (한 줄에 하나)", (C().quotes || []).join("\n"), "홈·동기부여 화면에 날마다 돌아가며 보여요", "textarea") +
        '<div class="a-form-foot"><button class="a-btn a-btn-primary" type="submit">저장</button></div>' +
      "</form>";
  }
  function saveBrand(f) {
    const c = C(), b = c.brand;
    ["name", "instructor", "courseTitle", "shortTitle", "tagline", "loginHeadlineSuffix", "youtubeChannel", "freeCourseUrl", "liveTime", "botName"].forEach((k) => { b[k] = f[k].value.trim(); });
    b.loginPhrases = LINES(f.loginPhrases.value);
    c.quotes = LINES(f.quotes.value);
    if (!b.name) { toast("브랜드 이름을 입력해 주세요.", "warn"); return; }
    const ins = INS();
    commit("기본 정보를 저장했어요.");
    if (ins) { /* 수강생 로그인 선택지 이름은 마스터가 관리 */ }
  }
  function pageCurriculum() {
    const c = C();
    const co = DB.currentCohort(IID());
    return head("커리큘럼", "주차와 강의 영상을 올려요. 공개일은 기수 시작일에 맞춰 자동으로 정해져요" + (co ? " (" + esc(co.name) + " 기준 날짜 표시)" : "") + ".", addBtn("week", "주차 추가")) +
      (c.weeks.length ? '<div class="a-stack">' + c.weeks.map((w, wi) =>
        '<section class="a-card"><div class="a-card-head"><span class="a-weekno">' + w.no + "주차</span><div class=\"a-grow\"><h2>" + esc(w.title) + '</h2><p class="a-muted">' + esc(w.summary || "") + (co ? " · " + fmtMD(DB.weekOpen(co, w.no)) + " 공개" : "") + "</p></div>" + rowTools("week", String(w.no), "", wi, c.weeks.length) + "</div>" +
          (w.lessons.length ? '<ul class="a-items">' + w.lessons.map((l, i) => '<li><div class="a-item-main"><b>' + esc(l.title) + "</b><small>" + (l.minutes ? l.minutes + "분 · " : "") + esc(l.desc || "") + "</small></div>" + ytBadge(l) + rowTools("lesson", l.id, w.no, i, w.lessons.length) + "</li>").join("") + "</ul>" : '<p class="a-muted a-pad">아직 강의가 없어요.</p>') +
          '<div class="a-card-foot">' + addBtn("lesson", "강의 추가", w.no, "a-btn-ghost a-btn-sm") + '<a class="a-link" href="#/center/missions">이 주차 과제 ' + w.missions.length + "개 " + icon("arrowRight", "xs") + "</a></div></section>").join("") + "</div>"
        : '<section class="a-card">' + emptyBox("book", "주차를 추가해서 커리큘럼을 만들어 주세요.", addBtn("week", "주차 추가")) + "</section>");
  }
  function pageMissions() {
    const c = C();
    const total = c.weeks.reduce((a, w) => a + w.missions.length, 0);
    const req = c.weeks.reduce((a, w) => a + w.missions.filter((m) => m.required).length, 0);
    const typeL = { image: "사진", link: "링크", text: "글" };
    return head("과제", "주차별 과제와 자동검수 기준을 정해요. 필수 과제 " + req + "개를 모두 통과하면 수료증이 발급돼요. (전체 " + total + "개)") +
      (c.weeks.length ? '<div class="a-stack">' + c.weeks.map((w) =>
        '<section class="a-card"><div class="a-card-head"><span class="a-weekno">' + w.no + '주차</span><h2 class="a-grow">' + esc(w.title) + "</h2>" + addBtn("mission", "과제 추가", w.no, "a-btn-ghost a-btn-sm") + "</div>" +
          (w.missions.length ? '<ul class="a-items">' + w.missions.map((m, i) => '<li><div class="a-item-main"><b>' + esc(m.title) + "</b><small>" + esc(m.desc || "") + "</small></div>" + (m.required ? pill("필수", "dark") : pill("선택", "mute")) + pill(typeL[m.type] || m.type, "mute") + rowTools("mission", m.id, w.no, i, w.missions.length) + "</li>").join("") + "</ul>" : '<p class="a-muted a-pad">아직 과제가 없어요.</p>') +
        "</section>").join("") + "</div>"
        : '<section class="a-card">' + emptyBox("clipboard", "커리큘럼에서 주차를 먼저 만들어 주세요.", '<a class="a-btn a-btn-primary" href="#/center/curriculum">커리큘럼으로</a>') + "</section>");
  }
  function pageSchedule() {
    const iid = IID(), c = C();
    const cos = DB.cohortsOf(iid);
    if (!ui.schedCohort || !DB.cohort(ui.schedCohort)) ui.schedCohort = (DB.currentCohort(iid) || {}).id;
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
      '<section class="a-card">' + (list.length ? '<ul class="a-items">' + list.map((n) => '<li><div class="a-item-main"><b>' + esc(n.title) + "</b><small>" + fmtFull(n.date) + " · " + esc((n.body || "").slice(0, 60)) + "</small></div>" + (n.pinned ? pill("필독", "dark") : "") +
        '<div class="a-row-actions">' + btn(icon("pen", "sm") + "수정", "item-edit", "a-btn-ghost a-btn-sm", ' data-coll="notice" data-id="' + n.id + '"') + "</div></li>").join("") + "</ul>" : emptyBox("megaphone", "아직 공지가 없어요.")) + "</section>";
  }
  function pageFaq() {
    return head("Q&A 자주 묻는 질문", "수강생 Q&A 메뉴에 보이고, AI봇도 이 답변을 바탕으로 대답해요.", addBtn("faq", "질문 추가")) +
      '<section class="a-card">' + simpleList("faq", C().faqs, (f) => '<div class="a-item-main"><b>Q. ' + esc(f.q) + "</b><small>" + esc(f.a) + "</small></div>", "자주 묻는 질문이 없어요.") + "</section>" +
      '<p class="a-hint">' + icon("sparkles", "xs") + " 수강생 개별 문의는 ‘문의 답변’ 메뉴에서 답해 주세요.</p>";
  }
  function pageDocs() {
    return head("서류 준비 가이드", "판매 시작 전에 필요한 서류를 단계별로 안내해요. 순서는 화살표로 바꿀 수 있어요.", addBtn("doc", "단계 추가")) +
      '<section class="a-card">' + simpleList("doc", C().docsGuide, (g) => '<div class="a-item-main"><b>' + esc(g.title) + "</b><small>" + esc([g.where, g.time, g.cost].filter(Boolean).join(" · ")) + "</small></div>", "서류 단계가 없어요.") + "</section>";
  }
  function pageLibrary() {
    const c = C();
    const tabs = [["ebook", "전자책 · 가이드북"], ["file", "자료 파일"], ["vod", "이커머스 실전 VOD"], ["senior", "시니어 기초 가이드"]];
    const k = ui.libTab;
    const items = c.resources[k];
    const isVideo = k === "vod" || k === "senior";
    return head("유료강의 자료실", "수강생 자료실 4개 분류에 자료와 영상을 올려요. 파일은 구글 드라이브 같은 공유 링크로 연결해요.", addBtn("res-" + k, isVideo ? "영상 추가" : "자료 추가")) +
      '<section class="a-card"><div class="a-toolbar"><div class="a-tabs">' + tabs.map((t) => '<button type="button" class="a-tab' + (k === t[0] ? " on" : "") + '" data-action="lib-tab" data-k="' + t[0] + '">' + t[1] + ' <span class="num">' + c.resources[t[0]].length + "</span></button>").join("") + "</div></div>" +
        simpleList("res-" + k, items, (it) => '<div class="a-item-main"><b>' + esc(it.title) + "</b><small>" + esc([it.meta, it.desc].filter(Boolean).join(" · ")) + "</small></div>" + (it.tool ? pill("계산기", "info") : isVideo ? ytBadge(it) : it.url ? pill("링크 연결됨", "ok") : pill("준비 중", "mute")), "아직 자료가 없어요.") + "</section>";
  }
  function pageMotivation() {
    return head("동기부여", "맨 위 영상이 수강생 홈의 ‘오늘의 동기부여’로 보여요. 한마디 문구는 기본 정보에서 고쳐요.", addBtn("mv", "영상 추가")) +
      '<section class="a-card">' + simpleList("mv", C().motivation, (it) => '<div class="a-item-main"><b>' + esc(it.title) + "</b><small>" + esc([it.minutes, it.date ? fmtMD(it.date) : ""].filter(Boolean).join(" · ")) + "</small></div>" + ytBadge(it), "동기부여 영상이 없어요.") + "</section>";
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
      "</div>" + insTable();
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
            btn("강사센터 접속", "ins-enter", "a-btn-primary a-btn-sm", ' data-id="' + x.id + '"') + btn("수정", "ins-edit", "a-btn-ghost a-btn-sm", ' data-id="' + x.id + '"') + "</div></td></tr>";
        }).join("") + "</tbody></table></div>" : emptyBox("store", "강사 플랫폼이 없어요.")) + "</section>";
  }
  function pageMasterInstructors() {
    return head("강사 플랫폼 관리", "새 강사에게 플랫폼을 만들어 주면 기본 메뉴와 예시 커리큘럼이 들어간 상태로 시작해요. 강사는 이름 + 전화번호 뒷자리로 강사센터에 로그인해요.", btn(icon("plus", "sm") + "새 강사 플랫폼", "ins-add", "a-btn-primary")) + insTable();
  }
  function pageMasterStudents() {
    const ins = DB.data.instructors;
    const list = DB.data.students.filter((s) => (ui.mIns === "all" || s.instructorId === ui.mIns) && (ui.mStatus === "all" || s.status === ui.mStatus));
    return head("전체 수강생", "모든 강사 플랫폼의 수강생이에요. 승인·탈퇴는 각 강사센터에서 해요.") +
      '<section class="a-card"><div class="a-toolbar"><div class="a-filters">' +
        '<select class="a-input a-sm" id="m-ins" aria-label="강사"><option value="all">전체 강사</option>' + ins.map((x) => '<option value="' + x.id + '"' + (ui.mIns === x.id ? " selected" : "") + ">" + esc(x.displayName) + "</option>").join("") + "</select>" +
        '<select class="a-input a-sm" id="m-status" aria-label="상태"><option value="all">전체 상태</option>' + Object.keys(STU).map((k) => '<option value="' + k + '"' + (ui.mStatus === k ? " selected" : "") + ">" + STU[k].label + "</option>").join("") + "</select>" +
      '</div><span class="a-muted">' + list.length + "명</span></div>" +
      (list.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>이름</th><th>강사</th><th>기수</th><th>신청일</th><th>상태</th></tr></thead><tbody>' +
        list.map((s) => { const x = DB.instructor(s.instructorId); return "<tr><td><b>" + esc(s.name) + '</b> <span class="a-muted num">' + esc(s.phone4) + "</span></td><td>" + esc(x ? x.displayName : "-") + "</td><td>" + esc(cohortName(s.cohortId)) + '</td><td class="num">' + (s.appliedAt ? fmtMD(s.appliedAt) : "-") + "</td><td>" + pill(STU[s.status].label, STU[s.status].cls) + "</td></tr>"; }).join("") +
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
        '<div class="a-field"><label for="if-display">수강생에게 보이는 이름</label><input class="a-input" id="if-display" name="displayName" value="' + esc(x.displayName) + '" placeholder="예: 로직메이커 황금농부"><small class="a-muted">수강생 로그인 화면의 강사 선택 목록에 보여요.</small></div>' +
        (isNew ? '<div class="a-field"><label for="if-course">강의 이름</label><input class="a-input" id="if-course" name="courseTitle" placeholder="예: 황금농부와 함께하는 스마트스토어 실전 클래스"></div>' +
          '<div class="a-field"><label for="if-start">1기 1주차 시작일</label><input class="a-input" id="if-start" name="startDate" type="date" value="' + addDays(todayStr(), 14) + '"></div>'
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
    DB.data.content[nid] = DB.normalizeContent(DB.template({ name: displayName, instructor: displayName, courseTitle: f.courseTitle.value.trim() || displayName + " 실전 클래스" }));
    DB.data.cohorts.push({ id: DB.uid("c"), instructorId: nid, name: "1기", startDate: f.startDate.value || addDays(todayStr(), 14), recruiting: true });
    commit(displayName + " 플랫폼을 만들었어요. 강사 로그인: " + name + " / " + phone4);
  }

  /* ---------------- 렌더 ---------------- */
  const PAGES = { "": pageDashboard, students: pageStudents, cohorts: pageCohorts, reviews: pageReviews, questions: pageQuestions, brand: pageBrand, curriculum: pageCurriculum, missions: pageMissions, schedule: pageSchedule, notices: pageNotices, faq: pageFaq, docs: pageDocs, library: pageLibrary, motivation: pageMotivation };
  const MPAGES = { "": pageMasterHome, instructors: pageMasterInstructors, students: pageMasterStudents };
  function render() {
    closeModal();
    const r = route();
    S = DB.session.admin();
    if (S && S.role === "instructor" && !(DB.instructor(S.instructorId) || {}).status) S = null;
    if (S && S.actingAs && !DB.instructor(S.actingAs)) { S.actingAs = null; DB.session.setAdmin(S); }
    if (!S) {
      if (r.parts[0] !== "login") history.replaceState(null, "", "#/center/login");
      renderLogin();
      return;
    }
    if (r.parts[0] === "login") { history.replaceState(null, "", S.role === "master" && !S.actingAs ? "#/center/master" : "#/center"); return render(); }
    const master = S.role === "master" && !S.actingAs;
    if (master && r.parts[0] !== "master") { history.replaceState(null, "", "#/center/master"); return render(); }
    if (!master && r.parts[0] === "master") { history.replaceState(null, "", "#/center"); return render(); }
    renderShell(r);
    const main = document.getElementById("a-main");
    const fn = master ? (MPAGES[r.parts[1] || ""] || pageMasterHome) : (PAGES[r.parts[0] || ""] || pageDashboard);
    main.innerHTML = '<div class="a-page">' + fn(r) + "</div>";
    document.title = (master ? "마스터" : "강사센터") + " · 두고 클래스";
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
      case "login-tab": loginTab = d.tab; renderLogin(); break;
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
      case "rev-tab": ui.revFilter = d.k; render(); break;
      case "review-open": e.stopPropagation(); reviewModal(d.sid, d.mid); break;
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
    const forms = { "a-login-form": doLogin, "student-form": saveStudent, "cohort-form": saveCohort, "coll-form": saveItem, "brand-form": saveBrand, "ins-form": saveIns };
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
    else if (t.id === "rev-cohort") { ui.revCohort = t.value; render(); }
    else if (t.id === "rev-week") { ui.revWeek = t.value; render(); }
    else if (t.id === "sched-cohort") { ui.schedCohort = t.value; render(); }
    else if (t.id === "m-ins") { ui.mIns = t.value; render(); }
    else if (t.id === "m-status") { ui.mStatus = t.value; render(); }
    else if (t.classList.contains("stu-pick")) { if (t.checked) ui.picked.add(t.dataset.id); else ui.picked.delete(t.dataset.id); render(); }
    else if (t.id === "stu-all") {
      const ids = Array.from(document.querySelectorAll(".stu-pick")).map((x) => x.dataset.id);
      ids.forEach((id) => (t.checked ? ui.picked.add(id) : ui.picked.delete(id)));
      render();
    }
    else if (t.closest && t.closest("#coll-form")) applyShowIf();
  });
  let qTimer = null;
  document.addEventListener("input", (e) => {
    if (!isActive()) return;
    const t = e.target;
    if (t.id === "stu-q") {
      ui.stuQuery = t.value;
      clearTimeout(qTimer);
      qTimer = setTimeout(() => { render(); const el = document.getElementById("stu-q"); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 250);
    }
    if (t.id === "cf-start") { const p = document.getElementById("cf-preview"); if (p) p.innerHTML = weekPreview(t.value); }
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
