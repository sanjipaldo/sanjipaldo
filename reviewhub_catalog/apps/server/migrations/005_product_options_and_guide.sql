CREATE TABLE IF NOT EXISTS product_options (
  id TEXT PRIMARY KEY,
  productId TEXT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  aPrice INTEGER NOT NULL DEFAULT 0,
  generalPrice INTEGER NOT NULL DEFAULT 0,
  isSoldOut INTEGER NOT NULL DEFAULT 0,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_options_product ON product_options (productId);
CREATE INDEX IF NOT EXISTS idx_product_options_sort ON product_options (productId, sortOrder);

ALTER TABLE price_histories ADD COLUMN optionId TEXT;
ALTER TABLE price_histories ADD COLUMN optionName TEXT;

INSERT OR IGNORE INTO product_options (
  id, productId, name, aPrice, generalPrice, isSoldOut, sortOrder
) VALUES
  ('option-muskmelon-2', 'muskmelon-gift', '2수 · 총 5kg 내외', 27000, 29700, 0, 10),
  ('option-muskmelon-3', 'muskmelon-gift', '3수 · 총 6kg 내외', 33500, 36500, 0, 20),
  ('option-mango-3', 'gold-mango', '3kg · 6~10입', 22450, 24900, 0, 10),
  ('option-mango-5', 'gold-mango', '5kg · 10~16입', 36400, 39700, 0, 20),
  ('option-mango-10', 'gold-mango', '10kg · 20~32입', 68900, 74500, 0, 30),
  ('option-shine-2', 'shine-muscat', '2kg · 4~5수', 9500, 11000, 0, 10),
  ('option-shine-4', 'shine-muscat', '4kg · 8~10수', 18500, 20900, 0, 20),
  ('option-hami-2', 'hami-melon', '1.5kg 내외 × 2통', 16500, 18000, 0, 10),
  ('option-hami-4', 'hami-melon', '1.5kg 내외 × 4통', 31500, 34500, 0, 20),
  ('option-health-1', 'global-supplement', '60캡슐 · 1병', 23800, 26900, 0, 10),
  ('option-health-2', 'global-supplement', '60캡슐 · 2병', 45500, 50900, 0, 20);

INSERT OR IGNORE INTO content_settings (key, value) VALUES (
  'guide_sections',
  '{"highlights":["두고푸드 상품은 상품별 마감시간을 기준으로 순차 출고됩니다.","발주 전 최신 단가와 출고 가능 여부를 반드시 확인해 주세요."],"orderInfo":[{"label":"발주 마감","value":"상품별 마감시간 이전 주문은 당일 접수됩니다."},{"label":"송장 안내","value":"출고 당일 오후부터 순차적으로 송장번호가 등록됩니다."},{"label":"발주 원칙","value":"상품명·옵션·수취인 정보를 정확히 확인한 뒤 접수해 주세요."}],"orderMethod":["상품 단가표에서 상품과 옵션별 가격을 확인합니다.","수취인·연락처·주소와 요청 옵션을 정확히 작성합니다.","출고 및 송장 등록 여부를 확인합니다."],"csSummary":"고객 수령 후 24시간 이내 접수된 건에 한해 확인할 수 있습니다.","csHow":"송장사진·상품 전체사진·문제 부위 사진과 상세 내용을 함께 준비해 주세요.","csRules":["필수 사진이나 상세 내용이 부족하면 처리가 제한될 수 있습니다.","단순 변심이나 맛에 대한 주관적 사유는 교환·환불 대상이 아닙니다.","신선식품은 수분 감량으로 표시 중량과 일부 차이가 발생할 수 있습니다.","주소·연락처 오기재와 수취 거부로 인한 반송은 보상되지 않습니다.","상품 일부에 문제가 있는 경우 확인된 수량을 기준으로 처리합니다."],"etc":[{"label":"세금계산서","value":"발행 일정과 방식은 관리자 공지를 확인해 주세요."},{"label":"상품 이미지","value":"두고푸드 상품 판매 목적에 한해 사용할 수 있습니다."},{"label":"배송비","value":"상품별 배송비와 제주·도서산간 추가비용을 확인해 주세요."},{"label":"면세 여부","value":"상품별 과세 정보를 확인해 주세요."},{"label":"최소 주문수량","value":"기본 1개이며 상품별 조건이 우선 적용됩니다."}],"faq":[{"q":"주말에도 발주할 수 있나요?","a":"주말에 접수된 주문은 다음 영업일 마감 전 주문과 함께 순차 처리됩니다."},{"q":"기존 주문 후 추가 주문이 생겼어요.","a":"기존 주문을 수정하지 말고 추가 상품만 별도 주문으로 접수해 주세요."},{"q":"주문번호를 반드시 입력해야 하나요?","a":"중복 발주를 막기 위해 주문번호를 입력해 주세요. 별도 번호가 없다면 식별 가능한 임시 번호를 사용해 주세요."},{"q":"송하인 주소와 번호를 비워서 보내도 되나요?","a":"정확한 배송 안내를 위해 발주 시 송하인 상호, 주소와 연락처를 함께 입력해 주세요."},{"q":"판매 전에 샘플을 받아볼 수 있나요?","a":"일반 주문과 동일한 방식으로 상품을 발주해 확인할 수 있습니다."},{"q":"협업이나 대량 소싱 문의는 어디로 하나요?","a":"소싱해주세요 메뉴에 상품과 희망 조건을 남겨주시면 담당자가 확인합니다."},{"q":"상품은 어떤 판매 채널에 등록할 수 있나요?","a":"상품별 이미지·브랜드 사용 조건을 확인한 뒤 운영 중인 판매 채널에 등록해 주세요."},{"q":"출고지와 반품지는 어떻게 적나요?","a":"판매자 사업장 정보를 기준으로 작성하되, 반품은 먼저 관리자와 협의해 주세요."},{"q":"택배 발송인은 어떻게 표시되나요?","a":"발주 시 입력한 상호명과 발송인 정보가 적용될 수 있으므로 주문 정보를 정확히 작성해 주세요."},{"q":"세금계산서는 언제 발행되나요?","a":"관리자 공지에 안내된 정기 발행 일정을 기준으로 처리됩니다."},{"q":"상품은 면세인가요?","a":"상품별 과세 여부가 다를 수 있으므로 상품 정보와 공지를 확인해 주세요."},{"q":"최소 주문수량은 몇 개인가요?","a":"기본 최소 주문수량은 1개이며 별도 표기가 있는 상품은 해당 조건이 우선합니다."},{"q":"발주 후 취소는 언제까지 가능한가요?","a":"출고 작업 전까지만 가능하며, 가능한 한 발주 당일 오전 중 요청해 주세요."},{"q":"CS 접수 후 답변은 언제 받을 수 있나요?","a":"접수 순서대로 확인하며 자료가 충분한 건부터 신속하게 안내합니다."},{"q":"제공된 상품 이미지를 사용해도 되나요?","a":"두고푸드 상품 판매 목적에 한해 사용할 수 있으며 다른 용도로 재배포할 수 없습니다."},{"q":"판매가는 자유롭게 정할 수 있나요?","a":"공급가는 두고푸드가 안내하며 최종 판매가는 판매자가 자율적으로 결정합니다."},{"q":"반품이나 회수는 어떻게 진행되나요?","a":"임의 반품하지 말고 관리자 확인 후 안내받은 주소와 방법으로 진행해 주세요."},{"q":"취소 후 환불은 어떻게 처리되나요?","a":"취소 승인 후 결제 수단과 운영 절차에 따라 순차 환불됩니다."}]}'
);
