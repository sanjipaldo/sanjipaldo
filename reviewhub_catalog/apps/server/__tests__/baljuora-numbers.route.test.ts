// 2026-11-27 관리자 요청 두 가지:
//  ① "상품 리스트 줄 앞 숫자를 발주오라처럼 — 전체 상품에서 맨 위(최근 등록) 2998, 맨 아래 1 · 상품 숫자까지 똑같이"
//     → 비교 때 발주오라 등록일시·목록 순서를 기록(baljuora_order)하고 GET /api/baljuora/admin/product-order가 DB센터 상품을 그 순서로 돌려줌
//  ② "주문 동기화를 최신으로 했는데 나도건강 금액이 발주오라 대시보드(102건 4,257,500)와 다르다(DB센터 110건 385만원) — 주문 동기화를 누르면
//     대시보드의 최근 7일 주문 현황·기간별 매출·매출처 TOP 5·상품별 매출까지 똑같이"
//     → 책갈피(1.11.0)가 발주오라 대시보드 숫자(statistics/…)를 보내면 저장하고, DB센터 판매 계산 기준을 그 숫자와 맞춰 고름
// 발주오라 쪽은 책갈피가 보내는 결과 JSON으로 흉내 냅니다(실제 발주오라에 접속하지 않음).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { BaljuoraProductSnapshot } from "@repo/shared/baljuora-sync";
import { DEFAULT_SALES_BASIS, calibrateSalesBasis, parseBaljuoraDashboard, parsePeriods, parseRecentOrders, parseTopRows } from "@repo/shared/baljuora-dashboard";
import { nextMonthKey, seoulDateKey } from "@repo/shared/supplier-portal";

process.env.SKYBASE_DB_ENDPOINT = `file:${join(mkdtempSync(join(tmpdir(), "baljuora-numbers-")), "test.db")}`;
const { default: app } = await import("../_core/create-app");
const { executeSql } = await import("../_core/db");
const { applyMigrations, fetchWithAuth, resetDatabase, signUpAndGetToken } = await import("../_test/helpers");

