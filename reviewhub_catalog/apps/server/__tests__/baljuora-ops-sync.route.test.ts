// 2026-11-27 관리자 요청 — 운영 홈 동기화 버튼 2개 + 발주오라 동기화 화면 숫자 카드 팝업 + DB센터 ↔ 발주오라 상품 수 맞춰 보기:
// ① 주문 동기화: 판매 작업(ops "orders") — 매출처·발주오라 매입처·주문 줄을 읽어 새 매입처는 공급사 관리에 등록, 새 매출처·새 주문 수와 최근 7일 주문 현황
// ② 상품 동기화: 비교(ops "products") → 책갈피가 /runner/:code/next로 보내기 작업을 받아 이어서 실행(바뀐 상품·신규 등록·지운 상품 미노출·품절)
// ③ 지운 상품의 연결 기록 때문에 '발주오라에만 있음'에서 빠지던 발주오라 상품(운영: 비교는 2,998개를 읽었는데 2,148개만 보임) · 상품 수 맞춰 보기
// ④ '연결된 상품' 팝업 20개씩 · 변경 목록 칸 차이에 마지막으로 맞춘 값(기준)
// 발주오라 쪽은 책갈피가 보내는 결과 JSON으로 흉내 냅니다(실제 발주오라에 접속하지 않음).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { BaljuoraProductSnapshot } from "@repo/shared/baljuora-sync";

process.env.SKYBASE_DB_ENDPOINT = `file:${join(mkdtempSync(join(tmpdir(), "baljuora-ops-")), "test.db")}`;
const { default: app } = await import("../_core/create-app");
const { executeSql } = await import("../_core/db");
const { applyMigrations, fetchWithAuth, resetDatabase, signUpAndGetToken } = await import("../_test/helpers");

const CATEGORY = "cat-domestic-farm";
const CATEGORY_TREE = [{ id: "bj-cat-farm", name: "🥕 농산", children: [{ id: "bj-cat-fruit", name: "과일류", children: [] }] }];

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await resetDatabase();
  for (const table of ["baljuora_sync_jobs", "baljuora_sync_store", "external_product_links", "baljuora_sales_lines", "baljuora_buyers", "supplier_sales"]) await executeSql(`DELETE FROM ${table}`);
  await executeSql("DELETE FROM price_histories WHERE productId LIKE 'op-%' OR productId IN (SELECT id FROM products WHERE productCode LIKE 'OP-%')");
  await executeSql("DELETE FROM catalog_activity_logs WHERE productId LIKE 'op-%' OR productId IN (SELECT id FROM products WHERE productCode LIKE 'OP-%')");
  await executeSql("DELETE FROM products WHERE id LIKE 'op-%' OR productCode LIKE 'OP-%'");
  await executeSql("DELETE FROM suppliers WHERE name IN ('봄날농원', '새매입처1', '새매입처2', '쉬는매입처', '청도농원') OR memo LIKE '발주오라 매입처%'");
  // 처음 설치 때 들어간 예시 상품은 지운 상품으로 둡니다(이 파일의 상품 수만 세게 — 테스트용 임시 DB).
  await executeSql("UPDATE products SET deletedAt = COALESCE(deletedAt, '2000-01-01T00:00:00.000Z'), isVisible = 0 WHERE id NOT LIKE 'op-%' AND (productCode IS NULL OR productCode NOT LIKE 'OP-%')");
});

