"use strict";
/* 테스트용 가짜 쿠팡·네이버·이미지 서버. Access Key는 AK-TEST만 통과한다. */
const http = require("node:http");

/* 가짜 쿠팡 + 가짜 네이버 + 이미지 서버 한 곳에 */
function fakeUpstream() {
  const calls = [];
  const state = { coupangApproved: true, coupangDeletable: false };
  const server = http.createServer(async (req, res) => {
    let raw = Buffer.alloc(0);
    for await (const chunk of req) raw = Buffer.concat([raw, chunk]);
    const url = new URL(req.url, "http://x");
    calls.push({ method: req.method, path: url.pathname, query: url.search.slice(1), headers: req.headers, body: raw });
    const json = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/img/")) { res.writeHead(200, { "Content-Type": "image/jpeg" }); return res.end(Buffer.from([0xff, 0xd8, 0xff, 0xd9])); }
    // 쿠팡
    if (url.pathname.startsWith("/v2/")) {
      if (!/^CEA algorithm=HmacSHA256, access-key=AK-TEST, signed-date=\d{6}T\d{6}Z, signature=[0-9a-f]{64}$/.test(req.headers.authorization || "")) return json(401, { code: "ERROR", message: "bad signature" });
      if (req.method === "POST" && url.pathname.endsWith("/seller-products")) return json(200, { code: "SUCCESS", data: 1320567890 });
      if (req.method === "GET" && /\/seller-products\/\d+$/.test(url.pathname)) return json(200, { code: "SUCCESS", data: { items: state.coupangApproved ? [{ vendorItemId: 7001 }, { vendorItemId: 7002 }] : [{}] } });
      if (req.method === "DELETE") return state.coupangDeletable ? json(200, { code: "SUCCESS" }) : json(400, { code: "ERROR", message: "승인완료 상품은 삭제할 수 없습니다" });
      return json(200, { code: "SUCCESS", data: {} });
    }
    // 네이버
    if (url.pathname === "/external/v1/oauth2/token") return json(200, { access_token: "NAVER-TOKEN", expires_in: 10800 });
    if (req.headers.authorization !== "Bearer NAVER-TOKEN") return json(401, { message: "no token" });
    if (url.pathname === "/external/v1/product-images/upload") return json(200, { images: [{ url: "https://shop-phinf.pstatic.net/a.jpg" }, { url: "https://shop-phinf.pstatic.net/b.jpg" }] });
    if (req.method === "POST" && url.pathname === "/external/v2/products") return json(200, { originProductNo: 9001, smartstoreChannelProductNo: 9101 });
    if (req.method === "GET") return json(200, { originProduct: { salePrice: 29900, stockQuantity: 10, detailAttribute: { optionInfo: { optionCombinations: [{ sellerManagerCode: "SP-1001:O1", price: 0, stockQuantity: 1 }] } } } });
    return json(200, {});
  });
  return { server, calls, state };
}


module.exports = { fakeUpstream };
