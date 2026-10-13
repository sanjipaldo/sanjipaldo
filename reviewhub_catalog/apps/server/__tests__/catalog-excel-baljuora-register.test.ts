import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

const categories = [
  { id: "cat-farm", name: "🥕 농산" },
  { id: "cat-health", name: "💊 건강식품" },
  { id: "cat-overseas-health", name: "✈️ 해외 건강식품" }
];
const products = [
  { id: "p-1", productCode: "ass00057", name: "표고버섯 가정용 1kg", categoryId: "cat-farm", costPrice: 5250, aPrice: 5900, generalPrice: 6600, options: [] },
  { id: "p-2", productCode: "hf-1", name: "폴리코사놀 60캡슐", categoryId: "cat-health", costPrice: 20000, aPrice: 22300, generalPrice: 25000, options: [] },
  { id: "p-3", productCode: "hf-2", name: "해외 오메가3", categoryId: "cat-overseas-health", costPrice: 30000, aPrice: 33400, generalPrice: 37500, options: [] },
  { id: "p-4", productCode: "x-1", name: "선택 안 한 상품", categoryId: "cat-farm", costPrice: 1, aPrice: 1, generalPrice: 1, options: [] }
];

vi.mock("../services/catalog", () => ({
  getAdminCatalog: vi.fn(async () => ({ products, categories }))
}));

const { buildBaljuoraRegisterWorkbook, baljuoraTaxType } = await import("../services/catalog-excel");

describe("선택 상품 → 발주오라 대량상품등록 양식", () => {
  it("상품코드·상품명·매입원가(원가)·공급가(일반공급가)·과세여부만 채우고 매입처·배송정책은 비웁니다", async () => {
    const bytes = await buildBaljuoraRegisterWorkbook(["p-1", "p-2", "p-3"]);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes.buffer as ArrayBuffer);
    const sheet = book.getWorksheet("대량상품등록_양식")!;
    expect(sheet.getRow(1).getCell(1).value).toBe("상품코드");
    expect(sheet.getRow(1).getCell(10).value).toBe("과세여부");
    expect(sheet.getRow(2).getCell(2).value).toBe("필수");
    expect(sheet.getRow(2).getCell(1).value).toBe("선택");
    const rows = [3, 4, 5].map((n) => [1, 2, 3, 4, 5, 6, 7, 10].map((c) => sheet.getRow(n).getCell(c).value ?? null));
    expect(rows).toEqual([
      ["ass00057", "표고버섯 가정용 1kg", null, 5250, null, 6600, null, "비과세"],
      ["hf-1", "폴리코사놀 60캡슐", null, 20000, null, 25000, null, "과세"],
      ["hf-2", "해외 오메가3", null, 30000, null, 37500, null, "과세"]
    ]);
    expect(sheet.getRow(6).getCell(1).value ?? null).toBeNull();
  });

  it("건강식품 카테고리만 과세입니다", () => {
    expect(baljuoraTaxType("💊 건강식품")).toBe("과세");
    expect(baljuoraTaxType("[온라인용] 건강식품")).toBe("과세");
    expect(baljuoraTaxType("🐟 수산")).toBe("비과세");
    expect(baljuoraTaxType(null)).toBe("비과세");
  });
});
