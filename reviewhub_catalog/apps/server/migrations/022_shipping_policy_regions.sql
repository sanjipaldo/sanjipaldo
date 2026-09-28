-- 022: 배송 정책에 배송비 유형과 제주·도서산간 추가배송비, 반품·교환 배송비를 추가합니다.
-- 기존 정책의 배송비 유형은 저장된 배송비·무료배송 기준금액으로 정합니다(값은 바꾸지 않음).
ALTER TABLE shipping_policies ADD COLUMN feeType TEXT NOT NULL DEFAULT 'free';
ALTER TABLE shipping_policies ADD COLUMN jejuExtraFee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shipping_policies ADD COLUMN islandExtraFee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shipping_policies ADD COLUMN returnFee INTEGER;
ALTER TABLE shipping_policies ADD COLUMN exchangeFee INTEGER;

UPDATE shipping_policies
SET feeType = CASE
  WHEN fee = 0 THEN 'free'
  WHEN freeShippingThreshold IS NOT NULL AND freeShippingThreshold > 0 THEN 'conditional'
  ELSE 'paid'
END;
