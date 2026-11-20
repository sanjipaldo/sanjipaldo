// 공급사 센터(2026-11-20, 관리자 요청).
// - 마스터 관리자가 공급사(매입처)마다 로그인 계정을 만들어 줍니다(회원가입 없음).
// - 공급사는 자기 상품(products.supplierName = 공급사 이름)만 보고, 수정·신규 등록은 "변경 요청"으로 보냅니다.
//   마스터가 승인해야 상품에 반영됩니다(가격 이력·발주오라 대기열 기록은 기존 저장 함수 그대로).
// - 판매·정산 화면은 supplier_sales(판매·반품 내역)로 계산합니다. 주문 데이터 연결 전에는 비어 있습니다.
// - migration 032 전 DB(운영 DB를 쓰는 미리보기)에서는 표가 없어 503 "운영 배포 후 사용" 안내를 돌려줍니다.
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import {
  DEFAULT_SUPPLIER_COMMISSION_RATE,
  SUPPLIER_CREATE_FIELDS,
  SUPPLIER_PASSWORD_MIN,
  SUPPLIER_UPDATE_FIELDS,
  SUPPLIER_USERNAME_PATTERN,
  addDays,
  monthRange,
  seoulDateKey,
  settlementPeriodFor,
  supplierCommission,
  upcomingSettlement,
  type SettlementPeriod,
  type SupplierChangeField,
  type SupplierProductChanges,
  type SupplierRequestStatus,
  type SupplierSettlementCycle
} from "@repo/shared/supplier-portal";
import { DatabaseError, getDb } from "../_core/db";
import {
  account,
  categories,
  productOptions,
  products,
  session,
  shippingPolicies,
  supplierAccounts,
  supplierRequests,
  supplierSales,
  suppliers,
  user,
  type Product,
  type ProductOption,
  type Supplier,
  type SupplierAccount,
  type SupplierRequest
} from "../db/schema";
import { createProduct, updateProduct, type ProductInput } from "./catalog";

export class SupplierPortalUnavailableError extends DatabaseError {
  constructor() {
    super("DATABASE_QUERY_FAILED", "공급사 센터는 운영 배포가 끝난 뒤 쓸 수 있어요.", 503);
  }
}

export function isMissingSupplierTable(error: unknown) {
  const texts = [error instanceof Error ? error.message : String(error), (error as { cause?: { message?: string } })?.cause?.message ?? ""];
  return texts.some((text) => text.includes("no such table") && text.includes("supplier_"));
}

async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isMissingSupplierTable(error)) throw new SupplierPortalUnavailableError();
    throw error;
  }
}

function fail(message: string, status = 400): never {
  throw new DatabaseError("DATABASE_QUERY_FAILED", message, status);
}

// ── 계정 ────────────────────────────────────────────────────────────────
export type SupplierAccountView = {
  id: string;
  supplierId: string;
  username: string;
  isActive: boolean;
  commissionRate: number;
  settlementCycle: SupplierSettlementCycle;
  lastLoginAt: string | null;
  createdAt: string;
};

function accountView(row: SupplierAccount): SupplierAccountView {
  return {
    id: row.id,
    supplierId: row.supplierId,
    username: row.username,
    isActive: row.isActive,
    commissionRate: row.commissionRate,
    settlementCycle: row.settlementCycle === "weekly" ? "weekly" : "monthly",
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt
  };
}

// 관리자 공급사 목록용: 계정·상품 수. migration 032 전에는 계정 없이 돌려줍니다(공급사 목록은 그대로 보이게).
export async function getSupplierAdminExtras() {
  const db = getDb();
  const countRows = await db
    .select({ supplierName: products.supplierName, count: sql<number>`count(*)` })
    .from(products)
    .where(sql`${products.deletedAt} IS NULL AND ${products.supplierName} IS NOT NULL`)
    .groupBy(products.supplierName);
  const productCounts = Object.fromEntries(countRows.map((row) => [String(row.supplierName), Number(row.count)]));
  try {
    const accounts = (await db.select().from(supplierAccounts)).map(accountView);
    return { accounts, productCounts, portalReady: true };
  } catch (error) {
    if (!isMissingSupplierTable(error)) throw error;
    return { accounts: [] as SupplierAccountView[], productCounts, portalReady: false };
  }
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function validatePassword(password: string) {
  if (password.length < SUPPLIER_PASSWORD_MIN) fail(`비밀번호는 ${SUPPLIER_PASSWORD_MIN}자 이상 입력해 주세요.`);
  if (password.length > 128) fail("비밀번호는 128자까지 입력할 수 있어요.");
}

function clampCommission(rate: number | undefined | null) {
  if (rate === undefined || rate === null) return DEFAULT_SUPPLIER_COMMISSION_RATE;
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) fail("수수료율은 0~100% 사이로 입력해 주세요.");
  return Math.round(rate * 10) / 10;
}

