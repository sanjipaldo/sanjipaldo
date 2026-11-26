// 공급사 거래명세서(정산 인보이스, 2026-11-26): 관리자 공급사 정산 지급 탭의 공급사 한 곳 → 판매 줄별 단가·수량·배송비와 합계,
// From(두고홀딩스)·To(공급사 사업자 정보·입금 계좌), PDF·엑셀 내려받기, 입금 계좌 저장(마이그레이션 없이 sync store).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

process.env.SKYBASE_DB_ENDPOINT = `file:${join(mkdtempSync(join(tmpdir(), "supplier-invoice-")), "test.db")}`;
const { default: app } = await import("../_core/create-app");
const { executeSql } = await import("../_core/db");
const { applyMigrations, fetchWithAuth, resetDatabase, signUpAndGetToken } = await import("../_test/helpers");

const WHOLESALE = "도매농장(테스트)";
const COMMISSION = "수수료농원(테스트)";
// 두고푸드 판매가(일반 도매 공급사 문서에는 절대 들어가면 안 되는 값)
const SALE_PRICES = [26170, 38170, 9370];

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await resetDatabase();
  await executeSql("DELETE FROM baljuora_sales_lines");
  await executeSql("DELETE FROM supplier_settlements");
  await executeSql("DELETE FROM baljuora_sync_store WHERE key IN ('supplier_settlement_settings', 'supplier_bank_accounts', 'hometax_settings')");
  await executeSql("DELETE FROM products WHERE id IN ('p-w1', 'p-w2')");
  await executeSql("DELETE FROM suppliers WHERE id IN ('sup-w', 'sup-c')");
  await executeSql("INSERT INTO suppliers (id, name, businessNumber, representative, phone, email, address, isActive) VALUES ('sup-w', ?, NULL, '도대표', '010-1111-2222', 'w@example.com', '경북 청송군 1', 1), ('sup-c', ?, '2223344444', '수대표', NULL, NULL, '세종시 2', 1)", [WHOLESALE, COMMISSION]);
  const insert = "INSERT INTO products (id, productCode, name, supplierName, costPrice, aPrice, generalPrice, salePrice, salePriceMode, shippingType, categoryId, isVisible, isSoldOut, isAlwaysOnSale, displayOrder) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'autonomous', 'domestic', 'cat-domestic-farm', 1, 0, 1, ?)";
  await executeSql(insert, ["p-w1", "W-APPLE", "청송 사과 5kg", WHOLESALE, 20000, 24000, 26000, 1]);
  await executeSql(insert, ["p-w2", "W-PEAR", "신고배 7.5kg", WHOLESALE, 30000, 35000, 38000, 2]);
});

async function adminToken() {
  const user = await signUpAndGetToken(app);
  await executeSql("UPDATE user SET role = ?, emailVerified = 1 WHERE id = ?", ["admin", user.userId!]);
  return user.token;
}

type Line = { saleDate: string; supplierName: string; productId?: string | null; productCode?: string | null; productName: string; seller: string; quantity: number; netQuantity?: number; unitPrice: number; unitCost?: number | null; ship?: number; status?: string; orderedAt?: string };

async function saleLine(id: string, line: Line) {
  const net = line.netQuantity ?? line.quantity;
  await executeSql(
    "INSERT INTO baljuora_sales_lines (id, orderId, saleDate, orderedAt, status, productId, productCode, productName, supplierName, sellerName, quantity, netQuantity, unitPrice, unitCost, amount, salesShippingFee, purchaseShippingFee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 5000, ?)",
    [id, `ORD-${id}`, line.saleDate, line.orderedAt ?? `${line.saleDate}T01:00:00Z`, line.status ?? "delivered", line.productId ?? null, line.productCode ?? null, line.productName, line.supplierName, line.seller, line.quantity, net, line.unitPrice, line.unitCost ?? null, line.unitPrice * net, line.ship ?? 0]
  );
}

