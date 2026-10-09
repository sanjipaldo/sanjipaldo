// 배송비 유형(발주오라 배송비 정책 등록과 같은 5가지) 화면 표시용 도우미. 서버 services/shipping-rates.ts와 같은 규칙입니다.
import type { PublicShippingPolicy, ShippingRateTiers, ShippingRateType } from "@/pages/catalog/types";

export const RATE_TYPE_OPTIONS: Array<{ value: ShippingRateType; label: string }> = [
  { value: "fixed", label: "고정배송비" },
  { value: "free", label: "배송비무료" },
  { value: "amount", label: "금액별배송비" },
  { value: "quantity", label: "수량별배송비" },
  { value: "unit", label: "단위별배송비" }
];
export const RATE_TYPE_LABELS = Object.fromEntries(RATE_TYPE_OPTIONS.map((option) => [option.value, option.label])) as Record<ShippingRateType, string>;
export const SHIPPING_UNIT_LABELS = ["개", "박스", "kg", "g", "팩", "봉", "세트"] as const;

type RatePolicy = Pick<PublicShippingPolicy, "feeType" | "feeBasis" | "fee" | "freeShippingThreshold" | "rateType" | "rateTiers" | "unitLabel">;

// 예전 방식(무료/유료·부과 방식)으로 만든 정책도 5가지 유형 중 하나로 보여 줍니다(저장된 값은 그대로).
export function effectiveRate(policy: RatePolicy): { rateType: ShippingRateType; tiers: ShippingRateTiers | null; unitLabel: string | null; fee: number } {
  if (policy.rateType) return { rateType: policy.rateType, tiers: policy.rateTiers ?? null, unitLabel: policy.unitLabel ?? null, fee: policy.fee };
  if (policy.feeType === "free") return { rateType: "free", tiers: null, unitLabel: null, fee: 0 };
  if (policy.feeType === "conditional" && policy.freeShippingThreshold) {
    return { rateType: "amount", tiers: { tiers: [{ upTo: policy.freeShippingThreshold, fee: policy.fee }], last: { fee: 0, repeat: false } }, unitLabel: null, fee: policy.fee };
  }
  if (policy.feeBasis === "quantity") return { rateType: "quantity", tiers: { tiers: [], last: { fee: policy.fee, repeat: true } }, unitLabel: null, fee: policy.fee };
  if (policy.feeBasis === "weight") return { rateType: "unit", tiers: { tiers: [], last: { fee: policy.fee, repeat: true } }, unitLabel: "kg", fee: policy.fee };
  return { rateType: "fixed", tiers: null, unitLabel: null, fee: policy.fee };
}

export function rangeUnit(rateType: ShippingRateType, unitLabel?: string | null) {
  if (rateType === "amount") return "원";
  if (rateType === "quantity") return "개";
  return unitLabel || "개";
}

const won = (value: number) => `${value.toLocaleString("ko-KR")}원`;
const feeText = (fee: number) => (fee === 0 ? "무료" : won(fee));

// ["1원 이상 ~ 30,000원 미만 3,000원", "30,000원 이상 무료"]
export function rateTierLines(rateType: ShippingRateType, value: ShippingRateTiers, unitLabel?: string | null) {
  const unit = rangeUnit(rateType, unitLabel);
  const amount = (n: number) => `${n.toLocaleString("ko-KR")}${unit}`;
  let from = 1;
  const lines = value.tiers.map((tier) => {
    const line = `${amount(from)} 이상 ~ ${amount(tier.upTo)} 미만 ${feeText(tier.fee)}`;
    from = tier.upTo;
    return line;
  });
  // 조건 반복: 마지막 줄에는 배송비가 없고 위 구간을 반복해 적용합니다(발주오라와 같음).
  lines.push(value.last.repeat ? `${amount(from)} 이상 위 구간 반복 적용` : `${amount(from)} 이상 ${feeText(value.last.fee)}`);
  return lines;
}

// 대표 배송비(목록·단가표 버튼): 고정은 그 금액, 구간형은 첫 구간 배송비, 무료는 0
export function representativeFee(policy: RatePolicy) {
  const rate = effectiveRate(policy);
  if (rate.rateType === "free") return 0;
  if (rate.rateType === "fixed") return rate.fee;
  return rate.tiers?.tiers[0]?.fee ?? rate.tiers?.last.fee ?? rate.fee;
}
