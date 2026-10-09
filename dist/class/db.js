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

  /** 본문 서식: 줄바꿈 그대로 + 간단한 표시만 지원 (강사가 외울 것 없이 쓰는 정도)
   *   ## 소제목 · - 목록 (· • 도 됨) · 1. 번호 목록 · > 강조 상자 · --- 구분선 · **굵게** · 주소는 자동 링크
   *   opts.token(n) 을 주면 [사진1] 같은 자리에 그 결과를 넣는다 (공지 사진) */
  function rich(text, opts) {
    opts = opts || {};
    const inline = (t) => esc(t)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(https?:\/\/[^\s<]+[^\s<.,)!?’”])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    const out = [];
    let para = [], list = null;
    const flushP = () => { if (para.length) { out.push("<p>" + para.join("<br>") + "</p>"); para = []; } };
    const flushL = () => { if (list) { out.push("<" + list.tag + ">" + list.items.map((x) => "<li>" + x + "</li>").join("") + "</" + list.tag + ">"); list = null; } };
    const flush = () => { flushP(); flushL(); };
    String(text || "").replace(/\r/g, "").split("\n").forEach((raw) => {
      const line = raw.trim();
      let m;
      if (!line) { flush(); return; }
      if (opts.token && (m = line.match(/^\[사진\s*(\d+)\]$/))) { flush(); out.push(opts.token(Number(m[1]))); return; }
      if ((m = line.match(/^#{1,3}\s+(.+)$/))) { flush(); out.push("<h3>" + inline(m[1]) + "</h3>"); return; }
      if (/^(-{3,}|—{2,}|_{3,})$/.test(line)) { flush(); out.push("<hr>"); return; }
      if ((m = line.match(/^>\s?(.*)$/))) { flush(); out.push('<div class="rich-note">' + inline(m[1]) + "</div>"); return; }
      if ((m = line.match(/^[-·•*]\s+(.+)$/))) { flushP(); if (!list || list.tag !== "ul") { flushL(); list = { tag: "ul", items: [] }; } list.items.push(inline(m[1])); return; }
      if ((m = line.match(/^(\d{1,2})[.)]\s+(.+)$/))) { flushP(); if (!list || list.tag !== "ol") { flushL(); list = { tag: "ol", items: [] }; } list.items.push(inline(m[2])); return; }
      flushL(); para.push(inline(line));
    });
    flush();
    return '<div class="rich">' + out.join("") + "</div>";
  }
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
    { key: "channels", label: "1:1 소통채널", icon: "headset" },
    { key: "partners", label: "제휴채널", icon: "handshake" },
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
    // 새로 생긴 메뉴는 기본 순서상 바로 앞 메뉴 뒤에 끼워 넣는다 (예: 1:1 소통채널은 동기부여 아래)
    STUDENT_MENUS.forEach((d, i) => {
      if (m.items.some((x) => x.key === d.key)) return;
      let at = m.items.length;
      for (let j = i - 1; j >= 0; j--) { const k = m.items.findIndex((x) => x.key === STUDENT_MENUS[j].key); if (k !== -1) { at = k + 1; break; } }
      m.items.splice(at, 0, { key: d.key, on: true });
    });
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
      youtubeChannel: "", freeCourseUrl: "", kakaoChannel: "", liveUrl: "", worldClock: false, photo: "", field: "", instagram: "" });
    c.channels = defaultChannels();
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
    { key: "countdown", label: "강의 일정 · 카운트다운" }, { key: "videos", label: "YouTube 영상 (좌 · 가운데 · 우)" }, { key: "question", label: "질문 남기기 버튼" },
    { key: "gifts", label: "선물 전자책 (공개일에 자동으로 열림)" }, { key: "kakao", label: "카카오톡 오픈채팅" },
    { key: "live", label: "진행 예정 강의 (썸네일 · 신청 링크)" }, { key: "faq", label: "자주 묻는 질문" }
  ];
  /** 아직 무료강의 페이지를 만들지 않은 강사: 문대표 페이지와 같은 구성(선물 전자책 3권 · 질문 · 진행 예정 강의)으로 시작.
   *  날짜는 오늘 기준으로 잡히고, 강사센터 ‘무료강의 페이지’에서 한 번 저장하면 그때부터 강사 것으로 고정된다 */
  function freeStarter(c, ins) {
    const inst = c.brand.instructor || ins.displayName;
    const seed = (((window.CLASS_SEED.content || {}).moon || {}).freeClass || {}).gifts || {};
    const color = (i, d) => ((seed.items || [])[i] || {}).color || d;
    return {
      published: true,
      hero: { badge: "무료강의 신청자 전용 선물 제공", instructor: inst, sub: "강의 시작 전, 신청자에게만 실전 자료 3권을 순서대로 열어드립니다.", note: "본 강의는 교육 목적이며 결과는 실행 환경과 노력에 따라 달라질 수 있습니다." },
      gifts: { kicker: "BEFORE THE CLASS", title: "강의 전, 선물 전자책 3권", desc: "공개일이 되면 잠금이 자동으로 풀리고, 표지를 누르면 전자책이 열려요.", items: [
        { title: inst + "의 시작 가이드", desc: "강의 전에 알아 두면 좋은 기본 개념과 준비할 것을 정리했습니다.", openAt: todayStr() + "T09:00", forceOpen: true, url: "", color: color(0, "blue") },
        { title: "[전자책] 실전 체크리스트", desc: "처음 시작할 때 놓치기 쉬운 단계를 순서대로 확인할 수 있게 정리했습니다.", openAt: addDays(todayStr(), 7) + "T19:30", url: "", color: color(1, "cyan") },
        { title: "[전자책 & VOD] 핵심 요약편", desc: "무료강의에서 다룰 핵심 내용을 한 권으로 미리 만나 보세요.", openAt: addDays(todayStr(), 13) + "T19:30", url: "", color: color(2, "ice") }
      ] },
      live: { desc: "무료강의 신청을 완료하고, " + inst + "의 실전 노하우를 라이브로 확인하세요.", summary: "처음 시작하는 분도 따라올 수 있도록 실제 사례와 함께 순서대로 알려드립니다.",
        points: ["처음 시작하는 분도 이해할 수 있는 전체 흐름", "실제 사례로 보는 실전 노하우", "강의가 끝나고 바로 실행할 수 있는 체크리스트"] }
    };
  }
  function freeOf(insId) {
    const c = content(insId), ins = instructor(insId);
    if (!c || !ins) return null;
    const b = c.brand, F = clone(c.freeClass || (insId !== "moon" ? freeStarter(c, ins) : {}));
    const live = addDays(todayStr(), 14) + "T19:30";
    const def = {
      published: false,
      order: FREE_SECTIONS.map((x) => x.key), off: {},
      hero: { badge: "무료강의 신청자 전용 선물 제공", instructor: b.instructor || ins.displayName, title: (b.loginHeadline || b.courseTitle || "").replace(/\n/g, "\n"), sub: "강의 시작 전, 신청자에게만 실전 자료를 순서대로 열어드립니다.", note: "본 강의는 교육 목적이며 결과는 실행 환경과 노력에 따라 달라질 수 있습니다." },
      liveAt: live,
      question: { badge: "강의 전 필수 · 1분 소요", title: (b.instructor || "강사") + "에게 직접 묻고 싶은 게 있으신가요?", desc: "강의 전에 궁금한 내용을 미리 정리해 보세요. 지금 남겨두시면 내 상황에 맞는 질문을 놓치지 않을 수 있어요.", promise: "지금 남겨 주시면 무료강의 때 그 질문을 토대로 최대한 답변해 드릴 수 있도록 하겠습니다.", label: "내 질문 남기러 가기", url: "", note: "질문을 남긴 뒤 무료강의 신청 페이지로 이동할 수 있어요" },
      gifts: { kicker: "BEFORE THE CLASS", title: "강의 전, 선물 전자책", desc: "공개일이 되면 잠금이 자동으로 풀리고, 표지를 누르면 전자책이 열려요.", items: [] },
      videos: { kicker: "WATCH BEFORE THE CLASS", title: "강의 전에, " + (b.instructor || "강사") + "의 실전 이야기를 먼저 만나보세요", desc: "좌우 영상을 넘기면 다양한 인터뷰와 실제 운영 이야기를 볼 수 있어요.", items: [] },
      about: { title: "강사 소개", name: b.instructor || ins.displayName, role: b.courseTitle, body: "", photo: "", career: [] },
      faq: { kicker: "FAQ", title: "자주 묻는 질문", items: [
        { q: "무료강의는 어디서 듣나요?", a: "‘진행 예정 강의’의 신청 버튼으로 신청하면, 강의 날짜에 맞춰 라이브 입장 안내를 보내 드려요." },
        { q: "선물 전자책은 어떻게 받나요?", a: "이 페이지에서 공개일이 되면 잠금이 자동으로 풀려요. 표지를 누르면 전자책이 열려요." },
        { q: "처음인데 들어도 될까요?", a: "네. 처음 시작하는 분도 따라올 수 있게 순서대로 설명해 드려요." },
        { q: "궁금한 점은 어디에 물어보나요?", a: "‘질문 남기기’로 미리 남기시거나 카카오톡 오픈채팅방에서 편하게 물어보세요." }
      ] },
      apply: { badge: "지금 신청하면 선물이 열려요", title: "무료강의, 지금 신청하세요", desc: "신청한 분께만 강의 링크와 선물 전자책을 보내 드려요.", price: "", original: "", includes: [], label: "무료강의 신청하기", url: "", note: "비우면 ‘진행 예정 강의’의 신청 링크로 연결돼요." },
      kakao: { badge: "💬 궁금한 점이 있으신가요?", title: "궁금한 점은 카카오톡 오픈채팅방에서 편하게 물어보세요", desc: "강의 전 궁금한 내용이나 미리 확인하고 싶은 부분이 있다면 자유롭게 남겨주세요.\n확인 후 하나씩 답변드리겠습니다.", label: "카카오톡 오픈채팅방 입장하기", url: b.kakaoChannel || "", note: "간단한 질문도 괜찮습니다 │ 편하게 참여해주세요" },
      live: { kicker: "UPCOMING LIVE CLASS", title: "진행 예정인 강의", desc: "무료강의 신청을 완료하고, 실제 노하우를 라이브로 확인하세요.", tag: "무료 LIVE 강의", platform: "", platformLogo: "", image: "", liveTitle: "", summary: "", points: [], label: "무료강의 신청하기", url: "", note: "신청 페이지는 새 창에서 열립니다." },
      company: ""
    };
    const out = Object.assign({}, def, F);
    ["hero", "question", "gifts", "videos", "kakao", "about", "live", "faq", "apply"].forEach((k) => { out[k] = Object.assign({}, def[k], F[k] || {}); });
    out.off = Object.assign({}, F.off || def.off);
    // 강사 소개는 ‘강의 소개 페이지’에 적어 둔 내용을 기본으로 가져온다
    if (!F.about && c.landing && c.landing.about) out.about = Object.assign({}, def.about, c.landing.about);
    out.order = (F.order || []).filter((k) => FREE_SECTIONS.some((x) => x.key === k));
    FREE_SECTIONS.forEach((x) => { if (out.order.indexOf(x.key) === -1) out.order.push(x.key); });
    return out;
  }

  // 유료강의 자료실 이용 안내 팝업 (자료실에 들어올 때마다 뜬다). 비워 둔 칸은 기본 문구
  function libNoticeOf(c) {
    const n = c.libNotice || {};
    const course = c.brand.courseTitle || c.brand.name || "";
    return {
      title: n.title || "유료강의 자료실 이용 안내",
      intro: n.intro || "본 자료는 **" + course + " 유료 수강생** 전용 혜택입니다.",
      items: n.items && n.items.length ? n.items : ["무단 **복사·캡처·다운로드·외부 공유**를 금지합니다.", "모든 페이지에는 **열람자 정보**(이름·기수·시각)가 표시되어, 유출 경로를 확인할 수 있습니다.", "무단 유출이 확인될 경우, 관련 법령에 따라 책임이 따를 수 있습니다."],
      foot: n.foot !== undefined && n.foot !== "" ? n.foot : (c.brand.instructor || "강사") + "님의 소중한 노하우가 담긴 자료입니다. 본인 학습 용도로만 이용해 주세요.",
      button: n.button || "확인했습니다"
    };
  }

  // 홈 ‘자주 찾는 페이지’ — 강사가 따로 정하지 않았으면 기본 목록 (외부 링크는 주소가 있을 때만)
  const QL_ICONS = ["megaphone", "help", "clipboard", "bug", "sparkles", "play", "message", "book", "calendar", "library", "flame", "award", "link", "store", "users", "video", "layers"];
  // 윗줄 = 강의 플랫폼 안 메뉴(기본 색), 아랫줄 = 외부 링크(브랜드 색). color 를 주면 그 색 카드로 보인다
  function defaultQuickLinks(c) {
    const b = c.brand || {};
    return [
      { id: "ql1", title: "공지사항", desc: "최신 공지와 일정 안내", url: "#/notices", icon: "megaphone" },
      { id: "ql2", title: "자주 묻는 질문", desc: "수강 · 과제 · 수료 궁금증 모음", url: "#/qna", icon: "help" },
      { id: "ql3", title: "서류 준비 가이드", desc: "1주차 서류 발급 단계별 안내", url: "#/docs", icon: "clipboard" },
      { id: "ql4", title: "요청사항", desc: "오류 · 불편을 강사님께 바로 알리기", url: "#/qna/requests", icon: "bug" },
      { id: "ql6", title: (b.instructor || "강사") + " 유튜브", desc: "실전 노하우 영상 모음", url: b.youtubeChannel || "", icon: "play", color: "#ff0000" },
      { id: "ql8", title: "네이버 카페", desc: "두고마켓 회원 게시판 · 정보 나눔", url: "https://cafe.naver.com/doogomarket", icon: "users", color: "#03c75a" },
      { id: "ql9", title: "두고커넥트", desc: "건강식품 제조 · OEM 파트너", url: "https://www.doogoconnect.com/", icon: "layers", color: "#0a5de2" },
      { id: "ql10", title: "두고푸드", desc: "식품 도매몰 · 사업자 전용가", url: "https://www.doogofood.com/", icon: "store", color: "#f97316" }
    ];
  }
  const quickLinksOf = (c) => (Array.isArray(c.quickLinks) ? c.quickLinks : defaultQuickLinks(c));
  /** 엑셀에서 바로 열리는 CSV 양식 (data: 주소) */
  const csvData = (rows) => "data:text/csv;charset=utf-8," + encodeURIComponent("\uFEFF" + rows.map((r) => r.map((v) => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(",")).join("\n"));

  // 1:1 소통채널: 강사마다 쓰는 상담 채널이 달라서 강사센터에서 직접 만든다
  const CHANNEL_TYPES = [
    { key: "kakao", label: "카카오톡 채널", icon: "message", color: "#fee500", ink: "#191600" },
    { key: "openchat", label: "카카오톡 오픈채팅", icon: "users", color: "#fee500", ink: "#191600" },
    { key: "channeltalk", label: "채널톡", icon: "headset", color: "#5e4bff", ink: "#ffffff" },
    { key: "naver", label: "네이버 톡톡", icon: "message", color: "#03c75a", ink: "#ffffff" },
    { key: "instagram", label: "인스타그램 DM", icon: "camera", color: "#e1306c", ink: "#ffffff" },
    { key: "email", label: "이메일", icon: "mail", color: "#0e0f0c", ink: "#ffffff" },
    { key: "phone", label: "전화 상담", icon: "phone", color: "#2ead4b", ink: "#ffffff" },
    { key: "other", label: "기타 링크", icon: "link", color: "", ink: "" }
  ];
  // 카드마다 아이콘 · 색을 따로 고를 수 있다 (같은 카카오톡 채널이어도 구분되게)
  const CHANNEL_ICONS = [["factory", "공장 (제조)"], ["chatLock", "잠긴 말풍선 (개별 방)"], ["globe", "지구 (해외 · 유통)"], ["store", "가게 (도매몰)"], ["message", "말풍선"], ["users", "사람들 (단체방)"], ["headset", "헤드셋 (상담)"], ["mail", "메일"], ["phone", "전화"], ["camera", "카메라"], ["link", "링크"]];
  const CHANNEL_COLORS = [["#0a5de2", "파랑"], ["#7c3aed", "보라"], ["#ea580c", "주황"], ["#03c75a", "초록"], ["#e1306c", "분홍"], ["#0e0f0c", "검정"], ["#fee500", "카카오 노랑"], ["#5e4bff", "채널톡 보라"]];
  function inkOn(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return "#ffffff";
    const n = parseInt(m[1], 16), lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.62 ? "#191600" : "#ffffff";
  }
  /** 카드에 쓸 아이콘 · 색: 카드에 정한 값 → 없으면 채널 종류 기본값 */
  function channelLook(ch) {
    const t = channelType(ch.type), color = /^#[0-9a-f]{6}$/i.test(ch.color || "") ? ch.color : t.color;
    return { icon: ch.icon || t.icon, color, ink: color ? (color === t.color && t.ink ? t.ink : inkOn(color)) : "" };
  }
  const channelType = (k) => CHANNEL_TYPES.find((x) => x.key === k) || CHANNEL_TYPES[CHANNEL_TYPES.length - 1];
  const defaultChannels = () => [
    { id: "ch1", type: "kakao", title: "카카오톡 1:1 상담", desc: "수강 · 결제 · 개인 상황처럼 다른 사람에게 보이고 싶지 않은 내용은 1:1로 편하게 남겨 주세요.", url: "", hours: "평일 10:00 ~ 18:00", label: "카카오톡으로 상담하기" }
  ];
  // 제휴채널: 두고그룹 회사 · 외부 제휴사 바로가기. 강사가 따로 정하지 않았으면 문대표 구성을 그 강사 이름으로 쓴다
  const PARTNER_GROUPS = [{ key: "doogo", label: "두고그룹", desc: "두고그룹이 직접 운영하는 서비스예요." }, { key: "partner", label: "제휴사", desc: "수강생 전용 혜택을 주는 외부 제휴사예요. 할인 코드는 카페 글에서 확인하세요." }];
  const PARTNER_ICONS = CHANNEL_ICONS.concat([["building", "건물 (사무실)"], ["send", "보내기 (송금)"], ["coins", "동전 (결제 · 금융)"], ["handshake", "악수 (제휴)"]]);
  function defaultPartners(c) {
    const src = (window.CLASS_SEED.content.moon || {}).partners || [];
    const inst = (c && c.brand && c.brand.instructor) || "문대표";
    return JSON.parse(JSON.stringify(src).replace(/문대표/g, inst));
  }
  const partnersOf = (c) => (Array.isArray(c.partners) ? c.partners : defaultPartners(c));
  const channelsOf = (c) => (Array.isArray(c.channels) ? c.channels : defaultChannels());

  // 코치: 강사 밑에서 과제 검수 · 문의 답변 등을 맡는 계정 (강사센터에서 강사가 만든다)
  const coachesOf = (insId) => { const ins = instructor(insId); return ins ? (ins.coaches = Array.isArray(ins.coaches) ? ins.coaches : []) : []; };
  const coach = (insId, coachId) => coachesOf(insId).find((x) => x.id === coachId) || null;
  /** 이름 + 뒷자리로 코치 찾기 (운영 중인 강사의 코치 · 중지 여부는 부르는 쪽에서 확인) */
  function findCoachLogin(name, phone4) {
    const nm = String(name || "").replace(/\s+/g, "");
    for (const ins of db.instructors) {
      if (ins.status !== "active") continue;
      const c = (ins.coaches || []).find((x) => x.name.replace(/\s+/g, "") === nm && x.phone4 === phone4);
      if (c) return { ins, coach: c };
    }
    return null;
  }

  /* ---------------- 불러오기 · 저장 ---------------- */
  let db = null;

  // 과제 종류: 필수(수료 조건) · 도전 · 마인드. required 는 kind 와 항상 같게 맞춘다
  const MISSION_KINDS = [
    { key: "required", label: "필수 과제", short: "필수", hint: "수료 조건" },
    { key: "challenge", label: "도전 과제", short: "도전", hint: "하면 실력이 늘어요" },
    { key: "mind", label: "마인드 과제", short: "마인드", hint: "생각과 다짐을 정리해요" }
  ];
  const missionKind = (m) => (MISSION_KINDS.some((k) => k.key === m.kind) ? m.kind : m.required ? "required" : "challenge");
  function normalizeWeeks(weeks) {
    weeks.forEach((w, i) => {
      w.no = i + 1; w.lessons = w.lessons || []; w.missions = w.missions || []; w.topics = w.topics || [];
      w.missions.forEach((m) => { m.kind = missionKind(m); m.required = m.kind === "required"; m.templates = m.templates || []; });
    });
  }
  function normalizeContent(c) {
    c.weeks = c.weeks || [];
    normalizeWeeks(c.weeks);
    c.curricula = Array.isArray(c.curricula) ? c.curricula : [];
    c.curricula.forEach((cu) => { cu.weeks = cu.weeks || []; normalizeWeeks(cu.weeks); });
    ["schedule", "notices", "faqs", "docsGuide", "motivation", "quotes", "guide"].forEach((k) => { c[k] = c[k] || []; });
    c.resources = Object.assign({ ebook: [], file: [], vod: [], senior: [] }, c.resources || {});
    c.pages = c.pages || {};
    if (!c.brand.theme) c.brand.theme = "lime";
    [c.schedule, c.notices, c.faqs, c.docsGuide, c.motivation, c.guide].forEach((list) => list.forEach((it) => { if (!it.id) it.id = uid("x"); }));
    c.notices.forEach((n) => { n.images = n.images || []; });
    ["vod", "senior"].forEach((k) => c.resources[k].forEach((it) => { it.images = it.images || []; }));
    return c;
  }

  /** 체험 계정(1기 · 2기): 모든 강의 시청 · 모든 과제 강사 승인 · 서류 준비 완료 → 수료증까지 열린 기록
   *  (서버는 api/_lib/oneoff.js 의 fullProgress 가 같은 기록을 만든다) */
  function fullDemoProgress(data, st, c) {
    const co = data.cohorts.find((x) => x.id === st.cohortId);
    const cu = co && co.curriculumId && co.curriculumId !== "main" && (c.curricula || []).find((x) => x.id === co.curriculumId);
    const ins = data.instructors.find((x) => x.id === st.instructorId);
    const reviewer = { by: ((ins && ins.name) || "") + " 강사", byId: st.instructorId, role: "instructor" };
    const p = Object.assign(emptyProgress(), { guideV: 2 });
    const DAY = 86400000, start = Date.parse(((co && co.startDate) || "2026-08-01") + "T10:00:00+09:00");
    ((cu ? cu.weeks : c.weeks) || []).forEach((w, wi) => {
      const base = start + wi * 7 * DAY + DAY;
      (w.lessons || []).forEach((l, i) => { p.watched[l.id] = base + i * 600000; });
      (w.missions || []).forEach((m, i) => {
        const at = base + DAY + i * 3600000;
        p.submissions[m.id] = [{
          at,
          text: m.type === "text" ? m.title + " 과제를 마쳤습니다. 강의 내용대로 정리했어요." : "",
          link: m.type === "link" ? "https://" + ((m.check && m.check.linkHint) || "example.com") + "/sample-store" : "",
          files: m.type === "image" ? [{ type: "pdf", name: m.title + ".pdf" }] : [],
          result: { pass: true, reasons: [], ok: ["체험 계정"] },
          review: Object.assign({ status: "approved", comment: "", at: at + 7200000 }, reviewer)
        }];
      });
    });
    (c.docsGuide || []).forEach((g, i) => { p.docs[g.id] = start + i * 3600000; });
    (c.notices || []).forEach((n) => { p.readNotices[n.id] = start; });
    (c.guide || []).forEach((g) => { p.guide[g.id] = start; });
    return p;
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
      if (s.all) { store.set(KEY_PROGRESS + sid, fullDemoProgress(data, st, c)); return; }
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
    if (R.on) return loadRemote();
    db = store.get(KEY_DB, null);
    if (db && db.version === 2 && Array.isArray(db.instructors)) migrate2to3();
    if (!db || db.version !== 3 || !Array.isArray(db.instructors)) {
      db = fromSeed();
      save();
    }
    return loadFixups();
  }
  // 서버 모드: 받아 온 문서로 시작하고, 아래 정리(기본값 채우기)는 화면용으로만 적용한다 (저장은 하지 않음)
  function loadRemote() {
    if (R.fresh) { db = R.fresh; R.fresh = null; }
    R.loading = true;
    try { if (db && Array.isArray(db.instructors) && db.content) loadFixups(); }
    finally { R.loading = false; }
    resnapAll();
    return db;
  }
  function loadFixups() {
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
    // 커리큘럼 상세(부제·핵심 목표·강의 내용)와 과제 종류(필수·도전·마인드), 카카오톡 응대 가이드 본문 (한 번만)
    if (!db.flags.weekDetailSeeded) {
      Object.keys(db.content).forEach((id) => {
        const c = db.content[id], sc = window.CLASS_SEED.content[id];
        if (!sc) return;
        const fill = (weeks, seedWeeks) => {
          const have = {};
          weeks.forEach((w) => w.missions.forEach((m) => { have[m.id] = true; }));
          weeks.forEach((w, i) => {
            const sw = seedWeeks[i];
            if (!sw || sw.title !== w.title) return;
            ["subtitle", "goal"].forEach((k) => { if (!w[k] && sw[k]) w[k] = sw[k]; });
            if (!(w.topics || []).length && sw.topics) w.topics = clone(sw.topics);
            sw.missions.forEach((sm) => {
              const m = w.missions.find((x) => x.id === sm.id);
              if (m) { m.kind = sm.kind; m.required = sm.kind === "required"; }
              else if (!have[sm.id]) w.missions.push(clone(sm));
            });
          });
        };
        fill(c.weeks, sc.weeks);
        (c.curricula || []).forEach((cu) => { const scu = (sc.curricula || []).find((x) => x.id === cu.id); if (scu) fill(cu.weeks, scu.weeks); });
        const g = (c.resources.senior || []).find((x) => x.id === "g4"), sg = (sc.resources.senior || []).find((x) => x.id === "g4");
        if (g && sg && /^스마트스토어 톡톡과 카카오톡 채널로 고객 문의에 답하는 기본 방법이에요/.test(g.body || "") && (g.body || "").length < 120) { g.body = sg.body; g.desc = sg.desc; }
      });
      db.flags.weekDetailSeeded = true; save();
    }
    // 과제 양식(엑셀) 예시 (한 번만): 시드에 양식이 있는 과제 id 에 비어 있으면 채운다
    if (!db.flags.templatesSeeded) {
      Object.keys(db.content).forEach((id) => {
        const c = db.content[id], sc = window.CLASS_SEED.content[id];
        if (!sc) return;
        const seedT = {};
        sc.weeks.concat(...(sc.curricula || []).map((cu) => cu.weeks)).forEach((w) => w.missions.forEach((m) => { if ((m.templates || []).length) seedT[m.id] = m.templates; }));
        c.weeks.concat(...(c.curricula || []).map((cu) => cu.weeks)).forEach((w) => w.missions.forEach((m) => { if (!(m.templates || []).length && seedT[m.id]) m.templates = clone(seedT[m.id]); }));
      });
      db.flags.templatesSeeded = true; save();
    }
    // 자주 찾는 페이지 v2 (한 번만): AI봇 빼고 유튜브 · 네이버 카페 · 두고커넥트 · 두고푸드를 브랜드 색으로
    if (!db.flags.quickLinksV2) {
      Object.keys(db.content).forEach((id) => {
        const c = db.content[id];
        if (!Array.isArray(c.quickLinks)) return;
        const defs = defaultQuickLinks(c);
        c.quickLinks = c.quickLinks.filter((l) => !(l.id === "ql5" && l.url === "#/bot") && !(l.id === "ql7" && !l.url));
        c.quickLinks.forEach((l) => { const d = defs.find((x) => x.id === l.id); if (d && d.color && !l.color) l.color = d.color; });
        defs.filter((d) => d.color && !c.quickLinks.some((l) => l.id === d.id || (l.url && l.url === d.url))).forEach((d) => c.quickLinks.push(d));
      });
      db.flags.quickLinksV2 = true; save();
    }
    // 문대표는 뉴질랜드 건기식 강의라 한국 · 뉴질랜드 시간을 기본으로 켠다 (한 번만)
    if (!db.flags.worldClockSeeded) {
      const mb = db.content.moon && db.content.moon.brand;
      if (mb && mb.worldClock === undefined) mb.worldClock = true;
      db.flags.worldClockSeeded = true; save();
    }
    // 1:1 소통채널 예시 (한 번만): 시드에 채널이 있는 강사(문대표)만 채운다
    if (!db.flags.channelsSeeded) {
      Object.keys(db.content).forEach((id) => { const sc = window.CLASS_SEED.content[id]; if (sc && sc.channels && !Array.isArray(db.content[id].channels)) db.content[id].channels = clone(sc.channels); });
      db.flags.channelsSeeded = true; save();
    }
    // 로그인 화면에 안내된 체험 계정(문대표 · 이수진 2186)은 잠긴 화면도 미리보기로 열어 볼 수 있게 표시 (한 번만)
    if (!db.flags.demoSeeded) {
      const s1 = db.students.find((x) => x.instructorId === "moon" && x.name === "이수진" && x.phone4 === "2186");
      if (s1) s1.demo = true;
      db.flags.demoSeeded = true; save();
    }
    // 문대표 1:1 소통채널을 두고바이오(제조 상담) · 제조 입금 후 개별 카톡방으로 교체 (한 번만, 예전 예시를 그대로 둔 경우만)
    if (!db.flags.channelsV2) {
      const mc = db.content.moon, sc = window.CLASS_SEED.content.moon;
      const OLD = ["문대표 오픈채팅방", "카카오톡 1:1 상담", "이메일 문의"];
      if (mc && sc && Array.isArray(mc.channels) && mc.channels.every((ch) => OLD.indexOf(ch.title) !== -1)) mc.channels = clone(sc.channels);
      db.flags.channelsV2 = true; save();
    }
    // 문대표 1:1 소통채널: 두고푸드(도매몰) 추가 + 카드마다 다른 아이콘 · 색 (한 번만)
    if (!db.flags.channelsV3) {
      const mc = db.content.moon, sc = window.CLASS_SEED.content.moon;
      if (mc && sc && Array.isArray(mc.channels)) {
        sc.channels.forEach((sch) => {
          const cur = mc.channels.find((x) => x.id === sch.id);
          if (cur) { if (!cur.icon) cur.icon = sch.icon; if (!cur.color) cur.color = sch.color; }
          else if (sch.id === "ch-food" && mc.channels.some((x) => x.id === "ch-bio")) mc.channels.push(clone(sch));
        });
      }
      db.flags.channelsV3 = true; save();
    }
    // 코치 예시 (한 번만): 시드에 코치가 있는 강사(문대표)에 코치가 없으면 넣는다
    if (!db.flags.coachesSeeded) {
      window.CLASS_SEED.instructors.forEach((si) => { const ins = db.instructors.find((x) => x.id === si.id); if (ins && si.coaches && !(ins.coaches || []).length) ins.coaches = clone(si.coaches); });
      db.flags.coachesSeeded = true; save();
    }
    // 무료강의 페이지 기본 문구 (한 번만, doogo.site 내용)
    if (!db.flags.freeSeeded2) {
      // doogo.site 와 같은 화면으로 바꾸면서 기본 내용을 새로 넣는다 (한 번만)
      Object.keys(db.content).forEach((id) => { const sc = window.CLASS_SEED.content[id]; if (sc && sc.freeClass) db.content[id].freeClass = clone(sc.freeClass); });
      db.flags.freeSeeded = db.flags.freeSeeded2 = true; save();
    }
    // 무료강의 첫 화면 배지 문구: '…전용 선물' → '…전용 선물 제공' (한 번만, 고쳐 쓴 문구는 그대로)
    if (!db.flags.freeBadgeV2) {
      Object.keys(db.content).forEach((id) => { const h = db.content[id].freeClass && db.content[id].freeClass.hero; if (h && h.badge === "무료강의 신청자 전용 선물") h.badge = "무료강의 신청자 전용 선물 제공"; });
      db.flags.freeBadgeV2 = true; save();
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
    // 강사 프로필 사진 · 강의 분야(첫 화면 강사 카드)가 생기기 전에 저장된 브라우저는 기본값을 채운다 (한 번만 · 서버는 일회성 작업이 맡음)
    if (!R.on && !db.flags.profileSeeded) {
      Object.keys(db.content).forEach((id) => {
        const b = db.content[id].brand, sb = (window.CLASS_SEED.content[id] || {}).brand || {};
        if (!b.photo && sb.photo) b.photo = sb.photo;
        if (!b.field && sb.field) b.field = sb.field;
      });
      db.flags.profileSeeded = true; save();
    }
    return db;
  }
  function save() {
    if (R.on) { if (!R.loading) schedule(); return true; }
    if (!store.set(KEY_DB, db)) { console.warn("저장 공간이 부족합니다"); return false; }
    return true;
  }
  function reset() {
    if (R.on) return call("admin", { action: "reset" }).then((j) => { if (j.error) throw new Error(j.error); return refresh(); });
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
  // 주차 강의 날짜: 기수에 ‘매주 무슨 요일’을 정했으면 그 주의 그 요일, 아니면 주차 시작일
  function classDate(co, no) {
    const open = weekOpen(co, no);
    const hasDow = co.classDow !== undefined && co.classDow !== null && co.classDow !== "";
    return hasDow ? addDays(open, ((Number(co.classDow) - parseDate(open).getDay()) + 7) % 7) : open;
  }
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
  /** 과제 성취에 따른 수강생 레벨. 전체 과제 완료율로 한 단계씩 오르고, 필수 과제를 모두 통과(수료 조건)하면 마지막 ‘숲’
   *  5단계: 씨앗 0% · 풀잎 25% · 가지 50% · 나무 75% · 숲 = 필수 전부 통과 */
  function level(p, instId, co) {
    const weeks = co ? cohortWeeks(co) : 5, steps = levelSteps(weeks), n = steps.length;
    const s = stats(p, instId, co);
    const reqAll = s.reqTotal > 0 && s.reqDone === s.reqTotal;
    const ratio = s.total ? s.done / s.total : 0;
    const idx = n === 1 || reqAll ? n - 1 : Math.min(n - 2, Math.floor(ratio * (n - 1) + 1e-9));
    let need = 0, needText = "";
    if (idx < n - 1) {
      if (idx + 1 === n - 1) { need = s.reqTotal - s.reqDone; needText = "필수 과제 " + need + "개"; }
      else { need = Math.max(1, Math.ceil((idx + 1) / (n - 1) * s.total - 1e-9) - s.done); needText = "과제 " + need + "개"; }
    }
    return { steps, idx, cur: steps[idx], next: steps[idx + 1] || null, need, needText, pct: s.pct, stats: s, weeks };
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
    weeksOf(co).forEach((w) => {
      const date = classDate(co, w.no);
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
  // 서버 모드에서도 미리보기(preview-…) 기록은 이 브라우저에만 둔다
  const localSid = (sid) => /^preview-/.test(String(sid));
  const progress = (sid) => Object.assign(emptyProgress(), R.on && !localSid(sid) ? clone(R.prog[sid] || {}) : store.get(KEY_PROGRESS + sid, {}));
  const saveProgress = (sid, p) => {
    if (R.on && !localSid(sid)) { R.prog[sid] = clone(p); schedule(); return true; }
    return store.set(KEY_PROGRESS + sid, p);
  };
  /** 진행 기록 전체 { 학생ID: 기록 } (백업용) */
  function allProgress() {
    const out = {};
    if (R.on) Object.keys(R.prog).forEach((sid) => { out[sid] = clone(R.prog[sid]); });
    else store.keys().filter((k) => k.indexOf(KEY_PROGRESS) === 0).forEach((k) => { out[k.slice(KEY_PROGRESS.length)] = store.get(k, {}); });
    return out;
  }
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
    const kinds = {};
    MISSION_KINDS.forEach((k) => { const l = all.filter((m) => missionKind(m) === k.key); kinds[k.key] = { total: l.length, done: l.filter((m) => subState(p, m.id) === "done").length }; });
    return { total: all.length, done, reqTotal: req.length, reqDone, kinds, pct: all.length ? Math.round((done / all.length) * 100) : 0 };
  }

  /* ---------------- 강사 입점 문의 ----------------
   * 방문자가 첫 화면에서 남기고 마스터가 관리한다. 서버 모드는 문서 inq:<id> (마스터만 보임), 아니면 이 브라우저에 */
  /* ---------- 첫 화면 바닥 · 사업자 정보 (마스터 → 첫 화면 · 사업자 정보에서 고침, 누구나 읽음) ---------- */
  const SITE_DEFAULT = {
    company: "(주)두고홀딩스", ceo: "문원오", bizNo: "", mailOrderNo: "", address: "", phone: "", email: "", hours: "", privacyOfficer: "", hosting: "",
    terms: "", privacy: "",
    group: [
      { name: "두고푸드", url: "https://www.doogofood.com/", desc: "" },
      { name: "두고커넥트", url: "https://www.doogoconnect.com/", desc: "" }
    ]
  };
  function siteInfo() {
    const s = (db && db.site) || {};
    return Object.assign({}, SITE_DEFAULT, s, { group: Array.isArray(s.group) ? s.group : clone(SITE_DEFAULT.group) });
  }
  function saveSite(next) { db.site = next; return save(); }

  const KEY_INQ = "moonclass:inquiries";
  const inqMap = () => (R.on ? R.inq : store.get(KEY_INQ, {}));
  const inquiries = () => { const m = inqMap(); return Object.keys(m).map((k) => m[k]).sort((a, b) => (b.at || 0) - (a.at || 0)); };
  function saveInquiry(x) {
    if (R.on) { R.inq[x.id] = x; schedule(); return true; }
    const m = store.get(KEY_INQ, {}); m[x.id] = x; return store.set(KEY_INQ, m);
  }
  function removeInquiry(id) {
    if (R.on) { delete R.inq[id]; schedule(); return true; }
    const m = store.get(KEY_INQ, {}); delete m[id]; return store.set(KEY_INQ, m);
  }
  async function applyPartner(a) {
    if (R.on) return call("public", Object.assign({ action: "partner-apply" }, a));
    const x = Object.assign({ id: uid("inq"), at: Date.now(), status: "new", memo: "" }, a);
    delete x.agree;
    return saveInquiry(x) ? { ok: true } : { error: "storage" };
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

  /* ---------------- 서버 연결 (Vercel 함수 + Turso 데이터베이스) ----------------
   * /api 가 있으면 서버 모드: 데이터를 서버에서 받아 오고, 바뀐 부분만 서버에 저장한다.
   * /api 가 없으면(로컬 정적 서버 · 미리보기) 예전처럼 이 브라우저(localStorage)에 저장한다.
   * 서버에서는 문서 단위(강사 · 콘텐츠 · 기수 · 수강생 · 진행 기록)로 나눠 보관하고,
   * 로그인한 사람이 볼 수 있는 문서만 내려온다. */
  const R = { on: false, fresh: null, loading: false, me: { student: null, admin: null }, epoch: null, now: 0, ver: {}, snap: {}, prog: {}, inq: {}, timer: null, busy: false, again: false, fails: 0, polling: false, lastPoll: 0, listeners: [] };
  const COLLS = ["instructors", "content", "cohorts", "students"];
  const CONTENT_PERMS = ["brand", "guide", "curriculum", "missions", "schedule", "notices", "faq", "docs", "library", "motivation", "channels", "partners", "pages", "free", "landing"];
  const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
  const emit = (type, info) => R.listeners.forEach((fn) => { try { fn(type, info); } catch (e) { console.error(e); } });

  async function call(name, payload, method) {
    const opt = { method: method || "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" } };
    if (payload !== undefined) opt.body = JSON.stringify(payload);
    const r = await fetch("api/" + name, opt);
    const j = await r.json().catch(() => ({ error: "server" }));
    if (r.status >= 500) throw new Error(j.message || j.error || "server " + r.status);
    return j;
  }
  /** 서버가 있는지 확인하고 처음 데이터를 받는다. 서버가 없으면 false (이 브라우저 저장 모드) */
  async function connect() {
    let r;
    // 서버가 없는 곳(정적 서버 · 미리보기)은 바로 404 나 오류가 난다. 응답이 너무 늦으면 연결 실패 화면을 보여 준다
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctl && setTimeout(() => ctl.abort(), 15000);
    try { r = await fetch("api/bootstrap", { credentials: "same-origin", cache: "no-store", signal: ctl ? ctl.signal : undefined }); }
    catch (e) { if (e && e.name === "AbortError") throw new Error("timeout"); return false; }
    finally { if (timer) clearTimeout(timer); }
    if (r.status >= 500) throw new Error("server " + r.status);
    let j = null;
    try { j = await r.json(); } catch (e) { return false; }
    if (!j || j.app !== "doogo-class" || j.mode !== "server") return false;
    R.on = true;
    take(j);
    startPolling();
    return true;
  }
  function take(j) {
    R.me = j.me || { student: null, admin: null };
    R.epoch = j.epoch || R.epoch;
    R.now = j.now;
    R.ver = {}; R.prog = {}; R.inq = {};
    const d = { instructors: [], content: {}, cohorts: [], students: [] };
    (j.docs || []).forEach((x) => { R.ver[x[0]] = x[2]; placeIn(d, x[0], x[1]); });
    R.fresh = d;
  }
  /** 로그인 · 로그아웃 뒤에 볼 수 있는 데이터가 바뀌므로 처음부터 다시 받는다 */
  async function refresh() {
    await flush();
    const j = await call("bootstrap", undefined, "GET");
    if (j.error) throw new Error(j.error);
    take(j);
    return load();
  }

  /* 데이터 한 덩어리 ↔ 문서 */
  function metaOf(d) { const m = {}; Object.keys(d).forEach((k) => { if (COLLS.indexOf(k) === -1) m[k] = d[k]; }); return m; }
  function splitDb(d) {
    const out = { meta: metaOf(d) };
    d.instructors.forEach((i) => { out["ins:" + i.id] = i; });
    Object.keys(d.content).forEach((iid) => { out["content:" + iid] = d.content[iid]; });
    const byIns = {};
    d.cohorts.forEach((c) => { (byIns[c.instructorId] = byIns[c.instructorId] || []).push(c); });
    Object.keys(byIns).forEach((iid) => { out["cohorts:" + iid] = byIns[iid]; });
    const sIns = {};
    d.students.forEach((s) => { sIns[s.id] = s.instructorId; out["stu:" + s.instructorId + ":" + s.id] = s; });
    Object.keys(R.prog).forEach((sid) => { if (sIns[sid]) out["prog:" + sIns[sid] + ":" + sid] = R.prog[sid]; });
    Object.keys(R.inq).forEach((id) => { out["inq:" + id] = R.inq[id]; });
    return out;
  }
  function docOf(k) {
    const p = k.split(":");
    if (k === "meta") return metaOf(db);
    if (p[0] === "ins") return db.instructors.find((x) => x.id === p[1]);
    if (p[0] === "content") return db.content[p[1]];
    if (p[0] === "cohorts") { const l = db.cohorts.filter((c) => c.instructorId === p[1]); return l.length ? l : undefined; }
    if (p[0] === "stu") return db.students.find((x) => x.id === p[2] && x.instructorId === p[1]);
    if (p[0] === "prog") return R.prog[p[2]];
    if (p[0] === "inq") return R.inq[p[1]];
    return undefined;
  }
  const replaceIn = (t, src) => { Object.keys(t).forEach((k) => { delete t[k]; }); Object.assign(t, src); };
  function placeIn(d, k, v) {
    const p = k.split(":");
    if (k === "meta") {
      Object.keys(d).forEach((x) => { if (COLLS.indexOf(x) === -1) delete d[x]; });
      if (v) Object.keys(v).forEach((x) => { if (COLLS.indexOf(x) === -1) d[x] = v[x]; });
    } else if (p[0] === "ins" || p[0] === "stu") {
      const list = p[0] === "ins" ? d.instructors : d.students, id = p[0] === "ins" ? p[1] : p[2];
      const i = list.findIndex((x) => x.id === id);
      if (v == null) { if (i >= 0) list.splice(i, 1); } else if (i >= 0) replaceIn(list[i], v); else list.push(v);
    } else if (p[0] === "content") {
      if (v == null) delete d.content[p[1]];
      else { if (d.content[p[1]]) replaceIn(d.content[p[1]], v); else d.content[p[1]] = v; if (d.content[p[1]].brand) normalizeContent(d.content[p[1]]); }
    } else if (p[0] === "cohorts") {
      const at = d.cohorts.findIndex((c) => c.instructorId === p[1]);
      const rest = d.cohorts.filter((c) => c.instructorId !== p[1]);
      const add = v || [];
      rest.splice(at < 0 ? rest.length : Math.min(at, rest.length), 0, ...add);
      d.cohorts.length = 0; rest.forEach((c) => d.cohorts.push(c));
    } else if (p[0] === "prog") {
      if (v == null) delete R.prog[p[2]]; else R.prog[p[2]] = v;
    } else if (p[0] === "inq") {
      if (v == null) delete R.inq[p[1]]; else R.inq[p[1]] = v;
    }
  }
  const snapOf = (k) => { const v = docOf(k); return v === undefined ? undefined : JSON.stringify(v); };
  function resnapAll() { R.snap = {}; if (!db) return; const all = splitDb(db); Object.keys(all).forEach((k) => { R.snap[k] = JSON.stringify(all[k]); }); }

  /* 바뀐 부분 찾기: 객체는 키별로, 배열은 끝에 추가만 했으면 '추가', 길이가 같으면 칸별로, 아니면 통째로 */
  function diff(a, b, path, ops) {
    if (a === b) return;
    if (isObj(a) && isObj(b)) {
      Object.keys(a).forEach((k) => { if (!(k in b)) ops.push({ p: path.concat(k), d: 1 }); });
      Object.keys(b).forEach((k) => { if (!(k in a)) ops.push({ p: path.concat(k), v: b[k] }); else diff(a[k], b[k], path.concat(k), ops); });
      return;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      if (b.length > a.length && a.every((x, i) => JSON.stringify(x) === JSON.stringify(b[i]))) { for (let i = a.length; i < b.length; i++) ops.push({ p: path.concat(i), v: b[i], a: 1 }); return; }
      if (a.length === b.length) { for (let i = 0; i < a.length; i++) diff(a[i], b[i], path.concat(i), ops); return; }
      ops.push({ p: path, v: b });
      return;
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) ops.push({ p: path, v: b });
  }
  function applyOps(doc, ops) {
    ops.forEach((op) => {
      if (!op.p.length) { doc = op.d ? null : op.v; return; }
      if (doc === null || typeof doc !== "object") doc = typeof op.p[0] === "number" ? [] : {};
      let cur = doc;
      for (let i = 0; i < op.p.length - 1; i++) { const k = op.p[i]; if (cur[k] === null || typeof cur[k] !== "object") cur[k] = typeof op.p[i + 1] === "number" ? [] : {}; cur = cur[k]; }
      const last = op.p[op.p.length - 1];
      if (op.d) { if (Array.isArray(cur)) cur.splice(last, 1); else delete cur[last]; } else if (op.a && Array.isArray(cur)) cur.push(op.v); else cur[last] = op.v;
    });
    return doc;
  }

  /** 이 사람이 서버에 저장할 수 있는 문서인지 (서버도 똑같이 다시 확인한다) */
  function canWrite(k) {
    const a = R.me.admin, st = R.me.student, p = k.split(":");
    if (a && a.role === "master") return true;
    if (k === "meta") return false;
    if (a && a.iid === p[1]) {
      if (a.role === "instructor") return true;
      const ins = db.instructors.find((x) => x.id === a.iid);
      const co = ins && (ins.coaches || []).find((x) => x.id === a.cid);
      const perms = (co && co.perms) || [];
      const any = (l) => perms.some((x) => l.indexOf(x) !== -1);
      if (p[0] === "ins") return any(["menus"]);
      if (p[0] === "content") return any(CONTENT_PERMS);
      if (p[0] === "cohorts") return any(["cohorts"]);
      if (p[0] === "stu") return any(["students"]);
      if (p[0] === "prog") return any(["reviews", "questions", "students"]);
    }
    return !!(st && p[0] === "prog" && p[1] === st.iid && p[2] === st.sid);
  }

  function schedule() { if (!R.on) return; clearTimeout(R.timer); R.timer = setTimeout(flush, 250); }
  /** 바뀐 문서를 서버에 보낸다 */
  async function flush() {
    if (!R.on || !db) return;
    clearTimeout(R.timer); R.timer = null;
    if (R.busy) { R.again = true; return; }
    const cur = splitDb(db), changes = [], sent = {};
    Object.keys(cur).concat(Object.keys(R.snap).filter((k) => !(k in cur))).forEach((k) => {
      const js = cur[k] === undefined ? undefined : JSON.stringify(cur[k]);
      if (js === R.snap[k]) return;
      // 고칠 권한이 없는 문서(예: 화면용 기본값 채우기)는 서버에 보내지 않고 그대로 둔다
      if (!canWrite(k)) { if (js === undefined) delete R.snap[k]; else R.snap[k] = js; return; }
      sent[k] = js;
      const base = R.ver[k] || 0;
      if (js === undefined) changes.push({ k, base, del: true });
      else if (R.snap[k] === undefined) changes.push({ k, base, put: cur[k] });
      else { const ops = []; diff(JSON.parse(R.snap[k]), cur[k], [], ops); changes.push({ k, base, ops }); }
    });
    if (!changes.length) return;
    R.busy = true;
    emit("saving", true);
    try {
      const j = await call("sync", { changes });
      if (j.error) throw new Error(j.error);
      if (j.me) R.me = j.me;
      j.results.forEach((x) => {
        if (x.error) {
          if (x.error === "busy") { R.again = true; return; }
          R.snap[x.k] = sent[x.k];
          emit("error", x.error === "too-large" ? "사진이나 첨부가 너무 커서 저장하지 못했어요. 크기를 줄여 다시 올려 주세요." : "저장할 권한이 없는 내용이 있어 저장하지 못했어요.");
          return;
        }
        R.ver[x.k] = x.ver;
        if (x.doc === undefined) { if (sent[x.k] === undefined) delete R.snap[x.k]; else R.snap[x.k] = sent[x.k]; return; }
        // 서버에서 합쳐진 결과(다른 사람 변경 · 사진 주소)를 받는다. 그 사이 또 고친 내용은 그 위에 다시 얹는다
        const now = snapOf(x.k);
        if (x.doc != null && now !== undefined && sent[x.k] !== undefined && now !== sent[x.k]) {
          const ops = []; diff(JSON.parse(sent[x.k]), JSON.parse(now), [], ops);
          placeIn(db, x.k, applyOps(clone(x.doc), ops));
          R.snap[x.k] = JSON.stringify(x.doc);
          R.again = true;
        } else { placeIn(db, x.k, x.doc); R.snap[x.k] = snapOf(x.k); }
        emit("change", [x.k]);
      });
      R.fails = 0;
      emit("saving", false);
    } catch (e) {
      R.fails++;
      emit("offline", e.message);
      setTimeout(flush, Math.min(30000, 1500 * R.fails));
    } finally {
      R.busy = false;
      if (R.again) { R.again = false; schedule(); }
    }
  }
  /** 다른 기기 · 다른 사람이 바꾼 내용 받기 (30초마다, 그리고 이 창으로 돌아올 때) */
  async function poll(force) {
    if (!R.on || !db || R.polling || R.busy || R.timer) return;
    if (!force && Date.now() - R.lastPoll < 5000) return;
    R.polling = true;
    try {
      const j = await call("bootstrap?since=" + Math.max(0, R.now - 15000), undefined, "GET");
      if (j.error) return;
      if (j.epoch && R.epoch && j.epoch !== R.epoch) { emit("reset"); return; }
      const meChanged = JSON.stringify(j.me) !== JSON.stringify(R.me);
      R.me = j.me; R.now = j.now;
      const changed = [];
      (j.docs || []).forEach(([k, v, ver]) => {
        if (ver <= (R.ver[k] || 0)) return;
        // 내가 고치는 중인 문서는 건너뛴다 (저장할 때 서버에서 합쳐져 돌아온다)
        if (canWrite(k) && snapOf(k) !== R.snap[k]) return;
        placeIn(db, k, v);
        R.ver[k] = ver;
        R.snap[k] = snapOf(k);
        changed.push(k);
      });
      if (changed.length || meChanged) emit("change", changed);
    } catch (e) { /* 다음에 다시 */ } finally { R.polling = false; R.lastPoll = Date.now(); }
  }
  function startPolling() {
    setInterval(() => poll(), 30000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
    window.addEventListener("focus", () => poll());
    window.addEventListener("beforeunload", (e) => { if (R.timer || R.busy) { flush(); e.preventDefault(); e.returnValue = ""; } });
  }
  const remote = {
    get on() { return R.on; },
    get me() { return R.me; },
    connect, refresh, flush, poll, call,
    login: (payload) => call("auth", payload),
    logout: (which) => flush().catch(() => {}).then(() => call("auth", { action: "logout", which })),
    pending: () => !!(R.timer || R.busy),
    listen: (fn) => { R.listeners.push(fn); }
  };

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
    load, save, reset, store, clone, uid, esc, youtubeId, rich, libNoticeOf, CHANNEL_TYPES, CHANNEL_ICONS, CHANNEL_COLORS, channelType, channelLook, defaultChannels, channelsOf, PARTNER_GROUPS, PARTNER_ICONS, defaultPartners, partnersOf, inkOn, coachesOf, coach, findCoachLogin, QL_ICONS, defaultQuickLinks, quickLinksOf, csvData, MISSION_KINDS, missionKind, classDate, template, templateFromMoon, moonMenu, normalizeContent, LANDING_SECTIONS, landingOf, FREE_SECTIONS, freeOf,
    get data() { return db; },
    instructor, activeInstructors, content, cohort, cohortsOf, studentsOf, student,
    curricula, curriculum, curriculumOf, weeksOf, cohortWeeks,
    weekOpen, weekDeadline, cohortEnd, cohortStatus, STATUS_LABEL, currentWeek, LEVEL_SET, levelSteps, level, currentCohort, nextCohortName,
    EVENT_TYPES, events, ruleText,
    REQUEST_CATEGORIES, maskName, requests, inquiries, saveInquiry, removeInquiry, applyPartner, siteInfo, saveSite, SITE_DEFAULT,
    THEMES, themeOf, STUDENT_MENUS, LIB_MENUS, CUSTOM_ICONS, menuConfig, menuOn, libOn, isCustom,
    emptyProgress, progress, saveProgress, allProgress, lastSub, subState, stats,
    session, remote,
    date: { DOW, todayStr, parseDate, addDays, diffDays, fmtMD, fmtFull, fmtKo, fmtStamp, toStr }
  };
})();
