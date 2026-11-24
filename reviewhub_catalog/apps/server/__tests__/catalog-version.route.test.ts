// 공개 단가표 버전·응답 재사용(2026-11-24 Vercel CPU 줄이기, services/catalog-version.ts)
// - GET /api/catalog/version: 아주 가벼운 버전. 바뀐 게 없으면 그대로이고 /api/catalog 응답의 catalogVersion과 같습니다.
// - 관리자 저장이 성공하면(어떤 칸이든: 진열순서처럼 updatedAt을 바꾸지 않는 저장도 관리자 라우터를 거치므로) 버전이 바뀌고 단가표에 바로 보입니다.
//   (진열순서 저장은 DB 트랜잭션을 써서 테스트용 메모리 DB에서는 부를 수 없어, 같은 관리자 라우터의 설정 저장으로 확인합니다.)
// - 실패한 관리자 요청(401)은 버전을 바꾸지 않습니다.
// - 같은 버전 동안은 서버가 만들어 둔 응답을 그대로 씁니다(CATALOG_CACHE=1로 켬, Vercel에서는 자동으로 켜짐).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../_core/create-app";
import { executeSql } from "../_core/db";
import { bumpCatalogRevision, getCatalogVersion } from "../services/catalog-version";
import { applyMigrations, fetchWithAuth, resetDatabase, signUpAndGetToken } from "../_test/helpers";

const CATEGORY = "cat-domestic-farm";
const IDS = ["cv-1", "cv-2"];

beforeAll(async () => {
  process.env.CATALOG_CACHE = "1";
  await applyMigrations();
});

afterAll(() => {
  delete process.env.CATALOG_CACHE;
});

beforeEach(async () => {
  await resetDatabase();
  await executeSql(`DELETE FROM price_histories WHERE productId IN (${IDS.map(() => "?").join(",")})`, IDS);
  await executeSql(`DELETE FROM products WHERE id IN (${IDS.map(() => "?").join(",")})`, IDS);
  const insert = "INSERT INTO products (id, productCode, name, costPrice, aPrice, generalPrice, salePriceMode, shippingType, categoryId, isVisible, isSoldOut, isAlwaysOnSale, displayOrder, createdAt) VALUES (?, ?, ?, ?, ?, ?, 'autonomous', 'domestic', ?, 1, 0, 1, ?, '2026-11-01 00:00:00')";
  await executeSql(insert, ["cv-1", "CV-1", "(버전) 첫째 상품", 1000, 1500, 1800, CATEGORY, -900001]);
  await executeSql(insert, ["cv-2", "CV-2", "(버전) 둘째 상품", 1000, 1500, 1800, CATEGORY, -900000]);
  // DB를 직접 고친 테스트 준비라 관리자 저장처럼 바뀜 표시를 새로 적습니다.
  await bumpCatalogRevision();
});

async function adminToken() {
  const user = await signUpAndGetToken(app);
  await executeSql("UPDATE user SET role = ?, emailVerified = 1 WHERE id = ?", ["admin", user.userId!]);
  return user.token;
}

async function version() {
  const res = await app.fetch(new Request("http://localhost/api/catalog/version"));
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-store");
  const body = (await res.json()) as { data?: { version?: string | null } };
  return body.data?.version ?? null;
}

async function catalog() {
  const res = await app.fetch(new Request("http://localhost/api/catalog"));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { ok: boolean; data: { catalogVersion?: string | null; products: Array<{ id: string; name: string }>; settings: Record<string, string> } };
  expect(body.ok).toBe(true);
  return body.data;
}

function testOrder(products: Array<{ id: string }>) {
  return products.map((product) => product.id).filter((id) => IDS.includes(id));
}

describe("공개 단가표 버전 · 응답 재사용", () => {
  it("바뀐 게 없으면 버전이 그대로이고, 단가표 응답의 catalogVersion과 같습니다", async () => {
    const first = await version();
    expect(first).toMatch(/^[0-9a-f]{16}$/);
    expect(await version()).toBe(first);
    const data = await catalog();
    expect(data.catalogVersion).toBe(first);
    expect(testOrder(data.products)).toEqual(["cv-1", "cv-2"]);
  });

  it("관리자 저장이 성공하면 버전이 바뀌고, 단가표에 바로 보입니다(만들어 둔 응답을 다시 쓰지 않음)", async () => {
    const before = await catalog();
    const token = await adminToken();
    const res = await fetchWithAuth(app, token, "/api/catalog/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "sourcing_intro", value: "버전 확인용 안내 문구" })
    });
    expect(res.status).toBe(200);
    const after = await catalog();
    expect(after.catalogVersion).not.toBe(before.catalogVersion);
    expect(after.catalogVersion).toBe(await version());
    expect(after.settings.sourcing_intro).toBe("버전 확인용 안내 문구");
    // 관리자 화면에서 읽기만 하는 요청(GET)은 버전을 바꾸지 않습니다.
    const read = await fetchWithAuth(app, token, "/api/catalog/admin/overview");
    expect(read.status).toBeLessThan(500);
    expect(await version()).toBe(after.catalogVersion);
  });

  it("로그인 없이 보낸 관리자 요청(401)은 버전을 바꾸지 않습니다", async () => {
    const before = await version();
    const res = await app.fetch(new Request("http://localhost/api/catalog/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "sourcing_intro", value: "로그인 없이" })
    }));
    expect(res.status).toBe(401);
    expect(await version()).toBe(before);
  });

  it("같은 버전 동안은 만들어 둔 응답을 그대로 쓰고, 바뀜 표시가 새로 적히면 다시 만듭니다", async () => {
    const before = await catalog();
    expect(before.products.find((product) => product.id === "cv-1")?.name).toBe("(버전) 첫째 상품");
    // 관리자 화면을 거치지 않은 직접 수정: 버전이 그대로라 서버는 만들어 둔 응답을 돌려줍니다(그래서 CPU를 쓰지 않음).
    await executeSql("UPDATE products SET name = ? WHERE id = ?", ["(버전) 바뀐 이름", "cv-1"]);
    const cached = await catalog();
    expect(cached.catalogVersion).toBe(before.catalogVersion);
    expect(cached.products.find((product) => product.id === "cv-1")?.name).toBe("(버전) 첫째 상품");
    // 관리자 저장처럼 바뀜 표시가 새로 적히면 새로 만듭니다.
    await bumpCatalogRevision();
    const fresh = await catalog();
    expect(fresh.catalogVersion).not.toBe(before.catalogVersion);
    expect(fresh.products.find((product) => product.id === "cv-1")?.name).toBe("(버전) 바뀐 이름");
  });

  it("한국 시각으로 시간이 바뀌면 버전도 바뀝니다(가격변동·품절 기간이 날짜 따라 움직이므로)", async () => {
    const base = Date.parse("2026-11-24T05:10:00Z");
    const sameHour = await getCatalogVersion(base);
    expect(await getCatalogVersion(base + 30 * 60 * 1000)).toBe(sameHour);
    expect(await getCatalogVersion(base + 60 * 60 * 1000)).not.toBe(sameHour);
  });
});
