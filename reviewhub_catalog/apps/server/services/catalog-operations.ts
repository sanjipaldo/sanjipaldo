import { getMonthlyCatalogStats } from "./catalog";

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

let weatherCache: {
  expiresAt: number;
  values: Array<{
    region: string;
    city: string;
    temperature: number | null;
    weatherCode: number | null;
    condition: string;
    observedAt: string | null;
    available: boolean;
  }>;
} | null = null;

const holidayCache = new Map<number, { expiresAt: number; values: HolidayItem[] }>();
const locationWeatherCache = new Map<string, {
  expiresAt: number;
  value: {
    region: string;
    city: string;
    temperature: number | null;
    weatherCode: number | null;
    condition: string;
    observedAt: string | null;
    available: boolean;
  };
}>();

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
  const values = await Promise.all(weatherRegions.map(async (item) => {
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

async function getLocationWeather(forwardedIp?: string | null) {
  const ip = publicIp(forwardedIp);
  if (!ip) return null;
  try {
    const location = await fetchJson<{
      success?: boolean;
      city?: string;
      region?: string;
      country_code?: string;
      latitude?: number;
      longitude?: number;
    }>(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,region,country_code,latitude,longitude`, 3000);
    if (!location.success || location.country_code !== "KR" || typeof location.latitude !== "number" || typeof location.longitude !== "number") return null;
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
    const value = {
      region: "현재 위치",
      city: location.city || location.region || "접속 지역",
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

export async function getCatalogOperationsOverview(forwardedIp?: string | null) {
  const now = new Date();
  const [weather, currentWeather, holiday, monthlyStats] = await Promise.all([
    getWeather(),
    getLocationWeather(forwardedIp),
    getHolidayStatus(now),
    getMonthlyCatalogStats()
  ]);
  return {
    generatedAt: now.toISOString(),
    timeZone: "Asia/Seoul",
    weather,
    currentWeather,
    operation: holiday,
    monthlyStats
  };
}
