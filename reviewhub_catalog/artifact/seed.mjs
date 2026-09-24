// 마이그레이션 000~017로 새 SQLite DB를 만들고, 페이지 저장소에 넣을 조각 파일(JSON)을 만듭니다.
// 사용: node artifact/seed.mjs <출력폴더>
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const initSqlJs = require("sql.js");
const here = path.dirname(new URL(import.meta.url).pathname);
const out = path.resolve(process.argv[2] || path.join(here, "../.artifact-build/seed"));
const SEGMENT = 160 * 1024;

const SQL = await initSqlJs();
const db = new SQL.Database();
const migrationsDir = path.join(here, "../apps/server/migrations");
for (const name of fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
  db.exec(fs.readFileSync(path.join(migrationsDir, name), "utf8"));
}
// 로그인은 claude.ai 편집 권한으로 대체하므로 마이그레이션의 관리자 비밀번호 해시는 페이지 DB에 넣지 않습니다.
db.exec("UPDATE account SET password = NULL");
db.exec("VACUUM");
const full = db.export();

const scrub = fs.readFileSync(path.join(here, "src/persistence.ts"), "utf8").match(/PUBLIC_SCRUB_SQL = `([\s\S]*?)`/)[1];
const pubDb = new SQL.Database(full);
pubDb.exec(scrub);
pubDb.exec("VACUUM");
const pub = pubDb.export();

fs.rmSync(out, { recursive: true, force: true });
for (const [prefix, bytes] of [["full", full], ["pub", pub]]) {
  const dir = path.join(out, prefix);
  fs.mkdirSync(dir, { recursive: true });
  const segments = [];
  for (let offset = 0; offset < bytes.length; offset += SEGMENT) {
    const segment = bytes.subarray(offset, offset + SEGMENT);
    const hash = crypto.createHash("sha256").update(segment).digest("hex").slice(0, 32);
    segments.push(hash);
    fs.writeFileSync(path.join(dir, `${hash}.json`), JSON.stringify({ d: zlib.gzipSync(segment).toString("base64"), n: segment.length }));
  }
  const meta = { version: 1, segments, size: bytes.length, savedAt: new Date().toISOString(), previous: [] };
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta));
  const count = (sql) => new SQL.Database(bytes).exec(sql)[0].values[0][0];
  console.log(prefix, `bytes=${bytes.length}`, `segments=${segments.length}`, `products=${count("select count(*) from products")}`, `costNonZero=${count("select count(*) from products where costPrice<>0")}`, `users=${count("select count(*) from user")}`);
}
