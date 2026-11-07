// 공급사 입점 제안서 PDF(A4): 표지 · 두고푸드 소개/입점 혜택 · 입점 절차 · 주문 처리 방법 · 정산 안내 · 준비 서류/문의.
// 운영 기준(마감 시간·정산 주기 등)은 관리자 > 사용방법 관리(content_settings "supplier_guide") 값을 그대로 씁니다.
import { gunzipSync } from "node:zlib";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import type { SupplierGuideSettings } from "@repo/shared/supplier-guide";
import { DOOGO_SANS_BOLD_GZ_BASE64, DOOGO_SANS_REGULAR_GZ_BASE64 } from "./proposal-font-data";
import { DOOGO_LOGO_COLOR_PNG_BASE64, DOOGO_LOGO_WHITE_PNG_BASE64 } from "./proposal-logo-data";

export type ProposalInput = {
  companyName?: string | null;
  requesterName?: string | null;
  guide: SupplierGuideSettings;
  productCount?: number | null;
  date?: Date;
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

const hex = (value: string): RGB => rgb(parseInt(value.slice(1, 3), 16) / 255, parseInt(value.slice(3, 5), 16) / 255, parseInt(value.slice(5, 7), 16) / 255);
const C = {
  ink: hex("#0e0f0c"),
  body: hex("#454745"),
  mute: hex("#868685"),
  deep: hex("#163300"),
  primary: hex("#9fe870"),
  pale: hex("#e2f6d5"),
  soft: hex("#f2f4f1"),
  line: hex("#e4e8e1"),
  white: rgb(1, 1, 1),
  accent: hex("#054d28")
};

let fontCache: { regular: Uint8Array; bold: Uint8Array } | null = null;
function fontBytes() {
  if (!fontCache) {
    fontCache = {
      regular: new Uint8Array(gunzipSync(Buffer.from(DOOGO_SANS_REGULAR_GZ_BASE64, "base64"))),
      bold: new Uint8Array(gunzipSync(Buffer.from(DOOGO_SANS_BOLD_GZ_BASE64, "base64")))
    };
  }
  return fontCache;
}

const seoulDate = (date: Date) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" }).format(date);

// 글꼴에 없는 글자(드문 한자·이모지 등)는 PDF에서 빈칸이 되므로 비슷한 문자로 바꾸거나 뺍니다.
const charsetCache = new WeakMap<PDFFont, Set<number>>();
function safeText(font: PDFFont, value: string) {
  let supported = charsetCache.get(font);
  if (!supported) {
    supported = new Set(font.getCharacterSet());
    charsetCache.set(font, supported);
  }
  return Array.from(value.replace(/\r/g, ""))
    .map((char) => (char === "\n" || supported.has(char.codePointAt(0) ?? 0) ? char : char === "\t" ? " " : ""))
    .join("");
}

// 한글은 띄어쓰기 단위로 줄을 나누고, 한 단어가 너무 길면 글자 단위로 자릅니다.
function wrapText(font: PDFFont, text: string, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of safeText(font, text).split("\n")) {
    const words = paragraph.split(/(\s+)/).filter((part) => part.length > 0);
    let line = "";
    for (const word of words) {
      const candidate = line + word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line.trim()) lines.push(line.trimEnd());
      line = "";
      if (/^\s+$/.test(word)) continue;
      let chunk = "";
      for (const char of Array.from(word)) {
        if (font.widthOfTextAtSize(chunk + char, size) > maxWidth && chunk) {
          lines.push(chunk);
          chunk = char;
        } else {
          chunk += char;
        }
      }
      line = chunk;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

type Fonts = { regular: PDFFont; bold: PDFFont };

class Writer {
  page!: PDFPage;
  y = 0;
  pageNumber = 0;
  constructor(private doc: PDFDocument, private fonts: Fonts, private logo: PDFImage) {}

  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pageNumber += 1;
    // 머리글·바닥글
    const logoW = 64;
    this.page.drawImage(this.logo, { x: MARGIN, y: PAGE_H - 40, width: logoW, height: logoW * (290 / 830) });
    this.text("공급사 입점 제안서", PAGE_W - MARGIN - this.fonts.regular.widthOfTextAtSize("공급사 입점 제안서", 8.5), PAGE_H - 34, 8.5, this.fonts.regular, C.mute);
    this.page.drawLine({ start: { x: MARGIN, y: PAGE_H - 50 }, end: { x: PAGE_W - MARGIN, y: PAGE_H - 50 }, thickness: 0.6, color: C.line });
    this.footer();
    this.y = PAGE_H - 78;
  }

  footer() {
    const label = `두고푸드 데이터 센터 · doogofood.site · ${this.pageNumber}`;
    this.text(label, PAGE_W / 2 - this.fonts.regular.widthOfTextAtSize(label, 8) / 2, 26, 8, this.fonts.regular, C.mute);
  }

  ensure(height: number) {
    if (this.y - height < 54) this.newPage();
  }

  text(value: string, x: number, y: number, size: number, font: PDFFont, color: RGB) {
    const safe = safeText(font, value);
    if (safe) this.page.drawText(safe, { x, y, size, font, color });
  }

  // 여러 줄 문단을 쓰고 다음 y를 돌려줍니다.
  paragraph(value: string, options: { x?: number; width?: number; size?: number; font?: PDFFont; color?: RGB; lineHeight?: number; gapAfter?: number } = {}) {
    const size = options.size ?? 10.5;
    const font = options.font ?? this.fonts.regular;
    const lineHeight = options.lineHeight ?? size * 1.62;
    const x = options.x ?? MARGIN;
    const lines = wrapText(font, value, size, options.width ?? CONTENT_W);
    for (const line of lines) {
      this.ensure(lineHeight);
      this.text(line, x, this.y - size, size, font, options.color ?? C.body);
      this.y -= lineHeight;
    }
    this.y -= options.gapAfter ?? 0;
  }

  sectionTitle(number: string, title: string, lead?: string) {
    this.ensure(70);
    this.y -= 6;
    this.page.drawRectangle({ x: MARGIN, y: this.y - 22, width: 26, height: 22, color: C.deep });
    this.text(number, MARGIN + 13 - this.fonts.bold.widthOfTextAtSize(number, 11) / 2, this.y - 15.5, 11, this.fonts.bold, C.primary);
    this.text(title, MARGIN + 36, this.y - 17, 17, this.fonts.bold, C.ink);
    this.y -= 34;
    if (lead) this.paragraph(lead, { size: 10, color: C.mute, gapAfter: 6 });
  }

  bullets(items: Array<[string, string]>) {
    for (const [title, description] of items) {
      const descLines = wrapText(this.fonts.regular, description, 10, CONTENT_W - 30);
      const height = 18 + descLines.length * 15 + 10;
      this.ensure(height);
      this.page.drawCircle({ x: MARGIN + 6, y: this.y - 8, size: 3.2, color: C.accent });
      this.text(title, MARGIN + 18, this.y - 12, 11.5, this.fonts.bold, C.ink);
      this.y -= 18;
      for (const line of descLines) {
        this.text(line, MARGIN + 18, this.y - 11, 10, this.fonts.regular, C.body);
        this.y -= 15;
      }
      this.y -= 8;
    }
  }

  // 가로로 나란히 놓는 단계 상자(입점 절차·정산 흐름)
  stepBoxes(steps: Array<[string, string]>, options: { height?: number } = {}) {
    const gap = 8;
    const width = (CONTENT_W - gap * (steps.length - 1)) / steps.length;
    const height = options.height ?? 92;
    this.ensure(height + 8);
    steps.forEach(([title, description], index) => {
      const x = MARGIN + index * (width + gap);
      this.page.drawRectangle({ x, y: this.y - height, width, height, color: C.soft, borderColor: C.line, borderWidth: 0.8 });
      this.text(String(index + 1).padStart(2, "0"), x + 10, this.y - 20, 11, this.fonts.bold, C.accent);
      this.text(title, x + 10, this.y - 38, 11, this.fonts.bold, C.ink);
      let lineY = this.y - 54;
      for (const line of wrapText(this.fonts.regular, description, 8.6, width - 20).slice(0, 4)) {
        this.text(line, x + 10, lineY, 8.6, this.fonts.regular, C.body);
        lineY -= 12;
      }
    });
    this.y -= height + 14;
  }

  numberedRows(rows: Array<[string, string]>) {
    rows.forEach(([title, description], index) => {
      const lines = wrapText(this.fonts.regular, description, 10, CONTENT_W - 46);
      const height = Math.max(40, 22 + lines.length * 15 + 10);
      this.ensure(height + 4);
      this.page.drawCircle({ x: MARGIN + 13, y: this.y - 14, size: 12, color: C.pale });
      const label = String(index + 1);
      this.text(label, MARGIN + 13 - this.fonts.bold.widthOfTextAtSize(label, 11) / 2, this.y - 18, 11, this.fonts.bold, C.deep);
      this.text(title, MARGIN + 36, this.y - 18, 12, this.fonts.bold, C.ink);
      let lineY = this.y - 36;
      for (const line of lines) {
        this.text(line, MARGIN + 36, lineY, 10, this.fonts.regular, C.body);
        lineY -= 15;
      }
      if (index < rows.length - 1) this.page.drawLine({ start: { x: MARGIN + 13, y: this.y - 28 }, end: { x: MARGIN + 13, y: this.y - height - 2 }, thickness: 1, color: C.line });
      this.y -= height + 4;
    });
    this.y -= 6;
  }

  table(rows: Array<[string, string]>, labelWidth = 118) {
    for (const [label, value] of rows) {
      const lines = wrapText(this.fonts.regular, value, 10, CONTENT_W - labelWidth - 24);
      const height = Math.max(32, lines.length * 15 + 17);
      this.ensure(height);
      this.page.drawRectangle({ x: MARGIN, y: this.y - height, width: labelWidth, height, color: C.soft });
      this.page.drawLine({ start: { x: MARGIN, y: this.y - height }, end: { x: PAGE_W - MARGIN, y: this.y - height }, thickness: 0.6, color: C.line });
      this.text(label, MARGIN + 12, this.y - 20, 10, this.fonts.bold, C.ink);
      let lineY = this.y - 20;
      for (const line of lines) {
        this.text(line, MARGIN + labelWidth + 12, lineY, 10, this.fonts.regular, C.body);
        lineY -= 15;
      }
      this.y -= height;
    }
    this.y -= 14;
  }

  callout(title: string, body: string) {
    const lines = wrapText(this.fonts.regular, body, 10, CONTENT_W - 32);
    const height = 34 + lines.length * 15 + 8;
    this.ensure(height + 6);
    this.page.drawRectangle({ x: MARGIN, y: this.y - height, width: CONTENT_W, height, color: C.pale });
    this.text(title, MARGIN + 16, this.y - 22, 11, this.fonts.bold, C.deep);
    let lineY = this.y - 40;
    for (const line of lines) {
      this.text(line, MARGIN + 16, lineY, 10, this.fonts.regular, C.ink);
      lineY -= 15;
    }
    this.y -= height + 14;
  }
}

function drawCover(doc: PDFDocument, fonts: Fonts, whiteLogo: PDFImage, input: ProposalInput, writer: Writer) {
  const page = doc.addPage([PAGE_W, PAGE_H]);
  writer.page = page;
  writer.pageNumber = 1;
  const bandH = 400;
  page.drawRectangle({ x: 0, y: PAGE_H - bandH, width: PAGE_W, height: bandH, color: C.deep });
  page.drawImage(whiteLogo, { x: MARGIN, y: PAGE_H - 92, width: 132, height: 132 * (290 / 830) });
  writer.text("PARTNER PROPOSAL", MARGIN, PAGE_H - 170, 11, fonts.bold, C.primary);
  writer.text("공급사 입점 제안서", MARGIN, PAGE_H - 214, 34, fonts.bold, C.white);
  writer.text("두고푸드 위탁셀러 채널로 판로를 넓혀 보세요.", MARGIN, PAGE_H - 246, 14, fonts.regular, C.pale);
  const company = (input.companyName || "").trim();
  const addressee = company ? `${company} 귀하` : "공급사 담당자님께";
  writer.text(addressee, MARGIN, PAGE_H - 318, 19, fonts.bold, C.white);
  writer.text(`${seoulDate(input.date ?? new Date())} · 두고푸드 MD팀`, MARGIN, PAGE_H - 344, 10.5, fonts.regular, C.pale);

  // 핵심 3가지
  const cards: Array<[string, string]> = [
    ["재고 부담 없는 판매", "위탁셀러가 판매한 주문만 출고합니다. 미리 사입하지 않습니다."],
    ["메일로 끝나는 주문 처리", "별도 프로그램 없이 하루 2번(오전·오후) 발주서 메일을 받고, 송장은 그 메일에 회신합니다."],
    ["매월 1일 정산", `${input.guide.settlementPayDay}. ${input.guide.settlementOption}`]
  ];
  const gap = 10;
  const cardW = (CONTENT_W - gap * 2) / 3;
  const cardTop = PAGE_H - bandH - 28;
  cards.forEach(([title, body], index) => {
    const x = MARGIN + index * (cardW + gap);
    page.drawRectangle({ x, y: cardTop - 118, width: cardW, height: 118, color: C.white, borderColor: C.line, borderWidth: 1 });
    page.drawRectangle({ x: x + 14, y: cardTop - 22, width: 22, height: 4, color: C.primary });
    writer.text(title, x + 14, cardTop - 42, 12, fonts.bold, C.ink);
    let lineY = cardTop - 62;
    for (const line of wrapText(fonts.regular, body, 9.2, cardW - 28).slice(0, 4)) {
      writer.text(line, x + 14, lineY, 9.2, fonts.regular, C.body);
      lineY -= 13.5;
    }
  });

  // 목차
  const contents = ["두고푸드 소개 · 입점 혜택", "입점 절차", "주문 처리 방법", "정산 안내", "준비 서류 · 문의"];
  let y = cardTop - 160;
  writer.text("CONTENTS", MARGIN, y, 10, fonts.bold, C.accent);
  y -= 22;
  contents.forEach((label, index) => {
    writer.text(String(index + 1).padStart(2, "0"), MARGIN, y, 11, fonts.bold, C.mute);
    writer.text(label, MARGIN + 30, y, 12, fonts.regular, C.ink);
    page.drawLine({ start: { x: MARGIN, y: y - 9 }, end: { x: PAGE_W - MARGIN, y: y - 9 }, thickness: 0.5, color: C.line });
    y -= 27;
  });
  writer.text("문의 · 카카오톡 1:1 상담 pf.kakao.com/_NyuVn · doogofood.site/how-to/supplier", MARGIN, 40, 9, fonts.regular, C.mute);
}

export async function buildPartnerProposalPdf(input: ProposalInput) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const bytes = fontBytes();
  const fonts: Fonts = {
    regular: await doc.embedFont(bytes.regular, { subset: false }),
    bold: await doc.embedFont(bytes.bold, { subset: false })
  };
  const whiteLogo = await doc.embedPng(Buffer.from(DOOGO_LOGO_WHITE_PNG_BASE64, "base64"));
  const colorLogo = await doc.embedPng(Buffer.from(DOOGO_LOGO_COLOR_PNG_BASE64, "base64"));
  const company = (input.companyName || "").trim();
  doc.setTitle(company ? `두고푸드 공급사 입점 제안서 - ${company}` : "두고푸드 공급사 입점 제안서");
  doc.setAuthor("두고푸드");
  doc.setCreator("두고푸드 데이터 센터");
  doc.setSubject("공급사 입점 절차 · 주문 처리 · 정산 안내");
  const g = input.guide;
  const writer = new Writer(doc, fonts, colorLogo);
  drawCover(doc, fonts, whiteLogo, input, writer);

  writer.newPage();
  writer.sectionTitle("1", "두고푸드 소개 · 입점 혜택", "두고푸드는 위탁셀러(온라인 판매자)에게 농·수·축산물과 식품의 실시간 단가·상품 정보를 제공하는 B2B 식품 도매 데이터 플랫폼입니다.");
  writer.paragraph(`공급사는 상품과 공급가를 한 번 등록해 두면, 위탁셀러가 각자의 쇼핑몰에서 판매하고 들어온 주문만 출고하면 됩니다.${input.productCount ? ` 지금 두고푸드 단가표에는 ${input.productCount.toLocaleString("ko-KR")}개 상품이 올라 있습니다.` : ""}`, { gapAfter: 8 });
  writer.bullets([
    ["판로 확대", "단가표·신규상품·월별 제철상품 메뉴로 전국 위탁셀러에게 바로 노출됩니다."],
    ["재고 부담 없음", "사입이 아니라 위탁 판매라서, 셀러가 판매한 주문 수량만큼만 출고합니다."],
    ["간단한 주문 업무", "공급사용 관리자 사이트나 프로그램이 따로 없습니다. 입점 때 정한 시간(오전 1회·오후 1회)에 공급사별 발주서(엑셀)를 메일로 받고, 출고 후 그 메일에 송장을 회신하면 됩니다."],
    ["투명한 월 정산", `${g.settlementCycle} · ${g.settlementPayDay}. 정산 금액은 ${g.settlementBasis}입니다. ${g.settlementOption}`]
  ]);

  writer.sectionTitle("2", "입점 절차", "신청부터 판매 시작까지 보통 1~2주 정도 걸립니다(상품 수와 준비 상황에 따라 달라집니다).");
  writer.stepBoxes([
    ["입점 신청", "사용방법 > 공급사 화면에서 신청서를 작성합니다."],
    ["MD 검토·상담", "담당 MD가 영업일 기준 2~3일 안에 연락드립니다."],
    ["상품 등록·메일 시간", "상품 정보를 등록하고 발주서 메일 주소와 발송 시간(오전·오후)을 정합니다."],
    ["판매 시작", "단가표에 노출되고 주문이 발주서 메일로 들어옵니다."]
  ]);

  writer.sectionTitle("3", "주문 처리 방법", "별도 관리자 사이트 없이 메일로 주고받습니다. 두고푸드가 정한 시간(오전 1회·오후 1회)에 발주서 메일을 보내면, 공급사는 발주서대로 출고하고 그 메일에 송장만 회신하면 됩니다.");
  writer.numberedRows([
    ["위탁셀러 주문 접수", `위탁셀러가 두고푸드 도매몰에서 주문하면 두고푸드가 공급사별로 모읍니다. 주문 마감: ${g.orderCutoff}.`],
    ["발주서 메일 받기", `두고푸드가 정한 시간에 공급사별 발주서(엑셀)를 메일로 보내 드립니다. 발송: ${g.orderSendTime}. 수령인·연락처·주소·상품·수량이 담겨 있습니다.`],
    ["포장·출고", `발주서대로 포장해 출고합니다. 출고: ${g.shipLeadTime}. 보내는 사람은 발주서에 적힌 발송인(셀러 상호) 정보로 표기해 주세요.`],
    ["송장 회신", `발주서 엑셀에 택배사·송장번호를 입력해 받은 발주 메일에 회신합니다. 회신 마감: ${g.invoiceDeadline}. 두고푸드가 등록해 위탁셀러에게 전달합니다.`],
    ["취소·반품·교환", `출고 전 취소 요청이 오면 바로 메일·전화로 알려 드립니다. ${g.returnPolicy}`]
  ]);
  writer.table([
    ["발주서 메일", g.orderSendTime],
    ["주문(발주) 마감", g.orderCutoff],
    ["출고 기한", g.shipLeadTime],
    ["송장 회신 마감", g.invoiceDeadline]
  ]);

  writer.sectionTitle("4", "정산 안내", "한 달 동안 실제로 접수된 주문 건을 모두 합산해 다음 달 1일에 정산합니다. 물량이 많으면 주 단위 정산도 가능합니다.");
  writer.table([
    ["정산 기준", g.settlementBasis],
    ["정산 주기", g.settlementCycle],
    ["지급일", g.settlementPayDay],
    ["주 단위 정산", g.settlementOption],
    ["세금계산서", g.taxInvoice],
    ["정산 제외·차감", g.deductions]
  ]);
  writer.stepBoxes([
    ["주문 접수·출고", "한 달 동안 접수된 주문을 발주서대로 출고합니다."],
    ["월말 마감", "지난달 1일~말일 주문 건의 공급가를 합산합니다."],
    ["정산 내역 확인", "주문 건별 공급가·차감 내역을 확인합니다."],
    ["세금계산서 발행", "확정된 정산 금액으로 발행합니다."],
    ["매월 1일 지급", "물량이 많으면 주 단위로도 정산합니다."]
  ], { height: 104 });
  writer.callout("정산 예시", "10월 주문 접수 30건 × 공급가 10,000원 → 300,000원\n공급사 사유 반품 1건 차감 -10,000원 → 11월 1일 정산 금액 290,000원(세금계산서 발행 기준)");

  writer.sectionTitle("5", "준비 서류 · 문의");
  writer.bullets([
    ["사업자등록증 사본", "정산·세금계산서 처리에 필요합니다."],
    ["정산 받을 통장 사본", "사업자 명의 통장을 권장합니다."],
    ["상품 정보", "상품명·규격(중량·과수)·공급가·상품 이미지·출고지·택배사를 정리해 주세요."],
    ["인증·신고 서류(해당 시)", "통신판매업 신고증, HACCP·GAP·친환경 인증서 등"]
  ]);
  writer.callout("문의", "카카오톡 1:1 상담 pf.kakao.com/_NyuVn\n사용방법 안내 doogofood.site/how-to/supplier");
  writer.paragraph("※ 이 제안서의 운영 기준은 상품과 협의 내용에 따라 달라질 수 있으며, 최종 조건은 입점 계약을 따릅니다.", { size: 9, color: C.mute });

  return doc.save();
}

export function proposalFileName(companyName?: string | null) {
  const company = (companyName || "").trim().replace(/[\\/:*?"<>|]+/g, " ").slice(0, 40).trim();
  return company ? `두고푸드_입점제안서_${company}.pdf` : "두고푸드_공급사_입점제안서.pdf";
}
