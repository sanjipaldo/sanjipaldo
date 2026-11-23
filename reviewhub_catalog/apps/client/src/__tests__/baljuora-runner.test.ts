// 발주오라 동기화 책갈피 스크립트(public/baljuora-sync.js, 2026-11-22).
// 실제 발주오라 대신 가짜 API로 비교(읽기)·보내기(가격·그룹 공급가·카테고리·이미지·신규 등록) 흐름을 확인합니다.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let internals: any;

beforeAll(() => {
  // 테스트를 앱 폴더에서 돌리든 저장소 맨 위에서 돌리든 같은 파일을 찾습니다.
  const file = [resolve(process.cwd(), "public/baljuora-sync.js"), resolve(process.cwd(), "apps/client/public/baljuora-sync.js")].find((candidate) => existsSync(candidate));
  if (!file) throw new Error("public/baljuora-sync.js를 찾지 못했습니다.");
  const source = readFileSync(file, "utf8");
  (window as any).__DOOGO_SYNC_TEST__ = {};
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
  const allowed = options.allowed ?? ["sellerProductPrices", "sellShippingPolicyId", "imageUrls", "productSuppliers"];
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
  return jsonResponse(200, { statusCode: 200, data: { id: product.id } });
}

function createFake(options: { pricingAllowed?: string[]; validToken?: string; doogoImage?: { type: string; size: number }; ignoreImageUrls?: boolean } = {}) {
  const products: Record<string, any> = {
    "bj-a": {
      id: "bj-a", code: "BJT-001", name: "봄날 사과 5kg", supplyPrice: 26000, consumerPrice: 39000, purchaseCost: 20000,
      categoryId: "bj-cat-fruit", imageUrls: ["https://files.baljuora.com/a.jpg", "https://files.baljuora.com/a-2.jpg"],
      prices: [{ id: "row-1", productId: "bj-a", targetType: "group", targetId: "grp-1", shippingPolicyId: null, supplyPrice: 24000, sellerGroup: { ...GROUP } }],
      supplier: { id: "sup-1", name: "봄날농원" }, shippingPolicy: { id: "ship-1", name: "무료" }, isVisible: true, isSoldOut: false, isTaxable: false,
      createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z"
    },
    "bj-b": { id: "bj-b", code: "BJT-002", name: "봄날 배", supplyPrice: 38000, consumerPrice: null, purchaseCost: 30000, categoryId: "bj-cat-farm", imageUrls: [], prices: [], supplier: { id: "sup-1", name: "봄날농원" }, isVisible: true, isSoldOut: false }
  };
  const calls: Array<{ method: string; url: string; body?: any }> = [];
  const state = { refreshCount: 0, validToken: options.validToken ?? "t1", presigns: [] as any[], uploads: [] as Array<{ headers: Record<string, string>; size: number; type: string }> };
  const pricingAllowed = options.pricingAllowed ?? ["supplyPrice", "consumerPrice", "purchaseCost"];
  const listView = (product: any) => ({ id: product.id, targetType: "product", code: product.code, name: product.name, supplyPrice: product.supplyPrice, consumerPrice: product.consumerPrice, purchaseCost: product.purchaseCost, imageUrls: product.imageUrls, isVisible: product.isVisible, isSoldOut: product.isSoldOut });
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
      if (method === "GET" && path === "products") {
        const items: any[] = [...Object.values(products).map(listView), { id: "bj-bundle", targetType: "bundle", name: "묶음", imageUrls: [] }];
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
        const allowed = match[2] === "pricing" ? pricingAllowed : ["name", "categoryId", "imageUrls", "description"];
        const extra = Object.keys(body).filter((key) => !allowed.includes(key));
        if (extra.length) return jsonResponse(400, { statusCode: 400, message: extra.map((key) => `property ${key} should not exist`), error: "Bad Request" });
        const product = products[match[1]];
        Object.assign(product, body);
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
        const created = { ...body, id: "bj-new", code: body.code || "PD999", imageUrls: [], prices: [], supplier: { id: body.supplierId, name: "봄날농원" } };
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
    expect(batch.snapshots.find((snapshot: any) => snapshot.id === "bj-bundle").kind).toBe("bundle");
    expect(batch.diagnostics.structure.productList.supplyPrice).toBe("number");
    expect(batch.diagnostics.structure.productDetail.prices[0]).toBe("array");
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
      Object.assign(fake.product, body);
      return jsonResponse(200, { data: { id: "bj-y" } });
    }
    return fake.fetch(input, init);
  };
  return { fetch, infoCalls };
}

