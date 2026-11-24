// 운영 현황(GET /api/catalog/operations, services/catalog-operations.ts) 서버 재사용(2026-11-24 Vercel CPU 줄이기)
// - Vercel(여기서는 CATALOG_CACHE=1)에서는 날씨·선과장·이번 달 상품 현황을 5분 동안 만들어 둔 값으로 돌려주고, 5분이 지나면 다시 집계합니다.
// - 접속 IP의 지역 확인(ipwho.is)은 IP마다 한 번만 묻고, 그 지역 날씨도 10분 동안 다시 씁니다.
// - 재사용을 끈 곳(테스트·로컬 개발)은 지금처럼 요청마다 새로 집계합니다.
// 바깥 주소(open-meteo·ipwho.is·nager.at)는 가짜 fetch로 대신합니다.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { executeSql } from "../_core/db";
import { getCatalogOperationsOverview, resetCatalogOperationsCache } from "../services/catalog-operations";
import { applyMigrations, resetDatabase } from "../_test/helpers";

const IDS = ["op-1", "op-2", "op-3"];
// 2026-11-16(월) 낮 12시(한국 시각): 일요일·공휴일이 아니라 선과장 "정상운영"입니다.
const NOW = Date.parse("2026-11-16T03:00:00Z");

const fakeFetch = vi.fn(async (input: string | URL | Request) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url.startsWith("https://ipwho.is/")) return Response.json({ success: true, city: "Seoul", country_code: "KR", latitude: 37.56, longitude: 126.97 });
  if (url.startsWith("https://api.open-meteo.com/")) return Response.json({ current: { time: "2026-11-16T12:00", temperature_2m: 3.4, weather_code: 1 } });
  if (url.startsWith("https://date.nager.at/")) return Response.json([]);
  throw new Error(`unexpected fetch ${url}`);
});

function calledWith(prefix: string) {
  return fakeFetch.mock.calls.filter(([input]) => String(input instanceof Request ? input.url : input).startsWith(prefix)).length;
}

async function addProduct(id: string) {
  await executeSql(
    "INSERT INTO products (id, productCode, name, costPrice, aPrice, generalPrice, salePriceMode, shippingType, categoryId, isVisible, isSoldOut, isAlwaysOnSale, displayOrder, createdAt) VALUES (?, ?, ?, 1000, 1500, 1800, 'autonomous', 'domestic', 'cat-domestic-farm', 1, 0, 1, 0, '2026-11-16 01:00:00')",
    [id, id.toUpperCase(), `(운영 현황) ${id}`]
  );
}

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await resetDatabase();
  await executeSql(`DELETE FROM products WHERE id IN (${IDS.map(() => "?").join(",")})`, IDS);
  resetCatalogOperationsCache();
  fakeFetch.mockClear();
  vi.stubGlobal("fetch", fakeFetch);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.CATALOG_CACHE;
});

afterAll(() => {
  resetCatalogOperationsCache();
});

describe("운영 현황 서버 재사용", () => {
  it("Vercel에서는 5분 동안 만들어 둔 날씨·선과장·이번 달 현황을 다시 쓰고, 5분이 지나면 다시 집계합니다", async () => {
    process.env.CATALOG_CACHE = "1";
    await addProduct("op-1");
    const first = await getCatalogOperationsOverview();
    expect(first.operation.status).toBe("정상운영");
    expect(first.weather).toHaveLength(9);
    const base = first.monthlyStats.newProducts;
    expect(base).toBeGreaterThanOrEqual(1);

    // 4분 뒤: 그 사이 상품이 늘어도 만들어 둔 값을 그대로 돌려줍니다(DB 집계·바깥 호출 없음).
    await addProduct("op-2");
    const callsBefore = fakeFetch.mock.calls.length;
    vi.setSystemTime(NOW + 4 * 60 * 1000);
    const cached = await getCatalogOperationsOverview();
    expect(cached.monthlyStats.newProducts).toBe(base);
    expect(cached.generatedAt).toBe(first.generatedAt);
    expect(fakeFetch.mock.calls.length).toBe(callsBefore);

    // 5분이 지나면 다시 집계합니다.
    vi.setSystemTime(NOW + 5 * 60 * 1000 + 1000);
    const fresh = await getCatalogOperationsOverview();
    expect(fresh.monthlyStats.newProducts).toBe(base + 1);
    expect(fresh.generatedAt).not.toBe(first.generatedAt);
  });

  it("접속 IP의 지역은 IP마다 한 번만 묻고, 그 지역 날씨도 다시 씁니다", async () => {
    process.env.CATALOG_CACHE = "1";
    const first = await getCatalogOperationsOverview("1.2.3.4, 10.0.0.1");
    expect(first.currentWeather?.city).toBe("Seoul");
    expect(first.currentWeather?.temperature).toBe(3);
    const second = await getCatalogOperationsOverview("1.2.3.4");
    expect(second.currentWeather?.city).toBe("Seoul");
    expect(calledWith("https://ipwho.is/")).toBe(1);
    // 대표 도시 9곳 + 접속 지역 1곳 = open-meteo 10번(두 번째 요청은 모두 기억한 값)
    expect(calledWith("https://api.open-meteo.com/")).toBe(10);

    // 다른 IP는 따로 묻습니다(지역이 같으면 날씨는 기억한 값을 씁니다).
    await getCatalogOperationsOverview("5.6.7.8");
    expect(calledWith("https://ipwho.is/")).toBe(2);
    expect(calledWith("https://api.open-meteo.com/")).toBe(10);

    // 사설·내부 주소는 지역을 묻지 않습니다.
    const local = await getCatalogOperationsOverview("192.168.0.10");
    expect(local.currentWeather).toBeNull();
    expect(calledWith("https://ipwho.is/")).toBe(2);
  });

  it("재사용을 끈 곳(테스트·로컬 개발)은 요청마다 새로 집계합니다", async () => {
    const first = await getCatalogOperationsOverview();
    await addProduct("op-3");
    const second = await getCatalogOperationsOverview();
    expect(second.monthlyStats.newProducts).toBe(first.monthlyStats.newProducts + 1);
  });
});
