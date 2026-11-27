// 상품 리스트 '발주오라 번호'(2026-11-27 관리자 요청 "줄 앞 숫자를 발주오라처럼 · 전체 상품에서 맨 위 2998, 맨 아래 1"):
// 발주오라 상품 리스트는 등록일시 최신순이고 줄 앞 숫자 = 지금 목록(검색·거르기 뒤)의 상품 수 − 순서입니다.
// 서버(GET /api/baljuora/admin/product-order)가 DB센터 상품 id를 발주오라 순서로 주면, 화면이 지금 목록 안에서 같은 식으로 번호를 붙입니다.

/** 지금 목록을 발주오라 순서(최근 등록이 위)로. 서버 순서에 없는 상품(방금 등록)은 맨 위, 그 사이 순서는 그대로. */
export function sortByBaljuoraOrder<T extends { id: string }>(items: T[], order: Map<string, number>): T[] {
  const rank = (item: T) => order.get(item.id) ?? -1;
  return [...items].sort((first, second) => rank(first) - rank(second));
}

/** 발주오라 순서로 줄 세운 목록 → 상품마다 번호(맨 위 = 목록 상품 수, 맨 아래 = 1) */
export function baljuoraNumbers<T extends { id: string }>(sorted: T[]): Map<string, number> {
  return new Map(sorted.map((item, position) => [item.id, sorted.length - position]));
}
