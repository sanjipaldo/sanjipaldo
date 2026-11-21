-- 033_product_group_options.sql — 단일 상품을 옵션처럼 묶어 보여 주는 "옵션 묶음"(2026-11-21, 관리자 요청)
-- 구조 변경만 합니다: 예전 묶음 표(015에서 만들고 017에서 비운 product_groups / product_group_items)에 칸을 더하고,
-- 상품별 가격 흐름 조회용 색인을 추가합니다. 기존 표의 데이터와 상품·가격 데이터는 바꾸지 않습니다.
--
-- product_groups.shippingNote: 팝업 "배송 안내"에 덧붙이는 문구(예: 제주·도서산간 배송 불가)
-- product_groups.materialsUrl: 팝업 "상세페이지·사진 자료" 링크
-- product_group_items.optionLabel: 팝업 옵션표에 보일 옵션 이름(비우면 상품명에서 겹치는 앞뒤 글자를 빼고 자동으로 만듭니다)

ALTER TABLE product_groups ADD COLUMN shippingNote TEXT;
ALTER TABLE product_groups ADD COLUMN materialsUrl TEXT;
ALTER TABLE product_group_items ADD COLUMN optionLabel TEXT;
CREATE INDEX IF NOT EXISTS idx_price_histories_product ON price_histories (productId, changedAt);
