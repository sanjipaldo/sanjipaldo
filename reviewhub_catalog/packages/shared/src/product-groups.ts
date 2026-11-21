// 옵션 묶음 공용 규칙(서버·화면 공용, 2026-11-21 관리자 요청).
// 두고푸드는 사이즈·등급마다 상품을 따로 등록합니다(발주오라 상품코드와 1:1). 공개 단가표는 같은 상품의 사이즈들을
// "옵션 묶음"으로 묶어 카드 하나와 옵션 팝업으로 보여 줍니다. 상품 데이터(가격·품절·노출)는 상품마다 그대로입니다.
// - optionLabelsFor: 묶음 안 상품명에서 모두 같은 앞뒤 단어를 빼서 옵션 이름을 만듭니다(관리자가 직접 쓴 이름이 있으면 그 이름).
// - groupBaseName / suggestProductGroups: 무게·개수·등급을 뺀 기본 이름이 같은 상품을 묶음 후보로 추천합니다.

export const STUDENT_PRICE_LABEL = "수강생 단가";
export const GENERAL_PRICE_LABEL = "일반공급가";
// 공개 가격 흐름 그래프에 보여 줄 날짜 수(오늘 포함, 한국 날짜)
export const PRICE_TREND_DAYS = 7;

// 공개 단가표(/api/catalog)에 함께 내려가는 묶음 요약. 상품 순서는 관리자가 정한 옵션 순서입니다.
export type PublicProductGroup = {
  id: string;
  name: string;
  imageUrl: string | null;
  categoryId: string | null;
  productIds: string[];
  // 관리자가 직접 쓴 옵션 이름(상품 ID → 이름). 없으면 상품명에서 자동으로 만듭니다.
  optionLabels?: Record<string, string>;
  // 상세페이지·사진 자료 링크(있을 때만)
  materialsUrl?: string;
  // 자동 묶음(관리자가 저장한 묶음이 아니라, 이름이 비슷한 상품을 묶음 추천 규칙으로 자동으로 묶어 보여 주는 것. DB에 없음)
  auto?: boolean;
};

// "따로 보이기": 자동 묶음에서 뺀 상품 ID 목록. content_settings `product_group_exclusions` = {"ids":[…]}
export const PRODUCT_GROUP_EXCLUSIONS_KEY = "product_group_exclusions";

