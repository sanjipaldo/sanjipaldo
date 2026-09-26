import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { DatabaseError, getDb } from "../_core/db";
import {
  catalogActivityLogs,
  categories,
  contentSettings,
  notices,
  priceHistories,
  productGroupItems,
  productGroups,
  productOptions,
  products,
  shippingPolicies,
  suppliers,
  sourcingRequests
} from "../db/schema";
import { enqueueProductSync } from "./catalog-sync";

export type ProductOptionInput = {
  id?: string;
  name: string;
  costPrice: number;
  aPrice: number;
  generalPrice: number;
  salePrice?: number | null;
  salePriceMode?: "autonomous" | "fixed";
  isSoldOut?: boolean;
  sortOrder?: number;
};

export type ProductInput = {
  productCode?: string | null;
  name: string;
  imageUrl?: string | null;
  origin?: string | null;
  supplierName?: string | null;
  costPrice: number;
  aPrice: number;
  generalPrice: number;
  salePrice?: number | null;
  salePriceMode?: "autonomous" | "fixed";
  saleStartMonth?: number | null;
  saleEndMonth?: number | null;
  isAlwaysOnSale?: boolean;
  shippingFee?: string;
  releaseInfo?: string | null;
  notes?: string | null;
  optionsInfo?: string | null;
  packaging?: string | null;
  courier?: string | null;
  shippingPolicyId?: string | null;
  shippingType: "domestic" | "overseas";
  categoryId: string;
  isVisible?: boolean;
  isSoldOut?: boolean;
  options?: ProductOptionInput[];
};

export type CategoryInput = {
  name: string;
  shippingType: "domestic" | "overseas";
  sortOrder?: number;
  isActive?: boolean;
};

export type NoticeInput = {
  title: string;
  content: string;
  imageUrl?: string | null;
  youtubeUrl?: string | null;
  isPinned?: boolean;
  isActive?: boolean;
};

export type ProductGroupInput = {
  name: string;
  imageUrl?: string | null;
  categoryId?: string | null;
  description?: string | null;
  displayOrder?: number;
  isVisible?: boolean;
  productIds?: string[];
};

export type ShippingPolicyInput = {
  name: string;
  shippingType: "domestic" | "overseas";
  courier?: string | null;
  fee?: number;
  feeLabel?: string;
  freeShippingThreshold?: number | null;
  description?: string | null;
  isActive?: boolean;
  sortOrder?: number;
};

export type SupplierInput = {
  name: string;
  businessNumber?: string | null;
  representative?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  memo?: string | null;
  isActive?: boolean;
};

function attachOptions<T extends { id: string }>(
  productRows: T[],
  optionRows: Array<typeof productOptions.$inferSelect>
) {
  const grouped = new Map<string, Array<typeof productOptions.$inferSelect>>();
  for (const option of optionRows) {
    const current = grouped.get(option.productId) ?? [];
    current.push(option);
    grouped.set(option.productId, current);
  }
  return productRows.map((product) => ({
    ...product,
    options: grouped.get(product.id) ?? []
  }));
}

const seasonalCategoryNames = new Set(["농산", "수산", "축산", "선물세트", "식품"]);

function plainCategoryName(name: string) {
  return name.replace(/^[^\p{L}\p{N}[]+\s*/u, "").trim();
}

function normalizeYoutubeUrl(value?: string | null) {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    let id = "";
    if (parsed.hostname === "youtu.be") id = parsed.pathname.replace(/^\/+/, "").split("/")[0] || "";
    if (!id && parsed.hostname.endsWith("youtube.com")) {
      id = parsed.searchParams.get("v") || parsed.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)?.[1] || "";
    }
    return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  } catch {
    return null;
  }
}

async function normalizeSaleFields(input: ProductInput) {
  const category = await getDb().select().from(categories).where(eq(categories.id, input.categoryId)).limit(1);
  if (!category[0]) throw new DatabaseError("DATABASE_QUERY_FAILED", "카테고리를 찾을 수 없습니다.", 400);
  const categoryName = plainCategoryName(category[0].name);
  const healthProduct = categoryName.includes("건강식품");
  const seasonalProduct = seasonalCategoryNames.has(categoryName);
  const isAlwaysOnSale = seasonalProduct && Boolean(input.isAlwaysOnSale);
  return {
    salePrice: input.salePrice ?? null,
    salePriceMode: healthProduct ? "fixed" as const : input.salePriceMode ?? "autonomous" as const,
    saleStartMonth: seasonalProduct && !isAlwaysOnSale ? input.saleStartMonth ?? null : null,
    saleEndMonth: seasonalProduct && !isAlwaysOnSale ? input.saleEndMonth ?? null : null,
    isAlwaysOnSale,
    options: (input.options ?? []).map((option) => ({
      ...option,
      costPrice: option.costPrice ?? 0,
      salePrice: option.salePrice ?? null,
      salePriceMode: healthProduct ? "fixed" as const : option.salePriceMode ?? input.salePriceMode ?? "autonomous" as const
    }))
  };
}

function enrichPriceHistory<
  T extends { productId: string }
>(historyRows: T[], productRows: Array<{ id: string; imageUrl: string | null }>) {
  const imageByProduct = new Map(productRows.map((product) => [product.id, product.imageUrl]));
  return historyRows.map((history) => ({
    ...history,
    productImageUrl: imageByProduct.get(history.productId) ?? null
  }));
}

function timestampValue(value: string) {
  const normalized = value.length === 10
    ? `${value}T00:00:00Z`
    : value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  return new Date(normalized).getTime();
}

type PublicProductRow = typeof products.$inferSelect;
type PublicOptionRow = typeof productOptions.$inferSelect;

function publicProductView(
  productRows: PublicProductRow[],
  optionRows: PublicOptionRow[]
) {
  return attachOptions(productRows, optionRows).map((product) => {
    const { costPrice: _productCostPrice, supplierName: _supplierName, deletedAt: _deletedAt, options, ...publicProduct } = product;
    void _productCostPrice;
    void _supplierName;
    void _deletedAt;
    return {
      ...publicProduct,
      options: options.map(({ costPrice: _optionCostPrice, ...option }) => {
        void _optionCostPrice;
        return option;
      })
    };
  });
}

function effectivePublicAPrice(aPrice: number | null | undefined, generalPrice: number) {
  return typeof aPrice === "number" && aPrice > 0 ? aPrice : generalPrice;
}

