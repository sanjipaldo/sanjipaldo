// 운영 배포 때 한 번만 하는 데이터 작업(마이그레이션처럼 운영 빌드가 부름: deploy/vercel/build.mjs → run-deploy-tasks.mjs).
// 관리자가 명시적으로 요청한 1회성 작업만 넣고, 작업마다 고유한 이름(taskKey)으로 한 번만 돌립니다(baljuora_sync_store align_all.deployTasks).
// 실패하거나 시간 안에 못 끝내도 배포는 계속하고, 결과는 빌드 기록과 관리자 화면에 남습니다.
import { runAlignOnDeploy } from "./baljuora-align";

export async function runDeployTasks() {
  if (process.env.VERCEL_ENV !== "production") return [{ skipped: "not a production build" }];
  return [
    // 2026-11-27 관리자 요청: 발주오라 2,998개 전체를 DB센터로 가져와 판매중·품절·미노출·전체 수를 똑같이(1차 맞추기)
    await runAlignOnDeploy({ taskKey: "2026-11-27-baljuora-align-all", maxMs: 12 * 60_000 })
  ];
}