const CATEGORY = "cat-domestic-farm";

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await resetDatabase();
  for (const table of ["baljuora_sync_jobs", "baljuora_sync_store", "external_product_links", "baljuora_sales_lines", "baljuora_buyers"]) await executeSql(`DELETE FROM ${table}`);
  await executeSql("DELETE FROM products WHERE id LIKE 'nb-%'");
  // 처음 설치 때 들어간 예시 상품은 지운 상품으로 둡니다(이 파일의 상품 순서만 보게 — 테스트용 임시 DB).
  await executeSql("UPDATE products SET deletedAt = COALESCE(deletedAt, '2000-01-01T00:00:00.000Z'), isVisible = 0 WHERE id NOT LIKE 'nb-%'");
});

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
  const res = await app.fetch(new Request(`http://localhost/api/baljuora/runner/${code}${path}`, body === undefined ? { headers: { origin: "https://console.baljuora.com" } } : { method: "POST", headers: { "Content-Type": "application/json", origin: "https://console.baljuora.com" }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json().catch(() => null) as { data?: { plan?: Record<string, unknown> } } | null };
}

// 발주오라 상품 id(UUIDv7): 앞 48비트 = 만든 시각(ms)
function v7(iso: string, tail: string) {
  const hex = Date.parse(iso).toString(16).padStart(12, "0");
  const rest = tail.padEnd(18, "0").slice(0, 18);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${rest.slice(0, 3)}-8${rest.slice(3, 6)}-${rest.slice(6, 18)}`;
}

const insert = (id: string, code: string, name: string, createdAt: string) => executeSql(
  "INSERT INTO products (id, productCode, name, imageUrl, supplierName, costPrice, aPrice, generalPrice, salePrice, salePriceMode, shippingType, categoryId, isVisible, isSoldOut, isSeasonEnded, isAlwaysOnSale, displayOrder, createdAt) VALUES (?, ?, ?, NULL, '청도농원', 9000, 12000, 12000, NULL, 'autonomous', 'domestic', ?, 1, 0, 0, 1, 1, ?)",
  [id, code, name, CATEGORY, createdAt]
);

function snapshot(partial: Partial<BaljuoraProductSnapshot> & { id: string }): BaljuoraProductSnapshot {
  return { kind: "product", code: null, name: "", supplyPrice: 12000, consumerPrice: null, purchaseCost: 9000, groupPrice: null, imageUrls: [], isVisible: true, isSoldOut: false, updatedAt: "2026-11-27T00:00:00Z", categoryIds: [], ...partial };
}

async function compare(admin: string, batches: BaljuoraProductSnapshot[][]) {
  const created = await api<{ code: string; job: { id: string } }>(admin, "/api/baljuora/admin/jobs", "POST", { type: "compare", sales: false });
  expect(created.ok).toBe(true);
  await runner(created.data.code);
  for (let index = 0; index < batches.length; index += 1) {
    const res = await runner(created.data.code, "/results", { final: index === batches.length - 1, snapshots: batches[index], categories: index === 0 ? [] : undefined });
    expect(res.status).toBe(200);
  }
  return created.data.job.id;
}

const ORDER_PATH = "/api/baljuora/admin/product-order";
type Order = { ids: string[]; comparedAt: string | null; total: number; linked: number; exact: number };

describe("상품 리스트 발주오라 번호: 발주오라 상품 리스트 순서(등록일시 최신순)", () => {
  // 발주오라: 하이웰(1월, 가장 먼저 등록 = 1번) · 같은 때 대량 등록한 두 상품(3월, 목록에서 '나중 줄'이 먼저) · DB센터에만 있는 상품(2월 등록)
  const BJ_OLD = v7("2026-01-05T01:00:00.000Z", "aaa");
  const BJ_BULK_TOP = v7("2026-03-02T02:00:00.000Z", "000000000000000000");
  const BJ_BULK_NEXT = v7("2026-03-02T02:00:00.000Z", "fff");
  async function seed() {
    await insert("nb-old", "NB-OLD", "하이웰 프리미엄 비 프로폴리스 3200 250캡슐", "2026-11-27 05:00:00");
    await insert("nb-top", "NB-TOP", "네이처맥스 셀지에이트 리포좀 글루타치온C 7000 맥스 (3g*14포)", "2026-11-27 05:00:00");
    await insert("nb-next", "NB-NEXT", "[본] 감귤 5kg", "2026-11-27 05:00:00");
    await insert("nb-dbonly", "NB-DBONLY", "DB센터에만 있는 상품", "2026-02-10 00:00:00");
  }

  it("비교(책갈피 1.11.0)가 보낸 등록일시·목록 순서대로 — 같은 때 등록한 상품은 발주오라 목록 순서, DB센터에만 있는 상품은 등록일시로 끼움", async () => {
    const admin = await adminToken();
    await seed();
    // 두 번에 나눠 보내도 목록 순서(position)를 그대로 씁니다. 묶음 상품은 순서에 넣지 않음.
    const jobId = await compare(admin, [
      [
        snapshot({ id: BJ_BULK_TOP, code: "NB-TOP", name: "네이처맥스", createdAt: "2026-03-02T02:00:00.000Z", position: 0 }),
        snapshot({ id: BJ_BULK_NEXT, code: "NB-NEXT", name: "감귤", createdAt: "2026-03-02T02:00:00.000Z", position: 1 })
      ],
      [
        snapshot({ id: "bundle-1", kind: "bundle", code: "NB-BUNDLE", name: "묶음", createdAt: "2026-02-01T00:00:00.000Z", position: 2 }),
        snapshot({ id: BJ_OLD, code: "NB-OLD", name: "하이웰", createdAt: "2026-01-05T01:00:00.000Z", position: 3 })
      ]
    ]);
    const order = await api<Order>(admin, ORDER_PATH);
    expect(order.status).toBe(200);
    expect(order.data.ids).toEqual(["nb-top", "nb-next", "nb-dbonly", "nb-old"]);
    expect(order.data).toMatchObject({ total: 4, linked: 3, exact: 3 });
    expect(order.data.comparedAt).not.toBeNull();
    // 번호(화면): 전체 4개 → 맨 위 4, 맨 아래 1 — 발주오라처럼 '목록 상품 수 − 순서'
    expect(order.data.ids.map((id, index, list) => [id, list.length - index])).toEqual([["nb-top", 4], ["nb-next", 3], ["nb-dbonly", 2], ["nb-old", 1]]);
    // 순서 기록은 끝난 작업 기록에 남기지 않고 따로 저장(작업 기록이 커지지 않게)
    const job = await executeSql("SELECT results FROM baljuora_sync_jobs WHERE id = ?", [jobId]);
    expect(JSON.parse(String(job.rows[0]?.results)).order).toBeUndefined();
    const stored = await executeSql("SELECT value FROM baljuora_sync_store WHERE key = 'baljuora_order'");
    expect(Object.keys(JSON.parse(String(stored.rows[0]?.value)).items).sort()).toEqual([BJ_BULK_NEXT, BJ_BULK_TOP, BJ_OLD].sort());
  });

  it("아직 1.11.0으로 비교한 적이 없으면 발주오라 상품 id(UUIDv7)의 시각으로 계산하고, 예전 책갈피 비교도 도착 순서(= 목록 순서)를 씁니다", async () => {
    const admin = await adminToken();
    await seed();
    // 예전 책갈피(등록일시·순서 없음): 도착 순서 = 발주오라 목록 순서
    await compare(admin, [[
      snapshot({ id: BJ_BULK_TOP, code: "NB-TOP", name: "네이처맥스" }),
      snapshot({ id: BJ_BULK_NEXT, code: "NB-NEXT", name: "감귤" }),
      snapshot({ id: BJ_OLD, code: "NB-OLD", name: "하이웰" })
    ]]);
    expect((await api<Order>(admin, ORDER_PATH)).data.ids).toEqual(["nb-top", "nb-next", "nb-dbonly", "nb-old"]);
    // 순서 기록이 없으면(이번 배포 전 비교만 있음) UUIDv7 시각 → 같은 ms면 발주오라 상품 id 큰 순서
    await executeSql("DELETE FROM baljuora_sync_store WHERE key = 'baljuora_order'");
    const fallback = await api<Order>(admin, ORDER_PATH);
    expect(fallback.data.ids).toEqual(["nb-next", "nb-top", "nb-dbonly", "nb-old"]);
    expect(fallback.data).toMatchObject({ comparedAt: null, linked: 3, exact: 0 });
  });

  it("마지막 비교에 없던 발주오라 상품(발주오라에서 지움)과 이어진 상품은 DB센터 등록일시로 끼우고, 로그인 없으면 401", async () => {
    const admin = await adminToken();
    await seed();
    await compare(admin, [[
      snapshot({ id: BJ_BULK_TOP, code: "NB-TOP", name: "네이처맥스", createdAt: "2026-03-02T02:00:00.000Z", position: 0 }),
      snapshot({ id: BJ_BULK_NEXT, code: "NB-NEXT", name: "감귤", createdAt: "2026-03-02T02:00:00.000Z", position: 1 }),
      snapshot({ id: BJ_OLD, code: "NB-OLD", name: "하이웰", createdAt: "2026-01-05T01:00:00.000Z", position: 2 })
    ]]);
    // 다음 비교에서 하이웰이 발주오라에서 사라짐 → DB센터 등록일시(2026-11-27)로 맨 위
    await compare(admin, [[
      snapshot({ id: BJ_BULK_TOP, code: "NB-TOP", name: "네이처맥스", createdAt: "2026-03-02T02:00:00.000Z", position: 0 }),
      snapshot({ id: BJ_BULK_NEXT, code: "NB-NEXT", name: "감귤", createdAt: "2026-03-02T02:00:00.000Z", position: 1 })
    ]]);
    expect((await api<Order>(admin, ORDER_PATH)).data.ids).toEqual(["nb-old", "nb-top", "nb-next", "nb-dbonly"]);
    const anonymous = await app.fetch(new Request(`http://localhost${ORDER_PATH}`));
    expect(anonymous.status).toBe(401);
  });
});

