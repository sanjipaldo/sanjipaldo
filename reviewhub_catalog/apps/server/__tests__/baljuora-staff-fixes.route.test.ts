// 2026-11-27 직원(MD) 신고 — DB센터 → 발주오라 동기화 중 계속 남던 오류 4가지:
// ① '발주오라에만 있음' 8건: 'DB센터로 가져오기' 하면 "이미 있다"(상품코드가 DB센터에서 지운 상품과 같음) → 지운 상품을 숨김으로 되살려 연결
// ② '신규 등록' 3건: 보내면 "발주오라에 이름이 같은 상품이 이미 있어…" → '같은 상품으로 연결'(상품코드를 발주오라 코드로, 숨김 중복 상품 삭제)
// ③ 카테고리 1건: '💊 국내 건강식품' 이름 변경이 "같은 이름의 카테고리가 이미 있어 바꾸지 않았습니다"로 매번 남음 → 보낼 것에서 빼고 이유로
// ④ 아침 동기화 자동 등록은 지운 상품을 되살리지 않고, 이름이 같은 신규 등록 상품이 있는 발주오라 상품도 새로 만들지 않음
// 발주오라 쪽은 책갈피가 보내는 결과 JSON으로 흉내 냅니다(실제 발주오라에 접속하지 않음).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildCategoryTreePlan, flattenBaljuoraCategories, type BaljuoraProductSnapshot } from "@repo/shared/baljuora-sync";

process.env.SKYBASE_DB_ENDPOINT = `file:${join(mkdtempSync(join(tmpdir(), "baljuora-staff-")), "test.db")}`;
const { default: app } = await import("../_core/create-app");
const { executeSql } = await import("../_core/db");
const { applyMigrations, fetchWithAuth, resetDatabase, signUpAndGetToken } = await import("../_test/helpers");

const CATEGORY = "cat-domestic-farm";
const CATEGORY_TREE = [{ id: "bj-cat-farm", name: "🥕 농산", children: [{ id: "bj-cat-fruit", name: "과일류", children: [] }] }];

type SameName = { baljuoraId: string; code: string | null; name: string; holder: { id: string; name: string; code: string | null; isVisible: boolean; deleted: boolean } | null; blocked: string | null };
type Changes = {
  items: Array<{ productId: string; kind: "new" | "update"; code: string | null; sameName?: SameName }>;
  baljuoraOnly: Array<{ id: string; code: string | null; deletedMatch?: { id: string; name: string; code: string }; sameNameProduct?: { id: string; name: string; code: string | null } }>;
};
type LinkResult = { linked: number; removed: number; items: Array<{ productId: string; code: string; previousCode: string | null; removed: Array<{ id: string }> }>; failed: Array<{ id: string; name: string; error: string }> };

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await resetDatabase();
  await executeSql("DELETE FROM baljuora_sync_jobs");
  await executeSql("DELETE FROM baljuora_sync_store");
  await executeSql("DELETE FROM external_product_links");
  await executeSql("DELETE FROM price_histories WHERE productId LIKE 'st-%' OR productId IN (SELECT id FROM products WHERE productCode LIKE 'ST-%')");
  await executeSql("DELETE FROM catalog_activity_logs WHERE productId LIKE 'st-%' OR productId IN (SELECT id FROM products WHERE productCode LIKE 'ST-%')");
  await executeSql("DELETE FROM products WHERE id LIKE 'st-%' OR productCode LIKE 'ST-%' OR productCode LIKE 'PD17%'");
});

const insert = (id: string, code: string, name: string, visible: boolean, supplier: string | null = null) => executeSql(
  "INSERT INTO products (id, productCode, name, imageUrl, supplierName, costPrice, aPrice, generalPrice, salePrice, salePriceMode, shippingType, categoryId, isVisible, isSoldOut, isAlwaysOnSale, displayOrder) VALUES (?, ?, ?, NULL, ?, 9000, 11000, 12000, NULL, 'autonomous', 'domestic', ?, ?, 0, 1, 1)",
  [id, code, name, supplier, CATEGORY, visible ? 1 : 0]
);

