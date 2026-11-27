// 발주오라 동기화 책갈피 스크립트(public/baljuora-sync.js, 2026-11-22).
// 실제 발주오라 대신 가짜 API로 비교(읽기)·보내기(가격·그룹 공급가·카테고리·이미지·신규 등록) 흐름을 확인합니다.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

let internals: any;

beforeAll(() => {
  // 테스트를 앱 폴더에서 돌리든 저장소 맨 위에서 돌리든 같은 파일을 찾습니다.
  const file = [resolve(process.cwd(), "public/baljuora-sync.js"), resolve(process.cwd(), "apps/client/public/baljuora-sync.js")].find((candidate) => existsSync(candidate));
  if (!file) throw new Error("public/baljuora-sync.js를 찾지 못했습니다.");
  const source = readFileSync(file, "utf8");
  // 요청 간격·429 대기(1.9.1)는 테스트에서 실제로 기다리지 않습니다(기다린 시간을 확인하는 테스트는 env.sleep을 따로 줌).
  (window as any).__DOOGO_SYNC_TEST__ = { sleep: async () => undefined };
  new Function(source)();
  internals = (window as any).__DOOGO_SYNC_TEST__.internals;
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const GROUP = { id: "grp-1", name: "황금농부 수강생" };

// 발주오라 배송비 정책(매출배송정책): 목록에는 구간(rules)이 없고 정책 상세에 있습니다.
const BJ_POLICIES = [
  { id: "bj-pol-1", code: "SP100", name: "택배 3000", type: "fixed", fixedFee: 3000, isConditionRepeat: false, isSameOrderFree: false, isJejuAndRemoteAdditionalFee: false, jejuAdditionalFee: 0, remoteAdditionalFee: 0, rules: [] },
  { id: "bj-pol-2", code: "SP200", name: "조건부무료", type: "byPrice", fixedFee: null, isConditionRepeat: false, isSameOrderFree: false, isJejuAndRemoteAdditionalFee: true, jejuAdditionalFee: 3000, remoteAdditionalFee: 5000, rules: [{ id: "r1", startRange: "0.00", endRange: "30000.00", fee: 3000, unitType: "won" }, { id: "r2", startRange: "30000.00", endRange: null, fee: 0, unitType: "won" }] }
];

// 실제 발주오라 상품 수정(PUT products/:id, 2026-11-23 화면 코드 확인): 바뀐 칸만 받고,
// 개별공급가는 sellerProductPrices 목록 전체 [{ targetType: "group" | "seller", targetId, shippingPolicyId?, supplyPrice }]로 바꿉니다.
function applyProductPut(product: any, body: any, options: { allowed?: string[]; rowAllowed?: string[]; ignoreImageUrls?: boolean } = {}) {
  if (!product) return jsonResponse(404, { statusCode: 404, message: "Not Found" });
  const allowed = options.allowed ?? ["sellerProductPrices", "sellShippingPolicyId", "imageUrls", "productSuppliers", "categoryIds"];
  const extra = Object.keys(body).filter((key) => !allowed.includes(key));
  if (extra.length) return jsonResponse(400, { statusCode: 400, message: extra.map((key) => `property ${key} should not exist`), error: "Bad Request" });
  // 상품 이미지(imageUrls): 발주오라 상품 화면은 최대 5장(2026-11-23 화면 코드 maxFiles 5).
  if (body.imageUrls !== undefined) {
    if (!Array.isArray(body.imageUrls) || body.imageUrls.some((url: unknown) => typeof url !== "string")) return jsonResponse(400, { statusCode: 400, message: ["each value in imageUrls must be a string"], error: "Bad Request" });
    if (body.imageUrls.length > 5) return jsonResponse(400, { statusCode: 400, message: ["imageUrls must contain no more than 5 elements"], error: "Bad Request" });
  }
  if (body.sellerProductPrices !== undefined) {
    const rowAllowed = options.rowAllowed ?? ["targetType", "targetId", "shippingPolicyId", "supplyPrice"];
    const errors: string[] = [];
    body.sellerProductPrices.forEach((row: any, index: number) => {
      Object.keys(row).filter((key) => !rowAllowed.includes(key)).forEach((key) => errors.push(`sellerProductPrices.${index}.property ${key} should not exist`));
      if (!["group", "seller"].includes(row.targetType)) errors.push(`sellerProductPrices.${index}.targetType must be one of the following values: seller, group`);
      if (typeof row.targetId !== "string" || !row.targetId) errors.push(`sellerProductPrices.${index}.targetId should not be empty`);
      if (typeof row.supplyPrice !== "number" || row.supplyPrice < 0) errors.push(`sellerProductPrices.${index}.supplyPrice must not be less than 0`);
    });
    if (errors.length) return jsonResponse(400, { statusCode: 400, message: errors, error: "Bad Request" });
    const before: any[] = product.prices || [];
    product.prices = body.sellerProductPrices.map((row: any, index: number) => {
      const previous = before.find((old) => old.targetType === row.targetType && old.targetId === row.targetId);
      const target = row.targetType === "group"
        ? { sellerGroup: previous?.sellerGroup ?? { id: row.targetId, name: row.targetId === GROUP.id ? GROUP.name : "기타 그룹" } }
        : { seller: previous?.seller ?? { id: row.targetId, companyName: "매출처" } };
      return { id: previous?.id ?? `pr-new-${index}`, productId: product.id, targetType: row.targetType, targetId: row.targetId, shippingPolicyId: row.shippingPolicyId ?? null, supplyPrice: row.supplyPrice, ...target };
    });
  }
  // 매입처 목록(productSuppliers, 2026-11-24 발주오라 상품 수정 화면 코드 확인): 목록 전체로 바꾸고, 기본 매입처는 정확히 1개, 매입원가는 0 이상.
  if (body.productSuppliers !== undefined) {
    const rows: any[] = body.productSuppliers;
    const errors: string[] = [];
    if (!Array.isArray(rows) || rows.length === 0) errors.push("최소 1개의 매입처가 필요합니다.");
    else {
      rows.forEach((row, index) => {
        Object.keys(row).filter((key) => !["supplierId", "shippingPolicyId", "purchaseCost", "materialCost", "isDefault"].includes(key)).forEach((key) => errors.push(`productSuppliers.${index}.property ${key} should not exist`));
        if (typeof row.supplierId !== "string" || !row.supplierId) errors.push(`productSuppliers.${index}.supplierId should not be empty`);
        if (typeof row.purchaseCost !== "number" || row.purchaseCost < 0) errors.push(`productSuppliers.${index}.purchaseCost must not be less than 0`);
      });
      if (rows.filter((row) => row.isDefault === true).length !== 1) errors.push("기본 매입처는 정확히 1개만 지정해야 합니다.");
    }
    if (errors.length) return jsonResponse(400, { statusCode: 400, message: errors, error: "Bad Request" });
    const before: any[] = product.productSuppliers || [];
    product.productSuppliers = rows.map((row: any, index: number) => {
      const previous = before.find((old) => (old.supplier?.id ?? old.supplierId) === row.supplierId);
      return { id: previous?.id ?? `ps-new-${index}`, supplier: previous?.supplier ?? { id: row.supplierId, name: "매입처" }, shippingPolicy: row.shippingPolicyId ? previous?.shippingPolicy?.id === row.shippingPolicyId ? previous.shippingPolicy : { id: row.shippingPolicyId } : null, purchaseCost: row.purchaseCost, materialCost: row.materialCost ?? null, isDefault: row.isDefault };
    });
  }
  if (body.sellShippingPolicyId !== undefined) {
    product.sellShippingPolicyId = body.sellShippingPolicyId;
    product.shippingPolicy = BJ_POLICIES.find((item) => item.id === body.sellShippingPolicyId) ?? null;
  }
  if (body.imageUrls !== undefined && !options.ignoreImageUrls) product.imageUrls = body.imageUrls;
  // 상품 카테고리(categoryIds = 고른 카테고리 전체, 2026-11-23 발주오라 상품 수정 화면 코드: 수정 본문 categoryIds, 바뀐 칸만 보냄)
  if (body.categoryIds !== undefined) {
    if (!Array.isArray(body.categoryIds) || body.categoryIds.some((id: unknown) => typeof id !== "string")) return jsonResponse(400, { statusCode: 400, message: ["each value in categoryIds must be a string"], error: "Bad Request" });
    product.categoryIds = [...body.categoryIds];
    product.categories = body.categoryIds.map((id: string) => ({ id, name: id }));
  }
  return jsonResponse(200, { statusCode: 200, data: { id: product.id } });
}

// 발주오라 상품 목록(2026-11-27 운영 로그): include에 categories가 없으면 모든 상품의 categoryIds·categories가 빈 칸([])으로 옵니다
// (같은 상품 상세는 include=categories로 카테고리가 옴). rejectCategories = 카테고리 include 거절(400), ignoreCategories = 받아도 빈 칸.
function listCategoriesOf(product: any, include: string | null, options: { ignoreCategories?: boolean } = {}) {
  const withCategories = Boolean(include && include.split(",").includes("categories")) && !options.ignoreCategories;
  return withCategories ? { categoryIds: [...(product.categoryIds || [])], categories: [...(product.categories || [])] } : { categoryIds: [], categories: [] };
}

function createFake(options: { pricingAllowed?: string[]; validToken?: string; doogoImage?: { type: string; size: number }; ignoreImageUrls?: boolean; listSuppliers?: boolean; listRejectsCategories?: boolean; listIgnoresCategories?: boolean; throttle?: (method: string, path: string) => boolean } = {}) {
  const products: Record<string, any> = {
    "bj-a": {
      id: "bj-a", code: "BJT-001", name: "봄날 사과 5kg", supplyPrice: 26000, consumerPrice: 39000, purchaseCost: 20000,
      categoryIds: ["bj-cat-fruit"], categories: [{ id: "bj-cat-fruit", name: "과일류" }], imageUrls: ["https://files.baljuora.com/a.jpg", "https://files.baljuora.com/a-2.jpg"],
      prices: [{ id: "row-1", productId: "bj-a", targetType: "group", targetId: "grp-1", shippingPolicyId: null, supplyPrice: 24000, sellerGroup: { ...GROUP } }],
      supplier: { id: "sup-1", name: "봄날농원" }, shippingPolicy: { id: "ship-1", name: "무료" }, isVisible: true, isSoldOut: false, isTaxable: false,
      createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z"
    },
    "bj-b": { id: "bj-b", code: "BJT-002", name: "봄날 배", supplyPrice: 38000, consumerPrice: null, purchaseCost: 30000, categoryIds: ["bj-cat-farm"], categories: [{ id: "bj-cat-farm", name: "🥕 농산" }], imageUrls: [], prices: [], supplier: { id: "sup-1", name: "봄날농원" }, isVisible: true, isSoldOut: false }
  };
  const calls: Array<{ method: string; url: string; body?: any }> = [];
  const state = { refreshCount: 0, validToken: options.validToken ?? "t1", presigns: [] as any[], uploads: [] as Array<{ headers: Record<string, string>; size: number; type: string }> };
  const pricingAllowed = options.pricingAllowed ?? ["supplyPrice", "consumerPrice", "purchaseCost"];
  // listSuppliers: 목록에 매입처 목록(include=productSuppliers)이 함께 오는 경우(매입처 이름으로 같은 매입처 상품 찾기, 1.8.0)
  const listView = (product: any, include: string | null) => ({ id: product.id, targetType: "product", code: product.code, name: product.name, supplyPrice: product.supplyPrice, consumerPrice: product.consumerPrice, purchaseCost: product.purchaseCost, imageUrls: product.imageUrls, isVisible: product.isVisible, isSoldOut: product.isSoldOut, ...listCategoriesOf(product, include, { ignoreCategories: options.listIgnoresCategories }), ...(options.listSuppliers && product.productSuppliers ? { productSuppliers: product.productSuppliers } : {}) });
  const fetch = async (input: string, init: RequestInit = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    calls.push({ method, url: input, body });
    const url = new URL(input);
    if (url.origin === "https://console.baljuora.com" && url.pathname === "/api/auth/refresh") {
      state.refreshCount += 1;
      return jsonResponse(200, { accessToken: `t${state.refreshCount}` });
    }
    if (url.origin === "https://api.baljuora.com") {
      const headers = init.headers as Record<string, string>;
      if (headers?.Authorization !== `Bearer ${state.validToken}`) return jsonResponse(401, { statusCode: 401, message: "Unauthorized" });
      const path = url.pathname.replace(/^\//, "");
      // 발주오라 요청 제한(2026-11-27 운영): "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."(429)
      if (options.throttle && options.throttle(method, path)) return jsonResponse(429, { statusCode: 429, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." });
      if (method === "GET" && path === "products") {
        const include = url.searchParams.get("include");
        if (options.listRejectsCategories && include && include.split(",").includes("categories")) return jsonResponse(400, { statusCode: 400, message: ["include must be one of the following values: productSuppliers, prices"], error: "Bad Request" });
        const items: any[] = [...Object.values(products).map((product) => listView(product, include)), { id: "bj-bundle", targetType: "bundle", name: "묶음", imageUrls: [] }];
        return jsonResponse(200, { statusCode: 200, message: "Success", data: { items, meta: { page: 1, limit: 100, total: items.length, totalPages: 1, hasNext: false } } });
      }
      if (method === "GET" && path === "merchant/seller-groups") return jsonResponse(200, { statusCode: 200, data: { items: [GROUP, { id: "grp-2", name: "일반" }], meta: {} } });
      if (method === "GET" && path === "merchant/categories/tree") return jsonResponse(200, { statusCode: 200, data: [{ id: "bj-cat-farm", name: "🥕 농산", children: [{ id: "bj-cat-fruit", name: "과일류", children: [] }] }] });
      if (method === "GET" && path.startsWith("products/")) {
        const product = products[decodeURIComponent(path.slice("products/".length))];
        return product ? jsonResponse(200, { statusCode: 200, data: product }) : jsonResponse(404, { statusCode: 404, message: "Not Found" });
      }
      const match = /^products\/([^/]+)\/(pricing|info)$/.exec(path);
      if (method === "PUT" && match) {
        const allowed = match[2] === "pricing" ? pricingAllowed : ["name", "categoryIds", "imageUrls", "description"];
        const extra = Object.keys(body).filter((key) => !allowed.includes(key));
        if (extra.length) return jsonResponse(400, { statusCode: 400, message: extra.map((key) => `property ${key} should not exist`), error: "Bad Request" });
        const product = products[match[1]];
        // 상품 정보 저장(…/info)은 카테고리(categoryIds)를 오류 없이 버립니다(2026-11-27 운영 절임배추: 응답 200, 다시 읽어도 카테고리 그대로).
        const { categoryIds, ...rest } = body;
        void categoryIds;
        Object.assign(product, rest);
        return jsonResponse(200, { statusCode: 200, data: product });
      }
      const update = /^products\/([^/]+)$/.exec(path);
      if (method === "PUT" && update) return applyProductPut(products[decodeURIComponent(update[1])], body, { ignoreImageUrls: options.ignoreImageUrls });
      if (method === "POST" && path === "files/presign") {
        // 실제 발주오라(2026-11-23 운영): kind·size가 없으면 400 "kind should not be empty / … / size must be an integer number".
        // 받으면 { uploadUrl, headers, file: { value, url, … } } — 발주오라 화면은 file.value 를 imageUrls 에 넣습니다.
        const errors: string[] = [];
        if (typeof body.kind !== "string" || !body.kind) errors.push("kind should not be empty", "kind must be a string");
        if (!Number.isInteger(body.size) || body.size < 1) errors.push("size must not be less than 1", "size must be an integer number");
        if (errors.length) return jsonResponse(400, { statusCode: 400, message: errors, error: "Bad Request" });
        state.presigns.push(body);
        return jsonResponse(201, { statusCode: 201, data: { uploadUrl: "https://s3.example.com/upload?sig=1", headers: { "Content-Type": body.contentType, "x-amz-meta-kind": body.kind }, file: { id: "file-1", name: body.fileName, url: "https://files.baljuora.com/product-image/new.jpg", value: "https://files.baljuora.com/product-image/new.jpg", visibility: "public" } } });
      }
      if (method === "POST" && path === "products") {
        if (!body.supplierId) return jsonResponse(400, { statusCode: 400, message: ["supplierId should not be empty"] });
        // 운영처럼 상품명이 같은 상품은 새로 받지 않음(2026-11-27 운영 "이미 존재하는 상품 명 입니다: …")
        if (Object.values(products).some((product: any) => product.name === body.name)) return jsonResponse(400, { statusCode: 400, message: `이미 존재하는 상품 명 입니다: ${body.name}` });
        const created = { ...body, id: products["bj-new"] ? `bj-new-${Object.keys(products).length}` : "bj-new", code: body.code || "PD999", imageUrls: [], prices: [], supplier: { id: body.supplierId, name: "봄날농원" } };
        delete created.supplierId;
        products[created.id] = created;
        return jsonResponse(201, { statusCode: 201, data: created });
      }
    }
    if (url.origin === "https://s3.example.com") {
      const blob = init.body as Blob;
      state.uploads.push({ headers: init.headers as Record<string, string>, size: blob.size, type: blob.type });
      return new Response("", { status: 200 });
    }
    if (url.origin === "https://doogofood.test") {
      if (options.doogoImage) return new Response(new Uint8Array(options.doogoImage.size), { status: 200, headers: { "Content-Type": options.doogoImage.type } });
      return new Response("image-bytes", { status: 200, headers: { "Content-Type": "image/jpeg" } });
    }
    return jsonResponse(404, { message: `not found ${input}` });
  };
  return { fetch, products, calls, state };
}

function runnerFor(fake: ReturnType<typeof createFake>, extra: Record<string, unknown> = {}) {
  return internals.createRunner({ fetch: fake.fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test", ...extra });
}

function createReport() {
  const posted: any[] = [];
  const logs: string[] = [];
  return { posted, logs, progress: () => undefined, log: (text: string) => { logs.push(text); }, results: async (body: any) => { posted.push(body); return {}; } };
}

// 1.9.2: 보내기 결과는 상품을 보내는 동안 묶어서 따로 보내므로 여러 번에 나눠 올 수 있습니다.
function postedItems(report: { posted: any[] }) {
  return report.posted.flatMap((body) => Array.isArray(body.items) ? body.items : []);
}

function finalPost(report: { posted: any[] }) {
  return report.posted.find((body) => body.final === true);
}

// 가짜 발주오라에 상품을 여럿 넣고, 그 상품들의 공급가를 바꾸는 보내기 항목을 만듭니다.
function addMany(fake: ReturnType<typeof createFake>, count: number) {
  for (let index = 1; index <= count; index += 1) {
    fake.products[`bj-m${index}`] = { id: `bj-m${index}`, code: `M-${index}`, name: `여러 상품 ${index}`, supplyPrice: 10000, consumerPrice: null, purchaseCost: 8000, categoryIds: [], categories: [], imageUrls: [], prices: [], supplier: { id: "sup-1", name: "봄날농원" }, isVisible: true, isSoldOut: false };
  }
}

function manyItems(count: number) {
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    return pushItem({ productId: `p-m${index}`, baljuoraId: `bj-m${index}`, code: `M-${index}`, name: `여러 상품 ${index}`, fields: ["supplyPrice"], values: { ...pushItem({}).values, name: `여러 상품 ${index}`, supplyPrice: 11000 } });
  });
}

// 실제 시간 대신 vitest 가짜 시계로 기다림(요청 간격·429 대기·응답 시간)을 확인합니다(실패도 그대로 돌려줌).
async function withFakeTimers<T>(work: (timers: { sleep: (ms: number) => Promise<void>; now: () => number }) => Promise<T>) {
  vi.useFakeTimers();
  try {
    const settled = work({ sleep: (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); }), now: () => Date.now() }).then((value) => ({ value }), (error) => ({ error }));
    await vi.runAllTimersAsync();
    const outcome: { value?: T; error?: unknown } = await settled;
    if ("error" in outcome) throw outcome.error;
    return outcome.value as T;
  } finally {
    vi.useRealTimers();
  }
}

function runnerWith(fetch: (input: string, init?: RequestInit) => Promise<Response>, timers: Record<string, unknown> = {}) {
  return internals.createRunner({ fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test", ...timers });
}

function pushItem(partial: Record<string, any>) {
  return {
    productId: "p-1", action: "update", baljuoraId: "bj-a", templateId: null, code: "BJT-001", name: "봄날 사과 5kg", supplierName: "봄날농원",
    fields: ["supplyPrice"],
    values: { name: "봄날 사과 5kg", supplyPrice: 27000, groupPrice: 25000, consumerPrice: 39000, purchaseCost: 21000, categoryId: "bj-cat-farm", imageUrl: "https://doogofood.test/apple.jpg", isTaxable: false },
    ...partial
  };
}

describe("발주오라 상품 읽기(값 정리)", () => {
  it("목록 상품: 상품코드·가격·이미지를 읽고, 없는 칸(카테고리·그룹 가격)은 '읽지 못함'으로 둡니다", () => {
    const snapshot = internals.normalizeProduct({ id: "x", code: "C1", name: " 사과  5kg ", supplyPrice: "26,000", consumerPrice: null, imageUrls: ["u1"], targetType: "product" }, {});
    expect(snapshot).toMatchObject({ id: "x", kind: "product", code: "C1", name: "사과 5kg", supplyPrice: 26000, consumerPrice: null, imageUrls: ["u1"] });
    expect("categoryIds" in snapshot).toBe(false);
    expect("groupPrice" in snapshot).toBe(false);
  });

  it("상세 상품: 매출처 그룹(황금농부) 공급가와 카테고리를 읽습니다", () => {
    const fake = createFake();
    const snapshot = internals.normalizeProduct(fake.products["bj-a"], { group: null, groupKeyword: "황금농부" });
    expect(snapshot.groupPrice).toBe(24000);
    expect(snapshot.categoryIds).toEqual(["bj-cat-fruit"]);
    expect(internals.normalizeProduct(fake.products["bj-b"], { group: GROUP, groupKeyword: "황금농부" }).groupPrice).toBeNull();
  });

  it("개별공급가 보낼 값: 발주오라 상품 수정 화면처럼 sellerProductPrices 목록 전체(황금농부 줄만 바꾸고, 없으면 추가)", () => {
    const detail = {
      prices: [
        { id: "pr-1", createdAt: "x", updatedAt: "x", productId: "bj-y", targetType: "group", targetId: "grp-1", shippingPolicyId: null, supplyPrice: 6270, sellerGroup: { ...GROUP } },
        { id: "pr-2", productId: "bj-y", targetType: "seller", targetId: "s-9", shippingPolicyId: "ship-9", supplyPrice: 6000, seller: { id: "s-9", companyName: "황금농부 김씨" } }
      ]
    };
    expect(internals.buildSellerProductPrices(detail, GROUP, "황금농부", 6400)).toEqual([
      { targetType: "group", targetId: "grp-1", supplyPrice: 6400 },
      { targetType: "seller", targetId: "s-9", supplyPrice: 6000, shippingPolicyId: "ship-9" }
    ]);
    expect(internals.buildSellerProductPrices({ prices: [detail.prices[1]] }, GROUP, "황금농부", 6400)).toEqual([
      { targetType: "seller", targetId: "s-9", supplyPrice: 6000, shippingPolicyId: "ship-9" },
      { targetType: "group", targetId: "grp-1", supplyPrice: 6400 }
    ]);
    expect(internals.buildSellerProductPrices({ prices: [] }, GROUP, "황금농부", 6400)).toEqual([{ targetType: "group", targetId: "grp-1", supplyPrice: 6400 }]);
    // 목록을 못 읽었거나, 대상·공급가를 모르는 줄이 있거나(다른 매출처 값 보호), 그룹을 모르면 보내지 않습니다.
    expect(internals.buildSellerProductPrices({}, GROUP, "황금농부", 6400)).toBeNull();
    expect(internals.buildSellerProductPrices({ prices: [{ targetType: "seller", supplyPrice: 6000 }] }, GROUP, "황금농부", 6400)).toBeNull();
    expect(internals.buildSellerProductPrices({ prices: [{ targetType: "seller", targetId: "s-1", supplyPrice: null }] }, GROUP, "황금농부", 6400)).toBeNull();
    expect(internals.buildSellerProductPrices({ prices: [] }, null, "황금농부", 6400)).toBeNull();
  });

  it("발주오라 오류 문구에서 받지 않는 칸·빈 칸 이름을 찾습니다", () => {
    expect(internals.forbiddenProperties(["property purchaseCost should not exist", "property a.b should not exist"])).toEqual(["purchaseCost", "a"]);
    expect(internals.missingProperties(["supplierId should not be empty", "supplyPrice must be a number conforming to the specified constraints"])).toEqual(["supplierId", "supplyPrice"]);
  });
});

describe("비교(읽기만)", () => {
  it("상품 목록 + 연결된 상품 상세를 읽어 DB센터로 보냅니다(발주오라는 바꾸지 않음)", async () => {
    const fake = createFake();
    const runner = runnerFor(fake);
    const report = createReport();
    const result = await runner.runCompare({ type: "compare", groupKeyword: "황금농부", detailIds: ["bj-a", "bj-b"] }, report);
    expect(result).toEqual({ received: 3, products: 2, sales: null });
    expect(fake.calls.some((call) => call.method !== "GET" && call.url.startsWith("https://api.baljuora.com"))).toBe(false);
    const [batch] = report.posted;
    expect(batch.final).toBe(true);
    expect(batch.group).toEqual(GROUP);
    expect(batch.categories.map((category: any) => category.path)).toEqual(["🥕 농산", "🥕 농산 > 과일류"]);
    const apple = batch.snapshots.find((snapshot: any) => snapshot.id === "bj-a");
    expect(apple).toMatchObject({ code: "BJT-001", supplyPrice: 26000, groupPrice: 24000, categoryIds: ["bj-cat-fruit"] });
    // 발주오라 번호(1.11.0): 등록일시(상세에서)와 발주오라 목록 순서(0 = 맨 위)를 함께 보냅니다 — DB센터 상품 리스트 줄 앞 숫자
    expect(apple).toMatchObject({ createdAt: "2026-10-01T00:00:00Z", position: 0 });
    expect(batch.snapshots.map((snapshot: any) => [snapshot.id, snapshot.position])).toEqual([["bj-a", 0], ["bj-b", 1], ["bj-bundle", 2]]);
    expect(batch.snapshots.find((snapshot: any) => snapshot.id === "bj-bundle").kind).toBe("bundle");
    expect(batch.diagnostics.structure.productList.supplyPrice).toBe("number");
    expect(batch.diagnostics.structure.productDetail.prices[0]).toBe("array");
  });
});

// 2026-11-27 운영(절임배추·맞추기 카드 '카테고리 2,129'): 발주오라 목록은 categories를 include하지 않으면 모든 상품의 categoryIds가 빈 칸이라,
// 1.9.0까지는 모든 상품이 "카테고리 없음"으로 비교됐습니다. 1.9.1은 목록에서 카테고리를 함께 읽고, 못 읽으면 연결된 상품 상세에서 읽습니다.
describe("비교: 상품 카테고리 읽기(1.9.1)", () => {
  const compare = async (fake: ReturnType<typeof createFake>, detailIds: string[]) => {
    const report = createReport();
    await runnerFor(fake).runCompare({ type: "compare", groupKeyword: "황금농부", detailIds }, report);
    const snapshots = report.posted.flatMap((body: any) => body.snapshots ?? []);
    return { report, snapshots, last: report.posted[report.posted.length - 1] };
  };
  const listCalls = (fake: ReturnType<typeof createFake>) => fake.calls.filter((call) => call.method === "GET" && new URL(call.url).pathname === "/products");

  it("목록을 include=productSuppliers,prices,categories로 읽어 상세 없이도 상품 카테고리를 압니다", async () => {
    const fake = createFake();
    const { snapshots, last } = await compare(fake, []);
    expect(new URL(listCalls(fake)[0].url).searchParams.get("include")).toBe("productSuppliers,prices,categories");
    expect(snapshots.find((snapshot: any) => snapshot.id === "bj-a").categoryIds).toEqual(["bj-cat-fruit"]);
    expect(snapshots.find((snapshot: any) => snapshot.id === "bj-b").categoryIds).toEqual(["bj-cat-farm"]);
    expect(last.diagnostics.extra).toMatchObject({ listInclude: "productSuppliers,prices,categories", productCategories: "list", withCategory: 2 });
  });

  it("목록이 카테고리 include를 거절(400)하면 예전 include로 다시 읽고, 빈 카테고리는 '읽지 못함'으로 두어 연결된 상품 상세에서 읽습니다", async () => {
    const fake = createFake({ listRejectsCategories: true });
    const { snapshots, last } = await compare(fake, ["bj-a"]);
    expect(listCalls(fake).map((call) => new URL(call.url).searchParams.get("include"))).toEqual(["productSuppliers,prices,categories", "productSuppliers,prices"]);
    expect(snapshots.find((snapshot: any) => snapshot.id === "bj-a").categoryIds).toEqual(["bj-cat-fruit"]); // 상세에서 읽음
    // 연결 안 된 상품(상세를 안 읽음)은 '카테고리 없음'([])이 아니라 '읽지 못함'(칸 없음) — 서버가 카테고리를 다르다고 보지 않음
    expect("categoryIds" in snapshots.find((snapshot: any) => snapshot.id === "bj-b")).toBe(false);
    expect(last.diagnostics.extra).toMatchObject({ listInclude: "productSuppliers,prices", productCategories: "detail" });
    expect(last.diagnostics.errors).toEqual(expect.arrayContaining([expect.objectContaining({ path: "GET products?include=productSuppliers,prices,categories", status: 400 })]));
  });

  it("목록이 카테고리 include를 받아도 모든 상품이 빈 칸이면 믿지 않고 상세에서 읽습니다(1.9.0까지 '카테고리 없음' 2,129개)", async () => {
    const fake = createFake({ listIgnoresCategories: true });
    const { snapshots, last } = await compare(fake, ["bj-a", "bj-b"]);
    expect(snapshots.find((snapshot: any) => snapshot.id === "bj-a").categoryIds).toEqual(["bj-cat-fruit"]);
    expect(snapshots.find((snapshot: any) => snapshot.id === "bj-b").categoryIds).toEqual(["bj-cat-farm"]);
    expect(fake.calls.filter((call) => call.method === "GET" && /\/products\/bj-[ab]$/.test(new URL(call.url).pathname))).toHaveLength(2);
    expect(last.diagnostics.extra.productCategories).toBe("detail");
  });
});

describe("보내기: 상품 카테고리(1.9.1)", () => {
  const categoryPuts = (fake: ReturnType<typeof createFake>) => fake.calls.filter((call) => call.method === "PUT" && call.body?.categoryIds);
  const run = async (fake: ReturnType<typeof createFake>, item: Record<string, any>, extra: Record<string, unknown> = {}) => {
    const report = createReport();
    const summary = await runnerFor(fake, extra).runPush({ type: "push", groupKeyword: "황금농부", groupId: GROUP.id, items: [pushItem(item)], categoryExclude: ["브랜드별"] }, report, "ABCDE23456");
    return { summary, report, result: report.posted[report.posted.length - 1].items[0] };
  };

  it("지금 발주오라 카테고리가 연결 카테고리의 아래(🥕 농산 > 과일류)면 보내지 않고 '반영됨', 저장 요청이 없으면 상품을 다시 읽지 않습니다", async () => {
    const fake = createFake();
    const { summary, result } = await run(fake, { fields: ["category"] });
    expect(summary).toEqual({ ok: 1, failed: 0 });
    expect(result).toMatchObject({ ok: true, applied: ["category"], skipped: [] });
    expect(fake.calls.filter((call) => call.method !== "GET" && call.url.startsWith("https://api.baljuora.com"))).toEqual([]);
    expect(fake.products["bj-a"].categoryIds).toEqual(["bj-cat-fruit"]); // 세부 카테고리를 뭉개지 않음
    expect(fake.calls.filter((call) => call.method === "GET" && call.url.startsWith("https://api.baljuora.com/products/bj-a"))).toHaveLength(1);
  });

  it("'발주오라 → DB센터' 연결로 같은 DB센터 카테고리인 발주오라 카테고리(values.categoryIds)에 있어도 보내지 않습니다", async () => {
    const fake = createFake();
    fake.products["bj-a"].categoryIds = ["bj-cat-kimchi"];
    const { result } = await run(fake, { fields: ["category"], values: { ...pushItem({}).values, categoryId: "bj-cat-farm", categoryIds: ["bj-cat-farm", "bj-cat-kimchi"] } });
    expect(result).toMatchObject({ ok: true, applied: ["category"] });
    expect(categoryPuts(fake)).toEqual([]);
  });

  it("다른 카테고리면 상품 수정으로 바꾸고, 다시 읽어 확인합니다(브랜드별 아래 카테고리는 그대로)", async () => {
    const fake = createFake();
    fake.products["bj-a"].categoryIds = ["bj-cat-other", "bj-brand-bon"];
    const tree = [{ id: "bj-cat-farm", name: "🥕 농산", children: [{ id: "bj-cat-fruit", name: "과일류", children: [] }] }, { id: "bj-cat-other", name: "🥦 식자재", children: [] }, { id: "bj-brand", name: "🌏 브랜드별", children: [{ id: "bj-brand-bon", name: "본", children: [] }] }];
    const fetch = async (input: string, init: RequestInit = {}) => new URL(input).pathname === "/merchant/categories/tree" ? jsonResponse(200, { data: tree }) : fake.fetch(input, init);
    const report = createReport();
    await internals.createRunner({ fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" }).runPush({ type: "push", groupKeyword: "황금농부", groupId: GROUP.id, items: [pushItem({ fields: ["category"] })], categoryExclude: ["브랜드별"] }, report, "ABCDE23456");
    expect(categoryPuts(fake).map((call) => call.body)).toEqual([{ categoryIds: ["bj-cat-farm", "bj-brand-bon"] }]);
    expect(fake.products["bj-a"].categoryIds).toEqual(["bj-cat-farm", "bj-brand-bon"]);
    expect(report.posted[0].items[0]).toMatchObject({ ok: true, applied: ["category"], skipped: [] });
    expect(report.posted[0].items[0].snapshot.categoryIds).toEqual(["bj-cat-farm", "bj-brand-bon"]);
  });

  it("상세를 include 없이 읽었으면(지금 카테고리를 모름) 다른 카테고리가 지워지지 않게 보내지 않고 이유를 알립니다", async () => {
    const fake = createFake();
    const fetch = async (input: string, init: RequestInit = {}) => {
      const url = new URL(input);
      if (/^\/products\/bj-a$/.test(url.pathname) && url.searchParams.has("include")) return jsonResponse(400, { statusCode: 400, message: ["include must be a string"] });
      return fake.fetch(input, init);
    };
    const runner = internals.createRunner({ fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const result = await runner.pushItem(pushItem({ fields: ["category"] }), { groupKeyword: "황금농부" }, { group: GROUP, groupKeyword: "황금농부" }, "CODE");
    expect(result.ok).toBe(false);
    expect(result.skipped[0].reason).toContain("지금 카테고리를 읽지 못해 보내지 않았습니다");
    expect(fake.calls.filter((call) => call.method === "PUT")).toEqual([]);
  });

  it("카테고리 저장이 어긋나면 상품 수정 화면 코드에서 categoryIds 부분을 먼저 찾아 기술 정보로 남깁니다", async () => {
    const fake = createFake();
    fake.products["bj-a"].categoryIds = ["bj-cat-other"];
    const form = "static/chunks/6882-form.js";
    const fetch = async (input: string, init: RequestInit = {}) => {
      const url = new URL(input);
      if (url.origin === "https://console.baljuora.com" && url.pathname !== "/api/auth/refresh") {
        if (url.pathname === "/doogobiz24/products/bj-a") return new Response(`1:I[1,["${form}","static/chunks/app/console/%5Bmerchant%5D/products/%5Bid%5D/page-p.js"],"default"]`, { status: 200 });
        if (url.pathname === `/_next/${form}`) return new Response('x;label:"개별공급가";return h.categoryIds=t,h};W=(e,t)=>{switch(e){case"categoryIds":return[...t].sort()}}', { status: 200 });
        return new Response("", { status: 404 });
      }
      // 상품 수정이 categoryIds를 오류 없이 버리는 경우(저장은 됐다고 하지만 다시 읽으면 그대로)
      if ((init.method || "GET").toUpperCase() === "PUT" && url.pathname === "/products/bj-a") return jsonResponse(200, { data: { id: "bj-a" } });
      return fake.fetch(input, init);
    };
    const runner = internals.createRunner({ fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", pagePath: "/doogobiz24/dashboard", loadedScripts: [], apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const report = createReport();
    await runner.runPush({ type: "push", groupKeyword: "황금농부", groupId: GROUP.id, items: [pushItem({ fields: ["category"] })] }, report, "ABCDE23456");
    const posted = report.posted[report.posted.length - 1];
    expect(posted.items[0].skipped[0].reason).toContain("저장된 카테고리가 다릅니다(보낸 카테고리: 🥕 농산 · 저장 뒤 다시 읽은 카테고리: bj-cat-o)");
    expect(posted.diagnostics.discovery.snippets[0]).toMatchObject({ anchor: "categoryIds" });
  });
});

describe("발주오라 요청 제한(429)·요청 간격(1.9.1)", () => {
  const throttleSeconds = (progress: string[]) => progress.map((text) => /(\d+)초 쉬었다가 이어서 보내요\((\d+)번째\)/.exec(text)).filter(Boolean).map((match) => Number(match![1]));

  it("429를 받으면 점점 길게 쉬었다가 같은 요청을 다시 보내고, 패널에 기다린다고 알립니다", async () => {
    let throttles = 2;
    const fake = createFake({ throttle: (method, path) => method === "GET" && path === "products/bj-a" && throttles-- > 0 });
    const report = createReport();
    const progress: string[] = [];
    (report as any).progress = (_done: number, _total: number, text: string) => { progress.push(text); };
    const { summary, runner, elapsed } = await withFakeTimers(async (timers) => {
      const startedAt = Date.now();
      const runner = runnerFor(fake, timers);
      const summary = await runner.runPush({ type: "push", groupKeyword: "황금농부", groupId: GROUP.id, items: [pushItem({ fields: ["supplyPrice"] })] }, report, "ABCDE23456");
      return { summary, runner, elapsed: Date.now() - startedAt };
    });
    expect(summary).toEqual({ ok: 1, failed: 0 });
    expect(throttleSeconds(progress)).toEqual([2, 4]);
    expect(progress.find((text) => text.includes("요청이 너무 많다"))).toContain("1 / 1 봄날 사과 5kg");
    expect(elapsed).toBeGreaterThanOrEqual(6000); // 2초 + 4초를 실제로 기다림
    expect(runner.state.throttled).toBe(2);
    expect(runner.state.gapMs).toBeGreaterThan(150); // 간격을 늘렸다가(800ms) 성공할 때마다 조금씩 줄임
    expect(report.logs.filter((line) => line.includes("발주오라 요청 제한(429)"))).toHaveLength(1); // 기록 줄은 1분에 한 번
    expect(finalPost(report).diagnostics).toMatchObject({ throttled: 2, stats: { pausedSeconds: 6 } });
    expect(postedItems(report)[0]).toMatchObject({ ok: true, applied: ["supplyPrice"] });
  });

  it("발주오라가 Retry-After(초)를 알려 주면 그만큼(최대 1분) 기다립니다", async () => {
    const fake = createFake();
    let first = true;
    const fetch = async (input: string, init: RequestInit = {}) => {
      if (first && new URL(input).pathname === "/products/bj-a") {
        first = false;
        return new Response(JSON.stringify({ statusCode: 429, message: "요청이 너무 많습니다." }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "7" } });
      }
      return fake.fetch(input, init);
    };
    const report = createReport();
    const progress: string[] = [];
    (report as any).progress = (_done: number, _total: number, text: string) => { progress.push(text); };
    await withFakeTimers((timers) => internals.createRunner({ fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test", ...timers }).runPush({ type: "push", groupKeyword: "황금농부", groupId: GROUP.id, items: [pushItem({ fields: ["supplyPrice"] })] }, report, "ABCDE23456"));
    expect(throttleSeconds(progress)).toEqual([7]);
    expect(postedItems(report)[0]).toMatchObject({ ok: true });
  });

  it("계속 429면 8번까지 쉬었다가 다시 보낸 뒤 그 상품만 실패로 알리고 다음 상품으로 갑니다", async () => {
    const fake = createFake({ throttle: (method, path) => method === "GET" && path === "products/bj-a" });
    const report = createReport();
    const progress: string[] = [];
    (report as any).progress = (_done: number, _total: number, text: string) => { progress.push(text); };
    const summary = await withFakeTimers((timers) => runnerFor(fake, timers).runPush({ type: "push", groupKeyword: "황금농부", groupId: GROUP.id, items: [pushItem({ fields: ["supplyPrice"] }), pushItem({ productId: "p-2", baljuoraId: "bj-b", code: "BJT-002", name: "봄날 배", fields: ["supplyPrice"], values: { ...pushItem({}).values, name: "봄날 배", supplyPrice: 39000 } })] }, report, "ABCDE23456"));
    expect(summary).toEqual({ ok: 1, failed: 1 });
    expect(throttleSeconds(progress)).toEqual([2, 4, 8, 15, 30, 30, 30, 30]);
    const [first, second] = postedItems(report).sort((a: any, b: any) => a.productId.localeCompare(b.productId));
    expect(first).toMatchObject({ productId: "p-1", ok: false, error: expect.stringContaining("429") });
    expect(second).toMatchObject({ productId: "p-2", ok: true, applied: ["supplyPrice"] });
  });

  it("요청 사이에 간격을 둡니다(상세를 5개씩 함께 읽어도 차례로 0.15초 이상)", async () => {
    const fake = createFake();
    const starts: number[] = [];
    const fetch = async (input: string, init: RequestInit = {}) => {
      if (input.startsWith("https://api.baljuora.com")) starts.push(Date.now());
      return fake.fetch(input, init);
    };
    await withFakeTimers((timers) => internals.createRunner({ fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test", ...timers }).runCompare({ type: "compare", groupKeyword: "황금농부", detailIds: ["bj-a", "bj-b"] }, createReport()));
    expect(starts.length).toBeGreaterThan(4);
    starts.slice(1).forEach((at, index) => expect(at - starts[index]).toBeGreaterThanOrEqual(150));
  });
});

describe("보내기 속도(1.9.2)", () => {
  it("상품 3개를 함께 보냅니다(동시에 최대 3개, 한 상품 안의 요청은 차례로)", async () => {
    const fake = createFake();
    addMany(fake, 6);
    let inFlight = 0;
    let maxInFlight = 0;
    let sameProductOverlap = false;
    const busy = new Set<string>();
    const fetch = async (input: string, init: RequestInit = {}) => {
      const url = new URL(input);
      if (url.origin !== "https://api.baljuora.com") return fake.fetch(input, init);
      const id = /^\/products\/([^/]+)/.exec(url.pathname)?.[1] ?? url.pathname;
      if (busy.has(id)) sameProductOverlap = true;
      busy.add(id);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => { setTimeout(resolve, 400); }); // 발주오라 응답 0.4초
      inFlight -= 1;
      busy.delete(id);
      return fake.fetch(input, init);
    };
    const report = createReport();
    const { summary, elapsed, runner } = await withFakeTimers(async (timers) => {
      const startedAt = Date.now();
      const runner = runnerWith(fetch, timers);
      const summary = await runner.runPush({ type: "push", groupKeyword: "황금농부", groupId: GROUP.id, items: manyItems(6) }, report, "ABCDE23456");
      return { summary, elapsed: Date.now() - startedAt, runner };
    });
    expect(summary).toEqual({ ok: 6, failed: 0 });
    expect(maxInFlight).toBe(3);
    expect(sameProductOverlap).toBe(false);
    // 상품마다 요청 3개(상세·가격·다시 읽기) × 0.4초: 차례로면 7.2초, 3개씩 함께라 절반보다 빠름(요청 간격 0.15초는 그대로)
    expect(elapsed).toBeLessThan(3600);
    expect(postedItems(report).map((item: any) => item.productId)).toEqual(manyItems(6).map((item) => item.productId));
    expect(finalPost(report).diagnostics.stats).toMatchObject({ concurrency: 3, requests: 18, writes: 6, avgMs: 400, maxMs: 400 });
    expect(runner.state.gapMs).toBe(150);
  });

  it("DB센터에 결과를 보내는 동안에도 발주오라 쪽 상품 처리는 계속합니다(묶어서 따로, 한 번에 하나씩)", async () => {
    const fake = createFake();
    addMany(fake, 45);
    const starts: number[] = [];
    const fetch = async (input: string, init: RequestInit = {}) => {
      if (input.startsWith("https://api.baljuora.com")) starts.push(Date.now());
      return fake.fetch(input, init);
    };
    const report = createReport();
    const windows: Array<[number, number]> = [];
    let sending = 0;
    let overlapped = false;
    report.results = async (body: any) => {
      sending += 1;
      if (sending > 1) overlapped = true;
      const begin = Date.now();
      if (!body.final) await new Promise((resolve) => { setTimeout(resolve, 5000); }); // DB센터가 5초 걸림
      windows.push([begin, Date.now()]);
      report.posted.push(body);
      sending -= 1;
      return {};
    };
    const summary = await withFakeTimers((timers) => runnerWith(fetch, timers).runPush({ type: "push", groupKeyword: "황금농부", groupId: GROUP.id, items: manyItems(45) }, report, "ABCDE23456"));
    expect(summary).toEqual({ ok: 45, failed: 0 });
    expect(overlapped).toBe(false); // 결과는 한 번에 하나씩
    const [begin, end] = windows[0];
    expect(starts.filter((at) => at > begin && at < end).length).toBeGreaterThan(10); // 기다리는 5초 동안에도 발주오라 요청이 이어짐
    expect(report.posted.filter((body: any) => !body.final).length).toBeGreaterThan(0);
    expect(report.posted.filter((body: any) => body.final)).toHaveLength(1);
    expect(postedItems(report)).toHaveLength(45);
    expect(new Set(postedItems(report).map((item: any) => item.productId)).size).toBe(45);
  });

  it("결과 보내기가 잠깐 실패하면(DB센터 5xx·연결 끊김) 다시 보내고, 취소(409)면 새 상품을 더 시작하지 않습니다", async () => {
    const fake = createFake();
    const report = createReport();
    const saved = report.results;
    let failures = 2;
    report.results = async (body: any) => {
      if (failures === 2) { failures -= 1; const error: any = new Error("DB센터 응답 오류(502)"); error.status = 502; throw error; }
      if (failures === 1) { failures -= 1; throw new TypeError("Failed to fetch"); } // 연결 끊김(응답 번호 없음)
      return saved(body);
    };
    const runner = await withFakeTimers(async (timers) => {
      const runner = runnerWith(fake.fetch, timers);
      await runner.runPush({ type: "push", groupKeyword: "황금농부", groupId: GROUP.id, items: [pushItem({ fields: ["supplyPrice"] })] }, report, "ABCDE23456");
      return runner;
    });
    expect(postedItems(report)).toHaveLength(1);
    expect(postedItems(report)[0]).toMatchObject({ ok: true, applied: ["supplyPrice"] });
    expect(runner.state.stats.resultRetries).toBe(2);

    const many = createFake();
    addMany(many, 40);
    const cancelled = createReport();
    cancelled.results = async () => { const error: any = new Error("DB센터에서 취소한 작업입니다."); error.status = 409; throw error; };
    await expect(withFakeTimers((timers) => runnerWith(many.fetch, timers).runPush({ type: "push", groupKeyword: "황금농부", groupId: GROUP.id, items: manyItems(40) }, cancelled, "ABCDE23456"))).rejects.toThrow("DB센터에서 취소한 작업입니다.");
    const priced = many.calls.filter((call) => call.method === "PUT" && call.url.endsWith("/pricing")).length;
    expect(priced).toBeGreaterThan(0);
    expect(priced).toBeLessThan(40);
  });

  it("마지막 결과를 다시 보냈는데 '이미 끝난 작업'(409)이면 앞서 보낸 것이 저장된 것이라 그대로 끝냅니다", async () => {
    const fake = createFake();
    const report = createReport();
    let attempts = 0;
    report.results = async (body: any) => {
      attempts += 1;
      if (attempts === 1) { report.posted.push(body); throw new TypeError("Failed to fetch"); } // DB센터는 받았지만 응답이 끊김
      const error: any = new Error("이미 끝난 작업입니다. DB센터에서 결과를 확인해 주세요."); error.status = 409; throw error;
    };
    const summary = await withFakeTimers((timers) => runnerWith(fake.fetch, timers).runPush({ type: "push", groupKeyword: "황금농부", groupId: GROUP.id, items: [pushItem({ fields: ["supplyPrice"] })] }, report, "ABCDE23456"));
    expect(summary).toEqual({ ok: 1, failed: 0 });
    expect(attempts).toBe(2);
  });

  it("한 요청이 429를 받으면 다른 상품의 요청도 함께 쉽니다", async () => {
    let throttles = 1;
    const fake = createFake({ throttle: (method, path) => method === "GET" && path === "products/bj-a" && throttles-- > 0 });
    addMany(fake, 3);
    const starts: Array<{ at: number; path: string }> = [];
    const fetch = async (input: string, init: RequestInit = {}) => {
      const url = new URL(input);
      if (url.origin === "https://api.baljuora.com") starts.push({ at: Date.now(), path: url.pathname });
      return fake.fetch(input, init);
    };
    const report = createReport();
    const runner = await withFakeTimers(async (timers) => {
      const runner = runnerWith(fetch, timers);
      await runner.runPush({ type: "push", groupKeyword: "황금농부", groupId: GROUP.id, items: [pushItem({ fields: ["supplyPrice"] }), ...manyItems(3)] }, report, "ABCDE23456");
      return runner;
    });
    const throttledAt = starts.find((entry) => entry.path === "/products/bj-a")!.at;
    expect(starts.filter((entry) => entry.at > throttledAt && entry.at < throttledAt + 2000)).toEqual([]);
    expect(postedItems(report).every((item: any) => item.ok)).toBe(true);
    // 막혔던 간격(0.15초)보다 30% 넓은 간격을 바닥으로 지키다가 성공할 때마다 조금씩 좁힘
    expect(runner.state.floorMs).toBeGreaterThan(150);
    expect(runner.state.floorMs).toBeLessThanOrEqual(195);
    expect(runner.state.gapMs).toBeGreaterThanOrEqual(runner.state.floorMs);
  });

  it("상품을 함께 보내도 저장한 상품만 다시 읽습니다", async () => {
    const fake = createFake();
    const report = createReport();
    // bj-a: 공급가 26,000 → 27,000(저장함) / bj-b: 공급가가 이미 38,000(저장 안 함)
    await runnerFor(fake).runPush({ type: "push", groupKeyword: "황금농부", groupId: GROUP.id, items: [pushItem({ fields: ["supplyPrice"] }), pushItem({ productId: "p-2", baljuoraId: "bj-b", code: "BJT-002", name: "봄날 배", fields: ["supplyPrice"], values: { ...pushItem({}).values, name: "봄날 배", supplyPrice: 38000 } })] }, report, "ABCDE23456");
    const reads = (id: string) => fake.calls.filter((call) => call.method === "GET" && new URL(call.url).pathname === `/products/${id}`).length;
    expect(reads("bj-a")).toBe(2);
    expect(reads("bj-b")).toBe(1);
    expect(postedItems(report).map((item: any) => [item.productId, item.ok])).toEqual([["p-1", true], ["p-2", true]]);
  });

  it("발주오라에 이름이 같은 상품이 있으면 새로 등록하지 않고 고칠 방법을 알립니다(발주오라는 같은 이름을 받지 않음)", async () => {
    const fake = createFake();
    const report = createReport();
    await runnerFor(fake).runPush({ type: "push", groupKeyword: "황금농부", groupId: null, items: [pushItem({ productId: "p-dup", action: "create", baljuoraId: null, templateId: "bj-a", templateMatch: "supplier", code: "DG-9", supplierName: "봄날농원", name: "봄날 사과 5kg", fields: ["name", "supplyPrice"] })] }, report, "ABCDE23456");
    const [result] = postedItems(report);
    expect(result.ok).toBe(false);
    expect(result.error).toBe(internals.duplicateNameMessage({ name: "봄날 사과 5kg", code: "DG-9", values: { name: "봄날 사과 5kg" } }, { id: "bj-a", code: "BJT-001" }));
    expect(result.error).toContain("이름이 같은 상품 '봄날 사과 5kg'(발주오라 상품코드 BJT-001)");
    expect(result.error).toContain("DB센터 상품코드(DG-9)");
    expect(fake.calls.some((call) => call.method === "POST" && call.url === "https://api.baljuora.com/products")).toBe(false);
    expect(internals.productNameKey("  봄날 사과 5kg ")).toBe("봄날 사과 5kg");
  });

  it("목록으로 알 수 없어도 발주오라가 '이미 존재하는 상품 명'이라고 거절하면 같은 안내로 바꿉니다", async () => {
    const fake = createFake();
    const fetch = async (input: string, init: RequestInit = {}) => {
      if ((init.method || "GET").toUpperCase() === "POST" && new URL(input).pathname === "/products") return jsonResponse(400, { statusCode: 400, message: "이미 존재하는 상품 명 입니다: 봄날 사과 특품" });
      return fake.fetch(input, init);
    };
    const report = createReport();
    await runnerWith(fetch).runPush({ type: "push", groupKeyword: "황금농부", groupId: null, items: [pushItem({ productId: "p-dup2", action: "create", baljuoraId: null, templateId: "bj-a", templateMatch: "supplier", code: "DG-10", supplierName: "봄날농원", name: "봄날 사과 특품", fields: ["name", "supplyPrice"], values: { ...pushItem({}).values, name: "봄날 사과 특품" } })] }, report, "ABCDE23456");
    const [result] = postedItems(report);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("이름이 같은 상품 '봄날 사과 특품'이 이미 있어 새로 등록하지 않았습니다") });
    expect(result.error).toContain("DB센터 상품코드(DG-10)");
  });
});

describe("매출처 그룹 공급가 저장 방식 찾기(2026-11-23)", () => {
  it("화면 코드에서 찾는 단어 앞뒤만 잘라 내고, 겹치는 부분은 하나로 합칩니다", () => {
    const pieces = internals.codeSnippets("aaaa 개별공급가 bbbb supplyPrice cccc", ["개별공급가", "supplyPrice"], 6, 3);
    expect(pieces).toHaveLength(1);
    expect(pieces[0].anchor).toBe("개별공급가");
    expect(pieces[0].text).toContain("supplyPrice");
    const page = "static/chunks/app/console/%5Bmerchant%5D/(main)/products/%5Bid%5D/page-1a.js";
    expect(internals.chunkPathsOf(`1:I[1,["static/chunks/1234-ab.js","${page}"],"default"] "static/chunks/1234-ab.js"`)).toEqual(["static/chunks/1234-ab.js", page]);
  });

  it("상품 정보에 그룹 공급가가 없으면 비교 때 발주오라 상품 화면 코드에서 저장 화면 부분을 찾아 기술 정보로 보냅니다(발주오라는 바꾸지 않음)", async () => {
    const fake = createFake();
    Object.values(fake.products).forEach((product: any) => { delete product.prices; });
    const page = "static/chunks/app/console/%5Bmerchant%5D/(default)/products/%5Bid%5D/page-abc.js";
    const form = "static/chunks/6327-form.js";
    const consoleCalls: string[] = [];
    const fetch = async (input: string, init: RequestInit = {}) => {
      const url = new URL(input);
      if (url.origin === "https://console.baljuora.com" && url.pathname !== "/api/auth/refresh") {
        consoleCalls.push(`${url.pathname}${(init.headers as Record<string, string> | undefined)?.RSC ? " (RSC)" : ""}`);
        if (url.pathname === "/doogobiz24/products/bj-a") return new Response(`1:I[1,["static/chunks/1111-aa.js","${form}","${page}"],"default"]`, { status: 200, headers: { "Content-Type": "text/x-component" } });
        if (url.pathname === `/_next/${page}`) return new Response("t=1;", { status: 200 });
        if (url.pathname === `/_next/${form}`) return new Response('t=1;label:"개별공급가",onSubmit:()=>m.mutate({id:i,data:{sellerProductPrices:[{targetType:"group",targetId:g,supplyPrice:p}]}})', { status: 200 });
        return new Response("", { status: 404 });
      }
      return fake.fetch(input, init);
    };
    const runner = internals.createRunner({ fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", pagePath: "/doogobiz24/dashboard", loadedScripts: ["https://console.baljuora.com/_next/static/chunks/1111-aa.js"], apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const report = createReport();
    await runner.runCompare({ type: "compare", groupKeyword: "황금농부", detailIds: ["bj-a", "bj-b"] }, report);
    const discovery = report.posted[report.posted.length - 1].diagnostics.discovery;
    expect(discovery.pages[0]).toMatchObject({ path: "/products/:id", status: 200, chunks: 3 });
    expect(discovery.allChunks).toEqual(["static/chunks/1111-aa.js", form, page]);
    expect(discovery.formChunks).toEqual([form]); // 저장 화면 코드가 든 파일만, 이미 열린 화면이 불러온 공용 코드는 다시 받지 않음
    expect(discovery.snippets[0]).toMatchObject({ anchor: "개별공급가" });
    expect(discovery.snippets[0].text).toContain("sellerProductPrices");
    expect(consoleCalls).toContain("/doogobiz24/products/bj-a (RSC)");
    expect(consoleCalls).not.toContain("/_next/static/chunks/1111-aa.js");
    expect(fake.calls.some((call) => call.method !== "GET" && call.url.startsWith("https://api.baljuora.com"))).toBe(false);
  });

  it("그룹 공급가를 읽을 수 있으면 화면 코드를 찾지 않습니다", async () => {
    const fake = createFake();
    const consoleCalls: string[] = [];
    const fetch = async (input: string, init: RequestInit = {}) => {
      const url = new URL(input);
      if (url.origin === "https://console.baljuora.com" && url.pathname !== "/api/auth/refresh") consoleCalls.push(url.pathname);
      return fake.fetch(input, init);
    };
    const runner = internals.createRunner({ fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", pagePath: "/doogobiz24/dashboard", loadedScripts: [], apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const report = createReport();
    await runner.runCompare({ type: "compare", groupKeyword: "황금농부", detailIds: ["bj-a", "bj-b"] }, report);
    expect(consoleCalls).toEqual([]);
    expect(report.posted[report.posted.length - 1].diagnostics.discovery).toBeUndefined();
  });

  it("카테고리 저장이 실패하면 이 창의 로그인으로 상품 카테고리 화면 코드 경로·저장 부분만 읽어 기술 정보로 보냅니다(다음 수정용)", async () => {
    const tree = createTreeFake();
    const page = "static/chunks/app/console/%5Bmerchant%5D/(main)/products/category/page-c4t.js";
    const shared = "static/chunks/3518-tree.js";
    const consoleCalls: string[] = [];
    const fetch = async (input: string, init: RequestInit = {}) => {
      const url = new URL(input);
      if (url.origin === "https://console.baljuora.com" && url.pathname !== "/api/auth/refresh") {
        consoleCalls.push(`${url.pathname}${(init.headers as Record<string, string> | undefined)?.RSC ? " (RSC)" : ""}`);
        if (url.pathname === "/doogobiz24/products/category") return new Response(`1:I[1,["${shared}","${page}"],"default"]`, { status: 200, headers: { "Content-Type": "text/x-component" } });
        if (url.pathname === `/_next/${page}`) return new Response('t=1;children:"저장하기",onClick:async()=>{await s.mutateAsync({data:{categories:n.map(c)}})}', { status: 200 });
        return new Response("", { status: 404 });
      }
      // 발주오라가 카테고리 저장을 거절(400)
      if (url.pathname === "/merchant/categories/tree" && (init.method || "GET").toUpperCase() === "POST") return jsonResponse(400, { statusCode: 400, message: ["categories.0.name must be a string"] });
      return tree.fetch(input, init);
    };
    const runner = internals.createRunner({ fetch, locks: undefined, consoleOrigin: "https://console.baljuora.com", pagePath: "/doogobiz24/dashboard", loadedScripts: [], apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const report = createReport();
    await runner.runPush({ type: "push", groupKeyword: "황금농부", groupId: GROUP.id, items: [], categoryTree: { ops: [{ type: "add", level: 1, ref: "c:x", name: "새 1차", doogoId: "x", parentBaljuoraId: null, parentRef: null }], excludeNames: ["브랜드별"] } }, report, "ABCDE23456");
    expect(report.posted[0].categoryTree.error).toContain("categories.0.name must be a string");
    const last = report.posted[report.posted.length - 1].diagnostics;
    expect(last.discovery.categoryPage).toMatchObject({ status: 200, chunks: [shared, page], pageChunks: [page] });
    expect(last.discovery.categoryPage.snippets[0]).toMatchObject({ chunk: "page-c4t.js", anchor: "mutateAsync" });
    expect(last.discovery.categoryPage.snippets[0].text).toContain("data:{categories:");
    expect(last.structure.categoryTree).toBeDefined();
    expect(consoleCalls).toEqual(["/doogobiz24/products/category (RSC)", `/_next/${page}`]); // 저장 부분이 든 카테고리 화면 파일만 받음
  });
});

// 실제 발주오라처럼(2026-11-23 운영 확인):
// - 상세는 include를 줘야 개별공급가(prices)·매입처(productSuppliers)가 옵니다.
// - 가격 저장(PUT products/:id/pricing)은 공급가·소비자가·매입원가만 쓰고, 모르는 칸(prices 등)은 오류 없이 버립니다(약과 18:31: 공급가만 바뀜).
// - 개별공급가는 상품 수정(PUT products/:id)의 sellerProductPrices 목록으로만 바뀝니다(발주오라 상품 수정 화면과 같음).
function createIncludeFake(options: { rowAllowed?: string[]; productPutAllowed?: string[] } = {}) {
  const product: any = {
    id: "bj-y", code: "ass00050", name: "[본] 대왕 수제약과 [9입] 450g", supplyPrice: 6900, consumerPrice: null, imageUrls: [], categoryIds: [], categories: [],
    productSuppliers: [{ id: "ps-1", supplier: { id: "sup-k", name: "캄므커머스" }, purchaseCost: 5700, materialCost: null, isDefault: true, shippingPolicy: { id: "pship-1", name: "수제약과" } }],
    prices: [
      { id: "pr-1", createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", productId: "bj-y", targetType: "group", targetId: "grp-1", shippingPolicyId: null, supplyPrice: 6270, sellerGroup: { ...GROUP } },
      { id: "pr-2", createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", productId: "bj-y", targetType: "seller", targetId: "s-9", shippingPolicyId: null, supplyPrice: 6000, seller: { id: "s-9", companyName: "황금농부 김씨" } }
    ],
    visibility: [],
    sellShippingPolicyId: "bj-pol-1",
    shippingPolicy: { ...BJ_POLICIES[0] }
  };
  const calls: Array<{ method: string; url: string; body?: any }> = [];
  const view = (withInclude: boolean) => {
    const { prices, productSuppliers, visibility, ...rest } = product;
    return withInclude ? { ...rest, prices, productSuppliers, visibility } : { ...rest, productSuppliers: [] };
  };
  const fetch = async (input: string, init: RequestInit = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, url: input, body });
    const url = new URL(input);
    if (url.pathname === "/api/auth/refresh") return jsonResponse(200, { accessToken: "t1" });
    if (url.origin !== "https://api.baljuora.com") return jsonResponse(404, {});
    const path = url.pathname.replace(/^\//, "");
    if (method === "GET" && path === "merchant/seller-groups") return jsonResponse(200, { data: { items: [GROUP] } });
    if (method === "GET" && path === "merchant/categories/tree") return jsonResponse(200, { data: [] });
    if (method === "GET" && path === "merchant/shipping-policies") return jsonResponse(200, { data: { items: BJ_POLICIES.map(({ rules, ...rest }) => { void rules; return rest; }), meta: { page: 1, totalPages: 1, hasNext: false } } });
    if (method === "GET" && path.startsWith("merchant/shipping-policies/")) {
      const found = BJ_POLICIES.find((item) => item.id === decodeURIComponent(path.slice("merchant/shipping-policies/".length)));
      return found ? jsonResponse(200, { data: found }) : jsonResponse(404, { message: "Not Found" });
    }
    if (method === "GET" && path === "products") return jsonResponse(200, { data: { items: [view(false)], meta: { page: 1, totalPages: 1, hasNext: false } } });
    if (method === "GET" && path === "products/bj-y") return jsonResponse(200, { data: view(String(url.searchParams.get("include") || "").split(",").includes("prices")) });
    if (method === "PUT" && path === "products/bj-y/pricing") {
      // 모르는 칸(prices·sellerProductPrices 등)은 오류 없이 버립니다(운영과 같음).
      // 2026-11-24 운영(샤인머스캣): purchaseCost도 오류 없이 버려 매입원가(매입처 줄)는 그대로입니다.
      if (body.supplyPrice !== undefined) product.supplyPrice = body.supplyPrice;
      if (body.consumerPrice !== undefined) product.consumerPrice = body.consumerPrice;
      return jsonResponse(200, { data: view(true) });
    }
    if (method === "PUT" && path === "products/bj-y") return applyProductPut(product, body, { rowAllowed: options.rowAllowed, allowed: options.productPutAllowed });
    return jsonResponse(404, { message: `not found ${path}` });
  };
  return { fetch, product, calls };
}

// 2026-11-23 운영 오류 재현: PUT products/:id/info 는 상품명이 없으면 400 "상품명은 문자열이어야 합니다."
function withInfoEndpoint(fake: ReturnType<typeof createIncludeFake>, options: { failInfo?: string } = {}) {
  const infoCalls: any[] = [];
  const fetch = async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    if ((init.method || "GET").toUpperCase() === "PUT" && url.pathname === "/products/bj-y/info") {
      const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
      infoCalls.push(body);
      if (options.failInfo) return jsonResponse(400, { message: [options.failInfo] });
      if (typeof body.name !== "string") return jsonResponse(400, { message: ["상품명은 문자열이어야 합니다."] });
      const extra = Object.keys(body).filter((key) => !["name", "categoryIds", "imageUrls"].includes(key));
      if (extra.length) return jsonResponse(400, { message: extra.map((key) => `property ${key} should not exist`) });
      // 카테고리(categoryIds)는 오류 없이 버립니다(2026-11-27 운영 절임배추).
      const { categoryIds, ...rest } = body;
      void categoryIds;
      Object.assign(fake.product, rest);
      return jsonResponse(200, { data: { id: "bj-y" } });
    }
    return fake.fetch(input, init);
  };
  return { fetch, infoCalls };
}

describe("상품 정보(상품명·카테고리·이미지) 저장 — 2026-11-23 운영 오류", () => {
  const runnerOf = (fetch: (input: string, init?: RequestInit) => Promise<Response>) => internals.createRunner({ fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
  const yakgwa = (fields: string[], values: Record<string, unknown> = {}) => pushItem({ baljuoraId: "bj-y", code: "ass00050", fields, values: { name: "[본] 대왕 수제약과 [9입] 450g", supplyPrice: 7000, groupPrice: 6400, consumerPrice: null, purchaseCost: 5700, categoryId: "bj-cat-food", imageUrl: null, isTaxable: false, ...values } });

  it("카테고리는 발주오라 상품 수정 화면처럼 PUT products/:id {categoryIds}로 보내고(…/info는 카테고리를 버림), 다시 읽어 확인합니다", async () => {
    const fake = createIncludeFake();
    fake.product.categoryIds = ["bj-cat-old"];
    fake.product.imageUrls = ["https://files.baljuora.com/yakgwa.jpg"];
    const wrapped = withInfoEndpoint(fake);
    const result = await runnerOf(wrapped.fetch).pushItem(yakgwa(["supplyPrice", "purchaseCost", "category"]), { groupKeyword: "황금농부" }, { group: GROUP, groupKeyword: "황금농부" }, "CODE");
    expect(wrapped.infoCalls).toEqual([]); // 상품명을 바꾸지 않으면 상품 정보 저장(…/info)은 부르지 않음
    const categoryPut = fake.calls.find((call) => call.method === "PUT" && call.url === "https://api.baljuora.com/products/bj-y" && call.body?.categoryIds);
    expect(categoryPut?.body).toEqual({ categoryIds: ["bj-cat-food"] });
    expect(result.ok).toBe(true);
    expect(result.applied).toEqual(["supplyPrice", "purchaseCost", "category"]);
    expect(fake.product.categoryIds).toEqual(["bj-cat-food"]);
    expect(fake.product.imageUrls).toEqual(["https://files.baljuora.com/yakgwa.jpg"]); // 이미지는 그대로
  });

  it("절임배추 재현(2026-11-27 운영): 카테고리를 …/info로만 보내면 발주오라가 버려 '저장된 카테고리가 다릅니다'로 알립니다(보낸·다시 읽은 카테고리 이름 포함)", async () => {
    // 1.9.0까지의 방식: 상품 수정이 categoryIds를 받지 않는 경우에만 …/info로 보냄 → 운영 발주오라는 그 칸을 오류 없이 버림
    const fake = createIncludeFake({ productPutAllowed: ["sellerProductPrices", "productSuppliers"] });
    fake.product.categoryIds = ["bj-cat-kimchi"];
    const wrapped = withInfoEndpoint(fake);
    const runner = runnerOf(wrapped.fetch);
    const context = { group: GROUP, groupKeyword: "황금농부", categoryFlat: [{ id: "bj-cat-farm", name: "🥕 농산", parentId: null, path: "🥕 농산" }, { id: "bj-cat-kimchi", name: "🥒 김치류", parentId: null, path: "🥒 김치류" }] };
    const result = await runner.pushItem(yakgwa(["category"], { categoryId: "bj-cat-farm" }), { groupKeyword: "황금농부" }, context, "CODE");
    expect(wrapped.infoCalls).toEqual([{ name: "[본] 대왕 수제약과 [9입] 450g", categoryIds: ["bj-cat-farm"], imageUrls: [] }]);
    expect(fake.product.categoryIds).toEqual(["bj-cat-kimchi"]); // 발주오라가 버려 그대로
    expect(result.ok).toBe(false);
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual([{ field: "category", reason: "발주오라에 저장된 카테고리가 다릅니다(보낸 카테고리: 🥕 농산 · 저장 뒤 다시 읽은 카테고리: 🥒 김치류). 발주오라 상품 수정 화면에서 카테고리를 확인해 주세요." }]);
  });

  it("상품명을 바꾸면 새 이름으로 저장합니다", async () => {
    const fake = createIncludeFake();
    const wrapped = withInfoEndpoint(fake);
    const runner = internals.createRunner({ fetch: wrapped.fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const result = await runner.pushItem(pushItem({ baljuoraId: "bj-y", code: "ass00050", fields: ["name"], values: { name: "[본] 대왕 수제약과 [9입] 450g (신상)", supplyPrice: 6900, groupPrice: 6270, consumerPrice: null, purchaseCost: 5700, categoryId: null, imageUrl: null, isTaxable: false } }), { groupKeyword: "황금농부" }, { group: GROUP, groupKeyword: "황금농부" }, "CODE");
    expect(wrapped.infoCalls[0].name).toBe("[본] 대왕 수제약과 [9입] 450g (신상)");
    expect(result.applied).toEqual(["name"]);
    expect(result.snapshot.name).toBe("[본] 대왕 수제약과 [9입] 450g (신상)");
  });

  it("상품 정보 저장이 실패해도 먼저 반영된 가격은 '반영됨'으로 남기고, 실패한 칸만 사유와 함께 알립니다", async () => {
    const fake = createIncludeFake();
    const wrapped = withInfoEndpoint(fake, { failInfo: "상품명을 확인해 주세요." });
    const runner = internals.createRunner({ fetch: wrapped.fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const result = await runner.pushItem(pushItem({ baljuoraId: "bj-y", code: "ass00050", fields: ["supplyPrice", "name"], values: { name: "약과(새 이름)", supplyPrice: 7000, groupPrice: 6270, consumerPrice: null, purchaseCost: 5700, categoryId: null, imageUrl: null, isTaxable: false } }), { groupKeyword: "황금농부" }, { group: GROUP, groupKeyword: "황금농부" }, "CODE");
    expect(result.ok).toBe(true);
    expect(result.applied).toEqual(["supplyPrice"]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].field).toBe("name");
    expect(result.skipped[0].reason).toContain("상품명을 확인해 주세요.");
    expect(fake.product.supplyPrice).toBe(7000);
  });

  it("수강생 단가가 이미 발주오라 황금농부 공급가와 같으면 개별공급가 목록은 보내지 않고 반영됨으로 둡니다", async () => {
    const fake = createIncludeFake();
    const runner = internals.createRunner({ fetch: fake.fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const result = await runner.pushItem(pushItem({ baljuoraId: "bj-y", code: "ass00050", fields: ["supplyPrice", "groupPrice"], values: { name: "약과", supplyPrice: 7000, groupPrice: 6270, consumerPrice: null, purchaseCost: 5700, categoryId: null, imageUrl: null, isTaxable: false } }), { groupKeyword: "황금농부" }, { group: GROUP, groupKeyword: "황금농부" }, "CODE");
    const put = fake.calls.find((call) => call.method === "PUT");
    expect(put?.body).toEqual({ supplyPrice: 7000 });
    expect(result.applied).toEqual(["supplyPrice", "groupPrice"]);
  });

  it("약과 재현: 예전 비교 기록으로 가격 3종을 함께 보내면 발주오라 실제 값과 다른 칸만 맞춥니다(공급가 7,000→6,900 · 황금농부 6,270→6,400 · 매입원가 5,700 그대로)", async () => {
    const fake = createIncludeFake();
    fake.product.supplyPrice = 7000;
    const wrapped = withInfoEndpoint(fake);
    const runner = internals.createRunner({ fetch: wrapped.fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const result = await runner.pushItem(pushItem({ baljuoraId: "bj-y", code: "ass00050", fields: ["purchaseCost", "category", "supplyPrice", "groupPrice"], values: { name: "[본] 대왕 수제약과 [9입] 450g", supplyPrice: 6900, groupPrice: 6400, consumerPrice: null, purchaseCost: 5700, categoryId: "bj-cat-food", imageUrl: null, isTaxable: false } }), { groupKeyword: "황금농부" }, { group: GROUP, groupKeyword: "황금농부" }, "CODE");
    const pricing = fake.calls.find((call) => call.method === "PUT" && call.url.endsWith("/pricing"));
    expect(pricing?.body).toEqual({ supplyPrice: 6900 }); // 매입원가는 이미 같아 보내지 않음, 개별공급가는 가격 저장에 넣지 않음
    // 개별공급가는 발주오라 상품 수정 화면처럼 PUT products/:id 에 목록 전체로(황금농부 줄만 6,400, 다른 매출처 줄은 그대로)
    const update = fake.calls.find((call) => call.method === "PUT" && call.url === "https://api.baljuora.com/products/bj-y");
    expect(update?.body).toEqual({ sellerProductPrices: [{ targetType: "group", targetId: "grp-1", supplyPrice: 6400 }, { targetType: "seller", targetId: "s-9", supplyPrice: 6000 }] });
    expect(fake.product.prices.find((row: any) => row.targetType === "seller")).toMatchObject({ targetId: "s-9", supplyPrice: 6000, seller: { companyName: "황금농부 김씨" } });
    expect(result.ok).toBe(true);
    expect(result.applied.sort()).toEqual(["category", "groupPrice", "purchaseCost", "supplyPrice"]);
    expect(result.snapshot).toMatchObject({ supplyPrice: 6900, groupPrice: 6400, purchaseCost: 5700, categoryIds: ["bj-cat-food"] });
  });

  it("황금농부 줄이 없고 수강생 단가가 일반공급가와 같으면 황금농부 줄을 새로 만들지 않습니다", async () => {
    const fake = createIncludeFake();
    fake.product.prices = fake.product.prices.filter((row: any) => row.targetType !== "group");
    const runner = internals.createRunner({ fetch: fake.fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const result = await runner.pushItem(pushItem({ baljuoraId: "bj-y", code: "ass00050", fields: ["supplyPrice", "groupPrice"], values: { name: "약과", supplyPrice: 6900, groupPrice: 6900, consumerPrice: null, purchaseCost: 5700, categoryId: null, imageUrl: null, isTaxable: false } }), { groupKeyword: "황금농부" }, { group: GROUP, groupKeyword: "황금농부" }, "CODE");
    expect({ applied: result.applied, skipped: result.skipped, error: result.error }).toEqual({ applied: ["supplyPrice", "groupPrice"], skipped: [], error: null });
    expect(fake.calls.some((call) => call.method === "PUT")).toBe(false); // 공급가도 이미 같아 아무것도 보내지 않음
  });

  it("DB센터 값이 0원이면 발주오라 공급가·황금농부 공급가를 0원으로 바꾸지 않습니다", async () => {
    const fake = createIncludeFake();
    fake.product.supplyPrice = 7000;
    const runner = internals.createRunner({ fetch: fake.fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const result = await runner.pushItem(pushItem({ baljuoraId: "bj-y", code: "ass00050", fields: ["supplyPrice", "groupPrice"], values: { name: "약과", supplyPrice: 0, groupPrice: 0, consumerPrice: null, purchaseCost: 5700, categoryId: null, imageUrl: null, isTaxable: false } }), { groupKeyword: "황금농부" }, { group: GROUP, groupKeyword: "황금농부" }, "CODE");
    expect(fake.calls.some((call) => call.method === "PUT")).toBe(false);
    expect(result.applied).toEqual([]);
    expect(result.skipped.map((entry: { field: string }) => entry.field)).toEqual(["supplyPrice", "groupPrice"]);
    expect(result.skipped[0].reason).toMatch(/0원/);
    expect(fake.product.supplyPrice).toBe(7000);
  });

  it("한글 칸 검사 오류에서 칸 이름을 찾습니다", () => {
    expect(internals.koreanFieldsOf(["상품명은 문자열이어야 합니다.", "카테고리를 선택해 주세요.", "알 수 없는 오류"])).toEqual(["name", "categoryIds"]);
  });
});

describe("수강생 단가 = 황금농부 개별공급가(prices, 2026-11-23)", () => {
  it("상세를 include로 읽어 황금농부 그룹 공급가와 기본 매입처 매입원가를 가져옵니다(이름에 황금농부가 든 매출처 줄은 무시)", async () => {
    const fake = createIncludeFake();
    const runner = internals.createRunner({ fetch: fake.fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const report = createReport();
    await runner.runCompare({ type: "compare", groupKeyword: "황금농부", detailIds: ["bj-y"] }, report);
    const snapshot = report.posted[0].snapshots.find((item: any) => item.id === "bj-y");
    expect(snapshot).toMatchObject({ code: "ass00050", supplyPrice: 6900, groupPrice: 6270, purchaseCost: 5700 });
    expect(fake.calls.some((call) => call.url.includes("products/bj-y?include=categories%2CproductSuppliers%2CshippingPolicy%2Cprices%2Cvisibility"))).toBe(true);
  });

  it("수강생 단가는 발주오라 상품 수정(PUT products/:id)의 개별공급가 목록에서 황금농부 줄만 바꿔 보내고(다른 매출처 줄은 그대로), 다시 읽어 저장된 값을 확인합니다", async () => {
    const fake = createIncludeFake();
    const runner = internals.createRunner({ fetch: fake.fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const result = await runner.pushItem(pushItem({ baljuoraId: "bj-y", code: "ass00050", name: "[본] 대왕 수제약과 [9입] 450g", fields: ["groupPrice"], values: { name: "[본] 대왕 수제약과 [9입] 450g", supplyPrice: 6900, groupPrice: 6300, consumerPrice: null, purchaseCost: 5700, categoryId: null, imageUrl: null, isTaxable: false } }), { groupKeyword: "황금농부" }, { group: GROUP, groupKeyword: "황금농부" }, "CODE");
    expect(result.ok).toBe(true);
    expect(result.applied).toEqual(["groupPrice"]);
    const puts = fake.calls.filter((call) => call.method === "PUT");
    // 가격 저장(…/pricing)은 부르지 않고 상품 수정으로 목록 전체를 보냅니다(줄의 id·작성 시각 같은 읽기 전용 칸, 빈 배송정책은 뺌).
    expect(puts.map((call) => call.url)).toEqual(["https://api.baljuora.com/products/bj-y"]);
    expect(puts[0].body).toEqual({
      sellerProductPrices: [
        { targetType: "group", targetId: "grp-1", supplyPrice: 6300 },
        { targetType: "seller", targetId: "s-9", supplyPrice: 6000 }
      ]
    });
    expect(fake.product.prices.find((row: any) => row.targetType === "seller").supplyPrice).toBe(6000);
    expect(result.snapshot.groupPrice).toBe(6300);
  });

  it("개별공급가 줄 안쪽 칸을 거절하면(sellerProductPrices.1.property … should not exist) 그 칸만 빼고 다시 보내 저장합니다", async () => {
    const fake = createIncludeFake({ rowAllowed: ["targetType", "targetId", "supplyPrice"] });
    fake.product.prices[1].shippingPolicyId = "ship-9";
    const runner = internals.createRunner({ fetch: fake.fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const result = await runner.pushItem(pushItem({ baljuoraId: "bj-y", code: "ass00050", fields: ["supplyPrice", "groupPrice"], values: { name: "약과", supplyPrice: 7000, groupPrice: 6300, consumerPrice: null, purchaseCost: 5700, categoryId: null, imageUrl: null, isTaxable: false } }), { groupKeyword: "황금농부" }, { group: GROUP, groupKeyword: "황금농부" }, "CODE");
    expect(result.applied).toEqual(["supplyPrice", "groupPrice"]);
    const updates = fake.calls.filter((call) => call.method === "PUT" && call.url === "https://api.baljuora.com/products/bj-y");
    expect(updates).toHaveLength(2);
    expect(updates[0].body.sellerProductPrices[1]).toMatchObject({ targetType: "seller", shippingPolicyId: "ship-9" });
    expect(updates[1].body.sellerProductPrices.every((row: any) => !("shippingPolicyId" in row))).toBe(true);
    expect(result.snapshot.groupPrice).toBe(6300);
  });

  it("발주오라 상품 수정이 개별공급가 목록을 받지 않으면 수강생 단가만 실패로 알리고, 공급가는 가격 저장으로 그대로 보냅니다", async () => {
    const fake = createIncludeFake({ productPutAllowed: [] });
    const runner = internals.createRunner({ fetch: fake.fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const result = await runner.pushItem(pushItem({ baljuoraId: "bj-y", code: "ass00050", fields: ["supplyPrice", "groupPrice"], values: { name: "약과", supplyPrice: 7000, groupPrice: 6300, consumerPrice: null, purchaseCost: 5700, categoryId: null, imageUrl: null, isTaxable: false } }), { groupKeyword: "황금농부" }, { group: GROUP, groupKeyword: "황금농부" }, "CODE");
    expect(result.applied).toEqual(["supplyPrice"]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].field).toBe("groupPrice");
    expect(result.skipped[0].reason).toMatch(/sellerProductPrices/);
    expect(fake.product.supplyPrice).toBe(7000);
    expect(fake.product.prices[0].supplyPrice).toBe(6270);
  });

  it("상품 수정이 상품명을 꼭 달라고 하면 지금 상품명을 채워 다시 보내 개별공급가를 저장합니다(값은 바꾸지 않음)", async () => {
    const fake = createIncludeFake({ productPutAllowed: ["sellerProductPrices", "name"] });
    const fetch = async (input: string, init: RequestInit = {}) => {
      const url = new URL(input);
      if ((init.method || "GET").toUpperCase() === "PUT" && url.pathname === "/products/bj-y") {
        const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
        if (typeof body.name !== "string") {
          fake.calls.push({ method: "PUT", url: input, body });
          return jsonResponse(400, { message: ["상품명은 문자열이어야 합니다."] });
        }
      }
      return fake.fetch(input, init);
    };
    const runner = internals.createRunner({ fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const result = await runner.pushItem(pushItem({ baljuoraId: "bj-y", code: "ass00050", fields: ["groupPrice"], values: { name: "[본] 대왕 수제약과 [9입] 450g", supplyPrice: 6900, groupPrice: 6400, consumerPrice: null, purchaseCost: 5700, categoryId: null, imageUrl: null, isTaxable: false } }), { groupKeyword: "황금농부" }, { group: GROUP, groupKeyword: "황금농부" }, "CODE");
    expect(result.applied).toEqual(["groupPrice"]);
    const updates = fake.calls.filter((call) => call.method === "PUT" && call.url === "https://api.baljuora.com/products/bj-y");
    expect(updates.map((call) => Object.keys(call.body).sort())).toEqual([["sellerProductPrices"], ["name", "sellerProductPrices"]]);
    expect(updates[1].body.name).toBe("[본] 대왕 수제약과 [9입] 450g");
    expect(result.snapshot.groupPrice).toBe(6400);
  });

  it("운영 재현(약과 18:31): 가격 저장에 개별공급가 목록을 넣어도 발주오라는 버리므로, 저장 뒤 다시 읽어 다르면 실패로 알립니다", async () => {
    const fake = createIncludeFake();
    // 예전 책갈피처럼 가격 저장(…/pricing)에 prices 목록을 보내면 오류 없이 200이지만 황금농부 값은 그대로입니다.
    const response = await fake.fetch("https://api.baljuora.com/products/bj-y/pricing", { method: "PUT", body: JSON.stringify({ supplyPrice: 6900, prices: [{ targetType: "group", targetId: "grp-1", supplyPrice: 6400 }] }) });
    expect(response.status).toBe(200);
    expect(fake.product.prices[0].supplyPrice).toBe(6270);
    const result = { applied: ["groupPrice"], skipped: [] as Array<{ field: string; reason: string }> };
    internals.verifyApplied(result, { values: { groupPrice: 6400, supplyPrice: 6900 } }, { supplyPrice: 6900, groupPrice: 6270 });
    expect(result.applied).toEqual([]);
    expect(result.skipped[0]).toEqual({ field: "groupPrice", reason: "보낸 값(6400)과 발주오라에 저장된 값(6270)이 다릅니다." });
  });
});

describe("배송비 정책(매출배송정책, 2026-11-23)", () => {
  const values = { name: "[본] 대왕 수제약과 [9입] 450g", supplyPrice: 6900, groupPrice: 6270, consumerPrice: null, purchaseCost: 5700, categoryId: null, imageUrl: null, isTaxable: false };
  const runnerOf = (fake: ReturnType<typeof createIncludeFake>) => internals.createRunner({ fetch: fake.fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });

  it("상품의 매출배송정책(sellShippingPolicyId, 없으면 shippingPolicy.id)을 읽고, 칸이 없으면 읽지 못함으로 둡니다", () => {
    expect(internals.normalizeProduct({ id: "a", sellShippingPolicyId: "bj-pol-1" }, {}).shippingPolicyId).toBe("bj-pol-1");
    expect(internals.normalizeProduct({ id: "a", sellShippingPolicyId: null }, {}).shippingPolicyId).toBeNull();
    expect(internals.normalizeProduct({ id: "a", shippingPolicy: { id: "bj-pol-2" } }, {}).shippingPolicyId).toBe("bj-pol-2");
    expect("shippingPolicyId" in internals.normalizeProduct({ id: "a" }, {})).toBe(false);
  });

  it("비교 때 배송비 정책 목록을 읽고, 목록에 구간이 없으면 정책 상세(또는 상품 상세에 딸린 정책)로 채워 DB센터로 보냅니다", async () => {
    const fake = createIncludeFake();
    const report = createReport();
    await runnerOf(fake).runCompare({ type: "compare", groupKeyword: "황금농부", detailIds: ["bj-y"] }, report);
    const [batch] = report.posted;
    expect(batch.shippingPolicies.map((item: any) => [item.id, item.type, item.rules.length])).toEqual([["bj-pol-1", "fixed", 0], ["bj-pol-2", "byPrice", 2]]);
    expect(batch.shippingPolicies[1].rules[0]).toEqual({ startRange: 0, endRange: 30000, fee: 3000, unitType: "won" });
    expect(batch.snapshots.find((item: any) => item.id === "bj-y").shippingPolicyId).toBe("bj-pol-1");
    // bj-pol-1 구간은 상품 상세에 딸려 와서 정책 상세를 다시 읽지 않음
    expect(fake.calls.filter((call) => call.url.includes("/merchant/shipping-policies/")).map((call) => new URL(call.url).pathname)).toEqual(["/merchant/shipping-policies/bj-pol-2"]);
    expect(fake.calls.some((call) => call.method !== "GET" && call.url.startsWith("https://api.baljuora.com"))).toBe(false);
  });

  it("보낼 때: 연결한 발주오라 정책과 다르면 PUT products/:id 로 sellShippingPolicyId를 보내고 다시 읽어 확인합니다", async () => {
    const fake = createIncludeFake();
    const result = await runnerOf(fake).pushItem(pushItem({ baljuoraId: "bj-y", code: "ass00050", fields: ["shippingPolicy"], values: { ...values, baljuoraShippingPolicyId: "bj-pol-2" } }), { groupKeyword: "황금농부" }, { group: GROUP, groupKeyword: "황금농부" }, "CODE");
    expect(fake.calls.filter((call) => call.method === "PUT").map((call) => [new URL(call.url).pathname, call.body])).toEqual([["/products/bj-y", { sellShippingPolicyId: "bj-pol-2" }]]);
    expect({ ok: result.ok, applied: result.applied, skipped: result.skipped }).toEqual({ ok: true, applied: ["shippingPolicy"], skipped: [] });
    expect(result.snapshot.shippingPolicyId).toBe("bj-pol-2");
  });

  it("보낼 때: 이미 같으면 보내지 않고 '반영됨', 연결한 발주오라 정책이 없으면 보내지 않고 이유를 알립니다", async () => {
    const same = createIncludeFake();
    const sameResult = await runnerOf(same).pushItem(pushItem({ baljuoraId: "bj-y", code: "ass00050", fields: ["shippingPolicy"], values: { ...values, baljuoraShippingPolicyId: "bj-pol-1" } }), { groupKeyword: "황금농부" }, { group: GROUP, groupKeyword: "황금농부" }, "CODE");
    expect(same.calls.some((call) => call.method === "PUT")).toBe(false);
    expect(sameResult.applied).toEqual(["shippingPolicy"]);
    const none = createIncludeFake();
    const noneResult = await runnerOf(none).pushItem(pushItem({ baljuoraId: "bj-y", code: "ass00050", fields: ["shippingPolicy"], values: { ...values, baljuoraShippingPolicyId: null } }), { groupKeyword: "황금농부" }, { group: GROUP, groupKeyword: "황금농부" }, "CODE");
    expect(none.calls.some((call) => call.method === "PUT")).toBe(false);
    expect(noneResult.skipped).toEqual([{ field: "shippingPolicy", reason: expect.stringContaining("연결된 발주오라 매출배송정책이 없습니다") }]);
  });
});

// 2026-11-23 운영: DB센터에서 바꾼 썸네일이 "발주오라 응답 400 (POST files/presign): kind should not be empty … size must be an integer number"로 실패.
// 발주오라 상품 등록·수정 화면과 같은 방식(presign kind "product-image" → 받은 headers 로 PUT → file.value 를 imageUrls 첫 칸)으로 올립니다.
describe("썸네일(대표 이미지) 보내기", () => {
  const run = (fake: ReturnType<typeof createFake>, report: ReturnType<typeof createReport>, extra: Record<string, unknown> = {}) =>
    runnerFor(fake, extra).runPush({ type: "push", groupKeyword: "황금농부", groupId: GROUP.id, items: [pushItem({ fields: ["image"] })] }, report, "ABCDE23456");

  it("WEBP이거나 1MB가 넘는 DB센터 이미지는 이 창에서 JPG 1MB 이하로 바꿔 올립니다", async () => {
    const fake = createFake({ doogoImage: { type: "image/webp", size: 2_000_000 } });
    const seen: Array<[string, number, number]> = [];
    const convertImage = async (blob: Blob, maxBytes: number) => {
      seen.push([blob.type, blob.size, maxBytes]);
      return new Blob([new Uint8Array(500_000)], { type: "image/jpeg" });
    };
    const report = createReport();
    expect(await run(fake, report, { convertImage })).toEqual({ ok: 1, failed: 0 });
    expect(seen).toEqual([["image/webp", 2_000_000, 1024 * 1024]]);
    expect(fake.state.presigns).toEqual([{ kind: "product-image", fileName: "BJT-001.jpg", contentType: "image/jpeg", size: 500_000, source: "product-form" }]);
    expect(fake.state.uploads[0]).toMatchObject({ size: 500_000, type: "image/jpeg" });
    expect(fake.products["bj-a"].imageUrls).toEqual(["https://files.baljuora.com/product-image/new.jpg", "https://files.baljuora.com/a-2.jpg"]);
    expect(report.posted[0].items[0]).toMatchObject({ ok: true, applied: ["image"], skipped: [] });
  });

  it("1MB 이하 JPG·PNG는 바꾸지 않고 그대로 올립니다(PNG는 PNG로)", async () => {
    const fake = createFake({ doogoImage: { type: "image/png", size: 5000 } });
    let converted = 0;
    const report = createReport();
    await run(fake, report, { convertImage: async () => { converted += 1; return new Blob([]); } });
    expect(converted).toBe(0);
    expect(fake.state.presigns).toEqual([{ kind: "product-image", fileName: "BJT-001.png", contentType: "image/png", size: 5000, source: "product-form" }]);
    expect(report.posted[0].items[0]).toMatchObject({ ok: true, applied: ["image"] });
  });

  it("이미지를 바꿀 수 없는 창이면 JPG·PNG 1MB 이하만 받는다고 알리고 발주오라에는 올리지 않습니다", async () => {
    const fake = createFake({ doogoImage: { type: "image/webp", size: 3000 } });
    const report = createReport();
    expect(await run(fake, report)).toEqual({ ok: 0, failed: 1 });
    expect(fake.state.presigns).toEqual([]);
    expect(report.posted[0].items[0].skipped).toEqual([{ field: "image", reason: expect.stringContaining("JPG·PNG, 1MB 이하") }]);
    expect(fake.products["bj-a"].imageUrls[0]).toBe("https://files.baljuora.com/a.jpg");
  });

  it("발주오라 이미지는 최대 5장: 첫 이미지(대표)만 새 이미지로 바꾸고 나머지는 그대로 둡니다", async () => {
    const fake = createFake();
    const others = ["u2", "u3", "u4", "u5"].map((name) => `https://files.baljuora.com/${name}.jpg`);
    fake.products["bj-a"].imageUrls = ["https://files.baljuora.com/u1.jpg", ...others];
    const report = createReport();
    expect(await run(fake, report)).toEqual({ ok: 1, failed: 0 });
    expect(fake.products["bj-a"].imageUrls).toEqual(["https://files.baljuora.com/product-image/new.jpg", ...others]);
  });

  it("저장 뒤 다시 읽어 대표 이미지가 그대로면 '반영 안 됨'으로 알립니다", async () => {
    const fake = createFake({ ignoreImageUrls: true });
    const report = createReport();
    expect(await run(fake, report)).toEqual({ ok: 0, failed: 1 });
    expect(report.posted[0].items[0].skipped).toEqual([{ field: "image", reason: "발주오라 대표 이미지가 바뀌지 않았습니다(저장 뒤 다시 읽은 값 기준)." }]);
  });

  it("이미지 줄이기: 긴 변 2000px부터 화질·크기를 낮춰 1MB 이하 JPG를 만들고, 투명한 곳은 흰 배경으로 채웁니다", async () => {
    const drawn: Array<[number, number]> = [];
    const fills: string[] = [];
    let closed = 0;
    const fakeWindow = {
      createImageBitmap: async () => ({ width: 4000, height: 3000, close: () => { closed += 1; } }),
      document: {
        createElement: () => {
          const canvas: any = { width: 0, height: 0 };
          canvas.getContext = () => ({
            set fillStyle(value: string) { fills.push(value); },
            fillRect: () => undefined,
            drawImage: (_source: unknown, _x: number, _y: number, width: number, height: number) => { drawn.push([width, height]); }
          });
          // 크기 = 가로 × 세로 × 화질 × 0.5 바이트로 흉내
          canvas.toBlob = (callback: (blob: Blob) => void, type: string, quality: number) => callback(new Blob([new Uint8Array(Math.round(canvas.width * canvas.height * quality * 0.5))], { type }));
          return canvas;
        }
      },
      URL: { createObjectURL: () => "blob:x", revokeObjectURL: () => undefined }
    };
    const output = await internals.makeImageConverter(fakeWindow)(new Blob(["x"], { type: "image/webp" }), 1024 * 1024);
    expect(output.type).toBe("image/jpeg");
    expect(output.size).toBeLessThanOrEqual(1024 * 1024);
    expect(drawn).toEqual([[2000, 1500], [1400, 1050]]);
    expect(fills).toEqual(["#ffffff", "#ffffff"]);
    expect(closed).toBe(1);
  });
});

// 발주오라 상품 카테고리 트리(2026-11-23 화면 코드 page-3ad178912d96b35e.js): 저장 = POST merchant/categories/tree { categories: 트리 전체 },
// 새 카테고리는 id 없음, 트리에 없는 카테고리는 지워짐, 모르는 칸은 오류 없이 버림(운영과 같게 흉내).
function treeNode(id: string, name: string, children: any[] = [], extra: Record<string, unknown> = {}) {
  return { id, name, description: null, sortOrder: 0, isVisible: true, createdAt: "2026-11-01T00:00:00Z", children, ...extra };
}

function createTreeFake() {
  let seq = 0;
  let roots: any[] = [
    treeNode("t-food", "🥦 식자재"),
    treeNode("t-farm", "🥕 농산", [treeNode("t-fruit", "과일류")]),
    treeNode("t-ovs", "✈️ 해외 건강식품", [treeNode("t-ca", "캐나다 건강식품"), treeNode("t-nz", "뉴질랜드 건강식품")]),
    treeNode("t-brand", "🌏 브랜드별", [treeNode("t-brand-kr", "국내 건강식품", [treeNode("t-kd", "광동365"), treeNode("t-enb", "ENB")])])
  ];
  const posts: any[] = [];
  const normalize = (nodes: any[]): any[] => nodes.map((node, index) => ({ ...node, sortOrder: index, children: normalize(node.children || []) }));
  roots = normalize(roots);
  const product: any = { id: "bj-p", code: "HP-1", name: "광동 홍삼", supplyPrice: 10000, consumerPrice: null, imageUrls: [], categoryIds: ["t-ovs", "t-kd"], prices: [], productSuppliers: [] };
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  const fetch = async (input: string, init: RequestInit = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    const url = new URL(input);
    if (url.pathname === "/api/auth/refresh") return jsonResponse(200, { accessToken: "t1" });
    if (url.origin !== "https://api.baljuora.com") return jsonResponse(404, {});
    const path = url.pathname.replace(/^\//, "");
    calls.push({ method, path, body });
    if (method === "GET" && path === "merchant/categories/tree") return jsonResponse(200, { statusCode: 200, data: roots });
    if (method === "POST" && path === "merchant/categories/tree") {
      posts.push(body);
      const save = (nodes: any[]): any[] => nodes.map((node) => ({ id: node.id ?? `t-new-${++seq}`, name: node.name, description: node.description ?? null, sortOrder: node.sortOrder, isVisible: node.isVisible ?? true, createdAt: "2026-11-23T00:00:00Z", children: save(node.children || []) }));
      roots = save(body.categories);
      return jsonResponse(201, { statusCode: 201, data: roots });
    }
    if (method === "GET" && path === "merchant/seller-groups") return jsonResponse(200, { data: { items: [GROUP] } });
    if (method === "GET" && path === "products/bj-p") return jsonResponse(200, { data: product });
    if (method === "PUT" && path === "products/bj-p/info") {
      const { categoryIds, ...rest } = body;
      void categoryIds;
      Object.assign(product, rest);
      return jsonResponse(200, { data: product });
    }
    if (method === "PUT" && path === "products/bj-p") return applyProductPut(product, body);
    return jsonResponse(404, { message: `not found ${path}` });
  };
  return { fetch, posts, calls, product, roots: () => roots };
}

const flatOf = (roots: any[]) => internals.flattenCategories(roots).map((category: any) => category.path);

describe("발주오라 상품 카테고리 맞추기(DB센터 → 발주오라)", () => {
  const ops = [
    { type: "rename", level: 2, baljuoraId: "t-ca", from: "캐나다 건강식품", to: "캐나다 영양제", doogoId: "s-ca" },
    { type: "add", level: 2, ref: "s:s-au", name: "호주 건강식품", doogoId: "s-au", parentBaljuoraId: "t-ovs", parentRef: null },
    { type: "add", level: 1, ref: "c:c-imp", name: "🍍 수입과일", doogoId: "c-imp", parentBaljuoraId: null, parentRef: null },
    { type: "add", level: 2, ref: "s:s-mango", name: "망고", doogoId: "s-mango", parentBaljuoraId: null, parentRef: "c:c-imp" }
  ];

  it("저장 모양은 발주오라 화면과 같습니다: 트리 전체, sortOrder = 같은 단계 순서, 새 카테고리는 id 없이, 브랜드별은 그대로 맨 뒤", () => {
    const fake = createTreeFake();
    const saved = internals.planTreeSave(fake.roots(), ops, ["브랜드별"]);
    expect(saved.changed).toBe(true);
    expect(saved.skipped).toEqual([]);
    const body = internals.treeSaveBody(saved.draft);
    expect(body.map((node: any) => [node.id, node.name, node.sortOrder])).toEqual([["t-food", "🥦 식자재", 0], ["t-farm", "🥕 농산", 1], ["t-ovs", "✈️ 해외 건강식품", 2], [undefined, "🍍 수입과일", 3], ["t-brand", "🌏 브랜드별", 4]]);
    expect(body[2].children.map((node: any) => [node.id, node.name, node.sortOrder])).toEqual([["t-ca", "캐나다 영양제", 0], ["t-nz", "뉴질랜드 건강식품", 1], [undefined, "호주 건강식품", 2]]);
    expect(body[3].children).toEqual([{ id: undefined, name: "망고", description: "", sortOrder: 0, isVisible: true, children: [] }]);
    // 브랜드별 아래(3단계 브랜드 포함)는 id·이름 그대로
    expect(JSON.stringify(body[4])).toBe(JSON.stringify({ id: "t-brand", name: "🌏 브랜드별", sortOrder: 4, isVisible: true, children: [{ id: "t-brand-kr", name: "국내 건강식품", sortOrder: 0, isVisible: true, children: [{ id: "t-kd", name: "광동365", sortOrder: 0, isVisible: true, children: [] }, { id: "t-enb", name: "ENB", sortOrder: 1, isVisible: true, children: [] }] }] }));
    // 읽기 전용 칸(createdAt)·내부 표시(ref)는 보내지 않음
    expect(JSON.stringify(body)).not.toContain("createdAt");
    expect(JSON.stringify(body)).not.toContain("ref");
  });

  it("브랜드별 아래는 바꾸지 않고, 겹치는 이름·없는 카테고리·3단계 넘는 추가는 보내지 않고 이유를 알립니다", () => {
    const fake = createTreeFake();
    const saved = internals.planTreeSave(fake.roots(), [
      { type: "rename", level: 2, baljuoraId: "t-brand-kr", from: "국내 건강식품", to: "국내 브랜드", doogoId: "x1" },
      { type: "rename", level: 2, baljuoraId: "t-nz", from: "뉴질랜드 건강식품", to: "ENB", doogoId: "x2" },
      { type: "rename", level: 2, baljuoraId: "t-gone", from: "없음", to: "새 이름", doogoId: "x3" },
      { type: "add", level: 2, ref: "s:x4", name: "브랜드 A", doogoId: "x4", parentBaljuoraId: "t-brand", parentRef: null },
      { type: "add", level: 2, ref: "s:x5", name: "과일류", doogoId: "x5", parentBaljuoraId: "t-farm", parentRef: null },
      { type: "add", level: 2, ref: "s:x6", name: "망고", doogoId: "x6", parentBaljuoraId: null, parentRef: "c:none" }
    ], ["브랜드별"]);
    expect(saved.changed).toBe(false);
    expect(saved.skipped).toEqual([
      { key: "r:t-brand-kr", name: "국내 브랜드", reason: expect.stringContaining("브랜드별 아래 카테고리라") },
      { key: "r:t-nz", name: "ENB", reason: expect.stringContaining("같은 이름의 카테고리가 이미 있어") },
      { key: "r:t-gone", name: "새 이름", reason: expect.stringContaining("이 카테고리를 찾지 못했습니다") },
      { key: "s:x4", name: "브랜드 A", reason: expect.stringContaining("브랜드별 아래에는 추가하지 않습니다") },
      { key: "s:x6", name: "망고", reason: expect.stringContaining("1차 카테고리를 먼저 만들지 못해") }
    ]);
    // 같은 이름의 2차가 이미 있으면 새로 만들지 않고 연결만
    expect(saved.linked).toEqual({ "s:x5": "t-fruit" });
  });

  it("보내기: 카테고리를 먼저 맞추고(트리 전체 저장 → 다시 읽어 확인), 새 카테고리 id를 DB센터로 보내고, 상품의 브랜드 카테고리는 그대로 둡니다", async () => {
    const fake = createTreeFake();
    const runner = internals.createRunner({ fetch: fake.fetch, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const report = createReport();
    const item = pushItem({ productId: "p-hp", baljuoraId: "bj-p", code: "HP-1", name: "광동 홍삼", fields: ["category"], values: { name: "광동 홍삼", supplyPrice: 10000, groupPrice: 10000, consumerPrice: null, purchaseCost: null, categoryId: null, doogoCategoryId: "c-imp", imageUrl: null, isTaxable: true } });
    const summary = await runner.runPush({ type: "push", groupKeyword: "황금농부", groupId: GROUP.id, items: [item], categoryTree: { ops, excludeNames: ["브랜드별"] }, categoryExclude: ["브랜드별"] }, report, "ABCDE23456");
    expect(summary).toEqual({ ok: 1, failed: 0 });
    expect(fake.posts).toHaveLength(1);
    const tree = report.posted[0].categoryTree;
    expect(tree.error).toBeNull();
    expect(tree.skipped).toEqual([]);
    expect(tree.applied.map((entry: any) => entry.key)).toEqual(["r:t-ca", "s:s-au", "c:c-imp", "s:s-mango"]);
    expect(Object.keys(tree.created).sort()).toEqual(["c:c-imp", "s:s-au", "s:s-mango"]);
    expect(flatOf(fake.roots())).toEqual([
      "🥦 식자재", "🥕 농산", "🥕 농산 > 과일류", "✈️ 해외 건강식품", "✈️ 해외 건강식품 > 캐나다 영양제", "✈️ 해외 건강식품 > 뉴질랜드 건강식품", "✈️ 해외 건강식품 > 호주 건강식품",
      "🍍 수입과일", "🍍 수입과일 > 망고", "🌏 브랜드별", "🌏 브랜드별 > 국내 건강식품", "🌏 브랜드별 > 국내 건강식품 > 광동365", "🌏 브랜드별 > 국내 건강식품 > ENB"
    ]);
    expect(internals.flattenCategories(fake.roots()).find((category: any) => category.id === "t-kd").path).toContain("광동365");
    // 상품은 새로 만든 '수입과일'로, 붙어 있던 브랜드 카테고리(광동365)는 그대로(원래 대표 카테고리 해외 건강식품은 바뀜)
    expect(fake.product.categoryIds).toEqual([tree.created["c:c-imp"], "t-kd"]);
    expect(report.posted[report.posted.length - 1].items[0]).toMatchObject({ ok: true, applied: ["category"] });
  });

  it("발주오라 카테고리 트리를 읽지 못하거나 모양이 다르면 저장하지 않고 이유를 알립니다(상품은 계속)", async () => {
    const fake = createTreeFake();
    const broken = async (input: string, init: RequestInit = {}) => {
      if (new URL(input).pathname === "/merchant/categories/tree" && (init.method || "GET") === "GET") return jsonResponse(200, { data: [{ name: "id 없음", children: [] }] });
      return fake.fetch(input, init);
    };
    const runner = internals.createRunner({ fetch: broken, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const report = createReport();
    await runner.runPush({ type: "push", groupKeyword: "황금농부", groupId: GROUP.id, items: [], categoryTree: { ops, excludeNames: ["브랜드별"] } }, report, "ABCDE23456");
    expect(fake.posts).toHaveLength(0);
    const tree = report.posted[0].categoryTree;
    expect(tree.error).toContain("모양이 예상과 달라");
    expect(tree.skipped).toHaveLength(4);
    expect(tree.applied).toEqual([]);
  });

  it("저장 뒤 원래 카테고리가 사라지면 오류로 알립니다", () => {
    const fake = createTreeFake();
    const before = fake.roots();
    const saved = internals.planTreeSave(before, [ops[0]], ["브랜드별"]);
    const after = before.filter((node: any) => node.id !== "t-brand");
    const check = internals.verifyTreeSave(before, after, saved);
    expect(check.missing.map((category: any) => category.path)).toEqual(["🌏 브랜드별", "🌏 브랜드별 > 국내 건강식품", "🌏 브랜드별 > 국내 건강식품 > 광동365", "🌏 브랜드별 > 국내 건강식품 > ENB"]);
  });
});

describe("보내기", () => {
  it("가격·그룹 공급가·카테고리·이미지를 보내고, 다시 읽어 저장된 값을 확인합니다", async () => {
    const fake = createFake();
    fake.products["bj-a"].categoryIds = [];
    fake.products["bj-a"].categories = [];
    const runner = runnerFor(fake);
    const report = createReport();
    const summary = await runner.runPush({ type: "push", groupKeyword: "황금농부", groupId: GROUP.id, items: [pushItem({ fields: ["supplyPrice", "groupPrice", "category", "image"] })] }, report, "ABCDE23456");
    expect(summary).toEqual({ ok: 1, failed: 0 });
    const pricing = fake.calls.find((call) => call.method === "PUT" && call.url.endsWith("/pricing"));
    expect(pricing?.body).toEqual({ supplyPrice: 27000 });
    const update = fake.calls.find((call) => call.method === "PUT" && call.url === "https://api.baljuora.com/products/bj-a");
    expect(update?.body).toEqual({ sellerProductPrices: [{ targetType: "group", targetId: "grp-1", supplyPrice: 25000 }] });
    // 카테고리는 상품 정보 저장(…/info)이 아니라 상품 수정(PUT products/:id {categoryIds})으로(1.9.1)
    expect(fake.calls.some((call) => call.method === "PUT" && call.url.endsWith("/info"))).toBe(false);
    const categoryPut = fake.calls.find((call) => call.method === "PUT" && call.url === "https://api.baljuora.com/products/bj-a" && call.body?.categoryIds);
    expect(categoryPut?.body).toEqual({ categoryIds: ["bj-cat-farm"] });
    expect(fake.calls.some((call) => call.url === "https://doogofood.test/api/baljuora/runner/ABCDE23456/image/p-1")).toBe(true);
    // 썸네일: 발주오라 상품 화면과 같은 presign 형식 → 받은 headers 로 PUT → file.value 를 첫 이미지로 PUT products/:id
    expect(fake.state.presigns).toEqual([{ kind: "product-image", fileName: "BJT-001.jpg", contentType: "image/jpeg", size: 11, source: "product-form" }]);
    expect(fake.state.uploads).toEqual([{ headers: { "Content-Type": "image/jpeg", "x-amz-meta-kind": "product-image" }, size: 11, type: "image/jpeg" }]);
    const imagePut = fake.calls.find((call) => call.method === "PUT" && call.url === "https://api.baljuora.com/products/bj-a" && call.body?.imageUrls);
    expect(imagePut?.body).toEqual({ imageUrls: ["https://files.baljuora.com/product-image/new.jpg", "https://files.baljuora.com/a-2.jpg"] });
    const [result] = report.posted[0].items;
    expect(result).toMatchObject({ productId: "p-1", ok: true, applied: ["supplyPrice", "groupPrice", "category", "image"], skipped: [] });
    expect(result.snapshot).toMatchObject({ supplyPrice: 27000, groupPrice: 25000, categoryIds: ["bj-cat-farm"], imageUrls: ["https://files.baljuora.com/product-image/new.jpg", "https://files.baljuora.com/a-2.jpg"] });
    expect(report.posted[0].final).toBe(true);
  });

  it("발주오라가 받지 않는 칸은 빼고 다시 보내고, 그 칸은 '받지 않음'으로 알려 줍니다", async () => {
    const fake = createFake({ pricingAllowed: ["supplyPrice"] });
    const runner = runnerFor(fake);
    const report = createReport();
    await runner.runPush({ type: "push", groupKeyword: "황금농부", groupId: GROUP.id, items: [pushItem({ fields: ["supplyPrice", "consumerPrice"], values: { ...pushItem({}).values, consumerPrice: 41000 } })] }, report, "ABCDE23456");
    const pricingCalls = fake.calls.filter((call) => call.method === "PUT" && call.url.endsWith("/pricing"));
    expect(pricingCalls.map((call) => Object.keys(call.body))).toEqual([["supplyPrice", "consumerPrice"], ["supplyPrice"]]);
    const [result] = report.posted[0].items;
    expect(result.ok).toBe(true);
    expect(result.applied).toEqual(["supplyPrice"]);
    expect(result.skipped).toEqual([{ field: "consumerPrice", reason: "발주오라가 이 칸을 받지 않았습니다." }]);
  });

  it("신규 등록: 설정 복사용 상품의 매입처·배송정책을 복사해 등록합니다", async () => {
    const fake = createFake();
    const runner = runnerFor(fake);
    const report = createReport();
    const item = pushItem({ productId: "p-new", action: "create", baljuoraId: null, templateId: "bj-a", code: "BJT-010", name: "새 사과 10kg", fields: ["name", "supplyPrice", "groupPrice", "consumerPrice", "purchaseCost", "category", "image"], values: { name: "새 사과 10kg", supplyPrice: 50000, groupPrice: 47000, consumerPrice: null, purchaseCost: 40000, categoryId: "bj-cat-fruit", imageUrl: "https://doogofood.test/new.jpg", isTaxable: false } });
    await runner.runPush({ type: "push", groupKeyword: "황금농부", groupId: GROUP.id, items: [item] }, report, "ABCDE23456");
    const create = fake.calls.find((call) => call.method === "POST" && call.url === "https://api.baljuora.com/products");
    expect(create?.body).toMatchObject({ code: "BJT-010", name: "새 사과 10kg", supplyPrice: 50000, consumerPrice: null, purchaseCost: 40000, supplierId: "sup-1", shippingPolicyId: "ship-1", categoryIds: ["bj-cat-fruit"], isVisible: true, isTaxable: false });
    expect(create?.body).not.toHaveProperty("id");
    expect(create?.body).not.toHaveProperty("prices"); // 설정 복사용 상품의 개별공급가 목록은 복사하지 않음
    expect(fake.calls.find((call) => call.method === "PUT" && call.url === "https://api.baljuora.com/products/bj-new")?.body).toMatchObject({ sellerProductPrices: [{ targetType: "group", targetId: "grp-1" }] });
    const [result] = report.posted[0].items;
    expect(result).toMatchObject({ productId: "p-new", ok: true, baljuoraId: "bj-new", code: "BJT-010" });
    expect(result.applied).toEqual(expect.arrayContaining(["name", "supplyPrice", "purchaseCost", "category", "groupPrice", "image"]));
  });

  it("발주오라에 같은 상품코드가 이미 있으면 새로 등록하지 않습니다(중복 방지)", async () => {
    const fake = createFake();
    const report = createReport();
    await runnerFor(fake).runPush({ type: "push", groupKeyword: "황금농부", groupId: GROUP.id, items: [pushItem({ productId: "p-dup", action: "create", baljuoraId: null, templateId: "bj-a", code: "bjt-002" })] }, report, "ABCDE23456");
    const [result] = report.posted[0].items;
    expect(result.ok).toBe(false);
    expect(result.error).toContain("같은 상품코드(bjt-002)가 이미 있습니다");
    expect(fake.calls.some((call) => call.method === "POST" && call.url === "https://api.baljuora.com/products")).toBe(false);
  });

  it("설정 복사용 상품이 없으면 신규 등록을 하지 않고 이유를 알려 줍니다", async () => {
    const fake = createFake();
    const report = createReport();
    await runnerFor(fake).runPush({ type: "push", groupKeyword: "황금농부", groupId: null, items: [pushItem({ action: "create", baljuoraId: null, templateId: null, code: "BJT-NEW", supplierName: null, name: "봄날 부사 10kg", values: { ...pushItem({}).values, name: "봄날 부사 10kg" } })] }, report, "ABCDE23456");
    const [result] = report.posted[0].items;
    expect(result.ok).toBe(false);
    expect(result.error).toContain("설정 복사용 상품코드");
    expect(fake.calls.some((call) => call.method === "POST" && call.url === "https://api.baljuora.com/products")).toBe(false);
  });

  // 1.8.0(2026-11-25 프로세스 점검): 새 상품은 복사한 상품의 매입처 줄을 그대로 써서, 매입처가 다른 상품을 복사하면 발주가 엉뚱한 매입처로 갑니다.
  function addDami(fake: ReturnType<typeof createFake>) {
    fake.products["bj-d"] = {
      id: "bj-d", code: "DAMI-001", name: "다미 샤인머스캣", supplyPrice: 7700, consumerPrice: null, purchaseCost: 6000, categoryId: "bj-cat-fruit", imageUrls: [], prices: [],
      supplier: { id: "sup-2", name: "다미농장" }, shippingPolicy: { id: "ship-2", name: "다미 택배" },
      productSuppliers: [{ id: "ps-d", supplier: { id: "sup-2", companyName: "다미농장" }, shippingPolicy: { id: "pship-2" }, purchaseCost: 6000, materialCost: null, isDefault: true }],
      isVisible: true, isSoldOut: false, isTaxable: false
    };
  }
  const NEW_GRAPE = { name: "다미 거봉 2kg", supplyPrice: 18000, groupPrice: 18000, consumerPrice: null, purchaseCost: 15000, categoryId: "bj-cat-fruit", imageUrl: null, isTaxable: false };

  it("신규 등록: 설정 복사용 상품의 매입처가 DB센터 매입처와 다르면 발주오라의 같은 매입처 상품을 복사합니다", async () => {
    const fake = createFake({ listSuppliers: true });
    addDami(fake);
    const report = createReport();
    // 서버는 같은 매입처 연결 상품이 없어 설정 복사용 상품(봄날농원 bj-a)을 골랐음(fallback)
    await runnerFor(fake).runPush({ type: "push", groupKeyword: "황금농부", groupId: GROUP.id, items: [pushItem({ productId: "p-grape", action: "create", baljuoraId: null, templateId: "bj-a", templateMatch: "fallback", code: "DAMI-002", name: "다미 거봉 2kg", supplierName: "다미 농장(주)", fields: ["name", "supplyPrice", "purchaseCost", "category"], values: NEW_GRAPE })] }, report, "ABCDE23456");
    const create = fake.calls.find((call) => call.method === "POST" && call.url === "https://api.baljuora.com/products");
    expect(create?.body).toMatchObject({ code: "DAMI-002", name: "다미 거봉 2kg", supplierId: "sup-2", shippingPolicyId: "ship-2" });
    expect(create?.body.productSuppliers).toEqual([{ supplierId: "sup-2", shippingPolicyId: "pship-2", purchaseCost: 15000, materialCost: 0, isDefault: true }]);
    expect(report.posted[0].items[0]).toMatchObject({ productId: "p-grape", ok: true, baljuoraId: "bj-new" });
  });

  it("발주오라에 같은 매입처 상품이 없으면 다른 매입처로 등록하지 않고 멈춥니다", async () => {
    const fake = createFake({ listSuppliers: true });
    addDami(fake);
    const runner = runnerFor(fake);
    const report = createReport();
    await runner.runPush({ type: "push", groupKeyword: "황금농부", groupId: GROUP.id, items: [pushItem({ productId: "p-new-farm", action: "create", baljuoraId: null, templateId: "bj-a", templateMatch: "fallback", code: "NEW-001", name: "햇살 감자", supplierName: "햇살농장", fields: ["name", "supplyPrice"], values: { ...NEW_GRAPE, name: "햇살 감자" } })] }, report, "ABCDE23456");
    const [result] = report.posted[0].items;
    expect(result.ok).toBe(false);
    expect(result.error).toContain("발주오라에 '햇살농장' 매입처 상품이 없어 신규 등록을 멈췄습니다(설정 복사용 상품의 매입처는 '봄날농원')");
    expect(result.error).toContain("첫 상품을 1개 직접 등록");
    expect(fake.calls.some((call) => call.method === "POST" && call.url === "https://api.baljuora.com/products")).toBe(false);
    // 설정 복사용 상품도 없고 같은 매입처 상품도 없을 때도 같은 이유로 멈춤
    const noTemplate = createReport();
    await runner.runPush({ type: "push", groupKeyword: "황금농부", groupId: null, items: [pushItem({ action: "create", baljuoraId: null, templateId: null, code: "BJT-NEW", supplierName: "햇살농장", name: "햇살 고구마", values: { ...NEW_GRAPE, name: "햇살 고구마" } })] }, noTemplate, "ABCDE23456");
    expect(noTemplate.posted[0].items[0].error).toContain("'햇살농장' 매입처 상품이 없어 신규 등록을 멈췄습니다");
  });

  it("복사할 상품을 발주오라에서 지웠으면 같은 매입처 상품을 찾아 복사합니다", async () => {
    const fake = createFake({ listSuppliers: true });
    addDami(fake);
    const report = createReport();
    await runnerFor(fake).runPush({ type: "push", groupKeyword: "황금농부", groupId: null, items: [pushItem({ productId: "p-gone", action: "create", baljuoraId: null, templateId: "bj-deleted", templateMatch: "supplier", code: "DAMI-003", name: "다미 청포도", supplierName: "다미농장", fields: ["name", "supplyPrice"], values: { ...NEW_GRAPE, name: "다미 청포도" } })] }, report, "ABCDE23456");
    expect(report.posted[0].items[0]).toMatchObject({ ok: true, baljuoraId: "bj-new" });
    expect(fake.calls.find((call) => call.method === "POST" && call.url === "https://api.baljuora.com/products")?.body).toMatchObject({ supplierId: "sup-2" });
  });

  it("같은 상품을 복사하는 새 상품이 여러 개면 복사할 상품은 한 번만 읽습니다(1.9.2)", async () => {
    const fake = createFake({ listSuppliers: true });
    addDami(fake);
    const report = createReport();
    const grape = (index: number) => pushItem({ productId: `p-grape-${index}`, action: "create", baljuoraId: null, templateId: "bj-d", templateMatch: "supplier", code: `DAMI-1${index}`, name: `다미 거봉 ${index}kg`, supplierName: "다미농장", fields: ["name", "supplyPrice"], values: { ...NEW_GRAPE, name: `다미 거봉 ${index}kg` } });
    await runnerFor(fake).runPush({ type: "push", groupKeyword: "황금농부", groupId: null, items: [grape(1), grape(2), grape(3)] }, report, "ABCDE23456");
    expect(fake.calls.filter((call) => call.method === "GET" && new URL(call.url).pathname === "/products/bj-d")).toHaveLength(1);
    expect(fake.calls.filter((call) => call.method === "POST" && call.url === "https://api.baljuora.com/products").map((call) => call.body.name).sort()).toEqual(["다미 거봉 1kg", "다미 거봉 2kg", "다미 거봉 3kg"]);
    expect(postedItems(report).map((item: any) => item.ok)).toEqual([true, true, true]);
  });

  it("복사할 상품의 매입처 이름을 읽지 못하면 DB센터에서 같은 매입처로 연결된 상품일 때만 복사합니다", async () => {
    const fake = createFake();
    fake.products["bj-x"] = { id: "bj-x", code: "X-1", name: "이름 없는 매입처 상품", supplyPrice: 1000, consumerPrice: null, purchaseCost: 800, categoryId: "bj-cat-farm", imageUrls: [], prices: [], supplier: { id: "sup-x" }, isVisible: true, isSoldOut: false };
    const item = (templateMatch: string) => pushItem({ productId: `p-${templateMatch}`, action: "create", baljuoraId: null, templateId: "bj-x", templateMatch, code: `X-${templateMatch}`, name: `새 상품 ${templateMatch}`, supplierName: "엑스상회", fields: ["name", "supplyPrice"], values: { ...NEW_GRAPE, name: `새 상품 ${templateMatch}` } });
    const runner = runnerFor(fake);
    const trusted = createReport();
    await runner.runPush({ type: "push", groupKeyword: "황금농부", groupId: null, items: [item("supplier")] }, trusted, "ABCDE23456");
    expect(trusted.posted[0].items[0].ok).toBe(true);
    expect(fake.calls.filter((call) => call.method === "POST" && call.url === "https://api.baljuora.com/products").map((call) => call.body.supplierId)).toEqual(["sup-x"]);
    const blocked = createReport();
    await runner.runPush({ type: "push", groupKeyword: "황금농부", groupId: null, items: [item("fallback")] }, blocked, "ABCDE23456");
    expect(blocked.posted[0].items[0]).toMatchObject({ ok: false, error: expect.stringContaining("'엑스상회' 매입처 상품이 없어") });
  });

  it("로그인 토큰이 만료되면 발주오라 화면처럼 한 번 갱신하고 다시 요청합니다", async () => {
    const fake = createFake();
    const runner = runnerFor(fake);
    runner.state.token = "expired-token";
    const detail = await runner.api("GET", "products/bj-a");
    expect(detail.data.id).toBe("bj-a");
    expect(fake.state.refreshCount).toBe(1);
  });
});

// ─── 입금·정산 반영 도우미(2026-11-23) ─────────────────────────────────────────
// 발주오라 정산 관리 > 입/출금 계좌 조회 화면을 흉내 낸 가짜 화면에서 버튼을 대신 누르는지 확인합니다.
type BankRow = { at: string; kind: "입금" | "출금"; partnerType: "" | "매입처" | "매출처"; partnerName: string; depositor: string; amount: number };

const FAST = { poll: 5, page: 600, start: 120, collect: 2000, settle: 10, enable: 400, dialog: 400, verify: 600 };

function bankRowHtml(row: BankRow) {
  // happy-dom은 selected 속성을 한 칸 앞 옵션으로 읽어(실제 브라우저와 다름) 선택값은 render()에서 select.value로 넣습니다.
  const typeOptions = ["", "매입처", "매출처"].map((value) => `<option value="${value}">${value || "선택"}</option>`).join("");
  const names = ["", "농업회사법인 다미 주식회사", "(주) 두고홀딩스", "하루마켓"];
  const nameOptions = names.map((value) => `<option value="${value}">${value || "선택"}</option>`).join("");
  return `<tr><td><input type="checkbox"></td><td>${row.at.replace(" ", "<br>")}</td><td>${row.kind}</td><td>KEB하나~1704</td><td><select>${typeOptions}</select></td><td><select>${nameOptions}</select></td><td>Hana CBS</td><td>${row.depositor}</td><td>${row.amount.toLocaleString("ko-KR")}</td><td>6,447,787</td><td><select><option>선택</option></select></td></tr>`;
}

function buildBankPage(options: { initial?: BankRow[]; collected?: BankRow[]; collectDelay?: number; rejectApply?: boolean; waitingOverride?: number; onBankPage?: boolean } = {}) {
  const state = { rows: [...(options.initial ?? [])], applyClicks: 0, confirmClicks: 0, collectClicks: 0 };
  const bankHtml = `<main><h2>입/출금 계좌 조회</h2>
    <div class="summary"><div>전체<span data-total></span></div><div>정산 대기<span data-wait></span></div><div>정산 완료<span>56 건</span></div></div>
    <div class="toolbar"><input value="20"><span>개씩 불러오기</span><button id="apply" disabled>정산 반영 처리</button><button id="collect">계좌내역 조회</button><button id="cancel" disabled>(선택)정산 반영 취소</button><button>조회</button></div>
    <table><thead><tr><th><input type="checkbox"></th><th>입/출금<br>일시</th><th>구분</th><th>내 계좌명</th><th>업체구분</th><th>거래처명</th><th>상대은행</th><th>상대계좌<br>예금주명</th><th>금액</th><th>잔액</th><th>용도</th></tr></thead><tbody></tbody></table></main>`;
  const render = () => {
    const tbody = document.querySelector("tbody")!;
    tbody.innerHTML = state.rows.length ? state.rows.map(bankRowHtml).join("") : `<tr><td colspan="11">데이터가 없습니다.</td></tr>`;
    Array.from(tbody.querySelectorAll("tr")).forEach((tr, index) => {
      const row = state.rows[index];
      if (!row) return;
      const selects = tr.querySelectorAll("select");
      (selects[0] as HTMLSelectElement).value = row.partnerType;
      (selects[1] as HTMLSelectElement).value = row.partnerName;
    });
    document.querySelector("[data-wait]")!.textContent = `${options.waitingOverride ?? state.rows.length} 건`;
    document.querySelector("[data-total]")!.textContent = `${state.rows.length + 56} 건`;
    (document.getElementById("apply") as HTMLButtonElement).disabled = true;
  };
  const mountBank = () => {
    document.querySelector("#app")!.innerHTML = bankHtml;
    render();
    const collect = document.getElementById("collect") as HTMLButtonElement;
    collect.addEventListener("click", () => {
      state.collectClicks += 1;
      collect.textContent = "수집 중...";
      collect.disabled = true;
      setTimeout(() => {
        state.rows = [...state.rows, ...(options.collected ?? [])];
        render();
        collect.textContent = "계좌내역 조회";
        collect.disabled = false;
      }, options.collectDelay ?? 30);
    });
    document.querySelector("tbody")!.addEventListener("click", (event) => {
      if ((event.target as HTMLInputElement).type !== "checkbox") return;
      setTimeout(() => {
        const any = Array.from(document.querySelectorAll<HTMLInputElement>("tbody input[type=checkbox]")).some((box) => box.checked);
        (document.getElementById("apply") as HTMLButtonElement).disabled = !any;
      }, 0);
    });
    document.getElementById("apply")!.addEventListener("click", () => {
      state.applyClicks += 1;
      const dialog = document.createElement("div");
      dialog.setAttribute("role", "dialog");
      dialog.innerHTML = `<p>선택한 업체구분에 따라 매출처관리대장 / 매입처관리대장에 적용 됩니다</p><p>적용 하시겠습니까?</p><button data-ok>적용하기</button><button data-no>취소</button>`;
      document.body.appendChild(dialog);
      dialog.querySelector("[data-ok]")!.addEventListener("click", () => {
        state.confirmClicks += 1;
        const boxes = Array.from(document.querySelectorAll<HTMLInputElement>("tbody input[type=checkbox]"));
        const checked = new Set(boxes.map((box, index) => (box.checked ? index : -1)).filter((index) => index >= 0));
        dialog.remove();
        setTimeout(() => {
          if (!options.rejectApply) state.rows = state.rows.filter((_, index) => !checked.has(index));
          render();
        }, 20);
      });
      dialog.querySelector("[data-no]")!.addEventListener("click", () => dialog.remove());
    });
  };
  document.body.innerHTML = `<aside><nav><a href="/doogobiz24/dashboard">대시보드</a><a href="/doogobiz24/settlement/bank-transaction" id="bank-link">입/출금 계좌 조회</a></nav></aside><div id="app"><h2>대시보드</h2></div>`;
  document.getElementById("bank-link")!.addEventListener("click", (event) => { event.preventDefault(); mountBank(); });
  if (options.onBankPage !== false) mountBank();
  return state;
}

const DAMI: BankRow = { at: "2026-11-23 14:11:08", kind: "출금", partnerType: "매입처", partnerName: "농업회사법인 다미 주식회사", depositor: "농업회사법인다미주식", amount: 14400 };
const DOOGO: BankRow = { at: "2026-11-23 13:03:43", kind: "출금", partnerType: "매입처", partnerName: "(주) 두고홀딩스", depositor: "김지연", amount: 241750 };
const UNMATCHED: BankRow = { at: "2026-11-23 15:20:01", kind: "입금", partnerType: "매출처", partnerName: "", depositor: "김철수", amount: 30000 };
const SELLER: BankRow = { at: "2026-11-23 16:02:11", kind: "입금", partnerType: "매출처", partnerName: "하루마켓", depositor: "하루마켓", amount: 128000 };

function settlePanel() {
  return internals.createPanel(document, { title: "두고푸드 · 입금·정산 반영", note: "테스트" });
}

describe("입금·정산 반영 도우미(입/출금 계좌 조회 화면 버튼 대신 누르기)", () => {
  it("계좌내역 조회 → 업체구분·거래처명이 모두 들어간 정산 대기 건만 체크 → 정산 반영 처리 → 적용하기, 거래처가 빈 건은 남겨 둡니다", async () => {
    const state = buildBankPage({ collected: [DAMI, DOOGO, UNMATCHED, SELLER] });
    const panel = settlePanel();
    const asked: any[] = [];
    const result = await internals.runSettlement(window, panel, { timing: FAST, confirm: async (rows: any[]) => { asked.push(rows.map((row) => row.partnerName)); return true; } });
    expect(state.collectClicks).toBe(1);
    expect(asked).toEqual([["농업회사법인 다미 주식회사", "(주) 두고홀딩스", "하루마켓"]]);
    expect(state.applyClicks).toBe(1);
    expect(state.confirmClicks).toBe(1);
    expect(result.applied.map((row: any) => row.amount)).toEqual([14400, 241750, 128000]);
    expect(result.skipped.map((row: any) => row.depositor)).toEqual(["김철수"]);
    expect(result.applied[0]).toMatchObject({ at: "2026-11-23 14:11:08", kind: "출금", partnerType: "매입처", depositor: "농업회사법인다미주식" });
    expect(state.rows).toEqual([UNMATCHED]); // 거래처가 빈 입금 건은 정산 대기에 그대로
    expect(document.querySelector<HTMLInputElement>("tbody input[type=checkbox]")!.checked).toBe(false);
    const status = panel.element.querySelector("[data-status]").textContent;
    expect(status).toContain("정산 반영 3건");
    expect(status).toContain("직접 확인할 건 1개");
    expect(panel.element.textContent).toContain("매출처 입금 건은 발주오라가 매출처관리대장에 반영");
  });

  it("목록을 보고 '그만두기'를 고르면(또는 패널을 닫으면) 아무것도 반영하지 않습니다", async () => {
    const state = buildBankPage({ collected: [DAMI, DOOGO] });
    const panel = settlePanel();
    const result = await internals.runSettlement(window, panel, { timing: FAST, confirm: async () => false });
    expect(result.stopped).toBe(true);
    expect(state.applyClicks).toBe(0);
    expect(state.rows).toHaveLength(2);
    expect(Array.from(document.querySelectorAll<HTMLInputElement>("tbody input[type=checkbox]")).every((box) => !box.checked)).toBe(true);
  });

  it("패널 버튼으로 묻고, 패널을 닫으면 반영하지 않습니다", async () => {
    const state = buildBankPage({ collected: [DAMI] });
    const panel = settlePanel();
    const running = internals.runSettlement(window, panel, { timing: FAST });
    for (let tries = 0; tries < 60 && !panel.element.querySelector("[data-action=apply]"); tries += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(panel.element.querySelector("[data-action=apply]").textContent).toBe("1건 정산 반영하기");
    (panel.element.querySelector("[data-close]") as HTMLButtonElement).click();
    const result = await running;
    expect(result.stopped).toBe(true);
    expect(state.applyClicks).toBe(0);
  });

  it("다른 화면이면 왼쪽 메뉴 '입/출금 계좌 조회'로 이동해 시작합니다", async () => {
    const state = buildBankPage({ onBankPage: false, collected: [DAMI] });
    expect(internals.readBankTable(window)).toBeNull();
    const result = await internals.runSettlement(window, settlePanel(), { timing: FAST, confirm: async () => true });
    expect(state.collectClicks).toBe(1);
    expect(result.applied).toHaveLength(1);
  });

  it("표에 정산 대기가 아닌 건까지 보이면(요약 칸 대기 수보다 많으면) 반영하지 않고 멈춥니다", async () => {
    const state = buildBankPage({ collected: [DAMI, DOOGO], waitingOverride: 1 });
    await expect(internals.runSettlement(window, settlePanel(), { timing: FAST, confirm: async () => true })).rejects.toThrow("정산 대기가 아닌 건도");
    expect(state.applyClicks).toBe(0);
  });

  it("발주오라가 반영하지 않으면 '반영 안 됨'으로 알립니다", async () => {
    const state = buildBankPage({ collected: [DAMI], rejectApply: true });
    const panel = settlePanel();
    const result = await internals.runSettlement(window, panel, { timing: FAST, confirm: async () => true });
    expect(state.confirmClicks).toBe(1);
    expect(result.applied).toHaveLength(0);
    expect(result.left).toHaveLength(1);
    expect(panel.element.querySelector("[data-status]").textContent).toContain("반영 안 됨 1건");
  });

  it("업체구분·거래처가 모두 들어간 건이 없으면 정산 반영 처리 버튼을 누르지 않습니다", async () => {
    const state = buildBankPage({ collected: [UNMATCHED] });
    const panel = settlePanel();
    const result = await internals.runSettlement(window, panel, { timing: FAST, confirm: async () => true });
    expect(state.applyClicks).toBe(0);
    expect(result.applied).toHaveLength(0);
    expect(panel.element.querySelector("[data-status]").textContent).toContain("정산 반영한 건 없음");
  });

  it("주소의 #doogo-settle 또는 작업 코드로 할 일을 고릅니다", () => {
    expect(internals.settleRequested({ location: { hash: "#doogo-settle", search: "" } })).toBe(true);
    expect(internals.settleRequested({ location: { hash: "#doogo-sync=ABCDE23456", search: "" } })).toBe(false);
    const replaced: string[] = [];
    const fakeWin = { location: { hash: "#doogo-sync=ABCDE23456", search: "", pathname: "/doogobiz24/dashboard" }, sessionStorage: { setItem() {}, getItem() { return null; } }, history: { replaceState: (_a: unknown, _b: string, url: string) => replaced.push(url) } };
    expect(internals.codeFromLocation(fakeWin)).toBe("ABCDE23456");
    expect(internals.codeFromLocation({ ...fakeWin, location: { hash: "", search: "", pathname: "/" } })).toBeNull();
  });
});

// ─── 판매·매출처 읽기(1.7.0, 2026-11-23 관리자 요청 "1차 개발") ─────────────────
// 발주오라 주문 목록 화면 공용 코드(GET orders/items, 커서 meta.nextCursor)와 매출처 상세 화면 칸(merchant/sellers)을 흉내 냅니다.
function createSalesFake(options: { rejectRangeType?: boolean; failOrdersAtCursor?: string; suppliers?: any[] | "fail" } = {}) {
  const sellers: any[] = [
    {
      id: "s-1", merchantId: "m-1", groupId: "grp-1", username: "greenmarket", name: "박담당", phone: "010-1111-2222", email: "green@example.com",
      companyName: "그린마켓", representativeName: "김대표", businessNumber: "123-45-67890", businessType: "도소매", businessCategory: "농산물",
      zipCode: "06000", address: "서울시 강남구 테헤란로 1", addressDetail: "2층", status: "ACTIVE", orderAcceptType: "PREPAID",
      bankAccount: { bankName: "국민은행", accountHolder: "김대표", accountNumber: "000-000" }, businessLicense: { value: "https://files.example/license.pdf" },
      settings: { secret: true }, lastLoginAt: "2026-11-20T01:00:00Z", createdAt: "2026-01-02T00:00:00Z"
    },
    { id: "s-2", merchantId: "m-1", companyName: "바다상회", status: "ACTIVE", createdAt: "2026-03-01T00:00:00Z" }
  ];
  const sellerDetails: Record<string, any> = {
    "s-2": { ...sellers[1], representativeName: "이대표", businessNumber: "2223344445", businessType: "소매", businessCategory: "수산물", address: "부산시 해운대구", email: "sea@example.com", bankAccount: { accountNumber: "999" } }
  };
  const item = (id: string, extra: Record<string, unknown>) => ({
    id, orderId: `o-${id}`, createdAt: "2026-11-03T15:30:00.000Z", status: "delivered", productId: "bj-a", productName: "봄날 사과 5kg", productImageUrl: "https://files.example/a.jpg",
    quantity: 2, csProcessedQuantity: 0, supplyPrice: 26000, purchaseCost: 20000, salesShippingFee: 3000, purchaseShippingFee: 2500,
    supplierId: "sup-1", supplierName: "봄날농원", sellerName: "그린마켓", recipientName: "홍길동", recipientPhone: "010-9999-8888", trackingNumber: "1234",
    csRequests: [], ...extra
  });
  const orderItems = [
    item("i-1", {}),
    item("i-2", { quantity: 3, csProcessedQuantity: 1, productId: "bj-b", productName: "봄날 배", supplyPrice: 38000 }),
    item("i-3", { sellerName: "바다상회", productId: "bj-c", productName: "건강즙", supplyPrice: 11000, effectiveQuantity: 0, quantity: 1, csProcessedQuantity: 1 }),
    item("i-4", { status: "pending", productId: "bj-c", productName: "건강즙", supplyPrice: 11000 }),
    item("i-5", { sellerName: "바다상회", productId: "bj-b", productName: "봄날 배", supplyPrice: 38000, quantity: 1 })
  ];
  const taxable: Record<string, boolean> = { "bj-a": false, "bj-b": false, "bj-c": true };
  const calls: Array<{ method: string; url: URL }> = [];
  const fetch = async (input: string, init: RequestInit = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const url = new URL(input);
    calls.push({ method, url });
    if (url.origin === "https://console.baljuora.com" && url.pathname === "/api/auth/refresh") return jsonResponse(200, { accessToken: "t1" });
    const path = url.pathname.replace(/^\//, "");
    if (method === "GET" && path === "merchant/seller-groups") return jsonResponse(200, { statusCode: 200, data: { items: [GROUP], meta: { nextCursor: null } } });
    if (method === "GET" && path === "merchant/sellers") return jsonResponse(200, { statusCode: 200, data: { items: sellers, meta: { nextCursor: null } } });
    // 발주오라 매입처 목록(거래처 관리 > 매입처, 1.10.0 주문 동기화)
    if (method === "GET" && path === "merchant/suppliers") {
      if (options.suppliers === "fail" || !options.suppliers) return jsonResponse(404, { statusCode: 404, message: "Not Found" });
      return jsonResponse(200, { statusCode: 200, data: { items: options.suppliers, meta: { page: 1, limit: 100, total: options.suppliers.length, totalPages: 1, hasNext: false } } });
    }
    if (method === "GET" && path.startsWith("merchant/sellers/")) {
      const detail = sellerDetails[decodeURIComponent(path.slice("merchant/sellers/".length))];
      return detail ? jsonResponse(200, { statusCode: 200, data: detail }) : jsonResponse(404, { statusCode: 404, message: "Not Found" });
    }
    if (method === "GET" && path === "orders/items") {
      if (options.rejectRangeType && url.searchParams.has("rangeType")) return jsonResponse(400, { statusCode: 400, message: ["rangeType must be one of the following values: accepted, purchase, shipping"], error: "Bad Request" });
      const cursor = url.searchParams.get("cursor");
      if (options.failOrdersAtCursor && cursor === options.failOrdersAtCursor) return jsonResponse(500, { statusCode: 500, message: "Internal Server Error" });
      const start = cursor ? Number(cursor.slice(1)) : 0;
      const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 2);
      const pageItems = orderItems.slice(start, start + limit);
      const next = start + limit < orderItems.length ? `c${start + limit}` : null;
      return jsonResponse(200, { statusCode: 200, data: { items: pageItems, meta: { nextCursor: next } } });
    }
    if (method === "GET" && path.startsWith("products/")) {
      const id = decodeURIComponent(path.slice("products/".length));
      return id in taxable ? jsonResponse(200, { statusCode: 200, data: { id, name: id, isTaxable: taxable[id] } }) : jsonResponse(404, { statusCode: 404, message: "Not Found" });
    }
    // 발주오라 대시보드 숫자(1.11.0): 대시보드 화면과 같은 API(statistics/…). 상품별 매출은 이 흉내에서 오류(500).
    if (method === "GET" && path === "statistics/recent-orders") return jsonResponse(200, { statusCode: 200, data: { purchased: 2, shipping: 48, delivered: 94, total: 144, cancelled: 26, recipientPhone: "010-1234-5678" } });
    if (method === "GET" && path === "statistics/summary-by-period") return jsonResponse(200, { statusCode: 200, data: { today: { sales: 219710, purchase: 213300, margin: 6410 } } });
    if (method === "GET" && path === "statistics/top-sellers") return jsonResponse(200, { statusCode: 200, data: [{ sellerName: "나도건강", orderCount: 102, totalAmount: 4257500, sellerAddress: "서울시 비밀로" }] });
    if (method === "GET" && path === "statistics/top-products") return jsonResponse(500, { statusCode: 500, message: "Internal Server Error" });
    return jsonResponse(404, { message: `not found ${input}` });
  };
  return { fetch, calls, sellers, orderItems };
}

function salesRunner(fake: ReturnType<typeof createSalesFake>) {
  return internals.createRunner({ fetch: fake.fetch, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
}

// 2026-11-27 관리자 신고 "주문 동기화를 최신으로 했는데 나도건강 금액이 발주오라 대시보드와 다르다 — 주문 동기화를 누르면 대시보드 숫자까지":
// 책갈피 1.11.0은 판매 읽기(step.dashboard) 때 발주오라 대시보드와 같은 API(statistics/…)를 읽어 그대로 보냅니다(받는 사람 정보 칸은 뺌).
describe("발주오라 대시보드 숫자 읽기(1.11.0)", () => {
  const step = { start: "2026-10-01", end: "2026-11-23", buyers: false, knownTax: ["bj-a", "bj-b", "bj-c"], dashboard: true };

  it("대시보드 화면이 부른 주소(조건 포함)를 그대로 다시 불러 주문 줄보다 먼저 보내고, 못 읽은 칸이 있어도 주문은 계속 읽습니다", async () => {
    const fake = createSalesFake();
    const report = createReport();
    const entries = [
      { name: "https://api.baljuora.com/statistics/top-sellers?period=thisMonth&limit=5" },
      { name: "https://api.baljuora.com/statistics/top-sellers?period=thisMonth&limit=5" },
      { name: "https://api.baljuora.com/statistics/recent-orders" },
      { name: "https://console.baljuora.com/statistics/top-sellers?x=1" },
      { name: "not a url" }
    ];
    const runner = internals.createRunner({ fetch: fake.fetch, locks: undefined, consoleOrigin: "https://console.baljuora.com", pagePath: "/doogofood/dashboard", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test", resourceEntries: () => entries });
    const result = await runner.runSales(step, report, { final: true });
    expect(result).toMatchObject({ lines: 5, complete: true, dashboard: 3 });
    // 같은 조건은 한 번만, 다른 사이트 주소는 무시
    const topCalls = fake.calls.filter((call) => call.url.pathname === "/statistics/top-sellers");
    expect(topCalls.map((call) => call.url.search)).toEqual(["?period=thisMonth&limit=5"]);
    expect(fake.calls.filter((call) => call.url.pathname.startsWith("/statistics/")).map((call) => call.url.pathname)).toEqual(["/statistics/recent-orders", "/statistics/summary-by-period", "/statistics/top-sellers", "/statistics/top-products"]);
    // 대시보드 → 주문 줄 순서, 발주오라는 읽기만
    expect(fake.calls.some((call) => call.method !== "GET" && call.url.origin === "https://api.baljuora.com")).toBe(false);
    const dashboardIndex = report.posted.findIndex((body) => body.dashboard);
    const linesIndex = report.posted.findIndex((body) => body.salesLines);
    expect(dashboardIndex).toBeGreaterThanOrEqual(0);
    expect(dashboardIndex).toBeLessThan(linesIndex);
    const dashboard = report.posted[dashboardIndex].dashboard;
    expect(dashboard.page).toBe("/doogofood/dashboard");
    expect(dashboard.responses.map((item: any) => [item.endpoint, item.status, item.fromPage])).toEqual([
      ["statistics/recent-orders", 200, true],
      ["statistics/summary-by-period", 200, false],
      ["statistics/top-sellers", 200, true],
      ["statistics/top-products", 500, false]
    ]);
    expect(dashboard.responses[2]).toMatchObject({ params: { period: "thisMonth", limit: "5" }, data: [{ sellerName: "나도건강", orderCount: 102, totalAmount: 4257500 }] });
    // 받는 사람 연락처·주소 같은 칸은 보내지 않음
    expect(JSON.stringify(dashboard)).not.toMatch(/010-1234|비밀로|recipient|Address/);
    expect(dashboard.responses[3].error).toContain("Internal Server Error");
  });

  it("다른 화면에서 책갈피를 눌러 대시보드 주소 기록이 없으면 조건 없이 부르고, step.dashboard가 없으면(예전 작업) 읽지 않습니다", async () => {
    const fake = createSalesFake();
    const report = createReport();
    await internals.createRunner({ fetch: fake.fetch, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" }).runSales(step, report, { final: true });
    expect(fake.calls.filter((call) => call.url.pathname === "/statistics/top-sellers").map((call) => call.url.search)).toEqual([""]);
    const old = createSalesFake();
    const oldReport = createReport();
    await salesRunner(old).runSales({ ...step, dashboard: undefined }, oldReport, { final: true });
    expect(old.calls.some((call) => call.url.pathname.startsWith("/statistics/"))).toBe(false);
    expect(oldReport.posted.some((body) => body.dashboard)).toBe(false);
  });
});

describe("판매·매출처 읽기(1.7.0)", () => {
  const step = { start: "2026-10-01", end: "2026-11-23", buyers: true, knownTax: ["bj-a"] };

  it("주문 상품 줄 정리: 취소·반품 처리 수량을 뺀 수량, 받는 사람 이름·연락처는 넣지 않습니다", () => {
    const line = internals.normalizeOrderItem({ id: "i-9", orderId: "o-9", createdAt: "2026-11-01T00:00:00Z", status: "DELIVERED", productId: "bj-a", productName: " 사과  5kg ", quantity: 5, csProcessedQuantity: 2, supplyPrice: "1,000", purchaseCost: 700, sellerName: "그린마켓", recipientName: "홍길동", recipientPhone: "010" });
    expect(line).toEqual({ id: "i-9", orderId: "o-9", orderedAt: "2026-11-01T00:00:00Z", status: "delivered", productId: "bj-a", productCode: null, productName: "사과 5kg", supplierId: null, supplierName: null, sellerId: null, sellerName: "그린마켓", quantity: 5, netQuantity: 3, supplyPrice: 1000, purchaseCost: 700, salesShippingFee: 0, purchaseShippingFee: 0 });
    expect(internals.normalizeOrderItem({ id: "i-10", createdAt: "2026-11-01", quantity: 2, effectiveQuantity: 5, supplyPrice: 10 }).netQuantity).toBe(2);
  });

  it("매출처(상세로 빈 칸 채움) → 주문 상품 줄(커서로 끝까지) → 모르는 상품만 과세 여부 → DB센터로 보내고 끝냅니다(발주오라는 읽기만)", async () => {
    const fake = createSalesFake();
    const report = createReport();
    const result = await salesRunner(fake).runSales(step, report, { final: true });
    expect(result).toEqual({ lines: 5, buyers: 2, suppliers: 0, complete: true, error: null });
    // 매입처는 운영 홈 '주문 동기화'(step.suppliers)일 때만 읽습니다.
    expect(fake.calls.some((call) => call.url.pathname === "/merchant/suppliers")).toBe(false);
    expect(fake.calls.some((call) => call.method !== "GET" && call.url.origin === "https://api.baljuora.com")).toBe(false);
    // 주문 목록은 주문일 기준 기간으로, 커서를 따라 끝까지
    const orderCalls = fake.calls.filter((call) => call.url.pathname === "/orders/items");
    expect(orderCalls[0].url.searchParams.get("rangeType")).toBe("order");
    expect(orderCalls[0].url.searchParams.get("startDate")).toBe("2026-10-01");
    expect(orderCalls[0].url.searchParams.get("endDate")).toBe("2026-11-23");
    expect(orderCalls.map((call) => call.url.searchParams.get("cursor"))).toEqual([null, "c2", "c4"]);
    // 매출처: 목록에 빈 칸이 있는 바다상회만 상세를 읽고, 계좌·사업자등록증·설정은 보내지 않음
    const buyers = report.posted.filter((body) => body.buyers).flatMap((body) => body.buyers);
    expect(fake.calls.filter((call) => call.url.pathname.startsWith("/merchant/sellers/")).map((call) => call.url.pathname)).toEqual(["/merchant/sellers/s-2"]);
    expect(buyers.find((buyer: any) => buyer.id === "s-1")).toMatchObject({ companyName: "그린마켓", representativeName: "김대표", businessNumber: "123-45-67890", businessType: "도소매", businessCategory: "농산물", managerName: "박담당", groupName: GROUP.name, joinedAt: "2026-01-02T00:00:00Z" });
    expect(buyers.find((buyer: any) => buyer.id === "s-2")).toMatchObject({ representativeName: "이대표", businessNumber: "2223344445", address: "부산시 해운대구", email: "sea@example.com" });
    expect(JSON.stringify(buyers)).not.toMatch(/bankAccount|accountNumber|license|secret/);
    // 과세 여부: 이미 아는 bj-a는 빼고 bj-b·bj-c만 상세로 확인
    expect(fake.calls.filter((call) => call.url.pathname.startsWith("/products/")).map((call) => call.url.pathname).sort()).toEqual(["/products/bj-b", "/products/bj-c"]);
    expect(report.posted.find((body) => body.productTax).productTax).toEqual({ "bj-b": false, "bj-c": true });
    // 판매 줄: 받는 사람 정보 없음, 남은 수량
    const lines = report.posted.filter((body) => body.salesLines).flatMap((body) => body.salesLines);
    expect(lines.map((line: any) => [line.id, line.quantity, line.netQuantity, line.status])).toEqual([["i-1", 2, 2, "delivered"], ["i-2", 3, 2, "delivered"], ["i-3", 1, 0, "delivered"], ["i-4", 2, 2, "pending"], ["i-5", 1, 1, "delivered"]]);
    expect(JSON.stringify(lines)).not.toMatch(/홍길동|010-9999|recipient|tracking/);
    // 순서: 매출처 → 과세 여부 → 판매 줄 → 마지막 보고(끝까지 읽음)
    const kinds = report.posted.map((body) => body.buyers ? "buyers" : body.productTax ? "tax" : body.salesLines ? "lines" : body.salesDone ? "done" : "other");
    expect(kinds).toEqual(["buyers", "tax", "lines", "done"]);
    const last = report.posted[report.posted.length - 1];
    expect(last).toMatchObject({ final: true, salesDone: { complete: true, error: null } });
    expect(last.diagnostics.structure.orderItem.supplyPrice).toBe("number");
    expect(last.diagnostics.structure.sellerList.companyName).toBe("string");
  });

  it("발주오라가 rangeType을 받지 않으면 빼고 다시 읽습니다", async () => {
    const fake = createSalesFake({ rejectRangeType: true });
    const report = createReport();
    const result = await salesRunner(fake).runSales({ ...step, buyers: false }, report, { final: true });
    expect(result.complete).toBe(true);
    expect(result.lines).toBe(5);
    const orderCalls = fake.calls.filter((call) => call.url.pathname === "/orders/items");
    expect(orderCalls[0].url.searchParams.has("rangeType")).toBe(true);
    expect(orderCalls.slice(1).every((call) => !call.url.searchParams.has("rangeType"))).toBe(true);
  });

  it("주문을 읽다 멈추면 '끝까지 읽지 않음'으로 알리고(DB센터는 사라진 줄을 지우지 않음) 읽은 줄과 매출처는 보냅니다", async () => {
    const fake = createSalesFake({ failOrdersAtCursor: "c2" });
    const report = createReport();
    const result = await salesRunner(fake).runSales(step, report, { final: true });
    expect(result.complete).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.buyers).toBe(2);
    const last = report.posted[report.posted.length - 1];
    expect(last.final).toBe(true);
    expect(last.salesDone.complete).toBe(false);
    expect(report.logs.some((text) => text.includes("주문을 끝까지 읽지 못했습니다"))).toBe(true);
  });

  it("비교 작업에 판매가 들어 있으면 상품을 보낸 뒤 판매·매출처를 읽고 마지막에 끝냅니다(이번에 읽은 과세 여부를 씀)", async () => {
    const compareFake = createFake();
    const salesFake = createSalesFake();
    const fetch = async (input: string, init: RequestInit = {}) => {
      const path = new URL(input).pathname;
      if (path.startsWith("/merchant/sellers") || path === "/orders/items") return salesFake.fetch(input, init);
      return compareFake.fetch(input, init);
    };
    const runner = internals.createRunner({ fetch, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const report = createReport();
    const result = await runner.runCompare({ type: "compare", groupKeyword: "황금농부", detailIds: ["bj-a", "bj-b"], sales: { ...step, knownTax: [] } }, report);
    expect(result.received).toBe(3);
    expect(result.sales).toMatchObject({ lines: 5, buyers: 2, complete: true });
    const finals = report.posted.filter((body) => body.final);
    expect(finals).toHaveLength(1);
    expect(finals[0].salesDone).toBeTruthy();
    expect(report.posted[0].final).toBe(false);
    // 비교에서 읽은 과세 여부(bj-a: 면세)는 다시 읽지 않고 함께 보냄
    const apple = report.posted[0].snapshots.find((snapshot: any) => snapshot.id === "bj-a");
    expect(apple.isTaxable).toBe(false);
    expect(report.posted.find((body) => body.productTax).productTax["bj-a"]).toBe(false);
  });
});

// ─── 매입원가(2026-11-24 운영: 샤인머스캣 원가 6,600을 보냈는데 발주오라 매입원가 6,400 그대로) ─────────────────
// 가격 저장(PUT products/:id/pricing)은 purchaseCost를 오류 없이 버립니다. 발주오라 상품 수정 화면처럼 매입처 목록 전체를 PUT products/:id 로 보냅니다.
describe("매입원가 보내기(매입처 목록 productSuppliers)", () => {
  const shine = { name: "[다] [당도 선별] 샤인머스캣 500g(1송이)", supplyPrice: 7700, groupPrice: 7200, consumerPrice: null, purchaseCost: 6600, categoryId: null, imageUrl: null, isTaxable: false };

  function shineFake() {
    const fake = createIncludeFake();
    fake.product.name = shine.name;
    fake.product.supplyPrice = 7680;
    fake.product.productSuppliers = [{ id: "ps-dami", supplier: { id: "sup-dami", name: "농업회사법인 다미 주식회사" }, purchaseCost: 6400, materialCost: null, isDefault: true, shippingPolicy: { id: "pship-dami", name: "다미" } }];
    return fake;
  }

  it("보낼 매입처 목록: 기본 매입처 줄의 매입원가만 바꾸고 다른 매입처 줄(매입처·매입배송정책·매입원가·부자재가)은 그대로", () => {
    const detail = { productSuppliers: [
      { id: "ps-1", supplier: { id: "sup-a" }, shippingPolicy: { id: "sh-a" }, purchaseCost: 6400, materialCost: null, isDefault: true },
      { id: "ps-2", supplier: { id: "sup-b" }, shippingPolicy: { id: "sh-b" }, purchaseCost: 6100, materialCost: 300, isDefault: false }
    ] };
    expect(internals.buildProductSuppliers(detail, 6600)).toEqual([
      { supplierId: "sup-a", shippingPolicyId: "sh-a", purchaseCost: 6600, materialCost: 0, isDefault: true },
      { supplierId: "sup-b", shippingPolicyId: "sh-b", purchaseCost: 6100, materialCost: 300, isDefault: false }
    ]);
    // 기본 매입처를 알 수 없거나(둘 다 기본 아님), 매입원가를 모르는 다른 줄이 있거나, 매입처가 없으면 보내지 않음
    expect(internals.buildProductSuppliers({ productSuppliers: detail.productSuppliers.map((row) => ({ ...row, isDefault: false })) }, 6600)).toBeNull();
    expect(internals.buildProductSuppliers({ productSuppliers: [detail.productSuppliers[0], { ...detail.productSuppliers[1], purchaseCost: null }] }, 6600)).toBeNull();
    expect(internals.buildProductSuppliers({ productSuppliers: [] }, 6600)).toBeNull();
    expect(internals.buildProductSuppliers({}, 6600)).toBeNull();
    // 매입처가 하나뿐이면 기본 표시가 없어도 그 줄을 기본으로. 매입배송정책이 null(정책 없음)이면 발주오라 화면처럼 shippingPolicyId 없이
    expect(internals.buildProductSuppliers({ productSuppliers: [{ supplierId: "sup-z", shippingPolicy: null, purchaseCost: 100 }] }, 150)).toEqual([{ supplierId: "sup-z", purchaseCost: 150, materialCost: 0, isDefault: true }]);
    // 매입배송정책 칸이 아예 없는 줄(정책을 모름)은 빼고 보내면 정책이 지워질 수 있어 보내지 않음
    expect(internals.buildProductSuppliers({ productSuppliers: [{ supplierId: "sup-z", purchaseCost: 100 }] }, 150)).toBeNull();
    expect(internals.buildProductSuppliers({ productSuppliers: [detail.productSuppliers[0], { id: "ps-2", supplier: { id: "sup-b" }, purchaseCost: 6100, isDefault: false }] }, 6600)).toBeNull();
  });

  it("샤인머스캣 재현: 원가 6,400 → 6,600을 매입처 목록으로 보내 발주오라 매입원가가 바뀌고, 다시 읽어 확인합니다(공급가·황금농부도 함께)", async () => {
    const fake = shineFake();
    const runner = internals.createRunner({ fetch: fake.fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const result = await runner.pushItem(pushItem({ baljuoraId: "bj-y", code: "ass00050", name: shine.name, fields: ["purchaseCost", "supplyPrice", "groupPrice"], values: shine }), { groupKeyword: "황금농부" }, { group: GROUP, groupKeyword: "황금농부" }, "CODE");
    const pricing = fake.calls.find((call) => call.method === "PUT" && call.url.endsWith("/pricing"));
    expect(pricing?.body).toEqual({ supplyPrice: 7700 }); // 가격 저장에는 매입원가를 넣지 않음(발주오라가 버림)
    const updates = fake.calls.filter((call) => call.method === "PUT" && call.url === "https://api.baljuora.com/products/bj-y").map((call) => call.body);
    expect(updates).toContainEqual({ productSuppliers: [{ supplierId: "sup-dami", shippingPolicyId: "pship-dami", purchaseCost: 6600, materialCost: 0, isDefault: true }] });
    expect(fake.product.productSuppliers[0]).toMatchObject({ purchaseCost: 6600, supplier: { id: "sup-dami" }, shippingPolicy: { id: "pship-dami" }, isDefault: true });
    expect(result.ok).toBe(true);
    expect(result.applied.sort()).toEqual(["groupPrice", "purchaseCost", "supplyPrice"]);
    expect(result.skipped).toEqual([]);
    expect(result.snapshot).toMatchObject({ supplyPrice: 7700, groupPrice: 7200, purchaseCost: 6600 });
  });

  it("발주오라가 매입처 목록을 거절하면 매입원가만 사유와 함께 알리고, 공급가는 그대로 반영됨", async () => {
    const fake = createIncludeFake({ productPutAllowed: ["sellerProductPrices"] });
    fake.product.productSuppliers[0].purchaseCost = 5000;
    const runner = internals.createRunner({ fetch: fake.fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const result = await runner.pushItem(pushItem({ baljuoraId: "bj-y", code: "ass00050", fields: ["purchaseCost", "supplyPrice"], values: { name: "약과", supplyPrice: 7100, groupPrice: 6270, consumerPrice: null, purchaseCost: 5700, categoryId: null, imageUrl: null, isTaxable: false } }), { groupKeyword: "황금농부" }, { group: GROUP, groupKeyword: "황금농부" }, "CODE");
    expect(result.applied).toEqual(["supplyPrice"]);
    expect(result.skipped).toEqual([{ field: "purchaseCost", reason: expect.stringContaining("productSuppliers") }]);
    expect(fake.product.productSuppliers[0].purchaseCost).toBe(5000);
  });

  it("기본 매입처를 알 수 없으면 매입처 목록을 보내지 않고 이유를 알립니다(다른 매입처 값 보호)", async () => {
    const fake = createIncludeFake();
    fake.product.productSuppliers = [
      { id: "ps-1", supplier: { id: "sup-a" }, purchaseCost: 5000, materialCost: null, isDefault: false, shippingPolicy: { id: "sh-a" } },
      { id: "ps-2", supplier: { id: "sup-b" }, purchaseCost: 5100, materialCost: null, isDefault: false, shippingPolicy: { id: "sh-b" } }
    ];
    const runner = internals.createRunner({ fetch: fake.fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const result = await runner.pushItem(pushItem({ baljuoraId: "bj-y", code: "ass00050", fields: ["purchaseCost"], values: { name: "약과", supplyPrice: 6900, groupPrice: 6270, consumerPrice: null, purchaseCost: 5700, categoryId: null, imageUrl: null, isTaxable: false } }), { groupKeyword: "황금농부" }, { group: GROUP, groupKeyword: "황금농부" }, "CODE");
    expect(fake.calls.some((call) => call.method === "PUT" && call.body && "productSuppliers" in call.body)).toBe(false);
    expect(result.skipped).toEqual([{ field: "purchaseCost", reason: expect.stringContaining("기본 매입처") }]);
  });

  it("신규 등록: 설정 복사용 상품의 매입처 줄을 복사하면서 기본 매입처 매입원가를 DB센터 원가로 바꿉니다", () => {
    const template = { id: "bj-t", code: "T-1", name: "템플릿", supplyPrice: 1000, isTaxable: false, isVisible: true, productSuppliers: [{ id: "ps-t", createdAt: "x", updatedAt: "x", supplier: { id: "sup-dami" }, shippingPolicy: { id: "pship-dami" }, purchaseCost: 900, materialCost: null, isDefault: true }] };
    const body = internals.buildCreateBody(template, pushItem({ action: "create", code: "NEW-1", values: { ...shine, name: "새 샤인머스캣" } }));
    expect(body.productSuppliers).toEqual([{ supplierId: "sup-dami", shippingPolicyId: "pship-dami", purchaseCost: 6600, materialCost: 0, isDefault: true }]);
    expect(body).not.toHaveProperty("purchaseCost");
    expect(body).toMatchObject({ code: "NEW-1", name: "새 샤인머스캣", supplyPrice: 7700 });
  });

  it("매입처 이름: 기본 매입처 줄 → 상품 매입처 칸 순서로 읽고, 띄어쓰기·(주)·기호는 빼고 비교합니다", () => {
    expect(internals.supplierNameKey("봄날 농원(주)")).toBe(internals.supplierNameKey("봄날농원"));
    expect(internals.supplierNameKey("㈜ 다미-농장")).toBe("다미농장");
    expect(internals.supplierNameKey("주식회사 ABC Farm")).toBe("abcfarm");
    expect(internals.supplierNameKey(null)).toBe("");
    expect(internals.defaultSupplierName({ productSuppliers: [{ supplier: { id: "a", companyName: "보조매입처" }, isDefault: false }, { supplier: { id: "b", companyName: "기본매입처" }, isDefault: true }] })).toBe("기본매입처");
    expect(internals.defaultSupplierName({ productSuppliers: [{ supplierName: "하나뿐인 매입처" }] })).toBe("하나뿐인 매입처");
    expect(internals.defaultSupplierName({ productSuppliers: [{ supplier: { id: "a" } }, { supplier: { id: "b" } }], supplier: { id: "a", name: "상품 매입처" } })).toBe("상품 매입처");
    expect(internals.defaultSupplierName({ supplier: { id: "a" } })).toBeNull();
  });
});

// 상품 정보 칸(1.9.0, 2026-11-26): 판매 상태(품절·도매몰 노출)·원산지·관리코드·바코드·내용량·발주상품명 등.
// 발주오라 상품 수정 화면처럼 PUT products/:id 에 바뀐 칸만 보내고, 판매 상태를 받지 않으면 PUT products/:id/status 로 보냅니다.
function createExtrasFake(options: { putAllowed?: string[]; badCourier?: boolean } = {}) {
  const product: any = {
    id: "bj-x", code: "EXT-1", name: "사과 5kg", supplyPrice: 26000, imageUrls: [], categoryIds: ["bj-cat"], isVisible: true, isSoldOut: false, isTaxable: false,
    originText: "국내산", managementCode: null, barcode: "880111", contentAmount: null, contentUnit: null, contentCount: null, contentAmountBasis: null,
    purchaseProductName: null, purchaseQuantity: 1, shippingUnitType: null, shippingUnitValue: null, purchaseDeadline: "09:30:00", description: null,
    shippingLocation: null, manufacturingDate: null, expirationDate: null, courier: "CJ대한통운", tradeType: null,
    certificationStatus: "HAS_CERT", certifications: [{ kind: "gap", number: "G-1" }, { kind: "haccp", number: "H-1" }], taxonomyItem: { id: "tx-1", name: "사과" }
  };
  const putAllowed = options.putAllowed ?? ["isVisible", "isSoldOut", "isTaxable", "originText", "managementCode", "barcode", "contentAmount", "contentUnit", "contentCount", "contentAmountBasis", "purchaseProductName", "purchaseQuantity", "shippingUnitType", "shippingUnitValue", "purchaseDeadline", "description", "shippingLocation", "manufacturingDate", "expirationDate", "courier", "tradeType"];
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  const fetch = async (input: string, init: RequestInit = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    const url = new URL(input);
    if (url.pathname === "/api/auth/refresh") return jsonResponse(200, { accessToken: "t1" });
    const path = url.pathname.replace(/^\//, "");
    calls.push({ method, path, body });
    if (method === "GET" && path === "products/bj-x") return jsonResponse(200, { statusCode: 200, data: product });
    if (method === "PUT" && path === "products/bj-x") {
      const extra = Object.keys(body).filter((key) => !putAllowed.includes(key));
      if (extra.length) return jsonResponse(400, { statusCode: 400, message: extra.map((key) => `property ${key} should not exist`) });
      if (options.badCourier && "courier" in body) return jsonResponse(400, { statusCode: 400, message: ["courier must be one of the following values: cj, lotte, epost"] });
      Object.assign(product, body);
      return jsonResponse(200, { statusCode: 200, data: { id: product.id } });
    }
    if (method === "PUT" && path === "products/bj-x/status") {
      Object.assign(product, body);
      return jsonResponse(200, { statusCode: 200, data: { id: product.id } });
    }
    return jsonResponse(404, { message: `not found ${input}` });
  };
  return { fetch, product, calls };
}

const EXTRA_VALUES = {
  isSoldOut: true, isVisible: true, isTaxable: false, originText: "국내산", managementCode: "APL-5", barcode: "880222", contentAmount: 5, contentUnit: "kg", contentCount: 18, contentBasis: "total",
  purchaseName: "부사 5kg", purchaseQuantity: 1, shippingUnitType: "box", shippingUnitValue: 1, purchaseDeadline: "09:30", description: "아삭한 부사", shippingLocation: "경북 영주", manufacturingDate: null, expirationDate: null, courier: "롯데택배", tradeType: null, taxonomyItemId: null
};

function extrasItem(fields: string[], extra: Record<string, unknown> = EXTRA_VALUES) {
  return { productId: "p-x", action: "update", baljuoraId: "bj-x", templateId: null, code: "EXT-1", name: "사과 5kg", supplierName: "봄날농원", fields, values: { name: "사과 5kg", supplyPrice: 26000, groupPrice: 26000, consumerPrice: null, purchaseCost: null, categoryId: null, imageUrl: null, isTaxable: false, extra } };
}

describe("상품 정보 칸(1.9.0)", () => {
  it("읽기: 응답에 있는 칸만 읽고, 인증은 '인증 있음'일 때 인증 종류, 발주상품명 칸 이름을 기억합니다", () => {
    const fake = createExtrasFake();
    const snapshot = internals.normalizeProduct(fake.product, {});
    expect(snapshot.extra).toMatchObject({ originText: "국내산", barcode: "880111", purchaseQuantity: 1, purchaseDeadline: "09:30:00", courier: "CJ대한통운", tradeType: null, purchaseName: null, purchaseNameKey: "purchaseProductName", certificationKinds: ["gap", "haccp"], taxonomyItemId: "tx-1", taxonomyName: "사과" });
    expect(internals.extractExtra({ certificationStatus: "NOT_SUBJECT", certifications: [{ kind: "gap" }] })).toEqual({ certificationKinds: [] });
    expect(internals.extractExtra({ contentAmount: "0.50", contentAmountBasis: "each", purchaseName: "배" })).toEqual({ contentAmount: 0.5, contentBasis: "each", purchaseName: "배", purchaseNameKey: "purchaseName" });
    expect(internals.extractExtra({ name: "칸 없음" })).toBeUndefined();
    expect(internals.extraBodyFor("summary", { description: "한 줄" }, {})).toEqual({ description: "한 줄" });
    expect(internals.extraBodyFor("purchaseName", { purchaseName: "배" }, { purchaseName: null })).toEqual({ purchaseName: "배" });
    expect(internals.extraBodyFor("purchaseQuantity", { purchaseQuantity: null }, {})).toEqual({ purchaseQuantity: 1 });
    expect(internals.extraBodyFor("certification", { }, {})).toBeNull();
    expect(internals.sameExtraValue("5.00", 5)).toBe(true);
    expect(internals.sameExtraValue(null, "")).toBe(true);
    expect(internals.sameExtraValue("09:30:00", "09:30")).toBe(true);
    expect(internals.sameExtraValue("2026-11-01T00:00:00.000Z", "2026-11-01")).toBe(true);
    expect(internals.sameExtraValue("국내산", "국내산 경북")).toBe(false);
  });

  it("보내기: 바뀐 칸만 PUT products/:id 한 번으로 보내고, 이미 같은 칸(원산지)은 보내지 않고 반영됨", async () => {
    const fake = createExtrasFake();
    const report = createReport();
    await internals.createRunner({ fetch: fake.fetch, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" })
      .runPush({ type: "push", groupKeyword: "황금농부", groupId: null, items: [extrasItem(["soldOut", "origin", "barcode", "content", "purchaseName", "shippingUnit", "summary"])] }, report, "ABCDE23456");
    const puts = fake.calls.filter((call) => call.method === "PUT");
    expect(puts).toEqual([{ method: "PUT", path: "products/bj-x", body: { isSoldOut: true, barcode: "880222", contentAmount: 5, contentUnit: "kg", contentCount: 18, contentAmountBasis: "total", purchaseProductName: "부사 5kg", shippingUnitType: "box", shippingUnitValue: 1, description: "아삭한 부사" } }]);
    const [result] = report.posted[0].items;
    expect(result.ok).toBe(true);
    expect(result.applied.sort()).toEqual(["barcode", "content", "origin", "purchaseName", "shippingUnit", "soldOut", "summary"]);
    expect(result.snapshot).toMatchObject({ isSoldOut: true, extra: { barcode: "880222", purchaseName: "부사 5kg", description: "아삭한 부사" } });
  });

  it("판매 상태를 PUT products/:id 가 받지 않으면 PUT products/:id/status 로 보내고, 거절된 칸(택배사)만 따로 찾아 알려 줍니다", async () => {
    const fake = createExtrasFake({ putAllowed: ["barcode", "courier", "description"], badCourier: true });
    const report = createReport();
    await internals.createRunner({ fetch: fake.fetch, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" })
      .runPush({ type: "push", groupKeyword: "황금농부", groupId: null, items: [extrasItem(["soldOut", "visible", "barcode", "courier"], { ...EXTRA_VALUES, isVisible: false })] }, report, "ABCDE23456");
    const status = fake.calls.find((call) => call.path === "products/bj-x/status");
    expect(status?.body).toEqual({ isSoldOut: true, isVisible: false });
    expect(fake.product).toMatchObject({ isSoldOut: true, isVisible: false, barcode: "880222", courier: "CJ대한통운" });
    const [result] = report.posted[0].items;
    expect(result.applied.sort()).toEqual(["barcode", "soldOut", "visible"]);
    expect(result.skipped).toEqual([{ field: "courier", reason: expect.stringContaining("courier must be one of") }]);
  });

  it("신규 등록: 상품마다 다른 칸은 복사한 상품 값을 지우고 DB센터 값으로, 택배사·발주마감 등은 DB센터 값이 없으면 복사한 상품 값 그대로", () => {
    const template = { id: "bj-t", code: "T-1", name: "복사용", supplyPrice: 1000, isVisible: true, isSoldOut: false, isTaxable: false, supplier: { id: "sup-1" }, managementCode: "OLD-M", barcode: "OLD-B", originText: "수입산 중국", description: "복사용 설명", contentAmount: 3, contentUnit: "kg", purchaseProductName: "복사용 발주명", purchaseQuantity: 2, courier: "한진택배", purchaseDeadline: "11:00", shippingLocation: "경기 이천", taxonomyItemId: "tx-old" };
    const item = { ...extrasItem(["name", "supplyPrice", "soldOut", "visible", "taxable", "barcode", "tradeType"], { isSoldOut: false, isVisible: false, isTaxable: true, barcode: "NEW-B", tradeType: null }), action: "create", baljuoraId: null, templateId: "bj-t" };
    const body = internals.buildCreateBody(template, item);
    expect(body).toMatchObject({ name: "사과 5kg", barcode: "NEW-B", isVisible: false, isSoldOut: false, isTaxable: true, tradeType: null, courier: "한진택배", purchaseDeadline: "11:00", shippingLocation: "경기 이천", supplierId: "sup-1" });
    ["managementCode", "originText", "description", "contentAmount", "contentUnit", "purchaseProductName", "purchaseQuantity", "taxonomyItemId"].forEach((key) => expect(body).not.toHaveProperty(key));
  });
});

describe("상품 정보 칸 신규 등록(1.9.0)", () => {
  it("등록 때 발주오라가 조용히 버린 칸(원산지)·받지 않은 판매 상태만 등록 뒤 다시 보냅니다", async () => {
    const products: Record<string, any> = {
      "bj-t": { id: "bj-t", code: "T-1", name: "복사용", supplyPrice: 1000, imageUrls: [], prices: [], isVisible: true, isSoldOut: false, isTaxable: false, supplier: { id: "sup-1", name: "봄날농원" }, originText: "수입산", barcode: "OLD", courier: "한진택배" }
    };
    const calls: Array<{ method: string; path: string; body?: any }> = [];
    const fetch = async (input: string, init: RequestInit = {}) => {
      const method = (init.method || "GET").toUpperCase();
      const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
      const url = new URL(input);
      if (url.pathname === "/api/auth/refresh") return jsonResponse(200, { accessToken: "t1" });
      const path = url.pathname.replace(/^\//, "");
      calls.push({ method, path, body });
      if (method === "GET" && path === "products") return jsonResponse(200, { statusCode: 200, data: { items: [{ id: "bj-t", code: "T-1", name: "복사용", supplier: { name: "봄날농원" } }], meta: { hasNext: false } } });
      if (method === "GET" && path.startsWith("products/")) {
        const product = products[path.slice("products/".length)];
        return product ? jsonResponse(200, { statusCode: 200, data: product }) : jsonResponse(404, { statusCode: 404, message: "Not Found" });
      }
      if (method === "POST" && path === "products") {
        // 등록 화면 DTO: isSoldOut은 받지 않음(400), originText는 오류 없이 버림
        if ("isSoldOut" in body) return jsonResponse(400, { statusCode: 400, message: ["property isSoldOut should not exist"] });
        const created = { ...body, id: "bj-n", code: body.code, imageUrls: [], prices: [], isSoldOut: false, originText: null, supplier: { id: body.supplierId, name: "봄날농원" } };
        products["bj-n"] = created;
        return jsonResponse(201, { statusCode: 201, data: created });
      }
      if (method === "PUT" && path === "products/bj-n") {
        if ("isSoldOut" in body) return jsonResponse(400, { statusCode: 400, message: ["property isSoldOut should not exist"] });
        Object.assign(products["bj-n"], body);
        return jsonResponse(200, { statusCode: 200, data: { id: "bj-n" } });
      }
      if (method === "PUT" && path === "products/bj-n/status") {
        Object.assign(products["bj-n"], body);
        return jsonResponse(200, { statusCode: 200, data: { id: "bj-n" } });
      }
      return jsonResponse(404, { message: `not found ${input}` });
    };
    const report = createReport();
    const item = { productId: "p-n", action: "create", baljuoraId: null, templateId: "bj-t", templateMatch: "supplier", code: "NEW-1", name: "새 사과", supplierName: "봄날농원", fields: ["name", "supplyPrice", "soldOut", "visible", "origin", "barcode"], values: { name: "새 사과", supplyPrice: 20000, groupPrice: 20000, consumerPrice: null, purchaseCost: null, categoryId: null, imageUrl: null, isTaxable: false, extra: { isSoldOut: true, isVisible: true, isTaxable: false, originText: "국내산 경북", barcode: "880999", tradeType: null } } };
    await internals.createRunner({ fetch, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" }).runPush({ type: "push", groupKeyword: "황금농부", groupId: null, items: [item] }, report, "ABCDE23456");
    const create = calls.find((call) => call.method === "POST" && call.path === "products");
    expect(create?.body).toMatchObject({ name: "새 사과", originText: "국내산 경북", barcode: "880999", isVisible: true, courier: "한진택배" });
    expect(calls.filter((call) => call.method === "PUT").map((call) => [call.path, call.body])).toEqual([
      ["products/bj-n", { isSoldOut: true, originText: "국내산 경북" }],
      ["products/bj-n", { originText: "국내산 경북" }],
      ["products/bj-n/status", { isSoldOut: true }]
    ]);
    const [result] = report.posted[0].items;
    expect(result).toMatchObject({ ok: true, baljuoraId: "bj-n" });
    expect(result.applied.sort()).toEqual(["barcode", "name", "origin", "soldOut", "supplyPrice", "visible"]);
    expect(products["bj-n"]).toMatchObject({ isSoldOut: true, originText: "국내산 경북", barcode: "880999" });
  });
});

// ─── 운영 홈 주문 동기화 · 상품 동기화(1.10.0, 2026-11-27) ─────────────────────────
describe("운영 홈 주문 동기화: 발주오라 매입처 읽기(1.10.0)", () => {
  const step = { start: "2026-11-01", end: "2026-11-27", buyers: true, knownTax: ["bj-a", "bj-b", "bj-c"], suppliers: true };

  it("매출처 다음에 매입처 목록을 읽어 이름·사업자 정보만 보내고(계좌·비밀번호 없음), 쓰지 않는 매입처는 표시합니다", async () => {
    const fake = createSalesFake({ suppliers: [
      { id: "sup-1", companyName: "봄날농원", representativeName: "김농부", businessNumber: "123-45-67890", phone: "010-1234-5678", email: "spring@example.com", address: "경북 청도군", addressDetail: "1번지", status: "ACTIVE", bankAccount: { accountNumber: "111-222" }, password: "secret" },
      { id: "sup-2", name: "바다수산", isActive: false }
    ] });
    const report = createReport();
    const result = await salesRunner(fake).runSales(step, report, { final: true });
    expect(result).toMatchObject({ suppliers: 2, complete: true });
    const sent = report.posted.filter((body) => body.suppliers).flatMap((body) => body.suppliers);
    expect(sent).toEqual([
      { id: "sup-1", name: "봄날농원", representativeName: "김농부", businessNumber: "123-45-67890", phone: "010-1234-5678", email: "spring@example.com", address: "경북 청도군 1번지", isActive: true },
      { id: "sup-2", name: "바다수산", representativeName: null, businessNumber: null, phone: null, email: null, address: null, isActive: false }
    ]);
    expect(JSON.stringify(sent)).not.toMatch(/bankAccount|accountNumber|password|secret/);
    const kinds = report.posted.map((body) => body.buyers ? "buyers" : body.suppliers ? "suppliers" : body.salesLines ? "lines" : body.salesDone ? "done" : "other");
    expect(kinds).toEqual(["buyers", "suppliers", "lines", "done"]);
    expect(report.posted[report.posted.length - 1].diagnostics.extra.sales.suppliers).toBe(2);
  });

  it("매입처 목록을 읽지 못해도 멈추지 않고 까닭을 보낸 뒤 주문을 읽습니다", async () => {
    const fake = createSalesFake({ suppliers: "fail" });
    const report = createReport();
    const result = await salesRunner(fake).runSales(step, report, { final: true });
    expect(result).toMatchObject({ suppliers: 0, lines: 5, complete: true });
    expect(report.posted.find((body) => body.supplierError)?.supplierError).toContain("404");
    expect(report.logs.some((text) => text.includes("매입처 목록을 읽지 못했습니다"))).toBe(true);
  });
});

describe("운영 홈 상품 동기화: 읽기가 끝나면 같은 창에서 보내기로 이어 갑니다(1.10.0)", () => {
  function opsWindow(next: unknown) {
    const fake = createFake();
    const posted: Record<string, any[]> = {};
    const calls: string[] = [];
    const fetch = async (input: string, init: RequestInit = {}) => {
      const url = new URL(input);
      if (url.origin === "https://doogofood.test" && url.pathname.startsWith("/api/baljuora/runner/")) {
        const [code, action] = url.pathname.slice("/api/baljuora/runner/".length).split("/");
        calls.push(`${(init.method || "GET").toUpperCase()} ${code}${action ? `/${action}` : ""}`);
        if (!action) {
          return jsonResponse(200, { ok: true, data: code === "OPSREAD001"
            ? { jobId: "job-read", type: "compare", plan: { type: "compare", groupKeyword: "황금농부", detailIds: [], sales: null, ops: "products" } }
            : { jobId: "job-send", type: "push", plan: { type: "push", groupKeyword: "황금농부", groupId: "grp-1", items: [pushItem({ productId: "p-1", fields: ["supplyPrice"] })], ops: "products", compareJobId: "job-read" } } });
        }
        if (action === "progress") return jsonResponse(200, { ok: true, data: { ok: true } });
        if (action === "results") {
          (posted[code] ??= []).push(JSON.parse(String(init.body)));
          return jsonResponse(200, { ok: true, data: { ok: true } });
        }
        if (action === "next") return jsonResponse(200, { ok: true, data: next });
      }
      return fake.fetch(input, init);
    };
    const win: any = {
      location: { hostname: "console.baljuora.com", origin: "https://console.baljuora.com", pathname: "/doogofood/dashboard", search: "", hash: "#doogo-sync=OPSREAD001" },
      document,
      navigator: {},
      sessionStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
      history: { replaceState: () => undefined },
      alert: () => undefined,
      fetch,
      __doogoSyncOrigin: "https://doogofood.test",
      __doogoSyncApiBase: "https://api.baljuora.com/"
    };
    return { win, fake, posted, calls };
  }

  it("비교 결과를 보낸 뒤 /next로 받은 보내기 작업 코드로 바로 보냅니다(책갈피를 다시 누르지 않음)", async () => {
    const { win, fake, posted, calls } = opsWindow({ next: { code: "OPSSEND02", type: "push", total: 1 }, planned: { updates: 1 }, message: null });
    await internals.main(win);
    expect(calls.filter((call) => !call.endsWith("/progress"))).toEqual(expect.arrayContaining(["GET OPSREAD001", "POST OPSREAD001/results", "POST OPSREAD001/next", "GET OPSSEND02", "POST OPSSEND02/results"]));
    expect(calls.indexOf("POST OPSREAD001/next")).toBeLessThan(calls.indexOf("GET OPSSEND02"));
    // 읽기 결과는 비교 작업에, 보내기 결과는 보내기 작업에
    expect(posted.OPSREAD001.some((body) => Array.isArray(body.snapshots) && body.snapshots.length > 0)).toBe(true);
    expect(posted.OPSREAD001.some((body) => body.final === true)).toBe(true);
    const sent = posted.OPSSEND02.flatMap((body) => Array.isArray(body.items) ? body.items : []);
    expect(sent).toEqual([expect.objectContaining({ productId: "p-1", ok: true, applied: ["supplyPrice"] })]);
    expect(posted.OPSSEND02.some((body) => body.final === true)).toBe(true);
    expect(fake.products["bj-a"].supplyPrice).toBe(27000);
    expect(document.getElementById("doogo-sync-panel")?.textContent).toContain("성공 1개");
  });

  it("보낼 변경이 없으면 보내지 않고 그 안내로 끝냅니다", async () => {
    const { win, fake, posted, calls } = opsWindow({ next: null, planned: { updates: 0 }, message: "보낼 변경이 없어요. DB센터 상품과 발주오라 상품이 같습니다." });
    await internals.main(win);
    expect(calls).toContain("POST OPSREAD001/next");
    expect(calls.some((call) => call.startsWith("GET OPSSEND"))).toBe(false);
    expect(posted.OPSSEND02).toBeUndefined();
    expect(fake.calls.some((call) => call.method === "PUT")).toBe(false);
    expect(document.getElementById("doogo-sync-panel")?.textContent).toContain("보낼 변경이 없어요");
  });
});
