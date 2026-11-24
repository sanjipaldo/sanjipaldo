// 운영 현황(공개 메인·관리자 위쪽 카드: 날씨 · 선과장(공휴일) · 이번 달 상품 현황) — GET /api/catalog/operations
// CPU 줄이기(2026-11-24 관리자 요청): 화면은 보일 때만 5분마다 묻고, 서버는
//   - 날씨·선과장·이번 달 상품 현황을 5분 동안 만들어 둔 값으로 돌려주고(Vercel에서만, catalogCacheEnabled),
//   - 접속 IP의 지역 확인(ipwho.is)은 IP마다 6시간 기억합니다(서버 메모리에만, 최대 500개, IP는 해시로만 보관).
// 예전에는 1분마다 요청마다 DB 집계(이번 달 신규·품절)와 ipwho.is 조회를 새로 해서 두고푸드 CPU의 약 70%를 썼습니다.
import { createHash } from "node:crypto";
import { getMonthlyCatalogStats } from "./catalog";
import { catalogCacheEnabled } from "./catalog-version";

type WeatherRegion = {
  region: string;
  city: string;
  latitude: number;
  longitude: number;
};

type HolidayItem = {
  date: string;
  localName: string;
  types?: string[];
};

type WeatherValue = {
  region: string;
  city: string;
  temperature: number | null;
  weatherCode: number | null;
  condition: string;
  observedAt: string | null;
  available: boolean;
};

type IpLocation = {
  city: string;
  latitude: number;
  longitude: number;
};

type MonthlyStats = { newProducts: number; soldOutChanges: number; activityChanges: number };

type HolidayStatus = Awaited<ReturnType<typeof getHolidayStatus>>;

type SharedOverview = {
  generatedAt: string;
  weather: WeatherValue[];
  operation: HolidayStatus;
  monthlyStats: MonthlyStats;
};

const weatherRegions: WeatherRegion[] = [
  { region: "서울", city: "서울", latitude: 37.5665, longitude: 126.9780 },
  { region: "인천", city: "인천", latitude: 37.4563, longitude: 126.7052 },
  { region: "경기도", city: "수원", latitude: 37.2636, longitude: 127.0286 },
  { region: "강원도", city: "춘천", latitude: 37.8813, longitude: 127.7298 },
  { region: "충청도", city: "대전", latitude: 36.3504, longitude: 127.3845 },
  { region: "세종", city: "세종", latitude: 36.4800, longitude: 127.2890 },
  { region: "전라도", city: "광주", latitude: 35.1595, longitude: 126.8526 },
  { region: "경상도", city: "대구", latitude: 35.8714, longitude: 128.6014 },
  { region: "제주도", city: "제주", latitude: 33.4996, longitude: 126.5312 }
];

// 날씨·선과장·이번 달 상품 현황을 다시 쓰는 시간. 이번 달 현황 집계가 실패했으면 0으로 보여 주되 30초 뒤 다시 집계합니다.
const OVERVIEW_CACHE_MS = 5 * 60 * 1000;
const OVERVIEW_RETRY_MS = 30 * 1000;
// 접속 IP → 지역은 자주 바뀌지 않아 6시간 기억합니다. 조회가 실패하면 10분 뒤 다시 묻습니다.
const IP_LOCATION_CACHE_MS = 6 * 60 * 60 * 1000;
const IP_LOCATION_RETRY_MS = 10 * 60 * 1000;
const IP_LOCATION_CACHE_MAX = 500;

let weatherCache: { expiresAt: number; values: WeatherValue[] } | null = null;
let sharedOverviewCache: { expiresAt: number; value: Promise<SharedOverview> } | null = null;

const holidayCache = new Map<number, { expiresAt: number; values: HolidayItem[] }>();
const locationWeatherCache = new Map<string, { expiresAt: number; value: WeatherValue }>();
const ipLocationCache = new Map<string, { expiresAt: number; value: IpLocation | null }>();

// 테스트에서 서버 메모리에 기억한 값을 비웁니다.
export function resetCatalogOperationsCache() {
  weatherCache = null;
  sharedOverviewCache = null;
  holidayCache.clear();
  locationWeatherCache.clear();
  ipLocationCache.clear();
}

