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

/* ---------- 로직메이커(김신용 대표) · 황금농부 프로필 사진 (대표님 요청) ----------
 * 사진이 비어 있을 때만 넣는다 (강사님이 이미 올린 사진은 그대로) */
function logicFarmerPhotos(get) {
  const want = { logic: "assets/home/logic-profile.webp", farmer: "assets/home/farmer-profile.webp" };
  const writes = {}, added = [];
  Object.keys(want).forEach((iid) => {
    const k = "content:" + iid, c = get(k);
    if (!isObj(c) || !isObj(c.brand) || c.brand.photo) return;
    writes[k] = Object.assign({}, c, { brand: Object.assign({}, c.brand, { photo: want[iid] }) });
    added.push(iid);
  });
  return { writes, result: added.length ? { added } : { skipped: "이미 있음" } };
}

/* ---------- 기수 이용료: 부가세 포함으로 (대표님 요청) ----------
 * 마스터 설정(meta.billing)이 이미 저장돼 있으면 부가세 방식만 '포함'으로, 아직 입금 확인 전인 신청도 '포함'으로.
 * 입금 확인을 마친 기록은 그때 방식 그대로 둔다 */
function billingVatIncluded(get, keys) {
  const writes = {}, result = { meta: false, bills: [] };
  const meta = get("meta");
  if (isObj(meta) && isObj(meta.billing) && meta.billing.vat !== "included") {
    writes.meta = Object.assign({}, meta, { billing: Object.assign({}, meta.billing, { vat: "included" }) });
    result.meta = true;
  }
  keys("bill:").forEach((k) => {
    const b = get(k);
    if (isObj(b) && b.vat && b.vat !== "included" && !b.paidAt && !b.canceledAt) { writes[k] = Object.assign({}, b, { vat: "included" }); result.bills.push(k); }
  });
  return { writes, result };
}

/* ---------- 수강생 메뉴 이름을 두고 클래스 표현으로 (대표님 요청) ----------
 * 1) 강사 메뉴 구성에 예전 기본 이름이 그대로 저장돼 있으면 지워서 새 기본 이름이 보이게 (강사가 직접 바꾼 이름은 그대로)
 * 2) AI봇 이름이 예전 기본값('24시 OOO AI봇')이면 'OOO AI 조교'로
 * 3) 공지 · FAQ · 시작 가이드 · 강의 소개 페이지의 예전 기본 문구 가운데 메뉴 이름이 들어간 문장만 새 이름으로 (문장이 그대로 남아 있을 때만)
 * 4) 홈 ‘빠른 이동’ 기본 4칸 이름 (예전 기본 이름일 때만)
 * (db.js 의 RENAME_PHRASES · QL_RENAME · OLD_MENU_LABELS 와 같은 목록) */
