// 농수산물 백과사전 데이터·계산: 시즌 글자, 판매·성수기·산지 연락 달, 두고푸드 상품명 연결(비슷한 이름 가려내기).
import { describe, expect, it } from "vitest";
import {
  PRODUCE_CATEGORIES,
  contactLabel,
  findProduceItem,
  formatMonthRange,
  groupProductsByProduce,
  isFreshCategoryName,
  itemsForMonth,
  matchesProduceItem,
  peakMonths,
  produceChecklist,
  produceCs,
  produceInquiryMessage,
  produceItems,
  relatedProduceItems,
  salesMonths
} from "@/lib/encyclopedia";

const pick = (name: string) => produceItems.filter((item) => matchesProduceItem(item, name)).map((item) => item.id);

describe("백과사전 품목 데이터", () => {
  it("모든 품목: 고유 id · 12달 시즌 · 판매 달 · 썸네일 · 분류 · 추천도 · CS 3개", () => {
    const ids = new Set<string>();
    for (const item of produceItems) {
      expect(ids.has(item.id), item.id).toBe(false);
      ids.add(item.id);
      expect(item.season, item.id).toMatch(/^[KHESP-]{12}$/);
      expect(salesMonths(item).length, item.id).toBeGreaterThan(0);
      expect(Boolean(item.emoji || item.glyph), item.id).toBe(true);
      expect(PRODUCE_CATEGORIES).toContain(item.category);
      expect(item.level).toBeGreaterThanOrEqual(1);
      expect(item.level).toBeLessThanOrEqual(5);
      expect(produceCs(item).length, item.id).toBeGreaterThanOrEqual(3);
      if (item.pattern) expect(() => new RegExp(item.pattern ?? "")).not.toThrow();
      expect(item.grow, item.id).toBeTruthy();
      expect(item.tags?.length, item.id).toBeGreaterThan(0);
    }
    expect(produceItems.length).toBeGreaterThanOrEqual(200);
    expect(PRODUCE_CATEGORIES).toContain("가공·김장");
  });

  it("달 범위를 글자로: 해를 넘기는 구간·두 구간·연중", () => {
    expect(formatMonthRange([10, 11, 12, 1, 2, 3, 4, 5, 6, 7])).toBe("10~7월");
    expect(formatMonthRange([3, 4, 9, 10])).toBe("3~4월 · 9~10월");
    expect(formatMonthRange([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe("연중");
    expect(formatMonthRange([6])).toBe("6월");
    expect(formatMonthRange([])).toBe("-");
  });

  it("부사: 판매 10~7월 · 성수기 11~12월 · 산지 연락 9월, 11월 성수기 목록에 들어감", () => {
    const fuji = findProduceItem("apple-fuji");
    expect(fuji).toBeDefined();
    if (!fuji) return;
    expect(formatMonthRange(salesMonths(fuji))).toBe("10~7월");
    expect(formatMonthRange(peakMonths(fuji))).toBe("11~12월");
    expect(contactLabel(fuji)).toBe("9월");
    expect(itemsForMonth(11).K.map((item) => item.id)).toContain("apple-fuji");
    expect(itemsForMonth(9).P.map((item) => item.id)).toContain("apple-fuji");
    expect(findProduceItem("no-such-item")).toBeUndefined();
  });

  it("두고푸드 상품명 연결: 비슷한 이름은 맞는 품목 하나로만", () => {
    expect(pick("[본] (정품) 부사 사과 (14-16과) 2kg")).toEqual(["apple-fuji"]);
    expect(pick("[본] (세척) 여주 꿀밤고구마 한입 1kg")).toEqual(["sweet-potato-chestnut"]);
    expect(pick("[본] (세척) 여주 꿀고구마 한입1kg (베니하루카)")).toEqual(["sweet-potato-honey"]);
    expect(pick("[본] 고창 풍천 무태장어 생물 1kg(500g) 1-3마리")).toEqual(["eel"]);
    expect(pick("[본] 국내산 무 10kg (10-17개입 내외)")).toEqual(["radish"]);
    expect(pick("[명] 흙 무 3kg")).toEqual(["radish"]);
    expect(pick("[본] 여수 알타리무 3kg")).toEqual(["altari"]);
    expect(pick("[본] 오동나무 산양삼 7-8년산 선물용 / 5뿌리")).toEqual(["sanyangsam"]);
    expect(pick("[본] 대추방울토마토 2kg (1~3번크기 혼합)")).toEqual(["cherry-tomato"]);
    expect(pick("[본] 김포 고시히카리 쌀 10kg 포대X2포")).toEqual(["rice"]);
    expect(pick("[본] 참송이버섯 500g 고급 (A-특A)")).toEqual(["cham-songi"]);
    expect(pick("[본] 충랑포도 보통 1.5kg (4-5송이)")).toEqual(["grape"]);
    expect(pick("[본] 샤인머스켓 2kg 4수")).toEqual(["grape-shine"]);
    expect(pick("[제] 태추 단감 특품(M) / 2.5kg")).toEqual(["persimmon-taechu"]);
    expect(pick("[본] 대봉 곶감 선물세트 (24개입) 1.8kg")).toEqual(["persimmon-dried"]);
    expect(pick("[본] 대봉 반건시 선물세트 / 24구")).toEqual(["persimmon-dried"]);
    expect(pick("[제] 호두말이 곶감 선물세트 / 20구")).toEqual(["persimmon-dried"]);
    expect(pick("제주 햇 고깔 양배추(실중량) / 1kg")).toEqual(["cabbage"]);
    expect(pick("[본] 통영 석화 3kg")).toEqual(["oyster"]);
    expect(pick("영광 굴비 선물세트")).toEqual(["gulbi"]);
    expect(pick("[명] 흙 대파 1kg")).toEqual(["green-onion"]);
    expect(pick("[본] 정품 가지 1kg (4-8개입)")).toEqual(["eggplant"]);
    expect(pick("[본] 사과 두 가지 맛 세트")).not.toContain("eggplant");
    expect(pick("석류콜라겐젤리스틱 15포")).toEqual([]);
    // 추가 품목과 겹치지 않게
    expect(pick("[제] 하우스감귤 2kg")).toEqual(["house-mandarin"]);
    expect(pick("[본] 노지감귤 대과(L-2L) 3kg")).toEqual(["mandarin"]);
    expect(pick("함안 산딸기 500g")).toEqual(["raspberry"]);
    expect(pick("[본] 신비복숭아 2kg")).toEqual(["peach-sinbi"]);
    expect(pick("나주배 원황 7.5kg")).toEqual(["pear-wonhwang"]);
    expect(pick("[본] 여주 꿀고구마말랭이 500g")).toEqual(["sweetpotato-chips"]);
    expect(pick("햇찹쌀 4kg")).toEqual(["glutinous-rice"]);
    expect(pick("영광 보리굴비 10미")).toEqual(["gulbi"]);
    expect(pick("여수 돌산갓김치 2kg")).toEqual(["kimchi"]);
    expect(pick("통영 도다리쑥국 세트")).toEqual(["doddari"]);
    expect(pick("[본] 새송이버섯 2kg")).toEqual(["king-oyster"]);
    expect(pick("양송이버섯 1kg")).toEqual(["button-mushroom"]);
    expect(pick("[본] 해남 호박고구마 3kg")).toEqual(["sweet-potato-pumpkin"]);
    expect(pick("안동 마 2kg")).toEqual(["yam"]);
    expect(pick("생마늘 1kg")).toEqual(["garlic"]);
    expect(pick("대구 사과 5kg")).toEqual([]);
    expect(pick("손질 대구 2kg")).toEqual(["cod"]);
    expect(pick("[제] 수입산 백용과 / 1kg")).toEqual(["dragonfruit"]);
    expect(pick("금산 수삼 750g")).toEqual(["ginseng"]);
  });

  it("가공품 품목은 식품 카테고리 상품과도 잇고, 신선 품목은 신선 카테고리 상품만 잇습니다", () => {
    const categories = new Map([["farm", "🥕 농산"], ["food", "🥫 식품"]]);
    const grouped = groupProductsByProduce([
      { name: "프리미엄 포기김치 5kg", categoryId: "food" },
      { name: "부사 사과칩 30g", categoryId: "food" },
      { name: "부사 특품 5kg", categoryId: "farm" }
    ], categories);
    expect(grouped.get("kimchi")?.map((product) => product.name)).toEqual(["프리미엄 포기김치 5kg"]);
    expect(grouped.get("apple-fuji")?.map((product) => product.name)).toEqual(["부사 특품 5kg"]);
  });

  it("신선 카테고리만 잇고, 상품을 품목별로 묶습니다", () => {
    expect(isFreshCategoryName("🥕 농산")).toBe(true);
    expect(isFreshCategoryName("🐟 수산")).toBe(true);
    expect(isFreshCategoryName("💊 건강식품")).toBe(false);
    expect(isFreshCategoryName(undefined)).toBe(false);
    const grouped = groupProductsByProduce([{ name: "부사 특품 5kg" }, { name: "노지감귤 3kg" }, { name: "부사 가정용 10kg" }]);
    expect(grouped.get("apple-fuji")?.map((product) => product.name)).toEqual(["부사 특품 5kg", "부사 가정용 10kg"]);
    expect(grouped.get("mandarin")).toHaveLength(1);
    expect(grouped.has("fig")).toBe(false);
  });

  it("산지 문의 메시지 · 체크리스트 · 함께 볼 품목", () => {
    const item = findProduceItem("mandarin");
    expect(item).toBeDefined();
    if (!item) return;
    const message = produceInquiryMessage(item);
    expect(message).toContain("감귤 위탁판매");
    expect(message).toContain("판매 시기: 10~2월 (특히 11~1월)");
    expect(produceChecklist(item)).toHaveLength(6);
    const related = relatedProduceItems(item, 6);
    expect(related).toHaveLength(6);
    expect(related.every((other) => other.id !== item.id)).toBe(true);
    expect(related[0].group).toBe("감귤·만감류");
  });
});
