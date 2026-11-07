// 공급사 입점 제안서 PDF(A4 가로 · 인쇄용): 디자인 원본은 apps/server/assets/proposal/supplier-proposal.html이고,
// scripts/render-proposal-pdf.mjs --server 로 만든 PDF(proposal-pdf-data.ts)를 그대로 내려 줍니다.
// 업체명이 있으면(입점 신청 메일·관리자 내려받기) 표지의 빈 자리에 "○○ 귀하 · 날짜"만 찍습니다.
// 내용(수수료·정산·달력 등)을 바꾸려면 HTML을 고친 뒤 스크립트로 다시 만듭니다(관리자 운영 기준 값은 PDF에 들어가지 않습니다).
import { gunzipSync } from "node:zlib";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import { DOOGO_SANS_BOLD_GZ_BASE64, DOOGO_SANS_REGULAR_GZ_BASE64 } from "./proposal-font-data";
import { SUPPLIER_PROPOSAL_ADDRESSEE_BOX, SUPPLIER_PROPOSAL_PDF_BASE64 } from "./proposal-pdf-data";

export type ProposalInput = {
  companyName?: string | null;
  date?: Date;
};

const INK = rgb(0x11 / 255, 0x14 / 255, 0x10 / 255);
const MUTE = rgb(0x8a / 255, 0x90 / 255, 0x86 / 255);
const GREEN = rgb(0x4b / 255, 0x9a / 255, 0x2f / 255);

let baseCache: Uint8Array | null = null;
const baseBytes = () => {
  if (!baseCache) baseCache = new Uint8Array(Buffer.from(SUPPLIER_PROPOSAL_PDF_BASE64, "base64"));
  return baseCache;
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

// 글꼴(KS X 1001 한글 2,350자 + 기호)에 없는 드문 글자는 빈칸이 되므로 뺍니다.
function safeText(font: PDFFont, value: string) {
  const supported = new Set(font.getCharacterSet());
  return Array.from(value.replace(/\s+/g, " ")).filter((char) => supported.has(char.codePointAt(0) ?? 0)).join("").trim();
}

const cleanCompany = (value?: string | null) => (value || "").replace(/\s+/g, " ").trim().slice(0, 40);

export async function buildPartnerProposalPdf(input: ProposalInput = {}) {
  const company = cleanCompany(input.companyName);
  if (!company) return baseBytes();
  const doc = await PDFDocument.load(baseBytes());
  doc.registerFontkit(fontkit);
  const bold = await doc.embedFont(fontBytes().bold, { subset: false });
  const regular = await doc.embedFont(fontBytes().regular, { subset: false });
  const page = doc.getPage(0);
  const box = SUPPLIER_PROPOSAL_ADDRESSEE_BOX;
  const name = safeText(bold, company);
  const date = safeText(regular, `${seoulDate(input.date ?? new Date())} · 두고푸드 MD팀`);
  const suffix = " 귀하";
  // 표지 왼쪽 아래 빈 자리(가로 360pt)에 맞춰 업체명 크기를 줄입니다.
  let size = 15;
  const width = () => bold.widthOfTextAtSize(name + suffix, size);
  while (size > 9 && width() + regular.widthOfTextAtSize(date, 9.5) + 16 > box.width) size -= 0.5;
  const baseline = box.y + (box.height - size) / 2 + size * 0.2;
  page.drawRectangle({ x: box.x, y: box.y + 2, width: 3, height: box.height - 4, color: GREEN });
  if (name) page.drawText(name, { x: box.x + 10, y: baseline, size, font: bold, color: INK });
  const nameWidth = bold.widthOfTextAtSize(name, size);
  page.drawText(suffix.trim(), { x: box.x + 10 + nameWidth + size * 0.3, y: baseline, size: size * 0.8, font: regular, color: INK });
  page.drawText(date, { x: box.x + 10 + width() + 12, y: baseline, size: 9.5, font: regular, color: MUTE });
  doc.setTitle(`두고푸드 공급사 입점 제안서 - ${company}`);
  return doc.save();
}

export function proposalFileName(companyName?: string | null) {
  const company = (companyName || "").trim().replace(/[\\/:*?"<>|]+/g, " ").slice(0, 40).trim();
  return company ? `두고푸드_입점제안서_${company}.pdf` : "두고푸드_공급사_입점제안서.pdf";
}