export async function createSupplierAccount(
  supplierId: string,
  input: { username: string; password: string; commissionRate?: number | null; settlementCycle?: SupplierSettlementCycle }
) {
  return guarded(async () => {
    const db = getDb();
    const supplier = (await db.select().from(suppliers).where(eq(suppliers.id, supplierId)).limit(1))[0];
    if (!supplier) fail("공급사를 찾을 수 없어요.", 404);
    if (!supplier.isActive) fail("사용 중지된 공급사에는 계정을 만들 수 없어요.");
    const username = normalizeUsername(input.username);
    if (!SUPPLIER_USERNAME_PATTERN.test(username)) fail("아이디는 영문 소문자·숫자·밑줄(_)·마침표(.)로 3~30자 입력해 주세요.");
    validatePassword(input.password);
    const commissionRate = clampCommission(input.commissionRate);
    const existingAccount = await db.select({ id: supplierAccounts.id }).from(supplierAccounts).where(eq(supplierAccounts.supplierId, supplierId)).limit(1);
    if (existingAccount[0]) fail("이 공급사에는 이미 로그인 계정이 있어요.", 409);
    const taken = await db.select({ id: user.id }).from(user).where(eq(user.username, username)).limit(1);
    if (taken[0]) fail(`'${username}'는 이미 쓰고 있는 아이디예요.`, 409);

    const passwordHash = await hashPassword(input.password);
    const userId = crypto.randomUUID();
    const now = new Date();
    const nowIso = now.toISOString();
    const accountId = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(user).values({
        id: userId,
        name: supplier.name,
        // 이메일은 로그인에 쓰지 않지만 필수 칸이라 겹치지 않는 내부 주소를 넣습니다.
        email: `${username}-${userId.slice(0, 8)}@supplier.doogofood.local`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
        role: "user",
        username,
        displayUsername: username
      });
      await tx.insert(account).values({
        id: crypto.randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: passwordHash,
        createdAt: now,
        updatedAt: now
      });
      await tx.insert(supplierAccounts).values({
        id: accountId,
        supplierId,
        userId,
        username,
        isActive: true,
        commissionRate,
        settlementCycle: input.settlementCycle === "weekly" ? "weekly" : "monthly",
        createdAt: nowIso,
        updatedAt: nowIso
      });
    });
    const row = (await db.select().from(supplierAccounts).where(eq(supplierAccounts.id, accountId)).limit(1))[0];
    console.info(`[supplier] account created for supplier ${supplierId}`);
    return accountView(row);
  });
}

async function revokeSessions(userId: string) {
  await getDb().delete(session).where(eq(session.userId, userId));
}

export async function updateSupplierAccount(
  supplierId: string,
  input: { password?: string | null; isActive?: boolean; commissionRate?: number | null; settlementCycle?: SupplierSettlementCycle }
) {
  return guarded(async () => {
    const db = getDb();
    const current = (await db.select().from(supplierAccounts).where(eq(supplierAccounts.supplierId, supplierId)).limit(1))[0];
    if (!current) fail("이 공급사에는 로그인 계정이 없어요.", 404);
    const patch: Partial<typeof supplierAccounts.$inferInsert> = { updatedAt: new Date().toISOString() };
    if (input.commissionRate !== undefined) patch.commissionRate = clampCommission(input.commissionRate);
    if (input.settlementCycle) patch.settlementCycle = input.settlementCycle === "weekly" ? "weekly" : "monthly";
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (input.password) {
      validatePassword(input.password);
      await db.update(account)
        .set({ password: await hashPassword(input.password), updatedAt: new Date() })
        .where(and(eq(account.userId, current.userId), eq(account.providerId, "credential")));
    }
    await db.update(supplierAccounts).set(patch).where(eq(supplierAccounts.id, current.id));
    // 비밀번호를 바꾸거나 계정을 멈추면 로그인해 있던 기기에서도 바로 로그아웃됩니다.
    if (input.password || input.isActive === false) await revokeSessions(current.userId);
    const row = (await db.select().from(supplierAccounts).where(eq(supplierAccounts.id, current.id)).limit(1))[0];
    return accountView(row);
  });
}

export async function deleteSupplierAccount(supplierId: string) {
  return guarded(async () => {
    const db = getDb();
    const current = (await db.select().from(supplierAccounts).where(eq(supplierAccounts.supplierId, supplierId)).limit(1))[0];
    if (!current) fail("이 공급사에는 로그인 계정이 없어요.", 404);
    await db.transaction(async (tx) => {
      await tx.delete(session).where(eq(session.userId, current.userId));
      await tx.delete(account).where(eq(account.userId, current.userId));
      await tx.delete(supplierAccounts).where(eq(supplierAccounts.id, current.id));
      await tx.delete(user).where(eq(user.id, current.userId));
    });
    console.info(`[supplier] account deleted for supplier ${supplierId}`);
    return { supplierId, username: current.username };
  });
}

// 공급사 이름이 바뀌면 상품·판매 내역의 공급사 이름도 함께 바꿔 연결이 끊기지 않게 합니다.
export async function renameSupplierLinks(oldName: string, newName: string) {
  if (!oldName || oldName === newName) return;
  const db = getDb();
  await db.update(products).set({ supplierName: newName }).where(eq(products.supplierName, oldName));
  try {
    await db.update(supplierSales).set({ supplierName: newName }).where(eq(supplierSales.supplierName, oldName));
  } catch (error) {
    if (!isMissingSupplierTable(error)) throw error;
  }
}

// ── 공급사 로그인 확인 ────────────────────────────────────────────────────
export type SupplierContext = { account: SupplierAccount; supplier: Supplier };

