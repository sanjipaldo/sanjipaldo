import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { DatabaseError, getDb } from "../_core/db";
import { contentSettings, priceHistories, productGroupItems, productGroups, products } from "../db/schema";
import {
  PRICE_TREND_DAYS,
  PRODUCT_GROUP_EXCLUSIONS_KEY,
  parseGroupExclusions,
  productGroupKey,
  suggestProductGroups,
  type ProductOptionTrend,
  type ProductOptionsDetail,
  type PublicProductGroup
} from "@repo/shared/product-groups";

// 옵션 묶음(2026-11-21 관리자 요청): 사이즈·등급별로 따로 등록한 단일 상품을 공개 단가표에서 카드 하나 + 옵션 팝업으로 보여 줍니다.
// - 상품 데이터(가격·품절·노출·상품코드)는 상품마다 그대로이고, 묶음은 "어떤 상품을 같이 보여 줄지"만 정합니다.
// - 상품 하나는 묶음 하나에만 들어갑니다(다른 묶음에 넣으면 원래 묶음에서 빠지고, 비게 된 묶음은 지웁니다).
// - 자동 묶음(2026-11-22): 저장한 묶음에 없는 공개 상품은 묶음 추천 규칙으로 자동으로 묶어 보여 줍니다(아래 "자동 묶음").
//   "따로 보이기"로 뺀 상품은 자동으로 묶지 않습니다(content_settings `product_group_exclusions`).
// - migration 033 전 DB(운영 DB를 같이 쓰는 미리보기)에서는 저장한 묶음 없이 자동 묶음만 보이고, 관리자 묶음 저장은 막습니다.

export class ProductGroupsUnavailableError extends DatabaseError {
  constructor() {
    super("DATABASE_QUERY_FAILED", "옵션 묶음은 운영 배포가 끝난 뒤 쓸 수 있어요.", 503);
  }
}

export function isMissingGroupColumn(error: unknown) {
  const texts = [error instanceof Error ? error.message : String(error), (error as { cause?: { message?: string } })?.cause?.message ?? ""];
  // 읽기: "no such column: …" / 쓰기(INSERT): "table … has no column named …"
  return texts.some((text) => (text.includes("no such column") || text.includes("has no column named")) && /shippingNote|materialsUrl|optionLabel/.test(text));
}

function fail(message: string, status = 400): never {
  throw new DatabaseError("DATABASE_QUERY_FAILED", message, status);
}

const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// changedAt·createdAt은 ISO("…T…Z")와 "YYYY-MM-DD HH:MM:SS"(UTC) 두 형식이 섞여 있습니다.
function timestampValue(value: string) {
  const normalized = value.length === 10 ? `${value}T00:00:00Z` : value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  return new Date(normalized).getTime();
}

export function seoulDay(value: number) {
  return new Date(value + SEOUL_OFFSET_MS).toISOString().slice(0, 10);
}

export function trendDays(now = Date.now()) {
  const todayNoon = Date.parse(`${seoulDay(now)}T12:00:00+09:00`);
  return Array.from({ length: PRICE_TREND_DAYS }, (_, index) => seoulDay(todayNoon - (PRICE_TREND_DAYS - 1 - index) * DAY_MS));
}

function effectiveStudentPrice(aPrice: number, generalPrice: number) {
  return aPrice > 0 ? aPrice : generalPrice;
}

// ── 공개 단가표 묶음 요약 ─────────────────────────────────────────────

type PublicGroupRow = { id: string; name: string; imageUrl: string | null; categoryId: string | null; materialsUrl: string | null; productId: string; optionLabel: string | null };

// 공개 단가표용 묶음 행(보이는 묶음, 옵션 순서대로). 033 전 DB에서는 빈 목록입니다.
export async function loadPublicGroupRows(): Promise<PublicGroupRow[]> {
  try {
    return await getDb().select({
      id: productGroups.id,
      name: productGroups.name,
      imageUrl: productGroups.imageUrl,
      categoryId: productGroups.categoryId,
      materialsUrl: productGroups.materialsUrl,
      productId: productGroupItems.productId,
      optionLabel: productGroupItems.optionLabel
    }).from(productGroups)
      .innerJoin(productGroupItems, eq(productGroupItems.groupId, productGroups.id))
      .where(eq(productGroups.isVisible, true))
      .orderBy(asc(productGroups.displayOrder), asc(productGroups.id), asc(productGroupItems.sortOrder), asc(productGroupItems.createdAt));
  } catch (error) {
    if (isMissingGroupColumn(error)) return [];
    throw error;
  }
}

