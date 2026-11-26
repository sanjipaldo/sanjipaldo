// 발주오라 상품 정보 칸 양방향 동기화(2026-11-26 관리자 요청 "품절·상품 노출 정지를 DB센터에서 하고 발주오라로, 발주오라 상품관리자 페이지와
// 빠지는 거 없이 양방향으로"): 판매 상태(품절·도매몰 노출)·과세 여부·원산지·관리코드·바코드·내용량·발주상품명·발주단위·배송 단위·발주마감·
// 인증·간략설명·출고지·제조연월일·소비기한·택배사·해외배송. 발주오라 쪽은 책갈피가 보내는 결과 JSON으로 흉내 냅니다(실제 발주오라에 접속하지 않음).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  canPullDiff,
  canPushDiff,
  carryBaseline,
  contentComparable,
  courierComparable,
  diffBaljuoraProduct,
  doogoComparable,
  baljuoraComparable,
  doogoSyncValues,
  fillBaselineGaps,
  syncDateText,
  type BaljuoraBaseline,
  type BaljuoraFieldDiff,
  type BaljuoraProductSnapshot
} from "@repo/shared/baljuora-sync";
import { emptyProductExtras, formatContent, normalizeDeadline, normalizeProductExtras, productExtrasProblems } from "@repo/shared/product-extras";

process.env.SKYBASE_DB_ENDPOINT = `file:${join(mkdtempSync(join(tmpdir(), "baljuora-extras-")), "test.db")}`;
const { default: app } = await import("../_core/create-app");
const { executeSql } = await import("../_core/db");
const { applyMigrations, fetchWithAuth, signUpAndGetToken } = await import("../_test/helpers");

function snapshot(partial: Partial<BaljuoraProductSnapshot> & { id: string }): BaljuoraProductSnapshot {
  return { kind: "product", code: null, name: "", supplyPrice: null, consumerPrice: null, purchaseCost: null, imageUrls: [], isVisible: true, isSoldOut: false, updatedAt: "2026-11-26T00:00:00Z", ...partial };
}

const PRODUCT = { id: "p", productCode: "A", name: "사과", generalPrice: 26000, aPrice: 26000, salePrice: null, salePriceMode: "autonomous", costPrice: 20000, categoryId: "c-farm", imageUrl: null };
// 규칙 시험용 발주오라 상품: 상품명·가격은 DB센터와 같게(상품 정보 칸만 보려고)
const same = (partial: Partial<BaljuoraProductSnapshot> & { id: string }) => snapshot({ name: "사과", supplyPrice: 26000, purchaseCost: 20000, ...partial });
const pick = (diffs: BaljuoraFieldDiff[]) => diffs.map((diff) => [diff.field, diff.direction]);

