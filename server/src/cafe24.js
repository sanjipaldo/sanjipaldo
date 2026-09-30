"use strict";
/* CAFE24 Admin API 클라이언트 (자사몰)
   - 두고는 CAFE24 개발자센터에 앱 하나(client_id/secret)를 등록해 두고, 셀러는 자기 쇼핑몰 관리자에서 그 앱을 설치(권한 동의)만 한다.
     그래서 셀러에게는 쇼핑몰 ID(mall_id)만 받는다. 셀러의 비밀번호나 개인 앱 키는 받지 않는다.
   - 인증: OAuth 2.0 (authorization code)
       권한 동의  GET  https://{mall_id}.cafe24api.com/api/v2/oauth/authorize?response_type=code&client_id=…&state=…&redirect_uri=…&scope=…
       토큰 발급  POST https://{mall_id}.cafe24api.com/api/v2/oauth/token  (Basic base64(client_id:client_secret), grant_type=authorization_code)
       토큰 갱신  같은 주소, grant_type=refresh_token   · access token 2시간 / refresh token 2주 (갱신할 때마다 새 refresh token)
   - 상품: POST/PUT/DELETE /api/v2/admin/products · 판매 여부 selling(T/F) · 진열 display(T/F) · 재고는 품목(variant)별 inventories
   - 주문: GET /api/v2/admin/orders (결제완료 N10 → 상품준비중 N20) · 송장: POST /api/v2/admin/orders/{order_id}/shipments */
const DEFAULT_SCOPE = "mall.read_product,mall.write_product,mall.read_order,mall.write_order,mall.read_store";
const API_VERSION = process.env.CAFE24_API_VERSION || "2025-06-01";

class Cafe24Error extends Error {
  constructor(message, status, body) { super(message); this.name = "Cafe24Error"; this.status = status; this.body = body; }
}

const mallBase = (mallId, override) => override || `https://${mallId}.cafe24api.com`;
const validMallId = mallId => /^[a-z0-9][a-z0-9-]{2,29}$/.test(String(mallId || ""));

function authorizeUrl({ mallId, state, redirectUri, clientId = process.env.CAFE24_CLIENT_ID, scope = DEFAULT_SCOPE, baseUrl }) {
  if (!validMallId(mallId)) throw Object.assign(new Error("CAFE24 쇼핑몰 ID(영문 소문자·숫자)를 확인해 주세요."), { status: 400 });
  if (!clientId) throw Object.assign(new Error("두고 서버에 CAFE24 앱(client_id)이 설정되지 않았어요."), { status: 503 });
  const query = new URLSearchParams({ response_type: "code", client_id: clientId, state, redirect_uri: redirectUri, scope });
  return `${mallBase(mallId, baseUrl)}/api/v2/oauth/authorize?${query}`;
}

