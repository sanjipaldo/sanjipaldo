// 발주오라 수동 동기화 공용 규칙(서버·관리자 화면 공용, 2026-11-22 관리자 요청).
// 발주오라는 공개 API가 없고 관리자 로그인에 사람 확인(Cloudflare)이 있어, 서버가 대신 로그인하지 않습니다.
// 관리자가 로그인해 둔 발주오라 관리자 창에서 책갈피 "두고푸드 동기화"(public/baljuora-sync.js)를 누르면
// 그 창이 DB센터가 만든 작업(비교 또는 보내기)을 실행하고 결과를 돌려줍니다.
// 이 파일은 "무엇이 다른가"를 정하는 규칙만 둡니다(값 정리·비교·방향).

import { normalizeDeadline, type ProductExtras } from "./product-extras";

export const BALJUORA_CONSOLE_ORIGIN = "https://console.baljuora.com";
export const BALJUORA_DEFAULT_MERCHANT_SLUG = "doogobiz24";
// 수강생 단가는 발주오라 매출처 그룹 중 이름에 이 단어가 들어간 그룹의 공급가입니다(단가관리 엑셀과 같은 기준).
export const BALJUORA_DEFAULT_GROUP_KEYWORD = "황금농부";
export const BALJUORA_JOB_TTL_MINUTES = 30;
// 작업 코드: 헷갈리는 글자(0·O·1·I·L)를 뺀 32글자 중 10글자(약 50비트), 화면에는 5-5로 나눠 보여 줍니다.
export const BALJUORA_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const BALJUORA_CODE_LENGTH = 10;

export type BaljuoraCoreField = "name" | "supplyPrice" | "groupPrice" | "consumerPrice" | "purchaseCost" | "category" | "image" | "shippingPolicy";
// 상품 정보 칸(2026-11-26 관리자 요청 "발주오라 상품관리자 페이지와 빠지는 거 없이 양방향으로"): 판매 상태(품절·도매몰 노출)와
// 발주오라 상품 등록 화면의 칸. DB센터 값은 products 칸(품절·시즌종료·노출·원산지·택배사·배송유형)과 product_extras(migration 037)에 있습니다.
export type BaljuoraExtraField =
  | "soldOut" | "visible" | "taxable" | "origin" | "managementCode" | "barcode" | "content" | "purchaseName" | "purchaseQuantity"
  | "shippingUnit" | "purchaseDeadline" | "certification" | "summary" | "shippingLocation" | "manufacturingDate" | "expirationDate"
  | "courier" | "tradeType";
export type BaljuoraSyncField = BaljuoraCoreField | BaljuoraExtraField;
export const BALJUORA_CORE_FIELDS: BaljuoraCoreField[] = ["name", "supplyPrice", "groupPrice", "consumerPrice", "purchaseCost", "category", "image", "shippingPolicy"];
export const BALJUORA_EXTRA_FIELDS: BaljuoraExtraField[] = [
  "soldOut", "visible", "taxable", "origin", "managementCode", "barcode", "content", "purchaseName", "purchaseQuantity",
  "shippingUnit", "purchaseDeadline", "certification", "summary", "shippingLocation", "manufacturingDate", "expirationDate", "courier", "tradeType"
];
export const BALJUORA_SYNC_FIELDS: BaljuoraSyncField[] = [...BALJUORA_CORE_FIELDS, ...BALJUORA_EXTRA_FIELDS];
export const BALJUORA_PRICE_FIELDS: BaljuoraSyncField[] = ["supplyPrice", "groupPrice", "consumerPrice", "purchaseCost"];
// 판매 상태(발주오라 상품 화면 "판매 상태: 도매몰 노출 · 품절")
export const BALJUORA_STATUS_FIELDS: BaljuoraExtraField[] = ["soldOut", "visible"];
// 인증은 발주오라에서 인증번호와 함께 관리해 가져오기만 합니다(DB센터에서 보내지 않음).
export const BALJUORA_PULL_ONLY_FIELDS: BaljuoraSyncField[] = ["certification"];
// 해외배송은 DB센터 배송유형(국내/해외 카테고리)으로 정해져 보내기만 합니다(가져오면 카테고리까지 바뀌어야 함).
export const BALJUORA_PUSH_ONLY_FIELDS: BaljuoraSyncField[] = ["tradeType"];

export function isExtraField(field: BaljuoraSyncField): field is BaljuoraExtraField {
  return (BALJUORA_EXTRA_FIELDS as string[]).includes(field);
}

