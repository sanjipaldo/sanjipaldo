ALTER TABLE products ADD COLUMN productCode TEXT;

UPDATE products
SET productCode = id
WHERE productCode IS NULL OR TRIM(productCode) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_product_code ON products (productCode);
