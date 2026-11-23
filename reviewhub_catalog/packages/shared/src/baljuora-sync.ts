// 발주오라 수동 동기화 공용 규칙(서버·관리자 화면 공용, 2026-11-22 관리자 요청).
// 발주오라는 공개 API가 없고 관리자 로그인에 사람 확인(Cloudflare)이 있어, 서버가 대신 로그인하지 않습니다.
// 관리자가 로그인해 둔 발주오라 관리자 창에서 책갈피 "두고푸드 동기화"(public/baljuora-sync.js)를 누르면
// 그 창이 DB센터가 만든 작업(비교 또는 보내기)을 실행하고 결과를 돌려줍니다.
// 이 파일은 "무엇이 다른가"를 정하는 규칙만 둡니다(값 정리·비교·방향).

export const BALJUORA_CONSOLE_ORIGIN = "https://console.baljuora.com";
export const BALJUORA_DEFAULT_MERCHANT_SLUG = "doogobiz24";
// 수강생 단가는 발주오라 매출처 그룹 중 이름에 이 단어가 들어간 그룹의 공급가입니다(단가관리 엑셀과 같은 기준).
export const BALJUORA_DEFAULT_GROUP_KEYWORD = "황금농부";
export const BALJUORA_JOB_TTL_MINUTES = 30;
// 작업 코드: 헷갈리는 글자(0·O·1·I·L)를 뺀 32글자 중 10글자(약 50비트), 화면에는 5-5로 나눠 보여 줍니다.
export const BALJUORA_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const BALJUORA_CODE_LENGTH = 10;

export type BaljuoraSyncField = "name" | "supplyPrice" | "groupPrice" | "consumerPrice" | "purchaseCost" | "category" | "image" | "shippingPolicy";
export const BALJUORA_SYNC_FIELDS: BaljuoraSyncField[] = ["name", "supplyPrice", "groupPrice", "consumerPrice", "purchaseCost", "category", "image", "shippingPolicy"];
export const BALJUORA_PRICE_FIELDS: BaljuoraSyncField[] = ["supplyPrice", "groupPrice", "consumerPrice", "purchaseCost"];

// 화면 이름: 발주오라 칸 ← DB센터 칸
export const BALJUORA_FIELD_LABELS: Record<BaljuoraSyncField, string> = {
  name: "상품명",
  supplyPrice: "공급가 ← 일반공급가",
  groupPrice: "그룹 공급가 ← 수강생 단가",
  consumerPrice: "소비자가 ← 지정 판매가",
  purchaseCost: "매입원가 ← 원가",
  category: "카테고리",
  image: "대표 이미지",
  shippingPolicy: "매출배송정책 ← 배송 정책"
};
export const BALJUORA_FIELD_SHORT_LABELS: Record<BaljuoraSyncField, string> = {
  name: "상품명",
  supplyPrice: "공급가",
  groupPrice: "수강생 단가",
  consumerPrice: "소비자가",
  purchaseCost: "매입원가",
  category: "카테고리",
  image: "이미지",
  shippingPolicy: "배송비 정책"
};

// 발주오라 상품을 비교용으로 줄인 값(책갈피 스크립트가 읽어서 보냄). undefined = 그 칸을 읽지 못함.
export type BaljuoraProductSnapshot = {
  id: string;
  kind: "product" | "bundle";
  code: string | null;
  name: string;
  supplyPrice: number | null;
  consumerPrice: number | null;
  purchaseCost: number | null;
  groupPrice?: number | null;
  categoryIds?: string[];
  // 발주오라 매출배송정책 id(sellShippingPolicyId). undefined = 읽지 못함, null = 지정 없음
  shippingPolicyId?: string | null;
  imageUrls: string[];
  isVisible: boolean | null;
  isSoldOut: boolean | null;
  updatedAt: string | null;
};

export type BaljuoraCategory = { id: string; name: string; parentId: string | null; path: string };

