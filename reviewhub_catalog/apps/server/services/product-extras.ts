// 상품 정보 칸(product_extras, migration 037) 읽기·저장. 발주오라 상품 등록 화면과 같은 칸(과세 여부·관리코드·바코드·내용량·
// 발주상품명·발주단위·배송 단위·발주마감·인증·간략설명·출고지·제조연월일·소비기한)을 상품 1개당 1행으로 둡니다.
// 미리보기 배포는 운영 DB를 쓰고 새 마이그레이션은 운영 배포 때만 적용되므로, 표가 없으면 읽기는 null(아직 없음), 저장은 안내 오류를 냅니다.
import { eq, inArray } from "drizzle-orm";
import { emptyProductExtras, hasProductExtras, normalizeProductExtras, type ProductExtras } from "@repo/shared/product-extras";
import { DatabaseError, getDb } from "../_core/db";
import { productExtras } from "../db/schema";

export const EXTRAS_NOT_READY_MESSAGE = "상품 정보 칸(과세 여부·관리코드·바코드 등)은 DB 업데이트(037)가 적용된 뒤 저장할 수 있어요. 운영 배포 후 다시 저장해 주세요.";

export function isMissingExtrasTable(error: unknown) {
  const texts = [error instanceof Error ? error.message : String(error), (error as { cause?: { message?: string } })?.cause?.message ?? ""];
  return texts.some((text) => /no such table/i.test(text) && text.includes("product_extras"));
}

type ExtrasRow = typeof productExtras.$inferSelect;

function parseKinds(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function extrasFromRow(row: ExtrasRow): ProductExtras {
  return normalizeProductExtras({ ...row, certificationKinds: parseKinds(row.certificationKinds) });
}

function rowValues(extras: ProductExtras) {
  return {
    isTaxable: extras.isTaxable,
    managementCode: extras.managementCode,
    barcode: extras.barcode,
    contentAmount: extras.contentAmount,
    contentUnit: extras.contentUnit,
    contentCount: extras.contentCount,
    contentBasis: extras.contentBasis,
    purchaseName: extras.purchaseName,
    purchaseQuantity: extras.purchaseQuantity,
    shippingUnitType: extras.shippingUnitType,
    shippingUnitValue: extras.shippingUnitValue,
    purchaseDeadline: extras.purchaseDeadline,
    certificationKinds: extras.certificationKinds.length > 0 ? JSON.stringify(extras.certificationKinds) : null,
    summary: extras.summary,
    shippingLocation: extras.shippingLocation,
    manufacturingDate: extras.manufacturingDate,
    expirationDate: extras.expirationDate,
    taxonomyItemId: extras.taxonomyItemId,
    taxonomyName: extras.taxonomyName
  };
}

// 상품 id → 상품 정보 칸. 표가 없으면(037 전 DB) null. 행이 없는 상품은 맵에 없습니다(빈 값으로 보면 됨).
export async function loadProductExtrasMap(productIds?: string[]): Promise<Map<string, ProductExtras> | null> {
  try {
    const db = getDb();
    if (productIds && productIds.length === 0) {
      // 고른 상품이 없어도 표가 있는지는 확인합니다(새로 만든 상품에 저장할 수 있는지).
      await db.select({ productId: productExtras.productId }).from(productExtras).limit(1);
      return new Map();
    }
    const rows: ExtrasRow[] = [];
    if (productIds) {
      for (let index = 0; index < productIds.length; index += 300) {
        rows.push(...await db.select().from(productExtras).where(inArray(productExtras.productId, productIds.slice(index, index + 300))));
      }
    } else {
      rows.push(...await db.select().from(productExtras));
    }
    return new Map(rows.map((row) => [row.productId, extrasFromRow(row)]));
  } catch (error) {
    if (isMissingExtrasTable(error)) return null;
    throw error;
  }
}

// 상품 1개: { ready: 표가 있는지, extras }. 표가 없으면 빈 값.
export async function getProductExtras(productId: string): Promise<{ ready: boolean; extras: ProductExtras }> {
  const map = await loadProductExtrasMap([productId]);
  if (!map) return { ready: false, extras: emptyProductExtras() };
  return { ready: true, extras: map.get(productId) ?? emptyProductExtras() };
}

// 저장(있으면 바꾸고 없으면 만듦). 모든 칸이 비면 행을 지웁니다. 표가 없으면 DatabaseError(503).
export async function saveProductExtras(productId: string, extras: ProductExtras) {
  try {
    const db = getDb();
    const value = normalizeProductExtras(extras);
    if (!hasProductExtras(value)) {
      await db.delete(productExtras).where(eq(productExtras.productId, productId));
      return value;
    }
    const updatedAt = new Date().toISOString();
    const values = rowValues(value);
    await db.insert(productExtras).values({ productId, ...values, updatedAt })
      .onConflictDoUpdate({ target: productExtras.productId, set: { ...values, updatedAt } });
    return value;
  } catch (error) {
    if (isMissingExtrasTable(error)) throw new DatabaseError("DATABASE_QUERY_FAILED", EXTRAS_NOT_READY_MESSAGE, 503);
    throw error;
  }
}

// 관리자 상품 창 저장: 관리자가 고칠 수 있는 칸만 바꾸고, 발주오라에서 가져온 칸(인증·상품 분류)은 그대로 둡니다.
export async function saveEditableProductExtras(productId: string, input: Partial<Record<keyof ProductExtras, unknown>>) {
  const current = await getProductExtras(productId);
  if (!current.ready) throw new DatabaseError("DATABASE_QUERY_FAILED", EXTRAS_NOT_READY_MESSAGE, 503);
  const next = normalizeProductExtras({
    ...input,
    certificationKinds: current.extras.certificationKinds,
    taxonomyItemId: current.extras.taxonomyItemId,
    taxonomyName: current.extras.taxonomyName
  });
  return saveProductExtras(productId, next);
}

// 발주오라에서 가져온 칸만 덮어씁니다(나머지 칸은 그대로).
export async function patchProductExtras(productId: string, patch: Partial<ProductExtras>) {
  const current = await getProductExtras(productId);
  if (!current.ready) throw new DatabaseError("DATABASE_QUERY_FAILED", EXTRAS_NOT_READY_MESSAGE, 503);
  return saveProductExtras(productId, { ...current.extras, ...patch });
}
