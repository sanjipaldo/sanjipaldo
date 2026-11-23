// 발주오라 수동 동기화 서버(2026-11-22, 관리자 요청 "DB센터에서 고치고 동기화 버튼 → 발주오라 도매몰에도 똑같이").
// 발주오라는 공개 API가 없고 관리자 로그인에 사람 확인(Cloudflare)이 있습니다. 서버가 아이디·비밀번호로 대신 로그인하지 않습니다.
// 흐름: 관리자가 작업(비교 또는 보내기)을 만들면 10글자 작업 코드가 생깁니다 → 로그인해 둔 발주오라 관리자 창에서 책갈피
// "두고푸드 동기화"(apps/client/public/baljuora-sync.js)를 누르면 그 창이 /api/baljuora/runner/:code 로 작업을 받아
// 발주오라 화면과 같은 방식으로 실행하고 결과를 돌려줍니다. 서버는 결과로 상품 연결(external_product_links)과
// "마지막으로 맞춘 값"(기준)을 저장하고, DB센터 상품과 비교해 보낼 변경 목록을 만듭니다.
// - 작업 코드는 SHA-256만 저장, 30분 뒤 만료. 발주오라 로그인 토큰은 서버로 오지 않습니다.
// - 설정·마지막 비교 결과(매입원가 포함)는 공개 단가표가 내보내는 content_settings가 아니라 baljuora_sync_store에 둡니다.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import {
  BALJUORA_CODE_ALPHABET,
  BALJUORA_CODE_LENGTH,
  BALJUORA_CONSOLE_ORIGIN,
  BALJUORA_DEFAULT_GROUP_KEYWORD,
  BALJUORA_DEFAULT_MERCHANT_SLUG,
  BALJUORA_JOB_TTL_MINUTES,
  BALJUORA_SYNC_FIELDS,
  baljuoraComparable,
  collapseName,
  diffBaljuoraProduct,
  doogoComparable,
  doogoCategoryForBaljuora,
  doogoSyncValues,
  flattenBaljuoraCategories,
  normalizeBaljuoraCode,
  plainCategoryName,
  suggestCategoryMapping,
  suggestShippingPolicyMapping,
  baljuoraPolicyRate,
  toPrice,
  type BaljuoraBaseline,
  type BaljuoraCategory,
  type BaljuoraFieldDiff,
  type BaljuoraLinkState,
  type BaljuoraProductSnapshot,
  type BaljuoraShippingPolicy,
  type BaljuoraSyncField,
  type DoogoSyncValues
} from "@repo/shared/baljuora-sync";
import { DatabaseError, getDb } from "../_core/db";
import { baljuoraSyncJobs, baljuoraSyncStore, categories, externalProductLinks, products, shippingPolicies, type BaljuoraSyncJob } from "../db/schema";
import { asProductInput } from "./catalog-excel";
import { createCategory, createProduct, createShippingPolicy, getAdminCatalog, updateProduct } from "./catalog";

const PROVIDER = "baljuora";
const STORE_SETTINGS = "settings";
const STORE_CATEGORIES = "categories";
const STORE_GROUP = "group";
const STORE_ONLY = "baljuora_only";
// 마지막 비교 때 읽은 발주오라 배송비 정책(매출배송정책) 목록
const STORE_POLICIES = "shipping_policies";
const MAX_SNAPSHOTS_PER_POST = 1000;
const MAX_ITEMS_PER_POST = 1000;
const UNCATEGORIZED_NAMES = new Set(["📦 기타", "미분류"]);

export type BaljuoraSettings = {
  merchantSlug: string;
  groupKeyword: string;
  // DB센터 카테고리 id → 발주오라 카테고리 id
  categoryMap: Record<string, string>;
  // 발주오라 카테고리 id → DB센터 카테고리 id(여러 개 → 하나). DB센터는 대표 카테고리 7개, 발주오라는 세부 카테고리가 많아
  // 발주오라에서 가져오거나 비교할 때 세부 카테고리를 어느 DB센터 카테고리로 볼지 정합니다(카테고리 맞추기).
  baljuoraCategoryMap: Record<string, string>;
  // DB센터 배송 정책 id → 발주오라 배송비 정책 id(배송비 코드·이름이 같으면 비교 때 자동 연결)
  shippingPolicyMap: Record<string, string>;
  // 신규 상품 등록 때 매입처·배송정책 등 설정을 복사할 발주오라 상품코드(같은 매입처의 연결 상품이 없을 때)
  templateCode: string | null;
};

const DEFAULT_SETTINGS: BaljuoraSettings = {
  merchantSlug: BALJUORA_DEFAULT_MERCHANT_SLUG,
  groupKeyword: BALJUORA_DEFAULT_GROUP_KEYWORD,
  categoryMap: {},
  baljuoraCategoryMap: {},
  shippingPolicyMap: {},
  templateCode: null
};

export type BaljuoraJobType = "compare" | "push";

export type PushPlanItem = {
  productId: string;
  action: "create" | "update";
  baljuoraId: string | null;
  templateId: string | null;
  code: string | null;
  name: string;
  supplierName: string | null;
  fields: BaljuoraSyncField[];
  values: {
    name: string;
    supplyPrice: number;
    groupPrice: number;
    consumerPrice: number | null;
    purchaseCost: number | null;
    categoryId: string | null;
    imageUrl: string | null;
    isTaxable: boolean;
    // 연결한 발주오라 매출배송정책 id(DB센터 상품의 배송 정책과 같은 정책, 없으면 null)
    baljuoraShippingPolicyId: string | null;
  };
};

export type ComparePlan = { type: "compare"; groupKeyword: string; detailIds: string[] };
export type PushPlan = { type: "push"; groupKeyword: string; groupId: string | null; items: PushPlanItem[] };
export type BaljuoraPlan = ComparePlan | PushPlan;

export type RunnerItemResult = {
  productId: string;
  ok: boolean;
  action: "create" | "update";
  baljuoraId?: string | null;
  code?: string | null;
  applied?: BaljuoraSyncField[];
  skipped?: Array<{ field: BaljuoraSyncField; reason: string }>;
  snapshot?: BaljuoraProductSnapshot | null;
  error?: string | null;
};

export type RunnerResultInput = {
  final: boolean;
  error?: string | null;
  diagnostics?: Record<string, unknown> | null;
  categories?: unknown;
  shippingPolicies?: unknown;
  group?: { id: string; name: string } | null;
  snapshots?: BaljuoraProductSnapshot[];
  items?: RunnerItemResult[];
};

type JobResults = {
  items: Array<RunnerItemResult & { name?: string }>;
  linked: number;
  unmatched: BaljuoraProductSnapshot[];
  received: number;
  bundles?: number;
};

function nowIso() {
  return new Date().toISOString();
}

function isMissingTable(error: unknown) {
  return error instanceof Error && /no such table/i.test(error.message) && /baljuora_sync/i.test(error.message);
}

async function guard<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isMissingTable(error)) {
      throw new DatabaseError("DATABASE_QUERY_FAILED", "DB 업데이트(034 발주오라 동기화 표)가 아직 적용되지 않았습니다. 배포 후 다시 시도해 주세요.", 503);
    }
    throw error;
  }
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function readStore<T>(key: string, fallback: T): Promise<T> {
  const rows = await getDb().select().from(baljuoraSyncStore).where(eq(baljuoraSyncStore.key, key)).limit(1);
  return parseJson(rows[0]?.value, fallback);
}

async function writeStore(key: string, value: unknown) {
  const text = JSON.stringify(value);
  const updatedAt = nowIso();
  await getDb().insert(baljuoraSyncStore).values({ key, value: text, updatedAt })
    .onConflictDoUpdate({ target: baljuoraSyncStore.key, set: { value: text, updatedAt } });
}

function cleanSettings(input: Partial<BaljuoraSettings>, base: BaljuoraSettings): BaljuoraSettings {
  const slug = typeof input.merchantSlug === "string" ? input.merchantSlug.trim().replace(/[^a-zA-Z0-9_-]/g, "") : base.merchantSlug;
  const keyword = typeof input.groupKeyword === "string" ? collapseName(input.groupKeyword) : base.groupKeyword;
  const categoryMap: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.categoryMap ?? base.categoryMap)) {
    if (typeof key === "string" && typeof value === "string" && key && value) categoryMap[key] = value;
  }
  const cleanMap = (value: Record<string, string> | undefined) => {
    const result: Record<string, string> = {};
    for (const [key, item] of Object.entries(value ?? {})) {
      if (typeof key === "string" && typeof item === "string" && key && item) result[key] = item;
    }
    return result;
  };
  const shippingPolicyMap = cleanMap(input.shippingPolicyMap ?? base.shippingPolicyMap);
  const baljuoraCategoryMap = cleanMap(input.baljuoraCategoryMap ?? base.baljuoraCategoryMap);
  const templateCode = input.templateCode === undefined ? base.templateCode : (typeof input.templateCode === "string" && input.templateCode.trim()) || null;
  return { merchantSlug: slug || DEFAULT_SETTINGS.merchantSlug, groupKeyword: keyword || DEFAULT_SETTINGS.groupKeyword, categoryMap, baljuoraCategoryMap, shippingPolicyMap, templateCode };
}

export async function getBaljuoraSettings(): Promise<BaljuoraSettings> {
  return guard(async () => cleanSettings(await readStore<Partial<BaljuoraSettings>>(STORE_SETTINGS, {}), DEFAULT_SETTINGS));
}

