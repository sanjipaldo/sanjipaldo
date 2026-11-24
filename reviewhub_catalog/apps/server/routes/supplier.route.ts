// 공급사 센터 API(/api/supplier/*, 2026-11-20). 마스터가 만든 공급사 계정으로 로그인한 사람만 씁니다.
// - 로그인 안 함 401, 공급사 계정이 아님 403, 멈춘 계정·사용 중지된 공급사 403
// - 자기 공급사(products.supplierName = 공급사 이름)의 상품·요청·판매 내역만 돌려줍니다.
// - 상품을 직접 바꾸지 않고 변경 요청만 만듭니다(마스터 승인 후 반영).
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { isMonthKey, seoulDateKey } from "@repo/shared/supplier-portal";
import { DatabaseError } from "../_core/db";
import {
  cancelSupplierRequest,
  changeSupplierPassword,
  createSupplierRequest,
  getSupplierContext,
  getSupplierDashboard,
  getSupplierSalesMonth,
  listSupplierCategories,
  listSupplierProducts,
  listSupplierRequests,
  supplierProfile,
  supplierSettlementSettings,
  touchSupplierLogin,
  type SupplierContext
} from "../services/supplier-portal";
import { StorageError, storagePut } from "../services/s3_storage";

declare module "hono" {
  interface ContextVariableMap {
    supplierContext: SupplierContext;
  }
}

export const supplierRouter = new Hono();

function errorResponse(c: Context, error: unknown) {
  if (error instanceof DatabaseError) {
    const status = [400, 403, 404, 409, 503].includes(error.status) ? error.status as 400 | 403 | 404 | 409 | 503 : 502;
    return c.json(apiFailure(status === 503 ? "SERVICE_UNAVAILABLE" : error.code, error.message), status);
  }
  throw error;
}

const supplierAuth: MiddlewareHandler = async (c, next) => {
  const user = c.var.user;
  if (!user) return c.json(apiFailure("UNAUTHORIZED", "로그인이 필요해요."), 401);
  let context: SupplierContext | null;
  try {
    context = await getSupplierContext(user.id);
  } catch (error) {
    return errorResponse(c, error);
  }
  if (!context) return c.json(apiFailure("FORBIDDEN", "공급사 계정이 아니에요. 두고푸드에서 받은 공급사 아이디로 로그인해 주세요."), 403);
  if (!context.account.isActive) return c.json(apiFailure("FORBIDDEN", "사용이 멈춘 계정이에요. 두고푸드에 문의해 주세요."), 403);
  if (!context.supplier.isActive) return c.json(apiFailure("FORBIDDEN", "거래가 중지된 공급사예요. 두고푸드에 문의해 주세요."), 403);
  c.set("supplierContext", context);
  c.header("Cache-Control", "no-store");
  await next();
};

supplierRouter.get("/me", supplierAuth, async (c) => {
  const context = c.var.supplierContext;
  await touchSupplierLogin(context.account.id).catch(() => undefined);
  // 정산 방식(판매수수료 · 일반 도매)과 지급 주기: 두고푸드 관리자가 공급사 관리에서 정합니다.
  return c.json(apiSuccess({ ...supplierProfile(context), settlement: await supplierSettlementSettings(context) }));
});

supplierRouter.get("/dashboard", supplierAuth, async (c) => {
  try {
    return c.json(apiSuccess(await getSupplierDashboard(c.var.supplierContext)));
  } catch (error) {
    return errorResponse(c, error);
  }
});

supplierRouter.get("/products", supplierAuth, async (c) => {
  try {
    return c.json(apiSuccess(await listSupplierProducts(c.var.supplierContext)));
  } catch (error) {
    return errorResponse(c, error);
  }
});

supplierRouter.get("/categories", supplierAuth, async (c) => c.json(apiSuccess(await listSupplierCategories())));