export function parseGroupExclusions(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as { ids?: unknown };
    if (!Array.isArray(parsed.ids)) return [];
    return [...new Set(parsed.ids.filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

// 옵션 팝업(/api/catalog/options/:productId): 묶음 안내 문구와 옵션별 최근 7일 가격 흐름
export type ProductOptionTrend = {
  // days와 같은 순서의 하루 끝 가격(일반공급가 / 수강생 단가)
  general: number[];
  student: number[];
  // 지금 가격과 그 가격이 적용된 날(한국 날짜). 가격 변동 기록이 없으면 상품 등록일입니다.
  current: { general: number; student: number; since: string };
  // 마지막 가격 변경 직전 가격. 변경 기록이 없으면 null
  previous: { general: number; student: number; changedAt: string } | null;
};

export type ProductOptionsDetail = {
  group: {
    id: string;
    name: string;
    imageUrl: string | null;
    description: string | null;
    shippingNote: string | null;
    materialsUrl: string | null;
    auto?: boolean;
  } | null;
  productIds: string[];
  optionLabels: Record<string, string>;
  today: string;
  days: string[];
  trends: Record<string, ProductOptionTrend>;
};

// 사이즈·등급을 나타내는 단어(묶음 추천의 기본 이름에서 뺍니다)
const GRADE_WORDS = new Set([
  "특특대", "특대", "특상", "왕특", "대과", "중과", "소과", "중대", "한입", "로얄", "꼬마",
  "가정용", "선물용", "실속형", "실속", "대", "중", "소", "특", "상", "왕"
]);
const UNIT = "(?:kg|키로|그램|g|ml|리터|l|cm|mm|개입|개|입|구|팩|봉지|봉|박스|box|세트|송이|단|망|통|병|포|매|ea|마리|토막|뿌리|년산|수|인분|줄|장|알|판|미|과)";
const QUANTITY = new RegExp(`(?:총\\s*)?\\d+(?:[.,]\\d+)?(?:\\s*[~-]\\s*\\d+(?:[.,]\\d+)?)?\\s*${UNIT}?(?:\\s*(?:내외|이상|이하|전후|정도))?`, "giu");
const BRACKET_WITH_NUMBER = /[([{][^()[\]{}]*\d[^()[\]{}]*[)\]}]/gu;
const CONNECTOR_TOKEN = /^[x×*+/,·~\-–]+$/iu;

function collapse(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

// 무게·개수·등급을 뺀 기본 이름. 예) "(비세척) 여주 꿀고구마 중1kg (베니하루카)" → "(비세척) 여주 꿀고구마 (베니하루카)"
export function groupBaseName(name: string) {
  const withoutNumbers = collapse(name)
    .replace(BRACKET_WITH_NUMBER, " ")
    .replace(/\((?:특특대|특대|특상|대|중|소|특|상|왕|한입|로얄|꼬마)\)/gu, " ")
    .replace(QUANTITY, " ")
    .replace(/[([{]\s*[)\]}]/gu, " ");
  const tokens = collapse(withoutNumbers).split(" ").filter((token) => token && !GRADE_WORDS.has(token) && !CONNECTOR_TOKEN.test(token));
  return collapse(tokens.join(" ")).replace(/^[\s/+·,~-]+|[\s/+·,~-]+$/gu, "");
}

export function groupBaseKey(name: string) {
  return groupBaseName(name).replace(/\s+/gu, "").toLowerCase();
}

// 묶음 추천·자동 묶음에서 "같은 상품"으로 보는 기준: 배송유형 + 카테고리 + 기본 이름
export function productGroupKey(product: { name: string; categoryId: string | null; shippingType: string }) {
  return `${product.shippingType}|${product.categoryId ?? ""}|${groupBaseKey(product.name)}`;
}

export type GroupSuggestionProduct = { id: string; name: string; categoryId: string | null; shippingType: string };
export type ProductGroupSuggestion = { key: string; name: string; categoryId: string | null; productIds: string[] };

// 아직 묶지 않은 상품 중 기본 이름·카테고리·배송유형이 같은 상품(2개 이상)을 묶음 후보로 돌려줍니다. 많은 순서.
export function suggestProductGroups(products: GroupSuggestionProduct[]): ProductGroupSuggestion[] {
  const buckets = new Map<string, { name: string; categoryId: string | null; productIds: string[] }>();
  for (const product of products) {
    const baseKey = groupBaseKey(product.name);
    if (!baseKey) continue;
    const key = `${product.shippingType}|${product.categoryId ?? ""}|${baseKey}`;
    const bucket = buckets.get(key) ?? { name: groupBaseName(product.name), categoryId: product.categoryId, productIds: [] };
    bucket.productIds.push(product.id);
    buckets.set(key, bucket);
  }
  return Array.from(buckets.entries())
    .filter(([, bucket]) => bucket.productIds.length >= 2)
    .map(([key, bucket]) => ({ key, ...bucket }))
    .sort((first, second) => second.productIds.length - first.productIds.length || first.name.localeCompare(second.name, "ko"));
}

function commonCharPrefix(values: string[]) {
  if (values.length === 0) return "";
  let prefix = values[0];
  for (const value of values.slice(1)) {
    let index = 0;
    while (index < prefix.length && index < value.length && prefix[index] === value[index]) index += 1;
    prefix = prefix.slice(0, index);
  }
  return prefix;
}

function cleanLabel(value: string) {
  let label = collapse(value).replace(/^[\s/+·,~-]+|[\s/+·,~-]+$/gu, "");
  // 이름 전체가 괄호 하나로 감싸져 있으면 괄호를 벗깁니다. 예) "(5kg)" → "5kg"
  const wrapped = label.match(/^[([]([^()[\]]+)[)\]]$/u);
  if (wrapped) label = wrapped[1].trim();
  return label;
}

// 묶음 안 상품명에서 모두 같은 앞뒤 단어를 빼서 옵션 이름을 만듭니다.
// 예) "(비세척) 여주 꿀고구마 대 10kg (베니하루카)", "(비세척) 여주 꿀고구마 중1kg (베니하루카)" → "대 10kg", "중1kg"
export function autoOptionLabels(names: string[]) {
  const cleanNames = names.map(collapse);
  if (cleanNames.length <= 1) return cleanNames;
  const tokenLists = cleanNames.map((name) => name.split(" ").filter(Boolean));
  const minLength = Math.min(...tokenLists.map((tokens) => tokens.length));
  let prefix = 0;
  while (prefix < minLength - 1 && tokenLists.every((tokens) => tokens[prefix] === tokenLists[0][prefix])) prefix += 1;
  let suffix = 0;
  while (
    suffix < minLength - 1 - prefix
    && tokenLists.every((tokens) => tokens[tokens.length - 1 - suffix] === tokenLists[0][tokenLists[0].length - 1 - suffix])
  ) suffix += 1;
  let middles = tokenLists.map((tokens) => tokens.slice(prefix, tokens.length - suffix).join(" "));
  // 띄어쓰기 없이 붙은 이름(꿀고구마1kg / 꿀고구마2kg): 모두 같은 두 글자 이상으로 시작하고 바로 뒤가 숫자면 그 글자를 뺍니다.
  const sharedStart = commonCharPrefix(middles);
  if (sharedStart.length >= 2 && !/\d$/u.test(sharedStart) && middles.every((middle) => /^\d/u.test(middle.slice(sharedStart.length)))) {
    middles = middles.map((middle) => middle.slice(sharedStart.length));
  }
  return middles.map((middle, index) => cleanLabel(middle) || cleanNames[index]);
}

// 옵션 이름: 관리자가 쓴 이름이 있으면 그 이름, 없으면 자동 이름
export function optionLabelsFor(names: string[], overrides: Array<string | null | undefined> = []) {
  const auto = autoOptionLabels(names);
  return names.map((_, index) => overrides[index]?.trim() || auto[index]);
}
