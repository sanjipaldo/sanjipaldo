// Vercel용 원격 DB(Turso 등 LibSQL) 준비: apps/server/migrations/*.sql을 번호 순서대로 한 번씩 적용합니다.
// 사용:
//   DB_URL=libsql://<db>.turso.io DB_TOKEN=<토큰> node deploy/vercel/migrate-db.mjs --yes
//   DB_URL/DB_TOKEN이 없으면 Vercel Turso 연동 변수(TURSO_DATABASE_URL/TURSO_AUTH_TOKEN)를 씁니다.
//   (선택) ADMIN_PASSWORD=<새 비밀번호> 를 함께 주면 admin 계정 비밀번호를 그 값으로 설정합니다.
import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const serverRequire = createRequire(new URL("../../apps/server/package.json", import.meta.url));
const { createClient } = serverRequire("@libsql/client");
const { hashPassword } = await import(serverRequire.resolve("better-auth/crypto"));

const url = process.env.DB_URL || process.env.TURSO_DATABASE_URL;
if (!url || !process.argv.includes("--yes")) {
  console.error("DB_URL(과 DB_TOKEN)을 지정하고 --yes 를 붙여 실행하세요. 운영 DB에 직접 적용됩니다.");
  process.exit(1);
}
const db = createClient({ url, authToken: process.env.DB_TOKEN || process.env.TURSO_AUTH_TOKEN });
const dir = fileURLToPath(new URL("../../apps/server/migrations/", import.meta.url));

await db.execute("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, appliedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
const applied = new Set((await db.execute("SELECT name FROM _migrations")).rows.map((row) => String(row.name)));
for (const name of (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort()) {
  if (applied.has(name)) continue;
  await db.executeMultiple(await readFile(`${dir}${name}`, "utf8"));
  await db.execute({ sql: "INSERT INTO _migrations (name) VALUES (?)", args: [name] });
  console.log(`적용: ${name}`);
}
if (process.env.ADMIN_PASSWORD) {
  await db.execute({
    sql: "UPDATE account SET password = ? WHERE providerId = 'credential' AND userId = 'reviewhub-master-admin'",
    args: [await hashPassword(process.env.ADMIN_PASSWORD)]
  });
  console.log("admin 비밀번호를 설정했습니다.");
}
const count = await db.execute("SELECT COUNT(*) AS count FROM products");
console.log(`완료 · 상품 ${count.rows[0].count}건`);
