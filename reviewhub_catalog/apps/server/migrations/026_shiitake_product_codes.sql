-- 026: (관리자 요청·허락, 1회성 데이터 수정) 엑셀 대량 업로드로 등록된 표고버섯 4개 상품을 바로잡습니다.
--  1) 진열순서: 엑셀 순서(가정용 1kg → 가정용 2kg → 실속 1kg → 실속 2kg)대로 다시 놓습니다.
--     네 상품이 지금 쓰고 있는 순서 자리(가장 앞~가장 뒤) 안에서만 바꾸므로 다른 상품 순서는 그대로입니다.
--  2) 상품코드: 자동 생성 코드(DG-…)를 발주오라·단가관리 코드(ass00057~ass00060)로 바꿉니다.
-- 상품명과 기존 코드가 모두 맞는 상품만 바꾸며, 새 코드가 이미 다른 상품에 있으면 그 상품은 건너뜁니다(코드 중복 방지).

UPDATE products
SET displayOrder =
  (SELECT MIN(displayOrder) FROM products WHERE productCode IN ('DG-199EC9CC', 'DG-7AAD64BD', 'DG-CC92475A', 'DG-A4DE2237') AND deletedAt IS NULL)
  + (CASE productCode WHEN 'DG-199EC9CC' THEN 0 WHEN 'DG-7AAD64BD' THEN 1 WHEN 'DG-CC92475A' THEN 2 ELSE 3 END)
  * MAX(1, ((SELECT MAX(displayOrder) FROM products WHERE productCode IN ('DG-199EC9CC', 'DG-7AAD64BD', 'DG-CC92475A', 'DG-A4DE2237') AND deletedAt IS NULL)
          - (SELECT MIN(displayOrder) FROM products WHERE productCode IN ('DG-199EC9CC', 'DG-7AAD64BD', 'DG-CC92475A', 'DG-A4DE2237') AND deletedAt IS NULL)) / 3)
WHERE deletedAt IS NULL
  AND ((productCode = 'DG-199EC9CC' AND name = '표고버섯 가정용 1kg')
    OR (productCode = 'DG-7AAD64BD' AND name = '표고버섯 가정용 2kg')
    OR (productCode = 'DG-CC92475A' AND name = '표고버섯 실속 1kg')
    OR (productCode = 'DG-A4DE2237' AND name = '표고버섯 실속 2kg'));

UPDATE products
SET productCode = CASE productCode
    WHEN 'DG-199EC9CC' THEN 'ass00057'
    WHEN 'DG-7AAD64BD' THEN 'ass00058'
    WHEN 'DG-CC92475A' THEN 'ass00059'
    WHEN 'DG-A4DE2237' THEN 'ass00060'
  END,
  updatedAt = CURRENT_TIMESTAMP
WHERE ((productCode = 'DG-199EC9CC' AND name = '표고버섯 가정용 1kg')
    OR (productCode = 'DG-7AAD64BD' AND name = '표고버섯 가정용 2kg')
    OR (productCode = 'DG-CC92475A' AND name = '표고버섯 실속 1kg')
    OR (productCode = 'DG-A4DE2237' AND name = '표고버섯 실속 2kg'))
  AND NOT EXISTS (
    SELECT 1 FROM products other
    WHERE other.productCode = CASE products.productCode
      WHEN 'DG-199EC9CC' THEN 'ass00057'
      WHEN 'DG-7AAD64BD' THEN 'ass00058'
      WHEN 'DG-CC92475A' THEN 'ass00059'
      WHEN 'DG-A4DE2237' THEN 'ass00060'
    END
  );