async function adminToken() {
  const user = await signUpAndGetToken(app);
  await executeSql("UPDATE user SET role = ?, emailVerified = 1 WHERE id = ?", ["admin", user.userId!]);
  return user.token;
}

async function api<T>(admin: string, path: string, method = "GET", body?: unknown) {
  const res = await fetchWithAuth(app, admin, path, body === undefined ? { method } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const parsed = (await res.json()) as { ok: boolean; data: T; error?: { message?: string } };
  return { status: res.status, ok: parsed.ok, data: parsed.data, message: parsed.error?.message };
}

function snapshot(partial: Partial<BaljuoraProductSnapshot> & { id: string }): BaljuoraProductSnapshot {
  return { kind: "product", code: null, name: "", supplyPrice: null, consumerPrice: null, purchaseCost: null, imageUrls: [], isVisible: true, isSoldOut: false, updatedAt: "2026-11-27T00:00:00Z", categoryIds: ["bj-cat-fruit"], ...partial };
}

// 비교 작업 하나를 만들어 책갈피 결과(상품·카테고리)를 보냅니다.
async function compare(admin: string, snapshots: BaljuoraProductSnapshot[], body: Record<string, unknown> = { type: "compare" }, path = "/api/baljuora/admin/jobs") {
  const created = await api<{ code: string }>(admin, path, "POST", body);
  expect(created.ok).toBe(true);
  await app.fetch(new Request(`http://localhost/api/baljuora/runner/${created.data.code}`));
  const res = await app.fetch(new Request(`http://localhost/api/baljuora/runner/${created.data.code}/results`, { method: "POST", headers: { "Content-Type": "application/json", origin: "https://console.baljuora.com" }, body: JSON.stringify({ final: true, categories: CATEGORY_TREE, snapshots }) }));
  expect(res.status).toBe(200);
  return created.data.code;
}

const changesOf = async (admin: string) => (await api<Changes>(admin, "/api/baljuora/admin/changes")).data;
const productRow = async (id: string) => (await executeSql("SELECT id, productCode, name, isVisible, deletedAt, generalPrice, costPrice FROM products WHERE id = ?", [id])).rows[0] as Record<string, unknown> | undefined;
const linkOf = async (externalId: string) => (await executeSql("SELECT productId, externalProductCode FROM external_product_links WHERE externalProductId = ?", [externalId])).rows[0] as Record<string, unknown> | undefined;

describe("발주오라에만 있음: DB센터에서 지운 상품(상품코드 같음)", () => {
  it("목록에 '지운 상품'으로 표시하고, 가져오면 새로 만들지 않고 그 상품을 숨김으로 되살려 발주오라 값으로 채우고 연결합니다", async () => {
    const admin = await adminToken();
    await insert("st-kiwi", "ST-KIWI5", "[제] 레드키위 대과 / 5kg", true, "청도농원");
    // 관리자 '삭제'(숨김 + deletedAt, 상품코드는 그대로 가짐)
    expect((await api(admin, "/api/catalog/admin/products/st-kiwi", "DELETE")).status).toBe(200);
    await compare(admin, [snapshot({ id: "bj-kiwi", code: "ST-KIWI5", name: "[제] 레드키위 대과 / 5kg", supplyPrice: 45480, purchaseCost: 40000 })]);

    let changes = await changesOf(admin);
    expect(changes.baljuoraOnly).toEqual([expect.objectContaining({ id: "bj-kiwi", deletedMatch: { id: "st-kiwi", name: "[제] 레드키위 대과 / 5kg", code: "ST-KIWI5" } })]);

    // 예전에는 createProduct가 "상품코드 ST-KIWI5는 이미 '[제] 레드키위 대과 / 5kg' 상품에서 쓰고 있습니다"로 실패했음
    const pulled = await api<{ created: number; restored: number; failed: unknown[] }>(admin, "/api/baljuora/admin/pull", "POST", { baljuoraIds: ["bj-kiwi"] });
    expect(pulled.data).toMatchObject({ created: 1, restored: 1, failed: [] });
    expect(await productRow("st-kiwi")).toMatchObject({ productCode: "ST-KIWI5", isVisible: 0, deletedAt: null, generalPrice: 45480, costPrice: 40000 });
    expect(Number((await executeSql("SELECT COUNT(*) AS c FROM products WHERE productCode = 'ST-KIWI5'")).rows[0].c)).toBe(1);
    expect(await linkOf("bj-kiwi")).toMatchObject({ productId: "st-kiwi", externalProductCode: "ST-KIWI5" });
    // 매입처 같은 DB센터 값은 그대로
    expect((await executeSql("SELECT supplierName FROM products WHERE id = 'st-kiwi'")).rows[0]).toMatchObject({ supplierName: "청도농원" });

    changes = await changesOf(admin);
    expect(changes.baljuoraOnly).toEqual([]);
    expect(changes.items.find((item) => item.productId === "st-kiwi")?.kind).not.toBe("new");
    // 다음 비교에서도 그대로 연결
    await compare(admin, [snapshot({ id: "bj-kiwi", code: "ST-KIWI5", name: "[제] 레드키위 대과 / 5kg", supplyPrice: 45480, purchaseCost: 40000 })]);
    changes = await changesOf(admin);
    expect(changes.baljuoraOnly).toEqual([]);
    expect(await linkOf("bj-kiwi")).toMatchObject({ productId: "st-kiwi" });
  });
});

describe("신규 등록: 발주오라에 이름이 같은 상품 → 같은 상품으로 연결", () => {
  it("마우리엔젯 사례: 발주오라 상품이 DB센터 숨김 중복 상품과 연결돼 있으면 이 상품을 발주오라 코드로 잇고 숨김 중복 상품은 지웁니다", async () => {
    const admin = await adminToken();
    const name = "마우리엔젯 로얄제리 30캡슐";
    await insert("st-hidden", "PD1793847942852", name, false); // 발주오라에서 숨김으로 가져온 상품
    await insert("st-copy", "PD1780667766602-1", name, true, "비타숲"); // MD가 복사해 만든 공개 상품
    // 발주오라 공급가(13,000)는 DB센터 일반공급가(12,000)와 달라, 연결 뒤 '처음부터 다름'으로 보내기 대상이 됨
    const baljuora = snapshot({ id: "bj-mau", code: "PD1793847942852", name, supplyPrice: 13000, purchaseCost: 9000 });
    await compare(admin, [baljuora]);

    let changes = await changesOf(admin);
    const fresh = changes.items.find((item) => item.productId === "st-copy");
    expect(fresh).toMatchObject({ kind: "new", sameName: { baljuoraId: "bj-mau", code: "PD1793847942852", name, blocked: null, holder: { id: "st-hidden", code: "PD1793847942852", isVisible: false, deleted: false } } });
    expect(changes.items.find((item) => item.productId === "st-hidden")?.kind).not.toBe("new");

    const linked = await api<LinkResult>(admin, "/api/baljuora/admin/link-same-name", "POST", { productIds: ["st-copy"] });
    expect(linked.data).toMatchObject({ linked: 1, removed: 1, failed: [], items: [{ productId: "st-copy", code: "PD1793847942852", previousCode: "PD1780667766602-1", removed: [{ id: "st-hidden" }] }] });
    expect(await productRow("st-copy")).toMatchObject({ productCode: "PD1793847942852", isVisible: 1, deletedAt: null });
    const removed = await productRow("st-hidden");
    expect(removed).toMatchObject({ productCode: "PD1793847942852-DUP-STHIDDEN", isVisible: 0 });
    expect(removed?.deletedAt).toBeTruthy();
    expect(await linkOf("bj-mau")).toMatchObject({ productId: "st-copy", externalProductCode: "PD1793847942852" });

    changes = await changesOf(admin);
    expect(changes.items.some((item) => item.kind === "new" && item.productId === "st-copy")).toBe(false);
    expect(changes.items.some((item) => item.productId === "st-hidden")).toBe(false);
    // 다음 비교에서도 상품코드로 그대로 연결(지운 상품은 비교에서 빠짐)
    await compare(admin, [baljuora]);
    changes = await changesOf(admin);
    expect(changes.items.some((item) => item.kind === "new" && item.productId === "st-copy")).toBe(false);
    expect(changes.baljuoraOnly).toEqual([]);
    expect(await linkOf("bj-mau")).toMatchObject({ productId: "st-copy" });
    // 보내기 계획: 새로 등록(create)이 아니라 연결된 발주오라 상품 수정
    const push = await api<{ code: string }>(admin, "/api/baljuora/admin/jobs", "POST", { type: "push", productIds: ["st-copy"] });
    const plan = (await (await app.fetch(new Request(`http://localhost/api/baljuora/runner/${push.data.code}`))).json()) as { data: { plan: { items: Array<{ action: string; baljuoraId: string | null }> } } };
    expect(plan.data.plan.items[0]).toMatchObject({ action: "update", baljuoraId: "bj-mau" });
  });

  it("아무 상품과도 연결되지 않은 발주오라 상품은 바로 잇고, 공개 상품과 연결된 상품·상품코드 없는 발주오라 상품은 막고 이유를 알려 줍니다", async () => {
    const admin = await adminToken();
    await insert("st-orange", "ST-ORG1", "이웃 감귤 3kg", true);
    await insert("st-apple", "ST-APL1", "봄날 사과 5kg", true);
    await insert("st-apple-copy", "ST-APL1-1", "봄날 사과 5kg", true);
    await insert("st-nocode", "ST-NC1", "코드 없는 상품", true);
    await insert("st-old", "ST-OLD9", "예전 감", false);
    await executeSql("UPDATE products SET deletedAt = '2026-11-01T00:00:00Z' WHERE id = 'st-old'");
    await insert("st-persimmon", "ST-PER1", "청도 반시 2S 5kg", true);
    await compare(admin, [
      snapshot({ id: "bj-orange", code: "ST-BJ-ORG", name: "이웃  감귤 3kg ", supplyPrice: 12000 }), // 띄어쓰기 차이는 같은 이름
      snapshot({ id: "bj-apple", code: "ST-APL1", name: "봄날 사과 5kg", supplyPrice: 26000 }),
      snapshot({ id: "bj-nocode", code: null, name: "코드 없는 상품", supplyPrice: 1000 }),
      snapshot({ id: "bj-persimmon", code: "ST-OLD9", name: "청도 반시 2S 5kg", supplyPrice: 10800 }) // 코드는 지운 상품이 쥠
    ]);
    let changes = await changesOf(admin);
    const byId = (id: string) => changes.items.find((item) => item.productId === id);
    expect(byId("st-orange")?.sameName).toMatchObject({ baljuoraId: "bj-orange", code: "ST-BJ-ORG", holder: null, blocked: null });
    expect(changes.baljuoraOnly.find((item) => item.id === "bj-orange")?.sameNameProduct).toEqual({ id: "st-orange", name: "이웃 감귤 3kg", code: "ST-ORG1" });
    expect(byId("st-apple-copy")?.sameName?.blocked).toContain("DB센터 공개 상품 '봄날 사과 5kg'");
    expect(byId("st-nocode")?.sameName?.blocked).toContain("상품코드가 없어");
    expect(byId("st-persimmon")?.sameName).toMatchObject({ code: "ST-OLD9", holder: null, blocked: null });
    expect(changes.baljuoraOnly.find((item) => item.id === "bj-persimmon")).toMatchObject({ deletedMatch: { id: "st-old" }, sameNameProduct: { id: "st-persimmon" } });

    const linked = await api<LinkResult>(admin, "/api/baljuora/admin/link-same-name", "POST", { productIds: ["st-orange", "st-apple-copy", "st-nocode", "st-persimmon"] });
    expect(linked.data.linked).toBe(2);
    expect(linked.data.removed).toBe(0); // 지운 상품은 코드만 비움(새로 지운 상품 없음)
    expect(linked.data.failed.map((entry) => entry.id).sort()).toEqual(["st-apple-copy", "st-nocode"]);
    expect(await productRow("st-orange")).toMatchObject({ productCode: "ST-BJ-ORG", isVisible: 1 });
    expect(await productRow("st-persimmon")).toMatchObject({ productCode: "ST-OLD9" });
    expect(await productRow("st-old")).toMatchObject({ productCode: "ST-OLD9-DUP-STOLD" });
    expect(await productRow("st-apple-copy")).toMatchObject({ productCode: "ST-APL1-1" }); // 막힌 상품은 그대로
    expect(await linkOf("bj-orange")).toMatchObject({ productId: "st-orange" });
    expect(await linkOf("bj-persimmon")).toMatchObject({ productId: "st-persimmon" });

    changes = await changesOf(admin);
    expect(changes.baljuoraOnly.map((item) => item.id)).toEqual(["bj-nocode"]);
    // 이미 연결된 상품을 다시 연결하면 거절
    const again = await api<LinkResult>(admin, "/api/baljuora/admin/link-same-name", "POST", { productIds: ["st-orange"] });
    expect(again.data).toMatchObject({ linked: 0, failed: [{ id: "st-orange" }] });
    // 입력 검사·권한
    expect((await api(admin, "/api/baljuora/admin/link-same-name", "POST", { productIds: [] })).status).toBe(400);
    const anonymous = await app.fetch(new Request("http://localhost/api/baljuora/admin/link-same-name", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productIds: ["st-orange"] }) }));
    expect(anonymous.status).toBe(401);
  });
});

