-- 030: 입점 신청(공급사)의 진행 단계와 계약 조건을 기록하는 표를 추가합니다(구조 변경만, 기존 데이터 값 변경 없음).
-- stage: received(접수) · contacted(연락 완료) · negotiating(상담·협의 중) · contracted(계약 완료) · declined(계약 불발)
-- contractType: commission(수수료 위탁) · wholesale(일반 도소매 매입) · other(기타), commissionRate: 수수료율(%)
CREATE TABLE IF NOT EXISTS partner_deals (
  requestId TEXT PRIMARY KEY NOT NULL,
  stage TEXT NOT NULL DEFAULT 'received',
  contractType TEXT,
  commissionRate REAL,
  contractMemo TEXT,
  contactedAt TEXT,
  closedAt TEXT,
  history TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_partner_deals_stage
  ON partner_deals(stage, updatedAt);