describe("상품 정보(상품명·카테고리·이미지) 저장 — 2026-11-23 운영 오류", () => {
  it("카테고리만 바꿔도 상품명과 지금 이미지를 함께 보내 '상품명은 문자열이어야 합니다' 오류 없이 저장합니다", async () => {
    const fake = createIncludeFake();
    fake.product.categoryIds = ["bj-cat-old"];
    fake.product.imageUrls = ["https://files.baljuora.com/yakgwa.jpg"];
    const wrapped = withInfoEndpoint(fake);
    const runner = internals.createRunner({ fetch: wrapped.fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const result = await runner.pushItem(pushItem({ baljuoraId: "bj-y", code: "ass00050", fields: ["supplyPrice", "purchaseCost", "category"], values: { name: "[본] 대왕 수제약과 [9입] 450g", supplyPrice: 7000, groupPrice: 6400, consumerPrice: null, purchaseCost: 5700, categoryId: "bj-cat-food", imageUrl: null, isTaxable: false } }), { groupKeyword: "황금농부" }, { group: GROUP, groupKeyword: "황금농부" }, "CODE");
    expect(wrapped.infoCalls[0]).toEqual({ name: "[본] 대왕 수제약과 [9입] 450g", categoryIds: ["bj-cat-food"], imageUrls: ["https://files.baljuora.com/yakgwa.jpg"] });
    expect(result.ok).toBe(true);
    expect(result.applied).toEqual(["supplyPrice", "purchaseCost", "category"]);
    expect(fake.product.imageUrls).toEqual(["https://files.baljuora.com/yakgwa.jpg"]); // 이미지는 그대로
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
    const wrapped = withInfoEndpoint(fake, { failInfo: "카테고리를 확인해 주세요." });
    const runner = internals.createRunner({ fetch: wrapped.fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const result = await runner.pushItem(pushItem({ baljuoraId: "bj-y", code: "ass00050", fields: ["supplyPrice", "category"], values: { name: "약과", supplyPrice: 7000, groupPrice: 6270, consumerPrice: null, purchaseCost: 5700, categoryId: "bj-cat-food", imageUrl: null, isTaxable: false } }), { groupKeyword: "황금농부" }, { group: GROUP, groupKeyword: "황금농부" }, "CODE");
    expect(result.ok).toBe(true);
    expect(result.applied).toEqual(["supplyPrice"]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].field).toBe("category");
    expect(result.skipped[0].reason).toContain("카테고리를 확인해 주세요.");
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
      Object.assign(product, body);
      return jsonResponse(200, { data: product });
    }
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
    const runner = runnerFor(fake);
    const report = createReport();
    const summary = await runner.runPush({ type: "push", groupKeyword: "황금농부", groupId: GROUP.id, items: [pushItem({ fields: ["supplyPrice", "groupPrice", "category", "image"] })] }, report, "ABCDE23456");
    expect(summary).toEqual({ ok: 1, failed: 0 });
    const pricing = fake.calls.find((call) => call.method === "PUT" && call.url.endsWith("/pricing"));
    expect(pricing?.body).toEqual({ supplyPrice: 27000 });
    const update = fake.calls.find((call) => call.method === "PUT" && call.url === "https://api.baljuora.com/products/bj-a");
    expect(update?.body).toEqual({ sellerProductPrices: [{ targetType: "group", targetId: "grp-1", supplyPrice: 25000 }] });
    const info = fake.calls.find((call) => call.method === "PUT" && call.url.endsWith("/info"));
    // 상품 정보 저장에는 상품명(지금 값)을 항상 함께 보냅니다(발주오라는 상품명이 없으면 "상품명은 문자열이어야 합니다.").
    // 이미지는 지금 값 그대로(썸네일은 뒤에서 따로 저장하므로 여기서 되돌리지 않음).
    expect(info?.body).toEqual({ name: "봄날 사과 5kg", categoryId: "bj-cat-farm", imageUrls: ["https://files.baljuora.com/a.jpg", "https://files.baljuora.com/a-2.jpg"] });
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
    expect(create?.body).toMatchObject({ code: "BJT-010", name: "새 사과 10kg", supplyPrice: 50000, consumerPrice: null, purchaseCost: 40000, supplierId: "sup-1", shippingPolicyId: "ship-1", categoryId: "bj-cat-fruit", isVisible: true, isTaxable: false });
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
    await runnerFor(fake).runPush({ type: "push", groupKeyword: "황금농부", groupId: null, items: [pushItem({ action: "create", baljuoraId: null, templateId: null, code: "BJT-NEW" })] }, report, "ABCDE23456");
    const [result] = report.posted[0].items;
    expect(result.ok).toBe(false);
    expect(result.error).toContain("설정 복사용 상품코드");
    expect(fake.calls.some((call) => call.method === "POST" && call.url === "https://api.baljuora.com/products")).toBe(false);
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
function createSalesFake(options: { rejectRangeType?: boolean; failOrdersAtCursor?: string } = {}) {
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
    return jsonResponse(404, { message: `not found ${input}` });
  };
  return { fetch, calls, sellers, orderItems };
}

function salesRunner(fake: ReturnType<typeof createSalesFake>) {
  return internals.createRunner({ fetch: fake.fetch, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
}

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
    expect(result).toEqual({ lines: 5, buyers: 2, complete: true, error: null });
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
});
