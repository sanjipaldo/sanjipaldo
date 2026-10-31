/* 두고클래스 서버 테스트 — 진짜 포트원 · 카카오 대신 가짜 응답(fetch 바꿔치기)으로
 * 결제 · 취소 · 환불 · 웹훅 · 카카오 로그인 · 문서 공개 범위 · 쓰기 권한을 확인해요.
 *   node scripts/vod-test.js   (class/ 에서) — 저장소는 임시 SQLite 파일 */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");
const ROOT = path.join(__dirname, ".."), TMP = fs.mkdtempSync(path.join(os.tmpdir(), "vodtest-"));
fs.cpSync(path.join(ROOT, "api"), path.join(TMP, "class/api"), { recursive: true });
fs.cpSync(path.join(ROOT, "data.js"), path.join(TMP, "class/data.js")); fs.cpSync(path.join(ROOT, "db.js"), path.join(TMP, "class/db.js"));
fs.symlinkSync(path.join(ROOT, "..", "node_modules"), path.join(TMP, "node_modules"), "dir"); // 공식 SDK (저장소 맨 위 npm install)
const WH = crypto.randomBytes(24).toString("base64");
Object.assign(process.env, { CLASS_SQLITE: path.join(TMP, "t.db"), SESSION_SECRET: "test-session", VOD_SERVER_AUTH: "1", PORTONE_STORE_ID: "store-test", PORTONE_API_SECRET: "ps-test", PORTONE_CHANNEL_CARD: "channel-key-card", PORTONE_CHANNEL_KAKAOPAY: "channel-key-kp", PORTONE_WEBHOOK_SECRET: "whsec_" + WH, KAKAO_REST_KEY: "rest-test", KAKAO_CLIENT_SECRET: "cs-test", KAKAO_REDIRECT_URI: "https://www.doogoclass.com/api/vod-kakao", KAKAO_ADMIN_KEY: "admin-test" });
const API = (n) => require(path.join(TMP, "class/api", n + ".js"));
const auth = require(path.join(TMP, "class/api/_lib/auth.js"));