// 화면 이름: 발주오라 칸 ← DB센터 칸
export const BALJUORA_FIELD_LABELS: Record<BaljuoraSyncField, string> = {
  name: "상품명",
  supplyPrice: "공급가 ← 일반공급가",
  groupPrice: "그룹 공급가 ← 수강생 단가",
  consumerPrice: "소비자가 ← 지정 판매가",
  purchaseCost: "매입원가 ← 원가",
  category: "카테고리",
  image: "대표 이미지",
  shippingPolicy: "매출배송정책 ← 배송 정책",
  soldOut: "품절 ← 판매 상태(품절·시즌종료)",
  visible: "도매몰 노출 ← 공개 노출",
  taxable: "과세 여부",
  origin: "원산지",
  managementCode: "관리코드",
  barcode: "바코드",
  content: "내용량",
  purchaseName: "발주상품명",
  purchaseQuantity: "발주단위",
  shippingUnit: "배송 단위",
  purchaseDeadline: "발주마감",
  certification: "인증(발주오라에서 가져오기만)",
  summary: "상품 간략설명",
  shippingLocation: "출고지",
  manufacturingDate: "제조연월일",
  expirationDate: "소비기한",
  courier: "택배사",
  tradeType: "해외배송 ← 배송유형(보내기만)"
};
export const BALJUORA_FIELD_SHORT_LABELS: Record<BaljuoraSyncField, string> = {
  name: "상품명",
  supplyPrice: "공급가",
  groupPrice: "수강생 단가",
  consumerPrice: "소비자가",
  purchaseCost: "매입원가",
  category: "카테고리",
  image: "이미지",
  shippingPolicy: "배송비 정책",
  soldOut: "품절",
  visible: "노출",
  taxable: "과세",
  origin: "원산지",
  managementCode: "관리코드",
  barcode: "바코드",
  content: "내용량",
  purchaseName: "발주상품명",
  purchaseQuantity: "발주단위",
  shippingUnit: "배송 단위",
  purchaseDeadline: "발주마감",
  certification: "인증",
  summary: "간략설명",
  shippingLocation: "출고지",
  manufacturingDate: "제조연월일",
  expirationDate: "소비기한",
  courier: "택배사",
  tradeType: "해외배송"
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
  // 발주오라 등록일시(책갈피 1.11.0부터) · 비교 때 발주오라 상품 목록에서의 순서(0 = 맨 위 = 가장 최근 등록).
  // DB센터 상품 리스트의 '발주오라 번호'(발주오라 상품 리스트 줄 앞 숫자와 같음)에 씁니다. undefined = 읽지 못함.
  createdAt?: string | null;
  position?: number;
  // 과세 여부(1.7.0부터 읽음). undefined = 읽지 못함. 홈택스 세금계산서(과세)/계산서(면세) 나누기에 씀.
  isTaxable?: boolean;
  // 상품 정보 칸(책갈피 1.9.0부터 읽음). undefined = 읽지 못함(예전 책갈피·목록만 읽음). 안쪽 칸이 undefined면 그 칸이 응답에 없음.
  extra?: BaljuoraSnapshotExtra;
};

// 발주오라 상품 정보 칸(발주오라 응답 칸 이름 그대로: originText·description·contentAmountBasis 등)
export type BaljuoraSnapshotExtra = {
  originText?: string | null;
  managementCode?: string | null;
  barcode?: string | null;
  contentAmount?: number | null;
  contentUnit?: string | null;
  contentCount?: number | null;
  contentBasis?: string | null;
  purchaseName?: string | null;
  // 발주상품명이 들어 있던 칸 이름(purchaseProductName 또는 purchaseName)
  purchaseNameKey?: string | null;
  purchaseQuantity?: number | null;
  shippingUnitType?: string | null;
  shippingUnitValue?: number | null;
  purchaseDeadline?: string | null;
  certificationKinds?: string[] | null;
  description?: string | null;
  shippingLocation?: string | null;
  manufacturingDate?: string | null;
  expirationDate?: string | null;
  courier?: string | null;
  tradeType?: string | null;
  taxonomyItemId?: string | null;
  taxonomyName?: string | null;
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
  // 판매 상태·상품 정보 칸(없으면 그 칸은 비교하지 않음)
  isVisible?: boolean;
  isSoldOut?: boolean;
  isSeasonEnded?: boolean;
  origin?: string | null;
  courier?: string | null;
  shippingType?: string;
  // product_extras 값. null = 표가 아직 없음(037 전 DB) → 그 칸들은 비교하지 않음
  extras?: ProductExtras | null;
  // 과세 여부 자동값(카테고리 기준). extras.isTaxable이 null일 때 씀
  taxableDefault?: boolean;
};

