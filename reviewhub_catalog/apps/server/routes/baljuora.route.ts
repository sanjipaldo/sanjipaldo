// 발주오라 수동 동기화 API(/api/baljuora, 2026-11-22). 자세한 흐름은 services/baljuora-sync.ts 맨 위 설명을 봅니다.
// - /admin/*  : 관리자(로그인) — 상태·변경 목록·설정·작업 만들기/보기/취소·가져오기·이대로 두기
// - /runner/* : 발주오라 관리자 창의 책갈피 스크립트 — 10글자 작업 코드로만 접근(30분 만료, 작업에 든 상품만)
import { Hono, type Context } from "hono";
import { z } from "zod";
import { BALJUORA_SYNC_FIELDS } from "@repo/shared/baljuora-sync";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { DatabaseError } from "../_core/db";
import { adminRoute, publicRoute } from "../_core/route-helpers";
import {
  cancelBaljuoraJob,
  reissueBaljuoraJobCode,
  createBaljuoraJob,
  createDoogoCategoriesFromBaljuora,
  getBaljuoraJob,
  getBaljuoraOverview,
  getBaljuoraProductPrices,
  getRunnerImage,
  ignoreBaljuoraDifferences,
  importBaljuoraSubcategories,
  ingestRunnerResults,
  listBaljuoraChanges,
  listBaljuoraJobs,
  pullFromBaljuora,
  recordRunnerProgress,
  saveBaljuoraSettings,
  startRunnerJob
} from "../services/baljuora-sync";
import {
  buildFeeInvoiceFile,
  buildHometaxFile,
  getHometaxPreview,
  getHometaxSettings,
  getSalesDashboard,
  listBuyers,
  listSupplierSettlements,
  markFeeInvoices,
  saveHometaxSettings,
  updateBuyer,
  updateSupplierSettlement,
  updateSupplierSettlementsBulk
} from "../services/baljuora-sales";
import { BUYER_OVERRIDE_FIELDS } from "@repo/shared/baljuora-sales";
import { SUPPLIER_SETTLEMENT_STATUSES } from "@repo/shared/supplier-portal";
import { catalogRevisionMiddleware } from "../services/catalog-version";

export const baljuoraRouter = new Hono();
// 관리자 저장·책갈피 결과가 성공하면 공개 단가표 "바뀜 표시"를 새로 적습니다(services/catalog-version.ts).
baljuoraRouter.use("/admin/*", catalogRevisionMiddleware);
baljuoraRouter.use("/runner/:code/results", catalogRevisionMiddleware);

function errorResponse(c: Context, error: unknown) {
  if (error instanceof DatabaseError) {
    const status = [400, 403, 404, 409, 503].includes(error.status) ? error.status as 400 | 403 | 404 | 409 | 503 : 502;
    return c.json(apiFailure(status === 503 ? "SERVICE_UNAVAILABLE" : error.code, error.message), status);
  }
  throw error;
}

const FieldSchema = z.enum(BALJUORA_SYNC_FIELDS as [string, ...string[]]);
const ProductIdsSchema = z.array(z.string().trim().min(1).max(120)).max(2000);

// ─── 관리자 ───────────────────────────────────────────────────────────────────

baljuoraRouter.get("/admin/overview", adminRoute, async (c) => {
  try {
    return c.json(apiSuccess(await getBaljuoraOverview()));
  } catch (error) {
    return errorResponse(c, error);
  }
});

baljuoraRouter.get("/admin/changes", adminRoute, async (c) => {
  try {
    return c.json(apiSuccess(await listBaljuoraChanges()));
  } catch (error) {
    return errorResponse(c, error);
  }
});

// 상품 수정 창: 마지막 비교·동기화 때 읽은 발주오라 가격(공급가·황금농부 그룹 공급가·매입원가)
baljuoraRouter.get("/admin/products/:productId", adminRoute, async (c) => {
  const productId = c.req.param("productId").trim();
  if (!productId || productId.length > 120) return c.json(apiFailure("INVALID_INPUT", "상품 id를 확인해 주세요."), 400);
  try {
    return c.json(apiSuccess(await getBaljuoraProductPrices(productId)));
  } catch (error) {
    return errorResponse(c, error);
  }
});

