"use strict";
/* 쿠팡·네이버를 흉내 내는 가짜 서버를 띄워, 두고 서버가 규격대로 서명하고 요청하는지 확인한다. */
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const bcrypt = require("bcryptjs");

const { authorization, signedDate } = require("../src/coupang");
const { clientSecretSign } = require("../src/naver");
const { toCoupangProduct, toNaverProduct } = require("../src/mappers");
const { createCredentialStore } = require("../src/store");
const { createApp } = require("../src/server");
const { fakeUpstream } = require("./fake-upstream");

const NAVER_SECRET = bcrypt.genSaltSync(4); // 네이버 client_secret은 bcrypt salt 형식($2a$04$...)
const listing = {
  listingId: "SP-1001", title: "[산지직송] 경북 프리미엄 사과 3kg", brand: "산지팔도", supplierName: "산지팔도", productCode: "DF-1024",
  salePrice: 29900, originalPrice: 34900, stock: 120, images: [], detailHtml: "<p>상세</p>", tags: ["사과", "산지직송"],
  options: [{ optionId: "O1", name: "3kg", salePrice: 29900, stock: 80 }, { optionId: "O2", name: "5kg", salePrice: 42900, stock: 40 }],
  category: { coupang: 59258, smartstore: "50000960" },
  shipping: { carrier: "한진택배", feeType: "CONDITIONAL_FREE", fee: 3000, freeOver: 30000, returnFee: 3000, exchangeFee: 6000, dispatchDays: 1, coupangOutboundCode: 7788, coupangReturnCenterCode: "1000012345", naverShippingAddressId: 1001, naverReturnAddressId: 1002 },
  returnAddress: { zipCode: "37150", address: "경북 의성군 의성읍 사과로 1", addressDetail: "산지팔도 물류센터", phone: "010-1234-5678" },
  asPhone: "010-1234-5678", origin: "국산", notice: { type: "FOOD", fields: {} }
};

