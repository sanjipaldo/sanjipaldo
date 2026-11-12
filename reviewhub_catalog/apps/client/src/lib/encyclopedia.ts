// 농수산물 백과사전: 품목 정의·시즌 계산·두고푸드 상품 찾기·분류별 기본 CS/체크리스트/산지 문의 문구.
// 품목 내용(encyclopedia-data.ts)은 두고푸드가 직접 정리한 참고용 정보입니다(지역·해마다 시기가 달라질 수 있음).
import { PRODUCE_ITEMS } from "./encyclopedia-data";

export const PRODUCE_CATEGORIES = ["과일", "채소", "버섯·나물", "곡물·견과", "수산"] as const;
export type ProduceCategory = (typeof PRODUCE_CATEGORIES)[number];

// 1~12월 한 글자씩: K 성수기 · H 출하(수확해 내보내는 때) · E 끝물 · S 저장 판매 · P 준비 기간(산지 연락) · - 비수기
export type SeasonPhase = "K" | "H" | "E" | "S" | "P" | "-";
export type ProduceCs = { q: string; a: string };
export type ProduceTone = "red" | "orange" | "yellow" | "green" | "purple" | "brown" | "blue" | "pink";

export type ProduceItem = {
  id: string;
  name: string;
  group: string;
  category: ProduceCategory;
  emoji?: string;
  // 그림 문자가 마땅치 않은 품목은 글자 타일(예: "감", "무")
  glyph?: string;
  // 썸네일 바탕색(없으면 분류 기본색)
  tone?: ProduceTone;
  season: string;
  ship: "상온" | "냉장" | "냉동";
  risk: "낮음" | "보통" | "높음";
  // 위탁판매 초보 셀러 추천도 1~5
  level: 1 | 2 | 3 | 4 | 5;
  keyword: string;
  origin?: string;
  tip: string;
  cs?: ProduceCs[];
  // 두고푸드 상품명에서 찾을 말(띄어쓰기·대소문자 무시). pattern이 있으면 상품명 원문에 정규식으로 찾습니다.
  match?: string[];
  exclude?: string[];
  pattern?: string;
};

export const SALES_PHASES: SeasonPhase[] = ["K", "H", "E", "S"];

export const PHASE_META: Record<SeasonPhase, { label: string; status: string }> = {
  K: { label: "성수기", status: "성수기" },
  H: { label: "출하", status: "출하 중" },
  E: { label: "끝물", status: "끝물" },
  S: { label: "저장 판매", status: "저장 판매" },
  P: { label: "준비 기간", status: "준비 기간 · 산지 연락" },
  "-": { label: "비수기", status: "비수기" }
};

export const LEVEL_LABELS: Record<ProduceItem["level"], string> = {
  5: "초보 셀러 강력 추천",
  4: "초보 셀러 추천",
  3: "무난하게 시작",
  2: "경험을 쌓은 뒤 도전",
  1: "전문 셀러용"
};

const CATEGORY_TONE: Record<ProduceCategory, ProduceTone> = { 과일: "red", 채소: "green", "버섯·나물": "brown", "곡물·견과": "yellow", 수산: "blue" };
export const produceTone = (item: ProduceItem) => item.tone ?? CATEGORY_TONE[item.category];

export const produceItems: ProduceItem[] = PRODUCE_ITEMS;
const itemById = new Map(produceItems.map((item) => [item.id, item]));
export const findProduceItem = (id: string | undefined) => (id ? itemById.get(id) : undefined);

export function seasonPhases(item: ProduceItem): SeasonPhase[] {
  return Array.from({ length: 12 }, (_, index) => {
    const phase = item.season[index] as SeasonPhase | undefined;
    return phase && phase in PHASE_META ? phase : "-";
  });
}

export const phaseOf = (item: ProduceItem, month: number) => seasonPhases(item)[month - 1] ?? "-";

export function monthsWith(item: ProduceItem, phases: SeasonPhase[]) {
  return seasonPhases(item).flatMap((phase, index) => (phases.includes(phase) ? [index + 1] : []));
}

export const salesMonths = (item: ProduceItem) => monthsWith(item, SALES_PHASES);
export const peakMonths = (item: ProduceItem) => monthsWith(item, ["K"]);

// [10,11,12,1,2] → "10~2월", [3,4,9,10] → "3~4월 · 9~10월", 12개월 → "연중"
export function formatMonthRange(months: number[]) {
  const set = new Set(months);
  if (set.size === 0) return "-";
  if (set.size === 12) return "연중";
  const ranges: Array<[number, number]> = [];
  // 이어지지 않는 달(앞 달이 빠진 달)에서 시작해 한 바퀴 돌며 구간을 만듭니다(12월 → 1월로 이어짐).
  const starts = [...set].filter((month) => !set.has(month === 1 ? 12 : month - 1)).sort((a, b) => a - b);
  for (const start of starts) {
    let end = start;
    while (set.has(end === 12 ? 1 : end + 1)) end = end === 12 ? 1 : end + 1;
    ranges.push([start, end]);
  }
  return ranges.map(([start, end]) => (start === end ? `${start}월` : `${start}~${end}월`)).join(" · ");
}