export async function getSupplierContext(userId: string): Promise<SupplierContext | null> {
  return guarded(async () => {
    const rows = await getDb()
      .select({ account: supplierAccounts, supplier: suppliers })
      .from(supplierAccounts)
      .innerJoin(suppliers, eq(suppliers.id, supplierAccounts.supplierId))
      .where(eq(supplierAccounts.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  });
}

export async function touchSupplierLogin(accountId: string) {
  await getDb().update(supplierAccounts).set({ lastLoginAt: new Date().toISOString() }).where(eq(supplierAccounts.id, accountId));
}

export function supplierProfile(context: SupplierContext) {
  const { supplier, account: row } = context;
  return {
    supplier: {
      id: supplier.id,
      name: supplier.name,
      representative: supplier.representative,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      businessNumber: supplier.businessNumber
    },
    account: accountView(row)
  };
}

export async function changeSupplierPassword(context: SupplierContext, currentPassword: string, newPassword: string, keepSessionId?: string | null) {
  const db = getDb();
  const credential = (await db.select().from(account)
    .where(and(eq(account.userId, context.account.userId), eq(account.providerId, "credential"))).limit(1))[0];
  if (!credential?.password) fail("비밀번호를 바꿀 수 없는 계정이에요. 두고푸드에 문의해 주세요.");
  const valid = await verifyPassword({ hash: credential.password, password: currentPassword });
  if (!valid) fail("지금 비밀번호가 맞지 않아요.");
  validatePassword(newPassword);
  await db.update(account).set({ password: await hashPassword(newPassword), updatedAt: new Date() }).where(eq(account.id, credential.id));
  // 이 기기는 그대로 두고 다른 기기의 로그인은 끊습니다.
  const sessions = await db.select({ id: session.id }).from(session).where(eq(session.userId, context.account.userId));
  const others = sessions.map((row) => row.id).filter((id) => id !== keepSessionId);
  if (others.length > 0) await db.delete(session).where(inArray(session.id, others));
  return { changed: true };
}

// ── 공급사 상품 ─────────────────────────────────────────────────────────
type SupplierProductRow = Pick<Product,
  "id" | "productCode" | "name" | "imageUrl" | "origin" | "costPrice" | "salePrice" | "salePriceMode" | "saleStartMonth" | "saleEndMonth"
  | "isAlwaysOnSale" | "shippingType" | "categoryId" | "isVisible" | "isSoldOut" | "isSeasonEnded" | "createdAt" | "updatedAt">;

// 두고푸드 A단가·일반공급가(셀러에게 파는 값)는 공급사 화면에 보내지 않습니다. 공급가(= 원가)와 권장 판매가만 보냅니다.
const supplierProductColumns = {
  id: products.id,
  productCode: products.productCode,
  name: products.name,
  imageUrl: products.imageUrl,
  origin: products.origin,
  costPrice: products.costPrice,
  salePrice: products.salePrice,
  salePriceMode: products.salePriceMode,
  saleStartMonth: products.saleStartMonth,
  saleEndMonth: products.saleEndMonth,
  isAlwaysOnSale: products.isAlwaysOnSale,
  shippingType: products.shippingType,
  categoryId: products.categoryId,
  isVisible: products.isVisible,
  isSoldOut: products.isSoldOut,
  isSeasonEnded: products.isSeasonEnded,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt
};

export async function listSupplierProducts(context: SupplierContext) {
  return guarded(async () => {
    const db = getDb();
    const rows: SupplierProductRow[] = await db.select(supplierProductColumns).from(products)
      .where(and(eq(products.supplierName, context.supplier.name), sql`${products.deletedAt} IS NULL`))
      .orderBy(asc(products.displayOrder), asc(products.name));
    const categoryRows = await db.select({ id: categories.id, name: categories.name }).from(categories);
    const categoryName = new Map(categoryRows.map((row) => [row.id, row.name]));
    const pending = rows.length === 0 ? [] : await db.select({ id: supplierRequests.id, productId: supplierRequests.productId, createdAt: supplierRequests.createdAt })
      .from(supplierRequests)
      .where(and(eq(supplierRequests.supplierId, context.supplier.id), eq(supplierRequests.status, "pending"), eq(supplierRequests.kind, "update")));
    const pendingByProduct = new Map(pending.map((row) => [row.productId, row]));
    return {
      products: rows.map((row) => ({
        ...row,
        categoryName: categoryName.get(row.categoryId) ?? null,
        pendingRequestId: pendingByProduct.get(row.id)?.id ?? null
      }))
    };
  });
}

export async function listSupplierCategories() {
  const rows = await getDb().select({ id: categories.id, name: categories.name, shippingType: categories.shippingType, sortOrder: categories.sortOrder })
    .from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.sortOrder), asc(categories.name));
  return { categories: rows };
}

// ── 변경 요청 ────────────────────────────────────────────────────────────
function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export type SupplierRequestView = Omit<SupplierRequest, "changes" | "snapshot"> & {
  changes: SupplierProductChanges;
  snapshot: Partial<Record<SupplierChangeField, unknown>> | null;
};

function requestView(row: SupplierRequest): SupplierRequestView {
  return { ...row, changes: parseJson<SupplierProductChanges>(row.changes, {}), snapshot: parseJson<Partial<Record<SupplierChangeField, unknown>> | null>(row.snapshot, null) };
}

