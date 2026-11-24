// 관리자 > 공급사 정산(2026-11-23, 2026-11-25 정산 방식 개편).
// 공급사마다 정산 방식(판매수수료 n% · 일반 도매(매입))과 지급 주기(주 정산 · 월 정산)는 공급사 관리에서 정합니다.
// - 주 정산 지급: 월~일 판매분 → 다음 주 월요일 지급(물품 대금 + 배송비). 판매수수료 = 판매 금액, 일반 도매 = 원가 × 수량.
// - 월 정산 지급: 1일~말일 판매분 → 다음 달 1~3일 지급.
// - 판매 수수료 청구: 판매수수료 방식 공급사의 한 달 판매 대금 × 수수료율 → 다음 달 1~3일 공급사가 두고푸드에 입금
//   (두고푸드가 '마케팅·세일즈 수수료' 세금계산서 발행). 상태는 청구 전 → 세금계산서 발행 → 수수료 입금 확인.
// 공급사 센터에서도 같은 상태(입금 예정·입금 완료, 수수료 상태)가 보여요.
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BadgePercent, ChevronLeft, ChevronRight, HandCoins, Truck, Undo2, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  COMMISSION_INVOICE_ITEM,
  FEE_STATUS_LABELS,
  PAYOUT_STATUS_LABELS,
  SUPPLIER_CYCLE_LABELS,
  addDays,
  formatPayoutLabel,
  nextMonthKey,
  seoulDateKey,
  weekStartOf,
  type SettlementRecordKind,
  type SupplierSettlementCycle,
  type SupplierSettlementStatus,
  type SupplierSettlementType
} from "@repo/shared/supplier-portal";
import { apiFetch } from "@/lib/api";
import { SalesSyncCard, formatDateTime, jsonInit, monthLabel, readData, won, type SalesSyncState } from "./sales-admin-shared";
import "./sales-admin.css";

type Row = {
  supplierName: string;
  supplierId: string | null;
  registered: boolean;
  hasAccount: boolean;
  type: SupplierSettlementType;
  cycle: SupplierSettlementCycle;
  commissionRate: number;
  explicit: boolean;
  saleAmount: number;
  returnAmount: number;
  netAmount: number;
  costAmount: number;
  costMissing: number;
  quantity: number;
  orders: number;
  goodsAmount: number;
  shippingFee: number;
  payoutAmount: number;
  commission: number;
  netIncome: number;
  doogoProfit: number;
  status: SupplierSettlementStatus;
  paidAt: string | null;
  doneAt: string | null;
  memo: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  recorded: { saleAmount: number; commission: number; payoutAmount: number } | null;
  changedAfterRecord: boolean;
};
type Data = {
  kind: SettlementRecordKind;
  period: string;
  start: string;
  end: string;
  payoutFrom: string;
  payoutTo: string;
  closed: boolean;
  rows: Row[];
  totals: { netAmount: number; goodsAmount: number; shippingFee: number; payoutAmount: number; commission: number; doogoProfit: number; done: number; paid: number; pending: number };
  otherCycle?: { suppliers: number; payoutAmount: number };
  sync: SalesSyncState;
};

const KIND_TABS: Array<{ kind: SettlementRecordKind; label: string; icon: typeof Wallet }> = [
  { kind: "weekly", label: "주 정산 지급", icon: Wallet },
  { kind: "monthly", label: "월 정산 지급", icon: HandCoins },
  { kind: "fee", label: "판매 수수료 청구", icon: BadgePercent }
];

const NEXT: Record<SettlementRecordKind, Partial<Record<SupplierSettlementStatus, SupplierSettlementStatus>>> = {
  weekly: { pending: "paid" },
  monthly: { pending: "paid" },
  fee: { pending: "paid", paid: "done" }
};
const PREVIOUS: Record<SupplierSettlementStatus, SupplierSettlementStatus | null> = { pending: null, paid: "pending", done: "paid" };
const NEXT_LABEL: Record<SettlementRecordKind, Partial<Record<SupplierSettlementStatus, string>>> = {
  weekly: { pending: "지급 완료로" },
  monthly: { pending: "지급 완료로" },
  fee: { pending: "세금계산서 발행함", paid: "수수료 입금 확인" }
};