// 발주오라 배송비 정책(매출배송정책, GET merchant/shipping-policies — 2026-11-23 화면 코드 확인).
// 유형: fixed 고정 · free 무료 · byPrice 금액별 · byQuantity 수량별 · byUnit 단위별(DB센터 배송 정책 5가지와 같음)
export type BaljuoraShippingRule = { startRange: number | null; endRange: number | null; fee: number; unitType: string | null };
export type BaljuoraShippingPolicy = {
  id: string;
  code: string | null;
  name: string;
  type: string | null;
  fixedFee: number | null;
  isConditionRepeat: boolean;
  isSameOrderFree: boolean;
  isJejuAndRemoteAdditionalFee: boolean;
  jejuAdditionalFee: number;
  remoteAdditionalFee: number;
  rules: BaljuoraShippingRule[];
};
export const BALJUORA_POLICY_TYPE_LABELS: Record<string, string> = { fixed: "고정배송비", free: "배송비무료", byPrice: "금액별배송비", byQuantity: "수량별배송비", byUnit: "단위별배송비" };

// DB센터 배송 정책 중 연결에 쓰는 칸
export type DoogoShippingPolicyRef = { id: string; name: string; policyCode: string | null; shippingType: string };

// DB센터 상품 중 동기화에 쓰는 칸
export type DoogoProductForSync = {
  id: string;
  productCode: string | null;
  name: string;
  generalPrice: number;
  aPrice: number | null;
  salePrice: number | null;
  salePriceMode: "autonomous" | "fixed" | string;
  costPrice: number | null;
  categoryId: string | null;
  imageUrl: string | null;
  shippingPolicyId?: string | null;
};

export type DoogoSyncValues = {
  code: string | null;
  name: string;
  supplyPrice: number;
  groupPrice: number;
  consumerPrice: number | null;
  purchaseCost: number | null;
  categoryId: string | null;
  baljuoraCategoryId: string | null;
  // 이 DB센터 카테고리와 같다고 보는 발주오라 카테고리 전체(보낼 곳 1개 + '발주오라 카테고리 → DB센터' 연결로 이어진 카테고리들)
  baljuoraCategoryIds: string[];
  imageUrl: string | null;
  // DB센터 배송 정책 id와, 연결한 발주오라 매출배송정책 id(연결 없으면 null)
  shippingPolicyId: string | null;
  baljuoraShippingPolicyId: string | null;
};

// 연결(external_product_links.rawSnapshot)에 저장하는 기준: 마지막으로 맞춘 때의 양쪽 값
export type BaljuoraBaseline = {
  doogo: Partial<Record<BaljuoraSyncField, string | number | null>>;
  baljuora: Partial<Record<BaljuoraSyncField, string | number | null>>;
  pushedImageUrl: string | null;
  at: string;
};

// ignored: 관리자가 "이대로 두기"를 누른 칸. 그때의 양쪽 값이 그대로면 변경 목록에 다시 올리지 않습니다.
export type BaljuoraIgnoredFields = Partial<Record<BaljuoraSyncField, { doogo: string | number | null; baljuora: string | number | null }>>;
export type BaljuoraLinkState = { snapshot: BaljuoraProductSnapshot; baseline: BaljuoraBaseline | null; ignored?: BaljuoraIgnoredFields };

// push: DB센터에서 바뀜 → 보낼 값 / pull: 발주오라에서 바뀜 / both: 양쪽 다 바뀜 / initial: 처음 비교부터 달랐음
export type BaljuoraDiffDirection = "push" | "pull" | "both" | "initial";
export type BaljuoraFieldDiff = {
  field: BaljuoraSyncField;
  doogo: string | number | null;
  baljuora: string | number | null;
  direction: BaljuoraDiffDirection;
};

export const BALJUORA_DIRECTION_LABELS: Record<BaljuoraDiffDirection, string> = {
  push: "DB센터에서 바뀜",
  pull: "발주오라에서 바뀜",
  both: "양쪽 다 바뀜",
  initial: "처음부터 다름"
};

export function collapseName(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

export function toPrice(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(/[,\s원]/gu, ""));
  if (!Number.isFinite(number)) return null;
  return Math.round(number);
}

// 0원은 "값 없음"과 같게 봅니다(소비자가·매입원가·그룹 공급가)
function priceOrNull(value: unknown) {
  const price = toPrice(value);
  return price && price > 0 ? price : null;
}