// 공개 상품(노출·미삭제)만 남긴 묶음 요약. 상품이 하나도 안 남은 묶음은 뺍니다.
export function summarizePublicGroups(rows: PublicGroupRow[], publicProductIds: Set<string>): PublicProductGroup[] {
  const groups = new Map<string, PublicProductGroup>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (!publicProductIds.has(row.productId) || seen.has(row.productId)) continue;
    seen.add(row.productId);
    const group: PublicProductGroup = groups.get(row.id) ?? { id: row.id, name: row.name, imageUrl: row.imageUrl, categoryId: row.categoryId, productIds: [], ...(row.materialsUrl ? { materialsUrl: row.materialsUrl } : {}) };
    group.productIds.push(row.productId);
    if (row.optionLabel?.trim()) group.optionLabels = { ...group.optionLabels, [row.productId]: row.optionLabel.trim() };
    groups.set(row.id, group);
  }
  return Array.from(groups.values());
}

export async function publicGroupSummaries(publicProductIds: Set<string>) {
  return summarizePublicGroups(await loadPublicGroupRows(), publicProductIds);
}

// ── 자동 묶음(2026-11-22, 관리자 요청 "미리보기처럼 운영에서도 옵션으로 묶여 보이게") ──────────
// 저장한 묶음에 없고 "따로 보이기"도 아닌 공개 상품을 묶음 추천 규칙(무게·개수·등급을 뺀 이름 + 카테고리 + 배송유형이 같은
// 상품 2개 이상, 옵션은 일반공급가 낮은 순)으로 자동으로 묶어 보여 줍니다. DB에는 저장하지 않습니다(관리자가 저장하면 저장한 묶음).
// 저장한 묶음과 기본 이름이 같은 상품(새로 등록한 사이즈, 묶음에서 뺀 상품)은 자동으로 묶지 않고 따로 보입니다 —
// 같은 이름의 카드가 두 개 생기지 않게 하려는 것으로, 관리자 "기존 묶음에 넣을 상품"에서 넣습니다.
type AutoSource = { id: string; name: string; categoryId: string | null; shippingType: string; generalPrice: number };

export function autoGroupSummaries(publicProducts: AutoSource[], savedProductIds: Set<string>, excludedIds: Set<string>): PublicProductGroup[] {
  const savedKeys = new Set(publicProducts.filter((product) => savedProductIds.has(product.id)).map(productGroupKey));
  const candidates = publicProducts.filter((product) => !savedProductIds.has(product.id) && !excludedIds.has(product.id) && !savedKeys.has(productGroupKey(product)));
  const byId = new Map(candidates.map((product) => [product.id, product]));
  return suggestProductGroups(candidates).map((suggestion) => ({
    id: `auto-${suggestion.key}`,
    name: suggestion.name,
    imageUrl: null,
    categoryId: suggestion.categoryId,
    productIds: [...suggestion.productIds].sort((first, second) => byId.get(first)!.generalPrice - byId.get(second)!.generalPrice || byId.get(first)!.name.localeCompare(byId.get(second)!.name, "ko")),
    auto: true
  }));
}

// "따로 보이기"로 뺀 상품 ID
export async function loadGroupExclusions(): Promise<Set<string>> {
  const rows = await getDb().select({ value: contentSettings.value }).from(contentSettings).where(eq(contentSettings.key, PRODUCT_GROUP_EXCLUSIONS_KEY)).limit(1);
  return new Set(parseGroupExclusions(rows[0]?.value));
}

