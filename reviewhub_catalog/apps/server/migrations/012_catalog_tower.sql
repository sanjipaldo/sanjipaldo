ALTER TABLE products ADD COLUMN supplierName TEXT;
ALTER TABLE products ADD COLUMN deletedAt TEXT;

CREATE INDEX IF NOT EXISTS idx_products_deleted_at
  ON products(deletedAt);

CREATE TABLE IF NOT EXISTS sales_daily_suppliers (
  id TEXT PRIMARY KEY NOT NULL,
  saleDate TEXT NOT NULL,
  supplierName TEXT NOT NULL,
  revenue INTEGER NOT NULL DEFAULT 0,
  cost INTEGER NOT NULL DEFAULT 0,
  orderCount INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'baljuora',
  sourceUpdatedAt TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_daily_supplier_date
  ON sales_daily_suppliers(saleDate, supplierName);

CREATE INDEX IF NOT EXISTS idx_sales_daily_date
  ON sales_daily_suppliers(saleDate);
