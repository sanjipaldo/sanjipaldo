-- 023: 카테고리가 지정되지 않은 상품을 배송유형별 '미분류' 카테고리로 모읍니다.
-- - 국내·해외 '미분류' 카테고리가 없으면 만듭니다(이미 있으면 그대로 사용).
-- - 대상: 카테고리가 비어 있거나, 없어졌거나, 사용 중지된 카테고리에 있는 상품,
--         그리고 배송유형이 다른 '미분류'에 들어가 있는 상품(예: 해외배송 상품이 국내 미분류에 있는 경우).
-- - 이미 정상 카테고리에 있는 상품은 바꾸지 않습니다. 여러 번 실행돼도 같은 결과입니다.

INSERT INTO categories (id, name, shippingType, sortOrder, isActive, createdAt, updatedAt)
SELECT 'cat-domestic-uncategorized', '미분류', 'domestic', 9999, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = '미분류' AND shippingType = 'domestic' AND isActive = 1)
  AND NOT EXISTS (SELECT 1 FROM categories WHERE id = 'cat-domestic-uncategorized');

INSERT INTO categories (id, name, shippingType, sortOrder, isActive, createdAt, updatedAt)
SELECT 'cat-overseas-uncategorized', '미분류', 'overseas', 9999, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = '미분류' AND shippingType = 'overseas' AND isActive = 1)
  AND NOT EXISTS (SELECT 1 FROM categories WHERE id = 'cat-overseas-uncategorized');

UPDATE categories SET isActive = 1, updatedAt = CURRENT_TIMESTAMP
WHERE id IN ('cat-domestic-uncategorized', 'cat-overseas-uncategorized') AND isActive = 0;

UPDATE products
SET categoryId = (
      SELECT c.id FROM categories c
      WHERE c.name = '미분류' AND c.shippingType = products.shippingType AND c.isActive = 1
      ORDER BY c.sortOrder DESC, c.createdAt ASC
      LIMIT 1
    ),
    updatedAt = CURRENT_TIMESTAMP
WHERE deletedAt IS NULL
  AND (
    categoryId IS NULL
    OR categoryId = ''
    OR categoryId NOT IN (SELECT id FROM categories WHERE isActive = 1)
    OR categoryId IN (SELECT id FROM categories WHERE name = '미분류' AND shippingType <> products.shippingType)
  );
