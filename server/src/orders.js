"use strict";
/* 쇼핑몰 주문 수집 · 송장 전송
   ┌──────────────┬──────────────────────────────────────────────┬──────────────────────────────────────────────┐
   │ 두고 동작     │ 스마트스토어 (커머스API)                          │ 쿠팡 (OPEN API)                                 │
   ├──────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────┤
   │ 주문 수집     │ 결제완료로 바뀐 상품주문 조회 → 상세 조회           │ 결제완료(ACCEPT) 발주서 조회                      │
   │ 주문 확인     │ 발주확인(confirm)                               │ 상품준비중 처리(acknowledgement)                  │
   │ 송장 전송     │ 발송처리(dispatch)                              │ 송장 업로드(invoices) · 이미 올렸으면 송장 수정      │
   └──────────────┴──────────────────────────────────────────────┴──────────────────────────────────────────────┘
   두고 앱은 주문을 쇼핑몰과 상관없는 한 가지 모양으로 받는다:
   { channel, channelOrderNo, refs, orderedAt, ordererName, ordererPhone, recipientName, recipientPhone, postalCode, address, addressDetail,
     deliveryMessage, productName, optionName, qty, amount, sellerCode, externalProductCode, personalCustomsCode }
   sellerCode 는 두고가 상품을 올릴 때 넣어 둔 관리코드(두고 상품ID:옵션ID)라, 두고 상품 주문인지 바로 알 수 있다. */
const { clientFor } = require("./listings");
const { COUPANG_CARRIERS } = require("./mappers");
const { CAFE24_CARRIERS } = require("./cafe24");

const kstDate = (date, days = 0) => new Date(date.getTime() + 9 * 3600 * 1000 + days * 86400000).toISOString().slice(0, 10);
const kstIso = date => `${new Date(date.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 19)}.000+09:00`;

function fromNaver(row) {
  const order = row.order || {}, item = row.productOrder || {}, ship = item.shippingAddress || {};
  return {
    channel: "smartstore", channelOrderNo: String(item.productOrderId || ""), refs: { productOrderId: String(item.productOrderId || ""), orderId: String(order.orderId || "") },
    orderedAt: order.orderDate || order.paymentDate || "", ordererName: order.ordererName || "", ordererPhone: order.ordererTel || "",
    recipientName: ship.name || "", recipientPhone: ship.tel1 || "", postalCode: ship.zipCode || "", address: ship.baseAddress || "", addressDetail: ship.detailedAddress || "",
    deliveryMessage: item.shippingMemo || "", productName: item.productName || "", optionName: item.productOption || "", qty: Number(item.quantity || 1), amount: Number(item.totalPaymentAmount || 0),
    sellerCode: item.optionManageCode || item.sellerProductCode || "", externalProductCode: String(item.originalProductId || item.productId || ""), personalCustomsCode: item.individualCustomUniqueCode || ""
  };
}

function fromCoupang(sheet) {
  const receiver = sheet.receiver || {}, orderer = sheet.orderer || {};
  return (sheet.orderItems || []).map(item => ({
    channel: "coupang", channelOrderNo: String(sheet.orderId || ""), refs: { shipmentBoxId: String(sheet.shipmentBoxId || ""), orderId: String(sheet.orderId || ""), vendorItemId: String(item.vendorItemId || "") },
    orderedAt: sheet.orderedAt || "", ordererName: orderer.name || "", ordererPhone: orderer.safeNumber || orderer.ordererNumber || "",
    recipientName: receiver.name || "", recipientPhone: receiver.safeNumber || receiver.receiverNumber || "", postalCode: receiver.postCode || "", address: receiver.addr1 || "", addressDetail: receiver.addr2 || "",
    deliveryMessage: sheet.parcelPrintMessage || "", productName: item.sellerProductName || item.vendorItemName || "", optionName: item.sellerProductItemName || "", qty: Number(item.shippingCount || 1), amount: Number(item.orderPrice || 0) * Number(item.shippingCount || 1),
    sellerCode: item.externalVendorSkuCode || "", externalProductCode: String(item.sellerProductId || ""), personalCustomsCode: sheet.overseaShippingInfoDto?.personalCustomsClearanceCode || ""
  }));
}