describe("상품 정보 칸 비교 규칙", () => {
  it("DB센터가 비어 있으면 발주오라 값을 가져올 변경으로, 발주오라 품절은 가져올 변경, 노출·양쪽 값이 다른 칸은 처음부터 다름", () => {
    const values = doogoSyncValues({ ...PRODUCT, isVisible: false, isSoldOut: false, origin: "국내산", courier: null, shippingType: "domestic", extras: emptyProductExtras(), taxableDefault: false }, {});
    const bj = same({ id: "bj", isVisible: true, isSoldOut: true, isTaxable: true, extra: { originText: "국내산 경북", barcode: "8801234567890", contentAmount: 5, contentUnit: "kg", contentCount: 10, contentBasis: "each", certificationKinds: ["gap"], courier: "CJ대한통운", tradeType: null, description: "아삭한 부사" } });
    const diffs = diffBaljuoraProduct(values, { snapshot: bj, baseline: null }, []);
    expect(pick(diffs)).toEqual([
      ["soldOut", "pull"], // 발주오라 품절 → DB센터로
      ["visible", "initial"], // 노출은 관리자가 방향을 고름(공개 단가표 노출과 연결)
      ["taxable", "pull"], // DB센터 과세 여부가 자동값(카테고리)이면 비어 있는 것으로 봄
      ["origin", "initial"], // 양쪽 값이 다름
      ["barcode", "pull"],
      ["content", "pull"],
      ["certification", "pull"],
      ["summary", "pull"],
      ["courier", "pull"]
    ]);
    expect(diffs.find((diff) => diff.field === "content")).toMatchObject({ doogo: null, baljuora: "5|kg|10|each", doogoEmpty: true, baljuoraEmpty: false });
    // 보낼 수 있는지: 처음부터 다른 칸은 고른 경우만, DB센터가 비어 있으면 고르더라도 보내지 않음, 인증은 보내지 않음
    const byField = Object.fromEntries(diffs.map((diff) => [diff.field, diff]));
    expect(canPushDiff(byField.origin, false)).toBe(false);
    expect(canPushDiff(byField.origin, true)).toBe(true);
    expect(canPushDiff(byField.barcode, true)).toBe(false);
    expect(canPushDiff(byField.certification, true)).toBe(false);
    expect(canPushDiff(byField.visible, true)).toBe(true);
    // 가져올 수 있는지: 가져올 변경은 그대로, 처음부터 다른 칸은 고른 경우만
    expect(canPullDiff(byField.barcode, false)).toBe(true);
    expect(canPullDiff(byField.origin, false)).toBe(false);
    expect(canPullDiff(byField.origin, true)).toBe(true);
  });

  it("한쪽을 읽지 못한 칸은 비교하지 않고, 해외배송은 보내기만, 발주오라가 비어 있으면 고르더라도 DB센터 값을 지우지 않음", () => {
    const extras = normalizeProductExtras({ barcode: "880111", isTaxable: false });
    const values = doogoSyncValues({ ...PRODUCT, isVisible: true, isSoldOut: false, origin: null, courier: null, shippingType: "overseas", extras, taxableDefault: true }, {});
    // 예전 책갈피(상품 정보 칸 없음): 판매 상태·과세만 비교
    const old = same({ id: "bj", isTaxable: true });
    expect(pick(diffBaljuoraProduct(values, { snapshot: old, baseline: null }, []))).toEqual([["taxable", "initial"]]);
    const bj = same({ id: "bj", isTaxable: false, extra: { barcode: null, tradeType: null, courier: "cj" } });
    const diffs = diffBaljuoraProduct(values, { snapshot: bj, baseline: null }, []);
    expect(pick(diffs)).toEqual([["barcode", "initial"], ["tradeType", "initial"]]); // 택배사 코드(영문)는 비교하지 않음
    const barcode = diffs.find((diff) => diff.field === "barcode") as BaljuoraFieldDiff;
    expect(canPullDiff(barcode, true)).toBe(false);
    expect(canPushDiff(barcode, true)).toBe(true);
    const trade = diffs.find((diff) => diff.field === "tradeType") as BaljuoraFieldDiff;
    expect(canPullDiff(trade, true)).toBe(false);
    expect(canPushDiff(trade, true)).toBe(true);
    expect(courierComparable("cj")).toBeUndefined();
    expect(courierComparable(" 롯데택배 ")).toBe("롯데택배");
  });

  it("기준이 있으면 바뀐 쪽으로 방향을 정하고, 새 칸이 없던 예전 기준은 지금 값으로 채우며, 보내지 않은 칸은 예전 기준을 그대로 둠", () => {
    const extras = normalizeProductExtras({ managementCode: "M-1", isTaxable: false });
    const product = { ...PRODUCT, isVisible: true, isSoldOut: false, origin: "국내산", courier: null, shippingType: "domestic", extras, taxableDefault: false };
    const values = doogoSyncValues(product, {});
    const bj = same({ id: "bj", isTaxable: false, extra: { originText: "국내산", managementCode: "M-1", courier: null, tradeType: null } });
    const oldBaseline: BaljuoraBaseline = { doogo: { name: "사과" }, baljuora: { name: "사과" }, pushedImageUrl: null, at: "2026-11-01T00:00:00Z" };
    const filled = fillBaselineGaps(oldBaseline, values, bj);
    expect(filled.doogo).toMatchObject({ soldOut: 0, visible: 1, origin: "국내산", managementCode: "M-1", taxable: 0 });
    expect(filled.baljuora).toMatchObject({ soldOut: 0, visible: 1, origin: "국내산", managementCode: "M-1", taxable: 0 });
    expect(fillBaselineGaps(filled, values, bj)).toBe(filled); // 이미 채운 기준은 그대로
    // DB센터에서 품절로 바꾸고 관리코드를 지움 → 보낼 변경(push), 발주오라에서 원산지를 바꿈 → 가져올 변경
    const changed = doogoSyncValues({ ...product, isSoldOut: true, extras: normalizeProductExtras({ isTaxable: false }) }, {});
    const bjChanged = same({ ...bj, extra: { ...bj.extra, originText: "국내산 경북" } });
    const diffs = diffBaljuoraProduct(changed, { snapshot: bjChanged, baseline: filled }, []);
    expect(pick(diffs)).toEqual([["soldOut", "push"], ["origin", "pull"], ["managementCode", "push"]]);
    const cleared = diffs.find((diff) => diff.field === "managementCode") as BaljuoraFieldDiff;
    expect(canPushDiff(cleared, false)).toBe(true); // DB센터에서 직접 지운 칸은 지우기도 보냄
    // 품절만 보낸 뒤: 원산지·관리코드는 예전 기준 유지(방향 그대로)
    const fresh: BaljuoraBaseline = { doogo: doogoComparable(changed), baljuora: baljuoraComparable({ ...bjChanged, isSoldOut: true }), pushedImageUrl: null, at: "2026-11-26T00:00:00Z" };
    const next = carryBaseline(filled, fresh, ["origin", "managementCode"]);
    expect(pick(diffBaljuoraProduct(changed, { snapshot: { ...bjChanged, isSoldOut: true }, baseline: next }, []))).toEqual([["origin", "pull"], ["managementCode", "push"]]);
  });

  it("값 모양 맞추기·검사: 내용량·발주마감·날짜·간략설명 길이", () => {
    expect(contentComparable(0.5, "kg", null, null)).toBe("0.5|kg||total");
    expect(contentComparable("5", "kg", 10, "each")).toBe("5|kg|10|each");
    expect(contentComparable(null, null, 3, null)).toBe("||3|total");
    expect(contentComparable(500, null, null, null)).toBeNull();
    expect(formatContent(5, "kg", 10, "each")).toBe("개당 0.5kg × 10개");
    expect(formatContent(5, "kg", 10, "total")).toBe("10개, 총 5kg");
    expect(normalizeDeadline("9:30")).toBe("09:30");
    expect(normalizeDeadline("09:30:00")).toBe("09:30");
    expect(normalizeDeadline("25:00")).toBeNull();
    expect(syncDateText("2026-11-01T00:00:00.000Z")).toBe("2026-11-01");
    expect(syncDateText("제조일로부터 12개월")).toBe("제조일로부터 12개월");
    expect(productExtrasProblems({ barcode: "88 01-AB", purchaseDeadline: "9시" })).toEqual(["발주마감은 09:30처럼 시:분으로 넣어 주세요."]);
    expect(productExtrasProblems({ contentAmount: 1.5, contentUnit: "g" })).toEqual(["내용량 g 단위는 정수로 넣어 주세요."]);
    expect(productExtrasProblems({ summary: "가".repeat(101) })).toEqual(["상품 간략설명은 100자 이하로 넣어 주세요."]);
    expect(normalizeProductExtras({ contentAmount: "1,000", contentUnit: "g", contentCount: 2, contentBasis: "each", barcode: " 8801 234 ", certificationKinds: ["haccp", "nope", "gap", "haccp"], shippingUnitType: "box", shippingUnitValue: 1 })).toMatchObject({ contentAmount: 1000, contentUnit: "g", contentCount: 2, contentBasis: "each", barcode: "8801234", certificationKinds: ["gap", "haccp"], shippingUnitType: "box", shippingUnitValue: 1 });
  });
});

