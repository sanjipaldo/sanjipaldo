// 관리자 > 공급사 정산(2026-11-23, 관리자 요청): 공급사별 월 판매 금액(발주오라 판매, 취소·반품 뺀 금액)과 수수료(기본 10%,
// 마케팅·판매대행)를 보고, 정산 상태(정산 대기 → 판매 대금 입금 완료 → 정산 완료)를 바꿉니다. 공급사 센터에서도 같은 상태가 보여요.
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, HandCoins, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  SUPPLIER_CYCLE_LABELS,
  SUPPLIER_SETTLEMENT_STATUS_LABELS,
  nextMonthKey,
  seoulDateKey,
  type SupplierSettlementCycle,
  type SupplierSettlementStatus
} from "@repo/shared/supplier-portal";
import { apiFetch } from "@/lib/api";
import { SalesSyncCard, formatDateTime, jsonInit, monthLabel, readData, won, type SalesSyncState } from "./sales-admin-shared";
import "./sales-admin.css";

type Row = {
  supplierName: string;
  supplierId: string | null;
  registered: boolean;
  hasAccount: boolean;
  cycle: SupplierSettlementCycle;
  commissionRate: number;
  saleAmount: number;
  returnAmount: number;
  netAmount: number;
  quantity: number;
  orders: number;
  commission: number;
  payoutAmount: number;
  netIncome: number;
  status: SupplierSettlementStatus;
  paidAt: string | null;
  doneAt: string | null;
  memo: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  recorded: { saleAmount: number; commission: number; payoutAmount: number } | null;
  changedAfterRecord: boolean;
};
type Data = { month: string; payoutFrom: string; payoutTo: string; closed: boolean; rows: Row[]; totals: { netAmount: number; commission: number; done: number; paid: number; pending: number }; sync: SalesSyncState };

const NEXT_STATUS: Record<SupplierSettlementStatus, SupplierSettlementStatus | null> = { pending: "paid", paid: "done", done: null };
const NEXT_LABEL: Record<SupplierSettlementStatus, string> = { pending: "판매 대금 입금 완료", paid: "정산 완료(수수료 확인)", done: "" };
const PREVIOUS_STATUS: Record<SupplierSettlementStatus, SupplierSettlementStatus | null> = { pending: null, paid: "pending", done: "paid" };

