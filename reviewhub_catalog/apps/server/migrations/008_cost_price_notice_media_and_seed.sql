ALTER TABLE products ADD COLUMN costPrice INTEGER NOT NULL DEFAULT 0;
ALTER TABLE product_options ADD COLUMN costPrice INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notices ADD COLUMN imageUrl TEXT;
ALTER TABLE notices ADD COLUMN youtubeUrl TEXT;

INSERT INTO sourcing_requests (
  id, productName, desiredPrice, referenceUrl, requesterName, contact, details, status, createdAt, updatedAt
)
SELECT
  'seed-sourcing-example',
  '제주 감귤 선물세트 5kg',
  '25,000원 이하',
  'https://www.doogofood.com/',
  '예시 셀러',
  '010-0000-0000',
  '11월 출고 가능한 중과 규격, 선물박스 포장으로 소싱 요청합니다.',
  'received',
  '2026-09-14T09:00:00.000Z',
  '2026-09-14T09:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM sourcing_requests);
