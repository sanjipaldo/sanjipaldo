// apps/server/_core/db.ts 대체 모듈(브라우저 전용). 같은 이름의 export를 유지하므로 서비스 코드는 수정 없이 동작합니다.
import type { Database } from "sql.js";
import { construct } from "drizzle-orm/libsql/driver-core";
import * as schema from "../../apps/server/db/schema";
import { createSqliteClient, type ResultSet } from "./sqlite-client";

export type DatabaseErrorCode = "DATABASE_UNCONFIGURED" | "DATABASE_QUERY_FAILED";

export class DatabaseError extends Error {
  constructor(
    readonly code: DatabaseErrorCode,
    message: string,
    readonly status = 500
  ) {
    super(message);
    this.name = "DatabaseError";
  }
}

export type SqlArgs = Array<string | number | bigint | boolean | null>;
export type QueryResult = ResultSet;

let database: Database | null = null;

export function setDatabase(next: Database) {
  database = next;
}

export function getSqlDatabase() {
  if (!database) throw new DatabaseError("DATABASE_UNCONFIGURED", "데이터를 불러오는 중입니다.", 503);
  return database;
}

const client = createSqliteClient(getSqlDatabase);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = construct(client as any, { schema });

export function isDatabaseConfigured() {
  return database !== null;
}

export function getDb() {
  getSqlDatabase();
  return db;
}

export async function checkDatabaseHealth() {
  await executeSql("select 1 as ok");
  return { ok: true };
}

export async function executeSql(sql: string, args?: SqlArgs): Promise<QueryResult> {
  try {
    return await client.execute({ sql, args });
  } catch (error) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", error instanceof Error ? error.message : "query failed", 502);
  }
}
