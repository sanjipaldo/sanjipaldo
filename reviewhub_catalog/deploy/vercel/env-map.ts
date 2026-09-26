// Vercel Turso 연동이 넣어 주는 변수(TURSO_*)를 서버가 읽는 SKYBASE_DB_* 이름으로 옮깁니다.
// 서버 환경 모듈보다 먼저 import되어야 합니다(entry.ts 첫 줄).
const tursoUrl = process.env.TURSO_DATABASE_URL;
if (!process.env.SKYBASE_DB_ENDPOINT && tursoUrl) {
  process.env.SKYBASE_DB_ENDPOINT = tursoUrl.replace(/^libsql:\/\//, "https://");
}
if (!process.env.SKYBASE_DB_AUTH_TOKEN && process.env.TURSO_AUTH_TOKEN) {
  process.env.SKYBASE_DB_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;
}
if (!process.env.SKYBASE_DB_NAMESPACE && tursoUrl) {
  process.env.SKYBASE_DB_NAMESPACE = "prod";
}
