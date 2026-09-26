"use strict";
/* 두고 상품(셀러가 꾸민 마스터 상품) → 쇼핑몰 상품 등록 요청 본문
   프런트는 쇼핑몰과 상관없는 '두고 리스팅' 하나만 보내고, 쇼핑몰별 규칙은 여기서 맞춘다.

   두고 리스팅 모양:
   { listingId, title, brand, supplierName, productCode, salePrice, originalPrice, stock,
     images: [url], detailHtml, tags: [text], options: [{ optionId, name, salePrice, stock }],
     category: { coupang: displayCategoryCode, smartstore: leafCategoryId },
     shipping: { carrier, feeType: "FREE"|"PAID"|"CONDITIONAL_FREE", fee, freeOver, returnFee, exchangeFee, dispatchDays,
                 coupangOutboundCode, coupangReturnCenterCode, naverShippingAddressId, naverReturnAddressId },
     returnAddress: { zipCode, address, addressDetail, phone }, asPhone, origin, taxType, adultOnly, overseas, pccNeeded,
     notice: { type: "FOOD"|"ETC", fields: {…} } } */

const COUPANG_CARRIERS = { "한진택배": "HANJIN", "CJ대한통운": "CJGLS", "롯데택배": "LOTTE", "우체국택배": "EPOST", "로젠택배": "KGB", "경동택배": "KDEXP" };
const NAVER_CARRIERS = { "한진택배": "HANJIN", "CJ대한통운": "CJGLS", "롯데택배": "HYUNDAI", "우체국택배": "EPOST", "로젠택배": "KGB", "경동택배": "KDEXP" };

function requireFields(listing, fields) {
  const missing = fields.filter(path => [undefined, null, ""].includes(path.split(".").reduce((value, key) => value?.[key], listing)));
  if (missing.length) throw new Error(`쇼핑몰 등록에 필요한 값이 비었어요: ${missing.join(", ")}`);
}

function kstDateTime(date) {
  const k = new Date(date.getTime() + 9 * 3600 * 1000);
  return k.toISOString().slice(0, 19);
}

function toCoupangProduct(listing, { vendorId, vendorUserId, now = new Date() }) {
  requireFields(listing, ["title", "salePrice", "images.0", "category.coupang", "shipping.coupangOutboundCode", "shipping.coupangReturnCenterCode", "returnAddress.zipCode", "returnAddress.address"]);
  const ship = listing.shipping;
  const units = listing.options?.length ? listing.options : [{ optionId: listing.productCode, name: listing.title, salePrice: listing.salePrice, stock: listing.stock }];
  const images = listing.images.map((url, index) => ({ imageOrder: index, imageType: index === 0 ? "REPRESENTATION" : "DETAIL", vendorPath: url }));
  return {
    displayCategoryCode: Number(listing.category.coupang),
    sellerProductName: listing.title,
    vendorId,
    saleStartedAt: kstDateTime(now),
    saleEndedAt: "2099-01-01T23:59:59",
    displayProductName: listing.title,
    brand: listing.brand || listing.supplierName || "",
    generalProductName: listing.title,
    deliveryMethod: listing.overseas ? "AGENT_BUY" : "SEQUENCIAL",
    deliveryCompanyCode: COUPANG_CARRIERS[ship.carrier] || "HANJIN",
    deliveryChargeType: ship.feeType === "PAID" ? "NOT_FREE" : ship.feeType === "CONDITIONAL_FREE" ? "CONDITIONAL_FREE" : "FREE",
    deliveryCharge: ship.feeType === "FREE" ? 0 : Number(ship.fee || 0),
    freeShipOverAmount: ship.feeType === "CONDITIONAL_FREE" ? Number(ship.freeOver || 0) : 0,
    deliveryChargeOnReturn: Number(ship.returnFee || 0),
    remoteAreaDeliverable: "N",
    unionDeliveryType: "UNION_DELIVERY",
    returnCenterCode: String(ship.coupangReturnCenterCode),
    returnChargeName: listing.supplierName || "두고 공급사",
    companyContactNumber: listing.returnAddress.phone || listing.asPhone || "",
    returnZipCode: listing.returnAddress.zipCode,
    returnAddress: listing.returnAddress.address,
    returnAddressDetail: listing.returnAddress.addressDetail || "",
    returnCharge: Number(ship.returnFee || 0),
    outboundShippingPlaceCode: Number(ship.coupangOutboundCode),
    vendorUserId,
    requested: true, // 등록하면서 바로 쿠팡 승인 요청
    items: units.map(unit => ({
      itemName: unit.name,
      originalPrice: Math.max(Number(listing.originalPrice || 0), Number(unit.salePrice)),
      salePrice: Number(unit.salePrice),
      maximumBuyCount: Math.max(0, Number(unit.stock ?? listing.stock ?? 0)),
      maximumBuyForPerson: 0,
      maximumBuyForPersonPeriod: 1,
      outboundShippingTimeDay: Number(ship.dispatchDays || 1),
      unitCount: 1,
      adultOnly: listing.adultOnly ? "ADULT_ONLY" : "EVERYONE",
      taxType: listing.taxType === "FREE" ? "FREE" : "TAX",
      parallelImported: "NOT_PARALLEL_IMPORTED",
      overseasPurchased: listing.overseas ? "OVERSEAS_PURCHASED" : "NOT_OVERSEAS_PURCHASED",
      pccNeeded: Boolean(listing.pccNeeded),
      externalVendorSku: `${listing.listingId}:${unit.optionId}`,
      emptyBarcode: true,
      emptyBarcodeReason: "위탁 판매 상품 (바코드 없음)",
      certifications: [{ certificationType: "NOT_REQUIRED", certificationCode: "" }],
      searchTags: (listing.tags || []).slice(0, 20),
      images,
      notices: coupangNotices(listing),
      attributes: listing.options?.length ? [{ attributeTypeName: "옵션", attributeValueName: unit.name }] : [],
      contents: [{ contentsType: "HTML", contentDetails: [{ content: listing.detailHtml || `<p>${listing.title}</p>`, detailType: "TEXT" }] }]
    }))
  };
}

