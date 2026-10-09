import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

// 공급사 단가표 업로드는 DB 대신 아래 상품 목록으로 미리보기를 만듭니다.
const products = [
  { id: "p-tangerine", name: "[당도보장] 제주 감귤 소과 3S 3kg", productCode: "ass00187", costPrice: 8050, aPrice: 8400, generalPrice: 8400, options: [] },
  { id: "p-shiitake", name: "표고버섯 가정용 1kg", productCode: "mush-1", costPrice: 0, aPrice: 0, generalPrice: 0, options: [] },
  { id: "p-dup-1", name: "같은 이름 상품", productCode: "dup-1", costPrice: 0, aPrice: 0, generalPrice: 0, options: [] },
  { id: "p-dup-2", name: "같은 이름 상품", productCode: "dup-2", costPrice: 0, aPrice: 0, generalPrice: 0, options: [] }
];

vi.mock("../services/catalog", () => ({
  getAdminCatalog: vi.fn(async () => ({ products, categories: [] })),
  getShippingPolicies: vi.fn(async () => []),
  createCategory: vi.fn(async () => ({ id: "cat-uncategorized" })),
  createProduct: vi.fn(async () => ({ id: "new" })),
  updateProduct: vi.fn()
}));

const { previewBulkProductWorkbook, applyBulkProductWorkbook, priceWithMargin } = await import("../services/catalog-excel");
const catalog = await import("../services/catalog");

async function workbook(rows: Array<Array<string | number | null>>) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("단가표");
  rows.forEach((row) => sheet.addRow(row));
  return new Uint8Array(await book.xlsx.writeBuffer());
}

