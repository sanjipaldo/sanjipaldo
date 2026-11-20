-- 032_supplier_portal.sql — 공급사 센터(2026-11-20, 관리자 요청)
-- 구조 변경만 합니다: 새 표 3개를 추가하고, 기존 표와 기존 데이터는 바꾸지 않습니다.
--
-- supplier_accounts: 마스터 관리자가 만든 공급사 로그인 계정. 로그인(아이디·비밀번호)은 better-auth의
--   user/account 표를 그대로 쓰고, 여기에는 어느 공급사(suppliers.id)의 계정인지와 정산 설정만 둡니다.
--   공급사마다 계정 1개. 회원가입은 없고 마스터만 만듭니다.
-- supplier_requests: 공급사가 보낸 상품 변경 요청·신규 상품 등록 요청. 마스터가 승인해야 상품에 반영됩니다.
-- supplier_sales: 공급사별 판매·반품 내역(날짜·상품·수량·금액). 나중에 주문 데이터 연결로 채웁니다.

CREATE TABLE IF NOT EXISTS supplier_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  supplierId TEXT NOT NULL UNIQUE REFERENCES suppliers (id) ON DELETE CASCADE,
  userId TEXT NOT NULL UNIQUE REFERENCES user (id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  isActive INTEGER NOT NULL DEFAULT 1,
  commissionRate REAL NOT NULL DEFAULT 10,
  settlementCycle TEXT NOT NULL DEFAULT 'monthly',
  lastLoginAt TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS supplier_requests (
  id TEXT PRIMARY KEY NOT NULL,
  supplierId TEXT NOT NULL,
  supplierName TEXT NOT NULL,
  productId TEXT,
  productName TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'update',
  status TEXT NOT NULL DEFAULT 'pending',
  changes TEXT NOT NULL DEFAULT '{}',
  snapshot TEXT,
  note TEXT,
  reviewNote TEXT,
  reviewedBy TEXT,
  reviewedAt TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_supplier_requests_status
  ON supplier_requests (status, createdAt);

CREATE INDEX IF NOT EXISTS idx_supplier_requests_supplier
  ON supplier_requests (supplierId, createdAt);

CREATE INDEX IF NOT EXISTS idx_supplier_requests_product
  ON supplier_requests (productId, status);

CREATE TABLE IF NOT EXISTS supplier_sales (
  id TEXT PRIMARY KEY NOT NULL,
  saleDate TEXT NOT NULL,
  supplierName TEXT NOT NULL,
  productId TEXT,
  productCode TEXT,
  productName TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'sale',
  quantity INTEGER NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL DEFAULT 0,
  orderCount INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'baljuora',
  externalId TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_supplier_sales_supplier_date
  ON supplier_sales (supplierName, saleDate);

CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_sales_external
  ON supplier_sales (source, externalId) WHERE externalId IS NOT NULL;
