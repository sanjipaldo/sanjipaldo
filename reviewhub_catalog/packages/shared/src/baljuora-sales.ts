// 발주오라 판매·매출처(2026-11-23, 관리자 요청 "1차 개발"): 책갈피가 보내는 주문 줄·매출처 모양과 홈택스 일괄발급 엑셀 만들기.
// - 매출로 치는 주문: 주문대기(입금 전)·삭제·취소 상태는 뺍니다. 취소·반품 수량은 발주오라가 준 남은 수량(netQuantity)으로 이미 빠져 있습니다.
// - 홈택스 양식: 관리자가 올려 준 홈택스 "엑셀 업로드 양식"(전자세금계산서-일반 59칸 / 전자계산서-일반 54칸)과 칸·글자를 똑같이 맞춥니다.
//   모든 칸은 글자(텍스트)로 넣고(양식이 전부 텍스트 형식, '10000.0' 같은 소수 표기는 오류), 7행부터 최대 100건입니다.
//   양식 안내: "발급가능한 파일 확장자는 XLS, XLSX 입니다."
// - 월 합계로 매출처마다 1장(과세 → 세금계산서, 면세 → 계산서). 작성일자는 그 달 말일, 품목은 4줄까지(많으면 "OO 외 N건").

export const SALES_EXCLUDED_STATUSES = ["pending", "deleted", "cancelled", "canceled"];

/** 매출로 치는 주문 상태인지(주문대기·삭제·취소는 아님) */
export function isRevenueStatus(status: string | null | undefined) {
  const value = String(status ?? "").trim().toLowerCase();
  return !SALES_EXCLUDED_STATUSES.includes(value);
}

