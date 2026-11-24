// 공급사 센터(2026-11-20): 마스터가 만든 공급사 계정으로 로그인 → 자기 상품만 보기 → 변경·신규 등록 요청 →
// 마스터 승인/반려 → 판매·정산 계산. 관리자 API 인증은 그대로(공급사 계정은 관리자 API를 못 씀).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

// 상품 저장·승인은 기존 저장 함수(db.transaction)를 그대로 씁니다. :memory: DB는 트랜잭션이 새 연결을 열면
// 내용이 사라지므로, 이 파일만 임시 파일 DB를 씁니다(운영 원격 DB에서는 트랜잭션이 정상 동작).
process.env.SKYBASE_DB_ENDPOINT = `file:${join(mkdtempSync(join(tmpdir(), "supplier-portal-")), "test.db")}`;
const { default: app } = await import("../_core/create-app");
const { executeSql } = await import("../_core/db");
const { applyMigrations, fetchWithAuth, resetDatabase, signUpAndGetToken } = await import("../_test/helpers");

const CATEGORY = "cat-domestic-farm";

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await resetDatabase();
  await executeSql("DELETE FROM supplier_requests");
  await executeSql("DELETE FROM supplier_sales");
  await executeSql("DELETE FROM baljuora_sales_lines");
  await executeSql("DELETE FROM supplier_settlements");
  await executeSql("DELETE FROM baljuora_sync_store WHERE key = 'supplier_settlement_settings'");
  await executeSql("DELETE FROM supplier_accounts");
  await executeSql("DELETE FROM price_histories WHERE productId IN ('p-a1', 'p-a2', 'p-b1')");
  await executeSql("DELETE FROM product_options WHERE productId IN ('p-a1', 'p-a2', 'p-b1')");
  await executeSql("DELETE FROM catalog_activity_logs WHERE productId IN ('p-a1', 'p-a2', 'p-b1')");
  await executeSql("DELETE FROM products WHERE id IN ('p-a1', 'p-a2', 'p-b1') OR supplierName IN ('봄날농원(테스트)', '이웃농장(테스트)', '봄날농원 리뉴얼')");
  await executeSql("DELETE FROM suppliers WHERE id IN ('sup-a', 'sup-b')");
  await executeSql("INSERT INTO suppliers (id, name, isActive) VALUES ('sup-a', '봄날농원(테스트)', 1), ('sup-b', '이웃농장(테스트)', 1)");
  const insert = "INSERT INTO products (id, productCode, name, supplierName, costPrice, aPrice, generalPrice, salePrice, salePriceMode, shippingType, categoryId, isVisible, isSoldOut, isAlwaysOnSale, displayOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'domestic', ?, 1, 0, 1, ?)";
  await executeSql(insert, ["p-a1", "TST-A1", "봄날 사과 5kg", "봄날농원(테스트)", 20000, 24000, 26000, 39000, "fixed", CATEGORY, 1]);
  await executeSql(insert, ["p-a2", "TST-A2", "봄날 배 7.5kg", "봄날농원(테스트)", 30000, 35000, 38000, null, "autonomous", CATEGORY, 2]);
  await executeSql(insert, ["p-b1", "TST-B1", "이웃 감귤 3kg", "이웃농장(테스트)", 9000, 11000, 12000, null, "autonomous", CATEGORY, 3]);
});

async function adminToken() {
  const user = await signUpAndGetToken(app);
  await executeSql("UPDATE user SET role = ?, emailVerified = 1 WHERE id = ?", ["admin", user.userId!]);
  return user.token;
}

async function json<T>(res: Response) {
  return (await res.json()) as { ok: boolean; data: T; error?: { message?: string } };
}