const OLD_MENU_LABELS = { home: "홈", curriculum: "커리큘럼", missions: "과제 제출하기", schedule: "강의 일정", notices: "공지사항", qna: "Q&A", docs: "서류 준비 가이드", bot: "AI봇", library: "유료강의 자료실", motivation: "동기부여", channels: "1:1 소통채널", partners: "제휴채널", certificate: "수료증" };
const RENAME_PHRASES = [
  [/다시보기는 커리큘럼 메뉴에 올라갑니다/g, "다시보기는 ‘라이브 다시보기’ 메뉴에 올라갑니다"],
  [/‘과제 제출하기’에서 주차별로/g, "‘과제 · 미션’에서 주차별로"],
  [/Q&A 메뉴나 24시 (\S+) AI봇에 먼저/g, "‘질문 · 요청’ 메뉴나 $1 AI 조교에게 먼저"],
  [/^유료강의 자료실 이용 시 주의사항$/, "강의 자료함 이용 시 주의사항"],
  [/다시보기가 커리큘럼 1주차에 올라갔습니다/g, "다시보기가 ‘주차별 강의’ 1주차에 올라갔습니다"],
  [/‘서류 준비 가이드’ 메뉴/g, "‘실무 체크리스트’ 메뉴"],
  [/라이브 다음 날까지 커리큘럼 메뉴에 다시보기가 올라갑니다\. 강의 일정 메뉴에서/g, "라이브 다음 날까지 ‘라이브 다시보기’ 메뉴에 영상이 올라갑니다. ‘수업 캘린더’ 메뉴에서"],
  [/강의 일정 메뉴의 파란 점/g, "‘수업 캘린더’ 메뉴의 파란 점"],
  [/Q&A의 ‘요청사항’ 탭에서 ‘문의하기’를 눌러/g, "‘질문 · 요청’ 메뉴의 ‘1:1 요청’ 탭에서 ‘요청 남기기’를 눌러"],
  [/^다시보기가 커리큘럼 메뉴에 올라갑니다\.$/, "다시보기가 ‘라이브 다시보기’ 메뉴에 올라갑니다."],
  [/AI봇에 밤에 물어봐도/g, "AI 조교한테 밤에 물어봐도"],
  [/^서류 준비 가이드 · 마진 계산기$/, "실무 체크리스트 · 마진 계산기"],
  [/^24시 (\S+) AI봇$/, "$1 AI 조교 (24시간 답변)"],
  [/일정, 자료실, 24시 AI봇까지 한 곳에서/g, "일정, 자료함, AI 조교까지 한 곳에서"],
  [/^AI봇에게 궁금한 점 물어보기$/, "AI 조교에게 궁금한 점 물어보기"],
  [/^강의 일정 확인하기$/, "수업 캘린더 확인하기"]
];
const QL_RENAME = { ql1: ["공지사항", "클래스 소식"], ql2: ["자주 묻는 질문", "FAQ 검색"], ql3: ["서류 준비 가이드", "실무 체크리스트"], ql4: ["요청사항", "1:1 요청"] };
function renamePhrases(c) {
  let n = 0;
  const fix = (v) => RENAME_PHRASES.reduce((t, p) => t.replace(p[0], p[1]), v);
  const walk = (o) => {
    if (Array.isArray(o)) { o.forEach((v, i) => { if (typeof v === "string") { const r = fix(v); if (r !== v) { o[i] = r; n++; } } else if (v && typeof v === "object") walk(v); }); return; }
    Object.keys(o).forEach((k) => { const v = o[k]; if (typeof v === "string") { if (k === "data" || k === "photo") return; const r = fix(v); if (r !== v) { o[k] = r; n++; } } else if (v && typeof v === "object") walk(v); });
  };
  ["notices", "faqs", "guide", "landing"].forEach((k) => { if (c[k] && typeof c[k] === "object") walk(c[k]); });
  const b = c.brand;
  if (isObj(b) && b.botName === "24시 " + (b.instructor || "강사") + " AI봇") { b.botName = (b.instructor || "강사") + " AI 조교"; n++; }
  (Array.isArray(c.quickLinks) ? c.quickLinks : []).forEach((l) => { const r = isObj(l) && QL_RENAME[l.id]; if (r && l.title === r[0]) { l.title = r[1]; n++; } });
  return n;
}
function menuNamesV15(get, keys) {
  const writes = {}, result = { menus: [], content: [] };
  keys("ins:").forEach((k) => {
    const ins = get(k);
    if (!isObj(ins) || !isObj(ins.menu) || !Array.isArray(ins.menu.items)) return;
    let n = 0;
    ins.menu.items.forEach((x) => { if (isObj(x) && x.label && OLD_MENU_LABELS[x.key] === x.label) { delete x.label; n++; } });
    if (n) { writes[k] = ins; result.menus.push(k + " · " + n); }
  });
  keys("content:").forEach((k) => {
    const c = get(k);
    if (!isObj(c)) return;
    const n = renamePhrases(c);
    if (n) { writes[k] = c; result.content.push(k + " · " + n); }
  });
  return { writes, result };
}

