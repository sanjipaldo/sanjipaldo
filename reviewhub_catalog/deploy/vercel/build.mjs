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
// 운영 배포면 관리자가 요청한 1회성 데이터 작업을 한 번 돌립니다(apps/server/services/deploy-tasks.ts, 작업마다 한 번만).
// 결과와 상관없이 배포는 계속합니다.
if (process.env.VERCEL_ENV === "production" && process.env.TURSO_DATABASE_URL) {
  spawnSync("node", [path.join(root, "deploy/vercel/run-deploy-tasks.mjs")], { cwd: root, stdio: "inherit", env: process.env });
}
