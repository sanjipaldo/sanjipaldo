import { describe, expect, it } from "vitest";
import { baljuoraPriceCells, type BaljuoraProductPrices } from "../baljuora-editor-prices";

const base: BaljuoraProductPrices = {
  linked: true,
  baljuoraId: "bj-y",
  code: "ass00050",
  groupKeyword: "황금농부",
  syncedAt: "2026-11-23T03:31:00.000Z",
  lastPushedAt: "2026-11-23T03:31:00.000Z",
  syncStatus: "succeeded",
  supplyPrice: 6900,
  groupPrice: 6270,
  groupPriceKnown: true,
  purchaseCost: 5700,
  consumerPrice: null
};

describe("상품 수정 창의 발주오라 가격", () => {
  it("약과: 원가·공급가는 같고 수강생 단가(6,300)만 황금농부 개별공급가(6,270)와 다릅니다", () => {
    const cells = baljuoraPriceCells({ costPrice: 5700, aPrice: 6300, generalPrice: 6900 }, base);
    expect(cells.costPrice).toMatchObject({ caption: "매입원가", value: 5700, status: "same" });
    expect(cells.aPrice).toMatchObject({ caption: "황금농부 수강생", value: 6270, status: "diff" });
    expect(cells.generalPrice).toMatchObject({ caption: "공급가", value: 6900, status: "same" });
  });

  it("황금농부 개별공급가가 없으면 공급가로 사는 것으로 보고, DB센터에 따로 정한 수강생 단가가 있을 때만 다름입니다", () => {
    const prices = { ...base, groupPrice: null };
    expect(baljuoraPriceCells({ costPrice: 5700, aPrice: 0, generalPrice: 6900 }, prices).aPrice).toMatchObject({ value: null, note: "개별공급가 없음 · 공급가 6,900원 적용", status: "same" });
    expect(baljuoraPriceCells({ costPrice: 5700, aPrice: 6900, generalPrice: 6900 }, prices).aPrice.status).toBe("same");
    expect(baljuoraPriceCells({ costPrice: 5700, aPrice: 6300, generalPrice: 6900 }, prices).aPrice.status).toBe("diff");
  });

  it("황금농부 가격을 아직 못 읽었으면 '못 읽음'(다음 비교 때 읽음), DB센터 원가가 비어 있으면 원가는 비교하지 않습니다", () => {
    const cells = baljuoraPriceCells({ costPrice: 0, aPrice: 6300, generalPrice: 6900 }, { ...base, groupPrice: null, groupPriceKnown: false });
    expect(cells.aPrice).toMatchObject({ value: null, note: "다음 ‘발주오라와 비교’ 때 읽어 와요", status: "unknown" });
    expect(cells.costPrice).toMatchObject({ value: 5700, status: "none" });
  });

  it("입력 중인 값과 바로 비교합니다(수강생 단가를 6,270으로 고치면 같음)", () => {
    expect(baljuoraPriceCells({ costPrice: 5700, aPrice: 6270, generalPrice: 6900 }, base).aPrice.status).toBe("same");
    expect(baljuoraPriceCells({ costPrice: 5800, aPrice: 6270, generalPrice: 7000 }, base)).toMatchObject({ costPrice: { status: "diff" }, generalPrice: { status: "diff" } });
  });
});
