import ExcelJS from "exceljs";
import { DatabaseError } from "../_core/db";
import { createCategory, createProduct, getAdminCatalog, type ProductInput, updateProduct } from "./catalog";

const LIST_HEADERS = [
  "등록일", "노출여부", "품절여부", "상품코드", "관리코드", "상품명", "발주상품명",
  "발주단위", "단위", "단위값", "매입처", "과세여부", "해외배송", "매입원가",
  "총 원가\n(부자재 비용포함)", "공급가", "소비자가", "매입 배송정책", "매출 배송정책",
  "택배사", "상품 간략설명", "판매량", "창고", "바코드", "출고지", "제조연월일", "소비기한"
] as const;

const BULK_HEADERS = [
  "상품코드", "식별ID(수정금지)", "구분", "상품명", "매입원가", "부자재가", "공급가",
  "소비자가", "노출여부", "품절여부", "과세여부", "관리코드", "바코드", "출고지",
  "제조연월일", "소비기한", "상품 간략설명", "해외배송", "발주상품명", "발주단위"
] as const;

type AdminData = Awaited<ReturnType<typeof getAdminCatalog>>;
type CatalogProduct = AdminData["products"][number];
type ProductDraft = CatalogProduct & { options: CatalogProduct["options"] };

export type BulkWorkbookChange = {
  row: number;
  productName: string;
  optionName: string | null;
  field:
    | "상품명" | "A단가" | "일반공급가" | "원가" | "노출여부" | "품절여부" | "상품 간략설명" | "해외배송"
    | "매입처" | "택배사" | "신규 등록";
  before: string | number | boolean | null;
  after: string | number | boolean | null;
};

export type BulkWorkbookPreview = {
  totalRows: number;
  matchedRows: number;
  affectedProducts: number;
  changes: BulkWorkbookChange[];
  errors: Array<{ row: number; message: string }>;
  warnings: string[];
  // 발주오라 상품리스트 양식일 때만 채워집니다.
  format?: "bulk" | "baljuora";
  newProducts?: number;
};

// 신규 상품은 발주오라 파일에 카테고리 열이 없어 이 카테고리로 등록하고, 관리자가 나중에 지정합니다.
const UNCATEGORIZED_NAME = "미분류";

function styleWorksheet(worksheet: ExcelJS.Worksheet, widths: number[]) {
  worksheet.getRow(1).height = 34;
  worksheet.getRow(1).font = { name: "맑은 고딕", size: 10, bold: true, color: { argb: "FF000000" } };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
  worksheet.getRow(1).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  worksheet.columns.forEach((column, index) => {
    column.width = widths[index] ?? 12;
  });
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = {
        top: { style: rowNumber === 1 ? "thin" : "hair", color: { argb: "FFB7B7B7" } },
        left: { style: rowNumber === 1 ? "thin" : "hair", color: { argb: "FFB7B7B7" } },
        bottom: { style: rowNumber === 1 ? "thin" : "hair", color: { argb: "FFB7B7B7" } },
        right: { style: rowNumber === 1 ? "thin" : "hair", color: { argb: "FFB7B7B7" } }
      };
      cell.alignment = { ...cell.alignment, vertical: "middle", wrapText: rowNumber === 1 };
      if (rowNumber > 1) cell.font = { name: "맑은 고딕", size: 10 };
    });
  });
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
}

function formatBaljuoraDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const datePart = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
  const timePart = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(date);
  return `${datePart} ${timePart}`;
}

function productCode(product: CatalogProduct) {
  return product.productCode || product.id;
}

function listRow(product: CatalogProduct, option?: CatalogProduct["options"][number]) {
  const name = option ? `${product.name} · ${option.name}` : product.name;
  const aPrice = option?.aPrice ?? product.aPrice;
  const generalPrice = option?.generalPrice ?? product.generalPrice;
  const soldOut = option?.isSoldOut ?? product.isSoldOut;
  return [
    formatBaljuoraDate(product.createdAt),
    product.isVisible ? "노출중" : "미노출",
    soldOut ? "품절" : "판매중",
    productCode(product),
    option ? `OPTION:${option.id}` : null,
    name,
    null,
    null,
    null,
    null,
    null,
    "비과세",
    product.shippingType === "overseas" ? "해외" : "국내",
    aPrice,
    option?.costPrice ?? product.costPrice,
    generalPrice,
    null,
    product.shippingFee,
    product.shippingFee,
    product.courier,
    product.notes,
    null,
    null,
    null,
    null,
    null,
    null
  ];
}