export function doogoSyncValues(product: DoogoProductForSync, categoryMap: Record<string, string>, shippingPolicyMap: Record<string, string> = {}, baljuoraCategoryMap: Record<string, string> = {}): DoogoSyncValues {
  const generalPrice = toPrice(product.generalPrice) ?? 0;
  const aPrice = priceOrNull(product.aPrice);
  return {
    code: collapseName(product.productCode) || null,
    name: collapseName(product.name),
    supplyPrice: generalPrice,
    groupPrice: aPrice ?? generalPrice,
    consumerPrice: product.salePriceMode === "fixed" ? priceOrNull(product.salePrice) : null,
    purchaseCost: priceOrNull(product.costPrice),
    categoryId: product.categoryId || null,
    baljuoraCategoryId: product.categoryId ? categoryMap[product.categoryId] || null : null,
    baljuoraCategoryIds: product.categoryId
      ? [...new Set([categoryMap[product.categoryId], ...Object.entries(baljuoraCategoryMap).filter(([, doogoId]) => doogoId === product.categoryId).map(([baljuoraId]) => baljuoraId)].filter((id): id is string => Boolean(id)))]
      : [],
    imageUrl: product.imageUrl?.trim() || null,
    shippingPolicyId: product.shippingPolicyId || null,
    baljuoraShippingPolicyId: product.shippingPolicyId ? shippingPolicyMap[product.shippingPolicyId] || null : null
  };
}

// 기준에 저장할 비교용 값(카테고리는 DB센터 카테고리 id, 이미지는 DB센터 이미지 주소)
export function doogoComparable(values: DoogoSyncValues): BaljuoraBaseline["doogo"] {
  return {
    name: values.name,
    supplyPrice: values.supplyPrice,
    groupPrice: values.groupPrice,
    consumerPrice: values.consumerPrice,
    purchaseCost: values.purchaseCost,
    category: values.categoryId,
    image: values.imageUrl,
    shippingPolicy: values.shippingPolicyId
  };
}

export function baljuoraComparable(snapshot: BaljuoraProductSnapshot): BaljuoraBaseline["baljuora"] {
  return {
    name: collapseName(snapshot.name),
    supplyPrice: toPrice(snapshot.supplyPrice),
    groupPrice: snapshot.groupPrice === undefined ? undefined : priceOrNull(snapshot.groupPrice),
    consumerPrice: priceOrNull(snapshot.consumerPrice),
    purchaseCost: priceOrNull(snapshot.purchaseCost),
    category: snapshot.categoryIds === undefined ? undefined : [...snapshot.categoryIds].sort().join(",") || null,
    image: snapshot.imageUrls[0] ?? null,
    shippingPolicy: snapshot.shippingPolicyId === undefined ? undefined : snapshot.shippingPolicyId ?? null
  };
}

export function flattenBaljuoraCategories(tree: unknown): BaljuoraCategory[] {
  const result: BaljuoraCategory[] = [];
  const walk = (nodes: unknown, parent: BaljuoraCategory | null) => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const record = node as { id?: unknown; name?: unknown; children?: unknown };
      if (typeof record.id !== "string" || typeof record.name !== "string") continue;
      const category = { id: record.id, name: record.name, parentId: parent?.id ?? null, path: parent ? `${parent.path} > ${record.name}` : record.name };
      result.push(category);
      walk(record.children, category);
    }
  };
  walk(tree, null);
  return result;
}

// 발주오라 상품 카테고리가 연결한 카테고리이거나 그 아래 카테고리면 맞는 것으로 봅니다
// (예: DB센터 "🥕 농산" = 발주오라 "🥕 농산"이면 발주오라 "농산 > 과일류" 상품도 맞음).
export function categoryMatches(categoryIds: string[] | undefined, mappedId: string | null, categories: BaljuoraCategory[]) {
  if (!mappedId || categoryIds === undefined) return true;
  const parentOf = new Map(categories.map((category) => [category.id, category.parentId]));
  return categoryIds.some((id) => {
    let current: string | null | undefined = id;
    for (let depth = 0; current && depth < 10; depth += 1) {
      if (current === mappedId) return true;
      current = parentOf.get(current);
    }
    return false;
  });
}

export function plainCategoryName(name: string) {
  return name.replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
}

