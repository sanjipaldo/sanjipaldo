// 상품 수정 창(관리자)에서 DB센터 가격 옆에 보여 줄 발주오라 가격(2026-11-23 관리자 요청).
// 값은 마지막 "발주오라와 비교"·동기화 때 읽은 것입니다(GET /api/baljuora/admin/products/:id).
// 같음/다름 판단은 동기화 화면의 변경 목록(packages/shared/src/baljuora-sync.ts diffBaljuoraProduct)과 같게 맞춥니다.

export type BaljuoraProductPrices = {
  linked: boolean;
  baljuoraId: string | null;
  code: string | null;
  groupKeyword: string;
  syncedAt: string | null;
  lastPushedAt: string | null;
  syncStatus: string | null;
  supplyPrice: number | null;
  groupPrice: number | null;
  groupPriceKnown: boolean;
  purchaseCost: number | null;
  consumerPrice: number | null;
};

export type EditorPriceKey = "costPrice" | "aPrice" | "generalPrice";

// same: 같음 · diff: 다름(동기화 화면 '보낼 변경'에 올라옴) · unknown: 아직 못 읽음 · none: 비교하지 않음(DB센터 값이 비어 있음 등)
export type BaljuoraPriceCell = { caption: string; value: number | null; note: string | null; status: "same" | "diff" | "unknown" | "none" };

type Draft = { costPrice: number; aPrice: number; generalPrice: number };

function won(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

export function baljuoraPriceCell(key: EditorPriceKey, draft: Draft, prices: BaljuoraProductPrices): BaljuoraPriceCell {
  if (key === "costPrice") {
    const value = prices.purchaseCost;
    // DB센터 원가가 비어 있으면 보내지 않으므로 비교하지 않습니다.
    if (!(draft.costPrice > 0)) return { caption: "매입원가", value, note: value === null ? "매입원가 없음" : null, status: "none" };
    return { caption: "매입원가", value, note: value === null ? "매입원가 없음" : null, status: value === draft.costPrice ? "same" : "diff" };
  }
  if (key === "generalPrice") {
    const value = prices.supplyPrice;
    if (value === null || !(draft.generalPrice > 0)) return { caption: "공급가", value, note: value === null ? "공급가 없음" : null, status: "none" };
    return { caption: "공급가", value, note: null, status: value === draft.generalPrice ? "same" : "diff" };
  }
  const caption = `${prices.groupKeyword} 수강생`;
  if (!prices.groupPriceKnown) return { caption, value: null, note: "다음 ‘발주오라와 비교’ 때 읽어 와요", status: "unknown" };
  // DB센터 수강생 단가가 비어 있으면 일반공급가로 삽니다(발주오라에 개별공급가가 없으면 공급가로 사는 것과 같음).
  const student = draft.aPrice > 0 ? draft.aPrice : draft.generalPrice;
  if (prices.groupPrice === null) {
    const ownStudentPrice = draft.aPrice > 0 && draft.aPrice !== draft.generalPrice;
    const fallback = prices.supplyPrice;
    const note = `개별공급가 없음 · 공급가${fallback !== null ? ` ${won(fallback)}` : ""} 적용`;
    return { caption, value: null, note, status: ownStudentPrice && student !== fallback ? "diff" : "same" };
  }
  return { caption, value: prices.groupPrice, note: null, status: student === prices.groupPrice ? "same" : "diff" };
}

export function baljuoraPriceCells(draft: Draft, prices: BaljuoraProductPrices): Record<EditorPriceKey, BaljuoraPriceCell> {
  return {
    costPrice: baljuoraPriceCell("costPrice", draft, prices),
    aPrice: baljuoraPriceCell("aPrice", draft, prices),
    generalPrice: baljuoraPriceCell("generalPrice", draft, prices)
  };
}