baljuoraRouter.put("/admin/settings", adminRoute, async (c) => {
  const parsed = z.object({
    merchantSlug: z.string().trim().min(1).max(60).optional(),
    groupKeyword: z.string().trim().min(1).max(60).optional(),
    categoryMap: z.record(z.string().max(120), z.string().max(120)).optional(),
    shippingPolicyMap: z.record(z.string().max(120), z.string().max(120)).optional(),
    baljuoraCategoryMap: z.record(z.string().max(120), z.string().max(120)).optional(),
    subcategoryMap: z.record(z.string().max(120), z.string().max(120)).optional(),
    categoryTreeExclude: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
    templateCode: z.string().trim().max(80).nullable().optional(),
    salesOnCompare: z.boolean().optional(),
    salesMonths: z.number().int().min(1).max(12).optional()
  }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "동기화 설정 값을 확인해 주세요."), 400);
  try {
    return c.json(apiSuccess({ settings: await saveBaljuoraSettings(parsed.data) }));
  } catch (error) {
    return errorResponse(c, error);
  }
});

baljuoraRouter.post("/admin/jobs", adminRoute, async (c) => {
  const parsed = z.discriminatedUnion("type", [
    // sales: 비교 때 판매·매출처도 함께 읽을지(없으면 동기화 설정을 따름)
    z.object({ type: z.literal("compare"), sales: z.boolean().optional() }),
    // 판매·매출처만 읽기(이번 달 포함 최근 months개월)
    z.object({ type: z.literal("sales"), months: z.number().int().min(1).max(12).optional() }),
    z.object({
      type: z.literal("push"),
      productIds: ProductIdsSchema,
      fieldsByProduct: z.record(z.string().max(120), z.array(FieldSchema).max(BALJUORA_SYNC_FIELDS.length)).optional(),
      // true: 상품이 없어도 DB센터 → 발주오라 상품 카테고리 맞추기(추가·이름 바꾸기)만 보냄
      categoryTree: z.boolean().optional()
    })
  ]).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success || (parsed.data.type === "push" && parsed.data.productIds.length === 0 && !parsed.data.categoryTree)) return c.json(apiFailure("INVALID_INPUT", "동기화할 상품을 골라 주세요."), 400);
  try {
    const user = c.var.currentUser;
    const input = parsed.data.type === "compare"
      ? { type: "compare" as const, sales: parsed.data.sales }
      : parsed.data.type === "sales"
        ? { type: "sales" as const, months: parsed.data.months }
        : { type: "push" as const, productIds: parsed.data.productIds, fieldsByProduct: parsed.data.fieldsByProduct as Record<string, Array<(typeof BALJUORA_SYNC_FIELDS)[number]>> | undefined, categoryTree: parsed.data.categoryTree };
    return c.json(apiSuccess(await createBaljuoraJob(input, user?.username || user?.email || null)));
  } catch (error) {
    return errorResponse(c, error);
  }
});

baljuoraRouter.get("/admin/jobs", adminRoute, async (c) => {
  try {
    return c.json(apiSuccess({ jobs: await listBaljuoraJobs(Number(c.req.query("limit") || 15)) }));
  } catch (error) {
    return errorResponse(c, error);
  }
});

baljuoraRouter.get("/admin/jobs/:id", adminRoute, async (c) => {
  try {
    return c.json(apiSuccess({ job: await getBaljuoraJob(c.req.param("id")) }));
  } catch (error) {
    return errorResponse(c, error);
  }
});

// 작업 코드 다시 받기(기다리는 작업만): DB센터 화면을 새로 열어 코드가 안 보일 때
baljuoraRouter.post("/admin/jobs/:id/code", adminRoute, async (c) => {
  try {
    return c.json(apiSuccess(await reissueBaljuoraJobCode(c.req.param("id"))));
  } catch (error) {
    return errorResponse(c, error);
  }
});

