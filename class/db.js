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
        liveTime: "20:00",
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
      docsGuide: [],
      resources: { ebook: [], file: [], vod: [], senior: [] },
      motivation: [],
      quotes: ["오늘의 작은 실천이 더 큰 기회를 만듭니다"]
    };
  }

  /* ---------------- 불러오기 · 저장 ---------------- */
  let db = null;

  function normalizeContent(c) {
    c.weeks = c.weeks || [];
    c.weeks.forEach((w, i) => { w.no = i + 1; w.lessons = w.lessons || []; w.missions = w.missions || []; });
    ["schedule", "notices", "faqs", "docsGuide", "motivation", "quotes"].forEach((k) => { c[k] = c[k] || []; });
    c.resources = Object.assign({ ebook: [], file: [], vod: [], senior: [] }, c.resources || {});
    c.pages = c.pages || {};
    if (!c.brand.theme) c.brand.theme = "lime";
    [c.schedule, c.notices, c.faqs, c.docsGuide, c.motivation].forEach((list) => list.forEach((it) => { if (!it.id) it.id = uid("x"); }));
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
  const weekCount = (instId) => { const c = content(instId); return c ? c.weeks.length : 0; };
  const weekOpen = (co, no) => addDays(co.startDate, (no - 1) * 7);
  const weekDeadline = (co, no) => addDays(co.startDate, (no - 1) * 7 + 6);
  const cohortEnd = (co) => addDays(co.startDate, Math.max(1, weekCount(co.instructorId)) * 7 - 1);
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
    return Math.min(weekCount(co.instructorId), Math.floor(d / 7) + 1);
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
    const time = c.brand.liveTime || "";
    c.weeks.forEach((w) => {
      out.push({ date: weekOpen(co, w.no), time, type: "open", week: w.no, title: w.no + "주차 강의 — " + w.title + (time ? " (" + time + ")" : ""), auto: true });
      out.push({ date: weekDeadline(co, w.no), time: "", type: "deadline", week: w.no, title: w.no + "주차 과제 마감", auto: true });
    });
    c.schedule.forEach((e) => {
      let date = null;
      if (e.scope === "cohort") { if (e.cohortId === co.id) date = e.date; }
      else {
        const open = weekOpen(co, Number(e.week) || 1);
        const d = parseDate(open).getDay();
        date = addDays(open, ((Number(e.dow) - d) + 7) % 7);
      }
      if (date) out.push({ date, time: e.time || "", type: e.type, week: e.scope === "cohort" ? null : Number(e.week), title: e.title, id: e.id });
    });
    return out.sort((a, b) => (a.date + (a.time || "99")).localeCompare(b.date + (b.time || "99")));
  }
  function ruleText(e, instId) {
    if (e.scope === "cohort") { const co = cohort(e.cohortId); return (co ? co.name : "삭제된 기수") + " · " + (e.date ? fmtMD(e.date) : "-"); }
    return "모든 기수 · " + e.week + "주차 " + DOW[Number(e.dow)] + "요일";
  }

  /* ---------------- 진행 기록 ---------------- */
  function emptyProgress() { return { submissions: {}, watched: {}, docs: {}, questions: [], chat: [] }; }
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
  function stats(p, instId) {
    const c = content(instId);
    const all = c ? c.weeks.flatMap((w) => w.missions) : [];
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
    load, save, reset, store, clone, uid, esc, youtubeId, template, normalizeContent,
    get data() { return db; },
    instructor, activeInstructors, content, cohort, cohortsOf, studentsOf, student,
    weekOpen, weekDeadline, cohortEnd, cohortStatus, STATUS_LABEL, currentWeek, currentCohort, nextCohortName,
    EVENT_TYPES, events, ruleText,
    REQUEST_CATEGORIES, maskName, requests,
    THEMES, themeOf, STUDENT_MENUS, LIB_MENUS, CUSTOM_ICONS, menuConfig, menuOn, libOn, isCustom,
    emptyProgress, progress, saveProgress, lastSub, subState, stats,
    session,
    date: { DOW, todayStr, parseDate, addDays, diffDays, fmtMD, fmtFull, fmtKo, fmtStamp, toStr }
  };
})();
