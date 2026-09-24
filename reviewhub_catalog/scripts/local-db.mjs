// 로컬 개발 전용 DB 준비 스크립트 (Skywork 배포 흐름과 무관).
// - 로컬 sqld(LibSQL 서버)에 apps/server/migrations/*.sql 을 번호 순서대로 적용합니다.
// - LOCAL_ADMIN_PASSWORD 가 있으면 로컬 DB의 admin 계정 비밀번호만 해당 값으로 바꿉니다.
// localhost 엔드포인트가 아니면 실행을 거부하여 운영 DB를 건드리지 않습니다.
import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const serverRequire = createRequire(new URL("../apps/server/package.json", import.meta.url));
const { createClient } = serverRequire("@libsql/client");
const { hashPassword } = await import(serverRequire.resolve("better-auth/crypto"));

const url = process.env.SKYBASE_DB_ENDPOINT || "http://127.0.0.1:8080";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) {
  console.error(`[local-db] 로컬 엔드포인트만 허용됩니다: ${url}`);
  process.exit(1);
}

const db = createClient({ url, authToken: process.env.SKYBASE_DB_AUTH_TOKEN || process.env.SKYBASE_DB_TOKEN });
const migrationsDir = fileURLToPath(new URL("../apps/server/migrations/", import.meta.url));

await db.execute(
  "CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY, appliedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
);
const applied = new Set((await db.execute("SELECT name FROM _local_migrations")).rows.map((row) => String(row.name)));
const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();

for (const name of files) {
  if (applied.has(name)) continue;
  const sql = await readFile(`${migrationsDir}${name}`, "utf8");
  await db.executeMultiple(sql);
  await db.execute({ sql: "INSERT INTO _local_migrations (name) VALUES (?)", args: [name] });
  console.log(`[local-db] applied ${name}`);
}

if (process.env.LOCAL_ADMIN_PASSWORD) {
  const hash = await hashPassword(process.env.LOCAL_ADMIN_PASSWORD);
  await db.execute({
    sql: "UPDATE account SET password = ? WHERE providerId = 'credential' AND userId = 'reviewhub-master-admin'",
    args: [hash]
  });
  console.log("[local-db] 로컬 admin 비밀번호를 갱신했습니다.");
}

const products = await db.execute("SELECT COUNT(*) AS count FROM products");
console.log(`[local-db] 준비 완료 · products=${products.rows[0].count}`);