baljuoraRouter.post("/admin/jobs/:id/cancel", adminRoute, async (c) => {
  try {
    return c.json(apiSuccess({ job: await cancelBaljuoraJob(c.req.param("id")) }));
  } catch (error) {
    return errorResponse(c, error);
  }
});

baljuoraRouter.post("/admin/pull", adminRoute, async (c) => {
  const parsed = z.object({
    productIds: ProductIdsSchema.max(500).optional(),
    baljuoraIds: z.array(z.string().trim().min(1).max(80)).max(500).optional(),
    fields: z.array(FieldSchema).max(BALJUORA_SYNC_FIELDS.length).optional(),
    // '가져올 변경' 탭: 발주오라에서 바뀐 칸만. 없으면 '발주오라 기준 맞추기'(다른 칸 전부, fields로 고름)
    onlyPulled: z.boolean().optional()
  }).refine((value) => (value.productIds?.length ?? 0) + (value.baljuoraIds?.length ?? 0) > 0)
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "가져올 상품을 골라 주세요."), 400);
  try {
    const user = c.var.currentUser;
    return c.json(apiSuccess(await pullFromBaljuora(parsed.data as never, user?.username || user?.email || "admin")));
  } catch (error) {
    return errorResponse(c, error);
  }
});

// 카테고리 맞추기: 연결되지 않은 발주오라 카테고리를 DB센터에 같은 이름으로 만들고 연결합니다(발주오라는 바꾸지 않음).
baljuoraRouter.post("/admin/categories/from-baljuora", adminRoute, async (c) => {
  const parsed = z.object({
    baljuoraCategoryIds: z.array(z.string().trim().min(1).max(80)).min(1).max(100),
    shippingType: z.enum(["domestic", "overseas"])
  }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "만들 발주오라 카테고리를 골라 주세요."), 400);
  try {
    return c.json(apiSuccess(await createDoogoCategoriesFromBaljuora(parsed.data)));
  } catch (error) {
    return errorResponse(c, error);
  }
});

// 카테고리 트리 맞추기: 발주오라 2차 카테고리를 DB센터 2차 카테고리로 가져와 연결합니다(브랜드별 제외, 발주오라는 바꾸지 않음).
baljuoraRouter.post("/admin/categories/import-subcategories", adminRoute, async (c) => {
  const parsed = z.object({ baljuoraIds: z.array(z.string().trim().min(1).max(80)).max(300).optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "가져올 발주오라 카테고리를 확인해 주세요."), 400);
  try {
    return c.json(apiSuccess(await importBaljuoraSubcategories(parsed.data)));
  } catch (error) {
    return errorResponse(c, error);
  }
});

baljuoraRouter.post("/admin/ignore", adminRoute, async (c) => {
  const parsed = z.object({ productIds: ProductIdsSchema.min(1), fields: z.array(FieldSchema).max(BALJUORA_SYNC_FIELDS.length).optional() })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "상품을 골라 주세요."), 400);
  try {
    return c.json(apiSuccess(await ignoreBaljuoraDifferences(parsed.data.productIds, parsed.data.fields as never)));
  } catch (error) {
    return errorResponse(c, error);
  }
});

// ─── 판매·매출처·홈택스·공급사 정산(migration 036) ─────────────────────────────

const MonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

// 판매 현황: from~to(주문일) 합계·일별·상품/공급사/카테고리/매출처 순위, 오늘 판매
baljuoraRouter.get("/admin/sales/summary", adminRoute, async (c) => {
  try {
    return c.json(apiSuccess(await getSalesDashboard({ from: c.req.query("from") ?? null, to: c.req.query("to") ?? null })));
  } catch (error) {
    return errorResponse(c, error);
  }
});

baljuoraRouter.get("/admin/buyers", adminRoute, async (c) => {
  try {
    return c.json(apiSuccess(await listBuyers({ search: c.req.query("search") ?? null })));
  } catch (error) {
    return errorResponse(c, error);
  }
});

