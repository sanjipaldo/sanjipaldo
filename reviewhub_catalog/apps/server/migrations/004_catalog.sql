CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  shippingType TEXT NOT NULL CHECK (shippingType IN ('domestic', 'overseas')),
  sortOrder INTEGER NOT NULL DEFAULT 0,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_categories_shipping_type ON categories (shippingType);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  imageUrl TEXT,
  origin TEXT,
  aPrice INTEGER NOT NULL DEFAULT 0,
  generalPrice INTEGER NOT NULL DEFAULT 0,
  shippingFee TEXT NOT NULL DEFAULT '무료',
  releaseInfo TEXT,
  notes TEXT,
  optionsInfo TEXT,
  packaging TEXT,
  courier TEXT,
  shippingType TEXT NOT NULL CHECK (shippingType IN ('domestic', 'overseas')),
  categoryId TEXT NOT NULL REFERENCES categories (id),
  isVisible INTEGER NOT NULL DEFAULT 1,
  isSoldOut INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products (categoryId);
CREATE INDEX IF NOT EXISTS idx_products_shipping_type ON products (shippingType);
CREATE INDEX IF NOT EXISTS idx_products_visible ON products (isVisible);

CREATE TABLE IF NOT EXISTS notices (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  isPinned INTEGER NOT NULL DEFAULT 0,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS price_histories (
  id TEXT PRIMARY KEY,
  productId TEXT NOT NULL,
  productName TEXT NOT NULL,
  field TEXT NOT NULL CHECK (field IN ('aPrice', 'generalPrice')),
  oldPrice INTEGER NOT NULL,
  newPrice INTEGER NOT NULL,
  changedBy TEXT NOT NULL,
  changedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_price_histories_changed_at ON price_histories (changedAt);

CREATE TABLE IF NOT EXISTS sourcing_requests (
  id TEXT PRIMARY KEY,
  productName TEXT NOT NULL,
  desiredPrice TEXT,
  referenceUrl TEXT,
  requesterName TEXT NOT NULL,
  contact TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'reviewing', 'completed')),
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sourcing_requests_status ON sourcing_requests (status);

CREATE TABLE IF NOT EXISTS content_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO user (
  id, name, email, emailVerified, createdAt, updatedAt, username, displayUsername, role
) VALUES (
  'reviewhub-master-admin',
  '마스터 관리자',
  'admin@reviewhub.local',
  1,
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  'admin',
  'admin',
  'admin'
);

INSERT OR IGNORE INTO account (
  id, accountId, providerId, userId, password, createdAt, updatedAt
) VALUES (
  'reviewhub-master-admin-account',
  'reviewhub-master-admin',
  'credential',
  'reviewhub-master-admin',
  'a22b24319f644e6becb74c969f90f37c:232e345d206a8c235725ebd56c3902714bc62cdbd8612378362d9d2218a99b52c1a08651d76ede67c1b80f0dec023666c6ae4da6c4b09590a3c7685aea01036e',
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  CAST(strftime('%s','now') AS INTEGER) * 1000
);

INSERT OR IGNORE INTO categories (id, name, shippingType, sortOrder) VALUES
  ('cat-domestic-farm', '농산', 'domestic', 10),
  ('cat-domestic-seafood', '수산', 'domestic', 20),
  ('cat-domestic-livestock', '축산', 'domestic', 30),
  ('cat-domestic-gift', '선물세트', 'domestic', 40),
  ('cat-domestic-food', '식품', 'domestic', 50),
  ('cat-domestic-health', '건강식품', 'domestic', 60),
  ('cat-overseas-health', '해외 건강식품', 'overseas', 10);

INSERT OR IGNORE INTO products (
  id, name, imageUrl, origin, aPrice, generalPrice, shippingFee, releaseInfo,
  notes, optionsInfo, packaging, courier, shippingType, categoryId
) VALUES
  ('muskmelon-gift', '머스크메론세트 5kg (2수)', '/assets/products/muskmelon-gift.webp', '국내산', 27000, 29700, '무료 · 도서산간 추가', '평일 오전 10시 마감', '선물용 패키지, 산지 수확 상황에 따라 출고일이 달라질 수 있습니다.', '2수 · 총 5kg 내외', '선물박스 + 외피박스', 'CJ대한통운', 'domestic', 'cat-domestic-gift'),
  ('premium-rice-cake', '프리미엄 떡 선물세트 혼합 40g 20개입', '/assets/products/rice-cake-gift.webp', '국내산', 13500, 15000, '수량별 배송비', '평일 오전 11시 마감', '앙금인절미와 통팥찹쌀떡 혼합 구성입니다.', '각 10개 · 총 20개입', '보냉포장', '한진택배', 'domestic', 'cat-domestic-food'),
  ('ramie-songpyeon', '영광 국내산 모싯잎 송편 1kg', '/assets/products/songpyeon.webp', '국내산', 7200, 7800, '수량별 배송비', '평일 오전 11시 마감', '냉동 보관 상품이며 수령 후 즉시 냉동 보관해 주세요.', '1kg', '아이스박스', '롯데택배', 'domestic', 'cat-domestic-food'),
  ('gold-mango', '베트남 골드망고 5kg (10~16입)', '/assets/products/gold-mango.webp', '베트남', 36400, 39700, '무료 · 제주/도서산간 추가', '평일 오전 9시 30분 마감', '숙도에 따라 색상과 크기에 차이가 있을 수 있습니다.', '5kg · 10~16입', '전용박스', 'CJ대한통운', 'domestic', 'cat-domestic-farm'),
  ('naju-pear', '[선물포장] 나주 배 특품 5kg (8~10과)', '/assets/products/naju-pear.webp', '국내산', 31500, 34500, '무료 · 도서산간 추가', '평일 오전 10시 마감', '명절 기간에는 지정일 출고가 어려울 수 있습니다.', '5kg · 8~10과', '난좌 + 선물박스', '한진택배', 'domestic', 'cat-domestic-gift'),
  ('shine-muscat', '샤인머스캣 2kg 4~5수', '/assets/products/shine-muscat.webp', '국내산', 9500, 11000, '무료 · 제주/도서산간 추가', '평일 오전 9시 40분 마감', '산지 수확 후 순차 출고됩니다.', '2kg · 4~5수', '전용박스', 'CJ대한통운', 'domestic', 'cat-domestic-farm'),
  ('hami-melon', '하미과 메론 가정용 1.5kg 내외 × 2통', '/assets/products/hami-melon.webp', '국내산', 16500, 18000, '무료', '평일 오전 10시 마감', '가정용 상품으로 외관 흠집이 있을 수 있습니다.', '1.5kg 내외 × 2통', '전용박스', '롯데택배', 'domestic', 'cat-domestic-farm'),
  ('global-supplement', '캐네디언 프리미엄 헬스케어 60캡슐', '/assets/products/health-supplement.webp', '캐나다', 23800, 26900, '해외배송 7~12일', '영업일 기준 순차 출고', '개인통관고유부호가 필요한 해외배송 상품입니다.', '60캡슐', '완충포장', '우체국 EMS', 'overseas', 'cat-overseas-health');

INSERT OR IGNORE INTO notices (id, title, content, isPinned) VALUES
  ('notice-cutoff', '발주 마감시간 안내', '평일 오전 9시 30분까지 접수된 주문은 당일~2일 이내 출고됩니다.', 1),
  ('notice-delay', '미출고 및 지연 안내', '미출고 또는 출고 지연 발생 시 등록된 연락처로 개별 안내드립니다.', 1),
  ('notice-price', '가격 변동 확인 필수', '농수산물과 해외 상품은 시세 및 환율에 따라 공급가가 변동될 수 있습니다.', 0);

INSERT OR IGNORE INTO content_settings (key, value) VALUES
  ('guide', '상품별 마감시간을 반드시 확인해 주세요.\n주문 정보의 수령인·연락처·주소 오기재로 인한 반송은 보상되지 않습니다.\n신선식품 CS는 수령 후 24시간 이내에 송장·전체·문제 부위 사진을 첨부해 접수해 주세요.\nA단가는 제휴 조건이 적용된 단가이며 일반공급가는 일반 판매자 기준입니다.'),
  ('sourcing_intro', '찾으시는 상품이 목록에 없다면 상품명과 희망 조건을 남겨 주세요. 확인 후 순차적으로 안내드립니다.');

INSERT OR IGNORE INTO price_histories (
  id, productId, productName, field, oldPrice, newPrice, changedBy, changedAt
) VALUES
  ('history-1', 'shine-muscat', '샤인머스캣 2kg 4~5수', 'generalPrice', 11500, 11000, 'admin', '2026-09-13 09:20:00'),
  ('history-2', 'gold-mango', '베트남 골드망고 5kg (10~16입)', 'aPrice', 37000, 36400, 'admin', '2026-09-12 16:10:00'),
  ('history-3', 'muskmelon-gift', '머스크메론세트 5kg (2수)', 'generalPrice', 31000, 29700, 'admin', '2026-09-10 13:51:00');