export async function saveBaljuoraSettings(input: Partial<BaljuoraSettings>) {
  return guard(async () => {
    const next = cleanSettings(input, await getBaljuoraSettings());
    await writeStore(STORE_SETTINGS, next);
    return next;
  });
}

// DB센터 상품 → 비교용 값(카테고리 연결 두 방향·배송비 정책 연결을 설정에서 씀)
function syncValues(product: Parameters<typeof doogoSyncValues>[0], settings: BaljuoraSettings) {
  return doogoSyncValues(product, settings.categoryMap, settings.shippingPolicyMap, settings.baljuoraCategoryMap);
}

function generateCode() {
  return Array.from(randomBytes(BALJUORA_CODE_LENGTH), (byte) => BALJUORA_CODE_ALPHABET[byte % BALJUORA_CODE_ALPHABET.length]).join("");
}

export function hashJobCode(code: string) {
  return createHash("sha256").update(normalizeBaljuoraCode(code)).digest("hex");
}

export function consoleUrlFor(merchantSlug: string, code: string) {
  return `${BALJUORA_CONSOLE_ORIGIN}/${encodeURIComponent(merchantSlug)}/dashboard#doogo-sync=${code}`;
}

export function jobView(row: BaljuoraSyncJob, withDetails = false) {
  const plan = parseJson<BaljuoraPlan | null>(row.plan, null);
  const results = parseJson<JobResults | null>(row.results, null);
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    expiresAt: row.expiresAt,
    total: plan?.type === "push" ? plan.items.length : null,
    progress: parseJson<{ done: number; total: number; message: string } | null>(row.progress, null),
    summary: parseJson<Record<string, unknown> | null>(row.summary, null),
    items: withDetails ? (results?.items ?? []) : undefined,
    diagnostics: withDetails ? parseJson<Record<string, unknown> | null>(row.diagnostics, null) : undefined
  };
}

async function expireStaleJobs() {
  await getDb().update(baljuoraSyncJobs)
    .set({ status: "expired", finishedAt: nowIso() })
    .where(and(inArray(baljuoraSyncJobs.status, ["waiting", "running"]), lt(baljuoraSyncJobs.expiresAt, nowIso())));
}

type ProductRow = {
  id: string;
  productCode: string | null;
  name: string;
  generalPrice: number;
  aPrice: number;
  salePrice: number | null;
  salePriceMode: "autonomous" | "fixed";
  costPrice: number;
  categoryId: string;
  imageUrl: string | null;
  supplierName: string | null;
  isVisible: boolean;
  isSoldOut: boolean;
  shippingType: "domestic" | "overseas";
  shippingPolicyId: string | null;
};

async function loadProductRows(ids?: string[]): Promise<ProductRow[]> {
  const db = getDb();
  const columns = {
    id: products.id,
    productCode: products.productCode,
    name: products.name,
    generalPrice: products.generalPrice,
    aPrice: products.aPrice,
    salePrice: products.salePrice,
    salePriceMode: products.salePriceMode,
    costPrice: products.costPrice,
    categoryId: products.categoryId,
    imageUrl: products.imageUrl,
    supplierName: products.supplierName,
    isVisible: products.isVisible,
    isSoldOut: products.isSoldOut,
    shippingType: products.shippingType,
    shippingPolicyId: products.shippingPolicyId
  };
  if (ids && ids.length === 0) return [];
  const where = ids ? and(sql`${products.deletedAt} IS NULL`, inArray(products.id, ids)) : sql`${products.deletedAt} IS NULL`;
  return db.select(columns).from(products).where(where);
}

type LinkRow = typeof externalProductLinks.$inferSelect;

async function loadLinks(productIds?: string[]): Promise<LinkRow[]> {
  const db = getDb();
  if (productIds && productIds.length === 0) return [];
  const where = productIds ? and(eq(externalProductLinks.provider, PROVIDER), inArray(externalProductLinks.productId, productIds)) : eq(externalProductLinks.provider, PROVIDER);
  return db.select().from(externalProductLinks).where(where);
}

export function linkState(link: Pick<LinkRow, "rawSnapshot">): BaljuoraLinkState | null {
  const parsed = parseJson<Partial<BaljuoraLinkState> | null>(link.rawSnapshot, null);
  if (!parsed?.snapshot || typeof parsed.snapshot.id !== "string") return null;
  const snapshot = { ...parsed.snapshot, imageUrls: Array.isArray(parsed.snapshot.imageUrls) ? parsed.snapshot.imageUrls : [] };
  return { snapshot, baseline: parsed.baseline ?? null, ignored: parsed.ignored && typeof parsed.ignored === "object" ? parsed.ignored : undefined };
}

function stateJson(state: BaljuoraLinkState) {
  return JSON.stringify(state.ignored && Object.keys(state.ignored).length > 0 ? state : { snapshot: state.snapshot, baseline: state.baseline });
}

// 이 동기화가 만든 연결만 셉니다(예전 "발주오라 연동 준비" 기능이 남긴 연결은 형식이 달라 비교 전까지는 확인 대기).
const freshLinkCount = sql<number>`coalesce(sum(case when ${externalProductLinks.rawSnapshot} like '%"baseline"%' then 1 else 0 end), 0)`;

function isHealthCategoryName(name: string | undefined) {
  return Boolean(name && plainCategoryName(name).includes("건강식품"));
}

async function loadCategoryContext() {
  const [doogoCategories, cached] = await Promise.all([
    getDb().select({ id: categories.id, name: categories.name, shippingType: categories.shippingType, isActive: categories.isActive }).from(categories),
    readStore<BaljuoraCategory[]>(STORE_CATEGORIES, [])
  ]);
  return { doogoCategories, baljuoraCategories: Array.isArray(cached) ? cached : [] };
}

// ─── 작업 만들기 ────────────────────────────────────────────────────────────────

export type CreateJobInput =
  | { type: "compare" }
  | { type: "push"; productIds: string[]; fieldsByProduct?: Record<string, BaljuoraSyncField[]> };

async function buildComparePlan(settings: BaljuoraSettings): Promise<ComparePlan> {
  const [links, productRows] = await Promise.all([loadLinks(), getDb().select({ id: products.id }).from(products).where(sql`${products.deletedAt} IS NULL`)]);
  const ids = new Set(links.map((link) => link.externalProductId));
  // 예전에 발주오라 엑셀로 가져온 상품은 DB센터 id가 "baljuora-<발주오라 상품 id>"입니다.
  for (const row of productRows) if (row.id.startsWith("baljuora-")) ids.add(row.id.slice("baljuora-".length));
  return { type: "compare", groupKeyword: settings.groupKeyword, detailIds: [...ids].slice(0, 6000) };
}

function pickTemplateId(product: ProductRow, productRows: ProductRow[], linkByProduct: Map<string, LinkRow>, settings: BaljuoraSettings, linkByCode: Map<string, LinkRow>) {
  const supplier = product.supplierName?.trim();
  if (supplier) {
    const sameSupplier = productRows.find((row) => row.id !== product.id && row.supplierName?.trim() === supplier && linkByProduct.has(row.id));
    if (sameSupplier) return linkByProduct.get(sameSupplier.id)?.externalProductId ?? null;
  }
  if (settings.templateCode) return linkByCode.get(settings.templateCode.trim())?.externalProductId ?? null;
  return null;
}

