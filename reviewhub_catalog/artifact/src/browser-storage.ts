// apps/server/services/s3_storage.ts 대체 모듈: 업로드 이미지를 이 페이지의 파일 저장소(assets)에 올립니다.
export class StorageError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 500
  ) {
    super(message);
    this.name = "StorageError";
  }
}

type AssetsApi = { upload(blob: Blob): Promise<{ id: string; url: string; sizeBytes: number; contentType: string }> };

export async function storagePut(path: string, bytes: Uint8Array, contentType: string, _options?: { userId?: string }) {
  const claude = (window as unknown as { claude?: { use(name: string): Promise<unknown> } }).claude;
  const assets = (await claude?.use("assets")) as AssetsApi | null | undefined;
  if (!assets) throw new StorageError("STORAGE_UNAVAILABLE", "이 화면에서는 이미지를 올릴 수 없습니다. 이미지 URL을 직접 입력해 주세요.", 503);
  try {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const asset = await assets.upload(new Blob([copy], { type: contentType }));
    const url = `/_blob/${asset.id}`;
    return { id: asset.id, path, contentType, size: asset.sizeBytes, downloadUrl: url, url };
  } catch (error) {
    const message = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : "업로드 실패";
    throw new StorageError("STORAGE_UPLOAD_FAILED", `이미지 업로드에 실패했습니다: ${message}`, 502);
  }
}
