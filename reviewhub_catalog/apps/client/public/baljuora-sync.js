/*
 * 두고푸드 DB센터 → 발주오라 동기화 실행기 (2026-11-22)
 * 관리자 > 발주오라 동기화 화면의 책갈피 "두고푸드 동기화"가, 관리자가 로그인해 둔 발주오라 관리자 창(console.baljuora.com)에
 * 이 파일을 불러옵니다. 발주오라 로그인은 사람이 직접 합니다(이 파일은 로그인이나 사람 확인을 대신하지 않습니다).
 *
 * 하는 일
 *  1) DB센터 작업 코드로 작업 내용을 받습니다(GET {DB센터}/api/baljuora/runner/:code).
 *  2) 이 창의 로그인으로 발주오라 관리자 화면과 같은 방식(api.baljuora.com)으로 상품을 읽거나(비교) 고칩니다(보내기).
 *  3) 결과와 진단 정보(발주오라 응답의 칸 이름·형식, 오류 문구)를 DB센터로 돌려줍니다. 발주오라 로그인 토큰은 보내지 않습니다.
 *  4) (1.12.0) 한 번 누른 창에는 오른쪽 아래 '동기화' 버튼이 남고, DB센터가 같은 창으로 보낸 다음 작업(#doogo-sync=코드)을 바로 시작합니다.
 *  5) (1.12.1) DB센터 화면에서 누르면 책갈피가 잘 실행되는지 시험만 합니다(휴대폰 북마크 확인용).
 */
