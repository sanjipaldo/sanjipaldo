import ExcelJS from "exceljs";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../_core/db";
import { categories, products } from "../db/schema";
import { GENERAL_PRICE_LABEL, STUDENT_PRICE_LABEL, optionLabelsFor } from "@repo/shared/product-groups";
import { SUPPLY_STATUS_LABELS, seasonApplies, supplyStatus, type SupplyStatus } from "@repo/shared/supply-status";
import { getPublicProductOptions, seoulDay } from "./product-groups";
import { publicShippingPolicyRows } from "./catalog";
import { RATE_TYPE_LABELS, rateSummaryLabel, type ShippingRateTiers, type ShippingRateType } from "./shipping-rates";

// "이 상품 엑셀 다운로드"(공개 옵션 팝업): 상품(옵션 묶음) 하나의 옵션별 공급가 표.
// 칸: 옵션 | 일반공급가(원) | 수강생 단가(원) | 판매상태 | 공급가 적용일 | 배송, 아래에 상품안내·배송 안내·자료 링크.
// 원가·매입처는 넣지 않습니다. 시간은 한국 시간입니다.

const COLUMN_COUNT = 6;
const BRAND = "(주)두고홀딩스 · DOOGO FOOD · 공식 상품안내";
const COLORS = {
  title: "FF9FE870",
  ink: "FF0E0F0C",
  deep: "FF163300",
  line: "FFD8DCD5",
  soft: "FFF2F4F1",
  general: "FFF3F1EA",
  student: "FFE2F6D5",
  footer: "FFF7F8F5"
};
const STATUS_STYLE: Record<SupplyStatus, { color: string; fill: string }> = {
  on_sale: { color: "FF054D28", fill: "FFE2F6D5" },
  sold_out: { color: "FFC0262D", fill: "FFFDECEC" },
  season_ended: { color: "FF8A5A00", fill: "FFFFF4CC" }
};

type PolicyRow = Awaited<ReturnType<typeof publicShippingPolicyRows>>[number];

const won = (value: number) => `${value.toLocaleString("ko-KR")}원`;

function effectivePolicyRate(policy: PolicyRow): { rateType: ShippingRateType; fee: number; tiers: ShippingRateTiers | null; unitLabel: string | null } {
  if (policy.rateType) return { rateType: policy.rateType as ShippingRateType, fee: policy.fee, tiers: policy.rateTiers, unitLabel: policy.unitLabel };
  if (policy.feeType === "free") return { rateType: "free", fee: 0, tiers: null, unitLabel: null };
  if (policy.feeType === "conditional" && policy.freeShippingThreshold) {
    return { rateType: "amount", fee: policy.fee, tiers: { tiers: [{ upTo: policy.freeShippingThreshold, fee: policy.fee }], last: { fee: 0, repeat: false } }, unitLabel: null };
  }
  return { rateType: "fixed", fee: policy.fee, tiers: null, unitLabel: null };
}

// 배송 칸 한 줄: "고정 3,500원 · 제주 +3,000원 · 도서산간 +5,000원"
export function shippingText(policy: PolicyRow | undefined, fallback: string | null) {
  if (!policy) return fallback?.trim() || "배송비 문의";
  const rate = effectivePolicyRate(policy);
  const parts = [rate.rateType === "free" ? "무료배송" : rateSummaryLabel(rate.rateType, rate.fee, rate.tiers, rate.unitLabel) || RATE_TYPE_LABELS[rate.rateType]];
  if (policy.jejuExtraFee > 0) parts.push(`제주 +${won(policy.jejuExtraFee)}`);
  if (policy.islandExtraFee > 0) parts.push(`도서산간 +${won(policy.islandExtraFee)}`);
  return parts.join(" · ");
}

function seoulClock(now: number) {
  const date = new Date(now + 9 * 60 * 60 * 1000).toISOString();
  return `${date.slice(0, 10)} ${date.slice(11, 16)}`;
}

function seoulMonth(now: number) {
  return Number(seoulDay(now).slice(5, 7));
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "상품";
}

