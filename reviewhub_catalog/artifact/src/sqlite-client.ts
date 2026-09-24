// @libsql/client 호환 최소 클라이언트: drizzle-orm/libsql 세션이 쓰는 execute/batch/transaction만 sql.js 위에 구현합니다.
import type { Database, SqlValue } from "sql.js";

type Arg = string | number | bigint | boolean | null | undefined | Uint8Array | Date;
export type Stmt = string | { sql: string; args?: Arg[] | Record<string, Arg> };

export type ResultSet = {
  columns: string[];
  columnTypes: string[];
  rows: Record<string, unknown>[];
  rowsAffected: number;
  lastInsertRowid: bigint | undefined;
  toJSON(): unknown;
};

function toSqlValue(value: Arg): SqlValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  return value as SqlValue;
}

function makeRow(columns: string[], values: SqlValue[]) {
  const row: Record<string, unknown> = {};
  columns.forEach((column, index) => {
    Object.defineProperty(row, index, { value: values[index], enumerable: false });
    row[column] = values[index];
  });
  Object.defineProperty(row, "length", { value: values.length, enumerable: false });
  return row;
}

export function createSqliteClient(getDatabase: () => Database) {
  const run = (stmt: Stmt): ResultSet => {
    const db = getDatabase();
    const sql = typeof stmt === "string" ? stmt : stmt.sql;
    const rawArgs = typeof stmt === "string" ? undefined : stmt.args;
    const prepared = db.prepare(sql);
    try {
      if (Array.isArray(rawArgs)) prepared.bind(rawArgs.map(toSqlValue));
      else if (rawArgs) prepared.bind(Object.fromEntries(Object.entries(rawArgs).map(([key, value]) => [key.replace(/^[:@$]?/, ":"), toSqlValue(value)])));
      const columns = prepared.getColumnNames();
      const rows: Record<string, unknown>[] = [];
      while (prepared.step()) rows.push(makeRow(columns, prepared.get()));
      const rowsAffected = db.getRowsModified();
      return {
        columns,
        columnTypes: columns.map(() => ""),
        rows,
        rowsAffected,
        lastInsertRowid: undefined,
        toJSON: () => ({ columns, rows, rowsAffected })
      };
    } finally {
      prepared.free();
    }
  };

  const inTransaction = (statements: Stmt[]) => {
    getDatabase().run("BEGIN");
    try {
      const results = statements.map(run);
      getDatabase().run("COMMIT");
      return results;
    } catch (error) {
      getDatabase().run("ROLLBACK");
      throw error;
    }
  };

  return {
    closed: false,
    protocol: "file",
    async execute(stmt: Stmt, args?: Arg[]) {
      return run(typeof stmt === "string" && args ? { sql: stmt, args } : stmt);
    },
    async batch(statements: Stmt[]) {
      return inTransaction(statements);
    },
    async migrate(statements: Stmt[]) {
      return inTransaction(statements);
    },
    async executeMultiple(sql: string) {
      getDatabase().exec(sql);
    },
    async transaction() {
      getDatabase().run("BEGIN");
      let done = false;
      return {
        execute: async (stmt: Stmt) => run(stmt),
        batch: async (statements: Stmt[]) => statements.map(run),
        executeMultiple: async (sql: string) => { getDatabase().exec(sql); },
        commit: async () => { if (!done) { done = true; getDatabase().run("COMMIT"); } },
        rollback: async () => { if (!done) { done = true; getDatabase().run("ROLLBACK"); } },
        close: () => { if (!done) { done = true; getDatabase().run("ROLLBACK"); } },
        closed: false
      };
    },
    close() {},
    sync: async () => undefined
  };
}
