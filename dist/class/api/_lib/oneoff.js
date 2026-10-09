/* 일회성 데이터 작업 — 사용자가 직접 요청한 데이터 수정만 여기에 둔다.
 * 운영 배포 때 아직 안 한 작업만 한 번 실행하고 oplog 에 기록한다 (같은 작업은 다시 돌지 않음).
 * 실행 전에 배포 백업이 먼저 만들어지므로, 잘못되면 마스터 → 데이터 관리에서 그 백업으로 되돌릴 수 있다.
 * 각 작업은 run(get, keys) → { writes: { 문서키: 새 값 | null(삭제) }, result } 를 돌려준다.
 * 이미 사람이 고친 내용은 건드리지 않도록 조건을 좁게 잡는다. */
"use strict";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const clone = (x) => JSON.parse(JSON.stringify(x));
const DAY = 86400000;

/* ---------- 서류 준비 가이드 6단계 (문대표) ---------- */
const DOCS_NEW = {
  health: { id: "d6", title: "건강기능식품 일반 판매업 신고", where: "정부24 · 관할 시·군·구청 위생과", url: "https://www.gov.kr", time: "1 ~ 3일", cost: "신고 수수료 (지역별 상이)",
    docs: ["사업자등록증", "건강기능식품 위생교육 수료증", "신분증"],
    tips: ["신고 전에 한국건강기능식품협회의 신규 영업자 위생교육(온라인)을 먼저 들어 두세요", "영업신고증이 나오면 판매 채널에 함께 등록해요"] },
  safe: { id: "d7", title: "구매안전서비스 이용확인증", where: "스마트스토어 판매자센터 · 쿠팡 윙", url: "https://sell.smartstore.naver.com", time: "즉시", cost: "무료",
    docs: ["사업자등록증", "판매 채널 가입 (스마트스토어 등)"],
    tips: ["통신판매업 신고 때 함께 내는 서류예요", "판매자센터의 판매자 정보 메뉴에서 바로 발급할 수 있어요"] },
  bank: { id: "d8", title: "사업자 통장 및 신용카드", where: "홈택스 · 거래 은행", url: "https://www.hometax.go.kr", time: "당일 ~ 1주", cost: "무료",
    docs: ["사업자등록증", "신분증"],
    tips: ["판매 채널 정산 계좌는 사업자 통장으로 등록해요", "사업용 카드를 홈택스에 등록해 두면 경비 처리와 부가세 신고가 쉬워져요"] }
};
const DOC_ORDER = [
  { key: "biz", re: /사업자\s*등록/ },
  { key: "health", re: /건강기능식품|건기식/ },
  { key: "mail", re: /통신\s*판매/ },
  { key: "agent", re: /구매\s*대행/ },
  { key: "safe", re: /구매\s*안전/ },
  { key: "bank", re: /통장|신용\s*카드/ }
];
function docsGuideSix(get) {
  const k = "content:moon", c = get(k);
  if (!isObj(c) || !Array.isArray(c.docsGuide)) return { writes: {}, result: { skipped: "문대표 콘텐츠 없음" } };
  const list = clone(c.docsGuide);
  // 6단계에 없는 예전 기본 단계: 수입식품 위생교육(구매대행업 등록 안내로 합침) · 판매 채널 가입
  const edu = list.find((g) => g.id === "d3" && /위생\s*교육/.test(g.title || ""));
  const drop = list.filter((g) => (g.id === "d3" && /위생\s*교육/.test(g.title || "")) || (g.id === "d5" && /판매\s*채널/.test(g.title || "")));
  const rest = list.filter((g) => drop.indexOf(g) === -1);
  const used = new Set();
  const out = [];
  DOC_ORDER.forEach(({ key, re }) => {
    const have = rest.find((g) => !used.has(g) && re.test(g.title || ""));
    if (have) { used.add(have); out.push(have); }
    else if (DOCS_NEW[key]) out.push(clone(DOCS_NEW[key]));
  });
  rest.forEach((g) => { if (!used.has(g)) out.push(g); });
  if (edu) {
    const agent = out.find((g) => /구매\s*대행/.test(g.title || ""));
    const tip = "영업등록 전에 한국식품산업협회 ‘수입식품 위생교육’(온라인 약 8시간)을 먼저 이수해요";
    if (agent && !(agent.tips || []).some((t) => /위생\s*교육/.test(t))) agent.tips = (agent.tips || []).concat(tip);
  }
  return { writes: { [k]: Object.assign({}, c, { docsGuide: out }) }, result: { steps: out.map((g) => g.title), removed: drop.map((g) => g.title) } };
}

/* ---------- 동기부여 영상 (문대표) ---------- */
const VIDEOS = [
  { id: "mv-yt1", title: "이 영상을 보는 0.3%는 인생이 바뀔 겁니다 (스터디언)", youtubeId: "uMYLbqRGF2c", minutes: "", date: "2026-10-08" },
  { id: "mv-yt2", title: "하루에 하나만 잘해도 얻게 되는 효과 4가지 (스터디언)", youtubeId: "_dRXf6W63XI", minutes: "", date: "2026-10-07" },
  { id: "mv-yt3", title: "진짜 실패는 시도조차 하지 않는 것 (짧은명언 AWAKE)", youtubeId: "xSBV_7DdPw8", minutes: "", date: "2026-10-06" },
  { id: "mv-yt4", title: "나의 노력이 하찮게 느껴질 때 (짧은명언 AWAKE)", youtubeId: "LTR2dknCmnc", minutes: "", date: "2026-10-05" },
  { id: "mv-yt5", title: "넘어지거나, 넘어서거나 (스터디언)", youtubeId: "hcC8lMniCyA", minutes: "", date: "2026-10-04" },
  { id: "mv-yt6", title: "당장의 쾌락을 죽여라 (멘탈훈련소)", youtubeId: "pQea9wWPFsM", minutes: "", date: "2026-10-03" }
];
const PLACEHOLDER = /^mv[1-6]$/;
function motivationVideos(get) {
  const k = "content:moon", c = get(k);
  if (!isObj(c) || !Array.isArray(c.motivation)) return { writes: {}, result: { skipped: "문대표 콘텐츠 없음" } };
  // 영상 주소가 없는 처음 예시(mv1~mv6)만 빼고, 강사님이 올린 항목은 그대로 둔다
  const keep = c.motivation.filter((m) => !(PLACEHOLDER.test(m.id) && !m.youtubeId));
  const add = VIDEOS.filter((v) => !keep.some((m) => m.youtubeId === v.youtubeId)).map(clone);
  return { writes: { [k]: Object.assign({}, c, { motivation: add.concat(keep) }) }, result: { added: add.map((v) => v.youtubeId), removed: c.motivation.length - keep.length } };
}