export function SupplierSettlementsAdmin() {
  // 매월 1일에 지난달 판매분을 정산하므로 지난달을 먼저 보여 줍니다.
  const [month, setMonth] = useState(() => nextMonthKey(seoulDateKey().slice(0, 7), -1));
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState("");
  const [memoDraft, setMemoDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setData(await readData<Data>(await apiFetch(`/baljuora/admin/settlements?month=${month}`, { silent: true })));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "공급사 정산을 불러오지 못했습니다.");
    }
  }, [month]);

  useEffect(() => { void load(); }, [load]);

  const change = async (row: Row, status: SupplierSettlementStatus) => {
    if (status === "done" && !window.confirm(`${row.supplierName} ${monthLabel(month)} 정산을 완료로 바꿀까요?\n판매 대금 ${won(row.payoutAmount)} · 수수료 ${won(row.commission)}\n공급사 센터에도 '정산 완료'로 보입니다.`)) return;
    setBusy(row.supplierName);
    try {
      const memo = memoDraft[row.supplierName];
      await readData(await apiFetch("/baljuora/admin/settlements", jsonInit("PUT", { supplierName: row.supplierName, month, status, ...(memo !== undefined ? { memo } : {}) })));
      toast.success(`${row.supplierName}: ${SUPPLIER_SETTLEMENT_STATUS_LABELS[status]}`);
      setMemoDraft((current) => { const next = { ...current }; delete next[row.supplierName]; return next; });
      await load();
    } finally {
      setBusy("");
    }
  };

  const saveMemo = async (row: Row) => {
    setBusy(row.supplierName);
    try {
      await readData(await apiFetch("/baljuora/admin/settlements", jsonInit("PUT", { supplierName: row.supplierName, month, status: row.status, memo: memoDraft[row.supplierName] ?? "" })));
      toast.success("메모를 저장했어요.");
      setMemoDraft((current) => { const next = { ...current }; delete next[row.supplierName]; return next; });
      await load();
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="sa-page">
      <div className="admin-page-heading">
        <div><span>SETTLEMENT</span><h1>공급사 정산</h1><p>공급사별 월 판매 금액과 수수료를 보고 정산 상태를 바꿉니다. 공급사 센터에서도 같은 상태가 보여 서로 잊지 않아요.</p></div>
        <div className="sa-month" role="group" aria-label="정산할 달">
          <button type="button" onClick={() => { setData(null); setMonth(nextMonthKey(month, -1)); }} aria-label="이전 달"><ChevronLeft size={17} /></button>
          <strong>{monthLabel(month)} 판매분</strong>
          <button type="button" onClick={() => { setData(null); setMonth(nextMonthKey(month, 1)); }} aria-label="다음 달" disabled={month >= seoulDateKey().slice(0, 7)}><ChevronRight size={17} /></button>
        </div>
      </div>
      <SalesSyncCard sync={data?.sync ?? null} onDone={() => void load()} compact />
      {!data ? (
        <div className="admin-loading inline"><div className="spinner" /><span>공급사 정산을 불러오는 중…</span></div>
      ) : (
        <>
          <section className="sales-kpi-grid sa-kpi">
            <article><span>판매 금액 합계</span><strong>{won(data.totals.netAmount)}</strong><small>취소·반품 뺀 금액 · {data.payoutFrom.slice(5).replace("-", "/")}~{data.payoutTo.slice(8)}일 입금</small></article>
            <article><span>수수료 합계</span><strong>{won(data.totals.commission)}</strong><small>마케팅·판매대행 수수료</small></article>
            <article className={data.totals.pending ? "is-warning" : ""}><span>정산 대기</span><strong>{data.totals.pending.toLocaleString("ko-KR")}곳</strong><small>판매가 있는데 아직 입금 전</small></article>
            <article><span>정산 완료</span><strong>{data.totals.done.toLocaleString("ko-KR")}곳</strong><small>판매 대금 입금 {data.totals.paid.toLocaleString("ko-KR")}곳 · 수수료 확인 대기</small></article>
          </section>
          {!data.closed && <p className="sa-notice"><AlertTriangle size={15} aria-hidden="true" /><span>{monthLabel(month)}은 아직 끝나지 않았어요. 금액은 지금까지 판매 기준이며, 정산은 다음 달 1~3일에 합니다.</span></p>}
          {data.rows.length === 0 ? (
            <section className="admin-card sa-empty"><HandCoins size={30} aria-hidden="true" /><strong>{monthLabel(month)} 공급사 판매가 없어요.</strong><p>발주오라 판매를 불러오면 DB센터 상품의 공급사로 나눠 정산 금액이 계산됩니다.</p></section>
          ) : (
            <section className="admin-card">
              <div className="admin-table-wrap">
                <table className="admin-table stackable-table sa-table sa-settle-table">
                  <thead><tr><th>공급사</th><th>판매 금액</th><th>수수료</th><th>판매 대금(100%)</th><th>상태</th><th>메모</th><th>바꾸기</th></tr></thead>
                  <tbody>
                    {data.rows.map((row) => {
                      const next = NEXT_STATUS[row.status];
                      const previous = PREVIOUS_STATUS[row.status];
                      const memo = memoDraft[row.supplierName] ?? row.memo ?? "";
                      return (
                        <tr key={row.supplierName} className={`is-${row.status}`}>
                          <td data-label="공급사" className="stack-wide">
                            <strong>{row.supplierName}</strong>
                            <small>{row.registered ? `${SUPPLIER_CYCLE_LABELS[row.cycle]} · ${row.hasAccount ? "공급사 센터 계정 있음" : "공급사 센터 계정 없음"}` : "DB센터 공급사 목록에 없음(발주오라 매입처 이름)"}</small>
                          </td>
                          <td data-label="판매 금액"><b>{won(row.netAmount)}</b><small>판매 {won(row.saleAmount)}{row.returnAmount ? ` · 취소·반품 -${won(row.returnAmount)}` : ""}</small></td>
                          <td data-label={`수수료(${row.commissionRate}%)`}>{won(row.commission)}<small>{row.commissionRate}%</small></td>
                          <td data-label="판매 대금(100%)">{won(row.payoutAmount)}<small>실 수령 {won(row.netIncome)}</small></td>
                          <td data-label="상태">
                            <span className={`sa-status is-${row.status}`}>{SUPPLIER_SETTLEMENT_STATUS_LABELS[row.status]}</span>
                            <small>{row.doneAt ? `완료 ${formatDateTime(row.doneAt)}` : row.paidAt ? `입금 ${formatDateTime(row.paidAt)}` : ""}{row.updatedBy ? ` · ${row.updatedBy}` : ""}</small>
                            {row.changedAfterRecord && row.recorded && <small className="sa-warn-text"><AlertTriangle size={12} aria-hidden="true" /> 상태를 바꾼 뒤 금액이 바뀜(그때 {won(row.recorded.saleAmount)} → 지금 {won(row.netAmount)})</small>}
                          </td>
                          <td data-label="메모" className="sa-wide-mobile">
                            <div className="sa-memo-edit">
                              <input value={memo} onChange={(event) => setMemoDraft({ ...memoDraft, [row.supplierName]: event.target.value })} placeholder="예: 12/1 국민 입금" maxLength={500} aria-label={`${row.supplierName} 메모`} />
                              {memoDraft[row.supplierName] !== undefined && <button type="button" className="outline-button" onClick={() => void saveMemo(row)} disabled={busy === row.supplierName}>저장</button>}
                            </div>
                          </td>
                          <td data-label="바꾸기" className="sa-wide-mobile">
                            <div className="sa-settle-actions">
                              {next && <button type="button" className="primary-action" onClick={() => void change(row, next)} disabled={busy === row.supplierName || (row.netAmount === 0 && row.status === "pending")}>{NEXT_LABEL[row.status]}</button>}
                              {previous && <button type="button" className="sa-icon-button" onClick={() => void change(row, previous)} disabled={busy === row.supplierName} aria-label={`${row.supplierName} ${SUPPLIER_SETTLEMENT_STATUS_LABELS[previous]}로 되돌리기`} title="되돌리기"><Undo2 size={15} /></button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="sa-foot">정산 순서: 매월 1~3일 판매 대금 100% 입금(두고푸드 → 공급사) → <b>판매 대금 입금 완료</b> → 공급사가 수수료 입금 → 확인 후 <b>정산 완료</b>(두고푸드가 수수료 세금계산서 발행).</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
