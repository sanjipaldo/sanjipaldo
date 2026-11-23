// 발주오라 ↔ DB센터 양방향 맞추기(2026-11-23 관리자 요청): 발주오라 기준으로 DB센터 맞추기(가격·썸네일·카테고리·배송비 정책),
// 발주오라에서 바꾼 썸네일 감지, 배송비 정책 연결·가져오기, 카테고리 여러 개 → 하나 연결과 새로 만들기.
// 발주오라 쪽은 책갈피가 보내는 결과 JSON으로 흉내 냅니다(실제 발주오라에 접속하지 않음).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  baljuoraPolicyRate,
  diffBaljuoraProduct,
  doogoCategoryForBaljuora,
  doogoSyncValues,
  flattenBaljuoraCategories,
  suggestShippingPolicyMapping,
  unconnectedBaljuoraCategories,
  type BaljuoraProductSnapshot,
  type BaljuoraShippingPolicy
} from "@repo/shared/baljuora-sync";

process.env.SKYBASE_DB_ENDPOINT = `file:${join(mkdtempSync(join(tmpdir(), "baljuora-align-")), "test.db")}`;
const { default: app } = await import("../_core/create-app");
const { executeSql } = await import("../_core/db");
const { applyMigrations, fetchWithAuth, resetDatabase, signUpAndGetToken } = await import("../_test/helpers");

const TREE = [
  { id: "bj-farm", name: "🥕 농산", children: [{ id: "bj-fruit", name: "과일류", children: [] }] },
  { id: "bj-mush", name: "🍄 버섯", children: [] },
  { id: "bj-sea", name: "🐟 수산", children: [] },
  { id: "bj-special", name: "🎀 특별선물", children: [] }
];
const CATEGORIES = flattenBaljuoraCategories(TREE);

function policy(partial: Partial<BaljuoraShippingPolicy> & { id: string }): BaljuoraShippingPolicy {
  return { code: null, name: "", type: "fixed", fixedFee: 0, isConditionRepeat: false, isSameOrderFree: false, isJejuAndRemoteAdditionalFee: false, jejuAdditionalFee: 0, remoteAdditionalFee: 0, rules: [], ...partial };
}

const BJ_POLICIES = [
  policy({ id: "bj-pol-1", code: "SP100", name: "택배 3000", type: "fixed", fixedFee: 3000 }),
  policy({ id: "bj-pol-2", code: "SP200", name: "조건부무료", type: "byPrice", rules: [{ startRange: 0, endRange: 30000, fee: 3000, unitType: null }, { startRange: 30000, endRange: null, fee: 0, unitType: null }], isJejuAndRemoteAdditionalFee: true, jejuAdditionalFee: 3000, remoteAdditionalFee: 5000 })
];

function snapshot(partial: Partial<BaljuoraProductSnapshot> & { id: string }): BaljuoraProductSnapshot {
  return { kind: "product", code: null, name: "", supplyPrice: null, consumerPrice: null, purchaseCost: null, imageUrls: [], isVisible: true, isSoldOut: false, updatedAt: "2026-11-23T00:00:00Z", ...partial };
}