async function call<T>(token: string, path: string, method = "GET", body?: unknown) {
  const res = await fetchWithAuth(app, token, `/api/baljuora${path}`, body === undefined ? { method } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = (await res.json()) as { ok: boolean; data: T; error?: { message?: string } };
  return { status: res.status, ...payload };
}

async function setSettlement(token: string, supplierId: string, body: unknown) {
  const res = await fetchWithAuth(app, token, `/api/catalog/admin/suppliers/${supplierId}/settlement`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  expect(res.status).toBe(200);
}

function numbersIn(value: unknown, found: number[] = []): number[] {
  if (typeof value === "number") found.push(value);
  else if (Array.isArray(value)) value.forEach((item) => numbersIn(item, found));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => numbersIn(item, found));
  return found;
}

const invoicePath = (kind: string, period: string, supplier: string) => `/admin/settlements/invoice?kind=${kind}&period=${period}&supplier=${encodeURIComponent(supplier)}`;

describe("공급사 거래명세서", () => {
  it("일반 도매(주 정산): 판매 줄별 공급가 × 수량 + 배송비 = 정산 화면 지급 합계, 두고푸드 판매가는 JSON·PDF·엑셀 어디에도 없음", async () => {
    const admin = await adminToken();
    await setSettlement(admin, "sup-w", { type: "wholesale", cycle: "weekly" });
    await saleLine("w1", { saleDate: "2026-11-16", supplierName: WHOLESALE, productId: "p-w1", productCode: "W-APPLE", productName: "청송 사과 5kg", seller: "하루마켓", quantity: 3, netQuantity: 2, unitPrice: 26170, unitCost: 20000, ship: 4000, orderedAt: "2026-11-16T02:00:00Z" });
    await saleLine("w2", { saleDate: "2026-11-16", supplierName: ` ${WHOLESALE} `, productId: "p-w1", productCode: "W-APPLE", productName: "청송 사과 5kg", seller: "봄상회", quantity: 1, unitPrice: 26170, unitCost: 21000, orderedAt: "2026-11-16T05:00:00Z" });
    // 발주오라 원가가 없으면 DB센터 원가(30,000원), 그것도 없으면 '공급가 확인 필요'(0원)
    await saleLine("w3", { saleDate: "2026-11-18", supplierName: WHOLESALE, productId: "p-w2", productCode: "W-PEAR", productName: "신고배 7.5kg", seller: "하루마켓", quantity: 1, unitPrice: 38170, unitCost: null, ship: 3500 });
    await saleLine("w4", { saleDate: "2026-11-19", supplierName: WHOLESALE, productId: null, productName: "모르는 상품", seller: "봄상회", quantity: 1, unitPrice: 9370, unitCost: null });
    // 다른 주 · 다른 공급사 · 매출이 아닌 상태는 빠짐
    await saleLine("w5", { saleDate: "2026-11-23", supplierName: WHOLESALE, productId: "p-w1", productName: "청송 사과 5kg", seller: "하루마켓", quantity: 9, unitPrice: 26170, unitCost: 20000 });
    await saleLine("w6", { saleDate: "2026-11-17", supplierName: COMMISSION, productName: "다른 공급사 상품", seller: "하루마켓", quantity: 2, unitPrice: 15000 });
    await saleLine("w7", { saleDate: "2026-11-17", supplierName: WHOLESALE, productId: "p-w1", productName: "청송 사과 5kg", seller: "하루마켓", quantity: 4, unitPrice: 26170, unitCost: 20000, status: "pending" });

    const res = await call<any>(admin, invoicePath("weekly", "2026-11-16", WHOLESALE));
    expect(res.status).toBe(200);
    const invoice = res.data;
    expect(invoice).toMatchObject({ kind: "weekly", period: "2026-11-16", start: "2026-11-16", end: "2026-11-22", payoutStart: "2026-11-23", payoutEnd: "2026-11-23", supplierName: WHOLESALE, status: "pending", bank: null });
    expect(invoice.number).toMatch(/^DF-W261116-[0-9A-Z]{5}$/);
    expect(invoice.settings).toEqual({ type: "wholesale", commissionRate: 10, cycle: "weekly" });
    // From: 세금계산서 신고 화면 정보가 없으면 (주) 두고홀딩스 기본 정보
    expect(invoice.from).toMatchObject({ name: "(주) 두고홀딩스", brand: "DOOGO FOOD", businessNumber: "726-87-03167", ceoName: "문원오" });
    expect(invoice.to).toMatchObject({ name: WHOLESALE, supplierId: "sup-w", registered: true, businessNumber: "", ceoName: "도대표", phone: "010-1111-2222", email: "w@example.com", address: "경북 청송군 1" });
    expect(invoice.lines.map((line: any) => [line.date, line.buyer, line.productCode, line.productName, line.orderId, line.orderedQuantity, line.quantity, line.returnQuantity, line.unitPrice, line.amount, line.shippingFee, line.total, line.costMissing])).toEqual([
      ["2026-11-16", "하루마켓", "W-APPLE", "청송 사과 5kg", "ORD-w1", 3, 2, 1, 20000, 40000, 4000, 44000, false],
      ["2026-11-16", "봄상회", "W-APPLE", "청송 사과 5kg", "ORD-w2", 1, 1, 0, 21000, 21000, 0, 21000, false],
      ["2026-11-18", "하루마켓", "W-PEAR", "신고배 7.5kg", "ORD-w3", 1, 1, 0, 30000, 30000, 3500, 33500, false],
      ["2026-11-19", "봄상회", null, "모르는 상품", "ORD-w4", 1, 1, 0, null, 0, 0, 0, true]
    ]);
    expect(invoice.days).toEqual([
      { date: "2026-11-16", lines: 2, orders: 2, quantity: 3, goodsAmount: 61000, shippingFee: 4000, total: 65000 },
      { date: "2026-11-18", lines: 1, orders: 1, quantity: 1, goodsAmount: 30000, shippingFee: 3500, total: 33500 },
      { date: "2026-11-19", lines: 1, orders: 1, quantity: 1, goodsAmount: 0, shippingFee: 0, total: 0 }
    ]);
    expect(invoice.totals).toEqual({ goodsAmount: 91000, shippingFee: 7500, total: 98500, quantity: 5, returnQuantity: 1, orders: 4, lines: 4, costMissing: 1 });
    expect(invoice.commission).toBeNull();
    // 관리자 정산 화면의 같은 공급사 금액과 같음
    const list = await call<any>(admin, "/admin/settlements?kind=weekly&period=2026-11-16");
    const row = list.data.rows.find((item: any) => item.supplierName === WHOLESALE);
    expect([row.goodsAmount, row.shippingFee, row.payoutAmount]).toEqual([91000, 7500, 98500]);
    expect(invoice.settlement).toEqual({ goodsAmount: 91000, shippingFee: 7500, payoutAmount: 98500, matches: true });
    expect(invoice.warnings).toEqual([
      "공급사 사업자등록번호가 비어 있어요. 공급사 관리에서 넣어 주세요.",
      "공급사 입금 계좌가 없어요. 아래 '입금 계좌'에서 넣어 주세요.",
      "공급가(원가)를 모르는 줄 1개는 0원으로 셌어요. 상품 원가를 채운 뒤 다시 받아 주세요."
    ]);
    expect(invoice.notes[1]).toContain("일반 도매(매입): 공급가(원가) × 판매 수량과 배송비 100%를 입금합니다.");
    // 두고푸드 판매가는 어디에도 없음
    for (const price of SALE_PRICES) expect(numbersIn(invoice)).not.toContain(price);

    // PDF: 두고푸드 인보이스 파일(제목에 번호), 파일 이름
    const pdf = await fetchWithAuth(app, admin, `/api/baljuora${invoicePath("weekly", "2026-11-16", WHOLESALE)}`.replace("/invoice?", "/invoice/file?") + "&format=pdf");
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(pdf.headers.get("cache-control")).toBe("no-store");
    expect(decodeURIComponent(pdf.headers.get("content-disposition") ?? "")).toContain(`두고푸드_거래명세서_${WHOLESALE}_2026-11-16~11-22.pdf`);
    const pdfBytes = new Uint8Array(await pdf.arrayBuffer());
    expect(Buffer.from(pdfBytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    const document = await PDFDocument.load(pdfBytes);
    expect(document.getPageCount()).toBe(1);
    expect(document.getTitle()).toBe(`두고푸드 거래명세서 ${invoice.number} - ${WHOLESALE}`);

    // 엑셀: 발주서 예시와 같은 칸 + 수식 + 합계, 판매가 없음
    const xlsx = await fetchWithAuth(app, admin, `/api/baljuora${invoicePath("weekly", "2026-11-16", WHOLESALE)}`.replace("/invoice?", "/invoice/file?") + "&format=xlsx");
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await xlsx.arrayBuffer());
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["거래명세서", "날짜별 합계"]);
    const sheet = workbook.getWorksheet("거래명세서")!;
    expect(sheet.getRow(11).values).toEqual([undefined, "No", "판매일시(발주일자)", "주문자(업체명·매출처)", "상품 관리 코드", "상품명", "수량", "상품주문코드", "비고", "상품단가(공급가)", "상품단가합", "택배비(배송비)", "합계"]);
    expect([sheet.getCell("B12").value, sheet.getCell("C12").value, sheet.getCell("F12").value, sheet.getCell("H12").value, sheet.getCell("I12").value]).toEqual(["2026-11-16 11:00", "하루마켓", 2, "반품 1개(주문 3개)", 20000]);
    expect(sheet.getCell("J12").value).toEqual({ formula: "I12*F12", result: 40000 });
    expect(sheet.getCell("L12").value).toEqual({ formula: "J12+K12", result: 44000 });
    expect(sheet.getCell("H15").value).toBe("공급가 확인 필요");
    expect([sheet.getCell("J16").value, sheet.getCell("K16").value, sheet.getCell("L16").value]).toEqual(["상품대금합계", "택배비합계", "총합계"]);
    expect(sheet.getCell("L17").value).toEqual({ formula: "SUM(L12:L15)", result: 98500 });
    const cells: unknown[] = [];
    for (const each of workbook.worksheets) each.eachRow((sheetRow) => sheetRow.eachCell((cell) => cells.push(cell.value)));
    for (const price of SALE_PRICES) expect(numbersIn(cells)).not.toContain(price);
    const days = workbook.getWorksheet("날짜별 합계")!;
    expect(days.getCell("H6").value).toEqual({ formula: "SUM(H3:H5)", result: 98500 });
  });

  it("판매수수료(월 정산): 판매 단가 × 수량(반품 뺌), 입금 계좌·지급 완료·세금계산서 공급자 정보가 들어갑니다", async () => {
    const admin = await adminToken();
    await setSettlement(admin, "sup-c", { type: "commission", commissionRate: 10, cycle: "monthly" });
    const hometax = await call(admin, "/admin/hometax/settings", "PUT", { supplier: { businessNumber: "7268703167", companyName: "(주) 두고홀딩스", ceoName: "문원오", address: "세종특별자치시 갈매로 353", businessType: "도소매", businessItem: "농축수산물", email: "tax@doogo.test" } });
    expect(hometax.status).toBe(200);
    await saleLine("c1", { saleDate: "2026-10-05", supplierName: COMMISSION, productName: "꿀사과 3kg", seller: "나도건강", quantity: 2, unitPrice: 15000, ship: 3000 });
    await saleLine("c2", { saleDate: "2026-10-20", supplierName: COMMISSION, productName: "신고배 5kg", seller: "티뷰아이", quantity: 3, netQuantity: 1, unitPrice: 12000 });
    await saleLine("c3", { saleDate: "2026-10-31", supplierName: COMMISSION, productName: "감 2kg", seller: "로코상점", quantity: 1, netQuantity: 0, unitPrice: 9000 });
    await saleLine("c4", { saleDate: "2026-11-01", supplierName: COMMISSION, productName: "다음 달", seller: "로코상점", quantity: 5, unitPrice: 9000 });

    const saved = await call<any>(admin, "/admin/settlements/bank-account", "PUT", { supplierId: "sup-c", bankName: " 농협은행 ", accountNumber: "301-1234-5678-91", accountHolder: "수수료농원" });
    expect(saved.status).toBe(200);
    expect(saved.data.bank).toEqual({ bankName: "농협은행", accountNumber: "301-1234-5678-91", accountHolder: "수수료농원" });
    const paid = await call(admin, "/admin/settlements", "PUT", { supplierName: COMMISSION, kind: "monthly", period: "2026-10", status: "paid" });
    expect(paid.status).toBe(200);

    const { status, data: invoice } = await call<any>(admin, invoicePath("monthly", "2026-10", COMMISSION));
    expect(status).toBe(200);
    expect(invoice).toMatchObject({ kind: "monthly", start: "2026-10-01", end: "2026-10-31", payoutStart: "2026-11-01", payoutEnd: "2026-11-03", status: "paid", warnings: [] });
    expect(invoice.number).toMatch(/^DF-M2610-[0-9A-Z]{5}$/);
    expect(invoice.paidAt).toEqual(expect.any(String));
    expect(invoice.from).toMatchObject({ name: "(주) 두고홀딩스", businessNumber: "726-87-03167", ceoName: "문원오", address: "세종특별자치시 갈매로 353", businessType: "도소매", businessItem: "농축수산물", email: "tax@doogo.test" });
    expect(invoice.to).toMatchObject({ name: COMMISSION, businessNumber: "222-33-44444", ceoName: "수대표" });
    expect(invoice.bank).toEqual({ bankName: "농협은행", accountNumber: "301-1234-5678-91", accountHolder: "수수료농원" });
    expect(invoice.lines.map((line: any) => [line.date, line.buyer, line.unitPrice, line.orderedQuantity, line.quantity, line.returnQuantity, line.amount, line.shippingFee, line.total])).toEqual([
      ["2026-10-05", "나도건강", 15000, 2, 2, 0, 30000, 3000, 33000],
      ["2026-10-20", "티뷰아이", 12000, 3, 1, 2, 12000, 0, 12000],
      ["2026-10-31", "로코상점", 9000, 1, 0, 1, 0, 0, 0]
    ]);
    expect(invoice.totals).toMatchObject({ goodsAmount: 42000, shippingFee: 3000, total: 45000, returnQuantity: 3 });
    expect(invoice.commission).toEqual({ rate: 10, amount: 4200 });
    expect(invoice.settlement).toEqual({ goodsAmount: 42000, shippingFee: 3000, payoutAmount: 45000, matches: true });
    expect(invoice.notes[1]).toContain("판매 수수료 10%는 이 금액에서 빼지 않고");
    const list = await call<any>(admin, "/admin/settlements?kind=monthly&period=2026-10");
    expect(list.data.rows.find((item: any) => item.supplierName === COMMISSION).payoutAmount).toBe(45000);

    const xlsx = await fetchWithAuth(app, admin, `/api/baljuora/admin/settlements/invoice/file?kind=monthly&period=2026-10&supplier=${encodeURIComponent(COMMISSION)}&format=xlsx`);
    expect(xlsx.status).toBe(200);
    expect(decodeURIComponent(xlsx.headers.get("content-disposition") ?? "")).toContain(`두고푸드_거래명세서_${COMMISSION}_2026-10.xlsx`);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await xlsx.arrayBuffer());
    const sheet = workbook.getWorksheet("거래명세서")!;
    expect(sheet.getCell("I11").value).toBe("상품단가");
    expect(sheet.getCell("H14").value).toBe("전량 반품(주문 1개)");
    // To 칸(G5~G9): 연락처가 없으면 한 줄 위로 올라와 빈 줄 없이 이어짐
    expect([5, 6, 7, 8, 9].map((row) => sheet.getCell(`G${row}`).value)).toEqual([COMMISSION, "사업자등록번호 222-33-44444 · 대표 수대표", "주소 세종시 2", "입금 계좌 농협은행 301-1234-5678-91 (예금주 수수료농원)", ""]);
    const texts: string[] = [];
    sheet.eachRow((sheetRow) => sheetRow.eachCell((cell) => { if (typeof cell.value === "string") texts.push(cell.value); }));
    expect(texts).toContain("ACCOUNT NUMBER · 계좌번호 : 301-1234-5678-91");
    const pdf = await fetchWithAuth(app, admin, `/api/baljuora/admin/settlements/invoice/file?kind=monthly&period=2026-10&supplier=${encodeURIComponent(COMMISSION)}&format=pdf`);
    expect(pdf.status).toBe(200);
    expect((await PDFDocument.load(new Uint8Array(await pdf.arrayBuffer()))).getPageCount()).toBe(1);
  });

  it("입금 계좌 검사·지우기, 잘못된 요청과 관리자 아닌 계정은 막습니다", async () => {
    const admin = await adminToken();
    const bank = (body: unknown) => call<any>(admin, "/admin/settlements/bank-account", "PUT", body);
    expect((await bank({ supplierId: "sup-c", bankName: "농협은행", accountNumber: "abc", accountHolder: "수수료농원" })).error?.message).toBe("계좌번호는 숫자와 붙임표(-)만 써 주세요.");
    expect((await bank({ supplierId: "sup-c", bankName: "농협은행", accountNumber: "123", accountHolder: "수수료농원" })).status).toBe(400);
    expect((await bank({ supplierId: "sup-c", bankName: "농협은행", accountNumber: "301-1234-5678", accountHolder: "" })).error?.message).toBe("예금주를 써 주세요.");
    expect((await bank({ supplierId: "nope", bankName: "농협은행", accountNumber: "301-1234-5678", accountHolder: "누구" })).status).toBe(404);
    const version = async () => (await (await app.fetch(new Request("http://localhost/api/catalog/version"))).json()) as unknown;
    const before = await version();
    expect((await bank({ supplierId: "sup-c", bankName: "농협은행", accountNumber: "301-1234-5678", accountHolder: "수수료농원" })).status).toBe(200);
    // 계좌 저장은 공개 단가표 '바뀜 표시'를 건드리지 않음
    expect(await version()).toEqual(before);
    const cleared = await bank({ supplierId: "sup-c", bankName: "", accountNumber: "", accountHolder: "" });
    expect(cleared.status).toBe(200);
    expect(cleared.data.bank).toBeNull();
    expect((await call<any>(admin, invoicePath("weekly", "2026-11-16", COMMISSION))).data.bank).toBeNull();

    for (const path of [
      "/admin/settlements/invoice?kind=fee&period=2026-10&supplier=x",
      "/admin/settlements/invoice?kind=weekly&period=2026-11-17&supplier=x",
      "/admin/settlements/invoice?kind=monthly&period=2026-13&supplier=x",
      "/admin/settlements/invoice?kind=weekly&period=2026-11-16",
      `/admin/settlements/invoice?kind=weekly&period=2026-11-16&supplier=${encodeURIComponent("(공급사 미지정)")}`,
      `/admin/settlements/invoice/file?kind=weekly&period=2026-11-16&supplier=x&format=doc`
    ]) expect((await call(admin, path)).status).toBe(400);
    // 공급사 목록에 없는 이름도 판매가 있으면 만들 수 있음(사업자 정보·계좌 없이)
    const unknown = await call<any>(admin, invoicePath("daily", "2026-11-20", "등록 안 한 농장"));
    expect(unknown.status).toBe(200);
    expect(unknown.data.to).toMatchObject({ name: "등록 안 한 농장", registered: false, supplierId: null });
    expect(unknown.data.warnings).toEqual(["이 기간에는 판매가 없어요.", "공급사 관리에 없는 이름이에요. 공급사로 등록하면 사업자 정보와 입금 계좌를 넣을 수 있어요."]);

    const user = await signUpAndGetToken(app);
    expect([401, 403]).toContain((await call(user.token, invoicePath("weekly", "2026-11-16", COMMISSION))).status);
    expect([401, 403]).toContain((await call(user.token, "/admin/settlements/bank-account", "PUT", { supplierId: "sup-c", bankName: "a", accountNumber: "123456", accountHolder: "b" })).status);
  });
});
