-- 019: 옵션을 독립 상품으로 분리합니다(발주오라 일반상품과 같은 "상품 1개 = 1줄" 구조).
-- - 옵션마다 새 상품을 만들고(상품명 "원래 상품명 (옵션명)", 상품코드 "원래코드-순번"), 가격·품절은 옵션 값을 씁니다.
-- - 옵션에 묶여 있던 가격변동 이력은 새 상품으로 옮깁니다.
-- - 원래 상품은 지우지 않고 숨김·삭제 표시(deletedAt)만 하며, 옵션 행은 정리합니다.
-- 여러 번 실행돼도 같은 결과가 되도록 이미 만든 상품은 건너뜁니다.

INSERT INTO products (
  id, productCode, name, imageUrl, origin, supplierName,
  costPrice, aPrice, generalPrice, salePrice, salePriceMode,
  saleStartMonth, saleEndMonth, isAlwaysOnSale,
  shippingFee, releaseInfo, notes, optionsInfo, packaging, courier, shippingPolicyId,
  shippingType, categoryId, displayOrder, isVisible, isSoldOut, deletedAt, createdAt, updatedAt
)
SELECT
  'opt-' || o.id,
  COALESCE(NULLIF(p.productCode, ''), p.id) || '-' || (
    SELECT COUNT(*) FROM product_options o2
    WHERE o2.productId = o.productId AND (o2.sortOrder < o.sortOrder OR (o2.sortOrder = o.sortOrder AND o2.id <= o.id))
  ),
  p.name || ' (' || o.name || ')',
  p.imageUrl, p.origin, p.supplierName,
  o.costPrice, o.aPrice, o.generalPrice, o.salePrice, COALESCE(o.salePriceMode, p.salePriceMode),
  p.saleStartMonth, p.saleEndMonth, p.isAlwaysOnSale,
  p.shippingFee, p.releaseInfo, p.notes, o.name, p.packaging, p.courier, p.shippingPolicyId,
  p.shippingType, p.categoryId,
  p.displayOrder + (
    SELECT COUNT(*) FROM product_options o2
    WHERE o2.productId = o.productId AND (o2.sortOrder < o.sortOrder OR (o2.sortOrder = o.sortOrder AND o2.id < o.id))
  ),
  p.isVisible, o.isSoldOut, NULL, p.createdAt, CURRENT_TIMESTAMP
FROM product_options o
JOIN products p ON p.id = o.productId
WHERE p.deletedAt IS NULL
  AND NOT EXISTS (SELECT 1 FROM products existing WHERE existing.id = 'opt-' || o.id);

UPDATE price_histories
SET productName = (SELECT name FROM products WHERE products.id = 'opt-' || price_histories.optionId),
    productId = 'opt-' || optionId,
    optionId = NULL,
    optionName = NULL
WHERE optionId IS NOT NULL
  AND EXISTS (SELECT 1 FROM products WHERE products.id = 'opt-' || price_histories.optionId);

UPDATE products
SET isVisible = 0,
    deletedAt = CURRENT_TIMESTAMP,
    updatedAt = CURRENT_TIMESTAMP
WHERE deletedAt IS NULL
  AND id IN (SELECT productId FROM product_options);

DELETE FROM product_options;