// ─── 발주오라 대시보드 숫자 ────────────────────────────────────────────────────

const today = seoulDateKey();
const month = today.slice(0, 7);
const firstDay = `${month}-01`;
const at = (date: string, hour = 3) => `${date}T${String(hour).padStart(2, "0")}:00:00.000Z`;

function line(id: string, partial: Record<string, unknown>) {
  return { id, orderId: `o-${id}`, orderedAt: at(firstDay), status: "delivered", productId: "bj-tm", productCode: null, productName: "토종 천마 70ml 30포", supplierId: "bj-sup", supplierName: "지리산마천농협", sellerId: "s-nado", sellerName: "나도건강", quantity: 1, netQuantity: 1, supplyPrice: 10000, purchaseCost: 9000, salesShippingFee: 0, purchaseShippingFee: 0, ...partial };
}

// 나도건강: 주문 o-1(상품 2줄) · 주문 o-2(전량 반품 처리된 줄) · 티젠아이: 1줄 · 취소 1줄 · 주문대기 1줄
const LINES = [
  line("a-1", { orderId: "o-1", quantity: 2, netQuantity: 2, salesShippingFee: 3000, purchaseShippingFee: 3000 }),
  line("a-2", { orderId: "o-1", productId: "bj-msm", productName: "관절건강 MSM 30포", supplyPrice: 5000, purchaseCost: 4500 }),
  line("a-3", { orderId: "o-2", supplyPrice: 7000, netQuantity: 0, salesShippingFee: 3000 }),
  line("b-1", { orderId: "o-3", sellerId: "s-tzen", sellerName: "티젠아이", supplyPrice: 20000, purchaseCost: 18000, salesShippingFee: 4000, purchaseShippingFee: 4000 }),
  line("c-1", { orderId: "o-4", status: "cancelled", supplyPrice: 99000 }),
  line("d-1", { orderId: "o-5", status: "pending", supplyPrice: 55000 })
];