async function updateGroupExclusions(add: string[], remove: string[]) {
  const current = await loadGroupExclusions();
  if (!add.some((id) => !current.has(id)) && !remove.some((id) => current.has(id))) return;
  for (const id of remove) current.delete(id);
  for (const id of add) current.add(id);
  const value = JSON.stringify({ ids: [...current] });
  const now = new Date().toISOString();
  await getDb().insert(contentSettings).values({ key: PRODUCT_GROUP_EXCLUSIONS_KEY, value, updatedAt: now })
    .onConflictDoUpdate({ target: contentSettings.key, set: { value, updatedAt: now } });
}

function publicAutoSources() {
  return getDb().select({ id: products.id, name: products.name, categoryId: products.categoryId, shippingType: products.shippingType, generalPrice: products.generalPrice })
    .from(products)
    .where(and(eq(products.isVisible, true), isNull(products.deletedAt)));
}

async function findAutoGroup(productId: string) {
  const [sources, savedRows, excluded] = await Promise.all([publicAutoSources(), loadPublicGroupRows(), loadGroupExclusions()]);
  const group = autoGroupSummaries(sources, new Set(savedRows.map((row) => row.productId)), excluded).find((item) => item.productIds.includes(productId));
  if (!group) return null;
  return {
    group: { id: group.id, name: group.name, imageUrl: null, description: null, shippingNote: null, materialsUrl: null, auto: true },
    items: group.productIds.map((id) => ({ productId: id, optionLabel: null }))
  };
}

// ── 옵션 팝업: 묶음 안내 + 옵션별 최근 7일 가격 흐름 ──────────────────

type HistoryRow = { productId: string; field: string; oldPrice: number; newPrice: number; changedAt: string };
type TrendProduct = { id: string; aPrice: number; generalPrice: number; createdAt: string };

// 상품 하나의 최근 7일 하루 끝 가격, 지금 가격이 적용된 날, 직전 가격(일반공급가·수강생 단가)을 계산합니다.
// 가격 변동 기록을 지금 가격에서 거꾸로 되짚습니다(원가는 다루지 않습니다).
export function buildOptionTrend(product: TrendProduct, histories: HistoryRow[], days: string[]): ProductOptionTrend {
  const rows = histories
    .filter((row) => row.productId === product.id && (row.field === "generalPrice" || row.field === "aPrice"))
    .map((row) => ({ ...row, at: timestampValue(row.changedAt) }))
    .filter((row) => Number.isFinite(row.at))
    .sort((first, second) => second.at - first.at);
  const generalRows = rows.filter((row) => row.field === "generalPrice");
  const aRows = rows.filter((row) => row.field === "aPrice");
  const valueAt = (fieldRows: typeof rows, current: number, instant: number) => {
    let value = current;
    for (const row of fieldRows) {
      if (row.at > instant) value = row.oldPrice;
      else break;
    }
    return value;
  };
  const pairAt = (instant: number) => {
    const general = valueAt(generalRows, product.generalPrice, instant);
    return { general, student: effectiveStudentPrice(valueAt(aRows, product.aPrice, instant), general) };
  };
  const general: number[] = [];
  const student: number[] = [];
  for (const day of days) {
    const pair = pairAt(Date.parse(`${day}T23:59:59.999+09:00`));
    general.push(pair.general);
    student.push(pair.student);
  }
  const current = pairAt(Number.POSITIVE_INFINITY);
  // 보이는 가격(일반공급가·수강생 단가)이 실제로 바뀐 마지막 저장을 찾습니다.
  const instants = [...new Set(rows.map((row) => row.at))];
  for (const instant of instants) {
    const after = pairAt(instant);
    const before = pairAt(instant - 1);
    if (after.general !== before.general || after.student !== before.student) {
      const changedRow = rows.find((row) => row.at === instant)!;
      return {
        general,
        student,
        current: { ...current, since: seoulDay(instant) },
        previous: { general: before.general, student: before.student, changedAt: changedRow.changedAt }
      };
    }
  }
  const created = timestampValue(product.createdAt);
  return { general, student, current: { ...current, since: Number.isFinite(created) ? seoulDay(created) : days[days.length - 1] }, previous: null };
}

type GroupDetail = NonNullable<ProductOptionsDetail["group"]>;

