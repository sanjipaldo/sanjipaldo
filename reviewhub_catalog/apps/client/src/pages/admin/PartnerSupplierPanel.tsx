// 입점 성공 → 공급사 등록·정산 방식·공급사 센터 계정(2026-11-25 관리자 요청: 입점 신청 → 상담으로 정산 방식 결정 → ID를 만들고 계약대로 세팅).
// 입점 신청 상세의 진행 단계 아래에 보입니다. 저장한 진행 단계가 "입점 성공"이고 계약 형태가 있을 때만 보입니다.
// ① 공급사로 등록(이름이 같은 공급사가 있으면 연결) ② 계약대로 정산 방식 저장 ③ 공급사 관리에서 공급사 센터 계정(ID) 만들기
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, KeyRound, Link2, Store } from "lucide-react";
import { toast } from "sonner";
import { parsePartnerProfile, partnerContractSummary, settlementMatchesContract, type PartnerSupplierSettlement } from "@repo/shared/partner-deal";
import { SUPPLIER_CYCLE_LABELS, settlementSettingsLabel, type SupplierSettlementCycle } from "@repo/shared/supplier-portal";
import { apiFetch } from "@/lib/api";
import type { SourcingRequest } from "../catalog/types";
import "./partner-supplier.css";

type RegisterResult = { created: boolean; reactivated: boolean; filled: string[]; settlementApplied: boolean; supplierId: string; supplierName: string; request: SourcingRequest };

async function readData<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({ ok: false }))) as { ok: boolean; data: T; error?: { message?: string } };
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "요청을 처리하지 못했습니다.");
  return payload.data;
}

function settlementText(settlement: PartnerSupplierSettlement | null) {
  if (!settlement) return "정산 방식 없음";
  return `${settlementSettingsLabel(settlement)}${settlement.explicit ? "" : " (기본값)"}`;
}

