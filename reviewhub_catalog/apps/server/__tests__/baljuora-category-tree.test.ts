// DB센터 → 발주오라 상품 카테고리 트리 맞추기(2026-11-23 관리자 요청 "카테고리가 추가되거나 2차 카테고리 문구가 바뀌면
// DB센터 관리자에서 바꾸고 동기화 버튼을 누르면 발주오라 상품 카테고리도 똑같이, 브랜드별은 제외").
// 발주오라 쪽은 책갈피가 보내는 결과 JSON으로 흉내 냅니다(실제 발주오라에 접속하지 않음).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildCategoryTreePlan, excludedBaljuoraCategoryIds, flattenBaljuoraCategories, importableBaljuoraSubcategories, type CategoryTreeOp } from "@repo/shared/baljuora-sync";

process.env.SKYBASE_DB_ENDPOINT = `file:${join(mkdtempSync(join(tmpdir(), "baljuora-tree-")), "test.db")}`;
const { default: app } = await import("../_core/create-app");
const { executeSql } = await import("../_core/db");
const { applyMigrations, fetchWithAuth, resetDatabase, signUpAndGetToken } = await import("../_test/helpers");

const TREE = [
  { id: "bj-farm", name: "🥕 농산", children: [{ id: "bj-fruit", name: "과일류", children: [] }, { id: "bj-veg", name: "채소류", children: [] }] },
  { id: "bj-sea", name: "🐟 수산", children: [] },
  { id: "bj-ovs", name: "✈️ 해외 건강식품", children: [{ id: "bj-ca", name: "캐나다 건강식품", children: [] }, { id: "bj-nz", name: "뉴질랜드 건강식품", children: [] }] },
  { id: "bj-brand", name: "🌏 브랜드별", children: [{ id: "bj-brand-kr", name: "국내 건강식품", children: [{ id: "bj-kd", name: "광동365", children: [] }] }] }
];
// 테스트 DB의 기본 1차 카테고리(migration 004·011)와 같은 이름의 발주오라 1차 카테고리(연결만 됨). '📦 기타'는 보내지 않음.
const SEED_ROOTS = [
  { id: "bj-meat", name: "🥩 축산", children: [] },
  { id: "bj-gift", name: "🎁 선물세트", children: [] },
  { id: "bj-food", name: "🥫 식품", children: [] },
  { id: "bj-health", name: "💊 건강식품", children: [] }
];
const LIVE_TREE = [...TREE.slice(0, 3), ...SEED_ROOTS, TREE[3]];
const FLAT = flattenBaljuoraCategories(TREE);

