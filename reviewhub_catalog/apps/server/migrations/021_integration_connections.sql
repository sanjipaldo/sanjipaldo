-- 021: 발주오라 오픈 API 연결 설정(몰 ID·API 키 암호문·API 주소·연결 상태·자동 동기화 방향)
-- 비밀번호는 저장하지 않습니다. API 키는 서버 비밀값으로 암호화(AES-GCM)해 저장하고 끝 4자리만 표시합니다.
CREATE TABLE IF NOT EXISTS integration_connections (
  provider TEXT PRIMARY KEY,
  mallId TEXT,
  username TEXT,
  apiBaseUrl TEXT,
  apiKeyCipher TEXT,
  apiKeyLast4 TEXT,
  status TEXT NOT NULL DEFAULT 'not_configured',
  lastVerifiedAt TEXT,
  lastError TEXT,
  autoPush INTEGER NOT NULL DEFAULT 0,
  autoPull INTEGER NOT NULL DEFAULT 0,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