function bulkRow(product: CatalogProduct, option?: CatalogProduct["options"][number]) {
  return [
    productCode(product),
    option ? `option:${option.id}` : `product:${product.id}`,
    option ? "옵션" : "상품",
    option ? `${product.name} · ${option.name}` : product.name,
    option?.aPrice ?? product.aPrice,
    null,
    option?.generalPrice ?? product.generalPrice,
    null,
    product.isVisible ? "Y" : "N",
    (option?.isSoldOut ?? product.isSoldOut) ? "Y" : "N",
    "N",
    null,
    null,
    null,
    null,
    null,
    product.notes,
    product.shippingType === "overseas" ? "Y" : "N",
    null,
    null
  ];
}

export async function buildProductListWorkbook(selectedProductIds?: string[]) {
  const { products } = await getAdminCatalog();
  const selectedIds = selectedProductIds && selectedProductIds.length > 0
    ? new Set(selectedProductIds)
    : null;
  const exportProducts = selectedIds
    ? products.filter((product) => selectedIds.has(product.id))
    : products;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("기본 양식");
  worksheet.addRow([...LIST_HEADERS]);
  for (const product of exportProducts) {
    worksheet.addRow(listRow(product));
    for (const option of product.options) worksheet.addRow(listRow(product, option));
  }
  styleWorksheet(worksheet, [29, 10, 10, 14, 19, 37, 12, 10, 10, 10, 16, 10, 10, 12, 19, 12, 12, 29, 29, 12, 30, 10, 10, 14, 14, 12, 12]);
  [14, 15, 16, 17, 22].forEach((index) => {
    worksheet.getColumn(index).numFmt = "#,##0";
  });
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function buildBulkProductWorkbook() {
  const { products } = await getAdminCatalog();
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("기본 양식");
  worksheet.addRow([...BULK_HEADERS]);
  for (const product of products) {
    worksheet.addRow(bulkRow(product));
    for (const option of product.options) worksheet.addRow(bulkRow(product, option));
  }
  styleWorksheet(worksheet, [14, 24, 10, 42, 12, 12, 12, 12, 10, 10, 10, 14, 14, 14, 12, 12, 30, 10, 14, 12]);
  [5, 6, 7, 8].forEach((index) => {
    worksheet.getColumn(index).numFmt = "#,##0";
  });
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function cellText(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("formula" in value) throw new Error("수식 셀은 업로드할 수 없습니다.");
    if ("text" in value) return String(value.text).trim();
    if ("result" in value) return String(value.result ?? "").trim();
  }
  return String(value).trim();
}

function cellNumber(cell: ExcelJS.Cell, row: number, label: string, errors: BulkWorkbookPreview["errors"]) {
  const raw = cellText(cell).replace(/,/g, "");
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    errors.push({ row, message: `${label}은 0 이상의 정수여야 합니다.` });
    return null;
  }
  return parsed;
}

function cellBoolean(cell: ExcelJS.Cell, row: number, label: string, errors: BulkWorkbookPreview["errors"]) {
  const raw = cellText(cell).toUpperCase();
  if (!raw) return null;
  if (["Y", "YES", "TRUE", "1", "노출", "판매중", "해외"].includes(raw)) return true;
  if (["N", "NO", "FALSE", "0", "미노출", "품절", "국내"].includes(raw)) return false;
  errors.push({ row, message: `${label}은 Y 또는 N으로 입력해 주세요.` });
  return null;
}

const normalizeHeader = (value: string) => value.replace(/\s+/g, "");

