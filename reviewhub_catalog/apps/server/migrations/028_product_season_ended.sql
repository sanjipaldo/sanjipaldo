-- 028: 상품 상태 "시즌종료"를 관리자가 직접 지정할 수 있도록 칸을 추가합니다(구조 변경만, 기존 데이터 값 변경 없음).
-- - 기본값 0(지정 안 함)이라 기존 상품은 지금과 똑같이 보입니다. 판매기간(제철 월)으로 자동 판단하는 시즌 종료는 그대로 유지됩니다.
ALTER TABLE products ADD COLUMN isSeasonEnded INTEGER NOT NULL DEFAULT 0;
