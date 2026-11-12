// 농수산물 백과사전: 품목 정의·시즌 계산·두고푸드 상품 찾기·분류별 기본 CS/체크리스트/산지 문의 문구.
// 품목 내용(encyclopedia-data.ts)은 두고푸드가 직접 정리한 참고용 정보입니다(지역·해마다 시기가 달라질 수 있음).
import { PRODUCE_ITEMS } from "./encyclopedia-data";
import { MORE_PRODUCE_ITEMS } from "./encyclopedia-data-more";

export const PRODUCE_CATEGORIES = ["과일", "채소", "버섯·나물", "곡물·견과", "수산", "가공·김장"] as const;
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
  // 재배·형태(노지·하우스·양식·자연산·건조 가공…)와 쓰임 태그(선물·명절·김장·집밥·간식·다이어트·보양·별미·청·담금·홈카페·대용량)
  grow?: string;
  tags?: string[];
  // 가공품(김치·기름·청·젓갈 등): 식품 카테고리 상품과도 잇고, 가공품 제외 단어를 따지지 않습니다.
  processed?: boolean;
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

const CATEGORY_TONE: Record<ProduceCategory, ProduceTone> = { 과일: "red", 채소: "green", "버섯·나물": "brown", "곡물·견과": "yellow", 수산: "blue", "가공·김장": "orange" };
export const produceTone = (item: ProduceItem) => item.tone ?? CATEGORY_TONE[item.category];

export const produceItems: ProduceItem[] = [...PRODUCE_ITEMS, ...MORE_PRODUCE_ITEMS];
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
  if (!item.processed && PROCESSED_WORDS.some((word) => key.includes(word))) return false;
  if (item.exclude?.some((word) => key.includes(normalizeText(word)))) return false;
  if (item.pattern) return itemPattern(item)?.test(productName) ?? false;
  return (item.match ?? [item.name]).some((word) => key.includes(normalizeText(word)));
}

// 상품 목록을 품목별로 나눕니다. categoryNameById를 주면 신선 카테고리(가공품 품목은 식품 카테고리도) 상품만 잇습니다.
// 한 상품이 여러 품목에 들어갈 수 있지만, 운영 상품명 기준으로 겹치지 않게 맞춰 두었습니다(encyclopedia-data.test.ts).
export function groupProductsByProduce<T extends { name: string; categoryId?: string }>(products: T[], categoryNameById?: Map<string, string>, items: ProduceItem[] = produceItems) {
  const keyed = products.map((product) => ({ product, key: normalizeText(product.name), category: categoryNameById && product.categoryId ? categoryNameById.get(product.categoryId) ?? "" : undefined }));
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const matched = keyed
      .filter(({ product, key, category }) => (category === undefined || categoryAllowed(item, category)) && matchesProduceItem(item, product.name, key))
      .map(({ product }) => product);
    if (matched.length > 0) grouped.set(item.id, matched);
  }
  return grouped;
}

