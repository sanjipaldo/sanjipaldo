// 백과사전 네이버 검색량 모으기: 검색광고 키워드 도구(서명 헤더·5개씩) + 데이터랩 월별 추이 → 달마다 추정 검색수.
// - 키가 없으면 409로 안내, 관리자만 새로고침, 공개 GET /api/catalog/produce-search로 모아 둔 값을 읽습니다.
// - 실제 네이버 서버 대신 가짜 응답을 씁니다(키 값은 테스트용 가짜).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../_core/create-app";
import { executeSql } from "../_core/db";
import { applyMigrations, resetDatabase, signUpAndGetToken } from "../_test/helpers";
import { countValue, estimateMonthlyVolumes, fetchKeywordVolumes, searchAdSignature, trendRange } from "../services/naver-search";

const ENV_NAMES = ["NAVER_SEARCHAD_API_KEY", "NAVER_SEARCHAD_SECRET_KEY", "NAVER_SEARCHAD_CUSTOMER_ID", "NAVER_DATALAB_CLIENT_ID", "NAVER_DATALAB_CLIENT_SECRET"] as const;
let savedEnv: Record<string, string | undefined> = {};

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await resetDatabase();
  await executeSql("DELETE FROM content_settings WHERE key = 'produce_search_stats'");
  savedEnv = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  for (const name of ENV_NAMES) delete process.env[name];
});

afterEach(() => {
  for (const name of ENV_NAMES) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
  vi.unstubAllGlobals();
});

async function adminToken() {
  const user = await signUpAndGetToken(app);
  await executeSql("UPDATE user SET role = ?, emailVerified = 1 WHERE id = ?", ["admin", user.userId!]);
  return user.token;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const keywordToolRows = [
  { relKeyword: "부사사과", monthlyPcQcCnt: 2100, monthlyMobileQcCnt: 9900, compIdx: "높음" },
  { relKeyword: "청송부사사과", monthlyPcQcCnt: 300, monthlyMobileQcCnt: 1200, compIdx: "높음" },
  { relKeyword: "제주감귤", monthlyPcQcCnt: "< 10", monthlyMobileQcCnt: 40, compIdx: "중간" }
];

describe("네이버 검색량 계산", () => {
  it("숫자 읽기 · 기간 · 달마다 추정", () => {
    expect(countValue("< 10")).toBe(5);
    expect(countValue("1,234")).toBe(1234);
    expect(trendRange(new Date("2026-11-12T03:00:00Z"))).toEqual({ startDate: "2025-11-01", endDate: "2026-10-31", lastMonth: 10 });
    const ratios = [10, 10, 10, 10, 10, 10, 10, 10, 20, 50, 100, 80];
    expect(estimateMonthlyVolumes(1000, ratios, 10)).toEqual([200, 200, 200, 200, 200, 200, 200, 200, 400, 1000, 2000, 1600]);
    expect(estimateMonthlyVolumes(0, ratios, 10)).toBeUndefined();
  });

  it("키워드 도구: 서명 헤더를 붙이고, 띄어쓰기 없이 5개씩 묻고, 연관 검색어를 고릅니다", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, headers: init?.headers as Record<string, string> });
      return json({ keywordList: keywordToolRows });
    });
    const config = { apiKey: "test-access", secret: "test-secret", customerId: "123" };
    const result = await fetchKeywordVolumes(["부사 사과", "제주 감귤", "a", "b", "c", "d"], config, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(decodeURIComponent(calls[0].url)).toContain("hintKeywords=부사사과,제주감귤,a,b,c");
    const headers = calls[0].headers;
    expect(headers["X-API-KEY"]).toBe("test-access");
    expect(headers["X-Customer"]).toBe("123");
    expect(headers["X-Signature"]).toBe(searchAdSignature("test-secret", headers["X-Timestamp"], "GET", "/keywordstool"));
    expect(result.get("부사사과")).toMatchObject({ pc: 2100, mobile: 9900, total: 12000, comp: "높음", related: [["청송부사사과", 1500]] });
    expect(result.get("제주감귤")?.total).toBe(45);
    expect(result.get("a")?.total).toBe(0);
  });
});

describe("검색량 API", () => {
  it("키가 없으면 상태에 '없음'이고, 새로고침은 409로 안내합니다. 로그인 없이는 새로고침할 수 없습니다", async () => {
    const token = await adminToken();
    const status = await app.fetch(new Request("http://localhost/api/catalog/admin/produce-search/status", { headers: { Authorization: `Bearer ${token}` } }));
    expect(status.status).toBe(200);
    expect((await status.json() as { data: { searchAd: boolean; datalab: boolean } }).data).toMatchObject({ searchAd: false, datalab: false });

    const refresh = await app.fetch(new Request("http://localhost/api/catalog/admin/produce-search/refresh", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ keywords: ["부사 사과"] })
    }));
    expect(refresh.status).toBe(409);

    const anonymous = await app.fetch(new Request("http://localhost/api/catalog/admin/produce-search/refresh", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keywords: ["부사 사과"] })
    }));
    expect(anonymous.status).toBe(401);
  });

  it("키가 있으면 모아서 저장하고, 공개 API로 월별 추정 검색수까지 읽습니다", async () => {
    process.env.NAVER_SEARCHAD_API_KEY = "test-access";
    process.env.NAVER_SEARCHAD_SECRET_KEY = "test-secret";
    process.env.NAVER_SEARCHAD_CUSTOMER_ID = "123";
    process.env.NAVER_DATALAB_CLIENT_ID = "test-client";
    process.env.NAVER_DATALAB_CLIENT_SECRET = "test-client-secret";
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://api.searchad.naver.com/")) return json({ keywordList: keywordToolRows });
      if (url === "https://openapi.naver.com/v1/datalab/search") {
        const body = JSON.parse(String(init?.body)) as { startDate: string; keywordGroups: Array<{ groupName: string }> };
        const months = Array.from({ length: 12 }, (_, index) => {
          const date = new Date(`${body.startDate}T00:00:00Z`);
          date.setUTCMonth(date.getUTCMonth() + index);
          return date.toISOString().slice(0, 10);
        });
        return json({ results: body.keywordGroups.map((group) => ({ title: group.groupName, data: months.map((period, index) => ({ period, ratio: index === 11 ? 50 : 25 })) })) });
      }
      return realFetch(input, init);
    }));
    const token = await adminToken();
    const refresh = await app.fetch(new Request("http://localhost/api/catalog/admin/produce-search/refresh", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ keywords: ["부사 사과", "제주 감귤"] })
    }));
    expect(refresh.status).toBe(200);
    expect((await refresh.json() as { data: { updated: number; trends: number } }).data).toMatchObject({ updated: 2, trends: 2 });

    const stats = await app.fetch(new Request("http://localhost/api/catalog/produce-search"));
    expect(stats.status).toBe(200);
    const body = await stats.json() as { data: { updatedAt: string; keywords: Record<string, { total: number; months?: number[]; comp?: string }> } };
    expect(body.data.updatedAt).toBeTruthy();
    expect(body.data.keywords["부사사과"]).toMatchObject({ total: 12000, comp: "높음" });
    // 지난달 비율(50)이 최근 30일 검색수(12,000)에 맞춰지고, 비율 25인 달은 그 절반
    const months = body.data.keywords["부사사과"].months ?? [];
    expect(months).toHaveLength(12);
    expect(Math.max(...months)).toBe(12000);
    expect(Math.min(...months)).toBe(6000);
  });
});