function coupangNotices(listing) {
  const fields = listing.notice?.fields || {};
  const category = listing.notice?.type === "FOOD" ? "농수산물" : "기타 재화";
  const names = listing.notice?.type === "FOOD"
    ? ["품목 또는 명칭", "포장단위별 내용물의 용량(중량), 수량, 크기", "생산자, 수입품의 경우 수입자를 함께 표기", "농수산물의 원산지 표시 등에 관한 법률에 따른 원산지", "제조연월일(포장일 또는 생산연도), 유통기한 또는 품질유지기한", "소비자상담 관련 전화번호"]
    : ["품명 및 모델명", "제조자(수입자)", "제조국", "A/S 책임자와 전화번호"];
  return names.map(name => ({ noticeCategoryName: category, noticeCategoryDetailName: name, content: fields[name] || "상세페이지 참조" }));
}

function toNaverProduct(listing, { imageUrls }) {
  requireFields(listing, ["title", "salePrice", "category.smartstore", "shipping.naverShippingAddressId", "shipping.naverReturnAddressId"]);
  if (!imageUrls?.length) throw new Error("네이버 이미지 서버에 올린 대표 이미지가 필요해요.");
  const ship = listing.shipping;
  const base = Number(listing.salePrice);
  const options = listing.options || [];
  return {
    originProduct: {
      statusType: "SALE",
      saleType: "NEW",
      leafCategoryId: String(listing.category.smartstore),
      name: listing.title,
      detailContent: listing.detailHtml || `<p>${listing.title}</p>`,
      images: { representativeImage: { url: imageUrls[0] }, optionalImages: imageUrls.slice(1, 10).map(url => ({ url })) },
      salePrice: base,
      stockQuantity: options.length ? options.reduce((sum, option) => sum + Number(option.stock || 0), 0) : Number(listing.stock || 0),
      deliveryInfo: {
        deliveryType: "DELIVERY",
        deliveryAttributeType: "NORMAL",
        deliveryCompany: NAVER_CARRIERS[ship.carrier] || "HANJIN",
        deliveryFee: { deliveryFeeType: ship.feeType || "FREE", baseFee: ship.feeType === "FREE" ? 0 : Number(ship.fee || 0), ...(ship.feeType === "CONDITIONAL_FREE" ? { freeConditionalAmount: Number(ship.freeOver || 0) } : {}), deliveryFeePayType: "PREPAID" },
        claimDeliveryInfo: { returnDeliveryFee: Number(ship.returnFee || 0), exchangeDeliveryFee: Number(ship.exchangeFee || ship.returnFee || 0), shippingAddressId: Number(ship.naverShippingAddressId), returnAddressId: Number(ship.naverReturnAddressId) }
      },
      detailAttribute: {
        afterServiceInfo: { afterServiceTelephoneNumber: listing.asPhone || "", afterServiceGuideContent: "상품 문의는 판매자에게 연락해 주세요." },
        originAreaInfo: listing.overseas ? { originAreaCode: "04", content: listing.origin || "수입산" } : { originAreaCode: "00", content: listing.origin || "국산" },
        minorPurchasable: !listing.adultOnly,
        taxType: listing.taxType === "FREE" ? "DUTYFREE" : "TAX",
        productInfoProvidedNotice: naverNotice(listing),
        sellerCodeInfo: { sellerManagementCode: listing.listingId },
        seoInfo: { sellerTags: (listing.tags || []).slice(0, 10).map(text => ({ text })) },
        ...(options.length ? { optionInfo: {
          optionCombinationSortType: "CREATE",
          optionCombinationGroupNames: { optionGroupName1: "옵션" },
          optionCombinations: options.map(option => ({ optionName1: option.name, stockQuantity: Number(option.stock || 0), price: Number(option.salePrice) - base, sellerManagerCode: `${listing.listingId}:${option.optionId}`, usable: true }))
        } } : {})
      }
    },
    smartstoreChannelProduct: { naverShoppingRegistration: true, channelProductDisplayStatusType: "ON" }
  };
}

function naverNotice(listing) {
  const f = listing.notice?.fields || {};
  if (listing.notice?.type === "FOOD") {
    return { productInfoProvidedNoticeType: "FOOD", food: { productName: listing.title, weight: f.weight || "상세페이지 참조", amount: f.amount || "상세페이지 참조", size: f.size || "상세페이지 참조", producer: listing.supplierName || "상세페이지 참조", location: listing.origin || "상세페이지 참조", packDate: "상세페이지 참조", expirationDate: "상세페이지 참조", customerServicePhoneNumber: listing.asPhone || "상세페이지 참조" } };
  }
  return { productInfoProvidedNoticeType: "ETC", etc: { returnCostReason: "상세페이지 참조", noRefundReason: "상세페이지 참조", qualityAssuranceStandard: "상세페이지 참조", compensationProcedure: "상세페이지 참조", troubleShootingContents: "상세페이지 참조", itemName: listing.title, modelName: listing.productCode || "상세페이지 참조", manufacturer: listing.supplierName || "상세페이지 참조", customerServicePhoneNumber: listing.asPhone || "상세페이지 참조" } };
}

module.exports = { toCoupangProduct, toNaverProduct, COUPANG_CARRIERS, NAVER_CARRIERS };