/* ---------- 로직메이커 → 부알남 (대표님 요청) ----------
 * 강사 표시 이름이 아직 ‘로직메이커’이면 ‘부알남’으로, 그 강사 콘텐츠(브랜드 · 강의 소개 · 무료강의 · 공지 등)의 ‘로직메이커’ 글자도 ‘부알남’으로.
 * 강사센터 로그인 이름(name)은 그대로 둔다 (로그인이 막히지 않게). 사진 · 파일 데이터 칸은 건너뜀 */
function renameWordDeep(o, re, to) {
  let n = 0;
  const walk = (x) => {
    if (Array.isArray(x)) { x.forEach((v, i) => { if (typeof v === "string") { const r = v.replace(re, to); if (r !== v) { x[i] = r; n++; } } else if (v && typeof v === "object") walk(v); }); return; }
    Object.keys(x).forEach((k) => { const v = x[k]; if (typeof v === "string") { if (k === "data" || k === "photo") return; const r = v.replace(re, to); if (r !== v) { x[k] = r; n++; } } else if (v && typeof v === "object") walk(v); });
  };
  walk(o);
  return n;
}
function logicToBualnam(get) {
  const writes = {}, result = {};
  const ins = get("ins:logic");
  if (isObj(ins)) {
    let n = 0;
    if (ins.displayName === "로직메이커") { ins.displayName = "부알남"; n++; }
    if (isObj(ins.brand)) n += renameWordDeep(ins.brand, /로직메이커/g, "부알남");
    if (n) { writes["ins:logic"] = ins; result.ins = n; }
  }
  const c = get("content:logic");
  if (isObj(c)) { const n = renameWordDeep(c, /로직메이커/g, "부알남"); if (n) { writes["content:logic"] = c; result.content = n; } }
  return { writes, result: Object.keys(result).length ? result : { skipped: "이미 바뀜" } };
}

/* ---------- 빠른 이동 ‘두고푸드’ 설명 (대표님 요청) ----------
 * 예전 기본 문구 그대로인 칸만 ‘전문 식품 도매몰 · 사업자 전용가’로 (강사가 고친 설명은 그대로) */
function foodQuickLinkDesc(get, keys) {
  const writes = {}, changed = [];
  keys("content:").forEach((k) => {
    const c = get(k);
    if (!isObj(c) || !Array.isArray(c.quickLinks)) return;
    let n = 0;
    c.quickLinks.forEach((l) => { if (isObj(l) && l.id === "ql10" && l.desc === "식품 도매몰 · 사업자 전용가") { l.desc = "전문 식품 도매몰 · 사업자 전용가"; n++; } });
    if (n) { writes[k] = c; changed.push(k); }
  });
  return { writes, result: changed.length ? { changed } : { skipped: "바꿀 칸 없음" } };
}

/* ---------- 황금농부 → 갓농부 (대표님 요청) ----------
 * 강사 표시 이름이 아직 ‘황금농부’이면 ‘갓농부’로, 그 강사 콘텐츠의 ‘황금농부’ 글자도 ‘갓농부’로 (사진 · 파일 데이터 칸은 건너뜀).
 * 첫 화면 강사 카드 · 수강생 로그인에 보이는 강의 분야가 비어 있으면 ‘귤 단 하나 팔아 월매출 10억’. 강사센터 로그인 이름(name)은 그대로 */
function farmerToGodFarmer(get) {
  const writes = {}, result = {};
  const ins = get("ins:farmer");
  if (isObj(ins)) {
    let n = 0;
    if (ins.displayName === "황금농부") { ins.displayName = "갓농부"; n++; }
    if (isObj(ins.brand)) n += renameWordDeep(ins.brand, /황금농부/g, "갓농부");
    if (n) { writes["ins:farmer"] = ins; result.ins = n; }
  }
  const c = get("content:farmer");
  if (isObj(c)) {
    let n = renameWordDeep(c, /황금농부/g, "갓농부");
    if (isObj(c.brand) && !c.brand.field) { c.brand.field = "귤 단 하나 팔아 월매출 10억"; n++; }
    if (n) { writes["content:farmer"] = c; result.content = n; }
  }
  return { writes, result: Object.keys(result).length ? result : { skipped: "이미 바뀜" } };
}

