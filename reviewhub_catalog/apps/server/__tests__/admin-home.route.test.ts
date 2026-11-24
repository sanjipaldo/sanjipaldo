// 운영 홈·관리자 계정(2026-11-24 관리자 요청)
// - GET /api/catalog/admin/member-stats: 매출처(셀러)·공급사 총수와 30일 전 대비 증감(가입일·등록일로 추정 → 30일 전 기록이 있으면 그 값)
// - GET/PUT/DELETE /api/catalog/admin/home-layout: 아이디(로그인 계정)마다 따로 저장, 형식이 틀리면 400, 공개 단가표 바뀜 표시는 그대로
// - /api/catalog/admin/admins: 같은 권한의 관리자 계정 만들기(아이디 대소문자 구분 없음, 비밀번호는 구분)·비밀번호 새로 정하기·지우기·내 비밀번호 바꾸기
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "better-auth/crypto";
import app from "../_core/create-app";
import { executeSql } from "../_core/db";
import { getCatalogVersion } from "../services/catalog-version";
import { MEMBER_HISTORY_KEY } from "../services/admin-home";
import { applyMigrations, fetchWithAuth, resetDatabase, signUpAndGetToken } from "../_test/helpers";

const SUPPLIER_IDS = ["mh-s1", "mh-s2", "mh-s3", "mh-s4"];
const BUYER_IDS = ["mh-b1", "mh-b2", "mh-b3", "mh-b4", "mh-b5"];

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await resetDatabase();
  await executeSql(`DELETE FROM suppliers WHERE id IN (${SUPPLIER_IDS.map(() => "?").join(",")})`, SUPPLIER_IDS);
  await executeSql(`DELETE FROM baljuora_buyers WHERE id IN (${BUYER_IDS.map(() => "?").join(",")})`, BUYER_IDS);
  await executeSql("DELETE FROM baljuora_sync_store WHERE key = ? OR key LIKE 'admin_home_layout:%'", [MEMBER_HISTORY_KEY]);
});

async function adminToken() {
  const signed = await signUpAndGetToken(app);
  await executeSql("UPDATE user SET role = ?, emailVerified = 1 WHERE id = ?", ["admin", signed.userId!]);
  return { token: signed.token, userId: signed.userId! };
}

async function json<T>(res: Response) {
  return (await res.json()) as { ok: boolean; data: T; error?: { message?: string } };
}

async function signIn(username: string, password: string) {
  const res = await app.fetch(new Request("http://localhost/api/auth/sign-in/username", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ username, password })
  }));
  return { status: res.status, token: res.headers.get("set-auth-token") };
}

function daysAgoSql(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString().replace("T", " ").slice(0, 19);
}

type Stats = {
  since: string;
  buyers: { total: number; previous: number; change: number; changeRate: number | null; basis: string; recent: number; activeBuyers: number } | null;
  suppliers: { total: number; previous: number; change: number; changeRate: number | null; basis: string; recent: number; accounts: number | null };
};