export async function buildPushPlan(input: { productIds: string[]; fieldsByProduct?: Record<string, BaljuoraSyncField[]> }, settings: BaljuoraSettings): Promise<PushPlan> {
  const wanted = [...new Set(input.productIds)].slice(0, 2000);
  const [productRows, links, { doogoCategories, baljuoraCategories }, group] = await Promise.all([
    loadProductRows(),
    loadLinks(),
    loadCategoryContext(),
    readStore<{ id: string; name: string } | null>(STORE_GROUP, null)
  ]);
  const productById = new Map(productRows.map((row) => [row.id, row]));
  const linkByProduct = new Map(links.map((link) => [link.productId, link]));
  const freshLinks = links.filter((link) => linkState(link) !== null);
  const freshByProduct = new Map(freshLinks.map((link) => [link.productId, link]));
  const linkByCode = new Map(freshLinks.map((link) => [link.externalProductCode, link]));
  const categoryName = new Map(doogoCategories.map((category) => [category.id, category.name]));
  const items: PushPlanItem[] = [];
  let unmappedShippingOnly = 0;
  for (const productId of wanted) {
    const product = productById.get(productId);
    if (!product) continue;
    const values = syncValues(product, settings);
    const anyLink = linkByProduct.get(productId);
    // 예전 형식 연결(비교 때 발주오라에서 찾지 못한 상품)은 새로 등록합니다.
    const link = anyLink && linkState(anyLink) ? anyLink : undefined;
    const requested = input.fieldsByProduct?.[productId]?.filter((field) => BALJUORA_SYNC_FIELDS.includes(field));
    let fields: BaljuoraSyncField[];
    if (!link) {
      // 배송비 정책은 DB센터 정책과 연결한 발주오라 정책이 있을 때만 넣습니다(없으면 설정 복사용 상품의 정책을 따름).
      fields = BALJUORA_SYNC_FIELDS.filter((field) => (field !== "groupPrice" || values.groupPrice !== values.supplyPrice) && (field !== "shippingPolicy" || Boolean(values.baljuoraShippingPolicyId)));
    } else {
      const state = linkState(link);
      const diffs = state ? diffBaljuoraProduct(values, state, baljuoraCategories) : [];
      const diffFields = diffs.map((diff) => diff.field);
      fields = requested?.length
        ? requested.filter((field) => diffFields.includes(field) || field === "image")
        : diffs.filter((diff) => diff.direction !== "pull").map((diff) => diff.field);
      // 배송비 정책은 DB센터 정책과 연결한 발주오라 매출배송정책이 있을 때만 보냅니다. 연결이 없으면 빼서(화면에 '연결 필요' 표시)
      // 같은 상품의 다른 칸(썸네일·가격)까지 실패로 보이지 않게 합니다(2026-11-23 운영: 완숙토마토 '국내 무료배송').
      if (!values.baljuoraShippingPolicyId && fields.includes("shippingPolicy")) {
        fields = fields.filter((field) => field !== "shippingPolicy");
        if (fields.length === 0) unmappedShippingOnly += 1;
      }
      // 1.2.0 이전 비교 기록(황금농부 공급가·매입원가를 못 읽은 기록, 2026-11-23 약과 사례)은 저장된 발주오라 값을 믿을 수 없어,
      // 보낼 때 가격 3종(일반공급가 → 공급가 · 수강생 단가 → 황금농부 개별공급가 · 원가 → 매입원가)을 모두 넣습니다.
      // 책갈피가 보내기 직전에 발주오라 실제 값을 읽어 같은 칸은 건드리지 않고 다른 칸만 맞춥니다.
      if (state && state.snapshot.groupPrice === undefined && fields.length > 0) {
        const trio: BaljuoraSyncField[] = [];
        if (values.supplyPrice > 0) trio.push("supplyPrice");
        if (values.groupPrice > 0) trio.push("groupPrice");
        if (values.purchaseCost !== null) trio.push("purchaseCost");
        fields = [...fields, ...trio.filter((field) => !fields.includes(field))];
      }
    }
    if (fields.length === 0) continue;
    items.push({
      productId,
      action: link ? "update" : "create",
      baljuoraId: link?.externalProductId ?? null,
      templateId: link ? null : pickTemplateId(product, productRows, freshByProduct, settings, linkByCode),
      code: values.code,
      name: values.name,
      supplierName: product.supplierName,
      fields,
      values: {
        name: values.name,
        supplyPrice: values.supplyPrice,
        groupPrice: values.groupPrice,
        consumerPrice: values.consumerPrice,
        purchaseCost: values.purchaseCost,
        categoryId: values.baljuoraCategoryId,
        imageUrl: values.imageUrl,
        isTaxable: isHealthCategoryName(categoryName.get(product.categoryId)),
        baljuoraShippingPolicyId: values.baljuoraShippingPolicyId
      }
    });
  }
  if (items.length === 0 && unmappedShippingOnly > 0) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "고른 상품은 배송비 정책만 다른데, 그 DB센터 배송 정책과 연결한 발주오라 매출배송정책이 없어 보낼 수 없습니다. 동기화 설정 > 배송비 정책 맞추기에서 연결한 뒤 다시 보내 주세요.", 400);
  }
  return { type: "push", groupKeyword: settings.groupKeyword, groupId: group?.id ?? null, items };
}

export async function createBaljuoraJob(input: CreateJobInput, createdBy: string | null) {
  return guard(async () => {
    const db = getDb();
    const settings = await getBaljuoraSettings();
    await expireStaleJobs();
    const plan: BaljuoraPlan = input.type === "compare" ? await buildComparePlan(settings) : await buildPushPlan(input, settings);
    if (plan.type === "push" && plan.items.length === 0) {
      throw new DatabaseError("DATABASE_QUERY_FAILED", "보낼 변경이 없습니다. 이미 발주오라와 같거나, 고른 상품에 바뀐 칸이 없습니다.", 400);
    }
    // 기다리는 작업은 하나만 둡니다(새 작업을 만들면 이전 대기 작업은 취소).
    await db.update(baljuoraSyncJobs).set({ status: "cancelled", finishedAt: nowIso() }).where(eq(baljuoraSyncJobs.status, "waiting"));
    const code = generateCode();
    const id = randomUUID();
    const total = plan.type === "push" ? plan.items.length : 0;
    const rows = await db.insert(baljuoraSyncJobs).values({
      id,
      codeHash: hashJobCode(code),
      type: plan.type,
      status: "waiting",
      plan: JSON.stringify(plan),
      progress: JSON.stringify({ done: 0, total, message: "발주오라 관리자 창에서 책갈피 '두고푸드 동기화'를 누르면 시작합니다." }),
      createdBy,
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + BALJUORA_JOB_TTL_MINUTES * 60_000).toISOString()
    }).returning();
    return { job: jobView(rows[0]), code, consoleUrl: consoleUrlFor(settings.merchantSlug, code) };
  });
}

export async function cancelBaljuoraJob(id: string) {
  return guard(async () => {
    const rows = await getDb().update(baljuoraSyncJobs)
      .set({ status: "cancelled", finishedAt: nowIso() })
      .where(and(eq(baljuoraSyncJobs.id, id), inArray(baljuoraSyncJobs.status, ["waiting", "running"])))
      .returning();
    if (!rows[0]) throw new DatabaseError("DATABASE_QUERY_FAILED", "취소할 수 있는 작업이 아닙니다.", 409);
    return jobView(rows[0]);
  });
}

export async function getBaljuoraJob(id: string) {
  return guard(async () => {
    await expireStaleJobs();
    const rows = await getDb().select().from(baljuoraSyncJobs).where(eq(baljuoraSyncJobs.id, id)).limit(1);
    if (!rows[0]) throw new DatabaseError("DATABASE_QUERY_FAILED", "작업을 찾을 수 없습니다.", 404);
    return jobView(rows[0], true);
  });
}

export async function listBaljuoraJobs(limit = 15) {
  return guard(async () => {
    await expireStaleJobs();
    const rows = await getDb().select().from(baljuoraSyncJobs).orderBy(desc(baljuoraSyncJobs.createdAt)).limit(Math.min(Math.max(limit, 1), 50));
    return rows.map((row) => jobView(row));
  });
}

// ─── 책갈피 스크립트(발주오라 창)용 ──────────────────────────────────────────────

async function findJobByCode(code: string) {
  const normalized = normalizeBaljuoraCode(code);
  if (normalized.length !== BALJUORA_CODE_LENGTH) throw new DatabaseError("DATABASE_QUERY_FAILED", "작업 코드는 10글자입니다. DB센터 화면에 보이는 코드를 확인해 주세요.", 400);
  const rows = await getDb().select().from(baljuoraSyncJobs).where(eq(baljuoraSyncJobs.codeHash, hashJobCode(normalized))).limit(1);
  const row = rows[0];
  if (!row) throw new DatabaseError("DATABASE_QUERY_FAILED", "작업 코드를 찾을 수 없습니다. DB센터에서 동기화를 다시 시작해 주세요.", 404);
  if (["waiting", "running"].includes(row.status) && row.expiresAt < nowIso()) {
    await getDb().update(baljuoraSyncJobs).set({ status: "expired", finishedAt: nowIso() }).where(eq(baljuoraSyncJobs.id, row.id));
    throw new DatabaseError("DATABASE_QUERY_FAILED", `작업 코드가 만료되었습니다(${BALJUORA_JOB_TTL_MINUTES}분). DB센터에서 다시 시작해 주세요.`, 409);
  }
  return row;
}

function assertRunnable(row: BaljuoraSyncJob) {
  if (row.status === "expired") throw new DatabaseError("DATABASE_QUERY_FAILED", "작업 코드가 만료되었습니다. DB센터에서 다시 시작해 주세요.", 409);
  if (row.status === "cancelled") throw new DatabaseError("DATABASE_QUERY_FAILED", "DB센터에서 취소한 작업입니다.", 409);
  if (row.status === "done" || row.status === "failed") throw new DatabaseError("DATABASE_QUERY_FAILED", "이미 끝난 작업입니다. DB센터에서 결과를 확인해 주세요.", 409);
}

export async function startRunnerJob(code: string) {
  return guard(async () => {
    const row = await findJobByCode(code);
    assertRunnable(row);
    const plan = parseJson<BaljuoraPlan | null>(row.plan, null);
    if (!plan) throw new DatabaseError("DATABASE_QUERY_FAILED", "작업 내용을 읽지 못했습니다.", 500);
    if (row.status === "waiting") {
      await getDb().update(baljuoraSyncJobs)
        .set({ status: "running", startedAt: nowIso(), progress: JSON.stringify({ done: 0, total: plan.type === "push" ? plan.items.length : 0, message: "발주오라 창에서 시작했습니다." }) })
        .where(eq(baljuoraSyncJobs.id, row.id));
    }
    return { jobId: row.id, type: row.type, expiresAt: row.expiresAt, plan };
  });
}

export async function recordRunnerProgress(code: string, progress: { done: number; total: number; message: string }) {
  return guard(async () => {
    const row = await findJobByCode(code);
    assertRunnable(row);
    const value = {
      done: Math.max(0, Math.floor(progress.done)),
      total: Math.max(0, Math.floor(progress.total)),
      message: collapseName(progress.message).slice(0, 300)
    };
    await getDb().update(baljuoraSyncJobs).set({ progress: JSON.stringify(value), status: "running", startedAt: row.startedAt ?? nowIso() }).where(eq(baljuoraSyncJobs.id, row.id));
    return { ok: true };
  });
}

