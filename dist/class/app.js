/* 두고보는 문대표 클래스 — 수강생 플랫폼 (정적 프로토타입)
 *
 * 구조
 *  - 데이터 원본: data.js 의 window.CLASS_DATA (다음 단계에서 강사센터가 편집)
 *  - 수강생별 진행 기록: localStorage "moonclass:progress:<학생ID>"
 *  - 라우팅: location.hash (#/home, #/missions/1 …)
 *  - 렌더링: 템플릿 문자열 + 이벤트 위임 (두고마켓 앱과 같은 방식)
 */
(function () {
  "use strict";

  const D = window.CLASS_DATA;
  const KEY_SESSION = "moonclass:session";
  const KEY_PROGRESS = "moonclass:progress:";
  const KEY_BOT = "moonclass:bot-open";
  const root = document.getElementById("root");
  const modalRoot = document.getElementById("modal-root");
  const toastRoot = document.getElementById("toast-root");

  /* ---------------- 저장소 ---------------- */
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
    remove(key) { try { localStorage.removeItem(key); } catch (e) { /* 무시 */ } }
  };

  let me = null;        // 로그인한 수강생
  let P = null;         // 내 진행 기록
  let draft = { missionId: null, files: [] };
  let qnaTab = "faq";
  let calCursor = null;
  // 좁은 화면에서는 채팅창이 본문을 가리므로 처음엔 버튼으로만 보여 준다
  let botOpen = window.matchMedia("(max-width: 720px)").matches ? false : store.get(KEY_BOT, true);
  let botThinking = false;

  function emptyProgress() {
    return { submissions: {}, watched: {}, docs: {}, questions: [], chat: [] };
  }
  function loadProgress() {
    P = Object.assign(emptyProgress(), store.get(KEY_PROGRESS + me.id, {}));
  }
  function saveProgress() {
    if (!store.set(KEY_PROGRESS + me.id, P)) {
      toast("저장 공간이 부족해요. 사진 수를 줄여 다시 시도해 주세요.");
      return false;
    }
    return true;
  }

  /* ---------------- 유틸 ---------------- */
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function parseDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
  function fmtMD(s) { const d = parseDate(s); return (d.getMonth() + 1) + "/" + d.getDate() + " (" + DOW[d.getDay()] + ")"; }
  function fmtFull(s) { const d = parseDate(s); return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0"); }
  function fmtStamp(ts) {
    const d = new Date(ts);
    return (d.getMonth() + 1) + "/" + d.getDate() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function daysUntil(s) { return Math.round((parseDate(s) - parseDate(todayStr())) / 86400000); }
  const won = (n) => (Math.round(n) || 0).toLocaleString("ko-KR") + "원";

  /* ---------------- 아이콘 (Lucide, ISC) ---------------- */
  const ICONS = {
    home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    book: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
    checks: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
    calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    clipboard: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
    sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
    library: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M9 14h6"/><path d="M12 11v6"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
    chevDown: '<path d="m6 9 6 6 6-6"/>',
    chevRight: '<path d="m9 18 6-6-6-6"/>',
    chevLeft: '<path d="m15 18-6-6 6-6"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    arrowUpRight: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    fileSheet: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>',
    circlePlay: '<circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
    sprout: '<path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>',
    pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    pen: '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>',
    calculator: '<rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
    mapPin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
    video: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'
  };
  const icon = (name, cls) => '<svg class="icon ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || "") + "</svg>";

  /* ---------------- 과제 · 진행률 ---------------- */
  const allMissions = () => D.weeks.flatMap((w) => w.missions.map((m) => Object.assign({ weekNo: w.no }, m)));
  const findWeek = (no) => D.weeks.find((w) => w.no === Number(no));
  const findMission = (id) => allMissions().find((m) => m.id === id);
  const isOpen = (w) => todayStr() >= w.openDate;
  const lastSub = (id) => { const list = P.submissions[id]; return list && list.length ? list[list.length - 1] : null; };
  const isDone = (id) => { const s = lastSub(id); return !!(s && s.result.pass); };
  function missionState(id) {
    const s = lastSub(id);
    if (!s) return "todo";
    return s.result.pass ? "done" : "fix";
  }
  function weekStats(w) {
    const req = w.missions.filter((m) => m.required).length;
    const opt = w.missions.length - req;
    const done = w.missions.filter((m) => isDone(m.id)).length;
    return { req, opt, done, total: w.missions.length, pct: w.missions.length ? Math.round((done / w.missions.length) * 100) : 0 };
  }
  function overallStats() {
    const list = allMissions();
    const done = list.filter((m) => isDone(m.id)).length;
    const req = list.filter((m) => m.required);
    const reqDone = req.filter((m) => isDone(m.id)).length;
    return { total: list.length, done, pct: list.length ? Math.round((done / list.length) * 100) : 0, reqTotal: req.length, reqDone };
  }
  function nextMission(w) {
    return w.missions.find((m) => m.required && !isDone(m.id)) || w.missions.find((m) => !isDone(m.id));
  }
  function nextMissionOverall() {
    for (const w of D.weeks) {
      if (!isOpen(w)) continue;
      const m = nextMission(w);
      if (m) return Object.assign({ weekNo: w.no }, m);
    }
    return null;
  }

  // 자동검수: 과제별 규칙(check)으로 바로 판정한다. 강사 확인이 필요한 항목은 다음 단계에서 강사센터로 넘긴다.
  function autoCheck(m, sub) {
    const c = m.check || {};
    const reasons = [];
    const ok = [];
    const text = (sub.text || "").trim();
    const plain = text.replace(/\s+/g, "");
    if (c.image) {
      if (!sub.files.length) reasons.push("인증 사진(또는 PDF)을 1개 이상 올려 주세요.");
      else ok.push("인증 파일 " + sub.files.length + "개 확인");
    }
    if (c.link) {
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
    const params = new URLSearchParams(query || "");
    return { parts: parts.length ? parts : ["home"], params };
  }
  const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };

  const NAV = [
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
      children: () => LIB.map((c) => ({ id: c.id, label: c.label, href: "#/library/" + c.id })) },
    { id: "motivation", label: "동기부여", icon: "flame", href: "#/motivation" },
    { id: "certificate", label: "수료증", icon: "award", href: "#/certificate" }
  ];
  const LIB = [
    { id: "ebook", label: "전자책 · 가이드북", icon: "book", cls: "ri-1", desc: () => D.brand.instructor + " 전자책과 가이드북을 웹에서 열람" },
    { id: "file", label: "자료 파일", icon: "fileSheet", cls: "ri-2", desc: () => "건강식품 리스트 · 키워드 · 마진 계산기 등 실전 자료" },
    { id: "vod", label: "이커머스 실전 VOD", icon: "circlePlay", cls: "ri-3", desc: () => "쿠팡 · 네이버 판매, 현지 도매몰 발주 · 대량 발주 강의 영상" },
    { id: "senior", label: "시니어 기초 가이드", icon: "book", cls: "ri-4", desc: () => "처음 시작하시는 분들을 위한 친절한 기초 안내" }
  ];
  const navLabel = (n) => (typeof n.label === "function" ? n.label() : n.label);

  /* ---------------- 공통 컴포넌트 ---------------- */
  function video(item, opts) {
    opts = opts || {};
    if (item.youtubeId) {
      return '<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/' + esc(item.youtubeId) + '?rel=0" title="' + esc(item.title) +
        '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>';
    }
    return '<div class="video"><a class="video-ph" href="' + esc(D.brand.youtubeChannel) + '" target="_blank" rel="noopener">' +
      '<span class="vp-title">' + esc(opts.headline || item.title) + "</span>" +
      '<span class="vp-play">' + icon("play") + "</span>" +
      '<span class="vp-foot"><span>영상 준비 중 · ' + esc(D.brand.name) + " 채널에서 보기</span>" +
      (item.minutes ? '<span class="vp-time">' + esc(typeof item.minutes === "number" ? item.minutes + "분" : item.minutes) + "</span>" : "") +
      "</span></a></div>";
  }
  function thumb(item) {
    return '<span class="lesson-thumb">' + (item.youtubeId ? '<img src="https://i.ytimg.com/vi/' + esc(item.youtubeId) + '/mqdefault.jpg" alt="" loading="lazy">' : "") + icon("play") + "</span>";
  }
  const progressBar = (pct, thin) => '<div class="progress' + (thin ? " thin" : "") + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><span style="width:' + pct + '%"></span></div>';
  const pctText = (pct) => '<span class="big-pct">' + pct + "<small>%</small></span>";
  const pageHead = (title, sub, crumbs) =>
    '<header class="page-head">' + (crumbs ? '<nav class="crumbs">' + crumbs + "</nav>" : "") + "<h1>" + esc(title) + "</h1>" + (sub ? "<p>" + esc(sub) + "</p>" : "") + "</header>";
  const crumb = (items) => items.map((c, i) => (i < items.length - 1 ? '<a href="' + c[1] + '">' + esc(c[0]) + "</a>" + icon("chevRight", "xs") : "<span>" + esc(c[0]) + "</span>")).join("");
  function stateBadge(id) {
    const s = missionState(id);
    if (s === "done") return '<span class="badge badge-positive">' + icon("check", "xs") + "통과</span>";
    if (s === "fix") return '<span class="badge badge-warning">보완 필요</span>';
    return '<span class="badge badge-neutral">미제출</span>';
  }

  /* ---------------- 로그인 ---------------- */
  let typingTimer = null;
  function renderLogin() {
    document.title = D.brand.name + " 클래스 · 로그인";
    root.innerHTML =
      '<main class="login">' +
        '<section class="login-brand" aria-label="' + esc(D.brand.name) + '">' +
          '<a class="login-logo" href="#/login"><img src="assets/logo-mark.svg" alt=""><strong>' + esc(D.brand.name) + "</strong></a>" +
          '<div class="login-hero">' +
            '<p class="login-eyebrow">' + icon("sprout", "sm") + esc(D.brand.shortTitle) + "</p>" +
            '<h2 class="login-headline"><span class="typing" id="typing"></span><span class="caret" aria-hidden="true"></span>' +
              '<span class="rest">' + esc(D.brand.loginHeadlineSuffix) + "</span></h2>" +
            '<p class="login-sub">' + esc(D.brand.tagline) + ". 매주 과제를 하나씩 해내다 보면, 5주 뒤엔 내 이름의 스토어가 움직이고 있을 거예요.</p>" +
          "</div>" +
          '<div class="login-foot">' +
            '<button type="button" class="center-link" data-action="instructor-center"><span class="dot">T</span>강사센터 ' + icon("arrowRight", "sm") + "</button>" +
            '<span class="login-copy">© 2026 ' + esc(D.brand.name) + "</span>" +
          "</div>" +
        "</section>" +
        '<section class="login-panel">' +
          '<div class="login-card">' +
            "<h1>" + esc(D.brand.name) + " 클래스 시작하기</h1>" +
            '<p class="lead">수강 신청할 때 등록한 정보로 로그인하세요.</p>' +
            '<form class="login-form" id="login-form" novalidate>' +
              '<div class="field"><label for="lg-name">이름</label>' +
                '<input class="input" id="lg-name" name="name" autocomplete="name" placeholder="예: 홍길동" required></div>' +
              '<div class="field"><label for="lg-phone">전화번호 뒷자리</label>' +
                '<div class="input-wrap"><input class="input" id="lg-phone" name="phone4" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" autocomplete="off" placeholder="숫자 4자리" required>' +
                '<button type="button" class="input-addon" data-action="toggle-pw" aria-controls="lg-phone">보기</button></div></div>' +
              '<div class="row-end"><button type="button" data-action="forgot">로그인 정보를 잊으셨나요?</button></div>' +
              '<p class="field-error" id="lg-error" role="alert"></p>' +
              '<button class="btn btn-primary btn-block" type="submit">로그인</button>' +
            "</form>" +
            '<p class="login-note">휴대폰 번호 뒷자리 4자리가 비밀번호 대신 사용됩니다.<br>아직 수강생이 아니신가요? <a href="' + esc(D.brand.freeCourseUrl) + '" target="_blank" rel="noopener">무료 강의 보기</a></p>' +
            '<div class="login-demo">체험 계정 · 이름 <b>이수진</b> / 뒷자리 <b>2186</b></div>' +
            '<nav class="login-legal" aria-label="약관">' +
              '<button type="button" data-action="legal" data-doc="terms">이용약관</button>' +
              '<button type="button" data-action="legal" data-doc="privacy">개인정보처리방침</button>' +
              '<button type="button" data-action="legal" data-doc="oss">오픈소스 라이선스</button>' +
            "</nav>" +
          "</div>" +
        "</section>" +
      "</main>";
    startTyping();
  }

  function startTyping() {
    clearTimeout(typingTimer);
    const el = document.getElementById("typing");
    if (!el) return;
    const phrases = D.brand.loginPhrases.map((p) => p + ",");
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = phrases[0]; return; }
    let pi = 0, ci = 0, deleting = false;
    const tick = () => {
      if (!document.body.contains(el)) return;
      const word = phrases[pi];
      ci += deleting ? -1 : 1;
      el.textContent = word.slice(0, ci);
      let wait = deleting ? 45 : 110;
      if (!deleting && ci === word.length) { deleting = true; wait = 1800; }
      else if (deleting && ci === 0) { deleting = false; pi = (pi + 1) % phrases.length; wait = 350; }
      typingTimer = setTimeout(tick, wait);
    };
    tick();
  }

  function doLogin(form) {
    const name = form.name.value.replace(/\s+/g, "");
    const phone4 = form.phone4.value.trim();
    const err = document.getElementById("lg-error");
    if (!name) { err.textContent = "이름을 입력해 주세요."; form.name.focus(); return; }
    if (!/^\d{4}$/.test(phone4)) { err.textContent = "전화번호 뒷자리 숫자 4자리를 입력해 주세요."; form.phone4.focus(); return; }
    const s = D.students.find((x) => x.name.replace(/\s+/g, "") === name && x.phone4 === phone4);
    if (!s) { err.textContent = "등록된 수강생 정보와 일치하지 않아요. 이름과 뒷자리를 다시 확인해 주세요."; return; }
    store.set(KEY_SESSION, { id: s.id, at: Date.now() });
    startSession(s);
    location.hash = "#/home";
    render();
    toast(s.name + "님, 환영합니다!");
  }
  function startSession(s) { me = s; loadProgress(); }
  function logout() {
    store.remove(KEY_SESSION);
    me = null; P = null;
    location.hash = "#/login";
    render();
  }

  /* ---------------- 앱 셸 ---------------- */
  function renderShell() {
    const cohort = D.cohort;
    root.innerHTML =
      '<div class="app" id="app">' +
        '<header class="topbar">' +
          '<button class="menu-toggle" type="button" data-action="toggle-nav" aria-label="메뉴 열기">' + icon("menu") + "</button>" +
          '<a class="brand" href="#/home"><img src="assets/logo-mark.svg" alt=""><span class="brand-text"><small>' + esc(D.brand.name) + "</small><strong>" + esc(D.brand.courseTitle) + "</strong></span></a>" +
          '<div class="topbar-right">' +
            '<span class="hello"><span class="sprout">' + icon("sprout", "sm") + "</span><b>" + esc(me.name) + '</b><span class="txt">님 환영합니다</span></span>' +
            '<span class="cohort-chip">' + esc(cohort.name) + "</span>" +
            '<button class="logout" type="button" data-action="logout">' + icon("logout", "sm") + "<span>로그아웃</span></button>" +
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
    const top = r.parts[0];
    const sub = r.parts[1];
    const items = NAV.map((n) => {
      const active = top === n.id;
      const kids = n.children ? n.children() : null;
      const exact = active && (!kids || !sub);
      let html = '<li><a class="nav-item' + (exact ? " active" : active ? " parent-active open" : "") + '" href="' + n.href + '"' + (exact ? ' aria-current="page"' : "") + ">" +
        icon(n.icon) + "<span>" + esc(navLabel(n)) + "</span>" + (kids ? icon("chevDown", "sm chev") : "") + "</a>";
      if (kids && active) {
        html += '<ul class="subnav">' + kids.map((k) =>
          '<li><a href="' + k.href + '" class="' + (sub === k.id ? "active" : "") + '">' + esc(k.label) + (k.locked ? '<span class="lock">' + icon("lock", "xs") + "</span>" : "") + "</a></li>").join("") + "</ul>";
      }
      return html + "</li>";
    }).join("");
    document.getElementById("sidebar").innerHTML =
      '<ul class="nav">' + items + "</ul>" +
      '<div class="help-card"><strong>도움이 필요하신가요?</strong><p>궁금한 점은 Q&A의 자주 묻는 질문에서 먼저 확인하시고, 안 풀리면 요청사항 탭에서 문의해 주세요.</p>' +
      '<a class="btn btn-tertiary btn-sm btn-block" href="#/qna?tab=request">문의 남기기</a></div>';
  }

  /* ---------------- 페이지: 홈 ---------------- */
  function pageHome() {
    const o = overallStats();
    const nm = nextMissionOverall();
    const today = todayStr();
    const upcoming = D.schedule.filter((s) => s.date >= today).slice(0, 3);
    const nextLive = upcoming[0];
    const notices = D.notices.slice().sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date)).slice(0, 4);
    const quote = D.quotes[parseDate(today).getDate() % D.quotes.length];
    const mv = D.motivation[0];
    const dday = nextLive ? daysUntil(nextLive.date) : null;
    return '<div class="page">' +
      '<header class="page-head greet"><span class="greet-icon">' + icon("sprout", "lg") + '</span><div><h1>' + esc(me.name) + "님, 다시 만나서 반갑습니다</h1><p>" + esc(quote) + "</p></div></header>" +

      '<section class="card"><div class="home-video-head"><h2>' + icon("flame") + "오늘의 동기부여</h2>" +
        '<a class="link-btn" href="#/motivation">지난 영상 보기 ' + icon("arrowRight", "sm") + "</a></div>" + video(mv) +
        '<p class="tiny" style="margin:12px 0 0">' + esc(mv.title) + "</p></section>" +

      '<div class="grid-3" style="margin-top:14px">' +
        '<a class="card stat" href="#/missions" style="text-decoration:none;color:inherit"><span class="stat-label">전체 진행률</span><span class="stat-value">' + o.pct + "%</span>" + progressBar(o.pct, true) + "</a>" +
        '<a class="card stat" href="#/certificate" style="text-decoration:none;color:inherit"><span class="stat-label">필수 과제 통과</span><span class="stat-value">' + o.reqDone + ' <small class="tiny">/ ' + o.reqTotal + "</small></span><span class=\"tiny\">모두 통과하면 수료증 발급</span></a>" +
        '<a class="card stat" href="#/schedule" style="text-decoration:none;color:inherit"><span class="stat-label">다음 라이브</span><span class="stat-value">' + (nextLive ? (dday === 0 ? "오늘" : "D-" + dday) : "-") + '</span><span class="tiny">' + (nextLive ? esc(fmtMD(nextLive.date) + " " + nextLive.time) : "예정된 일정 없음") + "</span></a>" +
      "</div>" +

      '<div class="section-head"><h2>이어서 할 과제</h2><a class="link-btn" href="#/missions">전체 과제 ' + icon("arrowRight", "sm") + "</a></div>" +
      (nm
        ? '<a class="card next-card" href="#/missions/' + nm.weekNo + "/" + nm.id + '" style="text-decoration:none;color:inherit"><span class="wk-icon">' + icon("checks") + "</span>" +
            '<div style="flex:1;min-width:0"><div class="tiny">' + nm.weekNo + "주차 · " + (nm.required ? "필수" : "선택") + '</div><div class="m-title">' + esc(nm.title) + " " + stateBadge(nm.id) + '</div><div class="m-desc">' + esc(nm.desc) + "</div></div>" +
            '<span class="btn btn-primary btn-sm">열기 ' + icon("arrowRight", "sm") + "</span></a>"
        : '<div class="card callout-ok callout">' + icon("check") + "<div>열린 주차의 과제를 모두 마쳤어요! 다음 주차가 열리면 알려 드릴게요.</div></div>") +

      '<div class="grid-2" style="margin-top:14px">' +
        '<section class="card"><div class="home-video-head"><h2>공지사항</h2><a class="link-btn" href="#/notices">더보기 ' + icon("arrowRight", "sm") + "</a></div>" +
          notices.map((n) => '<a class="list-row" href="#/notices/' + n.id + '">' + (n.pinned ? '<span class="badge badge-ink">필독</span>' : "") + '<span class="lr-title">' + esc(n.title) + '</span><span class="lr-date">' + fmtMD(n.date) + "</span></a>").join("") +
        "</section>" +
        '<section class="card"><div class="home-video-head"><h2>다가오는 일정</h2><a class="link-btn" href="#/schedule">전체 일정 ' + icon("arrowRight", "sm") + "</a></div>" +
          (upcoming.length ? upcoming.map((s) => {
            const d = parseDate(s.date);
            return '<div class="list-row"><span class="date-pill' + (s.date === today ? " today" : "") + '"><small>' + (d.getMonth() + 1) + "월</small><b>" + d.getDate() + '</b></span><span class="lr-title">' + esc(s.title) + '</span><span class="lr-date">' + DOW[d.getDay()] + " " + esc(s.time) + "</span></div>";
          }).join("") : '<p class="muted">예정된 일정이 없습니다.</p>') +
        "</section>" +
      "</div>" +
    "</div>";
  }

  /* ---------------- 페이지: 커리큘럼 ---------------- */
  function pageCurriculum(r) {
    const lessonId = r.parts[1];
    if (lessonId) return pageLesson(lessonId);
    const allL = D.weeks.flatMap((w) => w.lessons);
    const watched = allL.filter((l) => P.watched[l.id]).length;
    return '<div class="page">' + pageHead("커리큘럼", "주차별 강의 영상을 보고, 다 본 강의는 시청 완료로 표시하세요.") +
      '<div class="card overall"><div class="overall-top"><span>강의 시청</span>' + pctText(allL.length ? Math.round((watched / allL.length) * 100) : 0) + "</div>" +
        progressBar(allL.length ? Math.round((watched / allL.length) * 100) : 0) + '<span class="tiny">전체 ' + allL.length + "개 강의 중 " + watched + "개 시청 완료</span></div>" +
      '<div style="margin-top:14px">' + D.weeks.map((w) => {
        const open = isOpen(w);
        return '<section class="card week-block">' +
          '<div class="week-block-head"><span class="wk-icon">' + icon(open ? "book" : "lock") + "</span><div><h3>" + w.no + "주차 · " + esc(w.title) + "</h3><p>" + esc(w.summary) + "</p></div>" +
            (open ? '<span class="badge badge-positive">공개</span>' : '<span class="badge badge-neutral">' + fmtMD(w.openDate) + " 공개</span>") + "</div>" +
          w.lessons.map((l) => {
            const inner = thumb(l) + '<div><div class="lesson-title">' + esc(l.title) + '</div><div class="lesson-desc">' + esc(l.desc) + "</div></div>" +
              (P.watched[l.id] ? '<span class="badge badge-positive">' + icon("check", "xs") + "시청 완료</span>" : '<span class="tiny">' + l.minutes + "분</span>");
            return open ? '<a class="lesson" href="#/curriculum/' + l.id + '">' + inner + "</a>" : '<div class="lesson" aria-disabled="true" style="opacity:.55">' + inner + "</div>";
          }).join("") +
        "</section>";
      }).join("") + "</div></div>";
  }

  function pageLesson(id) {
    const w = D.weeks.find((x) => x.lessons.some((l) => l.id === id));
    if (!w) return notFound();
    const all = D.weeks.flatMap((x) => x.lessons.map((l) => Object.assign({ w: x }, l)));
    const i = all.findIndex((l) => l.id === id);
    const l = all[i];
    if (!isOpen(w)) return lockedPage(w);
    const prev = all[i - 1], next = all[i + 1];
    const done = !!P.watched[id];
    return '<div class="page">' + pageHead(l.title, w.no + "주차 · " + w.title + " · " + l.minutes + "분", crumb([["커리큘럼", "#/curriculum"], [w.no + "주차", "#/curriculum"], [l.title]])) +
      '<section class="card">' + video(l) +
        '<p style="margin:18px 0 0;font-size:16px;line-height:1.75">' + esc(l.desc) + "</p>" +
        '<div class="guide-actions" style="margin-top:20px">' +
          '<button class="btn ' + (done ? "btn-secondary" : "btn-primary") + '" data-action="toggle-watched" data-id="' + id + '">' + icon("check", "sm") + (done ? "시청 완료됨 · 취소" : "시청 완료로 표시") + "</button>" +
          '<a class="btn btn-tertiary" href="#/missions/' + w.no + '">' + w.no + "주차 과제 보기</a>" +
        "</div></section>" +
      '<div class="grid-2" style="margin-top:14px">' +
        (prev && isOpen(prev.w) ? '<a class="card list-row" href="#/curriculum/' + prev.id + '">' + icon("chevLeft") + '<span class="lr-title"><span class="tiny">이전 강의</span><br>' + esc(prev.title) + "</span></a>" : "<div></div>") +
        (next && isOpen(next.w) ? '<a class="card list-row" href="#/curriculum/' + next.id + '" style="text-align:right"><span class="lr-title"><span class="tiny">다음 강의</span><br>' + esc(next.title) + "</span>" + icon("chevRight") + "</a>" : "<div></div>") +
      "</div></div>";
  }

  /* ---------------- 페이지: 과제 ---------------- */
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
    const st = weekStats(w);
    const open = isOpen(w);
    const nm = open ? nextMission(w) : null;
    const top = '<div class="wk-top"><span class="wk-icon">' + icon("book") + '</span><div><div class="wk-title">' + w.no + '주차</div><div class="wk-meta">필수 ' + st.req + " · 선택 " + st.opt + " · " + st.done + "/" + st.total + " 완료</div></div>" + pctText(st.pct) + "</div>";
    if (!open) {
      return '<div class="week-card locked">' + top + progressBar(0, true) + '<div class="wk-foot"><span class="lock-msg">' + icon("lock", "sm") + fmtMD(w.openDate) + "부터 과제 제출이 공개됩니다.</span></div></div>";
    }
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
      const typeLabel = { image: "사진 인증", link: "링크 제출", text: "글 작성" }[m.type];
      return '<a class="mission" href="#/missions/' + w.no + "/" + m.id + '"><span class="m-check ' + (s === "done" ? "done" : s === "fix" ? "fix" : "") + '">' +
        (s === "done" ? icon("check", "sm") : s === "fix" ? "!" : icon(m.type === "image" ? "image" : m.type === "link" ? "link" : "pen", "sm")) + "</span>" +
        '<div style="min-width:0"><div class="m-title">' + esc(m.title) + " " + stateBadge(m.id) + '</div><div class="m-desc">' + typeLabel + " · " + esc(m.desc) + "</div></div>" +
        icon("chevRight") + "</a>";
    };
    const req = w.missions.filter((m) => m.required), opt = w.missions.filter((m) => !m.required);
    return '<div class="page">' + pageHead(w.no + "주차 · " + w.title, w.summary, crumb([["과제 제출하기", "#/missions"], [w.no + "주차"]])) +
      '<section class="card overall"><div class="overall-top"><span>' + w.no + "주차 진행률</span>" + pctText(st.pct) + "</div>" + progressBar(st.pct) +
        '<span class="tiny" style="color:var(--body)">필수 ' + st.req + " · 선택 " + st.opt + " · " + st.total + "개 중 " + st.done + "개 완료 · " + fmtMD(w.openDate) + " 공개</span></section>" +
      '<div class="section-head"><h2>필수 과제 <span class="tiny">' + req.length + "개</span></h2></div>" + req.map(row).join("") +
      (opt.length ? '<div class="section-head"><h2>선택 과제 <span class="tiny">' + opt.length + "개</span></h2><span class=\"hint\">하면 더 좋아요</span></div>" + opt.map(row).join("") : "") +
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
    const typeLabel = { image: "사진 · PDF 인증", link: "링크 제출", text: "글 작성" }[m.type];
    const c = m.check || {};

    let form = '<form id="submit-form" data-id="' + id + '" class="stack" novalidate>';
    if (m.type === "image") {
      form += '<label class="dropzone" id="dropzone"><input type="file" id="file-input" accept="image/*,.pdf" multiple class="sr-only">' + icon("image") +
        "<strong>사진 또는 PDF를 끌어다 놓거나 눌러서 선택</strong><span class=\"tiny\">최대 3개 · 개인정보(주민번호·계좌번호)는 가리고 올려 주세요</span></label>" +
        '<div class="thumbs" id="thumbs">' + draftThumbs() + "</div>" +
        '<div class="field"><label for="sub-text">메모 <span class="tiny">(선택)</span></label><textarea class="textarea" id="sub-text" name="text" rows="3" style="min-height:96px" placeholder="강사님께 남길 말이 있으면 적어 주세요"></textarea></div>';
    } else if (m.type === "link") {
      form += '<div class="field"><label for="sub-link">링크</label><input class="input" id="sub-link" name="link" type="url" inputmode="url" placeholder="https://' + esc(c.linkHint || "") + (c.linkHint ? "/…" : "") + '" value="' + esc(last ? last.link : "") + '"></div>' +
        '<div class="field"><label for="sub-text">메모 <span class="tiny">(선택)</span></label><textarea class="textarea" id="sub-text" name="text" rows="3" style="min-height:96px">' + esc(last ? last.text : "") + "</textarea></div>";
    } else {
      form += '<div class="field"><label for="sub-text">내용 <span class="tiny" id="char-count">' + (c.minLength ? "최소 " + c.minLength + "자" : "") + "</span></label>" +
        '<textarea class="textarea" id="sub-text" name="text" rows="8" data-min="' + (c.minLength || 0) + '" placeholder="' + esc(m.steps.join(" / ")) + '">' + esc(last ? last.text : "") + "</textarea></div>";
    }
    form += '<button class="btn btn-primary" type="submit">' + icon("send", "sm") + (last ? "다시 제출하고 검수받기" : "제출하고 자동검수 받기") + "</button></form>";

    const result = last ? resultBox(last) : "";
    const history = subs.length
      ? '<ul class="history">' + subs.slice().reverse().map((s, i) => "<li><span>" + (subs.length - i) + "차 제출 · " + fmtStamp(s.at) + "</span>" + (s.result.pass ? '<span class="badge badge-positive">통과</span>' : '<span class="badge badge-warning">보완</span>') + "</li>").join("") + "</ul>"
      : '<p class="tiny" style="margin:0">아직 제출 기록이 없어요.</p>';

    return '<div class="page">' + pageHead(m.title, "", crumb([["과제 제출하기", "#/missions"], [w.no + "주차", "#/missions/" + w.no], [m.title]])) +
      '<div class="detail-grid">' +
        '<section class="card">' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">' + (m.required ? '<span class="badge badge-ink">필수</span>' : '<span class="badge badge-neutral">선택</span>') + '<span class="badge badge-neutral">' + typeLabel + "</span>" + stateBadge(id) + "</div>" +
          '<p style="margin:0 0 20px;font-size:16px;line-height:1.75">' + esc(m.desc) + "</p>" +
          '<p class="side-label">이렇게 하세요</p><ol class="steps">' + m.steps.map((s) => "<li>" + esc(s) + "</li>").join("") + "</ol>" +
          '<hr style="border:0;border-top:1px solid var(--line-soft);margin:24px 0">' +
          form + '<div id="result">' + result + "</div>" +
        "</section>" +
        '<aside class="stack">' +
          '<div class="card"><p class="side-label">자동검수 기준</p><ul class="history">' + checkCriteria(m).map((t) => "<li><span>" + esc(t) + "</span></li>").join("") + "</ul></div>" +
          '<div class="card"><p class="side-label">제출 이력</p>' + history + "</div>" +
          '<div class="card card-dark"><p style="margin:0 0 12px;font-weight:800;color:var(--primary)">막히셨나요?</p><p class="tiny" style="color:#b8bdb2;margin:0 0 14px">' + esc(D.brand.botName) + "에게 바로 물어보세요.</p>" +
            '<button class="btn btn-primary btn-sm btn-block" data-action="ask-bot" data-q="' + esc(m.title + " 어떻게 해요?") + '">' + icon("sparkles", "sm") + "AI봇에게 물어보기</button></div>" +
        "</aside>" +
      "</div></div>";
  }
  function checkCriteria(m) {
    const c = m.check || {}, out = [];
    if (c.image) out.push("인증 사진·PDF 1개 이상");
    if (c.link) out.push("올바른 링크 형식" + (c.linkHint ? " (" + c.linkHint + ")" : ""));
    if (c.minLength) out.push("공백 제외 " + c.minLength + "자 이상");
    (c.keywords || []).forEach((k) => out.push("‘" + k + "’ 포함"));
    return out;
  }
  function resultBox(s) {
    if (s.result.pass) {
      return '<div class="result pass"><h4>' + icon("check") + "자동검수 통과</h4><p>" + esc(fmtStamp(s.at)) + " 제출 · 수고하셨어요! 진행률에 반영되었습니다.</p>" +
        (s.result.ok.length ? "<ul>" + s.result.ok.map((t) => "<li>" + esc(t) + "</li>").join("") + "</ul>" : "") + "</div>";
    }
    return '<div class="result fix"><h4>' + icon("alert") + "보완이 필요해요</h4><p>아래 항목을 채워서 다시 제출해 주세요.</p><ul>" + s.result.reasons.map((t) => "<li>" + esc(t) + "</li>").join("") + "</ul></div>";
  }
  function draftThumbs() {
    return draft.files.map((f, i) =>
      '<div class="thumb">' + (f.type === "pdf" ? '<div style="display:grid;place-items:center;height:100%;padding:8px;text-align:center;font-size:12px;font-weight:700">' + icon("file") + esc(f.name) + "</div>" : '<img src="' + f.data + '" alt="' + esc(f.name) + '">') +
      '<button type="button" data-action="remove-file" data-i="' + i + '" aria-label="삭제">' + icon("x", "xs") + "</button></div>").join("");
  }
  function addFiles(fileList) {
    const files = Array.from(fileList || []);
    files.forEach((file) => {
      if (draft.files.length >= 3) { toast("파일은 최대 3개까지 올릴 수 있어요."); return; }
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        draft.files.push({ type: "pdf", name: file.name });
        refreshThumbs();
        return;
      }
      if (!/^image\//.test(file.type)) { toast("사진 또는 PDF만 올릴 수 있어요."); return; }
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
        img.onerror = () => toast("사진을 읽지 못했어요. 다른 파일로 시도해 주세요.");
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  function refreshThumbs() { const t = document.getElementById("thumbs"); if (t) t.innerHTML = draftThumbs(); }

  function submitMission(form) {
    const id = form.dataset.id;
    const m = findMission(id);
    const sub = {
      at: Date.now(),
      text: form.text ? form.text.value : "",
      link: form.link ? form.link.value : "",
      files: m.type === "image" ? draft.files.slice() : []
    };
    sub.result = autoCheck(m, sub);
    const before = isDone(id);
    (P.submissions[id] = P.submissions[id] || []).push(sub);
    if (!saveProgress()) { P.submissions[id].pop(); return; }
    if (sub.result.pass) draft.files = [];
    render();
    const res = document.getElementById("result");
    if (res) res.scrollIntoView({ behavior: "smooth", block: "center" });
    toast(sub.result.pass ? (before ? "다시 제출했어요. 통과 상태가 유지됩니다." : "자동검수 통과! 진행률에 반영됐어요.") : "보완이 필요한 항목이 있어요.", sub.result.pass ? "" : "warn");
  }

  /* ---------------- 페이지: 강의 일정 ---------------- */
  function pageSchedule() {
    const today = todayStr();
    if (!calCursor) {
      const t = parseDate(today);
      const start = parseDate(D.cohort.startDate);
      const end = parseDate(D.cohort.endDate);
      const base = t < start ? start : t > end ? end : t;
      calCursor = { y: base.getFullYear(), m: base.getMonth() };
    }
    const { y, m } = calCursor;
    const first = new Date(y, m, 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < Math.ceil((startOffset + daysInMonth) / 7) * 7; i++) cells.push(new Date(y, m, 1 - startOffset + i));
    const key = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const evCls = { live: "ev-live", qna: "ev-qna", event: "ev-event" };
    const evLabel = { live: "라이브 강의", qna: "Q&A 라이브", event: "행사" };
    const upcoming = D.schedule.filter((s) => s.date >= today);
    const past = D.schedule.filter((s) => s.date < today);
    const row = (s) => {
      const d = parseDate(s.date);
      return '<div class="list-row"><span class="date-pill' + (s.date === today ? " today" : "") + '"><small>' + (d.getMonth() + 1) + "월</small><b>" + d.getDate() + "</b></span>" +
        '<span class="lr-title">' + esc(s.title) + '<br><span class="tiny">' + DOW[d.getDay()] + "요일 " + esc(s.time) + " · " + esc(s.place) + "</span></span>" +
        '<span class="cal-ev ' + evCls[s.type] + '" style="font-size:12px;height:auto;padding:2px 8px">' + evLabel[s.type] + "</span></div>";
    };
    return '<div class="page">' + pageHead("강의 일정", D.cohort.name + " 라이브 강의와 Q&A 일정을 확인하세요. (" + fmtMD(D.cohort.startDate) + " ~ " + fmtMD(D.cohort.endDate) + ")") +
      '<section class="card"><div class="cal-head"><h2>' + y + "년 " + (m + 1) + "월</h2>" +
        '<div class="cal-nav"><button class="icon-btn" data-action="cal-move" data-d="-1" aria-label="이전 달">' + icon("chevLeft") + '</button><button class="icon-btn" data-action="cal-move" data-d="1" aria-label="다음 달">' + icon("chevRight") + "</button></div></div>" +
        '<div class="cal">' + DOW.map((d) => '<div class="cal-dow">' + d + "</div>").join("") +
          cells.map((d) => {
            const k = key(d);
            const evs = D.schedule.filter((s) => s.date === k);
            return '<div class="cal-day' + (d.getMonth() !== m ? " other" : "") + (k === today ? " today" : "") + '"><span class="d">' + d.getDate() + "</span>" +
              evs.map((e) => '<span class="cal-ev ' + evCls[e.type] + '" title="' + esc(e.time + " " + e.title) + '">' + esc(e.time + " " + e.title) + "</span>").join("") + "</div>";
          }).join("") +
        "</div>" +
        '<div class="legend"><span><i class="ev-live"></i>라이브 강의</span><span><i class="ev-qna"></i>Q&A 라이브</span><span><i class="ev-event"></i>행사</span></div>' +
      "</section>" +
      '<div class="section-head"><h2>다가오는 일정</h2></div><section class="card">' + (upcoming.length ? upcoming.map(row).join("") : '<p class="muted" style="margin:0">예정된 일정이 없습니다.</p>') + "</section>" +
      (past.length ? '<div class="section-head"><h2>지난 일정</h2><a class="link-btn" href="#/curriculum">다시보기는 커리큘럼에서 ' + icon("arrowRight", "sm") + '</a></div><section class="card" style="opacity:.75">' + past.slice().reverse().map(row).join("") + "</section>" : "") +
      "</div>";
  }

  /* ---------------- 페이지: 공지사항 ---------------- */
  function pageNotices(r) {
    const id = r.parts[1];
    const list = D.notices.slice().sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date));
    if (id) {
      const n = D.notices.find((x) => x.id === id);
      if (!n) return notFound();
      return '<div class="page">' + pageHead("공지사항", "", crumb([["공지사항", "#/notices"], ["상세"]])) +
        '<article class="card article">' + (n.pinned ? '<span class="badge badge-ink" style="margin-bottom:10px">필독</span>' : "") + "<h2>" + esc(n.title) + '</h2><div class="meta">' + esc(D.brand.instructor) + " · " + fmtFull(n.date) + '</div><div class="body">' + esc(n.body) + "</div></article>" +
        '<div style="margin-top:14px"><a class="btn btn-secondary" href="#/notices">' + icon("chevLeft", "sm") + "목록으로</a></div></div>";
    }
    return '<div class="page">' + pageHead("공지사항", D.brand.instructor + "이 전하는 안내와 소식입니다.") +
      '<section class="card">' + list.map((n) =>
        '<a class="notice-row" href="#/notices/' + n.id + '">' + (n.pinned ? '<span class="badge badge-ink">' + icon("pin", "xs") + "필독</span>" : '<span class="badge badge-neutral">공지</span>') +
        '<span class="lr-title">' + esc(n.title) + '</span><span class="lr-date">' + fmtFull(n.date) + "</span></a>").join("") + "</section></div>";
  }

  /* ---------------- 페이지: Q&A ---------------- */
  function pageQna(r) {
    if (r.params.get("tab")) qnaTab = r.params.get("tab") === "request" ? "request" : "faq";
    const tabs = '<div class="tabs" role="tablist"><button class="tab' + (qnaTab === "faq" ? " active" : "") + '" data-action="qna-tab" data-tab="faq" role="tab" aria-selected="' + (qnaTab === "faq") + '">자주 묻는 질문</button>' +
      '<button class="tab' + (qnaTab === "request" ? " active" : "") + '" data-action="qna-tab" data-tab="request" role="tab" aria-selected="' + (qnaTab === "request") + '">요청사항</button></div>';
    let body;
    if (qnaTab === "faq") {
      body = '<section class="card"><div class="search">' + icon("search") + '<input class="input" id="faq-search" type="search" placeholder="궁금한 내용을 검색해 보세요 (예: 통관, 마진, 로그인)" aria-label="자주 묻는 질문 검색"></div>' +
        '<div id="faq-list">' + faqList("") + "</div></section>";
    } else {
      const qs = P.questions.slice().reverse();
      body = '<section class="card"><h2 style="margin:0 0 4px;font-size:18px;font-weight:800">문의 남기기</h2><p class="tiny" style="margin:0 0 16px">' + esc(D.brand.instructor) + "과 운영진이 확인 후 답변드려요. 라이브 Q&A에서 함께 다루기도 합니다.</p>" +
        '<form id="question-form" class="stack" novalidate><div class="field"><label for="q-title">제목</label><input class="input" id="q-title" name="title" maxlength="80" placeholder="예: 통신판매업 신고에서 막혔어요"></div>' +
        '<div class="field"><label for="q-body">내용</label><textarea class="textarea" id="q-body" name="body" placeholder="어떤 단계에서, 어떤 화면이 나오는지 적어 주시면 더 빨리 도와드릴 수 있어요."></textarea></div>' +
        '<div style="display:flex;justify-content:flex-end"><button class="btn btn-primary" type="submit">' + icon("send", "sm") + "문의 등록</button></div></form></section>" +
        '<div class="section-head"><h2>내 문의 <span class="tiny">' + qs.length + "건</span></h2></div>" +
        '<section class="card">' + (qs.length ? qs.map((q) =>
          '<div class="qa-item"><div class="qa-head">' + (q.answer ? '<span class="badge badge-positive">답변 완료</span>' : '<span class="badge badge-warning">답변 대기</span>') + '<span class="qa-title">' + esc(q.title) + '</span><span class="lr-date" style="margin-left:auto">' + fmtStamp(q.at) + "</span></div>" +
          '<div class="qa-body">' + esc(q.body) + "</div>" + (q.answer ? '<div class="qa-answer"><b>' + esc(D.brand.instructor) + "</b> · " + esc(q.answer) + "</div>" : "") + "</div>").join("")
          : '<div class="empty">' + icon("message") + "아직 남긴 문의가 없어요.</div>") + "</section>";
    }
    return '<div class="page">' + pageHead("Q&A", "자주 묻는 질문에서 먼저 찾아보고, 해결이 안 되면 요청사항으로 문의해 주세요.") + tabs + body + "</div>";
  }
  function faqList(q) {
    const t = q.trim().toLowerCase();
    const list = D.faqs.filter((f) => !t || (f.q + f.a + f.tags.join(" ")).toLowerCase().indexOf(t) !== -1);
    if (!list.length) return '<div class="empty">' + icon("search") + "검색 결과가 없어요.<br><button class=\"btn btn-tertiary btn-sm\" style=\"margin-top:14px\" data-action=\"qna-tab\" data-tab=\"request\">요청사항으로 문의하기</button></div>";
    return list.map((f) => '<details class="faq"><summary><span class="q">Q</span><span>' + esc(f.q) + "</span>" + icon("chevDown", "sm chev") + '</summary><div class="a">' + esc(f.a) + "</div></details>").join("");
  }

  /* ---------------- 페이지: 서류 준비 가이드 ---------------- */
  function pageDocs() {
    const done = D.docsGuide.filter((g) => P.docs[g.step]).length;
    const pct = Math.round((done / D.docsGuide.length) * 100);
    return '<div class="page">' + pageHead("서류 준비 가이드", "뉴질랜드 건강식품을 합법적으로 판매하기 위해 필요한 서류를 순서대로 준비하세요.") +
      '<section class="card overall"><div class="overall-top"><span>서류 준비</span>' + pctText(pct) + "</div>" + progressBar(pct) + '<span class="tiny" style="color:var(--body)">' + D.docsGuide.length + "단계 중 " + done + "단계 완료</span></section>" +
      '<div class="callout callout-warn" style="margin-top:14px">' + icon("alert") + "<div>기관 이름·수수료·처리 기간은 바뀔 수 있어요. 신청 전에 각 기관 안내를 꼭 한 번 더 확인해 주세요.</div></div>" +
      '<div class="stack" style="margin-top:14px">' + D.docsGuide.map((g) => {
        const ok = !!P.docs[g.step];
        return '<section class="card guide-step' + (ok ? " done" : "") + '"><span class="guide-num">' + (ok ? icon("check") : g.step) + "</span><div>" +
          "<h3>" + esc(g.title) + (ok ? ' <span class="badge badge-positive">준비 완료</span>' : "") + "</h3>" +
          '<div class="guide-facts"><span>' + icon("mapPin", "sm") + esc(g.where) + "</span><span>" + icon("clock", "sm") + esc(g.time) + "</span><span>" + icon("coins", "sm") + esc(g.cost) + "</span></div>" +
          '<div class="guide-cols"><div class="guide-box"><h4>필요 서류</h4><ul>' + g.docs.map((d) => "<li>" + esc(d) + "</li>").join("") + '</ul></div><div class="guide-box"><h4>' + esc(D.brand.instructor) + " 팁</h4><ul>" + g.tips.map((d) => "<li>" + esc(d) + "</li>").join("") + "</ul></div></div>" +
          '<div class="guide-actions"><a class="btn btn-tertiary btn-sm" href="' + esc(g.url) + '" target="_blank" rel="noopener">' + esc(g.where.split(" · ")[0]) + " 바로가기 " + icon("arrowUpRight", "xs") + "</a>" +
          '<button class="btn btn-sm ' + (ok ? "btn-secondary" : "btn-primary") + '" data-action="toggle-doc" data-step="' + g.step + '">' + icon("check", "sm") + (ok ? "완료 취소" : "준비 완료로 표시") + "</button></div>" +
        "</div></section>";
      }).join("") + "</div></div>";
  }

  /* ---------------- AI 봇 ---------------- */
  // 지금은 강의 데이터(FAQ·서류 가이드·과제·일정)를 찾아서 답하는 규칙형 봇이다.
  // 서버가 붙으면 askBot() 안쪽만 LLM API 호출로 바꾸면 된다.
  const BOT_CHIPS = ["다음 라이브 언제예요?", "내 진행률 알려줘", "구매대행업 등록 방법", "면세 한도가 얼마예요?", "마진 계산은 어떻게 해요?", "수료 조건이 뭐예요?"];
  function botGreeting() {
    return { from: "bot", text: "안녕하세요! 24시간 언제든 물어보세요. " + D.brand.instructor + "의 노하우를 그대로 담은 " + D.brand.botName.replace(/^24시\s*/, "") + "이 바로 답변해 드릴게요." };
  }
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
    if (/^(안녕|hi|hello|하이|ㅎㅇ)/i.test(t)) return { text: me.name + "님 안녕하세요! 과제, 서류, 소싱, 일정 무엇이든 물어보세요." };
    if (/(라이브|강의\s*일정|다음\s*강의|언제.*(강의|라이브)|일정)/.test(t)) {
      const n = D.schedule.find((s) => s.date >= today);
      return n
        ? { text: "다음 일정은 " + fmtMD(n.date) + " " + n.time + " ‘" + n.title + "’ 입니다. (" + n.place + ")\n지난 라이브 다시보기는 커리큘럼 메뉴에 올라가요.", links: [["강의 일정 보기", "#/schedule"]] }
        : { text: "예정된 라이브 일정이 없어요. 공지사항을 확인해 주세요.", links: [["공지사항", "#/notices"]] };
    }
    if (/(진행률|진도|몇\s*개|얼마나\s*했|남은\s*과제)/.test(t)) {
      const o = overallStats();
      const nm = nextMissionOverall();
      return { text: me.name + "님은 전체 " + o.total + "개 과제 중 " + o.done + "개를 마쳤어요. (" + o.pct + "%)\n필수 과제는 " + o.reqTotal + "개 중 " + o.reqDone + "개 통과했어요." + (nm ? "\n다음으로 할 과제는 ‘" + nm.title + "’ 입니다." : ""),
        links: nm ? [["바로 하러 가기", "#/missions/" + nm.weekNo + "/" + nm.id]] : [["과제 보기", "#/missions"]] };
    }
    if (/수료/.test(t)) {
      const o = overallStats();
      return { text: "필수 과제 " + o.reqTotal + "개를 모두 자동검수 통과하면 수료증이 발급돼요. 지금 " + o.reqDone + "개 통과, " + (o.reqTotal - o.reqDone) + "개 남았어요.", links: [["수료증 보기", "#/certificate"]] };
    }
    if (/(마진|계산기|순이익|판매가)/.test(t)) {
      return { text: "자료실 ‘자료 파일’에 있는 마진 계산기에 현지가(NZD)·환율·배송대행비·수수료·광고비를 넣으면 순이익과 마진율이 바로 나와요. 판매가 기준 순이익 20~30%를 목표로 잡아 보세요.", links: [["마진 계산기 열기", "#/library/file?tool=calculator"]] };
    }

    // FAQ · 서류 가이드 · 과제에서 가장 비슷한 답 찾기
    const cands = [];
    D.faqs.forEach((f) => {
      let s = similarity(t, f.q) * 2;
      f.tags.forEach((tag) => { if (t.indexOf(tag) !== -1) s += 1.2; });
      cands.push({ s, text: f.a, links: [["Q&A 더 보기", "#/qna"]] });
    });
    D.docsGuide.forEach((g) => {
      let s = similarity(t, g.title) * 2.2;
      if (t.replace(/\s/g, "").indexOf(g.title.replace(/\s/g, "")) !== -1) s += 2;
      cands.push({ s, text: "‘" + g.title + "’은(는) " + g.where + "에서 진행해요. (소요 " + g.time + ", 비용 " + g.cost + ")\n필요 서류: " + g.docs.join(", ") + "\n팁: " + g.tips.join(" / "), links: [["서류 준비 가이드", "#/docs"]] });
    });
    allMissions().forEach((m) => {
      const s = similarity(t, m.title) * 1.8;
      cands.push({ s, text: "‘" + m.title + "’ 과제는 이렇게 하면 돼요.\n" + m.steps.map((x, i) => (i + 1) + ". " + x).join("\n"), links: [[m.weekNo + "주차 과제로 이동", "#/missions/" + m.weekNo + "/" + m.id]] });
    });
    cands.sort((a, b) => b.s - a.s);
    if (cands[0] && cands[0].s >= 0.9) return cands[0];
    return { text: "그 부분은 제가 정확히 답하기 어려워요. 요청사항에 남겨 주시면 " + D.brand.instructor + "과 운영진이 직접 답변드릴게요.", links: [["요청사항 남기기", "#/qna?tab=request"], ["자주 묻는 질문", "#/qna"]] };
  }
  function chatLog() {
    const msgs = [botGreeting()].concat(P.chat);
    return msgs.map((m) =>
      '<div class="msg' + (m.from === "me" ? " me" : "") + '">' + (m.from === "me" ? "" : '<span class="msg-avatar">' + icon("sparkles", "sm") + "</span>") +
      '<div class="msg-bubble">' + esc(m.text) + (m.links && m.links.length ? '<div class="msg-links">' + m.links.map((l) => '<a href="' + esc(l[1]) + '">' + esc(l[0]) + "</a>").join("") + "</div>" : "") + "</div></div>").join("") +
      (botThinking ? '<div class="msg"><span class="msg-avatar">' + icon("sparkles", "sm") + '</span><div class="msg-bubble"><span class="typing-dots"><i></i><i></i><i></i></span></div></div>' : "");
  }
  function sendChat(text) {
    text = (text || "").trim();
    if (!text || botThinking) return;
    P.chat.push({ from: "me", text, at: Date.now() });
    if (P.chat.length > 60) P.chat = P.chat.slice(-60);
    botThinking = true;
    saveProgress();
    refreshChats();
    setTimeout(() => {
      const a = askBot(text);
      botThinking = false;
      if (!me) return;
      P.chat.push({ from: "bot", text: a.text, links: a.links || [], at: Date.now() });
      saveProgress();
      refreshChats();
    }, 550);
  }
  function refreshChats() {
    document.querySelectorAll("[data-chat-log]").forEach((el) => { el.innerHTML = chatLog(); el.scrollTop = el.scrollHeight; });
  }
  const chatForm = (id) => '<form class="chat-form" data-chat-form><input class="input" name="q" id="' + id + '" autocomplete="off" placeholder="메시지 입력" aria-label="메시지 입력"><button class="btn btn-primary" type="submit">전송</button></form>';

  function pageBot() {
    return '<div class="page">' + pageHead(D.brand.botName, D.brand.instructor + "의 강의 내용과 자주 묻는 질문을 바탕으로 24시간 답해 드려요.") +
      '<section class="chat"><div class="chat-log" data-chat-log>' + chatLog() + "</div>" +
        '<div class="chips">' + BOT_CHIPS.map((c) => '<button class="chip" type="button" data-action="chip" data-q="' + esc(c) + '">' + esc(c) + "</button>").join("") + "</div>" +
        chatForm("chat-input-page") +
      "</section>" +
      '<p class="tiny" style="margin-top:12px">AI봇 답변은 참고용이에요. 사업자·통관 관련 최종 판단은 관할 기관 안내를 따라 주세요. ' +
      '<button class="link-btn" style="font-size:13px" data-action="clear-chat">대화 지우기</button></p></div>';
  }
  function renderBotFab(r) {
    const el = document.getElementById("bot-fab");
    if (!el) return;
    if (r.parts[0] === "bot") { el.innerHTML = ""; return; }
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

  /* ---------------- 페이지: 자료실 ---------------- */
  function pageLibrary(r) {
    const cat = r.parts[1];
    const warn = '<div class="callout callout-neg">' + icon("shield") + "<div>본 자료는 <b>유료 수강생 전용</b>입니다. 무단 다운로드·복사·캡처 배포 시 추적·법적 책임이 따릅니다.</div></div>";
    if (!cat) {
      return '<div class="page">' + pageHead("유료강의 자료실", "분류를 선택해서 자료를 확인하세요.") + warn +
        '<div class="grid-2" style="margin-top:14px">' + LIB.map((c) =>
          '<a class="res-card" href="#/library/' + c.id + '"><div class="res-top"><span class="res-icon ' + c.cls + '">' + icon(c.icon) + '</span><div><div class="res-title">' + esc(c.label) + '</div><div class="tiny">자료 ' + D.resources[c.id].length + "개</div></div></div>" +
          '<div class="res-desc">' + esc(c.desc()) + '</div><div class="res-foot"><span class="link-btn">열기 ' + icon("arrowRight", "sm") + "</span></div></a>").join("") + "</div></div>";
    }
    const c = LIB.find((x) => x.id === cat);
    if (!c) return notFound();
    const items = D.resources[cat];
    const isVideo = cat === "vod" || cat === "senior";
    const showCalc = r.params.get("tool") === "calculator";
    let body;
    if (isVideo) {
      body = '<div class="mv-grid">' + items.map((it) =>
        '<button type="button" class="mv-card" data-action="play" data-cat="' + cat + '" data-id="' + it.id + '">' + thumb(it) + '<span class="mv-title">' + esc(it.title) + '</span><span class="tiny">' + esc(it.meta) + " · " + esc(it.desc) + "</span></button>").join("") + "</div>";
    } else {
      body = items.map((it) => {
        const action = it.tool === "calculator"
          ? '<a class="btn btn-primary btn-sm" href="#/library/file?tool=calculator">' + icon("calculator", "sm") + "계산기 열기</a>"
          : it.url ? '<a class="btn btn-tertiary btn-sm" href="' + esc(it.url) + '" target="_blank" rel="noopener">' + icon(cat === "ebook" ? "book" : "download", "sm") + (cat === "ebook" ? "열람" : "다운로드") + "</a>"
          : '<button class="btn btn-secondary btn-sm" data-action="not-ready">준비 중</button>';
        return '<div class="res-item"><span class="res-icon ' + c.cls + '">' + icon(it.tool ? "calculator" : c.icon) + '</span><div style="min-width:0"><div class="m-title">' + esc(it.title) + '</div><div class="m-desc">' + esc(it.meta) + " · " + esc(it.desc) + "</div></div>" + action + "</div>";
      }).join("");
    }
    return '<div class="page">' + pageHead(c.label, c.desc(), crumb([["유료강의 자료실", "#/library"], [c.label]])) + warn +
      (showCalc ? '<div style="margin-top:14px">' + calculator() + "</div>" : "") +
      '<div style="margin-top:14px">' + body + "</div></div>";
  }
  function calculator() {
    const f = (id, label, val, suffix) => '<div class="field"><label for="' + id + '">' + label + '</label><div class="input-wrap"><input class="input" id="' + id + '" data-calc type="number" inputmode="decimal" step="any" min="0" value="' + val + '"><span class="input-addon" style="pointer-events:none">' + suffix + "</span></div></div>";
    return '<section class="card" id="calc"><div class="home-video-head"><h2>' + icon("calculator") + "마진 계산기</h2><span class=\"tiny\">숫자를 바꾸면 바로 계산돼요</span></div>" +
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

  /* ---------------- 페이지: 동기부여 ---------------- */
  function pageMotivation() {
    const today = todayStr();
    const quote = D.quotes[parseDate(today).getDate() % D.quotes.length];
    const [first, ...rest] = D.motivation;
    return '<div class="page">' + pageHead("동기부여", "지칠 때 꺼내 보는 영상과 한마디. 먼저 해낸 사람들의 이야기를 들어 보세요.") +
      '<div class="quote">“' + esc(quote) + "”<small>— " + esc(D.brand.instructor) + "</small></div>" +
      '<div class="section-head"><h2>오늘의 영상</h2><a class="link-btn" href="' + esc(D.brand.youtubeChannel) + '" target="_blank" rel="noopener">유튜브 채널 ' + icon("arrowUpRight", "sm") + "</a></div>" +
      '<section class="card">' + video(first) + '<p style="margin:14px 0 0;font-weight:700">' + esc(first.title) + "</p></section>" +
      '<div class="section-head"><h2>지난 영상</h2></div>' +
      '<div class="mv-grid">' + rest.map((it) => '<button type="button" class="mv-card" data-action="play" data-cat="motivation" data-id="' + it.id + '">' + thumb(it) + '<span class="mv-title">' + esc(it.title) + '</span><span class="tiny">' + esc(it.minutes) + " · " + fmtMD(it.date) + "</span></button>").join("") + "</div></div>";
  }

  /* ---------------- 페이지: 수료증 ---------------- */
  function pageCertificate() {
    const o = overallStats();
    const unlocked = o.reqDone === o.reqTotal;
    const remaining = allMissions().filter((m) => m.required && !isDone(m.id));
    let doneDate = todayStr();
    if (unlocked) {
      const ts = Math.max.apply(null, allMissions().filter((m) => m.required).map((m) => { const s = (P.submissions[m.id] || []).find((x) => x.result.pass); return s ? s.at : 0; }));
      if (ts) { const d = new Date(ts); doneDate = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
    }
    const pct = Math.round((o.reqDone / o.reqTotal) * 100);
    return '<div class="page">' + pageHead("수료증", "필수 과제 " + o.reqTotal + "개를 모두 통과하면 수료증이 발급됩니다.") +
      '<section class="card overall no-print"><div class="overall-top"><span>필수 과제 통과</span>' + pctText(pct) + "</div>" + progressBar(pct) + '<span class="tiny" style="color:var(--body)">' + o.reqTotal + "개 중 " + o.reqDone + "개 통과" + (unlocked ? " · 수료 조건을 모두 채웠어요!" : " · " + remaining.length + "개 남음") + "</span></section>" +
      '<div class="cert' + (unlocked ? "" : " locked") + '" style="margin-top:14px">' +
        '<img class="cert-mark" src="assets/logo-mark.svg" alt="">' +
        '<div class="cert-eyebrow">CERTIFICATE OF COMPLETION</div><h2>수 료 증</h2>' +
        '<div class="cert-name"><span>' + esc(me.name) + "</span></div>" +
        "<p>위 사람은 " + esc(D.brand.courseTitle) + " " + esc(D.cohort.name) + " 과정의 필수 과제를 모두 성실히 수행하였기에 이 증서를 드립니다.</p>" +
        '<div class="cert-foot"><span>과정 기간 ' + fmtFull(D.cohort.startDate) + " ~ " + fmtFull(D.cohort.endDate) + "<br>발급일 " + fmtFull(doneDate) + '</span><span class="cert-sign">' + esc(D.brand.name) + "<strong>" + esc(D.brand.instructor) + "</strong></span></div>" +
        (unlocked ? "" : '<div class="cert-lock">' + icon("lock") + "<strong>필수 과제 " + remaining.length + "개가 남았어요</strong><span class=\"muted\">모두 통과하면 이름이 새겨진 수료증이 열립니다.</span></div>") +
      "</div>" +
      (unlocked
        ? '<div class="guide-actions no-print" style="justify-content:center;margin-top:16px"><button class="btn btn-primary" data-action="print">' + icon("printer", "sm") + "인쇄 · PDF로 저장</button></div>"
        : '<div class="section-head no-print"><h2>남은 필수 과제</h2></div><section class="card no-print">' + remaining.map((m) => {
            const w = findWeek(m.weekNo);
            return isOpen(w)
              ? '<a class="list-row" href="#/missions/' + m.weekNo + "/" + m.id + '"><span class="badge badge-neutral">' + m.weekNo + '주차</span><span class="lr-title">' + esc(m.title) + "</span>" + stateBadge(m.id) + "</a>"
              : '<div class="list-row" style="opacity:.6"><span class="badge badge-neutral">' + m.weekNo + '주차</span><span class="lr-title">' + esc(m.title) + '</span><span class="lr-date">' + icon("lock", "xs") + " " + fmtMD(w.openDate) + "</span></div>";
          }).join("") + "</section>") +
      "</div>";
  }

  /* ---------------- 기타 페이지 ---------------- */
  function lockedPage(w) {
    return '<div class="page">' + pageHead(w.no + "주차 · " + w.title, "", crumb([["과제 제출하기", "#/missions"], [w.no + "주차"]])) +
      '<section class="card empty">' + icon("lock") + "<p style=\"font-size:18px;font-weight:800;color:var(--ink);margin:0 0 6px\">" + fmtMD(w.openDate) + "에 공개됩니다</p><p style=\"margin:0 0 20px\">" + esc(w.summary) + "</p>" +
      '<a class="btn btn-primary" href="#/missions">주차 목록으로</a></section></div>';
  }
  function notFound() {
    return '<div class="page"><section class="card empty">' + icon("alert") + '<p style="font-size:18px;font-weight:800;color:var(--ink)">페이지를 찾을 수 없어요</p><a class="btn btn-primary" href="#/home">홈으로</a></section></div>';
  }

  /* ---------------- 모달 · 토스트 ---------------- */
  function openModal(title, bodyHtml, actionsHtml) {
    modalRoot.innerHTML = '<div class="modal-backdrop" data-action="modal-close-bg"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
      '<div class="modal-head"><h3 id="modal-title">' + esc(title) + '</h3><button class="icon-btn" data-action="modal-close" aria-label="닫기">' + icon("x") + "</button></div>" +
      '<div class="modal-body">' + bodyHtml + "</div>" + (actionsHtml ? '<div class="modal-actions">' + actionsHtml + "</div>" : "") + "</div></div>";
    const btn = modalRoot.querySelector("[data-action=modal-close]");
    if (btn) btn.focus();
  }
  function closeModal() {
    // 모달 안 영상이 계속 재생되지 않도록 비운다
    modalRoot.innerHTML = "";
  }
  function toast(msg, kind) {
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = icon(kind === "warn" ? "alert" : "check", "sm") + "<span>" + esc(msg) + "</span>";
    toastRoot.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  const LEGAL = {
    terms: ["이용약관", "본 플랫폼은 " + D.brand.name + " 유료 강의 수강생에게 강의 영상, 과제 관리, 학습 자료를 제공합니다.\n\n1. 계정은 수강생 본인만 사용할 수 있으며 타인과 공유할 수 없습니다.\n2. 강의 영상과 자료의 저작권은 강사에게 있으며 무단 복제·배포를 금지합니다.\n3. 수강 기간이 끝난 뒤에도 일정 기간 다시보기를 제공할 수 있으며, 기간은 공지사항으로 안내합니다.\n\n정식 약관은 서비스 오픈 시 확정 후 게시됩니다."],
    privacy: ["개인정보처리방침", "수집 항목: 이름, 휴대폰 번호 뒷자리 4자리, 과제 제출 내용\n이용 목적: 수강생 확인, 학습 진행 관리, 수료증 발급\n보관 기간: 수강 종료 후 1년 또는 수강생 요청 시 즉시 파기\n\n현재 체험 버전에서는 제출한 과제와 진행 기록이 이 기기의 브라우저에만 저장됩니다."],
    oss: ["오픈소스 라이선스", "Pretendard — SIL Open Font License 1.1 (© Kil Hyung-jin)\nInter — SIL Open Font License 1.1 (© The Inter Project Authors)\nLucide Icons — ISC License (© Lucide Contributors)"]
  };

  function openInstructorCenter() {
    openModal("강사센터",
      "강사님이 직접 플랫폼을 운영하는 공간입니다. 지금은 수강생 화면을 먼저 열었고, 강사센터는 다음 단계에서 열립니다." +
      '<ul class="feature-list">' +
        "<li>" + icon("check", "sm") + "<span>커리큘럼 · 유튜브 영상 · 강의 날짜를 클릭 몇 번으로 수정</span></li>" +
        "<li>" + icon("check", "sm") + "<span>기수별 수강생 등록 (이름 + 전화번호 뒷자리) 과 회원 관리</span></li>" +
        "<li>" + icon("check", "sm") + "<span>과제 제출 현황 확인 · 보완 요청 · 문의 답변</span></li>" +
        "<li>" + icon("check", "sm") + "<span>공지사항 · 자료실 · AI봇 답변 내용 관리</span></li>" +
      "</ul>",
      '<button class="btn btn-primary" data-action="modal-close">확인</button>');
  }

  function playModal(cat, id) {
    const list = cat === "motivation" ? D.motivation : D.resources[cat];
    const it = list && list.find((x) => x.id === id);
    if (!it) return;
    if (!it.youtubeId && cat !== "motivation") { toast("영상을 준비하고 있어요. 곧 올라갑니다!"); return; }
    openModal(it.title, '<div style="white-space:normal">' + video(it) + "</div>");
    modalRoot.querySelector(".modal").style.maxWidth = "820px";
  }

  /* ---------------- 렌더 ---------------- */
  function render() {
    closeModal();
    const r = route();
    if (!me) {
      if (r.parts[0] !== "login") { history.replaceState(null, "", "#/login"); }
      renderLogin();
      return;
    }
    if (r.parts[0] === "login") { history.replaceState(null, "", "#/home"); return render(); }
    clearTimeout(typingTimer);
    if (!document.getElementById("app")) renderShell();
    const app = document.getElementById("app");
    app.classList.remove("nav-open");
    renderSidebar(r);
    const pages = { home: pageHome, curriculum: pageCurriculum, missions: pageMissions, schedule: pageSchedule, notices: pageNotices, qna: pageQna, docs: pageDocs, bot: pageBot, library: pageLibrary, motivation: pageMotivation, certificate: pageCertificate };
    const fn = pages[r.parts[0]] || notFound;
    const main = document.getElementById("main");
    const prevKey = main.dataset.key;
    const key = location.hash;
    main.innerHTML = fn(r);
    main.dataset.key = key;
    if (prevKey !== key) window.scrollTo(0, 0);
    const nav = NAV.find((n) => n.id === r.parts[0]);
    document.title = (nav ? navLabel(nav) + " · " : "") + D.brand.name + " 클래스";
    renderBotFab(r);
    refreshChats();
    if (document.getElementById("calc")) { updateCalc(); if (prevKey !== key) document.getElementById("calc").scrollIntoView({ block: "start" }); }
  }

  /* ---------------- 이벤트 ---------------- */
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-action]");
    if (!a) {
      // 모바일 메뉴에서 링크를 누르면 메뉴 닫기
      if (e.target.closest(".sidebar a")) { const app = document.getElementById("app"); if (app) app.classList.remove("nav-open"); }
      return;
    }
    const act = a.dataset.action;
    switch (act) {
      case "toggle-pw": {
        const inp = document.getElementById("lg-phone");
        const show = inp.type === "password";
        inp.type = show ? "text" : "password";
        a.textContent = show ? "숨기기" : "보기";
        break;
      }
      case "forgot":
        openModal("로그인 정보를 잊으셨나요?", "이름은 수강 신청할 때 적은 이름 그대로, 비밀번호 칸에는 휴대폰 번호 뒷자리 4자리를 넣어 주세요.\n\n예) 010-1234-2186 → 2186\n\n그래도 로그인이 안 되면 수강 신청한 채널(카카오톡 등)로 이름과 연락처를 보내 주세요. 확인 후 바로 도와드립니다.", '<button class="btn btn-primary" data-action="modal-close">확인</button>');
        break;
      case "legal": {
        const doc = LEGAL[a.dataset.doc];
        openModal(doc[0], esc(doc[1]), '<button class="btn btn-primary" data-action="modal-close">확인</button>');
        break;
      }
      case "instructor-center": openInstructorCenter(); break;
      case "modal-close": closeModal(); break;
      case "modal-close-bg": if (e.target === a) closeModal(); break;
      case "logout": logout(); break;
      case "toggle-nav": document.getElementById("app").classList.toggle("nav-open"); break;
      case "toggle-watched": {
        const id = a.dataset.id;
        if (P.watched[id]) delete P.watched[id]; else P.watched[id] = Date.now();
        saveProgress(); render();
        if (P.watched[id]) toast("시청 완료로 표시했어요.");
        break;
      }
      case "remove-file": draft.files.splice(Number(a.dataset.i), 1); refreshThumbs(); break;
      case "cal-move": {
        const d = new Date(calCursor.y, calCursor.m + Number(a.dataset.d), 1);
        calCursor = { y: d.getFullYear(), m: d.getMonth() };
        render();
        break;
      }
      case "qna-tab": qnaTab = a.dataset.tab; if (location.hash.indexOf("#/qna") === 0 && location.hash !== "#/qna") { location.hash = "#/qna"; } else render(); break;
      case "toggle-doc": {
        const s = a.dataset.step;
        if (P.docs[s]) delete P.docs[s]; else P.docs[s] = Date.now();
        saveProgress(); render();
        break;
      }
      case "chip": sendChat(a.dataset.q); break;
      case "ask-bot": botOpen = true; store.set(KEY_BOT, true); renderBotFab(route()); sendChat(a.dataset.q); break;
      case "clear-chat": P.chat = []; saveProgress(); refreshChats(); break;
      case "bot-open": botOpen = true; store.set(KEY_BOT, true); renderBotFab(route()); { const i = document.getElementById("chat-input-fab"); if (i) i.focus(); } break;
      case "bot-close": botOpen = false; store.set(KEY_BOT, false); renderBotFab(route()); break;
      case "not-ready": toast("자료를 준비하고 있어요. 올라오면 공지로 알려 드릴게요."); break;
      case "play": playModal(a.dataset.cat, a.dataset.id); break;
      case "print": window.print(); break;
    }
  });

  document.addEventListener("submit", (e) => {
    const f = e.target;
    if (f.id === "login-form") { e.preventDefault(); doLogin(f); return; }
    if (f.id === "submit-form") { e.preventDefault(); submitMission(f); return; }
    if (f.id === "question-form") {
      e.preventDefault();
      const title = f.title.value.trim(), body = f.body.value.trim();
      if (!title || !body) { toast("제목과 내용을 모두 적어 주세요."); return; }
      P.questions.push({ id: "q" + Date.now(), title, body, at: Date.now(), answer: "" });
      saveProgress(); render(); toast("문의가 등록됐어요. 답변이 달리면 여기서 확인할 수 있어요.");
      return;
    }
    if (f.hasAttribute("data-chat-form")) {
      e.preventDefault();
      const v = f.q.value;
      f.q.value = "";
      sendChat(v);
      f.q.focus();
    }
  });

  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "faq-search") { document.getElementById("faq-list").innerHTML = faqList(t.value); return; }
    if (t.hasAttribute && t.hasAttribute("data-calc")) { updateCalc(); return; }
    if (t.id === "sub-text" && t.dataset.min) {
      const n = t.value.replace(/\s+/g, "").length, min = Number(t.dataset.min);
      const c = document.getElementById("char-count");
      if (c && min) c.textContent = n + " / 최소 " + min + "자";
    }
    if (t.id === "lg-phone") t.value = t.value.replace(/\D/g, "").slice(0, 4);
    if (t.id === "lg-name" || t.id === "lg-phone") { const er = document.getElementById("lg-error"); if (er) er.textContent = ""; }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "file-input") { addFiles(e.target.files); e.target.value = ""; }
  });
  ["dragover", "dragenter"].forEach((ev) => document.addEventListener(ev, (e) => {
    const z = e.target.closest && e.target.closest("#dropzone");
    if (z) { e.preventDefault(); z.classList.add("drag"); }
  }));
  ["dragleave", "drop"].forEach((ev) => document.addEventListener(ev, (e) => {
    const z = e.target.closest && e.target.closest("#dropzone");
    if (!z) return;
    e.preventDefault();
    z.classList.remove("drag");
    if (ev === "drop") addFiles(e.dataTransfer.files);
  }));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (modalRoot.innerHTML) closeModal();
      const app = document.getElementById("app");
      if (app) app.classList.remove("nav-open");
    }
  });
  window.addEventListener("hashchange", render);

  /* ---------------- 시작 ---------------- */
  const sess = store.get(KEY_SESSION, null);
  const s = sess && D.students.find((x) => x.id === sess.id);
  if (s) startSession(s);
  render();
})();