// 이름이 같은 발주오라 카테고리를 찾습니다(이모지·띄어쓰기 무시, 맨 위 카테고리 먼저).
export function suggestCategoryMapping(doogoCategories: Array<{ id: string; name: string }>, categories: BaljuoraCategory[], current: Record<string, string>) {
  const next: Record<string, string> = { ...current };
  const valid = new Set(categories.map((category) => category.id));
  for (const [doogoId, baljuoraId] of Object.entries(next)) {
    if (!valid.has(baljuoraId)) delete next[doogoId];
  }
  const ordered = [...categories].sort((first, second) => Number(Boolean(first.parentId)) - Number(Boolean(second.parentId)));
  for (const category of doogoCategories) {
    if (next[category.id]) continue;
    const key = plainCategoryName(category.name);
    const match = key ? ordered.find((candidate) => plainCategoryName(candidate.name) === key) : undefined;
    if (match) next[category.id] = match.id;
  }
  return next;
}

function directionFor(field: BaljuoraSyncField, doogoValue: unknown, baljuoraValue: unknown, baseline: BaljuoraBaseline | null): BaljuoraDiffDirection {
  if (!baseline) return "initial";
  const doogoChanged = baseline.doogo[field] !== undefined && baseline.doogo[field] !== doogoValue;
  const baljuoraChanged = baseline.baljuora[field] !== undefined && baseline.baljuora[field] !== baljuoraValue;
  if (doogoChanged && baljuoraChanged) return "both";
  if (doogoChanged) return "push";
  if (baljuoraChanged) return "pull";
  return "initial";
}