export function isPublicPriceHistoryDate(changedAt: string, now = Date.now()) {
  const value = timestampValue(changedAt);
  return Number.isFinite(value)
    && value >= now - (3 * 24 * 60 * 60 * 1000)
    && value <= now + (5 * 60 * 1000);
}

export async function getPublicCatalog() {
  const db = getDb();
  const soldOutSince = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString();
  const [categoryRows, productRows, optionRows, noticeRows, historyRows, soldOutRows, settingsRows, totalProductRows] = await Promise.all([
    db.select().from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.shippingType), asc(categories.sortOrder)),
    db.select().from(products).where(and(eq(products.isVisible, true), sql`${products.deletedAt} IS NULL`)).orderBy(asc(products.displayOrder), desc(products.updatedAt)),
    db.select().from(productOptions).orderBy(asc(productOptions.productId), asc(productOptions.sortOrder)),
    db.select().from(notices).where(eq(notices.isActive, true)).orderBy(desc(notices.isPinned), desc(notices.updatedAt)),
    db.select().from(priceHistories).orderBy(desc(priceHistories.changedAt)).limit(500),
    db.select().from(catalogActivityLogs)
      .where(and(eq(catalogActivityLogs.eventType, "sold_out"), sql`${catalogActivityLogs.createdAt} >= ${soldOutSince}`))
      .orderBy(desc(catalogActivityLogs.createdAt))
      .limit(500),
    db.select().from(contentSettings),
    db.select({ count: sql<number>`count(*)` }).from(products).where(sql`${products.deletedAt} IS NULL`)
  ]);

  const recentHistory = historyRows.filter((history) => history.field !== "costPrice" && isPublicPriceHistoryDate(history.changedAt));
  const publicProducts = publicProductView(productRows, optionRows);
  const productImageById = new Map(productRows.map((product) => [product.id, product.imageUrl]));
  const recentSoldOutIssues = soldOutRows
    .filter((issue) => productRows.some((product) => product.id === issue.productId))
    .map((issue) => ({
      id: issue.id,
      productId: issue.productId,
      productName: issue.productName,
      productImageUrl: productImageById.get(issue.productId) ?? null,
      optionId: issue.optionId,
      optionName: issue.optionName,
      createdAt: issue.createdAt,
      status: "품절" as const
    }));

  return {
    categories: categoryRows,
    products: publicProducts,
    notices: noticeRows,
    priceHistory: enrichPriceHistory(recentHistory, productRows),
    recentSoldOutIssues,
    settings: Object.fromEntries(settingsRows.map((row) => [row.key, row.value])),
    catalogTotals: {
      productCount: Number(totalProductRows[0]?.count ?? productRows.length),
      visibleProductCount: productRows.length
    }
  };
}

export async function getPublicCatalogInitial() {
  const db = getDb();
  const soldOutSince = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString();
  const [categoryRows, productRows, noticeRows, historyRows, soldOutRows, settingsRows, totalProductRows] = await Promise.all([
    db.select().from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.shippingType), asc(categories.sortOrder)),
    db.select().from(products)
      .where(and(eq(products.isVisible, true), sql`${products.deletedAt} IS NULL`))
      .orderBy(asc(products.displayOrder), desc(products.updatedAt))
      .limit(10),
    db.select().from(notices).where(eq(notices.isActive, true)).orderBy(desc(notices.isPinned), desc(notices.updatedAt)).limit(3),
    db.select().from(priceHistories).orderBy(desc(priceHistories.changedAt)).limit(30),
    db.select().from(catalogActivityLogs)
      .where(and(eq(catalogActivityLogs.eventType, "sold_out"), sql`${catalogActivityLogs.createdAt} >= ${soldOutSince}`))
      .orderBy(desc(catalogActivityLogs.createdAt))
      .limit(30),
    db.select().from(contentSettings),
    db.select({ count: sql<number>`count(*)` }).from(products).where(sql`${products.deletedAt} IS NULL`)
  ]);
  const visibleProductIds = productRows.map((product) => product.id);
  const optionRows = visibleProductIds.length > 0
    ? await db.select().from(productOptions).where(inArray(productOptions.productId, visibleProductIds)).orderBy(asc(productOptions.productId), asc(productOptions.sortOrder))
    : [];
  const recentHistory = historyRows.filter((history) => history.field !== "costPrice" && isPublicPriceHistoryDate(history.changedAt));
  const productImageById = new Map(productRows.map((product) => [product.id, product.imageUrl]));
  const recentSoldOutIssues = soldOutRows
    .filter((issue) => productRows.some((product) => product.id === issue.productId))
    .map((issue) => ({
      id: issue.id,
      productId: issue.productId,
      productName: issue.productName,
      productImageUrl: productImageById.get(issue.productId) ?? null,
      optionId: issue.optionId,
      optionName: issue.optionName,
      createdAt: issue.createdAt,
      status: "품절" as const
    }));
  return {
    categories: categoryRows,
    products: publicProductView(productRows, optionRows),
    notices: noticeRows,
    priceHistory: enrichPriceHistory(recentHistory, productRows),
    recentSoldOutIssues,
    settings: Object.fromEntries(settingsRows.map((row) => [row.key, row.value])),
    isPartial: true,
    catalogTotals: {
      productCount: Number(totalProductRows[0]?.count ?? productRows.length),
      visibleProductCount: productRows.length
    }
  };
}

export async function getPublicGuideSettings() {
  const settingsRows = await getDb()
    .select()
    .from(contentSettings)
    .where(sql`${contentSettings.key} IN ('guide', 'guide_sections')`);
  return {
    settings: Object.fromEntries(settingsRows.map((row) => [row.key, row.value]))
  };
}

export async function getPublicNotices() {
  const rows = await getDb()
    .select()
    .from(notices)
    .where(eq(notices.isActive, true))
    .orderBy(desc(notices.isPinned), desc(notices.updatedAt));
  return { notices: rows };
}

