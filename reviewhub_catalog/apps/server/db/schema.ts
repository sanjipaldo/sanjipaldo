import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  role: text("role").default("user"),
  username: text("username").unique(),
  displayUsername: text("displayUsername")
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull()
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }),
  updatedAt: integer("updatedAt", { mode: "timestamp" })
});

export const todos = sqliteTable(
  "todos",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId").notNull(),
    title: text("title").notNull(),
    done: integer("done", { mode: "boolean" }).notNull().default(false),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [index("idx_todos_userId").on(table.userId)]
);

export const storageFiles = sqliteTable(
  "storage_files",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId"),
    gatewayFileId: text("gatewayFileId"),
    fileName: text("fileName").notNull(),
    fileSuffix: text("fileSuffix").notNull(),
    contentType: text("contentType").notNull().default("application/octet-stream"),
    fileSize: integer("fileSize").notNull(),
    objectKey: text("objectKey").notNull(),
    path: text("path").notNull(),
    downloadUrl: text("downloadUrl").notNull(),
    status: text("status", { enum: ["pending", "uploaded", "failed", "deleted"] }).notNull().default("pending"),
    errorMessage: text("errorMessage"),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    index("idx_storage_files_userId").on(table.userId),
    index("idx_storage_files_objectKey").on(table.objectKey),
    index("idx_storage_files_status").on(table.status)
  ]
);

export const aiBusinessScenes = sqliteTable(
  "ai_business_scenes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sceneKey: text("scene_key").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    definition: text("definition").notNull().default("{}"),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [index("idx_ai_business_scenes_scene_key").on(table.sceneKey)]
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    shippingType: text("shippingType", { enum: ["domestic", "overseas"] }).notNull(),
    sortOrder: integer("sortOrder").notNull().default(0),
    isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [index("idx_categories_shipping_type").on(table.shippingType)]
);

export const shippingPolicies = sqliteTable(
  "shipping_policies",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    shippingType: text("shippingType", { enum: ["domestic", "overseas"] }).notNull(),
    courier: text("courier"),
    fee: integer("fee").notNull().default(0),
    feeLabel: text("feeLabel").notNull().default("무료배송"),
    freeShippingThreshold: integer("freeShippingThreshold"),
    description: text("description"),
    isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sortOrder").notNull().default(0),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [index("idx_shipping_policies_active").on(table.isActive, table.sortOrder)]
);

export const suppliers = sqliteTable(
  "suppliers",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    businessNumber: text("businessNumber"),
    representative: text("representative"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    memo: text("memo"),
    isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    uniqueIndex("idx_suppliers_name").on(table.name),
    index("idx_suppliers_active").on(table.isActive, table.name)
  ]
);

export const products = sqliteTable(
  "products",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    productCode: text("productCode"),
    name: text("name").notNull(),
    imageUrl: text("imageUrl"),
    origin: text("origin"),
    supplierName: text("supplierName"),
    costPrice: integer("costPrice").notNull().default(0),
    aPrice: integer("aPrice").notNull().default(0),
    generalPrice: integer("generalPrice").notNull().default(0),
    salePrice: integer("salePrice"),
    salePriceMode: text("salePriceMode", { enum: ["autonomous", "fixed"] }).notNull().default("autonomous"),
    saleStartMonth: integer("saleStartMonth"),
    saleEndMonth: integer("saleEndMonth"),
    isAlwaysOnSale: integer("isAlwaysOnSale", { mode: "boolean" }).notNull().default(false),
    shippingFee: text("shippingFee").notNull().default("무료"),
    releaseInfo: text("releaseInfo"),
    notes: text("notes"),
    optionsInfo: text("optionsInfo"),
    packaging: text("packaging"),
    courier: text("courier"),
    shippingPolicyId: text("shippingPolicyId").references(() => shippingPolicies.id),
    shippingType: text("shippingType", { enum: ["domestic", "overseas"] }).notNull(),
    categoryId: text("categoryId")
      .notNull()
      .references(() => categories.id),
    displayOrder: integer("displayOrder").notNull().default(1000000),
    isVisible: integer("isVisible", { mode: "boolean" }).notNull().default(true),
    isSoldOut: integer("isSoldOut", { mode: "boolean" }).notNull().default(false),
    deletedAt: text("deletedAt"),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    index("idx_products_category").on(table.categoryId),
    uniqueIndex("idx_products_product_code").on(table.productCode),
    index("idx_products_shipping_type").on(table.shippingType),
    index("idx_products_display_order").on(table.displayOrder),
    index("idx_products_visible").on(table.isVisible)
  ]
);

