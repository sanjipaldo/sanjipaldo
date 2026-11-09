// 관리자 > 입점·소싱 요청의 "삭제": DELETE /api/catalog/admin/sourcing/:id
// - 로그인 없으면 401, 일반 계정은 403(관리자 인증을 약화시키지 않음)
// - 입점 신청을 지우면 진행 단계·계약 조건(partner_deals)도 함께 지우고, 다른 신청은 그대로 둡니다.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../_core/create-app";
import { executeSql } from "../_core/db";
import { applyMigrations, fetchWithAuth, resetDatabase, signUpAndGetToken } from "../_test/helpers";

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await resetDatabase();
  await executeSql("DELETE FROM partner_deals");
  await executeSql("DELETE FROM sourcing_requests");
  const now = "2026-11-09T01:00:00.000Z";
  const insert = "INSERT INTO sourcing_requests (id, productName, requesterName, contact, requestType, companyName, email, businessType, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
  await executeSql(insert, ["partner-test", "테스트 상품", "문대표", "010-0000-0000", "partner", "문대표_테스트", "test@example.com", "농가", "completed", now, now]);
  await executeSql(insert, ["partner-real", "사과즙", "김담당", "010-1111-2222", "partner", "봄날농원", "real@example.com", "농가", "received", now, now]);
  await executeSql(insert, ["sourcing-test", "제주 감귤 5kg", "하루마켓", "010-3333-4444", "sourcing", null, null, null, "received", now, now]);
  await executeSql("INSERT INTO partner_deals (requestId, stage, history, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)", ["partner-test", "declined", "[]", now, now]);
  await executeSql("INSERT INTO partner_deals (requestId, stage, history, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)", ["partner-real", "contacted", "[]", now, now]);
});

async function adminToken() {
  const user = await signUpAndGetToken(app);
  await executeSql("UPDATE user SET role = ?, emailVerified = 1 WHERE id = ?", ["admin", user.userId!]);
  return user.token;
}

async function ids(table: "sourcing_requests" | "partner_deals") {
  const column = table === "sourcing_requests" ? "id" : "requestId";
  const result = await executeSql(`SELECT ${column} AS id FROM ${table} ORDER BY ${column}`);
  return result.rows.map((row) => String(row.id));
}

describe("DELETE /api/catalog/admin/sourcing/:id", () => {
  it("로그인 없이 지우려 하면 401이고 아무것도 지우지 않습니다", async () => {
    const res = await app.fetch(new Request("http://localhost/api/catalog/admin/sourcing/partner-test", { method: "DELETE" }));
    expect(res.status).toBe(401);
    expect(await ids("sourcing_requests")).toEqual(["partner-real", "partner-test", "sourcing-test"]);
  });

  it("관리자가 아닌 계정은 403이고 아무것도 지우지 않습니다", async () => {
    const user = await signUpAndGetToken(app);
    const res = await fetchWithAuth(app, user.token, "/api/catalog/admin/sourcing/partner-test", { method: "DELETE" });
    expect(res.status).toBe(403);
    expect(await ids("sourcing_requests")).toHaveLength(3);
  });

  it("입점 신청을 지우면 진행 단계 기록도 함께 지우고, 다른 신청은 그대로 둡니다", async () => {
    const token = await adminToken();
    const res = await fetchWithAuth(app, token, "/api/catalog/admin/sourcing/partner-test", { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data?: { deleted?: { id: string; requestType: string } } };
    expect(body.data?.deleted).toEqual({ id: "partner-test", requestType: "partner" });
    expect(await ids("sourcing_requests")).toEqual(["partner-real", "sourcing-test"]);
    expect(await ids("partner_deals")).toEqual(["partner-real"]);
  });

  it("소싱 요청도 지울 수 있고, 없는 id는 404입니다", async () => {
    const token = await adminToken();
    const res = await fetchWithAuth(app, token, "/api/catalog/admin/sourcing/sourcing-test", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await ids("sourcing_requests")).toEqual(["partner-real", "partner-test"]);
    const again = await fetchWithAuth(app, token, "/api/catalog/admin/sourcing/sourcing-test", { method: "DELETE" });
    expect(again.status).toBe(404);
  });
});
