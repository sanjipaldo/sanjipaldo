import { Hono, type Context } from "hono";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { DatabaseError } from "../_core/db";
import { adminRoute, publicRoute } from "../_core/route-helpers";
import {
  createCategory,
  createNotice,
  createProduct,
  createProductGroup,
  createShippingPolicy,
  createPartnerRequest,
  createSourcingRequest,
  createSupplier,
  getAdminCatalog,
  getAdminNoticesCatalog,
  getAdminHistoryCatalog,
  getAdminOverview,
  getAdminProductsCatalog,
  getAdminSourcingCatalog,
  getAdminCategoriesSummary,
  getAdminProductGroups,
  getSuppliers,
  getShippingPolicies,
  getPublicCatalog,
  getPublicCatalogInitial,
  getPublicGuideSettings,
  getPublicNotices,
  removeCategory,
  removeProduct,
  removeProductGroup,
  removeSupplier,
  removeShippingPolicy,
  saveSetting,
  updateCategory,
  updateNotice,
  updateProduct,
  updateProductGroup,
  updateProductGroupDisplayOrder,
  updateProductDisplayOrder,
  updateSupplier,
  updateShippingPolicy,
  updateSourcingStatus
} from "../services/catalog";
import {
  applyBulkProductWorkbook,
  bulkUpdateProducts,
  buildBulkProductWorkbook,
  buildProductListWorkbook,
  previewBulkProductWorkbook
} from "../services/catalog-excel";
import { getCatalogOperationsOverview } from "../services/catalog-operations";
import { getSalesOverview } from "../services/catalog-sales";
import { getCatalogSyncOverview, listSyncOutbox, listSyncRuns } from "../services/catalog-sync";
import { StorageError, storagePut } from "../services/s3_storage";

const ProductOptionSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(160),
  costPrice: z.coerce.number().int().nonnegative(),
  aPrice: z.coerce.number().int().nonnegative(),
  generalPrice: z.coerce.number().int().nonnegative(),
  salePrice: z.coerce.number().int().nonnegative().nullable().optional(),
  salePriceMode: z.enum(["autonomous", "fixed"]).optional(),
  isSoldOut: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional()
});

const ProductSchema = z.object({
  productCode: z.string().trim().max(80).nullable().optional(),
  name: z.string().trim().min(1).max(200),
  imageUrl: z.string().trim().max(2048).nullable().optional(),
  origin: z.string().trim().max(100).nullable().optional(),
  supplierName: z.string().trim().max(160).nullable().optional(),
  costPrice: z.coerce.number().int().nonnegative(),
  aPrice: z.coerce.number().int().nonnegative(),
  generalPrice: z.coerce.number().int().nonnegative(),
  salePrice: z.coerce.number().int().nonnegative().nullable().optional(),
  salePriceMode: z.enum(["autonomous", "fixed"]).optional(),
  saleStartMonth: z.coerce.number().int().min(1).max(12).nullable().optional(),
  saleEndMonth: z.coerce.number().int().min(1).max(12).nullable().optional(),
  isAlwaysOnSale: z.boolean().optional(),
  shippingFee: z.string().trim().max(100).optional(),
  releaseInfo: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(3000).nullable().optional(),
  optionsInfo: z.string().trim().max(1000).nullable().optional(),
  packaging: z.string().trim().max(500).nullable().optional(),
  courier: z.string().trim().max(100).nullable().optional(),
  shippingType: z.enum(["domestic", "overseas"]),
  shippingPolicyId: z.string().trim().min(1).nullable().optional(),
  categoryId: z.string().trim().min(1),
  isVisible: z.boolean().optional(),
  isSoldOut: z.boolean().optional(),
  // 옵션 기능은 사용하지 않습니다(발주오라 일반상품처럼 규격마다 상품을 따로 등록).
  options: z.array(ProductOptionSchema).max(0, "옵션 대신 규격마다 상품을 따로 등록해 주세요.").optional()
}).refine(
  (value) => value.isAlwaysOnSale
    ? value.saleStartMonth == null && value.saleEndMonth == null
    : (value.saleStartMonth == null) === (value.saleEndMonth == null),
  { message: "판매 시작월과 종료월을 함께 설정해 주세요.", path: ["saleEndMonth"] }
);

