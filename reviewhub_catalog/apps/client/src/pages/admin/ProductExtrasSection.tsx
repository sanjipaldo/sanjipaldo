// 관리자 상품 창 > 발주오라 상품 정보(2026-11-26 관리자 요청 "발주오라 상품관리자 페이지와 빠지는 거 없이 양방향으로, DB센터 레이아웃은 그대로").
// 발주오라 상품 등록 화면에 있는데 DB센터에 없던 칸(과세 여부·관리코드·바코드·내용량·발주상품명·발주단위·배송 단위·발주마감·간략설명·
// 출고지·제조연월일·소비기한)을 상품 창 아래쪽에 한 묶음으로 둡니다. 인증·상품 분류는 발주오라에서 가져온 값을 보여 주기만 합니다.
// 값은 product_extras(migration 037)에 저장되고, 발주오라 동기화가 양쪽을 비교해 보내거나 가져옵니다.
import { useId } from "react";
import { AlertTriangle, BadgeCheck, Loader2 } from "lucide-react";
import {
  CONTENT_BASIS_LABELS,
  CONTENT_UNITS,
  SHIPPING_UNIT_OPTIONS,
  certificationLabel,
  formatContent,
  formatShippingUnit,
  normalizeDeadline,
  type ContentBasis,
  type ProductExtras
} from "@repo/shared/product-extras";
import type { BaljuoraSnapshotExtra } from "@repo/shared/baljuora-sync";
import "./product-extras.css";

export type ProductExtrasStatus = "loading" | "ready" | "missing" | "error";
// 마지막 비교·동기화 때 읽은 발주오라 값(다르면 칸 아래에 "발주오라: …"로 보여 줌)
export type BaljuoraExtraHint = { extra?: BaljuoraSnapshotExtra | null; isTaxable?: boolean | null } | null;

type Props = {
  value: ProductExtras;
  onChange: (next: ProductExtras) => void;
  status: ProductExtrasStatus;
  // 과세 여부 자동값(카테고리 기준: 건강식품 과세)
  taxableDefault: boolean;
  baljuora?: BaljuoraExtraHint;
};

