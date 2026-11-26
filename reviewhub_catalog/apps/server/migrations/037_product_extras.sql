-- 037_product_extras.sql — 발주오라 상품 등록 화면과 같은 상품 정보 칸(2026-11-26 관리자 요청 "발주오라 상품관리자 페이지와
-- 빠지는 거 없이 양방향으로 동기화되게, DB센터 상품 창 레이아웃은 그대로 두고 칸만 추가").
-- 구조 변경만 합니다: 새 표 1개를 만들고, 기존 표와 기존 데이터는 바꾸지 않습니다.
--
-- product_extras: 상품 1개당 1행(없으면 모든 칸 비어 있음). 원산지·택배사·배송유형·품절·시즌종료·노출은 지금처럼 products 칸을 씁니다.
--   isTaxable          과세 여부(1 과세, 0 비과세, NULL = 자동: 건강식품 카테고리는 과세, 그 밖은 비과세)
--   managementCode     관리코드 · barcode 바코드
--   contentAmount/Unit/Count/Basis  내용량(예: 500 g × 10, basis total = 전체 · each = 개당)
--   purchaseName       발주상품명(매입처에 발주할 때 쓰는 이름) · purchaseQuantity 발주단위(판매 1개당 발주 수량)
--   shippingUnitType/Value  배송 단위(예: box 1 = 1박스)
--   purchaseDeadline   발주마감 시각(예: 09:30)
--   certificationKinds 인증 종류(JSON 배열, 예: ["haccp","organic"])
--   summary            상품 간략설명(100자, 발주오라 description)
--   shippingLocation   출고지 · manufacturingDate 제조연월일 · expirationDate 소비기한
--   taxonomyItemId/Name 발주오라 상품 분류(발주오라에서 가져온 값, DB센터에서는 읽기만)

CREATE TABLE IF NOT EXISTS product_extras (
  productId TEXT PRIMARY KEY NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  isTaxable INTEGER,
  managementCode TEXT,
  barcode TEXT,
  contentAmount REAL,
  contentUnit TEXT,
  contentCount INTEGER,
  contentBasis TEXT,
  purchaseName TEXT,
  purchaseQuantity INTEGER,
  shippingUnitType TEXT,
  shippingUnitValue REAL,
  purchaseDeadline TEXT,
  certificationKinds TEXT,
  summary TEXT,
  shippingLocation TEXT,
  manufacturingDate TEXT,
  expirationDate TEXT,
  taxonomyItemId TEXT,
  taxonomyName TEXT,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
