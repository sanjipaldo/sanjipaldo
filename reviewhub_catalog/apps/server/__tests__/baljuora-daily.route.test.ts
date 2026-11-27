// 아침 동기화(운영 홈 '발주오라 → DB센터 동기화', 2026-11-26 관리자 요청 "출근해서 버튼 하나 누르면 발주오라에서 바뀐 정산·매출·주문·상품을
// DB센터에 싹다 맞추고, 몇 일 몇 시에 업데이트됐는지 버튼 밑에"). 발주오라 쪽은 책갈피가 보내는 결과 JSON으로 흉내 냅니다.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { BaljuoraProductSnapshot } from "@repo/shared/baljuora-sync";

process.env.SKYBASE_DB_ENDPOINT = `file:${join(mkdtempSync(join(tmpdir(), "baljuora-daily-")), "test.db")}`;
const { default: app } = await import("../_core/create-app");
const { executeSql } = await import("../_core/db");
const { applyMigrations, fetchWithAuth, signUpAndGetToken } = await import("../_test/helpers");

type Daily = {
  ready: boolean;
  needsApply: boolean;
  applying: { done: number; total: number } | null;
  job: { id: string; status: string; daily?: boolean } | null;
  last: null | { jobId: string; finishedAt: string | null; updated: number; created: number; conflicts: number; pushPending: number; failed: number; totalProducts: number; totalOnly: number; products: { received: number; linked: number; baljuoraOnly: number } | null; sales: { lines: number; buyers: number; complete: boolean } | null };
};
type Apply = { status: "applying" | "done" | "busy"; done: number; total: number; last: Daily["last"] };

function snapshot(partial: Partial<BaljuoraProductSnapshot> & { id: string }): BaljuoraProductSnapshot {
  return { kind: "product", code: null, name: "", supplyPrice: null, consumerPrice: null, purchaseCost: null, imageUrls: [], isVisible: true, isSoldOut: false, updatedAt: "2026-11-26T00:00:00Z", ...partial };
}