export function PartnerSupplierPanel({ request, onSaved }: { request: SourcingRequest; onSaved: (request: SourcingRequest) => Promise<void> }) {
  const deal = request.deal ?? null;
  const link = request.supplierLink ?? null;
  const profile = useMemo(() => parsePartnerProfile(request.details), [request.details]);
  const [name, setName] = useState(link?.supplierName ?? request.companyName ?? "");
  const [cycle, setCycle] = useState<SupplierSettlementCycle>(link?.settlement?.explicit ? link.settlement.cycle : "weekly");
  const [busy, setBusy] = useState(false);
  if (!deal || deal.stage !== "contracted" || !deal.contractType) return null;

  const linked = Boolean(link?.linked);
  const contract = partnerContractSummary(deal);
  // 계약 형태 "기타"는 정산 방식을 자동으로 맞추지 않습니다(공급사 관리에서 고름).
  const autoSettlement = deal.contractType !== "other";
  const matches = linked && settlementMatchesContract(deal, link?.settlement);
  const sameName = !linked && link && link.supplierName === name.trim();
  const register = async () => {
    if (!linked && !name.trim()) {
      toast.error("매입처명(공급사 이름)을 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const result = await readData<RegisterResult>(await apiFetch(`/catalog/admin/partner/${request.id}/register-supplier`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || null, cycle })
      }));
      const parts = [
        result.created ? `'${result.supplierName}' 공급사를 등록했어요` : linked ? `'${result.supplierName}' 정산 방식을 계약대로 맞췄어요` : `'${result.supplierName}' 공급사와 연결했어요`,
        result.filled.length > 0 ? `신청서에서 ${result.filled.join("·")}을(를) 채웠어요` : "",
        result.reactivated ? "사용 중으로 바꿨어요" : ""
      ].filter(Boolean);
      toast.success(`${parts.join(" · ")}. ${result.request.supplierLink?.hasAccount ? "" : "이제 공급사 센터 계정(ID)을 만들어 주세요."}`.trim());
      await onSaved(result.request);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "공급사로 등록하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const step = (done: boolean, current: boolean) => (done ? "is-done" : current ? "is-current" : "");
  return (
    <section className="partner-supplier-panel" aria-label="공급사 등록·정산 방식·계정">
      <div className="partner-deal-head">
        <strong>공급사 등록 · 정산 방식 · 계정</strong>
        <small>입점 성공한 업체를 공급사로 등록하면 계약({contract})대로 정산 방식이 맞춰지고, 공급사 센터 계정(ID)을 만들어 줄 수 있어요.</small>
      </div>
      <ol className="partner-supplier-steps">
        <li className={step(linked, !linked)}><b>{linked ? <CheckCircle2 size={14} aria-hidden="true" /> : "1"}</b>공급사 등록{linked && link ? <small>{link.supplierName}</small> : null}</li>
        <li className={step(linked && (matches || !autoSettlement), linked && !matches && autoSettlement)}><b>{linked && (matches || !autoSettlement) ? <CheckCircle2 size={14} aria-hidden="true" /> : "2"}</b>정산 방식<small>{autoSettlement ? (linked && link ? settlementText(link.settlement) : contract) : "기타 계약 · 공급사 관리에서 고르기"}</small></li>
        <li className={step(Boolean(link?.hasAccount), linked && !link?.hasAccount)}><b>{link?.hasAccount ? <CheckCircle2 size={14} aria-hidden="true" /> : "3"}</b>공급사 센터 계정{link?.hasAccount ? <small>아이디 {link.username}</small> : null}</li>
      </ol>

      {!linked ? (
        <div className="partner-supplier-form">
          <label className="partner-memo-field">매입처명(공급사 이름)
            <input value={name} maxLength={160} onChange={(event) => setName(event.target.value)} placeholder="발주오라·상품의 매입처명과 같게" />
          </label>
          {autoSettlement && (
            <label className="partner-memo-field">정산(지급) 주기
              <select value={cycle} onChange={(event) => setCycle(event.target.value === "monthly" ? "monthly" : "weekly")}>
                <option value="weekly">{SUPPLIER_CYCLE_LABELS.weekly} · 월~일 판매분을 다음 주 월요일에 지급</option>
                <option value="monthly">{SUPPLIER_CYCLE_LABELS.monthly} · 한 달 판매분을 다음 달 1~3일에 지급</option>
              </select>
            </label>
          )}
          <p className="partner-supplier-fill">
            신청서에서 채울 정보 · 대표자 <b>{profile.representative || "없음"}</b> · 사업자등록번호 <b>{profile.businessNumber || "없음"}</b> · 연락처 <b>{request.contact || "없음"}</b> · 이메일 <b>{request.email || "없음"}</b>
            <span>이미 공급사에 적힌 칸은 덮어쓰지 않아요.</span>
          </p>
          {sameName && link && <p className="partner-supplier-note"><Link2 size={14} aria-hidden="true" /> 이름이 같은 공급사 '{link.supplierName}'가 이미 있어요 — 새로 만들지 않고 이 공급사와 연결해요{link.isActive ? "" : "(사용 중지 상태 → 사용 중으로 바꿈)"}.</p>}
          <div className="partner-supplier-actions">
            <button type="button" className="primary-action" onClick={() => void register()} disabled={busy}>
              <Store size={16} aria-hidden="true" /> {busy ? "등록 중…" : sameName ? "공급사와 연결하고 정산 방식 맞추기" : autoSettlement ? "공급사로 등록하고 정산 방식 맞추기" : "공급사로 등록하기"}
            </button>
          </div>
        </div>
      ) : link ? (
        <div className="partner-supplier-linked">
          <p className="partner-supplier-summary"><b>{link.supplierName}</b><span>{settlementText(link.settlement)}</span></p>
          {autoSettlement && !matches && <p className="partner-supplier-warn"><AlertTriangle size={14} aria-hidden="true" /> 정산 방식이 계약({contract})과 달라요 — 아래 "정산 방식 계약대로 맞추기"를 눌러 주세요.</p>}
          {link.taxProblems.length > 0 && <p className="partner-supplier-warn"><AlertTriangle size={14} aria-hidden="true" /> 세금계산서 정보 부족: {link.taxProblems.join(", ")} — 공급사 관리에서 채워 주세요(판매 수수료 세금계산서에 필요).</p>}
          <div className="partner-supplier-actions">
            {autoSettlement && !matches && (
              <button type="button" className="secondary-action" onClick={() => void register()} disabled={busy}>{busy ? "맞추는 중…" : "정산 방식 계약대로 맞추기"}</button>
            )}
            <Link className="secondary-action" to={`/admin/suppliers?supplier=${encodeURIComponent(link.supplierId)}`}>공급사 관리에서 보기</Link>
            {link.hasAccount
              ? <span className="partner-supplier-account"><KeyRound size={14} aria-hidden="true" /> 계정 있음 · {link.username}</span>
              : <Link className="primary-action" to={`/admin/suppliers?account=${encodeURIComponent(link.supplierId)}`}><KeyRound size={16} aria-hidden="true" /> 공급사 센터 계정(ID) 만들기</Link>}
          </div>
        </div>
      ) : null}
    </section>
  );
}
