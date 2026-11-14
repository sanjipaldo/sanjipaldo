// 건강식품 백과사전: 고객 고민(증상 대신 "고민"으로 부릅니다 — 질병 표현을 피하기 위해) → 팔기 좋은 원료 → 써도 되는 문구·안 되는 문구 →
// 두고푸드 보유 상품. 원료의 기능성 문구는 식약처 건강기능식품 기준을 요약한 예시이고, 실제 판매 문구는 제품 포장 표시를 따릅니다.
// 자료(고민·원료 내용)는 health-encyclopedia-data.ts, 이 파일은 타입·분류·상품 연결·검색 계산입니다.
import { HEALTH_CONCERNS, HEALTH_INGREDIENTS } from "./health-encyclopedia-data";

export type HealthIngredientType = "functional" | "nutrient" | "individual" | "food";
export type HealthGroupId = "head" | "vessel" | "gut" | "body" | "defense" | "life" | "weight";

export type HealthIngredient = {
  id: string;
  name: string;
  aka?: string;
  icon: string; // 그림 문자 또는 짧은 글자(예: "MSM")
  type: HealthIngredientType;
  claims: string[]; // 건강기능식품 제품일 때 쓸 수 있는 기능성 문구(일반식품은 빈 목록)
  claimNote?: string;
  forms: string; // 주로 나오는 형태
  point: string; // 판매 포인트
  caution: string; // 섭취·판매 주의
  cs: { q: string; a: string };
  pair?: string[]; // 함께 팔기 좋은 원료 id
  keyword: string; // 대표 검색어(네이버·단가표 검색)
  match: string[]; // 두고푸드 상품명에 이 단어가 있으면 연결(띄어쓰기·대소문자 무시)
  exclude?: string[];
  pattern?: string; // 정규식(상품명 원문)
  ok?: string[]; // 일반식품: 이렇게 소개해요
  ng?: string[]; // 일반식품: 이런 말은 안 돼요
};

export type HealthConcern = {
  id: string;
  name: string;
  emoji: string;
  group: HealthGroupId;
  desc: string;
  keywords: string[]; // 고객이 검색하는 말
  target: string; // 주 고객
  months: number[]; // 많이 찾는 달(빈 목록 = 연중)
  seasonNote: string;
  ingredients: string[]; // 팔기 좋은 원료(건강기능식품 원료·영양소·개별인정) 순서대로
  foods?: string[]; // 고객이 함께 찾는 상품(일반식품 등, 효능 표현 주의)
  ok: string[]; // 상세페이지에 이렇게 쓰세요
  ng: string[]; // 이런 말은 안 돼요
  tip: string;
  related: string[];
};

export const HEALTH_TYPE_META: Record<HealthIngredientType, { label: string; hint: string; claimTitle: string }> = {
  functional: {
    label: "기능성 원료",
    hint: "식약처가 기능성을 정해 둔 원료예요. 포장에 '건강기능식품' 표시가 있는 제품이면 아래 문구를 쓸 수 있어요.",
    claimTitle: "건강기능식품 제품이면 쓸 수 있는 문구"
  },
  nutrient: {
    label: "영양소",
    hint: "비타민·미네랄 같은 영양소예요. 기준량 이상 든 건강기능식품이면 영양소 기능 문구를 쓸 수 있어요.",
    claimTitle: "영양소 기능 문구"
  },
  individual: {
    label: "제품마다 확인",
    hint: "제품마다 따로 인정받은 문구만 쓸 수 있어요. 같은 원료라도 일반식품으로 나온 제품은 기능성 표현을 할 수 없어요.",
    claimTitle: "인정받은 제품의 문구 예시"
  },
  food: {
    label: "일반식품",
    hint: "건강기능식품이 아니라서 효능·효과를 말할 수 없어요. 원재료·원산지·함량·맛·먹는 법으로 소개해요.",
    claimTitle: "일반식품이라 효능을 말할 수 없어요"
  }
};

export const HEALTH_TYPES: HealthIngredientType[] = ["functional", "nutrient", "individual", "food"];

export const HEALTH_GROUPS: Array<{ id: HealthGroupId; name: string; emoji: string }> = [
  { id: "head", name: "머리·눈", emoji: "🧠" },
  { id: "vessel", name: "혈관·혈당", emoji: "❤️" },
  { id: "gut", name: "장·간", emoji: "🌿" },
  { id: "body", name: "뼈·근육·활력", emoji: "🦴" },
  { id: "defense", name: "면역·피부·구강", emoji: "🛡️" },
  { id: "life", name: "여성·남성", emoji: "👫" },
  { id: "weight", name: "체중 관리", emoji: "⚖️" }
];

export const HEALTH_DISCLAIMER =
  "건강식품 백과사전은 판매 아이디어를 위한 참고 자료예요. 기능성 문구는 식약처 건강기능식품 기준을 요약한 예시이고, 실제 판매 문구는 제품 포장의 표시사항과 표시·광고 심의 결과를 따르세요. 질병을 예방·치료하는 의약품이 아니며, 질병·약 복용 상담은 의사·약사에게 안내해 주세요.";