describe("카테고리 트리 맞추기 규칙", () => {
  it("브랜드별과 그 아래(3단계 브랜드 포함)는 통째로 뺍니다(이모지·띄어쓰기 무시)", () => {
    expect([...excludedBaljuoraCategoryIds(FLAT, ["브랜드별"])].sort()).toEqual(["bj-brand", "bj-brand-kr", "bj-kd"]);
  });

  it("DB센터 기준: 없는 카테고리는 추가(1차 → 2차 순서, 새 1차 아래 2차는 ref로), 이름이 다르면 바꾸기, 같은 이름은 연결만, 발주오라에만 있는 것은 그대로", () => {
    const plan = buildCategoryTreePlan({
      doogoCategories: [
        { id: "c-farm", name: "🥕 농산", sortOrder: 1 },
        { id: "c-sea", name: "🐟 수산", sortOrder: 2 },
        { id: "c-fresh", name: "🥗 신선식품", sortOrder: 3 },
        { id: "c-ovs", name: "✈️ 해외 건강식품", sortOrder: 4 },
        { id: "c-brand", name: "브랜드별", sortOrder: 9 }
      ],
      subcategories: [
        { id: "s-fruit", categoryId: "c-farm", name: "과일", sortOrder: 0 },
        { id: "s-grain", categoryId: "c-farm", name: "곡류", sortOrder: 1 },
        { id: "s-salad", categoryId: "c-fresh", name: "샐러드", sortOrder: 0 },
        { id: "s-ca", categoryId: "c-ovs", name: "캐나다 건강식품", sortOrder: 0 },
        { id: "s-brand", categoryId: "c-brand", name: "광동", sortOrder: 0 }
      ],
      baljuoraCategories: FLAT,
      categoryMap: { "c-farm": "bj-farm", "c-ovs": "bj-ovs" },
      subcategoryMap: { "s-fruit": "bj-fruit" },
      excludeNames: ["브랜드별"]
    });
    expect(plan.ops).toEqual<CategoryTreeOp[]>([
      { type: "add", level: 1, ref: "c:c-fresh", name: "🥗 신선식품", doogoId: "c-fresh", parentBaljuoraId: null, parentRef: null },
      { type: "rename", level: 2, baljuoraId: "bj-fruit", from: "과일류", to: "과일", doogoId: "s-fruit" },
      { type: "add", level: 2, ref: "s:s-grain", name: "곡류", doogoId: "s-grain", parentBaljuoraId: "bj-farm", parentRef: null },
      { type: "add", level: 2, ref: "s:s-salad", name: "샐러드", doogoId: "s-salad", parentBaljuoraId: null, parentRef: "c:c-fresh" }
    ]);
    // 이름이 같은 발주오라 카테고리는 새로 만들지 않고 연결만
    expect(plan.links).toEqual({ categoryMap: { "c-sea": "bj-sea" }, subcategoryMap: { "s-ca": "bj-ca" } });
    expect(plan.baljuoraOnly.map((item) => item.path)).toEqual(["🥕 농산 > 채소류", "✈️ 해외 건강식품 > 뉴질랜드 건강식품"]);
    expect(plan.excluded).toEqual(["🌏 브랜드별"]);
  });

  it("가져올 발주오라 2차: DB센터 1차와 연결된 발주오라 1차 바로 아래 중 아직 DB센터 2차가 없는 것(브랜드별 제외)", () => {
    const list = importableBaljuoraSubcategories({
      doogoCategories: [{ id: "c-farm", name: "🥕 농산" }, { id: "c-ovs", name: "✈️ 해외 건강식품" }, { id: "c-brand", name: "브랜드별" }],
      subcategories: [{ id: "s-fruit", categoryId: "c-farm", name: "과일류" }],
      baljuoraCategories: FLAT,
      categoryMap: { "c-farm": "bj-farm", "c-brand": "bj-brand" },
      subcategoryMap: {},
      excludeNames: ["브랜드별"]
    });
    expect(list.map((item) => [item.path, item.doogoCategoryId])).toEqual([["🥕 농산 > 채소류", "c-farm"], ["✈️ 해외 건강식품 > 캐나다 건강식품", "c-ovs"], ["✈️ 해외 건강식품 > 뉴질랜드 건강식품", "c-ovs"]]);
  });

  it("발주오라 카테고리를 아직 읽지 않았으면 아무것도 추가하지 않게(서버가 ops를 비움) — 규칙만 보면 모두 추가", () => {
    const plan = buildCategoryTreePlan({ doogoCategories: [{ id: "c-farm", name: "농산" }], subcategories: [], baljuoraCategories: [], categoryMap: {}, subcategoryMap: {}, excludeNames: ["브랜드별"] });
    expect(plan.ops).toHaveLength(1);
  });
});

