// 농수산물 백과사전 네이버 검색량(관리자 > 백과사전 검색량 "검색량 새로고침"):
// ① 네이버 검색광고 키워드 도구: 최근 30일 PC·모바일 검색수 · 경쟁 정도 · 연관 검색어
// ② 네이버 검색어 트렌드(선택): 최근 12개월 월별 비율 → ①의 검색수에 곱해 달마다 추정 검색수.
//    네이버 클라우드 API 허브(검색어 트렌드, Client ID 10자리 · X-NCP-APIGW-API-KEY-ID 헤더)와
//    네이버 개발자센터 데이터랩(X-Naver-Client-Id 헤더) 키를 모두 받습니다. 한쪽이 키를 거절(401·403·404)하면 다른 쪽으로 다시 묻습니다.
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

// 비어 있는 환경 변수 이름(값은 보여 주지 않음)
export function missingNaverEnv(env: Env = process.env) {
  return [...NAVER_SEARCH_ENV.searchAd, ...NAVER_SEARCH_ENV.datalab].filter((name) => !env[name]?.trim());
}

async function callNaver(fetcher: Fetcher, url: string, init: RequestInit | undefined, label: string) {
  try {
    return await fetcher(url, init);
  } catch {
    throw new NaverSearchError(`${label} 서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.`);
  }
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

async function requestKeywordTool(chunk: string[], config: NonNullable<ReturnType<typeof naverSearchConfig>["searchAd"]>, fetcher: Fetcher) {
  const uri = "/keywordstool";
  const timestamp = String(Date.now());
  return callNaver(fetcher, `https://api.searchad.naver.com${uri}?hintKeywords=${encodeURIComponent(chunk.join(","))}&showDetail=1`, {
    headers: {
      "X-Timestamp": timestamp,
      "X-API-KEY": config.apiKey,
      "X-Customer": config.customerId,
      "X-Signature": searchAdSignature(config.secret, timestamp, "GET", uri)
    }
  }, "네이버 검색광고 API");
}

function keywordToolFailure(status: number) {
  return new NaverSearchError(status === 401 || status === 403
    ? `네이버 검색광고 API가 키를 받지 않았어요(${status}). 엑세스라이선스·비밀키·고객 ID(CUSTOMER_ID)를 확인해 주세요.`
    : status === 429
      ? "네이버 검색광고 API 호출이 너무 많아요(429). 잠시 뒤 다시 시도해 주세요."
      : `네이버 검색광고 API 응답 오류(${status})`);
}

export async function fetchKeywordVolumes(keywords: string[], config: NonNullable<ReturnType<typeof naverSearchConfig>["searchAd"]>, fetcher: Fetcher = fetch) {
  const results = new Map<string, Omit<ProduceSearchStat, "updatedAt" | "months">>();
  const keys = [...new Set(keywords.map(searchKeyOf).filter(Boolean))];
  const skipped: string[] = [];
  const readRows = async (response: Response) => {
    const body = await response.json().catch(() => ({})) as { keywordList?: KeywordRow[] };
    return (body.keywordList ?? []).map((row) => {
      const pc = countValue(row.monthlyPcQcCnt);
      const mobile = countValue(row.monthlyMobileQcCnt);
      return { key: searchKeyOf(row.relKeyword ?? ""), keyword: row.relKeyword ?? "", pc, mobile, total: pc + mobile, comp: row.compIdx };
    });
  };
  const collect = (chunk: string[], rows: Awaited<ReturnType<typeof readRows>>) => {
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
  };
  // 한 번에 검색어 5개까지 물어볼 수 있습니다.
  for (let index = 0; index < keys.length; index += 5) {
    const chunk = keys.slice(index, index + 5);
    const response = await requestKeywordTool(chunk, config, fetcher);
    if (response.ok) {
      collect(chunk, await readRows(response));
      continue;
    }
    // 묶음 안 검색어 하나가 거절되면(400) 하나씩 다시 묻고, 그래도 안 되는 검색어는 건너뜁니다(저장된 값은 그대로).
    if (response.status !== 400 || chunk.length === 1) {
      if (response.status === 400) { skipped.push(...chunk); continue; }
      throw keywordToolFailure(response.status);
    }
    for (const key of chunk) {
      const single = await requestKeywordTool([key], config, fetcher);
      if (single.ok) collect([key], await readRows(single));
      else if (single.status === 400) skipped.push(key);
      else throw keywordToolFailure(single.status);
    }
  }
  if (skipped.length > 0) console.info(`[naver-search] keyword tool skipped ${skipped.length} keywords`);
  return results;
}

// 데이터랩: 지난달까지 12개월의 월별 비율(그 요청 안 가장 많은 달 = 100) → 1~12월 자리
export function trendRange(now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1));
  const day = (date: Date) => date.toISOString().slice(0, 10);
  return { startDate: day(start), endDate: day(end), lastMonth: end.getUTCMonth() + 1 };
}

export type DatalabProvider = "ncp" | "developers";
export const DATALAB_ENDPOINTS: Record<DatalabProvider, { url: string; label: string; headers: (config: { clientId: string; clientSecret: string }) => Record<string, string> }> = {
  ncp: {
    url: "https://naveropenapi.apigw.ntruss.com/datalab/v1/search",
    label: "네이버 클라우드 API 허브",
    headers: (config) => ({ "X-NCP-APIGW-API-KEY-ID": config.clientId, "X-NCP-APIGW-API-KEY": config.clientSecret })
  },
  developers: {
    url: "https://openapi.naver.com/v1/datalab/search",
    label: "네이버 개발자센터",
    headers: (config) => ({ "X-Naver-Client-Id": config.clientId, "X-Naver-Client-Secret": config.clientSecret })
  }
};

