// Vercel 빌드 명령: 화면(apps/client/dist)과 서버 함수 번들(.vercel-server/handler.mjs)을 만듭니다.
// 운영 배포이고 Turso 연동 변수가 있으면 빌드 전에 새 마이그레이션만 적용합니다(이미 적용된 파일은 건너뜀).
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const run = (cmd, args, cwd = root) => {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

if (process.env.VERCEL_ENV === "production" && process.env.TURSO_DATABASE_URL) {
  run("node", [path.join(root, "deploy/vercel/migrate-db.mjs"), "--yes"]);
}
run("pnpm", ["--filter", "client", "build"]);
run(path.join(root, "node_modules/.bin/vite"), ["build", "--config", path.join(root, "deploy/vercel/vite.config.ts")], path.join(root, "apps/server"));