async function parseWorkbook(bytes: Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  await workbook.xlsx.load(arrayBuffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new DatabaseError("DATABASE_QUERY_FAILED", "기본 양식 시트를 찾을 수 없습니다.", 400);
  if (worksheet.rowCount > 5001) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "한 번에 최대 5,000개 행까지 변경할 수 있습니다.", 400);
  }
  const headerRow = worksheet.getRow(1);
  const columns = new Map<string, number>();
  for (let column = 1; column <= Math.max(worksheet.columnCount, LIST_HEADERS.length); column += 1) {
    const header = normalizeHeader(cellText(headerRow.getCell(column)));
    if (header && !columns.has(header)) columns.set(header, column);
  }
  // 발주오라 상품리스트(= 데이터센터 "상품 리스트" 다운로드) 양식: 열 이름으로 찾으므로 순서가 달라도 됩니다.
  if (["상품코드", "상품명", "매입원가", "공급가", "품절여부"].every((header) => columns.has(header)) && columns.has("등록일")) {
    return { worksheet, format: "baljuora" as const, columns };
  }
  const headers = BULK_HEADERS.map((_, index) => cellText(headerRow.getCell(index + 1)));
  if (headers.some((header, index) => header !== BULK_HEADERS[index])) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "발주오라 상품리스트 엑셀 또는 데이터센터 일괄변경 양식을 올려 주세요.", 400);
  }
  return { worksheet, format: "bulk" as const, columns };
}

function asProductInput(product: ProductDraft): ProductInput {
  return {
    productCode: product.productCode,
    name: product.name,
    imageUrl: product.imageUrl,
    origin: product.origin,
    supplierName: product.supplierName,
    costPrice: product.costPrice,
    aPrice: product.aPrice,
    generalPrice: product.generalPrice,
    salePrice: product.salePrice,
    salePriceMode: product.salePriceMode,
    saleStartMonth: product.saleStartMonth,
    saleEndMonth: product.saleEndMonth,
    isAlwaysOnSale: product.isAlwaysOnSale,
    shippingFee: product.shippingFee,
    releaseInfo: product.releaseInfo,
    notes: product.notes,
    optionsInfo: product.optionsInfo,
    packaging: product.packaging,
    courier: product.courier,
    shippingPolicyId: product.shippingPolicyId,
    shippingType: product.shippingType,
    categoryId: product.categoryId,
    isVisible: product.isVisible,
    isSoldOut: product.isSoldOut,
    options: product.options.map((option) => ({
      id: option.id,
      name: option.name,
      costPrice: option.costPrice,
      aPrice: option.aPrice,
      generalPrice: option.generalPrice,
      salePrice: option.salePrice,
      salePriceMode: option.salePriceMode,
      isSoldOut: option.isSoldOut,
      sortOrder: option.sortOrder
    }))
  };
}