// 상품이 들어 있는 (보이는) 묶음과 묶음 안 상품 순서. 033 전 DB에서는 묶음 없음으로 봅니다.
async function findGroupForProduct(productId: string): Promise<{ group: GroupDetail; items: Array<{ productId: string; optionLabel: string | null }> } | null> {
  const db = getDb();
  try {
    const membership = await db.select({ groupId: productGroupItems.groupId })
      .from(productGroupItems)
      .innerJoin(productGroups, eq(productGroups.id, productGroupItems.groupId))
      .where(and(eq(productGroupItems.productId, productId), eq(productGroups.isVisible, true)))
      .orderBy(asc(productGroups.displayOrder), asc(productGroups.id))
      .limit(1);
    const groupId = membership[0]?.groupId;
    if (!groupId) return null;
    const [groupRows, itemRows] = await Promise.all([
      db.select({
        id: productGroups.id,
        name: productGroups.name,
        imageUrl: productGroups.imageUrl,
        description: productGroups.description,
        shippingNote: productGroups.shippingNote,
        materialsUrl: productGroups.materialsUrl
      }).from(productGroups).where(eq(productGroups.id, groupId)).limit(1),
      db.select({ productId: productGroupItems.productId, optionLabel: productGroupItems.optionLabel })
        .from(productGroupItems)
        .where(eq(productGroupItems.groupId, groupId))
        .orderBy(asc(productGroupItems.sortOrder), asc(productGroupItems.createdAt))
    ]);
    if (!groupRows[0]) return null;
    return { group: groupRows[0], items: itemRows };
  } catch (error) {
    if (isMissingGroupColumn(error)) return null;
    throw error;
  }
}

// 옵션 팝업 데이터. 상품이 공개(노출·미삭제)가 아니면 null(404)입니다.
export async function getPublicProductOptions(productId: string, now = Date.now()): Promise<ProductOptionsDetail | null> {
  const db = getDb();
  const found = (await findGroupForProduct(productId)) ?? (await findAutoGroup(productId));
  const candidateIds = found ? found.items.map((item) => item.productId) : [productId];
  if (!candidateIds.includes(productId)) candidateIds.push(productId);
  const productRows = await db.select({ id: products.id, aPrice: products.aPrice, generalPrice: products.generalPrice, createdAt: products.createdAt })
    .from(products)
    .where(and(inArray(products.id, candidateIds), eq(products.isVisible, true), isNull(products.deletedAt)));
  const byId = new Map(productRows.map((row) => [row.id, row]));
  if (!byId.has(productId)) return null;
  const productIds = candidateIds.filter((id, index) => byId.has(id) && candidateIds.indexOf(id) === index);
  const historyRows = await db.select({
    productId: priceHistories.productId,
    field: priceHistories.field,
    oldPrice: priceHistories.oldPrice,
    newPrice: priceHistories.newPrice,
    changedAt: priceHistories.changedAt
  }).from(priceHistories)
    .where(and(inArray(priceHistories.productId, productIds), inArray(priceHistories.field, ["aPrice", "generalPrice"]), isNull(priceHistories.optionId)))
    .limit(10000);
  const days = trendDays(now);
  const optionLabels: Record<string, string> = {};
  for (const item of found?.items ?? []) {
    if (item.optionLabel?.trim() && byId.has(item.productId)) optionLabels[item.productId] = item.optionLabel.trim();
  }
  return {
    group: found?.group ?? null,
    productIds,
    optionLabels,
    today: days[days.length - 1],
    days,
    trends: Object.fromEntries(productIds.map((id) => [id, buildOptionTrend(byId.get(id)!, historyRows, days)]))
  };
}

// ── 관리자: 묶음 목록·저장·삭제·상품 넣기/빼기·추천 ───────────────────

export type ProductGroupItemInput = { productId: string; optionLabel?: string | null };
export type ProductGroupInput = {
  name: string;
  imageUrl?: string | null;
  categoryId?: string | null;
  description?: string | null;
  shippingNote?: string | null;
  materialsUrl?: string | null;
  items: ProductGroupItemInput[];
};