const BUYERS = [
  { id: "s-nado", companyName: "나도건강", representativeName: "나대표", businessNumber: "123-45-67890", status: "ACTIVE" },
  { id: "s-tzen", companyName: "티젠아이", representativeName: "티대표", businessNumber: "222-33-44444", status: "ACTIVE" }
];

// 발주오라 대시보드 응답(칸 이름은 흉내): 배송비 포함 · 주문 상품 줄 수(전량 반품 줄·취소·주문대기 뺌)
function dashboard(sellers: Array<{ sellerName: string; orderCount: number; totalAmount: number }>) {
  return {
    at: new Date().toISOString(),
    page: "/doogofood/dashboard",
    responses: [
      { endpoint: "statistics/recent-orders", params: {}, fromPage: true, status: 200, data: { pending: 1, accepted: 0, purchased: 0, preparing: 0, shipping: 1, delivered: 3, total: 4, cancelled: 1, returned: 0, exchanged: 0 } },
      { endpoint: "statistics/summary-by-period", params: {}, fromPage: true, status: 200, data: { thisMonth: { sales: 52000, purchase: 47500, margin: 4500 } } },
      { endpoint: "statistics/top-sellers", params: { limit: "5" }, fromPage: true, status: 200, data: sellers },
      { endpoint: "statistics/top-products", params: {}, fromPage: true, status: 404, error: "Not Found" },
      { endpoint: "orders/items", params: {}, fromPage: false, status: 200, data: { 아무것: 1 } }
    ]
  };
}

async function salesSync(admin: string, dashboardPayload: unknown) {
  const created = await api<{ code: string; job: { id: string } }>(admin, "/api/baljuora/admin/jobs", "POST", { type: "sales", months: 2 });
  expect(created.ok).toBe(true);
  const start = await runner(created.data.code);
  // 판매 작업은 발주오라 대시보드 숫자도 읽으라고 알려 줌(책갈피 1.11.0)
  expect(start.body?.data?.plan).toMatchObject({ type: "sales", start: `${nextMonthKey(month, -1)}-01`, end: today, dashboard: true });
  await runner(created.data.code, "/results", { final: false, dashboard: dashboardPayload });
  await runner(created.data.code, "/results", { final: false, buyers: BUYERS });
  await runner(created.data.code, "/results", { final: false, salesLines: LINES });
  await runner(created.data.code, "/results", { final: true, salesDone: { complete: true, error: null } });
  return created.data.job.id;
}

