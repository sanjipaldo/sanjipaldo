ALTER TABLE products ADD COLUMN salePrice INTEGER;
ALTER TABLE products ADD COLUMN salePriceMode TEXT NOT NULL DEFAULT 'autonomous';
ALTER TABLE products ADD COLUMN saleStartMonth INTEGER;
ALTER TABLE products ADD COLUMN saleEndMonth INTEGER;

ALTER TABLE product_options ADD COLUMN salePrice INTEGER;
ALTER TABLE product_options ADD COLUMN salePriceMode TEXT NOT NULL DEFAULT 'autonomous';

CREATE TABLE IF NOT EXISTS catalog_activity_logs (
  id TEXT PRIMARY KEY,
  productId TEXT NOT NULL,
  productName TEXT NOT NULL,
  optionId TEXT,
  optionName TEXT,
  eventType TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_catalog_activity_created_at
  ON catalog_activity_logs (createdAt);
CREATE INDEX IF NOT EXISTS idx_catalog_activity_event_type
  ON catalog_activity_logs (eventType);

UPDATE products
SET salePriceMode = 'fixed'
WHERE categoryId IN (
  SELECT id FROM categories WHERE name LIKE '%건강식품%'
);

UPDATE product_options
SET salePriceMode = 'fixed'
WHERE productId IN (
  SELECT products.id
  FROM products
  JOIN categories ON categories.id = products.categoryId
  WHERE categories.name LIKE '%건강식품%'
);

UPDATE products SET saleStartMonth = 6, saleEndMonth = 10 WHERE id = 'muskmelon-gift';
UPDATE products SET saleStartMonth = 1, saleEndMonth = 12 WHERE id = 'premium-rice-cake';
UPDATE products SET saleStartMonth = 1, saleEndMonth = 12 WHERE id = 'ramie-songpyeon';
UPDATE products SET saleStartMonth = 3, saleEndMonth = 8 WHERE id = 'gold-mango';
UPDATE products SET saleStartMonth = 8, saleEndMonth = 11 WHERE id = 'naju-pear';
UPDATE products SET saleStartMonth = 8, saleEndMonth = 10 WHERE id = 'shine-muscat';
UPDATE products SET saleStartMonth = 4, saleEndMonth = 8 WHERE id = 'hami-melon';
