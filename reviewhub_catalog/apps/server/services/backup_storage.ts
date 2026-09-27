// 백업 파일 저장소 기본 모듈: Skywork 등 별도 저장소가 없는 환경에서는 "저장소 없음"으로 응답합니다.
// Vercel 배포에서는 deploy/vercel/vite.config.ts가 이 모듈을 비공개 Vercel Blob 모듈(backup-storage.ts)로 바꿔 끼웁니다.
// 관리자 화면의 "지금 내려받기"는 저장소 없이도 동작합니다.

import { BackupStorageError, type BackupFile } from "./backup_storage.shared";

export { BackupStorageError, type BackupFile };

export function isBackupStorageConfigured() {
  return false;
}

function notConfigured(): never {
  throw new BackupStorageError("BACKUP_STORAGE_NOT_CONFIGURED", "자동 백업 저장소가 연결되지 않았습니다.", 503);
}

export async function saveBackupFile(_pathname: string, _body: Uint8Array): Promise<BackupFile> {
  return notConfigured();
}

export async function listBackupFiles(): Promise<BackupFile[]> {
  return notConfigured();
}

export async function readBackupFile(_pathname: string): Promise<Uint8Array> {
  return notConfigured();
}

export async function deleteBackupFiles(_pathnames: string[]): Promise<void> {
  return notConfigured();
}