function fromCafe24(order) {
  const receiver = (order.receivers || [])[0] || {};
  return (order.items || []).map(item => ({
    channel: "cafe24", channelOrderNo: String(item.order_item_code || order.order_id || ""), refs: { orderId: String(order.order_id || ""), orderItemCode: String(item.order_item_code || "") },
    orderedAt: order.order_date || order.payment_date || "", ordererName: order.billing_name || "", ordererPhone: order.buyer_cellphone || order.buyer_phone || "",
    recipientName: receiver.name || "", recipientPhone: receiver.cellphone || receiver.phone || "", postalCode: receiver.zipcode || "", address: receiver.address1 || "", addressDetail: receiver.address2 || "",
    deliveryMessage: receiver.shipping_message || "", productName: item.product_name || "", optionName: item.option_value || "", qty: Number(item.quantity || 1), amount: item.payment_amount != null ? Number(item.payment_amount) : Number(item.product_price || 0) * Number(item.quantity || 1),
    sellerCode: item.custom_product_code || item.custom_variant_code || "", externalProductCode: String(item.product_no || ""), personalCustomsCode: order.individual_customs_code || ""
  }));
}

/* since: ISO 시각. 기본은 24시간 전. 쇼핑몰은 조회 기간을 짧게 제한하므로 하루 단위로 묻는다. */
async function collectOrders(channel, creds, { since, now = new Date() } = {}, options) {
  const client = clientFor(channel, creds, options);
  const from = since ? new Date(since) : new Date(now.getTime() - 86400000);
  if (channel === "smartstore") {
    const changed = await client.lastChangedOrders(kstIso(from));
    const ids = [...new Set((changed.data?.lastChangeStatuses || []).filter(row => !row.productOrderStatus || row.productOrderStatus === "PAYED").map(row => String(row.productOrderId)))];
    const orders = [];
    for (let index = 0; index < ids.length; index += 300) {
      const detail = await client.queryOrders(ids.slice(index, index + 300));
      (detail.data || []).forEach(row => orders.push(fromNaver(row)));
    }
    return { channel, orders };
  }
  if (channel === "cafe24") {
    const orders = [];
    for (let offset = 0; offset < 5000; offset += 100) {
      const page = await client.listOrders({ startDate: kstDate(from), endDate: kstDate(now), offset });
      (page.orders || []).forEach(order => orders.push(...fromCafe24(order)));
      if ((page.orders || []).length < 100) break;
    }
    return { channel, orders };
  }
  const orders = [];
  let nextToken = "";
  do {
    const page = await client.listOrderSheets({ from: kstDate(from), to: kstDate(now), nextToken });
    (page.data || []).forEach(sheet => orders.push(...fromCoupang(sheet)));
    nextToken = page.nextToken || "";
  } while (nextToken);
  return { channel, orders };
}

/* 주문 확인: 스마트스토어 발주확인 / 쿠팡 상품준비중. 이미 처리된 주문은 쇼핑몰이 알아서 무시한다. */
async function confirmOrders(channel, creds, { items = [] }, options) {
  const client = clientFor(channel, creds, options);
  if (!items.length) return { channel, confirmed: 0 };
  if (channel === "smartstore") await client.confirmOrders(items.map(item => String(item.refs?.productOrderId)).filter(Boolean));
  else if (channel === "cafe24") {
    const byOrder = items.reduce((map, item) => { const id = String(item.refs?.orderId || ""); if (id) map.set(id, [...(map.get(id) || []), String(item.refs?.orderItemCode || "")].filter(Boolean)); return map; }, new Map());
    for (const [orderId, codes] of byOrder) await client.setOrderItemsStatus(orderId, codes, "N20");
  }
  else await client.acknowledge([...new Set(items.map(item => String(item.refs?.shipmentBoxId)).filter(Boolean))]);
  return { channel, confirmed: items.length };
}