// 매출처: 세금계산서용 칸 고치기(발주오라는 바꾸지 않음)·메모
baljuoraRouter.put("/admin/buyers/:id", adminRoute, async (c) => {
  const overrideShape = Object.fromEntries(BUYER_OVERRIDE_FIELDS.map((field) => [field, z.string().max(200).nullable().optional()]));
  const parsed = z.object({
    overrides: z.object(overrideShape).nullable().optional(),
    memo: z.string().max(500).nullable().optional()
  }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "매출처 정보를 확인해 주세요."), 400);
  try {
    return c.json(apiSuccess(await updateBuyer(c.req.param("id"), parsed.data as { overrides?: Record<string, string | null> | null; memo?: string | null })));
  } catch (error) {
    return errorResponse(c, error);
  }
});

baljuoraRouter.get("/admin/hometax/settings", adminRoute, async (c) => {
  try {
    return c.json(apiSuccess({ settings: await getHometaxSettings() }));
  } catch (error) {
    return errorResponse(c, error);
  }
});

baljuoraRouter.put("/admin/hometax/settings", adminRoute, async (c) => {
  const parsed = z.object({
    supplier: z.object({
      businessNumber: z.string().max(20).optional(),
      branchNumber: z.string().max(10).optional(),
      companyName: z.string().max(100).optional(),
      ceoName: z.string().max(60).optional(),
      address: z.string().max(200).optional(),
      businessType: z.string().max(80).optional(),
      businessItem: z.string().max(120).optional(),
      email: z.string().max(80).optional()
    }).optional(),
    vatIncluded: z.boolean().optional(),
    receiptType: z.enum(["01", "02"]).optional(),
    includeShipping: z.boolean().optional(),
    // 판매 수수료 세금계산서(두고푸드 → 공급사): 수수료에 부가세 포함(기본) / 별도
    commissionVatIncluded: z.boolean().optional()
  }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "홈택스 설정 값을 확인해 주세요."), 400);
  try {
    return c.json(apiSuccess({ settings: await saveHometaxSettings(parsed.data) }));
  } catch (error) {
    return errorResponse(c, error);
  }
});

// 홈택스 신고 미리보기: 그 달 매출처별 세금계산서(과세)·계산서(면세) 목록과 빠진 매출처
baljuoraRouter.get("/admin/hometax", adminRoute, async (c) => {
  const month = MonthSchema.safeParse(c.req.query("month"));
  if (!month.success) return c.json(apiFailure("INVALID_INPUT", "신고할 달을 골라 주세요."), 400);
  try {
    return c.json(apiSuccess(await getHometaxPreview(month.data)));
  } catch (error) {
    return errorResponse(c, error);
  }
});

// 홈택스 일괄발급 엑셀(양식과 같은 칸, 100건씩 나눔)
baljuoraRouter.get("/admin/hometax/file", adminRoute, async (c) => {
  const month = MonthSchema.safeParse(c.req.query("month"));
  const kind = z.enum(["taxable", "exempt"]).safeParse(c.req.query("kind"));
  if (!month.success || !kind.success) return c.json(apiFailure("INVALID_INPUT", "달과 종류(세금계산서/계산서)를 골라 주세요."), 400);
  try {
    const file = await buildHometaxFile(month.data, kind.data, Number(c.req.query("part") || 1));
    return c.body(file.bytes, 200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Cache-Control": "no-store"
    });
  } catch (error) {
    return errorResponse(c, error);
  }
});

