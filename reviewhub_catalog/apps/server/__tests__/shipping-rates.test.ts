import { describe, expect, it } from "vitest";
import { legacyFeeFields, parseRateTiers, rateSummaryLabel, rateTierLines, validateRateTiers } from "../services/shipping-rates";

describe("배송비 유형(발주오라형)", () => {
  const amountTiers = { tiers: [{ upTo: 30000, fee: 3000 }], last: { fee: 0, repeat: false } };

  it("구간 범위는 1보다 크고 차례로 커져야 합니다", () => {
    expect(validateRateTiers(amountTiers)).toBeNull();
    expect(validateRateTiers({ tiers: [], last: { fee: 0, repeat: false } })).not.toBeNull();
    expect(validateRateTiers({ tiers: [{ upTo: 1, fee: 3000 }], last: { fee: 0, repeat: false } })).not.toBeNull();
    expect(validateRateTiers({ tiers: [{ upTo: 5, fee: 3000 }, { upTo: 5, fee: 6000 }], last: { fee: 9000, repeat: false } })).not.toBeNull();
  });

  it("구간을 읽기 쉬운 줄로 만듭니다(금액별·수량별·단위별)", () => {
    expect(rateTierLines("amount", amountTiers)).toEqual(["1원 이상 ~ 30,000원 미만 3,000원", "30,000원 이상 무료"]);
    expect(rateTierLines("quantity", { tiers: [{ upTo: 5, fee: 3500 }, { upTo: 10, fee: 7000 }], last: { fee: 3500, repeat: true } })).toEqual([
      "1개 이상 ~ 5개 미만 3,500원",
      "5개 이상 ~ 10개 미만 7,000원",
      "10개 이상 3,500원 (조건 반복)"
    ]);
    expect(rateTierLines("unit", { tiers: [{ upTo: 10, fee: 4000 }], last: { fee: 8000, repeat: false } }, "kg")).toEqual(["1kg 이상 ~ 10kg 미만 4,000원", "10kg 이상 8,000원"]);
  });

  it("예전 칸(무료/유료·조건부·부과 방식)도 함께 맞춥니다", () => {
    expect(legacyFeeFields("free", 0, null)).toMatchObject({ feeType: "free", fee: 0 });
    expect(legacyFeeFields("fixed", 3500, null)).toMatchObject({ feeType: "paid", fee: 3500, feeBasis: "order" });
    expect(legacyFeeFields("amount", 0, amountTiers)).toMatchObject({ feeType: "conditional", fee: 3000, freeShippingThreshold: 30000 });
    expect(legacyFeeFields("quantity", 0, { tiers: [{ upTo: 5, fee: 3500 }], last: { fee: 7000, repeat: false } })).toMatchObject({ feeType: "paid", fee: 3500, feeBasis: "quantity" });
    expect(legacyFeeFields("unit", 0, { tiers: [{ upTo: 10, fee: 4000 }], last: { fee: 8000, repeat: false } }, "kg")).toMatchObject({ feeBasis: "weight" });
  });

  it("목록용 한 줄 문구와 저장된 JSON 읽기", () => {
    expect(rateSummaryLabel("fixed", 3500, null)).toBe("고정 3,500원");
    expect(rateSummaryLabel("free", 0, null)).toBe("배송비 무료");
    expect(rateSummaryLabel("amount", 0, amountTiers)).toBe("금액별 3,000원~ · 30,000원 이상 무료");
    expect(parseRateTiers(JSON.stringify(amountTiers))).toEqual(amountTiers);
    expect(parseRateTiers("not json")).toBeNull();
    expect(parseRateTiers(null)).toBeNull();
  });
});
