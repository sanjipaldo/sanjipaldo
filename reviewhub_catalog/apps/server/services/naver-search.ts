// 농수산물 백과사전 네이버 검색량(관리자 > 백과사전 검색량 "검색량 새로고침"):
// ① 네이버 검색광고 키워드 도구: 최근 30일 PC·모바일 검색수 · 경쟁 정도 · 연관 검색어
// ② 네이버 데이터랩 검색어 트렌드(선택): 최근 12개월 월별 비율 → ①의 검색수에 곱해 달마다 추정 검색수
// 키는 Vercel 환경 변수에만 둡니다(코드·문서·로그·DB에 넣지 않음). 결과는 content_settings produce_search_stats(JSON)에 쌓입니다.
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../_core/db";
import { contentSettings } from "../db/schema";

export const PRODUCE_SEARCH_SETTING_KEY = "produce_search_stats";
export const NAVER_SEARCH_ENV = {
  searchAd: ["NAVER_SEARCHAD_API_KEY", "NAVER_SEARCHAD_SECRET_KEY", "NAVER_SEARCHAD_CUSTOMER_ID"],
  datalab: ["NAVER_DATALAB_CLIENT_ID", "NAVER_DATALAB_CLIENT_SECRET"]
} as const;

export type ProduceSearchStat = {
  keyword: string;
  pc: number;
  mobile: number;
  total: number;
  comp?: string;
  months?: number[];
  related?: Array<[string, number]>;
  updatedAt: string;
};
export type ProduceSearchStats = { updatedAt: string | null; keywords: Record<string, ProduceSearchStat> };

export class NaverSearchError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

type Env = Record<string, string | undefined>;
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export function naverSearchConfig(env: Env = process.env) {
  const read = (name: string) => env[name]?.trim() ?? "";
  const searchAd = read("NAVER_SEARCHAD_API_KEY") && read("NAVER_SEARCHAD_SECRET_KEY") && read("NAVER_SEARCHAD_CUSTOMER_ID")
    ? { apiKey: read("NAVER_SEARCHAD_API_KEY"), secret: read("NAVER_SEARCHAD_SECRET_KEY"), customerId: read("NAVER_SEARCHAD_CUSTOMER_ID") }
    : null;
  const datalab = read("NAVER_DATALAB_CLIENT_ID") && read("NAVER_DATALAB_CLIENT_SECRET")
    ? { clientId: read("NAVER_DATALAB_CLIENT_ID"), clientSecret: read("NAVER_DATALAB_CLIENT_SECRET") }
    : null;
  return { searchAd, datalab };
}

// 검색어 비교는 띄어쓰기를 빼고 합니다(키워드 도구는 띄어쓰기 없는 검색어만 받음).
export const searchKeyOf = (keyword: string) => keyword.replace(/\s+/g, "");

// 검색광고 API는 10회 미만을 "< 10"으로 돌려줍니다.
export function countValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "").replace(/[,\s]/g, "");
  if (text.startsWith("<")) return 5;
  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
}

export function searchAdSignature(secret: string, timestamp: string, method: string, uri: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${method}.${uri}`).digest("base64");
}

type KeywordRow = { relKeyword?: string; monthlyPcQcCnt?: unknown; monthlyMobileQcCnt?: unknown; compIdx?: string };

export async function fetchKeywordVolumes(keywords: string[], config: NonNullable<ReturnType<typeof naverSearchConfig>["searchAd"]>, fetcher: Fetcher = fetch) {
  const results = new Map<string, Omit<ProduceSearchStat, "updatedAt" | "months">>();
  const keys = [...new Set(keywords.map(searchKeyOf).filter(Boolean))];
  // 한 번에 검색어 5개까지 물어볼 수 있습니다.
  for (let index = 0; index < keys.length; index += 5) {
    const chunk = keys.slice(index, index + 5);
    const uri = "/keywordstool";
    const timestamp = String(Date.now());
    const response = await fetcher(`https://api.searchad.naver.com${uri}?hintKeywords=${encodeURIComponent(chunk.join(","))}&showDetail=1`, {
      headers: {
        "X-Timestamp": timestamp,
        "X-API-KEY": config.apiKey,
        "X-Customer": config.customerId,
        "X-Signature": searchAdSignature(config.secret, timestamp, "GET", uri)
      }
    });
    if (!response.ok) {
      throw new NaverSearchError(response.status === 401 || response.status === 403
        ? `네이버 검색광고 API가 키를 받지 않았어요(${response.status}). 엑세스라이선스·비밀키·고객 ID를 확인해 주세요.`
        : `네이버 검색광고 API 응답 오류(${response.status})`);
    }
    const body = await response.json().catch(() => ({})) as { keywordList?: KeywordRow[] };
    const rows = (body.keywordList ?? []).map((row) => {
      const pc = countValue(row.monthlyPcQcCnt);
      const mobile = countValue(row.monthlyMobileQcCnt);
      return { key: searchKeyOf(row.relKeyword ?? ""), keyword: row.relKeyword ?? "", pc, mobile, total: pc + mobile, comp: row.compIdx };
    });
    for (const key of chunk) {
      const own = rows.find((row) => row.key === key);
      // 연관 검색어는 그 검색어를 품은 것 중 많이 찾는 순서로 5개(예: 부사사과 → 청송부사사과, 부사사과5kg)
      const related = rows
        .filter((row) => row.key !== key && row.key.includes(key))
        .sort((first, second) => second.total - first.total)
        .slice(0, 5)
        .map((row): [string, number] => [row.keyword, row.total]);
      results.set(key, { keyword: key, pc: own?.pc ?? 0, mobile: own?.mobile ?? 0, total: own?.total ?? 0, comp: own?.comp, related });
    }
  }
  return results;
}