// DB센터 값과 마지막으로 본 발주오라 값을 칸마다 비교합니다. 발주오라에서 읽지 못한 칸은 비교하지 않습니다.
export function diffBaljuoraProduct(values: DoogoSyncValues, state: BaljuoraLinkState, categories: BaljuoraCategory[]): BaljuoraFieldDiff[] {
  const { snapshot, baseline } = state;
  const diffs: BaljuoraFieldDiff[] = [];
  const doogo = doogoComparable(values);
  const baljuora = baljuoraComparable(snapshot);

  if (doogo.name && doogo.name !== baljuora.name) {
    diffs.push({ field: "name", doogo: doogo.name, baljuora: baljuora.name ?? null, direction: directionFor("name", doogo.name, baljuora.name, baseline) });
  }
  if (doogo.supplyPrice !== baljuora.supplyPrice && Number(doogo.supplyPrice) > 0) {
    diffs.push({ field: "supplyPrice", doogo: doogo.supplyPrice ?? null, baljuora: baljuora.supplyPrice ?? null, direction: directionFor("supplyPrice", doogo.supplyPrice, baljuora.supplyPrice, baseline) });
  }
  if (baljuora.groupPrice !== undefined) {
    // 발주오라에 그룹 공급가가 없으면 수강생도 공급가로 삽니다. DB센터에 따로 정한 수강생 단가가 없으면(= 일반공급가)
    // 그룹 공급가가 없어도 맞는 것으로 보고(공급가 차이는 공급가 칸에서 보임), 따로 정한 단가가 있을 때만 비교합니다.
    const ownStudentPrice = doogo.groupPrice !== doogo.supplyPrice;
    const differs = baljuora.groupPrice === null
      ? ownStudentPrice && doogo.groupPrice !== (baljuora.supplyPrice ?? null)
      : doogo.groupPrice !== baljuora.groupPrice;
    if (Number(doogo.groupPrice) > 0 && differs) {
      diffs.push({ field: "groupPrice", doogo: doogo.groupPrice ?? null, baljuora: baljuora.groupPrice ?? null, direction: directionFor("groupPrice", doogo.groupPrice, baljuora.groupPrice, baseline) });
    }
  }
  if (doogo.consumerPrice !== baljuora.consumerPrice) {
    diffs.push({ field: "consumerPrice", doogo: doogo.consumerPrice ?? null, baljuora: baljuora.consumerPrice ?? null, direction: directionFor("consumerPrice", doogo.consumerPrice, baljuora.consumerPrice, baseline) });
  }
  if (doogo.purchaseCost !== null && doogo.purchaseCost !== baljuora.purchaseCost) {
    diffs.push({ field: "purchaseCost", doogo: doogo.purchaseCost ?? null, baljuora: baljuora.purchaseCost ?? null, direction: directionFor("purchaseCost", doogo.purchaseCost, baljuora.purchaseCost, baseline) });
  }
  // 카테고리: 발주오라 상품 카테고리(또는 그 위 카테고리)가 이 DB센터 카테고리와 연결된 발주오라 카테고리 중 하나면 같음.
  // (DB센터는 대표 카테고리 7개, 발주오라는 세부 카테고리가 많아 '발주오라 카테고리 → DB센터 카테고리' 연결은 여러 개 → 하나)
  const connectedCategories = values.baljuoraCategoryIds ?? (values.baljuoraCategoryId ? [values.baljuoraCategoryId] : []);
  if (connectedCategories.length > 0 && !connectedCategories.some((id) => categoryMatches(snapshot.categoryIds, id, categories))) {
    const doogoChanged = Boolean(baseline && baseline.doogo.category !== undefined && baseline.doogo.category !== values.categoryId);
    const baljuoraChanged = Boolean(baseline && baseline.baljuora.category !== undefined && baseline.baljuora.category !== baljuora.category);
    const direction: BaljuoraDiffDirection = !baseline ? "initial" : doogoChanged && baljuoraChanged ? "both" : doogoChanged ? "push" : baljuoraChanged ? "pull" : "initial";
    diffs.push({ field: "category", doogo: values.baljuoraCategoryId, baljuora: (snapshot.categoryIds ?? []).join(",") || null, direction });
  }
  let imageDiff = false;
  if (values.imageUrl) {
    const inSnapshot = snapshot.imageUrls.includes(values.imageUrl);
    const alreadyPushed = baseline?.pushedImageUrl === values.imageUrl;
    const sameAsBaseline = baseline ? baseline.doogo.image === values.imageUrl : snapshot.imageUrls.length > 0;
    if (!inSnapshot && !alreadyPushed && (!sameAsBaseline || snapshot.imageUrls.length === 0)) {
      diffs.push({ field: "image", doogo: values.imageUrl, baljuora: snapshot.imageUrls[0] ?? null, direction: !baseline ? "initial" : "push" });
      imageDiff = true;
    }
  }
  // 발주오라에서 대표 이미지(썸네일)를 바꿨으면(마지막으로 맞춘 때의 발주오라 첫 이미지와 다름) 가져올 변경으로 올립니다(2026-11-23 관리자 요청).
  // DB센터가 보낸 이미지는 발주오라에 새 주소로 올라가므로 주소끼리가 아니라 "마지막으로 맞춘 때의 발주오라 이미지"와 비교합니다.
  const baljuoraImage = snapshot.imageUrls[0] ?? null;
  const baselineImage = baseline?.baljuora.image;
  if (!imageDiff && baseline && typeof baselineImage === "string" && baljuoraImage && baljuoraImage !== baselineImage && baljuoraImage !== values.imageUrl) {
    const doogoChanged = baseline.doogo.image !== undefined && baseline.doogo.image !== values.imageUrl;
    diffs.push({ field: "image", doogo: values.imageUrl, baljuora: baljuoraImage, direction: doogoChanged ? "both" : "pull" });
    imageDiff = true;
  }
  // DB센터 상품에 대표 이미지가 없고 발주오라에는 있으면 가져올 수만 있습니다(가져올 변경).
  if (!imageDiff && !values.imageUrl && baljuoraImage) {
    diffs.push({ field: "image", doogo: null, baljuora: baljuoraImage, direction: "pull" });
  }
  // 배송비 정책: DB센터 상품의 배송 정책과 연결한 발주오라 매출배송정책이 발주오라 상품의 매출배송정책과 같은지 봅니다.
  // DB센터 상품에 배송 정책이 없으면 발주오라 정책을 가져오는 것만 됩니다(가져올 변경). 발주오라에서 읽지 못했으면 비교하지 않습니다.
  if (snapshot.shippingPolicyId !== undefined && (values.shippingPolicyId || snapshot.shippingPolicyId)) {
    const current = snapshot.shippingPolicyId ?? null;
    const differs = values.shippingPolicyId ? values.baljuoraShippingPolicyId !== current : true;
    if (differs) {
      const direction: BaljuoraDiffDirection = values.shippingPolicyId ? directionFor("shippingPolicy", doogo.shippingPolicy, baljuora.shippingPolicy, baseline) : "pull";
      diffs.push({ field: "shippingPolicy", doogo: values.shippingPolicyId, baljuora: current, direction });
    }
  }
  const ignored = state.ignored ?? {};
  return diffs.filter((diff) => {
    const entry = ignored[diff.field];
    return !entry || entry.doogo !== diff.doogo || entry.baljuora !== diff.baljuora;
  });
}