function sameValue(first: unknown, second: unknown) {
  const normalize = (value: unknown) => (value === undefined || value === "" ? null : value);
  return normalize(first) === normalize(second);
}

// 판매가·판매기간 값을 서로 맞춥니다(자율이면 판매가 비움, 상시 판매면 판매월 비움).
function tidyChanges(changes: SupplierProductChanges, base: Partial<SupplierProductChanges>) {
  const next: SupplierProductChanges = { ...changes };
  const mode = next.salePriceMode ?? base.salePriceMode ?? "autonomous";
  if (mode === "autonomous" && ("salePriceMode" in next || "salePrice" in next)) next.salePrice = null;
  if (mode === "fixed" && ("salePriceMode" in next || "salePrice" in next)) {
    const price = next.salePrice ?? base.salePrice ?? null;
    if (!price || price <= 0) fail("권장 판매가를 지정하려면 금액을 입력해 주세요.");
    next.salePrice = price;
  }
  const always = next.isAlwaysOnSale ?? base.isAlwaysOnSale ?? false;
  if ("isAlwaysOnSale" in next || "saleStartMonth" in next || "saleEndMonth" in next) {
    if (always) {
      next.saleStartMonth = null;
      next.saleEndMonth = null;
    } else {
      const start = next.saleStartMonth ?? base.saleStartMonth ?? null;
      const end = next.saleEndMonth ?? base.saleEndMonth ?? null;
      if ((start && !end) || (!start && end)) fail("판매 시작월과 종료월을 함께 골라 주세요.");
      next.saleStartMonth = start;
      next.saleEndMonth = end;
    }
  }
  if (typeof next.name === "string") next.name = next.name.trim();
  if (typeof next.origin === "string") next.origin = next.origin.trim() || null;
  if (typeof next.description === "string") next.description = next.description.trim() || null;
  return next;
}

function pickFields(source: Record<string, unknown>, fields: readonly SupplierChangeField[]) {
  const picked: Record<string, unknown> = {};
  for (const field of fields) if (field in source && source[field] !== undefined) picked[field] = source[field];
  return picked as SupplierProductChanges;
}

export async function createSupplierRequest(
  context: SupplierContext,
  input: { kind: "update" | "create"; productId?: string | null; changes: SupplierProductChanges; note?: string | null }
) {
  return guarded(async () => {
    const db = getDb();
    const note = input.note?.trim() || null;
    const now = new Date().toISOString();
    if (input.kind === "update") {
      if (!input.productId) fail("수정할 상품을 골라 주세요.");
      const product = (await db.select(supplierProductColumns).from(products)
        .where(and(eq(products.id, input.productId), eq(products.supplierName, context.supplier.name), sql`${products.deletedAt} IS NULL`))
        .limit(1))[0];
      if (!product) fail("내 상품이 아니거나 찾을 수 없는 상품이에요.", 404);
      const snapshot = pickFields(product as unknown as Record<string, unknown>, SUPPLIER_UPDATE_FIELDS);
      const requested = tidyChanges(pickFields(input.changes as Record<string, unknown>, SUPPLIER_UPDATE_FIELDS), snapshot);
      const changes: SupplierProductChanges = {};
      for (const field of SUPPLIER_UPDATE_FIELDS) {
        if (field in requested && !sameValue(requested[field], snapshot[field])) Object.assign(changes, { [field]: requested[field] });
      }
      if (Object.keys(changes).length === 0) fail("바뀐 내용이 없어요. 바꿀 값을 고친 뒤 보내 주세요.");
      // 같은 상품에 승인 대기 중인 요청이 있으면 새 내용으로 바꿉니다(요청이 쌓이지 않게).
      const existing = (await db.select().from(supplierRequests)
        .where(and(eq(supplierRequests.supplierId, context.supplier.id), eq(supplierRequests.productId, product.id), eq(supplierRequests.status, "pending")))
        .limit(1))[0];
      if (existing) {
        await db.update(supplierRequests).set({
          changes: JSON.stringify(changes),
          snapshot: JSON.stringify(snapshot),
          productName: product.name,
          note,
          updatedAt: now
        }).where(eq(supplierRequests.id, existing.id));
        const row = (await db.select().from(supplierRequests).where(eq(supplierRequests.id, existing.id)).limit(1))[0];
        return { request: requestView(row), replaced: true };
      }
      const id = crypto.randomUUID();
      await db.insert(supplierRequests).values({
        id,
        supplierId: context.supplier.id,
        supplierName: context.supplier.name,
        productId: product.id,
        productName: product.name,
        kind: "update",
        status: "pending",
        changes: JSON.stringify(changes),
        snapshot: JSON.stringify(snapshot),
        note,
        createdAt: now,
        updatedAt: now
      });
      const row = (await db.select().from(supplierRequests).where(eq(supplierRequests.id, id)).limit(1))[0];
      console.info(`[supplier] update request ${id} from supplier ${context.supplier.id}`);
      return { request: requestView(row), replaced: false };
    }

    const changes = tidyChanges(pickFields(input.changes as Record<string, unknown>, SUPPLIER_CREATE_FIELDS), {});
    if (!changes.name) fail("상품명을 입력해 주세요.");
    if (typeof changes.costPrice !== "number" || changes.costPrice <= 0) fail("공급가를 입력해 주세요.");
    changes.shippingType = changes.shippingType === "overseas" ? "overseas" : "domestic";
    if (changes.categoryId) {
      const category = (await db.select({ id: categories.id }).from(categories).where(eq(categories.id, changes.categoryId)).limit(1))[0];
      if (!category) changes.categoryId = null;
    }
    const id = crypto.randomUUID();
    await db.insert(supplierRequests).values({
      id,
      supplierId: context.supplier.id,
      supplierName: context.supplier.name,
      productId: null,
      productName: changes.name,
      kind: "create",
      status: "pending",
      changes: JSON.stringify(changes),
      snapshot: null,
      note,
      createdAt: now,
      updatedAt: now
    });
    const row = (await db.select().from(supplierRequests).where(eq(supplierRequests.id, id)).limit(1))[0];
    console.info(`[supplier] create request ${id} from supplier ${context.supplier.id}`);
    return { request: requestView(row), replaced: false };
  });
}