async function buildPreview(bytes: Uint8Array) {
  const parsed = await parseWorkbook(bytes);
  if (parsed.format === "baljuora") return buildBaljuoraPreview(parsed.worksheet, parsed.columns);
  const { worksheet } = parsed;
  const data = await getAdminCatalog();
  const drafts = new Map<string, ProductDraft>(
    data.products.map((product) => [product.id, { ...product, options: product.options.map((option) => ({ ...option })) }])
  );
  const productByCode = new Map(data.products.map((product) => [productCode(product), product]));
  const optionToProduct = new Map<string, CatalogProduct>();
  data.products.forEach((product) => product.options.forEach((option) => optionToProduct.set(option.id, product)));
  const changes: BulkWorkbookChange[] = [];
  const errors: BulkWorkbookPreview["errors"] = [];
  const affected = new Set<string>();
  const seenTargets = new Set<string>();
  let matchedRows = 0;

  const recordChange = (
    row: number,
    product: ProductDraft,
    optionName: string | null,
    field: BulkWorkbookChange["field"],
    before: BulkWorkbookChange["before"],
    after: BulkWorkbookChange["after"]
  ) => {
    if (before === after) return;
    changes.push({ row, productName: product.name, optionName, field, before, after });
    affected.add(product.id);
  };

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    let hasValue = false;
    for (let column = 1; column <= BULK_HEADERS.length; column += 1) {
      if (cellText(row.getCell(column))) {
        hasValue = true;
        break;
      }
    }
    if (!hasValue) continue;
    const code = cellText(row.getCell(1));
    const identifier = cellText(row.getCell(2));
    const kind = cellText(row.getCell(3));
    const targetKey = identifier || `${kind}:${code}`;
    if (seenTargets.has(targetKey)) {
      errors.push({ row: rowNumber, message: "같은 상품 또는 옵션이 파일에 중복되어 있습니다." });
      continue;
    }
    seenTargets.add(targetKey);

    let baseProduct: CatalogProduct | undefined;
    let optionId: string | null = null;
    if (identifier.startsWith("product:")) baseProduct = data.products.find((product) => product.id === identifier.slice(8));
    else if (identifier.startsWith("option:")) {
      optionId = identifier.slice(7);
      baseProduct = optionToProduct.get(optionId);
    } else if (kind === "상품" && code) baseProduct = productByCode.get(code);

    if (!baseProduct) {
      errors.push({ row: rowNumber, message: "식별ID 또는 상품코드와 일치하는 상품을 찾을 수 없습니다." });
      continue;
    }
    const product = drafts.get(baseProduct.id);
    if (!product) continue;
    matchedRows += 1;

    if (optionId) {
      const option = product.options.find((item) => item.id === optionId);
      if (!option) {
        errors.push({ row: rowNumber, message: "옵션 식별ID가 현재 상품과 일치하지 않습니다." });
        continue;
      }
      const aPrice = cellNumber(row.getCell(5), rowNumber, "매입원가(A단가)", errors);
      const generalPrice = cellNumber(row.getCell(7), rowNumber, "공급가(일반공급가)", errors);
      const soldOut = cellBoolean(row.getCell(10), rowNumber, "품절여부", errors);
      if (aPrice !== null) {
        recordChange(rowNumber, product, option.name, "A단가", option.aPrice, aPrice);
        option.aPrice = aPrice;
      }
      if (generalPrice !== null) {
        recordChange(rowNumber, product, option.name, "일반공급가", option.generalPrice, generalPrice);
        option.generalPrice = generalPrice;
      }
      if (soldOut !== null) {
        recordChange(rowNumber, product, option.name, "품절여부", option.isSoldOut, soldOut);
        option.isSoldOut = soldOut;
      }
      continue;
    }

    const name = cellText(row.getCell(4));
    const aPrice = cellNumber(row.getCell(5), rowNumber, "매입원가(A단가)", errors);
    const generalPrice = cellNumber(row.getCell(7), rowNumber, "공급가(일반공급가)", errors);
    const visible = cellBoolean(row.getCell(9), rowNumber, "노출여부", errors);
    const soldOut = cellBoolean(row.getCell(10), rowNumber, "품절여부", errors);
    const notes = cellText(row.getCell(17));
    const overseas = cellBoolean(row.getCell(18), rowNumber, "해외배송", errors);

    if (name) {
      recordChange(rowNumber, product, null, "상품명", product.name, name);
      product.name = name;
    }
    if (aPrice !== null) {
      recordChange(rowNumber, product, null, "A단가", product.aPrice, aPrice);
      product.aPrice = aPrice;
    }
    if (generalPrice !== null) {
      recordChange(rowNumber, product, null, "일반공급가", product.generalPrice, generalPrice);
      product.generalPrice = generalPrice;
    }
    if (visible !== null) {
      recordChange(rowNumber, product, null, "노출여부", product.isVisible, visible);
      product.isVisible = visible;
    }
    if (soldOut !== null) {
      recordChange(rowNumber, product, null, "품절여부", product.isSoldOut, soldOut);
      product.isSoldOut = soldOut;
    }
    if (notes) {
      recordChange(rowNumber, product, null, "상품 간략설명", product.notes, notes);
      product.notes = notes;
    }
    if (overseas !== null) {
      const shippingType = overseas ? "overseas" : "domestic";
      if (product.shippingType !== shippingType) {
        const replacementCategory = data.categories.find((category) => category.shippingType === shippingType);
        if (!replacementCategory) errors.push({ row: rowNumber, message: "변경할 배송유형에 사용할 수 있는 카테고리가 없습니다." });
        else {
          recordChange(rowNumber, product, null, "해외배송", product.shippingType, shippingType);
          product.shippingType = shippingType;
          product.categoryId = replacementCategory.id;
        }
      }
    }
  }

  const preview: BulkWorkbookPreview = {
    totalRows: Math.max(0, worksheet.rowCount - 1),
    matchedRows,
    affectedProducts: affected.size,
    changes,
    errors,
    warnings: [
      "매입원가는 A단가, 공급가는 일반공급가로 반영됩니다.",
      "부자재가·소비자가·과세여부·관리코드·바코드·출고지·제조연월일·소비기한·발주상품명·발주단위는 현재 데이터센터에 보관되지 않아 변경하지 않습니다.",
      "발주오라 실시간 API 동기화는 별도 보안 인증 연결 후 활성화됩니다."
    ]
  };
  return { preview, drafts, affected, newProducts: [] as NewProductDraft[] };
}

