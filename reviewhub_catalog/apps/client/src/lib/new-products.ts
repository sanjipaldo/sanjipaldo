// 신규상품: 등록일(createdAt, 한국 날짜) 기준 최근 N일(기본 7일, 오늘 포함)에 등록된 상품.
// 관리자 > 신규상품 관리에서 기간과 "신규상품에서 제외" 상품을 정하고 content_settings의 `new_products`(JSON)에 저장합니다.

export const NEW_PRODUCT_DEFAULT_DAYS = 7;
export const NEW_PRODUCT_MAX_DAYS = 30;
export const NEW_PRODUCT_SETTING_KEY = "new_products";

export type NewProductSettings = { days: number; hidden: string[] };

export function parseNewProductSettings(raw: string | null | undefined): NewProductSettings {
  try {
    const parsed = raw ? JSON.parse(raw) as Partial<NewProductSettings> : {};
    const days = Number(parsed.days);
    return {
      days: Number.isInteger(days) && days >= 1 && days <= NEW_PRODUCT_MAX_DAYS ? days : NEW_PRODUCT_DEFAULT_DAYS,
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((id): id is string => typeof id === "string") : []
    };
  } catch {
    return { days: NEW_PRODUCT_DEFAULT_DAYS, hidden: [] };
  }
}

export function seoulDayKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

// createdAt은 ISO("…Z")와 "YYYY-MM-DD HH:MM:SS"(UTC) 두 형식이 섞여 있습니다.
export function createdDayKey(value: string | null | undefined) {
  if (!value) return "";
  const normalized = value.length === 10 ? `${value}T00:00:00+09:00` : value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? "" : seoulDayKey(date);
}

// 오늘부터 거꾸로 days일: ["2026-10-25", "2026-10-24", …]
export function newProductDayKeys(todayKey: string, days: number) {
  const noon = new Date(`${todayKey}T12:00:00+09:00`).getTime();
  return Array.from({ length: days }, (_, index) => seoulDayKey(new Date(noon - index * 24 * 60 * 60 * 1000)));
}

export function shortDayLabel(dayKey: string) {
  const date = new Date(`${dayKey}T12:00:00+09:00`);
  const weekday = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", weekday: "short" }).format(date);
  return `${Number(dayKey.slice(5, 7))}.${Number(dayKey.slice(8, 10))}(${weekday})`;
}

export function relativeDayName(index: number) {
  return index === 0 ? "오늘" : index === 1 ? "어제" : `${index}일 전`;
}

// 신규상품으로 보일 상품: 기간 안에 등록됐고 관리자가 제외하지 않은 상품(공개 단가표에서 숨김인 상품은 원래 목록에 없습니다).
export function selectNewProducts<T extends { id: string; createdAt: string }>(products: T[], settings: NewProductSettings, todayKey: string) {
  const days = new Set(newProductDayKeys(todayKey, settings.days));
  const hidden = new Set(settings.hidden);
  return products
    .filter((product) => !hidden.has(product.id) && days.has(createdDayKey(product.createdAt)))
    .sort((first, second) => createdTime(second.createdAt) - createdTime(first.createdAt));
}

function createdTime(value: string) {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const time = new Date(normalized).getTime();
  return Number.isNaN(time) ? 0 : time;
}