// 발주오라에 보낼 상품 정보 칸(발주오라 칸 이름). 칸이 없으면 그 칸을 모름(보내지 않음).
export type BaljuoraPushExtra = {
  isSoldOut?: boolean;
  isVisible?: boolean;
  isTaxable?: boolean;
  originText?: string | null;
  managementCode?: string | null;
  barcode?: string | null;
  contentAmount?: number | null;
  contentUnit?: string | null;
  contentCount?: number | null;
  contentBasis?: string | null;
  purchaseName?: string | null;
  purchaseQuantity?: number | null;
  shippingUnitType?: string | null;
  shippingUnitValue?: number | null;
  purchaseDeadline?: string | null;
  description?: string | null;
  shippingLocation?: string | null;
  manufacturingDate?: string | null;
  expirationDate?: string | null;
  courier?: string | null;
  tradeType?: string | null;
  taxonomyItemId?: string | null;
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
  // 상품 정보 칸 비교용 값(undefined = 모름 → 비교 안 함)과 보낼 값
  extra: Partial<Record<BaljuoraExtraField, string | number | null>>;
  extraPush: BaljuoraPushExtra;
  // 과세 여부를 DB센터에서 직접 정했는지(false = 카테고리 자동값 → 비어 있는 것으로 봄)
  taxableExplicit: boolean;
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
  // 상품 정보 칸: 그쪽 값이 비어 있음(빈 값으로는 상대 값을 지우지 않습니다 — 그쪽에서 직접 지운 경우만)
  doogoEmpty?: boolean;
  baljuoraEmpty?: boolean;
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

// ─── 상품 정보 칸 비교 값(양쪽 같은 모양으로 바꿔 비교) ─────────────────────────────

export function syncText(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  return collapseName(value) || null;
}

// 날짜 칸: 발주오라가 날짜를 "2026-11-01T00:00:00.000Z"처럼 돌려줘도 "2026-11-01"과 같게 봅니다.
export function syncDateText(value: unknown) {
  const text = syncText(value);
  if (!text) return null;
  const iso = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}/u.exec(text);
  return iso ? iso[1] : text;
}

function decimalOrNull(value: unknown, decimals = 2) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(/,/gu, "").trim());
  if (!Number.isFinite(number) || number <= 0) return null;
  const scale = 10 ** decimals;
  return Math.round(number * scale) / scale;
}

// 내용량: "전체 양|단위|개수|기준(total·each)" (개수만 있거나 양만 있어도 됨)
export function contentComparable(amount: unknown, unit: unknown, count: unknown, basis: unknown) {
  const value = decimalOrNull(amount);
  const unitText = value !== null && typeof unit === "string" && unit.trim() ? unit.trim() : null;
  const countValue = decimalOrNull(count, 0);
  if ((value === null || unitText === null) && countValue === null) return null;
  const basisText = basis === "each" && countValue !== null && countValue > 1 ? "each" : "total";
  return [unitText ? value : "", unitText ?? "", countValue ?? "", basisText].join("|");
}

// 배송 단위: "box|1"
export function shippingUnitComparable(type: unknown, value: unknown) {
  const amount = decimalOrNull(value);
  return typeof type === "string" && type.trim() && amount !== null ? `${type.trim()}|${amount}` : null;
}

// 발주단위: 1(기본)은 비어 있는 것과 같게 봅니다.
export function purchaseQuantityComparable(value: unknown) {
  const number = decimalOrNull(value, 0);
  return number !== null && number > 1 ? number : null;
}

export function certificationComparable(kinds: unknown) {
  if (!Array.isArray(kinds)) return null;
  const list = [...new Set(kinds.filter((kind): kind is string => typeof kind === "string" && Boolean(kind.trim())).map((kind) => kind.trim()))].sort();
  return list.length > 0 ? list.join(",") : null;
}

// 택배사: 발주오라가 택배사를 코드(영문)로 저장하면 이름과 비교할 수 없어 비교하지 않습니다(한글 이름일 때만).
export function courierComparable(value: unknown) {
  const text = syncText(value);
  if (text === null) return null;
  return /[가-힣]/u.test(text) ? text : undefined;
}

const flag = (value: boolean) => (value ? 1 : 0);