describe("아침 동기화 자동 등록", () => {
  it("발주오라에만 있는 새 상품은 숨김 등록하지만, DB센터에서 지운 상품(상품코드 같음)과 이름이 같은 신규 등록 상품이 있는 상품은 만들지 않습니다", async () => {
    const admin = await adminToken();
    await insert("st-gone", "ST-GONE1", "지운 사과", false);
    await executeSql("UPDATE products SET deletedAt = '2026-11-01T00:00:00Z' WHERE id = 'st-gone'");
    await insert("st-twin", "ST-TWIN-A", "쌍둥이 배 7kg", true);
    await compare(admin, [
      snapshot({ id: "bj-new", code: "ST-NEW1", name: "새 곶감 1kg", supplyPrice: 18000 }),
      snapshot({ id: "bj-gone", code: "ST-GONE1", name: "지운 사과", supplyPrice: 20000 }),
      snapshot({ id: "bj-twin", code: "ST-TWIN-B", name: "쌍둥이 배 7kg", supplyPrice: 38000 })
    ], {}, "/api/baljuora/admin/daily/start");
    for (let round = 0; round < 5; round += 1) {
      const step = await api<{ status: string }>(admin, "/api/baljuora/admin/daily/apply", "POST");
      expect(step.ok).toBe(true);
      if (step.data.status === "done") break;
    }
    expect((await executeSql("SELECT isVisible FROM products WHERE productCode = 'ST-NEW1'")).rows[0]).toMatchObject({ isVisible: 0 });
    expect((await productRow("st-gone"))?.deletedAt).toBeTruthy(); // 되살리지 않음
    expect(Number((await executeSql("SELECT COUNT(*) AS c FROM products WHERE name = '쌍둥이 배 7kg'")).rows[0].c)).toBe(1); // 하나 더 만들지 않음
    const changes = await changesOf(admin);
    expect(changes.baljuoraOnly.map((item) => item.id).sort()).toEqual(["bj-gone", "bj-twin"]);
  });
});