export const productOptions = sqliteTable(
  "product_options",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    productId: text("productId")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    costPrice: integer("costPrice").notNull().default(0),
    aPrice: integer("aPrice").notNull().default(0),
    generalPrice: integer("generalPrice").notNull().default(0),
    salePrice: integer("salePrice"),
    salePriceMode: text("salePriceMode", { enum: ["autonomous", "fixed"] }).notNull().default("autonomous"),
    isSoldOut: integer("isSoldOut", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sortOrder").notNull().default(0),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    index("idx_product_options_product").on(table.productId),
    index("idx_product_options_sort").on(table.productId, table.sortOrder)
  ]
);

export const productGroups = sqliteTable(
  "product_groups",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    imageUrl: text("imageUrl"),
    categoryId: text("categoryId").references(() => categories.id),
    description: text("description"),
    displayOrder: integer("displayOrder").notNull().default(1000000),
    isVisible: integer("isVisible", { mode: "boolean" }).notNull().default(true),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    index("idx_product_groups_category").on(table.categoryId),
    index("idx_product_groups_order").on(table.displayOrder, table.updatedAt)
  ]
);

export const productGroupItems = sqliteTable(
  "product_group_items",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    groupId: text("groupId")
      .notNull()
      .references(() => productGroups.id, { onDelete: "cascade" }),
    productId: text("productId")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sortOrder: integer("sortOrder").notNull().default(0),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    index("idx_product_group_items_group").on(table.groupId, table.sortOrder),
    index("idx_product_group_items_product").on(table.productId),
    uniqueIndex("idx_product_group_items_unique").on(table.groupId, table.productId)
  ]
);