/* ---------- 두고클래스 체험 계정 vod@gmail.com / vod (서버 회원 + 산 강의 몇 개) ----------
 * 마스터가 VOD · 결제 · 강의실 흐름을 직접 확인하려고 만든 계정이에요. 주문은 0원 · demo 표시라 매출 · 수강생 수에는 안 잡혀요.
 * 문대표 강의는 스토어에서 미노출이라 넣지 않아요. 마스터 › VOD 전시 · 쿠폰 · 설정에서 ‘체험 계정’을 끄면 로그인이 막혀요. */
const DEMO_EMAIL = "vod@gmail.com";
const DEMO_BUYS = [["v5", "챗GPT로 블로그 수익화, 하루 1시간 루틴"], ["v2", "AI로 그림 그리고 굿즈로 파는 법"], ["v3", "귤 하나로 월매출 10억, 농산물 온라인 판매 실전"], ["v4", "스마트스토어 상세페이지, 전환율 2배 만드는 구조"], ["v14", "중국 구매대행, 상품 찾기부터 첫 판매까지"], ["v11", "농산물 상세페이지 문장 템플릿 100"]];
function vodDemoMember(get) {
  if (get("vme:" + DEMO_EMAIL)) return { writes: {}, result: { skipped: "이미 있는 계정" } };
  const V = require("./vod"), at = Date.now(), mid = "vm-demo-srv", writes = {}, nos = [];
  const titles = {}; ((((get("meta") || {}).vod || {}).products) || []).forEach((p) => { if (p && p.id) titles[p.id] = p.title; });
  DEMO_BUYS.forEach((b, i) => {
    const no = "DC261029" + String(900 + i), ebook = b[0] === "v11";
    nos.push(no);
    writes["vo:" + no] = { id: "vo-" + no, no, kind: "course", days: ebook ? null : 365, mid, pid: b[0], title: titles[b[0]] || b[1], list: 0, sale: 0, amount: 0, method: "free", ch: "web", share: null, status: "paid", createdAt: at, at: at - (i + 1) * 36e5, paidAt: at - (i + 1) * 36e5, pg: { st: "free" }, demo: true, buyer: { name: "체험회원", phone: "" } };
  });
  writes["vm:" + mid] = { id: mid, via: "email", email: DEMO_EMAIL, name: "체험회원", phone: "010-0000-0000", pwHash: V.hashPw("vod"), demo: true, marketing: false, consent: { mkt: false, ch: [], night: false, at, log: [{ at, on: false, how: "체험 계정" }] }, src: { s: "direct", at }, kakaoCh: false, tags: ["체험 계정"], notes: [], createdAt: at, points: 5000, pointLog: [{ at, amt: 5000, why: "체험 계정 포인트" }], coupons: [], orderNos: nos, loginN: 0 };
  writes["vme:" + DEMO_EMAIL] = { id: mid };
  return { writes, result: { member: mid, orders: nos.length } };
}

/* ---------- 테스트 코치 김하나: 초이 강의 코치도 맡기 (대표님 요청 · 여러 강의 코치 로그인 확인용) ----------
 * 문대표 강의에 김하나(1004) 코치가 있고, 초이 강의에 같은 이름의 코치가 아직 없을 때만 더해요. 강사센터 › 코치 관리에서 지우면 끝이에요 */
function hanaSecondCourse(get) {
  const m = get("ins:moon"), c = get("ins:choi");
  if (!isObj(m) || !isObj(c)) return { writes: {}, result: { skipped: "강사 없음" } };
  const hana = (m.coaches || []).find((x) => x && String(x.name || "").replace(/\s+/g, "") === "김하나" && x.phone4 === "1004");
  if (!hana) return { writes: {}, result: { skipped: "문대표 강의에 김하나 코치 없음" } };
  if ((c.coaches || []).some((x) => x && String(x.name || "").replace(/\s+/g, "") === "김하나")) return { writes: {}, result: { skipped: "이미 있음" } };
  const add = { id: "coach-hana", name: "김하나", phone4: "1004", status: "active", perms: ["reviews", "questions"], memo: "테스트 코치 · 여러 강의 코치 확인용", createdAt: "2026-10-30" };
  return { writes: { "ins:choi": Object.assign({}, c, { coaches: (Array.isArray(c.coaches) ? c.coaches : []).concat([add]) }) }, result: { added: "ins:choi coach-hana" } };
}

