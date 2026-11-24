// 공급사 정산 방식 고르기(2026-11-25 관리자 요청 "처음에 정산 시스템 2가지 중 하나를 고르게, 최대한 10% 수수료로 통일").
// 공급사 관리 > 수정/신규 등록 창과 공급사 센터 계정 창이 같이 씁니다. 저장은 PUT /catalog/admin/suppliers/:id/settlement.
import { BadgePercent, Boxes, ShieldAlert } from "lucide-react";
import {
  DEFAULT_SETTLEMENT_SETTINGS,
  SUPPLIER_RETURN_POLICY,
  settlementPlanText,
  type SupplierSettlementCycle,
  type SupplierSettlementSettings,
  type SupplierSettlementType
} from "@repo/shared/supplier-portal";
import { apiFetch } from "@/lib/api";
import "./supplier-settlement.css";

export type SettlementDraft = { type: SupplierSettlementType; commissionRate: string; cycle: SupplierSettlementCycle };
export type SupplierSettlementView = SupplierSettlementSettings & { explicit?: boolean; updatedAt?: string | null; updatedBy?: string | null };

export function settlementDraft(value?: Partial<SupplierSettlementSettings> | null): SettlementDraft {
  return {
    type: value?.type ?? DEFAULT_SETTLEMENT_SETTINGS.type,
    commissionRate: String(value?.commissionRate ?? DEFAULT_SETTLEMENT_SETTINGS.commissionRate),
    cycle: value?.cycle ?? DEFAULT_SETTLEMENT_SETTINGS.cycle
  };
}

/** 입력값 → 저장 값(수수료율이 이상하면 Error) */
export function parseSettlementDraft(draft: SettlementDraft): SupplierSettlementSettings {
  const text = draft.commissionRate.trim();
  const rate = Number(text);
  const valid = text !== "" && Number.isFinite(rate) && rate >= 0 && rate <= 100;
  if (draft.type === "commission" && !valid) throw new Error("판매 수수료는 0~100% 사이로 입력해 주세요.");
  return { type: draft.type, cycle: draft.cycle, commissionRate: valid ? Math.round(rate * 10) / 10 : DEFAULT_SETTLEMENT_SETTINGS.commissionRate };
}

/** 저장(공급사 센터 계정이 있으면 계정 수수료율·주기도 서버가 같게 맞춤) */
export async function saveSupplierSettlement(supplierId: string, draft: SettlementDraft) {
  const body = parseSettlementDraft(draft);
  const response = await apiFetch(`/catalog/admin/suppliers/${encodeURIComponent(supplierId)}/settlement`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    silent: true
  });
  const payload = (await response.json().catch(() => ({ ok: false }))) as { ok?: boolean; data?: { settlement: SupplierSettlementView }; error?: { message?: string } };
  if (!response.ok || !payload.ok || !payload.data) throw new Error(payload.error?.message ?? "정산 방식을 저장하지 못했습니다.");
  return payload.data.settlement;
}

/** 목록 칸 표시: "수수료 10%" / "도매(매입)" + 주기 */
export function SettlementBadge({ value }: { value: SupplierSettlementView | undefined }) {
  const settings = value ?? { ...DEFAULT_SETTLEMENT_SETTINGS, explicit: false };
  return (
    <span className="ssf-badge-cell">
      <span className={`ssf-badge is-${settings.type}`}>{settings.type === "commission" ? `수수료 ${settings.commissionRate}%` : "도매(매입)"}</span>
      <small>{settings.cycle === "weekly" ? "주 정산 · 월요일" : "월 정산 · 1~3일"}{settings.explicit ? "" : " · 기본값"}</small>
    </span>
  );
}

export function SupplierSettlementFields({ value, onChange, idPrefix }: { value: SettlementDraft; onChange: (next: SettlementDraft) => void; idPrefix: string }) {
  let preview = "";
  try {
    preview = settlementPlanText(parseSettlementDraft(value));
  } catch {
    preview = "";
  }
  return (
    <div className="ssf">
      <div className="ssf-types" role="radiogroup" aria-label="정산 방식">
        <label className={`ssf-type ${value.type === "commission" ? "is-active" : ""}`}>
          <input type="radio" name={`${idPrefix}-type`} value="commission" checked={value.type === "commission"} onChange={() => onChange({ ...value, type: "commission" })} />
          <BadgePercent size={20} aria-hidden="true" />
          <span>
            <strong>판매수수료 <em>권장</em></strong>
            <small>원가 = 수강생 단가 = 일반공급가로 같게 등록해요. 판매 대금 100%를 먼저 보내고, 수수료는 다음 달 1~3일에 받아요(두고푸드가 마케팅·세일즈 수수료 세금계산서 발행).</small>
          </span>
        </label>
        <label className={`ssf-type ${value.type === "wholesale" ? "is-active" : ""}`}>
          <input type="radio" name={`${idPrefix}-type`} value="wholesale" checked={value.type === "wholesale"} onChange={() => onChange({ ...value, type: "wholesale" })} />
          <Boxes size={20} aria-hidden="true" />
          <span>
            <strong>일반 도매(매입)</strong>
            <small>공급사 원가로 사서 두고푸드가 10~20% 마진을 붙여 수강생 단가·일반공급가로 팔아요. 원가 × 판매 수량을 보내고 수수료는 없어요.</small>
          </span>
        </label>
      </div>
      <div className="ssf-grid">
        {value.type === "commission" && (
          <label>
            판매 수수료(%)
            <input inputMode="decimal" value={value.commissionRate} onChange={(event) => onChange({ ...value, commissionRate: event.target.value.replace(/[^\d.]/g, "").slice(0, 5) })} aria-label="판매 수수료(%)" />
            <small>물품 대금 기준 · 기본 {DEFAULT_SETTLEMENT_SETTINGS.commissionRate}%</small>
          </label>
        )}
        <label>
          지급 주기
          <select value={value.cycle} onChange={(event) => onChange({ ...value, cycle: event.target.value === "monthly" ? "monthly" : "weekly" })} aria-label="지급 주기">
            <option value="weekly">주 정산 (월~일 판매분 → 다음 주 월요일)</option>
            <option value="monthly">월 정산 (1일~말일 → 다음 달 1~3일)</option>
          </select>
          <small>배송비(공급사 매입 배송비)는 100% 함께 보내요.</small>
        </label>
      </div>
      {preview && <p className="ssf-preview">{preview}</p>}
      <p className="ssf-policy"><ShieldAlert size={14} aria-hidden="true" /> <span>{SUPPLIER_RETURN_POLICY}</span></p>
    </div>
  );
}