export async function getAdminCatalog() {
  const db = getDb();
  const [categoryRows, productRows, optionRows, noticeRows, historyRows, sourcingRows, settingsRows] = await Promise.all([
    db.select().from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.shippingType), asc(categories.sortOrder)),
    db.select().from(products).where(sql`${products.deletedAt} IS NULL`).orderBy(asc(products.displayOrder), desc(products.updatedAt)),
    db.select().from(productOptions).orderBy(asc(productOptions.productId), asc(productOptions.sortOrder)),
    db.select().from(notices).orderBy(desc(notices.updatedAt)),
    db.select().from(priceHistories).orderBy(desc(priceHistories.changedAt)).limit(1000),
    db.select().from(sourcingRequests).orderBy(desc(sourcingRequests.createdAt)).limit(200),
    db.select().from(contentSettings)
  ]);

  return {
    categories: categoryRows,
    products: attachOptions(productRows, optionRows),
    notices: noticeRows,
    priceHistory: enrichPriceHistory(historyRows, productRows),
    sourcingRequests: sourcingRows,
    settings: Object.fromEntries(settingsRows.map((row) => [row.key, row.value]))
  };
}

/**
 * Admin product pages do not need notices, FAQ settings, sourcing requests, or
 * the complete audit log. Keep the hot path intentionally narrow so the
 * product list can render while the rest of the console remains untouched.
 */
export async function getAdminProductsCatalog(options: { preview?: boolean } = {}) {
  const db = getDb();
  // The product page only needs the product/option rows, category filters and
  // the audit-log count. Loading the full history payload plus two additional
  // count scans on every navigation made this hot path needlessly expensive
  // for the 2,000+ product catalog.
  const productQuery = db.select().from(products).where(sql`${products.deletedAt} IS NULL`).orderBy(asc(products.displayOrder), desc(products.updatedAt));
  const [categoryRows, productRows] = await Promise.all([
    db.select().from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.shippingType), asc(categories.sortOrder)),
    options.preview ? productQuery.limit(30) : productQuery
  ]);
  const productIds = productRows.map((product) => product.id);
  const [optionRows, historyCount, totalProductRows, visibleProductRows, soldOutProductRows] = await Promise.all([
    productIds.length > 0
      ? db.select().from(productOptions).where(inArray(productOptions.productId, productIds)).orderBy(asc(productOptions.productId), asc(productOptions.sortOrder))
      : Promise.resolve([]),
    db.select({ count: sql<number>`count(*)` }).from(priceHistories),
    options.preview ? db.select({ count: sql<number>`count(*)` }).from(products).where(sql`${products.deletedAt} IS NULL`) : Promise.resolve([{ count: 0 }]),
    options.preview ? db.select({ count: sql<number>`count(*)` }).from(products).where(and(eq(products.isVisible, true), sql`${products.deletedAt} IS NULL`)) : Promise.resolve([{ count: 0 }]),
    options.preview ? db.select({ count: sql<number>`count(*)` }).from(products).where(and(eq(products.isSoldOut, true), sql`${products.deletedAt} IS NULL`)) : Promise.resolve([{ count: 0 }])
  ]);
  const visibleProductCount = options.preview
    ? Number(visibleProductRows[0]?.count ?? 0)
    : productRows.reduce((count, product) => count + (product.isVisible ? 1 : 0), 0);
  return {
    categories: categoryRows,
    products: attachOptions(productRows, optionRows),
    notices: [],
    priceHistory: [],
    priceHistoryCount: Number(historyCount[0]?.count ?? 0),
    isPartial: Boolean(options.preview),
    catalogTotals: {
      productCount: options.preview ? Number(totalProductRows[0]?.count ?? productRows.length) : productRows.length,
      visibleProductCount,
      soldOutProductCount: options.preview
        ? Number(soldOutProductRows[0]?.count ?? 0)
        : productRows.reduce((count, product) => count + (product.isSoldOut ? 1 : 0), 0)
    },
    sourcingRequests: [],
    settings: {}
  };
}

export async function getAdminCategoriesSummary() {
  const db = getDb();
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      shippingType: categories.shippingType,
      sortOrder: categories.sortOrder,
      isActive: categories.isActive,
      productCount: sql<number>`count(${products.id})`
    })
    .from(categories)
    .leftJoin(products, and(eq(products.categoryId, categories.id), sql`${products.deletedAt} IS NULL`))
    .where(eq(categories.isActive, true))
    .groupBy(categories.id)
    .orderBy(asc(categories.shippingType), asc(categories.sortOrder));
  return { categories: rows };
}

async function attachGroupItems(groupRows: Array<typeof productGroups.$inferSelect>) {
  if (groupRows.length === 0) return [];
  const db = getDb();
  const itemRows = await db
    .select({
      id: productGroupItems.id,
      groupId: productGroupItems.groupId,
      productId: productGroupItems.productId,
      sortOrder: productGroupItems.sortOrder,
      product: products
    })
    .from(productGroupItems)
    .innerJoin(products, eq(products.id, productGroupItems.productId))
    .where(inArray(productGroupItems.groupId, groupRows.map((group) => group.id)))
    .orderBy(asc(productGroupItems.sortOrder), asc(products.displayOrder));
  const grouped = new Map<string, typeof itemRows>();
  for (const item of itemRows) {
    const current = grouped.get(item.groupId) ?? [];
    current.push(item);
    grouped.set(item.groupId, current);
  }
  return groupRows.map((group) => ({
    ...group,
    items: (grouped.get(group.id) ?? []).map((item) => ({
      id: item.id,
      productId: item.productId,
      sortOrder: item.sortOrder,
      product: item.product
    }))
  }));
}

