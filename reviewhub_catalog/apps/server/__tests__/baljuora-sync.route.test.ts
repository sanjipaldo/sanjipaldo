// 발주오라 수동 동기화(2026-11-22): 관리자가 작업을 만들고 → 발주오라 창(책갈피 스크립트)이 작업 코드로 받아 실행하고 결과를 돌려주면
// 서버가 상품 연결·기준을 저장하고 변경 목록을 계산합니다. 발주오라 쪽은 이 테스트에서 결과 JSON으로 흉내 냅니다.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { categoryMatches, diffBaljuoraProduct, doogoSyncValues, flattenBaljuoraCategories, suggestCategoryMapping, type BaljuoraProductSnapshot } from "@repo/shared/baljuora-sync";

process.env.SKYBASE_DB_ENDPOINT = `file:${join(mkdtempSync(join(tmpdir(), "baljuora-sync-")), "test.db")}`;
const { default: app } = await import("../_core/create-app");
const { executeSql } = await import("../_core/db");
const { applyMigrations, fetchWithAuth, resetDatabase, signUpAndGetToken } = await import("../_test/helpers");

const CATEGORY = "cat-domestic-farm";
const BJ_UUID = "019f0c7e-5086-77ee-bcb5-985f7e863f46";

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await resetDatabase();
  await executeSql("DELETE FROM baljuora_sync_jobs");
  await executeSql("DELETE FROM baljuora_sync_store");
  await executeSql("DELETE FROM external_product_links");
  await executeSql("DELETE FROM price_histories WHERE productId LIKE 'bj-test-%' OR productId = ?", [`baljuora-${BJ_UUID}`]);
  await executeSql("DELETE FROM catalog_activity_logs WHERE productId LIKE 'bj-test-%' OR productId = ?", [`baljuora-${BJ_UUID}`]);
  await executeSql("DELETE FROM product_options WHERE productId LIKE 'bj-test-%'");
  await executeSql("DELETE FROM products WHERE id LIKE 'bj-test-%' OR id = ? OR productCode LIKE 'BJT-%'", [`baljuora-${BJ_UUID}`]);
  const insert = "INSERT INTO products (id, productCode, name, imageUrl, supplierName, costPrice, aPrice, generalPrice, salePrice, salePriceMode, shippingType, categoryId, isVisible, isSoldOut, isAlwaysOnSale, displayOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'domestic', ?, ?, 0, 1, ?)";
  await executeSql(insert, ["bj-test-1", "BJT-001", "봄날 사과 5kg", "https://example.com/apple.jpg", "봄날농원", 20000, 24000, 26000, 39000, "fixed", CATEGORY, 1, 1]);
  await executeSql(insert, [`baljuora-${BJ_UUID}`, "BJT-002", "봄날 배 7.5kg", null, "봄날농원", 30000, 0, 38000, null, "autonomous", CATEGORY, 1, 2]);
  await executeSql(insert, ["bj-test-3", "BJT-003", "이웃 감귤 3kg", null, "봄날농원", 9000, 11000, 12000, null, "autonomous", CATEGORY, 1, 3]);
  await executeSql(insert, ["bj-test-4", "BJT-004", "숨긴 상품", null, null, 1000, 0, 2000, null, "autonomous", CATEGORY, 0, 4]);
});

async function adminToken() {
  const user = await signUpAndGetToken(app);
  await executeSql("UPDATE user SET role = ?, emailVerified = 1 WHERE id = ?", ["admin", user.userId!]);
  return user.token;
}

async function json<T>(res: Response) {
  return (await res.json()) as { ok: boolean; data: T; error?: { message?: string } };
}

function post(path: string, body: unknown) {
  return app.fetch(new Request(`http://localhost${path}`, { method: "POST", headers: { "Content-Type": "application/json", origin: "https://console.baljuora.com" }, body: JSON.stringify(body) }));
}

function snapshot(partial: Partial<BaljuoraProductSnapshot> & { id: string }): BaljuoraProductSnapshot {
  return { kind: "product", code: null, name: "", supplyPrice: null, consumerPrice: null, purchaseCost: null, imageUrls: [], isVisible: true, isSoldOut: false, updatedAt: "2026-11-22T00:00:00Z", ...partial };
}

const CATEGORY_TREE = [
  { id: "bj-cat-farm", name: "🥕 농산", children: [{ id: "bj-cat-fruit", name: "과일류", children: [] }] },
  { id: "bj-cat-sea", name: "🐟 수산", children: [] }
];

