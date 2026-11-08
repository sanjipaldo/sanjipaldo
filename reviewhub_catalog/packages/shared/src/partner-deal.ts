// 입점 신청(공급사) 진행 단계·계약 조건: 관리자 > 입점·소싱 요청 > 입점 신청에서 단계별로 관리합니다(partner_deals 표).
// 접수 → 연락 완료 → 상담·협의 중 → 입점 성공(계약, 저장 값 "contracted") 또는 거래 실패(저장 값 "declined").
// 입점 성공·거래 실패로 끝난 신청이 공급사 DB(관리자 화면 요약 카드·탭·엑셀)로 쌓입니다.
export const PARTNER_STAGES = ["received", "contacted", "negotiating", "contracted", "declined"] as const;
export type PartnerStage = (typeof PARTNER_STAGES)[number];

export const PARTNER_STAGE_LABELS: Record<PartnerStage, string> = {
  received: "접수",
  contacted: "연락 완료",
  negotiating: "상담·협의 중",
  contracted: "입점 성공",
  declined: "거래 실패"
};

export const PARTNER_CONTRACT_TYPES = ["commission", "wholesale", "other"] as const;
export type PartnerContractType = (typeof PARTNER_CONTRACT_TYPES)[number];

export const PARTNER_CONTRACT_LABELS: Record<PartnerContractType, string> = {
  commission: "수수료 위탁",
  wholesale: "일반 도소매(매입)",
  other: "기타"
};

export type PartnerDealHistory = {
  at: string;
  stage: PartnerStage;
  contractType?: PartnerContractType | null;
  commissionRate?: number | null;
  memo?: string | null;
};

export type PartnerDeal = {
  requestId: string;
  stage: PartnerStage;
  contractType: PartnerContractType | null;
  commissionRate: number | null;
  contractMemo: string | null;
  contactedAt: string | null;
  closedAt: string | null;
  history: PartnerDealHistory[];
  createdAt: string;
  updatedAt: string;
};

// 계약 조건 한 줄: "수수료 10%" / "일반 도소매(매입)" / "기타"
export function partnerContractSummary(deal?: Pick<PartnerDeal, "stage" | "contractType" | "commissionRate"> | null) {
  if (!deal || deal.stage !== "contracted" || !deal.contractType) return "";
  if (deal.contractType === "commission") return deal.commissionRate != null ? `수수료 ${Number(deal.commissionRate.toFixed(2))}%` : "수수료 위탁";
  return PARTNER_CONTRACT_LABELS[deal.contractType];
}

// 진행 단계에 맞춘 기존 처리 상태(접수/검토중/완료)
export function partnerStageToStatus(stage: PartnerStage): "received" | "reviewing" | "completed" {
  return stage === "received" ? "received" : stage === "contacted" || stage === "negotiating" ? "reviewing" : "completed";
}
