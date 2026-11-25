// 발주오라 판매·매출처(2026-11-23 관리자 요청 "1차 개발", migration 036):
// 책갈피가 보내는 매출처·주문 상품 줄 → 판매 현황(오늘·TOP10·공급사·카테고리·매출처 순위) → 매출처 DB(세금계산서 칸 고치기)
// → 홈택스 일괄발급 엑셀(세금계산서 과세 / 계산서 면세, 양식과 같은 칸) → 공급사 월 정산(10%)·정산 상태 → 공급사 센터에서 상태 보기.
// 발주오라 쪽은 책갈피가 보내는 결과 JSON으로 흉내 냅니다(실제 발주오라에 접속하지 않음).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  HOMETAX_LAYOUT,
  buildHometaxInvoices,
  hometaxRowCells,
  splitVat,
  truncateHometax,
  type HometaxBuyer,
  type HometaxSaleLine
} from "@repo/shared/baljuora-sales";
import { addDays, nextMonthKey, seoulDateKey, weekStartOf } from "@repo/shared/supplier-portal";

process.env.SKYBASE_DB_ENDPOINT = `file:${join(mkdtempSync(join(tmpdir(), "baljuora-sales-")), "test.db")}`;
const { default: app } = await import("../_core/create-app");
const { executeSql } = await import("../_core/db");
const { applyMigrations, fetchWithAuth, resetDatabase, signUpAndGetToken } = await import("../_test/helpers");

const SUPPLIER = { businessNumber: "111-22-33333", branchNumber: "", companyName: "두고푸드", ceoName: "두대표", address: "서울시 마포구 1", businessType: "도소매", businessItem: "농축수산물", email: "tax@doogo.test" };

function buyer(partial: Partial<HometaxBuyer> & { key: string }): HometaxBuyer {
  return { name: partial.companyName ?? partial.key, businessNumber: "1234567890", companyName: partial.key, ceoName: "대표", address: "서울", businessType: "도소매", businessItem: "식품", email: "", ...partial };
}

describe("홈택스 일괄발급 양식 만들기(공유 규칙)", () => {
  it("부가세 나누기: 포함이면 공급가액 = 금액 ÷ 1.1(반올림), 별도면 세액 10%", () => {
    expect(splitVat(11000, true)).toEqual({ supply: 10000, tax: 1000 });
    expect(splitVat(10000, true)).toEqual({ supply: 9091, tax: 909 });
    expect(splitVat(10000, false)).toEqual({ supply: 10000, tax: 1000 });
    expect(truncateHometax("가".repeat(60), 100)).toHaveLength(50);
  });

  it("매출처·과세구분별 월 합계 1장, 품목은 4줄까지(많으면 'OO 외 N건'), 배송비 줄, 정보가 빠진 매출처는 빼고 이유를 알립니다", () => {
    const lines: HometaxSaleLine[] = [
      ...["사과", "배", "감귤", "포도", "참외"].map((name, index) => ({ buyerKey: "b-1", productKey: name, productName: name, quantity: 2, unitPrice: 10000 - index * 1000, amount: (10000 - index * 1000) * 2, shippingFee: 0, isTaxable: false })),
      { buyerKey: "b-1", productKey: "홍삼", productName: "홍삼정", quantity: 1, unitPrice: 33000, amount: 33000, shippingFee: 3000, isTaxable: true },
      { buyerKey: "b-2", productKey: "사과", productName: "사과", quantity: 1, unitPrice: 10000, amount: 10000, shippingFee: 0, isTaxable: false },
      { buyerKey: "name:모르는상점", productKey: "배", productName: "배", quantity: 1, unitPrice: 9000, amount: 9000, shippingFee: 0, isTaxable: false }
    ];
    const buyers = new Map([["b-1", buyer({ key: "b-1", companyName: "그린마켓" })], ["b-2", buyer({ key: "b-2", companyName: "번호없음상점", businessNumber: "" })]]);
    const result = buildHometaxInvoices({ month: "2026-11", lines, buyers, settings: { vatIncluded: true, includeShipping: true } });
    expect(result.writeDate).toBe("20261130");
    expect(result.exempt).toHaveLength(1);
    const exempt = result.exempt[0];
    expect(exempt.items.map((item) => item.name)).toEqual(["사과", "배", "감귤", "포도 외 1건"]);
    expect(exempt.items[0]).toMatchObject({ day: "30", quantity: 2, unitPrice: 10000, supply: 20000, tax: 0 });
    expect(exempt.items[3]).toMatchObject({ quantity: null, unitPrice: null, supply: 14000 + 12000 });
    expect(exempt.supplyTotal).toBe(20000 + 18000 + 16000 + 26000);
    const taxable = result.taxable[0];
    expect(taxable.items.map((item) => [item.name, item.supply, item.tax])).toEqual([["홍삼정", 30000, 3000], ["배송비", 2727, 273]]);
    expect([taxable.supplyTotal, taxable.taxTotal, taxable.grossTotal]).toEqual([32727, 3273, 36000]);
    expect(result.skipped.map((skip) => [skip.buyerName, skip.reasons])).toEqual([["번호없음상점", ["사업자등록번호 없음"]], ["모르는상점", ["발주오라 매출처 정보를 아직 가져오지 않았습니다"]]]);
  });

  it("양식 한 줄: 세금계산서 59칸 / 계산서 54칸, 모두 글자, 종류코드 01/05, 등록번호는 숫자만, 마지막 칸 영수(01)", () => {
    const lines: HometaxSaleLine[] = [
      { buyerKey: "b-1", productKey: "a", productName: "사과", quantity: 3, unitPrice: 10000, amount: 30000, shippingFee: 0, isTaxable: false },
      { buyerKey: "b-1", productKey: "h", productName: "홍삼정", quantity: 2, unitPrice: 11000, amount: 22000, shippingFee: 0, isTaxable: true }
    ];
    const buyers = new Map([["b-1", buyer({ key: "b-1", companyName: "그린마켓", businessNumber: "123-45-67890", email: "green@example.com" })]]);
    const result = buildHometaxInvoices({ month: "2026-02", lines, buyers, settings: { vatIncluded: true, includeShipping: true } });
    const taxRow = hometaxRowCells("taxable", result.taxable[0], SUPPLIER, "01");
    const freeRow = hometaxRowCells("exempt", result.exempt[0], SUPPLIER, "01");
    expect(taxRow).toHaveLength(HOMETAX_LAYOUT.taxable.headers.length);
    expect(taxRow).toHaveLength(59);
    expect(freeRow).toHaveLength(54);
    expect([...taxRow, ...freeRow].every((cell) => typeof cell === "string")).toBe(true);
    expect(taxRow.slice(0, 3)).toEqual(["01", "20260228", "1112233333"]);
    expect(freeRow[0]).toBe("05");
    expect(taxRow[10]).toBe("1234567890");
    expect(taxRow[17]).toBe("green@example.com");
    // 공급가액합계·세액합계, 품목1(일자·품목·규격·수량·단가·공급가액·세액)
    expect(taxRow.slice(19, 21)).toEqual(["20000", "2000"]);
    expect(taxRow.slice(22, 29)).toEqual(["28", "홍삼정", "", "2", "10000", "20000", "2000"]);
    expect(freeRow.slice(19, 21)).toEqual(["30000", ""]);
    expect(freeRow.slice(21, 27)).toEqual(["28", "사과", "", "3", "10000", "30000"]);
    expect(taxRow[58]).toBe("01");
    expect(freeRow[53]).toBe("01");
    // 필수 칸(주황색)이 비지 않음
    for (const index of HOMETAX_LAYOUT.taxable.required) expect(taxRow[index], `세금계산서 ${index}`).not.toBe("");
    for (const index of HOMETAX_LAYOUT.exempt.required) expect(freeRow[index], `계산서 ${index}`).not.toBe("");
    expect([...taxRow, ...freeRow].some((cell) => /\d\.\d/.test(cell))).toBe(false);
  });
});