export async function getAdminProductGroups() {
  const db = getDb();
  // The list view only needs one compact joined result. The previous
  // two-query groups-then-items flow added a full round trip before the card
  // grid could render.
  const rows = await db
    .select({
      id: productGroups.id,
      name: productGroups.name,
      imageUrl: productGroups.imageUrl,
      categoryId: productGroups.categoryId,
      description: productGroups.description,
      displayOrder: productGroups.displayOrder,
      isVisible: productGroups.isVisible,
      createdAt: productGroups.createdAt,
      updatedAt: productGroups.updatedAt,
      itemId: productGroupItems.id,
      itemProductId: productGroupItems.productId,
      itemSortOrder: productGroupItems.sortOrder,
      product: {
        id: products.id,
        productCode: products.productCode,
        name: products.name,
        imageUrl: products.imageUrl,
        costPrice: products.costPrice,
        aPrice: products.aPrice,
        generalPrice: products.generalPrice,
        shippingType: products.shippingType,
        categoryId: products.categoryId,
        displayOrder: products.displayOrder,
        isVisible: products.isVisible,
        isSoldOut: products.isSoldOut
      }
    })
    .from(productGroups)
    .leftJoin(productGroupItems, eq(productGroupItems.groupId, productGroups.id))
    .leftJoin(products, eq(products.id, productGroupItems.productId))
    .orderBy(asc(productGroups.displayOrder), desc(productGroups.updatedAt), asc(productGroupItems.sortOrder));
  const grouped = new Map<string, {
    id: string;
    name: string;
    imageUrl: string | null;
    categoryId: string | null;
    description: string | null;
    displayOrder: number;
    isVisible: boolean;
    createdAt: string;
    updatedAt: string;
    items: Array<{ id: string; productId: string; sortOrder: number; product: typeof rows[number]["product"] }>;
  }>();
  for (const row of rows) {
    const group = grouped.get(row.id) ?? {
      id: row.id,
      name: row.name,
      imageUrl: row.imageUrl,
      categoryId: row.categoryId,
      description: row.description,
      displayOrder: row.displayOrder,
      isVisible: row.isVisible,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      items: []
    };
    if (row.itemId && row.itemProductId) {
      group.items.push({
        id: row.itemId,
        productId: row.itemProductId,
        sortOrder: row.itemSortOrder ?? 0,
        product: row.product
      });
    }
    grouped.set(row.id, group);
  }
  return { groups: Array.from(grouped.values()) };
}

export async function createProductGroup(input: ProductGroupInput) {
  const db = getDb();
  const now = new Date().toISOString();
  const groupId = crypto.randomUUID();
  const productIds = [...new Set(input.productIds ?? [])];
  if (productIds.length > 0) {
    const existing = await db.select({ id: products.id }).from(products).where(inArray(products.id, productIds));
    if (existing.length !== productIds.length) {
      throw new DatabaseError("DATABASE_QUERY_FAILED", "연결하려는 일반상품을 찾을 수 없습니다.", 400);
    }
  }
  const rows = await db.insert(productGroups).values({
    id: groupId,
    name: input.name,
    imageUrl: input.imageUrl || null,
    categoryId: input.categoryId || null,
    description: input.description || null,
    displayOrder: input.displayOrder ?? 1000000,
    isVisible: input.isVisible ?? true,
    createdAt: now,
    updatedAt: now
  }).returning();
  if (productIds.length) {
    await db.insert(productGroupItems).values(
      productIds.map((productId, index) => ({
        id: crypto.randomUUID(),
        groupId,
        productId,
        sortOrder: (index + 1) * 10,
        createdAt: now
      }))
    );
  }
  return (await attachGroupItems(rows))[0];
}

export async function updateProductGroup(id: string, input: ProductGroupInput) {
  const db = getDb();
  const now = new Date().toISOString();
  const productIds = [...new Set(input.productIds ?? [])];
  if (productIds.length > 0) {
    const existing = await db.select({ id: products.id }).from(products).where(inArray(products.id, productIds));
    if (existing.length !== productIds.length) {
      throw new DatabaseError("DATABASE_QUERY_FAILED", "연결하려는 일반상품을 찾을 수 없습니다.", 400);
    }
  }
  const rows = await db.update(productGroups).set({
    name: input.name,
    imageUrl: input.imageUrl || null,
    categoryId: input.categoryId || null,
    description: input.description || null,
    displayOrder: input.displayOrder ?? 1000000,
    isVisible: input.isVisible ?? true,
    updatedAt: now
  }).where(eq(productGroups.id, id)).returning();
  if (!rows[0]) throw new DatabaseError("DATABASE_QUERY_FAILED", "묶음상품을 찾을 수 없습니다.", 404);
  await db.delete(productGroupItems).where(eq(productGroupItems.groupId, id));
  if (productIds.length) {
    await db.insert(productGroupItems).values(
      productIds.map((productId, index) => ({
        id: crypto.randomUUID(),
        groupId: id,
        productId,
        sortOrder: (index + 1) * 10,
        createdAt: now
      }))
    );
  }
  return (await attachGroupItems(rows))[0];
}

export async function removeProductGroup(id: string) {
  const rows = await getDb().delete(productGroups).where(eq(productGroups.id, id)).returning();
  if (!rows[0]) throw new DatabaseError("DATABASE_QUERY_FAILED", "묶음상품을 찾을 수 없습니다.", 404);
  return rows[0];
}

export async function getShippingPolicies() {
  return {
    policies: await getDb().select().from(shippingPolicies).orderBy(asc(shippingPolicies.sortOrder), asc(shippingPolicies.name))
  };
}

export async function createShippingPolicy(input: ShippingPolicyInput) {
  const now = new Date().toISOString();
  const rows = await getDb().insert(shippingPolicies).values({
    id: crypto.randomUUID(),
    name: input.name,
    shippingType: input.shippingType,
    courier: input.courier || null,
    fee: input.fee ?? 0,
    feeLabel: input.feeLabel || "무료배송",
    freeShippingThreshold: input.freeShippingThreshold ?? null,
    description: input.description || null,
    isActive: input.isActive ?? true,
    sortOrder: input.sortOrder ?? 0,
    createdAt: now,
    updatedAt: now
  }).returning();
  return rows[0];
}

export async function updateShippingPolicy(id: string, input: ShippingPolicyInput) {
  const rows = await getDb().update(shippingPolicies).set({
    name: input.name,
    shippingType: input.shippingType,
    courier: input.courier || null,
    fee: input.fee ?? 0,
    feeLabel: input.feeLabel || "무료배송",
    freeShippingThreshold: input.freeShippingThreshold ?? null,
    description: input.description || null,
    isActive: input.isActive ?? true,
    sortOrder: input.sortOrder ?? 0,
    updatedAt: new Date().toISOString()
  }).where(eq(shippingPolicies.id, id)).returning();
  if (!rows[0]) throw new DatabaseError("DATABASE_QUERY_FAILED", "배송 정책을 찾을 수 없습니다.", 404);
  return rows[0];
}

export async function removeShippingPolicy(id: string) {
  const linked = await getDb().select({ id: products.id }).from(products).where(eq(products.shippingPolicyId, id)).limit(1);
  if (linked[0]) throw new DatabaseError("DATABASE_QUERY_FAILED", "상품이 연결된 배송 정책은 삭제할 수 없습니다.", 409);
  const rows = await getDb().delete(shippingPolicies).where(eq(shippingPolicies.id, id)).returning();
  if (!rows[0]) throw new DatabaseError("DATABASE_QUERY_FAILED", "배송 정책을 찾을 수 없습니다.", 404);
  return rows[0];
}

