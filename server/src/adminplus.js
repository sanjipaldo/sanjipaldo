"use strict";
/* 어드민플러스 Seller Open API 클라이언트 (https://api.adminplus.co.kr, 문서: www.adminplus.co.kr/api/docs/seller)
   - 도매몰(파밍·늘푸른우리 같은 어드민플러스 운영사)마다 (주)두고홀딩스가 거래처(협력사)로 가입하고,
     그 도매몰에서 발급받은 client_id·client_secret으로 토큰을 받는다. 그래서 키는 도매몰마다 하나씩이다.
   - 토큰: POST /oauth/token (form-urlencoded) → 30일 유효. 유효한 토큰이 있으면 같은 토큰을 다시 준다.
   - 주문 흐름: 주문 등록(customer_order_code = 두고 주문번호) → 결제 접수(예치금 전액) → 주문 조회로 상태·운송장.
   - 응답은 항상 { success, message, data }. 목록은 next_cursor·has_more 커서 방식. */

const DEFAULT_BASE = "https://api.adminplus.co.kr";
const PAGE_LIMIT = 500;
const MAX_PAGES = 40; // 상품 2만 개까지 (일 호출 한도 1만 건 안에서 여유 있게)

class AdminPlusError extends Error {
  constructor(message, status, body) { super(message); this.name = "AdminPlusError"; this.status = status; this.body = body; }
}

/* 어드민플러스가 영어로 돌려주는 대표 오류를 운영자가 바로 알아볼 말로 바꾼다 */
function friendlyMessage(status, message) {
  const text = String(message || "");
  if (status === 401 && /invalid client/i.test(text)) return "client_id·client_secret이 맞지 않아요. 도매몰에서 발급받은 값을 다시 확인해 주세요.";
  if (status === 401 && /expired/i.test(text)) return "어드민플러스 API 사용 기간이 끝났어요. 도매몰에 API 사용 연장을 요청해 주세요.";
  if (status === 403 && /permission/i.test(text)) return "이 기능의 API 권한(scope)이 없어요. 도매몰에 권한 추가를 요청해 주세요.";
  if (status === 403) return `허용되지 않은 접근이에요 (IP 화이트리스트를 확인해 주세요). ${text}`.trim();
  if (status === 429 && /daily/i.test(text)) return "오늘 어드민플러스 API 호출 한도를 넘었어요. 내일 다시 시도하거나 도매몰에 한도 상향을 요청해 주세요.";
  if (status === 429) return "어드민플러스 호출이 너무 잦아요. 잠시 뒤 다시 시도해 주세요.";
  return text || `어드민플러스 API 오류 (${status})`;
}

/* 날짜: 어드민플러스는 YYYY-MM-DDTHH:ii:ss (한국 시간) */
function kstStamp(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 19);
}

