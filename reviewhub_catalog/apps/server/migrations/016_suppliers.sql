CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  businessNumber TEXT,
  representative TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  memo TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_suppliers_active
  ON suppliers(isActive, name);

INSERT OR IGNORE INTO suppliers (id, name, isActive)
SELECT
  'supplier-' || lower(hex(randomblob(8))),
  trim(supplierName),
  1
FROM products
WHERE supplierName IS NOT NULL
  AND trim(supplierName) <> '';