function listen(server) { return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`))); }

test("쿠팡 HMAC 서명: 날짜·메시지 규칙대로 만든다", () => {
  const date = new Date(Date.UTC(2026, 8, 26, 3, 4, 5));
  assert.equal(signedDate(date), "260926T030405Z");
  const header = authorization({ accessKey: "AK", secretKey: "SK" }, "get", "/v2/path", "a=1", date);
  const expected = crypto.createHmac("sha256", "SK").update("260926T030405ZGET/v2/patha=1").digest("hex");
  assert.equal(header, `CEA algorithm=HmacSHA256, access-key=AK, signed-date=260926T030405Z, signature=${expected}`);
});

test("네이버 client_secret_sign: bcrypt(client_id_timestamp) 를 base64로", () => {
  const sign = clientSecretSign("CLIENT", NAVER_SECRET, 1790000000000);
  const hashed = Buffer.from(sign, "base64").toString("utf8");
  assert.ok(hashed.startsWith(NAVER_SECRET.slice(0, 29)));
  assert.ok(bcrypt.compareSync("CLIENT_1790000000000", hashed));
});

test("매퍼: 쿠팡 본문에 필수값·옵션·승인요청이 들어간다", () => {
  const body = toCoupangProduct({ ...listing, images: ["https://img/a.jpg"] }, { vendorId: "A00012345", vendorUserId: "wing_id", now: new Date(Date.UTC(2026, 8, 26)) });
  assert.equal(body.vendorId, "A00012345");
  assert.equal(body.vendorUserId, "wing_id");
  assert.equal(body.requested, true);
  assert.equal(body.deliveryChargeType, "CONDITIONAL_FREE");
  assert.equal(body.items.length, 2);
  assert.equal(body.items[1].salePrice, 42900);
  assert.equal(body.items[0].images[0].imageType, "REPRESENTATION");
  assert.equal(body.saleStartedAt, "2026-09-26T09:00:00");
  assert.throws(() => toCoupangProduct({ ...listing, images: [] }, { vendorId: "A", vendorUserId: "b" }), /images\.0/);
});

test("매퍼: 네이버 본문은 옵션가를 기본가와의 차액으로 넣는다", () => {
  const body = toNaverProduct(listing, { imageUrls: ["https://shop-phinf.pstatic.net/a.jpg"] });
  const combos = body.originProduct.detailAttribute.optionInfo.optionCombinations;
  assert.deepEqual(combos.map(combo => combo.price), [0, 13000]);
  assert.equal(body.originProduct.stockQuantity, 120);
  assert.equal(body.originProduct.leafCategoryId, "50000960");
  assert.equal(body.smartstoreChannelProduct.channelProductDisplayStatusType, "ON");
});

test("키 보관소: 암호화 저장하고 가린 값만 돌려준다", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "doogo-")), "c.json");
  const store = createCredentialStore({ file, key: crypto.randomBytes(32) });
  const saved = store.save("seller", "coupang", { vendorId: "A00012345", accessKey: "AK-1234567890", secretKey: "SK-abcdefghij", vendorUserId: "wing" });
  assert.equal(saved.secretKey, "••••••••ghij");
  assert.equal(saved.vendorId, "A00012345");
  assert.ok(!fs.readFileSync(file, "utf8").includes("SK-abcdefghij"));
  assert.equal(store.get("seller", "coupang").secretKey, "SK-abcdefghij");
});

test("서버 전체 흐름: 연결 → 원클릭 등록 → 품절 → 삭제 (쿠팡·스마트스토어)", async () => {
  const upstream = fakeUpstream();
  const base = await listen(upstream.server);
  process.env.NAVER_CLIENT_ID = "DOOGO-APP";
  process.env.NAVER_CLIENT_SECRET = NAVER_SECRET;
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "doogo-")), "c.json");
  const app = createApp({ store: createCredentialStore({ file, key: crypto.randomBytes(32) }), token: "T", clientOptions: { baseUrl: undefined } });
  // 쿠팡/네이버 기본 주소를 가짜 서버로
  process.env.COUPANG_API_BASE = base;
  process.env.NAVER_API_BASE = `${base}/external`;
  const appBase = await listen(app);
  const call = async (method, p, body) => { const res = await fetch(`${appBase}${p}`, { method, headers: { Authorization: "Bearer T", "Content-Type": "application/json" }, body: JSON.stringify(body) }); return { status: res.status, body: await res.json() }; };
  const withImages = { ...listing, images: [`${base}/img/1.jpg`, `${base}/img/2.jpg`] };
  try {
    assert.equal((await fetch(`${appBase}/api/listings`, { method: "POST" })).status, 401);

    const c1 = await call("POST", "/api/channels/coupang/connect", { sellerLoginId: "seller", credentials: { vendorId: "A00012345", accessKey: "AK-TEST", secretKey: "SK-TEST-SECRET", vendorUserId: "wing" } });
    assert.equal(c1.status, 200, JSON.stringify(c1.body));
    assert.equal(c1.body.saved.secretKey, "••••••••CRET");
    const c2 = await call("POST", "/api/channels/smartstore/connect", { sellerLoginId: "seller", credentials: { accountId: "doogo_store" } });
    assert.equal(c2.status, 200, JSON.stringify(c2.body));
    const tokenCall = upstream.calls.find(entry => entry.path === "/external/v1/oauth2/token");
    const form = new URLSearchParams(tokenCall.body.toString());
    assert.equal(form.get("type"), "SELLER");
    assert.equal(form.get("account_id"), "doogo_store");
    assert.ok(bcrypt.compareSync(`DOOGO-APP_${form.get("timestamp")}`, Buffer.from(form.get("client_secret_sign"), "base64").toString()));

    const r1 = await call("POST", "/api/listings", { sellerLoginId: "seller", channel: "coupang", listing: withImages });
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    assert.equal(r1.body.externalId, "1320567890");
    assert.deepEqual(r1.body.vendorItemIds, [7001, 7002]);
    const created = upstream.calls.find(entry => entry.method === "POST" && entry.path.endsWith("/seller-products"));
    assert.equal(created.headers["x-requested-by"], "A00012345");
    assert.equal(JSON.parse(created.body.toString()).items.length, 2);

    const r2 = await call("POST", "/api/listings", { sellerLoginId: "seller", channel: "smartstore", listing: withImages });
    assert.equal(r2.status, 200, JSON.stringify(r2.body));
    assert.equal(r2.body.externalId, "9001");
    const upload = upstream.calls.find(entry => entry.path === "/external/v1/product-images/upload");
    assert.match(upload.headers["content-type"], /^multipart\/form-data; boundary=/);
    assert.match(upload.body.toString("latin1"), /name="imageFiles"/);
    const naverBody = JSON.parse(upstream.calls.find(entry => entry.method === "POST" && entry.path === "/external/v2/products").body.toString());
    assert.equal(naverBody.originProduct.images.representativeImage.url, "https://shop-phinf.pstatic.net/a.jpg");

    const s1 = await call("POST", "/api/listings/coupang/1320567890/status", { sellerLoginId: "seller", action: "soldout", vendorItemIds: [7001, 7002] });
    assert.equal(s1.body.status, "품절");
    assert.ok(upstream.calls.some(entry => entry.method === "PUT" && entry.path.endsWith("/vendor-items/7002/quantities/0")));
    const s2 = await call("POST", "/api/listings/smartstore/9001/status", { sellerLoginId: "seller", action: "stop" });
    assert.equal(s2.body.status, "판매중지");
    const statusCall = upstream.calls.find(entry => entry.path === "/external/v1/products/origin-products/9001/change-status");
    assert.equal(JSON.parse(statusCall.body.toString()).statusType, "SUSPENSION");

    const d1 = await call("DELETE", "/api/listings/smartstore/9001", { sellerLoginId: "seller" });
    assert.equal(d1.body.deleted, true);
    assert.ok(upstream.calls.some(entry => entry.method === "DELETE" && entry.path === "/external/v2/products/origin-products/9001"));
    const d2 = await call("DELETE", "/api/listings/coupang/1320567890", { sellerLoginId: "seller", vendorItemIds: [7001, 7002] });
    assert.equal(d2.body.deleted, false);
    assert.equal(d2.body.status, "판매중지");
    assert.ok(upstream.calls.some(entry => entry.method === "PUT" && entry.path.endsWith("/vendor-items/7001/sales/stop")));

    const y1 = await call("POST", "/api/listings/smartstore/9001/sync", { sellerLoginId: "seller", listing: { ...listing, salePrice: 31900 } });
    assert.equal(y1.body.status, "동기화 완료");
    const put = upstream.calls.find(entry => entry.method === "PUT" && entry.path === "/external/v2/products/origin-products/9001");
    assert.equal(JSON.parse(put.body.toString()).originProduct.salePrice, 31900);

    const bad = await call("POST", "/api/channels/coupang/connect", { sellerLoginId: "seller", credentials: { vendorId: "A1", accessKey: "WRONG", secretKey: "x", vendorUserId: "w" } });
    assert.equal(bad.status, 502);
    assert.equal(bad.body.upstreamStatus, 401);
  } finally {
    app.close(); upstream.server.close();
  }
});
