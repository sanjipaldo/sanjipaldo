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
   GET    /api/health */
const http = require("node:http");
const { createCredentialStore } = require("./store");
const listings = require("./listings");

const CHANNELS = ["coupang", "smartstore"];
const REQUIRED = { coupang: ["vendorId", "accessKey", "secretKey", "vendorUserId"], smartstore: ["accountId"] };

function createApp({ store = createCredentialStore(), token = process.env.DOOGO_SERVER_TOKEN, allowedOrigins = (process.env.DOOGO_ALLOWED_ORIGINS || "").split(",").filter(Boolean), clientOptions = {} } = {}) {
  if (!token) throw new Error("DOOGO_SERVER_TOKEN 환경변수가 필요해요.");

  async function readJson(req) {
    let raw = "";
    for await (const chunk of req) { raw += chunk; if (raw.length > 2_000_000) throw Object.assign(new Error("요청이 너무 커요."), { status: 413 }); }
    return raw ? JSON.parse(raw) : {};
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
      if (url.pathname === "/api/health") return send(res, 200, { ok: true, channels: CHANNELS, naverApp: Boolean(process.env.NAVER_CLIENT_ID) }, origin);
      if (req.headers.authorization !== `Bearer ${token}`) return send(res, 401, { error: "인증이 필요해요." }, origin);
      const body = req.method === "GET" ? {} : await readJson(req);
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
          await listings.verifyChannel(channel, creds, clientOptions);
          return send(res, 200, { ok: true, saved: store.save(seller, channel, creds) }, origin);
        }
      }

      if (parts[1] === "listings") {
        if (parts.length === 2 && req.method === "POST") {
          const channel = String(body.channel || "");
          if (!CHANNELS.includes(channel)) return send(res, 400, { error: "지원하지 않는 쇼핑몰이에요." }, origin);
          return send(res, 200, await listings.registerListing(channel, store.get(seller, channel), body.listing || {}, clientOptions), origin);
        }
        const [, , channel, externalId, verb] = parts;
        if (!CHANNELS.includes(channel) || !externalId) return send(res, 404, { error: "경로를 찾지 못했어요." }, origin);
        const creds = store.get(seller, channel);
        if (req.method === "DELETE" && !verb) return send(res, 200, await listings.removeListing(channel, creds, { externalId, vendorItemIds: body.vendorItemIds || [] }, clientOptions), origin);
        if (req.method === "POST" && verb === "status") return send(res, 200, await listings.setListingStatus(channel, creds, { externalId, action: body.action, stock: body.stock, vendorItemIds: body.vendorItemIds || [] }, clientOptions), origin);
        if (req.method === "POST" && verb === "sync") return send(res, 200, await listings.syncPriceStock(channel, creds, { externalId, listing: body.listing || {}, vendorItemMap: body.vendorItemMap || {} }, clientOptions), origin);
      }
      return send(res, 404, { error: "경로를 찾지 못했어요." }, origin);
    } catch (error) {
      const upstream = error.name === "CoupangError" || error.name === "NaverError";
      const status = upstream ? 502 : error instanceof SyntaxError ? 400 : error.status >= 400 && error.status < 500 ? error.status : 500;
      return send(res, status, { error: error.message, upstreamStatus: upstream ? error.status : undefined, detail: upstream ? error.body : undefined }, origin);
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8787);
  createApp().listen(port, () => console.log(`두고 채널 연동 서버 :${port}`));
}

module.exports = { createApp, REQUIRED };
