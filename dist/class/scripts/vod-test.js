/* 두고클래스 서버 테스트 — 진짜 포트원 · 카카오 대신 가짜 응답(fetch 바꿔치기)으로
 * 결제 · 취소 · 환불 · 웹훅 · 카카오 로그인 · 문서 공개 범위 · 쓰기 권한을 확인해요.
 *   node scripts/vod-test.js   (class/ 에서) — 저장소는 임시 SQLite 파일 */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");
const ROOT = path.join(__dirname, ".."), TMP = fs.mkdtempSync(path.join(os.tmpdir(), "vodtest-"));
fs.cpSync(path.join(ROOT, "api"), path.join(TMP, "class/api"), { recursive: true });
fs.cpSync(path.join(ROOT, "data.js"), path.join(TMP, "class/data.js")); fs.cpSync(path.join(ROOT, "db.js"), path.join(TMP, "class/db.js"));
const WH = crypto.randomBytes(24).toString("base64");
Object.assign(process.env, { CLASS_SQLITE: path.join(TMP, "t.db"), SESSION_SECRET: "test-session", VOD_SERVER_AUTH: "1", PORTONE_STORE_ID: "store-test", PORTONE_API_SECRET: "ps-test", PORTONE_CHANNEL_CARD: "channel-key-card", PORTONE_CHANNEL_KAKAOPAY: "channel-key-kp", PORTONE_WEBHOOK_SECRET: "whsec_" + WH, KAKAO_REST_KEY: "rest-test", KAKAO_CLIENT_SECRET: "cs-test", KAKAO_REDIRECT_URI: "https://www.doogoclass.com/api/vod-kakao", KAKAO_ADMIN_KEY: "admin-test" });
const API = (n) => require(path.join(TMP, "class/api", n + ".js"));
const auth = require(path.join(TMP, "class/api/_lib/auth.js"));

