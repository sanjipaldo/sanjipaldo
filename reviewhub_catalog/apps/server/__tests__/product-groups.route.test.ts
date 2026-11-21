// 옵션 묶음(2026-11-21): 단일 상품을 묶어 공개 단가표에서 카드 하나 + 옵션 팝업으로 보여 줍니다.
// - 공용 규칙(기본 이름·옵션 이름 자동 만들기·묶음 추천)
// - 7일 가격 흐름·직전 공급가 계산(changedAt 두 형식 섞임)
// - 관리자 API(만들기·옮기기·넣기/빼기·추천, 관리자만) / 공개 API(단가표 묶음 요약·옵션 팝업·상품 엑셀, 원가 제외)
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { autoOptionLabels, groupBaseName, optionLabelsFor, suggestProductGroups } from "@repo/shared/product-groups";

process.env.SKYBASE_DB_ENDPOINT = `file:${join(mkdtempSync(join(tmpdir(), "product-groups-")), "test.db")}`;
const { default: app } = await import("../_core/create-app");
const { executeSql } = await import("../_core/db");
const { applyMigrations, fetchWithAuth, resetDatabase, signUpAndGetToken } = await import("../_test/helpers");
const { buildOptionTrend, isMissingGroupColumn } = await import("../services/product-groups");

const CATEGORY = "cat-domestic-farm";
const IDS = ["pg-1", "pg-2", "pg-3", "pg-4", "pg-hidden", "pg-x"];

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await resetDatabase();
  await executeSql("DELETE FROM product_group_items");
  await executeSql("DELETE FROM product_groups");
  await executeSql(`DELETE FROM price_histories WHERE productId IN (${IDS.map(() => "?").join(",")})`, IDS);
  await executeSql(`DELETE FROM products WHERE id IN (${IDS.map(() => "?").join(",")})`, IDS);
  const insert = "INSERT INTO products (id, productCode, name, costPrice, aPrice, generalPrice, salePriceMode, shippingType, categoryId, isVisible, isSoldOut, isAlwaysOnSale, displayOrder, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?, 'autonomous', 'domestic', ?, ?, 0, 1, ?, ?, '2026-11-01 00:00:00')";
  await executeSql(insert, ["pg-1", "PG-1", "(테스트) 여주 꿀고구마 중 3kg (베니하루카)", 7000, 9000, 9500, CATEGORY, 1, 1, "숙성 후 보내요"]);
  await executeSql(insert, ["pg-2", "PG-2", "(테스트) 여주 꿀고구마 중 5kg (베니하루카)", 10000, 0, 13500, CATEGORY, 1, 2, null]);
  await executeSql(insert, ["pg-3", "PG-3", "(테스트) 여주 꿀고구마 특상 5kg (베니하루카)", 12000, 15000, 16000, CATEGORY, 1, 3, null]);
  await executeSql(insert, ["pg-4", "PG-4", "(테스트) 여주 꿀고구마 대 10kg (베니하루카)", 18000, 21000, 22000, CATEGORY, 1, 4, null]);
  await executeSql(insert, ["pg-hidden", "PG-H", "(테스트) 여주 꿀고구마 한입 3kg (베니하루카)", 5000, 6000, 6500, CATEGORY, 0, 5, null]);
  await executeSql(insert, ["pg-x", "PG-X", "(테스트) 제주 한라봉 3kg", 15000, 18000, 19000, CATEGORY, 1, 6, null]);
});

async function adminToken() {
  const user = await signUpAndGetToken(app);
  await executeSql("UPDATE user SET role = ?, emailVerified = 1 WHERE id = ?", ["admin", user.userId!]);
  return user.token;
}

async function json<T>(res: Response) {
  return (await res.json()) as { ok: boolean; data: T; error?: { message?: string } };
}