function doogoExtraValues(product: DoogoProductForSync) {
  const extra: Partial<Record<BaljuoraExtraField, string | number | null>> = {};
  const push: BaljuoraPushExtra = {};
  if (typeof product.isSoldOut === "boolean") {
    const soldOut = product.isSoldOut || product.isSeasonEnded === true;
    extra.soldOut = flag(soldOut);
    push.isSoldOut = soldOut;
  }
  if (typeof product.isVisible === "boolean") {
    extra.visible = flag(product.isVisible);
    push.isVisible = product.isVisible;
  }
  if (product.origin !== undefined) {
    extra.origin = syncText(product.origin);
    push.originText = extra.origin;
  }
  if (product.courier !== undefined) {
    const courier = syncText(product.courier);
    extra.courier = courier;
    push.courier = courier;
  }
  if (product.shippingType !== undefined) {
    extra.tradeType = product.shippingType === "overseas" ? "overseas" : null;
    push.tradeType = extra.tradeType;
  }
  const extras = product.extras;
  const taxableExplicit = Boolean(extras && typeof extras.isTaxable === "boolean");
  const taxable = extras && typeof extras.isTaxable === "boolean" ? extras.isTaxable : product.taxableDefault;
  if (typeof taxable === "boolean") {
    extra.taxable = flag(taxable);
    push.isTaxable = taxable;
  }
  if (extras) {
    extra.managementCode = syncText(extras.managementCode);
    extra.barcode = syncText(extras.barcode);
    extra.content = contentComparable(extras.contentAmount, extras.contentUnit, extras.contentCount, extras.contentBasis);
    extra.purchaseName = syncText(extras.purchaseName);
    extra.purchaseQuantity = purchaseQuantityComparable(extras.purchaseQuantity);
    extra.shippingUnit = shippingUnitComparable(extras.shippingUnitType, extras.shippingUnitValue);
    extra.purchaseDeadline = normalizeDeadline(extras.purchaseDeadline);
    extra.certification = certificationComparable(extras.certificationKinds);
    extra.summary = syncText(extras.summary);
    extra.shippingLocation = syncText(extras.shippingLocation);
    extra.manufacturingDate = syncDateText(extras.manufacturingDate);
    extra.expirationDate = syncDateText(extras.expirationDate);
    Object.assign(push, {
      managementCode: extra.managementCode,
      barcode: extra.barcode,
      contentAmount: extra.content ? extras.contentAmount : null,
      contentUnit: extra.content ? extras.contentUnit : null,
      contentCount: extra.content ? extras.contentCount : null,
      contentBasis: extra.content ? extras.contentBasis ?? "total" : null,
      purchaseName: extra.purchaseName,
      purchaseQuantity: extras.purchaseQuantity ?? null,
      shippingUnitType: extra.shippingUnit ? extras.shippingUnitType : null,
      shippingUnitValue: extra.shippingUnit ? extras.shippingUnitValue : null,
      purchaseDeadline: extra.purchaseDeadline,
      description: extra.summary,
      shippingLocation: extra.shippingLocation,
      manufacturingDate: extra.manufacturingDate,
      expirationDate: extra.expirationDate,
      taxonomyItemId: extras.taxonomyItemId ?? null
    } satisfies BaljuoraPushExtra);
  }
  return { extra, push, taxableExplicit };
}

export function doogoSyncValues(product: DoogoProductForSync, categoryMap: Record<string, string>, shippingPolicyMap: Record<string, string> = {}, baljuoraCategoryMap: Record<string, string> = {}): DoogoSyncValues {
  const generalPrice = toPrice(product.generalPrice) ?? 0;
  const aPrice = priceOrNull(product.aPrice);
  const extraValues = doogoExtraValues(product);
  return {
    extra: extraValues.extra,
    extraPush: extraValues.push,
    taxableExplicit: extraValues.taxableExplicit,
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
    shippingPolicy: values.shippingPolicyId,
    ...(values.extra ?? {})
  };
}

// 발주오라 상품 정보 칸 비교 값(읽지 못한 칸은 undefined)
export function baljuoraExtraComparable(snapshot: BaljuoraProductSnapshot): Partial<Record<BaljuoraExtraField, string | number | null>> {
  const result: Partial<Record<BaljuoraExtraField, string | number | null>> = {};
  if (typeof snapshot.isSoldOut === "boolean") result.soldOut = flag(snapshot.isSoldOut);
  if (typeof snapshot.isVisible === "boolean") result.visible = flag(snapshot.isVisible);
  if (typeof snapshot.isTaxable === "boolean") result.taxable = flag(snapshot.isTaxable);
  const extra = snapshot.extra;
  if (!extra || typeof extra !== "object") return result;
  const has = (key: keyof BaljuoraSnapshotExtra) => extra[key] !== undefined;
  if (has("originText")) result.origin = syncText(extra.originText);
  if (has("managementCode")) result.managementCode = syncText(extra.managementCode);
  if (has("barcode")) result.barcode = syncText(extra.barcode);
  if (has("contentAmount") || has("contentCount")) result.content = contentComparable(extra.contentAmount, extra.contentUnit, extra.contentCount, extra.contentBasis);
  if (has("purchaseName")) result.purchaseName = syncText(extra.purchaseName);
  if (has("purchaseQuantity")) result.purchaseQuantity = purchaseQuantityComparable(extra.purchaseQuantity);
  if (has("shippingUnitType") || has("shippingUnitValue")) result.shippingUnit = shippingUnitComparable(extra.shippingUnitType, extra.shippingUnitValue);
  if (has("purchaseDeadline")) result.purchaseDeadline = normalizeDeadline(extra.purchaseDeadline);
  if (has("certificationKinds")) result.certification = certificationComparable(extra.certificationKinds);
  if (has("description")) result.summary = syncText(extra.description);
  if (has("shippingLocation")) result.shippingLocation = syncText(extra.shippingLocation);
  if (has("manufacturingDate")) result.manufacturingDate = syncDateText(extra.manufacturingDate);
  if (has("expirationDate")) result.expirationDate = syncDateText(extra.expirationDate);
  if (has("courier")) {
    const courier = courierComparable(extra.courier);
    if (courier !== undefined) result.courier = courier;
  }
  if (has("tradeType")) result.tradeType = syncText(extra.tradeType) ? "overseas" : null;
  return result;
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
    shippingPolicy: snapshot.shippingPolicyId === undefined ? undefined : snapshot.shippingPolicyId ?? null,
    ...baljuoraExtraComparable(snapshot)
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
  diffs.push(...diffExtraFields(values, baljuora, baseline));
  const ignored = state.ignored ?? {};
  return diffs.filter((diff) => {
    const entry = ignored[diff.field];
    return !entry || entry.doogo !== diff.doogo || entry.baljuora !== diff.baljuora;
  });
}

