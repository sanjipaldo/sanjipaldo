-- 036_baljuora_sales.sql — 발주오라 판매·매출처 가져오기, 홈택스 신고 파일, 공급사 월 정산 상태(2026-11-23, 관리자 요청 "1차 개발")
-- 구조 변경만 합니다: 새 표 3개를 추가하고, 기존 표와 기존 데이터는 바꾸지 않습니다.
--
-- baljuora_sales_lines: 발주오라 주문 상품 줄(주문 1건의 상품 1줄 = 1행). 관리자가 동기화(책갈피)를 할 때마다
--   고른 기간의 주문을 다시 읽어 덮어씁니다(취소·반품으로 바뀐 수량 반영). 받는 사람 이름·연락처는 가져오지 않습니다.
--   netQuantity = 취소·반품을 뺀 수량, amount = 공급가 × netQuantity. isTaxable = 과세(1)·면세(0)(발주오라 상품의 과세 여부).
-- baljuora_buyers: 발주오라 매출처(셀러) 회원. 동기화 때마다 발주오라 값으로 고칩니다. 세금계산서에 쓸 칸을
--   DB센터에서 고친 값은 overrides(JSON)에 따로 두어 동기화가 덮어쓰지 않습니다. 계좌·비밀번호는 가져오지 않습니다.
-- supplier_settlements: 공급사별 월 정산 상태(정산 대기 → 판매 대금 입금 → 정산 완료). 마스터가 바꾸고 공급사 센터에서 봅니다.
--   상태를 바꿀 때의 판매 금액·수수료를 함께 적어 두어, 나중에 반품으로 금액이 바뀌면 화면에서 알려 줍니다.

CREATE TABLE IF NOT EXISTS baljuora_sales_lines (
  id TEXT PRIMARY KEY NOT NULL,
  orderId TEXT,
  saleDate TEXT NOT NULL,
  orderedAt TEXT,
  status TEXT,
  baljuoraProductId TEXT,
  productId TEXT,
  productCode TEXT,
  productName TEXT NOT NULL,
  categoryId TEXT,
  supplierName TEXT,
  baljuoraSupplierName TEXT,
  sellerId TEXT,
  sellerName TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  netQuantity INTEGER NOT NULL DEFAULT 0,
  unitPrice INTEGER NOT NULL DEFAULT 0,
  unitCost INTEGER,
  amount INTEGER NOT NULL DEFAULT 0,
  costAmount INTEGER,
  salesShippingFee INTEGER NOT NULL DEFAULT 0,
  purchaseShippingFee INTEGER NOT NULL DEFAULT 0,
  isTaxable INTEGER,
  taxSource TEXT,
  syncJobId TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_baljuora_sales_date ON baljuora_sales_lines (saleDate);
CREATE INDEX IF NOT EXISTS idx_baljuora_sales_supplier ON baljuora_sales_lines (supplierName, saleDate);
CREATE INDEX IF NOT EXISTS idx_baljuora_sales_seller ON baljuora_sales_lines (sellerId, saleDate);

CREATE TABLE IF NOT EXISTS baljuora_buyers (
  id TEXT PRIMARY KEY NOT NULL,
  companyName TEXT NOT NULL,
  representativeName TEXT,
  businessNumber TEXT,
  businessType TEXT,
  businessCategory TEXT,
  email TEXT,
  phone TEXT,
  managerName TEXT,
  zipCode TEXT,
  address TEXT,
  addressDetail TEXT,
  groupId TEXT,
  groupName TEXT,
  status TEXT,
  orderAcceptType TEXT,
  username TEXT,
  lastLoginAt TEXT,
  joinedAt TEXT,
  overrides TEXT,
  memo TEXT,
  firstSyncedAt TEXT,
  lastSyncedAt TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_baljuora_buyers_company ON baljuora_buyers (companyName);

CREATE TABLE IF NOT EXISTS supplier_settlements (
  id TEXT PRIMARY KEY NOT NULL,
  supplierName TEXT NOT NULL,
  month TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  saleAmount INTEGER NOT NULL DEFAULT 0,
  commissionRate REAL NOT NULL DEFAULT 10,
  commission INTEGER NOT NULL DEFAULT 0,
  payoutAmount INTEGER NOT NULL DEFAULT 0,
  paidAt TEXT,
  doneAt TEXT,
  memo TEXT,
  updatedBy TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_settlements_month ON supplier_settlements (supplierName, month);
