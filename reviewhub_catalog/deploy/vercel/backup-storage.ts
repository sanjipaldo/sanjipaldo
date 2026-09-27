// Vercel 배포용 apps/server/services/backup_storage.ts 대체 모듈.
// DB 백업은 원가 등 비공개 정보가 있어 공개 이미지 저장소와 분리된 "비공개" Blob 저장소(doogofood-backups)에 둡니다.
// 저장소 연결 시 만든 BACKUP_READ_WRITE_TOKEN 환경변수를 사용합니다.
import { del, get, list, put } from "@vercel/blob";
import { BackupStorageError, type BackupFile } from "../../apps/server/services/backup_storage.shared";

export { BackupStorageError, type BackupFile };

const PREFIX = "db-backups/";

function token() {
  const value = process.env.BACKUP_READ_WRITE_TOKEN?.trim();
  if (!value) throw new BackupStorageError("BACKUP_STORAGE_NOT_CONFIGURED", "자동 백업 저장소가 연결되지 않았습니다.", 503);
  return value;
}

function assertBackupPath(pathname: string) {
  if (!pathname.startsWith(PREFIX) || pathname.includes("..")) {
    throw new BackupStorageError("BACKUP_NOT_FOUND", "백업 파일을 찾을 수 없습니다.", 404);
  }
}

export function isBackupStorageConfigured() {
  return Boolean(process.env.BACKUP_READ_WRITE_TOKEN?.trim());
}

export async function saveBackupFile(pathname: string, body: Uint8Array): Promise<BackupFile> {
  assertBackupPath(pathname);
  try {
    const blob = await put(pathname, Buffer.from(body), {
      access: "private",
      contentType: "application/gzip",
      addRandomSuffix: false,
      allowOverwrite: true,
      token: token()
    });
    return { pathname: blob.pathname, size: body.byteLength, uploadedAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof BackupStorageError) throw error;
    throw new BackupStorageError("BACKUP_UPLOAD_FAILED", `백업 저장에 실패했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
  }
}

export async function listBackupFiles(): Promise<BackupFile[]> {
  const files: BackupFile[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: PREFIX, cursor, limit: 1000, token: token() });
    for (const blob of page.blobs) {
      files.push({ pathname: blob.pathname, size: blob.size, uploadedAt: new Date(blob.uploadedAt).toISOString() });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return files.sort((a, b) => b.pathname.localeCompare(a.pathname));
}

export async function readBackupFile(pathname: string): Promise<Uint8Array> {
  assertBackupPath(pathname);
  const result = await get(pathname, { access: "private", useCache: false, token: token() });
  if (!result?.stream) throw new BackupStorageError("BACKUP_NOT_FOUND", "백업 파일을 찾을 수 없습니다.", 404);
  return new Uint8Array(await new Response(result.stream).arrayBuffer());
}

export async function deleteBackupFiles(pathnames: string[]): Promise<void> {
  if (pathnames.length === 0) return;
  pathnames.forEach(assertBackupPath);
  await del(pathnames, { token: token() });
}
