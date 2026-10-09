-- 025: 배송 정책을 발주오라와 같은 5가지 유형(고정·무료·금액별·수량별·단위별)으로 저장하기 위한 칸을 추가합니다.
-- 구조만 추가하며 기존 정책 값은 바꾸지 않습니다(rateType이 비어 있는 기존 정책은 화면에서 기존 값으로 유형을 보여 줍니다).
ALTER TABLE shipping_policies ADD COLUMN rateType TEXT;
ALTER TABLE shipping_policies ADD COLUMN rateTiers TEXT;
ALTER TABLE shipping_policies ADD COLUMN unitLabel TEXT;
ALTER TABLE shipping_policies ADD COLUMN freeWholeOrder INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shipping_policies ADD COLUMN policyCode TEXT;
