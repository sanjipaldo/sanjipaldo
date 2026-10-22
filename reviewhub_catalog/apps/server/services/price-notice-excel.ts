import ExcelJS from "exceljs";
import { getPublicPriceChangeNoticeData, historyDayKey } from "./catalog";

// 가격변동 공지 엑셀(카톡 공지용): 날짜별로 "상품명 | 기존/변동 A단가 | 기존/변동 일반공급가 | 비고" 표를 만들고,
// 인상·인하·변동끼리 묶어 비고 칸을 합칩니다. 품절 상품은 표 아래에 모아 "품절" 비고로 안내합니다.

type NoticeData = Awaited<ReturnType<typeof getPublicPriceChangeNoticeData>>;
type Direction = "인상" | "인하" | "변동";
type FieldChange = { oldPrice: number; newPrice: number };
export type NoticeRow = { name: string; direction: Direction; aPrice?: FieldChange; generalPrice?: FieldChange };

const NOTICE_FIELDS = ["aPrice", "generalPrice"] as const;
const COLUMN_COUNT = 6;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const DIRECTION_ORDER: Direction[] = ["인상", "인하", "변동"];
const DIRECTION_COLOR: Record<Direction, string> = { 인상: "FFD03238", 인하: "FF1D5FD0", 변동: "FF454745" };

export function noticeDayLabel(day: string, withYear = false) {
  const [year, month, date] = day.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, date)).getUTCDay()];
  return withYear ? `${year}년 ${month}월 ${date}일 ${weekday}요일` : `${month}월 ${date}일(${weekday})`;
}

// 하루 안에 여러 번 바뀐 값은 처음 값 → 마지막 값으로 합치고, 결국 같아진 항목은 뺍니다.
export function noticeRowsForDay(data: Pick<NoticeData, "histories" | "products">, day: string): NoticeRow[] {
  const nameById = new Map(data.products.map((product) => [product.id, product.name]));
  const byProduct = new Map<string, { name: string; fields: Map<string, { first: { at: string; price: number }; last: { at: string; price: number } }> }>();
  for (const history of data.histories) {
    if (historyDayKey(history.changedAt) !== day || !(NOTICE_FIELDS as readonly string[]).includes(history.field)) continue;
    const key = `${history.productId}|${history.optionId ?? ""}`;
    const baseName = nameById.get(history.productId) ?? history.productName;
    const entry = byProduct.get(key) ?? { name: history.optionName ? `${baseName} · ${history.optionName}` : baseName, fields: new Map() };
    const current = entry.fields.get(history.field);
    if (!current) {
      entry.fields.set(history.field, { first: { at: history.changedAt, price: history.oldPrice }, last: { at: history.changedAt, price: history.newPrice } });
    } else {
      if (history.changedAt < current.first.at) current.first = { at: history.changedAt, price: history.oldPrice };
      if (history.changedAt >= current.last.at) current.last = { at: history.changedAt, price: history.newPrice };
    }
    byProduct.set(key, entry);
  }
  const rows: NoticeRow[] = [];
  for (const entry of byProduct.values()) {
    const row: NoticeRow = { name: entry.name, direction: "변동" };
    for (const field of NOTICE_FIELDS) {
      const change = entry.fields.get(field);
      if (change && change.first.price !== change.last.price) row[field] = { oldPrice: change.first.price, newPrice: change.last.price };
    }
    const changes = NOTICE_FIELDS.map((field) => row[field]).filter((change): change is FieldChange => Boolean(change));
    if (changes.length === 0) continue;
    row.direction = changes.every((change) => change.newPrice > change.oldPrice) ? "인상" : changes.every((change) => change.newPrice < change.oldPrice) ? "인하" : "변동";
    rows.push(row);
  }
  return rows.sort((first, second) => DIRECTION_ORDER.indexOf(first.direction) - DIRECTION_ORDER.indexOf(second.direction) || first.name.localeCompare(second.name, "ko"));
}

