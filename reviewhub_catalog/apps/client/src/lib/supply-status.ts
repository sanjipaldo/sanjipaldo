// 상품 판매 상태(공개 단가표와 관리자 상품 리스트가 같이 씁니다).
// - 품절: 상품 품절(또는 옵션 전부 품절)
// - 시즌 종료: 관리자가 직접 지정한 시즌종료(isSeasonEnded), 또는 제철 상품인데 이번 달이 판매기간 밖(판매기간 미설정 포함)
// - 판매중: 그 밖
// 품절·시즌 종료는 공개 화면과 관리자 화면 모두 빨간 행으로 보여 줍니다.

export type SupplyStatus = "on_sale" | "sold_out" | "season_ended";

export const SUPPLY_STATUS_LABELS: Record<SupplyStatus, string> = {
  on_sale: "판매중",
  sold_out: "품절",
  season_ended: "시즌 종료"
};

type StatusProduct = {
  isSoldOut: boolean;
  isSeasonEnded?: boolean;
  isAlwaysOnSale?: boolean;
  saleStartMonth: number | null;
  saleEndMonth: number | null;
  options?: Array<{ isSoldOut: boolean }>;
};

export function isMonthInSeason(month: number, startMonth: number | null, endMonth: number | null) {
  if (!startMonth || !endMonth) return true;
  if (startMonth <= endMonth) return month >= startMonth && month <= endMonth;
  return month >= startMonth || month <= endMonth;
}

// seasonal: 제철 판매기간을 따지는 상품인지(제철 카테고리이거나 판매기간을 지정한 상품)
export function supplyStatus(product: StatusProduct, seasonal: boolean, currentMonth: number): SupplyStatus {
  const options = product.options ?? [];
  if (product.isSoldOut || (options.length > 0 && options.every((option) => option.isSoldOut))) return "sold_out";
  if (product.isSeasonEnded) return "season_ended";
  if (!seasonal || product.isAlwaysOnSale || !currentMonth) return "on_sale";
  const configured = Boolean(product.saleStartMonth && product.saleEndMonth);
  return configured && isMonthInSeason(currentMonth, product.saleStartMonth, product.saleEndMonth) ? "on_sale" : "season_ended";
}