describe("운영 홈 회원 현황(매출처·공급사)", () => {
  it("총수와 30일 전 대비 증감을 가입일·등록일로 계산하고, 30일 전 기록이 있으면 그 값과 비교합니다", async () => {
    const { token } = await adminToken();
    const before = (await json<Stats>(await fetchWithAuth(app, token, "/api/catalog/admin/member-stats"))).data;
    // 공급사: 오래된 2곳 + 최근 1곳(사용 중) + 사용 중지 1곳(세지 않음)
    await executeSql("INSERT INTO suppliers (id, name, isActive, createdAt) VALUES (?, ?, 1, ?), (?, ?, 1, ?), (?, ?, 1, ?), (?, ?, 0, ?)", [
      "mh-s1", "(회원) 오래된 공급사1", daysAgoSql(90), "mh-s2", "(회원) 오래된 공급사2", daysAgoSql(45), "mh-s3", "(회원) 새 공급사", daysAgoSql(3), "mh-s4", "(회원) 멈춘 공급사", daysAgoSql(2)
    ]);
    // 매출처: 가입일이 오래된 3곳(1곳은 가입일 모름) + 최근 30일 2곳
    const buyer = "INSERT INTO baljuora_buyers (id, companyName, joinedAt) VALUES (?, ?, ?)";
    await executeSql(buyer, ["mh-b1", "(회원) 셀러1", new Date(Date.now() - 200 * 86_400_000).toISOString()]);
    await executeSql(buyer, ["mh-b2", "(회원) 셀러2", new Date(Date.now() - 40 * 86_400_000).toISOString()]);
    await executeSql(buyer, ["mh-b3", "(회원) 셀러3", null]);
    await executeSql(buyer, ["mh-b4", "(회원) 셀러4", new Date(Date.now() - 10 * 86_400_000).toISOString()]);
    await executeSql(buyer, ["mh-b5", "(회원) 셀러5", new Date(Date.now() - 1 * 86_400_000).toISOString()]);

    const res = await fetchWithAuth(app, token, "/api/catalog/admin/member-stats");
    expect(res.status).toBe(200);
    const stats = (await json<Stats>(res)).data;
    expect(stats.suppliers.total).toBe(before.suppliers.total + 3);
    expect(stats.suppliers.recent).toBe(before.suppliers.recent + 1);
    expect(stats.suppliers.basis).toBe("joined");
    expect(stats.suppliers.change).toBe(stats.suppliers.recent);
    expect(stats.buyers?.total).toBe((before.buyers?.total ?? 0) + 5);
    expect(stats.buyers?.recent).toBe((before.buyers?.recent ?? 0) + 2);
    expect(stats.buyers?.previous).toBe((stats.buyers?.total ?? 0) - (stats.buyers?.recent ?? 0));

    // 31일 전에 적어 둔 기록이 있으면 그 수와 비교합니다(줄어든 것도 보임: 하락).
    const old = new Date(Date.now() - 31 * 86_400_000 + 9 * 3_600_000).toISOString().slice(0, 10);
    const history = { [old]: { b: (stats.buyers?.total ?? 0) + 10, s: stats.suppliers.total - 1 } };
    await executeSql("INSERT INTO baljuora_sync_store (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [MEMBER_HISTORY_KEY, JSON.stringify(history), new Date().toISOString()]);
    const compared = (await json<Stats>(await fetchWithAuth(app, token, "/api/catalog/admin/member-stats"))).data;
    expect(compared.buyers?.basis).toBe("snapshot");
    expect(compared.buyers?.change).toBe(-10);
    expect(compared.buyers?.changeRate).toBeLessThan(0);
    expect(compared.suppliers.basis).toBe("snapshot");
    expect(compared.suppliers.change).toBe(1);
    // 오늘 수도 기록에 남깁니다.
    const saved = await executeSql("SELECT value FROM baljuora_sync_store WHERE key = ?", [MEMBER_HISTORY_KEY]);
    const savedHistory = JSON.parse(String(saved.rows[0]?.value ?? "{}")) as Record<string, { s: number }>;
    expect(Object.keys(savedHistory).length).toBe(2);
  });

  it("관리자가 아니면 볼 수 없습니다", async () => {
    const plain = await signUpAndGetToken(app);
    expect((await fetchWithAuth(app, plain.token, "/api/catalog/admin/member-stats")).status).toBe(403);
    expect((await app.fetch(new Request("http://localhost/api/catalog/admin/member-stats"))).status).toBe(401);
  });
});

describe("운영 홈 화면 배치(아이디마다)", () => {
  it("아이디마다 따로 저장하고, 공개 단가표 바뀜 표시는 바꾸지 않습니다", async () => {
    const first = await adminToken();
    const second = await adminToken();
    expect((await json<{ layout: null }>(await fetchWithAuth(app, first.token, "/api/catalog/admin/home-layout"))).data.layout).toBeNull();

    const versionBefore = await getCatalogVersion();
    const put = await fetchWithAuth(app, first.token, "/api/catalog/admin/home-layout", {
      method: "PUT",
      body: JSON.stringify({ visible: ["sales-kpi", "members", "members", "BAD ID", "notices"], known: ["sales-kpi", "members", "notices", "sales-top10"], sizes: { notices: "full", members: "huge" } })
    });
    expect(put.status).toBe(200);
    expect(await getCatalogVersion()).toBe(versionBefore);
    const layout = (await json<{ layout: { visible: string[]; known: string[]; sizes: Record<string, string> } }>(await fetchWithAuth(app, first.token, "/api/catalog/admin/home-layout"))).data.layout;
    expect(layout.visible).toEqual(["sales-kpi", "members", "notices"]);
    expect(layout.known).toContain("sales-top10");
    expect(layout.sizes).toEqual({ notices: "full" });

    // 다른 관리자 아이디는 따로입니다.
    expect((await json<{ layout: null }>(await fetchWithAuth(app, second.token, "/api/catalog/admin/home-layout"))).data.layout).toBeNull();
    // 기본값으로 되돌리기
    expect((await fetchWithAuth(app, first.token, "/api/catalog/admin/home-layout", { method: "DELETE" })).status).toBe(200);
    expect((await json<{ layout: null }>(await fetchWithAuth(app, first.token, "/api/catalog/admin/home-layout"))).data.layout).toBeNull();
    // 형식이 틀리면 400
    expect((await fetchWithAuth(app, first.token, "/api/catalog/admin/home-layout", { method: "PUT", body: JSON.stringify({ order: [] }) })).status).toBe(400);
  });
});

describe("관리자 계정(서브 마스터)", () => {
  it("같은 권한의 관리자 계정을 만들고, 아이디는 대소문자 구분 없이 로그인합니다(비밀번호는 구분)", async () => {
    const master = await adminToken();
    const create = await fetchWithAuth(app, master.token, "/api/catalog/admin/admins", {
      method: "POST",
      body: JSON.stringify({ username: "SubAdmin", password: "Md-pass-2026", name: "MD" })
    });
    expect(create.status).toBe(201);
    const created = (await json<{ admin: { id: string; username: string; name: string } }>(create)).data.admin;
    expect(created.username).toBe("subadmin");
    expect(created.name).toBe("MD");

    for (const id of ["SUBADMIN", "subadmin", "SubAdmin"]) {
      const login = await signIn(id, "Md-pass-2026");
      expect(login.status).toBe(200);
      expect(login.token).toBeTruthy();
    }
    expect((await signIn("subadmin", "md-pass-2026")).status).not.toBe(200);

    // 서브 마스터도 관리자 화면·API를 그대로 씁니다.
    const md = (await signIn("SUBADMIN", "Md-pass-2026")).token!;
    expect((await fetchWithAuth(app, md, "/api/catalog/admin/overview")).status).toBe(200);
    const list = (await json<{ admins: Array<{ username: string; isSelf: boolean }> }>(await fetchWithAuth(app, md, "/api/catalog/admin/admins"))).data.admins;
    expect(list.map((row) => row.username)).toContain("subadmin");
    expect(list.find((row) => row.username === "subadmin")?.isSelf).toBe(true);

    // 같은 아이디·짧은 비밀번호는 막습니다.
    expect((await fetchWithAuth(app, master.token, "/api/catalog/admin/admins", { method: "POST", body: JSON.stringify({ username: "SUBADMIN", password: "another-pass-1" }) })).status).toBe(409);
    expect((await fetchWithAuth(app, master.token, "/api/catalog/admin/admins", { method: "POST", body: JSON.stringify({ username: "md2", password: "short" }) })).status).toBe(400);
    expect((await fetchWithAuth(app, master.token, "/api/catalog/admin/admins", { method: "POST", body: JSON.stringify({ username: "a b", password: "long-enough-1" }) })).status).toBe(400);
  });

  it("다른 관리자 비밀번호를 새로 정하면 그 관리자의 로그인이 끊기고, 지울 수 있습니다(내 계정·메인 마스터는 못 지움)", async () => {
    const master = await adminToken();
    const create = await fetchWithAuth(app, master.token, "/api/catalog/admin/admins", { method: "POST", body: JSON.stringify({ username: "mdone", password: "first-pass-1" }) });
    const md = (await json<{ admin: { id: string } }>(create)).data.admin;
    const mdToken = (await signIn("mdone", "first-pass-1")).token!;

    const reset = await fetchWithAuth(app, master.token, `/api/catalog/admin/admins/${md.id}/password`, { method: "PUT", body: JSON.stringify({ password: "second-pass-2" }) });
    expect(reset.status).toBe(200);
    expect((await fetchWithAuth(app, mdToken, "/api/catalog/admin/overview")).status).toBe(401);
    expect((await signIn("mdone", "first-pass-1")).status).not.toBe(200);
    expect((await signIn("mdone", "second-pass-2")).status).toBe(200);

    // 내 계정은 지울 수 없고, 내 비밀번호는 여기서 새로 정하지 않습니다.
    expect((await fetchWithAuth(app, master.token, `/api/catalog/admin/admins/${master.userId}`, { method: "DELETE" })).status).toBe(400);
    expect((await fetchWithAuth(app, master.token, `/api/catalog/admin/admins/${master.userId}/password`, { method: "PUT", body: JSON.stringify({ password: "whatever-pass" }) })).status).toBe(400);

    // 메인 마스터 계정은 지울 수 없고 비밀번호도 다른 관리자가 바꾸지 못합니다.
    const now = Date.now();
    await executeSql("INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, role, username, displayUsername) VALUES ('reviewhub-master-admin', '마스터 관리자', 'main-admin@test.local', 1, ?, ?, 'admin', 'mainadmin', 'mainadmin')", [now, now]);
    await executeSql("INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES ('main-admin-account', 'reviewhub-master-admin', 'credential', 'reviewhub-master-admin', ?, ?, ?)", [await hashPassword("main-pass-123"), now, now]);
    expect((await fetchWithAuth(app, master.token, "/api/catalog/admin/admins/reviewhub-master-admin", { method: "DELETE" })).status).toBe(403);
    expect((await fetchWithAuth(app, master.token, "/api/catalog/admin/admins/reviewhub-master-admin/password", { method: "PUT", body: JSON.stringify({ password: "hacked-pass-1" }) })).status).toBe(403);
    expect((await signIn("mainadmin", "main-pass-123")).status).toBe(200);
    // 목록은 메인 마스터가 맨 위이고, migration 004처럼 밀리초로 넣은 만든 날(초 칸)도 제 날짜로 읽습니다.
    const admins = (await json<{ admins: Array<{ id: string; createdAt: string | null }> }>(await fetchWithAuth(app, master.token, "/api/catalog/admin/admins"))).data.admins;
    expect(admins[0]?.id).toBe("reviewhub-master-admin");
    expect(Math.abs(new Date(admins[0]?.createdAt ?? 0).getTime() - now)).toBeLessThan(60_000);

    // 서브 마스터 지우기 → 로그인 불가
    expect((await fetchWithAuth(app, master.token, `/api/catalog/admin/admins/${md.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await signIn("mdone", "second-pass-2")).status).not.toBe(200);
    expect((await fetchWithAuth(app, master.token, `/api/catalog/admin/admins/${md.id}`, { method: "DELETE" })).status).toBe(404);
  });

  it("내 비밀번호 바꾸기는 지금 비밀번호가 맞아야 하고, 관리자가 아니면 계정 API를 못 씁니다", async () => {
    const master = await adminToken();
    await fetchWithAuth(app, master.token, "/api/catalog/admin/admins", { method: "POST", body: JSON.stringify({ username: "mdself", password: "self-pass-01" }) });
    const token = (await signIn("mdself", "self-pass-01")).token!;
    expect((await fetchWithAuth(app, token, "/api/catalog/admin/admins/me/password", { method: "POST", body: JSON.stringify({ currentPassword: "wrong-pass", newPassword: "self-pass-02" }) })).status).toBe(400);
    expect((await fetchWithAuth(app, token, "/api/catalog/admin/admins/me/password", { method: "POST", body: JSON.stringify({ currentPassword: "self-pass-01", newPassword: "self-pass-02" }) })).status).toBe(200);
    // 이 기기 로그인은 그대로입니다.
    expect((await fetchWithAuth(app, token, "/api/catalog/admin/overview")).status).toBe(200);
    expect((await signIn("mdself", "self-pass-02")).status).toBe(200);

    const plain = await signUpAndGetToken(app);
    expect((await fetchWithAuth(app, plain.token, "/api/catalog/admin/admins")).status).toBe(403);
    expect((await fetchWithAuth(app, plain.token, "/api/catalog/admin/admins", { method: "POST", body: JSON.stringify({ username: "evil", password: "evil-pass-1" }) })).status).toBe(403);
  });
});