const PRODUCT_FIELD_LABELS: Record<string, string> = {
  productCode: "상품코드", name: "상품명", imageUrl: "상품 이미지 주소", origin: "원산지", supplierName: "매입처",
  costPrice: "원가", aPrice: "A단가", generalPrice: "일반공급가", salePrice: "판매가", salePriceMode: "판매가 방식",
  saleStartMonth: "판매 시작월", saleEndMonth: "판매 종료월", shippingFee: "배송비", releaseInfo: "출고 안내",
  notes: "상품 간략설명", optionsInfo: "옵션 안내", packaging: "포장", courier: "택배사", shippingType: "배송유형",
  shippingPolicyId: "배송 정책", categoryId: "카테고리", options: "옵션", sortOrder: "옵션 순서"
};

// 상품 입력 검증 실패 시 어느 항목이 문제인지 알려 줍니다.
function productInputMessage(error: z.ZodError) {
  const issue = error.issues[0];
  if (!issue) return "상품 입력값을 확인해 주세요.";
  if (issue.path.includes("saleEndMonth") && issue.code === "custom") return issue.message;
  const optionIndex = issue.path[0] === "options" && typeof issue.path[1] === "number" ? issue.path[1] + 1 : null;
  const field = String(issue.path[optionIndex ? 2 : 0] ?? "");
  const label = optionIndex && field === "name" ? "옵션명" : PRODUCT_FIELD_LABELS[field] ?? field;
  const detail = issue.code === "too_big" ? "길이·값이 너무 큽니다" : issue.code === "too_small" ? "값이 비어 있거나 너무 작습니다" : "형식이 올바르지 않습니다";
  return `${optionIndex ? `${optionIndex}번째 옵션의 ` : ""}${label} 입력값을 확인해 주세요 (${detail}).`;
}

const CategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  shippingType: z.enum(["domestic", "overseas"]),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional()
});

const NoticeSchema = z.object({
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(3000),
  imageUrl: z.string().trim().max(1200).nullable().optional(),
  youtubeUrl: z.string().trim().max(300).nullable().optional(),
  isPinned: z.boolean().optional(),
  isActive: z.boolean().optional()
});

const SourcingSchema = z.object({
  productName: z.string().trim().min(1).max(200),
  desiredPrice: z.string().trim().max(100).nullable().optional(),
  referenceUrl: z.union([z.literal(""), z.string().url()]).nullable().optional(),
  requesterName: z.string().trim().min(1).max(80),
  contact: z.string().trim().min(3).max(120),
  details: z.string().trim().max(3000).nullable().optional()
});

const PartnerSchema = z.object({
  companyName: z.string().trim().min(1).max(120),
  businessType: z.enum(["농가", "수산", "축산", "가공식품", "브랜드사", "기타"]),
  productName: z.string().trim().min(1).max(200),
  requesterName: z.string().trim().min(1).max(80),
  contact: z.string().trim().min(8).max(40),
  email: z.string().trim().email().max(160),
  referenceUrl: z.union([z.literal(""), z.string().url()]).nullable().optional(),
  details: z.string().trim().max(3000).nullable().optional(),
  agreePrivacy: z.literal(true),
  // 봇 차단용 숨은 칸: 사람이 입력하면 비어 있어야 합니다.
  website: z.string().max(0).optional()
});

const SettingSchema = z.object({
  key: z.enum(["guide", "guide_sections", "sourcing_intro"]),
  value: z.string().trim().min(1).max(30000)
});

