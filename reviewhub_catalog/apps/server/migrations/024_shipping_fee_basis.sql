-- 024: 유료 배송비의 부과 방식(주문당 고정·수량별·무게별 kg당)을 저장합니다. 기존 정책은 주문당 고정으로 둡니다.
ALTER TABLE shipping_policies ADD COLUMN feeBasis TEXT NOT NULL DEFAULT 'order';