const insert = (id: string, code: string, name: string, options: { visible?: boolean; soldOut?: boolean; supplier?: string | null; price?: number } = {}) => executeSql(
  "INSERT INTO products (id, productCode, name, imageUrl, supplierName, costPrice, aPrice, generalPrice, salePrice, salePriceMode, shippingType, categoryId, isVisible, isSoldOut, isAlwaysOnSale, displayOrder) VALUES (?, ?, ?, NULL, ?, 9000, ?, ?, NULL, 'autonomous', 'domestic', ?, ?, ?, 1, 1)",
  [id, code, name, options.supplier ?? null, options.price ?? 12000, options.price ?? 12000, CATEGORY, options.visible === false ? 0 : 1, options.soldOut ? 1 : 0]
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

async function runner<T>(code: string, path = "", body?: unknown) {
  const res = await app.fetch(new Request(`http://localhost/api/baljuora/runner/${code}${path}`, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json", origin: "https://console.baljuora.com" }, body: JSON.stringify(body) }));
  const parsed = (await res.json()) as { ok: boolean; data: T; error?: { message?: string } };
  return { status: res.status, ok: parsed.ok, data: parsed.data, message: parsed.error?.message };
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

type OpsStatus = {
  ready: boolean;
  orders: { job: { id: string; status: string } | null; last: Record<string, unknown> & { suppliers: { read: number; added: number; names: string[]; fromLines: number; error: string | null } | null } | null; recent: { total: number; cancelled: number; byStatus: Array<{ status: string; label: string; lines: number }> } | null };
  products: { phase: string; compareJob: { id: string } | null; pushJob: { id: string; status: string } | null; planned: Record<string, number> | null; last: { nothing: boolean; result: Record<string, number> | null; planned: Record<string, number> | null; leftovers: Record<string, number> | null } | null };
};

describe("발주오라에만 있음 · 상품 수 맞춰 보기", () => {
  it("DB센터에서 지운 상품과 이어져 있던 발주오라 상품도 '발주오라에만 있음'에 보이고, 상품 수를 원인별로 나눕니다", async () => {
    const admin = await adminToken();
    await insert("op-keep", "OP-KEEP", "[본] 감귤 5kg", { supplier: "청도농원" });
    await insert("op-gone", "OP-GONE", "[본] 옛날 사과 3kg", { supplier: "청도농원" });
    await insert("op-sold", "OP-SOLD", "[본] 배 5kg", { supplier: "청도농원" });
    await insert("op-hide", "OP-HIDE", "[본] 단감 5kg", { supplier: "청도농원", visible: false });
    await insert("op-dbonly", "OP-DBONLY", "[본] 새 상품 2kg", { supplier: "청도농원" });
    const snapshots = [
      snapshot({ id: "bj-keep", code: "OP-KEEP", name: "[본] 감귤 5kg" }),
      snapshot({ id: "bj-gone", code: "OP-GONE", name: "[본] 옛날 사과 3kg" }),
      // 발주오라는 품절 · DB센터는 판매중
      snapshot({ id: "bj-sold", code: "OP-SOLD", name: "[본] 배 5kg", isSoldOut: true }),
      // 발주오라는 노출 · DB센터는 숨김
      snapshot({ id: "bj-hide", code: "OP-HIDE", name: "[본] 단감 5kg" }),
      // DB센터에 처음부터 없던 발주오라 상품(미노출·품절)
      snapshot({ id: "bj-never", code: "OP-NEVER", name: "[본] 단종 상품", isVisible: false, isSoldOut: true })
    ];
    await compare(admin, snapshots);
    // DB센터에서 상품을 지움(숨김 + deletedAt) — 연결 기록은 남습니다.
    await executeSql("UPDATE products SET isVisible = 0, deletedAt = ? WHERE id = 'op-gone'", [new Date().toISOString()]);
    // 발주오라에서는 미노출·품절로 남아 있는 상태로 다시 비교
    await compare(admin, snapshots.map((item) => (item.id === "bj-gone" ? { ...item, isVisible: false, isSoldOut: true } : item)));

    const changes = await api<{ linkedCount: number; baljuoraOnly: Array<{ id: string; deletedMatch?: { id: string } }> }>(admin, "/api/baljuora/admin/changes");
    expect(changes.data.linkedCount).toBe(3);
    // 예전에는 연결 기록이 남은 bj-gone이 '발주오라에만 있음'에서 빠졌습니다.
    expect(changes.data.baljuoraOnly.map((item) => item.id).sort()).toEqual(["bj-gone", "bj-never"]);
    expect(changes.data.baljuoraOnly.find((item) => item.id === "bj-gone")?.deletedMatch?.id).toBe("op-gone");

    const reconcile = await api<{
      baljuora: { total: number; selling: number; soldOut: number; visible: number; hidden: number; hiddenSoldOut: number; source: string };
      doogo: { total: number; selling: number; soldOut: number; visible: number; hidden: number; deleted: number };
      linked: number;
      doogoOnly: { total: number };
      baljuoraOnly: { total: number; deleted: number; never: number; hiddenSoldOut: number; importIds: string[] };
      soldOut: { doogoSellingBaljuoraSoldOut: number; doogoSoldOutBaljuoraSelling: number; productIds: string[] };
      visible: { doogoHiddenBaljuoraVisible: number; doogoVisibleBaljuoraHidden: number };
    }>(admin, "/api/baljuora/admin/reconcile");
    expect(reconcile.status).toBe(200);
    // 발주오라 수는 비교 때 센 값(발주오라 상품 리스트와 같은 기준)
    expect(reconcile.data.baljuora).toMatchObject({ total: 5, selling: 2, soldOut: 3, visible: 3, hidden: 2, hiddenSoldOut: 2, source: "compare" });
    expect(reconcile.data.doogo).toMatchObject({ total: 4, selling: 4, soldOut: 0, visible: 3, hidden: 1 });
    expect(reconcile.data.doogo.deleted).toBeGreaterThanOrEqual(1);
    expect(reconcile.data.linked).toBe(3);
    expect(reconcile.data.doogoOnly.total).toBe(1);
    expect(reconcile.data.baljuoraOnly).toMatchObject({ total: 2, deleted: 1, never: 1, hiddenSoldOut: 2 });
    expect(reconcile.data.baljuoraOnly.importIds.sort()).toEqual(["bj-gone", "bj-never"]);
    expect(reconcile.data.soldOut).toMatchObject({ doogoSellingBaljuoraSoldOut: 1, doogoSoldOutBaljuoraSelling: 0, productIds: ["op-sold"] });
    expect(reconcile.data.visible).toMatchObject({ doogoHiddenBaljuoraVisible: 1, doogoVisibleBaljuoraHidden: 0 });

    // 맞추기: 발주오라에만 있는 상품 가져오기(지운 상품은 되살림, 진열순서 맨 뒤) + 품절 발주오라 기준
    const pulled = await api<{ created: number; restored: number; failed: unknown[] }>(admin, "/api/baljuora/admin/pull", "POST", { baljuoraIds: reconcile.data.baljuoraOnly.importIds, placeAtEnd: true });
    expect(pulled.data).toMatchObject({ created: 2, restored: 1, failed: [] });
    const orders = (await executeSql("SELECT id, displayOrder, isVisible, isSoldOut, deletedAt FROM products WHERE id LIKE 'op-%' OR productCode = 'OP-NEVER' ORDER BY displayOrder")).rows as Array<Record<string, unknown>>;
    const restored = orders.find((row) => row.id === "op-gone")!;
    expect(restored.deletedAt).toBeNull();
    expect(Number(restored.isVisible)).toBe(0);
    expect(Number(restored.isSoldOut)).toBe(1);
    // 진열순서 맨 뒤(기존 상품보다 큼)
    expect(orders.slice(-2).map((row) => row.id)).toContain("op-gone");
    const aligned = await api<{ updated: number }>(admin, "/api/baljuora/admin/pull", "POST", { productIds: reconcile.data.soldOut.productIds, fields: ["soldOut"] });
    expect(aligned.data.updated).toBe(1);
    const after = await api<{ doogo: { total: number; soldOut: number }; baljuoraOnly: { total: number }; soldOut: { productIds: string[] } }>(admin, "/api/baljuora/admin/reconcile");
    expect(after.data.doogo.total).toBe(6);
    expect(after.data.doogo.soldOut).toBe(3);
    expect(after.data.baljuoraOnly.total).toBe(0);
    expect(after.data.soldOut.productIds).toEqual([]);
  });

  it("'연결된 상품'을 20개씩 돌려주고 찾기·다른 칸 거르기를 하며, 변경 목록 칸에는 마지막으로 맞춘 값을 붙입니다", async () => {
    const admin = await adminToken();
    const snapshots: BaljuoraProductSnapshot[] = [];
    for (let index = 1; index <= 25; index += 1) {
      const code = `OP-L${String(index).padStart(2, "0")}`;
      await insert(`op-l${index}`, code, `연결 상품 ${String(index).padStart(2, "0")}`);
      snapshots.push(snapshot({ id: `bj-l${index}`, code, name: `연결 상품 ${String(index).padStart(2, "0")}` }));
    }
    await compare(admin, snapshots);
    await executeSql("UPDATE products SET generalPrice = 13000 WHERE id = 'op-l3'");
    type Linked = { total: number; page: number; pages: number; counts: { all: number; diff: number; same: number }; items: Array<{ productId: string; diffCount: number; diffFields: string[]; baljuora: { code: string; supplyPrice: number } }> };
    const first = await api<Linked>(admin, "/api/baljuora/admin/linked?page=1&size=20");
    expect(first.data).toMatchObject({ total: 25, page: 1, pages: 2, counts: { all: 25, diff: 1, same: 24 } });
    expect(first.data.items).toHaveLength(20);
    const second = await api<Linked>(admin, "/api/baljuora/admin/linked?page=2&size=20");
    expect(second.data.items.map((item) => item.productId)).toEqual(["op-l21", "op-l22", "op-l23", "op-l24", "op-l25"]);
    const diff = await api<Linked>(admin, "/api/baljuora/admin/linked?filter=diff");
    expect(diff.data.items.map((item) => [item.productId, item.diffFields])).toEqual([["op-l3", ["supplyPrice"]]]);
    const search = await api<Linked>(admin, "/api/baljuora/admin/linked?q=OP-L1");
    expect(search.data.total).toBe(10);
    expect((await fetchWithAuth(app, "", "/api/baljuora/admin/linked")).status).toBe(401);

    const changes = await api<{ items: Array<{ productId: string; baseAt: string | null; diffs: Array<{ field: string; doogo: number; baljuora: number; base?: { doogo?: number; baljuora?: number } }> }> }>(admin, "/api/baljuora/admin/changes");
    const item = changes.data.items.find((entry) => entry.productId === "op-l3")!;
    expect(item.baseAt).toBeTruthy();
    expect(item.diffs).toEqual([{ field: "supplyPrice", doogo: 13000, baljuora: 12000, direction: "push", base: { doogo: 12000, baljuora: 12000 } }]);
  });
});

describe("운영 홈 주문 동기화", () => {
  it("매출처·발주오라 매입처·주문 줄을 읽어 새 매입처는 공급사 관리에 등록하고, 새 매출처·새 주문·최근 7일 주문 현황을 남깁니다", async () => {
    const admin = await adminToken();
    await executeSql("INSERT INTO suppliers (id, name, phone, isActive) VALUES ('sup-spring', '봄날농원', '010-1111-2222', 1)");
    const started = await api<{ job: { id: string }; code: string; consoleUrl: string }>(admin, "/api/baljuora/admin/ops-sync/orders/start", "POST", {});
    expect(started.status).toBe(200);
    expect(started.data.consoleUrl).toContain("#doogo-sync=");
    const job = await runner<{ type: string; plan: { type: string; ops: string; suppliers: boolean; start: string; end: string } }>(started.data.code);
    expect(job.data.plan).toMatchObject({ type: "sales", ops: "orders", suppliers: true });
    // 다른 작업이 발주오라 창에서 도는 동안에는 새로 시작하지 않습니다.
    const busy = await api(admin, "/api/baljuora/admin/ops-sync/orders/start", "POST", {});
    expect(busy.status).toBe(409);

    const code = started.data.code;
    expect((await runner(code, "/results", { final: false, buyers: [{ id: "seller-1", companyName: "하루마켓" }, { id: "seller-2", companyName: "새벽상회" }] })).status).toBe(200);
    expect((await runner(code, "/results", {
      final: false,
      suppliers: [
        { id: "s-1", name: "(주)봄날농원", phone: "010-9999-9999", isActive: true },
        { id: "s-2", name: "새매입처1", businessNumber: "1234567890", representativeName: "김대표", isActive: true },
        { id: "s-3", name: "쉬는매입처", isActive: false }
      ]
    })).status).toBe(200);
    const now = new Date().toISOString();
    const line = (id: string, status: string, supplierName: string, quantity = 1, netQuantity = quantity) => ({ id, orderId: `order-${id}`, orderedAt: now, status, productId: null, productCode: null, productName: `상품 ${id}`, supplierId: null, supplierName, sellerId: "seller-1", sellerName: "하루마켓", quantity, netQuantity, supplyPrice: 10000, purchaseCost: 8000, salesShippingFee: 0, purchaseShippingFee: 0 });
    expect((await runner(code, "/results", { final: false, salesLines: [line("a", "accepted", "봄날농원"), line("b", "shipping", "새매입처2"), line("c", "delivered", "봄날농원"), line("d", "cancelled", "봄날농원"), line("e", "delivered", "봄날농원", 2, 0)] })).status).toBe(200);
    expect((await runner(code, "/results", { final: true, salesDone: { complete: true } })).status).toBe(200);

    const status = await api<OpsStatus>(admin, "/api/baljuora/admin/ops-sync");
    expect(status.data.ready).toBe(true);
    expect(status.data.orders.job?.status).toBe("done");
    const last = status.data.orders.last!;
    expect(last).toMatchObject({ lines: 5, newLines: 5, newOrders: 5, buyers: 2, newBuyers: 2, complete: true });
    expect(last.newBuyerNames).toEqual(["새벽상회", "하루마켓"]);
    // 매입처: 목록에서 읽은 3곳 중 새로 쓰는 곳(새매입처1) + 주문 줄에만 나온 곳(새매입처2)을 등록, (주)봄날농원은 이미 있는 봄날농원, 쉬는 매입처는 빼요.
    expect(last.suppliers).toMatchObject({ read: 3, added: 2 });
    expect(last.suppliers!.names.sort()).toEqual(["새매입처1", "새매입처2"]);
    const suppliers = (await executeSql("SELECT name, businessNumber, representative, phone, memo FROM suppliers WHERE name IN ('봄날농원', '새매입처1', '새매입처2', '쉬는매입처') ORDER BY name")).rows as Array<Record<string, unknown>>;
    expect(suppliers.map((row) => row.name)).toEqual(["봄날농원", "새매입처1", "새매입처2"]);
    // 이미 있는 공급사는 바꾸지 않습니다.
    expect(suppliers[0]).toMatchObject({ phone: "010-1111-2222", memo: null });
    expect(suppliers[1]).toMatchObject({ businessNumber: "123-45-67890", representative: "김대표" });
    expect(String(suppliers[1]!.memo)).toContain("발주오라 매입처에서 가져옴(주문 동기화");
    // 최근 7일 주문 현황(상품 줄): 취소 = 취소 상태 + 남은 수량 0
    const recent = status.data.orders.recent!;
    expect(recent.total).toBe(3);
    expect(recent.cancelled).toBe(2);
    expect(Object.fromEntries(recent.byStatus.map((item) => [item.label, item.lines]))).toMatchObject({ 주문대기: 0, 주문접수: 1, 발주완료: 0, 배송준비중: 0, 배송중: 1, 배송완료: 1 });
  });

  it("매입처 목록을 못 읽어도 주문 줄에 나온 매입처를 등록합니다", async () => {
    const admin = await adminToken();
    const started = await api<{ code: string }>(admin, "/api/baljuora/admin/ops-sync/orders/start", "POST", {});
    await runner(started.data.code);
    await runner(started.data.code, "/results", { final: false, supplierError: "발주오라 응답 404 (GET merchant/suppliers)" });
    await runner(started.data.code, "/results", { final: false, salesLines: [{ id: "x1", orderId: "o-x1", orderedAt: new Date().toISOString(), status: "accepted", productName: "상품", supplierName: "새매입처2", sellerName: "하루마켓", quantity: 1, netQuantity: 1, supplyPrice: 5000 }] });
    await runner(started.data.code, "/results", { final: true, salesDone: { complete: true } });
    const status = await api<OpsStatus>(admin, "/api/baljuora/admin/ops-sync");
    expect(status.data.orders.last?.suppliers).toMatchObject({ read: 0, added: 1, fromLines: 1, names: ["새매입처2"], error: "발주오라 응답 404 (GET merchant/suppliers)" });
  });
});

describe("운영 홈 상품 동기화", () => {
  it("발주오라 값을 읽은 뒤 이어서 바뀐 상품·신규 등록·지운 상품 미노출·품절을 보내고 요약을 남깁니다", async () => {
    const admin = await adminToken();
    await insert("op-up", "OP-UP", "[본] 샤인머스캣 2kg", { supplier: "청도농원" });
    await insert("op-del", "OP-DEL", "[본] 단종 포도 2kg", { supplier: "청도농원" });
    await compare(admin, [
      snapshot({ id: "bj-up", code: "OP-UP", name: "[본] 샤인머스캣 2kg" }),
      snapshot({ id: "bj-del", code: "OP-DEL", name: "[본] 단종 포도 2kg" })
    ]);
    // DB센터에서: 가격을 바꾸고, 새 상품을 등록하고, 상품 하나를 지움
    await executeSql("UPDATE products SET generalPrice = 12500 WHERE id = 'op-up'");
    await insert("op-new", "OP-NEW", "[본] 신상 사과 3kg", { supplier: "청도농원" });
    await executeSql("UPDATE products SET isVisible = 0, deletedAt = ? WHERE id = 'op-del'", [new Date().toISOString()]);

    const preview = await api<{ updates: { count: number; fields: Array<{ field: string; count: number }> }; creates: { count: number; samples: Array<{ name: string }> }; hides: { count: number } }>(admin, "/api/baljuora/admin/ops-sync/products/preview");
    expect(preview.status).toBe(200);
    expect(preview.data.updates.count).toBe(1);
    expect(preview.data.updates.fields).toEqual([{ field: "supplyPrice", count: 1 }]);
    expect(preview.data.creates).toMatchObject({ count: 1, samples: [{ name: "[본] 신상 사과 3kg" }] });

    const started = await api<{ code: string; job: { id: string } }>(admin, "/api/baljuora/admin/ops-sync/products/start", "POST", { options: { updates: true, creates: true, hides: true, categories: true } });
    expect(started.status).toBe(200);
    const compareJob = await runner<{ plan: { type: string; ops: string; sales: unknown } }>(started.data.code);
    expect(compareJob.data.plan).toMatchObject({ type: "compare", ops: "products", sales: null });
    expect((await api<OpsStatus>(admin, "/api/baljuora/admin/ops-sync")).data.products.phase).toBe("reading");
    // 비교가 끝나기 전에는 이어서 보내지 않습니다.
    expect((await runner(started.data.code, "/next", {})).status).toBe(409);
    const read = await runner(started.data.code, "/results", { final: true, categories: CATEGORY_TREE, snapshots: [
      snapshot({ id: "bj-up", code: "OP-UP", name: "[본] 샤인머스캣 2kg" }),
      snapshot({ id: "bj-del", code: "OP-DEL", name: "[본] 단종 포도 2kg" })
    ] });
    expect(read.status).toBe(200);
    expect((await api<OpsStatus>(admin, "/api/baljuora/admin/ops-sync")).data.products.phase).toBe("linking");

    const next = await runner<{ next: { code: string; type: string; total: number } | null; planned: Record<string, number> }>(started.data.code, "/next", {});
    expect(next.status).toBe(200);
    expect(next.data.next).toMatchObject({ type: "push", total: 3 });
    expect(next.data.planned).toMatchObject({ updates: 1, creates: 1, hides: 1 });
    const pushJob = await runner<{ type: string; plan: { ops: string; compareJobId: string; items: Array<{ productId: string; action: string; fields: string[]; hide?: boolean; baljuoraId: string | null; values: { extra?: Record<string, unknown> } }> } }>(next.data.next!.code);
    expect(pushJob.data.type).toBe("push");
    expect(pushJob.data.plan.ops).toBe("products");
    expect(pushJob.data.plan.compareJobId).toBe(started.data.job.id);
    const byId = Object.fromEntries(pushJob.data.plan.items.map((item) => [item.productId, item]));
    expect(byId["op-up"]).toMatchObject({ action: "update", fields: ["supplyPrice"] });
    expect(byId["op-new"]).toMatchObject({ action: "create" });
    expect(byId["op-del"]).toMatchObject({ action: "update", hide: true, baljuoraId: "bj-del", fields: ["visible", "soldOut"], values: { extra: { isVisible: false, isSoldOut: true } } });
    expect((await api<OpsStatus>(admin, "/api/baljuora/admin/ops-sync")).data.products.phase).toBe("sending");

    const pushed = await runner(next.data.next!.code, "/results", { final: true, items: [
      { productId: "op-up", ok: true, action: "update", baljuoraId: "bj-up", applied: ["supplyPrice"], snapshot: snapshot({ id: "bj-up", code: "OP-UP", name: "[본] 샤인머스캣 2kg", supplyPrice: 12500 }) },
      { productId: "op-new", ok: true, action: "create", baljuoraId: "bj-new", code: "OP-NEW", applied: ["name", "supplyPrice"], snapshot: snapshot({ id: "bj-new", code: "OP-NEW", name: "[본] 신상 사과 3kg" }) },
      { productId: "op-del", ok: true, action: "update", baljuoraId: "bj-del", applied: ["visible", "soldOut"], snapshot: snapshot({ id: "bj-del", code: "OP-DEL", name: "[본] 단종 포도 2kg", isVisible: false, isSoldOut: true }) }
    ] });
    expect(pushed.status).toBe(200);

    const status = await api<OpsStatus>(admin, "/api/baljuora/admin/ops-sync");
    expect(status.data.products.phase).toBe("done");
    expect(status.data.products.last).toMatchObject({ nothing: false, result: { succeeded: 3, failed: 0, created: 1, updated: 1, hidden: 1 } });
    // 지운 상품과는 연결 기록을 만들지 않고 '발주오라에만 있음'의 발주오라 상태만 미노출·품절로 바꿉니다.
    expect((await executeSql("SELECT productId FROM external_product_links WHERE externalProductId = 'bj-del' AND productId = 'op-del' AND rawSnapshot LIKE '%\"isVisible\":false%'")).rows).toHaveLength(0);
    const changes = await api<{ baljuoraOnly: Array<{ id: string; isVisible: boolean | null; isSoldOut: boolean | null }> }>(admin, "/api/baljuora/admin/changes");
    expect(changes.data.baljuoraOnly.find((item) => item.id === "bj-del")).toMatchObject({ isVisible: false, isSoldOut: true });
    // 이미 미노출·품절이면 다음 동기화에는 넣지 않습니다.
    const again = await api<{ hides: { count: number } }>(admin, "/api/baljuora/admin/ops-sync/products/preview");
    expect(again.data.hides.count).toBe(0);
  });

  it("보낼 것이 없으면 보내기 작업을 만들지 않고 '보낼 변경 없음'으로 끝나며, 운영 홈 작업이 아닌 비교 코드로는 이어 가지 않습니다", async () => {
    const admin = await adminToken();
    await insert("op-same", "OP-SAME", "[본] 같은 상품", { supplier: "청도농원" });
    const started = await api<{ code: string }>(admin, "/api/baljuora/admin/ops-sync/products/start", "POST", { options: { updates: true, creates: false, hides: true, categories: false } });
    await runner(started.data.code);
    await runner(started.data.code, "/results", { final: true, categories: CATEGORY_TREE, snapshots: [snapshot({ id: "bj-same", code: "OP-SAME", name: "[본] 같은 상품" })] });
    const next = await runner<{ next: null; message: string }>(started.data.code, "/next", {});
    expect(next.status).toBe(200);
    expect(next.data.next).toBeNull();
    expect(next.data.message).toContain("보낼 변경이 없어요");
    const status = await api<OpsStatus>(admin, "/api/baljuora/admin/ops-sync");
    expect(status.data.products.phase).toBe("done");
    expect(status.data.products.last).toMatchObject({ nothing: true });

    // 동기화 화면의 일반 비교 작업 코드는 /next로 이어 가지 않습니다.
    const plain = await api<{ code: string }>(admin, "/api/baljuora/admin/jobs", "POST", { type: "compare", sales: false });
    await runner(plain.data.code);
    await runner(plain.data.code, "/results", { final: true, snapshots: [] });
    expect((await runner(plain.data.code, "/next", {})).status).toBe(400);
    // 관리자 로그인 없이는 운영 홈 동기화 API를 쓸 수 없습니다.
    expect((await fetchWithAuth(app, "", "/api/baljuora/admin/ops-sync")).status).toBe(401);
    expect((await app.fetch(new Request("http://localhost/api/baljuora/admin/ops-sync/products/start", { method: "POST" }))).status).toBe(401);
  });
});