const StatusSchema = z.object({ status: z.enum(["received", "reviewing", "completed"]) });
const ProductDisplayOrderSchema = z.object({
  items: z.array(z.object({
    id: z.string().trim().min(1),
    displayOrder: z.coerce.number().int().min(-100000000).max(100000000)
  })).min(1).max(5000)
});
const ProductGroupSchema = z.object({
  name: z.string().trim().min(1).max(160),
  imageUrl: z.string().trim().max(1200).nullable().optional(),
  categoryId: z.string().trim().min(1).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  displayOrder: z.coerce.number().int().min(-100000000).max(100000000).optional(),
  isVisible: z.boolean().optional(),
  productIds: z.array(z.string().trim().min(1)).max(5000).optional()
});
const ProductGroupDisplayOrderSchema = z.object({
  items: z.array(z.object({
    id: z.string().trim().min(1),
    displayOrder: z.coerce.number().int().min(-100000000).max(100000000)
  })).min(1).max(5000)
});
const SupplierSchema = z.object({
  name: z.string().trim().min(1).max(160),
  businessNumber: z.string().trim().max(40).nullable().optional(),
  representative: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().max(160).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  memo: z.string().trim().max(1000).nullable().optional(),
  isActive: z.boolean().optional()
});
const ShippingPolicySchema = z.object({
  name: z.string().trim().min(1).max(160),
  shippingType: z.enum(["domestic", "overseas"]),
  courier: z.string().trim().max(120).nullable().optional(),
  fee: z.coerce.number().int().nonnegative().optional(),
  feeLabel: z.string().trim().max(120).optional(),
  freeShippingThreshold: z.coerce.number().int().nonnegative().nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional()
});

export const catalogRouter = new Hono();

function errorResponse(c: Context, error: unknown) {
  if (error instanceof DatabaseError) {
    if (error.status === 400) return c.json(apiFailure(error.code, error.message), 400);
    if (error.status === 404) return c.json(apiFailure(error.code, error.message), 404);
    if (error.status === 409) return c.json(apiFailure(error.code, error.message), 409);
    return c.json(apiFailure(error.code, error.message), 502);
  }
  throw error;
}

catalogRouter.get("", publicRoute, async (c) => c.json(apiSuccess(await getPublicCatalog())));
catalogRouter.get("/", publicRoute, async (c) => c.json(apiSuccess(await getPublicCatalog())));
catalogRouter.get("/initial", publicRoute, async (c) => c.json(apiSuccess(await getPublicCatalogInitial())));
catalogRouter.get("/guide", publicRoute, async (c) => c.json(apiSuccess(await getPublicGuideSettings())));
catalogRouter.get("/notices", publicRoute, async (c) => c.json(apiSuccess(await getPublicNotices())));
catalogRouter.get("/operations", publicRoute, async (c) => c.json(apiSuccess(await getCatalogOperationsOverview(c.req.header("x-forwarded-for") || c.req.header("x-real-ip")))));

catalogRouter.post("/sourcing", publicRoute, async (c) => {
  const parsed = SourcingSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "필수 입력값을 확인해 주세요."), 400);
  return c.json(apiSuccess({ request: await createSourcingRequest(parsed.data) }), 201);
});

catalogRouter.post("/partner", publicRoute, async (c) => {
  const parsed = PartnerSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "");
    const message = field === "email" ? "이메일 주소를 확인해 주세요." : field === "agreePrivacy" ? "개인정보 수집·이용에 동의해 주세요." : field === "contact" ? "연락처를 확인해 주세요." : "필수 입력값을 확인해 주세요.";
    return c.json(apiFailure("INVALID_INPUT", message), 400);
  }
  const { agreePrivacy: _agree, website: _website, ...input } = parsed.data;
  const request = await createPartnerRequest({ ...input, referenceUrl: input.referenceUrl || null });
  return c.json(apiSuccess({ request: { id: request.id, emailStatus: request.emailStatus } }), 201);
});

catalogRouter.get("/admin", adminRoute, async (c) => c.json(apiSuccess(await getAdminCatalog())));

catalogRouter.get("/admin/products", adminRoute, async (c) => c.json(apiSuccess(await getAdminProductsCatalog({ preview: c.req.query("preview") === "1" }))));

