// 공급사 거래명세서 내려받기 파일(2026-11-26 관리자 요청: 카카오톡·이메일로 공급사에 보낼 "두고푸드 전용 거래 인보이스").
// - PDF(A4 세로): 왼쪽 위 두고푸드 로고 + From(두고홀딩스), 오른쪽 위 INVOICE · 거래명세서 번호 · 지급 합계(Balance Due),
//   To(공급사 사업자 정보 · 입금 계좌)와 발행일·거래 기간·지급 예정일, 판매 줄 표(날짜별 소계), 합계, 메모, 입금 계좌, 쪽 번호.
//   줄이 많으면 다음 쪽에 표 머리를 다시 그립니다. 글꼴은 제안서 PDF와 같은 두고푸드 글꼴(글꼴에 없는 드문 글자는 뺌).
// - 엑셀: 관리자가 보내 준 발주서 예시와 같은 칸(발주일자 · 업체명 · 상품명 · 수량 · 주문번호 · 비고 ·
//   상품단가 · 상품단가합(=단가×수량) · 택배비 · 합계(=단가합+택배비)) + 맨 아래 상품대금합계 · 택배비합계 · 총합계(SUM),
//   위에는 From/To·기간, 둘째 시트는 날짜별 합계.
// - 2026-11-27 관리자 요청: 긴 주문 코드 대신 "주문번호 : 6자리"(orderNumberOf), 상품 코드는 PDF·엑셀·팝업 모두에서 뺌.
import ExcelJS from "exceljs";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import {
  bankAccountLabel,
  invoiceDate,
  invoiceDayLabel,
  invoicePayoutLabel,
  invoicePeriodLabel,
  invoiceReference,
  invoiceSettingsLabel,
  invoiceStatusLabel,
  orderNumberLabel,
  type InvoiceParty,
  type SupplierInvoice,
  type SupplierInvoiceLine
} from "@repo/shared/supplier-invoice";
import { DOOGO_FOOD_LOGO_PNG_BASE64, DOOGO_FOOD_LOGO_SIZE } from "./invoice-logo-data";
import { doogoSansFontBytes } from "./partner-proposal";

const THANKS = "두고푸드와 거래해 주셔서 감사합니다. THANKS FOR YOUR BUSINESS.";
const FOOTER = "(주) 두고홀딩스 · DOOGO FOOD · doogofood.site — 두고푸드 공급사 정산 거래명세서";

export function formatNumber(value: number) {
  const rounded = Math.round(value);
  const text = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return rounded < 0 ? `-${text}` : text;
}

const won = (value: number) => `₩${formatNumber(value)}`;

/** 주문 시각(ISO) → 한국 시각 "2026-11-16 10:05" */
export function seoulDateTimeLabel(iso: string | null, fallbackDate: string) {
  if (!iso) return fallbackDate;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return fallbackDate;
  const text = new Date(time + 9 * 3600_000).toISOString();
  return `${text.slice(0, 10)} ${text.slice(11, 16)}`;
}

function partyLines(party: InvoiceParty, kind: "from" | "to", bankLabel?: string) {
  const lines: string[] = [];
  const idLine = [party.businessNumber ? `사업자등록번호 ${party.businessNumber}` : kind === "to" ? "사업자등록번호 미등록" : "", party.ceoName ? `대표 ${party.ceoName}` : ""].filter(Boolean).join(" · ");
  if (idLine) lines.push(idLine);
  if (kind === "to") {
    const contact = [party.phone ? `연락처 ${party.phone}` : "", party.email ? `이메일 ${party.email}` : ""].filter(Boolean).join(" · ");
    if (contact) lines.push(contact);
  }
  if (party.address) lines.push(kind === "to" ? `주소 ${party.address}` : party.address);
  if (kind === "from") {
    const business = [party.businessType ? `업태 ${party.businessType}` : "", party.businessItem ? `종목 ${party.businessItem}` : ""].filter(Boolean).join(" · ");
    if (business) lines.push(business);
    const web = [party.website, party.email].filter(Boolean).join(" · ");
    if (web) lines.push(web);
  }
  if (bankLabel !== undefined) lines.push(bankLabel ? `입금 계좌 ${bankLabel}` : "입금 계좌 미등록");
  return lines;
}

// ── PDF ──────────────────────────────────────────────────────────────────────

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const RIGHT = PAGE_WIDTH - MARGIN;
const CONTENT_WIDTH = RIGHT - MARGIN;
const BODY_LIMIT = PAGE_HEIGHT - 64; // 이 아래(위에서 잰 값)는 쪽 아래 글자 자리