const adminItemProductColumns = {
  id: products.id,
  productCode: products.productCode,
  name: products.name,
  imageUrl: products.imageUrl,
  aPrice: products.aPrice,
  generalPrice: products.generalPrice,
  categoryId: products.categoryId,
  shippingType: products.shippingType,
  supplierName: products.supplierName,
  isVisible: products.isVisible,
  isSoldOut: products.isSoldOut,
  isSeasonEnded: products.isSeasonEnded,
  isAlwaysOnSale: products.isAlwaysOnSale,
  saleStartMonth: products.saleStartMonth,
  saleEndMonth: products.saleEndMonth,
  displayOrder: products.displayOrder
};

type AdminItemProduct = { [Key in keyof typeof adminItemProductColumns]: (typeof products.$inferSelect)[Key] };

export type AdminProductGroup = {
  id: string;
  name: string;
  imageUrl: string | null;
  categoryId: string | null;
  description: string | null;
  shippingNote: string | null;
  materialsUrl: string | null;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  items: Array<{ productId: string; sortOrder: number; optionLabel: string | null; product: AdminItemProduct }>;
};

async function readAdminGroups(groupIds?: string[]): Promise<AdminProductGroup[]> {
  const db = getDb();
  const groupRows = await db.select({
    id: productGroups.id,
    name: productGroups.name,
    imageUrl: productGroups.imageUrl,
    categoryId: productGroups.categoryId,
    description: productGroups.description,
    shippingNote: productGroups.shippingNote,
    materialsUrl: productGroups.materialsUrl,
    displayOrder: productGroups.displayOrder,
    createdAt: productGroups.createdAt,
    updatedAt: productGroups.updatedAt
  }).from(productGroups)
    .where(groupIds ? inArray(productGroups.id, groupIds) : undefined)
    .orderBy(sql`${productGroups.updatedAt} DESC`);
  if (groupRows.length === 0) return [];
  const itemRows = await db.select({
    groupId: productGroupItems.groupId,
    productId: productGroupItems.productId,
    sortOrder: productGroupItems.sortOrder,
    optionLabel: productGroupItems.optionLabel,
    product: adminItemProductColumns
  }).from(productGroupItems)
    .innerJoin(products, and(eq(products.id, productGroupItems.productId), isNull(products.deletedAt)))
    .where(inArray(productGroupItems.groupId, groupRows.map((group) => group.id)))
    .orderBy(asc(productGroupItems.sortOrder), asc(productGroupItems.createdAt));
  const itemsByGroup = new Map<string, AdminProductGroup["items"]>();
  for (const row of itemRows) {
    const list = itemsByGroup.get(row.groupId) ?? [];
    list.push({ productId: row.productId, sortOrder: row.sortOrder, optionLabel: row.optionLabel, product: row.product });
    itemsByGroup.set(row.groupId, list);
  }
  return groupRows.map((group) => ({ ...group, items: itemsByGroup.get(group.id) ?? [] }));
}

export async function getAdminProductGroups() {
  try {
    return { ready: true, groups: await readAdminGroups() };
  } catch (error) {
    if (isMissingGroupColumn(error)) return { ready: false, groups: [] as AdminProductGroup[] };
    throw error;
  }
}

async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isMissingGroupColumn(error)) throw new ProductGroupsUnavailableError();
    throw error;
  }
}

function cleanText(value: string | null | undefined, max: number) {
  const text = value?.trim() ?? "";
  return text ? text.slice(0, max) : null;
}

