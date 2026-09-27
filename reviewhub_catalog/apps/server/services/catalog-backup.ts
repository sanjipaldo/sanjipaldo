// DB 백업: 운영 데이터 표 전체를 JSON으로 묶어 gzip으로 압축합니다.
// - 로그인 계정·세션(user, session, account, verification)과 발주오라 API 키(integration_connections)는 제외합니다.
// - 새 표가 생기면 자동으로 포함됩니다(sqlite_master 기준).
// - 자동 백업은 매일 1회(Vercel Cron) 비공개 저장소에 저장하고 최근 KEEP_DAYS개만 남깁니다.
import { executeSql } from "../_core/db";
import { deleteBackupFiles, listBackupFiles, saveBackupFile, type BackupFile } from "./backup_storage";

const EXCLUDED_TABLES = new Set(["user", "session", "account", "verification", "integration_connections"]);
export const KEEP_DAYS = 30;

type BackupTable = { columns: string[]; rows: unknown[][] };

export type CatalogBackup = {
  format: "doogofood-db-backup";
  version: 1;
  createdAt: string;
  tables: Record<string, BackupTable>;
};

function quoteIdent(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

function toJsonValue(value: unknown) {
  if (typeof value === "bigint") return Number(value);
  if (value instanceof ArrayBuffer) {
    let binary = "";
    for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
    return { base64: btoa(binary) };
  }
  return value;
}

export async function buildCatalogBackup(): Promise<CatalogBackup> {
  const tableResult = await executeSql(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'libsql_%' ORDER BY name"
  );
  const names = tableResult.rows.map((row) => String(row.name)).filter((name) => !EXCLUDED_TABLES.has(name));
  const tables: Record<string, BackupTable> = {};
  for (const name of names) {
    const result = await executeSql(`SELECT * FROM ${quoteIdent(name)}`);
    tables[name] = {
      columns: result.columns,
      rows: result.rows.map((row) => result.columns.map((_, index) => toJsonValue(row[index])))
    };
  }
  return { format: "doogofood-db-backup", version: 1, createdAt: new Date().toISOString(), tables };
}

export async function gzipJson(value: unknown): Promise<Uint8Array> {
  const source = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(source).arrayBuffer());
}

export function backupSummary(backup: CatalogBackup) {
  return Object.fromEntries(Object.entries(backup.tables).map(([name, table]) => [name, table.rows.length]));
}

function seoulStamp(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}${get("month")}${get("day")}-${get("hour")}${get("minute")}`;
}

export function backupFileName(date = new Date()) {
  return `doogofood-db-${seoulStamp(date)}.json.gz`;
}

// 백업을 만들어 저장소에 올리고, 오래된 백업을 정리합니다.
export async function runStoredBackup(): Promise<{ file: BackupFile; tables: Record<string, number>; removed: number }> {
  const backup = await buildCatalogBackup();
  const body = await gzipJson(backup);
  const file = await saveBackupFile(`db-backups/${backupFileName(new Date(backup.createdAt))}`, body);
  const files = await listBackupFiles();
  const stale = files.slice(KEEP_DAYS).map((item) => item.pathname);
  await deleteBackupFiles(stale);
  return { file, tables: backupSummary(backup), removed: stale.length };
}