export const notices = sqliteTable("notices", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  content: text("content").notNull(),
  imageUrl: text("imageUrl"),
  youtubeUrl: text("youtubeUrl"),
  isPinned: integer("isPinned", { mode: "boolean" }).notNull().default(false),
  isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
  createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const priceHistories = sqliteTable(
  "price_histories",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    productId: text("productId").notNull(),
    productName: text("productName").notNull(),
    optionId: text("optionId"),
    optionName: text("optionName"),
    field: text("field", { enum: ["costPrice", "aPrice", "generalPrice", "salePrice"] }).notNull(),
    oldPrice: integer("oldPrice").notNull(),
    newPrice: integer("newPrice").notNull(),
    changedBy: text("changedBy").notNull(),
    changedAt: text("changedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [index("idx_price_histories_changed_at").on(table.changedAt)]
);

export const catalogActivityLogs = sqliteTable(
  "catalog_activity_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    productId: text("productId").notNull(),
    productName: text("productName").notNull(),
    optionId: text("optionId"),
    optionName: text("optionName"),
    eventType: text("eventType", { enum: ["new_product", "sold_out", "restocked"] }).notNull(),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    index("idx_catalog_activity_created_at").on(table.createdAt),
    index("idx_catalog_activity_event_type").on(table.eventType)
  ]
);

export const sourcingRequests = sqliteTable(
  "sourcing_requests",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    productName: text("productName").notNull(),
    desiredPrice: text("desiredPrice"),
    referenceUrl: text("referenceUrl"),
    requesterName: text("requesterName").notNull(),
    contact: text("contact").notNull(),
    details: text("details"),
    status: text("status", { enum: ["received", "reviewing", "completed"] }).notNull().default("received"),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [index("idx_sourcing_requests_status").on(table.status)]
);

export const contentSettings = sqliteTable("content_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const externalProductLinks = sqliteTable(
  "external_product_links",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    provider: text("provider").notNull(),
    externalProductId: text("externalProductId").notNull(),
    externalProductCode: text("externalProductCode").notNull(),
    productId: text("productId").notNull().references(() => products.id, { onDelete: "cascade" }),
    externalUpdatedAt: text("externalUpdatedAt"),
    lastPulledAt: text("lastPulledAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastPushedAt: text("lastPushedAt"),
    syncStatus: text("syncStatus", { enum: ["imported", "pending", "succeeded", "failed", "blocked", "conflict"] }).notNull().default("imported"),
    sourceHash: text("sourceHash"),
    rawSnapshot: text("rawSnapshot"),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    uniqueIndex("idx_external_product_links_provider_id").on(table.provider, table.externalProductId),
    uniqueIndex("idx_external_product_links_provider_code").on(table.provider, table.externalProductCode),
    index("idx_external_product_links_product").on(table.productId),
    index("idx_external_product_links_status").on(table.syncStatus)
  ]
);

export const productSyncOutbox = sqliteTable(
  "product_sync_outbox",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    provider: text("provider").notNull(),
    productId: text("productId").notNull().references(() => products.id, { onDelete: "cascade" }),
    action: text("action", { enum: ["create", "update", "price", "visibility", "soldout", "delete", "image"] }).notNull(),
    payload: text("payload").notNull(),
    status: text("status", { enum: ["pending", "processing", "succeeded", "failed", "blocked"] }).notNull().default("blocked"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("lastError"),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    processedAt: text("processedAt")
  },
  (table) => [index("idx_product_sync_outbox_status").on(table.status, table.createdAt)]
);

export const salesDailySuppliers = sqliteTable(
  "sales_daily_suppliers",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    saleDate: text("saleDate").notNull(),
    supplierName: text("supplierName").notNull(),
    revenue: integer("revenue").notNull().default(0),
    cost: integer("cost").notNull().default(0),
    orderCount: integer("orderCount").notNull().default(0),
    source: text("source").notNull().default("baljuora"),
    sourceUpdatedAt: text("sourceUpdatedAt"),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    uniqueIndex("idx_sales_daily_supplier_date").on(table.saleDate, table.supplierName),
    index("idx_sales_daily_date").on(table.saleDate)
  ]
);

export const syncRuns = sqliteTable(
  "sync_runs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    provider: text("provider").notNull(),
    direction: text("direction", { enum: ["pull", "push"] }).notNull(),
    trigger: text("trigger").notNull(),
    total: integer("total").notNull().default(0),
    createdCount: integer("createdCount").notNull().default(0),
    updatedCount: integer("updatedCount").notNull().default(0),
    skippedCount: integer("skippedCount").notNull().default(0),
    failedCount: integer("failedCount").notNull().default(0),
    conflictCount: integer("conflictCount").notNull().default(0),
    status: text("status", { enum: ["running", "completed", "failed", "blocked"] }).notNull().default("running"),
    checkpoint: text("checkpoint"),
    errorMessage: text("errorMessage"),
    startedAt: text("startedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    finishedAt: text("finishedAt")
  },
  (table) => [index("idx_sync_runs_provider_started").on(table.provider, table.startedAt)]
);

export type Todo = typeof todos.$inferSelect;
export type NewTodo = typeof todos.$inferInsert;
export type StorageFile = typeof storageFiles.$inferSelect;
export type NewStorageFile = typeof storageFiles.$inferInsert;
export type AiBusinessScene = typeof aiBusinessScenes.$inferSelect;
export type NewAiBusinessScene = typeof aiBusinessScenes.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type ShippingPolicy = typeof shippingPolicies.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductOption = typeof productOptions.$inferSelect;
export type ProductGroup = typeof productGroups.$inferSelect;
export type ProductGroupItem = typeof productGroupItems.$inferSelect;
export type Notice = typeof notices.$inferSelect;
export type PriceHistory = typeof priceHistories.$inferSelect;
export type CatalogActivityLog = typeof catalogActivityLogs.$inferSelect;
export type SourcingRequest = typeof sourcingRequests.$inferSelect;
export type ExternalProductLink = typeof externalProductLinks.$inferSelect;
export type ProductSyncOutbox = typeof productSyncOutbox.$inferSelect;
export type SyncRun = typeof syncRuns.$inferSelect;
