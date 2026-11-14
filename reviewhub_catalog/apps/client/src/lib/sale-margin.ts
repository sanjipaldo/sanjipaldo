// 단가표 "마진율"(2026-11-14, 관리자 요청): A단가로 받아 지정 판매가에 팔 때 남는 비율.
// 마진율 = (판매가 − A단가) ÷ 판매가 × 100, 소수점 한 자리(예: 44.9%). 배송비는 넣지 않습니다.
// 판매가가 자율이거나 미설정이면 계산하지 않습니다(null).
export function saleMargin(aPrice: number | null | undefined, salePrice: number | null | undefined) {
  if (typeof aPrice !== "number" || !Number.isFinite(aPrice) || aPrice <= 0) return null;
  if (typeof salePrice !== "number" || !Number.isFinite(salePrice) || salePrice <= 0) return null;
  const rounded = Math.round(((salePrice - aPrice) / salePrice) * 1000) / 10;
  return { rate: Object.is(rounded, -0) ? 0 : rounded, amount: salePrice - aPrice };
}

export const formatMarginRate = (rate: number) => `${rate.toFixed(1)}%`;
