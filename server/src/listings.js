"use strict";
/* 쇼핑몰별 규칙을 한곳에서 처리한다.
   ┌──────────────┬────────────────────────────┬──────────────────────────────────────────────┐
   │ 두고 동작     │ 스마트스토어                 │ 쿠팡                                           │
   ├──────────────┼────────────────────────────┼──────────────────────────────────────────────┤
   │ 상품 전송     │ 이미지 업로드 → 상품 등록       │ 상품 생성(승인 요청 포함) → 승인되면 옵션ID 생김     │
   │ 판매중지      │ 상태 SUSPENSION             │ 모든 옵션 판매중지(sales/stop)                    │
   │ 품절          │ 상태 OUTOFSTOCK(재고 0)      │ 모든 옵션 재고 0                                  │
   │ 판매 재개     │ 상태 SALE + 재고              │ 판매 재개(sales/resume) + 재고                    │
   │ 삭제          │ 상품 삭제(DELETE)             │ 판매중지+재고 0 후 삭제 시도. 승인된 상품은 삭제가   │
   │              │                            │ 안 되므로 '판매중지'로 남긴다                       │
   └──────────────┴────────────────────────────┴──────────────────────────────────────────────┘ */
const { createCoupangClient, vendorItemIdsOf } = require("./coupang");
const { createNaverClient } = require("./naver");
const { toCoupangProduct, toNaverProduct } = require("./mappers");

function clientFor(channel, creds, options = {}) {
  if (channel === "coupang") return createCoupangClient(creds, options);
  if (channel === "smartstore") return createNaverClient({ clientId: process.env.NAVER_CLIENT_ID, clientSecret: process.env.NAVER_CLIENT_SECRET, ...creds }, options);
  throw new Error(`아직 지원하지 않는 쇼핑몰이에요: ${channel}`);
}

async function verifyChannel(channel, creds, options) {
  await clientFor(channel, creds, options).verify();
  return { ok: true };
}

async function registerListing(channel, creds, listing, options) {
  const client = clientFor(channel, creds, options);
  if (channel === "smartstore") {
    const imageUrls = await client.uploadImagesFromUrls(listing.images.slice(0, 10));
    const res = await client.createProduct(toNaverProduct(listing, { imageUrls }));
    return { channel, externalId: String(res.originProductNo), channelProductNo: String(res.smartstoreChannelProductNo || ""), status: "판매중" };
  }
  const res = await client.createProduct(toCoupangProduct(listing, { vendorId: creds.vendorId, vendorUserId: creds.vendorUserId }));
  const sellerProductId = String(res.data);
  let vendorItemIds = [];
  try { vendorItemIds = vendorItemIdsOf(await client.getProduct(sellerProductId)); } catch { /* 승인 전에는 비어 있을 수 있다 */ }
  return { channel, externalId: sellerProductId, vendorItemIds, status: vendorItemIds.length ? "판매중" : "쿠팡 승인 대기" };
}

async function coupangItems(client, externalId, known = []) {
  if (known.length) return known;
  const ids = vendorItemIdsOf(await client.getProduct(externalId));
  if (!ids.length) throw new Error("쿠팡 승인 전이라 옵션ID가 아직 없어요. 승인 후 다시 시도해 주세요.");
  return ids;
}

async function setListingStatus(channel, creds, { externalId, action, stock = 0, vendorItemIds = [] }, options) {
  const client = clientFor(channel, creds, options);
  if (channel === "smartstore") {
    if (action === "stop" || action === "hide") await client.changeStatus(externalId, "SUSPENSION");
    else if (action === "soldout") await client.changeStatus(externalId, "OUTOFSTOCK", 0);
    else if (action === "resume") await client.changeStatus(externalId, "SALE", Math.max(1, Number(stock) || 1));
    else throw new Error(`알 수 없는 동작: ${action}`);
    return { channel, externalId, status: { stop: "판매중지", hide: "판매중지", soldout: "품절", resume: "판매중" }[action] };
  }
  const items = await coupangItems(client, externalId, vendorItemIds);
  for (const id of items) {
    if (action === "stop" || action === "hide") await client.stopItem(id);
    else if (action === "soldout") await client.updateQuantity(id, 0);
    else if (action === "resume") { await client.resumeItem(id); await client.updateQuantity(id, Math.max(1, Number(stock) || 1)); }
    else throw new Error(`알 수 없는 동작: ${action}`);
  }
  return { channel, externalId, vendorItemIds: items, status: { stop: "판매중지", hide: "판매중지", soldout: "품절", resume: "판매중" }[action] };
}

async function removeListing(channel, creds, { externalId, vendorItemIds = [] }, options) {
  const client = clientFor(channel, creds, options);
  if (channel === "smartstore") {
    await client.deleteProduct(externalId);
    return { channel, externalId, status: "삭제됨", deleted: true };
  }
  let items = vendorItemIds;
  try { items = await coupangItems(client, externalId, vendorItemIds); } catch { items = []; }
  for (const id of items) { await client.stopItem(id); await client.updateQuantity(id, 0); }
  try {
    await client.deleteProduct(externalId);
    return { channel, externalId, status: "삭제됨", deleted: true };
  } catch (error) {
    return { channel, externalId, vendorItemIds: items, status: "판매중지", deleted: false, note: "쿠팡은 승인된 상품을 삭제할 수 없어 판매중지·재고 0으로 바꿨어요." };
  }
}

/* 가격·재고 동기화. 쿠팡은 옵션ID별, 스마트스토어는 원상품을 불러와 가격·재고만 바꿔 다시 저장한다. */
async function syncPriceStock(channel, creds, { externalId, listing, vendorItemMap = {} }, options) {
  const client = clientFor(channel, creds, options);
  if (channel === "coupang") {
    const units = listing.options?.length ? listing.options : [{ optionId: listing.productCode, salePrice: listing.salePrice, stock: listing.stock }];
    for (const unit of units) {
      const vendorItemId = vendorItemMap[unit.optionId];
      if (!vendorItemId) continue;
      await client.updatePrice(vendorItemId, unit.salePrice);
      await client.updateQuantity(vendorItemId, unit.stock);
    }
    return { channel, externalId, status: "동기화 완료" };
  }
  const current = await client.getProduct(externalId);
  const next = JSON.parse(JSON.stringify(current));
  next.originProduct.salePrice = Number(listing.salePrice);
  const combos = next.originProduct.detailAttribute?.optionInfo?.optionCombinations;
  if (combos?.length && listing.options?.length) {
    for (const combo of combos) {
      const option = listing.options.find(entry => combo.sellerManagerCode?.endsWith(`:${entry.optionId}`));
      if (option) { combo.price = Number(option.salePrice) - Number(listing.salePrice); combo.stockQuantity = Number(option.stock || 0); }
    }
  } else next.originProduct.stockQuantity = Number(listing.stock || 0);
  await client.updateProduct(externalId, next);
  return { channel, externalId, status: "동기화 완료" };
}

module.exports = { verifyChannel, registerListing, setListingStatus, removeListing, syncPriceStock, clientFor };