// 여러 공급사 상태를 한 번에(판매 수수료 "한 번에 청구하기" 등)
baljuoraRouter.put("/admin/settlements/bulk", adminRoute, async (c) => {
  const parsed = z.object({
    kind: z.enum(["weekly", "monthly", "fee"]),
    period: z.string().trim().max(10),
    status: z.enum(SUPPLIER_SETTLEMENT_STATUSES as [string, ...string[]]),
    supplierNames: z.array(z.string().trim().min(1).max(120)).min(1).max(300)
  }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "바꿀 공급사와 상태를 확인해 주세요."), 400);
  try {
    const user = c.var.currentUser;
    return c.json(apiSuccess(await updateSupplierSettlementsBulk({ ...parsed.data, status: parsed.data.status as (typeof SUPPLIER_SETTLEMENT_STATUSES)[number] }, user?.username || user?.email || null)));
  } catch (error) {
    return errorResponse(c, error);
  }
});

// 판매 수수료 세금계산서(두고푸드 → 공급사) 홈택스 일괄발급 엑셀. supplier를 주지 않으면 입금 확인 + 발행 전 공급사
baljuoraRouter.get("/admin/settlements/fee-invoice-file", adminRoute, async (c) => {
  const month = MonthSchema.safeParse(c.req.query("month"));
  if (!month.success) return c.json(apiFailure("INVALID_INPUT", "세금계산서를 낼 달을 골라 주세요."), 400);
  try {
    const names = (c.req.queries("supplier") ?? []).map((name) => name.trim()).filter(Boolean).slice(0, 300);
    const file = await buildFeeInvoiceFile(month.data, names.length > 0 ? names : null);
    return c.body(file.bytes, 200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "X-Doogo-Invoice-Suppliers": encodeURIComponent(JSON.stringify(file.suppliers)),
      "Cache-Control": "no-store"
    });
  } catch (error) {
    return errorResponse(c, error);
  }
});

// 홈택스에서 발행한 뒤 "발행 완료로 표시"(issued false = 되돌리기)
baljuoraRouter.post("/admin/settlements/fee-invoices", adminRoute, async (c) => {
  const parsed = z.object({
    month: MonthSchema,
    supplierNames: z.array(z.string().trim().min(1).max(120)).min(1).max(300),
    issued: z.boolean()
  }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "달과 공급사를 확인해 주세요."), 400);
  try {
    const user = c.var.currentUser;
    return c.json(apiSuccess(await markFeeInvoices(parsed.data, user?.username || user?.email || null)));
  } catch (error) {
    return errorResponse(c, error);
  }
});

// 공급사 정산 목록: kind = weekly(주 정산 지급, period = 판매 주 월요일 YYYY-MM-DD) · monthly(월 정산 지급, YYYY-MM) · fee(판매 수수료 청구, YYYY-MM).
// 예전처럼 ?month=YYYY-MM만 주면 월 정산입니다. period를 비우면 지난주·지난달.
baljuoraRouter.get("/admin/settlements", adminRoute, async (c) => {
  const kind = c.req.query("kind");
  if (kind && !["weekly", "monthly", "fee"].includes(kind)) return c.json(apiFailure("INVALID_INPUT", "정산 종류를 확인해 주세요."), 400);
  try {
    c.header("Cache-Control", "no-store");
    return c.json(apiSuccess(await listSupplierSettlements({ kind: kind ?? null, period: c.req.query("period") ?? null, month: c.req.query("month") ?? null })));
  } catch (error) {
    return errorResponse(c, error);
  }
});

baljuoraRouter.put("/admin/settlements", adminRoute, async (c) => {
  const parsed = z.object({
    supplierName: z.string().trim().min(1).max(120),
    kind: z.enum(["weekly", "monthly", "fee"]).optional(),
    period: z.string().trim().max(10).optional(),
    month: MonthSchema.optional(),
    status: z.enum(SUPPLIER_SETTLEMENT_STATUSES as [string, ...string[]]),
    memo: z.string().max(500).nullable().optional()
  }).refine((value) => Boolean(value.period || value.month)).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "정산 상태를 확인해 주세요."), 400);
  try {
    const user = c.var.currentUser;
    const state = await updateSupplierSettlement({ ...parsed.data, status: parsed.data.status as (typeof SUPPLIER_SETTLEMENT_STATUSES)[number] }, user?.username || user?.email || null);
    return c.json(apiSuccess({ state }));
  } catch (error) {
    return errorResponse(c, error);
  }
});