function sanitizeSnapshot(input: unknown): BaljuoraProductSnapshot | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id.trim()) return null;
  const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length < 600).slice(0, 20) : [];
  const bool = (value: unknown) => typeof value === "boolean" ? value : null;
  const snapshot: BaljuoraProductSnapshot = {
    id: record.id.trim().slice(0, 80),
    kind: record.kind === "bundle" ? "bundle" : "product",
    code: typeof record.code === "string" && record.code.trim() ? record.code.trim().slice(0, 80) : null,
    name: collapseName(typeof record.name === "string" ? record.name : "").slice(0, 300),
    supplyPrice: toPrice(record.supplyPrice),
    consumerPrice: toPrice(record.consumerPrice),
    purchaseCost: toPrice(record.purchaseCost),
    imageUrls: strings(record.imageUrls),
    isVisible: bool(record.isVisible),
    isSoldOut: bool(record.isSoldOut),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt.slice(0, 40) : null
  };
  if ("groupPrice" in record && record.groupPrice !== undefined) snapshot.groupPrice = toPrice(record.groupPrice);
  if (Array.isArray(record.categoryIds)) snapshot.categoryIds = strings(record.categoryIds);
  if ("shippingPolicyId" in record && record.shippingPolicyId !== undefined) {
    snapshot.shippingPolicyId = typeof record.shippingPolicyId === "string" && record.shippingPolicyId.trim() ? record.shippingPolicyId.trim().slice(0, 80) : null;
  }
  return snapshot;
}

// 발주오라 배송비 정책 목록(책갈피가 읽어 보냄)을 정리합니다. 값은 정책 이름·코드·배송비 구간뿐입니다.
function sanitizeShippingPolicies(input: unknown): BaljuoraShippingPolicy[] {
  if (!Array.isArray(input)) return [];
  const result: BaljuoraShippingPolicy[] = [];
  for (const item of input.slice(0, 300)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || !record.id.trim()) continue;
    const rules = Array.isArray(record.rules) ? record.rules.slice(0, 50).filter((rule): rule is Record<string, unknown> => Boolean(rule) && typeof rule === "object").map((rule) => ({
      startRange: toPrice(rule.startRange),
      endRange: toPrice(rule.endRange),
      fee: toPrice(rule.fee) ?? 0,
      unitType: typeof rule.unitType === "string" ? rule.unitType.slice(0, 20) : null
    })) : [];
    result.push({
      id: record.id.trim().slice(0, 80),
      code: typeof record.code === "string" && record.code.trim() ? record.code.trim().slice(0, 40) : null,
      name: collapseName(typeof record.name === "string" ? record.name : "").slice(0, 100),
      type: typeof record.type === "string" ? record.type.slice(0, 30) : null,
      fixedFee: toPrice(record.fixedFee),
      isConditionRepeat: record.isConditionRepeat === true,
      isSameOrderFree: record.isSameOrderFree === true,
      isJejuAndRemoteAdditionalFee: record.isJejuAndRemoteAdditionalFee === true,
      jejuAdditionalFee: toPrice(record.jejuAdditionalFee) ?? 0,
      remoteAdditionalFee: toPrice(record.remoteAdditionalFee) ?? 0,
      rules
    });
  }
  return result;
}

