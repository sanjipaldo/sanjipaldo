// 백업 저장소 공통 타입·오류: 기본 모듈과 Vercel 대체 모듈이 같은 오류 클래스를 쓰도록 분리했습니다.

export type BackupFile = {
  pathname: string;
  size: number;
  uploadedAt: string;
};

export class BackupStorageError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 404 | 502 | 503 = 502
  ) {
    super(message);
    this.name = "BackupStorageError";
  }
}
