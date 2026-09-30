"use strict";
/* CAFE24: 권한 동의(OAuth) → 토큰 보관 → 상품 등록·판매중지·삭제 → 주문 수집·송장 등록을 가짜 CAFE24 서버로 확인한다. */
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

const { toCafe24Product } = require("../src/mappers");
const { authorizeUrl } = require("../src/cafe24");
const { createCredentialStore } = require("../src/store");
const { createApp, signState, readState } = require("../src/server");

function fakeCafe24() {
  const calls = [];
  let issued = 0;
  const server = http.createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const url = new URL(req.url, "http://x");
    calls.push({ method: req.method, path: url.pathname, query: url.search, headers: req.headers, body: raw });
    const json = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname === "/img/a.jpg") { res.writeHead(200, { "Content-Type": "image/jpeg" }); return res.end(Buffer.from([0xff, 0xd8, 0xff, 0xd9])); }
    if (url.pathname === "/api/v2/oauth/token") {
      if (req.headers.authorization !== `Basic ${Buffer.from("C24-ID:C24-SECRET").toString("base64")}`) return json(401, { error: "invalid_client" });
      issued += 1;
      return json(200, { access_token: `AT-${issued}`, refresh_token: `RT-${issued}`, expires_at: new Date(Date.now() + 7200_000).toISOString(), refresh_token_expires_at: new Date(Date.now() + 14 * 86400_000).toISOString(), scopes: ["mall.write_product"] });
    }
    if (!/^Bearer AT-\d+$/.test(req.headers.authorization || "")) return json(401, { error: { message: "invalid token" } });
    if (url.pathname === "/api/v2/admin/store") return json(200, { store: { mall_id: "doogoshop" } });
    if (req.method === "POST" && url.pathname === "/api/v2/admin/products/images") return json(200, { images: [{ path: "/web/product/big/a.jpg" }] });
    if (req.method === "POST" && url.pathname === "/api/v2/admin/products") return json(201, { product: { product_no: 501 } });
    if (req.method === "GET" && url.pathname === "/api/v2/admin/products/501/variants") return json(200, { variants: [{ variant_code: "P000000A000A" }, { variant_code: "P000000A000B" }] });
    if (req.method === "GET" && url.pathname === "/api/v2/admin/orders") return json(200, { orders: [{ order_id: "20260930-0000011", order_date: "2026-09-30T09:00:00+09:00", billing_name: "박카페", buyer_cellphone: "010-5555-6666", receivers: [{ name: "박카페", cellphone: "010-5555-6666", zipcode: "06253", address1: "서울특별시 강남구 강남대로146길 28", address2: "2층", shipping_message: "문 앞" }], items: [{ order_item_code: "20260930-0000011-01", product_no: 501, product_name: "사과 3kg", option_value: "3kg", quantity: 2, payment_amount: 59800, custom_product_code: "DF-1024" }] }] });
    return json(200, {});
  });
  return { server, calls };
}
function listen(server) { return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`))); }

test("CAFE24 매퍼: 조합형 옵션·면세·조건부 무료배송을 CAFE24 규격으로 보낸다", () => {
  const body = toCafe24Product({ title: "사과 3kg", salePrice: 29900, productCode: "DF-1024", options: [{ optionId: "O1", name: "3kg", salePrice: 29900 }, { optionId: "O2", name: "5kg", salePrice: 42900 }], taxType: "면세", shipping: { feeType: "CONDITIONAL_FREE", fee: 3000, freeOver: 30000 } }, { imagePath: "/web/a.jpg" });
  assert.equal(body.price, 29900); assert.equal(body.selling, "T"); assert.equal(body.display, "T");
  assert.equal(body.has_option, "T"); assert.deepEqual(body.options, [{ name: "옵션", value: ["3kg", "5kg"] }]);
  assert.equal(body.tax_type, "B"); assert.equal(body.shipping_fee_type, "D"); assert.equal(body.detail_image, "/web/a.jpg");
});

test("CAFE24 권한 동의 주소·state 서명: 위조된 state는 거절한다", () => {
  const url = new URL(authorizeUrl({ mallId: "doogoshop", state: "S", redirectUri: "https://api.doogo.kr/cb", clientId: "C24-ID" }));
  assert.equal(url.host, "doogoshop.cafe24api.com");
  assert.equal(url.searchParams.get("client_id"), "C24-ID");
  assert.match(url.searchParams.get("scope"), /mall\.write_product/);
  const state = signState({ seller: "seller", mallId: "doogoshop", exp: Date.now() + 60_000 }, "T");
  assert.equal(readState(state, "T").mallId, "doogoshop");
  assert.equal(readState(state, "WRONG"), null);
  assert.equal(readState(signState({ seller: "s", mallId: "m", exp: Date.now() - 1 }, "T"), "T"), null);
});

test("서버 전체 흐름: CAFE24 연결(권한 동의) → 상품 등록 → 판매중지 → 삭제 → 주문 수집 → 송장", async () => {
  const upstream = fakeCafe24();
  const base = await listen(upstream.server);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doogo-c24-"));
  const env = { CAFE24_CLIENT_ID: process.env.CAFE24_CLIENT_ID, CAFE24_CLIENT_SECRET: process.env.CAFE24_CLIENT_SECRET, CAFE24_REDIRECT_URI: process.env.CAFE24_REDIRECT_URI };
  Object.assign(process.env, { CAFE24_CLIENT_ID: "C24-ID", CAFE24_CLIENT_SECRET: "C24-SECRET", CAFE24_REDIRECT_URI: "https://api.doogo.kr/api/channels/cafe24/oauth/callback" });
  const store = createCredentialStore({ file: path.join(dir, "c.json"), key: crypto.randomBytes(32) });
  const app = createApp({ store, token: "T", clientOptions: { baseUrl: base } });
  const api = await listen(app);
  const call = async (method, p, body) => { const res = await fetch(`${api}${p}`, { method, headers: { Authorization: "Bearer T", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); return { status: res.status, data: await res.json().catch(() => ({})) }; };
  try {
    const first = await call("POST", "/api/channels/cafe24/connect", { sellerLoginId: "seller", credentials: { mallId: "doogoshop" } });
    assert.equal(first.data.needsAuthorization, true);
    const state = new URL(first.data.authorizeUrl).searchParams.get("state");
    const cb = await fetch(`${api}/api/channels/cafe24/oauth/callback?code=CODE1&state=${encodeURIComponent(state)}`);
    assert.equal(cb.status, 200);
    assert.equal(store.get("seller", "cafe24").refreshToken, "RT-1");
    const bad = await fetch(`${api}/api/channels/cafe24/oauth/callback?code=X&state=forged.sig`);
    assert.equal(bad.status, 400);
    const again = await call("POST", "/api/channels/cafe24/connect", { sellerLoginId: "seller", credentials: { mallId: "doogoshop" } });
    assert.equal(again.data.ok, true);

    const reg = await call("POST", "/api/listings", { sellerLoginId: "seller", channel: "cafe24", listing: { title: "사과 3kg", salePrice: 29900, productCode: "DF-1024", stock: 10, images: [`${base}/img/a.jpg`], options: [{ optionId: "O1", name: "3kg", salePrice: 29900, stock: 8 }, { optionId: "O2", name: "5kg", salePrice: 42900, stock: 4 }] } });
    assert.equal(reg.status, 200); assert.equal(reg.data.externalId, "501"); assert.equal(reg.data.variantMap.O2, "P000000A000B");
    const created = upstream.calls.find(c => c.method === "POST" && c.path === "/api/v2/admin/products");
    assert.equal(JSON.parse(created.body).request.detail_image, "/web/product/big/a.jpg");
    assert.ok(upstream.calls.some(c => c.method === "PUT" && c.path === "/api/v2/admin/products/501/variants/P000000A000B" && JSON.parse(c.body).request.additional_amount === "13000"));

    const stop = await call("POST", "/api/listings/cafe24/501/status", { sellerLoginId: "seller", action: "stop" });
    assert.equal(stop.data.status, "판매중지");
    assert.equal(JSON.parse(upstream.calls.filter(c => c.method === "PUT" && c.path === "/api/v2/admin/products/501").at(-1).body).request.selling, "F");
    const del = await call("DELETE", "/api/listings/cafe24/501", { sellerLoginId: "seller" });
    assert.equal(del.data.deleted, true);

    const col = await call("POST", "/api/orders/cafe24/collect", { sellerLoginId: "seller" });
    assert.equal(col.data.orders.length, 1);
    assert.equal(col.data.orders[0].refs.orderItemCode, "20260930-0000011-01");
    assert.equal(col.data.orders[0].amount, 59800); assert.equal(col.data.orders[0].sellerCode, "DF-1024");
    const dis = await call("POST", "/api/orders/cafe24/dispatch", { sellerLoginId: "seller", items: [{ refs: col.data.orders[0].refs, carrier: "CJ대한통운", tracking: "123456789012" }, { refs: col.data.orders[0].refs, carrier: "없는택배", tracking: "1234" }] });
    assert.deepEqual(dis.data.results.map(r => r.ok), [true, false]);
    const ship = upstream.calls.find(c => c.method === "POST" && c.path.endsWith("/shipments"));
    assert.equal(JSON.parse(ship.body).request.shipping_company_code, "0006");
  } finally {
    app.close(); upstream.server.close();
    Object.entries(env).forEach(([k, v]) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; });
  }
});