catalogRouter.get("/admin/categories/summary", adminRoute, async (c) => c.json(apiSuccess(await getAdminCategoriesSummary())));

catalogRouter.get("/admin/groups", adminRoute, async (c) => c.json(apiSuccess(await getAdminProductGroups())));

catalogRouter.put("/admin/groups/display-order", adminRoute, async (c) => {
  const parsed = ProductGroupDisplayOrderSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "묶음상품 노출순서를 확인해 주세요."), 400);
  try {
    return c.json(apiSuccess(await updateProductGroupDisplayOrder(parsed.data.items)));
  } catch (error) {
    return errorResponse(c, error);
  }
});

catalogRouter.post("/admin/groups", adminRoute, async (c) => {
  const parsed = ProductGroupSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "묶음상품 입력값을 확인해 주세요."), 400);
  try {
    return c.json(apiSuccess({ group: await createProductGroup(parsed.data) }), 201);
  } catch (error) {
    return errorResponse(c, error);
  }
});

catalogRouter.put("/admin/groups/:id", adminRoute, async (c) => {
  const parsed = ProductGroupSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "묶음상품 입력값을 확인해 주세요."), 400);
  try {
    return c.json(apiSuccess({ group: await updateProductGroup(c.req.param("id"), parsed.data) }));
  } catch (error) {
    return errorResponse(c, error);
  }
});

catalogRouter.delete("/admin/groups/:id", adminRoute, async (c) => {
  try {
    return c.json(apiSuccess({ group: await removeProductGroup(c.req.param("id")) }));
  } catch (error) {
    return errorResponse(c, error);
  }
});

catalogRouter.get("/admin/suppliers", adminRoute, async (c) => c.json(apiSuccess(await getSuppliers())));

catalogRouter.post("/admin/suppliers", adminRoute, async (c) => {
  const parsed = SupplierSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "매입처 정보를 확인해 주세요."), 400);
  try {
    return c.json(apiSuccess({ supplier: await createSupplier(parsed.data) }), 201);
  } catch (error) {
    return errorResponse(c, error);
  }
});

catalogRouter.put("/admin/suppliers/:id", adminRoute, async (c) => {
  const parsed = SupplierSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "매입처 정보를 확인해 주세요."), 400);
  try {
    return c.json(apiSuccess({ supplier: await updateSupplier(c.req.param("id"), parsed.data) }));
  } catch (error) {
    return errorResponse(c, error);
  }
});

catalogRouter.delete("/admin/suppliers/:id", adminRoute, async (c) => {
  try {
    return c.json(apiSuccess({ supplier: await removeSupplier(c.req.param("id")) }));
  } catch (error) {
    return errorResponse(c, error);
  }
});

catalogRouter.get("/admin/shipping-policies", adminRoute, async (c) => c.json(apiSuccess(await getShippingPolicies())));

catalogRouter.post("/admin/shipping-policies", adminRoute, async (c) => {
  const parsed = ShippingPolicySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "배송 정책 입력값을 확인해 주세요."), 400);
  try {
    return c.json(apiSuccess({ policy: await createShippingPolicy(parsed.data) }), 201);
  } catch (error) {
    return errorResponse(c, error);
  }
});

catalogRouter.put("/admin/shipping-policies/:id", adminRoute, async (c) => {
  const parsed = ShippingPolicySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "배송 정책 입력값을 확인해 주세요."), 400);
  try {
    return c.json(apiSuccess({ policy: await updateShippingPolicy(c.req.param("id"), parsed.data) }));
  } catch (error) {
    return errorResponse(c, error);
  }
});

catalogRouter.delete("/admin/shipping-policies/:id", adminRoute, async (c) => {
  try {
    return c.json(apiSuccess({ policy: await removeShippingPolicy(c.req.param("id")) }));
  } catch (error) {
    return errorResponse(c, error);
  }
});

catalogRouter.get("/admin/notices", adminRoute, async (c) => c.json(apiSuccess(await getAdminNoticesCatalog())));

