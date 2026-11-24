// 관리자 계정(2026-11-24 관리자 요청 "메인 마스터 말고 서브 마스터(MD)가 쓰는 같은 권한의 관리자 계정").
// - 관리자 = better-auth user.role "admin"(관리자 화면·API는 지금처럼 역할로만 판단합니다).
// - 계정·비밀번호는 코드·마이그레이션에 넣지 않고 관리자 화면에서 만듭니다(비밀번호는 해시로만 저장).
// - 아이디는 영문 소문자로 저장하고 로그인도 소문자로 맞춰 찾으므로 SUBADMIN = subadmin 입니다. 비밀번호는 대소문자를 구분합니다.
// - 메인 마스터(migration 004의 reviewhub-master-admin)는 지울 수 없고, 그 비밀번호는 본인만 바꿉니다. 내 계정은 스스로 지울 수 없습니다.
import { and, eq, inArray } from "drizzle-orm";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { getDb } from "../_core/db";
import { account, session, user } from "../db/schema";

export const PRIMARY_ADMIN_ID = "reviewhub-master-admin";
export const ADMIN_USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;
export const ADMIN_PASSWORD_MIN = 8;

export class AdminAccountError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function fail(message: string, status = 400): never {
  throw new AdminAccountError(message, status);
}

export type AdminAccountView = {
  id: string;
  username: string;
  name: string;
  createdAt: string | null;
  isPrimary: boolean;
  isSelf: boolean;
};

// migration 004가 메인 마스터의 createdAt을 밀리초(초 칸에)로 넣어 그대로 읽으면 5만 년 뒤 날짜가 됩니다.
// 내일보다 뒤면 밀리초로 보고 1000으로 나눠 읽고, 그래도 이상하면 비워 둡니다(DB 값은 바꾸지 않음).
function createdTime(value: unknown, now = Date.now()) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  const limit = now + 24 * 60 * 60 * 1000;
  if (value.getTime() <= limit) return value.getTime();
  const fixed = Math.round(value.getTime() / 1000);
  return fixed <= limit ? fixed : null;
}

function toIso(time: number | null) {
  return time === null ? null : new Date(time).toISOString();
}

function validatePassword(password: unknown): string {
  if (typeof password !== "string" || password.length < ADMIN_PASSWORD_MIN) fail(`비밀번호는 ${ADMIN_PASSWORD_MIN}자 이상 입력해 주세요.`);
  if (password.length > 128) fail("비밀번호는 128자까지 입력할 수 있어요.");
  return password;
}

async function revokeSessions(userId: string, keepSessionId?: string | null) {
  const db = getDb();
  const rows = await db.select({ id: session.id }).from(session).where(eq(session.userId, userId));
  const ids = rows.map((row) => row.id).filter((id) => id !== keepSessionId);
  if (ids.length > 0) await db.delete(session).where(inArray(session.id, ids));
}

async function adminRow(id: string) {
  const row = (await getDb().select({ id: user.id, role: user.role }).from(user).where(eq(user.id, id)).limit(1))[0];
  if (!row || row.role !== "admin") fail("관리자 계정을 찾을 수 없어요.", 404);
  return row;
}

export async function listAdminAccounts(currentUserId: string): Promise<AdminAccountView[]> {
  const rows = await getDb().select({ id: user.id, name: user.name, username: user.username, createdAt: user.createdAt })
    .from(user).where(eq(user.role, "admin"));
  const now = Date.now();
  // 메인 마스터를 맨 위에, 나머지는 만든 순서(날짜를 모르면 맨 뒤)로.
  return rows
    .map((row) => ({ row, time: createdTime(row.createdAt, now) }))
    .sort((a, b) => Number(b.row.id === PRIMARY_ADMIN_ID) - Number(a.row.id === PRIMARY_ADMIN_ID)
      || (a.time ?? Number.MAX_SAFE_INTEGER) - (b.time ?? Number.MAX_SAFE_INTEGER)
      || a.row.id.localeCompare(b.row.id))
    .map(({ row, time }) => ({
      id: row.id,
      username: row.username ?? "",
      name: row.name,
      createdAt: toIso(time),
      isPrimary: row.id === PRIMARY_ADMIN_ID,
      isSelf: row.id === currentUserId
    }));
}