describe("양방향 맞추기 규칙", () => {
  it("발주오라 배송비 정책 → DB센터 배송 정책 값(고정·무료·금액별 구간·제주/도서산간), 구간이 맞지 않으면 만들지 않음", () => {
    expect(baljuoraPolicyRate(BJ_POLICIES[0])).toMatchObject({ rateType: "fixed", fee: 3000, tiers: null, jejuExtraFee: 0 });
    expect(baljuoraPolicyRate(policy({ id: "x", type: "free", isSameOrderFree: true }))).toMatchObject({ rateType: "free", fee: 0, freeWholeOrder: true });
    expect(baljuoraPolicyRate(BJ_POLICIES[1])).toEqual({ rateType: "amount", fee: 0, tiers: { tiers: [{ upTo: 30000, fee: 3000 }], last: { fee: 0, repeat: false } }, unitLabel: null, freeWholeOrder: false, jejuExtraFee: 3000, islandExtraFee: 5000 });
    // 조건 반복(마지막 줄 배송비 없음)
    expect(baljuoraPolicyRate(policy({ id: "q", type: "byQuantity", isConditionRepeat: true, rules: [{ startRange: 1, endRange: 5, fee: 4000, unitType: null }, { startRange: 5, endRange: null, fee: 0, unitType: null }] }))?.tiers).toEqual({ tiers: [{ upTo: 5, fee: 4000 }], last: { fee: 0, repeat: true } });
    expect(baljuoraPolicyRate(policy({ id: "u", type: "byUnit", rules: [{ startRange: 0, endRange: 10, fee: 3000, unitType: "KG" }, { startRange: 10, endRange: null, fee: 6000, unitType: "KG" }] }))).toMatchObject({ rateType: "unit", unitLabel: "kg" });
    // 구간이 끊기거나 모르는 유형이면 null
    expect(baljuoraPolicyRate(policy({ id: "g", type: "byPrice", rules: [{ startRange: 0, endRange: 10000, fee: 3000, unitType: null }, { startRange: 20000, endRange: null, fee: 0, unitType: null }] }))).toBeNull();
    expect(baljuoraPolicyRate(policy({ id: "n", type: "byPrice", rules: [{ startRange: 0, endRange: null, fee: 3000, unitType: null }] }))).toBeNull();
    expect(baljuoraPolicyRate(policy({ id: "z", type: "weird" }))).toBeNull();
  });

  it("배송비 정책 자동 연결: 배송비 코드가 같으면 먼저, 아니면 이름(이모지·띄어쓰기 무시). 목록에 없는 정책과의 연결은 지움", () => {
    const doogo = [
      { id: "d-1", name: "아무 이름", policyCode: "sp100", shippingType: "domestic" },
      { id: "d-2", name: "조건부 무료", policyCode: null, shippingType: "domestic" },
      { id: "d-3", name: "없는 정책", policyCode: "ZZ", shippingType: "domestic" }
    ];
    expect(suggestShippingPolicyMapping(doogo, BJ_POLICIES, { "d-9": "bj-gone" })).toEqual({ "d-1": "bj-pol-1", "d-2": "bj-pol-2" });
    expect(suggestShippingPolicyMapping(doogo, BJ_POLICIES, { "d-1": "bj-pol-2" })["d-1"]).toBe("bj-pol-2"); // 관리자가 고른 연결은 유지
  });

  it("카테고리: 발주오라 세부 카테고리 여러 개를 DB센터 대표 카테고리 하나로(가까운 연결 먼저), 연결 안 된 카테고리만 고름", () => {
    const forward = { "c-farm": "bj-farm", "c-sea": "bj-sea" };
    const reverse = { "bj-mush": "c-farm" };
    expect(doogoCategoryForBaljuora(["bj-fruit"], forward, reverse, CATEGORIES)).toBe("c-farm");
    expect(doogoCategoryForBaljuora(["bj-mush"], forward, reverse, CATEGORIES)).toBe("c-farm");
    expect(doogoCategoryForBaljuora(["bj-special"], forward, reverse, CATEGORIES)).toBeNull();
    expect(doogoCategoryForBaljuora(["bj-fruit"], forward, { "bj-fruit": "c-fruit" }, CATEGORIES)).toBe("c-fruit"); // 하위에 따로 연결하면 그쪽이 먼저
    expect(doogoCategoryForBaljuora(["bj-mush"], forward, reverse, CATEGORIES, (id) => id !== "c-farm")).toBeNull(); // 쓸 수 없는(숨긴) 카테고리는 건너뜀
    expect(unconnectedBaljuoraCategories(CATEGORIES, forward, reverse).map((category) => category.id)).toEqual(["bj-special"]);
    expect(unconnectedBaljuoraCategories(CATEGORIES, { "c-fruit": "bj-fruit" }).map((category) => category.id)).toEqual(["bj-mush", "bj-sea", "bj-special"]); // 농산 아래가 일부만 연결 → 농산 자체는 안 보임
  });

  it("비교: 발주오라에서 바꾼 썸네일은 가져올 변경, 같은 그림(보낸 이미지)은 다르지 않음, 연결된 세부 카테고리는 같음", () => {
    const product = { id: "p", productCode: "A", name: "사과", generalPrice: 26000, aPrice: 24000, salePrice: null, salePriceMode: "autonomous", costPrice: 20000, categoryId: "c-farm", imageUrl: "https://doogo.test/a.jpg", shippingPolicyId: "d-1" };
    const values = doogoSyncValues(product, { "c-farm": "bj-farm" }, { "d-1": "bj-pol-1" }, { "bj-mush": "c-farm" });
    expect(values.baljuoraCategoryIds.sort()).toEqual(["bj-farm", "bj-mush"]);
    const base = snapshot({ id: "bj-1", name: "사과", supplyPrice: 26000, groupPrice: 24000, purchaseCost: 20000, categoryIds: ["bj-mush"], imageUrls: ["https://files.baljuora.com/a.jpg"], shippingPolicyId: "bj-pol-1" });
    const baseline = { doogo: { name: "사과", supplyPrice: 26000, groupPrice: 24000, consumerPrice: null, purchaseCost: 20000, category: "c-farm", image: "https://doogo.test/a.jpg", shippingPolicy: "d-1" }, baljuora: { name: "사과", supplyPrice: 26000, groupPrice: 24000, consumerPrice: null, purchaseCost: 20000, category: "bj-mush", image: "https://files.baljuora.com/a.jpg", shippingPolicy: "bj-pol-1" }, pushedImageUrl: "https://doogo.test/a.jpg", at: "2026-11-23T00:00:00Z" };
    expect(diffBaljuoraProduct(values, { snapshot: base, baseline }, CATEGORIES)).toEqual([]);
    const changed = { ...base, imageUrls: ["https://files.baljuora.com/a-new.jpg"], shippingPolicyId: "bj-pol-2" };
    expect(diffBaljuoraProduct(values, { snapshot: changed, baseline }, CATEGORIES)).toEqual([
      { field: "image", doogo: "https://doogo.test/a.jpg", baljuora: "https://files.baljuora.com/a-new.jpg", direction: "pull" },
      { field: "shippingPolicy", doogo: "d-1", baljuora: "bj-pol-2", direction: "pull" }
    ]);
    // DB센터 상품에 배송 정책이 없으면 발주오라 정책을 가져올 것(pull)만, 발주오라 정책을 읽지 못했으면 비교 안 함
    const noPolicy = doogoSyncValues({ ...product, shippingPolicyId: null }, { "c-farm": "bj-farm" });
    expect(diffBaljuoraProduct(noPolicy, { snapshot: base, baseline: null }, CATEGORIES).find((diff) => diff.field === "shippingPolicy")).toEqual({ field: "shippingPolicy", doogo: null, baljuora: "bj-pol-1", direction: "pull" });
    // DB센터에 대표 이미지가 없고 발주오라에 있으면 가져올 변경
    const noImage = doogoSyncValues({ ...product, imageUrl: null }, { "c-farm": "bj-farm" }, { "d-1": "bj-pol-1" });
    expect(diffBaljuoraProduct(noImage, { snapshot: base, baseline: null }, CATEGORIES).find((diff) => diff.field === "image")).toEqual({ field: "image", doogo: null, baljuora: "https://files.baljuora.com/a.jpg", direction: "pull" });
    const unread = { ...base };
    delete unread.shippingPolicyId;
    expect(diffBaljuoraProduct(noPolicy, { snapshot: unread, baseline: null }, CATEGORIES).some((diff) => diff.field === "shippingPolicy")).toBe(false);
  });
});