async function createAccount(admin: string, supplierId = "sup-a", username = "sup", password = "sup") {
  const res = await fetchWithAuth(app, admin, `/api/catalog/admin/suppliers/${supplierId}/account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  return res;
}

async function signIn(username: string, password: string) {
  const res = await app.fetch(new Request("http://localhost/api/auth/sign-in/username", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ username, password })
  }));
  return { res, token: res.headers.get("set-auth-token") };
}

async function supplierToken(admin: string) {
  expect((await createAccount(admin)).status).toBe(201);
  const { token } = await signIn("sup", "sup");
  expect(token).toBeTruthy();
  return token!;
}

async function postJson(token: string, path: string, body: unknown) {
  return fetchWithAuth(app, token, path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("공급사 계정", () => {
  it("마스터가 sup / sup 계정을 만들면 그 아이디로 로그인해 공급사 정보를 봅니다", async () => {
    const admin = await adminToken();
    const token = await supplierToken(admin);
    const me = await fetchWithAuth(app, token, "/api/supplier/me");
    expect(me.status).toBe(200);
    const body = await json<{ supplier: { name: string }; account: { username: string; commissionRate: number; settlementCycle: string } }>(me);
    expect(body.data.supplier.name).toBe("봄날농원(테스트)");
    expect(body.data.account).toMatchObject({ username: "sup", commissionRate: 10, settlementCycle: "monthly" });
    // 대문자로 쳐도 같은 아이디로 로그인됩니다.
    expect((await signIn("SUP", "sup")).token).toBeTruthy();
    // 같은 아이디는 다시 못 만듭니다.
    expect((await createAccount(admin, "sup-b", "sup", "abcd")).status).toBe(409);
  });

  it("로그인 없으면 401, 공급사 계정이 아니면 403, 공급사 계정은 관리자 API를 못 씁니다", async () => {
    expect((await app.fetch(new Request("http://localhost/api/supplier/me"))).status).toBe(401);
    const someone = await signUpAndGetToken(app);
    expect((await fetchWithAuth(app, someone.token, "/api/supplier/me")).status).toBe(403);
    const admin = await adminToken();
    const token = await supplierToken(admin);
    expect((await fetchWithAuth(app, token, "/api/catalog/admin/products")).status).toBe(403);
    expect((await fetchWithAuth(app, token, "/api/catalog/admin/supplier-requests")).status).toBe(403);
  });

  it("계정을 멈추면 바로 로그아웃되고, 비밀번호를 바꾸면 예전 로그인이 끊깁니다", async () => {
    const admin = await adminToken();
    const token = await supplierToken(admin);
    const put = (body: unknown) => fetchWithAuth(app, admin, "/api/catalog/admin/suppliers/sup-a/account", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect((await put({ password: "newpass99" })).status).toBe(200);
    expect((await fetchWithAuth(app, token, "/api/supplier/me")).status).toBe(401);
    expect((await signIn("sup", "sup")).token).toBeFalsy();
    const fresh = (await signIn("sup", "newpass99")).token!;
    expect((await fetchWithAuth(app, fresh, "/api/supplier/me")).status).toBe(200);
    expect((await put({ isActive: false })).status).toBe(200);
    const again = (await signIn("sup", "newpass99")).token!;
    const blocked = await fetchWithAuth(app, again, "/api/supplier/me");
    expect(blocked.status).toBe(403);
    // 계정 삭제
    expect((await fetchWithAuth(app, admin, "/api/catalog/admin/suppliers/sup-a/account", { method: "DELETE" })).status).toBe(200);
    expect((await signIn("sup", "newpass99")).token).toBeFalsy();
  });

  it("관리자 공급사 목록에 계정과 연결된 상품 수가 함께 옵니다", async () => {
    const admin = await adminToken();
    await createAccount(admin);
    const res = await fetchWithAuth(app, admin, "/api/catalog/admin/suppliers");
    const body = await json<{ accounts: Array<{ supplierId: string; username: string }>; productCounts: Record<string, number>; portalReady: boolean }>(res);
    expect(body.data.portalReady).toBe(true);
    expect(body.data.accounts).toEqual([expect.objectContaining({ supplierId: "sup-a", username: "sup" })]);
    expect(body.data.productCounts["봄날농원(테스트)"]).toBe(2);
  });
});

describe("공급사 상품과 변경 요청", () => {
  it("자기 상품만 보이고, 두고푸드 판매가(수강생 단가·일반공급가)는 보내지 않습니다", async () => {
    const admin = await adminToken();
    const token = await supplierToken(admin);
    const res = await fetchWithAuth(app, token, "/api/supplier/products");
    const body = await json<{ products: Array<Record<string, unknown>> }>(res);
    expect(body.data.products.map((item) => item.id)).toEqual(["p-a1", "p-a2"]);
    expect(body.data.products[0]).toMatchObject({ costPrice: 20000, salePrice: 39000, salePriceMode: "fixed" });
    expect(body.data.products[0]).not.toHaveProperty("aPrice");
    expect(body.data.products[0]).not.toHaveProperty("generalPrice");
  });

  it("수정 요청은 승인 전까지 상품을 바꾸지 않고, 승인하면 반영(가격 이력 기록)됩니다", async () => {
    const admin = await adminToken();
    const token = await supplierToken(admin);
    const first = await postJson(token, "/api/supplier/requests", { kind: "update", productId: "p-a1", changes: { costPrice: 21000, isSoldOut: false, name: "봄날 사과 5kg" } });
    expect(first.status).toBe(201);
    const created = await json<{ request: { id: string; changes: Record<string, unknown> } }>(first);
    // 그대로인 값(상품명·판매 상태)은 요청에 넣지 않습니다.
    expect(created.data.request.changes).toEqual({ costPrice: 21000 });
    // 같은 상품에 다시 보내면 대기 중인 요청을 새 내용으로 바꿉니다.
    const second = await postJson(token, "/api/supplier/requests", { kind: "update", productId: "p-a1", changes: { costPrice: 22000, isSoldOut: true }, note: "원물 시세 상승" });
    expect(second.status).toBe(200);
    const product = await executeSql("SELECT costPrice, isSoldOut, aPrice FROM products WHERE id = 'p-a1'");
    expect(product.rows[0]).toMatchObject({ costPrice: 20000, isSoldOut: 0 });

    const list = await json<{ requests: Array<{ id: string; status: string; changes: Record<string, unknown>; current: { aPrice: number } }>; counts: Record<string, number> }>(
      await fetchWithAuth(app, admin, "/api/catalog/admin/supplier-requests?status=pending")
    );
    expect(list.data.counts.pending).toBe(1);
    expect(list.data.requests[0].changes).toEqual({ costPrice: 22000, isSoldOut: true });
    expect(list.data.requests[0].current.aPrice).toBe(24000);
    const summary = await json<{ pending: number }>(await fetchWithAuth(app, admin, "/api/catalog/admin/supplier-requests/summary"));
    expect(summary.data.pending).toBe(1);

    const approve = await postJson(admin, `/api/catalog/admin/supplier-requests/${list.data.requests[0].id}/approve`, { aPrice: 26500 });
    expect(approve.status).toBe(200);
    const after = await executeSql("SELECT costPrice, isSoldOut, aPrice, generalPrice, isVisible FROM products WHERE id = 'p-a1'");
    expect(after.rows[0]).toMatchObject({ costPrice: 22000, isSoldOut: 1, aPrice: 26500, generalPrice: 26000, isVisible: 1 });
    const history = await executeSql("SELECT field, changedBy FROM price_histories WHERE productId = 'p-a1' ORDER BY field");
    expect(history.rows.map((row) => row.field)).toEqual(expect.arrayContaining(["aPrice", "costPrice"]));
    expect(String(history.rows[0].changedBy)).toContain("공급사 요청(봄날농원(테스트))");
    // 이미 처리한 요청은 다시 승인할 수 없습니다.
    expect((await postJson(admin, `/api/catalog/admin/supplier-requests/${list.data.requests[0].id}/approve`, {})).status).toBe(409);
    const mine = await json<{ requests: Array<{ status: string }> }>(await fetchWithAuth(app, token, "/api/supplier/requests"));
    expect(mine.data.requests[0].status).toBe("approved");
  });

  it("다른 공급사 상품은 요청할 수 없고, 바뀐 값이 없으면 보내지 않습니다", async () => {
    const admin = await adminToken();
    const token = await supplierToken(admin);
    expect((await postJson(token, "/api/supplier/requests", { kind: "update", productId: "p-b1", changes: { costPrice: 1 } })).status).toBe(404);
    expect((await postJson(token, "/api/supplier/requests", { kind: "update", productId: "p-a2", changes: { costPrice: 30000 } })).status).toBe(400);
    // 권장 판매가를 지정으로 바꾸면 금액이 꼭 있어야 합니다.
    expect((await postJson(token, "/api/supplier/requests", { kind: "update", productId: "p-a2", changes: { salePriceMode: "fixed" } })).status).toBe(400);
  });

  it("신규 등록 요청은 상품코드·카테고리를 넣고 승인하면 상품이 생기고, 반려하면 사유가 공급사에게 보입니다", async () => {
    const admin = await adminToken();
    const token = await supplierToken(admin);
    const res = await postJson(token, "/api/supplier/requests", {
      kind: "create",
      changes: { name: "봄날 샤인머스캣 2kg", costPrice: 25000, salePriceMode: "fixed", salePrice: 45000, isAlwaysOnSale: false, saleStartMonth: 8, saleEndMonth: 11, categoryId: CATEGORY, description: "당도 18브릭스 이상" }
    });
    expect(res.status).toBe(201);
    const id = (await json<{ request: { id: string } }>(res)).data.request.id;
    expect((await postJson(admin, `/api/catalog/admin/supplier-requests/${id}/approve`, {})).status).toBe(400);
    const approve = await postJson(admin, `/api/catalog/admin/supplier-requests/${id}/approve`, { productCode: "TST-NEW1", aPrice: 29000, generalPrice: 31000 });
    expect(approve.status).toBe(200);
    const created = await executeSql("SELECT name, supplierName, costPrice, aPrice, salePrice, salePriceMode, saleStartMonth, notes, isVisible FROM products WHERE productCode = 'TST-NEW1'");
    expect(created.rows[0]).toMatchObject({ name: "봄날 샤인머스캣 2kg", supplierName: "봄날농원(테스트)", costPrice: 25000, aPrice: 29000, salePrice: 45000, salePriceMode: "fixed", saleStartMonth: 8, isVisible: 1 });
    expect(String(created.rows[0].notes)).toContain("당도 18브릭스");
    // 승인된 신규 상품은 공급사 상품 목록에도 보입니다.
    const products = await json<{ products: Array<{ productCode: string }> }>(await fetchWithAuth(app, token, "/api/supplier/products"));
    expect(products.data.products.map((item) => item.productCode)).toContain("TST-NEW1");
    await executeSql("DELETE FROM products WHERE productCode = 'TST-NEW1'");

    const second = await json<{ request: { id: string } }>(await postJson(token, "/api/supplier/requests", { kind: "create", changes: { name: "봄날 홍시", costPrice: 15000 } }));
    expect((await postJson(admin, `/api/catalog/admin/supplier-requests/${second.data.request.id}/reject`, { reason: "상세 이미지가 필요해요" })).status).toBe(200);
    const mine = await json<{ requests: Array<{ id: string; status: string; reviewNote: string | null }> }>(await fetchWithAuth(app, token, "/api/supplier/requests"));
    expect(mine.data.requests.find((item) => item.id === second.data.request.id)).toMatchObject({ status: "rejected", reviewNote: "상세 이미지가 필요해요" });
  });

  it("공급사가 대기 중인 요청을 취소할 수 있습니다", async () => {
    const admin = await adminToken();
    const token = await supplierToken(admin);
    const id = (await json<{ request: { id: string } }>(await postJson(token, "/api/supplier/requests", { kind: "update", productId: "p-a2", changes: { isSoldOut: true } }))).data.request.id;
    expect((await postJson(token, `/api/supplier/requests/${id}/cancel`, {})).status).toBe(200);
    expect((await postJson(token, `/api/supplier/requests/${id}/cancel`, {})).status).toBe(409);
  });

  it("공급사 이름을 바꿔도 상품 연결이 유지됩니다", async () => {
    const admin = await adminToken();
    const token = await supplierToken(admin);
    const res = await fetchWithAuth(app, admin, "/api/catalog/admin/suppliers/sup-a", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "봄날농원 리뉴얼", isActive: true }) });
    expect(res.status).toBe(200);
    const products = await json<{ products: Array<{ id: string }> }>(await fetchWithAuth(app, token, "/api/supplier/products"));
    expect(products.data.products.map((item) => item.id)).toEqual(["p-a1", "p-a2"]);
  });
});

// 판매·정산은 발주오라 판매 줄(baljuora_sales_lines, 정산 장부)로 계산합니다(2026-11-25).
async function saleLine(id: string, values: { saleDate: string; supplierName?: string; productId?: string | null; productName: string; quantity: number; netQuantity?: number; unitPrice: number; unitCost?: number | null; purchaseShippingFee?: number; salesShippingFee?: number; status?: string }) {
  const net = values.netQuantity ?? values.quantity;
  await executeSql(
    "INSERT INTO baljuora_sales_lines (id, orderId, saleDate, status, productId, productName, supplierName, quantity, netQuantity, unitPrice, unitCost, amount, salesShippingFee, purchaseShippingFee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, `o-${id}`, values.saleDate, values.status ?? "delivered", values.productId ?? null, values.productName, values.supplierName ?? "봄날농원(테스트)", values.quantity, net, values.unitPrice, values.unitCost ?? null, values.unitPrice * net, values.salesShippingFee ?? 0, values.purchaseShippingFee ?? 0]
  );
}

async function putSettlement(admin: string, supplierId: string, body: unknown) {
  return fetchWithAuth(app, admin, `/api/catalog/admin/suppliers/${supplierId}/settlement`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("공급사 판매·정산", () => {
  it("판매수수료 방식: 이번 달 판매·반품·순위·수수료·배송비와 다음 달 1~3일 입금일·수수료 청구를 계산합니다", async () => {
    const admin = await adminToken();
    const token = await supplierToken(admin);
    await saleLine("s1", { saleDate: "2026-10-31", productId: "p-a1", productName: "봄날 사과 5kg", quantity: 10, unitPrice: 20000 });
    await saleLine("s2", { saleDate: "2026-11-02", productId: "p-a1", productName: "봄날 사과 5kg", quantity: 5, netQuantity: 4, unitPrice: 20000 });
    await saleLine("s3", { saleDate: "2026-11-02", productId: "p-a2", productName: "봄날 배 7.5kg", quantity: 6, unitPrice: 30000, purchaseShippingFee: 3000 });
    await saleLine("s4", { saleDate: "2026-11-03", productId: "p-a2", productName: "봄날 배 7.5kg", quantity: 2, unitPrice: 30000, status: "pending" });
    await saleLine("s5", { saleDate: "2026-11-02", supplierName: "이웃농장(테스트)", productId: "p-b1", productName: "이웃 감귤 3kg", quantity: 99, unitPrice: 10000 });
    const res = await fetchWithAuth(app, token, "/api/supplier/sales?month=2026-11");
    const body = await json<{
      type: string;
      totals: { saleAmount: number; returnAmount: number; netAmount: number; goodsAmount: number; shippingFee: number; payoutAmount: number; commission: number; netIncome: number };
      ranking: Array<{ productName: string; netAmount: number; returnQuantity: number; imageUrl: string | null }>;
      settlements: Array<{ payoutStart: string; payoutEnd: string; netAmount: number; payoutAmount: number }>;
      payoutDays: Array<{ date: string; amount: number }>;
      days: Array<{ date: string }>;
      fees: Array<{ month: string; commission: number; payoutStart: string; payoutEnd: string }>;
    }>(res);
    expect(body.data.type).toBe("commission");
    // 주문대기(s4)·다른 공급사(s5)는 빼고, 배송비는 100% 입금에 더함
    expect(body.data.totals).toMatchObject({ saleAmount: 280000, returnAmount: 20000, netAmount: 260000, goodsAmount: 260000, shippingFee: 3000, payoutAmount: 263000, commission: 26000, netIncome: 237000 });
    expect(body.data.ranking.map((item) => item.productName)).toEqual(["봄날 배 7.5kg", "봄날 사과 5kg"]);
    expect(body.data.ranking[1]).toMatchObject({ netAmount: 80000, returnQuantity: 1 });
    expect(body.data.settlements).toEqual([expect.objectContaining({ payoutStart: "2026-12-01", payoutEnd: "2026-12-03", netAmount: 260000, payoutAmount: 263000 })]);
    // 11월 달력에는 10월 판매분 입금일(11/1~3)이 찍힙니다.
    expect(body.data.payoutDays).toEqual([expect.objectContaining({ date: "2026-11-01", amount: 200000 })]);
    expect(body.data.days.map((day) => day.date)).toEqual(["2026-11-02"]);
    // 판매 수수료: 지난달·이번 달 판매분 → 다음 달 1~3일 두고푸드로
    expect(body.data.fees).toEqual([
      expect.objectContaining({ month: "2026-10", commission: 20000, payoutStart: "2026-11-01", payoutEnd: "2026-11-03" }),
      expect.objectContaining({ month: "2026-11", commission: 26000, payoutStart: "2026-12-01", payoutEnd: "2026-12-03" })
    ]);
  });

  it("주 정산이면 월~일 판매분을 다음 주 월요일에 입금합니다", async () => {
    const admin = await adminToken();
    await createAccount(admin);
    await fetchWithAuth(app, admin, "/api/catalog/admin/suppliers/sup-a/account", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settlementCycle: "weekly", commissionRate: 7 }) });
    const token = (await signIn("sup", "sup")).token!;
    await saleLine("w1", { saleDate: "2026-11-18", productId: "p-a1", productName: "봄날 사과 5kg", quantity: 2, unitPrice: 20000 });
    const body = await json<{ cycle: string; commissionRate: number; settlements: Array<{ start: string; payoutStart: string; netAmount: number; commission: number }> }>(
      await fetchWithAuth(app, token, "/api/supplier/sales?month=2026-11")
    );
    expect(body.data.cycle).toBe("weekly");
    const week = body.data.settlements.find((item) => item.start === "2026-11-16");
    expect(week).toMatchObject({ payoutStart: "2026-11-23", netAmount: 40000, commission: 2800 });
  });

  it("일반 도매(매입) 방식: 원가 × 수량 + 배송비를 주 정산으로, 수수료 없음 — 공급사 화면에는 두고푸드 판매가가 오지 않습니다", async () => {
    const admin = await adminToken();
    const token = await supplierToken(admin);
    // 정산 방식 저장(관리자만, 잘못된 값은 400). 계정 수수료율·주기도 같은 값으로 맞춤
    expect((await putSettlement(token, "sup-a", { type: "wholesale", cycle: "weekly" })).status).toBe(403);
    expect((await putSettlement(admin, "sup-a", { type: "wholesale", cycle: "daily" })).status).toBe(400);
    expect((await putSettlement(admin, "sup-a", { type: "commission", commissionRate: 150, cycle: "weekly" })).status).toBe(400);
    const saved = await json<{ settlement: { type: string; cycle: string; explicit: boolean } }>(await putSettlement(admin, "sup-a", { type: "wholesale", cycle: "weekly" }));
    expect(saved.data.settlement).toMatchObject({ type: "wholesale", cycle: "weekly", explicit: true });
    const list = await json<{ settlements: Record<string, { type: string; cycle: string; explicit: boolean }>; accounts: Array<{ supplierId: string; settlementCycle: string }> }>(await fetchWithAuth(app, admin, "/api/catalog/admin/suppliers"));
    expect(list.data.settlements["sup-a"]).toMatchObject({ type: "wholesale", cycle: "weekly", explicit: true });
    expect(list.data.settlements["sup-b"]).toMatchObject({ type: "commission", commissionRate: 10, cycle: "weekly", explicit: false });
    expect(list.data.accounts.find((item) => item.supplierId === "sup-a")?.settlementCycle).toBe("weekly");

    // 두고푸드 판매가 26,000원 · 원가 20,000원(발주오라 매입원가) / 원가가 없으면 DB센터 원가(배 30,000원) / 둘 다 없으면 '원가 모름'
    await saleLine("d1", { saleDate: "2026-11-18", productId: "p-a1", productName: "봄날 사과 5kg", quantity: 3, netQuantity: 2, unitPrice: 26000, unitCost: 20000, purchaseShippingFee: 4000, salesShippingFee: 5000 });
    await saleLine("d2", { saleDate: "2026-11-19", productId: "p-a2", productName: "봄날 배 7.5kg", quantity: 1, unitPrice: 38000, unitCost: null });
    await saleLine("d3", { saleDate: "2026-11-19", productId: null, productName: "모르는 상품", quantity: 1, unitPrice: 9000, unitCost: null });
    const res = await fetchWithAuth(app, token, "/api/supplier/sales?month=2026-11");
    const text = await res.clone().text();
    const body = await json<{
      type: string;
      totals: { saleAmount: number; returnAmount: number; netAmount: number; goodsAmount: number; shippingFee: number; payoutAmount: number; commission: number; costMissing: number };
      settlements: Array<{ start: string; payoutStart: string; payoutAmount: number; commission: number; costMissing: number }>;
      ranking: Array<{ productName: string; amount: number; netAmount: number }>;
      fees: unknown[];
    }>(res);
    expect(body.data.type).toBe("wholesale");
    expect(body.data.totals).toMatchObject({ saleAmount: 90000, returnAmount: 20000, netAmount: 70000, goodsAmount: 70000, shippingFee: 4000, payoutAmount: 74000, commission: 0, costMissing: 1 });
    expect(body.data.settlements.find((item) => item.start === "2026-11-16")).toMatchObject({ payoutStart: "2026-11-23", payoutAmount: 74000, commission: 0, costMissing: 1 });
    expect(body.data.ranking.find((item) => item.productName === "봄날 사과 5kg")).toMatchObject({ amount: 60000, netAmount: 40000 });
    expect(body.data.fees).toEqual([]);
    // 두고푸드 판매가(26,000·52,000·38,000원)는 공급사 응답에 없음
    for (const price of ["26000", "52000", "78000", "38000"]) expect(text).not.toContain(price);

    const me = await json<{ settlement: { type: string; cycle: string } }>(await fetchWithAuth(app, token, "/api/supplier/me"));
    expect(me.data.settlement).toMatchObject({ type: "wholesale", cycle: "weekly" });
    const dashboard = await json<{ settlement: { type: string }; fees: unknown[]; sales: { totals: { netAmount: number } } }>(await fetchWithAuth(app, token, "/api/supplier/dashboard"));
    expect(dashboard.data.settlement.type).toBe("wholesale");
    expect(dashboard.data.fees).toEqual([]);
  });
});
