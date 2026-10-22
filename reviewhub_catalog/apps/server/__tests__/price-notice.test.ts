import { describe, expect, it } from "vitest";
import { isPublicPriceHistoryDate, publicPriceHistoryDayKeys } from "../services/catalog";
import { noticeDayLabel, noticeRowsForDay } from "../services/price-notice-excel";

// 2026-10-22 13:00 KST
const now = Date.parse("2026-10-22T04:00:00Z");

describe("공개 가격변동 날짜 범위(한국 날짜)", () => {
  it("오늘 포함 4일(10/22·10/21·10/20·10/19)을 탭으로 씁니다", () => {
    expect(publicPriceHistoryDayKeys(now)).toEqual(["2026-10-22", "2026-10-21", "2026-10-20", "2026-10-19"]);
  });

  it("10/19 00:00 KST부터 보이고 그 전날은 빠집니다(저장 형식 두 가지 모두)", () => {
    expect(isPublicPriceHistoryDate("2026-10-18T15:00:00.000Z", now)).toBe(true); // 10/19 00:00 KST
    expect(isPublicPriceHistoryDate("2026-10-18 15:00:00", now)).toBe(true);
    expect(isPublicPriceHistoryDate("2026-10-18T14:59:59.000Z", now)).toBe(false); // 10/18 23:59 KST
    expect(isPublicPriceHistoryDate("2026-10-22T03:30:00.000Z", now)).toBe(true);
  });
});

describe("가격변동 공지 행", () => {
  const products = [{ id: "p1", name: "태국 남독마이 골드망고 1kg", productCode: "m1" }, { id: "p2", name: "홍가리비 1kg", productCode: "g1" }];
  const history = (id: string, productId: string, field: string, oldPrice: number, newPrice: number, changedAt: string) =>
    ({ id, productId, productName: "예전 이름", optionId: null, optionName: null, field, oldPrice, newPrice, changedBy: "admin", changedAt }) as never;

  it("같은 날 여러 번 바뀌면 처음 값 → 마지막 값으로 합치고 인상·인하를 나눕니다", () => {
    const rows = noticeRowsForDay({
      products,
      histories: [
        history("h1", "p1", "aPrice", 18900, 18000, "2026-10-22T00:00:00.000Z"),
        history("h2", "p1", "aPrice", 18000, 17150, "2026-10-22T02:00:00.000Z"),
        history("h3", "p1", "generalPrice", 20000, 19000, "2026-10-22T02:00:00.000Z"),
        history("h4", "p2", "aPrice", 2600, 2800, "2026-10-22T01:00:00.000Z"),
        history("h5", "p2", "salePrice", 3000, 3500, "2026-10-22T01:00:00.000Z"),
        history("h6", "p2", "aPrice", 1, 2, "2026-10-21T01:00:00.000Z")
      ]
    }, "2026-10-22");
    expect(rows).toEqual([
      { name: "홍가리비 1kg", direction: "인상", aPrice: { oldPrice: 2600, newPrice: 2800 } },
      { name: "태국 남독마이 골드망고 1kg", direction: "인하", aPrice: { oldPrice: 18900, newPrice: 17150 }, generalPrice: { oldPrice: 20000, newPrice: 19000 } }
    ]);
  });

  it("다시 원래 값으로 돌아온 항목은 공지에서 뺍니다", () => {
    expect(noticeRowsForDay({ products, histories: [
      history("h1", "p1", "aPrice", 1000, 1100, "2026-10-22T00:00:00.000Z"),
      history("h2", "p1", "aPrice", 1100, 1000, "2026-10-22T01:00:00.000Z")
    ] }, "2026-10-22")).toEqual([]);
  });

  it("날짜 표기", () => {
    expect(noticeDayLabel("2026-10-22")).toBe("10월 22일(목)");
    expect(noticeDayLabel("2026-10-19", true)).toBe("2026년 10월 19일 월요일");
  });
});
