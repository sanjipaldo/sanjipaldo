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

  var VERSION = "1.0.0";
  var API_BASE = "https://api.baljuora.com/";
  var PRICE_FIELDS = ["supplyPrice", "consumerPrice", "purchaseCost", "groupPrice"];
  var INFO_FIELDS = ["name", "category", "image"];
  var CODE_KEYS = ["code", "productCode", "sku", "skuCode", "managementCode", "manageCode", "customCode", "itemCode", "goodsCode"];
  var READ_ONLY_KEYS = ["id", "createdAt", "updatedAt", "deletedAt", "merchantId", "merchant", "creator", "updater", "createdBy", "updatedBy", "stats", "statistics", "inventory", "inventories", "histories", "orderCount", "salesCount"];

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
    var group = isObject(entry.sellerGroup) ? entry.sellerGroup : isObject(entry.group) ? entry.group : {};
    var price = ["supplyPrice", "price", "groupPrice", "groupSupplyPrice", "amount", "unitPrice"].find(function (key) { return key in entry; });
    return {
      id: entry.sellerGroupId || entry.groupId || group.id || null,
      name: entry.sellerGroupName || entry.groupName || group.name || entry.name || "",
      priceKey: price || null,
      price: price ? toNumber(entry[price]) : null
    };
  }

  function groupArrayKeys(record) {
    return Object.keys(record).filter(function (key) {
      return Array.isArray(record[key]) && /group|tier|grade/i.test(key) && record[key].every(function (entry) { return isObject(entry); });
    });
  }

  function matchesGroup(info, group, keyword) {
    if (!info) return false;
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
      purchaseCost: toNumber(record.purchaseCost !== undefined ? record.purchaseCost : record.purchasePrice),
      imageUrls: extractImages(record).slice(0, 20),
      isVisible: typeof record.isVisible === "boolean" ? record.isVisible : null,
      isSoldOut: typeof record.isSoldOut === "boolean" ? record.isSoldOut : null,
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : typeof record.createdAt === "string" ? record.createdAt : null
    };
    var categoryIds = extractCategoryIds(record);
    if (categoryIds !== undefined) snapshot.categoryIds = categoryIds;
    var groupPrice = extractGroupPrice(record, context && context.group, context && context.groupKeyword);
    if (groupPrice !== undefined) snapshot.groupPrice = groupPrice;
    return snapshot;
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

  function missingProperties(messages) {
    var names = [];
    messages.forEach(function (message) {
      var match = /^([A-Za-z][A-Za-z0-9_]*)\s+(should not be empty|must be|must not be|is required|should not be null)/i.exec(String(message).trim());
      if (match) names.push(match[1]);
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

  function buildGroupPricing(detail, group, keyword, price) {
    var keys = groupArrayKeys(detail);
    for (var index = 0; index < keys.length; index += 1) {
      var key = keys[index];
      var list = detail[key].map(function (entry) { return Object.assign({}, entry); });
      var priceKey = null;
      var found = false;
      list.forEach(function (entry) {
        var info = groupEntryInfo(entry);
        if (info && info.priceKey && !priceKey) priceKey = info.priceKey;
        if (matchesGroup(info, group, keyword)) {
          entry[info.priceKey || "supplyPrice"] = price;
          found = true;
        }
      });
      if (!found) {
        if (!group || !group.id) return null;
        var added = {};
        added[list.length && groupEntryInfo(list[0]) && list[0].groupId !== undefined ? "groupId" : "sellerGroupId"] = group.id;
        added[priceKey || "supplyPrice"] = price;
        list.push(added);
      }
      return { key: key, value: writable(list) };
    }
    return null;
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

  function expectedValue(field, values) {
    if (field === "supplyPrice") return values.supplyPrice;
    if (field === "consumerPrice") return values.consumerPrice;
    if (field === "purchaseCost") return values.purchaseCost;
    if (field === "groupPrice") return values.groupPrice;
    if (field === "name") return values.name;
    return undefined;
  }

  // 보낸 칸이 발주오라에 실제로 저장됐는지 다시 읽어 확인합니다.
  function verifyApplied(result, item, snapshot) {
    var still = [];
    (result.applied || []).forEach(function (field) {
      var expected = expectedValue(field, item.values);
      var actual = field === "name" ? snapshot.name : snapshot[field];
      if (field === "category") {
        if (snapshot.categoryIds !== undefined && item.values.categoryId && snapshot.categoryIds.indexOf(item.values.categoryId) < 0) {
          result.skipped.push({ field: field, reason: "발주오라에 저장된 카테고리가 다릅니다." });
          return;
        }
      } else if (field === "groupPrice" && actual === undefined) {
        // 그룹 가격을 다시 읽을 수 없으면 보낸 것으로 둡니다.
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
          var forbidden = forbiddenProperties(messages).filter(function (name) { return name in body; });
          if (forbidden.length > 0) {
            forbidden.forEach(function (name) { delete body[name]; removed.push(name); });
            if (Object.keys(body).length === 0) throw error;
            continue;
          }
          var missing = source ? missingProperties(messages).filter(function (name) { return !(name in body) && name in source; }) : [];
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

    async function loadCategories() {
      try {
        var payload = unwrap(await api("GET", "merchant/categories/tree"));
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
          payload = unwrap(await api("GET", "products", undefined, { params: { page: page, limit: limit } }));
        } catch (error) {
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
      var detail = unwrap(await api("GET", "products/" + encodeURIComponent(id)));
      if (isObject(detail) && isObject(detail.product) && typeof detail.product.id === "string" && !detail.id) detail = detail.product;
      if (!state.structure.productDetail && isObject(detail)) state.structure.productDetail = structureOf(detail);
      return detail;
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
      var needsDetail = products.some(function (snapshot) { return snapshot.categoryIds === undefined || snapshot.groupPrice === undefined || !snapshot.code; });
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
          group: first ? group : undefined,
          diagnostics: last ? diagnostics({ group: group, categories: categories.length, products: products.length, bundles: snapshots.length - products.length }) : undefined
        });
        report.progress(Math.min(index + batchSize, snapshots.length), snapshots.length, "DB센터로 결과를 보내는 중…");
        if (last) break;
      }
      return { received: snapshots.length, products: products.length };
    }

    async function uploadImage(item, code) {
      var response = await env.fetch(env.doogoOrigin + "/api/baljuora/runner/" + encodeURIComponent(code) + "/image/" + encodeURIComponent(item.productId));
      if (!response.ok) {
        var failure = await response.json().catch(function () { return null; });
        throw SyncError((failure && failure.error && failure.error.message) || "DB센터 이미지를 받지 못했습니다.");
      }
      var blob = await response.blob();
      var type = blob.type || "image/jpeg";
      var extension = (type.split("/")[1] || "jpg").replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "");
      var fileName = String(item.code || item.productId).replace(/[^A-Za-z0-9_-]/g, "") + "." + extension;
      var presignBody = { fileName: fileName, contentType: type, fileSize: blob.size, category: "product-image" };
      var presign = unwrap(await sendAdaptive("POST", "files/presign", presignBody, null));
      if (!state.structure.filesPresign) state.structure.filesPresign = structureOf(presign);
      var target = isObject(presign) && isObject(presign.file) ? Object.assign({}, presign, presign.file) : presign;
      var uploadUrl = target && (target.uploadUrl || target.presignedUrl || target.signedUrl || target.putUrl || target.url);
      var fileUrl = target && (target.fileUrl || target.publicUrl || target.cdnUrl || target.downloadUrl || (target.key ? "https://files.baljuora.com/" + String(target.key).replace(/^\//, "") : null));
      if (!uploadUrl) throw SyncError("발주오라 이미지 업로드 주소를 받지 못했습니다.");
      var uploaded;
      if (isObject(target.fields)) {
        var form = new env.FormData();
        Object.keys(target.fields).forEach(function (key) { form.append(key, target.fields[key]); });
        form.append("file", blob, fileName);
        uploaded = await env.fetch(uploadUrl, { method: "POST", body: form });
      } else {
        uploaded = await env.fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": type }, body: blob });
      }
      note("upload:image", uploaded.status);
      if (!uploaded.ok) throw SyncError("발주오라 저장소에 이미지를 올리지 못했습니다(" + uploaded.status + ").");
      if (!fileUrl) fileUrl = String(uploadUrl).split("?")[0];
      return fileUrl;
    }

    async function applyPricing(id, detail, item, fields, result, context) {
      var body = {};
      var values = item.values;
      if (fields.indexOf("supplyPrice") >= 0) body.supplyPrice = values.supplyPrice;
      if (fields.indexOf("consumerPrice") >= 0) body.consumerPrice = values.consumerPrice;
      if (fields.indexOf("purchaseCost") >= 0 && values.purchaseCost !== null) body.purchaseCost = values.purchaseCost;
      var groupKey = null;
      if (fields.indexOf("groupPrice") >= 0) {
        var pricing = buildGroupPricing(detail, context.group, context.groupKeyword, values.groupPrice);
        if (pricing) {
          body[pricing.key] = pricing.value;
          groupKey = pricing.key;
        } else {
          result.skipped.push({ field: "groupPrice", reason: context.group ? "발주오라 상품 정보에서 매출처 그룹 공급가 칸을 찾지 못했습니다." : "발주오라에서 '" + context.groupKeyword + "' 매출처 그룹을 찾지 못했습니다." });
        }
      }
      if (Object.keys(body).length === 0) return;
      var tracker = {};
      await sendAdaptive("PUT", "products/" + encodeURIComponent(id) + "/pricing", body, writable(detail), tracker);
      fields.forEach(function (field) {
        var key = field === "groupPrice" ? groupKey : field;
        if (!key || !(key in body)) {
          if (field !== "groupPrice" || groupKey) result.skipped.push({ field: field, reason: "발주오라가 이 칸을 받지 않았습니다." });
          return;
        }
        result.applied.push(field);
      });
    }

    async function applyInfo(id, detail, item, fields, result, code) {
      var body = {};
      var sent = {};
      if (fields.indexOf("name") >= 0 && item.values.name) {
        body.name = item.values.name;
        sent.name = "name";
      }
      if (fields.indexOf("category") >= 0) {
        if (!item.values.categoryId) {
          result.skipped.push({ field: "category", reason: "DB센터 카테고리와 연결한 발주오라 카테고리가 없습니다(동기화 설정 > 카테고리 연결)." });
        } else {
          var key = categoryKeyOf(detail);
          body[key] = key === "categoryIds" ? [item.values.categoryId] : item.values.categoryId;
          sent.category = key;
        }
      }
      if (fields.indexOf("image") >= 0) {
        try {
          var url = await uploadImage(item, code);
          var existing = extractImages(detail).filter(function (value) { return value !== url; });
          body.imageUrls = [url].concat(existing.slice(1)).slice(0, 10);
          sent.image = "imageUrls";
        } catch (error) {
          result.skipped.push({ field: "image", reason: describeError(error) });
        }
      }
      if (Object.keys(body).length === 0) return;
      await sendAdaptive("PUT", "products/" + encodeURIComponent(id) + "/info", body, writable(detail));
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
        var priceFields = fields.filter(function (field) { return PRICE_FIELDS.indexOf(field) >= 0; });
        var infoFields = fields.filter(function (field) { return INFO_FIELDS.indexOf(field) >= 0; });
        if (priceFields.length) await applyPricing(id, detail, item, priceFields, result, context);
        if (infoFields.length) await applyInfo(id, detail, item, infoFields, result, code);
        var after = normalizeProduct(await getDetail(id), context);
        if (after) {
          verifyApplied(result, item, after);
          result.snapshot = after;
          result.code = after.code || result.code;
        }
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
      var context = { group: group, groupKeyword: plan.groupKeyword, existingCodes: null };
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
      return { version: VERSION, at: new Date().toISOString(), structure: state.structure, endpoints: state.endpoints, errors: state.errors.slice(0, 30), extra: extra || {} };
    }

    return { api: api, refreshToken: refreshToken, runCompare: runCompare, runPush: runPush, pushItem: pushItem, diagnostics: diagnostics, state: state };
  }

  // ─── 화면(발주오라 창 오른쪽 아래 작은 패널) ─────────────────────────────────

  function createPanel(doc) {
    var old = doc.getElementById("doogo-sync-panel");
    if (old) old.remove();
    var panel = doc.createElement("section");
    panel.id = "doogo-sync-panel";
    panel.setAttribute("role", "status");
    panel.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483647;width:min(420px,calc(100vw - 36px));max-height:70vh;display:flex;flex-direction:column;gap:10px;padding:16px 16px 14px;border:2px solid #163300;border-radius:16px;background:#fff;color:#0e0f0c;box-shadow:0 18px 50px rgba(0,0,0,.25);font:14px/1.5 -apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;";
    panel.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><strong style="font-size:15px">두고푸드 DB센터 → 발주오라 동기화</strong><button type="button" data-close aria-label="닫기" style="border:0;background:#f1f3ef;border-radius:8px;padding:4px 10px;font-size:13px;cursor:pointer">닫기</button></div><p data-status style="margin:0;font-weight:700"></p><div style="height:8px;border-radius:99px;background:#e8ebe6;overflow:hidden"><div data-bar style="height:100%;width:0;background:#9fe870;transition:width .3s"></div></div><ol data-log style="margin:0;padding:0 0 0 18px;overflow:auto;max-height:36vh;font-size:12.5px;color:#454745"></ol><small style="color:#6b6e6a">이 창을 닫지 말고 끝날 때까지 기다려 주세요. 결과는 DB센터 동기화 화면에도 그대로 보입니다.</small>';
    doc.body.appendChild(panel);
    panel.querySelector("[data-close]").addEventListener("click", function () { panel.remove(); });
    return {
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
      }
    };
  }

  function readCode(win) {
    var match = /doogo-sync=([0-9A-Za-z-]{10,16})/.exec(win.location.hash || "") || /doogo-sync=([0-9A-Za-z-]{10,16})/.exec(win.location.search || "");
    var stored = null;
    try { stored = win.sessionStorage.getItem("doogo-sync-code"); } catch { stored = null; }
    if (match) {
      try { win.sessionStorage.setItem("doogo-sync-code", match[1]); } catch { /* 저장이 막힌 브라우저 */ }
      try { win.history.replaceState(null, "", win.location.pathname + win.location.search.replace(/[?&]doogo-sync=[^&]*/, "")); } catch { /* 무시 */ }
      return match[1];
    }
    var typed = win.prompt("DB센터 '발주오라 동기화' 화면에 보이는 작업 코드 10글자를 입력해 주세요.", stored || "");
    return typed ? typed.trim() : null;
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
    if (!doogoOrigin) {
      win.alert("DB센터 주소를 알 수 없습니다. DB센터 동기화 화면에서 책갈피를 다시 만들어 주세요.");
      return;
    }
    var code = readCode(win);
    if (!code) return;
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
      runner = createRunner({ fetch: win.fetch.bind(win), FormData: win.FormData, locks: win.navigator && win.navigator.locks, consoleOrigin: win.location.origin, apiBase: win.__doogoSyncApiBase || API_BASE, doogoOrigin: doogoOrigin });
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
    writable: writable,
    buildGroupPricing: buildGroupPricing,
    buildCreateBody: buildCreateBody,
    verifyApplied: verifyApplied,
    createRunner: createRunner,
    readCode: readCode,
    main: main
  };

  var scope = typeof window !== "undefined" ? window : globalThis;
  if (scope.__DOOGO_SYNC_TEST__) {
    scope.__DOOGO_SYNC_TEST__.internals = internals;
    return;
  }
  main(scope);
})();