describe("카테고리 트리 맞추기(API)", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  async function adminToken() {
    const user = await signUpAndGetToken(app);
    await executeSql("UPDATE user SET role = ?, emailVerified = 1 WHERE id = ?", ["admin", user.userId!]);
    return user.token;
  }

  async function call<T>(admin: string, path: string, method = "GET", body?: unknown, prefix = "/api/baljuora") {
    const res = await fetchWithAuth(app, admin, `${prefix}${path}`, body === undefined ? { method } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const parsed = (await res.json()) as { ok: boolean; data: T; error?: { message?: string } };
    if (!parsed.ok) throw new Error(`${path}: ${parsed.error?.message}`);
    return parsed.data;
  }

  type TreeView = { ready: boolean; ops: CategoryTreeOp[]; importable: Array<{ baljuoraId: string; name: string }>; subcategoryCount: number; excluded: string[] };

  it("비교 → 발주오라 2차 가져오기 → DB센터에서 2차 이름 바꾸기·1차/2차 추가 → 보내기 계획 → 책갈피 결과로 연결 저장", async () => {
    const admin = await adminToken();
    // DB센터 1차 카테고리는 migration 기본값(🥕 농산·🐟 수산·…·✈️ 해외 건강식품, 📦 기타 2개)
    const created = await call<{ code: string }>(admin, "/admin/jobs", "POST", { type: "compare" });
    const posted = await app.fetch(new Request(`http://localhost/api/baljuora/runner/${created.code}/results`, { method: "POST", headers: { "Content-Type": "application/json", origin: "https://console.baljuora.com" }, body: JSON.stringify({ final: true, categories: LIVE_TREE, snapshots: [] }) }));
    expect(((await posted.json()) as { ok: boolean }).ok).toBe(true);

    let overview = await call<{ categoryTree: TreeView; settings: { categoryMap: Record<string, string> } }>(admin, "/admin/overview");
    expect(overview.categoryTree.ready).toBe(true);
    expect(overview.categoryTree.excluded).toEqual(["🌏 브랜드별"]);
    const importNames = overview.categoryTree.importable.map((item) => item.name);
    expect(importNames).toEqual(expect.arrayContaining(["과일류", "채소류", "캐나다 건강식품", "뉴질랜드 건강식품"]));
    expect(importNames).not.toContain("국내 건강식품");

    // 1) 발주오라 2차 가져오기 → DB센터 2차 생성·연결, 더 가져올 것·보낼 것 없음
    const imported = await call<{ created: number }>(admin, "/admin/categories/import-subcategories", "POST", {});
    expect(imported.created).toBe(4);
    overview = await call(admin, "/admin/overview");
    expect(overview.categoryTree.importable).toEqual([]);
    expect(overview.categoryTree.subcategoryCount).toBe(4);
    expect(overview.categoryTree.ops).toEqual([]);

    // 2) DB센터 관리자에서 2차 이름 바꾸기 + 새 1차·2차 추가
    const { subcategories } = await call<{ subcategories: Array<{ id: string; name: string; categoryId: string }> }>(admin, "/admin/subcategories", "GET", undefined, "/api/catalog");
    const canada = subcategories.find((sub) => sub.name === "캐나다 건강식품")!;
    await call(admin, `/admin/subcategories/${canada.id}`, "PUT", { name: "캐나다 영양제" }, "/api/catalog");
    // 같은 1차 아래 같은 이름은 막음
    const duplicate = await fetchWithAuth(app, admin, "/api/catalog/admin/subcategories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoryId: canada.categoryId, name: "뉴질랜드 건강식품" }) });
    expect(duplicate.status).toBe(409);
    const fresh = await call<{ category: { id: string } }>(admin, "/admin/categories", "POST", { name: "🍍 수입과일", shippingType: "domestic", sortOrder: 30, isActive: true }, "/api/catalog");
    const mango = await call<{ subcategory: { id: string } }>(admin, "/admin/subcategories", "POST", { categoryId: fresh.category.id, name: "망고" }, "/api/catalog");
    // 2차가 있는 1차는 지우지 않음
    const blocked = await fetchWithAuth(app, admin, `/api/catalog/admin/categories/${fresh.category.id}`, { method: "DELETE" });
    expect(blocked.status).toBe(409);

    overview = await call(admin, "/admin/overview");
    expect(overview.categoryTree.ops).toEqual(expect.arrayContaining([
      { type: "rename", level: 2, baljuoraId: "bj-ca", from: "캐나다 건강식품", to: "캐나다 영양제", doogoId: canada.id },
      { type: "add", level: 1, ref: `c:${fresh.category.id}`, name: "🍍 수입과일", doogoId: fresh.category.id, parentBaljuoraId: null, parentRef: null },
      { type: "add", level: 2, ref: `s:${mango.subcategory.id}`, name: "망고", doogoId: mango.subcategory.id, parentBaljuoraId: null, parentRef: `c:${fresh.category.id}` }
    ]));

    // 3) 카테고리만 보내기 작업 → 계획에 카테고리 맞추기(브랜드별 제외 이름 포함)
    const push = await call<{ code: string }>(admin, "/admin/jobs", "POST", { type: "push", productIds: [], categoryTree: true });
    const planRes = await app.fetch(new Request(`http://localhost/api/baljuora/runner/${push.code}`));
    const plan = ((await planRes.json()) as { data: { plan: { items: unknown[]; categoryTree: { ops: CategoryTreeOp[]; excludeNames: string[] }; categoryExclude: string[] } } }).data.plan;
    expect(plan.items).toEqual([]);
    expect(plan.categoryTree.ops).toHaveLength(overview.categoryTree.ops.length);
    expect(plan.categoryTree.excludeNames).toEqual(["브랜드별"]);
    expect(plan.categoryExclude).toEqual(["브랜드별"]);

    // 4) 책갈피 결과: 새로 만든 발주오라 카테고리 id → DB센터 연결, 다시 읽은 트리로 바꿈 → 보낼 것 없음
    const after = [
      ...TREE.slice(0, 2),
      { ...TREE[2], children: [{ id: "bj-ca", name: "캐나다 영양제", children: [] }, TREE[2].children[1]] },
      ...SEED_ROOTS,
      { id: "bj-new-1", name: "🍍 수입과일", children: [{ id: "bj-new-2", name: "망고", children: [] }] },
      TREE[3]
    ];
    const resultRes = await app.fetch(new Request(`http://localhost/api/baljuora/runner/${push.code}/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: "https://console.baljuora.com" },
      body: JSON.stringify({ final: true, items: [], categoryTree: { applied: plan.categoryTree.ops.map((op) => ({ key: op.type === "rename" ? `r:${op.baljuoraId}` : op.ref, type: op.type, name: op.type === "rename" ? op.to : op.name })), skipped: [], created: { [`c:${fresh.category.id}`]: "bj-new-1", [`s:${mango.subcategory.id}`]: "bj-new-2", "c:not-in-plan": "bj-evil" }, categories: flattenBaljuoraCategories(after), error: null } })
    }));
    expect(((await resultRes.json()) as { ok: boolean }).ok).toBe(true);
    overview = await call(admin, "/admin/overview");
    expect(overview.settings.categoryMap[fresh.category.id]).toBe("bj-new-1");
    expect(Object.values(overview.settings.categoryMap)).not.toContain("bj-evil");
    expect(overview.categoryTree.ops).toEqual([]);
    const job = await call<{ job: { status: string; progress: { message: string } } }>(admin, `/admin/jobs/${(await call<{ jobs: Array<{ id: string }> }>(admin, "/admin/overview")).jobs[0].id}`);
    expect(job.job.status).toBe("done");
    expect(job.job.progress.message).toContain("카테고리 반영 3건");
  });

  it("발주오라 카테고리를 읽기 전에는 카테고리만 보내기를 막고 비교를 먼저 하라고 알립니다", async () => {
    const admin = await adminToken();
    await executeSql("DELETE FROM baljuora_sync_store");
    const res = await fetchWithAuth(app, admin, "/api/baljuora/admin/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "push", productIds: [], categoryTree: true }) });
    const body = (await res.json()) as { ok: boolean; error?: { message?: string } };
    expect(body.ok).toBe(false);
    expect(body.error?.message).toContain("비교");
  });
});
