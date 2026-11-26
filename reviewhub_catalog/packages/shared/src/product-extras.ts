// 발주오라 상품 등록 화면과 같은 상품 정보 칸(서버·관리자 화면 공용, 2026-11-26 관리자 요청 "발주오라 상품관리자 페이지와 빠지는 거 없이
// 양방향으로 동기화되게, DB센터 상품 창 레이아웃은 그대로 두고 칸만 추가"). DB 표: product_extras(migration 037).
// 칸 이름·선택지는 발주오라 화면 코드(공개 js)와 같게 맞췄습니다: 내용량 단위 kg·g·L·mL·m(전체/개당), 배송 단위 개·kg·박스·포·봉·팩·통·병·판·망·묶음,
// 원산지 "국내산 경북"·"수입산 중국"·"원양산 태평양"·"상세설명 참조", 인증 종류 haccp·organic 등.
// 원산지·택배사·배송유형(국내/해외)·품절·시즌종료·노출은 원래 있던 products 칸을 그대로 씁니다.

export type ContentBasis = "total" | "each";

export type ProductExtras = {
  // 과세 여부: true 과세 · false 비과세 · null 자동(건강식품 카테고리는 과세, 그 밖은 비과세 — 발주오라 등록 엑셀과 같은 기준)
  isTaxable: boolean | null;
  managementCode: string | null;
  barcode: string | null;
  // 내용량: contentAmount = 전체 양(예: 5 kg), contentCount = 개수(예: 10), contentBasis each면 "개당 0.5kg × 10개"로 보임
  contentAmount: number | null;
  contentUnit: string | null;
  contentCount: number | null;
  contentBasis: ContentBasis | null;
  // 발주상품명(매입처에 발주할 때 쓰는 이름)·발주단위(판매 1개당 매입처에 발주하는 수량)
  purchaseName: string | null;
  purchaseQuantity: number | null;
  // 배송 단위(예: 박스 1)
  shippingUnitType: string | null;
  shippingUnitValue: number | null;
  // 발주마감 시각(예: "09:30")
  purchaseDeadline: string | null;
  // 인증 종류(발주오라에서 가져옴 · 인증번호와 함께 발주오라에서 관리)
  certificationKinds: string[];
  // 상품 간략설명(100자, 발주오라 상품명 아래 한 줄)
  summary: string | null;
  shippingLocation: string | null;
  manufacturingDate: string | null;
  expirationDate: string | null;
  // 발주오라 상품 분류(발주오라에서 가져온 값, 읽기만)
  taxonomyItemId: string | null;
  taxonomyName: string | null;
};

