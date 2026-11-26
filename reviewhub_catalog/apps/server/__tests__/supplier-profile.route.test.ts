// 공급사 필수 정보(사업자등록번호 · 정산 계좌, 2026-11-27): 공급사 센터 /me의 빠진 칸 → 저장(검증 숫자·계좌 칸 확인) →
// 거래명세서 To 칸에 바로 · 관리자 '공급사 정보 변경 알림'(계좌는 끝 4자리만) · 확인 · 권한 · migration 038 전 DB.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

process.env.SKYBASE_DB_ENDPOINT = `file:${join(mkdtempSync(join(tmpdir(), "supplier-profile-")), "test.db")}`;
const { default: app } = await import("../_core/create-app");
const { executeSql } = await import("../_core/db");
const { applyMigrations, fetchWithAuth, resetDatabase, signUpAndGetToken } = await import("../_test/helpers");

const SUPPLIER = "바른농장(테스트)";
const VALID_NUMBER = "220-81-62517"; // 검증 숫자가 맞는 번호
const WRONG_NUMBER = "220-81-62518"; // 마지막 자리만 틀림
const BANK = { bankName: "농협은행", accountNumber: "302-1234-5678-91", accountHolder: "바른농장" };

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await resetDatabase();
  await executeSql("DELETE FROM supplier_accounts");
  await executeSql("DELETE FROM supplier_profile_changes");
  await executeSql("DELETE FROM baljuora_sync_store WHERE key IN ('supplier_bank_accounts', 'supplier_settlement_settings')");
  await executeSql("DELETE FROM suppliers WHERE id = 'sup-p'");
  await executeSql("INSERT INTO suppliers (id, name, businessNumber, representative, isActive) VALUES ('sup-p', ?, NULL, '김바른', 1)", [SUPPLIER]);
});

async function adminToken() {
  const user = await signUpAndGetToken(app);
  await executeSql("UPDATE user SET role = ?, emailVerified = 1 WHERE id = ?", ["admin", user.userId!]);
  return user.token;
}

async function supplierToken(admin: string) {
  const created = await fetchWithAuth(app, admin, "/api/catalog/admin/suppliers/sup-p/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "barun", password: "barun1" })
  });
  expect(created.status).toBe(201);
  const res = await app.fetch(new Request("http://localhost/api/auth/sign-in/username", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ username: "barun", password: "barun1" })
  }));
  const token = res.headers.get("set-auth-token");
  expect(token).toBeTruthy();
  return token!;
}

async function call<T>(token: string | null, path: string, method = "GET", body?: unknown) {
  const init: RequestInit = body === undefined ? { method } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  const res = token ? await fetchWithAuth(app, token, path, init) : await app.fetch(new Request(`http://localhost${path}`, init));
  const payload = (await res.json().catch(() => ({}))) as { ok: boolean; data: T; error?: { message?: string } };
  return { status: res.status, ...payload };
}

const savePayout = (token: string, body: unknown) => call<any>(token, "/api/supplier/payout", "PUT", body);