type NewProductDraft = { row: number; input: Omit<ProductInput, "categoryId"> };

function statusValue(raw: string, truthy: string[], falsy: string[]) {
  const value = raw.replace(/\s+/g, "");
  if (!value) return null;
  if (truthy.includes(value)) return true;
  if (falsy.includes(value)) return false;
  return undefined;
}

// 발주오라 상품리스트 양식: 상품코드로 기존 상품을 찾아 바뀐 값만 반영하고, 없는 코드는 신규 상품으로 등록합니다.
// 제철(판매 월·연중판매)·노출순서·카테고리·이미지 등 데이터센터 전용 값은 건드리지 않습니다.
async function buildBaljuoraPreview(worksheet: ExcelJS.Worksheet, columns: Map<string, number>) {
  const data = await getAdminCatalog();
  const drafts = new Map<string, ProductDraft>(
    data.products.map((product) => [product.id, { ...product, options: product.options.map((option) => ({ ...option })) }])
  );
  const productByCode = new Map(data.products.filter((product) => product.productCode).map((product) => [product.productCode!.trim(), product]));
  const optionToProduct = new Map<string, CatalogProduct>();
  data.products.forEach((product) => product.options.forEach((option) => optionToProduct.set(option.id, product)));
  const changes: BulkWorkbookChange[] = [];
  const errors: BulkWorkbookPreview["errors"] = [];
  const rowNotices: string[] = [];
  const affected = new Set<string>();
  const seenCodes = new Set<string>();
  const newProducts: NewProductDraft[] = [];
  let matchedRows = 0;
  let totalRows = 0;

  const text = (row: ExcelJS.Row, header: string) => {
    const column = columns.get(header);
    return column ? cellText(row.getCell(column)) : "";
  };
  const number = (row: ExcelJS.Row, rowNumber: number, header: string, label = header) => {
    const column = columns.get(header);
    return column ? cellNumber(row.getCell(column), rowNumber, label, errors) : null;
  };
  const status = (row: ExcelJS.Row, rowNumber: number, header: string, truthy: string[], falsy: string[]) => {
    const value = statusValue(text(row, header), truthy, falsy);
    if (value === undefined) {
      errors.push({ row: rowNumber, message: `${header} 값은 ${[...truthy, ...falsy].join("/")} 중 하나여야 합니다.` });
      return null;
    }
    return value;
  };
  const record = (row: number, name: string, optionName: string | null, field: BulkWorkbookChange["field"], before: BulkWorkbookChange["before"], after: BulkWorkbookChange["after"], productId?: string) => {
    if (before === after) return;
    changes.push({ row, productName: name, optionName, field, before, after });
    if (productId) affected.add(productId);
  };

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const code = text(row, "상품코드");
    const name = text(row, "상품명");
    if (!code && !name) continue;
    totalRows += 1;
    if (!code) {
      errors.push({ row: rowNumber, message: "상품코드가 비어 있습니다." });
      continue;
    }
    const manageCode = text(row, "관리코드");
    const optionId = manageCode.startsWith("OPTION:") ? manageCode.slice(7) : null;
    const seenKey = optionId ? `option:${optionId}` : `code:${code}`;
    if (seenCodes.has(seenKey)) {
      errors.push({ row: rowNumber, message: "같은 상품코드가 파일에 중복되어 있습니다." });
      continue;
    }
    seenCodes.add(seenKey);

    const visible = status(row, rowNumber, "노출여부", ["노출중", "노출"], ["미노출", "숨김"]);
    const soldOut = status(row, rowNumber, "품절여부", ["품절"], ["판매중"]);
    const overseas = status(row, rowNumber, "해외배송", ["해외"], ["국내"]);
    // 기존 발주오라 데이터와 같은 규칙: 매입원가(총 원가 우선) → 원가(비공개), 공급가 → A단가·일반공급가(공개)
    const purchasePrice = number(row, rowNumber, "매입원가");
    const totalCost = number(row, rowNumber, "총원가(부자재비용포함)", "총 원가");
    const costPrice = totalCost ?? purchasePrice;
    const generalPrice = number(row, rowNumber, "공급가");
    const aPrice = generalPrice;
    const supplierName = text(row, "매입처");
    const courier = text(row, "택배사");
    const notes = text(row, "상품간략설명");
    if (purchasePrice !== null && generalPrice !== null && generalPrice < purchasePrice) {
      rowNotices.push(`${rowNumber}행 ${name || code}: 공급가(${generalPrice.toLocaleString("ko-KR")})가 매입원가(${purchasePrice.toLocaleString("ko-KR")})보다 낮습니다. 발주오라 값이 맞는지 확인해 주세요.`);
    }

    if (optionId) {
      // 데이터센터에서 내려받은 상품 리스트를 다시 올린 경우의 옵션 행
      const baseProduct = optionToProduct.get(optionId);
      const product = baseProduct ? drafts.get(baseProduct.id) : undefined;
      const option = product?.options.find((item) => item.id === optionId);
      if (!product || !option) {
        errors.push({ row: rowNumber, message: "관리코드의 옵션을 찾을 수 없습니다." });
        continue;
      }
      matchedRows += 1;
      // A단가는 관리자가 따로 정한 값(일반공급가와 다름)이면 유지하고, 같이 움직이던 값이면 공급가를 따라갑니다.
      if (aPrice !== null && (option.aPrice === option.generalPrice || !option.aPrice)) { record(rowNumber, product.name, option.name, "A단가", option.aPrice, aPrice, product.id); option.aPrice = aPrice; }
      if (costPrice !== null) { record(rowNumber, product.name, option.name, "원가", option.costPrice, costPrice, product.id); option.costPrice = costPrice; }
      if (generalPrice !== null) { record(rowNumber, product.name, option.name, "일반공급가", option.generalPrice, generalPrice, product.id); option.generalPrice = generalPrice; }
      if (soldOut !== null) { record(rowNumber, product.name, option.name, "품절여부", option.isSoldOut, soldOut, product.id); option.isSoldOut = soldOut; }
      continue;
    }

    const baseProduct = productByCode.get(code);
    if (!baseProduct) {
      if (!name) {
        errors.push({ row: rowNumber, message: "신규 상품은 상품명이 필요합니다." });
        continue;
      }
      if (generalPrice === null) {
        errors.push({ row: rowNumber, message: "신규 상품은 공급가가 필요합니다." });
        continue;
      }
      newProducts.push({
        row: rowNumber,
        input: {
          productCode: code,
          name,
          supplierName: supplierName || null,
          costPrice: costPrice ?? 0,
          aPrice: generalPrice,
          generalPrice,
          shippingFee: text(row, "매출배송정책") || "무료",
          notes: notes || null,
          courier: courier || null,
          shippingType: overseas ? "overseas" : "domestic",
          isVisible: visible ?? true,
          isSoldOut: soldOut ?? false
        }
      });
      record(rowNumber, name, null, "신규 등록", null, `공급가 ${generalPrice.toLocaleString("ko-KR")}원`);
      continue;
    }

    const product = drafts.get(baseProduct.id);
    if (!product) continue;
    matchedRows += 1;
    const id = product.id;
    if (name) { record(rowNumber, product.name, null, "상품명", product.name, name, id); product.name = name; }
    if (aPrice !== null && (product.aPrice === product.generalPrice || !product.aPrice)) { record(rowNumber, product.name, null, "A단가", product.aPrice, aPrice, id); product.aPrice = aPrice; }
    if (costPrice !== null) { record(rowNumber, product.name, null, "원가", product.costPrice, costPrice, id); product.costPrice = costPrice; }
    if (generalPrice !== null) { record(rowNumber, product.name, null, "일반공급가", product.generalPrice, generalPrice, id); product.generalPrice = generalPrice; }
    if (visible !== null) { record(rowNumber, product.name, null, "노출여부", product.isVisible, visible, id); product.isVisible = visible; }
    if (soldOut !== null) { record(rowNumber, product.name, null, "품절여부", product.isSoldOut, soldOut, id); product.isSoldOut = soldOut; }
    if (supplierName) { record(rowNumber, product.name, null, "매입처", product.supplierName ?? null, supplierName, id); product.supplierName = supplierName; }
    if (courier && !product.shippingPolicyId) { record(rowNumber, product.name, null, "택배사", product.courier ?? null, courier, id); product.courier = courier; }
    if (notes) { record(rowNumber, product.name, null, "상품 간략설명", product.notes ?? null, notes, id); product.notes = notes; }
    if (overseas !== null) {
      const shippingType = overseas ? "overseas" : "domestic";
      if (product.shippingType !== shippingType) {
        const replacementCategory = data.categories.find((category) => category.shippingType === shippingType);
        if (!replacementCategory) errors.push({ row: rowNumber, message: "변경할 배송유형에 사용할 수 있는 카테고리가 없습니다." });
        else {
          record(rowNumber, product.name, null, "해외배송", product.shippingType, shippingType, id);
          product.shippingType = shippingType;
          product.categoryId = replacementCategory.id;
          product.shippingPolicyId = null;
        }
      }
    }
  }

  const fileCodes = new Set([...seenCodes].filter((key) => key.startsWith("code:")).map((key) => key.slice(5)));
  const missingCount = data.products.filter((product) => product.productCode && !fileCodes.has(product.productCode.trim())).length;
  const preview: BulkWorkbookPreview = {
    totalRows,
    matchedRows,
    affectedProducts: affected.size + newProducts.length,
    changes,
    errors,
    format: "baljuora",
    newProducts: newProducts.length,
    warnings: [
      "발주오라 상품리스트 양식으로 읽었습니다. 매입원가(총 원가) → 원가(비공개), 공급가 → A단가·일반공급가로 반영되고 가격 변경은 가격변동 이력에 기록됩니다.",
      ...(newProducts.length > 0 ? [`신규 상품 ${newProducts.length}개는 '${UNCATEGORIZED_NAME}' 카테고리로 등록됩니다. 등록 후 카테고리·이미지·제철 월을 지정해 주세요.`] : []),
      ...(missingCount > 0 ? [`파일에 없는 기존 상품 ${missingCount.toLocaleString("ko-KR")}개는 변경하지 않습니다(삭제·품절 처리 없음).`] : []),
      "제철(판매 월·연중판매), 노출순서, 카테고리, 이미지는 데이터센터 값이 유지됩니다.",
      ...rowNotices.slice(0, 20),
      ...(rowNotices.length > 20 ? [`그 외 공급가 확인 필요 ${rowNotices.length - 20}건`] : [])
    ]
  };
  return { preview, drafts, affected, newProducts };
}