export async function getAdminNoticesCatalog() {
  const db = getDb();
  const [noticeRows, settingsRows] = await Promise.all([
    db.select().from(notices).orderBy(desc(notices.updatedAt)),
    db.select().from(contentSettings)
  ]);
  return {
    categories: [],
    products: [],
    notices: noticeRows,
    priceHistory: [],
    sourcingRequests: [],
    settings: Object.fromEntries(settingsRows.map((row) => [row.key, row.value]))
  };
}

export async function getAdminHistoryCatalog() {
  const db = getDb();
  const [historyRows, productRows, historyCount] = await Promise.all([
    db.select().from(priceHistories).orderBy(desc(priceHistories.changedAt)).limit(1000),
    db.select().from(products).where(sql`${products.deletedAt} IS NULL`),
    db.select({ count: sql<number>`count(*)` }).from(priceHistories)
  ]);
  return {
    categories: [],
    products: [],
    notices: [],
    priceHistory: enrichPriceHistory(historyRows, productRows),
    priceHistoryCount: Number(historyCount[0]?.count ?? 0),
    sourcingRequests: [],
    settings: {}
  };
}

export async function getAdminSourcingCatalog() {
  const rows = await getDb()
    .select()
    .from(sourcingRequests)
    .orderBy(desc(sourcingRequests.createdAt))
    .limit(200);
  return {
    categories: [],
    products: [],
    notices: [],
    priceHistory: [],
    sourcingRequests: rows,
    settings: {}
  };
}

export async function getAdminOverview() {
  const db = getDb();
  const [allProducts, visibleProducts, soldOutProducts, historyCount, sourcingCounts, recentNotices] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(products).where(sql`${products.deletedAt} IS NULL`),
    db.select({ count: sql<number>`count(*)` }).from(products).where(and(eq(products.isVisible, true), sql`${products.deletedAt} IS NULL`)),
    db.select({ count: sql<number>`count(*)` }).from(products).where(and(eq(products.isSoldOut, true), sql`${products.deletedAt} IS NULL`)),
    db.select({ count: sql<number>`count(*)` }).from(priceHistories),
    Promise.all((["received", "reviewing", "completed"] as const).map(async (status) => {
      const rows = await db.select({ count: sql<number>`count(*)` }).from(sourcingRequests).where(eq(sourcingRequests.status, status));
      return [status, Number(rows[0]?.count ?? 0)] as const;
    })),
    db.select().from(notices).where(eq(notices.isActive, true)).orderBy(desc(notices.isPinned), desc(notices.updatedAt)).limit(4)
  ]);
  const productCount = Number(allProducts[0]?.count ?? 0);
  const sourcing = Object.fromEntries(sourcingCounts) as Record<"received" | "reviewing" | "completed", number>;
  return {
    productCount,
    visibleProductCount: Number(visibleProducts[0]?.count ?? 0),
    soldOutProductCount: Number(soldOutProducts[0]?.count ?? 0),
    groupProductCount: 0,
    generalProductCount: productCount,
    priceHistoryCount: Number(historyCount[0]?.count ?? 0),
    sourcingCounts: {
      all: sourcing.received + sourcing.reviewing + sourcing.completed,
      received: sourcing.received,
      reviewing: sourcing.reviewing,
      completed: sourcing.completed
    },
    recentNotices
  };
}

export async function createProduct(input: ProductInput) {
  const db = getDb();
  const updatedAt = new Date().toISOString();
  const normalizedSaleFields = await normalizeSaleFields(input);
  const selectedShippingPolicy = input.shippingPolicyId
    ? (await db.select().from(shippingPolicies).where(eq(shippingPolicies.id, input.shippingPolicyId)).limit(1))[0]
    : null;
  if (input.shippingPolicyId && !selectedShippingPolicy) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "선택한 배송 정책을 찾을 수 없습니다.", 400);
  }
  if (selectedShippingPolicy && selectedShippingPolicy.shippingType !== input.shippingType) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "배송 정책과 상품 배송유형이 일치하지 않습니다.", 400);
  }
  // 새로 등록한 상품이 목록 맨 위에 오도록 현재 가장 앞 순서보다 앞에 둡니다(진열순서 관리에서 다시 옮길 수 있음).
  const minimumOrderRows = await db
    .select({ value: sql<number>`coalesce(min(${products.displayOrder}), 0)` })
    .from(products)
    .where(sql`${products.deletedAt} IS NULL`);
  const displayOrder = Number(minimumOrderRows[0]?.value ?? 0) - 10;
  const productInput = { ...input };
  delete productInput.options;
  const id = crypto.randomUUID();
  // 상품·옵션·신규 등록 기록을 한 번에 저장합니다(중간 실패 시 모두 되돌림).
  const { product, normalizedOptions } = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(products)
      .values({
        id,
        ...productInput,
        productCode: input.productCode?.trim() || `DG-${id.slice(0, 8).toUpperCase()}`,
        imageUrl: input.imageUrl || null,
        supplierName: input.supplierName?.trim() || null,
        salePrice: normalizedSaleFields.salePrice,
        salePriceMode: normalizedSaleFields.salePriceMode,
        saleStartMonth: normalizedSaleFields.saleStartMonth,
        saleEndMonth: normalizedSaleFields.saleEndMonth,
        isAlwaysOnSale: normalizedSaleFields.isAlwaysOnSale,
        displayOrder,
        shippingFee: selectedShippingPolicy
          ? `${selectedShippingPolicy.name}${selectedShippingPolicy.feeLabel ? ` [${selectedShippingPolicy.feeLabel}]` : ""}`
          : input.shippingFee || "무료",
        courier: selectedShippingPolicy?.courier || input.courier || null,
        isVisible: input.isVisible ?? true,
        isSoldOut: input.isSoldOut ?? false,
        updatedAt
      })
      .returning();
    const product = rows[0];
    if (!product) throw new DatabaseError("DATABASE_QUERY_FAILED", "상품을 등록하지 못했습니다.", 502);
    const normalizedOptions = normalizedSaleFields.options.map((option, index) => ({
      id: option.id || crypto.randomUUID(),
      productId: product.id,
      name: option.name,
      costPrice: option.costPrice,
      aPrice: option.aPrice,
      generalPrice: option.generalPrice,
      salePrice: option.salePrice,
      salePriceMode: option.salePriceMode,
      isSoldOut: option.isSoldOut ?? false,
      sortOrder: option.sortOrder ?? (index + 1) * 10,
      updatedAt
    }));
    if (normalizedOptions.length > 0) await tx.insert(productOptions).values(normalizedOptions);
    await tx.insert(catalogActivityLogs).values([
      {
        productId: product.id,
        productName: product.name,
        eventType: "new_product",
        createdAt: updatedAt
      },
      ...(product.isSoldOut ? [{
        productId: product.id,
        productName: product.name,
        eventType: "sold_out" as const,
        createdAt: updatedAt
      }] : []),
      ...normalizedOptions.filter((option) => option.isSoldOut).map((option) => ({
        productId: product.id,
        productName: product.name,
        optionId: option.id,
        optionName: option.name,
        eventType: "sold_out" as const,
        createdAt: updatedAt
      }))
    ]);
    return { product, normalizedOptions };
  });
  await enqueueProductSync(product.id, "create", {
    productCode: product.productCode,
    name: product.name,
    costPrice: product.costPrice,
    aPrice: product.aPrice,
    generalPrice: product.generalPrice,
    salePrice: product.salePrice,
    supplierName: product.supplierName,
    imageUrl: product.imageUrl,
    isVisible: product.isVisible,
    isSoldOut: product.isSoldOut
  });
  return { ...product, options: normalizedOptions };
}

