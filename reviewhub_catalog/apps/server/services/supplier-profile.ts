// 공급사 필수 정보(사업자등록번호 · 정산 계좌, 2026-11-27 관리자 요청 "공급사가 로그인할 때 무조건 적게 — 팝업, 적으면 자동 저장,
// 자기 설정 페이지에서 쉽게 변경, 공급사가 바꾸면 관리자에게 '공급사가 변경했다' 알림 로그").
// - 값은 원래 자리에 저장합니다: 사업자등록번호 = suppliers.businessNumber(공급사 관리와 같은 칸),
//   정산 계좌 = 거래명세서 입금 계좌(baljuora_sync_store "supplier_bank_accounts"). 그래서 거래명세서 To 칸에 바로 들어갑니다.
// - 공급사가 등록·변경하면 supplier_profile_changes(migration 038)에 1행: 바뀐 칸과 전 → 후(계좌는 끝 4자리만).
//   migration 038 전 DB(운영 DB를 쓰는 미리보기)에서는 기록만 건너뛰고 저장은 그대로 합니다.
// - 로그(console)에는 사업자등록번호·계좌 값을 남기지 않습니다.
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { SupplierBankAccount } from "@repo/shared/supplier-invoice";
import {
  SUPPLIER_PROFILE_FIELDS,
  missingSupplierProfile,
  parseBusinessNumber,
  parseRequiredBankAccount,
  profileChangeSummary,
  type SupplierProfileChange,
  type SupplierProfileField
} from "@repo/shared/supplier-profile";
import { DatabaseError, getDb } from "../_core/db";
import { supplierProfileChanges, suppliers, type SupplierProfileChangeRow } from "../db/schema";
import { getSupplierBankAccount, saveSupplierBankAccount } from "./supplier-invoice";
import type { SupplierContext } from "./supplier-portal";

function fail(message: string, status = 400): never {
  throw new DatabaseError("DATABASE_QUERY_FAILED", message, status);
}

/** migration 038 전 DB인지(기록 표가 없음) */
export function isMissingProfileChangeTable(error: unknown) {
  const texts = [error instanceof Error ? error.message : String(error), (error as { cause?: { message?: string } })?.cause?.message ?? ""];
  return texts.some((text) => text.includes("no such table") && text.includes("supplier_profile_changes"));
}

export type SupplierPayoutProfile = {
  businessNumber: string | null;
  bank: SupplierBankAccount | null;
  /** 아직 없는(또는 틀린) 칸 — 하나라도 있으면 공급사 센터가 닫을 수 없는 팝업을 띄웁니다. */
  missing: SupplierProfileField[];
};

async function currentPayout(supplierId: string) {
  const row = (await getDb().select({ name: suppliers.name, businessNumber: suppliers.businessNumber }).from(suppliers).where(eq(suppliers.id, supplierId)).limit(1))[0];
  if (!row) fail("공급사를 찾지 못했어요. 두고푸드에 문의해 주세요.", 404);
  const bank = await getSupplierBankAccount(supplierId);
  return { name: row.name, businessNumber: row.businessNumber?.trim() || null, bank };
}

/** 공급사 센터(본인)용: 사업자등록번호 · 정산 계좌(전체) · 빠진 칸 */
export async function supplierPayoutProfile(context: SupplierContext): Promise<SupplierPayoutProfile> {
  const bank = await getSupplierBankAccount(context.supplier.id);
  const businessNumber = context.supplier.businessNumber?.trim() || null;
  return { businessNumber, bank, missing: missingSupplierProfile({ businessNumber, bank }) };
}

/**
 * 공급사가 필수 정보 팝업·내 정보에서 저장. 사업자등록번호(검증 숫자까지)와 정산 계좌 세 칸이 모두 있어야 합니다.
 * 바뀐 칸이 있으면 관리자 알림 기록을 남깁니다(값이 같으면 저장만, 기록 없음).
 */
export async function saveSupplierPayoutProfile(context: SupplierContext, input: Record<string, unknown>) {
  const number = parseBusinessNumber(input.businessNumber);
  if (!number.value) fail(number.error ?? "사업자등록번호를 확인해 주세요.");
  const bank = parseRequiredBankAccount(input);
  if (!bank.value) fail(bank.error ?? "정산 받을 계좌를 확인해 주세요.");
  const supplierId = context.supplier.id;
  // 다른 기기·관리자가 그사이 바꿨을 수 있어 지금 값을 다시 읽어 비교합니다.
  const before = await currentPayout(supplierId);
  const change = profileChangeSummary({ businessNumber: before.businessNumber, bank: before.bank }, { businessNumber: number.value, bank: bank.value });
  if (before.businessNumber !== number.value) {
    await getDb().update(suppliers).set({ businessNumber: number.value, updatedAt: new Date().toISOString() }).where(eq(suppliers.id, supplierId));
  }
  if (change.fields.includes("bank")) await saveSupplierBankAccount(supplierId, bank.value, `공급사 ${context.account.username}`);
  let logged = false;
  if (change.fields.length > 0) {
    logged = await recordProfileChange({ supplierId, supplierName: before.name, changedBy: context.account.username, fields: change.fields, summary: change.summary });
  }
  console.info(`[supplier] payout profile saved for supplier ${supplierId}: ${change.fields.join(",") || "no change"}${change.fields.length && !logged ? " (log skipped)" : ""}`);
  return {
    businessNumber: number.value,
    bank: bank.value,
    missing: [] as SupplierProfileField[],
    changed: change.fields
  };
}

