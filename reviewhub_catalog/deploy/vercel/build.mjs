// Vercel 빌드 명령: 화면(apps/client/dist)과 서버 함수 번들(.vercel-server/handler.mjs)을 만듭니다.
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const run = (cmd, args, cwd = root) => {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run("pnpm", ["--filter", "client", "build"]);
run(path.join(root, "node_modules/.bin/vite"), ["build", "--config", path.join(root, "deploy/vercel/vite.config.ts")], path.join(root, "apps/server"));