/* 송장 전송. items: [{ refs, carrier, naverCode, tracking, update }] → 주문마다 성공/실패를 돌려준다. */
async function dispatchTracking(channel, creds, { items = [], now = new Date() }, options) {
  const client = clientFor(channel, creds, options);
  const results = [];
  if (channel === "smartstore") {
    const rows = items.map(item => {
      const direct = item.naverCode === "DIRECT_DELIVERY";
      return { productOrderId: String(item.refs?.productOrderId || ""), deliveryMethod: direct ? "DIRECT_DELIVERY" : "DELIVERY", ...(direct ? {} : { deliveryCompanyCode: item.naverCode || "CH1" }), trackingNumber: String(item.tracking || ""), dispatchDate: kstIso(now) };
    });
    const bad = rows.filter(row => !row.productOrderId);
    bad.forEach(() => results.push({ ok: false, error: "스마트스토어 상품주문번호가 없어요." }));
    const good = rows.filter(row => row.productOrderId);
    if (good.length) {
      const res = await client.dispatch(good);
      const failed = new Map((res.data?.failProductOrderInfos || []).map(info => [String(info.productOrderId), info.message || info.code || "발송처리 실패"]));
      good.forEach(row => results.push(failed.has(row.productOrderId) ? { key: row.productOrderId, ok: false, error: failed.get(row.productOrderId) } : { key: row.productOrderId, ok: true }));
    }
    return { channel, results };
  }
  if (channel === "cafe24") {
    for (const item of items) {
      const key = `${item.refs?.orderId || ""}:${item.refs?.orderItemCode || ""}`;
      if (!item.refs?.orderId || !item.refs?.orderItemCode) { results.push({ key, ok: false, error: "CAFE24 주문번호·품주코드가 없어요." }); continue; }
      const code = CAFE24_CARRIERS[item.carrier];
      if (!code) { results.push({ key, ok: false, error: `‘${item.carrier || "택배사 없음"}’ 택배사는 CAFE24 코드가 없어요. CAFE24 관리자에서 송장을 직접 입력해 주세요.` }); continue; }
      try {
        const request = { tracking_no: String(item.tracking || ""), shipping_company_code: code, order_item_code: [String(item.refs.orderItemCode)], status: "shipping" };
        if (item.update && item.refs.shippingCode) await client.updateShipment(item.refs.orderId, item.refs.shippingCode, { tracking_no: request.tracking_no, shipping_company_code: code });
        else await client.createShipment(item.refs.orderId, request);
        results.push({ key, ok: true });
      } catch (error) { results.push({ key, ok: false, error: error.message }); }
    }
    return { channel, results };
  }
  /* 쿠팡: 송장은 상품준비중(INSTRUCT) 상태에서만 올라가므로 먼저 상품준비중으로 바꾼다 */
  const boxes = [...new Set(items.map(item => String(item.refs?.shipmentBoxId || "")).filter(Boolean))];
  if (boxes.length) { try { await client.acknowledge(boxes); } catch { /* 이미 상품준비중이면 오류가 나도 괜찮다 */ } }
  for (const item of items) {
    const key = `${item.refs?.shipmentBoxId || ""}:${item.refs?.vendorItemId || ""}`;
    if (!item.refs?.shipmentBoxId || !item.refs?.vendorItemId) { results.push({ key, ok: false, error: "쿠팡 묶음배송번호·옵션ID가 없어요." }); continue; }
    /* 쿠팡 택배사 코드가 없는 택배사(직접 입력한 택배사 등)를 다른 택배사로 바꿔 보내면 고객 배송조회가 틀어진다 → 보내지 않고 알린다 */
    const deliveryCompanyCode = COUPANG_CARRIERS[item.carrier];
    if (!deliveryCompanyCode) { results.push({ key, ok: false, error: `‘${item.carrier || "택배사 없음"}’ 택배사는 쿠팡 코드가 없어요. 쿠팡 Wing에서 송장을 직접 입력해 주세요.` }); continue; }
    const dto = { shipmentBoxId: Number(item.refs.shipmentBoxId), orderId: Number(item.refs.orderId), vendorItemId: Number(item.refs.vendorItemId), deliveryCompanyCode, invoiceNumber: String(item.tracking || ""), splitShipping: false, preSplitShipped: false, estimatedShippingDate: "" };
    try {
      const res = item.update ? await client.updateInvoices([dto]) : await client.uploadInvoices([dto]);
      const fail = (res.data?.responseList || []).find(row => row.succeed === false);
      results.push(fail ? { key, ok: false, error: fail.resultMessage || "송장 업로드 실패" } : { key, ok: true });
    } catch (error) { results.push({ key, ok: false, error: error.message }); }
  }
  return { channel, results };
}

module.exports = { collectOrders, confirmOrders, dispatchTracking, fromNaver, fromCoupang, fromCafe24 };