/* ---------- 문대표 종이책 『내 인생의 추월차선은 내가 만든다』 — 두고클래스 전자책 메뉴 (택배 배송) ----------
 * 스토어 상품(meta.vod.products)과 결제 가격표(vcat)에 없을 때만 넣어요. 문대표 강의는 스토어에서 숨겨 두었지만(insOff) 이 책은 보여요(showOff).
 * 배송 설정 기본값(settings.ship)도 비어 있을 때만 채워요. v21 표시를 남겨 화면이 같은 책을 또 넣지 않게 해요 */
function moonBook(get) {
  const { MOON_BOOK, SHIP_DEF } = require("./books");
  const meta = get("meta");
  if (!isObj(meta) || !isObj(meta.vod) || !Array.isArray(meta.vod.products)) return { writes: {}, result: { skipped: "두고클래스 상품 없음" } };
  const writes = {}, v = clone(meta.vod), has = v.products.some((p) => p && p.id === MOON_BOOK.id);
  if (!has) v.products.push(clone(MOON_BOOK));
  v.settings = isObj(v.settings) ? v.settings : {};
  if (!isObj(v.settings.ship)) v.settings.ship = clone(SHIP_DEF);
  v.v21 = 1;
  writes.meta = Object.assign({}, meta, { vod: v });
  const cat = get("vcat"), P_KEYS = ["id", "title", "type", "status", "price", "sale", "saleEnd", "plans", "accessDays", "eventAt", "eventMin", "seats", "next", "ebPrice", "ebDays", "coach", "tea", "dg", "iid", "share", "shipFee", "stock"];
  if (isObj(cat) && Array.isArray(cat.products) && !cat.products.some((p) => p && p.id === MOON_BOOK.id)) {
    const row = {}; P_KEYS.forEach((k) => { if (MOON_BOOK[k] !== undefined) row[k] = MOON_BOOK[k]; }); row.dg = false;
    writes.vcat = Object.assign({}, cat, { products: cat.products.concat([row]) });
  }
  return { writes, result: { book: has ? "이미 있음" : "추가", vcat: writes.vcat ? "추가" : "그대로" } };
}

/* 두고클래스 무통장 입금 계좌 — 통장 사본 기준 (IBK기업은행 · 주식회사 두고홀딩스). 계좌가 비어 있을 때만 넣어요 (마스터가 넣은 계좌는 그대로) */
const STORE_BANK = { bank: "IBK기업은행", account: "940-057282-04-017", holder: "(주)두고홀딩스" };
function storeBank(get) {
  const meta = get("meta");
  if (!isObj(meta) || !isObj(meta.vod)) return { writes: {}, result: { skipped: "두고클래스 데이터 없음" } };
  const s = isObj(meta.vod.settings) ? meta.vod.settings : {};
  if (s.bank && s.account) return { writes: {}, result: { bank: "이미 있음" } };
  const v = clone(meta.vod);
  v.settings = Object.assign({}, s, { bank: STORE_BANK.bank, account: STORE_BANK.account, holder: s.holder || STORE_BANK.holder });
  return { writes: { meta: Object.assign({}, meta, { vod: v }) }, result: { bank: "넣음" } };
}

/* ---------- 실제 운영 시작: ‘기수 신청 · 매출’ 예시 기록 정리 (대표님 요청 2026-10-31) ----------
 * 파트너센터를 처음 열 때 만들어진 예시 이용료 기록(부알남 · 초이 1기 · 2기, demo)처럼 문대표 것이 아닌 이용료 기록은 모두 지워 매출을 0원에서 시작.
 * 문대표 기록은 예시(demo)만 지워요. 지운 기록으로 새로 열린 기수가 수강생 없이 남아 있으면 그 기수도 지워요.
 * 처음부터 있던 기수 · 수강생 · 강사 · 파트너 계정(예시 파트너 · 김나영)은 그대로. 지운 기록으로만 계산된 파트너 지급 기록(예시)도 지워요 */