export const CONTENT_UNITS = ["kg", "g", "L", "mL", "m"] as const;
export const CONTENT_BASIS_LABELS: Record<ContentBasis, string> = { total: "전체 양", each: "개당 양" };
export const SHIPPING_UNIT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ea", label: "개" },
  { value: "kg", label: "kg" },
  { value: "box", label: "박스" },
  { value: "po", label: "포" },
  { value: "bag", label: "봉" },
  { value: "pack", label: "팩" },
  { value: "tub", label: "통" },
  { value: "bottle", label: "병" },
  { value: "tray", label: "판" },
  { value: "net", label: "망" },
  { value: "bundle", label: "묶음" }
];
// 인증 종류(발주오라 화면 이름). 농수산·식품에서 많이 쓰는 것을 앞에 둡니다.
export const CERTIFICATION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "haccp", label: "HACCP" },
  { value: "organic", label: "유기농" },
  { value: "pesticide-free", label: "무농약" },
  { value: "antibiotic-free", label: "무항생제" },
  { value: "gap", label: "GAP 우수관리인증" },
  { value: "animal-welfare", label: "동물복지" },
  { value: "gi", label: "지리적표시" },
  { value: "traditional-food", label: "전통식품 품질인증" },
  { value: "hff-report", label: "건강기능식품 판매업 신고" },
  { value: "traditional-liquor-approval", label: "전통주 통신판매 승인" },
  { value: "organic-material-notice", label: "유기농업자재 공시" },
  { value: "kc-safety-cert", label: "KC 안전인증" },
  { value: "kc-safety-confirm", label: "KC 안전확인" },
  { value: "kc-supplier-conformity", label: "KC 공급자적합성확인" },
  { value: "kc-children", label: "어린이제품 KC" },
  { value: "kc-radio", label: "전파인증" },
  { value: "chem-notice", label: "생활화학제품 신고" },
  { value: "chem-approval", label: "살생물제품 승인" },
  { value: "fire-type-approval", label: "소방용품 형식승인" },
  { value: "medical-device-sales-report", label: "의료기기 판매업 신고" },
  { value: "medical-device-approval", label: "의료기기 허가" },
  { value: "other-voluntary", label: "그 밖의 임의 인증" }
];
// 원산지(발주오라 형식): 종류 + 지역/나라. "국내산 경북", "수입산 중국,베트남", "원양산 태평양", "상세설명 참조"
export const ORIGIN_KINDS = ["국내산", "수입산", "원양산", "상세설명 참조"] as const;
export const DOMESTIC_REGIONS = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주", "세종"] as const;
export const OCEAN_NAMES = ["태평양", "대서양", "인도양", "남빙양", "북빙양"] as const;
// 발주오라 등록 양식의 택배사 목록(직접 입력도 됨)
export const COURIER_SUGGESTIONS = ["CJ대한통운", "롯데택배", "우체국택배", "한진택배", "홈픽택배", "로젠택배", "경동택배", "대신택배"] as const;

export const PRODUCT_EXTRAS_LIMITS = {
  managementCode: 50,
  barcode: 40,
  purchaseName: 100,
  summary: 100,
  shippingLocation: 50,
  manufacturingDate: 30,
  expirationDate: 30,
  taxonomyName: 200
} as const;

export function emptyProductExtras(): ProductExtras {
  return {
    isTaxable: null,
    managementCode: null,
    barcode: null,
    contentAmount: null,
    contentUnit: null,
    contentCount: null,
    contentBasis: null,
    purchaseName: null,
    purchaseQuantity: null,
    shippingUnitType: null,
    shippingUnitValue: null,
    purchaseDeadline: null,
    certificationKinds: [],
    summary: null,
    shippingLocation: null,
    manufacturingDate: null,
    expirationDate: null,
    taxonomyItemId: null,
    taxonomyName: null
  };
}

function text(value: unknown, max: number) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const clean = String(value).replace(/\s+/gu, " ").trim();
  return clean ? clean.slice(0, max) : null;
}

function positiveNumber(value: unknown, decimals: number) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(/,/gu, "").trim());
  if (!Number.isFinite(number) || number <= 0) return null;
  const scale = 10 ** decimals;
  return Math.round(number * scale) / scale;
}

function positiveInteger(value: unknown) {
  const number = positiveNumber(value, 0);
  return number !== null && number >= 1 ? Math.min(number, 1_000_000) : null;
}

