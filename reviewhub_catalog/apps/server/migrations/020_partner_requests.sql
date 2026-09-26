-- 020: 입점 신청(농가·수산·브랜드사)을 소싱 요청과 같은 테이블에 받기 위한 칸 추가
ALTER TABLE sourcing_requests ADD COLUMN requestType TEXT NOT NULL DEFAULT 'sourcing';
ALTER TABLE sourcing_requests ADD COLUMN companyName TEXT;
ALTER TABLE sourcing_requests ADD COLUMN email TEXT;
ALTER TABLE sourcing_requests ADD COLUMN businessType TEXT;
ALTER TABLE sourcing_requests ADD COLUMN emailStatus TEXT;
ALTER TABLE sourcing_requests ADD COLUMN emailSentAt TEXT;
CREATE INDEX IF NOT EXISTS idx_sourcing_requests_type ON sourcing_requests (requestType, createdAt);