export function formatBaljuoraCode(code: string) {
  const clean = code.replace(/[^0-9A-Za-z]/gu, "").toUpperCase();
  return clean.length > 5 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : clean;
}

export function normalizeBaljuoraCode(code: string) {
  return code.replace(/[^0-9A-Za-z]/gu, "").toUpperCase();
}

// 배송비 정책 연결(DB센터 정책 id → 발주오라 정책 id): 배송비 코드가 같으면 먼저, 아니면 이름(이모지·띄어쓰기 무시)이 같은 정책.
// 지금 목록에 없는 발주오라 정책과의 연결은 지웁니다(목록을 읽지 못했으면 부르지 않습니다).
export function suggestShippingPolicyMapping(doogoPolicies: DoogoShippingPolicyRef[], policies: BaljuoraShippingPolicy[], current: Record<string, string>) {
  const next: Record<string, string> = { ...current };
  const valid = new Set(policies.map((policy) => policy.id));
  for (const [doogoId, baljuoraId] of Object.entries(next)) {
    if (!valid.has(baljuoraId)) delete next[doogoId];
  }
  for (const policy of doogoPolicies) {
    if (next[policy.id]) continue;
    const code = policy.policyCode?.trim().toUpperCase();
    const byCode = code ? policies.find((candidate) => candidate.code?.trim().toUpperCase() === code) : undefined;
    const key = plainCategoryName(policy.name);
    const match = byCode ?? (key ? policies.find((candidate) => plainCategoryName(candidate.name) === key) : undefined);
    if (match) next[policy.id] = match.id;
  }
  return next;
}

// 발주오라 배송비 정책 → DB센터 배송 정책 값(배송비 유형·구간). DB센터 규칙(구간은 1부터 차례로 커짐)에 맞지 않으면 null(만들지 않음).
export type DoogoRateFromBaljuora = {
  rateType: "fixed" | "free" | "amount" | "quantity" | "unit";
  fee: number;
  tiers: { tiers: Array<{ upTo: number; fee: number }>; last: { fee: number; repeat: boolean } } | null;
  unitLabel: string | null;
  freeWholeOrder: boolean;
  jejuExtraFee: number;
  islandExtraFee: number;
};
const RATE_BY_BALJUORA_TYPE: Record<string, DoogoRateFromBaljuora["rateType"]> = { fixed: "fixed", free: "free", byPrice: "amount", byQuantity: "quantity", byUnit: "unit" };
const DOOGO_UNIT_LABELS = ["개", "박스", "kg", "g", "팩", "봉", "세트"];

export function baljuoraPolicyRate(policy: BaljuoraShippingPolicy): DoogoRateFromBaljuora | null {
  const rateType = policy.type ? RATE_BY_BALJUORA_TYPE[policy.type] : undefined;
  if (!rateType) return null;
  const money = (value: unknown) => Math.max(0, Math.round(Number(value) || 0));
  const extra = policy.isJejuAndRemoteAdditionalFee
    ? { jejuExtraFee: money(policy.jejuAdditionalFee), islandExtraFee: money(policy.remoteAdditionalFee) }
    : { jejuExtraFee: 0, islandExtraFee: 0 };
  if (rateType === "fixed") return { rateType, fee: money(policy.fixedFee ?? policy.rules[0]?.fee ?? 0), tiers: null, unitLabel: null, freeWholeOrder: false, ...extra };
  if (rateType === "free") return { rateType, fee: 0, tiers: null, unitLabel: null, freeWholeOrder: Boolean(policy.isSameOrderFree), ...extra };
  const rules = [...policy.rules].sort((first, second) => (first.startRange ?? 0) - (second.startRange ?? 0));
  const tiers: Array<{ upTo: number; fee: number }> = [];
  let last: { fee: number; repeat: boolean } | null = null;
  let previousEnd: number | null = null;
  for (const [index, rule] of rules.entries()) {
    if (index > 0 && previousEnd !== null && rule.startRange !== null && Math.round(rule.startRange) !== previousEnd) return null;
    if (rule.endRange === null) {
      if (index !== rules.length - 1) return null;
      last = { fee: policy.isConditionRepeat ? 0 : money(rule.fee), repeat: Boolean(policy.isConditionRepeat) };
      break;
    }
    const upTo = Math.round(rule.endRange);
    if (upTo <= (previousEnd ?? 1)) return null;
    tiers.push({ upTo, fee: money(rule.fee) });
    previousEnd = upTo;
  }
  if (!last) {
    if (!policy.isConditionRepeat) return null;
    last = { fee: 0, repeat: true };
  }
  if (tiers.length === 0) return null;
  const unit = String(rules.find((rule) => rule.unitType)?.unitType ?? "").trim();
  const unitLabel = rateType === "unit" ? DOOGO_UNIT_LABELS.find((label) => label.toLowerCase() === unit.toLowerCase()) ?? "개" : null;
  return { rateType, fee: 0, tiers: { tiers, last }, unitLabel, freeWholeOrder: false, ...extra };
}

