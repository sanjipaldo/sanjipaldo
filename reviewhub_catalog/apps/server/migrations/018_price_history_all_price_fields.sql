-- 가격변동 이력에 원가(costPrice)·지정 판매가(salePrice) 변경도 기록할 수 있도록 CHECK 제약을 넓힙니다.
-- 004_catalog.sql의 CHECK(field IN ('aPrice','generalPrice')) 때문에 원가·판매가·해당 옵션 가격을 바꾸면 저장이 실패했습니다.
-- SQLite는 CHECK를 수정할 수 없으므로 같은 구조의 새 테이블로 옮깁니다(기존 이력은 그대로 보존).
CREATE TABLE IF NOT EXISTS price_histories_v2 (
  id TEXT PRIMARY KEY,
  productId TEXT NOT NULL,
  productName TEXT NOT NULL,
  field TEXT NOT NULL CHECK (field IN ('costPrice', 'aPrice', 'generalPrice', 'salePrice')),
  oldPrice INTEGER NOT NULL,
  newPrice INTEGER NOT NULL,
  changedBy TEXT NOT NULL,
  changedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  optionId TEXT,
  optionName TEXT
);

INSERT OR IGNORE INTO price_histories_v2 (id, productId, productName, field, oldPrice, newPrice, changedBy, changedAt, optionId, optionName)
SELECT id, productId, productName, field, oldPrice, newPrice, changedBy, changedAt, optionId, optionName FROM price_histories;

DROP TABLE price_histories;
ALTER TABLE price_histories_v2 RENAME TO price_histories;
CREATE INDEX IF NOT EXISTS idx_price_histories_changed_at ON price_histories (changedAt);
