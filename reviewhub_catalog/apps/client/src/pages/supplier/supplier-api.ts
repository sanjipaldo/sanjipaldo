// 공급사 센터 화면 공용: 서버 응답 모양 · API 호출 도우미 · 숫자/날짜 표시
import { apiFetch } from "@/lib/api";
import { supplyStatus, type SupplyStatus } from "@/lib/supply-status";
import {
  weekdayOf,
  type SupplierChangeField,
  type SupplierProductChanges,
  type SupplierRequestKind,
  type SupplierRequestStatus,
  type SupplierSettlementCycle
} from "@repo/shared/supplier-portal";

export type SupplierProfile = {
  supplier: {
    id: string;
    name: string;
    representative: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    businessNumber: string | null;
  };
  account: {
    id: string;
    username: string;
    isActive: boolean;
    commissionRate: number;
    settlementCycle: SupplierSettlementCycle;
    lastLoginAt: string | null;
    createdAt: string;
  };
};

export type SupplierProduct = {
  id: string;
  productCode: string | null;
  name: string;
  imageUrl: string | null;
  origin: string | null;
  costPrice: number;
  salePrice: number | null;
  salePriceMode: "autonomous" | "fixed";
  saleStartMonth: number | null;
  saleEndMonth: number | null;
  isAlwaysOnSale: boolean;
  shippingType: "domestic" | "overseas";
  categoryId: string;
  categoryName: string | null;
  isVisible: boolean;
  isSoldOut: boolean;
  isSeasonEnded: boolean;
  createdAt: string;
  updatedAt: string;
  pendingRequestId: string | null;
};

export type SupplierCategory = { id: string; name: string; shippingType: "domestic" | "overseas"; sortOrder: number };

export type SupplierRequestItem = {
  id: string;
  supplierId: string;
  supplierName: string;
  productId: string | null;
  productName: string;
  kind: SupplierRequestKind;
  status: SupplierRequestStatus;
  changes: SupplierProductChanges;
  snapshot: Partial<Record<SupplierChangeField, unknown>> | null;
  note: string | null;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SalesTotals = {
  saleAmount: number;
  saleQuantity: number;
  returnAmount: number;
  returnQuantity: number;
  orderCount: number;
  netAmount: number;
  commission: number;
  payoutAmount: number;
  netIncome: number;
};

export type SalesDay = {
  date: string;
  saleAmount: number;
  saleQuantity: number;
  returnAmount: number;
  returnQuantity: number;
  orderCount: number;
  netAmount: number;
};

export type SalesRankItem = {
  productId: string | null;
  productCode: string | null;
  productName: string;
  quantity: number;
  amount: number;
  returnQuantity: number;
  returnAmount: number;
  netAmount: number;
  netQuantity: number;
};

export type SettlementSummary = {
  cycle: SupplierSettlementCycle;
  start: string;
  end: string;
  payoutStart: string;
  payoutEnd: string;
  netAmount: number;
  commission: number;
  payoutAmount: number;
  netIncome: number;
};

export type SalesMonth = {
  month: string;
  today: string;
  cycle: SupplierSettlementCycle;
  commissionRate: number;
  hasAnySales: boolean;
  totals: SalesTotals;
  days: SalesDay[];
  ranking: SalesRankItem[];
  settlements: SettlementSummary[];
  payoutDays: Array<{ date: string; endDate: string; periodStart: string; periodEnd: string; amount: number; done: boolean }>;
};

export type SupplierDashboard = SupplierProfile & {
  today: string;
  month: string;
  sales: { totals: SalesTotals; ranking: SalesRankItem[]; hasAnySales: boolean; days: SalesDay[] };
  upcomingSettlement: SettlementSummary;
  products: { total: number; soldOut: number; hidden: number };
  requests: { pending: number; recent: SupplierRequestItem[] };
};

export class SupplierApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function supplierRead<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({ ok: false }))) as { ok?: boolean; data?: T; error?: { message?: string } };
  if (!response.ok || !payload.ok) throw new SupplierApiError(payload.error?.message || "요청을 처리하지 못했어요.", response.status);
  return payload.data as T;
}