async function loadDoogoShippingPolicies() {
  return getDb().select({ id: shippingPolicies.id, name: shippingPolicies.name, policyCode: shippingPolicies.policyCode, shippingType: shippingPolicies.shippingType, isActive: shippingPolicies.isActive }).from(shippingPolicies);
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function upsertLinks(rows: Array<typeof externalProductLinks.$inferInsert>) {
  const db = getDb();
  for (const part of chunk(rows, 150)) {
    if (part.length === 0) continue;
    await db.insert(externalProductLinks).values(part).onConflictDoUpdate({
      target: [externalProductLinks.provider, externalProductLinks.externalProductId],
      set: {
        externalProductCode: sql`excluded.externalProductCode`,
        productId: sql`excluded.productId`,
        externalUpdatedAt: sql`excluded.externalUpdatedAt`,
        lastPulledAt: sql`excluded.lastPulledAt`,
        lastPushedAt: sql`coalesce(excluded.lastPushedAt, ${externalProductLinks.lastPushedAt})`,
        syncStatus: sql`excluded.syncStatus`,
        rawSnapshot: sql`excluded.rawSnapshot`,
        updatedAt: sql`excluded.updatedAt`
      }
    });
  }
}

// 연결이 바뀐 상품(다른 발주오라 상품과 연결돼 있던 DB센터 상품, 같은 코드를 쓰던 예전 연결)을 지웁니다.
async function removeConflictingLinks(rows: Array<{ externalProductId: string; externalProductCode: string; productId: string }>) {
  if (rows.length === 0) return;
  const db = getDb();
  const byProduct = new Map(rows.map((row) => [row.productId, row.externalProductId]));
  const byCode = new Map(rows.map((row) => [row.externalProductCode, row.externalProductId]));
  const existing: LinkRow[] = [];
  for (const part of chunk([...byProduct.keys()], 300)) existing.push(...await db.select().from(externalProductLinks).where(and(eq(externalProductLinks.provider, PROVIDER), inArray(externalProductLinks.productId, part))));
  for (const part of chunk([...byCode.keys()], 300)) existing.push(...await db.select().from(externalProductLinks).where(and(eq(externalProductLinks.provider, PROVIDER), inArray(externalProductLinks.externalProductCode, part))));
  const stale = [...new Set(existing.filter((link) => {
    const wantedForProduct = byProduct.get(link.productId);
    if (wantedForProduct && wantedForProduct !== link.externalProductId) return true;
    const wantedForCode = byCode.get(link.externalProductCode);
    return Boolean(wantedForCode && wantedForCode !== link.externalProductId);
  }).map((link) => link.id))];
  for (const part of chunk(stale, 300)) await db.delete(externalProductLinks).where(inArray(externalProductLinks.id, part));
}

async function ingestCompareBatch(row: BaljuoraSyncJob, snapshots: BaljuoraProductSnapshot[], results: JobResults) {
  const [productRows, links, settings] = await Promise.all([loadProductRows(), loadLinks(), getBaljuoraSettings()]);
  const byCode = new Map<string, ProductRow>();
  for (const product of productRows) {
    const code = product.productCode?.trim();
    if (code) byCode.set(code.toUpperCase(), product);
  }
  const byId = new Map(productRows.map((product) => [product.id, product]));
  const linkByExternal = new Map(links.map((link) => [link.externalProductId, link]));
  const usedProducts = new Set<string>();
  const usedCodes = new Set<string>();
  const now = nowIso();
  const upserts: Array<typeof externalProductLinks.$inferInsert> = [];
  for (const snapshot of snapshots) {
    results.received += 1;
    if (snapshot.kind === "bundle") {
      results.bundles = (results.bundles ?? 0) + 1;
      continue;
    }
    const product = (snapshot.code ? byCode.get(snapshot.code.toUpperCase()) : undefined) ?? byId.get(`baljuora-${snapshot.id}`);
    if (!product || usedProducts.has(product.id)) {
      results.unmatched.push(snapshot);
      continue;
    }
    const externalCode = snapshot.code || `id:${snapshot.id}`;
    if (usedCodes.has(externalCode)) {
      results.unmatched.push(snapshot);
      continue;
    }
    usedProducts.add(product.id);
    usedCodes.add(externalCode);
    const previous = linkByExternal.get(snapshot.id);
    const previousState = previous && previous.productId === product.id ? linkState(previous) : null;
    const values = syncValues(product, settings);
    // 처음 연결하는 상품은 지금 값을 기준으로 삼습니다(이미지는 발주오라에 이미지가 있으면 같다고 봄).
    const baseline: BaljuoraBaseline = previousState?.baseline ?? {
      doogo: doogoComparable(values),
      baljuora: baljuoraComparable(snapshot),
      pushedImageUrl: snapshot.imageUrls.length > 0 ? values.imageUrl : null,
      at: now
    };
    upserts.push({
      provider: PROVIDER,
      externalProductId: snapshot.id,
      externalProductCode: externalCode,
      productId: product.id,
      externalUpdatedAt: snapshot.updatedAt,
      lastPulledAt: now,
      lastPushedAt: null,
      syncStatus: "imported",
      rawSnapshot: stateJson({ snapshot, baseline, ignored: previousState?.ignored }),
      createdAt: now,
      updatedAt: now
    });
  }
  await removeConflictingLinks(upserts.map((link) => ({ externalProductId: link.externalProductId, externalProductCode: link.externalProductCode, productId: link.productId })));
  await upsertLinks(upserts);
  results.linked += upserts.length;
  void row;
}

async function ingestPushItems(plan: PushPlan, items: RunnerItemResult[], results: JobResults) {
  const db = getDb();
  const planById = new Map(plan.items.map((item) => [item.productId, item]));
  const productIds = items.map((item) => item.productId).filter((id) => planById.has(id));
  const [productRows, links, settings] = await Promise.all([loadProductRows(productIds), loadLinks(productIds), getBaljuoraSettings()]);
  const productById = new Map(productRows.map((product) => [product.id, product]));
  const linkByProduct = new Map(links.map((link) => [link.productId, link]));
  const now = nowIso();
  const upserts: Array<typeof externalProductLinks.$inferInsert> = [];
  for (const item of items) {
    const planned = planById.get(item.productId);
    if (!planned) continue;
    const product = productById.get(item.productId);
    const record = {
      productId: item.productId,
      ok: Boolean(item.ok),
      action: planned.action,
      baljuoraId: typeof item.baljuoraId === "string" ? item.baljuoraId.slice(0, 80) : planned.baljuoraId,
      code: typeof item.code === "string" ? item.code.slice(0, 80) : planned.code,
      applied: Array.isArray(item.applied) ? item.applied.filter((field) => BALJUORA_SYNC_FIELDS.includes(field)) : [],
      skipped: Array.isArray(item.skipped) ? item.skipped.filter((entry) => entry && BALJUORA_SYNC_FIELDS.includes(entry.field)).map((entry) => ({ field: entry.field, reason: collapseName(String(entry.reason)).slice(0, 300) })).slice(0, 10) : [],
      error: item.error ? collapseName(String(item.error)).slice(0, 600) : null,
      name: planned.name
    };
    results.items = results.items.filter((existing) => existing.productId !== record.productId);
    results.items.push(record);
    const link = linkByProduct.get(item.productId);
    if (!record.ok || !record.baljuoraId || !product) {
      if (link) await db.update(externalProductLinks).set({ syncStatus: "failed", updatedAt: now }).where(eq(externalProductLinks.id, link.id));
      continue;
    }
    const snapshot = sanitizeSnapshot(item.snapshot) ?? (link ? linkState(link)?.snapshot : null) ?? null;
    const values = syncValues(product, settings);
    const previous = link ? linkState(link) : null;
    const after: BaljuoraProductSnapshot = snapshot ?? {
      id: record.baljuoraId,
      kind: "product",
      code: record.code,
      name: values.name,
      supplyPrice: values.supplyPrice,
      consumerPrice: values.consumerPrice,
      purchaseCost: values.purchaseCost,
      imageUrls: [],
      isVisible: null,
      isSoldOut: null,
      updatedAt: now
    };
    const imagePushed = record.applied.includes("image");
    const baseline: BaljuoraBaseline = {
      doogo: doogoComparable(values),
      baljuora: baljuoraComparable(after),
      pushedImageUrl: imagePushed ? values.imageUrl : previous?.baseline?.pushedImageUrl ?? (after.imageUrls.length > 0 ? values.imageUrl : null),
      at: now
    };
    const externalCode = after.code || record.code || `id:${record.baljuoraId}`;
    upserts.push({
      provider: PROVIDER,
      externalProductId: record.baljuoraId,
      externalProductCode: externalCode,
      productId: product.id,
      externalUpdatedAt: after.updatedAt,
      lastPulledAt: now,
      lastPushedAt: now,
      syncStatus: record.skipped.length > 0 ? "conflict" : "succeeded",
      rawSnapshot: stateJson({ snapshot: after, baseline, ignored: previous?.ignored }),
      createdAt: now,
      updatedAt: now
    });
    // 상품코드 없이 새로 등록한 상품은 발주오라가 만든 상품코드를 DB센터에도 적습니다.
    if (!product.productCode && after.code) {
      const duplicate = await db.select({ id: products.id }).from(products).where(eq(products.productCode, after.code)).limit(1);
      if (!duplicate[0]) await db.update(products).set({ productCode: after.code }).where(eq(products.id, product.id));
    }
  }
  await removeConflictingLinks(upserts.map((link) => ({ externalProductId: link.externalProductId, externalProductCode: link.externalProductCode, productId: link.productId })));
  await upsertLinks(upserts);
}

function logParts(label: string, text: string, limit: number) {
  const body = text.slice(0, limit);
  const parts = Math.max(1, Math.ceil(body.length / 3000));
  for (let part = 0; part < parts; part += 1) console.info(`[baljuora-sync] ${label} ${part + 1}/${parts} ${body.slice(part * 3000, (part + 1) * 3000)}`);
}

export async function ingestRunnerResults(code: string, input: RunnerResultInput) {
  return guard(async () => {
    const db = getDb();
    const row = await findJobByCode(code);
    assertRunnable(row);
    const plan = parseJson<BaljuoraPlan | null>(row.plan, null);
    if (!plan) throw new DatabaseError("DATABASE_QUERY_FAILED", "작업 내용을 읽지 못했습니다.", 500);
    const results = parseJson<JobResults>(row.results, { items: [], linked: 0, unmatched: [], received: 0 });
    const diagnostics = { ...parseJson<Record<string, unknown>>(row.diagnostics, {}), ...(input.diagnostics && typeof input.diagnostics === "object" ? input.diagnostics : {}) };

    if (plan.type === "compare") {
      const snapshots = (Array.isArray(input.snapshots) ? input.snapshots : []).slice(0, MAX_SNAPSHOTS_PER_POST).map(sanitizeSnapshot).filter((snapshot): snapshot is BaljuoraProductSnapshot => snapshot !== null);
      if (snapshots.length > 0) await ingestCompareBatch(row, snapshots, results);
      if (input.categories !== undefined) {
        const flat = Array.isArray(input.categories) && input.categories.every((item) => item && typeof item === "object" && "path" in (item as object))
          ? (input.categories as BaljuoraCategory[]).filter((item) => typeof item.id === "string" && typeof item.name === "string").slice(0, 2000)
          : flattenBaljuoraCategories(input.categories).slice(0, 2000);
        if (flat.length > 0) {
          await writeStore(STORE_CATEGORIES, flat);
          const settings = await getBaljuoraSettings();
          // 숨긴(합쳐진) DB센터 카테고리는 자동 연결하지 않고, 예전에 연결된 것도 뺍니다(공개 화면에 없는 카테고리).
          const doogoCategories = await db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.isActive, true));
          const activeIds = new Set(doogoCategories.map((category) => category.id));
          const activeMap = Object.fromEntries(Object.entries(settings.categoryMap).filter(([doogoId]) => activeIds.has(doogoId)));
          await writeStore(STORE_SETTINGS, { ...settings, categoryMap: suggestCategoryMapping(doogoCategories, flat, activeMap) });
        }
      }
      if (input.shippingPolicies !== undefined) {
        const policies = sanitizeShippingPolicies(input.shippingPolicies);
        // 목록을 읽지 못했으면(빈 목록) 예전 목록·연결을 그대로 둡니다.
        if (policies.length > 0) {
          await writeStore(STORE_POLICIES, policies);
          const settings = await getBaljuoraSettings();
          await writeStore(STORE_SETTINGS, { ...settings, shippingPolicyMap: suggestShippingPolicyMapping(await loadDoogoShippingPolicies(), policies, settings.shippingPolicyMap) });
        }
      }
      if (input.group !== undefined) await writeStore(STORE_GROUP, input.group && typeof input.group.id === "string" ? { id: input.group.id.slice(0, 80), name: collapseName(String(input.group.name)).slice(0, 120) } : null);
    } else {
      const items = (Array.isArray(input.items) ? input.items : []).slice(0, MAX_ITEMS_PER_POST).filter((item) => item && typeof item.productId === "string");
      if (items.length > 0) await ingestPushItems(plan, items, results);
    }

    const final = Boolean(input.final);
    const fatal = input.error ? collapseName(String(input.error)).slice(0, 600) : null;
    const update: Partial<typeof baljuoraSyncJobs.$inferInsert> = {
      results: JSON.stringify({ ...results, unmatched: plan.type === "compare" ? results.unmatched : [] }),
      diagnostics: JSON.stringify(diagnostics).slice(0, 150_000)
    };
    if (final) {
      update.finishedAt = nowIso();
      update.status = fatal && (plan.type === "compare" ? results.received === 0 : results.items.length === 0) ? "failed" : "done";
      if (plan.type === "compare") {
        await writeStore(STORE_ONLY, results.unmatched.filter((snapshot) => snapshot.kind !== "bundle").slice(0, 5000));
        update.summary = JSON.stringify({ received: results.received, linked: results.linked, baljuoraOnly: results.unmatched.filter((snapshot) => snapshot.kind !== "bundle").length, bundles: results.bundles ?? 0, error: fatal });
        update.progress = JSON.stringify({ done: results.received, total: results.received, message: fatal ? `중단: ${fatal}` : `발주오라 상품 ${results.received.toLocaleString("ko-KR")}개를 읽고 ${results.linked.toLocaleString("ko-KR")}개를 연결했습니다.` });
      } else {
        const succeeded = results.items.filter((item) => item.ok).length;
        const failed = results.items.filter((item) => !item.ok).length;
        update.summary = JSON.stringify({ total: plan.items.length, succeeded, failed, created: results.items.filter((item) => item.ok && item.action === "create").length, updated: results.items.filter((item) => item.ok && item.action === "update").length, error: fatal });
        update.progress = JSON.stringify({ done: results.items.length, total: plan.items.length, message: fatal ? `중단: ${fatal}` : `완료: 성공 ${succeeded}개 · 실패 ${failed}개` });
      }
      if (Object.keys(diagnostics).length > 0) {
        // 운영 확인용: 발주오라 응답 구조(칸 이름·형식)만 남깁니다. 값·토큰은 남기지 않습니다.
        // 상세에 개별공급가·매입처(include)가 붙으면서 구조가 길어져 여러 줄로 나눕니다(로그 한 줄 길이 제한).
        logParts(`${plan.type} diagnostics`, JSON.stringify({ version: diagnostics.version, structure: diagnostics.structure ?? {} }), 15_000);
        // 발주오라가 돌려준 오류 문구(예: "prices.0.property … should not exist")와 보낸 칸 이름만 남깁니다(값 없음).
        if (Array.isArray(diagnostics.errors) && diagnostics.errors.length > 0) logParts(`${plan.type} errors`, JSON.stringify(diagnostics.errors), 6000);
        // 매출처 그룹 공급가 저장 방식 찾기: 발주오라 화면의 공개 코드 일부(값·토큰 없음)를 여러 줄로 나눠 남깁니다.
        if (diagnostics.discovery && typeof diagnostics.discovery === "object") logParts("discovery", JSON.stringify(diagnostics.discovery), 60_000);
      }
    }
    await db.update(baljuoraSyncJobs).set(update).where(eq(baljuoraSyncJobs.id, row.id));
    return { ok: true, final, received: results.received, linked: results.linked, items: results.items.length };
  });
}