// ─── 책갈피 스크립트(발주오라 관리자 창) ─────────────────────────────────────────

const CodeSchema = z.string().trim().min(10).max(16);

baljuoraRouter.get("/runner/:code", publicRoute, async (c) => {
  const code = CodeSchema.safeParse(c.req.param("code"));
  if (!code.success) return c.json(apiFailure("INVALID_INPUT", "작업 코드를 확인해 주세요."), 400);
  try {
    return c.json(apiSuccess(await startRunnerJob(code.data)));
  } catch (error) {
    return errorResponse(c, error);
  }
});

baljuoraRouter.post("/runner/:code/progress", publicRoute, async (c) => {
  const code = CodeSchema.safeParse(c.req.param("code"));
  const parsed = z.object({ done: z.number().min(0).max(1_000_000), total: z.number().min(0).max(1_000_000), message: z.string().max(500) }).safeParse(await c.req.json().catch(() => null));
  if (!code.success || !parsed.success) return c.json(apiFailure("INVALID_INPUT", "진행 상황 형식이 올바르지 않습니다."), 400);
  try {
    return c.json(apiSuccess(await recordRunnerProgress(code.data, parsed.data)));
  } catch (error) {
    return errorResponse(c, error);
  }
});

baljuoraRouter.post("/runner/:code/results", publicRoute, async (c) => {
  const code = CodeSchema.safeParse(c.req.param("code"));
  const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  if (!code.success || !body || typeof body !== "object") return c.json(apiFailure("INVALID_INPUT", "결과 형식이 올바르지 않습니다."), 400);
  try {
    return c.json(apiSuccess(await ingestRunnerResults(code.data, {
      final: Boolean(body.final),
      error: typeof body.error === "string" ? body.error : null,
      diagnostics: body.diagnostics && typeof body.diagnostics === "object" ? body.diagnostics as Record<string, unknown> : null,
      categories: body.categories,
      // 발주오라 배송비 정책 목록(1.5.0부터, 서비스에서 칸을 정리함)
      shippingPolicies: Array.isArray(body.shippingPolicies) ? body.shippingPolicies : undefined,
      group: body.group === null ? null : body.group && typeof body.group === "object" ? body.group as { id: string; name: string } : undefined,
      snapshots: Array.isArray(body.snapshots) ? body.snapshots as never : undefined,
      items: Array.isArray(body.items) ? body.items as never : undefined,
      // 카테고리 트리 맞추기 결과(서비스에서 작업에 든 추가만 받고 칸을 정리함)
      categoryTree: body.categoryTree && typeof body.categoryTree === "object" ? body.categoryTree : undefined,
      // 판매·매출처(1.7.0, 서비스에서 칸을 정리함): 주문 상품 줄·매출처·상품 과세 여부·판매 읽기 끝
      salesLines: Array.isArray(body.salesLines) ? body.salesLines : undefined,
      buyers: Array.isArray(body.buyers) ? body.buyers : undefined,
      productTax: body.productTax && typeof body.productTax === "object" && !Array.isArray(body.productTax) ? body.productTax : undefined,
      salesDone: body.salesDone && typeof body.salesDone === "object" ? body.salesDone as { complete?: unknown; error?: unknown } : undefined
    })));
  } catch (error) {
    return errorResponse(c, error);
  }
});

baljuoraRouter.get("/runner/:code/image/:productId", publicRoute, async (c) => {
  const code = CodeSchema.safeParse(c.req.param("code"));
  if (!code.success) return c.json(apiFailure("INVALID_INPUT", "작업 코드를 확인해 주세요."), 400);
  try {
    const image = await getRunnerImage(code.data, c.req.param("productId"));
    return new Response(image.bytes, {
      headers: {
        "Content-Type": image.contentType,
        "Content-Disposition": `inline; filename="${image.fileName}"`,
        "X-File-Name": image.fileName,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return errorResponse(c, error);
  }
});
