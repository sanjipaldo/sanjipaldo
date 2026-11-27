// 2026-11-27 관리자 요청 — "발주오라 전체 상품이 품절이든 미노출이든 2,998개인데 DB센터는 2,140개. 2,998개 전체를 DB센터로 가져오고
// 판매중·품절·미노출·전체 상품 수를 발주오라와 똑같이(상품도 다 가져와야)": 발주오라와 똑같이 맞추기(1차)
//   ① 이름 같은 상품 연결 ② 발주오라에만 있는 상품 가져오기(지운 상품 되살림, 발주오라 노출·품절 그대로) ③ 연결 상품의 품절·노출을 발주오라 값으로
//   + 마지막 비교 뒤 DB센터에서 지운 상품과 이어져 있던 발주오라 상품도 가져옴 · 공개 가격변동·품절이슈·신규상품에 남기지 않음 · 배포 때 한 번만
// 발주오라 쪽은 책갈피가 보내는 결과 JSON으로 흉내 냅니다(실제 발주오라에 접속하지 않음).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { BaljuoraProductSnapshot } from "@repo/shared/baljuora-sync";

process.env.SKYBASE_DB_ENDPOINT = `file:${join(mkdtempSync(join(tmpdir(), "baljuora-align-")), "test.db")}`;
const { default: app } = await import("../_core/create-app");
const { executeSql } = await import("../_core/db");
const { applyMigrations, fetchWithAuth, resetDatabase, signUpAndGetToken } = await import("../_test/helpers");
const { runAlignOnDeploy } = await import("../services/baljuora-align");
const { runDeployTasks } = await import("../services/deploy-tasks");

const CATEGORY = "cat-domestic-farm";
const CATEGORY_TREE = [{ id: "bj-cat-farm", name: "🥕 농산", children: [{ id: "bj-cat-fruit", name: "과일류", children: [] }] }];

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await resetDatabase();
  for (const table of ["baljuora_sync_jobs", "baljuora_sync_store", "external_product_links"]) await executeSql(`DELETE FROM ${table}`);
  await executeSql("DELETE FROM price_histories WHERE productId LIKE 'al-%' OR productId IN (SELECT id FROM products WHERE productCode LIKE 'AL-%')");
  await executeSql("DELETE FROM catalog_activity_logs WHERE productId LIKE 'al-%' OR productId IN (SELECT id FROM products WHERE productCode LIKE 'AL-%')");
  await executeSql("DELETE FROM products WHERE id LIKE 'al-%' OR productCode LIKE 'AL-%'");
  await executeSql("DELETE FROM content_settings WHERE key = 'new_products'");
  // 처음 설치 때 들어간 예시 상품은 지운 상품으로 둡니다(이 파일의 상품 수만 세게 — 테스트용 임시 DB).
  await executeSql("UPDATE products SET deletedAt = COALESCE(deletedAt, '2000-01-01T00:00:00.000Z'), isVisible = 0 WHERE id NOT LIKE 'al-%' AND (productCode IS NULL OR productCode NOT LIKE 'AL-%')");
});