// 신규 등록·이미지 바꾸기: 발주오라 창이 DB센터 상품 이미지를 받아 발주오라에 올립니다(작업에 든 상품만).
export async function getRunnerImage(code: string, productId: string) {
  return guard(async () => {
    const row = await findJobByCode(code);
    assertRunnable(row);
    const plan = parseJson<BaljuoraPlan | null>(row.plan, null);
    const item = plan?.type === "push" ? plan.items.find((entry) => entry.productId === productId) : undefined;
    if (!item?.values.imageUrl) throw new DatabaseError("DATABASE_QUERY_FAILED", "이 작업에 든 상품 이미지가 아닙니다.", 404);
    const url = item.values.imageUrl;
    let host = "";
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("protocol");
      host = parsed.hostname.toLowerCase();
    } catch {
      throw new DatabaseError("DATABASE_QUERY_FAILED", "이미지 주소가 올바르지 않습니다.", 400);
    }
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$)|^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith(".internal") || host.endsWith(".local")) {
      throw new DatabaseError("DATABASE_QUERY_FAILED", "내부 주소의 이미지는 보낼 수 없습니다.", 400);
    }
    let response: Response;
    try {
      response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
    } catch {
      throw new DatabaseError("DATABASE_QUERY_FAILED", `상품 이미지 주소(${host})에 접속하지 못했습니다. 이미지 주소를 확인하거나 이미지를 다시 올려 주세요.`, 502);
    }
    if (!response.ok) throw new DatabaseError("DATABASE_QUERY_FAILED", `상품 이미지를 받지 못했습니다(${host} 응답 ${response.status}).`, 502);
    const contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) throw new DatabaseError("DATABASE_QUERY_FAILED", "이미지 파일이 아닙니다.", 400);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 4 * 1024 * 1024) throw new DatabaseError("DATABASE_QUERY_FAILED", "이미지가 4MB보다 커서 보낼 수 없습니다. 이미지를 줄여 다시 올려 주세요.", 400);
    const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : contentType.includes("gif") ? "gif" : "jpg";
    return { bytes, contentType, fileName: `${(item.code || item.productId).replace(/[^a-zA-Z0-9_-]/g, "")}.${extension}` };
  });
}

// ─── 관리자 화면 ────────────────────────────────────────────────────────────────

export type BaljuoraChangeItem = {
  productId: string;
  kind: "new" | "update";
  code: string | null;
  name: string;
  imageUrl: string | null;
  categoryId: string;
  isVisible: boolean;
  baljuoraId: string | null;
  supplierName: string | null;
  diffs: BaljuoraFieldDiff[];
  syncStatus: string | null;
  lastPushedAt: string | null;
};

export async function listBaljuoraChanges() {
  return guard(async () => {
    const [productRows, links, settings, { doogoCategories, baljuoraCategories }, onlyList, lastCompare] = await Promise.all([
      loadProductRows(),
      loadLinks(),
      getBaljuoraSettings(),
      loadCategoryContext(),
      readStore<BaljuoraProductSnapshot[]>(STORE_ONLY, []),
      getDb().select({ finishedAt: baljuoraSyncJobs.finishedAt }).from(baljuoraSyncJobs).where(and(eq(baljuoraSyncJobs.type, "compare"), eq(baljuoraSyncJobs.status, "done"))).orderBy(desc(baljuoraSyncJobs.finishedAt)).limit(1)
    ]);
    const linkByProduct = new Map(links.map((link) => [link.productId, link]));
    const items: BaljuoraChangeItem[] = [];
    let linkedCount = 0;
    // 연결 상품 중 발주오라 매출처 그룹 공급가를 읽은 상품이 하나라도 있는지(없으면 수강생 단가는 비교·전송하지 못함)
    let groupPriceRead = 0;
    for (const product of productRows) {
      const link = linkByProduct.get(product.id);
      const values: DoogoSyncValues = syncValues(product, settings);
      const state = link ? linkState(link) : null;
      // 연결이 없거나, 예전 형식 연결만 있는 상품(비교 때 발주오라에서 찾지 못함)은 신규 등록 대상입니다.
      if (!link || !state) {
        items.push({ productId: product.id, kind: "new", code: values.code, name: values.name, imageUrl: values.imageUrl, categoryId: product.categoryId, isVisible: product.isVisible, baljuoraId: null, supplierName: product.supplierName, diffs: [], syncStatus: link ? "stale" : null, lastPushedAt: null });
        continue;
      }
      linkedCount += 1;
      if (state.snapshot.groupPrice !== undefined) groupPriceRead += 1;
      const diffs = diffBaljuoraProduct(values, state, baljuoraCategories);
      if (diffs.length === 0 && link.syncStatus !== "failed") continue;
      items.push({ productId: product.id, kind: "update", code: values.code, name: values.name, imageUrl: values.imageUrl, categoryId: product.categoryId, isVisible: product.isVisible, baljuoraId: link.externalProductId, supplierName: product.supplierName, diffs, syncStatus: link.syncStatus, lastPushedAt: link.lastPushedAt });
    }
    const unmappedCategories = doogoCategories.filter((category) => category.isActive && !settings.categoryMap[category.id]).map((category) => ({ id: category.id, name: category.name }));
    return {
      compared: Boolean(lastCompare[0]?.finishedAt),
      lastCompareAt: lastCompare[0]?.finishedAt ?? null,
      linkedCount,
      groupPriceReadable: linkedCount === 0 || groupPriceRead > 0,
      productCount: productRows.length,
      items,
      baljuoraOnly: (Array.isArray(onlyList) ? onlyList : []).filter((snapshot) => !linkByProductCode(links, snapshot)),
      unmappedCategories
    };
  });
}

// 상품 수정 창: 이 상품이 발주오라에 마지막으로 어떤 가격으로 저장돼 있었는지(마지막 비교·동기화 때 읽은 값).
// 발주오라를 지금 다시 읽지는 않습니다(서버는 발주오라에 로그인하지 않음). 매입원가가 들어 있어 관리자만 봅니다.
export type BaljuoraProductPrices = {
  linked: boolean;
  baljuoraId: string | null;
  code: string | null;
  groupKeyword: string;
  syncedAt: string | null;
  lastPushedAt: string | null;
  syncStatus: string | null;
  supplyPrice: number | null;
  groupPrice: number | null;
  // false: 그때 발주오라에서 매출처 그룹 공급가를 읽지 못함(1.2.0 이전 비교) → "아직 못 읽음"
  groupPriceKnown: boolean;
  purchaseCost: number | null;
  consumerPrice: number | null;
};

export async function getBaljuoraProductPrices(productId: string): Promise<BaljuoraProductPrices> {
  return guard(async () => {
    const [links, settings] = await Promise.all([loadLinks([productId]), getBaljuoraSettings()]);
    const empty: BaljuoraProductPrices = { linked: false, baljuoraId: null, code: null, groupKeyword: settings.groupKeyword, syncedAt: null, lastPushedAt: null, syncStatus: null, supplyPrice: null, groupPrice: null, groupPriceKnown: false, purchaseCost: null, consumerPrice: null };
    const candidates = links
      .map((link) => ({ link, state: linkState(link) }))
      .filter((entry): entry is { link: LinkRow; state: BaljuoraLinkState } => entry.state !== null)
      .sort((first, second) => String(second.link.lastPulledAt ?? "").localeCompare(String(first.link.lastPulledAt ?? "")));
    const found = candidates[0];
    if (!found) return empty;
    const { link, state } = found;
    const known = state.snapshot.groupPrice !== undefined;
    return {
      linked: true,
      baljuoraId: link.externalProductId,
      code: state.snapshot.code ?? (link.externalProductCode.startsWith("id:") ? null : link.externalProductCode),
      groupKeyword: settings.groupKeyword,
      syncedAt: link.lastPulledAt ?? null,
      lastPushedAt: link.lastPushedAt ?? null,
      syncStatus: link.syncStatus,
      supplyPrice: toPrice(state.snapshot.supplyPrice),
      groupPrice: known ? toPrice(state.snapshot.groupPrice) : null,
      groupPriceKnown: known,
      purchaseCost: toPrice(state.snapshot.purchaseCost),
      consumerPrice: toPrice(state.snapshot.consumerPrice)
    };
  });
}

function linkByProductCode(links: LinkRow[], snapshot: BaljuoraProductSnapshot) {
  return links.some((link) => link.externalProductId === snapshot.id);
}

