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
  createBaljuoraJob,
  getBaljuoraJob,
  getBaljuoraOverview,
  getBaljuoraProductPrices,
  getRunnerImage,
  ignoreBaljuoraDifferences,
  ingestRunnerResults,
  listBaljuoraChanges,
  listBaljuoraJobs,
  pullFromBaljuora,
  recordRunnerProgress,
  saveBaljuoraSettings,
  startRunnerJob
} from "../services/baljuora-sync";

export const baljuoraRouter = new Hono();

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
    templateCode: z.string().trim().max(80).nullable().optional()
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
    z.object({ type: z.literal("compare") }),
    z.object({
      type: z.literal("push"),
      productIds: ProductIdsSchema.min(1),
      fieldsByProduct: z.record(z.string().max(120), z.array(FieldSchema).max(BALJUORA_SYNC_FIELDS.length)).optional()
    })
  ]).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "동기화할 상품을 골라 주세요."), 400);
  try {
    const user = c.var.currentUser;
    const input = parsed.data.type === "compare"
      ? { type: "compare" as const }
      : { type: "push" as const, productIds: parsed.data.productIds, fieldsByProduct: parsed.data.fieldsByProduct as Record<string, Array<(typeof BALJUORA_SYNC_FIELDS)[number]>> | undefined };
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
    fields: z.array(FieldSchema).max(BALJUORA_SYNC_FIELDS.length).optional()
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
      group: body.group === null ? null : body.group && typeof body.group === "object" ? body.group as { id: string; name: string } : undefined,
      snapshots: Array.isArray(body.snapshots) ? body.snapshots as never : undefined,
      items: Array.isArray(body.items) ? body.items as never : undefined
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
