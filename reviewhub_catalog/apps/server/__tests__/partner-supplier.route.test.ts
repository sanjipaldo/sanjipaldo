// 입점 성공 → 공급사 등록·정산 방식 맞추기(2026-11-25): 입점 신청 → 상담(정산 방식 결정) → 공급사로 등록(같은 이름이면 연결)
// → 계약대로 정산 방식 저장 → 공급사 센터 계정(ID) 만들기까지 끊기지 않고 이어지는지 봅니다.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

// 공급사 계정 만들기는 db.transaction을 써서 임시 파일 DB를 씁니다(:memory: DB는 트랜잭션 연결에서 내용이 사라짐).
process.env.SKYBASE_DB_ENDPOINT = `file:${join(mkdtempSync(join(tmpdir(), "partner-supplier-")), "test.db")}`;
for (const key of ["RESEND_API_KEY", "SMTP_USER", "SMTP_PASS", "MAIL_NOTIFY_TO"]) delete process.env[key];
const { default: app } = await import("../_core/create-app");
const { executeSql } = await import("../_core/db");
const { applyMigrations, fetchWithAuth, resetDatabase, signUpAndGetToken } = await import("../_test/helpers");

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await resetDatabase();
  await executeSql("DELETE FROM partner_deals");
  await executeSql("DELETE FROM sourcing_requests");
  await executeSql("DELETE FROM supplier_accounts");
  await executeSql("DELETE FROM baljuora_sync_store WHERE key IN ('partner_supplier_links', 'supplier_settlement_settings')");
  await executeSql("DELETE FROM suppliers WHERE name IN ('봄빛농장', '바다상회')");
});

let counter = 0;
async function apply(overrides: Record<string, unknown> = {}) {
  counter += 1;
  const res = await app.fetch(new Request("http://localhost/api/catalog/partner", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({
      companyName: "봄빛농장",
      businessType: "농가",
      productName: "사과, 배",
      representative: "김대표",
      businessNumber: "123-45-67890",
      shipFrom: "충북 괴산",
      requesterName: "박담당",
      contact: "010-1234-5678",
      email: `farm-${counter}@example.com`,
      details: "부사 위주",
      agreePrivacy: true,
      hp_extra: "",
      ...overrides
    })
  }));
  expect(res.status).toBe(201);
  return ((await res.json()) as { data: { request: { id: string } } }).data.request.id;
}

async function adminToken() {
  const user = await signUpAndGetToken(app);
  await executeSql("UPDATE user SET role = ?, emailVerified = 1 WHERE id = ?", ["admin", user.userId!]);
  return user.token;
}

async function send<T>(admin: string, path: string, method = "GET", body?: unknown) {
  const res = await fetchWithAuth(app, admin, `/api/catalog${path}`, body === undefined ? { method } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as { ok: boolean; data: T; error?: { message?: string } } };
}