type Official = {
  available: boolean;
  view: { recentOrders: { items: Array<{ key: string; label: string; count: number }> } | null; periods: Array<{ key: string; sales: number | null; purchase: number | null; margin: number | null }> | null; topSellers: { period: { key: string }; rows: Array<{ name: string; orders: number | null; amount: number | null }> } | null; topProducts: unknown; errors: Array<{ endpoint: string; status: number }> };
  ours: { periods: Array<{ key: string; sales: number | null; ours: { sales: number; purchase: number; margin: number } }>; sellers: Array<{ name: string; orders: number | null; amount: number | null; ours: { orders: number; amount: number } | null }> };
  recentOurs: { total: number; cancelled: number } | null;
  basis: Record<string, unknown>;
  basisText: string;
  calibration: { score: number; total: number } | null;
};

describe("발주오라 대시보드 숫자와 DB센터 판매 숫자 맞추기", () => {
  it("주문 동기화 때 읽은 대시보드 숫자를 그대로 보여 주고, 같은 기준(배송비 포함 · 주문 상품 줄 수)의 DB센터 계산과 칸마다 맞춰 봅니다", async () => {
    const admin = await adminToken();
    const before = await api<Official>(admin, "/api/baljuora/admin/sales/official");
    expect(before.data).toMatchObject({ available: false, basisText: "배송비 포함 · 주문 상품 줄 수 · 전량 취소·반품 줄 뺌 · 주문대기 뺌" });

    // 나도건강: o-1 두 줄(20,000 + 배송비 3,000 + 5,000) = 2건 28,000 · 티젠아이 1건 24,000
    await salesSync(admin, dashboard([{ sellerName: "나도건강", orderCount: 2, totalAmount: 28000 }, { sellerName: "티젠아이", orderCount: 1, totalAmount: 24000 }]));
    const official = await api<Official>(admin, "/api/baljuora/admin/sales/official");
    expect(official.status).toBe(200);
    expect(official.data.available).toBe(true);
    expect(official.data.basis).toEqual(DEFAULT_SALES_BASIS);
    expect(official.data.calibration).toMatchObject({ score: 5, total: 5 });
    expect(official.data.view.recentOrders?.items.map((item) => [item.label, item.count])).toEqual([["주문대기", 1], ["주문접수", 0], ["발주완료", 0], ["배송준비중", 0], ["배송중", 1], ["배송완료", 3], ["전체주문", 4], ["취소", 1], ["반품", 0], ["교환", 0]]);
    expect(official.data.view.topSellers?.period.key).toBe("thisMonth");
    expect(official.data.ours.sellers.map((row) => [row.name, row.orders, row.ours?.orders, row.amount, row.ours?.amount])).toEqual([["나도건강", 2, 2, 28000, 28000], ["티젠아이", 1, 1, 24000, 24000]]);
    expect(official.data.ours.periods.map((row) => [row.key, row.sales, row.ours.sales, row.ours.purchase, row.ours.margin])).toEqual([["thisMonth", 52000, 52000, 18000 + 3000 + 4500 + 18000 + 4000, 52000 - 47500]]);
    // 읽지 못한 칸(상품별 매출 404)·모르는 주소는 버림
    expect(official.data.view.topProducts).toBeNull();
    expect(official.data.view.errors).toEqual([{ endpoint: "statistics/top-products", status: 404, message: "Not Found" }]);

    // 판매 현황·매출처 순위도 같은 기준
    const summary = await api<{ topBuyers: Array<{ name: string; amount: number; orders: number }>; basisText: string }>(admin, `/api/baljuora/admin/sales/summary?from=${firstDay}&to=${today}`);
    expect(summary.data.topBuyers.map((row) => [row.name, row.orders, row.amount])).toEqual([["나도건강", 2, 28000], ["티젠아이", 1, 24000]]);
    // 운영 홈 주문 동기화 요약: 발주오라 대시보드 '최근 7일간 주문 현황' 그대로
    const ops = await api<{ orders: { official: { items: Array<{ key: string; count: number }> } | null } }>(admin, "/api/baljuora/admin/ops-sync");
    expect(ops.data.orders.official?.items.find((item) => item.key === "total")?.count).toBe(4);
  });

  it("발주오라가 다른 기준(배송비 뺌·주문 수)으로 세면 그 기준을 골라 판매 현황도 같은 숫자로 보여 줍니다", async () => {
    const admin = await adminToken();
    // 나도건강: 주문 o-1·o-2 = 2건, 배송비 뺀 금액 20,000 + 5,000 = 25,000 · 티젠아이 1건 20,000
    await salesSync(admin, dashboard([{ sellerName: "나도건강", orderCount: 2, totalAmount: 25000 }, { sellerName: "티젠아이", orderCount: 1, totalAmount: 20000 }]));
    const official = await api<Official>(admin, "/api/baljuora/admin/sales/official");
    expect(official.data.basis).toMatchObject({ amount: "net" });
    expect(official.data.basisText.startsWith("배송비 뺌")).toBe(true);
    expect(official.data.ours.sellers.every((row) => row.ours?.amount === row.amount && row.ours?.orders === row.orders)).toBe(true);
    const summary = await api<{ topBuyers: Array<{ name: string; amount: number }> }>(admin, `/api/baljuora/admin/sales/summary?from=${firstDay}&to=${today}`);
    expect(summary.data.topBuyers.map((row) => [row.name, row.amount])).toEqual([["나도건강", 25000], ["티젠아이", 20000]]);
  });

  it("하나도 맞지 않으면(발주오라 응답을 잘못 읽음) 기준을 바꾸지 않습니다", async () => {
    const admin = await adminToken();
    await salesSync(admin, { at: new Date().toISOString(), page: null, responses: [{ endpoint: "statistics/top-sellers", params: {}, fromPage: false, status: 200, data: [{ sellerName: "나도건강", orderCount: 77, totalAmount: 1 }] }] });
    const official = await api<Official>(admin, "/api/baljuora/admin/sales/official");
    expect(official.data.basis).toEqual(DEFAULT_SALES_BASIS);
    expect(official.data.calibration).toBeNull();
  });
});