function cleanUrl(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  if (!text) return null;
  if (!/^https?:\/\//i.test(text)) fail("상세페이지·사진 자료 링크는 http:// 또는 https:// 로 시작해야 합니다.");
  return text.slice(0, 1200);
}

function uniqueItems(items: ProductGroupItemInput[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = item.productId.trim();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

async function assertProductsExist(productIds: string[]) {
  const rows = await getDb().select({ id: products.id }).from(products).where(and(inArray(products.id, productIds), isNull(products.deletedAt)));
  if (rows.length !== productIds.length) fail("묶을 상품을 찾을 수 없습니다. 목록을 새로 불러온 뒤 다시 골라 주세요.");
}

// 비게 된 묶음은 지웁니다(상품을 다른 묶음으로 옮긴 경우).
async function removeEmptyGroups(groupIds: string[]) {
  if (groupIds.length === 0) return 0;
  const db = getDb();
  const stillUsed = await db.select({ groupId: productGroupItems.groupId }).from(productGroupItems).where(inArray(productGroupItems.groupId, groupIds));
  const used = new Set(stillUsed.map((row) => row.groupId));
  const empty = groupIds.filter((id) => !used.has(id));
  if (empty.length > 0) await db.delete(productGroups).where(inArray(productGroups.id, empty));
  return empty.length;
}

// 묶음 만들기(id 없음)·고치기. 상품 목록은 받은 순서대로 통째로 바꿉니다.
export async function saveProductGroup(id: string | null, input: ProductGroupInput) {
  return guarded(async () => {
    const db = getDb();
    const items = uniqueItems(input.items);
    if (items.length === 0) fail("묶을 상품을 1개 이상 골라 주세요.");
    const name = input.name.trim();
    if (!name) fail("묶음 이름을 입력해 주세요.");
    const productIds = items.map((item) => item.productId.trim());
    await assertProductsExist(productIds);
    const now = new Date().toISOString();
    const fields = {
      name: name.slice(0, 160),
      imageUrl: cleanText(input.imageUrl, 1200),
      categoryId: cleanText(input.categoryId, 80),
      description: cleanText(input.description, 4000),
      shippingNote: cleanText(input.shippingNote, 1000),
      materialsUrl: cleanUrl(input.materialsUrl),
      updatedAt: now
    };
    let groupId = id;
    if (groupId) {
      const updated = await db.update(productGroups).set(fields).where(eq(productGroups.id, groupId)).returning({ id: productGroups.id });
      if (!updated[0]) fail("옵션 묶음을 찾을 수 없습니다.", 404);
    } else {
      groupId = crypto.randomUUID();
      await db.insert(productGroups).values({ id: groupId, ...fields, displayOrder: 1000000, isVisible: true, createdAt: now });
    }
    const currentGroupId = groupId;
    // 다른 묶음에 있던 상품은 그 묶음에서 빼서 옮깁니다.
    const previousGroups = await db.selectDistinct({ groupId: productGroupItems.groupId }).from(productGroupItems)
      .where(and(inArray(productGroupItems.productId, productIds), ne(productGroupItems.groupId, currentGroupId)));
    await db.delete(productGroupItems).where(and(inArray(productGroupItems.productId, productIds), ne(productGroupItems.groupId, currentGroupId)));
    await db.delete(productGroupItems).where(eq(productGroupItems.groupId, currentGroupId));
    await db.insert(productGroupItems).values(items.map((item, index) => ({
      id: crypto.randomUUID(),
      groupId: currentGroupId,
      productId: item.productId.trim(),
      sortOrder: (index + 1) * 10,
      optionLabel: cleanText(item.optionLabel, 120),
      createdAt: now
    })));
    const removedGroups = await removeEmptyGroups(previousGroups.map((row) => row.groupId));
    // 직접 묶은 상품은 "따로 보이기"에서도 풉니다.
    await updateGroupExclusions([], productIds);
    const [group] = await readAdminGroups([currentGroupId]);
    return { group, movedFromGroups: previousGroups.length, removedGroups };
  });
}

export async function removeProductGroup(id: string) {
  return guarded(async () => {
    const db = getDb();
    const rows = await db.select({ id: productGroups.id, name: productGroups.name }).from(productGroups).where(eq(productGroups.id, id)).limit(1);
    if (!rows[0]) fail("옵션 묶음을 찾을 수 없습니다.", 404);
    await db.delete(productGroupItems).where(eq(productGroupItems.groupId, id));
    await db.delete(productGroups).where(eq(productGroups.id, id));
    return rows[0];
  });
}

// 상품을 기존 묶음에 넣거나(맨 뒤에 붙임) 묶음에서 뺍니다(groupId null). 상품 등록·상품 리스트 일괄 작업에서 씁니다.
export async function assignProductsToGroup(productIds: string[], groupId: string | null) {
  return guarded(async () => {
    const db = getDb();
    const ids = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) fail("상품을 골라 주세요.");
    await assertProductsExist(ids);
    const previousGroups = await db.selectDistinct({ groupId: productGroupItems.groupId }).from(productGroupItems).where(inArray(productGroupItems.productId, ids));
    const now = new Date().toISOString();
    if (groupId) {
      const target = await db.select({ id: productGroups.id }).from(productGroups).where(eq(productGroups.id, groupId)).limit(1);
      if (!target[0]) fail("옵션 묶음을 찾을 수 없습니다.", 404);
      await db.delete(productGroupItems).where(and(inArray(productGroupItems.productId, ids), ne(productGroupItems.groupId, groupId)));
      const existing = await db.select({ productId: productGroupItems.productId, sortOrder: productGroupItems.sortOrder })
        .from(productGroupItems).where(eq(productGroupItems.groupId, groupId));
      const already = new Set(existing.map((row) => row.productId));
      let nextOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder), 0);
      const additions = ids.filter((id) => !already.has(id));
      if (additions.length > 0) {
        await db.insert(productGroupItems).values(additions.map((productId) => {
          nextOrder += 10;
          return { id: crypto.randomUUID(), groupId, productId, sortOrder: nextOrder, optionLabel: null, createdAt: now };
        }));
      }
      await db.update(productGroups).set({ updatedAt: now }).where(eq(productGroups.id, groupId));
      await updateGroupExclusions([], ids);
    } else {
      await db.delete(productGroupItems).where(inArray(productGroupItems.productId, ids));
    }
    const removedGroups = await removeEmptyGroups(previousGroups.map((row) => row.groupId).filter((id) => id !== groupId));
    return { assigned: ids.length, groupId, removedGroups };
  });
}