export const GENERIC_HEALTH_CS = {
  q: "먹는 약이 있는데 같이 먹어도 되나요?",
  a: "괜찮다고 단정하지 말고, 복용 중인 약이 있으면 의사·약사와 상담한 뒤 먹도록 안내하세요."
};

export const healthIngredients: HealthIngredient[] = HEALTH_INGREDIENTS;
export const healthConcerns: HealthConcern[] = HEALTH_CONCERNS;

const ingredientById = new Map(healthIngredients.map((item) => [item.id, item]));
const concernById = new Map(healthConcerns.map((item) => [item.id, item]));

export const findHealthIngredient = (id?: string) => (id ? ingredientById.get(id) : undefined);
export const findHealthConcern = (id?: string) => (id ? concernById.get(id) : undefined);
export const healthGroupOf = (id: HealthGroupId) => HEALTH_GROUPS.find((group) => group.id === id) ?? HEALTH_GROUPS[0];

const pick = (ids: string[] = []) => ids.map((id) => ingredientById.get(id)).filter((item): item is HealthIngredient => Boolean(item));
export const coreIngredientsOf = (concern: HealthConcern) => pick(concern.ingredients);
export const foodIngredientsOf = (concern: HealthConcern) => pick(concern.foods);

// 이 원료가 나오는 고민(팔기 좋은 원료로 나오는 고민 먼저, 함께 찾는 상품으로 나오는 고민은 뒤에)
export function concernsOfIngredient(id: string) {
  const core = healthConcerns.filter((concern) => concern.ingredients.includes(id));
  const extra = healthConcerns.filter((concern) => !concern.ingredients.includes(id) && concern.foods?.includes(id));
  return [...core, ...extra];
}

export const relatedConcernsOf = (concern: HealthConcern) =>
  concern.related.map((id) => concernById.get(id)).filter((item): item is HealthConcern => Boolean(item));

export const concernsForMonth = (month: number) => healthConcerns.filter((concern) => concern.months.includes(month));

export function formatConcernMonths(concern: HealthConcern) {
  if (concern.months.length === 0) return "연중";
  return [...concern.months].sort((first, second) => first - second).map((month) => `${month}월`).join(" · ");
}

// ── 두고푸드 상품 연결 ───────────────────────────────────────────────
// 건강식품 카테고리(이름에 "건강") 상품만 잇습니다. 화장품·생활용품·반려동물 상품은 이름에 원료가 있어도 잇지 않습니다.
const NON_FOOD_WORDS = ["크림", "세럼", "비누", "치약", "칫솔", "로션", "샴푸", "마스크팩", "물병", "에코백", "타월", "알약케이스", "강아지", "반려", "고양이"];
const compact = (value: string) => value.replace(/\s+/g, "").toLowerCase();

export const isHealthCategoryName = (name?: string) => Boolean(name && name.includes("건강"));

export function matchesHealthIngredient(item: HealthIngredient, productName: string) {
  const text = compact(productName);
  if (NON_FOOD_WORDS.some((word) => text.includes(word))) return false;
  if (item.exclude?.some((word) => text.includes(compact(word)))) return false;
  if (item.match.some((word) => text.includes(compact(word)))) return true;
  return item.pattern ? new RegExp(item.pattern, "i").test(productName) : false;
}

// 원료마다 두고푸드 상품을 묶습니다. 복합 제품(예: 루테인+오메가3)은 들어 있는 원료마다 들어갑니다.
export function groupProductsByIngredient<T extends { name: string; categoryId: string }>(
  products: T[],
  categoryNameById?: Map<string, string>,
  items: HealthIngredient[] = healthIngredients
) {
  const grouped = new Map<string, T[]>();
  for (const product of products) {
    if (categoryNameById && !isHealthCategoryName(categoryNameById.get(product.categoryId))) continue;
    for (const item of items) {
      if (!matchesHealthIngredient(item, product.name)) continue;
      const list = grouped.get(item.id);
      if (list) list.push(product);
      else grouped.set(item.id, [product]);
    }
  }
  return grouped;
}

// 고민의 팔기 좋은 원료에 이어진 상품(겹치는 상품은 한 번만)
export function concernProductCount<T extends { id: string }>(concern: HealthConcern, grouped: Map<string, T[]>) {
  const ids = new Set<string>();
  for (const id of concern.ingredients) for (const product of grouped.get(id) ?? []) ids.add(product.id);
  return ids.size;
}

// ── 검색 ─────────────────────────────────────────────────────────────
export function searchHealth(query: string) {
  const word = compact(query);
  if (!word) return { concerns: [] as HealthConcern[], ingredients: [] as HealthIngredient[] };
  const hit = (values: Array<string | undefined>) => values.some((value) => value && compact(value).includes(word));
  const concerns = healthConcerns.filter((concern) => hit([concern.name, concern.desc, ...concern.keywords, healthGroupOf(concern.group).name]));
  const ingredients = healthIngredients.filter((item) => hit([item.name, item.aka, item.keyword, ...item.match]));
  return { concerns, ingredients };
}

export const healthIconLength = (icon: string) => (/\p{Extended_Pictographic}/u.test(icon) ? 0 : Array.from(icon).length);