describe("발주오라 대시보드 응답 읽기(공용 규칙)", () => {
  it("칸 이름이 달라도 흔한 이름·숫자 크기로 매출처·상품·기간·주문 현황을 읽습니다", () => {
    expect(parseTopRows({ items: [{ seller: { companyName: "나도건강" }, cnt: 102, sum: 4257500 }] }, "seller")).toEqual([{ name: "나도건강", orders: 102, amount: 4257500 }]);
    expect(parseTopRows([{ name: "로코상점", a: 44, b: 899800 }], "seller")).toEqual([{ name: "로코상점", orders: 44, amount: 899800 }]);
    expect(parseTopRows({ data: [{ productName: "토종 천마", salesQuantity: 85, totalAmount: "1,178,000" }] }, "product")).toEqual([{ name: "토종 천마", quantity: 85, amount: 1178000 }]);
    expect(parsePeriods([{ period: "TODAY", salesAmount: 219710, purchaseAmount: 213300 }, { period: "LAST_MONTH", revenue: 7249360, cost: 7085658, profit: 163702 }])).toEqual([
      { key: "today", label: "오늘", sales: 219710, purchase: 213300, margin: 6410 },
      { key: "lastMonth", label: "저번달", sales: 7249360, purchase: 7085658, margin: 163702 }
    ]);
    // 칸 이름을 몰라도 '큰 수 − 가운데 = 작은 수'면 매출·매입·마진
    expect(parsePeriods({ thisMonth: { x: 12020997, y: 11630220, z: 390777 } })?.[0]).toMatchObject({ sales: 12020997, purchase: 11630220, margin: 390777 });
    expect(parseRecentOrders({ statusCounts: { PURCHASED: 2, SHIPPING: 48, DELIVERED: 94 }, totalCount: 144, csCounts: { cancelCount: 26, returnCount: 0, exchangeCount: 0 } })?.items.map((item) => [item.label, item.count])).toEqual([["발주완료", 2], ["배송중", 48], ["배송완료", 94], ["전체주문", 144], ["취소", 26], ["반품", 0], ["교환", 0]]);
    expect(parseRecentOrders([{ status: "pending", count: 0 }, { status: "in_delivery", count: 48 }])?.items.map((item) => item.key)).toEqual(["pending", "shipping"]);
  });

  it("기준 고르기: 발주오라 숫자가 없으면 null", () => {
    const view = parseBaljuoraDashboard({ at: "2026-11-27T00:00:00.000Z", jobId: null, page: null, responses: [] }, "2026-11-27");
    expect(calibrateSalesBasis([], view, "2026-11-27")).toBeNull();
  });
});
