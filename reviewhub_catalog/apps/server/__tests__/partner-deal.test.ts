import { describe, expect, it } from "vitest";
import { PARTNER_STAGE_LABELS, parsePartnerProfile, partnerContractSummary, partnerStageToStatus, settlementMatchesContract } from "@repo/shared/partner-deal";

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
    // 관리자 공급사 DB 이름(저장 값 contracted·declined는 그대로)
    expect(PARTNER_STAGE_LABELS.contracted).toBe("입점 성공");
    expect(PARTNER_STAGE_LABELS.declined).toBe("거래 실패");
  });

  it("reads the [업체 정보] block saved with an application", () => {
    const details = "[확인 필요] 자동 입력 방지 칸이 채워진 채 접수되었습니다.\n\n[업체 정보]\n대표자: 김대표\n사업자등록번호: 123-45-67890\n출고지: 충북 괴산\n현재 판매 채널: 네이버: 스마트스토어\n\n[업체·상품 소개]\n대표자: 소개 글 속 글자";
    expect(parsePartnerProfile(details)).toEqual({ representative: "김대표", businessNumber: "123-45-67890", shipFrom: "충북 괴산", salesChannels: "네이버: 스마트스토어" });
    expect(parsePartnerProfile("소개만 있는 신청")).toEqual({});
    expect(parsePartnerProfile(null)).toEqual({});
  });

  it("compares the contract with the supplier settlement", () => {
    const commission = { type: "commission" as const, commissionRate: 10, cycle: "weekly" as const, explicit: true };
    expect(settlementMatchesContract({ contractType: "commission", commissionRate: 10 }, commission)).toBe(true);
    expect(settlementMatchesContract({ contractType: "commission", commissionRate: 12 }, commission)).toBe(false);
    expect(settlementMatchesContract({ contractType: "wholesale", commissionRate: null }, commission)).toBe(false);
    expect(settlementMatchesContract({ contractType: "wholesale", commissionRate: null }, { ...commission, type: "wholesale" })).toBe(true);
    // 기본값(직접 저장하지 않은 정산 방식)은 계약대로 맞춘 것이 아님
    expect(settlementMatchesContract({ contractType: "commission", commissionRate: 10 }, { ...commission, explicit: false })).toBe(false);
    expect(settlementMatchesContract({ contractType: "other", commissionRate: null }, null)).toBe(true);
  });
});