export async function updateProduct(id: string, input: ProductInput, changedBy: string) {
  const db = getDb();
  const previous = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!previous[0]) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "상품을 찾을 수 없습니다.", 404);
  }

  const previousOptions = await db
    .select()
    .from(productOptions)
    .where(eq(productOptions.productId, id))
    .orderBy(asc(productOptions.sortOrder));
  const changedAt = new Date().toISOString();
  const normalizedSaleFields = await normalizeSaleFields(input);
  const selectedShippingPolicy = input.shippingPolicyId
    ? (await db.select().from(shippingPolicies).where(eq(shippingPolicies.id, input.shippingPolicyId)).limit(1))[0]
    : null;
  if (input.shippingPolicyId && !selectedShippingPolicy) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "선택한 배송 정책을 찾을 수 없습니다.", 400);
  }
  if (selectedShippingPolicy && selectedShippingPolicy.shippingType !== input.shippingType) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "배송 정책과 상품 배송유형이 일치하지 않습니다.", 400);
  }
  const productInput = { ...input };
  delete productInput.options;
  const normalizedOptions = normalizedSaleFields.options.map((option, index) => ({
    id: option.id || crypto.randomUUID(),
    productId: id,
    name: option.name,
    costPrice: option.costPrice,
    aPrice: option.aPrice,
    generalPrice: option.generalPrice,
    salePrice: option.salePrice,
    salePriceMode: option.salePriceMode,
    isSoldOut: option.isSoldOut ?? false,
    sortOrder: option.sortOrder ?? (index + 1) * 10,
    updatedAt: changedAt
  }));

  // 상품·가격이력·활동기록·옵션을 한 번에 저장합니다. 중간에 실패하면 모두 되돌려 반쯤 저장된 상품이 남지 않게 합니다.
  const { updated, changes } = await db.transaction(async (tx) => {
    const updated = await tx
      .update(products)
      .set({
        ...productInput,
        productCode: input.productCode?.trim() || previous[0].productCode || `DG-${id.slice(0, 8).toUpperCase()}`,
        imageUrl: input.imageUrl || null,
        supplierName: input.supplierName?.trim() || null,
        salePrice: normalizedSaleFields.salePrice,
        salePriceMode: normalizedSaleFields.salePriceMode,
        saleStartMonth: normalizedSaleFields.saleStartMonth,
        saleEndMonth: normalizedSaleFields.saleEndMonth,
        isAlwaysOnSale: normalizedSaleFields.isAlwaysOnSale,
        shippingFee: selectedShippingPolicy
          ? `${selectedShippingPolicy.name}${selectedShippingPolicy.feeLabel ? ` [${selectedShippingPolicy.feeLabel}]` : ""}`
          : input.shippingFee || "무료",
        courier: selectedShippingPolicy?.courier || input.courier || null,
        isVisible: input.isVisible ?? true,
        isSoldOut: input.isSoldOut ?? false,
        updatedAt: changedAt
      })
      .where(eq(products.id, id))
      .returning();

    const changes: Array<{
      field: "costPrice" | "aPrice" | "generalPrice" | "salePrice";
      oldPrice: number;
      newPrice: number;
      optionId?: string;
      optionName?: string;
    }> = [];
    if (previous[0].costPrice !== input.costPrice) {
      changes.push({ field: "costPrice", oldPrice: previous[0].costPrice, newPrice: input.costPrice });
    }
    if (previous[0].aPrice !== input.aPrice) {
      changes.push({ field: "aPrice", oldPrice: previous[0].aPrice, newPrice: input.aPrice });
    }
    if (previous[0].generalPrice !== input.generalPrice) {
      changes.push({ field: "generalPrice", oldPrice: previous[0].generalPrice, newPrice: input.generalPrice });
    }
    if ((previous[0].salePrice ?? 0) !== (normalizedSaleFields.salePrice ?? 0)) {
      changes.push({
        field: "salePrice",
        oldPrice: previous[0].salePrice ?? 0,
        newPrice: normalizedSaleFields.salePrice ?? 0
      });
    }

    for (const option of normalizedOptions) {
      const prior = previousOptions.find((item) => item.id === option.id);
      if (!prior) continue;
      if (prior.costPrice !== option.costPrice) {
        changes.push({
          field: "costPrice",
          oldPrice: prior.costPrice,
          newPrice: option.costPrice,
          optionId: option.id,
          optionName: option.name
        });
      }
      if (prior.aPrice !== option.aPrice) {
        changes.push({
          field: "aPrice",
          oldPrice: prior.aPrice,
          newPrice: option.aPrice,
          optionId: option.id,
          optionName: option.name
        });
      }
      if (prior.generalPrice !== option.generalPrice) {
        changes.push({
          field: "generalPrice",
          oldPrice: prior.generalPrice,
          newPrice: option.generalPrice,
          optionId: option.id,
          optionName: option.name
        });
      }
      if ((prior.salePrice ?? 0) !== (option.salePrice ?? 0)) {
        changes.push({
          field: "salePrice",
          oldPrice: prior.salePrice ?? 0,
          newPrice: option.salePrice ?? 0,
          optionId: option.id,
          optionName: option.name
        });
      }
    }

    if (changes.length > 0) {
      await tx.insert(priceHistories).values(
        changes.map((item) => ({
          productId: id,
          productName: input.name,
          optionId: item.optionId || null,
          optionName: item.optionName || null,
          field: item.field,
          oldPrice: item.oldPrice,
          newPrice: item.newPrice,
          changedBy,
          changedAt
        }))
      );
    }

    const activityChanges: Array<typeof catalogActivityLogs.$inferInsert> = [];
    if (previous[0].isSoldOut !== (input.isSoldOut ?? false)) {
      activityChanges.push({
        productId: id,
        productName: input.name,
        eventType: input.isSoldOut ? "sold_out" : "restocked",
        createdAt: changedAt
      });
    }
    for (const option of normalizedOptions) {
      const prior = previousOptions.find((item) => item.id === option.id);
      if (prior && prior.isSoldOut !== option.isSoldOut) {
        activityChanges.push({
          productId: id,
          productName: input.name,
          optionId: option.id,
          optionName: option.name,
          eventType: option.isSoldOut ? "sold_out" : "restocked",
          createdAt: changedAt
        });
      } else if (!prior && option.isSoldOut) {
        activityChanges.push({
          productId: id,
          productName: input.name,
          optionId: option.id,
          optionName: option.name,
          eventType: "sold_out",
          createdAt: changedAt
        });
      }
    }
    if (activityChanges.length > 0) await tx.insert(catalogActivityLogs).values(activityChanges);

    await tx.delete(productOptions).where(eq(productOptions.productId, id));
    if (normalizedOptions.length > 0) await tx.insert(productOptions).values(normalizedOptions);
    return { updated, changes };
  });

  const changedAction = changes.length > 0
    ? "price" as const
    : previous[0].imageUrl !== (input.imageUrl || null)
      ? "image" as const
    : previous[0].isVisible !== (input.isVisible ?? true)
      ? "visibility" as const
      : previous[0].isSoldOut !== (input.isSoldOut ?? false)
        ? "soldout" as const
        : "update" as const;
  await enqueueProductSync(id, changedAction, {
    productCode: updated[0]?.productCode ?? productInput.productCode,
    name: updated[0]?.name ?? productInput.name,
    costPrice: updated[0]?.costPrice ?? productInput.costPrice,
    aPrice: updated[0]?.aPrice ?? productInput.aPrice,
    generalPrice: updated[0]?.generalPrice ?? productInput.generalPrice,
    salePrice: updated[0]?.salePrice ?? normalizedSaleFields.salePrice,
    supplierName: updated[0]?.supplierName ?? input.supplierName ?? null,
    imageUrl: updated[0]?.imageUrl ?? input.imageUrl ?? null,
    isVisible: updated[0]?.isVisible ?? input.isVisible ?? true,
    isSoldOut: updated[0]?.isSoldOut ?? input.isSoldOut ?? false,
    changes: changes.map((change) => ({
      field: change.field,
      optionId: change.optionId ?? null,
      optionName: change.optionName ?? null,
      before: change.oldPrice,
      after: change.newPrice
    })),
    changedAt
  });

  return { ...updated[0], options: normalizedOptions };
}

