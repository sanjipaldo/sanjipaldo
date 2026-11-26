-- 038_supplier_profile_changes.sql — 공급사 필수 정보 변경 기록(2026-11-27 관리자 요청 "공급사가 로그인할 때 사업자등록번호·
-- 정산 받을 통장을 무조건 적게 하고, 공급사가 바꾸면 관리자에게 '공급사가 변경했다' 알림 로그").
-- 구조 변경만 합니다: 새 표 1개를 만들고, 기존 표와 기존 데이터는 바꾸지 않습니다.
--
-- supplier_profile_changes: 공급사가 공급사 센터에서 사업자등록번호·정산 계좌를 등록하거나 바꿀 때마다 1행.
--   fields   바뀐 칸(JSON 배열: "businessNumber" · "bank")
--   summary  바뀌기 전 → 후(JSON). 계좌는 은행·끝 4자리·예금주만 남기고 전체 계좌번호는 남기지 않습니다.
--   checkedAt/checkedBy  관리자가 알림을 '확인'한 때·사람(비어 있으면 관리자 화면에 새 알림으로 보임)
-- 값 자체(사업자등록번호 = suppliers.businessNumber, 정산 계좌 = baljuora_sync_store "supplier_bank_accounts")는 원래 자리에 저장합니다.

CREATE TABLE IF NOT EXISTS supplier_profile_changes (
  id TEXT PRIMARY KEY NOT NULL,
  supplierId TEXT NOT NULL,
  supplierName TEXT NOT NULL,
  changedBy TEXT,
  fields TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '{}',
  checkedAt TEXT,
  checkedBy TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_supplier_profile_changes_created ON supplier_profile_changes (createdAt);
CREATE INDEX IF NOT EXISTS idx_supplier_profile_changes_unchecked ON supplier_profile_changes (checkedAt, createdAt);
CREATE INDEX IF NOT EXISTS idx_supplier_profile_changes_supplier ON supplier_profile_changes (supplierId, createdAt);