describe("공급사 필수 정보(사업자등록번호 · 정산 계좌)", () => {
  it("빠진 칸이 /me에 → 틀린 번호·빈 계좌는 400 → 저장하면 빠진 칸 없음, 거래명세서 To 칸·입금 계좌에 바로 들어감", async () => {
    const admin = await adminToken();
    const supplier = await supplierToken(admin);

    const before = await call<any>(supplier, "/api/supplier/me");
    expect(before.status).toBe(200);
    expect(before.data.payout).toEqual({ businessNumber: null, bank: null, missing: ["businessNumber", "bank"] });

    const wrong = await savePayout(supplier, { businessNumber: WRONG_NUMBER, ...BANK });
    expect(wrong.status).toBe(400);
    expect(wrong.error?.message).toContain("다시 확인");
    const short = await savePayout(supplier, { businessNumber: "220-81-625", ...BANK });
    expect(short.status).toBe(400);
    expect(short.error?.message).toContain("10자리");
    const noBank = await savePayout(supplier, { businessNumber: VALID_NUMBER, bankName: "", accountNumber: "", accountHolder: "" });
    expect(noBank.status).toBe(400);
    expect(noBank.error?.message).toContain("정산 받을 계좌");
    const letters = await savePayout(supplier, { businessNumber: VALID_NUMBER, ...BANK, accountNumber: "302-12ab-5678" });
    expect(letters.status).toBe(400);
    expect(letters.error?.message).toContain("숫자와 붙임표");
    const noHolder = await savePayout(supplier, { businessNumber: VALID_NUMBER, ...BANK, accountHolder: " " });
    expect(noHolder.status).toBe(400);
    expect(noHolder.error?.message).toContain("예금주");
    expect((await call<any>(supplier, "/api/supplier/me")).data.payout.missing).toEqual(["businessNumber", "bank"]);

    // 붙임표 없이 써도 "123-45-67890" 모양으로 저장
    const saved = await savePayout(supplier, { businessNumber: "2208162517", ...BANK });
    expect(saved.status).toBe(200);
    expect(saved.data.payout).toEqual({ businessNumber: VALID_NUMBER, bank: BANK, missing: [], changed: ["businessNumber", "bank"] });
    const after = await call<any>(supplier, "/api/supplier/me");
    expect(after.data.payout).toEqual({ businessNumber: VALID_NUMBER, bank: BANK, missing: [] });
    expect(after.data.supplier.businessNumber).toBe(VALID_NUMBER);

    // 관리자 거래명세서: To 칸 사업자등록번호 · 입금 계좌, '없어요' 안내 없음
    const invoice = await call<any>(admin, `/api/baljuora/admin/settlements/invoice?kind=weekly&period=2026-11-16&supplier=${encodeURIComponent(SUPPLIER)}`);
    expect(invoice.status).toBe(200);
    expect(invoice.data.to).toMatchObject({ name: SUPPLIER, supplierId: "sup-p", businessNumber: VALID_NUMBER, ceoName: "김바른" });
    expect(invoice.data.bank).toEqual(BANK);
    expect(invoice.data.warnings.join(" ")).not.toMatch(/사업자등록번호가 비어|입금 계좌가 없어요/);

    // 관리자 알림: 1건(새 알림), 계좌는 끝 4자리만 — 전체 계좌번호는 기록·응답 어디에도 없음
    const summary = await call<any>(admin, "/api/catalog/admin/supplier-requests/summary");
    expect(summary.data.profileChanges).toBe(1);
    const list = await call<any>(admin, "/api/catalog/admin/supplier-profile-changes");
    expect(list.status).toBe(200);
    expect(list.data).toMatchObject({ available: true, unchecked: 1 });
    expect(list.data.changes).toHaveLength(1);
    expect(list.data.changes[0]).toMatchObject({
      supplierId: "sup-p",
      supplierName: SUPPLIER,
      changedBy: "barun",
      fields: ["businessNumber", "bank"],
      summary: {
        businessNumber: { before: null, after: VALID_NUMBER },
        bank: { before: null, after: "농협은행 ···7891 (예금주 바른농장)" }
      },
      checkedAt: null,
      checkedBy: null
    });
    expect(JSON.stringify(list.data)).not.toMatch(/302-1234|3021234|5678-91/);
    const raw = await executeSql("SELECT summary FROM supplier_profile_changes");
    expect(JSON.stringify(raw)).not.toMatch(/302-1234|3021234|5678-91/);
  });

  it("같은 값으로 다시 저장하면 기록이 늘지 않고, 계좌만 바꾸면 '정산 계좌 변경' 한 줄, 확인하면 알림 0", async () => {
    const admin = await adminToken();
    const supplier = await supplierToken(admin);
    expect((await savePayout(supplier, { businessNumber: VALID_NUMBER, ...BANK })).status).toBe(200);
    const same = await savePayout(supplier, { businessNumber: VALID_NUMBER, ...BANK });
    expect(same.data.payout.changed).toEqual([]);
    expect((await call<any>(admin, "/api/catalog/admin/supplier-profile-changes?scope=all")).data.changes).toHaveLength(1);

    const moved = await savePayout(supplier, { businessNumber: VALID_NUMBER, bankName: "신한은행", accountNumber: "110-555-123456", accountHolder: "김바른" });
    expect(moved.data.payout.changed).toEqual(["bank"]);
    const list = await call<any>(admin, "/api/catalog/admin/supplier-profile-changes?scope=unchecked");
    expect(list.data.unchecked).toBe(2);
    expect(list.data.changes[0]).toMatchObject({
      fields: ["bank"],
      summary: { bank: { before: "농협은행 ···7891 (예금주 바른농장)", after: "신한은행 ···3456 (예금주 김바른)" } }
    });
    expect(list.data.changes[0].summary.businessNumber).toBeUndefined();

    // 한 건만 확인 → 1, 모두 확인 → 0(확인한 관리자 이름이 남음)
    const one = await call<any>(admin, "/api/catalog/admin/supplier-profile-changes/check", "POST", { ids: [list.data.changes[0].id] });
    expect(one.status).toBe(200);
    expect(one.data.unchecked).toBe(1);
    const all = await call<any>(admin, "/api/catalog/admin/supplier-profile-changes/check", "POST", {});
    expect(all.data.unchecked).toBe(0);
    const history = await call<any>(admin, "/api/catalog/admin/supplier-profile-changes?scope=all");
    expect(history.data.changes).toHaveLength(2);
    for (const change of history.data.changes) {
      expect(change.checkedAt).toBeTruthy();
      expect(change.checkedBy).toBeTruthy();
    }
    expect((await call<any>(admin, "/api/catalog/admin/supplier-profile-changes")).data.changes).toEqual([]);
    expect((await call<any>(admin, "/api/catalog/admin/supplier-requests/summary")).data.profileChanges).toBe(0);
  });

  it("관리자가 넣어 둔 번호: 붙임표만 다르면 그대로(기록 없음), 검증 숫자가 틀리면 팝업 대상(빠진 칸)", async () => {
    const admin = await adminToken();
    const supplier = await supplierToken(admin);
    await executeSql("UPDATE suppliers SET businessNumber = '2208162517' WHERE id = 'sup-p'");
    const bank = await call<any>(admin, "/api/baljuora/admin/settlements/bank-account", "PUT", { supplierId: "sup-p", ...BANK });
    expect(bank.status).toBe(200);
    expect((await call<any>(supplier, "/api/supplier/me")).data.payout.missing).toEqual([]);
    const same = await savePayout(supplier, { businessNumber: VALID_NUMBER, ...BANK });
    expect(same.data.payout.changed).toEqual([]);
    expect((await call<any>(admin, "/api/catalog/admin/supplier-profile-changes?scope=all")).data.changes).toEqual([]);

    await executeSql("UPDATE suppliers SET businessNumber = '1234567890' WHERE id = 'sup-p'");
    expect((await call<any>(supplier, "/api/supplier/me")).data.payout).toMatchObject({ businessNumber: "1234567890", missing: ["businessNumber"] });
  });

  it("권한: 로그인 없이 저장 401, 공급사·일반 회원은 관리자 알림 API 403", async () => {
    const admin = await adminToken();
    const supplier = await supplierToken(admin);
    expect((await call(null, "/api/supplier/payout", "PUT", { businessNumber: VALID_NUMBER, ...BANK })).status).toBe(401);
    expect((await call(supplier, "/api/catalog/admin/supplier-profile-changes")).status).toBe(403);
    expect((await call(supplier, "/api/catalog/admin/supplier-profile-changes/check", "POST", {})).status).toBe(403);
    const someone = await signUpAndGetToken(app);
    expect((await call(someone.token, "/api/catalog/admin/supplier-profile-changes")).status).toBe(403);
    expect((await call(someone.token, "/api/supplier/payout", "PUT", { businessNumber: VALID_NUMBER, ...BANK })).status).toBe(403);
    expect((await call(null, "/api/catalog/admin/supplier-profile-changes")).status).toBe(401);
  });

  it("migration 038 전 DB: 저장은 되고 기록만 건너뜀, 알림 목록 available false · 숫자 0, 확인은 503", async () => {
    const admin = await adminToken();
    const supplier = await supplierToken(admin);
    await executeSql("DROP TABLE supplier_profile_changes");
    try {
      const saved = await savePayout(supplier, { businessNumber: VALID_NUMBER, ...BANK });
      expect(saved.status).toBe(200);
      expect((await call<any>(supplier, "/api/supplier/me")).data.payout.missing).toEqual([]);
      const list = await call<any>(admin, "/api/catalog/admin/supplier-profile-changes");
      expect(list.status).toBe(200);
      expect(list.data).toEqual({ available: false, unchecked: 0, changes: [] });
      expect((await call<any>(admin, "/api/catalog/admin/supplier-requests/summary")).data.profileChanges).toBe(0);
      expect((await call<any>(admin, "/api/catalog/admin/supplier-profile-changes/check", "POST", {})).status).toBe(503);
    } finally {
      const sql = readFileSync(join(import.meta.dirname, "../migrations/038_supplier_profile_changes.sql"), "utf8")
        .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");
      for (const statement of sql.split(/;\s*(?:\n|$)/).map((item) => item.trim()).filter(Boolean)) await executeSql(statement);
    }
  });
});