// 발주마감 시각: "9:30"·"09:30"·"0930"·"09:30:00" → "09:30"(틀리면 null)
export function normalizeDeadline(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  // 발주오라가 "09:30:00"(초 포함)으로 돌려줘도 같게 봅니다.
  const match = /^(\d{1,2}):?(\d{2})(?::\d{2})?$/u.exec(raw.replace(/\s/gu, ""));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function contentDecimals(unit: string | null | undefined) {
  return unit === "g" || unit === "mL" ? 0 : 2;
}

// 저장 전 정리: 앞뒤 빈칸·길이·숫자 형식을 맞춥니다(모르는 값은 비움). 검사 문구는 productExtrasProblems로 따로 봅니다.
export function normalizeProductExtras(input: Partial<Record<keyof ProductExtras, unknown>> | null | undefined): ProductExtras {
  const source = input ?? {};
  const unit = typeof source.contentUnit === "string" && (CONTENT_UNITS as readonly string[]).includes(source.contentUnit) ? source.contentUnit : null;
  const amount = positiveNumber(source.contentAmount, contentDecimals(unit));
  const count = positiveInteger(source.contentCount);
  const shippingType = typeof source.shippingUnitType === "string" && SHIPPING_UNIT_OPTIONS.some((option) => option.value === source.shippingUnitType) ? source.shippingUnitType : null;
  const shippingValue = shippingType ? positiveNumber(source.shippingUnitValue, 2) : null;
  const kinds = Array.isArray(source.certificationKinds) ? source.certificationKinds : [];
  const known = new Set(CERTIFICATION_OPTIONS.map((option) => option.value));
  return {
    isTaxable: typeof source.isTaxable === "boolean" ? source.isTaxable : null,
    managementCode: text(source.managementCode, PRODUCT_EXTRAS_LIMITS.managementCode),
    barcode: text(source.barcode, PRODUCT_EXTRAS_LIMITS.barcode)?.replace(/\s/gu, "") || null,
    contentAmount: unit ? amount : null,
    contentUnit: unit && amount !== null ? unit : null,
    contentCount: count,
    contentBasis: source.contentBasis === "each" && count !== null && count > 1 ? "each" : count !== null || (unit && amount !== null) ? "total" : null,
    purchaseName: text(source.purchaseName, PRODUCT_EXTRAS_LIMITS.purchaseName),
    purchaseQuantity: positiveInteger(source.purchaseQuantity),
    shippingUnitType: shippingType && shippingValue !== null ? shippingType : null,
    shippingUnitValue: shippingType ? shippingValue : null,
    purchaseDeadline: normalizeDeadline(source.purchaseDeadline),
    certificationKinds: [...new Set(kinds.filter((kind): kind is string => typeof kind === "string" && known.has(kind)))].sort(),
    summary: text(source.summary, PRODUCT_EXTRAS_LIMITS.summary),
    shippingLocation: text(source.shippingLocation, PRODUCT_EXTRAS_LIMITS.shippingLocation),
    manufacturingDate: text(source.manufacturingDate, PRODUCT_EXTRAS_LIMITS.manufacturingDate),
    expirationDate: text(source.expirationDate, PRODUCT_EXTRAS_LIMITS.expirationDate),
    taxonomyItemId: text(source.taxonomyItemId, 80),
    taxonomyName: text(source.taxonomyName, PRODUCT_EXTRAS_LIMITS.taxonomyName)
  };
}

// 관리자가 넣은 값 중 고쳐야 할 것(저장 막음). 빈 칸은 괜찮습니다.
export function productExtrasProblems(input: Partial<Record<keyof ProductExtras, unknown>> | null | undefined) {
  const source = input ?? {};
  const problems: string[] = [];
  const filled = (value: unknown) => value !== null && value !== undefined && String(value).trim() !== "";
  if (filled(source.barcode) && !/^[0-9A-Za-z-]+$/u.test(String(source.barcode).replace(/\s/gu, ""))) problems.push("바코드는 숫자·영문·하이픈(-)만 넣어 주세요.");
  if (filled(source.purchaseDeadline) && !normalizeDeadline(source.purchaseDeadline)) problems.push("발주마감은 09:30처럼 시:분으로 넣어 주세요.");
  if (filled(source.contentAmount) && !filled(source.contentUnit)) problems.push("내용량 단위(kg·g·L·mL·m)를 골라 주세요.");
  if (filled(source.contentAmount)) {
    const unit = String(source.contentUnit ?? "");
    const number = Number(String(source.contentAmount).replace(/,/gu, ""));
    if (!Number.isFinite(number) || number <= 0) problems.push("내용량은 0보다 큰 숫자로 넣어 주세요.");
    else if (contentDecimals(unit) === 0 && !Number.isInteger(number)) problems.push(`내용량 ${unit} 단위는 정수로 넣어 주세요.`);
    else if (Math.abs(number * 100 - Math.round(number * 100)) > 1e-6) problems.push("내용량은 소수 둘째 자리까지 넣어 주세요.");
  }
  if (filled(source.contentCount) && !(Number.isInteger(Number(source.contentCount)) && Number(source.contentCount) >= 1)) problems.push("내용량 개수는 1 이상의 정수로 넣어 주세요.");
  if (filled(source.purchaseQuantity) && !(Number.isInteger(Number(source.purchaseQuantity)) && Number(source.purchaseQuantity) >= 1)) problems.push("발주단위는 1 이상의 정수로 넣어 주세요.");
  if (filled(source.shippingUnitValue) && !filled(source.shippingUnitType)) problems.push("배송 단위(개·박스 등)를 골라 주세요.");
  if (filled(source.shippingUnitValue) && !(Number(String(source.shippingUnitValue).replace(/,/gu, "")) > 0)) problems.push("배송 단위 수량은 0보다 큰 숫자로 넣어 주세요.");
  const long = (key: keyof typeof PRODUCT_EXTRAS_LIMITS, label: string) => {
    if (typeof source[key] === "string" && String(source[key]).trim().length > PRODUCT_EXTRAS_LIMITS[key]) problems.push(`${label}은 ${PRODUCT_EXTRAS_LIMITS[key]}자 이하로 넣어 주세요.`);
  };
  long("managementCode", "관리코드");
  long("purchaseName", "발주상품명");
  long("summary", "상품 간략설명");
  long("shippingLocation", "출고지");
  long("manufacturingDate", "제조연월일");
  long("expirationDate", "소비기한");
  return problems;
}

export function hasProductExtras(extras: ProductExtras | null | undefined) {
  if (!extras) return false;
  return Object.entries(extras).some(([key, value]) => key === "certificationKinds" ? Array.isArray(value) && value.length > 0 : value !== null && value !== undefined);
}

// 과세 여부 자동값: 건강식품 카테고리는 과세, 그 밖은 비과세(발주오라 등록 엑셀과 같은 기준)
export function defaultTaxableForCategory(categoryName: string | null | undefined) {
  return Boolean(categoryName && categoryName.replace(/[^\p{L}\p{N}]+/gu, "").includes("건강식품"));
}

export function shippingUnitLabel(type: string | null | undefined) {
  return SHIPPING_UNIT_OPTIONS.find((option) => option.value === type)?.label ?? (type || "");
}

export function certificationLabel(kind: string) {
  return CERTIFICATION_OPTIONS.find((option) => option.value === kind)?.label ?? kind;
}

function trimNumber(value: number) {
  return String(Number(value.toFixed(2)));
}

// 내용량 보기(발주오라 화면과 같은 모양): "500g" · "5kg, 10개" · "개당 0.5kg × 10개"
export function formatContent(amount: number | null | undefined, unit: string | null | undefined, count: number | null | undefined, basis: string | null | undefined) {
  const total = amount !== null && amount !== undefined && unit ? `${trimNumber(amount)}${unit}` : null;
  if (count === null || count === undefined) return total ?? "";
  if (!total) return `${count}개`;
  if (count === 1) return `${total}, 1개`;
  const each = Math.round(((amount as number) / count) * 100) / 100;
  if (basis === "each" && Math.abs(each * count - (amount as number)) < 1e-6) return `개당 ${trimNumber(each)}${unit} × ${count}개`;
  return `${count}개, 총 ${total}`;
}

export function formatShippingUnit(type: string | null | undefined, value: number | null | undefined) {
  if (!type || value === null || value === undefined) return "";
  return `${trimNumber(value)}${shippingUnitLabel(type)}`;
}