// ---------- 가짜 외부 서버 ----------
const PG = {}, calls = [];
let kakaoUser = null;
global.fetch = async (url, opt) => {
  opt = opt || {}; const u = new URL(url); calls.push(opt.method === "POST" ? "POST " + u.host + u.pathname : "GET " + u.host + u.pathname);
  const J = (status, j) => ({ ok: status < 300, status, json: async () => j, text: async () => JSON.stringify(j) });
  if (u.host === "api.portone.io") {
    if (!/^PortOne ps-test$/.test((opt.headers || {}).Authorization || "")) return J(401, { type: "UNAUTHORIZED" });
    const m = u.pathname.match(/^\/payments\/([^/]+)(\/cancel)?$/); const id = decodeURIComponent(m[1]);
    if (m[2]) { const b = JSON.parse(opt.body); const p = PG[id]; const amt = b.amount != null ? b.amount : p.amount.total - (p.amount.cancelled || 0); p.amount.cancelled = (p.amount.cancelled || 0) + amt; p.status = p.amount.cancelled >= p.amount.total ? "CANCELLED" : "PARTIAL_CANCELLED"; p.lastCancel = b; return J(200, { cancellation: { id: "cx_" + calls.length, status: "SUCCEEDED", totalAmount: amt } }); }
    return PG[id] ? J(200, PG[id]) : J(404, { type: "PAYMENT_NOT_FOUND" });
  }
  if (u.host === "kauth.kakao.com") return J(200, { access_token: "at-" + opt.body.match(/code=([^&]+)/)[1] });
  if (u.host === "kapi.kakao.com") {
    if (u.pathname === "/v2/user/me") return J(200, kakaoUser);
    if (u.pathname === "/v2/user/service_terms") return J(200, { service_terms: [{ tag: "marketing", agreed: true }] });
    if (u.pathname === "/v2/api/talk/channels") return J(200, { channels: [{ relation: "ADDED" }] });
    if (u.pathname === "/v1/user/unlink") return J(200, { id: 1 });
  }
  if (u.host === "challenges.cloudflare.com") return J(200, { success: /ts=ok|response=ok/.test(opt.body) });
  return J(404, {});
};
// ---------- 가짜 요청 · 응답 ----------
const jar = {};
function call(name, { method = "POST", body, query = {}, headers = {}, raw } = {}) {
  return new Promise((done) => {
    const ck = Object.keys(jar).map((k) => k + "=" + encodeURIComponent(jar[k])).join("; ");
    const req = { method, url: "/api/" + name, query, headers: Object.assign({ host: "www.doogoclass.com", cookie: ck, "x-forwarded-for": "1.2.3.4" }, headers), body: raw != null ? undefined : body, rawBody: raw, socket: {} };
    const hd = {}; const res = { statusCode: 200, headersSent: false, setHeader(k, v) { hd[k.toLowerCase()] = v; }, getHeader(k) { return hd[k.toLowerCase()]; },
      end(s) { [].concat(hd["set-cookie"] || []).forEach((c) => { const [kv] = c.split(";"); const i = kv.indexOf("="); const k = kv.slice(0, i), v = decodeURIComponent(kv.slice(i + 1)); if (v) jar[k] = v; else delete jar[k]; }); let j = null; try { j = JSON.parse(s); } catch (e) {} done({ status: this.statusCode, json: j, location: hd.location }); } };
    API(name)(req, res);
  });
}
let pass = 0, failN = 0;
const ok = (cond, label, extra) => { if (cond) { pass++; console.log("  ✓ " + label); } else { failN++; console.log("  ✗ " + label, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); } };
const sign = (body) => { const id = "msg_" + crypto.randomBytes(4).toString("hex"), ts = String(Math.floor(Date.now() / 1000)); const sig = crypto.createHmac("sha256", Buffer.from(WH, "base64")).update(id + "." + ts + "." + body).digest("base64"); return { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": "v1," + sig }; };
const paidLike = (pid, total) => { PG[pid] = { id: pid, status: "PAID", storeId: "store-test", transactionId: "tx_" + pid, currency: "KRW", amount: { total, paid: total, cancelled: 0 }, method: { type: "PaymentMethodCard" }, receiptUrl: "https://r/" + pid }; };

(async () => {
  await require(path.join(TMP, "class/api/_lib/init.js")).ensureSeeded(); // 실제 서버처럼 두잉고 기본 데이터(meta · 강사)부터
  console.log("1) 설정 · 카탈로그");
  let r = await call("vod-config", { method: "GET" });
  ok(r.json.cfg.auth && r.json.cfg.kakao && r.json.cfg.portone && r.json.cfg.portone.storeId === "store-test" && !JSON.stringify(r.json).includes("ps-test") && !JSON.stringify(r.json).includes("cs-test"), "config: 연결 상태만 · 비밀 값 없음", r.json);
  r = await call("vod-pay", { body: { action: "catalog", catalog: { products: [] } } });
  ok(r.status === 403, "카탈로그: 마스터만", r.json);
  jar.dc_a = auth.sign({ r: "master" });
  const ev = new Date(Date.now() + 10 * 864e5 + 9 * 3600e3).toISOString().slice(0, 16);
  r = await call("vod-pay", { body: { action: "catalog", catalog: { products: [
    { id: "v5", title: "챗GPT로 블로그 수익화", type: "vod", status: "on", price: 89000, sale: 59000, saleEnd: "", dg: true, iid: "choi" },
    { id: "v10", title: "전자책", type: "ebook", status: "on", price: 39000, sale: 29000 },
    { id: "v12", title: "AI 굿즈 LIVE", type: "live", status: "on", price: 59000, sale: 49000, eventAt: ev, seats: 1 },
    { id: "v9", title: "오픈 예정", type: "vod", status: "soon", price: 199000 }],
    coupons: [{ id: "cp-welcome", code: "WELCOME", name: "신규 5천", kind: "won", value: 5000, days: 30, auto: "signup", on: true }, { id: "cp-eb", code: "EBOOK20", name: "전자책 20%", kind: "pct", value: 20, days: 14, types: ["ebook"], on: true }, { id: "cp-dl", name: "내려받기 1만", kind: "won", value: 10000, min: 50000, dl: true, on: true }, { id: "cp-off", code: "OFF", name: "끈 쿠폰", kind: "won", value: 1000, on: false }],
    settings: { coach: { n: 5, days: 180, price: 150000 }, refund: { instant: true, days: 7, maxUsed: 0 } }, biz: {} } } });
  ok(r.json.ok && r.json.n === 4, "카탈로그 저장 (마스터)", r.json);
  delete jar.dc_a;

  console.log("2) 이메일 가입 · 로그인");
  r = await call("vod-auth", { body: { action: "signup", email: "a@example.com", pw: "short", name: "가OO", phone: "010-0000-1111", agree: true } });
  ok(r.status === 400 && /8자/.test(r.json.message), "약한 비밀번호 거절", r.json);
  r = await call("vod-auth", { body: { action: "signup", email: "a@example.com", pw: "test1234a", pw2: "test1234a", name: "가OO", phone: "010-0000-1111", agree: true, mkt: true, src: { s: "youtube", c: "t" } } });
  ok(r.json.ok && r.json.member.coupons.length === 1 && !r.json.member.pwHash && jar.dc_v, "가입 → 쿠폰 1장 · 비밀번호는 안 보냄 · 로그인 쿠키", r.json);
  const mc = r.json.member.coupons[0].id;
  r = await call("vod-auth", { body: { action: "signup", email: "a@example.com", pw: "test1234a", name: "x", phone: "010-0000-1111", agree: true } });
  ok(r.status === 409, "같은 이메일 두 번 가입 막기");
  delete jar.dc_v;
  for (let i = 0; i < 8; i++) await call("vod-auth", { body: { action: "login", email: "a@example.com", pw: "wrong-pw1" } });
  r = await call("vod-auth", { body: { action: "login", email: "a@example.com", pw: "test1234a" } });
  ok(r.status === 429, "8번 틀리면 잠시 막기", r.json);
  const store = require(path.join(TMP, "class/api/_lib/store.js")); await store.rlClear(["vem:a@example.com"]);
  r = await call("vod-auth", { body: { action: "login", email: "a@example.com", pw: "test1234a" } });
  ok(r.json.ok && jar.dc_v, "로그인", r.json);

  console.log("2-1) 쿠폰 받기 (서버에 저장)");
  r = await call("vod-pay", { body: { action: "claim", code: "ebook20" } });
  ok(r.json.ok && r.json.member.coupons.length === 2 && !("notes" in r.json.member) && !("pwHash" in r.json.member), "쿠폰 코드 등록 (소문자도) · 운영 메모 · 비밀번호는 안 보냄", r.json);
  r = await call("vod-pay", { body: { action: "claim", code: "EBOOK20" } });
  ok(r.status === 409 && /이미/.test(r.json.message), "같은 쿠폰 두 번 받기 막기");
  r = await call("vod-pay", { body: { action: "claim", code: "OFF" } });
  ok(r.status === 404, "꺼진 쿠폰 코드 거절");
  r = await call("vod-pay", { body: { action: "claim", cid: "cp-eb" } });
  ok(r.status === 404, "코드 쿠폰은 ‘쿠폰 받기’로 못 받음 (내려받기 쿠폰만)");
  r = await call("vod-pay", { body: { action: "claim", cid: "cp-dl" } });
  ok(r.json.ok && r.json.member.coupons.length === 3, "상세 페이지 ‘쿠폰 받기’", r.json);
  const ebc = r.json.member.coupons.find((x) => x.cid === "cp-eb").id;

  console.log("3) 결제 준비 · 완료 (서버가 금액 계산)");
  r = await call("vod-pay", { body: { action: "prepare", pid: "v5", kind: "course", plan: 365, coach: true, mcid: mc, points: 0, method: "card", expect: 1000 } });
  ok(r.status === 409 && /가격/.test(r.json.message), "화면 금액과 다르면 거절 (위변조 · 가격 변경)", r.json);
  r = await call("vod-pay", { body: { action: "prepare", pid: "v5", kind: "course", plan: 365, coach: true, mcid: mc, points: 0, method: "card", expect: 210000 } });
  ok(r.json.ok && r.json.amount === 210000 && r.json.paymentId, "365일 65,000 + 코칭권 150,000 − 쿠폰 5,000 = 210,000원", r.json);
  const p1 = r.json.paymentId, no1 = r.json.no;
  r = await call("vod-pay", { body: { action: "complete", paymentId: p1 } });
  ok(!r.json.ok, "포트원에 결제가 없으면 완료 안 됨", r.json);
  paidLike(p1, 200000);
  r = await call("vod-pay", { body: { action: "complete", paymentId: p1 } });
  ok(!r.json.ok && /금액/.test(r.json.message), "결제 금액이 다르면 완료 안 됨", r.json);
  paidLike(p1, 210000);
  r = await call("vod-pay", { body: { action: "complete", paymentId: p1 } });
  ok(r.json.ok && r.json.orders.length === 2 && r.json.orders.every((o) => o.status === "paid"), "완료: 수강권 + 코칭권 주문 2건 paid", r.json);
  r = await call("vod-pay", { body: { action: "complete", paymentId: p1 } });
  ok(r.json.ok, "같은 결제를 두 번 확인해도 그대로 (중복 처리 없음)");
  r = await call("vod-auth", { body: { action: "me" } });
  ok(r.json.member.coupons[0].usedAt, "쿠폰은 결제 확인 뒤 사용 처리", r.json.member.coupons);

  console.log("4) 바로 취소 (7일 · 미수강) · 수강했으면 거절");
  r = await call("vod-pay", { body: { action: "track", pid: "v5", lid: "v5-l1-1", ev: "seen" } });
  ok(r.json.ok, "강의 열기 기록");
  r = await call("vod-pay", { body: { action: "cancel", no: no1 } });
  ok(r.status === 409 && /1개/.test(r.json.message), "강의를 1개 열었으면 바로 취소 안 됨", r.json);
  r = await call("vod-pay", { body: { action: "prepare", pid: "v10", kind: "course", method: "card", mcid: ebc, expect: 23200 } });
  ok(r.json.ok && r.json.amount === 23200, "전자책 29,000원 − 전자책 20% 쿠폰 = 23,200원", r.json);
  const p2 = r.json.paymentId, no2 = r.json.no; paidLike(p2, 23200);
  r = await call("vod-pay", { body: { action: "complete", paymentId: p2 } });
  r = await call("vod-pay", { body: { action: "cancel", no: no2 } });
  ok(r.json.ok && r.json.amount === 23200 && PG[p2].status === "CANCELLED", "전자책 내려받기 전 → 포트원 결제 전액 취소", r.json);
  r = await call("vod-auth", { body: { action: "me" } });
  ok(!r.json.member.coupons.find((x) => x.cid === "cp-eb").usedAt, "바로 취소하면 쓴 쿠폰을 돌려받음", r.json.member.coupons);
  r = await call("vod-pay", { body: { action: "orders" } });
  ok(r.json.orders.find((o) => o.no === no2).status === "refunded" && r.json.orders.find((o) => o.no === no2).refundKind === "instant", "주문 refunded · 회원 바로 취소로 기록");

  console.log("5) 마스터 부분 환불 · 웹훅");
  jar.dc_a = auth.sign({ r: "master" });
  r = await call("vod-pay", { body: { action: "refund", no: no1, amount: 30000, reason: "수강 불만족" } });
  ok(r.json.ok && PG[p1].lastCancel.amount === 30000 && r.json.order.refundKind === "partial", "부분 환불 30,000원 → 포트원에 그 금액만 취소", r.json);
  delete jar.dc_a;
  r = await call("vod-pay", { body: { action: "prepare", pid: "v12", kind: "course", method: "card", expect: 49000 } });
  const p3 = r.json.paymentId; paidLike(p3, 49000);
  const wb = JSON.stringify({ type: "Transaction.Paid", data: { paymentId: p3, storeId: "store-test" } });
  r = await call("vod-pay", { raw: wb, headers: Object.assign(sign(wb), { "webhook-signature": "v1,AAAA" }) });
  ok(r.status === 401, "서명이 틀린 웹훅은 거절");
  r = await call("vod-pay", { raw: wb, headers: sign(wb) });
  ok(r.status === 200, "서명이 맞는 웹훅 받기");
  r = await call("vod-pay", { body: { action: "orders" } });
  ok(r.json.orders.find((o) => o.paymentId === p3).status === "paid", "웹훅만 와도 결제 완료 (휴대폰에서 창을 닫은 경우)");
  r = await call("vod-pay", { body: { action: "prepare", pid: "v12", kind: "course", method: "card", expect: 49000 } });
  ok(r.status === 409 && /자리/.test(r.json.message), "정원이 차면 결제 준비 거절", r.json);
  r = await call("vod-pay", { body: { action: "prepare", pid: "v9", kind: "course", method: "card" } });
  ok(r.status === 409, "오픈 예정 · 숨김 클래스는 결제 안 됨");

  console.log("6) 카카오 로그인 · 가입 · 연결 끊기");
  delete jar.dc_v;
  r = await call("vod-auth", { method: "GET", query: { action: "kakao", next: "#/vod/checkout/v5" } });
  const st = new URL(r.location).searchParams.get("state");
  ok(r.status === 302 && /kauth\.kakao\.com\/oauth\/authorize/.test(r.location) && /redirect_uri=https%3A%2F%2Fwww\.doogoclass\.com%2Fapi%2Fvod-kakao/.test(r.location) && st && jar.dc_ks, "카카오 동의 화면으로 (state 쿠키)", r.location);
  r = await call("vod-kakao", { method: "GET", query: { code: "c1", state: "wrong" } });
  ok(r.status === 302 && /vodlogin=fail/.test(r.location), "state 가 다르면 거절 (CSRF 막기)");
  r = await call("vod-auth", { method: "GET", query: { action: "kakao", next: "#/vod/checkout/v5" } });
  const st2 = new URL(r.location).searchParams.get("state");
  kakaoUser = { id: 4123456789, kakao_account: { email: "kk@example.com", is_email_valid: true, is_email_verified: true, name: "카OO", phone_number: "+82 10-1234-5678", birthday: "1103", gender: "female", age_range: "30~39", profile: { nickname: "닉" } } };
  r = await call("vod-kakao", { method: "GET", query: { code: "c2", state: st2 } });
  ok(r.status === 302 && r.location === "/?vodlogin=ok#/vod/checkout/v5" && jar.dc_v, "카카오 가입 → 돌아가기 · 로그인", r.location);
  r = await call("vod-auth", { body: { action: "me" } });
  ok(r.json.member.via === "kakao" && r.json.member.phone === "010-1234-5678" && r.json.member.marketing === true && r.json.member.kakaoCh === true && r.json.member.birth === "11-03", "회원 DB: 카카오 · 휴대폰 · 광고 동의(약관) · 채널 친구 · 생일", r.json.member);
  r = await call("vod-auth", { method: "GET", query: { action: "kakao" } });
  r = await call("vod-kakao", { method: "GET", query: { code: "c3", state: new URL(r.location).searchParams.get("state") } });
  ok(/vodlogin=ok/.test(r.location), "같은 카카오로 다시 → 로그인");
  delete jar.dc_v;
  r = await call("vod-auth", { method: "GET", query: { action: "kakao" } });
  kakaoUser = { id: 999, kakao_account: { email: "a@example.com", is_email_valid: true, is_email_verified: true, name: "가OO" } };
  r = await call("vod-kakao", { method: "GET", query: { code: "c4", state: new URL(r.location).searchParams.get("state") } });
  ok(/vodlogin=dup/.test(r.location), "이메일 가입 회원과 같은 이메일 → 자동으로 합치지 않고 안내", r.location);
  r = await call("vod-kakao", { method: "POST", query: { user_id: "4123456789", referrer_type: "UNLINK_FROM_APPS" }, headers: { authorization: "KakaoAK wrong" } });
  ok(r.status === 401, "연결 끊기 알림: Admin 키가 틀리면 거절");
  r = await call("vod-kakao", { method: "POST", query: { user_id: "4123456789", referrer_type: "UNLINK_FROM_APPS" }, headers: { authorization: "KakaoAK admin-test" } });
  ok(r.status === 200, "연결 끊기 알림 처리");

  console.log("7) Cloudflare · Turnstile");
  process.env.CF_ORIGIN_SECRET = "cf-secret";
  r = await call("vod-auth", { body: { action: "me" } });
  ok(r.status === 403, "Cloudflare 를 안 거친 요청 막기 (…vercel.app 직접 접속)");
  r = await call("vod-auth", { body: { action: "me" }, headers: { "x-origin-auth": "cf-secret", "cf-connecting-ip": "9.9.9.9" } });
  ok(r.status === 200, "Cloudflare 를 거친 요청 받기");
  const edge = require(path.join(TMP, "class/api/_lib/edge.js"));
  ok(edge.clientIp({ headers: { "x-origin-auth": "cf-secret", "cf-connecting-ip": "9.9.9.9", "x-forwarded-for": "172.64.0.1" } }) === "9.9.9.9", "진짜 방문자 IP = CF-Connecting-IP");
  ok(edge.clientIp({ headers: { "cf-connecting-ip": "6.6.6.6", "x-forwarded-for": "5.5.5.5" } }) === "5.5.5.5", "헤더를 속여도(비밀 값 없이) 안 믿음");
  delete process.env.CF_ORIGIN_SECRET;
  process.env.TURNSTILE_SECRET = "ts-secret";
  r = await call("vod-auth", { body: { action: "signup", email: "b@example.com", pw: "test1234a", name: "나OO", phone: "010-0000-2222", agree: true } });
  ok(r.status === 400 && /사람/.test(r.json.message), "Turnstile 토큰 없으면 가입 거절");
  r = await call("vod-auth", { body: { action: "signup", email: "b@example.com", pw: "test1234a", name: "나OO", phone: "010-0000-2222", agree: true, ts: "ok" } });
  ok(r.json.ok, "Turnstile 통과하면 가입", r.json);
  delete process.env.TURNSTILE_SECRET;

  console.log("8) 문서 공개 범위 (bootstrap)");
  const boot = async () => (await call("bootstrap", { method: "GET" })).json;
  const docOf = (j, k) => { const d = (j.docs || []).find((x) => x[0] === k); return d ? d[1] : undefined; };
  const verOf = (j, k) => { const d = (j.docs || []).find((x) => x[0] === k); return d ? d[2] : 0; };
  const sync = async (changes) => (await call("sync", { body: { changes } })).json;
  const saveJar = () => Object.assign({}, jar), useJar = (j) => { Object.keys(jar).forEach((k) => delete jar[k]); Object.assign(jar, j); };
  const jarB = saveJar();
  useJar({ dc_a: auth.sign({ r: "master" }) });
  let j = await boot();
  const meta = docOf(j, "meta");
  meta.vod = { ver: 4, products: [
    { id: "v5", title: "챗GPT로 블로그 수익화", type: "vod", status: "on", price: 89000, sale: 59000, iid: "choi", dg: true, kakao: "https://open.kakao.com/o/secret", curriculum: [{ title: "1장", lessons: [{ id: "v5-l1-1", title: "미리보기", video: "PREVIEW-VID", preview: true }, { id: "v5-l1-2", title: "본강의", video: "SECRET-VID", files: [{ name: "자료.pdf", url: "/assets/files/v5-topic.pdf" }] }] }] },
    { id: "v6", title: "다른 클래스", type: "vod", status: "on", price: 49000, iid: "moon", curriculum: [] }],
    settings: { reviewPoint: 500, bank: "국민은행", account: "123-45", holder: "(주)두고홀딩스" }, coupons: [], members: [{ id: "leak", email: "leak@x.com" }], crm: { secret: 1 } };
  r = await sync([{ k: "meta", base: verOf(j, "meta"), put: meta }]);
  ok(r.results && !r.results[0].error, "마스터가 meta(공개 정보) 저장", r);
  await call("vod-pay", { body: { action: "catalog", catalog: { products: meta.vod.products.map((p) => Object.assign({}, p, { dg: true })), coupons: [], settings: { refund: { instant: true, days: 7, maxUsed: 0 } } } } });
  useJar({});
  j = await boot();
  let pv = docOf(j, "meta").vod, l2 = pv.products[0].curriculum[0].lessons;
  ok(l2[0].video === "PREVIEW-VID" && l2[1].video === "" && !l2[1].files[0].url && pv.products[0].kakao === "" && pv.products[0].locked, "방문자: 미리보기 영상만 · 유료 강의 영상 · 자료 · 오픈채팅은 숨김", l2);
  ok(!pv.members && !pv.crm, "방문자: 회원 목록 · CRM 은 공개 정보에서 빠짐", Object.keys(pv));
  ok(!(j.docs || []).some((d) => /^vm:|^vo:|^vq:/.test(d[0])), "방문자: 회원 · 주문 · 문의 문서 안 보임");
  useJar(jarB);
  j = await boot();
  const mB = j.me.vod && j.me.vod.mid;
  ok(mB && docOf(j, "vm:" + mB) && !docOf(j, "vm:" + mB).pwHash && !("notes" in docOf(j, "vm:" + mB)), "회원 B: 내 회원 문서만 (비밀번호 · 운영 메모 없음)", j.me);
  ok(!(j.docs || []).some((d) => /^vm:/.test(d[0]) && d[0] !== "vm:" + mB), "회원 B: 다른 회원 문서는 안 보임");

  console.log("9) 무통장 입금 · 카드 준비 중 · 입금 확인 · 강의 잠금 해제");
  const sec = process.env.PORTONE_API_SECRET; delete process.env.PORTONE_API_SECRET;
  r = await call("vod-pay", { body: { action: "prepare", pid: "v5", kind: "course", plan: 365, method: "card", expect: 65000 } });
  ok(r.status === 409 && /PG/.test(r.json.message), "포트원 키가 없으면 카드 결제 막기 (가짜 결제 없음)", r.json);
  process.env.PORTONE_API_SECRET = sec;
  r = await call("vod-pay", { body: { action: "prepare", pid: "v5", kind: "course", plan: 365, method: "bank", buyer: { name: "나OO", phone: "010-0000-2222" }, expect: 65000 } });
  ok(r.json.ok && r.json.bank && r.json.orders[0].status === "pending", "무통장 입금 주문 → 입금 대기", r.json);
  const bankNo = r.json.no;
  j = await boot();
  ok(docOf(j, "vo:" + bankNo) && docOf(j, "vo:" + bankNo).status === "pending", "회원 B: 내 주문 문서가 보임");
  ok(docOf(j, "meta").vod.products[0].curriculum[0].lessons[1].video === "", "입금 전에는 강의 잠김");
  useJar({ dc_a: auth.sign({ r: "master" }) });
  j = await boot();
  const vo = docOf(j, "vo:" + bankNo);
  r = await sync([{ k: "vo:" + bankNo, base: verOf(j, "vo:" + bankNo), ops: [{ p: ["status"], v: "paid" }, { p: ["paidAt"], v: Date.now() }] }]);
  ok(r.results && !r.results[0].error, "마스터: 입금 확인 (주문 → 결제 완료)", r);
  j = await boot();
  ok(((docOf(j, "vstat") || {}).sold || {}).v5 === 1, "수강생 수(서버 집계) +1", docOf(j, "vstat"));
  useJar(jarB);
  j = await boot();
  pv = docOf(j, "meta").vod;
  ok(pv.products[0].curriculum[0].lessons[1].video === "SECRET-VID" && pv.products[0].kakao && !pv.products[0].locked && pv.products[1].locked, "산 클래스만 잠금 해제 (다른 클래스는 그대로 잠김)", pv.products.map((p) => [p.id, !!p.locked]));

  console.log("10) 쓰기 권한 (sync)");
  const vmB = docOf(j, "vm:" + mB), vB = verOf(j, "vm:" + mB);
  r = await sync([{ k: "vm:" + mB, base: vB, ops: [{ p: ["name"], v: "나OO2" }, { p: ["points"], v: 999999 }, { p: ["likes"], v: ["v5", "v6"] }, { p: ["coupons"], v: [{ id: "x", cid: "free", usedAt: null }] }] }]);
  j = await boot();
  const vmB2 = docOf(j, "vm:" + mB);
  ok(vmB2.name === "나OO2" && vmB2.points === (vmB.points || 0) && (vmB2.coupons || []).length === (vmB.coupons || []).length && vmB2.likes.length === 2, "회원: 이름 · 찜은 고칠 수 있고 포인트 · 쿠폰은 못 고침", { n: vmB2.name, p: vmB2.points, c: (vmB2.coupons || []).length });
  ok(((docOf(j, "vstat") || {}).likes || {}).v5 === 1, "찜 수(서버 집계)", docOf(j, "vstat"));
  r = await sync([{ k: "vm:someone-else", base: 0, put: { id: "someone-else", points: 1 } }]);
  ok(r.results[0].error === "forbidden", "다른 회원 문서 만들기 · 고치기 막기", r.results);
  r = await sync([{ k: "vo:" + bankNo, base: verOf(j, "vo:" + bankNo), ops: [{ p: ["status"], v: "refunded" }, { p: ["amount"], v: 1 }, { p: ["refundReq"], v: { why: "단순 변심", text: "환불 원해요" } }] }]);
  j = await boot();
  const vo2 = docOf(j, "vo:" + bankNo);
  ok(vo2.status === "paid" && vo2.amount === 65000 && vo2.refundReq && vo2.refundReq.why === "단순 변심", "회원: 내 주문은 환불 요청만 (상태 · 금액은 못 바꿈)", vo2);
  r = await sync([{ k: "vr:rv1", base: 0, put: { id: "rv1", pid: "v5", mid: "fake", name: "나OO", rating: 5, text: "좋아요", reply: "가짜 답변" } }]);
  j = await boot();
  const rv = docOf(j, "vr:rv1");
  ok(rv && rv.mid === mB && !rv.reply, "후기: 내 이름으로만 · 답변 칸은 못 씀", rv);
  ok(docOf(j, "vm:" + mB).points === (vmB.points || 0) + 500, "후기 포인트 500P (서버가 지급)", docOf(j, "vm:" + mB).points);
  r = await sync([{ k: "vr:rv2", base: 0, put: { id: "rv2", pid: "v5", rating: 4, text: "두 번째" } }]);
  j = await boot();
  ok(docOf(j, "vm:" + mB).points === (vmB.points || 0) + 500, "같은 클래스 후기 포인트는 한 번만");
  r = await sync([{ k: "vr:rv3", base: 0, put: { id: "rv3", pid: "v6", rating: 5, text: "안 산 클래스" } }]);
  j = await boot();
  ok(!docOf(j, "vr:rv3"), "안 산 클래스 후기는 저장 안 됨", docOf(j, "vr:rv3"));
  r = await sync([{ k: "vq:" + mB + ":q1", base: 0, put: { id: "q1", mid: mB, cat: "결제", title: "문의", text: "입금했어요 확인 부탁", answer: "셀프 답변" } }]);
  j = await boot();
  ok(docOf(j, "vq:" + mB + ":q1") && docOf(j, "vq:" + mB + ":q1").answer === "", "1:1 문의 남기기 (답변 칸은 비움)", docOf(j, "vq:" + mB + ":q1"));
  r = await sync([{ k: "vpl:p1", base: 0, put: { id: "p1", pid: "v5", nick: "나OO", text: "매일 1편!" } }]);

  console.log("11) 무통장 주문 취소 · 두잉고 강의실");
  r = await call("vod-pay", { body: { action: "prepare", pid: "v6", kind: "course", plan: 365, method: "bank" } });
  const bank2 = r.json.no;
  r = await call("vod-pay", { body: { action: "cancelPending", no: bank2 } });
  j = await boot();
  ok(r.json.ok && docOf(j, "vo:" + bank2).status === "canceled", "입금 전 주문 취소", r.json);
  r = await call("vod-pay", { body: { action: "dg", iid: "moon" } });
  ok(r.status === 403, "안 산 강사 두잉고 강의실은 못 들어감", r.json);
  r = await call("vod-pay", { body: { action: "dg", iid: "choi" } });
  ok(r.json.ok && jar.dc_s, "산 VOD 강사 두잉고 강의실 → 수강생 계정 + 로그인", r.json);
  const sid = r.json.sid;
  r = await call("vod-pay", { body: { action: "dg", iid: "choi" } });
  ok(r.json.sid === sid, "두 번째 입장은 같은 수강생 계정");
  delete jar.dc_v;
  j = await boot();
  ok(j.me.student && j.me.student.sid === sid && j.me.vod && j.me.vod.mid === mB && docOf(j, "meta").vod.products[0].curriculum[0].lessons[1].video === "SECRET-VID", "두잉고 강의실(수강생 로그인)만으로도 산 강의는 열림", j.me);

  console.log("12) 파일 · 강사 수정 범위 · 서류 숨김");
  const pdf = "data:application/pdf;base64," + Buffer.from("%PDF-1.4 수업 자료 " + "x".repeat(200)).toString("base64");
  useJar({});
  r = await call("file", { body: { data: pdf, scope: "vodp:v5" } });
  ok(r.status === 403, "방문자는 파일을 못 올림");
  useJar({ dc_a: auth.sign({ r: "master" }) });
  r = await call("file", { body: { data: pdf, scope: "vodp:v5" } });
  ok(r.json.ok && /^\/api\/file\?h=/.test(r.json.url), "마스터: 수업 자료 올리기", r.json);
  const fh = new URL("http://x" + r.json.url).searchParams.get("h");
  r = await call("file", { body: { data: pdf, scope: "../../etc" } });
  ok(r.status === 400, "이상한 범위는 거절");
  useJar({});
  r = await call("file", { method: "GET", query: { h: fh } });
  ok(r.status === 403, "방문자: 유료 수업 자료 못 받음", r.status);
  useJar(jarB); delete jar.dc_s;
  r = await call("file", { method: "GET", query: { h: fh } });
  ok(r.status === 200, "산 회원: 수업 자료 받기", r.status);
  // 강사(choi): 자기 클래스 커리큘럼만 고쳐짐
  useJar({ dc_a: auth.sign({ r: "instructor", iid: "choi" }) });
  j = await boot();
  const m2 = docOf(j, "meta");
  const iV = m2.vod.products.findIndex((x) => x.id === "v5"), oV = m2.vod.products.findIndex((x) => x.id === "v6");
  r = await sync([{ k: "meta", base: verOf(j, "meta"), ops: [{ p: ["vod", "products", iV, "curriculum", 0, "lessons", 1, "video"], v: "https://vimeo.com/111" }, { p: ["vod", "products", iV, "price"], v: 1 }, { p: ["vod", "products", oV, "title"], v: "남의 클래스" }, { p: ["vod", "settings", "reviewPoint"], v: 99999 }, { p: ["contracts", "choi", "docs", "biz"], v: { name: "사업자등록증.pdf" } }, { p: ["contracts", "moon", "docs", "biz"], v: { name: "남의 서류" } }] }]);
  useJar({ dc_a: auth.sign({ r: "master" }) });
  j = await boot();
  const m3 = docOf(j, "meta"), p5 = m3.vod.products.find((x) => x.id === "v5"), p6 = m3.vod.products.find((x) => x.id === "v6");
  ok(p5.curriculum[0].lessons[1].video === "https://vimeo.com/111" && p5.price === 89000 && p6.title === "다른 클래스" && m3.vod.settings.reviewPoint === 500, "강사: 자기 클래스 강의 영상만 바뀜 (가격 · 남의 클래스 · 설정은 그대로)", { v: p5.curriculum[0].lessons[1].video, price: p5.price, t6: p6.title, rp: m3.vod.settings.reviewPoint });
  ok(m3.contracts && m3.contracts.choi && m3.contracts.choi.docs.biz && !(m3.contracts.moon && m3.contracts.moon.docs && m3.contracts.moon.docs.biz && m3.contracts.moon.docs.biz.name === "남의 서류"), "강사: 자기 제출 서류만", m3.contracts);
  useJar({});
  j = await boot();
  ok(!("contracts" in docOf(j, "meta")), "방문자: 강사 제출 서류(연락처 · 메모)는 안 보임");

  console.log("\n결과: " + pass + "개 통과 · " + failN + "개 실패");
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(failN ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