// 산지 연락 시기: 준비 기간(P)이 있으면 그 달, 없으면 첫 판매 달의 1~2달 전, 연중 품목은 "연중"
export function contactMonths(item: ProduceItem) {
  const prep = monthsWith(item, ["P"]);
  if (prep.length > 0) return prep;
  const sales = new Set(salesMonths(item));
  if (sales.size === 0 || sales.size === 12) return [];
  const firstSale = [...sales].find((month) => !sales.has(month === 1 ? 12 : month - 1)) ?? 1;
  const before = (month: number, gap: number) => ((month - gap - 1 + 12) % 12) + 1;
  return [before(firstSale, 2), before(firstSale, 1)].filter((month) => !sales.has(month));
}

export function contactLabel(item: ProduceItem) {
  const months = contactMonths(item);
  return months.length === 0 ? "연중(필요할 때)" : formatMonthRange(months);
}

export const normalizeText = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, "").toLowerCase();

// 두고푸드 상품명이 이 품목인지: pattern(정규식, 상품명 원문) 또는 match 단어 중 하나 포함(띄어쓰기 무시) + exclude 단어 없음
const patternCache = new Map<string, RegExp | null>();
function itemPattern(item: ProduceItem) {
  if (!item.pattern) return null;
  if (!patternCache.has(item.id)) {
    try {
      patternCache.set(item.id, new RegExp(item.pattern));
    } catch {
      patternCache.set(item.id, null);
    }
  }
  return patternCache.get(item.id) ?? null;
}

// 가공·건강식품 상품은 신선 품목과 잇지 않습니다(신선 카테고리에 섞여 있어도).
const PROCESSED_WORDS = ["진액", "젤리", "콜라겐", "분말", "캡슐", "엑기스", "사과즙", "배즙", "포도즙", "양파즙", "당근즙", "호박즙", "양배추즙"];

export function matchesProduceItem(item: ProduceItem, productName: string, key = normalizeText(productName)) {
  if (PROCESSED_WORDS.some((word) => key.includes(word))) return false;
  if (item.exclude?.some((word) => key.includes(normalizeText(word)))) return false;
  if (item.pattern) return itemPattern(item)?.test(productName) ?? false;
  return (item.match ?? [item.name]).some((word) => key.includes(normalizeText(word)));
}

// 상품 목록을 품목별로 나눕니다(한 상품이 여러 품목에 들어갈 수 있음: 예) 호두말이 곶감 → 곶감).
export function groupProductsByProduce<T extends { name: string }>(products: T[], items: ProduceItem[] = produceItems) {
  const keyed = products.map((product) => ({ product, key: normalizeText(product.name) }));
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const matched = keyed.filter(({ product, key }) => matchesProduceItem(item, product.name, key)).map(({ product }) => product);
    if (matched.length > 0) grouped.set(item.id, matched);
  }
  return grouped;
}

// 신선 농수산물 카테고리(농산·수산·선물세트·축산·과일·채소)의 상품만 백과사전과 연결합니다(건강식품 "레몬 ○○" 같은 상품 제외).
export const isFreshCategoryName = (name: string | null | undefined) => /농산|수산|선물|축산|과일|채소/.test(name ?? "");

// 단가표 검색어로 쓸 대표 단어(그 품목 상품을 단가표에서 바로 찾을 때)
export const catalogSearchWord = (item: ProduceItem) => item.match?.[0] ?? item.name;

// 함께 보면 좋은 품목: 같은 묶음 → 같은 분류 중 성수기가 겹치는 품목 → 같은 분류
export function relatedProduceItems(item: ProduceItem, limit = 8) {
  const peaks = new Set(peakMonths(item));
  const score = (other: ProduceItem) => {
    if (other.group === item.group) return 0;
    if (other.category === item.category && peakMonths(other).some((month) => peaks.has(month))) return 1;
    if (other.category === item.category) return 2;
    return 3;
  };
  return produceItems
    .filter((other) => other.id !== item.id && score(other) < 3)
    .sort((first, second) => score(first) - score(second) || second.level - first.level)
    .slice(0, limit);
}

// 고른 달의 품목을 단계별로 나눕니다(달력 화면).
export function itemsForMonth(month: number) {
  const groups: Record<"K" | "H" | "SE" | "P", ProduceItem[]> = { K: [], H: [], SE: [], P: [] };
  for (const item of produceItems) {
    const phase = phaseOf(item, month);
    if (phase === "K") groups.K.push(item);
    else if (phase === "H") groups.H.push(item);
    else if (phase === "S" || phase === "E") groups.SE.push(item);
    else if (phase === "P") groups.P.push(item);
  }
  return groups;
}