export async function buildProductOptionsWorkbook(productId: string, siteOrigin: string, now = Date.now()) {
  const detail = await getPublicProductOptions(productId, now);
  if (!detail) return null;
  const db = getDb();
  const [productRows, policyRows] = await Promise.all([
    db.select({
      id: products.id,
      name: products.name,
      origin: products.origin,
      categoryId: products.categoryId,
      shippingPolicyId: products.shippingPolicyId,
      shippingFee: products.shippingFee,
      courier: products.courier,
      releaseInfo: products.releaseInfo,
      notes: products.notes,
      packaging: products.packaging,
      isSoldOut: products.isSoldOut,
      isSeasonEnded: products.isSeasonEnded,
      isAlwaysOnSale: products.isAlwaysOnSale,
      saleStartMonth: products.saleStartMonth,
      saleEndMonth: products.saleEndMonth
    }).from(products).where(and(inArray(products.id, detail.productIds), eq(products.isVisible, true), isNull(products.deletedAt))),
    publicShippingPolicyRows()
  ]);
  const byId = new Map(productRows.map((row) => [row.id, row]));
  const options = detail.productIds.map((id) => byId.get(id)).filter((row): row is (typeof productRows)[number] => Boolean(row));
  const categoryIds = [...new Set(options.map((row) => row.categoryId))];
  const categoryRows = categoryIds.length > 0 ? await db.select({ id: categories.id, name: categories.name }).from(categories).where(inArray(categories.id, categoryIds)) : [];
  const categoryName = new Map(categoryRows.map((row) => [row.id, row.name]));
  const policyById = new Map(policyRows.map((row) => [row.id, row]));
  const labels = optionLabelsFor(options.map((row) => row.name), options.map((row) => detail.optionLabels[row.id]));
  const first = options.find((row) => row.id === productId) ?? options[0];
  const title = detail.group?.name ?? first.name;
  const month = seoulMonth(now);
  const firstPolicy = first.shippingPolicyId ? policyById.get(first.shippingPolicyId) : undefined;
  const origins = [...new Set(options.map((row) => row.origin?.trim()).filter(Boolean))];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DOOGO FOOD";
  const sheet = workbook.addWorksheet("상품별 공급가", {
    views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
  });
  sheet.columns = [{ width: 46 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 18 }, { width: 32 }];
  const font = { name: "맑은 고딕", size: 10, color: { argb: COLORS.ink } };
  const thin = { style: "thin" as const, color: { argb: COLORS.line } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const mergedRow = (values: string, height: number, style: Partial<ExcelJS.Style> = {}) => {
    const row = sheet.addRow([values]);
    sheet.mergeCells(row.number, 1, row.number, COLUMN_COUNT);
    row.height = height;
    const cell = row.getCell(1);
    cell.font = { ...font, ...(style.font ?? {}) };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1, ...(style.alignment ?? {}) };
    if (style.fill) cell.fill = style.fill;
    return row;
  };

  mergedRow(BRAND, 34, { font: { ...font, size: 16, bold: true, color: { argb: COLORS.ink } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.title } } });
  mergedRow(title, 30, { font: { ...font, size: 12, bold: true, color: { argb: COLORS.deep } } });
  mergedRow(`상품 정보 확인: ${siteOrigin}/?q=${encodeURIComponent(title)} / 다운로드: ${seoulClock(now)} (한국 시간)`, 30, { font: { ...font, color: { argb: "FF454745" } } });
  mergedRow(`원산지: ${origins.join(", ") || "상품별 확인"} / 배송: ${shippingText(firstPolicy, first.shippingFee)}`, 30, { font: { ...font, color: { argb: "FF454745" } } });

  const header = sheet.addRow(["옵션", `${GENERAL_PRICE_LABEL}(원)`, `${STUDENT_PRICE_LABEL}(원)`, "판매상태", "공급가 적용일", "배송"]);
  header.height = 28;
  header.eachCell((cell, column) => {
    cell.font = { ...font, size: 11, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = border;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: column === 2 ? COLORS.general : column === 3 ? COLORS.student : COLORS.soft } };
  });

  options.forEach((option, index) => {
    const trend = detail.trends[option.id];
    const status = supplyStatus(option, seasonApplies(option, categoryName.get(option.categoryId)), month);
    const policy = option.shippingPolicyId ? policyById.get(option.shippingPolicyId) : undefined;
    const row = sheet.addRow([labels[index], trend.current.general, trend.current.student, SUPPLY_STATUS_LABELS[status], trend.current.since, shippingText(policy, option.shippingFee)]);
    row.height = 36;
    row.eachCell((cell, column) => {
      cell.border = border;
      cell.font = { ...font };
      cell.alignment = { vertical: "middle", horizontal: column === 1 || column === 6 ? "left" : "center", wrapText: column === 1 || column === 6, indent: column === 1 ? 1 : 0 };
      if (column === 2 || column === 3) {
        cell.numFmt = "#,##0";
        cell.font = { ...font, size: 11, bold: true, color: { argb: column === 3 ? COLORS.deep : COLORS.ink } };
        cell.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: column === 2 ? COLORS.general : COLORS.student } };
      }
      if (column === 4) {
        cell.font = { ...font, bold: true, color: { argb: STATUS_STYLE[status].color } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STATUS_STYLE[status].fill } };
      }
    });
  });
  const lastOptionRow = sheet.rowCount;
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: lastOptionRow, column: COLUMN_COUNT } };

  sheet.addRow([]);
  const notes = detail.group?.description?.trim()
    || [first.notes?.trim(), first.packaging?.trim() ? `포장: ${first.packaging.trim()}` : ""].filter(Boolean).join("\n")
    || "등록된 상품 설명이 없습니다.";
  const shippingNotes = [
    detail.group?.shippingNote?.trim(),
    shippingText(firstPolicy, first.shippingFee),
    first.courier?.trim() || firstPolicy?.courier?.trim() ? `택배사: ${first.courier?.trim() || firstPolicy?.courier?.trim()}` : "",
    first.releaseInfo?.trim() ? `출고: ${first.releaseInfo.trim()}` : "",
    firstPolicy?.description?.trim()
  ].filter(Boolean).join("\n");
  const footerStyle = { fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: COLORS.footer } } };
  mergedRow("DOOGO FOOD · 상품안내 및 참고사항", 28, { ...footerStyle, font: { ...font, size: 11, bold: true, color: { argb: COLORS.deep } } });
  const lineHeight = (text: string) => Math.min(300, Math.max(30, 16 * (text.split("\n").reduce((total, line) => total + Math.max(1, Math.ceil(line.length / 70)), 0) + 1)));
  mergedRow(`상품 설명: ${notes}`, lineHeight(notes), { ...footerStyle, alignment: { vertical: "top", wrapText: true, indent: 1 } });
  mergedRow(`배송 안내: ${shippingNotes}`, lineHeight(shippingNotes), { ...footerStyle, alignment: { vertical: "top", wrapText: true, indent: 1 } });
  mergedRow(`상세페이지·사진 자료: ${detail.group?.materialsUrl || "준비 중"}`, 30, footerStyle);

  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  return { bytes, filename: `두고푸드_${safeFileName(title)}_공급가_${seoulDay(now)}.xlsx` };
}