// 상품 정보 칸이 비어 있는지(빈 값으로는 상대 값을 지우지 않음). 품절·노출·해외배송은 늘 값이 있는 칸입니다.
// 과세 여부는 DB센터에서 직접 정하지 않았으면(카테고리 자동값) 비어 있는 것으로 봅니다.
export function extraValueIsEmpty(field: BaljuoraExtraField, value: string | number | null | undefined, side: "doogo" | "baljuora", taxableExplicit = true) {
  if (field === "soldOut" || field === "visible" || field === "tradeType") return false;
  if (field === "taxable" && side === "doogo") return !taxableExplicit;
  return value === null || value === undefined;
}

// 상품 정보 칸 비교 규칙(2026-11-26):
// - 한쪽이라도 읽지 못한 칸은 비교하지 않습니다.
// - 처음부터 다른 칸(initial)은 저절로 보내지 않습니다. DB센터가 비어 있으면 발주오라 값을 가져올 변경(pull)으로 올리고,
//   발주오라가 품절이면 품절을 가져올 변경으로 올립니다. 그 밖(양쪽 값이 다름·도매몰 노출)은 관리자가 '맞추기'에서 방향을 고릅니다.
// - 인증은 가져오기만, 해외배송은 보내기만 합니다.
function diffExtraFields(values: DoogoSyncValues, baljuora: BaljuoraBaseline["baljuora"], baseline: BaljuoraBaseline | null): BaljuoraFieldDiff[] {
  const doogo = values.extra ?? {};
  const result: BaljuoraFieldDiff[] = [];
  for (const field of BALJUORA_EXTRA_FIELDS) {
    const doogoValue = doogo[field];
    const baljuoraValue = baljuora[field];
    if (doogoValue === undefined || baljuoraValue === undefined || doogoValue === baljuoraValue) continue;
    const doogoEmpty = extraValueIsEmpty(field, doogoValue, "doogo", values.taxableExplicit);
    const baljuoraEmpty = extraValueIsEmpty(field, baljuoraValue, "baljuora");
    let direction = directionFor(field, doogoValue, baljuoraValue, baseline);
    if (BALJUORA_PULL_ONLY_FIELDS.includes(field)) direction = "pull";
    else if (BALJUORA_PUSH_ONLY_FIELDS.includes(field)) direction = direction === "both" ? "push" : direction === "pull" ? "initial" : direction;
    else if (direction === "initial" && ((doogoEmpty && !baljuoraEmpty) || (field === "soldOut" && baljuoraValue === 1))) direction = "pull";
    result.push({ field, doogo: doogoValue, baljuora: baljuoraValue, direction, doogoEmpty, baljuoraEmpty });
  }
  return result;
}

// DB센터 → 발주오라로 보낼 수 있는 차이인지. explicit = 관리자가 이 칸을 골라 보냄('DB센터에서 바꿈'·'DB센터 기준으로 맞추기').
// 가격·상품명 등 원래 칸은 예전과 같고(고르지 않으면 '발주오라에서 바뀜'만 뺌), 상품 정보 칸은 DB센터에서 바꾼 칸(push·both)만 저절로 보내고
// 고른 칸이라도 DB센터 값이 비어 있으면 보내지 않습니다(발주오라 값을 지우지 않게).
export function canPushDiff(diff: BaljuoraFieldDiff, explicit: boolean) {
  if (!isExtraField(diff.field)) return explicit || diff.direction !== "pull";
  if (BALJUORA_PULL_ONLY_FIELDS.includes(diff.field)) return false;
  if (diff.direction === "push" || diff.direction === "both") return true;
  return explicit && !diff.doogoEmpty;
}

// 발주오라 → DB센터로 가져올 수 있는 차이인지(explicit = '발주오라 기준으로 맞추기'에서 고른 칸).
export function canPullDiff(diff: BaljuoraFieldDiff, explicit: boolean) {
  if (!isExtraField(diff.field)) return explicit || diff.direction === "pull" || diff.direction === "both";
  if (BALJUORA_PUSH_ONLY_FIELDS.includes(diff.field)) return false;
  if (diff.direction === "pull" || diff.direction === "both") return true;
  return explicit && !diff.baljuoraEmpty;
}

// 예전 기준(새 칸이 생기기 전 저장)에 없는 상품 정보 칸은 지금 양쪽 값으로 채웁니다(그 뒤 바뀐 쪽을 알 수 있게).
export function fillBaselineGaps(baseline: BaljuoraBaseline, values: DoogoSyncValues, snapshot: BaljuoraProductSnapshot): BaljuoraBaseline {
  const doogo = doogoComparable(values);
  const baljuora = baljuoraComparable(snapshot);
  let changed = false;
  const next: BaljuoraBaseline = { ...baseline, doogo: { ...baseline.doogo }, baljuora: { ...baseline.baljuora } };
  for (const field of BALJUORA_EXTRA_FIELDS) {
    if (next.doogo[field] !== undefined || next.baljuora[field] !== undefined) continue;
    if (doogo[field] === undefined || baljuora[field] === undefined) continue;
    next.doogo[field] = doogo[field];
    next.baljuora[field] = baljuora[field];
    changed = true;
  }
  return changed ? next : baseline;
}