supplierRouter.post("/products/image-upload", supplierAuth, async (c) => {
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return c.json(apiFailure("INVALID_FILE", "상품 이미지를 골라 주세요."), 400);
  if (!["image/jpeg", "image/png"].includes(file.type)) return c.json(apiFailure("INVALID_FILE_TYPE", "상품 이미지는 JPG 또는 PNG만 올릴 수 있어요."), 400);
  if (file.size >= 5 * 1024 * 1024) return c.json(apiFailure("FILE_TOO_LARGE", "상품 이미지는 5MB보다 작아야 해요."), 400);
  try {
    const context = c.var.supplierContext;
    const safeName = file.name.replace(/[^\w.\-가-힣]/g, "_").slice(-80) || "image";
    const stored = await storagePut(`catalog/supplier-uploads/${context.supplier.id}/${Date.now()}-${safeName}`, new Uint8Array(await file.arrayBuffer()), file.type, { userId: context.account.userId });
    return c.json(apiSuccess({ file: stored }), 201);
  } catch (error) {
    if (error instanceof StorageError) return c.json(apiFailure(error.code, error.message), error.status as 400 | 404 | 502 | 503);
    throw error;
  }
});

const MonthNumber = z.number().int().min(1).max(12).nullable().optional();
const PriceNumber = z.number().int().min(0).max(100_000_000);
const ChangesSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  imageUrl: z.string().trim().max(2048).nullable().optional(),
  origin: z.string().trim().max(100).nullable().optional(),
  costPrice: PriceNumber.optional(),
  salePriceMode: z.enum(["autonomous", "fixed"]).optional(),
  salePrice: PriceNumber.nullable().optional(),
  isAlwaysOnSale: z.boolean().optional(),
  saleStartMonth: MonthNumber,
  saleEndMonth: MonthNumber,
  isSoldOut: z.boolean().optional(),
  shippingType: z.enum(["domestic", "overseas"]).optional(),
  categoryId: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional()
});
const RequestSchema = z.object({
  kind: z.enum(["update", "create"]),
  productId: z.string().trim().max(80).nullable().optional(),
  changes: ChangesSchema,
  note: z.string().trim().max(1000).nullable().optional()
});

supplierRouter.get("/requests", supplierAuth, async (c) => {
  try {
    return c.json(apiSuccess(await listSupplierRequests(c.var.supplierContext)));
  } catch (error) {
    return errorResponse(c, error);
  }
});

supplierRouter.post("/requests", supplierAuth, async (c) => {
  const parsed = RequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path.at(-1) ?? "");
    const labels: Record<string, string> = { name: "상품명", costPrice: "공급가", salePrice: "권장 판매가", saleStartMonth: "판매 시작월", saleEndMonth: "판매 종료월", origin: "원산지", description: "상품 설명", note: "요청 메모" };
    return c.json(apiFailure("INVALID_INPUT", labels[field] ? `'${labels[field]}' 칸을 확인해 주세요.` : "요청 내용을 확인해 주세요."), 400);
  }
  try {
    const result = await createSupplierRequest(c.var.supplierContext, parsed.data);
    return c.json(apiSuccess(result), result.replaced ? 200 : 201);
  } catch (error) {
    return errorResponse(c, error);
  }
});

supplierRouter.post("/requests/:id/cancel", supplierAuth, async (c) => {
  try {
    return c.json(apiSuccess(await cancelSupplierRequest(c.var.supplierContext, c.req.param("id"))));
  } catch (error) {
    return errorResponse(c, error);
  }
});

supplierRouter.get("/sales", supplierAuth, async (c) => {
  const requested = c.req.query("month");
  const month = isMonthKey(requested) ? requested : seoulDateKey().slice(0, 7);
  try {
    return c.json(apiSuccess(await getSupplierSalesMonth(c.var.supplierContext, month)));
  } catch (error) {
    return errorResponse(c, error);
  }
});

const PasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(1).max(128) });

supplierRouter.post("/password", supplierAuth, async (c) => {
  const parsed = PasswordSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "비밀번호를 확인해 주세요."), 400);
  try {
    return c.json(apiSuccess(await changeSupplierPassword(c.var.supplierContext, parsed.data.currentPassword, parsed.data.newPassword, c.var.session?.id)));
  } catch (error) {
    return errorResponse(c, error);
  }
});
