// 농수산물 백과사전 기기 옮기기 코드: POST/GET/PUT /api/catalog/encyclopedia/sync[/:code]
// - 로그인 없이 코드를 만들고(6자리, 0·O·1·I·L 없음), 그 코드로 다른 기기에서 불러오고 고칩니다.
// - 형식이 틀린 내용·코드는 거절하고, 이름·연락처·IP 같은 개인정보는 저장하지 않습니다.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../_core/create-app";
import { executeSql } from "../_core/db";
import { applyMigrations, resetDatabase } from "../_test/helpers";
import { SYNC_CODE_ALPHABET, allowSyncCreate, normalizeSyncCode, randomSyncCode } from "../services/encyclopedia-sync";

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await resetDatabase();
  await executeSql("DELETE FROM encyclopedia_saves");
});

function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return app.fetch(new Request(`http://localhost/api/catalog${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  }));
}

describe("백과사전 기기 옮기기 코드", () => {
  it("코드를 만들고, 다른 기기에서 불러오고, 고친 내용을 저장합니다", async () => {
    const created = await call("POST", "/encyclopedia/sync", { favorites: ["apple-fuji", "mandarin"], checks: { "apple-fuji": [true, false, true] } }, { "x-forwarded-for": "203.0.113.10" });
    expect(created.status).toBe(201);
    const { data } = await created.json() as { data: { code: string; favorites: string[]; updatedAt: string } };
    expect(data.code).toMatch(new RegExp(`^[${SYNC_CODE_ALPHABET}]{6}$`));
    expect(data.favorites).toEqual(["apple-fuji", "mandarin"]);

    // 소문자·띄어쓰기로 입력해도 같은 코드
    const loaded = await call("GET", `/encyclopedia/sync/${data.code.slice(0, 3).toLowerCase()} ${data.code.slice(3)}`);
    expect(loaded.status).toBe(200);
    const loadedBody = await loaded.json() as { data: { favorites: string[]; checks: Record<string, boolean[]> } };
    expect(loadedBody.data.favorites).toEqual(["apple-fuji", "mandarin"]);
    expect(loadedBody.data.checks["apple-fuji"]).toEqual([true, false, true]);

    const updated = await call("PUT", `/encyclopedia/sync/${data.code}`, { favorites: ["kiwi"], checks: {} });
    expect(updated.status).toBe(200);
    const again = await (await call("GET", `/encyclopedia/sync/${data.code}`)).json() as { data: { favorites: string[] } };
    expect(again.data.favorites).toEqual(["kiwi"]);

    // 저장한 내용에는 접속 주소가 들어가지 않습니다.
    const stored = await executeSql("SELECT payload FROM encyclopedia_saves");
    expect(String(stored.rows[0]?.payload)).not.toContain("203.0.113.10");
  });

  it("없는 코드·틀린 형식·잘못된 내용은 거절합니다", async () => {
    expect((await call("GET", "/encyclopedia/sync/ABCDEF")).status).toBe(404);
    expect((await call("GET", "/encyclopedia/sync/12")).status).toBe(400);
    expect((await call("PUT", "/encyclopedia/sync/ABCDEF", { favorites: [], checks: {} })).status).toBe(404);
    expect((await call("POST", "/encyclopedia/sync", { favorites: ["<script>"], checks: {} })).status).toBe(400);
    expect((await call("POST", "/encyclopedia/sync", { favorites: [], checks: { kiwi: ["yes"] } })).status).toBe(400);
    expect((await call("POST", "/encyclopedia/sync", { favorites: Array.from({ length: 401 }, (_, index) => `item-${index}`), checks: {} })).status).toBe(400);
  });

  it("저장 표가 없는 DB(migration 031 전, 운영 DB를 쓰는 미리보기)에서는 DB 오류 문구 대신 안내를 돌려줍니다", async () => {
    const migration = readFileSync(fileURLToPath(new URL("../migrations/031_encyclopedia_saves.sql", import.meta.url)), "utf8");
    await executeSql("DROP TABLE encyclopedia_saves");
    try {
      for (const response of [
        await call("POST", "/encyclopedia/sync", { favorites: ["kiwi"], checks: {} }, { "x-forwarded-for": "192.0.2.44" }),
        await call("GET", "/encyclopedia/sync/ABCDEF"),
        await call("PUT", "/encyclopedia/sync/ABCDEF", { favorites: [], checks: {} })
      ]) {
        expect(response.status).toBe(503);
        const text = await response.text();
        expect(text).toContain("운영 배포 후");
        expect(text).not.toContain("no such table");
      }
    } finally {
      await executeSql(migration.split("\n").filter((line) => !line.startsWith("--")).join("\n"));
    }
    expect((await call("POST", "/encyclopedia/sync", { favorites: ["kiwi"], checks: {} }, { "x-forwarded-for": "192.0.2.45" })).status).toBe(201);
  });

  it("코드 형식 맞추기 · 헷갈리는 글자 없음 · 만들기 횟수 제한", () => {
    expect(normalizeSyncCode("ab-c 23x")).toBe("ABC23X");
    expect(normalizeSyncCode("ABC10O")).toBeNull();
    for (let index = 0; index < 50; index += 1) expect(randomSyncCode()).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    const start = Date.UTC(2026, 10, 12);
    for (let index = 0; index < 20; index += 1) expect(allowSyncCreate("198.51.100.7", start + index)).toBe(true);
    expect(allowSyncCreate("198.51.100.7", start + 30)).toBe(false);
    expect(allowSyncCreate("198.51.100.7", start + 61 * 60 * 1000)).toBe(true);
  });
});