export async function getBaljuoraOverview() {
  return guard(async () => {
    const db = getDb();
    await expireStaleJobs();
    const [settings, { doogoCategories, baljuoraCategories }, group, linkCount, recentJobs, active, doogoPolicies, baljuoraPolicies] = await Promise.all([
      getBaljuoraSettings(),
      loadCategoryContext(),
      readStore<{ id: string; name: string } | null>(STORE_GROUP, null),
      db.select({ count: freshLinkCount }).from(externalProductLinks).where(eq(externalProductLinks.provider, PROVIDER)),
      db.select().from(baljuoraSyncJobs).orderBy(desc(baljuoraSyncJobs.createdAt)).limit(12),
      db.select().from(baljuoraSyncJobs).where(inArray(baljuoraSyncJobs.status, ["waiting", "running"])).orderBy(desc(baljuoraSyncJobs.createdAt)).limit(1),
      loadDoogoShippingPolicies(),
      readStore<BaljuoraShippingPolicy[]>(STORE_POLICIES, [])
    ]);
    const lastCompare = recentJobs.find((job) => job.type === "compare" && job.status === "done");
    const lastPush = recentJobs.find((job) => job.type === "push" && job.status === "done");
    return {
      doogoShippingPolicies: doogoPolicies.filter((policy) => policy.isActive).map((policy) => ({ id: policy.id, name: policy.name, policyCode: policy.policyCode, shippingType: policy.shippingType })),
      baljuoraShippingPolicies: (Array.isArray(baljuoraPolicies) ? baljuoraPolicies : []).map((policy) => ({ id: policy.id, code: policy.code, name: policy.name, type: policy.type, convertible: baljuoraPolicyRate(policy) !== null })),
      settings,
      doogoCategories: doogoCategories.filter((category) => category.isActive).map((category) => ({ id: category.id, name: category.name, shippingType: category.shippingType })),
      baljuoraCategories,
      group,
      linkedCount: Number(linkCount[0]?.count ?? 0),
      lastCompareAt: lastCompare?.finishedAt ?? null,
      lastPushAt: lastPush?.finishedAt ?? null,
      activeJob: active[0] ? jobView(active[0]) : null,
      jobs: recentJobs.map((job) => jobView(job))
    };
  });
}

// 운영 홈 카드용 짧은 요약
export async function getBaljuoraHomeSummary() {
  try {
    const db = getDb();
    const [linkCount, lastJobs] = await Promise.all([
      db.select({ count: freshLinkCount }).from(externalProductLinks).where(eq(externalProductLinks.provider, PROVIDER)),
      db.select({ type: baljuoraSyncJobs.type, status: baljuoraSyncJobs.status, finishedAt: baljuoraSyncJobs.finishedAt, summary: baljuoraSyncJobs.summary }).from(baljuoraSyncJobs).orderBy(desc(baljuoraSyncJobs.createdAt)).limit(10)
    ]);
    const lastCompare = lastJobs.find((job) => job.type === "compare" && job.status === "done");
    const lastPush = lastJobs.find((job) => job.type === "push" && job.status === "done");
    return {
      ready: true,
      linkedCount: Number(linkCount[0]?.count ?? 0),
      lastCompareAt: lastCompare?.finishedAt ?? null,
      lastPushAt: lastPush?.finishedAt ?? null,
      lastPushSummary: parseJson<Record<string, unknown> | null>(lastPush?.summary, null)
    };
  } catch (error) {
    if (isMissingTable(error)) return { ready: false, linkedCount: 0, lastCompareAt: null, lastPushAt: null, lastPushSummary: null };
    throw error;
  }
}

// ─── 발주오라 → DB센터 가져오기 ──────────────────────────────────────────────────

function reverseCategory(snapshot: BaljuoraProductSnapshot, settings: BaljuoraSettings, baljuoraCategories: BaljuoraCategory[], doogoCategories: Array<{ id: string; name: string; shippingType: "domestic" | "overseas"; isActive: boolean }>) {
  const active = new Set(doogoCategories.filter((category) => category.isActive).map((category) => category.id));
  return doogoCategoryForBaljuora(snapshot.categoryIds, settings.categoryMap, settings.baljuoraCategoryMap, baljuoraCategories, (id) => active.has(id));
}

// 발주오라 배송비 정책 → DB센터 배송 정책: 연결한 DB센터 정책(같은 배송유형)을 쓰고, 없으면 발주오라 정책 내용(유형·구간·제주/도서산간)으로
// DB센터 정책을 새로 만들어 연결합니다(발주오라 기준 맞추기). DB센터 형식으로 옮길 수 없는 정책이면 이유를 알려 줍니다.
type PolicyContext = {
  doogoPolicies: Array<{ id: string; name: string; policyCode: string | null; shippingType: string; isActive: boolean }>;
  baljuoraPolicies: BaljuoraShippingPolicy[];
  map: Record<string, string>;
  changed: boolean;
};

async function doogoPolicyFor(baljuoraPolicyId: string, shippingType: "domestic" | "overseas", context: PolicyContext) {
  const connected = new Set(Object.entries(context.map).filter(([, baljuoraId]) => baljuoraId === baljuoraPolicyId).map(([doogoId]) => doogoId));
  const existing = context.doogoPolicies.find((policy) => connected.has(policy.id) && policy.shippingType === shippingType && policy.isActive);
  if (existing) return existing.id;
  const definition = context.baljuoraPolicies.find((policy) => policy.id === baljuoraPolicyId);
  if (!definition) throw new Error("발주오라 배송비 정책 정보를 읽지 못했습니다. '발주오라 상품 불러오기(비교)'를 다시 한 뒤 가져와 주세요.");
  const rate = baljuoraPolicyRate(definition);
  if (!rate) throw new Error(`발주오라 배송비 정책 '${definition.name}'을 DB센터 형식으로 옮기지 못했습니다. 배송 정책 메뉴에서 같은 이름으로 만든 뒤 다시 가져와 주세요.`);
  const code = definition.code && /^[A-Za-z0-9]{1,20}$/.test(definition.code) && !context.doogoPolicies.some((policy) => policy.policyCode === definition.code) ? definition.code : null;
  const created = await createShippingPolicy({
    name: definition.name.slice(0, 20) || "발주오라 배송비",
    shippingType,
    rateType: rate.rateType,
    fee: rate.fee,
    rateTiers: rate.tiers,
    unitLabel: rate.unitLabel,
    freeWholeOrder: rate.freeWholeOrder,
    policyCode: code,
    jejuExtraFee: rate.jejuExtraFee,
    islandExtraFee: rate.islandExtraFee,
    description: "발주오라 매출배송정책에서 가져옴"
  });
  context.doogoPolicies.push({ id: created.id, name: created.name, policyCode: created.policyCode ?? null, shippingType, isActive: true });
  context.map[created.id] = baljuoraPolicyId;
  context.changed = true;
  return created.id;
}