/* ---------- 문대표 체험 계정 ---------- */
const weeksFor = (c, co) => {
  const cu = co && co.curriculumId && co.curriculumId !== "main" && (c.curricula || []).find((x) => x.id === co.curriculumId);
  return (cu ? cu.weeks : c.weeks) || [];
};
/** 모든 과제 승인 · 모든 강의 시청 · 서류 준비 완료 → 수료증까지 열린 진행 기록 */
function fullProgress(c, co, reviewer) {
  const p = { submissions: {}, watched: {}, docs: {}, questions: [], chat: [], notes: {}, readNotices: {}, guide: {}, guideV: 2 };
  const start = Date.parse((co && co.startDate ? co.startDate : "2026-08-01") + "T10:00:00+09:00");
  weeksFor(c, co).forEach((w, wi) => {
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
function moonDemoAccounts(get, keys) {
  const c = get("content:moon"), ins = get("ins:moon"), cohorts = get("cohorts:moon");
  if (!isObj(c) || !isObj(ins) || !Array.isArray(cohorts)) return { writes: {}, result: { skipped: "문대표 데이터 없음" } };
  const writes = {}, removed = [];
  const isSujin = (s) => s.id === "s1" || (s.name === "이수진" && s.phone4 === "2186");
  const keep = new Set(["demo1", "demo2"]);
  keys("stu:moon:").forEach((k) => {
    const s = get(k);
    if (!isObj(s)) return;
    if (isSujin(s)) { keep.add(s.id); if (!s.demo || s.status !== "approved") writes[k] = Object.assign({}, s, { demo: true, status: "approved" }); return; }
    if (keep.has(s.id)) return;
    writes[k] = null;
    removed.push(s.name + " (" + s.id + ")");
  });
  keys("prog:moon:").forEach((k) => { const sid = k.split(":")[2]; if (!keep.has(sid) && get(k) != null) writes[k] = null; });
  const reviewer = { by: (ins.name || "문대표") + " 강사", byId: "moon", role: "instructor" };
  const findCo = (name, id) => cohorts.find((x) => x.name === name) || cohorts.find((x) => x.id === id);
  const created = [];
  [["demo1", "1기", "c1", "1기 체험단", "1111", "2026-07-28"], ["demo2", "2기", "c2", "2기 체험단", "2222", "2026-08-25"]].forEach(([sid, coName, coId, name, phone4, appliedAt]) => {
    const co = findCo(coName, coId);
    if (!co) return;
    const sk = "stu:moon:" + sid, pk = "prog:moon:" + sid;
    if (get(sk) == null) { writes[sk] = { id: sid, instructorId: "moon", cohortId: co.id, name, phone4, status: "approved", appliedAt, demo: true }; created.push(name); }
    if (get(pk) == null) writes[pk] = fullProgress(c, co, reviewer);
  });
  return { writes, result: { removed, created, kept: Array.from(keep) } };
}

/* ---------- 문대표 강사 프로필 사진 · 강의 분야 (첫 화면 강사 소개 카드) ---------- */
function moonProfile(get) {
  const k = "content:moon", c = get(k);
  if (!isObj(c) || !isObj(c.brand)) return { writes: {}, result: { skipped: "문대표 콘텐츠 없음" } };
  // 이미 사진 · 분야를 넣었다면 그대로 둔다
  const add = {};
  if (!c.brand.photo) add.photo = "assets/home/moon-profile.webp";
  if (!c.brand.field) add.field = "뉴질랜드 건기식 브랜딩";
  if (!Object.keys(add).length) return { writes: {}, result: { skipped: "이미 있음" } };
  return { writes: { [k]: Object.assign({}, c, { brand: Object.assign({}, c.brand, add) }) }, result: { added: Object.keys(add) } };
}

/* 위에서부터 차례로 (앞 작업 결과를 뒤 작업이 본다) */
const OPS = [
  { id: "2026-10-08-docs-guide-6", note: "문대표 서류 준비 가이드를 6단계로", run: docsGuideSix },
  { id: "2026-10-08-motivation-videos", note: "문대표 동기부여 채널에 유튜브 영상 6개", run: motivationVideos },
  { id: "2026-10-08-moon-demo-accounts", note: "문대표 체험 계정(3기 이수진 · 1기 체험단 · 2기 체험단)만 남기기", run: moonDemoAccounts },
  { id: "2026-10-09-moon-profile-photo", note: "문대표 강사 프로필 사진 · 강의 분야 (첫 화면 강사 카드)", run: moonProfile }
];

module.exports = { OPS, fullProgress, docsGuideSix, motivationVideos, moonDemoAccounts, moonProfile };
