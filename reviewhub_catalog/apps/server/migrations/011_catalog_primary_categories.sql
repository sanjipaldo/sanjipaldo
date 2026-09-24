-- Consolidate the public/admin data center to seven manually managed primary categories.
-- Imported Baljuora detail descriptions are intentionally removed; the original sample copy is preserved.
UPDATE products
SET categoryId = CASE
  WHEN categoryId IN (
    'cat-baljuora-ad84e5b95296',
    'cat-baljuora-01e21b589c33',
    'cat-baljuora-65054ab1e2e0',
    'cat-baljuora-60ea04216bf4',
    'cat-baljuora-16ba976e8f98'
  ) THEN 'cat-domestic-farm'
  WHEN categoryId IN (
    'cat-baljuora-323554accb6f',
    'cat-baljuora-31fc8695fc5c',
    'cat-baljuora-26da80e365cb',
    'cat-baljuora-04c9fcfddc49'
  ) THEN 'cat-domestic-seafood'
  WHEN categoryId IN (
    'cat-baljuora-01622928ec34',
    'cat-baljuora-7e3385dadf1f',
    'cat-baljuora-9ce1d45d7741'
  ) THEN 'cat-domestic-livestock'
  WHEN categoryId IN (
    'cat-baljuora-d1a53008f11b',
    'cat-baljuora-c62c16c096ee',
    'cat-baljuora-48bcafb4b5f5'
  ) THEN 'cat-domestic-gift'
  WHEN categoryId IN (
    'cat-baljuora-becfb32cea59',
    'cat-baljuora-a1599a19d491',
    'cat-baljuora-3c1db0337a4f',
    'cat-baljuora-e45fc8024c7c'
  ) THEN 'cat-domestic-food'
  WHEN categoryId IN (
    'cat-baljuora-8587b896ccb5',
    'cat-baljuora-a0dfd8c47c08',
    'cat-baljuora-5b0de08cf3c6'
  ) THEN 'cat-domestic-health'
  WHEN categoryId IN (
    'cat-baljuora-f6fe956fa634',
    'cat-baljuora-c0b76f53b413'
  ) THEN 'cat-overseas-health'
  ELSE categoryId
END
WHERE id IN (
  SELECT productId FROM external_product_links WHERE provider = 'baljuora'
);

UPDATE products
SET shippingType = 'overseas'
WHERE categoryId = 'cat-overseas-health'
  AND id IN (SELECT productId FROM external_product_links WHERE provider = 'baljuora');

UPDATE products
SET notes = NULL
WHERE id IN (
  SELECT productId FROM external_product_links WHERE provider = 'baljuora'
);

UPDATE categories SET name = '🥕 농산', shippingType = 'domestic', sortOrder = 10, isActive = 1 WHERE id = 'cat-domestic-farm';
UPDATE categories SET name = '🐟 수산', shippingType = 'domestic', sortOrder = 20, isActive = 1 WHERE id = 'cat-domestic-seafood';
UPDATE categories SET name = '🥩 축산', shippingType = 'domestic', sortOrder = 30, isActive = 1 WHERE id = 'cat-domestic-livestock';
UPDATE categories SET name = '🎁 선물세트', shippingType = 'domestic', sortOrder = 40, isActive = 1 WHERE id = 'cat-domestic-gift';
UPDATE categories SET name = '🥫 식품', shippingType = 'domestic', sortOrder = 50, isActive = 1 WHERE id = 'cat-domestic-food';
UPDATE categories SET name = '💊 건강식품', shippingType = 'domestic', sortOrder = 60, isActive = 1 WHERE id = 'cat-domestic-health';
UPDATE categories SET name = '✈️ 해외 건강식품', shippingType = 'overseas', sortOrder = 70, isActive = 1 WHERE id = 'cat-overseas-health';

UPDATE categories
SET isActive = 0
WHERE id NOT IN (
  'cat-domestic-farm',
  'cat-domestic-seafood',
  'cat-domestic-livestock',
  'cat-domestic-gift',
  'cat-domestic-food',
  'cat-domestic-health',
  'cat-overseas-health'
);