describe("아침 동기화(운영 홈 버튼)", () => {
  beforeAll(async () => {
    await applyMigrations();
    const insert = "INSERT INTO products (id, productCode, name, imageUrl, supplierName, costPrice, aPrice, generalPrice, salePrice, salePriceMode, shippingType, categoryId, isVisible, isSoldOut, isAlwaysOnSale, displayOrder) VALUES (?, ?, ?, NULL, '봄날농원', ?, ?, ?, NULL, 'autonomous', 'domestic', 'cat-domestic-farm', 1, 0, 1, ?)";
    await executeSql(insert, ["dl-1", "DL-001", "사과 5kg", 20000, 26000, 26000, 1]);
    await executeSql(insert, ["dl-2", "DL-002", "배 7kg", 30000, 38000, 38000, 2]);
  });

  async function adminToken() {
    const user = await signUpAndGetToken(app);
    await executeSql("UPDATE user SET role = ?, emailVerified = 1 WHERE id = ?", ["admin", user.userId!]);
    return user.token;
  }

  async function call<T>(admin: string, path: string, method = "GET", body?: unknown): Promise<{ status: number; ok: boolean; data: T; message?: string }> {
    const res = await fetchWithAuth(app, admin, `/api/baljuora${path}`, body === undefined ? { method } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const parsed = (await res.json()) as { ok: boolean; data: T; error?: { message?: string } };
    return { status: res.status, ok: parsed.ok, data: parsed.data, message: parsed.error?.message };
  }

  async function runner<T>(code: string, path = "", body?: unknown) {
    const res = await app.fetch(new Request(`http://localhost/api/baljuora/runner/${code}${path}`, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json", origin: "https://console.baljuora.com" }, body: JSON.stringify(body) }));
    return (await res.json()) as { ok: boolean; data: T };
  }

  async function applyAll(admin: string) {
    const steps: Apply[] = [];
    for (let round = 0; round < 10; round += 1) {
      const step = await call<Apply>(admin, "/admin/daily/apply", "POST");
      expect(step.ok).toBe(true);
      steps.push(step.data);
      if (step.data.status === "done") break;
    }
    return steps;
  }

  const BUYER = { id: "s-green", companyName: "그린마켓", representativeName: "김대표", businessNumber: "123-45-67890", businessType: "도소매", businessCategory: "농산물", email: null, phone: null, managerName: null, zipCode: null, address: "서울", addressDetail: null, groupId: null, groupName: null, status: "ACTIVE", orderAcceptType: null, username: null, lastLoginAt: null, joinedAt: null };

  it("버튼 → 판매 포함 읽기(설정과 상관없이) → 발주오라 변경·새 상품 반영(25개씩) → 마지막 동기화 시각, 같은 회차는 두 번 반영하지 않음", async () => {
    const admin = await adminToken();
    await call(admin, "/admin/settings", "PUT", { salesOnCompare: false });
    let status = await call<Daily>(admin, "/admin/daily");
    expect(status.data).toMatchObject({ ready: true, last: null, job: null, needsApply: false });

    const started = await call<{ code: string; consoleUrl: string; job: { id: string; daily: boolean } }>(admin, "/admin/daily/start", "POST");
    expect(started.ok).toBe(true);
    expect(started.data.job.daily).toBe(true);
    expect(started.data.consoleUrl).toContain("#doogo-sync=");
    // 책갈피를 누르기 전에는 반영할 것이 없음
    expect((await call(admin, "/admin/daily/apply", "POST")).status).toBe(409);

    const plan = await runner<{ plan: { type: string; daily?: boolean; sales?: { start: string; end: string } | null } }>(started.data.code);
    expect(plan.data.plan).toMatchObject({ type: "compare", daily: true });
    expect(plan.data.plan.sales).toBeTruthy(); // 판매·주문·매출처도 읽음(설정에서 꺼 두었어도)
    // 읽는 중에는 버튼을 다시 눌러도 새로 만들지 않음
    const again = await call(admin, "/admin/daily/start", "POST");
    expect(again.status).toBe(409);

    const today = plan.data.plan.sales!.end;
    await runner(started.data.code, "/results", {
      final: true,
      categories: [{ id: "bj-farm", name: "🥕 농산", children: [] }],
      snapshots: [
        snapshot({ id: "bj-1", code: "DL-001", name: "사과 5kg", supplyPrice: 26000, purchaseCost: 20000, groupPrice: null, categoryIds: ["bj-farm"], shippingPolicyId: null, isSoldOut: true }),
        snapshot({ id: "bj-2", code: "DL-002", name: "배 7kg", supplyPrice: 38000, purchaseCost: 30000, groupPrice: null, categoryIds: ["bj-farm"], shippingPolicyId: null }),
        snapshot({ id: "bj-9", code: "DL-009", name: "곶감 1kg", supplyPrice: 18000, purchaseCost: 12000, groupPrice: null, categoryIds: ["bj-farm"], shippingPolicyId: null })
      ],
      buyers: [BUYER],
      salesLines: [{ id: "i-1", orderId: "o-1", orderedAt: `${today}T01:00:00Z`, status: "delivered", productId: "bj-1", productCode: "DL-001", productName: "사과 5kg", supplierId: "bj-sup", supplierName: "봄날농원", sellerId: "s-green", sellerName: "그린마켓", quantity: 2, netQuantity: 2, supplyPrice: 26000, purchaseCost: 20000, salesShippingFee: 0, purchaseShippingFee: 0 }],
      salesDone: { complete: true }
    });
    status = await call<Daily>(admin, "/admin/daily");
    expect(status.data).toMatchObject({ needsApply: true, job: { status: "done", daily: true } });
    // 진행 확인(light)도 아침 동기화 작업으로 보임(plan에서 DB가 daily만 꺼냄, 2026-11-27)
    const light = await call<{ job: { daily: boolean; status: string; items?: unknown } }>(admin, `/admin/jobs/${started.data.job.id}?light=1`);
    expect(light.data.job).toMatchObject({ daily: true, status: "done" });
    expect(light.data.job.items).toBeUndefined();

    const steps = await applyAll(admin);
    expect(steps.map((step) => [step.status, step.done, step.total])).toEqual([["applying", 1, 2], ["done", 2, 2]]);
    const last = steps.at(-1)!.last!;
    expect(last).toMatchObject({ updated: 1, created: 1, failed: 0, totalProducts: 1, totalOnly: 1, products: { received: 3, linked: 2, baljuoraOnly: 1 }, sales: { lines: 1, buyers: 1, complete: true } });
    expect(Date.parse(last.finishedAt!)).toBeGreaterThan(Date.now() - 60_000);
    // 발주오라 품절 → DB센터 품절, 발주오라에만 있던 곶감 → DB센터에 숨김으로 등록, 주문 줄도 들어옴
    expect((await executeSql("SELECT isSoldOut FROM products WHERE id = 'dl-1'")).rows[0]).toMatchObject({ isSoldOut: 1 });
    expect((await executeSql("SELECT isVisible FROM products WHERE productCode = 'DL-009'")).rows[0]).toMatchObject({ isVisible: 0 });
    expect(Number((await executeSql("SELECT COUNT(*) AS c FROM baljuora_sales_lines")).rows[0].c)).toBe(1);

    status = await call<Daily>(admin, "/admin/daily");
    expect(status.data).toMatchObject({ needsApply: false, applying: null, last: { jobId: started.data.job.id } });
    const repeat = await call<Apply>(admin, "/admin/daily/apply", "POST");
    expect(repeat.data).toMatchObject({ status: "done", last: { jobId: started.data.job.id } });
    expect((await executeSql("SELECT COUNT(*) AS c FROM products WHERE productCode = 'DL-009'")).rows[0].c).toBe(1);
  });

  it("다음 날: 발주오라에서 바뀐 공급가는 반영하고, 양쪽에서 바뀐 소비자가는 그대로 두고 알려 줌", async () => {
    const admin = await adminToken();
    // DB센터에서 사과 지정 판매가(소비자가)를 정함 → 발주오라도 소비자가를 바꿈(양쪽 다 바뀜) + 발주오라만 공급가를 바꿈
    await executeSql("UPDATE products SET salePriceMode = 'fixed', salePrice = 39000 WHERE id = 'dl-1'");
    const started = await call<{ code: string }>(admin, "/admin/daily/start", "POST");
    await runner(started.data.code);
    await runner(started.data.code, "/results", {
      final: true,
      snapshots: [
        snapshot({ id: "bj-1", code: "DL-001", name: "사과 5kg", supplyPrice: 27000, consumerPrice: 41000, purchaseCost: 20000, groupPrice: null, categoryIds: ["bj-farm"], shippingPolicyId: null, isSoldOut: true }),
        snapshot({ id: "bj-2", code: "DL-002", name: "배 7kg", supplyPrice: 38000, purchaseCost: 30000, groupPrice: null, categoryIds: ["bj-farm"], shippingPolicyId: null })
      ],
      salesDone: { complete: true }
    });
    const steps = await applyAll(admin);
    const last = steps.at(-1)!.last!;
    expect(last).toMatchObject({ updated: 1, created: 0, conflicts: 1 });
    expect(last.pushPending).toBeGreaterThanOrEqual(1);
    const row = (await executeSql("SELECT generalPrice, salePrice FROM products WHERE id = 'dl-1'")).rows[0];
    expect(row).toMatchObject({ generalPrice: 27000, salePrice: 39000 });
    const changes = await call<{ items: Array<{ productId: string; diffs: Array<{ field: string; direction: string }> }> }>(admin, "/admin/changes");
    expect(changes.data.items.find((item) => item.productId === "dl-1")?.diffs.map((diff) => [diff.field, diff.direction])).toEqual([["consumerPrice", "both"]]);
  });
});