export async function supplierGet<T>(path: string) {
  return supplierRead<T>(await apiFetch(`/supplier${path}`, { silent: true }));
}

export async function supplierPost<T>(path: string, body: unknown) {
  return supplierRead<T>(await apiFetch(`/supplier${path}`, {
    method: "POST",
    silent: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }));
}

export async function uploadSupplierImage(file: File) {
  const form = new FormData();
  form.append("file", file);
  const data = await supplierRead<{ file: { downloadUrl: string } }>(await apiFetch("/supplier/products/image-upload", { method: "POST", body: form, silent: true }));
  return data.file.downloadUrl;
}

export function won(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `${value.toLocaleString("ko-KR")}원`;
}

export function count(value: number, unit = "개") {
  return `${value.toLocaleString("ko-KR")}${unit}`;
}

// "2026-11-20T01:02:03Z" · "2026-11-20 01:02:03" → "11.20(금) 10:02"
export function shortDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("month")}.${part("day")}(${part("weekday")}) ${part("hour")}:${part("minute")}`;
}

export function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year}년 ${monthNumber}월`;
}

export function seasonText(product: Pick<SupplierProduct, "isAlwaysOnSale" | "saleStartMonth" | "saleEndMonth">) {
  if (product.isAlwaysOnSale) return "상시 판매";
  if (product.saleStartMonth && product.saleEndMonth) return `${product.saleStartMonth}~${product.saleEndMonth}월`;
  return "기간 미설정";
}

// 판매 상태: 공개 단가표·관리자 상품 리스트와 같은 기준(lib/supply-status.ts).
// 제철 카테고리 이름은 관리자 화면과 같은 목록입니다(이모지 앞머리는 떼고 비교).
const SEASONAL_CATEGORY_NAMES = new Set(["농산", "수산", "축산", "선물세트", "식품"]);

function plainCategoryName(name: string) {
  return name.replace(/^[^\p{L}\p{N}[]+\s*/u, "").trim();
}

export function seoulMonthNumber() {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", month: "numeric" }).format(new Date()));
}

export function productStatus(product: SupplierProduct, month = seoulMonthNumber()): SupplyStatus {
  const seasonalCategory = product.categoryName ? SEASONAL_CATEGORY_NAMES.has(plainCategoryName(product.categoryName)) : false;
  const seasonal = seasonalCategory || Boolean(!product.isAlwaysOnSale && product.saleStartMonth && product.saleEndMonth);
  return supplyStatus(product, seasonal, month);
}

// 달력 칸처럼 좁은 곳에 쓰는 짧은 금액: 280000 → "28만", 1250000 → "125만", 9000 → "9,000"
export function compactWon(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(abs >= 1_000_000_000 ? 0 : 1).replace(/\.0$/, "")}억`;
  if (abs >= 10_000) return `${sign}${(abs / 10_000).toFixed(abs >= 1_000_000 ? 0 : 1).replace(/\.0$/, "")}만`;
  return `${sign}${abs.toLocaleString("ko-KR")}`;
}

const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

// "2026-11-20" → "11월 20일(금)"
export function dayLabel(date: string) {
  const [, month, day] = date.split("-").map(Number);
  return `${month}월 ${day}일(${WEEKDAY_NAMES[weekdayOf(date)]})`;
}

// 금액 입력칸: 숫자만 남기고 1억 원까지만 받습니다(서버 한도와 같음).
export const MAX_PRICE = 100_000_000;

export function digitsOnly(value: string) {
  const digits = value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "").slice(0, 9);
  return digits !== "" && Number(digits) > MAX_PRICE ? String(MAX_PRICE) : digits;
}

export function parseDigits(value: string): number | null {
  return value === "" ? null : Number(value);
}
