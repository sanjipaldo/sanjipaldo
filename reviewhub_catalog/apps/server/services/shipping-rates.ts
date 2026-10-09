// 배송비 유형(발주오라 배송비 정책 등록과 같은 5가지)과 구간 계산·표시 문구를 한곳에서 다룹니다.
// - fixed 고정배송비: 주문 금액에 관계없이 같은 배송비
// - free 배송비무료: 배송비 0원 (freeWholeOrder면 이 정책 상품이 포함된 주문 전체를 무료 처리)
// - amount 금액별 · quantity 수량별 · unit 단위별: "1 이상 ~ N 미만 → 배송비" 구간 + 마지막 "N 이상 → 배송비"(조건 반복 가능)

export const SHIPPING_RATE_TYPES = ["fixed", "free", "amount", "quantity", "unit"] as const;
export type ShippingRateType = (typeof SHIPPING_RATE_TYPES)[number];
export const SHIPPING_UNIT_LABELS = ["개", "박스", "kg", "g", "팩", "봉", "세트"] as const;
export type ShippingRateTier = { upTo: number; fee: number };
export type ShippingRateTiers = { tiers: ShippingRateTier[]; last: { fee: number; repeat: boolean } };

export const RATE_TYPE_LABELS: Record<ShippingRateType, string> = {
  fixed: "고정배송비",
  free: "배송비무료",
  amount: "금액별배송비",
  quantity: "수량별배송비",
  unit: "단위별배송비"
};

const won = (value: number) => `${value.toLocaleString("ko-KR")}원`;
const feeText = (fee: number) => (fee === 0 ? "무료" : won(fee));

// 구간형(금액별·수량별·단위별) 입력 검사: 구간 끝값은 1보다 크고 차례로 커져야 합니다.
export function validateRateTiers(value: ShippingRateTiers): string | null {
  if (value.tiers.length === 0) return "배송비 구간을 1개 이상 입력해 주세요.";
  let previous = 1;
  for (const tier of value.tiers) {
    if (!Number.isInteger(tier.upTo) || tier.upTo <= previous) return "구간 범위는 앞 구간보다 큰 값으로 차례대로 입력해 주세요.";
    if (!Number.isInteger(tier.fee) || tier.fee < 0) return "배송비는 0원 이상으로 입력해 주세요.";
    previous = tier.upTo;
  }
  if (!Number.isInteger(value.last.fee) || value.last.fee < 0) return "배송비는 0원 이상으로 입력해 주세요.";
  return null;
}

export function parseRateTiers(raw: string | null | undefined): ShippingRateTiers | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ShippingRateTiers;
    if (!Array.isArray(parsed?.tiers) || typeof parsed?.last?.fee !== "number") return null;
    return { tiers: parsed.tiers.map((tier) => ({ upTo: Number(tier.upTo), fee: Number(tier.fee) })), last: { fee: Number(parsed.last.fee), repeat: Boolean(parsed.last.repeat) } };
  } catch {
    return null;
  }
}

function rangeUnit(rateType: ShippingRateType, unitLabel: string | null | undefined) {
  if (rateType === "amount") return "원";
  if (rateType === "quantity") return "개";
  return unitLabel || "개";
}

// 구간을 사람이 읽는 줄로: ["1원 이상 ~ 30,000원 미만 3,000원", "30,000원 이상 무료"]
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

// 목록·상품 선택용 한 줄 문구(feeLabel 자동 작성)
export function rateSummaryLabel(rateType: ShippingRateType, fee: number, value: ShippingRateTiers | null, unitLabel?: string | null) {
  if (rateType === "free") return "배송비 무료";
  if (rateType === "fixed") return `고정 ${won(fee)}`;
  if (!value) return RATE_TYPE_LABELS[rateType];
  const first = value.tiers[0]?.fee ?? value.last.fee;
  const tail = value.last.repeat ? " · 구간 반복" : value.last.fee === 0 ? ` · ${value.tiers.at(-1)?.upTo.toLocaleString("ko-KR")}${rangeUnit(rateType, unitLabel)} 이상 무료` : "";
  return `${RATE_TYPE_LABELS[rateType].replace("배송비", "")} ${feeText(first)}~${tail}`;
}

// 새 유형 값을 예전 칸(feeType·fee·feeBasis·무료 기준금액)에도 맞춰 둡니다. 예전 화면·데이터와 호환하기 위함입니다.
export function legacyFeeFields(rateType: ShippingRateType, fee: number, value: ShippingRateTiers | null, unitLabel?: string | null) {
  if (rateType === "free") return { feeType: "free" as const, fee: 0, feeBasis: "order" as const, freeShippingThreshold: null };
  if (rateType === "fixed") return { feeType: (fee === 0 ? "free" : "paid") as "free" | "paid", fee, feeBasis: "order" as const, freeShippingThreshold: null };
  const first = value?.tiers[0]?.fee ?? value?.last.fee ?? 0;
  const lastTier = value?.tiers.at(-1);
  if (rateType === "amount" && value && !value.last.repeat && value.last.fee === 0 && lastTier && value.tiers.every((tier) => tier.fee === first) && first > 0) {
    return { feeType: "conditional" as const, fee: first, feeBasis: "order" as const, freeShippingThreshold: lastTier.upTo };
  }
  const feeBasis = rateType === "quantity" ? "quantity" as const : rateType === "unit" && (unitLabel === "kg" || unitLabel === "g") ? "weight" as const : rateType === "unit" ? "quantity" as const : "order" as const;
  const lastFee = value?.last.repeat ? first : value?.last.fee ?? 0;
  return { feeType: (first === 0 && lastFee === 0 ? "free" : "paid") as "free" | "paid", fee: first, feeBasis, freeShippingThreshold: null };
}