export async function cancelSupplierRequest(context: SupplierContext, id: string) {
  return guarded(async () => {
    const db = getDb();
    const row = (await db.select().from(supplierRequests).where(and(eq(supplierRequests.id, id), eq(supplierRequests.supplierId, context.supplier.id))).limit(1))[0];
    if (!row) fail("요청을 찾을 수 없어요.", 404);
    if (row.status !== "pending") fail("이미 처리된 요청은 취소할 수 없어요.", 409);
    await db.update(supplierRequests).set({ status: "cancelled", updatedAt: new Date().toISOString() }).where(eq(supplierRequests.id, id));
    return { id, status: "cancelled" as const };
  });
}

export async function listSupplierRequests(context: SupplierContext) {
  return guarded(async () => {
    const rows = await getDb().select().from(supplierRequests)
      .where(eq(supplierRequests.supplierId, context.supplier.id))
      .orderBy(desc(supplierRequests.updatedAt))
      .limit(300);
    return { requests: rows.map(requestView) };
  });
}

// ── 관리자: 변경 요청 처리 ──────────────────────────────────────────────
const requestStatuses: SupplierRequestStatus[] = ["pending", "approved", "rejected", "cancelled"];

export async function pendingSupplierRequestCount() {
  try {
    const rows = await getDb().select({ count: sql<number>`count(*)` }).from(supplierRequests).where(eq(supplierRequests.status, "pending"));
    return { pending: Number(rows[0]?.count ?? 0), portalReady: true };
  } catch (error) {
    if (!isMissingSupplierTable(error)) throw error;
    return { pending: 0, portalReady: false };
  }
}

export async function listAdminSupplierRequests(status: SupplierRequestStatus | "all") {
  return guarded(async () => {
    const db = getDb();
    const where = status === "all" ? undefined : eq(supplierRequests.status, status);
    const rows = await db.select().from(supplierRequests).where(where).orderBy(desc(supplierRequests.createdAt)).limit(500);
    const countRows = await db.select({ status: supplierRequests.status, count: sql<number>`count(*)` }).from(supplierRequests).groupBy(supplierRequests.status);
    const counts = Object.fromEntries(requestStatuses.map((key) => [key, 0])) as Record<SupplierRequestStatus, number>;
    for (const row of countRows) if (requestStatuses.includes(row.status)) counts[row.status] = Number(row.count);
    const productIds = [...new Set(rows.map((row) => row.productId).filter((id): id is string => Boolean(id)))];
    const currentRows = productIds.length === 0 ? [] : await db.select({
      id: products.id,
      productCode: products.productCode,
      name: products.name,
      imageUrl: products.imageUrl,
      costPrice: products.costPrice,
      aPrice: products.aPrice,
      generalPrice: products.generalPrice,
      salePrice: products.salePrice,
      salePriceMode: products.salePriceMode,
      categoryId: products.categoryId,
      isVisible: products.isVisible,
      isSoldOut: products.isSoldOut,
      deletedAt: products.deletedAt
    }).from(products).where(inArray(products.id, productIds));
    const current = new Map(currentRows.map((row) => [row.id, row]));
    const categoryRows = await db.select({ id: categories.id, name: categories.name, shippingType: categories.shippingType, isActive: categories.isActive, sortOrder: categories.sortOrder })
      .from(categories).orderBy(asc(categories.sortOrder));
    const policyRows = await db.select({ id: shippingPolicies.id, name: shippingPolicies.name, shippingType: shippingPolicies.shippingType, isActive: shippingPolicies.isActive })
      .from(shippingPolicies).where(eq(shippingPolicies.isActive, true)).orderBy(asc(shippingPolicies.sortOrder));
    return {
      requests: rows.map((row) => ({ ...requestView(row), current: row.productId ? current.get(row.productId) ?? null : null })),
      counts,
      categories: categoryRows,
      shippingPolicies: policyRows
    };
  });
}