export async function updateProductDisplayOrder(items: Array<{ id: string; displayOrder: number }>) {
  if (items.length === 0) return { updated: 0 };
  const uniqueIds = new Set(items.map((item) => item.id));
  if (uniqueIds.size !== items.length) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "중복된 상품이 포함되어 있습니다.", 400);
  }
  const db = getDb();
  const existingRows = await db
    .select({ id: products.id })
    .from(products)
    .where(and(inArray(products.id, [...uniqueIds]), sql`${products.deletedAt} IS NULL`));
  if (existingRows.length !== items.length) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "노출순서를 변경할 상품을 찾을 수 없습니다.", 404);
  }
  await db.transaction(async (transaction) => {
    for (const item of items) {
      await transaction
        .update(products)
        .set({ displayOrder: item.displayOrder })
        .where(eq(products.id, item.id));
    }
  });
  return { updated: items.length };
}

export async function updateProductGroupDisplayOrder(items: Array<{ id: string; displayOrder: number }>) {
  if (items.length === 0) return { updated: 0 };
  const uniqueIds = new Set(items.map((item) => item.id));
  if (uniqueIds.size !== items.length) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "중복된 묶음상품이 포함되어 있습니다.", 400);
  }
  const db = getDb();
  const existingRows = await db
    .select({ id: productGroups.id })
    .from(productGroups)
    .where(inArray(productGroups.id, [...uniqueIds]));
  if (existingRows.length !== items.length) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "노출순서를 변경할 묶음상품을 찾을 수 없습니다.", 404);
  }
  const updatedAt = new Date().toISOString();
  await db.transaction(async (transaction) => {
    for (const item of items) {
      await transaction
        .update(productGroups)
        .set({ displayOrder: item.displayOrder, updatedAt })
        .where(eq(productGroups.id, item.id));
    }
  });
  return { updated: items.length };
}

export async function removeProduct(id: string) {
  const db = getDb();
  const previous = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!previous[0]) throw new DatabaseError("DATABASE_QUERY_FAILED", "상품을 찾을 수 없습니다.", 404);
  const deletedAt = new Date().toISOString();
  const rows = await db.update(products).set({
    isVisible: false,
    deletedAt,
    updatedAt: deletedAt
  }).where(eq(products.id, id)).returning();
  await enqueueProductSync(id, "delete", {
    productCode: previous[0].productCode,
    name: previous[0].name,
    supplierName: previous[0].supplierName,
    deletedAt
  });
  return rows[0];
}

export async function getSuppliers(includeInactive = false) {
  const query = getDb().select().from(suppliers);
  const rows = includeInactive
    ? await query.orderBy(asc(suppliers.name))
    : await query.where(eq(suppliers.isActive, true)).orderBy(asc(suppliers.name));
  return { suppliers: rows };
}