describe("카테고리 트리: 발주오라에 같은 이름 카테고리가 있으면 보내지 않고 이유를 보여 줍니다", () => {
  const TREE = flattenBaljuoraCategories([
    { id: "bj-health", name: "💊 건강식품", children: [{ id: "bj-health-kr", name: "💊 국내 건강식품", children: [] }] },
    { id: "bj-farm", name: "🥕 농산", children: [{ id: "bj-fruit", name: "🍎 과일", children: [] }] },
    { id: "bj-brand", name: "🌏 브랜드별", children: [{ id: "bj-brand-sea", name: "🐟 수산", children: [] }] }
  ]);

  it("'💊 국내 건강식품' 사례: 연결된 발주오라 카테고리 이름을 바꿔야 하는데 다른 곳에 같은 이름이 있으면 ops 대신 notes", () => {
    const plan = buildCategoryTreePlan({
      doogoCategories: [{ id: "c-health", name: "💊 국내 건강식품", sortOrder: 1 }],
      subcategories: [],
      baljuoraCategories: TREE,
      categoryMap: { "c-health": "bj-health" },
      subcategoryMap: {},
      excludeNames: ["브랜드별"]
    });
    expect(plan.ops).toEqual([]);
    expect(plan.notes).toEqual([{ doogoId: "c-health", name: "💊 국내 건강식품", reason: expect.stringContaining("발주오라에 같은 이름의 카테고리 '💊 건강식품 > 💊 국내 건강식품'가 이미 있어") }]);
    expect(plan.notes[0]!.reason).toContain("상품은 지금처럼 '💊 건강식품'로 보내요");
  });

  it("추가할 1차·2차 이름이 발주오라 다른 곳(브랜드별 아래 포함)에 있으면 추가하지 않고, 만들지 못한 1차 아래 2차도 보내지 않습니다", () => {
    const plan = buildCategoryTreePlan({
      doogoCategories: [
        { id: "c-farm", name: "🥕 농산", sortOrder: 1 },
        { id: "c-fruit", name: "🍎 과일", sortOrder: 2 },
        { id: "c-sea", name: "🐟 수산", sortOrder: 3 },
        { id: "c-new", name: "🥗 샐러드", sortOrder: 4 }
      ],
      subcategories: [
        { id: "s-apple", categoryId: "c-fruit", name: "사과", sortOrder: 0 },
        { id: "s-dup", categoryId: "c-farm", name: "💊 국내 건강식품", sortOrder: 0 },
        { id: "s-leaf", categoryId: "c-new", name: "잎채소", sortOrder: 0 }
      ],
      baljuoraCategories: TREE,
      categoryMap: { "c-farm": "bj-farm" },
      subcategoryMap: {},
      excludeNames: ["브랜드별"]
    });
    // 🍎 과일(1차)은 발주오라 '🥕 농산 > 🍎 과일'과, 🐟 수산은 '🌏 브랜드별 > 🐟 수산'과 이름이 같아 추가 안 함 · 🥗 샐러드와 그 아래 잎채소는 추가
    expect(plan.ops.map((op) => (op.type === "add" ? `add:${op.name}` : `rename:${op.to}`))).toEqual(["add:🥗 샐러드", "add:잎채소"]);
    expect(plan.notes.map((note) => note.name)).toEqual(["🍎 과일", "🐟 수산", "💊 국내 건강식품"]);
    expect(plan.notes.every((note) => note.reason.includes("새로 추가하지 않습니다"))).toBe(true);
  });

  it("같은 이름으로 바꿀 DB센터 카테고리가 둘이면 먼저 것만 보내고 둘째는 이유로 남깁니다(발주오라가 둘째를 거절하지 않게)", () => {
    const plan = buildCategoryTreePlan({
      doogoCategories: [
        { id: "c-a", name: "🧺 공동구매", sortOrder: 1 },
        { id: "c-b", name: "🧺 공동구매 ", sortOrder: 2 }
      ],
      subcategories: [],
      baljuoraCategories: TREE,
      categoryMap: {},
      subcategoryMap: {},
      excludeNames: ["브랜드별"]
    });
    expect(plan.ops).toHaveLength(1);
    expect(plan.notes).toEqual([{ doogoId: "c-b", name: "🧺 공동구매 ", reason: expect.stringContaining("같은 이름의 DB센터 카테고리가 먼저 보내져") }]);
  });
});
