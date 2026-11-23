-- 035_subcategories.sql — DB센터 2차 카테고리(2026-11-23 관리자 요청 "카테고리가 추가되거나 2차 카테고리 문구가 바뀌면
-- DB센터 관리자에서 바꾸고 동기화 버튼을 누르면 발주오라 상품 카테고리도 똑같이 바뀌게, 브랜드별은 제외").
-- 구조 변경만 합니다: 새 표 1개를 만들고, 기존 표의 데이터는 바꾸지 않습니다.
--
-- subcategories: 1차 카테고리(categories) 아래 2차 카테고리 이름. 발주오라 상품 카테고리 트리(1차 > 2차)를 DB센터에서 관리하는 데 씁니다.
--   단가표·상품 등록은 지금처럼 1차 카테고리만 씁니다(상품은 2차에 넣지 않음). categoryId = 1차 카테고리 id.

CREATE TABLE IF NOT EXISTS subcategories (
  id TEXT PRIMARY KEY,
  categoryId TEXT NOT NULL,
  name TEXT NOT NULL,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_subcategories_category ON subcategories (categoryId);
