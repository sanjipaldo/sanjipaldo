/* 두고 클래스 플랫폼 — 공용 데이터 계층
 *
 * 수강생 센터(app.js)와 강사센터·마스터(admin.js)가 함께 쓴다.
 * 지금은 브라우저 localStorage 에 저장하고, 서버가 붙으면 이 파일의 load/save/progress 만
 * API 호출로 바꾸면 된다.
 *
 *  moonclass:db:v2            플랫폼 전체 (강사, 콘텐츠, 기수, 수강생)
 *  moonclass:progress:<학생ID> 수강생별 제출·시청·문의·채팅 기록 (사진이 들어가 크기가 커서 따로 둔다)
 */
(function () {
  "use strict";

  const KEY_DB = "moonclass:db:v2";
  const KEY_PROGRESS = "moonclass:progress:";

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
    remove(key) { try { localStorage.removeItem(key); } catch (e) { /* 무시 */ } },
    keys() { try { return Object.keys(localStorage); } catch (e) { return []; } }
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* ---------------- 날짜 ---------------- */
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const pad = (n) => String(n).padStart(2, "0");
  const toStr = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const todayStr = () => toStr(new Date());
  function parseDate(s) { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); }
  const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return toStr(d); };
  const diffDays = (a, b) => Math.round((parseDate(a) - parseDate(b)) / 86400000);
  const fmtMD = (s) => { const d = parseDate(s); return (d.getMonth() + 1) + "/" + d.getDate() + " (" + DOW[d.getDay()] + ")"; };
  const fmtFull = (s) => { const d = parseDate(s); return d.getFullYear() + "." + pad(d.getMonth() + 1) + "." + pad(d.getDate()); };
  const fmtKo = (s) => { const d = parseDate(s); return (d.getMonth() + 1) + "월 " + d.getDate() + "일 (" + DOW[d.getDay()] + ")"; };
  const fmtStamp = (ts) => { const d = new Date(ts); return (d.getMonth() + 1) + "/" + d.getDate() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = (p) => (p || "id") + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /** 유튜브 주소/ID → 11자리 ID (아니면 빈 문자열) */
  function youtubeId(v) {
    v = String(v || "").trim();
    if (!v) return "";
    if (/^[\w-]{11}$/.test(v)) return v;
    const m = v.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/);
    return m ? m[1] : "";
  }

  /* ---------------- 수강생 화면 색상 (강사별) ---------------- */
  // 대표색 + 그 위에 올라가는 글자색. 로그인 왼쪽 패널 배경(bg)도 같은 계열로 맞춘다.
  const THEMES = {
    lime:   { label: "라임",   primary: "#9fe870", active: "#cdffad", pale: "#e2f6d5", deep: "#163300", rgb: "159,232,112", bg: ["#18290f", "#0e150b", "#0a170e"], sub: "#b8c2b0" },
    orange: { label: "오렌지", primary: "#ffb45e", active: "#ffd3a3", pale: "#fff0de", deep: "#4a2300", rgb: "255,180,94",  bg: ["#2e1b0a", "#150d05", "#201208"], sub: "#d6c3ad" },
    yellow: { label: "옐로",   primary: "#ffd84d", active: "#ffeaa0", pale: "#fff7d6", deep: "#3d2e00", rgb: "255,216,77",  bg: ["#2b240a", "#141005", "#1f1a08"], sub: "#d4caa8" },
    coral:  { label: "코랄",   primary: "#ff8f7d", active: "#ffc4ba", pale: "#ffe8e3", deep: "#4a1008", rgb: "255,143,125", bg: ["#2d130f", "#150807", "#200d0a"], sub: "#d9bcb6" },
    pink:   { label: "핑크",   primary: "#ff9ec8", active: "#ffcfe4", pale: "#ffeaf3", deep: "#4d0b2b", rgb: "255,158,200", bg: ["#2b1021", "#14080f", "#1f0c18"], sub: "#d9b9c8" },
    violet: { label: "바이올렛", primary: "#c3a6ff", active: "#e0d2ff", pale: "#f1eaff", deep: "#2a1060", rgb: "195,166,255", bg: ["#1f1439", "#0f0a1c", "#170e2b"], sub: "#c6bcdc" },
    sky:    { label: "스카이", primary: "#7cc6ff", active: "#b9e1ff", pale: "#e2f2ff", deep: "#062a4a", rgb: "124,198,255", bg: ["#0d2134", "#081018", "#0a1a2a"], sub: "#b3c4d4" },
    mint:   { label: "민트",   primary: "#6fe3c8", active: "#b1f2e3", pale: "#dcf8f1", deep: "#003d31", rgb: "111,227,200", bg: ["#0c2621", "#06130f", "#0a1d18"], sub: "#acc9c1" },
    // 브랜드 디자인 세트 — 대표색 위 글자색(onPrimary), 어두운 바탕 위 강조색(accent)과 바탕 잉크·본문·구분선까지 바꾼다
    binance: { label: "바이낸스", primary: "#fcd535", active: "#f0b90b", pale: "#fdf3c4", deep: "#181a20", onPrimary: "#181a20", accent: "#fcd535", accentActive: "#fcd535",
      rgb: "252,213,53", bg: ["#1e2329", "#0b0e11", "#0b0e11"], sub: "#929aa5",
      vars: { "--ink": "#181a20", "--body": "#474d57", "--mute": "#707a8a", "--line": "#eaecef", "--line-soft": "#f5f5f5", "--canvas-soft": "#eaecef", "--canvas-softer": "#fafafa" } },
    airtable: { label: "에어테이블", primary: "#181d26", active: "#0d1218", pale: "#f5e9d4", deep: "#181d26", onPrimary: "#ffffff", accent: "#fcab79", accentActive: "#f4d35e", swRing: "#fcab79",
      rgb: "170,45,0", bg: ["#2a1d17", "#181d26", "#0d1218"], sub: "#c9c4bc",
      vars: { "--ink": "#181d26", "--body": "#333840", "--line": "#dddddd", "--line-soft": "#ececec", "--canvas-soft": "#f2f0eb", "--canvas-softer": "#f8f7f4", "--positive-deep": "#0a2e0e", "--warning": "#f4d35e" } }
  };
  const themeOf = (key) => THEMES[key] || THEMES.lime;

  /* ---------------- 수강생 메뉴 구성 (마스터가 강사별로 켜고 끄고 이름을 바꾼다) ---------------- */
  const STUDENT_MENUS = [
    { key: "home", label: "홈", icon: "home", locked: true },
    { key: "curriculum", label: "커리큘럼", icon: "book" },
    { key: "missions", label: "과제 제출하기", icon: "checks" },
    { key: "schedule", label: "강의 일정", icon: "calendar" },
    { key: "notices", label: "공지사항", icon: "megaphone" },
    { key: "qna", label: "Q&A", icon: "help" },
    { key: "docs", label: "서류 준비 가이드", icon: "clipboard" },
    { key: "bot", label: "AI봇", icon: "sparkles" },
    { key: "library", label: "유료강의 자료실", icon: "library" },
    { key: "motivation", label: "동기부여", icon: "flame" },
    { key: "certificate", label: "수료증", icon: "award" }
  ];
  const LIB_MENUS = [
    { key: "ebook", label: "전자책 · 가이드북" }, { key: "file", label: "자료 파일" },
    { key: "vod", label: "이커머스 실전 VOD" }, { key: "senior", label: "시니어 기초 가이드" }
  ];
  const CUSTOM_ICONS = ["file", "video", "link", "book", "star", "image", "coins", "store", "users", "calendar", "sparkles", "award"];
  function menuConfig(insId) {
    const ins = instructor(insId);
    if (!ins) return { items: [], library: {} };
    const m = ins.menu = ins.menu || {};
    m.items = Array.isArray(m.items) ? m.items : [];
    STUDENT_MENUS.forEach((d) => { if (!m.items.some((x) => x.key === d.key)) m.items.push({ key: d.key, on: true }); });
    m.items.forEach((x) => { if (x.key === "home") x.on = true; });
    m.library = Object.assign({ ebook: true, file: true, vod: true, senior: true }, m.library || {});
    return m;
  }
  const isCustom = (key) => /^cp_/.test(key);
  const menuOn = (insId, key) => { const it = menuConfig(insId).items.find((x) => x.key === key); return !!(it && it.on); };
  const libOn = (insId, key) => menuOn(insId, "library") && menuConfig(insId).library[key] !== false;

  /* ---------------- 새 강사용 기본 콘텐츠 ---------------- */
  function template(brand) {
    const name = brand.name || "새 강의";
    const inst = brand.instructor || "강사";
    const lesson = (w, i, t) => ({ id: "l" + w + "-" + i, title: t, minutes: 30, youtubeId: "", desc: "강의 소개를 적어 주세요." });
    const mission = (w, i, t, type, req, check) => ({ id: "m" + w + "-" + i, title: t, required: req, type, desc: "과제 설명을 적어 주세요.", steps: ["진행 방법 1", "진행 방법 2"], check });
    return {
      brand: {
        name, instructor: inst,
        courseTitle: brand.courseTitle || name + " 실전 클래스",
        shortTitle: brand.shortTitle || "실전 클래스",
        tagline: "함께 성장하는 실전 클래스",
        botName: "24시 " + inst + " AI봇",
        youtubeChannel: "", freeCourseUrl: "", kakaoChannel: "",
        loginEyebrow: "DOOGO CLASS",
        loginHeadline: name + "\n함께 시작해요",
        loginSub: "매주 과제를 하나씩 해내다 보면, 어느새 내 이름의 비즈니스가 움직이고 있을 거예요.",
        liveTime: "20:00", liveUrl: "",
        theme: brand.theme || "lime"
      },
      weeks: [1, 2, 3, 4].map((w) => ({
        no: w, title: w + "주차 주제를 적어 주세요", summary: "이번 주에 배우는 내용을 한 줄로 적어 주세요.",
        lessons: [lesson(w, 1, w + "주차 1강"), lesson(w, 2, w + "주차 2강")],
        missions: [
          mission(w, 1, w + "주차 실습 인증", "image", true, { image: true }),
          mission(w, 2, w + "주차 수강 후기", "text", false, { minLength: 30 })
        ]
      })),
      schedule: [
        { id: "e1", type: "qna", title: "주간 Q&A 라이브", time: "21:00", scope: "all", week: 1, dow: 2 }
      ],
      notices: [
        { id: "n1", pinned: true, date: todayStr(), title: "[필독] 수강 안내", body: "환영합니다! 매주 과제를 제출하고 자동검수 결과를 확인하세요.\n필수 과제를 모두 통과하면 수료증이 발급됩니다." }
      ],
      faqs: [
        { id: "q1", category: "수강 · 로그인", q: "로그인이 안 돼요.", a: "수강 신청 때 적은 이름과 휴대폰 번호 뒷자리 4자리로 로그인합니다. 승인 전이라면 강사님 승인을 기다려 주세요.", tags: ["로그인", "비밀번호", "승인"] },
        { id: "q2", category: "과제 · 수료", q: "과제는 언제까지 내야 하나요?", a: "주차가 열리고 6일 뒤가 과제 마감일입니다. 마감이 지나도 제출은 가능하지만 수료 전까지 필수 과제를 모두 통과해야 합니다.", tags: ["과제", "마감", "기한"] },
        { id: "q3", category: "라이브 · 강의", q: "라이브를 놓쳤어요.", a: "다시보기가 커리큘럼 메뉴에 올라갑니다.", tags: ["라이브", "다시보기"] }
      ],
      guide: [
        { id: "g-1", title: "강의 일정 확인하기", desc: "라이브와 과제 마감일을 먼저 확인해 두세요.", url: "#/schedule" },
        { id: "g-2", title: "[필독] 공지 읽기", desc: "수강 방법이 정리돼 있어요.", url: "#/notices" },
        { id: "g-3", title: "1주차 첫 강의 보기", desc: "다 본 강의는 ‘시청 완료’로 표시해 주세요.", url: "#/curriculum" }
      ],
      docsGuide: [],
      resources: { ebook: [], file: [], vod: [], senior: [] },
      motivation: [],
      quotes: ["오늘의 작은 실천이 더 큰 기회를 만듭니다"]
    };
  }

  /**
   * 새 강사 플랫폼을 문대표 플랫폼 구성 그대로 시작한다 (메뉴·주차·과제·FAQ·서류 가이드·자료실 틀).
   * 문대표 이름은 새 강사 이름으로 바꾸고, 문대표 개인 영상·첨부 파일은 비워 둔다.
   */
  function templateFromMoon(brand) {
    const src = (db && db.content.moon) || (window.CLASS_SEED.content || {}).moon;
    if (!src) return template(brand);
    const inst = brand.instructor || "강사", name = brand.name || inst;
    const c = JSON.parse(JSON.stringify(src).replace(/두고보는 문대표/g, name).replace(/문대표/g, inst));
    const t = template(brand).brand;
    Object.assign(c.brand, { name, instructor: inst, courseTitle: t.courseTitle, shortTitle: t.shortTitle, botName: t.botName,
      loginEyebrow: "DOOGO CLASS", loginHeadline: t.loginHeadline, loginSub: t.loginSub, theme: t.theme, themeSet: true,
      youtubeChannel: "", freeCourseUrl: "", kakaoChannel: "", liveUrl: "" });
    c.weeks.forEach((w) => w.lessons.forEach((l) => { l.youtubeId = ""; l.attachments = []; }));
    c.motivation = [];
    ["ebook", "file", "vod", "senior"].forEach((k) => (c.resources[k] || []).forEach((it) => { it.youtubeId = ""; it.attachments = []; if (!it.tool) it.url = ""; }));
    c.notices.forEach((n) => { n.date = todayStr(); });
    c.pages = {};
    c.curricula = []; delete c.curriculumName;
    delete c.landing; delete c.freeClass; delete c.freeQuestions;
    return normalizeContent(c);
  }
  /** 문대표 메뉴 구성(켜고 끈 메뉴·이름·순서)을 복사 — 추가 메뉴는 빼고 */
  function moonMenu() {
    const m = menuConfig("moon");
    return { items: m.items.filter((x) => !isCustom(x.key)).map((x) => Object.assign({}, x)), library: Object.assign({}, m.library) };
  }

  /* ---------------- 홍보 랜딩페이지 ---------------- */
  const LANDING_SECTIONS = [
    { key: "hero", label: "첫 화면 (헤드라인)" }, { key: "stats", label: "숫자로 보는 강의" }, { key: "about", label: "강사 소개" },
    { key: "points", label: "배우는 것 · 추천 대상" }, { key: "curriculum", label: "커리큘럼" }, { key: "platform", label: "수강생 전용 플랫폼" },
    { key: "reviews", label: "수강 후기" }, { key: "pricing", label: "수강 안내 · 가격" }, { key: "faq", label: "자주 묻는 질문" }, { key: "cta", label: "마지막 신청 안내" }
  ];
  /** 저장된 랜딩 내용 + 비어 있는 칸은 강의 정보로 채운 기본값 */
  function landingOf(insId) {
    const c = content(insId), ins = instructor(insId);
    if (!c || !ins) return null;
    const b = c.brand, L = clone(c.landing || {});
    const def = {
      published: true,
      order: LANDING_SECTIONS.map((x) => x.key), off: {},
      hero: { eyebrow: b.loginEyebrow || "DOOGO CLASS", title: b.loginHeadline || b.courseTitle, sub: b.loginSub || b.tagline || "", ctaLabel: "수강 신청하기", ctaUrl: "", image: "" },
      stats: [],
      about: { title: "강사 소개", name: b.instructor || ins.displayName, role: b.courseTitle, body: "", photo: "", career: [] },
      points: { title: "이 강의에서 얻어 가는 것", items: [
        { title: "매주 하나씩, 실습 과제", desc: "강의를 듣고 끝나는 게 아니라 매주 과제를 직접 해내며 결과를 만들어요." },
        { title: "제출 즉시 자동 검수", desc: "과제를 올리면 바로 확인 결과가 나오고, 강사가 한 번 더 봐 드려요." },
        { title: "라이브 Q&A", desc: "막히는 부분은 정해진 시간에 강사에게 직접 물어볼 수 있어요." },
        { title: "수료증 발급", desc: "필수 과제를 모두 마치면 이름이 새겨진 수료증을 드려요." }
      ], forWho: [] },
      curriculum: { title: "커리큘럼", sub: "주차별로 강의를 듣고 과제를 해내면 끝까지 갈 수 있어요." },
      platform: { title: "결제하면 바로 열리는 수강생 전용 학습 공간", sub: "강의 영상, 과제 제출, 일정, 자료실, 24시 AI봇까지 한 곳에서 이어서 공부해요." },
      reviews: { title: "먼저 들은 수강생 이야기", items: [] },
      pricing: { title: "수강 안내", price: "", original: "", period: "", includes: [], ctaLabel: "수강 신청하기", ctaUrl: "", note: "" },
      faq: { title: "자주 묻는 질문", items: [] },
      cta: { title: "지금 시작하면, 몇 주 뒤의 내가 달라져 있어요", sub: b.courseTitle, label: "수강 신청하기", url: "" },
      contact: { kakao: b.kakaoChannel || "", youtube: b.youtubeChannel || "", instagram: "", email: "", phone: "", company: "" }
    };
    const out = Object.assign({}, def, L);
    ["hero", "about", "points", "curriculum", "platform", "reviews", "pricing", "faq", "cta", "contact"].forEach((k) => { out[k] = Object.assign({}, def[k], L[k] || {}); });
    out.off = Object.assign({}, L.off || {});
    out.order = (L.order || []).filter((k) => LANDING_SECTIONS.some((x) => x.key === k));
    LANDING_SECTIONS.forEach((x) => { if (out.order.indexOf(x.key) === -1) out.order.push(x.key); });
    return out;
  }

  /* ---------------- 무료강의 페이지 (doogo.site 형식: 카운트다운 · 사전 질문 · 선물 전자책 · 오픈채팅 · 강의 안내) ---------------- */
  const FREE_SECTIONS = [
    { key: "countdown", label: "강의 시작 카운트다운" }, { key: "question", label: "사전 질문 남기기" }, { key: "gifts", label: "선물 전자책 (날짜별 공개)" },
    { key: "videos", label: "미리 보는 영상" }, { key: "kakao", label: "카카오톡 오픈채팅" }, { key: "live", label: "진행 예정인 강의 (신청)" }
  ];
  function freeOf(insId) {
    const c = content(insId), ins = instructor(insId);
    if (!c || !ins) return null;
    const b = c.brand, F = clone(c.freeClass || {});
    const live = addDays(todayStr(), 14) + "T19:30";
    const def = {
      published: false,
      order: FREE_SECTIONS.map((x) => x.key), off: { videos: true },
      hero: { badge: "무료강의 신청자 전용 선물", instructor: b.instructor || ins.displayName, title: (b.loginHeadline || b.courseTitle || "").replace(/\n/g, "\n"), sub: "강의 시작 전, 신청자에게만 실전 자료를 순서대로 열어드립니다.", note: "본 강의는 교육 목적이며 결과는 실행 환경과 노력에 따라 달라질 수 있습니다." },
      liveAt: live,
      question: { badge: "강의 전 필수 · 1분 소요", title: (b.instructor || "강사") + "에게 직접 묻고 싶은 게 있으신가요?", desc: "강의 전에 궁금한 내용을 미리 정리해 보세요. 지금 남겨두시면 내 상황에 맞는 질문을 놓치지 않을 수 있어요.", label: "내 질문 남기러 가기", url: "", note: "질문을 남긴 뒤 무료강의 신청 페이지로 이동할 수 있어요" },
      gifts: { kicker: "BEFORE THE CLASS", title: "강의 전, 선물 전자책", desc: "공개일이 되면 잠금이 자동으로 풀리고, 표지를 누르면 전자책이 열려요.", items: [] },
      videos: { kicker: "PREVIEW", title: "강의 전에 미리 보면 좋은 영상", items: [] },
      kakao: { badge: "💬 궁금한 점이 있으신가요?", title: "궁금한 점은 카카오톡 오픈채팅방에서 편하게 물어보세요", desc: "강의 전 궁금한 내용이나 미리 확인하고 싶은 부분이 있다면 자유롭게 남겨주세요.\n확인 후 하나씩 답변드리겠습니다.", label: "카카오톡 오픈채팅방 입장하기", url: b.kakaoChannel || "", note: "간단한 질문도 괜찮습니다 │ 편하게 참여해주세요" },
      live: { kicker: "UPCOMING LIVE CLASS", title: "진행 예정인 강의", desc: "무료강의 신청을 완료하고, 실제 노하우를 라이브로 확인하세요.", tag: "무료 LIVE 강의", platform: "", image: "", summary: "", points: [], label: "무료강의 신청하기", url: "", note: "신청 페이지는 새 창에서 열립니다." },
      company: ""
    };
    const out = Object.assign({}, def, F);
    ["hero", "question", "gifts", "videos", "kakao", "live"].forEach((k) => { out[k] = Object.assign({}, def[k], F[k] || {}); });
    out.off = Object.assign({}, F.off || def.off);
    out.order = (F.order || []).filter((k) => FREE_SECTIONS.some((x) => x.key === k));
    FREE_SECTIONS.forEach((x) => { if (out.order.indexOf(x.key) === -1) out.order.push(x.key); });
    return out;
  }

  /* ---------------- 불러오기 · 저장 ---------------- */
  let db = null;

  function normalizeContent(c) {
    c.weeks = c.weeks || [];
    c.weeks.forEach((w, i) => { w.no = i + 1; w.lessons = w.lessons || []; w.missions = w.missions || []; });
    c.curricula = Array.isArray(c.curricula) ? c.curricula : [];
    c.curricula.forEach((cu) => { cu.weeks = cu.weeks || []; cu.weeks.forEach((w, i) => { w.no = i + 1; w.lessons = w.lessons || []; w.missions = w.missions || []; }); });
    ["schedule", "notices", "faqs", "docsGuide", "motivation", "quotes", "guide"].forEach((k) => { c[k] = c[k] || []; });
    c.resources = Object.assign({ ebook: [], file: [], vod: [], senior: [] }, c.resources || {});
    c.pages = c.pages || {};
    if (!c.brand.theme) c.brand.theme = "lime";
    [c.schedule, c.notices, c.faqs, c.docsGuide, c.motivation, c.guide].forEach((list) => list.forEach((it) => { if (!it.id) it.id = uid("x"); }));
    return c;
  }

  function fromSeed() {
    const seed = clone(window.CLASS_SEED);
    const data = { version: 3, instructors: seed.instructors, content: seed.content || {}, cohorts: seed.cohorts, students: seed.students, announcements: seed.announcements || [] };
    data.instructors.forEach((ins) => {
      if (!data.content[ins.id]) data.content[ins.id] = template(Object.assign({ instructor: ins.displayName }, ins.brand || {}));
      if (ins.brand && ins.brand.theme) data.content[ins.id].brand.theme = ins.brand.theme;
      delete ins.brand;
      normalizeContent(data.content[ins.id]);
    });
    // 예시 제출 기록 (해당 학생 기록이 비어 있을 때만)
    const sample = seed.sampleProgress || {};
    Object.keys(sample).forEach((sid) => {
      if (store.get(KEY_PROGRESS + sid, null)) return;
      const s = sample[sid];
      const st = data.students.find((x) => x.id === sid);
      const c = st && data.content[st.instructorId];
      if (!c) return;
      const p = emptyProgress();
      const all = c.weeks.flatMap((w) => w.missions);
      const base = Date.now() - 86400000 * 2;
      (s.done || []).forEach((mid, i) => {
        const m = all.find((x) => x.id === mid);
        if (!m) return;
        p.submissions[mid] = [{
          at: base + i * 3600000,
          text: m.type === "text" ? "예시 제출: " + m.title + " 과제를 수행했습니다. 자세한 내용은 라이브에서 함께 확인하고 싶어요. 꼼꼼하게 정리해서 올립니다." : "",
          link: m.type === "link" ? "https://" + ((m.check && m.check.linkHint) || "example.com") + "/sample-store" : "",
          files: m.type === "image" ? [{ type: "pdf", name: m.title + ".pdf" }] : [],
          result: { pass: true, reasons: [], ok: ["예시 데이터"] }
        }];
      });
      (s.fix || []).forEach((mid) => {
        p.submissions[mid] = [{ at: base, text: "", link: "smartstore", files: [], result: { pass: false, reasons: ["http:// 또는 https:// 로 시작하는 올바른 링크를 입력해 주세요."], ok: [] } }];
      });
      if (s.question) {
        const q = s.question, at = Date.now() - 86400000 * (q.daysAgo || 0) - 3600000 * 3;
        p.questions.push({ id: uid("q"), category: q.category || "기타", title: q.title, body: q.body, images: [], at, answer: q.answer || "", answeredAt: q.answer ? at + 7200000 : 0 });
      }
      store.set(KEY_PROGRESS + sid, p);
    });
    return data;
  }

  // v2 → v3: 로그인 화면 문구(헤드라인·설명)와 FAQ 분류 추가
  function migrate2to3() {
    const seed = window.CLASS_SEED;
    Object.keys(db.content).forEach((id) => {
      const c = db.content[id], b = c.brand;
      const sb = seed.content[id] && seed.content[id].brand;
      const tb = template({ name: b.name, instructor: b.instructor }).brand;
      ["loginEyebrow", "loginHeadline", "loginSub"].forEach((k) => { if (!b[k]) b[k] = (sb && sb[k]) || tb[k]; });
      delete b.loginPhrases; delete b.loginHeadlineSuffix;
      if (seed.content[id] && !(c.faqs || []).some((f) => f.category)) c.faqs = clone(seed.content[id].faqs);
      (c.faqs || []).forEach((f) => { if (!f.category) f.category = "기타"; });
    });
    db.version = 3;
    save();
  }

  function load() {
    db = store.get(KEY_DB, null);
    if (db && db.version === 2 && Array.isArray(db.instructors)) migrate2to3();
    if (!db || db.version !== 3 || !Array.isArray(db.instructors)) {
      db = fromSeed();
      save();
    }
    Object.keys(db.content).forEach((id) => normalizeContent(db.content[id]));
    // 강사 공지(마스터 → 강사), 강사별 화면 색상 기본값
    if (!Array.isArray(db.announcements)) { db.announcements = clone(window.CLASS_SEED.announcements || []); save(); }
    const seedIns = window.CLASS_SEED.instructors;
    db.instructors.forEach((ins) => {
      const c = db.content[ins.id], si = seedIns.find((x) => x.id === ins.id);
      if (c && c.brand.theme === "lime" && !c.brand.themeSet && si && si.brand && si.brand.theme) { c.brand.theme = si.brand.theme; c.brand.themeSet = true; save(); }
      if (!ins.menu && si && si.menu) { ins.menu = clone(si.menu); save(); }
    });
    // '로직메이커 황금농부'로 붙어 있던 강사를 로직메이커 / 황금농부 두 강사로 나눈다
    const logic = db.instructors.find((x) => x.id === "logic");
    if (logic && logic.displayName === "로직메이커 황금농부") {
      const lb = db.content.logic && db.content.logic.brand;
      Object.assign(logic, { name: "로직메이커", displayName: "로직메이커" });
      if (lb) {
        ["name", "courseTitle", "loginHeadline", "botName"].forEach((k) => { if (lb[k]) lb[k] = lb[k].replace(/로직메이커 황금농부/g, "로직메이커"); });
        if (lb.instructor === "로직메이커 황금농부") lb.instructor = "로직메이커";
        lb.theme = "airtable"; lb.themeSet = true;
      }
      if (!db.instructors.some((x) => x.id === "farmer")) {
        const sf = seedIns.find((x) => x.id === "farmer");
        db.instructors.splice(db.instructors.indexOf(logic) + 1, 0, { id: "farmer", name: sf.name, phone4: sf.phone4, displayName: sf.displayName, status: "active", createdAt: sf.createdAt });
        db.content.farmer = normalizeContent(template(Object.assign({ instructor: sf.displayName }, sf.brand)));
        db.content.farmer.brand.theme = "binance"; db.content.farmer.brand.themeSet = true;
        window.CLASS_SEED.cohorts.filter((c) => c.instructorId === "farmer" && !db.cohorts.some((x) => x.id === c.id)).forEach((c) => db.cohorts.push(clone(c)));
        window.CLASS_SEED.students.filter((st) => st.instructorId === "farmer" && !db.students.some((x) => x.id === st.id)).forEach((st) => db.students.push(clone(st)));
      }
      save();
    }
    // 시작 가이드가 생기기 전 데이터면 기본 단계를 넣는다 (한 번만)
    db.flags = db.flags || {};
    if (!db.flags.guideSeeded) {
      Object.keys(db.content).forEach((id) => { const c = db.content[id], sc = window.CLASS_SEED.content[id]; if (!c.guide.length) c.guide = clone(sc && sc.guide ? sc.guide : template({}).guide); if (c.brand.liveUrl === undefined) c.brand.liveUrl = ""; });
      db.flags.guideSeeded = true; save();
    }
    // 기수별 커리큘럼·강의 요일 예시 (한 번만): 문대표 4기 = 4주 압축 과정 · 매주 토 12:00
    if (!db.flags.curriculaSeeded) {
      const mc = db.content.moon, sm = window.CLASS_SEED.content.moon;
      if (mc && !(mc.curricula || []).length && sm && sm.curricula) { mc.curricula = clone(sm.curricula); if (!mc.curriculumName) mc.curriculumName = sm.curriculumName; }
      window.CLASS_SEED.cohorts.forEach((sc) => {
        const co = db.cohorts.find((x) => x.id === sc.id);
        if (!co) return;
        ["classDow", "classTime", "curriculumId"].forEach((k) => { if (co[k] === undefined && sc[k] !== undefined) co[k] = sc[k]; });
      });
      db.flags.curriculaSeeded = true; save();
    }
    // 무료강의 페이지 기본 문구 (한 번만, doogo.site 내용)
    if (!db.flags.freeSeeded) {
      Object.keys(db.content).forEach((id) => { const sc = window.CLASS_SEED.content[id]; if (!db.content[id].freeClass && sc && sc.freeClass) db.content[id].freeClass = clone(sc.freeClass); });
      db.flags.freeSeeded = true; save();
    }
    // 홍보 랜딩페이지 기본 문구 (한 번만)
    if (!db.flags.landingSeeded) {
      Object.keys(db.content).forEach((id) => { const sc = window.CLASS_SEED.content[id]; if (!db.content[id].landing && sc && sc.landing) db.content[id].landing = clone(sc.landing); });
      db.flags.landingSeeded = true; save();
    }
    // 없어진 색(잠깐 적용됐던 클릭하우스 등)이 저장돼 있으면 라임으로 되돌린다
    Object.keys(db.content).forEach((id) => { const b = db.content[id].brand; if (b.theme && !THEMES[b.theme]) { b.theme = "lime"; save(); } });
    // 자료실 영상에 본문·첨부파일 필드가 생기기 전 데이터면 기본값을 채운다
    let filled = false;
    Object.keys(db.content).forEach((id) => {
      const sc = window.CLASS_SEED.content[id];
      ["vod", "senior"].forEach((k) => (db.content[id].resources[k] || []).forEach((it) => {
        if (it.body === undefined) {
          const seedIt = sc && (sc.resources[k] || []).find((x) => x.id === it.id);
          it.body = (seedIt && seedIt.body) || "";
          it.attachments = (seedIt && clone(seedIt.attachments || [])) || [];
          filled = true;
        }
        if (!Array.isArray(it.attachments)) it.attachments = [];
      }));
    });
    if (filled) save();
    // 잠깐 적용됐던 '두고캠퍼스' 문구가 저장된 브라우저는 원래 문구로 되돌린다
    let renamed = false;
    Object.keys(db.content).forEach((id) => {
      const b = db.content[id].brand;
      if (b.loginEyebrow && /^DOOGO CAMPUS/.test(b.loginEyebrow)) { b.loginEyebrow = b.loginEyebrow.replace(/^DOOGO CAMPUS/, "DOOGO CLASS"); renamed = true; }
    });
    if (renamed) save();
    return db;
  }
  function save() {
    if (!store.set(KEY_DB, db)) { console.warn("저장 공간이 부족합니다"); return false; }
    return true;
  }
  function reset() {
    store.keys().filter((k) => k.indexOf("moonclass:") === 0).forEach((k) => store.remove(k));
    load();
  }

  /* ---------------- 조회 ---------------- */
  const instructor = (id) => db.instructors.find((x) => x.id === id) || null;
  const activeInstructors = () => db.instructors.filter((x) => x.status === "active");
  const content = (id) => db.content[id] || null;
  const cohort = (id) => db.cohorts.find((x) => x.id === id) || null;
  const cohortsOf = (instId) => db.cohorts.filter((x) => x.instructorId === instId).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const studentsOf = (instId) => db.students.filter((x) => x.instructorId === instId);
  const student = (id) => db.students.find((x) => x.id === id) || null;

  /* ---------------- 기수 · 일정 계산 ---------------- */
  /* ---------------- 커리큘럼 (강사마다 여러 개, 기수마다 하나를 골라 쓴다) ---------------- */
  // 기본 커리큘럼은 content.weeks, 추가로 만든 커리큘럼은 content.curricula = [{ id, name, weeks }]
  function curricula(instId) {
    const c = content(instId);
    if (!c) return [];
    return [{ id: "main", name: c.curriculumName || "기본 커리큘럼", weeks: c.weeks, main: true }].concat(c.curricula || []);
  }
  const curriculum = (instId, curId) => { const list = curricula(instId); return list.find((x) => x.id === (curId || "main")) || list[0] || null; };
  const curriculumOf = (co) => curriculum(co.instructorId, co.curriculumId);
  const weeksOf = (co) => { const cu = co && curriculumOf(co); return cu ? cu.weeks : []; };
  const weekCount = (instId) => { const c = content(instId); return c ? c.weeks.length : 0; };
  const cohortWeeks = (co) => weeksOf(co).length;
  const weekOpen = (co, no) => addDays(co.startDate, (no - 1) * 7);
  const weekDeadline = (co, no) => addDays(co.startDate, (no - 1) * 7 + 6);
  const cohortEnd = (co) => addDays(co.startDate, Math.max(1, cohortWeeks(co)) * 7 - 1);
  function cohortStatus(co) {
    const t = todayStr();
    if (t < co.startDate) return "upcoming";
    if (t > cohortEnd(co)) return "ended";
    return "running";
  }
  const STATUS_LABEL = { upcoming: "모집 중", running: "진행 중", ended: "종료" };
  function currentWeek(co) {
    const d = diffDays(todayStr(), co.startDate);
    if (d < 0) return 0;
    return Math.min(cohortWeeks(co), Math.floor(d / 7) + 1);
  }
  /* ---------------- 성장 레벨 (주차가 지날 때마다 한 단계씩) ---------------- */
  const LEVEL_SET = [
    { key: "seed", name: "씨앗", icon: "lvSeed" }, { key: "leaf", name: "풀잎", icon: "lvLeaf" }, { key: "branch", name: "가지", icon: "lvBranch" },
    { key: "tree", name: "나무", icon: "lvTree" }, { key: "forest", name: "숲", icon: "lvForest" }
  ];
  // 단계 수 = 주차 수 (최대 5). 마지막은 늘 ‘숲’ — 4주 강의면 나무를 건너뛰고 씨앗·풀잎·가지·숲
  const levelSteps = (weeks) => { const n = Math.max(1, Math.min(5, weeks || 5)); return LEVEL_SET.slice(0, n - 1).concat([LEVEL_SET[4]]); };
  function levelIndex(wk, weeks, steps) {
    if (weeks <= 5) return Math.max(0, Math.min(steps.length - 1, wk - 1));
    return wk >= weeks ? steps.length - 1 : Math.min(steps.length - 2, Math.floor((wk - 1) * (steps.length - 1) / (weeks - 1)));
  }
  /** 기수 진행에 따른 수강생 레벨: 시작 전·1주차 씨앗 … 마지막 주차부터 숲 */
  function level(co) {
    const weeks = cohortWeeks(co), steps = levelSteps(weeks);
    const wk = Math.max(1, currentWeek(co)), idx = levelIndex(wk, weeks, steps);
    let nextDate = null;
    for (let w = wk + 1; w <= weeks; w++) if (levelIndex(w, weeks, steps) > idx) { nextDate = weekOpen(co, w); break; }
    return { steps, idx, cur: steps[idx], next: steps[idx + 1] || null, nextDate, weeks };
  }
  /** 강사센터 기본 기수: 진행 중 → 가장 가까운 모집 중 → 가장 최근 */
  function currentCohort(instId) {
    const list = cohortsOf(instId);
    return list.filter((c) => cohortStatus(c) === "running").pop() || list.find((c) => cohortStatus(c) === "upcoming") || list[list.length - 1] || null;
  }
  function nextCohortName(instId) {
    const nums = cohortsOf(instId).map((c) => parseInt(c.name, 10)).filter((n) => !isNaN(n));
    return (nums.length ? Math.max.apply(null, nums) + 1 : 1) + "기";
  }

  const EVENT_TYPES = {
    open: { label: "강의 오픈", cls: "open" },
    deadline: { label: "과제 마감", cls: "deadline" },
    qna: { label: "라이브 Q&A", cls: "qna" },
    notice: { label: "공지", cls: "notice" },
    challenge: { label: "챌린지", cls: "challenge" },
    event: { label: "행사", cls: "event" }
  };
  /** 기수 하나의 전체 일정 (자동 일정 + 강사가 추가한 일정), 날짜순 */
  function events(instId, co) {
    const c = content(instId);
    if (!c || !co) return [];
    const out = [];
    // 주차 강의 날짜: 기수에 ‘매주 무슨 요일’을 정했으면 그 주의 그 요일, 아니면 주차 시작일
    const time = co.classTime || c.brand.liveTime || "";
    const url = co.classUrl || c.brand.liveUrl || "";
    const hasDow = co.classDow !== undefined && co.classDow !== null && co.classDow !== "";
    weeksOf(co).forEach((w) => {
      const open = weekOpen(co, w.no);
      const date = hasDow ? addDays(open, ((Number(co.classDow) - parseDate(open).getDay()) + 7) % 7) : open;
      out.push({ date, time, type: "open", week: w.no, title: w.no + "주차 강의 — " + w.title + (time ? " (" + time + ")" : ""), url, auto: true });
      out.push({ date: weekDeadline(co, w.no), time: "", type: "deadline", week: w.no, title: w.no + "주차 과제 마감", auto: true });
    });
    c.schedule.forEach((e) => {
      let date = null;
      if (e.scope === "cohort") { if (e.cohortId === co.id) date = e.date; }
      else if ((Number(e.week) || 1) <= cohortWeeks(co)) {
        const open = weekOpen(co, Number(e.week) || 1);
        const d = parseDate(open).getDay();
        date = addDays(open, ((Number(e.dow) - d) + 7) % 7);
      }
      if (date) out.push({ date, time: e.time || "", type: e.type, week: e.scope === "cohort" ? null : Number(e.week), title: e.title, url: e.url || "", id: e.id });
    });
    return out.sort((a, b) => (a.date + (a.time || "99")).localeCompare(b.date + (b.time || "99")));
  }
  function ruleText(e, instId) {
    if (e.scope === "cohort") { const co = cohort(e.cohortId); return (co ? co.name : "삭제된 기수") + " · " + (e.date ? fmtMD(e.date) : "-"); }
    return "모든 기수 · " + e.week + "주차 " + DOW[Number(e.dow)] + "요일";
  }

  /* ---------------- 진행 기록 ---------------- */
  function emptyProgress() { return { submissions: {}, watched: {}, docs: {}, questions: [], chat: [], notes: {}, readNotices: {}, guide: {} }; }
  const progress = (sid) => Object.assign(emptyProgress(), store.get(KEY_PROGRESS + sid, {}));
  const saveProgress = (sid, p) => store.set(KEY_PROGRESS + sid, p);
  const lastSub = (p, mid) => { const l = p.submissions[mid]; return l && l.length ? l[l.length - 1] : null; };
  /** todo | done | fix — 강사 검수가 있으면 그 결과가 자동검수보다 우선 */
  function subState(p, mid) {
    const s = lastSub(p, mid);
    if (!s) return "todo";
    if (s.review) return s.review.status === "approved" ? "done" : "fix";
    return s.result.pass ? "done" : "fix";
  }
  /** 진행률 — co(기수)를 주면 그 기수의 커리큘럼 기준 */
  function stats(p, instId, co) {
    const c = content(instId);
    const weeks = co ? weeksOf(co) : c ? c.weeks : [];
    const all = weeks.flatMap((w) => w.missions);
    const req = all.filter((m) => m.required);
    const done = all.filter((m) => subState(p, m.id) === "done").length;
    const reqDone = req.filter((m) => subState(p, m.id) === "done").length;
    return { total: all.length, done, reqTotal: req.length, reqDone, pct: all.length ? Math.round((done / all.length) * 100) : 0 };
  }

  /* ---------------- 요청사항 (오류·불편 신고) ---------------- */
  const REQUEST_CATEGORIES = ["로그인 · 접속", "과제 제출", "영상 재생", "화면 깨짐", "기타"];
  const maskName = (n) => { n = String(n || ""); return n ? n.slice(0, 1) + "OO" : "익명"; };
  /** 강사 한 명의 전체 요청사항, 오래된 순으로 번호를 매기고 최신순으로 돌려준다 */
  function requests(instId, extra) {
    const list = [];
    const add = (s) => progress(s.id).questions.forEach((q) => list.push({ s, q }));
    studentsOf(instId).forEach(add);
    if (extra) add(extra);
    list.sort((a, b) => a.q.at - b.q.at).forEach((x, i) => { x.no = i + 1; });
    return list.reverse();
  }

  /* ---------------- 세션 ---------------- */
  const session = {
    student: () => store.get("moonclass:session", null),
    setStudent: (v) => (v ? store.set("moonclass:session", v) : store.remove("moonclass:session")),
    admin: () => store.get("moonclass:admin-session", null),
    setAdmin: (v) => (v ? store.set("moonclass:admin-session", v) : store.remove("moonclass:admin-session")),
    instructorPick: () => store.get("moonclass:instructor", null),
    setInstructorPick: (id) => store.set("moonclass:instructor", id)
  };

  window.DB = {
    load, save, reset, store, clone, uid, esc, youtubeId, template, templateFromMoon, moonMenu, normalizeContent, LANDING_SECTIONS, landingOf, FREE_SECTIONS, freeOf,
    get data() { return db; },
    instructor, activeInstructors, content, cohort, cohortsOf, studentsOf, student,
    curricula, curriculum, curriculumOf, weeksOf, cohortWeeks,
    weekOpen, weekDeadline, cohortEnd, cohortStatus, STATUS_LABEL, currentWeek, LEVEL_SET, levelSteps, level, currentCohort, nextCohortName,
    EVENT_TYPES, events, ruleText,
    REQUEST_CATEGORIES, maskName, requests,
    THEMES, themeOf, STUDENT_MENUS, LIB_MENUS, CUSTOM_ICONS, menuConfig, menuOn, libOn, isCustom,
    emptyProgress, progress, saveProgress, lastSub, subState, stats,
    session,
    date: { DOW, todayStr, parseDate, addDays, diffDays, fmtMD, fmtFull, fmtKo, fmtStamp, toStr }
  };
})();