// 발주오라 → DB센터: 고른 상품에서 지금 발주오라와 다른 칸만 발주오라 값으로 바꿉니다(같은 칸은 그대로).
// onlyPulled: '가져올 변경' 탭처럼 발주오라에서 바뀐 칸(pull·both)만. 없으면 '발주오라 기준 맞추기'처럼 다른 칸 전부(fields로 고름).
export async function pullFromBaljuora(input: { productIds?: string[]; fields?: BaljuoraSyncField[]; baljuoraIds?: string[]; onlyPulled?: boolean }, changedBy: string) {
  return guard(async () => {
    const settings = await getBaljuoraSettings();
    const [{ doogoCategories, baljuoraCategories }, onlyList, catalog] = await Promise.all([
      loadCategoryContext(),
      readStore<BaljuoraProductSnapshot[]>(STORE_ONLY, []),
      getAdminCatalog()
    ]);
    const fields = (input.fields?.length ? input.fields : BALJUORA_SYNC_FIELDS).filter((field) => BALJUORA_SYNC_FIELDS.includes(field));
    const productById = new Map(catalog.products.map((product) => [product.id, product]));
    const result = { updated: 0, created: 0, unchanged: 0, failed: [] as Array<{ id: string; name: string; error: string }>, skipped: [] as Array<{ id: string; name: string; field: BaljuoraSyncField; reason: string }> };
    const now = nowIso();
    const policyContext: PolicyContext | null = fields.includes("shippingPolicy")
      ? { doogoPolicies: await loadDoogoShippingPolicies(), baljuoraPolicies: await readStore<BaljuoraShippingPolicy[]>(STORE_POLICIES, []), map: { ...settings.shippingPolicyMap }, changed: false }
      : null;
    const categoryPath = new Map(baljuoraCategories.map((category) => [category.id, category.path]));

    // 1) 연결된 상품: 발주오라 값으로 DB센터 상품을 바꿉니다(가격 변경은 가격변동 이력에 남습니다).
    const productIds = [...new Set(input.productIds ?? [])].slice(0, 500);
    const links = await loadLinks(productIds);
    for (const link of links) {
      const state = linkState(link);
      const product = productById.get(link.productId);
      if (!state || !product) continue;
      const snapshot = state.snapshot;
      try {
        // 지금 다른 칸만 바꿉니다(예: 같은 그림인데 주소만 다른 이미지를 바꾸거나, 맞는 카테고리를 다른 연결 카테고리로 옮기지 않게).
        const before = syncValues(product, settings);
        // '이대로 두기'로 뺀 칸은 화면 목록과 같게 건너뜁니다(보여 준 칸만 바꿈).
        const differing = new Set(diffBaljuoraProduct(before, state, baljuoraCategories)
          .filter((diff) => !input.onlyPulled || diff.direction === "pull" || diff.direction === "both")
          .map((diff) => diff.field));
        const wants = (field: BaljuoraSyncField) => fields.includes(field) && differing.has(field);
        if (![...differing].some((field) => fields.includes(field))) {
          result.unchanged += 1;
          continue;
        }
        const next = asProductInput(product);
        if (wants("name") && snapshot.name) next.name = snapshot.name;
        if (wants("supplyPrice") && snapshot.supplyPrice !== null) next.generalPrice = snapshot.supplyPrice;
        if (wants("groupPrice") && snapshot.groupPrice !== undefined) next.aPrice = snapshot.groupPrice ?? next.generalPrice;
        if (wants("consumerPrice")) {
          next.salePrice = snapshot.consumerPrice;
          next.salePriceMode = snapshot.consumerPrice ? "fixed" : "autonomous";
        }
        if (wants("purchaseCost") && snapshot.purchaseCost !== null) next.costPrice = snapshot.purchaseCost;
        if (wants("image") && snapshot.imageUrls[0]) next.imageUrl = snapshot.imageUrls[0];
        if (wants("category")) {
          const categoryId = reverseCategory(snapshot, settings, baljuoraCategories, doogoCategories);
          const category = doogoCategories.find((item) => item.id === categoryId);
          if (category && category.shippingType === next.shippingType) next.categoryId = category.id;
          else {
            const path = (snapshot.categoryIds ?? []).map((id) => categoryPath.get(id) ?? id).join(", ") || "없음";
            result.skipped.push({ id: product.id, name: product.name, field: "category", reason: category ? `연결된 DB센터 카테고리 '${category.name}'의 배송유형이 상품과 달라 바꾸지 않았습니다.` : `발주오라 카테고리(${path})와 연결된 DB센터 카테고리가 없습니다. 동기화 설정 > 카테고리 맞추기에서 연결하거나 만들어 주세요.` });
          }
        }
        if (wants("shippingPolicy") && snapshot.shippingPolicyId && policyContext) {
          try {
            next.shippingPolicyId = await doogoPolicyFor(snapshot.shippingPolicyId, next.shippingType, policyContext);
          } catch (error) {
            result.skipped.push({ id: product.id, name: product.name, field: "shippingPolicy", reason: error instanceof Error ? error.message : "배송비 정책을 가져오지 못했습니다." });
          }
        }
        const saved = await updateProduct(product.id, next, changedBy);
        const values = syncValues(saved, settings);
        const baseline: BaljuoraBaseline = { doogo: doogoComparable(values), baljuora: baljuoraComparable(snapshot), pushedImageUrl: state.baseline?.pushedImageUrl ?? null, at: now };
        await getDb().update(externalProductLinks).set({ rawSnapshot: stateJson({ snapshot, baseline, ignored: state.ignored }), syncStatus: "imported", updatedAt: now }).where(eq(externalProductLinks.id, link.id));
        result.updated += 1;
      } catch (error) {
        result.failed.push({ id: product.id, name: product.name, error: error instanceof Error ? error.message : "저장 실패" });
      }
    }

    // 2) 발주오라에만 있는 상품: DB센터에 새 상품으로 만듭니다(공개 단가표에는 숨김으로 등록, 관리자가 확인 후 노출).
    const wanted = new Set((input.baljuoraIds ?? []).slice(0, 500));
    if (wanted.size > 0) {
      const fallback = doogoCategories.find((category) => category.isActive && category.shippingType === "domestic" && UNCATEGORIZED_NAMES.has(category.name))
        ?? doogoCategories.find((category) => category.isActive && category.shippingType === "domestic");
      const upserts: Array<typeof externalProductLinks.$inferInsert> = [];
      for (const snapshot of (Array.isArray(onlyList) ? onlyList : []).filter((item) => wanted.has(item.id))) {
        try {
          const categoryId = reverseCategory(snapshot, settings, baljuoraCategories, doogoCategories) ?? fallback?.id;
          const category = doogoCategories.find((item) => item.id === categoryId);
          if (!category) throw new Error("DB센터 카테고리를 찾지 못했습니다. 카테고리 연결을 먼저 해 주세요.");
          const supplyPrice = snapshot.supplyPrice ?? 0;
          const created = await createProduct({
            productCode: snapshot.code,
            name: snapshot.name || snapshot.code || "발주오라 상품",
            imageUrl: snapshot.imageUrls[0] ?? null,
            costPrice: snapshot.purchaseCost ?? 0,
            aPrice: snapshot.groupPrice ?? supplyPrice,
            generalPrice: supplyPrice,
            salePrice: snapshot.consumerPrice,
            salePriceMode: snapshot.consumerPrice ? "fixed" : "autonomous",
            shippingType: category.shippingType,
            categoryId: category.id,
            isVisible: false,
            isSoldOut: snapshot.isSoldOut ?? false,
            isAlwaysOnSale: true
          });
          const values = syncValues(created, settings);
          upserts.push({
            provider: PROVIDER,
            externalProductId: snapshot.id,
            externalProductCode: snapshot.code || `id:${snapshot.id}`,
            productId: created.id,
            externalUpdatedAt: snapshot.updatedAt,
            lastPulledAt: now,
            lastPushedAt: null,
            syncStatus: "imported",
            rawSnapshot: JSON.stringify({ snapshot, baseline: { doogo: doogoComparable(values), baljuora: baljuoraComparable(snapshot), pushedImageUrl: values.imageUrl, at: now } }),
            createdAt: now,
            updatedAt: now
          });
          result.created += 1;
        } catch (error) {
          result.failed.push({ id: snapshot.id, name: snapshot.name, error: error instanceof Error ? error.message : "등록 실패" });
        }
      }
      await removeConflictingLinks(upserts.map((link) => ({ externalProductId: link.externalProductId, externalProductCode: link.externalProductCode, productId: link.productId })));
      await upsertLinks(upserts);
      if (upserts.length > 0) {
        const linkedIds = new Set(upserts.map((link) => link.externalProductId));
        await writeStore(STORE_ONLY, (Array.isArray(onlyList) ? onlyList : []).filter((snapshot) => !linkedIds.has(snapshot.id)));
      }
    }
    // 가져오면서 새로 만든 DB센터 배송 정책은 발주오라 정책과 연결해 둡니다(다음 비교부터 같은 정책으로 봄).
    if (policyContext?.changed) await saveBaljuoraSettings({ shippingPolicyMap: policyContext.map });
    return result;
  });
}

// 카테고리 맞추기: DB센터 카테고리와 연결되지 않은 발주오라 카테고리를 DB센터에 같은 이름으로 만들고 연결합니다
// (같은 이름의 DB센터 카테고리가 이미 있으면 새로 만들지 않고 연결만). 발주오라 카테고리는 바꾸지 않습니다.
export async function createDoogoCategoriesFromBaljuora(input: { baljuoraCategoryIds: string[]; shippingType: "domestic" | "overseas" }) {
  return guard(async () => {
    const [settings, { doogoCategories, baljuoraCategories }] = await Promise.all([getBaljuoraSettings(), loadCategoryContext()]);
    const map = { ...settings.categoryMap };
    const activeIds = new Set(doogoCategories.filter((category) => category.isActive).map((category) => category.id));
    const connected = new Set([...Object.entries(map).filter(([doogoId]) => activeIds.has(doogoId)).map(([, baljuoraId]) => baljuoraId), ...Object.keys(settings.baljuoraCategoryMap)]);
    const created: Array<{ id: string; name: string; baljuoraId: string; reused: boolean }> = [];
    for (const id of [...new Set(input.baljuoraCategoryIds)].slice(0, 100)) {
      const category = baljuoraCategories.find((item) => item.id === id);
      if (!category || connected.has(id)) continue;
      const key = plainCategoryName(category.name);
      const same = doogoCategories.find((item) => item.isActive && item.shippingType === input.shippingType && !map[item.id] && key && plainCategoryName(item.name) === key);
      const target = same ?? await createCategory({ name: category.name.slice(0, 60), shippingType: input.shippingType, sortOrder: 1000 + created.length, isActive: true });
      if (!same) doogoCategories.push({ id: target.id, name: target.name, shippingType: input.shippingType, isActive: true });
      map[target.id] = id;
      connected.add(id);
      created.push({ id: target.id, name: target.name, baljuoraId: id, reused: Boolean(same) });
    }
    if (created.length > 0) await saveBaljuoraSettings({ categoryMap: map });
    return { created };
  });
}

// "이대로 두기": 고른 상품의 지금 다른 칸(또는 고른 칸)을 변경 목록에서 뺍니다. 그 뒤 어느 한쪽 값이 또 바뀌면 다시 보입니다.
export async function ignoreBaljuoraDifferences(productIds: string[], fields?: BaljuoraSyncField[]) {
  return guard(async () => {
    const ids = [...new Set(productIds)].slice(0, 2000);
    const [productRows, links, settings, { baljuoraCategories }] = await Promise.all([loadProductRows(ids), loadLinks(ids), getBaljuoraSettings(), loadCategoryContext()]);
    const productById = new Map(productRows.map((product) => [product.id, product]));
    const now = nowIso();
    let ignoredCount = 0;
    for (const link of links) {
      const state = linkState(link);
      const product = productById.get(link.productId);
      if (!state || !product) continue;
      const values = syncValues(product, settings);
      const diffs = diffBaljuoraProduct(values, { ...state, ignored: undefined }, baljuoraCategories).filter((diff) => !fields?.length || fields.includes(diff.field));
      if (diffs.length === 0) continue;
      const ignored = { ...(state.ignored ?? {}) };
      for (const diff of diffs) ignored[diff.field] = { doogo: diff.doogo, baljuora: diff.baljuora };
      await getDb().update(externalProductLinks).set({ rawSnapshot: stateJson({ ...state, ignored }), updatedAt: now }).where(eq(externalProductLinks.id, link.id));
      ignoredCount += 1;
    }
    return { ignored: ignoredCount };
  });
}
