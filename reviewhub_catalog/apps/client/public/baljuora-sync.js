/*
 * 두고푸드 DB센터 → 발주오라 동기화 실행기 (2026-11-22)
 * 관리자 > 발주오라 동기화 화면의 책갈피 "두고푸드 동기화"가, 관리자가 로그인해 둔 발주오라 관리자 창(console.baljuora.com)에
 * 이 파일을 불러옵니다. 발주오라 로그인은 사람이 직접 합니다(이 파일은 로그인이나 사람 확인을 대신하지 않습니다).
 *
 * 하는 일
 *  1) DB센터 작업 코드로 작업 내용을 받습니다(GET {DB센터}/api/baljuora/runner/:code).
 *  2) 이 창의 로그인으로 발주오라 관리자 화면과 같은 방식(api.baljuora.com)으로 상품을 읽거나(비교) 고칩니다(보내기).
 *  3) 결과와 진단 정보(발주오라 응답의 칸 이름·형식, 오류 문구)를 DB센터로 돌려줍니다. 발주오라 로그인 토큰은 보내지 않습니다.
 */
(function () {
  "use strict";

  var VERSION = "1.6.0";
  var API_BASE = "https://api.baljuora.com/";
  var PRICE_FIELDS = ["supplyPrice", "consumerPrice", "purchaseCost", "groupPrice"];
  var INFO_FIELDS = ["name", "category"];
  // 발주오라 상품 이미지 올리기(2026-11-23 발주오라 상품 등록·수정 화면 코드 확인):
  // POST files/presign {kind:"product-image", fileName, contentType, size, source:"product-form"} → 받은 uploadUrl 로 PUT(받은 headers 그대로)
  // → 받은 file.value 를 imageUrls 에 넣어 PUT products/:id. 발주오라 화면은 상품 이미지를 JPG·PNG, 1MB 이하, 최대 5장만 받습니다.
  var PRODUCT_IMAGE = { kind: "product-image", source: "product-form", maxBytes: 1024 * 1024, types: ["image/jpeg", "image/png"], limit: 5, maxSide: 2000 };
  var CODE_KEYS = ["code", "productCode", "sku", "skuCode", "managementCode", "manageCode", "customCode", "itemCode", "goodsCode"];
  var READ_ONLY_KEYS = ["id", "createdAt", "updatedAt", "deletedAt", "merchantId", "merchant", "creator", "updater", "createdBy", "updatedBy", "stats", "statistics", "inventory", "inventories", "histories", "orderCount", "salesCount"];

  // 발주오라 상품 수정 화면과 같은 방식으로 상세를 읽습니다(2026-11-23 화면 코드 확인: getProductsById(id, { include: [...] }),
  // 발주오라 API 도구는 배열을 쉼표로 이어 보냄). prices = 매출처별 개별공급가(황금농부 그룹 공급가 포함), productSuppliers = 매입처·매입원가.
  var DETAIL_INCLUDE = "categories,productSuppliers,shippingPolicy,prices,visibility";
  var LIST_INCLUDE = "productSuppliers,prices";

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
    var categoryIds = extractCategoryIds(record);
    if (categoryIds !== undefined) snapshot.categoryIds = categoryIds;
    var groupPrice = extractGroupPrice(record, context && context.group, context && context.groupKeyword);
    if (groupPrice !== undefined) snapshot.groupPrice = groupPrice;
    // 매출배송정책(배송비 정책): sellShippingPolicyId(없으면 shippingPolicy.id). 칸이 아예 없으면 읽지 못함(보내지 않음)
    if ("sellShippingPolicyId" in record) snapshot.shippingPolicyId = typeof record.sellShippingPolicyId === "string" && record.sellShippingPolicyId ? record.sellShippingPolicyId : null;
    else if (isObject(record.shippingPolicy) && typeof record.shippingPolicy.id === "string") snapshot.shippingPolicyId = record.shippingPolicy.id;
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
      Object.keys(value).slice(0, 80).forEach(function (key) { shape[key] = structureOf(value[key], level + 1); });
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
    if (item.values.purchaseCost !== null) body.purchaseCost = item.values.purchaseCost;
    if ("isTaxable" in template) body.isTaxable = Boolean(item.values.isTaxable);
    if ("isVisible" in template) body.isVisible = true;
    if (item.values.categoryId) body[categoryKeyOf(template)] = categoryKeyOf(template) === "categoryIds" ? [item.values.categoryId] : item.values.categoryId;
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
        if (snapshot.categoryIds !== undefined && item.values.categoryId && snapshot.categoryIds.indexOf(item.values.categoryId) < 0) {
          result.skipped.push({ field: field, reason: "발주오라에 저장된 카테고리가 다릅니다." });
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
    var state = { token: null, structure: {}, endpoints: {}, errors: [] };

    function note(path, status) {
      state.endpoints[path] = status;
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

    async function api(method, path, body, options) {
      var opts = options || {};
      if (!state.token) state.token = await refreshToken();
      var url = new URL(path.replace(/^\//, ""), env.apiBase);
      if (opts.params) Object.keys(opts.params).forEach(function (key) { if (opts.params[key] !== undefined && opts.params[key] !== null) url.searchParams.set(key, String(opts.params[key])); });
      var headers = { Authorization: "Bearer " + state.token };
      var payload;
      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        payload = JSON.stringify(body);
      }
      var response = await env.fetch(url.toString(), { method: method, headers: headers, body: payload });
      note(method + " " + path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id"), response.status);
      if (response.status === 401 && !opts.retried) {
        state.token = await refreshToken();
        return api(method, path, body, Object.assign({}, opts, { retried: true }));
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
        try {
          payload = unwrap(await api("GET", "products", undefined, { params: state.listInclude === false ? { page: page, limit: limit } : { page: page, limit: limit, include: LIST_INCLUDE } }));
        } catch (error) {
          if (page === 1 && error.status === 400 && state.listInclude !== false) {
            state.listInclude = false;
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

    async function discoverProductForm(sampleId) {
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
            var pieces = codeSnippets(code, ["개별공급가", "prices", "visibility", "productSuppliers", "mutate", "onSubmit", "supplyPrice"], 900, 4);
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

    async function runCompare(plan, report) {
      report.progress(0, 0, "발주오라 매출처 그룹·카테고리를 읽는 중…");
      var group = await findGroup(plan.groupKeyword);
      var categories = await loadCategories();
      var context = { group: group, groupKeyword: plan.groupKeyword };
      report.progress(0, 0, "발주오라 상품 목록을 읽는 중…");
      var raw = await listAllProducts(function (count, total) { report.progress(count, total || count, "발주오라 상품 목록 " + count + (total ? " / " + total : "") + "개 읽음"); });
      var snapshots = raw.map(function (record) { return normalizeProduct(record, context); }).filter(Boolean);
      var products = snapshots.filter(function (snapshot) { return snapshot.kind === "product"; });
      var needsDetail = products.some(function (snapshot) { return snapshot.categoryIds === undefined || snapshot.groupPrice === undefined || snapshot.shippingPolicyId === undefined || !snapshot.code; });
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
        await report.results({
          final: last,
          snapshots: batch,
          categories: first ? categories : undefined,
          shippingPolicies: first && shippingPolicies.length > 0 ? shippingPolicies : undefined,
          group: first ? group : undefined,
          diagnostics: last ? diagnostics({ group: group, categories: categories.length, products: products.length, bundles: snapshots.length - products.length }) : undefined
        });
        report.progress(Math.min(index + batchSize, snapshots.length), snapshots.length, "DB센터로 결과를 보내는 중…");
        if (last) break;
      }
      return { received: snapshots.length, products: products.length };
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
      if (fields.indexOf("purchaseCost") >= 0 && values.purchaseCost !== null) {
        if (typeof liveCost === "number" && liveCost === values.purchaseCost) same.purchaseCost = true;
        else body.purchaseCost = values.purchaseCost;
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
      fields.forEach(function (field) {
        if ((field === "groupPrice" && groupSame) || same[field]) { result.applied.push(field); return; }
        if (blank[field]) { result.skipped.push({ field: field, reason: "DB센터 값이 0원이라 보내지 않았습니다(발주오라 가격을 0원으로 바꾸지 않음)." }); return; }
        if (field === "purchaseCost" && values.purchaseCost === null) { result.skipped.push({ field: field, reason: "DB센터 원가가 비어 있어 보내지 않았습니다." }); return; }
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

    async function pushItem(item, plan, context, code) {
      var result = { productId: item.productId, action: item.action, ok: false, baljuoraId: item.baljuoraId, code: item.code, applied: [], skipped: [], snapshot: null, error: null };
      try {
        var id = item.baljuoraId;
        var detail;
        var fields = item.fields.slice();
        if (item.action === "create") {
          // 같은 상품코드가 이미 발주오라에 있으면 새로 만들지 않습니다(중복 등록 방지).
          if (context.existingCodes && item.code && context.existingCodes[String(item.code).toUpperCase()]) {
            throw SyncError("발주오라에 같은 상품코드(" + item.code + ")가 이미 있습니다. DB센터에서 '발주오라 상품 불러오기'를 다시 한 뒤 동기화해 주세요.");
          }
          if (!item.templateId) throw SyncError("새 상품의 매입처·배송정책을 복사할 발주오라 상품이 없습니다. DB센터 동기화 설정에서 '설정 복사용 상품코드'를 정하거나, 같은 매입처 상품을 먼저 연결해 주세요.");
          var template = await getDetail(item.templateId);
          var body = buildCreateBody(template, item);
          var created = unwrap(await sendAdaptive("POST", "products", body, writable(template)));
          if (!state.structure.productCreate) state.structure.productCreate = structureOf(created);
          id = isObject(created) ? created.id || (isObject(created.product) ? created.product.id : null) : null;
          if (typeof id !== "string") throw SyncError("발주오라가 새 상품 id를 돌려주지 않았습니다. 발주오라 상품 목록에서 등록됐는지 확인해 주세요.");
          result.baljuoraId = id;
          ["name", "supplyPrice", "consumerPrice", "purchaseCost", "category"].forEach(function (field) {
            var key = field === "category" ? categoryKeyOf(template) : field;
            if (key in body && fields.indexOf(field) >= 0) result.applied.push(field);
          });
          fields = fields.filter(function (field) { return result.applied.indexOf(field) < 0; });
          detail = await getDetail(id);
        } else {
          if (!id) throw SyncError("연결된 발주오라 상품이 없습니다.");
          detail = await getDetail(id);
        }
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
        if (fields.indexOf("image") >= 0) {
          try { await applyImage(id, detail, item, result, code, checks); } catch (error) { if (error && error.status === 401) throw error; markFailed(["image"], error); }
        }
        if (fields.indexOf("shippingPolicy") >= 0) {
          try { await applyShipping(id, detail, item, result); } catch (error) { if (error && error.status === 401) throw error; markFailed(["shippingPolicy"], error); }
        }
        var after = normalizeProduct(await getDetail(id), context);
        if (after) {
          verifyApplied(result, item, after, checks);
          result.snapshot = after;
          result.code = after.code || result.code;
        }
        // 수강생 단가(황금농부 그룹 공급가)를 저장하지 못했으면 다음 고칠 때 쓸 수 있게 발주오라 저장 코드를 찾아 둡니다.
        if (result.skipped.some(function (entry) { return entry.field === "groupPrice"; })) await discoverProductForm(id);
        result.ok = result.applied.length > 0 || item.action === "create";
        if (!result.ok && !result.error) result.error = result.skipped.map(function (entry) { return entry.reason; }).join(" / ") || "바뀐 칸이 없습니다.";
      } catch (error) {
        result.error = describeError(error);
      }
      return result;
    }

    async function runPush(plan, report, code) {
      report.progress(0, plan.items.length, "발주오라 매출처 그룹을 확인하는 중…");
      var group = plan.groupId ? { id: plan.groupId, name: plan.groupKeyword } : null;
      if (plan.items.some(function (item) { return item.fields.indexOf("groupPrice") >= 0; }) && !group) group = await findGroup(plan.groupKeyword);
      var context = { group: group, groupKeyword: plan.groupKeyword, existingCodes: null, createdCategories: {}, preserveCategoryIds: null };
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
        await report.results({ final: false, items: [], categoryTree: { applied: treeResult.applied, skipped: treeResult.skipped, created: treeResult.created, categories: treeResult.categories, error: treeResult.error } });
      }
      // 2) 상품 카테고리를 보낼 때 상품에 붙은 브랜드별 아래 카테고리는 지우지 않게 지금 발주오라 트리에서 찾아 둡니다.
      if (plan.items.some(function (item) { return item.fields.indexOf("category") >= 0; })) {
        if (!categoriesNow) categoriesNow = await loadCategories();
        context.preserveCategoryIds = excludedTreeIds(categoriesNow || [], plan.categoryExclude || ["브랜드별"]);
      }
      if (plan.items.some(function (item) { return item.action === "create"; })) {
        report.progress(0, plan.items.length, "같은 상품코드가 발주오라에 이미 있는지 확인하는 중…");
        var listed = await listAllProducts();
        context.existingCodes = {};
        listed.forEach(function (record) {
          var found = isObject(record) ? firstString(record, CODE_KEYS) : null;
          if (found) context.existingCodes[found.value.toUpperCase()] = record.id;
        });
      }
      var pending = [];
      var summary = { ok: 0, failed: 0 };
      for (var index = 0; index < plan.items.length; index += 1) {
        var item = plan.items[index];
        report.progress(index, plan.items.length, (item.action === "create" ? "신규 등록 " : "수정 ") + (index + 1) + " / " + plan.items.length + " · " + item.name);
        var result = await pushItem(item, plan, context, code);
        if (result.ok) summary.ok += 1; else summary.failed += 1;
        report.log((result.ok ? "✓ " : "✕ ") + item.name + (result.ok ? "" : " — " + result.error), !result.ok);
        pending.push(result);
        if (pending.length >= 5) {
          await report.results({ final: false, items: pending });
          pending = [];
        }
      }
      await report.results({ final: true, items: pending, diagnostics: diagnostics({ group: group, items: plan.items.length, ok: summary.ok, failed: summary.failed }) });
      report.progress(plan.items.length, plan.items.length, "완료: 성공 " + summary.ok + "개 · 실패 " + summary.failed + "개");
      return summary;
    }

    function diagnostics(extra) {
      var discovery = state.discovery || state.categoryDiscovery ? Object.assign({}, state.discovery || {}, state.categoryDiscovery ? { categoryPage: state.categoryDiscovery } : {}) : undefined;
      return { version: VERSION, at: new Date().toISOString(), structure: state.structure, endpoints: state.endpoints, errors: state.errors.slice(0, 30), extra: extra || {}, discovery: discovery };
    }

    return { api: api, refreshToken: refreshToken, runCompare: runCompare, runPush: runPush, pushItem: pushItem, diagnostics: diagnostics, state: state };
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

  function createPanel(doc, options) {
    var settings = options || {};
    var old = doc.getElementById("doogo-sync-panel");
    if (old) old.remove();
    var panel = doc.createElement("section");
    panel.id = "doogo-sync-panel";
    panel.setAttribute("role", "status");
    panel.style.cssText = "box-sizing:border-box;position:fixed;right:18px;bottom:18px;z-index:2147483647;width:min(420px,calc(100vw - 36px));max-height:70vh;display:flex;flex-direction:column;gap:10px;padding:16px 16px 14px;border:2px solid #163300;border-radius:16px;background:#fff;color:#0e0f0c;box-shadow:0 18px 50px rgba(0,0,0,.25);font:14px/1.5 -apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;";
    panel.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><strong data-title style="font-size:15px"></strong><button type="button" data-close aria-label="닫기" style="border:0;background:#f1f3ef;border-radius:8px;padding:4px 10px;font-size:13px;cursor:pointer">닫기</button></div><p data-status style="margin:0;font-weight:700"></p><div style="height:8px;border-radius:99px;background:#e8ebe6;overflow:hidden"><div data-bar style="height:100%;width:0;background:#9fe870;transition:width .3s"></div></div><ol data-log style="margin:0;padding:0 0 0 18px;overflow:auto;max-height:36vh;font-size:12.5px;color:#454745"></ol><div data-actions style="display:none;flex-wrap:wrap;gap:8px"></div><small data-note style="color:#6b6e6a"></small>';
    panel.querySelector("[data-title]").textContent = settings.title || "두고푸드 DB센터 → 발주오라 동기화";
    panel.querySelector("[data-note]").textContent = settings.note || "이 창을 닫지 말고 끝날 때까지 기다려 주세요. 결과는 DB센터 동기화 화면에도 그대로 보입니다.";
    doc.body.appendChild(panel);
    var pending = null;
    var api = {
      closed: false,
      element: panel,
      status: function (text) { panel.querySelector("[data-status]").textContent = text; },
      progress: function (done, total) { panel.querySelector("[data-bar]").style.width = (total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 8) + "%"; },
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
      }
    };
    panel.querySelector("[data-close]").addEventListener("click", function () {
      api.closed = true;
      panel.remove();
      if (pending) { var resolve = pending; pending = null; resolve(null); }
    });
    return api;
  }

  function codeFromLocation(win) {
    var match = /doogo-sync=([0-9A-Za-z-]{10,16})/.exec(win.location.hash || "") || /doogo-sync=([0-9A-Za-z-]{10,16})/.exec(win.location.search || "");
    if (!match) return null;
    try { win.sessionStorage.setItem("doogo-sync-code", match[1]); } catch { /* 저장이 막힌 브라우저 */ }
    try { win.history.replaceState(null, "", win.location.pathname + win.location.search.replace(/[?&]doogo-sync=[^&]*/, "")); } catch { /* 무시 */ }
    return match[1];
  }

  function readCode(win) {
    var code = codeFromLocation(win);
    if (code) return code;
    var stored = null;
    try { stored = win.sessionStorage.getItem("doogo-sync-code"); } catch { stored = null; }
    var typed = win.prompt("DB센터 '발주오라 동기화' 화면에 보이는 작업 코드 10글자를 입력해 주세요.", stored || "");
    return typed ? typed.trim() : null;
  }

  // DB센터 "발주오라 정산 화면 열기"로 연 창(#doogo-settle)이거나 입/출금 계좌 조회 화면이면 정산 반영 도우미로 시작합니다.
  function settleRequested(win) {
    return /(^|[#&?])doogo-settle(\b|$)/.test((win.location.hash || "") + "&" + (win.location.search || ""));
  }

  function clearSettleHash(win) {
    if (!/doogo-settle/.test(win.location.hash || "")) return;
    try { win.history.replaceState(null, "", win.location.pathname + win.location.search); } catch { /* 무시 */ }
  }

  async function chooseMode(win) {
    var panel = createPanel(win.document, { title: "두고푸드 책갈피", note: "상품 동기화는 DB센터 '발주오라 동기화'에서 작업을 만든 뒤 이 책갈피를 누르면 바로 시작됩니다." });
    panel.status("무엇을 할까요?");
    panel.log("입금·정산 반영: 입/출금 계좌 조회 → 업체구분·거래처가 들어간 정산 대기 건 정산 반영");
    panel.log("상품 동기화: DB센터에서 받은 작업 코드 10글자로 비교·보내기");
    var mode = await panel.ask([{ key: "settle", label: "입금·정산 반영", primary: true }, { key: "sync", label: "상품 동기화(작업 코드)" }]);
    if (mode && mode !== "settle") panel.element.remove();
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
    }
  }

  async function main(win) {
    if (win.__doogoSyncRunning) return;
    var doogoOrigin = win.__doogoSyncOrigin || (function () {
      try { return new URL(win.document.currentScript && win.document.currentScript.src).origin; } catch { return ""; }
    })();
    if (!/console\.baljuora\.com$/.test(win.location.hostname) && !win.__doogoSyncAllowAnyHost) {
      win.alert("발주오라 관리자 화면(console.baljuora.com)에서 책갈피를 눌러 주세요.");
      return;
    }
    // 작업 코드가 주소에 있으면 상품 동기화, 없으면 정산 반영 도우미(정산 화면·#doogo-settle) 또는 고르기
    var code = codeFromLocation(win);
    if (!code) {
      if (settleRequested(win) || isBankPage(win)) return runSettlementMode(win);
      win.__doogoSyncRunning = true;
      var picked;
      try { picked = await chooseMode(win); } finally { win.__doogoSyncRunning = false; }
      if (picked.mode === "settle") return runSettlementMode(win, picked.panel);
      if (picked.mode !== "sync") return;
      code = readCode(win);
      if (!code) return;
    }
    if (!doogoOrigin) {
      win.alert("DB센터 주소를 알 수 없습니다. DB센터 동기화 화면에서 책갈피를 다시 만들어 주세요.");
      return;
    }
    win.__doogoSyncRunning = true;
    var panel = createPanel(win.document);
    panel.status("DB센터에서 작업을 받는 중…");
    var lastProgressAt = 0;
    async function postJson(path, body) {
      var response = await win.fetch(doogoOrigin + "/api/baljuora/runner/" + encodeURIComponent(code) + path, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      var json = await response.json().catch(function () { return null; });
      if (!response.ok || !json || json.ok === false) throw SyncError((json && json.error && json.error.message) || "DB센터 응답 오류(" + response.status + ")");
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
    var runner = null;
    try {
      var job = await postJson("");
      panel.log("작업을 받았습니다: " + (job.type === "compare" ? "발주오라 상품 불러오기(비교)" : "DB센터 변경 " + job.plan.items.length + "개 보내기"));
      var loadedScripts = [];
      try { loadedScripts = Array.prototype.map.call(win.document.scripts, function (script) { return script.src; }).filter(Boolean); } catch { /* 무시 */ }
      runner = createRunner({ fetch: win.fetch.bind(win), locks: win.navigator && win.navigator.locks, consoleOrigin: win.location.origin, pagePath: win.location.pathname, loadedScripts: loadedScripts, apiBase: win.__doogoSyncApiBase || API_BASE, doogoOrigin: doogoOrigin, convertImage: makeImageConverter(win) });
      panel.status("발주오라 로그인 확인 중…");
      runner.state.token = await runner.refreshToken();
      if (job.type === "compare") {
        var compared = await runner.runCompare(job.plan, report);
        panel.status("완료: 발주오라 상품 " + compared.received + "개를 읽었습니다. DB센터 화면에서 변경 목록을 확인하세요.");
        panel.progress(1, 1);
      } else {
        var pushed = await runner.runPush(job.plan, report, code);
        panel.status("완료: 성공 " + pushed.ok + "개 · 실패 " + pushed.failed + "개. DB센터 화면에서 결과를 확인하세요.");
      }
      try { win.sessionStorage.removeItem("doogo-sync-code"); } catch { /* 무시 */ }
    } catch (error) {
      var message = describeError(error);
      panel.status("중단: " + message);
      panel.log(message, true);
      try {
        await postJson("/results", { final: true, error: message, diagnostics: runner ? runner.diagnostics({ fatal: true }) : { version: VERSION, fatal: true } });
      } catch { /* 작업이 이미 끝났거나 만료 */ }
    } finally {
      win.__doogoSyncRunning = false;
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
    chunkPathsOf: chunkPathsOf,
    codeSnippets: codeSnippets,
    buildCreateBody: buildCreateBody,
    verifyApplied: verifyApplied,
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
    main: main
  };

  var scope = typeof window !== "undefined" ? window : globalThis;
  if (scope.__DOOGO_SYNC_TEST__) {
    scope.__DOOGO_SYNC_TEST__.internals = internals;
    return;
  }
  main(scope);
})();
