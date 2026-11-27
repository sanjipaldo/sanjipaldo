// 운영 빌드 끝에 한 번: 방금 만든 서버 번들(.vercel-server/handler.mjs)의 runDeployTasks()를 부릅니다
// (관리자가 요청한 1회성 데이터 작업 — apps/server/services/deploy-tasks.ts). 실패하거나 오래 걸려도 배포는 계속합니다.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LIMIT_MS = 14 * 60_000;
const timer = setTimeout(() => {
  console.error("[deploy-tasks] 시간이 오래 걸려 여기서 멈춥니다(배포는 계속, 남은 일은 관리자 화면에서 이어서).");
  process.exit(0);
}, LIMIT_MS);

try {
  const handler = await import(pathToFileURL(path.join(root, ".vercel-server/handler.mjs")).href);
  if (typeof handler.runDeployTasks === "function") {
    const results = await handler.runDeployTasks();
    console.log(`[deploy-tasks] 결과 ${JSON.stringify(results)}`);
  } else {
    console.log("[deploy-tasks] 할 일이 없습니다.");
  }
} catch (error) {
  console.error(`[deploy-tasks] 실패(배포는 계속): ${error instanceof Error ? error.message : String(error)}`);
}
clearTimeout(timer);
process.exit(0);
