-- 029: 관리자 요청(2026-11-03, "실제 운영 중이니 테스트 데이터 삭제")으로 초기 예시(시드) 데이터를 정리합니다.
-- - 처음 설치할 때 008·009·004/005(019에서 옵션 분리) 마이그레이션이 넣은 예시 데이터만 대상입니다.
-- - 예시 값이 그대로 남아 있는 행만 지우며, 관리자가 실제로 등록·수정한 데이터는 건드리지 않습니다.
-- - 여러 번 실행돼도 같은 결과입니다.

-- 1) 예시 소싱 요청(SR-0001 "제주 감귤 선물세트 5kg", 예시 셀러, 010-0000-0000)
DELETE FROM sourcing_requests
WHERE id = 'seed-sourcing-example'
  AND requesterName = '예시 셀러'
  AND contact = '010-0000-0000';

-- 2) 예시 가격변동 이력 10건(sample-price-20260914-01~10)
DELETE FROM price_histories
WHERE id LIKE 'sample-price-20260914-%';

-- 3) 예시 상품(머스크메론·떡 선물세트·송편·골드망고·나주 배·샤인머스캣·하미과 메론·캐네디언 헬스케어)과
--    019에서 옵션을 나눠 만든 상품: 관리자 화면의 "삭제"와 같은 방식(숨김 + 삭제 표시)으로 정리합니다.
--    예시 이미지(/assets/products/…)를 그대로 쓰는 행만 대상입니다(실제 이미지로 바꿔 쓰는 상품은 유지).
UPDATE products
SET isVisible = 0,
    deletedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE deletedAt IS NULL
  AND imageUrl LIKE '/assets/products/%'
  AND id IN (
    'muskmelon-gift', 'premium-rice-cake', 'ramie-songpyeon', 'gold-mango',
    'naju-pear', 'shine-muscat', 'hami-melon', 'global-supplement',
    'opt-option-muskmelon-2', 'opt-option-muskmelon-3',
    'opt-option-mango-3', 'opt-option-mango-5', 'opt-option-mango-10',
    'opt-option-shine-2', 'opt-option-shine-4',
    'opt-option-hami-2', 'opt-option-hami-4',
    'opt-option-health-1', 'opt-option-health-2'
  );