// ---------- 가짜 외부 서버 ----------
const PG = {}, calls = [], PAY = [], AI = { reqs: [], next: null }, SOL = [], RES = [], VDC = [];
let kakaoUser = null;
global.fetch = async (url, opt) => {
  opt = opt || {}; const u = new URL(url); calls.push(opt.method === "POST" ? "POST " + u.host + u.pathname : "GET " + u.host + u.pathname);
  const J = (status, j) => ({ ok: status < 300, status, json: async () => j, text: async () => JSON.stringify(j) });
  if (u.host === "api.portone.io") {
    if (!/^PortOne ps-test$/.test((opt.headers || {}).Authorization || "")) return J(401, { type: "UNAUTHORIZED" });
    const m = u.pathname.match(/^\/payments\/([^/]+)(\/cancel|\/virtual-account\/close)?$/); const id = decodeURIComponent(m[1]);
    if (m[2] === "/virtual-account/close") { if (PG[id] && PG[id].status === "PAID") return J(409, { type: "PAYMENT_ALREADY_PAID", message: "이미 입금된 결제예요" }); if (PG[id]) PG[id].closed = true; return J(200, { closedAt: new Date().toISOString() }); }
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
  // 영상 길이: 비메오 oEmbed · 유튜브 영상 페이지 · 유튜브 Data API
  if (u.host === "vimeo.com" && u.pathname === "/api/oembed.json") { const id = ((u.searchParams.get("url") || "").match(/vimeo\.com\/(\d+)/) || [])[1]; VDC.push("vm " + id + " " + ((opt.headers || {}).Referer || "")); return id === "111111111" ? J(404, {}) : J(200, { type: "video", duration: 1470 }); }
  if (u.host === "www.youtube.com" && u.pathname === "/watch") { const id = u.searchParams.get("v"); VDC.push("yt " + id); return { ok: true, status: 200, text: async () => '<script>var a={"videoDetails":{"videoId":"' + id + '","lengthSeconds":"212"}}</script>' }; }
  if (u.host === "www.googleapis.com") { VDC.push("api " + u.searchParams.get("id")); return J(200, { items: u.searchParams.get("id").split(",").map((id) => ({ id, contentDetails: { duration: "PT1H2M3S" } })) }); }
  if (u.host === "challenges.cloudflare.com") return J(200, { success: /ts=ok|response=ok/.test(opt.body) });
  if (u.host === "api.solapi.com") { const h = opt.headers || {}, b = JSON.parse(opt.body || "{}"); SOL.push({ path: u.pathname, auth: h.Authorization || "", body: b }); return J(200, { groupInfo: { _id: "G" + SOL.length }, failedMessageList: [] }); }
  if (u.host === "api.resend.com") { const h = opt.headers || {}, b = JSON.parse(opt.body || "[]"); RES.push({ path: u.pathname, auth: h.Authorization || "", body: b }); return J(200, { data: b.map((x, i) => ({ id: "em" + i })) }); }
  if (u.host === "api.anthropic.com") {
    const h = opt.headers instanceof Headers ? Object.fromEntries(opt.headers.entries()) : opt.headers || {};
    AI.reqs.push({ path: u.pathname, h, body: JSON.parse(opt.body || "{}") });
    const n = AI.next || { status: 200, body: { id: "msg_t", type: "message", role: "assistant", content: [{ type: "text", text: "운송료는 1kg까지 $16이에요." }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } } };
    return new Response(JSON.stringify(n.body), { status: n.status, headers: { "content-type": "application/json" } });
  }
  if (u.host === "api.payaction.app") { const h = opt.headers || {}; PAY.push({ path: u.pathname, body: JSON.parse(opt.body || "{}"), key: h["x-api-key"], mall: h["x-mall-id"] }); return J(200, h["x-api-key"] === "pa-key" ? { status: "success", response: {} } : { status: "error", response: { message: "bad key" } }); }
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
  { const ks = jar.dc_ks;
    for (const h of ["doinggo.doogoclass.com", "doogo-class.vercel.app"]) {
      r = await call("vod-auth", { method: "GET", query: { action: "kakao", next: "#/vod/checkout/v5" }, headers: { host: h } });
      ok(r.status === 302 && r.location === "https://www.doogoclass.com/api/vod-auth?action=kakao&next=%23%2Fvod%2Fcheckout%2Fv5" && jar.dc_ks === ks, "다른 주소(" + h + ")에서 누르면 www 로 먼저 옮겨요 (state 쿠키 안 붙임)", r.location);
    }
    r = await call("vod-auth", { method: "GET", query: { action: "kakao" }, headers: { host: "localhost:4491" } });
    ok(r.status === 302 && /kauth\.kakao\.com/.test(r.location), "로컬 개발 주소는 그대로 카카오로", r.location); }
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
  // 마이페이지 › 회원 정보 수정 › 카카오 연결하기 (이메일 회원 a@example.com 에 카카오 999 붙이기)
  r = await call("vod-auth", { body: { action: "login", email: "a@example.com", pw: "test1234a" } });
  const aId = r.json.member.id;
  ok(r.json.member.hasPw === true && !r.json.member.kakaoId, "이메일 회원: 비밀번호 있음 표시 · 카카오 없음", r.json.member);
  r = await call("vod-auth", { method: "GET", query: { action: "kakao", link: "1", next: "#/vod/my/account" } });
  r = await call("vod-kakao", { method: "GET", query: { code: "c5", state: new URL(r.location).searchParams.get("state") } });
  ok(r.location === "/?vodlogin=linked#/vod/my/account", "카카오 연결 → 회원 정보 수정으로 돌아가요", r.location);
  r = await call("vod-auth", { body: { action: "me" } });
  ok(r.json.member.id === aId && r.json.member.kakaoId === "999" && r.json.member.via === "email" && r.json.member.kakaoLinkedAt, "연결한 계정 그대로 · 카카오 회원번호 붙음", r.json.member);
  delete jar.dc_v;
  r = await call("vod-auth", { method: "GET", query: { action: "kakao" } });
  r = await call("vod-kakao", { method: "GET", query: { code: "c6", state: new URL(r.location).searchParams.get("state") } });
  r = await call("vod-auth", { body: { action: "me" } });
  ok(r.json.member && r.json.member.id === aId, "이제 카카오로 로그인하면 이메일 계정으로 들어가요", r.json.member);
  r = await call("vod-auth", { method: "GET", query: { action: "kakao", link: "1", next: "#/vod/my/account" } });
  r = await call("vod-kakao", { method: "GET", query: { code: "c7", state: new URL(r.location).searchParams.get("state") } });
  ok(/vodlogin=linked/.test(r.location), "이미 연결된 카카오로 다시 연결 → 그대로 연결됨", r.location);
  kakaoUser = { id: 555, kakao_account: { email: "other@example.com", is_email_valid: true, name: "마OO" } };
  r = await call("vod-auth", { method: "GET", query: { action: "kakao", link: "1", next: "#/vod/my/account" } });
  r = await call("vod-kakao", { method: "GET", query: { code: "c7b", state: new URL(r.location).searchParams.get("state") } });
  ok(r.location === "/?vodlogin=other#/vod/my/account", "이미 다른 카카오가 붙은 계정에 또 연결 → 안내 (덮어쓰지 않음)", r.location);
  r = await call("vod-auth", { body: { action: "me" } });
  ok(r.json.member.id === aId && r.json.member.kakaoId === "999", "원래 연결(999)은 그대로", r.json.member);
  kakaoUser = { id: 999, kakao_account: { email: "a@example.com", is_email_valid: true, is_email_verified: true, name: "가OO" } };
  // 다른 회원이 쓰는 카카오(4123456789 는 카카오 가입 회원)로 연결하려 하면: 그 회원으로 바꿔 로그인하지 않고 안내
  { await call("vod-auth", { body: { action: "logout" } }); delete jar.dc_v;
    r = await call("vod-auth", { body: { action: "signup", email: "c@example.com", pw: "test1234c", name: "다OO", phone: "010-0000-3333", agree: true } });
    const cId = r.json.member.id;
    kakaoUser = { id: 4123456700, kakao_account: { email: "kk2@example.com", is_email_valid: true, is_email_verified: true, name: "라OO" } };
    r = await call("vod-auth", { method: "GET", query: { action: "kakao", next: "#/vod" } });
    const keepV = jar.dc_v;
    r = await call("vod-kakao", { method: "GET", query: { code: "c8", state: new URL(r.location).searchParams.get("state") } }); // 새 카카오 회원 가입(로그인 바뀜)
    jar.dc_v = keepV; // 다시 c@example.com 으로
    r = await call("vod-auth", { method: "GET", query: { action: "kakao", link: "1", next: "#/vod/my/account" } });
    r = await call("vod-kakao", { method: "GET", query: { code: "c9", state: new URL(r.location).searchParams.get("state") } });
    ok(r.location === "/?vodlogin=taken#/vod/my/account", "다른 계정이 쓰는 카카오 → 연결 안 하고 안내", r.location);
    r = await call("vod-auth", { body: { action: "me" } });
    ok(r.json.member.id === cId && !r.json.member.kakaoId, "로그인은 원래 계정 그대로 (다른 사람 계정으로 안 바뀜)", r.json.member);
    r = await call("vod-auth", { body: { action: "kakao-off" } });
    ok(r.status === 400, "연결된 카카오가 없으면 끊기 거절", r.json); }
  // 연결 끊기: 이메일 회원은 끊을 수 있고, 카카오로 가입한 회원은 못 끊어요
  delete jar.dc_v; kakaoUser = { id: 999, kakao_account: { email: "a@example.com", is_email_valid: true, is_email_verified: true, name: "가OO" } };
  r = await call("vod-auth", { body: { action: "login", email: "a@example.com", pw: "test1234a" } });
  r = await call("vod-auth", { body: { action: "kakao-off" } });
  ok(r.json.ok && r.json.member.kakaoId === "" && r.json.member.id === aId, "이메일 회원: 카카오 연결 끊기", r.json);
  r = await call("vod-auth", { method: "GET", query: { action: "kakao" } }); delete jar.dc_v;
  r = await call("vod-kakao", { method: "GET", query: { code: "c10", state: new URL(r.location).searchParams.get("state") } });
  ok(/vodlogin=dup/.test(r.location), "끊은 뒤 그 카카오로 오면 다시 ‘같은 이메일 계정 있음’ 안내", r.location);
  r = await call("vod-auth", { method: "GET", query: { action: "kakao", next: "#/vod" } });
  kakaoUser = { id: 4123456789, kakao_account: { email: "kk@example.com", is_email_valid: true, is_email_verified: true, name: "카OO" } };
  r = await call("vod-kakao", { method: "GET", query: { code: "c11", state: new URL(r.location).searchParams.get("state") } });
  r = await call("vod-auth", { body: { action: "kakao-off" } });
  ok(r.status === 400 && /카카오로 가입한/.test(r.json.message), "카카오로 가입한 회원은 연결 끊기 거절 (로그인할 방법이 없어져요)", r.json);
  r = await call("vod-auth", { body: { action: "me" } });
  ok(r.json.member.hasPw === false && r.json.member.kakaoId === "4123456789", "카카오 회원: 비밀번호 없음 표시", r.json.member);
  delete jar.dc_v;
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

  console.log("13) 무통장 입금: 기수 계좌로 받기 · 입금자명 · 마스터 확인 · 자동 입금 확인");
  const BK = require(path.join(TMP, "class/api/_lib/bank.js"));
  useJar({ dc_a: auth.sign({ r: "master" }) });
  j = await boot();
  const mt = docOf(j, "meta");
  mt.vod.settings = Object.assign({}, mt.vod.settings, { bank: "", account: "", holder: "" });
  mt.billing = Object.assign({}, mt.billing || {}, { bank: "신한은행", account: "140-000-111111", holder: "(주)두고홀딩스" });
  r = await sync([{ k: "meta", base: verOf(j, "meta"), put: mt }]);
  ok(r.results && !r.results[0].error, "마스터: VOD 계좌는 비우고 기수 입금 계좌만", r);
  useJar(jarB);
  j = await boot();
  const pst = docOf(j, "meta").vod.settings;
  ok(pst.bank === "신한은행" && pst.account === "140-000-111111" && !("billing" in docOf(j, "meta")), "회원: 결제 화면에 기수 입금 계좌가 보임 (기수 정산 정보는 그대로 숨김)", pst);
  r = await call("vod-pay", { body: { action: "prepare", pid: "v6", kind: "course", plan: 365, method: "bank", depositor: "나 OO", buyer: { name: "나OO2" } } });
  const b13 = r.json.no, amt13 = r.json.amount, o13 = r.json.orders && r.json.orders[0];
  ok(r.json.ok && o13.depositor === "나OO" && o13.bankTo.account === "140-000-111111" && o13.dueAt > Date.now() + 2 * 864e5, "무통장 주문: 입금자명 · 안내 계좌 · 입금 기한이 주문에 남음", o13);
  r = await call("vod-pay", { body: { action: "bankOk", no: b13 } });
  ok(r.status === 403, "회원은 입금 확인 못 함", r.json);
  // 자동 입금 확인: 이름이 다르면 맞추지 않고 남겨 둬요
  let mr = await BK.match({ id: "dep-1", name: "김OO", amount: amt13, at: Date.now(), bank: "신한" });
  ok(mr.ok && mr.st === "none", "입금자명이 다르면 자동 확인 안 함 (못 맞춘 입금으로 남김)", mr);
  mr = await BK.match({ id: "dep-2", name: "나OO", amount: amt13 - 1000 });
  ok(mr.st === "none", "금액이 다르면 자동 확인 안 함", mr);
  mr = await BK.match({ id: "dep-3", name: "(나 OO)", amount: amt13 });
  ok(mr.st === "ok" && mr.no === b13, "입금자명 · 금액이 맞으면 자동 입금 확인 (띄어쓰기 · 괄호 무시)", mr);
  mr = await BK.match({ id: "dep-3", name: "나OO", amount: amt13 });
  ok(mr.dup, "같은 입금 알림이 두 번 와도 한 번만", mr);
  j = await boot();
  pv = docOf(j, "meta").vod;
  ok(docOf(j, "vo:" + b13).status === "paid" && docOf(j, "vo:" + b13).pg.okHow === "auto" && !pv.products.find((x) => x.id === "v6").locked, "자동 확인 → 결제 완료 · 바로 수강 열림", docOf(j, "vo:" + b13));
  // 마스터: 못 맞춘 입금 보기 · 주문에 연결 · 입금 확인 버튼 · 취소
  r = await call("vod-pay", { body: { action: "prepare", pid: "v5", kind: "extend", method: "bank", depositor: "나OO" } });
  const ext = r.json.ok ? r.json.no : "";
  const pts0 = docOf(j, "vm:" + mB).points || 0;
  r = await call("vod-pay", { body: { action: "prepare", pid: "v6", kind: "course", plan: 180, method: "bank", points: Math.min(500, pts0) } });
  const b14 = r.json.no;
  j = await boot();
  ok(docOf(j, "vm:" + mB).points === pts0 - Math.min(500, pts0), "무통장 주문: 쓴 포인트는 주문할 때 빠짐", docOf(j, "vm:" + mB).points);
  useJar({ dc_a: auth.sign({ r: "master" }) });
  r = await call("vod-pay", { body: { action: "bankLog" } });
  ok(r.json.ok && r.json.recent.filter((e) => e.st === "none").length === 2 && r.json.recent.some((e) => e.st === "ok" && e.no === b13), "마스터: 최근 입금 알림 (자동 확인 1 · 못 맞춘 입금 2)", r.json.recent.map((e) => e.st));
  if (ext) {
    r = await call("vod-pay", { body: { action: "bankLink", id: "dep-1", no: ext } });
    ok(r.ok !== false && r.json.ok, "마스터: 못 맞춘 입금을 주문에 연결 → 입금 확인", r.json);
    r = await call("vod-pay", { body: { action: "bankLink", id: "dep-1", no: ext } });
    ok(!r.json.ok, "이미 연결한 입금은 다시 연결 안 됨", r.json);
  }
  r = await call("vod-pay", { body: { action: "bankCancel", no: b14 } });
  ok(r.json.ok, "마스터: 입금 전 주문 취소", r.json);
  r = await call("vod-pay", { body: { action: "bankOk", no: b14 } });
  ok(r.status === 409, "취소한 주문은 입금 확인 안 됨", r.json);
  useJar(jarB);
  j = await boot();
  ok(docOf(j, "vo:" + b14).status === "canceled" && docOf(j, "vm:" + mB).points === pts0, "취소하면 쓴 포인트를 돌려받음", { st: docOf(j, "vo:" + b14).status, p: docOf(j, "vm:" + mB).points });
  r = await call("vod-pay", { body: { action: "prepare", pid: "v6", kind: "course", plan: 180, method: "bank", depositor: "나OO" } });
  const b15 = r.json.no;
  useJar({ dc_a: auth.sign({ r: "master" }) });
  r = await call("vod-pay", { body: { action: "bankOk", no: b15 } });
  const r2 = await call("vod-pay", { body: { action: "bankOk", no: b15 } });
  ok(r.json.ok && r.json.orders.length === 1 && r2.json.ok && r2.json.already, "마스터 ‘입금 확인’ → 결제 완료 (두 번 눌러도 한 번만)", [r.json, r2.json]);
  j = await boot();
  ok(docOf(j, "vo:" + b15).status === "paid" && docOf(j, "vo:" + b15).pg.okHow === "manual", "입금 확인한 사람 · 방법이 주문에 남음", docOf(j, "vo:" + b15).pg);
  // 계좌가 하나도 없으면 무통장도 막아요
  const mt2 = docOf(j, "meta"); mt2.billing = Object.assign({}, mt2.billing, { bank: "", account: "" });
  await sync([{ k: "meta", base: verOf(j, "meta"), put: mt2 }]);
  useJar(jarB);
  r = await call("vod-pay", { body: { action: "prepare", pid: "v6", kind: "course", plan: 180, method: "bank" } });
  ok(r.status === 409 && /계좌/.test(r.json.message), "받을 계좌가 없으면 무통장 주문 막기", r.json);

  console.log("14) 체험 계정 vod@gmail.com (일회성 작업)");
  const ran = await require(path.join(TMP, "class/api/_lib/init.js")).runPendingOps();
  ok(ran.some((x) => x.id === "2026-10-29-vod-demo-member" && x.ok), "배포 때 체험 계정 작업이 한 번 돌아요", ran.map((x) => x.id + ":" + x.ok));
  useJar({});
  r = await call("vod-auth", { body: { action: "login", email: "vod@gmail.com", pw: "vod" } });
  ok(r.json.ok && r.json.member.email === "vod@gmail.com", "체험 계정 로그인", r.json);
  j = await boot();
  const dOrders = (j.docs || []).filter((d) => /^vo:/.test(d[0])).map((d) => d[1]);
  ok(dOrders.length === 6 && dOrders.every((o) => o.status === "paid" && o.amount === 0 && o.demo) && j.me.vod && docOf(j, "meta").vod.products.find((x) => x.id === "v5") && !docOf(j, "meta").vod.products.find((x) => x.id === "v5").locked, "산 강의 6개 (0원 체험 주문) · 강의 열림", dOrders.map((o) => o.pid));
  ok(!((docOf(j, "vstat") || {}).sold || {}).v4, "체험 주문은 수강생 수에 안 잡혀요", docOf(j, "vstat"));
  r = await call("vod-auth", { body: { action: "pw", pw0: "vod", pw1: "abcd12345" } });
  ok(r.status === 403, "체험 계정 비밀번호는 못 바꿔요", r.json);
  r = await call("vod-auth", { body: { action: "withdraw", pw: "vod" } });
  ok(r.status === 403, "체험 계정은 탈퇴 못 해요", r.json);
  const ran2 = await require(path.join(TMP, "class/api/_lib/init.js")).runPendingOps();
  ok(!ran2.length, "다음 배포 때는 다시 돌지 않아요", ran2);
  useJar({ dc_a: auth.sign({ r: "master" }) });
  j = await boot();
  const mt3 = docOf(j, "meta"); mt3.vod.settings.demoLogin = false;
  await sync([{ k: "meta", base: verOf(j, "meta"), put: mt3 }]);
  useJar({});
  r = await call("vod-auth", { body: { action: "login", email: "vod@gmail.com", pw: "vod" } });
  ok(r.status === 403 && /쉬고/.test(r.json.message), "마스터가 체험 계정을 끄면 로그인 막힘", r.json);

  console.log("15) 자동 입금 확인 (페이액션 웹훅)");
  Object.assign(process.env, { PAYACTION_API_KEY: "pa-key", PAYACTION_MALL_ID: "mall-1", PAYACTION_WEBHOOK_KEY: "wh-key-123" });
  useJar({ dc_a: auth.sign({ r: "master" }) });
  j = await boot();
  const mt4 = docOf(j, "meta"); mt4.vod.settings = Object.assign({}, mt4.vod.settings, { bank: "국민은행", account: "123-456", holder: "(주)두고홀딩스" });
  await sync([{ k: "meta", base: verOf(j, "meta"), put: mt4 }]);
  r = await call("vod-config", { method: "GET" });
  ok(r.json.cfg.bankAuto === true && !JSON.stringify(r.json).includes("pa-key") && !JSON.stringify(r.json).includes("wh-key"), "config: 자동 입금 확인 켜짐 (키는 안 보냄)", r.json.cfg);
  useJar(jarB);
  r = await call("vod-pay", { body: { action: "prepare", pid: "v6", kind: "course", plan: 365, method: "bank", depositor: "나OO" } });
  const b16 = r.json.no, reg = PAY.find((x) => x.path === "/order" && x.body.order_number === b16);
  ok(r.json.ok && reg && reg.body.order_amount === r.json.amount && reg.body.billing_name === "나OO" && reg.mall === "mall-1" && /\+09:00$/.test(reg.body.order_date), "무통장 주문 → 페이액션에 주문 등록 (입금자명 · 금액)", reg);
  r = await call("vod-bank", { body: { order_number: b16, order_status: "매칭완료" }, headers: { "x-webhook-key": "nope" } });
  ok(r.status === 401, "웹훅 키가 틀리면 거절", r.json);
  r = await call("vod-bank", { body: { order_number: b16, order_status: "매칭완료", processing_date: "2026-10-29T03:00:00+09:00" }, headers: { "x-webhook-key": "wh-key-123" } });
  ok(r.status === 200 && r.json.status === "success", "매칭완료 웹훅 → { status: success }", r.json);
  r = await call("vod-bank", { body: { order_number: b16, order_status: "매칭완료" }, headers: { "x-api-key": "wh-key-123" } });
  ok(r.json.status === "success", "같은 알림이 또 와도 success (한 번만 확인)", r.json);
  j = await boot();
  ok(docOf(j, "vo:" + b16).status === "paid" && docOf(j, "vo:" + b16).pg.via === "payaction", "새벽 입금도 자동으로 결제 완료 → 바로 수강", docOf(j, "vo:" + b16).pg);
  r = await call("vod-pay", { body: { action: "prepare", pid: "v6", kind: "course", plan: 180, method: "bank", depositor: "나OO" } });
  const b17 = r.json.no;
  r = await call("vod-pay", { body: { action: "cancelPending", no: b17 } });
  ok(r.json.ok && PAY.some((x) => x.path === "/order-exclude" && x.body.order_number === b17), "입금 전 취소하면 페이액션 맞추기에서도 빼요", PAY.map((x) => x.path));
  process.env.PAYACTION_API_KEY = "wrong";
  r = await call("vod-pay", { body: { action: "prepare", pid: "v6", kind: "course", plan: 180, method: "bank", depositor: "나OO" } });
  j = await boot();
  ok(r.json.ok && docOf(j, "vo:" + r.json.no).status === "pending" && docOf(j, "vo:" + r.json.no).pg.pa === "fail", "페이액션 등록이 실패해도 주문은 받고 표시만 (마스터가 직접 확인)", docOf(j, "vo:" + r.json.no).pg);
  ["PAYACTION_API_KEY", "PAYACTION_MALL_ID", "PAYACTION_WEBHOOK_KEY"].forEach((k) => delete process.env[k]);

  console.log("16) 계정 보안 · 파트너 · 운영자 로그인");
  process.env.MASTER_PASSWORD = "Test-master9@";
  useJar({});
  r = await call("auth", { body: { action: "admin", tab: "master", id: "DOOGOBIZ", pw: "Test-master9@" } });
  ok(r.json.ok && r.json.role === "master", "마스터: doogobiz + 환경변수 비밀번호 (대소문자 무관 아이디)", r.json);
  useJar({});
  r = await call("auth", { body: { action: "admin", tab: "master", id: "doogobiz", pw: "wrong" } });
  ok(r.json.error === "notfound", "마스터: 비밀번호가 틀리면 거절", r.json);
  useJar({ dc_a: auth.sign({ r: "master" }) });
  j = await boot();
  const mt5 = docOf(j, "meta");
  Object.assign(mt5, { staff: [{ id: "st1", name: "매니저", loginId: "mgr", pw: "mgr-pw1", status: "active", perms: ["master/vod"] }, { id: "st2", name: "멈춘", loginId: "old", pw: "old-pw1", status: "paused" }],
    affiliates: [{ id: "aff-t", name: "테스트파트너", loginId: "ptest", pw: "pt-pw1", status: "active", rs: 20, instructors: [{ iid: "moon", rs: null }] }, { id: "aff-x", name: "다른파트너", loginId: "other", pw: "ot-pw1", status: "active", instructors: [] }],
    affPayouts: { "aff-t:2026-09": { paidAt: "2026-10-10" }, "aff-x:2026-09": { paidAt: "2026-10-10" } }, affSettings: { rs: 20, payDay: 10 }, adminLog: [{ at: 1, msg: "비밀 기록" }], contracts: { moon: { docs: { biz: { name: "문.pdf" } } }, choi: { docs: { biz: { name: "초이.pdf" } } } } });
  await sync([{ k: "meta", base: verOf(j, "meta"), put: mt5 }]);
  await sync([{ k: "bill:moon:b1", base: 0, put: { id: "b1", instructorId: "moon", cohortName: "5기", fee: 1000000, phone: "010-1111-2222", contactName: "문OO", masterMemo: "메모", requestedAt: Date.now(), paidAt: "2026-10-01" } }]);
  useJar({});
  j = await boot();
  const pubM = docOf(j, "meta");
  ok(!("staff" in pubM) && !("affiliates" in pubM) && !("affPayouts" in pubM) && !("adminLog" in pubM) && !("affSettings" in pubM) && !JSON.stringify(j).includes("pt-pw1") && !JSON.stringify(j).includes("mgr-pw1"), "방문자: 운영자 · 파트너 계정(비밀번호)과 지급 · 운영 기록이 안 보임", Object.keys(pubM));
  useJar({ dc_a: auth.sign({ r: "instructor", iid: "choi" }) });
  j = await boot();
  const insM = docOf(j, "meta");
  ok(!("staff" in insM) && !("affiliates" in insM) && Object.keys(insM.contracts || {}).join() === "choi", "강사: 운영자 · 파트너 계정은 안 보이고 서류는 자기 것만", { k: Object.keys(insM), c: Object.keys(insM.contracts || {}) });
  useJar({});
  r = await call("auth", { body: { action: "admin", tab: "partner", id: "ptest", pw: "nope" } });
  ok(r.json.error === "notfound", "파트너: 비밀번호가 틀리면 거절", r.json);
  r = await call("auth", { body: { action: "admin", tab: "partner", id: "PTEST", pw: "pt-pw1" } });
  ok(r.json.ok && r.json.role === "partner" && r.json.pid === "aff-t", "파트너 로그인 (서버에서 확인)", r.json);
  j = await boot();
  const ptM = docOf(j, "meta"), bl = docOf(j, "bill:moon:b1");
  ok(j.me.admin && j.me.admin.role === "partner" && ptM.affiliates.length === 1 && ptM.affiliates[0].id === "aff-t" && Object.keys(ptM.affPayouts).join() === "aff-t:2026-09" && !("staff" in ptM), "파트너: 내 계정 · 내 지급 기록만", { me: j.me.admin, a: ptM.affiliates.map((x) => x.id), p: Object.keys(ptM.affPayouts || {}) });
  ok(bl && bl.fee === 1000000 && !bl.phone && !bl.contactName && !bl.masterMemo, "파트너: 연결된 강사의 이용료 신청은 금액만 (연락처 · 메모 빼고)", bl);
  ptM.affiliates[0].bank = "카카오뱅크"; ptM.affiliates[0].rs = 99; ptM.affiliates[0].status = "active"; ptM.affiliates[0].instructors = [{ iid: "moon" }, { iid: "choi" }]; ptM.flags = { hacked: true };
  await sync([{ k: "meta", base: verOf(j, "meta"), put: ptM }]);
  await sync([{ k: "inq:pq1", base: 0, put: { name: "추천 강사", phone: "010-3333-4444", course: "쇼핑몰", affId: "aff-x", byPartner: true, status: "won", thread: [{ by: "master", text: "가짜", name: "x" }] } }]);
  useJar({ dc_a: auth.sign({ r: "master" }) });
  j = await boot();
  const afT = docOf(j, "meta").affiliates.find((x) => x.id === "aff-t"), q1 = docOf(j, "inq:pq1");
  ok(afT.bank === "카카오뱅크" && afT.rs === 20 && afT.instructors.length === 1 && !(docOf(j, "meta").flags || {}).hacked, "파트너: 계좌는 고쳐지고 RS · 담당 강사 · 다른 설정은 그대로", afT);
  ok(q1 && q1.affId === "aff-t" && q1.status === "new" && q1.thread[0].by === "partner", "파트너 추천: 내 추천으로만 · 상태는 ‘새 문의’", q1);
  useJar({});
  r = await call("auth", { body: { action: "admin", tab: "master", id: "mgr", pw: "mgr-pw1" } });
  ok(r.json.ok && r.json.role === "master" && r.json.staffId === "st1", "운영자 계정 로그인 (마스터 탭)", r.json);
  j = await boot();
  ok(j.me.admin && j.me.admin.staffId === "st1", "운영자 세션", j.me.admin);
  useJar({});
  r = await call("auth", { body: { action: "admin", tab: "master", id: "old", pw: "old-pw1" } });
  ok(r.json.error === "paused-staff", "멈춘 운영자 계정은 거절", r.json);
  delete process.env.MASTER_PASSWORD;

  console.log("16-1) 여러 강의를 맡은 코치 (테스트 코치 김하나: 문대표 · 초이)");
  useJar({});
  r = await call("auth", { body: { action: "admin", tab: "coach", id: "김 하나", pw: "1004" } });
  ok(r.json.choose && r.json.courses.length === 2 && r.json.courses.map((x) => x.iid).sort().join() === "choi,moon" && !jar.dc_a && !JSON.stringify(r.json).includes("1004"), "강의 2개를 맡은 코치: 바로 로그인하지 않고 강의 목록 (쿠키 없음 · 뒷자리 안 보냄)", r.json);
  ok(r.json.courses.every((x) => x.ins && x.title && typeof x.perms === "number"), "목록: 강사 이름 · 강의 이름 · 맡은 메뉴 수", r.json.courses);
  r = await call("auth", { body: { action: "admin", tab: "coach", id: "김하나", pw: "1004", iid: "logic" } });
  ok(r.json.error === "notfound" && !jar.dc_a, "맡지 않은 강의를 보내면 거절", r.json);
  r = await call("auth", { body: { action: "admin", tab: "coach", id: "김하나", pw: "9999" } });
  ok(r.json.error === "notfound" && !r.json.courses, "뒷자리가 틀리면 목록도 안 보여요", r.json);
  r = await call("auth", { body: { action: "admin", tab: "coach", id: "김하나", pw: "1004", iid: "choi" } });
  ok(r.json.ok && r.json.role === "coach" && r.json.iid === "choi" && r.json.cid === "coach-hana" && jar.dc_a, "고른 강의(초이)로 로그인", r.json);
  j = await boot();
  ok(j.me.admin && j.me.admin.role === "coach" && j.me.admin.iid === "choi" && !(j.docs || []).some((d) => /^stu:moon:/.test(d[0])) && (j.docs || []).some((d) => d[0] === "ins:choi"), "세션: 초이 강의 코치 (문대표 수강생은 안 내려와요)", j.me.admin);
  r = await call("auth", { body: { action: "coachSwitch" } });
  ok(r.json.ok && r.json.cur === "choi" && r.json.courses.length === 2, "코치센터: 맡은 강의 목록 다시 받기", r.json);
  r = await call("auth", { body: { action: "coachSwitch", iid: "logic" } });
  ok(r.json.error === "notfound", "맡지 않은 강의로는 못 옮겨요", r.json);
  r = await call("auth", { body: { action: "coachSwitch", iid: "moon" } });
  ok(r.json.ok && r.json.iid === "moon" && r.json.cid === "coach1", "다른 강의(문대표)로 옮기기", r.json);
  j = await boot();
  ok(j.me.admin && j.me.admin.role === "coach" && j.me.admin.iid === "moon" && j.me.admin.cid === "coach1", "옮긴 뒤 세션: 문대표 강의 코치", j.me.admin);
  useJar({ dc_a: auth.sign({ r: "instructor", iid: "choi" }) });
  r = await call("auth", { body: { action: "coachSwitch", iid: "moon" } });
  ok(r.status === 403, "코치가 아니면 강의 옮기기를 못 써요", r.json);
  // 한 강의의 코치 자리를 멈추면 남은 강의로 바로 로그인 · 둘 다 멈추면 거절
  useJar({ dc_a: auth.sign({ r: "master" }) });
  j = await boot();
  const choiIns = docOf(j, "ins:choi");
  choiIns.coaches.find((x) => x.id === "coach-hana").status = "paused";
  await sync([{ k: "ins:choi", base: verOf(j, "ins:choi"), put: choiIns }]);
  useJar({});
  r = await call("auth", { body: { action: "admin", tab: "coach", id: "김하나", pw: "1004" } });
  ok(r.json.ok && r.json.iid === "moon" && !r.json.choose, "초이 코치 자리를 멈추면 → 남은 문대표 강의로 바로 로그인", r.json);
  useJar({ dc_a: auth.sign({ r: "master" }) });
  j = await boot();
  const moonIns = docOf(j, "ins:moon");
  moonIns.coaches.find((x) => x.id === "coach1").status = "paused";
  await sync([{ k: "ins:moon", base: verOf(j, "ins:moon"), put: moonIns }]);
  useJar({});
  r = await call("auth", { body: { action: "admin", tab: "coach", id: "김하나", pw: "1004" } });
  ok(r.json.error === "paused-coach" && !jar.dc_a, "맡은 강의가 모두 멈추면 ‘사용 중지’ 안내", r.json);
  useJar({ dc_a: auth.sign({ r: "master" }) });
  j = await boot();
  const ci2 = docOf(j, "ins:choi"), mi2 = docOf(j, "ins:moon");
  ci2.coaches.find((x) => x.id === "coach-hana").status = "active"; mi2.coaches.find((x) => x.id === "coach1").status = "active";
  await sync([{ k: "ins:choi", base: verOf(j, "ins:choi"), put: ci2 }, { k: "ins:moon", base: verOf(j, "ins:moon"), put: mi2 }]);
  useJar({});

  console.log("17) AI 조교 (문대표 학습 자료 + Claude)");
  useJar({});
  r = await call("ai-tutor", { body: { iid: "moon", q: "운송료 얼마예요?" } });
  ok(r.status === 403, "AI 조교: 로그인 안 하면 못 써요", r.json);
  useJar({ dc_a: auth.sign({ r: "instructor", iid: "choi" }) });
  r = await call("ai-tutor", { body: { iid: "moon", q: "운송료 얼마예요?" } });
  ok(r.status === 403, "AI 조교: 다른 강사는 문대표 조교를 못 써요", r.json);
  useJar({ dc_s: auth.sign({ r: "student", sid: "s1", iid: "moon" }) });
  r = await call("ai-tutor", { body: { iid: "moon", q: "1kg 넘으면 국제 운송료 얼마예요?" } });
  ok(r.json.ok && r.json.src === "kb" && /\$16/.test(r.json.text) && !AI.reqs.length, "키가 없으면: 학습 자료에서 찾은 답 (운송료 $16)", r.json);
  r = await call("ai-tutor", { body: { iid: "moon", q: "화성 날씨 알려줘" } });
  ok(r.json.ok && r.json.src === "kb" && /1:1 요청/.test(r.json.text), "학습 자료에 없으면 지어내지 않고 1:1 요청 안내", r.json);
  Object.assign(process.env, { ANTHROPIC_API_KEY: "sk-test", AI_TUTOR_MODEL: "tutor-test-model" });
  r = await call("ai-tutor", { body: { iid: "moon", q: "운송료 얼마예요?", history: [{ from: "bot", text: "반가워요" }, { from: "me", text: "안녕" }, { from: "bot", text: "안녕하세요!" }, { from: "me", text: "질문 있어요" }] } });
  const aq = AI.reqs[AI.reqs.length - 1] || { h: {}, body: {} }, sys = ((aq.body.system || [])[0]) || {};
  ok(r.json.ok && r.json.src === "ai" && /\$16/.test(r.json.text), "키가 있으면 Claude가 답해요", r.json);
  ok(aq.body.model === "tutor-test-model" && aq.body.fallbacks === "default" && /server-side-fallback-2026-07-01/.test(aq.h["anthropic-beta"] || "") && aq.body.output_config && aq.body.output_config.effort === "low", "모델은 환경 변수 · 거절 대비(fallbacks) · effort low", { m: aq.body.model, b: aq.h["anthropic-beta"], f: aq.body.fallbacks, o: aq.body.output_config });
  ok(sys.cache_control && sys.cache_control.type === "ephemeral" && /06-0145-0847640-00/.test(sys.text) && /언더밸류/.test(sys.text) && /자주 묻는 질문/.test(sys.text), "시스템 프롬프트: 문대표 학습 자료 + 강의 FAQ + 법 지키는 규칙 (캐시)", (sys.text || "").length);
  const ms = aq.body.messages || [];
  ok(ms.length === 3 && ms[0].role === "user" && ms[1].role === "assistant" && ms[2].role === "user" && ms[2].content === "운송료 얼마예요?" && /질문 있어요/.test(ms[0].content) === false, "대화: 사용자부터 · 번갈아 · 마지막은 지금 질문", ms);
  AI.next = { status: 200, body: { id: "msg_r", type: "message", role: "assistant", content: [], stop_reason: "refusal", usage: { input_tokens: 1, output_tokens: 0 } } };
  r = await call("ai-tutor", { body: { iid: "moon", q: "운송료" } });
  ok(r.json.ok && /답하기 어려워요/.test(r.json.text), "Claude가 거절하면 1:1 요청 안내", r.json);
  AI.next = { status: 401, body: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } };
  const errLog = console.error; console.error = () => {};
  r = await call("ai-tutor", { body: { iid: "moon", q: "국제 운송료 1kg 얼마예요?" } });
  console.error = errLog;
  ok(r.json.ok && r.json.src === "kb" && /\$16/.test(r.json.text), "키가 틀리면(401) 학습 자료 답으로", r.json);
  AI.next = null; delete process.env.ANTHROPIC_API_KEY; delete process.env.AI_TUTOR_MODEL;
  let n429 = 0;
  for (let i = 0; i < 26; i++) { r = await call("ai-tutor", { body: { iid: "moon", q: "운송료" } }); if (r.status === 429) n429++; }
  ok(n429 === 1 && r.status === 429, "한 사람당 15분에 30번까지", { n429, last: r.status });

  console.log("18) CRM 실제 발송 (솔라피 · Resend)");
  const st18 = require(path.join(TMP, "class/api/_lib/store.js"));
  const mkM = (id, o) => st18.writeDoc("vm:" + id, Object.assign({ id, name: "회원" + id, email: id + "@ex.com", phone: "010-1234-" + id.slice(-4), marketing: true, consent: { mkt: true, ch: ["sms", "email", "kakao"], night: false, at: Date.now() } }, o));
  await mkM("cm-0001", {}); await mkM("cm-0002", { consent: { mkt: false, ch: [], at: Date.now() }, marketing: false }); await mkM("cm-0003", { consent: { mkt: true, ch: ["email"], at: Date.now() } }); await mkM("cm-0004", { phone: "" });
  const MIDS = ["cm-0001", "cm-0002", "cm-0003", "cm-0004"];
  useJar({});
  r = await call("admin", { body: { action: "msg-status" } });
  ok(r.status === 403, "발송: 마스터만", r.json);
  useJar({ dc_a: auth.sign({ r: "master" }) });
  r = await call("admin", { body: { action: "msg-status" } });
  ok(r.json.ok && !r.json.cfg.sms && !r.json.cfg.email && !r.json.cfg.alim, "키가 없으면 모든 채널 ‘연결 전’", r.json.cfg);
  r = await call("admin", { body: { action: "msg-send", ch: "sms", mids: MIDS, text: "{이름}님 쿠폰 드려요" } });
  ok(r.status === 409 && !SOL.length, "연결 전 채널로는 보내지 않아요", r.json);
  Object.assign(process.env, { SOLAPI_API_KEY: "sk-sol", SOLAPI_API_SECRET: "sec-sol", SOLAPI_SENDER: "0212345678", SOLAPI_PFID: "KA01PF-test", RESEND_API_KEY: "re-test", MAIL_FROM: "두고클래스 <hello@doogoclass.com>" });
  r = await call("admin", { body: { action: "msg-status" } });
  ok(r.json.cfg.sms && r.json.cfg.alim && r.json.cfg.brand && r.json.cfg.email && r.json.cfg.sender === "02-****-5678" && !JSON.stringify(r.json).includes("sec-sol") && !JSON.stringify(r.json).includes("re-test"), "키를 넣으면 연결됨 (비밀 값 · 발신번호는 가림)", r.json.cfg);
  r = await call("admin", { body: { action: "msg-send", ch: "sms", mids: MIDS, text: "{이름}님 이번 주 쿠폰 드려요" } });
  ok(r.status === 409 && /080/.test(r.json.message), "광고 문자는 080 수신거부 번호가 있어야 보내요", r.json);
  const mt18 = await st18.getDoc("meta"); const mv = mt18.v; mv.vod = mv.vod || {}; mv.vod.crm = Object.assign({}, mv.vod.crm, { send: { optout: "080-123-4567", targeting: "I" } }); await st18.writeDoc("meta", mv, mt18.ver);
  const KST = (h) => { const d = new Date(); d.setUTCHours(h - 9, 0, 0, 0); return d.getTime() + 864e5; }; // 내일 한국 시간 h시
  r = await call("admin", { body: { action: "msg-send", ch: "sms", mids: MIDS, text: "{이름}님 이번 주 쿠폰 드려요", at: KST(11) } });
  const sm = (SOL[SOL.length - 1] || { body: { messages: [] } }), m1 = sm.body.messages[0] || {};
  ok(r.json.ok && r.json.sent === 1 && sm.body.messages.length === 1 && m1.to === "01012340001" && m1.from === "0212345678" && /^\(광고\) 회원cm-0001님/.test(m1.text) && /080-123-4567/.test(m1.text) && !!sm.body.scheduledDate, "문자: 동의한 회원만 · (광고) · 080 수신거부 · 예약", { r: r.json, m1, sd: sm.body.scheduledDate });
  ok(r.json.skip["소식 받기 미동의"] === 1 && r.json.skip["이 채널 미동의"] === 1 && r.json.skip["휴대폰 번호 없음"] === 1, "못 보낸 이유를 서버가 다시 세요", r.json.skip);
  ok(/^HMAC-SHA256 apiKey=sk-sol, date=[^,]+, salt=[0-9a-f]+, signature=[0-9a-f]{64}$/.test(sm.auth), "솔라피 인증 헤더 (HMAC-SHA256)", sm.auth.replace(/signature=.*/, "signature=…"));
  r = await call("admin", { body: { action: "msg-send", ch: "brand", mids: MIDS, text: "{이름}님 소식", at: KST(22) } });
  ok(r.status === 409 && /08:00/.test(r.json.message), "브랜드 메시지: 밤 8시 50분 ~ 아침 8시는 막아요", r.json);
  r = await call("admin", { body: { action: "msg-send", ch: "brand", mids: MIDS, text: "{이름}님 소식", at: KST(10) } });
  const bm = (SOL[SOL.length - 1].body.messages || [])[0] || {};
  ok(r.json.sent === 1 && bm.type === "BMS_TEXT" && bm.kakaoOptions.pfId === "KA01PF-test" && bm.kakaoOptions.bms.targeting === "I", "브랜드 메시지: BMS_TEXT · 채널 pfId · 대상 I", bm);
  r = await call("admin", { body: { action: "msg-send", ch: "alim", mids: MIDS, text: "#{이름}님, 결제가 완료됐어요." } });
  ok(r.status === 409 && /템플릿/.test(r.json.message), "알림톡은 템플릿 ID 없이 못 보내요", r.json);
  r = await call("admin", { body: { action: "msg-send", ch: "alim", mids: MIDS, text: "#{이름}님, 결제가 완료됐어요.", templateId: "TPL01" } });
  const am = (SOL[SOL.length - 1].body.messages || []);
  ok(r.json.sent === 3 && am.length === 3 && am[0].type === "ATA" && am[0].kakaoOptions.templateId === "TPL01" && am[0].kakaoOptions.variables["#{이름}"] === "회원cm-0001" && !/광고/.test(am[0].text), "알림톡: 정보성이라 동의와 상관없이 · 템플릿 변수 채움", am[0]);
  r = await call("admin", { body: { action: "msg-send", ch: "email", mids: MIDS, text: "{이름}님 새 강의 소식", subject: "{이름}님 새 강의" } });
  const em = (RES[RES.length - 1] || { body: [] }).body;
  ok(r.json.sent === 3 && em.length === 3 && /^\(광고\) 회원cm-0001님 새 강의$/.test(em[0].subject) && em[0].from === "두고클래스 <hello@doogoclass.com>" && /수신 거부|소식 받기/.test(em[0].html) && RES[RES.length - 1].auth === "Bearer re-test", "이메일: 이메일 동의 회원 3명(휴대폰 없어도) · 제목 (광고) · 수신 거부 안내", { n: em.length, s: em[0] && em[0].subject });
  ["SOLAPI_API_KEY", "SOLAPI_API_SECRET", "SOLAPI_SENDER", "SOLAPI_PFID", "RESEND_API_KEY", "MAIL_FROM"].forEach((k) => delete process.env[k]);

  console.log("\n가상계좌 · 계좌이체 · 환불 계좌 · 포트원 결제 조회");
  const MASTER = auth.sign({ r: "master" });
  process.env.PORTONE_VBANK = "1"; process.env.PORTONE_TRANSFER = "1";
  r = await call("vod-config", { method: "GET" });
  ok(r.json.cfg.portone.channels.vbank === "channel-key-card" && r.json.cfg.portone.channels.transfer === "channel-key-card" && r.json.cfg.portone.vbankHours === 72, "설정: PORTONE_VBANK · PORTONE_TRANSFER=1 → 카드 채널로 가상계좌 · 계좌이체", r.json.cfg.portone);
  delete process.env.PORTONE_VBANK;
  r = await call("vod-config", { method: "GET" });
  ok(!r.json.cfg.portone.channels.vbank, "설정을 빼면 가상계좌는 다시 닫혀요");
  delete jar.dc_v; delete jar.dc_a;
  await store.rlClear(["vip:1.2.3.4"]); // 같은 IP 로 가입을 여러 번 해서
  r = await call("vod-auth", { body: { action: "signup", email: "va@example.com", pw: "test1234a", pw2: "test1234a", name: "가상OO", phone: "010-0000-7777", agree: true } });
  ok(r.json.ok && r.json.member, "가상계좌 테스트 회원 가입", r.json);
  const vaMid = r.json.member.id;
  { const vc = jar.dc_v; delete jar.dc_v; jar.dc_a = MASTER; const jm = await boot(); await sync([{ k: "vm:" + vaMid, base: verOf(jm, "vm:" + vaMid), ops: [{ p: ["points"], v: 3000 }] }]); delete jar.dc_a; jar.dc_v = vc; }
  r = await call("vod-pay", { body: { action: "prepare", pid: "v5", kind: "course", plan: 365, points: 1000, method: "vbank" } });
  ok(r.status === 409, "가상계좌가 닫혀 있으면 결제 준비 거절", r.json);
  process.env.PORTONE_VBANK = "1";
  r = await call("vod-pay", { body: { action: "prepare", pid: "v5", kind: "course", plan: 365, points: 1000, method: "vbank" } });
  ok(r.json.ok && r.json.paymentId && r.json.amount > 0, "가상계좌 결제 준비 (포인트 1,000 사용)", r.json);
  const vaP = r.json.paymentId, vaN = r.json.no, vaAmt = r.json.amount, VA_EXP = "2026-11-02T23:59:59+09:00";
  PG[vaP] = { id: vaP, status: "VIRTUAL_ACCOUNT_ISSUED", storeId: "store-test", transactionId: "tx_" + vaP, currency: "KRW", amount: { total: vaAmt, paid: 0, cancelled: 0 }, method: { type: "PaymentMethodVirtualAccount", bank: "SHINHAN", accountNumber: "56211234567890", remitteeName: "(주)두고홀딩스", expiredAt: VA_EXP } };
  r = await call("vod-pay", { body: { action: "complete", paymentId: vaP } });
  const vaO0 = (r.json.orders || [])[0] || {};
  ok(r.json.ok && r.json.vbank && vaO0.status === "pending" && vaO0.method === "vbank" && vaO0.vbank.account === "56211234567890" && vaO0.vbank.bank === "SHINHAN" && vaO0.dueAt === Date.parse(VA_EXP), "발급 → 입금 대기 · 은행 · 계좌 · 입금 기한(포트원 만료 시각)", r.json);
  r = await call("vod-auth", { body: { action: "me" } });
  ok(r.json.member.points === 2000, "발급 때 포인트를 써 둬요 (다른 주문에 또 못 써요)", r.json.member.points);
  r = await call("vod-pay", { body: { action: "complete", paymentId: vaP } });
  ok(r.json.ok && r.json.vbank, "발급 확인이 두 번 와도 그대로");
  jar.dc_a = MASTER;
  r = await call("vod-pay", { body: { action: "bankOk", no: vaN } });
  ok(r.status === 409 && /자동/.test(r.json.message), "가상계좌는 마스터가 직접 입금 확인 못 해요 (포트원이 알려 줘요)", r.json);
  delete jar.dc_a;
  const vaWi = JSON.stringify({ type: "Transaction.VirtualAccountIssued", data: { paymentId: vaP, storeId: "store-test" } });
  r = await call("vod-pay", { raw: vaWi, headers: sign(vaWi) });
  ok(r.status === 200, "가상계좌 발급 웹훅 받기");
  Object.assign(PG[vaP], { status: "PAID", receiptUrl: "https://r/" + vaP }); PG[vaP].amount.paid = vaAmt;
  const vaWp = JSON.stringify({ type: "Transaction.Paid", data: { paymentId: vaP, storeId: "store-test" } });
  r = await call("vod-pay", { raw: vaWp, headers: sign(vaWp) });
  r = await call("vod-pay", { body: { action: "orders" } });
  const vaO = r.json.orders.find((o) => o.no === vaN);
  ok(vaO.status === "paid" && vaO.pg.st === "paid" && vaO.vbank && vaO.paidAt > 0 && vaO.pg.receiptUrl === "https://r/" + vaP, "입금 웹훅 → 결제 완료 (계좌 정보 · 영수증 남김)", vaO);
  r = await call("vod-auth", { body: { action: "me" } });
  ok(r.json.member.points === 2000, "입금돼도 포인트는 한 번만 빠져요", r.json.member.points);
  r = await call("vod-pay", { body: { action: "cancel", no: vaN } });
  ok(r.status === 409 && /가상계좌/.test(r.json.message), "가상계좌 결제는 바로 취소 대신 환불 요청 (환불 계좌 필요)", r.json);
  let vaJ = await boot();
  r = await sync([{ k: "vo:" + vaN, base: verOf(vaJ, "vo:" + vaN), ops: [{ p: ["refundReq"], v: { why: "단순 변심", text: "", acct: { bank: "KOOKMIN", number: "123-456-78901", holder: "가상OO", evil: "x" } } }] }]);
  vaJ = await boot();
  const vaRq = (docOf(vaJ, "vo:" + vaN) || {}).refundReq || {};
  ok(vaRq.acct && vaRq.acct.bank === "KOOKMIN" && vaRq.acct.number === "12345678901" && vaRq.acct.holder === "가상OO" && !vaRq.acct.evil, "회원 환불 요청: 돌려받을 계좌 (숫자만 · 다른 칸은 버림)", vaRq);
  jar.dc_a = MASTER;
  r = await call("vod-pay", { body: { action: "refund", no: vaN, amount: vaAmt, reason: "단순 변심" } });
  ok(r.status === 400 && /계좌/.test(r.json.message), "가상계좌 환불: 환불 계좌가 없으면 거절", r.json);
  r = await call("vod-pay", { body: { action: "refund", no: vaN, amount: vaAmt, reason: "단순 변심", refundAccount: { bank: "NOPE", number: "123", holder: "" } } });
  ok(r.status === 400, "가상계좌 환불: 이상한 계좌는 거절");
  r = await call("vod-pay", { body: { action: "refund", no: vaN, amount: vaAmt, reason: "단순 변심", refundAccount: vaRq.acct } });
  const vaLc = PG[vaP].lastCancel || {};
  ok(r.json.ok && vaLc.amount === vaAmt && vaLc.refundAccount && vaLc.refundAccount.bank === "KOOKMIN" && vaLc.refundAccount.number === "12345678901" && vaLc.refundAccount.holderName === "가상OO" && r.json.order.status === "refunded", "가상계좌 환불: 포트원에 환불 계좌(표준 은행 코드 · 예금주)로 원클릭 취소", { r: r.json, vaLc });
  r = await call("vod-pay", { body: { action: "pgInfo", no: vaN } });
  ok(r.json.ok && r.json.pay.status === "CANCELLED" && r.json.pay.method.type === "vbank" && r.json.pay.method.account === "56211234567890" && r.json.pay.amount.cancelled === vaAmt && r.json.pay.receiptUrl, "포트원 결제 조회: 상태 · 결제수단(가상계좌) · 취소 금액 · 영수증", r.json);
  delete jar.dc_a;
  // 입금 전 주문 취소 → 포트원 가상계좌 말소
  r = await call("vod-auth", { body: { action: "me" } });
  const vaPt0 = r.json.member.points;
  ok(vaPt0 === 3000, "가상계좌 전액 환불 → 써 둔 포인트 1,000을 돌려받아요 (환불 규정)", vaPt0);
  r = await call("vod-pay", { body: { action: "prepare", pid: "v6", kind: "course", plan: 180, points: 500, method: "vbank" } });
  const vaP2 = r.json.paymentId, vaN2 = r.json.no;
  PG[vaP2] = { id: vaP2, status: "VIRTUAL_ACCOUNT_ISSUED", storeId: "store-test", transactionId: "tx_" + vaP2, currency: "KRW", amount: { total: r.json.amount, paid: 0, cancelled: 0 }, method: { type: "PaymentMethodVirtualAccount", bank: "WOORI", accountNumber: "1002000000001", remitteeName: "두고", expiredAt: VA_EXP } };
  r = await call("vod-pay", { body: { action: "complete", paymentId: vaP2 } });
  r = await call("vod-auth", { body: { action: "me" } });
  ok(r.json.member.points === vaPt0 - 500, "두 번째 가상계좌: 발급 때 포인트 500을 써 둬요", r.json.member.points);
  r = await call("vod-pay", { body: { action: "cancelPending", no: vaN2 } });
  r = await call("vod-pay", { body: { action: "orders" } });
  ok(r.json.orders.find((o) => o.no === vaN2).status === "canceled" && PG[vaP2].closed && calls.indexOf("POST api.portone.io/payments/" + vaP2 + "/virtual-account/close") >= 0, "입금 전 취소 → 주문 취소 · 포트원 가상계좌 말소 (취소 뒤 입금 안 되게)");
  r = await call("vod-auth", { body: { action: "me" } });
  ok(r.json.member.points === vaPt0, "입금 전 취소하면 써 둔 포인트 500을 돌려받아요", r.json.member.points);
  // 실시간 계좌이체: 카드처럼 바로 결제 완료
  r = await call("vod-pay", { body: { action: "prepare", pid: "v6", kind: "course", plan: 180, method: "transfer" } });
  const vaPt = r.json.paymentId, vaNt = r.json.no; paidLike(vaPt, r.json.amount); PG[vaPt].method = { type: "PaymentMethodTransfer", bank: "KAKAO" };
  r = await call("vod-pay", { body: { action: "complete", paymentId: vaPt } });
  ok(r.json.ok && r.json.orders[0].status === "paid" && r.json.orders[0].method === "transfer", "실시간 계좌이체 → 바로 결제 완료", r.json);
  // 포트원 콘솔에서 직접 취소한 결제 (웹훅을 놓친 경우) → 결제 조회로 맞춰요
  PG[vaPt].status = "CANCELLED"; PG[vaPt].amount.cancelled = PG[vaPt].amount.total;
  jar.dc_a = MASTER;
  r = await call("vod-pay", { body: { action: "pgInfo", no: vaNt } });
  ok(r.json.ok && /환불로 맞췄어요/.test(r.json.synced) && r.json.pay.method.type === "transfer", "결제 조회: 포트원은 취소인데 주문이 결제 완료면 환불로 맞춰요", r.json);
  r = await call("vod-pay", { body: { action: "pgInfo", no: vaN2 } });
  ok(r.json.ok && r.json.pay.status === "VIRTUAL_ACCOUNT_ISSUED" && !r.json.synced, "결제 조회: 취소한 가상계좌 주문은 그대로", r.json);
  // 취소를 누른 순간 이미 입금됐으면 (가상계좌 말소가 거절돼요) 취소하지 않고 결제 완료로 — 회원 취소 · 마스터 취소 둘 다
  const vaRace = async (pid, how) => {
    let q = await call("vod-pay", { body: { action: "prepare", pid, kind: "course", plan: 180, method: "vbank" } });
    const p = q.json.paymentId, no = q.json.no, amt = q.json.amount;
    PG[p] = { id: p, status: "VIRTUAL_ACCOUNT_ISSUED", storeId: "store-test", transactionId: "tx_" + p, currency: "KRW", amount: { total: amt, paid: 0, cancelled: 0 }, method: { type: "PaymentMethodVirtualAccount", bank: "KAKAO", accountNumber: "7979000000001", remitteeName: "두고", expiredAt: VA_EXP } };
    await call("vod-pay", { body: { action: "complete", paymentId: p } });
    Object.assign(PG[p], { status: "PAID", amount: { total: amt, paid: amt, cancelled: 0 } }); // 웹훅이 오기 전에 입금
    q = how === "member" ? await call("vod-pay", { body: { action: "cancelPending", no } }) : await call("vod-pay", { body: { action: "bankCancel", no } });
    const d = await store.getDoc("vo:" + no); return { q, o: (d && d.v) || {} };
  };
  let vr = await vaRace("v6", "member");
  ok(vr.q.status === 409 && /입금이 확인돼/.test(vr.q.json.message) && vr.o.status === "paid" && !PG[vr.o.paymentId].closed, "회원 입금 전 취소 · 그 사이 입금됨 → 취소하지 않고 결제 완료로 (수강 열림)", { q: vr.q.json, st: vr.o.status });
  vr = await vaRace("v5", "master");
  ok(vr.q.status === 409 && /입금이 확인돼/.test(vr.q.json.message) && vr.o.status === "paid", "마스터 입금 전 취소 · 그 사이 입금됨 → 취소하지 않고 결제 완료로", { q: vr.q.json, st: vr.o.status });
  delete jar.dc_a; delete jar.dc_v;
  r = await call("vod-pay", { body: { action: "pgInfo", no: vaN } });
  ok(r.status === 403, "결제 조회는 마스터만");
  delete process.env.PORTONE_VBANK; delete process.env.PORTONE_TRANSFER;

  console.log("\n19) 종이책 (택배 배송) · 전자책 내려받기 기록");
  useJar({ dc_a: auth.sign({ r: "master" }) });
  r = await call("vod-pay", { body: { action: "catalog", catalog: { products: [
    { id: "b1", title: "내 인생의 추월차선은 내가 만든다", type: "book", status: "on", price: 15900, sale: null, iid: "moon", shipFee: 0, stock: 3 },
    { id: "b2", title: "배송비 있는 책", type: "book", status: "on", price: 12000, sale: 10800, shipFee: 3000 },
    { id: "v10", title: "전자책", type: "ebook", status: "on", price: 39000, sale: 29000 }],
    coupons: [{ id: "cp-welcome", code: "WELCOME", name: "신규 5천", kind: "won", value: 5000, days: 30, auto: "signup", on: true }], settings: { refund: { instant: true, days: 7, maxUsed: 0 } }, biz: {} } } });
  ok(r.json.ok && r.json.n === 3, "카탈로그: 종이책 (배송비 · 재고 칸 포함)", r.json);
  const catDoc = (await store.getDoc("vcat")).v;
  ok(catDoc.products[0].shipFee === 0 && catDoc.products[0].stock === 3 && catDoc.products[1].shipFee === 3000, "가격표에 배송비 · 재고가 남아요", catDoc.products);
  useJar({});
  r = await call("vod-auth", { body: { action: "signup", email: "book@example.com", pw: "book1234a", pw2: "book1234a", name: "책OO", phone: "010-1234-5678", agree: true } });
  ok(r.json.ok && jar.dc_v, "종이책 회원 가입", r.json);
  const bkMid = r.json.member.id, bkCp = r.json.member.coupons[0].id;
  const SHIP = { name: "책OO", phone: "010-1234-5678", zip: "06234", addr1: "서울 강남구 테헤란로 123", addr2: "4층", memo: "문 앞에 놓아 주세요" };
  r = await call("vod-pay", { body: { action: "prepare", pid: "b1", kind: "course", qty: 1, method: "card" } });
  ok(r.status === 409 && /주소/.test(r.json.message), "배송지 없이 주문 막기", r.json);
  r = await call("vod-pay", { body: { action: "prepare", pid: "b1", kind: "course", qty: 1, method: "card", ship: Object.assign({}, SHIP, { phone: "123" }) } });
  ok(r.status === 409, "휴대폰 번호가 이상하면 막기", r.json);
  r = await call("vod-pay", { body: { action: "prepare", pid: "b1", kind: "course", qty: 11, method: "card", ship: SHIP } });
  ok(r.status === 409 && /10권/.test(r.json.message), "한 번에 10권까지", r.json);
  r = await call("vod-pay", { body: { action: "prepare", pid: "b1", kind: "coach", method: "card", ship: SHIP } });
  ok(r.status === 409, "종이책에는 추가 상품(코칭권 등) 없음", r.json);
  r = await call("vod-pay", { body: { action: "prepare", pid: "b1", kind: "course", qty: 2, method: "card", mcid: bkCp, ship: SHIP, expect: 31800 } });
  ok(r.json.ok && r.json.amount === 31800 && /2권/.test(r.json.orderName), "15,900원 × 2권 · 무료배송 · 쿠폰은 안 써요(도서정가제) = 31,800원", r.json);
  const bp1 = r.json.paymentId, bno1 = r.json.no;
  paidLike(bp1, 31800);
  r = await call("vod-pay", { body: { action: "complete", paymentId: bp1 } });
  let bo = (await store.getDoc("vo:" + bno1)).v;
  ok(r.json.ok && bo.status === "paid" && bo.qty === 2 && bo.unit === 15900 && bo.sale === 31800 && bo.shipFee === 0 && bo.ship.st === "ready" && bo.ship.addr1 === SHIP.addr1 && !bo.mcid && !bo.couponOff, "결제 완료: 수량 · 배송지 · 배송 상태(결제 완료) 저장 · 쿠폰 안 씀", bo);
  ok(((await store.getDoc("vm:" + bkMid)).v.coupons[0] || {}).usedAt == null, "쓰지 않은 쿠폰은 그대로", (await store.getDoc("vm:" + bkMid)).v.coupons);
  ok((((await store.getDoc("vstat")).v.sold) || {}).b1 === 2, "판매 수는 권수만큼 (2권)", (await store.getDoc("vstat")).v.sold);
  r = await call("vod-pay", { body: { action: "prepare", pid: "b2", kind: "course", qty: 1, method: "card", ship: SHIP, points: 0, expect: 13800 } });
  ok(r.json.ok && r.json.amount === 13800, "할인가 10,800원 + 배송비 3,000원 = 13,800원", r.json);
  r = await call("vod-pay", { body: { action: "prepare", pid: "b1", kind: "course", qty: 2, method: "card", ship: SHIP } });
  ok(r.status === 409 && /1권/.test(r.json.message), "재고 3권 · 2권 팔림 → 2권은 막고 남은 권수를 알려 줘요", r.json);
  // 배송지 바꾸기: 보내기 전에는 회원이 바꿀 수 있고, 배송 상태 · 송장은 못 바꿔요
  j = await boot();
  r = await sync([{ k: "vo:" + bno1, base: verOf(j, "vo:" + bno1), ops: [{ p: ["ship", "addr1"], v: "서울 서초구 강남대로 1" }, { p: ["ship", "st"], v: "done" }, { p: ["ship", "inv"], v: "999" }] }]);
  bo = (await store.getDoc("vo:" + bno1)).v;
  ok(bo.ship.addr1 === "서울 서초구 강남대로 1" && bo.ship.st === "ready" && !bo.ship.inv, "회원: 보내기 전 배송지만 바꿈 (상태 · 송장은 못 바꿈)", bo.ship);
  // 회원이 기본 배송지를 저장
  r = await sync([{ k: "vm:" + bkMid, base: verOf(j, "vm:" + bkMid), ops: [{ p: ["addr"], v: Object.assign({}, SHIP, { extra: "x" }) }] }]);
  ok(((await store.getDoc("vm:" + bkMid)).v.addr || {}).addr1 === SHIP.addr1 && !("extra" in ((await store.getDoc("vm:" + bkMid)).v.addr || {})), "회원: 다음 주문용 배송지 저장 (정해진 칸만)", (await store.getDoc("vm:" + bkMid)).v.addr);
  // 보내기 전: 바로 취소 (전액)
  r = await call("vod-pay", { body: { action: "cancel", no: bno1 } });
  bo = (await store.getDoc("vo:" + bno1)).v;
  ok(r.json.ok && r.json.amount === 31800 && bo.status === "refunded" && PG[bp1].status === "CANCELLED", "보내기 전이면 회원이 바로 전액 취소 (포트원 결제 취소)", r.json);
  ok((((await store.getDoc("vstat")).v.sold) || {}).b1 === 0, "취소하면 판매 권수도 빠져요", (await store.getDoc("vstat")).v.sold);
  // 다시 주문 → 마스터가 상품 준비 중 → 회원 바로 취소 막기 · 배송지 못 바꿈
  r = await call("vod-pay", { body: { action: "prepare", pid: "b1", kind: "course", qty: 1, method: "card", ship: SHIP, expect: 15900 } });
  const bp2 = r.json.paymentId, bno2 = r.json.no; paidLike(bp2, 15900); await call("vod-pay", { body: { action: "complete", paymentId: bp2 } });
  const memJar = saveJar();
  useJar({ dc_a: auth.sign({ r: "master" }) });
  j = await boot();
  r = await sync([{ k: "vo:" + bno2, base: verOf(j, "vo:" + bno2), ops: [{ p: ["ship", "st"], v: "prep" }, { p: ["ship", "prepAt"], v: Date.now() }] }]);
  ok(((await store.getDoc("vo:" + bno2)).v.ship || {}).st === "prep", "마스터: 상품 준비 중으로", r.results);
  useJar(memJar);
  r = await call("vod-pay", { body: { action: "cancel", no: bno2 } });
  ok(r.status === 409 && /준비/.test(r.json.message), "상품 준비 중이면 바로 취소 막기 (취소 요청으로)", r.json);
  j = await boot();
  r = await sync([{ k: "vo:" + bno2, base: verOf(j, "vo:" + bno2), ops: [{ p: ["ship", "addr1"], v: "바꾸면 안 되는 주소" }] }]);
  ok((await store.getDoc("vo:" + bno2)).v.ship.addr1 === SHIP.addr1, "상품 준비 중이면 회원이 배송지를 못 바꿈", (await store.getDoc("vo:" + bno2)).v.ship);
  // 마스터 발송 → 반품 요청만
  useJar({ dc_a: auth.sign({ r: "master" }) });
  j = await boot();
  r = await sync([{ k: "vo:" + bno2, base: verOf(j, "vo:" + bno2), ops: [{ p: ["ship", "st"], v: "ship" }, { p: ["ship", "carrier"], v: "CJ대한통운" }, { p: ["ship", "inv"], v: "640012345678" }, { p: ["ship", "shipAt"], v: Date.now() }] }]);
  bo = (await store.getDoc("vo:" + bno2)).v;
  ok(bo.ship.st === "ship" && bo.ship.inv === "640012345678", "마스터: 택배사 · 송장 넣고 배송 중으로", bo.ship);
  useJar(memJar);
  r = await call("vod-pay", { body: { action: "cancel", no: bno2 } });
  ok(r.status === 409 && /반품/.test(r.json.message), "보낸 뒤에는 바로 취소 막기 (반품 요청으로)", r.json);
  j = await boot();
  r = await sync([{ k: "vo:" + bno2, base: verOf(j, "vo:" + bno2), ops: [{ p: ["refundReq"], v: { why: "파손 · 파본", text: "표지가 찢어져 왔어요" } }] }]);
  bo = (await store.getDoc("vo:" + bno2)).v;
  ok(bo.refundReq && bo.refundReq.why === "파손 · 파본" && bo.status === "paid", "회원: 반품 · 교환 요청 남기기", bo.refundReq);
  // 전자책: 서버 파일을 받아 가면 주문에 내려받은 때가 남아 바로 취소가 막혀요
  r = await call("vod-pay", { body: { action: "prepare", pid: "v10", kind: "course", method: "card", expect: 29000 } });
  const ep = r.json.paymentId, eno = r.json.no; paidLike(ep, 29000); await call("vod-pay", { body: { action: "complete", paymentId: ep } });
  useJar({ dc_a: auth.sign({ r: "master" }) });
  r = await call("file", { body: { data: "data:application/pdf;base64," + Buffer.from("%PDF-1.4 전자책 본문 " + "y".repeat(300)).toString("base64"), scope: "vodp:v10" } });
  const eh = new URL("http://x" + r.json.url).searchParams.get("h");
  useJar(memJar);
  ok(!(await store.getDoc("vo:" + eno)).v.dlAt, "전자책: 받기 전에는 내려받은 기록 없음");
  r = await call("file", { method: "GET", query: { h: eh } });
  ok(r.status === 200, "산 회원은 전자책 파일을 받아요", r.status);
  ok(!!(await store.getDoc("vo:" + eno)).v.dlAt, "전자책: 파일 주소로 받아도 서버가 주문에 내려받은 때를 남겨요");
  r = await call("vod-pay", { body: { action: "cancel", no: eno } });
  ok(r.status === 409 && /내려받/.test(r.json.message), "내려받은 전자책은 바로 취소 막기", r.json);
  // 무통장 입금으로 종이책 주문 → 입금 대기 → 마스터 입금 확인 → 결제 완료 · 보낼 주문
  r = await call("vod-pay", { body: { action: "prepare", pid: "b2", kind: "course", qty: 1, method: "bank", depositor: "책 OO", ship: SHIP, expect: 13800 } });
  const bkN = r.json.no;
  bo = (await store.getDoc("vo:" + bkN)).v;
  ok(r.json.ok && r.json.bank && r.json.amount === 13800 && bo.status === "pending" && bo.method === "bank" && bo.depositor === "책OO" && !!(bo.bankTo && bo.bankTo.account) && bo.ship.st === "ready" && bo.shipFee === 3000 && bo.dueAt > Date.now(), "종이책 무통장 주문: 입금 대기 · 안내 계좌 · 입금 기한 · 배송지 · 배송비가 주문에 남음", bo);
  useJar({ dc_a: auth.sign({ r: "master" }) });
  r = await call("vod-pay", { body: { action: "bankOk", no: bkN } });
  bo = (await store.getDoc("vo:" + bkN)).v;
  ok(r.json.ok && bo.status === "paid" && bo.paidAt > 0 && bo.ship.st === "ready", "마스터 입금 확인 → 결제 완료 · 보낼 주문으로", bo);
  useJar(memJar);
  // 현금영수증 (무통장만): 번호를 확인하고 주문에 남겨요 — 회원은 ‘발급 완료’ · 처리 상태를 바꿀 수 없어요
  r = await call("vod-pay", { body: { action: "prepare", pid: "b2", kind: "course", qty: 1, method: "bank", depositor: "책OO", ship: SHIP, cashRcpt: { type: "p", no: "0101234" }, expect: 13800 } });
  ok(r.status === 400 && /현금영수증/.test(r.json.message), "현금영수증 휴대폰 번호가 이상하면 막기", r.json);
  r = await call("vod-pay", { body: { action: "prepare", pid: "b2", kind: "course", qty: 1, method: "bank", depositor: "책OO", ship: SHIP, cashRcpt: { type: "b", no: "123-45-67890" }, expect: 13800 } });
  const crN = r.json.no; bo = (await store.getDoc("vo:" + crN)).v;
  ok(r.json.ok && bo.cashRcpt && bo.cashRcpt.type === "b" && bo.cashRcpt.no === "1234567890", "현금영수증 지출증빙(사업자등록번호 10자리)이 주문에 남아요", bo.cashRcpt);
  j = await boot();
  r = await sync([{ k: "vo:" + crN, base: verOf(j, "vo:" + crN), ops: [{ p: ["cashRcpt", "done"], v: 1 }, { p: ["claim"], v: { k: "return", st: "done" } }] }]);
  bo = (await store.getDoc("vo:" + crN)).v;
  ok(!bo.cashRcpt.done && !bo.claim, "회원은 현금영수증 발급 표시 · 요청 처리 상태를 못 바꿔요", bo);
  // 취소 · 반품 · 교환 요청 종류: 보내기 전은 취소, 보낸 뒤는 반품 · 교환 — 승인(수거 중)이면 새 요청을 받지 않아요
  j = await boot();
  r = await sync([{ k: "vo:" + bkN, base: verOf(j, "vo:" + bkN), ops: [{ p: ["refundReq"], v: { why: "단순 변심", kind: "exchange" } }] }]);
  ok(((await store.getDoc("vo:" + bkN)).v.refundReq || {}).kind === "cancel", "보내기 전(결제 완료)이면 요청 종류는 ‘취소’로", (await store.getDoc("vo:" + bkN)).v.refundReq);
  j = await boot();
  await sync([{ k: "vo:" + bkN, base: verOf(j, "vo:" + bkN), ops: [{ p: ["refundReq"], d: 1 }] }]);
  ok(!(await store.getDoc("vo:" + bkN)).v.refundReq, "회원이 요청을 거둬들여요");
  useJar({ dc_a: auth.sign({ r: "master" }) }); j = await boot();
  await sync([{ k: "vo:" + bkN, base: verOf(j, "vo:" + bkN), ops: [{ p: ["ship", "st"], v: "done" }, { p: ["ship", "inv"], v: "640012340000" }, { p: ["ship", "shipAt"], v: Date.now() - 864e5 }, { p: ["ship", "doneAt"], v: Date.now() }] }]);
  useJar(memJar); j = await boot();
  await sync([{ k: "vo:" + bkN, base: verOf(j, "vo:" + bkN), ops: [{ p: ["refundReq"], v: { why: "파손 · 파본", kind: "exchange", text: "표지 찢어짐" } }] }]);
  ok(((await store.getDoc("vo:" + bkN)).v.refundReq || {}).kind === "exchange", "받은 뒤에는 교환 요청", (await store.getDoc("vo:" + bkN)).v.refundReq);
  useJar({ dc_a: auth.sign({ r: "master" }) }); j = await boot();
  await sync([{ k: "vo:" + bkN, base: verOf(j, "vo:" + bkN), ops: [{ p: ["claim"], v: { k: "exchange", st: "pick", why: "파손 · 파본", at: Date.now() } }, { p: ["refundReq"], d: 1 }] }]);
  bo = (await store.getDoc("vo:" + bkN)).v;
  ok(bo.claim && bo.claim.st === "pick" && !bo.refundReq, "마스터 승인: 요청이 ‘수거 중’ 처리로 옮겨가요", bo.claim);
  useJar(memJar); j = await boot();
  await sync([{ k: "vo:" + bkN, base: verOf(j, "vo:" + bkN), ops: [{ p: ["refundReq"], v: { why: "단순 변심", kind: "return" } }, { p: ["claim", "st"], v: "done" }] }]);
  bo = (await store.getDoc("vo:" + bkN)).v;
  ok(!bo.refundReq && bo.claim.st === "pick", "수거 중에는 회원이 새 요청을 넣거나 처리 상태를 바꿀 수 없어요", { rq: bo.refundReq, c: bo.claim });
  // 일회성 작업: 문대표 종이책을 스토어 · 가격표에 (없을 때만)
  const OO = require(path.join(TMP, "class/api/_lib/oneoff.js")), BOOKS = require(path.join(TMP, "class/api/_lib/books.js"));
  const fakeMeta = { vod: { products: [{ id: "v1", title: "x" }], settings: {} }, other: 1 }, fakeCat = { at: 1, products: [{ id: "v1" }] };
  let w = OO.moonBook((k) => (k === "meta" ? fakeMeta : k === "vcat" ? fakeCat : null));
  ok(w.writes.meta.vod.products.length === 2 && w.writes.meta.vod.products[1].id === "b1" && w.writes.meta.vod.products[1].showOff && w.writes.meta.vod.v21 === 1 && w.writes.meta.vod.settings.ship.autoDays === 3 && w.writes.meta.other === 1, "일회성 작업: 종이책 · 배송 설정을 스토어에 (다른 칸은 그대로)", w.result);
  ok(w.writes.vcat.products.length === 2 && w.writes.vcat.products[1].price === 15900 && w.writes.vcat.products[1].type === "book" && !("pitch" in w.writes.vcat.products[1]), "일회성 작업: 가격표에는 가격 칸만", w.writes.vcat.products[1]);
  w = OO.moonBook((k) => (k === "meta" ? w.writes.meta : k === "vcat" ? w.writes.vcat : null));
  ok(w.writes.meta.vod.products.length === 2 && !w.writes.vcat && w.result.book === "이미 있음", "일회성 작업: 이미 있으면 또 넣지 않아요", w.result);
  // 일회성 작업: 두고클래스 무통장 입금 계좌 (비어 있을 때만)
  const bankMeta = { vod: { products: [], settings: { share: 70, bank: "", account: "", holder: "", payDays: 3 } }, other: 1 };
  w = OO.storeBank((k) => (k === "meta" ? bankMeta : null));
  const bs = w.writes.meta.vod.settings;
  ok(bs.bank === "IBK기업은행" && bs.account === "940-057282-04-017" && bs.holder === "(주)두고홀딩스" && bs.payDays === 3 && bs.share === 70 && w.writes.meta.other === 1 && bankMeta.vod.settings.bank === "", "일회성 작업: 비어 있던 무통장 계좌에 IBK기업은행 (주)두고홀딩스 (다른 설정은 그대로)", bs);
  w = OO.storeBank((k) => (k === "meta" ? w.writes.meta : null));
  ok(!w.writes.meta && w.result.bank === "이미 있음", "일회성 작업: 계좌가 있으면 다시 쓰지 않아요", w.result);
  w = OO.storeBank((k) => (k === "meta" ? { vod: { settings: { bank: "국민은행", account: "123-45", holder: "마스터" } } } : null));
  ok(!w.writes.meta, "마스터가 넣은 계좌는 그대로", w.result);
  ok(OO.OPS.some((x) => x.id === "2026-10-30-store-bank-account" && x.run === OO.storeBank), "무통장 계좌 작업 목록 등록", null);
  ok(BOOKS.MOON_BOOK.price === 15900 && BOOKS.MOON_BOOK.type === "book" && OO.OPS.some((x) => x.id === "2026-10-30-moon-paper-book"), "종이책 상품 · 작업 목록 등록", null);
  // 일회성 작업: 실제 운영 시작 — 문대표 것을 뺀 기수 신청 · 매출 기록 지우기
  const RD = {
    "bill:logic:b1": { id: "b1", instructorId: "logic", cohortName: "1기", cohortId: "lc1", paidAt: "2026-09-25", demo: true },
    "bill:logic:b2": { id: "b2", instructorId: "logic", cohortName: "2기", cohortId: "lc2", paidAt: "2026-10-20", demo: true },
    "bill:choi:b3": { id: "b3", instructorId: "choi", cohortName: "2기", demo: true },
    "bill:choi:b4": { id: "b4", instructorId: "choi", cohortName: "3기", cohortId: "cc3", paidAt: "2026-10-28" },
    "bill:moon:b5": { id: "b5", instructorId: "moon", cohortName: "5기", paidAt: "2026-10-30" },
    "bill:moon:b6": { id: "b6", instructorId: "moon", cohortName: "4기", demo: true },
    "cohorts:logic": [{ id: "lc1", name: "1기" }, { id: "lc2", name: "2기" }],
    "cohorts:choi": [{ id: "cc1", name: "1기" }, { id: "cc3", name: "3기" }],
    "stu:logic:s13": { id: "s13", cohortId: "lc1" }, "stu:choi:s99": { id: "s99", cohortId: "cc3" },
    meta: { affiliates: [{ id: "aff-demo" }, { id: "aff-kny", name: "김나영" }], affPayouts: { "aff-demo:2026-09": { paidAt: "2026-10-10", by: "master" }, "aff-kny:2026-10": { paidAt: "2026-10-31", amount: 1000, rows: [{ bid: "b5" }] } }, other: 1 }
  };
  const rdGet = (k) => (RD[k] === undefined ? null : JSON.parse(JSON.stringify(RD[k]))), rdKeys = (pre) => Object.keys(RD).filter((k) => k.indexOf(pre) === 0).sort();
  w = OO.launchReset(rdGet, rdKeys);
  ok(w.writes["bill:logic:b1"] === null && w.writes["bill:logic:b2"] === null && w.writes["bill:choi:b3"] === null && w.writes["bill:choi:b4"] === null && w.writes["bill:moon:b6"] === null && !("bill:moon:b5" in w.writes), "운영 시작: 문대표 것이 아닌 기수 신청 · 매출 기록은 모두, 문대표는 예시만 지워요", w.result);
  ok(JSON.stringify(w.writes["cohorts:logic"]) === JSON.stringify([{ id: "lc1", name: "1기" }]) && !("cohorts:choi" in w.writes), "운영 시작: 지운 기록으로 열린 기수는 수강생이 없을 때만 같이 지워요 (처음 기수 · 수강생 있는 기수는 그대로)", w.writes["cohorts:logic"]);
  ok(w.writes.meta && !w.writes.meta.affPayouts["aff-demo:2026-09"] && w.writes.meta.affPayouts["aff-kny:2026-10"] && w.writes.meta.affiliates.length === 2 && w.writes.meta.other === 1, "운영 시작: 예시 파트너 지급 기록만 지우고 파트너 계정(김나영 포함)은 그대로", w.writes.meta && w.writes.meta.affPayouts);
  Object.keys(w.writes).forEach((k) => { if (w.writes[k] === null) delete RD[k]; else RD[k] = w.writes[k]; });
  w = OO.launchReset(rdGet, rdKeys);
  ok(!Object.keys(w.writes).length, "운영 시작: 다시 돌려도 더 지우지 않아요", w.result);
  // 일회성 작업: 문대표 4기 11/21(토) 4주
  w = OO.moon4th((k) => (k === "cohorts:moon" ? [{ id: "c3", name: "3기", startDate: "2026-10-01" }, { id: "c4", name: "4기", startDate: "2026-11-05", recruiting: true, curriculumId: "cur-4w", classDow: 6, classTime: "12:00" }] : null));
  const c4 = w.writes["cohorts:moon"][1];
  ok(c4.startDate === "2026-11-21" && c4.weeks === 4 && c4.classDow === 6 && c4.classTime === "12:00" && c4.curriculumId === "cur-4w" && w.writes["cohorts:moon"][0].startDate === "2026-10-01" && new Date(c4.startDate + "T00:00:00").getDay() === 6, "문대표 4기: 11월 21일 토요일부터 4주 (다른 기수 · 시간은 그대로)", c4);
  // 일회성 작업: 문대표 강사 소개 페이지 신청하기 링크
  w = OO.moonApplyLink((k) => (k === "content:moon" ? { brand: { name: "두고보는 문대표" }, landing: { applyUrl: "", cta: { title: "5주 뒤, 내 이름의 브랜드 사장님이 되어 있을 거예요", sub: "s" } } } : null));
  ok(w.writes["content:moon"].landing.applyUrl === "https://m.site.naver.com/2iZFQ" && /^4주 뒤/.test(w.writes["content:moon"].landing.cta.title) && w.writes["content:moon"].brand.name === "두고보는 문대표", "문대표 강사 소개: 신청하기 링크(네이버) · 마지막 안내 4주", w.result);
  w = OO.moonApplyLink((k) => (k === "content:moon" ? { landing: { applyUrl: "https://open.kakao.com/o/x", cta: { title: "직접 쓴 제목" } } } : null));
  ok(w.writes["content:moon"].landing.applyUrl === "https://open.kakao.com/o/x" && w.writes["content:moon"].landing.cta.title === "직접 쓴 제목", "강사가 이미 넣은 링크 · 직접 쓴 제목은 그대로", w.result);
  ok(["2026-10-31-launch-reset-bills", "2026-10-31-moon-4th-cohort", "2026-10-31-moon-apply-link"].every((id) => OO.OPS.some((x) => x.id === id)), "운영 시작 작업 3개 목록 등록", null);
  { // 문대표 무료강의 11/17 (운영 DB 와 같은 모양: 처음 넣은 값 그대로)
    const prodFree = { published: true, liveAt: "2026-10-27T19:30", kakao: { url: "https://open.kakao.com/o/gF68BQDi" }, videos: { items: [{ youtube: "https://youtu.be/S43tftq_ZT4" }] },
      gifts: { title: "강의 전, 선물 전자책 3권", items: [{ title: "1편", openAt: "2026-10-01T19:30", forceOpen: true, url: "https://book01.notion.site/VOD-28ed6f9dec6780f3901ad401c88019da?source=copy_link", color: "blue" }, { title: "2편", openAt: "2026-10-20T19:30", url: "https://www.ivyclass.co.kr/x", color: "cyan" }, { title: "3편", openAt: "2026-10-26T19:30", url: "https://www.ivyclass.co.kr/x", color: "ice" }] },
      live: { image: "assets/landing/moon-thumb.jpg", url: "https://www.ivyclass.co.kr/x" }, faq: { items: [{ q: "무료강의는 어디서 듣나요?", a: "아이비클래스" }, { q: "다음에는?", a: "직접 브랜드를 만들고 싶은 분은 5주 실전 클래스로 이어서 함께해요." }] },
      apply: { includes: ["10/27(화) 오후 7시 30분 무료 라이브", "선물 전자책 3권"] } };
    let w = OO.moonFree1117((k) => (k === "content:moon" ? { brand: { theme: "nz" }, freeClass: prodFree, landing: { applyUrl: "x" } } : null));
    const F = w.writes["content:moon"].freeClass;
    ok(F.liveAt === "2026-11-17T19:30" && F.intro.youtube === "https://www.youtube.com/watch?v=mPFHz1JQj3U" && F.kakao.url === "https://m.site.naver.com/2iZFQ", "문대표 무료강의: 11/17 저녁 7시 30분 · 대표 영상 · 오픈채팅(네이버)", F);
    ok(F.gifts.items[0].forceOpen === true && F.gifts.items[1].openAt === "2026-11-09T19:00" && F.gifts.items[1].url.endsWith("?pvs=74") && !F.gifts.items[1].forceOpen && F.gifts.items[2].openAt === "2026-11-17T19:00" && F.gifts.items[2].url.endsWith("2c5d6f9dec6781caa41bf90cdab36f96") && F.gifts.items[2].title === "3편" && F.gifts.title === "강의 전, 선물 전자책 3권", "선물 전자책: 1편 지금 · 2편 11/9 · 3편 11/17 저녁 7시 (제목 · 칸 제목은 그대로)", F.gifts);
    ok(F.live.image === "assets/landing/moon-thumb-1117.jpg" && F.live.url === "https://www.ivyclass.co.kr/x" && F.faq.items[0].q === "무료강의는 언제 시작되나요?" && /11월 17일\(화\) 저녁 7시 30분/.test(F.faq.items[0].a) && /아시아 최초/.test(F.faq.items[0].a) && /4주 실전 클래스/.test(F.faq.items[2].a) && F.apply.includes[0] === "11/17(화) 오후 7시 30분 무료 라이브", "포스터 11/17 · FAQ ‘언제 시작되나요?’ 맨 위 · 4주 · 신청 안내 날짜", F);
    ok(w.writes["content:moon"].landing.applyUrl === "x" && F.videos.items.length === 1, "다른 칸(강사 소개 · 영상)은 그대로", null);
    w = OO.moonFree1117((k) => (k === "content:moon" ? { freeClass: Object.assign({}, F, { intro: { youtube: "https://youtu.be/MINE" }, live: { image: "assets/mine.jpg" } }) } : null));
    const F2 = w.writes["content:moon"].freeClass;
    ok(F2.intro.youtube === "https://youtu.be/MINE" && F2.live.image === "assets/mine.jpg" && F2.faq.items.filter((x) => /언제\s*시작/.test(x.q)).length === 1, "강사가 직접 넣은 대표 영상 · 썸네일은 그대로 · 질문은 한 번만", F2);
    ok(OO.moonFree1117(() => null).result.skipped, "문대표 페이지가 없으면 건너뛰기", null);
    ok(OO.OPS.some((x) => x.id === "2026-11-01-moon-free-1117" && x.run === OO.moonFree1117), "무료강의 11/17 작업 목록 등록", null);
  }
  { // 문대표 무료강의 2차: 좌우 영상 끄기 · 사전 미션 · 증정 혜택 (1차 작업 뒤 운영 DB 모양)
    const base = { liveAt: "2026-11-17T19:30", off: {}, intro: { youtube: "https://www.youtube.com/watch?v=mPFHz1JQj3U" }, videos: { items: [{ youtube: "x" }] },
      question: { title: "문대표에게 직접 묻고 싶은 게 있으신가요?", url: "https://forms.gle/fJ4sELiTBhnjAeRHA", note: "질문 메모 후", promise: "지금 남겨 주시면" }, kakao: { url: "https://m.site.naver.com/2iZFQ" } };
    let w = OO.moonFreeMission((k) => (k === "content:moon" ? { brand: { theme: "nz" }, freeClass: base } : null));
    const F = w.writes["content:moon"].freeClass;
    ok(F.off.videos === true && !F.off.intro && F.intro.youtube.endsWith("mPFHz1JQj3U") && F.videos.items.length === 1, "좌우 영상 3개만 끄고 대표 영상은 그대로 (영상 목록은 지우지 않음)", F.off);
    ok(F.question.url === "https://docs.google.com/forms/d/e/1FAIpQLSfMZBEB9Z5_RjKYqeeldP2vYBxW5fC-krFqzhxxGiHQz7F5Xg/viewform?usp=send_form" && F.question.title === "문대표의 *사전 미션*" && F.question.label === "사전 미션 하러 가기" && F.question.promise === "" && /1분/.test(F.question.desc) && /구글폼/.test(F.question.note), "사전 미션: 새 구글폼 · 제목 · 버튼 · 안내 (초록 강조 상자는 숨김)", F.question);
    ok(F.bonus.items.length === 8 && F.bonus.items.every((x) => x.title) && /톡방 참여자 전원/.test(F.bonus.badge) && /전원 증정/.test(F.bonus.title), "참여자 전원 증정 혜택 01~08 · 톡방 배지", F.bonus);
    ok(F.liveAt === "2026-11-17T19:30" && F.kakao.url === "https://m.site.naver.com/2iZFQ", "다른 칸(일정 · 오픈채팅)은 그대로", null);
    w = OO.moonFreeMission((k) => (k === "content:moon" ? { freeClass: Object.assign({}, F, { bonus: { items: [{ title: "내가 쓴 자료" }] }, off: { intro: true } }) } : null));
    const F2 = w.writes["content:moon"].freeClass;
    ok(F2.bonus.items.length === 1 && F2.bonus.items[0].title === "내가 쓴 자료" && !F2.off.intro, "강사가 넣은 증정 항목은 그대로 · 꺼져 있던 대표 영상은 다시 켬", F2);
    ok(OO.OPS.findIndex((x) => x.id === "2026-11-01-moon-free-mission") > OO.OPS.findIndex((x) => x.id === "2026-11-01-moon-free-1117"), "2차 작업은 1차 뒤에 실행", null);
  }
  delete jar.dc_v;

  console.log("\n영상 길이 (비메오 · 유튜브 실제 재생 시간)");
  r = await call("public", { body: { action: "vdur", urls: ["https://vimeo.com/76979871", "https://youtu.be/dQw4w9WgXcQ", "https://vimeo.com/111111111", "https://example.com/a.mp4"] } });
  ok(r.json.ok && r.json.d["https://vimeo.com/76979871"] === 1470 && r.json.d["https://youtu.be/dQw4w9WgXcQ"] === 212 && r.json.d["https://vimeo.com/111111111"] === 0 && !("https://example.com/a.mp4" in r.json.d), "비메오 oEmbed · 유튜브 영상 페이지로 실제 길이 (못 찾으면 0 · 영상 아닌 주소는 빼요)", r.json);
  ok(VDC.some((x) => x === "vm 76979871 https://www.doogoclass.com/"), "비메오에는 우리 도메인(Referer)으로 물어요 — 퍼가기 도메인을 막아 둔 영상도", VDC);
  const vc = VDC.length;
  r = await call("public", { body: { action: "vdur", urls: ["https://player.vimeo.com/video/76979871", "https://youtu.be/dQw4w9WgXcQ", "https://vimeo.com/111111111"] } });
  ok(r.json.d["https://player.vimeo.com/video/76979871"] === 1470 && VDC.length === vc, "같은 영상은 서버가 기억한 값 · 못 찾은 영상도 하루는 다시 안 물어요", { d: r.json.d, calls: VDC.slice(vc) });
  process.env.YOUTUBE_API_KEY = "yt-key";
  r = await call("public", { body: { action: "vdur", urls: ["https://www.youtube.com/watch?v=abcdefghijk"] } });
  ok(r.json.d["https://www.youtube.com/watch?v=abcdefghijk"] === 3723 && VDC[VDC.length - 1] === "api abcdefghijk", "YOUTUBE_API_KEY 가 있으면 유튜브 Data API (PT1H2M3S → 3723초)", { d: r.json.d, last: VDC[VDC.length - 1] });
  delete process.env.YOUTUBE_API_KEY;

  console.log("\n결과: " + pass + "개 통과 · " + failN + "개 실패");
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(failN ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