// "따로 보이기": 자동 묶음에서 빼고 상품마다 카드 하나로 보여 줍니다(저장한 묶음에 있던 상품은 그 묶음에서도 뺌).
// excluded=false면 다시 자동 묶음 규칙을 따릅니다.
export async function setProductGroupExclusions(productIds: string[], excluded: boolean) {
  return guarded(async () => {
    const ids = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) fail("상품을 골라 주세요.");
    await assertProductsExist(ids);
    let leftGroups = 0;
    let removedGroups = 0;
    if (excluded) {
      const db = getDb();
      const previousGroups = await db.selectDistinct({ groupId: productGroupItems.groupId }).from(productGroupItems).where(inArray(productGroupItems.productId, ids));
      if (previousGroups.length > 0) {
        await db.delete(productGroupItems).where(inArray(productGroupItems.productId, ids));
        leftGroups = previousGroups.length;
        removedGroups = await removeEmptyGroups(previousGroups.map((row) => row.groupId));
      }
      await updateGroupExclusions(ids, []);
    } else {
      await updateGroupExclusions([], ids);
    }
    return { updated: ids.length, excluded, leftGroups, removedGroups };
  });
}

// 상품 리스트에 붙일 "어느 묶음에 들어 있는지"(상품 ID → 묶음 ID·이름·상품 수). 033 전 DB에서는 빈 목록입니다.
export async function getProductGroupMemberships() {
  try {
    // optionLabel(033에서 추가한 칸)을 함께 읽어, 033 전 DB면 실패하게 해서 ready:false로 알려 줍니다.
    const [rows, sources, excluded] = await Promise.all([
      getDb().select({
        productId: productGroupItems.productId,
        optionLabel: productGroupItems.optionLabel,
        groupId: productGroups.id,
        name: productGroups.name
      }).from(productGroupItems)
        .innerJoin(productGroups, eq(productGroups.id, productGroupItems.groupId))
        .innerJoin(products, and(eq(products.id, productGroupItems.productId), isNull(products.deletedAt))),
      publicAutoSources(),
      loadGroupExclusions()
    ]);
    const sizes = new Map<string, number>();
    for (const row of rows) sizes.set(row.groupId, (sizes.get(row.groupId) ?? 0) + 1);
    const memberships: Record<string, Membership> = {};
    for (const row of rows) {
      if (!memberships[row.productId]) memberships[row.productId] = { groupId: row.groupId, name: row.name, size: sizes.get(row.groupId) ?? 1 };
    }
    return { ready: true, memberships, auto: autoMemberships(sources, new Set(rows.map((row) => row.productId)), excluded), excluded: [...excluded] };
  } catch (error) {
    if (!isMissingGroupColumn(error)) throw error;
    // 033 전 DB: 저장한 묶음은 없고 자동 묶음만 보입니다(저장은 막음).
    const [sources, excluded] = await Promise.all([publicAutoSources(), loadGroupExclusions()]);
    return { ready: false, memberships: {} as Record<string, Membership>, auto: autoMemberships(sources, new Set(), excluded), excluded: [...excluded] };
  }
}