function productToInput(product: Product, options: ProductOption[]): ProductInput {
  return {
    productCode: product.productCode,
    name: product.name,
    imageUrl: product.imageUrl,
    origin: product.origin,
    supplierName: product.supplierName,
    costPrice: product.costPrice,
    aPrice: product.aPrice,
    generalPrice: product.generalPrice,
    salePrice: product.salePrice,
    salePriceMode: product.salePriceMode,
    saleStartMonth: product.saleStartMonth,
    saleEndMonth: product.saleEndMonth,
    isAlwaysOnSale: product.isAlwaysOnSale,
    shippingFee: product.shippingFee,
    releaseInfo: product.releaseInfo,
    notes: product.notes,
    optionsInfo: product.optionsInfo,
    packaging: product.packaging,
    courier: product.courier,
    shippingPolicyId: product.shippingPolicyId,
    shippingType: product.shippingType,
    categoryId: product.categoryId,
    isVisible: product.isVisible,
    isSoldOut: product.isSoldOut,
    isSeasonEnded: product.isSeasonEnded,
    options: options.map((option) => ({
      id: option.id,
      name: option.name,
      costPrice: option.costPrice,
      aPrice: option.aPrice,
      generalPrice: option.generalPrice,
      salePrice: option.salePrice,
      salePriceMode: option.salePriceMode,
      isSoldOut: option.isSoldOut,
      sortOrder: option.sortOrder
    }))
  };
}

export type ApproveInput = {
  // 수정 요청: 승인하면서 두고푸드 판매가를 함께 고칠 수 있습니다(비우면 지금 값 그대로)
  aPrice?: number | null;
  generalPrice?: number | null;
  costPrice?: number | null;
  // 신규 등록 요청: 상품코드·카테고리는 꼭 필요합니다
  productCode?: string | null;
  categoryId?: string | null;
  shippingType?: "domestic" | "overseas" | null;
  shippingPolicyId?: string | null;
  isVisible?: boolean;
  note?: string | null;
};

function applyChanges(input: ProductInput, changes: SupplierProductChanges) {
  const next = { ...input };
  for (const field of SUPPLIER_UPDATE_FIELDS) {
    if (!(field in changes)) continue;
    const value = changes[field];
    switch (field) {
      case "name": if (typeof value === "string" && value.trim()) next.name = value.trim(); break;
      case "imageUrl": next.imageUrl = (value as string | null) || null; break;
      case "origin": next.origin = (value as string | null) || null; break;
      case "costPrice": if (typeof value === "number") next.costPrice = value; break;
      case "salePriceMode": next.salePriceMode = value === "fixed" ? "fixed" : "autonomous"; break;
      case "salePrice": next.salePrice = typeof value === "number" ? value : null; break;
      case "isAlwaysOnSale": next.isAlwaysOnSale = Boolean(value); break;
      case "saleStartMonth": next.saleStartMonth = typeof value === "number" ? value : null; break;
      case "saleEndMonth": next.saleEndMonth = typeof value === "number" ? value : null; break;
      case "isSoldOut": next.isSoldOut = Boolean(value); break;
    }
  }
  if (next.salePriceMode === "autonomous") next.salePrice = null;
  return next;
}

export async function approveSupplierRequest(id: string, input: ApproveInput, reviewer: string) {
  return guarded(async () => {
    const db = getDb();
    const request = (await db.select().from(supplierRequests).where(eq(supplierRequests.id, id)).limit(1))[0];
    if (!request) fail("요청을 찾을 수 없어요.", 404);
    if (request.status !== "pending") fail("이미 처리된 요청이에요.", 409);
    const changes = parseJson<SupplierProductChanges>(request.changes, {});
    const changedBy = `${reviewer} · 공급사 요청(${request.supplierName})`;
    let productId = request.productId;
    if (request.kind === "update") {
      if (!request.productId) fail("요청에 상품이 없어요.");
      const product = (await db.select().from(products).where(and(eq(products.id, request.productId), sql`${products.deletedAt} IS NULL`)).limit(1))[0];
      if (!product) fail("삭제되었거나 찾을 수 없는 상품이에요. 요청을 반려해 주세요.", 404);
      const options = await db.select().from(productOptions).where(eq(productOptions.productId, product.id)).orderBy(asc(productOptions.sortOrder));
      const next = applyChanges(productToInput(product, options), changes);
      if (typeof input.costPrice === "number") next.costPrice = input.costPrice;
      if (typeof input.aPrice === "number") next.aPrice = input.aPrice;
      if (typeof input.generalPrice === "number") next.generalPrice = input.generalPrice;
      await updateProduct(product.id, next, changedBy);
    } else {
      const productCode = input.productCode?.trim();
      if (!productCode) fail("승인하려면 상품코드를 입력해 주세요.");
      const categoryId = input.categoryId || changes.categoryId;
      if (!categoryId) fail("승인하려면 카테고리를 골라 주세요.");
      const supplier = (await db.select({ name: suppliers.name }).from(suppliers).where(eq(suppliers.id, request.supplierId)).limit(1))[0];
      const costPrice = typeof input.costPrice === "number" ? input.costPrice : changes.costPrice ?? 0;
      const created = await createProduct({
        productCode,
        name: changes.name || request.productName,
        imageUrl: changes.imageUrl ?? null,
        origin: changes.origin ?? null,
        supplierName: supplier?.name ?? request.supplierName,
        costPrice,
        aPrice: typeof input.aPrice === "number" ? input.aPrice : 0,
        generalPrice: typeof input.generalPrice === "number" ? input.generalPrice : 0,
        salePrice: changes.salePriceMode === "fixed" ? changes.salePrice ?? null : null,
        salePriceMode: changes.salePriceMode === "fixed" ? "fixed" : "autonomous",
        saleStartMonth: changes.isAlwaysOnSale ? null : changes.saleStartMonth ?? null,
        saleEndMonth: changes.isAlwaysOnSale ? null : changes.saleEndMonth ?? null,
        isAlwaysOnSale: Boolean(changes.isAlwaysOnSale),
        shippingType: input.shippingType ?? changes.shippingType ?? "domestic",
        shippingPolicyId: input.shippingPolicyId || null,
        categoryId,
        notes: changes.description ? `[공급사 설명] ${changes.description}` : null,
        isVisible: input.isVisible ?? true,
        isSoldOut: Boolean(changes.isSoldOut)
      });
      productId = created.id;
    }
    const now = new Date().toISOString();
    await db.update(supplierRequests).set({
      status: "approved",
      productId,
      reviewedBy: reviewer,
      reviewedAt: now,
      reviewNote: input.note?.trim() || null,
      updatedAt: now
    }).where(eq(supplierRequests.id, id));
    console.info(`[supplier] request ${id} approved`);
    const row = (await db.select().from(supplierRequests).where(eq(supplierRequests.id, id)).limit(1))[0];
    return { request: requestView(row) };
  });
}