async function startCompare(admin: string) {
  const created = await json<{ job: { id: string; status: string }; code: string; consoleUrl: string }>(await fetchWithAuth(app, admin, "/api/baljuora/admin/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "compare" }) }));
  expect(created.ok).toBe(true);
  return created.data;
}

describe("발주오라 동기화 규칙", () => {
  it("DB센터 값 → 발주오라 값: 수강생 단가가 없으면 일반공급가, 자율 판매가는 소비자가 없음, 0원 원가는 보내지 않음", () => {
    const values = doogoSyncValues({ id: "p", productCode: " A-1 ", name: " 사과  5kg ", generalPrice: 26000, aPrice: 0, salePrice: 39000, salePriceMode: "autonomous", costPrice: 0, categoryId: "c1", imageUrl: null }, { c1: "bj-1" });
    expect(values).toMatchObject({ code: "A-1", name: "사과 5kg", supplyPrice: 26000, groupPrice: 26000, consumerPrice: null, purchaseCost: null, baljuoraCategoryId: "bj-1" });
  });

  it("발주오라 하위 카테고리 상품은 연결한 상위 카테고리와 맞는 것으로 봅니다", () => {
    const categories = flattenBaljuoraCategories(CATEGORY_TREE);
    expect(categories.map((category) => category.path)).toContain("🥕 농산 > 과일류");
    expect(categoryMatches(["bj-cat-fruit"], "bj-cat-farm", categories)).toBe(true);
    expect(categoryMatches(["bj-cat-sea"], "bj-cat-farm", categories)).toBe(false);
    expect(suggestCategoryMapping([{ id: CATEGORY, name: "농산" }, { id: "x", name: "없는 카테고리" }], categories, {})).toEqual({ [CATEGORY]: "bj-cat-farm" });
  });

  it("방향: 기준 이후 DB센터만 바뀌면 push, 발주오라만 바뀌면 pull, 처음 비교는 initial", () => {
    const values = doogoSyncValues({ id: "p", productCode: "A", name: "사과", generalPrice: 27000, aPrice: 24000, salePrice: null, salePriceMode: "autonomous", costPrice: 20000, categoryId: null, imageUrl: null }, {});
    const snap = snapshot({ id: "b", code: "A", name: "사과", supplyPrice: 26000, purchaseCost: 21000, groupPrice: 24000 });
    expect(diffBaljuoraProduct(values, { snapshot: snap, baseline: null }, []).map((diff) => [diff.field, diff.direction])).toEqual([["supplyPrice", "initial"], ["purchaseCost", "initial"]]);
    const baseline = { doogo: { supplyPrice: 26000, purchaseCost: 20000 }, baljuora: { supplyPrice: 26000, purchaseCost: 20000 }, pushedImageUrl: null, at: "x" };
    const diffs = diffBaljuoraProduct(values, { snapshot: snap, baseline }, []);
    expect(diffs.find((diff) => diff.field === "supplyPrice")?.direction).toBe("push");
    expect(diffs.find((diff) => diff.field === "purchaseCost")?.direction).toBe("pull");
    // "이대로 두기"한 값은 같은 값이면 다시 나오지 않습니다.
    const ignored = { supplyPrice: { doogo: 27000, baljuora: 26000 } };
    expect(diffBaljuoraProduct(values, { snapshot: snap, baseline, ignored }, []).map((diff) => diff.field)).toEqual(["purchaseCost"]);
  });
});

describe("발주오라 동기화 API", () => {
  it("관리자 API는 로그인한 관리자만, 책갈피 API는 맞는 작업 코드로만 씁니다", async () => {
    expect((await app.fetch(new Request("http://localhost/api/baljuora/admin/overview"))).status).toBe(401);
    expect((await app.fetch(new Request("http://localhost/api/baljuora/runner/ABCDE23456"))).status).toBe(404);
    const admin = await adminToken();
    const job = await startCompare(admin);
    expect(job.code).toMatch(/^[2-9A-HJ-NP-Z]{10}$/);
    expect(job.consoleUrl).toBe(`https://console.baljuora.com/doogobiz24/dashboard#doogo-sync=${job.code}`);
    // 만료된 코드는 쓸 수 없습니다.
    await executeSql("UPDATE baljuora_sync_jobs SET expiresAt = ? WHERE id = ?", ["2000-01-01T00:00:00.000Z", job.job.id]);
    const expired = await app.fetch(new Request(`http://localhost/api/baljuora/runner/${job.code}`));
    expect(expired.status).toBe(409);
  });

  it("진행 중인 작업 코드는 책갈피가 진행·결과를 보낼 때마다 만료를 30분 뒤로 미룹니다(2026-11-27: 429로 쉬어 가는 긴 작업)", async () => {
    const admin = await adminToken();
    const job = await startCompare(admin);
    const expiresOf = async () => String((await executeSql("SELECT expiresAt FROM baljuora_sync_jobs WHERE id = ?", [job.job.id])).rows[0]?.expiresAt);
    // 기다리는 작업(아직 시작 안 함)은 만들 때 정한 만료 그대로
    const created = await expiresOf();
    expect(Date.parse(created) - Date.now()).toBeGreaterThan(29 * 60_000);
    expect((await app.fetch(new Request(`http://localhost/api/baljuora/runner/${job.code}`))).status).toBe(200); // 시작 → running
    // 25분이 지나 5분 남은 것처럼 만들고 진행을 보내면 다시 30분 뒤로
    const soon = new Date(Date.now() + 5 * 60_000).toISOString();
    await executeSql("UPDATE baljuora_sync_jobs SET expiresAt = ? WHERE id = ?", [soon, job.job.id]);
    expect((await post(`/api/baljuora/runner/${job.code}/progress`, { done: 10, total: 2000, message: "발주오라가 '요청이 너무 많다'고 해 2초 쉬었다가 이어서 보내요" })).status).toBe(200);
    const extended = await expiresOf();
    expect(Date.parse(extended) - Date.now()).toBeGreaterThan(29 * 60_000);
    // 남은 시간이 절반(15분) 넘게 있으면 다시 적지 않음
    expect((await post(`/api/baljuora/runner/${job.code}/progress`, { done: 11, total: 2000, message: "수정 12 / 2000" })).status).toBe(200);
    expect(await expiresOf()).toBe(extended);
    // 소식이 끊겨 만료가 지난 진행 중 작업은 쓸 수 없음
    await executeSql("UPDATE baljuora_sync_jobs SET expiresAt = ? WHERE id = ?", ["2000-01-01T00:00:00.000Z", job.job.id]);
    expect((await post(`/api/baljuora/runner/${job.code}/progress`, { done: 12, total: 2000, message: "늦은 소식" })).status).toBe(409);
  });

  it("진행 확인(light)은 만료가 지난 작업을 그 작업만 만료로 바꾸고, 끝난 작업에는 늦은 진행 소식을 적지 않습니다(2026-11-27)", async () => {
    const admin = await adminToken();
    const job = await startCompare(admin);
    expect((await app.fetch(new Request(`http://localhost/api/baljuora/runner/${job.code}`))).status).toBe(200);
    await executeSql("UPDATE baljuora_sync_jobs SET expiresAt = ? WHERE id = ?", ["2000-01-01T00:00:00.000Z", job.job.id]);
    const light = await json<{ job: { status: string; finishedAt: string | null } }>(await fetchWithAuth(app, admin, `/api/baljuora/admin/jobs/${job.job.id}?light=1`));
    expect(light.data.job.status).toBe("expired");
    expect(light.data.job.finishedAt).toBeTruthy();
    expect(String((await executeSql("SELECT status FROM baljuora_sync_jobs WHERE id = ?", [job.job.id])).rows[0]?.status)).toBe("expired");
    // 끝난 작업에 늦게 온 진행 소식은 거절하고 상태를 '진행 중'으로 되돌리지 않음
    const other = await startCompare(admin);
    expect((await app.fetch(new Request(`http://localhost/api/baljuora/runner/${other.code}`))).status).toBe(200);
    expect((await post(`/api/baljuora/runner/${other.code}/results`, { final: true, snapshots: [] })).status).toBe(200);
    expect((await post(`/api/baljuora/runner/${other.code}/progress`, { done: 1, total: 1, message: "늦은 소식" })).status).toBe(409);
    expect(String((await executeSql("SELECT status FROM baljuora_sync_jobs WHERE id = ?", [other.job.id])).rows[0]?.status)).toBe("done");
    expect((await fetchWithAuth(app, admin, "/api/baljuora/admin/jobs/no-such-job?light=1")).status).toBe(404);
  });

  it("작업 코드 다시 받기(2026-11-25): 기다리는 작업에 새 코드를 주고 예전 코드는 막으며, 시작한 작업·로그인 없는 요청은 거절합니다", async () => {
    const admin = await adminToken();
    const job = await startCompare(admin);
    expect((await app.fetch(new Request(`http://localhost/api/baljuora/admin/jobs/${job.job.id}/code`, { method: "POST" }))).status).toBe(401);
    const reissued = await json<{ job: { id: string; status: string }; code: string; consoleUrl: string }>(await fetchWithAuth(app, admin, `/api/baljuora/admin/jobs/${job.job.id}/code`, { method: "POST" }));
    expect(reissued.ok).toBe(true);
    expect(reissued.data.job).toMatchObject({ id: job.job.id, status: "waiting" });
    expect(reissued.data.code).toMatch(/^[2-9A-HJ-NP-Z]{10}$/);
    expect(reissued.data.code).not.toBe(job.code);
    expect(reissued.data.consoleUrl).toBe(`https://console.baljuora.com/doogobiz24/dashboard#doogo-sync=${reissued.data.code}`);
    // 예전 코드는 더 이상 찾을 수 없고, 새 코드는 가운데 줄·소문자로 넣어도 됩니다(책갈피 입력창).
    expect((await app.fetch(new Request(`http://localhost/api/baljuora/runner/${job.code}`))).status).toBe(404);
    const typed = `${reissued.data.code.slice(0, 5)}-${reissued.data.code.slice(5)}`.toLowerCase();
    const started = await app.fetch(new Request(`http://localhost/api/baljuora/runner/${encodeURIComponent(typed)}`));
    expect(started.status).toBe(200);
    // 책갈피가 시작한 작업은 그 창이 코드로 진행·결과를 보내므로 코드를 바꾸지 않습니다.
    const again = await fetchWithAuth(app, admin, `/api/baljuora/admin/jobs/${job.job.id}/code`, { method: "POST" });
    expect(again.status).toBe(409);
    expect((await fetchWithAuth(app, admin, "/api/baljuora/admin/jobs/no-such-job/code", { method: "POST" })).status).toBe(409);
  });

  it("비교 → 상품코드·예전 id로 연결 → 변경 목록 → 동기화 결과 반영까지", async () => {
    const admin = await adminToken();
    const compare = await startCompare(admin);
    const plan = await json<{ type: string; plan: { type: string; detailIds: string[] } }>(await app.fetch(new Request(`http://localhost/api/baljuora/runner/${compare.code}`)));
    expect(plan.ok).toBe(true);
    expect(plan.data.plan.detailIds).toContain(BJ_UUID);

    const first = await json<{ linked: number }>(await post(`/api/baljuora/runner/${compare.code}/results`, {
      final: false,
      categories: CATEGORY_TREE,
      group: { id: "grp-1", name: "황금농부 수강생" },
      snapshots: [
        snapshot({ id: "bj-a", code: "BJT-001", name: "봄날 사과 5kg", supplyPrice: 26000, consumerPrice: 39000, purchaseCost: 20000, groupPrice: 24000, categoryIds: ["bj-cat-fruit"], imageUrls: ["https://files.baljuora.com/a.jpg"] }),
        snapshot({ id: BJ_UUID, code: "OLD-CODE", name: "봄날 배 7.5kg", supplyPrice: 37000, purchaseCost: 30000, groupPrice: null, categoryIds: ["bj-cat-farm"] }),
        snapshot({ id: "bj-only", code: "BJT-999", name: "발주오라에만 있는 상품", supplyPrice: 5000, categoryIds: ["bj-cat-fruit"] }),
        snapshot({ id: "bj-bundle", kind: "bundle", name: "묶음" })
      ]
    }));
    expect(first.data.linked).toBe(2);
    await post(`/api/baljuora/runner/${compare.code}/results`, { final: true, snapshots: [], diagnostics: { structure: { productList: { id: "string" } } } });

    const done = await json<{ job: { status: string; summary: Record<string, number> } }>(await fetchWithAuth(app, admin, `/api/baljuora/admin/jobs/${compare.job.id}`));
    expect(done.data.job.status).toBe("done");
    expect(done.data.job.summary).toMatchObject({ received: 4, linked: 2, baljuoraOnly: 1, bundles: 1 });

    // 카테고리는 이름이 같은 발주오라 카테고리와 자동으로 연결됩니다.
    const overview = await json<{ settings: { categoryMap: Record<string, string> }; group: { id: string } | null; linkedCount: number }>(await fetchWithAuth(app, admin, "/api/baljuora/admin/overview"));
    expect(overview.data.settings.categoryMap[CATEGORY]).toBe("bj-cat-farm");
    expect(overview.data.group?.id).toBe("grp-1");
    expect(overview.data.linkedCount).toBe(2);

    type Changes = { compared: boolean; groupPriceReadable: boolean; items: Array<{ productId: string; kind: string; newSupplier?: boolean; diffs: Array<{ field: string; direction: string }> }>; baljuoraOnly: Array<{ id: string }> };
    let changes = await json<Changes>(await fetchWithAuth(app, admin, "/api/baljuora/admin/changes"));
    expect(changes.data.compared).toBe(true);
    expect(changes.data.groupPriceReadable).toBe(true); // 비교 때 매출처 그룹 공급가를 읽은 상품이 있음
    const byId = new Map(changes.data.items.map((item) => [item.productId, item]));
    expect(byId.has("bj-test-1")).toBe(false); // 값이 모두 같음
    expect(byId.get(`baljuora-${BJ_UUID}`)?.diffs.map((diff) => `${diff.field}:${diff.direction}`)).toEqual(["supplyPrice:initial"]);
    expect(byId.get("bj-test-3")?.kind).toBe("new");
    expect(byId.get("bj-test-3")).toMatchObject({ newSupplier: false }); // 같은 매입처(봄날농원) 상품이 발주오라와 연결돼 있음
    expect(byId.get("bj-test-4")?.kind).toBe("new"); // 숨긴 상품도 목록에는 있고 화면에서 거릅니다
    expect(changes.data.baljuoraOnly.map((item) => item.id)).toEqual(["bj-only"]);

    // 관리자가 DB센터에서 가격·카테고리를 바꾸면 "DB센터에서 바뀜"으로 보입니다.
    await executeSql("UPDATE products SET generalPrice = 27000 WHERE id = 'bj-test-1'");
    changes = await json<Changes>(await fetchWithAuth(app, admin, "/api/baljuora/admin/changes"));
    // base = 마지막으로 맞춘 값(기준): 그때는 양쪽 26,000원 → DB센터만 27,000원으로 바뀜('보낼 변경' 상세 팝업, 2026-11-27)
    expect(changes.data.items.find((item) => item.productId === "bj-test-1")?.diffs).toEqual([{ field: "supplyPrice", doogo: 27000, baljuora: 26000, direction: "push", base: { doogo: 26000, baljuora: 26000 } }]);

    // 동기화 작업: 수정 1개 + 신규 1개(같은 매입처의 연결 상품에서 설정을 복사)
    const push = await json<{ job: { id: string; total: number }; code: string }>(await fetchWithAuth(app, admin, "/api/baljuora/admin/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "push", productIds: ["bj-test-1", "bj-test-3"] }) }));
    expect(push.ok).toBe(true);
    expect(push.data.job.total).toBe(2);
    const pushPlan = await json<{ plan: { items: Array<{ productId: string; action: string; fields: string[]; templateId: string | null; templateMatch?: string | null; supplierName?: string | null; baljuoraId: string | null; values: Record<string, unknown> }> } }>(await app.fetch(new Request(`http://localhost/api/baljuora/runner/${push.data.code}`)));
    const update = pushPlan.data.plan.items.find((item) => item.productId === "bj-test-1");
    const create = pushPlan.data.plan.items.find((item) => item.productId === "bj-test-3");
    expect(update).toMatchObject({ action: "update", baljuoraId: "bj-a", fields: ["supplyPrice"] });
    expect(create?.action).toBe("create");
    expect(create?.templateId).toBe("bj-a");
    expect(create).toMatchObject({ templateMatch: "supplier", supplierName: "봄날농원" });
    expect(create?.values).toMatchObject({ supplyPrice: 12000, groupPrice: 11000, categoryId: "bj-cat-farm", isTaxable: false });
    // 연결된 발주오라 카테고리 전체(책갈피 1.9.1이 '이미 같은 카테고리'·저장 확인에 씀)
    expect(create?.values.categoryIds).toEqual(["bj-cat-farm"]);
    // 진행 확인(light, 2026-11-27 동기화 속도): 상품별 결과·기술 정보 없이 진행·보낼 상품 수만(보낼 상품 수는 DB가 plan에서 꺼냄)
    const running = await json<{ job: { status: string; total: number | null; progress: { total: number } | null; items?: unknown; diagnostics?: unknown } }>(await fetchWithAuth(app, admin, `/api/baljuora/admin/jobs/${push.data.job.id}?light=1`));
    expect(running.data.job).toMatchObject({ status: "running", total: 2, progress: { total: 2 } });
    expect(running.data.job.items).toBeUndefined();
    expect(running.data.job.diagnostics).toBeUndefined();

    // 다른 상품 결과는 받지 않습니다(작업에 든 상품만). 끝나면 속도 요약을 한 줄 남깁니다(값·토큰 없음).
    const infoLines: string[] = [];
    const infoSpy = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => { infoLines.push(args.map(String).join(" ")); });
    await post(`/api/baljuora/runner/${push.data.code}/results`, {
      final: true,
      diagnostics: { version: "1.9.2", structure: {}, throttled: 1, gapMs: 180, extra: { concurrency: 3 }, stats: { requests: 9, writes: 3, avgMs: 310, maxMs: 900, pausedSeconds: 2, concurrency: 3, resultPosts: 1, resultRetries: 0, rateHeaders: ["x-ratelimit-remaining"] } },
      final: true,
      items: [
        { productId: "bj-test-1", ok: true, applied: ["supplyPrice"], snapshot: snapshot({ id: "bj-a", code: "BJT-001", name: "봄날 사과 5kg", supplyPrice: 27000, consumerPrice: 39000, purchaseCost: 20000, groupPrice: 24000, categoryIds: ["bj-cat-fruit"], imageUrls: ["https://files.baljuora.com/a.jpg"] }) },
        { productId: "bj-test-3", ok: false, error: "발주오라 응답 400: supplierId should not be empty" },
        { productId: "bj-test-4", ok: true, baljuoraId: "evil" }
      ]
    });
    infoSpy.mockRestore();
    const summaryLine = infoLines.find((line) => line.startsWith("[baljuora-sync] push summary "));
    expect(summaryLine).toBeTruthy();
    expect(JSON.parse(summaryLine!.slice("[baljuora-sync] push summary ".length))).toMatchObject({ status: "done", version: "1.9.2", items: 2, ok: 1, failed: 1, throttled: 1, gapMs: 180, requests: 9, writes: 3, avgMs: 310, maxMs: 900, pausedSeconds: 2, concurrency: 3, rateHeaders: ["x-ratelimit-remaining"] });
    const pushed = await json<{ job: { status: string; summary: Record<string, number>; items: Array<{ productId: string; ok: boolean; error: string | null }> } }>(await fetchWithAuth(app, admin, `/api/baljuora/admin/jobs/${push.data.job.id}`));
    expect(pushed.data.job.status).toBe("done");
    // 작업 목록·동기화 화면(가볍게 읽기)도 보낼 상품 수를 그대로 보여 줌(끝난 작업은 summary.total)
    const listed = await json<{ jobs: Array<{ id: string; total: number | null; items?: unknown }> }>(await fetchWithAuth(app, admin, "/api/baljuora/admin/jobs"));
    expect(listed.data.jobs.find((entry) => entry.id === push.data.job.id)).toMatchObject({ total: 2 });
    expect(listed.data.jobs.every((entry) => entry.items === undefined)).toBe(true);
    const overviewJobs = await json<{ jobs: Array<{ id: string; total: number | null }> }>(await fetchWithAuth(app, admin, "/api/baljuora/admin/overview"));
    expect(overviewJobs.data.jobs.find((entry) => entry.id === push.data.job.id)).toMatchObject({ total: 2 });
    expect(pushed.data.job.summary).toMatchObject({ total: 2, succeeded: 1, failed: 1, updated: 1 });
    expect(pushed.data.job.items.map((item) => item.productId).sort()).toEqual(["bj-test-1", "bj-test-3"]);
    changes = await json<Changes>(await fetchWithAuth(app, admin, "/api/baljuora/admin/changes"));
    expect(changes.data.items.some((item) => item.productId === "bj-test-1")).toBe(false);
    const links = await executeSql("SELECT productId FROM external_product_links WHERE externalProductId = 'evil'");
    expect(links.rows.length).toBe(0);

    // 끝난 작업 코드는 다시 쓸 수 없습니다.
    expect((await app.fetch(new Request(`http://localhost/api/baljuora/runner/${push.data.code}`))).status).toBe(409);
  });

  it("상품 수정 창: 마지막 비교·동기화 때 읽은 발주오라 가격(공급가·황금농부 그룹 공급가·매입원가)을 관리자만 봅니다", async () => {
    expect((await app.fetch(new Request("http://localhost/api/baljuora/admin/products/bj-test-1"))).status).toBe(401);
    const admin = await adminToken();
    type Prices = { linked: boolean; baljuoraId: string | null; code: string | null; groupKeyword: string; syncedAt: string | null; supplyPrice: number | null; groupPrice: number | null; groupPriceKnown: boolean; purchaseCost: number | null };
    const before = await json<Prices>(await fetchWithAuth(app, admin, "/api/baljuora/admin/products/bj-test-1"));
    expect(before.data).toMatchObject({ linked: false, groupKeyword: "황금농부", supplyPrice: null, groupPriceKnown: false });

    const compare = await startCompare(admin);
    await post(`/api/baljuora/runner/${compare.code}/results`, {
      final: true,
      categories: CATEGORY_TREE,
      group: { id: "grp-1", name: "황금농부 수강생" },
      snapshots: [
        snapshot({ id: "bj-a", code: "BJT-001", name: "봄날 사과 5kg", supplyPrice: 26000, consumerPrice: 39000, purchaseCost: 20000, groupPrice: 23500, categoryIds: ["bj-cat-fruit"] }),
        snapshot({ id: BJ_UUID, code: "BJT-002", name: "봄날 배 7.5kg", supplyPrice: 38000, purchaseCost: 30000, groupPrice: null }),
        snapshot({ id: "bj-c", code: "BJT-003", name: "이웃 감귤 3kg", supplyPrice: 12000, purchaseCost: null })
      ]
    });
    const apple = await json<Prices>(await fetchWithAuth(app, admin, "/api/baljuora/admin/products/bj-test-1"));
    expect(apple.data).toMatchObject({ linked: true, baljuoraId: "bj-a", code: "BJT-001", supplyPrice: 26000, groupPrice: 23500, groupPriceKnown: true, purchaseCost: 20000 });
    expect(apple.data.syncedAt).toBeTruthy();
    // 황금농부 개별공급가가 없으면 null(수강생도 공급가로 삼), 읽지 못했으면 groupPriceKnown=false
    const pear = await json<Prices>(await fetchWithAuth(app, admin, `/api/baljuora/admin/products/baljuora-${BJ_UUID}`));
    expect(pear.data).toMatchObject({ linked: true, groupPrice: null, groupPriceKnown: true });
    const tangerine = await json<Prices>(await fetchWithAuth(app, admin, "/api/baljuora/admin/products/bj-test-3"));
    expect(tangerine.data).toMatchObject({ linked: true, supplyPrice: 12000, groupPrice: null, groupPriceKnown: false, purchaseCost: null });
  });

  it("예전 비교라 황금농부 공급가·매입원가를 모르는 상품은 보낼 때 가격 3종을 모두 넣습니다(약과 사례, 같은 칸은 책갈피가 건너뜀)", async () => {
    const admin = await adminToken();
    const compare = await startCompare(admin);
    // 1.2.0 이전 책갈피처럼 groupPrice 칸 없이 들어온 연결(bj-test-3: 일반공급가 12,000 · 수강생 단가 11,000)
    await post(`/api/baljuora/runner/${compare.code}/results`, { final: true, categories: CATEGORY_TREE, group: { id: "grp-1", name: "황금농부 수강생" }, snapshots: [snapshot({ id: "bj-c", code: "BJT-003", name: "이웃 감귤 3kg", supplyPrice: 11500, purchaseCost: 9000 })] });
    const push = await json<{ code: string }>(await fetchWithAuth(app, admin, "/api/baljuora/admin/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "push", productIds: ["bj-test-3"] }) }));
    const plan = await json<{ plan: { items: Array<{ productId: string; fields: string[]; values: Record<string, unknown> }> } }>(await app.fetch(new Request(`http://localhost/api/baljuora/runner/${push.data.code}`)));
    const item = plan.data.plan.items.find((entry) => entry.productId === "bj-test-3");
    expect(item?.fields).toEqual(["supplyPrice", "groupPrice", "purchaseCost"]);
    expect(item?.values).toMatchObject({ supplyPrice: 12000, groupPrice: 11000, purchaseCost: 9000 });

    // DB센터 일반공급가·수강생 단가·원가가 0원이면 3종을 넣지 않습니다(0원으로 발주오라 가격을 바꾸지 않음).
    await executeSql("UPDATE products SET name = '이웃 감귤 3kg 특', generalPrice = 0, aPrice = 0, costPrice = 0 WHERE id = 'bj-test-3'");
    const zeroPush = await json<{ code: string }>(await fetchWithAuth(app, admin, "/api/baljuora/admin/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "push", productIds: ["bj-test-3"] }) }));
    const zeroPlan = await json<{ plan: { items: Array<{ productId: string; fields: string[] }> } }>(await app.fetch(new Request(`http://localhost/api/baljuora/runner/${zeroPush.data.code}`)));
    expect(zeroPlan.data.plan.items.find((entry) => entry.productId === "bj-test-3")?.fields).toEqual(["name"]);
  });

  it("이대로 두기 · 발주오라에만 있는 상품 가져오기(숨김 등록)", async () => {
    const admin = await adminToken();
    const compare = await startCompare(admin);
    await app.fetch(new Request(`http://localhost/api/baljuora/runner/${compare.code}`));
    await post(`/api/baljuora/runner/${compare.code}/results`, {
      final: true,
      categories: CATEGORY_TREE,
      snapshots: [
        snapshot({ id: BJ_UUID, code: "BJT-002", name: "봄날 배 7.5kg (발주오라 이름)", supplyPrice: 38000, purchaseCost: 30000, categoryIds: ["bj-cat-farm"] }),
        snapshot({ id: "bj-only", code: "BJT-999", name: "발주오라에만 있는 상품", supplyPrice: 5000, consumerPrice: 9900, purchaseCost: 3000, categoryIds: ["bj-cat-fruit"], imageUrls: ["https://files.baljuora.com/only.jpg"] })
      ]
    });
    type Changes = { items: Array<{ productId: string; diffs: Array<{ field: string }> }>; baljuoraOnly: Array<{ id: string }> };
    let changes = await json<Changes>(await fetchWithAuth(app, admin, "/api/baljuora/admin/changes"));
    expect(changes.data.items.find((item) => item.productId === `baljuora-${BJ_UUID}`)?.diffs.map((diff) => diff.field)).toEqual(["name"]);

    const ignored = await json<{ ignored: number }>(await fetchWithAuth(app, admin, "/api/baljuora/admin/ignore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productIds: [`baljuora-${BJ_UUID}`] }) }));
    expect(ignored.data.ignored).toBe(1);
    changes = await json<Changes>(await fetchWithAuth(app, admin, "/api/baljuora/admin/changes"));
    expect(changes.data.items.some((item) => item.productId === `baljuora-${BJ_UUID}`)).toBe(false);

    const pulled = await json<{ created: number; failed: unknown[] }>(await fetchWithAuth(app, admin, "/api/baljuora/admin/pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baljuoraIds: ["bj-only"] }) }));
    expect(pulled.data).toMatchObject({ created: 1, failed: [] });
    const created = await executeSql("SELECT name, generalPrice, aPrice, salePrice, salePriceMode, costPrice, categoryId, isVisible, imageUrl FROM products WHERE productCode = 'BJT-999'");
    expect(created.rows[0]).toMatchObject({ name: "발주오라에만 있는 상품", generalPrice: 5000, aPrice: 5000, salePrice: 9900, salePriceMode: "fixed", costPrice: 3000, categoryId: CATEGORY, isVisible: 0, imageUrl: "https://files.baljuora.com/only.jpg" });
    changes = await json<Changes>(await fetchWithAuth(app, admin, "/api/baljuora/admin/changes"));
    expect(changes.data.baljuoraOnly).toEqual([]);
    await executeSql("DELETE FROM price_histories WHERE productId IN (SELECT id FROM products WHERE productCode = 'BJT-999')");
    await executeSql("DELETE FROM catalog_activity_logs WHERE productId IN (SELECT id FROM products WHERE productCode = 'BJT-999')");
  });

  it("예전 연동 준비 기능이 남긴 연결은 비교 전까지 세지 않고, 비교 때 못 찾으면 신규 등록 대상입니다", async () => {
    const admin = await adminToken();
    await executeSql("INSERT INTO external_product_links (id, provider, externalProductId, externalProductCode, productId, syncStatus, rawSnapshot, lastPulledAt, createdAt, updatedAt) VALUES ('old-link', 'baljuora', 'old-bj-3', 'BJT-003', 'bj-test-3', 'imported', ?, '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')", [JSON.stringify({ raw: { id: "old-bj-3", productName: "옛 형식" } })]);
    let overview = await json<{ linkedCount: number }>(await fetchWithAuth(app, admin, "/api/baljuora/admin/overview"));
    expect(overview.data.linkedCount).toBe(0);
    const compare = await startCompare(admin);
    await app.fetch(new Request(`http://localhost/api/baljuora/runner/${compare.code}`));
    await post(`/api/baljuora/runner/${compare.code}/results`, { final: true, categories: CATEGORY_TREE, snapshots: [snapshot({ id: "bj-a", code: "BJT-001", name: "봄날 사과 5kg", supplyPrice: 26000, consumerPrice: 39000, purchaseCost: 20000, groupPrice: 24000, categoryIds: ["bj-cat-fruit"], imageUrls: ["https://files.baljuora.com/a.jpg"] })] });
    overview = await json<{ linkedCount: number }>(await fetchWithAuth(app, admin, "/api/baljuora/admin/overview"));
    expect(overview.data.linkedCount).toBe(1);
    const changes = await json<{ items: Array<{ productId: string; kind: string; syncStatus: string | null }> }>(await fetchWithAuth(app, admin, "/api/baljuora/admin/changes"));
    expect(changes.data.items.find((item) => item.productId === "bj-test-3")).toMatchObject({ kind: "new", syncStatus: "stale" });
    const push = await json<{ code: string }>(await fetchWithAuth(app, admin, "/api/baljuora/admin/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "push", productIds: ["bj-test-3"] }) }));
    const plan = await json<{ plan: { items: Array<{ action: string; baljuoraId: string | null; templateId: string | null }> } }>(await app.fetch(new Request(`http://localhost/api/baljuora/runner/${push.data.code}`)));
    expect(plan.data.plan.items[0]).toMatchObject({ action: "create", baljuoraId: null, templateId: "bj-a" });
  });

  it("새 매입처 상품(2026-11-25): 같은 매입처 연결 상품이 없으면 '새 매입처'로 알리고, 설정 복사용 상품은 fallback으로 표시합니다", async () => {
    const admin = await adminToken();
    await executeSql("INSERT INTO products (id, productCode, name, supplierName, costPrice, aPrice, generalPrice, salePriceMode, shippingType, categoryId, isVisible, isSoldOut, isAlwaysOnSale, displayOrder) VALUES ('bj-test-5', 'BJT-005', '햇살 감자 10kg', '햇살농장', 15000, 17000, 18000, 'autonomous', 'domestic', ?, 1, 0, 1, 5)", [CATEGORY]);
    const compare = await startCompare(admin);
    await app.fetch(new Request(`http://localhost/api/baljuora/runner/${compare.code}`));
    await post(`/api/baljuora/runner/${compare.code}/results`, { final: true, categories: CATEGORY_TREE, snapshots: [snapshot({ id: "bj-a", code: "BJT-001", name: "봄날 사과 5kg", supplyPrice: 26000, consumerPrice: 39000, purchaseCost: 20000, groupPrice: 24000, categoryIds: ["bj-cat-fruit"], imageUrls: ["https://files.baljuora.com/a.jpg"] })] });
    const changes = await json<{ items: Array<{ productId: string; kind: string; newSupplier?: boolean }> }>(await fetchWithAuth(app, admin, "/api/baljuora/admin/changes"));
    expect(changes.data.items.find((item) => item.productId === "bj-test-5")).toMatchObject({ kind: "new", newSupplier: true });
    expect(changes.data.items.find((item) => item.productId === "bj-test-3")).toMatchObject({ kind: "new", newSupplier: false });
    expect(changes.data.items.find((item) => item.productId === "bj-test-4")).toMatchObject({ kind: "new", newSupplier: false }); // 매입처 없음

    type Plan = { plan: { items: Array<{ productId: string; action: string; templateId: string | null; templateMatch?: string | null; supplierName: string | null }> } };
    const planFor = async () => {
      const push = await json<{ code: string }>(await fetchWithAuth(app, admin, "/api/baljuora/admin/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "push", productIds: ["bj-test-5"] }) }));
      return (await json<Plan>(await app.fetch(new Request(`http://localhost/api/baljuora/runner/${push.data.code}`)))).data.plan.items[0];
    };
    // 설정 복사용 상품도 없으면 비워 보냄(책갈피가 발주오라에서 같은 매입처 상품을 찾고, 없으면 등록하지 않음)
    expect(await planFor()).toMatchObject({ action: "create", templateId: null, templateMatch: null, supplierName: "햇살농장" });
    const saved = await fetchWithAuth(app, admin, "/api/baljuora/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateCode: "BJT-001" }) });
    expect(saved.status).toBe(200);
    // 설정 복사용 상품(다른 매입처일 수 있음)은 fallback — 책갈피가 매입처를 확인한 뒤에만 복사
    expect(await planFor()).toMatchObject({ action: "create", templateId: "bj-a", templateMatch: "fallback", supplierName: "햇살농장" });
  });

  it("이미지 받기는 작업에 든 상품만 됩니다", async () => {
    const admin = await adminToken();
    const compare = await startCompare(admin);
    const res = await app.fetch(new Request(`http://localhost/api/baljuora/runner/${compare.code}/image/bj-test-1`));
    expect(res.status).toBe(404);
  });
});
