// Vercel 배포용 apps/server/services/s3_storage.ts 대체 모듈.
// Skywork 파일 게이트웨이 대신 Vercel Blob(공개 저장소)에 올리고, 공개 URL을 상품 이미지 주소로 돌려줍니다.
// vite.config.ts에서 서버 코드의 s3_storage import를 이 파일로 바꿔 끼웁니다.
import { apiFailure } from "@repo/shared/http";
import { del, head, put } from "@vercel/blob";

export type StorageFileStatus = "pending" | "uploaded" | "failed" | "deleted";

export type StoredFile = {
  id: string;
  key: string;
  path: string;
  url: string;
  downloadUrl: string;
  userId: string | null;
  fileName: string;
  fileSuffix: string;
  contentType: string;
  fileSize: number;
  status: StorageFileStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type StorageErrorStatus = 400 | 404 | 502 | 503;

export class StorageError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: StorageErrorStatus = 502
  ) {
    super(message);
    this.name = "StorageError";
  }
}

function assertConfigured() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new StorageError("STORAGE_NOT_CONFIGURED", "이미지 저장소(Vercel Blob)가 연결되지 않았습니다.", 503);
  }
}

function toStoredFile(pathname: string, url: string, contentType: string, size: number, userId: string | null): StoredFile {
  const fileName = pathname.split("/").pop() ?? pathname;
  const dot = fileName.lastIndexOf(".");
  const now = new Date().toISOString();
  return {
    id: url,
    key: pathname,
    path: pathname,
    url,
    downloadUrl: url,
    userId,
    fileName,
    fileSuffix: dot > 0 ? fileName.slice(dot + 1) : "",
    contentType,
    fileSize: size,
    status: "uploaded",
    createdAt: now,
    updatedAt: now
  };
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
  options: { userId?: string | null } = {}
): Promise<StoredFile> {
  assertConfigured();
  const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  if (body.byteLength <= 0) throw new StorageError("STORAGE_FILE_EMPTY", "파일 내용이 비어 있습니다.", 400);
  // 파일 이름의 한글·공백 등은 주소에서 깨지기 쉬워 안전한 문자만 남깁니다.
  const safeKey = relKey.replace(/^\/+/, "").replace(/[^A-Za-z0-9/._-]+/g, "-");
  try {
    const blob = await put(safeKey, body, { access: "public", contentType, addRandomSuffix: true });
    return toStoredFile(blob.pathname, blob.url, contentType, body.byteLength, options.userId ?? null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "업로드 실패";
    throw new StorageError("STORAGE_UPLOAD_FAILED", `이미지 업로드에 실패했습니다: ${message}`, 502);
  }
}

// 아래는 일반 파일 API(/api/storage)용: Blob URL을 파일 id로 씁니다.
export async function storageGet(id: string): Promise<StoredFile> {
  assertConfigured();
  try {
    const blob = await head(id);
    return toStoredFile(blob.pathname, blob.url, blob.contentType, blob.size, null);
  } catch {
    throw new StorageError("STORAGE_FILE_NOT_FOUND", "파일을 찾을 수 없습니다.", 404);
  }
}

export async function storageGetForUser(id: string, _userId: string): Promise<StoredFile> {
  return storageGet(id);
}

export async function storageDeleteForUser(id: string, userId: string): Promise<StoredFile> {
  const file = await storageGetForUser(id, userId);
  await del(file.url);
  return { ...file, status: "deleted" };
}

export async function storageGetByPath(path: string): Promise<StoredFile> {
  return storageGet(path);
}

export async function storageGetDownloadUrl(id: string): Promise<string> {
  return (await storageGet(id)).downloadUrl;
}

export function storageErrorResponse(error: StorageError | { code: string; message: string; status: number }) {
  const status: StorageErrorStatus =
    error.status === 404 ? 404 : error.status === 400 ? 400 : error.status === 503 ? 503 : 502;
  return { body: apiFailure(error.code, error.message), status };
}
