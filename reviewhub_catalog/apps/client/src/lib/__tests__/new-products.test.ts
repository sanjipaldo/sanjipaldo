import { describe, expect, it } from "vitest";
import { createdDayKey, newProductDayKeys, parseNewProductSettings, selectNewProducts, shortDayLabel } from "../new-products";

describe("신규상품(최근 N일 등록, 한국 날짜)", () => {
  it("설정이 없거나 잘못되면 7일·제외 없음", () => {
    expect(parseNewProductSettings(undefined)).toEqual({ days: 7, hidden: [] });
    expect(parseNewProductSettings("not json")).toEqual({ days: 7, hidden: [] });
    expect(parseNewProductSettings(JSON.stringify({ days: 99, hidden: ["a", 1] }))).toEqual({ days: 7, hidden: ["a"] });
    expect(parseNewProductSettings(JSON.stringify({ days: 3, hidden: [] }))).toEqual({ days: 3, hidden: [] });
  });

  it("등록일은 두 저장 형식 모두 한국 날짜로 바꿉니다", () => {
    expect(createdDayKey("2026-10-24T15:00:00.000Z")).toBe("2026-10-25");
    expect(createdDayKey("2026-10-24 14:59:59")).toBe("2026-10-24");
    expect(shortDayLabel("2026-10-25")).toBe("10.25(일)");
  });

  it("오늘 포함 N일 안 + 제외하지 않은 상품만, 최근 등록 순", () => {
    expect(newProductDayKeys("2026-10-25", 3)).toEqual(["2026-10-25", "2026-10-24", "2026-10-23"]);
    const products = [
      { id: "old", createdAt: "2026-10-22T03:00:00.000Z" },
      { id: "a", createdAt: "2026-10-23T03:00:00.000Z" },
      { id: "b", createdAt: "2026-10-25T01:00:00.000Z" },
      { id: "hidden", createdAt: "2026-10-25T02:00:00.000Z" }
    ];
    expect(selectNewProducts(products, { days: 3, hidden: ["hidden"] }, "2026-10-25").map((product) => product.id)).toEqual(["b", "a"]);
  });
});
