import { describe, expect, it } from "vitest";
import { PARTNER_STAGE_LABELS, partnerContractSummary, partnerStageToStatus } from "@repo/shared/partner-deal";

describe("partner deal helpers", () => {
  it("summarizes contract terms only for contracted deals", () => {
    expect(partnerContractSummary({ stage: "contracted", contractType: "commission", commissionRate: 10 })).toBe("수수료 10%");
    expect(partnerContractSummary({ stage: "contracted", contractType: "commission", commissionRate: 7.5 })).toBe("수수료 7.5%");
    expect(partnerContractSummary({ stage: "contracted", contractType: "wholesale", commissionRate: null })).toBe("일반 도소매(매입)");
    expect(partnerContractSummary({ stage: "negotiating", contractType: "commission", commissionRate: 10 })).toBe("");
    expect(partnerContractSummary(null)).toBe("");
  });

  it("maps pipeline stages to the legacy request status", () => {
    expect(partnerStageToStatus("received")).toBe("received");
    expect(partnerStageToStatus("contacted")).toBe("reviewing");
    expect(partnerStageToStatus("negotiating")).toBe("reviewing");
    expect(partnerStageToStatus("contracted")).toBe("completed");
    expect(partnerStageToStatus("declined")).toBe("completed");
    expect(PARTNER_STAGE_LABELS.declined).toBe("계약 불발");
  });
});