type Membership = { groupId: string; name: string; size: number };

// 상품 ID → 지금 공개 단가표에서 들어가 있는 자동 묶음
function autoMemberships(sources: AutoSource[], savedProductIds: Set<string>, excluded: Set<string>) {
  const auto: Record<string, Membership> = {};
  for (const group of autoGroupSummaries(sources, savedProductIds, excluded)) {
    for (const productId of group.productIds) auto[productId] = { groupId: group.id, name: group.name, size: group.productIds.length };
  }
  return auto;
}

// 관리자 "자동 묶음" 탭: (1) 지금 공개 단가표에 자동으로 묶여 보이는 묶음(= 새 묶음 후보, 공개 화면 `autoGroupSummaries`와 같은 결과)
// (2) 저장한 묶음과 기본 이름이 같아 자동으로 묶이지 않고 따로 보이는 상품(새로 등록한 사이즈 등) (3) "따로 보이기" 상품. 숨김 상품은 넣지 않습니다.
export async function getProductGroupSuggestions() {
  return guarded(async () => {
    const db = getDb();
    const [productRows, itemRows] = await Promise.all([
      db.select(adminItemProductColumns).from(products).where(isNull(products.deletedAt)).orderBy(asc(products.displayOrder), asc(products.name)),
      db.select({ productId: productGroupItems.productId, groupId: productGroupItems.groupId, groupName: productGroups.name })
        .from(productGroupItems)
        .innerJoin(productGroups, eq(productGroups.id, productGroupItems.groupId))
    ]);
    const excluded = await loadGroupExclusions();
    const byId = new Map(productRows.map((row) => [row.id, row]));
    const groupedIds = new Set(itemRows.map((row) => row.productId));
    // 공개 단가표에 보이는 상품만(자동 묶음 = 지금 단가표에 보이는 묶음). "따로 보이기"로 뺀 상품은 넣지 않습니다.
    const ungrouped = productRows.filter((row) => row.isVisible && !groupedIds.has(row.id) && !excluded.has(row.id));
    // 기존 묶음의 기본 이름 키 → 묶음
    const groupKeys = new Map<string, { groupId: string; groupName: string }>();
    for (const row of itemRows) {
      const product = byId.get(row.productId);
      if (!product?.isVisible) continue;
      const key = productGroupKey(product);
      if (!groupKeys.has(key)) groupKeys.set(key, { groupId: row.groupId, groupName: row.groupName });
    }
    const joins = new Map<string, { groupId: string; groupName: string; productIds: string[] }>();
    const fresh: typeof ungrouped = [];
    for (const product of ungrouped) {
      const key = productGroupKey(product);
      const target = groupKeys.get(key);
      if (target) {
        const join = joins.get(target.groupId) ?? { ...target, productIds: [] };
        join.productIds.push(product.id);
        joins.set(target.groupId, join);
      } else {
        fresh.push(product);
      }
    }
    const suggestions = suggestProductGroups(fresh).slice(0, 1000);
    const excludedIds = productRows.filter((row) => excluded.has(row.id)).map((row) => row.id);
    const usedIds = new Set([...suggestions.flatMap((item) => item.productIds), ...Array.from(joins.values()).flatMap((item) => item.productIds), ...excludedIds]);
    return {
      ungroupedCount: ungrouped.length,
      suggestions,
      joins: Array.from(joins.values()),
      excludedIds,
      products: productRows.filter((row) => usedIds.has(row.id))
    };
  });
}