// 신선 농수산물 카테고리(농산·수산·선물세트·축산·과일·채소)의 상품만 백과사전과 연결합니다(건강식품 "레몬 ○○" 같은 상품 제외).
export const isFreshCategoryName = (name: string | null | undefined) => /농산|수산|선물|축산|과일|채소/.test(name ?? "");
const categoryAllowed = (item: ProduceItem, categoryName: string) => isFreshCategoryName(categoryName) || (Boolean(item.processed) && /식품/.test(categoryName));

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
  ],
  "가공·김장": [
    { q: "원산지가 어디예요?", a: "원료(배추·고춧가루·깨 등) 원산지를 상품명과 상세 위쪽에 적고, 국산·수입을 섞었다면 비율까지 밝혀 주세요." },
    { q: "유통기한이 짧아요(맛이 변했어요)", a: "제조일·유통기한과 보관 온도를 옵션 옆에 적고, 냉장·냉동 상품은 아이스박스 포장인지 확인하세요." },
    { q: "병·포장이 깨져서 왔어요", a: "유리병·파우치는 완충재와 낱개 포장 여부를 산지에 확인하고, 도착 사진으로 보상하는 기준을 정해 두세요." }
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
  수산: "냉장·냉동·활 배송 방법과 아이스박스 비용",
  "가공·김장": "제조일·유통기한과 원료 원산지 표기"
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

// 두고푸드 도매몰(위탁셀러 주문은 여기서 넣습니다)
export const DOOGO_MALL_URL = "https://shop.baljuora.com/doogofood";

// 이달의 메모(백과사전 홈): 그달 판매 준비에서 챙길 것
export const MONTH_NOTES: Record<number, { title: string; body: string }> = {
  1: { title: "설 선물 택배 마감부터 공지하세요", body: "한라봉·곶감·굴비·전복 같은 설 선물은 연휴 직전에 주문이 몰립니다. 연휴 전 마지막 출고일을 상세와 공지에 크게 적어 두세요." },
  2: { title: "봄나물과 딸기가 성수기에 들어갑니다", body: "달래·냉이·미나리 같은 봄나물과 딸기·대저토마토가 제철입니다. 잎채소는 시들기 쉬우니 출고 요일을 산지와 맞춰 두세요." },
  3: { title: "봄 수산물 시즌 · 조개류는 확인 먼저", body: "알이 찬 주꾸미와 도다리쑥국 세트가 잘 나갑니다. 패류독소 소식이 나오는 때라 조개류는 판매 전에 꼭 확인하세요." },
  4: { title: "짧은 봄나물은 예약 판매로", body: "두릅·엄나무순·명이나물은 1~3주면 끝납니다. 미리 예약을 받고 산지 당일 발송을 약속받으세요." },
  5: { title: "매실·참외·초당옥수수를 준비할 때", body: "6월 매실청 시즌과 초여름 과일 예약을 지금 열어 두세요. 날이 더워지니 보냉 포장 비용도 다시 확인하세요." },
  6: { title: "여름 과일 클레임에 대비하세요", body: "복숭아·자두·살구처럼 무르기 쉬운 과일이 나옵니다. 포장 방식과 도착 사진 접수 기준을 미리 정해 두세요." },
  7: { title: "복날 보양식과 여름 과일", body: "장어·민어·전복 같은 보양식과 수박·복숭아가 성수기입니다. 폭염 기간에는 냉장 상품의 출고 요일을 조정하세요." },
  8: { title: "추석 선물은 지금 산지와 약속하세요", body: "사과·배·샤인머스캣·전복 추석 선물은 지금 물량과 가격을 맞춰야 합니다. 예약 판매 페이지를 미리 만들어 두세요." },
  9: { title: "추석과 가을 수확 시즌", body: "추석 선물이 끝나면 햅쌀·밤·새우·전어가 이어집니다. 연휴 택배 마감과 남는 재고 정리 계획을 함께 세우세요." },
  10: { title: "김장 재료 예약을 받을 때", body: "절임배추·고춧가루·새우젓·김장 양념은 받는 날짜를 지키는 것이 핵심입니다. 감귤·단감·고구마도 본격 출하됩니다." },
  11: { title: "김장 본시즌", body: "절임배추는 고객이 고른 날짜에 도착하는 것이 가장 중요합니다. 굴·꼬막·과메기 같은 겨울 수산물도 시작됩니다." },
  12: { title: "연말 · 설 선물 예약", body: "한라봉·곶감·굴비 세트는 12월부터 설 예약을 받는 셀러가 많습니다. 방어·대게 같은 겨울 별미도 성수기예요." }
};

// 첫 상품 찾기: 질문 4개 답으로 품목 5개를 고르고 이유를 붙입니다(두고푸드 보유 품목에 점수를 더 줌).
export type FinderAnswers = {
  start: number;
  ship: "room" | "chill" | "any";
  skill: "easy" | "some" | "any";
  goal: "gift" | "home" | "doogo" | "any";
};
export type FinderPick = { item: ProduceItem; score: number; reasons: string[] };

const GIFT_TAGS = ["선물", "명절"];
const HOME_TAGS = ["집밥", "간식", "다이어트"];

export function finderWindow(start: number) {
  return [0, 1, 2].map((step) => ((start - 1 + step) % 12) + 1);
}

export function recommendProduce(answers: FinderAnswers, carriedCount: (id: string) => number = () => 0, limit = 5): FinderPick[] {
  const window = finderWindow(answers.start);
  const shipOk = (item: ProduceItem) => answers.ship === "any" || item.ship === "상온" || (answers.ship === "chill" && item.ship === "냉장");
  const skillOk = (item: ProduceItem, skill: FinderAnswers["skill"]) =>
    skill === "any" || (skill === "some" ? item.level >= 3 : item.level >= 4 && item.risk !== "높음");
  const score = (item: ProduceItem) => {
    const phases = window.map((month) => phaseOf(item, month));
    const tags = item.tags ?? [];
    const carried = carriedCount(item.id);
    let value = item.level * 10;
    if (phases.includes("K")) value += 15;
    if (SALES_PHASES.includes(phases[0])) value += 8;
    if (carried > 0) value += answers.goal === "doogo" ? 25 : 10;
    if (answers.goal === "gift" && tags.some((tag) => GIFT_TAGS.includes(tag))) value += 15;
    if (answers.goal === "home" && tags.some((tag) => HOME_TAGS.includes(tag))) value += 12;
    value -= item.risk === "높음" ? 8 : item.risk === "보통" ? 2 : 0;
    return value;
  };
  const reasonsFor = (item: ProduceItem) => {
    const reasons: string[] = [];
    const peak = window.find((month) => phaseOf(item, month) === "K");
    if (peak) reasons.push(`${peak}월 성수기`);
    else {
      const selling = window.find((month) => SALES_PHASES.includes(phaseOf(item, month)));
      if (selling) reasons.push(`${selling}월부터 판매`);
    }
    reasons.push(`${item.ship} 배송`);
    if (item.risk === "낮음") reasons.push("클레임 걱정 적음");
    if (item.level >= 4) reasons.push(`초보 추천 ★${item.level}`);
    // 두고푸드 보유 여부는 결과 카드의 보유 배지(StockBadge)가 보여 주므로 이유에는 넣지 않습니다.
    const tags = item.tags ?? [];
    if (answers.goal === "gift" && tags.some((tag) => GIFT_TAGS.includes(tag))) reasons.push("선물·명절 수요");
    if (answers.goal === "home" && tags.some((tag) => HOME_TAGS.includes(tag))) reasons.push("집밥·간식 수요");
    return reasons;
  };
  const sellableSoon = (item: ProduceItem) => window.some((month) => SALES_PHASES.includes(phaseOf(item, month)));
  const pick = (skill: FinderAnswers["skill"], requireDoogo: boolean) => {
    const perGroup = new Map<string, number>();
    const chosen: FinderPick[] = [];
    const candidates = produceItems
      .filter((item) => sellableSoon(item) && shipOk(item) && skillOk(item, skill) && (!requireDoogo || carriedCount(item.id) > 0))
      .map((item) => ({ item, score: score(item) }))
      .sort((first, second) => second.score - first.score || first.item.name.localeCompare(second.item.name, "ko"));
    for (const candidate of candidates) {
      // 같은 묶음(예: 고구마 3종)은 2개까지만 골라 여러 품목을 보여 줍니다.
      const used = perGroup.get(candidate.item.group) ?? 0;
      if (used >= 2) continue;
      perGroup.set(candidate.item.group, used + 1);
      chosen.push({ ...candidate, reasons: reasonsFor(candidate.item) });
      if (chosen.length >= limit) break;
    }
    return chosen;
  };
  const strict = pick(answers.skill, answers.goal === "doogo");
  if (strict.length >= limit) return strict;
  // 조건이 까다로워 5개가 안 되면 경험 조건을 풀어 채웁니다.
  const relaxed = pick("any", answers.goal === "doogo").filter((candidate) => !strict.some((chosen) => chosen.item.id === candidate.item.id));
  return [...strict, ...relaxed].slice(0, limit);
}

// 네이버 검색량(관리자 > 백과사전 검색량에서 모아 둔 값): 검색어 → 최근 30일 검색수·경쟁·월별 추정
export type ProduceSearchStat = {
  keyword: string;
  pc: number;
  mobile: number;
  total: number;
  comp?: string;
  // 1~12월 추정 검색수(데이터랩 추이 × 최근 30일 검색수), 없으면 비움
  months?: number[];
  related?: Array<[string, number]>;
  updatedAt: string;
};
export type ProduceSearchStats = { updatedAt: string | null; keywords: Record<string, ProduceSearchStat> };
export const searchKeyOf = (keyword: string) => keyword.replace(/\s+/g, "");