export async function createSupplier(input: SupplierInput) {
  const now = new Date().toISOString();
  const name = input.name.trim();
  if (!name) throw new DatabaseError("DATABASE_QUERY_FAILED", "매입처명을 입력해 주세요.", 400);
  const existing = await getDb().select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.name, name)).limit(1);
  if (existing[0]) throw new DatabaseError("DATABASE_QUERY_FAILED", "이미 등록된 매입처입니다.", 409);
  const rows = await getDb().insert(suppliers).values({
    id: crypto.randomUUID(),
    name,
    businessNumber: input.businessNumber?.trim() || null,
    representative: input.representative?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    memo: input.memo?.trim() || null,
    isActive: input.isActive ?? true,
    createdAt: now,
    updatedAt: now
  }).returning();
  return rows[0];
}

export async function updateSupplier(id: string, input: SupplierInput) {
  const now = new Date().toISOString();
  const name = input.name.trim();
  if (!name) throw new DatabaseError("DATABASE_QUERY_FAILED", "매입처명을 입력해 주세요.", 400);
  const duplicate = await getDb().select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.name, name), sql`${suppliers.id} <> ${id}`)).limit(1);
  if (duplicate[0]) throw new DatabaseError("DATABASE_QUERY_FAILED", "이미 등록된 매입처입니다.", 409);
  const rows = await getDb().update(suppliers).set({
    name,
    businessNumber: input.businessNumber?.trim() || null,
    representative: input.representative?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    memo: input.memo?.trim() || null,
    isActive: input.isActive ?? true,
    updatedAt: now
  }).where(eq(suppliers.id, id)).returning();
  if (!rows[0]) throw new DatabaseError("DATABASE_QUERY_FAILED", "매입처를 찾을 수 없습니다.", 404);
  return rows[0];
}

export async function removeSupplier(id: string) {
  const rows = await getDb().update(suppliers).set({
    isActive: false,
    updatedAt: new Date().toISOString()
  }).where(eq(suppliers.id, id)).returning();
  if (!rows[0]) throw new DatabaseError("DATABASE_QUERY_FAILED", "매입처를 찾을 수 없습니다.", 404);
  return rows[0];
}

export async function createCategory(input: CategoryInput) {
  const rows = await getDb()
    .insert(categories)
    .values({
      ...input,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      updatedAt: new Date().toISOString()
    })
    .returning();
  return rows[0];
}

export async function updateCategory(id: string, input: CategoryInput) {
  const rows = await getDb()
    .update(categories)
    .set({
      ...input,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      updatedAt: new Date().toISOString()
    })
    .where(eq(categories.id, id))
    .returning();
  if (!rows[0]) throw new DatabaseError("DATABASE_QUERY_FAILED", "카테고리를 찾을 수 없습니다.", 404);
  return rows[0];
}

export async function removeCategory(id: string) {
  const linked = await getDb().select({ id: products.id }).from(products).where(eq(products.categoryId, id)).limit(1);
  if (linked[0]) throw new DatabaseError("DATABASE_QUERY_FAILED", "상품이 연결된 카테고리는 삭제할 수 없습니다.", 409);
  const rows = await getDb().delete(categories).where(eq(categories.id, id)).returning();
  if (!rows[0]) throw new DatabaseError("DATABASE_QUERY_FAILED", "카테고리를 찾을 수 없습니다.", 404);
  return rows[0];
}

export async function createNotice(input: NoticeInput) {
  const rows = await getDb()
    .insert(notices)
    .values({
      title: input.title,
      content: input.content,
      imageUrl: input.imageUrl || null,
      youtubeUrl: normalizeYoutubeUrl(input.youtubeUrl),
      isPinned: input.isPinned ?? false,
      isActive: input.isActive ?? true,
      updatedAt: new Date().toISOString()
    })
    .returning();
  return rows[0];
}

export async function updateNotice(id: string, input: NoticeInput) {
  const rows = await getDb()
    .update(notices)
    .set({
      title: input.title,
      content: input.content,
      imageUrl: input.imageUrl || null,
      youtubeUrl: normalizeYoutubeUrl(input.youtubeUrl),
      isPinned: input.isPinned ?? false,
      isActive: input.isActive ?? true,
      updatedAt: new Date().toISOString()
    })
    .where(eq(notices.id, id))
    .returning();
  if (!rows[0]) throw new DatabaseError("DATABASE_QUERY_FAILED", "공지를 찾을 수 없습니다.", 404);
  return rows[0];
}

export async function saveSetting(key: string, value: string) {
  await getDb()
    .insert(contentSettings)
    .values({ key, value, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: contentSettings.key,
      set: { value, updatedAt: new Date().toISOString() }
    });
  return { key, value };
}

export async function createSourcingRequest(input: {
  productName: string;
  desiredPrice?: string | null;
  referenceUrl?: string | null;
  requesterName: string;
  contact: string;
  details?: string | null;
}) {
  const rows = await getDb().insert(sourcingRequests).values(input).returning();
  return rows[0];
}

export async function updateSourcingStatus(id: string, status: "received" | "reviewing" | "completed") {
  const rows = await getDb()
    .update(sourcingRequests)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(sourcingRequests.id, id))
    .returning();
  if (!rows[0]) throw new DatabaseError("DATABASE_QUERY_FAILED", "소싱 요청을 찾을 수 없습니다.", 404);
  return rows[0];
}

export async function getMonthlyCatalogStats() {
  const seoulNow = new Date(Date.now() + (9 * 60 * 60 * 1000));
  const monthStartIso = new Date(
    Date.UTC(seoulNow.getUTCFullYear(), seoulNow.getUTCMonth(), 1) - (9 * 60 * 60 * 1000)
  ).toISOString();
  const [newProducts, activityChanges] = await Promise.all([
    getDb()
      .select({ id: products.id })
      .from(products)
      .where(and(
        eq(products.isVisible, true),
        sql`datetime(${products.createdAt}) >= datetime(${monthStartIso})`
      )),
    getDb()
      .select({ id: catalogActivityLogs.id, eventType: catalogActivityLogs.eventType })
      .from(catalogActivityLogs)
      .where(sql`datetime(${catalogActivityLogs.createdAt}) >= datetime(${monthStartIso})`)
  ]);
  return {
    newProducts: newProducts.length,
    soldOutChanges: activityChanges.filter((item) => item.eventType === "sold_out").length,
    activityChanges: activityChanges.length
  };
}