const SEED_COHORTS = ["c1", "c2", "c3", "c4", "lc1", "fc1", "cc1"];
function launchReset(get, keys) {
  const writes = {}, result = { bills: [], cohorts: [], payouts: [] }, opened = {}, gone = new Set();
  keys("bill:").forEach((k) => {
    const b = get(k), iid = k.split(":")[1];
    if (!isObj(b) || (iid === "moon" && b.demo !== true)) return;
    writes[k] = null; result.bills.push(iid + " " + (b.cohortName || "") + (b.demo ? " (예시)" : ""));
    gone.add(b.id || k.split(":")[2]);
    if (b.cohortId && iid !== "moon" && SEED_COHORTS.indexOf(b.cohortId) < 0) (opened[iid] = opened[iid] || []).push(b.cohortId);
  });
  Object.keys(opened).forEach((iid) => {
    const ck = "cohorts:" + iid, list = get(ck);
    if (!Array.isArray(list)) return;
    const used = new Set(keys("stu:" + iid + ":").map((k) => (get(k) || {}).cohortId));
    const keep = list.filter((co) => !(isObj(co) && opened[iid].indexOf(co.id) >= 0 && !used.has(co.id)));
    if (keep.length === list.length) return;
    writes[ck] = keep;
    list.filter((co) => keep.indexOf(co) < 0).forEach((co) => result.cohorts.push(iid + " " + co.name));
  });
  const meta = get("meta");
  if (isObj(meta) && isObj(meta.affPayouts)) {
    const po = clone(meta.affPayouts);
    Object.keys(po).forEach((k) => {
      const r = isObj(po[k]) ? po[k] : {}, rows = Array.isArray(r.rows) ? r.rows : [];
      const demo = k.indexOf("aff-demo:") === 0 && !rows.length && !r.amount;
      if (demo || (rows.length && rows.every((x) => gone.has(x.bid)))) { delete po[k]; result.payouts.push(k); }
    });
    if (result.payouts.length) writes.meta = Object.assign({}, meta, { affPayouts: po });
  }
  return { writes, result };
}

/* ---------- 문대표 4기: 11월 21일(토)부터 4주 (대표님 요청 2026-10-31) ---------- */
function moon4th(get) {
  const k = "cohorts:moon", list = get(k);
  if (!Array.isArray(list)) return { writes: {}, result: { skipped: "문대표 기수 없음" } };
  const co = list.find((x) => isObj(x) && x.id === "c4") || list.find((x) => isObj(x) && x.name === "4기");
  if (!co) return { writes: {}, result: { skipped: "4기 없음" } };
  const before = { startDate: co.startDate, weeks: co.weeks || "", classDow: co.classDow };
  const next = Object.assign({}, co, { startDate: "2026-11-21", weeks: 4, classDow: 6, recruiting: true });
  return { writes: { [k]: list.map((x) => (x === co ? next : x)) }, result: { cohort: co.name, before, after: { startDate: next.startDate, weeks: 4, classDow: 6 } } };
}

/* ---------- 문대표 강사 소개 페이지: 신청하기 링크 (새 창) · 마지막 안내 ‘5주’ → ‘4주’ (대표님 요청 2026-10-31) ---------- */
const MOON_APPLY = "https://m.site.naver.com/2iZFQ";
function moonApplyLink(get) {
  const k = "content:moon", c = get(k);
  if (!isObj(c)) return { writes: {}, result: { skipped: "문대표 콘텐츠 없음" } };
  const L = isObj(c.landing) ? clone(c.landing) : {}, result = {};
  if (!L.applyUrl) { L.applyUrl = MOON_APPLY; result.applyUrl = "넣음"; } else result.applyUrl = "이미 있음";
  if (isObj(L.cta) && L.cta.title === "5주 뒤, 내 이름의 브랜드 사장님이 되어 있을 거예요") { L.cta = Object.assign({}, L.cta, { title: "4주 뒤, 내 이름의 브랜드 사장님이 되어 있을 거예요" }); result.cta = "4주로"; }
  return { writes: { [k]: Object.assign({}, c, { landing: L }) }, result };
}