async function tokenRequest({ mallId, form, clientId, clientSecret, baseUrl, fetchImpl }) {
  if (!clientId || !clientSecret) throw Object.assign(new Error("두고 서버에 CAFE24 앱(client_id/secret)이 설정되지 않았어요."), { status: 503 });
  const res = await fetchImpl(`${mallBase(mallId, baseUrl)}/api/v2/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Cafe24Error(data.error_description || data.error || `CAFE24 토큰 발급 실패 (${res.status})`, res.status, data);
  return { mallId, accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.parse(data.expires_at) || Date.now() + 2 * 3600 * 1000, refreshExpiresAt: Date.parse(data.refresh_token_expires_at) || 0, scopes: data.scopes || [] };
}

/* 권한 동의 뒤 돌아온 code로 토큰을 받는다 */
function exchangeCode({ mallId, code, redirectUri }, { clientId = process.env.CAFE24_CLIENT_ID, clientSecret = process.env.CAFE24_CLIENT_SECRET, baseUrl = process.env.CAFE24_API_BASE, fetchImpl = fetch } = {}) {
  return tokenRequest({ mallId, form: { grant_type: "authorization_code", code, redirect_uri: redirectUri }, clientId, clientSecret, baseUrl, fetchImpl });
}

/* creds: { mallId, accessToken, refreshToken, expiresAt } · onTokens: 갱신된 토큰을 보관소에 다시 저장하는 콜백 */
function createCafe24Client(creds, { clientId = process.env.CAFE24_CLIENT_ID, clientSecret = process.env.CAFE24_CLIENT_SECRET, baseUrl = process.env.CAFE24_API_BASE, fetchImpl = fetch, now = () => Date.now(), onTokens } = {}) {
  const { mallId } = creds || {};
  if (!validMallId(mallId)) throw new Error("CAFE24 쇼핑몰 ID가 필요해요.");
  if (!creds.refreshToken && !creds.accessToken) throw Object.assign(new Error("CAFE24 앱 설치(권한 동의)가 아직 끝나지 않았어요. 쇼핑몰 연동에서 다시 연결해 주세요."), { status: 409 });
  let tokens = { ...creds };

  async function token() {
    if (tokens.accessToken && Number(tokens.expiresAt || 0) - 60_000 > now()) return tokens.accessToken;
    tokens = { ...tokens, ...(await tokenRequest({ mallId, form: { grant_type: "refresh_token", refresh_token: tokens.refreshToken }, clientId, clientSecret, baseUrl, fetchImpl })) };
    if (onTokens) await onTokens(tokens);
    return tokens.accessToken;
  }

  async function call(method, path, { query, body } = {}) {
    const qs = query ? `?${new URLSearchParams(query)}` : "";
    const res = await fetchImpl(`${mallBase(mallId, baseUrl)}/api/v2/admin${path}${qs}`, {
      method,
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", "X-Cafe24-Api-Version": API_VERSION },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!res.ok) throw new Cafe24Error(data.error?.message || `CAFE24 API 오류 (${res.status})`, res.status, data);
    return data;
  }

  return {
    mallId,
    /* 연결 확인: 쇼핑몰 기본 정보 */
    verify: () => call("GET", "/store"),
    createProduct: request => call("POST", "/products", { body: { shop_no: 1, request } }),
    getProduct: productNo => call("GET", `/products/${productNo}`),
    updateProduct: (productNo, request) => call("PUT", `/products/${productNo}`, { body: { shop_no: 1, request } }),
    deleteProduct: productNo => call("DELETE", `/products/${productNo}`),
    uploadImages: base64List => call("POST", "/products/images", { body: { requests: base64List.map(image => ({ image })) } }),
    listVariants: productNo => call("GET", `/products/${productNo}/variants`),
    updateVariant: (productNo, variantCode, request) => call("PUT", `/products/${productNo}/variants/${variantCode}`, { body: { shop_no: 1, request } }),
    updateInventory: (productNo, variantCode, quantity) => call("PUT", `/products/${productNo}/variants/${variantCode}/inventories`, { body: { shop_no: 1, request: { use_inventory: "T", display_soldout: "T", quantity: Math.max(0, Math.round(quantity)) } } }),
    /* 주문: 결제완료(N10) 주문 조회 → 상품준비중(N20)으로 → 송장 등록 */
    listOrders: ({ startDate, endDate, status = "N10", offset = 0 }) => call("GET", "/orders", { query: { shop_no: 1, start_date: startDate, end_date: endDate, order_status: status, embed: "items,receivers", limit: 100, offset } }),
    setOrderItemsStatus: (orderId, orderItemCodes, status = "N20") => call("PUT", `/orders/${orderId}/items`, { body: { shop_no: 1, requests: orderItemCodes.map(order_item_code => ({ order_item_code, status })) } }),
    createShipment: (orderId, request) => call("POST", `/orders/${orderId}/shipments`, { body: { shop_no: 1, request } }),
    updateShipment: (orderId, shippingCode, request) => call("PUT", `/orders/${orderId}/shipments/${shippingCode}`, { body: { shop_no: 1, request } })
  };
}

/* CAFE24 택배사 코드 (shipping_company_code) */
const CAFE24_CARRIERS = { "CJ대한통운": "0006", "한진택배": "0018", "롯데택배": "0079", "우체국택배": "0012", "로젠택배": "0004", "경동택배": "0039", "대신택배": "0002", "일양로지스": "0011", "천일택배": "0016", "합동택배": "0047" };

module.exports = { createCafe24Client, authorizeUrl, exchangeCode, validMallId, Cafe24Error, CAFE24_CARRIERS, DEFAULT_SCOPE };