describe("발주오라 ↔ DB센터 맞추기(API)", () => {
  beforeAll(async () => {
    await applyMigrations();
    await executeSql("DELETE FROM shipping_policies WHERE id LIKE 'pol-%'");
    await executeSql("INSERT INTO shipping_policies (id, name, shippingType, fee, feeLabel, feeType, feeBasis, rateType, policyCode, isActive, sortOrder) VALUES ('pol-parcel', '택배 3000', 'domestic', 3000, '고정 3,000원', 'paid', 'order', 'fixed', 'SP100', 1, 0)");
    const insert = "INSERT INTO products (id, productCode, name, imageUrl, supplierName, costPrice, aPrice, generalPrice, salePrice, salePriceMode, shippingType, categoryId, shippingPolicyId, isVisible, isSoldOut, isAlwaysOnSale, displayOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'autonomous', 'domestic', ?, ?, 1, 0, 1, ?)";
    await executeSql(insert, ["aln-1", "ALN-001", "사과 5kg", "https://doogo.test/a.jpg", "봄날농원", 20000, 24000, 26000, "cat-domestic-farm", "pol-parcel", 1]);
    await executeSql(insert, ["aln-2", "ALN-002", "배 7kg", null, "봄날농원", 30000, 0, 38000, "cat-domestic-farm", null, 2]);
    await executeSql(insert, ["aln-3", "ALN-003", "고등어 2kg", null, "바다상회", 0, 0, 15000, "cat-domestic-seafood", null, 3]);
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  async function adminToken() {
    const user = await signUpAndGetToken(app);
    await executeSql("UPDATE user SET role = ?, emailVerified = 1 WHERE id = ?", ["admin", user.userId!]);
    return user.token;
  }

  async function json<T>(res: Response) {
    return (await res.json()) as { ok: boolean; data: T; error?: { message?: string } };
  }

  async function call<T>(admin: string, path: string, method = "GET", body?: unknown) {
    const res = await fetchWithAuth(app, admin, `/api/baljuora${path}`, body === undefined ? { method } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const parsed = await json<T>(res);
    if (!parsed.ok) throw new Error(`${path}: ${parsed.error?.message}`);
    return parsed.data;
  }

  async function compare(admin: string, snapshots: BaljuoraProductSnapshot[], extra: Record<string, unknown> = {}) {
    const created = await call<{ code: string }>(admin, "/admin/jobs", "POST", { type: "compare" });
    const res = await app.fetch(new Request(`http://localhost/api/baljuora/runner/${created.code}/results`, { method: "POST", headers: { "Content-Type": "application/json", origin: "https://console.baljuora.com" }, body: JSON.stringify({ final: true, categories: TREE, group: { id: "grp-1", name: "황금농부 수강생" }, snapshots, ...extra }) }));
    expect((await json(res)).ok).toBe(true);
  }

  type Changes = { items: Array<{ productId: string; diffs: Array<{ field: string; direction: string; doogo: unknown; baljuora: unknown }> }> };
  const diffsOf = (changes: Changes, productId: string) => changes.items.find((item) => item.productId === productId)?.diffs ?? [];

  const first = [
    snapshot({ id: "bj-1", code: "ALN-001", name: "사과 5kg", supplyPrice: 26000, groupPrice: 24000, purchaseCost: 20000, categoryIds: ["bj-fruit"], imageUrls: ["https://files.baljuora.com/a.jpg"], shippingPolicyId: "bj-pol-1" }),
    snapshot({ id: "bj-2", code: "ALN-002", name: "배 7kg", supplyPrice: 38000, groupPrice: null, purchaseCost: 30000, categoryIds: ["bj-mush"], imageUrls: [], shippingPolicyId: "bj-pol-2" }),
    snapshot({ id: "bj-3", code: "ALN-003", name: "고등어 2kg", supplyPrice: 15000, groupPrice: null, purchaseCost: null, categoryIds: ["bj-sea"], imageUrls: [], shippingPolicyId: "bj-pol-1" })
  ];

  it("비교 → 배송비 정책 자동 연결 → 발주오라 카테고리 연결 → 발주오라에서 바뀐 값 감지 → 가져오기(바뀐 칸만) → 발주오라 기준 맞추기(배송비 정책 만들기) → 보내기 계획", async () => {
    const admin = await adminToken();
    await compare(admin, first, { shippingPolicies: BJ_POLICIES });

    // 1) 배송비 코드가 같은 정책은 자동 연결, 개요에 양쪽 정책 목록
    const overview = await call<{ settings: { shippingPolicyMap: Record<string, string>; categoryMap: Record<string, string> }; baljuoraShippingPolicies: Array<{ id: string; convertible: boolean }> }>(admin, "/admin/overview");
    expect(overview.settings.shippingPolicyMap).toEqual({ "pol-parcel": "bj-pol-1" });
    expect(overview.settings.categoryMap).toMatchObject({ "cat-domestic-farm": "bj-farm", "cat-domestic-seafood": "bj-sea" });
    expect(overview.baljuoraShippingPolicies.map((item) => [item.id, item.convertible])).toEqual([["bj-pol-1", true], ["bj-pol-2", true]]);

    let changes = await call<Changes>(admin, "/admin/changes");
    expect(diffsOf(changes, "aln-1")).toEqual([]); // 과일류는 농산 아래, 정책·이미지 같음
    expect(diffsOf(changes, "aln-2").map((diff) => [diff.field, diff.direction])).toEqual([["category", "initial"], ["shippingPolicy", "pull"]]);
    expect(diffsOf(changes, "aln-3").map((diff) => [diff.field, diff.direction])).toEqual([["shippingPolicy", "pull"]]);

    // 2) 발주오라 '버섯'(DB센터에 없는 세부 카테고리)을 DB센터 '농산'으로 연결하면 카테고리 다름이 사라짐
    await call(admin, "/admin/settings", "PUT", { baljuoraCategoryMap: { "bj-mush": "cat-domestic-farm" } });
    changes = await call<Changes>(admin, "/admin/changes");
    expect(diffsOf(changes, "aln-2").map((diff) => diff.field)).toEqual(["shippingPolicy"]);

    // 3) 발주오라에서 사과 공급가·썸네일을 바꿈 → 다시 비교하면 '발주오라에서 바뀜'
    await compare(admin, [{ ...first[0], supplyPrice: 27000, imageUrls: ["https://files.baljuora.com/a-new.jpg"] }, first[1], first[2]]);
    changes = await call<Changes>(admin, "/admin/changes");
    expect(diffsOf(changes, "aln-1").map((diff) => [diff.field, diff.direction])).toEqual([["supplyPrice", "pull"], ["image", "pull"]]);

    // 4) DB센터에서 상품명을 고친 뒤 '가져올 변경'(onlyPulled)으로 가져오면 발주오라에서 바뀐 칸만 바뀌고 상품명은 그대로
    await executeSql("UPDATE products SET name = '사과 5kg 특' WHERE id = 'aln-1'");
    const pulled = await call<{ updated: number }>(admin, "/admin/pull", "POST", { productIds: ["aln-1"], onlyPulled: true });
    expect(pulled.updated).toBe(1);
    const appleRows = await executeSql("SELECT name, generalPrice, imageUrl FROM products WHERE id = 'aln-1'");
    expect(appleRows.rows[0]).toMatchObject({ name: "사과 5kg 특", generalPrice: 27000, imageUrl: "https://files.baljuora.com/a-new.jpg" });

    // 5) 발주오라 기준 맞추기(배송비 정책·카테고리): 배는 발주오라 '조건부무료'를 DB센터 정책으로 만들어 연결, 고등어는 연결된 '택배 3000'
    const master = await call<{ updated: number; unchanged: number; skipped: unknown[]; failed: unknown[] }>(admin, "/admin/pull", "POST", { productIds: ["aln-2", "aln-3"], fields: ["category", "shippingPolicy"] });
    expect(master).toMatchObject({ updated: 2, unchanged: 0, skipped: [], failed: [] });
    const created = await executeSql("SELECT id, name, rateType, rateTiers, policyCode, jejuExtraFee, islandExtraFee, shippingType FROM shipping_policies WHERE policyCode = 'SP200'");
    expect(created.rows[0]).toMatchObject({ name: "조건부무료", rateType: "amount", jejuExtraFee: 3000, islandExtraFee: 5000, shippingType: "domestic" });
    expect(JSON.parse(String(created.rows[0].rateTiers))).toEqual({ tiers: [{ upTo: 30000, fee: 3000 }], last: { fee: 0, repeat: false } });
    const newPolicyId = String(created.rows[0].id);
    const policyRows = await executeSql("SELECT id, shippingPolicyId, categoryId FROM products WHERE id IN ('aln-2', 'aln-3') ORDER BY id");
    expect(policyRows.rows.map((row) => [row.id, row.shippingPolicyId, row.categoryId])).toEqual([["aln-2", newPolicyId, "cat-domestic-farm"], ["aln-3", "pol-parcel", "cat-domestic-seafood"]]);
    const settings = await call<{ settings: { shippingPolicyMap: Record<string, string> } }>(admin, "/admin/overview");
    expect(settings.settings.shippingPolicyMap).toEqual({ "pol-parcel": "bj-pol-1", [newPolicyId]: "bj-pol-2" });
    changes = await call<Changes>(admin, "/admin/changes");
    expect(diffsOf(changes, "aln-2")).toEqual([]);
    expect(diffsOf(changes, "aln-3")).toEqual([]);

    // 6) 다른 칸이 없는 상품은 건드리지 않음(그대로 수)
    const again = await call<{ updated: number; unchanged: number }>(admin, "/admin/pull", "POST", { productIds: ["aln-2"], fields: ["category", "shippingPolicy"] });
    expect(again).toMatchObject({ updated: 0, unchanged: 1 });

    // 7) DB센터에서 사과 배송 정책을 '조건부무료'로 바꾸면 보낼 변경 → 보내기 계획에 연결한 발주오라 정책 id
    await executeSql("UPDATE products SET shippingPolicyId = ? WHERE id = 'aln-1'", [newPolicyId]);
    changes = await call<Changes>(admin, "/admin/changes");
    expect(diffsOf(changes, "aln-1").find((diff) => diff.field === "shippingPolicy")).toMatchObject({ doogo: newPolicyId, baljuora: "bj-pol-1", direction: "push" });
    const push = await call<{ code: string }>(admin, "/admin/jobs", "POST", { type: "push", productIds: ["aln-1"], fieldsByProduct: { "aln-1": ["shippingPolicy"] } });
    const plan = await json<{ plan: { items: Array<{ productId: string; fields: string[]; values: Record<string, unknown> }> } }>(await app.fetch(new Request(`http://localhost/api/baljuora/runner/${push.code}`)));
    expect(plan.data.plan.items[0]).toMatchObject({ productId: "aln-1", fields: ["shippingPolicy"], values: { baljuoraShippingPolicyId: "bj-pol-2" } });
  });

  it("카테고리 맞추기: 연결되지 않은 발주오라 카테고리를 DB센터에 같은 이름으로 만들고 연결(이미 연결된 것은 다시 만들지 않음)", async () => {
    const admin = await adminToken();
    await compare(admin, first, { shippingPolicies: BJ_POLICIES });
    const result = await call<{ created: Array<{ id: string; name: string; baljuoraId: string; reused: boolean }> }>(admin, "/admin/categories/from-baljuora", "POST", { baljuoraCategoryIds: ["bj-special", "bj-sea"], shippingType: "domestic" });
    expect(result.created.map((item) => [item.name, item.baljuoraId, item.reused])).toEqual([["🎀 특별선물", "bj-special", false]]);
    const rows = await executeSql("SELECT name, shippingType, isActive FROM categories WHERE id = ?", [result.created[0].id]);
    expect(rows.rows[0]).toMatchObject({ name: "🎀 특별선물", shippingType: "domestic", isActive: 1 });
    const overview = await call<{ settings: { categoryMap: Record<string, string> } }>(admin, "/admin/overview");
    expect(overview.settings.categoryMap[result.created[0].id]).toBe("bj-special");
    const again = await call<{ created: unknown[] }>(admin, "/admin/categories/from-baljuora", "POST", { baljuoraCategoryIds: ["bj-special"], shippingType: "domestic" });
    expect(again.created).toEqual([]);
  });
});