// 데이터랩: 지난달까지 12개월의 월별 비율(그 요청 안 가장 많은 달 = 100) → 1~12월 자리
export function trendRange(now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1));
  const day = (date: Date) => date.toISOString().slice(0, 10);
  return { startDate: day(start), endDate: day(end), lastMonth: end.getUTCMonth() + 1 };
}

export async function fetchSearchTrends(keywords: string[], config: NonNullable<ReturnType<typeof naverSearchConfig>["datalab"]>, now = new Date(), fetcher: Fetcher = fetch) {
  const { startDate, endDate, lastMonth } = trendRange(now);
  const trends = new Map<string, { ratios: number[]; lastMonth: number }>();
  const unique = [...new Map(keywords.map((keyword) => [searchKeyOf(keyword), keyword.trim()])).entries()];
  // 한 번에 검색어 묶음 5개까지
  for (let index = 0; index < unique.length; index += 5) {
    const chunk = unique.slice(index, index + 5);
    const response = await fetcher("https://openapi.naver.com/v1/datalab/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Naver-Client-Id": config.clientId, "X-Naver-Client-Secret": config.clientSecret },
      body: JSON.stringify({ startDate, endDate, timeUnit: "month", keywordGroups: chunk.map(([key, keyword]) => ({ groupName: key, keywords: [keyword] })) })
    });
    if (!response.ok) {
      throw new NaverSearchError(response.status === 401 || response.status === 403
        ? `네이버 데이터랩 API가 키를 받지 않았어요(${response.status}). Client ID·Client Secret을 확인해 주세요.`
        : `네이버 데이터랩 API 응답 오류(${response.status})`);
    }
    const body = await response.json().catch(() => ({})) as { results?: Array<{ title?: string; data?: Array<{ period?: string; ratio?: number }> }> };
    for (const result of body.results ?? []) {
      const ratios = Array.from({ length: 12 }, () => 0);
      for (const point of result.data ?? []) {
        const month = Number(String(point.period ?? "").slice(5, 7));
        if (month >= 1 && month <= 12) ratios[month - 1] = Number(point.ratio) || 0;
      }
      if (result.title) trends.set(result.title, { ratios, lastMonth });
    }
  }
  return trends;
}

// 최근 30일 검색수를 지난달 비율에 맞추고, 다른 달은 비율만큼 늘리거나 줄여 달마다 추정합니다.
export function estimateMonthlyVolumes(total: number, ratios: number[], lastMonth: number) {
  const base = ratios[lastMonth - 1] || (ratios.reduce((sum, value) => sum + value, 0) / (ratios.filter((value) => value > 0).length || 1));
  if (!base || !total) return undefined;
  return ratios.map((ratio) => Math.round((total * ratio) / base));
}

export async function readProduceSearchStats(): Promise<ProduceSearchStats> {
  try {
    const rows = await getDb().select().from(contentSettings).where(eq(contentSettings.key, PRODUCE_SEARCH_SETTING_KEY)).limit(1);
    const parsed = rows[0]?.value ? JSON.parse(rows[0].value) as Partial<ProduceSearchStats> : null;
    return { updatedAt: parsed?.updatedAt ?? null, keywords: parsed?.keywords && typeof parsed.keywords === "object" ? parsed.keywords : {} };
  } catch {
    return { updatedAt: null, keywords: {} };
  }
}

async function saveProduceSearchStats(stats: ProduceSearchStats) {
  const value = JSON.stringify(stats);
  const now = new Date().toISOString();
  await getDb().insert(contentSettings).values({ key: PRODUCE_SEARCH_SETTING_KEY, value, updatedAt: now })
    .onConflictDoUpdate({ target: contentSettings.key, set: { value, updatedAt: now } });
}

// 관리자 버튼 한 번에 검색어 25개까지(서버 시간 제한 안). 화면이 나눠서 여러 번 부릅니다.
export async function refreshProduceSearch(keywords: string[], options: { env?: Env; fetcher?: Fetcher; now?: Date } = {}) {
  const config = naverSearchConfig(options.env);
  if (!config.searchAd) throw new NaverSearchError("네이버 검색광고 API 키가 아직 없어요. Vercel 환경 변수에 키를 넣은 뒤 다시 배포해 주세요.", 409);
  const now = options.now ?? new Date();
  const volumes = await fetchKeywordVolumes(keywords, config.searchAd, options.fetcher);
  const trends = config.datalab ? await fetchSearchTrends(keywords, config.datalab, now, options.fetcher) : new Map<string, { ratios: number[]; lastMonth: number }>();
  const stats = await readProduceSearchStats();
  const updatedAt = now.toISOString();
  for (const [key, volume] of volumes) {
    const trend = trends.get(key);
    stats.keywords[key] = {
      ...volume,
      months: trend ? estimateMonthlyVolumes(volume.total, trend.ratios, trend.lastMonth) : stats.keywords[key]?.months,
      updatedAt
    };
  }
  stats.updatedAt = updatedAt;
  await saveProduceSearchStats(stats);
  console.info(`[naver-search] refreshed ${volumes.size} keywords${config.datalab ? " with trends" : ""}`);
  return { updated: volumes.size, trends: trends.size, updatedAt };
}
