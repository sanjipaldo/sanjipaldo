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
    expect(info?.body).toEqual({ categoryId: "bj-cat-farm", imageUrls: ["https://files.baljuora.com/product-image/new.jpg", "https://files.baljuora.com/a-2.jpg"] });
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