const DEFAULT_CS: Record<ProduceCategory, ProduceCs[]> = {
  과일: [
    { q: "당도가 기대보다 낮아요", a: "산지에서 잰 당도(브릭스)를 숫자로 적고, 시즌 처음과 끝물에는 맛이 덜할 수 있다는 안내를 구매 전에 보이게 두세요." },
    { q: "사진보다 크기가 작아요", a: "한 상자 과수와 개당 무게 범위를 숫자로 적고, 손이나 자를 함께 찍은 실제 크기 사진을 쓰세요." },
    { q: "눌리고 멍든 과일이 섞여 왔어요", a: "칸막이·완충재 포장인지 산지에 확인하고, 도착 당일 사진 접수 → 부분 환불처럼 보상 순서를 미리 정해 두세요." }
  ],
  채소: [
    { q: "도착하니 시들었어요", a: "수확 후 바로 출고하는지, 더운 철에는 아이스팩을 넣는지 산지와 정하고, 받는 즉시 냉장 보관하라고 적으세요." },
    { q: "표기보다 무게가 적어요", a: "흙·손질 전 무게인지 판매 무게인지 기준을 밝히고, 산지에 3~5% 정도 여유 중량을 요청하세요." },
    { q: "흙이 너무 많이 묻어 있어요", a: "흙·세척·손질 상태를 사진으로 보여 주고, 흙째 보내야 오래 간다는 이유를 함께 적으세요." }
  ],
  "버섯·나물": [
    { q: "봉지 안에 물이 맺히고 물러졌어요", a: "숨 쉬는 포장과 냉장 배송인지 확인하고, 받는 날 바로 손질·보관하도록 보관법을 적으세요." },
    { q: "색이 변했어요", a: "품질과 상관없는 색 변화(갈변)와 상한 것을 구분하는 기준을 사진으로 안내하세요." },
    { q: "양이 생각보다 적어요", a: "손질 전·후 어느 무게인지, 한 봉이 몇 g인지 분명히 적으세요." }
  ],
  "곡물·견과": [
    { q: "벌레가 나왔어요", a: "도정·선별 날짜를 적고 서늘한 곳(또는 냉장) 보관법을 안내하세요. 개봉 전 사진 접수 기준도 정해 두세요." },
    { q: "쩐내(산패) 냄새가 나요", a: "생산 연도와 보관 방법(냉동 보관 권장)을 적고, 오래된 재고가 섞이지 않는지 산지에 확인하세요." },
    { q: "국산이 맞나요?", a: "원산지를 상품명과 상세 위쪽에 크게 적고, 필요하면 산지에서 원산지·이력 자료를 받아 두세요." }
  ],
  수산: [
    { q: "비린내가 심하고 신선하지 않아요", a: "잡은 날·가공한 날과 냉장/냉동 유통 방식을 적고, 받는 즉시 손질·보관하도록 안내하세요." },
    { q: "얼음 무게까지 포함된 것 같아요", a: "냉동품은 해동 후 실제 무게인지, 얼음(글레이징)을 포함한 무게인지 분명히 적으세요." },
    { q: "도착했는데 녹아 있었어요(죽어 있었어요)", a: "아이스박스·드라이아이스 또는 활 포장 여부와 배송 시간을 확인하고, 사진 접수 보상 기준을 미리 정하세요." }
  ]
};

export const produceCs = (item: ProduceItem) => item.cs ?? DEFAULT_CS[item.category];

const CHECK_COMMON = [
  "공급가에 택배비·포장비가 들어가는지",
  "등급(특·상·중)별 크기·무게 기준과 가격",
  "하루 출고 가능한 양과 주문 마감·출고 시간",
  "상하거나 깨졌을 때 보상 방법"
];
const CHECK_BY_CATEGORY: Record<ProduceCategory, string> = {
  과일: "당도(브릭스) 기준과 선물 포장 가능 여부",
  채소: "세척·손질 여부와 더운 철 보냉 포장",
  "버섯·나물": "냉장 배송 가능 여부와 보관 기간",
  "곡물·견과": "생산(도정) 날짜와 보관 방법",
  수산: "냉장·냉동·활 배송 방법과 아이스박스 비용"
};

export const produceChecklist = (item: ProduceItem) => [...CHECK_COMMON, CHECK_BY_CATEGORY[item.category], "상세페이지용 사진·인증 자료 사용 허락"];

// 산지 문의 메시지(복사해서 문자·카톡으로 보냄)
export function produceInquiryMessage(item: ProduceItem) {
  const sales = formatMonthRange(salesMonths(item));
  const peaks = peakMonths(item);
  return [
    "사장님, 안녕하세요.",
    `${item.name} 위탁판매(산지 직송)를 준비하고 있는 온라인 셀러입니다.`,
    "",
    "[판매 계획]",
    "· 판매처: 스마트스토어 등 온라인 쇼핑몰",
    `· 판매 시기: ${sales}${peaks.length > 0 ? ` (특히 ${formatMonthRange(peaks)})` : ""}`,
    "",
    "[확인 부탁드립니다]",
    "· 판매 단위별 공급가 — 택배비·포장비 포함인지",
    "· 크기·등급을 나누는 기준",
    "· 하루 보내실 수 있는 양, 주문 마감·출고 시간",
    "· 상하거나 깨졌을 때 처리 방법",
    "· 상세페이지에 쓸 사진·인증 자료",
    "",
    "가능하시면 견적과 함께 회신 부탁드립니다. 감사합니다."
  ].join("\n");
}