// 네이버 클라우드 API 허브 Client ID는 소문자·숫자 10자리, 개발자센터 Client ID는 20자 안팎이라 먼저 물어볼 곳을 고릅니다.
export function datalabProviderOrder(clientId: string): DatalabProvider[] {
  return /^[a-z0-9]{10}$/.test(clientId) ? ["ncp", "developers"] : ["developers", "ncp"];
}

type TrendResult = { title?: string; data?: Array<{ period?: string; ratio?: number }> };

export async function fetchSearchTrends(keywords: string[], config: NonNullable<ReturnType<typeof naverSearchConfig>["datalab"]>, now = new Date(), fetcher: Fetcher = fetch) {
  const { startDate, endDate, lastMonth } = trendRange(now);
  const trends = new Map<string, { ratios: number[]; lastMonth: number }>();
  const unique = [...new Map(keywords.map((keyword) => [searchKeyOf(keyword), keyword.trim()])).entries()];
  let order = datalabProviderOrder(config.clientId);
  let provider: DatalabProvider | null = null;
  // 한 번에 검색어 묶음 5개까지
  for (let index = 0; index < unique.length; index += 5) {
    const chunk = unique.slice(index, index + 5);
    const body = JSON.stringify({ startDate, endDate, timeUnit: "month", keywordGroups: chunk.map(([key, keyword]) => ({ groupName: key, keywords: [keyword] })) });
    let results: TrendResult[] | null = null;
    const tried: string[] = [];
    for (const candidate of order) {
      const endpoint = DATALAB_ENDPOINTS[candidate];
      const response = await callNaver(fetcher, endpoint.url, { method: "POST", headers: { "Content-Type": "application/json", ...endpoint.headers(config) }, body }, "네이버 검색어 트렌드 API");
      if (response.ok) {
        results = ((await response.json().catch(() => ({}))) as { results?: TrendResult[] }).results ?? [];
        provider = candidate;
        order = [candidate]; // 다음 묶음부터는 통한 곳에만 묻습니다.
        break;
      }
      tried.push(`${endpoint.label} ${response.status}`);
      if (![401, 403, 404].includes(response.status)) break;
    }
    if (!results) {
      const keyProblem = tried.some((entry) => / (401|403|404)$/.test(entry));
      throw new NaverSearchError(keyProblem
        ? `네이버 검색어 트렌드 API가 키를 받지 않았어요(${tried.join(" · ")}). Client ID·Client Secret과 검색어 트렌드 API 사용 신청을 확인해 주세요.`
        : `네이버 검색어 트렌드 API 응답 오류(${tried.join(" · ")})`);
    }
    for (const result of results) {
      const ratios = Array.from({ length: 12 }, () => 0);
      for (const point of result.data ?? []) {
        const month = Number(String(point.period ?? "").slice(5, 7));
        if (month >= 1 && month <= 12) ratios[month - 1] = Number(point.ratio) || 0;
      }
      if (result.title) trends.set(result.title, { ratios, lastMonth });
    }
  }
  return Object.assign(trends, { provider });
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
  const provider = "provider" in trends ? trends.provider : null;
  console.info(`[naver-search] refreshed ${volumes.size} keywords${provider ? ` with trends (${provider})` : ""}`);
  return { updated: volumes.size, trends: trends.size, updatedAt };
}

// 관리자 "연결 확인": 검색어 하나("사과")로 두 API를 불러 보기만 하고 저장하지 않습니다(키 값은 돌려주지 않음).
export type NaverCheck = { ready: boolean; ok: boolean; message: string; provider?: string };
export async function checkNaverSearch(options: { env?: Env; fetcher?: Fetcher; now?: Date } = {}) {
  const env = options.env ?? process.env;
  const config = naverSearchConfig(env);
  const missing = missingNaverEnv(env);
  const keyword = "사과";
  const fail = (error: unknown) => error instanceof NaverSearchError ? error.message : "알 수 없는 오류가 났어요.";
  const searchAd: NaverCheck = config.searchAd
    ? await fetchKeywordVolumes([keyword], config.searchAd, options.fetcher)
      .then((volumes) => ({ ready: true, ok: true, message: `연결됨 · '${keyword}' 최근 30일 검색수 ${(volumes.get(keyword)?.total ?? 0).toLocaleString("ko-KR")}회` }))
      .catch((error: unknown) => ({ ready: true, ok: false, message: fail(error) }))
    : { ready: false, ok: false, message: `키가 아직 없어요: ${missing.filter((name) => name.startsWith("NAVER_SEARCHAD")).join(", ")}` };
  const datalab: NaverCheck = config.datalab
    ? await fetchSearchTrends([keyword], config.datalab, options.now ?? new Date(), options.fetcher)
      .then((trends) => {
        const ratios = trends.get(keyword)?.ratios ?? [];
        const peak = ratios.length ? ratios.indexOf(Math.max(...ratios)) + 1 : 0;
        const provider = trends.provider ? DATALAB_ENDPOINTS[trends.provider].label : undefined;
        return { ready: true, ok: true, provider, message: `연결됨 (${provider}) · '${keyword}' 지난 12개월 중 가장 많이 찾은 달 ${peak}월` };
      })
      .catch((error: unknown) => ({ ready: true, ok: false, message: fail(error) }))
    : { ready: false, ok: false, message: `키가 아직 없어요: ${missing.filter((name) => name.startsWith("NAVER_DATALAB")).join(", ")}` };
  console.info(`[naver-search] check searchAd=${searchAd.ok ? "ok" : searchAd.ready ? "fail" : "missing"} datalab=${datalab.ok ? "ok" : datalab.ready ? "fail" : "missing"}`);
  return { searchAd, datalab };
}
