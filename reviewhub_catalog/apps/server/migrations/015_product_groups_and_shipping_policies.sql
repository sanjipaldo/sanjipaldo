-- Product groups (bundle products) and reusable shipping policies.
-- Existing products remain the source catalog; these tables add relationships only.

CREATE TABLE IF NOT EXISTS shipping_policies (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  shippingType TEXT NOT NULL,
  courier TEXT,
  fee INTEGER NOT NULL DEFAULT 0,
  feeLabel TEXT NOT NULL DEFAULT '무료배송',
  freeShippingThreshold INTEGER,
  description TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shipping_policies_active
  ON shipping_policies(isActive, sortOrder);

ALTER TABLE products ADD COLUMN shippingPolicyId TEXT REFERENCES shipping_policies(id);

CREATE INDEX IF NOT EXISTS idx_products_shipping_policy
  ON products(shippingPolicyId);

CREATE TABLE IF NOT EXISTS product_groups (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  imageUrl TEXT,
  categoryId TEXT REFERENCES categories(id),
  description TEXT,
  displayOrder INTEGER NOT NULL DEFAULT 1000000,
  isVisible INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_groups_category
  ON product_groups(categoryId);

CREATE INDEX IF NOT EXISTS idx_product_groups_order
  ON product_groups(displayOrder, updatedAt);

CREATE TABLE IF NOT EXISTS product_group_items (
  id TEXT PRIMARY KEY NOT NULL,
  groupId TEXT NOT NULL REFERENCES product_groups(id) ON DELETE CASCADE,
  productId TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(groupId, productId)
);

CREATE INDEX IF NOT EXISTS idx_product_group_items_group
  ON product_group_items(groupId, sortOrder);

CREATE INDEX IF NOT EXISTS idx_product_group_items_product
  ON product_group_items(productId);

INSERT OR IGNORE INTO shipping_policies
  (id, name, shippingType, courier, fee, feeLabel, description, sortOrder)
VALUES
  ('shipping-policy-free-domestic', '국내 무료배송', 'domestic', '택배사 지정', 0, '무료배송', '상품별 출고 조건을 따릅니다.', 10),
  ('shipping-policy-paid-domestic', '국내 유료배송', 'domestic', '택배사 지정', 3500, '3,500원', '매입처별 배송비가 다를 수 있습니다.', 20),
  ('shipping-policy-overseas', '해외배송', 'overseas', '국제 특송', 0, '무게별 부과', '통관·무게에 따라 배송비가 달라집니다.', 30);
