// 마진계산기 팝업 열기 신호(단가표 줄의 "계산" 버튼 · 오른쪽 아래 "마진계산기" 버튼 → PageFrame이 팝업을 엶).
// 단가표 첫 화면 용량을 늘리지 않도록 계산 로직(lib/margin-calculator.ts)과 나눠 둔 작은 파일입니다.
export type MarginPrefill = {
  productId: string;
  name: string;
  /** 화면에 보이는 A단가(A단가가 없으면 일반공급가) */
  aPrice: number;
  generalPrice: number;
  /** 지정 판매가(자율이면 null) */
  salePrice: number | null;
  /** 대표 배송비(배송 정책이 없으면 null) */
  shippingOut: number | null;
};

export const MARGIN_OPEN_EVENT = "doogo:margin-open";

export function openMarginCalculator(prefill?: MarginPrefill | null) {
  window.dispatchEvent(new CustomEvent<MarginPrefill | null>(MARGIN_OPEN_EVENT, { detail: prefill ?? null }));
}