export async function previewBulkProductWorkbook(bytes: Uint8Array) {
  return (await buildPreview(bytes)).preview;
}

export async function applyBulkProductWorkbook(bytes: Uint8Array, changedBy: string) {
  const { preview, drafts, affected, newProducts } = await buildPreview(bytes);
  if (preview.errors.length > 0) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "오류 행을 수정한 뒤 다시 업로드해 주세요.", 400);
  }
  for (const productId of affected) {
    const product = drafts.get(productId);
    if (product) await updateProduct(product.id, asProductInput(product), changedBy);
  }
  if (newProducts.length > 0) {
    const data = await getAdminCatalog();
    const categoryIds = new Map<"domestic" | "overseas", string>();
    for (const draft of newProducts) {
      const shippingType = draft.input.shippingType;
      let categoryId = categoryIds.get(shippingType)
        ?? data.categories.find((category) => category.name === UNCATEGORIZED_NAME && category.shippingType === shippingType)?.id;
      if (!categoryId) {
        const created = await createCategory({ name: UNCATEGORIZED_NAME, shippingType, sortOrder: 9999 });
        if (!created) throw new DatabaseError("DATABASE_QUERY_FAILED", "미분류 카테고리를 만들지 못했습니다.", 502);
        categoryId = created.id;
      }
      categoryIds.set(shippingType, categoryId);
      await createProduct({ ...draft.input, categoryId });
    }
  }
  return {
    ...preview,
    appliedProducts: affected.size + newProducts.length,
    appliedChanges: preview.changes.length
  };
}