/** 발주오라 시각(ISO, UTC) → 한국 날짜 YYYY-MM-DD. 이미 날짜만 있으면 그대로. */
export function seoulDateOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const time = Date.parse(text);
  if (!Number.isFinite(time)) return null;
  return new Date(time + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 책갈피가 보내는 주문 상품 줄(받는 사람 이름·연락처는 보내지 않음) */
export type BaljuoraSalesLineInput = {
  id: string;
  orderId: string | null;
  orderedAt: string | null;
  status: string | null;
  productId: string | null;
  productCode: string | null;
  productName: string;
  supplierId: string | null;
  supplierName: string | null;
  sellerId: string | null;
  sellerName: string | null;
  quantity: number;
  netQuantity: number;
  supplyPrice: number;
  purchaseCost: number | null;
  salesShippingFee: number;
  purchaseShippingFee: number;
};

/** 책갈피가 보내는 매출처(셀러) 회원(계좌·비밀번호·사업자등록증 파일은 보내지 않음) */
export type BaljuoraBuyerInput = {
  id: string;
  companyName: string;
  representativeName: string | null;
  businessNumber: string | null;
  businessType: string | null;
  businessCategory: string | null;
  email: string | null;
  phone: string | null;
  managerName: string | null;
  zipCode: string | null;
  address: string | null;
  addressDetail: string | null;
  groupId: string | null;
  groupName: string | null;
  status: string | null;
  orderAcceptType: string | null;
  username: string | null;
  lastLoginAt: string | null;
  joinedAt: string | null;
};

/** DB센터에서 고칠 수 있는 세금계산서용 매출처 칸 */
export const BUYER_OVERRIDE_FIELDS = ["companyName", "representativeName", "businessNumber", "businessType", "businessCategory", "email", "address", "addressDetail"] as const;
export type BuyerOverrideField = (typeof BUYER_OVERRIDE_FIELDS)[number];
export type BuyerOverrides = Partial<Record<BuyerOverrideField, string>>;
export const BUYER_FIELD_LABELS: Record<BuyerOverrideField, string> = {
  companyName: "상호",
  representativeName: "대표자",
  businessNumber: "사업자등록번호",
  businessType: "업태",
  businessCategory: "종목",
  email: "세금계산서 이메일",
  address: "사업장 주소",
  addressDetail: "상세 주소"
};

// ─── 홈택스 일괄발급 양식 ─────────────────────────────────────────────────────

export type HometaxKind = "taxable" | "exempt";
export const HOMETAX_KIND_LABELS: Record<HometaxKind, string> = { taxable: "세금계산서(과세)", exempt: "계산서(면세)" };
export const HOMETAX_MAX_ROWS = 100;
export const HOMETAX_DATA_START_ROW = 7;
export const HOMETAX_SHEET_NAME = "엑셀업로드양식";

const TAX_INVOICE_TITLE = "엑셀 업로드 양식(전자세금계산서-일반(영세율)) - 100건 이하";
const TAX_INVOICE_HEADERS = [
  "전자(세금)계산서 종류\n(01:일반, 02:영세율)",
  "작성일자",
  "공급자 등록번호\n(\"-\" 없이 입력)",
  "공급자\n 종사업장번호",
  "공급자 상호",
  "공급자 성명",
  "공급자 사업장주소",
  "공급자 업태",
  "공급자 종목",
  "공급자 이메일",
  "공급받는자 등록번호\n(\"-\" 없이 입력)",
  "공급받는자 \n종사업장번호",
  "공급받는자 상호 ",
  "공급받는자 성명",
  "공급받는자 사업장주소",
  "공급받는자 업태",
  "공급받는자 종목",
  "공급받는자 이메일1",
  "공급받는자 이메일2",
  "공급가액\n합계",
  "세액\n합계",
  "비고",
  "일자1\n(2자리, 작성년월 제외)",
  "품목1",
  "규격1",
  "수량1",
  "단가1",
  "공급가액1",
  "세액1",
  "품목비고1",
  "일자2\n(2자리, 작성년월 제외)",
  "품목2",
  "규격2",
  "수량2",
  "단가2",
  "공급가액2",
  "세액2",
  "품목비고2",
  "일자3\n(2자리, 작성년월 제외)",
  "품목3",
  "규격3",
  "수량3",
  "단가3",
  "공급가액3",
  "세액3",
  "품목비고3",
  "일자4\n(2자리, 작성년월 제외)",
  "품목4",
  "규격4",
  "수량4",
  "단가4",
  "공급가액4",
  "세액4",
  "품목비고4",
  "현금",
  "수표",
  "어음",
  "외상미수금",
  "영수(01),\n청구(02)",
];
const TAX_INVOICE_REQUIRED = [0, 1, 2, 4, 5, 10, 12, 13, 19, 20, 22, 27, 28, 58];
const TAX_INVOICE_WIDTHS = [5006, 2446, 3726, 3271, 3271, 2759, 6115, 2759, 2759, 4437, 4721, 3100, 3726, 3726, 5233, 3726, 3726, 4465, 5034, 2446, 1934, 1280, 2872, 2759, 3527, 1564, 1678, 2446, 1934, 2360, 2844, 2759, 3527, 1507, 1678, 2446, 1934, 2360, 2759, 2588, 2986, 1507, 1678, 2446, 1934, 2360, 2645, 2588, 2986, 1507, 1678, 2446, 1934, 2360, 2190, 1934, 2190, 2588, 2247];
const TAX_INVOICE_HEIGHTS = [630, 840, 900, 1920, 1695, 930, 480];
const TAX_INVOICE_INTRO = [
  "○ 필수항목(주황색)은 반드시 입력하셔야 합니다.\n     > 아래 '항목설명' 및 '올바른 예시' 시트를 참고하여 작성하시기 바랍니다.",
  "○ 임의로 양식을 변경[행 또는 열 추가 삭제 등]하는 경우 발급시 오류가 발생할 수 있으므로, 정해진 양식으로 작성하시기 바랍니다\n     > 실제 업로드할 DATA는 7행부터 입력하여야 하며, 최대 100건까지 입력이 가능합니다.(100건 초과 자료는 처리 안되며, 발급은 최대 50건씩 처리가능합니다)",
  "     > 거래한 재화 또는 용역에 맞는 전자(세금)계산서 종류코드(01, 02)를 정확히 입력하셔야 합니다.\n     > 품목은 1건 이상 입력해야 합니다.\n     > 공급받는자 등록번호는 사업자등록번호, 주민등록번호를 입력할 수 있습니다. \n        외국인의 경우 공급받는자 등록번호(C열)에 '9999999999999'를 입력하시고, 비고란(N열)에  외국인등록번호 또는 여권번호를 입력하시기 바랍니다.\n     > 마지막 열(오른쪽 끝)의 '영수(01), 청구(02)'는 필수 항목이니 누락하지 마시기 바랍니다.(영수 : 대가를 받은 경우, 청구 : 대가를 아직 못 받은 경우)",
  "○ 처음 사용자께서는 '올바른 예시' 시트에 있는 내용을 복사ᆞ붙여넣기 하신 후 내용을 수정하시면 오류 없이 쉽게 발급하실 수 있습니다.\n     > 오류발생시 '잘못된 예시' 시트에 있는 내용들을 참고하시면 대표적인 오류 원인을 확인할 수 있습니다. \n○ 발급가능한 파일 확장자는 XLS, XLSX 입니다.\n○ 일괄발급에 도움을 받고자 하시면 국세상담센터(국번없이 126번→ 1번 → 2번)로 문의주시기 바랍니다.",
];
const INVOICE_TITLE = "엑셀 업로드 양식(전자계산서-일반)";
const INVOICE_HEADERS = [
  "전자(세금)계산서 종류\n(05::일반)",
  "작성일자",
  "공급자 등록번호\n(\"-\" 없이 입력)",
  "공급자\n 종사업장번호",
  "공급자 상호",
  "공급자 성명",
  "공급자 사업장주소",
  "공급자 업태",
  "공급자 종목",
  "공급자 이메일",
  "공급받는자 등록번호\n(\"-\" 없이 입력)",
  "공급받는자 \n종사업장번호",
  "공급받는자 상호",
  "공급받는자 성명",
  "공급받는자 사업장주소",
  "공급받는자 업태",
  "공급받는자 종목",
  "공급받는자 이메일1",
  "공급받는자 이메일2",
  "공급가액\n합계",
  "비고",
  "일자1\n(2자리, 작성년월 제외)",
  "품목1",
  "규격1",
  "수량1",
  "단가1",
  "공급가액1",
  "품목비고1",
  "일자2\n(2자리, 작성년월 제외)",
  "품목2",
  "규격2",
  "수량2",
  "단가2",
  "공급가액2",
  "품목비고2",
  "일자3\n(2자리, 작성년월 제외)",
  "품목3",
  "규격3",
  "수량3",
  "단가3",
  "공급가액3",
  "품목비고3",
  "일자4\n(2자리, 작성년월 제외)",
  "품목4",
  "규격4",
  "수량4",
  "단가4",
  "공급가액4",
  "품목비고4",
  "현금",
  "수표",
  "어음",
  "외상미수금",
  "영수(01),\n청구(02)",
];
const INVOICE_REQUIRED = [0, 1, 2, 4, 5, 10, 12, 13, 19, 21, 26, 53];
const INVOICE_WIDTHS = [5006, 2446, 3726, 3271, 3271, 2759, 6115, 2759, 2759, 4437, 4721, 3100, 3726, 3726, 5233, 3726, 3726, 4465, 5034, 2446, 1280, 2872, 2759, 3527, 1564, 1678, 2446, 2360, 2844, 2759, 3527, 1507, 1678, 2446, 2360, 2759, 2588, 2986, 1507, 1678, 2446, 2360, 2645, 2588, 2986, 1507, 1678, 2446, 2360, 2190, 1934, 2190, 2588, 2247];
const INVOICE_HEIGHTS = [630, 885, 900, 2025, 1740, 930, 480];
const INVOICE_INTRO = [
  "○ 필수항목(주황색)은 반드시 입력하셔야 합니다.\n     > 아래 '항목설명' 및 '올바른 예시' 시트를 참고하여 작성하시기 바랍니다.",
  "○ 임의로 양식을 변경[행 또는 열 추가 삭제 등]하는 경우 발급시 오류가 발생할 수 있으므로, 정해진 양식으로 작성하시기 바랍니다\n     > 실제 업로드할 DATA는 7행부터 입력하여야 하며, 최대 100건까지 입력이 가능합니다.(100건 초과 자료는 처리 안되며, 발급은 최대 50건씩 처리가능합니다)",
  "     > 거래한 재화 또는 용역에 맞는 전자(세금)계산서 종류코드(05)를 정확히 입력하셔야 합니다.\n     > 품목은 1건 이상 입력해야 합니다.\n     > 공급받는자 등록번호는 사업자등록번호, 주민등록번호를 입력할 수 있습니다. \n        외국인의 경우 공급받는자 등록번호(C열)에 '9999999999999'를 입력하시고, 비고란(N열)에  외국인등록번호 또는 여권번호를 입력하시기 바랍니다.\n     > 마지막 열(오른쪽 끝)의 '영수(01), 청구(02)'는 필수 항목이니 누락하지 마시기 바랍니다.(영수 : 대가를 받은 경우, 청구 : 대가를 아직 못 받은 경우)",
  "○ 처음 사용자께서는 '올바른 예시' 시트에 있는 내용을 복사ᆞ붙여넣기 하신 후 내용을 수정하시면 오류 없이 쉽게 발급하실 수 있습니다.\n     > 오류발생시 '잘못된 예시' 시트에 있는 내용들을 참고하시면 대표적인 오류 원인을 확인할 수 있습니다. \n○ 발급가능한 파일 확장자는 XLS, XLSX 입니다.\n○ 일괄발급에 도움을 받고자 하시면 국세상담센터(국번없이 126번→ 1번 → 2번)로 문의주시기 바랍니다.",
];

export const HOMETAX_LAYOUT: Record<HometaxKind, { title: string; headers: string[]; required: number[]; widths: number[]; heights: number[]; intro: string[]; typeCode: string }> = {
  taxable: { title: TAX_INVOICE_TITLE, headers: TAX_INVOICE_HEADERS, required: TAX_INVOICE_REQUIRED, widths: TAX_INVOICE_WIDTHS, heights: TAX_INVOICE_HEIGHTS, intro: TAX_INVOICE_INTRO, typeCode: "01" },
  exempt: { title: INVOICE_TITLE, headers: INVOICE_HEADERS, required: INVOICE_REQUIRED, widths: INVOICE_WIDTHS, heights: INVOICE_HEIGHTS, intro: INVOICE_INTRO, typeCode: "05" }
};

export type HometaxSupplier = {
  businessNumber: string;
  branchNumber: string;
  companyName: string;
  ceoName: string;
  address: string;
  businessType: string;
  businessItem: string;
  email: string;
};

export type HometaxSettings = {
  supplier: HometaxSupplier;
  /** 과세 상품 금액(발주오라 공급가)에 부가세가 들어 있는지. 들어 있으면 공급가액 = 금액 ÷ 1.1 */
  vatIncluded: boolean;
  /** 영수(01: 대가를 받은 경우) · 청구(02: 아직 못 받은 경우) */
  receiptType: "01" | "02";
  /** 매출처가 낸 배송비를 품목 "배송비"로 넣을지 */
  includeShipping: boolean;
};

export const DEFAULT_HOMETAX_SETTINGS: HometaxSettings = {
  supplier: { businessNumber: "", branchNumber: "", companyName: "", ceoName: "", address: "", businessType: "", businessItem: "", email: "" },
  vatIncluded: true,
  receiptType: "01",
  includeShipping: true
};

export type HometaxBuyer = {
  key: string;
  name: string;
  businessNumber: string;
  companyName: string;
  ceoName: string;
  address: string;
  businessType: string;
  businessItem: string;
  email: string;
};

export type HometaxSaleLine = {
  buyerKey: string;
  productKey: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  shippingFee: number;
  isTaxable: boolean;
};

export type HometaxItem = { day: string; name: string; spec: string; quantity: number | null; unitPrice: number | null; supply: number; tax: number; note: string };
export type HometaxInvoice = {
  kind: HometaxKind;
  buyerKey: string;
  buyer: HometaxBuyer;
  writeDate: string;
  items: HometaxItem[];
  supplyTotal: number;
  taxTotal: number;
  grossTotal: number;
  productCount: number;
  shippingTotal: number;
};
export type HometaxSkip = { buyerKey: string; buyerName: string; kind: HometaxKind; grossTotal: number; reasons: string[] };

/** 숫자만 남긴 사업자등록번호(주민번호 13자리 포함) */
export function normalizeBusinessNumber(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

/** 홈택스 길이 기준(영문·숫자 1byte, 한글 2byte)으로 자르기 */
export function hometaxBytes(text: string) {
  let bytes = 0;
  for (const char of text) bytes += char.charCodeAt(0) < 128 ? 1 : 2;
  return bytes;
}

export function truncateHometax(text: string | null | undefined, maxBytes: number) {
  const clean = String(text ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (hometaxBytes(clean) <= maxBytes) return clean;
  let out = "";
  let bytes = 0;
  for (const char of clean) {
    const size = char.charCodeAt(0) < 128 ? 1 : 2;
    if (bytes + size > maxBytes) break;
    out += char;
    bytes += size;
  }
  return out.trim();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 부가세 나누기: 포함이면 공급가액 = round(금액 ÷ 1.1), 세액 = 금액 − 공급가액. 별도면 세액 = round(금액 × 10%). */
export function splitVat(gross: number, vatIncluded: boolean) {
  const amount = Math.round(gross);
  if (vatIncluded) {
    const supply = Math.round((amount * 10) / 11);
    return { supply, tax: amount - supply };
  }
  return { supply: amount, tax: Math.round(amount / 10) };
}

export function lastDayOfMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

export function hometaxSupplierProblems(supplier: HometaxSupplier) {
  const problems: string[] = [];
  if (normalizeBusinessNumber(supplier.businessNumber).length !== 10) problems.push("공급자(두고푸드) 사업자등록번호 10자리");
  if (!supplier.companyName.trim()) problems.push("공급자 상호");
  if (!supplier.ceoName.trim()) problems.push("공급자 대표자 성명");
  if (supplier.email.trim() && !EMAIL_PATTERN.test(supplier.email.trim())) problems.push("공급자 이메일 형식");
  return problems;
}

export function hometaxBuyerProblems(buyer: Pick<HometaxBuyer, "businessNumber" | "companyName" | "ceoName">) {
  const problems: string[] = [];
  const number = normalizeBusinessNumber(buyer.businessNumber);
  if (number.length !== 10 && number.length !== 13) problems.push(number ? "사업자등록번호 자릿수(10자리)" : "사업자등록번호 없음");
  if (!buyer.companyName.trim()) problems.push("상호 없음");
  if (!buyer.ceoName.trim()) problems.push("대표자 성명 없음");
  return problems;
}

type ProductSum = { key: string; name: string; quantity: number; amount: number; unitPrices: Set<number> };

function itemFor(kind: HometaxKind, day: string, name: string, gross: number, quantity: number | null, unitPrice: number | null, vatIncluded: boolean, maxNameBytes = 100): HometaxItem {
  const { supply, tax } = kind === "taxable" ? splitVat(gross, vatIncluded) : { supply: Math.round(gross), tax: 0 };
  let unit: number | null = null;
  if (quantity && unitPrice !== null) {
    const unitSupply = kind === "taxable" ? splitVat(unitPrice, vatIncluded).supply : unitPrice;
    // 수량 × 단가가 공급가액과 딱 맞을 때만 단가를 적습니다(부가세 나누기 반올림으로 어긋나면 비움).
    if (unitSupply * quantity === supply) unit = unitSupply;
  }
  return { day, name: truncateHometax(name, maxNameBytes), spec: "", quantity: quantity && quantity > 0 ? quantity : null, unitPrice: unit, supply, tax, note: "" };
}

/** 그 달 판매 줄 → 매출처·과세구분별 월 합계 세금계산서/계산서 */
export function buildHometaxInvoices(input: { month: string; lines: HometaxSaleLine[]; buyers: Map<string, HometaxBuyer>; settings: Pick<HometaxSettings, "vatIncluded" | "includeShipping"> }) {
  const lastDay = lastDayOfMonth(input.month);
  const day = String(lastDay).padStart(2, "0");
  const writeDate = `${input.month.replace("-", "")}${day}`;
  const groups = new Map<string, { kind: HometaxKind; buyerKey: string; products: Map<string, ProductSum>; shipping: number }>();
  for (const line of input.lines) {
    const kind: HometaxKind = line.isTaxable ? "taxable" : "exempt";
    const groupKey = `${kind}|${line.buyerKey}`;
    const group = groups.get(groupKey) ?? { kind, buyerKey: line.buyerKey, products: new Map<string, ProductSum>(), shipping: 0 };
    if (line.amount > 0 || line.quantity > 0) {
      const product = group.products.get(line.productKey) ?? { key: line.productKey, name: line.productName, quantity: 0, amount: 0, unitPrices: new Set<number>() };
      product.quantity += Math.max(0, line.quantity);
      product.amount += Math.max(0, line.amount);
      if (line.quantity > 0) product.unitPrices.add(line.unitPrice);
      group.products.set(line.productKey, product);
    }
    if (input.settings.includeShipping) group.shipping += Math.max(0, line.shippingFee);
    groups.set(groupKey, group);
  }
  const taxable: HometaxInvoice[] = [];
  const exempt: HometaxInvoice[] = [];
  const skipped: HometaxSkip[] = [];
  for (const group of groups.values()) {
    const products = [...group.products.values()].filter((product) => product.amount > 0).sort((first, second) => second.amount - first.amount || first.name.localeCompare(second.name, "ko"));
    const productGross = products.reduce((sum, product) => sum + product.amount, 0);
    const grossTotal = productGross + group.shipping;
    if (grossTotal <= 0) continue;
    const buyer = input.buyers.get(group.buyerKey);
    const problems = buyer ? hometaxBuyerProblems(buyer) : ["발주오라 매출처 정보를 아직 가져오지 않았습니다"];
    if (!buyer || problems.length > 0) {
      skipped.push({ buyerKey: group.buyerKey, buyerName: buyer?.name || group.buyerKey.replace(/^name:/, ""), kind: group.kind, grossTotal, reasons: problems });
      continue;
    }
    const items: HometaxItem[] = [];
    const productSlots = group.shipping > 0 ? 3 : 4;
    if (products.length <= productSlots) {
      for (const product of products) items.push(itemFor(group.kind, day, product.name, product.amount, product.quantity, product.unitPrices.size === 1 ? [...product.unitPrices][0] : null, input.settings.vatIncluded));
    } else {
      const shown = products.slice(0, productSlots - 1);
      const rest = products.slice(productSlots - 1);
      for (const product of shown) items.push(itemFor(group.kind, day, product.name, product.amount, product.quantity, product.unitPrices.size === 1 ? [...product.unitPrices][0] : null, input.settings.vatIncluded));
      const suffix = ` 외 ${rest.length - 1}건`;
      const base = truncateHometax(rest[0].name, 100 - hometaxBytes(suffix));
      items.push(itemFor(group.kind, day, `${base}${suffix}`, rest.reduce((sum, product) => sum + product.amount, 0), null, null, input.settings.vatIncluded));
    }
    if (group.shipping > 0) items.push(itemFor(group.kind, day, "배송비", group.shipping, null, null, input.settings.vatIncluded));
    const invoice: HometaxInvoice = {
      kind: group.kind,
      buyerKey: group.buyerKey,
      buyer,
      writeDate,
      items,
      supplyTotal: items.reduce((sum, item) => sum + item.supply, 0),
      taxTotal: items.reduce((sum, item) => sum + item.tax, 0),
      grossTotal,
      productCount: products.length,
      shippingTotal: group.shipping
    };
    (group.kind === "taxable" ? taxable : exempt).push(invoice);
  }
  const byAmount = (first: HometaxInvoice, second: HometaxInvoice) => second.grossTotal - first.grossTotal || first.buyer.companyName.localeCompare(second.buyer.companyName, "ko");
  taxable.sort(byAmount);
  exempt.sort(byAmount);
  skipped.sort((first, second) => second.grossTotal - first.grossTotal);
  return { taxable, exempt, skipped, writeDate };
}

const text = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(Math.round(value)));

/** 홈택스 양식 한 줄(세금계산서 59칸 / 계산서 54칸)의 글자 값 */
export function hometaxRowCells(kind: HometaxKind, invoice: HometaxInvoice, supplier: HometaxSupplier, receiptType: "01" | "02") {
  const emailBytes = kind === "taxable" ? 40 : 50;
  const buyerEmail = EMAIL_PATTERN.test(invoice.buyer.email.trim()) ? truncateHometax(invoice.buyer.email.trim(), emailBytes) : "";
  const supplierEmail = EMAIL_PATTERN.test(supplier.email.trim()) ? truncateHometax(supplier.email.trim(), emailBytes) : "";
  const cells: string[] = [
    HOMETAX_LAYOUT[kind].typeCode,
    invoice.writeDate,
    normalizeBusinessNumber(supplier.businessNumber),
    normalizeBusinessNumber(supplier.branchNumber).slice(0, 4),
    truncateHometax(supplier.companyName, 70),
    truncateHometax(supplier.ceoName, 30),
    truncateHometax(supplier.address, 150),
    truncateHometax(supplier.businessType, 40),
    truncateHometax(supplier.businessItem, 60),
    supplierEmail,
    normalizeBusinessNumber(invoice.buyer.businessNumber),
    "",
    truncateHometax(invoice.buyer.companyName, 70),
    truncateHometax(invoice.buyer.ceoName, 30),
    truncateHometax(invoice.buyer.address, 150),
    truncateHometax(invoice.buyer.businessType, 40),
    truncateHometax(invoice.buyer.businessItem, 60),
    buyerEmail,
    "",
    text(invoice.supplyTotal)
  ];
  if (kind === "taxable") cells.push(text(invoice.taxTotal));
  cells.push("");
  for (let index = 0; index < 4; index += 1) {
    const item = invoice.items[index];
    if (!item) {
      cells.push(...Array.from({ length: kind === "taxable" ? 8 : 7 }, () => ""));
      continue;
    }
    cells.push(item.day, item.name, truncateHometax(item.spec, 60), text(item.quantity), text(item.unitPrice), text(item.supply));
    if (kind === "taxable") cells.push(text(item.tax));
    cells.push(truncateHometax(item.note, 100));
  }
  cells.push("", "", "", "", receiptType);
  return cells;
}
