/* 누가 어떤 문서를 볼 수 있고 고칠 수 있는지.
 *
 * 문서 키
 *  meta                 공지(마스터→강사) · 설정 플래그 등 나머지
 *  ins:<강사>           강사 계정 (이름·뒷자리·코치·메뉴 구성)
 *  content:<강사>       강의 콘텐츠 전체
 *  cohorts:<강사>       기수 목록
 *  stu:<강사>:<학생>    수강생 계정
 *  prog:<강사>:<학생>   수강생 진행 기록 (제출·검수·문의)
 *  inq:<id>             강사 입점 문의 (마스터만)
 *  bill:<강사>:<id>     기수 이용료 신청 · 정산 (마스터 + 그 강사만. 강사는 '다음 기수 열어 주세요' 신청만,
 *                       입금 · 세금계산서 · 기수 열기는 마스터만)
 */
"use strict";

const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
const mask = (n) => { n = String(n || ""); return n ? n.slice(0, 1) + "OO" : "익명"; };
const CONTENT_PERMS = ["brand", "guide", "curriculum", "missions", "schedule", "notices", "faq", "docs", "library", "motivation", "channels", "partners", "pages", "free", "landing"];

function parseKey(k) {
  const p = String(k).split(":");
  if (k === "meta") return { type: "meta" };
  if (p[0] === "ins" || p[0] === "content" || p[0] === "cohorts") return p.length === 2 && p[1] ? { type: p[0], iid: p[1] } : null;
  if ((p[0] === "stu" || p[0] === "prog") && p.length === 3 && p[1] && p[2]) return { type: p[0], iid: p[1], sid: p[2] };
  if (p[0] === "bill") return p.length === 3 && p[1] && p[2] ? { type: "bill", iid: p[1], bid: p[2] } : null;
  // 강사 입점 문의 (방문자가 남기고 마스터만 본다)
  if (p[0] === "inq") return p.length === 2 && p[1] ? { type: "inq", id: p[1] } : null;
  return null;
}

const isMaster = (ids) => !!(ids.admin && ids.admin.role === "master");
const adminOf = (ids, iid) => !!(ids.admin && (ids.admin.role === "master" || ids.admin.iid === iid));
const instructorOf = (ids, iid) => !!(ids.admin && (ids.admin.role === "master" || (ids.admin.role === "instructor" && ids.admin.iid === iid)));
const coachOf = (ids, iid) => !!(ids.admin && ids.admin.role === "coach" && ids.admin.iid === iid);
const coachCan = (ids, list) => (ids.admin.perms || []).some((x) => list.indexOf(x) !== -1);
const ownerOf = (ids, iid) => !!(ids.admin && ids.admin.role === "instructor" && ids.admin.iid === iid);
const studentOf = (ids, iid) => !!(ids.student && ids.student.iid === iid);
const memberOf = (ids, iid) => adminOf(ids, iid) || studentOf(ids, iid);

/* ---------------- 공개용으로 줄이기 ---------------- */
const LESSON_KEEP = ["id", "title", "minutes", "desc"];
const MISSION_KEEP = ["id", "title", "kind", "required", "type", "desc"];
const pick = (o, keys) => { const r = {}; keys.forEach((k) => { if (o && o[k] !== undefined) r[k] = o[k]; }); return r; };
function weeksSkeleton(weeks) {
  return (weeks || []).map((w) => {
    const o = {};
    Object.keys(w).forEach((k) => { if (!/^(lessons|missions|templates|attachments|files|links?|liveUrl|url|video|youtubeId)$/i.test(k)) o[k] = w[k]; });
    o.lessons = (w.lessons || []).map((l) => pick(l, LESSON_KEEP));
    o.missions = (w.missions || []).map((m) => pick(m, MISSION_KEEP));
    return o;
  });
}
function publicContent(c) {
  const o = pick(c, ["brand", "landing", "freeClass", "freeQuestions", "faqs"]);
  o.weeks = weeksSkeleton(c.weeks);
  o.curricula = (c.curricula || []).map((cu) => Object.assign(pick(cu, ["id", "name"]), { weeks: weeksSkeleton(cu.weeks) }));
  return o;
}
function publicIns(v) { const o = clone(v); delete o.phone4; delete o.coaches; return o; }
function coachIns(v) { const o = clone(v); delete o.phone4; o.coaches = (o.coaches || []).map((c) => { const x = Object.assign({}, c); delete x.phone4; return x; }); return o; }
function publicCohorts(list) { return (list || []).map((c) => { const o = {}; Object.keys(c).forEach((k) => { if (!/url|link|zoom/i.test(k)) o[k] = c[k]; }); return o; }); }
function maskedStudent(s) { return { id: s.id, instructorId: s.instructorId, cohortId: s.cohortId, name: mask(s.name), status: s.status, appliedAt: s.appliedAt }; }
function questionsOnly(p) {
  return { questions: ((p && p.questions) || []).map((q) => ({ id: q.id, at: q.at, category: q.category, title: "", body: "", images: [], answer: q.answer ? "•" : "" })) };
}