export async function createAdminAccount(input: { username?: unknown; password?: unknown; name?: unknown }, currentUserId: string) {
  const username = typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
  if (!ADMIN_USERNAME_PATTERN.test(username)) fail("아이디는 영문·숫자·밑줄(_)·마침표(.)로 3~30자 입력해 주세요.");
  const password = validatePassword(input.password);
  const name = (typeof input.name === "string" ? input.name.trim() : "").slice(0, 40) || "서브 마스터";
  const db = getDb();
  const taken = await db.select({ id: user.id }).from(user).where(eq(user.username, username)).limit(1);
  if (taken[0]) fail(`'${username}'는 이미 쓰고 있는 아이디예요.`, 409);

  const passwordHash = await hashPassword(password);
  const userId = crypto.randomUUID();
  const now = new Date();
  await db.insert(user).values({
    id: userId,
    name,
    // 이메일은 로그인에 쓰지 않지만 필수 칸이라 겹치지 않는 내부 주소를 넣습니다.
    email: `${username}-${userId.slice(0, 8)}@admin.doogofood.local`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
    role: "admin",
    username,
    displayUsername: username
  });
  try {
    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
      createdAt: now,
      updatedAt: now
    });
  } catch (error) {
    await db.delete(user).where(eq(user.id, userId));
    throw error;
  }
  console.info(`[admin-accounts] admin account ${userId.slice(0, 8)} created by ${currentUserId.slice(0, 8)}`);
  return (await listAdminAccounts(currentUserId)).find((row) => row.id === userId)!;
}

// 다른 관리자의 비밀번호를 새로 정합니다(그 관리자의 로그인은 모두 끊김). 내 비밀번호는 changeOwnAdminPassword로 바꿉니다.
export async function resetAdminPassword(targetId: string, password: unknown, currentUserId: string) {
  if (targetId === currentUserId) fail("내 비밀번호는 아래 '내 비밀번호 바꾸기'에서 지금 비밀번호와 함께 바꿔 주세요.");
  await adminRow(targetId);
  if (targetId === PRIMARY_ADMIN_ID) fail("메인 마스터 비밀번호는 메인 마스터 계정으로 로그인해서만 바꿀 수 있어요.", 403);
  const next = validatePassword(password);
  const db = getDb();
  const credential = (await db.select({ id: account.id }).from(account)
    .where(and(eq(account.userId, targetId), eq(account.providerId, "credential"))).limit(1))[0];
  if (!credential) fail("비밀번호로 로그인하는 계정이 아니에요.", 409);
  await db.update(account).set({ password: await hashPassword(next), updatedAt: new Date() }).where(eq(account.id, credential.id));
  await revokeSessions(targetId);
  console.info(`[admin-accounts] password reset for ${targetId.slice(0, 8)} by ${currentUserId.slice(0, 8)}`);
  return { reset: true };
}

export async function deleteAdminAccount(targetId: string, currentUserId: string) {
  if (targetId === currentUserId) fail("지금 로그인한 내 계정은 지울 수 없어요.");
  if (targetId === PRIMARY_ADMIN_ID) fail("메인 마스터 계정은 지울 수 없어요.", 403);
  await adminRow(targetId);
  const db = getDb();
  await db.delete(session).where(eq(session.userId, targetId));
  await db.delete(account).where(eq(account.userId, targetId));
  await db.delete(user).where(eq(user.id, targetId));
  console.info(`[admin-accounts] admin account ${targetId.slice(0, 8)} deleted by ${currentUserId.slice(0, 8)}`);
  return { deleted: true };
}

// 내 비밀번호 바꾸기: 지금 비밀번호를 확인하고, 이 기기는 그대로 두고 다른 기기의 로그인은 끊습니다.
export async function changeOwnAdminPassword(userId: string, currentPassword: unknown, newPassword: unknown, keepSessionId?: string | null) {
  const db = getDb();
  const credential = (await db.select().from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential"))).limit(1))[0];
  if (!credential?.password) fail("비밀번호로 로그인하는 계정이 아니에요.", 409);
  if (typeof currentPassword !== "string" || !(await verifyPassword({ hash: credential.password, password: currentPassword }))) fail("지금 비밀번호가 맞지 않아요.");
  const next = validatePassword(newPassword);
  if (next === currentPassword) fail("새 비밀번호가 지금 비밀번호와 같아요.");
  await db.update(account).set({ password: await hashPassword(next), updatedAt: new Date() }).where(eq(account.id, credential.id));
  await revokeSessions(userId, keepSessionId);
  return { changed: true };
}
