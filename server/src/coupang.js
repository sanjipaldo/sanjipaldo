"use strict";
/* 쿠팡 OPEN API 클라이언트
   - 인증: HMAC-SHA256. message = signed-date + METHOD + path + query, key = Secret Key
     Authorization: CEA algorithm=HmacSHA256, access-key={AK}, signed-date={yyMMdd'T'HHmmss'Z'}, signature={hex}
   - 셀러가 쿠팡 Wing > 판매자정보 > 추가판매정보 > OPEN API 키 발급에서 연동업체로 '두고마켓'을 고르고
     업체코드(vendorId)·Access Key·Secret Key를 두고에 입력한다. 호출 IP는 두고 서버 IP로 등록된다.
   - 승인 완료된 상품은 삭제할 수 없다(저장·임시저장 상태만 삭제 가능). 그래서 두고의 '삭제'는
     쿠팡에서 모든 옵션 판매중지 + 재고 0 으로 처리하고, 승인 전 상품만 실제 삭제한다. */
const crypto = require("node:crypto");

const DEFAULT_BASE = "https://api-gateway.coupang.com";
const SELLER_PRODUCTS = "/v2/providers/seller_api/apis/api/v1/marketplace/seller-products";
const VENDOR_ITEMS = "/v2/providers/seller_api/apis/api/v1/marketplace/vendor-items";

function signedDate(date = new Date()) {
  const pad = n => String(n).padStart(2, "0");
  return `${String(date.getUTCFullYear()).slice(2)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function authorization({ accessKey, secretKey }, method, path, query = "", date = new Date()) {
  const datetime = signedDate(date);
  const message = `${datetime}${method.toUpperCase()}${path}${query}`;
  const signature = crypto.createHmac("sha256", secretKey).update(message, "utf8").digest("hex");
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

class CoupangError extends Error {
  constructor(message, status, body) { super(message); this.name = "CoupangError"; this.status = status; this.body = body; }
}

function createCoupangClient(credentials, { baseUrl = process.env.COUPANG_API_BASE || DEFAULT_BASE, fetchImpl = fetch } = {}) {
  const { vendorId, accessKey, secretKey } = credentials || {};
  if (!vendorId || !accessKey || !secretKey) throw new Error("쿠팡 업체코드·Access Key·Secret Key가 모두 필요해요.");

  async function call(method, path, { query = "", body } = {}) {
    const url = `${baseUrl}${path}${query ? `?${query}` : ""}`;
    const res = await fetchImpl(url, {
      method,
      headers: {
        Authorization: authorization(credentials, method, path, query),
        "Content-Type": "application/json;charset=UTF-8",
        "X-Requested-By": vendorId
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!res.ok || (data.code && data.code !== "SUCCESS" && data.code !== 200)) throw new CoupangError(data.message || `쿠팡 API 오류 (${res.status})`, res.status, data);
    return data;
  }

  return {
    vendorId,
    /* 연결 확인: 출고지 목록 조회 (키·IP·업체코드가 맞으면 200) */
    verify: () => call("GET", `/v2/providers/marketplace_openapi/apis/api/v1/vendor/shipping-place/outbound`, { query: "pageSize=10&pageNum=1" }),
    listReturnCenters: () => call("GET", `/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/returnShippingCenters`),
    createProduct: payload => call("POST", SELLER_PRODUCTS, { body: payload }),
    getProduct: sellerProductId => call("GET", `${SELLER_PRODUCTS}/${sellerProductId}`),
    deleteProduct: sellerProductId => call("DELETE", `${SELLER_PRODUCTS}/${sellerProductId}`),
    stopItem: vendorItemId => call("PUT", `${VENDOR_ITEMS}/${vendorItemId}/sales/stop`),
    resumeItem: vendorItemId => call("PUT", `${VENDOR_ITEMS}/${vendorItemId}/sales/resume`),
    updatePrice: (vendorItemId, price) => call("PUT", `${VENDOR_ITEMS}/${vendorItemId}/prices/${Math.round(price)}`, { query: "forceSalePriceUpdate=true" }),
    updateQuantity: (vendorItemId, quantity) => call("PUT", `${VENDOR_ITEMS}/${vendorItemId}/quantities/${Math.max(0, Math.round(quantity))}`)
  };
}

/* 승인된 상품이면 옵션ID(vendorItemId)가 생긴다 */
function vendorItemIdsOf(productResponse) {
  const items = productResponse?.data?.items || [];
  return items.map(item => item.vendorItemId).filter(Boolean);
}

module.exports = { createCoupangClient, authorization, signedDate, vendorItemIdsOf, CoupangError, SELLER_PRODUCTS, VENDOR_ITEMS };
