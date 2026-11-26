import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

// 2차 카테고리(migration 035): 1차 카테고리 아래 이름만 둡니다. 발주오라 상품 카테고리 트리(1차 > 2차)를 DB센터에서 관리하는 데 쓰고,
// 단가표·상품 등록은 1차 카테고리만 씁니다(상품은 2차에 넣지 않음).
export const subcategories = sqliteTable(
  "subcategories",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    categoryId: text("categoryId").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sortOrder").notNull().default(0),
    isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [index("idx_subcategories_category").on(table.categoryId)]
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
    // 배송비 유형: free 무료 · paid 유료 · conditional 조건부 무료(freeShippingThreshold 이상 무료)
    feeType: text("feeType", { enum: ["free", "paid", "conditional"] }).notNull().default("free"),
    // 유료 배송비 부과 방식: order 주문당 고정 · quantity 수량별 · weight 무게별(kg당)
    feeBasis: text("feeBasis", { enum: ["order", "quantity", "weight"] }).notNull().default("order"),
    // 발주오라와 같은 배송비 유형(migration 025): fixed 고정 · free 무료 · amount 금액별 · quantity 수량별 · unit 단위별
    // 비어 있으면 예전 방식(feeType·feeBasis)으로 만든 정책입니다.
    rateType: text("rateType", { enum: ["fixed", "free", "amount", "quantity", "unit"] }),
    // 금액별·수량별·단위별 구간(JSON): { tiers: [{ upTo, fee }], last: { fee, repeat } }
    rateTiers: text("rateTiers"),
    // 단위별 배송비의 단위(개·kg 등)
    unitLabel: text("unitLabel"),
    // 배송비무료: 이 정책 상품이 포함된 주문은 배송비 전체를 무료 처리
    freeWholeOrder: integer("freeWholeOrder", { mode: "boolean" }).notNull().default(false),
    // 배송비 코드(영문·숫자, 비우면 자동 부여)
    policyCode: text("policyCode"),
    jejuExtraFee: integer("jejuExtraFee").notNull().default(0),
    islandExtraFee: integer("islandExtraFee").notNull().default(0),
    returnFee: integer("returnFee"),
    exchangeFee: integer("exchangeFee"),
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
    // migration 028: 관리자가 직접 지정한 "시즌종료"(판매기간과 상관없이 시즌 종료로 표시)
    isSeasonEnded: integer("isSeasonEnded", { mode: "boolean" }).notNull().default(false),
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

// 발주오라 상품 등록 화면과 같은 상품 정보 칸(migration 037, 상품 1개당 1행). 원산지·택배사·배송유형·품절·노출은 products 칸을 씁니다.
// isTaxable null = 자동(건강식품 카테고리 과세, 그 밖 비과세). certificationKinds = JSON 배열.
export const productExtras = sqliteTable("product_extras", {
  productId: text("productId")
    .primaryKey()
    .references(() => products.id, { onDelete: "cascade" }),
  isTaxable: integer("isTaxable", { mode: "boolean" }),
  managementCode: text("managementCode"),
  barcode: text("barcode"),
  contentAmount: real("contentAmount"),
  contentUnit: text("contentUnit"),
  contentCount: integer("contentCount"),
  contentBasis: text("contentBasis"),
  purchaseName: text("purchaseName"),
  purchaseQuantity: integer("purchaseQuantity"),
  shippingUnitType: text("shippingUnitType"),
  shippingUnitValue: real("shippingUnitValue"),
  purchaseDeadline: text("purchaseDeadline"),
  certificationKinds: text("certificationKinds"),
  summary: text("summary"),
  shippingLocation: text("shippingLocation"),
  manufacturingDate: text("manufacturingDate"),
  expirationDate: text("expirationDate"),
  taxonomyItemId: text("taxonomyItemId"),
  taxonomyName: text("taxonomyName"),
  updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
});

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
    // migration 033: 옵션 묶음 팝업의 배송 안내 문구와 상세페이지·사진 자료 링크
    shippingNote: text("shippingNote"),
    materialsUrl: text("materialsUrl"),
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
    // migration 033: 팝업 옵션표에 보일 옵션 이름(비우면 상품명에서 자동으로 줄임)
    optionLabel: text("optionLabel"),
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
  (table) => [
    index("idx_price_histories_changed_at").on(table.changedAt),
    // migration 033: 옵션 팝업의 상품별 가격 흐름 조회
    index("idx_price_histories_product").on(table.productId, table.changedAt)
  ]
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
    // sourcing = 소싱해주세요 요청, partner = 농가·수산·브랜드사 입점 신청
    requestType: text("requestType", { enum: ["sourcing", "partner"] }).notNull().default("sourcing"),
    companyName: text("companyName"),
    email: text("email"),
    businessType: text("businessType"),
    // 입점 신청 자동 안내 메일: sent | failed | skipped
    emailStatus: text("emailStatus"),
    emailSentAt: text("emailSentAt"),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [index("idx_sourcing_requests_status").on(table.status), index("idx_sourcing_requests_type").on(table.requestType, table.createdAt)]
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
// 농수산물 백과사전 기기 옮기기 코드(migration 031): 코드 → 내 후보·체크리스트 JSON(개인정보 없음)
export const encyclopediaSaves = sqliteTable("encyclopedia_saves", {
  code: text("code").primaryKey(),
  payload: text("payload").notNull(),
  createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
});
// 입점 신청(공급사) 진행 단계·계약 조건(migration 030). requestId = sourcing_requests.id(requestType partner)
export const partnerDeals = sqliteTable(
  "partner_deals",
  {
    requestId: text("requestId").primaryKey(),
    stage: text("stage", { enum: ["received", "contacted", "negotiating", "contracted", "declined"] }).notNull().default("received"),
    contractType: text("contractType", { enum: ["commission", "wholesale", "other"] }),
    commissionRate: real("commissionRate"),
    contractMemo: text("contractMemo"),
    contactedAt: text("contactedAt"),
    closedAt: text("closedAt"),
    // 단계 변경 기록 JSON 배열: [{ at, stage, contractType, commissionRate, memo }]
    history: text("history"),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [index("idx_partner_deals_stage").on(table.stage, table.updatedAt)]
);

export type SourcingRequest = typeof sourcingRequests.$inferSelect;
export type ExternalProductLink = typeof externalProductLinks.$inferSelect;
// 발주오라 오픈 API 연결 설정(provider당 1행). 비밀번호는 저장하지 않고, API 키는 암호문만 보관합니다.
export const integrationConnections = sqliteTable("integration_connections", {
  provider: text("provider").primaryKey(),
  mallId: text("mallId"),
  username: text("username"),
  apiBaseUrl: text("apiBaseUrl"),
  apiKeyCipher: text("apiKeyCipher"),
  apiKeyLast4: text("apiKeyLast4"),
  status: text("status", { enum: ["not_configured", "key_registered", "connected", "failed"] }).notNull().default("not_configured"),
  lastVerifiedAt: text("lastVerifiedAt"),
  lastError: text("lastError"),
  autoPush: integer("autoPush", { mode: "boolean" }).notNull().default(false),
  autoPull: integer("autoPull", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export type ProductSyncOutbox = typeof productSyncOutbox.$inferSelect;
export type SyncRun = typeof syncRuns.$inferSelect;

// 발주오라 수동 동기화(migration 034). 작업 코드는 SHA-256(codeHash)만 저장합니다.
export const baljuoraSyncJobs = sqliteTable(
  "baljuora_sync_jobs",
  {
    id: text("id").primaryKey(),
    codeHash: text("codeHash").notNull(),
    type: text("type", { enum: ["compare", "push", "sales"] }).notNull(),
    status: text("status", { enum: ["waiting", "running", "done", "failed", "expired", "cancelled"] }).notNull().default("waiting"),
    plan: text("plan").notNull(),
    progress: text("progress"),
    summary: text("summary"),
    results: text("results"),
    diagnostics: text("diagnostics"),
    createdBy: text("createdBy"),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    startedAt: text("startedAt"),
    finishedAt: text("finishedAt"),
    expiresAt: text("expiresAt").notNull()
  },
  (table) => [
    uniqueIndex("idx_baljuora_sync_jobs_code").on(table.codeHash),
    index("idx_baljuora_sync_jobs_created").on(table.createdAt)
  ]
);
// 동기화 설정·마지막 비교 결과(공개 단가표에 나가지 않는 저장소)
export const baljuoraSyncStore = sqliteTable("baljuora_sync_store", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
});
export type BaljuoraSyncJob = typeof baljuoraSyncJobs.$inferSelect;

// 공급사 센터(migration 032). 공급사 로그인 계정: 로그인 자체는 user/account(better-auth),
// 여기에는 어느 공급사(suppliers.id) 계정인지와 정산 설정(수수료율 %, 정산 주기)만 둡니다. 공급사마다 1개.
export const supplierAccounts = sqliteTable("supplier_accounts", {
  id: text("id").primaryKey(),
  supplierId: text("supplierId").notNull().unique().references(() => suppliers.id, { onDelete: "cascade" }),
  userId: text("userId").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  username: text("username").notNull().unique(),
  isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
  commissionRate: real("commissionRate").notNull().default(10),
  // 지급 주기(2026-11-26 "daily" 매일 정산 추가 — 칸은 TEXT라 마이그레이션 없음)
  settlementCycle: text("settlementCycle", { enum: ["monthly", "weekly", "daily"] }).notNull().default("monthly"),
  lastLoginAt: text("lastLoginAt"),
  createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
});

// 공급사가 보낸 상품 변경 요청(kind update)·신규 상품 등록 요청(kind create). 마스터가 승인하면 상품에 반영합니다.
// changes = 바꾸려는 값 JSON, snapshot = 요청 때의 상품 값 JSON(수정 요청만)
export const supplierRequests = sqliteTable(
  "supplier_requests",
  {
    id: text("id").primaryKey(),
    supplierId: text("supplierId").notNull(),
    supplierName: text("supplierName").notNull(),
    productId: text("productId"),
    productName: text("productName").notNull(),
    kind: text("kind", { enum: ["update", "create"] }).notNull().default("update"),
    status: text("status", { enum: ["pending", "approved", "rejected", "cancelled"] }).notNull().default("pending"),
    changes: text("changes").notNull().default("{}"),
    snapshot: text("snapshot"),
    note: text("note"),
    reviewNote: text("reviewNote"),
    reviewedBy: text("reviewedBy"),
    reviewedAt: text("reviewedAt"),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    index("idx_supplier_requests_status").on(table.status, table.createdAt),
    index("idx_supplier_requests_supplier").on(table.supplierId, table.createdAt),
    index("idx_supplier_requests_product").on(table.productId, table.status)
  ]
);

// 공급사별 판매·반품 내역(날짜·상품·수량·금액). 주문 데이터 연결(발주오라) 후 채웁니다.
export const supplierSales = sqliteTable(
  "supplier_sales",
  {
    id: text("id").primaryKey(),
    saleDate: text("saleDate").notNull(),
    supplierName: text("supplierName").notNull(),
    productId: text("productId"),
    productCode: text("productCode"),
    productName: text("productName").notNull(),
    kind: text("kind", { enum: ["sale", "return"] }).notNull().default("sale"),
    quantity: integer("quantity").notNull().default(0),
    amount: integer("amount").notNull().default(0),
    orderCount: integer("orderCount").notNull().default(0),
    source: text("source").notNull().default("baljuora"),
    externalId: text("externalId"),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [index("idx_supplier_sales_supplier_date").on(table.supplierName, table.saleDate)]
);

export type SupplierAccount = typeof supplierAccounts.$inferSelect;
export type SupplierRequest = typeof supplierRequests.$inferSelect;
export type SupplierSale = typeof supplierSales.$inferSelect;

// 발주오라 판매·매출처(migration 036). 관리자 동기화(책갈피) 때마다 고른 기간의 발주오라 주문 상품 줄을 다시 읽어 덮어씁니다.
// netQuantity = 취소·반품을 뺀 수량, amount = 공급가(unitPrice) × netQuantity. isTaxable 1 = 과세, 0 = 면세.
export const baljuoraSalesLines = sqliteTable(
  "baljuora_sales_lines",
  {
    id: text("id").primaryKey(),
    orderId: text("orderId"),
    saleDate: text("saleDate").notNull(),
    orderedAt: text("orderedAt"),
    status: text("status"),
    baljuoraProductId: text("baljuoraProductId"),
    productId: text("productId"),
    productCode: text("productCode"),
    productName: text("productName").notNull(),
    categoryId: text("categoryId"),
    supplierName: text("supplierName"),
    baljuoraSupplierName: text("baljuoraSupplierName"),
    sellerId: text("sellerId"),
    sellerName: text("sellerName"),
    quantity: integer("quantity").notNull().default(0),
    netQuantity: integer("netQuantity").notNull().default(0),
    unitPrice: integer("unitPrice").notNull().default(0),
    unitCost: integer("unitCost"),
    amount: integer("amount").notNull().default(0),
    costAmount: integer("costAmount"),
    salesShippingFee: integer("salesShippingFee").notNull().default(0),
    purchaseShippingFee: integer("purchaseShippingFee").notNull().default(0),
    isTaxable: integer("isTaxable", { mode: "boolean" }),
    taxSource: text("taxSource"),
    syncJobId: text("syncJobId"),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    index("idx_baljuora_sales_date").on(table.saleDate),
    index("idx_baljuora_sales_supplier").on(table.supplierName, table.saleDate),
    index("idx_baljuora_sales_seller").on(table.sellerId, table.saleDate)
  ]
);

// 발주오라 매출처(셀러). overrides = DB센터에서 고친 세금계산서용 칸(JSON, 동기화가 덮어쓰지 않음).
export const baljuoraBuyers = sqliteTable(
  "baljuora_buyers",
  {
    id: text("id").primaryKey(),
    companyName: text("companyName").notNull(),
    representativeName: text("representativeName"),
    businessNumber: text("businessNumber"),
    businessType: text("businessType"),
    businessCategory: text("businessCategory"),
    email: text("email"),
    phone: text("phone"),
    managerName: text("managerName"),
    zipCode: text("zipCode"),
    address: text("address"),
    addressDetail: text("addressDetail"),
    groupId: text("groupId"),
    groupName: text("groupName"),
    status: text("status"),
    orderAcceptType: text("orderAcceptType"),
    username: text("username"),
    lastLoginAt: text("lastLoginAt"),
    joinedAt: text("joinedAt"),
    overrides: text("overrides"),
    memo: text("memo"),
    firstSyncedAt: text("firstSyncedAt"),
    lastSyncedAt: text("lastSyncedAt"),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [index("idx_baljuora_buyers_company").on(table.companyName)]
);

// 공급사 월 정산 상태: pending(정산 대기) → paid(판매 대금 입금) → done(정산 완료). 상태를 바꿀 때 금액을 함께 적어 둡니다.
export const supplierSettlements = sqliteTable(
  "supplier_settlements",
  {
    id: text("id").primaryKey(),
    supplierName: text("supplierName").notNull(),
    month: text("month").notNull(),
    status: text("status", { enum: ["pending", "paid", "done"] }).notNull().default("pending"),
    saleAmount: integer("saleAmount").notNull().default(0),
    commissionRate: real("commissionRate").notNull().default(10),
    commission: integer("commission").notNull().default(0),
    payoutAmount: integer("payoutAmount").notNull().default(0),
    paidAt: text("paidAt"),
    doneAt: text("doneAt"),
    memo: text("memo"),
    updatedBy: text("updatedBy"),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [uniqueIndex("idx_supplier_settlements_month").on(table.supplierName, table.month)]
);

export type BaljuoraSalesLine = typeof baljuoraSalesLines.$inferSelect;
export type BaljuoraBuyer = typeof baljuoraBuyers.$inferSelect;
export type SupplierSettlement = typeof supplierSettlements.$inferSelect;