catalogRouter.get("/admin/history", adminRoute, async (c) => c.json(apiSuccess(await getAdminHistoryCatalog())));

catalogRouter.get("/admin/sourcing", adminRoute, async (c) => c.json(apiSuccess(await getAdminSourcingCatalog())));

catalogRouter.get("/admin/overview", adminRoute, async (c) => {
  const [overview, sync, sales] = await Promise.all([
    getAdminOverview(),
    getCatalogSyncOverview(),
    getSalesOverview("")
  ]);
  return c.json(apiSuccess({ overview, sync, sales }));
});

catalogRouter.get("/admin/sync", adminRoute, async (c) => {
  const [overview, runs, outbox] = await Promise.all([
    getCatalogSyncOverview(),
    listSyncRuns(),
    listSyncOutbox()
  ]);
  return c.json(apiSuccess({ overview, runs, outbox }));
});

catalogRouter.post("/admin/sync/transmit/:id", adminRoute, async (c) => {
  return c.json(apiFailure(
    "BALJUORA_WRITE_BLOCKED",
    "발주오라 공식 쓰기 API와 서버 전용 인증 계약이 확인되지 않아 실제 전송을 시작하지 않았습니다."
  ), 409);
});

catalogRouter.post("/admin/sync/connection/verify", adminRoute, async (c) => {
  const parsed = z.object({
    username: z.string().trim().min(1).max(120),
    password: z.string().min(1).max(300)
  }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(apiFailure("INVALID_INPUT", "발주오라 마스터 아이디와 비밀번호를 입력해 주세요."), 400);
  }
  return c.json(apiFailure(
    "BALJUORA_INTERACTIVE_VERIFICATION_REQUIRED",
    "발주오라 로그인은 Cloudflare 사람 인증값이 함께 필요합니다. 입력한 비밀번호는 저장하지 않았으며, 공식 API 키·OAuth·서버용 토큰이 발급되기 전에는 실시간 연동으로 표시하지 않습니다."
  ), 409);
});

catalogRouter.get("/admin/sales", adminRoute, async (c) => {
  return c.json(apiSuccess(await getSalesOverview(c.req.query("month") || "")));
});

catalogRouter.get("/admin/products/export", adminRoute, async (c) => {
  const mode = c.req.query("mode") === "bulk" ? "bulk" : "list";
  const rawIds = c.req.query("ids") || "";
  const ids = rawIds.split(",").map((id) => id.trim()).filter(Boolean);
  if (mode === "list" && ids.length > 5000) {
    return c.json(apiFailure("INVALID_INPUT", "한 번에 최대 5,000개 상품까지 선택할 수 있습니다."), 400);
  }
  const workbook = mode === "bulk" ? await buildBulkProductWorkbook() : await buildProductListWorkbook(ids.length > 0 ? ids : undefined);
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = mode === "bulk"
    ? `상품일괄변경_${today}.xlsx`
    : `${ids.length > 0 ? "선택상품리스트" : "상품리스트"}_${today}.xlsx`;
  return c.body(workbook, 200, {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control": "no-store"
  });
});

