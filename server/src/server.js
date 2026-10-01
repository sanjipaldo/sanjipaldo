"use strict";
/* 두고 채널 연동 서버
   브라우저(두고 앱)는 쇼핑몰 API를 직접 부를 수 없다. 두 쇼핑몰 모두 등록된 IP·서명이 필요하고 CORS를 열어 주지 않는다.
   그래서 두고 앱 → 이 서버 → 쿠팡/네이버 순서로 호출한다.

   POST   /api/channels/:channel/connect            { sellerLoginId, credentials }       연결 확인 후 키를 암호화 보관
   DELETE /api/channels/:channel                    { sellerLoginId }                    연결 해제(키 삭제)
   POST   /api/listings                             { sellerLoginId, channel, listing }  원클릭 상품 등록
   POST   /api/listings/:channel/:externalId/status { sellerLoginId, action, stock, vendorItemIds }  판매중지·품절·재개
   POST   /api/listings/:channel/:externalId/sync   { sellerLoginId, listing, vendorItemMap }        가격·재고 동기화
   DELETE /api/listings/:channel/:externalId        { sellerLoginId, vendorItemIds }     삭제(쿠팡은 판매중지로 대체될 수 있음)
   POST   /api/orders/:channel/collect              { sellerLoginId, since }             새 주문(결제완료) 가져오기
   POST   /api/orders/:channel/confirm              { sellerLoginId, items:[{refs}] }    주문 확인(발주확인·상품준비중)
   POST   /api/orders/:channel/dispatch             { sellerLoginId, items:[{refs, carrier, naverCode, tracking, update}] }  송장 전송
   POST   /api/billing/refund                       { paymentKey, cancelAmount, cancelReason, refundId }  구독 해지 카드 부분 취소 (토스페이먼츠)
   POST   /api/reports/daily                        { title, text, kakao:[번호], email:[주소] }          일일 매출 보고 (알림톡·이메일)
   GET    /api/channels/cafe24/oauth/callback?code&state                              CAFE24 앱 설치(권한 동의) 뒤 돌아오는 곳 (토큰 받아 암호화 보관)
   GET    /api/address/search?keyword&page                                       도로명주소 검색 (행안부 검색 API, 승인키는 서버에만)
   GET    /api/health */
const http = require("node:http");
const crypto = require("node:crypto");
const cafe24 = require("./cafe24");
const { createCredentialStore } = require("./store");
const listings = require("./listings");
const orders = require("./orders");
const ops = require("./ops");
const address = require("./address");

const CHANNELS = ["coupang", "smartstore", "cafe24"];
const REQUIRED = { coupang: ["vendorId", "accessKey", "secretKey", "vendorUserId"], smartstore: ["accountId"], cafe24: ["mallId"] };