function createAdminPlusClient(credentials, { baseUrl = process.env.ADMINPLUS_API_BASE || DEFAULT_BASE, fetchImpl = fetch, onToken, now = () => Date.now() } = {}) {
  const { clientId, clientSecret } = credentials || {};
  if (!clientId || !clientSecret) throw new Error("어드민플러스 client_id·client_secret이 모두 필요해요.");
  let token = credentials.accessToken && Number(credentials.tokenExpiresAt) > now() + 60_000 ? { accessToken: credentials.accessToken, expiresAt: Number(credentials.tokenExpiresAt) } : null;

  async function parse(res) {
    const text = await res.text();
    try { return text ? JSON.parse(text) : {}; } catch { return { raw: text.slice(0, 500) }; }
  }

  async function issueToken() {
    const res = await fetchImpl(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret }).toString()
    });
    const data = await parse(res);
    if (!res.ok || data.success === false || !data.data?.access_token) throw new AdminPlusError(friendlyMessage(res.status, data.message), res.status, data);
    token = { accessToken: data.data.access_token, expiresAt: now() + Number(data.data.expires_in || 0) * 1000 };
    if (onToken) onToken(token);
    return token;
  }

  async function call(method, path, { query, body } = {}, retried = false) {
    if (!token) await issueToken();
    const qs = query ? new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== "").map(([key, value]) => [key, String(value)])).toString() : "";
    const res = await fetchImpl(`${baseUrl}${path}${qs ? `?${qs}` : ""}`, {
      method,
      headers: { Authorization: `Bearer ${token.accessToken}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await parse(res);
    /* 토큰이 만료됐으면 한 번만 새로 받아 다시 부른다 (키 자체가 틀리면 issueToken에서 멈춘다) */
    if (res.status === 401 && !retried) { token = null; return call(method, path, { query, body }, true); }
    if (!res.ok || data.success === false) throw new AdminPlusError(friendlyMessage(res.status, data.message), res.status, data);
    return data.data || {};
  }

  async function paged(path, query, listKey, maxPages = MAX_PAGES) {
    const rows = [];
    let cursor = "";
    for (let page = 0; page < maxPages; page += 1) {
      const data = await call("GET", path, { query: { ...query, limit: PAGE_LIMIT, cursor } });
      rows.push(...(data[listKey] || []));
      if (!data.has_more || !data.next_cursor) return { rows, complete: true };
      cursor = data.next_cursor;
    }
    return { rows, complete: false };
  }

  return {
    issueToken,
    balance: () => call("GET", "/v1/seller/balance"),
    banks: () => call("GET", "/v1/seller/banks"),
    listProducts: () => paged("/v1/seller/products", { status: "active" }, "items"),
    changedProducts: since => paged("/v1/seller/products/changed", { updated_since: since }, "items"),
    /* partial: true → 통과한 주문만 저장되고 주문마다 결과(registered·failed·unknown)가 온다 */
    registerOrders: orders => call("POST", "/v1/seller/orders", { body: { partial: true, orders } }),
    findOrder: customerOrderCode => call("GET", "/v1/seller/orders", { query: { customer_order_code: customerOrderCode } }),
    changedOrders: since => paged("/v1/seller/orders/changed", { updated_since: since }, "orders"),
    deleteOrder: orderKey => call("POST", "/v1/seller/orders/delete", { body: { order_key: orderKey } }),
    pendingPayment: orderKey => call("GET", "/v1/seller/payments/pending", { query: { order_key: orderKey } }),
    /* 예치금 전액 결제: 접수와 동시에 결제 완료. 금액은 주문 금액과 정확히 같아야 한다 */
    payWithDeposit: (orderKeys, amount) => call("POST", "/v1/seller/payments", { body: { order_key: orderKeys, payments: [{ method: "deposit", amount }, { method: "point", amount: 0 }] } }),
    claims: (claimType, since) => paged("/v1/seller/claims", { claim_type: claimType, updated_since: since }, "orders")
  };
}

/* ----- 두고 형식으로 바꾸기 ----- */

/* 배송정책 details 예: "3000원", "3,000원 (3만원 이상 무료)" → 기본 배송비 숫자 */
function shippingFee(policy = {}) {
  if (/무료/.test(policy.policy || "") && !/조건/.test(policy.policy || "")) return 0;
  const match = String(policy.details || "").replace(/,/g, "").match(/(\d+)\s*원/);
  return match ? Number(match[1]) : 0;
}
function stockSoldOut(stock) { return stock === "soldout" || stock === 0 || stock === "0"; }

/* 상품 1개(옵션 n개) → 두고 도매몰 상품 n줄. 발주 때 쓸 product_code·option_code를 그대로 들고 간다 */
function toWholesaleItems(mallId, product, checkedAt) {
  const base = {
    mallId,
    name: String(product.name || "").slice(0, 120),
    category: "",
    cost: Math.max(0, Math.round(Number(product.price) || 0)),
    shipping: shippingFee(product.delivery_policy),
    shippingNote: [product.delivery_policy?.policy, product.delivery_policy?.details].filter(Boolean).join(" · ").slice(0, 80),
    carrier: String(product.delivery_policy?.shipping_company || ""),
    origin: String(product.shipping_origin || ""),
    cutoff: String(product.order_cutoff_time || ""),
    image: /^https:\/\//.test(product.image || "") ? product.image : "",
    taxable: product.taxable || "",
    apProductCode: Number(product.product_code),
    updatedAt: product.last_updated_date || "",
    checkedAt
  };
  const deleted = product.status && product.status !== "active";
  const options = Array.isArray(product.option) ? product.option : [];
  if (!options.length) return [{ ...base, id: `AP-${mallId}-${product.product_code}`, code: String(product.product_code), option: "", apOptionCode: null, soldOut: deleted || stockSoldOut(product.stock), stock: product.stock ?? null, removed: Boolean(deleted) }];
  return options.map(option => ({ ...base, id: `AP-${mallId}-${product.product_code}-${option.option_code}`, code: `${product.product_code}-${option.option_code}`, option: String(option.option_name || "").slice(0, 60), apOptionCode: Number(option.option_code), soldOut: deleted || stockSoldOut(product.stock) || stockSoldOut(option.stock), stock: option.stock ?? null, removed: Boolean(deleted) }));
}

/* 두고 주문 → 어드민플러스 주문 등록 본문 */
function toAdminPlusOrder(order) {
  const phone = String(order.phone || "").trim();
  const items = (order.items || []).map(item => ({ product_code: Number(item.productCode), ...(item.optionCode ? { option_code: Number(item.optionCode) } : {}), qty: Math.max(1, Math.round(Number(item.qty) || 1)) }));
  return {
    customer_order_code: String(order.doogoOrderId),
    receiver_name: String(order.recipientName || "").slice(0, 40),
    receiver_tel: phone,
    receiver_hp: phone,
    receiver_zipcode: String(order.postalCode || ""),
    receiver_addr1: String(order.address || ""),
    receiver_addr2: String(order.addressDetail || ""),
    delivery_msg: String(order.deliveryMessage || "").slice(0, 100),
    items
  };
}

/* 주문 변경분 → 두고 주문번호별 진행 상황 (운송장·취소) */
const SHIPPED = new Set(["shipping", "delivered", "completed"]);
const CANCELLED = new Set(["cancelled", "refunded", "returned", "deleted"]);
function toTrackingUpdates(orders) {
  const byDoogo = new Map();
  for (const order of orders || []) {
    for (const line of order.order_producs || order.order_products || []) {
      const code = line.customer_order_code;
      if (!code) continue;
      const prev = byDoogo.get(code) || { doogoOrderId: code, orderCode: order.order_code, statuses: [], trackings: [], paymentStatus: order.payment_status, orderStatus: order.status };
      prev.statuses.push(line.status);
      if (line.tracking_number) prev.trackings.push({ carrier: line.shipping_company || "", tracking: String(line.tracking_number), shippedAt: line.shipping_date || "" });
      for (const extra of line.related_trackings || []) if (extra.tracking_number) prev.trackings.push({ carrier: extra.shipping_company || "", tracking: String(extra.tracking_number), shippedAt: line.shipping_date || "" });
      byDoogo.set(code, prev);
    }
  }
  return [...byDoogo.values()].map(entry => {
    const cancelled = entry.orderStatus === "deleted" || (entry.statuses.length && entry.statuses.every(status => CANCELLED.has(status)));
    const first = entry.trackings[0] || null;
    return {
      doogoOrderId: entry.doogoOrderId,
      orderCode: entry.orderCode,
      status: cancelled ? "cancelled" : first && entry.statuses.some(status => SHIPPED.has(status)) ? "shipped" : entry.statuses[0] || "",
      carrier: first?.carrier || "",
      tracking: first?.tracking || "",
      extraTrackings: entry.trackings.slice(1).map(item => item.tracking),
      shippedAt: first?.shippedAt || "",
      paid: entry.paymentStatus === "paid"
    };
  });
}

/* 등록 → 금액 확인 → 예치금 결제를 주문마다 따로 한다. 한 주문이 실패해도 다른 주문은 그대로 진행된다.
   maxAmount(셀러가 두고에 선결제한 도매몰 몫)보다 어드민플러스 금액이 크면 결제하지 않고 ‘금액 확인 필요’로 돌려준다. */
async function placeOrders(client, orders) {
  const valid = orders.filter(order => order.doogoOrderId && (order.items || []).length);
  const results = new Map(valid.map(order => [String(order.doogoOrderId), { doogoOrderId: String(order.doogoOrderId), result: "failed", message: "" }]));
  for (let start = 0; start < valid.length; start += 100) {
    const chunk = valid.slice(start, start + 100);
    const data = await client.registerOrders(chunk.map(toAdminPlusOrder));
    for (const row of data.results || []) {
      const entry = results.get(String(row.customer_order_code));
      if (!entry) continue;
      Object.assign(entry, { result: row.result, orderKey: row.order_key || "", orderCode: row.adminplus_order_code || "", message: row.message || "" });
    }
  }
  for (const order of valid) {
    const entry = results.get(String(order.doogoOrderId));
    /* 같은 두고 주문번호가 이미 있으면(재전송) 어드민플러스에 남은 주문을 찾아 이어 간다 */
    if (entry.result === "failed" && /중복/.test(entry.message)) {
      const found = await client.findOrder(entry.doogoOrderId);
      const existing = (found.orders || [])[0];
      if (existing) { Object.assign(entry, { result: existing.payment_status === "paid" ? "paid" : "exists", orderCode: existing.order_code, amount: Number(existing.total_payment) || 0, message: existing.payment_status === "paid" ? "이미 발주·결제된 주문이에요." : "이미 등록돼 있고 결제가 안 된 주문이에요. 도매몰 사이트에서 금액을 확인해 결제해 주세요." }); }
      continue;
    }
    if (entry.result !== "registered" || !entry.orderKey) continue;
    const pending = await client.pendingPayment(entry.orderKey);
    const amount = Number((pending.datas || []).find(row => row.order_key === entry.orderKey)?.total_amount ?? (pending.datas || [])[0]?.total_amount ?? 0);
    entry.amount = amount;
    const limit = Number(order.maxAmount);
    if (!amount) { entry.result = "unpaid"; entry.message = "결제 금액을 확인하지 못했어요. 도매몰에서 확인해 주세요."; continue; }
    if (Number.isFinite(limit) && limit > 0 && amount > limit) { entry.result = "unpaid"; entry.message = `도매몰 금액 ${amount.toLocaleString("ko-KR")}원이 선결제액 ${limit.toLocaleString("ko-KR")}원보다 커서 결제하지 않았어요.`; continue; }
    try {
      const paid = await client.payWithDeposit([entry.orderKey], amount);
      Object.assign(entry, { result: "paid", paymentKey: paid.payment_key || "", message: "" });
    } catch (error) {
      Object.assign(entry, { result: "unpaid", message: error.message });
    }
  }
  return [...results.values()];
}

module.exports = { createAdminPlusClient, AdminPlusError, friendlyMessage, kstStamp, toWholesaleItems, toAdminPlusOrder, toTrackingUpdates, placeOrders, shippingFee, DEFAULT_BASE };