describe("입점 성공 → 공급사 등록·정산 방식·계정", () => {
  it("계약 전에는 막고, 등록하면 신청서 정보로 공급사를 만들고 계약대로 정산 방식을 맞춥니다(여러 번 눌러도 안전)", async () => {
    const admin = await adminToken();
    const id = await apply();
    const register = (body: unknown = {}) => send<any>(admin, `/admin/partner/${id}/register-supplier`, "POST", body);

    // 상담 중에는 등록할 수 없음
    expect((await send(admin, `/admin/partner/${id}/deal`, "PUT", { stage: "negotiating" })).status).toBe(200);
    const early = await register();
    expect(early.status).toBe(400);
    expect(early.body.error?.message).toContain("입점 성공");

    // 입점 성공 · 수수료 위탁 12%
    const saved = await send<any>(admin, `/admin/partner/${id}/deal`, "PUT", { stage: "contracted", contractType: "commission", commissionRate: 12 });
    expect(saved.body.data.request).toMatchObject({ deal: { stage: "contracted", commissionRate: 12 }, supplierLink: null });

    const first = await register();
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ created: true, reactivated: false, settlementApplied: true, supplierName: "봄빛농장", filled: ["사업자등록번호", "대표자", "연락처", "이메일"] });
    const supplierId = first.body.data.supplierId as string;
    expect(first.body.data.request.supplierLink).toMatchObject({
      supplierId,
      supplierName: "봄빛농장",
      linked: true,
      isActive: true,
      hasAccount: false,
      username: null,
      settlement: { type: "commission", commissionRate: 12, cycle: "weekly", explicit: true },
      taxProblems: []
    });
    expect(first.body.data.request.deal.history.at(-1)).toMatchObject({ stage: "contracted", memo: "공급사로 등록: 봄빛농장" });
    const row = (await executeSql("SELECT businessNumber, representative, phone, email, memo, isActive FROM suppliers WHERE id = ?", [supplierId])).rows[0];
    expect(row).toMatchObject({ businessNumber: "123-45-67890", representative: "김대표", phone: "010-1234-5678", email: `farm-${counter}@example.com` });
    expect(String(row.memo)).toContain("담당자 박담당");
    expect(String(row.memo)).toContain("출고지 충북 괴산");

    // 공급사 관리 목록에도 계약대로(판매수수료 12% · 주 정산)
    const suppliers = await send<any>(admin, "/admin/suppliers");
    expect(suppliers.body.data.settlements[supplierId]).toMatchObject({ type: "commission", commissionRate: 12, cycle: "weekly", explicit: true });

    // 다시 눌러도 새로 만들지 않고 기록도 늘지 않음
    const again = await register();
    expect(again.body.data).toMatchObject({ created: false, filled: [], supplierId });
    expect(again.body.data.request.deal.history).toHaveLength(first.body.data.request.deal.history.length);
    expect((await executeSql("SELECT COUNT(*) AS count FROM suppliers WHERE name = '봄빛농장'")).rows[0].count).toBe(1);

    // 계약을 일반 도소매로 바꾸면 정산 방식이 계약과 달라짐 → 다시 맞추기(월 정산 고름)
    expect((await send(admin, `/admin/partner/${id}/deal`, "PUT", { stage: "contracted", contractType: "wholesale" })).status).toBe(200);
    const list = await send<any>(admin, "/admin/sourcing");
    const listed = list.body.data.sourcingRequests.find((item: any) => item.id === id);
    expect(listed.supplierLink.settlement).toMatchObject({ type: "commission", commissionRate: 12 });
    const wholesale = await register({ cycle: "monthly" });
    expect(wholesale.body.data.request.supplierLink.settlement).toMatchObject({ type: "wholesale", cycle: "monthly", explicit: true });

    // 공급사 센터 계정(ID)을 만들면 입점 신청 화면에도 보임(정산 방식은 그대로)
    const account = await fetchWithAuth(app, admin, `/api/catalog/admin/suppliers/${supplierId}/account`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "bomfarm", password: "bomfarm-1234", commissionRate: 12, settlementCycle: "monthly" }) });
    expect(account.status).toBe(201);
    const withAccount = (await send<any>(admin, "/admin/sourcing")).body.data.sourcingRequests.find((item: any) => item.id === id);
    expect(withAccount.supplierLink).toMatchObject({ hasAccount: true, username: "bomfarm", settlement: { type: "wholesale", cycle: "monthly" } });

    // 신청을 지우면 이은 기록만 지우고 공급사·계정은 그대로
    expect((await send(admin, `/admin/sourcing/${id}`, "DELETE")).status).toBe(200);
    const store = (await executeSql("SELECT value FROM baljuora_sync_store WHERE key = 'partner_supplier_links'")).rows[0];
    expect(JSON.parse(String(store.value))[id]).toBeUndefined();
    expect((await executeSql("SELECT COUNT(*) AS count FROM supplier_accounts WHERE supplierId = ?", [supplierId])).rows[0].count).toBe(1);
  });

  it("이름이 같은 공급사가 있으면 새로 만들지 않고 연결하며, 이미 적힌 칸은 덮어쓰지 않습니다", async () => {
    const admin = await adminToken();
    await executeSql("INSERT INTO suppliers (id, name, businessNumber, isActive) VALUES ('sup-sea-partner', '바다상회', '999-88-77777', 0)");
    const id = await apply({ companyName: "바다상회", representative: "최대표", businessNumber: "111-22-33333" });
    let listed = (await send<any>(admin, "/admin/sourcing")).body.data.sourcingRequests.find((item: any) => item.id === id);
    // 아직 잇지 않았지만 같은 이름의 공급사를 알려 줌
    expect(listed.supplierLink).toMatchObject({ supplierId: "sup-sea-partner", linked: false, isActive: false, taxProblems: ["대표자 성명 없음"] });

    expect((await send(admin, `/admin/partner/${id}/deal`, "PUT", { stage: "contracted", contractType: "commission", commissionRate: 10 })).status).toBe(200);
    const linked = await send<any>(admin, `/admin/partner/${id}/register-supplier`, "POST", { name: "바다상회" });
    expect(linked.status).toBe(200);
    expect(linked.body.data).toMatchObject({ created: false, reactivated: true, supplierId: "sup-sea-partner", filled: ["대표자", "연락처", "이메일"] });
    expect(linked.body.data.request.supplierLink).toMatchObject({ linked: true, isActive: true, taxProblems: [], settlement: { type: "commission", commissionRate: 10, cycle: "weekly" } });
    expect(linked.body.data.request.deal.history.at(-1).memo).toBe("공급사와 연결: 바다상회");
    const row = (await executeSql("SELECT businessNumber, representative FROM suppliers WHERE id = 'sup-sea-partner'")).rows[0];
    expect(row).toMatchObject({ businessNumber: "999-88-77777", representative: "최대표" });

    // 계약 형태 "기타"는 정산 방식을 건드리지 않음
    const other = await apply({ companyName: "봄빛농장", email: "other@example.com" });
    expect((await send(admin, `/admin/partner/${other}/deal`, "PUT", { stage: "contracted", contractType: "other" })).status).toBe(200);
    const plain = await send<any>(admin, `/admin/partner/${other}/register-supplier`, "POST", { name: "  봄빛농장  " });
    expect(plain.body.data).toMatchObject({ created: true, settlementApplied: false, supplierName: "봄빛농장" });
    expect(plain.body.data.request.supplierLink.settlement).toMatchObject({ explicit: false });
    listed = (await send<any>(admin, "/admin/sourcing")).body.data.sourcingRequests.find((item: any) => item.id === other);
    expect(listed.supplierLink).toMatchObject({ linked: true, supplierName: "봄빛농장" });

    // 공급사 계정이 아닌 일반 사용자는 못 씀
    const user = await signUpAndGetToken(app);
    expect((await fetchWithAuth(app, user.token, `/api/catalog/admin/partner/${id}/register-supplier`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(403);
  });
});