/* CAFE24 권한 동의 state: 누가(셀러)·어느 쇼핑몰을 연결하는지 + 만료 시각을 서명해 둔다 (콜백 위조 방지) */
function signState(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${crypto.createHmac("sha256", secret).update(body).digest("base64url")}`;
}
function readState(state, secret, now = Date.now()) {
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  return payload.exp > now ? payload : null;
}

function createApp({ store = createCredentialStore(), token = process.env.DOOGO_SERVER_TOKEN, allowedOrigins = (process.env.DOOGO_ALLOWED_ORIGINS || "").split(",").filter(Boolean), clientOptions = {}, opsOptions = {} } = {}) {
  if (!token) throw new Error("DOOGO_SERVER_TOKEN 환경변수가 필요해요.");

  async function readJson(req) {
    let raw = "";
    for await (const chunk of req) { raw += chunk; if (raw.length > 2_000_000) throw Object.assign(new Error("요청이 너무 커요."), { status: 413 }); }
    return raw ? JSON.parse(raw) : {};
  }

  const optsFor = (seller, channel) => channel === "cafe24" ? { ...clientOptions, onTokens: tokens => { store.save(seller, "cafe24", tokens); } } : clientOptions;
  const cafe24Redirect = process.env.CAFE24_REDIRECT_URI || "";

  function sendHtml(res, status, message) {
    res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>두고 · CAFE24 연결</title><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>${message.replace(/[<>&]/g, "")}</h2><p>이 창을 닫고 두고로 돌아가 주세요.</p></body>`);
  }

  function send(res, status, body, origin) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      ...(origin && allowedOrigins.includes(origin) ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", Vary: "Origin" } : {})
    });
    res.end(JSON.stringify(body));
  }

  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (req.method === "OPTIONS") return send(res, 204, {}, origin);
    const url = new URL(req.url, "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean);
    try {
      if (url.pathname === "/api/health") return send(res, 200, { ok: true, channels: CHANNELS, naverApp: Boolean(process.env.NAVER_CLIENT_ID), pg: Boolean(process.env.TOSS_SECRET_KEY), address: Boolean(process.env.JUSO_CONFM_KEY), kakaoReport: Boolean(process.env.SOLAPI_PFID), emailReport: Boolean(process.env.RESEND_API_KEY) }, origin);
      if (req.method === "GET" && url.pathname === "/api/channels/cafe24/oauth/callback") {
        const state = readState(url.searchParams.get("state"), token);
        if (!state) return sendHtml(res, 400, "연결 요청이 만료됐거나 올바르지 않아요. 두고에서 다시 연결해 주세요.");
        if (url.searchParams.get("error")) return sendHtml(res, 400, "CAFE24 권한 동의가 취소됐어요.");
        const tokens = await cafe24.exchangeCode({ mallId: state.mallId, code: url.searchParams.get("code"), redirectUri: cafe24Redirect }, clientOptions);
        store.save(state.seller, "cafe24", tokens);
        return sendHtml(res, 200, `CAFE24(${state.mallId}) 연결 완료!`);
      }
      if (req.headers.authorization !== `Bearer ${token}`) return send(res, 401, { error: "인증이 필요해요." }, origin);
      if (req.method === "GET" && url.pathname === "/api/address/search") return send(res, 200, await address.searchAddress({ keyword: url.searchParams.get("keyword"), page: url.searchParams.get("page") }, opsOptions.address || {}), origin);
      const body = req.method === "GET" ? {} : await readJson(req);
      if (req.method === "POST" && url.pathname === "/api/billing/refund") return send(res, 200, await ops.refundPayment(body, opsOptions), origin);
      if (req.method === "POST" && url.pathname === "/api/reports/daily") return send(res, 200, await ops.sendDailyReport({ title: body.title, text: body.text, kakao: Array.isArray(body.kakao) ? body.kakao : [], email: Array.isArray(body.email) ? body.email : [] }, opsOptions), origin);
      const seller = String(body.sellerLoginId || "");
      if (!seller) return send(res, 400, { error: "sellerLoginId가 필요해요." }, origin);

      if (parts[1] === "channels") {
        const channel = parts[2];
        if (!CHANNELS.includes(channel)) return send(res, 400, { error: "지원하지 않는 쇼핑몰이에요." }, origin);
        if (req.method === "DELETE") { store.remove(seller, channel); return send(res, 200, { ok: true }, origin); }
        if (parts[3] === "connect" && req.method === "POST") {
          const creds = Object.fromEntries(REQUIRED[channel].map(name => [name, String(body.credentials?.[name] || "").trim()]));
          const missing = REQUIRED[channel].filter(name => !creds[name]);
          if (missing.length) return send(res, 400, { error: `빠진 값: ${missing.join(", ")}` }, origin);
          if (channel === "cafe24") {
            /* 이미 권한 동의를 마친 같은 쇼핑몰이면 연결 확인만, 아니면 권한 동의 주소를 돌려준다 */
            let saved = null; try { saved = store.get(seller, "cafe24"); } catch { saved = null; }
            if (saved?.mallId === creds.mallId && saved.refreshToken) {
              await listings.verifyChannel(channel, saved, optsFor(seller, channel));
              return send(res, 200, { ok: true, saved: { mallId: saved.mallId } }, origin);
            }
            if (!cafe24Redirect) return send(res, 503, { error: "두고 서버에 CAFE24 돌아올 주소(CAFE24_REDIRECT_URI)가 설정되지 않았어요." }, origin);
            const state = signState({ seller, mallId: creds.mallId, exp: Date.now() + 10 * 60 * 1000 }, token);
            return send(res, 200, { ok: false, needsAuthorization: true, authorizeUrl: cafe24.authorizeUrl({ mallId: creds.mallId, state, redirectUri: cafe24Redirect }) }, origin);
          }
          await listings.verifyChannel(channel, creds, clientOptions);
          return send(res, 200, { ok: true, saved: store.save(seller, channel, creds) }, origin);
        }
      }

      if (parts[1] === "listings") {
        if (parts.length === 2 && req.method === "POST") {
          const channel = String(body.channel || "");
          if (!CHANNELS.includes(channel)) return send(res, 400, { error: "지원하지 않는 쇼핑몰이에요." }, origin);
          return send(res, 200, await listings.registerListing(channel, store.get(seller, channel), body.listing || {}, optsFor(seller, channel)), origin);
        }
        const [, , channel, externalId, verb] = parts;
        if (!CHANNELS.includes(channel) || !externalId) return send(res, 404, { error: "경로를 찾지 못했어요." }, origin);
        const creds = store.get(seller, channel);
        if (req.method === "DELETE" && !verb) return send(res, 200, await listings.removeListing(channel, creds, { externalId, vendorItemIds: body.vendorItemIds || [] }, optsFor(seller, channel)), origin);
        if (req.method === "POST" && verb === "status") return send(res, 200, await listings.setListingStatus(channel, creds, { externalId, action: body.action, stock: body.stock, vendorItemIds: body.vendorItemIds || [] }, optsFor(seller, channel)), origin);
        if (req.method === "POST" && verb === "sync") return send(res, 200, await listings.syncPriceStock(channel, creds, { externalId, listing: body.listing || {}, vendorItemMap: body.vendorItemMap || {} }, optsFor(seller, channel)), origin);
      }
      if (parts[1] === "orders" && req.method === "POST") {
        const [, , channel, verb] = parts;
        if (!CHANNELS.includes(channel)) return send(res, 400, { error: "지원하지 않는 쇼핑몰이에요." }, origin);
        const creds = store.get(seller, channel);
        if (!creds) return send(res, 409, { error: "이 쇼핑몰이 아직 연결되지 않았어요. 쇼핑몰 연동에서 먼저 연결해 주세요." }, origin);
        const items = Array.isArray(body.items) ? body.items.slice(0, 500) : [];
        if (verb === "collect") return send(res, 200, await orders.collectOrders(channel, creds, { since: body.since }, optsFor(seller, channel)), origin);
        if (verb === "confirm") return send(res, 200, await orders.confirmOrders(channel, creds, { items }, optsFor(seller, channel)), origin);
        if (verb === "dispatch") {
          const bad = items.find(item => !String(item.tracking || "").trim() && item.naverCode !== "DIRECT_DELIVERY");
          if (bad) return send(res, 400, { error: "송장번호가 비어 있는 주문이 있어요." }, origin);
          return send(res, 200, await orders.dispatchTracking(channel, creds, { items }, optsFor(seller, channel)), origin);
        }
      }
      return send(res, 404, { error: "경로를 찾지 못했어요." }, origin);
    } catch (error) {
      const upstream = ["CoupangError", "NaverError", "Cafe24Error"].includes(error.name);
      const status = upstream ? 502 : error instanceof SyntaxError ? 400 : error.status >= 400 && error.status < 600 ? error.status : 500;
      return send(res, status, { error: error.message, upstreamStatus: upstream ? error.status : undefined, detail: upstream ? error.body : undefined }, origin);
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8787);
  createApp().listen(port, () => console.log(`두고 채널 연동 서버 :${port}`));
}

module.exports = { createApp, REQUIRED, signState, readState };