// 카테고리 맞추기 화면: DB센터 카테고리와 연결되지 않은 발주오라 카테고리 중 꼭 필요한 것만 고릅니다.
// - 자기나 위 카테고리가 연결돼 있으면 제외(발주오라 하위 카테고리 상품은 위 카테고리 연결로 맞춤)
// - 아래 카테고리가 하나도 연결되지 않은 위 카테고리는 위 카테고리 하나만(아래는 위를 만들면 함께 맞춰짐)
// - 형제 중 일부만 연결된 경우는 연결 안 된 형제를 따로 보여 줍니다
export function unconnectedBaljuoraCategories(categories: BaljuoraCategory[], categoryMap: Record<string, string>, baljuoraCategoryMap: Record<string, string> = {}) {
  const connected = new Set([...Object.values(categoryMap), ...Object.keys(baljuoraCategoryMap)]);
  const parentOf = new Map(categories.map((category) => [category.id, category.parentId]));
  const isUnder = (id: string, ancestorId: string) => {
    let current = parentOf.get(id) ?? null;
    for (let depth = 0; current && depth < 10; depth += 1) {
      if (current === ancestorId) return true;
      current = parentOf.get(current) ?? null;
    }
    return false;
  };
  const covered = (id: string) => connected.has(id) || [...connected].some((connectedId) => isUnder(id, connectedId));
  const hasConnectedBelow = (id: string) => [...connected].some((connectedId) => isUnder(connectedId, id));
  return categories.filter((category) => !covered(category.id)
    && !hasConnectedBelow(category.id)
    && (category.parentId === null || hasConnectedBelow(category.parentId)));
}

// 발주오라 → DB센터 카테고리: 발주오라 상품 카테고리에서 위로 올라가며 가장 가까운 연결을 씁니다.
// 각 단계에서 '발주오라 카테고리 → DB센터' 연결(baljuoraCategoryMap)을 먼저, 없으면 'DB센터 → 발주오라' 연결(categoryMap)을 거꾸로 봅니다.
export function doogoCategoryForBaljuora(categoryIds: string[] | undefined, categoryMap: Record<string, string>, baljuoraCategoryMap: Record<string, string>, categories: BaljuoraCategory[], usable: (doogoId: string) => boolean = () => true) {
  if (!categoryIds || categoryIds.length === 0) return null;
  const parentOf = new Map(categories.map((category) => [category.id, category.parentId]));
  const byBaljuora = new Map<string, string[]>();
  for (const [doogoId, baljuoraId] of Object.entries(categoryMap)) byBaljuora.set(baljuoraId, [...(byBaljuora.get(baljuoraId) ?? []), doogoId]);
  for (const id of categoryIds) {
    let current: string | null | undefined = id;
    for (let depth = 0; current && depth < 10; depth += 1) {
      const direct = baljuoraCategoryMap[current];
      if (direct && usable(direct)) return direct;
      const viaForward = (byBaljuora.get(current) ?? []).find(usable);
      if (viaForward) return viaForward;
      current = parentOf.get(current);
    }
  }
  return null;
}
