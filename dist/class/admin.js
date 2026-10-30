/* 두잉고 — 강사센터 · 마스터 관리자
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

  let S = null; // 관리자 세션 { role: "instructor"|"coach"|"master", instructorId?, coachId?, actingAs? }
  let loginTab = "instructor";
  let coachPick = null; // 코치 로그인 중 강의 고르기 { id, pw, tab, name, courses }
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
    const h = (ROUTE.hash || "").replace(/^#\/?center\/?/, "");
    const [path, query] = h.split("?");
    return { parts: path.split("/").filter(Boolean), params: new URLSearchParams(query || "") };
  }
  const IID = () => (S.role === "instructor" || S.role === "coach" ? S.instructorId : S.actingAs);
  // 코치가 볼 수 있는 강사센터 메뉴 (강사가 ‘코치 관리’에서 고른다). 대시보드와 수강생 화면 미리보기는 늘 열려 있다
  const COACH_PERMS = [
    ["운영", [["vod-students", "VOD 수강생", "VOD 구매자 진도 · 두잉고 입장 (VOD 버전)"], ["students", "수강생 관리", "승인 · 기수 이동 · 탈퇴"], ["cohorts", "기수 관리", "기수 만들기 · 일정"], ["reviews", "과제 검수", "과제 피드백 · 승인 · 보완 요청"], ["questions", "1:1 요청 답변", "수강생 1:1 요청 · 오류 신고 답변"], ["coaching", "1:1 코칭 답변", "VOD 수강생 1:1 코칭 질문 답변 (코칭권)"], ["teatime", "TEA TIME 신청", "VOD 수강생 TEA TIME 일정 확정"]]],
    ["수강생 화면 콘텐츠", [["vodlessons", "VOD 강의 · 수업 자료 (비메오 링크 · PDF)"], ["brand", "기본 정보 · 색상 · AI 조교"], ["menus", "메뉴 구성"], ["guide", "시작 가이드 · 빠른 이동"], ["curriculum", "주차별 강의 (커리큘럼)"], ["replays", "라이브 다시보기"], ["missions", "과제 · 미션"], ["showcase", "모범 과제"], ["notes", "학습 노트 질문"], ["schedule", "수업 캘린더"], ["notices", "클래스 소식 (공지)"], ["faq", "FAQ · 자주 묻는 질문"], ["docs", "실무 체크리스트"], ["glossary", "용어 사전"], ["library", "강의 자료함"], ["motivation", "응원 영상"], ["channels", "1:1 상담 채널"], ["partners", "제휴 혜택"], ["pages", "추가 메뉴"]]],
    ["홍보", [["free", "무료강의 페이지"], ["landing", "강의 소개 페이지"]]]
  ];
  const COACH_DEFAULT = ["reviews", "questions"];
  const isCoach = () => !!S && S.role === "coach";
  const ME_COACH = () => (isCoach() ? DB.coach(S.instructorId, S.coachId) : null);
  /** 지금 계정이 이 메뉴(강사센터 경로 첫 칸)를 볼 수 있는지 */
  const can = (key) => { if (!isCoach()) return true; if (!key || key === "ops-notices") return true; if (key === "coaches" || key === "contract") return false; const c = ME_COACH(); return !!c && (c.perms || []).indexOf(key) !== -1; };
  /** 검수 · 답변 기록에 남길 처리자 */
  const actor = () => { if (isCoach()) { const c = ME_COACH(); return { by: (c ? c.name : "코치") + " 코치", byId: S.coachId, role: "coach" }; } if (S && S.role === "master" && !S.actingAs) { const st = staffMe(); return { by: st ? st.name + " (운영팀)" : "두잉고 운영팀", byId: st ? st.id : "master", role: "master" }; } const i = INS(); return { by: (i ? i.name : "") + " 강사", byId: IID(), role: S.role === "master" ? "master" : "instructor" }; };
  const INS = () => DB.instructor(IID());
  /* 두잉고 버전: 강사센터에서 LIVE · 오프라인(기수 · 주차 · 과제) / VOD(DOOGO CLASS에서 VOD를 산 수강생)를 따로 세팅한다
   * VOD 버전이면 C()는 content.vod 를 고치고(기본 정보 · 색상은 함께), 메뉴는 "강사ID@vod" 메뉴를 고친다 */
  const TRK_KEY = "doinggo:center-track";
  const VOD_COACH = ["vod-students", "coaching", "teatime", "vodlessons"];
  const trackable = () => !!S && S.role !== "partner" && !(S.role === "master" && !S.actingAs) && (S.role !== "coach" || VOD_COACH.some((k) => can(k)));
  const trkKey = () => TRK_KEY + ":" + (S ? (S.coachId || S.role) + "@" + (IID() || "") : "");
  const TRK = () => { const k = trkKey(); if (ui.track == null || ui.trackKey !== k) { ui.trackKey = k; try { ui.track = sessionStorage.getItem(k) === "vod" ? "vod" : "live"; } catch (e) { ui.track = "live"; } } return trackable() && ui.track === "vod" ? "vod" : "live"; };
  // v15: VOD 버전은 VOD 상품마다 두잉고 강의실이 따로 — 지금 꾸미는 강의실(상품)을 고르면 메뉴 · 콘텐츠가 그 VOD 것으로 바뀌어요
  const vodProds = () => (window.VOD ? window.VOD.V().products.filter((p) => p.iid === IID() && window.VOD.typeOf(p) === "vod") : []);
  const VPK = () => "doinggo:center-vpid:" + IID();
  const VPID = () => {
    if (TRK() !== "vod") return "";
    const ps = vodProds(); if (!ps.length) return "";
    if (ui.vpidFor !== IID()) { ui.vpidFor = IID(); try { ui.vpid = sessionStorage.getItem(VPK()) || ""; } catch (e) { ui.vpid = ""; } }
    if (!ps.some((p) => p.id === ui.vpid)) ui.vpid = ps[0].id;
    return ui.vpid;
  };
  const setVpid = (pid) => { ui.vpid = pid; ui.vpidFor = IID(); try { sessionStorage.setItem(VPK(), pid); } catch (e) { /* 저장 못 해도 이번 화면에서는 바뀐다 */ } };
  const MID = () => IID() + (TRK() === "vod" ? "@vod" + (VPID() ? ":" + VPID() : "") : "");
  const LIVE_ONLY_PAGES = ["students", "cohorts", "billing", "reviews", "curriculum", "replays", "missions", "showcase", "notes", "schedule", "free", "landing"];
  const VOD_ONLY_PAGES = ["vod-students", "vodlink", "vodlessons", "coaching", "teatime"];
  const VOD_NAV_LABEL = { notices: "업데이트 소식", docs: "실습 체크리스트", faq: "FAQ · 자주 묻는 질문" };
  const C = () => (TRK() === "vod" ? DB.vodContent(IID(), VPID()) : DB.content(IID()));
  // 강의실 콘텐츠를 고치는 화면 (위에 ‘지금 꾸미는 VOD 강의실’ 띠를 보여 줘요)
  const VP_PAGES = ["menus", "guide", "notices", "faq", "docs", "glossary", "library", "motivation", "channels", "partners", "pages"];
  const vpOpts = (cur) => vodProds().map((p) => '<option value="' + esc(p.id) + '"' + (p.id === cur ? " selected" : "") + ">" + esc(p.title) + "</option>").join("");
  function vpidPick() {
    const ps = vodProds(); if (!ps.length) return "";
    return '<label class="a-vpid"><small>꾸미는 강의실 · VOD ' + ps.length + '개</small><select id="a-vpid">' + vpOpts(VPID()) + "</select></label>";
  }
  function vpidStrip() {
    const ps = vodProds(), p = ps.find((x) => x.id === VPID()); if (!p) return "";
    return '<div class="a-vpbar">' + vdThumb(p, "sm") + '<div class="a-vpbar-t"><small>지금 꾸미는 VOD 강의실' + (ps.length > 1 ? " · " + ps.length + "개 중" : "") + "</small><b>" + esc(p.title) + "</b><span>여기서 바꾼 메뉴 · 자료 · FAQ · 소식 · 체크리스트는 이 VOD를 산 수강생에게만 보여요.</span></div>" +
      (ps.length > 1 ? '<label class="a-vpbar-sel"><span>다른 강의실</span><select id="a-vpid2">' + vpOpts(p.id) + "</select></label>" : "") + "</div>";
  }
  // 커리큘럼 편집 화면에서 지금 고른 커리큘럼 (기본: 기본 커리큘럼)
  const CUR = () => { const cu = DB.curriculum(IID(), ui.curId); ui.curId = cu ? cu.id : "main"; return cu; };
  const usedBy = (curId) => DB.cohortsOf(IID()).filter((co) => (co.curriculumId || "main") === curId);
  const classText = (co) => (co.classDow !== undefined && co.classDow !== null && co.classDow !== "" ? "매주 " + DOW[Number(co.classDow)] + "요일" : "주차 시작일") + (co.classTime ? " " + co.classTime : "");
  /** 받침에 맞는 조사: josa("공지", "을", "를") → "공지를" · josa("상담 중", "으로", "로") → "상담 중으로" */
  const josa = (w, withB, noB) => { const t = String(w == null ? "" : w), c = t.charCodeAt(t.length - 1); if (!(c >= 0xac00 && c <= 0xd7a3)) return t + noB; const jong = (c - 0xac00) % 28; return t + (jong === 0 || (withB === "으로" && jong === 8) ? noB : withB); };
  const pill = (label, cls) => '<span class="a-pill ' + cls + '">' + esc(label) + "</span>";
  const btn = (label, action, cls, attrs) => '<button type="button" class="a-btn ' + (cls || "a-btn-ghost") + '" data-action="' + action + '"' + (attrs || "") + ">" + label + "</button>";
  const head = (title, sub, right) => '<header class="a-head"><div><h1>' + esc(title) + "</h1>" + (sub ? "<p>" + sub + "</p>" : "") + "</div>" + (right ? '<div class="a-head-actions">' + right + "</div>" : "") + "</header>";
  const emptyBox = (ic, text, extra) => '<div class="a-empty">' + icon(ic) + "<p>" + text + "</p>" + (extra || "") + "</div>";
  function toast(msg, kind) {
    const t = document.createElement("div");
    t.className = "toast a-toast" + (kind === "warn" ? " warn" : "");
    t.innerHTML = icon(kind === "warn" ? "alert" : "check", "sm") + "<span>" + esc(msg) + "</span>";
    toastRoot.appendChild(t);
    // 한꺼번에 여러 개가 쌓여 화면을 가리지 않게: 최근 2개만 (휴대폰은 1개)
    const max = window.innerWidth < 720 ? 1 : 2, all = toastRoot.querySelectorAll(".toast");
    for (let i = 0; i < all.length - max; i++) all[i].remove();
    setTimeout(() => t.remove(), /🔔/.test(msg) ? 4200 : 2600);
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
  const commit = (msg) => { if (msg) actLog(msg); DB.save(); closeModal(); render(); if (msg) toast(msg); };

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
      questions: DB.requests(iid).filter((x) => !x.q.answer && !DB.isVodStudent(x.s)).length,
      coaching: DB.requests(iid).filter((x) => !x.q.answer && DB.isVodStudent(x.s)).length
    };
  }

  /* ---------------- 로그인 ---------------- */
  function renderLogin() {
    const coachTab = loginTab === "coach", ins = loginTab === "instructor" || coachTab, partnerTab = loginTab === "partner";
    document.title = (coachTab ? "코치센터" : ins ? "강사센터" : partnerTab ? "파트너센터" : "마스터 관리자") + " · 로그인";
    const L = partnerTab
      ? { theme: "red", tag: "파트너센터", eyebrow: "DOINGGO PARTNERS", h: "소개한 강사님의 기수가<br><em>내 수익</em>이 되는 곳", sub: "강사님을 두잉고에 소개하면, 강사님이 기수를 열 때마다 이용료의 RS가 파트너님 수익으로 쌓여요. 수익 · 지급일을 한눈에 확인하세요.", icons: ["handshake", "coins", "users", "award"], label: "PARTNER", title: "파트너 로그인", lead: "두잉고에서 받은 아이디와 비밀번호로 로그인하세요." }
      : coachTab
      ? { theme: "green", tag: "코치", eyebrow: "DOINGGO COACH WORKSPACE", h: "과제 피드백과<br><em>1:1 문의</em>를 한 곳에서", sub: "강사님이 맡긴 메뉴에서 수강생 과제를 검수하고, 문의에 답하고, 진행 상황을 챙길 수 있습니다.", icons: ["checks", "message", "users", "award"], label: "COACH", title: "코치 로그인", lead: "강사님이 등록해 준 이름과 전화번호 뒷자리로 로그인하세요." }
      : ins
      ? { theme: "red", tag: "강사센터", eyebrow: "DOINGGO INSTRUCTOR CENTER", h: "수강생 관리부터<br><em>커리큘럼까지</em> 한 곳에서", sub: "기수별 수강생 승인, 과제 검수, 강의 영상과 일정 업로드를 간편하게 운영할 수 있습니다.", icons: ["users", "play", "calendar", "settings"], label: "INSTRUCTOR", title: "강사 로그인", lead: "강사 이름과 전화번호 뒷자리로 로그인하세요." }
      : { theme: "dark", tag: "마스터", eyebrow: "DOINGGO MASTER CONSOLE", h: "강사 플랫폼을<br><em>분양하고 관리</em>하세요", sub: "새 강사 플랫폼 개설, 운영 중지, 강사센터 대신 접속과 전체 수강생 현황을 한 곳에서 봅니다.", icons: ["store", "layers", "users", "shieldCheck"], label: "MASTER", title: "마스터 · 파트너 로그인", lead: "관리자 계정 또는 두잉고에서 받은 파트너 계정으로 로그인하세요." };
    root.innerHTML =
      '<main class="adm a-login a-login-' + L.theme + '">' +
        '<section class="a-login-brand">' + window.loginArt(L.theme, L.icons) +
          '<a class="a-logo a-logo-doogo" href="#/doinggo" title="두잉고 홈으로" aria-label="두잉고 홈으로">' + window.doogoClassLock() + "<em>" + L.tag + "</em></a>" +
          '<div class="a-login-hero"><p class="a-eyebrow">' + L.eyebrow + "</p><h2>" + L.h + "</h2><p>" + L.sub + "</p></div>" +
          // 왼쪽 아래: 두잉고 첫 화면(강의 플랫폼 소개)으로 가는 링크
          '<div class="a-login-foot"><a class="a-login-home" href="#/doinggo">' + icon("home", "sm") + "두잉고 페이지 바로가기" + icon("arrowRight", "xs") + "</a><span>© 2026 (주)두고홀딩스</span></div>" +
        "</section>" +
        '<section class="a-login-panel">' +
          '<div class="a-login-topright"><span>수강생이신가요?</span><a class="a-btn a-btn-primary a-btn-sm" href="#/login" data-action="to-student">바로가기</a></div>' +
          '<div class="a-login-stack"><div class="a-login-card">' +
            '<p class="a-login-label"><a class="a-login-home-logo" href="#/doinggo" title="두잉고 홈으로" aria-label="두잉고 홈으로">' + window.doogoClassLock() + '</a><em class="a-login-role">' + L.label + "</em></p>" +
            "<h1>" + L.title + '</h1><p class="a-muted a-center">' + L.lead + "</p>" +
            '<div class="a-seg" role="tablist">' +
              '<button type="button" role="tab" aria-selected="' + (ins && !coachTab) + '" class="' + (ins && !coachTab ? "on" : "") + '" data-action="login-tab" data-tab="instructor">' + icon("user", "sm") + "강사</button>" +
              '<button type="button" role="tab" aria-selected="' + coachTab + '" class="' + (coachTab ? "on" : "") + '" data-action="login-tab" data-tab="coach">' + icon("checks", "sm") + "코치</button>" +
              '<button type="button" role="tab" aria-selected="' + !ins + '" class="' + (!ins ? "on" : "") + '" data-action="login-tab" data-tab="master">' + icon("shieldCheck", "sm") + "마스터 · 파트너</button>" +
            "</div>" +
            '<form id="a-login-form" class="a-form" novalidate>' +
              '<div class="a-field"><label for="al-id">' + (coachTab ? "코치 이름" : ins ? "강사 이름" : "아이디") + '</label><div class="a-input-icon">' + icon("user", "sm") + '<input class="a-input" id="al-id" name="uid" autocomplete="' + (ins ? "name" : "username") + '" placeholder="' + (coachTab ? "예: 김하나" : ins ? "예: 문원오" : partnerTab ? "예: partner" : "관리자 · 파트너 아이디") + '"></div></div>' +
              '<div class="a-field"><label for="al-pw">' + (ins ? "전화번호 뒷자리" : "비밀번호") + '</label><div class="a-input-icon">' + icon("lock", "sm") + '<input class="a-input" id="al-pw" name="pw" type="password"' + (ins ? ' inputmode="numeric" maxlength="4" placeholder="숫자 4자리"' : partnerTab ? ' inputmode="numeric" maxlength="8" autocomplete="current-password" placeholder="숫자 비밀번호"' : ' autocomplete="current-password" placeholder="비밀번호"') + '>' +
                '<button type="button" class="a-eye" data-action="toggle-pw" aria-label="보기">' + icon("eye", "sm") + "</button></div>" +
                '<small class="a-field-note">' + (ins ? "휴대폰 번호 뒷자리 4자리" : partnerTab ? "" : "") + "</small></div>" +
              '<p class="a-error" id="al-error" role="alert"></p>' +
              '<button class="a-btn a-btn-primary a-btn-lg a-btn-block" type="submit">로그인</button>' +
              '<p class="a-login-help">' + (coachTab ? "강사센터 ‘코치 관리’에 등록된 정보로 로그인해 주세요" : ins ? "마스터에서 등록한 강사 정보로 로그인해 주세요" : partnerTab ? "" : "") + "</p>" +
            "</form>" +
          "</div>" +
          '<a class="a-login-alt" href="#/login" data-action="to-student">' + icon("home", "sm") + "수강생 센터 보기 " + icon("arrowUpRight", "xs") + "</a>" +
          "" +
        "</div></section>" +
      "</main>";
  }
  function doLogin(f) {
    const id = f.uid.value.trim(), pw = f.pw.value.trim();
    const err = document.getElementById("al-error");
    err.textContent = "";
    // 파트너: ‘마스터 · 파트너’ 탭에서 아이디 + 비밀번호
    // 정식 서버에서는 파트너 · 운영자 계정도 서버가 확인해요 (이 브라우저에는 계정 목록이 없어요)
    if (!DB.remote.on && (loginTab === "partner" || (loginTab === "master" && id.toUpperCase() !== "ADMIN"))) {
      const pp = findPartnerLogin(id, pw);
      if (pp) { partnerSignIn(pp, err); return; }
      if (loginTab === "partner") { err.textContent = "등록된 파트너 정보와 일치하지 않아요. 아이디와 비밀번호를 확인해 주세요."; return; }
    }
    if (DB.remote.on) { serverLogin(f, id, pw, err); return; }
    if (loginTab === "master") {
      const stf = id.toUpperCase() !== "ADMIN" ? findStaffLogin(id, pw) : null;
      if (stf) { if (stf.status !== "active") { err.textContent = "사용이 중지된 운영자 계정이에요. 최고 관리자에게 문의해 주세요."; return; } S = { role: "master", staffId: stf.id }; DB.session.setAdmin(S); DB.store.remove("moonclass:after-login"); stf.lastLoginAt = Date.now(); actLog("로그인"); DB.save(); ROUTE.hash = "#/center/master"; toast(stf.name + " 님, 환영합니다! (" + staffRoleName(stf) + ")"); return; }
      if (id.toUpperCase() === "ADMIN" && pw.toUpperCase() === "ADMIN") { S = { role: "master" }; DB.session.setAdmin(S); DB.store.remove("moonclass:after-login"); ROUTE.hash = "#/center/master"; toast("마스터 관리자로 로그인했어요."); }
      else err.textContent = "아이디 또는 비밀번호가 맞지 않아요.";
      return;
    }
    // 코치: 같은 이름 + 뒷자리로 여러 강사님 강의를 맡았으면 고르게 해요
    const coachLogin = () => {
      const hits = DB.findCoachLogins(id, pw), live = hits.filter((h) => h.coach.status === "active");
      if (!hits.length) return false;
      if (!live.length) { err.textContent = "사용이 중지된 코치 계정이에요. 강사님께 문의해 주세요."; return true; }
      if (live.length > 1) { coachPick = { id, pw, tab: loginTab, name: live[0].coach.name, courses: coachCoursesLocal(id, pw) }; coachPickModal(coachPick.courses, "", coachPick.name); return true; }
      coachIn(live[0].ins, live[0].coach);
      return true;
    };
    const ins = DB.data.instructors.find((x) => x.name.replace(/\s+/g, "") === id.replace(/\s+/g, "") && x.phone4 === pw);
    // 코치 탭에서 강사 정보를 넣으면 강사로, 강사 탭에서 코치 정보를 넣으면 코치로 들어간다
    if (loginTab === "coach") {
      if (coachLogin()) return;
      if (!ins) { err.textContent = "등록된 코치 정보와 일치하지 않아요. 이름과 뒷자리를 확인해 주세요."; return; }
    }
    if (!ins) { if (!coachLogin()) err.textContent = "등록된 강사 정보와 일치하지 않아요. 이름과 뒷자리를 확인해 주세요. (코치는 ‘코치’ 탭)"; return; }
    if (ins.status !== "active") { err.textContent = "운영이 중지된 플랫폼이에요. 마스터 관리자에게 문의해 주세요."; return; }
    S = { role: "instructor", instructorId: ins.id };
    DB.session.setAdmin(S);
    const next = DB.store.get("moonclass:after-login", ""); DB.store.remove("moonclass:after-login");
    ROUTE.hash = next && /^#\/center\/(?!master)/.test(next) ? next : "#/center";
    toast(ins.name + " 강사님, 환영합니다!");
  }
  // 서버 모드: 이름·뒷자리·마스터 비밀번호는 서버에서만 확인한다
  const LOGIN_ERR = {
    "paused-platform": "운영이 중지된 플랫폼이에요. 마스터 관리자에게 문의해 주세요.",
    "paused-coach": "사용이 중지된 코치 계정이에요. 강사님께 문의해 주세요.",
    locked: "여러 번 틀려서 잠시 로그인이 막혔어요. 15분 뒤에 다시 시도해 주세요.",
    "master-disabled": "마스터 비밀번호가 아직 설정되지 않았어요. Vercel 환경변수 MASTER_PASSWORD 를 설정해 주세요.",
    "paused-staff": "사용이 중지된 운영자 계정이에요. 최고 관리자에게 문의해 주세요.",
    "paused-partner": "사용이 중지된 파트너 계정이에요. 두잉고 담당자에게 문의해 주세요.",
    input: "이름과 전화번호 뒷자리 4자리를 확인해 주세요."
  };
  function serverLogin(f, id, pw, err, iid) {
    const btn = f && f.querySelector("button[type=submit]");
    if (btn) btn.disabled = true;
    DB.remote.login({ action: "admin", tab: loginTab, id, pw, iid: iid || undefined }).then((r) => {
      if (r.choose && Array.isArray(r.courses) && r.courses.length) { coachPick = { id, pw, tab: loginTab, name: r.name || "", courses: r.courses }; coachPickModal(r.courses, "", coachPick.name); return; }
      if (r.error) {
        err.textContent = LOGIN_ERR[r.error] || (loginTab === "master" ? "아이디 또는 비밀번호가 맞지 않아요." : loginTab === "partner" ? "등록된 파트너 정보와 일치하지 않아요. 아이디와 비밀번호를 확인해 주세요." : loginTab === "coach" ? "등록된 코치 정보와 일치하지 않아요. 이름과 뒷자리를 확인해 주세요." : "등록된 강사 정보와 일치하지 않아요. 이름과 뒷자리를 확인해 주세요. (코치는 ‘코치’ 탭)");
        return;
      }
      return DB.remote.refresh().then(() => {
        S = r.role === "master" ? (r.staffId ? { role: "master", staffId: r.staffId } : { role: "master" }) : r.role === "partner" ? { role: "partner", partnerId: r.pid } : r.role === "coach" ? Object.assign({ role: "coach", instructorId: r.iid, coachId: r.cid }, coachPick ? { courses: coachPick.courses } : {}) : { role: "instructor", instructorId: r.iid };
        const picked = r.role === "coach" && coachPick ? (coachPick.courses.find((x) => x.iid === r.iid) || {}).ins : "";
        coachPick = null;
        DB.session.setAdmin(S);
        const next = DB.store.get("moonclass:after-login", ""); DB.store.remove("moonclass:after-login");
        ROUTE.hash = r.role === "master" ? "#/center/master" : r.role === "partner" ? "#/center/partner" : r.role === "instructor" && next && /^#\/center\/(?!master)/.test(next) ? next : "#/center";
        toast(r.role === "master" ? (r.staffId ? r.name + "님, 운영자로 로그인했어요." : "마스터 관리자로 로그인했어요.") : r.role === "partner" ? r.name + " 파트너님, 환영합니다!" : r.name + (r.role === "coach" ? " 코치님, 환영합니다!" + (picked ? " · " + picked + " 강사님 강의" : "") : " 강사님, 환영합니다!"));
      });
    }).catch(() => { err.textContent = "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."; }).then(() => { if (btn) btn.disabled = false; });
  }
  /* ---------- 코치가 여러 강사님 강의를 맡았을 때: 로그인할 때 고르고, 코치센터에서 바꾸기 ---------- */
  // 같은 이름 + 뒷자리로 등록된 코치 자리 중 사용 중인 것 → 고르기 목록 (로컬 · 체험 모드)
  function coachCoursesLocal(name, phone4) {
    return DB.findCoachLogins(name, phone4).filter((h) => h.coach.status === "active").map((h) => {
      const b = Object.assign({}, h.ins.brand || {}, (DB.content(h.ins.id) || {}).brand || {}), ph = String(b.photo || "");
      return { iid: h.ins.id, ins: h.ins.displayName || h.ins.name, title: b.courseTitle || b.name || "", photo: /^(assets\/|https:\/\/)/.test(ph) ? ph : "", perms: (h.coach.perms || []).length };
    });
  }
  // 지금 코치가 맡은 강의 (서버: 로그인 · 확인 때 받은 목록 / 로컬: 바로 계산)
  function myCoachCourses() {
    if (!isCoach()) return [];
    if (!DB.remote.on) { const me = ME_COACH(); return me ? coachCoursesLocal(me.name, me.phone4) : []; }
    return Array.isArray(S.courses) ? S.courses : [];
  }
  let coachListAsked = false;
  // 서버 모드: 코치센터를 열 때 한 번 맡은 강의 목록을 다시 물어요 (그 사이 다른 강의 코치가 됐을 수도 있어서)
  function coachListCheck() {
    if (coachListAsked || !isCoach() || !DB.remote.on) return;
    coachListAsked = true;
    DB.remote.login({ action: "coachSwitch" }).then((r) => {
      if (!r || !r.ok || !Array.isArray(r.courses) || !isCoach()) return;
      const was = JSON.stringify(S.courses || []), now = JSON.stringify(r.courses);
      if (was === now) return;
      S.courses = r.courses; DB.session.setAdmin(S);
      if (!document.querySelector("#modal-root .a-modal")) render();
    }, () => {});
  }
  function coachPickModal(list, cur, name) {
    openModal(cur ? "다른 강의 코치센터로 옮기기" : "어느 강의 코치센터로 들어갈까요?",
      '<p class="a-muted cp-lead">' + (name ? "<b>" + esc(name) + "</b> 코치님은 " : "") + "<b>" + list.length + "개</b> 강의의 코치예요. " + (cur ? "옮겨 갈 강의를 골라 주세요." : "들어갈 강의를 골라 주세요. 들어간 뒤에도 위쪽 강사님 이름을 누르면 언제든 옮겨 갈 수 있어요.") + "</p>" +
      '<div class="cp-list">' + list.map((x) => {
        const on = x.iid === cur;
        return '<button type="button" class="cp-it' + (on ? " on" : "") + '" data-action="coach-go" data-iid="' + esc(x.iid) + '"' + (on ? " disabled" : "") + '><span class="cp-av' + (x.photo ? " ph" : "") + '">' + (x.photo ? '<img src="' + esc(x.photo) + '" alt="" decoding="async">' : esc(String(x.ins || "?").slice(0, 1))) + "</span>" +
          '<span class="cp-t"><b>' + esc(x.ins) + " 강사님</b><small>" + esc(x.title || "강의") + " · 맡은 메뉴 " + (Number(x.perms) || 0) + "개</small></span>" + (on ? pill("지금 여기", "ok") : icon("chevRight", "sm")) + "</button>";
      }).join("") + "</div>" + '<p class="a-error" id="cp-err" role="alert"></p>', "", "md");
  }
  function coachIn(ins, coach, many) {
    S = { role: "coach", instructorId: ins.id, coachId: coach.id };
    DB.session.setAdmin(S); DB.store.remove("moonclass:after-login");
    coach.lastLoginAt = Date.now(); DB.save(); coachPick = null;
    ROUTE.hash = "#/center"; render();
    toast(coach.name + " 코치님, 환영합니다!" + (many ? " · " + ins.displayName + " 강사님 강의" : ""));
  }
  // 강의 고르기 목록에서 하나를 누르면: 로그인 중이면 그 강의로 로그인, 코치센터 안이면 그 강의로 옮기기
  function coachGo(iid, el) {
    const err = document.getElementById("cp-err"), say = (m) => { if (err) err.textContent = m; if (el) el.disabled = false; };
    if (el) el.disabled = true;
    if (!S && coachPick) {
      if (!DB.remote.on) { const h = DB.findCoachLogins(coachPick.id, coachPick.pw).find((x) => x.ins.id === iid && x.coach.status === "active"); if (!h) return say("이 강의의 코치 자리가 멈췄거나 지워졌어요. 강사님께 문의해 주세요."); return coachIn(h.ins, h.coach, true); }
      loginTab = coachPick.tab;
      serverLogin(document.getElementById("a-login-form"), coachPick.id, coachPick.pw, err || document.getElementById("al-error"), iid);
      return;
    }
    if (!isCoach()) return;
    if (!DB.remote.on) {
      const me = ME_COACH(), h = me && DB.findCoachLogins(me.name, me.phone4).find((x) => x.ins.id === iid && x.coach.status === "active");
      if (!h) return say("이 강의의 코치 자리가 멈췄거나 지워졌어요. 강사님께 문의해 주세요.");
      S = { role: "coach", instructorId: h.ins.id, coachId: h.coach.id }; DB.session.setAdmin(S); h.coach.lastLoginAt = Date.now(); DB.save();
      ROUTE.hash = "#/center"; render(); toast(h.ins.displayName + " 강사님 강의 코치센터로 옮겼어요."); return;
    }
    DB.remote.login({ action: "coachSwitch", iid }).then((r) => {
      if (!r || !r.ok) return say("옮겨 가지 못했어요. 그 강의의 코치 자리가 멈췄거나 지워졌을 수 있어요.");
      // 새 강의 자료를 처음부터 다시 받도록 새로고침해요 (예전 강의 화면이 섞이지 않게)
      S = Object.assign({ role: "coach", instructorId: r.iid, coachId: r.cid }, S && S.courses ? { courses: S.courses } : {}); DB.session.setAdmin(S);
      ROUTE.replace("#/center"); location.reload();
    }, () => say("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."));
  }
  function coachSwitchOpen() {
    if (!isCoach()) return;
    const me = ME_COACH() || {};
    if (!DB.remote.on) { coachPickModal(myCoachCourses(), IID(), me.name); return; }
    DB.remote.login({ action: "coachSwitch" }).then((r) => {
      const list = r && r.ok && Array.isArray(r.courses) ? r.courses : myCoachCourses();
      if (r && r.ok) { S.courses = list; DB.session.setAdmin(S); }
      if (list.length < 2) { toast("지금은 이 강의 하나만 맡고 있어요.", "warn"); return; }
      coachPickModal(list, IID(), me.name);
    }, () => toast("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.", "warn"));
  }
  function logout() {
    S = null; DB.session.setAdmin(null); ROUTE.hash = "#/center/login";
    if (DB.remote.on) DB.remote.logout("admin").catch(() => {}).then(() => location.reload());
  }

  /* ---------------- 셸 ---------------- */
  function instructorNav() {
    const iid = IID(), n = counts(iid), vod = TRK() === "vod", on = (k) => DB.menuOn(MID(), k);
    const content = [
      ["brand", "기본 정보 · 색상 · AI 조교", "settings", null],
      ["menus", "메뉴 구성", "sliders", null],
      ["guide", "시작 가이드 · 빠른 이동", "sparkles", null],
      ["curriculum", "주차별 강의 (커리큘럼)", "book", "curriculum"],
      ["replays", "라이브 다시보기", "monitorPlay", "replays"],
      ["missions", "과제 · 미션", "clipboard", "missions"],
      ["showcase", "모범 과제", "trophy", "showcase"],
      ["notes", "학습 노트 질문", "notebookPen", "notes"],
      ["schedule", "수업 캘린더", "calendar", "schedule"],
      ["notices", "클래스 소식 (공지)", "megaphone", "notices"],
      ["faq", "FAQ · 자주 묻는 질문", "help", "qna"],
      ["docs", "실무 체크리스트", "file", "docs"],
      ["glossary", "용어 사전", "bookA", "glossary"],
      ["library", "강의 자료함", "library", "library"],
      ["motivation", "응원 영상", "flame", "motivation"],
      ["channels", "1:1 상담 채널", "headset", "channels"],
      ["partners", "제휴 혜택", "handshake", "partners"]
    ].filter((x) => !x[3] || on(x[3])).filter((x) => !vod || LIVE_ONLY_PAGES.indexOf(x[0]) < 0).map((x) => (vod && VOD_NAV_LABEL[x[0]] ? [x[0], VOD_NAV_LABEL[x[0]], x[2]] : x.slice(0, 3)));
    if (vod) content.splice(2, 0, ["vodlink", "VOD 강의 연결", "circlePlay"], ["vodlessons", "VOD 강의 · 수업 자료", "paperclip"]);
    if (customPages(MID()).length) content.push(["pages", "추가 메뉴", "star"]);
    const sales = isCoach() ? [] : [["DOOGO CLASS 판매", [["vod", "VOD 판매 내역", "monitorPlay"], ["vod-live", "무료 LIVE · 온/오프라인 판매", "calendar"], ["vod-settle", "판매 정산", "coins"], ["vod-cal", "정산 달력", "calendar"]]]];
    const groups = (vod ? [
      ["운영 · DOOGO CLASS", [["", "DOOGO CLASS 대시보드", "grid"], ["vod-students", "VOD 수강생", "users"], ["coaching", "1:1 코칭 답변", "message", n.coaching || ""], ["teatime", "TEA TIME 신청", "calendar", window.VOD ? window.VOD.teasOf(null, iid).filter((o) => o.status === "paid" && (o.tea || {}).st === "req").length || "" : ""]].concat(isCoach() ? [] : [["coaches", "코치 관리", "shieldCheck"]])],
      ["VOD 강의실 꾸미기", content]
    ] : [
      ["운영 · 두잉고", [
        ["", "두잉고 대시보드", "grid"],
        ["students", "수강생 관리", "users", n.pending],
        ["cohorts", "기수 관리", "layers"]
      ].concat(isCoach() ? [] : [["billing", "다음 기수 신청", "coins"]]).concat(on("missions") ? [["reviews", "과제 검수", "checks", n.review]] : []).concat(on("qna") ? [["questions", "1:1 요청 답변", "bug", n.questions]] : []).concat(isCoach() ? [] : [["coaches", "코치 관리", "shieldCheck"]])],
      ["수강생 화면 콘텐츠", content],
      ["홍보", [["free", "무료강의 페이지", "video"], ["landing", "강의 소개 페이지", "store"]]]
    ]).concat(vod ? sales : []).concat([["두잉고 운영팀", [["ops-notices", "운영팀 공지", "megaphone", annUnread(iid) || ""], ["contract", "계약 · 서류", "file", insDocMissing(iid) || ""]]]]);
    // 코치는 강사가 열어 준 메뉴만
    return groups.map((g) => [g[0], g[1].filter((it) => can(it[0]))]).filter((g) => g[1].length);
  }
  const customPages = (iid) => DB.menuConfig(iid).items.filter((x) => DB.isCustom(x.key) && x.type !== "link");
  const allRequests = () => DB.data.instructors.flatMap((ins) => DB.requests(ins.id).filter((x) => !DB.isVodStudent(x.s)).map((x) => Object.assign({ ins }, x))).sort((a, b) => b.q.at - a.q.at);
  const masterNavRaw = () => [
    ["운영", [["master", "대시보드", "grid"], ["master/billing", "기수 신청 · 매출", "coins", DB.bills().filter((b) => DB.billState(b) === "requested").length], ["master/rs", "파트너스 관리", "link", (() => { let n = 0; affList().forEach((p) => affMonths(p).forEach((g) => { if (!g.po && todayStr() >= g.payDate) n++; })); return n; })()], ["master/instructors", "강사 플랫폼 관리", "store"], ["master/contracts", "강사 계약 · 서류", "file", contractAlerts() || ""], ["master/menus", "메뉴 · 색상 설정", "sliders"], ["master/site", "첫 화면 · 사업자 정보", "building"]]],
    ["학사 관리", [["master/plan", "기수 · 일정 설계", "layers"], ["master/calendar", "전체 기수 일정", "calendar"], ["master/health", "플랫폼 현황", "activity"], ["master/sla", "과제 검수 · 응답", "clock", slaRows().reduce((a, r) => a + r.late.length, 0) || ""], ["master/certs", "수료 관리", "award"], ["master/students", "전체 수강생", "users"]]],
    ["지원", [["master/partners", "강사 입점 문의", "handshake", (() => { const a = masterInqAlerts(); return a.inq + a.msg || ""; })()], ["master/reports", "오류 신고 모아보기", "bug", allRequests().filter((x) => !x.q.answer).length], ["master/notices", "강사 공지", "megaphone"]]],
    ["시스템", [["master/staff", "운영자 · 활동 기록", "shieldCheck"], ["master/data", "데이터 관리", "database"]]]
  ];
  /* 마스터 관리 영역: 두잉고(강사 플랫폼 · 기수 운영) / DOOGO CLASS(VOD 스토어 · 회원 · 주문) — 왼쪽 위 탭으로 오가요 */
  const DC_ROUTES = ["dc", "vod", "vod-classes", "vod-members", "vod-display", "vod-inquiries", "vod-recruit", "vod-crm", "vod-seg", "vod-msg", "vod-crm-rp", "vod-refund", "vod-ship", "vod-sales", "vod-rank", "vod-ads", "vod-settle", "vod-rates", "vod-home"];
  const MT = () => (ui.mtab === "dc" ? "dc" : "dg");
  const vdIqOpen = () => (VD().inquiries || []).filter((x) => !x.answer).length;
  const vdRecruitNew = () => DB.inquiries().filter((x) => (x.source === "doogoclass" || /^\[DOOGO CLASS/.test(x.where || "")) && (x.status || "new") === "new").length;
  const masterDcNavRaw = () => [
    ["DOOGO CLASS 운영", [["master/dc", "DOOGO CLASS 대시보드", "grid"], ["master/vod", "주문 · 결제", "coins", vdPending() || ""], ["master/vod-ship", "종이책 주문 · 배송", "truck", vdShipTodo() || ""], ["master/vod-refund", "환불 · 취소 관리", "refresh", (vdRefReqs().length + vdRefWait().length) || ""], ["master/vod-inquiries", "고객센터 1:1 문의", "headset", vdIqOpen() || ""], ["master/vod-members", "후기 · 다짐", "star"]]],
    ["매출 · 정산", [["master/vod-sales", "매출 리포트", "activity"], ["master/vod-rank", "판매 순위", "trophy"], ["master/vod-ads", "광고비 · ROAS", "megaphone"], ["master/vod-settle", "강사 정산", "calculator", vdSettleTodo() || ""], ["master/vod-rates", "정산 비율 · 가격", "sliders"]]],
    ["회원 · CRM", [["master/vod-crm", "회원 DB", "users"], ["master/vod-seg", "세그먼트", "target"], ["master/vod-msg", "메시지 · 자동화", "send"], ["master/vod-crm-rp", "회원 분석", "activity"]]],
    ["클래스 · 전시", [["master/vod-classes", "VOD 클래스 관리", "monitorPlay"], ["master/vod-home", "홈 꾸미기", "home"], ["master/vod-display", "전시 · 쿠폰 · 설정", "layers"]]],
    ["크리에이터", [["master/vod-recruit", "강사 모집 지원", "handshake", vdRecruitNew() || ""]]]
  ];
  const masterNav = () => { const g = staffNav(MT() === "dc" ? masterDcNavRaw() : masterNavRaw()); return staffMe() ? g.map((x) => [x[0], x[1].filter((it) => it[0] !== "master/staff")]).filter((x) => x[1].length) : g; };
  function masterSwitch() {
    const dc = MT() === "dc", canDg = staffNav(masterNavRaw()).length > 0, canDc = staffNav(masterDcNavRaw()).length > 0;
    if (!canDg || !canDc) return "";
    return '<div class="a-trk a-trk-m"><span class="a-trk-l">관리 영역</span><div class="a-trk-sw ' + (dc ? "at-vod" : "at-live") + '" role="tablist" aria-label="관리 영역"><i class="a-trk-k" aria-hidden="true"></i>' +
      '<button type="button" role="tab" aria-selected="' + !dc + '" data-action="mtab" data-k="dg">두잉고</button>' +
      '<button type="button" role="tab" aria-selected="' + dc + '" data-action="mtab" data-k="dc">DOOGO CLASS</button></div>' +
      "<small>" + (dc ? "VOD 스토어 · 회원 · 주문 · 1:1 문의" : "강사 플랫폼 · 기수 · 정산 · 학사") + "</small></div>";
  }

  // 메뉴를 누를 때마다 화면 전체를 다시 그려도, 왼쪽 메뉴가 맨 위로 튀지 않게 스크롤 자리를 지켜요
  function renderShell(r) {
    const side0 = document.querySelector(".a-side"), sy = side0 ? side0.scrollTop : 0;
    renderShell0(r);
    const side = document.querySelector(".a-side"); if (!side) return;
    side.scrollTop = sy;
    const on = side.querySelector(".a-nav.on");
    if (on) { const a = on.getBoundingClientRect(), b = side.getBoundingClientRect(); if (a.top < b.top + 8 || a.bottom > b.bottom - 8) side.scrollTop += a.top - b.top - b.height / 2 + a.height / 2; }
  }
  function renderShell0(r) {
    const partner = S.role === "partner", PM = partner ? affOf(S.partnerId) : null;
    const master = S.role === "master" && !S.actingAs;
    const groups = partner ? partnerNav() : master ? masterNav() : instructorNav();
    const cur = (master ? r.parts.slice(0, 2) : r.parts).join("/");
    const curKey = master || partner ? (cur || (partner ? "partner" : "master")) : (r.parts[0] || "");
    const ins = master || partner ? null : INS();
    if (ins && TRK() === "vod" && VPID()) DB.vodEnsure(ins.id, VPID());
    const co = ins ? DB.currentCohort(ins.id) : null;
    root.innerHTML =
      '<div class="adm a-app" id="a-app">' +
        (S.role === "master" && S.actingAs ? '<div class="a-acting">' + icon("shieldCheck", "sm") + "<span>마스터 권한으로 <b>" + esc(ins.name) + "</b> 강사센터를 보고 있어요.</span>" + btn("마스터로 돌아가기", "stop-acting", "a-btn-light a-btn-sm") + "</div>" : "") +
        '<header class="a-top' + (ins && isCoach() && myCoachCourses().length > 1 ? " has-csw" : "") + '">' +
          '<button class="a-icon-btn a-menu" type="button" data-action="toggle-nav" aria-label="메뉴">' + icon("menu") + "</button>" +
          // 로고는 두잉고 첫 화면(/doinggo)으로, 옆의 ‘강사센터’ 글자는 이 센터 첫 화면으로
          '<span class="a-logo"><a class="a-logo-home" href="#/doinggo" title="두잉고 홈으로" aria-label="두잉고 홈으로">' + window.doogoClassLock("hm-lock-xs") + '</a><a class="a-logo-role" href="#/center' + (partner ? "/partner" : master ? "/master" : "") + '">' + (partner ? "파트너센터" : master ? (MT() === "dc" ? "DOOGO CLASS 관리" : "마스터 관리자") : isCoach() ? "코치센터" : "강사센터") + "</a>" + (ins ? (isCoach() && myCoachCourses().length > 1 ? '<button type="button" class="a-coach-sw" data-action="coach-switch" title="맡은 다른 강의로 옮기기">' + icon("swap", "xs") + "<span>" + esc(ins.displayName) + "</span>" + icon("chevDown", "xs") + "</button>" : '<em class="a-hide-sm">' + esc(ins.displayName) + "</em>") : "") + "</span>" +
          '<div class="a-top-right">' +
            (ins ? '<span class="a-chip a-hide-sm' + (TRK() === "vod" ? " a-chip-vod" : "") + '">' + (TRK() === "vod" ? "DOOGO CLASS · VOD 수강생 " + VX().buyersOf(ins.id).filter((b) => b.active).length + "명" : co ? esc(co.name) + " · " + DB.STATUS_LABEL[DB.cohortStatus(co)] : "기수 없음") + "</span>" +
              // 수강생 화면 미리보기 — 휴대폰에서는 짧게 ‘미리보기’ (눈 아이콘만 있으면 뭔지 몰라서)
              btn(icon("eye", "sm") + '<span class="a-hide-sm">' + (TRK() === "vod" ? "VOD 수강생 화면 보기" : "수강생 화면 보기") + '</span><span class="a-only-sm">미리보기</span>', "preview", "a-btn-outline a-btn-sm a-pv-btn", ' title="수강생에게 보이는 화면을 미리 봐요 (수강생 기록은 바뀌지 않아요)" aria-label="수강생 화면 미리보기"') : "") +
            (() => {
              let n = 0, href = "", tip = "";
              if (partner) { const ni = affInqNew(PM), nn = affNoticeNew(PM); n = ni + nn; href = ni || !nn ? "#/center/partner/inquiries" : "#/center/partner/notices"; tip = n ? "입점 문의 새 소식 " + ni + "건 · 새 공지 " + nn + "건" : "새 알림이 없어요"; }
              else if (master && staffCan("master/partners")) { const a = masterInqAlerts(); n = a.inq + a.msg; href = "#/center/master/partners"; tip = n ? "파트너 새 메시지 " + a.msg + "건 · 새 입점 문의 " + a.inq + "건" : "새 알림이 없어요"; }
              if (!href) return "";
              return '<a class="a-bell' + (n ? " on" : "") + '" href="' + href + '" title="' + esc(tip) + '" aria-label="알림: ' + esc(tip) + '"' + (master && n ? ' data-action="bell-go"' : "") + ">" + icon("bell", "sm") + (n ? "<b>" + (n > 99 ? "99+" : n) + "</b>" : "") + "</a>";
            })() +
            (() => { const u = partner ? [PM.name, "파트너", "handshake", "pt"] : S.role === "master" ? (staffMe() ? [staffMe().name, staffRoleName(staffMe()) + " · 운영자", "shieldCheck", "ms st"] : ["ADMIN", master ? "마스터 관리자" : "마스터 · 대신 보기", "shieldCheck", "ms"]) : isCoach() ? [((ME_COACH() || {}).name || "코치"), "코치", "checks", "co"] : [ins.name, "강사", "user", "in"];
              return '<span class="a-user a-user-' + u[3] + ' a-hide-sm"><span class="a-user-av">' + icon(u[2], "sm") + '</span><span class="a-user-t"><b>' + esc(u[0]) + (u[3] === "ms" ? "" : " 님") + "</b><small>" + esc(u[1]) + '</small></span><i class="a-user-dot" aria-hidden="true"></i></span>'; })() +
            btn(icon("logout", "sm") + '<span class="a-hide-sm">로그아웃</span>', "logout", "a-btn-outline a-btn-sm a-logout") +
          "</div>" +
        "</header>" +
        '<div class="a-shell">' +
          '<aside class="a-side" aria-label="관리 메뉴">' + (ins ? (trackable() ? trackSwitch() : "") : master ? masterSwitch() : "") +
            groups.map((g) => '<div class="a-nav-group"><p class="a-nav-label">' + esc(g[0]) + "</p>" + (g[0] === "VOD 강의실 꾸미기" ? vpidPick() : "") + g[1].map((it) => {
              const on = it[0] === curKey || (!master && !partner && it[0] && r.parts[0] === it[0]);
              return '<a class="a-nav' + (on ? " on" : "") + '" href="#/center' + (it[0] ? "/" + it[0] : "") + '"' + (on ? ' aria-current="page"' : "") + ">" + icon(it[2], "sm") + "<span>" + esc(it[1]) + "</span>" + (it[3] ? '<span class="a-count">' + it[3] + "</span>" : "") + "</a>";
            }).join("") + "</div>").join("") +
            (partner ? '<div class="a-side-card"><b>RS ' + (PM.rs !== null && PM.rs !== undefined && PM.rs !== "" ? PM.rs : affDefRs()) + '% · 매월 ' + AFF().affSettings.payDay + '일 지급</b><p>소개한 강사님이 기수 이용료를 입금하면 수익이 확정돼요.</p></div>' : master ? "" : '<div class="a-side-card"><b>수강생 화면과 똑같은 메뉴</b><p>‘수강생 화면 콘텐츠’에서 고친 내용이 수강생 화면에 바로 반영돼요.</p>' + btn(icon("eye", "sm") + "수강생 화면 보기", "preview", "a-btn-primary a-btn-sm a-btn-block") + "</div>") +
            '<div class="a-side-foot">' + (S && S.role !== "master" ? '<a class="a-side-kk" href="' + esc(DB.opsKakao().chat) + '" target="_blank" rel="noopener" data-kk-ops>' + icon("headset", "xs") + "운영팀 상담 (카카오톡)</a>" : "") + '<a href="#/login" data-action="to-student">' + icon("arrowLeft", "xs") + "수강생 로그인 화면</a>" + window.poweredBy("color") + "</div>" +
          "</aside>" +
          '<div class="a-scrim" data-action="toggle-nav"></div>' +
          (master || partner ? "" : '<nav class="bw-tabbar bw-tabbar-a" aria-label="빠른 메뉴">' + (TRK() === "vod" ? [["#/center", "grid", "대시보드"], ["#/center/vod-students", "users", "VOD 수강생"], ["#/center/vod", "monitorPlay", "판매"], ["#/center/coaching", "message", "코칭"]] : [["#/center", "grid", "대시보드"], ["#/center/students", "users", "수강생"], ["#/center/reviews", "checks", "과제 검수"], ["#/center/questions", "message", "1:1"]]).filter((x) => { const k = x[0].replace(/^#\/center\/?/, ""); return !k || can(k); }).map((x) => '<a class="bw-tab" href="' + x[0] + '">' + icon(x[1]) + "<span>" + x[2] + "</span></a>").join("") + '<button type="button" class="bw-tab" data-action="toggle-nav">' + icon("menu") + "<span>전체</span></button></nav>") +
          '<main class="a-main" id="a-main"></main>' +
        "</div>" +
      "</div>";
  }

  /* ---------------- 강사: 대시보드 ---------------- */
  // 코치 대시보드: 인사 + 맡은 메뉴의 할 일만
  function coachDashboard() {
    const iid = IID(), ins = INS(), c = C(), me = ME_COACH() || {};
    const co = DB.currentCohort(iid), n = counts(iid), wk = co ? DB.currentWeek(co) : 0;
    const subs = can("reviews") ? allSubmissions(iid, "all").filter((x) => x.review === "pending").slice(0, 6) : [];
    const reqs = can("questions") ? DB.requests(iid).filter((x) => !x.q.answer && (TRK() === "vod") === DB.isVodStudent(x.s)).slice(0, 5) : [];
    const pend = can("students") ? DB.studentsOf(iid).filter((s) => s.status === "pending").slice(0, 5) : [];
    const myMenus = COACH_PERMS.flatMap((g) => g[1]).filter((x) => can(x[0]));
    const kpis = [];
    if (can("reviews")) kpis.push(kpi("검수 대기 과제", n.review + "개", "피드백 · 승인 · 보완 요청", "#/center/reviews", n.review ? "info" : ""));
    if (can("questions")) kpis.push(kpi("답변 대기 문의", n.questions + "건", "1:1 요청 · 오류 신고", "#/center/questions", n.questions ? "warn" : ""));
    if (can("students")) kpis.push(kpi("승인 대기 수강생", n.pending + "명", "새 수강 신청", "#/center/students?status=pending", n.pending ? "warn" : ""));
    kpis.push(kpi("진행 중 기수", co ? co.name : "-", co ? (DB.cohortStatus(co) === "running" ? wk + "주차 진행 중" : fmtMD(co.startDate) + " 시작") : "기수 없음", can("cohorts") ? "#/center/cohorts" : "#/center"));
    const many = myCoachCourses();
    return head((me.name || "") + " 코치님, 안녕하세요", esc(ins.displayName) + " · " + esc(c.brand.courseTitle) + " 코치" + (me.memo ? " · " + esc(me.memo) : ""), many.length > 1 ? btn(icon("swap", "sm") + "다른 강의 코치센터 (" + many.length + "개)", "coach-switch", "a-btn-outline") : "") +
      '<div class="a-kpis">' + kpis.join("") + "</div>" +
      '<section class="a-card a-coach-menus"><div class="a-card-head"><h2>' + icon("shieldCheck", "sm") + ' 내가 맡은 메뉴</h2><span class="a-muted">강사님이 열어 준 메뉴예요. 더 필요하면 강사님께 요청해 주세요.</span></div>' +
        (myMenus.length ? '<div class="a-coach-chips">' + myMenus.map((x) => '<a class="a-coach-chip" href="#/center/' + x[0] + '">' + esc(x[1]) + icon("arrowRight", "xs") + "</a>").join("") + "</div>" : '<p class="a-muted" style="margin:0">아직 열린 메뉴가 없어요. 강사님께 요청해 주세요.</p>') + "</section>" +
      (can("reviews") ? '<section class="a-card"><div class="a-card-head"><h2>검수를 기다리는 과제</h2><a class="a-link" href="#/center/reviews">과제 검수 ' + icon("arrowRight", "xs") + "</a></div>" +
        (subs.length ? '<ul class="a-list">' + subs.map((x) => '<li class="clickable" data-action="review-open" data-sid="' + x.s.id + '" data-mid="' + x.m.id + '"><div class="a-who"><span class="a-avatar">' + esc(x.s.name.slice(0, 1)) + "</span><div><b>" + esc(x.s.name) + " · " + esc(x.m.title) + "</b><small>" + esc(cohortName(x.s.cohortId)) + " · " + x.w.no + "주차 · " + fmtStamp(x.sub.at) + "</small></div></div>" + reviewPill(x) + "</li>").join("") + "</ul>"
          : emptyBox("check", "검수를 기다리는 과제가 없어요.")) + "</section>" : "") +
      (can("questions") ? '<section class="a-card"><div class="a-card-head"><h2>답변을 기다리는 문의</h2><a class="a-link" href="#/center/questions">1:1 요청 답변 ' + icon("arrowRight", "xs") + "</a></div>" +
        (reqs.length ? '<ul class="a-list">' + reqs.map((x) => '<li><div class="a-who"><span class="a-avatar">' + esc(x.s.name.slice(0, 1)) + "</span><div><b>#" + x.no + " " + esc(x.q.title) + "</b><small>" + esc(x.s.name) + " · " + esc(cohortName(x.s.cohortId)) + " · " + fmtStamp(x.q.at) + "</small></div></div>" + pill(x.q.category || "기타", "mute") + "</li>").join("") + "</ul>"
          : emptyBox("check", "답변을 기다리는 문의가 없어요.")) + "</section>" : "") +
      (can("students") && pend.length ? '<section class="a-card"><div class="a-card-head"><h2>승인 대기</h2><a class="a-link" href="#/center/students?status=pending">전체 ' + icon("arrowRight", "xs") + "</a></div>" +
        '<ul class="a-list">' + pend.map((s) => '<li><div class="a-who"><span class="a-avatar">' + esc(s.name.slice(0, 1)) + "</span><div><b>" + esc(s.name) + "</b><small>" + esc(cohortName(s.cohortId)) + " · 뒷자리 " + esc(s.phone4) + " · " + fmtMD(s.appliedAt) + " 신청</small></div></div>" +
          '<div class="a-row-actions">' + btn("거절", "stu-reject", "a-btn-ghost a-btn-sm", ' data-id="' + s.id + '"') + btn("승인", "stu-approve", "a-btn-primary a-btn-sm", ' data-id="' + s.id + '"') + "</div></li>").join("") + "</ul></section>" : "");
  }
  function pageDashboard() {
    if (TRK() === "vod") return pageVodDash();
    if (isCoach()) return coachDashboard();
    const iid = IID(), ins = INS(), c = C();
    const co = DB.currentCohort(iid);
    const n = counts(iid);
    const rows = co ? studentProgressRows(iid, (s) => s.cohortId === co.id && s.status === "approved") : [];
    const subs = allSubmissions(iid, "all").slice(0, 6);
    const pend = DB.studentsOf(iid).filter((s) => s.status === "pending").slice(0, 5);
    const wk = co ? DB.currentWeek(co) : 0;
    const avg = rows.length ? Math.round(rows.reduce((a, r) => a + r.st.pct, 0) / rows.length) : 0;
    const anns = annFor(iid).slice(0, 2);
    return head(ins.name + " 강사님, 안녕하세요", esc(c.brand.courseTitle), btn(icon("userPlus", "sm") + "수강생 추가", "student-add", "a-btn-outline") + newCohortBtn()) +
      billBanner(iid) +
      (anns.length ? '<section class="a-ann">' + icon("megaphone", "sm") + '<div class="a-ann-list">' + anns.map((a) => '<details><summary><b>' + esc(a.title) + "</b><small>두잉고 운영팀 · " + fmtMD(a.date) + "</small></summary>" + DB.rich(a.body) + "</details>").join("") + "</div></section>" : "") +
      '<div class="a-kpis">' +
        kpi("승인 대기", n.pending + "명", "새 수강 신청", "#/center/students?status=pending", n.pending ? "warn" : "") +
        kpi("진행 중 기수", co ? co.name : "-", co ? (DB.cohortStatus(co) === "running" ? wk + "주차 진행 중" : fmtMD(co.startDate) + " 시작") : "다음 기수를 신청해 주세요", co ? "#/center/cohorts" : "#/center/billing") +
        kpi("수강생 평균 진행률", avg + "%", (co ? co.name + " · " : "") + rows.length + "명 기준", "#/center/students?status=approved") +
        kpi("검수 대기 · 미답변", n.review + " · " + n.questions, "과제 검수 / 1:1 요청", "#/center/reviews", n.review + n.questions ? "info" : "") +
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
      rows.map((r) => "<tr class=\"clickable\" data-action=\"student-open\" data-id=\"" + r.s.id + "\"><td><b>" + esc(r.s.name) + "</b></td><td class=\"cell-lv\">" + lvBadge(r.lv || levelOfStudent(r.s)) + "</td>" +
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
    if (!isNew && s.status === "approved") extra += stuActivity(s, DB.progress(s.id), DB.cohort(s.cohortId));
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
  // 학습 활동: 수강생이 남긴 기록을 강사 · 코치가 볼 수 있게 (학습 노트의 ‘물어보고 싶은 점’까지)
  function stuActivity(s, p, co) {
    const c = C(), weeks = co ? DB.weeksOf(co) : c.weeks || [], lz = weeks.reduce((a, w) => a.concat(w.lessons || []), []), seen = lz.filter((l) => (p.watched || {})[l.id]).length;
    const pins = (c.notices || []).filter((n) => n.pinned), readP = pins.filter((n) => (p.readNotices || {})[n.id]).length, docs = c.docsGuide || [], docOk = docs.filter((g) => (p.docs || {})[g.id]).length;
    const qOf = (no, id) => { const own = (c.notePrompts || []).filter((x) => Number(x.week) === Number(no) && x.q), list = own.length ? own : DB.NOTE_PROMPTS.map((q, i) => ({ id: "d" + i, q })); return (list.find((x) => x.id === id) || {}).q || "학습 노트"; };
    const js = Object.keys(p.journal || {}).sort((a, b) => ((p.journal[b] || {}).at || 0) - ((p.journal[a] || {}).at || 0)).slice(0, 3);
    return '<div class="a-act"><h4>학습 활동</h4><div class="a-act-g"><div><span>강의 시청</span><b>' + seen + " / " + lz.length + "</b></div><div><span>필독 공지 읽음</span><b>" + readP + " / " + pins.length + "</b></div><div><span>서류 준비</span><b>" + docOk + " / " + docs.length + "</b></div><div><span>학습 노트</span><b>" + Object.keys(p.journal || {}).length + "주</b></div></div>" +
      (js.length ? '<ul class="a-act-notes">' + js.map((wk) => { const j = p.journal[wk] || {}; return "<li><small>" + esc(wk) + "주차 학습 노트" + (j.at ? " · " + esc(DB.date.toStr(new Date(j.at))) : "") + "</small>" + Object.keys(j.a || {}).map((id) => "<p><b>" + esc(qOf(wk, id)) + "</b>" + esc(j.a[id]) + "</p>").join("") + "</li>"; }).join("") + "</ul>" : '<p class="a-muted p-small">아직 남긴 학습 노트가 없어요.</p>') + "</div>";
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
    // 저장한 수강생이 목록에 바로 보이게: 지금 탭 · 기수 필터에 안 맞으면 그 수강생 상태 · 기수로 옮김
    if (ui.stuStatus !== "all" && ui.stuStatus !== f.status.value) ui.stuStatus = f.status.value;
    if (ui.stuCohort !== "all" && ui.stuCohort !== f.cohortId.value) ui.stuCohort = f.cohortId.value;
    commit(id ? "수강생 정보를 저장했어요." : name + " 수강생을 추가했어요.");
  }

  /* ---------------- 강사: 기수 관리 ---------------- */
  function pageCohorts() {
    const iid = IID();
    const cos = DB.cohortsOf(iid).slice().reverse();
    return head("기수 관리", "기수마다 1주차 강의일 · 진행 주차 · 무료 강의 · 오프라인 강의 · 챌린지 날짜를 정하면 주차별 공개일과 과제 마감일이 자동으로 계산되고, 수강생 대시보드에 바로 보여요." + (S.role === "master" ? "" : " 새 기수는 ‘다음 기수 신청’ 후 이용료 입금이 확인되면 두잉고가 열어 드려요."), newCohortBtn()) +
      (cos.length ? '<div class="a-stack">' + cos.map((co) => {
        const st = DB.cohortStatus(co);
        const ss = DB.studentsOf(iid).filter((s) => s.cohortId === co.id);
        const ap = ss.filter((s) => s.status === "approved").length, pe = ss.filter((s) => s.status === "pending").length;
        return '<section class="a-card a-cohort"><div class="a-card-head"><h2>' + esc(co.name) + "</h2>" + pill(DB.STATUS_LABEL[st], COHORT_CLS[st]) + (co.recruiting && st !== "ended" ? pill("신청 받는 중", "info") : "") +
          '<span class="a-muted">' + fmtFull(co.startDate) + " ~ " + fmtFull(DB.cohortEnd(co)) + (st === "running" ? " · " + DB.currentWeek(co) + "주차" : "") + "</span>" +
          '<span class="a-cur-chip">' + icon("book", "xs") + esc(DB.curriculumOf(co).name) + " · " + DB.cohortWeeks(co) + "주</span>" + '<span class="a-cur-chip">' + icon("calendar", "xs") + esc(classText(co)) + "</span>" +
          '<div class="a-row-actions">' + btn(icon("eye", "sm") + "미리보기", "plan-pv", "a-btn-ghost a-btn-sm", ' data-iid="' + esc(iid) + '" data-id="' + co.id + '"') + btn(icon("pen", "sm") + "일정 설계 · 수정", "cohort-edit", "a-btn-primary a-btn-sm", ' data-id="' + co.id + '"') + "</div></div>" +
          planChips(iid, co) +
          '<div class="a-cohort-stats"><a href="#/center/students?cohort=' + co.id + '&status=approved"><b class="num">' + ap + "</b><span>수강 중</span></a><a href=\"#/center/students?cohort=" + co.id + '&status=pending"><b class="num">' + pe + "</b><span>승인 대기</span></a><div><b class=\"num\">" + ss.length + "</b><span>전체 신청</span></div></div>" +
          weekStrip(co) + "</section>";
      }).join("") + "</div>" : '<section class="a-card">' + emptyBox("layers", S.role === "master" ? "아직 기수가 없어요. 첫 기수를 열어 주세요." : "아직 기수가 없어요. ‘다음 기수 신청’을 남겨 주시면 연락드릴게요.", newCohortBtn()) + "</section>");
  }
  /* ---------------- 기수 · 일정 설계 (마스터 › 기수 · 일정 설계 · 강사센터 › 기수 관리 같은 창) ----------------
   * 기수 이름 · 1주차 강의일 · 커리큘럼 · 진행 주차(기수마다 · 예: 1기 5주 · 2기 4주) · 매주 강의 요일 · 시간 · 입장 링크 +
   * 이 기수만의 특별 일정(무료 강의 · 오프라인 강의 · 챌린지 · 라이브 Q&A · 보너스 강의 · 행사 · 공지)을 한 창에서 정해요.
   * 특별 일정은 content.schedule 에 scope: "cohort" 로 저장 → 수강생 대시보드 ‘다가오는 일정’ · 수업 캘린더에 그대로 보여요 */
  const PLAN_KINDS = ["free", "offline", "challenge", "qna", "bonus", "event", "notice"];
  const planEvs = (iid, coId) => ((DB.content(iid) || {}).schedule || []).filter((e) => e.scope === "cohort" && e.cohortId === coId).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
  const mdDow = (d) => fmtMD(d).replace(" (", "(");
  const planMaster = () => !!S && S.role === "master";
  function planRow(iid, e) {
    e = e || {};
    return '<div class="pl-ev" data-id="' + esc(e.id || "") + '">' +
      '<select class="a-input a-sm" name="ev-type" aria-label="종류">' + PLAN_KINDS.map((k) => '<option value="' + k + '"' + ((e.type || "free") === k ? " selected" : "") + ">" + esc(DB.evLabel(iid, k)) + "</option>").join("") + "</select>" +
      '<input class="a-input a-sm" name="ev-date" type="date" value="' + esc(e.date || "") + '" aria-label="날짜">' +
      '<input class="a-input a-sm" name="ev-time" type="time" value="' + esc(e.time || "") + '" aria-label="시간">' +
      '<input class="a-input a-sm" name="ev-title" maxlength="80" value="' + esc(e.title || "") + '" placeholder="일정 이름 (비우면 종류 이름)" aria-label="일정 이름">' +
      '<input class="a-input a-sm" name="ev-place" maxlength="300" value="' + esc(e.url || e.place || "") + '" placeholder="장소 또는 입장 링크 (선택)" aria-label="장소 또는 링크">' +
      '<button type="button" class="a-icon-btn sm" data-action="plan-ev-del" aria-label="이 일정 지우기">' + icon("x", "sm") + "</button></div>";
  }
  /** 설계 창 — iid 강사 · co 기수 (없으면 새 기수: 마스터만) */
  function planForm(iid, co) {
    const isNew = !co, last = DB.cohortsOf(iid).slice(-1)[0], brand = (DB.content(iid) || {}).brand || {};
    if (isNew && !planMaster()) return;
    if (isNew) {
      const after = last ? addDays(DB.cohortEnd(last), 1) : todayStr(), dow = last && last.classDow != null && last.classDow !== "" ? Number(last.classDow) : 6;
      co = { name: DB.nextCohortName(iid), startDate: addDays(after, (dow - parseDate(after).getDay() + 7) % 7), classDow: last ? last.classDow : dow, classTime: last ? last.classTime : brand.liveTime, curriculumId: last ? last.curriculumId : undefined, recruiting: true };
    }
    const curs = DB.curricula(iid), curId = co.curriculumId || "main", n = (DB.studentsOf(iid).filter((s) => s.cohortId === co.id)).length;
    openModal(isNew ? "새 기수 설계 · " + insName(iid) : insName(iid) + " " + co.name + " 설계",
      '<form id="plan-form" class="a-form pl-form" data-iid="' + esc(iid) + '" data-id="' + (isNew ? "" : esc(co.id)) + '" novalidate>' +
        '<div class="pl-cols"><div class="pl-left">' +
          '<h3 class="pl-h">' + icon("layers", "sm") + " 기수 기본</h3>" +
          '<div class="a-form-row"><div class="a-field"><label for="pl-name">기수 이름</label><input class="a-input" id="pl-name" name="pl-name" maxlength="30" value="' + esc(co.name) + '"></div>' +
            '<div class="a-field"><label for="pl-start">1주차 강의일</label><input class="a-input" id="pl-start" name="pl-start" type="date" value="' + esc(co.startDate) + '"></div></div>' +
          '<div class="a-form-row"><div class="a-field"><label for="pl-cur">커리큘럼</label><select class="a-input" id="pl-cur" name="pl-cur">' + curs.map((x) => '<option value="' + x.id + '"' + (x.id === curId ? " selected" : "") + ">" + esc(x.name) + " · " + x.weeks.length + "주</option>").join("") + "</select></div>" +
            '<div class="a-field"><label for="pl-weeks">진행 주차</label><select class="a-input" id="pl-weeks" name="pl-weeks" data-cur="' + esc(curId) + '">' + planWeekOpts(iid, curId, co.weeks) + "</select></div></div>" +
          '<div class="a-form-row"><div class="a-field"><label for="pl-dow">매주 강의 요일</label><select class="a-input" id="pl-dow" name="pl-dow"><option value="">1주차 강의일과 같은 요일</option>' + DOW.map((d, i) => '<option value="' + i + '"' + (co.classDow !== undefined && co.classDow !== null && co.classDow !== "" && Number(co.classDow) === i ? " selected" : "") + ">매주 " + d + "요일</option>").join("") + "</select></div>" +
            '<div class="a-field"><label for="pl-time">강의 시간</label><input class="a-input" id="pl-time" name="pl-time" type="time" value="' + esc(co.classTime || brand.liveTime || "") + '"></div></div>' +
          '<p class="a-muted p-small pl-hint">1주차 강의일부터 일주일씩 주차가 열리고, 진행 주차는 커리큘럼 앞에서부터 그만큼만 진행해요. 매주 강의 요일을 고르면 그 주의 그 요일이 강의일이에요.</p>' +
          '<div class="a-field"><label for="pl-url">강의 입장 링크 <small>(줌 등 · 비우면 기본 정보의 링크)</small></label><input class="a-input" id="pl-url" name="pl-url" type="url" value="' + esc(co.classUrl || "") + '" placeholder="https://zoom.us/j/…"></div>' +
          '<label class="a-check"><input type="checkbox" name="pl-rec"' + (co.recruiting ? " checked" : "") + "><span>수강생 로그인 화면에서 이 기수로 수강 신청 받기</span></label>" +
          '<h3 class="pl-h">' + icon("calendar", "sm") + " 이 기수 특별 일정 <small>무료 강의 · 오프라인 강의 · 챌린지 · 라이브 등</small></h3>" +
          '<div class="pl-evs" id="pl-evs">' + planEvs(iid, co.id).map((e) => planRow(iid, e)).join("") + "</div>" +
          '<div class="pl-add">' + ["free", "offline", "challenge", "qna"].map((k) => btn(icon("plus", "xs") + esc(DB.evLabel(iid, k)), "plan-ev-add", "a-btn-ghost a-btn-sm", ' data-k="' + k + '"')).join("") + btn(icon("plus", "xs") + "기타 일정", "plan-ev-add", "a-btn-ghost a-btn-sm", ' data-k="event"') + "</div>" +
        '</div><div class="pl-right"><h3 class="pl-h">' + icon("eye", "sm") + ' 수강생에게 보일 일정</h3><div id="pl-pv" class="pl-pv">' + planPreviewHtml(iid, planDraftOf(co, planEvs(iid, co.id))) + "</div></div></div>" +
        '<p class="a-error" id="pl-error"></p></form>',
      (!isNew && planMaster() ? btn(icon("trash", "sm") + "기수 삭제", "plan-del", "a-btn-ghost danger", ' data-iid="' + esc(iid) + '" data-id="' + esc(co.id) + '"' + (n ? ' title="수강생 ' + n + '명"' : "")) : "") + '<span class="a-spacer"></span>' +
      btn("취소", "modal-close") + '<button class="a-btn a-btn-outline" type="submit" form="plan-form" data-action="plan-then">' + icon("eye", "sm") + "저장하고 미리보기</button>" + '<button class="a-btn a-btn-primary" type="submit" form="plan-form">' + (isNew ? "기수 만들기" : "저장") + "</button>", "xl");
  }
  function planWeekOpts(iid, curId, sel) {
    const cu = DB.curriculum(iid, curId), max = cu ? cu.weeks.length : 0, v = Number(sel) > 0 && Number(sel) < max ? Number(sel) : max;
    return Array.from({ length: max }, (_, i) => i + 1).map((k) => '<option value="' + k + '"' + (k === v ? " selected" : "") + ">" + k + "주" + (k === max ? " (전체)" : "") + "</option>").join("");
  }
  const planDraftOf = (co, evs) => ({ co: { id: co.id, name: co.name, startDate: co.startDate, curriculumId: co.curriculumId || "main", weeks: Number(co.weeks) || 0, classDow: co.classDow == null ? "" : String(co.classDow), classTime: co.classTime || "", classUrl: co.classUrl || "", recruiting: !!co.recruiting }, evs: (evs || []).map((e) => ({ id: e.id, type: e.type, date: e.date, time: e.time || "", title: e.title || "", place: e.url || e.place || "" })) });
  function planRead(f) {
    const g = (n) => { const x = f.elements.namedItem(n); return x ? String(x.value || "").trim() : ""; };
    return { co: { id: f.dataset.id, name: g("pl-name"), startDate: g("pl-start"), curriculumId: g("pl-cur") || "main", weeks: Number(g("pl-weeks")) || 0, classDow: g("pl-dow"), classTime: g("pl-time"), classUrl: g("pl-url"), recruiting: !!(f.elements.namedItem("pl-rec") || {}).checked },
      evs: Array.from(f.querySelectorAll(".pl-ev")).map((r) => { const v = (n) => String((r.querySelector('[name="' + n + '"]') || {}).value || "").trim(); return { id: r.dataset.id || "", type: v("ev-type"), date: v("ev-date"), time: v("ev-time"), title: v("ev-title"), place: v("ev-place") }; }) };
  }
  /** 저장 전 미리보기 — 주차 강의 · 과제 마감 · 모든 기수 반복 일정 + 이 기수 특별 일정을 날짜순으로 */
  function planPreviewHtml(iid, d) {
    const c = d.co;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.startDate || "")) return '<p class="a-muted">1주차 강의일을 고르면 일정이 보여요.</p>';
    const fake = { id: "_plan", instructorId: iid, startDate: c.startDate, curriculumId: c.curriculumId === "main" ? undefined : c.curriculumId, weeks: c.weeks, classDow: c.classDow === "" ? undefined : Number(c.classDow), classTime: c.classTime };
    const L = (t) => DB.evLabel(iid, t), wk = DB.weeksOf(fake), first = DB.classDate(fake, 1), lastD = DB.classDate(fake, wk.length);
    const list = DB.events(iid, fake).concat(d.evs.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date)).map((e) => ({ date: e.date, time: e.time, type: e.type, title: e.title || L(e.type), place: e.place, special: true })))
      .sort((a, b) => (a.date + (a.time || "99")).localeCompare(b.date + (b.time || "99")));
    const cls = { open: "info", deadline: "bad", free: "warn", offline: "dark", challenge: "ok", qna: "warn", bonus: "warn", event: "dark", notice: "mute", replay: "info" };
    return '<div class="pl-sum"><b>' + wk.length + "주 과정</b><span>1주차 " + mdDow(first) + " → " + wk.length + "주차 " + mdDow(lastD) + "</span><small>마지막 과제 마감 " + mdDow(DB.cohortEnd(fake)) + "</small></div>" +
      '<ul class="pl-list">' + list.map((e) => '<li class="' + (e.special ? "sp" : e.type === "deadline" ? "dl" : "") + '"><span class="pl-d">' + mdDow(e.date) + (e.time ? " " + esc(e.time) : "") + "</span>" + pill(L(e.type), cls[e.type] || "mute") + "<span class=\"pl-t\">" + esc(e.title) + (e.place && !/^https?:/i.test(e.place) ? ' <small class="a-muted">· ' + esc(e.place) + "</small>" : "") + "</span></li>").join("") + "</ul>";
  }
  function refreshPlanPv() {
    const f = document.getElementById("plan-form"), box = document.getElementById("pl-pv");
    if (!f || !box) return;
    const iid = f.dataset.iid, d = planRead(f), ws = f.elements.namedItem("pl-weeks");
    // 커리큘럼을 바꾸면 진행 주차 칸도 그 커리큘럼 길이에 맞게
    if (ws && ws.dataset.cur !== d.co.curriculumId) { const keep = ws.selectedIndex === ws.options.length - 1 ? 0 : Number(ws.value); ws.innerHTML = planWeekOpts(iid, d.co.curriculumId, keep); ws.dataset.cur = d.co.curriculumId; d.co.weeks = Number(ws.value) || 0; }
    box.innerHTML = planPreviewHtml(iid, d);
  }
  function savePlan(f) {
    const iid = f.dataset.iid, d = planRead(f), c = d.co, err = document.getElementById("pl-error"), then = f.dataset.then;
    delete f.dataset.then;
    if (!c.name) { err.textContent = "기수 이름을 적어 주세요."; return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.startDate)) { err.textContent = "1주차 강의일을 골라 주세요."; return; }
    if (c.classUrl && !/^https?:\/\//i.test(c.classUrl)) { err.textContent = "입장 링크는 http:// 또는 https:// 로 시작해야 해요."; return; }
    const evs = d.evs.filter((e) => e.date || e.title || e.place);
    const bad = evs.find((e) => !/^\d{4}-\d{2}-\d{2}$/.test(e.date));
    if (bad) { err.textContent = "‘" + (bad.title || DB.evLabel(iid, bad.type)) + "’ 일정의 날짜를 골라 주세요."; return; }
    if (!c.id && DB.cohortsOf(iid).some((x) => x.name === c.name)) { err.textContent = "같은 이름의 기수가 이미 있어요."; return; }
    const cu = DB.curriculum(iid, c.curriculumId), full = cu ? cu.weeks.length : 0;
    const fields = { name: c.name, startDate: c.startDate, recruiting: c.recruiting, curriculumId: c.curriculumId === "main" ? undefined : c.curriculumId, weeks: c.weeks > 0 && c.weeks < full ? c.weeks : undefined, classDow: c.classDow === "" ? undefined : Number(c.classDow), classTime: c.classTime || undefined, classUrl: c.classUrl || undefined };
    let co = c.id ? DB.cohort(c.id) : null;
    if (c.id && !co) { err.textContent = "기수를 찾지 못했어요. 새로고침해 주세요."; return; }
    if (!co) { if (!planMaster()) return; co = { id: DB.uid("c"), instructorId: iid }; DB.data.cohorts.push(co); }
    Object.keys(fields).forEach((k) => { if (fields[k] === undefined) delete co[k]; else co[k] = fields[k]; });
    const ct = DB.content(iid);
    ct.schedule = ct.schedule.filter((e) => !(e.scope === "cohort" && e.cohortId === co.id)).concat(evs.map((e) => {
      const o = { id: e.id || DB.uid("e"), type: PLAN_KINDS.indexOf(e.type) >= 0 ? e.type : "event", title: e.title || DB.evLabel(iid, e.type), time: e.time || "", scope: "cohort", cohortId: co.id, date: e.date };
      if (/^https?:\/\//i.test(e.place)) o.url = e.place; else if (e.place) o.place = e.place;
      return o;
    }));
    commit(insName(iid) + " " + co.name + " 일정을 저장했어요. 수강생 대시보드 · 수업 캘린더에 바로 보여요.");
    if (then === "pv") planSplit(iid, co.id);
  }
  /** 수강생 화면 미리보기 (오른쪽 분할) — 그 기수 수강생처럼 대시보드 · 수업 캘린더를 봐요 (이 브라우저의 미리보기 세션) */
  const planSplit = (iid, coId, page) => dgSplit("plan:" + (page || "home") + ":" + iid + ":" + coId);
  function planChips(iid, co) {
    const sp = planEvs(iid, co.id), L = (t) => DB.evLabel(iid, t);
    return sp.length ? '<div class="pl-chips">' + sp.map((e) => '<span class="pl-chip ' + esc(e.type) + '"><b>' + esc(L(e.type)) + "</b>" + mdDow(e.date) + (e.time ? " " + esc(e.time) : "") + (e.title && e.title !== L(e.type) ? " · " + esc(e.title) : "") + "</span>").join("") + "</div>" : "";
  }
  /** 기수 카드 (마스터 설계 화면) */
  function planCard(iid, co) {
    const st = DB.cohortStatus(co), wk = DB.weeksOf(co), sp = planEvs(iid, co.id);
    const ss = DB.studentsOf(iid).filter((s) => s.cohortId === co.id), ap = ss.filter((s) => s.status === "approved").length;
    return '<section class="a-card pl-card"><div class="a-card-head"><h2>' + esc(co.name) + "</h2>" + pill(DB.STATUS_LABEL[st], COHORT_CLS[st]) + (co.recruiting && st !== "ended" ? pill("신청 받는 중", "info") : "") +
        '<span class="a-muted">수강생 ' + ap + "명" + (ss.length > ap ? " · 대기 " + (ss.length - ap) + "명" : "") + "</span>" +
        '<div class="a-row-actions">' + btn(icon("eye", "sm") + "미리보기", "plan-pv", "a-btn-ghost a-btn-sm", ' data-iid="' + esc(iid) + '" data-id="' + esc(co.id) + '"') + btn(icon("pen", "sm") + "설계 · 수정", "plan-edit", "a-btn-primary a-btn-sm", ' data-iid="' + esc(iid) + '" data-id="' + esc(co.id) + '"') + "</div></div>" +
      '<p class="pl-when">' + icon("calendar", "xs") + " 1주차 <b>" + mdDow(DB.classDate(co, 1)) + "</b> → " + wk.length + "주차 <b>" + mdDow(DB.classDate(co, wk.length)) + "</b> · " + wk.length + "주 · " + esc(classText(co)) + ' <span class="a-cur-chip">' + icon("book", "xs") + esc(DB.curriculumOf(co).name) + "</span></p>" +
      (sp.length ? planChips(iid, co) : '<p class="a-muted p-small">특별 일정 없음 · ‘설계 · 수정’에서 무료 강의 · 오프라인 강의 · 챌린지 날짜를 넣을 수 있어요.</p>') +
      weekStrip(co) + "</section>";
  }
  function pageMasterPlan(r) {
    const list = DB.data.instructors.filter((i) => i.status === "active" && DB.content(i.id));
    const want = (r && r.params && r.params.get("ins")) || ui.planIns;
    const ins = list.find((i) => i.id === want) || list[0];
    if (!ins) return head("기수 · 일정 설계", "") + '<section class="a-card">' + emptyBox("layers", "아직 운영 중인 강사 플랫폼이 없어요.") + "</section>";
    ui.planIns = ins.id;
    const iid = ins.id, cos = DB.cohortsOf(iid), rules = ((DB.content(iid) || {}).schedule || []).filter((e) => e.scope !== "cohort");
    return head("기수 · 일정 설계", "강사님마다 기수를 열고 1주차 강의일 · 진행 주차 · 무료 강의 · 오프라인 강의 · 챌린지 날짜를 정해요. 저장하면 그 기수 수강생 대시보드 · 수업 캘린더에 바로 보여요.", btn(icon("plus", "sm") + "새 기수 설계", "plan-new", "a-btn-primary", ' data-iid="' + esc(iid) + '"')) +
      '<div class="pl-ins" role="tablist" aria-label="강사">' + list.map((i) => '<button type="button" role="tab" class="pl-ins-b' + (i.id === iid ? " on" : "") + '" aria-selected="' + (i.id === iid) + '" data-action="plan-ins" data-id="' + esc(i.id) + '"><b>' + esc(i.displayName) + "</b><small>" + DB.cohortsOf(i.id).length + "개 기수</small></button>").join("") + "</div>" +
      (cos.length ? '<div class="a-stack">' + cos.map((co) => planCard(iid, co)).join("") + "</div>" : '<section class="a-card">' + emptyBox("layers", esc(ins.displayName) + " 강사님은 아직 기수가 없어요. ‘새 기수 설계’로 첫 기수를 열어 주세요.", btn(icon("plus", "sm") + "새 기수 설계", "plan-new", "a-btn-primary a-btn-sm", ' data-iid="' + esc(iid) + '"')) + "</section>") +
      '<section class="a-card"><div class="a-card-head"><h2>모든 기수에 반복되는 일정</h2><span class="a-muted">주차 · 요일로 정해 기수마다 같은 날 보여요</span>' + btn("강사센터 수업 캘린더에서 고치기", "ins-enter", "a-btn-ghost a-btn-sm", ' data-id="' + esc(iid) + '" data-to="#/center/schedule"') + "</div>" +
        (rules.length ? '<ul class="a-items">' + rules.map((e) => '<li><div class="a-item-main"><b>' + esc(e.title) + "</b><small>" + esc(DB.ruleText(e)) + (e.time ? " · " + esc(e.time) : "") + "</small></div>" + pill(DB.evLabel(iid, e.type), "mute") + "</li>").join("") + "</ul>" : '<p class="a-muted">반복 일정이 없어요.</p>') + "</section>";
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
  /* ---------------- 강사: 과제 검수 ---------------- */
  function pageReviews() {
    const iid = IID(), c = C();
    const cos = DB.cohortsOf(iid);
    if (!ui.revCohort || (ui.revCohort !== "all" && !cos.some((x) => x.id === ui.revCohort))) { const cur = (DB.currentCohort(iid) || {}).id, pn = (k) => allSubmissions(iid, k).filter((x) => x.review === "pending").length; ui.revCohort = cur && (pn(cur) || !pn("all")) ? cur : "all"; }
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
      bySid[sid].forEach((mid) => { const l = p.submissions[mid]; if (l && l.length) { l[l.length - 1].review = Object.assign({ status, comment: comment || "", at: Date.now() }, actor()); n++; } });
      DB.saveProgress(sid, p);
    });
    ui.revPicked.clear();
    closeModal(); render();
    toast(n + "개를 " + (status === "approved" ? "승인했어요." : "보완 요청했어요."));
  }
  // 검수 중인 제출물로 모범 과제 만들기: 사진 · 과제 · 주차 · 가린 이름을 채운 편집 창을 연다 (강사가 코멘트를 적고 저장)
  function showcaseFrom(sid, mid) {
    const s = DB.student(sid), p = DB.progress(sid), sco = DB.cohort(s.cohortId), weeks = sco ? DB.weeksOf(sco) : C().weeks;
    const w = weeks.find((x) => x.missions.some((m) => m.id === mid)), m = w && w.missions.find((x) => x.id === mid);
    const subs = p.submissions[mid] || [], sub = subs[subs.length - 1];
    if (!m || !sub) return;
    const main = C().weeks.find((x) => x.missions.some((mm) => mm.id === mid));
    // 서버에 올라간 제출 사진은 그 수강생 · 강사만 열 수 있으므로, 사진 내용을 복사해 강의 콘텐츠 사진으로 다시 저장한다
    const asData = (f) => (/^data:/.test(f.data) ? Promise.resolve({ name: f.name, data: f.data }) : fetch(f.data, { credentials: "same-origin" }).then((r) => (r.ok ? r.blob() : null))
      .then((bl) => bl && new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok({ name: f.name, data: fr.result }); fr.onerror = () => ok(null); fr.readAsDataURL(bl); })).catch(() => null));
    Promise.all((sub.files || []).filter((f) => f.type === "image" && f.data).slice(0, 6).map(asData)).then((list) => {
      editItem("showcase", "", "", { title: m.title, missionId: main ? mid : "", week: w.no, author: (sco ? sco.name + " " : "") + DB.maskName(s.name), images: list.filter(Boolean),
        desc: sub.text ? String(sub.text).slice(0, 400) : (sub.link ? "제출 링크: " + sub.link : "") });
      toast("사진과 과제를 채웠어요. 잘한 점을 코멘트로 적고 저장해 주세요.");
    });
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
      (sub.review ? '<p class="a-muted">현재 검수: <b>' + (sub.review.status === "approved" ? "승인" : "보완 요청") + "</b> · " + (sub.review.by ? '<span class="a-by">' + icon("user", "xs") + esc(sub.review.by) + "</span> · " : "") + fmtStamp(sub.review.at) + "</p>" : "") +
      '<div class="a-field"><label for="rv-comment">수강생에게 남길 말 <small>(보완 요청 시 꼭 적어 주세요)</small></label><textarea class="a-input" id="rv-comment" rows="3" placeholder="예: 사업자등록증 전체가 보이게 다시 찍어 주세요.">' + esc(sub.review ? sub.review.comment || "" : "") + "</textarea></div>",
      (DB.menuOn(IID(), "showcase") && can("showcase") ? btn(icon("trophy", "sm") + "모범 과제로 올리기", "showcase-from", "a-btn-ghost", ' data-sid="' + sid + '" data-mid="' + mid + '"') : "") +
      '<span class="a-spacer"></span>' + btn(icon("alert", "sm") + "보완 요청", "review-save", "a-btn-outline danger", ' data-sid="' + sid + '" data-mid="' + mid + '" data-status="fix"') + btn(icon("check", "sm") + "승인", "review-save", "a-btn-primary", ' data-sid="' + sid + '" data-mid="' + mid + '" data-status="approved"'), "lg");
  }

  /* ---------------- 강사: 문의 답변 ---------------- */
  function pageQuestions() {
    const iid = IID();
    const list = DB.requests(iid).filter((x) => !DB.isVodStudent(x.s));
    const shown = list.filter((x) => ui.qFilter === "all" || (ui.qFilter === "open" ? !x.q.answer : !!x.q.answer));
    const tabs = [["open", "답변 대기", list.filter((x) => !x.q.answer).length], ["done", "답변 완료", list.filter((x) => x.q.answer).length], ["all", "전체", list.length]].map((t) =>
      '<button type="button" class="a-tab' + (ui.qFilter === t[0] ? " on" : "") + '" data-action="q-tab" data-k="' + t[0] + '">' + t[1] + ' <span class="num">' + t[2] + "</span></button>").join("");
    return head("1:1 요청 답변", "수강생이 ‘질문 · 요청 → 1:1 요청’에 남긴 화면 오류·불편 신고예요. 모두 비공개로, 작성자와 강사님만 봐요. 답변하면 수강생 화면에 바로 보여요.") +
      '<section class="a-card"><div class="a-toolbar"><div class="a-tabs">' + tabs + "</div></div>" +
        (shown.length ? '<div class="a-stack">' + shown.map((x) =>
          '<article class="a-q"><div class="a-q-head"><span class="a-avatar">' + esc(x.s.name.slice(0, 1)) + "</span><div><b>#" + x.no + " " + esc(x.q.title) + "</b><small>" + esc(x.s.name) + " · " + esc(cohortName(x.s.cohortId)) + " · " + fmtStamp(x.q.at) + "</small></div>" + pill(x.q.category || "기타", "mute") + (x.q.answer ? pill("답변 완료", "ok") : pill("답변 대기", "warn")) + "</div>" +
          (x.q.answer && (x.q.answeredBy || x.q.answeredAt) ? '<p class="a-q-by"><span class="a-by">' + icon("user", "xs") + esc(x.q.answeredBy || "강사") + "</span>" + (x.q.answeredAt ? " · " + fmtStamp(x.q.answeredAt) + " 답변" : " 답변") + "</p>" : "") +
          '<p class="a-q-body">' + esc(x.q.body) + "</p>" +
          ((x.q.images || []).length ? '<div class="a-shots a-q-shots">' + x.q.images.map((im) => '<a class="a-shot" href="' + im.data + '" target="_blank" rel="noopener"><img src="' + im.data + '" alt="' + esc(im.name) + '"></a>').join("") + "</div>" : "") +
          '<form class="a-q-form" data-sid="' + x.s.id + '" data-qid="' + x.q.id + '"><textarea class="a-input" name="answer" rows="3" placeholder="예: 확인해 보니 ○○ 문제였어요. 지금 고쳤으니 새로고침 후 다시 해 주세요." aria-label="답변">' + esc(x.q.answer || "") + '</textarea><button class="a-btn a-btn-primary a-btn-sm" type="submit">' + (x.q.answer ? "답변 수정" : "답변 등록") + "</button></form></article>").join("") + "</div>"
          : emptyBox("bug", ui.qFilter === "open" ? "답변을 기다리는 1:1 요청이 없어요." : "1:1 요청이 없어요.")) +
      "</section>";
  }

  /* ---------------- 콘텐츠 편집 (공통 목록 편집기) ---------------- */
  const LINES = (v) => String(v || "").split("\n").map((x) => x.trim()).filter(Boolean);
  const TAGS = (v) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
  const F = (key, label, type, opts) => Object.assign({ key, label, type: type || "text" }, opts || {});
  const COLL = {
    week: { name: "주차", list: () => CUR().weeks, fields: [F("title", "주차 제목"), F("subtitle", "부제 (제목 아래 한 줄)", "text", { hint: "예: 판매를 시작할 수 있는 ‘몸’ 만들기" }),
      F("goal", "핵심 목표", "textarea", { rows: 2, hint: "이번 주를 마치면 수강생이 어떤 상태가 되는지 한두 문장으로 적어요." }),
      F("howto", "이번 주 진행 방법 (수강생이 따라 할 순서)", "textarea", { rows: 6, rich: true, hint: "메인 강의에서 낸 과제를 어떻게 하면 되는지 순서대로 적어요. 수강생 주차별 강의 맨 위에 보여요." }),
      F("mainUrl", "이 주차 메인 강의 링크 (선택)", "url", { hint: "비우면 기본 정보의 메인 강의 링크가 쓰여요." }),
      F("topics", "강의 내용 (한 줄에 하나)", "lines", { rows: 7, hint: "수강생 커리큘럼에 두 줄로 나눠 점 목록으로 보여요." }),
      F("summary", "한 줄 소개 (과제 화면 위에 보여요)", "textarea", { rows: 2 })],
      init: () => ({ lessons: [], missions: [], topics: [] }), after: () => CUR().weeks.forEach((w, i) => { w.no = i + 1; }) },
    lesson: { name: "강의", list: (c, ctx) => weekOf(c, ctx).lessons, fields: [F("title", "강의 제목"), F("youtubeId", "유튜브 주소", "youtube"), F("minutes", "길이(분)", "number", { hint: "유튜브 주소를 넣으면 실제 영상 길이로 자동으로 채워져요. 수강생 화면에는 24:30처럼 보여요." }), F("desc", "강의 설명", "textarea", { rows: 4, rich: true }), F("attachments", "강의 자료 (교재·PDF·엑셀 등, 영상 아래에 보여요)", "attachments")], idp: "l", init: () => ({ attachments: [] }) },
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
      init: () => ({ type: DB.calManual(IID())[0] || "qna", scope: "all", week: 1, dow: 2, time: "21:00", cohortId: (DB.currentCohort(IID()) || {}).id, date: todayStr() }),
      fields: [
        F("type", "종류", "select", { options: () => DB.calManual(IID()).concat(PLAN_KINDS.filter((k) => DB.calManual(IID()).indexOf(k) < 0)).map((k) => [k, DB.evLabel(IID(), k) + (k === "open" ? " (추가 강의일)" : "")]) }),
        F("title", "일정 이름"),
        F("time", "시간 (비워도 돼요)", "time"),
        F("place", "장소 (오프라인 강의 등, 선택)", "text", { hint: "예: 강남 OO스튜디오 3층 — 수강생 일정에 함께 보여요." }),
        F("url", "입장 링크 (줌·유튜브 라이브 등, 선택)", "url", { hint: "넣으면 수강생 일정과 홈에 ‘입장하기’ 버튼이 생겨요." }),
        F("scope", "반복", "select", { options: [["all", "모든 기수에 반복 (주차·요일로 지정)"], ["cohort", "특정 기수 하루만"]] }),
        F("week", "주차", "number", { showIf: "scope=all", min: 1 }),
        F("dow", "요일", "select", { showIf: "scope=all", options: DOW.map((d, i) => [String(i), d + "요일"]) }),
        F("cohortId", "기수", "select", { showIf: "scope=cohort", options: () => DB.cohortsOf(IID()).map((co) => [co.id, co.name + " · " + fmtMD(co.startDate) + " 시작"]) }),
        F("date", "날짜", "date", { showIf: "scope=cohort" })
      ] },
    notice: { name: "공지", list: (c) => c.notices, idp: "n", init: () => ({ date: todayStr(), pinned: false }),
      fields: [F("title", "제목"), F("body", "내용", "textarea", { rows: 9, rich: true, photos: true }), F("images", "사진 (여러 장 가능 · 본문 중간에 넣거나 아래에 모아 보여요)", "images"),
        F("videos", "영상 링크 (유튜브 · 비메오 · 여러 개면 한 줄에 하나씩)", "lines", { rows: 3, hint: "예: https://youtu.be/… 또는 https://vimeo.com/123456789 — 사진 아래에 영상이 차례로 보여요.",
          get: (n) => (n.videos && n.videos.length ? n.videos : n.youtubeId ? ["https://youtu.be/" + n.youtubeId] : []),
          set: (n, v) => { n.videos = v; delete n.youtubeId; },
          check: (v) => { const bad = v.find((u) => !DB.youtubeId(u) && !/vimeo\.com\/(?:[\w-]+\/)*\d+/i.test(u)); return bad ? "영상 주소를 확인해 주세요 (유튜브 · 비메오 주소만 돼요): " + bad : ""; } }),
        F("date", "게시일", "date"), F("pinned", "상단 고정 (필독)", "checkbox")] },
    faq: { name: "FAQ 질문", list: (c) => c.faqs, idp: "q", init: () => ({ category: "기타" }), fields: [F("q", "질문"), F("category", "분류", "combo", { options: () => faqCats(), hint: "목록에서 고르거나 새 분류를 적으면 돼요." }), F("a", "답변", "textarea", { rows: 4 }), F("tags", "AI 조교 검색어 (쉼표로 구분)", "tags", { hint: "수강생이 이 단어로 물어보면 AI 조교가 이 답변을 보여 줘요." })] },
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
    partner: { name: "제휴 혜택", list: (c) => c.partners || (c.partners = DB.defaultPartners(c)), idp: "pt", init: () => ({ group: "partner", label: "바로가기", icon: "handshake", color: "#0a5de2" }),
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
    ql: { name: "빠른 이동", list: (c) => c.quickLinks || (c.quickLinks = DB.defaultQuickLinks(c)), idp: "ql", init: () => ({ icon: "link" }),
      fields: [F("title", "이름"), F("desc", "한 줄 설명"), F("url", "주소", "text", { hint: "수강생 화면(#/notices, #/qna, #/docs, #/qna/requests, #/bot, #/library …) 또는 https:// 외부 주소(유튜브·카페·카카오톡 등, 새 창으로 열려요)" }),
        F("color", "아이콘 색 (외부 링크용 · 비우면 기본 색)", "text", { hint: "예: 유튜브 #ff0000 · 네이버 #03c75a · 두고 #0a5de2. # 뒤에 6자리 색 코드를 적어요." }),
        F("icon", "아이콘", "select", { options: () => DB.QL_ICONS.map((k) => [k, ({ layers: "층층 (제조 · OEM)",  megaphone: "확성기 (공지)", help: "물음표 (FAQ)", clipboard: "클립보드 (서류)", bug: "벌레 (오류 신고)", sparkles: "반짝이 (AI)", play: "재생 (유튜브)", message: "말풍선 (카톡)", book: "책", calendar: "달력", library: "자료실", flame: "불꽃 (동기부여)", award: "메달 (수료증)", link: "링크", store: "가게", users: "사람들 (카페)", video: "비디오 (라이브)" })[k] || k]) })] },
    ann: { name: "강사 공지", list: () => DB.data.announcements, idp: "an", init: () => ({ date: todayStr(), pinned: false }),
      fields: [F("title", "제목"), F("to", "받는 강사", "select", { options: () => [["", "모든 강사 (전체 공지)"]].concat(DB.data.instructors.map((i) => [i.id, i.displayName + " · " + i.name + " 강사님에게만"])) }), F("body", "내용", "textarea", { rows: 6, rich: true }), F("date", "날짜", "date"), F("pinned", "맨 위에 고정", "checkbox")] },
    replay: { name: "라이브 다시보기", prepend: true, list: (c) => c.replays || (c.replays = []), idp: "rp", init: () => ({ date: todayStr(), attachments: [] }),
      fields: [F("title", "영상 제목", "text", { hint: "예: 2주차 라이브 Q&A · 상세페이지 첨삭" }), F("youtubeId", "유튜브 주소", "youtube", { hint: "일부 공개(링크가 있는 사람만)로 올린 영상도 돼요." }),
        F("week", "주차", "select", { options: () => weekOpts("주차 없음"), get: (x) => (x.week ? String(x.week) : ""), set: (x, v) => { x.week = v ? Number(v) : ""; } }),
        F("date", "라이브 날짜", "date"), F("minutes", "영상 길이 (선택 · 예: 1:12:30)", "text", { hint: "유튜브 주소를 넣으면 실제 영상 길이로 자동으로 채워져요." }),
        F("summary", "핵심 정리 (영상 아래에 보여요)", "textarea", { rows: 6, rich: true, hint: "라이브에서 나온 핵심 내용, 자주 나온 질문을 짧게 정리해 두면 수강생이 다시 찾기 쉬워요." }),
        F("attachments", "라이브 자료 (선택)", "attachments")] },
    showcase: { name: "모범 과제", list: (c) => c.showcase || (c.showcase = []), idp: "sc", init: (ctx, seed) => Object.assign({ images: [] }, seed || {}),
      fields: [F("title", "제목", "text", { hint: "예: 상세페이지 첫 화면 · 한눈에 들어오는 구성" }),
        F("missionId", "이어 둘 과제 (선택)", "select", { options: () => [["", "연결 안 함"]].concat(missionOpts()), hint: "고르면 그 과제 화면에 ‘모범 과제 보기’가 떠요." }),
        F("week", "주차", "select", { options: () => weekOpts("주차 없음"), get: (x) => (x.week ? String(x.week) : ""), set: (x, v) => { x.week = v ? Number(v) : ""; } }),
        F("author", "작성자 표시 (선택)", "text", { hint: "이름은 꼭 가려 주세요. 예: 2기 김OO" }),
        F("images", "사진 (첫 사진이 크게 보여요 · 개인정보가 보이는 사진은 빼 주세요)", "images"),
        F("desc", "강사 코멘트 (어디가 잘했는지)", "textarea", { rows: 5, rich: true })] },
    glossary: { name: "용어", list: (c) => c.glossary || (c.glossary = []), idp: "gl", init: () => ({ category: "" }),
      fields: [F("term", "용어", "text", { hint: "예: 마진율, 개인통관고유부호" }), F("category", "분류 (선택)", "combo", { options: () => glossaryCats(), hint: "목록에서 고르거나 새 분류를 적으면 돼요." }),
        F("desc", "쉬운 풀이", "textarea", { rows: 4, hint: "수강생이 처음 들어도 이해할 수 있게 한두 문장으로. AI 조교도 이 풀이로 답해요." })] },
    notePrompt: { name: "회고 질문", list: (c) => c.notePrompts || (c.notePrompts = []), idp: "np", init: (ctx) => ({ week: Number(ctx) || 1 }),
      fields: [F("q", "질문", "text", { hint: "예: 이번 주 경쟁 상품을 보며 내 상품에 적용할 점은?" }),
        F("week", "주차", "select", { options: () => weekOpts(), get: (x) => String(x.week || 1), set: (x, v) => { x.week = Number(v) || 1; } })] },
    mv: { name: "응원 영상", prepend: true, list: (c) => c.motivation, idp: "mv", init: () => ({ date: todayStr() }),
      fields: [F("title", "영상 제목"), F("youtubeId", "유튜브 주소", "youtube"), F("minutes", "영상 길이 (예: 31:57)", "text", { hint: "유튜브 주소를 넣으면 실제 영상 길이로 자동으로 채워져요." }), F("date", "올린 날", "date")] }
  };
  ["ebook", "file"].forEach((k) => { COLL["res-" + k] = { name: "자료", list: (c) => c.resources[k], idp: k[0], fields: [F("title", "자료 이름"), F("meta", "형식 (예: 전자책 · 86쪽)"), F("desc", "한 줄 설명"), F("url", "열람·다운로드 주소 (구글 드라이브 등)", "url")] }; });
  ["vod", "senior"].forEach((k) => { COLL["res-" + k] = { name: "영상", list: (c) => c.resources[k], idp: k[0], init: () => ({ body: "", attachments: [] }),
    fields: [F("title", "영상 제목 (팝업 제목)"), F("meta", "형식 (예: 기초 · 15분)"), F("desc", "한 줄 설명 (목록에 보여요)"), F("youtubeId", "유튜브 주소", "youtube"),
      F("body", "본문 (게시판처럼 글을 쓰고, 사진은 [사진1] 자리에 들어가요)", "textarea", { rows: 14, rich: true, photos: true }), F("images", "사진 (여러 장 가능 · 첫 사진은 영상이 없을 때 썸네일)", "images"),
      F("attachments", "첨부 자료 (교습지·엑셀·PDF 등)", "attachments")] }; });
  const faqCats = () => C().faqs.map((f) => f.category || "기타").filter((c, i, a) => a.indexOf(c) === i);
  const glossaryCats = () => (C().glossary || []).map((g) => g.category).filter((c, i, a) => c && a.indexOf(c) === i);
  // 주차 · 과제 고르기 (기본 커리큘럼 기준 — 주차 번호는 기수별 커리큘럼에도 그대로 맞춰 보여요)
  const weekOpts = (none) => (none ? [["", none]] : []).concat(C().weeks.map((w) => [String(w.no), w.no + "주차 · " + w.title]));
  const missionOpts = () => C().weeks.flatMap((w) => w.missions.map((m) => [m.id, w.no + "주차 · " + m.title]));
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

  function editItem(coll, id, ctx, seed) {
    const def = COLL[coll], c = C();
    const list = def.list(c, ctx);
    const item = id ? list.find((x) => (x.id || String(x.no)) === id) : Object.assign({}, def.init ? def.init(ctx, seed) : {});
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
    const item = id ? list.find((x) => (x.id || String(x.no)) === id) : Object.assign({}, def.init ? def.init(ctx) : {});
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
      if (f.check) { const bad = f.check(v); if (bad) { err.textContent = bad; return; } }
      if (f.set) f.set(item, v); else item[f.key] = v;
    }
    const titleKey = def.fields[0].key;
    if (def.fields[0].type === "text" && !item[titleKey] && titleKey !== "type") { err.textContent = josa(def.fields[0].label, "을", "를") + " 입력해 주세요."; return; }
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
    if (form.dataset.coll === "showcase" && item.missionId && !item.week) { const w = C().weeks.find((x) => x.missions.some((m) => m.id === item.missionId)); if (w) item.week = w.no; }
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
    commit(josa(def.name, "을", "를") + " 저장했어요.");
  }
  function deleteItem(coll, id, ctx) {
    const def = COLL[coll], c = C();
    const list = def.list(c, ctx);
    const i = list.findIndex((x) => (x.id || String(x.no)) === id);
    if (i < 0) return;
    const label = list[i].title || list[i].q || def.name;
    confirmModal(def.name + " 삭제", "‘" + esc(label) + "’" + josa(label, "을", "를").slice(String(label).length) + " 삭제할까요?" + (coll === "week" ? "<br>이 주차의 강의와 과제도 함께 삭제돼요." : "") + "<br>수강생 화면에서도 바로 사라져요.", "삭제", true, () => {
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
    const ml = b.mainLec || {};
    const f = (k, label, v, hint, type) => '<div class="a-field"><label for="bf-' + k + '">' + label + "</label>" + (type === "textarea" ? '<textarea class="a-input" id="bf-' + k + '" name="' + k + '" rows="3">' + esc(v) + "</textarea>" : '<input class="a-input" id="bf-' + k + '" name="' + k + '" value="' + esc(v) + '"' + (type ? ' type="' + type + '"' : "") + ">") + (hint ? '<small class="a-muted">' + hint + "</small>" : "") + "</div>";
    return head("기본 정보 · 색상 · AI 조교" + (TRK() === "vod" ? " · LIVE · VOD 함께" : ""), "수강생 화면의 색상, 상단 이름, 로그인 화면 문구, AI 조교 이름을 정해요.") +
      '<form id="brand-form" class="a-card a-form">' +
        '<h2 class="a-sub">수강생 화면 색상</h2><p class="a-muted" style="margin:-6px 0 0">수강생 로그인 화면과 학습 화면 전체가 이 색으로 바뀌어요. 강사센터는 늘 파란색이에요.</p>' + themePicker(b.theme, "theme", IID()) +
        '<h2 class="a-sub">브랜드</h2><div class="a-form-row">' + f("name", "브랜드 이름", b.name, "로그인 화면 왼쪽 위·상단 작은 글씨") + f("instructor", "강사 표시 이름", b.instructor, "공지·수료증 서명·AI 조교 인사말에 쓰여요") + "</div>" +
        f("courseTitle", "강의 이름", b.courseTitle, "수강생 화면 맨 위 제목") +
        '<div class="a-form-row">' + f("shortTitle", "짧은 강의 이름", b.shortTitle, "로그인 화면 배지") + f("tagline", "한 줄 소개", b.tagline) + "</div>" +
        '<h2 class="a-sub">강사 프로필</h2><p class="a-muted" style="margin:-6px 0 0">두잉고 첫 화면의 ‘지금 강의하는 강사님’ 카드에 보여요. 배경을 지운(투명) 사진이나 밝은 배경의 상반신 사진이 잘 어울려요.</p>' +
        '<div class="a-brand-photo"><div class="a-brand-photo-box" id="brand-photo-box">' + brandPhotoBox(b.photo) + '</div><div class="a-brand-photo-ctl">' +
          '<label class="a-btn a-btn-ghost a-btn-sm">' + icon("image", "sm") + '사진 올리기<input type="file" accept="image/*" class="sr-only" id="brand-photo-file"></label>' +
          btn(icon("trash", "sm") + "지우기", "brand-photo-del", "a-btn-ghost a-btn-sm") + '<small class="a-muted">세로 4:5 비율로 보여요. 올리거나 지우면 바로 저장돼요.</small></div></div>' +
        '<div class="a-form-row">' + f("field", "강의 분야", b.field || "", "카드에서 이름 아래 작게 (예: 뉴질랜드 건기식 브랜딩)") + f("instagram", "인스타그램 주소", b.instagram || "", "카드에 아이콘으로 연결돼요", "url") + "</div>" +
        '<h2 class="a-sub">로그인 화면</h2>' +
        f("loginEyebrow", "헤드라인 위 작은 글씨", b.loginEyebrow, "영문 대문자로 적으면 잘 어울려요 (예: DOINGGO)") +
        f("loginHeadline", "헤드라인 (두 줄까지, 줄바꿈 가능)", b.loginHeadline, "마지막 줄은 고른 색으로 강조돼요", "textarea") +
        f("loginSub", "헤드라인 아래 설명", b.loginSub, "", "textarea") +
        '<div class="a-form-row">' + f("youtubeChannel", "유튜브 채널 주소", b.youtubeChannel, "", "url") + f("freeCourseUrl", "무료 강의 · 소개 페이지 주소", b.freeCourseUrl, "", "url") + "</div>" +
        '<h2 class="a-sub" id="bf-main">메인 강의 (외부 강의 플랫폼)</h2><p class="a-muted" style="margin:-6px 0 0">메인 강의 · 라이브 녹화본을 아이비클래스 같은 다른 플랫폼에서 운영한다면, 수강생 홈 · 주차별 강의 · 보충 강의 화면에 이 버튼이 떠요. 주차마다 다른 링크는 커리큘럼 › 주차 수정에서 넣을 수 있어요.</p>' +
        '<label class="a-check"><input type="checkbox" name="mlOn"' + (ml.on ? " checked" : "") + "><span>수강생 화면에 <b>메인 강의 들으러 가기</b> 버튼 보이기</span></label>" +
        '<div class="a-form-row">' + f("mlPlatform", "플랫폼 이름", ml.platform || "", "예: 아이비클래스") + f("mlLabel", "버튼 글씨", ml.label || "메인 강의 들으러 가기") + "</div>" +
        f("mlUrl", "메인 강의 링크 (URL)", ml.url || "", "수강생이 누르면 새 창으로 열려요", "url") +
        f("mlNote", "안내 한 줄", ml.note || "", "수강생 홈 카드에 보여요") +
        '<div class="a-form-row">' + f("lessonLabel", "주차별 짧은 영상 이름", b.lessonLabel || "", "비우면 ‘강의 영상’ · 예: 따라하기 영상") + "</div>" +
        '<h2 class="a-sub">강의 운영</h2><div class="a-form-row">' + f("liveTime", "주차 강의 오픈 시간", b.liveTime, "강의 일정의 ‘강의 오픈’ 옆에 표시", "time") + f("botName", "AI 조교 이름", b.botName, "수강생 메뉴와 대화창 이름 (예: " + esc(DB.botNameOf(b.instructor)) + ")") + "</div>" +
        '<div class="a-form-row">' + f("liveUrl", "주차 강의 입장 링크 (줌 등)", b.liveUrl || "", "넣으면 강의 오픈일에 수강생 홈·일정에 ‘입장하기’ 버튼이 생겨요", "url") + f("kakaoChannel", "카카오톡 문의 주소", b.kakaoChannel || "", "오픈채팅·채널 주소. 수강생 왼쪽 메뉴 아래에 ‘카카오톡 문의’ 버튼이 생겨요", "url") + "</div>" +
        '<label class="a-check"><input type="checkbox" name="worldClock"' + (b.worldClock ? " checked" : "") + '><span>수강생 화면 위에 <b>한국 · 뉴질랜드 현재 시간</b> 보이기 <small class="a-muted">(뉴질랜드 서머타임 자동 반영)</small></span></label>' +
        f("quotes", "오늘의 한마디 (한 줄에 하나)", (C().quotes || []).join("\n"), "홈·응원 영상 화면에 날마다 돌아가며 보여요", "textarea") +
        '<div class="a-form-foot"><button class="a-btn a-btn-primary" type="submit">저장</button></div>' +
      "</form>";
  }
  // 강사 프로필 사진 — 투명 배경을 살리려고 webp(안 되면 png)로 줄여 저장한다
  const brandPhotoBox = (v) => (v ? '<img src="' + esc(v) + '" alt="강사 프로필 사진">' : '<span>' + icon("user") + "사진 없음</span>");
  function brandPhotoCompress(file, cb) {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const sc = Math.min(1, 900 / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        let d = cv.toDataURL("image/webp", 0.86);
        if (d.indexOf("data:image/webp") !== 0) d = /png|webp|gif/.test(file.type) ? cv.toDataURL("image/png") : cv.toDataURL("image/jpeg", 0.86);
        cb(d);
      };
      img.onerror = () => toast("사진을 읽지 못했어요.", "warn");
      img.src = r.result;
    };
    r.readAsDataURL(file);
  }
  function setBrandPhoto(v) {
    const b = C().brand, prev = b.photo;
    b.photo = v;
    if (!DB.save()) { b.photo = prev; toast("저장 공간이 부족해요. 더 작은 사진을 올려 주세요.", "warn"); return; }
    const box = document.getElementById("brand-photo-box");
    if (box) box.innerHTML = brandPhotoBox(v);
    toast(v ? "프로필 사진을 저장했어요." : "프로필 사진을 지웠어요.");
  }
  function saveBrand(f) {
    const c = C(), b = c.brand;
    ["name", "instructor", "courseTitle", "shortTitle", "tagline", "field", "instagram", "loginEyebrow", "loginSub", "youtubeChannel", "freeCourseUrl", "liveTime", "botName", "liveUrl", "kakaoChannel"].forEach((k) => { b[k] = f[k].value.trim(); });
    if (f.theme) { b.theme = f.theme.value; b.themeSet = true; }
    b.worldClock = !!(f.worldClock && f.worldClock.checked);
    if (f.mlUrl) {
      const u = f.mlUrl.value.trim();
      if (u && !/^https?:\/\//i.test(u)) { toast("메인 강의 링크는 https:// 로 시작하는 주소로 넣어 주세요.", "warn"); return; }
      b.mainLec = { on: !!f.mlOn.checked, platform: f.mlPlatform.value.trim(), label: f.mlLabel.value.trim() || "메인 강의 들으러 가기", url: u, note: f.mlNote.value.trim() };
      b.lessonLabel = f.lessonLabel.value.trim();
    }
    b.loginHeadline = f.loginHeadline.value.split("\n").map((x) => x.trim()).filter(Boolean).join("\n");
    c.quotes = LINES(f.quotes.value);
    if (!b.name) { toast("브랜드 이름을 입력해 주세요.", "warn"); return; }
    const ins = INS();
    commit("기본 정보를 저장했어요.");
    if (ins) { /* 수강생 로그인 선택지 이름은 마스터가 관리 */ }
  }
  // 메인 강의(외부 플랫폼) 링크를 커리큘럼 화면에서도 바로 확인 · 수정
  function mlStrip() {
    const ml = C().brand.mainLec;
    if (TRK() === "vod" || !ml) return "";
    return '<section class="a-card a-ml-strip"><span class="a-ml-ic">' + icon("link", "sm") + '</span><div class="a-grow"><b>메인 강의 · ' + esc(ml.platform || "외부 강의실") + (ml.on ? "" : " (꺼짐)") + '</b><small class="a-muted">' + esc(ml.url || "링크가 비어 있어요 — 수강생에게 ‘링크 준비 중’으로 보여요") + "</small></div>" + '<a class="a-btn a-btn-ghost a-btn-sm" href="#/center/brand">' + icon("pen", "sm") + "링크 수정</a></section>";
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
    return head("커리큘럼", "커리큘럼을 여러 개 만들어 두고 기수마다 골라 쓸 수 있어요 (예: 1·2기 5주 과정, 3기부터 4주 과정). 주차를 더하거나 지우면 그 커리큘럼을 쓰는 기수의 기간·일정이 자동으로 바뀌어요" + (co ? " (" + esc(co.name) + " 기준 날짜 표시)" : "") + ".", addBtn("week", "주차 추가")) + curBar() + mlStrip() +
      (c.weeks.length ? '<div class="a-stack">' + c.weeks.map((w, wi) =>
        '<section class="a-card"><div class="a-card-head"><span class="a-weekno">' + w.no + "주차</span><div class=\"a-grow\"><h2>" + esc(w.title) + '</h2><p class="a-muted">' + esc(w.subtitle || w.summary || "") + (co ? " · 강의일 " + fmtMD(DB.classDate(co, w.no)) : "") + "</p></div>" + rowTools("week", String(w.no), "", wi, c.weeks.length) + "</div>" +
          (w.goal || (w.topics || []).length ? '<div class="a-cw-info">' + (w.goal ? "<p><b>핵심 목표</b>" + esc(w.goal) + "</p>" : "") + ((w.topics || []).length ? "<p><b>강의 내용 " + w.topics.length + "</b>" + esc(w.topics.join(" · ")) + "</p>" : "") + "</div>"
            : '<p class="a-cw-empty">' + icon("alert", "xs") + " 핵심 목표와 강의 내용을 적으면 수강생 커리큘럼에 보여요. ‘수정’을 눌러 채워 주세요.</p>") +
          (w.lessons.length ? '<ul class="a-items">' + w.lessons.map((l, i) => '<li><div class="a-item-main"><b>' + esc(l.title) + "</b><small>" + (l.minutes || l.durSec ? DB.vdur.label(l.youtubeId, l.durSec, l.minutes ? l.minutes + "분" : "") + " · " : "") + esc(l.desc || "") + "</small></div>" + ytBadge(l) + rowTools("lesson", l.id, w.no, i, w.lessons.length) + "</li>").join("") + "</ul>" : '<p class="a-muted a-pad">아직 강의가 없어요.</p>') +
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
    const cls = { qna: "warn", notice: "mute", challenge: "ok", event: "dark", open: "info", deadline: "bad", replay: "info", bonus: "warn", free: "warn", offline: "dark" }, L = (t) => DB.evLabel(iid, t);
    const auto = ["open", "deadline"].concat(DB.calTypes(iid).indexOf("replay") >= 0 && DB.calManual(iid).indexOf("replay") < 0 ? ["replay"] : []).map((k) => "‘" + L(k) + "’").join(" · ");
    return head("수업 캘린더", auto + "은 기수 시작일로 자동 계산돼요. " + DB.calManual(iid).filter((k) => k !== "open").map(L).join(" · ") + " 같은 일정만 추가하세요. 기수 하나의 무료 강의 · 오프라인 강의 · 챌린지 날짜는 ‘기수 관리 › 일정 설계’에서 한 번에 정할 수도 있어요.", addBtn("event", "일정 추가")) +
      '<section class="a-card"><div class="a-card-head"><h2>추가한 일정</h2><span class="a-muted">' + c.schedule.length + "개</span></div>" +
        simpleList("event", c.schedule, (e) => '<div class="a-item-main"><b>' + esc(e.title) + "</b><small>" + esc(DB.ruleText(e)) + (e.time ? " · " + esc(e.time) : "") + (e.place ? " · " + esc(e.place) : "") + "</small></div>" + pill(L(e.type), cls[e.type]), "추가한 일정이 없어요.") + "</section>" +
      '<section class="a-card"><div class="a-card-head"><h2>기수별 전체 일정 미리보기</h2><select class="a-input a-sm" id="sched-cohort" aria-label="기수">' + cos.map((x) => '<option value="' + x.id + '"' + (x.id === ui.schedCohort ? " selected" : "") + ">" + esc(x.name) + "</option>").join("") + "</select>" + (co ? btn(icon("eye", "sm") + "수강생 화면 미리보기", "plan-pv", "a-btn-ghost a-btn-sm", ' data-iid="' + esc(iid) + '" data-id="' + esc(co.id) + '" data-pg="schedule"') : "") + "</div>" +
        (co ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>날짜</th><th>종류</th><th>일정</th></tr></thead><tbody>' + DB.events(iid, co).map((e) => '<tr><td class="num">' + fmtMD(e.date) + (e.time ? " " + esc(e.time) : "") + "</td><td>" + pill(L(e.type), cls[e.type]) + "</td><td>" + esc(e.title) + (e.place ? ' <small class="a-muted">· ' + esc(e.place) + "</small>" : "") + (e.auto ? ' <small class="a-muted">자동</small>' : "") + "</td></tr>").join("") + "</tbody></table></div>" : emptyBox("calendar", "기수를 먼저 만들어 주세요.")) +
      "</section>";
  }
  function pageNotices() {
    const list = C().notices.slice().sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date));
    return head(TRK() === "vod" ? "업데이트 소식 · VOD 버전" : "클래스 소식 (공지사항)", "수강생 홈과 ‘클래스 소식 · 공지사항’ 메뉴에 보여요. 글 · 사진 여러 장 · 유튜브/비메오 영상을 함께 올릴 수 있어요. ‘필독’으로 고정하면 맨 위에 떠요.", addBtn("notice", "공지 쓰기")) +
      '<section class="a-card">' + (list.length ? '<ul class="a-items">' + list.map((n) => '<li><div class="a-item-main"><b>' + esc(n.title) + "</b><small>" + fmtFull(n.date) + " · " + esc((n.body || "").slice(0, 60)) + "</small></div>" + ((n.images || []).length ? pill("사진 " + n.images.length, "info") : "") + ((n.videos || []).length || DB.youtubeId(n.youtubeId) ? pill("영상 " + ((n.videos || []).length || 1), "info") : "") + (n.pinned ? pill("필독", "dark") : "") +
        '<div class="a-row-actions">' + btn(icon("pen", "sm") + "수정", "item-edit", "a-btn-ghost a-btn-sm", ' data-coll="notice" data-id="' + n.id + '"') + "</div></li>").join("") + "</ul>" : emptyBox("megaphone", "아직 공지가 없어요.")) + "</section>";
  }
  function pageFaq() {
    const c = C();
    const cats = faqCats();
    return head("FAQ · 자주 묻는 질문" + (TRK() === "vod" ? " · VOD 버전" : ""), "수강생 ‘질문 · 요청’ 메뉴의 FAQ 검색에 분류별로 보이고, AI 조교도 이 답변을 바탕으로 대답해요.", btn(icon("clipboard", "sm") + "한꺼번에 붙여넣기", "faq-bulk", "a-btn-outline") + addBtn("faq", "질문 추가")) +
      (c.faqs.length ? cats.map((cat) => {
        const items = c.faqs.filter((f) => (f.category || "기타") === cat);
        return '<section class="a-card"><div class="a-card-head"><h2>' + esc(cat) + '</h2><span class="a-muted">' + items.length + "개</span></div>" +
          '<ul class="a-items">' + items.map((f) => { const i = c.faqs.indexOf(f); return '<li><div class="a-item-main"><b>Q. ' + esc(f.q) + "</b><small>" + esc(f.a) + "</small></div>" + rowTools("faq", f.id, "", i, c.faqs.length) + "</li>"; }).join("") + "</ul></section>";
      }).join("") : '<section class="a-card">' + emptyBox("help", "자주 묻는 질문이 없어요.", btn(icon("clipboard", "sm") + "한꺼번에 붙여넣기", "faq-bulk", "a-btn-primary")) + "</section>") +
      '<p class="a-hint">' + icon("bug", "xs") + " 수강생의 오류·불편 신고는 ‘1:1 요청 답변’ 메뉴에서 답해 주세요.</p>";
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
    return head("시작 가이드 · 빠른 이동" + (TRK() === "vod" ? " · VOD 버전" : ""), "수강생 홈 맨 위에 체크리스트로 보여요. 수강생이 모두 체크하면 자동으로 사라져요. 1주차 항목은 처음 한 번, ‘보이는 주차’를 정한 항목은 그 주차가 열릴 때 다시 떠요.", addBtn("guide", "단계 추가")) +
      '<section class="a-card">' + simpleList("guide", C().guide, (g) => '<div class="a-item-main"><b>' + esc(g.title) + "</b><small>" + esc([g.desc, g.url].filter(Boolean).join(" · ")) + "</small></div>" + pill((Number(g.week) || 1) <= 1 ? "처음 한 번" : g.week + "주차", (Number(g.week) || 1) <= 1 ? "mute" : "info"), "단계가 없어요. 단계가 없으면 홈에 시작 가이드가 보이지 않아요.") + "</section>" +
      '<p class="a-hint">' + icon("alert", "xs") + " 예: 오픈채팅방 입장 → 공지 읽기 → 1주차 첫 강의 보기 → AI 조교에게 질문해 보기 · 2주차: 2주차 라이브 다시보기 → 마진 계산기 써 보기</p>" +
      '<div class="a-card-head" style="margin-top:28px"><h2 class="a-grow">빠른 이동 (홈 바로 가기)</h2>' + btn("기본 목록으로", "ql-reset", "a-btn-ghost a-btn-sm") + addBtn("ql", "페이지 추가") + "</div>" +
      '<p class="a-muted" style="margin:0 0 12px">수강생 홈 공지사항 밑에 카드로 보여요. 플랫폼 안 메뉴는 윗줄(기본 색), https:// 외부 링크는 아랫줄(아이콘 색)로 나뉘어요. 꺼진 메뉴나 주소가 빈 카드는 보이지 않아요.</p>' +
      '<section class="a-card">' + simpleList("ql", qls, (l) => '<div class="a-item-main"><b>' + icon(l.icon || "link", "xs") + " " + esc(l.title) + "</b><small>" + esc([l.desc, l.url || "주소 없음 (숨김)"].filter(Boolean).join(" · ")) + "</small></div>" + (l.color ? '<span class="a-ql-swatch" style="background:' + esc(l.color) + '"></span>' : "") + (/^https?:/i.test(l.url || "") ? pill("외부 링크 · 아랫줄", "info") : !l.url ? pill("숨김", "mute") : pill("플랫폼 · 윗줄", "mute")), "자주 찾는 페이지가 없어요.") + "</section>";
  }
  function pageMenus() {
    ui.mMenuIns = MID();
    return pageMasterMenus({ params: new URLSearchParams() }, true);
  }
  function pageDocs() {
    return head(TRK() === "vod" ? "실습 체크리스트 · VOD 버전" : "실무 체크리스트", "판매 시작 전에 필요한 서류 · 준비 단계를 안내하고, 수강생이 하나씩 체크해요. 순서는 화살표로 바꿀 수 있어요.", addBtn("doc", "단계 추가")) +
      '<section class="a-card">' + simpleList("doc", C().docsGuide, (g) => '<div class="a-item-main"><b>' + esc(g.title) + "</b><small>" + esc([g.where, g.time, g.cost].filter(Boolean).join(" · ")) + "</small></div>", "서류 단계가 없어요.") + "</section>";
  }
  function pageChannels() {
    const list = DB.channelsOf(C());
    return head("1:1 상담 채널" + (TRK() === "vod" ? " · VOD 버전" : ""), "수강생 메뉴 ‘1:1 상담’에 카드로 보여요. 카카오톡 채널 · 채널톡 · 네이버 톡톡 · 이메일 · 전화 등 강사님이 실제로 쓰는 상담 창구를 넣어 두면, 수강생이 누르는 순간 그 채널로 연결돼요.", addBtn("channel", "채널 추가")) +
      '<section class="a-card">' + simpleList("channel", list, (ch) => { const t = DB.channelType(ch.type), lk = DB.channelLook(ch); return '<span class="a-ch-ic" style="background:' + (lk.color || "var(--m-primary)") + ";color:" + (lk.ink || "#fff") + '">' + icon(lk.icon, "sm") + '</span><div class="a-item-main"><b>' + esc(ch.title || t.label) + "</b><small>" + esc([ch.tag, t.label, ch.hours, ch.url || ((ch.note || "").trim() ? "링크 없이 안내 문구만 보여요" : "주소 없음 (수강생에게 ‘준비 중’으로 보여요)")].filter(Boolean).join(" · ")) + "</small></div>" + (ch.url ? pill("연결됨", "ok") : (ch.note || "").trim() ? pill("안내만 (링크 없음)", "info") : pill("준비 중", "mute")); }, "채널이 없어요. ‘채널 추가’로 상담 창구를 만들어 주세요.") + "</section>" +
      '<p class="a-hint">' + icon("alert", "xs") + " 순서는 화살표로 바꿀 수 있어요. 메뉴를 숨기려면 ‘메뉴 구성’에서 1:1 상담을 꺼 주세요.</p>";
  }
  /* ---------------- 코치 관리 (강사 전용) ---------------- */
  function coachStats(iid, coachId) {
    let rv = 0, an = 0;
    DB.studentsOf(iid).forEach((st) => {
      const p = DB.progress(st.id);
      Object.keys(p.submissions || {}).forEach((mid) => (p.submissions[mid] || []).forEach((sb) => { if (sb.review && sb.review.byId === coachId) rv++; }));
      (p.questions || []).forEach((q) => { if (q.answeredById === coachId) an++; });
    });
    return { rv, an };
  }
  const permLabel = (k) => { for (const g of COACH_PERMS) for (const x of g[1]) if (x[0] === k) return x[1]; return k; };
  function pageCoaches() {
    const iid = IID(), list = DB.coachesOf(iid);
    return head("코치 관리", "코치는 강사센터 로그인 화면의 <b>‘코치’ 탭</b>에서 이름 + 전화번호 뒷자리로 로그인해요. 코치마다 볼 수 있는 메뉴를 정해 주면, 그 메뉴만 보이고 나머지는 들어갈 수 없어요.", btn(icon("userPlus", "sm") + "코치 추가", "coach-add", "a-btn-primary")) +
      '<section class="a-card">' + (list.length ? '<ul class="a-items a-coach-list">' + list.map((x) => {
        const st = coachStats(iid, x.id);
        return '<li><span class="a-avatar a-coach-av">' + esc(x.name.slice(0, 1)) + '</span><div class="a-item-main"><b>' + esc(x.name) + ' 코치 <span class="a-muted num">· 뒷자리 ' + esc(x.phone4) + "</span></b>" +
          "<small>" + esc([x.memo, "검수 " + st.rv + "건 · 답변 " + st.an + "건", x.lastLoginAt ? "최근 접속 " + fmtStamp(x.lastLoginAt) : "아직 접속 전"].filter(Boolean).join(" · ")) + "</small>" +
          '<span class="a-coach-perms">' + ((x.perms || []).length ? x.perms.map((k) => '<span class="a-perm">' + esc(permLabel(k)) + "</span>").join("") : '<span class="a-muted">열린 메뉴 없음 (대시보드만)</span>') + "</span></div>" +
          (x.status === "active" ? pill("사용 중", "ok") : pill("중지", "mute")) +
          '<div class="a-row-actions">' + btn(icon("pen", "sm") + "수정", "coach-edit", "a-btn-ghost a-btn-sm", ' data-id="' + x.id + '"') + "</div></li>";
      }).join("") + "</ul>" : emptyBox("shieldCheck", "아직 코치가 없어요. ‘코치 추가’로 과제 검수 · 문의 답변을 도와줄 코치 계정을 만들어 주세요.", btn(icon("userPlus", "sm") + "코치 추가", "coach-add", "a-btn-primary"))) + "</section>" +
      '<p class="a-hint">' + icon("alert", "xs") + " 코치가 승인 · 보완 요청한 과제와 답변에는 처리한 코치 이름이 남아요. 코치 계정을 잠시 막으려면 ‘중지’로 바꾸면 돼요.</p>";
  }
  function coachForm(id) {
    const iid = IID(), x = id ? DB.coach(iid, id) : { name: "", phone4: "", status: "active", perms: COACH_DEFAULT.slice(), memo: "" };
    if (!x) return;
    const has = (k) => (x.perms || []).indexOf(k) !== -1;
    openModal(id ? x.name + " 코치 수정" : "코치 추가",
      '<form id="coach-form" class="a-form" data-id="' + esc(id || "") + '" novalidate>' +
        '<div class="a-form-row"><div class="a-field"><label for="cf-cname">코치 이름 <small>(로그인 이름)</small></label><input class="a-input" id="cf-cname" name="cname" value="' + esc(x.name) + '" placeholder="예: 김하나"></div>' +
        '<div class="a-field"><label for="cf-cphone">전화번호 뒷자리 <small>(비밀번호)</small></label><input class="a-input" id="cf-cphone" name="cphone" inputmode="numeric" maxlength="4" value="' + esc(x.phone4) + '" placeholder="숫자 4자리"></div></div>' +
        '<div class="a-form-row"><div class="a-field"><label for="cf-cmemo">담당 업무 메모 <small>(선택 · 코치 대시보드에 보여요)</small></label><input class="a-input" id="cf-cmemo" name="cmemo" value="' + esc(x.memo || "") + '" placeholder="예: 과제 검수 · 1:1 문의 담당"></div>' +
        '<div class="a-field"><label for="cf-cstatus">상태</label><select class="a-input" id="cf-cstatus" name="cstatus"><option value="active"' + (x.status === "active" ? " selected" : "") + '>사용 중</option><option value="paused"' + (x.status !== "active" ? " selected" : "") + ">중지 (로그인 막기)</option></select></div></div>" +
        '<div class="a-field"><span class="a-label">볼 수 있는 메뉴 <small>(대시보드 · 수강생 화면 보기는 늘 열려 있어요)</small></span>' +
          '<div class="a-perm-presets">' + btn("과제 · 문의만", "coach-preset", "a-btn-ghost a-btn-sm", ' data-k="basic"') + btn("운영 전체", "coach-preset", "a-btn-ghost a-btn-sm", ' data-k="ops"') + btn("모두 선택", "coach-preset", "a-btn-ghost a-btn-sm", ' data-k="all"') + btn("모두 해제", "coach-preset", "a-btn-ghost a-btn-sm", ' data-k="none"') + "</div>" +
          COACH_PERMS.map((g) => '<fieldset class="a-perm-group"><legend>' + esc(g[0]) + "</legend>" + g[1].map((p) => '<label class="a-check"><input type="checkbox" name="perm" value="' + p[0] + '"' + (has(p[0]) ? " checked" : "") + "><span>" + esc(p[1]) + (p[2] ? ' <small class="a-muted">' + esc(p[2]) + "</small>" : "") + "</span></label>").join("") + "</fieldset>").join("") +
        '</div><p class="a-error" id="coach-error"></p></form>',
      (id ? btn(icon("trash", "sm") + "삭제", "coach-delete", "a-btn-ghost danger", ' data-id="' + esc(id) + '"') : "") + '<span class="a-spacer"></span>' + btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="coach-form">저장</button>', "lg");
  }
  function saveCoach(f) {
    const iid = IID(), list = DB.coachesOf(iid), id = f.dataset.id, err = document.getElementById("coach-error");
    const name = f.cname.value.trim(), phone4 = f.cphone.value.trim();
    if (!name) { err.textContent = "코치 이름을 입력해 주세요."; return; }
    if (!/^\d{4}$/.test(phone4)) { err.textContent = "전화번호 뒷자리는 숫자 4자리로 입력해 주세요."; return; }
    const same = (a, b) => a.replace(/\s+/g, "") === b.replace(/\s+/g, "");
    if (DB.data.instructors.some((ins) => same(ins.name, name) && ins.phone4 === phone4) || DB.data.instructors.some((ins) => (ins.coaches || []).some((c) => c.id !== id && same(c.name, name) && c.phone4 === phone4))) { err.textContent = "같은 이름 + 뒷자리 계정이 이미 있어요. 뒷자리나 이름을 바꿔 주세요."; return; }
    const perms = Array.from(f.querySelectorAll("input[name=perm]:checked")).map((x) => x.value);
    const data = { name, phone4, memo: f.cmemo.value.trim(), status: f.cstatus.value, perms };
    if (id) Object.assign(DB.coach(iid, id), data);
    else list.push(Object.assign({ id: DB.uid("coach"), createdAt: todayStr() }, data));
    commit(name + " 코치 계정을 저장했어요." + (id ? "" : " ‘코치’ 탭에서 이름 + 뒷자리로 로그인하면 돼요."));
  }
  function pagePartners() {
    const c = C(), list = DB.partnersOf(c), G = DB.PARTNER_GROUPS;
    return head("제휴 혜택" + (TRK() === "vod" ? " · VOD 버전" : ""), "수강생 메뉴 ‘제휴 혜택’에 탭(전체보기 · 두고그룹 · 제휴사)으로 보여요. ‘맨 위에 크게’를 켠 곳(예: 두고 N카페)은 가장 위에 큰 카드와 ‘제휴 혜택 · 할인 코드 안내’ 띠로 보여요.", addBtn("partner", "제휴처 추가")) +
      '<section class="a-card">' + simpleList("partner", list, (x) => { const lk = DB.channelLook(Object.assign({ type: "other" }, x)); return '<span class="a-ch-ic" style="background:' + (lk.color || "var(--m-primary)") + ";color:" + DB.inkOn(lk.color) + '">' + icon(lk.icon, "sm") + '</span><div class="a-item-main"><b>' + esc(x.title) + "</b><small>" + esc([x.tag, x.url || "주소 없음 (‘준비 중’으로 보여요)"].filter(Boolean).join(" · ")) + "</small></div>" +
        pill((G.find((g) => g.key === x.group) || G[0]).label, x.group === "doogo" ? "dark" : "info") + (x.featured ? pill("맨 위 크게", "ok") : ""); }, "제휴처가 없어요. ‘제휴처 추가’로 만들어 주세요.") + "</section>" +
      '<p class="a-hint">' + icon("alert", "xs") + " 순서는 화살표로 바꿀 수 있어요. 메뉴를 숨기려면 ‘메뉴 구성’에서 제휴 혜택을 꺼 주세요. " + (Array.isArray(c.partners) || IID() === "moon" ? "" : "지금은 문대표 기본 구성(강사님 이름으로 바뀜)이 보이고 있어요. 하나라도 수정하면 강사님 것으로 저장돼요.") + "</p>";
  }
  function pageLibrary() {
    const c = C();
    const tabs = [["ebook", "전자책 · 가이드북"], ["file", "자료 파일"], ["vod", "이커머스 실전 VOD"], ["senior", "시니어 기초 가이드"]];
    const k = ui.libTab;
    const items = c.resources[k];
    const isVideo = k === "vod" || k === "senior";
    const ln = DB.libNoticeOf(c);
    return head("강의 자료함" + (TRK() === "vod" ? " · VOD 버전" : ""), "수강생 ‘강의 자료함’ 4개 분류에 자료와 영상을 올려요. VOD · 시니어 기초 가이드는 게시판처럼 영상(선택) + 글 + 사진 + 첨부 자료를 한 페이지로 보여 줘요.", addBtn("res-" + k, isVideo ? "글 쓰기" : "자료 추가")) +
      '<section class="a-card a-libnote"><div class="a-card-head"><span class="a-menu-ico">' + icon("shield", "sm") + '</span><div class="a-grow"><h2>자료실 이용 안내 팝업</h2><p class="a-muted">수강생이 자료실에 들어올 때마다 떠요. ‘' + esc(ln.button) + "’을 눌러야 자료가 보이고, 자료실 화면에는 열람자 이름 · 기수 · 시각이 옅게 표시돼요.</p></div>" +
        btn(icon("pen", "sm") + "문구 수정", "libnote-edit", "a-btn-ghost a-btn-sm") + "</div></section>" +
      '<section class="a-card"><div class="a-toolbar"><div class="a-tabs">' + tabs.map((t) => '<button type="button" class="a-tab' + (k === t[0] ? " on" : "") + '" data-action="lib-tab" data-k="' + t[0] + '">' + t[1] + ' <span class="num">' + c.resources[t[0]].length + "</span></button>").join("") + "</div></div>" +
        simpleList("res-" + k, items, (it) => '<div class="a-item-main"><b>' + esc(it.title) + "</b><small>" + esc([it.meta, it.desc].filter(Boolean).join(" · ")) + "</small></div>" + ((it.attachments || []).length ? pill("첨부 " + it.attachments.length, "info") : "") + (it.tool ? pill("계산기", "info") : isVideo ? ytBadge(it) : it.url ? pill("링크 연결됨", "ok") : pill("준비 중", "mute")), "아직 자료가 없어요.") + "</section>";
  }
  function pageMotivation() {
    return head("응원 영상" + (TRK() === "vod" ? " · VOD 버전" : ""), "맨 위 영상이 수강생 홈의 ‘오늘의 응원 영상’으로 보여요. 새로 올린 영상은 맨 위에 들어가요. 한마디 문구는 기본 정보에서 고쳐요.", addBtn("mv", "영상 추가")) +
      '<section class="a-card">' + simpleList("mv", C().motivation, (it) => '<div class="a-item-main"><b>' + esc(it.title) + "</b><small>" + esc([it.minutes, it.date ? fmtMD(it.date) : ""].filter(Boolean).join(" · ")) + "</small></div>" + ytBadge(it), "응원 영상이 없어요.") + "</section>";
  }

  /* ---------------- 새 수강생 메뉴: 라이브 다시보기 · 모범 과제 · 용어 사전 · 학습 노트 질문 ---------------- */
  // 내용이 하나도 없으면 수강생 메뉴에 안 보인다는 안내 (메뉴 구성에서 꺼 두었으면 그 안내)
  function menuNote(key, n) {
    if (!DB.menuOn(IID(), key)) return '<p class="a-hint">' + icon("alert", "xs") + " 지금은 ‘메뉴 구성’에서 꺼져 있어요. 켜면 수강생 왼쪽 메뉴에 나타나요.</p>";
    return n ? "" : '<p class="a-hint">' + icon("eye", "xs") + " 하나라도 올리면 수강생 왼쪽 메뉴에 자동으로 나타나요. 지금은 비어 있어서 수강생에게 보이지 않아요.</p>";
  }
  const editRow = (coll, it, main) => "<li>" + main + '<div class="a-row-actions">' + btn(icon("pen", "sm") + "수정", "item-edit", "a-btn-ghost a-btn-sm", ' data-coll="' + coll + '" data-id="' + esc(it.id) + '"') + "</div></li>";
  function pageReplays() {
    const list = (C().replays || []).slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    return head("라이브 다시보기", "지난 라이브 녹화를 올리면 수강생 ‘라이브 다시보기’에 주차별로 모여요. 영상 아래 ‘핵심 정리’를 적어 두면 다시 찾기 쉬워요.", addBtn("replay", "다시보기 올리기")) +
      menuNote("replays", list.length) +
      '<section class="a-card">' + (list.length ? '<ul class="a-items">' + list.map((it) => editRow("replay", it, '<div class="a-item-main"><b>' + esc(it.title) + "</b><small>" + esc([it.week ? it.week + "주차" : "", it.date ? fmtFull(it.date) : "", it.minutes || ""].filter(Boolean).join(" · ")) + "</small></div>" + ytBadge(it) + ((it.attachments || []).length ? pill("자료 " + it.attachments.length, "info") : ""))).join("") + "</ul>"
        : emptyBox("monitorPlay", "아직 올린 다시보기가 없어요.", addBtn("replay", "첫 다시보기 올리기"))) + "</section>";
  }
  function pageShowcase() {
    const list = (C().showcase || []).slice().sort((a, b) => (Number(a.week) || 99) - (Number(b.week) || 99));
    const mName = (id) => { const o = missionOpts().find((x) => x[0] === id); return o ? o[1] : ""; };
    return head("모범 과제", "잘한 과제를 골라 사진과 코멘트를 올리면 수강생이 보고 따라 할 수 있어요. ‘과제 검수’에서 제출물을 열고 <b>모범 과제로 올리기</b>를 눌러도 바로 만들어져요.", addBtn("showcase", "모범 과제 추가")) +
      menuNote("showcase", list.length) +
      '<section class="a-card">' + (list.length ? '<ul class="a-items">' + list.map((it) => editRow("showcase", it,
          ((it.images || [])[0] ? '<img class="a-sc-thumb" src="' + esc(it.images[0].data || it.images[0].url) + '" alt="">' : '<span class="a-sc-thumb">' + icon("trophy", "sm") + "</span>") +
          '<div class="a-item-main"><b>' + esc(it.title) + "</b><small>" + esc([it.week ? it.week + "주차" : "", it.missionId ? mName(it.missionId) : "", it.author || ""].filter(Boolean).join(" · ")) + "</small></div>" + ((it.images || []).length ? pill("사진 " + it.images.length, "info") : ""))).join("") + "</ul>"
        : emptyBox("trophy", "아직 모범 과제가 없어요. 과제 검수에서 잘한 제출물을 열고 ‘모범 과제로 올리기’를 눌러 보세요.")) + "</section>";
  }
  function pageGlossary() {
    const G = C().glossary || [];
    const cats = G.map((g) => g.category || "").filter((c, i, a) => a.indexOf(c) === i).sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b, "ko"));
    return head("용어 사전" + (TRK() === "vod" ? " · VOD 버전" : ""), "강의에 나오는 용어를 쉬운 말로 풀어 두면 수강생 ‘용어 사전’에 가나다 순으로 보이고, AI 조교도 ‘○○가 뭐예요?’에 이 풀이로 답해요.", btn(icon("clipboard", "sm") + "한꺼번에 붙여넣기", "gl-bulk", "a-btn-outline") + addBtn("glossary", "용어 추가")) +
      menuNote("glossary", G.length) +
      (G.length ? cats.map((cat) => {
        const items = G.filter((g) => (g.category || "") === cat).sort((a, b) => String(a.term).localeCompare(String(b.term), "ko"));
        return '<section class="a-card"><div class="a-card-head"><h2>' + esc(cat || "분류 없음") + '</h2><span class="a-muted">' + items.length + "개</span></div>" +
          '<ul class="a-items">' + items.map((it) => editRow("glossary", it, '<div class="a-item-main"><b>' + esc(it.term) + "</b><small>" + esc(String(it.desc || "").slice(0, 80)) + "</small></div>")).join("") + "</ul></section>";
      }).join("") : '<section class="a-card">' + emptyBox("bookA", "아직 등록한 용어가 없어요.", btn(icon("clipboard", "sm") + "한꺼번에 붙여넣기", "gl-bulk", "a-btn-primary")) + "</section>");
  }
  function glBulkModal() {
    openModal("용어 한꺼번에 붙여넣기",
      '<form id="gl-bulk-form" class="a-form" novalidate><p class="a-muted" style="margin:0">한 줄에 용어 하나씩, <b>용어 : 풀이</b> 형식으로 붙여 넣으면 한 번에 등록돼요. [분류] 줄은 없어도 돼요.</p>' +
      '<pre class="a-format">[세금 · 사업자]\n간이과세자 : 연 매출이 적은 개인사업자. 부가세 부담이 적어요.\n부가세 : 물건값에 붙는 10% 세금.\n\n[판매 · 마케팅]\n객단가 : 손님 한 명이 한 번에 쓰는 평균 금액.</pre>' +
      '<div class="a-field"><label for="gb-text">붙여넣을 내용</label><textarea class="a-input" id="gb-text" name="text" rows="10" placeholder="용어 : 풀이"></textarea><small class="a-muted" id="gb-count">0개 인식됨</small></div>' +
      '<label class="a-check"><input type="checkbox" name="replace"><span>기존 용어를 모두 지우고 이걸로 바꾸기</span></label></form>',
      btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="gl-bulk-form">등록</button>', "lg");
  }
  function parseGlossaryText(text) {
    let cat = "";
    const out = [];
    String(text || "").split(/\r?\n/).forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      const m = line.match(/^\[(.+)\]$/);
      if (m) { cat = m[1].trim(); return; }
      const k = line.search(/\s*[:：]\s*|\s+[-–—]\s+|\t/);
      if (k <= 0) return;
      const term = line.slice(0, k).replace(/^[-•·*]\s*/, "").trim(), desc = line.slice(k).replace(/^\s*([:：]|[-–—]|\t)\s*/, "").trim();
      if (term && desc) out.push({ term: term.slice(0, 60), desc: desc.slice(0, 600), category: cat });
    });
    return out;
  }
  function pageNotePrompts() {
    const P = C().notePrompts || [], weeks = C().weeks;
    return head("학습 노트 질문", "주차마다 수강생이 스스로 돌아볼 질문을 정해요. 수강생은 ‘학습 노트’에서 답을 적고, 강의 화면에서 쓴 메모도 같이 모여요. 질문을 비워 둔 주차는 기본 질문 3개가 나가요.") +
      menuNote("notes", 1) +
      (weeks.length ? weeks.map((w) => {
        const own = P.filter((x) => Number(x.week) === w.no);
        return '<section class="a-card"><div class="a-card-head"><h2>' + w.no + "주차 · " + esc(w.title) + "</h2>" + addBtn("notePrompt", "질문 추가", String(w.no), "a-btn-ghost a-btn-sm") + "</div>" +
          (own.length ? '<ul class="a-items">' + own.map((it, i) => editRow("notePrompt", it, '<span class="a-np-no">Q' + (i + 1) + '</span><div class="a-item-main"><b>' + esc(it.q) + "</b></div>")).join("") + "</ul>"
            : '<ul class="a-items a-np-default">' + DB.NOTE_PROMPTS.map((q, i) => '<li><span class="a-np-no">Q' + (i + 1) + '</span><div class="a-item-main"><span>' + esc(q) + "</span></div>" + pill("기본 질문", "mute") + "</li>").join("") + "</ul>") + "</section>";
      }).join("") : '<section class="a-card">' + emptyBox("notebookPen", "커리큘럼에 주차를 먼저 만들어 주세요.") + "</section>");
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
        '<button type="button" class="a-vsw' + (on ? " on" : "") + '" data-action="lp-toggle" data-k="' + k + '" role="switch" aria-checked="' + on + '" aria-label="' + esc(def.label) + ' 보이기"><i></i></button>' + icon("chevDown", "sm a-lp-chev") + "</summary>" +
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
      case "question": return lpField("question.badge", "작은 배지") + lpField("question.title", "제목") + lpField("question.desc", "설명", "textarea") + lpField("question.promise", "강조 문구 (설명 아래 초록 상자)", "textarea") + '<div class="a-form-row">' + lpField("question.label", "버튼 글자") + lpField("question.url", "질문 받는 주소 (구글폼 등)", "url", "비우면 이 페이지에서 질문을 받아요") + "</div>" + lpField("question.note", "버튼 아래 안내");
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
      case "question": return lpField("question.url", "‘내 질문 남기러 가기’ 버튼 링크", "url", "구글폼 등. 비워 두면 이 페이지에서 질문을 받아 ‘받은 질문’에 모아요.") + more(lpField("question.title", "제목") + lpField("question.desc", "설명", "textarea") + lpField("question.promise", "강조 문구 (설명 아래 초록 상자)", "textarea") + lpField("question.label", "버튼 글자") + lpField("question.badge", "작은 배지") + lpField("question.note", "버튼 아래 안내"));
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
    ui.lpKind = "free"; ui.lpHash = ROUTE.hash;
    const F = lpDraft(), iid = IID(), c = C();
    const url = ROUTE.abs("#/free/" + iid);
    if (!FREE_TABS.some((x) => x.id === ui.fcTab)) ui.fcTab = "schedule";
    const tab = FREE_TABS.find((x) => x.id === ui.fcTab);
    const nq = (c.freeQuestions || []).length;
    return head("무료강의 페이지", "doogo.site와 같은 화면이에요. 왼쪽에서 바꿀 칸을 고르고, 다 고치면 ‘저장’을 눌러 주세요.",
        '<a class="a-btn a-btn-outline" href="#/free/' + iid + '">' + icon("eye", "sm") + "페이지 보기</a>" + btn(icon("check", "sm") + "저장", "lp-save", "a-btn-primary")) +
      '<section class="a-card a-lp-top a-fc-top">' + pubSwitch(F.published) +
        '<div class="a-lp-url"><input class="a-input a-sm a-mono" id="lp-url" value="' + esc(url) + '" readonly aria-label="페이지 주소">' + btn(icon("clipboard", "sm") + "주소 복사", "lp-copy", "a-btn-ghost a-btn-sm") + "</div>" +
        (ui.lpDirty ? '<p class="a-lp-dirty">' + icon("alert", "xs") + " 저장하지 않은 변경이 있어요.</p>" : "") + "</section>" +
      (F.liveAt && new Date(F.liveAt).getTime() + 3 * 36e5 < Date.now() ? '<div class="a-callout a-callout-warn">' + icon("alert", "sm") + "<div><b>무료강의 날짜(" + esc(String(F.liveAt).replace("T", " ")) + ")가 지났어요.</b> 지금 수강생 화면에는 ‘끝난 강의’로 보이고 신청이 닫혀 있어요. ‘일정’에서 다음 날짜로 바꾸고 저장하면 다시 열려요.</div></div>" : "") +
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
    ui.lpKind = "landing"; ui.lpHash = ROUTE.hash;
    const L = lpDraft(), iid = IID();
    const url = ROUTE.abs("#/p/" + iid);
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
  window.__dirty = () => !!(ui.lpDirty && ui.lp);
  window.__leaveGuard = (h) => { if (!ui.lpDirty || !ui.lpHash || h === ui.lpHash) return true; if (window.confirm("저장하지 않은 변경이 있어요. 이 화면을 나가면 고친 내용이 사라져요. 나갈까요?")) { ui.lpDirty = false; ui.lp = null; ui.lpHash = ""; return true; } history.replaceState(null, "", ui.lpHash); return false; };
  const lpChanged = () => { if (!ui.lpDirty) { ui.lpDirty = true; const bar = document.querySelector(".a-lp-savebar .a-muted"); if (bar) bar.textContent = "저장하지 않은 변경이 있어요"; } };

  /* ---------------- 수강생 화면 색상 고르기 ---------------- */
  function themePicker(current, name, iid) {
    name = name || "theme";
    // 6개씩(3 × 2줄) 한 장 — 오른쪽 화살표로 다음 색상. 강사 전용 색(only)은 그 강사만 (뉴질랜드 = 문대표 전용 · 맨 앞)
    const own = (k) => !!(DB.THEMES[k].only && DB.THEMES[k].only.indexOf(iid) >= 0);
    const keys = Object.keys(DB.THEMES).filter((k) => !DB.THEMES[k].hidden && (!DB.THEMES[k].only || own(k))).sort((a, b) => own(b) - own(a)), per = 6, pages = Math.ceil(keys.length / per);
    const cur = Math.max(0, Math.floor(Math.max(0, keys.indexOf(current || "lime")) / per));
    const sw = (k) => { const t = DB.THEMES[k];
      return '<label class="a-swatch' + (t.cls === "th-light" || k === "doinggo" || k === "red" ? " is-light" : "") + (t.only ? " is-own" : "") + '"><input type="radio" name="' + name + '" value="' + k + '"' + (k === (current || "lime") ? " checked" : "") + '><span class="sw" style="--sw:' + t.primary + ";--swd:" + (t.onPrimary || t.deep) + ";--swbg:" + (t.swRing || t.bg[1]) + ";--swp:" + t.bg[0] + '"><i></i></span><b>' + t.label + "</b></label>"; };
    let html = '<div class="a-sw-wrap" data-page="' + cur + '" data-pages="' + pages + '"><div class="a-sw-viewport"><div class="a-sw-track" role="radiogroup" aria-label="수강생 화면 색상" style="transform:translateX(-' + cur * 100 + '%)">';
    for (let i = 0; i < pages; i++) html += '<div class="a-swatches a-sw-page"' + (i === cur ? "" : ' aria-hidden="true"') + ">" + keys.slice(i * per, i * per + per).map(sw).join("") + "</div>";
    html += '</div></div><div class="a-sw-nav"><button type="button" class="a-sw-arrow" data-action="sw-page" data-dir="-1" aria-label="이전 색상"' + (cur === 0 ? " disabled" : "") + ">" + icon("chevLeft", "sm") + '</button><span class="a-sw-dots">' +
      Array.from({ length: pages }, (_, i) => '<button type="button" class="' + (i === cur ? "on" : "") + '" data-action="sw-page" data-to="' + i + '" aria-label="' + (i + 1) + '번째 색상 묶음"></button>').join("") +
      '</span><span class="a-sw-count"><b>' + (cur + 1) + "</b> / " + pages + '</span><button type="button" class="a-sw-arrow" data-action="sw-page" data-dir="1" aria-label="다음 색상"' + (cur === pages - 1 ? " disabled" : "") + ">" + icon("chevRight", "sm") + "</button></div></div>";
    return html + '<div id="theme-preview-' + name + '">' + themePreview(current) + "</div>";
  }
  function themePreview(k) {
    const t = DB.themeOf(k);
    return '<div class="a-theme-preview' + (t.cls ? " is-light" : "") + '" style="--p:' + t.primary + ";--pa:" + t.active + ";--pd:" + t.deep + ";--po:" + (t.onPrimary || t.deep) + ";--ac:" + (t.accent || t.primary) + ";--aa:" + (t.accentActive || t.active) + ";--pp:" + t.pale + ";--bg1:" + t.bg[0] + ";--bg2:" + t.bg[1] + '">' +
      '<div class="tp-login"><span class="tp-eyebrow">로그인 화면</span><b>내 브랜드<br><em>만들기</em></b><span class="tp-tile">' + icon("play", "sm") + "</span></div>" +
      '<div class="tp-app"><span class="tp-nav on">' + icon("home", "xs") + '홈</span><span class="tp-nav">' + icon("book", "xs") + '커리큘럼</span><span class="tp-bar"><i></i></span><span class="tp-btn">제출하고 검수받기</span></div></div>';
  }

  /* ---------------- 마스터: 메뉴 · 색상 설정 ---------------- */
  function pageMasterMenus(r, own) {
    const list = DB.data.instructors;
    if (r.params.get("ins")) ui.mMenuIns = r.params.get("ins");
    if (!ui.mMenuIns || !DB.instructor(DB.splitMid(ui.mMenuIns).iid)) ui.mMenuIns = list[0] && list[0].id;
    const mid = ui.mMenuIns, isV = DB.splitMid(mid).vod, ins = DB.instructor(DB.splitMid(mid).iid);
    if (!ins) return head("메뉴 · 색상 설정", "") + '<section class="a-card">' + emptyBox("store", "강사 플랫폼을 먼저 만들어 주세요.") + "</section>";
    const m = DB.menuConfig(mid), c = DB.content(ins.id);
    const def = (key) => (isV ? DB.VOD_MENUS : DB.STUDENT_MENUS).find((d) => d.key === key);
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
      ? head(isV ? "VOD 버전 메뉴 구성" : "메뉴 구성", isV ? "DOOGO CLASS에서 VOD를 산 수강생이 보는 왼쪽 메뉴예요. 꼭 필요한 메뉴만 켜 두세요. 주차별 강의 · 라이브 다시보기 · 과제 · 모범 과제 · 수업 캘린더 · 수료증은 VOD 버전에 없어요." : "수강생 화면 왼쪽 메뉴를 더하고(＋) 빼고(−), 이름과 순서를 바꿔요. 필요한 페이지나 링크 메뉴도 새로 만들 수 있어요. 바꾸면 바로 저장돼요.", btn(icon("eye", "sm") + (isV ? "VOD 수강생 화면 보기" : "수강생 화면 보기"), "preview", "a-btn-outline"))
      : head("메뉴 · 색상 설정", "강사와 협의한 대로 수강생 화면의 메뉴를 더하고(＋) 빼고(−), 이름과 순서, 화면 색상을 정해요. 바꾸면 바로 저장돼요. 오른쪽 미리보기로 바뀐 강의실을 바로 확인해요.", dgSplitBtn("room:" + ins.id, "강의실 미리보기")) +
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
          '<section class="a-card"><div class="a-card-head"><h2>수강생 화면 색상</h2>' + (own ? '<span class="a-muted">LIVE · VOD 버전이 함께 써요</span>' : "") + '</div><form id="m-theme-form">' + themePicker(c.brand.theme, "mtheme", ins.id) + "</form></section>" +
          (own ? '<p class="a-hint">' + icon("star", "xs") + " 새로 만든 페이지 메뉴의 내용은 ‘추가 메뉴’에서 채워요.</p>" : "") +
          '<section class="a-card"><div class="a-card-head"><h2>메뉴 미리보기</h2></div>' + sidebarPreview(mid) + "</section>" +
          '<p class="a-hint">' + icon("alert", "xs") + " 메뉴를 빼도 강사가 올린 내용은 지워지지 않아요. 다시 더하면 그대로 돌아와요.</p>" +
        "</div>" +
      "</div>";
  }
  function sidebarPreview(iid) {
    const sp = DB.splitMid(iid), m = DB.menuConfig(iid), c = DB.content(sp.iid), t = DB.themeOf(c.brand.theme);
    const def = (key) => (sp.vod ? DB.VOD_MENUS : DB.STUDENT_MENUS).find((d) => d.key === key);
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
      const reqs = DB.requests(ins.id).filter((x) => !x.q.answer && !DB.isVodStudent(x.s)).length;
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
          (x.q.answer && (x.q.answeredBy || x.q.answeredAt) ? '<p class="a-q-by"><span class="a-by">' + icon("user", "xs") + esc(x.q.answeredBy || "강사") + "</span>" + (x.q.answeredAt ? " · " + fmtStamp(x.q.answeredAt) + " 답변" : " 답변") + "</p>" : "") +
      '<p class="a-q-body">' + esc(x.q.body) + "</p>" +
      ((x.q.images || []).length ? '<div class="a-shots a-q-shots">' + x.q.images.map((im) => '<a class="a-shot" href="' + im.data + '" target="_blank" rel="noopener"><img src="' + im.data + '" alt="' + esc(im.name) + '"></a>').join("") + "</div>" : "") +
      '<form class="a-q-form" data-sid="' + x.s.id + '" data-qid="' + x.q.id + '"><textarea class="a-input" name="answer" rows="3" placeholder="예: 확인해 보니 ○○ 문제였어요. 지금 고쳤으니 새로고침 후 다시 해 주세요." aria-label="답변">' + esc(x.q.answer || "") + '</textarea><button class="a-btn a-btn-primary a-btn-sm" type="submit">' + (x.q.answer ? "답변 수정" : "답변 등록") + "</button></form></article>").join("") + "</div>";
  }

  /* ---------------- 마스터: 강사 입점 문의 (첫 화면 ‘강사 입점 문의’ 팝업으로 들어온 신청) ---------------- */
  const INQ_STATUS = [["new", "새 문의", "warn"], ["contact", "상담 중", "info"], ["done", "계약 성사", "ok"], ["fail", "계약 미성사", "bad"], ["hold", "보류", "mute"]];
  /** 상태 바꾸기 (기록 남김 → 파트너센터 진행 단계에 날짜로 보여요) */
  function setInqStatus(x, st) {
    if ((x.status || "new") === st) return;
    x.status = st; (x.log = x.log || []).push({ st, at: Date.now() });
    if (st === "done" && !x.doneAt) x.doneAt = Date.now();
    if (st === "fail") x.failAt = Date.now();
  }
  const inqStepAt = (x, st) => { const l = (x.log || []).filter((e) => e.st === st).pop(); return l ? l.at : null; };
  /** 진행 단계: 문의 접수 → 두잉고 상담 → 계약 성사 → 플랫폼 오픈 */
  const inqIsVod = (x) => x.source === "doogoclass" || /^\[DOOGO CLASS/.test(x.where || "");
  function inqTrack(x) {
    const st = x.status || "new", hold = st === "hold", fail = st === "fail";
    const lv = st === "new" ? 0 : st === "contact" ? 1 : st === "done" ? (x.iid ? 3 : 2) : fail ? 2 : 1;
    // 계약 미성사: 3단계를 ‘계약 미성사(✕)’로 바꿔 보여 주고, 4단계는 흐리게
    const steps = [["문의 접수", x.at], ["두잉고 상담", inqStepAt(x, "contact") || (fail ? x.failAt : null)], fail ? ["계약 미성사", x.failAt || inqStepAt(x, "fail")] : ["계약 성사", x.doneAt || inqStepAt(x, "done")], [inqIsVod(x) ? "VOD 강사 등록" : "플랫폼 오픈", x.openedAt]];
    return '<ol class="p-track' + (hold ? " hold" : "") + (fail ? " fail" : "") + '">' + steps.map((s, i) => '<li class="' + (i < lv ? "done" : i === lv ? "now" : "") + '"><i>' + (fail && i === lv ? icon("x", "xs") : i < lv || (i === lv && i === 3) ? icon("check", "xs") : i + 1) + "</i><b>" + s[0] + "</b><small>" + (s[1] && i <= lv ? fmtMD(DB.date.toStr(new Date(s[1]))) : hold && i === lv ? "보류" : "") + "</small></li>").join("") + "</ol>";
  }
  /** 파트너 ↔ 두잉고 1:1 대화 — 카카오톡과 같은 짜임(프로필 · 이름 · 말풍선 꼬리 · 같은 분 묶음 · 날짜선 · 안 읽음 1 · 시간), 색은 두잉고 */
  const ktTime = (ms) => { const d = new Date(ms), h = d.getHours(); return (h < 12 ? "오전 " : "오후 ") + (h % 12 || 12) + ":" + String(d.getMinutes()).padStart(2, "0"); };
  const ktDay = (ms) => { const d = new Date(ms); return d.getFullYear() + "년 " + (d.getMonth() + 1) + "월 " + d.getDate() + "일 " + "일월화수목금토"[d.getDay()] + "요일"; };
  const ktMin = (ms) => Math.floor(ms / 60000);
  function inqThread(x, me) {
    const list = x.thread || [], pa = inqAff(x);
    const otherName = me === "partner" ? "두잉고 담당자" : (pa ? pa.name + " 파트너" : "소개 파트너");
    const otherSeen = (me === "partner" ? x.mSeen : x.pSeen) || 0, mySeen = (me === "partner" ? x.pSeen : x.mSeen) || 0;
    const av = (by, name) => (by === "master" ? '<span class="kt-av kt-av-dg" aria-hidden="true">두</span>' : '<span class="kt-av" aria-hidden="true">' + esc(String(name || "파").slice(0, 1)) + "</span>");
    let rows = "", day = "";
    list.forEach((m, i) => {
      const d = new Date(m.at).toDateString(), prev = list[i - 1], next = list[i + 1];
      if (d !== day) { rows += '<li class="kt-day"><span>' + ktDay(m.at) + "</span></li>"; day = d; }
      const mine = m.by === me;
      const cont = !!prev && prev.by === m.by && ktMin(prev.at) === ktMin(m.at) && new Date(prev.at).toDateString() === d;
      const last = !next || next.by !== m.by || ktMin(next.at) !== ktMin(m.at) || new Date(next.at).toDateString() !== d;
      const unread = mine && m.at > otherSeen, fresh = !mine && m.at > mySeen;
      rows += '<li class="kt-row ' + (mine ? "me" : "you") + (cont ? " cont" : " first") + (fresh ? " fresh" : "") + '">' +
        (mine ? "" : cont ? '<span class="kt-av-sp"></span>' : av(m.by, m.name)) +
        '<div class="kt-col">' + (!mine && !cont ? '<b class="kt-name">' + esc(m.by === "master" ? "두잉고 담당자" : m.name || "파트너") + "</b>" : "") +
          '<div class="kt-line"><p class="kt-bubble">' + esc(m.text) + '</p><span class="kt-meta">' + (unread ? '<i class="kt-unread" title="상대가 아직 안 읽었어요">1</i>' : "") + (last ? "<time>" + ktTime(m.at) + "</time>" : "") + "</span></div></div></li>";
    });
    return '<div class="kt" data-kt="' + esc(x.id) + '">' +
      '<div class="kt-head">' + av(me === "partner" ? "master" : "partner", pa ? pa.name : "파") + '<div class="kt-head-t"><b>' + esc(otherName) + "</b><small>" + (me === "partner" ? "진행 상황을 묻거나 강사님에 대해 알려 주세요" : esc(x.name) + " 님 입점 문의 · 파트너센터에 바로 보여요") + '</small></div><span class="kt-count">' + icon("message", "xs") + list.length + "</span></div>" +
      '<div class="kt-body"><ul class="kt-list" aria-live="polite">' + (rows || '<li class="kt-empty">' + icon("message") + "<span>아직 나눈 대화가 없어요.<br>첫 메시지를 보내 보세요.</span></li>") + "</ul>" +
        '<button type="button" class="kt-down" data-action="kt-down" aria-label="최신 메시지로 이동">' + icon("chevDown", "sm") + "</button></div>" +
      '<div class="kt-input"><textarea rows="1" maxlength="1000" data-inq-say="' + esc(x.id) + '" placeholder="메시지 입력" aria-label="' + esc(otherName) + '에게 메시지 입력"></textarea>' +
        '<button type="button" class="kt-send" data-action="inq-say" data-id="' + esc(x.id) + '" aria-label="전송">전송</button></div>' +
    "</div>";
  }
  /** 대화창 준비: 맨 아래로 스크롤 · 아래로 버튼 · 입력칸 자동 높이 */
  function ktInit(scope) {
    (scope || document).querySelectorAll(".kt").forEach((k) => {
      const list = k.querySelector(".kt-list"), down = k.querySelector(".kt-down"), ta = k.querySelector("textarea");
      if (!list) return;
      list.scrollTop = list.scrollHeight;
      if (!list.dataset.ktOn) {
        list.dataset.ktOn = "1";
        list.addEventListener("scroll", () => { down.classList.toggle("on", list.scrollHeight - list.scrollTop - list.clientHeight > 80); }, { passive: true });
      }
      if (ta) ktGrow(ta);
    });
  }
  function ktGrow(ta) {
    ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 104) + "px";
    const k = ta.closest(".kt"); if (k) k.querySelector(".kt-send").classList.toggle("on", !!ta.value.trim());
  }
  const inqStatus = (x) => INQ_STATUS.find((s) => s[0] === (x.status || "new")) || INQ_STATUS[0];
  function pageMasterPartners() {
    const all = DB.inquiries();
    let f = ui.inqFilter || "all";
    const unread = all.filter((x) => msgUnreadM(x) > 0);
    if (f === "msg" && !unread.length) f = ui.inqFilter = "all";
    const isVod = (x) => x.source === "doogoclass" || /^\[DOOGO CLASS/.test(x.where || "");
    const shown = all.filter((x) => f === "all" || (f === "msg" ? msgUnreadM(x) > 0 : f === "aff" ? !!inqAff(x) : f === "vod" ? isVod(x) : (x.status || "new") === f));
    const tabs = (unread.length ? [["msg", "새 메시지", unread.reduce((a, x) => a + msgUnreadM(x), 0)]] : []).concat([["all", "전체", all.length]]).concat(INQ_STATUS.map((s) => [s[0], s[1], all.filter((x) => (x.status || "new") === s[0]).length])).concat([["aff", "파트너 소개", all.filter((x) => inqAff(x)).length], ["vod", "DOOGO CLASS 강사 모집", all.filter(isVod).length]]).map((t) =>
      '<button type="button" class="a-tab' + (f === t[0] ? " on" : "") + '" data-action="inq-tab" data-k="' + t[0] + '">' + t[1] + ' <span class="num">' + t[2] + "</span></button>").join("");
    const link = (u) => (/^https?:\/\//i.test(u || "") ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(u) + "</a>" : esc(u || "-"));
    const card = (x) => {
      const st = inqStatus(x), pa = inqAff(x), un = msgUnreadM(x);
      return '<article class="a-inq' + (un ? " has-msg" : "") + '" data-inq="' + esc(x.id) + '"' + (un ? ' data-unread="1"' : "") + '><div class="a-inq-head"><span class="a-avatar">' + esc((x.name || "?").slice(0, 1)) + "</span><div><b>" + esc(x.name) + "</b><small>" + fmtStamp(x.at) + " 접수" + (x.ref ? " · 추천 코드 " + esc(x.ref) : "") + (x.byPartner ? " · 파트너가 직접 추천" : "") + "</small></div>" + (isVod(x) ? '<span class="a-pill inq-vod">' + icon("monitorPlay", "xs") + "DOOGO CLASS 강사 모집</span>" : "") + (pa ? '<span class="a-pill p-aff-pill">' + icon("handshake", "xs") + esc(pa.name) + " 파트너 소개</span>" : "") + (un ? '<span class="a-pill inq-new-msg">' + icon("bell", "xs") + "새 메시지 " + un + "</span>" : "") + pill(st[1], st[2]) + "</div>" +
        inqTrack(x) +
        '<dl class="a-inq-info"><div><dt>이메일</dt><dd><a href="mailto:' + esc(x.email) + '">' + esc(x.email) + "</a></dd></div><div><dt>연락처</dt><dd><a href=\"tel:" + esc(String(x.phone || "").replace(/[^0-9+]/g, "")) + '">' + esc(x.phone) + "</a></dd></div>" +
          "<div><dt>강의 중인 곳</dt><dd>" + esc(x.where || "-") + "</dd></div><div><dt>강의 링크</dt><dd>" + link(x.link) + "</dd></div></dl>" +
        '<div class="a-inq-block"><b>어떤 강의인가요</b><p>' + esc(x.course) + "</p></div>" +
        (x.message ? '<div class="a-inq-block"><b>남긴 말</b><p>' + esc(x.message) + "</p></div>" : "") +
        (pa ? inqThread(x, "master") : "") +
        '<div class="a-inq-ctl"><div class="a-inq-sels"><label class="a-inq-st"><span>상태</span><select class="a-input a-sm" data-inq-status="' + esc(x.id) + '">' + INQ_STATUS.map((s) => '<option value="' + s[0] + '"' + (s[0] === st[0] ? " selected" : "") + ">" + s[1] + "</option>").join("") + "</select></label>" +
          '<label class="a-inq-st"><span>소개 파트너</span><select class="a-input a-sm" data-inq-aff="' + esc(x.id) + '"><option value="none">없음</option>' + affList().map((p) => '<option value="' + esc(p.id) + '"' + (pa && pa.id === p.id ? " selected" : "") + ">" + esc(p.name) + " (" + esc(p.code || p.loginId) + ")</option>").join("") + "</select></label></div>" +
          '<textarea class="a-input" rows="2" data-inq-memo="' + esc(x.id) + '" placeholder="메모 (예: 10/12 통화 · 다음 주 미팅)" aria-label="메모">' + esc(x.memo || "") + "</textarea>" +
          '<div class="a-row-actions">' + (!x.iid && (x.status || "new") !== "fail" ? btn(icon("store", "sm") + (inqIsVod(x) ? "VOD 강사로 등록" : "플랫폼 만들기"), "inq-make", "a-btn-primary a-btn-sm", ' data-id="' + esc(x.id) + '"') : "") + btn(icon("check", "sm") + "메모 저장", "inq-memo", "a-btn-outline a-btn-sm", ' data-id="' + esc(x.id) + '"') + btn(icon("trash", "sm") + "삭제", "inq-del", "a-btn-ghost a-btn-sm danger", ' data-id="' + esc(x.id) + '"') + "</div></div>" +
      "</article>";
    };
    // 화면에 1.5초 이상 보인 카드의 파트너 메시지는 읽음으로 (메뉴 · 종 숫자가 줄어요)
    if (unread.length) setTimeout(markInqSeen, 300);
    const latest = unread.map((x) => ({ x, m: (x.thread || []).filter((m) => m.by === "partner").slice(-1)[0] })).sort((a, b) => b.m.at - a.m.at)[0];
    const alertBar = latest ? '<div class="inq-alert">' + '<span class="inq-alert-ic">' + icon("bell", "sm") + "</span><div><b>파트너가 보낸 새 메시지 " + unread.reduce((a, x) => a + msgUnreadM(x), 0) + "건</b><span>" + esc(latest.m.name || "파트너") + " → " + esc(latest.x.name) + " 님 문의 · “" + esc(String(latest.m.text).slice(0, 60)) + "” · " + fmtStamp(latest.m.at) + "</span></div>" + btn("바로 보기", "inq-jump", "a-btn-dark a-btn-sm", ' data-id="' + esc(latest.x.id) + '"') + "</div>" : "";
    return head("강사 입점 문의", "두잉고 첫 화면의 ‘강사 입점 문의’와 DOOGO CLASS ‘강사 모집’ 팝업으로 들어온 신청이에요. 연락한 뒤 상태를 바꾸고 메모를 남겨 두세요. 파트너 추천 링크로 들어온 문의는 상태 · 1:1 대화가 그 파트너의 파트너센터에도 함께 보여요. (메모는 마스터만 봐요)",
        '<a class="a-btn a-btn-ghost" href="#/partner" target="_blank" rel="noopener">' + icon("arrowUpRight", "sm") + "문의 화면 열기</a>") +
      alertBar +
      '<section class="a-card"><div class="a-toolbar"><div class="a-tabs">' + tabs + "</div></div>" +
        (shown.length ? '<div class="a-stack">' + shown.map(card).join("") + "</div>" : emptyBox("handshake", f === "all" ? "아직 들어온 입점 문의가 없어요." : f === "msg" ? "안 읽은 파트너 메시지가 없어요." : "이 상태의 문의가 없어요.")) + "</section>";
  }
  function findInq(id) { return DB.inquiries().find((x) => x.id === id); }

  /* ---------------- 기수 이용료 신청 · 매출 ----------------
   * 강사: 강사센터 ‘다음 기수 신청’ (기수 · 1인 수강료 · 연락처 · 이메일)
   * 마스터: 전화 → 무통장 입금 확인 → 세금계산서 발행 → 기수 열기. 열린 기수는 강사가 ‘기수 관리’에서 자유롭게 고친다
   * 이용료 = 강사님 1인 수강료 × 1명분 (기수마다, 수강생 수와 상관없이 같음) · 매출은 입금일 기준 공급가액 */
  const won = DB.won;
  const dayOf = (ms) => (ms ? DB.date.toStr(new Date(ms)) : "");
  const insName = (iid) => { const x = DB.instructor(iid); return x ? x.displayName : "삭제된 강사"; };
  const billTodo = (b) => !b.canceledAt && (!b.paidAt || !b.invoiceAt || !b.cohortId);
  const paidIn = (b, prefix) => !b.canceledAt && !!b.paidAt && b.paidAt.indexOf(prefix) === 0;
  const parseWon = (v) => { const n = Number(String(v == null ? "" : v).replace(/[^0-9]/g, "")); return isFinite(n) ? Math.min(1e9, n) : 0; };
  const sumMoney = (list, k) => list.reduce((a, b) => a + DB.billMoney(b)[k], 0);
  const BILL_KIND = { next: "다음 기수", new: "신규 입점 · 1기", manual: "직접 기록" };
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  /** 다음에 열 기수 이름 (열린 기수 · 진행 중인 신청 다음 번호) */
  function nextBillCohortName(iid) {
    const nums = DB.cohortsOf(iid).map((c) => parseInt(c.name, 10)).concat(DB.bills(iid).filter((b) => !b.canceledAt).map((b) => parseInt(b.cohortName, 10))).filter((n) => !isNaN(n));
    return (nums.length ? Math.max(...nums) + 1 : 1) + "기";
  }
  /** 다음 기수 1주차 시작 예정일: 마지막 기수가 끝난 다음 목요일 (이미 지났으면 2주 뒤) */
  function nextStartDate(iid) {
    const last = DB.cohortsOf(iid).slice(-1)[0];
    if (!last) return addDays(todayStr(), 14);
    const after = addDays(DB.cohortEnd(last), 1);
    const d = addDays(after, (4 - parseDate(after).getDay() + 7) % 7);
    return d < todayStr() ? addDays(todayStr(), 14) : d;
  }
  // ‘새 기수’ 버튼: 마스터만 바로 열고, 강사는 신청 (코치는 없음)
  function newCohortBtn(cls) {
    if (S.role === "master") return btn(icon("plus", "sm") + "새 기수 열기", "cohort-add", cls || "a-btn-primary");
    if (isCoach()) return "";
    return btn(icon("coins", "sm") + "다음 기수 신청", "bill-request", cls || "a-btn-primary");
  }
  function billSteps(b) {
    const st = [["신청 접수", dayOf(b.requestedAt)], ["입금 확인", b.paidAt], ["세금계산서", b.invoiceAt], ["기수 오픈", b.openedAt || (b.cohortId ? "done" : "")]];
    return '<ol class="a-bsteps' + (b.canceledAt ? " off" : "") + '">' + st.map((x, i) => '<li class="' + (x[1] ? "done" : "") + '"><i>' + (x[1] ? icon("check", "xs") : i + 1) + "</i><span><b>" + x[0] + "</b><small>" + (x[1] ? (/^\d{4}-/.test(x[1]) ? fmtMD(x[1]) : "완료") : "대기") + "</small></span></li>").join("") + "</ol>";
  }
  function calcHtml(b) {
    const m = DB.billMoney(b);
    if (!m.total) return '<span class="a-muted">1인 수강료를 적으면 이번 기수 이용료가 계산돼요.</span>';
    return "<span>이번 기수 이용료</span><b class=\"num\">" + won(m.total) + "</b><small>" + (m.mode === "separate" ? "이용료 " + won(m.supply) + " + 부가세 10% " + won(m.tax) : m.mode === "included" ? "부가세 포함 (공급가 " + won(m.supply) + " · 부가세 " + won(m.tax) + ")" : "부가세 없음") + "</small>";
  }
  function billCard(b, master) {
    const s = DB.billState(b), st = DB.BILL_STATE[s], m = DB.billMoney(b);
    const co = b.cohortId ? DB.cohort(b.cohortId) : null;
    const info = [
      ["1인 수강료", b.fee ? won(b.fee) : "-"],
      ["이용료 (입금액)", won(m.total) + (m.tax ? ' <small class="a-memo">공급가 ' + won(m.supply) + " · 부가세 " + won(m.tax) + "</small>" : "")],
      ["1주차 시작 예정", b.startDate ? fmtFull(b.startDate) : "-"],
      ["담당자", esc(b.contactName || "-")],
      ["연락처", b.phone ? '<a href="tel:' + esc(String(b.phone).replace(/[^0-9+]/g, "")) + '">' + esc(b.phone) + "</a>" : "-"],
      ["이메일 (세금계산서)", b.email ? '<a href="mailto:' + esc(b.email) + '">' + esc(b.email) + "</a>" : "-"]
    ];
    if (b.bizName || b.bizNo) info.push(["사업자", esc([b.bizName, b.bizNo].filter(Boolean).join(" · "))]);
    if (b.paidAt) info.push(["입금", fmtFull(b.paidAt) + (b.depositor ? " · " + esc(b.depositor) : "")]);
    if (b.invoiceAt) info.push(["세금계산서", fmtFull(b.invoiceAt) + (b.invoiceNo ? " · " + esc(b.invoiceNo) : "")]);
    if (co) info.push(["열린 기수", esc(co.name) + " · " + fmtMD(co.startDate) + " 시작"]);
    const id = ' data-id="' + esc(b.id) + '"';
    const acts = master ? masterBillActions(b) : s === "requested" ? btn(icon("pen", "sm") + "신청 고치기", "bill-edit", "a-btn-ghost a-btn-sm", id) + btn("신청 취소", "bill-withdraw", "a-btn-ghost a-btn-sm danger", id) : co ? '<a class="a-btn a-btn-outline a-btn-sm" href="#/center/cohorts">' + icon("layers", "sm") + "기수 관리에서 고치기</a>" : "";
    return '<article class="a-bill' + (b.canceledAt ? " off" : "") + '" data-bill="' + esc(b.id) + '">' +
      '<div class="a-inq-head">' + (master ? '<span class="a-avatar">' + esc(insName(b.instructorId).slice(0, 1)) + "</span>" : '<span class="a-avatar">' + icon("coins", "sm") + "</span>") +
        "<div><b>" + (master ? esc(insName(b.instructorId)) + " · " : "") + esc(b.cohortName || "-") + "</b><small>" + esc(BILL_KIND[b.kind] || BILL_KIND.next) + (b.requestedAt ? " · " + fmtStamp(b.requestedAt) + " 신청" : "") + "</small></div>" +
        (b.paidAt && !b.invoiceAt && !b.canceledAt ? pill("계산서 미발행", "warn") : "") + pill(st.label, st.cls) + "</div>" +
      billSteps(b) +
      '<dl class="a-inq-info a-bill-info">' + info.map((x) => "<div><dt>" + x[0] + "</dt><dd>" + x[1] + "</dd></div>").join("") + "</dl>" +
      (b.memo ? '<div class="a-inq-block"><b>강사님이 남긴 말</b><p>' + esc(b.memo) + "</p></div>" : "") +
      (master && b.masterMemo ? '<div class="a-inq-block a-bill-mm"><b>마스터 메모</b><p>' + esc(b.masterMemo) + "</p></div>" : "") +
      (acts ? '<div class="a-row-actions a-bill-act">' + acts + "</div>" : "") +
    "</article>";
  }
  function masterBillActions(b) {
    const id = ' data-id="' + esc(b.id) + '"';
    if (b.canceledAt) return btn(icon("refresh", "sm") + "취소 되돌리기", "bill-uncancel", "a-btn-ghost a-btn-sm", id) + btn(icon("trash", "sm") + "삭제", "bill-del", "a-btn-ghost a-btn-sm danger", id);
    return (!b.paidAt ? btn(icon("coins", "sm") + "입금 확인", "bill-pay", "a-btn-primary a-btn-sm", id) : "") +
      (!b.invoiceAt ? btn(icon("file", "sm") + "세금계산서 발행", "bill-invoice", (b.paidAt ? "a-btn-primary" : "a-btn-outline") + " a-btn-sm", id) : "") +
      (!b.cohortId ? btn(icon("layers", "sm") + "기수 열기", "bill-open", (b.paidAt ? "a-btn-primary" : "a-btn-outline") + " a-btn-sm", id) : "") +
      btn(icon("pen", "sm") + "수정", "bill-edit", "a-btn-ghost a-btn-sm", id) +
      (DB.instructor(b.instructorId) ? btn(icon("arrowUpRight", "sm") + "강사센터 접속", "ins-enter", "a-btn-ghost a-btn-sm", ' data-id="' + esc(b.instructorId) + '"') : "") +
      (!b.paidAt && !b.cohortId ? btn("취소 처리", "bill-cancel", "a-btn-ghost a-btn-sm danger", id) : "") +
      (b.paidAt ? btn("환불 처리", "bill-refund", "a-btn-ghost a-btn-sm danger", id) : "");
  }

  /* 강사센터: 다음 기수 신청 */
  function billGuide() {
    const bi = DB.billingInfo();
    const acct = bi.bank && bi.account ? esc(bi.bank) + " " + esc(bi.account) + (bi.holder ? " · 예금주 " + esc(bi.holder) : "") : "";
    const flow = [["send", "신청", "기수 · 1인 수강료 · 연락처 · 이메일을 남겨요"], ["phone", "연락 · 입금", "담당자가 전화드리고, 이용료를 무통장으로 입금해 주세요"], ["file", "세금계산서", "입금이 확인되면 남겨 주신 이메일로 보내 드려요"], ["layers", "기수 오픈", "두잉고가 기수를 열어 드려요. 그다음은 ‘기수 관리’에서 자유롭게 고쳐요"]];
    return '<section class="a-card"><div class="a-card-head"><h2>다음 기수는 이렇게 열려요</h2></div>' +
      '<ol class="a-bflow">' + flow.map((x, i) => '<li><span class="a-bflow-ic">' + icon(x[0], "sm") + "</span><b>" + (i + 1) + ". " + x[1] + "</b><small>" + x[2] + "</small></li>").join("") + "</ol>" +
      '<div class="a-bnote"><p><b>기수 이용료 = 강사님 1인 수강료 × 1명분</b> · 수강생이 100명이든 500명이든 기수마다 같아요. 자료 업로드 · AI 조교 · 수강생 관리가 모두 들어 있어요.</p>' +
        "<p>" + (acct ? "입금 계좌 <b>" + acct + "</b>" : "입금 계좌는 담당자가 연락드릴 때 알려 드려요.") + (bi.vat === "separate" ? " · 부가세 10% 별도" : bi.vat === "included" ? " · 부가세 포함" : "") + "</p>" + (bi.note ? "<p>" + esc(bi.note) + "</p>" : "") + "</div></section>";
  }
  function pageBilling() {
    const iid = IID(), list = DB.bills(iid);
    const right = newCohortBtn();
    return head("다음 기수 신청", "새 기수는 이용료 입금이 확인되면 두잉고가 열어 드려요. 열린 기수의 일정 · 커리큘럼 · 수강생은 강사님이 자유롭게 관리해요.", right) +
      billGuide() +
      '<section class="a-card"><div class="a-card-head"><h2>신청 · 이용 내역</h2><span class="a-muted">' + list.length + "건</span></div>" +
        (list.length ? '<div class="a-stack">' + list.map((b) => billCard(b, S.role === "master")).join("") + "</div>" : emptyBox("coins", "아직 신청한 기수가 없어요.", right)) + "</section>";
  }
  // 강사 대시보드 알림: 진행 중인 신청, 또는 마지막 기수가 곧 끝나면 다음 기수 신청 안내
  function billBanner(iid) {
    if (isCoach()) return "";
    const open = DB.bills(iid).filter((b) => !b.canceledAt && !b.cohortId);
    if (open.length) {
      const b = open[0];
      return '<a class="a-inq-alert a-bill-alert" href="#/center/billing">' + icon("coins", "sm") + "<b>" + esc(b.cohortName) + " 신청 " + (b.paidAt ? "입금 확인" : "접수") + "</b><span>" + (b.paidAt ? "곧 기수를 열어 드릴게요." : "담당자가 확인 후 연락드릴게요.") + "</span>" + icon("arrowRight", "sm") + "</a>";
    }
    const last = DB.cohortsOf(iid).slice(-1)[0];
    if (!last) return '<a class="a-inq-alert a-bill-alert" href="#/center/billing">' + icon("coins", "sm") + "<b>첫 기수를 열어 볼까요?</b><span>‘다음 기수 신청’을 남겨 주시면 연락드릴게요.</span>" + icon("arrowRight", "sm") + "</a>";
    const end = DB.cohortEnd(last), left = DB.date.diffDays(end, todayStr());
    if (DB.cohortStatus(last) === "upcoming" || left > 21) return "";
    return '<a class="a-inq-alert a-bill-alert" href="#/center/billing">' + icon("coins", "sm") + "<b>" + esc(last.name) + (left >= 0 ? "가 " + fmtMD(end) + "에 끝나요" : "가 끝났어요") + "</b><span>다음 기수(" + esc(nextBillCohortName(iid)) + ")를 열려면 ‘다음 기수 신청’을 해 주세요.</span>" + icon("arrowRight", "sm") + "</a>";
  }
  /** 신청서 (강사) · 이용료 기록 (마스터: 금액 · 입금 · 계산서 칸까지) */
  function billForm(b, master, preset) {
    const isNew = !b;
    const iid = b ? b.instructorId : (preset && preset.instructorId) || IID() || (DB.data.instructors[0] || {}).id;
    const ins = DB.instructor(iid) || {};
    const last = DB.bills(iid).find((x) => x.phone || x.email) || {};
    b = b || { instructorId: iid, kind: master ? "manual" : "next", cohortName: nextBillCohortName(iid), startDate: nextStartDate(iid), fee: last.fee || "", contactName: last.contactName || ins.name || "", phone: last.phone || "", email: last.email || "", bizName: last.bizName || "", bizNo: last.bizNo || "", memo: "" };
    const fld = (id, label, val, attrs, help) => '<div class="a-field"><label for="bf-' + id + '">' + label + '</label><input class="a-input" id="bf-' + id + '" name="' + id + '" value="' + esc(val == null ? "" : val) + '"' + (attrs || "") + ">" + (help ? '<small class="a-muted">' + help + "</small>" : "") + "</div>";
    const body = '<form id="bill-form" class="a-form" data-id="' + (isNew ? "" : esc(b.id)) + '" data-master="' + (master ? "1" : "") + '" novalidate>' +
      (master ? '<div class="a-form-row"><div class="a-field"><label for="bf-ins">강사</label><select class="a-input" id="bf-ins" name="instructorId"' + (isNew ? "" : " disabled") + ">" + DB.data.instructors.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === iid ? " selected" : "") + ">" + esc(x.displayName) + "</option>").join("") + "</select></div>" +
          '<div class="a-field"><label for="bf-kind">구분</label><select class="a-input" id="bf-kind" name="kind">' + Object.keys(BILL_KIND).map((k) => '<option value="' + k + '"' + ((b.kind || "next") === k ? " selected" : "") + ">" + BILL_KIND[k] + "</option>").join("") + "</select></div></div>"
        : '<p class="a-muted" style="margin:0">남겨 주시면 담당자가 확인 후 전화드려요. 입금 · 세금계산서 발행이 끝나면 기수를 열어 드려요.</p>') +
      '<div class="a-form-row">' + fld("cohortName", "열고 싶은 기수", b.cohortName, ' placeholder="예: 2기" maxlength="30"') + fld("startDate", "1주차 시작 예정일", b.startDate, ' type="date"') + "</div>" +
      fld("fee", "이 기수의 1인 수강료 (원)", b.fee ? Number(b.fee).toLocaleString("ko-KR") : "", ' inputmode="numeric" placeholder="예: 2,900,000"', "수강생 한 명이 내는 수강료예요. 이 금액이 이번 기수 이용료가 돼요.") +
      '<div class="a-bcalc" id="bf-calc">' + calcHtml(b) + "</div>" +
      '<div class="a-form-row">' + fld("contactName", "담당자 이름", b.contactName, ' maxlength="40"') + fld("phone", "연락처", b.phone, ' type="tel" inputmode="tel" placeholder="010-0000-0000" maxlength="20"') + "</div>" +
      fld("email", "이메일 <small>(세금계산서 받을 곳)</small>", b.email, ' type="email" placeholder="tax@example.com" maxlength="100"') +
      '<div class="a-form-row">' + fld("bizName", "상호 <small>(선택)</small>", b.bizName, ' maxlength="60"') + fld("bizNo", "사업자등록번호 <small>(선택)</small>", b.bizNo, ' inputmode="numeric" placeholder="000-00-00000" maxlength="20"') + "</div>" +
      '<div class="a-field"><label for="bf-memo">남길 말 <small>(선택)</small></label><textarea class="a-input" id="bf-memo" name="memo" rows="2" maxlength="1000" placeholder="예: 평일 오후 통화 가능해요">' + esc(b.memo || "") + "</textarea></div>" +
      (master ? masterBillFields(b) : "") +
      '<p class="a-error" id="bf-error"></p></form>';
    openModal(master ? (isNew ? "이용료 직접 기록" : insName(iid) + " · " + (b.cohortName || "") + " 수정") : isNew ? "다음 기수 신청" : "신청 고치기", body,
      (master && !isNew ? btn(icon("trash", "sm") + "삭제", "bill-del", "a-btn-ghost danger", ' data-id="' + esc(b.id) + '"') + '<span class="a-spacer"></span>' : "") +
      btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="bill-form">' + (master || !isNew ? "저장" : "신청 보내기") + "</button>", "md");
  }
  function masterBillFields(b) {
    const date = (id, label, val) => '<div class="a-field"><label for="bf-' + id + '">' + label + '</label><input class="a-input" type="date" id="bf-' + id + '" name="' + id + '" value="' + esc(val || "") + '"></div>';
    const txt = (id, label, val) => '<div class="a-field"><label for="bf-' + id + '">' + label + '</label><input class="a-input" id="bf-' + id + '" name="' + id + '" value="' + esc(val || "") + '" maxlength="60"></div>';
    return '<fieldset class="a-fs"><legend>마스터 정산</legend>' +
      '<div class="a-form-row"><div class="a-field"><label for="bf-amount">이용료 금액 (원)</label><input class="a-input" id="bf-amount" name="amount" inputmode="numeric" value="' + (b.amount != null && b.amount !== "" ? Number(b.amount).toLocaleString("ko-KR") : "") + '" placeholder="비우면 1인 수강료와 같아요"></div>' +
        '<div class="a-field"><label for="bf-vat">부가세</label><select class="a-input" id="bf-vat" name="vat">' + DB.BILL_VAT.map((v) => '<option value="' + v[0] + '"' + ((b.vat || DB.billingInfo().vat) === v[0] ? " selected" : "") + ">" + v[1] + "</option>").join("") + "</select></div></div>" +
      '<div class="a-form-row">' + date("paidAt", "입금일", b.paidAt) + txt("depositor", "입금자명", b.depositor) + "</div>" +
      '<div class="a-form-row">' + date("invoiceAt", "세금계산서 발행일", b.invoiceAt) + txt("invoiceNo", "승인번호 <small>(선택)</small>", b.invoiceNo) + "</div>" +
      '<div class="a-field"><label for="bf-masterMemo">마스터 메모 <small>(강사에게 안 보여요)</small></label><textarea class="a-input" id="bf-masterMemo" name="masterMemo" rows="2" maxlength="1000" placeholder="예: 10/12 통화 · 다음 주 입금 예정">' + esc(b.masterMemo || "") + "</textarea></div>" +
      '<small class="a-muted">입금일 · 발행일을 비우면 ‘미입금 · 미발행’으로 돌아가요. 기수는 카드의 ‘기수 열기’로 열어요.</small></fieldset>';
  }
  function refreshBillCalc() {
    const f = document.getElementById("bill-form"), box = document.getElementById("bf-calc");
    if (!f || !box) return;
    box.innerHTML = calcHtml({ fee: parseWon(f.fee.value), amount: f.amount && f.amount.value.trim() ? parseWon(f.amount.value) : undefined, vat: f.vat ? f.vat.value : undefined });
  }
  function saveBillForm(f) {
    const err = document.getElementById("bf-error"), master = !!f.dataset.master, id = f.dataset.id;
    const v = (k) => (f[k] ? String(f[k].value || "").trim() : "");
    const cohortName = v("cohortName"), fee = parseWon(v("fee")), phone = v("phone"), email = v("email");
    if (!cohortName) { err.textContent = "열고 싶은 기수를 적어 주세요. (예: 2기)"; return; }
    if (!fee || fee < 0) { err.textContent = "1인 수강료를 적어 주세요."; return; }
    if (!master && !v("startDate")) { err.textContent = "1주차 시작 예정일을 골라 주세요."; return; }
    if (!master && v("startDate") < todayStr() && !(id && (DB.bills().find((x) => x.id === id) || {}).startDate === v("startDate"))) { err.textContent = "1주차 시작 예정일은 오늘 이후로 골라 주세요."; return; }
    if (!master && phone.replace(/[^0-9]/g, "").length < 9) { err.textContent = "연락받을 전화번호를 적어 주세요."; return; }
    if ((!master || email) && !EMAIL_RE.test(email)) { err.textContent = "세금계산서를 받을 이메일을 확인해 주세요."; return; }
    const old = id ? DB.bills().find((x) => x.id === id) : null;
    const iid = old ? old.instructorId : master ? v("instructorId") : IID();
    if (!iid || !DB.instructor(iid)) { err.textContent = "강사를 골라 주세요."; return; }
    if (!master && old && DB.billState(old) !== "requested") { err.textContent = "이미 처리 중인 신청이라 고칠 수 없어요. 담당자에게 말씀해 주세요."; return; }
    // 같은 기수를 두 번 신청하지 않게
    const dup = DB.bills(iid).some((x) => x.id !== id && !x.canceledAt && !x.cohortId && x.cohortName === cohortName) || (!master && DB.cohortsOf(iid).some((c) => c.name === cohortName));
    if (dup) { err.textContent = cohortName + "는 이미 신청했거나 열려 있어요. 기수 이름을 확인해 주세요."; return; }
    const b = old ? DB.clone(old) : { id: DB.uid("b"), instructorId: iid, kind: master ? "manual" : "next", requestedAt: Date.now(), by: master ? "master" : "instructor" };
    Object.assign(b, { cohortName, startDate: v("startDate"), fee, contactName: v("contactName"), phone, email, bizName: v("bizName"), bizNo: v("bizNo"), memo: v("memo") });
    if (master) {
      if (f.kind) b.kind = v("kind");
      if (v("amount")) b.amount = parseWon(v("amount")); else delete b.amount;
      b.vat = v("vat") || "included";
      ["paidAt", "invoiceAt", "depositor", "invoiceNo", "masterMemo"].forEach((k) => { if (v(k)) b[k] = v(k); else delete b[k]; });
    }
    if (!DB.saveBill(b)) { err.textContent = "저장하지 못했어요. 잠시 후 다시 시도해 주세요."; return; }
    closeModal(); render();
    toast(master ? "이용료 기록을 저장했어요." : old ? "신청 내용을 고쳤어요." : cohortName + " 신청을 보냈어요. 확인 후 연락드릴게요.");
  }
  const findBill = (id) => DB.bills().find((x) => x.id === id);
  function payForm(b) {
    const m = DB.billMoney(b);
    openModal("입금 확인 · " + insName(b.instructorId) + " " + b.cohortName,
      '<form id="pay-form" class="a-form" data-id="' + esc(b.id) + '" novalidate><div class="a-bcalc"><span>받을 금액</span><b class="num">' + won(m.total) + "</b><small>" + (m.tax ? "공급가 " + won(m.supply) + " + 부가세 " + won(m.tax) : "부가세 없음") + "</small></div>" +
        '<div class="a-form-row"><div class="a-field"><label for="py-date">입금일</label><input class="a-input" type="date" id="py-date" name="paidAt" value="' + todayStr() + '"></div><div class="a-field"><label for="py-who">입금자명</label><input class="a-input" id="py-who" name="depositor" maxlength="60" value="' + esc(b.depositor || b.contactName || "") + '"></div></div>' +
        '<p class="a-muted" style="margin:0">통장에 들어온 금액을 확인한 뒤 눌러 주세요. 이 날짜 기준으로 월 · 연 매출에 들어가요.</p><p class="a-error" id="py-error"></p></form>',
      btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="pay-form">입금 확인</button>', "md");
  }
  function invoiceForm(b) {
    openModal("세금계산서 발행 · " + insName(b.instructorId) + " " + b.cohortName,
      '<form id="inv-form" class="a-form" data-id="' + esc(b.id) + '" novalidate>' +
        '<dl class="a-inq-info"><div><dt>받는 곳</dt><dd>' + esc([b.bizName, b.bizNo].filter(Boolean).join(" · ") || b.contactName || "-") + "</dd></div><div><dt>이메일</dt><dd>" + esc(b.email || "-") + "</dd></div><div><dt>공급가액</dt><dd>" + won(DB.billMoney(b).supply) + "</dd></div><div><dt>부가세</dt><dd>" + won(DB.billMoney(b).tax) + "</dd></div></dl>" +
        '<div class="a-form-row"><div class="a-field"><label for="iv-date">발행일</label><input class="a-input" type="date" id="iv-date" name="invoiceAt" value="' + todayStr() + '"></div><div class="a-field"><label for="iv-no">승인번호 <small>(선택)</small></label><input class="a-input" id="iv-no" name="invoiceNo" maxlength="60" value="' + esc(b.invoiceNo || "") + '"></div></div>' +
        '<p class="a-muted" style="margin:0">홈택스 등에서 발행한 뒤 기록해 두세요.</p></form>',
      btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="inv-form">발행 완료로 기록</button>', "md");
  }
  function openCohortForm(b) {
    const iid = b.instructorId, last = DB.cohortsOf(iid).slice(-1)[0];
    openModal(insName(iid) + " · 기수 열기",
      '<form id="open-form" class="a-form" data-id="' + esc(b.id) + '" novalidate>' +
        (b.paidAt ? "" : '<p class="a-warn-box">' + icon("alert", "sm") + "아직 입금 확인 전이에요. 먼저 열어 드려도 되는지 확인해 주세요.</p>") +
        '<div class="a-form-row"><div class="a-field"><label for="op-name">기수 이름</label><input class="a-input" id="op-name" name="name" maxlength="30" value="' + esc(b.cohortName || nextBillCohortName(iid)) + '"></div>' +
        '<div class="a-field"><label for="op-start">1주차 시작일</label><input class="a-input" type="date" id="op-start" name="startDate" value="' + esc(b.startDate || nextStartDate(iid)) + '"></div></div>' +
        '<div class="a-field"><label for="op-cur">커리큘럼</label><select class="a-input" id="op-cur" name="curriculumId">' + DB.curricula(iid).map((x) => '<option value="' + x.id + '"' + (x.id === ((last && last.curriculumId) || "main") ? " selected" : "") + ">" + esc(x.name) + " · " + x.weeks.length + "주</option>").join("") + "</select>" +
          '<small class="a-muted">강의 요일 · 시간은 지난 기수(' + esc(last ? last.name : "없음") + ")와 같게 열려요. 열고 나면 강사님이 ‘기수 관리’에서 바꿀 수 있어요.</small></div>" +
        '<label class="a-check"><input type="checkbox" name="recruiting" checked><span>수강생 로그인 화면에서 이 기수로 수강 신청 받기</span></label>' +
        '<p class="a-error" id="op-error"></p></form>',
      btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="open-form">' + icon("layers", "sm") + "기수 열기</button>", "md");
  }
  function saveBillStep(f) {
    const b = findBill(f.dataset.id);
    if (!b) { closeModal(); return; }
    const vat = b.vat || DB.billingInfo().vat;
    if (f.id === "pay-form") {
      if (!f.paidAt.value) { document.getElementById("py-error").textContent = "입금일을 골라 주세요."; return; }
      Object.assign(b, { paidAt: f.paidAt.value, vat });
      if (f.depositor.value.trim()) b.depositor = f.depositor.value.trim(); else delete b.depositor;
      DB.saveBill(b); closeModal(); render(); toast("입금을 확인했어요. 세금계산서를 발행하고 기수를 열어 주세요.");
      return;
    }
    if (f.id === "inv-form") {
      Object.assign(b, { invoiceAt: f.invoiceAt.value || todayStr(), vat });
      if (f.invoiceNo.value.trim()) b.invoiceNo = f.invoiceNo.value.trim(); else delete b.invoiceNo;
      DB.saveBill(b); closeModal(); render(); toast("세금계산서 발행을 기록했어요.");
      return;
    }
    // 기수 열기: 강사 기수 목록에 새 기수를 넣고 신청과 이어 둔다 (강사 · 코치는 기수를 새로 만들 수 없음)
    const name = f.name.value.trim(), start = f.startDate.value, err = document.getElementById("op-error");
    if (!name) { err.textContent = "기수 이름을 적어 주세요."; return; }
    if (!start) { err.textContent = "1주차 시작일을 골라 주세요."; return; }
    if (DB.cohortsOf(b.instructorId).some((c) => c.name === name)) { err.textContent = "이미 같은 이름의 기수가 있어요."; return; }
    const last = DB.cohortsOf(b.instructorId).slice(-1)[0] || {};
    const co = { id: DB.uid("c"), instructorId: b.instructorId, name, startDate: start, recruiting: f.recruiting.checked };
    if (f.curriculumId.value && f.curriculumId.value !== "main") co.curriculumId = f.curriculumId.value;
    if (last.classDow !== undefined && last.classDow !== null && last.classDow !== "") co.classDow = last.classDow;
    if (last.classTime) co.classTime = last.classTime;
    DB.data.cohorts.push(co);
    Object.assign(b, { cohortId: co.id, openedAt: todayStr(), cohortName: name, startDate: start, vat });
    DB.saveBill(b);
    commit(insName(b.instructorId) + " " + name + "를 열었어요. 강사센터 ‘기수 관리’에 바로 보여요.");
  }

  /* 마스터: 기수 신청 · 매출 */
  function billKpis() {
    const all = DB.bills(), today = todayStr(), ym = today.slice(0, 7), yy = today.slice(0, 4);
    const mon = all.filter((b) => paidIn(b, ym)), yr = all.filter((b) => paidIn(b, yy));
    const unpaid = all.filter((b) => !b.canceledAt && !b.paidAt), noInv = all.filter((b) => !b.canceledAt && b.paidAt && !b.invoiceAt), toOpen = all.filter((b) => !b.canceledAt && !b.cohortId);
    const href = (tab) => "#/center/master/billing?tab=" + tab;
    return '<div class="a-kpis a-kpis-5">' +
      kpi("이번 달 매출", won(sumMoney(mon, "supply")), "입금 " + mon.length + "건 · 부가세 포함 " + won(sumMoney(mon, "total")), href("sales")) +
      kpi("올해 매출", won(sumMoney(yr, "supply")), yy + "년 입금 " + yr.length + "건", href("sales")) +
      kpi("입금 대기", unpaid.length + "건", won(sumMoney(unpaid, "total")), href("todo"), unpaid.length ? "warn" : "") +
      kpi("계산서 미발행", noInv.length + "건", "입금 확인 뒤 발행", href("todo"), noInv.length ? "warn" : "") +
      kpi("기수 열기 대기", toOpen.length + "건", "신청 · 입금된 기수", href("todo"), toOpen.length ? "info" : "") +
    "</div>";
  }
  const BILL_TABS = [["todo", "처리할 일"], ["cal", "달력"], ["sales", "매출표"], ["all", "전체 내역"], ["set", "입금 계좌 · 설정"]];
  function pageMasterBilling(r) {
    const tq = r && r.params.get("tab");
    if (tq && BILL_TABS.some((t) => t[0] === tq)) { ui.billTab = tq; ROUTE.replace("#/center/master/billing"); }
    const all = DB.bills(), tab = ui.billTab || "todo";
    DB.store.set("moonclass:bill-seen", all.map((b) => b.id).slice(-300));
    const n = { todo: all.filter(billTodo).length, all: all.length };
    const body = tab === "cal" ? billCalendar(all) : tab === "sales" ? billSales(all) : tab === "all" ? billAll(all) : tab === "set" ? billSettings() : billTodoList(all);
    return head("기수 신청 · 매출", "강사님이 강사센터에서 ‘다음 기수 신청’을 하면 여기로 들어와요. 전화 → 무통장 입금 확인 → 세금계산서 발행 → 기수 열기 순서로 처리해요. 이용료 = 강사님 1인 수강료 × 1명분.",
        btn(icon("download", "sm") + "CSV 내려받기", "bill-csv", "a-btn-ghost") + btn(icon("plus", "sm") + "직접 기록", "bill-add", "a-btn-primary")) +
      billKpis() +
      '<div class="a-tabs a-btabs">' + BILL_TABS.map((t) => '<button type="button" class="a-tab' + (tab === t[0] ? " on" : "") + '" data-action="bill-tab" data-k="' + t[0] + '">' + t[1] + (n[t[0]] != null ? ' <span class="num">' + n[t[0]] + "</span>" : "") + "</button>").join("") + "</div>" +
      body;
  }
  function billTodoList(all) {
    const list = all.filter(billTodo);
    return '<section class="a-card"><div class="a-card-head"><h2>처리할 신청</h2><span class="a-muted">입금 · 세금계산서 · 기수 열기가 남은 신청 ' + list.length + "건</span></div>" +
      (list.length ? '<div class="a-stack">' + list.map((b) => billCard(b, true)).join("") + "</div>" : emptyBox("check", "처리할 신청이 없어요. 새 신청이 들어오면 왼쪽 메뉴에 숫자로 보여요.")) + "</section>";
  }
  const CAL_TYPES = [["start", "기수 시작"], ["plan", "시작 예정"], ["req", "신청"], ["paid", "입금"], ["inv", "세금계산서"]];
  function billEvents(all) {
    const ev = [];
    all.forEach((b) => {
      if (b.canceledAt) return;
      const nm = insName(b.instructorId) + " " + (b.cohortName || "");
      if (b.requestedAt) ev.push({ date: dayOf(b.requestedAt), type: "req", label: nm + " 신청", id: b.id });
      if (b.paidAt) ev.push({ date: b.paidAt, type: "paid", label: nm + " 입금 " + won(DB.billMoney(b).total), id: b.id });
      if (b.invoiceAt) ev.push({ date: b.invoiceAt, type: "inv", label: nm + " 계산서", id: b.id });
      if (!b.cohortId && b.startDate) ev.push({ date: b.startDate, type: "plan", label: nm + " 시작 예정", id: b.id });
    });
    DB.data.cohorts.forEach((co) => { const x = DB.instructor(co.instructorId); if (x && co.startDate) ev.push({ date: co.startDate, type: "start", label: x.displayName + " " + co.name + " 시작" }); });
    return ev;
  }
  function billCalendar(all) {
    const ym = ui.calYM || todayStr().slice(0, 7);
    const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
    const startDow = new Date(y, m - 1, 1).getDay(), days = new Date(y, m, 0).getDate(), today = todayStr();
    const order = CAL_TYPES.map((t) => t[0]);
    const ev = billEvents(all).filter((e) => e.date && e.date.slice(0, 7) === ym).sort((a, b) => a.date.localeCompare(b.date) || order.indexOf(a.type) - order.indexOf(b.type));
    const byDay = {};
    ev.forEach((e) => { (byDay[e.date] = byDay[e.date] || []).push(e); });
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push('<div class="a-cal-d out"></div>');
    for (let d = 1; d <= days; d++) {
      const ds = ym + "-" + String(d).padStart(2, "0"), list = byDay[ds] || [], dow = (startDow + d - 1) % 7;
      cells.push('<button type="button" class="a-cal-d' + (ds === today ? " today" : "") + (ds === ui.calDay ? " on" : "") + (dow === 0 ? " sun" : dow === 6 ? " sat" : "") + (list.length ? " has" : "") + '" data-action="cal-day" data-d="' + ds + '" aria-label="' + m + "월 " + d + "일 일정 " + list.length + '개"><span class="a-cal-n">' + d + "</span>" +
        list.slice(0, 3).map((e) => '<span class="a-cal-ev t-' + e.type + '">' + esc(e.label) + "</span>").join("") + (list.length > 3 ? '<span class="a-cal-more">+' + (list.length - 3) + "</span>" : "") +
        (list.length ? '<span class="a-cal-dots">' + list.slice(0, 4).map((e) => '<i class="t-' + e.type + '"></i>').join("") + "</span>" : "") + "</button>");
    }
    while (cells.length % 7) cells.push('<div class="a-cal-d out"></div>');
    const mb = all.filter((b) => paidIn(b, ym));
    const sel = ui.calDay && ui.calDay.slice(0, 7) === ym ? ui.calDay : null;
    const listEv = sel ? byDay[sel] || [] : ev;
    const typeLabel = (t) => (CAL_TYPES.find((x) => x[0] === t) || ["", ""])[1];
    return '<section class="a-card"><div class="a-card-head a-cal-head"><button type="button" class="a-icon-btn" data-action="cal-move" data-dir="-1" aria-label="이전 달">' + icon("chevLeft") + "</button><h2>" + y + "년 " + m + "월</h2>" + '<button type="button" class="a-icon-btn" data-action="cal-move" data-dir="1" aria-label="다음 달">' + icon("chevRight") + "</button>" + btn("오늘", "cal-today", "a-btn-ghost a-btn-sm") +
        '<span class="a-cal-sum">이 달 입금 ' + mb.length + "건 · <b>" + won(sumMoney(mb, "supply")) + "</b></span></div>" +
        '<div class="a-cal-legend">' + CAL_TYPES.map((t) => '<span><i class="t-' + t[0] + '"></i>' + t[1] + "</span>").join("") + "</div>" +
        '<div class="a-cal"><div class="a-cal-w">' + DOW.map((d) => "<span>" + d + "</span>").join("") + '</div><div class="a-cal-g">' + cells.join("") + "</div></div></section>" +
      '<section class="a-card"><div class="a-card-head"><h2>' + (sel ? fmtMD(sel) + " 일정" : m + "월 일정") + "</h2>" + (sel ? btn("이 달 전체 보기", "cal-day", "a-btn-ghost a-btn-sm", ' data-d=""') : '<span class="a-muted">' + ev.length + "개</span>") + "</div>" +
        (listEv.length ? '<ul class="a-list a-cal-list">' + listEv.map((e) => "<li" + (e.id ? ' class="clickable" data-action="bill-edit" data-id="' + esc(e.id) + '"' : "") + '><span class="a-cal-date num">' + fmtMD(e.date) + '</span><span class="a-cal-tag t-' + e.type + '">' + typeLabel(e.type) + "</span><b>" + esc(e.label) + "</b></li>").join("") + "</ul>" : emptyBox("calendar", sel ? "이 날짜에는 일정이 없어요." : "이 달에는 일정이 없어요.")) + "</section>";
  }
  function billSales(all) {
    const y = ui.revYear || Number(todayStr().slice(0, 4));
    const paid = all.filter((b) => !b.canceledAt && b.paidAt);
    const yr = paid.filter((b) => b.paidAt.slice(0, 4) === String(y));
    const add = (a, b) => { const m = DB.billMoney(b); a.n++; a.supply += m.supply; a.tax += m.tax; a.total += m.total; if (b.invoiceAt) a.inv++; return a; };
    const zero = () => ({ n: 0, supply: 0, tax: 0, total: 0, inv: 0 });
    const months = Array.from({ length: 12 }, (_, i) => { const pre = y + "-" + String(i + 1).padStart(2, "0"); return Object.assign({ i, pre }, yr.filter((b) => b.paidAt.slice(0, 7) === pre).reduce(add, zero())); });
    const tot = yr.reduce(add, zero());
    const max = Math.max(1, ...months.map((x) => x.supply));
    const thisM = todayStr().slice(0, 7);
    const byIns = {}, years = {};
    yr.forEach((b) => add(byIns[b.instructorId] = byIns[b.instructorId] || zero(), b));
    paid.forEach((b) => add(years[b.paidAt.slice(0, 4)] = years[b.paidAt.slice(0, 4)] || zero(), b));
    const short = (n) => (n >= 10000 ? Math.round(n / 10000).toLocaleString("ko-KR") + "만" : n.toLocaleString("ko-KR"));
    const invPill = (x) => (!x.n ? '<span class="a-muted">-</span>' : x.inv === x.n ? pill("모두 발행", "ok") : pill("미발행 " + (x.n - x.inv) + "건", "warn"));
    return '<section class="a-card"><div class="a-card-head a-cal-head"><button type="button" class="a-icon-btn" data-action="rev-year" data-dir="-1" aria-label="이전 해">' + icon("chevLeft") + "</button><h2>" + y + "년 매출</h2>" + '<button type="button" class="a-icon-btn" data-action="rev-year" data-dir="1" aria-label="다음 해">' + icon("chevRight") + "</button>" +
        '<span class="a-cal-sum">입금 ' + tot.n + "건 · 공급가 <b>" + won(tot.supply) + "</b> · 부가세 포함 " + won(tot.total) + "</span></div>" +
        '<div class="a-rev-chart" aria-hidden="true">' + months.map((x) => '<div class="a-rev-col' + (x.pre === thisM ? " now" : "") + '"><small class="num">' + (x.supply ? short(x.supply) : "") + '</small><span class="a-rev-bar"><i style="height:' + (x.supply ? Math.max(3, Math.round(x.supply / max * 100)) : 0) + '%"></i></span><b>' + (x.i + 1) + "월</b></div>").join("") + "</div>" +
        '<div class="a-table-wrap"><table class="a-table a-rev-table"><thead><tr><th>월</th><th>입금</th><th>공급가액 (매출)</th><th>부가세</th><th>합계</th><th>세금계산서</th></tr></thead><tbody>' +
          months.map((x) => "<tr" + (x.n ? "" : ' class="a-dim"') + "><td><b>" + y + "년 " + (x.i + 1) + '월</b></td><td class="num">' + x.n + '건</td><td class="num">' + won(x.supply) + '</td><td class="num">' + won(x.tax) + '</td><td class="num">' + won(x.total) + "</td><td>" + invPill(x) + "</td></tr>").join("") +
          '<tr class="a-rev-total"><td><b>' + y + '년 합계</b></td><td class="num"><b>' + tot.n + '건</b></td><td class="num"><b>' + won(tot.supply) + '</b></td><td class="num">' + won(tot.tax) + '</td><td class="num"><b>' + won(tot.total) + "</b></td><td>" + invPill(tot) + "</td></tr>" +
        "</tbody></table></div></section>" +
      '<div class="a-grid-2">' +
        '<section class="a-card"><div class="a-card-head"><h2>강사별 ' + y + "년 매출</h2></div>" + (Object.keys(byIns).length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>강사</th><th>기수</th><th>공급가액</th><th>합계</th></tr></thead><tbody>' +
          Object.keys(byIns).sort((a, b) => byIns[b].supply - byIns[a].supply).map((k) => "<tr><td><b>" + esc(insName(k)) + '</b></td><td class="num">' + byIns[k].n + '건</td><td class="num">' + won(byIns[k].supply) + '</td><td class="num">' + won(byIns[k].total) + "</td></tr>").join("") + "</tbody></table></div>" : emptyBox("coins", "이 해에 입금된 이용료가 없어요.")) + "</section>" +
        '<section class="a-card"><div class="a-card-head"><h2>연도별 매출</h2></div>' + (Object.keys(years).length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>연도</th><th>입금</th><th>공급가액</th><th>합계</th></tr></thead><tbody>' +
          Object.keys(years).sort().reverse().map((k) => '<tr class="clickable" data-action="rev-year-set" data-y="' + k + '"><td><b>' + k + '년</b></td><td class="num">' + years[k].n + '건</td><td class="num">' + won(years[k].supply) + '</td><td class="num">' + won(years[k].total) + "</td></tr>").join("") + "</tbody></table></div>" : emptyBox("coins", "아직 입금된 이용료가 없어요.")) + "</section>" +
      "</div>";
  }
  function billAll(all) {
    const fi = ui.billIns || "all", fs = ui.billState || "all";
    const list = all.filter((b) => (fi === "all" || b.instructorId === fi) && (fs === "all" || (fs === "noinv" ? !b.canceledAt && b.paidAt && !b.invoiceAt : DB.billState(b) === fs)));
    const insIds = DB.data.instructors.map((x) => x.id).concat(all.map((b) => b.instructorId)).filter((v, i, a) => a.indexOf(v) === i);
    return '<section class="a-card"><div class="a-toolbar"><div class="a-filters">' +
        '<select class="a-input a-sm" id="bill-ins" aria-label="강사"><option value="all">전체 강사</option>' + insIds.map((k) => '<option value="' + esc(k) + '"' + (fi === k ? " selected" : "") + ">" + esc(insName(k)) + "</option>").join("") + "</select>" +
        '<select class="a-input a-sm" id="bill-state" aria-label="상태"><option value="all">전체 상태</option>' + Object.keys(DB.BILL_STATE).map((k) => '<option value="' + k + '"' + (fs === k ? " selected" : "") + ">" + DB.BILL_STATE[k].label + "</option>").join("") + '<option value="noinv"' + (fs === "noinv" ? " selected" : "") + ">계산서 미발행</option></select>" +
      '</div><span class="a-muted">' + list.length + "건 · 공급가 " + won(sumMoney(list.filter((b) => !b.canceledAt && b.paidAt), "supply")) + " 입금</span></div>" +
      (list.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>강사 · 기수</th><th>신청일</th><th>1인 수강료</th><th>이용료 (합계)</th><th>입금</th><th>세금계산서</th><th>기수</th><th>상태</th><th class="right">관리</th></tr></thead><tbody>' +
        list.map((b) => {
          const m = DB.billMoney(b), st = DB.BILL_STATE[DB.billState(b)], co = b.cohortId ? DB.cohort(b.cohortId) : null;
          return "<tr><td><b>" + esc(insName(b.instructorId)) + " · " + esc(b.cohortName || "-") + '</b><small class="a-memo">' + esc(BILL_KIND[b.kind] || BILL_KIND.next) + '</small></td><td class="num">' + (b.requestedAt ? fmtMD(dayOf(b.requestedAt)) : "-") + '</td><td class="num">' + (b.fee ? won(b.fee) : "-") + '</td><td class="num">' + won(m.total) + (m.tax ? '<small class="a-memo">공급가 ' + won(m.supply) + "</small>" : "") + "</td>" +
            "<td>" + (b.paidAt ? fmtMD(b.paidAt) : '<span class="a-muted">미입금</span>') + "</td><td>" + (b.invoiceAt ? fmtMD(b.invoiceAt) : '<span class="a-muted">미발행</span>') + "</td><td>" + (co ? esc(co.name) + ' <small class="a-memo">' + fmtMD(co.startDate) + " 시작</small>" : '<span class="a-muted">-</span>') + "</td><td>" + pill(st.label, st.cls) + '</td><td class="right">' + btn("수정", "bill-edit", "a-btn-ghost a-btn-sm", ' data-id="' + esc(b.id) + '"') + "</td></tr>";
        }).join("") + "</tbody></table></div>" : emptyBox("coins", all.length ? "조건에 맞는 기록이 없어요." : "아직 이용료 기록이 없어요.")) + "</section>";
  }
  function billSettings() {
    const bi = DB.billingInfo();
    const fld = (k, label, ph) => '<div class="a-field"><label for="bl-' + k + '">' + label + '</label><input class="a-input" id="bl-' + k + '" name="' + k + '" value="' + esc(bi[k] || "") + '" placeholder="' + esc(ph) + '" maxlength="60"></div>';
    return '<form id="billing-form" class="a-site-form" novalidate><section class="a-card"><div class="a-card-head"><h2>입금 계좌 · 부가세</h2><span class="a-muted">강사센터 ‘다음 기수 신청’ 화면에 보여요 (수강생 · 방문자에게는 안 보여요)</span></div>' +
      '<div class="a-site-grid">' + fld("bank", "은행", "예: 국민은행") + fld("account", "계좌번호", "예: 000000-00-000000") + fld("holder", "예금주", "예: (주)두고홀딩스") +
        '<div class="a-field"><label for="bl-vat">부가세</label><select class="a-input" id="bl-vat" name="vat">' + DB.BILL_VAT.map((v) => '<option value="' + v[0] + '"' + (bi.vat === v[0] ? " selected" : "") + ">" + v[1] + "</option>").join("") + "</select></div>" +
        '<div class="a-field a-span2"><label for="bl-note">강사님께 보일 안내 <small>(선택)</small></label><textarea class="a-input" id="bl-note" name="note" rows="2" maxlength="300" placeholder="예: 입금자명은 강사님 성함으로 해 주세요.">' + esc(bi.note || "") + "</textarea></div>" +
      "</div><p class=\"a-muted\" style=\"margin:12px 0 0\">부가세 방식은 앞으로 확인하는 입금부터 적용돼요. 이미 입금 확인한 기록은 그때 방식 그대로 남아요.</p></section>" +
      '<div class="a-site-save"><button type="submit" class="a-btn a-btn-primary">' + icon("check", "sm") + "저장</button></div></form>";
  }
  function billCsv() {
    const cols = ["신청일", "강사", "기수", "구분", "1인 수강료", "공급가액", "부가세", "합계", "입금일", "입금자", "세금계산서 발행일", "승인번호", "기수 오픈일", "상태", "담당자", "연락처", "이메일", "상호", "사업자등록번호", "남긴 말", "마스터 메모"];
    const rows = DB.bills().slice().reverse().map((b) => { const m = DB.billMoney(b); return [dayOf(b.requestedAt), insName(b.instructorId), b.cohortName, BILL_KIND[b.kind] || "", b.fee || "", m.supply, m.tax, m.total, b.paidAt, b.depositor, b.invoiceAt, b.invoiceNo, b.openedAt, DB.BILL_STATE[DB.billState(b)].label, b.contactName, b.phone, b.email, b.bizName, b.bizNo, b.memo, b.masterMemo]; });
    // 엑셀이 = + - @ 로 시작하는 칸을 수식으로 읽지 않게
    const cell = (v) => { let s = String(v == null ? "" : v); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = "\uFEFF" + [cols].concat(rows).map((r) => r.map(cell).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "두잉고-기수이용료-" + todayStr() + ".csv";
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast("CSV 파일을 내려받았어요.");
  }
  // 새 신청이 들어오면 마스터 화면에 한 번 알린다 (왼쪽 메뉴 숫자 · 대시보드 알림과 함께)
  /** 입점 문의 카드가 화면에 1.5초 이상 보이면 파트너 메시지를 읽음으로 */
  let inqIO = null;
  function markInqSeen() {
    if (inqIO) inqIO.disconnect();
    if (!("IntersectionObserver" in window)) return;
    const timers = new Map();
    inqIO = new IntersectionObserver((ents) => ents.forEach((e) => {
      const id = e.target.dataset.inq;
      if (e.isIntersecting) { if (!timers.has(id)) timers.set(id, setTimeout(() => { const x = findInq(id); if (x && msgUnreadM(x)) { x.mSeen = Date.now(); DB.saveInquiry(x); e.target.classList.add("seen"); refreshInqBadges(); } inqIO && inqIO.unobserve(e.target); }, 1500)); }
      else if (timers.has(id)) { clearTimeout(timers.get(id)); timers.delete(id); }
    }), { threshold: 0.35 });
    document.querySelectorAll('.a-inq[data-unread="1"]').forEach((el) => inqIO.observe(el));
  }
  /** 메뉴 · 종 숫자만 다시 그리기 (화면은 그대로) */
  function refreshInqBadges() {
    const a = masterInqAlerts(), n = a.inq + a.msg;
    const nav = document.querySelector('.a-nav[href="#/center/master/partners"]');
    if (nav) { let b = nav.querySelector(".a-nav-num, span + span"); if (b && !n) b.remove(); else if (b) b.textContent = n; }
    const bell = document.querySelector(".a-bell"); if (bell) { const b = bell.querySelector("b"); if (!n) { bell.classList.remove("on"); if (b) b.remove(); } else if (b) b.textContent = n; }
  }
  /** 파트너가 보낸 새 메시지 알림 (처음 한 번만 토스트) */
  function notifyPartnerMsgs() {
    if (!staffCan("master/partners")) return;
    const seen = DB.store.get("moonclass:pmsg-seen", []) || [];
    const fresh = [];
    DB.inquiries().forEach((q) => (q.thread || []).forEach((m) => { const k = q.id + ":" + m.at; if (m.by === "partner" && m.at > (q.mSeen || 0) && seen.indexOf(k) === -1) fresh.push({ q, m, k }); }));
    if (!fresh.length) return;
    DB.store.set("moonclass:pmsg-seen", seen.concat(fresh.map((f) => f.k)).slice(-300));
    const f = fresh.slice().sort((a, b) => b.m.at - a.m.at)[0];
    setTimeout(() => toast("🔔 " + (f.m.name || "파트너") + " 파트너 메시지 (" + f.q.name + " 님 문의): " + String(f.m.text).slice(0, 40) + (fresh.length > 1 ? " 외 " + (fresh.length - 1) + "건" : "")), 400);
  }
  function notifyPartnerSide() {
    const p = affMe(); if (!p) return;
    const seen = DB.store.get("moonclass:pnote-seen", []) || [], fresh = [];
    affInqs(p).forEach((q) => { const u = inqUpdated(q); const k = q.id + ":" + u; if (u > (q.pSeen || 0) && seen.indexOf(k) === -1 && u !== q.at) fresh.push({ q, k }); });
    if (!fresh.length) return;
    DB.store.set("moonclass:pnote-seen", seen.concat(fresh.map((f) => f.k)).slice(-300));
    setTimeout(() => toast("🔔 입점 문의에 새 소식이 있어요: " + fresh.map((f) => f.q.name + " 님").slice(0, 2).join(", ") + (fresh.length > 2 ? " 외 " + (fresh.length - 2) + "건" : "")), 400);
  }
  function notifyBills() {
    const seen = DB.store.get("moonclass:bill-seen", []) || [];
    const fresh = DB.bills().filter((b) => DB.billState(b) === "requested" && seen.indexOf(b.id) === -1);
    if (!fresh.length) return;
    DB.store.set("moonclass:bill-seen", seen.concat(fresh.map((b) => b.id)).slice(-300));
    toast("새 기수 신청: " + fresh.slice(0, 2).map((b) => insName(b.instructorId) + " " + b.cohortName).join(", ") + (fresh.length > 2 ? " 외 " + (fresh.length - 2) + "건" : ""));
  }

  /* ---------------- 마스터: 강사 공지 ---------------- */
  function pageMasterNotices() {
    const list = DB.data.announcements.slice().sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date));
    return head("강사 공지", "강사센터 · 코치 센터 ‘운영팀 공지’ 메뉴와 강사 대시보드 맨 위에 보여요. ‘받는 강사’를 고르면 그 강사님에게만 보내요.", addBtn("ann", "공지 쓰기")) +
      '<section class="a-card">' + (list.length ? '<ul class="a-items">' + list.map((n) => '<li><div class="a-item-main"><b>' + esc(n.title) + "</b><small>" + fmtFull(n.date) + " · " + (n.to ? esc(insName(n.to)) + " 강사님에게만 · " : "전체 · ") + esc((n.body || "").slice(0, 70)) + "</small></div>" + (n.pinned ? pill("고정", "dark") : "") +
        '<div class="a-row-actions">' + btn(icon("pen", "sm") + "수정", "item-edit", "a-btn-ghost a-btn-sm", ' data-coll="ann" data-id="' + n.id + '"') + "</div></li>").join("") + "</ul>" : emptyBox("megaphone", "강사에게 보낸 공지가 없어요.")) + "</section>";
  }

  /* ---------------- 마스터: 첫 화면 · 사업자 정보 (두잉고 첫 화면 바닥에 보임, 채운 칸만) ---------------- */
  const SITE_FIELDS = [
    ["company", "상호", "예: (주)두고홀딩스"], ["ceo", "대표자", "예: 홍길동"],
    ["bizNo", "사업자등록번호", "예: 000-00-00000"], ["mailOrderNo", "통신판매업 신고번호", "예: 제0000-서울○○-0000호"],
    ["address", "사업장 주소", "예: 서울특별시 ○○구 ○○로 00", true], ["zip", "우편번호", "예: 30121"],
    ["phone", "고객센터 전화", "예: 1600-0000"], ["email", "사업제휴 · 입점 문의 이메일", "예: help@example.com"],
    ["hours", "운영 시간", "예: 평일 10:00 ~ 18:00"], ["privacyOfficer", "개인정보 보호책임자", "예: 홍길동"],
    ["kakaoCh", "운영 상담 카카오톡 채널 (문의하기 버튼)", "https://pf.kakao.com/_xxxx", true],
    ["hosting", "호스팅 제공자", "예: Vercel Inc."], ["terms", "이용약관 주소", "https://"], ["privacy", "개인정보처리방침 주소", "https://"],
    ["notice", "맨 아래 안내 문구", "예: (주)○○는 통신판매중개자로서 …", true]
  ];
  function pageMasterSite() {
    const s = DB.siteInfo();
    const fld = (x) => '<div class="a-field' + (x[3] ? " a-span2" : "") + '"><label for="site-' + x[0] + '">' + x[1] + '</label><input class="a-input" id="site-' + x[0] + '" name="' + x[0] + '" value="' + esc(s[x[0]] || "") + '" placeholder="' + esc(x[2]) + '" maxlength="' + (x[0] === "notice" ? 300 : 200) + '"></div>';
    return head("첫 화면 · 사업자 정보", "두잉고 첫 화면 맨 아래(바닥)에 보이는 사업자 정보 · 사업제휴 문의예요. 채운 칸만 보이고, 기본 사업자 정보(두고홀딩스)가 들어 있는 칸은 비워 두면 기본값이 보여요.", dgSplitBtn("home", "첫 화면 미리보기")) +
      '<form id="site-form" class="a-site-form" novalidate>' +
        '<section class="a-card"><div class="a-card-head"><h2>사업자 정보</h2><span class="a-muted">전자상거래법에 따라 사이트 바닥에 표시하는 정보예요</span></div>' +
          '<div class="a-site-grid">' + SITE_FIELDS.map(fld).join("") + "</div></section>" +
        '<div class="a-site-save"><button type="submit" class="a-btn a-btn-primary">' + icon("check", "sm") + "저장</button></div>" +
      "</form>";
  }

  /* ---------------- 마스터: 데이터 관리 ---------------- */
  function snapshot() {
    return { exportedAt: new Date().toISOString(), db: DB.data, progress: DB.allProgress(), inquiries: DB.inquiries(), bills: DB.bills() };
  }
  function pageMasterData() {
    const json = JSON.stringify(snapshot());
    const kb = Math.round(new Blob([json]).size / 1024);
    return head("데이터 관리", DB.remote.on ? "데이터는 서버(Turso 데이터베이스)에 저장돼요. 어느 기기에서 로그인해도 같은 내용이 보여요. 혹시 모를 상황에 대비해 가끔 백업해 두세요." : "지금은 서버 없이 이 브라우저에 저장돼요. 다른 컴퓨터로 옮기거나 혹시 모를 상황에 대비해 백업해 두세요.") +
      '<div class="a-kpis">' + kpi("저장된 데이터", kb + "KB", DB.remote.on ? "서버 데이터베이스 (사진은 따로 보관)" : "브라우저 저장 공간 약 5MB 중", "#/center/master/data", !DB.remote.on && kb > 3500 ? "warn" : "") + kpi("강사 플랫폼", DB.data.instructors.length + "개", "콘텐츠 포함", "#/center/master/instructors") + kpi("수강생", DB.data.students.length + "명", "제출 기록 포함", "#/center/master/students") + kpi("강사 공지", DB.data.announcements.length + "건", "", "#/center/master/notices") + "</div>" +
      '<section class="a-card"><div class="a-card-head"><h2>백업</h2><span class="a-muted">아래 내용을 복사해서 메모장 등에 보관하세요</span></div><textarea class="a-input a-mono" id="backup-out" rows="5" readonly>' + esc(json) + '</textarea><div class="a-card-foot">' + btn(icon("clipboard", "sm") + "백업 내용 복사", "backup-copy", "a-btn-primary a-btn-sm") + "</div></section>" +
      '<section class="a-card"><div class="a-card-head"><h2>복원</h2><span class="a-muted">백업해 둔 내용을 붙여 넣으면 그 시점으로 돌아가요</span></div><textarea class="a-input a-mono" id="backup-in" rows="4" placeholder="{&quot;exportedAt&quot;: … }"></textarea><div class="a-card-foot">' + btn(icon("refresh", "sm") + "이 내용으로 복원", "backup-restore", "a-btn-outline a-btn-sm") + "</div></section>" +
      (DB.remote.on ? serverBackups() : "") +
      '<section class="a-card"><div class="a-card-head"><h2>체험 데이터 처음으로</h2></div><p class="a-muted" style="margin:0 0 12px">모든 강사·수강생·제출 기록을 지우고 처음 체험 상태로 되돌려요. ' + (DB.remote.on ? "지금 상태는 서버 자동 백업에 먼저 남겨요." : "되돌릴 수 없으니 먼저 백업하세요.") + "</p>" + btn(icon("trash", "sm") + "처음 상태로 초기화", "data-reset", "a-btn-ghost a-btn-sm danger") + "</section>";
  }
  /* 번호로 넘기는 목록 — ‹ 1 2 3 4 5 › (지금 쪽은 ui.pg[key] · 글이 많아도 번호는 5개만 보여요) */
  function pageSlice(key, list, per) {
    const n = Math.max(1, Math.ceil(list.length / per)), p = Math.min(Math.max(1, (ui.pg && ui.pg[key]) || 1), n);
    return { items: list.slice((p - 1) * per, p * per), p, n, from: list.length ? (p - 1) * per + 1 : 0, to: Math.min(list.length, p * per), total: list.length };
  }
  function numPager(key, pg) {
    if (pg.n <= 1) return "";
    const a = Math.max(1, Math.min(pg.p - 2, pg.n - 4)), b = Math.min(pg.n, a + 4), nums = [];
    for (let i = a; i <= b; i++) nums.push(i);
    const go = (p, label, cls, dis, aria) => '<button type="button" class="a-pg-b' + (cls ? " " + cls : "") + '" data-action="pg" data-k="' + key + '" data-p="' + p + '"' + (dis ? " disabled" : "") + (aria ? ' aria-label="' + aria + '"' : "") + (p === pg.p && !aria ? ' aria-current="page"' : "") + ">" + label + "</button>";
    return '<nav class="a-pg" aria-label="쪽 넘기기"><span class="a-pg-info">' + pg.from + "–" + pg.to + " / " + pg.total + "개</span><span class=\"a-pg-nums\">" +
      go(pg.p - 1, icon("chevLeft", "sm"), "a-pg-arr", pg.p <= 1, "이전 쪽") + (a > 1 ? go(1, "1") + (a > 2 ? '<span class="a-pg-gap">…</span>' : "") : "") +
      nums.map((i) => go(i, String(i), i === pg.p ? "on" : "")).join("") +
      (b < pg.n ? (b < pg.n - 1 ? '<span class="a-pg-gap">…</span>' : "") + go(pg.n, String(pg.n)) : "") + go(pg.p + 1, icon("chevRight", "sm"), "a-pg-arr", pg.p >= pg.n, "다음 쪽") + "</span></nav>";
  }
  // 서버 자동 백업: 배포할 때마다 · 초기화나 되돌리기 전에 서버가 스스로 만든다 (최근 40개 · 5개씩 번호로 넘김)
  function serverBackups() {
    if (!ui.backups && !ui.backupsLoading) {
      ui.backupsLoading = true;
      DB.remote.call("admin", { action: "backups" }).then((r) => { ui.backups = r.backups || []; }, () => { ui.backups = []; ui.backupsErr = true; })
        .then(() => { ui.backupsLoading = false; if (/^#\/center\/master\/data/.test(ROUTE.hash)) render(); });
    }
    const list = ui.backups || [], pg = pageSlice("bk", list, 5);
    return '<section class="a-card" data-pg-card="bk"><div class="a-card-head"><h2>서버 자동 백업</h2><span class="a-muted">배포할 때마다 · 초기화나 되돌리기 전에 자동으로 남아요 (최근 40개)</span></div>' +
      '<p class="a-muted" style="margin:0 0 12px">새 기능을 배포해도 강사센터에서 올린 공지 · 영상 · 전자책 · 수강생 기록은 그대로 유지돼요. 지우기는 강사센터 · 마스터에서 직접 지울 때만 일어나요. 혹시 잘못 지웠다면 아래에서 그 전 시점으로 되돌릴 수 있어요.</p>' +
      (!ui.backups ? '<p class="a-muted" style="margin:0">불러오는 중…</p>'
        : list.length ? '<ul class="a-list">' + pg.items.map((b) => '<li><div class="a-who"><span class="a-avatar">' + icon("database", "sm") + "</span><div><b>#" + b.id + " " + esc(b.reason || "백업") + "</b><small>" + fmtStamp(b.at) + " · 문서 " + b.docs + "개 · " + Math.max(1, Math.round((b.size || 0) / 1024)) + "KB</small></div></div>" + btn(icon("refresh", "sm") + "이 시점으로", "server-restore", "a-btn-outline a-btn-sm", ' data-id="' + b.id + '" data-at="' + b.at + '"') + "</li>").join("") + "</ul>"
        : '<p class="a-muted" style="margin:0">' + (ui.backupsErr ? "백업 목록을 불러오지 못했어요." : "아직 백업이 없어요.") + "</p>") +
      numPager("bk", pg) + '<div class="a-card-foot">' + btn(icon("download", "sm") + "지금 백업", "server-backup", "a-btn-primary a-btn-sm") + "</div></section>";
  }

  /* ---------------- 강사: 추가 메뉴 내용 ---------------- */
  function pageCustomPages() {
    const iid = IID(), c = C();
    const items = customPages(MID());
    return head("추가 메뉴", "‘메뉴 구성’에서 만든 페이지 메뉴의 내용을 채워요. 수강생 화면 왼쪽 메뉴에 그대로 보여요.") +
      (items.length ? '<div class="a-stack">' + items.map((it) => {
        const pg = c.pages[it.key] || {};
        return '<section class="a-card"><div class="a-card-head"><span class="a-menu-ico">' + icon(it.icon || "file", "sm") + '</span><h2 class="a-grow">' + esc(it.label) + "</h2>" + (it.on ? pill("수강생에게 보임", "ok") : pill("꺼짐", "mute")) + btn(icon("pen", "sm") + "내용 수정", "page-edit", "a-btn-primary a-btn-sm", ' data-key="' + it.key + '"') + "</div>" +
          '<p class="a-muted" style="margin:0">' + (pg.body ? esc(pg.body.slice(0, 120)) : "아직 내용이 없어요.") + "</p>" + ((pg.attachments || []).length ? '<p class="a-muted" style="margin:8px 0 0">' + icon("paperclip", "xs") + " 첨부 " + pg.attachments.length + "개</p>" : "") + "</section>";
      }).join("") + "</div>" : '<section class="a-card">' + emptyBox("star", "추가 메뉴가 없어요. ‘메뉴 구성’에서 새 메뉴를 만들 수 있어요.", '<a class="a-btn a-btn-primary" href="#/center/menus">메뉴 구성으로</a>') + "</section>");
  }
  function pageForm(key) {
    const it = customPages(MID()).find((x) => x.key === key);
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
    const newInq = DB.inquiries().filter((x) => (x.status || "new") === "new").length;
    const newBills = DB.bills().filter((b) => DB.billState(b) === "requested");
    return head("마스터 대시보드", "강사 플랫폼을 만들어 분양하고, 전체 운영 현황을 봐요.", dgSplitBtn("home") + btn(icon("plus", "sm") + "새 강사 플랫폼", "ins-add", "a-btn-primary")) +
      (newBills.length ? '<a class="a-inq-alert a-bill-alert" href="#/center/master/billing?tab=todo">' + icon("coins", "sm") + "<b>다음 기수 신청 " + newBills.length + "건</b><span>" + esc(newBills.slice(0, 2).map((b) => insName(b.instructorId) + " " + b.cohortName).join(", ")) + " · 전화 후 입금을 확인해 주세요</span>" + icon("arrowRight", "sm") + "</a>" : "") +
      (newInq ? '<a class="a-inq-alert" href="#/center/master/partners">' + icon("handshake", "sm") + "<b>새 강사 입점 문의 " + newInq + "건</b><span>확인하고 연락해 주세요</span>" + icon("arrowRight", "sm") + "</a>" : "") +
      '<div class="a-kpis">' +
        kpi("강사 플랫폼", ins.length + "개", "운영 중 " + ins.filter((x) => x.status === "active").length + "개", "#/center/master/instructors") +
        kpi("전체 수강생", st.filter((s) => s.status === "approved").length + "명", "수강 중 기준", "#/center/master/students") +
        kpi("진행 중 기수", running + "개", "모든 강사 합계", "#/center/master/instructors") +
        kpi("승인 대기", st.filter((s) => s.status === "pending").length + "명", "강사 승인 전", "#/center/master/students", "warn") +
      "</div>" + '<h2 class="a-sub-h">기수 이용료 · 매출 <a class="a-link" href="#/center/master/billing">자세히 ' + icon("arrowRight", "xs") + "</a></h2>" + (staffCan("master/billing") ? billKpis() : '<p class="a-muted p-small">' + icon("lock", "xs") + " 매출은 정산 권한이 있는 운영자만 볼 수 있어요.</p>") + masterLevels() + insTable();
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
      (list.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>수강생에게 보이는 이름</th><th>강사 로그인</th><th>강의</th><th>기수</th><th>수강생</th><th>이용료 입금</th><th>상태</th><th class="right">관리</th></tr></thead><tbody>' +
        list.map((x) => {
          const c = DB.content(x.id), cos = DB.cohortsOf(x.id), cur = DB.currentCohort(x.id);
          const ss = DB.studentsOf(x.id), paid = DB.bills(x.id).filter((b) => !b.canceledAt && b.paidAt);
          return "<tr><td><b>" + esc(x.displayName) + '</b><small class="a-memo">' + fmtMD(x.createdAt || todayStr()) + " 개설</small></td><td>" + esc(x.name) + ' <span class="a-muted num">/ ' + (staffCan("master/instructors") ? '<button type="button" class="a-pw-peek" data-action="pw-peek" data-pw="' + esc(x.phone4) + '" title="눌러서 보기">••••</button>' : "••••") + "</span></td><td>" + esc(c ? c.brand.courseTitle : "-") + "</td>" +
            "<td>" + cos.length + "개" + (cur ? ' <small class="a-memo">' + esc(cur.name) + " " + DB.STATUS_LABEL[DB.cohortStatus(cur)] + "</small>" : "") + '</td><td class="num">' + ss.filter((s) => s.status === "approved").length + "명" + (ss.filter((s) => s.status === "pending").length ? ' <small class="a-memo">대기 ' + ss.filter((s) => s.status === "pending").length + "</small>" : "") + "</td>" +
            '<td class="num">' + (!staffCan("master/billing") ? '<span class="a-muted">-</span>' : paid.length ? won(sumMoney(paid, "supply")) + ' <small class="a-memo">' + paid.length + "개 기수</small>" : '<span class="a-muted">-</span>') + "</td>" +
            "<td>" + (x.status === "active" ? pill("운영 중", "ok") : pill("중지", "mute")) + '</td><td class="right"><div class="a-row-actions">' +
            btn("강사센터 접속", "ins-enter", "a-btn-primary a-btn-sm", ' data-id="' + x.id + '"') + '<a class="a-btn a-btn-ghost a-btn-sm" href="#/center/master/plan?ins=' + x.id + '">' + icon("layers", "sm") + "기수 · 일정</a>" + '<a class="a-btn a-btn-ghost a-btn-sm" href="#/center/master/menus?ins=' + x.id + '">' + icon("sliders", "sm") + "메뉴·색상</a>" + '<a class="a-btn a-btn-ghost a-btn-sm" href="#/free/' + x.id + '">' + icon("video", "sm") + "무료강의</a>" + '<a class="a-btn a-btn-ghost a-btn-sm" href="#/p/' + x.id + '">' + icon("store", "sm") + "소개</a>" + btn("수정", "ins-edit", "a-btn-ghost a-btn-sm", ' data-id="' + x.id + '"') + "</div></td></tr>";
        }).join("") + "</tbody></table></div>" : emptyBox("store", "강사 플랫폼이 없어요.")) + "</section>";
  }
  function pageMasterInstructors() {
    return head("강사 플랫폼 관리", "새 강사에게 플랫폼을 만들어 주면 문대표 플랫폼 구성(메뉴·커리큘럼·과제·FAQ 등)이 들어간 상태로 시작해요. 강사는 이름 + 전화번호 뒷자리로 강사센터에 로그인해요.", dgSplitBtn((DB.data.instructors.find((i) => i.status === "active") || {}).id ? "room:" + DB.data.instructors.find((i) => i.status === "active").id : "home", "강의실 미리보기") + btn(icon("plus", "sm") + "새 강사 플랫폼", "ins-add", "a-btn-primary")) + insTable();
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
  /** pre: 입점 문의에서 만들 때 미리 채울 값 { inq, name, phone, email, course } */
  function insForm(x, pre) {
    const isNew = !x;
    pre = pre || {};
    x = x || { name: pre.name || "", phone4: String(pre.phone || "").replace(/\D/g, "").slice(-4), displayName: pre.name || "", status: "active" };
    const c = isNew ? null : DB.content(x.id);
    openModal(isNew ? "새 강사 플랫폼 만들기" : x.displayName + " 수정",
      '<form id="ins-form" class="a-form" data-id="' + (isNew ? "" : x.id) + '" data-inq="' + esc(pre.inq || "") + '" data-vod="' + (pre.vod ? "1" : "") + '" novalidate>' + (pre.vod ? '<p class="a-hint">' + icon("monitorPlay", "xs") + " DOOGO CLASS VOD 강사로 등록해요. 기수 이용료는 받지 않고, VOD 판매 정산(강사센터 › DOOGO CLASS › 판매 정산)으로 정산해요. 이용료 칸은 비워 두세요.</p>" : "") +
        '<div class="a-form-row"><div class="a-field"><label for="if-name">강사 이름 <small>(강사센터 로그인)</small></label><input class="a-input" id="if-name" name="name" value="' + esc(x.name) + '"></div>' +
        '<div class="a-field"><label for="if-phone">전화번호 뒷자리 <small>(비밀번호)</small></label><input class="a-input" id="if-phone" name="phone4" inputmode="numeric" maxlength="4" value="' + esc(x.phone4) + '"></div></div>' +
        '<div class="a-field"><label for="if-display">수강생에게 보이는 이름</label><input class="a-input" id="if-display" name="displayName" value="' + esc(x.displayName) + '" placeholder="예: 갓농부"><small class="a-muted">수강생 로그인 화면의 강사 선택 목록에 보여요.</small></div>' +
        (isNew ? '<div class="a-field"><label for="if-course">강의 이름</label><input class="a-input" id="if-course" name="courseTitle" value="' + esc(pre.course && pre.course.length <= 60 ? pre.course : "") + '" placeholder="예: 갓농부와 함께하는 스마트스토어 실전 클래스"></div>' +
          '<div class="a-field"><span class="a-label">처음 내용</span><div class="a-radio-cards">' +
            '<label><input type="radio" name="seed" value="moon" checked><span><b>문대표 플랫폼 그대로 시작 (추천)</b><small>메뉴 구성·5주 커리큘럼·과제·FAQ·서류 가이드·자료실 틀을 복사해요. 강사는 필요 없는 건 지우고 바꾸기만 하면 돼요.</small></span></label>' +
            '<label><input type="radio" name="seed" value="blank"><span><b>간단한 빈 틀</b><small>4주 예시 커리큘럼과 기본 FAQ 3개만 넣어요.</small></span></label></div></div>' +
          '<div class="a-field"><label for="if-start">1기 1주차 시작일</label><input class="a-input" id="if-start" name="startDate" type="date" value="' + addDays(todayStr(), 14) + '"></div>' +
          '<fieldset class="a-fs"><legend>1기 이용료 <small>(선택)</small></legend>' +
            '<div class="a-form-row"><div class="a-field"><label for="if-fee">1인 수강료 (원)</label><input class="a-input" id="if-fee" name="fee" inputmode="numeric" placeholder="예: 2,900,000"></div>' +
            '<div class="a-field"><label for="if-cphone">연락처</label><input class="a-input" id="if-cphone" name="cphone" type="tel" maxlength="20" value="' + esc(pre.phone || "") + '" placeholder="010-0000-0000"></div></div>' +
            '<div class="a-field"><label for="if-email">이메일 <small>(세금계산서 받을 곳)</small></label><input class="a-input" id="if-email" name="email" type="email" maxlength="100" value="' + esc(pre.email || "") + '"></div>' +
            '<div class="a-form-row"><label class="a-check"><input type="checkbox" name="paid"><span>입금 확인됨 (오늘)</span></label><label class="a-check"><input type="checkbox" name="invoiced"><span>세금계산서 발행됨 (오늘)</span></label></div>' +
            '<small class="a-muted">1인 수강료를 적으면 ‘기수 신청 · 매출’에 1기 이용료가 기록돼요. 비워 두면 기록 없이 만들어요.</small></fieldset>' +
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
    if (!id && f.email && f.email.value.trim() && !EMAIL_RE.test(f.email.value.trim())) { err.textContent = "이메일을 확인해 주세요."; return; }
    if (id) { Object.assign(DB.instructor(id), { name, phone4, displayName, status: f.status.value }); commit("강사 정보를 저장했어요."); return; }
    const nid = DB.uid("i");
    DB.data.instructors.push({ id: nid, name, phone4, displayName, status: "active", createdAt: todayStr() });
    const th = (f.querySelector("input[name=itheme]:checked") || {}).value || "lime";
    const brand = { name: displayName, instructor: displayName, courseTitle: f.courseTitle.value.trim() || displayName + " 실전 클래스", theme: th };
    const fromMoon = (f.querySelector("input[name=seed]:checked") || {}).value !== "blank";
    DB.data.content[nid] = fromMoon ? DB.templateFromMoon(brand) : DB.normalizeContent(DB.template(brand));
    if (fromMoon) DB.instructor(nid).menu = DB.moonMenu();
    DB.data.content[nid].brand.themeSet = true;
    const co1 = { id: DB.uid("c"), instructorId: nid, name: "1기", startDate: f.startDate.value || addDays(todayStr(), 14), recruiting: true };
    DB.data.cohorts.push(co1);
    // 1기 이용료 기록 (입점 = 1기 이용료)
    const fee = f.dataset.vod === "1" ? 0 : parseWon(f.fee.value);
    if (f.dataset.vod === "1") DB.instructor(nid).vodCreator = true;
    if (fee) {
      const b = { id: DB.uid("b"), instructorId: nid, kind: "new", cohortName: "1기", startDate: co1.startDate, fee, contactName: name, phone: f.cphone.value.trim(), email: f.email.value.trim(), requestedAt: Date.now(), by: "master", cohortId: co1.id, openedAt: todayStr(), vat: DB.billingInfo().vat };
      if (f.paid.checked) b.paidAt = todayStr();
      if (f.invoiced.checked) b.invoiceAt = todayStr();
      DB.saveBill(b);
    }
    // 입점 문의에서 만들었으면 그 문의는 ‘계약 성사 · 플랫폼 오픈’으로 + 소개 파트너의 ‘내 강사’에 자동 연결
    const inq = f.dataset.inq && findInq(f.dataset.inq);
    if (inq) {
      setInqStatus(inq, "done"); inq.iid = nid; inq.openedAt = Date.now();
      const pa = inqAff(inq);
      if (pa && !affList().some((p) => (p.instructors || []).some((l) => l.iid === nid))) { (pa.instructors = pa.instructors || []).push({ iid: nid, rs: null, since: todayStr(), fromInq: inq.id }); }
      DB.saveInquiry(inq);
    }
    commit(displayName + " 플랫폼을 만들었어요. 강사 로그인: " + name + " / " + phone4 + (fee ? " · 1기 이용료 기록" : ""));
  }

  /* ================= DOOGO CLASS · VOD 판매 (마스터 4개 메뉴 + 강사 ‘내 VOD 판매’) =================
   * 스토어 화면 · 데이터는 vod.js (window.VOD). 여기서는 마스터가 클래스를 처음부터 끝까지 세팅하고(기본 정보 → 가격 → 썸네일 → 소개 → 커리큘럼 → FAQ)
   * 주문 · 입금 · 환불 · 강사 정산 · 회원 · 후기 · 배너 · 카테고리를 관리한다. 강사는 내 클래스의 판매 · 정산만 본다(읽기 전용). 지금은 이 브라우저 저장(시안) */
  const VX = () => window.VOD;
  const VD = () => { const v = VX().V(); if (!Array.isArray(v.payouts)) v.payouts = []; return v; };
  const vdP = (id) => VX().product(id);
  const vdYM = (ms) => DB.date.toStr(new Date(ms)).slice(0, 7);
  const vdYMtxt = (ym) => ym.slice(0, 4) + "년 " + Number(ym.slice(5, 7)) + "월";
  const vdYMadd = (ym, n) => { const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
  const VD_ST = { on: ["판매 중", "ok"], soon: ["오픈 예정", "info"], hidden: ["숨김", "mute"] };
  const VD_OST = { paid: ["결제 완료", "ok"], pending: ["입금 대기", "warn"], refunded: ["환불", "mute"], canceled: ["주문 취소", "mute"] };
  const VD_PAY = { card: "카드", kakao: "카카오페이", toss: "토스페이", naver: "네이버페이", transfer: "계좌이체", vbank: "가상계좌", bank: "무통장", free: "무료", point: "쿠폰 · 포인트" };
  // 강사 · 코치 화면은 회원 문서를 받지 않아요(서버가 주문의 이름만 가려서 보냄) → 주문의 주문자 이름으로 보여요
  const vdMember = (id) => VD().members.find((m) => m.id === id) || vdBuyer(id);
  const vdBuyer = (id) => { const o = id && VD().orders.find((x) => x.mid === id && x.buyer && x.buyer.name); return o ? { id, name: o.buyer.name, phone: o.buyer.phone || "", email: "", masked: true } : null; };
  const vdMask = (n) => { const s = String(n || ""); return s ? s.slice(0, 1) + "O".repeat(Math.max(1, s.length - 1)) : "-"; };
  // 주문 정산 비율 (주문 종류별: 수강권 · 전자책 · LIVE · 코칭권 · TEA TIME — 결제한 때의 강사 비율)
  const vdShare = (o) => VX().shareVal(o);
  // 부분 환불된 주문은 남은 금액 비율만큼 매출 · 강사 정산에 남겨요
  const vdKeep = (o) => (o.status === "refunded" ? Math.max(0, 1 - (o.amount > 0 && o.refundAmount != null ? o.refundAmount / o.amount : 1)) : o.status === "paid" ? 1 : 0);
  const vdLive = (o) => !!o.paidAt && vdKeep(o) > 0;
  const vdInsAmt = (o) => (o.status === "refunded" ? Math.floor(VX().insAmt(o) * vdKeep(o) / 10) * 10 : VX().insAmt(o));
  const vdIidOf = (o) => (vdP(o.pid) || {}).iid || "";
  const vdPaidIn = (ym, pred) => VD().orders.filter((o) => vdLive(o) && vdYM(o.paidAt) === ym && (!pred || pred(o)));
  const vdSum = (list, f) => list.reduce((a, o) => a + (f ? f(o) : Math.round(o.amount * vdKeep(o))), 0);
  const vdPending = () => VD().orders.filter((o) => o.status === "pending" && o.method !== "vbank").length;
  // 환불 요청: 회원이 마이페이지에서 요청(refundReq 객체) · 강사가 TEA TIME 취소(숫자) → 마스터가 처리할 때까지 남아요
  const vdRefReqs = () => VD().orders.filter((o) => o.status === "paid" && o.refundReq && !o.ship); // 종이책 취소 · 반품 · 교환은 ‘종이책 주문 · 배송’에서
  // 무통장 · 계좌로 돌려줘야 하는 환불 (마스터가 송금하고 ‘송금 완료’를 눌러야 끝나요)
  const vdRefWait = () => VD().orders.filter((o) => o.status === "refunded" && o.refundPay && o.refundPay.st === "wait");
  const vdSettleTodo = () => { try { return vdStmtKeys(vdYMadd(todayStr().slice(0, 7), -1)).filter((st) => ["ready", "confirmed", "invreq", "invoiced"].indexOf(vdStState(st).k) >= 0).length; } catch (e) { return 0; } };
  const vdDue = (o) => o.dueAt || o.at + (Number(VD().settings.payDays) || 3) * 864e5;
  const vdExpired = () => VD().orders.filter((o) => o.status === "pending" && Date.now() > vdDue(o));
  /* 무통장 입금 — 정식 서버에서는 입금 확인 · 취소를 서버가 해요 (확인하는 순간 회원 수강이 열려요) */
  const vdSrv = () => !!(DB.remote && DB.remote.on);
  const vdDep = (o) => o.depositor || (o.buyer && o.buyer.name) || (vdMember(o.mid) || {}).name || "";
  const vdGrpAmt = (o) => o.amount + VD().orders.filter((x) => x.grp === o.no && x.status === o.status).reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const vdWhen = (t) => { const d = new Date(t); return DB.date.toStr(d).slice(5).replace("-", ".") + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  function vdBankAct(action, nos, okMsg) {
    const list = [].concat(nos); let ok = 0, fail = "";
    return list.reduce((pr, no) => pr.then(() => VX().payApi(action, { no }).then((r) => { if (r && r.ok) ok++; else fail = (r && r.message) || "처리하지 못했어요."; }, () => { fail = "서버에 닿지 못했어요."; })), Promise.resolve())
      .then(() => DB.remote.refresh()).then(() => { ui.vdBankLog = undefined; closeModal(); render(); if (ok) { actLog(okMsg); toast(okMsg + (fail ? " · " + (list.length - ok) + "건은 못 했어요: " + fail : "")); } else toast(fail || "처리하지 못했어요.", "warn"); });
  }
  function vdBankLoad() {
    if (!vdSrv() || ui.vdBankLog !== undefined || ui.vdBankBusy) return;
    ui.vdBankBusy = true;
    VX().payApi("bankLog").then((r) => { ui.vdBankBusy = false; ui.vdBankLog = r && r.ok ? r.recent || [] : []; render(); }, () => { ui.vdBankBusy = false; ui.vdBankLog = []; });
  }
  /** 무통장 입금 확인 카드: 입금 대기 주문(입금자명 · 합계 금액 · 기한) + 자동 입금 확인이 못 맞춘 입금 */
  function vdBankCard() {
    const v = VD(), pend = v.orders.filter((o) => o.status === "pending" && !o.grp && o.method !== "vbank").sort((a, b) => a.at - b.at), auto = !!(VX().bankAuto && VX().bankAuto());
    vdBankLoad();
    const log = ui.vdBankLog || [], miss = log.filter((e) => e.st === "none" || e.st === "many" || e.st === "fail"), okN = log.filter((e) => e.st === "ok").length;
    const WHY = { none: "같은 이름 · 금액 주문 없음", many: "같은 이름 · 금액 주문이 여럿", fail: "확인 실패" };
    return '<section class="a-card vda-bank"><div class="a-card-head"><h2>무통장 입금 확인</h2>' + (vdSrv() ? (auto ? pill("자동 입금 확인 켜짐 · 24시간", "ok") : pill("자동 입금 확인 연결 전 · 직접 확인", "mute")) : "") +
        '<span class="a-muted">입금자명 · 금액을 통장과 맞춰 보고 ‘입금 확인’을 눌러 주세요. 누르는 순간 회원이 바로 수강해요.' + (auto && okN ? " 최근 자동 확인 " + okN + "건" : "") + "</span></div>" +
      (pend.length ? '<div class="a-table-wrap"><table class="a-table vda-bank-t"><thead><tr><th>주문</th><th>입금자명</th><th class="right">입금할 금액</th><th>클래스</th><th>입금 기한</th><th class="right">관리</th></tr></thead><tbody>' +
        pend.map((o) => { const late = Date.now() > vdDue(o); return '<tr><td class="vda-nw">' + esc(vdWhen(o.at)) + '<small class="a-memo num">' + esc(o.no) + '</small></td><td class="vda-nw"><b>' + esc(vdDep(o)) + "</b>" + ((vdMember(o.mid) || {}).name && (vdMember(o.mid) || {}).name !== vdDep(o) ? '<small class="a-memo">회원 ' + esc(vdMember(o.mid).name) + "</small>" : "") + '</td><td class="right num"><b>' + won(vdGrpAmt(o)) + "</b></td><td>" + esc(o.title) + (VX().optTxt(o) ? '<small class="a-memo">' + esc(VX().optTxt(o)) + "</small>" : "") + '</td><td class="vda-nw">' + (late ? pill("기한 지남", "warn") : esc(vdWhen(vdDue(o)) + "까지")) + '</td><td class="right vda-nw">' + btn(icon("check", "sm") + "입금 확인", "vda-paid", "a-btn-primary a-btn-sm", ' data-id="' + esc(o.id) + '"') + btn("취소", "vda-cancel", "a-btn-ghost a-btn-sm", ' data-id="' + esc(o.id) + '"') + "</td></tr>"; }).join("") + "</tbody></table></div>"
        : '<p class="a-muted vda-bank-empty">' + icon("check", "sm") + " 입금을 기다리는 주문이 없어요.</p>") +
      (miss.length ? '<h3 class="vda-bank-h">자동으로 못 맞춘 입금 <small>입금자명이 다르거나 금액이 다를 때 여기 남아요 · 맞는 주문을 골라 연결하면 바로 수강이 열려요</small></h3><div class="a-table-wrap"><table class="a-table"><thead><tr><th>입금 시각</th><th>입금자명</th><th class="right">금액</th><th>사유</th><th>주문 연결</th></tr></thead><tbody>' +
        miss.map((e) => '<tr><td class="vda-nw">' + esc(vdWhen(e.at)) + "</td><td><b>" + esc(e.name) + "</b>" + (e.bank ? '<small class="a-memo">' + esc(e.bank) + "</small>" : "") + '</td><td class="right num">' + won(e.amount) + "</td><td>" + pill(WHY[e.st] || e.st, "warn") + '</td><td class="vda-nw"><select class="a-input a-sm" data-blink="' + esc(e.id) + '"><option value="">주문 고르기</option>' + pend.map((o) => '<option value="' + esc(o.no) + '"' + (vdGrpAmt(o) === e.amount ? "" : "") + ">" + esc(vdDep(o) + " · " + won(vdGrpAmt(o)) + " · " + o.no) + "</option>").join("") + "</select> " + btn("연결 · 입금 확인", "vda-blink", "a-btn-ghost a-btn-sm", ' data-id="' + esc(e.id) + '"') + "</td></tr>").join("") + "</tbody></table></div>" : "") +
      "</section>";
  }
  const vdRqTxt = (o) => (o.refundReq && typeof o.refundReq === "object" ? "회원 환불 요청 · " + o.refundReq.why + (o.refundReq.text ? " · " + o.refundReq.text : "") : "강사 취소 · 환불 필요");
  const vdThumb = (p, cls) => '<span class="vda-th ' + (cls || "") + '">' + VX().thumbArt(p) + "</span>";
  const vdInsOpts = (sel) => '<option value="">외부 크리에이터 (강사 플랫폼 없음)</option>' + DB.data.instructors.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === sel ? " selected" : "") + ">" + esc(x.displayName) + " (" + esc(x.name) + ")</option>").join("");
  const vdStoreBtn = (href, label) => '<button type="button" class="a-btn a-btn-ghost" data-action="store-split" data-href="' + esc(href || "#/vod") + '">' + icon("layers", "sm") + (label || "스토어 미리보기") + "</button>";

  /* ---------- 1) VOD 매출 · 주문 · 강사 정산 ---------- */
  function pageMasterVod() {
    const qs = ROUTE.hash.split("?")[1] || "", qt = qs.match(/(?:^|&)tab=(\w+)/), qo = qs.match(/(?:^|&)of=(\w+)/); if (qt || qo) { if (qt) ui.vdTab = qt[1]; if (qo) { ui.vdTab = "orders"; ui.vdOf = qo[1]; } ROUTE.replace("#/center/master/vod"); }
    const moved = { months: "vod-sales", settle: "vod-settle", rates: "vod-rates" }[ui.vdTab];
    if (moved) { ui.vdTab = "orders"; ROUTE.replace("#/center/master/" + moved); return MPAGES[moved](); }
    const v = VD(), tab = ui.vdTab || "orders", ym = todayStr().slice(0, 7);
    const mon = vdPaidIn(ym), all = v.orders.filter(vdLive), pend = vdPending();
    const newM = v.members.filter((m) => vdYM(m.createdAt) === ym).length;
    const careN = vdCare().co.length + vdCare().tea.length;
    const tabs = [["orders", "주문", v.orders.length], ["care", "코칭 · TEA TIME", careN || null]];
    const body = tab === "care" ? vdCarePage() : vdBankCard() + vdOrders();
    return head("주문 · 결제", "DOOGO CLASS 주문의 결제 수단 · 결제 상태 · 무통장 입금 확인 · 환불을 관리해요. 주문번호를 누르면 결제 상세(영수증 · PG 거래 번호)가 보여요.", vdStoreBtn() + btn(icon("download", "sm") + "주문 CSV", "vda-csv", "a-btn-ghost")) +
      '<div class="a-kpis">' +
        kpi("이번 달 매출", won(vdSum(mon)), mon.length + "건 결제 · 매출 리포트 보기", "#/center/master/vod-sales", "ok") +
        kpi("누적 매출", won(vdSum(all)), "결제 완료 " + all.length + "건", "#/center/master/vod") +
        kpi("입금 대기", pend + "건", pend ? "무통장 입금을 확인해 주세요" : "모두 처리했어요", "#/center/master/vod", pend ? "warn" : "") +
        kpi("VOD 회원", v.members.length + "명", "이번 달 가입 " + newM + "명", "#/center/master/vod-crm") +
      "</div>" +
      '<div class="a-tabs a-btabs">' + tabs.map((t) => '<button type="button" class="a-tab' + (tab === t[0] ? " on" : "") + '" data-action="vda-tab" data-k="' + t[0] + '">' + t[1] + (t[2] != null ? ' <span class="num">' + t[2] + "</span>" : "") + "</button>").join("") + "</div>" + body;
  }
  // 코칭 · TEA TIME 현황: 강사가 답해야 할 VOD 코칭 질문 · 확정할 TEA TIME 을 마스터가 한눈에 (답은 강사센터에서)
  function vdCare() {
    const co = []; DB.data.instructors.forEach((ins) => { (DB.requests(ins.id) || []).forEach((x) => { if (DB.isVodStudent(x.s) && !x.q.answer) co.push({ ins, x }); }); });
    const tea = (VX().teasOf(null, null) || []).filter((o) => o.status === "paid" && o.tea && o.tea.st === "req");
    return { co: co.sort((a, b) => a.x.q.at - b.x.q.at), tea };
  }
  function vdCarePage() {
    const c = vdCare(), hrs = (at) => Math.floor((Date.now() - at) / 36e5);
    return '<section class="a-card"><div class="a-card-head"><h2>답변 대기 1:1 코칭 질문</h2><span class="a-muted">48시간이 넘으면 강사님께 알려 주세요 · 답변은 강사센터에서</span></div>' +
        (c.co.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>남긴 때</th><th>강사</th><th>수강생</th><th>질문</th><th>기다린 시간</th></tr></thead><tbody>' + c.co.map((r) => "<tr><td>" + esc(DB.date.toStr(new Date(r.x.q.at))) + "</td><td>" + esc(r.ins.displayName) + "</td><td>" + esc(vdMask(r.x.s.name)) + "</td><td>" + esc(r.x.q.title) + "</td><td>" + (hrs(r.x.q.at) >= 48 ? pill(hrs(r.x.q.at) + "시간", "warn") : pill(hrs(r.x.q.at) + "시간", "mute")) + "</td></tr>").join("") + "</tbody></table></div>" : emptyBox("message", "답변을 기다리는 코칭 질문이 없어요.")) + "</section>" +
      '<section class="a-card"><div class="a-card-head"><h2>TEA TIME 일정 확정 대기</h2><span class="a-muted">강사님이 희망 날짜를 보고 확정해요</span></div>' +
        (c.tea.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>신청일</th><th>클래스</th><th>회원</th><th>희망 날짜</th><th>방식</th></tr></thead><tbody>' + c.tea.map((o) => "<tr><td>" + esc(DB.date.toStr(new Date(o.at))) + "</td><td>" + esc(o.title) + "</td><td>" + esc(((vdMember(o.mid) || {}).name) || "-") + "</td><td>" + esc([o.tea.d1, o.tea.d2].filter(Boolean).join(" · ")) + " " + esc(o.tea.slot || "") + "</td><td>" + esc(VX().TEA_MODE[o.tea.mode] || o.tea.mode || "") + "</td></tr>").join("") + "</tbody></table></div>" : emptyBox("calendar", "확정을 기다리는 TEA TIME이 없어요.")) + "</section>";
  }
  function vdOrders() {
    const v = VD(), f = ui.vdOf || "all", q = (ui.vdOq || "").trim().toLowerCase(), om = ui.vdOm || "";
    const isF = (o, k) => k === "all" || (k === "refreq" ? o.status === "paid" && !!o.refundReq : o.status === k), cnt = (k) => v.orders.filter((o) => isF(o, k)).length, ex = vdExpired();
    const pms = VD_PAY_KEYS.filter((x) => v.orders.some((o) => vdPayKey(o) === x[0]));
    const list = v.orders.filter((o) => isF(o, f) && (!om || vdPayKey(o) === om) && (!q || (o.no + " " + o.title + " " + ((vdMember(o.mid) || {}).name || "") + " " + ((vdMember(o.mid) || {}).email || "")).toLowerCase().indexOf(q) >= 0)).sort((a, b) => b.at - a.at);
    return '<section class="a-card"><div class="a-toolbar"><div class="a-tabs">' + [["all", "전체"], ["pending", "입금 대기"], ["paid", "결제 완료"], ["refreq", "환불 요청"], ["refunded", "환불"], ["canceled", "취소"]].map((t) => '<button type="button" class="a-tab' + (f === t[0] ? " on" : "") + (t[0] === "refreq" && cnt("refreq") ? " a-tab-warn" : "") + '" data-action="vda-of" data-k="' + t[0] + '">' + t[1] + ' <span class="num">' + cnt(t[0]) + "</span></button>").join("") + "</div>" +
        (ex.length ? btn(icon("x", "sm") + "입금 기한 지난 주문 " + ex.length + "건 한 번에 취소", "vda-cancel-exp", "a-btn-ghost a-btn-sm") : "") +
        '<div class="a-filters"><select class="a-input a-sm" id="vda-om" aria-label="결제수단"><option value="">모든 결제수단</option>' + pms.map((x) => '<option value="' + x[0] + '"' + (om === x[0] ? " selected" : "") + ">" + esc(x[1]) + "</option>").join("") + "</select>" +
          '<div class="a-search">' + icon("search", "sm") + '<input class="a-input a-sm" id="vda-oq" type="search" placeholder="주문번호 · 회원 · 클래스" value="' + esc(ui.vdOq || "") + '"></div></div></div>' +
      (list.length ? '<div class="a-table-wrap"><table class="a-table vda-table"><thead><tr><th>주문일</th><th>주문번호</th><th>회원</th><th>클래스</th><th>결제</th><th class="right">금액</th><th>상태</th><th class="right">관리</th></tr></thead><tbody>' +
        list.map((o) => { const m = vdMember(o.mid) || {}, st = VD_OST[o.status] || VD_OST.paid; return '<tr><td class="vda-nw">' + esc(DB.date.fmtStamp ? DB.date.fmtStamp(o.at) : new Date(o.at).toLocaleString("ko-KR")) + '</td><td class="vda-nw"><button type="button" class="vda-ono num" data-action="vda-od" data-id="' + esc(o.id) + '" title="결제 상세">' + esc(o.no) + '</button></td><td class="vda-nw"><b>' + esc(m.name || "탈퇴 회원") + '</b><small class="a-memo">' + esc(m.email || "") + "</small></td><td>" + esc(o.title) + (VX().optTxt(o) ? '<small class="a-memo">' + esc(VX().optTxt(o)) + (o.grp ? " · " + esc(o.grp) + " 함께 결제" : "") + "</small>" : "") + (o.refundReq && o.status === "paid" ? '<small class="a-memo a-memo-red">' + esc(vdRqTxt(o)) + "</small>" : "") + (o.canceledBy === "member" && o.status === "canceled" ? '<small class="a-memo">회원이 직접 취소</small>' : "") + '</td><td class="vda-nw">' + esc(VD_PAY[o.method] || o.method) + (o.refundPay && o.refundPay.st === "wait" ? '<small class="a-memo a-memo-red">환불 송금 대기</small>' : "") + '</td><td class="right num"><b>' + won(o.amount) + "</b>" + (o.couponOff || o.pointOff ? '<small class="a-memo">' + (o.couponOff ? "쿠폰 -" + won(o.couponOff) : "") + (o.couponOff && o.pointOff ? " · " : "") + (o.pointOff ? "포인트 -" + won(o.pointOff) : "") + "</small>" : "") + "</td><td>" + pill(st[0], st[1]) + (o.refundedAt ? '<small class="a-memo">' + esc(DB.date.toStr(new Date(o.refundedAt))) + "</small>" : "") + '</td><td class="right">' +
          (o.status === "pending" && Date.now() > vdDue(o) ? pill("입금 기한 지남", "warn") + " " : "") + (o.status === "pending" && o.method === "vbank" ? pill("가상계좌 입금 대기", "info") + btn("주문 취소", "vda-cancel", "a-btn-ghost a-btn-sm", ' data-id="' + esc(o.id) + '"') : o.status === "pending" ? btn("입금 확인", "vda-paid", "a-btn-primary a-btn-sm", ' data-id="' + esc(o.id) + '"') + btn("주문 취소", "vda-cancel", "a-btn-ghost a-btn-sm", ' data-id="' + esc(o.id) + '"') : o.status === "paid" && o.amount > 0 ? btn(o.refundReq ? "환불 처리" : "환불", "vda-refund", o.refundReq ? "a-btn-primary a-btn-sm" : "a-btn-ghost a-btn-sm", ' data-id="' + esc(o.id) + '"') : o.status === "paid" ? btn("신청 취소", "vda-cancel0", "a-btn-ghost a-btn-sm", ' data-id="' + esc(o.id) + '"') : "") + "</td></tr>"; }).join("") +
        "</tbody></table></div>" : emptyBox("inbox", "조건에 맞는 주문이 없어요.")) + "</section>";
  }
  // 포트원(PG)으로 결제한 주문 (카드 · 간편결제 · 계좌이체 · 가상계좌)
  const VD_PG = ["card", "kakao", "naver", "toss", "transfer", "vbank"];
  const vdIsPg = (o) => VD_PG.indexOf(o.method) >= 0 && !(o.pg && o.pg.st === "mock");
  const vdPgReal = (o) => !!(VX().payServer && VX().payServer() && vdIsPg(o) && (o.paymentId || (o.pg || {}).paymentId));
  const vdAcctTxt = (a) => (a ? [VX().bankName(a.bank), a.number, a.holder].filter(Boolean).join(" ") : "");
  /** 주문 · 결제 상세 (주문번호를 누르면) */
  function vdOrderModal(o) {
    const X = VX(), m = vdMember(o.mid) || {}, p = vdP(o.pid) || {}, st = VD_OST[o.status] || VD_OST.paid, pg = o.pg || {}, pid = vdIsPg(o) ? o.paymentId || pg.paymentId || "" : "";
    const row = (k, v) => (v === "" || v == null ? "" : "<tr><th>" + k + "</th><td>" + v + "</td></tr>");
    const t = (ms) => (ms ? esc(DB.date.fmtStamp ? DB.date.fmtStamp(ms) : new Date(ms).toLocaleString("ko-KR")) : "");
    const grp = VD().orders.filter((x) => x.no !== o.no && ((x.grp && x.grp === o.no) || (o.grp && (x.no === o.grp || x.grp === o.grp))));
    const vb = o.vbank || null, rp = o.refundPay || null, sh = o.status === "paid" || o.status === "refunded" ? vdShare(o) : null;
    const body = '<div class="od-head">' + pill(st[0], st[1]) + '<b class="num">' + won(o.amount) + "</b><span>" + esc(VD_PAY[o.method] || o.method) + "</span></div>" +
      '<div class="od-grid"><section><h4>주문</h4><table class="od-t">' + row("주문번호", '<span class="num">' + esc(o.no) + "</span>") + row("주문 일시", t(o.at)) + row("회원", esc(m.name || "탈퇴 회원") + (m.email ? "<br><small>" + esc(m.email) + "</small>" : "") + (m.phone ? "<br><small>" + esc(m.phone) + "</small>" : "")) +
          (o.buyer && o.buyer.name && o.buyer.name !== m.name ? row("주문자", esc(o.buyer.name) + (o.buyer.phone ? " · " + esc(o.buyer.phone) : "")) : "") + row("상품", esc(o.title) + (X.optTxt(o) ? "<br><small>" + esc(X.optTxt(o)) + "</small>" : "")) + row("강사", esc(p.creator || insName(p.iid) || "")) + row("유입", esc(X.CH_TXT[X.isAccess(o) ? o.ch || "web" : "addon"] || "")) +
          (grp.length ? row("함께 결제", grp.map((x) => '<span class="num">' + esc(x.no) + "</span> " + esc(X.optTxt(x) || x.title) + " " + won(x.amount)).join("<br>")) : "") + "</table></section>" +
        '<section><h4>금액</h4><table class="od-t">' + (o.list ? row("정가", won(o.list)) : "") + row("판매가", won(X.baseOf(o))) + (o.couponOff ? row("쿠폰", "- " + won(o.couponOff) + (o.couponName ? "<br><small>" + esc(o.couponName) + "</small>" : "")) : "") + (o.pointOff ? row("포인트", "- " + won(o.pointOff)) : "") + row("결제 금액", "<b>" + won(o.amount) + "</b>") +
          (sh != null ? row("정산", sh + "% · 강사 몫 " + won(vdInsAmt(o))) : "") + (o.amount > 0 && (o.status === "paid" || o.status === "refunded") ? row("PG 수수료 (추정)", won(vdFee(o))) : "") + "</table></section>" +
        (o.ship ? '<section><h4>종이책 배송</h4><table class="od-t">' + row("배송 상태", pill((X.SHIP_ST[X.shipStOf(o)] || X.SHIP_ST.ready)[0], vsTone(X.shipStOf(o)))) + row("수량", (Number(o.qty) || 1) + "권") + row("배송비", o.shipFee ? won(o.shipFee) : "무료") + row("받는 분", esc(o.ship.name || "") + " · " + esc(o.ship.phone || "")) + row("주소", (o.ship.zip ? "(" + esc(o.ship.zip) + ") " : "") + esc((o.ship.addr1 || "") + " " + (o.ship.addr2 || ""))) + row("요청사항", esc(o.ship.memo || "")) + row("송장", o.ship.inv ? esc(o.ship.carrier || "") + ' <span class="num">' + esc(o.ship.inv) + "</span>" + (X.trackUrl(o) ? ' <a class="a-link" href="' + esc(X.trackUrl(o)) + '" target="_blank" rel="noopener">배송 조회</a>' : "") : "") + row("보낸 날", t(o.ship.shipAt)) + row("배송 완료", t(X.shipDoneAt(o)) + (X.shipStOf(o) === "done" && !o.ship.doneAt ? " (자동)" : "")) + (X.claimOf(o) ? row("취소 · 반품 · 교환", pill(X.claimTxt(X.claimOf(o)), X.claimOf(o).st === "req" ? "bad" : "mute") + " " + esc(X.claimOf(o).why || "") + (X.claimOf(o).note ? "<br><small>반려 · " + esc(X.claimOf(o).note) + "</small>" : "")) : "") + (boCash(o) ? row("현금영수증", esc(boCash(o))) : "") + "</table></section>" : "") +
        '<section><h4>결제</h4><table class="od-t">' + row("결제수단", esc(VD_PAY[o.method] || o.method)) + row("결제 일시", t(o.paidAt)) + (pid ? row("포트원 결제 ID", '<span class="num od-id">' + esc(pid) + "</span>") : "") + (pg.txId ? row("거래 ID", '<span class="num od-id">' + esc(pg.txId) + "</span>") : "") +
          (pg.receiptUrl ? row("영수증", '<a class="a-link" href="' + esc(pg.receiptUrl) + '" target="_blank" rel="noopener">영수증 열기</a>') : "") +
          (o.method === "bank" ? row("입금자명", esc(vdDep(o))) + (o.bankTo ? row("입금 계좌", esc([o.bankTo.bank, o.bankTo.account, o.bankTo.holder].filter(Boolean).join(" "))) : "") + (o.status === "pending" ? row("입금 기한", t(vdDue(o))) : "") + (o.depositBy ? row("입금 확인", esc(o.depositBy)) : "") : "") +
          (vb ? row("가상계좌", esc([X.bankName(vb.bank), vb.account, vb.holder].filter(Boolean).join(" "))) + (o.status === "pending" ? row("입금 기한", t(vb.dueAt || vdDue(o))) : "") : "") +
          (o.status === "canceled" ? row("주문 취소", t(o.canceledAt) + (o.canceledBy || o.cancelBy ? " · " + esc(o.canceledBy || o.cancelBy) : "")) : "") + "</table></section>" +
        (o.status === "refunded" ? '<section><h4>환불</h4><table class="od-t">' + row("환불 일시", t(o.refundedAt)) + row("환불 금액", "<b>" + won(vdRefAmt(o)) + "</b>" + (vdRefAmt(o) < o.amount ? " (부분 환불)" : "")) + row("사유", esc([o.refundWhy, o.refundMemo].filter(Boolean).join(" · "))) + row("처리", esc(o.refundBy || "")) +
          (pg.cancel && pg.cancel.id ? row("포트원 취소 ID", '<span class="num od-id">' + esc(pg.cancel.id) + "</span>") : "") + (rp ? row("계좌 환불", esc(vdAcctTxt(rp)) + (rp.amount ? " · " + won(rp.amount) : "") + "<br>" + (rp.st === "done" ? "송금 완료 · " + t(rp.doneAt) : "<b>송금 대기</b>")) : "") + "</table></section>" : "") +
        (o.refundReq && o.status === "paid" ? '<section><h4>환불 요청</h4><table class="od-t">' + row("요청", esc(vdRqTxt(o))) + (o.refundReq.acct ? row("환불 받을 계좌", esc(vdAcctTxt(o.refundReq.acct))) : "") + "</table></section>" : "") +
      '</div><div id="od-pg" class="od-pg"></div>';
    openModal("주문 " + o.no, body,
      (vdPgReal(o) ? btn(icon("refresh", "sm") + "포트원 결제 조회", "vda-pginfo", "a-btn-ghost", ' data-id="' + esc(o.id) + '"') : "") + '<span class="a-spacer"></span>' +
      (o.status === "pending" && o.method !== "vbank" ? btn("입금 확인", "vda-paid", "a-btn-primary", ' data-id="' + esc(o.id) + '"') : "") +
      (o.status === "paid" && o.amount > 0 ? btn(o.refundReq ? "환불 처리" : "환불", "vda-refund", o.refundReq ? "a-btn-primary" : "a-btn-ghost", ' data-id="' + esc(o.id) + '"') : "") +
      (rp && rp.st === "wait" ? btn("송금 완료", "vda-rfsent", "a-btn-primary", ' data-id="' + esc(o.id) + '"') : "") + btn("닫기", "modal-close"), "lg");
  }
  const PG_ST = { PAID: ["결제 완료", "ok"], VIRTUAL_ACCOUNT_ISSUED: ["가상계좌 발급 · 입금 대기", "info"], CANCELLED: ["전액 취소", "mute"], PARTIAL_CANCELLED: ["부분 취소", "warn"], FAILED: ["결제 실패", "bad"], READY: ["결제 전", "mute"], PAY_PENDING: ["결제 확인 중", "info"] };
  /** 포트원 결제 조회 결과 (서버가 포트원에 다시 물어본 값) */
  function vdPgInfoHtml(pay) {
    const st = PG_ST[pay.status] || [pay.status, "mute"], a = pay.amount || {}, m = pay.method || {};
    const mt = m.type === "card" ? "카드 " + [m.name, m.number, m.approval ? "승인 " + m.approval : "", m.months > 1 ? m.months + "개월 할부" : "일시불"].filter(Boolean).join(" · ") : m.type === "easy" ? "간편결제 " + [m.provider, m.sub].filter(Boolean).join(" · ") : m.type === "transfer" ? "계좌이체 " + (m.bank ? VX().bankName(m.bank) : "") : m.type === "vbank" ? "가상계좌 " + [VX().bankName(m.bank), m.account, m.holder].filter(Boolean).join(" ") : "";
    return '<h4>포트원 결제 상태 ' + pill(st[0], st[1]) + '</h4><table class="od-t">' + (mt ? "<tr><th>결제수단</th><td>" + esc(mt) + "</td></tr>" : "") +
      "<tr><th>결제 금액</th><td>" + won(a.total || 0) + (a.cancelled ? " · 취소 " + won(a.cancelled) + " · 남은 금액 " + won((a.total || 0) - a.cancelled) : "") + "</td></tr>" +
      (pay.receiptUrl ? '<tr><th>영수증</th><td><a class="a-link" href="' + esc(pay.receiptUrl) + '" target="_blank" rel="noopener">영수증 열기</a></td></tr>' : "") +
      ((pay.cancellations || []).length ? "<tr><th>취소 내역</th><td>" + pay.cancellations.map((c) => won(c.amount) + " · " + esc(c.reason || "") + (c.at ? " · " + esc(String(c.at).slice(0, 10)) : "")).join("<br>") + "</td></tr>" : "") + "</table>";
  }
  /* ---------- 강사 VOD 정산: 월 명세 → 정산 확정 → (사업자) 세금계산서 → 지급 ----------
   * 정산액 = 할인 전 판매가 ÷ 1.1(공급가액) × 정산 비율(유입 경로 · 상품별). 플랫폼 쿠폰 · 포인트 · 결제 수수료는 플랫폼 부담.
   * 확정하면 그 달 숫자를 고정(snap)하고, 확정 뒤 환불은 환불한 달 명세에서 차감해요. 개인 3.3% 원천징수 · 사업자 부가세 10% + 세금계산서 */
  const vdKey = (o) => vdIidOf(o) || "ext:" + ((vdP(o.pid) || {}).creator || "-");
  const vdPayout = (key, ym) => VD().payouts.find((x) => x.key === key && x.ym === ym) || null;
  const vdPayDate = (ym) => bizDay(vdYMadd(ym, 1) + "-10");
  const vdProf = (key) => { const ins = /^ext:/.test(key) ? null : DB.instructor(key); return (ins && ins.vodSettle) || {}; };
  const vdKeyName = (key) => (/^ext:/.test(key) ? key.slice(4) : insName(key));
  /* 광고비 · 환불 차감이 그 달 정산액보다 크면 남은 금액은 다음 달 정산에서 이어서 빼요 (이월) */
  function vdCarry(key, ym) {
    if (/^ext:/.test(key)) return 0;
    const st0 = (VD().adSpend || []).filter((x) => x.iid === key).map((x) => x.ym).concat(VD().payouts.filter((x) => x.key === key).map((x) => x.ym)).filter((m) => m < ym).sort()[0];
    const prev = vdYMadd(ym, -1);
    if (!st0 || prev < st0) return 0;
    const p = vdStmt(key, prev);
    return p.net < 0 ? -p.net : 0;
  }
  function vdStmt(key, ym) {
    const rec = vdPayout(key, ym);
    if (rec && rec.snap) return Object.assign({}, rec.snap, { rec });
    const X = VX(), frozen = new Set();
    VD().payouts.forEach((x) => { if (x.key === key && x.snap && x.ym < ym) (x.snap.ids || []).forEach((id) => frozen.add(id)); });
    const keep = (o) => (o.status === "refunded" ? Math.max(0, 1 - (o.amount > 0 && o.refundAmount != null ? o.refundAmount / o.amount : 1)) : 1);
    const os = VD().orders.filter((o) => vdKey(o) === key && o.paidAt && vdYM(o.paidAt) === ym && (o.status === "paid" || (o.status === "refunded" && keep(o) > 0 && !frozen.has(o.id))));
    const dl = VD().orders.filter((o) => vdKey(o) === key && o.status === "refunded" && o.refundedAt && vdYM(o.refundedAt) === ym && frozen.has(o.id));
    const ch = {};
    const insK = (o) => Math.floor(X.insAmt(o) * keep(o) / 10) * 10, baseK = (o) => Math.round(X.baseOf(o) * keep(o));
    os.forEach((o) => { const k = X.isAccess(o) ? (o.ch || "web") : "addon", c = (ch[k] = ch[k] || { n: 0, base: 0, ins: 0 }); c.n++; c.base += baseK(o); c.ins += insK(o); });
    const ratio = (o) => (o.amount > 0 && o.refundAmount != null ? Math.min(1, o.refundAmount / o.amount) : 1);
    const ads = /^ext:/.test(key) ? [] : X.adOf(key, ym), adCost = ads.reduce((a, x) => a + (Number(x.amount) || 0), 0), adPct = X.adSplitOf(key), adDed = Math.round(adCost * adPct / 100 / 10) * 10;
    const carry = vdCarry(key, ym), ins = vdSum(os, insK), ded = dl.reduce((a, o) => a + Math.round(X.insAmt(o) * ratio(o) / 10) * 10, 0), net = ins - ded - adDed - carry, pf = vdProf(key), biz = pf.type === "biz";
    // 사업자 부가세: 예전 방식(공급가액 기준)만 정산액에 10%를 더해요. 판매가 기준(기본)은 정산액에 부가세가 들어 있어요
    const mode = X.taxMode(), wh = !biz && net > 0 ? Math.floor(net * 0.033 / 10) * 10 : 0, vat = biz && net > 0 && mode === "supply" ? Math.round(net * 0.1) : 0;
    const base0 = vdSum(os, baseK), pay0 = Math.max(0, net - wh + vat);
    // 세금계산서 (사업자 강사): gross 강사 → 두고홀딩스 판매가 합계 · 두고홀딩스 → 강사 나머지(수수료 · 광고비 분담 · 차감) / net 정산액 / supply 정산액 + 부가세
    const invIns = !biz || net <= 0 ? 0 : mode === "gross" ? base0 : mode === "net" ? pay0 : net + vat, invPf = biz && net > 0 && mode === "gross" ? Math.max(0, base0 - pay0) : 0;
    return { key, ym, name: vdKeyName(key), mode, invIns, invPf, n: os.length, base: vdSum(os, baseK), paid: vdSum(os, (o) => Math.round(o.amount * keep(o))), supply: vdSum(os, (o) => Math.round(X.supplyOf(o) * keep(o))), ch, ins, dedN: dl.length, ded, dedIds: dl.map((o) => o.id), adCost, adPct, adDed, adN: ads.length, carry, next: net < 0 ? -net : 0, net, biz, wh, vat, pay: Math.max(0, net - wh + vat), ids: os.map((o) => o.id), rec };
  }
  const vdAdCell = (r) => (r.adDed ? "- " + won(r.adDed) : r.carry ? "" : "0원") + (r.carry ? '<small class="a-memo">지난달 이월 - ' + won(r.carry) + "</small>" : "");
  const vdNextTxt = (r) => (r.next ? '<small class="a-memo vs-next">다음 달 이월 ' + won(r.next) + "</small>" : "");
  function vdStmtKeys(ym, only) {
    const s = new Set();
    VD().orders.forEach((o) => { if ((o.status === "paid" && o.paidAt && vdYM(o.paidAt) === ym) || (o.status === "refunded" && ((o.refundedAt && vdYM(o.refundedAt) === ym) || (o.paidAt && vdYM(o.paidAt) === ym)))) s.add(vdKey(o)); });
    VD().payouts.forEach((x) => { if (x.ym === ym) s.add(x.key); });
    (VD().adSpend || []).forEach((x) => { if (x.ym === ym) s.add(x.iid); });
    return [...s].filter((k) => !only || k === only).map((k) => vdStmt(k, ym)).filter((st) => st.n || st.ded || st.rec || st.adDed || st.carry).sort((a, b) => b.base - a.base);
  }
  function vdStState(st) {
    const r = st.rec, ended = vdYMadd(st.ym, 1) + "-01" <= todayStr();
    if (r && (r.st === "paid" || (!r.st && r.at))) return { k: "paid", t: "지급 완료 · " + fmtMD(r.at), c: "ok" };
    if (r && r.st === "invoiced") return { k: "invoiced", t: "세금계산서 받음 · 지급 대기", c: "info" };
    if (r && r.st === "confirmed") return st.biz ? (r.invReqAt ? { k: "invreq", t: "세금계산서 발행 신고됨", c: "warn" } : { k: "confirmed", t: "확정 · 세금계산서 대기", c: "warn" }) : { k: "confirmed", t: "확정 · 지급 대기", c: "info" };
    return ended ? { k: "ready", t: "확정 대기", c: "warn" } : { k: "live", t: "이번 달 집계 중", c: "mute" };
  }
  const vdChTags = (st) => Object.keys(st.ch || {}).map((k) => '<span class="vs-ch vs-ch-' + k + '">' + esc((VX().CH_TXT[k] || k).replace(" · TEA TIME", "")) + " " + st.ch[k].n + "</span>").join("");
  function vdProfPill(key) {
    if (/^ext:/.test(key)) return pill("외부 · 별도 계약", "mute");
    const pf = vdProf(key);
    return pf.account ? pill((pf.type === "biz" ? "사업자" : "개인 3.3%") + " · 계좌 등록", "ok") : pill("정산 정보 없음", "warn");
  }
  function vdSettle() {
    const ym = ui.vdYM || vdYMadd(todayStr().slice(0, 7), -1), rows = vdStmtKeys(ym).map((st) => Object.assign(st, { s: vdStState(st) }));
    const tot = rows.reduce((a, r) => ({ n: a.n + r.n, base: a.base + r.base, net: a.net + r.net, pay: a.pay + r.pay }), { n: 0, base: 0, net: 0, pay: 0 });
    const cnt = (ks) => rows.filter((r) => ks.indexOf(r.s.k) >= 0).length, X = VX();
    const act = (r) => { const at = ' data-k="' + esc(r.key) + '" data-m="' + esc(ym) + '"', k = r.s.k;
      return btn("명세서", "vda-stm", "a-btn-ghost a-btn-sm", at) +
        (k === "ready" ? btn("정산 확정", "vda-stc", "a-btn-primary a-btn-sm", at) : "") +
        (k === "confirmed" && r.biz || k === "invreq" ? btn("세금계산서 받음", "vda-sti", "a-btn-primary a-btn-sm", at) : "") +
        ((k === "confirmed" && !r.biz) || k === "invoiced" ? btn("지급 완료", "vda-pay", "a-btn-primary a-btn-sm", at) : "") +
        (k === "confirmed" || k === "invreq" || k === "invoiced" ? btn("확정 취소", "vda-sto", "a-btn-ghost a-btn-sm", at) : "") +
        (k === "paid" ? btn("지급 취소", "vda-unpay", "a-btn-ghost a-btn-sm", at) : ""); };
    return '<section class="a-card"><div class="a-card-head a-cal-head"><button type="button" class="a-icon-btn" data-action="vda-ym" data-dir="-1" aria-label="이전 달">' + icon("chevLeft") + "</button><h2>" + vdYMtxt(ym) + " 판매분 정산</h2>" + '<button type="button" class="a-icon-btn" data-action="vda-ym" data-dir="1" aria-label="다음 달">' + icon("chevRight") + "</button>" +
        '<span class="a-cal-sum">지급일 <b>' + fmtFull(vdPayDate(ym)) + "</b> · 지급 합계 <b>" + won(tot.pay) + "</b></span>" + (rows.length ? btn(icon("download", "sm") + "명세 CSV", "vda-stcsv", "a-btn-ghost a-btn-sm vda-ml", ' data-m="' + esc(ym) + '"') : "") + "</div>" +
      '<div class="vs-steps">' + [["확정 대기", cnt(["ready"]), "warn"], ["세금계산서 대기", cnt(["invreq"]) + rows.filter((r) => r.s.k === "confirmed" && r.biz).length, "warn"], ["지급 대기", rows.filter((r) => (r.s.k === "confirmed" && !r.biz) || r.s.k === "invoiced").length, "info"], ["지급 완료", cnt(["paid"]), "ok"]].map((x) => '<div class="vs-step ' + x[2] + '"><small>' + x[0] + "</small><b>" + x[1] + "명</b></div>").join("") + "</div>" +
      '<p class="a-muted p-small vda-note">' + icon("alert", "xs") + " " + vdRuleTxt() + " 비율 · 기준 · 광고비는 ‘강사별 비율 · 가격’ 탭에서 정해요.</p>" +
      (rows.length ? '<div class="a-table-wrap"><table class="a-table vda-table vs-table"><thead><tr><th>강사 · 크리에이터</th><th>판매</th><th class="right">판매가 합계</th><th class="right">정산액</th><th class="right">차감</th><th class="right">광고비 분담</th><th class="right">세금</th><th class="right">지급액</th><th>정산 정보</th><th>상태</th><th class="right">관리</th></tr></thead><tbody>' +
        rows.map((r) => "<tr><td><b>" + esc(r.name) + '</b><div class="vs-chs">' + vdChTags(r) + '</div></td><td class="num">' + r.n + '건</td><td class="right num">' + won(r.base) + '</td><td class="right num">' + won(r.ins) + '</td><td class="right num">' + (r.ded ? "- " + won(r.ded) : "0원") + '</td><td class="right num">' + vdAdCell(r) + '</td><td class="right num">' + (r.biz ? "+ " + won(r.vat) : r.wh ? "- " + won(r.wh) : "0원") + '</td><td class="right num"><b>' + won(r.pay) + "</b>" + vdNextTxt(r) + "</td><td>" + vdProfPill(r.key) + "</td><td>" + pill(r.s.t, r.s.c) + (r.rec && r.rec.invNo ? '<small class="a-memo">승인번호 ' + esc(r.rec.invNo) + "</small>" : "") + '</td><td class="right vs-acts">' + act(r) + "</td></tr>").join("") +
        '<tr class="a-rev-total"><td><b>합계</b></td><td class="num"><b>' + tot.n + '건</b></td><td class="right num"><b>' + won(tot.base) + '</b></td><td class="right num"><b>' + won(tot.net) + '</b></td><td></td><td></td><td></td><td class="right num"><b>' + won(tot.pay) + "</b></td><td></td><td></td><td></td></tr>" +
        "</tbody></table></div>" : emptyBox("coins", vdYMtxt(ym) + "에 결제된 VOD가 없어요.")) + "</section>";
  }
  /* 정산 비율 · 광고비 (마스터): 기본 강사 5 : 플랫폼 5 · 광고비도 5 : 5. 강사와 조율한 비율을 확정하면 강사센터 › 판매 정산에 바로 보여요 */
  const vdRateIns = () => { const v = VD(); return DB.data.instructors.filter((x) => v.products.some((p) => p.iid === x.id && VX().typeOf(p) === "vod")); };
  // 비율 표 대상: 클래스를 가진 모든 강사 (두잉고 계정이 없으면 ext:이름)
  const vdRateKeys = () => { const X = VX(), map = {}; VD().products.forEach((p) => { const k = X.tkey(p); if (!k || map[k]) return; map[k] = { id: k, name: /^ext:/.test(k) ? k.slice(4) : insName(p.iid) || p.creator || k }; }); return Object.keys(map).map((k) => map[k]); };
  /** 정산 기준 한 줄 설명 (마스터 · 강사 화면 공용) */
  function vdRuleTxt() {
    const X = VX(), m = X.taxMode();
    const base = m === "supply" ? "정산액 = 할인 전 판매가 ÷ 1.1(공급가액) × 정산 비율" : "정산액 = 할인 전 판매가(부가세 포함) × 정산 비율 (예: 100만 원 · 60% → 60만 원)";
    const biz = m === "gross" ? "사업자 강사는 판매가 합계로 두고홀딩스에 세금계산서를 발행하고, 두고홀딩스는 수수료분 세금계산서를 발행해요." : m === "net" ? "사업자 강사는 정산액(부가세 포함)으로 두고홀딩스에 세금계산서를 발행해요." : "사업자 강사는 정산액에 부가세 10%를 더해 세금계산서를 발행해요.";
    return base + " − 그 달 광고비 × 강사 분담. 쿠폰 · 포인트 · 결제 수수료는 플랫폼 부담, 확정 뒤 환불은 다음 명세에서 차감. 개인 강사는 3.3% 원천징수 후 지급. " + biz;
  }
  // 표 칸은 짧게: 강사 몫 % + 플랫폼 몫 (자세한 강사 : 플랫폼은 비율 정하기 창에서)
  const vdRateCell = (n) => '<td class="right num vda-rc"><b class="num">' + n + '%</b><small class="a-memo">플랫폼 ' + (100 - n) + "</small></td>";
  /* 정산 · 세금계산서 기준 + 기본 비율 (마스터) */
  function vdTaxCard() {
    const X = VX(), st = VD().settings, mode = X.taxMode(), d = st.rates || {};
    const ex = (m) => (m === "gross" ? "100만 원 · 강사 60% → 정산 60만 원 지급. 강사님이 두고홀딩스에 100만 원 세금계산서, 두고홀딩스가 강사님께 수수료 40만 원 세금계산서" : m === "net" ? "100만 원 · 강사 60% → 정산 60만 원 지급. 강사님이 두고홀딩스에 60만 원(부가세 포함) 세금계산서" : "100만 원 · 강사 60% → 공급가액 90만 9,090원 × 60% = 54만 5,450원 + 부가세 → 60만 원 지급 (개인 강사는 54만 5,450원에서 3.3%)");
    return '<section class="a-card"><div class="a-card-head"><h2>정산 · 세금계산서 기준</h2><span class="a-muted">강사 · 종류별 비율은 아래 표에서 정해요. 바꾸면 아직 확정하지 않은 명세서부터 새 기준으로 계산하고, 확정한 명세서는 그대로예요.</span></div>' +
      '<form id="vda-tax-form" class="a-form" novalidate><div class="vda-radios vda-tax">' + Object.keys(X.TAX_MODES).map((m) => '<label class="vda-radio"><input type="radio" name="taxMode" value="' + m + '"' + (mode === m ? " checked" : "") + "><span><b>" + esc(X.TAX_MODES[m]) + "</b><small>" + esc(ex(m)) + "</small></span></label>").join("") + "</div>" +
      '<p class="a-label">기본 비율 <small class="a-muted">강사별로 따로 정하지 않은 강사에게 써요 · 숫자는 강사 몫(%)</small></p><div class="a-form-row vda-defr">' +
        X.RATE_KEYS.map((x) => '<div class="a-field"><label for="vdt-' + x[0] + '">' + esc(x[1]) + '</label><div class="vda-pct"><input class="a-input" id="vdt-' + x[0] + '" name="r-' + x[0] + '" type="number" min="0" max="100" inputmode="numeric" value="' + esc(d[x[0]] != null && d[x[0]] !== "" ? d[x[0]] : X.rateDef(x[0])) + '"><span>%</span></div></div>').join("") + "</div>" +
      '<p class="a-muted p-small">' + icon("alert", "xs") + " 세금계산서는 사업자 강사만 해당해요. 개인 강사는 정산액에서 사업소득 3.3%를 떼고 지급해요. 기준은 세무사와 한 번 확인해 주세요.</p>" +
      '<div class="a-form-actions"><button class="a-btn a-btn-primary" type="submit">기준 저장</button></div></form></section>';
  }
  /* 강사별 가격 (마스터): 강의 정가 · 판매가 · 1:1 코칭권 · TEA TIME 을 한 표에서 바로 고쳐요 */
  function vdPriceCard() {
    const X = VX(), keys = vdRateKeys(), k = ui.vdPriceKey && keys.some((x) => x.id === ui.vdPriceKey) ? ui.vdPriceKey : (keys[0] || {}).id;
    if (!k) return "";
    const ps = VD().products.filter((p) => X.tkey(p) === k).sort((a, b) => (a.status === "hidden") - (b.status === "hidden") || b.createdAt - a.createdAt), st = VD().settings, dc = st.coach || {}, dt = st.tea || {};
    const inp = (n, v, ph, w) => '<input class="a-input a-sm vda-pin" name="' + n + '" type="number" min="0" step="' + (w || 1000) + '" inputmode="numeric" value="' + esc(v == null ? "" : v) + '" placeholder="' + esc(ph == null ? "" : ph) + '">';
    const pg = pageSlice("vdPrice", ps, 5);
    return '<section class="a-card" data-pg-card="vdPrice"><div class="a-card-head"><h2>강사별 가격</h2><span class="a-muted">강의 · 1:1 코칭권 · TEA TIME 가격을 강사별로 바로 고쳐요. 저장하면 스토어에 바로 반영돼요. 수강권 기간별 가격 · 할인 마감은 클래스 수정에서 정해요.</span>' +
        '<select class="a-input a-sm vda-ml" id="vda-price-key" aria-label="강사 고르기">' + keys.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === k ? " selected" : "") + ">" + esc(x.name) + "</option>").join("") + "</select></div>" +
      (ps.length ? '<div class="vda-prices">' + pg.items.map((p) => {
        const t = X.typeOf(p), vod = t === "vod" && X.priceOf(p) > 0, c = p.coach || {}, te = p.tea || {}, co = X.coachOf(p), tt = X.teaOf(p);
        return '<form class="vda-price" data-id="' + esc(p.id) + '" novalidate><div class="vda-price-h">' + vdThumb(p, "sm") + "<div><b>" + esc(p.title) + '</b><small class="a-memo">' + esc(X.TYPE[t] ? X.TYPE[t][0] : t) + " · " + esc((VD_ST[p.status] || VD_ST.hidden)[0]) + " · 지금 판매가 " + won(X.priceOf(p)) + "</small></div></div>" +
          '<div class="vda-price-f"><label><span>정가</span>' + inp("price", p.price, "", 1000) + "</label><label><span>판매가 <small>(비우면 정가)</small></span>" + inp("sale", p.sale, "", 1000) + "</label>" +
            (vod ? '<label><span>1:1 코칭권 가격</span>' + inp("coachPrice", c.price, co ? co.price : dc.price, 1000) + '</label><label><span>코칭 횟수</span>' + inp("coachN", c.n, co ? co.n : dc.n || 5, 1) + "</label>" +
              '<label><span>TEA TIME 가격 <small>(Zoom)</small></span>' + inp("teaPrice", te.price, tt ? tt.price : dt.price, 1000) + '</label><label><span>TEA TIME 시간(분)</span>' + inp("teaMin", te.min, tt ? tt.min : dt.min || 60, 10) + "</label>" : "") +
            '<button class="a-btn a-btn-primary a-btn-sm" type="submit">저장</button></div></form>'; }).join("") + "</div>" + numPager("vdPrice", pg) : emptyBox("monitorPlay", "이 강사의 클래스가 없어요.")) + "</section>";
  }
  function vdRates() {
    const v = VD(), X = VX(), keys = vdRateKeys(), pg = pageSlice("vdRate", keys, 5);
    return vdTaxCard() +
      '<section class="a-card" data-pg-card="vdRate"><div class="a-card-head"><h2>강사별 정산 비율</h2><span class="a-muted">숫자는 강사 몫이에요 (기본 강사 5 : 플랫폼 5). 강사와 따로 조율하면 종류마다 따로 정할 수 있어요 — 예: TEA TIME 100%는 TEA TIME 매출을 모두 강사님께.</span></div>' +
        '<div class="a-table-wrap"><table class="a-table vda-rates"><thead><tr><th>강사</th>' + X.RATE_KEYS.map((x) => '<th class="right">' + esc(x[1]) + "</th>").join("") + '<th class="right">광고비 분담</th><th>강의별 예외</th><th>계약 메모 · 확정</th><th class="right">관리</th></tr></thead><tbody>' +
          pg.items.map((x) => { const r = X.rateOf(x.id), ex = v.products.filter((p) => X.tkey(p) === x.id && p.share != null && p.share !== "");
            return "<tr><td><b>" + esc(x.name) + "</b>" + (/^ext:/.test(x.id) ? '<small class="a-memo">두잉고 계정 없는 강사</small>' : "") + "</td>" + X.RATE_KEYS.map((k) => vdRateCell(r[k[0]])).join("") + vdRateCell(r.ad) +
              "<td>" + (ex.length ? ex.map((p) => '<span class="vda-ex">' + esc(p.title.slice(0, 14)) + " " + p.share + "%</span>").join("") : '<span class="a-muted">없음</span>') + "</td>" +
              '<td class="vda-memo">' + (r.memo ? '<span title="' + esc(r.memo) + '">' + esc(r.memo) + "</span>" : '<span class="a-muted">기본 계약</span>') + (r.next ? '<small class="a-memo vda-next">' + icon("clock", "xs") + " 예정 · " + esc(vdRateNextTxt(r)) + "</small>" : r.at ? '<small class="a-memo">' + esc(fmtFull(DB.date.toStr(new Date(r.from || r.at)))) + "부터 · " + esc(r.by || "마스터") + " 확정</small>" : "") + "</td>" +
              '<td class="right">' + btn("비율 정하기", "vda-rate-edit", "a-btn-ghost a-btn-sm", ' data-k="' + esc(x.id) + '"') + "</td></tr>"; }).join("") +
        "</tbody></table></div>" + numPager("vdRate", pg) +
        '<p class="a-muted p-small">' + icon("alert", "xs") + " 비율에는 ‘적용 시작일’이 있어요. 그날부터 결제한 주문은 새 비율, 그 전에 결제한 주문은 그때 비율로 정산해요. 강의 하나만 따로 정할 때는 VOD 클래스 관리 › 클래스 수정 › ‘강사 정산 비율’을 쓰면 그 강의가 먼저예요.</p></section>" +
      vdPriceCard();
  }
  /* ---------- 매출 리포트 · 판매 순위 · 광고비 · ROAS (마스터 › 매출 · 정산) ----------
   * 숫자 기준 (모두 부가세 포함 금액):
   *  결제 = 그 달에 결제된 금액(나중에 환불된 주문 포함) · 환불 = 그 달에 처리한 환불 · 순매출 = 결제 − 환불
   *  강사 정산 = 그 달 판매분 정산 명세의 정산액 합계(광고비 강사 분담 · 환불 차감 뒤 · 세금 전)
   *  광고비 = 그 달 집행 총액 · PG 수수료 = 결제수단별 수수료율로 계산한 추정치
   *  플랫폼 이익(추정) = 순매출 − 강사 정산 − 광고비 − PG 수수료 (세무 신고용이 아닌 관리용 숫자) */
  const VD_PAY_KEYS = [["card", "카드"], ["kakao", "카카오페이"], ["naver", "네이버페이"], ["toss", "토스페이"], ["transfer", "계좌이체"], ["vbank", "가상계좌"], ["bank", "무통장 입금"], ["free", "무료 · 쿠폰 · 포인트"]];
  const vdPayKey = (o) => (!(o.amount > 0) || o.method === "free" || o.method === "point" ? "free" : VD_PAY[o.method] ? o.method : "card");
  // 결제수단별 수수료 기본값 [%, 건당 원] — 매출 리포트 › ‘수수료율’에서 PG 계약대로 고쳐요
  const PG_FEE_DEF = { card: [3.3, 0], kakao: [3.3, 0], naver: [3.3, 0], toss: [3.3, 0], transfer: [2, 0], vbank: [0, 300], bank: [0, 0], free: [0, 0] };
  const vdFeeRate = (k) => { const s = ((VD().settings || {}).pgFee || {})[k] || {}, d = PG_FEE_DEF[k] || [0, 0], n = (x, dv) => (x != null && x !== "" && isFinite(Number(x)) ? Number(x) : dv); return [n(s.pct, d[0]), n(s.won, d[1])]; };
  const vdFee = (o) => { const base = Math.round((Number(o.amount) || 0) * vdKeep(o)); if (!(base > 0)) return 0; const f = vdFeeRate(vdPayKey(o)); return Math.round(base * f[0] / 100) + f[1]; };
  const vdSold = (ym) => VD().orders.filter((o) => o.paidAt && vdYM(o.paidAt) === ym && (o.status === "paid" || o.status === "refunded"));
  const vdRefAmt = (o) => (o.refundAmount != null ? Number(o.refundAmount) || 0 : Number(o.amount) || 0);
  let finMemo = null; // 매출 리포트를 그리는 동안만 같은 달을 다시 계산하지 않게
  /** 한 달 손익 (관리용) */
  function vdFin(ym) {
    if (finMemo && finMemo[ym]) return finMemo[ym];
    const sold = vdSold(ym), refd = VD().orders.filter((o) => o.status === "refunded" && o.refundedAt && vdYM(o.refundedAt) === ym);
    const gross = vdSum(sold, (o) => Number(o.amount) || 0), ref = vdSum(refd, vdRefAmt), net = gross - ref;
    const sts = ym <= todayStr().slice(0, 7) ? vdStmtKeys(ym) : [];
    const ins = sts.reduce((a, st) => a + Math.max(0, st.net), 0), adIns = sts.reduce((a, st) => a + (st.adDed || 0), 0);
    const ad = (VD().adSpend || []).filter((x) => x.ym === ym).reduce((a, x) => a + (Number(x.amount) || 0), 0);
    const fee = sold.reduce((a, o) => a + vdFee(o), 0), paidN = sold.filter((o) => o.amount > 0).length;
    const r = { ym, n: sold.length, paidN, gross, ref, refN: refd.length, net, vat: Math.round(net / 11), ins, ad, adIns, fee, profit: net - ins - ad - fee };
    if (finMemo) finMemo[ym] = r;
    return r;
  }
  /** 기간 [from, to) 의 순매출 (결제 − 환불) — 이번 달 진행 중일 때 지난달 같은 기간과 비교 */
  const vdNetBetween = (a, b) => VD().orders.reduce((s, o) => s + ((o.status === "paid" || o.status === "refunded") && o.paidAt >= a && o.paidAt < b ? Number(o.amount) || 0 : 0) - (o.status === "refunded" && o.refundedAt >= a && o.refundedAt < b ? vdRefAmt(o) : 0), 0);
  const ymStart = (ym) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1).getTime();
  /** 증감 표시: ▲ 12.3% / ▼ 4.0% / 새로 발생 */
  function vdChg(cur, prev, plain) {
    if (!prev) return cur ? (plain ? "새로 발생" : '<span class="fin-chg up">새로 발생</span>') : plain ? "-" : '<span class="fin-chg">-</span>';
    const p = (cur - prev) / Math.abs(prev) * 100, t = (p >= 0 ? "▲ " : "▼ ") + Math.abs(p).toFixed(1) + "%";
    return plain ? t : '<span class="fin-chg ' + (p >= 0 ? "up" : "down") + '">' + t + "</span>";
  }
  const finShort = (n) => { const a = Math.abs(n), s = n < 0 ? "-" : ""; return a >= 1e8 ? s + (Math.round(a / 1e7) / 10) + "억" : a >= 1e4 ? s + Math.round(a / 1e4).toLocaleString("ko-KR") + "만" : s + a.toLocaleString("ko-KR"); };
  const finNav = (act, label, cls) => '<div class="a-card-head a-cal-head ' + (cls || "") + '"><button type="button" class="a-icon-btn" data-action="' + act + '" data-dir="-1" aria-label="이전">' + icon("chevLeft") + "</button><h2>" + label + '</h2><button type="button" class="a-icon-btn" data-action="' + act + '" data-dir="1" aria-label="다음">' + icon("chevRight") + "</button>";
  // 상품 종류 (매출 리포트 · 판매 순위)
  const FIN_KIND = [["vod", "VOD 수강권"], ["extend", "1년 연장권"], ["ebook", "전자책"], ["book", "종이책"], ["live", "LIVE · 오프라인"], ["coach", "1:1 코칭권"], ["tea", "TEA TIME"]];
  const vdKindKey = (o) => (VX().kindOf(o) === "extend" ? "extend" : VX().rateKeyOf(o));

  function pageVodSales() {
    finMemo = {};
    try { return vdSalesHtml(); } finally { finMemo = null; }
  }
  function vdSalesHtml() {
    const t0 = todayStr(), thisM = t0.slice(0, 7), ym = ui.finYM || thisM, y = Number(ym.slice(0, 4)), live = ym === thisM;
    const f = vdFin(ym), pm = vdFin(vdYMadd(ym, -1)), ly = vdFin(vdYMadd(ym, -12));
    // 진행 중인 달은 같은 기간끼리 (1일 ~ 오늘) 비교해요
    const now = Date.now(), el = now - ymStart(ym), pmS = ymStart(vdYMadd(ym, -1)), lyS = ymStart(vdYMadd(ym, -12));
    const pmCmp = live ? Math.min(vdNetBetween(pmS, pmS + el), pm.net) : pm.net, lyCmp = live ? Math.min(vdNetBetween(lyS, lyS + el), ly.net) : ly.net;
    const aov = f.paidN ? Math.round(f.gross / f.paidN) : 0, margin = f.net > 0 ? Math.round(f.profit / f.net * 1000) / 10 : 0, refRate = f.gross > 0 ? Math.round(f.ref / f.gross * 1000) / 10 : 0;
    const cmpTxt = live ? "지난달 같은 기간(1~" + Number(t0.slice(8)) + "일)" : "지난달";
    return head("매출 리포트", "DOOGO CLASS의 결제 · 환불 · 순매출과 강사 정산 · 광고비 · PG 수수료를 빼고 남는 플랫폼 이익을 월별로 봐요. 금액은 모두 부가세 포함이에요.", btn(icon("download", "sm") + "월별 손익 CSV", "fin-csv", "a-btn-ghost", ' data-y="' + y + '"') + '<a class="a-btn a-btn-ghost" href="#/center/master/vod-rank">' + icon("trophy", "sm") + "판매 순위</a>") +
      '<section class="a-card fin-top">' + finNav("fin-ym", vdYMtxt(ym) + (live ? ' <small class="a-muted">· 진행 중</small>' : "")) + '<span class="a-cal-sum">결제 <b>' + f.n + "건</b> · 환불 " + f.refN + "건</span></div>" +
        '<div class="fin-kpis">' +
          '<div class="fin-kpi main"><small>순매출</small><b class="num">' + won(f.net) + "</b><span>" + cmpTxt + " " + won(pmCmp) + " 대비 " + vdChg(f.net, pmCmp) + "</span></div>" +
          '<div class="fin-kpi"><small>작년 ' + Number(ym.slice(5)) + "월 대비</small><b>" + vdChg(f.net, lyCmp) + "</b><span>" + (live ? "작년 같은 기간 " : "작년 " + Number(ym.slice(5)) + "월 ") + won(lyCmp) + "</span></div>" +
          '<div class="fin-kpi"><small>객단가</small><b class="num">' + won(aov) + "</b><span>유료 결제 " + f.paidN + "건 · 환불률 " + refRate + "%</span></div>" +
          '<div class="fin-kpi ' + (f.profit >= 0 ? "ok" : "bad") + '"><small>플랫폼 이익 (추정)</small><b class="num">' + won(f.profit) + "</b><span>순매출의 " + margin + "% · 지난달 " + won(pm.profit) + "</span></div>" +
        "</div></section>" +
      '<div class="fin-grid">' + finPnl(f) + finDaily(ym) + "</div>" +
      finYear(y) +
      '<div class="fin-grid">' + finMethods(ym) + finKinds(ym) + "</div>";
  }
  /** 이번 달 손익 (관리용) */
  function finPnl(f) {
    const row = (t, n, cls, sub) => '<li class="' + (cls || "") + '"><span>' + t + (sub ? "<small>" + sub + "</small>" : "") + '</span><b class="num">' + n + "</b></li>";
    return '<section class="a-card"><div class="a-card-head"><h2>' + vdYMtxt(f.ym) + " 손익</h2><span class=\"a-muted\">관리용 · 부가세 포함</span></div>" +
      '<ul class="fin-pnl">' +
        row("결제 금액", won(f.gross), "", f.n + "건 (나중에 환불된 주문 포함)") +
        row("환불", (f.ref ? "- " : "") + won(f.ref), "neg", f.refN + "건 · 그 달에 처리한 환불") +
        row("순매출", won(f.net), "sum") +
        row("강사 정산", (f.ins ? "- " : "") + won(f.ins), "neg", "정산 명세의 정산액 합계" + (f.adIns ? " · 광고비 강사 분담 " + won(f.adIns) + " 차감 뒤" : "")) +
        row("광고비 집행", (f.ad ? "- " : "") + won(f.ad), "neg", f.ad ? "강사 분담 " + won(f.adIns) + " · 플랫폼 부담 " + won(f.ad - f.adIns) : '<a href="#/center/master/vod-ads">광고비 적기</a>') +
        row("PG 수수료 (추정)", (f.fee ? "- " : "") + won(f.fee), "neg", "결제수단별 수수료율로 계산") +
        row("플랫폼 이익 (추정)", won(f.profit), "sum " + (f.profit >= 0 ? "ok" : "bad")) +
      "</ul>" +
      '<p class="a-muted p-small fin-vat">' + icon("alert", "xs") + " 참고: 순매출 중 부가세 " + won(f.vat) + " · 공급가액 " + won(f.net - f.vat) + ". 세금 신고 금액은 세무사와 확인해 주세요.</p></section>";
  }
  /** 일별 순매출 (지난달 같은 날을 옅게) */
  function finDaily(ym) {
    const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)), days = new Date(y, m, 0).getDate(), pym = vdYMadd(ym, -1), t0 = todayStr();
    const day = {}, pday = {};
    const add = (map, ms, n) => { const d = Number(DB.date.toStr(new Date(ms)).slice(8)); map[d] = (map[d] || 0) + n; };
    VD().orders.forEach((o) => {
      if ((o.status === "paid" || o.status === "refunded") && o.paidAt) { const k = vdYM(o.paidAt); if (k === ym) add(day, o.paidAt, Number(o.amount) || 0); else if (k === pym) add(pday, o.paidAt, Number(o.amount) || 0); }
      if (o.status === "refunded" && o.refundedAt) { const k = vdYM(o.refundedAt); if (k === ym) add(day, o.refundedAt, -vdRefAmt(o)); else if (k === pym) add(pday, o.refundedAt, -vdRefAmt(o)); }
    });
    const max = Math.max(1, ...Object.values(day), ...Object.values(pday)), best = Object.keys(day).sort((a, b) => day[b] - day[a])[0];
    const h = (n) => (n > 0 ? Math.max(2, Math.round(n / max * 100)) : 0);
    return '<section class="a-card"><div class="a-card-head"><h2>일별 순매출</h2><span class="a-muted">' + (best && day[best] > 0 ? "가장 많이 판 날 " + Number(ym.slice(5)) + "/" + best + " · " + won(day[best]) : "아직 판매가 없어요") + "</span></div>" +
      '<div class="fin-days" style="--n:' + days + '">' + Array.from({ length: days }, (_, i) => { const d = i + 1, n = day[d] || 0, p = pday[d] || 0, ds = ym + "-" + String(d).padStart(2, "0");
        return '<div class="fin-d' + (ds === t0 ? " now" : "") + (ds > t0 ? " fut" : "") + '" title="' + Number(ym.slice(5)) + "/" + d + " " + won(n) + " · 지난달 " + won(p) + '"><span class="fin-db"><i class="p" style="height:' + h(p) + '%"></i><i style="height:' + h(n) + '%"></i></span><b>' + (d === 1 || d % 5 === 0 ? d : "") + "</b></div>"; }).join("") + "</div>" +
      '<p class="fin-legend"><span><i></i>' + Number(ym.slice(5)) + '월</span><span><i class="p"></i>지난달 같은 날</span></p></section>';
  }
  /** 한 해 월별 추이 + 손익 표 (작년 같은 달을 옅게) */
  function finYear(y) {
    const thisM = todayStr().slice(0, 7), ms = Array.from({ length: 12 }, (_, i) => y + "-" + String(i + 1).padStart(2, "0"));
    const rows = ms.map((ym) => Object.assign(vdFin(ym), { prev: vdFin(vdYMadd(ym, -1)).net, ly: vdFin(vdYMadd(ym, -12)).net }));
    const tot = rows.reduce((a, r) => { ["n", "gross", "ref", "net", "ins", "ad", "fee", "profit"].forEach((k) => { a[k] += r[k]; }); a.ly += r.ly; return a; }, { n: 0, gross: 0, ref: 0, net: 0, ins: 0, ad: 0, fee: 0, profit: 0, ly: 0 });
    const max = Math.max(1, ...rows.map((r) => Math.max(r.net, r.ly)));
    const h = (n) => (n > 0 ? Math.max(3, Math.round(n / max * 100)) : 0);
    return '<section class="a-card">' + finNav("fin-year", y + "년 월별 매출") + '<span class="a-cal-sum">순매출 <b>' + won(tot.net) + "</b> · 작년 " + won(tot.ly) + " " + vdChg(tot.net, tot.ly) + " · 플랫폼 이익 <b>" + won(tot.profit) + "</b></span></div>" +
      '<div class="a-rev-chart fin-yc" aria-hidden="true">' + rows.map((r, i) => '<div class="a-rev-col' + (r.ym === thisM ? " now" : "") + '"><small class="num">' + (r.net ? finShort(r.net) : "") + '</small><span class="a-rev-bar fin-yb"><i class="p" style="height:' + h(r.ly) + '%"></i><i style="height:' + h(r.net) + '%"></i></span><b>' + (i + 1) + "월</b></div>").join("") + "</div>" +
      '<p class="fin-legend"><span><i></i>' + y + '년 순매출</span><span><i class="p"></i>' + (y - 1) + "년 같은 달</span></p>" +
      '<div class="a-table-wrap"><table class="a-table fin-table"><thead><tr><th>월</th><th class="right">결제</th><th class="right">환불</th><th class="right">순매출</th><th class="right">전월 대비</th><th class="right">전년 대비</th><th class="right">강사 정산</th><th class="right">광고비</th><th class="right">PG 수수료</th><th class="right">플랫폼 이익</th></tr></thead><tbody>' +
        rows.map((r, i) => { const fut = r.ym > thisM; return "<tr" + (r.n || r.ref || r.ad ? "" : ' class="a-dim"') + "><td><b>" + (i + 1) + '월</b><small class="a-memo">' + r.n + '건</small></td><td class="right num">' + won(r.gross) + '</td><td class="right num">' + (r.ref ? "- " + won(r.ref) : "0원") + '</td><td class="right num"><b>' + won(r.net) + '</b></td><td class="right">' + (fut ? "-" : vdChg(r.net, r.prev)) + '</td><td class="right">' + (fut ? "-" : vdChg(r.net, r.ly)) + '</td><td class="right num">' + won(r.ins) + '</td><td class="right num">' + won(r.ad) + '</td><td class="right num">' + won(r.fee) + '</td><td class="right num ' + (r.profit < 0 ? "fin-neg" : "") + '"><b>' + won(r.profit) + "</b></td></tr>"; }).join("") +
        '<tr class="a-rev-total"><td><b>합계</b><small class="a-memo">' + tot.n + '건</small></td><td class="right num"><b>' + won(tot.gross) + '</b></td><td class="right num">' + (tot.ref ? "- " + won(tot.ref) : "0원") + '</td><td class="right num"><b>' + won(tot.net) + '</b></td><td></td><td class="right">' + vdChg(tot.net, tot.ly) + '</td><td class="right num"><b>' + won(tot.ins) + '</b></td><td class="right num"><b>' + won(tot.ad) + '</b></td><td class="right num"><b>' + won(tot.fee) + '</b></td><td class="right num"><b>' + won(tot.profit) + "</b></td></tr>" +
      "</tbody></table></div></section>";
  }
  /** 결제수단별 (건수 · 금액 · 비중 · 수수료) */
  function finMethods(ym) {
    const sold = vdSold(ym), by = {};
    sold.forEach((o) => { const k = vdPayKey(o), x = (by[k] = by[k] || { n: 0, amt: 0, fee: 0 }); x.n++; x.amt += Math.round((Number(o.amount) || 0) * vdKeep(o)); x.fee += vdFee(o); });
    const tot = Object.keys(by).reduce((a, k) => a + by[k].amt, 0), list = VD_PAY_KEYS.filter((x) => by[x[0]]);
    const rate = (k) => { const r = vdFeeRate(k); return (r[0] ? r[0] + "%" : "") + (r[0] && r[1] ? " + " : "") + (r[1] ? won(r[1]) + "/건" : "") || "없음"; };
    return '<section class="a-card"><div class="a-card-head"><h2>결제수단별</h2><span class="a-muted">' + vdYMtxt(ym) + " · 환불 뺀 금액</span>" + btn(icon("sliders", "sm") + "수수료율", "fin-fee", "a-btn-ghost a-btn-sm vda-ml") + "</div>" +
      (list.length ? '<ul class="fin-bars">' + list.map((x) => { const v = by[x[0]], p = tot ? Math.round(v.amt / tot * 100) : 0;
        return '<li><div class="fin-bh"><b>' + esc(x[1]) + '</b><span class="num">' + won(v.amt) + " · " + v.n + "건</span></div>" + '<span class="fin-bar"><i style="width:' + p + '%"></i></span><small>' + p + "% · 수수료 " + rate(x[0]) + " → " + won(v.fee) + "</small></li>"; }).join("") + "</ul>" : emptyBox("coins", "이 달 결제가 없어요.")) + "</section>";
  }
  /** 상품 종류별 */
  function finKinds(ym) {
    const sold = vdSold(ym).filter(vdLive), by = {};
    sold.forEach((o) => { const k = vdKindKey(o), x = (by[k] = by[k] || { n: 0, amt: 0 }); x.n++; x.amt += Math.round((Number(o.amount) || 0) * vdKeep(o)); });
    const tot = Object.keys(by).reduce((a, k) => a + by[k].amt, 0), list = FIN_KIND.filter((x) => by[x[0]]);
    return '<section class="a-card"><div class="a-card-head"><h2>상품 종류별</h2><span class="a-muted">' + vdYMtxt(ym) + "</span></div>" +
      (list.length ? '<ul class="fin-bars k">' + list.map((x) => { const v = by[x[0]], p = tot ? Math.round(v.amt / tot * 100) : 0;
        return '<li><div class="fin-bh"><b>' + esc(x[1]) + '</b><span class="num">' + won(v.amt) + " · " + v.n + "건</span></div>" + '<span class="fin-bar"><i style="width:' + p + '%"></i></span><small>' + p + "%</small></li>"; }).join("") + "</ul>" : emptyBox("coins", "이 달 판매가 없어요.")) + "</section>";
  }
  function finFeeModal() {
    openModal("결제수단별 수수료율", '<form id="fin-fee-form" class="a-form" novalidate><p class="a-muted">PG(포트원 · 카드사) 계약서의 수수료율을 적으면 매출 리포트의 PG 수수료 · 플랫폼 이익이 그 기준으로 다시 계산돼요. 실제 수수료는 PG 정산 내역이 기준이에요.</p>' +
      '<div class="fin-fee-g">' + VD_PAY_KEYS.filter((x) => x[0] !== "free").map((x) => { const r = vdFeeRate(x[0]); return '<div class="fin-fee-r"><b>' + esc(x[1]) + '</b><label><input class="a-input a-sm" name="p-' + x[0] + '" type="number" min="0" max="20" step="0.01" value="' + r[0] + '"><span>%</span></label><label><input class="a-input a-sm" name="w-' + x[0] + '" type="number" min="0" max="10000" step="10" value="' + r[1] + '"><span>원/건</span></label></div>'; }).join("") + "</div>" +
      '<p class="a-error" id="fin-fee-err"></p></form>', btn("기본값으로", "fin-fee-def", "a-btn-ghost") + '<span class="a-spacer"></span>' + btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="fin-fee-form">저장</button>', "md");
  }
  function saveFinFee(f) {
    const out = {}, err = document.getElementById("fin-fee-err");
    for (const x of VD_PAY_KEYS) {
      if (x[0] === "free") continue;
      const p = Number(f["p-" + x[0]].value), w = Number(f["w-" + x[0]].value);
      if (!(p >= 0 && p <= 20) || !(w >= 0 && w <= 10000)) { err.textContent = x[1] + " 수수료를 0~20% · 0~10,000원 사이로 적어 주세요."; return; }
      out[x[0]] = { pct: Math.round(p * 100) / 100, won: Math.round(w) };
    }
    VD().settings.pgFee = out;
    commit("결제수단별 수수료율을 저장했어요.");
  }
  function downloadCsv(name, rows) {
    const csv = "\uFEFF" + rows.map((r) => r.map((c) => '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"').join(",")).join("\n"), l = document.createElement("a");
    l.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); l.download = name; l.click();
  }
  function finCsv(y) {
    const rows = [["월", "결제건수", "결제금액", "환불", "순매출", "부가세(참고)", "강사정산", "광고비", "광고비_강사분담", "PG수수료(추정)", "플랫폼이익(추정)"]];
    for (let i = 1; i <= 12; i++) { const r = vdFin(y + "-" + String(i).padStart(2, "0")); rows.push([r.ym, r.n, r.gross, r.ref, r.net, r.vat, r.ins, r.ad, r.adIns, r.fee, r.profit]); }
    downloadCsv("doogoclass-pnl-" + y + ".csv", rows);
  }

  /* 판매 순위: 기간 · 종류별로 어떤 강의가 가장 잘 팔렸는지 (순매출 = 환불 뺀 금액) */
  const RK_PER = [["this", "이번 달"], ["last", "지난달"], ["3m", "최근 3개월"], ["year", "올해"], ["all", "전체"]];
  function rkRange(per) {
    const m = todayStr().slice(0, 7), y = m.slice(0, 4);
    if (per === "last") return [vdYMadd(m, -1), vdYMadd(m, -1), [vdYMadd(m, -2), vdYMadd(m, -2)]];
    if (per === "3m") return [vdYMadd(m, -2), m, [vdYMadd(m, -5), vdYMadd(m, -3)]];
    if (per === "year") return [y + "-01", y + "-12", [(y - 1) + "-01", (y - 1) + "-12"]];
    if (per === "all") return ["0000-00", "9999-99", null];
    return [m, m, [vdYMadd(m, -1), vdYMadd(m, -1)]];
  }
  function rkAgg(from, to, type) {
    const X = VX(), by = {}, ins = {};
    VD().orders.forEach((o) => {
      if (!vdLive(o)) return;
      const ym = vdYM(o.paidAt); if (ym < from || ym > to) return;
      const p = vdP(o.pid); if (!p) return;
      const ty = X.typeOf(p), tk = ty === "live" || ty === "offline" ? "event" : ty;
      if (type && type !== "all" && tk !== type) return;
      const amt = Math.round((Number(o.amount) || 0) * vdKeep(o)), x = (by[p.id] = by[p.id] || { p, n: 0, amt: 0, k: {} }), kk = vdKindKey(o);
      x.n++; x.amt += amt; x.k[kk] = (x.k[kk] || 0) + 1;
      const key = vdKey(o), y2 = (ins[key] = ins[key] || { key, n: 0, amt: 0, sh: 0, ps: new Set() }); y2.n++; y2.amt += amt; y2.sh += vdInsAmt(o); y2.ps.add(p.id);
    });
    return { list: Object.values(by), ins: Object.values(ins) };
  }
  function pageVodRank() {
    const per = ui.rkPer || "this", type = ui.rkType || "all", sort = ui.rkSort || "amt", r = rkRange(per), X = VX();
    const cur = rkAgg(r[0], r[1], type), prev = r[2] ? rkAgg(r[2][0], r[2][1], type) : null;
    const by = (a, b) => (sort === "n" ? b.n - a.n || b.amt - a.amt : b.amt - a.amt || b.n - a.n);
    const list = cur.list.sort(by), pRank = {};
    if (prev) prev.list.sort(by).forEach((x, i) => { pRank[x.p.id] = i + 1; });
    const tot = list.reduce((a, x) => a + x.amt, 0), totN = list.reduce((a, x) => a + x.n, 0);
    const label = (RK_PER.find((x) => x[0] === per) || RK_PER[0])[1], span = per === "all" ? "처음부터 지금까지" : r[0] === r[1] ? vdYMtxt(r[0]) : vdYMtxt(r[0]) + " ~ " + vdYMtxt(r[1]);
    const move = (x, i) => { if (!prev) return ""; const pr = pRank[x.p.id]; if (!pr) return '<span class="rk-mv new">NEW</span>'; const d = pr - (i + 1); return d > 0 ? '<span class="rk-mv up">▲' + d + "</span>" : d < 0 ? '<span class="rk-mv down">▼' + -d + "</span>" : '<span class="rk-mv">-</span>'; };
    const kTxt = (x) => FIN_KIND.filter((k) => x.k[k[0]]).map((k) => k[1] + " " + x.k[k[0]]).join(" · ");
    const podium = list.slice(0, 3);
    return head("판매 순위", "어떤 강의가 가장 잘 팔렸는지 기간 · 종류별로 봐요. 금액은 환불을 뺀 순매출이에요.", '<a class="a-btn a-btn-ghost" href="#/center/master/vod-sales">' + icon("activity", "sm") + "매출 리포트</a>") +
      '<section class="a-card rk-bar"><div class="a-tabs">' + RK_PER.map((x) => '<button type="button" class="a-tab' + (per === x[0] ? " on" : "") + '" data-action="rk-per" data-k="' + x[0] + '">' + x[1] + "</button>").join("") + "</div>" +
        '<div class="rk-f"><select class="a-input a-sm" id="rk-type" aria-label="종류"><option value="all">모든 종류</option>' + [["vod", "VOD 강의"], ["ebook", "전자책"], ["book", "종이책"], ["event", "LIVE · 오프라인"]].map((x) => '<option value="' + x[0] + '"' + (type === x[0] ? " selected" : "") + ">" + x[1] + "</option>").join("") + "</select>" +
        '<select class="a-input a-sm" id="rk-sort" aria-label="정렬"><option value="amt"' + (sort === "amt" ? " selected" : "") + '>매출 많은 순</option><option value="n"' + (sort === "n" ? " selected" : "") + ">판매 많은 순</option></select></div>" +
        '<p class="a-muted p-small">' + esc(span) + " · 판매 " + totN + "건 · 순매출 " + won(tot) + (prev ? " · 순위 변동은 바로 앞 같은 길이 기간과 비교" : "") + "</p></section>" +
      (podium.length ? '<div class="rk-pod">' + podium.map((x, i) => '<a class="rk-p rk-p' + (i + 1) + '" href="#/center/master/vod-classes"><span class="rk-no">' + (i === 0 ? icon("trophy", "sm") : "") + (i + 1) + '위</span>' + vdThumb(x.p, "card rk-th") + "<b>" + esc(x.p.title) + "</b><small>" + esc(x.p.creator || insName(x.p.iid) || "") + '</small><span class="rk-amt num">' + won(x.amt) + "</span><small>" + x.n + "건 · " + (tot ? Math.round(x.amt / tot * 100) : 0) + "% " + move(x, i) + "</small></a>").join("") + "</div>" : "") +
      '<section class="a-card"><div class="a-card-head"><h2>' + esc(label) + " 강의 순위</h2><span class=\"a-muted\">" + list.length + "개 강의</span></div>" +
        (list.length ? '<div class="a-table-wrap"><table class="a-table rk-table"><thead><tr><th>순위</th><th>강의</th><th>강사</th><th>종류</th><th class="right">판매</th><th class="right">순매출</th><th>비중</th></tr></thead><tbody>' +
          list.map((x, i) => '<tr><td class="rk-r"><b>' + (i + 1) + "</b> " + move(x, i) + '</td><td><div class="rk-t">' + vdThumb(x.p, "sm") + "<span><b>" + esc(x.p.title) + '</b><small class="a-memo">' + esc(kTxt(x)) + "</small></span></div></td><td>" + esc(x.p.creator || insName(x.p.iid) || "-") + "</td><td>" + esc(X.TYPE[X.typeOf(x.p)] ? X.TYPE[X.typeOf(x.p)][0] : "") + '</td><td class="right num">' + x.n + '건</td><td class="right num"><b>' + won(x.amt) + '</b></td><td class="rk-sh"><span class="fin-bar"><i style="width:' + (tot ? Math.round(x.amt / tot * 100) : 0) + '%"></i></span><small>' + (tot ? Math.round(x.amt / tot * 100) : 0) + "%</small></td></tr>").join("") +
        "</tbody></table></div>" : emptyBox("trophy", esc(span) + "에 팔린 강의가 없어요.")) + "</section>" +
      '<section class="a-card"><div class="a-card-head"><h2>강사 순위</h2><span class="a-muted">같은 기간 · 정산 예정은 강사 몫</span></div>' +
        (cur.ins.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>순위</th><th>강사</th><th class="right">강의 수</th><th class="right">판매</th><th class="right">순매출</th><th class="right">강사 정산 예정</th></tr></thead><tbody>' +
          cur.ins.sort((a, b) => (sort === "n" ? b.n - a.n : b.amt - a.amt)).map((x, i) => "<tr><td><b>" + (i + 1) + "</b></td><td><b>" + esc(vdKeyName(x.key)) + '</b></td><td class="right num">' + x.ps.size + '개</td><td class="right num">' + x.n + '건</td><td class="right num"><b>' + won(x.amt) + '</b></td><td class="right num">' + won(x.sh) + "</td></tr>").join("") +
        "</tbody></table></div>" : emptyBox("users", "같은 기간 판매가 없어요.")) + "</section>";
  }

  /* 광고비 · ROAS: 강사 · 강의 · 채널별 광고비를 적으면 강사 분담분이 그 달 정산에서 빠지고, 매출 대비 효율(ROAS)을 봐요 */
  const AD_CH = [["meta", "메타 (인스타 · 페북)"], ["youtube", "유튜브"], ["naver", "네이버"], ["google", "구글"], ["kakao", "카카오"], ["tiktok", "틱톡"], ["etc", "기타"]];
  const adChName = (k) => (AD_CH.find((x) => x[0] === k) || [k, k ? "기타" : "-"])[1];
  // 정산을 확정한 달은 광고비를 바꾸지 않아요 (확정한 명세서 숫자가 그대로라서 서로 어긋나요)
  const vdAdLocked = (iid, ym) => { const r = vdPayout(iid, ym); return !!(r && r.snap); };
  const vdRoas = (rev, ad) => (ad > 0 ? Math.round(rev / ad * 100) : null);
  const roasTxt = (n) => (n == null ? "-" : n.toLocaleString("ko-KR") + "%");
  function pageVodAds() {
    const v = VD(), X = VX(), thisM = todayStr().slice(0, 7), ym = ui.adYM || thisM, list = vdRateIns();
    const ads = (v.adSpend || []).filter((x) => x.ym === ym).sort((a, b) => String(b.day || b.ym).localeCompare(String(a.day || a.ym)) || (b.at || 0) - (a.at || 0));
    const tot = ads.reduce((a, x) => a + (Number(x.amount) || 0), 0), insPart = ads.reduce((a, x) => a + Math.round((Number(x.amount) || 0) * X.adSplitOf(x.iid) / 100 / 10) * 10, 0);
    const revOf = (pred) => vdSum(vdPaidIn(ym, pred)), revAll = revOf();
    const byIns = {}; ads.forEach((x) => { (byIns[x.iid] = byIns[x.iid] || []).push(x); });
    const byCh = {}; ads.forEach((x) => { const k = x.ch || "etc"; byCh[k] = (byCh[k] || 0) + (Number(x.amount) || 0); });
    const vodPs = v.products.filter((p) => X.typeOf(p) !== "ebook" && p.status !== "hidden" && p.iid);
    const dDef = ym === thisM ? todayStr() : ym + "-01";
    const yr = Number(ym.slice(0, 4)), yrows = Array.from({ length: 12 }, (_, i) => { const m = yr + "-" + String(i + 1).padStart(2, "0"), a = (v.adSpend || []).filter((x) => x.ym === m).reduce((s, x) => s + (Number(x.amount) || 0), 0), r = vdSum(vdPaidIn(m)); return { m, i, a, r }; });
    const ymax = Math.max(1, ...yrows.map((x) => Math.max(x.a, x.r)));
    return head("광고비 · ROAS", "VOD를 알리려고 쓴 광고비를 적어요. 강사 분담분(기본 50%)은 그 달 강사 정산에서 자동으로 빠지고, 강사센터 › 판매 정산에 내역이 그대로 보여요. ROAS = 그 달 매출 ÷ 광고비.", '<a class="a-btn a-btn-ghost" href="#/center/master/vod-rates">' + icon("sliders", "sm") + "광고비 분담 비율</a>") +
      '<section class="a-card">' + finNav("ad-ym", vdYMtxt(ym) + " 광고비") + '<span class="a-cal-sum">집행 <b>' + won(tot) + "</b> · 강사 분담 <b>" + won(insPart) + "</b> · 플랫폼 부담 <b>" + won(tot - insPart) + "</b> · ROAS <b>" + roasTxt(vdRoas(revAll, tot)) + "</b></span></div>" +
        '<form id="vda-ad-form" class="a-form vda-ad-f ad-f" novalidate><input type="hidden" name="ym" value="' + esc(ym) + '">' +
          '<div class="a-field"><label for="vda-ad-day">집행일</label><input class="a-input" id="vda-ad-day" name="day" type="date" value="' + esc(dDef) + '" min="' + ym + '-01" max="' + ym + "-" + String(new Date(yr, Number(ym.slice(5, 7)), 0).getDate()).padStart(2, "0") + '"></div>' +
          '<div class="a-field"><label for="vda-ad-iid">강사</label><select class="a-input" id="vda-ad-iid" name="iid">' + list.map((x) => '<option value="' + esc(x.id) + '">' + esc(x.displayName) + "</option>").join("") + "</select></div>" +
          '<div class="a-field"><label for="vda-ad-pid">광고한 강의 <small>(선택)</small></label><select class="a-input" id="vda-ad-pid" name="pid"><option value="">강사 전체 강의</option>' + vodPs.map((p) => '<option value="' + esc(p.id) + '" data-iid="' + esc(p.iid) + '"' + (list[0] && p.iid !== list[0].id ? " hidden" : "") + '>[' + esc(p.creator || insName(p.iid)) + "] " + esc(p.title) + "</option>").join("") + "</select></div>" +
          '<div class="a-field"><label for="vda-ad-ch">채널</label><select class="a-input" id="vda-ad-ch" name="ch">' + AD_CH.map((x) => '<option value="' + x[0] + '">' + esc(x[1]) + "</option>").join("") + "</select></div>" +
          '<div class="a-field"><label for="vda-ad-amt">광고비 (원)</label><input class="a-input" id="vda-ad-amt" name="amount" type="number" min="1000" step="1000" inputmode="numeric" placeholder="300000"></div>' +
          '<div class="a-field"><label for="vda-ad-memo">메모</label><input class="a-input" id="vda-ad-memo" name="memo" maxlength="60" placeholder="캠페인 이름 등"></div>' +
          '<button class="a-btn a-btn-primary" type="submit">' + icon("plus", "sm") + "광고비 적기</button><p class=\"a-error\" id=\"vda-ad-err\"></p></form>" +
        '<p class="a-muted p-small">' + icon("alert", "xs") + " 정산을 확정한 달의 강사 광고비는 바꿀 수 없어요. 고쳐야 하면 강사 정산에서 그 달 확정을 취소한 뒤 적어 주세요.</p></section>" +
      '<div class="fin-grid">' +
        '<section class="a-card"><div class="a-card-head"><h2>강사별</h2><span class="a-muted">' + vdYMtxt(ym) + " · ROAS = 그 강사 그 달 매출 ÷ 광고비</span></div>" +
          (Object.keys(byIns).length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>강사</th><th class="right">광고비</th><th class="right">강사 분담</th><th class="right">매출</th><th class="right">ROAS</th><th>정산</th></tr></thead><tbody>' +
            Object.keys(byIns).map((iid) => { const a = byIns[iid].reduce((s, x) => s + (Number(x.amount) || 0), 0), sp = X.adSplitOf(iid), sh = byIns[iid].reduce((s, x) => s + Math.round((Number(x.amount) || 0) * sp / 100 / 10) * 10, 0), rev = revOf((o) => vdKey(o) === iid);
              return "<tr><td><b>" + esc(insName(iid)) + '</b></td><td class="right num">' + won(a) + '</td><td class="right num">' + won(sh) + '<small class="a-memo">' + sp + '%</small></td><td class="right num">' + won(rev) + '</td><td class="right num"><b>' + roasTxt(vdRoas(rev, a)) + "</b></td><td>" + (vdAdLocked(iid, ym) ? pill("확정됨", "ok") : pill(ym < thisM ? "확정 전" : "집계 중", "mute")) + "</td></tr>"; }).join("") +
          "</tbody></table></div>" : emptyBox("megaphone", vdYMtxt(ym) + "에 적은 광고비가 없어요.")) + "</section>" +
        '<section class="a-card"><div class="a-card-head"><h2>채널별</h2><span class="a-muted">' + vdYMtxt(ym) + "</span></div>" +
          (tot ? '<ul class="fin-bars">' + AD_CH.filter((x) => byCh[x[0]]).map((x) => { const p = Math.round(byCh[x[0]] / tot * 100); return '<li><div class="fin-bh"><b>' + esc(x[1]) + '</b><span class="num">' + won(byCh[x[0]]) + '</span></div><span class="fin-bar"><i style="width:' + p + '%"></i></span><small>' + p + "%</small></li>"; }).join("") + "</ul>" : emptyBox("megaphone", "채널별로 보여 줄 광고비가 없어요.")) + "</section>" +
      "</div>" +
      '<section class="a-card"><div class="a-card-head"><h2>광고비 내역</h2><span class="a-muted">' + ads.length + "건</span></div>" +
        (ads.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>집행일</th><th>강사</th><th>강의</th><th>채널</th><th class="right">광고비</th><th class="right">강사 분담</th><th class="right">ROAS</th><th>메모</th><th class="right"></th></tr></thead><tbody>' +
          ads.map((x) => { const sp = X.adSplitOf(x.iid), me2 = Math.round((Number(x.amount) || 0) * sp / 100 / 10) * 10, p = x.pid ? vdP(x.pid) : null, lock = vdAdLocked(x.iid, x.ym);
            const rev = p ? revOf((o) => o.pid === p.id) : null, pAd = p ? ads.filter((y) => y.pid === p.id).reduce((s, y) => s + (Number(y.amount) || 0), 0) : 0;
            return '<tr><td class="vda-nw">' + esc(x.day ? fmtMD(x.day) : vdYMtxt(x.ym)) + "</td><td><b>" + esc(insName(x.iid)) + "</b></td><td>" + (p ? esc(p.title) : '<span class="a-muted">전체 강의</span>') + "</td><td>" + esc(adChName(x.ch)) + '</td><td class="right num">' + won(x.amount) + '</td><td class="right num">' + won(me2) + '<small class="a-memo">' + sp + '%</small></td><td class="right num">' + (p ? roasTxt(vdRoas(rev, pAd)) + '<small class="a-memo">이 강의</small>' : "-") + "</td><td>" + esc(x.memo || "") + '</td><td class="right">' + (lock ? pill("확정됨", "ok") : '<button type="button" class="a-icon-btn sm" data-action="vda-ad-del" data-id="' + esc(x.id) + '" aria-label="지우기">' + icon("trash", "sm") + "</button>") + "</td></tr>"; }).join("") +
        "</tbody></table></div>" : emptyBox("megaphone", vdYMtxt(ym) + "에 적은 광고비가 없어요. 위에서 적어 주세요.")) + "</section>" +
      '<section class="a-card"><div class="a-card-head"><h2>' + yr + '년 광고비 · 매출</h2><span class="a-muted">막대: 매출(진한) · 광고비(옅은) · 아래 숫자는 ROAS</span></div>' +
        '<div class="a-rev-chart ad-yc" aria-hidden="true">' + yrows.map((x) => '<div class="a-rev-col' + (x.m === thisM ? " now" : "") + '"><small class="num">' + roasTxt(vdRoas(x.r, x.a)).replace("-", "") + '</small><span class="a-rev-bar fin-yb"><i class="p" style="height:' + (x.a ? Math.max(3, Math.round(x.a / ymax * 100)) : 0) + '%"></i><i style="height:' + (x.r ? Math.max(3, Math.round(x.r / ymax * 100)) : 0) + '%"></i></span><b>' + (x.i + 1) + "월</b></div>").join("") + "</div></section>";
  }
  function pageVodSettle() {
    return head("강사 정산", "달마다 강사 · 크리에이터별 정산 명세를 확정하고, 세금계산서 · 지급까지 기록해요. 매달 1일~말일 판매분을 다음 달 10일에 지급해요.", '<a class="a-btn a-btn-ghost" href="#/center/master/vod-rates">' + icon("sliders", "sm") + "정산 비율 · 가격</a>") + vdSettle();
  }
  function pageVodRates() {
    return head("정산 비율 · 가격", "강사별 정산 비율 · 정산 기준 · 강사별 가격을 정해요. 광고비 분담 비율도 여기서 정하고, 실제 광고비는 ‘광고비 · ROAS’에 적어요.", '<a class="a-btn a-btn-ghost" href="#/center/master/vod-ads">' + icon("megaphone", "sm") + "광고비 · ROAS</a>") + vdRates();
  }
  // 예정 비율 (적용 시작일이 아직 안 온 마스터 확정)
  const vdRateNextTxt = (r) => (r.next ? fmtFull(DB.date.toStr(new Date(r.next.from))) + "부터 " + VX().RATE_KEYS.map((x) => x[1] + " " + r.next[x[0]] + "%").join(" · ") : "");
  function vdRateModal(key) {
    const X = VX(), r = X.rateOf(key), name = /^ext:/.test(key) ? key.slice(4) : insName(key);
    if (!name) return;
    const fi = (k, label, n, hint) => '<div class="a-field"><label for="vr-' + k + '">' + label + '</label><div class="vda-pct"><input class="a-input" id="vr-' + k + '" name="' + k + '" type="number" min="0" max="100" value="' + n + '" inputmode="numeric"><span>%</span></div><small class="a-muted">' + hint + "</small></div>";
    const hs = (h) => X.RATE_KEYS.map((x) => { const n = h[x[0]] != null && h[x[0]] !== "" ? h[x[0]] : x[0] === "coach" || x[0] === "tea" ? h.addon : h.vod; return x[1] + " " + (n == null || n === "" ? "-" : n + "%"); }).join(" · ") + " · 광고비 " + h.ad + "%";
    openModal(name + " 강사 정산 비율", '<form id="vda-rate-form" class="a-form" novalidate><input type="hidden" name="key" value="' + esc(key) + '">' +
      '<p class="a-muted">숫자는 <b>강사 몫</b>이에요. 기본은 강사 50 : 플랫폼 50. 확정하면 강사센터 › 판매 정산 · 대시보드에 바로 보이고, <b>적용 시작일</b>부터 결제한 주문을 이 비율로 정산해요.</p>' +
      '<div class="a-form-row vda-rgrid">' + X.RATE_KEYS.map((x) => fi(x[0], x[1], r[x[0]], x[2])).join("") + fi("ad", "광고비 분담", r.ad, "그 달 광고비 중 강사 부담") + "</div>" +
      '<div class="a-form-row"><div class="a-field"><label for="vr-from">적용 시작일</label><input class="a-input" id="vr-from" name="from" type="date" value="' + esc(todayStr()) + '"><small class="a-muted">이날 0시부터 결제한 주문에 적용 · 그 전 주문은 예전 비율</small></div>' +
        '<div class="a-field"><label for="vr-memo">계약 메모 <small>(강사에게도 보여요)</small></label><input class="a-input" id="vr-memo" name="memo" maxlength="80" value="' + esc(r.memo) + '" placeholder="예) 2027년 1월부터 VOD 60% · TEA TIME 100%"></div></div>' +
      (r.hist.length ? '<div class="vda-rhist"><small>지난 확정</small>' + r.hist.slice(-5).reverse().map((h) => "<span>" + esc(fmtFull(DB.date.toStr(new Date(h.from || h.at)))) + "부터 · " + esc(hs(h)) + "</span>").join("") + "</div>" : "") +
      '<p class="a-error" id="vr-error"></p></form>', btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="vda-rate-form">이 비율로 확정</button>', "md");
  }
  function saveVodRate(f) {
    const v = VD(), X = VX(), key = f.key.value, pc = (x) => { const n = Math.round(Number(x)); return x !== "" && n >= 0 && n <= 100 ? n : null; };
    const err = document.getElementById("vr-error"), vals = {};
    for (const x of X.RATE_KEYS.map((y) => y[0]).concat(["ad"])) { const n = pc(f[x].value); if (n == null) { err.textContent = "비율은 0~100 사이 숫자로 적어 주세요."; return; } vals[x] = n; }
    // 오늘을 고르면 바로 (해외에서 날짜가 한국보다 앞서도 지금부터)
    const from = f.from.value ? Math.min(Date.parse(f.from.value + "T00:00:00+09:00"), f.from.value <= todayStr() ? Date.now() : Infinity) : Date.now();
    if (!from) { err.textContent = "적용 시작일을 확인해 주세요."; return; }
    v.insRates = v.insRates || {};
    const prev = v.insRates[key] || {}, keep = (e) => { const o = {}; ["vod", "ebook", "book", "live", "coach", "tea", "addon", "ad", "at", "from", "by"].forEach((k) => { if (e[k] != null) o[k] = e[k]; }); return o; };
    const hist = (prev.hist || []).concat(prev.at ? [keep(prev)] : []).slice(-50);
    v.insRates[key] = Object.assign(vals, { addon: vals.coach, memo: f.memo.value.trim(), at: Date.now(), from, by: S && S.staffId ? (staffOf(S.staffId) || {}).name || "운영자" : "마스터", hist });
    const name = /^ext:/.test(key) ? key.slice(4) : insName(key);
    commit(name + " 강사 정산 비율을 확정했어요 (" + X.RATE_KEYS.map((x) => x[1] + " " + vals[x[0]] + "%").join(" · ") + " · " + fmtFull(DB.date.toStr(new Date(from))) + "부터).");
  }
  function saveVodTax(f) {
    const v = VD(), X = VX(), st = v.settings, pc = (x) => { const n = Math.round(Number(x)); return x !== "" && n >= 0 && n <= 100 ? n : null; }, rates = {};
    for (const x of X.RATE_KEYS) { const n = pc(f["r-" + x[0]].value); if (n == null) { toast("기본 비율은 0~100 사이 숫자로 적어 주세요.", "warn"); return; } rates[x[0]] = n; }
    const m = f.taxMode.value;
    st.taxMode = X.TAX_MODES[m] ? m : "gross";
    st.rates = rates;
    st.share = rates.vod; st.addonShare = rates.coach;
    commit("정산 · 세금계산서 기준을 저장했어요 (" + X.TAX_MODES[st.taxMode] + ").");
  }
  function saveVodPrice(f) {
    const p = vdP(f.dataset.id); if (!p) return;
    const num = (n) => { const x = f[n]; if (!x) return undefined; const t = String(x.value).trim(); if (t === "") return null; const v = Math.round(Number(t)); return v >= 0 ? v : NaN; };
    const price = num("price"), sale = num("sale"), cp = num("coachPrice"), cn = num("coachN"), tp = num("teaPrice"), tm = num("teaMin");
    if ([price, sale, cp, cn, tp, tm].some((x) => Number.isNaN(x))) { toast("가격은 0 이상 숫자로 적어 주세요.", "warn"); return; }
    if (price == null) { toast("정가를 적어 주세요.", "warn"); return; }
    if (sale != null && sale > price) { toast("판매가가 정가보다 비싸요. 확인해 주세요.", "warn"); return; }
    p.price = price; p.sale = sale;
    if (cp !== undefined) p.coach = Object.assign({}, p.coach || {}, { price: cp, n: cn || null });
    if (tp !== undefined) p.tea = Object.assign({}, p.tea || {}, { price: tp, min: tm || null, mode: "online" });
    p.updatedAt0 = Date.now();
    commit("‘" + p.title + "’ 가격을 저장했어요. 스토어에 바로 반영돼요.");
  }
  function saveVodAd(f) {
    const v = VD(), amt = Math.round(Number(f.amount.value)), err = document.getElementById("vda-ad-err"), iid = f.iid.value, pid = f.pid.value || "";
    const day = f.day ? f.day.value : "", ym = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.slice(0, 7) : f.ym.value;
    const no = (m) => { if (err) err.textContent = m; else toast(m, "warn"); };
    if (!iid || !DB.instructor(iid)) return no("강사를 골라 주세요.");
    if (f.day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return no("집행일을 골라 주세요.");
    if (!(amt > 0) || amt > 1e10) return no("광고비를 원 단위 숫자로 적어 주세요.");
    const p = pid ? vdP(pid) : null;
    if (pid && (!p || p.iid !== iid)) return no("고른 강의가 이 강사님 강의가 아니에요. 강의를 다시 골라 주세요.");
    if (vdAdLocked(iid, ym)) return no(insName(iid) + " 강사님 " + vdYMtxt(ym) + " 정산이 이미 확정됐어요. 강사 정산에서 확정을 취소한 뒤 적거나, 다음 달 광고비로 적어 주세요.");
    const ch = f.ch && AD_CH.some((x) => x[0] === f.ch.value) ? f.ch.value : "";
    (v.adSpend = v.adSpend || []).push(Object.assign({ id: DB.uid("ad"), iid, pid, ym, amount: amt, memo: f.memo.value.trim(), at: Date.now() }, day ? { day } : {}, ch ? { ch } : {}));
    if (ui.adYM && ui.adYM !== ym) ui.adYM = ym;
    commit(vdYMtxt(ym) + " 광고비 " + won(amt) + "을 적었어요. 강사 분담분은 그 달 정산에서 빠지고 강사센터에도 보여요.");
  }
  // 정산 명세서 (마스터 · 강사 같은 화면)
  /** 세금계산서 안내: 누가 누구에게 얼마로 (공급가액 + 부가세) — 사업자 강사만 */
  const vat10 = (n) => { const sup = Math.round(n / 1.1); return "공급가액 " + won(sup) + " + 부가세 " + won(n - sup); };
  function vdInvBox(st) {
    if (!st.biz || !(st.invIns > 0)) return "";
    const mode = st.mode || VX().taxMode();
    return '<div class="vs-inv"><b>' + icon("file", "xs") + " 세금계산서</b>" +
      '<div class="vs-inv-r"><span>강사님 → (주)두고홀딩스</span><strong>' + won(st.invIns) + "</strong><small>" + (mode === "gross" ? "판매가 합계(부가세 포함)로 발행 · " : mode === "net" ? "정산 금액(부가세 포함)으로 발행 · " : "정산 금액 + 부가세 10% · ") + vat10(st.invIns) + "</small></div>" +
      (st.invPf > 0 ? '<div class="vs-inv-r"><span>(주)두고홀딩스 → 강사님</span><strong>' + won(st.invPf) + "</strong><small>플랫폼 수수료" + (st.adDed ? " · 광고비 분담" : "") + (st.ded || st.carry ? " · 환불 · 이월 차감" : "") + " · " + vat10(st.invPf) + " · 두고홀딩스가 발행해요</small></div>" : "") +
      (st.invPf > 0 ? '<p class="a-muted p-small">' + won(st.invIns) + " − " + won(st.invPf) + " = 지급액 " + won(st.pay) + "</p>" : "") + "</div>";
  }
  function vdStmtModal(key, ym) {
    const st = vdStmt(key, ym), s = vdStState(st), X = VX(), pf = vdProf(key);
    const os = VD().orders.filter((o) => st.ids.indexOf(o.id) >= 0).sort((a, b) => a.paidAt - b.paidAt);
    const row = (t, v, cls) => '<div class="vs-dl-r' + (cls ? " " + cls : "") + '"><dt>' + t + "</dt><dd>" + v + "</dd></div>";
    const r = st.rec || {};
    openModal(st.name + " · " + vdYMtxt(ym) + " 정산 명세서",
      '<div class="vs-stmt"><div class="vs-stmt-top">' + pill(s.t, s.c) + "<span>" + (st.biz ? "사업자 · 세금계산서" : "개인 · 사업소득 3.3% 원천징수") + " · 지급일 " + fmtFull(vdPayDate(ym)) + "</span></div>" +
        '<dl class="vs-dl">' + row("판매", st.n + "건") + row("판매가 합계 (할인 전)", won(st.base)) + row("고객 결제액", won(st.paid)) + (st.base - st.paid > 0 ? row("플랫폼 부담 할인 (쿠폰 · 포인트)", won(st.base - st.paid)) : "") + row("공급가액 (판매가 ÷ 1.1)", won(st.supply)) + "</dl>" +
        '<div class="a-table-wrap"><table class="a-table vs-ch-table"><thead><tr><th>유입 · 상품</th><th class="right">건수</th><th class="right">판매가</th><th class="right">정산액</th></tr></thead><tbody>' +
          (Object.keys(st.ch).length ? Object.keys(st.ch).map((k) => "<tr><td>" + esc(X.CH_TXT[k] || k) + '</td><td class="right num">' + st.ch[k].n + '건</td><td class="right num">' + won(st.ch[k].base) + '</td><td class="right num">' + won(st.ch[k].ins) + "</td></tr>").join("") : '<tr><td colspan="4" class="a-muted">이 달 판매 없음</td></tr>') + "</tbody></table></div>" +
        '<dl class="vs-dl vs-dl-sum">' + row("강사 정산액", won(st.ins)) + (st.ded ? row("확정 뒤 환불 차감 (" + st.dedN + "건)", "- " + won(st.ded)) : "") + (st.adDed ? row("광고비 분담 (집행 " + won(st.adCost) + " × 강사 " + st.adPct + "%)", "- " + won(st.adDed)) : "") + (st.carry ? row("지난달에서 이월된 차감", "- " + won(st.carry)) : "") + row("정산 금액", won(st.net) + (st.biz && st.mode !== "supply" ? " (부가세 포함)" : ""), "b") + (st.biz ? (st.mode === "supply" ? row("부가세 10%", "+ " + won(st.vat)) : "") : row("원천징수 3.3% (소득세 3% · 지방세 0.3%)", "- " + won(st.wh))) + row("지급액", won(st.pay), "big") + (st.next ? row("다음 달 정산으로 이월", won(st.next) + " (다음 달 정산액에서 이어서 빼요)") : "") + "</dl>" +
        vdInvBox(st) +
        (os.length ? '<details class="vs-orders"><summary>주문 ' + os.length + "건 보기</summary>" + '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>결제일</th><th>주문번호</th><th>상품</th><th>구분</th><th class="right">판매가</th><th class="right">비율</th><th class="right">정산액</th></tr></thead><tbody>' +
          os.map((o) => "<tr><td>" + esc(fmtMD(DB.date.toStr(new Date(o.paidAt)))) + '</td><td><small class="num">' + esc(o.no) + "</small></td><td>" + esc(o.title) + (X.optTxt(o) ? '<small class="a-memo">' + esc(X.optTxt(o)) + "</small>" : "") + "</td><td>" + esc(X.CH_TXT[X.isAccess(o) ? o.ch || "web" : "addon"]) + '</td><td class="right num">' + won(X.baseOf(o)) + '</td><td class="right num">' + (o.share != null ? o.share : "-") + '%</td><td class="right num">' + won(X.insAmt(o)) + "</td></tr>").join("") + "</tbody></table></div></details>" : "") +
        '<ol class="vs-time">' + [["판매 월 마감", vdYMadd(ym, 1) + "-01" <= todayStr()], ["정산 확정", r.confirmedAt], [st.biz ? "세금계산서 " + (r.invoiceAt ? "수취" : r.invReqAt ? "발행 신고" : "") : "원천징수 처리", st.biz ? r.invoiceAt || r.invReqAt : r.confirmedAt], ["지급", r.st === "paid" || (!r.st && r.at) ? r.at : null]].map((x) => '<li class="' + (x[1] ? "on" : "") + '"><b>' + esc(x[0]) + "</b><small>" + (x[1] === true ? "완료" : x[1] ? esc(typeof x[1] === "number" ? DB.date.toStr(new Date(x[1])) : x[1]) : "대기") + "</small></li>").join("") + "</ol>" +
        (pf.account ? '<p class="a-muted p-small">' + icon("coins", "xs") + " 지급 계좌: " + esc(pf.bank || "") + " " + esc(pf.account) + " (" + esc(pf.holder || "") + ")" + (pf.bizNo ? " · 사업자 " + esc(pf.bizNo) : "") + "</p>" : '<p class="a-error">' + icon("alert", "xs") + " 정산 정보(계좌 · 개인/사업자)가 없어요. 강사센터 › 판매 정산 › 정산 받을 정보에서 등록해야 지급할 수 있어요.</p>") + "</div>",
      btn(icon("download", "sm") + "CSV", "vda-stcsv", "a-btn-ghost", ' data-m="' + esc(ym) + '" data-k="' + esc(key) + '"') + btn(icon("download", "sm") + "PDF", "vda-print", "a-btn-ghost") + btn("닫기", "modal-close", "a-btn-primary"), "lg");
  }
  function vdStmtCsv(ym, only) {
    const X = VX(), rows = [["판매월", "강사", "주문번호", "결제일", "상품", "구분", "판매가", "고객결제액", "공급가액", "정산비율", "정산액"]];
    vdStmtKeys(ym, only).forEach((st) => VD().orders.filter((o) => st.ids.indexOf(o.id) >= 0).forEach((o) => rows.push([ym, st.name, o.no, DB.date.toStr(new Date(o.paidAt)), o.title, X.CH_TXT[X.isAccess(o) ? o.ch || "web" : "addon"], X.baseOf(o), o.amount, X.supplyOf(o), o.share != null ? o.share : "", X.insAmt(o)])));
    const csv = "﻿" + rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "DOOGO-CLASS-정산-" + ym + (only ? "-" + vdKeyName(only) : "") + ".csv"; document.body.appendChild(a); a.click(); a.remove();
    toast("정산 명세 CSV를 내려받았어요.");
  }

  /* ---------- 2) VOD 클래스 관리 (목록 + 1~6단계 세팅) ---------- */
  /** 강사 스토어 노출: 끄면 그 강사의 클래스 · 배너 · 강사진 카드가 스토어에서 빠지고 새로 살 수 없어요 (클래스는 지우지 않아요) */
  function vdInsCard() {
    const X = VX(); if (!X.tkey) return "";
    const off = X.insOff(), map = {};
    VD().products.forEach((p) => { const k = X.tkey(p); if (!k) return; const t = (map[k] = map[k] || { k, name: p.creator || insName(p.iid), n: 0, live: 0, ph: "" }); t.n++; if (p.status === "on" || p.status === "soon") t.live++; if (!t.ph) t.ph = X.phOf(p); });
    const list = Object.keys(map).map((k) => map[k]).sort((a, b) => (off.indexOf(a.k) >= 0) - (off.indexOf(b.k) >= 0) || b.n - a.n);
    if (!list.length) return "";
    return '<section class="a-card vda-ins"><div class="a-card-head"><h2>강사 스토어 노출</h2><span class="a-muted">끄면 그 강사의 클래스 · 배너 · 강사진 카드가 스토어에서 빠지고 새로 살 수 없어요. 클래스는 지우지 않아서 다시 켜면 그대로 돌아와요. 이미 산 회원은 내 강의실에서 계속 들어요.</span></div><div class="vda-ins-g">' +
      list.map((t) => { const on = off.indexOf(t.k) < 0; return '<div class="vda-ins-i' + (on ? "" : " off") + '"><span class="vda-ins-ph">' + (t.ph ? '<img src="' + esc(t.ph) + '" alt="">' : "<em>" + esc((t.name || "?").slice(0, 1)) + "</em>") + "</span><div><b>" + esc(t.name) + "</b><small>" + (/^ext:/.test(t.k) ? "두잉고 계정 없는 강사 · " : "") + "클래스 " + t.n + "개" + (t.live ? " · 판매 · 오픈 예정 " + t.live + "개" : "") + "</small></div>" + (on ? pill("노출", "ok") : pill("미노출", "mute")) + '<button type="button" class="a-switch' + (on ? " on" : "") + '" data-action="vda-insoff" data-k="' + esc(t.k) + '" data-n="' + esc(t.name) + '" role="switch" aria-checked="' + on + '" aria-label="' + esc(t.name) + ' 스토어 노출"><i></i></button></div>'; }).join("") + "</div></section>";
  }
  function pageMasterVodClasses(r) {
    const id = r && r.parts[2];
    if (id) return vdEditor(id);
    ui.vdDraft = null;
    const ps = VD().products.slice().sort((a, b) => (a.status === "hidden") - (b.status === "hidden") || b.createdAt - a.createdAt);
    const sold = (p) => VX().paidOrders(p.id);
    return head("VOD 클래스 관리", "스토어에 올릴 VOD 클래스를 만들고 고쳐요. 기본 정보 → 가격 → 썸네일 → 소개 → 커리큘럼 → FAQ 순서로 채우면 바로 판매 페이지가 돼요.", vdStoreBtn() + btn(icon("plus", "sm") + "새 클래스 만들기", "vda-new", "a-btn-primary")) +
      '<div class="a-kpis">' +
        kpi("판매 중", ps.filter((p) => p.status === "on").length + "개", "전체 " + ps.length + "개", "#/center/master/vod-classes", "ok") +
        kpi("오픈 예정", ps.filter((p) => p.status === "soon").length + "개", "스토어에 ‘오픈 예정’으로 보여요", "#/center/master/vod-classes") +
        kpi("숨김", ps.filter((p) => p.status === "hidden").length + "개", "스토어에 안 보여요", "#/center/master/vod-classes") +
        kpi("할인 중", ps.filter((p) => VX().pctOf(p) > 0).length + "개", "마감일이 지나면 정가로 돌아가요", "#/center/master/vod-classes") +
      "</div>" + vdInsCard() +
      '<section class="a-card">' + (ps.length ? '<div class="a-table-wrap"><table class="a-table vda-table"><thead><tr><th>클래스</th><th>가격</th><th>상태</th><th>강의</th><th>판매</th><th class="right">매출</th><th>후기</th><th class="right">관리</th></tr></thead><tbody>' +
        ps.map((p) => { const st = VD_ST[p.status] || VD_ST.hidden, pr = VX().priceOf(p), pc = VX().pctOf(p), rt = VX().ratingOf(p.id), so = sold(p); return '<tr><td><div class="vda-cl">' + vdThumb(p) + '<div><b>' + esc(p.title) + '</b><small class="a-memo">' + esc(adTypeName(p)) + " · " + esc(p.creator || "-") + " · " + esc(VX().catOf(p.cat).label) + "</small>" + vdFunMemo(p) + (p.status === "soon" ? '<button type="button" class="vda-chip-btn" data-action="vda-alarm" data-id="' + esc(p.id) + '">' + icon("bell", "xs") + " 오픈 알림 " + vdAlarmOf(p.id).length + "명</button>" : "") + (VX().isEvent(p) ? '<button type="button" class="vda-chip-btn" data-action="vda-roster" data-id="' + esc(p.id) + '">' + icon("users", "xs") + " 신청자 명단 " + vdRoster(p.id).length + "명</button>" : "") + "</div></div></td><td>" + (pr === 0 ? "<b>무료</b>" : "<b>" + won(pr) + "</b>" + (pc ? '<small class="a-memo">' + (VX().ebOf(p) ? "얼리버드 · " : "") + pc + "% 할인 · 정가 " + won(p.price) + "</small>" : "")) + "</td><td>" + pill(st[0], st[1]) + (VX().insShown && !VX().insShown(p) ? '<small class="a-memo">' + pill("강사 미노출", "mute") + "</small>" : "") + '</td><td class="num">' + VX().lessons(p).length + '개</td><td class="num">' + so.length + "건" + (p.base ? '<small class="a-memo">표시 수강생 ' + VX().soldOf(p).toLocaleString() + "명</small>" : "") + '</td><td class="right num">' + won(vdSum(so)) + "</td><td>" + (rt.n ? "★ " + rt.avg.toFixed(1) + " (" + rt.n + ")" : '<span class="a-muted">-</span>') + '</td><td class="right"><button type="button" class="a-btn a-btn-ghost a-btn-sm" data-action="store-split" data-href="#/vod/p/' + esc(p.id) + '">보기</button><button type="button" class="a-btn a-btn-ghost a-btn-sm" data-action="vda-dup" data-id="' + esc(p.id) + '" title="이 클래스를 복사해서 새로 만들어요">' + icon("layers", "sm") + '복제</button><a class="a-btn a-btn-primary a-btn-sm" href="#/center/master/vod-classes/' + esc(p.id) + '">세팅</a></td></tr>'; }).join("") +
        "</tbody></table></div>" : emptyBox("monitorPlay", "아직 클래스가 없어요.", btn(icon("plus", "sm") + "새 클래스 만들기", "vda-new", "a-btn-primary"))) + "</section>";
  }
  /* 관리자 화면에서 부르는 상품 종류 (데이터는 그대로: live · offline)
   * LIVE 무료강의 = live + 0원 (유튜브 LIVE + 카톡 오픈채팅) · 온/오프라인 강의 = offline(현장) 또는 live + 유료(Zoom 온라인) */
  const adKind = (p) => { const t = VX().typeOf(p); return t === "live" ? (Number(p.price) > 0 ? "onoff" : "flive") : t === "offline" ? "onoff" : t; };
  const adWhere = (p) => (VX().typeOf(p) === "live" ? "online" : "offline");
  const AD_KIND = { vod: ["VOD 강의", "VOD"], ebook: ["전자책", "전자책"], book: ["종이책", "종이책"], flive: ["LIVE 무료강의", "무료 LIVE"], onoff: ["온/오프라인 강의", "온/오프"] };
  const adTypeName = (p) => (adKind(p) === "onoff" ? "온/오프라인 강의 · " + (adWhere(p) === "online" ? "온라인 Zoom" : "오프라인 현장") : AD_KIND[adKind(p)][0]);
  const adTypeShort = (p) => AD_KIND[adKind(p)][1];
  /* 오픈 알림 신청자 (오픈 예정 클래스에 ♡ 알림을 누른 회원) · LIVE · 온/오프라인 신청자 명단 · CSV */
  const vdAlarmOf = (pid) => VD().members.filter((m) => ((VD().likes || {})[m.id] || []).indexOf(pid) >= 0);
  const vdRoster = (pid) => VD().orders.filter((o) => o.pid === pid && (!o.kind || o.kind === "course") && (o.status === "paid" || o.status === "pending")).sort((a, b) => a.at - b.at);
  const vdPhoneOf = (o, m) => (o && o.buyer && o.buyer.phone) || (m && m.phone) || "";
  function vdCsvDl(name, rows) {
    const csv = rows.map((r) => r.map((c) => '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"').join(",")).join("\n");
    const l = document.createElement("a"); l.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" })); l.download = name + "-" + todayStr() + ".csv"; l.click();
  }
  function vdAlarmModal(pid) {
    const p = vdP(pid); if (!p) return;
    const ms = vdAlarmOf(pid), cps = (VD().coupons || []).filter((c) => c.on !== false);
    openModal("오픈 알림 신청자 · " + p.title, (ms.length ? '<p class="a-muted p-small">' + icon("bell", "xs") + " 오픈 예정 " + esc(p.openAt || "날짜 미정") + " · " + ms.length + "명이 알림을 신청했어요. 클래스를 ‘판매 중’으로 바꾸기 전에 알림 문자 · 카톡을 보내고, 오픈 할인 쿠폰을 넣어 주세요.</p>" +
        '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>이름</th><th>이메일</th><th>휴대폰</th><th>마케팅 동의</th></tr></thead><tbody>' + ms.map((m) => "<tr><td><b>" + esc(m.name) + "</b></td><td>" + esc(m.email) + "</td><td>" + esc(m.phone || "-") + "</td><td>" + (m.marketing ? pill("동의", "info") : '<span class="a-muted">-</span>') + "</td></tr>").join("") + "</tbody></table></div>" +
        '<div class="vda-al-cp"><label for="vda-al-cp">오픈 할인 쿠폰 보내기</label><select class="a-input" id="vda-al-cp">' + cps.map((c) => '<option value="' + esc(c.id) + '">' + esc(c.name) + "</option>").join("") + "</select>" + btn(icon("coins", "sm") + "신청자 모두에게 넣기", "vda-al-give", "a-btn-primary a-btn-sm", ' data-id="' + esc(pid) + '"') + "</div>" +
        '<div class="vda-al-msg"><label>알림 문구 (복사해서 문자 · 카톡으로 보내요)</label><textarea class="a-input" id="vda-al-txt" rows="3" readonly>[DOOGO CLASS] 알림 신청하신 ‘' + esc(p.title) + "’ 클래스가 열렸어요! 마이페이지 › 쿠폰에 오픈 할인 쿠폰을 넣어 드렸어요. 지금 확인해 보세요 👉 doogoclass.com/vod/p/" + esc(p.id) + "</textarea></div>"
      : emptyBox("bell", "아직 알림을 신청한 회원이 없어요.")), btn("닫기", "modal-close") + (ms.length ? btn(icon("download", "sm") + "CSV", "vda-al-csv", "a-btn-ghost", ' data-id="' + esc(pid) + '"') + btn(icon("clipboard", "sm") + "문구 복사", "vda-al-copy", "a-btn-ghost") : ""), "lg");
  }
  function vdRosterModal(pid) {
    const p = vdP(pid); if (!p) return;
    const os = vdRoster(pid), X = VX();
    openModal("신청자 명단 · " + p.title, '<p class="a-muted p-small">' + icon("calendar", "xs") + " " + esc(p.eventAt ? X.fmtEvent(p.eventAt, true) : "일시 미정") + " · " + esc(adTypeName(p)) + " · 신청 " + os.filter((o) => o.status === "paid").length + "명" + (os.some((o) => o.status === "pending") ? " · 입금 대기 " + os.filter((o) => o.status === "pending").length + "명" : "") + (Number(p.seats) ? " · 정원 " + p.seats + "명" : "") + " · 연락처는 신청할 때 적은 번호예요.</p>" +
      (os.length ? '<div class="a-table-wrap"><table class="a-table vda-roster"><thead><tr><th>#</th><th>이름</th><th>휴대폰</th><th>이메일</th><th>신청일</th><th>결제</th><th>출석</th></tr></thead><tbody>' + os.map((o, i) => { const m = vdMember(o.mid) || {}; return "<tr><td class=\"num\">" + (i + 1) + "</td><td><b>" + esc((o.buyer && o.buyer.name) || m.name || "-") + "</b></td><td>" + esc(vdPhoneOf(o, m) || "-") + "</td><td>" + esc(m.email || "") + "</td><td>" + esc(DB.date.toStr(new Date(o.at))) + "</td><td>" + (o.status === "pending" ? pill("입금 대기", "warn") : o.amount ? won(o.amount) : pill("무료", "info")) + '</td><td><button type="button" class="a-switch' + (o.attend ? " on" : "") + '" data-action="vda-attend" data-id="' + esc(o.id) + '" role="switch" aria-checked="' + !!o.attend + '" aria-label="출석"><i></i></button></td></tr>'; }).join("") + "</tbody></table></div>"
        : emptyBox("users", "아직 신청한 사람이 없어요.")), btn("닫기", "modal-close") + (os.length ? btn(icon("download", "sm") + "CSV 내려받기", "vda-roster-csv", "a-btn-primary", ' data-id="' + esc(pid) + '"') : ""), "lg");
  }
  /* 회원 상세: 주문 · 포인트(± 조정) · 쿠폰(지급 · 회수) · 기기(초기화) */
  function vdMemberModal(mid) {
    const v = VD(), m = vdMember(mid); if (!m) return;
    const os = v.orders.filter((o) => o.mid === mid).sort((a, b) => b.at - a.at), mcs = (v.memberCoupons || {})[mid] || [], cps = v.coupons || [], log = (m.pointLog || []).slice().sort((a, b) => b.at - a.at).slice(0, 8), dev = Array.isArray(m.devices) ? m.devices : [];
    const cpName = (cid) => (cps.find((c) => c.id === cid) || {}).name || "삭제된 쿠폰";
    openModal(m.name + " 님 회원 상세",
      '<dl class="vda-mem-dl"><div><dt>이메일</dt><dd>' + esc(m.email) + "</dd></div><div><dt>휴대폰</dt><dd>" + esc(m.phone || "-") + "</dd></div><div><dt>가입일</dt><dd>" + esc(DB.date.toStr(new Date(m.createdAt))) + "</dd></div><div><dt>마케팅</dt><dd>" + (m.marketing ? "동의" : "안 함") + "</dd></div></dl>" +
      '<h4 class="vda-mem-h">주문 ' + os.length + "건 · 결제 " + won(vdSum(os.filter((o) => o.status === "paid"))) + "</h4>" + (os.length ? '<ul class="vda-mem-list">' + os.slice(0, 8).map((o) => "<li><span>" + esc(DB.date.toStr(new Date(o.at))) + "</span><b>" + esc(o.title) + "</b>" + pill((VD_OST[o.status] || VD_OST.paid)[0], (VD_OST[o.status] || VD_OST.paid)[1]) + "<em>" + won(o.amount) + "</em></li>").join("") + "</ul>" : '<p class="a-muted p-small">주문이 없어요.</p>') +
      '<h4 class="vda-mem-h">포인트 <b>' + (Number(m.points) || 0).toLocaleString() + "P</b></h4>" +
      '<div class="vda-mem-row"><input class="a-input a-sm" id="vda-pt-amt" type="number" step="100" placeholder="예) 1000 또는 -500"><input class="a-input a-sm" id="vda-pt-why" maxlength="40" placeholder="사유 (회원에게 보여요)">' + btn("포인트 조정", "vda-pt", "a-btn-primary a-btn-sm", ' data-id="' + esc(mid) + '"') + "</div>" +
      (log.length ? '<ul class="vda-mem-list sm">' + log.map((x) => "<li><span>" + esc(DB.date.toStr(new Date(x.at))) + "</span><b>" + esc(x.why) + '</b><em class="' + (x.amt < 0 ? "minus" : "") + '">' + (x.amt > 0 ? "+" : "") + x.amt.toLocaleString() + "P</em></li>").join("") + "</ul>" : "") +
      '<h4 class="vda-mem-h">쿠폰 ' + mcs.length + "장</h4>" +
      (mcs.length ? '<ul class="vda-mem-list sm">' + mcs.map((x) => "<li><span>" + esc(DB.date.toStr(new Date(x.at))) + "</span><b>" + esc(cpName(x.cid)) + "</b>" + (x.usedAt ? pill("사용", "mute") : x.exp && x.exp < todayStr() ? pill("만료", "mute") : pill("~" + esc(x.exp || "기한 없음"), "info")) + (x.usedAt ? "" : btn("회수", "vda-mc-del", "a-btn-ghost a-btn-sm", ' data-id="' + esc(mid) + '" data-mc="' + esc(x.id) + '"')) + "</li>").join("") + "</ul>" : "") +
      '<div class="vda-mem-row"><select class="a-input a-sm" id="vda-mc-cid">' + cps.filter((c) => c.on !== false).map((c) => '<option value="' + esc(c.id) + '">' + esc(c.name) + "</option>").join("") + "</select>" + btn("쿠폰 지급", "vda-mc-add", "a-btn-ghost a-btn-sm", ' data-id="' + esc(mid) + '"') + "</div>" +
      '<h4 class="vda-mem-h">로그인 기기 ' + dev.length + "대</h4>" + (dev.length ? '<ul class="vda-mem-list sm">' + dev.map((x) => "<li><span>" + esc(x.kind || "") + "</span><b>" + esc(x.name || "기기") + "</b><em>마지막 " + esc(DB.date.toStr(new Date(x.last || x.first || Date.now()))) + "</em></li>").join("") + "</ul>" + btn(icon("refresh", "sm") + "기기 모두 초기화", "vda-dev-reset", "a-btn-ghost a-btn-sm", ' data-id="' + esc(mid) + '"') : '<p class="a-muted p-small">등록된 기기가 없어요.</p>'),
      btn("닫기", "modal-close"), "lg");
  }
  // 목록: 무료 LIVE ↔ 이어지는 유료 강의 표시
  const vdFunMemo = (p) => { const X = VX(); if (X.isFreeEv(p)) { const nx = p.next && X.product(p.next); return nx ? '<small class="vda-fun-memo">' + icon("arrowRight", "xs") + " 끝나면 ‘" + esc(nx.title) + "’" + (p.ebPrice ? " 얼리버드 " + won(p.ebPrice) : "") + "</small>" : ""; } const n = VD().products.filter((f) => X.isFreeEv(f) && f.next === p.id).length; return n ? '<small class="vda-fun-memo">' + icon("video", "xs") + " 무료 LIVE " + n + "회차에서 이어져요</small>" : ""; };
  const vdBlank = () => ({ id: "", title: "", sub: "", cat: (VX().cats()[0] || {}).key || "biz", iid: "", creator: "", price: 99000, sale: null, saleEnd: "", accessDays: 365, share: null, level: "입문", status: "hidden", openAt: "", badges: [], color: ["#1c1c1e", "#ff3b3b"], thumbText: "", hook: "", tagline: "", headline: "", likeBase: 0, thumb: "", who: [], learn: [], intro: "", introImg: "", creatorBio: "", curriculum: [{ id: "", title: "오리엔테이션", lessons: [{ id: "", title: "이 클래스로 얻게 될 것", min: 5, video: "", preview: true }] }], faq: [], base: 0, pains: [], before: [], after: [], type: "vod", pages: "", format: "PDF", file: "", eventAt: "", eventMin: 120, seats: "", place: "", link: "", replayDays: "", updatedAt: "" });
  function vdDraft(id) {
    if (!ui.vdDraft || ui.vdDraft.__id !== id) { const p = id === "new" ? vdBlank() : vdP(id); if (!p) return null; ui.vdDraft = Object.assign(DB.clone(p), { __id: id }); ui.vdDraft.faq = (ui.vdDraft.faq || []).map((x) => x.slice()); }
    return ui.vdDraft;
  }
  function vdEditor(id) {
    const d = vdDraft(id);
    const cph = !d ? "" : d.creatorPhoto === "none" ? "" : d.creatorPhoto || (VX() && VX().extPh ? VX().extPh(d.creator) : "");
    if (!d) return head("클래스를 찾을 수 없어요", "", '<a class="a-btn a-btn-ghost" href="#/center/master/vod-classes">목록으로</a>');
    const isNew = id === "new", f = (n, label, val, attrs, help) => '<div class="a-field"><label for="vda-' + n + '">' + label + "</label><input class=\"a-input\" id=\"vda-" + n + '" name="' + n + '" value="' + esc(val == null ? "" : val) + '"' + (attrs || "") + ">" + (help ? '<small class="a-muted">' + help + "</small>" : "") + "</div>";
    const ta = (n, label, val, rows, help, ph) => '<div class="a-field"><label for="vda-' + n + '">' + label + '</label><textarea class="a-input" id="vda-' + n + '" name="' + n + '" rows="' + (rows || 3) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : "") + ">" + esc(val || "") + "</textarea>" + (help ? '<small class="a-muted">' + help + "</small>" : "") + "</div>";
    const sec = (no, t, sub, body) => '<section class="a-card vda-sec" id="vda-s' + no + '"><div class="vda-sec-h"><span class="vda-no">' + no + "</span><div><h2>" + t + "</h2>" + (sub ? '<p class="a-muted">' + sub + "</p>" : "") + "</div></div>" + body + "</section>";
    const nav = [["1", "기본 정보"], ["2", "가격 · 기간 · 일정"], ["3", "썸네일"], ["4", "상세페이지 · 소개"], ["5", "커리큘럼 · 목차"], ["6", "FAQ"]];
    const ls = (d.curriculum || []).reduce((a, c) => a + (c.lessons || []).length, 0), mins = (d.curriculum || []).reduce((a, c) => a + (c.lessons || []).reduce((b, l) => b + (Number(l.min) || 0), 0), 0);
    return '<div class="vda-top"><a class="a-link" href="#/center/master/vod-classes">' + icon("arrowLeft", "xs") + " VOD 클래스 목록</a></div>" +
      head(isNew ? (d.dupOf ? "복사해서 새로 만들기" : "새 클래스 만들기") : "클래스 세팅", isNew ? (d.dupOf ? "‘" + esc((vdP(d.dupOf) || {}).title || "") + "’의 내용을 그대로 가져왔어요. 아래 노란 칸만 바꾸고 ‘클래스 만들기’를 누르면 새 클래스가 생겨요. (원본은 그대로예요)" : "1번부터 차례로 채우고 저장하면 목록에 생겨요. 처음에는 ‘숨김’으로 저장해 두고, 다 채운 뒤 ‘판매 중’으로 바꾸세요.") : esc(d.title), (isNew ? "" : vdStoreBtn("#/vod/p/" + esc(id), "판매 페이지 보기") + btn(icon("layers", "sm") + "복제", "vda-dup", "a-btn-ghost", ' data-id="' + esc(id) + '"')) + '<button class="a-btn a-btn-primary" type="submit" form="vda-form">' + icon("check", "sm") + "저장</button>") +
      (isNew && d.dupOf ? '<div class="vda-dup-note">' + icon("layers", "sm") + "<div><b>복사본에서 꼭 바꿀 것</b><span>" + (VX().isEvent(d) ? "클래스 이름 · 강의 일시(비워 뒀어요) · 유튜브 LIVE / Zoom 링크 · 오픈채팅방 링크 · 썸네일 큰 제목" : "클래스 이름 · 썸네일 · 강의 영상 링크 · 가격") + " · 판매 상태는 ‘숨김’으로 시작해요</span></div></div>" : "") +
      '<nav class="vda-steps" aria-label="세팅 단계">' + nav.map((x) => '<a href="#vda-s' + x[0] + '" data-action="vda-jump" data-to="vda-s' + x[0] + '"><b>' + x[0] + "</b>" + x[1] + "</a>").join("") + "</nav>" +
      '<div class="vda-edit"><form id="vda-form" class="a-form vda-form" data-id="' + esc(id) + '" data-type="' + adKind(d) + '" data-where="' + adWhere(d) + '" novalidate>' +
        sec(1, "기본 정보", "스토어 카드와 상세 페이지 맨 위에 보여요.",
          f("title", "클래스 이름 <small>(필수)</small>", d.title, ' maxlength="60" placeholder="예) 해외 건기식 브랜드, 재고 없이 0원으로 런칭하는 법"') +
          f("sub", "한 줄 소개", d.sub, ' maxlength="80" placeholder="상세 페이지 소개 첫 줄 · 검색에도 쓰여요"') +
          '<div class="a-field"><span class="a-label">상품 종류</span><div class="vda-radios vda-types">' + [["vod", "VOD 강의", "녹화 영상 · 수강 기간"], ["ebook", "전자책", "PDF 내려받기 · 평생 소장"], ["book", "종이책", "택배 배송 · 수량 · 배송지 · 송장 (전자책 메뉴에 보여요)"], ["flive", "LIVE 무료강의", "0원 · 유튜브 LIVE + 카톡 오픈채팅 · 끝나면 유료 강의로 이어 팔기"], ["onoff", "온/오프라인 강의", "유료 · 현장 강의 또는 Zoom 온라인 · 정원"]].map((x) => '<label class="vda-radio"><input type="radio" name="type" value="' + x[0] + '"' + (adKind(d) === x[0] ? " checked" : "") + "><span><b>" + x[1] + "</b><small>" + x[2] + "</small></span></label>").join("") + '</div><small class="a-muted">DOOGO CLASS는 VOD · 전자책이 중심이에요. LIVE 무료강의는 스토어 ‘무료 LIVE’에, 온/오프라인 강의는 ‘프리미엄 강의’에 보여요 (판매 영역을 켰을 때).</small></div>' +
          '<div class="a-form-row"><div class="a-field"><label for="vda-cat">카테고리</label><select class="a-input" id="vda-cat" name="cat">' + VD().cats.map((c) => '<option value="' + esc(c.key) + '"' + (c.key === d.cat ? " selected" : "") + ">" + esc(c.label) + (c.on === false ? " (숨김)" : "") + "</option>").join("") + "</select></div>" +
            f("level", "난이도", d.level, ' maxlength="20" placeholder="입문 · 초급 · 중급"') + "</div>" +
          '<div class="a-form-row"><div class="a-field"><label for="vda-iid">강사 (정산 받는 사람)</label><select class="a-input" id="vda-iid" name="iid">' + vdInsOpts(d.iid) + '</select><small class="a-muted">두잉고 강사를 고르면 그 강사센터 ‘내 VOD 판매’에 판매 · 정산이 보여요.</small></div>' +
            f("creator", "크리에이터 표시 이름", d.creator, ' maxlength="20" placeholder="비우면 강사 이름"') + "</div>" +
          '<div class="a-field vda-cph"><label for="vda-cph-file">강사 사진 <small>두잉고 계정이 없는 강사(예: 셀러훈)용 · 강사진 · 썸네일 · 강사 소개에 나와요. 두잉고 강사는 강사센터 브랜드 사진을 써요</small></label><div class="vda-cph-row"><span class="vda-cph-prev">' + (cph ? '<img src="' + esc(cph) + '" alt="">' : "<em>사진 없음</em>") + '</span><input class="a-input" id="vda-cph-file" type="file" accept="image/jpeg,image/png,image/webp" data-vda-img="creatorPhoto">' + (cph ? btn(icon("trash", "sm") + "사진 지우기", "vda-cph-del", "a-btn-ghost a-btn-sm") : "") + (cph && !d.creatorPhoto ? '<small class="a-muted">두고클래스가 넣어 둔 기본 사진이에요. 새 사진을 올리면 바뀌어요.</small>' : "") + "</div></div>" +
          '<div class="a-field"><span class="a-label">판매 상태</span><div class="vda-radios">' + [["on", "판매 중", "스토어에 보이고 바로 살 수 있어요"], ["soon", "오픈 예정", "보이지만 아직 살 수 없어요"], ["hidden", "숨김", "스토어에 안 보여요 (준비 중)"]].map((x) => '<label class="vda-radio"><input type="radio" name="status" value="' + x[0] + '"' + (d.status === x[0] ? " checked" : "") + "><span><b>" + x[1] + "</b><small>" + x[2] + "</small></span></label>").join("") + "</div></div>" +
          f("openAt", "오픈 예정일 <small>(‘오픈 예정’일 때 썸네일 · 카드에 보여요)</small>", d.openAt, ' type="date"') +
          '<div class="a-field"><span class="a-label">배지 <small>(카드 · 상세 가격 아래 · BEST 파랑 · NEW 주황 · 업데이트 레드)</small></span><div class="vda-checks">' + [["BEST", "BEST"], ["NEW", "NEW"], ["UPDATE", "업데이트"], ["HOT", "HOT"], ["NICE", "추천"]].map((b) => '<label class="a-check"><input type="checkbox" name="badge" value="' + b[0] + '"' + ((d.badges || []).indexOf(b[0]) >= 0 ? " checked" : "") + "><span>" + b[1] + "</span></label>").join("") + "</div></div>" +
          f("updatedAt", "최근 업데이트일 <small>(30일 동안 ‘업데이트’ 배지가 자동으로 붙어요)</small>", d.updatedAt, ' type="date"')) +
        sec(2, "가격 · 수강 기간 · 정산", "할인 마감일이 지나면 자동으로 정가로 팔려요. 0원이면 무료 특강이에요.",
          '<p class="vda-tf vda-tf-free">' + icon("video", "sm") + " LIVE 무료강의는 0원이에요. 가격은 아래 ‘LIVE가 끝나면 → 유료 강의로 이어 팔기’에서 얼리버드로 정해요.</p>" +
          '<div class="a-form-row vda-paid">' + f("price", "정가 (원)", d.price, ' type="number" min="0" step="1000" inputmode="numeric"') + f("sale", "할인가 (원)", d.sale == null ? "" : d.sale, ' type="number" min="0" step="1000" inputmode="numeric" placeholder="할인 없으면 비워 두세요"') + "</div>" +
          '<div class="a-form-row vda-paid">' + f("saleEnd", "할인 마감일", d.saleEnd, ' type="date"', "비우면 할인이 계속돼요") + f("accessDays", "무료 특강 수강 기간 (일) <small>VOD · 0원일 때만</small>", d.accessDays == null ? "" : d.accessDays, ' type="number" min="1" max="3650" inputmode="numeric" placeholder="비우면 기간 제한 없음"', "유료 VOD는 아래 수강권(180일 · 365일 · 3년)으로 팔고, 이 칸은 무료 특강에만 써요. 예전 주문(수강권 선택 전)도 이 기간으로 계산해요.") + "</div>" + vodPlanFields(d, f) +
          '<div class="vda-tf vda-tf-ebook"><div class="a-form-row">' + f("pages", "전자책 분량 (쪽)", d.pages, ' type="number" min="1" max="2000" inputmode="numeric"') + f("format", "파일 형식", d.format || "PDF", ' maxlength="10"') + "</div>" + f("file", "내려받기 파일 주소", d.file, ' maxlength="400" placeholder="https://… (구글 드라이브 · 드롭박스 공유 링크 등)"', "구매한 회원에게만 마이페이지 › 전자책에 보여요. 비우면 ‘준비 중’ 안내가 떠요.") +
            '<div class="vda-pdf">' + (isNew ? '<small class="a-muted">' + icon("alert", "xs") + " PDF 파일은 클래스를 한 번 저장한 뒤에 올릴 수 있어요 (산 회원만 받게 클래스에 묶어 둬요).</small>" : '<label class="a-btn a-btn-ghost a-btn-sm">' + icon("upload", "sm") + 'PDF 파일 올리기<input type="file" class="sr-only" accept="application/pdf,.pdf" data-vda-pdf="' + esc(id) + '"></label><small class="a-muted">' + (DB.remote && DB.remote.on ? "3MB" : "20MB") + " 이하 PDF는 여기서 바로 올려요. 올린 파일은 산 회원만 받을 수 있고, 내려받으면 주문에 ‘내려받음’이 남아 바로 취소가 막혀요. 더 큰 파일은 공유 링크를 위 칸에 넣어 주세요.</small>") + "</div></div>" +
          '<div class="vda-tf vda-tf-book"><p class="vda-tf-h">' + icon("truck", "sm") + "종이책 정보 <small>택배로 보내는 실물 도서 · 스토어 ‘전자책’ 메뉴에 함께 보여요</small></p>" +
            '<div class="a-form-row">' + f("author", "저자", d.author || "", ' maxlength="30" placeholder="비우면 크리에이터 이름"') + f("publisher", "출판사", d.publisher || "", ' maxlength="30"') + "</div>" +
            '<div class="a-form-row">' + f("bpages", "쪽수", d.type === "book" ? d.pages || "" : "", ' type="number" min="1" max="3000" inputmode="numeric" placeholder="예) 280"') + f("bsize", "판형", d.size || "", ' maxlength="30" placeholder="예) 152 × 225mm"') + "</div>" +
            '<div class="a-form-row">' + f("bpubDate", "출간일", d.pubDate || "", ' type="date"') + f("bisbn", "ISBN", d.isbn || "", ' maxlength="20" inputmode="numeric" placeholder="출판사에서 받으면 적어요"') + "</div>" +
            '<div class="a-form-row">' + f("shipFee", "배송비 (원 · 주문마다 한 번)", d.shipFee == null ? 0 : d.shipFee, ' type="number" min="0" step="500" inputmode="numeric"', "0원이면 ‘무료배송’으로 보여요") + f("stock", "재고 (권)", d.stock == null ? "" : d.stock, ' type="number" min="0" inputmode="numeric" placeholder="비우면 제한 없음"', "남은 권수가 0이 되면 ‘품절’로 바뀌고 살 수 없어요 (입금 대기 주문도 1권으로 세요)") + "</div>" +
            '<div class="a-field vda-cover"><label for="vda-cover-file">표지 이미지 <small>스토어 카드 · 상세 맨 위에 책으로 세워 보여요 (세로 표지 그대로)</small></label><div class="vda-cph-row"><span class="vda-cover-prev">' + (d.cover ? "<img " + VX().imgAttr(d.cover, "src") + ' alt="">' : "<em>표지 없음</em>") + '</span><input class="a-input" id="vda-cover-file" type="file" accept="image/jpeg,image/png,image/webp" data-vda-img="cover">' + (d.cover ? btn(icon("trash", "sm") + "표지 지우기", "vda-img-del", "a-btn-ghost a-btn-sm", ' data-k="cover"') : "") + "</div></div>" +
            '<p class="vda-book-law">' + icon("alert", "xs") + "<span><b>도서정가제</b> 할인가는 정가의 90% 이상으로만 정할 수 있고(최대 10% 할인), 종이책에는 쿠폰이 적용되지 않아요. 포인트는 쓸 수 있어요.</span></p>" +
            (d.iid && VX().insOff().indexOf(d.iid) >= 0 || (!d.iid && d.creator && VX().insOff().indexOf("ext:" + d.creator) >= 0) ? '<label class="a-check vda-showoff"><input type="checkbox" name="showOff"' + (d.showOff ? " checked" : "") + "><span>이 강사는 스토어 노출이 꺼져 있어요. 이 상품만은 스토어에 보이기</span></label>" : "") + "</div>" +
          '<div class="vda-tf vda-tf-event"><div class="a-form-row">' + f("eventAt", "강의 일시", d.eventAt, ' type="datetime-local"') + f("eventMin", "진행 시간 (분)", d.eventMin, ' type="number" min="10" max="1440" inputmode="numeric"') + '</div><div class="a-form-row">' + f("seats", "정원 (명)", d.seats, ' type="number" min="0" max="10000" inputmode="numeric" placeholder="비우면 제한 없음"', "입금 대기 주문도 자리를 차지해요.") + f("replayDays", "다시보기 제공 (일)", d.replayDays, ' type="number" min="0" max="365" inputmode="numeric" placeholder="없으면 비워 두세요"') + "</div>" +
            '<div class="vda-tf vda-tf-onoff"><span class="a-label">진행 방식</span><div class="vda-radios">' + [["offline", "오프라인 (현장)", "장소 · 준비물 안내 · 현장 출석"], ["online", "온라인 (Zoom)", "Zoom 링크 · 시작 10분 전부터 입장"]].map((x) => '<label class="vda-radio"><input type="radio" name="where" value="' + x[0] + '"' + (adWhere(d) === x[0] ? " checked" : "") + "><span><b>" + x[1] + "</b><small>" + x[2] + "</small></span></label>").join("") + "</div></div>" +
            '<div class="vda-tf vda-tf-live"><div class="a-field"><label for="vda-via">진행 방식</label><select class="a-input" id="vda-via" name="via"><option value="youtube"' + (d.via !== "zoom" ? " selected" : "") + '>유튜브 라이브 (오픈채팅방으로 모아서 진행 · 추천)</option><option value="zoom"' + (d.via === "zoom" ? " selected" : "") + ">Zoom 실시간</option></select></div>" +
              f("ytLive", "유튜브 라이브 링크", d.ytLive || "", ' maxlength="300" placeholder="https://www.youtube.com/live/…"', "강의 날부터 신청자 마이페이지에 ‘라이브 보기’ 버튼으로 열려요. 끝나면 다시보기 링크로 바꿔 두세요.") +
              "</div>" +
            '<div class="vda-tf vda-tf-zoom">' + f("link", "Zoom 입장 링크 (Zoom으로 진행할 때)", d.link, ' maxlength="300" placeholder="https://zoom.us/j/…"', "신청한 회원에게만 시작 10분 전부터 버튼으로 열려요.") + f("replayUrl", "다시보기 영상 링크 (끝난 뒤)", d.replayUrl || "", ' maxlength="300" placeholder="https://vimeo.com/… · https://youtu.be/…"', "넣으면 끝난 뒤 ‘다시보기 제공 (일)’ 동안 신청자 마이페이지 · 입장 안내에 버튼이 열려요.") + "</div>" +
            f("kakao", "카카오톡 오픈채팅방 링크 (LIVE 무료강의 · 온/오프라인 공통)", d.kakao || "", ' maxlength="300" placeholder="https://open.kakao.com/o/…"', "신청(결제)한 회원에게만 ‘오픈채팅 입장’ 버튼으로 보여요. 오픈채팅방에서 공지 · 유튜브 라이브 링크 · 장소를 알려요.") +
            vdFunnelFields(d, f) +
            '<div class="vda-tf vda-tf-offline">' + f("place", "장소", d.place, ' maxlength="120" placeholder="서울 강남구 테헤란로 … (자세한 주소는 신청 후 안내)"') + "</div></div>" +
          '<div class="a-form-row">' + f("share", "강사 정산 비율 (%)", d.share == null ? "" : d.share, ' type="number" min="0" max="100" inputmode="numeric" placeholder="비우면 강사별 비율 (' + (d.iid ? VX().rateOf(d.iid).vod : VD().settings.share) + '%)"', "이 강의만 따로 정할 때 · 비우면 강사별 확정 비율") + f("base", "기존 수강생 수 (표시용)", d.base || "", ' type="number" min="0" inputmode="numeric" placeholder="0"', "다른 곳에서 판매한 인원을 더해 보여 줄 때") + "</div>") +
        sec(3, "썸네일", "사진을 올리면 그 사진으로, 없으면 어두운 바탕 + 강조 띠 + 큰 제목(마지막 줄 포인트 색) + 강사 사진으로 자동으로 만들어요. 스토어 카드 · 상세 맨 위 · 내 강의실에 모두 16:9로 보여요.",
          '<div class="vda-thumb-row"><div class="vda-thumb-prev" id="vda-thumb-prev">' + vdThumb(d, "lg") + '</div><div class="vda-thumb-f">' +
            '<div class="a-field"><label for="vda-thumb-file">썸네일 사진 올리기</label><input class="a-input" id="vda-thumb-file" type="file" accept="image/jpeg,image/png,image/webp" data-vda-img="thumb">' + (d.thumb ? btn(icon("trash", "sm") + "사진 지우고 자동 썸네일 쓰기", "vda-img-del", "a-btn-ghost a-btn-sm", ' data-k="thumb"') : "") + "</div>" +
            specBox("권장 " + IMG_SPEC.thumb.w + " × " + IMG_SPEC.thumb.h + "px (16:9)", "JPG · PNG · WebP · 20MB 이하 · 다른 크기로 올려도 가운데를 기준으로 16:9로 잘라 " + IMG_SPEC.thumb.w + " × " + IMG_SPEC.thumb.h + "px로 자동으로 맞추고 압축해요. 글자 · 얼굴은 가장자리에서 10% 안쪽에 두세요. 최소 " + IMG_SPEC.thumb.min.join(" × ") + "px",
              d.thumb && d.thumbMeta ? '<em class="vda-spec-r' + (d.thumbMeta.small ? " warn" : "") + '">' + icon(d.thumbMeta.small ? "alert" : "check", "xs") + " 원본 " + esc(d.thumbMeta.src) + " → " + d.thumbMeta.w + " × " + d.thumbMeta.h + "px · " + (d.thumbMeta.size >= 1024 ? (d.thumbMeta.size / 1024).toFixed(1) + "MB" : d.thumbMeta.size + "KB") + (d.thumbMeta.small ? " · 원본이 작아 흐려 보일 수 있어요" : "") + "</em>" : "") +
            '<div class="a-form-row">' + f("c1", "바탕색", (d.color || [])[0] || "#1c1c1e", ' type="color"') + f("c2", "포인트 색", (d.color || [])[1] || "#ff3b3b", ' type="color"') + "</div>" +
            '<div class="vda-accs" role="group" aria-label="포인트 색 고르기">' + VX().ACC.map((c) => '<button type="button" class="vda-acc" style="--c:' + c + '" data-action="vda-acc" data-c="' + c + '" aria-label="포인트 색 ' + c + '"></button>').join("") + "</div>" +
            '<div class="a-form-row">' + f("hook", "강조 띠 문구", d.hook, ' maxlength="20" placeholder="예) 재고 0원 · 사업자 없이 시작"') + f("tagline", "강사 한 줄 소개", d.tagline, ' maxlength="24" placeholder="예) 뉴질랜드 건기식 브랜드 대표"') + "</div>" +
            ta("thumbText", "썸네일 큰 제목 <small>(두 줄 · 둘째 줄은 포인트 색)</small>", d.thumbText, 2, "", "예) 건기식 브랜드\n0원 런칭") +
          "</div></div>") +
        sec(4, "상세페이지 · 클래스 소개", "상세페이지 이미지(JPG)를 올리면 ‘강의 소개’에 크게 이어 붙여 보여요. 이미지 없이 쓰면 이 순서로 보여요: 큰 제목 → 고민 말풍선 → POINT(배워요) → 강의 전/후 → 추천 대상 → 상세 소개. ‘미리보기’를 켠 강의는 상세 ‘미리보기’ 칸에 모여요.",
          vdDimgBlock(d) +
          ta("headline", "소개 큰 제목 <small>(두 줄 · 둘째 줄은 포인트 색 · 어두운 띠에 보여요)</small>", d.headline, 2, "", "예) 해외 건기식 브랜드,\n0원으로 여는 법 알려드릴게요.") +
          ta("pains", "이런 고민, 있으셨죠? <small>(한 줄에 하나 · 말풍선으로 보여요 · 비우면 기본 문구)</small>", (d.pains || []).join("\n"), 3, "", "해외 소싱, 어디부터 연락해야 할지 모르겠어요") +
          ta("pitch", "강의 소개 글 <small>(상세 맨 위 제목 아래 · 위 ‘고민’ 문장을 따옴표로 앞에 붙여 보여요 · 비우면 한 줄 설명)</small>", d.pitch || "", 5, "‘그런 분들을 위해 OOO가 …을 공개합니다!’처럼 고민 → 해결 → 보너스 → 한마디 순서로 쓰면 좋아요.", "그런 분들을 위해 문대표가 재고 없이 0원으로 첫 브랜드를 런칭하는 전 과정을 공개합니다!") +
          f("tags", "해시태그 <small>(쉼표로 나눠요 · 최대 6개)</small>", (d.tags || []).join(", "), ' maxlength="120" placeholder="해외소싱, 건기식브랜드, 스마트스토어"') +
          '<div class="a-form-row">' + ta("before", "강의 전 <small>(BEFORE · 한 줄에 하나)</small>", (d.before || []).join("\n"), 3, "", "연락할 공급처 0곳") + ta("after", "강의 후 <small>(AFTER · 비우면 ‘배워요’ 앞 3개)</small>", (d.after || []).join("\n"), 3, "", "연락할 공급처 리스트 20곳") + "</div>" +
          ta("who", "이런 분들께 추천드려요 <small>(한 줄에 하나 · 상세 위쪽 체크 목록 · [21일만에]처럼 대괄호로 시작하면 굵게)</small>", (d.who || []).join("\n"), 5, "상세 페이지 맨 위 ‘강의 정보’ 아래에 체크 표시와 함께 보여요.", "[초급자] 월 100만~300만 원 정도 벌고 싶은 분") +
          ta("comment", "강사 코멘트 <small>(‘이런 분들께 추천드려요’ 옆 회색 상자 · 비우면 숨겨요)</small>", d.comment != null ? d.comment : (VX().cmtOf ? VX().cmtOf(d) : ""), 4, "강사님 말투로 2~3문장. 길면 상세에서 4줄까지 보이고 ‘더보기’로 펼쳐져요.", "이커머스를 배우고 싶다면 함께하세요. 아무것도 몰라도 상관없어요.") +
          f("updNote", "업데이트 약속 문구 <small>(‘최근 업데이트일’이 있으면 초록 상자로 보여요)</small>", d.updNote || "", ' maxlength="80" placeholder="새로운 방법이 나오면 강의와 자료를 무조건 업데이트해 드려요."') +
          ta("learn", "이 클래스에서 배워요 <small>(한 줄에 하나)</small>", (d.learn || []).join("\n"), 4, "", "해외 공급처를 찾고 첫 연락을 보내는 법") +
          ta("intro", "상세 소개", d.intro, 6, "빈 줄로 문단을 나눠요.") +
          ta("creatorBio", "크리에이터 소개", d.creatorBio, 3, "비우면 기본 문구가 보여요.")) +
        sec(5, "커리큘럼 · 목차 · 진행 순서", "챕터 " + (d.curriculum || []).length + "개 · 강의 " + ls + "개 · 총 " + VX().durTxt(mins) + " · 영상은 유튜브(일부 공개) · 비메오(vimeo.com/숫자 또는 비공개 링크) · mp4 주소를 넣어요. ‘미리보기’를 켠 강의는 구매 전에도 볼 수 있어요. 전자책은 ‘분’ 칸에 쪽수, LIVE · 오프라인은 진행 순서를 적어요.",
          (d.curriculum || []).map((c, ci) => '<div class="vda-ch"><div class="vda-ch-h"><b>' + String(ci + 1).padStart(2, "0") + '</b><input class="a-input" name="ch-' + ci + '" value="' + esc(c.title) + '" maxlength="60" placeholder="챕터 이름" aria-label="' + (ci + 1) + '번째 챕터 이름">' +
            '<button type="button" class="a-icon-btn" data-action="vda-ch-move" data-ci="' + ci + '" data-dir="-1" aria-label="챕터 위로"' + (ci === 0 ? " disabled" : "") + ">" + icon("arrowUp", "sm") + '</button><button type="button" class="a-icon-btn" data-action="vda-ch-move" data-ci="' + ci + '" data-dir="1" aria-label="챕터 아래로"' + (ci === d.curriculum.length - 1 ? " disabled" : "") + ">" + icon("arrowDown", "sm") + '</button><button type="button" class="a-icon-btn" data-action="vda-ch-del" data-ci="' + ci + '" aria-label="챕터 지우기">' + icon("trash", "sm") + "</button></div>" +
            '<div class="vda-ls-head" aria-hidden="true"><span>강의 이름</span><span>분</span><span>영상 주소</span><span>미리보기</span><span></span></div>' +
            (c.lessons || []).map((l, li) => { const k = ci + "-" + li; return '<div class="vda-ls"><input class="a-input" name="ls-' + k + '-t" value="' + esc(l.title) + '" maxlength="80" placeholder="강의 이름" aria-label="강의 이름"><input class="a-input" name="ls-' + k + '-m" value="' + esc(l.min || "") + '" type="number" min="0" max="600" inputmode="numeric" placeholder="분" aria-label="길이(분)"><input class="a-input" name="ls-' + k + '-v" value="' + esc(l.video || "") + '" maxlength="300" placeholder="유튜브 · 비메오 · mp4 주소" aria-label="영상 주소"><label class="vda-pv"><input type="checkbox" name="ls-' + k + '-p"' + (l.preview ? " checked" : "") + '><span>미리보기</span></label><button type="button" class="a-icon-btn" data-action="vda-ls-del" data-ci="' + ci + '" data-li="' + li + '" aria-label="강의 지우기">' + icon("x", "sm") + "</button>" +
              '<div class="vda-ls-x">' + DB.vdur.label(l.video, l.durSec, "", "vda-dur") + '<input class="a-input" name="ls-' + k + '-d" value="' + esc(l.desc || "") + '" maxlength="500" placeholder="강의 노트 (선택 · 강의 영상 아래에 보여요)" aria-label="강의 노트"></div><div class="vda-mat"><ul class="a-vl-fl">' + (l.files || []).map((x, fi) => matChip(x, ' data-action="vda-fdel" data-ci="' + ci + '" data-li="' + li + '" data-fi="' + fi + '"')).join("") + '</ul><div class="a-vl-add"><label class="a-btn a-btn-ghost a-btn-sm">' + icon("paperclip", "sm") + '수업 자료 올리기<input type="file" class="sr-only" multiple data-vda-up data-ci="' + ci + '" data-li="' + li + '" accept=".pdf,.xlsx,.xls,.csv,.docx,.doc,.hwp,.hwpx,.pptx,.ppt,.zip,.png,.jpg,.jpeg"></label><input class="a-input a-sm" name="ls-' + k + '-ln" placeholder="링크 자료 이름" aria-label="링크 자료 이름"><input class="a-input a-sm" name="ls-' + k + '-lu" type="url" placeholder="https://… (구글 드라이브 등)" aria-label="링크 주소">' + btn("링크 추가", "vda-flink", "a-btn-ghost a-btn-sm", ' data-ci="' + ci + '" data-li="' + li + '"') + "</div></div></div>"; }).join("") +
            btn(icon("plus", "sm") + "강의 추가", "vda-ls-add", "a-btn-ghost a-btn-sm vda-add", ' data-ci="' + ci + '"') + "</div>").join("") +
          btn(icon("plus", "sm") + "챕터 추가", "vda-ch-add", "a-btn-outline a-btn-block")) +
        sec(6, "자주 묻는 질문", "비워 두면 수강 기간 · 기기 안내가 기본으로 보여요.",
          (d.faq || []).map((q, i) => '<div class="vda-fq"><div class="vda-fq-in"><input class="a-input" name="fq-' + i + '-q" value="' + esc(q[0] || "") + '" maxlength="100" placeholder="질문" aria-label="질문"><textarea class="a-input" name="fq-' + i + '-a" rows="2" maxlength="500" placeholder="답변" aria-label="답변">' + esc(q[1] || "") + '</textarea></div><button type="button" class="a-icon-btn" data-action="vda-fq-del" data-i="' + i + '" aria-label="질문 지우기">' + icon("trash", "sm") + "</button></div>").join("") +
          btn(icon("plus", "sm") + "질문 추가", "vda-fq-add", "a-btn-outline a-btn-block")) +
        '<p class="a-error" id="vda-error"></p>' +
        '<div class="vda-bar">' + (isNew ? "" : btn(icon("trash", "sm") + "클래스 삭제", "vda-del", "a-btn-ghost vda-del", ' data-id="' + esc(id) + '"')) + '<a class="a-btn a-btn-ghost" href="#/center/master/vod-classes">취소</a><button class="a-btn a-btn-primary" type="submit">' + icon("check", "sm") + (isNew ? "클래스 만들기" : "저장") + "</button></div>" +
      '</form><aside class="vda-side"><div class="vda-prev" id="vda-prev">' + vdPrevHtml(d) + "</div></aside></div>";
  }
  function vdPrevHtml(d) {
    const p = Object.assign({}, d, { creator: d.creator || (d.iid ? insName(d.iid) : "") }), pr = VX().priceOf(p), pc = VX().pctOf(p), st = VD_ST[d.status] || VD_ST.hidden;
    return '<p class="vda-prev-h">스토어 카드 미리보기 ' + pill(st[0], st[1]) + '</p><div class="vda-prev-card">' + vdThumb(p, "card") + '<small>' + esc(p.creator || "크리에이터") + "</small><b>" + esc(d.title || "클래스 이름") + '</b><div class="vda-prev-price">' + (pr === 0 ? "<strong>무료</strong>" : (pc ? "<em>" + pc + "%</em>" : "") + "<strong>" + won(pr) + "</strong>" + (pc ? "<s>" + won(d.price) + "</s>" : "")) + "</div></div>" +
      '<ul class="vda-prev-chk">' + [[!!d.title, "클래스 이름"], [Number(d.price) >= 0 && d.price !== "", "가격"], [!!(d.thumb || d.thumbText), "썸네일"], [(d.learn || []).length > 0 && !!d.intro, "소개 · 배우는 것"], [(d.curriculum || []).some((c) => (c.lessons || []).length), "커리큘럼"], [(d.curriculum || []).some((c) => (c.lessons || []).some((l) => l.video)), "영상 연결"]].map((x) => '<li class="' + (x[0] ? "on" : "") + '">' + icon(x[0] ? "check" : "minus", "xs") + x[1] + "</li>").join("") + "</ul>";
  }
  const vdLines = (s) => String(s || "").split(/\n/).map((x) => x.trim()).filter(Boolean);
  /** 유료 VOD 편집: 수강권(180일 · 365일 · 3년) · 1:1 코칭권 · TEA TIME. 빈칸은 자동(판매가 × 배수) · 기본값 */
  function vodPlanFields(d, f) {
    const X = VX(), st = VD().settings, pl = d.plans || {}, co = d.coach || {}, te = d.tea || {}, sc = st.coach || {}, stt = st.tea || {};
    const ck = (name, on, label) => '<label class="a-check"><input type="checkbox" name="' + name + '"' + (on ? " checked" : "") + "><span>" + label + "</span></label>";
    return '<div class="vda-tf vda-tf-vod"><b class="vda-tf-h">' + icon("layers", "sm") + ' 수강권 · 부가 상품 <small>격차 방식 · 유료 VOD</small></b>' +
      '<div class="vda-plans">' + X.PLAN_DAYS.map((x) => { const c = pl[x[0]] || {}; return '<div class="vda-plan">' + ck("pl-" + x[0] + "-on", c.on !== false, "<b>" + x[1] + "</b> 수강권" + (x[0] === 365 ? " <em>추천</em>" : "")) + '<input class="a-input" name="pl-' + x[0] + '" type="number" min="0" step="1000" inputmode="numeric" value="' + (c.price == null || c.price === "" ? "" : esc(c.price)) + '" placeholder="비우면 판매가 × ' + x[2] + '" aria-label="' + x[1] + ' 수강권 가격"></div>'; }).join("") + "</div>" +
      '<small class="a-muted">비우면 180일 = 판매가, 365일 = × 1.1, 3년 = × 1.2 (천 원 단위). 상세 페이지에서 365일이 ‘추천’으로 먼저 골라지고, 하루 가격이 함께 보여요. 기간이 끝난 수강생은 1년 연장권(365일 가격의 ' + X.extendPct() + '%)으로 진도 그대로 이어서 들어요.</small>' +
      '<div class="vda-addon-f">' + ck("co-on", co.on !== false, "<b>1:1 코칭권</b> 판매") + '<div class="a-form-row">' + f("co-n", "횟수", co.n || "", ' type="number" min="1" max="50" inputmode="numeric" placeholder="' + (sc.n || 5) + '"') + f("co-days", "사용 기간 (일)", co.days || "", ' type="number" min="7" max="730" inputmode="numeric" placeholder="' + (sc.days || 180) + '"') + f("co-price", "가격 (원)", co.price == null ? "" : co.price, ' type="number" min="0" step="1000" inputmode="numeric" placeholder="' + (sc.price || 150000) + '"') + "</div></div>" +
      '<div class="vda-addon-f">' + ck("tea-on", te.on !== false, "<b>강사님과 TEA TIME</b> 판매") + '<div class="a-form-row">' + f("tea-min", "시간 (분)", te.min || "", ' type="number" min="15" max="240" step="15" inputmode="numeric" placeholder="' + (stt.min || 60) + '"') + f("tea-price", "가격 (원)", te.price == null ? "" : te.price, ' type="number" min="0" step="1000" inputmode="numeric" placeholder="' + (stt.price || 99000) + '"') +
        '<div class="a-field"><span class="a-label">진행 방식</span><p class="a-fixed">' + icon("video", "xs") + ' Zoom 온라인 화상으로만 진행해요 · 강사님이 일정을 확정할 때 Zoom 링크를 보내요</p><input type="hidden" name="tea-mode" value="online"></div></div></div>' +
      '<small class="a-muted">빈칸은 ‘전시 · 쿠폰 · 설정 › 수강권 · 부가 상품 기본값’을 따라요. 코칭권 · TEA TIME은 두잉고 VOD 버전이 열린 강의에서만 팔리고, 쿠폰은 수강권에만 적용돼요.</small></div>';
  }
  /* 무료 LIVE → 이어 팔기: 0원 LIVE · 설명회가 끝나면 고른 유료 강의를 얼리버드 가격으로 열어요 (스토어 쪽 규칙은 vod.js funnelOf) */
  function vdFunnelFields(d, f) {
    const X = VX(), ps = VD().products.filter((p) => p.id !== d.id && !X.isFreeEv(p) && Number(p.price) > 0);
    return '<div class="vda-fun"><b class="vda-tf-h">' + icon("sparkles", "sm") + " LIVE가 끝나면 → 유료 강의로 이어 팔기 <small>정가 0원(무료) LIVE · 설명회에서만 작동해요</small></b>" +
      '<div class="a-field"><label for="vda-next">이어지는 유료 강의</label><select class="a-input" id="vda-next" name="next"><option value="">연결 안 함 (무료 LIVE만 진행)</option>' + ps.map((p) => '<option value="' + esc(p.id) + '"' + (d.next === p.id ? " selected" : "") + ">[" + esc(adTypeShort(p)) + "] " + esc(p.title) + " · " + won(X.basePrice(p)) + (p.status === "hidden" ? " (숨김)" : p.status === "soon" ? " (오픈 예정)" : "") + "</option>").join("") + '</select><small class="a-muted">무료 LIVE와 유료 강의는 따로 만들고 여기서 이어요. 같은 유료 강의에 회차마다 무료 LIVE를 계속 이어 붙일 수 있어요.</small></div>' +
      '<div class="a-form-row">' + f("ebPrice", "얼리버드 가격 (원)", d.ebPrice || "", ' type="number" min="0" step="1000" inputmode="numeric" placeholder="비우면 할인 없이 연결만"', "VOD는 180일 수강권 기준이에요. 365일 · 3년 수강권도 같은 비율로 내려가요.") + f("ebDays", "얼리버드 기간 (LIVE 끝난 날부터 며칠)", d.ebDays || 3, ' type="number" min="1" max="60" inputmode="numeric"', "마지막 날 밤 12시가 지나면 원래 가격으로 돌아가요.") + "</div>" +
      '<label class="a-check vda-fun-gate"><input type="checkbox" name="gate"' + (d.gate ? " checked" : "") + "><span>LIVE가 끝날 때까지 유료 강의를 스토어 목록에서 숨기기 <small class=\"a-muted\">이번 LIVE를 위해 새로 만든 강의일 때만 켜세요. 이미 팔고 있는 VOD는 꺼 두세요.</small></span></label>" +
      '<p class="vda-fun-prev" id="vda-fun-prev">' + vdFunPrev(d) + "</p></div>";
  }
  function vdFunPrev(d) {
    const X = VX(), nx = d && d.next ? X.product(d.next) : null;
    if (!d || !nx) return icon("alert", "xs") + " 연결한 유료 강의가 없어요. LIVE가 끝나면 무료 LIVE 카드만 빠져요.";
    if (Number(d.price) > 0) return icon("alert", "xs") + " 정가를 0원으로 해야 무료 LIVE로 작동해요.";
    if (!d.eventAt) return icon("clock", "xs") + " 강의 일시를 정하면 얼리버드 기간을 계산해 보여 드려요.";
    const fn = X.funnelOf(Object.assign({}, d, { type: d.type === "offline" ? "offline" : "live", price: 0 })); if (!fn) return "";
    const end = new Date(fn.end), hm = String(end.getHours()).padStart(2, "0") + ":" + String(end.getMinutes()).padStart(2, "0"), base = X.basePrice(nx), eb = Number(d.ebPrice) || 0;
    return icon("sparkles", "xs") + " <b>" + esc(X.ebDayTxt(DB.date.toStr(end))) + " " + hm + "</b> LIVE 끝 → ‘" + esc(nx.title) + "’ " +
      (eb ? (eb < base ? "<b>얼리버드 " + won(eb) + "</b> (지금 판매가 " + won(base) + " · " + Math.round((1 - eb / base) * 100) + "% 할인)" : '<b class="red">얼리버드 가격이 지금 판매가(' + won(base) + ")보다 낮아야 해요</b>") : "할인 없이 연결") +
      " → <b>" + esc(X.ebDayTxt(fn.ebDay)) + " 밤 12시</b>까지" + (eb ? ", 그 뒤엔 원래 가격" : "") + (d.gate ? " · LIVE 전에는 유료 강의를 숨겨요" : "");
  }
  function vdSync(f) {
    const d = ui.vdDraft; if (!d || !f) return d;
    const dmEl = f.querySelector("input[name=detailMode]:checked"); if (dmEl) d.detailMode = dmEl.value;
    const v = (k) => (f[k] ? f[k].value.trim() : ""), num = (k) => (v(k) === "" ? null : Math.max(0, Math.round(Number(v(k)) || 0)));
    Object.assign(d, { title: v("title"), sub: v("sub"), cat: v("cat"), level: v("level"), iid: v("iid"), creator: v("creator"), status: (f.querySelector("input[name=status]:checked") || {}).value || "hidden",
      badges: Array.from(f.querySelectorAll("input[name=badge]:checked")).map((x) => x.value), price: num("price") == null ? 0 : num("price"), sale: num("sale"), saleEnd: v("saleEnd"), accessDays: num("accessDays") || null, share: v("share") === "" ? null : Math.min(100, num("share")), base: num("base") || 0,
      color: [v("c1") || "#1c1c1e", v("c2") || "#ff3b3b"], openAt: v("openAt"), hook: v("hook"), tagline: v("tagline"), headline: f.headline ? f.headline.value.replace(/\r/g, "").trim() : d.headline, thumbText: f.thumbText ? f.thumbText.value.replace(/\r/g, "").trim() : d.thumbText, who: vdLines(v("who")), comment: f.comment ? f.comment.value.replace(/\r/g, "").trim() : d.comment, updNote: f.updNote ? v("updNote") : d.updNote, learn: vdLines(v("learn")), pains: vdLines(v("pains")), pitch: f.pitch ? f.pitch.value.replace(/\r/g, "").trim() : d.pitch, tags: f.tags ? v("tags").split(/[,，]/).map((x) => x.trim().replace(/^#/, "")).filter(Boolean).slice(0, 6) : d.tags, before: vdLines(v("before")), after: vdLines(v("after")), intro: f.intro ? f.intro.value.replace(/\r/g, "").trim() : d.intro, creatorBio: v("creatorBio"),
      type: (f.querySelector("input[name=type]:checked") || {}).value || "vod", pages: num("pages") || "", format: v("format") || "PDF", file: v("file"), eventAt: v("eventAt"), eventMin: num("eventMin") || 120, seats: num("seats") || "", place: v("place"), link: v("link"), via: v("via") || "youtube", ytLive: v("ytLive"), replayUrl: v("replayUrl"), kakao: v("kakao"), replayDays: num("replayDays") || "", updatedAt: v("updatedAt") });
    if (d.type === "book") Object.assign(d, { author: v("author"), publisher: v("publisher"), pages: num("bpages") || "", size: v("bsize"), pubDate: v("bpubDate"), isbn: v("bisbn"), shipFee: num("shipFee") || 0, stock: v("stock") === "" ? "" : num("stock"), showOff: f.showOff ? !!f.showOff.checked : !!d.showOff });
    { const kind = d.type, where = (f.querySelector("input[name=where]:checked") || {}).value || "offline";
      d.type = kind === "flive" ? "live" : kind === "onoff" ? (where === "online" ? "live" : "offline") : kind;
      if (kind === "flive") Object.assign(d, { price: 0, sale: null, saleEnd: "" });
      if (kind === "onoff" && where === "online") d.via = "zoom"; }
    if (f.next) Object.assign(d, { next: v("next"), ebPrice: num("ebPrice") || "", ebDays: Math.max(1, Math.min(60, num("ebDays") || 3)), gate: !!(f.gate && f.gate.checked) });
    if (f["pl-180"]) { const pl = {}; VX().PLAN_DAYS.forEach((x) => { pl[x[0]] = { on: !!f["pl-" + x[0] + "-on"].checked, price: v("pl-" + x[0]) === "" ? null : num("pl-" + x[0]) }; }); d.plans = pl; }
    if (f["co-n"]) d.coach = { on: !!f["co-on"].checked, n: num("co-n") || null, days: num("co-days") || null, price: v("co-price") === "" ? null : num("co-price") };
    if (f["tea-min"]) d.tea = { on: !!f["tea-on"].checked, min: num("tea-min") || null, price: v("tea-price") === "" ? null : num("tea-price"), mode: "online" };
    (d.curriculum || []).forEach((c, ci) => { if (f["ch-" + ci]) c.title = f["ch-" + ci].value.trim(); (c.lessons || []).forEach((l, li) => { const k = "ls-" + ci + "-" + li; if (!f[k + "-t"]) return; l.title = f[k + "-t"].value.trim(); l.min = Math.max(0, Number(f[k + "-m"].value) || 0); l.video = f[k + "-v"].value.trim(); l.preview = f[k + "-p"].checked; if (f[k + "-d"]) { l.desc = f[k + "-d"].value.trim(); if (f[k + "-f"]) l.files = f[k + "-f"].value.split(",").map((x) => x.trim()).filter(Boolean).map((x) => { const i = x.indexOf("|"); return i > 0 ? { name: x.slice(0, i).trim(), url: x.slice(i + 1).trim() } : { name: x, url: "" }; }); } }); });
    (d.faq || []).forEach((q, i) => { if (f["fq-" + i + "-q"]) { q[0] = f["fq-" + i + "-q"].value.trim(); q[1] = f["fq-" + i + "-a"].value.trim(); } });
    return d;
  }
  function saveVodClass(f) {
    const d = vdSync(f), err = document.getElementById("vda-error"), id = f.dataset.id;
    const fail = (m, sel) => { err.textContent = m; const el = sel && f.querySelector(sel); if (el) { el.focus(); el.scrollIntoView({ block: "center" }); } toast(m, "warn"); };
    if (d.type === "vod" && (Number(d.price) || 0) > 0 && d.plans && !VX().PLAN_DAYS.some((x) => (d.plans[x[0]] || {}).on !== false)) return fail("수강권(180일 · 365일 · 3년)을 하나 이상 켜 주세요.", "[name=pl-365-on]");
    if (!d.title) return fail("클래스 이름을 적어 주세요.", "[name=title]");
    if (d.sale != null && d.sale >= d.price) return fail("할인가는 정가보다 낮아야 해요. 할인이 없으면 비워 주세요.", "[name=sale]");
    if (d.type === "book" && !(Number(d.price) > 0)) return fail("종이책은 정가를 적어 주세요.", "[name=price]");
    if (d.type === "book" && d.sale != null && d.sale < Math.ceil(d.price * 0.9 / 10) * 10) return fail("도서정가제에 따라 종이책 할인가는 정가의 90%(" + won(Math.ceil(d.price * 0.9 / 10) * 10) + ") 이상이어야 해요.", "[name=sale]");
    if (d.status === "on" && d.type !== "book" && !(d.curriculum || []).some((c) => (c.lessons || []).length)) return fail("‘판매 중’으로 열려면 강의(목차 · 진행 순서)를 1개 이상 넣어 주세요.", "#vda-s5");
    if ((d.type === "live" || d.type === "offline") && !d.eventAt) return fail("LIVE 무료강의 · 온/오프라인 강의는 강의 일시를 정해 주세요.", "[name=eventAt]");
    if (d.type === "offline" && !d.place) return fail("오프라인 강의 장소를 적어 주세요.", "[name=place]");
    if ((d.type === "live" || d.type === "offline") && d.next) {
      const nx = VX().product(d.next);
      if (Number(d.price) > 0) return fail("‘LIVE가 끝나면 이어 팔기’는 정가 0원(무료) LIVE에서만 써요. 정가를 0원으로 하거나 이어지는 강의를 ‘연결 안 함’으로 바꿔 주세요.", "[name=price]");
      if (!nx) return fail("이어지는 유료 강의를 다시 골라 주세요.", "[name=next]");
      if (d.ebPrice && d.ebPrice >= VX().basePrice(nx)) return fail("얼리버드 가격은 ‘" + nx.title + "’ 지금 판매가(" + won(VX().basePrice(nx)) + ")보다 낮아야 해요.", "[name=ebPrice]");
    }
    const bad = (d.curriculum || []).some((c) => !c.title || (c.lessons || []).some((l) => !l.title));
    if (bad) return fail("비어 있는 챕터 · 강의 이름을 채우거나 지워 주세요.", "#vda-s5");
    const pid = id === "new" ? "v" + Date.now().toString(36) : id;
    d.curriculum.forEach((c, ci) => { c.id = c.id || pid + "-c" + DB.uid("").slice(-5) + ci; c.lessons.forEach((l, li) => { l.id = l.id || pid + "-l" + DB.uid("").slice(-6) + ci + li; }); });
    d.faq = (d.faq || []).filter((q) => q[0] && q[1]);
    if (!d.creator && d.iid) d.creator = insName(d.iid);
    const clean = Object.assign({}, d); delete clean.__id; delete clean.dupOf;
    const list = VD().products;
    if (id === "new") { clean.id = pid; clean.createdAt = Date.now(); if (clean.status === "on") clean.openedAt = Date.now(); list.unshift(clean); }
    else { const i = list.findIndex((x) => x.id === id); if (i < 0) return fail("클래스를 찾을 수 없어요."); const was = list[i].status; list[i] = Object.assign({}, list[i], clean, { id }); if (clean.status === "on" && was !== "on" && !list[i].openedAt) list[i].openedAt = Date.now(); }
    ui.vdDraft = null;
    if (id === "new") ROUTE.replace("#/center/master/vod-classes/" + pid);
    commit("‘" + clean.title + "’ 클래스를 " + (id === "new" ? "만들었어요." : "저장했어요."));
  }
  /* 상세페이지 이미지 (JPG · PNG 여러 장): 올린 순서대로 위에서 아래로 이어 붙여 보여요. 시안은 이 브라우저(IndexedDB)에 저장 · 정식 서버는 파일 저장소 */
  const DM_OPTS = [["img-text", "이미지 → 기본 상세", "상세 이미지를 먼저, 아래에 지금 같은 소개(고민 · POINT · 추천 대상)"], ["img", "이미지만", "긴 상세페이지 이미지(JPG)만 보여요"], ["text-img", "기본 상세 → 이미지", "지금 소개 아래에 상세 이미지"], ["text", "기본 상세만", "이미지는 올려 둔 채 숨겨요"]];
  function vdDimgs(d) { if (!d.detailImgs) { d.detailImgs = d.introImg ? [{ url: d.introImg, name: "상세 이미지" }] : []; d.introImg = ""; } return d.detailImgs; }
  /* 이미지 최적화 규격: 스토어에서 보이는 크기의 2배로 맞춰 줄이고(썸네일은 16:9로 자르고) JPG로 압축해 IndexedDB(정식 서버는 파일 저장소)에 둬요 */
  const IMG_SPEC = { thumb: { w: 1280, h: 720, q: 0.86, min: [960, 540] }, dimg: { w: 860, slice: 3000, q: 0.9 }, cover: { w: 640, q: 0.88 } };
  const kbTxt = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + "MB" : Math.max(1, Math.round(n / 1024)) + "KB");
  const imgLoad = (file) => new Promise((ok, no) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => ok({ im, u }); im.onerror = () => { URL.revokeObjectURL(u); no(new Error("img")); }; im.src = u; });
  const cvBlob = (cv, q) => new Promise((ok) => cv.toBlob((b) => ok(b), "image/jpeg", q));
  // sp.h 가 있으면 정확히 w × h 로 가운데 기준 자르기, 없으면 가로 w 로 맞추고 세로가 긴 이미지는 sp.slice 씩 나눠요
  async function optImg(file, sp) {
    const { im, u } = await imgLoad(file), W0 = im.naturalWidth, H0 = im.naturalHeight, parts = [];
    const paint = async (W, H, sx, sy, sw, sh) => { const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const c = cv.getContext("2d"); c.imageSmoothingQuality = "high"; c.fillStyle = "#fff"; c.fillRect(0, 0, W, H); c.drawImage(im, sx, sy, sw, sh, 0, 0, W, H); const b = await cvBlob(cv, sp.q); if (b) parts.push({ blob: b, w: W, h: H }); };
    try {
      if (sp.h) { const r = sp.w / sp.h, sw = W0 / H0 > r ? H0 * r : W0, sh = W0 / H0 > r ? H0 : W0 / r; await paint(sp.w, sp.h, (W0 - sw) / 2, (H0 - sh) / 2, sw, sh); }
      else { const sc = Math.min(1, sp.w / W0), W = Math.round(W0 * sc), H = Math.round(H0 * sc), step = sp.slice && H > sp.slice * 1.3 ? sp.slice : H; for (let y = 0; y < H; y += step) { const h = Math.min(step, H - y); await paint(W, h, 0, y / sc, W0, h / sc); } }
    } finally { URL.revokeObjectURL(u); }
    if (!parts.length) throw new Error("blob");
    return { parts, w0: W0, h0: H0, bytes: parts.reduce((s, x) => s + x.blob.size, 0) };
  }
  const jpgName = (n, i, of) => String(n || "image").replace(/\.\w+$/, "") + (of > 1 ? "-" + String(i + 1).padStart(2, "0") : "") + ".jpg";
  const specBox = (title, body, extra) => '<div class="vda-spec">' + icon("image", "sm") + "<div><b>" + title + "</b><small>" + body + "</small>" + (extra || "") + "</div></div>";
  function vdDimgBlock(d) {
    const im = vdDimgs(d), mode = d.detailMode || "img-text";
    return '<div class="a-field vda-dimg" id="vda-dimg"><span class="a-label">상세페이지 이미지 <small>(JPG · PNG · 여러 장 · 올린 순서대로 위에서 아래로 이어 붙여 보여요)</small></span>' +
      '<div class="vda-radios vda-dm">' + DM_OPTS.map((o) => '<label class="vda-radio"><input type="radio" name="detailMode" value="' + o[0] + '"' + (mode === o[0] ? " checked" : "") + "><span><b>" + o[1] + "</b><small>" + o[2] + "</small></span></label>").join("") + "</div>" +
      (im.length ? '<ol class="vda-dimg-list">' + im.map((x, i) => '<li><span class="vda-dimg-no">' + (i + 1) + '</span><img ' + VX().imgAttr(x.url, "src") + ' alt=""><span class="vda-dimg-t"><b>' + esc(x.name || "상세 이미지 " + (i + 1)) + "</b><small>" + (x.w ? x.w + " × " + x.h + "px · " : "") + (x.size ? (x.size >= 1024 ? (x.size / 1024).toFixed(1) + "MB" : x.size + "KB") : /^idb:/.test(x.url) ? "" : esc(String(x.url).slice(0, 60))) + (x.src && x.part === 1 ? " · 원본 " + esc(x.src) : "") + "</small></span>" +
        '<span class="vda-dimg-tools"><button type="button" class="a-icon-btn sm" data-action="vda-dimg-move" data-i="' + i + '" data-dir="-1" aria-label="위로"' + (i === 0 ? " disabled" : "") + ">" + icon("arrowUp", "sm") + '</button><button type="button" class="a-icon-btn sm" data-action="vda-dimg-move" data-i="' + i + '" data-dir="1" aria-label="아래로"' + (i === im.length - 1 ? " disabled" : "") + ">" + icon("arrowDown", "sm") + '</button><button type="button" class="a-icon-btn sm" data-action="vda-dimg-del" data-i="' + i + '" aria-label="이미지 삭제">' + icon("trash", "sm") + "</button></span></li>").join("") + "</ol>" : '<p class="a-muted vda-dimg-empty">' + icon("image", "sm") + " 아직 상세 이미지가 없어요. 지금은 아래 ‘기본 상세’ 소개가 보여요.</p>") +
      '<div class="vda-dimg-add"><label class="a-btn a-btn-primary a-btn-sm">' + icon("image", "sm") + '이미지 올리기 (여러 장)<input type="file" class="sr-only" accept="image/jpeg,image/png,image/webp,image/gif" multiple data-vda-dimg></label>' +
        '<input class="a-input a-sm" id="vda-dimg-url" placeholder="또는 이미지 주소 https://… 붙여 넣기" aria-label="상세 이미지 주소">' + btn("주소로 추가", "vda-dimg-url", "a-btn-ghost a-btn-sm") + "</div>" +
      specBox("권장 가로 " + IMG_SPEC.dimg.w + "px · 세로 길이 자유", "JPG · PNG · GIF · 한 장 20MB 이하 · 파일 이름 순서(01.jpg, 02.jpg …)대로 들어가요. 올리면 가로 " + IMG_SPEC.dimg.w + "px로 자동으로 맞추고 압축해요. 세로가 " + IMG_SPEC.dimg.slice.toLocaleString() + "px보다 긴 이미지는 " + IMG_SPEC.dimg.slice.toLocaleString() + "px씩 나눠 빨리 열리게 하고, 화면에서는 한 장처럼 이어져 보여요. 저장을 눌러야 상세 페이지에 반영돼요.") + "</div>";
  }
  async function vdDimgAdd(input) {
    const form = document.getElementById("vda-form"), files = Array.from(input.files || []).sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true }));
    if (!files.length || !ui.vdDraft) return;
    vdSync(form);
    const im = vdDimgs(ui.vdDraft), X = VX(); let ok = 0, bad = 0, cut = 0;
    for (const f of files) {
      if (!/^image\//.test(f.type)) { bad++; continue; }
      if (f.size > X.MAT_MAX) { bad++; continue; }
      try {
        if (/gif$/.test(f.type)) { const r = await X.matPut(f); im.push({ url: r.url, name: f.name, size: r.size }); ok++; continue; }
        const o = await optImg(f, IMG_SPEC.dimg), g = DB.uid("dg");
        for (let i = 0; i < o.parts.length; i++) { const x = o.parts[i], r = await X.matPut(new File([x.blob], jpgName(f.name, i, o.parts.length), { type: "image/jpeg" })); im.push({ url: r.url, name: f.name + (o.parts.length > 1 ? " (" + (i + 1) + "/" + o.parts.length + ")" : ""), size: r.size, w: x.w, h: x.h, src: o.w0 + "×" + o.h0, grp: g, part: i + 1, of: o.parts.length }); }
        if (o.parts.length > 1) cut++; ok++;
      } catch (e) { bad++; }
    }
    render();
    toast(ok ? "상세 이미지 " + ok + "장을 가로 " + IMG_SPEC.dimg.w + "px로 맞췄어요." + (cut ? " 긴 이미지 " + cut + "장은 " + IMG_SPEC.dimg.slice.toLocaleString() + "px씩 나눠 빨리 열리게 했어요." : "") + " 저장을 눌러야 반영돼요." + (bad ? " (" + bad + "장은 이미지가 아니거나 20MB를 넘어 뺐어요)" : "") : "올릴 수 있는 이미지가 없어요. JPG · PNG · GIF 20MB 이하만 돼요.", ok ? "" : "warn");
  }
  async function vdImg(input) {
    const file = input.files && input.files[0], k = input.dataset.vdaImg, form = document.getElementById("vda-form");
    if (!file || !ui.vdDraft) return;
    if (!/^image\//.test(file.type)) { toast("이미지 파일만 올릴 수 있어요.", "warn"); return; }
    vdSync(form);
    if (k === "creatorPhoto") {
      input.value = "";
      try {
        // 배경을 뺀 PNG(누끼)는 그대로 PNG로, 나머지는 JPG로 — 가로 900px 안으로 줄여요
        const png = file.type === "image/png", bmp = await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = URL.createObjectURL(file); });
        const sc = Math.min(1, 900 / bmp.width), cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * sc); cv.height = Math.round(bmp.height * sc); cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
        const blob = await new Promise((ok) => cv.toBlob(ok, png ? "image/png" : "image/jpeg", 0.86));
        // 정식 서버: 파일 저장소 주소 · 시안: 그림 그대로(data URL) — 화면이 바로 <img> 로 보여요
        ui.vdDraft.creatorPhoto = DB.remote && DB.remote.on ? (await VX().matPut(new File([blob], png ? "creator.png" : "creator.jpg", { type: blob.type }))).url : cv.toDataURL(png ? "image/png" : "image/jpeg", 0.86);
        render(); toast("강사 사진을 올렸어요. 저장을 눌러야 반영돼요.");
      } catch (e) { toast("사진을 올리지 못했어요. JPG · PNG로 다시 올려 주세요.", "warn"); }
      return;
    }
    if (k === "cover") {
      input.value = "";
      if (file.size > VX().MAT_MAX) { toast("20MB 이하 이미지만 올릴 수 있어요.", "warn"); return; }
      try {
        // 세로 표지: 자르지 않고 가로 640px 안으로 줄여 JPG로
        const o = await optImg(file, IMG_SPEC.cover), x = o.parts[0], r = await VX().matPut(new File([x.blob], jpgName(file.name, 0, 1), { type: "image/jpeg" }));
        ui.vdDraft.cover = r.url; render(); toast("표지를 올렸어요 (" + x.w + " × " + x.h + "px). 저장을 눌러야 반영돼요.");
      } catch (e) { toast("표지를 올리지 못했어요. JPG · PNG로 다시 올려 주세요.", "warn"); }
      return;
    }
    if (k === "thumb") {
      const sp = IMG_SPEC.thumb; input.value = "";
      if (file.size > VX().MAT_MAX) { toast("20MB 이하 이미지만 올릴 수 있어요.", "warn"); return; }
      try {
        const o = await optImg(file, sp), x = o.parts[0], r = await VX().matPut(new File([x.blob], jpgName(file.name, 0, 1), { type: "image/jpeg" }));
        ui.vdDraft.thumb = r.url; ui.vdDraft.thumbMeta = { src: o.w0 + "×" + o.h0, w: x.w, h: x.h, size: r.size, small: o.w0 < sp.min[0] || o.h0 < sp.min[1] };
        render(); toast("썸네일을 " + sp.w + " × " + sp.h + "px · " + kbTxt(x.blob.size) + "로 맞췄어요." + (ui.vdDraft.thumbMeta.small ? " 원본이 작아서 조금 흐려 보일 수 있어요." : "") + " 저장을 눌러야 반영돼요.", ui.vdDraft.thumbMeta.small ? "warn" : "");
      } catch (e) { toast("사진을 읽지 못했어요. JPG · PNG로 다시 올려 주세요.", "warn"); }
      return;
    }
    const max = k === "thumb" ? 1200 : 1400, rd = new FileReader();
    rd.onload = () => { const img = new Image(); img.onload = () => {
      let w = img.width, h = img.height, cv = document.createElement("canvas");
      if (k === "thumb") { const r = 4 / 3, sw = w / h > r ? h * r : w, sh = w / h > r ? h : w / r; cv.width = Math.min(max, Math.round(sw)); cv.height = Math.round(cv.width / r); cv.getContext("2d").drawImage(img, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, cv.width, cv.height); }
      else { const sc = Math.min(1, max / w); cv.width = Math.round(w * sc); cv.height = Math.round(h * sc); cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height); }
      ui.vdDraft[k] = cv.toDataURL("image/jpeg", 0.82); render(); toast(k === "thumb" ? "썸네일을 올렸어요. 저장을 눌러야 반영돼요." : "상세 이미지를 올렸어요. 저장을 눌러야 반영돼요.");
    }; img.onerror = () => toast("사진을 읽지 못했어요.", "warn"); img.src = rd.result; };
    rd.readAsDataURL(file);
  }

  /* ---------- 3) VOD 회원 · 후기 ---------- */
  function pageMasterVodMembers() {
    const v = VD(), tab = ui.vdMt || "reviews", q = (ui.vdMq || "").trim().toLowerCase();
    const buys = (m) => v.orders.filter((o) => o.mid === m.id && o.status === "paid");
    const members = v.members.filter((m) => !q || (m.name + " " + m.email + " " + (m.phone || "")).toLowerCase().indexOf(q) >= 0).sort((a, b) => b.createdAt - a.createdAt);
    const rv = v.reviews.slice().sort((a, b) => b.at - a.at), pl = (v.pledges || []).slice().sort((a, b) => b.at - a.at), iq = (v.inquiries || []).slice().sort((a, b) => (!a.answer ? 0 : 1) - (!b.answer ? 0 : 1) || b.at - a.at);
    const body = tab === "inquiries"
      ? (iq.length ? '<div class="a-table-wrap"><table class="a-table vda-table"><thead><tr><th>문의일</th><th>회원</th><th>종류</th><th>문의 내용</th><th>상태</th><th class="right">관리</th></tr></thead><tbody>' +
          iq.map((x) => { const m = vdMember(x.mid) || {}; return '<tr><td class="vda-nw">' + esc(DB.date.toStr(new Date(x.at))) + '</td><td class="vda-nw"><b>' + esc(m.name || "탈퇴 회원") + '</b><small class="a-memo">' + esc(m.email || "") + '</small></td><td class="vda-nw">' + esc(x.cat) + '</td><td class="vda-rv"><b>' + esc(x.title) + "</b><br>" + esc(x.text) + (x.answer ? '<small class="a-memo">답변: ' + esc(x.answer) + "</small>" : "") + "</td><td>" + (x.answer ? pill("답변 완료", "ok") : pill("답변 대기", "warn")) + '</td><td class="right">' + btn(x.answer ? "답변 고치기" : "답변하기", "vda-iq", x.answer ? "a-btn-ghost a-btn-sm" : "a-btn-primary a-btn-sm", ' data-id="' + esc(x.id) + '"') + "</td></tr>"; }).join("") + "</tbody></table></div>" : emptyBox("headset", "아직 1:1 문의가 없어요."))
      : tab === "pledges"
      ? (pl.length ? '<div class="a-table-wrap"><table class="a-table vda-table"><thead><tr><th>작성일</th><th>클래스</th><th>별명</th><th>다짐 한마디</th><th>공감</th><th>상태</th><th class="right">관리</th></tr></thead><tbody>' +
          pl.map((x) => { const p = vdP(x.pid) || {}; return "<tr" + (x.hidden ? ' class="a-dim"' : "") + '><td class="vda-nw">' + esc(DB.date.toStr(new Date(x.at))) + "</td><td>" + esc(p.title || "삭제된 클래스") + '</td><td class="vda-nw">' + esc(x.nick) + (x.mid && vdMember(x.mid) ? '<small class="a-memo">' + esc(vdMember(x.mid).name) + "</small>" : "") + '</td><td class="vda-rv">' + esc(x.text) + '</td><td class="num">' + (x.up || 0) + "</td><td>" + (x.hidden ? pill("숨김", "mute") : pill("공개", "ok")) + '</td><td class="right">' + btn(x.hidden ? "다시 보이기" : "숨기기", "vda-pl-hide", "a-btn-ghost a-btn-sm", ' data-id="' + esc(x.id) + '"') + "</td></tr>"; }).join("") + "</tbody></table></div>" : emptyBox("message", "아직 다짐 한마디가 없어요."))
      : tab === "reviews"
      ? (rv.length ? '<div class="a-table-wrap"><table class="a-table vda-table"><thead><tr><th>작성일</th><th>클래스</th><th>작성자</th><th>별점</th><th>내용</th><th>상태</th><th class="right">관리</th></tr></thead><tbody>' +
          rv.map((r) => { const p = vdP(r.pid) || {}; return "<tr" + (r.hidden ? ' class="a-dim"' : "") + "><td>" + esc(DB.date.toStr(new Date(r.at))) + "</td><td>" + esc(p.title || "삭제된 클래스") + "</td><td>" + esc(r.name) + '</td><td class="num">' + "★".repeat(r.rating) + '<span class="a-muted">' + "★".repeat(5 - r.rating) + '</span></td><td class="vda-rv">' + esc(r.text) + "</td><td>" + (r.hidden ? pill("숨김", "mute") : pill("공개", "ok")) + '</td><td class="right">' + btn(r.hidden ? "다시 보이기" : "숨기기", "vda-rv-hide", "a-btn-ghost a-btn-sm", ' data-id="' + esc(r.id) + '"') + "</td></tr>"; }).join("") + "</tbody></table></div>" : emptyBox("star", "아직 후기가 없어요."))
      : '<p class="crm-move">' + icon("users", "sm") + '<span>가입 방식 · 단계 · 구매 · 쿠폰 · 포인트 · 소식 받기 동의까지 보는 자세한 회원 관리는 <a class="a-link" href="#/center/master/vod-crm">회원 DB</a>에서 해요.</span></p>' + (members.length ? '<div class="a-table-wrap"><table class="a-table vda-table"><thead><tr><th>이름</th><th>이메일</th><th>휴대폰</th><th>가입일</th><th>구매</th><th>마케팅</th><th>상태</th><th class="right">관리</th></tr></thead><tbody>' +
          members.map((m) => { const b = buys(m); return "<tr" + (m.blocked ? ' class="a-dim"' : "") + "><td><b>" + esc(m.name) + "</b></td><td>" + esc(m.email) + "</td><td>" + esc(m.phone || "-") + "</td><td>" + esc(DB.date.toStr(new Date(m.createdAt))) + '</td><td class="num">' + b.length + "건" + (b.length ? '<small class="a-memo">' + won(vdSum(b)) + "</small>" : "") + "</td><td>" + (m.marketing ? pill("동의", "info") : '<span class="a-muted">-</span>') + "</td><td>" + (m.blocked ? pill("이용 중지", "bad") : pill("정상", "ok")) + '</td><td class="right">' + btn("상세", "vda-mem", "a-btn-ghost a-btn-sm", ' data-id="' + esc(m.id) + '"') + btn(m.blocked ? "중지 풀기" : "이용 중지", "vda-block", "a-btn-ghost a-btn-sm", ' data-id="' + esc(m.id) + '"') + "</td></tr>"; }).join("") + "</tbody></table></div>" : emptyBox("users", "조건에 맞는 회원이 없어요."));
    return head("후기 · 다짐 · 문의", "DOOGO CLASS 회원이 남긴 수강 후기 · 다짐 한마디 · 1:1 문의를 관리해요. 회원 정보 · 구매 · 쿠폰 · 포인트 · 메시지는 ‘회원 DB’에서 해요.", '<a class="a-btn a-btn-ghost" href="#/center/master/vod-crm">' + icon("users", "sm") + "회원 DB</a>" + vdStoreBtn()) +
      '<div class="a-kpis">' +
        kpi("VOD 회원", v.members.length + "명", "이번 달 가입 " + v.members.filter((m) => vdYM(m.createdAt) === todayStr().slice(0, 7)).length + "명", "#/center/master/vod-crm", "ok") +
        kpi("구매한 회원", v.members.filter((m) => buys(m).length).length + "명", "1번 이상 결제", "#/center/master/vod-crm") +
        kpi("마케팅 동의", v.members.filter((m) => m.marketing).length + "명", "할인 · 새 클래스 알림 대상", "#/center/master/vod-crm") +
        kpi("평균 별점", v.reviews.filter((r) => !r.hidden).length ? (v.reviews.filter((r) => !r.hidden).reduce((a, r) => a + r.rating, 0) / v.reviews.filter((r) => !r.hidden).length).toFixed(1) : "-", "공개 후기 " + v.reviews.filter((r) => !r.hidden).length + "개", "#/center/master/vod-members") +
      "</div>" +
      '<section class="a-card"><div class="a-toolbar"><div class="a-tabs">' + [["reviews", "후기", v.reviews.length], ["pledges", "다짐 한마디", (v.pledges || []).length], ["inquiries", "1:1 문의", (v.inquiries || []).filter((x) => !x.answer).length], ["members", "회원 간단 목록", v.members.length]].map((t) => '<button type="button" class="a-tab' + (tab === t[0] ? " on" : "") + '" data-action="vda-mt" data-k="' + t[0] + '">' + t[1] + ' <span class="num">' + t[2] + "</span></button>").join("") + "</div>" +
        (tab === "members" ? '<div class="a-filters"><div class="a-search">' + icon("search", "sm") + '<input class="a-input a-sm" id="vda-mq" type="search" placeholder="이름 · 이메일 · 휴대폰" value="' + esc(ui.vdMq || "") + '"></div></div>' : "") + "</div>" + body + "</section>";
  }

  /* ---------- DOOGO CLASS 대시보드 (마스터 · DOOGO CLASS 탭 첫 화면) ---------- */
  function pageMasterDc() {
    const v = VD(), X = VX(), t = todayStr(), ym = t.slice(0, 7);
    const todayO = v.orders.filter((o) => o.status === "paid" && o.paidAt && DB.date.toStr(new Date(o.paidAt)) === t), mon = vdPaidIn(ym), pend = v.orders.filter((o) => o.status === "pending");
    const byT = (k) => vdSum(mon.filter((o) => { const ty = X.typeOf(vdP(o.pid) || {}); return k === "event" ? ty === "live" || ty === "offline" : ty === k; }));
    const iq = (v.inquiries || []).slice().sort((a, b) => b.at - a.at), iqOpen = iq.filter((x) => !x.answer), newM = v.members.filter((m) => vdYM(m.createdAt) === ym).length, rec = vdRecruitNew();
    const top = v.products.map((p) => ({ p, n: v.orders.filter((o) => o.pid === p.id && o.status === "paid").length, amt: vdSum(v.orders.filter((o) => o.pid === p.id && o.status === "paid")) })).filter((x) => x.n).sort((a, b) => b.amt - a.amt).slice(0, 5);
    const coOpen = DB.data.instructors.reduce((a, ins) => a + DB.requests(ins.id).filter((x) => DB.isVodStudent(x.s) && !x.q.answer).length, 0), teaReq = X.teasOf(null, null).filter((o) => o.status === "paid" && (o.tea || {}).st === "req").length;
    const mix = [["180일 수강권", (o) => X.kindOf(o) === "course" && Number(o.days) === 180], ["365일 수강권", (o) => X.kindOf(o) === "course" && Number(o.days) === 365], ["3년 수강권", (o) => X.kindOf(o) === "course" && Number(o.days) === 1095], ["1년 연장권", (o) => X.kindOf(o) === "extend"], ["1:1 코칭권", (o) => X.kindOf(o) === "coach"], ["TEA TIME", (o) => X.kindOf(o) === "tea"]].map((x) => { const os = mon.filter(x[1]); return [x[0], os.length, vdSum(os)]; });
    const alarmN = v.products.filter((p) => p.status === "soon").reduce((s, p) => s + vdAlarmOf(p.id).length, 0);
    const todo = [[pend.length, "입금 확인 대기", "무통장 주문 입금을 확인해 주세요", "#/center/master/vod"], [vdRefReqs().length, "환불 요청", "회원 · 강사가 요청한 환불을 처리해 주세요", "#/center/master/vod?of=refreq"], [vdShipAll().filter((o) => o.status === "paid" && ["ready", "prep"].indexOf(VX().shipStOf(o)) >= 0).length, "보낼 종이책", "신규 주문 · 배송 준비 중인 종이책을 보내 주세요", "#/center/master/vod-ship"], [vdShipAll().filter(boClaimOn).length, "종이책 취소 · 반품 · 교환", "회원 요청을 승인 · 환불 · 반려해 주세요", "#/center/master/vod-ship"], [alarmN, "오픈 알림 신청", "오픈 예정 클래스 알림 신청자에게 오픈 소식 · 쿠폰을 보내요", "#/center/master/vod-classes"], [coOpen, "답변 대기 1:1 코칭 질문", "강사별 코칭 질문 답변이 밀리지 않았는지 확인해요", "#/center/master/vod?tab=care"], [teaReq, "TEA TIME 일정 확정 대기", "강사가 희망 날짜를 보고 확정해야 해요", "#/center/master/vod?tab=care"], [iqOpen.length, "답변 대기 1:1 문의", "고객센터 문의에 답해 주세요", "#/center/master/vod-inquiries"], [rec, "새 강사 모집 지원", "DOOGO CLASS 강사 지원서를 확인해 주세요", "#/center/master/vod-recruit"], [v.products.filter((p) => p.status === "soon").length, "오픈 예정 클래스", "오픈 일정 · 알림 신청 수를 확인해요", "#/center/master/vod-classes"]];
    return head("DOOGO CLASS 대시보드", "VOD 스토어의 주문 · 매출 · 회원 · 1:1 문의를 한눈에 봐요. 두잉고(강사 플랫폼) 운영은 왼쪽 위 ‘두잉고’ 탭에서 해요.", vdStoreBtn("#/vod", "스토어 미리보기")) +
      '<div class="a-kpis">' +
        kpi("오늘 결제", todayO.length + "건", won(vdSum(todayO)), "#/center/master/vod", todayO.length ? "ok" : "") +
        kpi("이번 달 매출", won(vdSum(mon)), "VOD " + won(byT("vod")) + " (부가 " + won(vdSum(mon.filter((o) => !X.isAccess(o)))) + ") · 전자책 " + won(byT("ebook")) + (byT("book") ? " · 종이책 " + won(byT("book")) : "") + " · LIVE · 오프 " + won(byT("event")), "#/center/master/vod-sales") +
        kpi("입금 대기", pend.length + "건", won(vdSum(pend)), "#/center/master/vod", pend.length ? "warn" : "") +
        kpi("1:1 문의 대기", iqOpen.length + "건", "이번 달 가입 " + newM + "명", "#/center/master/vod-inquiries", iqOpen.length ? "warn" : "") +
      "</div>" +
      '<section class="a-card"><div class="a-card-head"><h2>' + icon("checks", "sm") + ' 오늘 할 일</h2></div><ul class="a-dc-todo">' + todo.map((x) => '<li class="' + (x[0] ? "on" : "") + '"><b class="num">' + x[0] + "</b><div><strong>" + esc(x[1]) + "</strong><small>" + esc(x[2]) + '</small></div><a class="a-link" href="' + x[3] + '">바로 가기 ' + icon("arrowRight", "xs") + "</a></li>").join("") + "</ul></section>" +
      '<section class="a-card"><div class="a-card-head"><h2>' + icon("layers", "sm") + ' 수강권 · 부가 상품 <small class="a-muted">이번 달 결제 완료</small></h2><a class="a-link" href="#/center/master/vod-display">기본값 설정 ' + icon("arrowRight", "xs") + '</a></div><div class="a-dc-mix">' + mix.map((x) => "<div" + (x[1] ? "" : ' class="off"') + "><small>" + esc(x[0]) + '</small><b class="num">' + x[1] + '건</b><span class="num">' + won(x[2]) + "</span></div>").join("") + "</div></section>" +
      '<div class="a-grid-2">' +
        '<section class="a-card"><div class="a-card-head"><h2>최근 주문</h2><a class="a-link" href="#/center/master/vod">전체 ' + icon("arrowRight", "xs") + "</a></div>" +
          (v.orders.length ? '<ul class="a-list">' + v.orders.slice().sort((a, b) => b.at - a.at).slice(0, 6).map((o) => { const st = VD_OST[o.status] || VD_OST.paid; return '<li><div class="a-who"><span class="a-avatar">' + esc(String((vdMember(o.mid) || {}).name || "?").slice(0, 1)) + "</span><div><b>" + esc(o.title) + "</b><small>" + esc((vdMember(o.mid) || {}).name || "-") + " · " + esc(DB.date.toStr(new Date(o.at))) + " · " + won(o.amount) + "</small></div></div>" + pill(st[0], st[1]) + "</li>"; }).join("") + "</ul>" : emptyBox("inbox", "아직 주문이 없어요.")) + "</section>" +
        '<section class="a-card"><div class="a-card-head"><h2>최근 1:1 문의</h2><a class="a-link" href="#/center/master/vod-inquiries">전체 ' + icon("arrowRight", "xs") + "</a></div>" +
          (iq.length ? '<ul class="a-list">' + iq.slice(0, 6).map((x) => '<li class="clickable" data-action="vda-iq" data-id="' + esc(x.id) + '"><div class="a-who"><span class="a-avatar">' + esc(String((vdMember(x.mid) || {}).name || "?").slice(0, 1)) + "</span><div><b>" + esc(x.title) + "</b><small>" + esc(x.cat) + " · " + esc((vdMember(x.mid) || {}).name || "-") + " · " + esc(DB.date.toStr(new Date(x.at))) + "</small></div></div>" + (x.answer ? pill("답변 완료", "ok") : pill("답변 대기", "warn")) + "</li>").join("") + "</ul>" : emptyBox("headset", "아직 들어온 문의가 없어요.")) + "</section>" +
      "</div>" +
      '<section class="a-card"><div class="a-card-head"><h2>잘 팔리는 클래스</h2><a class="a-link" href="#/center/master/vod-classes">클래스 관리 ' + icon("arrowRight", "xs") + "</a></div>" +
        (top.length ? '<ul class="a-list">' + top.map((x, i) => '<li><div class="vda-cl"><b class="a-dc-rank">' + (i + 1) + "</b>" + vdThumb(x.p) + "<div><b>" + esc(x.p.title) + '</b><small class="a-memo">' + esc(x.p.creator || "") + " · " + esc(X.TYPE[X.typeOf(x.p)][0]) + "</small></div></div><span class=\"num\"><b>" + won(x.amt) + "</b> · " + x.n + '건</span><button type="button" class="a-btn a-btn-ghost a-btn-sm" data-action="store-split" data-href="#/vod/p/' + esc(x.p.id) + '">보기</button></li>').join("") + "</ul>" : emptyBox("monitorPlay", "아직 판매가 없어요.")) + "</section>";
  }
  /* ---------- DOOGO CLASS 고객센터 1:1 문의 (스토어 마이페이지 › 고객센터에서 남긴 문의가 여기로 와요) ---------- */
  function pageMasterVodInquiries() {
    const v = VD(), all = (v.inquiries || []).slice().sort((a, b) => (!a.answer ? 0 : 1) - (!b.answer ? 0 : 1) || b.at - a.at), f = ui.vdIqF || "open";
    const list = all.filter((x) => (f === "open" ? !x.answer : f === "done" ? !!x.answer : true));
    const done = all.filter((x) => x.answer && x.answeredAt), avgH = done.length ? Math.round(done.reduce((a, x) => a + (x.answeredAt - x.at), 0) / done.length / 36e5) : null;
    const cats = {}; all.forEach((x) => { cats[x.cat] = (cats[x.cat] || 0) + 1; });
    return head("고객센터 1:1 문의", "DOOGO CLASS 회원이 마이페이지 › 고객센터에서 남긴 문의예요. 답변하면 회원 마이페이지에 바로 보여요. (두잉고 수강생의 1:1 요청은 각 강사센터로 가요)", vdStoreBtn("#/vod/my/help", "고객센터 화면 보기")) +
      '<div class="a-kpis">' +
        kpi("답변 대기", all.filter((x) => !x.answer).length + "건", "오래된 문의부터 답해 주세요", "#/center/master/vod-inquiries", all.some((x) => !x.answer) ? "warn" : "ok") +
        kpi("오늘 접수", all.filter((x) => DB.date.toStr(new Date(x.at)) === todayStr()).length + "건", "전체 " + all.length + "건", "#/center/master/vod-inquiries") +
        kpi("평균 답변 시간", avgH == null ? "-" : avgH < 1 ? "1시간 안" : avgH + "시간", "답변 완료 " + done.length + "건 기준", "#/center/master/vod-inquiries") +
        kpi("많이 묻는 종류", Object.keys(cats).sort((a, b) => cats[b] - cats[a])[0] || "-", Object.keys(cats).map((k) => k + " " + cats[k]).join(" · ") || "아직 없어요", "#/center/master/vod-inquiries") +
      "</div>" +
      '<section class="a-card"><div class="a-toolbar"><div class="a-tabs">' + [["open", "답변 대기", all.filter((x) => !x.answer).length], ["done", "답변 완료", done.length], ["all", "전체", all.length]].map((t) => '<button type="button" class="a-tab' + (f === t[0] ? " on" : "") + '" data-action="vd-iqf" data-k="' + t[0] + '">' + t[1] + ' <span class="num">' + t[2] + "</span></button>").join("") + "</div></div>" +
        (list.length ? '<div class="a-table-wrap"><table class="a-table vda-table"><thead><tr><th>문의일</th><th>회원</th><th>종류</th><th>문의 내용</th><th>상태</th><th class="right">관리</th></tr></thead><tbody>' +
          list.map((x) => { const m = vdMember(x.mid) || {}; return '<tr><td class="vda-nw">' + esc(DB.date.toStr(new Date(x.at))) + '</td><td class="vda-nw"><b>' + esc(m.name || "탈퇴 회원") + '</b><small class="a-memo">' + esc(m.email || "") + '</small></td><td class="vda-nw">' + esc(x.cat) + '</td><td class="vda-rv"><b>' + esc(x.title) + "</b><br>" + esc(x.text) + (x.answer ? '<small class="a-memo">답변: ' + esc(x.answer) + "</small>" : "") + "</td><td>" + (x.answer ? pill("답변 완료", "ok") : pill("답변 대기", "warn")) + '</td><td class="right">' + btn(x.answer ? "답변 고치기" : "답변하기", "vda-iq", x.answer ? "a-btn-ghost a-btn-sm" : "a-btn-primary a-btn-sm", ' data-id="' + esc(x.id) + '"') + "</td></tr>"; }).join("") + "</tbody></table></div>"
          : emptyBox("check", f === "open" ? "답변을 기다리는 문의가 없어요." : "문의가 없어요.")) + "</section>";
  }
  /* ---------- 스토어 미리보기: 마스터 화면을 떠나지 않고 오른쪽 분할 화면으로 ---------- */
  function storeSplit(href) { openSplit(href || "#/vod", "DOOGO CLASS 미리보기"); }
  /** 오른쪽 분할 미리보기 — title · 볼 곳 고르기(targets: [[값, 이름]] · 고르면 dgSplit) */
  function openSplit(href, title, targets, cur) {
    let box = document.getElementById("a-split");
    const url = ROUTE.abs(href);
    if (!box) {
      box = document.createElement("aside"); box.id = "a-split"; box.className = "a-split";
      document.body.appendChild(box);
    }
    box.setAttribute("aria-label", title);
    box.innerHTML = '<div class="a-split-h"><span class="a-split-t">' + icon("layers", "sm") + "<b>" + esc(title) + '</b><small id="a-split-u"></small></span>' +
      (targets ? '<select class="a-input a-sm a-split-sel" data-split-sel aria-label="미리 볼 화면">' + targets.map((t) => '<option value="' + esc(t[0]) + '"' + (t[0] === cur ? " selected" : "") + ">" + esc(t[1]) + "</option>").join("") + "</select>" : "") +
      '<button type="button" class="a-icon-btn sm" data-action="split-reload" title="새로고침" aria-label="새로고침">' + icon("refresh", "sm") + "</button>" +
      '<a class="a-icon-btn sm" id="a-split-new" target="_blank" rel="noopener" title="새 창으로 열기" aria-label="새 창으로 열기">' + icon("arrowUpRight", "sm") + "</a>" +
      '<button type="button" class="a-icon-btn sm" data-action="split-close" title="닫기" aria-label="미리보기 닫기">' + icon("x", "sm") + "</button></div>" +
      '<iframe id="a-split-f" title="' + esc(title) + '" src="' + esc(url) + '"></iframe>';
    box.querySelector("#a-split-u").textContent = href.replace(/^#/, "");
    box.querySelector("#a-split-new").href = url;
    document.body.classList.add("a-split-on");
  }
  /* 두잉고 미리보기 — 마스터 화면을 떠나지 않고 두잉고 소개 · 수강생 로그인 · 강사별 수강생 강의실 · 강의 소개 · 무료강의를 오른쪽에서 봐요 */
  function dgTargets() {
    const out = [["home", "두잉고 소개 페이지"], ["login", "수강생 로그인 화면"]];
    DB.data.instructors.filter((i) => i.status === "active").forEach((i) => { out.push(["room:" + i.id, i.displayName + " · 수강생 강의실"], ["p:" + i.id, i.displayName + " · 강의 소개 페이지"], ["free:" + i.id, i.displayName + " · 무료강의 페이지"]); });
    return out;
  }
  function dgSplit(t) {
    const k = String(t || "home").split(":")[0], id = String(t || "").split(":")[1] || "";
    if (k === "plan") {
      // 기수 · 일정 설계 미리보기 — 그 기수 수강생처럼 대시보드 · 수업 캘린더 (이 브라우저의 미리보기 세션 · 실제 수강생 기록은 안 바뀜)
      const pp = String(t).split(":"), iid = pp[2], co = DB.cohort(pp[3]);
      if (!co || co.instructorId !== iid) { toast("기수를 찾지 못했어요.", "warn"); return; }
      DB.session.setStudent({ preview: true, by: S.role === "master" ? "master" : isCoach() ? "coach" : "instructor", instructorId: iid, cohortId: co.id, at: Date.now() });
      const tg = []; DB.cohortsOf(iid).forEach((c) => { tg.push(["plan:home:" + iid + ":" + c.id, c.name + " · 수강생 대시보드"], ["plan:schedule:" + iid + ":" + c.id, c.name + " · 수업 캘린더"]); });
      openSplit(id === "schedule" ? "#/schedule" : "#/home", "수강생 화면 미리보기 · " + insName(iid), tg, t);
      return;
    }
    let href = k === "p" ? "#/p/" + id : k === "free" ? "#/free/" + id : k === "login" ? "#/login" : "#/doinggo";
    if (k === "room") {
      // 강사센터 ‘수강생 화면 미리보기’와 같은 미리보기 세션 (이 브라우저에만 · 실제 수강생 기록은 안 바뀜)
      const co = DB.currentCohort(id);
      if (!co) { toast("기수가 없어 강의실을 미리볼 수 없어요.", "warn"); return; }
      DB.session.setStudent({ preview: true, instructorId: id, cohortId: co.id, at: Date.now() }); href = "#/home";
    } else if (k === "login") { const st = DB.session.student(); if (st && st.preview) DB.session.setStudent(null); }
    openSplit(href, "두잉고 미리보기", dgTargets(), t || "home");
  }
  const dgSplitBtn = (t, label) => '<button type="button" class="a-btn a-btn-ghost" data-action="dg-split" data-t="' + esc(t || "home") + '">' + icon("layers", "sm") + esc(label || "두잉고 미리보기") + "</button>";
  const splitClose = () => { const b = document.getElementById("a-split"); if (b) b.remove(); document.body.classList.remove("a-split-on"); };

  /* ---------- 4) VOD 전시 · 설정 (배너 · 카테고리 · 정산 · 입금 계좌) ---------- */

  /* ---------- 홈 꾸미기 (마스터 › DOOGO CLASS › 클래스 · 전시 › 홈 꾸미기) ----------
   * 스토어 첫 화면의 섹션 순서 · 켜기 · 제목, 섹션마다 보이는 강의 순서 · 추가 · 빼기, 분야별 탭 순서 · 탭마다 강의 순서, 강사진 순서를 정해요.
   * 저장은 VOD.homeRails 하나: { k, on, tag, t, mode: auto|pin|only, picks: 앞에 고정할 id, hide: 뺀 id, cats: [{ k: 분야, on, picks, hide }] }
   * 순서를 바꾸면 바꾼 자리까지 picks 로 고정하고 나머지는 원래 규칙대로 뒤에 붙어요. 빼면 hide 에 남아 자동 규칙이 다시 넣지 않아요.
   * 이름 · 제목 말고는 누르는 즉시 저장돼요 (commit). */
  const RAIL_MODE = [["auto", "자동 (기본 규칙대로)"], ["pin", "고정한 강의 먼저 + 나머지 자동"], ["only", "고른 강의만"]];
  const HM_CUT = { cat: 6, teach: 8 };
  const railCopy = (r) => ({ k: r.k, on: r.on, tag: r.tag, t: r.t.slice(), mode: r.mode, picks: r.picks.slice(), hide: r.hide.slice(), cats: r.cats.map((c) => ({ k: c.k, on: c.on, picks: c.picks.slice(), hide: c.hide.slice() })) });
  function railState() { const v = VD(); v.homeRails = VX().homeRails().map(railCopy); return v.homeRails; }
  function railSync() {
    const f = document.getElementById("vda-rails-form"); if (!f) return railState();
    const rs = railState();
    rs.forEach((r) => { const g = (n) => (f[r.k + "-" + n] ? f[r.k + "-" + n].value : null); if (g("tag") != null) r.tag = g("tag").trim(); if (g("t0") != null) r.t = [g("t0"), g("t1"), g("t2")]; });
    return rs;
  }
  // 분야별 탭 설정을 모든 분야로 펼쳐 둬요 (탭 순서를 그대로 저장)
  const hmCats = (r) => { r.cats = VX().catTabs(r).map((t) => ({ k: t.k, on: t.on, picks: t.picks.slice(), hide: t.hide.slice() })); return r.cats; };
  // 지금 보이는 순서(ids)에서 from → to 로 옮기고, 옮긴 자리까지 고정 (‘고른 강의만’은 전부) · 지금 안 보이는 고른 강의는 뒤에 그대로
  function hmPin(o, ids, from, to, all) {
    const a = ids.slice(), x = a.splice(from, 1)[0]; a.splice(to, 0, x);
    const n = all ? a.length : Math.max(o.picks.filter((id) => ids.indexOf(id) >= 0).length, Math.max(from, to) + 1);
    o.picks = a.slice(0, n).concat(o.picks.filter((id) => ids.indexOf(id) < 0));
  }
  const hmHide = (o, id) => { o.picks = o.picks.filter((x) => x !== id); if (o.hide.indexOf(id) < 0) o.hide.push(id); };
  const hmShow = (o, id, add) => { o.hide = o.hide.filter((x) => x !== id); if (add && o.picks.indexOf(id) < 0) o.picks.push(id); };
  /* 어떤 목록을 고치는지: 섹션 강의 · 분야 탭 강의 · 강사진 */
  function hmTarget(rs, k, c) {
    const X = VX(), r = rs.find((x) => x.k === k); if (!r) return null;
    if (k === "teach") return { o: r, ids: X.teachHome(r).map((t) => t.iid), all: false, done: () => {} };
    if (k === "cat") { const cs = hmCats(r), cf = cs.find((x) => x.k === c), t = X.catTabs(r).find((x) => x.k === c); return cf && t ? { o: cf, ids: t.items.map((p) => p.id), all: false, done: () => {} } : null; }
    return { o: r, ids: X.railItems(r).map((it) => it.p.id), all: r.mode === "only", done: () => { if (r.mode === "auto") r.mode = "pin"; } };
  }
  const hmName = (r) => r.t.join("").trim() || r.k;
  const hmSt = (p) => (!p ? "" : p.status === "soon" ? pill("오픈 예정", "info") : p.status !== "on" ? pill("숨김", "mute") : "");
  // o: 강사 줄처럼 사진 · 설명을 따로 줄 때 { th, sub }
  function hmRow(it, i, n, k, c, fixed, o) {
    const X = VX(), p = it.p, real = o ? null : X.product(p.id), d = ' data-k="' + k + '"' + (c ? ' data-c="' + esc(c) + '"' : "") + ' data-i="' + i + '"';
    const mv = (to, ic, lab, dis) => '<button type="button" class="a-icon-btn" data-action="hk-mv"' + d + ' data-to="' + to + '" aria-label="' + lab + '"' + (dis ? " disabled" : "") + ">" + icon(ic, "sm") + "</button>";
    return '<li class="hk-it' + (fixed ? " pin" : "") + '"><span class="hk-no">' + (i + 1) + '</span><span class="hk-th' + (o ? " hk-av" : "") + '">' + (o ? o.th : real ? X.thumbArt(real) : icon("layers", "sm")) + '</span><span class="hk-tx"><b>' + esc(p.title || "") + "</b><small>" + (o ? esc(o.sub) : esc(real ? adTypeShort(real) : "두잉고 기수 강의") + (p.creator ? " · " + esc(p.creator) : "")) + " · " + (fixed ? "<em>고정</em>" : "자동") + "</small>" + hmSt(real) + "</span>" +
      '<span class="hk-act">' + '<button type="button" class="a-btn a-btn-ghost a-btn-sm hk-top" data-action="hk-mv"' + d + ' data-to="0"' + (i === 0 ? " disabled" : "") + ">맨 앞</button>" + mv(i - 1, "arrowUp", "앞으로", i === 0) + mv(i + 1, "arrowDown", "뒤로", i === n - 1) +
      '<button type="button" class="a-icon-btn hk-del" data-action="hk-hide" data-k="' + k + '"' + (c ? ' data-c="' + esc(c) + '"' : "") + ' data-id="' + esc(p.id) + '" aria-label="이 섹션에서 빼기" title="빼기">' + icon("x", "sm") + "</button></span></li>";
  }
  function hmHidden(o, k, c, nameOf) {
    if (!o.hide.length) return "";
    return '<div class="hk-hid"><p><b>뺀 ' + (k === "teach" ? "강사" : "강의") + " " + o.hide.length + '</b><small>첫 화면 이 자리에 안 보여요 · 다시 넣으면 원래 자리로</small></p><div>' + o.hide.map((id) => '<span class="hk-chip">' + esc(nameOf(id)) + '<button type="button" data-action="hk-show" data-k="' + k + '"' + (c ? ' data-c="' + esc(c) + '"' : "") + ' data-id="' + esc(id) + '">다시 넣기</button></span>').join("") + "</div></div>";
  }
  const hmPName = (id) => { const p = VX().product(id); return p ? p.title : "지워진 강의"; };
  function hmList(items, k, c, pinN, cut, cutTxt) {
    if (!items.length) return '<p class="hk-empty">' + icon("alert", "xs") + " 보일 강의가 없어서 첫 화면에서 이 자리는 숨겨져요.</p>";
    return '<ol class="hk-items">' + items.map((it, i) => (cut && i === cut ? '<li class="hk-cut">' + cutTxt + "</li>" : "") + hmRow(it, i, items.length, k, c, i < pinN)).join("") + "</ol>";
  }
  function hmEditor(r) {
    const X = VX(), off = r.biz && !X.bizOn(r.biz);
    const title = r.k === "teach" ? "" : '<form id="vda-rails-form" class="a-form hk-tt" novalidate><div class="a-form-row">' + (r.k === "topics" ? "" : '<div class="a-field"><label>작은 이름표</label><input class="a-input" name="' + r.k + '-tag" value="' + esc(r.tag) + '" maxlength="16" placeholder="비우면 숨겨요"></div>') +
      '<div class="a-field vda-rail-tt"><label>제목 <small>(앞 · <b style="color:#e0103a">빨간 강조</b> · 뒤)</small></label><div class="vda-rail-t3"><input class="a-input" name="' + r.k + '-t0" value="' + esc(r.t[0] || "") + '" maxlength="30" aria-label="제목 앞"><input class="a-input vda-rail-acc" name="' + r.k + '-t1" value="' + esc(r.t[1] || "") + '" maxlength="20" aria-label="빨간 강조"><input class="a-input" name="' + r.k + '-t2" value="' + esc(r.t[2] || "") + '" maxlength="20" aria-label="제목 뒤"></div></div></div>' +
      '<div class="a-form-actions"><button class="a-btn a-btn-primary a-btn-sm" type="submit">이름표 · 제목 저장</button></div></form>';
    let body = "";
    if (r.k === "why" || r.k === "topics") body = '<p class="a-muted p-small hk-fx">' + icon("lock", "xs") + " 고정 섹션이에요 (" + esc(r.rule) + "). " + (r.k === "topics" ? "칩은 ‘전시 · 쿠폰 · 설정 › 다루는 부업’에서 고쳐요." : "켜기 · 순서 · 제목만 바꿔요.") + "</p>";
    else if (r.k === "teach") {
      const list = X.teachHome(r), pk = r.picks.filter((k) => list.some((t) => t.iid === k)).length;
      body = '<p class="a-muted p-small hk-note">강사 순서는 첫 화면과 강사진 메뉴에 같이 써요. 빼면 첫 화면에서만 숨겨요 (강사진 메뉴 · 강사 페이지는 그대로).</p>' +
        (list.length ? '<ol class="hk-items">' + list.map((t, i) => (i === HM_CUT.teach ? '<li class="hk-cut">여기까지 첫 화면에 보여요 (' + HM_CUT.teach + "명) · 아래는 강사진 메뉴에서만</li>" : "") + hmRow({ p: { id: t.iid, title: t.name } }, i, list.length, "teach", "", i < pk, { th: t.ph || X.insPhoto(t.iid) ? '<img src="' + esc(t.ph || X.insPhoto(t.iid)) + '" alt="">' : esc((t.name || "?").slice(0, 1)), sub: "클래스 " + t.ps.length + "개 · " + t.cats.slice(0, 2).join(" · ") })).join("") + "</ol>" : '<p class="hk-empty">판매 중인 강의가 있는 강사가 없어요.</p>') +
        hmHidden(r, "teach", "", (id) => { const t = X.teacherList().find((x) => x.iid === id); return t ? t.name : id; });
    } else if (r.k === "cat") {
      const tabs = X.catTabs(r), cur = tabs.find((t) => t.k === ui.hmCat) || tabs[0];
      if (cur) ui.hmCat = cur.k;
      body = '<p class="a-muted p-small hk-note">분야 탭 순서 · 켜기를 정하고, 탭을 골라 그 안의 강의 순서를 바꿔요. 첫 화면 탭에는 ' + HM_CUT.cat + "개까지 보이고 나머지는 ‘전체보기’에서 봐요.</p>" +
        '<ul class="hk-tabs">' + tabs.map((t, i) => '<li class="' + (t === cur ? "on" : "") + (t.on && t.items.length ? "" : " off") + '"><button type="button" class="hk-tab" data-action="hk-cat" data-c="' + esc(t.k) + '"><span class="hk-no">' + (i + 1) + "</span><b>" + esc(t.c.label) + "</b><small>" + t.items.length + "개" + (!t.items.length ? " · 강의 없음" : "") + "</small></button>" +
          '<button type="button" class="a-switch' + (t.on ? " on" : "") + '" data-action="hk-cat-on" data-c="' + esc(t.k) + '" role="switch" aria-checked="' + t.on + '" aria-label="' + esc(t.c.label) + ' 탭 보이기"><i></i></button>' +
          '<button type="button" class="a-icon-btn" data-action="hk-cat-mv" data-c="' + esc(t.k) + '" data-dir="-1" aria-label="앞으로"' + (i === 0 ? " disabled" : "") + ">" + icon("arrowUp", "sm") + '</button><button type="button" class="a-icon-btn" data-action="hk-cat-mv" data-c="' + esc(t.k) + '" data-dir="1" aria-label="뒤로"' + (i === tabs.length - 1 ? " disabled" : "") + ">" + icon("arrowDown", "sm") + "</button></li>").join("") + "</ul>" +
        (cur ? '<h3 class="hk-sub">' + esc(cur.c.label) + " 탭 강의 순서</h3>" + hmList(cur.items.map((p) => ({ p })), "cat", cur.k, cur.picks.filter((id) => cur.items.some((p) => p.id === id)).length, HM_CUT.cat, "여기까지 첫 화면 탭에 보여요 (" + HM_CUT.cat + "개) · 나머지는 ‘전체보기’에서") + hmHidden({ hide: cur.hide }, "cat", cur.k, hmPName) +
          '<p class="a-muted p-small">다른 분야 강의를 넣으려면 VOD 클래스 관리 › 클래스 수정에서 분야를 바꿔요.</p>' : '<p class="hk-empty">켜진 분야가 없어요.</p>');
    } else {
      const items = X.railItems(r), vis = items.map((it) => it.p.id), pinN = r.mode === "auto" ? 0 : r.mode === "only" ? items.length : r.picks.filter((id) => vis.indexOf(id) >= 0).length;
      // 넣을 수 있는 강의: 스토어에 실제로 보일 수 있는 것만 (숨김 · 지난 LIVE · 꺼진 판매 영역은 빼요)
      const cand = VD().products.filter((p) => X.railShowable(p) && vis.indexOf(p.id) < 0).sort((a, b) => adTypeShort(a).localeCompare(adTypeShort(b)) || String(a.title).localeCompare(String(b.title)));
      body = '<div class="hk-ctl"><div class="a-field"><label for="hk-mode">강의 고르는 방법</label><select class="a-input" id="hk-mode" data-hk-mode="' + r.k + '">' + RAIL_MODE.map((x) => '<option value="' + x[0] + '"' + (r.mode === x[0] ? " selected" : "") + ">" + x[1] + "</option>").join("") + "</select></div>" +
          '<div class="a-field"><label for="hk-add">강의 추가</label><div class="vda-rail-add"><select class="a-input" id="hk-add"><option value="">넣을 강의를 골라 주세요</option>' + cand.map((p) => '<option value="' + esc(p.id) + '">[' + esc(adTypeShort(p)) + "] " + esc(p.title) + (p.status === "soon" ? " (오픈 예정)" : "") + (r.hide.indexOf(p.id) >= 0 ? " · 뺀 강의" : "") + "</option>").join("") + "</select>" + btn(icon("plus", "sm") + "추가", "hk-add", "a-btn-ghost a-btn-sm", ' data-k="' + r.k + '"') + "</div></div></div>" +
        '<p class="a-muted p-small hk-note">규칙: ' + esc(r.rule) + ". " + (r.mode === "only" ? "고른 강의만 이 순서대로 보여요." : "‘맨 앞’ · ↑ ↓로 옮기면 그 자리까지 고정되고, 새로 올라오는 강의는 규칙대로 뒤에 붙어요.") + "</p>" +
        hmList(items, r.k, "", pinN) + hmHidden(r, r.k, "", hmPName);
    }
    const resettable = r.k !== "why" && r.k !== "topics";
    return '<div class="a-card-head"><h2>' + esc(hmName(r)) + ' <small class="a-muted">섹션 편집</small></h2>' + (resettable ? btn("이 섹션 처음 규칙으로", "hk-reset", "a-btn-ghost a-btn-sm vda-ml", ' data-k="' + r.k + '"') : "") + "</div>" +
      (off ? '<p class="hk-warn">' + icon("alert", "xs") + " 판매 영역이 꺼져 있어서 첫 화면에 안 보여요. " + btn("판매 영역 켜기", "vda-biz", "a-btn-ghost a-btn-sm", ' data-k="' + r.biz + '"') + "</p>" : !r.on ? '<p class="hk-warn">' + icon("eyeOff", "xs") + " 꺼 둔 섹션이에요. 왼쪽(휴대폰은 위) 스위치를 켜면 보여요.</p>" : "") + title + body;
  }
  function pageVodHome() {
    const X = VX(), rs = X.homeRails(), sel = rs.find((r) => r.k === ui.hmSel) || rs[0];
    ui.hmSel = sel.k;
    const shown = (r) => r.on && (!r.biz || X.bizOn(r.biz));
    const cnt = (r) => (r.k === "cat" ? X.catTabs(r).filter((t) => t.on && t.items.length).length + "개 분야" : r.k === "teach" ? Math.min(HM_CUT.teach, X.teachHome(r).length) + "명" : r.k === "why" || r.k === "topics" ? "고정" : X.railItems(r).length + "개");
    return head("홈 꾸미기", "스토어 첫 화면(PC · 휴대폰 같은 순서)에 보이는 섹션 순서와, 섹션마다 들어갈 강의 · 순서를 정해요. 누르는 즉시 저장되고 스토어 홈에 바로 보여요.", vdStoreBtn("#/vod", "스토어 홈 미리보기")) +
      '<div class="hk-grid"><section class="a-card hk-secs"><div class="a-card-head"><h2>섹션 순서</h2><span class="a-muted">배너 · 카테고리 아이콘 아래에 위에서부터 이 순서대로 보여요. 끄면 숨겨요.</span>' + btn("전체 처음 상태로", "vda-rail-reset", "a-btn-ghost a-btn-sm vda-ml") + "</div>" +
        '<ol class="hk-list">' + rs.map((r, i) => '<li class="' + (r.k === sel.k ? "on" : "") + (shown(r) ? "" : " off") + '"><button type="button" class="hk-pick" data-action="hk-sel" data-k="' + r.k + '"><span class="hk-no">' + (i + 1) + "</span><span class=\"hk-tx\"><b>" + esc(hmName(r)) + "</b><small>" + (r.biz && !X.bizOn(r.biz) ? "판매 영역 꺼짐" : !r.on ? "꺼짐" : cnt(r)) + (r.mode && r.mode !== "auto" && !r.fixed ? " · " + (r.mode === "only" ? "고른 강의만" : "순서 고정") : "") + "</small></span></button>" +
          '<button type="button" class="a-switch' + (r.on ? " on" : "") + '" data-action="vda-rail-on" data-k="' + r.k + '" role="switch" aria-checked="' + r.on + '" aria-label="' + esc(hmName(r)) + ' 보이기"><i></i></button>' +
          '<button type="button" class="a-icon-btn" data-action="vda-rail-move" data-k="' + r.k + '" data-dir="-1" aria-label="위로"' + (i === 0 ? " disabled" : "") + ">" + icon("arrowUp", "sm") + '</button><button type="button" class="a-icon-btn" data-action="vda-rail-move" data-k="' + r.k + '" data-dir="1" aria-label="아래로"' + (i === rs.length - 1 ? " disabled" : "") + ">" + icon("arrowDown", "sm") + "</button></li>").join("") + "</ol></section>" +
        '<section class="a-card hk-ed" id="hk-ed">' + hmEditor(sel) + "</section></div>";
  }
  function saveVodRails() { railSync(); commit("이름표 · 제목을 저장했어요. 스토어 첫 화면에 바로 보여요."); }
  /* 판매 영역: 지금 운영하는 사업만 켜요. 끄면 스토어 메뉴 · 홈 · 카테고리 아이콘 · 전체 클래스 · 검색 · 강사 페이지에서 숨겨요 (이미 산 수강생은 그대로) */
  const BIZ_NAME = { ebook: "전자책", flive: "LIVE 무료강의 → 얼리버드", live: "온/오프라인 강의 (유료)", free: "무료 VOD 특강" };
  function vdBizCard(v) {
    const X = VX(), P = v.products.filter((p) => p.status === "on"), on = (k) => X.bizOn(k);
    const n = { vod: P.filter((p) => X.typeOf(p) === "vod" && X.priceOf(p) > 0).length, ebook: P.filter((p) => X.typeOf(p) === "ebook").length, live: P.filter((p) => X.isEvent(p) && !X.isFreeEv(p)).length, free: P.filter((p) => !X.isEvent(p) && X.basePrice(p) === 0).length, flive: P.filter((p) => X.isFreeEv(p)).length };
    const row = (k, name, desc, fixed) => '<div class="vda-biz' + (fixed || on(k) ? "" : " off") + '"><span class="vda-biz-ic">' + icon(k === "vod" ? "monitorPlay" : k === "ebook" ? "book" : k === "live" ? "calendar" : k === "flive" ? "video" : "sparkles", "sm") + '</span><div><b>' + name + "</b><small>" + desc + " · 판매 중 " + n[k] + "개</small></div>" +
      (fixed ? pill("항상 켜짐", "ok") : '<span class="vda-biz-st">' + (on(k) ? "보여요" : "숨김") + '</span><button type="button" class="a-switch' + (on(k) ? " on" : "") + '" data-action="vda-biz" data-k="' + k + '" role="switch" aria-checked="' + on(k) + '" aria-label="' + name + ' 판매 영역"><i></i></button>') + "</div>";
    return '<section class="a-card"><div class="a-card-head"><h2>판매 영역</h2><span class="a-muted">지금 운영하는 사업만 켜 두세요. 끄면 스토어 메뉴 · 홈 · 카테고리 아이콘 · 전체 클래스 · 검색 · 강사 페이지에서 숨겨요. 이미 산 수강생은 마이페이지에서 그대로 들어요.</span></div>' +
      '<div class="vda-bizs">' + row("vod", "VOD 강의", "유료 녹화 강의", true) + row("ebook", "전자책", "PDF 전자책") + row("flive", "LIVE 무료강의 → 얼리버드", "무료 LIVE 신청 → 오픈채팅방 → 유튜브 LIVE → 끝나면 이어지는 유료 강의 얼리버드 · 홈 ‘무료 LIVE’ · ‘얼리버드 할인중’ 섹션") + row("live", "온/오프라인 강의 (유료)", "현장 강의 · Zoom 온라인 강의 · 두잉고 기수 강의 연결") + row("free", "무료 VOD 특강", "0원 녹화 특강") + "</div></section>";
  }
  /* 무료 LIVE → 얼리버드 현황: 회차마다 신청 · 이어지는 강의 · 얼리버드 기간 · 얼리버드 결제(전환율) */
  function vdFunnelCard(v) {
    const X = VX(), on = X.bizOn("flive"), fs = v.products.filter((p) => X.isFreeEv(p) && p.status !== "hidden").sort((a, b) => String(b.eventAt || "").localeCompare(String(a.eventAt || "")));
    const md = (s) => X.ebDayTxt(s), stOf = (fn, f) => !fn ? pill("연결 없음", "mute") : fn.phase === "before" ? pill("LIVE 예정 · " + X.fmtEvent(f.eventAt).replace(/\s*\d{1,2}:\d{2}$/, ""), "info") : fn.phase === "eb" ? pill("얼리버드 중 · ~" + md(fn.ebDay), "warn") : pill("끝 · 정가 판매", "mute");
    const flow = '<ol class="vda-flow">' + [["video", "무료 LIVE 신청", "0원 · 로그인 후 신청"], ["message", "오픈채팅방 입장", "신청자에게만 버튼이 열려요"], ["play", "유튜브 LIVE", "강의 날 오픈채팅방 · 마이페이지에 링크"], ["sparkles", "얼리버드 결제", "LIVE가 끝나면 자동으로 열려요"]].map((x, i) => "<li><span>" + icon(x[0], "sm") + "</span><b>" + (i + 1) + ". " + x[1] + "</b><small>" + x[2] + "</small></li>").join("") + "</ol>";
    const rows = fs.map((f) => {
      const fn = X.funnelOf(f), nx = fn && X.product(fn.next), apps = v.orders.filter((o) => o.pid === f.id && o.status === "paid"), mids = {}; apps.forEach((o) => { mids[o.mid] = 1; });
      const conv = fn ? v.orders.filter((o) => o.pid === fn.next && o.status === "paid" && (!o.kind || o.kind === "course") && mids[o.mid] && (o.paidAt || o.at) >= fn.end && (o.paidAt || o.at) <= fn.ebEnd) : [];
      return "<tr><td><b>" + esc(f.title) + '</b><small class="a-memo">' + esc(f.creator || "") + " · " + esc(f.eventAt ? X.fmtEvent(f.eventAt, true) : "일시 미정") + "</small></td>" +
        '<td class="num">' + apps.length + "명</td><td>" + (nx ? "<b>" + esc(nx.title) + '</b><small class="a-memo">' + (fn.ebPrice ? "얼리버드 " + won(fn.ebPrice) + " · 정가 " + won(nx.price) : "할인 없이 연결") + " · LIVE 끝나고 " + (Number(f.ebDays) || 3) + "일" + (f.gate ? " · 끝날 때까지 숨김" : "") + "</small>" : '<span class="a-muted">-</span>') + "</td>" +
        "<td>" + stOf(fn, f) + '</td><td class="num">' + (fn && fn.phase !== "before" ? conv.length + "건" + (apps.length ? ' <small class="a-memo">전환 ' + Math.round(conv.length / apps.length * 100) + "%</small>" : "") : '<span class="a-muted">LIVE 뒤</span>') + "</td>" +
        '<td class="right">' + btn("명단", "vda-roster", "a-btn-ghost a-btn-sm", ' data-id="' + esc(f.id) + '"') + '<a class="a-btn a-btn-ghost a-btn-sm" href="#/center/master/vod-classes/' + esc(f.id) + '">설정</a></td></tr>';
    }).join("");
    return '<section class="a-card vda-funnel"><div class="a-card-head"><h2>LIVE 무료강의 → 얼리버드</h2>' + (on ? pill("판매 영역 켜짐 · 스토어에 보여요", "ok") : pill("판매 영역 꺼짐 · 스토어에는 안 보여요", "mute")) + btn(icon("plus", "sm") + "LIVE 무료강의 만들기", "vda-new-fl", "a-btn-ghost a-btn-sm vda-ml") + "</div>" +
      '<p class="a-muted p-small">무료 LIVE와 유료 강의는 따로 만들고 하나로 이어요. LIVE가 끝나면 무료 LIVE 카드는 자동으로 빠지고, 이어지는 유료 강의가 얼리버드 가격 · 마감 시계와 함께 홈 ‘얼리버드 할인중’에 떠요. 꺼 둔 동안에는 스토어가 지금 그대로예요.</p>' + flow +
      (rows ? '<div class="a-table-wrap"><table class="a-table vda-fun-t"><thead><tr><th>무료 LIVE</th><th>신청</th><th>이어지는 유료 강의</th><th>상태</th><th>얼리버드 결제</th><th class="right">관리</th></tr></thead><tbody>' + rows + "</tbody></table></div>" : '<p class="a-muted">아직 무료 LIVE가 없어요. ‘무료 LIVE 만들기’를 눌러 시작해 보세요.</p>') + "</section>";
  }
  function pageMasterVodDisplay() {
    const v = VD(), s = v.settings, b = DB.billingInfo ? DB.billingInfo() : {};
    const tv0 = v.topicVotes || {}, ts = (v.stat && v.stat.topics) || {}, tv = {}; (v.topics || []).forEach((t) => { tv[t] = (Number(tv0[t]) || 0) + (Number(ts[t]) || 0); });
    const rank = (v.topics || []).map((t) => [t, tv[t] || 0]).sort((a, c) => c[1] - a[1]).slice(0, 10), mx = Math.max(1, ...rank.map((r) => r[1]));
    return head("VOD 전시 · 쿠폰 · 설정", "스토어 첫 화면 배너 · 쿠폰 · ‘다루는 부업’ 칩 · 카테고리, 기본 정산 비율 · 무통장 입금 계좌 · 후기 포인트를 정해요.", vdStoreBtn()) +
      vdBizCard(v) + vdFunnelCard(v) +
      '<section class="a-card"><div class="a-card-head"><h2>첫 화면 배너</h2><span class="a-muted">켜진 배너가 위에서부터 5초마다 넘어가요. 이미지 배너는 PC ' + BAN_PC.join(" × ") + " · 모바일 " + BAN_M.join(" × ") + 'px 이미지를 따로 올려요.</span>' + btn(icon("plus", "sm") + "배너 추가", "vda-ban-add", "a-btn-primary a-btn-sm vda-ml") + "</div>" +
        (v.banners.length ? '<div class="vda-bans">' + v.banners.map((x, i) => { const p = vdP(x.pid); return '<div class="vda-ban' + (x.on === false ? " off" : "") + '"><span class="vda-ban-sw' + (x.kind === "img" ? " img" : x.dark ? " dk" : "") + '" style="--a:' + esc(x.kind === "img" ? x.bg || "#111" : (x.color || [])[0] || "#111") + ";--b:" + esc(x.kind === "img" ? x.bg || "#111" : (x.color || [])[1] || "#333") + '">' + (x.kind === "img" ? (x.pc || x.m ? "<img " + VX().imgAttr(x.pc || x.m, "src") + ' alt="">' : "") + "<em>" + (x.pc ? "PC" : "") + (x.pc && x.m ? " · " : "") + (x.m ? "M" : "") + "</em>" : (x.img ? '<img src="' + esc(x.img) + '" alt="">' : "") + "<b>" + esc(x.title || "").replace(/\n/g, "<br>") + "</b>") + '</span><div class="vda-ban-t"><small>' + (x.kind === "img" ? '<i class="vda-ban-k">이미지 배너</i>' : '<i class="vda-ban-k art">디자인 배너</i>') + vdBanState(x) + esc(x.kind === "img" ? "" : x.eyebrow || "") + "</small><b>" + esc(x.kind === "img" ? x.alt || x.title || "이름 없는 이미지 배너" : (x.title || "").replace(/\n/g, " ")) + "</b><span>" + (p ? "→ " + esc(p.title) : x.href ? "→ " + esc(x.href) : '<span class="a-muted">연결 없음 (전체 클래스로)</span>') + '</span></div><div class="vda-ban-a">' +
          '<button type="button" class="a-switch' + (x.on !== false ? " on" : "") + '" data-action="vda-ban-on" data-i="' + i + '" role="switch" aria-checked="' + (x.on !== false) + '" aria-label="배너 켜기"><i></i></button>' +
          '<button type="button" class="a-icon-btn" data-action="vda-ban-move" data-i="' + i + '" data-dir="-1" aria-label="위로"' + (i === 0 ? " disabled" : "") + ">" + icon("arrowUp", "sm") + '</button><button type="button" class="a-icon-btn" data-action="vda-ban-move" data-i="' + i + '" data-dir="1" aria-label="아래로"' + (i === v.banners.length - 1 ? " disabled" : "") + ">" + icon("arrowDown", "sm") + "</button>" +
          btn("수정", "vda-ban-edit", "a-btn-ghost a-btn-sm", ' data-i="' + i + '"') + '<button type="button" class="a-icon-btn" data-action="vda-ban-del" data-i="' + i + '" aria-label="배너 지우기">' + icon("trash", "sm") + "</button></div></div>"; }).join("") + "</div>" : emptyBox("image", "배너가 없어요. 배너가 없으면 첫 화면은 카테고리부터 보여요.")) + "</section>" +
      '<section class="a-card"><div class="a-card-head"><h2>홈 화면 섹션</h2><span class="a-muted">섹션 순서 · 섹션마다 강의 순서 · 추가 · 빼기 · 분야별 탭 · 강사진 순서는 ‘홈 꾸미기’ 메뉴에서 해요.</span><a class="a-btn a-btn-primary a-btn-sm vda-ml" href="#/center/master/vod-home">' + icon("home", "sm") + "홈 꾸미기 열기</a></div></section>" +
      vdTileCard(v) +
      vdCouponCard(v) +
      '<div class="a-grid-2"><section class="a-card"><div class="a-card-head"><h2>카테고리</h2><span class="a-muted">끄면 스토어 메뉴에서 숨겨요.</span></div><form id="vda-cat-form" class="a-form" novalidate>' +
          v.cats.map((c, i) => '<div class="vda-cat"><span class="vda-cat-ic" style="--c:' + esc(c.color || "#111") + '">' + icon(c.icon || "layers", "sm") + '</span><input class="a-input" name="cat-' + i + '" value="' + esc(c.label) + '" maxlength="16" aria-label="카테고리 이름"><label class="a-check"><input type="checkbox" name="caton-' + i + '"' + (c.on !== false ? " checked" : "") + "><span>보이기</span></label></div>").join("") +
          '<div class="a-form-actions"><button class="a-btn a-btn-primary" type="submit">카테고리 저장</button></div></form></section>' +
        '<section class="a-card"><div class="a-card-head"><h2>다루는 부업 · 찜 순위</h2><span class="a-muted">찜이 많은 부업 = 다음에 열 클래스 후보</span></div>' +
          '<ol class="vda-rank">' + rank.map((r, i) => '<li><b>' + (i + 1) + "</b><span>" + esc(r[0]) + '</span><i><u style="width:' + Math.round(r[1] / mx * 100) + '%"></u></i><small>' + r[1] + "</small></li>").join("") + "</ol>" +
          '<form id="vda-topic-form" class="a-form" novalidate><div class="a-field"><label for="vda-topics">첫 화면 부업 칩 <small>(한 줄에 하나 · 순서대로 3줄로 나눠 보여요)</small></label><textarea class="a-input" id="vda-topics" name="topics" rows="6">' + esc((v.topics || []).join("\n")) + '</textarea></div><div class="a-form-actions"><button class="a-btn a-btn-primary" type="submit">부업 칩 저장</button></div></form></section>' +
        '<section class="a-card vda-span2"><div class="a-card-head"><h2>정산 · 입금 설정</h2></div><form id="vda-set-form" class="a-form" novalidate>' +
          '<div class="a-form-row"><div class="a-field"><label for="vda-share">기본 VOD 정산 비율 (강사 %)</label><input class="a-input" id="vda-share" name="share" type="number" min="0" max="100" value="' + esc(s.share) + '"><small class="a-muted">기본 강사 50 : 플랫폼 50 · 강사별로 확정한 비율 → 강의별 계약 비율이 있으면 그게 먼저예요</small></div>' +
            '<div class="a-field"><label for="vda-adsp">광고비 강사 분담 (%)</label><input class="a-input" id="vda-adsp" name="adSplit" type="number" min="0" max="100" value="' + esc(VX().adSplitOf()) + '"><small class="a-muted">기본 50 · 달마다 적은 광고비 중 강사 몫 (VOD 매출 · 주문 › 정산 비율 · 광고비)</small></div></div>' +
          '<div class="a-form-row"><div class="a-field"><label for="vda-bank">무통장 은행</label><input class="a-input" id="vda-bank" name="bank" value="' + esc(s.bank || "") + '" maxlength="20" placeholder="' + esc(b.bank || "비우면 기수 입금 계좌") + '"></div><div class="a-field"><label for="vda-holder">예금주</label><input class="a-input" id="vda-holder" name="holder" value="' + esc(s.holder || "") + '" maxlength="30" placeholder="' + esc(b.holder || "(주)두고홀딩스") + '"></div></div>' +
          '<div class="a-field"><label for="vda-account">계좌번호</label><input class="a-input" id="vda-account" name="account" value="' + esc(s.account || "") + '" maxlength="40" placeholder="' + esc(b.account || "비우면 기수 입금 계좌") + '"></div>' +
          '<label class="a-check vda-demo"><input type="checkbox" name="demoLogin"' + (s.demoLogin === false ? "" : " checked") + '><span><b>체험 계정 쓰기</b> · vod@gmail.com / vod <small class="a-muted">로그인 화면에 안내가 보이고 누구나 이 계정으로 들어와 산 강의 6개를 볼 수 있어요. 정식 오픈 전에 끄면 안내가 사라지고 로그인이 막혀요.</small></span></label>' +
          '<div class="a-form-row"><div class="a-field"><label for="vda-days">입금 기한 (일)</label><input class="a-input" id="vda-days" name="payDays" type="number" min="1" max="14" value="' + esc(s.payDays || 3) + '"></div><div class="a-field"><label for="vda-rp">후기 작성 포인트 (P)</label><input class="a-input" id="vda-rp" name="reviewPoint" type="number" min="0" max="100000" step="100" value="' + esc(s.reviewPoint == null ? 500 : s.reviewPoint) + '"><small class="a-muted">수강 후기를 쓴 회원에게 주는 포인트 · 1P = 1원</small></div></div>' +
          '<h3 class="vda-set-h">수강권 · 부가 상품 기본값 <small>클래스에서 비워 둔 칸은 이 값을 써요</small></h3>' +
          '<div class="a-form-row"><div class="a-field"><label for="vda-ext">1년 연장권 가격 (365일 수강권의 %)</label><input class="a-input" id="vda-ext" name="extendPct" type="number" min="1" max="100" value="' + esc(s.extendPct == null ? 50 : s.extendPct) + '"><small class="a-muted">기간이 끝난(또는 30일 이내로 남은) 수강생이 진도 그대로 1년 더 들을 때</small></div><div class="a-field"><label for="vda-ash">부가 상품 강사 정산 비율 (%)</label><input class="a-input" id="vda-ash" name="addonShare" type="number" min="0" max="100" value="' + esc(s.addonShare == null ? 50 : s.addonShare) + '"><small class="a-muted">1:1 코칭권 · TEA TIME (강사가 직접 시간을 쓰는 상품)</small></div></div>' +
          '<div class="a-form-row"><div class="a-field"><label for="vda-cn">1:1 코칭권 횟수</label><input class="a-input" id="vda-cn" name="coachN" type="number" min="1" max="50" value="' + esc((s.coach || {}).n || 5) + '"></div><div class="a-field"><label for="vda-cd">코칭권 사용 기간 (일)</label><input class="a-input" id="vda-cd" name="coachDays" type="number" min="7" max="730" value="' + esc((s.coach || {}).days || 180) + '"></div><div class="a-field"><label for="vda-cp">코칭권 가격 (원)</label><input class="a-input" id="vda-cp" name="coachPrice" type="number" min="0" step="1000" value="' + esc((s.coach || {}).price || 150000) + '"></div></div>' +
          '<div class="a-form-row"><div class="a-field"><label for="vda-tm">TEA TIME 시간 (분)</label><input class="a-input" id="vda-tm" name="teaMin" type="number" min="15" max="240" step="15" value="' + esc((s.tea || {}).min || 60) + '"></div><div class="a-field"><label for="vda-tp">TEA TIME 가격 (원)</label><input class="a-input" id="vda-tp" name="teaPrice" type="number" min="0" step="1000" value="' + esc((s.tea || {}).price || 99000) + '"></div></div>' +
          '<p class="a-muted p-small">' + icon("alert", "xs") + (vdSrv() ? " 무통장 입금은 계좌를 넣고 저장하면 바로 결제 화면에 열려요 (비우면 기수 입금 계좌). 카드 · 간편결제는 PG 심사가 끝나고 포트원 키를 넣으면 열려요." : " 시안이라 카드 · 간편결제는 바로 ‘결제 완료’로 기록돼요. 정식 오픈 때 PG(토스페이먼츠 등)를 연결하면 실제 결제 · 자동 환불이 돼요.") + "</p>" +
          '<div class="a-form-actions"><button class="a-btn a-btn-primary" type="submit">설정 저장</button></div></form></section></div>' + vdHelpCard();
  }
  /* 고객센터 FAQ · 공지: 스토어 마이페이지 › 고객센터에 보여요 (FAQ를 처음 고치면 기본 FAQ를 복사해서 시작해요) */
  const HELP_CATS = ["수강", "결제 · 환불", "LIVE", "쿠폰 · 포인트", "계정", "기타"];
  function vdHelpCard() {
    const v = VD(), X = VX(), faq = X.helpFaq(), nts = (v.notices || []).slice().sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.at - a.at), mine = Array.isArray(v.helpFaq) && v.helpFaq.length;
    return '<section class="a-card"><div class="a-card-head"><h2>고객센터 FAQ · 공지</h2><span class="a-muted">스토어 마이페이지 › 고객센터에 보여요. 고치면 바로 반영돼요.</span>' + btn(icon("plus", "sm") + "공지 쓰기", "vda-nt-edit", "a-btn-ghost a-btn-sm vda-ml") + btn(icon("plus", "sm") + "FAQ 추가", "vda-faq-edit", "a-btn-ghost a-btn-sm") + "</div>" +
      '<h4 class="vda-mem-h">공지사항 ' + nts.length + "개</h4>" + (nts.length ? '<ul class="vda-help-l">' + nts.map((x) => "<li" + (x.on === false ? ' class="off"' : "") + ">" + (x.pin ? pill("필독", "warn") : pill("공지", "info")) + "<b>" + esc(x.title) + "</b><small>" + esc(DB.date.toStr(new Date(x.at))) + (x.on === false ? " · 숨김" : "") + "</small>" + btn("고치기", "vda-nt-edit", "a-btn-ghost a-btn-sm", ' data-id="' + esc(x.id) + '"') + btn(x.on === false ? "보이기" : "숨기기", "vda-nt-on", "a-btn-ghost a-btn-sm", ' data-id="' + esc(x.id) + '"') + btn("삭제", "vda-nt-del", "a-btn-ghost a-btn-sm", ' data-id="' + esc(x.id) + '"') + "</li>").join("") + "</ul>" : '<p class="a-muted p-small">아직 공지가 없어요. 휴무 · 결제 점검 · 새 기능 소식을 알려 보세요.</p>') +
      '<h4 class="vda-mem-h">자주 묻는 질문 ' + faq.length + "개" + (mine ? "" : ' <small class="a-muted">(기본값 · 고치면 그때부터 내 FAQ로 바뀌어요)</small>') + '</h4><ul class="vda-help-l">' + faq.map((f, i) => '<li><span class="vda-help-cat">' + esc(f[0]) + "</span><b>" + esc(f[1]) + '</b><button type="button" class="a-icon-btn sm" data-action="vda-faq-mv" data-i="' + i + '" data-dir="-1" aria-label="위로"' + (i === 0 ? " disabled" : "") + ">" + icon("arrowUp", "sm") + "</button>" + btn("고치기", "vda-faq-edit", "a-btn-ghost a-btn-sm", ' data-i="' + i + '"') + btn("삭제", "vda-faq-del", "a-btn-ghost a-btn-sm", ' data-i="' + i + '"') + "</li>").join("") + "</ul></section>";
  }
  const vdFaqMine = () => { const v = VD(); if (!Array.isArray(v.helpFaq) || !v.helpFaq.length) v.helpFaq = DB.clone(VX().HELP_FAQ_DEF); return v.helpFaq; };
  /** 환불 창 안내: 어떻게 돌려주는지 (포트원 결제 취소 · 가상계좌 계좌 환불 · 무통장 직접 송금) */
  function vdRefHow(o) {
    const X = VX(), acct = (o.refundReq && o.refundReq.acct) || (o.claim && o.claim.acct) || null;
    if (vdPgReal(o) && o.method !== "vbank") return '<p class="vr-how ok">' + icon("shieldCheck", "xs") + " <span><b>포트원으로 바로 결제 취소돼요.</b> 포트원 사이트에 들어가지 않아도 돼요. 카드는 카드사에 따라 3~7영업일, 간편결제 · 계좌이체는 보통 바로 돌아가요.</span></p>";
    if (o.method === "vbank") return '<div class="vr-how">' + icon("coins", "xs") + " <span><b>가상계좌 결제는 회원 계좌로 돌려줘요.</b> " + (vdPgReal(o) ? "포트원이 아래 계좌로 환불해요 (영업일 1~2일 · PG 가상계좌 환불 서비스 필요)." : "아래 계좌로 직접 송금해 주세요.") + "</span></div>" + '<div class="a-field"><label>환불 계좌' + (acct ? " <small>(회원이 요청에 적은 계좌)</small>" : "") + "</label>" + X.acctFields(acct) + "</div>";
    if (o.method === "bank") return '<div class="vr-how">' + icon("coins", "xs") + " <span><b>무통장 입금은 아래 계좌로 직접 송금해 주세요.</b> 환불 처리 뒤 ‘환불 · 취소 관리 › 계좌 송금 대기’에서 송금 완료를 눌러요.</span></div>" + '<div class="a-field"><label>환불 계좌' + (acct ? " <small>(회원이 요청에 적은 계좌)</small>" : "") + "</label>" + X.acctFields(acct) + "</div>";
    return '<p class="vr-how">' + icon("alert", "xs") + " <span>결제(PG) 연결 전이라 환불 기록만 남아요. 실제 돈은 따로 돌려줘야 해요.</span></p>";
  }
  /** 종이책 환불 창: 취소 · 반품 요청이면 단순 변심 왕복 배송비를 뺀 금액을 추천해요 */
  function vdBookRefund(o) {
    const X = VX(), c = X.claimOf(o), st = X.shipStOf(o), fee = X.claimFee(o, c), sug = Math.max(0, o.amount - fee), k = c ? c.k : st === "ship" || st === "done" ? "return" : "cancel";
    const WHY = ["주문 취소 (보내기 전)", "단순 변심 반품", "파손 · 파본", "잘못 보낸 책", "배송 사고 · 분실", "기타"], pre = k === "cancel" ? WHY[0] : /변심/.test((c && c.why) || "") ? WHY[1] : /파손|파본/.test((c && c.why) || "") ? WHY[2] : /잘못/.test((c && c.why) || "") ? WHY[3] : /오지|분실/.test((c && c.why) || "") ? WHY[4] : WHY[5];
    openModal(k === "cancel" ? "주문 취소 · 환불" : "반품 환불", '<form id="vda-ref-form" class="a-form" data-id="' + esc(o.id) + '" novalidate><p>' + esc(o.title) + " · " + (Number(o.qty) || 1) + "권 · 결제 <b>" + won(o.amount) + "</b>" + (o.shipFee ? " (배송비 " + won(o.shipFee) + " 포함)" : "") + "</p>" +
      '<p class="a-muted p-small">' + (c ? esc(X.claimTxt(c)) + " · " + esc(c.why || "") + (c.text ? " — " + esc(c.text) : "") + "<br>" : "") + (k === "cancel" ? "보내기 전 취소는 전액 환불해요." : fee ? "단순 변심 반품이라 왕복 배송비 " + won(fee) + "을 빼고 환불해요. 책이 돌아와 상태를 확인한 뒤 환불해 주세요." : "파손 · 파본 · 잘못 보낸 책 · 배송 사고는 전액 환불해요.") + "</p>" +
      '<div class="a-form-row"><div class="a-field"><label for="vr-amt">환불 금액 (원)</label><input class="a-input" id="vr-amt" name="amt" type="number" min="0" max="' + o.amount + '" step="10" value="' + sug + '"><small class="a-muted">추천 ' + won(sug) + "</small></div>" +
      '<div class="a-field"><label for="vr-why">환불 사유</label><select class="a-input" id="vr-why" name="why">' + WHY.map((w) => "<option" + (w === pre ? " selected" : "") + ">" + w + "</option>").join("") + "</select></div></div>" +
      '<div class="a-field"><label for="vr-memo">메모 <small>(선택)</small></label><input class="a-input" id="vr-memo" name="memo" maxlength="120"' + (c ? ' value="' + esc(X.claimTxt(c) + " · " + (c.why || "")) + '"' : "") + "></div>" +
      vdRefHow(o) + '<p class="a-error" id="vr-error"></p></form>',
      btn("취소", "modal-close") + '<button class="a-btn a-btn-danger" type="submit" form="vda-ref-form">' + (vdPgReal(o) ? "포트원으로 환불하기" : o.method === "bank" ? "환불 처리 (송금 대기로)" : "환불 완료로 바꾸기") + "</button>", "md");
  }
  /** 반려: 요청을 claim(no)로 옮기고 사유를 남겨요 — 회원이 다시 요청할 수 있어요 */
  function saveBoNo(f) {
    const o = VD().orders.find((x) => x.id === f.dataset.id), X = VX(), c = o && X.claimOf(o); if (!c) { closeModal(); return; }
    const note = [f.pre.value, f.note.value.trim()].filter(Boolean).join(" · ").slice(0, 160);
    if (!note) { toast("반려 사유를 골라 주세요.", "warn"); return; }
    o.claim = { k: c.k, st: "no", why: c.why, text: c.text, at: c.at, note, noAt: Date.now(), by: (staffMe() || {}).name || "마스터" }; delete o.refundReq;
    commit("‘" + o.no + "’ " + X.CLAIM_K[c.k] + " 요청을 반려했어요. 회원 화면에 사유가 보여요.");
  }
  function saveVodRefund(f) {
    const v = VD(), o = v.orders.find((x) => x.id === f.dataset.id), amt = Math.round(Number(f.amt.value)), errEl = document.getElementById("vr-error");
    if (!o || o.status !== "paid") { closeModal(); return; }
    if (!(amt >= 0 && amt <= o.amount)) { errEl.textContent = "환불 금액은 0원 ~ " + won(o.amount) + " 사이로 적어 주세요."; return; }
    // 함께 결제한 코칭권: 쓴 횟수만큼 빼고 환불
    const grpAmt = (x) => { const used = x.coach ? Number(x.coach.used) || 0 : 0, per = x.coach && x.coach.n ? Math.round(x.amount / x.coach.n) : 0; return x.coach ? Math.max(0, x.amount - used * per) : x.amount; };
    const grp = f.withGrp && f.withGrp.checked ? v.orders.filter((x) => x.grp === o.no && x.status === "paid") : [];
    const real = !!(VX().payServer && VX().payServer() && o.pg && o.pg.paymentId);
    const by = (staffMe() || {}).name || "ADMIN";
    // 무통장 · 가상계좌: 돌려줄 계좌 (금액이 0원이면 필요 없어요)
    let acct = null;
    if ((o.method === "bank" || o.method === "vbank") && amt > 0) { const r = VX().acctRead(f); if (r.err) { errEl.textContent = r.err; return; } acct = r.acct; }
    const apply = (okNos) => {
      const done = (x) => !okNos || okNos.indexOf(x.no) >= 0;
      let extra = 0;
      if (done(o)) {
        const cl0 = o.ship ? VX().claimOf(o) : null; // 환불로 바꾸기 전에 읽어요 (바꾼 뒤엔 요청이 안 보여요)
        if (o.tea) o.tea.st = "cancel";
        Object.assign(o, { status: "refunded", refundedAt: Date.now(), refundAmount: amt, refundKind: amt < o.amount ? "partial" : "master", refundWhy: f.why.value, refundMemo: f.memo.value.trim(), refundBy: by, pg: Object.assign({}, o.pg || {}, { st: real ? "done" : o.method === "bank" ? o.pg && o.pg.st || "bank" : "mock", at: Date.now() }) });
        if (amt === o.amount && VX().restoreOrder) VX().restoreOrder(o);
        if (cl0) { o.claim = { k: cl0.k, st: "pick", why: cl0.why, text: cl0.text, at: cl0.at, okAt: (o.claim && o.claim.okAt) || Date.now(), by }; if (cl0.rinv) Object.assign(o.claim, { rinv: cl0.rinv, rcar: cl0.rcar }); if (cl0.acct) o.claim.acct = cl0.acct; }
        delete o.refundReq;
      }
      grp.filter(done).forEach((x) => { const ra = grpAmt(x); Object.assign(x, { status: "refunded", refundedAt: Date.now(), refundAmount: ra, refundWhy: "함께 결제한 강의 환불", refundBy: by }, real ? { pg: Object.assign({}, x.pg || {}, { st: "done", at: Date.now() }) } : {}); extra += ra; });
      // 무통장 (또는 PG 없이 처리한 가상계좌): 마스터가 직접 송금할 차례 → 환불 · 취소 관리 ‘계좌 송금 대기’
      if (acct && done(o) && !real) o.refundPay = Object.assign({}, acct, { amount: amt + extra, st: "wait", at: Date.now() });
      commit(o.no + (amt < o.amount ? " 부분 환불(" + won(amt) + ")" : " 환불") + "을 처리했어요." + (extra ? " 함께 결제한 상품 " + won(extra) + "도 환불했어요." : ""));
    };
    if (!real) return apply(null);
    // 정식 서버: 포트원 결제 취소가 성공한 주문만 환불 완료로 바꿔요 (실패하면 그대로 두고 알려 드려요)
    if (f.dataset.busy) return;
    f.dataset.busy = "1"; errEl.textContent = "포트원에 결제 취소를 요청하고 있어요…";
    const jobs = [[o.no, amt]].concat(grp.map((x) => [x.no, grpAmt(x)])), okNos = [];
    jobs.reduce((pr, j) => pr.then(() => VX().payApi("refund", Object.assign({ no: j[0], amount: j[1], reason: f.why.value }, acct && o.method === "vbank" ? { refundAccount: acct } : {})).then((r) => { if (!r || !r.ok) throw new Error((r && r.message) || "결제 취소에 실패했어요."); okNos.push(j[0]); })), Promise.resolve())
      .then(() => apply(okNos), (e) => {
        delete f.dataset.busy;
        if (okNos.length) { apply(okNos); toast(String(e.message) + " — 일부만 취소됐어요. 포트원 콘솔에서 확인해 주세요.", "warn"); return; }
        errEl.textContent = String(e.message) + " 포트원 콘솔에서 결제 상태를 확인해 주세요.";
      });
  }
  function saveVsProfile(f) {
    const ins = DB.instructor(IID()), err = document.getElementById("vs-error"), val = (k) => (f[k] ? f[k].value.trim() : "");
    if (!ins) return;
    const type = (f.querySelector("input[name=type]:checked") || {}).value === "biz" ? "biz" : "person";
    if (!val("name") || !val("bank") || !val("account") || !val("holder")) { err.textContent = "이름 · 은행 · 계좌번호 · 예금주를 모두 적어 주세요."; return; }
    if (type === "biz" && !/^\d{3}-?\d{2}-?\d{5}$/.test(val("bizNo"))) { err.textContent = "사업자등록번호 10자리를 확인해 주세요."; return; }
    if (val("email") && !EMAIL_RE.test(val("email"))) { err.textContent = "이메일을 확인해 주세요."; return; }
    ins.vodSettle = { type, name: val("name"), bizNo: type === "biz" ? val("bizNo") : "", bank: val("bank"), account: val("account"), holder: val("holder"), email: val("email"), at: Date.now() };
    commit("정산 받을 정보를 저장했어요.");
  }
  function vdInvForm(ym) {
    const st = vdStmt(IID(), ym);
    const inv = st.invIns || st.net + st.vat, sup = Math.round(inv / 1.1);
    openModal("세금계산서 발행 완료 알리기", '<form id="vs-inv-form" class="a-form" data-m="' + esc(ym) + '" novalidate><p class="a-muted">' + esc(vdYMtxt(ym)) + " 판매분 · " + (st.mode === "gross" ? "판매가 합계 " : st.mode === "net" ? "정산 금액 " : "") + "공급가액 <b>" + won(sup) + "</b> + 부가세 <b>" + won(inv - sup) + "</b> = <b>" + won(inv) + "</b>으로 (주)두고홀딩스에 전자세금계산서를 발행한 뒤 승인번호를 적어 주세요." + (st.invPf ? " 두고홀딩스는 플랫폼 수수료 <b>" + won(st.invPf) + "</b> 세금계산서를 강사님께 발행하고, 차액 <b>" + won(st.pay) + "</b>을 지급해요." : "") + "</p>" +
      '<div class="a-field"><label for="vs-invno">승인번호</label><input class="a-input" id="vs-invno" name="invNo" maxlength="40" placeholder="20261103-41000000-00000000"></div><p class="a-error" id="vs-inv-error"></p></form>',
      btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="vs-inv-form">발행 완료 알리기</button>', "md");
  }
  function saveVsInvoice(f) {
    const r = vdPayout(IID(), f.dataset.m), no = f.invNo.value.trim();
    if (!r) { closeModal(); return; }
    if (no.length < 6) { document.getElementById("vs-inv-error").textContent = "승인번호를 적어 주세요."; return; }
    Object.assign(r, { invReqAt: Date.now(), invNo: no });
    commit("세금계산서 발행을 알렸어요. 마스터가 확인하면 지급돼요.");
  }
  // 쿠폰: 원본(coupons) + 회원이 받은 쿠폰(memberCoupons). 이미 받은 회원이 있으면 지우지 않고 끄기만 한다
  const vdCpStat = (c) => { const all = []; Object.keys(VD().memberCoupons || {}).forEach((k) => (VD().memberCoupons[k] || []).forEach((x) => { if (x.cid === c.id) all.push(x); })); return { n: all.length, used: all.filter((x) => x.usedAt).length }; };
  function vdCouponCard(v) {
    const cps = v.coupons || [];
    return '<section class="a-card"><div class="a-card-head"><h2>쿠폰</h2><span class="a-muted">회원은 마이페이지 › 쿠폰에서 코드를 등록하고, 결제 화면에서 골라 써요.</span>' + btn(icon("plus", "sm") + "쿠폰 만들기", "vda-cp-add", "a-btn-primary a-btn-sm vda-ml") + "</div>" +
      (cps.length ? '<div class="a-table-wrap"><table class="a-table vda-table"><thead><tr><th>쿠폰</th><th>코드</th><th>할인</th><th>조건</th><th>기간</th><th>받음 · 사용</th><th>켜기</th><th class="right">관리</th></tr></thead><tbody>' +
        cps.map((c, i) => { const st = vdCpStat(c); return "<tr" + (c.on === false ? ' class="a-dim"' : "") + "><td><b>" + esc(c.name) + "</b>" + (c.auto === "signup" ? '<small class="a-memo">가입하면 자동으로 줘요</small>' : "") + (c.dl ? '<small class="a-memo">상세페이지에서 받기</small>' : "") + '</td><td class="vda-nw"><code>' + esc(c.code || "-") + '</code></td><td class="vda-nw">' + esc(VX().couponTxt(c)) + "</td><td>" + esc(VX().couponCond(c)) + '</td><td class="vda-nw">' + (c.days ? "받은 날부터 " + c.days + "일" : c.endAt ? esc(c.endAt) + "까지" : "기한 없음") + '</td><td class="num">' + st.n + "명 · " + st.used + "회</td><td>" +
          '<button type="button" class="a-switch' + (c.on !== false ? " on" : "") + '" data-action="vda-cp-on" data-i="' + i + '" role="switch" aria-checked="' + (c.on !== false) + '" aria-label="쿠폰 켜기"><i></i></button></td><td class="right">' + btn("수정", "vda-cp-edit", "a-btn-ghost a-btn-sm", ' data-i="' + i + '"') + '<button type="button" class="a-icon-btn" data-action="vda-cp-del" data-i="' + i + '" aria-label="쿠폰 지우기">' + icon("trash", "sm") + "</button></td></tr>"; }).join("") + "</tbody></table></div>" : emptyBox("coins", "아직 쿠폰이 없어요.")) + "</section>";
  }
  function vdCpForm(i) {
    const v = VD(), c = i == null ? { name: "", code: "", kind: "won", value: 5000, max: "", min: "", days: 30, endAt: "", types: [], auto: "", dl: false, on: true } : v.coupons[i];
    const T = VX().TYPE;
    openModal(i == null ? "쿠폰 만들기" : "쿠폰 수정",
      '<form id="vda-cp-form" class="a-form" data-i="' + (i == null ? "" : i) + '" novalidate>' +
        '<div class="a-field"><label for="vc-name">쿠폰 이름</label><input class="a-input" id="vc-name" name="name" value="' + esc(c.name) + '" maxlength="30" placeholder="예) 신규 가입 10% 할인"></div>' +
        '<div class="a-form-row"><div class="a-field"><label for="vc-code">쿠폰 코드</label><input class="a-input" id="vc-code" name="code" value="' + esc(c.code || "") + '" maxlength="20" placeholder="예) WELCOME" style="text-transform:uppercase"><small class="a-muted">영문 · 숫자. 회원이 이 코드를 등록해요.</small></div>' +
          '<div class="a-field"><label for="vc-kind">할인 방식</label><select class="a-input" id="vc-kind" name="kind"><option value="pct"' + (c.kind === "pct" ? " selected" : "") + '>% 할인</option><option value="won"' + (c.kind === "won" ? " selected" : "") + ">금액 할인 (원)</option></select></div></div>" +
        '<div class="a-form-row"><div class="a-field"><label for="vc-value">할인 값</label><input class="a-input" id="vc-value" name="value" type="number" min="1" value="' + esc(c.value) + '" inputmode="numeric"><small class="a-muted">% 할인이면 1~90, 금액 할인이면 원</small></div><div class="a-field"><label for="vc-max">최대 할인 (원)</label><input class="a-input" id="vc-max" name="max" type="number" min="0" step="1000" value="' + esc(c.max || "") + '" inputmode="numeric" placeholder="% 할인일 때만 · 비우면 제한 없음"></div></div>' +
        '<div class="a-form-row"><div class="a-field"><label for="vc-min">최소 결제 금액 (원)</label><input class="a-input" id="vc-min" name="min" type="number" min="0" step="1000" value="' + esc(c.min || "") + '" inputmode="numeric" placeholder="비우면 제한 없음"></div><div class="a-field"><label for="vc-days">쓸 수 있는 기간</label><input class="a-input" id="vc-days" name="days" type="number" min="0" max="365" value="' + esc(c.days || "") + '" inputmode="numeric" placeholder="받은 날부터 며칠"><small class="a-muted">또는 아래 마감일 (둘 다 쓰면 더 빠른 날까지)</small></div></div>' +
        '<div class="a-field"><label for="vc-end">마감일</label><input class="a-input" id="vc-end" name="endAt" type="date" value="' + esc(c.endAt || "") + '"></div>' +
        '<div class="a-field"><span class="a-label">쓸 수 있는 상품 <small>(아무것도 안 고르면 전체)</small></span><div class="vda-checks">' + Object.keys(T).map((k) => '<label class="a-check"><input type="checkbox" name="types" value="' + k + '"' + ((c.types || []).indexOf(k) >= 0 ? " checked" : "") + "><span>" + T[k][0] + "</span></label>").join("") + "</div></div>" +
        '<label class="a-check"><input type="checkbox" name="auto"' + (c.auto === "signup" ? " checked" : "") + "><span>새로 가입한 회원에게 자동으로 주기</span></label>" +
        '<label class="a-check"><input type="checkbox" name="dl"' + (c.dl ? " checked" : "") + "><span>클래스 상세페이지 ‘사용 가능한 쿠폰이 있어요!’에서 받게 하기</span></label>" +
        '<p class="a-error" id="vc-error"></p></form>',
      btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="vda-cp-form">저장</button>', "md");
  }
  function saveVodCoupon(f) {
    const v = VD(), i = f.dataset.i === "" ? null : Number(f.dataset.i), err = document.getElementById("vc-error"), n = (k) => Math.max(0, Math.round(Number(f[k].value) || 0));
    const code = f.code.value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, ""), kind = f.kind.value, value = n("value");
    if (!f.name.value.trim()) { err.textContent = "쿠폰 이름을 적어 주세요."; return; }
    if (!code) { err.textContent = "쿠폰 코드를 영문 · 숫자로 적어 주세요."; return; }
    if ((v.coupons || []).some((c, j) => j !== i && String(c.code || "").toUpperCase() === code)) { err.textContent = "이미 있는 쿠폰 코드예요."; return; }
    if (!value || (kind === "pct" && value > 90)) { err.textContent = kind === "pct" ? "할인율은 1~90% 사이로 정해 주세요." : "할인 금액을 적어 주세요."; return; }
    v.coupons = v.coupons || [];
    const old = i == null ? { id: DB.uid("cp"), on: true } : v.coupons[i];
    const x = Object.assign({}, old, { name: f.name.value.trim(), code, kind, value, max: kind === "pct" ? n("max") : 0, min: n("min"), days: n("days"), endAt: f.endAt.value, types: Array.from(f.querySelectorAll("input[name=types]:checked")).map((y) => y.value), dl: !!(f.dl && f.dl.checked), auto: f.auto.checked ? "signup" : "" });
    if (i == null) v.coupons.push(x); else v.coupons[i] = x;
    commit("‘" + x.name + "’ 쿠폰을 " + (i == null ? "만들었어요." : "저장했어요."));
  }
  function vdIqForm(id) {
    const x = (VD().inquiries || []).find((y) => y.id === id); if (!x) return;
    const m = vdMember(x.mid) || {};
    openModal("1:1 문의 답변", '<form id="vda-iq-form" class="a-form" data-id="' + esc(id) + '" novalidate><div class="a-field"><span class="a-label">' + esc(m.name || "") + " 님 · " + esc(x.cat) + (x.order ? " · 주문 " + esc(x.order) : "") + '</span><p class="vda-iq-q"><b>' + esc(x.title) + "</b><br>" + esc(x.text) + '</p></div><div class="a-field"><label for="vq-a">답변</label><textarea class="a-input" id="vq-a" name="answer" rows="5" maxlength="1000" placeholder="회원 마이페이지 › 고객센터에 그대로 보여요.">' + esc(x.answer || "") + '</textarea></div><p class="a-error" id="vq-error"></p></form>',
      btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="vda-iq-form">답변 저장</button>', "md");
  }
  function saveVodAnswer(f) {
    const x = (VD().inquiries || []).find((y) => y.id === f.dataset.id); if (!x) return;
    const a = f.answer.value.trim(); if (a.length < 2) { document.getElementById("vq-error").textContent = "답변을 적어 주세요."; return; }
    x.answer = a; x.answeredAt = Date.now(); commit("문의에 답변했어요. 회원 마이페이지에 바로 보여요.");
  }
  /* ---------- 첫 화면 배너 편집 ----------
   * 이미지 배너: PC · 모바일 이미지를 따로 올리고(권장 크기 안내 + 미리보기), 누르면 갈 곳 · 새 창 · 노출 기간을 정해요.
   * 시안은 이미지를 이 브라우저(IndexedDB)에 저장해요. 정식 서버에서는 같은 자리에 파일 저장소 주소가 들어가요. */
  const BAN_PC = [1672, 736], BAN_M = [1050, 600], BAN_MAX = 5 * 1024 * 1024;
  const BANSZ = { pc: ["PC 이미지", BAN_PC, "monitor", "가로:세로 약 2.3 : 1 · 화면 폭 836px 기준 2배 크기"], m: ["모바일 이미지", BAN_M, "smartphone", "가로:세로 7 : 4 · 비우면 PC 이미지를 가운데 맞춰 잘라 써요"] };
  /* ---------- 첫 화면 카테고리 아이콘 (배너 아래 아이콘 줄) ---------- */
  const TILE_MAX = 1024 * 1024;
  function vdTileCard(v) {
    if (!Array.isArray(v.tiles)) v.tiles = VX().seedTiles();
    const t = v.tiles, n = t.length;
    return '<section class="a-card"><div class="a-card-head"><h2>첫 화면 카테고리 아이콘</h2><span class="a-muted">배너 바로 아래 아이콘 줄이에요. 이름 · 누르면 갈 곳 · 아이콘 · 순서를 바꿔요. 아이콘은 정사각형 256 × 256px 이상 · 투명 배경 PNG/WebP 권장 · 1MB 이하.</span>' + btn(icon("plus", "sm") + "아이콘 추가", "vda-tile-add", "a-btn-ghost a-btn-sm vda-ml") + "</div>" +
      '<form id="vda-tile-form" class="a-form" novalidate><div class="vda-tiles">' + t.map((x, i) => '<div class="vda-tile' + (x.on === false ? " off" : "") + '">' +
        '<label class="vda-tile-ic" title="아이콘 바꾸기">' + (x.img ? "<img " + VX().imgAttr(x.img, "src") + ' alt="">' : icon("image", "sm")) + '<input type="file" class="vb-file-in" accept="image/png,image/webp,image/svg+xml,image/jpeg,image/gif" data-vt-up="' + i + '" aria-label="' + esc(x.label) + ' 아이콘 바꾸기"><span>' + icon("upload", "xs") + "</span></label>" +
        '<input class="a-input" name="tl-' + i + '" value="' + esc(x.label || "") + '" maxlength="14" placeholder="이름" aria-label="아이콘 이름">' +
        '<input class="a-input vda-tile-href" name="th-' + i + '" value="' + esc(x.href || "") + '" maxlength="300" placeholder="#/vod/c/all 또는 https://…" aria-label="누르면 갈 곳">' +
        '<input class="a-input vda-tile-bd" name="tb-' + i + '" value="' + esc(x.badge || "") + '" maxlength="5" placeholder="배지" aria-label="배지 (예: NEW)">' +
        '<div class="vda-tile-a"><button type="button" class="a-switch' + (x.on !== false ? " on" : "") + '" data-action="vda-tile-on" data-i="' + i + '" role="switch" aria-checked="' + (x.on !== false) + '" aria-label="보이기"><i></i></button>' +
        '<button type="button" class="a-icon-btn" data-action="vda-tile-move" data-i="' + i + '" data-dir="-1" aria-label="앞으로"' + (i === 0 ? " disabled" : "") + ">" + icon("arrowUp", "sm") + '</button><button type="button" class="a-icon-btn" data-action="vda-tile-move" data-i="' + i + '" data-dir="1" aria-label="뒤로"' + (i === n - 1 ? " disabled" : "") + ">" + icon("arrowDown", "sm") + "</button>" +
        (x.key && x.img !== VX().tileImg(x.key) ? '<button type="button" class="a-icon-btn" data-action="vda-tile-reimg" data-i="' + i + '" aria-label="기본 아이콘으로" title="기본 아이콘으로">' + icon("refresh", "sm") + "</button>" : "") +
        '<button type="button" class="a-icon-btn" data-action="vda-tile-del" data-i="' + i + '" aria-label="지우기">' + icon("trash", "sm") + "</button></div></div>").join("") + "</div>" +
      '<div class="a-form-actions"><button type="button" class="a-btn a-btn-ghost" data-action="vda-tile-reset">처음 구성으로</button><button class="a-btn a-btn-primary" type="submit">아이콘 줄 저장</button></div></form></section>';
  }
  // 버튼을 누르기 전에 적어 둔 이름 · 링크 · 배지를 먼저 담아 둬요 (다시 그려도 지워지지 않게)
  function vtSync() {
    const f = document.getElementById("vda-tile-form"), t = VD().tiles; if (!f || !t) return;
    t.forEach((x, i) => { if (f["tl-" + i]) { x.label = f["tl-" + i].value.trim(); x.href = f["th-" + i].value.trim(); x.badge = f["tb-" + i].value.trim(); } });
  }
  function saveVodTiles() {
    vtSync();
    const bad = VD().tiles.find((x) => x.href && !/^(#\/|https?:\/\/|\/)/.test(x.href));
    if (bad) { toast("‘" + (bad.label || "아이콘") + "’ 링크는 #/ 로 시작하는 사이트 안 주소나 https:// 주소를 넣어 주세요.", "warn"); return; }
    if (VD().tiles.some((x) => x.on !== false && !x.label)) { toast("보이는 아이콘에는 이름을 적어 주세요.", "warn"); return; }
    commit("첫 화면 카테고리 아이콘을 저장했어요.");
  }
  document.addEventListener("change", async (e) => {
    const t = e.target; if (!isActive() || !t.matches || !t.matches("[data-vt-up]")) return;
    const i = Number(t.dataset.vtUp), file = t.files && t.files[0], x = VD().tiles[i]; t.value = "";
    if (!file || !x) return;
    if (!/^image\//.test(file.type)) { toast("이미지 파일만 올릴 수 있어요.", "warn"); return; }
    if (file.size > TILE_MAX) { toast("아이콘은 1MB 이하로 올려 주세요.", "warn"); return; }
    const r = await VX().matPut(file).catch(() => null); if (!r) { toast("아이콘을 저장하지 못했어요.", "warn"); return; }
    vtSync(); x.img = r.url; commit("‘" + (x.label || "아이콘") + "’ 아이콘을 바꿨어요.");
  });
  function vdBanState(x) {
    const t = DB.date.todayStr(), md = (s) => Number(s.slice(5, 7)) + "." + Number(s.slice(8, 10));
    const st = x.on === false ? ["off", "꺼짐"] : x.from && t < x.from ? ["wait", md(x.from) + "부터"] : x.to && t > x.to ? ["end", "기간 끝"] : x.kind === "img" && !x.pc && !x.m ? ["end", "이미지 없음"] : VX().liveBanners().indexOf(x) < 0 ? ["end", "판매 영역 꺼짐"] : ["on", x.to ? "~" + md(x.to) + "까지" : "노출 중"];
    return '<i class="vda-ban-st ' + st[0] + '">' + st[1] + "</i>";
  }
  function vbPrev(k) {
    const d = ui.vbDraft || {}, u = d[k] || (k === "m" ? d.pc : "");
    return u ? "<img " + VX().imgAttr(u, "src") + ' alt="">' + (k === "m" && !d.m ? '<span class="vb-fb">PC 이미지를 잘라서 보여 줘요</span>' : "") : '<span class="vb-empty">' + icon(BANSZ[k][2], "lg") + "<b>" + BANSZ[k][1].join(" × ") + "</b><small>이미지를 올려 주세요</small></span>";
  }
  function vbUp(k) {
    const z = BANSZ[k], has = !!(ui.vbDraft || {})[k];
    return '<div class="vb-up" data-k="' + k + '"><div class="vb-up-h">' + icon(z[2], "sm") + "<b>" + z[0] + "</b>" + (k === "pc" ? '<em class="vb-req">필수</em>' : '<em class="vb-opt">선택</em>') + "<small>권장 <strong>" + z[1].join(" × ") + "px</strong> · " + z[3] + " · 더 크게 올려도 가로 " + z[1][0] + "px로 자동으로 맞추고 압축해요</small></div>" +
      '<div class="vb-frame vb-frame-' + k + '" id="vb-fr-' + k + '">' + vbPrev(k) + "</div>" +
      '<div class="vb-up-a"><label class="a-btn a-btn-ghost a-btn-sm vb-file"><input class="vb-file-in" type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-vb-up="' + k + '" aria-label="' + z[0] + ' 올리기">' + icon("upload", "sm") + "<span>" + (has ? "다른 이미지로 바꾸기" : "이미지 올리기") + "</span></label>" +
      (has ? '<button type="button" class="a-btn a-btn-ghost a-btn-sm" data-action="vda-ban-imgdel" data-k="' + k + '">' + icon("trash", "sm") + "<span>지우기</span></button>" : "") + '<span class="vb-info" id="vb-inf-' + k + '" aria-live="polite"></span></div></div>';
  }
  function vbPaint(k) {
    const box = document.querySelector('.vb-up[data-k="' + k + '"]'); if (!box) return;
    box.outerHTML = vbUp(k);
    const nb = document.querySelector('.vb-up[data-k="' + k + '"]'); VX().hydrate(nb); vbInfo(k);
  }
  function vbInfo(k) {
    const fr = document.getElementById("vb-fr-" + k), out = document.getElementById("vb-inf-" + k), img = fr && fr.querySelector("img"), f = document.getElementById("vda-ban-form");
    if (!out) return;
    if (!img || !(ui.vbDraft || {})[k]) { out.className = "vb-info"; out.textContent = ""; return; }
    const go = () => {
      const w = img.naturalWidth, h = img.naturalHeight; if (!w || w < 2) return;
      img.removeEventListener("load", go);
      const W = BANSZ[k][1][0], H = BANSZ[k][1][1], ok = Math.abs(w / h - W / H) / (W / H) < 0.05, small = w < W * 0.6, fit = f && f.dataset.fit === "contain";
      out.className = "vb-info " + (ok && !small ? "ok" : "warn");
      out.textContent = "올린 이미지 " + w + " × " + h + "px · " + (!ok ? "권장 비율과 달라요 (" + (fit ? "남는 곳은 배경색으로 채워요" : "가장자리가 조금 잘려요") + ")" : small ? "작아서 흐려 보일 수 있어요" : "권장 비율에 맞아요");
    };
    img.addEventListener("load", go); go();
  }
  function vbShrink(file, maxW) {
    return new Promise((ok, no) => {
      const u = URL.createObjectURL(file), im = new Image();
      im.onload = () => { const sc = Math.min(1, maxW / im.width), cv = document.createElement("canvas"); cv.width = Math.round(im.width * sc); cv.height = Math.round(im.height * sc); const c = cv.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(im, 0, 0, cv.width, cv.height); URL.revokeObjectURL(u); cv.toBlob((b) => (b ? ok(new File([b], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" })) : no(new Error("blob"))), "image/jpeg", 0.88); };
      im.onerror = () => { URL.revokeObjectURL(u); no(new Error("img")); }; im.src = u;
    });
  }
  async function vbUpload(input) {
    const k = input.dataset.vbUp, file = input.files && input.files[0]; input.value = "";
    if (!file || !ui.vbDraft) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) { toast("JPG · PNG · WebP · GIF 이미지만 올릴 수 있어요.", "warn"); return; }
    if (file.size > BAN_MAX) { toast("5MB 이하 이미지만 올릴 수 있어요. 지금 " + (file.size / 1048576).toFixed(1) + "MB예요.", "warn"); return; }
    let f = file;
    if (file.type !== "image/gif") f = await vbShrink(file, BANSZ[k][1][0]).catch(() => file);
    const r = await VX().matPut(f).catch(() => null);
    if (!r) { toast("이미지를 저장하지 못했어요. 다른 브라우저에서 다시 해 주세요.", "warn"); return; }
    ui.vbDraft[k] = r.url; vbPaint(k); if (k === "pc") vbPaint("m");
    const e = document.getElementById("vb-error"); if (e) e.textContent = "";
    toast(BANSZ[k][0] + "를 올렸어요. 저장을 눌러야 스토어에 반영돼요.");
  }
  document.addEventListener("change", (e) => { const t = e.target; if (!isActive() || !t.closest || !t.closest("#vda-ban-form")) return; if (t.matches("[data-vb-up]")) vbUpload(t); else if (t.name === "kind" || t.name === "fit") { t.form.dataset[t.name] = t.value; if (t.name === "fit") { vbInfo("pc"); vbInfo("m"); } } });
  document.addEventListener("input", (e) => { const t = e.target; if (isActive() && t.name === "bg" && t.closest && t.closest("#vda-ban-form")) t.form.style.setProperty("--vb-bg", t.value); });
  function vdBanForm(i) {
    const v = VD(), x = i == null ? { kind: "img", eyebrow: "", title: "", sub: "", pid: "", href: "", sticker: "", dark: false, color: ["#ff0037", "#ff0037"], on: true, img: "", pc: "", m: "", alt: "", fit: "cover", bg: "#111111" } : v.banners[i];
    const kind = x.kind === "img" ? "img" : "art", fit = x.fit === "contain" ? "contain" : "cover", bg = x.bg || "#111111";
    ui.vbDraft = { pc: x.pc || "", m: x.m || "" };
    const kr = (val, t, s, ic) => '<label class="vb-kind-o"><input type="radio" name="kind" value="' + val + '"' + (kind === val ? " checked" : "") + "><span>" + icon(ic, "sm") + "<b>" + t + "</b><small>" + s + "</small></span></label>";
    const fr = (val, t) => '<label class="vb-seg-o"><input type="radio" name="fit" value="' + val + '"' + (fit === val ? " checked" : "") + "><span>" + t + "</span></label>";
    openModal(i == null ? "배너 추가" : "배너 수정",
      '<form id="vda-ban-form" class="a-form vb-form" data-i="' + (i == null ? "" : i) + '" data-kind="' + kind + '" data-fit="' + fit + '" style="--vb-bg:' + esc(bg) + '" novalidate>' +
        '<div class="vb-kind" role="radiogroup" aria-label="배너 종류">' + kr("img", "이미지 배너", "디자이너가 만든 PC · 모바일 이미지를 그대로", "image") + kr("art", "디자인 배너", "글자 + 색만 넣으면 움직이는 배너로", "palette") + "</div>" +
        '<div class="vb-only-img">' + vbUp("pc") + vbUp("m") +
          '<div class="a-form-row"><div class="a-field"><span class="a-label">이미지 맞춤</span><div class="vb-seg">' + fr("cover", "꽉 채우기") + fr("contain", "전체 보이기") + '</div><small class="a-hint">비율이 다르면 ‘꽉 채우기’는 가장자리가 잘리고, ‘전체 보이기’는 남는 곳을 배경색으로 채워요.</small></div>' +
          '<div class="a-field"><label for="vb-bg">배경색</label><input class="a-input" id="vb-bg" name="bg" type="color" value="' + esc(bg) + '"></div></div>' +
          '<div class="a-field"><label for="vb-alt">배너 이름 · 대체 문구 <small>(화면 읽기 · 검색용 · 관리 목록에 보여요)</small></label><input class="a-input" id="vb-alt" name="alt" value="' + esc(x.alt || "") + '" maxlength="60" placeholder="예: 11월 블랙위크 최대 50% 할인"></div></div>' +
        '<div class="vb-only-art">' +
        '<div class="a-field"><label for="vb-eyebrow">작은 글씨 (위)</label><input class="a-input" id="vb-eyebrow" name="eyebrow" value="' + esc(x.eyebrow || "") + '" maxlength="30" placeholder="BEST · 문대표"></div>' +
        '<div class="a-field"><label for="vb-eyebrow">작은 글씨 (위)</label><input class="a-input" id="vb-eyebrow" name="eyebrow" value="' + esc(x.eyebrow || "") + '" maxlength="30" placeholder="BEST · 문대표"></div>' +
        '<div class="a-field"><label for="vb-title">큰 제목 <small>(두 줄 권장 · 줄바꿈 가능)</small></label><textarea class="a-input" id="vb-title" name="title" rows="2" maxlength="60">' + esc(x.title || "") + "</textarea></div>" +
        '<div class="a-field"><label for="vb-sub">설명</label><input class="a-input" id="vb-sub" name="sub" value="' + esc(x.sub || "") + '" maxlength="60"></div>' +
        '<div class="a-field"><label for="vb-sticker">오른쪽 스티커 문구 <small>(선택 · 넣으면 사진 대신 검정 별 모양 스티커 · 줄바꿈 가능 · 첫 줄은 연두색)</small></label><textarea class="a-input" id="vb-sticker" name="sticker" rows="3" maxlength="40">' + esc(x.sticker || "") + "</textarea></div>" +
        '<label class="a-check"><input type="checkbox" name="dark"' + (x.dark ? " checked" : "") + "><span>밝은 바탕이라 글자를 검정으로</span></label>" +
        '<div class="a-form-row"><div class="a-field"><label for="vb-c1">색 1</label><input class="a-input" id="vb-c1" name="c1" type="color" value="' + esc((x.color || [])[0] || "#141418") + '"></div><div class="a-field"><label for="vb-c2">색 2</label><input class="a-input" id="vb-c2" name="c2" type="color" value="' + esc((x.color || [])[1] || "#3a0f18") + '"></div></div>' +
        '<div class="a-field"><label for="vb-img">오른쪽 사진 <small>(선택 · 비우면 강사 사진)</small></label><input class="a-input" id="vb-img" name="img" type="file" accept="image/*">' + (x.img ? '<label class="a-check"><input type="checkbox" name="imgdel"><span>지금 사진 지우기</span></label>' : "") + "</div></div>" +
        '<fieldset class="vb-box"><legend>누르면 이동할 곳</legend>' +
        '<div class="a-field"><label for="vb-pid">클래스</label><select class="a-input" id="vb-pid" name="pid"><option value="">고르지 않음 (아래 링크로)</option>' + v.products.map((p) => '<option value="' + esc(p.id) + '"' + (p.id === x.pid ? " selected" : "") + ">" + esc(p.title) + "</option>").join("") + "</select></div>" +
        '<div class="a-field"><label for="vb-href">또는 링크 <small>(사이트 안: #/vod/c/all · #/vod/p/v1 · 바깥: https://…)</small></label><input class="a-input" id="vb-href" name="href" value="' + esc(x.href || "") + '" maxlength="300" placeholder="#/vod/c/all" inputmode="url"></div>' +
        '<label class="a-check"><input type="checkbox" name="newTab"' + (x.newTab ? " checked" : "") + "><span>새 창으로 열기 <small>(바깥 사이트 링크일 때 추천)</small></span></label></fieldset>" +
        '<fieldset class="vb-box"><legend>노출 기간 <small>(비우면 계속 노출)</small></legend><div class="a-form-row"><div class="a-field"><label for="vb-from">시작일</label><input class="a-input" id="vb-from" name="from" type="date" value="' + esc(x.from || "") + '"></div><div class="a-field"><label for="vb-to">종료일</label><input class="a-input" id="vb-to" name="to" type="date" value="' + esc(x.to || "") + '"></div></div></fieldset>' +
        '<p class="a-error" id="vb-error"></p></form>',
      btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="vda-ban-form">저장</button>', "lg");
    const mb = document.querySelector(".a-modal-body"); if (mb) { VX().hydrate(mb); vbInfo("pc"); vbInfo("m"); }
  }
  function saveVodBanner(f) {
    const v = VD(), i = f.dataset.i === "" ? null : Number(f.dataset.i), val = (k) => (f[k] ? f[k].value.trim() : "");
    const err = (m) => { document.getElementById("vb-error").textContent = m; }, kind = f.dataset.kind === "art" ? "art" : "img", dr = ui.vbDraft || {};
    if (kind === "img" && !dr.pc) return err("PC 이미지를 올려 주세요. (모바일 이미지는 선택이에요)");
    if (kind === "art" && !val("title")) return err("큰 제목을 적어 주세요.");
    const href = val("pid") ? "" : val("href");
    if (href && !/^(#\/|https?:\/\/|\/)/.test(href)) return err("링크는 #/ 로 시작하는 사이트 안 주소나 https:// 로 시작하는 주소를 넣어 주세요.");
    if (val("from") && val("to") && val("from") > val("to")) return err("노출 기간의 종료일이 시작일보다 빨라요.");
    const old = i == null ? { id: DB.uid("vb"), on: true } : v.banners[i];
    const link = { kind, pid: val("pid"), href, newTab: f.newTab.checked, from: val("from"), to: val("to") };
    if (kind === "img") { const x = Object.assign({}, old, link, { pc: dr.pc, m: dr.m || "", fit: f.dataset.fit === "contain" ? "contain" : "cover", bg: val("bg") || "#111111", alt: val("alt") }); if (i == null) v.banners.unshift(x); else v.banners[i] = x; ui.vbDraft = null; commit("이미지 배너를 " + (i == null ? "맨 앞에 추가했어요." : "저장했어요.") + " 스토어 첫 화면에 바로 보여요."); return; }
    const done = (img) => { const x = Object.assign({}, old, link, { eyebrow: val("eyebrow"), title: f.title.value.replace(/\r/g, "").trim(), sub: val("sub"), sticker: f.sticker.value.replace(/\r/g, "").trim(), dark: f.dark.checked, color: [val("c1"), val("c2")], img: img }); if (i == null) v.banners.push(x); else v.banners[i] = x; ui.vbDraft = null; commit("배너를 " + (i == null ? "추가했어요." : "저장했어요.")); };
    const file = f.img.files && f.img.files[0];
    if (!file) { done(f.imgdel && f.imgdel.checked ? "" : old.img || ""); return; }
    const rd = new FileReader(); rd.onload = () => { const img = new Image(); img.onload = () => { const sc = Math.min(1, 900 / img.height), cv = document.createElement("canvas"); cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc); cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height); done(cv.toDataURL(/png|webp/.test(file.type) ? "image/png" : "image/jpeg", 0.85)); }; img.src = rd.result; }; rd.readAsDataURL(file);
  }
  function saveVodTopics(f) {
    const list = f.topics.value.split(/\n/).map((x) => x.trim()).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, 90);
    if (!list.length) { toast("부업을 한 개 이상 적어 주세요.", "warn"); return; }
    VD().topics = list; commit("첫 화면 부업 칩을 저장했어요. (" + list.length + "개)");
  }
  function saveVodCats(f) {
    VD().cats.forEach((c, i) => { const l = f["cat-" + i] && f["cat-" + i].value.trim(); if (l) c.label = l; c.on = !!(f["caton-" + i] && f["caton-" + i].checked); });
    commit("카테고리를 저장했어요.");
  }
  function saveVodSettings(f) {
    const s = VD().settings, n = Number(f.share.value);
    if (!(n >= 0 && n <= 100)) { toast("정산 비율은 0~100 사이로 적어 주세요.", "warn"); return; }
    const pc = (x, dv) => { const n3 = Math.round(Number(x)); return x !== "" && n3 >= 0 && n3 <= 100 ? n3 : dv; };
    if (f.adSplit) s.adSplit = pc(f.adSplit.value, 50);
    if (f.demoLogin) s.demoLogin = !!f.demoLogin.checked;
    Object.assign(s, { share: Math.round(n), bank: f.bank.value.trim(), account: f.account.value.trim(), holder: f.holder.value.trim(), payDays: Math.min(14, Math.max(1, Number(f.payDays.value) || 3)), reviewPoint: f.reviewPoint ? Math.max(0, Math.round(Number(f.reviewPoint.value) || 0)) : s.reviewPoint });
    if (f.extendPct) {
      const cl = (x, lo, hi, dv) => { const n2 = Math.round(Number(x)); return n2 >= lo && n2 <= hi ? n2 : dv; };
      Object.assign(s, { extendPct: cl(f.extendPct.value, 1, 100, 50), addonShare: cl(f.addonShare.value, 0, 100, 50), coach: { n: cl(f.coachN.value, 1, 50, 5), days: cl(f.coachDays.value, 7, 730, 180), price: cl(f.coachPrice.value, 0, 10000000, 150000) }, tea: Object.assign({}, s.tea || {}, { min: cl(f.teaMin.value, 15, 240, 60), price: cl(f.teaPrice.value, 0, 10000000, 99000) }) });
    }
    commit("VOD 정산 · 입금 설정을 저장했어요.");
  }

  /* ---------- 강사센터: 내 VOD 판매 (읽기 전용) ---------- */
  /* ---------- 두잉고 버전 스위치 (강사센터 왼쪽 위) ---------- */
  function trackSwitch() {
    const vod = TRK() === "vod";
    return '<div class="a-trk"><span class="a-trk-l">관리 영역</span><div class="a-trk-sw ' + (vod ? "at-vod" : "at-live") + '" role="tablist" aria-label="관리 영역"><i class="a-trk-k" aria-hidden="true"></i>' +
      '<button type="button" role="tab" aria-selected="' + !vod + '" data-action="trk" data-k="live">두잉고</button>' +
      '<button type="button" role="tab" aria-selected="' + vod + '" data-action="trk" data-k="vod">DOOGO CLASS</button></div>' +
      "<small>" + (vod ? "VOD 판매 · 정산 · VOD 수강생 강의실" : "기수 · 수강생 · 과제로 운영하는 프로그램") + "</small></div>";
  }
  function trackOffPage(r) {
    const k = r.parts[0] || "", toLive = VOD_ONLY_PAGES.indexOf(k) < 0;
    return head(toLive ? "두잉고 탭 메뉴예요" : "DOOGO CLASS 탭 메뉴예요", toLive ? "DOOGO CLASS 탭에는 주차 · 과제 · 기수 · 홍보 페이지가 없어요." : "두잉고 탭에는 없는 메뉴예요.") +
      '<section class="a-card">' + emptyBox(toLive ? "layers" : "circlePlay", toLive ? "이 메뉴는 두잉고 탭에서 고쳐요." : "이 메뉴는 DOOGO CLASS 탭에서 고쳐요.", btn((toLive ? "두잉고" : "DOOGO CLASS") + " 탭으로 바꾸기", "trk", "a-btn-primary", ' data-k="' + (toLive ? "live" : "vod") + '" data-stay="1"')) + "</section>";
  }
  /* ---------- VOD 버전: 대시보드 · VOD 수강생 · VOD 강의 연결 ---------- */
  const vdOnline = (p) => ["vod", "ebook"].indexOf(VX().typeOf(p)) >= 0;
  const vbName = (b) => (b.st ? b.m.name : vdMask(b.m.name));
  /** 강사 대시보드: 내 수익 쉐어(종류별 강사 몫) · 이번 달 정산 예정 · 정산 달력 바로 가기 */
  function vdShareStrip(iid) {
    const X = VX(), r = X.rateOf(iid), ym = todayStr().slice(0, 7), st = vdStmt(iid, ym);
    return '<section class="a-card vs-strip"><div class="a-card-head"><h2>' + icon("coins", "sm") + ' 내 수익 쉐어</h2><span class="a-muted">숫자는 강사님 몫이에요 · ' + (r.next ? "지금 비율 · 다음 비율 " + esc(vdRateNextTxt(r)) : r.at ? esc(fmtFull(DB.date.toStr(new Date(r.from || r.at)))) + "부터 마스터 확정" : "기본 계약 (강사 5 : 플랫폼 5)") + "</span>" +
      '<a class="a-link vda-ml" href="#/center/vod-cal">정산 달력 ' + icon("arrowRight", "xs") + '</a><a class="a-link" href="#/center/vod-settle">판매 정산 ' + icon("arrowRight", "xs") + "</a></div>" +
      '<div class="vs-strip-g">' + X.RATE_KEYS.map((x) => '<div class="vs-strip-i"><small>' + esc(x[1]) + "</small><b>" + r[x[0]] + "<em>%</em></b><span>강사 " + r[x[0]] + " : 플랫폼 " + (100 - r[x[0]]) + "</span></div>").join("") +
        '<div class="vs-strip-i vs-strip-now"><small>이번 달 정산 예정</small><b>' + won(Math.max(0, st.net)) + "</b><span>" + st.n + "건 판매 · " + esc(fmtFull(vdPayDate(ym))) + " 지급</span></div></div>" +
      '<p class="a-muted p-small">' + icon("alert", "xs") + " " + (X.taxMode() === "supply" ? "공급가액(판매가 ÷ 1.1)" : "판매가(부가세 포함)") + " × 비율로 정산해요. 예: 100만 원 · " + r.vod + "% → " + won(Math.round((X.taxMode() === "supply" ? 1000000 / 1.1 : 1000000) * r.vod / 100 / 10) * 10) + ".</p></section>";
  }
  function pageVodDash() {
    const iid = IID(), ins = INS(), c = C(), X = VX(), v = VD();
    const buyers = X.buyersOf(iid), act = buyers.filter((b) => b.active), joined = act.filter((b) => b.st), ym = todayStr().slice(0, 7);
    const prods = v.products.filter((p) => p.iid === iid && X.typeOf(p) === "vod"), ids = prods.map((p) => p.id);
    const mon = vdPaidIn(ym, (o) => ids.indexOf(o.pid) >= 0);
    const avg = act.length ? Math.round(act.reduce((a, b) => a + b.pct, 0) / act.length) : 0;
    const res = c.resources || {}, nRes = ["ebook", "file", "vod", "senior"].reduce((a, k) => a + ((res[k] || []).length), 0);
    const steps = [
      ["menus", "메뉴 구성", "VOD 수강생에게 보일 메뉴만 켜 두기", DB.menuConfig(MID()).items.filter((x) => x.on).length > 1],
      ["vodlink", "VOD 강의 연결", "어떤 VOD 구매자에게 두잉고를 열지 정하기", prods.some((p) => p.dg !== false)],
      ["vodlessons", "VOD 강의 · 수업 자료", "강의마다 비메오 링크 · 강의 노트 · 수업 자료(PDF) 올리기", prods.length > 0 && prods.every((p) => X.lessons(p).every((l) => !!l.video))],
      ["notices", "업데이트 소식", "첫 인사 · 강의 업데이트 소식 올리기", (c.notices || []).length > 0],
      ["faq", "FAQ · 자주 묻는 질문", "FAQ로 먼저 안내 · 직접 질문은 1:1 코칭권으로", (c.faqs || []).length > 0],
      ["library", "강의 자료함", "전자책 · 교재 · 보충 영상 올리기", nRes > 0],
      ["docs", "실습 체크리스트", "숙제 대신 따라 할 실습 단계 정리", (c.docsGuide || []).length > 0]
    ];
    return head(ins.name + " 강사님 · VOD 두잉고", "DOOGO CLASS에서 " + esc(ins.displayName) + " 강사님 VOD를 산 수강생의 강의실이에요. 주차 · 과제 없이 자료 · 업데이트 소식 · FAQ로 운영하고, 1:1 코칭권 · TEA TIME을 산 수강생은 직접 챙겨요.", btn(icon("eye", "sm") + "VOD 수강생 화면 보기", "preview", "a-btn-outline")) +
      '<div class="a-kpis">' +
        kpi("VOD 수강생", act.length + "명", "두잉고 입장 " + joined.length + "명 · 아직 " + (act.length - joined.length) + "명", "#/center/vod-students") +
        kpi("평균 진도율", avg + "%", "수강 중인 " + act.length + "명 기준", "#/center/vod-students") +
        (isCoach() ? kpi("연결된 VOD", prods.filter((p) => p.dg !== false).length + "개", "DOOGO CLASS VOD 클래스", "#/center") : kpi("이번 달 VOD 판매", mon.filter(X.isAccess).length + "건", won(vdSum(mon)) + " (부가 " + won(vdSum(mon.filter((o) => !X.isAccess(o)))) + ") · 정산 " + won(vdSum(mon, vdInsAmt)), "#/center/vod", mon.length ? "ok" : "")) +
        kpi("완강한 수강생", act.filter((b) => b.pct >= 100).length + "명", "진도 100% · 후기 요청 대상", "#/center/vod-students") +
      "</div>" +
      (isCoach() ? "" : vdShareStrip(iid)) +
      '<section class="a-card a-vsteps"><div class="a-card-head"><h2>' + icon("sparkles", "sm") + " VOD 버전 세팅 순서</h2><span class=\"a-muted\">" + steps.filter((x) => x[3]).length + " / " + steps.length + " 완료 · 원하는 대로 바꿀 수 있어요</span></div><ol class=\"a-vstep-list\">" +
        steps.map((x, i) => '<li class="' + (x[3] ? "ok" : "") + '"><span class="a-vstep-n">' + (x[3] ? icon("check", "xs") : i + 1) + '</span><div><b>' + esc(x[1]) + "</b><small>" + esc(x[2]) + '</small></div><a class="a-link" href="#/center/' + x[0] + '">' + (x[3] ? "고치기" : "하러 가기") + " " + icon("arrowRight", "xs") + "</a></li>").join("") +
        '<li><span class="a-vstep-n">' + (steps.length + 1) + "</span><div><b>수강생 화면 미리보기</b><small>VOD 수강생 눈으로 한 번 둘러보기</small></div>" + btn("미리보기 " + icon("arrowRight", "xs"), "preview", "a-btn-ghost a-btn-sm") + "</li></ol></section>" + vodAddonTodo(iid, ids) +
      '<div class="a-grid-2">' +
        '<section class="a-card"><div class="a-card-head"><h2>연결된 VOD 클래스</h2><a class="a-link" href="#/center/vodlink">VOD 강의 연결 ' + icon("arrowRight", "xs") + "</a></div>" +
          (prods.length ? '<ul class="a-list">' + prods.map((p) => { const bs = buyers.filter((b) => b.active && b.paid.some((x) => x.p.id === p.id)); return '<li><div class="vda-cl">' + vdThumb(p) + "<div><b>" + esc(p.title) + '</b><small class="a-memo">수강생 ' + bs.length + "명 · 강의 " + X.lessons(p).length + "개 · " + esc(X.accessTxt(p)) + "</small></div></div>" + (p.dg !== false ? pill("두잉고 열림", "ok") : pill("닫힘", "mute")) + "</li>"; }).join("") + "</ul>"
            : emptyBox("monitorPlay", "아직 DOOGO CLASS에 올라간 내 VOD가 없어요.", vdStoreBtn("#/vod", "DOOGO CLASS 둘러보기"))) + "</section>" +
        '<section class="a-card"><div class="a-card-head"><h2>최근 VOD 수강생</h2><a class="a-link" href="#/center/vod-students">전체 ' + icon("arrowRight", "xs") + "</a></div>" +
          (buyers.length ? '<ul class="a-list">' + buyers.slice(0, 6).map((b) => '<li><div class="a-who"><span class="a-avatar">' + esc(String(b.m.name).slice(0, 1)) + "</span><div><b>" + esc(vbName(b)) + "</b><small>" + esc(b.paid.map((x) => x.p.title).join(", ") || "환불") + " · " + esc(DB.date.toStr(new Date(b.paidAt))) + "</small></div></div>" +
              '<div class="a-vs-pc"><div class="a-bar"><span style="width:' + b.pct + '%"></span></div><small class="num">' + b.pct + "%</small></div>" + (b.st ? pill("입장", "ok") : b.active ? pill("아직", "mute") : pill("종료", "mute")) + "</li>").join("") + "</ul>"
            : emptyBox("users", "아직 VOD를 산 수강생이 없어요.")) + "</section>" +
      "</div>";
  }
  function pageVodStudents() {
    const iid = IID(), X = VX(), all = X.buyersOf(iid), f = ui.vsF || "all";
    const left = (b) => { const ds = b.live.map((x) => X.daysLeft(b.m.id, x.p.id)); return ds.length ? Math.max.apply(null, ds) : -1; }, soon = (b) => b.active && left(b) !== Infinity && left(b) <= 30;
    const F = [["all", "전체", all.length], ["joined", "두잉고 입장", all.filter((b) => b.active && b.st).length], ["notyet", "아직 안 들어옴", all.filter((b) => b.active && !b.st).length], ["soon", "30일 안에 끝남", all.filter(soon).length], ["ended", "기간 끝 · 환불", all.filter((b) => !b.active).length]];
    const list = all.filter((b) => f === "joined" ? b.active && b.st : f === "notyet" ? b.active && !b.st : f === "soon" ? soon(b) : f === "ended" ? !b.active : true);
    const leftTxt = (b) => { if (!b.active) return '<span class="a-muted">-</span>'; const d = left(b); return d === Infinity ? "평생" : d <= 30 ? pill(d + "일 남음", "warn") : d + "일 남음"; };
    return head("VOD 수강생", "DOOGO CLASS에서 내 VOD를 산 수강생이에요. 진도는 강의장 기록을 그대로 읽어 와요. 아직 안 들어온 수강생은 DOOGO CLASS 마이페이지에서 ‘이어 보기’를 누르거나, 두잉고 로그인(이름 + 휴대폰 뒷자리)으로 강의실에 들어올 수 있어요.", vdStoreBtn()) +
      '<div class="a-tabs">' + F.map((x) => '<button type="button" class="a-tab' + (f === x[0] ? " on" : "") + '" data-action="vs-f" data-k="' + x[0] + '">' + esc(x[1]) + " <b>" + x[2] + "</b></button>").join("") + "</div>" +
      '<section class="a-card">' + (list.length ? '<div class="a-table-wrap"><table class="a-table a-vs-table"><thead><tr><th>수강생</th><th>구매한 VOD</th><th>결제일</th><th>수강 기간</th><th>진도율</th><th>최근 공부</th><th>두잉고</th><th class="right"></th></tr></thead><tbody>' +
        list.map((b) => { const paused = b.st && b.st.status === "withdrawn";
          return '<tr class="' + (b.active ? "" : "a-dim") + '"><td><b>' + esc(vbName(b)) + "</b>" + (b.st ? '<small class="a-memo">뒷자리 ' + esc(b.st.phone4) + "</small>" : "") + "</td>" +
            "<td>" + (b.paid.length ? b.paid.map((x) => '<span class="a-vs-cl">' + esc(x.p.title) + "</span>").join("") : '<span class="a-muted">환불</span>') + "</td>" +
            '<td class="num" data-label="결제일">' + esc(DB.date.toStr(new Date(b.paidAt))) + '</td><td data-label="수강 기간">' + leftTxt(b) + '</td><td data-label="진도율"><div class="a-bar"><span style="width:' + b.pct + '%"></span></div><small class="num">' + b.pct + "%</small></td>" +
            '<td class="num">' + (b.lastStudy ? fmtMD(b.lastStudy) : "-") + "</td>" +
            "<td>" + (!b.active ? pill(b.refunded ? "환불" : "기간 끝", "mute") : paused ? pill("이용 멈춤", "warn") : b.st ? pill(fmtMD(DB.date.toStr(new Date(b.st.joinedAt || Date.now()))) + " 입장", "ok") : pill("아직", "mute")) + "</td>" +
            '<td class="right">' + (b.st && b.active ? btn(paused ? "이용 다시 열기" : "이용 멈춤", "vs-pause", "a-btn-ghost a-btn-sm", ' data-id="' + esc(b.st.id) + '"') : "") + "</td></tr>"; }).join("") +
        "</tbody></table></div>" : emptyBox("users", f === "all" ? "아직 VOD를 산 수강생이 없어요." : "이 조건의 수강생이 없어요.")) + "</section>" +
      '<p class="a-hint">' + icon("shieldCheck", "xs") + " 두잉고에 들어오기 전 수강생 이름은 가려서 보여요. VOD 수강 기간이 끝나거나 환불하면 VOD 버전도 자동으로 닫혀요.</p>";
  }
  function saveVpCopy(f) {
    const from = f.from.value, to = f.to.value;
    if (!from || !to || from === to) { toast("가져올 강의실과 덮어쓸 강의실을 다르게 골라 주세요.", "warn"); return; }
    confirmModal("강의실 내용 가져오기", "‘" + esc((vdP(from) || {}).title || "") + "’ 강의실의 메뉴 · 자료함 · 체크리스트 · FAQ · 소식을<br>‘" + esc((vdP(to) || {}).title || "") + "’ 강의실에 그대로 덮어쓸까요?", "덮어쓰기", true, () => { DB.vodCopy(IID(), to, from); setVpid(to); commit("강의실 내용을 가져왔어요. 필요한 부분만 고쳐 주세요."); });
  }
  function pageVodLink() {
    const iid = IID(), X = VX(), v = VD(), ins = INS();
    const prods = v.products.filter((p) => p.iid === iid && X.typeOf(p) === "vod"), others = v.products.filter((p) => p.iid === iid && X.typeOf(p) !== "vod");
    const buyers = X.buyersOf(iid);
    const flow = [["coins", "DOOGO CLASS에서 VOD 결제", "이메일 · 카카오로 가입한 회원"], ["circlePlay", "‘강의실 입장’ → 그 VOD의 두잉고 강의실", "두잉고 로그인 › 두고클래스 탭(이메일)으로도 들어와요"], ["play", "두잉고 강의실에서 강의 시청", "진도는 DOOGO CLASS에도 같이 쌓여요"], ["library", "VOD마다 따로 꾸민 자료 · 소식 · FAQ", "아래 ‘강의실 꾸미기’에서 강의별로 정해요"]];
    return head("VOD 강의 연결", "DOOGO CLASS에 올라간 " + esc(ins.displayName) + " 강사님 VOD를 사면, 이 두잉고(VOD 버전)가 자동으로 열려요. 클래스마다 켜고 끌 수 있어요.", vdStoreBtn()) +
      '<section class="a-card"><ol class="a-vflow">' + flow.map((x, i) => '<li><span class="a-vflow-ic">' + icon(x[0], "sm") + "</span><b>" + (i + 1) + ". " + esc(x[1]) + "</b>" + (x[2] ? "<small>" + esc(x[2]) + "</small>" : "") + "</li>").join("") + "</ol></section>" +
      '<section class="a-card"><div class="a-card-head"><h2>내 VOD 클래스</h2><span class="a-muted">' + prods.length + "개</span></div>" +
        (prods.length ? '<ul class="a-list a-vlink">' + prods.map((p) => { const on = p.dg !== false, n = buyers.filter((b) => b.active && b.paid.some((x) => x.p.id === p.id)).length, st = VD_ST[p.status] || VD_ST.hidden;
          return '<li><div class="vda-cl">' + vdThumb(p) + "<div><b>" + esc(p.title) + '</b><small class="a-memo">' + st[0] + " · 강의 " + X.lessons(p).length + "개 · " + esc(X.accessTxt(p)) + " · 수강생 " + n + "명</small></div></div>" +
            '<span class="a-vlink-act">' + btn(icon("pen", "sm") + "강의실 꾸미기", "vp-go", "a-btn-ghost a-btn-sm" + (p.id === VPID() ? " is-cur" : ""), ' data-id="' + esc(p.id) + '"') +
            '<button type="button" class="a-vsw' + (on ? " on" : "") + '" role="switch" aria-checked="' + on + '" data-action="vlink-toggle" data-id="' + esc(p.id) + '"><i></i><span>' + (on ? "두잉고 열림" : "닫힘") + "</span></button></span></li>"; }).join("") + "</ul>"
          : emptyBox("monitorPlay", "아직 DOOGO CLASS에 올라간 내 VOD가 없어요. VOD로 만들고 싶다면 마스터에게 문의해 주세요.")) + "</section>" +
      (prods.length > 1 ? '<section class="a-card"><div class="a-card-head"><h2>VOD마다 두잉고 강의실이 따로예요</h2><span class="a-muted">강의 커리큘럼이 다르니 자료함 · 실습 체크리스트 · FAQ · 업데이트 소식 · 메뉴도 강의별로 꾸며요. 비슷하게 시작하려면 다른 강의실 내용을 그대로 가져와요.</span></div>' +
        '<form id="vp-copy-form" class="a-form vp-copy" novalidate><div class="a-field"><label for="vp-from">가져올 강의실</label><select class="a-input" id="vp-from" name="from">' + prods.map((p) => '<option value="' + esc(p.id) + '"' + (p.id === (prods.find((q) => q.id !== VPID()) || {}).id ? " selected" : "") + ">" + esc(p.title) + "</option>").join("") + "</select></div>" +
        '<span class="vp-copy-ar">' + icon("arrowRight", "sm") + "</span>" +
        '<div class="a-field"><label for="vp-to">이 강의실에 덮어쓰기</label><select class="a-input" id="vp-to" name="to">' + vpOpts(VPID()) + "</select></div>" +
        '<button class="a-btn a-btn-primary" type="submit">' + icon("download", "sm") + "내용 가져오기</button></form></section>" : "") +
      (others.length ? '<p class="a-hint">' + icon("alert", "xs") + " 전자책 · LIVE · 오프라인 강의(" + others.map((p) => esc(p.title)).join(", ") + ")는 VOD 버전에 연결되지 않아요. LIVE · 오프라인 수강생은 LIVE 버전의 기수로 운영해요.</p>" : "");
  }
  /* ---------- DOOGO CLASS 판매: VOD 판매 내역 · LIVE · 오프라인 판매 · 판매 정산 (읽기 전용) ---------- */
  const SALES_SUB = "클래스 내용 · 가격 · 할인은 마스터가 세팅해요. 바꾸고 싶은 내용은 마스터에게 요청해 주세요.";
  const ordRow = (o, X, extra) => { const mb = vdMember(o.mid) || {}, st = VD_OST[o.status] || VD_OST.paid; return "<tr" + (o.status === "refunded" ? ' class="a-dim"' : "") + '><td class="num">' + esc(DB.date.toStr(new Date(o.paidAt || o.at))) + '</td><td class="num"><small>' + esc(o.no) + "</small></td><td><b>" + esc(vdMask(mb.name)) + "</b></td><td>" + esc(o.title) + (VX().optTxt(o) ? '<small class="a-memo">' + esc(VX().optTxt(o)) + "</small>" : "") + "</td><td>" + esc(VD_PAY[o.method] || o.method || "-") + '</td><td class="right num">' + won(o.amount) + '</td><td class="right num"><b>' + (o.status === "paid" ? won(vdInsAmt(o)) : "-") + "</b></td><td>" + pill(st[0], st[1]) + "</td>" + (extra ? extra(o) : "") + "</tr>"; };
  function pageInsVod() {
    const iid = IID(), v = VD(), X = VX(), mine = v.products.filter((p) => p.iid === iid && vdOnline(p)), ids = mine.map((p) => p.id);
    const sub = "DOOGO CLASS에서 판매 중인 내 VOD · 전자책의 판매 내역이에요. " + SALES_SUB;
    if (!mine.length) return head("VOD 판매 내역", sub, vdStoreBtn()) + '<section class="a-card">' + emptyBox("monitorPlay", "아직 DOOGO CLASS에 올라간 내 VOD가 없어요.<br>기수 강의를 VOD로 만들어 팔고 싶다면 마스터에게 문의해 주세요.", vdStoreBtn("#/vod", "DOOGO CLASS 둘러보기")) + "</section>";
    const os = v.orders.filter((o) => ids.indexOf(o.pid) >= 0).sort((a, b) => (b.paidAt || b.at) - (a.paidAt || a.at));
    const paid = os.filter(vdLive), ym = todayStr().slice(0, 7), mon = paid.filter((o) => vdYM(o.paidAt) === ym);
    const rs = v.reviews.filter((r) => ids.indexOf(r.pid) >= 0 && !r.hidden).sort((a, b) => b.at - a.at), avg = rs.length ? (rs.reduce((a, r) => a + r.rating, 0) / rs.length).toFixed(1) : "-";
    const sts = DB.vodStudentsOf(iid), tf = ui.vsT || "all";
    const list = os.filter((o) => tf === "all" || (tf === "addon" ? !X.isAccess(o) : tf === "vod" ? X.typeOf(vdP(o.pid)) === "vod" && X.isAccess(o) : X.typeOf(vdP(o.pid)) === "ebook"));
    return head("VOD 판매 내역", sub, vdStoreBtn()) +
      '<div class="a-kpis">' +
        kpi("이번 달 판매", mon.length + "건", vdYMtxt(ym), "#/center/vod", "ok") +
        kpi("이번 달 매출", won(vdSum(mon)), "결제 완료 기준", "#/center/vod") +
        kpi("이번 달 정산 예정", won(vdSum(mon, vdInsAmt)), fmtFull(vdPayDate(ym)) + " 지급 예정", "#/center/vod-settle") +
        kpi("평균 별점", avg, "후기 " + rs.length + "개", "#/center/vod") +
      "</div>" +
      '<section class="a-card"><div class="a-card-head"><h2>내 VOD · 전자책 클래스</h2></div><div class="a-table-wrap"><table class="a-table vda-table"><thead><tr><th>클래스</th><th>상태</th><th>판매가</th><th>정산 비율</th><th>판매</th><th class="right">누적 매출</th><th class="right">누적 정산</th></tr></thead><tbody>' +
        mine.map((p) => { const po = paid.filter((o) => o.pid === p.id), st = VD_ST[p.status] || VD_ST.hidden, pr = X.priceOf(p); return '<tr><td><div class="vda-cl">' + vdThumb(p) + "<div><b>" + esc(p.title) + '</b><small class="a-memo">' + esc(X.TYPE[X.typeOf(p)][0]) + " · " + (X.typeOf(p) === "vod" ? "강의 " + X.lessons(p).length + "개 · " : "") + esc(X.accessTxt(p)) + "</small></div></div></td><td>" + pill(st[0], st[1]) + "</td><td class=\"num\">" + (pr === 0 ? "무료" : X.plansOf(p).length ? X.plansOf(p).map((y) => "<small>" + y.label + "</small> " + won(y.sale)).join("<br>") : won(pr)) + '</td><td class="num">' + X.shareOf(p) + '%</td><td class="num">' + po.length + '건</td><td class="right num">' + won(vdSum(po)) + '</td><td class="right num"><b>' + won(vdSum(po, vdInsAmt)) + "</b></td></tr>"; }).join("") +
      "</tbody></table></div></section>" +
      '<section class="a-card"><div class="a-card-head"><h2>주문 내역</h2><div class="a-seg">' + [["all", "전체"], ["vod", "VOD 수강권"], ["addon", "코칭 · TEA TIME"], ["ebook", "전자책"]].map((x) => '<button type="button" class="' + (tf === x[0] ? "on" : "") + '" data-action="vs-t" data-k="' + x[0] + '">' + x[1] + "</button>").join("") + "</div></div>" +
        (list.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>결제일</th><th>주문 번호</th><th>구매자</th><th>클래스</th><th>결제 수단</th><th class="right">결제 금액</th><th class="right">정산액</th><th>상태</th><th>두잉고</th></tr></thead><tbody>' +
          list.slice(0, 40).map((o) => ordRow(o, X, (x) => "<td>" + (X.typeOf(vdP(x.pid)) !== "vod" ? '<span class="a-muted">-</span>' : sts.some((s) => s.vodMid === x.mid) ? pill("입장", "ok") : x.status === "paid" ? pill("아직", "mute") : '<span class="a-muted">-</span>') + "</td>")).join("") + "</tbody></table></div>" : emptyBox("inbox", "주문이 없어요.")) + "</section>" +
      '<section class="a-card"><div class="a-card-head"><h2>수강생 후기</h2><span class="a-muted">' + rs.length + "개</span></div>" + (rs.length ? '<ul class="vda-reviews">' + rs.slice(0, 10).map((r) => '<li><div><b>' + esc(r.name) + '</b><span class="vda-stars">' + "★".repeat(r.rating) + "<i>" + "★".repeat(5 - r.rating) + "</i></span><small>" + esc((vdP(r.pid) || {}).title || "") + " · " + esc(DB.date.toStr(new Date(r.at))) + "</small></div><p>" + esc(r.text) + "</p></li>").join("") + "</ul>" : emptyBox("star", "아직 후기가 없어요.")) + "</section>";
  }
  function pageInsVodLive() {
    const iid = IID(), v = VD(), X = VX(), evs = v.products.filter((p) => p.iid === iid && X.isEvent(p)).sort((a, b) => String(a.eventAt).localeCompare(String(b.eventAt)));
    const sub = "DOOGO CLASS에 올라간 내 LIVE 무료강의 · 온/오프라인 강의의 신청자 · 좌석 · 매출이에요. " + SALES_SUB;
    if (!evs.length) return head("무료 LIVE · 온/오프라인 판매", sub, vdStoreBtn()) + '<section class="a-card">' + emptyBox("calendar", "아직 DOOGO CLASS에 올라간 내 LIVE 무료강의 · 온/오프라인 강의가 없어요.<br>VOD 반응이 좋으면 마스터와 LIVE · 오프라인 강의를 열 수 있어요.") + "</section>";
    const ids = evs.map((p) => p.id), os = v.orders.filter((o) => ids.indexOf(o.pid) >= 0), paid = os.filter(vdLive), ym = todayStr().slice(0, 7), mon = paid.filter((o) => vdYM(o.paidAt) === ym);
    const up = evs.filter((p) => !(new Date(p.eventAt).getTime() + (Number(p.eventMin) || 60) * 6e4 < Date.now()));
    return head("무료 LIVE · 온/오프라인 판매", sub, vdStoreBtn()) +
      '<div class="a-kpis">' +
        kpi("진행 예정", up.length + "개", "전체 " + evs.length + "개", "#/center/vod-live") +
        kpi("신청 · 결제 완료", paid.length + "명", "입금 대기 " + os.filter((o) => o.status === "pending").length + "명", "#/center/vod-live") +
        kpi("이번 달 매출", won(vdSum(mon)), "정산 " + won(vdSum(mon, vdInsAmt)), "#/center/vod-settle", mon.length ? "ok" : "") +
        kpi("누적 매출", won(vdSum(paid)), "정산 " + won(vdSum(paid, vdInsAmt)), "#/center/vod-settle") +
      "</div>" +
      evs.map((p) => { const po = os.filter((o) => o.pid === p.id).sort((a, b) => (b.paidAt || b.at) - (a.paidAt || a.at)), pd = po.filter((o) => o.status === "paid"), seats = Number(p.seats) || 0, past = new Date(p.eventAt).getTime() + (Number(p.eventMin) || 60) * 6e4 < Date.now();
        return '<section class="a-card a-ev"><div class="a-ev-head">' + vdThumb(p) + '<div class="a-ev-t"><small>' + esc(adTypeName(p)) + " · " + esc(X.fmtEvent(p.eventAt, true)) + "</small><h2>" + esc(p.title) + "</h2><p>" + icon(X.typeOf(p) === "offline" ? "mapPin" : "video", "xs") + " " + esc(X.typeOf(p) === "offline" ? p.place || "장소 미정" : "온라인 LIVE · 입장 링크는 시작 10분 전에 열려요") + "</p></div>" + pill(past ? "종료" : "진행 예정", past ? "mute" : "info") + "</div>" +
          '<div class="a-ev-stat"><div><small>좌석</small><b class="num">' + pd.length + (seats ? " / " + seats : "") + "</b>" + (seats ? '<div class="a-bar"><span style="width:' + Math.min(100, Math.round(pd.length / seats * 100)) + '%"></span></div>' : "") + '</div><div><small>매출</small><b class="num">' + won(vdSum(pd)) + '</b></div><div><small>정산 예정</small><b class="num">' + won(vdSum(pd, vdInsAmt)) + "</b></div></div>" +
          (po.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>신청일</th><th>주문 번호</th><th>신청자</th><th>클래스</th><th>결제 수단</th><th class="right">결제 금액</th><th class="right">정산액</th><th>상태</th><th>연락처</th></tr></thead><tbody>' + po.map((o) => ordRow(o, X, (x) => '<td class="num">' + (x.status === "paid" ? "뒷자리 " + esc(VX().last4((vdMember(x.mid) || {}).phone) || "-") : "-") + "</td>")).join("") + "</tbody></table></div>" : '<p class="a-muted a-pad">아직 신청자가 없어요.</p>') +
          "</section>"; }).join("") +
      '<p class="a-hint">' + icon("users", "xs") + " LIVE · 오프라인 수강생을 두잉고로 함께 관리하려면, LIVE · 오프라인 버전의 ‘수강생 관리’에서 기수에 추가하세요. 연락처는 진행 안내에 필요한 뒷자리만 보여요.</p>";
  }
  /** 한 줄 요약: 정산액 − 광고비 분담 … = 지급액 */
  const vsPayLine = (st) => "정산 " + won(st.ins) + (st.ded ? " − 환불 차감 " + won(st.ded) : "") + (st.adDed ? " − 광고비 분담 " + won(st.adDed) : "") + (st.carry ? " − 지난달 이월 " + won(st.carry) : "") + (st.wh ? " − 원천징수 " + won(st.wh) : "") + (st.vat ? " + 부가세 " + won(st.vat) : "") + " = 지급 " + won(st.pay);
  /** 강사 정산 계산서: 판매가 → 내 비율 → 광고비 50% 공제 → 세금 → 지급액 · 지급일 */
  function vsPayCard(st, last) {
    const ss = vdStState(st), X = VX(), payD = vdPayDate(st.ym);
    const li = (t, n, cls, sub) => '<li class="' + (cls || "") + '"><span>' + t + (sub ? "<small>" + sub + "</small>" : "") + '</span><b class="num">' + n + "</b></li>";
    return '<section class="a-card vs-pay' + (last ? " last" : "") + '"><div class="a-card-head"><h2>' + vdYMtxt(st.ym) + " 판매분</h2>" + pill(ss.t, ss.c) + "</div>" +
      '<div class="vs-pay-top"><small>' + (ss.k === "paid" ? "받은 날" : "받는 날") + "</small><b>" + esc(fmtFull(payD)) + '</b><span class="num">' + won(st.pay) + "</span></div>" +
      '<ul class="fin-pnl">' +
        li("판매가 합계", won(st.base), "", st.n + "건") +
        li("내 정산액", won(st.ins), "", "판매가 × 내 비율") +
        (st.ded ? li("확정 뒤 환불 차감", "- " + won(st.ded), "neg", st.dedN + "건") : "") +
        li("광고비 분담", (st.adDed ? "- " : "") + won(st.adDed), "neg", st.adCost ? "이 달 광고비 " + won(st.adCost) + " × " + st.adPct + "%" : "이 달 광고비 없음") +
        (st.carry ? li("지난달 이월 차감", "- " + won(st.carry), "neg", "광고비가 정산액보다 많아 넘어온 금액") : "") +
        li("정산액", won(Math.max(0, st.net)), "sum") +
        (st.biz ? (st.vat ? li("부가세", "+ " + won(st.vat), "", "사업자") : "") : li("원천징수 3.3%", (st.wh ? "- " : "") + won(st.wh), "neg", "개인 · 사업소득")) +
        li(ss.k === "paid" ? "받은 금액" : "받을 금액", won(st.pay), "sum ok") +
      "</ul>" +
      (st.next ? '<p class="a-muted p-small">' + icon("alert", "xs") + " 광고비가 정산액보다 많아 " + won(st.next) + "은 다음 달 정산에서 이어서 빼요.</p>" : "") +
      (!last && ss.k === "live" ? '<p class="a-muted p-small">' + icon("clock", "xs") + " 이번 달은 아직 집계 중이에요. 판매 · 광고비가 늘면 숫자가 바뀌고, 다음 달 초 마스터가 확정해요.</p>" : "") +
      (st.biz && X.taxMode() === "gross" && st.invIns ? '<p class="a-muted p-small">' + icon("file", "xs") + " 세금계산서: 강사님 → 두고홀딩스 " + won(st.invIns) + " · 두고홀딩스 → 강사님 " + won(st.invPf) + "</p>" : "") + "</section>";
  }
  /** 지급 일정 (최근 4개월 판매분) */
  function vsPaySchedule(iid) {
    const m0 = todayStr().slice(0, 7), rows = [0, -1, -2, -3].map((i) => { const st = vdStmt(iid, vdYMadd(m0, i)); return { st, s: vdStState(st), d: vdPayDate(st.ym) }; }).filter((x) => x.st.n || x.st.rec || x.st.adDed || x.st.carry);
    return '<section class="a-card"><div class="a-card-head"><h2>지급 일정</h2><span class="a-muted">매달 1일~말일 판매분을 다음 달 10일(주말 · 공휴일이면 다음 영업일)에 받아요</span></div>' +
      (rows.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>판매 월</th><th>지급일</th><th class="right">정산액</th><th class="right">광고비 분담</th><th class="right">받는 금액</th><th>상태</th></tr></thead><tbody>' +
        rows.map((x) => "<tr><td><b>" + vdYMtxt(x.st.ym) + "</b></td><td>" + esc(fmtFull(x.d)) + '</td><td class="right num">' + won(x.st.ins) + '</td><td class="right num">' + (x.st.adDed ? "- " + won(x.st.adDed) : "0원") + '</td><td class="right num"><b>' + won(x.st.pay) + "</b></td><td>" + pill(x.s.t, x.s.c) + "</td></tr>").join("") + "</tbody></table></div>" : emptyBox("coins", "아직 받을 정산이 없어요.")) + "</section>";
  }
  /** 강사 판매 정산: 마스터가 확정한 비율 (강사 : 플랫폼) · 강의별 예외 · 최근 광고비 */
  function vsRateCard(iid, mine) {
    const X = VX(), r = X.rateOf(iid), ex = mine.filter((p) => p.share != null && p.share !== ""), ym = todayStr().slice(0, 7);
    const ads = (VD().adSpend || []).filter((x) => x.iid === iid).sort((a, b) => String(b.day || b.ym).localeCompare(String(a.day || a.ym))).slice(0, 8);
    const big = (t, n, d) => '<div class="vs-rate2"><small>' + t + "</small><b>" + n + '<em>%</em></b><span class="vs-rbar"><i style="width:' + n + '%"></i></span><span class="vs-rlab"><span>강사 ' + n + "</span><span>플랫폼 " + (100 - n) + "</span></span><p>" + d + "</p></div>";
    return '<section class="a-card vs-rate-card"><div class="a-card-head"><h2>내 정산 비율</h2>' + (r.next ? pill("다음 비율 예정 · " + fmtFull(DB.date.toStr(new Date(r.next.from))) + "부터", "warn") : r.at ? pill(fmtFull(DB.date.toStr(new Date(r.from || r.at))) + "부터 · 마스터 확정", "ok") : pill("기본 계약", "info")) + '<span class="a-muted">' + (X.taxMode() === "supply" ? "공급가액(판매가 ÷ 1.1) 기준" : "판매가(부가세 포함) 기준") + " · 쿠폰 · 포인트 · 결제 수수료는 플랫폼 부담</span></div>" +
      '<div class="vs-rates2">' + X.RATE_KEYS.map((x) => big(x[1], r[x[0]], x[2])).join("") + big("광고비 분담", r.ad, "플랫폼이 쓴 광고비 중 강사님 몫 · 그 달 정산에서 빠져요") + "</div>" +
      (r.next ? '<p class="vs-rmemo">' + icon("clock", "xs") + " 다음 비율 · " + esc(vdRateNextTxt(r)) + " (그 전에 결제한 주문은 지금 비율)</p>" : "") +
      (r.memo ? '<p class="vs-rmemo">' + icon("file", "xs") + " 계약 메모 · " + esc(r.memo) + "</p>" : "") +
      (ex.length ? '<p class="vs-rmemo">' + icon("alert", "xs") + " 따로 정한 강의 · " + ex.map((p) => esc(p.title) + " " + p.share + "%").join(" · ") + "</p>" : "") +
      '<div class="vs-why"><b>왜 5 : 5인가요?</b><span>DOOGO CLASS 스튜디오에서 촬영하고, 편집 · 썸네일 · 상세페이지 · 장소 · 장비 · 판매 운영까지 플랫폼이 맡아요. 강사님은 강의 자료(PPT)만 준비하면 돼요. 비율은 강사님과 조율해 마스터가 확정하면 여기에 바로 보여요.</span></div>' +
      '<h3 class="vs-sub">광고비 내역 <small>마스터가 실제 집행액을 적어요 · 강사 분담 ' + r.ad + "%</small></h3>" +
      (ads.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>월</th><th>강의</th><th class="right">광고비</th><th class="right">내 분담</th><th>메모</th></tr></thead><tbody>' + ads.map((x) => { const p = x.pid ? vdP(x.pid) : null, mine2 = Math.round((Number(x.amount) || 0) * X.adSplitOf(iid) / 100 / 10) * 10; return "<tr><td>" + (x.day ? esc(fmtFull(x.day)) : vdYMtxt(x.ym)) + (x.ym === ym ? " " + pill("이번 달", "info") : "") + "</td><td>" + (p ? esc(p.title) : "전체 VOD") + '</td><td class="right num">' + won(x.amount) + '</td><td class="right num"><b>- ' + won(mine2) + "</b></td><td>" + esc([x.ch ? adChName(x.ch) : "", x.memo || ""].filter(Boolean).join(" · ")) + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<p class="a-muted p-small">아직 광고비 기록이 없어요.</p>') + "</section>";
  }
  /* ---------- 정산 달력 (강사): 며칠에 무엇이 몇 개 팔려 얼마를 벌었는지 ---------- */
  const VC_KIND = [["vod", "VOD", "monitorPlay"], ["ebook", "전자책", "book"], ["book", "종이책", "truck"], ["live", "LIVE", "video"], ["coach", "코칭권", "message"], ["tea", "TEA TIME", "coffee"]];
  // 달력 칸이 좁은 휴대폰에서는 만 원 단위로 (174,000원 → 17.4만)
  const vcMan = (n) => (n >= 1e6 ? Math.round(n / 1e4) + "만" : n >= 1e4 ? Math.round(n / 1e3) / 10 + "만" : won(n));
  function pageInsVodCal() {
    const iid = IID(), X = VX(), ym = ui.vcYM || todayStr().slice(0, 7), t0 = todayStr();
    const os = VD().orders.filter((o) => vdKey(o) === iid && vdLive(o) && vdYM(o.paidAt) === ym).sort((a, b) => a.paidAt - b.paidAt);
    const day = {}, tot = { n: 0, base: 0, ins: 0 }, byK = {};
    VC_KIND.forEach((k) => { byK[k[0]] = { n: 0, base: 0, ins: 0 }; });
    os.forEach((o) => {
      const d = DB.date.toStr(new Date(o.paidAt)), k = X.rateKeyOf(o), ins = vdInsAmt(o), base = Math.round(X.baseOf(o) * vdKeep(o));
      const x = (day[d] = day[d] || { n: 0, ins: 0, base: 0, k: {}, os: [] });
      x.n++; x.ins += ins; x.base += base; x.k[k] = (x.k[k] || 0) + 1; x.os.push(o);
      tot.n++; tot.base += base; tot.ins += ins; if (byK[k]) { byK[k].n++; byK[k].base += base; byK[k].ins += ins; }
    });
    const y = Number(ym.slice(0, 4)), mo = Number(ym.slice(5, 7)) - 1, first = new Date(y, mo, 1).getDay(), days = new Date(y, mo + 1, 0).getDate();
    const sel = ui.vcDay && ui.vcDay.slice(0, 7) === ym ? ui.vcDay : day[t0] ? t0 : (Object.keys(day).sort().pop() || "");
    const st = vdStmt(iid, ym), ss = vdStState(st), r = X.rateOf(iid);
    // 이 달 10일(영업일)에 받는 돈 = 지난달 판매분 지급액
    const pym = vdYMadd(ym, -1), pst = vdStmt(iid, pym), pss = vdStState(pst), payD = vdPayDate(pym), hasPay = !!(pst.n || pst.rec || pst.adDed || pst.carry);
    const cells = [];
    for (let i = 0; i < first; i++) cells.push('<div class="vc-d vc-pad" aria-hidden="true"></div>');
    for (let dd = 1; dd <= days; dd++) {
      const d = ym + "-" + String(dd).padStart(2, "0"), x = day[d], dow = (first + dd - 1) % 7;
      const pay = hasPay && d === payD;
      cells.push('<button type="button" class="vc-d' + (x ? " has" : "") + (pay ? " payday" + (pss.k === "paid" ? " paid" : "") : "") + (d === t0 ? " today" : "") + (d === sel ? " on" : "") + (dow === 0 ? " sun" : dow === 6 ? " sat" : "") + '" data-action="vc-day" data-d="' + d + '"' + (x || pay ? ' aria-label="' + dd + "일" + (pay ? " " + (pss.k === "paid" ? "지급 완료" : "지급 예정") + " " + won(pst.pay) : "") + (x ? " 판매 " + x.n + "건 · 정산 " + won(x.ins) : "") + '"' : "") + ">" +
        '<span class="vc-dn">' + dd + "</span>" + (pay ? '<span class="vc-pay"><em>' + (pss.k === "paid" ? "받음" : "받을 돈") + '</em><b class="vc-full">' + won(pst.pay) + '</b><b class="vc-short">' + vcMan(pst.pay) + "</b></span>" : "") +
        (x ? '<b class="vc-amt"><span class="vc-full">' + won(x.ins) + '</span><span class="vc-short">' + vcMan(x.ins) + '</span></b><span class="vc-ks">' + VC_KIND.filter((k) => x.k[k[0]]).map((k) => '<i class="vc-k vc-k-' + k[0] + '">' + k[1] + " " + x.k[k[0]] + "</i>").join("") + "</span>" : "") + "</button>");
    }
    const sx = sel && day[sel];
    const payBox = sel && hasPay && sel === payD ? '<div class="vc-paybox">' + icon("coins", "sm") + "<div><b>" + esc(fmtFull(payD)) + " · " + vdYMtxt(pym) + " 판매분 정산 " + (pss.k === "paid" ? "지급 완료" : "지급 예정") + " " + won(pst.pay) + "</b><small>" + esc(vsPayLine(pst)) + "</small></div></div>" : "";
    const detail = sel ? '<section class="a-card vc-detail">' + payBox + '<div class="a-card-head"><h2>' + esc(fmtFull(sel)) + " 판매</h2>" + (sx ? '<span class="a-muted">' + sx.n + "건 · 판매가 " + won(sx.base) + " · 정산 <b>" + won(sx.ins) + "</b></span>" : "") + "</div>" +
      (sx ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>시각</th><th>상품</th><th>종류</th><th class="right">판매가</th><th class="right">비율</th><th class="right">정산액</th></tr></thead><tbody>' +
        sx.os.map((o) => {
          const k = X.rateKeyOf(o), kk = VC_KIND.find((z) => z[0] === k) || VC_KIND[0], dt = new Date(o.paidAt), sh = X.shareVal ? X.shareVal(o) : null;
          return '<tr><td class="num">' + String(dt.getHours()).padStart(2, "0") + ":" + String(dt.getMinutes()).padStart(2, "0") + "</td><td>" + esc(o.title) + (X.optTxt(o) ? '<small class="a-memo">' + esc(X.optTxt(o)) + "</small>" : "") + (o.status === "refunded" ? '<small class="a-memo">부분 환불</small>' : "") +
            '</td><td><span class="vc-k vc-k-' + k + '">' + kk[1] + '</span></td><td class="right num">' + won(Math.round(X.baseOf(o) * vdKeep(o))) + '</td><td class="right num">' + (sh == null ? "-" : sh + "%") + '</td><td class="right num"><b>' + won(vdInsAmt(o)) + "</b></td></tr>";
        }).join("") + "</tbody></table></div>" : emptyBox("calendar", "이날은 판매가 없어요.")) + "</section>" : "";
    return head("정산 달력", "날짜마다 무엇이 몇 개 팔렸고, 정산으로 얼마를 받는지 한눈에 봐요. 정산은 매달 1일~말일 판매분을 다음 달 10일에 지급해요.", vdStoreBtn()) +
      '<section class="a-card vc-card"><div class="a-card-head a-cal-head"><button type="button" class="a-icon-btn" data-action="vc-ym" data-dir="-1" aria-label="이전 달">' + icon("chevLeft") + "</button><h2>" + vdYMtxt(ym) + '</h2><button type="button" class="a-icon-btn" data-action="vc-ym" data-dir="1" aria-label="다음 달">' + icon("chevRight") + "</button>" +
        '<span class="a-cal-sum">판매 <b>' + tot.n + "건</b> · 판매가 <b>" + won(tot.base) + "</b> · 정산 예정 <b>" + won(tot.ins) + "</b></span>" + pill(ss.t, ss.c) + "</div>" +
        (hasPay ? '<p class="vc-paynote">' + icon("coins", "xs") + " <b>" + Number(payD.slice(5, 7)) + "월 " + Number(payD.slice(8)) + "일</b>에 " + vdYMtxt(pym) + " 판매분 <b>" + won(pst.pay) + "</b>" + (pss.k === "paid" ? "을 받았어요." : "을 받아요 (" + esc(pss.t) + ").") + (pst.adDed ? " 광고비 분담 " + won(pst.adDed) + " 차감 뒤예요." : "") + "</p>" : "") +
        '<div class="vc-sum">' + VC_KIND.map((k) => '<div class="vc-sum-i vc-k-' + k[0] + '"><span>' + (k[2] === "coffee" ? X.icx("coffee", "xs") : icon(k[2], "xs")) + k[1] + "</span><b>" + byK[k[0]].n + "건</b><small>" + won(byK[k[0]].ins) + '</small><small class="vc-my">내 몫 ' + r[k[0]] + "%</small></div>").join("") + "</div>" +
        '<div class="vc-grid" role="grid" aria-label="' + esc(vdYMtxt(ym)) + ' 정산 달력">' + ["일", "월", "화", "수", "목", "금", "토"].map((w, i) => '<div class="vc-w' + (i === 0 ? " sun" : i === 6 ? " sat" : "") + '">' + w + "</div>").join("") + cells.join("") + "</div>" +
        '<p class="a-muted p-small">' + icon("coins", "xs") + " 날짜 칸의 금액은 그날 판매의 정산 예정 금액(" + (X.taxMode() === "supply" ? "공급가액(판매가 ÷ 1.1)" : "판매가(부가세 포함)") + " × 내 비율)이에요. 초록 칸은 지난달 판매분을 받는 날이에요. 광고비 분담 · 확정 뒤 환불 차감은 월 명세서에서 빠져요 (" + vdYMtxt(ym) + " 판매분 지급 예정 " + won(st.pay) + " · " + fmtFull(vdPayDate(ym)) + ').</p></section>' +
      detail + vsPaySchedule(iid);
  }
  function pageInsVodSettle() {
    const iid = IID(), v = VD(), X = VX(), mine = v.products.filter((p) => p.iid === iid), ym = todayStr().slice(0, 7), last = vdYMadd(ym, -1);
    const months = Array.from({ length: 6 }, (_, i) => vdYMadd(ym, -i)).map((m) => { const st = vdStmt(iid, m); st.s = vdStState(st); return st; });
    const paidOut = v.payouts.filter((x) => x.key === iid && (x.st === "paid" || (!x.st && x.at))).reduce((a, x) => a + (Number(x.amount) || (x.snap ? x.snap.pay : 0)), 0);
    const pf = vdProf(iid), lm = months[1];
    const rate = (t, n, d, cls) => '<div class="vs-rate ' + (cls || "") + '"><b>' + n + "%</b><span>" + t + "</span><small>" + d + "</small></div>";
    const links = mine.filter((p) => p.status !== "hidden");
    return head("판매 정산", "DOOGO CLASS에서 판매한 VOD · 전자책 · LIVE · 오프라인 강의의 정산이에요. 매달 1일~말일 판매분을 다음 달 10일에 지급해요.", vdStoreBtn()) +
      '<div class="a-kpis">' +
        kpi("이번 달 정산 예정", won(Math.max(0, months[0].net)), vdYMtxt(ym) + " 판매 " + months[0].n + "건 · 집계 중", "#/center/vod-settle", "ok") +
        kpi("지난달 지급액", won(lm.pay), vdYMtxt(last) + " · " + (lm.n || lm.rec ? lm.s.t : "판매 없음"), "#/center/vod-settle", lm.n && lm.s.k !== "paid" ? "info" : "") +
        kpi("누적 지급 완료", won(paidOut), "지금까지 받은 정산", "#/center/vod-settle") +
        kpi("정산 받을 정보", pf.account ? (pf.type === "biz" ? "사업자" : "개인") : "미등록", pf.account ? esc(pf.bank || "") + " · " + (pf.type === "biz" ? "세금계산서 발행" : "3.3% 원천징수") : "계좌를 등록해야 지급돼요", "#/center/vod-settle", pf.account ? "" : "warn") +
      "</div>" +
      '<div class="fin-grid vs-pays">' + vsPayCard(months[1], true) + vsPayCard(months[0], false) + "</div>" +
      vsRateCard(iid, mine) +
      (links.length ? '<section class="a-card"><div class="a-card-head"><h2>내 강의 전용 링크</h2><span class="a-muted">SNS · 블로그 · 카톡에 이 링크를 쓰면 ‘강사 링크’ 판매로 따로 집계돼요 (정산 비율은 같아요)</span></div>' +
        '<div class="vs-links">' + links.map((p) => { const u = ROUTE.abs("#/vod/p/" + p.id + "?by=" + iid); return '<div class="vs-link"><span class="vs-link-t">' + vdThumb(p, "sm") + "<b>" + esc(p.title) + '</b></span><input class="a-input a-sm" value="' + esc(u) + '" readonly aria-label="' + esc(p.title) + ' 전용 링크">' + btn(icon("link", "sm") + "복사", "vda-copy", "a-btn-ghost a-btn-sm", ' data-u="' + esc(u) + '"') + "</div>"; }).join("") + "</div></section>" : "") +
      '<section class="a-card"><div class="a-card-head"><h2>월별 정산 명세</h2><span class="a-muted">마스터가 확정하면 명세서가 고정돼요</span></div><div class="a-table-wrap"><table class="a-table vs-table"><thead><tr><th>판매 월</th><th>판매</th><th class="right">판매가 합계</th><th class="right">정산액</th><th class="right">차감</th><th class="right">광고비 분담</th><th class="right">세금</th><th class="right">지급액</th><th>상태</th><th class="right"></th></tr></thead><tbody>' +
        months.map((x) => { const at = ' data-k="' + esc(iid) + '" data-m="' + esc(x.ym) + '"'; return "<tr" + ((x.n || x.rec || x.adDed || x.carry) ? "" : ' class="a-dim"') + "><td><b>" + vdYMtxt(x.ym) + '</b><div class="vs-chs">' + vdChTags(x) + '</div></td><td class="num">' + x.n + '건</td><td class="right num">' + won(x.base) + '</td><td class="right num">' + won(x.ins) + '</td><td class="right num">' + (x.ded ? "- " + won(x.ded) : "0원") + '</td><td class="right num">' + vdAdCell(x) + '</td><td class="right num">' + (x.biz ? "+ " + won(x.vat) : x.wh ? "- " + won(x.wh) : "0원") + '</td><td class="right num"><b>' + won(x.pay) + "</b>" + vdNextTxt(x) + "</td><td>" + ((x.n || x.rec || x.adDed || x.carry) ? pill(x.s.t, x.s.c) : '<span class="a-muted">-</span>') + '</td><td class="right vs-acts">' + ((x.n || x.rec || x.adDed || x.carry) ? btn("명세서", "vda-stm", "a-btn-ghost a-btn-sm", at) : "") + (x.s.k === "confirmed" && x.biz ? btn("세금계산서 발행 완료", "vda-inv", "a-btn-primary a-btn-sm", ' data-m="' + esc(x.ym) + '"') : "") + "</td></tr>"; }).join("") +
      "</tbody></table></div></section>" +
      '<section class="a-card"><div class="a-card-head"><h2>정산 받을 정보</h2><span class="a-muted">마스터에게만 보여요</span></div><form id="vs-prof-form" class="a-form" novalidate>' +
        '<div class="vs-type">' + [["person", "개인 (프리랜서)", "사업소득 3.3%를 떼고 지급해요"], ["biz", "사업자", X.taxMode() === "gross" ? "판매가 합계로 세금계산서를 발행해 주세요 · 수수료분은 두고홀딩스가 발행" : X.taxMode() === "net" ? "정산 금액(부가세 포함)으로 세금계산서를 발행해 주세요" : "정산 금액 + 부가세 10% · 세금계산서를 발행해 주세요"]].map((t) => '<label class="vb-kind-o"><input type="radio" name="type" value="' + t[0] + '"' + ((pf.type || "person") === t[0] ? " checked" : "") + "><span><b>" + t[1] + "</b><small>" + t[2] + "</small></span></label>").join("") + "</div>" +
        '<div class="a-form-row"><div class="a-field"><label for="vs-name">이름 · 상호</label><input class="a-input" id="vs-name" name="name" value="' + esc(pf.name || "") + '" maxlength="40"></div><div class="a-field"><label for="vs-biz">사업자등록번호 <small>(사업자만)</small></label><input class="a-input" id="vs-biz" name="bizNo" value="' + esc(pf.bizNo || "") + '" maxlength="12" inputmode="numeric" placeholder="000-00-00000"></div></div>' +
        '<div class="a-form-row"><div class="a-field"><label for="vs-bank">은행</label><input class="a-input" id="vs-bank" name="bank" value="' + esc(pf.bank || "") + '" maxlength="20" placeholder="국민은행"></div><div class="a-field"><label for="vs-acc">계좌번호</label><input class="a-input" id="vs-acc" name="account" value="' + esc(pf.account || "") + '" maxlength="30" inputmode="numeric"></div><div class="a-field"><label for="vs-hold">예금주</label><input class="a-input" id="vs-hold" name="holder" value="' + esc(pf.holder || "") + '" maxlength="30"></div></div>' +
        '<div class="a-field"><label for="vs-mail">정산 · 세금계산서 이메일</label><input class="a-input" id="vs-mail" name="email" type="email" value="' + esc(pf.email || "") + '" maxlength="80"></div>' +
        '<p class="a-muted p-small">' + icon("shieldCheck", "xs") + " 주민등록번호 같은 원천징수 신고 정보는 화면에 저장하지 않고, 첫 지급 전에 마스터가 따로 안전하게 받아요.</p>" +
        '<p class="a-error" id="vs-error"></p><div class="a-form-actions"><button class="a-btn a-btn-primary" type="submit">정산 정보 저장</button></div></form></section>' +
      '<section class="a-card a-settle-note"><h2>' + icon("shieldCheck", "sm") + " 정산 기준</h2><ul>" +
        "<li>" + (X.taxMode() === "supply" ? "정산액 = 할인 전 판매가 ÷ 1.1(부가세를 뺀 공급가액) × 정산 비율." : "정산액 = 할인 전 판매가(부가세 포함) × 정산 비율. 예: 100만 원어치 팔리고 비율이 60%면 60만 원이에요.") + " 플랫폼이 발행한 쿠폰 · 포인트 할인과 카드 결제 수수료는 플랫폼이 부담해요.</li>" +
        "<li>정산 비율은 마스터가 강사님과 조율해 확정한 비율이에요(기본 강사 5 : 플랫폼 5). VOD 강의 · 전자책 · LIVE · 1:1 코칭권 · TEA TIME마다 따로 정할 수 있고, 적용 시작일 전에 결제한 주문은 그때 비율 그대로예요.</li>" +
        "<li>광고비는 마스터가 달마다 실제 집행액을 적고, 강사 분담분(기본 50%)을 그 달 정산에서 빼요. 내역은 위 ‘광고비 내역’에서 볼 수 있어요.</li>" +
        "<li>매달 1일 ~ 말일 판매분을 다음 달 초에 마스터가 확정하고, 다음 달 10일에 등록한 계좌로 지급해요. 10일이 주말 · 공휴일이면 다음 영업일이에요.</li>" +
        "<li>확정 전에 환불된 주문은 빠지고, 확정한 뒤 환불되면 다음 정산에서 차감해요.</li>" +
        "<li>개인 강사는 사업소득 3.3%(소득세 3% + 지방소득세 0.3%)를 떼고 지급해요. " + (X.taxMode() === "gross" ? "사업자 강사는 그 달 판매가 합계로 (주)두고홀딩스에 세금계산서를 발행하고, 두고홀딩스가 수수료 · 광고비 분담분 세금계산서를 발행한 뒤 차액(정산 금액)을 지급해요." : X.taxMode() === "net" ? "사업자 강사는 정산 금액(부가세 포함)으로 (주)두고홀딩스에 세금계산서를 발행해 주시면 지급해요." : "사업자 강사는 정산 금액에 부가세 10%를 더해 세금계산서를 발행해 주시면 지급해요.") + " 월별 명세서에 발행할 금액이 나와요.</li></ul></section>";
  }

  /* ---------- VOD 부가 상품: 1:1 코칭 답변 · TEA TIME 신청 (DOOGO CLASS에서 결제) ---------- */
  /** VOD 대시보드: 1:1 코칭 · TEA TIME · 연장권 할 일과 이번 달 판매 */
  function vodAddonTodo(iid, ids) {
    const X = VX(), v = VD(), ym = todayStr().slice(0, 7);
    const co = DB.requests(iid).filter((x) => DB.isVodStudent(x.s) && !x.q.answer).length, tea = X.teasOf(null, iid), req = tea.filter((o) => o.status === "paid" && (o.tea || {}).st === "req").length;
    const next = tea.filter((o) => (o.tea || {}).st === "ok" && o.tea.when).sort((a, b) => String(a.tea.when).localeCompare(String(b.tea.when)))[0];
    const mon = v.orders.filter((o) => ids.indexOf(o.pid) >= 0 && o.status === "paid" && o.paidAt && vdYM(o.paidAt) === ym), kn = (k) => mon.filter((o) => X.kindOf(o) === k).length;
    const soon = X.buyersOf(iid).filter((b) => b.active && b.paid.some((x) => X.canExtend(b.m.id, x.p.id))).length;
    const rows = [[co, "답변 대기 1:1 코칭 질문", "코칭권을 산 수강생 질문이에요. 48시간 안에 답해 주세요", "#/center/coaching"], [req, "TEA TIME 일정 확정 대기", next ? "다음 TEA TIME · " + X.teaWhen(next.tea) : "희망 날짜를 보고 일정을 확정해 주세요", "#/center/teatime"], [soon, "수강 기간 30일 이내 수강생", "강의실 · 마이페이지에 1년 연장권 안내가 보여요", "#/center/vod-students"]];
    return '<section class="a-card"><div class="a-card-head"><h2>' + icon("message", "sm") + ' 1:1 코칭 · TEA TIME · 연장권</h2><span class="a-muted">이번 달 코칭권 ' + kn("coach") + "건 · TEA TIME " + kn("tea") + "건 · 연장권 " + kn("extend") + "건 · 부가 매출 " + won(vdSum(mon.filter((o) => !X.isAccess(o)))) + '</span></div><ul class="a-dc-todo">' +
      rows.map((x) => '<li class="' + (x[0] ? "on" : "") + '"><b class="num">' + x[0] + "</b><div><strong>" + esc(x[1]) + "</strong><small>" + esc(x[2]) + '</small></div><a class="a-link" href="' + x[3] + '">바로 가기 ' + icon("arrowRight", "xs") + "</a></li>").join("") + "</ul></section>";
  }
  function pageCoaching() {
    const iid = IID(), X = VX(), v = VD(), all = DB.requests(iid).filter((x) => DB.isVodStudent(x.s)), f = ui.coF || "open";
    const list = all.filter((x) => f === "all" || (f === "open" ? !x.q.answer : !!x.q.answer));
    const passes = v.orders.filter((o) => X.kindOf(o) === "coach" && o.coach && o.status === "paid" && (vdP(o.pid) || {}).iid === iid);
    const live = passes.filter((o) => o.paidAt + (Number(o.coach.days) || 180) * 864e5 > Date.now()), leftN = live.reduce((a, o) => a + Math.max(0, (Number(o.coach.n) || 0) - (Number(o.coach.used) || 0)), 0);
    const ym = todayStr().slice(0, 7), mon = passes.filter((o) => vdYM(o.paidAt) === ym), cp = v.products.find((p) => p.iid === iid && X.coachOf(p)), c = cp ? X.coachOf(cp) : null, open = all.filter((x) => !x.q.answer).length;
    const tabs = [["open", "답변 대기", open], ["done", "답변 완료", all.length - open], ["all", "전체", all.length]].map((t) => '<button type="button" class="a-tab' + (f === t[0] ? " on" : "") + '" data-action="co-tab" data-k="' + t[0] + '">' + t[1] + ' <span class="num">' + t[2] + "</span></button>").join("");
    return head("1:1 코칭 답변", "DOOGO CLASS에서 1:1 코칭권을 산 VOD 수강생이 두잉고 ‘1:1 코칭 질문’에 남긴 질문이에요. 질문 1개에 코칭권 1회가 차감되고, 답변하면 수강생 화면에 바로 보여요.", vdStoreBtn()) +
      '<div class="a-kpis">' + kpi("답변 대기", open + "건", "48시간 안에 답하기", "#/center/coaching", open ? "warn" : "") + kpi("사용 중인 코칭권", live.length + "장", "남은 질문 " + leftN + "회", "#/center/coaching") +
        (isCoach() ? "" : kpi("이번 달 코칭권 판매", mon.length + "건", won(vdSum(mon)) + " · 정산 " + won(vdSum(mon, vdInsAmt)), "#/center/vod-settle", mon.length ? "ok" : "")) +
        kpi("코칭권 구성", c ? c.n + "회 · " + won(c.price) : "판매 안 함", c ? c.days + "일 · 1회 " + won(c.per) + " · 가격은 마스터와 정해요" : "판매하려면 마스터에게 요청해 주세요", "#/center/coaching") + "</div>" +
      '<section class="a-card"><div class="a-toolbar"><div class="a-tabs">' + tabs + "</div></div>" +
        (list.length ? '<div class="a-stack">' + list.map((x) => { const o = passes.find((y) => (y.coach.qs || []).indexOf(x.q.id) >= 0), no = o ? (o.coach.qs || []).indexOf(x.q.id) + 1 : 0;
          return '<article class="a-q"><div class="a-q-head"><span class="a-avatar">' + esc(String(x.s.name).slice(0, 1)) + "</span><div><b>" + esc(x.q.title) + "</b><small>" + esc(x.s.name) + " · VOD 수강생" + (o ? " · 코칭권 " + o.coach.n + "회 중 " + no + "번째" : "") + " · " + fmtStamp(x.q.at) + "</small></div>" + pill(x.q.category || "기타", "mute") + (x.q.answer ? pill("답변 완료", "ok") : pill("답변 대기", "warn")) + "</div>" +
            (x.q.answer && (x.q.answeredBy || x.q.answeredAt) ? '<p class="a-q-by"><span class="a-by">' + icon("user", "xs") + esc(x.q.answeredBy || "강사") + "</span>" + (x.q.answeredAt ? " · " + fmtStamp(x.q.answeredAt) + " 답변" : " 답변") + "</p>" : "") +
            '<p class="a-q-body">' + esc(x.q.body) + "</p>" +
            ((x.q.images || []).length ? '<div class="a-shots a-q-shots">' + x.q.images.map((im) => '<a class="a-shot" href="' + im.data + '" target="_blank" rel="noopener"><img src="' + im.data + '" alt="' + esc(im.name) + '"></a>').join("") + "</div>" : "") +
            '<form class="a-q-form" data-sid="' + x.s.id + '" data-qid="' + x.q.id + '"><textarea class="a-input" name="answer" rows="4" placeholder="예: 샘플 요청 메일에 단가를 같이 물어봐도 괜찮아요. ‘검토용’이라고 밝혀 두면 답장이 더 빨라요." aria-label="답변">' + esc(x.q.answer || "") + '</textarea><button class="a-btn a-btn-primary a-btn-sm" type="submit">' + (x.q.answer ? "답변 수정" : "답변 등록") + "</button></form></article>"; }).join("") + "</div>"
          : emptyBox("message", f === "open" ? "답변을 기다리는 코칭 질문이 없어요." : "코칭 질문이 없어요.")) + "</section>" +
      '<p class="a-hint">' + icon("coins", "xs") + " 코칭권 매출은 내 코칭권 정산 비율(" + X.addonShare(IID()) + "%)로 정산돼요. 사용 기간이 끝난 코칭권의 남은 횟수는 사라져요.</p>";
  }
  const slotStart = (s) => (/오전/.test(s || "") ? "10:00" : /저녁/.test(s || "") ? "19:00" : "14:00");
  function teaItem(o) {
    const X = VX(), m = vdMember(o.mid) || {}, t = o.tea || {}, p = vdP(o.pid) || {}, k = o.status === "pending" ? "pend" : t.st || "req";
    const PL = { pend: pill("입금 대기", "mute"), req: pill("확정 대기", "warn"), ok: pill("일정 확정", "ok"), done: pill("진행 완료", "mute"), cancel: pill("취소", "mute") };
    return '<article class="a-q a-tea"><div class="a-q-head"><span class="a-avatar">' + esc(String(m.name || "?").slice(0, 1)) + "</span><div><b>" + esc(m.name || "회원") + " · " + (t.min || 60) + "분 · " + esc(X.TEA_MODE[t.mode] || "") + "</b><small>" + esc(p.title || o.title) + " · 신청 " + fmtStamp(o.at) + " · 연락처 뒷자리 " + esc(X.last4(vdPhoneOf(o, m)) || "-") + "</small></div>" + (PL[k] || "") + "</div>" +
      '<p class="a-q-body">' + esc(t.topic || "") + "</p>" +
      '<p class="a-tea-want">' + icon("calendar", "xs") + "희망 " + esc([t.d1, t.d2].filter(Boolean).join(" / ")) + " · " + esc(t.slot || "") + ((k === "ok" || k === "done") && t.when ? "<br>" + icon("check", "xs") + "확정 <b>" + esc(X.teaWhen(t)) + "</b>" + (t.where ? " · " + esc(t.where) : "") : "") + "</p>" +
      (k === "req" ? '<form class="a-tea-form" data-id="' + esc(o.id) + '"><input class="a-input" type="datetime-local" name="when" value="' + esc(t.d1 ? t.d1 + "T" + slotStart(t.slot) : "") + '" aria-label="확정 일시"><input class="a-input" name="where" maxlength="120" value="' + esc(t.where || "") + '" placeholder="Zoom 링크 (예: https://zoom.us/j/…)" aria-label="Zoom 링크"><button class="a-btn a-btn-primary a-btn-sm" type="submit">일정 확정</button></form>' + (isCoach() ? "" : '<div class="a-q-acts">' + btn("취소 · 환불 요청", "tea-cancel", "a-btn-ghost a-btn-sm", ' data-id="' + esc(o.id) + '"') + "</div>")
        : k === "ok" ? '<div class="a-q-acts">' + (t.when && new Date(t.when).getTime() > Date.now() ? '<span class="a-muted p-small">시작 시간이 지나면 ‘진행 완료’를 누를 수 있어요.</span>' : btn(icon("check", "sm") + "진행 완료", "tea-done", "a-btn-primary a-btn-sm", ' data-id="' + esc(o.id) + '"')) + btn("일정 다시 잡기", "tea-reopen", "a-btn-ghost a-btn-sm", ' data-id="' + esc(o.id) + '"') + "</div>" : "") +
      "</article>";
  }
  function pageTeaTime() {
    const iid = IID(), X = VX(), all = X.teasOf(null, iid), f = ui.teaF || "req", st = (o) => (o.status === "pending" ? "pend" : (o.tea || {}).st || "req");
    const F = [["req", "확정 대기"], ["ok", "일정 확정"], ["done", "진행 완료"], ["all", "전체"]], cnt = (k) => all.filter((o) => k === "all" || st(o) === k).length;
    const list = all.filter((o) => f === "all" || st(o) === f).sort((a, b) => (f === "ok" ? String(a.tea.when).localeCompare(String(b.tea.when)) : b.at - a.at));
    const ym = todayStr().slice(0, 7), mon = all.filter((o) => o.status === "paid" && o.paidAt && vdYM(o.paidAt) === ym), next = all.filter((o) => st(o) === "ok" && o.tea.when).sort((a, b) => String(a.tea.when).localeCompare(String(b.tea.when)))[0];
    const cp = VD().products.find((p) => p.iid === iid && X.teaOf(p)), t = cp ? X.teaOf(cp) : null;
    return head("TEA TIME 신청", "VOD 수강생이 DOOGO CLASS에서 결제하고 신청한 1:1 만남이에요. 희망 날짜를 보고 일정을 확정하면 수강생 마이페이지와 두잉고 화면에 바로 보여요.", vdStoreBtn()) +
      '<div class="a-kpis">' + kpi("확정 대기", cnt("req") + "건", "희망 날짜를 보고 확정해 주세요", "#/center/teatime", cnt("req") ? "warn" : "") +
        kpi("다가오는 TEA TIME", next ? X.teaWhen(next.tea) : "없음", next ? ((vdMember(next.mid) || {}).name || "") + (next.tea.where ? " · " + next.tea.where : "") : "확정된 일정이 없어요", "#/center/teatime") +
        (isCoach() ? "" : kpi("이번 달 TEA TIME 매출", won(vdSum(mon)), mon.length + "건 · 정산 " + won(vdSum(mon, vdInsAmt)), "#/center/vod-settle", mon.length ? "ok" : "")) +
        kpi("TEA TIME 구성", t ? t.min + "분 · " + won(t.price) : "판매 안 함", t ? X.TEA_MODE[t.mode] : "판매하려면 마스터에게 요청해 주세요", "#/center/teatime") + "</div>" +
      '<div class="a-tabs">' + F.map((x) => '<button type="button" class="a-tab' + (f === x[0] ? " on" : "") + '" data-action="tea-f" data-k="' + x[0] + '">' + x[1] + " <b>" + cnt(x[0]) + "</b></button>").join("") + "</div>" +
      '<section class="a-card">' + (list.length ? '<div class="a-stack">' + list.map(teaItem).join("") + "</div>" : emptyBox("calendar", f === "req" ? "확정을 기다리는 TEA TIME이 없어요." : "이 조건의 TEA TIME이 없어요.")) + "</section>" +
      '<p class="a-hint">' + icon("shieldCheck", "xs") + " 확정 전 · 확정 3일 전까지 취소하면 전액 환불돼요. 강사님 사정으로 취소하면 마스터가 전액 환불해 드려요. 연락처는 진행 안내에 필요한 뒷자리만 보여요.</p>";
  }
  document.addEventListener("click", (e) => {
    if (!isActive()) return;
    const a = e.target.closest("[data-action]"); if (!a) return;
    const act = a.dataset.action;
    if (act === "co-tab") { ui.coF = a.dataset.k; render(); return; }
    if (act === "tea-f") { ui.teaF = a.dataset.k; render(); return; }
    if (act !== "tea-done" && act !== "tea-reopen" && act !== "tea-cancel") return;
    const o = VD().orders.find((x) => x.id === a.dataset.id); if (!o || !o.tea) return;
    if (act === "tea-done" && o.tea.when && new Date(o.tea.when).getTime() > Date.now()) { toast("아직 시작 전이에요. 진행한 뒤에 눌러 주세요.", "warn"); return; }
    if (act === "tea-done") { o.tea.st = "done"; o.tea.doneAt = Date.now(); commit("TEA TIME을 진행 완료로 바꿨어요."); }
    else if (act === "tea-reopen") { o.tea.st = "req"; commit("일정을 다시 잡을 수 있게 확정 대기로 돌렸어요."); }
    else confirmModal("TEA TIME 취소", esc((vdMember(o.mid) || {}).name || "") + " 님 TEA TIME을 취소할까요?<br>취소하면 마스터가 결제 금액 <b>" + won(o.amount) + "</b>을 전액 환불해요.", "취소하고 환불 요청", true, () => { o.tea.st = "cancel"; o.refundReq = Date.now(); commit("TEA TIME을 취소했어요. 마스터에게 환불 요청이 갔어요."); });
  });
  document.addEventListener("submit", (e) => {
    if (!isActive()) return;
    const f = e.target; if (!f.classList || !f.classList.contains("a-tea-form")) return;
    e.preventDefault();
    const o = VD().orders.find((x) => x.id === f.dataset.id); if (!o || !o.tea) return;
    if (!f.when.value) { toast("확정할 날짜와 시간을 골라 주세요.", "warn"); return; }
    if (new Date(f.when.value).getTime() < Date.now()) { toast("이미 지난 시간이에요. 앞으로의 날짜와 시간을 골라 주세요.", "warn"); f.when.focus(); return; }
    Object.assign(o.tea, { st: "ok", when: f.when.value, where: f.where.value.trim(), okAt: Date.now() });
    commit("TEA TIME 일정을 확정했어요. 수강생 화면에 바로 보여요.");
  });

  /* ---------- VOD 강의 · 수업 자료 (강사가 직접: 비메오 링크 · 강의 노트 · PDF 등) ----------
   * 마스터는 VOD 클래스 관리 › 5. 커리큘럼에서 같은 내용을 함께 고쳐요. 올린 파일은 VOD.matPut (시안: 이 브라우저 · 정식: 서버 파일 저장소) */
  const vidKind = (u) => { const t = String(u || ""); return /vimeo\.com\/(?:video\/|channels\/[\w-]+\/|manage\/videos\/)?\d+/i.test(t) ? ["비메오 연결", "ok"] : /youtu\.?be/i.test(t) ? ["유튜브 연결", "ok"] : /\.(mp4|webm)(\?|$)/i.test(t) ? ["mp4 연결", "ok"] : t ? ["주소 확인", "warn"] : ["영상 없음", "mute"]; };
  const matSize = (k) => (!k ? "" : k >= 1024 ? (k / 1024).toFixed(1) + "MB" : k + "KB");
  const matChip = (f, attrs) => '<li class="a-vl-f"><span class="a-att-ext">' + esc((String(f.name || "").split(".").pop() || "FILE").toUpperCase().slice(0, 4)) + '</span><span class="a-vl-fn"><b>' + esc(f.name || "수업 자료") + "</b><small>" + (/^idb:/.test(f.url || "") ? "올린 파일" : /^assets\//.test(f.url || "") ? "두고 서버 파일" : f.url ? "링크" : "주소 없음") + (f.size ? " · " + matSize(f.size) : "") + '</small></span><button type="button" class="a-icon-btn"' + attrs + ' aria-label="자료 지우기" title="지우기">' + icon("x", "sm") + "</button></li>";
  const vlLesson = (d) => { const p = vdP(d.p), c = p && (p.curriculum || [])[Number(d.ci)]; return c ? (c.lessons || [])[Number(d.li)] || null : null; };
  function pageVodLessons() {
    const iid = IID(), X = VX(), prods = VD().products.filter((p) => p.iid === iid && X.typeOf(p) === "vod");
    const sub = "강의마다 비메오 영상 링크 · 강의 노트 · 수업 자료(PDF · 엑셀 · 한글 등)를 직접 올려요. 저장하면 수강생 두잉고 강의실에 바로 보여요. 어렵다면 마스터에게 말씀해 주세요. 마스터도 같은 내용을 함께 고칠 수 있어요.";
    if (!prods.length) return head("VOD 강의 · 수업 자료", sub) + '<section class="a-card">' + emptyBox("monitorPlay", "아직 DOOGO CLASS에 올라간 내 VOD가 없어요. VOD로 만들고 싶다면 마스터에게 문의해 주세요.") + "</section>";
    const p = prods.find((x) => x.id === ui.vlP) || prods[0], lz = X.lessons(p), nV = lz.filter((l) => l.video).length, nF = lz.reduce((a, l) => a + (l.files || []).length, 0);
    return head("VOD 강의 · 수업 자료", sub, vdStoreBtn("#/vod/p/" + p.id, "상세 페이지 보기")) +
      (prods.length > 1 ? '<div class="a-tabs a-vl-tabs">' + prods.map((x) => '<button type="button" class="a-tab' + (x.id === p.id ? " on" : "") + '" data-action="vl-p" data-id="' + esc(x.id) + '">' + esc(x.title) + "</button>").join("") + "</div>" : "") +
      '<div class="a-kpis">' + kpi("강의", lz.length + "개", "파트 " + (p.curriculum || []).length + "개 · 총 " + X.durTxt(X.totalMin(p)), "#/center/vodlessons") +
        kpi("영상 연결", nV + " / " + lz.length, nV < lz.length ? "비메오 링크를 넣어 주세요" : "모든 강의에 영상이 있어요", "#/center/vodlessons", nV < lz.length ? "warn" : "ok") +
        kpi("수업 자료", nF + "개", "수강생이 강의실에서 내려받아요", "#/center/vodlessons") +
        kpi("미리보기 강의", lz.filter((l) => l.preview).length + "개", "구매 전에도 볼 수 있어요", "#/center/vodlessons") + "</div>" +
      '<section class="a-card a-vl-howto"><b>' + icon("circlePlay", "sm") + " 비메오 링크 넣는 법</b><ol><li>비메오(vimeo.com)에 강의 영상을 올려요.</li><li>공개 범위는 ‘링크가 있는 사람만’ 또는 ‘숨김’, 퍼가기 허용 도메인에 doogoclass.com을 넣어요.</li><li>‘공유 → 링크 복사’로 받은 주소(예: https://vimeo.com/76979871)를 아래 ‘영상 링크’ 칸에 붙여 넣고 저장해요.</li></ol></section>" +
      (p.curriculum || []).map((c, ci) => '<section class="a-card a-vl-ch"><div class="a-card-head"><h2><span class="a-vl-no">' + String(ci + 1).padStart(2, "0") + "</span>" + esc(c.title || "파트 " + (ci + 1)) + '</h2><span class="a-muted">강의 ' + (c.lessons || []).length + "개</span></div>" +
        (c.lessons || []).map((l, li) => { const vk = vidKind(l.video), at = ' data-p="' + esc(p.id) + '" data-ci="' + ci + '" data-li="' + li + '"';
          return '<form class="a-vl"' + at + ' novalidate><div class="a-vl-h"><span class="a-vl-n">' + (ci + 1) + "-" + (li + 1) + '</span><input class="a-input" name="title" value="' + esc(l.title) + '" maxlength="80" aria-label="강의 이름" placeholder="강의 이름"><span class="a-vl-mw"><input class="a-input" name="min" type="number" min="0" max="600" inputmode="numeric" value="' + esc(l.min || "") + '" aria-label="길이(분)"><small>분</small></span>' + DB.vdur.label(l.video, l.durSec, "", "vda-dur") + pill(vk[0], vk[1]) + "</div>" +
            '<div class="a-field"><label>영상 링크 <small>비메오 추천 · 유튜브 · mp4</small></label><input class="a-input" name="video" value="' + esc(l.video || "") + '" maxlength="300" placeholder="https://vimeo.com/123456789"></div>' +
            '<div class="a-field"><label>강의 노트 <small>영상 아래에 보여요</small></label><textarea class="a-input" name="desc" rows="2" maxlength="1000" placeholder="이 강의에서 꼭 기억할 내용, 실습 순서를 적어 주세요.">' + esc(l.desc || "") + "</textarea></div>" +
            '<div class="a-field"><span class="a-label">수업 자료 <small>' + (l.files || []).length + "개 · 수강생이 강의실 ‘수업 자료’에서 미리보기 · 내려받기</small></span>" +
              ((l.files || []).length ? '<ul class="a-vl-fl">' + l.files.map((f, fi) => matChip(f, ' data-action="vl-fdel"' + at + ' data-fi="' + fi + '"')).join("") + "</ul>" : "") +
              '<div class="a-vl-add"><label class="a-btn a-btn-outline a-btn-sm">' + icon("paperclip", "sm") + '파일 올리기<input type="file" class="sr-only" multiple data-vl-up' + at + ' accept=".pdf,.xlsx,.xls,.csv,.docx,.doc,.hwp,.hwpx,.pptx,.ppt,.zip,.png,.jpg,.jpeg"></label><span class="a-muted">PDF · 엑셀 · 한글 · PPT · ZIP · 20MB까지 (더 크면 링크로)</span></div>' +
              '<details class="a-vl-link"><summary>' + icon("link", "xs") + " 구글 드라이브 등 링크로 추가</summary><div><input class=\"a-input a-sm\" name=\"lname\" maxlength=\"80\" placeholder=\"자료 이름 (예: 1주차 교안.pdf)\"><input class=\"a-input a-sm\" name=\"lurl\" type=\"url\" maxlength=\"400\" placeholder=\"https://drive.google.com/…\">" + btn("추가", "vl-flink", "a-btn-ghost a-btn-sm", at) + "</div></details></div>" +
            '<div class="a-vl-ft"><label class="a-check"><input type="checkbox" name="preview"' + (l.preview ? " checked" : "") + '><span>미리보기 강의 <small>구매 전에도 볼 수 있어요</small></span></label><button class="a-btn a-btn-primary a-btn-sm" type="submit">' + icon("check", "sm") + "저장</button></div></form>"; }).join("") + "</section>").join("") +
      '<p class="a-hint">' + icon("shieldCheck", "xs") + " 시안에서는 올린 파일이 이 브라우저에 저장돼요. 정식 서비스에서는 두고 서버 파일 저장소에 올라가서 모든 수강생이 내려받을 수 있어요. 파트 · 강의 추가 · 순서 · 가격은 마스터가 VOD 클래스 관리에서 함께 고쳐요.</p>";
  }
  // 저장 안 한 다른 강의 칸의 내용 (다시 그려도 잃지 않게)
  const vlId = (fm) => fm.dataset.p + ":" + fm.dataset.ci + ":" + fm.dataset.li;
  function vlSnap(except) {
    const out = {};
    document.querySelectorAll("form.a-vl").forEach((fm) => { if (fm === except) return; const l = vlLesson(fm.dataset); if (!l) return; const cur = { title: fm.title.value, min: fm.min.value, video: fm.video.value, desc: fm.desc.value, preview: fm.preview.checked, lname: fm.lname ? fm.lname.value : "", lurl: fm.lurl ? fm.lurl.value : "" }; if (cur.title !== (l.title || "") || String(cur.min) !== String(l.min || "") || cur.video !== (l.video || "") || cur.desc !== (l.desc || "") || cur.preview !== !!l.preview || cur.lname || cur.lurl) out[vlId(fm)] = cur; });
    return out;
  }
  function vlRestore(keep) {
    if (!keep || !Object.keys(keep).length) return;
    document.querySelectorAll("form.a-vl").forEach((fm) => { const c = keep[vlId(fm)]; if (!c) return; fm.title.value = c.title; fm.min.value = c.min; fm.video.value = c.video; fm.desc.value = c.desc; fm.preview.checked = c.preview; if (fm.lname) fm.lname.value = c.lname; if (fm.lurl) fm.lurl.value = c.lurl; fm.classList.add("is-dirty"); });
  }
  document.addEventListener("input", (e) => { const fm = e.target.closest && e.target.closest("form.a-vl"); if (fm && e.target.name !== "lname" && e.target.name !== "lurl") fm.classList.add("is-dirty"); });
  function vlAddFiles(files, put, pid) {
    const X = VX(), list = Array.from(files || []);
    if (!list.length) return;
    if (DB.remote.on && !pid) { toast("클래스를 한 번 저장한 뒤 수업 자료를 올려 주세요.", "warn"); return; }
    const big = list.filter((f) => f.size > X.MAT_MAX); if (big.length) toast(big.map((f) => f.name).join(", ") + " 은(는) " + Math.round(X.MAT_MAX / 1048576) + "MB가 넘어요. 구글 드라이브 링크로 추가해 주세요.", "warn");
    Promise.all(list.filter((f) => f.size <= X.MAT_MAX).map((f) => X.matPut(f, "vodp:" + (pid || "")).catch(() => null))).then((saved) => { const ok = saved.filter(Boolean); if (!ok.length) { if (!big.length) toast("파일을 저장하지 못했어요. 다시 시도해 주세요.", "warn"); return; } put(ok); });
  }
  document.addEventListener("click", (e) => {
    if (!isActive()) return;
    const a = e.target.closest("[data-action]"); if (!a) return;
    const act = a.dataset.action;
    if (act === "vl-p") { ui.vlP = a.dataset.id; render(); return; }
    if (act === "vl-fdel") { const l = vlLesson(a.dataset); if (!l) return; const f = (l.files || [])[Number(a.dataset.fi)]; confirmModal("수업 자료 지우기", "‘" + esc((f || {}).name || "") + "’ 자료를 지울까요? 수강생 강의실에서도 사라져요.", "지우기", true, () => { const keep = vlSnap(null); l.files.splice(Number(a.dataset.fi), 1); commit("수업 자료를 지웠어요."); vlRestore(keep); }); return; }
    if (act === "vl-flink") { const fm = a.closest("form.a-vl"), l = vlLesson(a.dataset); if (!fm || !l) return; const u = fm.lurl.value.trim(); if (!/^https?:\/\//.test(u)) { toast("https:// 로 시작하는 주소를 넣어 주세요.", "warn"); return; } (l.files = l.files || []).push({ name: fm.lname.value.trim() || "링크 자료", url: u }); fm.lname.value = ""; fm.lurl.value = ""; const keep = vlSnap(null); commit("링크 자료를 추가했어요. 수강생 강의실에 바로 보여요."); vlRestore(keep); }
  });
  document.addEventListener("change", (e) => {
    if (!isActive()) return;
    const t = e.target;
    if (t.matches && t.matches("[data-vl-up]")) { const l = vlLesson(t.dataset); if (!l) return; const vpid = t.dataset.p; vlAddFiles(t.files, (ok) => { (l.files = l.files || []).push(...ok); const keep = vlSnap(null); setTimeout(() => vlRestore(keep), 0); commit("수업 자료 " + ok.length + "개를 올렸어요. 수강생 강의실에서 바로 내려받을 수 있어요."); }, vpid); t.value = ""; }
    else if (t.matches && t.matches("[data-vda-up]")) { const ci = Number(t.dataset.ci), li = Number(t.dataset.li), form = document.getElementById("vda-form"); vlAddFiles(t.files, (ok) => { if (form) vdSync(form); const l = ui.vdDraft && ui.vdDraft.curriculum[ci] && ui.vdDraft.curriculum[ci].lessons[li]; if (!l) return; (l.files = l.files || []).push(...ok); render(); toast("수업 자료 " + ok.length + "개를 올렸어요. ‘저장’을 누르면 수강생 강의실에 보여요."); }, ui.vdDraft && ui.vdDraft.id); t.value = ""; }
  });
  document.addEventListener("submit", (e) => {
    if (!isActive()) return;
    const f = e.target; if (!f.classList || !f.classList.contains("a-vl")) return;
    e.preventDefault();
    const l = vlLesson(f.dataset); if (!l) return;
    const title = f.title.value.trim(); if (!title) { toast("강의 이름을 적어 주세요.", "warn"); f.title.focus(); return; }
    let video = f.video.value.trim();
    if (/^\d{6,12}$/.test(video)) video = "https://vimeo.com/" + video;
    else if (/^[\w-]{11}$/.test(video)) video = "https://youtu.be/" + video;
    else if (video && !/^https?:\/\//.test(video) && /^(www\.)?(vimeo\.com|player\.vimeo\.com|youtu\.be|(m\.)?youtube\.com)\//i.test(video)) video = "https://" + video;
    if (video && !/^https?:\/\//.test(video)) { toast("영상 링크는 https:// 로 시작하는 주소로 넣어 주세요. (비메오 번호만 넣어도 돼요)", "warn"); f.video.focus(); return; }
    Object.assign(l, { title, min: Math.max(0, Math.round(Number(f.min.value) || 0)), video, desc: f.desc.value.trim(), preview: f.preview.checked });
    const keep = vlSnap(f);
    commit("‘" + title + "’ 강의를 저장했어요. 수강생 강의실에 바로 보여요.");
    vlRestore(keep);
  });

  /* ---------- VOD 버튼 · 입력 ---------- */
  document.addEventListener("click", (e) => {
    if (!isActive()) return;
    const a = e.target.closest("[data-action^='vda-'], [data-action^='vc-'], [data-action^='fin-'], [data-action^='bo-'], [data-action^='hk-'], [data-action='rk-per'], [data-action='ad-ym']"); if (!a || a.disabled) return;
    const d = a.dataset, v = VD(), form = document.getElementById("vda-form");
    const O = () => v.orders.find((o) => o.id === d.id);
    const edit = (fn) => { vdSync(form); fn(ui.vdDraft); render(); };
    switch (d.action) {
      case "vda-tab": ui.vdTab = d.k; render(); break;
      case "vda-of": ui.vdOf = d.k; render(); break;
      case "vda-mt": ui.vdMt = d.k; render(); break;
      case "fin-ym": ui.finYM = vdYMadd(ui.finYM || todayStr().slice(0, 7), Number(d.dir)); render(); break;
      case "fin-year": ui.finYM = vdYMadd(ui.finYM || todayStr().slice(0, 7), Number(d.dir) * 12); render(); break;
      case "fin-csv": finCsv(Number(d.y)); break;
      case "fin-fee": finFeeModal(); break;
      case "fin-fee-def": { const f = document.getElementById("fin-fee-form"); if (f) VD_PAY_KEYS.forEach((x) => { const dv = PG_FEE_DEF[x[0]]; if (f["p-" + x[0]]) { f["p-" + x[0]].value = dv[0]; f["w-" + x[0]].value = dv[1]; } }); break; }
      case "rk-per": ui.rkPer = d.k; render(); break;
      case "ad-ym": ui.adYM = vdYMadd(ui.adYM || todayStr().slice(0, 7), Number(d.dir)); render(); break;
      case "vda-rate-edit": vdRateModal(d.k); break;
      case "vda-ad-del": { const v = VD(), i = (v.adSpend || []).findIndex((x) => x.id === d.id); if (i < 0) break; if (vdAdLocked(v.adSpend[i].iid, v.adSpend[i].ym)) { toast("정산을 확정한 달의 광고비는 지울 수 없어요. 강사 정산에서 확정을 취소한 뒤 지워 주세요.", "warn"); break; } confirmModal("광고비 지우기", won(v.adSpend[i].amount) + " 광고비 기록을 지울까요? 확정 전 정산에서 다시 빠져요.", "지우기", true, () => { v.adSpend.splice(i, 1); commit("광고비 기록을 지웠어요."); }); break; }
      case "vc-ym": ui.vcYM = vdYMadd(ui.vcYM || todayStr().slice(0, 7), Number(d.dir)); ui.vcDay = ""; render(); break;
      case "vc-day": ui.vcDay = d.d; { const y0 = window.scrollY; render(); window.scrollTo(0, y0); const el = document.querySelector(".vc-detail"); if (el && window.innerWidth < 720) el.scrollIntoView({ behavior: "smooth", block: "start" }); } break;
      case "vda-ym": ui.vdYM = vdYMadd(ui.vdYM || vdYMadd(todayStr().slice(0, 7), -1), Number(d.dir)); render(); break;
      case "vda-od": { e.preventDefault(); const o = O(); if (o) vdOrderModal(o); break; }
      /* 종이책 주문 · 배송 */
      case "vda-ship-tab": ui.vsTab = d.k; ui.vsEdit = ""; (ui.vsPick || new Set()).clear(); render(); { const on = document.querySelector(".bo-tabs button.on"); if (on && on.scrollIntoView) on.scrollIntoView({ inline: "center", block: "nearest" }); } break;
      case "vda-ship-pick": { const pk = ui.vsPick || (ui.vsPick = new Set()); if (pk.has(d.id)) pk.delete(d.id); else pk.add(d.id); render(); break; }
      case "vda-ship-all": { const pk = ui.vsPick || (ui.vsPick = new Set()), tab = boTab(), list = vdShipAll().filter((o) => boIn(tab, o)); if (list.length && list.every((o) => pk.has(o.id))) pk.clear(); else list.forEach((o) => pk.add(o.id)); render(); break; }
      case "vda-ship-prep": { const o = O(), X = VX(); if (!o || !o.ship || X.shipStOf(o) !== "ready") break; if (X.claimOf(o)) { toast("회원의 요청이 있어요. 아래 요청부터 처리해 주세요.", "warn"); break; } Object.assign(o.ship, { st: "prep", prepAt: Date.now() }); commit("‘" + o.no + "’ 주문을 배송 준비로 옮겼어요. 이제 회원은 바로 취소하지 못하고 취소 요청으로 받아요."); break; }
      case "vda-ship-bprep": { const pk = ui.vsPick || new Set(), X = VX(), list = vdShipAll().filter((o) => pk.has(o.id) && o.status === "paid" && X.shipStOf(o) === "ready" && !X.claimOf(o)); if (!list.length) { toast("배송 준비로 옮길 ‘신규 주문’을 골라 주세요.", "warn"); break; } const at = Date.now(); list.forEach((o) => Object.assign(o.ship, { st: "prep", prepAt: at })); pk.clear(); commit(list.length + "건을 배송 준비로 옮겼어요."); break; }
      case "vda-ship-send": {
        const o = O(), X = VX(); if (!o || !o.ship || o.status !== "paid") break;
        const st = X.shipStOf(o), c = X.claimOf(o), car = document.querySelector('[data-ship-car="' + d.id + '"]'), inv = document.querySelector('[data-ship-inv="' + d.id + '"]'), no = inv ? boInv(inv.value) : "";
        if (c && c.st === "req") { toast("회원의 " + X.CLAIM_K[c.k] + " 요청이 있어요. 요청부터 처리해 주세요.", "warn"); break; }
        if (!vsInvOk(no)) { toast("송장 번호를 확인해 주세요 (숫자 · 영문 6~20자).", "warn"); if (inv) inv.focus(); break; }
        if (["ready", "prep", "ship"].indexOf(st) < 0) break;
        Object.assign(o.ship, { st: "ship", carrier: car ? car.value : X.shipSet().carrier, inv: no, prepAt: o.ship.prepAt || Date.now(), shipAt: st === "ship" && o.ship.shipAt ? o.ship.shipAt : Date.now(), by: (staffMe() || {}).name || "마스터" });
        ui.vsEdit = ""; (ui.vsPick || new Set()).delete(o.id);
        commit(st === "ship" ? "‘" + o.no + "’ 송장을 고쳤어요." : "‘" + o.no + "’ 주문을 보냈어요. 회원 마이페이지에 배송 조회가 열려요."); break;
      }
      case "vda-ship-edit": ui.vsEdit = d.id || ""; render(); break;
      case "vda-ship-done": { const o = O(); if (!o || !o.ship || VX().shipStOf(o) !== "ship") break; Object.assign(o.ship, { st: "done", doneAt: Date.now(), doneBy: (staffMe() || {}).name || "마스터" }); commit("‘" + o.no + "’ 주문을 배송 완료로 바꿨어요."); break; }
      case "bo-bdone": { const pk = ui.vsPick || new Set(), X = VX(), list = vdShipAll().filter((o) => pk.has(o.id) && X.shipStOf(o) === "ship"); if (!list.length) break; const at = Date.now(), by = (staffMe() || {}).name || "마스터"; list.forEach((o) => Object.assign(o.ship, { st: "done", doneAt: at, doneBy: by })); pk.clear(); commit(list.length + "건을 배송 완료로 바꿨어요."); break; }
      case "bo-bpaid": {
        const pk = ui.vsPick || new Set(), list = vdShipAll().filter((o) => pk.has(o.id) && o.status === "pending" && o.method !== "vbank"); if (!list.length) { toast("입금을 확인할 주문을 골라 주세요.", "warn"); break; }
        confirmModal("입금 확인 " + list.length + "건", list.map((o) => "<b>" + esc(vdDep(o)) + "</b> · " + won(vdGrpAmt(o)) + " · " + esc(o.no)).join("<br>") + "<br><br>통장에서 위 입금을 모두 확인했나요? 확인하면 ‘신규 주문’으로 넘어가요.", "입금 확인", false, () => {
          pk.clear(); const nos = list.map((o) => o.grp || o.no);
          if (vdSrv()) { vdBankAct("bankOk", nos, "입금 " + list.length + "건을 확인했어요. 신규 주문으로 넘어갔어요."); return; }
          const at = Date.now(), by = (staffMe() || {}).name || "ADMIN"; list.forEach((o) => { Object.assign(o, { status: "paid", paidAt: at, depositBy: by }); if (o.share == null) o.share = vdShare(o); });
          commit("입금 " + list.length + "건을 확인했어요. 신규 주문으로 넘어갔어요."); }); break; }
      case "vda-ship-copy": { const o = O(); if (!o || !o.ship) break; const t = [o.ship.name, o.ship.phone, (o.ship.zip ? "(" + o.ship.zip + ") " : "") + o.ship.addr1 + " " + (o.ship.addr2 || ""), o.ship.memo || ""].filter(Boolean).join(" / "); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast("받는 분 · 주소를 복사했어요."), () => toast(t)); break; }
      case "vda-ship-csv": { const pk = ui.vsPick || new Set(), X = VX(), tab = boTab(), list = vdShipAll().filter((o) => boIn(tab, o) && (!pk.size || pk.has(o.id))).filter((o) => ["ready", "prep"].indexOf(X.shipStOf(o)) >= 0); if (list.length) vsCsv(list); else toast("택배 접수용으로 내려받을 신규 · 배송 준비 주문이 없어요.", "warn"); break; }
      case "bo-xl-orders": { const pk = ui.vsPick || new Set(), tab = boTab(), list = vdShipAll().filter((o) => boIn(tab, o) && (!pk.size || pk.has(o.id))); if (list.length) boXlOrders(list); break; }
      case "vda-ship-bulk": vsBulkModal(); break;
      case "bo-up-paste": { const f = document.getElementById("vda-shipbulk-form"); if (!f) break; ui.boRows = String(f.lines.value || "").split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => l.split(/[\s,\t]+/)); boUpPreview(ui.boRows); break; }
      case "bo-cash-done": { const o = O(); if (!o || !o.cashRcpt) break; o.cashRcpt.done = Date.now(); commit("‘" + o.no + "’ 현금영수증을 발급 완료로 표시했어요."); break; }
      case "bo-cl-ok": {
        const o = O(), X = VX(), c = o && X.claimOf(o); if (!c || c.st !== "req" || c.k === "cancel") break;
        confirmModal(X.CLAIM_K[c.k] + " 승인", esc(o.no) + " · " + esc(c.why) + "<br>택배사에 <b>반품(회수) 접수</b>를 하면 기사님이 회원 주소에서 책을 가져와요." + (c.k === "exchange" ? "<br>책이 돌아오면 ‘교환 상품 보내기’로 새 송장을 넣어요." : "<br>책이 돌아와 상태를 확인하면 ‘책이 도착했어요 · 환불’을 눌러요." + (X.claimFee(o, c) ? " 단순 변심이라 왕복 배송비 " + won(X.claimFee(o, c)) + "을 빼고 환불해요." : "")), "승인 · 수거 요청", false, () => {
          o.claim = { k: c.k, st: "pick", why: c.why, text: c.text, at: c.at, okAt: Date.now(), by: (staffMe() || {}).name || "마스터" }; if (c.acct) o.claim.acct = c.acct; delete o.refundReq;
          commit("‘" + o.no + "’ " + X.CLAIM_K[c.k] + " 요청을 승인했어요. 회원 화면에 ‘수거 중’으로 보여요."); }); break; }
      case "bo-cl-no": {
        const o = O(), X = VX(), c = o && X.claimOf(o); if (!c || (c.st !== "req" && c.st !== "pick")) break;
        openModal(X.CLAIM_K[c.k] + " 요청 반려", '<form id="bo-no-form" class="a-form" data-id="' + esc(o.id) + '" novalidate><p class="a-muted p-small">반려 사유는 회원 배송 조회 화면에 그대로 보여요.</p><div class="a-field"><label for="bo-no-t">반려 사유</label><select class="a-input" id="bo-no-t" name="pre"><option>이미 책을 보냈어요</option><option>반품 기간(받은 날부터 7일)이 지났어요</option><option>책을 사용해 다시 팔 수 없어요</option><option>요청한 내용과 책 상태가 달라요</option><option value="">직접 적기</option></select></div><div class="a-field"><input class="a-input" name="note" maxlength="120" placeholder="더 적을 말 (선택)"></div></form>', btn("취소", "modal-close") + '<button class="a-btn a-btn-danger" type="submit" form="bo-no-form">반려하기</button>'); break; }
      case "bo-cl-rinv": { const o = O(), car = document.querySelector('[data-cl-car="' + d.id + '"]'), inv = document.querySelector('[data-cl-inv="' + d.id + '"]'); if (!o || !o.claim || o.claim.st !== "pick") break; const no = inv ? boInv(inv.value) : ""; if (no && !vsInvOk(no)) { toast("회수 송장 번호를 확인해 주세요.", "warn"); break; } Object.assign(o.claim, { rcar: car ? car.value : "", rinv: no }); commit(no ? "회수 송장을 저장했어요. 회원 화면에도 보여요." : "회수 송장을 지웠어요."); break; }
      case "bo-cl-xsend": {
        const o = O(), X = VX(); if (!o || !o.claim || o.claim.st !== "pick" || o.claim.k !== "exchange") break;
        const car = document.querySelector('[data-ship-car="' + d.id + '"]'), inv = document.querySelector('[data-ship-inv="' + d.id + '"]'), no = inv ? boInv(inv.value) : "";
        if (!vsInvOk(no)) { toast("교환 상품 송장 번호를 확인해 주세요.", "warn"); if (inv) inv.focus(); break; }
        const at = Date.now(); Object.assign(o.claim, { st: "done", xAt: at, oinv: o.ship.inv || "", ocar: o.ship.carrier || "" }); Object.assign(o.ship, { st: "ship", carrier: car ? car.value : X.shipSet().carrier, inv: no, shipAt: at, doneAt: 0, by: (staffMe() || {}).name || "마스터" });
        commit("‘" + o.no + "’ 교환 상품을 보냈어요. 회원 배송 조회에 새 송장이 보여요."); break; }
      case "vda-ship-save": {
        const f = document.getElementById("vda-ship-form"); if (!f) break; const n = (k, lo, hi, dv) => { const x = Math.round(Number(f[k].value)); return x >= lo && x <= hi ? x : dv; };
        v.settings.ship = { autoDays: n("autoDays", 1, 14, 3), outDays: n("outDays", 1, 14, 2), carrier: f.carrier.value, returnFee: n("returnFee", 0, 100000, 6000), returnAddr: f.returnAddr.value.trim().slice(0, 120) };
        commit("배송 설정을 저장했어요."); break;
      }
      case "vda-pginfo": { const o = O(); if (!o) break; const box = document.getElementById("od-pg"); if (box) box.innerHTML = '<p class="a-muted">포트원에 결제 상태를 물어보는 중…</p>';
        VX().payApi("pgInfo", { no: o.no }).then((r) => { const b = document.getElementById("od-pg"); if (!r || !r.ok) { if (b) b.innerHTML = '<p class="a-error">' + esc((r && r.message) || "조회하지 못했어요.") + "</p>"; return; } if (b) b.innerHTML = vdPgInfoHtml(r.pay); if (r.synced) DB.remote.refresh().then(() => { toast(r.synced); render(); }); }, () => { const b = document.getElementById("od-pg"); if (b) b.innerHTML = '<p class="a-error">서버에 닿지 못했어요.</p>'; }); break; }
      case "vda-rfsent": { const o = O(); if (!o || !o.refundPay || o.refundPay.st !== "wait") break; confirmModal("계좌 송금 완료", esc((vdMember(o.mid) || {}).name || "") + " 님께 <b>" + won(o.refundPay.amount || vdRefAmt(o)) + "</b>을<br>" + esc(vdAcctTxt(o.refundPay)) + " 계좌로 송금했나요?", "송금 완료", false, () => { Object.assign(o.refundPay, { st: "done", doneAt: Date.now(), by: (staffMe() || {}).name || "ADMIN" }); commit(o.no + " 환불 송금을 완료로 기록했어요."); }); break; }
      case "vda-paid": { const o = O(); if (!o) break; if (o.method === "vbank") { toast("가상계좌는 회원이 입금하면 포트원이 알려 줘서 자동으로 확인돼요.", "warn"); break; } confirmModal("입금 확인", esc((vdMember(o.mid) || {}).name || "") + " 님 · " + esc(o.title) + "<br>입금자명 <b>" + esc(vdDep(o)) + "</b> · <b>" + won(vdGrpAmt(o)) + "</b> 입금을 확인했나요? " + (o.ship ? "확인하면 ‘신규 주문’으로 넘어가요." : "확인하면 바로 수강할 수 있어요."), "입금 확인", false, () => { if (vdSrv()) { vdBankAct("bankOk", o.grp || o.no, (o.grp || o.no) + (o.ship ? " 입금을 확인했어요. 신규 주문으로 넘어갔어요." : " 입금을 확인했어요. 회원이 바로 수강할 수 있어요.")); return; } o.status = "paid"; o.paidAt = Date.now(); o.depositBy = (staffMe() || {}).name || "ADMIN"; if (o.share == null) o.share = vdShare(o); v.orders.filter((x) => x.grp === o.no && x.status === "pending").forEach((x) => { x.status = "paid"; x.paidAt = o.paidAt; }); commit(o.no + (o.ship ? " 입금을 확인했어요. 신규 주문으로 넘어갔어요." : " 입금을 확인했어요. 회원이 바로 수강할 수 있어요.")); }); break; }
      case "vda-cancel": { const o = O(); if (!o) break; confirmModal("주문 취소", esc(o.no) + " 주문을 취소할까요? (입금 기한이 지났을 때)" + (o.mcid || o.pointOff ? "<br>쓴 쿠폰 · 포인트는 회원에게 돌려줘요." : ""), "주문 취소", true, () => { if (vdSrv()) { vdBankAct("bankCancel", o.grp || o.no, (o.grp || o.no) + " 주문을 취소했어요. 쓴 쿠폰 · 포인트는 회원에게 돌려줬어요."); return; } if (VX().restoreOrder) VX().restoreOrder(o); if (o.tea) o.tea.st = "cancel"; Object.assign(o, { status: "canceled", canceledAt: Date.now(), canceledBy: (S && (S.name || S.role)) || "master" }); v.orders.filter((x) => x.grp === o.no && x.status === "pending").forEach((x) => { if (VX().restoreOrder) VX().restoreOrder(x); Object.assign(x, { status: "canceled", canceledAt: Date.now() }); }); commit(o.no + " 주문을 취소했어요. 주문 내역에 ‘취소’로 남아요."); }); break; }
      case "bo-cl-refund":
      case "vda-refund": { const X = VX(), o = O(); if (!o) break; if (o.ship) { vdBookRefund(o); break; } const done = X.usedOf ? X.usedOf(o.mid, o.pid) : 0, days = Math.floor((Date.now() - o.paidAt) / 864e5), k = X.kindOf(o), rf = X.rfSet ? X.rfSet() : { days: 7, maxUsed: 0 }, inRule = days < rf.days && done <= rf.maxUsed;
        const cu = o.coach ? Number(o.coach.used) || 0 : 0, cl = o.coach ? Math.max(0, (Number(o.coach.n) || 0) - cu) : 0, per = o.coach && o.coach.n ? Math.round(o.amount / o.coach.n) : 0;
        const why = k === "coach" ? "코칭권 " + o.coach.n + "회 중 " + cu + "회 사용 · 결제 " + days + "일째 · " + (!cu && days <= 7 ? "전액 환불 대상이에요." : "남은 " + cl + "회 × 1회 " + won(per) + " = " + won(cl * per) + " 환불 대상이에요.") + "<br>환불하면 남은 코칭권이 바로 사라져요."
          : k === "tea" ? "TEA TIME · " + esc((X.TEA_ST[(o.tea || {}).st] || ["확정 대기"])[0]) + (o.tea && o.tea.when ? " · " + esc(X.teaWhen(o.tea)) : "") + "<br>확정 전 · 3일 전까지 전액, 1~2일 전 50%, 당일 · 불참은 환불 불가예요. 환불하면 신청이 취소돼요."
          : "결제 " + (days + 1) + "일째 · 들은 강의 " + done + "개 · " + (inRule ? "규정(" + rf.days + "일 이내 · " + (rf.maxUsed ? rf.maxUsed + "개 이하" : "미수강") + ")에 맞아 전액 환불 대상이에요." : "규정 밖이라 들은 강의 수만큼 빼고 환불하는 걸 추천해요.") + (k === "extend" ? "<br>1년 연장권을 환불하면 연장된 기간이 사라져요." : "<br>환불하면 수강 권한이 바로 사라져요.");
        const lz = X.lessons(vdP(o.pid) || {}).length || 1, sug = k === "coach" ? (!cu && days <= 7 ? o.amount : cl * per) : k === "tea" ? o.amount : inRule ? o.amount : Math.max(0, Math.round(o.amount * Math.max(0, 1 - done / lz) / 10) * 10);
        openModal("환불 처리", '<form id="vda-ref-form" class="a-form" data-id="' + esc(o.id) + '" novalidate><p>' + esc(o.title) + (X.optTxt(o) ? " · " + esc(X.optTxt(o)) : "") + " · 결제 <b>" + won(o.amount) + "</b></p><p class=\"a-muted p-small\">" + why + "</p>" +
          '<div class="a-form-row"><div class="a-field"><label for="vr-amt">환불 금액 (원)</label><input class="a-input" id="vr-amt" name="amt" type="number" min="0" max="' + o.amount + '" step="10" value="' + sug + '"><small class="a-muted">추천 ' + won(sug) + " · 결제 금액보다 작으면 부분 환불이에요. 남은 금액은 강사 정산에 그대로 들어가요.</small></div>" +
          '<div class="a-field"><label for="vr-why">환불 사유</label><select class="a-input" id="vr-why" name="why"><option>단순 변심</option><option>수강 불만족</option><option>중복 결제</option><option>강의 오류 · 장애</option><option>기타</option></select></div></div>' +
          '<div class="a-field"><label for="vr-memo">메모 <small>(선택)</small></label><input class="a-input" id="vr-memo" name="memo" maxlength="120"' + (o.refundReq && typeof o.refundReq === "object" ? ' value="' + esc(vdRqTxt(o)) + '"' : "") + "></div>" +
          vdRefHow(o) +
          (v.orders.some((x) => x.grp === o.no && x.status === "paid") ? '<label class="a-check vr-grp"><input type="checkbox" name="withGrp" checked><span>함께 결제한 ' + v.orders.filter((x) => x.grp === o.no && x.status === "paid").map((x) => esc(X.optTxt(x) || x.title) + " (" + won(x.amount) + ")").join(", ") + "도 같이 환불 <small class=\"a-muted\">강의를 환불하면 두잉고 강의실이 닫혀 코칭권을 쓸 수 없어요 · 쓴 횟수만큼 빼고 환불해요</small></span></label>" : "") +
          '<p class="a-error" id="vr-error"></p></form>',
          btn("취소", "modal-close") + '<button class="a-btn a-btn-danger" type="submit" form="vda-ref-form">' + (vdPgReal(o) ? "포트원으로 환불하기" : o.method === "bank" ? "환불 처리 (송금 대기로)" : "환불 완료로 바꾸기") + "</button>", "md"); break; }
      case "vda-stc": { const st = vdStmt(d.k, d.m); confirmModal("정산 확정", esc(st.name) + " · " + esc(vdYMtxt(d.m)) + " 판매분 정산을 확정할까요?<br><b>지급액 " + won(st.pay) + "</b> (" + (st.biz ? "사업자 · 부가세 포함" : "개인 · 3.3% 원천징수 뒤") + ")<br><small>확정하면 강사센터에 명세서가 열리고, 이후 환불은 다음 달 정산에서 차감돼요.</small>", "정산 확정", false, () => { const snap = Object.assign({}, st); delete snap.rec; const r = vdPayout(d.k, d.m); if (r) Object.assign(r, { st: "confirmed", confirmedAt: Date.now(), snap }); else v.payouts.push({ key: d.k, ym: d.m, st: "confirmed", confirmedAt: Date.now(), snap }); commit(st.name + " " + vdYMtxt(d.m) + " 정산을 확정했어요. 강사센터에 명세서가 보여요."); }); break; }
      case "vda-sti": { const r = vdPayout(d.k, d.m); if (r) { Object.assign(r, { st: "invoiced", invoiceAt: Date.now() }); commit("세금계산서를 받은 것으로 기록했어요. 이제 지급하면 돼요."); } break; }
      case "vda-pay": { const r = vdPayout(d.k, d.m), st = vdStmt(d.k, d.m); confirmModal("정산 지급 완료", esc(st.name) + " · " + esc(vdYMtxt(d.m)) + " 판매분 <b>" + won(st.pay) + "</b>을 지급했나요?", "지급 완료", false, () => { if (r) Object.assign(r, { st: "paid", at: todayStr(), amount: st.pay }); else v.payouts.push({ key: d.k, ym: d.m, st: "paid", at: todayStr(), amount: st.pay }); commit(st.name + " " + vdYMtxt(d.m) + " VOD 정산을 지급 완료로 바꿨어요."); }); break; }
      case "vda-unpay": { const r = vdPayout(d.k, d.m); if (!r) break; if (r.snap) { r.st = r.invoiceAt ? "invoiced" : "confirmed"; delete r.at; commit("지급 완료를 취소했어요."); } else { v.payouts.splice(v.payouts.indexOf(r), 1); commit("지급 완료를 취소했어요."); } break; }
      case "vda-sto": { const r = vdPayout(d.k, d.m); if (r && r.st !== "paid") confirmModal("정산 확정 취소", "확정을 취소하면 명세서가 다시 ‘집계’ 상태로 돌아가요. 취소할까요?", "확정 취소", true, () => { v.payouts.splice(v.payouts.indexOf(r), 1); commit("정산 확정을 취소했어요."); }); break; }
      case "vda-stm": vdStmtModal(d.k, d.m); break;
      case "vda-print": { const el = document.querySelector(".a-modal .vs-stmt") || document.querySelector(".a-modal-body"), tt = ((document.querySelector(".a-modal-head h2, .a-modal h2") || {}).textContent || "정산 명세서").trim(); if (window.DGFILE && el) window.DGFILE.pdfBtn(a, el, "DOOGO-CLASS-" + tt.replace(/[\\/:*?"<>|\s]+/g, "-") + ".pdf", { width: 760, title: tt }, (msg) => toast(msg)); break; }
      case "vda-stcsv": vdStmtCsv(d.m, d.k); break;
      case "vda-inv": vdInvForm(d.m); break;
      case "vda-copy": { const u = d.u; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast("링크를 복사했어요. 이 링크로 들어와 7일 안에 결제하면 강사 링크 비율로 정산돼요."), () => { const t = a.closest(".vs-link"); const inp = t && t.querySelector("input"); if (inp) { inp.select(); document.execCommand && document.execCommand("copy"); } toast("링크를 복사했어요."); }); break; }
      case "vda-csv": { const X = VX(), rows = [["주문일", "주문번호", "회원", "이메일", "클래스", "상품", "강사", "유입", "결제수단", "판매가", "쿠폰", "포인트", "결제 금액", "상태", "결제일", "환불일", "환불 금액", "정산 비율", "강사 정산"]].concat(v.orders.slice().sort((a, b) => b.at - a.at).map((o) => { const m = vdMember(o.mid) || {}, p = vdP(o.pid) || {}; return [DB.date.toStr(new Date(o.at)), o.no, m.name || "", m.email || "", o.title, X.optTxt(o) || "", p.creator || "", X.CH_TXT[X.isAccess(o) ? o.ch || "web" : "addon"], VD_PAY[o.method] || o.method, X.baseOf(o), o.couponOff || 0, o.pointOff || 0, o.amount, (VD_OST[o.status] || [""])[0], o.paidAt ? DB.date.toStr(new Date(o.paidAt)) : "", o.refundedAt ? DB.date.toStr(new Date(o.refundedAt)) : "", o.refundAmount || "", o.share != null ? o.share : "", o.status === "paid" ? vdInsAmt(o) : 0]; }));
        const csv = "﻿" + rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\n"), l = document.createElement("a"); l.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); l.download = "doogoclass-vod-orders-" + todayStr() + ".csv"; l.click(); break; }
      case "vda-new": ui.vdDraft = null; ROUTE.hash = "#/center/master/vod-classes/new"; break;
      case "vda-alarm": vdAlarmModal(d.id); break;
      case "vda-faq-edit": { const f = d.i != null ? VX().helpFaq()[Number(d.i)] : null, cats = HELP_CATS.concat(f && HELP_CATS.indexOf(f[0]) < 0 ? [f[0]] : []);
        openModal(f ? "FAQ 고치기" : "FAQ 추가", '<div class="a-form"><div class="a-field"><label for="vf-cat">분류</label><select class="a-input" id="vf-cat">' + cats.map((c) => "<option" + (f && f[0] === c ? " selected" : "") + ">" + esc(c) + "</option>").join("") + '</select></div><div class="a-field"><label for="vf-q">질문</label><input class="a-input" id="vf-q" maxlength="80" value="' + esc(f ? f[1] : "") + '"></div><div class="a-field"><label for="vf-a">답변</label><textarea class="a-input" id="vf-a" rows="5" maxlength="800">' + esc(f ? f[2] : "") + '</textarea></div><p class="a-error" id="vf-err"></p></div>', btn("취소", "modal-close") + btn("저장", "vda-faq-save", "a-btn-primary", d.i != null ? ' data-i="' + esc(d.i) + '"' : "")); break; }
      case "vda-faq-save": { const q = (document.getElementById("vf-q") || {}).value || "", an = (document.getElementById("vf-a") || {}).value || "", cat = (document.getElementById("vf-cat") || {}).value || "기타"; if (!q.trim() || !an.trim()) { const e = document.getElementById("vf-err"); if (e) e.textContent = "질문과 답변을 모두 적어 주세요."; break; } const list = vdFaqMine(), item = [cat, q.trim(), an.trim()]; if (d.i != null) list[Number(d.i)] = item; else list.push(item); commit("FAQ를 저장했어요. 스토어 고객센터에 바로 보여요."); break; }
      case "vda-faq-del": { const list = vdFaqMine(), i = Number(d.i); confirmModal("FAQ 삭제", "‘" + esc((list[i] || [])[1] || "") + "’ 질문을 지울까요?", "삭제", true, () => { list.splice(i, 1); commit("FAQ를 지웠어요."); }); break; }
      case "vda-faq-mv": { const list = vdFaqMine(), i = Number(d.i), j = i + Number(d.dir); if (j < 0 || j >= list.length) break; const t = list[i]; list[i] = list[j]; list[j] = t; commit("FAQ 순서를 바꿨어요."); break; }
      case "vda-nt-edit": { const x = (VD().notices || []).find((n) => n.id === d.id);
        openModal(x ? "공지 고치기" : "공지 쓰기", '<div class="a-form"><div class="a-field"><label for="vn-t">제목</label><input class="a-input" id="vn-t" maxlength="60" value="' + esc(x ? x.title : "") + '"></div><div class="a-field"><label for="vn-b">내용</label><textarea class="a-input" id="vn-b" rows="6" maxlength="1500">' + esc(x ? x.body : "") + '</textarea></div><label class="a-check"><input type="checkbox" id="vn-pin"' + (x && x.pin ? " checked" : "") + '><span>필독 (맨 위에 펼쳐서 보여요)</span></label><p class="a-error" id="vn-err"></p></div>', btn("취소", "modal-close") + btn("저장", "vda-nt-save", "a-btn-primary", x ? ' data-id="' + esc(x.id) + '"' : "")); break; }
      case "vda-nt-save": { const t = ((document.getElementById("vn-t") || {}).value || "").trim(), b = ((document.getElementById("vn-b") || {}).value || "").trim(), pin = !!(document.getElementById("vn-pin") || {}).checked; if (!t || !b) { const e = document.getElementById("vn-err"); if (e) e.textContent = "제목과 내용을 적어 주세요."; break; } const list = (VD().notices = VD().notices || []), x = list.find((n) => n.id === d.id); if (x) Object.assign(x, { title: t, body: b, pin }); else list.push({ id: DB.uid("vn"), title: t, body: b, pin, on: true, at: Date.now() }); commit("공지를 저장했어요. 스토어 고객센터에 보여요."); break; }
      case "vda-nt-on": { const x = (VD().notices || []).find((n) => n.id === d.id); if (!x) break; x.on = x.on === false; commit(x.on ? "공지를 보이게 했어요." : "공지를 숨겼어요."); break; }
      case "vda-nt-del": { const list = VD().notices || [], i = list.findIndex((n) => n.id === d.id); if (i < 0) break; confirmModal("공지 삭제", "‘" + esc(list[i].title) + "’ 공지를 지울까요?", "삭제", true, () => { list.splice(i, 1); commit("공지를 지웠어요."); }); break; }
      case "vda-roster": vdRosterModal(d.id); break;
      case "vda-al-csv": { const p = vdP(d.id); vdCsvDl("open-alarm-" + d.id, [["클래스", "이름", "이메일", "휴대폰", "마케팅 동의"]].concat(vdAlarmOf(d.id).map((m) => [p ? p.title : "", m.name, m.email, m.phone || "", m.marketing ? "동의" : ""]))); break; }
      case "vda-al-copy": { const t = document.getElementById("vda-al-txt"); if (t) { t.select(); try { document.execCommand("copy"); toast("알림 문구를 복사했어요."); } catch (e) { toast("문구를 길게 눌러 복사해 주세요.", "warn"); } } break; }
      case "vda-al-give": { const c = (VD().coupons || []).find((x) => x.id === (document.getElementById("vda-al-cp") || {}).value), ms = vdAlarmOf(d.id); if (!c) { toast("보낼 쿠폰을 골라 주세요.", "warn"); break; } const n = ms.filter((m) => VX().issueCoupon(m.id, c)).length; DB.save(); toast("‘" + c.name + "’ 쿠폰을 " + n + "명에게 넣었어요." + (ms.length - n ? " (" + (ms.length - n) + "명은 이미 받았어요)" : "")); break; }
      case "vda-roster-csv": { const p = vdP(d.id); vdCsvDl("roster-" + d.id, [["클래스", "일시", "번호", "이름", "휴대폰", "이메일", "신청일", "결제", "금액", "출석"]].concat(vdRoster(d.id).map((o, i) => { const m = vdMember(o.mid) || {}; return [p ? p.title : "", p ? p.eventAt : "", i + 1, (o.buyer && o.buyer.name) || m.name || "", vdPhoneOf(o, m), m.email || "", DB.date.toStr(new Date(o.at)), o.status === "pending" ? "입금 대기" : "완료", o.amount, o.attend ? "O" : ""]; }))); break; }
      case "vda-attend": { const o = VD().orders.find((x) => x.id === d.id); if (!o) break; o.attend = !o.attend; DB.save(); a.classList.toggle("on", o.attend); a.setAttribute("aria-checked", String(o.attend)); break; }
      case "vda-cancel0": { const o = O(); if (!o) break; confirmModal("신청 취소", esc((vdMember(o.mid) || {}).name || "") + " 님의 ‘" + esc(o.title) + "’ 신청을 취소할까요?" + (o.mcid || o.pointOff ? "<br>쓴 쿠폰 · 포인트는 회원에게 돌려줘요." : "") + "<br>LIVE · 온/오프라인 자리는 다시 열려요.", "신청 취소", true, () => { if (VX().restoreOrder) VX().restoreOrder(o); Object.assign(o, { status: "canceled", canceledAt: Date.now(), canceledBy: (S && (S.name || S.role)) || "master" }); commit(o.no + " 신청을 취소했어요."); }); break; }
      case "vda-blink": { const sel = document.querySelector('[data-blink="' + (window.CSS && CSS.escape ? CSS.escape(d.id) : d.id) + '"]'), no = sel && sel.value; if (!no) { toast("연결할 주문을 골라 주세요.", "warn"); break; }
        const o = VD().orders.find((x) => x.no === no), e = (ui.vdBankLog || []).find((x) => x.id === d.id) || {};
        confirmModal("입금 연결", esc(e.name || "") + " · " + won(e.amount || 0) + " 입금을<br><b>" + esc(o ? vdDep(o) + " · " + o.title : no) + "</b> 주문에 연결할까요? 연결하면 바로 수강이 열려요." + (o && vdGrpAmt(o) !== e.amount ? '<br><small class="a-memo-red">금액이 달라요 (주문 ' + won(vdGrpAmt(o)) + ")</small>" : ""), "연결 · 입금 확인", false, () => {
          VX().payApi("bankLink", { id: d.id, no }).then((r) => DB.remote.refresh().then(() => { ui.vdBankLog = undefined; closeModal(); render(); if (r && r.ok) { actLog(no + " 입금을 연결했어요."); toast(no + " 입금을 연결했어요. 회원이 바로 수강할 수 있어요."); } else toast((r && r.message) || "연결하지 못했어요.", "warn"); }));
        }); break; }
      case "vda-insoff": { const v = VD(), k = d.k, nm = d.n || k; v.insOff = Array.isArray(v.insOff) ? v.insOff : []; const i = v.insOff.indexOf(k);
        if (i >= 0) { v.insOff.splice(i, 1); commit(nm + " 강사 클래스를 스토어에 다시 보여 줘요."); break; }
        confirmModal("스토어에서 숨기기", "<b>" + esc(nm) + "</b> 강사의 클래스 · 배너 · 강사진 카드를 스토어에서 숨길까요?<br>클래스는 지우지 않아요. 새로 살 수만 없고, 이미 산 회원은 계속 들을 수 있어요. 언제든 다시 켤 수 있어요.", "숨기기", true, () => { v.insOff.push(k); commit(nm + " 강사 클래스를 스토어에서 숨겼어요. 클래스는 그대로 남아 있어요."); }); break; }
      case "vda-cph-del": if (ui.vdDraft) { ui.vdDraft.creatorPhoto = "none"; render(); toast("강사 사진을 지웠어요. 저장을 눌러야 반영돼요."); } break;
      case "vda-cancel-exp": { const ex = vdExpired(); confirmModal("기한 지난 주문 취소", "입금 기한(" + (Number(VD().settings.payDays) || 3) + "일)이 지난 무통장 주문 " + ex.length + "건을 한 번에 취소할까요?<br>쓴 쿠폰 · 포인트는 회원에게 돌려주고, 잡아 둔 자리도 다시 열려요.", "모두 취소", true, () => { if (vdSrv()) { vdBankAct("bankCancel", ex.filter((o) => !o.grp).map((o) => o.no), "입금 기한 지난 주문 " + ex.filter((o) => !o.grp).length + "건을 취소했어요."); return; } const at = Date.now(); ex.forEach((o) => { if (VX().restoreOrder) VX().restoreOrder(o); if (o.tea) o.tea.st = "cancel"; Object.assign(o, { status: "canceled", canceledAt: at, canceledBy: "기한 지남" }); }); commit("기한 지난 주문 " + ex.length + "건을 취소했어요."); }); break; }
      case "vda-mem": vdMemberModal(d.id); break;
      case "vda-pt": { const m = vdMember(d.id), amt = Math.round(Number((document.getElementById("vda-pt-amt") || {}).value) || 0), why = ((document.getElementById("vda-pt-why") || {}).value || "").trim(); if (!m) break; if (!amt) { toast("더하거나 뺄 포인트를 적어 주세요. (빼려면 -500처럼)", "warn"); break; } if (!why) { toast("사유를 적어 주세요. 회원 포인트 내역에 보여요.", "warn"); break; } if ((Number(m.points) || 0) + amt < 0) { toast("포인트가 0보다 작아질 수 없어요.", "warn"); break; } VX().addPoint(m, amt, why + " (운영자)"); DB.save(); actLog(m.name + " 포인트 " + (amt > 0 ? "+" : "") + amt); vdMemberModal(d.id); toast("포인트를 " + (amt > 0 ? "더했어요." : "뺐어요.")); break; }
      case "vda-mc-add": { const c = (VD().coupons || []).find((x) => x.id === (document.getElementById("vda-mc-cid") || {}).value); if (!c) { toast("쿠폰을 골라 주세요.", "warn"); break; } if (!VX().issueCoupon(d.id, c)) { toast("이미 받은 쿠폰이에요.", "warn"); break; } DB.save(); vdMemberModal(d.id); toast("‘" + c.name + "’ 쿠폰을 넣었어요."); break; }
      case "vda-mc-del": { const list = (VD().memberCoupons || {})[d.id] || [], i = list.findIndex((x) => x.id === d.mc); if (i < 0) break; list.splice(i, 1); DB.save(); vdMemberModal(d.id); toast("쿠폰을 회수했어요."); break; }
      case "vda-dev-reset": { const m = vdMember(d.id); if (!m) break; m.devices = []; DB.save(); vdMemberModal(d.id); toast("기기 목록을 초기화했어요. 다음 로그인부터 새로 등록돼요."); break; }
      case "vda-dup": { const src = vdP(d.id); if (!src) break; const c = DB.clone(src);
        ["id", "createdAt", "openedAt", "updatedAt", "thumbMeta"].forEach((k) => { delete c[k]; });
        Object.assign(c, { __id: "new", dupOf: src.id, title: (src.title + " (복사본)").slice(0, 60), status: "hidden", base: 0, likeBase: 0, badges: (src.badges || []).filter((b) => b !== "BEST" && b !== "HOT"), faq: (src.faq || []).map((x) => x.slice()) });
        (c.curriculum || []).forEach((ch) => { ch.id = ""; (ch.lessons || []).forEach((l) => { l.id = ""; }); });
        if (VX().isEvent(src)) c.eventAt = "";
        ui.vdDraft = c; ROUTE.hash = "#/center/master/vod-classes/new"; toast("‘" + src.title + "’을 복사했어요. 이름 · 날짜 · 링크를 바꾸고 ‘클래스 만들기’를 누르면 새로 생겨요."); break; }
      case "vda-new-fl": ui.vdDraft = Object.assign(vdBlank(), { __id: "new", type: "live", price: 0, accessDays: null, via: "youtube", eventMin: 90, kakao: "", ytLive: "", hook: "LIVE 무료 특강", ebDays: 3, next: "", gate: false, curriculum: [{ id: "", title: "LIVE 진행 순서", lessons: [{ id: "", title: "오프닝 · 오늘 배울 것", min: 10, video: "", preview: false }, { id: "", title: "핵심 강의", min: 60, video: "", preview: false }, { id: "", title: "실시간 Q&A · LIVE 참여자 혜택 안내", min: 20, video: "", preview: false }] }] }); ROUTE.hash = "#/center/master/vod-classes/new"; break;
      case "vda-jump": { e.preventDefault(); const s = document.getElementById(d.to); if (s) window.scrollTo({ top: s.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" }); break; }
      case "vda-ch-add": edit((x) => { x.curriculum.push({ id: "", title: "", lessons: [{ id: "", title: "", min: 10, video: "", preview: false }] }); }); setTimeout(() => { const ins = document.querySelectorAll(".vda-ch-h input"); if (ins.length) ins[ins.length - 1].focus(); }, 30); break;
      case "vda-ch-del": { const ci = Number(d.ci); vdSync(form); const c = ui.vdDraft.curriculum[ci]; if (!c) break; confirmModal("챕터 지우기", "‘" + esc(c.title || (ci + 1) + "번째 챕터") + "’와 안의 강의 " + (c.lessons || []).length + "개를 지울까요? (저장해야 반영돼요)", "지우기", true, () => { ui.vdDraft.curriculum.splice(ci, 1); closeModal(); render(); }); break; }
      case "vda-ch-move": edit((x) => { const i = Number(d.ci), j = i + Number(d.dir); if (j < 0 || j >= x.curriculum.length) return; const t = x.curriculum[i]; x.curriculum[i] = x.curriculum[j]; x.curriculum[j] = t; }); break;
      case "vda-ls-add": edit((x) => { x.curriculum[Number(d.ci)].lessons.push({ id: "", title: "", min: 10, video: "", preview: false }); }); setTimeout(() => { const ch = document.querySelectorAll(".vda-ch")[Number(d.ci)], ins = ch && ch.querySelectorAll(".vda-ls input[name$='-t']"); if (ins && ins.length) ins[ins.length - 1].focus(); }, 30); break;
      case "vda-ls-del": edit((x) => { x.curriculum[Number(d.ci)].lessons.splice(Number(d.li), 1); }); break;
      case "vda-fq-add": edit((x) => { (x.faq = x.faq || []).push(["", ""]); }); break;
      case "vda-fq-del": edit((x) => { x.faq.splice(Number(d.i), 1); }); break;
      case "vda-img-del": edit((x) => { x[d.k] = ""; }); break;
      case "vda-dimg-move": edit((x) => { const im = vdDimgs(x), i = Number(d.i), j = i + Number(d.dir); if (j >= 0 && j < im.length) { const t0 = im[i]; im[i] = im[j]; im[j] = t0; } }); break;
      case "vda-dimg-del": edit((x) => { vdDimgs(x).splice(Number(d.i), 1); }); toast("상세 이미지를 뺐어요. 저장을 눌러야 반영돼요."); break;
      case "vda-dimg-url": { const inp = document.getElementById("vda-dimg-url"), u = inp ? inp.value.trim() : ""; if (!/^https?:\/\/\S+$/i.test(u)) { toast("https:// 로 시작하는 이미지 주소를 넣어 주세요.", "warn"); break; } edit((x) => { vdDimgs(x).push({ url: u, name: decodeURIComponent(u.split("/").pop().split("?")[0] || "상세 이미지") }); }); toast("이미지 주소를 추가했어요. 저장을 눌러야 반영돼요."); break; }
      case "vda-fdel": edit((x) => { const l = x.curriculum[Number(d.ci)].lessons[Number(d.li)]; (l.files = l.files || []).splice(Number(d.fi), 1); }); break;
      case "vda-flink": { const k = "ls-" + d.ci + "-" + d.li, nm = (form[k + "-ln"] || {}).value || "", u = ((form[k + "-lu"] || {}).value || "").trim(); if (!/^https?:\/\//.test(u)) { toast("https:// 로 시작하는 주소를 넣어 주세요.", "warn"); break; } edit((x) => { const l = x.curriculum[Number(d.ci)].lessons[Number(d.li)]; (l.files = l.files || []).push({ name: nm.trim() || "링크 자료", url: u }); }); break; }
      case "vda-del": { const p = vdP(d.id); if (!p) break; const n = v.orders.filter((o) => o.pid === p.id && o.status !== "refunded").length;
        if (n) { confirmModal("클래스 삭제", "이 클래스는 구매한 회원이 " + n + "명 있어서 지울 수 없어요. 대신 ‘숨김’으로 바꾸면 새로 팔리지 않고, 이미 산 회원은 계속 볼 수 있어요.", "숨김으로 바꾸기", false, () => { p.status = "hidden"; ui.vdDraft = null; commit("‘" + p.title + "’ 클래스를 숨겼어요."); }); break; }
        confirmModal("클래스 삭제", "‘" + esc(p.title) + "’ 클래스를 지울까요? 되돌릴 수 없어요.", "삭제", true, () => { v.products.splice(v.products.indexOf(p), 1); v.banners.forEach((b) => { if (b.pid === p.id) b.pid = ""; }); ui.vdDraft = null; ROUTE.replace("#/center/master/vod-classes"); commit("‘" + p.title + "’ 클래스를 지웠어요."); }); break; }
      case "vda-block": { const m = vdMember(d.id); if (!m) break; m.blocked = !m.blocked; commit(m.name + " 님을 " + (m.blocked ? "이용 중지했어요. 로그인할 수 없어요." : "다시 이용할 수 있게 했어요.")); break; }
      case "vda-pl-hide": { const x = (v.pledges || []).find((y) => y.id === d.id); if (!x) break; x.hidden = !x.hidden; commit(x.hidden ? "다짐 한마디를 숨겼어요. 스토어에 안 보여요." : "다짐 한마디를 다시 보이게 했어요."); break; }
      case "vda-acc": { const c2 = document.getElementById("vda-c2"); if (c2) { c2.value = d.c; c2.dispatchEvent(new Event("input", { bubbles: true })); } break; }
      case "vda-rv-hide": { const r = v.reviews.find((x) => x.id === d.id); if (!r) break; r.hidden = !r.hidden; commit(r.hidden ? "후기를 숨겼어요. 스토어에 안 보여요." : "후기를 다시 보이게 했어요."); break; }
      case "vda-ban-add": vdBanForm(null); break;
      case "vda-tile-add": vtSync(); v.tiles.push({ id: DB.uid("vt"), key: "", label: "새 아이콘", href: "#/vod/c/all", img: "", badge: "", on: true }); commit("아이콘을 추가했어요. 이름 · 링크를 적고 아이콘 이미지를 올려 주세요."); break;
      case "vda-biz": { const v = VD(); v.biz = Object.assign({}, VX().BIZ_DEF, v.biz || {}); v.biz[d.k] = !v.biz[d.k]; commit(BIZ_NAME[d.k] + (v.biz[d.k] ? " 판매 영역을 켰어요. 스토어 메뉴 · 홈에 다시 보여요." : " 판매 영역을 껐어요. 스토어 메뉴 · 홈 · 목록에서 숨겨요.")); break; }
      case "vda-rail-on": { const rs = railSync(), r = rs.find((x) => x.k === d.k); if (!r) break; r.on = !r.on; commit(r.on ? "‘" + hmName(r) + "’ 섹션을 보이게 했어요." : "‘" + hmName(r) + "’ 섹션을 숨겼어요. 첫 화면에서 안 보여요."); break; }
      case "vda-rail-move": { const rs = railSync(), i = rs.findIndex((x) => x.k === d.k), j = i + Number(d.dir); if (i < 0 || j < 0 || j >= rs.length) break; const t = rs[i]; rs[i] = rs[j]; rs[j] = t; commit("섹션 순서를 바꿨어요."); break; }
      case "vda-rail-reset": confirmModal("홈 첫 화면 처음 상태로", "섹션 순서 · 켜기 · 제목 · 고정한 강의 · 뺀 강의 · 분야 탭 · 강사 순서를 모두 처음 상태로 되돌릴까요?", "되돌리기", true, () => { VD().homeRails = VX().RAIL_DEF.map((r) => ({ k: r.k, on: true, tag: r.tag, t: r.t.slice(), mode: "auto", picks: [], hide: [], cats: [] })); commit("홈 첫 화면을 처음 상태로 되돌렸어요."); }); break;
      /* 홈 꾸미기 */
      case "hk-sel": { railSync(); ui.hmSel = d.k; render(); const ed = document.getElementById("hk-ed"); if (ed && window.innerWidth < 900) ed.scrollIntoView({ block: "start" }); break; }
      case "hk-cat": { railSync(); ui.hmCat = d.c; render(); break; }
      case "hk-mv": { const rs = railSync(), tg = hmTarget(rs, d.k, d.c), i = Number(d.i), to = Number(d.to); if (!tg || i < 0 || i >= tg.ids.length || to < 0 || to >= tg.ids.length || i === to) break; hmPin(tg.o, tg.ids, i, to, tg.all); tg.done(); commit(to === 0 ? "맨 앞으로 옮겼어요." : "순서를 바꿨어요."); break; }
      case "hk-hide": { const rs = railSync(), tg = hmTarget(rs, d.k, d.c); if (!tg) break; hmHide(tg.o, d.id); commit("이 자리에서 뺐어요. 아래 ‘뺀 " + (d.k === "teach" ? "강사" : "강의") + "’에서 다시 넣을 수 있어요."); break; }
      case "hk-show": { const rs = railSync(), tg = hmTarget(rs, d.k, d.c); if (!tg) break; hmShow(tg.o, d.id, tg.all); commit("다시 넣었어요."); break; }
      case "hk-add": { const sel = document.getElementById("hk-add"), id = sel ? sel.value : ""; if (!id) { toast("넣을 강의를 골라 주세요.", "warn"); break; } const rs = railSync(), r = rs.find((x) => x.k === d.k); if (!r) break; hmShow(r, id, true); if (r.mode === "auto") r.mode = "pin"; commit("‘" + hmPName(id) + "’ 강의를 넣었어요. ‘맨 앞’ · ↑ ↓로 자리를 옮겨요."); break; }
      case "hk-reset": { const rs = railSync(), r = rs.find((x) => x.k === d.k); if (!r) break; confirmModal("이 섹션 처음 규칙으로", "‘" + hmName(r) + "’의 고정한 순서 · 뺀 " + (d.k === "teach" ? "강사" : "강의") + (d.k === "cat" ? " · 탭 순서" : "") + "를 지우고 기본 규칙대로 보여 줄까요? (이름표 · 제목 · 켜기는 그대로)", "처음 규칙으로", true, () => { const r2 = railState().find((x) => x.k === d.k); Object.assign(r2, { mode: "auto", picks: [], hide: [], cats: [] }); commit("‘" + hmName(r2) + "’을 기본 규칙으로 되돌렸어요."); }); break; }
      case "hk-cat-on": { const rs = railSync(), r = rs.find((x) => x.k === "cat"); if (!r) break; const c = hmCats(r).find((x) => x.k === d.c); if (!c) break; c.on = !c.on; commit(c.on ? "분야 탭을 보이게 했어요." : "분야 탭을 숨겼어요."); break; }
      case "hk-cat-mv": { const rs = railSync(), r = rs.find((x) => x.k === "cat"); if (!r) break; const cs = hmCats(r), i = cs.findIndex((x) => x.k === d.c), j = i + Number(d.dir); if (i < 0 || j < 0 || j >= cs.length) break; const t = cs[i]; cs[i] = cs[j]; cs[j] = t; commit("분야 탭 순서를 바꿨어요."); break; }
      case "vda-tile-on": { vtSync(); const x = v.tiles[Number(d.i)]; if (!x) break; x.on = x.on === false; commit(x.on ? "아이콘을 보이게 했어요." : "아이콘을 숨겼어요."); break; }
      case "vda-tile-move": { vtSync(); const i = Number(d.i), j = i + Number(d.dir); if (j < 0 || j >= v.tiles.length) break; const t = v.tiles[i]; v.tiles[i] = v.tiles[j]; v.tiles[j] = t; commit("아이콘 순서를 바꿨어요."); break; }
      case "vda-tile-reimg": { vtSync(); const x = v.tiles[Number(d.i)]; if (x && x.key) { x.img = VX().tileImg(x.key); commit("기본 아이콘으로 되돌렸어요."); } break; }
      case "vda-tile-del": { vtSync(); const x = v.tiles[Number(d.i)]; if (!x) break; confirmModal("아이콘 지우기", "‘" + esc(x.label || "아이콘") + "’ 아이콘을 지울까요?", "지우기", true, () => { v.tiles.splice(v.tiles.indexOf(x), 1); commit("아이콘을 지웠어요."); }); break; }
      case "vda-tile-reset": confirmModal("처음 구성으로", "아이콘 줄을 처음 12개 구성으로 되돌릴까요? 바꾼 이름 · 아이콘은 사라져요.", "되돌리기", true, () => { v.tiles = VX().seedTiles(); commit("아이콘 줄을 처음 구성으로 되돌렸어요."); }); break;
      case "vda-ban-imgdel": if (ui.vbDraft) { ui.vbDraft[d.k] = ""; vbPaint(d.k); if (d.k === "pc") vbPaint("m"); } break;
      case "vda-cp-add": vdCpForm(null); break;
      case "vda-cp-edit": vdCpForm(Number(d.i)); break;
      case "vda-cp-on": { const c = (v.coupons || [])[Number(d.i)]; if (!c) break; c.on = c.on === false; commit(c.on ? "‘" + c.name + "’ 쿠폰을 켰어요." : "‘" + c.name + "’ 쿠폰을 껐어요. 회원이 더는 쓸 수 없어요."); break; }
      case "vda-cp-del": { const c = (v.coupons || [])[Number(d.i)]; if (!c) break; const st = vdCpStat(c);
        if (st.n) { confirmModal("쿠폰 지우기", "‘" + esc(c.name) + "’ 쿠폰은 받은 회원이 " + st.n + "명 있어서 지울 수 없어요. 대신 꺼 두면 더는 쓸 수 없어요.", "끄기", false, () => { c.on = false; commit("쿠폰을 껐어요."); }); break; }
        confirmModal("쿠폰 지우기", "‘" + esc(c.name) + "’ 쿠폰을 지울까요?", "지우기", true, () => { v.coupons.splice(Number(d.i), 1); commit("쿠폰을 지웠어요."); }); break; }
      case "vda-iq": if (staffDeny("master/vod-inquiries")) break; vdIqForm(d.id); break;
      case "vda-ban-edit": vdBanForm(Number(d.i)); break;
      case "vda-ban-on": { const b = v.banners[Number(d.i)]; if (!b) break; b.on = b.on === false; commit(b.on ? "배너를 켰어요." : "배너를 껐어요."); break; }
      case "vda-ban-move": { const i = Number(d.i), j = i + Number(d.dir); if (j < 0 || j >= v.banners.length) break; const t = v.banners[i]; v.banners[i] = v.banners[j]; v.banners[j] = t; commit("배너 순서를 바꿨어요."); break; }
      case "vda-ban-del": confirmModal("배너 지우기", "이 배너를 지울까요?", "지우기", true, () => { v.banners.splice(Number(d.i), 1); commit("배너를 지웠어요."); }); break;
    }
  });
  // 송장 엑셀 올리기: 파일을 읽어 미리보기 · 택배사를 바꾸면 다시 맞춰요
  document.addEventListener("change", (e) => {
    const t = e.target; if (!isActive() || !t.closest || !t.closest("#vda-shipbulk-form")) return;
    if (t.matches("[data-bo-file]") && t.files && t.files[0]) { const err = document.getElementById("vsb-err"), lab = t.closest(".bo-drop"); if (lab) lab.querySelector("b").textContent = t.files[0].name; XL.read(t.files[0]).then((rows) => { ui.boRows = rows; boUpPreview(rows); }, (er) => { if (err) err.textContent = String((er && er.message) || "파일을 읽지 못했어요."); }); }
    else if (t.name === "carrier" && ui.boRows) boUpPreview(ui.boRows);
  });
  document.addEventListener("change", (e) => { if (isActive() && e.target.matches("[data-vda-img]")) vdImg(e.target); if (isActive() && e.target.matches("[data-vda-dimg]")) vdDimgAdd(e.target); if (isActive() && e.target.matches("[data-vda-pdf]")) vdPdf(e.target); });
  /** 전자책 PDF 올리기: 정식 서버는 그 클래스를 산 회원만 받는 파일(vodp:클래스)로, 시안은 이 브라우저에 — 주소를 ‘내려받기 파일 주소’ 칸에 넣어요 */
  async function vdPdf(input) {
    const file = input.files && input.files[0], pid = input.dataset.vdaPdf, form = document.getElementById("vda-form"); input.value = "";
    if (!file || !form || !ui.vdDraft) return;
    if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) { toast("PDF 파일만 올릴 수 있어요.", "warn"); return; }
    if (file.size > VX().MAT_MAX) { toast((DB.remote && DB.remote.on ? "3MB" : "20MB") + "를 넘는 PDF는 구글 드라이브 · 드롭박스 공유 링크로 넣어 주세요.", "warn"); return; }
    try {
      const r = await VX().matPut(file, "vodp:" + pid);
      vdSync(form); ui.vdDraft.file = r.url; if (form.file) form.file.value = r.url;
      toast("PDF를 올렸어요 (" + kbTxt(file.size) + "). 저장을 눌러야 반영돼요.");
    } catch (e) { toast("PDF를 올리지 못했어요. 잠시 후 다시 시도해 주세요.", "warn"); }
  }
  let vdT = null;
  document.addEventListener("input", (e) => {
    if (!isActive()) return;
    const t = e.target;
    if (t.id === "vda-oq" || t.id === "vda-mq") { clearTimeout(vdT); vdT = setTimeout(() => { if (t.id === "vda-oq") ui.vdOq = t.value; else ui.vdMq = t.value; render(); const n = document.getElementById(t.id); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); return; }
    const f = t.closest && t.closest("#vda-form");
    if (f && t.name === "type") f.dataset.type = t.value;
    if (f && t.name === "where") f.dataset.where = t.value;
    if (f && ui.vdDraft) { clearTimeout(vdT); vdT = setTimeout(() => { vdSync(f); const pv = document.getElementById("vda-prev"), th = document.getElementById("vda-thumb-prev"); if (pv) { pv.innerHTML = vdPrevHtml(ui.vdDraft); VX().hydrate(pv); } if (th) { th.innerHTML = vdThumb(Object.assign({}, ui.vdDraft, { creator: ui.vdDraft.creator || (ui.vdDraft.iid ? insName(ui.vdDraft.iid) : "") }), "lg"); VX().hydrate(th); } const fp = document.getElementById("vda-fun-prev"); if (fp) fp.innerHTML = vdFunPrev(ui.vdDraft); }, 200); }
  });

  /* ---------- 두잉고 운영팀 공지 · 계약 · 서류 (강사센터) ---------- */
  const annFor = (iid) => (DB.data.announcements || []).filter((a) => !a.to || a.to === iid).sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date));
  const annSeenKey = () => (isCoach() ? "annSeenC_" + S.coachId : "annSeen");
  const annUnread = (iid) => { const ins = DB.instructor(iid) || {}, seen = ins[annSeenKey()] || ""; return annFor(iid).filter((a) => a.date > seen).length; };
  function pageOpsNotices() {
    const iid = IID(), ins = INS(), list = annFor(iid), seen = (ins && ins[annSeenKey()]) || "";
    if (ins && list.length && list.some((a) => a.date > seen)) { ins[annSeenKey()] = todayStr(); DB.save(); setTimeout(() => { const nb = document.querySelector('.a-side a[href="#/center/ops-notices"] .a-count, .a-side a[href="#/center/ops-notices"] .num'); if (nb) nb.remove(); }, 0); }
    return head("운영팀 공지", "두잉고 운영팀이 보내는 기능 업데이트 · 점검 · 운영 정책 소식이에요. 강사님에게만 보낸 공지도 여기에 모여요.") +
      '<section class="a-card">' + (list.length ? '<div class="a-ann-all">' + list.map((a) => "<details" + (a.date > seen || a.pinned ? " open" : "") + "><summary>" + (a.pinned ? pill("고정", "dark") + " " : "") + (a.to ? pill("나에게만", "info") + " " : "") + "<b>" + esc(a.title) + "</b><small>" + fmtFull(a.date) + "</small>" + (a.date > seen ? ' <em class="a-new">NEW</em>' : "") + "</summary><div class=\"a-ann-b\">" + DB.rich(a.body) + "</div></details>").join("") + "</div>" : emptyBox("megaphone", "아직 받은 공지가 없어요.")) + "</section>";
  }
  const insDocMissing = (iid) => (isCoach() ? 0 : docMissing(CONTRACTS()[iid]));
  function pageInsContract() {
    const iid = IID(), c = CONTRACTS()[iid], s = contractState(c);
    return head("계약 · 서류", "두잉고와 맺은 이용 계약 기간과 제출 서류를 확인해요. 빠진 서류는 여기서 바로 올려 주세요.") +
      '<section class="a-card"><div class="a-card-head"><h2>이용 계약</h2>' + pill(s[0], s[1]) + "</div>" + (c && c.start ? '<dl class="vda-mem-dl"><div><dt>계약 기간</dt><dd>' + esc(c.start) + " ~ " + esc(c.end) + "</dd></div><div><dt>이용료</dt><dd>" + esc(c.feeNote || "-") + "</dd></div><div><dt>담당</dt><dd>" + esc(c.contact || "두잉고 운영팀") + "</dd></div>" + (c.memo ? "<div><dt>메모</dt><dd>" + esc(c.memo) + "</dd></div>" : "") + "</dl>" : emptyBox("file", "아직 계약 정보가 없어요. 두잉고 운영팀이 곧 등록해 드려요.")) + "</section>" +
      '<section class="a-card"><div class="a-card-head"><h2>제출 서류</h2><span class="a-muted">' + (DOCS.length - docMissing(c)) + " / " + DOCS.length + '</span></div><ul class="vda-help-l">' + DOCS.map((x) => { const f = c && c.docs && c.docs[x[0]]; return "<li>" + (f ? pill("제출 완료", "ok") : pill("미제출", "warn")) + "<b>" + esc(x[1]) + "</b><small>" + (f ? esc((f.name || "") + " · " + (f.at || "")) : "PDF · JPG · PNG · 10MB 이하") + '</small><label class="a-btn a-btn-ghost a-btn-sm">' + icon("upload", "sm") + (f ? "다시 올리기" : "올리기") + '<input type="file" class="sr-only" accept="application/pdf,image/*" data-ct-up="' + x[0] + '"></label></li>'; }).join("") + '</ul><p class="a-muted p-small">' + icon("lock", "xs") + " 올린 서류는 두잉고 운영팀(마스터)만 볼 수 있어요. 계약 기간이 끝나기 30일 전에 갱신 안내를 드려요.</p></section>";
  }
  document.addEventListener("change", async (e) => {
    const t = e.target; if (!isActive() || !t.matches || !t.matches("[data-ct-up]")) return;
    const f = t.files && t.files[0], k = t.dataset.ctUp, iid = IID(); t.value = "";
    if (!f || !iid || isCoach()) return;
    if (f.size > 10 * 1048576) { toast("10MB 이하 파일만 올릴 수 있어요.", "warn"); return; }
    let url = ""; if (window.VOD && window.VOD.matPut) { const r = await window.VOD.matPut(f, "adm").catch(() => null); url = r ? r.url : ""; }
    const cs = CONTRACTS(), c = (cs[iid] = cs[iid] || { feeNote: "", contact: "", phone: "", email: "", memo: "", docs: {} }); c.docs = c.docs || {};
    c.docs[k] = { name: f.name, at: todayStr(), url, by: "instructor" }; DB.save(); render(); toast("‘" + (DOCS.find((x) => x[0] === k) || ["", "서류"])[1] + "’을 올렸어요. 운영팀이 확인할게요.");
  });
  /* ---------------- 렌더 ---------------- */
  const PAGES = { "": pageDashboard, students: pageStudents, cohorts: pageCohorts, reviews: pageReviews, questions: pageQuestions, brand: pageBrand, menus: pageMenus, guide: pageGuide, landing: pageLanding, free: pageFree, curriculum: pageCurriculum, missions: pageMissions, schedule: pageSchedule, notices: pageNotices, faq: pageFaq, docs: pageDocs, library: pageLibrary, motivation: pageMotivation, replays: pageReplays, showcase: pageShowcase, glossary: pageGlossary, notes: pageNotePrompts, channels: pageChannels, partners: pagePartners, coaches: pageCoaches, pages: pageCustomPages, billing: pageBilling };
  const MPAGES = { "": pageMasterHome, partners: pageMasterPartners, instructors: pageMasterInstructors, students: pageMasterStudents, menus: pageMasterMenus, health: pageMasterHealth, reports: pageMasterReports, notices: pageMasterNotices, data: pageMasterData, site: pageMasterSite, billing: pageMasterBilling };
  MPAGES.rs = pageMasterRS;
  Object.assign(MPAGES, { plan: pageMasterPlan, calendar: pageMasterCalendar, sla: pageMasterSla, certs: pageMasterCerts, contracts: pageMasterContracts, staff: pageMasterStaff });
  /* ================= v18: DOOGO CLASS 회원 DB · CRM (마스터) =================
   * 회원 DB: 단계 칩 · 상세 필터 · 일괄 작업(쿠폰 · 포인트 · 태그 · 메시지 · 내려받기) → 회원 상세(구매 · 진도 · 쿠폰 · 포인트 · 수신 동의 · 활동 기록 · 상담 메모)
   * 세그먼트(조건 조합 저장) · 메시지 · 자동화(캠페인 기록 · 7일 안 구매 전환 · 자동 메시지 켜기/끄기) · 회원 분석(가입 추이 · 퍼널 · 단계 · 유입)
   * 법규: 광고는 소식 받기 동의한 회원에게만 · (광고) 표기 · 무료 수신거부 안내 · 야간 광고 제한 · 동의 2년마다 다시 확인 · 개인정보 열람 · 내려받기는 기록 */
  const CRM = () => { const v = VD(); v.crm = v.crm || {}; const c = v.crm; c.rules = Object.assign({ fanN: 3, fanAmt: 500000, fanDays: 60, riskDays: 45, sleepDays: 365, newDays: 7 }, c.rules || {}); ["segs", "camps", "msgs", "views", "dl", "tags"].forEach((k) => { if (!Array.isArray(c[k])) c[k] = []; }); c.auto = c.auto || {}; return c; };
  const DAY = 864e5;
  const crmDays = (ms) => (ms ? Math.round((Date.parse(todayStr() + "T00:00:00") - Date.parse(DB.date.toStr(new Date(ms)) + "T00:00:00")) / DAY) : Infinity);
  const crmAgo = (ms) => { if (!ms) return "-"; const d = crmDays(ms); return d <= 0 ? "오늘" : d === 1 ? "어제" : d < 30 ? d + "일 전" : d < 365 ? Math.floor(d / 30) + "개월 전" : Math.floor(d / 365) + "년 전"; };
  const crmDate = (ms) => (ms ? DB.date.toStr(new Date(ms)).replace(/-/g, ".") : "-");
  const crmStamp = (ms) => { if (!ms) return "-"; const d = new Date(ms); return crmDate(ms) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  const CRM_ORDER = ["fan", "repeat", "first", "free", "new", "lead", "risk", "sleep", "blocked"];
  const crmStage = (k) => {
    const R = CRM().rules;
    return ({ fan: ["열성팬", "dark", "결제 " + R.fanN + "회 이상 또는 누적 " + won(R.fanAmt) + " 이상 · 최근 " + R.fanDays + "일 안에 활동"], repeat: ["재구매", "ok", "2번 이상 결제"], first: ["첫 구매", "info", "1번 결제"], free: ["무료 체험", "info", "무료 LIVE · 무료 특강만 신청"], new: ["신규 가입", "warn", "가입 " + R.newDays + "일 이내 · 아직 결제 전"], lead: ["구매 전", "mute", "가입했지만 아직 신청 · 결제 없음"], risk: ["이탈 위험", "bad", "결제한 적 있지만 " + R.riskDays + "일 넘게 활동 없음"], sleep: ["휴면", "mute", R.sleepDays + "일 넘게 활동 없음"], blocked: ["이용 중지", "bad", "운영자가 이용을 막은 회원"] })[k] || ["-", "mute", ""];
  };
  const CRM_SRC = { instagram: "인스타그램", youtube: "유튜브", naver: "네이버", google: "구글", kakao: "카카오톡 채널", meta: "메타 광고", ins: "강사 링크", migrate: "기존 사이트 이관", direct: "직접 방문" };
  const crmSrcK = (m) => ((m.src || {}).s || "direct");
  const crmSrc = (m) => { const s = m.src || {}; return (CRM_SRC[crmSrcK(m)] || crmSrcK(m)) + (s.by ? " · " + insName(s.by) : "") + (s.c ? " · " + s.c : ""); };
  const crmMaskE = (e) => { const s = String(e || ""), i = s.indexOf("@"); return i > 0 ? s.slice(0, Math.min(2, i)) + "***" + s.slice(i) : s ? "***" : "-"; };
  const crmMaskP = (p) => { const s = String(p || ""); return s ? s.replace(/^(\d{3})-?(\d{3,4})-?(\d{4})$/, "$1-****-$3") : "-"; };
  const crmE = (m) => (ui.crmPii ? m.email || "-" : crmMaskE(m.email));
  const crmPh = (m) => (ui.crmPii ? m.phone || "-" : crmMaskP(m.phone));
  // 가입 방식: 카카오 1초 가입(노란 말풍선) · 이메일 가입 (+ 나중에 카카오를 연결한 이메일 회원 · 카카오 쪽에서 연결을 끊은 회원)
  const KK_IC = () => VX().KAKAO_ICON || "";
  const crmVia = (m) => (m.via === "kakao" ? '<span class="crm-via k" title="카카오로 1초 만에 가입한 회원">' + KK_IC() + "카카오 1초 가입</span>" : '<span class="crm-via">이메일 가입</span>' + (m.kakaoId ? '<span class="crm-via kl" title="이메일로 가입한 뒤 카카오를 연결했어요">' + KK_IC() + "카카오 연결</span>" : "")) +
    (m.kakaoUnlinkedAt && !m.kakaoId ? '<span class="crm-via ku" title="카카오 쪽에서 연결을 끊었어요">카카오 연결 끊김</span>' : "");
  const crmAv = (m, cls) => '<span class="a-avatar' + (cls ? " " + cls : "") + (m.via === "kakao" ? " crm-av-k" : "") + '">' + esc(String(m.name || "?").slice(0, 1)) + (m.via === "kakao" ? '<i class="crm-av-kk" aria-label="카카오 가입">' + KK_IC() + "</i>" : "") + "</span>";
  const crmIns = () => { const s = {}; VD().products.forEach((p) => { if (p.iid) s[p.iid] = 1; }); return Object.keys(s); };
  // 회원 한 명의 CRM 지표 (화면마다 새로 계산 — 주문 · 진도 · 쿠폰이 바뀌면 바로 반영)
  function crmProf(m) {
    const v = VD(), R = CRM().rules, X = VX();
    const os = v.orders.filter((o) => o.mid === m.id), live = os.filter((o) => vdLive(o)), paid = live.filter((o) => o.amount > 0), free = live.filter((o) => !o.amount && o.method === "free");
    const ltv = vdSum(paid), lastPay = paid.reduce((a, o) => Math.max(a, o.paidAt || o.at), 0), firstPay = paid.reduce((a, o) => Math.min(a, o.paidAt || o.at), Infinity);
    const sl = (v.studyLog || {})[m.id] || {}, lastStudy = Object.keys(sl).reduce((a, d) => Math.max(a, Date.parse(d + "T12:00:00") || 0), 0);
    const rvs = v.reviews.filter((r) => r.mid === m.id), iqs = (v.inquiries || []).filter((x) => x.mid === m.id);
    const last = Math.max(m.seenAt || 0, m.lastLoginAt || 0, os.reduce((a, o) => Math.max(a, o.at || 0), 0), lastStudy, rvs.reduce((a, r) => Math.max(a, r.at || 0), 0), m.createdAt || 0);
    const pids = []; live.forEach((o) => { if ((o.kind || "course") === "course" && pids.indexOf(o.pid) < 0) pids.push(o.pid); });
    const ins = {}; live.forEach((o) => { const i = vdIidOf(o); if (i && o.amount > 0) ins[i] = (ins[i] || 0) + 1; });
    const pr = (v.progress || {})[m.id] || {}, pct = {};
    pids.forEach((pid) => { const p = vdP(pid); if (!p || X.typeOf(p) !== "vod") return; const n = (p.curriculum || []).reduce((a, c) => a + (c.lessons || []).length, 0), d = pr[pid] ? Object.keys(pr[pid].done || {}).length : 0; if (n) pct[pid] = Math.min(100, Math.round(d / n * 100)); });
    const pv = Object.keys(pct).map((k) => pct[k]), prog = pv.length ? Math.round(pv.reduce((a, b) => a + b, 0) / pv.length) : null;
    const t0 = todayStr(), mcs = (v.memberCoupons || {})[m.id] || [], cpOk = mcs.filter((x) => !x.usedAt && (!x.exp || x.exp >= t0));
    const likes = (v.likes || {})[m.id] || [], idle = crmDays(last), dp = crmDays(lastPay);
    const rS = !lastPay ? 0 : dp <= 14 ? 5 : dp <= 30 ? 4 : dp <= 60 ? 3 : dp <= 120 ? 2 : 1, fS = Math.min(5, paid.length), mS = !ltv ? 0 : ltv >= 500000 ? 5 : ltv >= 300000 ? 4 : ltv >= 150000 ? 3 : ltv >= 50000 ? 2 : 1;
    const stage = m.blocked ? "blocked" : idle > R.sleepDays ? "sleep" : paid.length && idle > R.riskDays ? "risk" : (paid.length >= R.fanN || ltv >= R.fanAmt) && idle <= R.fanDays ? "fan" : paid.length >= 2 ? "repeat" : paid.length === 1 ? "first" : free.length ? "free" : crmDays(m.createdAt) <= R.newDays ? "new" : "lead";
    const c = m.consent || {}, sub = !!(c.mkt != null ? c.mkt : m.marketing), reAt = sub && c.at ? c.at + 730 * DAY : 0;
    return { m, os, paid, free, ltv, aov: paid.length ? Math.round(ltv / paid.length) : 0, lastPay, firstPay: isFinite(firstPay) ? firstPay : 0, last, idle, pids, ins, pct, prog, cpOk, mcs, likes, rvs, iqs, rfm: [rS, fS, mS], score: rS + fS + mS, stage, sub, reAt, reDue: !!reAt && reAt - Date.now() < 30 * DAY && !m.blocked };
  }
  const crmAll = () => VD().members.map(crmProf);
  const crmChs = (m) => (m.consent ? m.consent.ch || [] : m.marketing ? ["sms", "email", "kakao"] : []);
  // 세그먼트 조건 [항목, 비교, 값]
  const CRM_FIELDS = [["stage", "단계", "sel"], ["via", "가입 방식", "sel"], ["sub", "소식 받기 동의", "sel"], ["kch", "카카오톡 채널 친구", "sel"], ["paid", "결제 횟수", "num", "회"], ["ltv", "누적 결제 금액", "num", "원"], ["idle", "마지막 활동", "num", "일 전"], ["age", "가입한 지", "num", "일"], ["pid", "구매한 클래스", "sel"], ["ins", "구매한 강사", "sel"], ["likes", "찜 · 오픈 알림", "num", "개"], ["cp", "쓸 수 있는 쿠폰", "num", "장"], ["pts", "포인트", "num", "P"], ["prog", "평균 진도율", "num", "%"], ["tag", "태그", "sel"], ["src", "처음 들어온 경로", "sel"]];
  const crmFld = (f) => CRM_FIELDS.find((x) => x[0] === f) || CRM_FIELDS[0];
  const crmOpts = (f) => f === "stage" ? CRM_ORDER.map((k) => [k, crmStage(k)[0]]) : f === "via" ? [["email", "이메일"], ["kakao", "카카오"]] : f === "sub" || f === "kch" ? [["yes", "예"], ["no", "아니요"]] : f === "pid" ? VD().products.filter((p) => p.status !== "hidden").map((p) => [p.id, p.title]) : f === "ins" ? crmIns().map((i) => [i, insName(i)]) : f === "tag" ? CRM().tags.map((t) => [t, t]) : f === "src" ? Object.keys(CRM_SRC).map((k) => [k, CRM_SRC[k]]) : [];
  function crmTest(pf, r) {
    const f = r[0], op = r[1], val = r[2], n = Number(val), m = pf.m;
    const num = { paid: pf.paid.length, ltv: pf.ltv, idle: pf.idle === Infinity ? 99999 : pf.idle, age: crmDays(m.createdAt), likes: pf.likes.length, cp: pf.cpOk.length, pts: Number(m.points) || 0, prog: pf.prog == null ? 0 : pf.prog }[f];
    if (num != null) return op === "lte" ? num <= n : num >= n;
    const hit = f === "stage" ? pf.stage === val : f === "via" ? (m.via || "email") === val : f === "sub" ? pf.sub === (val === "yes") : f === "kch" ? !!m.kakaoCh === (val === "yes") : f === "pid" ? pf.pids.indexOf(val) >= 0 : f === "ins" ? !!pf.ins[val] : f === "tag" ? (m.tags || []).indexOf(val) >= 0 : f === "src" ? crmSrcK(m) === val : true;
    return op === "not" ? !hit : hit;
  }
  const crmRuleTxt = (r) => { const fd = crmFld(r[0]); if (fd[2] === "num") return fd[1] + " " + Number(r[2]).toLocaleString() + (fd[3] || "") + (r[1] === "lte" ? " 이하" : " 이상"); const o = crmOpts(r[0]).find((x) => x[0] === r[2]); return fd[1] + (r[1] === "not" ? " ≠ " : " = ") + (o ? o[1] : r[2]); };
  const CRM_CHIPS = () => [["all", "전체"]].concat(CRM_ORDER.map((k) => [k, crmStage(k)[0]])).concat([["sub", "구독자 (소식 받기)"], ["kch", "카카오톡 채널 친구"], ["recon", "동의 재확인 필요"]]).concat(CRM().segs.map((s) => ["sg:" + s.id, s.name]));
  const crmChipName = (k) => (CRM_CHIPS().find((x) => x[0] === k) || ["", k === "sel" ? "선택한 회원" : "전체"])[1];
  function crmIn(pf, k) {
    if (!k || k === "all") return true;
    if (k === "sel") return !!(ui.crmSel || {})[pf.m.id];
    if (CRM_ORDER.indexOf(k) >= 0) return pf.stage === k;
    if (k === "sub") return pf.sub && !pf.m.blocked;
    if (k === "kch") return !!pf.m.kakaoCh && !pf.m.blocked;
    if (k === "recon") return pf.reDue;
    if (k.indexOf("sg:") === 0) { const s = CRM().segs.find((x) => x.id === k.slice(3)); return !!s && s.rules.every((r) => crmTest(pf, r)); }
    return true;
  }
  const crmF = () => (ui.crmF = Object.assign({ seg: "all", q: "", via: "", sub: "", pid: "", tag: "", sort: "recent" }, ui.crmF || {}));
  const crmQ = (m, q) => (m.name + " " + (m.email || "") + " " + (m.phone || "") + " " + (m.tags || []).join(" ") + " " + m.id).toLowerCase().indexOf(q.toLowerCase()) >= 0;
  function crmList() {
    const F = crmF();
    const list = crmAll().filter((pf) => crmIn(pf, F.seg) && (!F.via || (pf.m.via || "email") === F.via) && (!F.sub || pf.sub === (F.sub === "yes")) && (!F.pid || pf.pids.indexOf(F.pid) >= 0) && (!F.tag || (pf.m.tags || []).indexOf(F.tag) >= 0) && (!F.q || crmQ(pf.m, F.q.trim())));
    const S = { recent: (a, b) => b.m.createdAt - a.m.createdAt, active: (a, b) => b.last - a.last, ltv: (a, b) => b.ltv - a.ltv || b.paid.length - a.paid.length, freq: (a, b) => b.paid.length - a.paid.length || b.ltv - a.ltv, rfm: (a, b) => b.score - a.score, idle: (a, b) => a.last - b.last };
    return list.sort(S[F.sort] || S.recent);
  }
  const crmSelIds = () => Object.keys(ui.crmSel || {}).filter((k) => ui.crmSel[k] && vdMember(k));
  const crmSubTitle = '<a class="a-link" href="#/center/master/vod-crm">' + icon("arrowLeft", "xs") + " 회원 DB</a>";
  const crmNav = (on) => '<nav class="crm-subnav" aria-label="회원 · CRM">' + [["vod-crm", "회원 DB", "users"], ["vod-seg", "세그먼트", "target"], ["vod-msg", "메시지 · 자동화", "send"], ["vod-crm-rp", "회원 분석", "activity"]].map((x) => '<a href="#/center/master/' + x[0] + '"' + (x[0] === on ? ' class="on" aria-current="page"' : "") + ">" + icon(x[2], "sm") + x[1] + "</a>").join("") + "</nav>";

  /* ---------- 1) 회원 DB 목록 ---------- */
  function pageCrm(r) {
    if (r && r.parts && r.parts[2]) return crmMemberPage(decodeURIComponent(r.parts[2]));
    const v = VD(), F = crmF(), all = crmAll(), list = crmList(), sel = crmSelIds(), N = ui.crmN || 50, ym = todayStr().slice(0, 7), pym = vdYMadd(ym, -1);
    const cnt = (k) => all.filter((pf) => crmIn(pf, k)).length, act = all.filter((pf) => !pf.m.blocked);
    const newM = all.filter((pf) => vdYM(pf.m.createdAt) === ym), newP = all.filter((pf) => vdYM(pf.m.createdAt) === pym).length, buyers = act.filter((pf) => pf.paid.length).length;
    const kk = all.filter((pf) => pf.m.via === "kakao").length, subs = cnt("sub");
    const kb = (k, label, val, sub, tone) => '<button type="button" class="a-kpi crm-kpi ' + (tone || "") + (F.seg === k ? " on" : "") + '" data-action="crm-seg" data-k="' + k + '"><span>' + label + "</span><b>" + val + "</b><small>" + sub + "</small></button>";
    const opt = (cur, list2) => list2.map((x) => '<option value="' + esc(x[0]) + '"' + (cur === x[0] ? " selected" : "") + ">" + esc(x[1]) + "</option>").join("");
    const row = (pf) => {
      const m = pf.m, st = crmStage(pf.stage), chs = crmChs(m), on = !!(ui.crmSel || {})[m.id];
      return '<tr class="clickable' + (m.blocked ? " a-dim" : "") + (on ? " crm-on" : "") + '" data-action="crm-open" data-id="' + esc(m.id) + '">' +
        '<td class="w-check" data-stop><input type="checkbox" data-crm-sel="' + esc(m.id) + '"' + (on ? " checked" : "") + ' aria-label="' + esc(m.name) + ' 선택"></td>' +
        '<td><div class="crm-who">' + crmAv(m) + "<div><b>" + esc(m.name || "-") + "</b><small>" + esc(crmE(m)) + "</small>" + ((m.tags || []).length ? '<span class="crm-tags">' + m.tags.slice(0, 2).map((t) => "<i>" + esc(t) + "</i>").join("") + (m.tags.length > 2 ? "<i>+" + (m.tags.length - 2) + "</i>" : "") + "</span>" : "") + "</div></div></td>" +
        '<td class="vda-nw">' + crmVia(m) + "<small class=\"a-memo\">" + crmDate(m.createdAt) + " · " + esc(CRM_SRC[crmSrcK(m)] || crmSrcK(m)) + "</small></td>" +
        "<td>" + pill(st[0], st[1]) + '<small class="a-memo">RFM ' + pf.rfm.join("·") + "</small></td>" +
        '<td class="vda-nw num"><b>' + pf.paid.length + "건</b> " + (pf.ltv ? won(pf.ltv) : "") + (pf.free.length ? '<small class="a-memo">무료 신청 ' + pf.free.length + "건</small>" : "") + "</td>" +
        '<td class="vda-nw">' + crmAgo(pf.last) + "</td>" +
        '<td class="vda-nw num">쿠폰 ' + pf.cpOk.length + '장<small class="a-memo">' + (Number(m.points) || 0).toLocaleString() + "P</small></td>" +
        '<td class="vda-nw">' + (pf.prog == null ? '<span class="a-muted">-</span>' : '<span class="a-bar"><span style="width:' + pf.prog + '%"></span></span><small class="num">' + pf.prog + "%</small>") + "</td>" +
        '<td class="vda-nw">' + (pf.sub ? pill("동의", "info") + '<small class="a-memo">' + CH3n(chs) + "</small>" : '<span class="a-muted">안 함</span>') + (m.kakaoCh ? '<small class="a-memo">카톡 채널 친구</small>' : "") + (pf.reDue ? '<small class="a-memo a-memo-red">2년 재확인 필요</small>' : "") + "</td></tr>";
    };
    const bulk = sel.length ? '<div class="crm-bulk" role="region" aria-label="선택한 회원 작업"><b>' + sel.length + "명 선택</b>" + btn(icon("gift", "sm") + "쿠폰 지급", "crm-b-cp", "a-btn-ghost a-btn-sm") + btn(icon("coins", "sm") + "포인트 지급", "crm-b-pt", "a-btn-ghost a-btn-sm") + btn(icon("pin", "sm") + "태그 붙이기", "crm-b-tag", "a-btn-ghost a-btn-sm") + btn(icon("send", "sm") + "메시지 보내기", "crm-camp-new", "a-btn-primary a-btn-sm", ' data-seg="sel"') + btn(icon("download", "sm") + "내려받기", "crm-csv", "a-btn-ghost a-btn-sm", ' data-sel="1"') + btn("선택 풀기", "crm-sel-clear", "a-btn-text a-btn-sm") + "</div>" : "";
    const views = CRM().views.slice(0, 6), dls = CRM().dl.slice(0, 6);
    return head("회원 DB", "DOOGO CLASS에 가입한 회원(이메일 · 카카오)을 한곳에서 봐요. 누가 어떤 클래스를 샀는지, 열성팬인지 · 소식을 받는지, 쿠폰 · 포인트가 얼마나 있는지 확인하고 바로 혜택 · 메시지를 보낼 수 있어요.", btn(icon(ui.crmPii ? "eyeOff" : "eye", "sm") + (ui.crmPii ? "개인정보 가리기" : "개인정보 보기"), "crm-pii", "a-btn-ghost") + btn(icon("download", "sm") + "내려받기", "crm-csv", "a-btn-ghost") + '<a class="a-btn a-btn-primary" href="#/center/master/vod-msg">' + icon("send", "sm") + "메시지 · 자동화</a>") +
      crmNav("vod-crm") +
      '<div class="a-kpis crm-kpis">' +
        kb("all", "전체 회원", all.length.toLocaleString() + "명", "카카오 " + kk + " · 이메일 " + (all.length - kk)) +
        kb("new", "이번 달 신규", newM.length + "명", "지난달 " + newP + "명 · 카카오 " + newM.filter((pf) => pf.m.via === "kakao").length + "명") +
        kb("first", "구매 전환율", (act.length ? Math.round(buyers / act.length * 100) : 0) + "%", "결제한 회원 " + buyers + "명") +
        kb("fan", "열성팬", cnt("fan") + "명", "누적 " + won(all.filter((pf) => pf.stage === "fan").reduce((a, pf) => a + pf.ltv, 0)), "ok") +
        kb("risk", "이탈 위험", cnt("risk") + "명", "다시 부르기 쿠폰 대상", cnt("risk") ? "warn" : "") +
        kb("sub", "구독자 (소식 받기)", subs + "명", (act.length ? Math.round(subs / act.length * 100) : 0) + "% · 재확인 필요 " + cnt("recon") + "명") +
      "</div>" +
      '<section class="a-card crm-card">' +
        '<div class="crm-chips" role="tablist" aria-label="회원 단계">' + CRM_CHIPS().map((c) => { const n = cnt(c[0]); return '<button type="button" role="tab" aria-selected="' + (F.seg === c[0]) + '" class="crm-chip' + (F.seg === c[0] ? " on" : "") + (c[0].indexOf("sg:") === 0 ? " sg" : "") + '" data-action="crm-seg" data-k="' + esc(c[0]) + '">' + (c[0].indexOf("sg:") === 0 ? icon("target", "xs") : "") + esc(c[1]) + ' <span class="num">' + n + "</span></button>"; }).join("") + '<a class="crm-chip add" href="#/center/master/vod-seg">' + icon("plus", "xs") + "세그먼트 만들기</a></div>" +
        '<div class="crm-vias" role="tablist" aria-label="가입 방식">' + [["", "전체", all.length], ["kakao", "카카오 1초 가입", kk], ["email", "이메일 가입", all.length - kk]].map((x) => '<button type="button" role="tab" aria-selected="' + (F.via === x[0]) + '" class="crm-vbtn' + (x[0] === "kakao" ? " k" : "") + (F.via === x[0] ? " on" : "") + '" data-action="crm-via" data-k="' + x[0] + '">' + (x[0] === "kakao" ? KK_IC() : x[0] === "email" ? icon("mail", "xs") : icon("users", "xs")) + esc(x[1]) + ' <span class="num">' + x[2] + "</span></button>").join("") + "</div>" +
        '<div class="crm-filters"><div class="a-search">' + icon("search", "sm") + '<input class="a-input a-sm" id="crm-q" type="search" placeholder="이름 · 이메일 · 휴대폰 · 태그 · 회원번호" value="' + esc(F.q) + '" aria-label="회원 찾기"></div>' +
          '<select class="a-input a-sm" data-crm-f="via" aria-label="가입 방식"><option value="">가입 방식 전체</option>' + opt(F.via, [["kakao", "카카오 가입"], ["email", "이메일 가입"]]) + "</select>" +
          '<select class="a-input a-sm" data-crm-f="sub" aria-label="소식 받기"><option value="">소식 받기 전체</option>' + opt(F.sub, [["yes", "동의"], ["no", "안 함"]]) + "</select>" +
          '<select class="a-input a-sm" data-crm-f="pid" aria-label="구매한 클래스"><option value="">구매한 클래스 전체</option>' + opt(F.pid, v.products.filter((p) => p.status !== "hidden").map((p) => [p.id, p.title.length > 22 ? p.title.slice(0, 22) + "…" : p.title])) + "</select>" +
          '<select class="a-input a-sm" data-crm-f="tag" aria-label="태그"><option value="">태그 전체</option>' + opt(F.tag, CRM().tags.map((t) => [t, t])) + "</select>" +
          '<select class="a-input a-sm" data-crm-f="sort" aria-label="정렬">' + opt(F.sort, [["recent", "최근 가입 순"], ["active", "최근 활동 순"], ["ltv", "누적 결제 많은 순"], ["freq", "결제 횟수 많은 순"], ["rfm", "RFM 점수 높은 순"], ["idle", "오래 안 온 순"]]) + "</select>" +
          (F.q || F.via || F.sub || F.pid || F.tag || F.seg !== "all" ? btn("조건 지우기", "crm-reset", "a-btn-text a-btn-sm") : "") + '<span class="crm-count">' + list.length + "명</span></div>" +
        bulk +
        (list.length ? '<div class="a-table-wrap"><table class="a-table crm-table"><thead><tr><th class="w-check"><input type="checkbox" data-crm-all aria-label="보이는 회원 모두 선택"' + (list.length && list.every((pf) => (ui.crmSel || {})[pf.m.id]) ? " checked" : "") + "></th><th>회원</th><th>가입</th><th>단계</th><th>구매</th><th>최근 활동</th><th>혜택</th><th>진도</th><th>소식 받기</th></tr></thead><tbody>" + list.slice(0, N).map(row).join("") + "</tbody></table></div>" + (list.length > N ? '<div class="crm-more">' + btn("50명 더 보기 (" + (list.length - N) + "명 남음)", "crm-more", "a-btn-ghost") + "</div>" : "") : emptyBox("users", "조건에 맞는 회원이 없어요.", btn("조건 지우기", "crm-reset", "a-btn-ghost a-btn-sm"))) +
      "</section>" +
      '<section class="a-card crm-card"><details class="crm-log"><summary>' + icon("shieldCheck", "sm") + "<b>개인정보 열람 · 내려받기 기록</b><small>열람 " + CRM().views.length + "회 · 내려받기 " + CRM().dl.length + '회 · 기록은 1년 이상 보관해요</small></summary><div class="crm-log-b">' +
        (views.length || dls.length ? '<ul class="a-list">' + dls.map((x) => "<li><div><b>" + icon("download", "xs") + " 내려받기 · " + x.n + "명</b><small>" + esc(x.who) + " · " + esc(crmStamp(x.at)) + " · 사유: " + esc(x.why) + "</small></div></li>").join("") + views.map((x) => "<li><div><b>" + icon("eye", "xs") + " 열람 · " + esc(x.what) + "</b><small>" + esc(x.who) + " · " + esc(crmStamp(x.at)) + "</small></div></li>").join("") + "</ul>" : '<p class="a-muted">아직 기록이 없어요.</p>') +
        '<p class="a-muted p-small">휴대폰 · 이메일은 평소에 가려서 보여요. ‘개인정보 보기’를 누르거나 회원 목록을 내려받으면 누가 · 언제 · 왜 봤는지 남아요.</p></div></details></section>';
  }
  const CH3n = (chs) => [["sms", "문자"], ["email", "이메일"], ["kakao", "카톡"]].filter((x) => chs.indexOf(x[0]) >= 0).map((x) => x[1]).join(" · ") || "-";

  /* ---------- 2) 회원 상세 (360°) ---------- */
  function crmMemberPage(id) {
    const m = vdMember(id);
    if (!m) return crmSubTitle + emptyBox("userX", "회원을 찾을 수 없어요. 탈퇴했거나 잘못된 주소예요.");
    const v = VD(), X = VX(), pf = crmProf(m), st = crmStage(pf.stage), c = m.consent || VX().consentOf(m.marketing, m.createdAt), cps = v.coupons || [];
    const cpName = (cid) => (cps.find((x) => x.id === cid) || {}).name || "삭제된 쿠폰";
    const fan = Object.keys(pf.ins).filter((i) => pf.ins[i] >= 2).map((i) => insName(i) + " 팬").filter((t) => (m.tags || []).indexOf(t) < 0);
    const card = (t, body, extra) => '<section class="a-card crm-card"><div class="a-card-head"><h2>' + t + "</h2>" + (extra || "") + "</div>" + body + "</section>";
    const classes = pf.pids.map((pid) => { const p = vdP(pid) || {}, end = X.accessEnd ? X.accessEnd(m.id, pid) : 0, pc = pf.pct[pid], tp = X.typeOf(p); return '<li class="crm-cls"><span class="crm-cls-t"><b>' + esc(p.title || "삭제된 클래스") + "</b><small>" + esc(p.creator || "") + " · " + esc((X.TYPE[tp] || [tp])[0]) + (end && end < 4e12 ? " · " + (end > Date.now() ? "~" + crmDate(end) : "수강 끝") : "") + "</small></span>" + (pc != null ? '<span class="crm-cls-p"><span class="a-bar"><span style="width:' + pc + '%"></span></span><small class="num">' + pc + "%</small></span>" : '<span class="a-muted p-small">' + (X.isEvent(p) ? esc(X.fmtEvent ? X.fmtEvent(p.eventAt) : p.eventAt || "") : "-") + "</span>") + "</li>"; }).join("");
    const ords = pf.os.slice().sort((a, b) => b.at - a.at);
    // 활동 기록: 가입 · 로그인 · 주문 · 환불 · 후기 · 문의 · 쿠폰 · 포인트 · 메시지 · 동의 변경 · 메모
    const ev = [[m.createdAt, "userPlus", (m.via === "kakao" ? "카카오로 가입" : "이메일로 가입") + " · " + crmSrc(m)]];
    if (m.lastLoginAt) ev.push([m.lastLoginAt, "user", "마지막 로그인" + (m.loginN ? " (누적 " + m.loginN + "회)" : "")]);
    pf.os.forEach((o) => { ev.push([o.at, o.amount ? "coins" : "sparkles", (o.amount ? "결제 " + won(o.amount) : "무료 신청") + " · " + o.title + (o.status === "pending" ? " (입금 대기)" : "")]); if (o.refundedAt) ev.push([o.refundedAt, "refresh", "환불 " + won(o.refundAmount || o.amount) + " · " + o.title]); });
    pf.rvs.forEach((r) => ev.push([r.at, "star", "후기 " + "★".repeat(r.rating) + " · " + ((vdP(r.pid) || {}).title || "")]));
    pf.iqs.forEach((q) => ev.push([q.at, "headset", "1:1 문의 · " + q.title + (q.answer ? " (답변 완료)" : " (답변 대기)")]));
    pf.mcs.forEach((x) => { ev.push([x.at, "gift", "쿠폰 받음 · " + cpName(x.cid)]); if (x.usedAt) ev.push([x.usedAt, "check", "쿠폰 사용 · " + cpName(x.cid)]); });
    (m.pointLog || []).forEach((x) => ev.push([x.at, "coins", "포인트 " + (x.amt > 0 ? "+" : "") + Number(x.amt).toLocaleString() + "P · " + x.why]));
    CRM().msgs.filter((x) => x.mid === m.id).forEach((x) => ev.push([x.at, "send", "메시지 · " + ((CRM_CH[x.ch] || [""])[0]) + " · " + x.name]));
    (c.log || []).slice(1).forEach((x) => ev.push([x.at, "bell", "소식 받기 " + (x.on ? "동의 (" + CH3n(x.ch || []) + ")" : "철회") + " · " + (x.how || "")]));
    (m.notes || []).forEach((x) => ev.push([x.at, "pen", "상담 메모 · " + x.text]));
    ev.sort((a, b) => b[0] - a[0]);
    const kp = (l, val, sub) => '<div class="a-kpi"><span>' + l + "</span><b>" + val + "</b><small>" + sub + "</small></div>";
    const tagsAll = CRM().tags.filter((t) => (m.tags || []).indexOf(t) < 0);
    return '<div class="vda-top">' + crmSubTitle + "</div>" +
      '<section class="a-card crm-hero"><div class="crm-hero-l">' + crmAv(m, "lg") + '<div><h1>' + esc(m.name || "-") + " " + pill(st[0], st[1]) + (pf.sub ? " " + pill("구독자", "info") : "") + (m.kakaoCh ? " " + pill("카톡 채널 친구", "mute") : "") + "</h1>" +
        '<p class="crm-hero-sub">' + crmVia(m) + " <span>" + esc(crmE(m)) + "</span><span>" + esc(crmPh(m)) + "</span><span>가입 " + crmDate(m.createdAt) + "</span><span>마지막 활동 " + crmAgo(pf.last) + '</span><span class="a-muted">회원번호 ' + esc(m.id) + "</span></p>" +
        ((m.tags || []).length || fan.length ? '<p class="crm-tags lg">' + fan.map((t) => '<i class="auto">' + esc(t) + "</i>").join("") + (m.tags || []).map((t) => "<i>" + esc(t) + '<button type="button" data-action="crm-tag-del" data-id="' + esc(m.id) + '" data-t="' + esc(t) + '" aria-label="' + esc(t) + ' 태그 빼기">' + icon("x", "xs") + "</button></i>").join("") + "</p>" : "") + "</div></div>" +
        '<div class="crm-hero-a">' + btn(icon(ui.crmPii ? "eyeOff" : "eye", "sm") + (ui.crmPii ? "가리기" : "개인정보 보기"), "crm-pii", "a-btn-ghost a-btn-sm", ' data-id="' + esc(m.id) + '"') + btn(icon("gift", "sm") + "쿠폰 지급", "crm-1-cp", "a-btn-ghost a-btn-sm", ' data-id="' + esc(m.id) + '"') + btn(icon("coins", "sm") + "포인트 조정", "crm-1-pt", "a-btn-ghost a-btn-sm", ' data-id="' + esc(m.id) + '"') + btn(icon("send", "sm") + "메시지 보내기", "crm-camp-new", "a-btn-primary a-btn-sm", ' data-seg="one" data-id="' + esc(m.id) + '"') + btn(m.blocked ? "이용 중지 풀기" : "이용 중지", "crm-block", "a-btn-ghost a-btn-sm" + (m.blocked ? "" : " danger"), ' data-id="' + esc(m.id) + '"') + "</div></section>" +
      '<div class="a-kpis a-kpis-5 crm-kpis">' + kp("누적 결제 (LTV)", won(pf.ltv), "평균 " + won(pf.aov)) + kp("결제 횟수", pf.paid.length + "회", "무료 신청 " + pf.free.length + "회") + kp("RFM 점수", pf.score + " / 15", "최근 " + pf.rfm[0] + " · 횟수 " + pf.rfm[1] + " · 금액 " + pf.rfm[2]) + kp("평균 진도율", pf.prog == null ? "-" : pf.prog + "%", "구매한 VOD " + Object.keys(pf.pct).length + "개") + kp("쿠폰 · 포인트", pf.cpOk.length + "장", (Number(m.points) || 0).toLocaleString() + "P 보유") + "</div>" +
      '<div class="crm-grid"><div class="crm-col">' +
        card("구매한 클래스 " + pf.pids.length + "개", pf.pids.length ? '<ul class="crm-clss">' + classes + "</ul>" : '<p class="a-muted">아직 구매 · 신청한 클래스가 없어요.</p>') +
        card("주문 · 결제 " + ords.length + "건", ords.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>주문일</th><th>클래스</th><th>결제</th><th class="right">금액</th><th>상태</th></tr></thead><tbody>' + ords.map((o) => { const s2 = VD_OST[o.status] || VD_OST.paid; return '<tr><td class="vda-nw">' + crmDate(o.at) + '<small class="a-memo num">' + esc(o.no) + "</small></td><td>" + esc(o.title) + (VX().optTxt && VX().optTxt(o) ? '<small class="a-memo">' + esc(VX().optTxt(o)) + "</small>" : "") + '</td><td class="vda-nw">' + esc(VD_PAY[o.method] || o.method) + (o.couponOff ? '<small class="a-memo">쿠폰 -' + won(o.couponOff) + "</small>" : "") + '</td><td class="right num">' + won(o.amount) + "</td><td>" + pill(s2[0], s2[1]) + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<p class="a-muted">주문이 없어요.</p>') +
        card("찜 · 오픈 알림 " + pf.likes.length + "개", pf.likes.length ? '<ul class="crm-mini">' + pf.likes.map((pid) => { const p = vdP(pid) || {}; return "<li><b>" + esc(p.title || "삭제된 클래스") + "</b><small>" + (p.status === "soon" ? "오픈 알림 신청" : pf.pids.indexOf(pid) >= 0 ? "구매함" : "찜 · 아직 안 삼") + "</small></li>"; }).join("") + "</ul>" : '<p class="a-muted">찜한 클래스가 없어요.</p>') +
        card("후기 · 1:1 문의", pf.rvs.length || pf.iqs.length ? '<ul class="crm-mini">' + pf.rvs.map((r) => "<li><b>" + "★".repeat(r.rating) + " " + esc((vdP(r.pid) || {}).title || "") + "</b><small>" + esc(r.text) + "</small></li>").join("") + pf.iqs.map((q) => "<li><b>" + icon("headset", "xs") + " " + esc(q.title) + "</b><small>" + (q.answer ? "답변 완료" : "답변 대기") + " · " + crmDate(q.at) + "</small></li>").join("") + "</ul>" : '<p class="a-muted">후기 · 문의가 없어요.</p>') +
      '</div><div class="crm-col">' +
        card("소식 받기 동의", '<dl class="crm-dl"><div><dt>광고성 정보</dt><dd>' + (pf.sub ? pill("동의", "info") + " " + esc(CH3n(c.ch || [])) : pill("안 함", "mute")) + "</dd></div>" + (pf.sub ? "<div><dt>야간 (21~8시)</dt><dd>" + (c.night ? "동의" : "안 함 · 밤에는 광고를 안 보내요") + "</dd></div><div><dt>동의한 날</dt><dd>" + crmDate(c.at) + "</dd></div><div><dt>다시 확인할 날</dt><dd>" + crmDate(pf.reAt) + (pf.reDue ? " " + pill("재확인 필요", "warn") : "") + "</dd></div>" : "") +
          (m.via === "kakao" ? "<div><dt>카카오 회원번호</dt><dd class=\"num\">" + esc(ui.crmPii ? m.kakaoId || "-" : String(m.kakaoId || "").replace(/^(\d{3})\d+(\d{2})$/, "$1*****$2") || "-") + "</dd></div><div><dt>카카오톡 채널</dt><dd>" + (m.kakaoCh ? "친구 추가함" : "친구 아님") + "</dd></div>" + (m.birth ? "<div><dt>생일 · 연령대</dt><dd>" + esc(m.birth) + " · " + esc(m.age || "-") + "</dd></div>" : "") : "") + "</dl>" +
          ((c.log || []).length ? '<ul class="crm-mini sm">' + c.log.slice().reverse().slice(0, 5).map((x) => "<li><b>" + (x.on ? "동의" : "철회") + "</b><small>" + crmDate(x.at) + " · " + esc(x.how || "") + (x.on ? " · " + esc(CH3n(x.ch || ["sms", "email", "kakao"])) : "") + "</small></li>").join("") + "</ul>" : "") +
          '<p class="a-muted p-small">동의 · 철회는 회원이 마이페이지에서 직접 바꿔요. 운영자는 바꿀 수 없어요.</p>') +
        card("쿠폰 " + pf.cpOk.length + "장 · 포인트 " + (Number(m.points) || 0).toLocaleString() + "P", (pf.mcs.length ? '<ul class="crm-mini sm">' + pf.mcs.slice().reverse().map((x) => "<li><b>" + esc(cpName(x.cid)) + "</b><small>" + (x.usedAt ? "사용 " + crmDate(x.usedAt) : x.exp && x.exp < todayStr() ? "만료" : "~" + esc(x.exp || "기한 없음")) + "</small>" + (!x.usedAt ? btn("회수", "crm-cp-del", "a-btn-text a-btn-sm", ' data-id="' + esc(m.id) + '" data-mc="' + esc(x.id) + '"') : "") + "</li>").join("") + "</ul>" : '<p class="a-muted p-small">받은 쿠폰이 없어요.</p>') +
          ((m.pointLog || []).length ? '<ul class="crm-mini sm">' + m.pointLog.slice().sort((a, b) => b.at - a.at).slice(0, 5).map((x) => "<li><b>" + esc(x.why) + '</b><small class="num">' + (x.amt > 0 ? "+" : "") + Number(x.amt).toLocaleString() + "P · " + crmDate(x.at) + "</small></li>").join("") + "</ul>" : "")) +
        card("태그", '<div class="crm-tagadd"><select class="a-input a-sm" id="crm-tag-pick" aria-label="태그 고르기"><option value="">태그 고르기</option>' + tagsAll.map((t) => '<option value="' + esc(t) + '">' + esc(t) + "</option>").join("") + '</select><input class="a-input a-sm" id="crm-tag-new" maxlength="12" placeholder="새 태그 (12자)" aria-label="새 태그">' + btn("붙이기", "crm-tag-add", "a-btn-ghost a-btn-sm", ' data-id="' + esc(m.id) + '"') + "</div>" + (fan.length ? '<p class="a-muted p-small">‘' + esc(fan.join(", ")) + "’는 같은 강사 클래스를 2개 이상 사서 자동으로 붙었어요.</p>" : "")) +
        card("상담 메모", '<div class="crm-note"><textarea class="a-input" id="crm-note" rows="2" maxlength="300" placeholder="통화 · 상담 내용, 다음에 할 일 (회원에게는 안 보여요)" aria-label="상담 메모"></textarea>' + btn("메모 남기기", "crm-note-add", "a-btn-dark a-btn-sm", ' data-id="' + esc(m.id) + '"') + "</div>" + ((m.notes || []).length ? '<ul class="crm-mini">' + m.notes.slice().sort((a, b) => b.at - a.at).map((x) => "<li><b>" + esc(x.text) + "</b><small>" + esc(x.by || "") + " · " + crmDate(x.at) + "</small>" + btn(icon("trash", "xs"), "crm-note-del", "a-btn-text a-btn-sm", ' data-id="' + esc(m.id) + '" data-n="' + esc(x.id) + '" aria-label="메모 지우기"') + "</li>").join("") + "</ul>" : "")) +
        card("활동 기록", '<ol class="crm-tl">' + ev.slice(0, 30).map((e) => "<li>" + icon(e[1], "xs") + "<div><b>" + esc(e[2]) + "</b><small>" + esc(crmStamp(e[0])) + "</small></div></li>").join("") + "</ol>") +
      "</div></div>";
  }

  /* ---------- 3) 세그먼트 ---------- */
  function pageCrmSeg() {
    const all = crmAll(), R = CRM().rules, B = (ui.crmB = ui.crmB || { name: "", rules: [["stage", "is", "fan"]] });
    const prev = all.filter((pf) => B.rules.every((r) => crmTest(pf, r)));
    const fieldSel = (i, f) => '<select class="a-input a-sm" data-crm-b="f" data-i="' + i + '" aria-label="조건 항목">' + CRM_FIELDS.map((x) => '<option value="' + x[0] + '"' + (x[0] === f ? " selected" : "") + ">" + x[1] + "</option>").join("") + "</select>";
    const opSel = (i, r) => { const num = crmFld(r[0])[2] === "num"; return '<select class="a-input a-sm" data-crm-b="op" data-i="' + i + '" aria-label="비교">' + (num ? [["gte", "이상"], ["lte", "이하"]] : [["is", "이다"], ["not", "아니다"]]).map((x) => '<option value="' + x[0] + '"' + (r[1] === x[0] ? " selected" : "") + ">" + x[1] + "</option>").join("") + "</select>"; };
    const valIn = (i, r) => { const fd = crmFld(r[0]); return fd[2] === "num" ? '<span class="crm-unit"><input class="a-input a-sm" type="number" min="0" data-crm-b="val" data-i="' + i + '" value="' + esc(r[2]) + '" aria-label="값"><em>' + (fd[3] || "") + "</em></span>" : '<select class="a-input a-sm" data-crm-b="val" data-i="' + i + '" aria-label="값">' + crmOpts(r[0]).map((x) => '<option value="' + esc(x[0]) + '"' + (x[0] === r[2] ? " selected" : "") + ">" + esc(x[1].length > 26 ? x[1].slice(0, 26) + "…" : x[1]) + "</option>").join("") + "</select>"; };
    const segCard = (k, name, desc, n, custom) => '<div class="crm-seg"><div><b>' + (custom ? icon("target", "xs") + " " : "") + esc(name) + '</b><small>' + esc(desc) + '</small></div><span class="crm-seg-n num">' + n + '<small>명</small></span><div class="crm-seg-a">' + btn("회원 보기", "crm-seg-go", "a-btn-ghost a-btn-sm", ' data-k="' + esc(k) + '"') + btn(icon("send", "xs") + "메시지", "crm-camp-new", "a-btn-ghost a-btn-sm", ' data-seg="' + esc(k) + '"') + (custom ? btn(icon("trash", "xs"), "crm-seg-del", "a-btn-text a-btn-sm", ' data-id="' + esc(k.slice(3)) + '" aria-label="세그먼트 지우기"') : "") + "</div></div>";
    return head("세그먼트", "조건을 골라 회원 묶음을 만들어요. ‘문대표 강의를 산 열성팬’, ‘찜만 하고 안 산 회원’처럼 묶어 두면 회원 DB에서 바로 보고, 메시지 · 쿠폰을 한 번에 보낼 수 있어요. 숫자는 늘 지금 데이터로 다시 세요.", "") + crmNav("vod-seg") +
      '<section class="a-card crm-card"><div class="a-card-head"><h2>새 세그먼트 만들기</h2><span class="crm-prev-n">지금 <b class="num">' + prev.length + "명</b>이 해당돼요</span></div>" +
        '<div class="crm-builder">' + B.rules.map((r, i) => '<div class="crm-rule">' + (i ? '<span class="crm-and">그리고</span>' : '<span class="crm-and">조건</span>') + fieldSel(i, r[0]) + opSel(i, r) + valIn(i, r) + (B.rules.length > 1 ? btn(icon("x", "xs"), "crm-b-del", "a-btn-text a-btn-sm", ' data-i="' + i + '" aria-label="조건 빼기"') : "") + "</div>").join("") +
        '<div class="crm-b-foot">' + btn(icon("plus", "sm") + "조건 더하기", "crm-b-add", "a-btn-ghost a-btn-sm") + '<input class="a-input a-sm" id="crm-b-name" maxlength="30" placeholder="세그먼트 이름 (예: 문대표 열성팬)" value="' + esc(B.name) + '" aria-label="세그먼트 이름">' + btn(icon("check", "sm") + "저장", "crm-b-save", "a-btn-primary a-btn-sm") + "</div>" +
        (prev.length ? '<p class="crm-prev">' + prev.slice(0, 12).map((pf) => '<a href="#/center/master/vod-crm/' + esc(pf.m.id) + '">' + esc(pf.m.name) + "</a>").join("") + (prev.length > 12 ? "<span>외 " + (prev.length - 12) + "명</span>" : "") + "</p>" : '<p class="a-muted p-small">조건에 맞는 회원이 없어요. 조건을 바꿔 보세요.</p>') + "</div></section>" +
      '<section class="a-card crm-card"><div class="a-card-head"><h2>직접 만든 세그먼트 ' + CRM().segs.length + "개</h2></div>" + (CRM().segs.length ? '<div class="crm-segs">' + CRM().segs.map((s) => segCard("sg:" + s.id, s.name, s.rules.map(crmRuleTxt).join(" · "), all.filter((pf) => s.rules.every((r) => crmTest(pf, r))).length, true)).join("") + "</div>" : '<p class="a-muted">아직 만든 세그먼트가 없어요.</p>') + "</section>" +
      '<section class="a-card crm-card"><div class="a-card-head"><h2>자동으로 나뉘는 단계</h2><p class="a-muted">회원마다 하나의 단계에 들어가요. 위에서부터 먼저 맞는 단계가 붙어요.</p></div><div class="crm-segs">' + ["blocked", "sleep", "risk", "fan", "repeat", "first", "free", "new", "lead"].map((k) => { const s = crmStage(k); return segCard(k, s[0], s[2], all.filter((pf) => pf.stage === k).length); }).join("") + segCard("sub", "구독자 (소식 받기 동의)", "광고성 정보 수신에 동의한 회원 · 광고 메시지는 이 회원들에게만 가요", all.filter((pf) => crmIn(pf, "sub")).length) + segCard("recon", "동의 재확인 필요", "동의한 지 2년이 다 된 회원 · 법에 따라 2년마다 동의 여부를 알려야 해요", all.filter((pf) => pf.reDue).length) + "</div></section>" +
      '<section class="a-card crm-card"><div class="a-card-head"><h2>단계 기준</h2><p class="a-muted">우리 서비스에 맞게 숫자를 바꾸면 모든 화면의 단계가 바로 다시 계산돼요.</p></div><form class="crm-rules" id="crm-rules" novalidate>' +
        [["fanN", "열성팬: 결제 횟수", "회 이상"], ["fanAmt", "또는 누적 결제", "원 이상"], ["fanDays", "그리고 최근 활동", "일 이내"], ["riskDays", "이탈 위험: 활동 없음", "일 넘게"], ["sleepDays", "휴면: 활동 없음", "일 넘게"], ["newDays", "신규 가입: 가입 후", "일 이내"]].map((x) => '<label><span>' + x[1] + '</span><span class="crm-unit"><input class="a-input a-sm" type="number" min="1" name="' + x[0] + '" value="' + R[x[0]] + '"><em>' + x[2] + "</em></span></label>").join("") +
        btn(icon("check", "sm") + "기준 저장", "crm-rules-save", "a-btn-dark a-btn-sm") + "</form></section>";
  }

  /* ---------- 4) 메시지 · 자동화 ---------- */
  const CRM_CH = { alim: ["카카오 알림톡", false, "정보성만 · 결제 · 수강 · 일정 안내 · 템플릿 심사 후 발송"], brand: ["카카오 브랜드 메시지", true, "광고 · 소식 받기(카카오톡) 동의 회원 · 08:00~20:50에만"], sms: ["문자 (LMS)", true, "광고 · 소식 받기(문자) 동의 회원 · 밤 9시~아침 8시는 야간 동의자만"], email: ["이메일", true, "광고 · 소식 받기(이메일) 동의 회원 · 제목에 (광고)"] };
  /* 실제 발송 (서버 /api/admin msg-send · 솔라피 · Resend) — 연결 상태는 서버가 알려 줘요. 서버가 없거나 키가 없으면 예전처럼 기록 · 쿠폰만 */
  const crmSendCfg = () => { const c = CRM(); c.send = Object.assign({ optout: "", targeting: "I", tpls: [] }, c.send || {}); if (!Array.isArray(c.send.tpls)) c.send.tpls = []; return c.send; };
  function crmCfg() {
    if (!(DB.remote && DB.remote.on)) return null;
    if (!ui.msgCfg && !ui.msgCfgLoading) { ui.msgCfgLoading = true; DB.remote.call("admin", { action: "msg-status" }).then((r) => { ui.msgCfg = (r && r.cfg) || {}; }, () => { ui.msgCfg = {}; }).then(() => { ui.msgCfgLoading = false; if (/vod-msg/.test(ROUTE.hash)) render(); if (document.getElementById("crm-camp")) crmCampPaint(); }); }
    return ui.msgCfg || null;
  }
  const crmLive = (ch) => { const c = crmCfg(); return !!(c && c[ch]); };
  // 채널마다 연결 순서 (가입 → 키를 Vercel 환경 변수에 → 여기서 확인)
  const CRM_LINK = {
    sms: ["솔라피", "https://solapi.com", [["솔라피(solapi.com) 가입 · 사업자 인증", ""], ["발신번호 등록 (회사 대표번호 · 통신서비스 이용증명원)", ""], ["API Key 만들기 → Vercel 환경 변수", "SOLAPI_API_KEY · SOLAPI_API_SECRET · SOLAPI_SENDER"], ["광고 문자: 080 무료 수신거부 번호 신청 → 아래 칸에 입력", ""]]],
    alim: ["솔라피 + 카카오톡 채널", "https://business.kakao.com", [["카카오톡 채널 만들기 · 비즈니스 채널 인증", ""], ["솔라피 › 카카오 채널 연동 → pfId 를 환경 변수에", "SOLAPI_PFID"], ["알림톡 템플릿 등록 → 카카오 심사(영업일 1~3일)", ""], ["승인된 템플릿 ID · 내용을 아래 ‘알림톡 템플릿’에 추가", ""]]],
    brand: ["솔라피 + 카카오톡 채널", "https://solapi.com", [["알림톡과 같은 카카오톡 채널 · pfId 를 써요", "SOLAPI_PFID"], ["솔라피에서 브랜드 메시지 사용 신청", ""], ["보낼 대상(채널 친구 등)을 아래에서 고르기", ""]]],
    email: ["Resend", "https://resend.com", [["Resend(resend.com) 가입", ""], ["도메인 doogoclass.com 추가 → 가비아 DNS에 안내된 레코드(SPF · DKIM) 넣기", ""], ["API Key · 보내는 주소 → Vercel 환경 변수", "RESEND_API_KEY · MAIL_FROM"]]]
  };
  const crmNight = (ms, ch) => { const d = new Date(ms), h = d.getHours() + d.getMinutes() / 60; return ch === "brand" ? h >= 20 + 50 / 60 || h < 8 : ch === "sms" ? h >= 21 || h < 8 : false; };
  // 보낼 대상 → 보낼 수 있는 회원 / 못 보내는 이유
  function crmReach(pfs, ch, at) {
    const ad = (CRM_CH[ch] || [])[1], key = ch === "brand" ? "kakao" : ch, night = crmNight(at, ch), ok = [], skip = {};
    const no = (why) => { skip[why] = (skip[why] || 0) + 1; };
    pfs.forEach((pf) => {
      const m = pf.m;
      if (m.blocked) return no("이용 중지");
      if (ch === "alim" || ch === "sms") { if (!m.phone) return no("휴대폰 번호 없음"); }
      if (ad) { if (!pf.sub) return no("소식 받기 미동의"); if (crmChs(m).indexOf(key) < 0) return no("이 채널 미동의"); if (night && ch === "sms" && !(m.consent || {}).night) return no("야간 수신 미동의"); }
      ok.push(pf);
    });
    return { ok, skip, ad, blocked: ad && night && ch === "brand" };
  }
  const crmTarget = (seg, one) => crmAll().filter((pf) => (seg === "one" ? pf.m.id === one : crmIn(pf, seg)));
  const crmMsgTxt = (t, ch, name) => { const ad = (CRM_CH[ch] || [])[1]; let s = String(t || "").replace(/\{이름\}/g, name || "회원"); if (ad && !/^\(광고\)/.test(s)) s = "(광고) " + s; return s + (ad ? "\n\n" + (ch === "sms" ? "무료 수신거부 080-000-0000" : "수신 거부: DOOGO CLASS 마이페이지 › 회원 정보 수정") : ""); };
  function crmConv(c) {
    if (c.at > Date.now()) return null;
    const to = {}; (c.to || []).forEach((id) => { to[id] = 1; });
    const os = VD().orders.filter((o) => to[o.mid] && o.amount > 0 && vdLive(o) && (o.paidAt || o.at) >= c.at && (o.paidAt || o.at) <= c.at + 7 * DAY), ms = {};
    os.forEach((o) => { ms[o.mid] = 1; });
    return { n: Object.keys(ms).length, amt: vdSum(os) };
  }
  const CRM_AUTO = [
    ["welcome", "가입 환영", "가입하면 바로", "alim", "가입 완료 안내 · 신규 가입 5,000원 쿠폰은 자동으로 들어가요", (L) => L.filter((pf) => crmDays(pf.m.createdAt) <= 0)],
    ["nobuy", "가입 3일 · 아직 결제 전", "가입 3일째 오전 10시", "brand", "(광고) 신규 쿠폰 잊지 마세요 + 첫 강의 추천", (L) => L.filter((pf) => !pf.paid.length && crmDays(pf.m.createdAt) >= 3 && crmDays(pf.m.createdAt) <= 4)],
    ["live", "무료 LIVE 하루 전 · 1시간 전", "LIVE 일정 기준", "alim", "입장 링크 · 오픈채팅방 안내", (L) => { const t1 = DB.date.addDays(todayStr(), 1); return L.filter((pf) => pf.free.some((o) => { const p = vdP(o.pid); return p && p.eventAt && p.eventAt.slice(0, 10) === t1; })); }],
    ["like", "찜하고 아직 안 산 회원", "찜한 지 3일", "brand", "(광고) 찜한 클래스 할인 · 마감 소식", (L) => L.filter((pf) => pf.likes.some((pid) => pf.pids.indexOf(pid) < 0 && (vdP(pid) || {}).status === "on"))],
    ["start", "결제했는데 강의실에 안 들어옴", "결제 3일째", "alim", "강의실 들어가는 방법 안내", (L) => L.filter((pf) => pf.paid.some((o) => (o.kind || "course") === "course" && pf.pct[o.pid] === 0 && crmDays(o.paidAt) >= 3))],
    ["cpexp", "쿠폰 만료 3일 전", "만료 3일 전 오전 11시", "brand", "(광고) 쿠폰이 곧 사라져요 — 2026년부터 회사가 준 쿠폰 사용을 권하는 알림톡은 못 보내요", (L) => { const t3 = DB.date.addDays(todayStr(), 3); return L.filter((pf) => pf.cpOk.some((x) => x.exp && x.exp <= t3)); }],
    ["expire", "수강권 만료 14일 전", "만료 14일 전", "alim", "남은 기간 · 1년 연장권 안내", (L) => L.filter((pf) => pf.pids.some((pid) => { const e = VX().accessEnd ? VX().accessEnd(pf.m.id, pid) : 0; return e > Date.now() && e < 4e12 && e - Date.now() < 14 * DAY; }))],
    ["winback", "이탈 위험 회원 다시 부르기", "매주 월요일 오전 10시", "brand", "(광고) 다시 오면 쓰는 1만 원 쿠폰", (L) => L.filter((pf) => pf.stage === "risk")],
    ["birth", "생일 축하", "생일 7일 전", "brand", "(광고) 생일 쿠폰 · 카카오 가입 때 생일 제공에 동의한 회원", (L) => L.filter((pf) => { if (!pf.m.birth) return false; const y = Number(todayStr().slice(0, 4)); let d = Date.parse(y + "-" + pf.m.birth + "T00:00:00"); if (d < Date.parse(todayStr() + "T00:00:00")) d = Date.parse(y + 1 + "-" + pf.m.birth + "T00:00:00"); return d - Date.parse(todayStr() + "T00:00:00") <= 7 * DAY; })],
    ["reconsent", "소식 받기 동의 2년 확인 (법정 의무)", "동의 2년 되기 30일 전", "alim", "동의한 날 · 내용 · 철회 방법 안내 (정보통신망법)", (L) => L.filter((pf) => pf.reDue)]
  ];
  function pageCrmMsg() {
    const tab = ui.crmMt || "camp", all = crmAll(), camps = CRM().camps.slice().sort((a, b) => b.at - a.at), A = CRM().auto;
    const tabs = '<div class="a-tabs crm-tabs">' + [["camp", "캠페인", camps.length], ["auto", "자동 메시지", CRM_AUTO.filter((x) => A[x[0]]).length + "/" + CRM_AUTO.length], ["rule", "채널 · 발송 규칙", ""]].map((t) => '<button type="button" class="a-tab' + (tab === t[0] ? " on" : "") + '" data-action="crm-mt" data-k="' + t[0] + '">' + t[1] + (t[2] !== "" ? ' <span class="num">' + t[2] + "</span>" : "") + "</button>").join("") + "</div>";
    let body;
    if (tab === "auto") {
      body = '<div class="crm-autos">' + CRM_AUTO.map((x) => { const tg = x[5](all), r = crmReach(tg, x[3], Date.parse(todayStr() + "T10:00:00")), on = !!A[x[0]]; return '<div class="crm-auto' + (on ? " on" : "") + '"><button type="button" class="a-switch' + (on ? " on" : "") + '" data-action="crm-auto" data-k="' + x[0] + '" role="switch" aria-checked="' + on + '" aria-label="' + esc(x[1]) + ' 켜기"><i></i></button><div class="crm-auto-t"><b>' + esc(x[1]) + "</b><small>" + esc(x[2]) + " · " + esc(CRM_CH[x[3]][0]) + (CRM_CH[x[3]][1] ? " · 광고" : " · 정보성") + "</small><p>" + esc(x[4]) + '</p></div><div class="crm-auto-n"><b class="num">' + r.ok.length + "명</b><small>오늘 보낼 대상" + (tg.length !== r.ok.length ? " (" + (tg.length - r.ok.length) + "명은 미동의로 빠짐)" : "") + "</small>" + (tg.length ? btn("대상 보기", "crm-auto-who", "a-btn-text a-btn-sm", ' data-k="' + x[0] + '"') : "") + "</div></div>"; }).join("") + "</div>" +
        '<p class="a-muted p-small crm-foot">' + icon("alert", "xs") + " 자동 메시지는 아직 켜 둔 기록만 남아요. ‘채널 · 발송 규칙’에서 채널을 연결하고 알림톡 템플릿 승인이 끝나면, 정해진 때에 서버가 보내도록 이어서 연결해요.</p>";
    } else if (tab === "rule") {
      const cfg = crmCfg(), S2 = crmSendCfg(), srv = !!(DB.remote && DB.remote.on), order = ["sms", "alim", "brand", "email"];
      body = '<div class="crm-link-h"><b>발송 채널 연결</b><span class="a-muted">' + (!srv ? "지금은 서버가 없는 시안 화면이라 기록만 남아요." : !cfg ? "연결 상태를 불러오는 중…" : "가입 → 키를 Vercel 환경 변수에 넣고 다시 배포하면 ‘연결됨’으로 바뀌고 캠페인이 실제로 나가요.") + '</span></div><div class="crm-links">' +
        order.map((k, i) => { const L = CRM_LINK[k], live = crmLive(k); return '<div class="crm-link' + (live ? " on" : "") + '"><div class="crm-link-t"><span class="crm-link-n">' + (i + 1) + "</span><b>" + esc(CRM_CH[k][0]) + "</b>" + pill(live ? "연결됨 · 실제 발송" : "연결 전 · 기록만", live ? "ok" : "") + '</div><small class="a-muted">' + esc(L[0]) + (k === "sms" && cfg && cfg.sender ? " · 발신번호 " + esc(cfg.sender) : "") + (k === "email" && cfg && cfg.from ? " · " + esc(cfg.from) : "") + '</small><ol class="crm-link-s">' + L[2].map((s) => "<li>" + esc(s[0]) + (s[1] ? " <code>" + esc(s[1]) + "</code>" : "") + "</li>").join("") + '</ol><a class="crm-link-go" href="' + L[1] + '" target="_blank" rel="noopener">' + esc(L[0].split(" + ")[0]) + " 열기 " + icon("arrowUpRight", "xs") + "</a></div>"; }).join("") + "</div>" +
        '<form class="crm-sendf" id="crm-sendf" novalidate><div class="a-form-row"><div class="a-field"><label for="crm-s-080">080 무료 수신거부 번호 <small>(광고 문자에 꼭 필요)</small></label><input class="a-input" id="crm-s-080" name="optout" maxlength="14" placeholder="080-000-0000" value="' + esc(S2.optout) + '"></div><div class="a-field"><label for="crm-s-tg">브랜드 메시지 보낼 대상</label><select class="a-input" id="crm-s-tg" name="targeting">' + [["I", "I · 카카오톡 채널 친구 (기본)"], ["M", "M · 솔라피 안내의 M 대상"], ["N", "N · 솔라피 안내의 N 대상"]].map((x) => '<option value="' + x[0] + '"' + (S2.targeting === x[0] ? " selected" : "") + ">" + x[1] + "</option>").join("") + "</select></div></div>" +
          '<div class="a-field"><label>알림톡 템플릿 <small>(카카오가 승인한 것만 · 내용은 승인된 글 그대로 · 이름 자리는 #{이름})</small></label><div class="crm-tpls">' + (S2.tpls.length ? S2.tpls.map((t, i) => '<div class="crm-tpl"><div><b>' + esc(t.name) + "</b> <code>" + esc(t.id) + "</code><p>" + esc(t.text) + "</p></div>" + btn(icon("trash", "sm"), "crm-tpl-del", "a-icon-btn sm", ' data-i="' + i + '" aria-label="템플릿 지우기"') + "</div>").join("") : '<p class="a-muted p-small">아직 등록한 템플릿이 없어요.</p>') + "</div>" +
          '<div class="crm-tpl-add"><input class="a-input a-sm" name="tName" maxlength="30" placeholder="이름 (예: 결제 완료 안내)"><input class="a-input a-sm" name="tId" maxlength="80" placeholder="템플릿 ID (솔라피 › 알림톡 템플릿)"><textarea class="a-input a-sm" name="tText" rows="2" maxlength="1000" placeholder="승인된 템플릿 내용 그대로 (예: #{이름}님, 결제가 완료됐어요…)"></textarea>' + btn(icon("plus", "sm") + "템플릿 추가", "crm-tpl-add", "a-btn-outline a-btn-sm") + "</div></div>" +
          btn(icon("check", "sm") + "발송 설정 저장", "crm-send-save", "a-btn-dark a-btn-sm") + "</form>" +
        '<div class="crm-rulecards">' + Object.keys(CRM_CH).map((k) => '<div class="crm-rulecard"><b>' + esc(CRM_CH[k][0]) + "</b>" + pill(CRM_CH[k][1] ? "광고 가능" : "정보성만", CRM_CH[k][1] ? "warn" : "info") + "<p>" + esc(CRM_CH[k][2]) + "</p></div>").join("") + "</div>" +
        '<ul class="crm-law">' + [["광고는 동의한 회원에게만", "소식 받기(광고성 정보)에 동의하고, 그 채널(문자 · 이메일 · 카카오톡)을 고른 회원에게만 보내요. 동의 안 한 회원은 자동으로 빠져요."], ["(광고) 표기 · 무료 수신거부", "광고 메시지는 맨 앞에 (광고)를 붙이고, 끝에 수신 거부 방법을 자동으로 넣어요."], ["야간 광고 제한", "카카오 브랜드 메시지는 08:00~20:50에만 보낼 수 있어요. 문자는 밤 9시~아침 8시에 야간 수신 동의한 회원에게만 가요."], ["동의 2년마다 다시 확인", "동의한 날부터 2년마다 동의 여부를 알려야 해요. ‘동의 재확인 필요’ 세그먼트와 자동 메시지로 챙겨요."], ["알림톡은 정보성만", "결제 · 수강 · 일정처럼 회원이 꼭 알아야 할 내용만 보내요. 2026년부터 회사가 준 쿠폰 · 적립금 사용을 권하는 알림톡은 막혀서 쿠폰 소식은 브랜드 메시지로 보내요."], ["개인정보 열람 · 내려받기 기록", "회원 DB에서 개인정보를 보거나 내려받으면 누가 · 언제 · 왜 봤는지 남겨요. 기록은 1년 이상 보관해요."]].map((x) => "<li>" + icon("shieldCheck", "sm") + "<div><b>" + x[0] + "</b><p>" + x[1] + "</p></div></li>").join("") + "</ul>";
    } else {
      body = '<div class="crm-camp-top">' + btn(icon("plus", "sm") + "새 캠페인", "crm-camp-new", "a-btn-primary", ' data-seg="sub"') + '<p class="a-muted">세그먼트를 골라 한 번에 보내요. 7일 안 구매는 받은 회원의 실제 결제로 계산해요.</p></div>' +
        (camps.length ? '<div class="a-table-wrap"><table class="a-table crm-camps"><thead><tr><th>보낸 날</th><th>캠페인</th><th>채널</th><th>대상</th><th class="right">보냄 · 빠짐</th><th class="right">7일 안 구매</th></tr></thead><tbody>' + camps.map((c) => { const cv = crmConv(c), n = (c.to || []).length; return '<tr><td class="vda-nw">' + esc(crmStamp(c.at)) + (c.at > Date.now() ? '<small class="a-memo">' + pill("예약", "warn") + "</small>" : "") + "</td><td><b>" + esc(c.name) + "</b>" + (c.real ? " " + pill("실제 발송" + (c.failed ? " · 실패 " + c.failed : ""), c.failed ? "warn" : "ok") : "") + '<small class="a-memo">' + esc(String(c.text || "").slice(0, 60)) + (c.coupon ? " · 쿠폰 " + esc(((VD().coupons || []).find((x) => x.id === c.coupon) || {}).name || "") : "") + '</small></td><td class="vda-nw">' + esc((CRM_CH[c.ch] || [c.ch])[0]) + (c.ad ? '<small class="a-memo">광고</small>' : '<small class="a-memo">정보성</small>') + '</td><td class="vda-nw">' + esc(c.segName || crmChipName(c.seg)) + '</td><td class="right num">' + n + "명 · " + (c.skip || 0) + '명</td><td class="right num">' + (cv ? "<b>" + cv.n + "명</b> " + (n ? "(" + Math.round(cv.n / n * 100) + "%)" : "") + '<small class="a-memo">' + won(cv.amt) + "</small>" : "-") + "</td></tr>"; }).join("") + "</tbody></table></div>" : emptyBox("send", "아직 보낸 캠페인이 없어요."));
    }
    return head("메시지 · 자동화", "세그먼트에 카카오 알림톡 · 브랜드 메시지 · 문자 · 이메일을 보내고, 가입 · 찜 · 결제 · 만료 같은 때에 자동으로 나가는 메시지를 켜고 꺼요. 동의 · 야간 · (광고) 표기 규칙은 자동으로 지켜요.", "") + crmNav("vod-msg") + '<section class="a-card crm-card">' + tabs + body + "</section>";
  }
  function crmCampModal(seg, one) {
    const segs = CRM_CHIPS().filter((c) => c[0] !== "all").concat([["all", "전체 회원"]]), cps = (VD().coupons || []).filter((c) => c.on !== false);
    const pre = seg === "sel" ? [["sel", "선택한 회원 " + crmSelIds().length + "명"]] : seg === "one" ? [["one", (vdMember(one) || {}).name + " 님 한 명"]] : [];
    openModal("새 캠페인 보내기", '<form id="crm-camp" class="a-form crm-campf" data-one="' + esc(one || "") + '" novalidate>' +
      '<div class="a-field"><label for="crm-c-name">캠페인 이름</label><input class="a-input" id="crm-c-name" name="name" maxlength="40" placeholder="예) 11월 열성팬 감사 쿠폰" value=""></div>' +
      '<div class="a-form-row"><div class="a-field"><label for="crm-c-seg">보낼 대상</label><select class="a-input" id="crm-c-seg" name="seg">' + pre.concat(segs).map((s) => '<option value="' + esc(s[0]) + '"' + (s[0] === seg ? " selected" : "") + ">" + esc(s[1]) + "</option>").join("") + '</select></div><div class="a-field"><label for="crm-c-ch">채널</label><select class="a-input" id="crm-c-ch" name="ch">' + Object.keys(CRM_CH).map((k) => '<option value="' + k + '"' + (k === "brand" ? " selected" : "") + ">" + esc(CRM_CH[k][0]) + (CRM_CH[k][1] ? " (광고 가능)" : " (정보성만)") + "</option>").join("") + "</select></div></div>" +
      '<div class="a-form-row crm-c-extra"><div class="a-field" data-crm-only="alim"><label for="crm-c-tpl">알림톡 템플릿</label><select class="a-input" id="crm-c-tpl" name="tpl"><option value="">템플릿 고르기</option>' + crmSendCfg().tpls.map((t, i) => '<option value="' + i + '">' + esc(t.name) + "</option>").join("") + '</select></div><div class="a-field" data-crm-only="email"><label for="crm-c-subj">메일 제목</label><input class="a-input" id="crm-c-subj" name="subject" maxlength="80" placeholder="예) {이름}님만을 위한 1만 원 쿠폰"></div></div>' +
      '<div class="a-field"><label for="crm-c-text">내용 <small>({이름}은 받는 사람 이름으로 바뀌어요)</small></label><textarea class="a-input" id="crm-c-text" name="text" rows="3" maxlength="400">{이름}님, 이번 주만 쓰는 1만 원 할인 쿠폰을 넣어 드렸어요. 마이페이지 › 쿠폰에서 확인해 보세요.</textarea></div>' +
      '<div class="a-form-row"><div class="a-field"><label for="crm-c-cp">쿠폰 함께 넣기 <small>(광고 채널만)</small></label><select class="a-input" id="crm-c-cp" name="coupon"><option value="">넣지 않아요</option>' + cps.map((c) => '<option value="' + esc(c.id) + '">' + esc(c.name) + "</option>").join("") + '</select></div><div class="a-field"><label for="crm-c-at">보낼 때</label><select class="a-input" id="crm-c-when" name="when"><option value="now">지금 바로</option><option value="later">예약</option></select><input class="a-input" id="crm-c-at" name="at" type="datetime-local" hidden></div></div>' +
      '<div id="crm-c-prev" class="crm-c-prev"></div></form>', btn("취소", "modal-close") + btn(icon("send", "sm") + "보내기", "crm-camp-send", "a-btn-primary"), "lg");
    crmCampPaint();
  }
  function crmCampVals() {
    const f = document.getElementById("crm-camp"); if (!f) return null;
    const ch = f.ch.value, seg = f.seg.value, later = f.when.value === "later", at = later && f.at.value ? Date.parse(f.at.value) : Date.now();
    const tg = crmTarget(seg, f.dataset.one), r = crmReach(tg, ch, at);
    const tpl = ch === "alim" && f.tpl.value !== "" ? crmSendCfg().tpls[Number(f.tpl.value)] || null : null;
    return { f, ch, seg, later, at, tg, r, tpl, live: crmLive(ch), subject: ch === "email" ? f.subject.value.trim() : "", ad: !!(CRM_CH[ch] || [])[1], coupon: (CRM_CH[ch] || [])[1] ? f.coupon.value : "", name: f.name.value.trim(), text: tpl ? tpl.text : f.text.value.trim() };
  }
  function crmCampPaint() {
    const c = crmCampVals(), box = document.getElementById("crm-c-prev"); if (!c || !box) return;
    c.f.at.hidden = !c.later; c.f.coupon.disabled = !c.ad; if (!c.ad) c.f.coupon.value = "";
    c.f.querySelectorAll("[data-crm-only]").forEach((el) => { el.hidden = el.dataset.crmOnly !== c.ch; });
    if (c.tpl) { c.f.text.value = c.tpl.text; c.f.text.readOnly = true; } else if (c.f.text.readOnly) { c.f.text.readOnly = false; }
    const sk = Object.keys(c.r.skip), first = c.r.ok[0];
    box.innerHTML = '<div class="crm-c-n"><b class="num">' + c.r.ok.length + "명</b>에게 보내요" + (c.tg.length !== c.r.ok.length ? " · 대상 " + c.tg.length + "명 중 " + (c.tg.length - c.r.ok.length) + "명 빠짐" : "") + "</div>" +
      (sk.length ? '<ul class="crm-c-skip">' + sk.map((k) => "<li>" + esc(k) + " <b>" + c.r.skip[k] + "명</b></li>").join("") + "</ul>" : "") +
      (c.r.blocked ? '<p class="crm-c-warn">' + icon("alert", "xs") + " 카카오 브랜드 메시지는 밤 8시 50분 ~ 아침 8시에는 보낼 수 없어요. ‘예약’으로 아침 8시 이후를 골라 주세요.</p>" : "") +
      (c.ch === "alim" ? '<p class="crm-c-note">' + icon("alert", "xs") + " 알림톡은 정보성 안내만 보낼 수 있어요. 할인 · 쿠폰 소식은 브랜드 메시지나 문자로 보내 주세요.</p>" : "") +
      '<div class="crm-c-bubble"><small>' + esc(CRM_CH[c.ch][0]) + " 미리보기</small><p>" + esc(crmMsgTxt(c.text, c.ch, first ? first.m.name : "회원")).replace(/\n/g, "<br>") + "</p></div>" +
      (c.live ? '<p class="crm-c-live">' + icon("send", "xs") + " 실제로 보내요 — " + (c.ch === "email" ? "Resend" : "솔라피") + "로 나가고, 동의 · 야간 · 연락처는 서버가 한 번 더 확인해요." + (c.ch === "alim" && !c.tpl ? " 알림톡은 승인된 템플릿을 골라 주세요." : "") + "</p>" : '<p class="a-muted p-small">' + (DB.remote && DB.remote.on ? "이 채널은 아직 연결 전이라 실제로 보내지는 않고, 보낸 기록 · 쿠폰 지급만 남아요. 연결은 ‘채널 · 발송 규칙’ 탭에서 확인해요." : "시안이라 실제로 보내지는 않고, 보낸 기록 · 쿠폰 지급만 남아요.") + "</p>");
  }
  function crmCampSend() {
    const c = crmCampVals(); if (!c) return;
    if (!c.name) { toast("캠페인 이름을 적어 주세요.", "warn"); return; }
    if (c.text.length < 5) { toast("보낼 내용을 5자 이상 적어 주세요.", "warn"); return; }
    if (c.later && (!c.f.at.value || c.at < Date.now())) { toast("예약 시간을 지금 이후로 골라 주세요.", "warn"); return; }
    if (c.r.blocked) { toast("밤 8시 50분 ~ 아침 8시에는 브랜드 메시지를 보낼 수 없어요. 예약으로 골라 주세요.", "warn"); return; }
    if (!c.r.ok.length) { toast("보낼 수 있는 회원이 없어요. 대상이나 채널을 바꿔 주세요.", "warn"); return; }
    if (c.live && c.ch === "alim" && !c.tpl) { toast("알림톡은 카카오가 승인한 템플릿을 골라야 보낼 수 있어요.", "warn"); return; }
    if (c.live && c.ch === "email" && !c.subject) { toast("메일 제목을 적어 주세요.", "warn"); return; }
    if (!c.live) return crmRecord(c, c.r.ok.map((pf) => pf.m.id), null);
    const b = document.querySelector('[data-action="crm-camp-send"]'); if (b) b.disabled = true;
    DB.remote.call("admin", { action: "msg-send", ch: c.ch, mids: c.r.ok.map((pf) => pf.m.id), text: c.text, subject: c.subject, templateId: c.tpl ? c.tpl.id : "", at: c.later ? c.at : 0 })
      .then((r) => { if (!r || !r.ok) { if (b) b.disabled = false; toast((r && r.message) || "보내지 못했어요. 잠시 후 다시 시도해 주세요.", "warn"); return; } crmRecord(c, r.to || [], r); })
      .catch(() => { if (b) b.disabled = false; toast("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.", "warn"); });
  }
  /** 캠페인 기록 · 쿠폰 지급 (r: 서버 실제 발송 결과 · 없으면 시안 기록) */
  function crmRecord(c, toIds, r) {
    const cp = c.coupon && (VD().coupons || []).find((x) => x.id === c.coupon), who = whoAmI(), id = DB.uid("cm");
    let given = 0;
    if (cp && !c.later) toIds.forEach((mid) => { if (VX().issueCoupon(mid, cp)) given++; });
    CRM().camps.push({ id, name: c.name, ch: c.ch, ad: c.ad, seg: c.seg, segName: c.seg === "sel" ? "선택한 회원" : c.seg === "one" ? (c.r.ok[0] || c.tg[0] || { m: {} }).m.name + " 님" : crmChipName(c.seg), text: c.subject ? "[" + c.subject + "] " + crmMsgTxt(c.text, c.ch, "{이름}") : crmMsgTxt(c.text, c.ch, "{이름}"), coupon: cp ? cp.id : "", at: c.at, by: who, to: toIds, skip: c.tg.length - toIds.length, real: !!r, sent: r ? r.sent : undefined, failed: r ? r.failed : undefined });
    if (!c.later) toIds.forEach((mid) => CRM().msgs.push({ at: c.at, mid, ch: c.ch, name: c.name, camp: id }));
    if (CRM().msgs.length > 3000) CRM().msgs.splice(0, CRM().msgs.length - 3000);
    ui.crmMt = "camp";
    commit("‘" + c.name + "’ " + (c.later ? (r ? r.sent + "명에게 예약했어요" : "예약했어요") : "캠페인을 " + (r ? r.sent : toIds.length) + "명에게 보냈어요") + (r && r.failed ? " · 실패 " + r.failed + "명" : "") + (given ? " · 쿠폰 " + given + "장 지급" : "") + (r ? "." : ". (시안 · 실제 발송 없음)"));
    if (ROUTE.hash.indexOf("vod-msg") < 0 && !/vod-crm\//.test(ROUTE.hash)) ROUTE.hash = "#/center/master/vod-msg";
  }

  /* ---------- 5) 회원 분석 ---------- */
  function pageCrmReport() {
    const all = crmAll(), act = all.filter((pf) => !pf.m.blocked), buyers = act.filter((pf) => pf.paid.length), rep = buyers.filter((pf) => pf.paid.length >= 2);
    const ttf = buyers.filter((pf) => pf.firstPay).map((pf) => Math.max(0, Math.round((pf.firstPay - pf.m.createdAt) / DAY))), avgT = ttf.length ? Math.round(ttf.reduce((a, b) => a + b, 0) / ttf.length) : 0;
    const kp = (l, val, sub) => '<div class="a-kpi"><span>' + l + "</span><b>" + val + "</b><small>" + sub + "</small></div>";
    // 주별 가입 (최근 8주) — 이메일 · 카카오 쌓은 막대
    const t0 = Date.parse(todayStr() + "T00:00:00"), wk = [];
    for (let i = 7; i >= 0; i--) { const e = t0 - i * 7 * DAY + DAY, s = e - 7 * DAY, ms = all.filter((pf) => pf.m.createdAt >= s && pf.m.createdAt < e); wk.push({ s, e, k: ms.filter((pf) => pf.m.via === "kakao").length, m: ms.filter((pf) => pf.m.via !== "kakao").length }); }
    const max = Math.max(1, ...wk.map((w) => w.k + w.m)), lbl = (w) => { const d = new Date(w.s); return d.getMonth() + 1 + "/" + d.getDate(); };
    const chart = '<div class="crm-ch" role="img" aria-label="최근 8주 주별 가입 수 (이메일 · 카카오)">' + wk.map((w) => { const tot = w.k + w.m; return '<div class="crm-ch-col" tabindex="0" data-tip="' + esc(lbl(w) + " 주 · 가입 " + tot + "명 (카카오 " + w.k + " · 이메일 " + w.m + ")") + '"><span class="crm-ch-v num">' + (tot || "") + '</span><div class="crm-ch-bar" style="height:' + Math.round(tot / max * 100) + '%">' + (w.k ? '<i class="k" style="flex:' + w.k + '"></i>' : "") + (w.m ? '<i class="e" style="flex:' + w.m + '"></i>' : "") + '</div><small>' + lbl(w) + "</small></div>"; }).join("") + "</div>" +
      '<div class="crm-legend"><span><i class="k"></i>카카오 가입</span><span><i class="e"></i>이메일 가입</span></div>' +
      '<details class="crm-tbl"><summary>표로 보기</summary><table class="a-table"><thead><tr><th>주 시작</th><th class="right">카카오</th><th class="right">이메일</th><th class="right">합계</th></tr></thead><tbody>' + wk.map((w) => "<tr><td>" + crmDate(w.s) + '</td><td class="right num">' + w.k + '</td><td class="right num">' + w.m + '</td><td class="right num">' + (w.k + w.m) + "</td></tr>").join("") + "</tbody></table></details>";
    const hbar = (rows, tot) => '<ul class="crm-hb">' + rows.map((r) => '<li><span class="crm-hb-l">' + esc(r[0]) + '</span><span class="crm-hb-t"><i style="width:' + (tot ? Math.max(r[1] ? 2 : 0, Math.round(r[1] / tot * 100)) : 0) + '%"></i></span><span class="crm-hb-v num"><b>' + r[1] + "명</b>" + (r[2] != null ? " · " + r[2] : "") + "</span></li>").join("") + "</ul>";
    const tried = act.filter((pf) => pf.paid.length || pf.free.length).length, fans = act.filter((pf) => pf.stage === "fan").length;
    const funnel = hbar([["가입", act.length, "100%"], ["신청 · 결제 1번 이상", tried, Math.round(tried / Math.max(1, act.length) * 100) + "%"], ["첫 결제", buyers.length, Math.round(buyers.length / Math.max(1, act.length) * 100) + "%"], ["재구매", rep.length, Math.round(rep.length / Math.max(1, act.length) * 100) + "%"], ["열성팬", fans, Math.round(fans / Math.max(1, act.length) * 100) + "%"]], act.length);
    const stages = hbar(CRM_ORDER.map((k) => [crmStage(k)[0], all.filter((pf) => pf.stage === k).length, null]), all.length);
    const srcs = {}; all.forEach((pf) => { const k = crmSrcK(pf.m); srcs[k] = srcs[k] || { n: 0, b: 0, amt: 0 }; srcs[k].n++; if (pf.paid.length) srcs[k].b++; srcs[k].amt += pf.ltv; });
    const srcRows = Object.keys(srcs).sort((a, b) => srcs[b].n - srcs[a].n);
    const maxS = Math.max(1, ...srcRows.map((k) => srcs[k].n));
    return head("회원 분석", "가입 · 첫 구매 · 재구매 흐름과 어디서 들어온 회원이 잘 사는지 봐요. 모든 숫자는 지금 회원 DB에서 바로 계산해요.", "") + crmNav("vod-crm-rp") +
      '<div class="a-kpis crm-kpis crm-kpis-4">' + kp("가입 → 첫 구매", Math.round(buyers.length / Math.max(1, act.length) * 100) + "%", "결제한 회원 " + buyers.length + "명 / " + act.length + "명") + kp("재구매율", Math.round(rep.length / Math.max(1, buyers.length) * 100) + "%", "결제 회원 중 2번 이상 " + rep.length + "명") + kp("결제 회원 평균 LTV", won(buyers.length ? Math.round(buyers.reduce((a, pf) => a + pf.ltv, 0) / buyers.length) : 0), "누적 결제 ÷ 결제 회원") + kp("첫 구매까지", avgT + "일", "가입하고 첫 결제까지 평균") + "</div>" +
      '<div class="crm-grid2"><section class="a-card crm-card"><div class="a-card-head"><h2>주별 가입</h2><p class="a-muted">최근 8주 · 막대에 올리면 숫자가 보여요</p></div>' + chart + "</section>" +
      '<section class="a-card crm-card"><div class="a-card-head"><h2>가입 → 열성팬 퍼널</h2><p class="a-muted">이용 중지 회원 빼고</p></div>' + funnel + "</section>" +
      '<section class="a-card crm-card"><div class="a-card-head"><h2>단계별 회원</h2>' + '<a class="a-link" href="#/center/master/vod-seg">기준 바꾸기</a></div>' + stages + "</section>" +
      '<section class="a-card crm-card"><div class="a-card-head"><h2>처음 들어온 경로</h2><p class="a-muted">가입할 때 링크의 utm_source · 강사 링크 기준</p></div><div class="a-table-wrap"><table class="a-table crm-src"><thead><tr><th>경로</th><th>가입</th><th class="right">결제 회원</th><th class="right">누적 결제</th></tr></thead><tbody>' + srcRows.map((k) => '<tr><td class="vda-nw">' + esc(CRM_SRC[k] || k) + '</td><td><span class="crm-hb-t sm"><i style="width:' + Math.round(srcs[k].n / maxS * 100) + '%"></i></span> <span class="num">' + srcs[k].n + '명</span></td><td class="right num">' + srcs[k].b + "명 (" + Math.round(srcs[k].b / srcs[k].n * 100) + '%)</td><td class="right num">' + won(srcs[k].amt) + "</td></tr>").join("") + "</tbody></table></div></section></div>";
  }

  /* ---------- 회원 DB 작업 ---------- */
  function crmCsv(onlySel) {
    const ids = onlySel ? crmSelIds() : null, list = onlySel ? crmAll().filter((pf) => ids.indexOf(pf.m.id) >= 0) : crmList();
    openModal("회원 목록 내려받기", '<p class="a-confirm"><b>' + list.length + "명</b>의 이름 · 이메일 · 휴대폰이 들어 있는 파일을 내려받아요. 개인정보라서 <b>왜 내려받는지</b> 남겨야 해요.</p>" +
      '<div class="a-field"><label for="crm-dl-why">내려받는 이유</label><select class="a-input" id="crm-dl-why"><option>마케팅 메시지 발송 (동의 회원)</option><option>고객 응대 · 상담</option><option>정산 · 회계 확인</option><option>기타</option></select></div><div class="a-field"><label for="crm-dl-memo">자세한 내용 <small>(선택)</small></label><input class="a-input" id="crm-dl-memo" maxlength="60" placeholder="예) 11월 열성팬 감사 이벤트 발송"></div>' +
      '<p class="a-muted p-small">파일은 쓰고 나서 바로 지워 주세요. 내려받은 기록은 회원 DB 아래 ‘개인정보 열람 · 내려받기 기록’에 남아요.</p>', btn("취소", "modal-close") + btn(icon("download", "sm") + "사유 남기고 내려받기", "crm-csv-ok", "a-btn-primary", onlySel ? ' data-sel="1"' : ""));
  }
  function crmBulkModal(kind, one) {
    const n = one ? 1 : crmSelIds().length, oa = one ? ' data-one="' + esc(one) + '"' : "", cps = (VD().coupons || []).filter((c) => c.on !== false).sort((x, y) => (x.auto === "signup") - (y.auto === "signup"));
    if (kind === "cp") openModal("쿠폰 한 번에 지급", '<p class="a-confirm">' + (one ? esc((vdMember(one) || {}).name || "") + " 님" : "선택한 <b>" + n + "명</b>") + '에게 쿠폰을 넣어요. 이미 받은 회원은 건너뛰어요.</p><div class="a-field"><label for="crm-bk-cp">쿠폰</label><select class="a-input" id="crm-bk-cp">' + cps.map((c) => '<option value="' + esc(c.id) + '">' + esc(c.name) + "</option>").join("") + "</select></div>", btn("취소", "modal-close") + btn("쿠폰 지급", "crm-bk-ok", "a-btn-primary", ' data-k="cp"' + oa));
    else if (kind === "pt") openModal("포인트 한 번에 지급", '<p class="a-confirm">선택한 <b>' + n + '명</b>에게 같은 포인트를 넣어요.</p><div class="a-form-row"><div class="a-field"><label for="crm-bk-pt">포인트</label><input class="a-input" id="crm-bk-pt" type="number" step="100" min="100" value="1000"></div><div class="a-field"><label for="crm-bk-why">사유 <small>(회원에게 보여요)</small></label><input class="a-input" id="crm-bk-why" maxlength="40" value="감사 포인트"></div></div>', btn("취소", "modal-close") + btn("포인트 지급", "crm-bk-ok", "a-btn-primary", ' data-k="pt"'));
    else openModal("태그 한 번에 붙이기", '<p class="a-confirm">선택한 <b>' + n + '명</b>에게 태그를 붙여요.</p><div class="a-form-row"><div class="a-field"><label for="crm-bk-tag">있는 태그</label><select class="a-input" id="crm-bk-tag"><option value="">고르기</option>' + CRM().tags.map((t) => '<option value="' + esc(t) + '">' + esc(t) + '</option>').join("") + '</select></div><div class="a-field"><label for="crm-bk-tagn">새 태그</label><input class="a-input" id="crm-bk-tagn" maxlength="12" placeholder="12자까지"></div></div>', btn("취소", "modal-close") + btn("태그 붙이기", "crm-bk-ok", "a-btn-primary", ' data-k="tag"'));
  }
  function crmTagPut(m, t) { t = String(t || "").trim().slice(0, 12); if (!t) return false; if (CRM().tags.indexOf(t) < 0) CRM().tags.push(t); m.tags = Array.isArray(m.tags) ? m.tags : []; if (m.tags.indexOf(t) >= 0) return false; m.tags.push(t); return true; }
  const crmView = (what) => { CRM().views.unshift({ at: Date.now(), who: whoAmI(), what }); if (CRM().views.length > 500) CRM().views.length = 500; actLog("회원 개인정보 열람 · " + what); };
  document.addEventListener("click", (e) => {
    if (!isActive()) return;
    const a = e.target.closest("[data-action^='crm-']"); if (!a || a.disabled) return;
    const d = a.dataset, v = VD();
    if (d.action === "crm-open") { if (e.target.closest("[data-stop]")) return; ROUTE.hash = "#/center/master/vod-crm/" + encodeURIComponent(d.id); return; }
    if (staffDeny("master/vod-crm")) return;
    const M = () => vdMember(d.id);
    switch (d.action) {
      case "crm-seg": crmF().seg = d.k; ui.crmN = 50; render(); break;
      case "crm-via": crmF().via = d.k || ""; ui.crmN = 50; render(); break;
      case "crm-seg-go": crmF().seg = d.k; ui.crmN = 50; ROUTE.hash = "#/center/master/vod-crm"; break;
      case "crm-reset": ui.crmF = null; ui.crmN = 50; render(); break;
      case "crm-more": ui.crmN = (ui.crmN || 50) + 50; render(); break;
      case "crm-sel-clear": ui.crmSel = {}; render(); break;
      case "crm-pii": ui.crmPii = !ui.crmPii; if (ui.crmPii) { crmView(d.id ? (M() || {}).name + " 님 상세" : "회원 목록"); DB.save(); } render(); toast(ui.crmPii ? "개인정보를 보여 줘요. 본 기록이 남아요." : "개인정보를 다시 가렸어요."); break;
      case "crm-csv": crmCsv(d.sel === "1"); break;
      case "crm-csv-ok": {
        const ids = d.sel === "1" ? crmSelIds() : null, list = ids ? crmAll().filter((pf) => ids.indexOf(pf.m.id) >= 0) : crmList(), why = ((document.getElementById("crm-dl-why") || {}).value || "") + (((document.getElementById("crm-dl-memo") || {}).value || "").trim() ? " · " + document.getElementById("crm-dl-memo").value.trim() : "");
        vdCsvDl("doogoclass-members", [["회원번호", "이름", "이메일", "휴대폰", "가입 방식", "가입일", "처음 들어온 경로", "단계", "결제 횟수", "누적 결제", "마지막 활동", "쓸 수 있는 쿠폰", "포인트", "소식 받기", "받을 곳", "동의한 날", "카카오톡 채널", "태그"]].concat(list.map((pf) => { const m = pf.m; return [m.id, m.name, m.email || "", m.phone || "", m.via === "kakao" ? "카카오" : "이메일", crmDate(m.createdAt), crmSrc(m), crmStage(pf.stage)[0], pf.paid.length, pf.ltv, crmDate(pf.last), pf.cpOk.length, Number(m.points) || 0, pf.sub ? "동의" : "안 함", CH3n(crmChs(m)), pf.sub ? crmDate((m.consent || {}).at) : "", m.kakaoCh ? "친구" : "", (m.tags || []).join(" / ")]; })));
        CRM().dl.unshift({ at: Date.now(), who: whoAmI(), n: list.length, why }); commit("회원 " + list.length + "명 목록을 내려받았어요. (사유: " + why + ")"); break;
      }
      case "crm-b-cp": crmBulkModal("cp"); break;
      case "crm-b-pt": crmBulkModal("pt"); break;
      case "crm-b-tag": crmBulkModal("tag"); break;
      case "crm-bk-ok": {
        const ms = (d.one ? [d.one] : crmSelIds()).map(vdMember).filter(Boolean); if (!ms.length) { closeModal(); break; }
        if (d.k === "cp") { const c = (v.coupons || []).find((x) => x.id === (document.getElementById("crm-bk-cp") || {}).value); if (!c) break; let n = 0; ms.forEach((m) => { if (VX().issueCoupon(m.id, c)) n++; }); commit("‘" + c.name + "’ 쿠폰을 " + n + "명에게 넣었어요." + (ms.length - n ? " (" + (ms.length - n) + "명은 이미 받음)" : "")); }
        else if (d.k === "pt") { const amt = Math.round(Number((document.getElementById("crm-bk-pt") || {}).value) || 0), why = ((document.getElementById("crm-bk-why") || {}).value || "").trim(); if (amt <= 0) { toast("넣을 포인트를 적어 주세요.", "warn"); break; } if (!why) { toast("사유를 적어 주세요.", "warn"); break; } ms.forEach((m) => VX().addPoint(m, amt, why + " (운영자)")); commit(ms.length + "명에게 " + amt.toLocaleString() + "P를 넣었어요."); }
        else { const t = ((document.getElementById("crm-bk-tagn") || {}).value || "").trim() || (document.getElementById("crm-bk-tag") || {}).value; if (!t) { toast("태그를 고르거나 새로 적어 주세요.", "warn"); break; } let n = 0; ms.forEach((m) => { if (crmTagPut(m, t)) n++; }); commit("‘" + t + "’ 태그를 " + n + "명에게 붙였어요."); }
        break;
      }
      case "crm-1-cp": { const m = M(); if (m) crmBulkModal("cp", m.id); break; }
      case "crm-1-pt": { const m = M(); if (!m) break; openModal(m.name + " 님 포인트 조정", '<div class="a-form-row"><div class="a-field"><label for="crm-pt-amt">더하거나 뺄 포인트</label><input class="a-input" id="crm-pt-amt" type="number" step="100" placeholder="예) 1000 또는 -500"></div><div class="a-field"><label for="crm-pt-why">사유 <small>(회원에게 보여요)</small></label><input class="a-input" id="crm-pt-why" maxlength="40"></div></div><p class="a-muted p-small">지금 ' + (Number(m.points) || 0).toLocaleString() + "P</p>", btn("취소", "modal-close") + btn("포인트 조정", "crm-pt-ok", "a-btn-primary", ' data-id="' + esc(m.id) + '"')); break; }
      case "crm-pt-ok": { const m = M(), amt = Math.round(Number((document.getElementById("crm-pt-amt") || {}).value) || 0), why = ((document.getElementById("crm-pt-why") || {}).value || "").trim(); if (!m) break; if (!amt) { toast("더하거나 뺄 포인트를 적어 주세요. (빼려면 -500처럼)", "warn"); break; } if (!why) { toast("사유를 적어 주세요.", "warn"); break; } if ((Number(m.points) || 0) + amt < 0) { toast("포인트가 0보다 작아질 수 없어요.", "warn"); break; } VX().addPoint(m, amt, why + " (운영자)"); commit(m.name + " 님 포인트 " + (amt > 0 ? "+" : "") + amt.toLocaleString() + "P"); break; }
      case "crm-cp-del": { const list = (v.memberCoupons || {})[d.id] || [], i = list.findIndex((x) => x.id === d.mc); if (i < 0) break; list.splice(i, 1); commit("쿠폰을 회수했어요."); break; }
      case "crm-block": { const m = M(); if (!m) break; confirmModal(m.blocked ? "이용 중지 풀기" : "이용 중지", esc(m.name) + " 님을 " + (m.blocked ? "다시 이용할 수 있게 할까요?" : "이용 중지할까요? 로그인할 수 없고, 메시지 · 자동 메시지 대상에서도 빠져요."), m.blocked ? "풀기" : "이용 중지", !m.blocked, () => { m.blocked = !m.blocked; commit(m.name + " 님을 " + (m.blocked ? "이용 중지했어요." : "다시 이용할 수 있게 했어요.")); }); break; }
      case "crm-tag-add": { const m = M(); if (!m) break; const t = ((document.getElementById("crm-tag-new") || {}).value || "").trim() || (document.getElementById("crm-tag-pick") || {}).value; if (!t) { toast("태그를 고르거나 새로 적어 주세요.", "warn"); break; } if (!crmTagPut(m, t)) { toast("이미 붙은 태그예요.", "warn"); break; } commit("‘" + t + "’ 태그를 붙였어요."); break; }
      case "crm-tag-del": { const m = M(); if (!m) break; m.tags = (m.tags || []).filter((t) => t !== d.t); commit("‘" + d.t + "’ 태그를 뺐어요."); break; }
      case "crm-note-add": { const m = M(), t = ((document.getElementById("crm-note") || {}).value || "").trim(); if (!m) break; if (t.length < 2) { toast("메모를 2자 이상 적어 주세요.", "warn"); break; } (m.notes = m.notes || []).push({ id: DB.uid("nt"), at: Date.now(), by: whoAmI(), text: t.slice(0, 300) }); commit("상담 메모를 남겼어요."); break; }
      case "crm-note-del": { const m = M(); if (!m) break; confirmModal("메모 지우기", "이 메모를 지울까요?", "지우기", true, () => { m.notes = (m.notes || []).filter((x) => x.id !== d.n); commit("메모를 지웠어요."); }); break; }
      case "crm-camp-new": crmCampModal(d.seg || "sub", d.id || ""); break;
      case "crm-camp-send": crmCampSend(); break;
      case "crm-send-save": { const f = document.getElementById("crm-sendf"), S2 = crmSendCfg(), o = f.optout.value.trim(); if (o && !/^080-?\d{3,4}-?\d{4}$/.test(o)) { toast("080 수신거부 번호는 080-000-0000 모양으로 적어 주세요.", "warn"); break; } S2.optout = o; S2.targeting = f.targeting.value; commit("메시지 발송 설정을 저장했어요."); break; }
      case "crm-tpl-add": { const f = document.getElementById("crm-sendf"), n = f.tName.value.trim(), tid = f.tId.value.trim(), tx = f.tText.value.trim(); if (!n || !tid || tx.length < 5) { toast("템플릿 이름 · ID · 내용을 모두 적어 주세요.", "warn"); break; } crmSendCfg().tpls.push({ id: tid, name: n, text: tx }); commit("알림톡 템플릿 ‘" + n + "’을 추가했어요."); break; }
      case "crm-tpl-del": { const S2 = crmSendCfg(), t = S2.tpls[Number(d.i)]; if (!t) break; S2.tpls.splice(Number(d.i), 1); commit("알림톡 템플릿 ‘" + t.name + "’을 지웠어요."); break; }
      case "crm-mt": ui.crmMt = d.k; render(); break;
      case "crm-auto": { const A = CRM().auto, x = CRM_AUTO.find((y) => y[0] === d.k); A[d.k] = !A[d.k]; commit("‘" + (x ? x[1] : d.k) + "’ 자동 메시지를 " + (A[d.k] ? "켰어요." : "껐어요.")); break; }
      case "crm-auto-who": { const x = CRM_AUTO.find((y) => y[0] === d.k); if (!x) break; const tg = x[5](crmAll()), r = crmReach(tg, x[3], Date.parse(todayStr() + "T10:00:00")), okIds = r.ok.map((pf) => pf.m.id); openModal(x[1] + " · 오늘 대상", '<ul class="crm-mini">' + tg.map((pf) => '<li><b><a class="a-link" href="#/center/master/vod-crm/' + esc(pf.m.id) + '">' + esc(pf.m.name) + "</a> " + pill(crmStage(pf.stage)[0], crmStage(pf.stage)[1]) + "</b><small>" + (okIds.indexOf(pf.m.id) >= 0 ? "보낼 수 있어요" : "빠짐 · 소식 받기 미동의") + "</small></li>").join("") + "</ul>", btn("닫기", "modal-close")); break; }
      case "crm-b-add": crmBsync(); ui.crmB.rules.push(["paid", "gte", "1"]); render(); break;
      case "crm-b-del": crmBsync(); ui.crmB.rules.splice(Number(d.i), 1); render(); break;
      case "crm-b-save": { crmBsync(); const B = ui.crmB; if (!B.name.trim()) { toast("세그먼트 이름을 적어 주세요.", "warn"); break; } CRM().segs.push({ id: DB.uid("sg"), name: B.name.trim().slice(0, 30), rules: B.rules.map((r) => r.slice()), at: Date.now() }); ui.crmB = null; commit("‘" + B.name.trim() + "’ 세그먼트를 저장했어요. 회원 DB 칩에도 생겼어요."); break; }
      case "crm-seg-del": { const s = CRM().segs.find((x) => x.id === d.id); if (!s) break; confirmModal("세그먼트 지우기", "‘" + esc(s.name) + "’ 세그먼트를 지울까요? 회원 정보는 그대로예요.", "지우기", true, () => { CRM().segs = CRM().segs.filter((x) => x.id !== d.id); if (crmF().seg === "sg:" + d.id) crmF().seg = "all"; commit("세그먼트를 지웠어요."); }); break; }
      case "crm-rules-save": { const f = document.getElementById("crm-rules"); if (!f) break; const R = CRM().rules, nx = {}; let bad = false; ["fanN", "fanAmt", "fanDays", "riskDays", "sleepDays", "newDays"].forEach((k) => { const n = Math.round(Number(f[k].value)); if (!(n >= 1)) bad = true; nx[k] = n; }); if (bad) { toast("기준은 1 이상의 숫자로 적어 주세요.", "warn"); break; } if (nx.riskDays >= nx.sleepDays) { toast("이탈 위험 일수는 휴면 일수보다 작아야 해요.", "warn"); break; } Object.assign(R, nx); commit("단계 기준을 저장했어요. 모든 화면에 바로 반영돼요."); break; }
    }
  });
  function crmBsync() { const B = (ui.crmB = ui.crmB || { name: "", rules: [] }), nm = document.getElementById("crm-b-name"); if (nm) B.name = nm.value; document.querySelectorAll("[data-crm-b]").forEach((el) => { const i = Number(el.dataset.i), r = B.rules[i]; if (!r) return; if (el.dataset.crmB === "f") r[0] = el.value; else if (el.dataset.crmB === "op") r[1] = el.value; else r[2] = el.value; }); }
  document.addEventListener("change", (e) => {
    if (!isActive()) return;
    const t = e.target;
    if (t.matches("[data-crm-f]")) { crmF()[t.dataset.crmF] = t.value; ui.crmN = 50; render(); return; }
    if (t.matches("[data-crm-sel]")) { ui.crmSel = ui.crmSel || {}; ui.crmSel[t.dataset.crmSel] = t.checked; render(); return; }
    if (t.matches("[data-crm-all]")) { ui.crmSel = ui.crmSel || {}; crmList().slice(0, ui.crmN || 50).forEach((pf) => { ui.crmSel[pf.m.id] = t.checked; }); render(); return; }
    if (t.matches("[data-crm-b]")) { crmBsync(); const B = ui.crmB, i = Number(t.dataset.i); if (t.dataset.crmB === "f" && B.rules[i]) { const fd = crmFld(B.rules[i][0]); B.rules[i][1] = fd[2] === "num" ? "gte" : "is"; B.rules[i][2] = fd[2] === "num" ? "1" : (crmOpts(B.rules[i][0])[0] || [""])[0]; } render(); return; }
    if (t.closest && t.closest("#crm-camp")) crmCampPaint();
  });
  let crmT = null;
  document.addEventListener("input", (e) => {
    if (!isActive()) return;
    const t = e.target;
    if (t.id === "crm-q") { clearTimeout(crmT); crmT = setTimeout(() => { crmF().q = t.value; ui.crmN = 50; render(); const n = document.getElementById("crm-q"); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); return; }
    if (t.matches && t.matches('[data-crm-b="val"]')) { crmBsync(); clearTimeout(crmT); crmT = setTimeout(() => { const n = document.querySelector(".crm-prev-n b"); if (n) n.textContent = crmAll().filter((pf) => ui.crmB.rules.every((r) => crmTest(pf, r))).length + "명"; }, 200); return; }
    if (t.closest && t.closest("#crm-camp")) crmCampPaint();
  });

  /* ---------- v19: 환불 · 취소 관리 ----------
   * 환불 규정(마스터가 숫자로 정함) → 스토어 · 상세 · 결제 · FAQ 문구와 회원 ‘바로 취소’ 판단이 같은 값을 써요.
   * 정식 서버 + 포트원이 연결되면 회원 바로 취소 · 마스터 환불이 카드 결제를 자동으로 취소해요 (지금 시안은 기록만). */
  const RF_KIND = { instant: ["회원 바로 취소", "ok"], partial: ["부분 환불", "warn"], master: ["마스터 환불", "info"] };
  const rfKindOf = (o) => (o.refundKind ? o.refundKind : o.refundAmount != null && o.refundAmount < o.amount ? "partial" : "master");
  const rfPg = (o) => (o.refundPay ? (o.refundPay.st === "done" ? pill("계좌 송금 완료", "ok") : pill("계좌 송금 대기", "warn")) : o.method === "bank" ? pill("계좌 환불 · 기록만", "mute") : !o.pg ? pill("수동 처리", "mute") : o.pg.st === "done" || (o.pg.cancel && o.pg.cancel.id) ? pill(o.method === "vbank" ? "가상계좌 환불 완료" : "포트원 취소 완료", "ok") : o.pg.st === "fail" ? pill("포트원 취소 실패", "bad") : pill("시안 · 실제 취소 없음", "mute"));
  /* ---------- 종이책 주문 · 배송 관리 ----------
   * 입금 대기(무통장) → 신규 주문(결제 완료) → 배송 준비(발주 확인) → 배송 중(택배사 + 송장) → 배송 완료(직접 누르거나, 보낸 뒤 정한 날이 지나면 자동)
   * 취소 · 반품 · 교환: 회원 요청 → 승인(수거 중) → 환불(반품 · 취소) 또는 교환 상품 발송 · 반려 (교보문고처럼 책이 돌아와 확인한 뒤 환불)
   * 엑셀: 주문 목록 · 택배 접수용(.xlsx) 내려받기 → 택배사에서 받은 송장 파일(.xlsx · .csv)을 올리면 주문번호로 맞춰 한 번에 발송 처리
   * 바꾼 상태 · 송장은 회원 마이페이지 › 종이책 · 배송 조회에 바로 보여요 (정식 서버는 주문 문서로 동기화) */
  const vdShipAll = () => VD().orders.filter((o) => o.ship && o.status !== "failed");
  const boClaimOn = (o) => { const c = VX().claimOf(o); return !!c && o.status === "paid" && (c.st === "req" || c.st === "pick"); };
  const vdShipTodo = () => VD().orders.filter((o) => o.ship && (o.status === "pending" || boClaimOn(o) || (o.status === "paid" && ["ready", "prep"].indexOf(VX().shipStOf(o)) >= 0))).length;
  const BO_ST = { wait: ["입금 대기", "warn"], ready: ["신규 주문", "bad"], prep: ["배송 준비", "info"], ship: ["배송 중", "info"], done: ["배송 완료", "ok"], cancel: ["취소", "mute"] };
  const vsTone = (st) => (BO_ST[st] || ["", ""])[1];
  const BO_TABS = [["wait", "입금 대기"], ["ready", "신규 주문"], ["prep", "배송 준비"], ["ship", "배송 중"], ["done", "배송 완료"], ["claim", "취소 · 반품 · 교환"], ["all", "전체"]];
  const boIn = (k, o) => { const X = VX(), st = X.shipStOf(o); return k === "all" || (k === "claim" ? !!X.claimOf(o) || st === "cancel" : st === k); };
  const boTab = () => { if (ui.vsTab && BO_TABS.some((x) => x[0] === ui.vsTab)) return ui.vsTab; const all = vdShipAll(); return ["ready", "prep", "wait"].find((k) => all.some((o) => boIn(k, o))) || (all.some(boClaimOn) ? "claim" : "ready"); };
  const boPickable = (k) => ["wait", "ready", "prep", "ship"].indexOf(k) >= 0;
  const vsCarrierSel = (o, attr, cur) => { const X = VX(); cur = cur || (o.ship && o.ship.carrier) || X.shipSet().carrier; return '<select class="a-input a-sm" ' + (attr || 'data-ship-car="' + esc(o.id) + '"') + ' aria-label="택배사">' + X.CARRIERS.map((c) => "<option" + (c[0] === cur ? " selected" : "") + ">" + c[0] + "</option>").join("") + "</select>"; };
  const vsInvOk = (x) => /^[0-9A-Za-z-]{6,20}$/.test(String(x || "").trim());
  const boInv = (x) => String(x == null ? "" : x).replace(/\.0+$/, "").replace(/[\s-]/g, "");
  const boWhen = (t) => (t ? (DB.date.fmtStamp ? DB.date.fmtStamp(t) : DB.date.toStr(new Date(t))) : "");
  const boPayTxt = (o) => (o.method === "bank" ? "무통장" : o.method === "vbank" ? "가상계좌" : VD_PAY[o.method] || o.method || "");
  const boCash = (o) => (o.cashRcpt && o.cashRcpt.no ? (o.cashRcpt.type === "b" ? "지출증빙 " : "소득공제 ") + o.cashRcpt.no + (o.cashRcpt.done ? " · 발급 완료" : "") : "");
  /** 송장 입력 칸 (택배사 · 송장 번호 · 버튼) */
  const boSend = (o, label, act) => '<div class="bo-send">' + vsCarrierSel(o) + '<input class="a-input a-sm num" data-ship-inv="' + esc(o.id) + '" value="' + esc(ui.vsEdit === o.id ? o.ship.inv || "" : "") + '" placeholder="송장 번호" inputmode="numeric" maxlength="24" aria-label="송장 번호">' + btn(icon("truck", "sm") + label, act || "vda-ship-send", "a-btn-primary a-btn-sm", ' data-id="' + esc(o.id) + '"') + "</div>";
  /** 취소 · 반품 · 교환 상자: 요청 내용 · 환불 예정 · 회수 송장 · 처리 버튼 */
  function boClaimBox(o, c) {
    const X = VX(), fee = X.claimFee(o, c), st = c.st, k = c.k, tone = st === "req" ? "req" : st === "pick" ? "pick" : st === "no" ? "no" : "end";
    const acct = c.acct ? vdAcctTxt(c.acct) : "", ra = X.shipSet().returnAddr;
    const acts = st === "req" ? (k === "cancel" ? btn(icon("coins", "sm") + "취소 승인 · 환불", "bo-cl-refund", "a-btn-primary a-btn-sm", ' data-id="' + esc(o.id) + '"') : btn(icon("check", "sm") + (k === "exchange" ? "교환 승인 · 수거 요청" : "반품 승인 · 수거 요청"), "bo-cl-ok", "a-btn-primary a-btn-sm", ' data-id="' + esc(o.id) + '"') + (k === "return" ? btn("수거 없이 바로 환불", "bo-cl-refund", "a-btn-ghost a-btn-sm", ' data-id="' + esc(o.id) + '"') : "")) + btn("반려", "bo-cl-no", "a-btn-ghost a-btn-sm", ' data-id="' + esc(o.id) + '"')
      : st === "pick" ? (k === "exchange" ? boSend(o, "교환 상품 보내기", "bo-cl-xsend") : btn(icon("coins", "sm") + "책이 도착했어요 · 환불", "bo-cl-refund", "a-btn-primary a-btn-sm", ' data-id="' + esc(o.id) + '"')) : "";
    return '<div class="bo-claim bo-claim-' + tone + '"><p class="bo-claim-h">' + icon(st === "req" ? "alert" : st === "pick" ? "truck" : st === "no" ? "x" : "check", "xs") + "<b>" + esc(X.claimTxt(c)) + "</b><small>" + esc(boWhen(c.at)) + "</small></p>" +
      '<p class="bo-claim-t">사유 · ' + esc(c.why || "기타") + (c.text ? " — " + esc(c.text) : "") + "</p>" +
      (k !== "exchange" && (st === "req" || st === "pick") ? '<p class="bo-claim-t">환불 예정 <b>' + won(Math.max(0, o.amount - fee)) + "</b>" + (fee ? " (결제 " + won(o.amount) + " − 단순 변심 왕복 배송비 " + won(fee) + ")" : " (전액)") + (acct ? " · 환불 계좌 " + esc(acct) : "") + "</p>" : "") +
      (st === "pick" ? '<p class="bo-claim-t">' + (c.rinv ? "회수 송장 " + esc(c.rcar || "") + ' <b class="num">' + esc(c.rinv) + "</b> · " : "") + "택배사에 반품(회수) 접수를 하면 기사님이 회원 주소에서 책을 가져와요" + (ra ? " → " + esc(ra) : "") + '.</p><div class="bo-send bo-rinv">' + vsCarrierSel(o, 'data-cl-car="' + esc(o.id) + '"', c.rcar) + '<input class="a-input a-sm num" data-cl-inv="' + esc(o.id) + '" value="' + esc(c.rinv || "") + '" placeholder="회수 송장 번호 (선택)" maxlength="24" aria-label="회수 송장 번호">' + btn("회수 송장 저장", "bo-cl-rinv", "a-btn-ghost a-btn-sm", ' data-id="' + esc(o.id) + '"') + "</div>" : "") +
      (st === "no" ? '<p class="bo-claim-t">반려 사유 · ' + esc(c.note || "") + "</p>" : "") +
      (st === "done" && k === "exchange" ? '<p class="bo-claim-t">' + esc(boWhen(c.xAt)) + " 교환 상품을 보냈어요 (아래 송장)" + (c.oinv ? " · 처음 송장 " + esc(c.oinv) : "") + "</p>" : "") +
      (st === "refunded" ? '<p class="bo-claim-t">' + won(o.refundAmount != null ? o.refundAmount : o.amount) + " 환불 · " + esc(boWhen(o.refundedAt)) + "</p>" : "") +
      (acts ? '<div class="bo-claim-a">' + acts + "</div>" : "") + "</div>";
  }
  function boCard(o, tab, pick) {
    const X = VX(), s = o.ship, st = X.shipStOf(o), lab = st === "cancel" && o.status === "refunded" ? ["환불", "mute"] : BO_ST[st] || BO_ST.ready, c = X.claimOf(o), tu = X.trackUrl(o), edit = ui.vsEdit === o.id, sh = X.shipSet();
    const nm = (vdMember(o.mid) || {}).name || (o.buyer && o.buyer.name) || "회원", hold = !!c && c.st === "req", late = st === "wait" && Date.now() > vdDue(o);
    const sel = boPickable(tab) && st === tab ? '<label class="a-check bo-pick"><input type="checkbox" data-action="vda-ship-pick" data-id="' + esc(o.id) + '"' + (pick.has(o.id) ? " checked" : "") + '><span class="sr-only">선택</span></label>' : "";
    const act = st === "wait" ? (o.method === "vbank" ? pill("가상계좌 · 입금하면 자동 확인", "info") : btn(icon("check", "sm") + "입금 확인", "vda-paid", "a-btn-primary a-btn-sm", ' data-id="' + esc(o.id) + '"')) + btn("주문 취소", "vda-cancel", "a-btn-ghost a-btn-sm", ' data-id="' + esc(o.id) + '"')
      : st === "ready" ? (hold ? "" : btn(icon("package", "sm") + "배송 준비로", "vda-ship-prep", "a-btn-ghost a-btn-sm", ' data-id="' + esc(o.id) + '"') + boSend(o, "발송 처리"))
      : st === "prep" ? (hold ? "" : boSend(o, "발송 처리"))
      : st === "ship" ? (edit ? boSend(o, "송장 저장") + btn("닫기", "vda-ship-edit", "a-btn-ghost a-btn-sm") : '<span class="bo-trk">' + icon("truck", "sm") + esc(s.carrier || "") + ' <b class="num">' + esc(s.inv || "") + "</b>" + (tu ? ' <a class="a-link" href="' + esc(tu) + '" target="_blank" rel="noopener">배송 조회</a>' : "") + "<small>" + esc(DB.date.toStr(new Date(s.shipAt))) + " 보냄 · " + esc(DB.date.toStr(new Date(s.shipAt + (Number(sh.autoDays) || 3) * 864e5))) + " 자동 완료</small></span>" + btn("송장 수정", "vda-ship-edit", "a-btn-ghost a-btn-sm", ' data-id="' + esc(o.id) + '"') + btn(icon("check", "sm") + "배송 완료", "vda-ship-done", "a-btn-ghost a-btn-sm", ' data-id="' + esc(o.id) + '"'))
      : st === "done" ? '<span class="bo-trk">' + icon("check", "sm") + esc(DB.date.toStr(new Date(X.shipDoneAt(o)))) + " 배송 완료" + (s.doneAt ? "" : " (자동)") + (s.inv ? " · " + esc(s.carrier || "") + ' <b class="num">' + esc(s.inv) + "</b>" + (tu ? ' <a class="a-link" href="' + esc(tu) + '" target="_blank" rel="noopener">배송 조회</a>' : "") : "") + "</span>"
      : c ? (o.refundPay && o.refundPay.st === "wait" ? '<span class="bo-trk">' + icon("coins", "sm") + '계좌 송금 대기 · <a class="a-link" href="#/center/master/vod-refund">환불 · 취소 관리에서 송금 완료</a></span>' : "")
      : '<span class="bo-trk">' + icon("x", "sm") + (o.status === "refunded" ? won(o.refundAmount != null ? o.refundAmount : o.amount) + " 환불 · " + esc(DB.date.toStr(new Date(o.refundedAt || o.at))) + (o.refundPay && o.refundPay.st === "wait" ? " · 계좌 송금 대기" : "") : (o.canceledBy === "기한 지남" ? "입금 기한이 지나 취소" : "취소된 주문") + " · " + esc(DB.date.toStr(new Date(o.canceledAt || o.at)))) + "</span>";
    return '<article class="bo-card bo-' + st + (pick.has(o.id) ? " on" : "") + '">' + sel +
      '<div class="bo-b"><div class="bo-meta">' + pill(lab[0], lab[1]) + (c ? pill(X.claimTxt(c), c.st === "req" ? "bad" : c.st === "pick" ? "warn" : "mute") : "") + (late ? pill("입금 기한 지남", "warn") : "") + '<small>' + esc(boWhen(st === "wait" ? o.at : o.paidAt || o.at)) + ' · <a class="a-link num" href="#" data-action="vda-od" data-id="' + esc(o.id) + '">' + esc(o.no) + "</a></small></div>" +
        '<p class="bo-t"><b>' + esc(o.title) + "</b><em>" + (Number(o.qty) || 1) + "권</em></p>" +
        '<p class="bo-sum">' + won(o.amount) + (o.shipFee ? " · 배송비 " + won(o.shipFee) + " 포함" : " · 무료배송") + " · " + esc(boPayTxt(o)) + " · 주문 " + esc(nm) + "</p>" +
        (st === "wait" && o.method !== "vbank" ? '<p class="bo-dep">' + icon("coins", "xs") + "<span>입금자명 <b>" + esc(vdDep(o)) + "</b> · <b>" + won(vdGrpAmt(o)) + "</b> · " + esc(boWhen(vdDue(o))) + "까지</span></p>" : "") +
        '<dl class="bo-addr"><div><dt>받는 분</dt><dd><b>' + esc(s.name || "") + "</b> · " + esc(s.phone || "") + "</dd></div><div><dt>주소</dt><dd>" + (s.zip ? "(" + esc(s.zip) + ") " : "") + esc((s.addr1 || "") + " " + (s.addr2 || "")) + ' <button type="button" class="a-link bo-copy" data-action="vda-ship-copy" data-id="' + esc(o.id) + '">복사</button></dd></div>' + (s.memo ? "<div><dt>요청</dt><dd>" + esc(s.memo) + "</dd></div>" : "") + (boCash(o) ? "<div><dt>현금영수증</dt><dd>" + esc(boCash(o)) + (o.cashRcpt.done ? "" : ' <button type="button" class="a-link" data-action="bo-cash-done" data-id="' + esc(o.id) + '">발급 완료로 표시</button>') + "</dd></div>" : "") + "</dl>" +
        (c ? boClaimBox(o, c) : "") +
        (act ? '<div class="bo-act">' + act + "</div>" : "") + "</div></article>";
  }
  function pageVodShip() {
    const X = VX(), sh = X.shipSet(), all = vdShipAll(), tab = boTab(), pick = ui.vsPick || (ui.vsPick = new Set()), today = todayStr(), ym = today.slice(0, 7);
    const by = (k) => all.filter((o) => boIn(k, o)), cntOf = (k) => (k === "claim" ? all.filter(boClaimOn).length : by(k).length);
    const asc = ["wait", "ready", "prep"].indexOf(tab) >= 0, list = by(tab).sort((a, b) => (tab === "claim" ? (boClaimOn(b) ? 1 : 0) - (boClaimOn(a) ? 1 : 0) : 0) || (asc ? 1 : -1) * ((a.paidAt || a.at || 0) - (b.paidAt || b.at || 0)));
    const wait = by("wait"), late = wait.filter((o) => Date.now() > vdDue(o)), sendN = by("ready").length + by("prep").length, sentToday = all.filter((o) => o.ship.shipAt && DB.date.toStr(new Date(o.ship.shipAt)) === today).length, doneMon = all.filter((o) => X.shipStOf(o) === "done" && X.shipDoneAt(o) && vdYM(X.shipDoneAt(o)) === ym).length;
    const picked = list.filter((o) => pick.has(o.id)), selAll = boPickable(tab) && list.length ? btn(picked.length && picked.length === list.length ? "선택 풀기" : "모두 선택", "vda-ship-all", "a-btn-ghost a-btn-sm") : "";
    const bulk = tab === "wait" ? btn(icon("check", "sm") + "선택 입금 확인", "bo-bpaid", "a-btn-ghost a-btn-sm", picked.length ? "" : " disabled") + (late.length ? btn(icon("x", "sm") + "기한 지난 " + late.length + "건 취소", "vda-cancel-exp", "a-btn-ghost a-btn-sm") : "")
      : tab === "ready" ? btn(icon("package", "sm") + "선택 배송 준비로", "vda-ship-bprep", "a-btn-ghost a-btn-sm", picked.length ? "" : " disabled")
      : tab === "ship" ? btn(icon("check", "sm") + "선택 배송 완료", "bo-bdone", "a-btn-ghost a-btn-sm", picked.length ? "" : " disabled") : "";
    const n = picked.length ? " (" + picked.length + "건)" : "";
    return head("종이책 주문 · 배송", "입금 대기 → 신규 주문 → 배송 준비 → 배송 중 → 배송 완료 순서로 처리해요. 송장을 넣으면 회원 마이페이지에 배송 조회가 열리고, 보낸 날부터 " + (Number(sh.autoDays) || 3) + "일이 지나면 자동으로 배송 완료가 돼요.", vdStoreBtn("#/vod/my/ship", "회원 화면 보기")) +
      '<div class="a-kpis crm-kpis crm-kpis-4">' +
        kpi("입금 대기", wait.length + "건", wait.length ? won(wait.reduce((a, o) => a + vdGrpAmt(o), 0)) + (late.length ? " · 기한 지남 " + late.length + "건" : " · 통장 입금을 확인해 주세요") : "기다리는 입금이 없어요", "#/center/master/vod-ship", wait.length ? "warn" : "") +
        kpi("보낼 주문", sendN + "건", sendN ? "결제 후 " + (Number(sh.outDays) || 2) + "일 안에 보내요 · 오늘 보냄 " + sentToday + "건" : "모두 보냈어요 · 오늘 보냄 " + sentToday + "건", "#/center/master/vod-ship", sendN ? "warn" : "ok") +
        kpi("배송 중", by("ship").length + "건", (Number(sh.autoDays) || 3) + "일 뒤 자동 완료 · 이번 달 완료 " + doneMon + "건", "#/center/master/vod-ship") +
        kpi("취소 · 반품 · 교환", cntOf("claim") + "건", cntOf("claim") ? "처리할 요청이 있어요" : "처리할 요청 없음", "#/center/master/vod-ship", cntOf("claim") ? "warn" : "") +
      "</div>" +
      '<section class="a-card crm-card bo-box"><div class="bo-tabs" role="tablist">' + BO_TABS.map((x, i) => (i === 5 ? '<span class="bo-tab-gap" aria-hidden="true"></span>' : "") + '<button type="button" role="tab" aria-selected="' + (x[0] === tab) + '" class="' + (x[0] === tab ? "on" : "") + (x[0] === "claim" && cntOf("claim") ? " hot" : "") + '" data-action="vda-ship-tab" data-k="' + x[0] + '">' + (i < 5 ? "<i>" + (i + 1) + "</i>" : "") + "<span>" + x[1] + "</span><small>" + cntOf(x[0]) + "</small></button>").join("") + "</div>" +
        '<div class="bo-tools"><div class="bo-tools-l">' + selAll + bulk + "</div>" +
          '<div class="bo-tools-r">' + btn(icon("download", "sm") + "주문 엑셀" + n, "bo-xl-orders", "a-btn-ghost a-btn-sm", list.length ? "" : " disabled") +
            (tab === "ready" || tab === "prep" ? btn(icon("download", "sm") + "택배 접수용 엑셀" + n, "vda-ship-csv", "a-btn-ghost a-btn-sm", list.length ? "" : " disabled") : "") +
            btn(icon("upload", "sm") + "송장 엑셀 올리기", "vda-ship-bulk", "a-btn-outline a-btn-sm", sendN ? "" : " disabled") + "</div></div>" +
        (tab === "wait" ? '<p class="bo-hint">' + icon("alert", "xs") + "<span>통장에 들어온 <b>입금자명 · 금액</b>을 확인하고 <b>입금 확인</b>을 눌러요. 확인하면 ‘신규 주문’으로 넘어가요." + (X.bankAuto && X.bankAuto() ? " 자동 입금 확인(페이액션)이 켜져 있어서 이름 · 금액이 맞으면 저절로 넘어가요." : " 자동 입금 확인(페이액션)을 연결하면 24시간 저절로 넘어가요.") + "</span></p>" : tab === "ready" ? '<p class="bo-hint">' + icon("alert", "xs") + "<span><b>택배 접수용 엑셀</b>을 내려받아 택배사에 올리고, 받은 송장 파일을 <b>송장 엑셀 올리기</b>로 넣으면 한 번에 ‘배송 중’이 돼요. 한 건씩 보낼 때는 카드에 송장을 적어요.</span></p>" : "") +
        (list.length ? '<div class="bo-list">' + list.map((o) => boCard(o, tab, pick)).join("") + "</div>" : '<div class="bo-empty">' + emptyBox("truck", tab === "wait" ? "입금을 기다리는 주문이 없어요." : tab === "ready" ? "새로 들어온 주문이 없어요." : tab === "claim" ? "취소 · 반품 · 교환 요청이 없어요." : "이 상태의 주문이 없어요.") + "</div>") + "</section>" +
      '<section class="a-card crm-card"><div class="a-card-head"><h2>배송 · 반품 설정</h2><p class="a-muted">상세 페이지 · 결제 화면 · 교환 · 반품 규정 문구에 함께 쓰여요.</p></div>' +
        '<form id="vda-ship-form" class="a-form vs-set" novalidate><div class="a-form-row">' +
          '<div class="a-field"><label for="vs-auto">자동 배송 완료</label><span class="crm-unit"><input class="a-input" id="vs-auto" name="autoDays" type="number" min="1" max="14" value="' + esc(sh.autoDays) + '"><em>일 뒤 (송장 넣은 날부터)</em></span></div>' +
          '<div class="a-field"><label for="vs-out">출고 기간</label><span class="crm-unit"><input class="a-input" id="vs-out" name="outDays" type="number" min="1" max="14" value="' + esc(sh.outDays) + '"><em>일 안 (주말 · 공휴일 빼고)</em></span></div></div>' +
          '<div class="a-form-row"><div class="a-field"><label for="vs-car">기본 택배사</label><select class="a-input" id="vs-car" name="carrier">' + X.CARRIERS.map((c) => "<option" + (c[0] === sh.carrier ? " selected" : "") + ">" + c[0] + "</option>").join("") + "</select></div>" +
          '<div class="a-field"><label for="vs-rf">반품 왕복 배송비</label><span class="crm-unit"><input class="a-input" id="vs-rf" name="returnFee" type="number" min="0" step="500" value="' + esc(sh.returnFee) + '"><em>원 (단순 변심 반품 · 환불금에서 빼요)</em></span></div></div>' +
          '<div class="a-field"><label for="vs-ra">반품 받을 주소</label><input class="a-input" id="vs-ra" name="returnAddr" maxlength="120" value="' + esc(sh.returnAddr || "") + '" placeholder="예) 세종특별자치시 갈매로 353 5층 두고홀딩스 (비우면 안내 문구에서 빠져요)"></div>' +
          '<div class="vs-set-foot">' + btn(icon("check", "sm") + "설정 저장", "vda-ship-save", "a-btn-primary") + "</div></form></section>";
  }
  /* ---------- 엑셀(.xlsx) 쓰기 · 읽기 — 라이브러리 없이: 쓰기는 압축 없는 zip, 읽기는 브라우저 압축 해제(DecompressionStream) ---------- */
  const XL = (() => {
    const enc = new TextEncoder(), CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
    const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const xe = (s) => String(s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
    const colName = (i) => { let s = ""; i++; while (i) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
    function zip(files) {
      const parts = [], cent = []; let off = 0;
      files.forEach((f) => {
        const name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data), h = new DataView(new ArrayBuffer(30));
        h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
        parts.push(new Uint8Array(h.buffer), name, data);
        const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
        cent.push(new Uint8Array(c.buffer), name); off += 30 + name.length + data.length;
      });
      const csz = cent.reduce((a, x) => a + x.length, 0), e = new DataView(new ArrayBuffer(22));
      e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csz, true); e.setUint32(16, off, true);
      return new Blob(parts.concat(cent, [new Uint8Array(e.buffer)]), { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    }
    /** rows: [[머리글…], [값…]] · text: 글자로 둘 칸(0부터, 앞자리 0 · 긴 숫자 지키기) · widths: 칸 너비 */
    function write(sheet, rows, opt) {
      opt = opt || {}; const txt = opt.text || [], w = opt.widths || [];
      const cell = (v, r, ci) => { const ref = colName(ci) + (r + 1), s = r === 0 ? ' s="1"' : ""; if (v == null || v === "") return r === 0 ? '<c r="' + ref + '"' + s + "/>" : ""; return typeof v === "number" && isFinite(v) && txt.indexOf(ci) < 0 && r > 0 ? '<c r="' + ref + '"' + s + "><v>" + v + "</v></c>" : '<c r="' + ref + '" t="inlineStr"' + s + '><is><t xml:space="preserve">' + xe(v) + "</t></is></c>"; };
      const cols = rows[0].map((_, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (w[i] || 14) + '" customWidth="1"/>').join("");
      const sx = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' + cols + "</cols><sheetData>" + rows.map((r, ri) => '<row r="' + (ri + 1) + '">' + r.map((v, ci) => cell(v, ri, ci)).join("") + "</row>").join("") + "</sheetData></worksheet>";
      return zip([
        { name: "[Content_Types].xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
        { name: "_rels/.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
        { name: "xl/workbook.xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + xe(sheet).slice(0, 31) + '" sheetId="1" r:id="rId1"/></sheets></workbook>' },
        { name: "xl/_rels/workbook.xml.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
        { name: "xl/styles.xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F1F3"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>' },
        { name: "xl/worksheets/sheet1.xml", data: sx }
      ]);
    }
    async function inflate(u8) {
      if (typeof DecompressionStream === "undefined") throw new Error("이 브라우저는 엑셀 파일을 읽지 못해요. 크롬 · 엣지 최신 버전을 쓰거나 CSV로 저장해서 올려 주세요.");
      return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
    }
    async function unzip(buf) {
      const u = new Uint8Array(buf), dv = new DataView(buf), out = {};
      let e = -1; for (let i = u.length - 22; i >= Math.max(0, u.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
      if (e < 0) throw new Error("엑셀(.xlsx) 파일이 아니에요.");
      let p = dv.getUint32(e + 16, true); const n = dv.getUint16(e + 10, true), dec = new TextDecoder();
      for (let k = 0; k < n; k++) {
        if (dv.getUint32(p, true) !== 0x02014b50) break;
        const method = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true), name = dec.decode(u.subarray(p + 46, p + 46 + nl));
        const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), raw = u.subarray(ds, ds + csz);
        out[name] = { method, raw }; p += 46 + nl + xl + cl;
      }
      return { async text(name) { const f = out[name]; if (!f) return null; return dec.decode(f.method === 8 ? await inflate(f.raw) : f.raw); }, has: (name) => !!out[name] };
    }
    const tags = (el, tag) => Array.prototype.filter.call(el.getElementsByTagName("*"), (x) => x.localName === tag);
    const kids = (el, tag) => Array.prototype.filter.call(el.childNodes, (x) => x.localName === tag);
    async function readXlsx(buf) {
      const z = await unzip(buf), P = (t) => new DOMParser().parseFromString(t, "application/xml");
      const wb = P(await z.text("xl/workbook.xml") || ""), sh0 = tags(wb, "sheet")[0];
      if (!sh0) throw new Error("엑셀 시트를 찾지 못했어요.");
      const rid = sh0.getAttribute("r:id") || sh0.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
      const rels = P(await z.text("xl/_rels/workbook.xml.rels") || ""), rel = tags(rels, "Relationship").find((r) => r.getAttribute("Id") === rid);
      let path = rel ? rel.getAttribute("Target") : "worksheets/sheet1.xml"; path = path.charAt(0) === "/" ? path.slice(1) : "xl/" + path.replace(/^\.\//, "");
      const ss = z.has("xl/sharedStrings.xml") ? tags(P(await z.text("xl/sharedStrings.xml")), "si").map((si) => kids(si, "t").concat(...kids(si, "r").map((r) => kids(r, "t"))).map((t) => t.textContent).join("")) : [];
      const ws = P(await z.text(path) || ""), rows = [];
      tags(ws, "row").forEach((row) => {
        const ri = Number(row.getAttribute("r")) - 1, r = [];
        kids(row, "c").forEach((c, j) => {
          const ref = c.getAttribute("r") || "", m = /^([A-Z]+)/.exec(ref), ci = m ? m[1].split("").reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1 : j, t = c.getAttribute("t"), v = kids(c, "v")[0];
          r[ci] = t === "s" ? ss[Number(v && v.textContent)] || "" : t === "inlineStr" ? tags(c, "t").map((x) => x.textContent).join("") : v ? v.textContent : "";
        });
        rows[isFinite(ri) && ri >= 0 ? ri : rows.length] = Array.from(r, (x) => (x == null ? "" : String(x)));
      });
      return Array.from(rows, (r) => r || []);
    }
    function readCsv(text) {
      const rows = []; let row = [], cur = "", q = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
        else if (ch === '"') q = true; else if (ch === "," || ch === "\t") { row.push(cur); cur = ""; } else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; } else if (ch !== "\r") cur += ch;
      }
      if (cur || row.length) { row.push(cur); rows.push(row); }
      return rows;
    }
    /** 올린 파일 → 표(행 배열). .xlsx · .csv(UTF-8 또는 엑셀 한글 CSV) · .txt */
    async function read(file) {
      const buf = await file.arrayBuffer(), u = new Uint8Array(buf);
      if (u[0] === 0x50 && u[1] === 0x4b) return readXlsx(buf);
      if (u[0] === 0xd0 && u[1] === 0xcf) throw new Error("예전 엑셀(.xls) 파일이에요. 엑셀에서 ‘다른 이름으로 저장 › Excel 통합 문서(.xlsx)’로 저장해서 올려 주세요.");
      let t = new TextDecoder("utf-8").decode(buf);
      if (t.indexOf("�") >= 0) { try { t = new TextDecoder("euc-kr").decode(buf); } catch (e) { /* 그대로 */ } }
      return readCsv(t.replace(/^﻿/, ""));
    }
    function download(blob, name) { const l = document.createElement("a"); l.href = URL.createObjectURL(blob); l.download = name; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(l.href), 3e4); }
    return { write, read, download, readCsv };
  })();
  /** 주문 엑셀: 지금 탭(또는 고른 주문)의 모든 칸 */
  function boXlOrders(list) {
    const X = VX(), head = ["주문번호", "주문 일시", "결제 일시", "상태", "취소 · 반품 · 교환", "결제 수단", "입금자명", "주문자", "주문자 휴대폰", "상품", "수량", "상품 금액", "배송비", "결제 금액", "받는 분", "받는 분 휴대폰", "우편번호", "주소", "상세 주소", "배송 요청사항", "택배사", "송장번호", "보낸 날", "배송 완료", "환불 금액", "현금영수증"];
    const rows = [head].concat(list.map((o) => { const s = o.ship || {}, m = vdMember(o.mid) || {}, c = X.claimOf(o), st = X.shipStOf(o); return [o.no, boWhen(o.at), o.paidAt ? boWhen(o.paidAt) : "", (BO_ST[st] || [""])[0], c ? X.claimTxt(c) : "", boPayTxt(o), o.method === "bank" ? vdDep(o) : "", (o.buyer && o.buyer.name) || m.name || "", (o.buyer && o.buyer.phone) || m.phone || "", o.title, Number(o.qty) || 1, (Number(o.amount) || 0) - (Number(o.shipFee) || 0), Number(o.shipFee) || 0, Number(o.amount) || 0, s.name || "", s.phone || "", s.zip || "", s.addr1 || "", s.addr2 || "", s.memo || "", s.carrier || "", s.inv || "", s.shipAt ? DB.date.toStr(new Date(s.shipAt)) : "", X.shipDoneAt(o) ? DB.date.toStr(new Date(X.shipDoneAt(o))) : "", o.status === "refunded" ? (o.refundAmount != null ? o.refundAmount : o.amount) : "", boCash(o)]; }));
    XL.download(XL.write("주문", rows, { text: [0, 8, 15, 16, 21], widths: [18, 17, 17, 10, 14, 9, 10, 10, 15, 30, 6, 11, 8, 11, 10, 15, 9, 34, 18, 22, 11, 16, 11, 11, 10, 22] }), "doogoclass-book-orders-" + todayStr() + ".xlsx");
    toast("주문 " + list.length + "건을 엑셀로 내려받았어요.");
  }
  /** 택배 접수용 엑셀: 택배사 대량 접수에 그대로 올리는 칸 + 끝에 택배사 · 송장번호 빈칸 (채워서 다시 올리면 한 번에 발송 처리) */
  function vsCsv(list) {
    const X = VX(), sh = X.shipSet(), head = ["주문번호", "받는분성명", "받는분전화번호", "받는분우편번호", "받는분주소", "받는분상세주소", "품목명", "수량", "배송메세지", "택배사", "송장번호"];
    const rows = [head].concat(list.map((o) => { const s = o.ship || {}; return [o.no, s.name || "", s.phone || "", s.zip || "", s.addr1 || "", s.addr2 || "", o.title, Number(o.qty) || 1, s.memo || "", s.carrier || sh.carrier, s.inv || ""]; }));
    XL.download(XL.write("택배접수", rows, { text: [0, 2, 3, 10], widths: [18, 10, 15, 10, 36, 20, 30, 6, 24, 12, 16] }), "doogoclass-courier-" + todayStr() + ".xlsx");
    const rd = list.filter((o) => o.status === "paid" && X.shipStOf(o) === "ready" && !X.claimOf(o));
    if (rd.length) confirmModal("배송 준비로 옮길까요?", "택배 접수용 엑셀 " + list.length + "건을 내려받았어요.<br>그중 <b>신규 주문 " + rd.length + "건</b>을 ‘배송 준비’로 옮길까요? 옮기면 회원이 바로 취소하지 못하고 취소 요청으로 받아요.", "배송 준비로 옮기기", false, () => { const at = Date.now(); rd.forEach((o) => Object.assign(o.ship, { st: "prep", prepAt: at })); (ui.vsPick || new Set()).clear(); commit(rd.length + "건을 배송 준비로 옮겼어요."); });
    else toast("택배 접수용 엑셀 " + list.length + "건을 내려받았어요.");
  }
  /** 송장 올리기: 엑셀 · CSV 파일 또는 붙여 넣기 → 미리보기 → 반영 */
  function vsBulkModal() {
    const X = VX();
    ui.boUp = null;
    openModal("송장 엑셀 올리기", '<form id="vda-shipbulk-form" class="a-form bo-up" novalidate><p class="a-muted p-small">택배사에서 받은 송장 파일(.xlsx · .csv)을 올리거나, 우리가 내려받은 <b>택배 접수용 엑셀</b>의 ‘송장번호’ 칸을 채워서 올려요. <b>주문번호</b>(또는 고객주문번호)와 <b>송장번호</b>(운송장번호) 칸을 찾아 맞춰요.</p>' +
      '<label class="bo-drop"><input type="file" accept=".xlsx,.csv,.txt" data-bo-file class="sr-only">' + icon("upload", "sm") + "<b>엑셀 파일 고르기</b><small>.xlsx · .csv</small></label>" +
      '<details class="bo-paste"><summary>파일 없이 붙여 넣기</summary><textarea class="a-input num" name="lines" rows="5" placeholder="DC261030123456 640012345678&#10;DC261030654321, 640012345679"></textarea>' + btn("붙여 넣은 내용 확인", "bo-up-paste", "a-btn-ghost a-btn-sm") + "</details>" +
      '<div class="a-field"><label for="vsb-car">택배사 <small>(파일에 택배사 칸이 없을 때)</small></label><select class="a-input" id="vsb-car" name="carrier">' + X.CARRIERS.map((c) => "<option" + (c[0] === X.shipSet().carrier ? " selected" : "") + ">" + c[0] + "</option>").join("") + "</select></div>" +
      '<div id="bo-up-pre"></div><p class="a-error" id="vsb-err"></p></form>',
      '<button type="button" class="a-btn a-btn-ghost" data-action="modal-close">취소</button><button type="submit" form="vda-shipbulk-form" class="a-btn a-btn-primary" id="bo-up-go" disabled>' + icon("truck", "sm") + "발송 처리</button>", "md");
  }
  const BO_CAR = [[/cj|대한통운/i, "CJ대한통운"], [/우체국|epost/i, "우체국택배"], [/한진/, "한진택배"], [/롯데/, "롯데택배"], [/로젠/, "로젠택배"], [/경동/, "경동택배"], [/대신/, "대신택배"], [/일양/, "일양로지스"], [/쿠팡|cls/i, "쿠팡로지스틱스"]];
  const boCarOf = (x) => { x = String(x || "").trim(); if (!x) return ""; const C = VX().CARRIERS.map((c) => c[0]); if (C.indexOf(x) >= 0) return x; const m = BO_CAR.find((r) => r[0].test(x)); return m && C.indexOf(m[1]) >= 0 ? m[1] : ""; };
  /** 표 → 맞춘 결과 [{ no, inv, car, o, ok, why }] */
  function boMatch(rows, defCar) {
    const X = VX(), norm = (x) => String(x || "").replace(/\s/g, "");
    let hi = rows.findIndex((r) => (r || []).some((c) => /주문\s*번호|order/i.test(c)) && (r || []).some((c) => /송장|운송장|invoice|tracking/i.test(c)));
    let cNo = 0, cInv = 1, cCar = -1;
    if (hi >= 0) { const h = rows[hi].map(norm); cNo = h.findIndex((c) => /고객주문번호/.test(c)); if (cNo < 0) cNo = h.findIndex((c) => /주문번호|order/i.test(c)); cInv = h.findIndex((c) => /운송장번호|송장번호/.test(c)); if (cInv < 0) cInv = h.findIndex((c) => /송장|invoice|tracking/i.test(c)); cCar = h.findIndex((c) => /택배사|carrier/i.test(c)); }
    else { const r0 = rows.find((r) => (r || []).some((c) => /^DC\d{6,}/.test(String(c).trim()))); if (r0) { cNo = r0.findIndex((c) => /^DC\d{6,}/.test(String(c).trim())); cInv = r0.findIndex((c, i) => i !== cNo && /^[0-9-]{8,}$/.test(boInv(c))); } }
    const seen = {};
    return rows.slice(hi + 1).filter((r) => r && String(r[cNo] || "").trim()).map((r) => {
      const no = String(r[cNo] || "").trim(), inv = boInv(r[cInv]), car = (cCar >= 0 && boCarOf(r[cCar])) || defCar, o = VD().orders.find((x) => x.no === no && x.ship), st = o ? X.shipStOf(o) : "", c = o ? X.claimOf(o) : null;
      const why = seen[no] ? "같은 주문이 두 번 있어요" : !o ? "없는 주문번호" : !inv ? "송장번호 없음" : !vsInvOk(inv) ? "송장번호 형식 확인" : st === "ship" || st === "done" ? (o.ship.inv === inv ? "이미 보냄 (같은 송장)" : "이미 보낸 주문") : st === "wait" ? "입금 대기 주문" : st === "cancel" ? "취소된 주문" : c && c.st === "req" ? "취소 요청 처리 중" : "";
      seen[no] = 1;
      return { no, inv, car, o, ok: !why, why, name: o ? o.ship.name : String(r[1] || "") };
    });
  }
  function boUpPreview(rows) {
    const f = document.getElementById("vda-shipbulk-form"), box = document.getElementById("bo-up-pre"), go = document.getElementById("bo-up-go"), err = document.getElementById("vsb-err"); if (!f || !box) return;
    const res = boMatch(rows, f.carrier.value), ok = res.filter((x) => x.ok);
    ui.boUp = res; err.textContent = res.length ? "" : "주문번호 · 송장번호가 들어 있는 줄을 찾지 못했어요. 첫 줄에 ‘주문번호’ · ‘송장번호’ 머리글이 있는지 확인해 주세요.";
    box.innerHTML = res.length ? '<p class="bo-up-sum"><b>' + ok.length + "건 발송 처리</b> · " + (res.length - ok.length) + "건 건너뜀</p>" + '<div class="a-table-wrap bo-up-t"><table class="a-table"><thead><tr><th>주문번호</th><th>받는 분</th><th>택배사 · 송장</th><th>결과</th></tr></thead><tbody>' + res.slice(0, 200).map((x) => '<tr class="' + (x.ok ? "" : "off") + '"><td class="num">' + esc(x.no) + "</td><td>" + esc(x.name || "") + '</td><td class="num">' + esc(x.car) + " " + esc(x.inv) + "</td><td>" + (x.ok ? pill("반영", "ok") : pill(x.why, "mute")) + "</td></tr>").join("") + "</tbody></table></div>" : "";
    if (go) { go.disabled = !ok.length; go.innerHTML = icon("truck", "sm") + (ok.length ? ok.length + "건 발송 처리" : "발송 처리"); }
  }
  function saveShipBulk(f) {
    const err = document.getElementById("vsb-err"), res = (ui.boUp || []).filter((x) => x.ok);
    if (!res.length) { err.textContent = "반영할 송장이 없어요. 파일을 고르거나 붙여 넣은 내용을 확인해 주세요."; return; }
    const at = Date.now(), by = (staffMe() || {}).name || "마스터"; let n = 0;
    res.forEach((x) => { const o = VD().orders.find((y) => y.no === x.no && y.ship && y.status === "paid"); if (!o || ["ready", "prep"].indexOf(VX().shipStOf(o)) < 0) return; Object.assign(o.ship, { st: "ship", carrier: x.car, inv: x.inv, prepAt: o.ship.prepAt || at, shipAt: at, by }); n++; });
    ui.boUp = null; (ui.vsPick || new Set()).clear();
    commit("종이책 " + n + "건을 발송 처리했어요. 회원 마이페이지에 배송 조회가 열려요.");
  }
  function pageVodRefund() {
    const v = VD(), X = VX(), r = X.rfSet(), ym = todayStr().slice(0, 7), reqs = vdRefReqs().sort((a, b) => (b.refundReq.at || 0) - (a.refundReq.at || 0));
    const refd = v.orders.filter((o) => o.status === "refunded").sort((a, b) => (b.refundedAt || 0) - (a.refundedAt || 0)), mon = refd.filter((o) => o.refundedAt && vdYM(o.refundedAt) === ym);
    const paidMon = v.orders.filter((o) => (o.paidAt || 0) && vdYM(o.paidAt) === ym && o.amount > 0 && o.status !== "canceled"), elig = v.orders.filter((o) => X.instantOf(o).ok);
    const sumR = (l) => l.reduce((a, o) => a + (o.refundAmount != null ? o.refundAmount : o.amount), 0), nm = (o) => (vdMember(o.mid) || {}).name || "탈퇴 회원";
    const pgOn = !!(X.payServer && X.payServer()), wait = vdRefWait().sort((a, b) => (a.refundedAt || 0) - (b.refundedAt || 0));
    const num = (k, label, unit, min, max, help) => '<label class="rf-f"><span>' + label + '</span><span class="crm-unit"><input class="a-input a-sm" type="number" name="' + k + '" min="' + min + '" max="' + max + '" value="' + esc(r[k]) + '"><em>' + unit + "</em></span>" + (help ? "<small>" + help + "</small>" : "") + "</label>";
    const chk = (k, label, help) => '<label class="a-check rf-c"><input type="checkbox" name="' + k + '"' + (r[k] ? " checked" : "") + "><span><b>" + label + "</b>" + (help ? "<small>" + help + "</small>" : "") + "</span></label>";
    const sentence = r.instant ? "결제 후 <b>" + r.days + "일 이내</b> · " + (r.maxUsed ? "강의를 <b>" + r.maxUsed + "개 이하</b>로 들었으면" : "강의를 <b>하나도 듣지 않았으면</b>") + " 회원이 마이페이지에서 <b>바로 100% 취소</b>해요." : "회원 바로 취소를 꺼 두었어요. 모든 환불은 회원 ‘환불 요청’ → 마스터 처리로 해요.";
    return head("환불 · 취소 관리", "결제한 뒤 강의를 듣지 않았으면 회원이 직접 바로 취소(100% 환불)하고, 그 밖의 환불은 요청을 받아 처리해요. 규정 숫자를 바꾸면 스토어 상세 · 결제 · 자주 묻는 질문 문구가 함께 바뀌어요.", vdStoreBtn("#/vod/my/orders", "회원 화면 보기")) +
      '<div class="a-kpis crm-kpis crm-kpis-4">' +
        kpi("환불 요청 대기", reqs.length + "건", reqs.length ? "아래에서 처리해 주세요" : "모두 처리했어요", "#/center/master/vod-refund", reqs.length ? "warn" : "") +
        kpi("이번 달 환불", won(sumR(mon)), mon.length + "건 · 결제 " + paidMon.length + "건 중 " + (paidMon.length ? Math.round(mon.length / paidMon.length * 100) : 0) + "%", "#/center/master/vod-refund") +
        kpi("회원 바로 취소", refd.filter((o) => rfKindOf(o) === "instant").length + "건", "누적 " + won(sumR(refd.filter((o) => rfKindOf(o) === "instant"))), "#/center/master/vod-refund", "ok") +
        kpi("지금 바로 취소 가능", elig.length + "건", r.instant ? "규정에 맞는 결제 · 회원이 언제든 취소 가능" : "바로 취소 꺼짐", "#/center/master/vod-refund") +
      "</div>" +
      '<section class="a-card crm-card"><div class="a-card-head"><h2>환불 규정</h2><span class="rf-now">' + icon("shieldCheck", "sm") + "<span>" + sentence + "</span></span></div>" +
        '<form id="vda-rf-form" class="rf-form" novalidate>' +
          '<div class="rf-main"><button type="button" class="a-switch' + (r.instant ? " on" : "") + '" data-action="vda-rf-inst" role="switch" aria-checked="' + !!r.instant + '" aria-label="회원 바로 취소 켜기"><i></i></button><input type="hidden" name="instant" value="' + (r.instant ? "1" : "") + '"><div><b>회원 바로 취소 (100% 환불)</b><small>켜 두면 규정에 맞는 결제는 마이페이지 › 주문 · 결제 내역에 ‘결제 취소 · 100% 환불’ 버튼이 보이고, 누르면 바로 환불돼요. 두고클래스만의 안심 환불이에요.</small></div></div>' +
          '<div class="rf-grid"><div class="rf-col"><h3>VOD 강의</h3>' + num("days", "결제 후", "일 이내", 1, 30, "기본 7일 (전자상거래법 청약철회 기간)") + num("maxUsed", "들은 강의", "개 이하", 0, 10, "0 = 하나도 안 들었을 때만") + chk("matCounts", "자료를 내려받으면 1강 들은 것으로", "강의 자료 · 실습 파일을 받으면 쓴 것으로 봐요") + "</div>" +
            '<div class="rf-col"><h3>전자책 · LIVE · 오프라인</h3>' + num("ebookDays", "전자책: 결제 후", "일 이내 · 내려받기 전", 1, 30) + num("eventDays", "LIVE · 오프라인: 강의", "일 전까지", 0, 14) + "</div>" +
            '<div class="rf-col"><h3>함께 처리</h3>' + chk("addons", "함께 결제한 코칭권(안 쓴 것)도 같이 취소") + chk("restore", "결제에 쓴 쿠폰 · 포인트 돌려주기") + "</div></div>" +
          '<div class="rf-foot"><p class="a-muted p-small">규정 밖의 환불(강의를 들었거나 기간이 지난 경우)은 회원이 ‘환불 요청’을 남기면 아래 목록에서 들은 강의 수만큼 빼고 계산한 금액을 추천해 드려요.</p>' + btn(icon("check", "sm") + "규정 저장", "vda-rf-save", "a-btn-primary") + "</div>" +
        "</form></section>" +
      '<section class="a-card crm-card"><div class="a-card-head"><h2>환불 요청 ' + reqs.length + "건</h2><p class=\"a-muted\">회원이 사유를 남긴 요청이에요. ‘환불 처리’에서 금액을 확인하고 완료해요.</p></div>" +
        (reqs.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>요청일</th><th>회원</th><th>클래스</th><th class="right">결제</th><th>사유</th><th>수강 현황</th><th class="right">처리</th></tr></thead><tbody>' + reqs.map((o) => { const q = o.refundReq || {}, used = X.usedOf(o.mid, o.pid), dd = Math.max(1, Math.ceil((Date.now() - (o.paidAt || o.at)) / 864e5)); return '<tr><td class="vda-nw">' + esc(DB.date.toStr(new Date(q.at || o.at))) + '</td><td class="vda-nw"><a class="a-link" href="#/center/master/vod-crm/' + esc(o.mid) + '">' + esc(nm(o)) + "</a></td><td>" + esc(o.title) + '<small class="a-memo num">' + esc(o.no) + '</small></td><td class="right num">' + won(o.amount) + "</td><td>" + esc(typeof q === "object" ? q.why + (q.text ? " · " + q.text : "") : "강사 취소 · 환불 필요") + '</td><td class="vda-nw">결제 ' + dd + "일째<small class=\"a-memo\">들은 강의 " + used + "개</small></td><td class=\"right\">" + btn("환불 처리", "vda-refund", "a-btn-primary a-btn-sm", ' data-id="' + esc(o.id) + '"') + "</td></tr>"; }).join("") + "</tbody></table></div>" : emptyBox("check", "기다리는 환불 요청이 없어요.")) + "</section>" +
      (wait.length ? '<section class="a-card crm-card rf-wait"><div class="a-card-head"><h2>계좌 송금 대기 ' + wait.length + '건</h2><p class="a-muted">무통장 입금 주문의 환불은 아래 계좌로 직접 송금하고 ‘송금 완료’를 눌러 주세요.</p></div><div class="a-table-wrap"><table class="a-table"><thead><tr><th>환불 처리일</th><th>회원</th><th>클래스</th><th class="right">송금할 금액</th><th>환불 계좌</th><th class="right"></th></tr></thead><tbody>' +
        wait.map((o) => '<tr><td class="vda-nw">' + esc(DB.date.toStr(new Date(o.refundedAt))) + '</td><td class="vda-nw">' + esc(nm(o)) + "</td><td>" + esc(o.title) + '<small class="a-memo num">' + esc(o.no) + '</small></td><td class="right num"><b>' + won(o.refundPay.amount || vdRefAmt(o)) + "</b></td><td>" + esc(vdAcctTxt(o.refundPay)) + '</td><td class="right">' + btn("송금 완료", "vda-rfsent", "a-btn-primary a-btn-sm", ' data-id="' + esc(o.id) + '"') + "</td></tr>").join("") + "</tbody></table></div></section>" : "") +
      '<section class="a-card crm-card"><div class="a-card-head"><h2>환불 · 취소 내역</h2><p class="a-muted">최근 50건 · 회원 바로 취소와 마스터 환불을 모두 보여요</p></div>' +
        (refd.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>환불일</th><th>회원</th><th>클래스</th><th class="right">결제 · 환불</th><th>방식</th><th>결제 취소 · 송금</th><th>사유 · 처리</th></tr></thead><tbody>' + refd.slice(0, 50).map((o) => { const k = RF_KIND[rfKindOf(o)]; return '<tr><td class="vda-nw">' + esc(o.refundedAt ? DB.date.toStr(new Date(o.refundedAt)) : "-") + '</td><td class="vda-nw"><a class="a-link" href="#/center/master/vod-crm/' + esc(o.mid) + '">' + esc(nm(o)) + "</a></td><td>" + esc(o.title) + '<small class="a-memo num">' + esc(o.no) + '</small></td><td class="right num">' + won(o.amount) + '<small class="a-memo"><b>' + won(o.refundAmount != null ? o.refundAmount : o.amount) + " 환불</b></small></td><td>" + pill(k[0], k[1]) + "</td><td>" + rfPg(o) + "</td><td>" + esc(o.refundWhy || "-") + '<small class="a-memo">' + esc(o.refundBy || "") + "</small></td></tr>"; }).join("") + "</tbody></table></div>" : emptyBox("refresh", "아직 환불 내역이 없어요.")) + "</section>" +
      '<section class="a-card crm-card rf-pg"><div class="a-card-head"><h2>결제(PG) 연결</h2>' + (pgOn ? pill("포트원 연결됨", "ok") : pill("시안 · 연결 전", "warn")) + "</div>" +
        "<p>" + (pgOn ? "회원 바로 취소 · 마스터 환불을 누르면 포트원으로 카드 결제가 자동 취소돼요. 부분 환불은 그 금액만큼만 취소해요." : "지금은 시안이라 환불 · 취소 기록만 남고 실제 카드 결제는 취소되지 않아요. 정식 서버에 포트원 키를 넣으면 같은 버튼이 카드 결제를 자동으로 취소해요.") + "</p></section>";
  }
  function saveVodRfPolicy() {
    const f = document.getElementById("vda-rf-form"); if (!f) return;
    const s = VD().settings, n = (k, lo, hi, dv) => { const x = Math.round(Number(f[k].value)); return x >= lo && x <= hi ? x : dv; };
    s.refund = Object.assign({}, VX().RF_DEF, s.refund || {}, { instant: f.instant.value === "1", days: n("days", 1, 30, 7), maxUsed: n("maxUsed", 0, 10, 0), ebookDays: n("ebookDays", 1, 30, 7), eventDays: n("eventDays", 0, 14, 3), matCounts: f.matCounts.checked, addons: f.addons.checked, restore: f.restore.checked });
    commit("환불 규정을 저장했어요. 스토어 문구와 회원 바로 취소에 바로 반영돼요.");
  }
  document.addEventListener("click", (e) => {
    if (!isActive()) return;
    const a = e.target.closest("[data-action='vda-rf-inst'], [data-action='vda-rf-save']"); if (!a) return;
    if (staffDeny("master/vod")) return;
    if (a.dataset.action === "vda-rf-inst") { const on = !a.classList.contains("on"); a.classList.toggle("on", on); a.setAttribute("aria-checked", on); const h = document.querySelector('#vda-rf-form [name="instant"]'); if (h) h.value = on ? "1" : ""; return; }
    saveVodRfPolicy();
  });
  Object.assign(MPAGES, { "vod-home": pageVodHome, "vod-ship": pageVodShip, "vod-refund": pageVodRefund, "vod-sales": pageVodSales, "vod-rank": pageVodRank, "vod-ads": pageVodAds, "vod-settle": pageVodSettle, "vod-rates": pageVodRates });
  Object.assign(MPAGES, { "vod-crm": pageCrm, "vod-seg": pageCrmSeg, "vod-msg": pageCrmMsg, "vod-crm-rp": pageCrmReport });
  Object.assign(MPAGES, { vod: pageMasterVod, "vod-classes": pageMasterVodClasses, "vod-members": pageMasterVodMembers, "vod-display": pageMasterVodDisplay, dc: pageMasterDc, "vod-inquiries": pageMasterVodInquiries, "vod-recruit": (r) => { ui.inqFilter = "vod"; return pageMasterPartners(r).replace("<h1>강사 입점 문의</h1>", "<h1>DOOGO CLASS 강사 모집 지원</h1>"); } });
  Object.assign(PAGES, { "ops-notices": pageOpsNotices, contract: pageInsContract });
  Object.assign(PAGES, { vod: pageInsVod, "vod-live": pageInsVodLive, "vod-settle": pageInsVodSettle, "vod-cal": pageInsVodCal, "vod-students": pageVodStudents, vodlink: pageVodLink, vodlessons: pageVodLessons, coaching: pageCoaching, teatime: pageTeaTime });
  /* ================= 마스터: 학사 · 운영 메뉴 =================
   * 두잉고 = 강사(교수) ↔ 수강생(학생)을 잇는 튜토리얼 플랫폼. 대학 학사 운영처럼
   * 전체 기수 일정(학사 일정) · 과제 검수 · 응답 관리 · 수료 관리 · 강사 계약 · 서류 · 운영자 계정 · 활동 기록을 마스터가 본다.
   * 지금은 이 브라우저 저장(시안) — 서버 저장은 정식 반영 때 붙인다 */
  const insTheme = (iid) => DB.themeOf(((DB.content(iid) || {}).brand || {}).theme).primary;
  const insOk = (iid) => !!DB.instructor(iid);
  const dayDiff = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 864e5);
  const hoursTxt = (h) => (h == null ? "-" : h < 1 ? "1시간 안" : h < 48 ? Math.round(h) + "시간" : Math.round(h / 24) + "일");
  const ageH = (ms) => (Date.now() - ms) / 36e5;
  const cohortStudents = (co) => DB.studentsOf(co.instructorId).filter((s) => s.cohortId === co.id && s.status === "approved");

  /* ---------- 활동 기록 (누가 · 언제 · 무엇을) ---------- */
  function whoAmI() {
    if (!S) return "-";
    if (S.role === "partner") { const p = affOf(S.partnerId); return (p ? p.name : "파트너") + " (파트너)"; }
    if (S.role === "master") { const st = staffMe(); return st ? st.name + " (" + staffRoleName(st) + ")" : "ADMIN"; }
    if (S.role === "coach") return "코치";
    const ins = DB.instructor(S.instructorId); return (ins ? ins.name : "강사") + " (강사)";
  }
  function actLog(msg) {
    if (!msg || !S || S.role !== "master") return;
    const d = DB.data; if (!Array.isArray(d.adminLog)) d.adminLog = [];
    d.adminLog.unshift({ at: Date.now(), who: whoAmI(), staffId: (S && S.staffId) || "admin", msg: String(msg).slice(0, 200) });
    if (d.adminLog.length > 400) d.adminLog.length = 400;
  }

  /* ---------- 운영자 계정 (메뉴 권한) ---------- */
  const STAFF_ROLES = {
    ops: { label: "운영 매니저", perms: ["master/vod", "master/vod-classes", "master/vod-members", "master/vod-display", "master/billing", "master/rs", "master/instructors", "master/contracts", "master/menus", "master/site", "master/plan", "master/calendar", "master/health", "master/sla", "master/certs", "master/students", "master/partners", "master/reports", "master/notices"] },
    finance: { label: "정산 담당", perms: ["master/vod", "master/billing", "master/rs", "master/contracts"] },
    academic: { label: "학사 · 상담 담당", perms: ["master/plan", "master/calendar", "master/health", "master/sla", "master/certs", "master/students", "master/partners", "master/reports", "master/notices"] },
    custom: { label: "직접 선택", perms: [] }
  };
  function STAFF() {
    const d = DB.data;
    if (!Array.isArray(d.staff)) {
      d.staff = [
        { id: "st-demo1", name: "김매니저", loginId: "manager", pw: "manager", role: "ops", perms: STAFF_ROLES.ops.perms.slice(), status: "active", createdAt: "2026-09-01", lastLoginAt: Date.parse("2026-10-24T09:12:00") },
        { id: "st-demo2", name: "박정산", loginId: "finance", pw: "finance", role: "finance", perms: STAFF_ROLES.finance.perms.slice(), status: "active", createdAt: "2026-09-15", lastLoginAt: Date.parse("2026-10-20T14:40:00") }
      ];
      if (!Array.isArray(d.adminLog) || !d.adminLog.length) d.adminLog = [
        { at: Date.parse("2026-10-24T09:20:00"), who: "김매니저 (운영 매니저)", staffId: "st-demo1", msg: "이도윤 님 입점 문의를 ‘상담 중’으로 바꿨어요." },
        { at: Date.parse("2026-10-21T10:02:00"), who: "박정산 (정산 담당)", staffId: "st-demo2", msg: "로직메이커 2기 이용료 입금 확인 · 세금계산서 발행" },
        { at: Date.parse("2026-10-10T11:30:00"), who: "ADMIN", staffId: "admin", msg: "하지원 파트너 · 2026년 9월 RS 지급 완료 처리" },
        { at: Date.parse("2026-09-20T10:00:00"), who: "ADMIN", staffId: "admin", msg: "초이 플랫폼을 만들었어요." }
      ];
      DB.save();
    }
    return d.staff;
  }
  const staffOf = (id) => STAFF().find((x) => x.id === id) || null;
  const staffMe = () => (S && S.role === "master" && S.staffId ? staffOf(S.staffId) : null);
  const staffRoleName = (st) => (STAFF_ROLES[st.role] || STAFF_ROLES.custom).label;
  // 새로 생긴 DOOGO CLASS 메뉴는 원래 맡던 메뉴 권한을 따라가요 (대시보드 ← 주문 · 매출, 1:1 문의 ← 회원 · 후기, 강사 모집 ← 입점 문의)
  const STAFF_ALIAS = { "master/vod-home": "master/vod-display", "master/vod-sales": "master/vod", "master/vod-rank": "master/vod", "master/vod-ads": "master/vod", "master/vod-settle": "master/vod", "master/vod-rates": "master/vod", "master/plan": "master/calendar", "master/dc": "master/vod", "master/vod-inquiries": "master/vod-members", "master/vod-recruit": "master/partners", "master/vod-crm": "master/vod-members", "master/vod-seg": "master/vod-members", "master/vod-msg": "master/vod-members", "master/vod-crm-rp": "master/vod-members", "master/vod-refund": "master/vod", "master/vod-ship": "master/vod" };
  const staffCan = (key) => { const st = staffMe(); if (!st || key === "master") return true; if (key === "master/data") return false; const pm = st.perms || []; return pm.indexOf(key) >= 0 || (!!STAFF_ALIAS[key] && pm.indexOf(STAFF_ALIAS[key]) >= 0); };
  function staffStrip(root) {
    if (!staffMe() || !root) return;
    const rm = (sel) => root.querySelectorAll(sel).forEach((el) => el.remove());
    if (!staffCan("master/instructors")) rm('[data-action="ins-add"],[data-action="ins-edit"],[data-action="ins-delete"],[data-action="ins-enter"]');
    if (!staffCan("master/vod-inquiries")) root.querySelectorAll('[data-action="vda-iq"]').forEach((el) => { el.removeAttribute("data-action"); el.classList.remove("clickable"); });
    root.querySelectorAll('a[href^="#/center/master/"]').forEach((a) => { const k = "master/" + a.getAttribute("href").replace("#/center/master/", "").split(/[/?]/)[0]; if (!staffCan(k)) { if (a.classList.contains("a-inq-alert")) a.remove(); else { a.removeAttribute("href"); a.classList.add("a-noperm"); a.title = "맡은 메뉴가 아니에요"; } } });
  }
  const staffDeny = (key) => { if (staffCan(key)) return false; toast("맡은 메뉴가 아니라 할 수 없어요. 마스터에게 권한을 요청해 주세요.", "warn"); return true; };
  function findStaffLogin(id, pw) {
    const n = (v) => String(v || "").replace(/\s+/g, "").toLowerCase();
    return STAFF().find((x) => n(x.loginId) === n(id) && String(x.pw) === String(pw).trim()) || null;
  }
  const staffNav = (groups) => (staffMe() ? groups.map((g) => [g[0], g[1].filter((it) => staffCan(it[0]))]).filter((g) => g[1].length) : groups);

  /* ---------- 1) 전체 기수 일정 (학사 일정) ---------- */
  function pageMasterCalendar() {
    const today = todayStr(), ym = ui.calMonth || today.slice(0, 7);
    const cos = DB.data.cohorts.filter((c) => insOk(c.instructorId) && c.startDate).map((co) => ({ co, ins: DB.instructor(co.instructorId), start: co.startDate, end: DB.cohortEnd(co), st: DB.cohortStatus(co), color: insTheme(co.instructorId), n: cohortStudents(co).length, weeks: DB.weeksOf(co).length }));
    const inM = (d) => d && d.slice(0, 7) === ym;
    const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)), first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate(), lead = first.getDay();
    const ds = (d) => ym + "-" + String(d).padStart(2, "0");
    const chip = (x, kind) => '<span class="mc-chip ' + kind + '" style="--c:' + x.color + '" title="' + esc(x.ins.displayName + " " + x.co.name + (kind === "s" ? " 시작" : " 종료 · 수료")) + '"><i></i>' + esc(x.ins.displayName) + " " + esc(x.co.name) + "<em>" + (kind === "s" ? "시작" : "수료") + "</em></span>";
    let cells = "";
    for (let i = 0; i < lead; i++) cells += '<div class="mc-day off"></div>';
    for (let d = 1; d <= days; d++) {
      const k = ds(d), run = cos.filter((x) => x.start <= k && k <= x.end).length;
      const items = cos.filter((x) => x.start === k).map((x) => chip(x, "s")).concat(cos.filter((x) => x.end === k).map((x) => chip(x, "e")));
      cells += '<div class="mc-day' + (k === today ? " today" : "") + ((lead + d - 1) % 7 === 0 ? " sun" : (lead + d - 1) % 7 === 6 ? " sat" : "") + '"><b>' + d + "</b>" + (run ? '<small class="mc-run">진행 ' + run + "</small>" : "") + items.join("") + "</div>";
    }
    const startM = cos.filter((x) => inM(x.start)), endM = cos.filter((x) => inM(x.end));
    const list = cos.slice().sort((a, b) => b.start.localeCompare(a.start));
    const stPill = (s) => pill(DB.STATUS_LABEL[s], s === "running" ? "ok" : s === "upcoming" ? "info" : "mute");
    return head("전체 기수 일정", "모든 강사 플랫폼의 기수 시작 · 종료(수료) 날짜를 한 달력에서 봐요. 대학의 학사 일정처럼, 겹치는 기수와 다가오는 개강을 미리 챙길 수 있어요.", '<a class="a-btn a-btn-primary" href="#/center/master/plan">' + icon("layers", "sm") + "기수 · 일정 설계</a>") +
      '<div class="a-kpis">' +
        kpi("모집 중 기수", cos.filter((x) => x.st === "upcoming").length + "개", "개강 전", "#/center/master/calendar") +
        kpi("진행 중 기수", cos.filter((x) => x.st === "running").length + "개", "수강생 " + cos.filter((x) => x.st === "running").reduce((a, x) => a + x.n, 0) + "명 학습 중", "#/center/master/calendar", "ok") +
        kpi(m + "월 개강", startM.length + "개", startM.map((x) => x.ins.displayName).slice(0, 3).join(" · ") || "없어요", "#/center/master/calendar") +
        kpi(m + "월 종료 · 수료", endM.length + "개", endM.map((x) => x.ins.displayName).slice(0, 3).join(" · ") || "없어요", "#/center/master/certs") +
      "</div>" +
      '<section class="a-card mc"><div class="mc-head">' + btn(icon("chevLeft", "sm"), "cal-m", "a-btn-ghost a-btn-sm", ' data-dir="-1" aria-label="이전 달"') + "<h2>" + y + "년 " + m + "월</h2>" + btn(icon("chevRight", "sm"), "cal-m", "a-btn-ghost a-btn-sm", ' data-dir="1" aria-label="다음 달"') + (ym !== today.slice(0, 7) ? btn("이번 달", "cal-m", "a-btn-outline a-btn-sm", ' data-dir="0"') : "") +
        '<span class="mc-legend"><span class="mc-chip s"><i></i>개강</span><span class="mc-chip e"><i></i>종료 · 수료</span></span></div>' +
        '<div class="mc-grid">' + ["일", "월", "화", "수", "목", "금", "토"].map((w, i) => '<div class="mc-w' + (i === 0 ? " sun" : i === 6 ? " sat" : "") + '">' + w + "</div>").join("") + cells + "</div></section>" +
      '<section class="a-card"><div class="a-card-head"><h2>기수 목록</h2><span class="a-muted">' + list.length + "개 · 최근 개강 순</span></div>" + (list.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>강사</th><th>기수</th><th>기간</th><th class="num">주차</th><th class="num">수강생</th><th>상태</th><th class="right"></th></tr></thead><tbody>' +
        list.map((x) => '<tr><td><span class="mc-dot" style="--c:' + x.color + '"></span><b>' + esc(x.ins.displayName) + "</b></td><td>" + esc(x.co.name) + "</td><td>" + fmtFull(x.start) + " ~ " + fmtFull(x.end) + (x.st === "upcoming" ? ' <small class="a-muted">개강 ' + dLeft(x.start) + "</small>" : "") + '</td><td class="num">' + x.weeks + '주</td><td class="num">' + x.n + "명</td><td>" + stPill(x.st) + '</td><td class="right"><div class="a-row-actions">' + btn("설계 · 수정", "plan-edit", "a-btn-ghost a-btn-sm", ' data-id="' + esc(x.co.id) + '"') + btn("강사센터 접속", "ins-enter", "a-btn-ghost a-btn-sm", ' data-id="' + esc(x.ins.id) + '"') + "</div></td></tr>").join("") +
        "</tbody></table></div>" : emptyBox("calendar", "아직 열린 기수가 없어요.")) + "</section>";
  }

  /* ---------- 2) 과제 검수 · 응답 관리 (강사 응답 속도) ---------- */
  function SLA() { const d = DB.data; if (!d.slaSet) d.slaSet = { review: 48, request: 24 }; return d.slaSet; }
  function slaRows() {
    const set = SLA();
    return DB.data.instructors.filter((x) => x.status === "active").map((ins) => {
      const subs = allSubmissions(ins.id, "all");
      const pend = subs.filter((x) => x.review === "pending");
      const late = pend.filter((x) => ageH(x.sub.at) > set.review);
      const done = subs.filter((x) => x.sub.review && x.sub.review.at && x.sub.at);
      const avgRev = done.length ? done.reduce((a, x) => a + Math.max(0, x.sub.review.at - x.sub.at), 0) / done.length / 36e5 : null;
      const reqs = DB.requests(ins.id).filter((x) => !DB.isVodStudent(x.s)), open = reqs.filter((x) => !x.q.answer), lateReq = open.filter((x) => ageH(x.q.at) > set.request);
      const ans = reqs.filter((x) => x.q.answer && x.q.answeredAt && x.q.at);
      const avgReq = ans.length ? ans.reduce((a, x) => a + Math.max(0, x.q.answeredAt - x.q.at), 0) / ans.length / 36e5 : null;
      const grade = late.length >= 5 || lateReq.length >= 2 ? ["지연", "bad"] : late.length || lateReq.length ? ["주의", "warn"] : ["좋아요", "ok"];
      return { ins, subs, pend, late, avgRev, open, lateReq, avgReq, grade };
    });
  }
  function pageMasterSla() {
    const set = SLA(), rows = slaRows();
    const late = rows.flatMap((r) => r.late.map((x) => Object.assign({ ins: r.ins }, x))).sort((a, b) => a.sub.at - b.sub.at).slice(0, 10);
    const allDone = rows.filter((r) => r.avgRev != null);
    const avg = allDone.length ? allDone.reduce((a, r) => a + r.avgRev, 0) / allDone.length : null;
    return head("과제 검수 · 응답 관리", "강사님이 수강생 과제를 제때 검수하고, 1:1 요청에 제때 답하는지 봐요. 기준 시간을 넘긴 과제는 먼저 보여 드려요. 늦어지는 강사님께는 강사센터에 접속해 도와드리거나 공지로 알려 주세요.") +
      '<div class="a-kpis">' +
        kpi("검수 대기 과제", rows.reduce((a, r) => a + r.pend.length, 0) + "건", "모든 플랫폼 합계", "#/center/master/sla") +
        kpi(set.review + "시간 넘은 과제", rows.reduce((a, r) => a + r.late.length, 0) + "건", "기준 " + set.review + "시간 안 검수", "#/center/master/sla", rows.some((r) => r.late.length) ? "warn" : "") +
        kpi("평균 검수 시간", hoursTxt(avg), "제출 → 검수까지", "#/center/master/sla") +
        kpi("답변 대기 1:1 요청", rows.reduce((a, r) => a + r.open.length, 0) + "건", set.request + "시간 넘음 " + rows.reduce((a, r) => a + r.lateReq.length, 0) + "건", "#/center/master/reports", rows.some((r) => r.lateReq.length) ? "warn" : "") +
      "</div>" +
      '<section class="a-card"><div class="a-card-head"><h2>강사별 응답 현황</h2><span class="a-muted">기준: 과제 검수 ' + set.review + "시간 · 1:1 요청 " + set.request + "시간</span></div>" + '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>강사</th><th class="num">검수 대기</th><th class="num">기준 초과</th><th class="num">평균 검수</th><th class="num">1:1 답변 대기</th><th class="num">평균 답변</th><th>상태</th><th class="right"></th></tr></thead><tbody>' +
        rows.map((r) => '<tr><td><span class="mc-dot" style="--c:' + insTheme(r.ins.id) + '"></span><b>' + esc(r.ins.displayName) + '</b></td><td class="num">' + r.pend.length + '건</td><td class="num">' + (r.late.length ? '<b class="sla-bad">' + r.late.length + "건</b>" : "0건") + '</td><td class="num">' + hoursTxt(r.avgRev) + '</td><td class="num">' + (r.lateReq.length ? '<b class="sla-bad">' + r.open.length + "건</b>" : r.open.length + "건") + '</td><td class="num">' + hoursTxt(r.avgReq) + "</td><td>" + pill(r.grade[0], r.grade[1]) + '</td><td class="right">' + btn("강사센터 접속", "ins-enter", "a-btn-ghost a-btn-sm", ' data-id="' + esc(r.ins.id) + '"') + "</td></tr>").join("") +
        "</tbody></table></div></section>" +
      '<div class="p-grid p-grid-r">' +
        '<section class="a-card"><div class="a-card-head"><h2>오래 기다린 과제</h2><span class="a-muted">기준 시간을 넘긴 순</span></div>' + (late.length ? '<ul class="sla-list">' + late.map((x) => '<li><span class="mc-dot" style="--c:' + insTheme(x.ins.id) + '"></span><div><b>' + esc(x.s.name) + " · " + esc(x.w.no + "주차 " + (x.m.title || "과제")) + "</b><small>" + esc(x.ins.displayName) + " · " + fmtStamp(x.sub.at) + ' 제출</small></div><em class="sla-age">' + hoursTxt(ageH(x.sub.at)) + " 대기</em>" + btn("검수하러 가기", "ins-enter", "a-btn-outline a-btn-sm", ' data-id="' + esc(x.ins.id) + '"') + "</li>").join("") + "</ul>" : emptyBox("check", "기준 시간을 넘긴 과제가 없어요. 모두 제때 검수하고 있어요.")) + "</section>" +
        '<section class="a-card"><div class="a-card-head"><h2>응답 기준 시간</h2></div><form id="sla-form" class="a-form" novalidate>' +
          '<div class="a-field"><label for="sla-review">과제 검수 (시간)</label><input class="a-input" id="sla-review" name="review" type="number" min="1" max="336" value="' + esc(set.review) + '"><small class="a-muted">수강생이 과제를 내고 이 시간 안에 검수하면 ‘좋아요’예요.</small></div>' +
          '<div class="a-field"><label for="sla-request">1:1 요청 답변 (시간)</label><input class="a-input" id="sla-request" name="request" type="number" min="1" max="336" value="' + esc(set.request) + '"></div>' +
          '<button class="a-btn a-btn-primary" type="submit">저장</button></form></section>' +
      "</div>";
  }
  function saveSla(f) {
    const r = Number(f.review.value), q = Number(f.request.value);
    if (!(r >= 1 && r <= 336) || !(q >= 1 && q <= 336)) { toast("1~336시간 사이로 적어 주세요.", "warn"); return; }
    Object.assign(SLA(), { review: r, request: q }); commit("응답 기준 시간을 바꿨어요. (검수 " + r + "시간 · 1:1 요청 " + q + "시간)");
  }

  /* ---------- 3) 수료 관리 ---------- */
  const certNoOf = (s) => DB.certNo(s);
  const certNoLegacy = (s) => { const co = DB.cohort(s.cohortId); if (!co) return ""; const idx = DB.data.students.filter((x) => x.cohortId === co.id).findIndex((x) => x.id === s.id) + 1; return "DG-" + String(s.instructorId || co.instructorId).toUpperCase().slice(0, 4) + "-" + (parseInt(co.name, 10) || 0) + "-" + String(Math.max(1, idx)).padStart(4, "0"); };
  function certData() {
    return DB.data.cohorts.filter((c) => insOk(c.instructorId) && c.startDate && DB.cohortStatus(c) !== "upcoming").map((co) => {
      const rows = studentProgressRows(co.instructorId, (s) => s.cohortId === co.id && s.status === "approved");
      const earned = rows.filter((r) => r.st.reqTotal && r.st.reqDone === r.st.reqTotal);
      const near = rows.filter((r) => r.st.reqTotal && r.st.reqTotal - r.st.reqDone > 0 && r.st.reqTotal - r.st.reqDone <= 2);
      return { co, ins: DB.instructor(co.instructorId), st: DB.cohortStatus(co), rows, earned, near };
    }).sort((a, b) => b.co.startDate.localeCompare(a.co.startDate));
  }
  function pageMasterCerts() {
    const data = certData(), ended = data.filter((x) => x.st === "ended" && x.rows.length);
    const rate = (x) => (x.rows.length ? Math.round(x.earned.length / x.rows.length * 100) : 0);
    const f = ui.certCo || "all", pick = data.filter((x) => f === "all" || x.co.id === f);
    const grads = pick.flatMap((x) => x.earned.map((r) => ({ x, r }))).slice(0, 60);
    const nearList = data.filter((x) => x.st === "running").flatMap((x) => x.near.map((r) => ({ x, r }))).slice(0, 8);
    let res = "";
    if (ui.certQ) {
      const q = ui.certQ.trim().toUpperCase(), s = DB.data.students.find((x) => certNoOf(x) === q) || DB.data.students.find((x) => certNoLegacy(x) === q);
      if (!s) res = '<div class="cert-res bad">' + icon("alert", "sm") + "<div><b>등록되지 않은 수료번호예요</b><span>" + esc(q) + " · 번호를 다시 확인해 주세요.</span></div></div>";
      else { const co = DB.cohort(s.cohortId), ins = DB.instructor(s.instructorId || co.instructorId), stt = DB.stats(DB.progress(s.id), ins.id, co), ok = stt.reqTotal && stt.reqDone === stt.reqTotal;
        res = '<div class="cert-res ' + (ok ? "ok" : "warn") + '">' + icon(ok ? "award" : "alert", "sm") + "<div><b>" + (ok ? "유효한 수료증이에요" : "수료 조건을 아직 채우지 않았어요") + "</b><span>" + esc(q) + " · " + esc(s.name) + " · " + esc(ins.displayName) + " " + esc(co.name) + " · 필수 과제 " + stt.reqDone + "/" + stt.reqTotal + "</span></div></div>"; }
    }
    return head("수료 관리", "기수별 수료율과 수료생 명단을 봐요. 필수 과제를 모두 통과하면 수료증이 자동으로 발급되고, 수료번호로 진위를 확인할 수 있어요. 수료가 얼마 안 남은 수강생은 강사님께 알려 챙기게 해 주세요.") +
      '<div class="a-kpis">' +
        kpi("누적 수료생", data.reduce((a, x) => a + x.earned.length, 0) + "명", "필수 과제 모두 통과", "#/center/master/certs", "ok") +
        kpi("종료 기수 평균 수료율", (ended.length ? Math.round(ended.reduce((a, x) => a + rate(x), 0) / ended.length) : 0) + "%", "종료된 기수 " + ended.length + "개", "#/center/master/certs") +
        kpi("수료 임박", nearList.length + "명", "필수 과제 1~2개 남음 · 진행 중 기수", "#/center/master/certs", nearList.length ? "warn" : "") +
        kpi("발급 기준", "필수 과제 100%", "수강생 화면 ‘수료증 발급’ 메뉴", "#/center/master/menus") +
      "</div>" +
      '<section class="a-card"><div class="a-card-head"><h2>기수별 수료율</h2></div>' + (data.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>강사 · 기수</th><th>상태</th><th class="num">수강생</th><th class="num">수료</th><th>수료율</th><th class="num">수료 임박</th><th class="right"></th></tr></thead><tbody>' +
        data.map((x) => '<tr><td><span class="mc-dot" style="--c:' + insTheme(x.ins.id) + '"></span><b>' + esc(x.ins.displayName) + "</b> " + esc(x.co.name) + "</td><td>" + pill(DB.STATUS_LABEL[x.st], x.st === "running" ? "ok" : "mute") + '</td><td class="num">' + x.rows.length + '명</td><td class="num"><b>' + x.earned.length + '명</b></td><td><div class="a-bar"><span style="width:' + rate(x) + '%"></span></div><small class="num">' + rate(x) + '%</small></td><td class="num">' + x.near.length + '명</td><td class="right">' + btn("명단 보기", "cert-co", "a-btn-ghost a-btn-sm", ' data-k="' + esc(x.co.id) + '"') + "</td></tr>").join("") +
        "</tbody></table></div>" : emptyBox("award", "아직 시작한 기수가 없어요.")) + "</section>" +
      '<div class="p-grid p-grid-r">' +
        '<section class="a-card"><div class="a-card-head"><h2>수료생 명단</h2><select class="a-input a-sm cert-sel" data-cert-co="1"><option value="all">전체 기수</option>' + data.map((x) => '<option value="' + esc(x.co.id) + '"' + (f === x.co.id ? " selected" : "") + ">" + esc(x.ins.displayName + " " + x.co.name) + "</option>").join("") + "</select></div>" +
          (grads.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>수료번호</th><th>이름</th><th>강사 · 기수</th><th class="num">필수 과제</th></tr></thead><tbody>' + grads.map(({ x, r }) => "<tr><td><code>" + esc(certNoOf(r.s)) + "</code></td><td><b>" + esc(r.s.name) + "</b></td><td>" + esc(x.ins.displayName + " " + x.co.name) + '</td><td class="num">' + r.st.reqDone + "/" + r.st.reqTotal + "</td></tr>").join("") + "</tbody></table></div>" : emptyBox("award", "이 기수에는 아직 수료생이 없어요.")) + "</section>" +
        '<div class="a-stack">' +
          '<section class="a-card"><div class="a-card-head"><h2>수료증 진위 확인</h2></div><div class="cert-q"><input class="a-input" id="cert-q" placeholder="예: DG-MOON-3-0001" value="' + esc(ui.certQ || "") + '" maxlength="30" aria-label="수료번호">' + btn(icon("search", "sm") + "조회", "cert-check", "a-btn-primary") + "</div>" + res + '<p class="a-muted p-small">기업 · 기관에서 수료 여부를 물어 오면 수료증의 ‘제 ○○ 호’ 번호로 확인해 주세요.</p></section>' +
          '<section class="a-card"><div class="a-card-head"><h2>수료 임박 수강생</h2></div>' + (nearList.length ? '<ul class="sla-list">' + nearList.map(({ x, r }) => '<li><span class="mc-dot" style="--c:' + insTheme(x.ins.id) + '"></span><div><b>' + esc(r.s.name) + "</b><small>" + esc(x.ins.displayName + " " + x.co.name) + '</small></div><em class="sla-age ok">' + (r.st.reqTotal - r.st.reqDone) + "개 남음</em></li>").join("") + "</ul>" : emptyBox("check", "지금 수료 임박한 수강생이 없어요.")) + "</section>" +
        "</div>" +
      "</div>";
  }

  /* ---------- 4) 강사 계약 · 서류 ---------- */
  const DOCS = [["contract", "이용 계약서"], ["biz", "사업자등록증"], ["bank", "정산 통장 사본"], ["privacy", "개인정보 처리 위탁 동의"]];
  // 계약서 양식 (글은 contract-forms.js · Word 파일은 assets/docs) — 이용 계약서 · 개인정보 처리 위탁 동의 줄에 양식 버튼
  const CT_FORM = { contract: "service", privacy: "privacy" };
  window.DG_FORMS_FILES = { service: "assets/docs/doinggo-service-agreement.docx", privacy: "assets/docs/doinggo-privacy-entrustment.docx" };
  const ctTplBtns = (k, iid) => '<span class="ct-tpl-btns"><a class="ct-tpl-a" href="' + esc(window.DG_FORMS_FILES[k]) + '" download>' + icon("download", "xs") + 'Word 양식</a><button type="button" class="ct-tpl-a" data-action="ct-print" data-k="' + k + '" data-id="' + esc(iid) + '">' + icon("printer", "xs") + "채워서 인쇄 · PDF</button></span>";
  /** 이 강사 정보(창에 적힌 값 그대로 · 저장 전이어도)로 채운 계약서를 새 창에 열고 인쇄 · PDF 저장 */
  function ctPrint(k, iid) {
    const f = document.getElementById("ct-form"), v = (n) => (f && f[n] ? f[n].value.trim() : ""), ins = DB.instructor(iid) || {}, S = DB.siteInfo ? DB.siteInfo() : {};
    const go = () => {
      const G = window.DG_FORMS, F = G && G.FORMS[k];
      if (!F) { toast("계약서 양식을 불러오지 못했어요. Word 양식을 내려받아 주세요.", "warn"); return; }
      const md = (d) => d ? d.replace(/^(\d{4})-(\d{2})-(\d{2})$/, (m, y, mo, da) => y + "년 " + Number(mo) + "월 " + Number(da) + "일") : "";
      const vals = Object.assign({}, G.COMPANY, { 회사: S.company && /두고/.test(S.company) ? S.company.replace(/^\(주\)/, "주식회사 ") : G.COMPANY.회사, 대표: S.ceo || G.COMPANY.대표, 사업자번호: S.bizNo || G.COMPANY.사업자번호, 주소: S.address || G.COMPANY.주소,
        강사명: ins.displayName || "", 강사성명: ins.name || v("contact"), 시작일: md(v("start")), 종료일: md(v("end")), 이용료: v("feeNote"), 연락처: v("phone"), 이메일: v("email"), 담당자: v("contact") });
      const e = (x) => esc(G.fill(x, vals)), lines = String(F.body).split("\n"), out = [];
      let ul = null; const flush = () => { if (ul) { out.push("<ul>" + ul.join("") + "</ul>"); ul = null; } };
      lines.forEach((l) => { const t = l.trim(); if (!t) { flush(); return; } if (t.indexOf("## ") === 0) { flush(); out.push("<h2>" + e(t.slice(3)) + "</h2>"); } else if (t.indexOf("- ") === 0) (ul = ul || []).push("<li>" + e(t.slice(2)) + "</li>"); else { flush(); out.push("<p>" + e(t) + "</p>"); } });
      flush();
      const today = new Date(), party = (p) => '<div class="pt"><h3>' + esc(p[0]) + "</h3>" + p[1].map((r) => "<p><span>" + esc(r[0]) + "</span><b>" + (G.fill(r[1], vals) === "__________" || !r[1] ? "______________________" : e(r[1])) + "</b></p>").join("") + '<p class="sg"><span>서명 · 날인</span><b>______________________ (인)</b></p></div>';
      const html = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' + esc(F.title + " - " + (ins.displayName || "")) + '</title><style>' +
        '@page{size:A4;margin:18mm 17mm}*{box-sizing:border-box}body{margin:0;font-family:"Pretendard","Malgun Gothic","Apple SD Gothic Neo",sans-serif;color:#111;font-size:10.5pt;line-height:1.75;word-break:keep-all}' +
        '.wrap{max-width:180mm;margin:0 auto;padding:12mm 0}h1{text-align:center;font-size:19pt;margin:0 0 2mm;letter-spacing:-.02em}.sub{text-align:center;color:#888;font-size:9pt;margin:0 0 9mm}h2{font-size:11.5pt;margin:6mm 0 1.5mm;break-after:avoid}p{margin:0 0 2mm}ul{margin:0 0 2mm;padding-left:5mm}li{margin:.6mm 0}' +
        '.lead{margin-bottom:4mm}.close{margin-top:8mm}.date{text-align:center;font-weight:700;font-size:12pt;margin:8mm 0}.pts{display:grid;grid-template-columns:1fr 1fr;gap:8mm;break-inside:avoid}.pt{border-top:2px solid #222;padding-top:3mm}.pt h3{margin:0 0 3mm;font-size:11.5pt}.pt p{display:grid;grid-template-columns:28mm 1fr;margin:0 0 2.2mm}.pt span{color:#666;font-size:9.5pt}.pt .sg{margin-top:5mm}' +
        '.bar{position:sticky;top:0;display:flex;gap:8px;justify-content:center;padding:10px;background:#f4f4f5;border-bottom:1px solid #e5e5e5}.bar button{font:inherit;font-weight:700;padding:8px 16px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer}.bar button.p{background:#f94239;border-color:#f94239;color:#fff}@media print{.bar{display:none}.wrap{padding:0}}' +
        '</style></head><body><div class="bar"><button class="p" onclick="print()">인쇄 · PDF로 저장</button><button onclick="close()">닫기</button></div><div class="wrap"><h1>' + esc(F.title) + '</h1><p class="sub">두잉고 · www.doogoclass.com/doinggo</p><p class="lead">' + e(F.lead) + "</p>" + out.join("") +
        '<p class="close">' + esc(F.close) + '</p><p class="date">계약일 ' + today.getFullYear() + "년 " + (today.getMonth() + 1) + "월 " + today.getDate() + '일</p><div class="pts">' + F.parties.map(party).join("") + "</div></div></body></html>";
      const w = window.open("", "_blank");
      if (w && w.document) { w.document.open(); w.document.write(html); w.document.close(); w.focus(); return; }
      // 새 창이 막힌 곳(미리보기 등): HTML 파일로 내려받기 → 열어서 인쇄
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" })); a.download = F.title + " - " + (ins.displayName || "강사") + ".html"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast("새 창이 막혀 계약서 파일로 내려받았어요. 열어서 인쇄 · PDF로 저장해 주세요.");
    };
    if (window.DG_FORMS) return go();
    const s = document.createElement("script"); s.src = "contract-forms.js"; s.onload = go; s.onerror = () => toast("계약서 양식을 불러오지 못했어요. Word 양식을 내려받아 주세요.", "warn"); document.head.appendChild(s);
  }
  function CONTRACTS() {
    const d = DB.data;
    if (!d.contracts || typeof d.contracts !== "object") {
      const D = (o) => Object.assign({ feeNote: "기수마다 1인 수강료 × 1명분 (부가세 포함)", contact: "", phone: "", email: "", memo: "", docs: {} }, o);
      const all = (at) => { const o = {}; DOCS.forEach((x) => { o[x[0]] = { name: x[1] + ".pdf", at }; }); return o; };
      d.contracts = {};
      if (insOk("moon")) d.contracts.moon = D({ start: "2026-01-02", end: "2026-12-31", contact: "문원오", docs: all("2026-01-02") });
      if (insOk("logic")) d.contracts.logic = D({ start: "2026-09-10", end: "2027-09-09", contact: "김신용", docs: { contract: { name: "이용 계약서.pdf", at: "2026-09-10" }, biz: { name: "사업자등록증.pdf", at: "2026-09-10" } } });
      if (insOk("choi")) d.contracts.choi = D({ start: "2026-09-20", end: "2026-11-19", contact: "초이", memo: "3개월 체험 계약 · 11월에 1년 계약으로 갱신 예정", docs: all("2026-09-20") });
      DB.save();
    }
    return d.contracts;
  }
  function contractState(c) {
    if (!c || !c.start) return ["계약 미등록", "mute", 9];
    const left = dayDiff(todayStr(), c.end);
    if (left < 0) return ["계약 만료", "bad", 0];
    if (left <= 30) return ["만료 " + left + "일 전", "warn", 1];
    return ["계약 중", "ok", 3];
  }
  const docMissing = (c) => DOCS.filter((x) => !(c && c.docs && c.docs[x[0]])).length;
  const contractAlerts = () => { const cs = CONTRACTS(); return DB.data.instructors.filter((i) => i.status === "active").filter((i) => { const c = cs[i.id], s = contractState(c); return s[2] <= 1 || s[2] === 9 || docMissing(c); }).length; };
  function pageMasterContracts() {
    const cs = CONTRACTS(), list = DB.data.instructors.map((ins) => ({ ins, c: cs[ins.id], s: contractState(cs[ins.id]) })).sort((a, b) => a.s[2] - b.s[2]);
    const docChips = (c) => '<span class="ct-docs">' + DOCS.map((x) => { const f = c && c.docs && c.docs[x[0]]; return '<span class="ct-doc ' + (f ? "on" : "") + '" title="' + esc(x[1] + (f ? " · " + (f.at || "") + " 받음" : " · 미제출")) + '">' + (f ? icon("check", "xs") : "") + esc(x[1]) + "</span>"; }).join("") + "</span>";
    return head("강사 계약 · 서류", "강사님별 이용 계약 기간과 받아야 할 서류를 관리해요. 만료가 다가오거나 서류가 빠진 강사님을 먼저 보여 드려요.") +
      '<div class="a-kpis">' +
        kpi("계약 중", list.filter((x) => x.s[2] === 3 || x.s[2] === 1).length + "명", "전체 강사 " + list.length + "명", "#/center/master/contracts", "ok") +
        kpi("30일 안 만료", list.filter((x) => x.s[2] === 1).length + "명", "갱신 연락이 필요해요", "#/center/master/contracts", list.some((x) => x.s[2] === 1) ? "warn" : "") +
        kpi("서류 미비", list.filter((x) => x.c && docMissing(x.c)).length + "명", "4종 중 빠진 서류가 있어요", "#/center/master/contracts", list.some((x) => x.c && docMissing(x.c)) ? "warn" : "") +
        kpi("계약 미등록", list.filter((x) => x.s[2] === 9).length + "명", "계약 정보를 넣어 주세요", "#/center/master/contracts") +
      "</div>" +
      '<section class="a-card ct-tpl-card"><div class="a-card-head"><h2>두잉고 계약서 양식</h2><span class="a-muted">한 번 계약하면 계약 기간 동안 여는 모든 기수에 적용돼요 · 기수마다 다시 쓰지 않아요</span></div><div class="ct-tpl-grid">' +
        [["service", "두잉고 서비스 이용 계약서", "계약 기간 · 이용료 · 환불 · 두고클래스 판매 정산 · 해지"], ["privacy", "개인정보 처리업무 위탁 계약서", "수강생 개인정보 처리 위탁 (개인정보 보호법 제26조) · 재위탁 · 안전 조치"]].map((x) => '<div class="ct-tpl-item"><span class="ct-tpl-ic">' + icon("file", "sm") + "</span><div><b>" + x[1] + "</b><small>" + x[2] + '</small></div><a class="a-btn a-btn-sm" href="' + esc(window.DG_FORMS_FILES[x[0]]) + '" download>' + icon("download", "sm") + "Word 양식</a></div>").join("") +
      "</div><p class=\"a-muted p-small\">강사님 정보로 채운 계약서는 강사별 ‘계약 등록 · 수정’ 창의 ‘채워서 인쇄 · PDF’ 로 만들어요. 서명한 파일을 받으면 같은 창에서 올려 주세요.</p></section>" +
      '<section class="a-card"><div class="a-card-head"><h2>강사별 계약</h2><span class="a-muted">서류 4종: ' + DOCS.map((x) => x[1]).join(" · ") + "</span></div>" + '<div class="a-table-wrap"><table class="a-table ct-table"><thead><tr><th>강사</th><th>계약 기간</th><th>상태</th><th>이용료 기준</th><th>서류</th><th>담당자</th><th class="right"></th></tr></thead><tbody>' +
        list.map(({ ins, c, s }) => '<tr><td><span class="mc-dot" style="--c:' + insTheme(ins.id) + '"></span><b>' + esc(ins.displayName) + '</b><small class="a-memo">' + esc(ins.name) + "</small></td><td>" + (c && c.start ? fmtFull(c.start) + " ~ " + fmtFull(c.end) : '<span class="a-muted">-</span>') + "</td><td>" + pill(s[0], s[1]) + "</td><td><small>" + esc((c && c.feeNote) || "-") + "</small></td><td>" + docChips(c) + "</td><td>" + esc((c && c.contact) || "-") + (c && c.phone ? '<small class="a-memo">' + esc(c.phone) + "</small>" : "") + '</td><td class="right">' + btn(c ? "수정" : "계약 등록", "ct-edit", c ? "a-btn-ghost a-btn-sm" : "a-btn-primary a-btn-sm", ' data-id="' + esc(ins.id) + '"') + "</td></tr>").join("") +
        "</tbody></table></div></section>" +
      '<p class="a-muted p-small p-privacy">' + icon("lock", "xs") + " 서류 파일은 지금 이 브라우저에만 저장돼요(시안). 정식 반영 때 암호화된 서버 저장소로 옮겨요.</p>";
  }
  function contractForm(iid) {
    const ins = DB.instructor(iid), c = CONTRACTS()[iid] || { start: todayStr(), end: addDays(todayStr(), 364), feeNote: "기수마다 1인 수강료 × 1명분 (부가세 포함)", contact: ins.name, phone: "", email: "", memo: "", docs: {} };
    const fld = (id, label, val, attrs) => '<div class="a-field"><label for="ct-' + id + '">' + label + '</label><input class="a-input" id="ct-' + id + '" name="' + id + '" value="' + esc(val == null ? "" : val) + '"' + (attrs || "") + "></div>";
    openModal(ins.displayName + " 계약 · 서류",
      '<form id="ct-form" class="a-form" data-id="' + esc(iid) + '" novalidate>' +
        '<div class="a-form-row">' + fld("start", "계약 시작일", c.start, ' type="date"') + fld("end", "계약 종료일", c.end, ' type="date"') + "</div>" +
        fld("feeNote", "이용료 기준", c.feeNote, ' maxlength="80"') +
        '<div class="a-form-row">' + fld("contact", "담당자", c.contact, ' maxlength="20"') + fld("phone", "연락처", c.phone, ' maxlength="20" inputmode="tel"') + "</div>" +
        fld("email", "이메일 (세금계산서)", c.email, ' maxlength="80" type="email"') +
        '<div class="a-field"><label>서류</label><div class="ct-up">' + DOCS.map((x) => { const f = c.docs && c.docs[x[0]]; return '<div class="ct-up-row"><label class="a-check"><input type="checkbox" name="doc-' + x[0] + '"' + (f ? " checked" : "") + "><span>" + x[1] + "</span></label>" + (f ? '<small class="a-muted">' + (f.data ? '<a href="' + f.data + '" download="' + esc(f.name) + '">' + esc(f.name) + "</a>" : esc(f.name)) + " · " + esc(f.at || "") + "</small>" : '<small class="a-muted">미제출</small>') + '<input type="file" name="file-' + x[0] + '" accept=".pdf,.jpg,.jpeg,.png" aria-label="' + x[1] + ' 파일">' + (CT_FORM[x[0]] ? ctTplBtns(CT_FORM[x[0]], iid) : "") + "</div>"; }).join("") + '</div><small class="a-muted">파일을 올리면 자동으로 ‘받음’ 표시돼요. (2MB 이하 · PDF · 이미지) · 이용 계약서와 개인정보 처리 위탁 계약서는 한 번만 받으면 계약 기간 동안 여는 모든 기수(2기 · 3기 …)에 적용돼요.</small></div>' +
        '<div class="a-field"><label for="ct-memo">메모</label><textarea class="a-input" id="ct-memo" name="memo" rows="2" maxlength="500">' + esc(c.memo || "") + "</textarea></div>" +
        '<p class="a-error" id="ct-error"></p></form>',
      btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="ct-form">저장</button>', "md");
  }
  async function saveContract(f) {
    const err = document.getElementById("ct-error"), v = (k) => (f[k] ? f[k].value.trim() : ""), iid = f.dataset.id;
    if (!v("start") || !v("end")) { err.textContent = "계약 시작일과 종료일을 넣어 주세요."; return; }
    if (v("end") < v("start")) { err.textContent = "종료일이 시작일보다 빨라요."; return; }
    const cs = CONTRACTS(), old = cs[iid] || { docs: {} }, docs = Object.assign({}, old.docs || {});
    const read = (file) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ok(null); r.readAsDataURL(file); });
    for (const x of DOCS) {
      const file = f["file-" + x[0]] && f["file-" + x[0]].files[0];
      if (file) {
        if (file.size > 2 * 1024 * 1024) { err.textContent = x[1] + " 파일이 2MB를 넘어요."; return; }
        docs[x[0]] = { name: file.name, at: todayStr(), data: await read(file) };
      } else if (!f["doc-" + x[0]].checked) delete docs[x[0]];
      else if (!docs[x[0]]) docs[x[0]] = { name: x[1] + " (원본 확인)", at: todayStr() };
    }
    cs[iid] = { start: v("start"), end: v("end"), feeNote: v("feeNote"), contact: v("contact"), phone: v("phone"), email: v("email"), memo: v("memo"), docs };
    commit(insName(iid) + " 계약 · 서류 정보를 저장했어요.");
  }

  /* ---------- 5) 운영자 계정 · 활동 기록 ---------- */
  function pageMasterStaff() {
    const list = STAFF(), logs = DB.data.adminLog || [], f = ui.logWho || "all";
    const shown = logs.filter((l) => f === "all" || l.staffId === f), lp = pageSlice("log", shown, 10);
    const menuName = {}; masterNavRaw().concat(masterDcNavRaw()).forEach((g) => g[1].forEach((it) => { menuName[it[0]] = it[1]; }));
    return head("운영자 계정 · 활동 기록", "두잉고 운영을 함께하는 직원 계정을 만들고, 맡은 일에 맞게 메뉴 권한을 나눠요. 누가 언제 무엇을 바꿨는지 활동 기록이 자동으로 남아요.", btn(icon("userPlus", "sm") + "운영자 추가", "st-new", "a-btn-primary")) +
      '<section class="a-card"><div class="a-card-head"><h2>운영자</h2><span class="a-muted">' + (list.length + 1) + "명 · ‘마스터 · 파트너’ 탭에서 로그인해요</span></div>" + '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>이름</th><th>아이디</th><th>역할</th><th>열린 메뉴</th><th>최근 로그인</th><th>상태</th><th class="right"></th></tr></thead><tbody>' +
        '<tr class="st-owner"><td><span class="st-av ms">' + icon("shieldCheck", "xs") + "</span><b>최고 관리자</b></td><td><code>ADMIN</code></td><td>" + pill("최고 관리자", "info") + '</td><td><small class="a-muted">모든 메뉴 · 운영자 관리</small></td><td>-</td><td>' + pill("사용 중", "ok") + '</td><td class="right"></td></tr>' +
        list.map((st) => '<tr><td><span class="st-av">' + esc(st.name.slice(0, 1)) + "</span><b>" + esc(st.name) + "</b></td><td><code>" + esc(st.loginId) + "</code></td><td>" + esc(staffRoleName(st)) + '</td><td><span class="ct-docs">' + (st.perms || []).slice(0, 4).map((k) => '<span class="ct-doc on">' + esc(menuName[k] || k) + "</span>").join("") + ((st.perms || []).length > 4 ? '<span class="ct-doc">+' + ((st.perms || []).length - 4) + "</span>" : "") + "</span></td><td>" + (st.lastLoginAt ? fmtStamp(st.lastLoginAt) : "-") + "</td><td>" + pill(st.status === "active" ? "사용 중" : "중지", st.status === "active" ? "ok" : "mute") + '</td><td class="right">' + btn("수정", "st-edit", "a-btn-ghost a-btn-sm", ' data-id="' + esc(st.id) + '"') + btn(st.status === "active" ? "중지" : "재개", "st-toggle", "a-btn-text a-btn-sm", ' data-id="' + esc(st.id) + '"') + "</td></tr>").join("") +
        "</tbody></table></div></section>" +
      '<section class="a-card" data-pg-card="log"><div class="a-card-head"><h2>활동 기록</h2><select class="a-input a-sm cert-sel" data-log-who="1"><option value="all">모든 사람</option><option value="admin"' + (f === "admin" ? " selected" : "") + ">ADMIN</option>" + list.map((st) => '<option value="' + esc(st.id) + '"' + (f === st.id ? " selected" : "") + ">" + esc(st.name) + "</option>").join("") + "</select></div>" +
        (shown.length ? '<ol class="st-log">' + lp.items.map((l) => "<li><time>" + fmtStamp(l.at) + "</time><b>" + esc(l.who) + "</b><span>" + esc(l.msg) + "</span></li>").join("") + "</ol>" + numPager("log", lp) : emptyBox("activity", "아직 활동 기록이 없어요.")) + "</section>";
  }
  function staffForm(st) {
    const isNew = !st;
    st = st || { name: "", loginId: "", pw: "", role: "academic", perms: STAFF_ROLES.academic.perms.slice(), status: "active" };
    const fld = (id, label, val, attrs) => '<div class="a-field"><label for="sf-' + id + '">' + label + '</label><input class="a-input" id="sf-' + id + '" name="' + id + '" value="' + esc(val == null ? "" : val) + '"' + (attrs || "") + "></div>";
    const menus = masterNavRaw().concat(masterDcNavRaw().map((g) => [/DOOGO CLASS/.test(g[0]) ? g[0] : "DOOGO CLASS · " + g[0], g[1]])).map((g) => [g[0], g[1].filter((it) => it[0] !== "master" && it[0] !== "master/staff" && it[0] !== "master/data")]).filter((g) => g[1].length);
    openModal(isNew ? "운영자 추가" : st.name + " 운영자 수정",
      '<form id="st-form" class="a-form" data-id="' + esc(st.id || "") + '" novalidate>' +
        '<div class="a-form-row">' + fld("name", "이름", st.name, ' maxlength="20" placeholder="예: 김매니저"') + '<div class="a-field"><label for="sf-role">역할</label><select class="a-input" id="sf-role" name="role" data-st-role="1">' + Object.keys(STAFF_ROLES).map((k) => '<option value="' + k + '"' + (st.role === k ? " selected" : "") + ">" + STAFF_ROLES[k].label + "</option>").join("") + "</select></div></div>" +
        '<div class="a-form-row">' + fld("loginId", "로그인 아이디", st.loginId, ' maxlength="30" placeholder="예: manager"') + fld("pw", "비밀번호", st.pw, ' maxlength="40"') + "</div>" +
        '<div class="a-field"><label>열어 줄 메뉴</label><div class="st-perms">' + menus.map((g) => '<div class="st-perm-g"><b>' + esc(g[0]) + "</b>" + g[1].map((it) => '<label class="a-check"><input type="checkbox" name="perm" value="' + esc(it[0]) + '"' + ((st.perms || []).indexOf(it[0]) >= 0 ? " checked" : "") + "><span>" + esc(it[1]) + "</span></label>").join("") + "</div>").join("") + '</div><small class="a-muted">대시보드는 늘 보여요. ‘운영자 계정’ 메뉴는 최고 관리자만 써요.</small></div>' +
        '<p class="a-error" id="sf-error"></p></form>',
      (isNew ? "" : btn(icon("trash", "sm") + "삭제", "st-del", "a-btn-ghost danger", ' data-id="' + esc(st.id) + '"') + '<span class="a-spacer"></span>') +
      btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="st-form">' + (isNew ? "운영자 만들기" : "저장") + "</button>", "md");
  }
  function saveStaff(f) {
    const err = document.getElementById("sf-error"), v = (k) => (f[k] ? f[k].value.trim() : ""), id = f.dataset.id, old = id ? staffOf(id) : null;
    if (!v("name")) { err.textContent = "이름을 적어 주세요."; return; }
    if (!/^[A-Za-z0-9_.-]{3,30}$/.test(v("loginId"))) { err.textContent = "로그인 아이디는 영문 · 숫자 3자 이상으로 적어 주세요."; return; }
    if (v("loginId").toUpperCase() === "ADMIN" || STAFF().some((x) => x.id !== id && x.loginId.toLowerCase() === v("loginId").toLowerCase()) || affList().some((p) => String(p.loginId).toLowerCase() === v("loginId").toLowerCase())) { err.textContent = "이미 쓰는 아이디예요."; return; }
    if (v("pw").length < 4 || /\s/.test(v("pw"))) { err.textContent = "비밀번호는 띄어쓰기 없이 4자 이상으로 정해 주세요."; return; }
    const perms = Array.from(f.querySelectorAll('input[name="perm"]:checked')).map((c) => c.value);
    if (!perms.length) { err.textContent = "열어 줄 메뉴를 하나 이상 골라 주세요."; return; }
    const st = old || { id: DB.uid("st"), createdAt: todayStr(), status: "active" };
    Object.assign(st, { name: v("name"), loginId: v("loginId"), pw: v("pw"), role: v("role"), perms });
    if (!old) STAFF().push(st);
    commit((old ? "운영자 정보를 고쳤어요: " : "운영자를 추가했어요: ") + st.name + " (" + staffRoleName(st) + ")");
  }
  /* ================= 파트너센터 (영업 파트너 RS) =================
   * 파트너가 소개한 강사님이 두잉고에 기수 이용료를 입금하면 → 공급가액(부가세 제외) × RS% 가 파트너 수익으로 확정.
   * 매월 말 마감 → 다음 달 ‘지급일’에 지급. RS% · 지급일 · 파트너 계정 · 담당 강사는 모두 마스터 ‘파트너스 관리’에서 정한다.
   * 파트너 로그인: 아이디 + 비밀번호 (마스터가 정하고, 파트너센터에서 바꿀 수 있음)
   * 지금은 이 브라우저 저장(시안) — 서버 저장은 정식 반영 때 붙인다 */
  function AFF() {
    const d = DB.data;
    if (!d.affSettings) d.affSettings = { rs: 20, payDay: 10 };
    if (!d.affPayouts) d.affPayouts = {};
    if (!Array.isArray(d.affiliates)) {
      d.affiliates = [{ id: "aff-demo", name: "하지원", loginId: "partner", pw: "partner", phone: "010-0000-2186", code: "HAJIWON", rs: null, status: "active", bank: "국민은행", account: "000000-00-000000", holder: "하지원", memo: "예시 파트너 계정", createdAt: "2026-09-01",
        instructors: [{ iid: "logic", rs: 25, since: "2026-09-10" }, { iid: "choi", rs: null, since: "2026-09-20" }] }];
      // 예시 이용료 기록 (이 강사님들 기록이 없을 때만) — 입금 · 기수 오픈 흐름이 보이게
      const has = (iid) => DB.bills(iid).length > 0;
      const mk = (o) => DB.saveBill(Object.assign({ id: DB.uid("b"), kind: "next", by: "instructor", vat: "included", contactName: "", phone: "", email: "", demo: true }, o));
      if (!has("logic")) {
        mk({ instructorId: "logic", cohortName: "1기", startDate: "2026-10-08", fee: 1500000, requestedAt: Date.parse("2026-09-15T10:00:00"), paidAt: "2026-09-25", invoiceAt: "2026-09-26", cohortId: "lc1" });
        mk({ instructorId: "logic", cohortName: "2기", startDate: "2026-11-12", fee: 1500000, requestedAt: Date.parse("2026-10-14T10:00:00"), paidAt: "2026-10-20", invoiceAt: "2026-10-21" });
      }
      if (!has("choi")) {
        mk({ instructorId: "choi", cohortName: "1기", startDate: "2026-10-15", fee: 990000, requestedAt: Date.parse("2026-10-02T10:00:00"), paidAt: "2026-10-12", invoiceAt: "2026-10-13", cohortId: "cc1" });
        mk({ instructorId: "choi", cohortName: "2기", startDate: "2026-11-26", fee: 990000, requestedAt: Date.parse("2026-10-24T10:00:00") });
      }
      d.affPayouts["aff-demo:2026-09"] = { paidAt: "2026-10-10", by: "master" };
      DB.save();
    }
    seedAffInq();
    return d;
  }
  const affList = () => { const d = AFF(); const demo = d.affiliates.find((x) => x.id === "aff-demo"); if (demo && demo.pw === "2186" && !demo.pwChangedAt) { demo.pw = "partner"; DB.save(); } return d.affiliates; };
  const affOf = (id) => affList().find((x) => x.id === id) || null;
  const affMe = () => (S && S.role === "partner" ? affOf(S.partnerId) : null);
  const affDefRs = () => Number(AFF().affSettings.rs) || 0;
  const affLink = (p, iid) => (p.instructors || []).find((x) => x.iid === iid) || null;
  function affRate(p, iid) {
    const l = affLink(p, iid);
    if (l && l.rs !== null && l.rs !== undefined && l.rs !== "") return Number(l.rs) || 0;
    if (p.rs !== null && p.rs !== undefined && p.rs !== "") return Number(p.rs) || 0;
    return affDefRs();
  }
  // 토 · 일이면 다음 월요일 (공휴일은 지급 담당이 확인)
  function bizDay(ds) { const d = parseDate(ds); while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); return DB.date.toStr(d); }
  function affPayDate(month) { // 수익 확정 월 다음 달 지급일
    const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7)), ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
    const last = new Date(ny, nm, 0).getDate(), day = Math.min(last, Math.max(1, Number(AFF().affSettings.payDay) || 10));
    return bizDay(ny + "-" + String(nm).padStart(2, "0") + "-" + String(day).padStart(2, "0"));
  }
  const AFF_ST = { expected: ["입금 대기 · 예상", "mute"], scheduled: ["지급 예정", "info"], due: ["지급 대기", "warn"], done: ["지급 완료", "ok"] };
  /** 파트너 수익 줄 (소개한 강사의 이용료 기록마다 한 줄) */
  function affRows(p) {
    const today = todayStr();
    const since = (b) => { const l = affLink(p, b.instructorId); if (!l || !l.since) return true; const dt = b.paidAt || (b.requestedAt ? DB.date.toStr(new Date(b.requestedAt)) : today); return String(dt).slice(0, 10) >= l.since; };
    return DB.bills().filter((b) => !b.canceledAt && affLink(p, b.instructorId) && since(b)).map((b) => {
      const m = DB.billMoney(b), paid = !!b.paidAt;
      let rate = affRate(p, b.instructorId), amt = Math.round(m.supply * rate / 100), month = paid ? String(b.paidAt).slice(0, 7) : null, late = false;
      let po = paid ? AFF().affPayouts[p.id + ":" + month] : null;
      if (po && po.rows) { const fr = po.rows.find((x) => x.bid === b.id); if (fr) { rate = fr.rate; amt = fr.amt; } else { late = true; month = today.slice(0, 7) > month ? today.slice(0, 7) : month; po = AFF().affPayouts[p.id + ":" + month] || null; if (po && po.rows && !po.rows.some((x) => x.bid === b.id)) po = null; } }
      const payDate = paid ? affPayDate(month) : null;
      const status = !paid ? "expected" : po ? "done" : today < payDate ? "scheduled" : "due";
      return { b, m, rate, amt, month, payDate, po, status, late };
    }).sort((x, y) => String(y.b.paidAt || "9").localeCompare(String(x.b.paidAt || "9")) || (y.b.requestedAt || 0) - (x.b.requestedAt || 0));
  }
  function affMonths(p) { // 정산 월별 묶음
    const g = {};
    affRows(p).filter((x) => x.month).forEach((x) => { (g[x.month] = g[x.month] || { month: x.month, rows: [], total: 0, payDate: x.payDate, po: x.po }).rows.push(x); g[x.month].total += x.amt; });
    // 예전에 지급 완료한 달(금액 기록 없음)은 지금 금액으로 한 번 고정
    Object.keys(g).forEach((k) => { const po = g[k].po; if (po && !po.rows) { po.rows = g[k].rows.map((x) => ({ bid: x.b.id, rate: x.rate, amt: x.amt })); po.amount = g[k].total; DB.save(); } });
    return Object.keys(g).sort().reverse().map((k) => g[k]);
  }
  function affSum(p) {
    const rows = affRows(p), s = (f) => rows.filter(f).reduce((a, x) => a + x.amt, 0);
    const pend = rows.filter((x) => x.status === "scheduled" || x.status === "due");
    const nextDate = pend.map((x) => x.payDate).sort()[0] || null;
    const ym = todayStr().slice(0, 7);
    return { rows, paidOut: s((x) => x.status === "done"), pending: s((x) => x.status === "scheduled" || x.status === "due"), expected: s((x) => x.status === "expected"),
      thisMonth: s((x) => x.month === ym), total: s((x) => x.month), nextDate, nextAmt: s((x) => (x.status === "scheduled" || x.status === "due") && x.payDate === nextDate) };
  }
  const dLeft = (d) => { const n = Math.round((parseDate(d) - parseDate(todayStr())) / 864e5); return n > 0 ? "D-" + n : n === 0 ? "오늘" : n + "일 지남"; };
  const affInsCell = (iid) => { const x = DB.instructor(iid), b = ((DB.content(iid) || {}).brand) || {}; return '<span class="p-ins">' + (b.photo ? '<img src="' + esc(b.photo) + '" alt="">' : "<i>" + esc(((x || {}).displayName || "?").slice(0, 1)) + "</i>") + "<b>" + esc(x ? x.displayName : "삭제된 강사") + "</b></span>"; };
  const monthKo = (m) => Number(m.slice(5, 7)) + "월";
  /** 입점 문의 ↔ 파트너 (마스터가 직접 지정 > 추천 코드) */
  const affOfRef = (ref) => (ref ? affList().find((p) => [p.code, p.loginId].some((c) => c && String(c).toLowerCase() === String(ref).toLowerCase())) || null : null);
  function inqAff(q) { if (q.affId === "none") return null; return (q.affId && affOf(q.affId)) || affOfRef(q.ref); }
  const affInqs = (p) => DB.inquiries().filter((q) => { const a = inqAff(q); return a && a.id === p.id; });
  const inqUpdated = (q) => Math.max(q.at || 0, ...(q.log || []).map((e) => e.at), ...(q.thread || []).filter((m) => m.by === "master").map((m) => m.at));
  /** 마스터가 아직 안 읽은 파트너 메시지 */
  const msgUnreadM = (q) => (q.thread || []).filter((m) => m.by === "partner" && m.at > (q.mSeen || 0)).length;
  const masterInqAlerts = () => { const qs = DB.inquiries(); return { inq: qs.filter((x) => (x.status || "new") === "new").length, msg: qs.reduce((a, q) => a + msgUnreadM(q), 0), qs }; };
  const affInqNew = (p) => affInqs(p).filter((q) => inqUpdated(q) > (q.pSeen || 0)).length;
  const maskPhone = (v) => String(v || "").replace(/(\d{2,3})[-\s]?(\d{3,4})[-\s]?(\d{4})/, (m, a, b, c) => a + "-" + "*".repeat(b.length) + "-" + c) || "-";
  const maskMail = (v) => { const m = String(v || "").split("@"); return m.length === 2 ? m[0].slice(0, 2) + "***@" + m[1] : "-"; };
  /** 예시 입점 문의 (하지원 파트너 추천 링크로 들어온 3건) — 한 번만 */
  function seedAffInq() {
    const d = DB.data; if (d.affInqSeeded) return; d.affInqSeeded = true;
    const T = (s) => Date.parse(s);
    const ex = [
      { id: "inq-demo-1", name: "박서연", phone: "010-4821-7730", email: "seoyeon.park@example.com", where: "유튜브 (구독자 3.2만)", course: "왕초보 엑셀 · 업무 자동화 6주 과정. 직장인 대상, 한 기수 30명 정도 생각하고 있어요.", link: "https://youtube.com/@example", message: "하지원 님 소개로 문의드려요.", ref: "HAJIWON", status: "new", at: T("2026-10-25T14:20:00") },
      { id: "inq-demo-2", name: "이도윤", phone: "010-3302-1184", email: "doyoon@example.com", where: "오프라인 · 클래스101", course: "스마트스토어 상세페이지 실전반 (4주)", link: "", message: "", ref: "HAJIWON", status: "contact", at: T("2026-10-19T10:05:00"),
        log: [{ st: "contact", at: T("2026-10-21T16:30:00") }], memo: "10/21 통화 · 1인 수강료 39만 원 예정",
        thread: [{ by: "master", text: "10/21 강사님과 통화했어요. 다음 주 화요일(10/28)에 미팅 잡았어요.", at: T("2026-10-21T16:40:00") }, { by: "partner", name: "하지원", text: "감사합니다! 제가 강사님께 두잉고 소개 자료 미리 전달해 둘게요.", at: T("2026-10-21T18:02:00") }] },
      { id: "inq-demo-3", name: "초이", phone: "010-7715-0921", email: "choi.class@example.com", where: "인스타그램", course: "AI 그림 · 굿즈 만들기 클래스", link: "", message: "지원 님이 추천해 주셨어요!", ref: "HAJIWON", status: "done", iid: "choi", at: T("2026-09-08T11:00:00"),
        log: [{ st: "contact", at: T("2026-09-10T15:00:00") }, { st: "done", at: T("2026-09-18T17:20:00") }], doneAt: T("2026-09-18T17:20:00"), openedAt: T("2026-09-20T10:00:00"),
        thread: [{ by: "master", text: "초이 강사님과 계약 성사됐어요! 9/20에 플랫폼 열어 드렸고, 내 강사에 연결해 두었어요.", at: T("2026-09-18T17:25:00") }] }
    ];
    ex.forEach((x) => { if (!DB.inquiries().some((q) => q.id === x.id)) DB.saveInquiry(Object.assign({ memo: "", thread: [], log: [] }, x)); });
    DB.save();
  }
  const refUrl = (p) => ROUTE.abs("#/partner?ref=" + encodeURIComponent(p.code || p.loginId));

  /* ---------- 파트너 로그인 ---------- */
  function findPartnerLogin(id, pw) {
    const n = (v) => String(v || "").replace(/\s+/g, "").toLowerCase();
    return affList().find((p) => (n(p.loginId) === n(id) || n(p.name) === n(id)) && String(p.pw) === String(pw).trim()) || null;
  }
  function partnerSignIn(p, err) {
    if (p.status !== "active") { err.textContent = "사용이 중지된 파트너 계정이에요. 두잉고 담당자에게 문의해 주세요."; return; }
    S = { role: "partner", partnerId: p.id };
    DB.session.setAdmin(S); DB.store.remove("moonclass:after-login");
    p.lastLoginAt = Date.now(); DB.save();
    ROUTE.hash = "#/center/partner"; toast(p.name + " 파트너님, 환영합니다!");
  }
  const partnerNav = () => { const p = affMe(), ni = p ? affInqNew(p) : 0, nn = p ? affNoticeNew(p) : 0; return [
    ["파트너센터", [["partner", "대시보드", "grid"], ["partner/inquiries", "입점 문의", "handshake", ni || ""], ["partner/refer", "강사 추천하기", "userPlus"], ["partner/instructors", "내 강사", "users"]]],
    ["수익", [["partner/earnings", "수익 내역", "coins"], ["partner/payouts", "정산 · 지급", "calendar"]]],
    ["홍보 · 소식", [["partner/kit", "홍보 자료", "megaphone"], ["partner/notices", "공지사항", "inbox", nn || ""], ["partner/guide", "파트너 가이드", "help"]]],
    ["계정", [["partner/settings", "내 정보 · 비밀번호", "settings"]]]
  ]; };

  /* ---------- 파트너센터 화면 ---------- */
  function pagePartnerHome() {
    const p = affMe(), s = affSum(p), myRs = (p.rs !== null && p.rs !== undefined && p.rs !== "") ? Number(p.rs) : affDefRs();
    // 최근 6개월 막대
    const months = []; { const t = parseDate(todayStr()); for (let i = 5; i >= 0; i--) { const d = new Date(t.getFullYear(), t.getMonth() - i, 1); months.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")); } }
    const byM = {}; s.rows.forEach((x) => { if (x.month) byM[x.month] = (byM[x.month] || 0) + x.amt; });
    const max = Math.max(1, ...months.map((m) => byM[m] || 0));
    const steps = [["handshake", "강사님 소개", "추천 링크 · 코드로 연결"], ["store", "두잉고 입점", "상담 후 플랫폼 세팅"], ["coins", "기수 이용료 입금", "강사님이 다음 기수를 열면"], ["check", "내 수익 확정", "공급가액 × RS%"], ["calendar", "다음 달 " + AFF().affSettings.payDay + "일 지급", "등록한 계좌로 입금"]];
    const nt = affNoticeList()[0], ntNew = nt && nt.at > (p.noticeSeen || 0);
    return head("파트너센터", esc(p.name) + " 파트너님, 소개해 주신 강사님의 기수가 열릴 때마다 수익이 쌓여요.") +
      (nt ? '<a class="p-notice-bar' + (ntNew ? " new" : "") + '" href="#/center/partner/notices"><span class="p-notice-ic">' + icon("megaphone", "sm") + "</span>" + (ntNew ? '<i class="p-new">N</i>' : "") + "<b>" + esc(nt.title) + "</b><time>" + fmtFull(DB.date.toStr(new Date(nt.at))) + "</time>" + icon("chevRight", "sm") + "</a>" : "") +
      '<section class="p-hero"><span class="p-3d" aria-hidden="true"><i class="c1">%</i><i class="c2">₩</i><i class="c3"></i><i class="ring"></i></span><div class="p-hero-l"><span class="p-hero-k">' + icon("handshake", "sm") + "DOINGGO PARTNERS</span>" +
        '<h2>내 RS <b>' + myRs + '%</b></h2><p>소개한 강사님이 두잉고에 기수 이용료를 입금하면, <b>공급가액(부가세 제외)의 ' + myRs + "%</b>가 파트너님 수익이에요." + ((p.instructors || []).some((l) => l.rs !== null && l.rs !== undefined && l.rs !== "") ? " (강사님별로 다른 RS가 정해진 경우 그 비율로 계산돼요)" : "") + "</p></div>" +
        '<div class="p-hero-r"><small>내 추천 링크</small><div class="p-ref"><code>' + esc(refUrl(p)) + '</code>' + btn(icon("link", "sm") + "복사", "aff-copy", "a-btn-light a-btn-sm", ' data-v="' + esc(refUrl(p)) + '"') + '</div><span>추천 코드 <b>' + esc(p.code || p.loginId) + "</b> · 이 링크로 들어온 입점 문의는 파트너님 소개로 기록돼요.</span></div></section>" +
      '<div class="a-kpis">' +
        kpi("다음 지급 예정", won(s.nextAmt), s.nextDate ? fmtFull(s.nextDate) + " 지급 · " + dLeft(s.nextDate) : "예정된 지급이 없어요", "#/center/partner/payouts", s.nextAmt ? "ok" : "") +
        kpi("이번 달 확정 수익", won(s.thisMonth), todayStr().slice(5, 7).replace(/^0/, "") + "월 입금 확인분", "#/center/partner/earnings") +
        kpi("입금 대기 · 예상 수익", won(s.expected), "강사님 이용료 입금 전", "#/center/partner/earnings", s.expected ? "warn" : "") +
        kpi("누적 지급액", won(s.paidOut), "지금까지 받은 금액", "#/center/partner/payouts") +
      "</div>" +
      '<div class="p-grid">' +
        '<section class="a-card"><div class="a-card-head"><h2>월별 수익</h2><span class="a-muted">입금 확인 월 기준 · 최근 6개월</span></div><div class="p-bars">' +
          months.map((m) => '<div class="p-bar' + (m === todayStr().slice(0, 7) ? " now" : "") + '"><span class="p-bar-v">' + ((byM[m] || 0) ? won(byM[m]) : "") + '</span><i style="height:' + Math.max(3, Math.round((byM[m] || 0) / max * 100)) + '%"></i><b>' + monthKo(m) + "</b></div>").join("") + "</div></section>" +
        '<section class="a-card"><div class="a-card-head"><h2>내 강사</h2><a class="a-link" href="#/center/partner/instructors">전체 보기 ' + icon("arrowRight", "xs") + "</a></div>" +
          ((p.instructors || []).length ? '<ul class="p-mini">' + p.instructors.map((l) => { const rows = s.rows.filter((x) => x.b.instructorId === l.iid); return "<li>" + affInsCell(l.iid) + '<span class="p-mini-r"><em>RS ' + affRate(p, l.iid) + "%</em><b>" + won(rows.filter((x) => x.month).reduce((a, x) => a + x.amt, 0)) + "</b></span></li>"; }).join("") + "</ul>" : emptyBox("users", "아직 연결된 강사님이 없어요. 추천 링크로 강사님을 소개해 보세요.")) + "</section>" +
      "</div>" +
      affInqStrip(p) +
      '<section class="a-card"><div class="a-card-head"><h2>최근 수익</h2><a class="a-link" href="#/center/partner/earnings">전체 보기 ' + icon("arrowRight", "xs") + "</a></div>" + affTable(s.rows.slice(0, 5)) + "</section>" +
      '<section class="a-card p-how"><div class="a-card-head"><h2>RS 수익은 이렇게 만들어져요</h2></div><ol class="p-steps">' + steps.map((x, i) => '<li><span class="p-step-ic">' + icon(x[0], "sm") + "</span><em>STEP " + (i + 1) + "</em><b>" + x[1] + "</b><small>" + x[2] + "</small></li>").join("") + "</ol></section>";
  }
  function affInqStrip(p) {
    const qs = affInqs(p), c = (st) => qs.filter((q) => (q.status || "new") === st).length;
    return '<section class="a-card p-inq-strip"><div class="a-card-head"><h2>내 추천으로 들어온 입점 문의</h2><a class="a-link" href="#/center/partner/inquiries">전체 보기 ' + icon("arrowRight", "xs") + "</a></div>" +
      '<div class="p-funnel">' + [["들어온 문의", qs.length, ""], ["상담 중", c("new") + c("contact"), "info"], ["계약 성사", c("done"), "ok"], ["계약 미성사", c("fail"), "bad"], ["보류", c("hold"), "mute"]].map((x) => '<a href="#/center/partner/inquiries" class="' + x[2] + '"><small>' + x[0] + "</small><b>" + x[1] + "<em>건</em></b></a>").join("") + "</div>" +
      (qs.length ? '<ul class="p-inq-mini">' + qs.slice(0, 3).map((q) => { const st = inqStatus(q); return '<li><span class="a-avatar">' + esc((q.name || "?").slice(0, 1)) + "</span><b>" + esc(q.name) + (inqUpdated(q) > (q.pSeen || 0) ? '<i class="p-new">N</i>' : "") + "</b><small>" + esc(String(q.course || "").slice(0, 34)) + "</small>" + pill(st[1], st[2]) + "</li>"; }).join("") + "</ul>" : emptyBox("link", "아직 추천 링크로 들어온 입점 문의가 없어요. 위의 추천 링크를 강사님께 보내 보세요.")) + "</section>";
  }
  function pagePartnerInquiries() {
    const p = affMe(), qs = affInqs(p), c = (st) => qs.filter((q) => (q.status || "new") === st).length;
    const f = ui.pInqTab || "all", shown = qs.filter((q) => f === "all" || (f === "ing" ? ["new", "contact"].includes(q.status || "new") : (q.status || "new") === f));
    const tabs = [["all", "전체", qs.length], ["ing", "상담 중", c("new") + c("contact")], ["done", "계약 성사", c("done")], ["fail", "계약 미성사", c("fail")], ["hold", "보류", c("hold")]].map((t) => '<button type="button" class="a-tab' + (f === t[0] ? " on" : "") + '" data-action="p-inq-tab" data-k="' + t[0] + '">' + t[1] + ' <span class="num">' + t[2] + "</span></button>").join("");
    const card = (q) => {
      const st = inqStatus(q), fresh = inqUpdated(q) > (q.pSeen || 0), done = (q.status || "new") === "done";
      return '<article class="a-inq p-inq' + (done ? " is-done" : "") + '"><div class="a-inq-head"><span class="a-avatar">' + esc((q.name || "?").slice(0, 1)) + "</span><div><b>" + esc(q.name) + (fresh ? '<i class="p-new">N</i>' : "") + "</b><small>" + fmtStamp(q.at) + " 접수 · 추천 코드 " + esc(q.ref || p.code || "") + "</small></div>" + pill(st[1], st[2]) + "</div>" +
        (done ? '<div class="p-inq-done">' + icon("check", "sm") + "<div><b>계약이 성사됐어요!</b><span>" + (q.iid ? "‘내 강사’에 연결됐어요. 강사님이 기수 이용료를 입금하면 RS 수익이 생겨요." : "두잉고가 플랫폼을 준비하고 있어요. 열리면 ‘내 강사’에 연결돼요.") + "</span></div></div>" : "") +
        (q.status === "fail" ? '<div class="p-inq-fail">' + icon("x", "sm") + "<div><b>이번에는 계약이 성사되지 않았어요</b><span>" + (q.failAt ? fmtFull(DB.date.toStr(new Date(q.failAt))) + " · " : "") + "자세한 사유는 아래 1:1 대화로 물어봐 주세요. 다시 진행되면 상태가 바뀌어요.</span></div></div>" : "") +
        (q.status === "hold" ? '<div class="p-inq-hold">' + icon("alert", "sm") + "<span>지금은 보류된 문의예요. 자세한 내용은 아래 1:1 대화로 물어봐 주세요.</span></div>" : "") +
        inqTrack(q) +
        '<dl class="a-inq-info"><div><dt>연락처</dt><dd>' + esc(maskPhone(q.phone)) + "</dd></div><div><dt>이메일</dt><dd>" + esc(maskMail(q.email)) + "</dd></div><div><dt>강의 중인 곳</dt><dd>" + esc(q.where || "-") + "</dd></div><div><dt>강의 링크</dt><dd>" + esc(q.link || "-") + "</dd></div></dl>" +
        '<div class="a-inq-block"><b>어떤 강의인가요</b><p>' + esc(q.course || "") + "</p></div>" + (q.message ? '<div class="a-inq-block"><b>남긴 말</b><p>' + esc(q.message) + "</p></div>" : "") +
        inqThread(q, "partner") + "</article>";
    };
    // 이 화면을 열면 ‘새 소식’ 표시를 읽음으로
    setTimeout(() => { let ch = false; qs.forEach((q0) => { const q = findInq(q0.id); if (q && inqUpdated(q) > (q.pSeen || 0)) { q.pSeen = Date.now(); DB.saveInquiry(q); ch = true; } }); if (ch) { const n = document.querySelector('.a-nav[href="#/center/partner/inquiries"] .a-nav-num, .a-nav[href="#/center/partner/inquiries"] span + span'); if (n) n.remove(); } }, 1500);
    return head("입점 문의", "내 추천 링크 · 코드로 들어온 강사님 입점 문의예요. 상담과 계약은 두잉고가 진행하고, 진행 상황과 계약 성사 여부가 여기에 그대로 보여요.") +
      '<div class="a-kpis">' + kpi("들어온 문의", qs.length + "건", "내 추천 링크 · 코드", "#/center/partner/inquiries") + kpi("상담 중", c("new") + c("contact") + "건", "두잉고가 연락 · 미팅 중", "#/center/partner/inquiries", "") + kpi("계약 성사", c("done") + "건", qs.length ? "성사율 " + Math.round(c("done") / qs.length * 100) + "%" : "아직 없어요", "#/center/partner/inquiries", c("done") ? "ok" : "") + kpi("미성사 · 보류", c("fail") + c("hold") + "건", "계약 미성사 " + c("fail") + "건 · 보류 " + c("hold") + "건", "#/center/partner/inquiries") + "</div>" +
      '<section class="a-card"><div class="a-toolbar"><div class="a-tabs">' + tabs + "</div></div>" +
        (shown.length ? '<div class="a-stack">' + shown.map(card).join("") + "</div>" : emptyBox("handshake", qs.length ? "이 상태의 문의가 없어요." : "아직 추천 링크로 들어온 입점 문의가 없어요.", qs.length ? "" : btn(icon("link", "sm") + "내 추천 링크 복사", "aff-copy", "a-btn-primary a-btn-sm", ' data-v="' + esc(refUrl(p)) + '"'))) + "</section>" +
      '<p class="a-muted p-small p-privacy">' + icon("lock", "xs") + " 문의하신 강사님의 연락처 · 이메일은 개인정보 보호를 위해 일부만 보여요. 상담 · 계약은 두잉고 담당자가 진행해요.</p>";
  }
  function affTable(rows, full) {
    if (!rows.length) return emptyBox("coins", "아직 수익 내역이 없어요. 소개한 강사님이 기수 이용료를 입금하면 여기에 쌓여요.");
    return '<div class="a-table-wrap"><table class="a-table p-table"><thead><tr><th>입금 확인일</th><th>강사</th><th>기수</th><th class="num">이용료 (공급가액)</th><th class="num">RS</th><th class="num">내 수익</th><th>지급 예정일</th><th>상태</th></tr></thead><tbody>' +
      rows.map((x) => "<tr><td>" + (x.b.paidAt ? fmtFull(x.b.paidAt) : '<span class="a-muted">입금 전</span>') + "</td><td>" + affInsCell(x.b.instructorId) + "</td><td>" + esc(x.b.cohortName || "") + '</td><td class="num">' + won(x.m.supply) + '</td><td class="num">' + x.rate + '%</td><td class="num"><b class="p-amt">' + won(x.amt) + "</b></td><td>" +
        (x.payDate ? fmtFull(x.payDate) + (x.status === "scheduled" ? ' <small class="a-muted">' + dLeft(x.payDate) + "</small>" : "") : '<span class="a-muted">입금 확인 후 확정</span>') + "</td><td>" + pill(x.status === "done" && x.po ? "지급 완료 " + fmtMD(x.po.paidAt) : AFF_ST[x.status][0], AFF_ST[x.status][1]) + "</td></tr>").join("") +
      "</tbody></table></div>";
  }
  function pagePartnerInstructors() {
    const p = affMe(), rows = affRows(p);
    const st = (iid) => { const bs = DB.bills(iid).filter((b) => !b.canceledAt); return bs.some((b) => b.cohortId) ? pill("기수 운영 중", "ok") : bs.length ? pill("기수 신청 중", "info") : pill("입점 준비", "mute"); };
    return head("내 강사", "파트너님이 소개해서 두잉고에 입점한 강사님이에요. 강사님이 기수를 열 때마다 RS 수익이 생겨요.") +
      '<section class="a-card">' + ((p.instructors || []).length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>강사</th><th>연결일</th><th class="num">RS</th><th class="num">입금된 기수</th><th class="num">누적 이용료 (공급가액)</th><th class="num">내 누적 수익</th><th class="num">입금 대기 예상</th><th>상태</th></tr></thead><tbody>' +
        p.instructors.map((l) => { const r = rows.filter((x) => x.b.instructorId === l.iid), paid = r.filter((x) => x.month); return "<tr><td>" + affInsCell(l.iid) + "</td><td>" + (l.since ? fmtFull(l.since) : "-") + '</td><td class="num">' + affRate(p, l.iid) + '%</td><td class="num">' + paid.length + '개</td><td class="num">' + won(paid.reduce((a, x) => a + x.m.supply, 0)) + '</td><td class="num"><b class="p-amt">' + won(paid.reduce((a, x) => a + x.amt, 0)) + '</b></td><td class="num">' + won(r.filter((x) => !x.month).reduce((a, x) => a + x.amt, 0)) + "</td><td>" + st(l.iid) + "</td></tr>"; }).join("") +
        "</tbody></table></div>" : emptyBox("users", "아직 연결된 강사님이 없어요. 강사님 연결은 두잉고 담당자가 확인 후 등록해 드려요.")) + "</section>";
  }
  function pagePartnerEarnings() {
    const p = affMe(), rows = affRows(p), tab = ui.affTab || "all";
    const tabs = [["all", "전체"], ["scheduled", "지급 예정"], ["done", "지급 완료"], ["expected", "입금 대기"]];
    const pick = tab === "all" ? rows : tab === "scheduled" ? rows.filter((x) => x.status === "scheduled" || x.status === "due") : rows.filter((x) => x.status === tab);
    return head("수익 내역", "강사님 기수 이용료 한 건마다 한 줄이에요. 공급가액(부가세 제외) × RS% = 내 수익. 매월 말 마감 후 다음 달 " + AFF().affSettings.payDay + "일에 지급돼요.") +
      '<div class="a-tabs p-tabs">' + tabs.map((t) => '<button type="button" class="a-tab' + (tab === t[0] ? " on" : "") + '" data-action="aff-tab" data-k="' + t[0] + '">' + t[1] + ' <span class="num">' + (t[0] === "all" ? rows.length : t[0] === "scheduled" ? rows.filter((x) => x.status === "scheduled" || x.status === "due").length : rows.filter((x) => x.status === t[0]).length) + "</span></button>").join("") + "</div>" +
      '<section class="a-card">' + affTable(pick, true) + '<p class="a-muted p-foot">합계 <b>' + won(pick.reduce((a, x) => a + x.amt, 0)) + "</b> · 세금 처리(사업소득 3.3% 원천징수 등)는 지급 때 별도로 안내해 드려요.</p></section>";
  }
  function pagePartnerPayouts() {
    const p = affMe(), ms = affMonths(p);
    return head("정산 · 지급", "한 달 동안 확정된 수익을 모아 다음 달 " + AFF().affSettings.payDay + "일에 등록한 계좌로 보내 드려요.") +
      '<div class="p-grid p-grid-r">' +
        '<section class="a-card"><div class="a-card-head"><h2>월별 정산</h2></div>' + (ms.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>정산 월</th><th class="num">건수</th><th class="num">RS 수익</th><th class="num">실지급액</th><th>지급일</th><th>상태</th><th></th></tr></thead><tbody>' +
          ms.map((g) => { const st = g.po ? "done" : todayStr() < g.payDate ? "scheduled" : "due"; return "<tr><td><b>" + g.month.slice(0, 4) + "년 " + monthKo(g.month) + "</b> 확정분</td><td class=\"num\">" + g.rows.length + '건</td><td class="num">' + won(g.total) + '</td><td class="num"><b class="p-amt">' + won(affNet(p, g.total).net) + "</b>" + (affTaxKey(p) === "personal" ? '<small class="a-memo">3.3% 원천징수 후</small>' : "") + "</td><td>" + fmtFull(g.payDate) + (st === "scheduled" ? ' <small class="a-muted">' + dLeft(g.payDate) + "</small>" : "") + "</td><td>" + pill(st === "done" ? "지급 완료 " + fmtMD(g.po.paidAt) : AFF_ST[st][0], AFF_ST[st][1]) + '</td><td class="a-right">' + btn(icon("file", "sm") + "정산서", "aff-stmt", "a-btn-ghost a-btn-sm", ' data-m="' + g.month + '"') + "</td></tr>"; }).join("") +
          "</tbody></table></div>" : emptyBox("calendar", "아직 정산할 수익이 없어요.")) + "</section>" +
        '<section class="a-card p-bank"><div class="a-card-head"><h2>지급 받을 계좌</h2>' + btn(icon("pen", "sm") + "수정", "aff-go-settings", "a-btn-ghost a-btn-sm") + "</div>" +
          (p.account ? '<div class="p-bank-box"><small>' + esc(p.bank || "") + "</small><b>" + esc(p.account) + "</b><span>예금주 " + esc(p.holder || p.name) + "</span></div>" : emptyBox("coins", "지급 받을 계좌를 등록해 주세요.")) +
          '<div class="p-taxline">' + icon("file", "xs") + "정산 유형 <b>" + TAX[affTaxKey(p)].label + "</b></div>" +
          '<ul class="p-rules"><li>' + icon("check", "xs") + "매월 1일~말일 입금 확인분을 모아 정산해요</li><li>" + icon("check", "xs") + "지급일: 다음 달 " + AFF().affSettings.payDay + "일 (주말·공휴일이면 다음 영업일)</li><li>" + icon("check", "xs") + "강사님 이용료가 환불되면 그 RS도 함께 조정돼요</li></ul></section>" +
      "</div>";
  }
  function pagePartnerSettings() {
    const p = affMe();
    return head("내 정보 · 비밀번호", "로그인 아이디와 비밀번호를 확인하고, 비밀번호를 바꿀 수 있어요.") +
      '<div class="p-grid">' +
        '<section class="a-card"><div class="a-card-head"><h2>비밀번호 바꾸기</h2></div><form id="aff-pw-form" class="a-form" novalidate>' +
          '<div class="a-field"><label>아이디</label><input class="a-input" value="' + esc(p.loginId) + '" disabled></div>' +
          '<div class="a-field"><label for="ap-cur">지금 비밀번호</label><input class="a-input" id="ap-cur" name="cur" type="password" maxlength="40" autocomplete="current-password"></div>' +
          '<div class="a-form-row"><div class="a-field"><label for="ap-new">새 비밀번호 <small>(4자 이상)</small></label><input class="a-input" id="ap-new" name="nw" type="password" maxlength="40" autocomplete="new-password"></div>' +
          '<div class="a-field"><label for="ap-new2">새 비밀번호 확인</label><input class="a-input" id="ap-new2" name="nw2" type="password" maxlength="40" autocomplete="new-password"></div></div>' +
          '<p class="a-error" id="ap-error"></p><button class="a-btn a-btn-primary" type="submit">비밀번호 바꾸기</button></form></section>' +
        '<section class="a-card"><div class="a-card-head"><h2>지급 계좌 · 연락처</h2></div><form id="aff-bank-form" class="a-form" novalidate>' +
          '<div class="a-field"><label>이름</label><input class="a-input" value="' + esc(p.name) + '" disabled></div>' +
          '<div class="a-field"><label for="ab-phone">연락처</label><input class="a-input" id="ab-phone" name="phone" value="' + esc(p.phone || "") + '" inputmode="tel" maxlength="20"></div>' +
          '<div class="a-form-row"><div class="a-field"><label for="ab-bank">은행</label><input class="a-input" id="ab-bank" name="bank" value="' + esc(p.bank || "") + '" maxlength="20" placeholder="예: 국민은행"></div>' +
          '<div class="a-field"><label for="ab-holder">예금주</label><input class="a-input" id="ab-holder" name="holder" value="' + esc(p.holder || "") + '" maxlength="20"></div></div>' +
          '<div class="a-field"><label for="ab-acc">계좌번호</label><input class="a-input" id="ab-acc" name="account" value="' + esc(p.account || "") + '" inputmode="numeric" maxlength="30"></div>' +
          '<button class="a-btn a-btn-primary" type="submit">저장</button></form></section>' +
      "</div>";
  }
  /* ---------- 파트너센터 추가 메뉴: 강사 추천하기 · 홍보 자료 · 공지사항 · 파트너 가이드 · 정산서 ----------
   * 정산 유형: 개인(사업소득 3.3% 원천징수: 소득세 3% + 지방소득세 0.3%, 10원 미만 버림) / 사업자(세금계산서 발행, 원천징수 없음) */
  const TAX = { personal: { label: "개인 · 사업소득 3.3% 원천징수", short: "개인 (3.3%)" }, business: { label: "사업자 · 세금계산서 발행", short: "사업자 (세금계산서)" } };
  const affTaxKey = (p) => (p && p.taxType === "business" ? "business" : "personal");
  function affNet(p, amt) {
    if (affTaxKey(p) === "business") return { income: 0, local: 0, tax: 0, net: amt };
    const income = Math.floor(amt * 0.03 / 10) * 10, local = Math.floor(income * 0.1 / 10) * 10;
    return { income, local, tax: income + local, net: amt - income - local };
  }
  function AFFN() {
    const d = DB.data;
    if (!Array.isArray(d.affNotices)) {
      d.affNotices = [
        { id: "an-1", title: "11월 RS 지급일 안내", body: "10월에 입금 확인된 강사님 이용료의 RS는 11월 10일(화)에 등록하신 계좌로 지급돼요.\n‘내 정보’에서 지급 계좌를 한 번 더 확인해 주세요.", pinned: true, at: Date.parse("2026-10-26T10:00:00") },
        { id: "an-2", title: "‘강사 추천하기’ 메뉴가 생겼어요", body: "추천 링크를 보내기 어려운 강사님은 ‘강사 추천하기’에 직접 남겨 주세요. 파트너님 소개로 바로 기록되고, 진행 상황은 ‘입점 문의’에서 볼 수 있어요.", pinned: false, at: Date.parse("2026-10-20T09:00:00") },
        { id: "an-3", title: "홍보할 때 꼭 지켜 주세요", body: "‘무조건 수익 보장’ 같은 과장된 표현이나, 두잉고 공식 직원처럼 소개하는 것은 삼가 주세요. 문구가 필요하면 ‘홍보 자료’의 문구를 그대로 써 주세요.", pinned: false, at: Date.parse("2026-10-02T09:00:00") }
      ];
      DB.save();
    }
    return d.affNotices;
  }
  const affNoticeList = () => AFFN().slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.at - a.at);
  const affNoticeNew = (p) => (p ? AFFN().filter((n) => n.at > (p.noticeSeen || 0)).length : 0);

  /* 강사 추천하기: 파트너가 직접 강사님 정보를 남기면 ‘입점 문의’로 들어가요 (파트너 소개로 기록) */
  function pagePartnerRefer() {
    const p = affMe(), mine = affInqs(p).filter((q) => q.byPartner);
    const f = (id, label, attrs, req) => '<div class="a-field"><label for="pl-' + id + '">' + label + (req ? ' <b class="p-req">*</b>' : "") + '</label><input class="a-input" id="pl-' + id + '" name="' + id + '"' + (attrs || "") + "></div>";
    return head("강사 추천하기", "추천 링크를 보내기 어려운 강사님은 여기에 직접 남겨 주세요. 파트너님 소개로 바로 기록되고, 두잉고 담당자가 연락드려요.") +
      '<div class="p-grid p-grid-r">' +
        '<section class="a-card"><div class="a-card-head"><h2>강사님 정보</h2></div><form id="aff-lead-form" class="a-form" novalidate>' +
          '<div class="a-form-row">' + f("name", "강사님 성함", ' maxlength="30" placeholder="예: 김민지"', true) + f("phone", "연락처", ' inputmode="tel" maxlength="20" placeholder="010-0000-0000"', true) + "</div>" +
          '<div class="a-form-row">' + f("email", "이메일", ' type="email" maxlength="80" placeholder="(선택)"') + f("where", "지금 강의하는 곳", ' maxlength="80" placeholder="예: 유튜브 · 클래스101 · 오프라인"') + "</div>" +
          '<div class="a-field"><label for="pl-course">어떤 강의인가요 <b class="p-req">*</b></label><textarea class="a-input" id="pl-course" name="course" rows="3" maxlength="800" placeholder="강의 주제 · 대상 · 기간 · 예상 수강생 수 등"></textarea></div>' +
          f("link", "강의 페이지 · 채널 주소", ' maxlength="200" placeholder="https://"') +
          '<div class="a-field"><label for="pl-message">두잉고에 전할 말</label><textarea class="a-input" id="pl-message" name="message" rows="2" maxlength="500" placeholder="예: 다음 주 화요일 오후에 통화 가능하세요. 제가 직접 만나 본 강사님이에요."></textarea></div>' +
          '<label class="a-check p-consent"><input type="checkbox" name="agree"><span>강사님께 두잉고에 연락처를 전달하는 것에 대해 <b>동의를 받았어요</b> (필수)</span></label>' +
          '<p class="a-error" id="pl-error"></p><button class="a-btn a-btn-primary" type="submit">' + icon("send", "sm") + "추천 보내기</button></form></section>" +
        '<div class="a-stack">' +
          '<section class="a-card"><div class="a-card-head"><h2>추천하면 이렇게 진행돼요</h2></div><ol class="p-steps p-steps-v">' +
            [["send", "추천 접수", "파트너님 소개로 바로 기록"], ["headset", "두잉고 상담", "담당자가 강사님께 연락"], ["check", "계약 성사", "‘입점 문의’에 진행 상황 표시"], ["coins", "RS 수익", "기수 이용료 입금 시 확정"]].map((x, i) => '<li><span class="p-step-ic">' + icon(x[0], "sm") + "</span><em>STEP " + (i + 1) + "</em><b>" + x[1] + "</b><small>" + x[2] + "</small></li>").join("") + "</ol></section>" +
          '<section class="a-card"><div class="a-card-head"><h2>내가 직접 추천한 강사님</h2><a class="a-link" href="#/center/partner/inquiries">입점 문의 ' + icon("arrowRight", "xs") + "</a></div>" +
            (mine.length ? '<ul class="p-inq-mini">' + mine.slice(0, 5).map((q) => { const st = inqStatus(q); return '<li><span class="a-avatar">' + esc((q.name || "?").slice(0, 1)) + "</span><b>" + esc(q.name) + "</b><small>" + fmtStamp(q.at) + "</small>" + pill(st[1], st[2]) + "</li>"; }).join("") + "</ul>" : emptyBox("userPlus", "아직 직접 추천한 강사님이 없어요.")) + "</section>" +
        "</div>" +
      "</div>";
  }
  function saveAffLead(f) {
    const p = affMe(), err = document.getElementById("pl-error"), v = (k) => (f[k] ? f[k].value.trim() : "");
    if (!p) return;
    if (!v("name")) { err.textContent = "강사님 성함을 적어 주세요."; f.name.focus(); return; }
    if (!/^[0-9+\-() ]{8,}$/.test(v("phone"))) { err.textContent = "연락처를 숫자로 적어 주세요. (예: 010-0000-0000)"; f.phone.focus(); return; }
    if (v("email") && !EMAIL_RE.test(v("email"))) { err.textContent = "이메일 주소를 확인해 주세요."; f.email.focus(); return; }
    if (!v("course")) { err.textContent = "어떤 강의인지 적어 주세요."; f.course.focus(); return; }
    if (!f.agree.checked) { err.textContent = "강사님께 연락처 전달 동의를 받았는지 확인해 주세요."; return; }
    const np = (x) => String(x || "").replace(/\D/g, "");
    if (DB.inquiries().some((x) => np(x.phone) && np(x.phone) === np(v("phone")))) { err.textContent = "이미 두잉고에 문의가 들어온 연락처예요. 중복 추천은 받을 수 없어요. 궁금한 점은 1:1 대화로 물어봐 주세요."; return; }
    const q = { id: DB.uid("inq"), at: Date.now(), status: "new", memo: "", name: v("name"), phone: v("phone"), email: v("email"), where: v("where"), course: v("course"), link: v("link"), message: "", ref: p.code || p.loginId, affId: p.id, byPartner: true, log: [], thread: [], pSeen: Date.now() };
    if (v("message")) q.thread.push({ by: "partner", name: p.name, text: v("message"), at: Date.now() });
    DB.saveInquiry(q);
    ROUTE.hash = "#/center/partner/inquiries"; toast(q.name + " 강사님을 추천했어요. 두잉고 담당자가 연락드릴게요.");
  }

  /* 홍보 자료: 추천 링크 · QR · 문구 · 이미지 */
  function pagePartnerKit() {
    const p = affMe(), url = refUrl(p);
    const T = [
      ["message", "카카오톡 · 문자", "안녕하세요! 강의하고 계신 걸 강사님 이름으로 된 강의 플랫폼으로 운영해 보시면 어떨까 해서 연락드려요.\n\n‘두잉고’는 강의 소개 페이지 · 무료 강의 · 수강생 관리를 한 번에 만들어 주고, 기수마다 1인 수강료 1명분만 내면 돼요. (수강생 수와 상관없이 같아요)\n\n👉 " + url],
      ["camera", "인스타그램 · 블로그", "강의는 강사님이, 운영은 두잉고가 ✍️\n내 이름으로 된 강의 플랫폼 · 수강생 케어 · 무료 강의 페이지까지 한 번에.\n기수마다 1인 수강료 1명분이면 시작할 수 있어요.\n\n입점 문의 👉 " + url],
      ["mail", "이메일", "제목: 강사님 이름으로 운영하는 강의 플랫폼, 두잉고를 소개드려요\n\n안녕하세요, " + p.name + "입니다.\n강의를 운영하시면서 신청 · 과제 · 공지 관리에 시간을 많이 쓰고 계시다면 두잉고를 한번 살펴보세요.\n\n- 강사님 이름 · 색 · 커리큘럼으로 만드는 수강생 화면\n- 강의 소개 랜딩 · 무료 강의 페이지\n- 과제 검수 · 출석 · 수료증까지 한 곳에서\n- 이용료: 기수마다 1인 수강료 1명분 (수강생 수와 무관)\n\n아래 링크로 입점 문의를 남기시면 담당자가 연락드려요.\n" + url]
    ];
    setTimeout(drawAffQr, 0);
    return head("홍보 자료", "강사님께 두잉고를 소개할 때 쓰는 자료예요. 아래 링크 · QR · 문구로 들어온 입점 문의는 모두 파트너님 소개로 기록돼요.") +
      '<div class="p-grid p-grid-r">' +
        '<section class="a-card p-kit-link"><div class="a-card-head"><h2>내 추천 링크 · QR</h2></div>' +
          '<div class="p-kit-qr"><div id="p-qr" class="p-qr" aria-label="추천 링크 QR 코드"></div><div class="p-kit-qr-r"><small>추천 코드</small><b>' + esc(p.code || p.loginId) + '</b><div class="p-ref p-ref-light"><code>' + esc(url) + "</code>" + btn(icon("link", "sm") + "복사", "aff-copy", "a-btn-dark a-btn-sm", ' data-v="' + esc(url) + '"') + "</div>" +
          btn(icon("download", "sm") + "QR 이미지 저장", "aff-qr-dl", "a-btn-outline a-btn-sm") + '<p class="a-muted p-small">명함 · 인쇄물 · 오프라인 모임에서 QR을 보여 주세요.</p></div></div></section>' +
        '<section class="a-card"><div class="a-card-head"><h2>두잉고, 이렇게 소개해 주세요</h2></div><ul class="p-points">' +
          [["store", "강사님 이름으로 된 강의 플랫폼", "강사님 이름 · 색 · 커리큘럼으로 수강생 화면을 만들어요"], ["file", "강의 소개 · 무료 강의 페이지", "모집용 랜딩과 무료 강의 페이지를 함께 만들어요"], ["checks", "수강생 케어를 한 곳에서", "과제 검수 · 공지 · 1:1 요청 · 수료증까지"], ["coins", "이용료는 기수마다 1인 수강료 1명분", "수강생이 몇 명이든 같아요. 수강생은 무료"]].map((x) => '<li><span class="p-step-ic">' + icon(x[0], "sm") + "</span><div><b>" + x[1] + "</b><small>" + x[2] + "</small></div></li>").join("") + "</ul></section>" +
      "</div>" +
      '<section class="a-card"><div class="a-card-head"><h2>바로 쓰는 홍보 문구</h2><span class="a-muted">내 추천 링크가 들어가 있어요 · 복사해서 그대로 보내세요</span></div><div class="p-tpls">' +
        T.map((t, i) => '<div class="p-tpl"><div class="p-tpl-h"><span class="p-step-ic">' + icon(t[0], "sm") + "</span><b>" + t[1] + "</b>" + btn(icon("clipboard", "sm") + "복사", "aff-copy", "a-btn-outline a-btn-sm", ' data-v="' + esc(t[2]) + '" data-msg="문구를 복사했어요."') + '</div><textarea class="a-input" rows="9" readonly aria-label="' + t[1] + ' 문구">' + esc(t[2]) + "</textarea></div>").join("") + "</div></section>" +
      '<div class="p-grid">' +
        '<section class="a-card"><div class="a-card-head"><h2>이미지 자료</h2></div><div class="p-assets">' +
          '<a class="p-asset" href="assets/home/og-doinggo.jpg" download="doinggo-banner.jpg"><img src="assets/home/og-doinggo.jpg" alt="두잉고 소개 배너"><span>' + icon("download", "xs") + "소개 배너 (1200×630)</span></a>" +
          '<a class="p-asset p-asset-logo" href="assets/brand/doinggo-en.svg" download="doinggo-logo.svg"><img src="assets/brand/doinggo-en.svg" alt="doinggo 로고"><span>' + icon("download", "xs") + "doinggo 로고 (SVG)</span></a></div></section>" +
        '<section class="a-card"><div class="a-card-head"><h2>홍보할 때 지켜 주세요</h2></div><ul class="p-rules">' +
          ["‘무조건 수익 보장’ · ‘누구나 월 1,000만 원’ 같은 과장된 표현은 쓰지 않아요", "두잉고 직원 · 공식 대리점처럼 소개하지 않아요 (‘두잉고 파트너’로 소개해 주세요)", "강사님 연락처는 본인 동의를 받은 뒤에만 남겨 주세요", "이용료 · 계약 조건은 두잉고 담당자가 직접 안내해요"].map((x) => "<li>" + icon("check", "xs") + x + "</li>").join("") + "</ul></section>" +
      "</div>";
  }
  function drawAffQr() {
    const box = document.getElementById("p-qr"), p = affMe(); if (!box || !p) return;
    const draw = () => { try { const q = window.qrcode(0, "M"); q.addData(refUrl(p)); q.make(); box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); box.dataset.png = q.createDataURL(8, 4); } catch (e) { box.innerHTML = '<p class="a-muted p-small">QR을 만들지 못했어요.</p>'; } };
    if (window.qrcode) return draw();
    let s = document.getElementById("qr-lib");
    if (!s) { s = document.createElement("script"); s.id = "qr-lib"; s.src = "assets/vendor/qrcode.js"; document.head.appendChild(s); }
    s.addEventListener("load", draw, { once: true });
  }

  /* 공지사항 (두잉고 → 파트너) */
  function pagePartnerNotices() {
    const p = affMe(), list = affNoticeList(), seen = p.noticeSeen || 0;
    setTimeout(() => { const me = affMe(); if (me && affNoticeNew(me)) { me.noticeSeen = Date.now(); DB.save(); const n = document.querySelector('.a-nav[href="#/center/partner/notices"] span + span'); if (n) n.remove(); } }, 1200);
    return head("공지사항", "두잉고가 파트너님께 알려 드리는 소식이에요. 지급 일정 · 정책 변경 · 새 기능을 여기서 알려 드려요.") +
      '<section class="a-card">' + (list.length ? '<ul class="p-notices">' + list.map((n) => '<li class="' + (n.pinned ? "pin" : "") + '"><details' + (n.at > seen || n.pinned ? " open" : "") + "><summary>" + (n.pinned ? '<span class="a-pill dark">고정</span>' : "") + (n.at > seen ? '<i class="p-new">N</i>' : "") + "<b>" + esc(n.title) + "</b><time>" + fmtFull(DB.date.toStr(new Date(n.at))) + "</time>" + icon("chevDown", "sm") + '</summary><p>' + esc(n.body) + "</p></details></li>").join("") + "</ul>" : emptyBox("megaphone", "아직 공지가 없어요.")) + "</section>";
  }

  /* 파트너 가이드 · 자주 묻는 질문 */
  function pagePartnerGuide() {
    const p = affMe(), set = AFF().affSettings, rs = (p.rs !== null && p.rs !== undefined && p.rs !== "") ? Number(p.rs) : affDefRs();
    const fee = 990000, supply = Math.round(fee / 1.1), amt = Math.round(supply * rs / 100), n = affNet(p, amt);
    const faq = [
      ["추천은 언제 ‘내 소개’로 인정되나요?", "내 추천 링크(또는 추천 코드)로 들어와 입점 문의를 남기거나, ‘강사 추천하기’로 직접 등록하면 바로 파트너님 소개로 기록돼요. 같은 강사님을 다른 경로로 먼저 소개받은 경우에는 먼저 기록된 쪽이 인정돼요."],
      ["RS는 얼마 동안 받나요?", "연결된 강사님이 두잉고를 쓰는 동안, 기수 이용료가 입금될 때마다 계속 RS가 생겨요. (계약 조건이 따로 있으면 그 조건을 따라요)"],
      ["강사님이 환불하면 어떻게 되나요?", "강사님 이용료가 환불되면 그 건의 RS도 함께 취소돼요. 이미 지급했다면 다음 정산에서 빼고 지급해요."],
      ["세금은 어떻게 처리되나요?", "개인 파트너는 사업소득으로 3.3%(소득세 3% + 지방소득세 0.3%)를 떼고 지급해요. 사업자 파트너는 세금계산서를 발행해 주시면 원천징수 없이 지급해요. 정산 유형은 두잉고 담당자가 정해 드려요."],
      ["지급 계좌를 바꾸고 싶어요", "‘내 정보 · 비밀번호’에서 언제든 바꿀 수 있어요. 지급일 3일 전까지 바꾼 계좌로 지급돼요."],
      ["계약이 성사되지 않으면요?", "‘입점 문의’에 ‘계약 미성사’로 표시되고 RS는 생기지 않아요. 나중에 다시 진행되면 상태가 바뀌고 RS도 정상적으로 생겨요."]
    ];
    return head("파트너 가이드", "RS가 어떻게 계산되고 언제 지급되는지, 자주 묻는 질문을 모았어요.") +
      '<div class="p-grid">' +
        '<section class="a-card"><div class="a-card-head"><h2>RS 계산 예시</h2><span class="a-muted">내 RS ' + rs + "% 기준</span></div>" +
          '<div class="p-calc"><div><small>강사님 1인 수강료 (= 기수 이용료)</small><b>' + won(fee) + '</b></div><span>→</span><div><small>공급가액 (부가세 제외)</small><b>' + won(supply) + '</b></div><span>× ' + rs + '%</span><div class="hl"><small>내 RS 수익</small><b>' + won(amt) + "</b></div></div>" +
          (affTaxKey(p) === "personal" ? '<p class="a-muted p-small">개인 파트너는 3.3% (' + won(n.tax) + ")를 떼고 <b>" + won(n.net) + "</b>이 지급돼요.</p>" : '<p class="a-muted p-small">사업자 파트너는 세금계산서 발행 후 ' + won(amt) + "이 지급돼요.</p>") + "</section>" +
        '<section class="a-card"><div class="a-card-head"><h2>지급 일정</h2></div><ol class="p-steps p-steps-v">' +
          [["calendar", "매월 1일 ~ 말일", "강사님 이용료 입금 확인분을 모아요"], ["file", "다음 달 초", "정산서가 ‘정산 · 지급’에 올라와요"], ["coins", "다음 달 " + set.payDay + "일", "등록한 계좌로 지급 (주말 · 공휴일이면 다음 영업일)"]].map((x, i) => '<li><span class="p-step-ic">' + icon(x[0], "sm") + "</span><em>STEP " + (i + 1) + "</em><b>" + x[1] + "</b><small>" + x[2] + "</small></li>").join("") + "</ol></section>" +
      "</div>" +
      '<section class="a-card"><div class="a-card-head"><h2>자주 묻는 질문</h2></div><div class="p-faq">' + faq.map((x) => "<details><summary><b>" + esc(x[0]) + "</b>" + icon("chevDown", "sm") + "</summary><p>" + esc(x[1]) + "</p></details>").join("") + "</div></section>";
  }

  /* 정산서 (월별) — 인쇄 · PDF 저장 */
  function affStatement(p, month) {
    const g = affMonths(p).find((x) => x.month === month); if (!g) return;
    const n = affNet(p, g.total), personal = affTaxKey(p) === "personal";
    openModal(g.month.slice(0, 4) + "년 " + monthKo(g.month) + " RS 정산서",
      '<div class="p-stmt" id="p-stmt"><div class="p-stmt-h"><div>' + window.doogoClassLock("hm-lock-xs") + "<b>파트너 RS 정산서</b></div><span>발행 " + fmtFull(todayStr()) + "</span></div>" +
        '<dl class="p-stmt-info"><div><dt>파트너</dt><dd>' + esc(p.name) + " (" + esc(p.code || p.loginId) + ")</dd></div><div><dt>정산 기간</dt><dd>" + g.month + "-01 ~ " + g.month + "-" + String(new Date(Number(g.month.slice(0, 4)), Number(g.month.slice(5, 7)), 0).getDate()).padStart(2, "0") + "</dd></div><div><dt>정산 유형</dt><dd>" + TAX[affTaxKey(p)].label + "</dd></div><div><dt>지급일</dt><dd>" + fmtFull(g.payDate) + (g.po ? " (지급 완료)" : "") + "</dd></div><div><dt>지급 계좌</dt><dd>" + (p.account ? esc((p.bank || "") + " " + p.account + " · " + (p.holder || p.name)) : "미등록") + "</dd></div></dl>" +
        '<table class="a-table p-stmt-t"><thead><tr><th>강사</th><th>기수</th><th>입금일</th><th class="num">공급가액</th><th class="num">RS</th><th class="num">수익</th></tr></thead><tbody>' +
          g.rows.map((x) => "<tr><td>" + esc(insName(x.b.instructorId)) + "</td><td>" + esc(x.b.cohortName || "") + "</td><td>" + fmtFull(x.b.paidAt) + '</td><td class="num">' + won(x.m.supply) + '</td><td class="num">' + x.rate + '%</td><td class="num">' + won(x.amt) + "</td></tr>").join("") +
        "</tbody></table>" +
        '<dl class="p-stmt-sum"><div><dt>RS 수익 합계</dt><dd>' + won(g.total) + "</dd></div>" + (personal ? "<div><dt>소득세 (3%)</dt><dd>- " + won(n.income) + "</dd></div><div><dt>지방소득세 (0.3%)</dt><dd>- " + won(n.local) + "</dd></div>" : "<div><dt>세금계산서</dt><dd>발행 필요 (원천징수 없음)</dd></div>") + '<div class="tot"><dt>실지급액</dt><dd>' + won(n.net) + "</dd></div></dl>" +
        '<p class="p-stmt-foot">(주)두고홀딩스 · 두잉고 파트너스 · 문의는 파트너센터 ‘입점 문의’ 1:1 대화 또는 담당자에게 해 주세요.</p></div>',
      btn("닫기", "modal-close") + btn(icon("download", "sm") + "PDF로 내려받기", "stmt-print", "a-btn-primary"), "md");
  }

  /* 마스터: 파트너 공지 */
  function affNoticeForm(n) {
    const isNew = !n; n = n || { title: "", body: "", pinned: false };
    openModal(isNew ? "파트너 공지 쓰기" : "파트너 공지 수정",
      '<form id="an-form" class="a-form" data-id="' + esc(n.id || "") + '" novalidate><div class="a-field"><label for="an-title">제목</label><input class="a-input" id="an-title" name="title" maxlength="60" value="' + esc(n.title) + '"></div>' +
        '<div class="a-field"><label for="an-body">내용</label><textarea class="a-input" id="an-body" name="body" rows="6" maxlength="2000">' + esc(n.body) + "</textarea></div>" +
        '<label class="a-check"><input type="checkbox" name="pinned"' + (n.pinned ? " checked" : "") + "><span>맨 위에 고정</span></label><p class=\"a-error\" id=\"an-error\"></p></form>",
      btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="an-form">' + (isNew ? "공지 올리기" : "저장") + "</button>", "md");
  }
  function saveAffNotice(f) {
    const err = document.getElementById("an-error"), title = f.title.value.trim(), body = f.body.value.trim();
    if (!title) { err.textContent = "제목을 적어 주세요."; return; }
    if (!body) { err.textContent = "내용을 적어 주세요."; return; }
    const list = AFFN(), old = f.dataset.id ? list.find((x) => x.id === f.dataset.id) : null;
    if (old) Object.assign(old, { title, body, pinned: f.pinned.checked });
    else list.push({ id: DB.uid("an"), title, body, pinned: f.pinned.checked, at: Date.now() });
    commit(old ? "파트너 공지를 고쳤어요." : "파트너 공지를 올렸어요. 모든 파트너센터에 바로 보여요.");
  }
  const PPAGES = { "": pagePartnerHome, inquiries: pagePartnerInquiries, refer: pagePartnerRefer, kit: pagePartnerKit, notices: pagePartnerNotices, guide: pagePartnerGuide, instructors: pagePartnerInstructors, earnings: pagePartnerEarnings, payouts: pagePartnerPayouts, settings: pagePartnerSettings };
  function saveAffPw(f) {
    const p = affMe(), err = document.getElementById("ap-error"), cur = f.cur.value.trim(), nw = f.nw.value.trim();
    if (cur !== String(p.pw)) { err.textContent = "지금 비밀번호가 맞지 않아요."; return; }
    if (nw.length < 4 || nw.length > 40 || /\s/.test(nw)) { err.textContent = "새 비밀번호는 띄어쓰기 없이 4자 이상으로 정해 주세요."; return; }
    if (nw !== f.nw2.value.trim()) { err.textContent = "새 비밀번호 확인이 달라요."; return; }
    p.pw = nw; p.pwChangedAt = Date.now(); commit("비밀번호를 바꿨어요. 다음 로그인부터 새 비밀번호를 써 주세요.");
  }
  function saveAffBank(f) {
    const p = affMe(); ["phone", "bank", "holder", "account"].forEach((k) => { p[k] = f[k].value.trim(); }); commit("지급 계좌 · 연락처를 저장했어요.");
  }

  /* ---------- 마스터 · 파트너스 관리 ---------- */
  function pageMasterRS() {
    const list = affList(), set = AFF().affSettings;
    const all = list.map((p) => ({ p, s: affSum(p) }));
    const queue = [];
    list.forEach((p) => affMonths(p).forEach((g) => { if (!g.po) queue.push({ p, g }); }));
    queue.sort((a, b) => a.g.payDate.localeCompare(b.g.payDate));
    const refs = DB.inquiries().filter((q) => inqAff(q));
    return head("파트너스 관리", "영업 파트너 계정을 만들고, 소개한 강사님과 RS 비율을 정해요. 강사님 이용료 입금이 확인되면 공급가액 × RS%가 파트너 수익으로 자동 계산돼요.", btn(icon("plus", "sm") + "파트너 추가", "aff-new", "a-btn-primary")) +
      '<div class="a-kpis">' +
        kpi("활동 중인 파트너", list.filter((p) => p.status === "active").length + "명", "연결된 강사 " + list.reduce((a, p) => a + (p.instructors || []).length, 0) + "명", "#/center/master/rs") +
        kpi("지급할 금액 (세후)", won(queue.reduce((a, x) => a + affNet(x.p, x.g.total).net, 0)), queue.length ? "가장 빠른 지급일 " + fmtFull(queue[0].g.payDate) : "지급할 정산이 없어요", "#/center/master/rs", queue.some((x) => todayStr() >= x.g.payDate) ? "warn" : "") +
        kpi("입금 대기 예상 RS", won(all.reduce((a, x) => a + x.s.expected, 0)), "강사 이용료 입금 전", "#/center/master/rs") +
        kpi("누적 지급액", won(all.reduce((a, x) => a + x.s.paidOut, 0)), "지급 완료 처리한 금액", "#/center/master/rs") +
      "</div>" +
        '<section class="a-card"><div class="a-card-head"><h2>파트너</h2><span class="a-muted">' + list.length + "명</span></div>" + (list.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>파트너</th><th>아이디</th><th class="num">기본 RS</th><th>담당 강사 (RS)</th><th class="num">누적 수익</th><th class="num">미지급</th><th>상태</th><th></th></tr></thead><tbody>' +
          all.map(({ p, s }) => "<tr><td><b>" + esc(p.name) + "</b><br><small class=\"a-muted\">" + esc(p.phone || "") + "</small></td><td><code>" + esc(p.loginId) + '</code></td><td class="num">' + (p.rs !== null && p.rs !== undefined && p.rs !== "" ? p.rs + "%" : affDefRs() + '% <small class="a-muted">기본</small>') + "</td><td>" +
            ((p.instructors || []).map((l) => '<span class="p-chip">' + esc(insName(l.iid)) + " " + affRate(p, l.iid) + "%</span>").join("") || '<span class="a-muted">없음</span>') + '</td><td class="num">' + won(s.total) + '</td><td class="num"><b>' + won(s.pending) + "</b></td><td>" + pill(p.status === "active" ? "활동 중" : "중지", p.status === "active" ? "ok" : "mute") + '</td><td class="a-right">' +
            btn("수정", "aff-edit", "a-btn-ghost a-btn-sm", ' data-id="' + esc(p.id) + '"') + btn(p.status === "active" ? "중지" : "재개", "aff-toggle", "a-btn-text a-btn-sm", ' data-id="' + esc(p.id) + '"') + "</td></tr>").join("") +
          "</tbody></table></div>" : emptyBox("handshake", "아직 파트너가 없어요. ‘파트너 추가’로 첫 파트너를 만들어 보세요.")) + "</section>" +
      '<div class="p-grid p-grid-r">' +
        '<section class="a-card"><div class="a-card-head"><h2>지급 처리</h2><span class="a-muted">파트너에게 보낸 뒤 ‘지급 완료’를 눌러 주세요</span></div>' + (queue.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>파트너</th><th>정산 월</th><th class="num">건수</th><th class="num">RS 수익</th><th class="num">보낼 금액</th><th>지급일</th><th>지급 계좌</th><th></th></tr></thead><tbody>' +
        queue.map(({ p, g }) => "<tr><td><b>" + esc(p.name) + "</b></td><td>" + g.month.slice(0, 4) + "년 " + monthKo(g.month) + '</td><td class="num">' + g.rows.length + '건</td><td class="num">' + won(g.total) + '</td><td class="num"><b class="p-amt">' + won(affNet(p, g.total).net) + '</b><small class="a-memo">' + TAX[affTaxKey(p)].short + "</small></td><td>" + fmtFull(g.payDate) + ' <small class="a-muted">' + dLeft(g.payDate) + "</small></td><td>" + (p.account ? esc((p.bank || "") + " " + p.account + " (" + (p.holder || p.name) + ")") : '<span class="a-muted">계좌 미등록</span>') + '</td><td class="a-right">' + btn(icon("check", "sm") + "지급 완료", "aff-pay", "a-btn-primary a-btn-sm", ' data-id="' + esc(p.id) + '" data-m="' + g.month + '"') + "</td></tr>").join("") +
        "</tbody></table></div>" : emptyBox("check", "지급할 정산이 없어요.")) + "</section>" +
        '<section class="a-card"><div class="a-card-head"><h2>RS 기본 설정</h2></div><form id="aff-set-form" class="a-form" novalidate>' +
          '<div class="a-field"><label for="as-rs">기본 RS (%)</label><input class="a-input" id="as-rs" name="rs" type="number" min="0" max="100" step="0.5" value="' + esc(set.rs) + '"><small class="a-muted">파트너 · 강사님별로 따로 정하지 않으면 이 비율로 계산돼요.</small></div>' +
          '<div class="a-field"><label for="as-day">지급일 (매월)</label><input class="a-input" id="as-day" name="payDay" type="number" min="1" max="28" value="' + esc(set.payDay) + '"><small class="a-muted">한 달 동안 입금 확인된 이용료의 RS를 다음 달 이 날짜에 지급해요.</small></div>' +
          '<p class="a-muted p-small">계산 기준: 강사님 기수 이용료의 <b>공급가액(부가세 제외)</b> × RS%</p><button class="a-btn a-btn-primary" type="submit">저장</button></form></section>' +
      "</div>" +
      '<section class="a-card"><div class="a-card-head"><h2>파트너 공지</h2>' + btn(icon("plus", "sm") + "공지 쓰기", "an-new", "a-btn-outline a-btn-sm") + "</div>" + (AFFN().length ? '<ul class="a-items">' + affNoticeList().map((n) => '<li><div class="a-item-main"><b>' + esc(n.title) + "</b><small>" + fmtFull(DB.date.toStr(new Date(n.at))) + " · " + esc(n.body.slice(0, 70)) + "</small></div>" + (n.pinned ? pill("고정", "dark") : "") + '<div class="a-row-actions">' + btn("수정", "an-edit", "a-btn-ghost a-btn-sm", ' data-id="' + esc(n.id) + '"') + btn("삭제", "an-del", "a-btn-text a-btn-sm danger", ' data-id="' + esc(n.id) + '"') + "</div></li>").join("") + "</ul>" : emptyBox("megaphone", "아직 파트너 공지가 없어요.")) + "</section>" +
      '<section class="a-card"><div class="a-card-head"><h2>추천 링크로 들어온 입점 문의</h2><span class="a-muted">' + refs.length + "건</span></div>" + (refs.length ? '<ul class="p-refs">' + refs.map((q) => { const owner = inqAff(q), st = inqStatus(q); return "<li><b>" + esc(q.name || "문의") + "</b><span>" + esc(String(q.course || "").slice(0, 40)) + "</span><em>" + (owner ? esc(owner.name) + " 파트너 소개" : "코드 " + esc(q.ref)) + "</em>" + pill(st[1], st[2]) + "<small>" + fmtStamp(q.at) + '</small><a class="a-link" href="#/center/master/partners">보기</a></li>'; }).join("") + "</ul>" : emptyBox("link", "아직 추천 링크로 들어온 문의가 없어요.")) + "</section>";
  }
  function affForm(p) {
    const isNew = !p;
    p = p || { name: "", loginId: "", pw: "", phone: "", code: "", rs: "", status: "active", bank: "", account: "", holder: "", memo: "", instructors: [] };
    const taken = {}; affList().forEach((x) => { if (x.id !== p.id) (x.instructors || []).forEach((l) => { taken[l.iid] = x.name; }); });
    const fld = (id, label, val, attrs, help) => '<div class="a-field"><label for="af-' + id + '">' + label + '</label><input class="a-input" id="af-' + id + '" name="' + id + '" value="' + esc(val == null ? "" : val) + '"' + (attrs || "") + ">" + (help ? '<small class="a-muted">' + help + "</small>" : "") + "</div>";
    openModal(isNew ? "파트너 추가" : p.name + " 파트너 수정",
      '<form id="aff-form" class="a-form" data-id="' + esc(p.id || "") + '" novalidate>' +
        '<div class="a-form-row">' + fld("name", "이름", p.name, ' maxlength="20" placeholder="예: 하지원"') + fld("phone", "휴대폰", p.phone, ' inputmode="tel" maxlength="20" placeholder="010-0000-0000"') + "</div>" +
        '<div class="a-form-row">' + fld("loginId", "로그인 아이디", p.loginId, ' maxlength="30" placeholder="예: partner"') + fld("pw", "비밀번호", p.pw, ' maxlength="40" placeholder="예: partner"', "파트너가 파트너센터에서 바꿀 수 있어요") + "</div>" +
        '<div class="a-form-row">' + fld("code", "추천 코드", p.code, ' maxlength="20" placeholder="예: HAJIWON"', "추천 링크 끝에 붙어요") + fld("rs", "RS (%)", p.rs, ' type="number" min="0" max="100" step="0.5" placeholder="비우면 기본 ' + affDefRs() + '%"', "비우면 기본 RS를 따라가요") + "</div>" +
        '<div class="a-field"><label>담당 강사 · 강사별 RS</label><div class="p-pick">' + DB.data.instructors.map((x) => { const l = affLink(p, x.id); return '<div class="p-pick-row"><label class="p-pick-l"><input type="checkbox" name="ins" value="' + esc(x.id) + '"' + (l ? " checked" : "") + "><b>" + esc(x.displayName) + "</b>" + (taken[x.id] ? '<small class="a-muted">' + esc(taken[x.id]) + " 파트너 담당</small>" : "") + '</label><input class="a-input a-sm" name="rs-' + esc(x.id) + '" type="number" min="0" max="100" step="0.5" value="' + esc(l && l.rs != null ? l.rs : "") + '" placeholder="RS %"><input class="a-input a-sm" name="since-' + esc(x.id) + '" type="date" value="' + esc((l && l.since) || todayStr()) + '"></div>'; }).join("") + '</div><small class="a-muted">강사별 RS를 비우면 파트너 RS(또는 기본 RS)로 계산돼요. 한 강사님은 한 파트너에게만 연결돼요.</small></div>' +
        '<div class="a-form-row">' + fld("bank", "은행", p.bank, ' maxlength="20"') + fld("account", "계좌번호", p.account, ' maxlength="30" inputmode="numeric"') + fld("holder", "예금주", p.holder, ' maxlength="20"') + "</div>" +
        '<div class="a-field"><label for="af-tax">정산 유형</label><select class="a-input" id="af-tax" name="taxType">' + Object.keys(TAX).map((k) => '<option value="' + k + '"' + (affTaxKey(p) === k ? " selected" : "") + ">" + TAX[k].label + "</option>").join("") + '</select><small class="a-muted">개인은 지급할 때 3.3%를 떼고, 사업자는 세금계산서를 받고 전액 지급해요.</small></div>' +
        '<div class="a-field"><label for="af-memo">메모</label><textarea class="a-input" id="af-memo" name="memo" rows="2" maxlength="500">' + esc(p.memo || "") + "</textarea></div>" +
        '<p class="a-error" id="af-error"></p></form>',
      (isNew ? "" : btn(icon("trash", "sm") + "삭제", "aff-del", "a-btn-ghost danger", ' data-id="' + esc(p.id) + '"') + '<span class="a-spacer"></span>') +
      btn("취소", "modal-close") + '<button class="a-btn a-btn-primary" type="submit" form="aff-form">' + (isNew ? "파트너 만들기" : "저장") + "</button>", "md");
  }
  function saveAff(f) {
    const err = document.getElementById("af-error"), v = (k) => (f[k] ? f[k].value.trim() : "");
    const id = f.dataset.id, old = id ? affOf(id) : null;
    if (!v("name")) { err.textContent = "이름을 적어 주세요."; return; }
    if (!/^[A-Za-z0-9_.-]{3,30}$/.test(v("loginId"))) { err.textContent = "로그인 아이디는 영문 · 숫자 3자 이상으로 적어 주세요."; return; }
    if (v("pw").length < 4 || /\s/.test(v("pw"))) { err.textContent = "비밀번호는 띄어쓰기 없이 4자 이상으로 정해 주세요."; return; }
    if (affList().some((x) => x.id !== id && x.loginId.toLowerCase() === v("loginId").toLowerCase())) { err.textContent = "이미 쓰는 아이디예요."; return; }
    const rs = v("rs"); if (rs !== "" && !(Number(rs) >= 0 && Number(rs) <= 100)) { err.textContent = "RS는 0~100 사이로 적어 주세요."; return; }
    const picked = Array.from(f.querySelectorAll('input[name="ins"]:checked')).map((c) => c.value);
    const clash = picked.find((iid) => affList().some((x) => x.id !== id && affLink(x, iid)));
    if (clash) { err.textContent = insName(clash) + " 강사님은 이미 다른 파트너에게 연결돼 있어요."; return; }
    const p = old || { id: DB.uid("aff"), createdAt: todayStr(), status: "active" };
    Object.assign(p, { name: v("name"), phone: v("phone"), loginId: v("loginId"), pw: v("pw"), code: v("code") || v("loginId").toUpperCase(), rs: rs === "" ? null : Number(rs), bank: v("bank"), account: v("account"), holder: v("holder"), memo: v("memo"), taxType: v("taxType") === "business" ? "business" : "personal",
      instructors: picked.map((iid) => { const r = v("rs-" + iid); return { iid, rs: r === "" ? null : Number(r), since: v("since-" + iid) || todayStr() }; }) });
    if (!old) affList().push(p);
    commit(old ? "파트너 정보를 저장했어요." : p.name + " 파트너를 만들었어요. 아이디 " + p.loginId + " · 비밀번호 " + p.pw);
  }
  function saveAffSet(f) {
    const rs = Number(f.rs.value), day = Math.round(Number(f.payDay.value));
    if (!(rs >= 0 && rs <= 100)) { toast("기본 RS는 0~100 사이로 적어 주세요.", "warn"); return; }
    if (!(day >= 1 && day <= 28)) { toast("지급일은 1~28일 사이로 적어 주세요.", "warn"); return; }
    AFF().affSettings = { rs, payDay: day }; commit("RS 기본 설정을 저장했어요.");
  }
  function render() {
    closeModal();
    const r = route();
    S = DB.session.admin();
    if (S && S.role === "instructor" && (DB.instructor(S.instructorId) || {}).status !== "active") { S = null; DB.session.setAdmin(null); }
    if (S && S.role === "master" && S.staffId) { const st = staffOf(S.staffId); if (!st || st.status !== "active") { S = null; DB.session.setAdmin(null); } }
    if (S && S.role === "coach") { const ci = DB.instructor(S.instructorId), cc = DB.coach(S.instructorId, S.coachId); if (!ci || ci.status !== "active" || !cc || cc.status !== "active") { S = null; DB.session.setAdmin(null); } }
    if (S && S.actingAs && !DB.instructor(S.actingAs)) { S.actingAs = null; DB.session.setAdmin(S); }
    if (!S) {
      document.body.dataset.master = loginTab === "master" ? "1" : "";
      // 로그인 후 원래 가려던 화면(예: 무료강의 페이지 편집)으로 돌아간다
      if (r.parts[0] !== "login" && r.parts.length) DB.store.set("moonclass:after-login", ROUTE.hash);
      if (r.parts[0] !== "login") ROUTE.replace("#/center/login");
      renderLogin();
      return;
    }
    if (S.role === "partner") {
      const me = affOf(S.partnerId);
      if (!me || me.status !== "active") { S = null; DB.session.setAdmin(null); return render(); }
      if (r.parts[0] !== "partner") { ROUTE.replace("#/center/partner"); return render(); }
      document.body.dataset.master = ""; document.body.dataset.coach = "";
      renderShell(r);
      const pm = document.getElementById("a-main");
      pm.innerHTML = '<div class="a-page">' + (PPAGES[r.parts[1] || ""] || pagePartnerHome)(r) + "</div>";
      notifyPartnerSide(); ktInit();
      labelTables(pm);
      document.title = "파트너센터 · 두잉고";
      return;
    }
    if (r.parts[0] === "login") { ROUTE.replace(S.role === "master" && !S.actingAs ? "#/center/master" : "#/center"); return render(); }
    const master = S.role === "master" && !S.actingAs;
    if (master && r.parts[0] !== "master") { ROUTE.replace("#/center/master"); return render(); }
    if (master) { const k1 = r.parts[1] || ""; if (DC_ROUTES.indexOf(k1) >= 0) ui.mtab = "dc"; else ui.mtab = "dg"; if (k1 === "partners" && ui.inqFilter === "vod") ui.inqFilter = "all"; }
    if (!master && r.parts[0] === "master") { ROUTE.replace("#/center"); return render(); }
    if (master && r.parts[1] && (r.parts[1] === "staff" ? !!staffMe() : !staffCan("master/" + r.parts[1]))) { ROUTE.replace("#/center/master"); toast("이 메뉴는 내 운영자 계정에 열려 있지 않아요. 최고 관리자에게 요청해 주세요.", "warn"); return render(); }
    if (!master && !can(r.parts[0] || "")) { ROUTE.replace("#/center"); toast("이 메뉴는 코치 계정에 열려 있지 않아요. 필요하면 강사님께 요청해 주세요.", "warn"); return render(); }
    document.body.dataset.master = master ? "1" : "";
    if (isCoach()) coachListCheck();
    document.body.dataset.coach = isCoach() ? "1" : "";
    renderShell(r);
    const main = document.getElementById("a-main");
    const k0 = r.parts[0] || "", offTrack = !master && ((TRK() === "vod" && LIVE_ONLY_PAGES.indexOf(k0) >= 0) || (TRK() !== "vod" && VOD_ONLY_PAGES.indexOf(k0) >= 0));
    const fn = master ? (MPAGES[r.parts[1] || ""] || pageMasterHome) : offTrack ? trackOffPage : (PAGES[k0] || pageDashboard);
    main.innerHTML = '<div class="a-page">' + (!master && !offTrack && TRK() === "vod" && VP_PAGES.indexOf(k0) >= 0 ? vpidStrip() : "") + fn(r) + "</div>";
    labelTables(main); ktInit(main);
    if (window.VOD && VOD.hydrate) VOD.hydrate(main);
    if (master) { staffStrip(main); notifyBills(); notifyPartnerMsgs(); }
    vdurFill(master);
    document.title = (master ? "마스터" : isCoach() ? "코치센터" : "강사센터") + " · 두잉고";
  }
  /* 영상 길이 자동 채우기 — 고칠 수 있는 강의 중 영상은 있는데 실제 길이(durSec)가 없거나 영상이 바뀐 것은
   * 서버에서 실제 길이를 받아 조용히 저장해요 (분 칸도 맞춰요). 마스터: DOOGO CLASS 모든 클래스 ·
   * 강사 · 코치: 자기 VOD 클래스 + 두잉고 강의 · 다시보기 · 응원 영상 · 영상 자료 */
  let vdurT = 0;
  function vdurFill(master) {
    if (!DB.remote.on) return;
    // 저장만 하고 다시 그리지 않아요 (열린 창 · 입력 중인 칸이 닫히지 않게) — 화면의 길이 글자는 DB.vdur 가 바로 바꿔요
    const X = window.VOD, later = () => { clearTimeout(vdurT); vdurT = setTimeout(() => DB.save(), 600); };
    if (X && (master || !isCoach() || can("vodlessons"))) DB.vdur.fill(VD().products.filter((p) => master || p.iid === IID()).flatMap((p) => X.lessons(p)), (l) => l.video, later, (l, sec) => { l.min = Math.max(1, Math.round(sec / 60)); });
    if (master || (isCoach() && !can("curriculum"))) return;
    const c = C(); if (!c) return;
    const weeks = (c.weeks || []).concat((c.curricula || []).flatMap((cu) => cu.weeks || []));
    DB.vdur.fill(weeks.flatMap((w) => w.lessons || []), (l) => l.youtubeId, later, (l, sec) => { l.minutes = Math.max(1, Math.round(sec / 60)); });
    DB.vdur.fill((c.replays || []).concat(c.motivation || []), (x) => x.youtubeId, later, (x, sec) => { x.minutes = DB.vdur.fmt(sec); });
    DB.vdur.fill(["vod", "senior"].flatMap((k) => ((c.resources || {})[k] || [])), (x) => x.youtubeId, later);
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
    if (TRK() === "vod") { DB.session.setStudent({ preview: true, track: "vod", by: isCoach() ? "coach" : "instructor", instructorId: iid, cohortId: DB.vodCohortId(iid), vpid: VPID(), at: Date.now() }); ROUTE.hash = "#/home"; return; }
    const co = DB.cohort(cohortId) || DB.currentCohort(iid);
    if (!co) { toast("기수를 먼저 만들어 주세요.", "warn"); return; }
    DB.session.setStudent({ preview: true, by: isCoach() ? "coach" : "instructor", instructorId: iid, cohortId: co.id, at: Date.now() });
    ROUTE.hash = "#/home";
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
      case "coach-go": coachGo(d.iid, a); break;
      case "coach-switch": coachSwitchOpen(); break;
      case "aff-new": affForm(); break;
      case "aff-edit": affForm(affOf(d.id)); break;
      case "aff-del": {
        const p = affOf(d.id); if (!p) break;
        // 정산(RS) 기록이 있는 파트너는 지우면 지급 내역이 사라지므로 ‘중지’만 — 기록이 없을 때만 지움
        const paid = Object.keys(AFF().affPayouts || {}).some((k) => k.indexOf(p.id + ":") === 0), rs = affMonths(p).some((g) => g.total > 0);
        if (paid || rs) { confirmModal("파트너 삭제", esc(p.name) + " 파트너는 RS 정산 기록이 있어 지울 수 없어요.<br>더 이상 쓰지 않으면 ‘중지’해 주세요. 로그인이 막히고 기록은 그대로 남아요.", p.status === "active" ? "중지하기" : "닫기", false, () => { if (p.status === "active") { p.status = "stopped"; commit(p.name + " 파트너를 중지했어요. 로그인할 수 없게 돼요."); } else closeModal(); }); break; }
        confirmModal("파트너 삭제", esc(p.name) + " 파트너 계정을 지울까요?<br>바로 로그인할 수 없게 되고, 담당 강사 연결도 풀려요.", "삭제", true, () => { const L = affList(), i = L.findIndex((x) => x.id === p.id); if (i >= 0) L.splice(i, 1); commit(p.name + " 파트너를 지웠어요."); });
        break;
      }
      case "aff-toggle": { const p = affOf(d.id); if (!p) break; const go = () => { p.status = p.status === "active" ? "stopped" : "active"; commit(p.name + (p.status === "active" ? " 파트너를 다시 활성화했어요." : " 파트너를 중지했어요. 로그인할 수 없게 돼요.")); }; if (p.status === "active") confirmModal("파트너 중지", esc(p.name) + " 파트너를 중지할까요? 바로 로그인할 수 없게 되고, 이미 생긴 RS는 그대로 지급해요.", "중지", true, go); else go(); break; }
      case "aff-pay": { const p = affOf(d.id); if (!p) break; const g = affMonths(p).find((x) => x.month === d.m); const nt = affNet(p, g ? g.total : 0); confirmModal("지급 완료 처리", esc(p.name) + " 파트너 · " + esc(d.m.slice(0, 4) + "년 " + Number(d.m.slice(5, 7)) + "월") + " 확정분<br>RS " + won(g ? g.total : 0) + (nt.tax ? " − 원천징수 3.3% " + won(nt.tax) : "") + " = <b>보낼 금액 " + won(nt.net) + "</b><br>보냈나요? 지급 완료로 기록하면 이 달 금액이 고정되고, 파트너센터에도 ‘지급 완료’로 보여요.", "지급 완료", false, () => { AFF().affPayouts[p.id + ":" + d.m] = { paidAt: todayStr(), by: "master", amount: g ? g.total : 0, net: nt.net, tax: nt.tax, rows: g ? g.rows.map((x) => ({ bid: x.b.id, rate: x.rate, amt: x.amt })) : [] }; commit("지급 완료로 기록했어요. 이 달 RS 금액이 고정됐어요."); }); break; }
      case "aff-unpay": { const p = affOf(d.id); if (!p) break; confirmModal("지급 완료 취소", esc(p.name) + " 파트너 " + esc(d.m) + " 지급 완료 기록을 취소할까요? (실제로 보내지 않았을 때)", "취소하기", true, () => { delete AFF().affPayouts[p.id + ":" + d.m]; commit("지급 완료 기록을 취소했어요."); }); break; }
      case "aff-tab": ui.affTab = d.k; render(); break;
      case "aff-stmt": { const p = affMe(); if (p) affStatement(p, d.m); break; }
      case "stmt-print": { const el = document.querySelector(".a-modal-body") || document.querySelector(".a-modal"), tt = ((document.querySelector(".a-modal-head h2, .a-modal h2") || {}).textContent || "정산 명세서").trim(); if (window.DGFILE && el) window.DGFILE.pdfBtn(a, el, tt.replace(/[\\/:*?"<>|\s]+/g, "-") + ".pdf", { width: 760, title: tt }, (msg) => toast(msg)); break; }
      case "aff-qr-dl": { const box = document.getElementById("p-qr"); if (!box || !box.dataset.png) { toast("QR을 만드는 중이에요. 잠시 후 다시 눌러 주세요.", "warn"); break; } const l = document.createElement("a"); l.href = box.dataset.png; l.download = "doinggo-qr-" + ((affMe() || {}).code || "partner") + ".gif"; document.body.appendChild(l); l.click(); l.remove(); toast("QR 이미지를 저장했어요."); break; }
      case "an-new": affNoticeForm(); break;
      case "an-edit": affNoticeForm(AFFN().find((x) => x.id === d.id)); break;
      case "an-del": { const list = AFFN(), i = list.findIndex((x) => x.id === d.id); if (i < 0) break; confirmModal("파트너 공지 삭제", "‘" + esc(list[i].title) + "’ 공지를 삭제할까요?", "삭제", true, () => { list.splice(i, 1); commit("파트너 공지를 삭제했어요."); }); break; }
      case "aff-copy": { const ok = () => toast(d.msg || "추천 링크를 복사했어요."), no = () => toast("복사하지 못했어요. 링크를 길게 눌러 복사해 주세요.", "warn"); if (navigator.clipboard) navigator.clipboard.writeText(d.v).then(ok, no); else no(); break; }
      case "p-inq-tab": ui.pInqTab = d.k; render(); break;
      case "bell-go": e.preventDefault(); if (masterInqAlerts().msg) ui.inqFilter = "msg"; ROUTE.hash = "#/center/master/partners"; render(); break;
      case "inq-jump": { const el = document.querySelector('.a-inq[data-inq="' + d.id + '"]'); if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1600); const ta = el.querySelector("[data-inq-say]"); if (ta) setTimeout(() => { ktInit(el); ta.focus({ preventScroll: true }); }, 500); } break; }
      case "cal-m": { const t = todayStr().slice(0, 7); if (d.dir === "0") ui.calMonth = t; else { const cur = ui.calMonth || t, y = Number(cur.slice(0, 4)), m = Number(cur.slice(5, 7)) - 1 + Number(d.dir), dt = new Date(y, m, 1); ui.calMonth = dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0"); } render(); break; }
      case "cert-co": ui.certCo = d.k; render(); setTimeout(() => { const el = document.querySelector("[data-cert-co]"); if (el) el.closest(".a-card").scrollIntoView({ behavior: "smooth", block: "start" }); }, 30); break;
      case "cert-check": { const q = document.getElementById("cert-q"); ui.certQ = q ? q.value.trim() : ""; render(); break; }
      case "ct-edit": contractForm(d.id); break;
      case "ct-print": ctPrint(d.k, d.id); break;
      case "st-new": staffForm(); break;
      case "st-edit": staffForm(staffOf(d.id)); break;
      case "st-del": { const st = staffOf(d.id); if (!st) break; confirmModal("운영자 삭제", esc(st.name) + " 운영자 계정을 지울까요?<br>바로 로그인할 수 없게 되고, 지금까지의 활동 기록은 그대로 남아요.", "삭제", true, () => { const L = STAFF(), i = L.findIndex((x) => x.id === st.id); if (i >= 0) L.splice(i, 1); commit(st.name + " 운영자 계정을 지웠어요."); }); break; }
      case "st-toggle": { const st = staffOf(d.id); if (!st) break; st.status = st.status === "active" ? "stopped" : "active"; commit(st.name + " 운영자 계정을 " + (st.status === "active" ? "다시 열었어요." : "중지했어요.")); break; }
      case "sw-page": {
        const w = a.closest(".a-sw-wrap"); if (!w) break;
        const n = Number(w.dataset.pages), p = d.to !== undefined ? Number(d.to) : Math.min(n - 1, Math.max(0, Number(w.dataset.page) + Number(d.dir)));
        w.dataset.page = p; w.querySelector(".a-sw-track").style.transform = "translateX(-" + p * 100 + "%)";
        w.querySelectorAll(".a-sw-page").forEach((x, i) => (i === p ? x.removeAttribute("aria-hidden") : x.setAttribute("aria-hidden", "true")));
        w.querySelectorAll(".a-sw-dots button").forEach((x, i) => x.classList.toggle("on", i === p));
        w.querySelector(".a-sw-count b").textContent = p + 1;
        const ar = w.querySelectorAll(".a-sw-arrow"); ar[0].disabled = p === 0; ar[1].disabled = p === n - 1;
        break;
      }
      case "inq-say": {
        const x = findInq(d.id), ta = document.querySelector('[data-inq-say="' + d.id + '"]'); if (!x || !ta) break;
        const text = ta.value.trim(); if (!text) { toast("보낼 내용을 적어 주세요.", "warn"); ta.focus(); break; }
        const partner = S.role === "partner", me = partner ? affMe() : null;
        if (partner && (!me || !inqAff(x) || inqAff(x).id !== me.id)) break;
        (x.thread = x.thread || []).push({ by: partner ? "partner" : "master", name: partner ? me.name : "두잉고", text, at: Date.now() });
        if (partner) x.pSeen = Date.now(); else x.mSeen = Date.now();
        if (!partner) actLog(x.name + " 님 문의 · " + (inqAff(x) ? inqAff(x).name + " 파트너에게" : "파트너에게") + " 메시지를 보냈어요.");
        DB.saveInquiry(x);
        const box = document.querySelector('.kt[data-kt="' + x.id + '"]');
        if (!box) { render(); break; }
        const tmp = document.createElement("div"); tmp.innerHTML = inqThread(x, partner ? "partner" : "master");
        const nb = tmp.firstElementChild; box.replaceWith(nb); ktInit(nb.parentNode);
        const nta = nb.querySelector("textarea"); if (nta) nta.focus({ preventScroll: true });
        if (!partner) { const card = nb.closest(".a-inq"); if (card) { card.classList.remove("has-msg"); card.removeAttribute("data-unread"); const pl = card.querySelector(".inq-new-msg"); if (pl) pl.remove(); } if (!masterInqAlerts().msg) { const ab = document.querySelector(".inq-alert"); if (ab) ab.remove(); } refreshInqBadges(); }
        break;
      }
      case "kt-down": { const l = a.closest(".kt").querySelector(".kt-list"); l.scrollTo({ top: l.scrollHeight, behavior: "smooth" }); break; }
      case "aff-go-settings": ROUTE.hash = "#/center/partner/settings"; break;
      case "toggle-nav": document.getElementById("a-app").classList.toggle("nav-open"); break;
      case "modal-close": closeModal(); break;
      case "modal-bg": if (e.target === a) closeModal(); break;
      case "confirm-ok": { const fn = confirmFn; confirmFn = null; if (fn) fn(); break; }
      case "preview": openPreview(d.cohort); break;
      case "vp-go": setVpid(d.id); ROUTE.hash = "#/center/menus"; toast("‘" + ((vdP(d.id) || {}).title || "") + "’ 강의실을 꾸며요."); break;
      case "trk": {
        const k = d.k === "vod" ? "vod" : "live"; ui.track = k; ui.trackKey = trkKey(); try { sessionStorage.setItem(trkKey(), k); } catch (e2) { /* 저장 못 해도 이번 화면에서는 바뀐다 */ }
        const k0 = route().parts[0] || "", off = (k === "vod" && LIVE_ONLY_PAGES.indexOf(k0) >= 0) || (k !== "vod" && VOD_ONLY_PAGES.indexOf(k0) >= 0);
        if (off && !d.stay) ROUTE.hash = "#/center"; else render();
        toast(k === "vod" ? "DOOGO CLASS 영역이에요. VOD 판매 · 정산 · VOD 수강생 강의실을 관리해요." : "두잉고 영역이에요. 기수 · 수강생 · 과제를 관리해요.");
        break;
      }
      case "vs-f": ui.vsF = d.k; render(); break;
      case "mtab": { const k = d.k === "dc" ? "dc" : "dg"; ui.mtab = k; ROUTE.hash = k === "dc" ? "#/center/master/dc" : "#/center/master"; break; }
      case "vd-iqf": ui.vdIqF = d.k; render(); break;
      case "store-split": e.preventDefault(); storeSplit(d.href); break;
      case "dg-split": e.preventDefault(); dgSplit(d.t); break;
      case "split-close": splitClose(); break;
      case "split-reload": { const fr = document.getElementById("a-split-f"); if (fr) { try { fr.contentWindow.location.reload(); } catch (e2) { fr.src = fr.src; } } break; }
      case "vs-t": ui.vsT = d.k; render(); break;
      case "vs-pause": { const st = DB.student(d.id); if (!st) break; const stop = st.status !== "withdrawn"; confirmModal(stop ? "두잉고 이용 멈춤" : "두잉고 이용 다시 열기", esc(st.name) + " 님의 VOD 버전 두잉고 이용을 " + (stop ? "멈출까요?<br>DOOGO CLASS 강의 시청은 그대로 할 수 있어요." : "다시 열까요?"), stop ? "멈추기" : "다시 열기", stop, () => { st.status = stop ? "withdrawn" : "approved"; commit(st.name + " 님 두잉고 이용을 " + (stop ? "멈췄어요." : "다시 열었어요.")); }); break; }
      case "vlink-toggle": { const pr = vdP(d.id); if (!pr || pr.iid !== IID()) break;
        const left = pr.dg !== false ? VD().orders.filter((o) => o.pid === pr.id && o.kind === "coach" && o.status === "paid" && o.coach && (Number(o.coach.n) || 0) > (Number(o.coach.used) || 0)).length : 0;
        const go = () => { pr.dg = pr.dg === false; commit("‘" + pr.title + "’ 구매자에게 두잉고를 " + (pr.dg ? "열었어요." : "닫았어요.")); };
        if (left) { confirmModal("두잉고 닫기", "이 강의에 아직 쓰지 않은 1:1 코칭권이 " + left + "건 있어요.<br>두잉고를 닫으면 수강생이 남은 코칭 질문을 할 수 없어요. 그래도 닫을까요?", "닫기", true, go); break; }
        go(); break; }
      case "to-student": { const st = DB.session.student(); if (st && st.preview) DB.session.setStudent(null); break; }
      case "stop-acting": S.actingAs = null; DB.session.setAdmin(S); ROUTE.hash = "#/center/master"; break;
      // 수강생
      case "stu-tab": ui.stuStatus = d.k; ui.picked.clear(); if (ROUTE.hash.indexOf("?") > -1) ROUTE.hash = "#/center/students"; else render(); break;
      case "stu-approve": { const s = DB.student(d.id); setStatus([d.id], "approved", s.name + "님을 승인했어요."); break; }
      case "stu-reject": { const s = DB.student(d.id); confirmModal("수강 신청 거절", esc(s.name) + "님의 신청을 거절할까요?<br>거절하면 로그인할 수 없어요.", "거절", true, () => setStatus([d.id], "rejected", s.name + "님의 신청을 거절했어요.")); break; }
      case "stu-withdraw": { const s = DB.student(d.id); confirmModal("탈퇴 처리", esc(s.name) + "님을 탈퇴 처리할까요?<br>탈퇴하면 로그인할 수 없고, 진행 기록은 남아 있어 복구할 수 있어요.", "탈퇴 처리", true, () => setStatus([d.id], "withdrawn", s.name + "님을 탈퇴 처리했어요.")); break; }
      case "stu-delete": { const s = DB.student(d.id); confirmModal("수강생 삭제", esc(s.name) + "님을 목록에서 완전히 삭제할까요?<br>되돌릴 수 없어요.", "삭제", true, () => { DB.data.students = DB.data.students.filter((x) => x.id !== d.id); DB.store.remove("moonclass:progress:" + d.id); commit("삭제했어요."); }); break; }
      case "bulk-approve": if (!ui.picked.size) { toast("승인할 수강생을 선택해 주세요.", "warn"); break; } setStatus(Array.from(ui.picked), "approved", ui.picked.size + "명을 승인했어요."); break;
      case "bulk-reject": if (!ui.picked.size) { toast("거절할 수강생을 선택해 주세요.", "warn"); break; } { const ids = Array.from(ui.picked); confirmModal("선택 거절", ids.length + "명의 신청을 거절할까요?", "거절", true, () => setStatus(ids, "rejected", ids.length + "명을 거절했어요.")); } break;
      case "student-add": studentForm(null); break;
      case "student-open": studentForm(DB.student(d.id)); break;
      // 기수
      case "cohort-add": if (S.role !== "master") { if (!isCoach()) billForm(null, false); break; } planForm(IID(), null); break;
      case "bill-request": billForm(null, false); break;
      case "bill-add": billForm(null, true); break;
      case "bill-edit": { const b = findBill(d.id); if (b) billForm(b, S.role === "master" && !S.actingAs); break; }
      case "bill-withdraw": { const b = findBill(d.id); if (!b) break; confirmModal("신청 취소", esc(b.cohortName) + " 신청을 취소할까요?", "신청 취소", true, () => { DB.removeBill(b.id); closeModal(); render(); toast("신청을 취소했어요."); }); break; }
      case "bill-pay": { const b = findBill(d.id); if (b) payForm(b); break; }
      case "bill-invoice": { const b = findBill(d.id); if (b) invoiceForm(b); break; }
      case "bill-open": { const b = findBill(d.id); if (b) openCohortForm(b); break; }
      case "bill-cancel": { const b = findBill(d.id); if (!b) break; confirmModal("신청 취소 처리", esc(insName(b.instructorId) + " " + b.cohortName) + " 신청을 취소로 바꿀까요?<br>매출 · 달력에서 빠지고, 필요하면 다시 되돌릴 수 있어요.", "취소 처리", true, () => { b.canceledAt = todayStr(); DB.saveBill(b); closeModal(); render(); toast("취소로 바꿨어요."); }); break; }
      case "bill-refund": { const b = findBill(d.id); if (!b) break; confirmModal("이용료 환불", esc(insName(b.instructorId) + " " + b.cohortName) + " 이용료를 환불 처리할까요?<br>매출 · 파트너 RS에서 빠지고, 열린 기수는 그대로 남아요.", "환불 처리", true, () => { b.canceledAt = todayStr(); b.refundedAt = todayStr(); DB.saveBill(b); closeModal(); render(); toast("환불로 바꿨어요. 매출 · RS에서 빠져요."); }); break; }
      case "pw-peek": { const on = a.textContent === "••••"; a.textContent = on ? a.dataset.pw : "••••"; break; }
      case "bill-uncancel": { const b = findBill(d.id); if (!b) break; delete b.canceledAt; DB.saveBill(b); render(); toast("취소를 되돌렸어요."); break; }
      case "bill-del": { const b = findBill(d.id); if (!b) break; confirmModal("이용료 기록 삭제", esc(insName(b.instructorId) + " " + (b.cohortName || "")) + " 기록을 완전히 지울까요?<br>열린 기수는 그대로 남아요. 되돌릴 수 없어요.", "삭제", true, () => { DB.removeBill(b.id); closeModal(); render(); toast("기록을 지웠어요."); }); break; }
      case "bill-csv": billCsv(); break;
      case "bill-tab": ui.billTab = d.k; ui.calDay = null; render(); break;
      case "cal-move": { const ym = ui.calYM || todayStr().slice(0, 7); const dt = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + Number(d.dir), 1); ui.calYM = DB.date.toStr(dt).slice(0, 7); ui.calDay = null; render(); break; }
      case "cal-today": ui.calYM = todayStr().slice(0, 7); ui.calDay = todayStr(); render(); break;
      case "cal-day": ui.calDay = d.d && d.d !== ui.calDay ? d.d : null; render(); break;
      case "rev-year": ui.revYear = (ui.revYear || Number(todayStr().slice(0, 4))) + Number(d.dir); render(); break;
      case "rev-year-set": ui.revYear = Number(d.y); render(); break;
      case "cohort-edit": { const co = DB.cohort(d.id); if (co) planForm(co.instructorId, co); break; }
      case "plan-new": if (S.role !== "master" || staffDeny("master/plan")) break; planForm(d.iid, null); break;
      case "plan-edit": { const co = DB.cohort(d.id); if (co) planForm(co.instructorId, co); break; }
      case "plan-pv": planSplit(d.iid, d.id, d.pg); break;
      case "plan-ins": ui.planIns = d.id; if (ROUTE.hash.indexOf("?") >= 0) ROUTE.hash = "#/center/master/plan"; else render(); break;
      case "plan-ev-add": { const box = document.getElementById("pl-evs"), f = document.getElementById("plan-form"); if (!box || !f) break; box.insertAdjacentHTML("beforeend", planRow(f.dataset.iid, { type: d.k })); const r = box.lastElementChild; const di = r.querySelector('[name="ev-date"]'); if (di) di.focus(); refreshPlanPv(); break; }
      case "plan-ev-del": { const r = t.closest(".pl-ev"); if (r) r.remove(); refreshPlanPv(); break; }
      case "plan-then": { const f = document.getElementById("plan-form"); if (f) f.dataset.then = "pv"; break; }
      case "plan-del": {
        if (S.role !== "master" || staffDeny("master/plan")) break;
        const co = DB.cohort(d.id); if (!co) break;
        const iid = co.instructorId, ss = DB.studentsOf(iid).filter((x) => x.cohortId === co.id), real = ss.filter((x) => !x.demo);
        if (real.length) { toast("수강생 " + real.length + "명이 있는 기수는 지울 수 없어요. 수강생을 다른 기수로 옮긴 뒤 지워 주세요.", "warn"); break; }
        // 체험용 수강생(이수진 등)은 지우지 않고 남은 기수 중 가장 최근 기수로 옮겨요 — 체험 계정은 계속 들어갈 수 있게
        const to = DB.cohortsOf(iid).filter((x) => x.id !== co.id).slice(-1)[0];
        confirmModal(insName(iid) + " " + co.name + "을 지울까요?", "기수와 이 기수 특별 일정이 지워져요." + (ss.length ? (to ? " 체험용 수강생 " + ss.length + "명은 " + esc(to.name) + "로 옮겨요." : " 체험용 수강생 " + ss.length + "명도 함께 지워져요.") : "") + " 되돌릴 수 없어요.", "지우기", true, () => {
          const ct = DB.content(iid);
          if (to) ss.forEach((x) => { x.cohortId = to.id; }); else { const ids = new Set(ss.map((x) => x.id)); DB.data.students = DB.data.students.filter((x) => !ids.has(x.id)); }
          DB.data.cohorts = DB.data.cohorts.filter((x) => x.id !== co.id);
          if (ct) ct.schedule = ct.schedule.filter((e) => !(e.scope === "cohort" && e.cohortId === co.id));
          DB.bills().filter((x) => x.cohortId === co.id).forEach((x) => { delete x.cohortId; x.cohortDeletedAt = todayStr(); DB.saveBill(x); });
          commit(insName(iid) + " " + co.name + "을 지웠어요.");
        });
        break;
      }
      case "cohort-delete": { const co = DB.cohort(d.id); confirmModal("기수 삭제", esc(co.name) + "를 삭제할까요?", "삭제", true, () => { DB.data.cohorts = DB.data.cohorts.filter((x) => x.id !== d.id); DB.bills().filter((b) => b.cohortId === d.id).forEach((b) => { delete b.cohortId; b.cohortDeletedAt = todayStr(); DB.saveBill(b); }); commit("기수를 삭제했어요. 연결된 이용료 기록은 ‘기수 열기’를 다시 할 수 있어요."); }); break; }
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
        list[list.length - 1].review = Object.assign({ status: d.status, comment: comment.trim(), at: Date.now() }, actor());
        DB.saveProgress(d.sid, p);
        closeModal(); render();
        toast(d.status === "approved" ? "승인했어요." : "보완을 요청했어요.");
        break;
      }
      case "q-tab": ui.qFilter = d.k; render(); break;
      // 콘텐츠
      case "lib-tab": ui.libTab = d.k; render(); break;
      case "faq-bulk": faqBulkModal(); break;
      case "gl-bulk": glBulkModal(); break;
      case "showcase-from": showcaseFrom(a.dataset.sid, a.dataset.mid); break;
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
          const sp = DB.splitMid(ui.mMenuIns), c = sp.vod ? DB.vodContent(sp.iid, sp.pid) : DB.content(sp.iid); if (c && c.pages) delete c.pages[d.key];
          commit("메뉴를 삭제했어요.");
        });
        break;
      }
      case "m-preview": {
        const co = DB.currentCohort(d.id);
        if (!co) { toast("기수가 없어 미리볼 수 없어요.", "warn"); break; }
        DB.session.setStudent({ preview: true, instructorId: d.id, cohortId: co.id, at: Date.now() });
        ROUTE.hash = "#/home";
        break;
      }
      case "page-edit": pageForm(d.key); break;
      case "libnote-edit": libNoteForm(); break;
      case "coach-add": coachForm(null); break;
      case "coach-edit": coachForm(d.id); break;
      case "coach-delete": { const iid = IID(), list = DB.coachesOf(iid), i = list.findIndex((x) => x.id === d.id); if (i < 0) break; const nm = list[i].name; confirmModal("코치 삭제", "‘" + esc(nm) + " 코치’ 계정을 삭제할까요?<br>지금까지 처리한 검수 · 답변 기록은 그대로 남아요.", "삭제", true, () => { list.splice(i, 1); commit("코치 계정을 삭제했어요."); }); break; }
      case "coach-preset": {
        const f = document.getElementById("coach-form"); if (!f) break;
        const set = { basic: ["reviews", "questions"], ops: ["students", "cohorts", "reviews", "questions"], all: COACH_PERMS.flatMap((g) => g[1].map((x) => x[0])), none: [] }[d.k] || [];
        f.querySelectorAll("input[name=perm]").forEach((x) => { x.checked = set.indexOf(x.value) !== -1; });
        break;
      }
      case "ql-reset": confirmModal("빠른 이동", "기본 목록(윗줄: 클래스 소식 · FAQ 검색 · 실무 체크리스트 · 1:1 요청 / 아랫줄: 유튜브 · 네이버 카페 · 두고커넥트 · 두고푸드)으로 되돌릴까요?", "되돌리기", false, () => { delete C().quickLinks; commit("기본 목록으로 되돌렸어요."); }); break;
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
        if (!data || !data.db || !Array.isArray(data.db.instructors)) { toast("두잉고 백업 형식이 아니에요.", "warn"); break; }
        confirmModal("백업으로 복원", "지금 데이터를 지우고 " + esc((data.exportedAt || "").slice(0, 16).replace("T", " ")) + " 백업으로 되돌릴까요?", "복원", true, () => {
          if (DB.remote.on) {
            DB.remote.call("admin", { action: "import", db: data.db, progress: data.progress || {}, inquiries: data.inquiries || [], bills: data.bills || [] }).then((r) => {
              if (r.error) { toast("복원하지 못했어요. 백업 내용을 확인해 주세요.", "warn"); return; }
              location.reload();
            }).catch(() => toast("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.", "warn"));
            return;
          }
          DB.store.keys().filter((k) => k.indexOf("moonclass:progress:") === 0).forEach((k) => DB.store.remove(k));
          Object.keys(data.progress || {}).forEach((sid) => DB.store.set("moonclass:progress:" + sid, data.progress[sid]));
          if (Array.isArray(data.inquiries)) { const m = {}; data.inquiries.forEach((x) => { if (x && x.id) m[x.id] = x; }); DB.store.set("moonclass:inquiries", m); }
          if (Array.isArray(data.bills)) { const m = {}; data.bills.forEach((x) => { if (x && x.id) m[x.id] = x; }); DB.store.set("moonclass:bills", m); }
          DB.store.set("moonclass:db:v2", data.db);
          DB.load(); closeModal(); render(); toast("백업으로 복원했어요.");
        });
        break;
      }
      case "inq-tab": ui.inqFilter = d.k; render(); break;
      case "inq-make": { if (staffDeny("master/instructors")) break; const x = findInq(d.id); if (x) insForm(null, { inq: x.id, name: x.name, phone: x.phone, email: x.email, course: x.course, vod: inqIsVod(x) }); break; }
      case "inq-memo": { const x = findInq(d.id), ta = document.querySelector('[data-inq-memo="' + d.id + '"]'); if (x && ta) { x.memo = ta.value.trim(); DB.saveInquiry(x); toast("메모를 저장했어요."); } break; }
      case "inq-del": { const x = findInq(d.id); if (!x) break; confirmModal("입점 문의 삭제", "‘" + esc(x.name) + "’ 님의 입점 문의를 삭제할까요?<br>삭제하면 되돌릴 수 없어요.", "삭제", true, () => { DB.removeInquiry(x.id); closeModal(); render(); toast("입점 문의를 삭제했어요."); }); break; }
      case "brand-photo-del": if (C().brand.photo) setBrandPhoto(""); break;
      // 쪽을 넘기면 그 목록 맨 위가 보이게 (다시 그리는 동안 화면이 맨 위로 튀어도 목록으로 돌아와요)
      case "pg": { (ui.pg = ui.pg || {})[d.k] = Number(d.p) || 1; render(); const c = document.querySelector('[data-pg-card="' + d.k + '"]'), t = c ? c.getBoundingClientRect().top : 0; if (c && (t < 70 || t > window.innerHeight / 2)) c.scrollIntoView({ block: "start" }); break; }
      case "server-backup":
        DB.remote.call("admin", { action: "backup" }).then((r) => { if (r.error) throw new Error(r.error); ui.backups = null; render(); toast("지금 상태를 서버에 백업했어요."); }).catch(() => toast("백업하지 못했어요. 잠시 후 다시 시도해 주세요.", "warn"));
        break;
      case "server-restore":
        confirmModal("백업 시점으로 되돌리기", fmtStamp(Number(d.at)) + " 백업(#" + esc(d.id) + ")으로 모든 데이터를 되돌릴까요?<br>지금 상태도 먼저 백업해 두니, 필요하면 다시 되돌릴 수 있어요.", "되돌리기", true, () => {
          closeModal(); toast("되돌리는 중이에요…");
          DB.remote.call("admin", { action: "restore-backup", id: Number(d.id) }).then((r) => { if (r.error) throw new Error(r.error); location.reload(); }).catch(() => toast("되돌리지 못했어요. 잠시 후 다시 시도해 주세요.", "warn"));
        });
        break;
      case "data-reset":
        confirmModal("처음 상태로 초기화", "모든 강사·수강생·제출 기록이 지워지고 체험 데이터로 돌아가요.<br>되돌릴 수 없어요.", "초기화", true, () => {
          if (DB.remote.on) { closeModal(); toast("초기화하는 중이에요…"); DB.reset().then(() => location.reload(), () => toast("초기화하지 못했어요. 잠시 후 다시 시도해 주세요.", "warn")); return; }
          if (staffMe()) { closeModal(); toast("초기화는 최고 관리자만 할 수 있어요.", "warn"); return; }
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
        confirmModal("커리큘럼 삭제", "‘" + esc(cur.name) + "’" + josa(cur.name, "을", "를").slice(String(cur.name).length) + " 삭제할까요?<br>이 커리큘럼의 주차·강의·과제가 모두 지워져요.", "삭제", true, () => { const c = C(); c.curricula = c.curricula.filter((x) => x.id !== cur.id); ui.curId = "main"; commit("커리큘럼을 삭제했어요."); });
        break;
      }
      case "item-add": editItem(d.coll, "", d.ctx); break;
      case "item-edit": editItem(d.coll, d.id, d.ctx); break;
      case "item-delete": deleteItem(d.coll, d.id, d.ctx); break;
      case "item-move": moveItem(d.coll, d.id, d.ctx, Number(d.dir)); break;
      // 마스터
      case "ins-add": if (staffDeny("master/instructors")) break; insForm(null); break;
      case "ins-edit": if (staffDeny("master/instructors")) break; insForm(DB.instructor(d.id)); break;
      case "ins-enter": if (staffDeny("master/instructors")) break; S.actingAs = d.id; DB.session.setAdmin(S); ROUTE.hash = /^#\/center\/[a-z-]+$/.test(d.to || "") ? d.to : "#/center"; toast(DB.instructor(d.id).displayName + " 강사센터로 들어왔어요."); break;
      case "ins-delete": {
        if (staffDeny("master/instructors")) break;
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
    if (f.id === "site-form") {
      e.preventDefault();
      const next = {};
      SITE_FIELDS.forEach((x) => { next[x[0]] = String(f[x[0]].value || "").replace(/\s+/g, " ").trim().slice(0, x[0] === "notice" ? 300 : 200); });
      ["terms", "privacy"].forEach((k) => { if (next[k] && !/^https?:\/\//i.test(next[k])) next[k] = "https://" + next[k]; });
      next.group = DB.siteInfo().group; // 두고 그룹사 칸은 바닥에서 뺐지만, 저장해 둔 값은 그대로 둔다
      if (!DB.saveSite(next)) { toast("저장하지 못했어요.", "warn"); return; }
      render(); toast("첫 화면 바닥 정보를 저장했어요.");
      return;
    }
    if (f.id === "gl-bulk-form") {
      e.preventDefault();
      const items = parseGlossaryText(f.text.value);
      if (!items.length) { toast("‘용어 : 풀이’ 형식의 줄을 찾지 못했어요. 형식을 확인해 주세요.", "warn"); return; }
      const c = C();
      if (f.replace.checked) c.glossary = [];
      c.glossary = c.glossary || [];
      items.forEach((it) => { const same = c.glossary.find((g) => g.term === it.term); if (same) Object.assign(same, it); else c.glossary.push(Object.assign({ id: DB.uid("gl") }, it)); });
      commit(items.length + "개 용어를 등록했어요.");
      return;
    }
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
    if (f.id === "billing-form") {
      e.preventDefault();
      const next = {};
      ["bank", "account", "holder", "note"].forEach((k) => { next[k] = String(f[k].value || "").trim().slice(0, k === "note" ? 300 : 60); });
      next.vat = f.vat.value;
      if (!DB.saveBilling(next)) { toast("저장하지 못했어요.", "warn"); return; }
      render(); toast("입금 계좌 · 부가세 설정을 저장했어요.");
      return;
    }
    const forms = { "vda-shipbulk-form": saveShipBulk, "bo-no-form": saveBoNo, "fin-fee-form": saveFinFee, "vda-form": saveVodClass, "vda-ban-form": saveVodBanner, "vda-tile-form": saveVodTiles, "vda-rails-form": saveVodRails, "vda-cat-form": saveVodCats, "vda-topic-form": saveVodTopics, "vda-set-form": saveVodSettings, "vp-copy-form": saveVpCopy, "vda-rate-form": saveVodRate, "vda-tax-form": saveVodTax, "vda-ad-form": saveVodAd, "vs-prof-form": saveVsProfile, "vda-ref-form": saveVodRefund, "vs-inv-form": saveVsInvoice, "vda-cp-form": saveVodCoupon, "vda-iq-form": saveVodAnswer, "aff-lead-form": saveAffLead, "an-form": saveAffNotice, "sla-form": saveSla, "ct-form": saveContract, "st-form": saveStaff, "aff-form": saveAff, "aff-set-form": saveAffSet, "aff-pw-form": saveAffPw, "aff-bank-form": saveAffBank, "bill-form": saveBillForm, "pay-form": saveBillStep, "inv-form": saveBillStep, "open-form": saveBillStep, "cur-form": saveCur, "a-login-form": doLogin, "student-form": saveStudent, "plan-form": savePlan, "coll-form": saveItem, "brand-form": saveBrand, "ins-form": saveIns, "menu-item-form": saveMenuItem, "page-form": savePage, "libnote-form": saveLibNote, "coach-form": saveCoach };
    if (forms[f.id]) { e.preventDefault(); forms[f.id](f); return; }
    if (f.classList.contains("vda-price")) { e.preventDefault(); saveVodPrice(f); return; }
    if (f.classList.contains("a-q-form")) {
      e.preventDefault();
      const ans = f.answer.value.trim();
      if (!ans) { toast("답변을 적어 주세요.", "warn"); return; }
      const p = DB.progress(f.dataset.sid);
      const q = p.questions.find((x) => x.id === f.dataset.qid);
      q.answer = ans; q.answeredAt = Date.now(); const ac = actor(); q.answeredBy = ac.by; q.answeredById = ac.byId;
      DB.saveProgress(f.dataset.sid, p);
      render(); toast("답변을 등록했어요. 수강생 화면에 바로 보여요.");
    }
  });
  document.addEventListener("change", (e) => {
    if (!isActive()) return;
    const t = e.target;
    if (t.matches && t.matches("[data-hk-mode]")) {
      const rs = railSync(), r = rs.find((x) => x.k === t.dataset.hkMode); if (!r) return;
      const vis = VX().railItems(r).map((it) => it.p.id), m = t.value;
      // ‘고른 강의만’으로 바꾸면 지금 보이는 강의를 그대로 고르고, ‘자동’이면 고정만 풀어요 (뺀 강의는 그대로)
      if (m === "only") r.picks = vis.concat(r.picks.filter((id) => vis.indexOf(id) < 0)); else if (m === "auto") r.picks = [];
      r.mode = m; commit(m === "auto" ? "자동으로 바꿨어요. 규칙대로 보여요." : m === "only" ? "고른 강의만 보여요. 지금 보이던 강의를 그대로 골라 뒀어요." : "고정한 강의 먼저, 나머지는 자동이에요.");
      return;
    }
    if (t.id === "vda-price-key") { ui.vdPriceKey = t.value; (ui.pg = ui.pg || {}).vdPrice = 1; render(); return; }
    if (t.id === "rk-type") { ui.rkType = t.value; render(); return; }
    if (t.id === "rk-sort") { ui.rkSort = t.value; render(); return; }
    if (t.id === "vda-om") { ui.vdOm = t.value; render(); return; }
    // 광고비: 강사를 바꾸면 그 강사 강의만 고를 수 있게
    if (t.id === "vda-ad-iid") { const ps = document.getElementById("vda-ad-pid"); if (ps) { Array.from(ps.options).forEach((o) => { o.hidden = !!o.value && o.dataset.iid !== t.value; }); if (ps.selectedOptions[0] && ps.selectedOptions[0].hidden) ps.value = ""; } return; }
    if (t.id === "stu-cohort") { ui.stuCohort = t.value; ui.picked.clear(); if (ROUTE.hash.indexOf("?") > -1) ROUTE.hash = "#/center/students"; else render(); }
    else if (t.id === "rev-cohort") { ui.revCohort = t.value; ui.revPicked.clear(); render(); }
    else if (t.id === "rev-week") { ui.revWeek = t.value; ui.revPicked.clear(); render(); }
    else if (t.id === "sched-cohort") { ui.schedCohort = t.value; render(); }
    else if (t.id === "cur-pick") { ui.curId = t.value; render(); }
    else if (t.closest && t.closest("#plan-form")) refreshPlanPv();
    else if (t.name === "base" && t.closest("#cur-form")) { const b = document.querySelector("[data-show-blank]"); if (b) b.hidden = t.value !== "blank"; }
    else if (t.id === "m-ins") { ui.mIns = t.value; render(); }
    else if (t.id === "a-vpid" || t.id === "a-vpid2") { setVpid(t.value); render(); toast("‘" + ((vdP(t.value) || {}).title || "") + "’ 강의실을 꾸며요. 바꾼 내용은 이 VOD 수강생에게만 보여요."); }
    else if (t.id === "m-menu-ins") { ui.mMenuIns = t.value; if (ROUTE.hash.indexOf("?") > -1) ROUTE.hash = "#/center/master/menus"; else render(); }
    else if (t.id === "m-rep-ins") { ui.mRepIns = t.value; render(); }
    else if (t.classList.contains("a-menu-label")) { const it = DB.menuConfig(ui.mMenuIns).items.find((x) => x.key === t.dataset.key); it.label = t.value.trim(); DB.save(); render(); toast("메뉴 이름을 저장했어요."); }
    else if (t.name === "mtheme") { const c = DB.content(DB.splitMid(ui.mMenuIns).iid); c.brand.theme = t.value; c.brand.themeSet = true; DB.save(); render(); toast(DB.themeOf(t.value).label + " 색으로 바꿨어요."); }
    else if (t.name === "theme" || t.name === "itheme") { const box = document.getElementById("theme-preview-" + t.name); if (box) box.innerHTML = themePreview(t.value); }
    else if (t.id === "m-status") { ui.mStatus = t.value; render(); }
    else if (t.id === "bill-ins") { ui.billIns = t.value; render(); }
    else if (t.id === "bill-state") { ui.billState = t.value; render(); }
    else if (t.id === "bf-vat") refreshBillCalc();
    else if (t.classList.contains("rev-pick")) { if (t.checked) ui.revPicked.add(t.dataset.key); else ui.revPicked.delete(t.dataset.key); render(); }
    else if (t.id === "rev-all" || t.id === "rev-all-2") {
      const keys = Array.from(document.querySelectorAll(".rev-pick")).map((x) => x.dataset.key);
      keys.forEach((k) => (t.checked ? ui.revPicked.add(k) : ui.revPicked.delete(k)));
      render();
    }
    else if (t.id === "att-file") { addAttFiles(t.files); t.value = ""; }
    else if (t.id === "img-file") { addImgFiles(t.files); t.value = ""; }
    else if (t.dataset && t.dataset.inqStatus) { const x = findInq(t.dataset.inqStatus); if (x) { setInqStatus(x, t.value); DB.saveInquiry(x); actLog(x.name + " 님 입점 문의를 ‘" + inqStatus(x)[1] + "’" + josa(inqStatus(x)[1], "으로", "로").slice(inqStatus(x)[1].length) + " 바꿨어요."); DB.save(); render(); toast("‘" + inqStatus(x)[1] + "’" + josa(inqStatus(x)[1], "으로", "로").slice(inqStatus(x)[1].length) + " 바꿨어요." + (inqAff(x) ? " 파트너센터에도 보여요." : "")); } }
    else if (t.dataset && t.dataset.certCo) { ui.certCo = t.value; render(); }
    else if (t.matches && t.matches("[data-split-sel]")) dgSplit(t.value);
    else if (t.dataset && t.dataset.logWho) { ui.logWho = t.value; (ui.pg = ui.pg || {}).log = 1; render(); }
    else if (t.dataset && t.dataset.stRole) { const p = (STAFF_ROLES[t.value] || {}).perms || []; if (t.value !== "custom") t.form.querySelectorAll('input[name="perm"]').forEach((c) => { c.checked = p.indexOf(c.value) >= 0; }); }
    else if (t.dataset && t.dataset.inqAff) { const x = findInq(t.dataset.inqAff); if (x) { x.affId = t.value; DB.saveInquiry(x); render(); toast(t.value === "none" ? "소개 파트너를 지웠어요." : "소개 파트너를 지정했어요. 그 파트너센터에 이 문의가 보여요."); } }
    else if (t.id === "brand-photo-file") { const f = t.files && t.files[0]; t.value = ""; if (f) brandPhotoCompress(f, setBrandPhoto); }
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
    if (t.id === "gb-text") { const n = parseGlossaryText(t.value).length; const el = document.getElementById("gb-count"); if (el) el.textContent = n + "개 인식됨"; }
    if (t.id === "fb-text") { const n = parseFaqText(t.value).length; const el = document.getElementById("fb-count"); if (el) el.textContent = n + "개 인식됨"; }
    if (t.closest && t.closest("#plan-form")) refreshPlanPv();
    if (t.id === "bf-fee" || t.id === "bf-amount") refreshBillCalc();
    if (t.id === "al-pw" && loginTab === "instructor") t.value = t.value.replace(/\D/g, "").slice(0, 4);
    if (t.id === "sf-phone" || t.id === "if-phone") t.value = t.value.replace(/\D/g, "").slice(0, 4);
    if (t.id === "al-id" || t.id === "al-pw") { const er = document.getElementById("al-error"); if (er) er.textContent = ""; }
  });
  document.addEventListener("input", (e) => { if (e.target.matches && e.target.matches(".kt textarea")) ktGrow(e.target); });
  document.addEventListener("keydown", (e) => {
    if (!isActive()) return;
    // 1:1 대화: Enter 로 보내기 · Shift+Enter 는 줄바꿈 (한글 조합 중 Enter 는 무시해서 두 번 안 가게)
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229 && e.target.matches && e.target.matches("[data-inq-say]") && !window.matchMedia("(pointer: coarse)").matches) {
      e.preventDefault();
      const b = document.querySelector('[data-action="inq-say"][data-id="' + e.target.dataset.inqSay + '"]');
      if (b && e.target.value.trim()) b.click();
      return;
    }
    if (e.key === "Escape") { if (modalRoot.innerHTML) closeModal(); const app = document.getElementById("a-app"); if (app) app.classList.remove("nav-open"); }
  });

  window.AdminApp = { render, mount };
})();