/* 위에서부터 차례로 (앞 작업 결과를 뒤 작업이 본다) */
const OPS = [
  { id: "2026-10-08-docs-guide-6", note: "문대표 서류 준비 가이드를 6단계로", run: docsGuideSix },
  { id: "2026-10-08-motivation-videos", note: "문대표 동기부여 채널에 유튜브 영상 6개", run: motivationVideos },
  { id: "2026-10-08-moon-demo-accounts", note: "문대표 체험 계정(3기 이수진 · 1기 체험단 · 2기 체험단)만 남기기", run: moonDemoAccounts },
  { id: "2026-10-09-moon-profile-photo", note: "문대표 강사 프로필 사진 · 강의 분야 (첫 화면 강사 카드)", run: moonProfile },
  { id: "2026-10-09-billing-vat-included", note: "기수 이용료 부가세 방식을 '부가세 포함'으로", run: billingVatIncluded },
  { id: "2026-10-12-logic-farmer-photos", note: "로직메이커 · 황금농부 강사 프로필 사진 (사진이 비어 있을 때만)", run: logicFarmerPhotos },
  { id: "2026-10-13-menu-names-v15", note: "수강생 메뉴 이름 · AI 조교 이름 · 예전 메뉴 이름이 들어간 기본 문구를 새 이름으로 (기본값 그대로일 때만)", run: menuNamesV15 },
  { id: "2026-10-15-logic-to-bualnam", note: "강사 표시 이름 로직메이커 → 부알남 (로그인 이름은 그대로)", run: logicToBualnam },
  { id: "2026-10-16-food-quicklink-desc", note: "빠른 이동 두고푸드 설명 → 전문 식품 도매몰 · 사업자 전용가 (기본 문구일 때만)", run: foodQuickLinkDesc },
  { id: "2026-10-17-farmer-to-godfarmer", note: "강사 표시 이름 황금농부 → 갓농부 + 강의 분야 ‘귤 단 하나 팔아 월매출 10억’ (로그인 이름은 그대로)", run: farmerToGodFarmer },
  { id: "2026-10-29-vod-demo-member", note: "두고클래스 체험 계정 vod@gmail.com / vod + 산 강의 6개 (0원 체험 주문)", run: vodDemoMember },
  { id: "2026-10-30-hana-second-course", note: "테스트 코치 김하나(1004)가 초이 강의 코치도 맡기 (여러 강의 코치 로그인 확인용)", run: hanaSecondCourse },
  { id: "2026-10-30-moon-paper-book", note: "문대표 종이책 『내 인생의 추월차선은 내가 만든다』를 두고클래스 전자책 메뉴에 (택배 배송 · 15,900원)", run: moonBook },
  { id: "2026-10-30-store-bank-account", note: "두고클래스 무통장 입금 계좌 IBK기업은행 (주)두고홀딩스 (비어 있을 때만)", run: storeBank },
  { id: "2026-10-31-launch-reset-bills", note: "실제 운영 시작: 문대표 것을 뺀 기수 신청 · 매출 예시 기록 지우기 (계정은 그대로)", run: launchReset },
  { id: "2026-10-31-moon-4th-cohort", note: "문대표 4기를 11월 21일(토)부터 4주로", run: moon4th },
  { id: "2026-10-31-moon-apply-link", note: "문대표 강사 소개 페이지 신청하기 링크(네이버) · 마지막 안내 4주", run: moonApplyLink }
];

module.exports = { OPS, fullProgress, docsGuideSix, motivationVideos, moonDemoAccounts, moonProfile, billingVatIncluded, menuNamesV15, logicToBualnam, foodQuickLinkDesc, farmerToGodFarmer, vodDemoMember, hanaSecondCourse, moonBook, storeBank, STORE_BANK, launchReset, moon4th, moonApplyLink, MOON_APPLY };