export async function rejectSupplierRequest(id: string, reason: string | null | undefined, reviewer: string) {
  return guarded(async () => {
    const db = getDb();
    const request = (await db.select().from(supplierRequests).where(eq(supplierRequests.id, id)).limit(1))[0];
    if (!request) fail("요청을 찾을 수 없어요.", 404);
    if (request.status !== "pending") fail("이미 처리된 요청이에요.", 409);
    const now = new Date().toISOString();
    await db.update(supplierRequests).set({
      status: "rejected",
      reviewedBy: reviewer,
      reviewedAt: now,
      reviewNote: reason?.trim() || null,
      updatedAt: now
    }).where(eq(supplierRequests.id, id));
    console.info(`[supplier] request ${id} rejected`);
    const row = (await db.select().from(supplierRequests).where(eq(supplierRequests.id, id)).limit(1))[0];
    return { request: requestView(row) };
  });
}

// ── 판매·정산 ────────────────────────────────────────────────────────────
type DayTotals = { saleAmount: number; saleQuantity: number; returnAmount: number; returnQuantity: number; orderCount: number };

function emptyDay(): DayTotals {
  return { saleAmount: 0, saleQuantity: 0, returnAmount: 0, returnQuantity: 0, orderCount: 0 };
}

async function salesRows(supplierName: string, start: string, end: string) {
  return getDb().select().from(supplierSales)
    .where(and(eq(supplierSales.supplierName, supplierName), gte(supplierSales.saleDate, start), lte(supplierSales.saleDate, end)))
    .orderBy(asc(supplierSales.saleDate));
}

function dayTotals(rows: Awaited<ReturnType<typeof salesRows>>) {
  const byDate = new Map<string, DayTotals>();
  for (const row of rows) {
    const day = byDate.get(row.saleDate) ?? emptyDay();
    if (row.kind === "return") {
      day.returnAmount += row.amount;
      day.returnQuantity += row.quantity;
    } else {
      day.saleAmount += row.amount;
      day.saleQuantity += row.quantity;
      day.orderCount += row.orderCount;
    }
    byDate.set(row.saleDate, day);
  }
  return byDate;
}

function netBetween(byDate: Map<string, DayTotals>, start: string, end: string) {
  let net = 0;
  for (const [date, day] of byDate) if (date >= start && date <= end) net += day.saleAmount - day.returnAmount;
  return net;
}

function settlementSummary(period: SettlementPeriod, byDate: Map<string, DayTotals>, rate: number) {
  const net = Math.max(0, netBetween(byDate, period.start, period.end));
  const commission = supplierCommission(net, rate);
  return { ...period, netAmount: net, commission, payoutAmount: net, netIncome: net - commission };
}