describe("발주오라 판매·매출처 → 판매 현황·매출처·홈택스·공급사 정산(API)", () => {
  const today = seoulDateKey();
  const month = today.slice(0, 7);
  const firstDay = `${month}-01`;
  // 한국 시각 낮 12시(UTC 03시)로 주문일을 정합니다.
  const at = (date: string, hour = 3) => `${date}T${String(hour).padStart(2, "0")}:00:00.000Z`;

  beforeAll(async () => {
    await applyMigrations();
  });

  beforeEach(async () => {
    await resetDatabase();
    for (const table of ["baljuora_sales_lines", "baljuora_buyers", "supplier_settlements", "supplier_sales", "supplier_accounts", "external_product_links", "baljuora_sync_jobs", "baljuora_sync_store"]) await executeSql(`DELETE FROM ${table}`);
    await executeSql("DELETE FROM products WHERE id LIKE 'sl-%'");
    await executeSql("DELETE FROM suppliers WHERE id IN ('sup-spring', 'sup-sea')");
    await executeSql("INSERT INTO suppliers (id, name, isActive) VALUES ('sup-spring', '봄날농원', 1), ('sup-sea', '바다상회', 1)");
    const insert = "INSERT INTO products (id, productCode, name, supplierName, costPrice, aPrice, generalPrice, salePrice, salePriceMode, shippingType, categoryId, isVisible, isSoldOut, isAlwaysOnSale, displayOrder) VALUES (?, ?, ?, ?, 0, 0, ?, NULL, 'autonomous', 'domestic', ?, 1, 0, 1, ?)";
    await executeSql(insert, ["sl-apple", "SL-001", "사과 5kg", "봄날농원", 26000, "cat-domestic-farm", 1]);
    await executeSql(insert, ["sl-pear", "SL-002", "배 7kg", "봄날농원", 38000, "cat-domestic-farm", 2]);
    await executeSql(insert, ["sl-ginseng", "SL-003", "홍삼정", "바다상회", 33000, "cat-domestic-health", 3]);
    const link = "INSERT INTO external_product_links (id, provider, externalProductId, externalProductCode, productId, syncStatus, rawSnapshot, lastPulledAt) VALUES (?, 'baljuora', ?, ?, ?, 'imported', ?, '2026-11-01T00:00:00Z')";
    await executeSql(link, ["l-1", "bj-apple", "SL-001", "sl-apple", JSON.stringify({ snapshot: { id: "bj-apple", isTaxable: false }, baseline: null })]);
    await executeSql(link, ["l-2", "bj-pear", "SL-002", "sl-pear", JSON.stringify({ snapshot: { id: "bj-pear" }, baseline: null })]);
    await executeSql(link, ["l-3", "bj-ginseng", "SL-003", "sl-ginseng", JSON.stringify({ snapshot: { id: "bj-ginseng" }, baseline: null })]);
  });

  async function adminToken() {
    const user = await signUpAndGetToken(app);
    await executeSql("UPDATE user SET role = ?, emailVerified = 1 WHERE id = ?", ["admin", user.userId!]);
    return user.token;
  }

  async function json<T>(res: Response) {
    return (await res.json()) as { ok: boolean; data: T; error?: { message?: string } };
  }

  async function call<T>(admin: string, path: string, method = "GET", body?: unknown) {
    const res = await fetchWithAuth(app, admin, `/api/baljuora${path}`, body === undefined ? { method } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const parsed = await json<T>(res);
    if (!parsed.ok) throw new Error(`${path}: ${parsed.error?.message}`);
    return parsed.data;
  }

  async function runner(code: string, body: Record<string, unknown>) {
    const res = await app.fetch(new Request(`http://localhost/api/baljuora/runner/${code}/results`, { method: "POST", headers: { "Content-Type": "application/json", origin: "https://console.baljuora.com" }, body: JSON.stringify(body) }));
    const parsed = await json(res);
    expect(parsed.ok, parsed.error?.message).toBe(true);
  }

  const BUYERS = [
    { id: "s-green", companyName: "그린마켓", representativeName: "김대표", businessNumber: "123-45-67890", businessType: "도소매", businessCategory: "농산물", email: "green@example.com", phone: "010-1111-2222", managerName: "박담당", zipCode: "06000", address: "서울시 강남구 1", addressDetail: "2층", groupId: "grp-1", groupName: "황금농부 수강생", status: "ACTIVE", orderAcceptType: "PREPAID", username: "green", lastLoginAt: null, joinedAt: "2026-01-02T00:00:00Z" },
    { id: "s-sea", companyName: "해변상점", representativeName: null, businessNumber: "2223344445", businessType: null, businessCategory: null, email: null, phone: null, managerName: null, zipCode: null, address: "부산시", addressDetail: null, groupId: null, groupName: null, status: "ACTIVE", orderAcceptType: null, username: null, lastLoginAt: null, joinedAt: null }
  ];

  function line(id: string, partial: Record<string, unknown>) {
    return { id, orderId: `o-${id}`, orderedAt: at(firstDay), status: "delivered", productId: "bj-apple", productCode: null, productName: "사과 5kg", supplierId: "bj-sup-1", supplierName: "발주오라 매입처명", sellerId: "s-green", sellerName: "그린마켓", quantity: 2, netQuantity: 2, supplyPrice: 26000, purchaseCost: 20000, salesShippingFee: 0, purchaseShippingFee: 0, ...partial };
  }

  const LINES = [
    line("i-1", {}),
    line("i-2", { productId: "bj-pear", productName: "배 7kg", quantity: 3, netQuantity: 2, supplyPrice: 38000, purchaseCost: 30000, salesShippingFee: 3000 }),
    line("i-3", { orderedAt: at(today, 1), productId: "bj-ginseng", productName: "홍삼정", supplyPrice: 33000, purchaseCost: 25000, quantity: 1, netQuantity: 1, sellerId: "s-sea", sellerName: "해변상점" }),
    line("i-4", { orderedAt: at(today, 2), status: "pending", quantity: 5, netQuantity: 5 }),
    line("i-5", { orderedAt: at(today, 2), productId: "bj-unknown", productName: "발주오라에만 있는 김", supplierName: "김공장", supplyPrice: 5000, purchaseCost: null, quantity: 4, netQuantity: 4, sellerId: null, sellerName: "그린마켓" })
  ];

  async function syncSales(admin: string, lines: unknown[], complete = true) {
    const created = await call<{ code: string; job: { id: string; type: string; salesRange: { start: string; end: string } } }>(admin, "/admin/jobs", "POST", { type: "sales", months: 2 });
    expect(created.job.type).toBe("sales");
    expect(created.job.salesRange).toEqual({ start: `${nextMonthKey(month, -1)}-01`, end: today });
    const start = await app.fetch(new Request(`http://localhost/api/baljuora/runner/${created.code}`, { headers: { origin: "https://console.baljuora.com" } }));
    const job = await json<{ type: string; plan: { type: string; start: string; end: string; knownTax: string[] } }>(start);
    expect(job.data.plan).toMatchObject({ type: "sales", start: `${nextMonthKey(month, -1)}-01`, end: today });
    expect(job.data.plan.knownTax).toContain("bj-apple");
    await runner(created.code, { final: false, buyers: BUYERS });
    await runner(created.code, { final: false, productTax: { "bj-ginseng": true, "bj-pear": false } });
    await runner(created.code, { final: false, salesLines: lines });
    await runner(created.code, { final: true, salesDone: { complete, error: complete ? null : "주문 3쪽에서 멈춤" } });
    return created.job.id;
  }

  it("판매·매출처 불러오기 → 판매 현황 → 공급사 센터 판매 내역 → 매출처 → 홈택스 파일 → 공급사 정산 상태", async () => {
    const admin = await adminToken();
    const jobId = await syncSales(admin, LINES);
    const job = await call<{ job: { status: string; summary: { lines: number; buyers: number; complete: boolean } } }>(admin, `/admin/jobs/${jobId}`);
    expect(job.job.status).toBe("done");
    expect(job.job.summary).toMatchObject({ lines: 5, buyers: 2, complete: true });

    // 저장된 줄: DB센터 상품 연결로 공급사·카테고리, 과세 여부(발주오라 상품 값 → 카테고리 → 기본 면세)
    const stored = await executeSql("SELECT id, productId, supplierName, categoryId, isTaxable, taxSource, amount, saleDate FROM baljuora_sales_lines ORDER BY id");
    expect(stored.rows.map((row) => [row.id, row.productId, row.supplierName, row.categoryId, Number(row.isTaxable), row.taxSource, Number(row.amount)])).toEqual([
      ["i-1", "sl-apple", "봄날농원", "cat-domestic-farm", 0, "baljuora", 52000],
      ["i-2", "sl-pear", "봄날농원", "cat-domestic-farm", 0, "baljuora", 76000],
      ["i-3", "sl-ginseng", "바다상회", "cat-domestic-health", 1, "baljuora", 33000],
      ["i-4", "sl-apple", "봄날농원", "cat-domestic-farm", 0, "baljuora", 130000],
      ["i-5", null, "김공장", null, 0, "default", 20000]
    ]);
    expect(stored.rows.find((row) => row.id === "i-3")?.saleDate).toBe(today);

    // 판매 현황(이번 달): 주문대기(i-4)는 매출에서 빼고 따로 알림
    await executeSql("UPDATE products SET imageUrl = ? WHERE id = ?", ["https://img.test/apple.jpg", "sl-apple"]);
    const summary = await call<any>(admin, `/admin/sales/summary?from=${firstDay}&to=${today}`);
    // 상품 썸네일(2026-11-24): DB센터 상품과 이어진 줄만 그 상품 이미지
    expect(summary.topProducts.find((item: any) => item.name === "사과 5kg")?.imageUrl).toBe("https://img.test/apple.jpg");
    expect(summary.topProducts.find((item: any) => item.name === "발주오라에만 있는 김")?.imageUrl).toBeNull();
    expect(summary.totals).toMatchObject({ amount: 52000 + 76000 + 33000 + 20000, quantity: 2 + 2 + 1 + 4, orders: 4, buyers: 2, returnAmount: 38000 });
    expect(summary.pending).toEqual({ count: 1, amount: 130000 });
    expect(summary.topProducts.map((item: any) => [item.name, item.amount])).toEqual([["배 7kg", 76000], ["사과 5kg", 52000], ["홍삼정", 33000], ["발주오라에만 있는 김", 20000]]);
    expect(summary.topSuppliers.map((item: any) => [item.name, item.amount])).toEqual([["봄날농원", 128000], ["바다상회", 33000], ["김공장", 20000]]);
    expect(summary.categories.map((item: any) => [item.categoryName, item.amount])).toEqual([["🥕 농산", 128000], ["💊 건강식품", 33000], ["DB센터 미연결 상품", 20000]]);
    // 매출처 id가 없는 줄(i-5)은 상호로 같은 매출처에 붙임
    expect(summary.topBuyers.map((item: any) => [item.name, item.amount])).toEqual([["그린마켓", 148000], ["해변상점", 33000]]);
    expect(summary.todaySales.totals.amount).toBe(today === firstDay ? 181000 : 53000);
    expect(summary.sync).toMatchObject({ complete: true, lines: 5, buyers: 2 });

    // 공급사 센터용 판매 내역(supplier_sales): 공급사·날짜·상품별 판매 + 반품(취소 수량)
    const sales = await executeSql("SELECT supplierName, productId, kind, quantity, amount FROM supplier_sales ORDER BY supplierName, productId, kind");
    expect(sales.rows.map((row) => [row.supplierName, row.productId, row.kind, Number(row.quantity), Number(row.amount)])).toEqual([
      ["김공장", null, "sale", 4, 20000],
      ["바다상회", "sl-ginseng", "sale", 1, 33000],
      ["봄날농원", "sl-apple", "sale", 2, 52000],
      ["봄날농원", "sl-pear", "return", 1, 38000],
      ["봄날농원", "sl-pear", "sale", 3, 114000]
    ]);

    // 매출처 DB: 이번 달 매출·주문 수, 세금계산서 정보가 빠진 매출처 표시, DB센터에서 고치기(발주오라 값은 그대로)
    const buyers = await call<any>(admin, "/admin/buyers");
    expect(buyers.total).toBe(2);
    const green = buyers.buyers.find((item: any) => item.id === "s-green");
    expect(green).toMatchObject({ companyName: "그린마켓", groupName: "황금농부 수강생", totalAmount: 148000, monthAmount: 148000, orderCount: 3, invoiceProblems: [] });
    expect(buyers.unknownSellers).toEqual([]);
    const sea = buyers.buyers.find((item: any) => item.id === "s-sea");
    expect(sea.invoiceProblems).toEqual(["대표자 성명 없음"]);
    const fixed = await call<any>(admin, "/admin/buyers/s-sea", "PUT", { overrides: { representativeName: "최대표", businessType: "소매", businessCategory: "건강식품" }, memo: "11월 첫 거래" });
    expect(fixed.invoiceProblems).toEqual([]);
    expect(fixed.overrides).toEqual({ representativeName: "최대표", businessType: "소매", businessCategory: "건강식품" });
    // 다시 동기화해도 고친 칸과 메모는 그대로
    await syncSales(admin, LINES);
    const again = await call<any>(admin, "/admin/buyers?search=해변");
    expect(again.buyers).toHaveLength(1);
    expect(again.buyers[0]).toMatchObject({ representativeName: null, memo: "11월 첫 거래", invoice: { ceoName: "최대표", businessType: "소매" } });

    // 홈택스: 공급자 정보가 없으면 파일을 만들지 않음 → 채우면 미리보기·엑셀
    const blocked = await fetchWithAuth(app, admin, `/api/baljuora/admin/hometax/file?month=${month}&kind=exempt`);
    expect(blocked.status).toBe(400);
    await call(admin, "/admin/hometax/settings", "PUT", { supplier: SUPPLIER, receiptType: "01", vatIncluded: true, includeShipping: true });
    const preview = await call<any>(admin, `/admin/hometax?month=${month}`);
    expect(preview.supplierProblems).toEqual([]);
    expect(preview.taxable.count).toBe(1);
    expect(preview.taxable.invoices[0]).toMatchObject({ companyName: "해변상점", grossTotal: 33000, supplyTotal: 30000, taxTotal: 3000 });
    expect(preview.exempt.count).toBe(1);
    expect(preview.exempt.invoices[0]).toMatchObject({ companyName: "그린마켓", grossTotal: 52000 + 76000 + 3000 + 20000, shippingTotal: 3000 });
    expect(preview.exempt.invoices[0].items.map((item: any) => item.name)).toEqual(["배 7kg", "사과 5kg", "발주오라에만 있는 김", "배송비"]);
    expect(preview.skipped).toEqual([]);
    expect(preview.taxSources).toEqual({ baljuora: 3, category: 0, default: 1 });

    const file = await fetchWithAuth(app, admin, `/api/baljuora/admin/hometax/file?month=${month}&kind=taxable`);
    expect(file.status).toBe(200);
    expect(decodeURIComponent(file.headers.get("Content-Disposition") ?? "")).toContain(`홈택스_세금계산서_과세_${month}.xlsx`);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.worksheets[0];
    expect(sheet.name).toBe("엑셀업로드양식");
    expect(sheet.getCell("A1").value).toBe(HOMETAX_LAYOUT.taxable.title);
    expect(String(sheet.getCell("A6").value)).toContain("전자(세금)계산서 종류");
    expect(String(sheet.getCell("BG6").value)).toContain("영수(01)");
    const row = sheet.getRow(7);
    const values = Array.from({ length: 59 }, (_, index) => row.getCell(index + 1).value);
    expect(values.every((value) => typeof value === "string")).toBe(true);
    expect(values.slice(0, 3)).toEqual(["01", `${month.replace("-", "")}${String(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate())}`, "1112233333"]);
    expect(values[12]).toBe("해변상점");
    expect(values[13]).toBe("최대표");
    expect(values.slice(19, 21)).toEqual(["30000", "3000"]);
    expect(row.getCell(1).numFmt).toBe("@");
    expect(sheet.getRow(8).getCell(1).value).toBeNull();

    // 두고푸드 수익 나눠 보기(2026-11-25): 처음에는 모두 판매수수료 10%(김공장은 공급사 목록에 없어 기본값)
    let breakdown = (await call<any>(admin, `/admin/sales/summary?from=${firstDay}&to=${today}`)).breakdown;
    expect(breakdown).toMatchObject({
      commission: { amount: 181000, fee: 12800 + 3300 + 2000, suppliers: 3, minRate: 10, maxRate: 10 },
      wholesale: { amount: 0, cost: 0, margin: 0, suppliers: 0 },
      shipping: { received: 3000, paid: 0, margin: 3000 },
      unassigned: { amount: 20000, suppliers: 1 },
      profit: 18100 + 3000
    });
    // 정산 방식 바꾸기: 봄날농원 = 판매수수료 10% · 월 정산, 바다상회 = 일반 도매(매입) · 주 정산
    const setSettlement = (id: string, body: unknown) => fetchWithAuth(app, admin, `/api/catalog/admin/suppliers/${id}/settlement`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect((await setSettlement("sup-spring", { type: "commission", commissionRate: 10, cycle: "monthly" })).status).toBe(200);
    expect((await setSettlement("sup-sea", { type: "wholesale", cycle: "weekly" })).status).toBe(200);
    breakdown = (await call<any>(admin, `/admin/sales/summary?from=${firstDay}&to=${today}`)).breakdown;
    expect(breakdown).toMatchObject({
      commission: { amount: 148000, fee: 12800 + 2000, suppliers: 2 },
      wholesale: { amount: 33000, cost: 25000, margin: 8000, suppliers: 1, costMissing: 0 },
      profit: 14800 + 8000 + 3000
    });

    // 월 정산 지급(?month= 그대로): 월 정산 공급사만, 주 정산 공급사는 따로 셈
    let settlements = await call<any>(admin, `/admin/settlements?month=${month}`);
    const spring = () => settlements.rows.find((item: any) => item.supplierName === "봄날농원");
    expect(settlements.kind).toBe("monthly");
    expect(settlements.rows.map((item: any) => item.supplierName)).toEqual(["봄날농원"]);
    expect(spring()).toMatchObject({ registered: true, type: "commission", cycle: "monthly", saleAmount: 166000, returnAmount: 38000, netAmount: 128000, commissionRate: 10, commission: 12800, goodsAmount: 128000, shippingFee: 0, payoutAmount: 128000, status: "pending", recorded: null });
    expect(settlements.otherCycle).toEqual({ suppliers: 2, payoutAmount: 25000 + 20000 });
    const paid = await call<any>(admin, "/admin/settlements", "PUT", { supplierName: "봄날농원", month, status: "paid", memo: "12/1 국민 입금" });
    expect(paid.state).toMatchObject({ status: "paid", saleAmount: 128000, commission: 12800, payoutAmount: 128000, memo: "12/1 국민 입금" });
    expect(paid.state.paidAt).toBeTruthy();
    // 예전 월 정산의 "정산 완료"(지급 + 수수료 확인)도 받습니다
    const done = await call<any>(admin, "/admin/settlements", "PUT", { supplierName: "봄날농원", month, status: "done" });
    expect(done.state).toMatchObject({ status: "done", memo: "12/1 국민 입금" });
    expect(done.state.paidAt).toBe(paid.state.paidAt);
    expect(done.state.doneAt).toBeTruthy();
    settlements = await call<any>(admin, `/admin/settlements?month=${month}`);
    expect(spring()).toMatchObject({ status: "done", changedAfterRecord: false, recorded: { saleAmount: 128000, commission: 12800, payoutAmount: 128000 } });
    expect(settlements.totals).toMatchObject({ done: 1, payoutAmount: 128000 });

    // 주 정산 지급: 이번 주(월요일 날짜) 판매분 → 다음 주 월요일. 도매는 원가 × 수량, 공급사 목록에 없는 매입처는 판매수수료 10% 기본값
    const week = weekStartOf(today);
    const weekly = await call<any>(admin, `/admin/settlements?kind=weekly&period=${week}`);
    expect(weekly.payoutFrom).toBe(addDays(week, 7));
    expect(weekly.rows.map((item: any) => item.supplierName).sort()).toEqual(["김공장", "바다상회"]);
    expect(weekly.rows.find((item: any) => item.supplierName === "바다상회")).toMatchObject({ type: "wholesale", netAmount: 33000, goodsAmount: 25000, payoutAmount: 25000, commission: 0, doogoProfit: 8000 });
    expect(weekly.rows.find((item: any) => item.supplierName === "김공장")).toMatchObject({ registered: false, type: "commission", goodsAmount: 20000, commission: 2000, payoutAmount: 20000 });
    const weeklyPaid = await call<any>(admin, "/admin/settlements", "PUT", { supplierName: "바다상회", kind: "weekly", period: week, status: "paid", memo: "월요일 입금" });
    expect(weeklyPaid.state).toMatchObject({ status: "paid", payoutAmount: 25000, commission: 0, memo: "월요일 입금" });
    const put = (body: unknown) => fetchWithAuth(app, admin, "/api/baljuora/admin/settlements", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect((await put({ supplierName: "바다상회", kind: "weekly", period: week, status: "done" })).status).toBe(400);
    expect((await put({ supplierName: "바다상회", kind: "weekly", period: addDays(week, 1), status: "paid" })).status).toBe(400);
    expect((await fetchWithAuth(app, admin, `/api/baljuora/admin/settlements?kind=weekly&period=${addDays(week, 2)}`)).status).toBe(400);

    // 정산 완료 뒤 반품이 들어오면(다시 동기화) 금액이 바뀌었다고 알림
    await syncSales(admin, LINES.map((item) => item.id === "i-1" ? { ...item, netQuantity: 1 } : item));
    settlements = await call<any>(admin, `/admin/settlements?month=${month}`);
    expect(spring()).toMatchObject({ status: "done", netAmount: 102000, changedAfterRecord: true });

    // 판매 수수료 청구(달마다): 판매수수료 방식 공급사만(도매 바다상회는 없음). 예전 월 정산 "정산 완료"는 수수료 입금 확인으로 봄
    const fees = await call<any>(admin, `/admin/settlements?kind=fee&period=${month}`);
    expect(fees.rows.map((item: any) => [item.supplierName, item.commission, item.status])).toEqual([["봄날농원", 10200, "done"], ["김공장", 2000, "pending"]]);
    expect(fees.totals).toMatchObject({ commission: 12200, pending: 1, done: 1 });
    expect(fees.payoutFrom).toBe(`${nextMonthKey(month)}-01`);
    const invoiced = await call<any>(admin, "/admin/settlements", "PUT", { supplierName: "김공장", kind: "fee", period: month, status: "paid" });
    expect(invoiced.state).toMatchObject({ status: "paid", commission: 2000 });

    // 공급사 센터: 봄날농원 계정으로 판매·정산 상태를 봄
    expect((await fetchWithAuth(app, admin, "/api/catalog/admin/suppliers/sup-spring/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "spring", password: "spring" }) })).status).toBe(201);
    const signIn = await app.fetch(new Request("http://localhost/api/auth/sign-in/username", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" }, body: JSON.stringify({ username: "spring", password: "spring" }) }));
    const supplierToken = signIn.headers.get("set-auth-token")!;
    const supplierSales = await json<any>(await fetchWithAuth(app, supplierToken, `/api/supplier/sales?month=${month}`));
    expect(supplierSales.ok).toBe(true);
    expect(supplierSales.data.hasAnySales).toBe(true);
    expect(supplierSales.data).toMatchObject({ type: "commission", cycle: "monthly" });
    expect(supplierSales.data.totals).toMatchObject({ saleAmount: 166000, returnAmount: 64000, netAmount: 102000, commission: 10200 });
    expect(supplierSales.data.settlements[0].state).toMatchObject({ status: "done", memo: "12/1 국민 입금" });
    expect(supplierSales.data.fees.find((fee: any) => fee.month === month)).toMatchObject({ commission: 10200, state: { status: "done" } });
  });

  it("판매 수수료: 한 번에 청구 → 입금 확인 → 홈택스 세금계산서(판매대행·마케팅대행 수수료) 파일 → 발행 완료 표시, 공급사 센터에도 보임", async () => {
    const admin = await adminToken();
    await syncSales(admin, LINES);
    const setSettlement = (id: string, body: unknown) => fetchWithAuth(app, admin, `/api/catalog/admin/suppliers/${id}/settlement`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect((await setSettlement("sup-spring", { type: "commission", commissionRate: 10, cycle: "monthly" })).status).toBe(200);
    expect((await setSettlement("sup-sea", { type: "wholesale", cycle: "weekly" })).status).toBe(200);
    // 공급받는자(봄날농원) 정보는 공급사 관리에서 채움
    await executeSql("UPDATE suppliers SET businessNumber = ?, representative = ?, address = ?, email = ? WHERE id = 'sup-spring'", ["222-33-44444", "봄대표", "충북 청주시 1", "spring@example.com"]);
    await call(admin, "/admin/hometax/settings", "PUT", { supplier: SUPPLIER, receiptType: "01", vatIncluded: true, includeShipping: true });
    const feeList = () => call<any>(admin, `/admin/settlements?kind=fee&period=${month}`);
    const lastDay = String(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate());
    const monthNumber = Number(month.slice(5));

    // 수수료 = 판매 대금(배송비 제외) × 10% — 기본은 부가세 포함(12,800 = 공급가 11,636 + 세액 1,164)
    let fees = await feeList();
    expect(fees.rows.map((item: any) => [item.supplierName, item.commission, item.status])).toEqual([["봄날농원", 12800, "pending"], ["김공장", 2000, "pending"]]);
    expect(fees.rows[0]).toMatchObject({ netAmount: 128000, invoiceAmounts: { supply: 11636, tax: 1164, total: 12800 }, taxProblems: [], invoice: { issued: false } });
    expect(fees.rows[1].taxProblems).toEqual(["공급사 관리에 없는 이름(공급사로 등록해 주세요)"]);
    expect(fees.invoice).toMatchObject({ vatIncluded: true, item: "판매대행·마케팅대행 수수료", writeDate: `${month}-${lastDay}`, supplierProblems: [], issued: 0, ready: [], missingInfo: [{ supplierName: "김공장", supplierId: null }] });

    // 한 번에 청구하기(청구 전 → 청구함 · 입금 대기)
    const billed = await call<any>(admin, "/admin/settlements/bulk", "PUT", { kind: "fee", period: month, status: "paid", supplierNames: ["봄날농원", "김공장", "봄날농원"] });
    expect(billed.updated).toBe(2);
    expect(billed.states.map((state: any) => [state.status, state.commission])).toEqual([["paid", 12800], ["paid", 2000]]);
    const bulk = (body: unknown) => fetchWithAuth(app, admin, "/api/baljuora/admin/settlements/bulk", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect((await bulk({ kind: "weekly", period: weekStartOf(today), status: "done", supplierNames: ["바다상회"] })).status).toBe(400);
    expect((await bulk({ kind: "fee", period: month, status: "paid", supplierNames: [] })).status).toBe(400);
    fees = await feeList();
    expect(fees.totals).toMatchObject({ paid: 2, pending: 0, done: 0 });

    // 입금 확인 전에는 기본 파일 대상이 없음. 골라서 받으면 청구(02)로 만듦
    const invoiceFile = (query = "") => fetchWithAuth(app, admin, `/api/baljuora/admin/settlements/fee-invoice-file?month=${month}${query}`);
    expect((await invoiceFile()).status).toBe(404);
    const readRow = async (res: Response) => {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await res.arrayBuffer());
      const sheet = workbook.worksheets[0];
      expect(sheet.getRow(8).getCell(1).value).toBeNull();
      return Array.from({ length: 59 }, (_, index) => sheet.getRow(7).getCell(index + 1).value);
    };
    const billedFile = await invoiceFile(`&supplier=${encodeURIComponent("봄날농원")}`);
    expect(billedFile.status).toBe(200);
    expect((await readRow(billedFile))[58]).toBe("02");
    // 공급사 관리에 없는 매입처는 이유와 함께 막음
    const blocked = await invoiceFile(`&supplier=${encodeURIComponent("김공장")}`);
    expect(blocked.status).toBe(404);
    expect((await json(blocked)).error?.message).toContain("김공장: 공급사 관리에 없는 이름");

    // 입금 확인 → 정산 완료. 이제 홈택스 파일 기본 대상(입금 확인 + 발행 전)
    await call(admin, "/admin/settlements", "PUT", { supplierName: "봄날농원", kind: "fee", period: month, status: "done" });
    fees = await feeList();
    expect(fees.invoice.ready).toEqual(["봄날농원"]);
    const file = await invoiceFile();
    expect(file.status).toBe(200);
    expect(decodeURIComponent(file.headers.get("Content-Disposition") ?? "")).toContain(`홈택스_판매수수료_세금계산서_${month}.xlsx`);
    expect(JSON.parse(decodeURIComponent(file.headers.get("X-Doogo-Invoice-Suppliers") ?? "[]"))).toEqual(["봄날농원"]);
    const values = await readRow(file);
    expect(values.every((value) => typeof value === "string")).toBe(true);
    // 공급자 = 두고푸드, 공급받는자 = 공급사, 작성일자 = 그 달 말일, 영수(01)
    expect(values.slice(0, 6)).toEqual(["01", `${month.replace("-", "")}${lastDay}`, "1112233333", "", "두고푸드", "두대표"]);
    expect(values.slice(10, 15)).toEqual(["2223344444", "", "봄날농원", "봄대표", "충북 청주시 1"]);
    expect(values[17]).toBe("spring@example.com");
    expect(values.slice(19, 21)).toEqual(["11636", "1164"]);
    expect(values.slice(22, 30)).toEqual([lastDay, `판매대행·마케팅대행 수수료(${monthNumber}월분)`, "10%", "", "", "11636", "1164", `${monthNumber}월 판매 대금 128,000원(배송비 제외) × 10%`]);
    expect(values[30]).toBe("");
    expect(values[58]).toBe("01");
    for (const index of HOMETAX_LAYOUT.taxable.required) expect(values[index], `세금계산서 ${index}`).not.toBe("");

    // 홈택스에서 발행한 뒤 "발행 완료로 표시" → 기본 파일 대상에서 빠지고, 되돌릴 수 있음
    const marked = await call<any>(admin, "/admin/settlements/fee-invoices", "POST", { month, supplierNames: ["봄날농원"], issued: true });
    expect(marked.states).toEqual([expect.objectContaining({ issued: true, amount: 12800 })]);
    fees = await feeList();
    expect(fees.rows[0]).toMatchObject({ status: "done", invoice: { issued: true, amount: 12800 } });
    expect(fees.rows.map((item: any) => item.supplierName)).toEqual(["봄날농원", "김공장"]);
    expect(fees.invoice).toMatchObject({ issued: 1, ready: [] });
    expect((await invoiceFile()).status).toBe(404);
    await call(admin, "/admin/settlements/fee-invoices", "POST", { month, supplierNames: ["봄날농원"], issued: false });
    expect((await feeList()).invoice).toMatchObject({ issued: 0, ready: ["봄날농원"] });
    await call(admin, "/admin/settlements/fee-invoices", "POST", { month, supplierNames: ["봄날농원"], issued: true });

    // 부가세 별도로 바꾸면 수수료 12,800 + 세액 1,280 = 14,080원을 받음
    await call(admin, "/admin/hometax/settings", "PUT", { commissionVatIncluded: false });
    fees = await feeList();
    expect(fees.invoice.vatIncluded).toBe(false);
    expect(fees.rows[0].invoiceAmounts).toEqual({ supply: 12800, tax: 1280, total: 14080 });
    expect((await call<any>(admin, "/admin/hometax/settings")).settings).toMatchObject({ commissionVatIncluded: false, vatIncluded: true, supplier: { companyName: "두고푸드" } });

    // 공급사 센터: 낼 금액(부가세 포함)·입금 확인·세금계산서 발행을 봄
    expect((await fetchWithAuth(app, admin, "/api/catalog/admin/suppliers/sup-spring/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "spring", password: "spring" }) })).status).toBe(201);
    const signIn = await app.fetch(new Request("http://localhost/api/auth/sign-in/username", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" }, body: JSON.stringify({ username: "spring", password: "spring" }) }));
    const supplierSales = await json<any>(await fetchWithAuth(app, signIn.headers.get("set-auth-token")!, `/api/supplier/sales?month=${month}`));
    expect(supplierSales.ok).toBe(true);
    expect(supplierSales.data.fees.find((fee: any) => fee.month === month)).toMatchObject({
      commission: 12800,
      vatIncluded: false,
      amounts: { supply: 12800, tax: 1280, total: 14080 },
      state: { status: "done" },
      invoice: { issued: true, amount: 12800 }
    });
  });

  it("끝까지 읽은 동기화만 기간 안에서 사라진 줄을 지웁니다(중간에 멈추면 그대로 둠)", async () => {
    const admin = await adminToken();
    await syncSales(admin, LINES);
    await syncSales(admin, LINES.filter((item) => item.id !== "i-5"), false);
    expect((await executeSql("SELECT id FROM baljuora_sales_lines ORDER BY id")).rows.map((row) => row.id)).toEqual(["i-1", "i-2", "i-3", "i-4", "i-5"]);
    await syncSales(admin, LINES.filter((item) => item.id !== "i-5"), true);
    expect((await executeSql("SELECT id FROM baljuora_sales_lines ORDER BY id")).rows.map((row) => row.id)).toEqual(["i-1", "i-2", "i-3", "i-4"]);
    // 지난 기간(동기화 범위 밖)의 줄은 건드리지 않음
    const old = addDays(`${nextMonthKey(month, -1)}-01`, -3);
    await executeSql("INSERT INTO baljuora_sales_lines (id, saleDate, productName, quantity, netQuantity, unitPrice, amount) VALUES ('old-1', ?, '옛 판매', 1, 1, 1000, 1000)", [old]);
    await syncSales(admin, LINES, true);
    expect((await executeSql("SELECT id FROM baljuora_sales_lines WHERE id = 'old-1'")).rows).toHaveLength(1);
  });

  it("비교 작업도 판매·매출처를 함께 읽고(설정으로 끌 수 있음), 판매 줄은 받는 사람 정보 없이 정리해 저장합니다", async () => {
    const admin = await adminToken();
    const created = await call<{ code: string; job: { salesRange: unknown } }>(admin, "/admin/jobs", "POST", { type: "compare" });
    expect(created.job.salesRange).toEqual({ start: `${nextMonthKey(month, -1)}-01`, end: today });
    await runner(created.code, { final: false, snapshots: [{ id: "bj-apple", kind: "product", code: "SL-001", name: "사과 5kg", supplyPrice: 26000, consumerPrice: null, purchaseCost: 20000, imageUrls: [], isVisible: true, isSoldOut: false, updatedAt: null, isTaxable: false }] });
    await runner(created.code, { final: false, buyers: BUYERS.slice(0, 1), salesLines: [{ ...LINES[0], recipientName: "홍길동", recipientPhone: "010-9999-0000" }] });
    await runner(created.code, { final: true, salesDone: { complete: true } });
    const job = await call<any>(admin, "/admin/jobs");
    expect(job.jobs[0].summary).toMatchObject({ received: 1, sales: { lines: 1, buyers: 1, complete: true } });
    const columns = await executeSql("SELECT * FROM baljuora_sales_lines");
    expect(JSON.stringify(columns.rows)).not.toMatch(/홍길동|010-9999/);
    const link = await executeSql("SELECT rawSnapshot FROM external_product_links WHERE externalProductId = 'bj-apple'");
    expect(JSON.parse(String(link.rows[0].rawSnapshot)).snapshot.isTaxable).toBe(false);

    await call(admin, "/admin/settings", "PUT", { salesOnCompare: false });
    const plain = await call<{ job: { salesRange: unknown } }>(admin, "/admin/jobs", "POST", { type: "compare" });
    expect(plain.job.salesRange).toBeNull();
  });
});