catalogRouter.post("/admin/products/export-selected", adminRoute, async (c) => {
  const parsed = z.object({
    ids: z.array(z.string().trim().min(1)).min(1).max(5000)
  }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(apiFailure("INVALID_INPUT", "다운로드할 상품을 하나 이상 선택해 주세요."), 400);
  }
  const workbook = await buildProductListWorkbook(parsed.data.ids);
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return c.body(workbook, 200, {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`선택상품리스트_${today}.xlsx`)}`,
    "Cache-Control": "no-store"
  });
});

catalogRouter.post("/admin/products/import-preview", adminRoute, async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return c.json(apiFailure("INVALID_FILE", "엑셀 파일을 선택해 주세요."), 400);
  }
  if (file.size > 5 * 1024 * 1024) {
    return c.json(apiFailure("FILE_TOO_LARGE", "엑셀 파일은 5MB 이하만 업로드할 수 있습니다."), 400);
  }
  const preview = await previewBulkProductWorkbook(new Uint8Array(await file.arrayBuffer()));
  return c.json(apiSuccess(preview));
});

catalogRouter.post("/admin/products/import-apply", adminRoute, async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return c.json(apiFailure("INVALID_FILE", "엑셀 파일을 선택해 주세요."), 400);
  }
  if (file.size > 5 * 1024 * 1024) {
    return c.json(apiFailure("FILE_TOO_LARGE", "엑셀 파일은 5MB 이하만 업로드할 수 있습니다."), 400);
  }
  try {
    const user = c.var.currentUser;
    const result = await applyBulkProductWorkbook(
      new Uint8Array(await file.arrayBuffer()),
      user.username || user.email
    );
    return c.json(apiSuccess(result));
  } catch (error) {
    if (error instanceof DatabaseError) return errorResponse(c, error);
    throw error;
  }
});

catalogRouter.post("/admin/products/image-upload", adminRoute, async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json(apiFailure("INVALID_FILE", "상품 이미지를 선택해 주세요."), 400);
  if (!["image/jpeg", "image/png"].includes(file.type)) {
    return c.json(apiFailure("INVALID_FILE_TYPE", "상품 이미지는 JPEG 또는 PNG만 업로드할 수 있습니다."), 400);
  }
  if (file.size >= 5 * 1024 * 1024) {
    return c.json(apiFailure("FILE_TOO_LARGE", "상품 이미지는 5MB 미만만 업로드할 수 있습니다."), 400);
  }
  try {
    const user = c.var.currentUser;
    const stored = await storagePut(`catalog/products/${Date.now()}-${file.name}`, new Uint8Array(await file.arrayBuffer()), file.type, { userId: user.id });
    return c.json(apiSuccess({ file: stored }), 201);
  } catch (error) {
    if (error instanceof StorageError) return c.json(apiFailure(error.code, error.message), error.status as 400 | 404 | 502 | 503);
    throw error;
  }
});

catalogRouter.post("/admin/groups/image-upload", adminRoute, async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json(apiFailure("INVALID_FILE", "묶음상품 대표 이미지를 선택해 주세요."), 400);
  if (!["image/jpeg", "image/png"].includes(file.type)) {
    return c.json(apiFailure("INVALID_FILE_TYPE", "대표 이미지는 JPEG 또는 PNG만 업로드할 수 있습니다."), 400);
  }
  if (file.size >= 5 * 1024 * 1024) {
    return c.json(apiFailure("FILE_TOO_LARGE", "대표 이미지는 5MB 미만만 업로드할 수 있습니다."), 400);
  }
  try {
    const user = c.var.currentUser;
    const stored = await storagePut(`catalog/groups/${Date.now()}-${file.name}`, new Uint8Array(await file.arrayBuffer()), file.type, { userId: user.id });
    return c.json(apiSuccess({ file: stored }), 201);
  } catch (error) {
    if (error instanceof StorageError) return c.json(apiFailure(error.code, error.message), error.status as 400 | 404 | 502 | 503);
    throw error;
  }
});

catalogRouter.put("/admin/products/display-order", adminRoute, async (c) => {
  const parsed = ProductDisplayOrderSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "상품 노출순서 입력값을 확인해 주세요."), 400);
  try {
    return c.json(apiSuccess(await updateProductDisplayOrder(parsed.data.items)));
  } catch (error) {
    return errorResponse(c, error);
  }
});

catalogRouter.post("/admin/products", adminRoute, async (c) => {
  const parsed = ProductSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", productInputMessage(parsed.error)), 400);
  return c.json(apiSuccess({ product: await createProduct(parsed.data) }), 201);
});

const BulkUpdateSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(500),
  changes: z.object({
    isVisible: z.boolean().optional(),
    isSoldOut: z.boolean().optional(),
    categoryId: z.string().trim().min(1).optional(),
    shippingPolicyId: z.string().trim().min(1).nullable().optional(),
    courier: z.string().trim().max(100).nullable().optional(),
    supplierName: z.string().trim().max(160).nullable().optional(),
    notes: z.string().trim().max(3000).nullable().optional(),
    imageUrl: z.string().trim().max(2048).nullable().optional(),
    season: z.object({
      isAlwaysOnSale: z.boolean(),
      saleStartMonth: z.coerce.number().int().min(1).max(12).nullable(),
      saleEndMonth: z.coerce.number().int().min(1).max(12).nullable()
    }).refine((value) => value.isAlwaysOnSale || (value.saleStartMonth != null && value.saleEndMonth != null), { message: "판매 시작월과 종료월을 함께 선택해 주세요." }).optional()
  }).refine((value) => Object.keys(value).length > 0, { message: "변경할 항목을 하나 이상 선택해 주세요." })
});

catalogRouter.post("/admin/products/bulk-update", adminRoute, async (c) => {
  const parsed = BulkUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", parsed.error.issues[0]?.message || "일괄 변경 입력값을 확인해 주세요."), 400);
  try {
    const user = c.var.currentUser;
    return c.json(apiSuccess(await bulkUpdateProducts([...new Set(parsed.data.ids)], parsed.data.changes, user.username || user.email)));
  } catch (error) {
    return errorResponse(c, error);
  }
});

catalogRouter.put("/admin/products/:id", adminRoute, async (c) => {
  const parsed = ProductSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", productInputMessage(parsed.error)), 400);
  try {
    const user = c.var.currentUser;
    return c.json(apiSuccess({ product: await updateProduct(c.req.param("id"), parsed.data, user.username || user.email) }));
  } catch (error) {
    return errorResponse(c, error);
  }
});

catalogRouter.delete("/admin/products/:id", adminRoute, async (c) => {
  try {
    return c.json(apiSuccess({ product: await removeProduct(c.req.param("id")) }));
  } catch (error) {
    return errorResponse(c, error);
  }
});

catalogRouter.post("/admin/categories", adminRoute, async (c) => {
  const parsed = CategorySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "카테고리 입력값을 확인해 주세요."), 400);
  return c.json(apiSuccess({ category: await createCategory(parsed.data) }), 201);
});

catalogRouter.put("/admin/categories/:id", adminRoute, async (c) => {
  const parsed = CategorySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "카테고리 입력값을 확인해 주세요."), 400);
  try {
    return c.json(apiSuccess({ category: await updateCategory(c.req.param("id"), parsed.data) }));
  } catch (error) {
    return errorResponse(c, error);
  }
});

catalogRouter.delete("/admin/categories/:id", adminRoute, async (c) => {
  try {
    return c.json(apiSuccess({ category: await removeCategory(c.req.param("id")) }));
  } catch (error) {
    return errorResponse(c, error);
  }
});

catalogRouter.post("/admin/notices", adminRoute, async (c) => {
  const parsed = NoticeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "공지 입력값을 확인해 주세요."), 400);
  return c.json(apiSuccess({ notice: await createNotice(parsed.data) }), 201);
});

catalogRouter.put("/admin/notices/:id", adminRoute, async (c) => {
  const parsed = NoticeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "공지 입력값을 확인해 주세요."), 400);
  try {
    return c.json(apiSuccess({ notice: await updateNotice(c.req.param("id"), parsed.data) }));
  } catch (error) {
    return errorResponse(c, error);
  }
});

catalogRouter.put("/admin/settings", adminRoute, async (c) => {
  const parsed = SettingSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "설정 입력값을 확인해 주세요."), 400);
  return c.json(apiSuccess({ setting: await saveSetting(parsed.data.key, parsed.data.value) }));
});

catalogRouter.put("/admin/sourcing/:id", adminRoute, async (c) => {
  const parsed = StatusSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "처리 상태를 확인해 주세요."), 400);
  try {
    return c.json(apiSuccess({ request: await updateSourcingStatus(c.req.param("id"), parsed.data.status) }));
  } catch (error) {
    return errorResponse(c, error);
  }
});