async function recordProfileChange(entry: { supplierId: string; supplierName: string; changedBy: string | null; fields: SupplierProfileField[]; summary: SupplierProfileChange["summary"] }) {
  try {
    await getDb().insert(supplierProfileChanges).values({
      id: crypto.randomUUID(),
      supplierId: entry.supplierId,
      supplierName: entry.supplierName,
      changedBy: entry.changedBy ? entry.changedBy.slice(0, 120) : null,
      fields: JSON.stringify(entry.fields),
      summary: JSON.stringify(entry.summary),
      createdAt: new Date().toISOString()
    });
    return true;
  } catch (error) {
    if (isMissingProfileChangeTable(error)) return false;
    throw error;
  }
}

// ── 관리자: 공급사 정보 변경 알림 ─────────────────────────────────────────────

function parseJson<T>(text: string | null, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function changeView(row: SupplierProfileChangeRow): SupplierProfileChange {
  const fields = parseJson<unknown[]>(row.fields, []).filter((field): field is SupplierProfileField => SUPPLIER_PROFILE_FIELDS.includes(field as SupplierProfileField));
  const rawSummary = parseJson<Record<string, unknown>>(row.summary, {});
  const summary: SupplierProfileChange["summary"] = {};
  for (const field of fields) {
    const value = rawSummary[field] as { before?: unknown; after?: unknown } | undefined;
    summary[field] = {
      before: typeof value?.before === "string" ? value.before : null,
      after: typeof value?.after === "string" ? value.after : null
    };
  }
  return {
    id: row.id,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    changedBy: row.changedBy,
    fields,
    summary,
    checkedAt: row.checkedAt,
    checkedBy: row.checkedBy,
    createdAt: row.createdAt
  };
}

/** 확인하지 않은 알림 수(기록 표가 없으면 0) */
export async function countUncheckedProfileChanges() {
  try {
    const row = (await getDb().select({ count: sql<number>`count(*)` }).from(supplierProfileChanges).where(isNull(supplierProfileChanges.checkedAt)))[0];
    return Number(row?.count ?? 0);
  } catch (error) {
    if (isMissingProfileChangeTable(error)) return 0;
    throw error;
  }
}

/** 알림 목록: scope "unchecked"(확인 전만) · "all"(최근 기록). 기록 표가 없으면 available false. */
export async function listSupplierProfileChanges(options: { scope: "unchecked" | "all"; limit: number }) {
  const limit = Math.min(200, Math.max(1, Math.floor(options.limit) || 30));
  try {
    const db = getDb();
    const where = options.scope === "unchecked" ? isNull(supplierProfileChanges.checkedAt) : undefined;
    const rows = await db.select().from(supplierProfileChanges).where(where).orderBy(desc(supplierProfileChanges.createdAt), desc(supplierProfileChanges.id)).limit(limit);
    return { available: true, unchecked: await countUncheckedProfileChanges(), changes: rows.map(changeView) };
  } catch (error) {
    if (isMissingProfileChangeTable(error)) return { available: false, unchecked: 0, changes: [] as SupplierProfileChange[] };
    throw error;
  }
}

/** 알림 확인(ids가 없으면 확인 전 알림 모두) */
export async function checkSupplierProfileChanges(ids: string[] | null, checkedBy: string | null) {
  const db = getDb();
  const now = new Date().toISOString();
  try {
    const target = ids && ids.length > 0
      ? and(isNull(supplierProfileChanges.checkedAt), inArray(supplierProfileChanges.id, ids.slice(0, 200)))
      : isNull(supplierProfileChanges.checkedAt);
    await db.update(supplierProfileChanges).set({ checkedAt: now, checkedBy: checkedBy ? checkedBy.slice(0, 120) : null }).where(target);
    return { unchecked: await countUncheckedProfileChanges() };
  } catch (error) {
    if (isMissingProfileChangeTable(error)) fail("공급사 정보 변경 기록은 운영 배포(DB 업데이트 038)가 끝난 뒤 쓸 수 있어요.", 503);
    throw error;
  }
}