describe("공급사 단가표(계약 마진) 업로드", () => {
  it("입력한 마진 이상이 되는 끝자리 00원 금액으로 올립니다", () => {
    expect(priceWithMargin(5250, 10)).toBe(5900);
    expect(priceWithMargin(5250, 20)).toBe(6600);
    expect(priceWithMargin(8400, 10)).toBe(9400);
    expect(priceWithMargin(8400, 20)).toBe(10500);
    expect(priceWithMargin(9000, 10)).toBe(10000);
    expect(priceWithMargin(10000, 12.5)).toBe(11500);
    expect(priceWithMargin(10000, 0)).toBe(10000);
  });

  it("100원 단위면 마진이 2%p 넘게 커지는 저가 상품만 50원 단위로 올립니다", () => {
    // 1,000원 → 1,111원: 1,200원이면 마진 16.7%라 1,150원(13.0%)
    expect(priceWithMargin(1000, 10)).toBe(1150);
    expect(priceWithMargin(800, 20)).toBe(1000);
  });

  it("어떤 원가에서도 끝자리는 00원·50원이고 마진은 입력값 이상입니다", () => {
    for (let cost = 300; cost <= 60000; cost += 37) {
      for (const margin of [10, 20, 12.5]) {
        const price = priceWithMargin(cost, margin);
        expect(price % 50).toBe(0);
        expect((price - cost) / price).toBeGreaterThanOrEqual(margin / 100 - 1e-9);
      }
    }
  });

  it("공급가를 원가로 쓰고 A급 단가 10%·일반공급가 20% 이상 마진을 적용합니다", async () => {
    const bytes = await workbook([
      ["상품명", "기존원가", "변경원가", "기존공급가", "변경공급가"],
      ["[당도보장]  제주 감귤 소과 3S 3kg", 8050, null, 8400, null]
    ]);
    const preview = await previewBulkProductWorkbook(bytes);
    expect(preview.format).toBe("contract");
    expect(preview.errors).toEqual([]);
    expect(preview.changes.map((change) => [change.field, change.after])).toEqual([
      ["원가", 8400],
      ["A단가", 9400],
      ["일반공급가", 10500]
    ]);
  });

  it("A급단가 칸에 값이 있으면 A급단가를 원가로 씁니다(변경 값 우선)", async () => {
    const bytes = await workbook([
      ["상품명", "기존원가", "변경원가", "기존A급단가", "변경A급단가", "기존공급가", "변경공급가"],
      ["표고버섯 가정용 1kg", null, 5000, null, 5250, null, 5500]
    ]);
    const preview = await previewBulkProductWorkbook(bytes);
    expect(preview.changes.map((change) => [change.field, change.after])).toEqual([
      ["원가", 5250],
      ["A단가", 5900],
      ["일반공급가", 6600]
    ]);
  });

  it("고른 항목만 바꾸고, 없는 상품·같은 이름 상품은 건너뜁니다", async () => {
    const bytes = await workbook([
      ["상품명", "기존공급가"],
      ["[당도보장] 제주 감귤 소과 3S 3kg", 8400],
      ["없는 상품", 1000],
      ["같은 이름 상품", 1000]
    ]);
    const preview = await previewBulkProductWorkbook(bytes, ["a"], { aMargin: 10, generalMargin: 20, createMissing: false });
    expect(preview.changes.map((change) => change.field)).toEqual(["A단가"]);
    expect(preview.matchedRows).toBe(1);
    expect(preview.warnings.some((warning) => warning.includes("없는 상품"))).toBe(true);
    expect(preview.warnings.some((warning) => warning.includes("같은 이름 상품"))).toBe(true);
  });

  it("같은 상품명이 파일에 두 번 있으면 오류로 막습니다", async () => {
    const bytes = await workbook([
      ["상품명", "기존공급가"],
      ["표고버섯 가정용 1kg", 5000],
      ["표고버섯 가정용 1kg", 5100]
    ]);
    const preview = await previewBulkProductWorkbook(bytes);
    expect(preview.errors).toHaveLength(1);
  });

  it("관리자가 입력한 마진(%)으로 계산합니다", async () => {
    const bytes = await workbook([
      ["상품명", "기존공급가"],
      ["[당도보장] 제주 감귤 소과 3S 3kg", 8400]
    ]);
    const preview = await previewBulkProductWorkbook(bytes, undefined, { aMargin: 15, generalMargin: 25, createMissing: false });
    expect(preview.contract).toEqual({ aMargin: 15, generalMargin: 25, createMissing: false });
    expect(preview.changes.map((change) => [change.field, change.after])).toEqual([
      ["원가", 8400],
      ["A단가", 9900],
      ["일반공급가", 11200]
    ]);
  });

  it("데이터센터에 없는 상품은 상품코드가 있을 때만 미분류·숨김으로 신규 등록합니다", async () => {
    const bytes = await workbook([
      ["상품코드", "상품명", "기존원가", "변경원가", "기존A급단가", "변경A급단가", "기존공급가", "변경공급가"],
      ["ass00059", "표고버섯 실속 1kg", null, 9500, null, 10000, null, 10500]
    ]);
    const preview = await previewBulkProductWorkbook(bytes);
    expect(preview.newProducts).toBe(1);
    expect(preview.changes[0].field).toBe("신규 등록");
    await applyBulkProductWorkbook(bytes, "tester");
    expect(catalog.createProduct).toHaveBeenCalledWith(expect.objectContaining({
      productCode: "ass00059",
      name: "표고버섯 실속 1kg",
      costPrice: 10000,
      aPrice: 11200,
      generalPrice: 12500,
      isVisible: false,
      categoryId: "cat-uncategorized"
    }));
  });

  it("상품코드가 없으면 신규 등록하지 않고 안내합니다", async () => {
    const bytes = await workbook([
      ["상품명", "기존공급가"],
      ["새로운 상품 1kg", 5000]
    ]);
    const preview = await previewBulkProductWorkbook(bytes);
    expect(preview.newProducts).toBe(0);
    expect(preview.changes).toEqual([]);
    expect(preview.warnings.some((warning) => warning.includes("상품코드가 없어 신규 등록하지 않았습니다"))).toBe(true);
  });

  it("신규 상품은 엑셀 순서대로 목록에 놓이도록 마지막 행부터 등록합니다", async () => {
    vi.mocked(catalog.createProduct).mockClear();
    const bytes = await workbook([
      ["상품코드", "상품명", "기존공급가"],
      ["ass00057", "표고버섯 가정용 1kg", 5250],
      ["ass00058", "표고버섯 가정용 2kg", 9500],
      ["ass00060", "표고버섯 실속 2kg", 19000]
    ]);
    await applyBulkProductWorkbook(bytes, "tester");
    // 새 상품은 등록될 때마다 맨 앞에 들어가므로, 마지막 행 → 첫 행 순서로 등록해야 첫 행이 맨 위가 됩니다.
    expect(vi.mocked(catalog.createProduct).mock.calls.map(([input]) => input.productCode)).toEqual(["ass00060", "ass00058", "ass00057"]);
  });
});