function send(token: string, path: string, method: string, body: unknown) {
  return fetchWithAuth(app, token, path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("옵션 묶음 공용 규칙", () => {
  it("기본 이름은 무게·개수·등급·숫자 괄호를 빼고, 옵션 이름은 모두 같은 앞뒤 단어를 뺍니다", () => {
    expect(groupBaseName("(비세척) 여주 꿀고구마 중1kg (베니하루카)")).toBe("(비세척) 여주 꿀고구마 (베니하루카)");
    expect(groupBaseName("(본) 손질통오징어 2미(260g)3팩")).toBe("(본) 손질통오징어");
    expect(groupBaseName("(본) 반건시 곶감 선물세트 (30개입) [1+1박스] 총 2kg내외")).toBe("(본) 반건시 곶감 선물세트");
    expect(autoOptionLabels(["(비세척) 여주 꿀고구마 대 10kg (베니하루카)", "(비세척) 여주 꿀고구마 중1kg (베니하루카)"])).toEqual(["대 10kg", "중1kg"]);
    expect(autoOptionLabels(["꿀고구마1kg", "꿀고구마2kg"])).toEqual(["1kg", "2kg"]);
    expect(autoOptionLabels(["사과 (5kg)", "사과 (10kg)"])).toEqual(["5kg", "10kg"]);
    expect(autoOptionLabels(["한라봉 3kg"])).toEqual(["한라봉 3kg"]);
    expect(optionLabelsFor(["사과 5kg", "사과 10kg"], [null, "  선물용 10kg "])).toEqual(["5kg", "선물용 10kg"]);
  });

  it("추천: 기본 이름·카테고리·배송유형이 같은 상품 2개 이상만, 많은 순서로", () => {
    const suggestions = suggestProductGroups([
      { id: "a", name: "햇 양파 대 / 5kg", categoryId: "farm", shippingType: "domestic" },
      { id: "b", name: "햇 양파 중 / 10kg", categoryId: "farm", shippingType: "domestic" },
      { id: "c", name: "햇 양파 소 / 3kg", categoryId: "farm", shippingType: "domestic" },
      { id: "d", name: "햇 양파 대 / 5kg", categoryId: "gift", shippingType: "domestic" },
      { id: "e", name: "제주 한라봉 3kg", categoryId: "farm", shippingType: "domestic" },
      { id: "f", name: "제주 한라봉 5kg", categoryId: "farm", shippingType: "domestic" }
    ]);
    expect(suggestions.map((item) => [item.name, item.productIds])).toEqual([
      ["햇 양파", ["a", "b", "c"]],
      ["제주 한라봉", ["e", "f"]]
    ]);
  });
});

describe("migration 033 전 DB(운영 DB를 쓰는 미리보기)", () => {
  it("033에서 더한 칸이 없다는 읽기·쓰기 오류를 알아봅니다(공개 화면은 묶음 없이, 관리자 저장은 '운영 배포 후' 안내)", () => {
    expect(isMissingGroupColumn(new Error("SQLITE_ERROR: no such column: product_groups.shippingNote"))).toBe(true);
    expect(isMissingGroupColumn({ message: "Failed query", cause: { message: "table product_group_items has no column named optionLabel" } })).toBe(true);
    expect(isMissingGroupColumn(new Error("SQLITE_ERROR: no such column: products.nope"))).toBe(false);
    expect(isMissingGroupColumn(new Error("UNIQUE constraint failed"))).toBe(false);
  });
});

describe("최근 7일 가격 흐름", () => {
  const days = ["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"];

  it("지금 가격에서 변동 기록을 되짚어 하루 끝 가격을 만들고, 수강생 단가가 0이면 일반공급가로 봅니다", () => {
    const trend = buildOptionTrend({ id: "p", aPrice: 0, generalPrice: 8800, createdAt: "2026-08-11 00:00:00" }, [
      { productId: "p", field: "generalPrice", oldPrice: 9500, newPrice: 8800, changedAt: "2026-11-19T01:00:00.000Z" },
      { productId: "p", field: "aPrice", oldPrice: 9000, newPrice: 8300, changedAt: "2026-11-19T01:00:00.000Z" },
      // 한국 시간 11/20 12:00(UTC "YYYY-MM-DD HH:MM:SS" 형식)
      { productId: "p", field: "aPrice", oldPrice: 8300, newPrice: 0, changedAt: "2026-11-20 03:00:00" },
      { productId: "p", field: "costPrice", oldPrice: 1, newPrice: 2, changedAt: "2026-11-20 04:00:00" },
      { productId: "other", field: "generalPrice", oldPrice: 1, newPrice: 2, changedAt: "2026-11-20 04:00:00" }
    ], days);
    expect(trend.general).toEqual([9500, 9500, 9500, 9500, 8800, 8800, 8800]);
    expect(trend.student).toEqual([9000, 9000, 9000, 9000, 8300, 8800, 8800]);
    expect(trend.current).toEqual({ general: 8800, student: 8800, since: "2026-11-20" });
    expect(trend.previous).toEqual({ general: 8800, student: 8300, changedAt: "2026-11-20 03:00:00" });
  });

  it("보이는 가격이 안 바뀐 저장(수강생 단가 0 → 일반공급가와 같은 값)은 직전 공급가로 치지 않고, 기록이 없으면 등록일 기준입니다", () => {
    const unchanged = buildOptionTrend({ id: "p", aPrice: 12000, generalPrice: 12000, createdAt: "2026-10-02T03:00:00.000Z" }, [
      { productId: "p", field: "aPrice", oldPrice: 0, newPrice: 12000, changedAt: "2026-11-18T05:00:00.000Z" }
    ], days);
    expect(unchanged.previous).toBeNull();
    expect(unchanged.current.since).toBe("2026-10-02");
    expect(unchanged.student).toEqual(Array(7).fill(12000));
  });
});

describe("옵션 묶음 관리자 API", () => {
  it("관리자만 묶음을 만들 수 있고, 일반 로그인 사용자는 403입니다", async () => {
    const user = await signUpAndGetToken(app);
    const denied = await send(user.token, "/api/catalog/admin/groups", "POST", { name: "꿀고구마", items: [{ productId: "pg-1" }] });
    expect(denied.status).toBe(403);
    const anonymous = await app.fetch(new Request("http://localhost/api/catalog/admin/groups"));
    expect(anonymous.status).toBe(401);
  });

  it("만들기 → 공개 단가표 묶음 요약(숨김 상품 제외·옵션 순서·직접 쓴 옵션 이름) → 옵션 팝업 → 상품 엑셀", async () => {
    const admin = await adminToken();
    const created = await send(admin, "/api/catalog/admin/groups", "POST", {
      name: "(테스트) 여주 꿀고구마",
      description: "여주 황토밭 꿀고구마예요.",
      shippingNote: "제주·도서산간 배송 불가",
      materialsUrl: "https://example.com/sweet-potato",
      items: [{ productId: "pg-2" }, { productId: "pg-1", optionLabel: "중 3kg(가정용)" }, { productId: "pg-hidden" }, { productId: "pg-3" }]
    });
    expect(created.status).toBe(201);
    const group = (await json<{ group: { id: string; items: Array<{ productId: string }> } }>(created)).data.group;
    expect(group.items.map((item) => item.productId)).toEqual(["pg-2", "pg-1", "pg-hidden", "pg-3"]);

    const catalog = await json<{ groups: Array<{ id: string; name: string; productIds: string[]; optionLabels?: Record<string, string>; materialsUrl?: string }> }>(await app.fetch(new Request("http://localhost/api/catalog")));
    const summary = catalog.data.groups.find((item) => item.id === group.id)!;
    expect(summary.productIds).toEqual(["pg-2", "pg-1", "pg-3"]);
    expect(summary.optionLabels).toEqual({ "pg-1": "중 3kg(가정용)" });
    expect(summary.materialsUrl).toBe("https://example.com/sweet-potato");

    const optionsRes = await app.fetch(new Request("http://localhost/api/catalog/options/pg-3"));
    expect(optionsRes.status).toBe(200);
    const optionsText = await optionsRes.clone().text();
    expect(optionsText).not.toContain("costPrice");
    expect(optionsText).not.toContain("changedBy");
    const options = (await json<{ group: { name: string; shippingNote: string }; productIds: string[]; days: string[]; trends: Record<string, { current: { general: number; student: number } }> }>(optionsRes)).data;
    expect(options.group).toMatchObject({ name: "(테스트) 여주 꿀고구마", shippingNote: "제주·도서산간 배송 불가" });
    expect(options.productIds).toEqual(["pg-2", "pg-1", "pg-3"]);
    expect(options.days).toHaveLength(7);
    // 수강생 단가 0이면 일반공급가
    expect(options.trends["pg-2"].current).toMatchObject({ general: 13500, student: 13500 });
    expect((await app.fetch(new Request("http://localhost/api/catalog/options/pg-hidden"))).status).toBe(404);

    const exportRes = await app.fetch(new Request("http://localhost/api/catalog/options/pg-1/export"));
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers.get("Content-Type")).toContain("spreadsheetml");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await exportRes.arrayBuffer());
    const sheet = workbook.getWorksheet("상품별 공급가")!;
    expect(String(sheet.getCell("A1").value)).toBe("(주)두고홀딩스 · DOOGO FOOD · 공식 상품안내");
    expect(String(sheet.getCell("A2").value)).toBe("(테스트) 여주 꿀고구마");
    expect([1, 2, 3, 4, 5, 6].map((column) => sheet.getRow(5).getCell(column).value)).toEqual(["옵션", "일반공급가(원)", "수강생 단가(원)", "판매상태", "공급가 적용일", "배송"]);
    expect([6, 7, 8].map((row) => [sheet.getCell(`A${row}`).value, sheet.getCell(`B${row}`).value, sheet.getCell(`C${row}`).value])).toEqual([
      ["중 5kg", 13500, 13500],
      ["중 3kg(가정용)", 9500, 9000],
      ["특상 5kg", 16000, 15000]
    ]);
    const allValues = sheet.getSheetValues().flat().map((value) => String(value ?? ""));
    // 원가(7000·10000·12000)는 넣지 않습니다.
    expect(allValues).not.toContain("7000");
    expect(allValues.join(" ")).toContain("제주·도서산간 배송 불가");
    expect(allValues.join(" ")).toContain("https://example.com/sweet-potato");
  });

  it("다른 묶음에 있던 상품은 옮겨지고, 비게 된 묶음은 지워집니다. 넣기·빼기도 같은 규칙입니다", async () => {
    const admin = await adminToken();
    const first = (await json<{ group: { id: string } }>(await send(admin, "/api/catalog/admin/groups", "POST", { name: "묶음 A", items: [{ productId: "pg-1" }] }))).data.group;
    const second = await json<{ group: { id: string; items: unknown[] }; movedFromGroups: number; removedGroups: number }>(await send(admin, "/api/catalog/admin/groups", "POST", { name: "묶음 B", items: [{ productId: "pg-1" }, { productId: "pg-2" }] }));
    expect(second.data).toMatchObject({ movedFromGroups: 1, removedGroups: 1 });
    const listed = await json<{ ready: boolean; groups: Array<{ id: string; name: string; items: Array<{ productId: string }> }> }>(await fetchWithAuth(app, admin, "/api/catalog/admin/groups"));
    expect(listed.data.ready).toBe(true);
    expect(listed.data.groups.map((group) => group.name)).toEqual(["묶음 B"]);
    expect(listed.data.groups.some((group) => group.id === first.id)).toBe(false);

    const assign = await send(admin, "/api/catalog/admin/groups/assign", "POST", { productIds: ["pg-3"], groupId: second.data.group.id });
    expect(assign.status).toBe(200);
    const memberships = await json<{ memberships: Record<string, { groupId: string; size: number }> }>(await fetchWithAuth(app, admin, "/api/catalog/admin/groups/memberships"));
    expect(memberships.data.memberships["pg-3"]).toMatchObject({ groupId: second.data.group.id, size: 3 });

    const removed = await json<{ removedGroups: number }>(await send(admin, "/api/catalog/admin/groups/assign", "POST", { productIds: ["pg-1", "pg-2", "pg-3"], groupId: null }));
    expect(removed.data.removedGroups).toBe(1);
    const after = await json<{ groups: unknown[] }>(await fetchWithAuth(app, admin, "/api/catalog/admin/groups"));
    expect(after.data.groups).toEqual([]);
  });

  it("추천: 아직 안 묶은 비슷한 이름 상품은 새 묶음 후보, 기존 묶음과 이름이 같은 상품은 넣을 후보로 알려 줍니다", async () => {
    const admin = await adminToken();
    const before = await json<{ suggestions: Array<{ productIds: string[] }>; joins: unknown[] }>(await fetchWithAuth(app, admin, "/api/catalog/admin/groups/suggestions"));
    const testSuggestion = before.data.suggestions.find((item) => item.productIds.includes("pg-1"))!;
    expect(testSuggestion.productIds.sort()).toEqual(["pg-1", "pg-2", "pg-3", "pg-4", "pg-hidden"]);
    expect(before.data.suggestions.some((item) => item.productIds.includes("pg-x"))).toBe(false);

    const group = (await json<{ group: { id: string } }>(await send(admin, "/api/catalog/admin/groups", "POST", { name: "(테스트) 여주 꿀고구마", items: [{ productId: "pg-1" }, { productId: "pg-2" }] }))).data.group;
    const after = await json<{ joins: Array<{ groupId: string; productIds: string[] }> }>(await fetchWithAuth(app, admin, "/api/catalog/admin/groups/suggestions"));
    const join = after.data.joins.find((item) => item.groupId === group.id)!;
    expect(join.productIds.sort()).toEqual(["pg-3", "pg-4", "pg-hidden"]);
  });

  it("입력 확인: 상품 없음·없는 상품·http(s)가 아닌 자료 링크는 400입니다", async () => {
    const admin = await adminToken();
    expect((await send(admin, "/api/catalog/admin/groups", "POST", { name: "빈 묶음", items: [] })).status).toBe(400);
    expect((await send(admin, "/api/catalog/admin/groups", "POST", { name: "없는 상품", items: [{ productId: "nope" }] })).status).toBe(400);
    const badUrl = await send(admin, "/api/catalog/admin/groups", "POST", { name: "링크", materialsUrl: "javascript:alert(1)", items: [{ productId: "pg-1" }] });
    expect(badUrl.status).toBe(400);
    expect((await json(badUrl)).error?.message).toContain("http");
  });
});
