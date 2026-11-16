// 백과사전 네이버 검색량 모으기: 검색광고 키워드 도구(서명 헤더·5개씩) + 데이터랩 월별 추이 → 달마다 추정 검색수.
// - 키가 없으면 409로 안내, 관리자만 새로고침, 공개 GET /api/catalog/produce-search로 모아 둔 값을 읽습니다.
// - 실제 네이버 서버 대신 가짜 응답을 씁니다(키 값은 테스트용 가짜).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../_core/create-app";
import { executeSql } from "../_core/db";
import { applyMigrations, resetDatabase, signUpAndGetToken } from "../_test/helpers";
import { NaverSearchError, countValue, datalabProviderOrder, estimateMonthlyVolumes, fetchKeywordVolumes, fetchSearchTrends, searchAdSignature, trendRange } from "../services/naver-search";

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

function trendResponse(init?: RequestInit) {
  const body = JSON.parse(String(init?.body)) as { startDate: string; keywordGroups: Array<{ groupName: string }> };
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(`${body.startDate}T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + index);
    return date.toISOString().slice(0, 10);
  });
  return json({ results: body.keywordGroups.map((group) => ({ title: group.groupName, data: months.map((period, index) => ({ period, ratio: index === 1 ? 100 : 20 })) })) });
}

describe("검색어 트렌드: 네이버 클라우드 API 허브 · 개발자센터 키 모두 받기", () => {
  const NCP_URL = "https://naveropenapi.apigw.ntruss.com/datalab/v1/search";
  const DEV_URL = "https://openapi.naver.com/v1/datalab/search";

  it("API 허브 Client ID(소문자·숫자 10자리)는 API 허브 주소에 X-NCP-APIGW 헤더로 먼저 묻습니다", async () => {
    expect(datalabProviderOrder("ab12cd34ef")).toEqual(["ncp", "developers"]);
    expect(datalabProviderOrder("AbCdEfGhIjKlMnOpQrSt")).toEqual(["developers", "ncp"]);
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, headers: init?.headers as Record<string, string> });
      return trendResponse(init);
    });
    const trends = await fetchSearchTrends(["부사 사과", "감귤", "a", "b", "c", "d"], { clientId: "ab12cd34ef", clientSecret: "test-secret" }, new Date("2026-11-12T03:00:00Z"), fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(calls.every((call) => call.url === NCP_URL)).toBe(true);
    expect(calls[0].headers["X-NCP-APIGW-API-KEY-ID"]).toBe("ab12cd34ef");
    expect(calls[0].headers["X-NCP-APIGW-API-KEY"]).toBe("test-secret");
    expect(calls[0].headers["X-Naver-Client-Id"]).toBeUndefined();
    expect(trends.provider).toBe("ncp");
    expect(trends.get("부사사과")?.ratios[11]).toBe(100); // 기간 둘째 달(2025-12) = 12월 자리
  });

  it("한쪽이 키를 거절(401)하면 다른 쪽으로 다시 묻고, 다음 묶음부터는 통한 곳에만 묻습니다", async () => {
    const urls: string[] = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(url);
      return url === NCP_URL ? json({ errorMessage: "Authentication Failed" }, 401) : trendResponse(init);
    });
    const trends = await fetchSearchTrends(["a", "b", "c", "d", "e", "f"], { clientId: "ab12cd34ef", clientSecret: "test-secret" }, new Date("2026-11-12T03:00:00Z"), fetcher);
    expect(urls).toEqual([NCP_URL, DEV_URL, DEV_URL]);
    expect(trends.provider).toBe("developers");
    expect(trends.size).toBe(6);
  });

  it("둘 다 거절하면 어느 쪽이 몇 번 오류인지 알려 줍니다", async () => {
    const fetcher = vi.fn(async (url: string) => json({}, url === NCP_URL ? 401 : 403));
    const error = await fetchSearchTrends(["사과"], { clientId: "ab12cd34ef", clientSecret: "x" }, new Date(), fetcher).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(NaverSearchError);
    expect((error as Error).message).toContain("네이버 클라우드 API 허브 401");
    expect((error as Error).message).toContain("네이버 개발자센터 403");
  });

  it("키워드 도구가 묶음을 거절(400)하면 하나씩 다시 묻고, 그래도 안 되는 검색어만 건너뜁니다", async () => {
    const fetcher = vi.fn(async (url: string) => {
      const hints = decodeURIComponent(new URL(url).searchParams.get("hintKeywords") ?? "").split(",");
      if (hints.includes("나쁜검색어")) return json({ title: "invalid" }, 400);
      return json({ keywordList: hints.map((hint) => ({ relKeyword: hint, monthlyPcQcCnt: 10, monthlyMobileQcCnt: 90, compIdx: "낮음" })) });
    });
    const result = await fetchKeywordVolumes(["사과", "나쁜 검색어", "감귤"], { apiKey: "k", secret: "s", customerId: "1" }, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect([...result.keys()]).toEqual(["사과", "감귤"]);
    expect(result.get("감귤")?.total).toBe(100);
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

  it("연결 확인: 관리자만, 검색어 하나로 두 API를 불러 보고 저장하지 않으며 빠진 키 이름을 알려 줍니다", async () => {
    process.env.NAVER_SEARCHAD_API_KEY = "test-access";
    process.env.NAVER_SEARCHAD_SECRET_KEY = "test-secret";
    process.env.NAVER_DATALAB_CLIENT_ID = "ab12cd34ef";
    process.env.NAVER_DATALAB_CLIENT_SECRET = "test-client-secret";
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://naveropenapi.apigw.ntruss.com/datalab/v1/search") return trendResponse(init);
      if (url.startsWith("https://api.searchad.naver.com/")) return json({ keywordList: [{ relKeyword: "사과", monthlyPcQcCnt: 1000, monthlyMobileQcCnt: 9000 }] });
      return realFetch(input, init);
    }));
    const token = await adminToken();
    const status = await app.fetch(new Request("http://localhost/api/catalog/admin/produce-search/status", { headers: { Authorization: `Bearer ${token}` } }));
    const statusBody = await status.json() as { data: { searchAd: boolean; datalab: boolean; missing: string[] } };
    expect(statusBody.data).toMatchObject({ searchAd: false, datalab: true, missing: ["NAVER_SEARCHAD_CUSTOMER_ID"] });
    expect(JSON.stringify(statusBody)).not.toContain("test-secret");

    const anonymous = await app.fetch(new Request("http://localhost/api/catalog/admin/produce-search/check", { method: "POST" }));
    expect(anonymous.status).toBe(401);
    const first = await app.fetch(new Request("http://localhost/api/catalog/admin/produce-search/check", { method: "POST", headers: { Authorization: `Bearer ${token}` } }));
    const firstBody = await first.json() as { data: { searchAd: { ready: boolean; ok: boolean; message: string }; datalab: { ok: boolean; provider?: string; message: string } } };
    expect(firstBody.data.searchAd).toMatchObject({ ready: false, ok: false });
    expect(firstBody.data.searchAd.message).toContain("NAVER_SEARCHAD_CUSTOMER_ID");
    expect(firstBody.data.datalab).toMatchObject({ ok: true, provider: "네이버 클라우드 API 허브" });

    process.env.NAVER_SEARCHAD_CUSTOMER_ID = "123";
    const second = await app.fetch(new Request("http://localhost/api/catalog/admin/produce-search/check", { method: "POST", headers: { Authorization: `Bearer ${token}` } }));
    const secondBody = await second.json() as { data: { searchAd: { ok: boolean; message: string } } };
    expect(secondBody.data.searchAd.ok).toBe(true);
    expect(secondBody.data.searchAd.message).toContain("10,000회");
    // 연결 확인은 저장하지 않습니다.
    const stats = await app.fetch(new Request("http://localhost/api/catalog/produce-search"));
    expect((await stats.json() as { data: { updatedAt: string | null } }).data.updatedAt).toBeNull();
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
