ALTER TABLE products ADD COLUMN displayOrder INTEGER NOT NULL DEFAULT 1000000;

WITH ranked_products AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      ORDER BY datetime(updatedAt) DESC, id ASC
    ) * 10 AS rank_order
  FROM products
  WHERE deletedAt IS NULL
)
UPDATE products
SET displayOrder = (
  SELECT rank_order
  FROM ranked_products
  WHERE ranked_products.id = products.id
)
WHERE deletedAt IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_display_order
  ON products(displayOrder);
