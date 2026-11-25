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

// 입점 신청서의 추가 업체 정보(선택 칸). 서버가 details 앞부분에 "[업체 정보]" + "라벨: 값" 줄로 함께 저장합니다(마이그레이션 없음).
export const PARTNER_PROFILE_LABELS = {
  representative: "대표자",
  businessNumber: "사업자등록번호",
  shipFrom: "출고지",
  monthlyVolume: "월 공급 가능 물량",
  salesChannels: "현재 판매 채널"
} as const;
export type PartnerProfileKey = keyof typeof PARTNER_PROFILE_LABELS;
export type PartnerProfile = Partial<Record<PartnerProfileKey, string>>;

const PARTNER_PROFILE_HEADER = "[업체 정보]";

/** details의 "[업체 정보]" 줄을 다시 읽습니다(빈 줄이나 다음 [제목]에서 끝). 없으면 빈 객체. */
export function parsePartnerProfile(details: string | null | undefined): PartnerProfile {
  const text = String(details ?? "");
  const start = text.indexOf(PARTNER_PROFILE_HEADER);
  if (start < 0) return {};
  const byLabel = new Map(Object.entries(PARTNER_PROFILE_LABELS).map(([key, label]) => [label as string, key as PartnerProfileKey]));
  const profile: PartnerProfile = {};
  for (const raw of text.slice(start + PARTNER_PROFILE_HEADER.length).split("\n").slice(1)) {
    const line = raw.trim();
    if (!line || line.startsWith("[")) break;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = byLabel.get(line.slice(0, colon).trim());
    const value = line.slice(colon + 1).trim();
    if (key && value && !profile[key]) profile[key] = value;
  }
  return profile;
}

// 입점 성공 → 공급사 연결(2026-11-25): 입점 신청을 공급사 관리의 공급사와 잇고, 계약 형태대로 정산 방식을 맞춥니다.
export type PartnerSupplierSettlement = { type: "commission" | "wholesale"; commissionRate: number; cycle: "weekly" | "monthly"; explicit: boolean };
export type PartnerSupplierLink = {
  supplierId: string;
  supplierName: string;
  /** true = "공급사로 등록"으로 이은 공급사, false = 이름이 같은 공급사가 있을 뿐(아직 잇지 않음) */
  linked: boolean;
  linkedAt: string | null;
  isActive: boolean;
  hasAccount: boolean;
  username: string | null;
  settlement: PartnerSupplierSettlement | null;
  /** 판매 수수료 세금계산서(공급받는자)에 필요한데 비어 있는 칸 */
  taxProblems: string[];
};

/** 계약(수수료 위탁·일반 도소매)과 공급사 정산 방식이 같은지. 계약 형태 "기타"는 비교하지 않습니다(true). */
export function settlementMatchesContract(deal: Pick<PartnerDeal, "contractType" | "commissionRate"> | null | undefined, settlement: PartnerSupplierSettlement | null | undefined) {
  if (!deal?.contractType || deal.contractType === "other") return true;
  if (!settlement?.explicit) return false;
  if (deal.contractType === "wholesale") return settlement.type === "wholesale";
  return settlement.type === "commission" && (deal.commissionRate == null || Math.abs(settlement.commissionRate - deal.commissionRate) < 0.05);
}
