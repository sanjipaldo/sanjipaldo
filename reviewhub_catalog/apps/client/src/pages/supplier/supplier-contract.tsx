// 공급사 센터 대시보드 맨 위 '두고푸드 계약 조건'(2026-11-26 관리자 요청 "홈 첫 화면에 두고푸드와 어떻게 계약돼 있는지 —
// 수수료 10%인지 20%인지, 주 정산·월 정산·매일 정산인지, 판매수수료가 아니라 도매 판매인지 조금 보여 줬으면").
// - 값은 두고푸드 관리자가 공급사 관리에서 정한 정산 방식(`/api/supplier/dashboard`의 settlement)을 그대로 씁니다. 공급사는 바꿀 수 없고,
//   계약과 다르면 두고푸드 담당자에게 알리도록 안내합니다. 자세한 내용은 내 정보(/supplier/account).
// - 칸 3개: 정산 방식(판매수수료 · 일반 도매(매입)) · 판매 수수료(n% · 없음) · 지급 주기(주 · 월 · 매일 정산).
import { Link } from "react-router-dom";
import { ArrowRight, Handshake } from "lucide-react";
import {
  SUPPLIER_CYCLE_HINTS,
  SUPPLIER_CYCLE_LABELS,
  SUPPLIER_SETTLEMENT_TYPE_LABELS,
  type SupplierSettlementSettings
} from "@repo/shared/supplier-portal";

export type ContractTerm = { key: "type" | "fee" | "cycle"; label: string; value: string; hint: string };

/** 계약 조건 칸(정산 방식 · 판매 수수료 · 지급 주기) */
export function contractTerms(settings: SupplierSettlementSettings): ContractTerm[] {
  const commission = settings.type === "commission";
  return [
    {
      key: "type",
      label: "정산 방식",
      value: SUPPLIER_SETTLEMENT_TYPE_LABELS[settings.type] ?? settings.type,
      hint: commission ? "판매 금액 100% 입금" : "공급가 × 판매 수량 입금"
    },
    {
      key: "fee",
      label: "판매 수수료",
      value: commission ? `${settings.commissionRate}%` : "없음",
      hint: commission ? "다음 달 1~3일 청구" : "도매 판매라 수수료 없음"
    },
    {
      key: "cycle",
      label: "지급 주기",
      value: SUPPLIER_CYCLE_LABELS[settings.cycle] ?? settings.cycle,
      hint: SUPPLIER_CYCLE_HINTS[settings.cycle] ?? ""
    }
  ];
}

export function SupplierContractCard({ settings }: { settings: SupplierSettlementSettings }) {
  return (
    <section className="admin-card sup-contract-card" aria-labelledby="sup-contract-title">
      <div className="sup-contract-inner">
        <div className="sup-contract-head">
          <span className="sup-contract-icon" aria-hidden="true"><Handshake size={18} /></span>
          <h2 id="sup-contract-title">두고푸드 계약 조건</h2>
          <Link to="/supplier/account" className="sup-contract-more" aria-label="계약 조건 자세히 보기(내 정보)">자세히 <ArrowRight size={13} aria-hidden="true" /></Link>
        </div>
        <dl className="sup-contract-grid">
          {contractTerms(settings).map((term) => (
            <div key={term.key} className={`sup-contract-term is-${term.key}`}>
              <dt>{term.label}</dt>
              <dd><strong>{term.value}</strong>{term.hint && <span>{term.hint}</span>}</dd>
            </div>
          ))}
        </dl>
        <p className="sup-contract-note">배송비는 100% 함께 입금해요 · 계약 내용과 다르면 두고푸드 담당자에게 알려 주세요.</p>
      </div>
    </section>
  );
}
