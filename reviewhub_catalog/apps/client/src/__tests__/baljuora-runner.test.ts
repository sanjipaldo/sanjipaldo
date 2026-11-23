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

function createFake(options: { pricingAllowed?: string[]; validToken?: string } = {}) {
  const products: Record<string, any> = {
    "bj-a": {
      id: "bj-a", code: "BJT-001", name: "봄날 사과 5kg", supplyPrice: 26000, consumerPrice: 39000, purchaseCost: 20000,
      categoryId: "bj-cat-fruit", imageUrls: ["https://files.baljuora.com/a.jpg", "https://files.baljuora.com/a-2.jpg"],
      sellerGroupPrices: [{ id: "row-1", sellerGroup: { ...GROUP }, supplyPrice: 24000 }],
      supplier: { id: "sup-1", name: "봄날농원" }, shippingPolicy: { id: "ship-1", name: "무료" }, isVisible: true, isSoldOut: false, isTaxable: false,
      createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z"
    },
    "bj-b": { id: "bj-b", code: "BJT-002", name: "봄날 배", supplyPrice: 38000, consumerPrice: null, purchaseCost: 30000, categoryId: "bj-cat-farm", imageUrls: [], sellerGroupPrices: [], supplier: { id: "sup-1", name: "봄날농원" }, isVisible: true, isSoldOut: false }
  };
  const calls: Array<{ method: string; url: string; body?: any }> = [];
  const state = { refreshCount: 0, validToken: options.validToken ?? "t1" };
  const pricingAllowed = options.pricingAllowed ?? ["supplyPrice", "consumerPrice", "purchaseCost", "sellerGroupPrices"];
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
        if (body.sellerGroupPrices) {
          product.sellerGroupPrices = body.sellerGroupPrices.map((row: any) => ({ supplyPrice: row.supplyPrice, sellerGroup: { id: row.sellerGroupId, name: row.sellerGroupId === GROUP.id ? GROUP.name : "기타" } }));
          delete product.sellerGroupPricesInput;
        }
        return jsonResponse(200, { statusCode: 200, data: product });
      }
      if (method === "POST" && path === "files/presign") return jsonResponse(200, { statusCode: 200, data: { uploadUrl: "https://s3.example.com/upload?sig=1", fileUrl: "https://files.baljuora.com/product-image/new.jpg" } });
      if (method === "POST" && path === "products") {
        if (!body.supplierId) return jsonResponse(400, { statusCode: 400, message: ["supplierId should not be empty"] });
        const created = { ...body, id: "bj-new", code: body.code || "PD999", imageUrls: [], sellerGroupPrices: [], supplier: { id: body.supplierId, name: "봄날농원" } };
        delete created.supplierId;
        products[created.id] = created;
        return jsonResponse(201, { statusCode: 201, data: created });
      }
    }
    if (url.origin === "https://s3.example.com") return new Response("", { status: 200 });
    if (url.origin === "https://doogofood.test") return new Response("image-bytes", { status: 200, headers: { "Content-Type": "image/jpeg" } });
    return jsonResponse(404, { message: `not found ${input}` });
  };
  return { fetch, products, calls, state };
}

