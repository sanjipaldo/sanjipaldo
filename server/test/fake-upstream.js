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
      if (req.method === "GET" && url.pathname.endsWith("/ordersheets")) return json(200, { code: 200, data: [{ shipmentBoxId: 640001, orderId: 2026092800001, orderedAt: "2026-09-28T10:00:00", orderer: { name: "김쿠팡", safeNumber: "0502-1111-2222" }, receiver: { name: "김쿠팡", safeNumber: "0502-1111-2222", addr1: "서울특별시 강남구 강남대로146길 28", addr2: "3층", postCode: "06253" }, parcelPrintMessage: "문 앞", orderItems: [{ vendorItemId: 7001, sellerProductName: "사과 3kg", sellerProductItemName: "3kg", shippingCount: 2, orderPrice: 29900, externalVendorSkuCode: "SP-1001:O1", sellerProductId: 1320567890 }, { vendorItemId: 8801, sellerProductName: "내가 만든 수제청", sellerProductItemName: "", shippingCount: 1, orderPrice: 15000, externalVendorSkuCode: "", sellerProductId: 55 }] }], nextToken: "" });
      if (req.method === "POST" && url.pathname.endsWith("/orders/invoices")) { const dto = JSON.parse(raw.toString()).orderSheetInvoiceApplyDtos[0]; return json(200, { code: 200, data: { responseCode: 0, responseList: [{ shipmentBoxId: dto.shipmentBoxId, succeed: dto.invoiceNumber !== "BAD", resultMessage: dto.invoiceNumber === "BAD" ? "송장번호 형식 오류" : "" }] } }); }
      if (req.method === "GET" && /\/seller-products\/\d+$/.test(url.pathname)) return json(200, { code: "SUCCESS", data: { items: state.coupangApproved ? [{ vendorItemId: 7001 }, { vendorItemId: 7002 }] : [{}] } });
      if (req.method === "DELETE") return state.coupangDeletable ? json(200, { code: "SUCCESS" }) : json(400, { code: "ERROR", message: "승인완료 상품은 삭제할 수 없습니다" });
      return json(200, { code: "SUCCESS", data: {} });
    }
    // 네이버
    if (url.pathname === "/external/v1/oauth2/token") return json(200, { access_token: "NAVER-TOKEN", expires_in: 10800 });
    if (req.headers.authorization !== "Bearer NAVER-TOKEN") return json(401, { message: "no token" });
    if (url.pathname === "/external/v1/pay-order/seller/product-orders/last-changed-statuses") return json(200, { data: { lastChangeStatuses: [{ productOrderId: "2026092855501", productOrderStatus: "PAYED" }, { productOrderId: "2026092855502", productOrderStatus: "PAYED" }] } });
    if (url.pathname === "/external/v1/pay-order/seller/product-orders/query") return json(200, { data: JSON.parse(raw.toString()).productOrderIds.map((id, index) => ({ order: { orderId: "20260928000" + index, ordererName: "이네이버", ordererTel: "010-2222-3333", orderDate: "2026-09-28T09:00:00" }, productOrder: { productOrderId: id, productName: index ? "셀러 자체 상품" : "사과 3kg", productOption: index ? "" : "3kg", optionManageCode: index ? "" : "SP-1001:O1", quantity: 1, totalPaymentAmount: 29900, originalProductId: "9001", shippingAddress: { name: "이네이버", tel1: "010-2222-3333", zipCode: "06253", baseAddress: "서울특별시 강남구 강남대로146길 28", detailedAddress: "5층" }, shippingMemo: "경비실" } })) });
    if (url.pathname === "/external/v1/pay-order/seller/product-orders/dispatch") { const rows = JSON.parse(raw.toString()).dispatchProductOrders; return json(200, { data: { successProductOrderIds: rows.filter(row => row.trackingNumber !== "BAD").map(row => row.productOrderId), failProductOrderInfos: rows.filter(row => row.trackingNumber === "BAD").map(row => ({ productOrderId: row.productOrderId, code: "E", message: "송장번호 오류" })) } }); }
    if (url.pathname === "/external/v1/product-images/upload") return json(200, { images: [{ url: "https://shop-phinf.pstatic.net/a.jpg" }, { url: "https://shop-phinf.pstatic.net/b.jpg" }] });
    if (req.method === "POST" && url.pathname === "/external/v2/products") return json(200, { originProductNo: 9001, smartstoreChannelProductNo: 9101 });
    if (req.method === "GET") return json(200, { originProduct: { salePrice: 29900, stockQuantity: 10, detailAttribute: { optionInfo: { optionCombinations: [{ sellerManagerCode: "SP-1001:O1", price: 0, stockQuantity: 1 }] } } } });
    return json(200, {});
  });
  return { server, calls, state };
}


module.exports = { fakeUpstream };