const insert = (id: string, code: string, name: string, options: { visible?: boolean; soldOut?: boolean; seasonEnded?: boolean } = {}) => executeSql(
  "INSERT INTO products (id, productCode, name, imageUrl, supplierName, costPrice, aPrice, generalPrice, salePrice, salePriceMode, shippingType, categoryId, isVisible, isSoldOut, isSeasonEnded, isAlwaysOnSale, displayOrder) VALUES (?, ?, ?, NULL, '청도농원', 9000, 12000, 12000, NULL, 'autonomous', 'domestic', ?, ?, ?, ?, 1, 1)",
  [id, code, name, CATEGORY, options.visible === false ? 0 : 1, options.soldOut ? 1 : 0, options.seasonEnded ? 1 : 0]
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

async function runner(code: string, path = "", body?: unknown) {
  const res = await app.fetch(new Request(`http://localhost/api/baljuora/runner/${code}${path}`, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json", origin: "https://console.baljuora.com" }, body: JSON.stringify(body) }));
  return { status: res.status };
}

function snapshot(partial: Partial<BaljuoraProductSnapshot> & { id: string }): BaljuoraProductSnapshot {
  return { kind: "product", code: null, name: "", supplyPrice: 12000, consumerPrice: null, purchaseCost: 9000, groupPrice: null, imageUrls: [], isVisible: true, isSoldOut: false, updatedAt: "2026-11-27T00:00:00Z", categoryIds: ["bj-cat-fruit"], ...partial };
}

async function compare(admin: string, snapshots: BaljuoraProductSnapshot[]) {
  const created = await api<{ code: string }>(admin, "/api/baljuora/admin/jobs", "POST", { type: "compare", sales: false });
  expect(created.ok).toBe(true);
  await runner(created.data.code);
  const res = await runner(created.data.code, "/results", { final: true, categories: CATEGORY_TREE, snapshots });
  expect(res.status).toBe(200);
}

type Counts = { total: number; selling: number; soldOut: number; seasonEnded: number; visible: number; hidden: number };
type AlignView = {
  compared: boolean;
  doogo: Counts;
  baljuora: Counts & { unknown: number };
  linked: number;
  doogoOnly: { total: number };
  pending: { sameName: number; imports: number; importRestore: number; orphans: number; states: number; stateDetail: Record<string, number>; total: number };
  matched: boolean;
  last: { trigger: string; matched: boolean; totals: Record<string, number>; after: { doogo: Counts; baljuora: Counts } } | null;
};

const row = async (where: string, args: unknown[] = []) => ((await executeSql(`SELECT id, productCode, isVisible, isSoldOut, isSeasonEnded, deletedAt FROM products WHERE ${where}`, args)).rows[0] ?? null) as Record<string, unknown> | null;

// 연결 상품 4개(상태 다름 3) · 비교 전에 지운 상품 1 · 비교 뒤에 지운 상품 1 · 처음부터 없던 상품 2 · 이름 같은 상품 1 · 묶음 1
async function seed(admin: string) {
  await insert("al-a", "AL-A", "[본] 감귤 5kg");
  await insert("al-b", "AL-B", "[본] 사과 3kg", { seasonEnded: true });
  await insert("al-c", "AL-C", "[본] 배 5kg", { visible: false, soldOut: true });
  await insert("al-d", "AL-D", "[본] 단감 5kg");
  await insert("al-gone", "AL-GONE", "[본] 옛날 사과 3kg");
  await insert("al-orphan", "AL-ORPHAN", "[본] 키위 2kg");
  await insert("al-dbonly", "AL-DBONLY", "[본] 새 상품 2kg");
  await executeSql("UPDATE products SET isVisible = 0, deletedAt = ? WHERE id = 'al-gone'", [new Date().toISOString()]);
  await compare(admin, [
    snapshot({ id: "bj-a", code: "AL-A", name: "[본] 감귤 5kg", isSoldOut: true, isVisible: false }),
    snapshot({ id: "bj-b", code: "AL-B", name: "[본] 사과 3kg", isSoldOut: true }),
    snapshot({ id: "bj-c", code: "AL-C", name: "[본] 배 5kg" }),
    snapshot({ id: "bj-d", code: "AL-D", name: "[본] 단감 5kg" }),
    snapshot({ id: "bj-gone", code: "AL-GONE", name: "[본] 옛날 사과 3kg" }),
    snapshot({ id: "bj-orphan", code: "AL-ORPHAN", name: "[본] 키위 2kg", isSoldOut: true, isVisible: false }),
    snapshot({ id: "bj-never", code: "AL-NEVER", name: "[본] 처음 보는 상품 1kg" }),
    snapshot({ id: "bj-new2", code: "AL-NEW2", name: "[본] 단종 상품 1kg", isSoldOut: true, isVisible: false }),
    snapshot({ id: "bj-same", code: "AL-SAME", name: "[본]  새 상품 2kg " }),
    snapshot({ id: "bj-bundle", kind: "bundle", code: "AL-BUNDLE", name: "[묶음] 선물 세트" })
  ]);
  // 비교 뒤에 DB센터에서 지운 상품(연결 기록만 남음 — 예전에는 어디에도 세지 않았음)
  await executeSql("UPDATE products SET isVisible = 0, deletedAt = ? WHERE id = 'al-orphan'", [new Date(Date.now() + 1000).toISOString()]);
}

describe("발주오라와 똑같이 맞추기(1차)", () => {
  it("발주오라에만 있는 상품을 모두 가져오고 판매중·품절·미노출·전체 수를 발주오라와 똑같이 맞춥니다", async () => {
    const admin = await adminToken();
    await seed(admin);

    const before = await api<AlignView>(admin, "/api/baljuora/admin/align");
    expect(before.status).toBe(200);
    expect(before.data.compared).toBe(true);
    // 발주오라: 연결 4 + 발주오라에만 4 + 비교 뒤 지운 상품과 이어진 1(묶음 제외) = 9
    expect(before.data.baljuora).toMatchObject({ total: 9, selling: 5, soldOut: 4, visible: 6, hidden: 3, unknown: 0 });
    expect(before.data.doogo).toMatchObject({ total: 5, selling: 3, soldOut: 1, seasonEnded: 1, visible: 4, hidden: 1 });
    expect(before.data.doogoOnly.total).toBe(1);
    expect(before.data.pending).toMatchObject({ sameName: 1, imports: 4, importRestore: 2, orphans: 1, states: 3, total: 8 });
    expect(before.data.pending.stateDetail).toMatchObject({ soldOut: 1, seasonToSoldOut: 1, restock: 1, show: 1, hide: 1 });
    expect(before.data.matched).toBe(false);

    const ran = await api<{ done: boolean; busy: boolean; view: AlignView }>(admin, "/api/baljuora/admin/align/run", "POST");
    expect(ran.status).toBe(200);
    expect(ran.data.done).toBe(true);
    const last = ran.data.view.last!;
    expect(last.trigger).toBe("admin");
    expect(last.matched).toBe(true);
    expect(last.totals).toMatchObject({ linked: 1, imported: 4, restored: 2, created: 2, states: 3, failed: 0 });
    // 맞춘 뒤: DB센터 = 발주오라(전체·판매중·품절·노출·미노출), 상품 리스트 '품절' 칸(isSoldOut)까지 같음
    expect(last.after.doogo).toMatchObject({ total: 9, selling: 5, soldOut: 4, seasonEnded: 0, visible: 6, hidden: 3 });
    expect(last.after.baljuora).toMatchObject({ total: 9, selling: 5, soldOut: 4, visible: 6, hidden: 3 });

    // 연결 상품: 품절·노출을 발주오라 값으로, 발주오라 품절인 시즌종료 상품은 품절로
    expect(await row("id = 'al-a'")).toMatchObject({ isSoldOut: 1, isVisible: 0 });
    expect(await row("id = 'al-b'")).toMatchObject({ isSoldOut: 1, isSeasonEnded: 0, isVisible: 1 });
    expect(await row("id = 'al-c'")).toMatchObject({ isSoldOut: 0, isVisible: 1 });
    expect(await row("id = 'al-d'")).toMatchObject({ isSoldOut: 0, isVisible: 1 });
    // 지운 상품은 되살리고(비교 전에 지운 것·비교 뒤에 지운 것 모두) 발주오라 노출·품절 그대로
    expect(await row("id = 'al-gone'")).toMatchObject({ deletedAt: null, isVisible: 1, isSoldOut: 0 });
    expect(await row("id = 'al-orphan'")).toMatchObject({ deletedAt: null, isVisible: 0, isSoldOut: 1 });
    // 처음 보는 상품은 새로 등록(발주오라 노출 상품은 공개, 미노출·품절은 숨김·품절)
    const never = await row("productCode = 'AL-NEVER' AND deletedAt IS NULL");
    const new2 = await row("productCode = 'AL-NEW2' AND deletedAt IS NULL");
    expect(never).toMatchObject({ isVisible: 1, isSoldOut: 0 });
    expect(new2).toMatchObject({ isVisible: 0, isSoldOut: 1 });
    // 이름 같은 DB센터에만 있던 상품은 그 발주오라 상품과 연결(상품코드를 발주오라 코드로)
    expect(await row("id = 'al-dbonly'")).toMatchObject({ productCode: "AL-SAME" });
    // 묶음 상품은 가져오지 않음
    expect(await row("productCode = 'AL-BUNDLE'")).toBeNull();

    // 공개 '가격변동'·'품절이슈'·'신규상품'에 오늘 일로 남기지 않음
    const ids = ["al-a", "al-b", "al-c", "al-gone", "al-orphan", String(never!.id), String(new2!.id)];
    const marks = ids.map(() => "?").join(",");
    expect(Number(((await executeSql(`SELECT COUNT(*) AS n FROM price_histories WHERE productId IN (${marks})`, ids)).rows[0] as Record<string, unknown>).n)).toBe(0);
    expect(Number(((await executeSql(`SELECT COUNT(*) AS n FROM catalog_activity_logs WHERE productId IN (${marks})`, ids)).rows[0] as Record<string, unknown>).n)).toBe(0);
    const newProducts = JSON.parse(String(((await executeSql("SELECT value FROM content_settings WHERE key = 'new_products'")).rows[0] as Record<string, unknown>).value)) as { days: number; hidden: string[] };
    expect(newProducts.days).toBe(7);
    expect(newProducts.hidden.sort()).toEqual([String(never!.id), String(new2!.id)].sort());

    // 모두 연결되고 더 할 일이 없음
    const after = await api<AlignView>(admin, "/api/baljuora/admin/align");
    expect(after.data.pending.total).toBe(0);
    expect(after.data.matched).toBe(true);
    expect(after.data.linked).toBe(9);
    expect(after.data.doogoOnly.total).toBe(0);
    const reconcile = await api<{ baljuora: Counts; doogo: Counts; baljuoraOnly: { total: number } }>(admin, "/api/baljuora/admin/reconcile");
    expect(reconcile.data.baljuoraOnly.total).toBe(0);
    expect(reconcile.data.doogo).toMatchObject({ total: 9, soldOut: 4, visible: 6 });
    expect(reconcile.data.baljuora).toMatchObject({ total: 9, soldOut: 4, visible: 6 });

    // 다음 비교에서도 같은 상품으로 이어지고 차이가 다시 생기지 않음
    await compare(admin, [
      snapshot({ id: "bj-a", code: "AL-A", name: "[본] 감귤 5kg", isSoldOut: true, isVisible: false }),
      snapshot({ id: "bj-b", code: "AL-B", name: "[본] 사과 3kg", isSoldOut: true }),
      snapshot({ id: "bj-c", code: "AL-C", name: "[본] 배 5kg" }),
      snapshot({ id: "bj-d", code: "AL-D", name: "[본] 단감 5kg" }),
      snapshot({ id: "bj-gone", code: "AL-GONE", name: "[본] 옛날 사과 3kg" }),
      snapshot({ id: "bj-orphan", code: "AL-ORPHAN", name: "[본] 키위 2kg", isSoldOut: true, isVisible: false }),
      snapshot({ id: "bj-never", code: "AL-NEVER", name: "[본] 처음 보는 상품 1kg" }),
      snapshot({ id: "bj-new2", code: "AL-NEW2", name: "[본] 단종 상품 1kg", isSoldOut: true, isVisible: false }),
      snapshot({ id: "bj-same", code: "AL-SAME", name: "[본]  새 상품 2kg " }),
      snapshot({ id: "bj-bundle", kind: "bundle", code: "AL-BUNDLE", name: "[묶음] 선물 세트" })
    ]);
    const again = await api<AlignView>(admin, "/api/baljuora/admin/align");
    expect(again.data.pending.total).toBe(0);
    expect(again.data.matched).toBe(true);
    expect(again.data.baljuora.total).toBe(9);
  });

  it("운영 배포 때는 한 번만 끝까지 맞추고(같은 작업은 다시 안 함), 운영 빌드가 아니면 하지 않습니다", async () => {
    const admin = await adminToken();
    await seed(admin);
    const first = await runAlignOnDeploy({ taskKey: "test-align-once", maxMs: 60_000 });
    expect(first.result).toMatch(/^done: .*matched=true$/);
    const view = await api<AlignView>(admin, "/api/baljuora/admin/align");
    expect(view.data.last?.trigger).toBe("deploy");
    expect(view.data.pending.total).toBe(0);
    expect(view.data.doogo).toMatchObject({ total: 9, soldOut: 4, visible: 6 });
    // DB센터에서 다시 바뀌어도 같은 배포 작업은 다시 돌지 않음(관리자 화면 버튼으로)
    await executeSql("UPDATE products SET isVisible = 0 WHERE id = 'al-d'");
    const second = await runAlignOnDeploy({ taskKey: "test-align-once", maxMs: 60_000 });
    expect(second).toMatchObject({ skipped: "already done" });
    expect(await row("id = 'al-d'")).toMatchObject({ isVisible: 0 });
    const previous = process.env.VERCEL_ENV;
    delete process.env.VERCEL_ENV;
    expect(await runDeployTasks()).toEqual([{ skipped: "not a production build" }]);
    if (previous !== undefined) process.env.VERCEL_ENV = previous;
  });

  it("비교 전에는 맞추지 않고, 로그인 없이는 쓸 수 없습니다", async () => {
    const admin = await adminToken();
    const notCompared = await api<unknown>(admin, "/api/baljuora/admin/align/run", "POST");
    expect(notCompared.status).toBe(400);
    expect(notCompared.message).toContain("발주오라 상품 불러오기(비교)");
    const deployNoCompare = await runAlignOnDeploy({ taskKey: "test-no-compare", maxMs: 10_000 });
    expect(deployNoCompare.result).toMatch(/^skipped: /);
    const anonymousGet = await app.fetch(new Request("http://localhost/api/baljuora/admin/align"));
    expect(anonymousGet.status).toBe(401);
    const anonymousRun = await app.fetch(new Request("http://localhost/api/baljuora/admin/align/run", { method: "POST" }));
    expect(anonymousRun.status).toBe(401);
  });
});
