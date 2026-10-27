"use strict";
/* 어드민플러스 Seller Open API를 문서 규격대로 흉내 내는 가짜 서버로, 두고 서버가 토큰·주문 등록·예치금 결제·운송장 조회를
   규격대로 부르는지 확인한다. (실제 도매몰 결과를 흉내 내는 데이터는 테스트 안에만 있다) */
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

const adminplus = require("../src/adminplus");
const { createCredentialStore } = require("../src/store");
const { createApp } = require("../src/server");

function listen(server) { return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`))); }

function fakeAdminPlus() {
  const calls = [];
  const state = { tokens: 0, deposit: 150000, registered: new Map(), expireNext: false, paid: new Set() };
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const url = new URL(req.url, "http://x");
    calls.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers: req.headers, body: raw });
    const json = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname === "/oauth/token") {
      const form = new URLSearchParams(raw);
      if (req.headers["content-type"] !== "application/x-www-form-urlencoded") return json(400, { success: false, message: "bad content type", data: {} });
      if (form.get("client_id") !== "CID" || form.get("client_secret") !== "CSECRET") return json(401, { success: false, message: "invalid client", data: {} });
      state.tokens += 1;
      return json(200, { success: true, message: "success", data: { token_type: "Bearer", access_token: `TOKEN-${state.tokens}`, expires_in: 2592000 } });
    }
    if (req.headers.authorization !== `Bearer TOKEN-${state.tokens}` || state.expireNext) { state.expireNext = false; return json(401, { success: false, message: "access token expired", data: {} }); }
    if (url.pathname === "/v1/seller/balance") return json(200, { success: true, message: "success", data: { point_balance: 0, deposit_balance: state.deposit, api_expires_at: "2027-01-31 23:59:59", api_daily_call_count: 12, api_rate_per_day: 10000 } });
    if (url.pathname === "/v1/seller/products") {
      const page2 = url.searchParams.get("cursor") === "P2";
      return json(200, { success: true, message: "success", data: { items: page2 ? [
        { product_code: 10000197, name: "단일 상품 사과즙", price: 9900, delivery_policy: { shipping_company: "한진택배", policy: "무료배송", details: "" }, stock: "soldout", status: "active", last_updated_date: "2026-10-20T10:00:00" }
      ] : [
        { product_code: 10000195, name: "경북 부사 사과", taxable: "면세", price: 18900, image: "https://cdn.example/a.jpg", shipping_origin: "경북 청송", delivery_policy: { shipping_company: "CJ대한통운", policy: "고정배송비", details: "3,000원" }, order_cutoff_time: "오후 2시", stock: "unlimited", status: "active", last_updated_date: "2026-10-26T09:00:00", option: [{ option_code: 428, option_name: "3kg", stock: "unlimited" }, { option_code: 429, option_name: "5kg", stock: "soldout" }] }
      ], next_cursor: page2 ? null : "P2", has_more: !page2 } });
    }
    if (url.pathname === "/v1/seller/orders" && req.method === "POST") {
      const body = JSON.parse(raw);
      const results = body.orders.map((order, index) => {
        if (state.registered.has(order.customer_order_code)) return { customer_order_code: order.customer_order_code, result: "failed", message: "중복 주문 코드입니다." };
        if (order.items.some(item => item.product_code === 99)) return { customer_order_code: order.customer_order_code, result: "failed", message: "매칭되는 상품이 없습니다." };
        const key = `OK-${order.customer_order_code}`;
        const amount = order.items.reduce((sum, item) => sum + item.qty * 18900, 0) + 3000;
        state.registered.set(order.customer_order_code, { key, amount, code: `26102700${index}` });
        return { customer_order_code: order.customer_order_code, result: "registered", order_key: key, adminplus_order_code: `26102700${index}` };
      });
      return json(200, { success: true, message: "accepted", data: { batch_status: "accepted", results } });
    }
    if (url.pathname === "/v1/seller/orders" && req.method === "GET") {
      const entry = state.registered.get(url.searchParams.get("customer_order_code"));
      return json(200, { success: true, message: "success", data: { orders: entry ? [{ order_code: entry.code, total_payment: entry.amount, payment_status: state.paid.has(entry.key) ? "paid" : "unpaid", order_producs: [] }] : [], next_cursor: null, has_more: false } });
    }
    if (url.pathname === "/v1/seller/payments/pending") {
      const entry = [...state.registered.values()].find(row => row.key === url.searchParams.get("order_key") && !state.paid.has(row.key));
      return json(200, { success: true, message: "success", data: { datas: entry ? [{ tmep_idx: 1, regdate: "2026-10-27T00:05:00", total_amount: entry.amount, order_key: entry.key }] : [], next_cursor: null, has_more: false } });
    }
    if (url.pathname === "/v1/seller/payments" && req.method === "POST") {
      const body = JSON.parse(raw);
      const entry = [...state.registered.values()].find(row => row.key === body.order_key[0]);
      const total = body.payments.reduce((sum, row) => sum + row.amount, 0);
      if (!entry || state.paid.has(entry.key)) return json(409, { success: false, message: "conflict", data: {} });
      if (total !== entry.amount) return json(400, { success: false, message: "결제금액이 주문금액과 일치하지 않습니다.", data: {} });
      if (state.deposit < total) return json(400, { success: false, message: "예치금이 부족합니다.", data: {} });
      state.deposit -= total; state.paid.add(entry.key);
      return json(200, { success: true, message: "success", data: { payment_key: `PAY-${entry.key}` } });
    }
    if (url.pathname === "/v1/seller/orders/changed") {
      return json(200, { success: true, message: "success", data: { orders: [
        { order_code: "261027000", status: "active", payment_status: "paid", order_producs: [{ customer_order_code: "DO-261027-A1", status: "shipping", shipping_company: "CJ대한통운", tracking_number: "512345678901", related_trackings: [{ shipping_company: "CJ대한통운", tracking_number: "512345678902" }], shipping_date: "2026-10-27T15:00:00" }] },
        { order_code: "261027001", status: "active", payment_status: "paid", order_producs: [{ customer_order_code: "DO-261027-A2", status: "cancelled", tracking_number: "" }] },
        { order_code: "261027002", status: "active", payment_status: "paid", order_producs: [{ customer_order_code: "DO-261027-A3", status: "preparing_shipment", tracking_number: "" }] }
      ], next_cursor: null, has_more: false } });
    }
    return json(404, { success: false, message: "not found", data: {} });
  });
  return { server, calls, state };
}

const order = (id, extra = {}) => ({ doogoOrderId: id, recipientName: "오귤이", phone: "010-2231-8840", postalCode: "06236", address: "서울특별시 강남구 테헤란로 152", addressDetail: "12층", deliveryMessage: "문 앞", items: [{ productCode: 10000195, optionCode: 428, qty: 1 }], maxAmount: 21900, ...extra });

test("어드민플러스: 상품 옵션을 두고 도매몰 상품 줄로 바꾼다 (배송비·품절·코드)", () => {
  const rows = adminplus.toWholesaleItems("WM-09", { product_code: 10000195, name: "사과", price: 18900, delivery_policy: { policy: "고정배송비", details: "3,000원" }, stock: "unlimited", status: "active", option: [{ option_code: 428, option_name: "3kg", stock: 5 }, { option_code: 429, option_name: "5kg", stock: "soldout" }] }, "2026-10-27T06:00:00");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, "AP-WM-09-10000195-428");
  assert.equal(rows[0].shipping, 3000);
  assert.equal(rows[0].apOptionCode, 428);
  assert.equal(rows[0].soldOut, false);
  assert.equal(rows[1].soldOut, true);
  assert.equal(adminplus.shippingFee({ policy: "무료배송", details: "" }), 0);
  const single = adminplus.toWholesaleItems("WM-09", { product_code: 7, name: "단품", price: 1000, stock: 0, status: "active" }, "t");
  assert.equal(single[0].code, "7");
  assert.equal(single[0].soldOut, true);
  assert.equal(single[0].apOptionCode, null);
});

test("어드민플러스: 주문 변경분에서 운송장·취소를 두고 주문번호별로 정리한다", () => {
  const updates = adminplus.toTrackingUpdates([{ order_code: "A", status: "active", payment_status: "paid", order_producs: [{ customer_order_code: "DO-1", status: "delivered", shipping_company: "한진택배", tracking_number: "111", related_trackings: [{ tracking_number: "222" }] }] }, { order_code: "B", status: "deleted", order_producs: [{ customer_order_code: "DO-2", status: "deleted" }] }]);
  assert.deepEqual(updates.map(row => [row.doogoOrderId, row.status, row.tracking]), [["DO-1", "shipped", "111"], ["DO-2", "cancelled", ""]]);
  assert.deepEqual(updates[0].extraTrackings, ["222"]);
});

test("어드민플러스 서버 연동: 연결 → 상품 동기화 → 발주(등록+예치금) → 재전송 → 운송장", async () => {
  const upstream = fakeAdminPlus();
  const base = await listen(upstream.server);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "doogo-ap-")), "creds.json");
  const app = createApp({ store: createCredentialStore({ file, key: crypto.randomBytes(32) }), token: "T", adminplusOptions: { baseUrl: base } });
  const appBase = await listen(app);
  const call = async (method, route, body) => {
    const res = await fetch(`${appBase}${route}`, { method, headers: { Authorization: "Bearer T", "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  try {
    // 연결 전에는 막는다
    assert.equal((await call("POST", "/api/wholesale/adminplus/WM-09/products/sync", {})).status, 409);
    // 키가 틀리면 알아볼 수 있는 말로
    const wrong = await call("POST", "/api/wholesale/adminplus/WM-09/connect", { clientId: "CID", clientSecret: "nope" });
    assert.equal(wrong.status, 502);
    assert.match(wrong.body.error, /client_id·client_secret이 맞지 않아요/);
    // 연결: 토큰 발급(form) + 잔액 조회로 확인, 시크릿은 응답·파일에 평문으로 남기지 않는다
    const ok = await call("POST", "/api/wholesale/adminplus/WM-09/connect", { clientId: "CID", clientSecret: "CSECRET" });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.balance.deposit, 150000);
    assert.equal(ok.body.balance.dailyLimit, 10000);
    assert.ok(!JSON.stringify(ok.body).includes("CSECRET"));
    assert.ok(!fs.readFileSync(file, "utf8").includes("CSECRET"));
    const tokenCalls = upstream.calls.filter(row => row.path === "/oauth/token").length;

    // 상품 동기화: 커서를 끝까지 따라가고, 저장된 토큰을 다시 쓴다
    const sync = await call("POST", "/api/wholesale/adminplus/WM-09/products/sync", {});
    assert.equal(sync.status, 200);
    assert.equal(sync.body.productCount, 2);
    assert.deepEqual(sync.body.items.map(item => [item.code, item.soldOut]), [["10000195-428", false], ["10000195-429", true], ["10000197", true]]);
    assert.equal(upstream.calls.filter(row => row.path === "/oauth/token").length, tokenCalls);
    assert.equal(upstream.calls.find(row => row.path === "/v1/seller/products").query.limit, "500");

    // 발주: 1건 정상, 1건 매칭 실패, 1건 도매몰 금액이 선결제액보다 큼
    const placed = await call("POST", "/api/wholesale/adminplus/WM-09/orders", { orders: [order("DO-261027-A1"), order("DO-261027-BAD", { items: [{ productCode: 99, qty: 1 }] }), order("DO-261027-A2", { items: [{ productCode: 10000195, optionCode: 428, qty: 2 }], maxAmount: 30000 })] });
    assert.equal(placed.status, 200);
    const byId = Object.fromEntries(placed.body.results.map(row => [row.doogoOrderId, row]));
    assert.equal(byId["DO-261027-A1"].result, "paid");
    assert.equal(byId["DO-261027-A1"].amount, 21900);
    assert.equal(byId["DO-261027-BAD"].result, "failed");
    assert.match(byId["DO-261027-BAD"].message, /매칭되는 상품이 없습니다/);
    assert.equal(byId["DO-261027-A2"].result, "unpaid");
    assert.match(byId["DO-261027-A2"].message, /선결제액/);
    assert.equal(upstream.state.deposit, 150000 - 21900);
    const registerBody = JSON.parse(upstream.calls.find(row => row.path === "/v1/seller/orders" && row.method === "POST").body);
    assert.equal(registerBody.partial, true);
    assert.equal(registerBody.orders[0].customer_order_code, "DO-261027-A1");
    assert.equal(registerBody.orders[0].receiver_hp, "010-2231-8840");
    assert.deepEqual(registerBody.orders[0].items, [{ product_code: 10000195, option_code: 428, qty: 1 }]);
    const payBody = JSON.parse(upstream.calls.find(row => row.path === "/v1/seller/payments" && row.method === "POST").body);
    assert.deepEqual(payBody, { order_key: ["OK-DO-261027-A1"], payments: [{ method: "deposit", amount: 21900 }, { method: "point", amount: 0 }] });

    // 금액 확인 뒤 결제 (한도를 올려서)
    const paid = await call("POST", "/api/wholesale/adminplus/WM-09/orders/pay", { orderKey: byId["DO-261027-A2"].orderKey, maxAmount: 40800 });
    assert.equal(paid.status, 200);
    assert.equal(paid.body.amount, 40800);

    // 같은 두고 주문을 다시 보내면 중복으로 막히고, 이미 결제된 주문으로 이어 간다 (두 번 결제하지 않음)
    const again = await call("POST", "/api/wholesale/adminplus/WM-09/orders", { orders: [order("DO-261027-A1")] });
    assert.equal(again.body.results[0].result, "paid");
    assert.match(again.body.results[0].message, /이미 발주·결제된/);
    assert.equal(upstream.state.deposit, 150000 - 21900 - 40800);

    // 토큰이 만료되면 한 번 새로 받아 이어 간다
    upstream.state.expireNext = true;
    const changed = await call("POST", "/api/wholesale/adminplus/WM-09/orders/changed", { since: "2026-10-26T00:00:00" });
    assert.equal(changed.status, 200);
    assert.deepEqual(changed.body.updates.map(row => [row.doogoOrderId, row.status, row.tracking]), [["DO-261027-A1", "shipped", "512345678901"], ["DO-261027-A2", "cancelled", ""], ["DO-261027-A3", "preparing_shipment", ""]]);
    assert.equal(upstream.calls.find(row => row.path === "/v1/seller/orders/changed").query.updated_since, "2026-10-26T00:00:00");
    assert.equal((await call("POST", "/api/wholesale/adminplus/WM-09/orders/changed", { since: "어제" })).status, 400);

    // 연결 해제하면 키가 지워진다
    assert.equal((await call("DELETE", "/api/wholesale/adminplus/WM-09", {})).status, 200);
    assert.equal((await call("GET", "/api/wholesale/adminplus/WM-09/balance")).status, 409);
    assert.equal((await call("POST", "/api/wholesale/adminplus/..%2Fx/connect", { clientId: "a", clientSecret: "b" })).status, 400);
  } finally {
    app.close(); upstream.server.close();
  }
});