function hex(value: string): RGB {
  const number = Number.parseInt(value.replace("#", ""), 16);
  return rgb(((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255);
}

const COLOR = {
  ink: hex("#1A1D17"),
  body: hex("#454745"),
  mute: hex("#868685"),
  line: hex("#E3E6E0"),
  green: hex("#4B9A2F"),
  deep: hex("#163300"),
  soft: hex("#F3F5F1"),
  red: hex("#C0262D"),
  amber: hex("#8A5A00"),
  amberBg: hex("#FFF4CC"),
  greenBg: hex("#E2F6D5"),
  white: rgb(1, 1, 1)
};

type Align = "left" | "right" | "center";
type TextOptions = { size?: number; bold?: boolean; color?: RGB; align?: Align; maxWidth?: number };

class InvoicePdf {
  page!: PDFPage;
  y = 0; // 위에서 잰 현재 위치
  private readonly charset: Set<number>;

  constructor(readonly doc: PDFDocument, readonly regular: PDFFont, readonly bold: PDFFont, readonly logo: PDFImage) {
    this.charset = new Set(regular.getCharacterSet());
  }

  /** 글꼴에 없는 글자(드문 한자·이모지 등)를 빼고, 호환 글자(㈜ ￦ ㎏ 전각 문자)는 보통 글자로 바꿉니다. */
  clean(value: string | null | undefined) {
    return Array.from((value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim()).filter((char) => this.charset.has(char.codePointAt(0) ?? 0)).join("");
  }

  font(bold?: boolean) {
    return bold ? this.bold : this.regular;
  }

  width(value: string, size: number, bold?: boolean) {
    return this.font(bold).widthOfTextAtSize(value, size);
  }

  ellipsize(value: string, size: number, maxWidth: number, bold?: boolean) {
    if (this.width(value, size, bold) <= maxWidth) return value;
    let text = value;
    while (text && this.width(`${text}…`, size, bold) > maxWidth) text = Array.from(text).slice(0, -1).join("");
    return `${text.trimEnd()}…`;
  }

  /** 너비에 맞춰 줄을 나눕니다(띄어쓰기에서 먼저 나누고, 긴 낱말은 글자 단위). maxLines를 넘으면 마지막 줄을 …로 줄입니다. */
  wrap(raw: string, size: number, maxWidth: number, maxLines: number, bold?: boolean) {
    const value = this.clean(raw);
    if (!value) return [];
    const lines: string[] = [];
    let current = "";
    for (const token of value.split(/(\s+)/).filter(Boolean)) {
      if (this.width(current + token, size, bold) <= maxWidth) {
        current += token;
        continue;
      }
      if (/^\s+$/.test(token)) {
        if (current) lines.push(current.trimEnd());
        current = "";
        continue;
      }
      if (current.trim()) lines.push(current.trimEnd());
      current = "";
      for (const char of token) {
        if (current && this.width(current + char, size, bold) > maxWidth) {
          lines.push(current);
          current = "";
        }
        current += char;
      }
    }
    if (current.trim()) lines.push(current.trimEnd());
    if (lines.length <= maxLines) return lines;
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = this.ellipsize(`${kept[maxLines - 1]} ${lines.slice(maxLines).join(" ")}`, size, maxWidth, bold);
    return kept;
  }

  /** baseline = 위에서 잰 글자 바닥선 */
  text(raw: string, x: number, baseline: number, options: TextOptions = {}) {
    const size = options.size ?? 8;
    let value = this.clean(raw);
    if (!value) return 0;
    if (options.maxWidth) value = this.ellipsize(value, size, options.maxWidth, options.bold);
    const width = this.width(value, size, options.bold);
    const left = options.align === "right" ? x - width : options.align === "center" ? x - width / 2 : x;
    this.page.drawText(value, { x: left, y: PAGE_HEIGHT - baseline, size, font: this.font(options.bold), color: options.color ?? COLOR.ink });
    return width;
  }

  rect(x: number, top: number, width: number, height: number, color: RGB) {
    this.page.drawRectangle({ x, y: PAGE_HEIGHT - top - height, width, height, color });
  }

  roundRect(x: number, top: number, width: number, height: number, radius: number, color: RGB) {
    const r = Math.min(radius, height / 2, width / 2);
    const path = `M ${r} 0 H ${width - r} A ${r} ${r} 0 0 1 ${width} ${r} V ${height - r} A ${r} ${r} 0 0 1 ${width - r} ${height} H ${r} A ${r} ${r} 0 0 1 0 ${height - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
    this.page.drawSvgPath(path, { x, y: PAGE_HEIGHT - top, color });
  }

  hline(x1: number, x2: number, top: number, color = COLOR.line, thickness = 0.6) {
    this.page.drawLine({ start: { x: x1, y: PAGE_HEIGHT - top }, end: { x: x2, y: PAGE_HEIGHT - top }, thickness, color });
  }

  addPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = MARGIN;
  }

  drawLogo(top: number, height: number) {
    const width = height * (DOOGO_FOOD_LOGO_SIZE.width / DOOGO_FOOD_LOGO_SIZE.height);
    this.page.drawImage(this.logo, { x: MARGIN, y: PAGE_HEIGHT - top - height, width, height });
  }
}

type Column = { key: "date" | "buyer" | "product" | "qty" | "unit" | "amount" | "ship" | "total"; label: string; width: number; align: Align };

function columnsFor(invoice: SupplierInvoice) {
  const columns: Column[] = [
    { key: "date", label: "판매일", width: 42, align: "left" },
    { key: "buyer", label: "주문자(매출처)", width: 86, align: "left" },
    { key: "product", label: "상품명 · 주문번호", width: 157, align: "left" },
    { key: "qty", label: "수량", width: 36, align: "right" },
    { key: "unit", label: invoice.settings.type === "wholesale" ? "공급가" : "단가", width: 50, align: "right" },
    { key: "amount", label: "금액", width: 56, align: "right" },
    { key: "ship", label: "배송비", width: 42, align: "right" },
    { key: "total", label: "합계", width: 46, align: "right" }
  ];
  let x = MARGIN;
  return columns.map((column) => {
    const placed = { ...column, x };
    x += column.width;
    return placed;
  });
}

type PlacedColumn = ReturnType<typeof columnsFor>[number];
const PAD = 5;
const TEXT = 7.8;
const LINE = 10.2;
const META = 6.6;
const META_LINE = 8.6;

function cellX(column: PlacedColumn) {
  return column.align === "right" ? column.x + column.width - PAD : column.x + PAD;
}

function drawTableHead(pdf: InvoicePdf, columns: PlacedColumn[]) {
  const height = 21;
  pdf.rect(MARGIN, pdf.y, CONTENT_WIDTH, height, COLOR.deep);
  for (const column of columns) pdf.text(column.label, cellX(column), pdf.y + 13.8, { size: 7.4, bold: true, color: COLOR.white, align: column.align, maxWidth: column.width - PAD * 2 });
  pdf.y += height;
}

function drawContinuationHead(pdf: InvoicePdf, invoice: SupplierInvoice) {
  pdf.drawLogo(MARGIN - 6, 20);
  pdf.text(`거래명세서 # ${invoice.number} · ${invoice.supplierName} (계속)`, RIGHT, MARGIN + 9, { size: 8, color: COLOR.mute, align: "right", maxWidth: CONTENT_WIDTH - 90 });
  pdf.y = MARGIN + 30;
}

type PreparedRow = { line: SupplierInvoiceLine; height: number; buyer: string[]; product: string[]; meta: string[] };

function prepareRow(pdf: InvoicePdf, line: SupplierInvoiceLine, columns: PlacedColumn[]): PreparedRow {
  const width = (key: Column["key"]) => (columns.find((column) => column.key === key)?.width ?? 50) - PAD * 2;
  const buyer = pdf.wrap(line.buyer, TEXT, width("buyer"), 2);
  const product = pdf.wrap(line.productName, TEXT, width("product"), 2);
  // 상품명 아래 한 줄: "주문번호 : 7K2Q9M"(2026-11-27 — 긴 주문 코드·상품 코드는 넣지 않음)
  const label = pdf.clean(orderNumberLabel(line));
  const meta = label ? [pdf.ellipsize(label, META, width("product"))] : [];
  const content = Math.max(LINE + META_LINE, buyer.length * LINE, product.length * LINE + meta.length * META_LINE, line.returnQuantity > 0 ? LINE + META_LINE : LINE);
  return { line, height: content + 11, buyer, product, meta };
}

function drawRow(pdf: InvoicePdf, row: PreparedRow, columns: PlacedColumn[]) {
  const { line } = row;
  const top = pdf.y;
  const first = top + 6 + TEXT;
  const at = (key: Column["key"]) => columns.find((column) => column.key === key) as PlacedColumn;
  const [, month, day] = line.date.split("-").map(Number);
  pdf.text(`${month}.${day}`, cellX(at("date")), first, { size: TEXT });
  pdf.text(invoiceDayLabel(line.date).replace(/^[^(]*/, ""), cellX(at("date")), first + META_LINE, { size: META, color: COLOR.mute });
  row.buyer.forEach((text, index) => pdf.text(text, cellX(at("buyer")), first + index * LINE, { size: TEXT }));
  row.product.forEach((text, index) => pdf.text(text, cellX(at("product")), first + index * LINE, { size: TEXT }));
  const metaTop = first + (row.product.length - 1) * LINE + META_LINE;
  row.meta.forEach((text, index) => pdf.text(text, cellX(at("product")), metaTop + index * META_LINE, { size: META, color: COLOR.mute }));
  pdf.text(formatNumber(line.quantity), cellX(at("qty")), first, { size: TEXT, align: "right" });
  if (line.returnQuantity > 0) pdf.text(`반품 ${formatNumber(line.returnQuantity)}`, cellX(at("qty")), first + META_LINE, { size: META, color: COLOR.red, align: "right" });
  if (line.unitPrice === null) pdf.text("확인 필요", cellX(at("unit")), first, { size: META, color: COLOR.red, align: "right" });
  else pdf.text(formatNumber(line.unitPrice), cellX(at("unit")), first, { size: TEXT, align: "right" });
  pdf.text(formatNumber(line.amount), cellX(at("amount")), first, { size: TEXT, align: "right" });
  pdf.text(formatNumber(line.shippingFee), cellX(at("ship")), first, { size: TEXT, align: "right", color: line.shippingFee ? COLOR.ink : COLOR.mute });
  pdf.text(formatNumber(line.total), cellX(at("total")), first, { size: TEXT, bold: true, align: "right" });
  pdf.y = top + row.height;
  pdf.hline(MARGIN, RIGHT, pdf.y);
}

function drawDaySubtotal(pdf: InvoicePdf, invoice: SupplierInvoice, date: string, columns: PlacedColumn[]) {
  const day = invoice.days.find((item) => item.date === date);
  if (!day) return;
  const height = 17;
  const at = (key: Column["key"]) => columns.find((column) => column.key === key) as PlacedColumn;
  pdf.rect(MARGIN, pdf.y, CONTENT_WIDTH, height, COLOR.soft);
  const baseline = pdf.y + 11.4;
  const labelWidth = at("qty").x - MARGIN - PAD * 2;
  pdf.text(`${invoiceDayLabel(date)} 소계 · 주문 ${formatNumber(day.orders)}건`, MARGIN + PAD, baseline, { size: 7.2, bold: true, color: COLOR.deep, maxWidth: labelWidth });
  pdf.text(formatNumber(day.quantity), cellX(at("qty")), baseline, { size: 7.2, bold: true, align: "right" });
  pdf.text(formatNumber(day.goodsAmount), cellX(at("amount")), baseline, { size: 7.2, bold: true, align: "right" });
  pdf.text(formatNumber(day.shippingFee), cellX(at("ship")), baseline, { size: 7.2, bold: true, align: "right" });
  pdf.text(formatNumber(day.total), cellX(at("total")), baseline, { size: 7.2, bold: true, align: "right", color: COLOR.deep });
  pdf.y += height;
  pdf.hline(MARGIN, RIGHT, pdf.y);
}

function drawFirstHeader(pdf: InvoicePdf, invoice: SupplierInvoice) {
  pdf.drawLogo(MARGIN, 34);
  // 오른쪽: INVOICE · 거래명세서 · 번호 · 지급 합계 · 지급 상태
  pdf.text("INVOICE", RIGHT, MARGIN + 25, { size: 27, color: COLOR.green, align: "right" });
  pdf.text("거래명세서", RIGHT, MARGIN + 42, { size: 11, bold: true, align: "right" });
  pdf.text(`# ${invoice.number}`, RIGHT, MARGIN + 56, { size: 8.6, color: COLOR.body, align: "right" });
  pdf.text("지급 합계 (Balance Due)", RIGHT, MARGIN + 76, { size: 7.6, color: COLOR.mute, align: "right" });
  pdf.text(won(invoice.totals.total), RIGHT, MARGIN + 95, { size: 17, bold: true, align: "right" });
  const paid = invoice.status !== "pending";
  const status = paid ? `${invoiceStatusLabel(invoice.status)}${invoice.paidAt ? ` · ${invoiceDate(seoulDateTimeLabel(invoice.paidAt, "").slice(0, 10))}` : ""}` : invoiceStatusLabel(invoice.status);
  const statusWidth = pdf.width(pdf.clean(status), 7.4, true) + 14;
  pdf.roundRect(RIGHT - statusWidth, MARGIN + 102, statusWidth, 15, 7.5, paid ? COLOR.greenBg : COLOR.amberBg);
  pdf.text(status, RIGHT - 7, MARGIN + 112.4, { size: 7.4, bold: true, color: paid ? COLOR.deep : COLOR.amber, align: "right" });

  // 왼쪽: 로고 아래 From
  let y = MARGIN + 52;
  pdf.text("FROM  보내는 곳", MARGIN, y, { size: 7, bold: true, color: COLOR.mute });
  y += 13;
  pdf.text([invoice.from.name, invoice.from.brand].filter(Boolean).join(" · "), MARGIN, y, { size: 10.2, bold: true, maxWidth: 280 });
  y += 12.5;
  for (const line of partyLines(invoice.from, "from")) {
    for (const part of pdf.wrap(line, 8, 280, 2)) {
      pdf.text(part, MARGIN, y, { size: 8, color: COLOR.body });
      y += 11;
    }
  }
  pdf.y = Math.max(y, MARGIN + 122) + 16;
}

function drawToAndMeta(pdf: InvoicePdf, invoice: SupplierInvoice) {
  const top = pdf.y;
  // 왼쪽: To(공급사)
  let y = top + 8;
  pdf.text("TO  받는 곳 (공급사)", MARGIN, y, { size: 7, bold: true, color: COLOR.mute });
  y += 14;
  for (const part of pdf.wrap(invoice.to.name, 11.2, 270, 2, true)) {
    pdf.text(part, MARGIN, y, { size: 11.2, bold: true });
    y += 14;
  }
  y -= 1.5;
  for (const line of partyLines(invoice.to, "to")) {
    for (const part of pdf.wrap(line, 8, 270, 2)) {
      pdf.text(part, MARGIN, y, { size: 8, color: COLOR.body });
      y += 11;
    }
  }
  const bank = bankAccountLabel(invoice.bank);
  y += 2;
  const labelWidth = pdf.text("입금 계좌", MARGIN, y, { size: 8, color: COLOR.mute });
  if (bank) {
    const parts = pdf.wrap(bank, 8.2, 270 - labelWidth - 6, 2, true);
    parts.forEach((part, index) => pdf.text(part, MARGIN + labelWidth + 6, y + index * 11, { size: 8.2, bold: true, color: COLOR.deep }));
    y += parts.length * 11;
  } else {
    pdf.text("미등록", MARGIN + labelWidth + 6, y, { size: 8.2, bold: true, color: COLOR.red });
    y += 11;
  }

  // 오른쪽: 발행일 · 거래 기간 · 지급 예정일 · 정산 방식 · 지급 상태 · 참조
  const rows: Array<[string, string]> = [
    ["발행일", invoiceDate(invoice.issueDate)],
    ["거래 기간", invoicePeriodLabel(invoice)],
    ["지급 예정일", invoicePayoutLabel(invoice)],
    ["정산 방식", invoiceSettingsLabel(invoice.settings)],
    ["지급 상태", `${invoiceStatusLabel(invoice.status)}${invoice.paidAt ? ` (${invoiceDate(seoulDateTimeLabel(invoice.paidAt, "").slice(0, 10))})` : ""}`],
    ["참조 (Ref.)", invoiceReference(invoice)]
  ];
  const metaLeft = MARGIN + 290;
  let metaY = top + 22;
  for (const [label, value] of rows) {
    pdf.text(label, metaLeft, metaY, { size: 8, color: COLOR.mute });
    pdf.text(value, RIGHT, metaY, { size: 8.2, align: "right", maxWidth: RIGHT - metaLeft - 62 });
    metaY += 14.5;
  }
  pdf.y = Math.max(y, metaY) + 12;
}

function ensureSpace(pdf: InvoicePdf, invoice: SupplierInvoice, height: number, columns: PlacedColumn[] | null) {
  if (pdf.y + height <= BODY_LIMIT) return;
  pdf.addPage();
  drawContinuationHead(pdf, invoice);
  if (columns) drawTableHead(pdf, columns);
}

function drawTotals(pdf: InvoicePdf, invoice: SupplierInvoice) {
  ensureSpace(pdf, invoice, 112, null);
  const top = pdf.y + 12;
  const boxLeft = RIGHT - 236;
  const labelX = boxLeft + 10;
  const valueX = RIGHT - 10;
  const goodsHint = invoice.settings.type === "wholesale" ? "공급가 × 수량" : "판매 단가 × 수량";
  pdf.text("물품 대금 합계", labelX, top + 10, { size: 8.4, color: COLOR.body });
  pdf.text(`(${goodsHint})`, labelX + pdf.width(pdf.clean("물품 대금 합계"), 8.4) + 4, top + 10, { size: 6.8, color: COLOR.mute });
  pdf.text(formatNumber(invoice.totals.goodsAmount), valueX, top + 10, { size: 8.6, align: "right" });
  pdf.text("배송비 합계", labelX, top + 26, { size: 8.4, color: COLOR.body });
  pdf.text(formatNumber(invoice.totals.shippingFee), valueX, top + 26, { size: 8.6, align: "right" });
  pdf.hline(boxLeft, RIGHT, top + 35, COLOR.line, 0.8);
  pdf.text("총합계 (Total)", labelX, top + 50, { size: 9, bold: true });
  pdf.text(won(invoice.totals.total), valueX, top + 50, { size: 9.4, bold: true, align: "right" });
  pdf.rect(boxLeft, top + 60, RIGHT - boxLeft, 26, COLOR.soft);
  pdf.text("지급 합계 (Balance Due)", labelX, top + 77, { size: 9.2, bold: true });
  pdf.text(won(invoice.totals.total), valueX, top + 77.4, { size: 11, bold: true, align: "right", color: COLOR.deep });

  // 왼쪽: 판매 요약
  const summary = [
    `판매 ${formatNumber(invoice.days.length)}일 · 주문 ${formatNumber(invoice.totals.orders)}건 · 판매 줄 ${formatNumber(invoice.totals.lines)}개`,
    `수량 ${formatNumber(invoice.totals.quantity)}개${invoice.totals.returnQuantity ? ` (취소·반품 ${formatNumber(invoice.totals.returnQuantity)}개 뺌)` : ""}`
  ];
  if (invoice.commission) summary.push(`판매 수수료 ${invoice.commission.rate}%는 빼지 않았어요(다음 달 1~3일 따로 청구).`);
  if (invoice.totals.costMissing) summary.push(`공급가 확인 필요 ${formatNumber(invoice.totals.costMissing)}줄은 0원으로 셌어요.`);
  summary.forEach((text, index) => pdf.text(text, MARGIN, top + 10 + index * 12.5, { size: 7.8, color: text.startsWith("공급가") ? COLOR.red : COLOR.body, maxWidth: boxLeft - MARGIN - 14 }));
  pdf.y = top + 96;
}

function drawParagraphs(pdf: InvoicePdf, invoice: SupplierInvoice, title: string, lines: Array<{ text: string; color?: RGB; bold?: boolean }>) {
  ensureSpace(pdf, invoice, 40, null);
  pdf.y += 18;
  pdf.text(title, MARGIN, pdf.y, { size: 9.4 });
  pdf.y += 6;
  for (const line of lines) {
    for (const part of pdf.wrap(line.text, 7.8, CONTENT_WIDTH, 4, line.bold)) {
      ensureSpace(pdf, invoice, 12, null);
      pdf.y += 11;
      pdf.text(part, MARGIN, pdf.y, { size: 7.8, color: line.color ?? COLOR.body, bold: line.bold });
    }
  }
}

function drawFooters(pdf: InvoicePdf) {
  const pages = pdf.doc.getPages();
  pages.forEach((page, index) => {
    pdf.page = page;
    pdf.hline(MARGIN, RIGHT, PAGE_HEIGHT - 44, COLOR.line, 0.8);
    pdf.text(FOOTER, PAGE_WIDTH / 2, PAGE_HEIGHT - 30, { size: 7, color: COLOR.mute, align: "center" });
    pdf.text(`${index + 1} / ${pages.length}`, RIGHT, PAGE_HEIGHT - 30, { size: 7, color: COLOR.mute, align: "right" });
  });
}

export async function buildSupplierInvoicePdf(invoice: SupplierInvoice) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts = doogoSansFontBytes();
  // 글꼴 일부만 넣으면(subset) pdf-lib에서 글자가 빠지는 경우가 있어 제안서 PDF처럼 통째로 넣습니다(파일 약 0.6MB).
  const regular = await doc.embedFont(fonts.regular, { subset: false });
  const bold = await doc.embedFont(fonts.bold, { subset: false });
  const logo = await doc.embedPng(Buffer.from(DOOGO_FOOD_LOGO_PNG_BASE64, "base64"));
  const pdf = new InvoicePdf(doc, regular, bold, logo);
  pdf.addPage();
  drawFirstHeader(pdf, invoice);
  drawToAndMeta(pdf, invoice);

  const columns = columnsFor(invoice);
  pdf.text("(단위: 원)", RIGHT, pdf.y - 3, { size: 6.6, color: COLOR.mute, align: "right" });
  drawTableHead(pdf, columns);
  if (invoice.lines.length === 0) {
    pdf.y += 8;
    pdf.text("이 기간에는 판매가 없습니다.", PAGE_WIDTH / 2, pdf.y + 10, { size: 8.4, color: COLOR.mute, align: "center" });
    pdf.y += 22;
    pdf.hline(MARGIN, RIGHT, pdf.y);
  }
  const showSubtotals = invoice.days.length > 1;
  invoice.lines.forEach((line, index) => {
    const row = prepareRow(pdf, line, columns);
    ensureSpace(pdf, invoice, row.height, columns);
    drawRow(pdf, row, columns);
    const next = invoice.lines[index + 1];
    if (showSubtotals && (!next || next.date !== line.date)) {
      ensureSpace(pdf, invoice, 17, columns);
      drawDaySubtotal(pdf, invoice, line.date, columns);
    }
  });

  drawTotals(pdf, invoice);
  drawParagraphs(pdf, invoice, "메모 (Memo)", [...invoice.notes.map((text) => ({ text })), { text: THANKS }]);
  const bank = invoice.bank;
  drawParagraphs(pdf, invoice, "입금 계좌 (Terms & Conditions)", bank
    ? [
        { text: `BANK NAME · 은행 : ${bank.bankName}` },
        { text: `ACCOUNT NAME · 예금주 : ${bank.accountHolder}` },
        { text: `ACCOUNT NUMBER · 계좌번호 : ${bank.accountNumber}`, bold: true, color: COLOR.deep },
        { text: `입금하는 곳 : ${invoice.from.name} (${invoice.from.brand}) → ${invoice.to.name}` }
      ]
    : [{ text: "공급사 입금 계좌가 아직 등록되지 않았습니다. 공급사 센터에 로그인해 정산 계좌를 등록해 주세요(두고푸드 담당자에게 알려 주셔도 돼요).", color: COLOR.red }]);
  drawFooters(pdf);

  doc.setTitle(`두고푸드 거래명세서 ${invoice.number} - ${invoice.supplierName}`);
  doc.setAuthor(`${invoice.from.name} · ${invoice.from.brand}`);
  doc.setCreator("DOOGO FOOD DB센터");
  doc.setProducer("DOOGO FOOD DB센터");
  doc.setSubject(invoiceReference(invoice));
  return doc.save();
}

// ── 엑셀 ─────────────────────────────────────────────────────────────────────

const XL = {
  title: "FF9FE870",
  deep: "FF163300",
  ink: "FF0E0F0C",
  body: "FF454745",
  mute: "FF868685",
  line: "FFD8DCD5",
  soft: "FFF2F4F1",
  red: "FFC0262D",
  white: "FFFFFFFF"
};
const SHEET_HEADER_ROW = 11;
const MONEY = "#,##0";

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

const thin = { style: "thin" as const, color: { argb: XL.line } };
const box: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };

function mergedText(sheet: ExcelJS.Worksheet, range: string, value: string, font: Partial<ExcelJS.Font>, options: { fill?: string; height?: number; wrap?: boolean } = {}) {
  sheet.mergeCells(range);
  const cell = sheet.getCell(range.split(":")[0]);
  cell.value = value;
  cell.font = { name: "맑은 고딕", size: 10, color: { argb: XL.ink }, ...font };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: options.wrap ?? false };
  if (options.fill) cell.fill = fill(options.fill);
  if (options.height) sheet.getRow(cell.row as unknown as number).height = options.height;
  return cell;
}

function lineNote(line: SupplierInvoiceLine) {
  return [
    line.returnQuantity > 0 ? (line.quantity === 0 ? `전량 반품(주문 ${line.orderedQuantity}개)` : `반품 ${line.returnQuantity}개(주문 ${line.orderedQuantity}개)`) : "",
    line.costMissing ? "공급가 확인 필요" : ""
  ].filter(Boolean).join(" · ");
}

export async function buildSupplierInvoiceXlsx(invoice: SupplierInvoice) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DOOGO FOOD DB센터";
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  const wholesale = invoice.settings.type === "wholesale";

  const sheet = workbook.addWorksheet("거래명세서", {
    views: [{ state: "frozen", ySplit: SHEET_HEADER_ROW }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    properties: { defaultRowHeight: 18 }
  });
  // A No · B 판매일시 · C 주문자 · D 상품명 · E 수량 · F 주문번호 · G 비고 · H 단가 · I 단가합 · J 택배비 · K 합계
  sheet.columns = [6, 17, 20, 40, 8, 14, 20, 12, 13, 11, 14].map((width) => ({ width }));
  sheet.pageSetup.printTitlesRow = `${SHEET_HEADER_ROW}:${SHEET_HEADER_ROW}`;

  mergedText(sheet, "A1:K1", "DOOGO FOOD  거래명세서 (INVOICE)", { size: 16, bold: true, color: { argb: XL.deep } }, { fill: XL.title, height: 34 });
  mergedText(sheet, "A2:K2", [
    `No. ${invoice.number}`,
    `발행일 ${invoiceDate(invoice.issueDate)}`,
    `거래 기간 ${invoicePeriodLabel(invoice)}`,
    `지급 예정일 ${invoicePayoutLabel(invoice)}`,
    invoiceSettingsLabel(invoice.settings),
    invoiceStatusLabel(invoice.status),
    "단위: 원"
  ].join("   ·   "), { size: 10, color: { argb: XL.body } }, { height: 22 });
  sheet.getRow(3).height = 6;
  mergedText(sheet, "A4:E4", "FROM (보내는 곳)", { bold: true, color: { argb: XL.deep } }, { fill: XL.soft, height: 20 });
  mergedText(sheet, "F4:K4", "TO (받는 곳 · 공급사)", { bold: true, color: { argb: XL.deep } }, { fill: XL.soft });
  const fromLines = [[invoice.from.name, invoice.from.brand].filter(Boolean).join(" · "), ...partyLines(invoice.from, "from")];
  const toLines = [invoice.to.name, ...partyLines(invoice.to, "to", bankAccountLabel(invoice.bank))];
  for (let index = 0; index < 5; index += 1) {
    const row = 5 + index;
    mergedText(sheet, `A${row}:E${row}`, fromLines[index] ?? "", { bold: index === 0, size: index === 0 ? 11 : 10, color: { argb: index === 0 ? XL.ink : XL.body } });
    const toText = toLines[index] ?? "";
    mergedText(sheet, `F${row}:K${row}`, toText, { bold: index === 0 || toText.startsWith("입금 계좌"), size: index === 0 ? 11 : 10, color: { argb: toText.startsWith("입금 계좌") ? (invoice.bank ? XL.deep : XL.red) : index === 0 ? XL.ink : XL.body } });
    sheet.getRow(row).height = 18;
  }
  // 5줄보다 많으면(주소·계좌가 모두 있는 경우) 마지막 줄에 이어 붙입니다.
  if (toLines.length > 5) sheet.getCell("F9").value = toLines.slice(4).join("  ·  ");
  if (fromLines.length > 5) sheet.getCell("A9").value = fromLines.slice(4).join("  ·  ");
  sheet.getRow(10).height = 8;

  const header = sheet.getRow(SHEET_HEADER_ROW);
  header.values = ["No", "판매일시(발주일자)", "주문자(업체명·매출처)", "상품명", "수량", "주문번호", "비고", wholesale ? "상품단가(공급가)" : "상품단가", "상품단가합", "택배비(배송비)", "합계"];
  header.height = 30;
  header.eachCell((cell) => {
    cell.font = { name: "맑은 고딕", size: 10, bold: true, color: { argb: XL.white } };
    cell.fill = fill(XL.deep);
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = box;
  });

  const first = SHEET_HEADER_ROW + 1;
  invoice.lines.forEach((line, index) => {
    const rowNumber = first + index;
    const row = sheet.getRow(rowNumber);
    const unit = line.unitPrice;
    const formulaAmount = (unit ?? 0) * line.quantity === line.amount;
    row.values = [
      index + 1,
      seoulDateTimeLabel(line.orderedAt, line.date),
      line.buyer,
      line.productName,
      line.quantity,
      line.orderNumber,
      lineNote(line),
      unit ?? null,
      formulaAmount ? { formula: `H${rowNumber}*E${rowNumber}`, result: line.amount } : line.amount,
      line.shippingFee,
      { formula: `I${rowNumber}+J${rowNumber}`, result: line.total }
    ];
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      cell.font = { name: "맑은 고딕", size: 10, color: { argb: column === 7 && cell.value ? XL.red : XL.ink }, bold: column === 11 };
      cell.border = box;
      cell.alignment = { vertical: "middle", horizontal: column === 1 || column === 6 ? "center" : column >= 8 || column === 5 ? "right" : "left", wrapText: column === 4 || column === 3 };
      if (column >= 8 || column === 5) cell.numFmt = MONEY;
    });
  });
  const last = first + invoice.lines.length - 1;
  const has = invoice.lines.length > 0;
  if (!has) {
    mergedText(sheet, `A${first}:K${first}`, "이 기간에는 판매가 없습니다.", { color: { argb: XL.mute } });
  }
  const labelRowNumber = has ? last + 1 : first + 1;
  const sumRowNumber = labelRowNumber + 1;
  const labels = sheet.getRow(labelRowNumber);
  const sums = sheet.getRow(sumRowNumber);
  const sum = (column: string, result: number) => (has ? { formula: `SUM(${column}${first}:${column}${last})`, result } : result);
  const summary: Array<[string, string, ExcelJS.CellValue]> = [
    ["E", "수량합계", sum("E", invoice.totals.quantity)],
    ["I", "상품대금합계", sum("I", invoice.totals.goodsAmount)],
    ["J", "택배비합계", sum("J", invoice.totals.shippingFee)],
    ["K", "총합계", sum("K", invoice.totals.total)]
  ];
  for (const [column, label, value] of summary) {
    const labelCell = labels.getCell(column);
    labelCell.value = label;
    labelCell.font = { name: "맑은 고딕", size: 10, bold: true, color: { argb: XL.deep } };
    labelCell.fill = fill(XL.soft);
    labelCell.alignment = { vertical: "middle", horizontal: "center" };
    labelCell.border = box;
    const valueCell = sums.getCell(column);
    valueCell.value = value;
    valueCell.numFmt = MONEY;
    valueCell.font = { name: "맑은 고딕", size: column === "K" ? 12 : 10.5, bold: true, color: { argb: column === "K" ? XL.deep : XL.ink } };
    valueCell.alignment = { vertical: "middle", horizontal: "right" };
    valueCell.border = box;
    if (column === "K") valueCell.fill = fill(XL.title);
  }
  labels.height = 20;
  sums.height = 24;

  let row = sumRowNumber + 2;
  const paragraph = (text: string, font: Partial<ExcelJS.Font> = {}) => {
    mergedText(sheet, `A${row}:K${row}`, text, { color: { argb: XL.body }, ...font }, { wrap: true, height: text.length > 110 ? 32 : 18 });
    row += 1;
  };
  paragraph("메모 (Memo)", { bold: true, size: 11, color: { argb: XL.ink } });
  for (const note of invoice.notes) paragraph(note);
  paragraph(THANKS);
  row += 1;
  paragraph("입금 계좌 (Terms & Conditions)", { bold: true, size: 11, color: { argb: XL.ink } });
  if (invoice.bank) {
    paragraph(`BANK NAME · 은행 : ${invoice.bank.bankName}`);
    paragraph(`ACCOUNT NAME · 예금주 : ${invoice.bank.accountHolder}`);
    paragraph(`ACCOUNT NUMBER · 계좌번호 : ${invoice.bank.accountNumber}`, { bold: true, color: { argb: XL.deep } });
    paragraph(`입금하는 곳 : ${invoice.from.name} (${invoice.from.brand}) → ${invoice.to.name}`);
  } else {
    paragraph("공급사 입금 계좌가 아직 등록되지 않았습니다. 공급사 센터에 로그인해 정산 계좌를 등록해 주세요(두고푸드 담당자에게 알려 주셔도 돼요).", { color: { argb: XL.red } });
  }
  if (has) sheet.autoFilter = { from: { row: SHEET_HEADER_ROW, column: 1 }, to: { row: last, column: 11 } };

  // 둘째 시트: 날짜별 합계
  const days = workbook.addWorksheet("날짜별 합계", { views: [{ state: "frozen", ySplit: 2 }] });
  days.columns = [14, 8, 10, 10, 10, 15, 13, 15].map((width) => ({ width }));
  mergedText(days, "A1:H1", `날짜별 합계 — ${invoice.supplierName} · ${invoicePeriodLabel(invoice)} (단위: 원)`, { size: 12, bold: true, color: { argb: XL.deep } }, { fill: XL.title, height: 28 });
  const dayHeader = days.getRow(2);
  dayHeader.values = ["판매일", "요일", "주문 수", "판매 줄", "수량", "물품 대금", "배송비", "합계"];
  dayHeader.height = 22;
  dayHeader.eachCell((cell) => {
    cell.font = { name: "맑은 고딕", size: 10, bold: true, color: { argb: XL.white } };
    cell.fill = fill(XL.deep);
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = box;
  });
  invoice.days.forEach((day, index) => {
    const rowNumber = 3 + index;
    const dayRow = days.getRow(rowNumber);
    dayRow.values = [day.date, invoiceDayLabel(day.date).replace(/^[^(]*\(|\)$/g, ""), day.orders, day.lines, day.quantity, day.goodsAmount, day.shippingFee, { formula: `F${rowNumber}+G${rowNumber}`, result: day.total }];
    dayRow.eachCell({ includeEmpty: true }, (cell, column) => {
      cell.font = { name: "맑은 고딕", size: 10, bold: column === 8 };
      cell.border = box;
      cell.alignment = { vertical: "middle", horizontal: column <= 2 ? "center" : "right" };
      if (column >= 3) cell.numFmt = MONEY;
    });
  });
  const dayLast = 2 + invoice.days.length;
  const dayTotal = days.getRow(dayLast + 1);
  const daySum = (column: string, result: number) => (invoice.days.length ? { formula: `SUM(${column}3:${column}${dayLast})`, result } : result);
  dayTotal.values = ["합계", "", invoice.totals.orders, daySum("D", invoice.totals.lines), daySum("E", invoice.totals.quantity), daySum("F", invoice.totals.goodsAmount), daySum("G", invoice.totals.shippingFee), daySum("H", invoice.totals.total)];
  dayTotal.eachCell({ includeEmpty: true }, (cell, column) => {
    cell.font = { name: "맑은 고딕", size: column === 8 ? 11 : 10, bold: true, color: { argb: XL.deep } };
    cell.fill = fill(column === 8 ? XL.title : XL.soft);
    cell.border = box;
    cell.alignment = { vertical: "middle", horizontal: column <= 2 ? "center" : "right" };
    if (column >= 3) cell.numFmt = MONEY;
  });
  days.getCell(`C${dayLast + 2}`).value = "주문 수 합계는 여러 날에 걸친 주문을 한 번만 셉니다.";
  days.getCell(`C${dayLast + 2}`).font = { name: "맑은 고딕", size: 9, color: { argb: XL.mute } };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
