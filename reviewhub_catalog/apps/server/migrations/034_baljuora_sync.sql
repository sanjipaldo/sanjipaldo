-- 034_baljuora_sync.sql — 발주오라 수동 동기화(2026-11-22, 관리자 요청 "DB센터에서 고치고 동기화 버튼을 누르면 발주오라 도매몰에도 똑같이")
-- 구조 변경만 합니다: 새 표 2개를 만들고, 기존 표의 데이터는 바꾸지 않습니다.
--
-- baljuora_sync_jobs: 동기화 작업 1건 = 관리자가 만든 "비교(불러오기)" 또는 "보내기" 작업.
--   발주오라 로그인에 사람 확인(Cloudflare)이 있어 서버가 대신 로그인하지 않습니다. 관리자가 로그인해 둔 발주오라 관리자 창에서
--   책갈피 "두고푸드 동기화"를 누르면 그 창이 작업 코드(codeHash = 코드의 SHA-256)로 작업 내용을 받아 실행하고 결과를 돌려줍니다.
-- baljuora_sync_store: 동기화 설정(카테고리 연결·수강생 그룹 이름 등)과 마지막 비교 결과(발주오라 카테고리·발주오라에만 있는 상품).
--   매입원가가 들어 있어 공개 단가표가 내보내는 content_settings에 두지 않습니다.

CREATE TABLE IF NOT EXISTS baljuora_sync_jobs (
  id TEXT PRIMARY KEY,
  codeHash TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  plan TEXT NOT NULL,
  progress TEXT,
  summary TEXT,
  results TEXT,
  diagnostics TEXT,
  createdBy TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  startedAt TEXT,
  finishedAt TEXT,
  expiresAt TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_baljuora_sync_jobs_code ON baljuora_sync_jobs (codeHash);
CREATE INDEX IF NOT EXISTS idx_baljuora_sync_jobs_created ON baljuora_sync_jobs (createdAt);

CREATE TABLE IF NOT EXISTS baljuora_sync_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
