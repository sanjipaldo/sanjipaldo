-- 031: 농수산물 백과사전 "기기 옮기기 코드" 저장 표를 추가합니다(구조 변경만, 기존 데이터 값 변경 없음).
-- code: 6자리 코드(헷갈리는 0·O·1·I·L 제외), payload: 내 후보·산지 확인 체크리스트 JSON(이름·연락처·IP 같은 개인정보는 저장하지 않음)
CREATE TABLE IF NOT EXISTS encyclopedia_saves (
  code TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