// 보내기·가져오기 뒤 새 기준: 이번에 맞춘 칸은 지금 값으로 바꾸고, 맞추지 않았는데 아직 다른 칸(keep)은 예전 기준을 그대로 둡니다
// (그래야 '발주오라에서 바뀜'·'DB센터에서 바뀜'이 다른 칸을 보낸 뒤에도 '처음부터 다름'으로 바뀌지 않음).
export function carryBaseline(previous: BaljuoraBaseline | null | undefined, fresh: BaljuoraBaseline, keep: Iterable<BaljuoraSyncField>): BaljuoraBaseline {
  if (!previous) return fresh;
  const next: BaljuoraBaseline = { ...fresh, doogo: { ...fresh.doogo }, baljuora: { ...fresh.baljuora } };
  for (const field of keep) {
    if (previous.doogo[field] === undefined && previous.baljuora[field] === undefined) continue;
    next.doogo[field] = previous.doogo[field];
    next.baljuora[field] = previous.baljuora[field];
  }
  return next;
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

// ─── 카테고리 트리 맞추기(DB센터 → 발주오라 상품 카테고리, 2026-11-23 관리자 요청) ─────────────────
// DB센터 1차·2차 카테고리를 기준으로 발주오라 상품 카테고리 트리에 없는 카테고리를 추가하고 이름이 다르면 DB센터 이름으로 바꿉니다.
// 발주오라 카테고리는 지우지 않습니다(DB센터에 없는 발주오라 카테고리는 그대로 둠).
// 발주오라 1차 카테고리 중 아래 이름(이모지·띄어쓰기 무시)은 통째로 뺍니다: 브랜드별(1차 > 2차 > 3차 브랜드라 DB센터와 맞지 않음).
export const DEFAULT_CATEGORY_TREE_EXCLUDE = ["브랜드별"];

export type DoogoCategoryRef = { id: string; name: string; sortOrder?: number };
export type DoogoSubcategoryRef = { id: string; categoryId: string; name: string; sortOrder?: number };
export type CategoryTreeOp =
  | { type: "rename"; level: 1 | 2; baljuoraId: string; from: string; to: string; doogoId: string }
  | { type: "add"; level: 1 | 2; ref: string; name: string; doogoId: string; parentBaljuoraId: string | null; parentRef: string | null };
export type CategoryTreePlan = {
  ops: CategoryTreeOp[];
  // 이름이 같아 새로 만들지 않고 연결만 하는 것(DB센터 id → 발주오라 id)
  links: { categoryMap: Record<string, string>; subcategoryMap: Record<string, string> };
  // 발주오라에만 있는 카테고리(맞추기에서 지우지 않음, 제외한 브랜드별 아래는 넣지 않음)
  baljuoraOnly: Array<{ id: string; path: string }>;
  // 제외한 발주오라 1차 카테고리 이름(브랜드별)
  excluded: string[];
  notes: Array<{ doogoId: string; name: string; reason: string }>;
};

export function isExcludedCategoryName(name: string, excludeNames: string[]) {
  const key = plainCategoryName(name);
  return Boolean(key) && excludeNames.some((exclude) => plainCategoryName(exclude) === key);
}

// 제외한 발주오라 1차 카테고리(브랜드별)와 그 아래 모든 카테고리 id
export function excludedBaljuoraCategoryIds(categories: BaljuoraCategory[], excludeNames: string[]) {
  const roots = new Set(categories.filter((category) => category.parentId === null && isExcludedCategoryName(category.name, excludeNames)).map((category) => category.id));
  const parentOf = new Map(categories.map((category) => [category.id, category.parentId]));
  const result = new Set<string>();
  for (const category of categories) {
    let current: string | null | undefined = category.id;
    for (let depth = 0; current && depth < 10; depth += 1) {
      if (roots.has(current)) {
        result.add(category.id);
        break;
      }
      current = parentOf.get(current);
    }
  }
  return result;
}

const byOrder = <T extends { sortOrder?: number; name: string }>(first: T, second: T) => (first.sortOrder ?? 0) - (second.sortOrder ?? 0) || first.name.localeCompare(second.name, "ko");

export function buildCategoryTreePlan(input: {
  doogoCategories: DoogoCategoryRef[];
  subcategories: DoogoSubcategoryRef[];
  baljuoraCategories: BaljuoraCategory[];
  categoryMap: Record<string, string>;
  subcategoryMap: Record<string, string>;
  excludeNames: string[];
}): CategoryTreePlan {
  const { baljuoraCategories: list, excludeNames } = input;
  const byId = new Map(list.map((category) => [category.id, category]));
  const excludedIds = excludedBaljuoraCategoryIds(list, excludeNames);
  const plan: CategoryTreePlan = { ops: [], links: { categoryMap: {}, subcategoryMap: {} }, baljuoraOnly: [], excluded: list.filter((category) => category.parentId === null && excludedIds.has(category.id)).map((category) => category.name), notes: [] };
  const used = new Map<string, string>();
  const parents = new Map<string, { baljuoraId: string | null; ref: string | null }>();
  const sameName = (name: string, parentId: string | null) => list.find((category) => category.parentId === parentId && !excludedIds.has(category.id) && !used.has(category.id) && plainCategoryName(category.name) === plainCategoryName(name));
  // 발주오라는 카테고리 이름이 트리 전체에서 겹치면 안 됩니다(앞뒤 공백·대소문자 무시 — 책갈피 planTreeSave와 같은 규칙).
  // 2026-11-27 직원 신고: '💊 국내 건강식품' 이름 변경이 "같은 이름의 카테고리가 이미 있어 바꾸지 않았습니다"로 매번 못 한 것 1건으로 남고
  // 'DB센터에서 바꾼 것 · 카테고리 1건'이 0이 되지 않았습니다. 발주오라가 받지 않는 이름 변경·추가는 보낼 것(ops)에 넣지 않고 이유(notes)로 보여 줍니다.
  const treeNameKey = (name: string) => name.trim().toLowerCase();
  const plannedNames = new Set<string>();
  const nameClash = (name: string, except: string | null) => list.find((category) => category.id !== except && treeNameKey(category.name) === treeNameKey(name))
    ?? (plannedNames.has(treeNameKey(name)) ? { id: "", name, path: name } as Pick<BaljuoraCategory, "id" | "name" | "path"> : undefined);
  const clashReason = (clash: Pick<BaljuoraCategory, "id" | "path">, action: string) => clash.id
    ? `발주오라에 같은 이름의 카테고리 '${clash.path}'가 이미 있어 ${action}(발주오라는 카테고리 이름이 겹치면 안 됩니다). 이름을 맞추려면 발주오라에서 '${clash.path}'의 이름을 바꾸거나, 동기화 설정 > 카테고리 연결에서 보낼 곳을 바꿔 주세요.`
    : `같은 이름의 DB센터 카테고리가 먼저 보내져 ${action}(발주오라는 카테고리 이름이 겹치면 안 됩니다).`;

  for (const category of [...input.doogoCategories].sort(byOrder)) {
    if (isExcludedCategoryName(category.name, excludeNames)) continue;
    const mapped = input.categoryMap[category.id];
    let node = mapped ? byId.get(mapped) : undefined;
    if (node && excludedIds.has(node.id)) {
      plan.notes.push({ doogoId: category.id, name: category.name, reason: "제외한 발주오라 카테고리(브랜드별 아래)와 연결돼 있어 맞추지 않습니다." });
      continue;
    }
    if (node && node.parentId !== null) {
      // 상품을 발주오라 2차 카테고리로 보내도록 연결한 경우: 그 카테고리는 이 DB센터 1차 카테고리가 아니라서 이름·2차는 맞추지 않습니다.
      plan.notes.push({ doogoId: category.id, name: category.name, reason: `발주오라 '${node.path}'(1차가 아님)에 연결돼 있어 이름과 2차 카테고리는 맞추지 않습니다.` });
      continue;
    }
    if (!node) {
      node = sameName(category.name, null);
      if (node) plan.links.categoryMap[category.id] = node.id;
    }
    if (node) {
      if (used.has(node.id)) {
        plan.notes.push({ doogoId: category.id, name: category.name, reason: `다른 DB센터 카테고리(${used.get(node.id)})와 같은 발주오라 카테고리에 연결돼 있어 맞추지 않습니다.` });
        continue;
      }
      used.set(node.id, category.name);
      parents.set(category.id, { baljuoraId: node.id, ref: null });
      if (node.name.trim() !== category.name.trim()) {
        const clash = nameClash(category.name, node.id);
        if (clash) plan.notes.push({ doogoId: category.id, name: category.name, reason: `${clashReason(clash, `연결된 발주오라 '${node.path}'의 이름은 바꾸지 않습니다`)} 상품은 지금처럼 '${node.path}'로 보내요.` });
        else {
          plannedNames.add(treeNameKey(category.name));
          plan.ops.push({ type: "rename", level: 1, baljuoraId: node.id, from: node.name, to: category.name.trim(), doogoId: category.id });
        }
      }
    } else {
      const clash = nameClash(category.name, null);
      if (clash) {
        // 1차를 만들 수 없으면 그 아래 2차도 보내지 않습니다(parents에 넣지 않음).
        plan.notes.push({ doogoId: category.id, name: category.name, reason: clashReason(clash, "새로 추가하지 않습니다") });
        continue;
      }
      const ref = `c:${category.id}`;
      parents.set(category.id, { baljuoraId: null, ref });
      plannedNames.add(treeNameKey(category.name));
      plan.ops.push({ type: "add", level: 1, ref, name: category.name.trim(), doogoId: category.id, parentBaljuoraId: null, parentRef: null });
    }
  }

  const categoryOrder = new Map([...input.doogoCategories].sort(byOrder).map((category, index) => [category.id, index]));
  const subs = input.subcategories.filter((sub) => parents.has(sub.categoryId)).sort((first, second) => (categoryOrder.get(first.categoryId) ?? 0) - (categoryOrder.get(second.categoryId) ?? 0) || byOrder(first, second));
  for (const sub of subs) {
    const parent = parents.get(sub.categoryId)!;
    const mapped = input.subcategoryMap[sub.id];
    let node = mapped ? byId.get(mapped) : undefined;
    if (node && excludedIds.has(node.id)) {
      plan.notes.push({ doogoId: sub.id, name: sub.name, reason: "제외한 발주오라 카테고리(브랜드별 아래)와 연결돼 있어 맞추지 않습니다." });
      continue;
    }
    if (!node && parent.baljuoraId) {
      node = sameName(sub.name, parent.baljuoraId);
      if (node) plan.links.subcategoryMap[sub.id] = node.id;
    }
    if (node) {
      if (used.has(node.id)) {
        plan.notes.push({ doogoId: sub.id, name: sub.name, reason: `다른 DB센터 카테고리(${used.get(node.id)})와 같은 발주오라 카테고리에 연결돼 있어 맞추지 않습니다.` });
        continue;
      }
      used.set(node.id, sub.name);
      if (parent.baljuoraId && node.parentId !== parent.baljuoraId) plan.notes.push({ doogoId: sub.id, name: sub.name, reason: `발주오라에서는 '${node.path}'에 있어 위치는 바꾸지 않습니다.` });
      if (node.name.trim() !== sub.name.trim()) {
        const clash = nameClash(sub.name, node.id);
        if (clash) plan.notes.push({ doogoId: sub.id, name: sub.name, reason: clashReason(clash, `연결된 발주오라 '${node.path}'의 이름은 바꾸지 않습니다`) });
        else {
          plannedNames.add(treeNameKey(sub.name));
          plan.ops.push({ type: "rename", level: 2, baljuoraId: node.id, from: node.name, to: sub.name.trim(), doogoId: sub.id });
        }
      }
    } else {
      const clash = nameClash(sub.name, null);
      if (clash) {
        plan.notes.push({ doogoId: sub.id, name: sub.name, reason: clashReason(clash, "새로 추가하지 않습니다") });
        continue;
      }
      plannedNames.add(treeNameKey(sub.name));
      plan.ops.push({ type: "add", level: 2, ref: `s:${sub.id}`, name: sub.name.trim(), doogoId: sub.id, parentBaljuoraId: parent.baljuoraId, parentRef: parent.ref });
    }
  }
  plan.baljuoraOnly = list.filter((category) => !excludedIds.has(category.id) && !used.has(category.id)).map((category) => ({ id: category.id, path: category.path }));
  return plan;
}

// DB센터로 가져올 수 있는 발주오라 2차 카테고리: DB센터 1차 카테고리와 연결된 발주오라 1차 카테고리 바로 아래 카테고리 중
// 아직 DB센터 2차 카테고리와 연결되지 않은 것(브랜드별 아래 제외). 가져오면 같은 이름으로 DB센터 2차 카테고리를 만들고 연결합니다.
export function importableBaljuoraSubcategories(input: {
  doogoCategories: DoogoCategoryRef[];
  subcategories: DoogoSubcategoryRef[];
  baljuoraCategories: BaljuoraCategory[];
  categoryMap: Record<string, string>;
  subcategoryMap: Record<string, string>;
  excludeNames: string[];
}) {
  const plan = buildCategoryTreePlan(input);
  const excludedIds = excludedBaljuoraCategoryIds(input.baljuoraCategories, input.excludeNames);
  const rootToDoogo = new Map<string, string>();
  for (const category of input.doogoCategories) {
    if (isExcludedCategoryName(category.name, input.excludeNames)) continue;
    const root = input.categoryMap[category.id] ?? plan.links.categoryMap[category.id];
    const node = root ? input.baljuoraCategories.find((item) => item.id === root) : undefined;
    if (node && node.parentId === null && !excludedIds.has(node.id) && !rootToDoogo.has(node.id)) rootToDoogo.set(node.id, category.id);
  }
  const represented = new Set([...Object.values(input.subcategoryMap), ...Object.values(plan.links.subcategoryMap)]);
  return input.baljuoraCategories
    .filter((category) => category.parentId !== null && rootToDoogo.has(category.parentId) && !excludedIds.has(category.id) && !represented.has(category.id))
    .map((category) => ({ baljuoraId: category.id, name: category.name, path: category.path, doogoCategoryId: rootToDoogo.get(category.parentId as string) as string }));
}