export async function buildPriceChangeNoticeWorkbook(dayKeys: string[]) {
  const data = await getPublicPriceChangeNoticeData(dayKeys);
  const workbook = new ExcelJS.Workbook();
  const days = [...data.days].sort((first, second) => second.localeCompare(first));
  const short = (day: string) => day.slice(5).replace("-", "");
  const sheetName = days.length === 1 ? `${short(days[0])} 공지` : "가격변동 공지";
  const sheet = workbook.addWorksheet(sheetName, { views: [{ showGridLines: false }] });
  sheet.columns = [{ width: 50 }, { width: 13 }, { width: 13 }, { width: 15 }, { width: 15 }, { width: 36 }];
  const font = { name: "맑은 고딕", size: 10, color: { argb: "FF000000" } };
  const thin = { style: "thin" as const, color: { argb: "FF000000" } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const styleRow = (rowNumber: number) => {
    for (let column = 1; column <= COLUMN_COUNT; column += 1) {
      const cell = sheet.getCell(rowNumber, column);
      cell.border = border;
      cell.font = { ...font, ...(cell.font ?? {}) };
    }
  };
  const mergeNote = (fromRow: number, toRow: number, fromColumn: number, text: string, color: string) => {
    sheet.mergeCells(fromRow, fromColumn, toRow, COLUMN_COUNT);
    const cell = sheet.getCell(fromRow, fromColumn);
    cell.value = text;
    cell.font = { ...font, bold: true, color: { argb: color } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  };

  if (days.length === 0) {
    sheet.addRow(["가격변동 공지를 만들 날짜가 없습니다. 최근 4일(오늘 포함) 안의 날짜만 받을 수 있습니다."]);
  }
  for (const day of days) {
    if (sheet.rowCount > 0) sheet.addRow([]);
    const titleRow = sheet.addRow([`두고푸드 가격변동 공지 · ${noticeDayLabel(day, true)}`]);
    sheet.mergeCells(titleRow.number, 1, titleRow.number, COLUMN_COUNT);
    titleRow.height = 30;
    titleRow.getCell(1).font = { ...font, size: 13, bold: true };
    titleRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

    const header = sheet.addRow(["상품명", "기존 A단가", "변동 A단가", "기존 일반공급가", "변동 일반공급가", "비고"]);
    header.height = 24;
    styleRow(header.number);
    header.eachCell((cell) => {
      cell.font = { ...font, bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    const rows = noticeRowsForDay(data, day);
    const soldOut = Array.from(new Map(data.soldOut
      .filter((issue) => historyDayKey(issue.createdAt) === day)
      .map((issue) => [`${issue.productId}|${issue.optionId ?? ""}`, issue.optionName ? `${issue.productName} · ${issue.optionName}` : issue.productName])).values())
      .sort((first, second) => first.localeCompare(second, "ko"));
    if (rows.length === 0 && soldOut.length === 0) {
      const empty = sheet.addRow(["이 날짜에는 가격변동·품절 상품이 없습니다."]);
      sheet.mergeCells(empty.number, 1, empty.number, COLUMN_COUNT);
      styleRow(empty.number);
      empty.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      continue;
    }
    for (const direction of DIRECTION_ORDER) {
      const group = rows.filter((row) => row.direction === direction);
      if (group.length === 0) continue;
      const startRow = sheet.rowCount + 1;
      for (const row of group) {
        const added = sheet.addRow([row.name, row.aPrice?.oldPrice ?? null, row.aPrice?.newPrice ?? null, row.generalPrice?.oldPrice ?? null, row.generalPrice?.newPrice ?? null, null]);
        styleRow(added.number);
        added.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
        for (const column of [2, 3, 4, 5]) {
          const cell = added.getCell(column);
          cell.numFmt = "#,##0";
          cell.alignment = { horizontal: "right", vertical: "middle" };
          if (column === 3 || column === 5) cell.font = { ...font, bold: true, color: { argb: DIRECTION_COLOR[row.direction] } };
        }
      }
      const label = direction === "변동" ? "단가 변동(인상·인하 함께)" : `단가 ${direction}`;
      mergeNote(startRow, sheet.rowCount, 6, `${label}\n변경일 : ${noticeDayLabel(day)}`, DIRECTION_COLOR[direction]);
    }
    if (soldOut.length > 0) {
      const startRow = sheet.rowCount + 1;
      for (const name of soldOut) {
        const added = sheet.addRow([name]);
        styleRow(added.number);
        added.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
      }
      mergeNote(startRow, sheet.rowCount, 2, `품절\n품절시점 : ${noticeDayLabel(day)}`, "FFD03238");
    }
  }
  const filename = days.length === 0 ? "가격변동 공지.xlsx"
    : days.length === 1 ? `${short(days[0])} 가격변동 공지.xlsx`
      : `${short(days[days.length - 1])}-${short(days[0])} 가격변동 공지.xlsx`;
  return { bytes: new Uint8Array(await workbook.xlsx.writeBuffer()), filename };
}
