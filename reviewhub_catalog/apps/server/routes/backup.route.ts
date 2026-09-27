import { Hono, type Context } from "hono";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { DatabaseError } from "../_core/db";
import { adminRoute } from "../_core/route-helpers";
import { BackupStorageError, isBackupStorageConfigured, listBackupFiles, readBackupFile } from "../services/backup_storage";
import { KEEP_DAYS, backupFileName, buildCatalogBackup, gzipJson, runStoredBackup } from "../services/catalog-backup";

// DB 백업 API (/api/backup)
// - GET  /cron                 : Vercel Cron 전용(Authorization: Bearer CRON_SECRET). 매일 자동 백업.
// - GET  /admin                : 관리자 — 자동 백업 목록
// - POST /admin/run            : 관리자 — 지금 백업해서 저장소에 저장
// - GET  /admin/export         : 관리자 — 지금 상태를 바로 내려받기(저장소 없이 동작)
// - GET  /admin/download?path= : 관리자 — 저장된 백업 내려받기
export const backupRouter = new Hono();

function failure(c: Context, error: unknown) {
  if (error instanceof BackupStorageError) return c.json(apiFailure(error.code, error.message), error.status);
  if (error instanceof DatabaseError) return c.json(apiFailure(error.code, error.message), error.status === 503 ? 503 : 502);
  throw error;
}

function sameSecret(given: string, expected: string) {
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < given.length; index += 1) diff |= given.charCodeAt(index) ^ expected.charCodeAt(index);
  return diff === 0;
}

function gzipDownload(c: Context, body: Uint8Array, filename: string) {
  return c.body(body as Uint8Array<ArrayBuffer>, 200, {
    "Content-Type": "application/gzip",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store"
  });
}

backupRouter.get("/cron", async (c) => {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return c.json(apiFailure("CRON_NOT_CONFIGURED", "CRON_SECRET이 설정되지 않았습니다."), 503);
  if (!sameSecret(c.req.header("Authorization") ?? "", `Bearer ${secret}`)) {
    return c.json(apiFailure("UNAUTHORIZED", "Unauthorized"), 401);
  }
  try {
    const result = await runStoredBackup();
    console.log(`[backup] 자동 백업 저장: ${result.file.pathname} (${result.file.size} bytes, 정리 ${result.removed}개)`);
    return c.json(apiSuccess(result));
  } catch (error) {
    console.error("[backup] 자동 백업 실패", error instanceof Error ? error.message : error);
    return failure(c, error);
  }
});

backupRouter.get("/admin", adminRoute, async (c) => {
  if (!isBackupStorageConfigured()) {
    return c.json(apiSuccess({ storageConfigured: false, keepDays: KEEP_DAYS, files: [] }));
  }
  try {
    return c.json(apiSuccess({ storageConfigured: true, keepDays: KEEP_DAYS, files: await listBackupFiles() }));
  } catch (error) {
    return failure(c, error);
  }
});

backupRouter.post("/admin/run", adminRoute, async (c) => {
  try {
    return c.json(apiSuccess(await runStoredBackup()));
  } catch (error) {
    return failure(c, error);
  }
});

backupRouter.get("/admin/export", adminRoute, async (c) => {
  try {
    const backup = await buildCatalogBackup();
    return gzipDownload(c, await gzipJson(backup), backupFileName(new Date(backup.createdAt)));
  } catch (error) {
    return failure(c, error);
  }
});

backupRouter.get("/admin/download", adminRoute, async (c) => {
  const path = c.req.query("path") ?? "";
  try {
    const body = await readBackupFile(path);
    return gzipDownload(c, body, path.split("/").pop() || "backup.json.gz");
  } catch (error) {
    return failure(c, error);
  }
});