(function () {
  "use strict";

  var VERSION = "1.12.1";
  var API_BASE = "https://api.baljuora.com/";
  var PRICE_FIELDS = ["supplyPrice", "consumerPrice", "purchaseCost", "groupPrice"];
  // 상품명은 상품 정보 저장(PUT products/:id/info), 카테고리는 상품 수정(PUT products/:id)으로 따로 보냅니다(1.9.1, 아래 applyCategory).
  var INFO_FIELDS = ["name"];
  // 발주오라 상품 이미지 올리기(2026-11-23 발주오라 상품 등록·수정 화면 코드 확인):
  // POST files/presign {kind:"product-image", fileName, contentType, size, source:"product-form"} → 받은 uploadUrl 로 PUT(받은 headers 그대로)
  // → 받은 file.value 를 imageUrls 에 넣어 PUT products/:id. 발주오라 화면은 상품 이미지를 JPG·PNG, 1MB 이하, 최대 5장만 받습니다.
  var PRODUCT_IMAGE = { kind: "product-image", source: "product-form", maxBytes: 1024 * 1024, types: ["image/jpeg", "image/png"], limit: 5, maxSide: 2000 };
  var CODE_KEYS = ["code", "productCode", "sku", "skuCode", "managementCode", "manageCode", "customCode", "itemCode", "goodsCode"];
  var READ_ONLY_KEYS = ["id", "createdAt", "updatedAt", "deletedAt", "merchantId", "merchant", "creator", "updater", "createdBy", "updatedBy", "stats", "statistics", "inventory", "inventories", "histories", "orderCount", "salesCount"];

  // 발주오라 상품 수정 화면과 같은 방식으로 상세를 읽습니다(2026-11-23 화면 코드 확인: getProductsById(id, { include: [...] }),
  // 발주오라 API 도구는 배열을 쉼표로 이어 보냄). prices = 매출처별 개별공급가(황금농부 그룹 공급가 포함), productSuppliers = 매입처·매입원가.
  var DETAIL_INCLUDE = "categories,productSuppliers,shippingPolicy,prices,visibility";
  // 상품 목록 include(1.9.1, 2026-11-27 운영 절임배추): 발주오라 목록은 include에 categories가 없으면 상품마다 categoryIds·categories를
  // 빈 칸([])으로 줍니다(같은 상품 상세는 include=categories로 카테고리가 옴). 그래서 목록도 카테고리를 함께 읽고, 거절(400)되면 예전 include → include 없이.
  var LIST_INCLUDES = ["productSuppliers,prices,categories", "productSuppliers,prices"];
  // 상품 정보 칸(1.9.0, 2026-11-26 관리자 요청 "발주오라 상품관리자 페이지와 빠지는 거 없이 양방향으로"): 판매 상태(품절·도매몰 노출)·과세 여부·
  // 원산지·관리코드·바코드·내용량·발주상품명·발주단위·배송 단위·발주마감·인증·간략설명·출고지·제조연월일·소비기한·택배사·해외배송.
  // 발주오라 칸 이름은 발주오라 화면 코드(공개 js)·엑셀 칸 목록에서 확인했습니다. 보내기는 발주오라 상품 수정 화면처럼 PUT products/:id 에
  // 바뀐 칸만 보내고, 저장 뒤 다시 읽어 DB센터가 확인합니다(발주오라가 모르는 칸을 버려도 '반영됨'으로 보이지 않게).
  var EXTRA_FIELDS = ["soldOut", "visible", "taxable", "origin", "managementCode", "barcode", "content", "purchaseName", "purchaseQuantity", "shippingUnit", "purchaseDeadline", "certification", "summary", "shippingLocation", "manufacturingDate", "expirationDate", "courier", "tradeType"];
  var STATUS_KEYS = { soldOut: "isSoldOut", visible: "isVisible" };
  // 발주오라 요청 속도(1.9.1, 2026-11-27 운영: 상품 1,957개를 한 번에 보내자 대부분 "발주오라 응답 429 … 요청이 너무 많습니다. 잠시 후 다시
  // 시도해주세요."로 실패). 요청 사이에 간격을 두고, 429를 받으면 점점 길게 쉬었다가 같은 요청을 다시 보내며 간격도 늘립니다(계속 성공하면 조금씩 줄임).
  var REQUEST_GAP_MIN_MS = 150;
  var REQUEST_GAP_MAX_MS = 3000;
  var THROTTLE_WAITS_MS = [2000, 4000, 8000, 15000, 30000, 30000, 30000, 30000];
  // 보내기 속도(1.9.2, 2026-11-27 운영 "동기화가 매우 느려졌다": 상품 하나에 발주오라 요청 4~6개를 차례로 보내 상품당 1.3~4초,
  // 5개마다 DB센터 응답을 기다림). 상품 3개를 함께 처리하되(각 상품 안의 요청 순서는 그대로) 모든 요청은 위 간격을 함께 지키고,
  // 결과는 상품을 보내는 동안 따로(한 번에 하나씩) DB센터로 보냅니다(20개 또는 4초마다, 일시 오류는 1·3·8초 뒤 다시).
  var PUSH_CONCURRENCY = 3;
  var RESULT_BATCH_SIZE = 20;
  var RESULT_FLUSH_MS = 4000;
  var RESULT_RETRY_WAITS_MS = [1000, 3000, 8000];
  // 신규 등록: DB센터에 값이 없으면 복사한 상품 값을 쓰지 않을 칸(상품마다 다른 칸). 택배사·출고지·발주마감·배송 단위·해외배송은 매입처마다 같아 그대로 둡니다.
  var PRODUCT_SPECIFIC_KEYS = ["managementCode", "barcode", "originText", "description", "manufacturingDate", "expirationDate", "contentAmount", "contentUnit", "contentCount", "contentAmountBasis", "purchaseProductName", "purchaseName", "purchaseQuantity", "taxonomyItemId"];

  // ─── 순수 도우미(테스트에서도 씀) ─────────────────────────────────────────────

  function SyncError(message, detail) {
    var error = new Error(message);
    error.name = "SyncError";
    error.detail = detail;
    return error;
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function toNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    var number = typeof value === "number" ? value : Number(String(value).replace(/[,\s원]/g, ""));
    return isFinite(number) ? Math.round(number) : null;
  }

  function unwrap(payload) {
    if (isObject(payload) && "data" in payload && (payload.statusCode !== undefined || payload.message !== undefined || Object.keys(payload).length <= 4)) return payload.data;
    return payload;
  }

  function pickArray(data) {
    if (Array.isArray(data)) return data;
    if (!isObject(data)) return [];
    var keys = ["items", "data", "list", "rows", "results", "products", "content"];
    for (var index = 0; index < keys.length; index += 1) {
      if (Array.isArray(data[keys[index]])) return data[keys[index]];
    }
    return [];
  }

  function pageMeta(data) {
    var meta = isObject(data) && isObject(data.meta) ? data.meta : isObject(data) && isObject(data.pagination) ? data.pagination : isObject(data) ? data : {};
    return {
      hasNext: typeof meta.hasNext === "boolean" ? meta.hasNext : undefined,
      totalPages: toNumber(meta.totalPages || meta.lastPage || meta.pageCount),
      total: toNumber(meta.total || meta.totalCount || meta.totalItems || meta.count)
    };
  }

  function firstString(record, keys) {
    for (var index = 0; index < keys.length; index += 1) {
      var value = record[keys[index]];
      if (typeof value === "string" && value.trim()) return { key: keys[index], value: value.trim() };
      if (typeof value === "number" && isFinite(value)) return { key: keys[index], value: String(value) };
    }
    return null;
  }

  function extractImages(record) {
    if (Array.isArray(record.imageUrls)) return record.imageUrls.filter(function (url) { return typeof url === "string" && url; });
    if (Array.isArray(record.images)) {
      return record.images.map(function (image) { return typeof image === "string" ? image : isObject(image) ? image.url || image.imageUrl || image.fileUrl || "" : ""; }).filter(Boolean);
    }
    var single = record.thumbnailUrl || record.imageUrl || record.mainImageUrl;
    return typeof single === "string" && single ? [single] : [];
  }

  // 카테고리 칸이 아예 없으면 undefined(읽지 못함), 칸은 있는데 비어 있으면 []
  function extractCategoryIds(record) {
    if (Array.isArray(record.categoryIds)) return record.categoryIds.filter(function (id) { return typeof id === "string"; });
    if ("categoryId" in record) return typeof record.categoryId === "string" && record.categoryId ? [record.categoryId] : [];
    if ("category" in record) return isObject(record.category) && typeof record.category.id === "string" ? [record.category.id] : [];
    if (Array.isArray(record.categories)) {
      return record.categories.map(function (category) { return typeof category === "string" ? category : isObject(category) ? category.id || category.categoryId : null; }).filter(function (id) { return typeof id === "string"; });
    }
    if (Array.isArray(record.productCategories)) {
      return record.productCategories.map(function (entry) { return isObject(entry) ? entry.categoryId || (isObject(entry.category) ? entry.category.id : null) : null; }).filter(function (id) { return typeof id === "string"; });
    }
    return undefined;
  }

  function groupEntryInfo(entry) {
    if (!isObject(entry)) return null;
    // 개별공급가 줄은 매출처(셀러) 줄과 그룹 줄이 섞여 있습니다(발주오라 화면 "타입: 그룹/매출처").
    var type = String(entry.targetType || entry.type || entry.priceType || entry.kind || "").toUpperCase();
    var target = isObject(entry.target) ? entry.target : null;
    var group = isObject(entry.sellerGroup) ? entry.sellerGroup : isObject(entry.group) ? entry.group : target && /GROUP/.test(type) ? target : {};
    var sellerOnly = (/SELLER/.test(type) && !/GROUP/.test(type)) || (!group.id && !entry.sellerGroupId && !entry.groupId && (isObject(entry.seller) || typeof entry.sellerId === "string"));
    var price = ["supplyPrice", "price", "groupPrice", "groupSupplyPrice", "amount", "unitPrice"].find(function (key) { return key in entry; });
    var id = entry.sellerGroupId || entry.groupId || group.id || (/GROUP/.test(type) && typeof entry.targetId === "string" ? entry.targetId : null) || null;
    return {
      kind: sellerOnly ? "seller" : id || /GROUP/.test(type) ? "group" : null,
      id: sellerOnly ? null : id,
      name: sellerOnly ? "" : entry.sellerGroupName || entry.groupName || group.name || entry.targetName || (target && target.name) || entry.name || "",
      priceKey: price || null,
      price: price ? toNumber(entry[price]) : null
    };
  }

  function groupArrayKeys(record) {
    return Object.keys(record).filter(function (key) {
      return Array.isArray(record[key]) && /group|tier|grade|^prices$|sellerPrices|customPrices|individualPrices/i.test(key) && record[key].every(function (entry) { return isObject(entry); });
    });
  }

  function matchesGroup(info, group, keyword) {
    if (!info || info.kind === "seller") return false;
    if (group && group.id && info.id === group.id) return true;
    return Boolean(keyword && info.name && String(info.name).indexOf(keyword) >= 0);
  }

  // 수강생 단가 = 매출처 그룹(이름에 keyword) 공급가. 그룹 가격 칸이 없으면 undefined(읽지 못함), 칸은 있는데 그 그룹이 없으면 null
  function extractGroupPrice(record, group, keyword) {
    var keys = groupArrayKeys(record);
    if (keys.length === 0) return undefined;
    for (var index = 0; index < keys.length; index += 1) {
      var list = record[keys[index]];
      for (var entryIndex = 0; entryIndex < list.length; entryIndex += 1) {
        var info = groupEntryInfo(list[entryIndex]);
        if (matchesGroup(info, group, keyword)) return info.price;
      }
    }
    return null;
  }

  // 매입원가: 상품 칸(purchaseCost·purchasePrice)이 없으면 매입처 목록(productSuppliers)의 기본 매입처 매입원가를 씁니다. 못 읽으면 undefined.
  function extractPurchaseCost(record) {
    if (record.purchaseCost !== undefined) return toNumber(record.purchaseCost);
    if (record.purchasePrice !== undefined) return toNumber(record.purchasePrice);
    if (!Array.isArray(record.productSuppliers)) return undefined;
    var entries = record.productSuppliers.filter(isObject);
    var main = entries.find(function (entry) { return entry.isDefault === true || entry.isMain === true || entry.default === true; }) || entries[0];
    if (!main) return undefined;
    var key = ["purchasePrice", "purchaseCost", "costPrice", "price", "unitPrice"].find(function (name) { return main[name] !== undefined && main[name] !== null; });
    return key ? toNumber(main[key]) : undefined;
  }

  function decimalOf(value) {
    if (value === null || value === undefined || value === "") return null;
    var number = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
    return isFinite(number) ? Math.round(number * 100) / 100 : null;
  }

  function textOf(value) {
    if (typeof value === "number" && isFinite(value)) return String(value);
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() || null : null;
  }

  // 상품 정보 칸(1.9.0): 응답에 있는 칸만 읽습니다(없는 칸은 넣지 않음 = 읽지 못함). 칸이 하나도 없으면 undefined.
  function extractExtra(record) {
    if (!isObject(record)) return undefined;
    var extra = {};
    var found = false;
    var set = function (key, value) { extra[key] = value; found = true; };
    ["originText", "managementCode", "barcode", "contentUnit", "shippingUnitType", "purchaseDeadline", "description", "shippingLocation", "manufacturingDate", "expirationDate", "courier", "tradeType", "taxonomyItemId"].forEach(function (key) {
      if (key in record) set(key, textOf(record[key]));
    });
    if ("contentAmountBasis" in record) set("contentBasis", textOf(record.contentAmountBasis));
    ["contentAmount", "contentCount", "purchaseQuantity", "shippingUnitValue"].forEach(function (key) {
      if (key in record) set(key, decimalOf(record[key]));
    });
    // 발주상품명: 상품 정보는 purchaseProductName(내보내기 엑셀 칸 이름), 없으면 purchaseName(올리기 엑셀 칸 이름)
    if ("purchaseProductName" in record) { set("purchaseName", textOf(record.purchaseProductName)); extra.purchaseNameKey = "purchaseProductName"; }
    else if ("purchaseName" in record) { set("purchaseName", textOf(record.purchaseName)); extra.purchaseNameKey = "purchaseName"; }
    // 인증: 도매몰 목록은 certificationKinds, 상품 정보는 인증 상태 + 인증 목록(인증 있음 HAS_CERT일 때만 인증 종류를 씀 — 발주오라 화면과 같은 규칙)
    if (Array.isArray(record.certificationKinds)) {
      set("certificationKinds", record.certificationKinds.filter(function (kind) { return typeof kind === "string" && kind; }));
    } else if (Array.isArray(record.certifications)) {
      var status = record.certificationStatus !== undefined ? record.certificationStatus : record.certStatus;
      var kinds = status !== undefined && status !== null && status !== "HAS_CERT" ? [] : record.certifications.map(function (entry) { return isObject(entry) ? entry.kind || entry.type : typeof entry === "string" ? entry : null; }).filter(function (kind) { return typeof kind === "string" && kind; });
      set("certificationKinds", kinds.filter(function (kind, index) { return kinds.indexOf(kind) === index; }));
    }
    var taxonomy = isObject(record.taxonomyItem) ? record.taxonomyItem : null;
    if (taxonomy) {
      if (!("taxonomyItemId" in extra) && typeof taxonomy.id === "string") set("taxonomyItemId", taxonomy.id);
      var taxonomyName = textOf(taxonomy.path || taxonomy.fullName || taxonomy.fullPath || taxonomy.name);
      if (taxonomyName) set("taxonomyName", taxonomyName);
    } else if (typeof record.taxonomyItemName === "string") {
      set("taxonomyName", textOf(record.taxonomyItemName));
    }
    return found ? extra : undefined;
  }

  // 발주상품명을 보낼 칸 이름(상품 정보에 있는 칸)
  function purchaseNameKeyOf(detail) {
    if (isObject(detail)) {
      if ("purchaseProductName" in detail) return "purchaseProductName";
      if ("purchaseName" in detail) return "purchaseName";
    }
    return "purchaseProductName";
  }

  // DB센터 칸 하나 → 보낼 발주오라 칸들(extra = DB센터가 보낸 값, 발주오라 칸 이름). 보낼 값을 모르면 null. 인증은 보내지 않습니다.
  function extraBodyFor(field, extra, detail) {
    var e = isObject(extra) ? extra : {};
    var has = function (key) { return Object.prototype.hasOwnProperty.call(e, key); };
    var one = function (key, value) { var body = {}; body[key] = value; return body; };
    if (field === "soldOut") return typeof e.isSoldOut === "boolean" ? { isSoldOut: e.isSoldOut } : null;
    if (field === "visible") return typeof e.isVisible === "boolean" ? { isVisible: e.isVisible } : null;
    if (field === "taxable") return typeof e.isTaxable === "boolean" ? { isTaxable: e.isTaxable } : null;
    if (field === "content") return has("contentAmount") || has("contentCount") ? { contentAmount: e.contentAmount === undefined ? null : e.contentAmount, contentUnit: e.contentUnit || null, contentCount: e.contentCount === undefined ? null : e.contentCount, contentAmountBasis: e.contentBasis || null } : null;
    if (field === "shippingUnit") return has("shippingUnitType") || has("shippingUnitValue") ? { shippingUnitType: e.shippingUnitType || null, shippingUnitValue: e.shippingUnitValue === undefined ? null : e.shippingUnitValue } : null;
    if (field === "purchaseName") return has("purchaseName") ? one(purchaseNameKeyOf(detail), e.purchaseName) : null;
    // 발주단위를 지우면 기본값 1로 보냅니다.
    if (field === "purchaseQuantity") return has("purchaseQuantity") ? { purchaseQuantity: e.purchaseQuantity === null ? 1 : e.purchaseQuantity } : null;
    var simple = { origin: "originText", managementCode: "managementCode", barcode: "barcode", purchaseDeadline: "purchaseDeadline", summary: "description", shippingLocation: "shippingLocation", manufacturingDate: "manufacturingDate", expirationDate: "expirationDate", courier: "courier", tradeType: "tradeType" };
    var key = simple[field];
    return key && has(key) ? one(key, e[key]) : null;
  }

  // 보내기 전 발주오라 값과 같은지(빈 값끼리·숫자 모양 차이는 같게 봄)
  function sameExtraValue(live, wanted) {
    var blank = function (value) { return value === null || value === undefined || value === ""; };
    if (blank(live) && blank(wanted)) return true;
    if (blank(live) || blank(wanted)) return false;
    if (typeof wanted === "boolean" || typeof live === "boolean") return live === wanted;
    var liveNumber = Number(live);
    var wantedNumber = Number(wanted);
    if (typeof wanted === "number" && isFinite(liveNumber)) return Math.abs(liveNumber - wantedNumber) < 1e-6;
    // 시각("09:30:00" = "09:30")·날짜("2026-11-01T00:00:00Z" = "2026-11-01")는 발주오라가 돌려주는 모양이 달라도 같게 봅니다.
    var shape = function (value) {
      var text = String(value).replace(/\s+/g, " ").trim();
      var time = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(text);
      if (time) return ("0" + time[1]).slice(-2) + ":" + time[2];
      var iso = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}/.exec(text);
      return iso ? iso[1] : text;
    };
    return shape(live) === shape(wanted);
  }

  function normalizeProduct(record, context) {
    if (!isObject(record) || typeof record.id !== "string") return null;
    var code = firstString(record, CODE_KEYS);
    var snapshot = {
      id: record.id,
      kind: record.targetType === "bundle" || record.type === "bundle" || record.productType === "bundle" ? "bundle" : "product",
      code: code ? code.value : null,
      name: String(record.name || record.productName || "").replace(/\s+/g, " ").trim(),
      supplyPrice: toNumber(record.supplyPrice),
      consumerPrice: toNumber(record.consumerPrice !== undefined ? record.consumerPrice : record.retailPrice),
      purchaseCost: (function () { var cost = extractPurchaseCost(record); return cost === undefined ? null : cost; })(),
      imageUrls: extractImages(record).slice(0, 20),
      isVisible: typeof record.isVisible === "boolean" ? record.isVisible : null,
      isSoldOut: typeof record.isSoldOut === "boolean" ? record.isSoldOut : null,
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : typeof record.createdAt === "string" ? record.createdAt : null
    };
    // 발주오라 등록일시(1.11.0): DB센터 상품 리스트 '발주오라 번호'(발주오라 상품 리스트처럼 등록일시 최신순)에 씁니다.
    if (typeof record.createdAt === "string" && record.createdAt) snapshot.createdAt = record.createdAt;
    // 과세 여부(1.7.0): 홈택스 세금계산서(과세)·계산서(면세) 나누기에 씀. 칸이 없으면 보내지 않음.
    if (typeof record.isTaxable === "boolean") snapshot.isTaxable = record.isTaxable;
    var categoryIds = extractCategoryIds(record);
    if (categoryIds !== undefined) snapshot.categoryIds = categoryIds;
    var groupPrice = extractGroupPrice(record, context && context.group, context && context.groupKeyword);
    if (groupPrice !== undefined) snapshot.groupPrice = groupPrice;
    // 매출배송정책(배송비 정책): sellShippingPolicyId(없으면 shippingPolicy.id). 칸이 아예 없으면 읽지 못함(보내지 않음)
    if ("sellShippingPolicyId" in record) snapshot.shippingPolicyId = typeof record.sellShippingPolicyId === "string" && record.sellShippingPolicyId ? record.sellShippingPolicyId : null;
    else if (isObject(record.shippingPolicy) && typeof record.shippingPolicy.id === "string") snapshot.shippingPolicyId = record.shippingPolicy.id;
    var extra = extractExtra(record);
    if (extra) snapshot.extra = extra;
    return snapshot;
  }

  // 발주오라 배송비 정책(GET merchant/shipping-policies): 유형 fixed·free·byPrice·byQuantity·byUnit, 구간 rules[{startRange, endRange, fee, unitType}].
  // 구간을 읽지 못했으면 rules는 null(정책 상세를 다시 읽음).
  function normalizeShippingPolicy(raw) {
    if (!isObject(raw) || typeof raw.id !== "string") return null;
    return {
      id: raw.id,
      code: typeof raw.code === "string" && raw.code ? raw.code : null,
      name: String(raw.name || "").replace(/\s+/g, " ").trim(),
      type: typeof raw.type === "string" ? raw.type : null,
      fixedFee: toNumber(raw.fixedFee),
      isConditionRepeat: raw.isConditionRepeat === true,
      isSameOrderFree: raw.isSameOrderFree === true,
      isJejuAndRemoteAdditionalFee: raw.isJejuAndRemoteAdditionalFee === true,
      jejuAdditionalFee: toNumber(raw.jejuAdditionalFee) || 0,
      remoteAdditionalFee: toNumber(raw.remoteAdditionalFee) || 0,
      rules: Array.isArray(raw.rules) ? raw.rules.filter(isObject).map(function (rule) {
        return { startRange: toNumber(rule.startRange), endRange: toNumber(rule.endRange), fee: toNumber(rule.fee) || 0, unitType: typeof rule.unitType === "string" ? rule.unitType : null };
      }) : null
    };
  }

  // 목록에서 읽은 값에 상세에서 읽은 값을 더합니다(상세에만 있는 카테고리·그룹 가격·상품코드).
  function mergeSnapshots(listSnapshot, detailSnapshot) {
    if (!detailSnapshot) return listSnapshot;
    var merged = Object.assign({}, listSnapshot);
    Object.keys(detailSnapshot).forEach(function (key) {
      var value = detailSnapshot[key];
      if (value === undefined) return;
      if (key === "imageUrls" && Array.isArray(value) && value.length === 0 && merged.imageUrls && merged.imageUrls.length) return;
      if ((key === "code" || key === "name") && !value && merged[key]) return;
      merged[key] = value;
    });
    return merged;
  }

  // ─── 판매·매출처(1.7.0, 2026-11-23 관리자 요청 "1차 개발") ─────────────────────
  // 발주오라 주문 목록 화면과 같은 API(GET orders/items, 커서 방식 meta.nextCursor)로 주문 상품 줄을 읽습니다
  // (발주오라 판매자·관리자 화면 공용 코드 확인: limit·rangeType·startDate·endDate·cursor, 항목 id·orderId·createdAt·quantity·
  //  csProcessedQuantity(취소·반품 처리 수량)·effectiveQuantity·supplyPrice·purchaseCost·salesShippingFee·purchaseShippingFee·
  //  productId·productName·supplierId·supplierName·sellerName·status). 받는 사람 이름·연락처는 읽어도 보내지 않습니다.
  function pickString(record, keys) {
    if (!isObject(record)) return null;
    var found = firstString(record, keys);
    return found ? found.value : null;
  }

  function normalizeOrderItem(record) {
    if (!isObject(record)) return null;
    var id = pickString(record, ["id", "orderItemId", "itemId"]);
    if (!id) return null;
    var product = isObject(record.product) ? record.product : {};
    var seller = isObject(record.seller) ? record.seller : isObject(record.sellerTarget) ? record.sellerTarget : {};
    var supplier = isObject(record.supplier) ? record.supplier : {};
    var order = isObject(record.order) ? record.order : {};
    var quantity = Math.max(0, toNumber(record.quantity) || 0);
    var processed = Math.max(0, toNumber(record.csProcessedQuantity) || 0);
    var effective = record.effectiveQuantity !== undefined && record.effectiveQuantity !== null ? toNumber(record.effectiveQuantity) : quantity - processed;
    var supplyPrice = toNumber(record.supplyPrice);
    if (supplyPrice === null) supplyPrice = toNumber(record.unitPrice !== undefined ? record.unitPrice : record.price);
    return {
      id: id,
      orderId: pickString(record, ["orderId"]) || pickString(order, ["id"]),
      orderedAt: pickString(record, ["orderedAt", "orderDate", "createdAt"]) || pickString(order, ["orderedAt", "createdAt"]),
      status: (pickString(record, ["status", "orderStatus"]) || pickString(order, ["status"]) || "").toLowerCase() || null,
      productId: pickString(record, ["productId"]) || pickString(product, ["id"]),
      productCode: pickString(record, ["productCode"]) || pickString(product, ["code"]),
      productName: (pickString(record, ["productName"]) || pickString(product, ["name"]) || "").replace(/\s+/g, " ").trim(),
      supplierId: pickString(record, ["supplierId"]) || pickString(supplier, ["id"]),
      supplierName: pickString(record, ["supplierName"]) || pickString(supplier, ["companyName", "name"]),
      sellerId: pickString(record, ["sellerId", "sellerTargetId"]) || pickString(seller, ["id"]),
      sellerName: pickString(record, ["sellerName", "sellerCompanyName"]) || pickString(seller, ["companyName", "name"]),
      quantity: quantity,
      netQuantity: Math.max(0, Math.min(quantity, effective === null ? quantity : effective)),
      supplyPrice: supplyPrice === null ? 0 : supplyPrice,
      purchaseCost: toNumber(record.purchaseCost),
      salesShippingFee: Math.max(0, toNumber(record.salesShippingFee) || 0),
      purchaseShippingFee: Math.max(0, toNumber(record.purchaseShippingFee) || 0)
    };
  }

  // 발주오라 매출처(셀러) 회원(GET merchant/sellers, 매출처 상세 화면과 같은 칸). 계좌·비밀번호·사업자등록증 파일·설정은 보내지 않습니다.
  function normalizeSeller(record, groupNames) {
    if (!isObject(record)) return null;
    var id = pickString(record, ["id"]);
    if (!id) return null;
    var group = isObject(record.group) ? record.group : isObject(record.sellerGroup) ? record.sellerGroup : {};
    var groupId = pickString(record, ["groupId"]) || pickString(group, ["id"]);
    return {
      id: id,
      companyName: pickString(record, ["companyName"]) || pickString(record, ["name", "username"]) || id,
      representativeName: pickString(record, ["representativeName", "ceoName"]),
      businessNumber: pickString(record, ["businessNumber", "businessRegistrationNumber"]),
      businessType: pickString(record, ["businessType"]),
      businessCategory: pickString(record, ["businessCategory", "businessItem"]),
      email: pickString(record, ["email"]),
      phone: pickString(record, ["phone", "phoneNumber"]),
      managerName: pickString(record, ["name", "managerName"]),
      zipCode: pickString(record, ["zipCode"]),
      address: pickString(record, ["address"]),
      addressDetail: pickString(record, ["addressDetail"]),
      groupId: groupId,
      groupName: pickString(group, ["name"]) || (groupId && groupNames && groupNames[groupId]) || null,
      status: pickString(record, ["status"]),
      orderAcceptType: pickString(record, ["orderAcceptType"]),
      username: pickString(record, ["username"]),
      lastLoginAt: pickString(record, ["lastLoginAt"]),
      joinedAt: pickString(record, ["createdAt"])
    };
  }

  // 발주오라 매입처(거래처 관리 > 매입처, GET merchant/suppliers — 1.10.0 운영 홈 '주문 동기화'): DB센터 공급사 관리에 없는 매입처를
  // 새로 등록하려고 이름·사업자 정보만 보냅니다(계좌·비밀번호·서류 파일은 보내지 않음). 쓰지 않는 매입처는 isActive false.
  function normalizeSupplier(record) {
    if (!isObject(record)) return null;
    var id = pickString(record, ["id"]);
    var name = pickString(record, ["companyName", "name", "supplierName"]);
    if (!id || !name) return null;
    var status = pickString(record, ["status"]);
    var active = typeof record.isActive === "boolean" ? record.isActive : status ? !/^(inactive|deleted|suspended|stopped|disabled|withdrawn)$/i.test(status) : null;
    var address = [pickString(record, ["address"]), pickString(record, ["addressDetail"])].filter(Boolean).join(" ");
    return {
      id: id,
      name: name,
      representativeName: pickString(record, ["representativeName", "ceoName"]),
      businessNumber: pickString(record, ["businessNumber", "businessRegistrationNumber"]),
      phone: pickString(record, ["phone", "phoneNumber", "tel"]),
      email: pickString(record, ["email"]),
      address: address || null,
      isActive: active
    };
  }

  // 목록에 세금계산서용 칸(사업자번호·대표자·주소)이 없으면 매출처 상세를 읽습니다.
  function sellerNeedsDetail(buyer) {
    return !buyer.businessNumber || !buyer.representativeName || !buyer.address;
  }

  function flattenCategories(tree) {
    var result = [];
    function walk(nodes, parent) {
      if (!Array.isArray(nodes)) return;
      nodes.forEach(function (node) {
        if (!isObject(node) || typeof node.id !== "string" || typeof node.name !== "string") return;
        var category = { id: node.id, name: node.name, parentId: parent ? parent.id : null, path: parent ? parent.path + " > " + node.name : node.name };
        result.push(category);
        walk(node.children, category);
      });
    }
    walk(Array.isArray(tree) ? tree : pickArray(tree), null);
    return result;
  }

  // ─── 발주오라 상품 카테고리 트리 맞추기(DB센터 → 발주오라, 2026-11-23) ───────────────────────────
  // 발주오라 상품 카테고리 화면 코드(page-3ad178912d96b35e.js) 확인 결과:
  //  - 읽기 GET merchant/categories/tree → [{ id, name, description, sortOrder, isVisible, children: [...] }]
  //  - 저장 POST merchant/categories/tree { categories: 트리 전체 } — 각 칸 { id(새 카테고리는 없음), name, description, sortOrder: 같은 단계 순서(0부터), isVisible, children }
  //    트리에 없는 카테고리는 지워집니다. 그래서 지금 트리를 그대로 두고 추가·이름 바꾸기만 더해 전체를 보냅니다(브랜드별 아래도 그대로).
  //  - 최대 3단계, 카테고리 이름은 트리 전체에서 겹치면 안 됩니다(앞뒤 공백·대소문자 무시).

  // 이모지·띄어쓰기를 뺀 이름(제외할 1차 카테고리 '브랜드별' 찾기)
  function plainName(name) {
    return String(name || "").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
  }

  function treeRootsOf(payload) {
    var value = unwrap(payload);
    if (Array.isArray(value)) return value;
    if (isObject(value) && Array.isArray(value.categories)) return value.categories;
    var list = pickArray(value);
    return list.length || Array.isArray(value) ? list : null;
  }

  // 모든 칸에 id·이름·children 목록이 있어야 저장할 수 있습니다(하나라도 다르면 바꾸지 않음).
  function treeShapeProblem(roots) {
    var problem = null;
    var seen = 0;
    (function walk(nodes, depth) {
      if (problem) return;
      if (!Array.isArray(nodes)) { problem = "children 목록 없음"; return; }
      nodes.forEach(function (node) {
        if (problem) return;
        seen += 1;
        if (!isObject(node) || typeof node.id !== "string" || !node.id) problem = "id 없는 카테고리";
        else if (typeof node.name !== "string") problem = "이름 없는 카테고리";
        else if (node.children !== undefined && node.children !== null && !Array.isArray(node.children)) problem = "children 형식 다름";
        else if (depth > 5) problem = "단계가 너무 깊음";
        else walk(node.children || [], depth + 1);
      });
    })(roots, 0);
    if (!problem && seen === 0) problem = "카테고리가 하나도 없음";
    return problem;
  }

  // 제외한 1차 카테고리(브랜드별) 아래 모든 카테고리 id
  function excludedTreeIds(flat, excludeNames) {
    var names = (excludeNames || []).map(plainName).filter(Boolean);
    var roots = {};
    flat.forEach(function (category) { if (category.parentId === null && names.indexOf(plainName(category.name)) >= 0) roots[category.id] = true; });
    var parentOf = {};
    flat.forEach(function (category) { parentOf[category.id] = category.parentId; });
    var result = {};
    flat.forEach(function (category) {
      var current = category.id;
      for (var depth = 0; current && depth < 10; depth += 1) {
        if (roots[current]) { result[category.id] = true; break; }
        current = parentOf[current];
      }
    });
    return result;
  }

  // 지금 트리에 추가·이름 바꾸기를 더한 저장용 트리를 만듭니다(원래 트리는 바꾸지 않음).
  function planTreeSave(roots, ops, excludeNames) {
    var draft = (function copy(nodes) {
      return nodes.map(function (node) {
        return { id: node.id, name: node.name, description: node.description === null ? undefined : node.description, isVisible: node.isVisible, children: copy(Array.isArray(node.children) ? node.children : []) };
      });
    })(roots);
    var index = {};
    (function walk(nodes, parent, depth) {
      nodes.forEach(function (node) { index[node.id] = { node: node, parent: parent, depth: depth }; walk(node.children, node, depth + 1); });
    })(draft, null, 0);
    var flat = flattenCategories(roots);
    var excluded = excludedTreeIds(flat, excludeNames);
    var names = function () {
      var list = [];
      (function walk(nodes) { nodes.forEach(function (node) { list.push({ node: node, key: String(node.name).trim().toLowerCase() }); walk(node.children); }); })(draft);
      return list;
    };
    var nameTaken = function (name, except) {
      var key = String(name).trim().toLowerCase();
      return names().some(function (entry) { return entry.node !== except && entry.key === key; });
    };
    var result = { draft: draft, changed: false, applied: [], skipped: [], pending: {}, linked: {} };
    var label = function (op) { return op.type === "rename" ? op.to : op.name; };
    var keyOf = function (op) { return op.type === "rename" ? "r:" + op.baljuoraId : op.ref; };
    var skip = function (op, reason) { result.skipped.push({ key: keyOf(op), name: label(op), reason: reason }); };
    (ops || []).forEach(function (op) {
      if (!isObject(op)) return;
      if (op.type === "rename") {
        var entry = index[op.baljuoraId];
        if (!entry) return skip(op, "발주오라에서 이 카테고리를 찾지 못했습니다(발주오라 상품 불러오기를 다시 해 주세요).");
        if (excluded[op.baljuoraId]) return skip(op, "브랜드별 아래 카테고리라 바꾸지 않았습니다.");
        var to = String(op.to || "").trim();
        if (!to) return skip(op, "새 이름이 비어 있습니다.");
        if (String(entry.node.name).trim() === to) { result.applied.push({ key: keyOf(op), type: "rename", name: to, already: true }); return; }
        if (nameTaken(to, entry.node)) return skip(op, "발주오라에 같은 이름의 카테고리가 이미 있어 바꾸지 않았습니다(발주오라는 카테고리 이름이 겹치면 안 됩니다).");
        entry.node.name = to;
        result.changed = true;
        result.applied.push({ key: keyOf(op), type: "rename", name: to, from: op.from, baljuoraId: op.baljuoraId });
        return;
      }
      if (op.type !== "add") return;
      var name = String(op.name || "").trim();
      if (!name) return skip(op, "이름이 비어 있습니다.");
      var siblings;
      if (op.parentBaljuoraId) {
        var parent = index[op.parentBaljuoraId];
        if (!parent) return skip(op, "발주오라에서 1차 카테고리를 찾지 못했습니다(발주오라 상품 불러오기를 다시 해 주세요).");
        if (excluded[op.parentBaljuoraId]) return skip(op, "브랜드별 아래에는 추가하지 않습니다.");
        if (parent.depth >= 2) return skip(op, "발주오라 카테고리는 3단계까지만 만들 수 있습니다.");
        siblings = parent.node.children;
      } else if (op.parentRef) {
        var pendingParent = result.pending[op.parentRef];
        if (!pendingParent) return skip(op, "1차 카테고리를 먼저 만들지 못해 추가하지 않았습니다.");
        siblings = pendingParent.children;
      } else {
        siblings = draft;
      }
      var same = siblings.filter(function (node) { return String(node.name).trim().toLowerCase() === name.toLowerCase() || plainName(node.name) === plainName(name); })[0];
      if (same) {
        // 발주오라에 이미 같은 이름이 있으면 새로 만들지 않고 연결만 합니다.
        result.pending[op.ref] = same;
        if (same.id) result.linked[op.ref] = same.id;
        result.applied.push({ key: op.ref, type: "add", name: same.name, linked: true });
        return;
      }
      if (nameTaken(name, null)) return skip(op, "발주오라 다른 곳에 같은 이름의 카테고리가 있어 추가하지 않았습니다(발주오라는 카테고리 이름이 겹치면 안 됩니다).");
      var node = { name: name, description: "", isVisible: true, children: [], ref: op.ref };
      if (siblings === draft) {
        // 새 1차 카테고리는 제외한 카테고리(브랜드별) 앞에 넣어 브랜드별이 맨 뒤에 그대로 있게 합니다.
        var at = draft.findIndex(function (item) { return item.id && excluded[item.id]; });
        if (at < 0) draft.push(node); else draft.splice(at, 0, node);
      } else {
        siblings.push(node);
      }
      result.pending[op.ref] = node;
      result.changed = true;
      result.applied.push({ key: op.ref, type: "add", name: name });
    });
    return result;
  }

  // 발주오라 상품 카테고리 화면의 저장(prepareForSave)과 같은 모양: sortOrder = 같은 단계 순서, 새 카테고리는 id 없음
  function treeSaveBody(nodes) {
    return nodes.map(function (node, index) {
      return { id: node.id || undefined, name: node.name, description: node.description, sortOrder: index, isVisible: node.isVisible, children: treeSaveBody(node.children || []) };
    });
  }

  // 저장 뒤 다시 읽은 트리 확인: 원래 카테고리가 모두 있는지, 바꾼 이름·새 카테고리가 보이는지(새 카테고리 id를 찾음)
  function verifyTreeSave(beforeRoots, afterRoots, saved) {
    var after = flattenCategories(afterRoots);
    var byId = {};
    after.forEach(function (category) { byId[category.id] = category; });
    var missing = flattenCategories(beforeRoots).filter(function (category) { return !byId[category.id]; });
    var created = {};
    var failed = [];
    saved.applied.forEach(function (entry) {
      if (entry.type === "rename" && !entry.already) {
        var now = byId[entry.baljuoraId];
        if (!now || String(now.name).trim() !== entry.name) failed.push({ key: entry.key, name: entry.name, reason: "저장 뒤 다시 읽은 이름이 바뀌지 않았습니다." });
      }
      if (entry.type === "add") {
        var node = saved.pending[entry.key];
        if (node && node.id) { created[entry.key] = node.id; return; }
        var parent = null;
        Object.keys(saved.pending).forEach(function (ref) { if (saved.pending[ref] && (saved.pending[ref].children || []).indexOf(node) >= 0) parent = saved.pending[ref]; });
        var parentId = parent ? parent.id || created[parent.ref] || null : null;
        if (!parentId) {
          (function find(nodes) { nodes.forEach(function (item) { if ((item.children || []).indexOf(node) >= 0) parentId = item.id || created[item.ref] || null; find(item.children || []); }); })(saved.draft);
        }
        var match = after.filter(function (category) { return String(category.name).trim() === entry.name && (category.parentId || null) === (parentId || null); })[0];
        if (match) created[entry.key] = match.id;
        else failed.push({ key: entry.key, name: entry.name, reason: "저장 뒤 다시 읽은 발주오라 카테고리에서 찾지 못했습니다." });
      }
    });
    return { missing: missing, created: created, failed: failed, categories: after };
  }

  // 발주오라 응답의 칸 이름·형식만 남깁니다(값은 남기지 않음).
  function structureOf(value, depth) {
    var level = depth || 0;
    if (Array.isArray(value)) return value.length === 0 ? "array(0)" : ["array", structureOf(value[0], level + 1)];
    if (isObject(value)) {
      if (level > 3) return "object";
      var shape = {};
      Object.keys(value).slice(0, 140).forEach(function (key) { shape[key] = structureOf(value[key], level + 1); });
      return shape;
    }
    return value === null ? "null" : typeof value;
  }

  function messagesOf(error) {
    var data = error && error.data;
    var messages = [];
    var push = function (value) {
      if (typeof value === "string") messages.push(value);
      else if (Array.isArray(value)) value.forEach(push);
      else if (isObject(value)) Object.keys(value).forEach(function (key) { push(value[key]); });
    };
    if (data) {
      push(data.message);
      push(data.errors);
      push(data.details);
    }
    if (messages.length === 0 && error && error.message) messages.push(error.message);
    return messages;
  }

  function forbiddenProperties(messages) {
    var names = [];
    messages.forEach(function (message) {
      var match = /property\s+([A-Za-z0-9_.]+)\s+should not exist/i.exec(message);
      if (match) names.push(match[1].split(".")[0]);
    });
    return names;
  }

  // 목록 안쪽 칸 오류("prices.0.property sellShippingPolicyId should not exist") → [{ parent: "prices", key: "sellShippingPolicyId" }]
  function nestedForbidden(messages) {
    var list = [];
    messages.forEach(function (message) {
      var match = /([A-Za-z][A-Za-z0-9_]*)\.\d+\.property\s+([A-Za-z0-9_]+)\s+should not exist/i.exec(message);
      if (match) list.push({ parent: match[1], key: match[2] });
    });
    return list;
  }

  function missingProperties(messages) {
    var names = [];
    messages.forEach(function (message) {
      var match = /^([A-Za-z][A-Za-z0-9_]*)\s+(should not be empty|must be|must not be|is required|should not be null)/i.exec(String(message).trim());
      if (match) names.push(match[1]);
    });
    return names;
  }

  // 발주오라는 칸 검사 오류를 한글로 돌려줍니다(예: "상품명은 문자열이어야 합니다."). 문구 속 칸 이름으로 어느 칸인지 찾습니다.
  var KOREAN_FIELD_LABELS = [["상품명", "name"], ["상품코드", "code"], ["카테고리", "categoryIds"], ["이미지", "imageUrls"], ["과세", "isTaxable"], ["매입원가", "purchaseCost"], ["소비자가", "consumerPrice"], ["공급가", "supplyPrice"]];

  function koreanFieldsOf(messages) {
    var names = [];
    messages.forEach(function (message) {
      var text = String(message);
      if (!/(이어야|필수|입력|선택해|비어|없습니다|해야|올바르지)/.test(text)) return;
      KOREAN_FIELD_LABELS.some(function (pair) {
        if (text.indexOf(pair[0]) < 0) return false;
        if (names.indexOf(pair[1]) < 0) names.push(pair[1]);
        return true;
      });
    });
    return names;
  }

  function describeError(error) {
    if (!error) return "알 수 없는 오류";
    if (error.name === "SyncError") return error.message;
    var messages = messagesOf(error);
    var status = error.status ? "발주오라 응답 " + error.status + (error.path ? " (" + error.path + ")" : "") + ": " : "";
    return (status + messages.join(" / ")).slice(0, 600) || "알 수 없는 오류";
  }

  // 상세 정보를 다시 보낼 때: 읽기 전용 칸을 빼고, {id,...} 객체는 "<이름>Id"로 바꿉니다.
  function writable(value) {
    if (Array.isArray(value)) return value.map(writable);
    if (!isObject(value)) return value;
    var result = {};
    Object.keys(value).forEach(function (key) {
      if (READ_ONLY_KEYS.indexOf(key) >= 0) return;
      var item = value[key];
      if (isObject(item) && typeof item.id === "string") {
        if (!((key + "Id") in value)) result[key + "Id"] = item.id;
        return;
      }
      result[key] = writable(item);
    });
    return result;
  }

  function firstId(values) {
    for (var index = 0; index < values.length; index += 1) {
      var value = values[index];
      if (typeof value === "string" && value) return value;
      if (isObject(value) && typeof value.id === "string" && value.id) return value.id;
    }
    return null;
  }

  // 개별공급가(매출처/그룹별 공급가) 저장 모양 — 2026-11-23 발주오라 상품 수정 화면 코드 확인:
  // 화면은 PUT products/:id 에 바뀐 칸만 보내고, 개별공급가는 sellerProductPrices 목록 전체
  // [{ targetType: "group" | "seller", targetId, shippingPolicyId?, supplyPrice }]로 보냅니다.
  // (PUT products/:id/pricing 에 prices 목록을 보내면 발주오라가 오류 없이 무시합니다 — 운영 약과 18:31, 공급가만 바뀜.)
  // 목록에서 빠진 줄은 지워질 수 있으므로 지금 줄을 모두 그대로 옮기고 황금농부 줄만 바꿉니다(없으면 추가).
  // 대상(id)·공급가를 모르는 줄이 하나라도 있으면 다른 매출처 값이 바뀔 수 있어 보내지 않습니다(null).
  function buildSellerProductPrices(detail, group, keyword, price) {
    if (!isObject(detail) || !Array.isArray(detail.prices)) return null;
    var list = [];
    var found = false;
    for (var index = 0; index < detail.prices.length; index += 1) {
      var entry = detail.prices[index];
      var info = groupEntryInfo(entry);
      if (!info || !info.kind) return null;
      var targetId = firstId([entry.targetId, entry.sellerGroupId, entry.sellerId, entry.sellerGroup, entry.seller, entry.target]);
      var supply = toNumber(entry.supplyPrice);
      if (!targetId || supply === null || supply < 0) return null;
      var row = { targetType: info.kind === "seller" ? "seller" : "group", targetId: targetId, supplyPrice: supply };
      var shipping = firstId([entry.shippingPolicyId, entry.shippingPolicy]);
      if (shipping) row.shippingPolicyId = shipping;
      if (matchesGroup(info, group, keyword)) {
        row.supplyPrice = price;
        found = true;
      }
      list.push(row);
    }
    if (!found) {
      if (!group || !group.id) return null;
      list.push({ targetType: "group", targetId: group.id, supplyPrice: price });
    }
    return list;
  }

  // ─── 발주오라 화면 코드에서 저장 방식 찾기 ─────────────────────────────────────
  // 매출처별 개별공급가(수강생 단가 = '황금농부' 그룹 공급가)는 상품 정보(GET products/:id)에 들어 있지 않습니다(2026-11-23 운영 확인).
  // 발주오라 상품 수정 화면이 그 값을 어떻게 읽고 저장하는지 알 수 있게, 그 화면의 공개 코드(js)에서 관련 부분만 잘라 기술 정보로 보냅니다.
  // 화면 코드만 보내고 상품 값·로그인 정보는 보내지 않습니다.
  var DISCOVERY_ANCHORS = ["개별공급가", "매출처별", "매출처/그룹", "노출/숨김", "매입원가", "sellerGroup", "SellerGroup", "productSuppliers", "purchasePrice", "pricing", "getProductsById", "productDisplays", "supplyPrice"];

  function chunkPathsOf(text) {
    var found = String(text || "").match(/static\/chunks\/[^"'\s\\,\]]+?\.js/g) || [];
    return found.filter(function (path, index) { return found.indexOf(path) === index; });
  }

  // 코드에서 표시 단어 앞뒤 radius 글자를 잘라 냅니다(겹치는 부분은 하나로 합침). 단어 순서가 앞일수록 먼저 담습니다.
  function codeSnippets(code, anchors, radius, perAnchor) {
    var text = String(code || "");
    var windows = [];
    anchors.forEach(function (anchor, rank) {
      var from = 0;
      for (var count = 0; count < perAnchor; count += 1) {
        var at = text.indexOf(anchor, from);
        if (at < 0) break;
        windows.push({ start: Math.max(0, at - radius), end: Math.min(text.length, at + anchor.length + radius), anchor: anchor, rank: rank });
        from = at + anchor.length + radius;
      }
    });
    windows.sort(function (a, b) { return a.start - b.start; });
    var merged = [];
    windows.forEach(function (slot) {
      var last = merged[merged.length - 1];
      if (last && slot.start <= last.end) {
        last.end = Math.max(last.end, slot.end);
        if (slot.rank < last.rank) { last.rank = slot.rank; last.anchor = slot.anchor; }
      } else {
        merged.push({ start: slot.start, end: slot.end, anchor: slot.anchor, rank: slot.rank });
      }
    });
    merged.sort(function (a, b) { return a.rank - b.rank || a.start - b.start; });
    return merged.map(function (slot) { return { anchor: slot.anchor, at: slot.start, text: text.slice(slot.start, slot.end) }; });
  }

  // 매입원가(2026-11-24 운영 확인): 가격 저장(PUT products/:id/pricing)에 purchaseCost를 넣으면 발주오라가 오류 없이 버려 매입원가가 그대로였습니다.
  // 발주오라 매입원가는 매입처 줄(productSuppliers)에 있어, 발주오라 상품 수정 화면처럼 매입처 목록 전체
  // productSuppliers [{ supplierId, shippingPolicyId, purchaseCost, materialCost, isDefault }]를 PUT products/:id 로 보냅니다.
  // 기본 매입처 줄의 매입원가만 바꾸고 다른 매입처 줄(매입처·매입배송정책·매입원가·부자재가)은 그대로 둡니다.
  // 매입처·매입원가·매입배송정책을 알 수 없는 줄이 있거나 기본 매입처를 못 찾으면 null(다른 매입처 값 보호를 위해 보내지 않음).
  function buildProductSuppliers(detail, cost) {
    if (!isObject(detail) || !Array.isArray(detail.productSuppliers)) return null;
    var rows = detail.productSuppliers.filter(isObject);
    if (rows.length === 0) return null;
    var defaults = rows.filter(function (row) { return row.isDefault === true || row.isMain === true || row.default === true; });
    var main = defaults.length === 1 ? defaults[0] : rows.length === 1 ? rows[0] : null;
    if (!main) return null;
    var list = [];
    for (var index = 0; index < rows.length; index += 1) {
      var row = rows[index];
      var supplierId = typeof row.supplierId === "string" && row.supplierId ? row.supplierId : isObject(row.supplier) && typeof row.supplier.id === "string" && row.supplier.id ? row.supplier.id : null;
      if (!supplierId) return null;
      var current = toNumber(row.purchaseCost !== undefined ? row.purchaseCost : row.purchasePrice);
      if (row !== main && (current === null || current < 0)) return null;
      var material = toNumber(row.materialCost);
      var entry = { supplierId: supplierId, purchaseCost: row === main ? cost : current, materialCost: material !== null && material >= 0 ? material : 0, isDefault: row === main };
      // 매입배송정책: 줄에 정책 칸이 아예 없으면(include 없이 읽음 등) 정책을 모르는 것이라, 빼고 보내면 발주오라 매입배송정책이
      // 지워질 수 있어 보내지 않습니다. 정책 칸이 null이면 정책 없는 줄(발주오라 화면도 shippingPolicyId 없이 보냄).
      if (!("shippingPolicy" in row) && !("shippingPolicyId" in row)) return null;
      var policyId = typeof row.shippingPolicyId === "string" && row.shippingPolicyId ? row.shippingPolicyId : isObject(row.shippingPolicy) && typeof row.shippingPolicy.id === "string" && row.shippingPolicy.id ? row.shippingPolicy.id : null;
      if (policyId) entry.shippingPolicyId = policyId;
      list.push(entry);
    }
    return list;
  }

  // 매입처 이름 비교(1.8.0): 띄어쓰기·기호·(주)·㈜·주식회사·(유)·유한회사는 빼고 비교합니다("봄날 농원(주)" = "봄날농원").
  function supplierNameKey(value) {
    return String(value || "").toLowerCase().replace(/\(주\)|㈜|주식회사|\(유\)|유한회사/g, "").replace(/[^0-9a-z가-힣]/g, "");
  }

  // 상품명 비교(1.9.2): 발주오라는 상품명이 같은 상품의 신규 등록을 거절합니다("이미 존재하는 상품 명 입니다: …").
  // 발주오라가 받아 줄 이름을 막지 않게 앞뒤 공백만 빼고 그대로 비교합니다.
  function productNameKey(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  // 같은 이름 상품이 있어 신규 등록을 하지 않을 때 알릴 말(existing = { id, code } 또는 null)
  function duplicateNameMessage(item, existing) {
    var name = item && item.values && item.values.name ? item.values.name : item && item.name ? item.name : "";
    var where = existing && existing.code ? "(발주오라 상품코드 " + existing.code + ")" : "";
    return "발주오라에 이름이 같은 상품 '" + name + "'" + where + "이 이미 있어 새로 등록하지 않았습니다(발주오라는 상품명이 같은 상품을 새로 받지 않아요). " +
      "같은 상품이면 발주오라에서 그 상품의 상품코드를 DB센터 상품코드(" + (item && item.code ? item.code : "없음") + ")로 바꾼 뒤 '발주오라 상품 불러오기(비교)'를 다시 하면 연결돼요. " +
      "다른 상품이면 DB센터 상품명을 조금 다르게 바꿔 주세요.";
  }

  // 발주오라 상품의 기본 매입처 이름: 매입처 목록(productSuppliers)의 기본 줄(없으면 하나뿐인 줄) → 상품의 매입처 칸. 못 읽으면 null.
  function defaultSupplierName(record) {
    if (!isObject(record)) return null;
    if (Array.isArray(record.productSuppliers)) {
      var rows = record.productSuppliers.filter(isObject);
      var main = rows.find(function (row) { return row.isDefault === true || row.isMain === true || row.default === true; }) || (rows.length === 1 ? rows[0] : null);
      var name = main ? pickString(main, ["supplierName", "supplierCompanyName"]) || pickString(main.supplier, ["companyName", "name"]) : null;
      if (name) return name;
    }
    return pickString(record, ["supplierName"]) || pickString(record.supplier, ["companyName", "name"]);
  }

  function categoryKeyOf(detail) {
    if (Array.isArray(detail.categoryIds)) return "categoryIds";
    return "categoryId";
  }

  function buildCreateBody(template, item) {
    var body = writable(template);
    ["code", "productCode", "name", "imageUrls", "images", "thumbnailUrl", "isSoldOut", "categories", "productCategories", "category"].forEach(function (key) { delete body[key]; });
    groupArrayKeys(body).forEach(function (key) { delete body[key]; });
    var codeKey = firstString(template, CODE_KEYS);
    if (item.code) body[codeKey ? codeKey.key : "code"] = item.code;
    body.name = item.values.name;
    body.supplyPrice = item.values.supplyPrice;
    if ("consumerPrice" in template || item.values.consumerPrice !== null) body.consumerPrice = item.values.consumerPrice;
    // 신규 등록은 설정 복사용 상품의 매입처 줄을 그대로 복사하므로, 그 기본 매입처 줄의 매입원가를 DB센터 원가로 바꿉니다.
    if (item.values.purchaseCost !== null) {
      var suppliers = buildProductSuppliers(template, item.values.purchaseCost);
      if (suppliers) {
        body.productSuppliers = suppliers;
        delete body.purchaseCost;
      } else {
        body.purchaseCost = item.values.purchaseCost;
      }
    }
    if ("isTaxable" in template) body.isTaxable = Boolean(item.values.isTaxable);
    if ("isVisible" in template) body.isVisible = true;
    if (item.values.categoryId) body[categoryKeyOf(template)] = categoryKeyOf(template) === "categoryIds" ? [item.values.categoryId] : item.values.categoryId;
    // 상품 정보 칸(1.9.0): 상품마다 다른 칸은 복사한 상품 값을 지우고 DB센터 값(있으면)을 넣습니다. 판매 상태(품절·도매몰 노출)도 DB센터 값으로.
    var extra = isObject(item.values.extra) ? item.values.extra : null;
    if (extra) {
      PRODUCT_SPECIFIC_KEYS.forEach(function (key) { delete body[key]; });
      (item.fields || []).forEach(function (field) {
        if (EXTRA_FIELDS.indexOf(field) < 0) return;
        var part = extraBodyFor(field, extra, template);
        if (part) Object.keys(part).forEach(function (key) { body[key] = part[key]; });
      });
      if (typeof extra.taxonomyItemId === "string" && extra.taxonomyItemId) body.taxonomyItemId = extra.taxonomyItemId;
    }
    return body;
  }

  // 발주오라 상품 이미지 조건(JPG·PNG, 1MB 이하)에 맞는지. 형식 이름은 소문자·"image/jpg" → "image/jpeg"로 맞춥니다.
  function productImageType(type) {
    var value = String(type || "").split(";")[0].trim().toLowerCase();
    return value === "image/jpg" ? "image/jpeg" : value;
  }

  function fitsProductImage(blob) {
    return Boolean(blob) && blob.size >= 1 && blob.size <= PRODUCT_IMAGE.maxBytes && PRODUCT_IMAGE.types.indexOf(productImageType(blob.type)) >= 0;
  }

  // 발주오라가 다른 칸을 꼭 달라고 할 때(예: "상품명은 문자열이어야 합니다.") 채울 지금 값(값은 바뀌지 않음).
  function currentProductValues(detail, keys) {
    var values = {};
    (keys || ["name", "code", "supplyPrice", "categoryIds", "imageUrls"]).forEach(function (key) { if (detail[key] !== undefined && detail[key] !== null) values[key] = detail[key]; });
    return values;
  }

  // 이 창(브라우저)에서 이미지를 JPG로 바꿔 maxBytes 이하로 줄입니다(긴 변 최대 2000px부터 시작해 화질·크기를 차례로 낮춤).
  // 투명한 부분은 흰 배경으로 채웁니다. DB센터에서 받은 파일(blob)이라 다른 사이트 이미지 제한(캔버스 오염)이 없습니다.
  function makeImageConverter(win) {
    return async function (blob, maxBytes) {
      var bitmap = null;
      var objectUrl = null;
      try {
        var source = null;
        var width = 0;
        var height = 0;
        if (typeof win.createImageBitmap === "function") {
          try { bitmap = await win.createImageBitmap(blob); } catch { bitmap = null; }
        }
        if (bitmap) {
          source = bitmap;
          width = bitmap.width;
          height = bitmap.height;
        } else {
          objectUrl = win.URL.createObjectURL(blob);
          source = await new Promise(function (resolve, reject) {
            var image = new win.Image();
            image.onload = function () { resolve(image); };
            image.onerror = function () { reject(SyncError("DB센터 이미지를 열지 못했습니다. JPG·PNG 이미지로 다시 올려 주세요.")); };
            image.src = objectUrl;
          });
          width = source.naturalWidth || source.width;
          height = source.naturalHeight || source.height;
        }
        if (!width || !height) throw SyncError("DB센터 이미지 크기를 읽지 못했습니다. 이미지를 다시 올려 주세요.");
        var toJpeg = function (canvas, quality) {
          return new Promise(function (resolve) { canvas.toBlob(function (result) { resolve(result); }, "image/jpeg", quality); });
        };
        var scale = Math.min(1, PRODUCT_IMAGE.maxSide / Math.max(width, height));
        for (var round = 0; round < 6; round += 1) {
          var canvas = win.document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));
          var context = canvas.getContext("2d");
          if (!context) throw SyncError("이 브라우저에서 이미지를 줄이지 못했습니다. JPG 1MB 이하 이미지로 다시 올려 주세요.");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(source, 0, 0, canvas.width, canvas.height);
          var qualities = [0.9, 0.8, 0.7];
          for (var step = 0; step < qualities.length; step += 1) {
            var output = await toJpeg(canvas, qualities[step]);
            if (output && output.size >= 1 && output.size <= maxBytes) return output;
          }
          scale *= 0.7;
        }
        throw SyncError("이미지를 1MB 이하로 줄이지 못했습니다. 더 작은 이미지로 다시 올려 주세요.");
      } finally {
        if (bitmap && typeof bitmap.close === "function") bitmap.close();
        if (objectUrl) win.URL.revokeObjectURL(objectUrl);
      }
    };
  }

  // 상품 카테고리 ids 가운데 하나라도 받을 카테고리(accept)이거나 그 아래 카테고리면 맞습니다(서버 categoryMatches와 같은 규칙,
  // 예: 연결 카테고리 "🥕 농산"이면 발주오라 "🥕 농산 > 배추류" 상품도 맞음). flat = flattenCategories 결과(parentId).
  function categoryCovers(categoryIds, accept, flat) {
    if (!Array.isArray(categoryIds) || !Array.isArray(accept) || accept.length === 0) return false;
    var parentOf = {};
    (flat || []).forEach(function (category) { parentOf[category.id] = category.parentId; });
    return categoryIds.some(function (id) {
      var current = id;
      for (var depth = 0; current && depth < 10; depth += 1) {
        if (accept.indexOf(current) >= 0) return true;
        current = parentOf[current];
      }
      return false;
    });
  }

  // 오류 문구용 카테고리 이름(경로). 트리에 없으면 id 앞 8자, 비었으면 "없음".
  function categoryLabel(ids, flat) {
    var list = (Array.isArray(ids) ? ids : [ids]).filter(function (id) { return typeof id === "string" && id; });
    if (list.length === 0) return "없음";
    return list.map(function (id) {
      var found = (flat || []).find(function (category) { return category.id === id; });
      return found ? found.path : id.slice(0, 8);
    }).join(", ");
  }

  function expectedValue(field, values) {
    if (field === "shippingPolicy") return values.baljuoraShippingPolicyId === undefined ? undefined : values.baljuoraShippingPolicyId;
    if (field === "supplyPrice") return values.supplyPrice;
    if (field === "consumerPrice") return values.consumerPrice;
    if (field === "purchaseCost") return values.purchaseCost;
    if (field === "groupPrice") return values.groupPrice;
    if (field === "name") return values.name;
    return undefined;
  }

  // 보낸 칸이 발주오라에 실제로 저장됐는지 다시 읽어 확인합니다.
  // checks.image = { before: 보내기 전 첫 이미지, sent: 올려서 넣은 이미지 } — 저장 뒤 첫 이미지가 그대로면 반영 안 됨으로 봅니다.
  function verifyApplied(result, item, snapshot, checks) {
    var still = [];
    var imageCheck = checks && checks.image;
    (result.applied || []).forEach(function (field) {
      var expected = expectedValue(field, item.values);
      var actual = field === "name" ? snapshot.name : field === "shippingPolicy" ? snapshot.shippingPolicyId : snapshot[field];
      if (field === "image") {
        var first = Array.isArray(snapshot.imageUrls) ? snapshot.imageUrls[0] || null : undefined;
        if (imageCheck && first !== undefined && first !== imageCheck.sent && (first === null || first === imageCheck.before)) {
          result.skipped.push({ field: field, reason: "발주오라 대표 이미지가 바뀌지 않았습니다(저장 뒤 다시 읽은 값 기준)." });
          return;
        }
      } else if (field === "category") {
        // checks.category = { accept: 받을 카테고리(보낸 카테고리 + DB센터 카테고리와 연결된 발주오라 카테고리), flat: 발주오라 카테고리 트리 }
        var categoryCheck = checks && checks.category;
        var accept = categoryCheck ? categoryCheck.accept : item.values.categoryId ? [item.values.categoryId] : [];
        var flat = categoryCheck ? categoryCheck.flat : [];
        if (snapshot.categoryIds !== undefined && accept.length > 0 && !categoryCovers(snapshot.categoryIds, accept, flat)) {
          result.skipped.push({ field: field, reason: "발주오라에 저장된 카테고리가 다릅니다(보낸 카테고리: " + categoryLabel(accept[0], flat) + " · 저장 뒤 다시 읽은 카테고리: " + categoryLabel(snapshot.categoryIds, flat) + "). 발주오라 상품 수정 화면에서 카테고리를 확인해 주세요." });
          return;
        }
      } else if (field === "groupPrice" && (actual === undefined || (actual === null && (expected === snapshot.supplyPrice || expected === item.values.supplyPrice)))) {
        // 그룹 가격을 다시 읽을 수 없거나, 황금농부 줄이 없고 수강생 단가 = 공급가(그룹도 공급가로 삼)면 맞는 것으로 봅니다.
      } else if (expected !== undefined && actual !== undefined && String(expected === null ? "" : expected) !== String(actual === null ? "" : actual)) {
        result.skipped.push({ field: field, reason: "보낸 값(" + expected + ")과 발주오라에 저장된 값(" + actual + ")이 다릅니다." });
        return;
      }
      still.push(field);
    });
    result.applied = still;
  }

  // ─── 실행 ─────────────────────────────────────────────────────────────────

  function createRunner(env) {
    // gapMs·nextAt: 요청 간격 조절(floorMs: 429를 받은 뒤 한동안 지킬 간격, cooldownUntil: 429 뒤 모든 요청이 함께 쉬는 시각),
    // writes: 지금까지 보낸 저장 요청 수, writesById: 발주오라 상품별 저장 요청 수(상품을 함께 보내도 그 상품에 저장했는지 알 수 있게),
    // throttled: 429로 쉰 횟수, stats: 요청 수·응답 시간·쉰 시간(진단 정보, 값·토큰 없음)
    var state = {
      token: null, structure: {}, endpoints: {}, errors: [],
      gapMs: REQUEST_GAP_MIN_MS, floorMs: REQUEST_GAP_MIN_MS, nextAt: 0, cooldownUntil: 0, lastThrottleAt: -Infinity,
      writes: 0, writesById: {}, throttled: 0, onThrottle: null, refreshing: null,
      stats: { requests: 0, totalMs: 0, maxMs: 0, pausedMs: 0, resultPosts: 0, resultRetries: 0, rateHeaders: {} }
    };
    var testHooks = scope.__DOOGO_SYNC_TEST__ || null;
    var sleep = env.sleep || (testHooks && testHooks.sleep) || function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); };
    var clock = env.now || (testHooks && testHooks.now) || function () { return Date.now(); };

    // 429로 쉬는 동안 패널·DB센터 진행 칸에 알립니다(current = { done, total, label }, 기록 줄은 1분에 한 번만).
    function watchThrottle(report, current) {
      var lastLogAt = -Infinity;
      state.onThrottle = function (waitMs, attempt) {
        report.progress(current.done, current.total, "발주오라가 '요청이 너무 많다'고 해 " + Math.round(waitMs / 1000) + "초 쉬었다가 이어서 보내요(" + attempt + "번째)" + (current.label ? " · " + current.label : "") + "…");
        var now = clock();
        if (now - lastLogAt > 60000) {
          lastLogAt = now;
          report.log("⏸ 발주오라 요청 제한(429): 잠시 쉬었다가 이어서 보냅니다. 창을 닫지 말고 기다려 주세요.", false);
        }
      };
    }

    // 요청 사이 간격(state.gapMs)을 지킵니다. 동시에 여러 요청(상세 5개씩·상품 3개씩)을 보내도 차례로 간격을 두고,
    // 기다리는 동안 다른 요청이 429를 받아 모두 쉬기로 했으면(cooldownUntil) 그 뒤로 다시 줄을 섭니다.
    async function pace() {
      var now = clock();
      var at = Math.max(now, state.nextAt, state.cooldownUntil);
      state.nextAt = at + state.gapMs;
      if (at > now) await sleep(at - now);
      if (state.cooldownUntil > at && state.cooldownUntil > clock()) return pace();
    }

    function note(path, status) {
      state.endpoints[path] = status;
    }

    // 발주오라 응답에 요청 제한 머리글(X-RateLimit-* 등)이 보이면 이름만 기록합니다(다음 속도 조절에 쓰려고, 값 없음).
    function noteRateHeaders(response) {
      try {
        if (!response.headers || typeof response.headers.forEach !== "function") return;
        response.headers.forEach(function (_value, name) {
          var key = String(name).toLowerCase();
          if (key.indexOf("ratelimit") >= 0 || key === "retry-after") state.stats.rateHeaders[key] = true;
        });
      } catch { /* 진단만 */ }
    }

    async function refreshToken() {
      var work = async function () {
        var response = await env.fetch(new URL("/api/auth/refresh", env.consoleOrigin).toString(), { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include" });
        note("console:/api/auth/refresh", response.status);
        if (!response.ok) throw SyncError("발주오라 관리자에 로그인되어 있지 않습니다. 이 창에서 로그인한 뒤 책갈피를 다시 눌러 주세요.");
        var json = await response.json().catch(function () { return null; });
        var token = json && (json.accessToken || (json.data && json.data.accessToken));
        if (!token) throw SyncError("발주오라 로그인 정보를 읽지 못했습니다. 새로고침 후 다시 눌러 주세요.");
        return token;
      };
      // 발주오라 화면과 같은 잠금 이름을 써서 화면의 토큰 갱신과 겹치지 않게 합니다.
      if (env.locks && env.locks.request) return env.locks.request("baljuora-token-refresh", work);
      return work();
    }

    // 여러 요청이 함께 로그인 만료(401)를 받아도 로그인 정보는 한 번만 새로 받습니다.
    function renewToken() {
      if (!state.refreshing) {
        state.refreshing = refreshToken().then(function (token) {
          state.token = token;
          state.refreshing = null;
          return token;
        }, function (error) {
          state.refreshing = null;
          throw error;
        });
      }
      return state.refreshing;
    }

    function writeKeyOf(path) {
      var match = /^\/?products\/([^/?#]+)/.exec(path);
      if (!match) return null;
      try { return decodeURIComponent(match[1]); } catch { return match[1]; }
    }

    async function api(method, path, body, options) {
      var opts = options || {};
      if (!state.token) await renewToken();
      var url = new URL(path.replace(/^\//, ""), env.apiBase);
      if (opts.params) Object.keys(opts.params).forEach(function (key) { if (opts.params[key] !== undefined && opts.params[key] !== null) url.searchParams.set(key, String(opts.params[key])); });
      var payload;
      if (body !== undefined) payload = JSON.stringify(body);
      await pace();
      var usedToken = state.token;
      var headers = { Authorization: "Bearer " + usedToken };
      if (payload !== undefined) headers["Content-Type"] = "application/json";
      if (method !== "GET") {
        state.writes += 1;
        var writeKey = writeKeyOf(path);
        if (writeKey) state.writesById[writeKey] = (state.writesById[writeKey] || 0) + 1;
      }
      var sentAt = clock();
      var response = await env.fetch(url.toString(), { method: method, headers: headers, body: payload });
      var tookMs = Math.max(0, clock() - sentAt);
      state.stats.requests += 1;
      state.stats.totalMs += tookMs;
      if (tookMs > state.stats.maxMs) state.stats.maxMs = tookMs;
      noteRateHeaders(response);
      note(method + " " + path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id"), response.status);
      if (response.status === 401 && !opts.retried) {
        // 다른 요청이 그사이 새 로그인 정보를 받았으면 그것으로 다시 보냅니다.
        if (state.token === usedToken) await renewToken();
        return api(method, path, body, Object.assign({}, opts, { retried: true }));
      }
      // 429 요청이 너무 많음: 모든 요청이 함께 쉬었다가(점점 길게, 최대 8번·약 2분 50초) 같은 요청을 다시 보냅니다.
      // 처음 막혔을 때의 간격보다 조금 넓은 간격(floorMs)을 한동안 지켜 다시 막히지 않게 하고, 성공할 때마다 조금씩 좁힙니다.
      if (response.status === 429) {
        var attempt = opts.throttleAttempt || 0;
        if (attempt < THROTTLE_WAITS_MS.length) {
          state.throttled += 1;
          var now = clock();
          // 1분 넘게 막히지 않다가 새로 막혔으면 그때 간격보다 30% 넓은 간격을 바닥으로 삼습니다(같은 때 거듭 막혀도 바닥은 한 번만 정함).
          if (now - state.lastThrottleAt > 60000) state.floorMs = Math.min(REQUEST_GAP_MAX_MS, Math.max(REQUEST_GAP_MIN_MS, Math.round(state.gapMs * 1.3)));
          state.lastThrottleAt = now;
          // 이미 함께 쉬는 중에 다른 요청도 막힌 것이면(상품 3개를 함께 보냄) 간격을 거듭 늘리지 않습니다.
          if (now >= state.cooldownUntil) state.gapMs = Math.min(REQUEST_GAP_MAX_MS, Math.max(state.gapMs * 2, 400));
          var waitMs = THROTTLE_WAITS_MS[attempt];
          // 발주오라가 기다릴 시간(Retry-After, 초)을 알려 주고 읽을 수 있으면 그만큼(최대 1분) 기다립니다.
          var retryAfter = Number(response.headers.get("retry-after"));
          if (isFinite(retryAfter) && retryAfter > 0) waitMs = Math.min(60000, Math.max(waitMs, retryAfter * 1000));
          var until = now + waitMs;
          if (until > state.cooldownUntil) {
            state.stats.pausedMs += until - Math.max(now, state.cooldownUntil);
            state.cooldownUntil = until;
          }
          if (typeof state.onThrottle === "function") {
            try { state.onThrottle(waitMs, attempt + 1); } catch { /* 표시는 실패해도 계속 */ }
          }
          await sleep(waitMs);
          return api(method, path, body, Object.assign({}, opts, { throttleAttempt: attempt + 1 }));
        }
      } else if (response.ok) {
        if (state.gapMs > state.floorMs) state.gapMs = Math.max(state.floorMs, Math.round(state.gapMs * 0.9));
        if (state.floorMs > REQUEST_GAP_MIN_MS) {
          state.floorMs -= 1;
          if (state.gapMs > REQUEST_GAP_MIN_MS && state.gapMs > state.floorMs) state.gapMs = Math.max(state.floorMs, state.gapMs - 1);
        }
      }
      var type = response.headers.get("content-type") || "";
      var data = type.indexOf("json") >= 0 ? await response.json().catch(function () { return null; }) : await response.text().catch(function () { return ""; });
      if (!response.ok) {
        var error = new Error(isObject(data) && data.message ? String(data.message) : "HTTP " + response.status);
        error.status = response.status;
        error.data = data;
        error.path = method + " " + path;
        throw error;
      }
      return data;
    }

    // 발주오라가 받지 않는 칸("property X should not exist")은 빼고, 꼭 필요한 칸이 비었다고 하면 원래 값으로 채워 다시 보냅니다.
    async function sendAdaptive(method, path, body, source, tracker) {
      var removed = [];
      for (var attempt = 0; attempt < 5; attempt += 1) {
        try {
          var response = await api(method, path, body);
          if (tracker) tracker.removed = removed;
          return response;
        } catch (error) {
          if (error.status !== 400) throw error;
          var messages = messagesOf(error);
          // 목록 안쪽 칸만 거절했으면 그 칸만 각 줄에서 빼고 다시 보냅니다(목록 자체는 그대로).
          var nested = nestedForbidden(messages).filter(function (entry) {
            return Array.isArray(body[entry.parent]) && body[entry.parent].some(function (row) { return isObject(row) && entry.key in row; });
          });
          if (nested.length > 0) {
            nested.forEach(function (entry) {
              body[entry.parent].forEach(function (row) { if (isObject(row)) delete row[entry.key]; });
              removed.push(entry.parent + "[]." + entry.key);
            });
            continue;
          }
          var forbidden = forbiddenProperties(messages).filter(function (name) { return name in body; });
          if (forbidden.length > 0) {
            forbidden.forEach(function (name) { delete body[name]; removed.push(name); });
            if (Object.keys(body).length === 0) throw error;
            continue;
          }
          var missing = source ? missingProperties(messages).concat(koreanFieldsOf(messages)).filter(function (name, index, list) { return list.indexOf(name) === index && !(name in body) && name in source; }) : [];
          if (missing.length > 0) {
            missing.forEach(function (name) { body[name] = writable(source[name]); });
            continue;
          }
          state.errors.push({ path: method + " " + path, status: error.status, messages: messages.slice(0, 8), sentKeys: Object.keys(body) });
          throw error;
        }
      }
      throw SyncError("발주오라가 같은 오류를 계속 돌려줘 멈췄습니다(" + path + ").");
    }

    async function findGroup(keyword) {
      try {
        var payload = unwrap(await api("GET", "merchant/seller-groups", undefined, { params: { page: 1, limit: 100 } }));
        var list = pickArray(payload);
        if (list[0]) state.structure.sellerGroup = structureOf(list[0]);
        var match = list.find(function (group) { return isObject(group) && typeof group.name === "string" && group.name.indexOf(keyword) >= 0; });
        return match ? { id: match.id, name: match.name } : null;
      } catch (error) {
        state.errors.push({ path: "GET merchant/seller-groups", status: error.status || 0, messages: messagesOf(error).slice(0, 3) });
        return null;
      }
    }

    // 배송비 정책 목록(최대 10쪽). 목록에 구간이 없으면 정책 상세를 읽고, 그래도 없으면 상품 상세에서 모은 정책으로 채웁니다.
    async function loadShippingPolicies(fromDetails) {
      var list = [];
      try {
        for (var page = 1; page <= 10; page += 1) {
          var payload = unwrap(await api("GET", "merchant/shipping-policies", undefined, { params: { page: page, limit: 100 } }));
          var items = pickArray(payload);
          if (items[0] && !state.structure.shippingPolicy) state.structure.shippingPolicy = structureOf(items[0]);
          items.forEach(function (item) { var policy = normalizeShippingPolicy(item); if (policy && !list.some(function (known) { return known.id === policy.id; })) list.push(policy); });
          var meta = isObject(payload) && isObject(payload.meta) ? payload.meta : null;
          if (items.length === 0 || !meta || !(meta.hasNext || (meta.totalPages && page < meta.totalPages))) break;
        }
      } catch (error) {
        state.errors.push({ path: "GET merchant/shipping-policies", status: error.status || 0, messages: messagesOf(error).slice(0, 3) });
      }
      var known = fromDetails || {};
      Object.keys(known).forEach(function (id) { if (!list.some(function (policy) { return policy.id === id; })) list.push(known[id]); });
      var missing = list.filter(function (policy) { return policy.rules === null; }).slice(0, 60);
      for (var index = 0; index < missing.length; index += 1) {
        var policy = missing[index];
        if (known[policy.id] && known[policy.id].rules) { policy.rules = known[policy.id].rules; continue; }
        try {
          var detail = normalizeShippingPolicy(unwrap(await api("GET", "merchant/shipping-policies/" + encodeURIComponent(policy.id))));
          if (detail && detail.rules) policy.rules = detail.rules;
        } catch (error) {
          state.errors.push({ path: "GET merchant/shipping-policies/:id", status: error.status || 0, messages: messagesOf(error).slice(0, 3) });
        }
      }
      list.forEach(function (policy) { if (policy.rules === null) policy.rules = []; });
      return list;
    }

    async function loadCategories() {
      try {
        var payload = unwrap(await api("GET", "merchant/categories/tree"));
        if (!state.structure.categoryTree) state.structure.categoryTree = structureOf(payload);
        return flattenCategories(payload);
      } catch (error) {
        state.errors.push({ path: "GET merchant/categories/tree", status: error.status || 0, messages: messagesOf(error).slice(0, 3) });
        return [];
      }
    }

    async function listAllProducts(onPage) {
      var items = [];
      var limit = 100;
      for (var page = 1; page <= 400; page += 1) {
        var payload;
        // state.listInclude: LIST_INCLUDES 순서(0 = 카테고리 포함) → 거절되면 다음 → false(include 없이)
        var includeIndex = typeof state.listInclude === "number" ? state.listInclude : 0;
        var include = state.listInclude === false ? null : LIST_INCLUDES[includeIndex] || null;
        try {
          payload = unwrap(await api("GET", "products", undefined, { params: include ? { page: page, limit: limit, include: include } : { page: page, limit: limit } }));
          state.listIncludeUsed = include;
        } catch (error) {
          if (page === 1 && error.status === 400 && include) {
            state.listInclude = includeIndex + 1 < LIST_INCLUDES.length ? includeIndex + 1 : false;
            state.errors.push({ path: "GET products?include=" + include, status: 400, messages: messagesOf(error).slice(0, 3) });
            page -= 1;
            continue;
          }
          if (page === 1 && error.status === 400 && limit > 20) {
            limit = limit === 100 ? 50 : 20;
            page -= 1;
            continue;
          }
          throw error;
        }
        var list = pickArray(payload);
        if (page === 1) state.structure.productList = list[0] ? structureOf(list[0]) : structureOf(payload);
        items = items.concat(list);
        var meta = pageMeta(payload);
        if (onPage) onPage(items.length, meta.total);
        if (list.length === 0) break;
        if (meta.hasNext === false) break;
        if (meta.totalPages && page >= meta.totalPages) break;
        if (meta.hasNext === undefined && !meta.totalPages && list.length < limit) break;
      }
      return items;
    }

    async function mapLimit(items, limit, worker) {
      var results = new Array(items.length);
      var cursor = 0;
      async function next() {
        while (cursor < items.length) {
          var index = cursor;
          cursor += 1;
          results[index] = await worker(items[index], index);
        }
      }
      var workers = [];
      for (var index = 0; index < Math.min(limit, items.length); index += 1) workers.push(next());
      await Promise.all(workers);
      return results;
    }

    async function getDetail(id) {
      var path = "products/" + encodeURIComponent(id);
      var detail;
      if (state.includeOk !== false) {
        try {
          detail = unwrap(await api("GET", path, undefined, { params: { include: DETAIL_INCLUDE } }));
          state.includeOk = true;
        } catch (error) {
          if (error.status !== 400 || state.includeOk === true) throw error;
          state.includeOk = false;
          state.errors.push({ path: "GET products/:id?include", status: 400, messages: messagesOf(error).slice(0, 3) });
        }
      }
      if (detail === undefined) detail = unwrap(await api("GET", path));
      if (isObject(detail) && isObject(detail.product) && typeof detail.product.id === "string" && !detail.id) detail = detail.product;
      if (!state.structure.productDetail && isObject(detail)) state.structure.productDetail = structureOf(detail);
      return detail;
    }

    // 매출처 그룹 공급가를 읽거나 저장하지 못했을 때 한 번만: 발주오라 상품 수정 화면의 코드(js)를 찾아 기술 정보로 남깁니다.
    // 2차(1.2.0): 상품 화면이 불러오는 코드 파일 이름을 모두 남기고, 그중 "개별공급가·매출처별" 화면(저장하는 코드)을 찾아 앞뒤를 넉넉히 잘라 보냅니다.
    // 발주오라 상품 카테고리 화면이 카테고리 트리를 어떻게 저장하는지(POST merchant/categories/tree 본문 모양) 확인하려고(2026-11-23),
    // 이 창의 로그인으로 그 화면의 코드 조각 경로(RSC)와 저장 부분 코드 일부만 읽어 진단 정보로 보냅니다(공개 js 코드만, 상품 값·토큰 없음).
    // 발주오라는 모르는 칸을 오류 없이 버리므로, 형식을 확인하기 전에는 카테고리 트리를 바꾸지 않습니다.
    async function discoverCategoryPage() {
      if (state.categoryDiscovery || !env.consoleOrigin || !env.pagePath) return;
      var out = state.categoryDiscovery = { status: null, chunks: [], pageChunks: [], snippets: [] };
      try {
        var slug = String(env.pagePath).split("/").filter(Boolean)[0] || "";
        if (!slug) return;
        var response = await env.fetch(new URL("/" + slug + "/products/category", env.consoleOrigin).toString(), { headers: { RSC: "1" }, credentials: "include" });
        var text = await response.text();
        out.status = response.status;
        out.chunks = chunkPathsOf(text).slice(0, 80);
        out.pageChunks = out.chunks.filter(function (chunk) { return /products/i.test(chunk) && /categor/i.test(chunk); });
        var budget = 9000;
        for (var index = 0; index < out.pageChunks.length && index < 4 && budget > 0; index += 1) {
          var chunkPath = out.pageChunks[index];
          var file = await env.fetch(new URL("/_next/" + chunkPath, env.consoleOrigin).toString());
          if (!file.ok) continue;
          var code = await file.text();
          var pieces = codeSnippets(code, ["mutateAsync", "저장하기", "parentId", "children:"], 600, 2);
          for (var pieceIndex = 0; pieceIndex < pieces.length && budget > 0; pieceIndex += 1) {
            budget -= pieces[pieceIndex].text.length;
            out.snippets.push({ chunk: chunkPath.split("/").slice(-1)[0], anchor: pieces[pieceIndex].anchor, at: pieces[pieceIndex].at, text: pieces[pieceIndex].text });
          }
        }
      } catch (error) {
        out.error = describeError(error);
      }
    }

    // anchors: 함께 찾을 단어(1.9.1: 카테고리 저장이 어긋나면 "categoryIds" 앞뒤 화면 코드를 먼저 남김)
    async function discoverProductForm(sampleId, anchors) {
      if (state.discovery || !env.consoleOrigin || !env.pagePath) return;
      var out = state.discovery = { pages: [], allChunks: [], formChunks: [], snippets: [] };
      try {
        var slug = String(env.pagePath).split("/").filter(Boolean)[0] || "";
        if (!slug) return;
        var id = sampleId ? encodeURIComponent(sampleId) : null;
        var candidates = (id ? ["/products/" + id] : []).concat(["/products/create"]);
        var loaded = {};
        (env.loadedScripts || []).forEach(function (src) { chunkPathsOf(src).forEach(function (path) { loaded[path] = true; }); });
        for (var index = 0; index < candidates.length && out.allChunks.length === 0; index += 1) {
          var path = "/" + slug + candidates[index];
          var shown = candidates[index].replace(id || "\u0000", ":id");
          try {
            var response = await env.fetch(new URL(path, env.consoleOrigin).toString(), { headers: { RSC: "1" }, credentials: "include" });
            var text = await response.text();
            var chunks = chunkPathsOf(text);
            out.pages.push({ path: shown, status: response.status, size: text.length, chunks: chunks.length });
            if (response.ok && chunks.some(function (chunk) { return /products/i.test(chunk); })) out.allChunks = chunks;
          } catch (error) {
            out.pages.push({ path: shown, error: describeError(error) });
          }
        }
        var budget = 52000;
        var targets = out.allChunks.filter(function (chunk) { return !loaded[chunk]; }).slice(0, 60);
        for (var chunkIndex = 0; chunkIndex < targets.length && budget > 0; chunkIndex += 1) {
          var chunkPath = targets[chunkIndex];
          try {
            var file = await env.fetch(new URL("/_next/" + chunkPath, env.consoleOrigin).toString());
            if (!file.ok) continue;
            var code = await file.text();
            if (code.indexOf("개별공급가") < 0 && code.indexOf("매출처별") < 0) continue;
            out.formChunks.push(chunkPath);
            var pieces = codeSnippets(code, (Array.isArray(anchors) ? anchors : []).concat(["개별공급가", "prices", "visibility", "productSuppliers", "mutate", "onSubmit", "supplyPrice"]), 900, 4);
            for (var pieceIndex = 0; pieceIndex < pieces.length && budget > 0; pieceIndex += 1) {
              var piece = pieces[pieceIndex];
              budget -= piece.text.length;
              out.snippets.push({ chunk: chunkPath.split("/").slice(-1)[0], anchor: piece.anchor, at: piece.at, text: piece.text });
            }
          } catch (error) {
            out.snippets.push({ chunk: chunkPath, error: describeError(error) });
          }
        }
      } catch (error) {
        out.error = describeError(error);
      }
    }

    // 목록 읽기: 발주오라는 목록마다 커서(meta.nextCursor) 또는 쪽(page) 방식을 씁니다. 둘 다 지원하고, 같은 쪽이 되풀이되면 멈춥니다.
    async function listAll(path, params, options) {
      var opts = options || {};
      var limit = opts.limit || 100;
      var query = Object.assign({}, params || {});
      var items = [];
      var cursor = null;
      var page = 1;
      var mode = null;
      var lastFirstId = null;
      for (var round = 0; round < (opts.maxPages || 1000); round += 1) {
        var request = Object.assign({}, query, { limit: limit });
        if (mode === "cursor" && cursor) request.cursor = cursor;
        if (mode === "page") request.page = page;
        var payload;
        try {
          payload = unwrap(await api("GET", path, undefined, { params: request }));
        } catch (error) {
          if (items.length === 0 && error.status === 400) {
            var text = messagesOf(error).join(" ");
            var dropped = (opts.optionalParams || []).filter(function (key) { return key in query && text.indexOf(key) >= 0; });
            if (dropped.length > 0) {
              dropped.forEach(function (key) { delete query[key]; });
              state.errors.push({ path: "GET " + path, status: 400, messages: ["보내지 않음: " + dropped.join(",")] });
              round -= 1;
              continue;
            }
            if (limit > 20) {
              limit = limit === 100 ? 50 : 20;
              round -= 1;
              continue;
            }
          }
          throw error;
        }
        var list = pickArray(payload);
        if (round === 0 && opts.onStructure) opts.onStructure(list[0] ? structureOf(list[0]) : structureOf(payload));
        var firstId = list[0] && isObject(list[0]) ? list[0].id : null;
        if (round > 0 && firstId && firstId === lastFirstId) break;
        lastFirstId = firstId;
        items = items.concat(list);
        if (opts.onPage) opts.onPage(items.length);
        if (list.length === 0) break;
        var meta = isObject(payload) && isObject(payload.meta) ? payload.meta : {};
        var next = typeof meta.nextCursor === "string" && meta.nextCursor ? meta.nextCursor : null;
        if (next) {
          if (next === cursor) break;
          mode = "cursor";
          cursor = next;
          continue;
        }
        if (mode === "cursor" || "nextCursor" in meta) break;
        var info = pageMeta(payload);
        if (info.hasNext === false) break;
        if (info.totalPages && page >= info.totalPages) break;
        if (info.hasNext === undefined && !info.totalPages && list.length < limit) break;
        mode = "page";
        page += 1;
      }
      return items;
    }

    async function loadSellerGroupNames() {
      var names = {};
      try {
        var groups = await listAll("merchant/seller-groups", {}, { limit: 100, maxPages: 20 });
        groups.forEach(function (group) { if (isObject(group) && typeof group.id === "string" && typeof group.name === "string") names[group.id] = group.name; });
      } catch (error) {
        state.errors.push({ path: "GET merchant/seller-groups", status: error.status || 0, messages: messagesOf(error).slice(0, 3) });
      }
      return names;
    }

    // 판매·매출처 읽기: 매출처 → 주문 상품 줄(주문일 start~end) → 아직 모르는 상품의 과세 여부 → DB센터로 보내기.
    // options.final = false 면 마지막 보고를 끝으로 하지 않음(비교 작업 안에서 쓸 때는 true로 끝냄). options.taxMap = 이번 비교에서 읽은 과세 여부.
    // 발주오라 대시보드 숫자(1.11.0, 2026-11-27 관리자 요청 "주문 동기화를 누르면 대시보드의 최근 7일 주문 현황·기간별 매출·매출처 TOP 5·
    // 상품별 매출까지 똑같이"): 발주오라 대시보드 화면과 같은 API(발주오라 화면 코드 8198 조각: getStatisticsRecentOrders →
    // GET statistics/recent-orders, getStatisticsSummaryByPeriod → statistics/summary-by-period, getStatisticsTopSellers → statistics/top-sellers,
    // getStatisticsTopProducts → statistics/top-products)를 읽어 그대로 보냅니다. 대시보드 화면이 이미 부른 주소가 있으면 같은 조건(쿼리)으로,
    // 없으면(다른 화면에서 책갈피) 조건 없이 부릅니다. 받는 사람 이름·연락처·주소 같은 칸은 보내지 않습니다.
    var DASHBOARD_ENDPOINTS = ["statistics/recent-orders", "statistics/summary-by-period", "statistics/top-sellers", "statistics/top-products"];
    var DASHBOARD_PRIVATE_KEY = /(phone|mobile|receiver|recipient|address|zipcode|postcode|email|password|token|accountnumber|bankaccount|birth)/i;

    function dashboardRequestsFromPage() {
      var found = {};
      try {
        var entries = env.resourceEntries ? env.resourceEntries() : [];
        var base = new URL(env.apiBase);
        (entries || []).forEach(function (entry) {
          var url;
          try { url = new URL(entry && entry.name); } catch { return; }
          if (url.host !== base.host) return;
          var path = url.pathname.replace(/^\/+/, "");
          DASHBOARD_ENDPOINTS.forEach(function (endpoint) {
            if (path !== endpoint) return;
            var params = {};
            url.searchParams.forEach(function (value, key) { params[key] = value; });
            var list = found[endpoint] || (found[endpoint] = []);
            var key = JSON.stringify(params);
            if (!list.some(function (item) { return JSON.stringify(item) === key; }) && list.length < 4) list.push(params);
          });
        });
      } catch { /* 무시: 조건 없이 부름 */ }
      return found;
    }

    function cleanDashboardValue(value, depth) {
      if (value === null || typeof value === "number" || typeof value === "boolean") return value;
      if (typeof value === "string") return value.slice(0, 200);
      if (depth > 6) return null;
      if (Array.isArray(value)) return value.slice(0, 100).map(function (item) { return cleanDashboardValue(item, depth + 1); });
      if (isObject(value)) {
        var out = {};
        Object.keys(value).slice(0, 80).forEach(function (key) {
          if (DASHBOARD_PRIVATE_KEY.test(key)) return;
          out[key] = cleanDashboardValue(value[key], depth + 1);
        });
        return out;
      }
      return null;
    }

    async function readDashboard(report) {
      report.progress(0, 0, "발주오라 대시보드 숫자(최근 7일 주문 현황·기간별 매출·매출처 TOP·상품별 매출)를 읽는 중…");
      var fromPage = dashboardRequestsFromPage();
      var responses = [];
      for (var index = 0; index < DASHBOARD_ENDPOINTS.length; index += 1) {
        var endpoint = DASHBOARD_ENDPOINTS[index];
        var paramsList = fromPage[endpoint] && fromPage[endpoint].length ? fromPage[endpoint] : [{}];
        for (var p = 0; p < paramsList.length; p += 1) {
          var params = paramsList[p];
          try {
            var payload = unwrap(await api("GET", endpoint, undefined, Object.keys(params).length ? { params: params } : undefined));
            state.structure["dashboard:" + endpoint] = structureOf(payload);
            responses.push({ endpoint: endpoint, params: params, fromPage: Boolean(fromPage[endpoint]), status: 200, data: cleanDashboardValue(payload, 0) });
          } catch (error) {
            state.errors.push({ path: "GET " + endpoint, status: error.status || 0, messages: messagesOf(error).slice(0, 3) });
            responses.push({ endpoint: endpoint, params: params, fromPage: Boolean(fromPage[endpoint]), status: error.status || 0, error: messagesOf(error).slice(0, 2).join(" / ").slice(0, 300) || describeError(error) });
          }
        }
      }
      var ok = responses.filter(function (item) { return item.status === 200; }).length;
      report.log(ok > 0 ? "발주오라 대시보드 숫자를 읽었습니다(" + ok + "가지)." : "발주오라 대시보드 숫자를 읽지 못했습니다(주문은 계속 읽어요).", ok === 0);
      return { at: new Date(clock()).toISOString(), page: String(env.pagePath || "").slice(0, 120), responses: responses };
    }

    async function runSales(step, report, options) {
      var opts = options || {};
      if (!opts.taxMap) watchThrottle(report, { done: 0, total: 0, label: "판매·매출처 읽기" });
      var result = { lines: 0, buyers: 0, suppliers: 0, complete: false, error: null };
      var known = {};
      (step.knownTax || []).forEach(function (id) { known[id] = true; });
      var productTax = Object.assign({}, opts.taxMap || {});
      if (step.buyers !== false) {
        report.progress(0, 0, "발주오라 매출처(셀러) 목록을 읽는 중…");
        try {
          var groupNames = await loadSellerGroupNames();
          var rawSellers = await listAll("merchant/sellers", {}, {
            limit: 100,
            maxPages: 300,
            onStructure: function (shape) { state.structure.sellerList = shape; },
            onPage: function (count) { report.progress(count, 0, "매출처 " + count + "곳 읽음"); }
          });
          var buyers = rawSellers.map(function (record) { return normalizeSeller(record, groupNames); }).filter(Boolean);
          var needDetail = buyers.filter(sellerNeedsDetail).slice(0, 1500);
          if (needDetail.length > 0) {
            var detailDone = 0;
            var details = await mapLimit(needDetail, 5, async function (buyer) {
              try {
                var detail = unwrap(await api("GET", "merchant/sellers/" + encodeURIComponent(buyer.id)));
                if (isObject(detail) && isObject(detail.seller) && !detail.id) detail = detail.seller;
                if (!state.structure.sellerDetail && isObject(detail)) state.structure.sellerDetail = structureOf(detail);
                return normalizeSeller(detail, groupNames);
              } catch (error) {
                if (error.status !== 404) state.errors.push({ path: "GET merchant/sellers/:id", status: error.status || 0, messages: messagesOf(error).slice(0, 3) });
                return null;
              } finally {
                detailDone += 1;
                if (detailDone % 20 === 0 || detailDone === needDetail.length) report.progress(detailDone, needDetail.length, "매출처 상세 " + detailDone + " / " + needDetail.length + "곳 읽음");
              }
            });
            var byId = {};
            needDetail.forEach(function (buyer, index) { if (details[index]) byId[buyer.id] = details[index]; });
            buyers = buyers.map(function (buyer) {
              var detail = byId[buyer.id];
              if (!detail) return buyer;
              var merged = Object.assign({}, buyer);
              Object.keys(detail).forEach(function (key) { if (detail[key] !== null && detail[key] !== undefined && detail[key] !== "") merged[key] = detail[key]; });
              return merged;
            });
          }
          for (var start = 0; start < buyers.length; start += 500) await sendResults(report, { final: false, buyers: buyers.slice(start, start + 500) });
          result.buyers = buyers.length;
          report.log("매출처 " + buyers.length + "곳을 보냈습니다.");
        } catch (error) {
          state.errors.push({ path: "GET merchant/sellers", status: error.status || 0, messages: messagesOf(error).slice(0, 3) });
          report.log("매출처를 읽지 못했습니다: " + describeError(error), true);
        }
      }
      // 발주오라 매입처(1.10.0, 운영 홈 '주문 동기화'만): 목록을 못 읽어도 멈추지 않고 그 까닭을 보냅니다(DB센터는 주문 줄의 매입처로 대신 맞춤).
      if (step.suppliers) {
        report.progress(0, 0, "발주오라 매입처 목록을 읽는 중…");
        var supplierRows = null;
        var supplierError = null;
        try {
          var rawSuppliers = await listAll("merchant/suppliers", {}, {
            limit: 100,
            maxPages: 100,
            onStructure: function (shape) { state.structure.supplierList = shape; },
            onPage: function (count) { report.progress(count, 0, "매입처 " + count + "곳 읽음"); }
          });
          supplierRows = rawSuppliers.map(normalizeSupplier).filter(Boolean);
        } catch (error) {
          state.errors.push({ path: "GET merchant/suppliers", status: error.status || 0, messages: messagesOf(error).slice(0, 3) });
          supplierError = describeError(error);
          report.log("매입처 목록을 읽지 못했습니다(주문에 나온 매입처로 맞춰요): " + supplierError, true);
        }
        if (supplierRows) {
          for (var supplierStart = 0; supplierStart < supplierRows.length; supplierStart += 500) await sendResults(report, { final: false, suppliers: supplierRows.slice(supplierStart, supplierStart + 500) });
          result.suppliers = supplierRows.length;
          report.log("매입처 " + supplierRows.length + "곳을 보냈습니다.");
        } else {
          await sendResults(report, { final: false, supplierError: supplierError || "매입처 목록을 읽지 못했습니다." });
        }
      }
      // 발주오라 대시보드 숫자(1.11.0): 주문 줄보다 먼저 읽어 같은 때의 숫자로 맞춰 봅니다. 못 읽어도 주문은 계속 읽습니다.
      if (step.dashboard) {
        var dashboard = await readDashboard(report);
        await sendResults(report, { final: false, dashboard: dashboard });
        result.dashboard = dashboard.responses.filter(function (item) { return item.status === 200; }).length;
      }
      report.progress(0, 0, "발주오라 주문(" + step.start + " ~ " + step.end + ")을 읽는 중…");
      var lines = [];
      try {
        var rawItems = await listAll("orders/items", { rangeType: "order", startDate: step.start, endDate: step.end }, {
          limit: 100,
          maxPages: 3000,
          optionalParams: ["rangeType"],
          onStructure: function (shape) { state.structure.orderItem = shape; },
          onPage: function (count) { report.progress(count, 0, "주문 상품 " + count + "줄 읽음"); }
        });
        lines = rawItems.map(normalizeOrderItem).filter(function (line) { return line && line.orderedAt; });
        result.complete = true;
      } catch (error) {
        result.error = describeError(error);
        state.errors.push({ path: "GET orders/items", status: error.status || 0, messages: messagesOf(error).slice(0, 3) });
        report.log("주문을 끝까지 읽지 못했습니다: " + result.error, true);
      }
      var seen = {};
      var unknown = [];
      lines.forEach(function (line) {
        var id = line.productId;
        if (!id || seen[id] || known[id] || typeof productTax[id] === "boolean") return;
        seen[id] = true;
        unknown.push(id);
      });
      unknown = unknown.slice(0, 1500);
      if (unknown.length > 0) {
        var taxDone = 0;
        await mapLimit(unknown, 5, async function (id) {
          try {
            var detail = await getDetail(id);
            if (isObject(detail) && typeof detail.isTaxable === "boolean") productTax[id] = detail.isTaxable;
          } catch (error) {
            if (error.status !== 404) state.errors.push({ path: "GET products/:id (tax)", status: error.status || 0, messages: messagesOf(error).slice(0, 3) });
          } finally {
            taxDone += 1;
            if (taxDone % 20 === 0 || taxDone === unknown.length) report.progress(taxDone, unknown.length, "상품 과세 여부 " + taxDone + " / " + unknown.length + "개 확인");
          }
        });
      }
      if (Object.keys(productTax).length > 0) await sendResults(report, { final: false, productTax: productTax });
      report.progress(0, lines.length, "판매 " + lines.length + "줄을 DB센터로 보내는 중…");
      for (var index = 0; index < lines.length; index += 1000) {
        await sendResults(report, { final: false, salesLines: lines.slice(index, index + 1000) });
        report.progress(Math.min(index + 1000, lines.length), lines.length, "판매 " + lines.length + "줄을 DB센터로 보내는 중…");
      }
      result.lines = lines.length;
      var isFinal = opts.final !== false;
      await sendResults(report, {
        final: isFinal,
        salesDone: { complete: result.complete, error: result.error },
        diagnostics: isFinal ? diagnostics({ sales: { start: step.start, end: step.end, lines: result.lines, buyers: result.buyers, suppliers: result.suppliers, taxRead: unknown.length, complete: result.complete } }) : undefined
      });
      return result;
    }

    async function runCompare(plan, report) {
      watchThrottle(report, { done: 0, total: 0, label: "발주오라 상품 읽기" });
      report.progress(0, 0, "발주오라 매출처 그룹·카테고리를 읽는 중…");
      var group = await findGroup(plan.groupKeyword);
      var categories = await loadCategories();
      var context = { group: group, groupKeyword: plan.groupKeyword };
      report.progress(0, 0, "발주오라 상품 목록을 읽는 중…");
      var raw = await listAllProducts(function (count, total) { report.progress(count, total || count, "발주오라 상품 목록 " + count + (total ? " / " + total : "") + "개 읽음"); });
      // position(1.11.0) = 발주오라 상품 목록에서의 순서(0 = 맨 위 = 가장 최근 등록). 같은 때 대량 등록한 상품의 순서를 발주오라와 같게 맞춥니다.
      var snapshots = raw.map(function (record, index) { var snapshot = normalizeProduct(record, context); if (snapshot) snapshot.position = index; return snapshot; }).filter(Boolean);
      var products = snapshots.filter(function (snapshot) { return snapshot.kind === "product"; });
      // 카테고리(1.9.1, 2026-11-27 운영 절임배추): 발주오라 목록은 카테고리를 include하지 않으면 모든 상품의 categoryIds가 빈 칸([])입니다.
      // 1.2.0~1.9.0은 그 빈 칸을 '카테고리 없음'으로 믿어 모든 상품이 "카테고리 없음 > 🥕 농산"처럼 달라 보였습니다(맞추기 카드 '카테고리 2,129').
      // 목록에서 카테고리를 읽지 못했으면(카테고리 include 거절 또는 모든 상품이 빈 칸) 목록 값은 '읽지 못함'으로 두고 연결된 상품 상세에서 읽습니다.
      var listCategories = Boolean(state.listIncludeUsed && state.listIncludeUsed.indexOf("categories") >= 0) && products.some(function (snapshot) { return Array.isArray(snapshot.categoryIds) && snapshot.categoryIds.length > 0; });
      if (!listCategories) products.forEach(function (snapshot) { delete snapshot.categoryIds; });
      // 상품 정보 칸(원산지·관리코드 등, 1.9.0)이 목록에 없으면 연결된 상품의 상세를 읽습니다.
      var needsDetail = products.some(function (snapshot) { return snapshot.categoryIds === undefined || snapshot.groupPrice === undefined || snapshot.shippingPolicyId === undefined || !snapshot.code || snapshot.extra === undefined || snapshot.extra.originText === undefined; });
      var policiesFromDetails = {};
      // 목록에 상품코드가 거의 없으면 상품코드로 연결할 수 있게 모든 상품의 상세를 읽습니다(최대 5,000개).
      var withoutCode = products.filter(function (snapshot) { return !snapshot.code; }).length;
      var readAll = products.length > 0 && withoutCode / products.length > 0.5;
      if (needsDetail && (readAll || (plan.detailIds && plan.detailIds.length))) {
        var wanted = {};
        (plan.detailIds || []).forEach(function (id) { wanted[id] = true; });
        var targets = products.filter(function (snapshot) { return readAll || wanted[snapshot.id]; }).slice(0, 5000);
        var done = 0;
        var details = await mapLimit(targets, 5, async function (snapshot) {
          try {
            var detail = await getDetail(snapshot.id);
            // 상세에 딸려 오는 매출배송정책(구간 포함)도 모아 둡니다(정책 목록을 못 읽을 때 대신 씀).
            var policy = isObject(detail) ? normalizeShippingPolicy(detail.shippingPolicy) : null;
            if (policy && !policiesFromDetails[policy.id]) policiesFromDetails[policy.id] = policy;
            return normalizeProduct(detail, context);
          } catch (error) {
            if (error.status === 404) return null;
            state.errors.push({ path: "GET products/:id", status: error.status || 0, messages: messagesOf(error).slice(0, 3) });
            return null;
          } finally {
            done += 1;
            if (done % 25 === 0 || done === targets.length) report.progress(done, targets.length, "연결된 상품 상세 " + done + " / " + targets.length + "개 읽음");
          }
        });
        var byId = {};
        targets.forEach(function (snapshot, index) { byId[snapshot.id] = details[index]; });
        snapshots = snapshots.map(function (snapshot) { return byId[snapshot.id] ? mergeSnapshots(snapshot, byId[snapshot.id]) : snapshot; });
      }
      // 매출처 그룹 공급가를 목록·상세 어디에서도 읽지 못했으면, 발주오라 화면 코드에서 읽고 저장하는 방식을 찾아 둡니다.
      if (products.length > 0 && snapshots.every(function (snapshot) { return snapshot.kind !== "product" || snapshot.groupPrice === undefined; })) {
        report.progress(0, 0, "발주오라 상품 화면 정보를 확인하는 중…");
        await discoverProductForm(products[0].id);
      }
      report.progress(0, 0, "발주오라 배송비 정책을 읽는 중…");
      var shippingPolicies = await loadShippingPolicies(policiesFromDetails);
      report.progress(0, snapshots.length, "DB센터로 결과를 보내는 중…");
      var batchSize = 400;
      for (var index = 0; index < snapshots.length || index === 0; index += batchSize) {
        var batch = snapshots.slice(index, index + batchSize);
        var first = index === 0;
        var last = index + batchSize >= snapshots.length;
        await sendResults(report, {
          final: last && !plan.sales,
          snapshots: batch,
          categories: first ? categories : undefined,
          shippingPolicies: first && shippingPolicies.length > 0 ? shippingPolicies : undefined,
          group: first ? group : undefined,
          diagnostics: last ? diagnostics({ group: group, categories: categories.length, products: products.length, bundles: snapshots.length - products.length, listInclude: state.listIncludeUsed || null, productCategories: listCategories ? "list" : "detail", withCategory: snapshots.filter(function (snapshot) { return Array.isArray(snapshot.categoryIds) && snapshot.categoryIds.length > 0; }).length }) : undefined
        });
        report.progress(Math.min(index + batchSize, snapshots.length), snapshots.length, "DB센터로 결과를 보내는 중…");
        if (last) break;
      }
      // 판매·매출처도 함께(1.7.0): 이번에 읽은 상품의 과세 여부를 그대로 써서 상세를 다시 읽지 않습니다.
      var sales = null;
      if (plan.sales) {
        var taxMap = {};
        snapshots.forEach(function (snapshot) { if (typeof snapshot.isTaxable === "boolean") taxMap[snapshot.id] = snapshot.isTaxable; });
        sales = await runSales(plan.sales, report, { final: true, taxMap: taxMap });
      }
      return { received: snapshots.length, products: products.length, sales: sales };
    }

    // DB센터 상품 이미지를 받아 발주오라 상품 등록·수정 화면과 같은 방식으로 발주오라 저장소에 올리고, imageUrls 에 넣을 값을 돌려줍니다.
    // (2026-11-23 운영: 예전 방식 { fileName, contentType, fileSize, category } 는 "kind should not be empty / size must not be less than 1"로 거절됨)
    async function uploadImage(item, code) {
      var response = await env.fetch(env.doogoOrigin + "/api/baljuora/runner/" + encodeURIComponent(code) + "/image/" + encodeURIComponent(item.productId));
      if (!response.ok) {
        var failure = await response.json().catch(function () { return null; });
        throw SyncError((failure && failure.error && failure.error.message) || "DB센터 이미지를 받지 못했습니다.");
      }
      var blob = await response.blob();
      if (!blob || blob.size < 1) throw SyncError("DB센터 이미지 파일이 비어 있습니다. 이미지를 다시 올려 주세요.");
      if (!fitsProductImage(blob)) {
        // 발주오라는 상품 이미지를 JPG·PNG, 1MB 이하만 받으므로 WEBP·GIF나 큰 이미지는 이 창에서 JPG로 줄여 올립니다.
        if (typeof env.convertImage !== "function") throw SyncError("발주오라는 상품 이미지를 JPG·PNG, 1MB 이하만 받습니다. DB센터 이미지를 JPG 1MB 이하로 바꿔 다시 올려 주세요.");
        var original = { type: productImageType(blob.type), size: blob.size };
        blob = await env.convertImage(blob, PRODUCT_IMAGE.maxBytes);
        if (!fitsProductImage(blob)) throw SyncError("이미지를 JPG 1MB 이하로 바꾸지 못했습니다. 더 작은 JPG·PNG 이미지로 다시 올려 주세요.");
        note("image:converted " + (original.type || "unknown") + (original.size > PRODUCT_IMAGE.maxBytes ? " >1MB" : ""), 200);
      }
      var type = productImageType(blob.type);
      var fileName = (String(item.code || item.productId).replace(/[^A-Za-z0-9_-]/g, "") || "product") + (type === "image/png" ? ".png" : ".jpg");
      var presignBody = { kind: PRODUCT_IMAGE.kind, fileName: fileName, contentType: type, size: blob.size, source: PRODUCT_IMAGE.source };
      var presign = unwrap(await sendAdaptive("POST", "files/presign", presignBody, null));
      if (!state.structure.filesPresign) state.structure.filesPresign = structureOf(presign);
      var target = isObject(presign) && !presign.uploadUrl && isObject(presign.data) ? presign.data : presign;
      var uploadUrl = isObject(target) ? target.uploadUrl || target.presignedUrl || target.signedUrl || target.putUrl || null : null;
      var file = isObject(target) && isObject(target.file) ? target.file : null;
      // 발주오라 화면은 올린 파일의 file.value 를 imageUrls 에 그대로 넣습니다(기존 이미지는 value = 주소).
      var value = file ? (typeof file.value === "string" && file.value) || (typeof file.url === "string" && file.url) || null : null;
      if (!value && isObject(target)) value = typeof target.fileUrl === "string" ? target.fileUrl : typeof target.publicUrl === "string" ? target.publicUrl : null;
      if (!uploadUrl) throw SyncError("발주오라 이미지 업로드 주소를 받지 못했습니다.");
      if (!value) throw SyncError("발주오라가 올릴 이미지의 주소를 알려 주지 않았습니다.");
      var headers = isObject(target.headers) ? Object.assign({}, target.headers) : { "Content-Type": type };
      var uploaded;
      try {
        uploaded = await env.fetch(uploadUrl, { method: "PUT", headers: headers, body: blob });
      } catch {
        throw SyncError("발주오라 저장소에 이미지를 올리지 못했습니다(연결 실패). 잠시 뒤 다시 동기화해 주세요.");
      }
      note("upload:image", uploaded.status);
      if (!uploaded.ok) throw SyncError("발주오라 저장소에 이미지를 올리지 못했습니다(" + uploaded.status + ").");
      return value;
    }

    // 썸네일(대표 이미지): 올린 이미지를 첫 이미지로, 나머지 이미지는 그대로 두고 발주오라 상품 수정 화면처럼 PUT products/:id {imageUrls} 로 저장합니다.
    async function applyImage(id, detail, item, result, code, checks) {
      var url = await uploadImage(item, code);
      var before = extractImages(detail);
      var images = [url].concat(before.slice(1).filter(function (value) { return value !== url; })).slice(0, PRODUCT_IMAGE.limit);
      if (checks) checks.image = { before: before[0] || null, sent: url };
      var body = { imageUrls: images };
      await sendAdaptive("PUT", "products/" + encodeURIComponent(id), body, currentProductValues(detail, ["name", "code", "supplyPrice", "categoryIds"]), {});
      if ("imageUrls" in body) result.applied.push("image");
      else result.skipped.push({ field: "image", reason: "발주오라가 이미지 칸(imageUrls)을 받지 않았습니다." });
    }

    async function applyPricing(id, detail, item, fields, result, context) {
      var body = {};
      var values = item.values;
      // 보내기 직전에 읽은 발주오라 값과 이미 같은 칸은 보내지 않고 '반영됨'으로 둡니다(예전 비교 기록으로 넣은 칸 포함).
      // 0원(비어 있음)으로는 발주오라 가격을 바꾸지 않습니다(변경 목록도 0원은 비교하지 않음).
      var same = {};
      var blank = {};
      var liveSupply = toNumber(detail.supplyPrice);
      var liveCost = extractPurchaseCost(detail);
      if (fields.indexOf("supplyPrice") >= 0) {
        if (liveSupply !== null && liveSupply === values.supplyPrice) same.supplyPrice = true;
        else if (values.supplyPrice > 0) body.supplyPrice = values.supplyPrice;
        else blank.supplyPrice = true;
      }
      if (fields.indexOf("consumerPrice") >= 0) body.consumerPrice = values.consumerPrice;
      // 매입원가는 가격 저장이 아니라 매입처 목록(productSuppliers)으로 보냅니다(위 buildProductSuppliers 설명).
      var supplierList = null;
      var costMissing = null;
      if (fields.indexOf("purchaseCost") >= 0 && values.purchaseCost !== null) {
        if (typeof liveCost === "number" && liveCost === values.purchaseCost) same.purchaseCost = true;
        else if (values.purchaseCost < 0) blank.purchaseCost = true;
        else {
          supplierList = buildProductSuppliers(detail, values.purchaseCost);
          if (!supplierList) {
            costMissing = !Array.isArray(detail.productSuppliers)
              ? "발주오라 상품 정보에서 매입처 목록을 읽지 못해 매입원가를 보내지 않았습니다."
              : detail.productSuppliers.length === 0
                ? "발주오라 상품에 매입처가 없어 매입원가를 보낼 곳이 없습니다(발주오라에서 매입처를 먼저 넣어 주세요)."
                : "발주오라 매입처 목록에 기본 매입처·매입원가·매입배송정책을 알 수 없는 줄이 있어 보내지 않았습니다(다른 매입처 값 보호).";
          }
        }
      }
      var groupList = null;
      var groupSame = false;
      var groupMissing = null;
      if (fields.indexOf("groupPrice") >= 0) {
        // 황금농부 공급가가 이미 수강생 단가와 같거나, 황금농부 줄이 없고 수강생 단가 = 일반공급가(공급가로 삼)이면 개별공급가 목록은 건드리지 않습니다.
        var current = extractGroupPrice(detail, context.group, context.groupKeyword);
        if ((typeof current === "number" && current === values.groupPrice) || (current === null && values.groupPrice === values.supplyPrice)) {
          groupSame = true;
        } else if (!(values.groupPrice > 0)) {
          blank.groupPrice = true;
        } else {
          groupList = buildSellerProductPrices(detail, context.group, context.groupKeyword, values.groupPrice);
          if (!groupList) {
            groupMissing = !Array.isArray(detail.prices)
              ? "발주오라 상품 정보에서 개별공급가 목록을 읽지 못해 보내지 않았습니다."
              : !context.group && extractGroupPrice(detail, context.group, context.groupKeyword) === null
                ? "발주오라에서 '" + context.groupKeyword + "' 매출처 그룹을 찾지 못했습니다."
                : "발주오라 개별공급가 목록에 대상이나 공급가를 알 수 없는 줄이 있어 보내지 않았습니다(다른 매출처 값 보호).";
          }
        }
      }
      // 공급가·소비자가·매입원가는 가격 저장으로, 개별공급가는 발주오라 상품 수정 화면처럼 PUT products/:id 로 따로 보냅니다.
      // 한쪽이 실패해도 다른 쪽 결과는 그대로 남깁니다(401은 그대로 중단).
      var pricingError = null;
      if (Object.keys(body).length > 0) {
        try {
          await sendAdaptive("PUT", "products/" + encodeURIComponent(id) + "/pricing", body, writable(detail), {});
        } catch (error) {
          if (error && error.status === 401) throw error;
          pricingError = error;
        }
      }
      var groupError = null;
      var groupSent = false;
      if (groupList) {
        var groupBody = { sellerProductPrices: groupList };
        // 발주오라가 다른 칸을 꼭 달라고 하면(예: "상품명은 문자열이어야 합니다.") 지금 값으로만 채워 다시 보냅니다(값은 바뀌지 않음).
        try {
          await sendAdaptive("PUT", "products/" + encodeURIComponent(id), groupBody, currentProductValues(detail), {});
          groupSent = Array.isArray(groupBody.sellerProductPrices);
        } catch (error) {
          if (error && error.status === 401) throw error;
          groupError = error;
        }
      }
      var costError = null;
      var costSent = false;
      if (supplierList) {
        var costBody = { productSuppliers: supplierList };
        try {
          await sendAdaptive("PUT", "products/" + encodeURIComponent(id), costBody, currentProductValues(detail), {});
          costSent = Array.isArray(costBody.productSuppliers);
        } catch (error) {
          if (error && error.status === 401) throw error;
          costError = error;
        }
      }
      fields.forEach(function (field) {
        if ((field === "groupPrice" && groupSame) || same[field]) { result.applied.push(field); return; }
        if (blank[field]) { result.skipped.push({ field: field, reason: "DB센터 값이 0원이라 보내지 않았습니다(발주오라 가격을 0원으로 바꾸지 않음)." }); return; }
        if (field === "purchaseCost" && values.purchaseCost === null) { result.skipped.push({ field: field, reason: "DB센터 원가가 비어 있어 보내지 않았습니다." }); return; }
        if (field === "purchaseCost") {
          if (costMissing) { result.skipped.push({ field: field, reason: costMissing }); return; }
          if (costError) { result.skipped.push({ field: field, reason: describeError(costError) }); return; }
          if (!costSent) { result.skipped.push({ field: field, reason: "발주오라가 매입처 목록(productSuppliers)을 받지 않았습니다." }); return; }
          result.applied.push(field);
          return;
        }
        if (field === "groupPrice") {
          if (groupMissing) { result.skipped.push({ field: field, reason: groupMissing }); return; }
          if (groupError) { result.skipped.push({ field: field, reason: describeError(groupError) }); return; }
          if (!groupSent) { result.skipped.push({ field: field, reason: "발주오라가 개별공급가 목록(sellerProductPrices)을 받지 않았습니다." }); return; }
          result.applied.push(field);
          return;
        }
        if (pricingError) { result.skipped.push({ field: field, reason: describeError(pricingError) }); return; }
        if (!(field in body)) { result.skipped.push({ field: field, reason: "발주오라가 이 칸을 받지 않았습니다." }); return; }
        result.applied.push(field);
      });
    }

    // 발주오라 상품 카테고리 트리 맞추기: 지금 트리를 읽어 추가·이름 바꾸기만 더한 전체 트리를 발주오라 화면처럼 저장하고, 다시 읽어 확인합니다.
    // 원래 카테고리가 하나라도 안 보이면 오류로 알립니다(브랜드별 아래 포함 모든 카테고리를 그대로 보냄).
    async function applyCategoryTree(tree) {
      var ops = isObject(tree) && Array.isArray(tree.ops) ? tree.ops : [];
      var result = { applied: [], skipped: [], created: {}, categories: undefined, error: null, flat: null };
      var unresolved = function (reason) {
        ops.forEach(function (op) {
          var key = op.type === "rename" ? "r:" + op.baljuoraId : op.ref;
          if (!result.applied.some(function (entry) { return entry.key === key; }) && !result.skipped.some(function (entry) { return entry.key === key; })) result.skipped.push({ key: key, name: op.type === "rename" ? op.to : op.name, reason: reason });
        });
      };
      try {
        var before = treeRootsOf(await api("GET", "merchant/categories/tree"));
        if (!before) throw SyncError("발주오라 카테고리 트리를 읽지 못해 카테고리는 바꾸지 않았습니다.");
        if (!state.structure.categoryTree) state.structure.categoryTree = structureOf(before);
        var problem = treeShapeProblem(before);
        if (problem) throw SyncError("발주오라 카테고리 트리 모양이 예상과 달라(" + problem + ") 카테고리는 바꾸지 않았습니다.");
        var saved = planTreeSave(before, ops, tree.excludeNames || ["브랜드별"]);
        result.skipped = saved.skipped.slice();
        if (!saved.changed) {
          result.applied = saved.applied.map(function (entry) { return { key: entry.key, type: entry.type, name: entry.name }; });
          result.created = Object.assign({}, saved.linked);
          result.flat = flattenCategories(before);
          result.categories = result.flat;
          return result;
        }
        await api("POST", "merchant/categories/tree", { categories: treeSaveBody(saved.draft) });
        var after = treeRootsOf(await api("GET", "merchant/categories/tree"));
        if (!after) throw SyncError("카테고리를 저장했지만 다시 읽지 못했습니다. 발주오라 상품 카테고리 화면에서 확인해 주세요.");
        var check = verifyTreeSave(before, after, saved);
        result.created = check.created;
        result.flat = check.categories;
        result.categories = check.categories;
        var failedKeys = {};
        check.failed.forEach(function (entry) { failedKeys[entry.key] = true; result.skipped.push(entry); });
        result.applied = saved.applied.filter(function (entry) { return !failedKeys[entry.key]; }).map(function (entry) { return { key: entry.key, type: entry.type, name: entry.name }; });
        if (check.missing.length > 0) {
          result.error = "발주오라 카테고리를 저장한 뒤 원래 카테고리 " + check.missing.length + "개가 보이지 않습니다(" + check.missing.slice(0, 5).map(function (category) { return category.path; }).join(", ") + "). 발주오라 상품 카테고리 화면에서 바로 확인해 주세요.";
          state.errors.push({ path: "POST merchant/categories/tree", status: 0, messages: ["missing after save: " + check.missing.length] });
        }
      } catch (error) {
        if (error && error.status === 401) throw error;
        result.error = describeError(error);
        unresolved(result.error);
      }
      // 저장이 실패하거나 확인이 어긋나면 발주오라 카테고리 화면 코드가 바뀌었을 수 있어, 다음 수정을 위해 그 화면 코드 경로를 기술 정보로 남깁니다.
      if (result.error || result.skipped.some(function (entry) { return /저장 뒤/.test(entry.reason); })) await discoverCategoryPage();
      return result;
    }

    // 매출배송정책(배송비 정책): 발주오라 상품 수정 화면처럼 PUT products/:id 에 sellShippingPolicyId 를 보냅니다(2026-11-23 화면 코드 확인).
    // DB센터 배송 정책과 연결한 발주오라 정책이 없으면 보내지 않고 이유를 알립니다. 이미 같으면 보내지 않고 '반영됨'.
    async function applyShipping(id, detail, item, result) {
      var target = item.values.baljuoraShippingPolicyId;
      if (!target) {
        result.skipped.push({ field: "shippingPolicy", reason: "이 상품의 DB센터 배송 정책과 연결된 발주오라 매출배송정책이 없습니다(동기화 설정 > 배송비 정책 맞추기)." });
        return;
      }
      var live = typeof detail.sellShippingPolicyId === "string" ? detail.sellShippingPolicyId : isObject(detail.shippingPolicy) && typeof detail.shippingPolicy.id === "string" ? detail.shippingPolicy.id : null;
      if (live === target) { result.applied.push("shippingPolicy"); return; }
      var body = { sellShippingPolicyId: target };
      await sendAdaptive("PUT", "products/" + encodeURIComponent(id), body, null, {});
      if ("sellShippingPolicyId" in body) result.applied.push("shippingPolicy");
      else result.skipped.push({ field: "shippingPolicy", reason: "발주오라가 이 칸을 받지 않았습니다." });
    }

    // 상품 정보 저장(PUT products/:id/info)은 상품명이 꼭 있어야 합니다(2026-11-23 운영: 카테고리만 보내자 "상품명은 문자열이어야 합니다.").
    // 그래서 바꾸지 않는 칸도 지금 값(상품명·이미지·카테고리)을 함께 보내, 빠진 칸 때문에 발주오라 값이 지워지지 않게 합니다.
    // 썸네일은 applyImage 가 이 저장 뒤에 따로 저장합니다(여기서 보내는 '지금 이미지'가 새 썸네일을 되돌리지 않게 순서 고정).
    async function applyInfo(id, detail, item, fields, result, context) {
      var body = {};
      var sent = {};
      var baseKeys = [];
      var currentName = typeof detail.name === "string" ? detail.name : "";
      body.name = currentName || item.values.name;
      var categoryKey = categoryKeyOf(detail);
      if (Array.isArray(detail.categoryIds)) {
        body.categoryIds = detail.categoryIds.filter(function (value) { return typeof value === "string"; });
        baseKeys.push("categoryIds");
      }
      if (Array.isArray(detail.imageUrls)) {
        body.imageUrls = detail.imageUrls.filter(function (value) { return typeof value === "string"; });
        baseKeys.push("imageUrls");
      }
      var dropBase = function (key) { var index = baseKeys.indexOf(key); if (index >= 0) baseKeys.splice(index, 1); };
      if (fields.indexOf("name") >= 0 && item.values.name) {
        body.name = item.values.name;
        sent.name = "name";
      }
      if (fields.indexOf("category") >= 0) {
        // 같은 작업에서 발주오라에 새로 만든 카테고리(DB센터 카테고리 추가)로도 보낼 수 있습니다.
        var created = context && context.createdCategories && item.values.doogoCategoryId ? context.createdCategories["c:" + item.values.doogoCategoryId] : null;
        if (!item.values.categoryId && created) item.values.categoryId = created;
        if (!item.values.categoryId) {
          result.skipped.push({ field: "category", reason: "DB센터 카테고리와 연결한 발주오라 카테고리가 없습니다(동기화 설정 > 카테고리 연결)." });
        } else if (categoryKey === "categoryIds") {
          // 상품에 붙은 브랜드별(제외한 카테고리) 아래 카테고리는 그대로 둡니다(2026-11-23 관리자 요청 "브랜드별은 특별히 제외").
          var keep = (Array.isArray(detail.categoryIds) ? detail.categoryIds : []).filter(function (categoryId) { return typeof categoryId === "string" && categoryId !== item.values.categoryId && context && context.preserveCategoryIds && context.preserveCategoryIds[categoryId]; });
          body.categoryIds = [item.values.categoryId].concat(keep);
          sent.category = categoryKey;
          dropBase(categoryKey);
        } else {
          body[categoryKey] = item.values.categoryId;
          sent.category = categoryKey;
          dropBase(categoryKey);
        }
      }
      if (Object.keys(sent).length === 0) return;
      var path = "products/" + encodeURIComponent(id) + "/info";
      try {
        await sendAdaptive("PUT", path, body, writable(detail));
      } catch (error) {
        // 함께 보낸 '지금 값' 칸(이미지·카테고리) 때문에 거절됐을 수 있어 그 칸만 빼고 한 번 더 보냅니다(상품명·바꾸는 칸은 그대로).
        var base = baseKeys.filter(function (key) { return key in body; });
        if (error.status !== 400 || base.length === 0) throw error;
        base.forEach(function (key) { delete body[key]; });
        await sendAdaptive("PUT", path, body, writable(detail));
      }
      Object.keys(sent).forEach(function (field) {
        if (sent[field] in body) result.applied.push(field);
        else result.skipped.push({ field: field, reason: "발주오라가 이 칸을 받지 않았습니다." });
      });
    }

    // 상품 카테고리(1.9.1, 2026-11-27 운영 절임배추 "발주오라에 저장된 카테고리가 다릅니다"): 1.3.0~1.9.0은 카테고리를 상품 정보 저장
    // (PUT products/:id/info)에 넣었는데, 발주오라는 그 칸을 오류 없이 버려(응답 200, 다시 읽어도 카테고리 그대로) 카테고리가 바뀌지 않았습니다.
    // 발주오라 상품 수정 화면 코드(2026-11-23 확인: 수정 본문에 categoryIds = 고른 카테고리 전체, 바뀐 칸만 PUT products/:id)와 같게 보냅니다.
    // - 지금 발주오라 카테고리가 이미 받을 카테고리(연결 카테고리 또는 그 아래)면 보내지 않고 '반영됨'(비교 기록이 틀려도 세부 카테고리를 뭉개지 않음)
    // - 상품에 붙은 브랜드별(제외한 카테고리) 아래 카테고리는 그대로 둡니다
    // - 상품 수정이 카테고리 칸을 받지 않으면("property categoryIds should not exist") 예전처럼 상품 정보 저장으로 한 번 보냅니다
    async function applyCategory(id, detail, item, result, context, checks) {
      var created = context && context.createdCategories && item.values.doogoCategoryId ? context.createdCategories["c:" + item.values.doogoCategoryId] : null;
      if (!item.values.categoryId && created) item.values.categoryId = created;
      var target = item.values.categoryId;
      if (!target) {
        result.skipped.push({ field: "category", reason: "DB센터 카테고리와 연결한 발주오라 카테고리가 없습니다(동기화 설정 > 카테고리 연결)." });
        return;
      }
      var flat = (context && context.categoryFlat) || [];
      var accept = [target].concat((Array.isArray(item.values.categoryIds) ? item.values.categoryIds : []).filter(function (categoryId) { return typeof categoryId === "string" && categoryId && categoryId !== target; }));
      checks.category = { accept: accept, flat: flat };
      // 상세를 include 없이 읽었으면(include 거절) 카테고리 칸이 비어 올 수 있어, 브랜드 카테고리를 지우지 않게 보내지 않습니다.
      var live = state.includeOk === false ? undefined : extractCategoryIds(detail);
      if (live === undefined) {
        result.skipped.push({ field: "category", reason: "발주오라 상품의 지금 카테고리를 읽지 못해 보내지 않았습니다(다른 카테고리가 지워지지 않게). 발주오라 상품 수정 화면에서 바꿔 주세요." });
        return;
      }
      if (categoryCovers(live, accept, flat)) {
        result.applied.push("category");
        return;
      }
      var categoryKey = categoryKeyOf(detail);
      var body = {};
      if (categoryKey === "categoryIds") {
        var keep = live.filter(function (categoryId) { return categoryId !== target && context && context.preserveCategoryIds && context.preserveCategoryIds[categoryId]; });
        body.categoryIds = [target].concat(keep);
      } else {
        body[categoryKey] = target;
      }
      try {
        await sendAdaptive("PUT", "products/" + encodeURIComponent(id), body, null, {});
      } catch (error) {
        if (error && error.status === 401) throw error;
        if (!(error && error.status === 400 && !(categoryKey in body))) throw error;
      }
      if (categoryKey in body) {
        result.applied.push("category");
        return;
      }
      await applyInfo(id, detail, item, ["category"], result, context);
    }

    // 상품 정보 칸(1.9.0): 발주오라 상품 수정 화면처럼 PUT products/:id 에 바뀐 칸만 보냅니다. 이미 같은 칸은 보내지 않고 '반영됨'.
    // 한꺼번에 보내다 거절되면 칸마다 따로 보내 어느 칸이 문제인지 찾고, 판매 상태(품절·도매몰 노출)를 받지 않으면 PUT products/:id/status 로 보냅니다.
    // 저장된 값 확인은 DB센터가 저장 뒤 다시 읽은 상품으로 합니다.
    async function applyExtras(id, detail, item, fields, result) {
      var extra = isObject(item.values.extra) ? item.values.extra : {};
      var path = "products/" + encodeURIComponent(id);
      var source = currentProductValues(detail, ["name", "code", "supplyPrice", "categoryIds"]);
      var keysByField = {};
      var parts = {};
      var body = {};
      fields.forEach(function (field) {
        var part = extraBodyFor(field, extra, detail);
        if (!part) {
          result.skipped.push({ field: field, reason: field === "certification" ? "인증은 발주오라에서 인증번호와 함께 고쳐 주세요(DB센터에서 보내지 않음)." : "보낼 값을 알 수 없습니다." });
          return;
        }
        var keys = Object.keys(part);
        if (keys.every(function (key) { return sameExtraValue(detail[key], part[key]); })) {
          result.applied.push(field);
          return;
        }
        keysByField[field] = keys;
        parts[field] = part;
        keys.forEach(function (key) { body[key] = part[key]; });
      });
      var pending = Object.keys(keysByField);
      if (pending.length === 0) return;
      var statusLeft = [];
      var settle = function (sent, list) {
        list.forEach(function (field) {
          if (keysByField[field].every(function (key) { return key in sent; })) result.applied.push(field);
          else if (STATUS_KEYS[field]) statusLeft.push(field);
          else result.skipped.push({ field: field, reason: "발주오라가 이 칸(" + keysByField[field].join(", ") + ")을 받지 않았습니다." });
        });
      };
      try {
        await sendAdaptive("PUT", path, body, source, {});
        settle(body, pending);
      } catch (error) {
        if (error && error.status === 401) throw error;
        if (pending.length === 1) {
          if (STATUS_KEYS[pending[0]] && error && error.status === 400) statusLeft.push(pending[0]);
          else result.skipped.push({ field: pending[0], reason: describeError(error) });
        } else {
          for (var index = 0; index < pending.length; index += 1) {
            var field = pending[index];
            // 처음 보낸 본문은 sendAdaptive가 받지 않는 칸을 지웠을 수 있어, 그 칸의 원래 값으로 다시 만듭니다.
            var single = Object.assign({}, parts[field]);
            try {
              await sendAdaptive("PUT", path, single, source, {});
              settle(single, [field]);
            } catch (fieldError) {
              if (fieldError && fieldError.status === 401) throw fieldError;
              if (STATUS_KEYS[field] && fieldError && fieldError.status === 400) statusLeft.push(field);
              else result.skipped.push({ field: field, reason: describeError(fieldError) });
            }
          }
        }
      }
      if (statusLeft.length === 0) return;
      var statusBody = {};
      statusLeft.forEach(function (field) { statusBody[STATUS_KEYS[field]] = extra[STATUS_KEYS[field]]; });
      try {
        await sendAdaptive("PUT", path + "/status", statusBody, null, {});
        statusLeft.forEach(function (field) {
          if (STATUS_KEYS[field] in statusBody) result.applied.push(field);
          else result.skipped.push({ field: field, reason: "발주오라가 판매 상태 칸(" + STATUS_KEYS[field] + ")을 받지 않았습니다." });
        });
      } catch (statusError) {
        if (statusError && statusError.status === 401) throw statusError;
        statusLeft.forEach(function (field) { result.skipped.push({ field: field, reason: describeError(statusError) }); });
      }
    }

    // 신규 등록 때 복사할 발주오라 상품 고르기(1.8.0, 2026-11-25 프로세스 점검): 새 상품은 복사한 상품의 매입처 줄(매입처·매입원가·매입배송정책)을
    // 그대로 쓰므로, 매입처가 다른 상품을 복사하면 발주가 엉뚱한 매입처로 갑니다. 복사할 상품의 기본 매입처가 DB센터 매입처명과 같은지 보고,
    // 다르면 발주오라에서 같은 매입처 상품을 찾아 복사합니다. 같은 매입처 상품이 없으면 등록하지 않고 이유를 알립니다.
    // 복사할 상품 상세는 같은 작업에서 한 번만 읽습니다(같은 매입처 새 상품이 여러 개면 같은 상품을 복사함, 읽은 값은 고치지 않고 복사해 씀).
    function templateDetail(context, id) {
      if (!context.templateCache) context.templateCache = {};
      if (!context.templateCache[id]) {
        context.templateCache[id] = getDetail(id).catch(function (error) {
          delete context.templateCache[id];
          throw error;
        });
      }
      return context.templateCache[id];
    }

    async function pickCreateTemplate(item, context) {
      var wantKey = supplierNameKey(item.supplierName);
      var template = null;
      if (item.templateId) {
        // 복사할 상품을 발주오라에서 지웠으면(404) 같은 매입처 상품을 찾아봅니다. 그 밖의 오류(로그인 만료 등)는 그대로 멈춥니다.
        try { template = await templateDetail(context, item.templateId); } catch (error) { if (!error || error.status !== 404) throw error; }
      }
      // DB센터 상품에 매입처가 없으면 비교할 수 없어 설정 복사용 상품을 그대로 씁니다(예전과 같음).
      if (!wantKey) {
        if (!template) throw SyncError("새 상품의 매입처·배송정책을 복사할 발주오라 상품이 없습니다. DB센터 동기화 설정에서 '설정 복사용 상품코드'를 정하거나, 같은 매입처 상품을 먼저 연결해 주세요.");
        return template;
      }
      var templateName = template ? defaultSupplierName(template) : null;
      if (template && templateName && supplierNameKey(templateName) === wantKey) return template;
      // 매입처 이름을 읽지 못했어도 DB센터에서 같은 매입처로 연결된 상품이면 그대로 씁니다.
      if (template && !templateName && item.templateMatch === "supplier") return template;
      var sameId = context.supplierTemplates ? context.supplierTemplates[wantKey] : null;
      if (sameId && (!template || sameId !== template.id)) {
        var same = await templateDetail(context, sameId);
        var sameName = defaultSupplierName(same);
        if (isObject(same) && (!sameName || supplierNameKey(sameName) === wantKey)) return same;
      }
      throw SyncError("발주오라에 '" + item.supplierName + "' 매입처 상품이 없어 신규 등록을 멈췄습니다" + (templateName ? "(설정 복사용 상품의 매입처는 '" + templateName + "')" : "") + ". 다른 매입처로 등록되면 발주가 엉뚱한 매입처로 갑니다. 발주오라에서 이 매입처를 만들고 첫 상품을 1개 직접 등록한 뒤, DB센터에서 '발주오라 상품 불러오기(비교)'를 하고 다시 동기화해 주세요.");
    }

    async function pushItem(item, plan, context, code) {
      var result = { productId: item.productId, action: item.action, ok: false, baljuoraId: item.baljuoraId, code: item.code, applied: [], skipped: [], snapshot: null, error: null };
      // 상세를 읽은 뒤 이 상품에 보낸 저장 요청 수(상품 3개를 함께 보내도 이 상품 것만 셈) — 하나도 없으면 다시 읽지 않습니다.
      var writesAtDetail = null;
      try {
        var id = item.baljuoraId;
        var detail;
        var fields = item.fields.slice();
        if (item.action === "create") {
          // 같은 상품코드가 이미 발주오라에 있으면 새로 만들지 않습니다(중복 등록 방지).
          if (context.existingCodes && item.code && context.existingCodes[String(item.code).toUpperCase()]) {
            throw SyncError("발주오라에 같은 상품코드(" + item.code + ")가 이미 있습니다. DB센터에서 '발주오라 상품 불러오기'를 다시 한 뒤 동기화해 주세요.");
          }
          // 발주오라는 상품명이 같은 상품을 새로 받지 않습니다("이미 존재하는 상품 명 입니다", 2026-11-27 운영). 보내기 전에 알아보고 고칠 방법을 알립니다.
          var sameName = context.existingNames ? context.existingNames[productNameKey(item.values.name || item.name)] : null;
          if (sameName) throw SyncError(duplicateNameMessage(item, sameName));
          var template = await pickCreateTemplate(item, context);
          var body = buildCreateBody(template, item);
          var created;
          try {
            created = unwrap(await sendAdaptive("POST", "products", body, writable(template)));
          } catch (createError) {
            if (createError && createError.status === 400 && messagesOf(createError).some(function (message) { return /이미\s*존재하는\s*상품\s*명/.test(message); })) throw SyncError(duplicateNameMessage(item, null));
            throw createError;
          }
          if (!state.structure.productCreate) state.structure.productCreate = structureOf(created);
          id = isObject(created) ? created.id || (isObject(created.product) ? created.product.id : null) : null;
          if (typeof id !== "string") throw SyncError("발주오라가 새 상품 id를 돌려주지 않았습니다. 발주오라 상품 목록에서 등록됐는지 확인해 주세요.");
          result.baljuoraId = id;
          ["name", "supplyPrice", "consumerPrice", "purchaseCost", "category"].forEach(function (field) {
            var key = field === "category" ? categoryKeyOf(template) : field;
            if (key in body && fields.indexOf(field) >= 0) result.applied.push(field);
          });
          // 상품 정보 칸은 등록 본문에 넣어 보내고, 등록 뒤 다시 읽은 값과 비교해(applyExtras) 같으면 반영됨, 발주오라가 등록 때
          // 받지 않았거나 조용히 버린 칸만 PUT products/:id(판매 상태는 /status)로 한 번 더 보냅니다.
          fields = fields.filter(function (field) { return result.applied.indexOf(field) < 0; });
          detail = await getDetail(id);
        } else {
          if (!id) throw SyncError("연결된 발주오라 상품이 없습니다.");
          detail = await getDetail(id);
        }
        writesAtDetail = state.writesById[id] || 0;
        if (isObject(detail) && groupArrayKeys(detail).length === 0) await discoverProductForm(id);
        var priceFields = fields.filter(function (field) { return PRICE_FIELDS.indexOf(field) >= 0; });
        var infoFields = fields.filter(function (field) { return INFO_FIELDS.indexOf(field) >= 0; });
        // 가격과 상품 정보는 따로 저장합니다. 한쪽이 실패해도 다른 쪽에서 반영된 칸은 '반영됨'으로 남기고, 실패한 칸만 사유와 함께 알립니다.
        var markFailed = function (list, error) {
          var reason = describeError(error);
          list.forEach(function (field) {
            if (result.applied.indexOf(field) < 0 && !result.skipped.some(function (entry) { return entry.field === field; })) result.skipped.push({ field: field, reason: reason });
          });
        };
        if (priceFields.length) {
          try { await applyPricing(id, detail, item, priceFields, result, context); } catch (error) { if (error && error.status === 401) throw error; markFailed(priceFields, error); }
        }
        if (infoFields.length) {
          try { await applyInfo(id, detail, item, infoFields, result, context); } catch (error) { if (error && error.status === 401) throw error; markFailed(infoFields, error); }
        }
        var checks = {};
        // 카테고리는 상품명 저장(…/info, 지금 카테고리를 함께 보냄) 뒤에 상품 수정(PUT products/:id)으로 보냅니다.
        if (fields.indexOf("category") >= 0) {
          try { await applyCategory(id, detail, item, result, context, checks); } catch (error) { if (error && error.status === 401) throw error; markFailed(["category"], error); }
        }
        if (fields.indexOf("image") >= 0) {
          try { await applyImage(id, detail, item, result, code, checks); } catch (error) { if (error && error.status === 401) throw error; markFailed(["image"], error); }
        }
        if (fields.indexOf("shippingPolicy") >= 0) {
          try { await applyShipping(id, detail, item, result); } catch (error) { if (error && error.status === 401) throw error; markFailed(["shippingPolicy"], error); }
        }
        var extraFields = fields.filter(function (field) { return EXTRA_FIELDS.indexOf(field) >= 0; });
        if (extraFields.length) {
          try { await applyExtras(id, detail, item, extraFields, result); } catch (error) { if (error && error.status === 401) throw error; markFailed(extraFields, error); }
        }
        // 상세를 읽은 뒤 이 상품에 저장 요청을 하나도 보내지 않았으면(모든 칸이 이미 같음) 방금 읽은 상세를 그대로 써서 발주오라 요청을 줄입니다.
        var untouched = writesAtDetail !== null && (state.writesById[id] || 0) === writesAtDetail;
        var after = normalizeProduct(untouched && isObject(detail) ? detail : await getDetail(id), context);
        if (after) {
          verifyApplied(result, item, after, checks);
          result.snapshot = after;
          result.code = after.code || result.code;
        }
        // 수강생 단가(황금농부 그룹 공급가)·카테고리를 저장하지 못했으면 다음 고칠 때 쓸 수 있게 발주오라 저장 코드를 찾아 둡니다.
        if (result.skipped.some(function (entry) { return entry.field === "groupPrice"; })) await discoverProductForm(id);
        else if (item.action === "update" && result.skipped.some(function (entry) { return entry.field === "category"; })) await discoverProductForm(id, ["categoryIds", "categories"]);
        result.ok = result.applied.length > 0 || item.action === "create";
        if (!result.ok && !result.error) result.error = result.skipped.map(function (entry) { return entry.reason; }).join(" / ") || "바뀐 칸이 없습니다.";
      } catch (error) {
        result.error = describeError(error);
      }
      return result;
    }

    async function runPush(plan, report, code) {
      var current = { done: 0, total: plan.items.length, label: "" };
      watchThrottle(report, current);
      report.progress(0, plan.items.length, "발주오라 매출처 그룹을 확인하는 중…");
      var group = plan.groupId ? { id: plan.groupId, name: plan.groupKeyword } : null;
      if (plan.items.some(function (item) { return item.fields.indexOf("groupPrice") >= 0; }) && !group) group = await findGroup(plan.groupKeyword);
      var context = { group: group, groupKeyword: plan.groupKeyword, existingCodes: null, supplierTemplates: null, createdCategories: {}, preserveCategoryIds: null };
      var categoriesNow = null;
      // 1) DB센터 → 발주오라 상품 카테고리 맞추기(추가·이름 바꾸기)를 상품보다 먼저 합니다.
      if (isObject(plan.categoryTree) && Array.isArray(plan.categoryTree.ops) && plan.categoryTree.ops.length > 0) {
        report.progress(0, plan.items.length, "발주오라 상품 카테고리를 맞추는 중…");
        var treeResult = await applyCategoryTree(plan.categoryTree);
        context.createdCategories = Object.assign({}, treeResult.created);
        categoriesNow = treeResult.flat;
        var treeLine = "카테고리 맞추기: 반영 " + treeResult.applied.length + "건" + (treeResult.skipped.length ? " · 못 한 것 " + treeResult.skipped.length + "건" : "");
        report.log((treeResult.error || treeResult.skipped.length ? "✕ " : "✓ ") + treeLine + (treeResult.error ? " — " + treeResult.error : ""), Boolean(treeResult.error || treeResult.skipped.length));
        treeResult.skipped.slice(0, 5).forEach(function (entry) { report.log("  · " + entry.name + ": " + entry.reason, true); });
        await sendResults(report, { final: false, items: [], categoryTree: { applied: treeResult.applied, skipped: treeResult.skipped, created: treeResult.created, categories: treeResult.categories, error: treeResult.error } });
      }
      // 2) 상품 카테고리를 보낼 때 상품에 붙은 브랜드별 아래 카테고리는 지우지 않게 지금 발주오라 트리에서 찾아 둡니다.
      if (plan.items.some(function (item) { return item.fields.indexOf("category") >= 0; })) {
        if (!categoriesNow) categoriesNow = await loadCategories();
        context.preserveCategoryIds = excludedTreeIds(categoriesNow || [], plan.categoryExclude || ["브랜드별"]);
        // 지금 카테고리가 연결 카테고리의 아래 카테고리인지 보고(보내지 않음), 오류 문구에 카테고리 이름을 쓰려고 트리를 둡니다.
        context.categoryFlat = categoriesNow || [];
      }
      if (plan.items.some(function (item) { return item.action === "create"; })) {
        report.progress(0, plan.items.length, "같은 상품코드·같은 매입처 상품이 발주오라에 있는지 확인하는 중…");
        var listed = await listAllProducts();
        context.existingCodes = {};
        // 상품명 → 그 이름의 발주오라 상품(발주오라는 같은 이름 상품을 새로 받지 않음, 1.9.2)
        context.existingNames = {};
        // 매입처(이름) → 그 매입처의 발주오라 상품 id: 신규 등록 때 같은 매입처 상품을 복사합니다(묶음 상품 제외).
        context.supplierTemplates = {};
        listed.forEach(function (record) {
          if (!isObject(record)) return;
          var found = firstString(record, CODE_KEYS);
          if (found) context.existingCodes[found.value.toUpperCase()] = record.id;
          var nameKey = productNameKey(record.name);
          if (nameKey && !context.existingNames[nameKey]) context.existingNames[nameKey] = { id: typeof record.id === "string" ? record.id : null, code: found ? found.value : null };
          if (typeof record.id !== "string" || record.targetType === "bundle" || record.type === "bundle" || record.productType === "bundle") return;
          var key = supplierNameKey(defaultSupplierName(record));
          if (key && !context.supplierTemplates[key]) context.supplierTemplates[key] = record.id;
        });
      }
      var summary = { ok: 0, failed: 0 };
      var order = {};
      plan.items.forEach(function (entry, position) { order[entry.productId] = position; });
      var queue = createResultQueue(report, order);
      var concurrency = Math.max(1, Math.min(PUSH_CONCURRENCY, plan.items.length));
      var nextIndex = 0;
      var finished = 0;
      // 상품 3개를 함께 처리합니다(각 상품 안의 요청 순서는 그대로, 모든 요청은 같은 간격·429 쉬기를 함께 지킴).
      // DB센터에 결과를 보내지 못하면(취소·만료 등) 새 상품은 더 시작하지 않습니다.
      async function worker() {
        while (nextIndex < plan.items.length && !queue.error) {
          var index = nextIndex;
          nextIndex += 1;
          var item = plan.items[index];
          current.done = finished;
          current.label = (index + 1) + " / " + plan.items.length + " " + item.name;
          report.progress(finished, plan.items.length, (item.action === "create" ? "신규 등록 " : "수정 ") + (index + 1) + " / " + plan.items.length + " · " + item.name);
          var result;
          try {
            result = await pushItem(item, plan, context, code);
          } catch (error) {
            result = { productId: item.productId, action: item.action, ok: false, baljuoraId: item.baljuoraId, code: item.code, applied: [], skipped: [], snapshot: null, error: describeError(error) };
          }
          finished += 1;
          if (result.ok) summary.ok += 1; else summary.failed += 1;
          report.log((result.ok ? "✓ " : "✕ ") + item.name + (result.ok ? "" : " — " + result.error), !result.ok);
          queue.add(result);
        }
      }
      var workers = [];
      for (var slot = 0; slot < concurrency; slot += 1) workers.push(worker());
      await Promise.all(workers);
      await queue.finish({ diagnostics: diagnostics({ group: group, items: plan.items.length, ok: summary.ok, failed: summary.failed, concurrency: concurrency }) });
      report.progress(plan.items.length, plan.items.length, "완료: 성공 " + summary.ok + "개 · 실패 " + summary.failed + "개");
      return summary;
    }

    // DB센터로 결과 보내기: 일시 오류(연결 끊김·DB센터 5xx·429)는 1·3·8초 뒤 다시 보냅니다(상품 결과·연결·판매 줄은 같은 것을 두 번 받아도 한 번으로 저장).
    // 마지막 결과를 다시 보냈는데 '이미 끝난 작업'(409)이면 앞서 보낸 것이 저장된 것이라 그대로 끝냅니다. 취소·만료(409)·없는 작업(404)은 바로 멈춥니다.
    async function sendResults(report, body) {
      for (var attempt = 0; ; attempt += 1) {
        try {
          state.stats.resultPosts += 1;
          return await report.results(body);
        } catch (error) {
          var status = error && typeof error.status === "number" ? error.status : 0;
          if (attempt > 0 && body && body.final && status === 409) return null;
          var transient = status === 0 || status === 408 || status === 429 || status >= 500;
          if (!transient || attempt >= RESULT_RETRY_WAITS_MS.length) throw error;
          state.stats.resultRetries += 1;
          await sleep(RESULT_RETRY_WAITS_MS[attempt]);
        }
      }
    }

    // 상품 결과를 모았다가(20개 또는 4초마다) 한 번에 하나씩 DB센터로 보냅니다. 보내는 동안에도 발주오라 쪽 상품 처리는 계속하고,
    // 마지막에 남은 결과와 진단 정보를 함께 보냅니다(order: 상품 id → 작업 순서, 같은 묶음 안에서 작업 순서대로).
    function createResultQueue(report, order) {
      var queue = { pending: [], chain: Promise.resolve(), busy: false, error: null, lastAt: clock() };
      function take() {
        var items = queue.pending.splice(0, queue.pending.length);
        if (order) items.sort(function (a, b) { return (order[a.productId] || 0) - (order[b.productId] || 0); });
        return items;
      }
      queue.add = function (result) {
        queue.pending.push(result);
        if (!queue.busy && !queue.error && (queue.pending.length >= RESULT_BATCH_SIZE || clock() - queue.lastAt >= RESULT_FLUSH_MS)) queue.send();
      };
      queue.send = function () {
        var items = take();
        if (items.length === 0) return;
        queue.busy = true;
        queue.lastAt = clock();
        queue.chain = queue.chain.then(function () {
          return sendResults(report, { final: false, items: items });
        }).then(function () {
          queue.busy = false;
          queue.lastAt = clock();
        }, function (error) {
          queue.busy = false;
          queue.error = error;
        });
      };
      queue.finish = async function (body) {
        await queue.chain;
        if (queue.error) throw queue.error;
        return sendResults(report, Object.assign({ final: true, items: take() }, body));
      };
      return queue;
    }

    function diagnostics(extra) {
      var discovery = state.discovery || state.categoryDiscovery ? Object.assign({}, state.discovery || {}, state.categoryDiscovery ? { categoryPage: state.categoryDiscovery } : {}) : undefined;
      // throttled: 429(요청이 너무 많음)로 쉰 횟수, gapMs: 마지막 요청 간격 — 서버 로그로 발주오라 요청 제한을 확인합니다.
      // stats(1.9.2): 발주오라 요청 수·저장 요청 수·평균/최대 응답 시간·429로 함께 쉰 시간·동시 처리 수·DB센터 결과 보내기 횟수, 요청 제한 머리글 이름(값 없음)
      var stats = {
        requests: state.stats.requests,
        writes: state.writes,
        avgMs: state.stats.requests > 0 ? Math.round(state.stats.totalMs / state.stats.requests) : 0,
        maxMs: Math.round(state.stats.maxMs),
        pausedSeconds: Math.round(state.stats.pausedMs / 1000),
        floorMs: state.floorMs,
        concurrency: extra && typeof extra.concurrency === "number" ? extra.concurrency : 1,
        resultPosts: state.stats.resultPosts,
        resultRetries: state.stats.resultRetries,
        rateHeaders: Object.keys(state.stats.rateHeaders).slice(0, 8)
      };
      return { version: VERSION, at: new Date().toISOString(), structure: state.structure, endpoints: state.endpoints, errors: state.errors.slice(0, 30), extra: extra || {}, discovery: discovery, throttled: state.throttled, gapMs: state.gapMs, stats: stats };
    }

    return { api: api, refreshToken: refreshToken, runCompare: runCompare, runPush: runPush, runSales: runSales, listAll: listAll, pushItem: pushItem, diagnostics: diagnostics, state: state };
  }

  // ─── 입금·정산 반영 도우미(2026-11-23 관리자 요청) ─────────────────────────────
  // 발주오라 정산 관리 > 입/출금 계좌 조회 화면에서 관리자가 손으로 하던 순서를 그 화면의 버튼으로 그대로 합니다:
  //   계좌내역 조회 → (수집 중…) → 업체구분·거래처명이 모두 들어간 '정산 대기' 건만 체크 → 정산 반영 처리 → 확인 창 "적용하기"
  // 발주오라 내부 주소를 직접 부르지 않고 화면의 버튼을 누르므로, 발주오라 화면의 검사·확인 창(registerLedger
  // "선택한 업체구분에 따라 매출처관리대장 / 매입처관리대장에 적용 됩니다")을 그대로 거칩니다.
  // 반영 전에 패널에 반영할 건(일시·입금/출금·업체구분·거래처·예금주·금액)을 보여 주고 관리자가 한 번 더 눌러야 반영하며,
  // 업체구분이나 거래처명이 비어 있는 건은 건드리지 않고 "직접 확인할 건"으로 알려 줍니다. 패널을 닫으면 반영하지 않습니다.

  var SETTLE = {
    pageTitle: "입/출금 계좌 조회",
    menu: "정산 관리",
    collect: "계좌내역 조회",
    collecting: /^수집\s*중/,
    apply: "정산 반영 처리",
    confirm: /^(적용하기|적용)$/,
    waiting: /정산\s*대기\s*([\d,]+)\s*건/
  };
  var SETTLE_HEADERS = {
    at: ["입/출금 일시", "입출금 일시", "거래 일시", "일시"],
    kind: ["구분"],
    partnerType: ["업체구분"],
    partnerName: ["거래처명", "거래처"],
    depositor: ["상대계좌 예금주명", "예금주명"],
    amount: ["금액"]
  };
  var SETTLE_TIMING = { poll: 300, page: 15000, start: 5000, collect: 180000, settle: 1500, enable: 5000, dialog: 6000, verify: 30000 };
  var PLACEHOLDER_VALUE = /^(선택|선택하세요|선택해 ?주세요|-|없음|미지정)$/;

  function cleanText(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  // 발주오라 화면에 보이는 요소인지(숨김·우리 패널 안은 제외)
  function isPageElement(win, element, allowHidden) {
    if (!element || element.isConnected === false) return false;
    for (var node = element; node && node.nodeType === 1; node = node.parentElement) {
      if (node.id === "doogo-sync-panel") return false;
      if (allowHidden) continue;
      if (node.hidden || node.getAttribute("aria-hidden") === "true") return false;
      var style = win.getComputedStyle ? win.getComputedStyle(node) : null;
      if (style && (style.display === "none" || style.visibility === "hidden")) return false;
    }
    return true;
  }

  function textMatches(text, matcher) {
    return typeof matcher === "string" ? text === matcher : matcher.test(text);
  }

  function findControl(win, matcher, selector, allowHidden) {
    var nodes = win.document.querySelectorAll(selector || "button, [role='button'], a");
    for (var index = 0; index < nodes.length; index += 1) {
      var node = nodes[index];
      if (textMatches(cleanText(node.textContent), matcher) && isPageElement(win, node, allowHidden)) return node;
    }
    return null;
  }

  function findControls(win, matcher) {
    var found = [];
    var nodes = win.document.querySelectorAll("button, [role='button']");
    for (var index = 0; index < nodes.length; index += 1) {
      if (textMatches(cleanText(nodes[index].textContent), matcher) && isPageElement(win, nodes[index])) found.push(nodes[index]);
    }
    return found;
  }

  function isEnabled(node) {
    return Boolean(node) && !node.disabled && node.getAttribute("aria-disabled") !== "true";
  }

  function waitFor(check, timeoutMs, intervalMs) {
    return new Promise(function (resolve) {
      var started = Date.now();
      (function tick() {
        var value = null;
        try { value = check(); } catch { value = null; }
        if (value) return resolve(value);
        if (Date.now() - started >= timeoutMs) return resolve(null);
        setTimeout(tick, intervalMs || SETTLE_TIMING.poll);
      })();
    });
  }

  function pause(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // 표 칸의 선택값(업체구분·거래처명): 기본 선택칸 → 입력칸 값 → 콤보박스 글자 → 칸 글자
  function controlValue(cell) {
    if (!cell) return "";
    var select = cell.querySelector("select");
    if (select) {
      var options = Array.prototype.slice.call(select.querySelectorAll("option"));
      var option = options.filter(function (node) { return node.selected; })[0] || (typeof select.selectedIndex === "number" && select.selectedIndex >= 0 ? options[select.selectedIndex] : null);
      return cleanText(option ? option.textContent : select.value);
    }
    var inputs = cell.querySelectorAll("input");
    for (var index = 0; index < inputs.length; index += 1) {
      var input = inputs[index];
      if (input.type === "checkbox" || input.type === "hidden" || input.type === "radio") continue;
      if (cleanText(input.value)) return cleanText(input.value);
    }
    var combo = cell.querySelector("[role='combobox'], button");
    if (combo && cleanText(combo.textContent)) return cleanText(combo.textContent);
    return cleanText(cell.textContent);
  }

  function hasValue(value) {
    return Boolean(value) && !PLACEHOLDER_VALUE.test(value);
  }

  // 머리글은 "상대계좌<br>예금주명"처럼 줄을 바꿔 쓰면 글자가 붙어 읽히므로 띄어쓰기를 빼고 비교합니다.
  function headerIndex(headers, names) {
    var compact = headers.map(function (text) { return text.replace(/\s+/g, ""); });
    for (var index = 0; index < names.length; index += 1) {
      var found = compact.indexOf(names[index].replace(/\s+/g, ""));
      if (found >= 0) return found;
    }
    return -1;
  }

  // 칸 글자: 줄바꿈(<br>)·블록 사이는 띄어 읽습니다("2026-11-23<br>14:11:08" → "2026-11-23 14:11:08").
  function readableText(node) {
    if (!node) return "";
    var out = "";
    Array.prototype.forEach.call(node.childNodes || [], function (child) {
      if (child.nodeType === 3) out += child.nodeValue;
      else if (child.nodeType === 1) {
        if (child.tagName === "BR") out += " ";
        else if (/^(DIV|P|LI|TR|TD|TH)$/.test(child.tagName)) out += " " + readableText(child) + " ";
        else out += readableText(child);
      }
    });
    return cleanText(out);
  }

  function rowCells(row) {
    return Array.prototype.filter.call(row.children || [], function (cell) { return cell.tagName === "TD" || cell.tagName === "TH"; });
  }

  // 입/출금 표 읽기: 머리 줄 글자로 칸 위치를 찾고(업체구분·거래처명 필수), 체크칸이 있는 줄만 거래로 봅니다.
  function readBankTable(win) {
    var tables = win.document.querySelectorAll("table");
    for (var tableIndex = 0; tableIndex < tables.length; tableIndex += 1) {
      var table = tables[tableIndex];
      if (!isPageElement(win, table)) continue;
      var allRows = Array.prototype.filter.call(table.querySelectorAll("tr"), function (row) { return row.closest("table") === table; });
      var headRow = table.querySelector("thead tr") || allRows[0];
      if (!headRow) continue;
      var headers = rowCells(headRow).map(function (cell) { return readableText(cell); });
      var columns = {};
      Object.keys(SETTLE_HEADERS).forEach(function (key) { columns[key] = headerIndex(headers, SETTLE_HEADERS[key]); });
      if (columns.partnerType < 0 || columns.partnerName < 0) continue;
      var rows = [];
      allRows.forEach(function (row) {
        if (row === headRow || row.closest("thead")) return;
        var checkbox = row.querySelector("input[type='checkbox']");
        if (!checkbox) return;
        var cells = rowCells(row);
        var text = function (key) { return columns[key] >= 0 && cells[columns[key]] ? readableText(cells[columns[key]]) : ""; };
        var item = {
          row: row,
          checkbox: checkbox,
          at: text("at"),
          kind: text("kind"),
          partnerType: controlValue(cells[columns.partnerType]),
          partnerName: controlValue(cells[columns.partnerName]),
          depositor: text("depositor"),
          amount: toNumber(text("amount"))
        };
        item.signature = [item.at, item.kind, item.amount, item.depositor].join("|");
        item.missing = [];
        if (!hasValue(item.partnerType)) item.missing.push("업체구분");
        if (!hasValue(item.partnerName)) item.missing.push("거래처명");
        item.eligible = item.missing.length === 0 && !checkbox.disabled;
        rows.push(item);
      });
      return { table: table, rows: rows, columns: columns };
    }
    return null;
  }

  // 위쪽 요약 칸 "정산 대기 N 건"(우리 패널 글자는 빼고 읽음)
  function readWaitingCount(win) {
    var body = win.document.body;
    if (!body) return null;
    var text = "";
    Array.prototype.forEach.call(body.children, function (child) { if (child.id !== "doogo-sync-panel") text += " " + child.textContent; });
    var match = SETTLE.waiting.exec(cleanText(text));
    return match ? toNumber(match[1]) : null;
  }

  function isBankPage(win) {
    return Boolean(findControl(win, SETTLE.collect) || findControl(win, SETTLE.collecting));
  }

  function formatWon(value) {
    return typeof value === "number" ? value.toLocaleString("ko-KR") + "원" : "금액 확인";
  }

  function describeBankRow(item) {
    return [item.at || "일시 없음", item.kind || "", hasValue(item.partnerType) ? item.partnerType : "업체구분 없음", hasValue(item.partnerName) ? item.partnerName : "거래처 없음"].filter(Boolean).join(" · ") + (item.depositor ? " (예금주 " + item.depositor + ")" : "") + " · " + formatWon(item.amount);
  }

  function summarizeBankRows(rows) {
    var groups = {};
    rows.forEach(function (item) {
      var key = item.kind || "기타";
      groups[key] = groups[key] || { count: 0, amount: 0 };
      groups[key].count += 1;
      groups[key].amount += item.amount || 0;
    });
    return Object.keys(groups).map(function (key) { return key + " " + groups[key].count + "건 " + formatWon(groups[key].amount); }).join(" · ");
  }

  function createSettlementHelper(win, timingOverride) {
    var timing = Object.assign({}, SETTLE_TIMING, timingOverride || {});

    // 입/출금 계좌 조회 화면이 아니면 왼쪽 메뉴의 링크를 눌러 이동합니다(발주오라는 화면 안에서 이동해 이 스크립트가 유지됨).
    async function openBankPage() {
      if (isBankPage(win)) return true;
      var link = findControl(win, SETTLE.pageTitle, "a[href], [role='link'], button") || findControl(win, SETTLE.pageTitle, "a[href], [role='link'], button", true);
      if (!link) {
        var menu = findControl(win, SETTLE.menu, "a, button, [role='button']");
        if (menu) {
          menu.click();
          link = await waitFor(function () { return findControl(win, SETTLE.pageTitle, "a[href], [role='link'], button", true); }, 2000, timing.poll);
        }
      }
      if (!link) return false;
      link.click();
      return Boolean(await waitFor(function () { return isBankPage(win); }, timing.page, timing.poll));
    }

    // 계좌내역 조회 → "수집 중…"이 끝나 버튼이 다시 눌리는 상태가 될 때까지 기다립니다.
    async function collect() {
      var button = await waitFor(function () { return findControl(win, SETTLE.collect) || findControl(win, SETTLE.collecting); }, timing.page, timing.poll);
      if (!button) throw SyncError("'계좌내역 조회' 버튼을 찾지 못했습니다. 발주오라 정산 관리 > 입/출금 계좌 조회 화면에서 책갈피를 다시 눌러 주세요.");
      if (textMatches(cleanText(button.textContent), SETTLE.collect) && isEnabled(button)) {
        var before = findControls(win, "확인");
        var newConfirm = function () { return findControls(win, "확인").filter(function (node) { return before.indexOf(node) < 0; })[0] || null; };
        button.click();
        // "수집 중…"으로 바뀌거나, 발주오라가 확인 창을 띄우면 새로 생긴 '확인'만 누릅니다(화면에 원래 있던 버튼은 건드리지 않음).
        var started = await waitFor(function () {
          var ok = newConfirm();
          if (ok) return { ok: ok };
          return findControl(win, SETTLE.collecting) ? { collecting: true } : null;
        }, timing.start, timing.poll);
        if (started && started.ok) {
          started.ok.click();
          await waitFor(function () { return findControl(win, SETTLE.collecting); }, timing.start, timing.poll);
        }
      }
      var finished = await waitFor(function () {
        var node = findControl(win, SETTLE.collect);
        return isEnabled(node) && !findControl(win, SETTLE.collecting) ? node : null;
      }, timing.collect, timing.poll);
      if (!finished) throw SyncError("계좌내역 수집이 " + Math.max(1, Math.round(timing.collect / 60000)) + "분 안에 끝나지 않았습니다. 발주오라 화면에서 수집이 끝난 뒤 책갈피를 다시 눌러 주세요.");
      await pause(timing.settle);
    }

    // 고른 건만 체크 → 정산 반영 처리 → 확인 창 '적용하기' → 정산 대기 목록에서 사라졌는지 확인
    async function apply(rows) {
      var wanted = {};
      rows.forEach(function (item) { wanted[item.signature] = true; });
      var table = readBankTable(win);
      if (!table) throw SyncError("입/출금 목록 표를 찾지 못했습니다.");
      table.rows.forEach(function (item) {
        var shouldCheck = Boolean(wanted[item.signature]) && item.eligible;
        if (Boolean(item.checkbox.checked) !== shouldCheck) item.checkbox.click();
      });
      await pause(timing.poll);
      var checked = (readBankTable(win) || { rows: [] }).rows.filter(function (item) { return item.checkbox.checked; });
      if (checked.some(function (item) { return !wanted[item.signature]; })) throw SyncError("반영하지 않을 건이 함께 선택돼 멈췄습니다. 발주오라 화면을 새로고침한 뒤 다시 실행해 주세요.");
      if (checked.length < rows.length) throw SyncError("반영할 건을 모두 선택하지 못했습니다(" + checked.length + " / " + rows.length + "). 발주오라 화면을 새로고침한 뒤 다시 실행해 주세요.");
      var applyButton = await waitFor(function () { var node = findControl(win, SETTLE.apply); return isEnabled(node) ? node : null; }, timing.enable, timing.poll);
      if (!applyButton) throw SyncError("'정산 반영 처리' 버튼이 눌리지 않습니다. 발주오라 화면을 확인해 주세요.");
      applyButton.click();
      var confirmButton = await waitFor(function () { return findControl(win, SETTLE.confirm); }, timing.dialog, timing.poll);
      if (confirmButton) confirmButton.click();
      await waitFor(function () {
        var now = readBankTable(win);
        return now && !now.rows.some(function (item) { return wanted[item.signature]; });
      }, timing.verify, timing.poll);
      var after = readBankTable(win);
      var left = after ? after.rows.filter(function (item) { return wanted[item.signature]; }) : [];
      var leftKeys = {};
      left.forEach(function (item) { leftKeys[item.signature] = true; });
      return { applied: rows.filter(function (item) { return !leftKeys[item.signature]; }), left: left, confirmed: Boolean(confirmButton) };
    }

    return { openBankPage: openBankPage, collect: collect, apply: apply, read: function () { return readBankTable(win); }, waitingCount: function () { return readWaitingCount(win); }, timing: timing };
  }

  // 패널과 함께 전체 순서를 진행합니다. options.confirm(rows)가 없으면 패널 버튼으로 관리자에게 묻습니다.
  async function runSettlement(win, panel, options) {
    var settings = options || {};
    var helper = createSettlementHelper(win, settings.timing);
    var result = { applied: [], left: [], skipped: [], rounds: 0, collected: false, stopped: false };
    panel.status("입/출금 계좌 조회 화면을 확인하는 중…");
    panel.progress(1, 10);
    if (!(await helper.openBankPage())) throw SyncError("입/출금 계좌 조회 화면을 열지 못했습니다. 발주오라 왼쪽 메뉴 정산 관리 > 입/출금 계좌 조회를 연 뒤 책갈피를 다시 눌러 주세요.");
    panel.status("계좌내역을 조회(수집)하는 중… 1~2분 걸릴 수 있어요.");
    panel.progress(3, 10);
    await helper.collect();
    result.collected = true;
    panel.log("계좌내역 조회(수집)를 마쳤습니다.");
    var seen = {};
    for (var round = 0; round < 10; round += 1) {
      if (panel.closed) { result.stopped = true; break; }
      var table = helper.read();
      if (!table) throw SyncError("입/출금 목록 표(업체구분·거래처명 칸)를 찾지 못했습니다. 발주오라 화면이 바뀌었으면 DB센터에 알려 주세요.");
      var waiting = helper.waitingCount();
      if (waiting !== null && table.rows.length > waiting) throw SyncError("지금 표에 정산 대기가 아닌 건도 보입니다(표 " + table.rows.length + "건 · 정산 대기 " + waiting + "건). 위쪽 '정산 대기' 칸을 눌러 대기 건만 보이게 한 뒤 다시 실행해 주세요.");
      var fresh = table.rows.filter(function (item) { return !seen[item.signature]; });
      fresh.forEach(function (item) { seen[item.signature] = true; });
      var eligible = fresh.filter(function (item) { return item.eligible; });
      var skipped = fresh.filter(function (item) { return !item.eligible; });
      result.skipped = result.skipped.concat(skipped);
      skipped.forEach(function (item) { panel.log("직접 확인: " + describeBankRow(item) + " — " + (item.missing.length ? item.missing.join("·") + " 비어 있음" : "선택할 수 없는 건"), true); });
      if (eligible.length === 0) break;
      result.rounds += 1;
      panel.progress(6, 10);
      panel.status("정산 반영할 건 " + eligible.length + "개 · " + summarizeBankRows(eligible));
      eligible.forEach(function (item) { panel.log("반영 예정: " + describeBankRow(item)); });
      var go = settings.confirm ? await settings.confirm(eligible) : (await panel.ask([{ key: "apply", label: eligible.length + "건 정산 반영하기", primary: true }, { key: "stop", label: "그만두기" }])) === "apply";
      if (!go || panel.closed) { result.stopped = true; panel.log("정산 반영을 하지 않았습니다."); break; }
      panel.status(eligible.length + "건 정산 반영 처리 중…");
      panel.progress(8, 10);
      var applied = await helper.apply(eligible);
      result.applied = result.applied.concat(applied.applied);
      result.left = result.left.concat(applied.left);
      applied.applied.forEach(function (item) { panel.log("✓ 반영됨: " + describeBankRow(item)); });
      applied.left.forEach(function (item) { panel.log("✕ 반영 안 됨: " + describeBankRow(item), true); });
      if (applied.left.length > 0) break;
      // 한 쪽(기본 20개)보다 대기 건이 많으면 반영 후 다음 건이 보이므로 한 번 더 확인합니다.
      var remaining = helper.waitingCount();
      if (remaining === null || remaining === 0) break;
    }
    panel.progress(10, 10);
    var parts = [];
    parts.push(result.applied.length ? "정산 반영 " + result.applied.length + "건(" + summarizeBankRows(result.applied) + ")" : "정산 반영한 건 없음");
    if (result.left.length) parts.push("반영 안 됨 " + result.left.length + "건 — 발주오라 화면 안내를 확인해 주세요");
    if (result.skipped.length) parts.push("직접 확인할 건 " + result.skipped.length + "개(업체구분·거래처명을 고른 뒤 정산 반영)");
    panel.status((result.stopped ? "멈춤: " : "완료: ") + parts.join(" · "));
    if (result.applied.some(function (item) { return /매출/.test(item.partnerType); })) panel.log("매출처 입금 건은 발주오라가 매출처관리대장에 반영해 그 매출처의 주문대기 주문을 주문접수로 넘깁니다.");
    return result;
  }

  // ─── 화면(발주오라 창 오른쪽 아래 작은 패널) ─────────────────────────────────

  // 1.12.0: 이 창에 남는 동기화 버튼(아래 installResident)이 켜져 있으면 패널이 보이는 동안 버튼을 숨기고,
  // 패널을 접거나 닫으면 버튼을 다시 보여 줍니다(작업 중이면 버튼에 진행률).
  var activeResident = null;

  function createPanel(doc, options) {
    var settings = options || {};
    var old = doc.getElementById("doogo-sync-panel");
    if (old) old.remove();
    // 작업 패널은 '접기'(오른쪽 아래 동기화 버튼으로 줄어들고 작업은 계속), 고르기·정산 패널은 '닫기'(그만두기)
    var minimizable = Boolean(settings.minimize && activeResident);
    var closeLabel = minimizable ? "접기" : "닫기";
    var panel = doc.createElement("section");
    panel.id = "doogo-sync-panel";
    panel.setAttribute("role", "status");
    panel.style.cssText = "box-sizing:border-box;position:fixed;right:18px;bottom:18px;z-index:2147483647;width:min(420px,calc(100vw - 36px));max-height:70vh;display:flex;flex-direction:column;gap:10px;padding:16px 16px 14px;border:2px solid #163300;border-radius:16px;background:#fff;color:#0e0f0c;box-shadow:0 18px 50px rgba(0,0,0,.25);font:14px/1.5 -apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;";
    panel.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><strong data-title style="font-size:15px"></strong><button type="button" data-close aria-label="' + closeLabel + '" style="border:0;background:#f1f3ef;border-radius:8px;padding:4px 10px;font-size:13px;cursor:pointer">' + closeLabel + '</button></div><p data-status style="margin:0;font-weight:700"></p><div style="height:8px;border-radius:99px;background:#e8ebe6;overflow:hidden"><div data-bar style="height:100%;width:0;background:#9fe870;transition:width .3s"></div></div><ol data-log style="margin:0;padding:0 0 0 18px;overflow:auto;max-height:36vh;font-size:12.5px;color:#454745"></ol><div data-actions style="display:none;flex-wrap:wrap;gap:8px"></div><small data-note style="color:#6b6e6a"></small>';
    panel.querySelector("[data-title]").textContent = settings.title || "두고푸드 DB센터 → 발주오라 동기화";
    panel.querySelector("[data-note]").textContent = settings.note || (minimizable
      ? "끝날 때까지 이 창을 닫지 마세요. '접기'를 누르면 오른쪽 아래 동기화 버튼으로 줄어들고 작업은 계속돼요. 결과는 DB센터 화면에도 그대로 보입니다."
      : "이 창을 닫지 말고 끝날 때까지 기다려 주세요. 결과는 DB센터 동기화 화면에도 그대로 보입니다.");
    doc.body.appendChild(panel);
    var pending = null;
    function changed() { if (activeResident) activeResident.panelChanged(api); }
    var api = {
      closed: false,
      hidden: false,
      percent: null,
      statusText: "",
      element: panel,
      status: function (text) {
        api.statusText = String(text || "");
        panel.querySelector("[data-status]").textContent = text;
        changed();
      },
      progress: function (done, total) {
        var percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 8;
        api.percent = total > 0 ? percent : null;
        panel.querySelector("[data-bar]").style.width = percent + "%";
        changed();
      },
      log: function (text, isError) {
        var line = doc.createElement("li");
        line.textContent = text;
        if (isError) line.style.color = "#c2343f";
        var log = panel.querySelector("[data-log]");
        log.appendChild(line);
        while (log.children.length > 60) log.removeChild(log.firstChild);
        log.scrollTop = log.scrollHeight;
      },
      // 버튼을 보여 주고 누른 버튼의 key를 돌려줍니다(패널을 닫으면 null).
      ask: function (buttons) {
        if (api.hidden) api.show();
        var box = panel.querySelector("[data-actions]");
        box.innerHTML = "";
        box.style.display = "flex";
        return new Promise(function (resolve) {
          pending = resolve;
          buttons.forEach(function (button) {
            var element = doc.createElement("button");
            element.type = "button";
            element.textContent = button.label;
            element.setAttribute("data-action", button.key);
            element.style.cssText = button.primary
              ? "flex:1 1 auto;min-height:40px;border:0;border-radius:10px;padding:8px 14px;background:#163300;color:#9fe870;font-weight:800;font-size:14px;cursor:pointer"
              : "flex:0 0 auto;min-height:40px;border:1px solid #d5dbd1;border-radius:10px;padding:8px 14px;background:#fff;color:#0e0f0c;font-weight:700;font-size:14px;cursor:pointer";
            element.addEventListener("click", function () {
              box.innerHTML = "";
              box.style.display = "none";
              pending = null;
              resolve(button.key);
            });
            box.appendChild(element);
          });
        });
      },
      // 1.12.0: 접은 패널 다시 보기 · 접기(작업은 계속) · 닫기(그만두기 — 묻는 중이면 null)
      show: function () {
        if (api.closed) return;
        if (!panel.parentNode) doc.body.appendChild(panel);
        panel.style.display = "flex";
        api.hidden = false;
        if (activeResident) activeResident.panelShown(api);
      },
      hide: function () {
        if (api.closed) return;
        panel.style.display = "none";
        api.hidden = true;
        if (activeResident) activeResident.panelHidden(api);
      },
      close: function () {
        if (api.closed) return;
        api.closed = true;
        panel.remove();
        if (pending) { var resolve = pending; pending = null; resolve(null); }
        if (activeResident) activeResident.panelHidden(api);
      }
    };
    panel.querySelector("[data-close]").addEventListener("click", function () {
      if (minimizable && !pending) api.hide();
      else api.close();
    });
    if (activeResident) activeResident.panelShown(api);
    return api;
  }

  // ─── 이 창에 남는 동기화 버튼(1.12.0) ────────────────────────────────────────
  // 2026-11-27 관리자 요청 "휴대폰(삼성 인터넷)에서는 책갈피를 누르기 어렵다 — DB센터가 연 발주오라 창 오른쪽 아래에 동기화 아이콘이 있으면".
  // DB센터(다른 사이트)는 브라우저 보안 때문에 발주오라 창 안에서 아무것도 실행할 수 없어, 책갈피(또는 확장 프로그램)를 그 창에서 처음 한 번은
  // 눌러야 합니다. 한 번 누른 창에는 이 파일이 남아:
  //  ① 오른쪽 아래 '동기화' 버튼 — 작업 중이면 진행률(누르면 진행 패널), 쉬는 중이면 할 일 고르기(작업 코드로 동기화 · 입금·정산 반영)
  //  ② DB센터가 같은 창(창 이름 doogo-baljuora)에 주소 뒤 #doogo-sync=코드만 바꿔 보내면(# 뒤만 바뀌면 창이 새로 열리지 않음) 바로 시작
  //     (작업 중이면 끝난 뒤 이어서, #doogo-settle이면 입금·정산 반영 도우미)
  //  ③ 이 창을 연 DB센터 창에 "켜져 있음 · 지금 주소 경로 · 상태"만 알립니다(postMessage, DB센터 주소로만 — 값·토큰 없음).
  //     DB센터는 그 경로로 코드를 보내 발주오라 화면을 옮겨 다닌 뒤에도 창이 새로 열리지 않게 합니다.
  // 책갈피를 다시 누르면 새로 받은 파일이 예전 버튼을 치우고 다시 켭니다(작업 중이면 진행 패널만 다시 보여 줌).
  var RESIDENT_KEY = "__doogoSyncResident";
  var FAB_ID = "doogo-sync-fab";
  var RUNNER_MESSAGE = "doogo-runner";
  var FAB_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/></svg>';
  var FAB_CSS = "#doogo-sync-fab{all:initial;box-sizing:border-box;position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom, 0px));z-index:2147483646;display:inline-flex;align-items:center;gap:8px;min-height:52px;padding:0 18px 0 15px;border:2px solid #9fe870;border-radius:999px;background:#163300;color:#9fe870;font:800 15px/1.2 -apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;letter-spacing:-.01em;box-shadow:0 10px 28px rgba(0,0,0,.28);cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation}"
    + "#doogo-sync-fab[hidden]{display:none}"
    + "#doogo-sync-fab svg{flex:0 0 auto;display:block}"
    + "#doogo-sync-fab span{all:unset;white-space:nowrap}"
    + "#doogo-sync-fab[data-state=running] svg{animation:doogo-sync-spin 1.1s linear infinite}"
    + "#doogo-sync-fab[data-state=done]{background:#9fe870;color:#163300;border-color:#163300}"
    + "#doogo-sync-fab[data-state=error]{background:#fff;color:#c2343f;border-color:#c2343f}"
    + "#doogo-sync-fab:focus-visible{outline:3px solid #2a78d6;outline-offset:3px}"
    + "@keyframes doogo-sync-spin{to{transform:rotate(360deg)}}"
    + "@media (prefers-reduced-motion:reduce){#doogo-sync-fab[data-state=running] svg{animation:none}}";

  function codeKey(code) {
    return String(code || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  }

  function noopResident() {
    return { active: false, panelShown: function () {}, panelHidden: function () {}, panelChanged: function () {}, jobStarted: function () {}, jobEnded: function () {}, flushQueue: function () {}, showPanel: function () { return false; }, check: function () {}, dispose: function () {} };
  }

  function installResident(win, doogoOrigin) {
    var doc = win.document;
    var previous = win[RESIDENT_KEY];
    if (previous && typeof previous.dispose === "function") {
      try { previous.dispose(); } catch { /* 예전 버전 버튼 */ }
    }
    if (!doc || !doc.body || typeof doc.createElement !== "function" || typeof win.addEventListener !== "function") {
      activeResident = null;
      return noopResident();
    }
    var style = doc.getElementById(FAB_ID + "-style");
    if (!style) {
      style = doc.createElement("style");
      style.id = FAB_ID + "-style";
      (doc.head || doc.body).appendChild(style);
    }
    style.textContent = FAB_CSS;
    var stale = doc.getElementById(FAB_ID);
    if (stale) stale.remove();
    var fab = doc.createElement("button");
    fab.type = "button";
    fab.id = FAB_ID;
    fab.innerHTML = FAB_ICON + "<span data-fab-text>동기화</span>";
    doc.body.appendChild(fab);

    var state = { disposed: false, job: "idle", panel: null, queued: null, started: {}, lastResult: "", lastPath: null, ticks: 0, doneTimer: 0, lift: 0 };
    var resident = null;

    function panelVisible() {
      var panel = state.panel;
      return Boolean(panel && !panel.closed && !panel.hidden && panel.element && panel.element.parentNode);
    }

    function render() {
      if (state.disposed) return;
      fab.hidden = panelVisible();
      fab.setAttribute("data-state", state.job);
      var percent = state.panel && typeof state.panel.percent === "number" ? state.panel.percent : null;
      var text = state.job === "running" ? (percent === null ? "동기화 중" : "동기화 " + percent + "%")
        : state.job === "done" ? "동기화 완료"
          : state.job === "error" ? "동기화 확인"
            : "동기화";
      fab.querySelector("[data-fab-text]").textContent = text;
      var label = "두고푸드 " + text + (state.job === "running" ? " · 눌러서 진행 보기" : " · 눌러서 할 일 고르기");
      fab.setAttribute("aria-label", label);
      fab.title = label;
    }

    // DB센터 창(이 창을 연 창)에만 "켜져 있음 · 지금 경로 · 상태"를 알립니다. DB센터 주소가 아니면 브라우저가 버립니다.
    function whereNow() {
      try { return { path: String(win.location.pathname || ""), search: String(win.location.search || "") }; } catch { return { path: "", search: "" }; }
    }

    function beat(kind) {
      if (state.disposed && kind !== "gone") return;
      var where = whereNow();
      state.lastPath = where.path + where.search;
      var opener = null;
      try { opener = win.opener; } catch { opener = null; }
      if (!opener || !doogoOrigin) return;
      try {
        opener.postMessage({ type: RUNNER_MESSAGE, version: VERSION, state: kind || state.job, path: where.path, search: where.search, at: Date.now() }, doogoOrigin);
      } catch { /* DB센터 창이 닫혔거나 다른 사이트로 바뀜 */ }
    }

    function startCode(code) {
      if (state.disposed) return;
      void runSyncJob(win, doogoOrigin, code);
    }

    // 주소 뒤 #doogo-sync=코드(DB센터가 같은 창으로 보낸 새 작업) 또는 #doogo-settle을 봅니다.
    function checkLocation() {
      if (state.disposed) return;
      var hash = "";
      try { hash = String(win.location.hash || ""); } catch { hash = ""; }
      if (/doogo-sync=/.test(hash)) {
        var code = codeFromLocation(win);
        if (!code || state.started[codeKey(code)]) return;
        if (win.__doogoSyncChoosing && state.panel && !state.panel.closed) {
          // 할 일 고르기 패널이 열려 있으면 닫고 DB센터에서 온 작업을 시작합니다(고르기가 끝난 다음 차례에).
          state.panel.close();
          setTimeout(function () { startCode(code); }, 0);
          return;
        }
        if (win.__doogoSyncRunning) {
          if (state.queued !== code) {
            state.queued = code;
            if (state.panel && !state.panel.closed) state.panel.log("DB센터에서 새 작업이 왔어요. 지금 작업이 끝나면 이어서 시작해요.");
          }
          return;
        }
        startCode(code);
        return;
      }
      if (settleRequested(win) && !win.__doogoSyncRunning && !win.__doogoSyncChoosing) void runSettlementMode(win);
    }

    // 발주오라 화면 오른쪽 아래에 고정된 다른 버튼(상담 버튼·아래 메뉴 등)이 있으면 그 위로 올려 가리지 않게 합니다.
    function placeFab() {
      if (state.disposed || fab.hidden) return;
      try {
        var width = win.innerWidth || 0;
        var height = win.innerHeight || 0;
        if (!width || !height || typeof doc.elementsFromPoint !== "function" || typeof win.getComputedStyle !== "function") return;
        var lift = 0;
        var hits = doc.elementsFromPoint(width - 44, height - 44) || [];
        for (var index = 0; index < hits.length && !lift; index += 1) {
          for (var node = hits[index]; node && node !== doc.body && node !== doc.documentElement; node = node.parentElement) {
            if (node === fab || node.id === "doogo-sync-panel") break;
            if (win.getComputedStyle(node).position === "fixed") {
              var rect = node.getBoundingClientRect();
              if (rect.height > 0 && rect.height < height * 0.4) lift = Math.round(height - rect.top) + 12;
              break;
            }
          }
        }
        if (lift !== state.lift) {
          state.lift = lift;
          fab.style.bottom = lift ? lift + "px" : "";
        }
      } catch { /* 자리를 못 재면 기본 자리 */ }
    }

    function tick() {
      if (state.disposed) return;
      state.ticks += 1;
      var where = whereNow();
      if (where.path + where.search !== state.lastPath || state.ticks % 30 === 0) beat();
      if (state.ticks % 5 === 0) placeFab();
      var hash = "";
      try { hash = String(win.location.hash || ""); } catch { hash = ""; }
      if (/doogo-sync=|doogo-settle/.test(hash)) checkLocation();
    }

    async function openMenu() {
      if (state.job === "done" || state.job === "error") { state.job = "idle"; render(); }
      win.__doogoSyncChoosing = true;
      var picked;
      try { picked = await chooseMode(win, { fromFab: true, last: state.lastResult }); } finally { win.__doogoSyncChoosing = false; }
      if (state.disposed || !picked) return;
      if (picked.mode === "settle") return runSettlementMode(win, picked.panel);
      if (picked.mode !== "sync") return;
      var code = readCode(win);
      if (code) startCode(code);
    }

    var onLocation = function () { checkLocation(); };
    var onVisible = function () { if (!doc.hidden) { checkLocation(); beat(); placeFab(); } };
    var onShow = function () { checkLocation(); beat(); };
    var onHide = function () { beat("gone"); };
    var onResize = function () { placeFab(); };
    fab.addEventListener("click", function () {
      if (state.disposed) return;
      if (win.__doogoSyncRunning || win.__doogoSyncChoosing) {
        if (state.panel && !state.panel.closed) state.panel.show();
        return;
      }
      void openMenu();
    });
    win.addEventListener("hashchange", onLocation);
    win.addEventListener("focus", onLocation);
    win.addEventListener("pageshow", onShow);
    win.addEventListener("pagehide", onHide);
    win.addEventListener("resize", onResize);
    if (typeof doc.addEventListener === "function") doc.addEventListener("visibilitychange", onVisible);
    var timer = typeof win.setInterval === "function" ? win.setInterval(tick, 2000) : 0;

    resident = {
      active: true,
      version: VERSION,
      element: fab,
      panelShown: function (panel) {
        if (state.disposed) return;
        state.panel = panel;
        render();
      },
      panelHidden: function (panel) {
        if (state.disposed) return;
        if (panel === state.panel) render();
        placeFab();
      },
      panelChanged: function (panel) {
        if (!state.disposed && panel === state.panel && panel.hidden) render();
      },
      jobStarted: function (code) {
        if (state.disposed) return;
        state.started[codeKey(code)] = true;
        if (state.doneTimer) { clearTimeout(state.doneTimer); state.doneTimer = 0; }
        state.job = "running";
        render();
        beat("running");
      },
      jobEnded: function (outcome, panel) {
        if (state.disposed) return;
        state.job = outcome === "done" ? "done" : "error";
        state.lastResult = (panel && panel.statusText) || "";
        render();
        beat(state.job);
        // '동기화 완료'는 2분 뒤 다시 '동기화'로(오류는 확인할 때까지 남김)
        if (state.job === "done") state.doneTimer = setTimeout(function () { if (state.job === "done") { state.job = "idle"; render(); } }, 120000);
        resident.flushQueue();
      },
      // 작업 중에 DB센터에서 온 다음 작업 코드를 이어서 시작합니다.
      flushQueue: function () {
        if (state.disposed || !state.queued) return;
        var next = state.queued;
        state.queued = null;
        setTimeout(function () {
          if (state.disposed) return;
          if (win.__doogoSyncRunning) state.queued = next;
          else startCode(next);
        }, 400);
      },
      showPanel: function () {
        if (state.panel && !state.panel.closed) { state.panel.show(); return true; }
        return false;
      },
      check: checkLocation,
      state: function () { return { job: state.job, queued: state.queued, lastResult: state.lastResult, lastPath: state.lastPath, lift: state.lift }; },
      dispose: function () {
        if (state.disposed) return;
        state.disposed = true;
        if (timer && typeof win.clearInterval === "function") win.clearInterval(timer);
        if (state.doneTimer) clearTimeout(state.doneTimer);
        win.removeEventListener("hashchange", onLocation);
        win.removeEventListener("focus", onLocation);
        win.removeEventListener("pageshow", onShow);
        win.removeEventListener("pagehide", onHide);
        win.removeEventListener("resize", onResize);
        if (typeof doc.removeEventListener === "function") doc.removeEventListener("visibilitychange", onVisible);
        if (fab.parentNode) fab.remove();
        if (activeResident === resident) activeResident = null;
        if (win[RESIDENT_KEY] === resident) win[RESIDENT_KEY] = null;
      }
    };
    win[RESIDENT_KEY] = resident;
    activeResident = resident;
    render();
    placeFab();
    beat("ready");
    return resident;
  }

  function codeFromLocation(win) {
    var match = /doogo-sync=([0-9A-Za-z-]{10,16})/.exec(win.location.hash || "") || /doogo-sync=([0-9A-Za-z-]{10,16})/.exec(win.location.search || "");
    if (!match) return null;
    try { win.sessionStorage.setItem("doogo-sync-code", match[1]); } catch { /* 저장이 막힌 브라우저 */ }
    // 1.12.0: 발주오라 화면(SPA)의 history.state는 그대로 두고 주소의 코드만 지웁니다.
    try { win.history.replaceState(win.history.state === undefined ? null : win.history.state, "", win.location.pathname + win.location.search.replace(/[?&]doogo-sync=[^&]*/, "")); } catch { /* 무시 */ }
    return match[1];
  }

  function readCode(win) {
    var code = codeFromLocation(win);
    if (code) return code;
    var stored = null;
    try { stored = win.sessionStorage.getItem("doogo-sync-code"); } catch { stored = null; }
    // 발주오라가 로그인 화면 등으로 주소를 바꾸면 #doogo-sync=코드가 사라져 여기서 물어봅니다.
    // 코드는 DB센터 화면의 '작업 코드' 칸에 있고, 그 화면을 새로 열어 안 보이면 '작업 코드 다시 받기'로 새 코드를 받습니다.
    var typed = win.prompt("DB센터 '발주오라 동기화'(또는 판매 현황) 화면의 '작업 코드' 10글자를 넣어 주세요. 예: ABCDE-FGH23\n코드가 안 보이면 그 화면에서 '작업 코드 다시 받기'를 누르세요.", stored || "");
    return typed ? typed.trim() : null;
  }

  // DB센터 "발주오라 정산 화면 열기"로 연 창(#doogo-settle)이거나 입/출금 계좌 조회 화면이면 정산 반영 도우미로 시작합니다.
  function settleRequested(win) {
    return /(^|[#&?])doogo-settle(\b|$)/.test((win.location.hash || "") + "&" + (win.location.search || ""));
  }

  function clearSettleHash(win) {
    if (!/doogo-settle/.test(win.location.hash || "")) return;
    try { win.history.replaceState(win.history.state === undefined ? null : win.history.state, "", win.location.pathname + win.location.search); } catch { /* 무시 */ }
  }

  async function chooseMode(win, options) {
    var settings = options || {};
    var panel = createPanel(win.document, {
      title: "두고푸드 책갈피",
      note: settings.fromFab
        ? "DB센터에서 '주문 동기화'·'상품 동기화'(또는 발주오라 상품 불러오기·동기화)를 누르면 이 창에서 바로 시작돼요. 이 창을 닫지 않으면 책갈피를 다시 누르지 않아도 돼요."
        : "상품 동기화는 DB센터 '발주오라 동기화'에서 작업을 만든 뒤 이 책갈피를 누르면 바로 시작됩니다."
    });
    panel.status("무엇을 할까요?");
    if (settings.last) panel.log("마지막 작업 · " + settings.last);
    if (settings.fromFab) {
      panel.log("작업 코드로 동기화: DB센터 화면의 작업 코드 10글자로 시작(작업이 이 창으로 오지 않았을 때)");
      panel.log("입금·정산 반영: 입/출금 계좌 조회 → 업체구분·거래처가 들어간 정산 대기 건 정산 반영");
    } else {
      panel.log("입금·정산 반영: 입/출금 계좌 조회 → 업체구분·거래처가 들어간 정산 대기 건 정산 반영");
      panel.log("상품 동기화: DB센터에서 받은 작업 코드 10글자로 비교·보내기");
    }
    var mode = await panel.ask(settings.fromFab
      ? [{ key: "sync", label: "작업 코드로 동기화", primary: true }, { key: "settle", label: "입금·정산 반영" }]
      : [{ key: "settle", label: "입금·정산 반영", primary: true }, { key: "sync", label: "상품 동기화(작업 코드)" }]);
    if (mode && mode !== "settle") panel.close();
    return { mode: mode, panel: panel };
  }

  async function runSettlementMode(win, panel) {
    win.__doogoSyncRunning = true;
    clearSettleHash(win);
    var view = panel || createPanel(win.document, { title: "두고푸드 · 입금·정산 반영", note: "발주오라 화면의 버튼을 대신 누릅니다. 반영 전에 목록을 확인하고, 이 창을 닫으면 반영하지 않습니다." });
    if (panel) {
      view.element.querySelector("[data-title]").textContent = "두고푸드 · 입금·정산 반영";
      view.element.querySelector("[data-note]").textContent = "발주오라 화면의 버튼을 대신 누릅니다. 반영 전에 목록을 확인하고, 이 창을 닫으면 반영하지 않습니다.";
    }
    try {
      return await runSettlement(win, view, win.__doogoSettleOptions);
    } catch (error) {
      var message = describeError(error);
      view.status("중단: " + message);
      view.log(message, true);
      return null;
    } finally {
      win.__doogoSyncRunning = false;
      if (activeResident) activeResident.flushQueue();
    }
  }

  // 책갈피 시험(1.12.1, 2026-11-28 관리자 신고 "삼성 인터넷에서는 발주오라 창에 동기화 버튼이 안 생긴다"):
  // 휴대폰은 북마크 목록에서 누르면 실행되지 않거나(삼성 인터넷·크롬은 주소창에서 별(★) 붙은 줄을 눌러야 함) 주소가 잘못 저장되는 일이 있어,
  // 북마크를 만든 뒤 DB센터 화면에서 먼저 눌러 보게 합니다. DB센터 화면이 이 이벤트를 받으면 "책갈피가 잘 작동해요"를 보여 줍니다.
  function bookmarkletTest(win, doogoOrigin) {
    var origin = "";
    try { origin = String(win.location.origin || ""); } catch { origin = ""; }
    if (!doogoOrigin || origin !== doogoOrigin) return false;
    var handled = false;
    try {
      if (typeof win.CustomEvent === "function" && typeof win.dispatchEvent === "function") {
        handled = !win.dispatchEvent(new win.CustomEvent("doogo-bookmarklet-test", { cancelable: true, detail: { version: VERSION } }));
      }
    } catch { handled = false; }
    if (!handled) win.alert("책갈피가 잘 실행돼요. 이제 DB센터 버튼으로 열린 발주오라 관리자 창(console.baljuora.com)에서 똑같이 실행해 주세요.");
    return true;
  }

  async function main(win) {
    var doogoOrigin = win.__doogoSyncOrigin || (function () {
      try { return new URL(win.document.currentScript && win.document.currentScript.src).origin; } catch { return ""; }
    })();
    if (!/console\.baljuora\.com$/.test(win.location.hostname) && !win.__doogoSyncAllowAnyHost) {
      // 1.12.1: DB센터 화면에서 누르면 '책갈피 시험'(휴대폰에서 북마크를 만든 뒤 잘 실행되는지 DB센터가 알려 줌)
      if (bookmarkletTest(win, doogoOrigin)) return;
      win.alert("발주오라 관리자 화면(console.baljuora.com)에서 책갈피를 눌러 주세요.");
      return;
    }
    // 이 창에서 이미 작업 중이면(책갈피를 또 누름) 진행 패널만 다시 보여 줍니다.
    if (win.__doogoSyncRunning) {
      var current = win[RESIDENT_KEY];
      if (current && typeof current.showPanel === "function") current.showPanel();
      return;
    }
    // 1.12.0: 이 창 오른쪽 아래에 동기화 버튼을 켜 둡니다(예전 버튼은 새 버전으로). 다음 작업은 DB센터가 이 창으로 보내면 바로 시작돼요.
    installResident(win, doogoOrigin);
    // 작업 코드가 주소에 있으면 동기화, 없으면 정산 반영 도우미(정산 화면·#doogo-settle) 또는 고르기
    var code = codeFromLocation(win);
    if (!code) {
      // 확장 프로그램·사용자 스크립트가 발주오라 창을 열 때마다 불러온 경우(__doogoSyncAutoload): 버튼만 켜 둡니다.
      if (win.__doogoSyncAutoload) return;
      if (settleRequested(win) || isBankPage(win)) return runSettlementMode(win);
      win.__doogoSyncChoosing = true;
      var picked;
      try { picked = await chooseMode(win); } finally { win.__doogoSyncChoosing = false; }
      if (picked.mode === "settle") return runSettlementMode(win, picked.panel);
      if (picked.mode !== "sync") return;
      code = readCode(win);
      if (!code) return;
    }
    return runSyncJob(win, doogoOrigin, code);
  }

  // 작업 코드 하나를 실행합니다(책갈피를 누를 때 · 1.12.0부터는 이 창에 남은 버튼이 DB센터에서 온 코드를 받을 때도).
  async function runSyncJob(win, doogoOrigin, code) {
    if (!doogoOrigin) {
      win.alert("DB센터 주소를 알 수 없습니다. DB센터 동기화 화면에서 책갈피를 다시 만들어 주세요.");
      return;
    }
    win.__doogoSyncRunning = true;
    var resident = activeResident;
    var panel = createPanel(win.document, { minimize: true });
    if (resident) resident.jobStarted(code);
    var outcome = "error";
    panel.status("DB센터에서 작업을 받는 중…");
    var lastProgressAt = 0;
    async function postJson(path, body) {
      var response = await win.fetch(doogoOrigin + "/api/baljuora/runner/" + encodeURIComponent(code) + path, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      var json = await response.json().catch(function () { return null; });
      if (!response.ok || !json || json.ok === false) {
        // 응답 번호를 붙여 일시 오류(5xx)는 다시 보내고, 취소·만료(409)·없는 작업(404)은 바로 멈춥니다(결과 보내기).
        var failure = SyncError((json && json.error && json.error.message) || "DB센터 응답 오류(" + response.status + ")");
        failure.status = response.status;
        throw failure;
      }
      return json.data;
    }
    var report = {
      progress: function (done, total, message) {
        panel.status(message);
        panel.progress(done, total);
        var now = Date.now();
        if (now - lastProgressAt > 1500) {
          lastProgressAt = now;
          postJson("/progress", { done: done, total: total, message: message }).catch(function () { /* 진행 표시는 실패해도 계속 */ });
        }
      },
      log: function (text, isError) { panel.log(text, isError); },
      results: function (body) { return postJson("/results", body); }
    };
    // DB센터 일시 오류(연결 끊김·5xx)면 1·3초 뒤 두 번 더 묻습니다(운영 홈 상품 동기화의 이어 가기).
    async function postJsonRetry(path, body) {
      var waits = [1000, 3000];
      for (var attempt = 0; ; attempt += 1) {
        try {
          return await postJson(path, body);
        } catch (error) {
          var transient = !error || !error.status || error.status >= 500;
          if (!transient || attempt >= waits.length) throw error;
          await new Promise(function (resolve) { setTimeout(resolve, waits[attempt]); });
        }
      }
    }
    var runner = null;
    try {
      var job = await postJson("");
      var jobLabel = job.type === "compare"
        ? (job.plan.ops === "products" ? "상품 동기화(발주오라 상품 읽기 → DB센터 변경 보내기)" : "발주오라 상품 불러오기(비교)" + (job.plan.sales ? " + 판매·매출처" : ""))
        : job.type === "sales"
          ? (job.plan.ops === "orders" ? "주문 동기화(주문·매출처·매입처 " + job.plan.start + " ~ " + job.plan.end + ")" : "판매·매출처 불러오기(" + job.plan.start + " ~ " + job.plan.end + ")")
          : "DB센터 변경 " + job.plan.items.length + "개 보내기";
      panel.log("작업을 받았습니다: " + jobLabel);
      var loadedScripts = [];
      try { loadedScripts = Array.prototype.map.call(win.document.scripts, function (script) { return script.src; }).filter(Boolean); } catch { /* 무시 */ }
      // resourceEntries(1.11.0): 대시보드 화면이 이미 부른 발주오라 주소(쿼리 포함)를 같은 조건으로 다시 부르려고 읽습니다(값·토큰 없음).
      var resourceEntries = function () { try { return win.performance && win.performance.getEntriesByType ? win.performance.getEntriesByType("resource") : []; } catch { return []; } };
      var runnerEnv = { fetch: win.fetch.bind(win), locks: win.navigator && win.navigator.locks, consoleOrigin: win.location.origin, pagePath: win.location.pathname, loadedScripts: loadedScripts, apiBase: win.__doogoSyncApiBase || API_BASE, doogoOrigin: doogoOrigin, convertImage: makeImageConverter(win), resourceEntries: resourceEntries };
      runner = createRunner(runnerEnv);
      panel.status("발주오라 로그인 확인 중…");
      runner.state.token = await runner.refreshToken();
      if (job.type === "compare") {
        var compared = await runner.runCompare(job.plan, report);
        if (job.plan.ops === "products") {
          // 운영 홈 상품 동기화(1.10.0): 방금 읽은 발주오라 값으로 DB센터가 보낼 것을 정하면 같은 창에서 바로 보냅니다(책갈피를 다시 누르지 않음).
          panel.log("발주오라 상품 " + compared.received + "개를 읽었습니다. DB센터에서 보낼 변경을 정하는 중…");
          panel.status("DB센터에서 보낼 변경을 정하는 중…");
          var next = await postJsonRetry("/next", {});
          if (!next || !next.next) {
            panel.status("완료: " + ((next && next.message) || "보낼 변경이 없어요.") + " DB센터 운영 홈에서 확인하세요.");
            panel.progress(1, 1);
          } else {
            code = next.next.code;
            var pushJob = await postJson("");
            panel.log("이어서 보내기: DB센터 변경 " + pushJob.plan.items.length + "개" + (pushJob.plan.categoryTree ? " + 카테고리 맞추기" : ""));
            var pushRunner = createRunner(runnerEnv);
            pushRunner.state.token = runner.state.token;
            runner = pushRunner;
            var chained = await runner.runPush(pushJob.plan, report, code);
            panel.status("완료: 성공 " + chained.ok + "개 · 실패 " + chained.failed + "개. DB센터 운영 홈에서 결과를 확인하세요.");
          }
        } else {
          panel.status("완료: 발주오라 상품 " + compared.received + "개" + (compared.sales ? " · 판매 " + compared.sales.lines + "줄 · 매출처 " + compared.sales.buyers + "곳" : "") + "을 읽었습니다. DB센터 화면에서 확인하세요.");
          panel.progress(1, 1);
        }
      } else if (job.type === "sales") {
        var sold = await runner.runSales(job.plan, report, { final: true });
        panel.status("완료: 판매 " + sold.lines + "줄 · 매출처 " + sold.buyers + "곳" + (job.plan.suppliers ? " · 매입처 " + sold.suppliers + "곳" : "") + "을 읽었습니다" + (sold.complete ? "." : "(주문은 일부만).") + (job.plan.ops === "orders" ? " DB센터 운영 홈에서 확인하세요." : " DB센터 판매 현황에서 확인하세요."));
        panel.progress(1, 1);
      } else {
        var pushed = await runner.runPush(job.plan, report, code);
        panel.status("완료: 성공 " + pushed.ok + "개 · 실패 " + pushed.failed + "개. DB센터 화면에서 결과를 확인하세요.");
      }
      try { win.sessionStorage.removeItem("doogo-sync-code"); } catch { /* 무시 */ }
      outcome = "done";
    } catch (error) {
      var message = describeError(error);
      panel.status("중단: " + message);
      panel.log(message, true);
      try {
        await postJson("/results", { final: true, error: message, diagnostics: runner ? runner.diagnostics({ fatal: true }) : { version: VERSION, fatal: true } });
      } catch { /* 작업이 이미 끝났거나 만료 */ }
    } finally {
      win.__doogoSyncRunning = false;
      if (resident) resident.jobEnded(outcome, panel);
    }
  }

  var internals = {
    VERSION: VERSION,
    toNumber: toNumber,
    unwrap: unwrap,
    pickArray: pickArray,
    pageMeta: pageMeta,
    extractImages: extractImages,
    extractCategoryIds: extractCategoryIds,
    extractGroupPrice: extractGroupPrice,
    normalizeProduct: normalizeProduct,
    mergeSnapshots: mergeSnapshots,
    flattenCategories: flattenCategories,
    structureOf: structureOf,
    messagesOf: messagesOf,
    forbiddenProperties: forbiddenProperties,
    missingProperties: missingProperties,
    koreanFieldsOf: koreanFieldsOf,
    writable: writable,
    buildSellerProductPrices: buildSellerProductPrices,
    normalizeShippingPolicy: normalizeShippingPolicy,
    fitsProductImage: fitsProductImage,
    plainName: plainName,
    treeRootsOf: treeRootsOf,
    treeShapeProblem: treeShapeProblem,
    excludedTreeIds: excludedTreeIds,
    planTreeSave: planTreeSave,
    treeSaveBody: treeSaveBody,
    verifyTreeSave: verifyTreeSave,
    makeImageConverter: makeImageConverter,
    PRODUCT_IMAGE: PRODUCT_IMAGE,
    extractPurchaseCost: extractPurchaseCost,
    buildProductSuppliers: buildProductSuppliers,
    normalizeOrderItem: normalizeOrderItem,
    normalizeSeller: normalizeSeller,
    normalizeSupplier: normalizeSupplier,
    sellerNeedsDetail: sellerNeedsDetail,
    chunkPathsOf: chunkPathsOf,
    codeSnippets: codeSnippets,
    buildCreateBody: buildCreateBody,
    supplierNameKey: supplierNameKey,
    productNameKey: productNameKey,
    duplicateNameMessage: duplicateNameMessage,
    defaultSupplierName: defaultSupplierName,
    extractExtra: extractExtra,
    extraBodyFor: extraBodyFor,
    sameExtraValue: sameExtraValue,
    verifyApplied: verifyApplied,
    categoryCovers: categoryCovers,
    categoryLabel: categoryLabel,
    createRunner: createRunner,
    readCode: readCode,
    codeFromLocation: codeFromLocation,
    settleRequested: settleRequested,
    readBankTable: readBankTable,
    readableText: readableText,
    readWaitingCount: readWaitingCount,
    createSettlementHelper: createSettlementHelper,
    runSettlement: runSettlement,
    createPanel: createPanel,
    installResident: installResident,
    bookmarkletTest: bookmarkletTest,
    runSyncJob: runSyncJob,
    chooseMode: chooseMode,
    codeKey: codeKey,
    main: main
  };

  var scope = typeof window !== "undefined" ? window : globalThis;
  if (scope.__DOOGO_SYNC_TEST__) {
    scope.__DOOGO_SYNC_TEST__.internals = internals;
    return;
  }
  main(scope);
})();