describe("상품 정보 칸 동기화(API)", () => {
  beforeAll(async () => {
    await applyMigrations();
    const insert = "INSERT INTO products (id, productCode, name, imageUrl, supplierName, origin, courier, costPrice, aPrice, generalPrice, salePrice, salePriceMode, shippingType, categoryId, isVisible, isSoldOut, isAlwaysOnSale, displayOrder) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, 'autonomous', 'domestic', ?, 1, 0, 1, ?)";
    await executeSql(insert, ["ext-1", "EXT-001", "사과 5kg", "봄날농원", "국내산", null, 20000, 26000, 26000, "cat-domestic-farm", 1]);
    await executeSql(insert, ["ext-2", "EXT-002", "홍삼정 240g", "건강마을", null, null, 30000, 45000, 45000, "cat-domestic-health", 2]);
  });

  async function adminToken() {
    const user = await signUpAndGetToken(app);
    await executeSql("UPDATE user SET role = ?, emailVerified = 1 WHERE id = ?", ["admin", user.userId!]);
    return user.token;
  }

  async function call<T>(admin: string, path: string, method = "GET", body?: unknown) {
    const res = await fetchWithAuth(app, admin, `/api${path}`, body === undefined ? { method } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const parsed = (await res.json()) as { ok: boolean; data: T; error?: { message?: string } };
    if (!parsed.ok) throw new Error(`${path}: ${parsed.error?.message}`);
    return parsed.data;
  }

  async function runner<T>(code: string, path = "", body?: unknown) {
    const res = await app.fetch(new Request(`http://localhost/api/baljuora/runner/${code}${path}`, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json", origin: "https://console.baljuora.com" }, body: JSON.stringify(body) }));
    const parsed = (await res.json()) as { ok: boolean; data: T; error?: { message?: string } };
    if (!parsed.ok) throw new Error(`runner${path}: ${parsed.error?.message}`);
    return parsed.data;
  }

  async function compare(admin: string, snapshots: BaljuoraProductSnapshot[]) {
    const created = await call<{ code: string }>(admin, "/baljuora/admin/jobs", "POST", { type: "compare", sales: false });
    await runner(created.code, "/results", { final: true, categories: [{ id: "bj-farm", name: "🥕 농산", children: [] }, { id: "bj-health", name: "💊 건강식품", children: [] }], snapshots });
  }

  type Changes = { extrasReady: boolean; items: Array<{ productId: string; diffs: BaljuoraFieldDiff[] }> };
  const diffsOf = (changes: Changes, productId: string) => changes.items.find((item) => item.productId === productId)?.diffs ?? [];

  const apple = snapshot({
    id: "bj-1", code: "EXT-001", name: "사과 5kg", supplyPrice: 26000, groupPrice: null, purchaseCost: 20000, categoryIds: ["bj-farm"], shippingPolicyId: null, isSoldOut: true, isTaxable: false,
    extra: { originText: "국내산 경북", managementCode: "BOM-APL-5", barcode: "8801111222233", contentAmount: 5, contentUnit: "kg", contentCount: 18, contentBasis: "total", purchaseName: "부사 5kg(18과)", purchaseNameKey: "purchaseProductName", purchaseQuantity: 1, shippingUnitType: "box", shippingUnitValue: 1, purchaseDeadline: "09:30:00", certificationKinds: ["gap"], description: "아삭한 부사", shippingLocation: "경북 영주", manufacturingDate: null, expirationDate: null, courier: "CJ대한통운", tradeType: null, taxonomyItemId: "tx-apple", taxonomyName: "농산물 > 과일 > 사과" }
  });
  const ginseng = snapshot({ id: "bj-2", code: "EXT-002", name: "홍삼정 240g", supplyPrice: 45000, groupPrice: null, purchaseCost: 30000, categoryIds: ["bj-health"], shippingPolicyId: null, isTaxable: true, extra: { originText: null, managementCode: null, barcode: null, courier: null, tradeType: null } });

  it("상품 창 저장: 상품 정보 칸을 함께 저장·읽기, 잘못된 값은 저장 전에 막음, 인증·상품 분류는 관리자 저장으로 바뀌지 않음", async () => {
    const admin = await adminToken();
    const base = { productCode: "EXT-NEW", name: "배 7kg", costPrice: 30000, aPrice: 38000, generalPrice: 38000, shippingType: "domestic", categoryId: "cat-domestic-farm" };
    const created = await call<{ product: { id: string }; extras: Record<string, unknown>; extrasWarning: string | null }>(admin, "/catalog/admin/products", "POST", { ...base, extras: { isTaxable: false, managementCode: " PEAR-7 ", contentAmount: "7", contentUnit: "kg", contentCount: 12, purchaseDeadline: "9:30", shippingUnitType: "box", shippingUnitValue: 1, summary: "신고배 7kg" } });
    expect(created.extrasWarning).toBeNull();
    expect(created.extras).toMatchObject({ isTaxable: false, managementCode: "PEAR-7", contentAmount: 7, contentUnit: "kg", contentCount: 12, contentBasis: "total", purchaseDeadline: "09:30", shippingUnitType: "box", summary: "신고배 7kg" });
    const read = await call<{ ready: boolean; extras: Record<string, unknown> }>(admin, `/catalog/admin/products/${created.product.id}/extras`);
    expect(read.ready).toBe(true);
    expect(read.extras).toMatchObject({ managementCode: "PEAR-7", purchaseDeadline: "09:30" });
    await executeSql("UPDATE product_extras SET certificationKinds = ?, taxonomyItemId = 'tx-pear' WHERE productId = ?", ['["gap"]', created.product.id]);
    await expect(call(admin, `/catalog/admin/products/${created.product.id}`, "PUT", { ...base, extras: { barcode: "88-01 ab", purchaseDeadline: "아침" } })).rejects.toThrow("발주마감은 09:30처럼");
    const updated = await call<{ extras: Record<string, unknown> }>(admin, `/catalog/admin/products/${created.product.id}`, "PUT", { ...base, extras: { isTaxable: null, barcode: "8801234" } });
    expect(updated.extras).toMatchObject({ isTaxable: null, barcode: "8801234", managementCode: null, certificationKinds: ["gap"], taxonomyItemId: "tx-pear" });
    // 상품 정보 칸을 보내지 않으면(일괄 변경 등) 저장된 값은 그대로
    await call(admin, `/catalog/admin/products/${created.product.id}`, "PUT", { ...base, name: "배 7kg 특" });
    const kept = await call<{ extras: Record<string, unknown> }>(admin, `/catalog/admin/products/${created.product.id}/extras`);
    expect(kept.extras).toMatchObject({ barcode: "8801234", certificationKinds: ["gap"] });
    await executeSql("UPDATE products SET deletedAt = CURRENT_TIMESTAMP WHERE id = ?", [created.product.id]);
  });

  it("비교 → 발주오라 값 가져오기(품절·원산지·택배사·상품 정보) → DB센터에서 품절 해제·바코드 수정 → 보내기 계획 → 저장 확인(받지 않은 칸) → 기준 유지", async () => {
    const admin = await adminToken();
    await compare(admin, [apple, ginseng]);
    let changes = await call<Changes>(admin, "/baljuora/admin/changes");
    expect(changes.extrasReady).toBe(true);
    expect(pick(diffsOf(changes, "ext-1"))).toEqual([
      ["soldOut", "pull"], ["origin", "initial"], ["managementCode", "pull"], ["barcode", "pull"], ["content", "pull"], ["purchaseName", "pull"],
      ["shippingUnit", "pull"], ["purchaseDeadline", "pull"], ["certification", "pull"], ["summary", "pull"], ["shippingLocation", "pull"], ["courier", "pull"]
    ]);
    // 홍삼정: 건강식품 카테고리 → 과세 자동값이 발주오라와 같아 다르지 않음
    expect(diffsOf(changes, "ext-2")).toEqual([]);

    // 1) '발주오라에서 바뀜' 가져오기: 가져올 변경(pull)만 → 원산지(처음부터 다름)는 그대로
    const pulled = await call<{ updated: number; skipped: unknown[] }>(admin, "/baljuora/admin/pull", "POST", { productIds: ["ext-1"], onlyPulled: true });
    expect(pulled).toMatchObject({ updated: 1, skipped: [] });
    const row = (await executeSql("SELECT isSoldOut, isSeasonEnded, origin, courier FROM products WHERE id = 'ext-1'")).rows[0];
    expect(row).toMatchObject({ isSoldOut: 1, isSeasonEnded: 0, origin: "국내산", courier: "CJ대한통운" });
    const extras = await call<{ extras: Record<string, unknown> }>(admin, "/catalog/admin/products/ext-1/extras");
    expect(extras.extras).toMatchObject({ isTaxable: null, managementCode: "BOM-APL-5", barcode: "8801111222233", contentAmount: 5, contentUnit: "kg", contentCount: 18, purchaseName: "부사 5kg(18과)", shippingUnitType: "box", shippingUnitValue: 1, purchaseDeadline: "09:30", certificationKinds: ["gap"], summary: "아삭한 부사", shippingLocation: "경북 영주", taxonomyItemId: "tx-apple", taxonomyName: "농산물 > 과일 > 사과" });
    changes = await call<Changes>(admin, "/baljuora/admin/changes");
    expect(pick(diffsOf(changes, "ext-1"))).toEqual([["origin", "initial"]]);

    // 2) DB센터에서 품절 해제·바코드 수정 → 'DB센터에서 바뀜'(push). 보낼 변경 전체(칸을 고르지 않음)는 push 칸만, 처음부터 다른 원산지는 빼고 보냄
    await executeSql("UPDATE products SET isSoldOut = 0 WHERE id = 'ext-1'");
    await executeSql("UPDATE product_extras SET barcode = '8801111222240' WHERE productId = 'ext-1'");
    changes = await call<Changes>(admin, "/baljuora/admin/changes");
    expect(pick(diffsOf(changes, "ext-1"))).toEqual([["soldOut", "push"], ["origin", "initial"], ["barcode", "push"]]);
    const push = await call<{ code: string }>(admin, "/baljuora/admin/jobs", "POST", { type: "push", productIds: ["ext-1"] });
    const plan = await runner<{ plan: { items: Array<{ fields: string[]; values: { extra: Record<string, unknown>; expected: Record<string, unknown> } }> } }>(push.code);
    expect(plan.plan.items[0].fields).toEqual(["soldOut", "barcode"]);
    expect(plan.plan.items[0].values.extra).toMatchObject({ isSoldOut: false, barcode: "8801111222240", originText: "국내산", purchaseName: "부사 5kg(18과)" });
    expect(plan.plan.items[0].values.expected).toEqual({ soldOut: 0, barcode: "8801111222240" });

    // 3) 책갈피 결과: 품절은 저장됐는데 바코드는 발주오라가 받지 않음 → 바코드는 '반영 안 됨'으로 바꾸고 'DB센터에서 바뀜'으로 남김
    const after = { ...apple, isSoldOut: false, extra: { ...apple.extra, originText: "국내산 경북" } };
    await runner(push.code, "/results", { final: true, items: [{ productId: "ext-1", ok: true, baljuoraId: "bj-1", code: "EXT-001", applied: ["soldOut", "barcode"], skipped: [], snapshot: after }] });
    const job = await call<{ jobs: Array<{ id: string; type: string }> }>(admin, "/baljuora/admin/overview");
    const pushJob = job.jobs.find((entry) => entry.type === "push") as { id: string };
    const detail = await call<{ job: { items: Array<{ applied: string[]; skipped: Array<{ field: string; reason: string }> }> } }>(admin, `/baljuora/admin/jobs/${pushJob.id}`);
    expect(detail.job.items[0].applied).toEqual(["soldOut"]);
    expect(detail.job.items[0].skipped[0]).toMatchObject({ field: "barcode" });
    expect(detail.job.items[0].skipped[0].reason).toContain("발주오라에 저장된 값(8801111222233)");
    changes = await call<Changes>(admin, "/baljuora/admin/changes");
    expect(pick(diffsOf(changes, "ext-1"))).toEqual([["origin", "initial"], ["barcode", "push"]]);

    // 4) 'DB센터 기준으로 맞추기'(칸을 골라 보냄): 처음부터 다른 원산지도 보내고, DB센터가 비어 있는 칸(제조연월일)은 고르더라도 보내지 않음
    await compare(admin, [{ ...after, extra: { ...after.extra, manufacturingDate: "2026-11-01" } }, ginseng]);
    changes = await call<Changes>(admin, "/baljuora/admin/changes");
    expect(diffsOf(changes, "ext-1").find((diff) => diff.field === "manufacturingDate")).toMatchObject({ direction: "pull", doogoEmpty: true });
    const master = await call<{ code: string }>(admin, "/baljuora/admin/jobs", "POST", { type: "push", productIds: ["ext-1"], fieldsByProduct: { "ext-1": ["origin", "barcode", "manufacturingDate", "certification"] } });
    const masterPlan = await runner<{ plan: { items: Array<{ fields: string[] }> } }>(master.code);
    expect(masterPlan.plan.items[0].fields).toEqual(["origin", "barcode"]);
  });

  it("발주오라에만 있는 상품을 가져오면 상품 정보 칸까지 채워 등록하고, 표가 없으면(운영 배포 전) 상품은 저장하고 안내만", async () => {
    const admin = await adminToken();
    const only = snapshot({ id: "bj-9", code: "EXT-009", name: "곶감 1kg", supplyPrice: 18000, groupPrice: null, purchaseCost: 12000, categoryIds: ["bj-farm"], shippingPolicyId: null, isTaxable: false, extra: { originText: "국내산 경북", barcode: "8809999", purchaseDeadline: "14:00", courier: "롯데택배", tradeType: null } });
    await compare(admin, [apple, ginseng, only]);
    const result = await call<{ created: number; failed: unknown[] }>(admin, "/baljuora/admin/pull", "POST", { baljuoraIds: ["bj-9"] });
    expect(result).toMatchObject({ created: 1, failed: [] });
    const created = (await executeSql("SELECT id, origin, courier, isVisible FROM products WHERE productCode = 'EXT-009'")).rows[0];
    expect(created).toMatchObject({ origin: "국내산 경북", courier: "롯데택배", isVisible: 0 });
    const extras = await call<{ extras: Record<string, unknown> }>(admin, `/catalog/admin/products/${created.id}/extras`);
    expect(extras.extras).toMatchObject({ isTaxable: false, barcode: "8809999", purchaseDeadline: "14:00" });

    // 표가 없는 DB(037 전): 읽기는 ready false, 상품 저장은 되고 상품 정보 칸은 안내
    await executeSql("DROP TABLE product_extras");
    const missing = await call<{ ready: boolean }>(admin, `/catalog/admin/products/${created.id}/extras`);
    expect(missing.ready).toBe(false);
    const saved = await call<{ product: { name: string }; extrasWarning: string | null }>(admin, `/catalog/admin/products/${created.id}`, "PUT", { productCode: "EXT-009", name: "곶감 1kg 특", costPrice: 12000, aPrice: 18000, generalPrice: 18000, shippingType: "domestic", categoryId: "cat-domestic-farm", extras: { barcode: "1" } });
    expect(saved.product.name).toBe("곶감 1kg 특");
    expect(saved.extrasWarning).toContain("운영 배포 후");
    const changes = await call<Changes>(admin, "/baljuora/admin/changes");
    expect(changes.extrasReady).toBe(false);
  });
});