function runnerFor(fake: ReturnType<typeof createFake>) {
  return internals.createRunner({ fetch: fake.fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
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

  it("그룹 공급가 보낼 값: 읽기 전용 칸을 빼고 매출처 그룹은 id로 보냅니다", () => {
    const fake = createFake();
    expect(internals.buildGroupPricing(fake.products["bj-a"], GROUP, "황금농부", 25000)).toEqual({ key: "sellerGroupPrices", value: [{ sellerGroupId: "grp-1", supplyPrice: 25000 }] });
    expect(internals.buildGroupPricing(fake.products["bj-b"], GROUP, "황금농부", 33000)).toEqual({ key: "sellerGroupPrices", value: [{ sellerGroupId: "grp-1", supplyPrice: 33000 }] });
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
    expect(result).toEqual({ received: 3, products: 2 });
    expect(fake.calls.some((call) => call.method !== "GET" && call.url.startsWith("https://api.baljuora.com"))).toBe(false);
    const [batch] = report.posted;
    expect(batch.final).toBe(true);
    expect(batch.group).toEqual(GROUP);
    expect(batch.categories.map((category: any) => category.path)).toEqual(["🥕 농산", "🥕 농산 > 과일류"]);
    const apple = batch.snapshots.find((snapshot: any) => snapshot.id === "bj-a");
    expect(apple).toMatchObject({ code: "BJT-001", supplyPrice: 26000, groupPrice: 24000, categoryIds: ["bj-cat-fruit"] });
    expect(batch.snapshots.find((snapshot: any) => snapshot.id === "bj-bundle").kind).toBe("bundle");
    expect(batch.diagnostics.structure.productList.supplyPrice).toBe("number");
    expect(batch.diagnostics.structure.productDetail.sellerGroupPrices[0]).toBe("array");
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
    Object.values(fake.products).forEach((product: any) => { delete product.sellerGroupPrices; });
    const page = "static/chunks/app/console/%5Bmerchant%5D/(default)/products/%5Bid%5D/page-abc.js";
    const form = "static/chunks/6327-form.js";
    const consoleCalls: string[] = [];
    const fetch = async (input: string, init: RequestInit = {}) => {
      const url = new URL(input);
      if (url.origin === "https://console.baljuora.com" && url.pathname !== "/api/auth/refresh") {
        consoleCalls.push(`${url.pathname}${(init.headers as Record<string, string> | undefined)?.RSC ? " (RSC)" : ""}`);
        if (url.pathname === "/doogobiz24/products/bj-a") return new Response(`1:I[1,["static/chunks/1111-aa.js","${form}","${page}"],"default"]`, { status: 200, headers: { "Content-Type": "text/x-component" } });
        if (url.pathname === `/_next/${page}`) return new Response("t=1;", { status: 200 });
        if (url.pathname === `/_next/${form}`) return new Response('t=1;label:"개별공급가",onSubmit:()=>m.mutate({id:i,data:{prices:[{targetType:"SELLER_GROUP",targetId:g,supplyPrice:p}]}})', { status: 200 });
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
    expect(discovery.snippets[0].text).toContain("prices");
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
});

// 실제 발주오라처럼: 상세는 include를 줘야 개별공급가(prices)·매입처(productSuppliers)가 옵니다(2026-11-23 운영 확인).
function createIncludeFake(options: { pricingAllowed?: string[]; rowAllowed?: string[] } = {}) {
  const product: any = {
    id: "bj-y", code: "ass00050", name: "[본] 대왕 수제약과 [9입] 450g", supplyPrice: 6900, consumerPrice: null, imageUrls: [], categoryIds: [], categories: [],
    productSuppliers: [{ id: "ps-1", supplier: { id: "sup-k", name: "캄므커머스" }, purchasePrice: 5700, isDefault: true, purchaseShippingPolicy: { id: "pship-1", name: "수제약과" } }],
    prices: [
      { id: "pr-1", targetType: "SELLER_GROUP", targetId: "grp-1", sellerGroup: { ...GROUP }, seller: null, supplyPrice: 6270, sellShippingPolicyId: null, author: { id: "u-1", name: "관리자" } },
      { id: "pr-2", targetType: "SELLER", targetId: "s-9", seller: { id: "s-9", name: "황금농부 김씨" }, sellerGroup: null, supplyPrice: 6000, sellShippingPolicyId: null }
    ],
    visibility: []
  };
  const calls: Array<{ method: string; url: string; body?: any }> = [];
  const allowed = options.pricingAllowed ?? ["supplyPrice", "consumerPrice", "purchaseCost", "prices"];
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
    if (method === "GET" && path === "products") return jsonResponse(200, { data: { items: [view(false)], meta: { page: 1, totalPages: 1, hasNext: false } } });
    if (method === "GET" && path === "products/bj-y") return jsonResponse(200, { data: view(String(url.searchParams.get("include") || "").split(",").includes("prices")) });
    if (method === "PUT" && path === "products/bj-y/pricing") {
      const extra = Object.keys(body).filter((key) => !allowed.includes(key));
      if (extra.length) return jsonResponse(400, { message: extra.map((key) => `property ${key} should not exist`) });
      const rowAllowed = options.rowAllowed ?? ["targetType", "targetId", "sellerGroupId", "sellerId", "supplyPrice", "sellShippingPolicyId"];
      const rowErrors = (body.prices || []).flatMap((row: any, index: number) => Object.keys(row).filter((key) => !rowAllowed.includes(key)).map((key) => `prices.${index}.property ${key} should not exist`));
      if (rowErrors.length) return jsonResponse(400, { message: rowErrors });
      if (body.supplyPrice !== undefined) product.supplyPrice = body.supplyPrice;
      if (body.prices) product.prices = body.prices.map((row: any, index: number) => ({ id: `pr-new-${index}`, ...row, sellerGroup: row.targetType === "SELLER_GROUP" ? { ...GROUP } : null }));
      return jsonResponse(200, { data: view(true) });
    }
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

  it("수강생 단가를 보내면 개별공급가 목록에서 황금농부 줄만 바꾸고(다른 매출처 줄은 그대로), 다시 읽어 저장된 값을 확인합니다", async () => {
    const fake = createIncludeFake();
    const runner = internals.createRunner({ fetch: fake.fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const result = await runner.pushItem(pushItem({ baljuoraId: "bj-y", code: "ass00050", name: "[본] 대왕 수제약과 [9입] 450g", fields: ["groupPrice"], values: { name: "[본] 대왕 수제약과 [9입] 450g", supplyPrice: 6900, groupPrice: 6300, consumerPrice: null, purchaseCost: 5700, categoryId: null, imageUrl: null, isTaxable: false } }), { groupKeyword: "황금농부" }, { group: GROUP, groupKeyword: "황금농부" }, "CODE");
    expect(result.ok).toBe(true);
    expect(result.applied).toEqual(["groupPrice"]);
    const put = fake.calls.find((call) => call.method === "PUT");
    // 개별공급가 줄의 id·작성자 같은 읽기 전용 칸은 빼고, 연결 칸(…Id)은 비어 있어도 그대로 둡니다(배송정책 지정 없음 유지).
    expect(put?.body.prices).toEqual([
      { targetType: "SELLER_GROUP", targetId: "grp-1", sellerGroupId: "grp-1", supplyPrice: 6300, sellShippingPolicyId: null },
      { targetType: "SELLER", targetId: "s-9", sellerId: "s-9", supplyPrice: 6000, sellShippingPolicyId: null }
    ]);
    expect(fake.product.prices.find((row: any) => row.targetType === "SELLER").supplyPrice).toBe(6000);
    expect(result.snapshot.groupPrice).toBe(6300);
  });

  it("개별공급가 줄 안쪽 칸을 거절하면(prices.0.property … should not exist) 그 칸만 빼고 다시 보내 저장합니다", async () => {
    const fake = createIncludeFake({ rowAllowed: ["targetType", "targetId", "sellerGroupId", "sellerId", "supplyPrice"] });
    const runner = internals.createRunner({ fetch: fake.fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const result = await runner.pushItem(pushItem({ baljuoraId: "bj-y", code: "ass00050", fields: ["supplyPrice", "groupPrice"], values: { name: "약과", supplyPrice: 6900, groupPrice: 6300, consumerPrice: null, purchaseCost: 5700, categoryId: null, imageUrl: null, isTaxable: false } }), { groupKeyword: "황금농부" }, { group: GROUP, groupKeyword: "황금농부" }, "CODE");
    expect(result.applied).toEqual(["supplyPrice", "groupPrice"]);
    const puts = fake.calls.filter((call) => call.method === "PUT");
    expect(puts).toHaveLength(2);
    expect(puts[1].body.prices.every((row: any) => !("sellShippingPolicyId" in row))).toBe(true);
    expect(result.snapshot.groupPrice).toBe(6300);
  });

  it("발주오라가 가격 저장에서 개별공급가를 받지 않으면 수강생 단가는 '받지 않음'으로 알리고 공급가는 그대로 보냅니다", async () => {
    const fake = createIncludeFake({ pricingAllowed: ["supplyPrice", "consumerPrice", "purchaseCost"] });
    const runner = internals.createRunner({ fetch: fake.fetch, FormData, locks: undefined, consoleOrigin: "https://console.baljuora.com", apiBase: "https://api.baljuora.com/", doogoOrigin: "https://doogofood.test" });
    const result = await runner.pushItem(pushItem({ baljuoraId: "bj-y", code: "ass00050", fields: ["supplyPrice", "groupPrice"], values: { name: "약과", supplyPrice: 7000, groupPrice: 6300, consumerPrice: null, purchaseCost: 5700, categoryId: null, imageUrl: null, isTaxable: false } }), { groupKeyword: "황금농부" }, { group: GROUP, groupKeyword: "황금농부" }, "CODE");
    expect(result.applied).toEqual(["supplyPrice"]);
    expect(result.skipped).toEqual([{ field: "groupPrice", reason: "발주오라가 이 칸을 받지 않았습니다." }]);
    expect(fake.product.supplyPrice).toBe(7000);
    expect(fake.product.prices[0].supplyPrice).toBe(6270);
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
    expect(pricing?.body).toEqual({ supplyPrice: 27000, sellerGroupPrices: [{ sellerGroupId: "grp-1", supplyPrice: 25000 }] });
    const info = fake.calls.find((call) => call.method === "PUT" && call.url.endsWith("/info"));
    // 상품 정보 저장에는 상품명(지금 값)을 항상 함께 보냅니다(발주오라는 상품명이 없으면 "상품명은 문자열이어야 합니다.").
    expect(info?.body).toEqual({ name: "봄날 사과 5kg", categoryId: "bj-cat-farm", imageUrls: ["https://files.baljuora.com/product-image/new.jpg", "https://files.baljuora.com/a-2.jpg"] });
    expect(fake.calls.some((call) => call.url === "https://doogofood.test/api/baljuora/runner/ABCDE23456/image/p-1")).toBe(true);
    expect(fake.calls.some((call) => call.method === "PUT" && call.url.startsWith("https://s3.example.com/upload"))).toBe(true);
    const [result] = report.posted[0].items;
    expect(result).toMatchObject({ productId: "p-1", ok: true, applied: ["supplyPrice", "groupPrice", "category", "image"], skipped: [] });
    expect(result.snapshot).toMatchObject({ supplyPrice: 27000, groupPrice: 25000, categoryIds: ["bj-cat-farm"] });
    expect(report.posted[0].final).toBe(true);
  });

  it("발주오라가 받지 않는 칸은 빼고 다시 보내고, 그 칸은 '받지 않음'으로 알려 줍니다", async () => {
    const fake = createFake({ pricingAllowed: ["supplyPrice", "consumerPrice", "sellerGroupPrices"] });
    const runner = runnerFor(fake);
    const report = createReport();
    await runner.runPush({ type: "push", groupKeyword: "황금농부", groupId: GROUP.id, items: [pushItem({ fields: ["supplyPrice", "purchaseCost"] })] }, report, "ABCDE23456");
    const pricingCalls = fake.calls.filter((call) => call.method === "PUT" && call.url.endsWith("/pricing"));
    expect(pricingCalls.map((call) => Object.keys(call.body))).toEqual([["supplyPrice", "purchaseCost"], ["supplyPrice"]]);
    const [result] = report.posted[0].items;
    expect(result.ok).toBe(true);
    expect(result.applied).toEqual(["supplyPrice"]);
    expect(result.skipped).toEqual([{ field: "purchaseCost", reason: "발주오라가 이 칸을 받지 않았습니다." }]);
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
    expect(create?.body).not.toHaveProperty("sellerGroupPrices");
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