function numberOrNull(raw: string) {
  const text = raw.replace(/,/g, "").trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function same(left: unknown, right: unknown) {
  const blank = (value: unknown) => value === null || value === undefined || value === "";
  if (blank(left) && blank(right)) return true;
  return String(left ?? "").replace(/\s+/g, " ").trim() === String(right ?? "").replace(/\s+/g, " ").trim();
}

export function ProductExtrasSection({ value, onChange, status, taxableDefault, baljuora }: Props) {
  const id = useId();
  const disabled = status !== "ready";
  const set = <K extends keyof ProductExtras>(key: K, next: ProductExtras[K]) => onChange({ ...value, [key]: next });
  const bj = baljuora?.extra ?? null;
  // 발주오라 값이 DB센터 값과 다를 때만 칸 아래에 보여 줍니다(읽지 못한 칸은 보이지 않음).
  const hint = (current: unknown, remote: unknown, show?: string | null) => {
    if (!bj || remote === undefined || same(current, remote)) return null;
    return <small className="pe-remote">발주오라: {show ?? (remote === null || remote === "" ? "비어 있음" : String(remote))}</small>;
  };
  const taxable = value.isTaxable ?? taxableDefault;
  const contentPreview = formatContent(value.contentAmount, value.contentUnit, value.contentCount, value.contentBasis);
  const remoteContent = bj && (bj.contentAmount !== undefined || bj.contentCount !== undefined) ? formatContent(bj.contentAmount ?? null, bj.contentUnit ?? null, bj.contentCount ?? null, bj.contentBasis ?? null) : undefined;
  const remoteShipping = bj && (bj.shippingUnitType !== undefined || bj.shippingUnitValue !== undefined) ? formatShippingUnit(bj.shippingUnitType ?? null, bj.shippingUnitValue ?? null) : undefined;
  const summaryLength = value.summary?.length ?? 0;

  return (
    <section className="full product-extras" aria-labelledby={`${id}-title`}>
      <div className="pe-head">
        <h3 id={`${id}-title`}>발주오라 상품 정보</h3>
        <p>발주오라 상품 등록 화면과 같은 칸이에요. 동기화하면 발주오라와 양쪽 같게 맞춰져요. 비워 둔 칸은 발주오라 값을 지우지 않아요.</p>
      </div>
      {status === "loading" && <p className="pe-note"><Loader2 className="pe-spin" size={14} aria-hidden="true" /> 상품 정보 칸을 불러오는 중…</p>}
      {status === "missing" && <p className="pe-note is-warn"><AlertTriangle size={14} aria-hidden="true" /> 상품 정보 칸은 DB 업데이트(037)가 적용된 뒤 저장할 수 있어요(운영 배포 후). 지금은 다른 칸만 저장돼요.</p>}
      {status === "error" && <p className="pe-note is-warn"><AlertTriangle size={14} aria-hidden="true" /> 상품 정보 칸을 불러오지 못했어요. 이번 저장에서는 이 칸들을 바꾸지 않아요.</p>}
      <fieldset className="pe-grid" disabled={disabled}>
        <div className="pe-field">
          <span className="pe-label" id={`${id}-tax`}>과세 여부</span>
          <div className="pe-segment" role="radiogroup" aria-labelledby={`${id}-tax`}>
            {([[null, `자동(${taxableDefault ? "과세" : "비과세"})`], [true, "과세"], [false, "비과세"]] as Array<[boolean | null, string]>).map(([option, label]) => (
              <label key={String(option)} className={value.isTaxable === option ? "active" : ""}>
                <input type="radio" name={`${id}-taxable`} checked={value.isTaxable === option} onChange={() => set("isTaxable", option)} />
                {label}
              </label>
            ))}
          </div>
          <small>자동은 건강식품 카테고리면 과세, 그 밖(농·수·축산물)은 비과세예요. 세금계산서(과세)·계산서(면세)를 나누는 기준이에요.</small>
          {hint(taxable, baljuora?.isTaxable === undefined || baljuora?.isTaxable === null ? undefined : baljuora.isTaxable, baljuora?.isTaxable ? "과세" : "비과세")}
        </div>
        <label className="pe-field">
          <span className="pe-label">관리코드</span>
          <input value={value.managementCode ?? ""} maxLength={50} onChange={(event) => set("managementCode", event.target.value || null)} placeholder="매입처 품번 등(선택)" />
          {hint(value.managementCode, bj?.managementCode)}
        </label>
        <label className="pe-field">
          <span className="pe-label">바코드</span>
          <input value={value.barcode ?? ""} maxLength={40} inputMode="text" onChange={(event) => set("barcode", event.target.value || null)} placeholder="예: 8801234567890" />
          {hint(value.barcode, bj?.barcode)}
        </label>
        <label className="pe-field">
          <span className="pe-label">발주마감</span>
          <input type="time" value={value.purchaseDeadline ?? ""} onChange={(event) => set("purchaseDeadline", event.target.value || null)} />
          <small>이 시각까지 들어온 주문을 그날 발주해요(도매몰에 "발주마감 09:30"으로 보여요).</small>
          {hint(value.purchaseDeadline, bj?.purchaseDeadline === undefined ? undefined : normalizeDeadline(bj.purchaseDeadline))}
        </label>
        <div className="pe-field pe-wide">
          <span className="pe-label">내용량</span>
          <div className="pe-row">
            <input aria-label="내용량 양" type="number" min="0" step="0.01" value={value.contentAmount ?? ""} onChange={(event) => set("contentAmount", numberOrNull(event.target.value))} placeholder="양" />
            <select aria-label="내용량 단위" value={value.contentUnit ?? ""} onChange={(event) => set("contentUnit", event.target.value || null)}>
              <option value="">단위</option>
              {CONTENT_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
            <span className="pe-times" aria-hidden="true">×</span>
            <input aria-label="내용량 개수" type="number" min="1" step="1" value={value.contentCount ?? ""} onChange={(event) => set("contentCount", numberOrNull(event.target.value))} placeholder="개수" />
            <select aria-label="내용량 기준" value={value.contentBasis ?? "total"} onChange={(event) => set("contentBasis", event.target.value as ContentBasis)}>
              {(Object.keys(CONTENT_BASIS_LABELS) as ContentBasis[]).map((basis) => <option key={basis} value={basis}>{CONTENT_BASIS_LABELS[basis]}</option>)}
            </select>
          </div>
          <small>{contentPreview ? `보이는 모양: ${contentPreview}` : "양은 전체 양으로 넣어요(예: 5kg × 10개, 개당으로 보이려면 기준을 '개당 양'으로)."}</small>
          {hint(contentPreview, remoteContent)}
        </div>
        <label className="pe-field">
          <span className="pe-label">발주상품명</span>
          <input value={value.purchaseName ?? ""} maxLength={100} onChange={(event) => set("purchaseName", event.target.value || null)} placeholder="매입처에 발주할 때 쓰는 이름" />
          {hint(value.purchaseName, bj?.purchaseName)}
        </label>
        <label className="pe-field">
          <span className="pe-label">발주단위</span>
          <input type="number" min="1" step="1" value={value.purchaseQuantity ?? ""} onChange={(event) => set("purchaseQuantity", numberOrNull(event.target.value))} placeholder="1(기본)" />
          <small>판매 1개당 매입처에 발주하는 수량</small>
          {hint(value.purchaseQuantity && value.purchaseQuantity > 1 ? value.purchaseQuantity : null, bj?.purchaseQuantity === undefined ? undefined : bj.purchaseQuantity && bj.purchaseQuantity > 1 ? bj.purchaseQuantity : null)}
        </label>
        <div className="pe-field">
          <span className="pe-label">배송 단위</span>
          <div className="pe-row">
            <input aria-label="배송 단위 수량" type="number" min="0" step="0.01" value={value.shippingUnitValue ?? ""} onChange={(event) => set("shippingUnitValue", numberOrNull(event.target.value))} placeholder="수량" />
            <select aria-label="배송 단위" value={value.shippingUnitType ?? ""} onChange={(event) => set("shippingUnitType", event.target.value || null)}>
              <option value="">단위</option>
              {SHIPPING_UNIT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          {hint(formatShippingUnit(value.shippingUnitType, value.shippingUnitValue), remoteShipping)}
        </div>
        <label className="pe-field">
          <span className="pe-label">출고지</span>
          <input value={value.shippingLocation ?? ""} maxLength={50} onChange={(event) => set("shippingLocation", event.target.value || null)} placeholder="예: 경북 영주" />
          {hint(value.shippingLocation, bj?.shippingLocation)}
        </label>
        <label className="pe-field pe-wide">
          <span className="pe-label">상품 간략설명 <em>{summaryLength}/100</em></span>
          <input value={value.summary ?? ""} maxLength={100} onChange={(event) => set("summary", event.target.value || null)} placeholder="도매몰 상품명 아래 한 줄로 보여요" />
          {hint(value.summary, bj?.description)}
        </label>
        <label className="pe-field">
          <span className="pe-label">제조연월일</span>
          <input value={value.manufacturingDate ?? ""} maxLength={30} onChange={(event) => set("manufacturingDate", event.target.value || null)} placeholder="예: 2026-11 또는 별도 표기" />
          {hint(value.manufacturingDate, bj?.manufacturingDate)}
        </label>
        <label className="pe-field">
          <span className="pe-label">소비기한</span>
          <input value={value.expirationDate ?? ""} maxLength={30} onChange={(event) => set("expirationDate", event.target.value || null)} placeholder="예: 제조일로부터 12개월" />
          {hint(value.expirationDate, bj?.expirationDate)}
        </label>
        <div className="pe-field pe-readonly">
          <span className="pe-label">인증 <small>발주오라에서 가져옴</small></span>
          {value.certificationKinds.length > 0
            ? <div className="pe-chips">{value.certificationKinds.map((kind) => <span key={kind}><BadgeCheck size={13} aria-hidden="true" /> {certificationLabel(kind)}</span>)}</div>
            : <span className="pe-empty">없음</span>}
          <small>인증번호와 함께 발주오라 상품 화면에서 고쳐 주세요. 동기화 때 DB센터로 가져와요.</small>
        </div>
        <div className="pe-field pe-readonly">
          <span className="pe-label">상품 분류 <small>발주오라에서 가져옴</small></span>
          <span className={value.taxonomyName || value.taxonomyItemId ? "pe-value" : "pe-empty"}>{value.taxonomyName || (value.taxonomyItemId ? "발주오라에서 정한 분류 있음" : "없음")}</span>
        </div>
      </fieldset>
    </section>
  );
}