/** 이 신원에게 보여 줄 모양 (못 보면 undefined) */
function view(k, v, ids) {
  const K = parseKey(k);
  if (!K) return undefined;
  if (isMaster(ids)) return v;
  if (K.type === "inq") return undefined;
  // 이용료 신청은 그 강사 본인만 (마스터 메모는 빼고)
  if (K.type === "bill") { if (!ownerOf(ids, K.iid)) return undefined; if (v == null) return null; const o = clone(v); delete o.masterMemo; return o; }
  if (v == null) return memberOf(ids, K.iid) || K.type === "ins" || K.type === "content" || K.type === "cohorts" || K.type === "meta" ? null : undefined;
  switch (K.type) {
    case "meta": {
      if (ids.admin) return v;
      const o = clone(v); delete o.announcements; delete o.billing; return o;
    }
    case "ins":
      if (instructorOf(ids, K.iid)) return v;
      if (coachOf(ids, K.iid)) return coachIns(v);
      return publicIns(v);
    case "content": return memberOf(ids, K.iid) ? v : publicContent(v);
    case "cohorts": return memberOf(ids, K.iid) ? v : publicCohorts(v);
    case "stu":
      if (adminOf(ids, K.iid) || (ids.student && ids.student.sid === K.sid)) return v;
      if (studentOf(ids, K.iid)) return maskedStudent(v);
      return undefined;
    case "prog":
      if (adminOf(ids, K.iid) || (ids.student && ids.student.sid === K.sid)) return v;
      if (studentOf(ids, K.iid)) return questionsOnly(v);
      return undefined;
  }
  return undefined;
}
/** 목록 조회 범위 (SQL 접두사) */
function prefixesFor(ids) {
  if (isMaster(ids)) return null;
  const p = ["meta", "ins:%", "content:%", "cohorts:%"];
  const iids = new Set();
  if (ids.admin && ids.admin.iid) iids.add(ids.admin.iid);
  if (ids.student) iids.add(ids.student.iid);
  iids.forEach((iid) => { p.push("stu:" + iid + ":%", "prog:" + iid + ":%"); });
  if (ids.admin && ids.admin.role === "instructor" && ids.admin.iid) p.push("bill:" + ids.admin.iid + ":%");
  return p;
}

