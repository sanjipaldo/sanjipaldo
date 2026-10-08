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
  it("판매가 기준 마진으로 계산하고 원 단위 미만은 버립니다", () => {
    expect(priceWithMargin(5250, 10)).toBe(5833);
    expect(priceWithMargin(5250, 20)).toBe(6562);
    expect(priceWithMargin(8400, 10)).toBe(9333);
    expect(priceWithMargin(8400, 20)).toBe(10500);
    expect(priceWithMargin(9000, 10)).toBe(10000);
    expect(priceWithMargin(10000, 12.5)).toBe(11428);
    expect(priceWithMargin(10000, 0)).toBe(10000);
  });

  it("공급가를 원가로 쓰고 A급 단가 10%·일반공급가 20% 마진을 적용합니다", async () => {
    const bytes = await workbook([
      ["상품명", "기존원가", "변경원가", "기존공급가", "변경공급가"],
      ["[당도보장]  제주 감귤 소과 3S 3kg", 8050, null, 8400, null]
    ]);
    const preview = await previewBulkProductWorkbook(bytes);
    expect(preview.format).toBe("contract");
    expect(preview.errors).toEqual([]);
    expect(preview.changes.map((change) => [change.field, change.after])).toEqual([
      ["원가", 8400],
      ["A단가", 9333],
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
      ["A단가", 5833],
      ["일반공급가", 6562]
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
      ["A단가", 9882],
      ["일반공급가", 11200]
    ]);
  });

  it("데이터센터에 없는 상품은 미분류·숨김으로 신규 등록합니다", async () => {
    const bytes = await workbook([
      ["상품명", "기존원가", "변경원가", "기존A급단가", "변경A급단가", "기존공급가", "변경공급가"],
      ["표고버섯 실속 1kg", null, 9500, null, 10000, null, 10500]
    ]);
    const preview = await previewBulkProductWorkbook(bytes);
    expect(preview.newProducts).toBe(1);
    expect(preview.changes[0].field).toBe("신규 등록");
    await applyBulkProductWorkbook(bytes, "tester");
    expect(catalog.createProduct).toHaveBeenCalledWith(expect.objectContaining({
      name: "표고버섯 실속 1kg",
      costPrice: 10000,
      aPrice: 11111,
      generalPrice: 12500,
      isVisible: false,
      categoryId: "cat-uncategorized"
    }));
  });
});