function defaultPeriod(kind: SettlementRecordKind, today = seoulDateKey()) {
  // 주 정산은 지난주 판매분(이번 주 월요일 지급), 월 정산·수수료는 지난달 판매분(이번 달 1~3일)을 먼저 보여 줍니다.
  return kind === "weekly" ? weekStartOf(addDays(today, -7)) : nextMonthKey(today.slice(0, 7), -1);
}

function shortDay(date: string) {
  const [, month, day] = date.split("-").map(Number);
  return `${month}.${day}`;
}

function periodTitle(kind: SettlementRecordKind, period: string) {
  if (kind === "weekly") return `${shortDay(period)} ~ ${shortDay(addDays(period, 6))} 판매분`;
  return `${monthLabel(period)} 판매분`;
}

function statusLabel(kind: SettlementRecordKind, status: SupplierSettlementStatus) {
  return kind === "fee" ? FEE_STATUS_LABELS[status] : PAYOUT_STATUS_LABELS[status];
}

function TypeBadge({ row }: { row: Row }) {
  return <span className={`ssa-type is-${row.type}`}>{row.type === "commission" ? `수수료 ${row.commissionRate}%` : "도매(매입)"}</span>;
}

export function SupplierSettlementsAdmin() {
  const [kind, setKind] = useState<SettlementRecordKind>("weekly");
  const [period, setPeriod] = useState(() => defaultPeriod("weekly"));
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState("");
  const [memoDraft, setMemoDraft] = useState<Record<string, string>>({});
  const today = seoulDateKey();

  const load = useCallback(async () => {
    try {
      setData(await readData<Data>(await apiFetch(`/baljuora/admin/settlements?kind=${kind}&period=${period}`, { silent: true })));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "공급사 정산을 불러오지 못했습니다.");
    }
  }, [kind, period]);

  useEffect(() => { void load(); }, [load]);

  const switchKind = (next: SettlementRecordKind) => {
    if (next === kind) return;
    setData(null);
    setMemoDraft({});
    setKind(next);
    setPeriod(defaultPeriod(next));
  };

  const move = (step: number) => {
    setData(null);
    setMemoDraft({});
    setPeriod((current) => (kind === "weekly" ? addDays(current, step * 7) : nextMonthKey(current, step)));
  };
  const currentPeriod = kind === "weekly" ? weekStartOf(today) : today.slice(0, 7);
  const nextDisabled = period >= currentPeriod;
  const showCurrent = () => {
    setData(null);
    setMemoDraft({});
    setPeriod(currentPeriod);
  };

  const send = async (row: Row, status: SupplierSettlementStatus, memo?: string) => {
    await readData(await apiFetch("/baljuora/admin/settlements", jsonInit("PUT", { supplierName: row.supplierName, kind, period, status, ...(memo !== undefined ? { memo } : {}) })));
  };

  const change = async (row: Row, status: SupplierSettlementStatus) => {
    if (kind !== "fee" && status === "paid" && !window.confirm(`${row.supplierName} ${periodTitle(kind, period)}을 지급 완료로 바꿀까요?\n물품 대금 ${won(row.goodsAmount)} + 배송비 ${won(row.shippingFee)} = ${won(row.payoutAmount)}\n공급사 센터에도 '입금 완료'로 보여요.`)) return;
    if (kind === "fee" && status === "done" && !window.confirm(`${row.supplierName} ${monthLabel(period)} 판매 수수료 ${won(row.commission)} 입금을 확인했나요?`)) return;
    setBusy(row.supplierName);
    try {
      await send(row, status, memoDraft[row.supplierName]);
      toast.success(`${row.supplierName}: ${statusLabel(kind, status)}`);
      setMemoDraft((current) => { const next = { ...current }; delete next[row.supplierName]; return next; });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "정산 상태를 바꾸지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  const saveMemo = async (row: Row) => {
    setBusy(row.supplierName);
    try {
      await send(row, row.status, memoDraft[row.supplierName] ?? "");
      toast.success("메모를 저장했어요.");
      setMemoDraft((current) => { const next = { ...current }; delete next[row.supplierName]; return next; });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "메모를 저장하지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  const isFee = kind === "fee";
  const view = data && data.kind === kind && data.period === period ? data : null;
  return (
    <div className="sa-page ssa-page">
      <div className="admin-page-heading">
        <div><span>SETTLEMENT</span><h1>공급사 정산</h1><p>공급사 관리에서 정한 정산 방식(판매수수료 · 일반 도매)대로 지급할 금액과 받을 수수료를 자동으로 계산해요. 공급사 센터에서도 같은 상태가 보여요.</p></div>
        <div className="sa-month" role="group" aria-label="정산 기간">
          <button type="button" onClick={() => move(-1)} aria-label={kind === "weekly" ? "지난주" : "이전 달"}><ChevronLeft size={17} /></button>
          <strong>{periodTitle(kind, period)}</strong>
          <button type="button" onClick={() => move(1)} aria-label={kind === "weekly" ? "다음 주" : "다음 달"} disabled={nextDisabled}><ChevronRight size={17} /></button>
        </div>
      </div>
      <div className="sa-period ssa-tabs" role="tablist" aria-label="정산 종류">
        {KIND_TABS.map((tab) => {
          const Icon = tab.icon;
          return <button key={tab.kind} type="button" role="tab" aria-selected={kind === tab.kind} className={kind === tab.kind ? "is-active" : ""} onClick={() => switchKind(tab.kind)}><Icon size={15} aria-hidden="true" /> {tab.label}</button>;
        })}
      </div>
      <SalesSyncCard sync={view?.sync ?? null} onDone={() => void load()} compact />
      {!view ? (
        <div className="admin-loading inline"><div className="spinner" /><span>공급사 정산을 불러오는 중…</span></div>
      ) : (
        <>
          {isFee ? (
            <section className="sales-kpi-grid sa-kpi">
              <article className="is-profit"><span>받을 판매 수수료</span><strong>{won(view.totals.commission)}</strong><small>{formatPayoutLabel({ payoutStart: view.payoutFrom, payoutEnd: view.payoutTo })} · {COMMISSION_INVOICE_ITEM} 세금계산서</small></article>
              <article><span>수수료 기준 판매 대금</span><strong>{won(view.totals.goodsAmount)}</strong><small>판매수수료 방식 공급사 {view.rows.length.toLocaleString("ko-KR")}곳</small></article>
              <article className={view.totals.pending ? "is-warning" : ""}><span>청구 전</span><strong>{view.totals.pending.toLocaleString("ko-KR")}곳</strong><small>세금계산서를 아직 발행하지 않음</small></article>
              <article><span>수수료 입금 확인</span><strong>{view.totals.done.toLocaleString("ko-KR")}곳</strong><small>세금계산서 발행 {view.totals.paid.toLocaleString("ko-KR")}곳 · 입금 대기</small></article>
            </section>
          ) : (
            <section className="sales-kpi-grid sa-kpi">
              <article className="is-profit"><span>지급 합계</span><strong>{won(view.totals.payoutAmount)}</strong><small>{formatPayoutLabel({ payoutStart: view.payoutFrom, payoutEnd: view.payoutTo })} 지급 · 두고푸드 → 공급사</small></article>
              <article><span>물품 대금</span><strong>{won(view.totals.goodsAmount)}</strong><small>판매수수료 = 판매 금액 · 도매 = 원가 × 수량</small></article>
              <article><span>배송비(100% 지급)</span><strong>{won(view.totals.shippingFee)}</strong><small>공급사 매입 배송비</small></article>
              <article className={view.totals.pending ? "is-warning" : ""}><span>지급 대기</span><strong>{view.totals.pending.toLocaleString("ko-KR")}곳</strong><small>지급 완료 {(view.totals.paid + view.totals.done).toLocaleString("ko-KR")}곳</small></article>
            </section>
          )}
          {!view.closed && <p className="sa-notice"><AlertTriangle size={15} aria-hidden="true" /><span>{periodTitle(kind, period)}은 아직 끝나지 않았어요. 금액은 지금까지 판매 기준이에요.</span></p>}
          {!isFee && view.otherCycle && view.otherCycle.suppliers > 0 && <p className="sa-notice ssa-info"><span>{kind === "weekly" ? "월 정산" : "주 정산"} 공급사 {view.otherCycle.suppliers.toLocaleString("ko-KR")}곳(이 기간 지급 예정 {won(view.otherCycle.payoutAmount)})은 '{kind === "weekly" ? "월 정산 지급" : "주 정산 지급"}' 탭에서 봐요.</span></p>}
          {view.rows.length === 0 ? (
            <section className="admin-card sa-empty"><HandCoins size={30} aria-hidden="true" /><strong>{periodTitle(kind, period)} {isFee ? "받을 판매 수수료가" : "지급할 공급사가"} 없어요.</strong><p>발주오라 판매를 불러오면 DB센터 상품의 공급사로 나눠 정산 금액이 계산됩니다. 정산 방식은 공급사 관리에서 정해요.</p>{period < currentPeriod && <button type="button" className="outline-button" onClick={showCurrent}>진행 중인 {kind === "weekly" ? "이번 주" : "이번 달"} 판매분 보기</button>}</section>
          ) : (
            <section className="admin-card">
              <div className="admin-table-wrap">
                <table className="admin-table stackable-table sa-table sa-settle-table ssa-table">
                  <thead>
                    {isFee
                      ? <tr><th>공급사</th><th>판매 대금</th><th>수수료</th><th>상태</th><th>메모</th><th>바꾸기</th></tr>
                      : <tr><th>공급사</th><th>판매 금액</th><th>물품 대금</th><th>배송비</th><th>지급 합계</th><th>상태</th><th>메모</th><th>바꾸기</th></tr>}
                  </thead>
                  <tbody>
                    {view.rows.map((row) => {
                      const next = NEXT[kind][row.status] ?? null;
                      const previous = PREVIOUS[row.status];
                      const memo = memoDraft[row.supplierName] ?? row.memo ?? "";
                      const owed = isFee ? row.commission > 0 : row.payoutAmount > 0;
                      return (
                        <tr key={row.supplierName} className={`is-${row.status}`}>
                          <td data-label="공급사" className="stack-wide">
                            <strong>{row.supplierName}</strong>
                            <small><TypeBadge row={row} /> {SUPPLIER_CYCLE_LABELS[row.cycle]}{row.registered ? (row.explicit ? "" : " · 기본값") : " · 공급사 목록에 없음"}{row.hasAccount ? " · 공급사 센터 계정" : ""}</small>
                          </td>
                          {isFee ? (
                            <>
                              <td data-label="판매 대금"><b>{won(row.goodsAmount)}</b><small>판매 {won(row.saleAmount)}{row.returnAmount ? ` · 취소·반품 -${won(row.returnAmount)}` : ""}</small></td>
                              <td data-label={`수수료(${row.commissionRate}%)`}><b>{won(row.commission)}</b><small>{row.commissionRate}% · {formatPayoutLabel({ payoutStart: view.payoutFrom, payoutEnd: view.payoutTo })}까지</small></td>
                            </>
                          ) : (
                            <>
                              <td data-label="판매 금액">{won(row.netAmount)}<small>{row.orders.toLocaleString("ko-KR")}건 · {row.quantity.toLocaleString("ko-KR")}개{row.returnAmount ? ` · 반품 -${won(row.returnAmount)}` : ""}</small></td>
                              <td data-label="물품 대금"><b>{won(row.goodsAmount)}</b><small>{row.type === "commission" ? "판매 금액 100%" : `원가 × 수량 · 마진 ${won(row.doogoProfit)}`}{row.costMissing ? ` · 원가 모르는 ${row.costMissing}줄` : ""}</small></td>
                              <td data-label="배송비"><span className="ssa-ship"><Truck size={13} aria-hidden="true" /> {won(row.shippingFee)}</span></td>
                              <td data-label="지급 합계"><b className="ssa-total">{won(row.payoutAmount)}</b>{row.type === "commission" && row.commission > 0 && <small>수수료 {won(row.commission)} · 다음 달 1~3일 청구</small>}</td>
                            </>
                          )}
                          <td data-label="상태">
                            <span className={`sa-status is-${row.status}`}>{statusLabel(kind, row.status)}</span>
                            <small>{row.doneAt ? `확인 ${formatDateTime(row.doneAt)}` : row.paidAt ? `${isFee ? "발행" : "지급"} ${formatDateTime(row.paidAt)}` : ""}{row.updatedBy ? ` · ${row.updatedBy}` : ""}</small>
                            {row.changedAfterRecord && row.recorded && <small className="sa-warn-text"><AlertTriangle size={12} aria-hidden="true" /> 상태를 바꾼 뒤 금액이 바뀜(그때 {won(isFee ? row.recorded.commission : row.recorded.payoutAmount)} → 지금 {won(isFee ? row.commission : row.payoutAmount)})</small>}
                          </td>
                          <td data-label="메모" className="sa-wide-mobile">
                            <div className="sa-memo-edit">
                              <input value={memo} onChange={(event) => setMemoDraft({ ...memoDraft, [row.supplierName]: event.target.value })} placeholder={isFee ? "예: 12/2 계산서 발행" : "예: 11/23 국민 입금"} maxLength={500} aria-label={`${row.supplierName} 메모`} />
                              {memoDraft[row.supplierName] !== undefined && <button type="button" className="outline-button" onClick={() => void saveMemo(row)} disabled={busy === row.supplierName}>저장</button>}
                            </div>
                          </td>
                          <td data-label="바꾸기" className="sa-wide-mobile">
                            <div className="sa-settle-actions">
                              {next && <button type="button" className="primary-action" onClick={() => void change(row, next)} disabled={busy === row.supplierName || (!owed && row.status === "pending")}>{NEXT_LABEL[kind][row.status]}</button>}
                              {previous && <button type="button" className="sa-icon-button" onClick={() => void change(row, previous)} disabled={busy === row.supplierName} aria-label={`${row.supplierName} ${statusLabel(kind, previous)}로 되돌리기`} title="되돌리기"><Undo2 size={15} /></button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="sa-foot">
                {isFee
                  ? <>판매 수수료: 판매수수료 방식 공급사의 한 달 판매 대금 × 수수료율. 매월 1~3일 두고푸드가 <b>{COMMISSION_INVOICE_ITEM}</b> 세금계산서를 발행하고(<b>세금계산서 발행함</b>), 공급사가 수수료를 보내면 <b>수수료 입금 확인</b>으로 바꿔요.</>
                  : <>지급 금액 = 물품 대금(판매수수료 = 판매 금액 100%, 일반 도매 = 원가 × 판매 수량) + 배송비(100%). {kind === "weekly" ? "월~일 판매분을 다음 주 월요일에" : "1일~말일 판매분을 다음 달 1~3일에"} 보내고 <b>지급 완료로</b> 바꿔요. 판매수수료 방식의 수수료는 '판매 수수료 청구' 탭에서 따로 받아요.</>}
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