export async function getSupplierSalesMonth(context: SupplierContext, month: string, today = seoulDateKey()) {
  return guarded(async () => {
    const { start, end } = monthRange(month);
    const cycle: SupplierSettlementCycle = context.account.settlementCycle === "weekly" ? "weekly" : "monthly";
    const rate = context.account.commissionRate;
    // 입금일 표시를 위해 지난달 판매분과, 주 정산이면 이 달에 걸친 주 전체를 함께 읽습니다.
    const rangeStart = addDays(start, -40);
    const rangeEnd = addDays(end, 7);
    const rows = await salesRows(context.supplier.name, rangeStart, rangeEnd);
    const byDate = dayTotals(rows);
    const monthRows = rows.filter((row) => row.saleDate >= start && row.saleDate <= end);

    const days = [...byDate.entries()]
      .filter(([date]) => date >= start && date <= end)
      .map(([date, value]) => ({ date, ...value, netAmount: value.saleAmount - value.returnAmount }));

    const productMap = new Map<string, { productId: string | null; productCode: string | null; productName: string; quantity: number; amount: number; returnQuantity: number; returnAmount: number }>();
    for (const row of monthRows) {
      const key = row.productId || row.productCode || row.productName;
      const item = productMap.get(key) ?? { productId: row.productId, productCode: row.productCode, productName: row.productName, quantity: 0, amount: 0, returnQuantity: 0, returnAmount: 0 };
      if (row.kind === "return") {
        item.returnQuantity += row.quantity;
        item.returnAmount += row.amount;
      } else {
        item.quantity += row.quantity;
        item.amount += row.amount;
      }
      productMap.set(key, item);
    }
    const ranking = [...productMap.values()]
      .map((item) => ({ ...item, netAmount: item.amount - item.returnAmount, netQuantity: item.quantity - item.returnQuantity }))
      .sort((first, second) => second.netAmount - first.netAmount || second.netQuantity - first.netQuantity || first.productName.localeCompare(second.productName, "ko"));

    const totals = days.reduce((sum, day) => ({
      saleAmount: sum.saleAmount + day.saleAmount,
      saleQuantity: sum.saleQuantity + day.saleQuantity,
      returnAmount: sum.returnAmount + day.returnAmount,
      returnQuantity: sum.returnQuantity + day.returnQuantity,
      orderCount: sum.orderCount + day.orderCount
    }), emptyDay());
    const netAmount = totals.saleAmount - totals.returnAmount;
    const commission = supplierCommission(Math.max(0, netAmount), rate);

    // 이 달 판매분이 들어가는 정산(월 정산 1번, 주 정산은 이 달에 걸친 주마다)
    const periods: SettlementPeriod[] = [];
    if (cycle === "monthly") {
      periods.push(settlementPeriodFor(start, cycle));
    } else {
      for (let cursor = settlementPeriodFor(start, cycle); cursor.start <= end; cursor = settlementPeriodFor(addDays(cursor.end, 1), cycle)) periods.push(cursor);
    }
    // 이 달 달력에 찍을 입금일(지난 기간 판매분 포함)
    const payoutDays: Array<{ date: string; endDate: string; periodStart: string; periodEnd: string; amount: number; done: boolean }> = [];
    if (cycle === "monthly") {
      const previous = settlementPeriodFor(addDays(start, -1), cycle);
      payoutDays.push({ date: previous.payoutStart, endDate: previous.payoutEnd, periodStart: previous.start, periodEnd: previous.end, amount: Math.max(0, netBetween(byDate, previous.start, previous.end)), done: previous.payoutEnd < today });
    } else {
      for (let cursor = settlementPeriodFor(addDays(start, -7), cycle); cursor.payoutStart <= end; cursor = settlementPeriodFor(addDays(cursor.end, 1), cycle)) {
        if (cursor.payoutStart < start) continue;
        payoutDays.push({ date: cursor.payoutStart, endDate: cursor.payoutEnd, periodStart: cursor.start, periodEnd: cursor.end, amount: Math.max(0, netBetween(byDate, cursor.start, cursor.end)), done: cursor.payoutEnd < today });
      }
    }

    const hasAnySales = monthRows.length > 0 || (await getDb().select({ id: supplierSales.id }).from(supplierSales).where(eq(supplierSales.supplierName, context.supplier.name)).limit(1)).length > 0;
    return {
      month,
      today,
      cycle,
      commissionRate: rate,
      hasAnySales,
      totals: { ...totals, netAmount, commission, payoutAmount: Math.max(0, netAmount), netIncome: Math.max(0, netAmount) - commission },
      days,
      ranking,
      settlements: periods.map((period) => settlementSummary(period, byDate, rate)),
      payoutDays
    };
  });
}

export async function getSupplierDashboard(context: SupplierContext, today = seoulDateKey()) {
  return guarded(async () => {
    const db = getDb();
    const month = today.slice(0, 7);
    const sales = await getSupplierSalesMonth(context, month, today);
    const cycle: SupplierSettlementCycle = context.account.settlementCycle === "weekly" ? "weekly" : "monthly";
    const upcoming = upcomingSettlement(today, cycle);
    const upcomingRows = await salesRows(context.supplier.name, upcoming.start, upcoming.end);
    const upcomingSummary = settlementSummary(upcoming, dayTotals(upcomingRows), context.account.commissionRate);
    const productRows = await db.select({ isVisible: products.isVisible, isSoldOut: products.isSoldOut })
      .from(products)
      .where(and(eq(products.supplierName, context.supplier.name), sql`${products.deletedAt} IS NULL`));
    const requestRows = await db.select().from(supplierRequests)
      .where(eq(supplierRequests.supplierId, context.supplier.id))
      .orderBy(desc(supplierRequests.updatedAt))
      .limit(5);
    const pendingRows = await db.select({ count: sql<number>`count(*)` }).from(supplierRequests)
      .where(and(eq(supplierRequests.supplierId, context.supplier.id), eq(supplierRequests.status, "pending")));
    return {
      ...supplierProfile(context),
      today,
      month,
      sales: { totals: sales.totals, ranking: sales.ranking.slice(0, 5), hasAnySales: sales.hasAnySales, days: sales.days },
      upcomingSettlement: upcomingSummary,
      products: {
        total: productRows.length,
        soldOut: productRows.filter((row) => row.isSoldOut).length,
        hidden: productRows.filter((row) => !row.isVisible).length
      },
      requests: { pending: Number(pendingRows[0]?.count ?? 0), recent: requestRows.map(requestView) }
    };
  });
}
