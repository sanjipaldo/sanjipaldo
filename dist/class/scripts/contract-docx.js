/* 두잉고 계약서 Word 양식 만들기 — contract-forms.js 의 글로 assets/docs/*.docx (빈칸 양식)를 다시 만들어요.
 *   node scripts/contract-docx.js   (class/ 에서 · docx 패키지가 필요해요: npm i -g docx)
 * 계약서 글을 고친 뒤에만 돌리면 돼요. 배포 때는 만들어 둔 .docx 를 그대로 올려요. */
"use strict";
const fs = require("fs");
const path = require("path");
const { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, LevelFormat, Footer, PageNumber } = require("docx");
const { FORMS, fill, COMPANY } = require("../contract-forms.js");

const FONT = { ascii: "Malgun Gothic", eastAsia: "Malgun Gothic", hAnsi: "Malgun Gothic", cs: "Malgun Gothic" };
const OUT = path.join(__dirname, "..");
const W = 9638; // A4 본문 폭 (좌우 여백 1134 = 2cm)
const blank = Object.assign({}, COMPANY); // 회사 정보만 채우고 강사 쪽 {{…}} 는 ____ 빈칸으로

function bodyParas(text) {
  const out = [];
  String(text).split("\n").forEach((line) => {
    const t = line.trim();
    if (!t) return;
    if (t.indexOf("## ") === 0) out.push(new Paragraph({ spacing: { before: 280, after: 100 }, keepNext: true, children: [new TextRun({ text: t.slice(3), bold: true, size: 22 })] }));
    else if (t.indexOf("- ") === 0) out.push(new Paragraph({ numbering: { reference: "dots", level: 0 }, spacing: { after: 60, line: 320 }, children: [new TextRun({ text: fill(t.slice(2), blank), size: 20 })] }));
    else out.push(new Paragraph({ spacing: { after: 100, line: 320 }, children: [new TextRun({ text: fill(t, blank), size: 20 })] }));
  });
  return out;
}
function partyCell(title, rows) {
  const line = (label, val) => new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: label + "  ", size: 19, color: "666666" }), new TextRun({ text: fill(val, blank) === "__________" || !val ? "______________________" : fill(val, blank), size: 20 })] });
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return new TableCell({
    width: { size: W / 2, type: WidthType.DXA },
    margins: { top: 160, bottom: 160, left: 200, right: 200 },
    borders: { top: { style: BorderStyle.SINGLE, size: 12, color: "222222" }, bottom: none, left: none, right: none },
    children: [new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: title, bold: true, size: 22 })] })]
      .concat(rows.map((r) => line(r[0], r[1])))
      .concat([new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "서명 · 날인  ______________________  (인)", size: 20 })] })])
  });
}
function doc(f) {
  const children = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: f.title, bold: true, size: 34 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 360 }, children: [new TextRun({ text: "두잉고 · www.doogoclass.com/doinggo", size: 18, color: "888888" })] }),
    new Paragraph({ spacing: { after: 160, line: 340 }, children: [new TextRun({ text: fill(f.lead, blank), size: 20 })] })
  ].concat(bodyParas(f.body)).concat([
    new Paragraph({ spacing: { before: 360, after: 240, line: 320 }, children: [new TextRun({ text: f.close, size: 20 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 360 }, children: [new TextRun({ text: "계약일   20____년   ____월   ____일", size: 22, bold: true })] }),
    new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [W / 2, W / 2], rows: [new TableRow({ cantSplit: true, children: f.parties.map((p) => partyCell(p[0], p[1])) })] })
  ]);
  return new Document({
    creator: "두잉고", title: f.title,
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    numbering: { config: [{ reference: "dots", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 260 } } } }] }] },
    sections: [{
      properties: { page: { margin: { top: 1300, bottom: 1300, left: 1134, right: 1134 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ["- ", PageNumber.CURRENT, " -"], size: 16, color: "999999" })] })] }) },
      children
    }]
  });
}
(async () => {
  for (const k of Object.keys(FORMS)) {
    const f = FORMS[k], file = path.join(OUT, f.file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, await Packer.toBuffer(doc(f)));
    console.log("[contract-docx] " + f.file);
  }
})();