/* ---------------- 쓰기 권한 ---------------- */
const ANSWER_KEYS = ["answer", "answeredAt", "answeredBy", "answeredById"];
/** 쓸 수 있으면 { fix(old, next) → 저장할 값 } 를, 아니면 null */
function writer(k, ids, creating) {
  const K = parseKey(k);
  if (!K) return null;
  const same = (o, n) => n;
  if (isMaster(ids)) return { fix: same };
  switch (K.type) {
    case "meta": return null;
    case "inq": return null;
    case "ins":
      if (creating) return null;
      if (instructorOf(ids, K.iid)) return { fix: (o, n) => (n == null ? clone(o) : Object.assign(n, { id: K.iid, status: o.status, createdAt: o.createdAt })) };
      if (coachOf(ids, K.iid) && coachCan(ids, ["menus"])) return { fix: (o, n) => (n == null ? clone(o) : Object.assign(clone(o), { menu: n.menu })) };
      return null;
    case "content":
      if (creating) return null;
      if (instructorOf(ids, K.iid) || (coachOf(ids, K.iid) && coachCan(ids, CONTENT_PERMS))) return { fix: (o, n) => (n == null ? clone(o) : n) };
      return null;
    case "cohorts":
      // 기존 기수 고치기는 자유, 새 기수 추가 · 기수 삭제는 마스터만 (다음 기수는 이용료 입금 뒤 마스터가 열어 준다)
      if (instructorOf(ids, K.iid) || (coachOf(ids, K.iid) && coachCan(ids, ["cohorts"]))) return { fix: (o, n) => keepCohortSet(o, n, K.iid) };
      return null;
    case "bill":
      if (ownerOf(ids, K.iid)) return { fix: (o, n) => fixBill(o, n, K) };
      return null;
    case "stu":
      if (instructorOf(ids, K.iid) || (coachOf(ids, K.iid) && coachCan(ids, ["students"]))) return { fix: (o, n) => (n == null ? null : Object.assign(n, { id: K.sid, instructorId: K.iid })) };
      return null;
    case "prog":
      if (instructorOf(ids, K.iid) || (coachOf(ids, K.iid) && coachCan(ids, ["reviews", "questions", "students"]))) return { fix: same };
      if (ids.student && ids.student.sid === K.sid && ids.student.iid === K.iid) return { fix: (o, n) => (n == null ? clone(o) : keepStaffFields(o, n)) };
      return null;
  }
  return null;
}
/** 강사 · 코치가 보낸 기수 목록: 이미 있는 기수만 고치고, 새 기수는 빼고, 지운 기수는 되살린다 */
function keepCohortSet(o, n, iid) {
  const old = Array.isArray(o) ? o.filter(Boolean) : [];
  if (!Array.isArray(n)) return clone(old);
  const have = new Set(old.map((c) => c.id));
  const out = n.filter((c) => c && have.has(c.id)).map((c) => Object.assign(c, { instructorId: iid }));
  const kept = new Set(out.map((c) => c.id));
  old.forEach((c) => { if (!kept.has(c.id)) out.push(clone(c)); });
  return out;
}
/* 강사가 쓸 수 있는 이용료 신청 칸 (입금 · 계산서 · 기수 열기 · 금액 확정은 마스터만) */
const BILL_EDIT = ["cohortName", "startDate", "fee", "contactName", "phone", "email", "bizName", "bizNo", "memo"];
const billOpen = (b) => !!b && !b.paidAt && !b.invoiceAt && !b.cohortId && !b.canceledAt;
function billValue(k, v) {
  if (k === "fee") { const n = Math.round(Number(String(v == null ? "" : v).replace(/[^0-9.]/g, ""))); return isFinite(n) ? Math.max(0, Math.min(1e9, n)) : 0; }
  if (k === "startDate") return /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : "";
  return String(v == null ? "" : v).slice(0, k === "memo" ? 1000 : 200);
}
function fixBill(o, n, K) {
  // 처리가 시작된(입금 · 계산서 · 기수 오픈 · 취소) 신청은 강사가 고치거나 지울 수 없다
  if (o && !billOpen(o)) return clone(o);
  if (n == null) return null;
  const b = o ? clone(o) : { id: K.bid, instructorId: K.iid, kind: "next", requestedAt: Date.now(), by: "instructor" };
  BILL_EDIT.forEach((k) => { if (n[k] !== undefined) b[k] = billValue(k, n[k]); else delete b[k]; });
  return b;
}
/** 수강생이 자기 기록을 고쳐도 강사 검수 결과와 답변은 바꾸지 못하게 서버 값으로 되돌린다 */
function keepStaffFields(o, n) {
  o = o || {};
  const subs = (n && n.submissions) || {};
  Object.keys(subs).forEach((mid) => {
    (subs[mid] || []).forEach((s, i) => {
      const os = ((o.submissions || {})[mid] || [])[i];
      if (os && os.at === s.at && os.review) s.review = os.review; else delete s.review;
    });
  });
  ((n && n.questions) || []).forEach((q) => {
    const oq = (o.questions || []).find((x) => x.id === q.id);
    ANSWER_KEYS.forEach((key) => { if (oq && oq[key] !== undefined) q[key] = oq[key]; else delete q[key]; });
  });
  return n;
}

/* 파일을 누가 볼 수 있는지: 공개 페이지 사진은 pub, 나머지는 문서 범위 */
function fileScope(k, path) {
  const K = parseKey(k);
  if (K && K.type === "content" && /^(landing|freeClass|brand)$/.test(String(path[0]))) return "pub";
  return k;
}
function canReadFile(scopes, ids) {
  if (isMaster(ids)) return true;
  return scopes.some((s) => {
    if (s === "pub") return true;
    const K = parseKey(s);
    if (!K) return false;
    if (K.type === "content" || K.type === "cohorts" || K.type === "ins") return memberOf(ids, K.iid);
    if (K.type === "stu" || K.type === "prog") return adminOf(ids, K.iid) || (ids.student && ids.student.sid === K.sid);
    return !!ids.admin;
  });
}

module.exports = { parseKey, view, prefixesFor, writer, fileScope, canReadFile, isMaster, mask, clone };
