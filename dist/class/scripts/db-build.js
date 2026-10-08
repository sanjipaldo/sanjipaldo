/* Vercel 빌드 단계 — 데이터베이스 준비
 *  운영(production) 배포: 표 만들기 → 지금 데이터 백업 → 비어 있으면 체험 데이터 넣기
 *    → 요청받은 일회성 작업(oneoff.js, 한 번만) → 새 기본값 채우기(빠진 칸만, 저장된 내용은 그대로)
 *  미리보기 배포: 연결만 확인 (운영 데이터를 바꾸지 않음)
 * 실패하면 빌드가 멈춰서, 데이터베이스에 문제가 있을 때 잘못된 버전이 운영에 올라가지 않는다. */
"use strict";
const store = require("../api/_lib/store");
const init = require("../api/_lib/init");

(async () => {
  const onVercel = !!process.env.VERCEL;
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    if (onVercel) { console.error("[db] TURSO_DATABASE_URL / TURSO_AUTH_TOKEN 환경변수가 없어요. Vercel 프로젝트에 Turso 를 연결해 주세요."); process.exit(1); }
    console.log("[db] 데이터베이스 환경변수가 없어 건너뜁니다 (로컬)");
    return;
  }
  const prod = process.env.VERCEL_ENV === "production";
  console.log("[db] Turso 연결 확인 중… (" + (process.env.VERCEL_ENV || "local") + ")");
  const before = await store.countDocs();
  console.log("[db] 저장된 문서 " + before + "개");
  if (!process.env.MASTER_PASSWORD) console.warn("[db] 주의: MASTER_PASSWORD 환경변수가 없어 마스터 로그인이 막혀 있어요.");
  if (!prod) { console.log("[db] 미리보기 배포라 데이터는 바꾸지 않아요."); return; }
  const b = await store.backup("배포 전 자동 백업" + (process.env.VERCEL_GIT_COMMIT_SHA ? " (" + process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) + ")" : ""));
  console.log("[db] 배포 전 백업: " + (b ? "문서 " + b.docs + "개 · " + Math.round(b.size / 1024) + "KB" : "비어 있어 건너뜀"));
  if (await init.ensureSeeded()) console.log("[db] 비어 있어서 체험 데이터로 시작했어요 (" + (await store.countDocs()) + "개)");
  const ran = await init.runPendingOps((op, ok, result, n) => console.log("[db] 일회성 작업 " + op.id + " — " + op.note + ": " + (ok ? "완료" : "일부 겹쳐 다음 배포 때 다시") + " · 문서 " + n + "개 · " + JSON.stringify(result)));
  if (!ran.length) console.log("[db] 새로 할 일회성 작업 없음");
  const m = await init.migrate();
  console.log("[db] 빠진 기본값 채우기: " + (m.changed.length ? m.changed.join(", ") : "바뀐 것 없음"));
})().catch((e) => { console.error("[db] 실패:", e && e.message ? e.message : e); process.exit(1); });