function weatherCondition(code: number | null) {
  if (code === null) return "확인 중";
  if (code === 0) return "맑음";
  if ([1, 2].includes(code)) return "대체로 맑음";
  if (code === 3) return "흐림";
  if ([45, 48].includes(code)) return "안개";
  if ([51, 53, 55, 56, 57].includes(code)) return "이슬비";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "비";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "눈";
  if ([95, 96, 99].includes(code)) return "뇌우";
  return "날씨 변동";
}

async function fetchJson<T>(url: string, timeoutMs = 5000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Upstream request failed: ${response.status}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

async function getWeather() {
  if (weatherCache && weatherCache.expiresAt > Date.now()) return weatherCache.values;
  const values = await Promise.all(weatherRegions.map(async (item): Promise<WeatherValue> => {
    try {
      const query = new URLSearchParams({
        latitude: String(item.latitude),
        longitude: String(item.longitude),
        current: "temperature_2m,weather_code",
        timezone: "Asia/Seoul",
        forecast_days: "1"
      });
      const payload = await fetchJson<{
        current?: { time?: string; temperature_2m?: number; weather_code?: number };
      }>(`https://api.open-meteo.com/v1/forecast?${query.toString()}`);
      const temperature = typeof payload.current?.temperature_2m === "number"
        ? Math.round(payload.current.temperature_2m)
        : null;
      const weatherCode = typeof payload.current?.weather_code === "number"
        ? payload.current.weather_code
        : null;
      return {
        region: item.region,
        city: item.city,
        temperature,
        weatherCode,
        condition: weatherCondition(weatherCode),
        observedAt: payload.current?.time ?? null,
        available: temperature !== null
      };
    } catch {
      return {
        region: item.region,
        city: item.city,
        temperature: null,
        weatherCode: null,
        condition: "확인 지연",
        observedAt: null,
        available: false
      };
    }
  }));
  weatherCache = { expiresAt: Date.now() + (10 * 60 * 1000), values };
  return values;
}

function publicIp(value?: string | null) {
  const ip = value?.split(",")[0]?.trim();
  if (!ip || ip === "::1" || ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return null;
  return ip;
}

// 접속 IP의 지역(한국일 때만). 같은 IP는 6시간 동안 다시 묻지 않습니다. 메모리에는 IP 대신 해시를 둡니다.
async function lookupIpLocation(ip: string): Promise<IpLocation | null> {
  const key = createHash("sha256").update(ip).digest("base64url");
  const now = Date.now();
  const cached = ipLocationCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  let value: IpLocation | null = null;
  let keepMs = IP_LOCATION_CACHE_MS;
  try {
    const location = await fetchJson<{
      success?: boolean;
      city?: string;
      region?: string;
      country_code?: string;
      latitude?: number;
      longitude?: number;
    }>(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,region,country_code,latitude,longitude`, 3000);
    if (location.success && location.country_code === "KR" && typeof location.latitude === "number" && typeof location.longitude === "number") {
      value = { city: location.city || location.region || "접속 지역", latitude: location.latitude, longitude: location.longitude };
    }
  } catch {
    keepMs = IP_LOCATION_RETRY_MS;
  }
  ipLocationCache.delete(key);
  if (ipLocationCache.size >= IP_LOCATION_CACHE_MAX) {
    // 가장 먼저 넣은 것부터 지웁니다(Map은 넣은 순서를 기억합니다).
    const oldest = ipLocationCache.keys().next().value;
    if (oldest !== undefined) ipLocationCache.delete(oldest);
  }
  ipLocationCache.set(key, { expiresAt: now + keepMs, value });
  return value;
}

async function getLocationWeather(forwardedIp?: string | null) {
  const ip = publicIp(forwardedIp);
  if (!ip) return null;
  try {
    const location = await lookupIpLocation(ip);
    if (!location) return null;
    const cacheKey = `${location.latitude.toFixed(1)},${location.longitude.toFixed(1)}`;
    const cached = locationWeatherCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const query = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      current: "temperature_2m,weather_code",
      timezone: "Asia/Seoul",
      forecast_days: "1"
    });
    const payload = await fetchJson<{
      current?: { time?: string; temperature_2m?: number; weather_code?: number };
    }>(`https://api.open-meteo.com/v1/forecast?${query.toString()}`);
    const weatherCode = typeof payload.current?.weather_code === "number" ? payload.current.weather_code : null;
    const value: WeatherValue = {
      region: "현재 위치",
      city: location.city,
      temperature: typeof payload.current?.temperature_2m === "number" ? Math.round(payload.current.temperature_2m) : null,
      weatherCode,
      condition: weatherCondition(weatherCode),
      observedAt: payload.current?.time ?? null,
      available: typeof payload.current?.temperature_2m === "number"
    };
    locationWeatherCache.set(cacheKey, { expiresAt: Date.now() + (10 * 60 * 1000), value });
    return value;
  } catch {
    return null;
  }
}

function seoulDateParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: get("weekday")
  };
}

async function getHolidayStatus(now: Date) {
  const seoul = seoulDateParts(now);
  let holidays = holidayCache.get(seoul.year);
  let sourceAvailable = true;
  if (!holidays || holidays.expiresAt <= Date.now()) {
    try {
      const values = await fetchJson<HolidayItem[]>(
        `https://date.nager.at/api/v3/PublicHolidays/${seoul.year}/KR`,
        5000
      );
      holidays = {
        expiresAt: Date.now() + (24 * 60 * 60 * 1000),
        values: values.filter((item) => item.localName !== "노동절")
      };
      holidayCache.set(seoul.year, holidays);
    } catch {
      sourceAvailable = false;
      holidays = holidays ?? { expiresAt: Date.now() + (5 * 60 * 1000), values: [] };
    }
  }
  const holiday = holidays.values.find((item) => item.date === seoul.date);
  const sunday = seoul.weekday === "Sun";
  const closed = sunday || Boolean(holiday);
  return {
    isClosed: closed,
    status: closed ? "선과장 휴무" : sourceAvailable ? "정상운영" : "공휴일 확인 지연",
    reason: holiday?.localName ?? (sunday ? "일요일" : sourceAvailable ? "대한민국 공휴일 아님" : "공휴일 데이터 확인이 지연되고 있습니다."),
    sourceAvailable
  };
}

// 모든 방문자에게 같은 부분(날씨·선과장·이번 달 상품 현황). Vercel에서는 5분 동안 만들어 둔 값을 같이 씁니다.
function getSharedOverview(): Promise<SharedOverview> {
  const now = Date.now();
  const reuse = catalogCacheEnabled();
  if (reuse && sharedOverviewCache && sharedOverviewCache.expiresAt > now) return sharedOverviewCache.value;
  let statsFailed = false;
  const value = Promise.all([
    getWeather(),
    getHolidayStatus(new Date(now)),
    // DB 집계가 실패해도 날씨·운영 상태는 보여야 하므로 통계만 0으로 대체합니다.
    getMonthlyCatalogStats().catch((): MonthlyStats => {
      statsFailed = true;
      return { newProducts: 0, soldOutChanges: 0, activityChanges: 0 };
    })
  ]).then(([weather, operation, monthlyStats]) => {
    if (reuse && sharedOverviewCache?.value === value && statsFailed) sharedOverviewCache.expiresAt = Date.now() + OVERVIEW_RETRY_MS;
    return { generatedAt: new Date(now).toISOString(), weather, operation, monthlyStats };
  });
  if (reuse) {
    sharedOverviewCache = { expiresAt: now + OVERVIEW_CACHE_MS, value };
    value.catch(() => {
      if (sharedOverviewCache?.value === value) sharedOverviewCache = null;
    });
  }
  return value;
}

export async function getCatalogOperationsOverview(forwardedIp?: string | null) {
  const [shared, currentWeather] = await Promise.all([
    getSharedOverview(),
    getLocationWeather(forwardedIp)
  ]);
  return {
    generatedAt: shared.generatedAt,
    timeZone: "Asia/Seoul",
    weather: shared.weather,
    currentWeather,
    operation: shared.operation,
    monthlyStats: shared.monthlyStats
  };
}
