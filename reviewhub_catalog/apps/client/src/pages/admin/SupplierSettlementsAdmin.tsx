// 관리자 > 공급사 정산(2026-11-23, 2026-11-25 정산 방식 개편, 2026-11-26 매일 정산).
// 공급사마다 정산 방식(판매수수료 n% · 일반 도매(매입))과 지급 주기(주 정산 · 월 정산 · 매일 정산)는 공급사 관리에서 정합니다.
// - 주 정산 지급: 월~일 판매분 → 다음 주 월요일 지급(물품 대금 + 배송비). 판매수수료 = 판매 금액, 일반 도매 = 원가 × 수량.
// - 월 정산 지급: 1일~말일 판매분 → 다음 달 1~3일 지급.
// - 매일 정산 지급(입금이 확인돼야 출고하는 공급사): 그날 판매분 → 그날 지급. 날짜를 하루씩 옮기고, 최근 14일 중 지급 대기인 날을 위에 보여 줘요.
// - 판매 수수료 청구(2026-11-25 관리자 확정 순서): 판매수수료 방식 공급사의 한 달 판매 대금(배송비 제외) × 수수료율을
//   달이 끝나면 '한 번에 청구하기'(청구 전 → 청구함·입금 대기, 공급사 센터 달력에 1~3일 입금일·금액이 보임) → 공급사가 입금하면
//   '입금 확인'(정산 완료) → 입금 확인한 공급사의 '판매대행·마케팅대행 수수료' 세금계산서를 홈택스 일괄발급 파일로 받아 발행하고
//   '발행 완료로 표시'(inv:YYYY-MM 기록, 공급사 센터에도 보임).
// 공급사 센터에서도 같은 상태(입금 예정·입금 완료, 수수료 상태)가 보여요.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BadgePercent, CalendarCheck, CheckCircle2, ChevronLeft, ChevronRight, FileSpreadsheet, HandCoins, Receipt, Send, Truck, Undo2, Wallet } from "lucide-react";
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
  weekdayOf,
  type SettlementRecordKind,
  type SupplierSettlementCycle,
  type SupplierSettlementStatus,
  type SupplierSettlementType
} from "@repo/shared/supplier-portal";
import { apiFetch } from "@/lib/api";
import { SalesSyncCard, formatDateTime, jsonInit, monthLabel, readData, saveResponseFile, won, type SalesSyncState } from "./sales-admin-shared";
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
  /** 판매 수수료 탭: 세금계산서 발행 상태·금액(부가세 포함/별도)·공급받는자 정보 부족 */
  invoice?: { issued: boolean; issuedAt: string | null; amount: number | null } | null;
  invoiceAmounts?: { supply: number; tax: number; total: number } | null;
  taxProblems?: string[];
};
type InvoiceInfo = {
  vatIncluded: boolean;
  item: string;
  writeDate: string;
  supplierProblems: string[];
  issued: number;
  ready: string[];
  missingInfo: Array<{ supplierName: string; supplierId: string | null; problems: string[] }>;
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
  otherCycle?: { suppliers: number; payoutAmount: number; byCycle?: Partial<Record<SupplierSettlementCycle, { suppliers: number; payoutAmount: number }>> };
  invoice?: InvoiceInfo | null;
  /** 매일 정산 탭: 최근 14일 중 지급 대기인 날 */
  pendingDays?: Array<{ date: string; suppliers: number; payoutAmount: number }>;
  sync: SalesSyncState;
};

const KIND_TABS: Array<{ kind: SettlementRecordKind; label: string; icon: typeof Wallet }> = [
  { kind: "weekly", label: "주 정산 지급", icon: Wallet },
  { kind: "monthly", label: "월 정산 지급", icon: HandCoins },
  { kind: "daily", label: "매일 정산 지급", icon: CalendarCheck },
  { kind: "fee", label: "판매 수수료 청구", icon: BadgePercent }
];
const CYCLE_TAB: Record<SupplierSettlementCycle, SettlementRecordKind> = { weekly: "weekly", monthly: "monthly", daily: "daily" };

const NEXT: Record<SettlementRecordKind, Partial<Record<SupplierSettlementStatus, SupplierSettlementStatus>>> = {
  weekly: { pending: "paid" },
  monthly: { pending: "paid" },
  daily: { pending: "paid" },
  fee: { pending: "paid", paid: "done" }
};
const PREVIOUS: Record<SupplierSettlementStatus, SupplierSettlementStatus | null> = { pending: null, paid: "pending", done: "paid" };
const NEXT_LABEL: Record<SettlementRecordKind, Partial<Record<SupplierSettlementStatus, string>>> = {
  weekly: { pending: "지급 완료로" },
  monthly: { pending: "지급 완료로" },
  daily: { pending: "지급 완료로" },
  fee: { pending: "청구하기", paid: "입금 확인" }
};

function defaultPeriod(kind: SettlementRecordKind, today = seoulDateKey()) {
  // 주 정산은 지난주 판매분(이번 주 월요일 지급), 월 정산·수수료는 지난달 판매분(이번 달 1~3일), 매일 정산은 오늘 판매분을 먼저 보여 줍니다.
  if (kind === "daily") return today;
  return kind === "weekly" ? weekStartOf(addDays(today, -7)) : nextMonthKey(today.slice(0, 7), -1);
}

function shortDay(date: string) {
  const [, month, day] = date.split("-").map(Number);
  return `${month}.${day}`;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** "11월 26일(목)" */
function dayTitle(date: string) {
  const [, month, day] = date.split("-").map(Number);
  return `${month}월 ${day}일(${WEEKDAYS[weekdayOf(date)]})`;
}

function periodTitle(kind: SettlementRecordKind, period: string) {
  if (kind === "daily") return `${dayTitle(period)} 판매분`;
  if (kind === "weekly") return `${shortDay(period)} ~ ${shortDay(addDays(period, 6))} 판매분`;
  return `${monthLabel(period)} 판매분`;
}

/** 지금 진행 중인 기간 이름(빈 화면의 "진행 중인 ○○ 판매분 보기") */
const CURRENT_NAME: Record<SettlementRecordKind, string> = { weekly: "이번 주", monthly: "이번 달", daily: "오늘", fee: "이번 달" };
const MOVE_LABELS: Record<SettlementRecordKind, [string, string]> = { weekly: ["지난주", "다음 주"], monthly: ["이전 달", "다음 달"], daily: ["전날", "다음 날"], fee: ["이전 달", "다음 달"] };

function statusLabel(kind: SettlementRecordKind, status: SupplierSettlementStatus) {
  return kind === "fee" ? FEE_STATUS_LABELS[status] : PAYOUT_STATUS_LABELS[status];
}

/** 공급사가 보낼 수수료(부가세 별도면 수수료 + 부가세) */
function payable(row: Row) {
  return row.invoiceAmounts?.total ?? row.commission;
}

/** 판매대행·마케팅대행 수수료 세금계산서(두고푸드 → 공급사): 부가세 포함/별도, 홈택스 일괄발급 파일, 발행 완료 표시 */
function FeeInvoicePanel({ info, month, busy, downloaded, onVatMode, onDownload, onMark }: {
  info: InvoiceInfo;
  month: string;
  busy: string;
  downloaded: string[];
  onVatMode: (included: boolean) => void;
  onDownload: (names: string[]) => void;
  onMark: (names: string[]) => void;
}) {
  const blocked = info.supplierProblems.length > 0;
  return (
    <section className="admin-card ssa-invoice-panel">
      <div className="card-heading"><Receipt size={19} aria-hidden="true" /><div><h2>{info.item} 세금계산서 (두고푸드 → 공급사)</h2><p>입금을 확인한 공급사에 {monthLabel(month)}분 수수료 세금계산서(과세)를 발행해요. 작성일자 {info.writeDate.replace(/-/g, ".")}(월 합계) · 영수</p></div></div>
      <div className="ssa-vat" role="radiogroup" aria-label="판매 수수료 부가세">
        <span>판매 수수료 부가세</span>
        <label className={info.vatIncluded ? "is-active" : ""}><input type="radio" name="ssa-vat" checked={info.vatIncluded} onChange={() => onVatMode(true)} disabled={busy !== ""} /> 수수료에 포함 <small>공급사가 수수료만큼 입금 · 공급가액 = 수수료 ÷ 1.1</small></label>
        <label className={!info.vatIncluded ? "is-active" : ""}><input type="radio" name="ssa-vat" checked={!info.vatIncluded} onChange={() => onVatMode(false)} disabled={busy !== ""} /> 별도 <small>공급사가 수수료 + 부가세 10% 입금</small></label>
      </div>
      {blocked && <p className="sa-notice"><AlertTriangle size={15} aria-hidden="true" /><span>공급자(두고푸드) 정보가 비어 있어요: {info.supplierProblems.join(", ")} — <Link to="/admin/taxInvoices">세금계산서 신고 화면</Link>에서 먼저 채워 주세요.</span></p>}
      {info.missingInfo.length > 0 && <p className="sa-notice"><AlertTriangle size={15} aria-hidden="true" /><span>세금계산서 정보가 부족한 공급사 {info.missingInfo.length}곳({info.missingInfo.slice(0, 3).map((item) => item.supplierName).join(", ")}{info.missingInfo.length > 3 ? " 외" : ""})은 파일에서 빠져요 — <Link to={info.missingInfo.length === 1 && info.missingInfo[0].supplierId ? `/admin/suppliers?supplier=${encodeURIComponent(info.missingInfo[0].supplierId)}` : "/admin/suppliers"}>공급사 관리</Link>에서 사업자등록번호·대표자를 채워 주세요.</span></p>}
      <ol className="ssa-invoice-steps">
        <li><b>파일 받기</b> 입금 확인 · 발행 전 <b>{info.ready.length.toLocaleString("ko-KR")}곳</b>{info.ready.length > 0 ? ` (${info.ready.slice(0, 3).join(", ")}${info.ready.length > 3 ? " 외" : ""})` : ""}</li>
        <li><b>홈택스에 올리기</b> 홈택스 › 전자세금계산서 › 발급 › 일괄발급(엑셀 업로드)</li>
        <li><b>발행 완료로 표시</b> 공급사 센터에도 '세금계산서 발행'으로 보여요</li>
      </ol>
      <div className="ssa-invoice-actions">
        <button type="button" className="primary-action" onClick={() => onDownload(info.ready)} disabled={blocked || info.ready.length === 0 || busy !== ""}><FileSpreadsheet size={15} aria-hidden="true" /> 홈택스 일괄발급 파일 받기 ({info.ready.length.toLocaleString("ko-KR")}곳)</button>
        {downloaded.length > 0 && <button type="button" className="outline-button" onClick={() => onMark(downloaded)} disabled={busy !== ""}><CheckCircle2 size={15} aria-hidden="true" /> {downloaded.length.toLocaleString("ko-KR")}곳 발행 완료로 표시</button>}
      </div>
      {info.ready.length === 0 && !blocked && <p className="sa-foot">입금을 확인한 공급사가 생기면 파일을 받을 수 있어요. 이미 발행한 공급사는 표에 '세금계산서 발행'으로 보여요.</p>}
    </section>
  );
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
    setPeriod((current) => (kind === "daily" ? addDays(current, step) : kind === "weekly" ? addDays(current, step * 7) : nextMonthKey(current, step)));
  };
  const currentPeriod = kind === "daily" ? today : kind === "weekly" ? weekStartOf(today) : today.slice(0, 7);
  const nextDisabled = period >= currentPeriod;
  const goTo = (next: string) => {
    if (next === period) return;
    setData(null);
    setMemoDraft({});
    setPeriod(next);
  };
  const showCurrent = () => goTo(currentPeriod);

  const send = async (row: Row, status: SupplierSettlementStatus, memo?: string) => {
    await readData(await apiFetch("/baljuora/admin/settlements", jsonInit("PUT", { supplierName: row.supplierName, kind, period, status, ...(memo !== undefined ? { memo } : {}) })));
  };

  const change = async (row: Row, status: SupplierSettlementStatus) => {
    if (kind !== "fee" && status === "paid" && !window.confirm(`${row.supplierName} ${periodTitle(kind, period)}을 지급 완료로 바꿀까요?\n물품 대금 ${won(row.goodsAmount)} + 배송비 ${won(row.shippingFee)} = ${won(row.payoutAmount)}\n공급사 센터에도 '입금 완료'로 보여요.`)) return;
    if (kind === "fee" && status === "paid" && !window.confirm(`${row.supplierName}에 ${monthLabel(period)} 판매 수수료 ${won(payable(row))}을 청구할까요?\n공급사 센터 달력에 ${formatPayoutLabel({ payoutStart: view?.payoutFrom ?? "", payoutEnd: view?.payoutTo ?? "" })} 입금일과 금액이 보여요.`)) return;
    if (kind === "fee" && status === "done" && !window.confirm(`${row.supplierName} ${monthLabel(period)} 판매 수수료 ${won(payable(row))} 입금을 확인했나요?\n정산 완료로 바뀌고, 수수료 세금계산서 발행 대상이 돼요.`)) return;
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
  const billable = isFee && view ? view.rows.filter((row) => row.status === "pending" && row.commission > 0) : [];
  const [downloaded, setDownloaded] = useState<string[]>([]);
  useEffect(() => { setDownloaded([]); }, [kind, period]);

  // 판매 수수료 "한 번에 청구하기": 청구 전 공급사를 모두 청구함(입금 대기)으로
  const billAll = async () => {
    if (!view || billable.length === 0) return;
    const total = billable.reduce((sum, row) => sum + payable(row), 0);
    if (!window.confirm(`${monthLabel(period)} 판매 수수료 ${billable.length}곳 · 합계 ${won(total)}을 한 번에 청구할까요?\n공급사 센터 달력에 ${formatPayoutLabel({ payoutStart: view.payoutFrom, payoutEnd: view.payoutTo })} 입금일과 금액이 보여요.`)) return;
    setBusy("bulk");
    try {
      await readData(await apiFetch("/baljuora/admin/settlements/bulk", jsonInit("PUT", { kind: "fee", period, status: "paid", supplierNames: billable.map((row) => row.supplierName) })));
      toast.success(`${billable.length}곳에 판매 수수료를 청구했어요.`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "청구하지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  const saveVatMode = async (included: boolean) => {
    setBusy("vat");
    try {
      await readData(await apiFetch("/baljuora/admin/hometax/settings", jsonInit("PUT", { commissionVatIncluded: included })));
      toast.success(included ? "판매 수수료에 부가세가 포함된 것으로 계산해요." : "판매 수수료와 부가세(10%)를 따로 받아요.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "설정을 저장하지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  // 수수료 세금계산서 홈택스 일괄발급 파일(입금 확인 + 발행 전 공급사)
  const downloadInvoices = async (names: string[]) => {
    if (names.length === 0) return;
    setBusy("invoice-file");
    try {
      const query = names.map((name) => `supplier=${encodeURIComponent(name)}`).join("&");
      const response = await apiFetch(`/baljuora/admin/settlements/fee-invoice-file?month=${period}&${query}`);
      if (!response.ok) return;
      const included = (() => {
        try { return JSON.parse(decodeURIComponent(response.headers.get("X-Doogo-Invoice-Suppliers") ?? "")) as string[]; } catch { return names; }
      })();
      await saveResponseFile(response, `홈택스_판매수수료_세금계산서_${period}.xlsx`);
      setDownloaded(Array.isArray(included) && included.length > 0 ? included : names);
      toast.success("홈택스 일괄발급 파일을 받았어요. 홈택스에 올려 발행한 뒤 '발행 완료로 표시'를 눌러 주세요.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "파일을 만들지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  const markInvoices = async (names: string[], issued: boolean) => {
    if (names.length === 0) return;
    if (!issued && !window.confirm(`${names.join(", ")} 세금계산서 발행 표시를 되돌릴까요?`)) return;
    setBusy("invoice-mark");
    try {
      await readData(await apiFetch("/baljuora/admin/settlements/fee-invoices", jsonInit("POST", { month: period, supplierNames: names, issued })));
      toast.success(issued ? `${names.length}곳 세금계산서를 발행 완료로 표시했어요.` : "발행 표시를 되돌렸어요.");
      if (issued) setDownloaded([]);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "세금계산서 상태를 바꾸지 못했습니다.");
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="sa-page ssa-page">
      <div className="admin-page-heading">
        <div><span>SETTLEMENT</span><h1>공급사 정산</h1><p>공급사 관리에서 정한 정산 방식(판매수수료 · 일반 도매)대로 지급할 금액과 받을 수수료를 자동으로 계산해요. 공급사 센터에서도 같은 상태가 보여요.</p></div>
        <div className="sa-month" role="group" aria-label="정산 기간">
          <button type="button" onClick={() => move(-1)} aria-label={MOVE_LABELS[kind][0]}><ChevronLeft size={17} /></button>
          <strong>{periodTitle(kind, period)}</strong>
          <button type="button" onClick={() => move(1)} aria-label={MOVE_LABELS[kind][1]} disabled={nextDisabled}><ChevronRight size={17} /></button>
          {kind === "daily" && period !== currentPeriod && <button type="button" className="ssa-today" onClick={showCurrent}>오늘</button>}
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
              <article className="is-profit"><span>받을 판매 수수료</span><strong>{won(view.rows.reduce((sum, row) => sum + payable(row), 0))}</strong><small>{formatPayoutLabel({ payoutStart: view.payoutFrom, payoutEnd: view.payoutTo })} · 공급사 → 두고푸드{view.invoice && !view.invoice.vatIncluded ? " · 부가세 별도 포함" : ""}</small></article>
              <article><span>수수료 기준 판매 대금</span><strong>{won(view.totals.goodsAmount)}</strong><small>배송비 제외 · 판매수수료 방식 공급사 {view.rows.length.toLocaleString("ko-KR")}곳</small></article>
              <article className={view.totals.pending ? "is-warning" : ""}><span>청구 전</span><strong>{view.totals.pending.toLocaleString("ko-KR")}곳</strong><small>청구함 · 입금 대기 {view.totals.paid.toLocaleString("ko-KR")}곳</small></article>
              <article><span>입금 확인 · 정산 완료</span><strong>{view.totals.done.toLocaleString("ko-KR")}곳</strong><small>세금계산서 발행 {(view.invoice?.issued ?? 0).toLocaleString("ko-KR")}곳</small></article>
            </section>
          ) : (
            <section className="sales-kpi-grid sa-kpi">
              <article className="is-profit"><span>지급 합계</span><strong>{won(view.totals.payoutAmount)}</strong><small>{formatPayoutLabel({ payoutStart: view.payoutFrom, payoutEnd: view.payoutTo })} 지급 · 두고푸드 → 공급사</small></article>
              <article><span>물품 대금</span><strong>{won(view.totals.goodsAmount)}</strong><small>판매수수료 = 판매 금액 · 도매 = 원가 × 수량</small></article>
              <article><span>배송비(100% 지급)</span><strong>{won(view.totals.shippingFee)}</strong><small>공급사 매입 배송비</small></article>
              <article className={view.totals.pending ? "is-warning" : ""}><span>지급 대기</span><strong>{view.totals.pending.toLocaleString("ko-KR")}곳</strong><small>지급 완료 {(view.totals.paid + view.totals.done).toLocaleString("ko-KR")}곳</small></article>
            </section>
          )}
          {kind === "daily" && (view.pendingDays?.length ?? 0) > 0 && (
            <div className="ssa-pending-days" role="group" aria-label="지급 대기 날짜">
              <span><AlertTriangle size={15} aria-hidden="true" /> 지급 대기(최근 14일)</span>
              {view.pendingDays?.map((day) => (
                <button key={day.date} type="button" className={day.date === period ? "is-active" : ""} onClick={() => goTo(day.date)} aria-pressed={day.date === period}>
                  <b>{dayTitle(day.date)}</b> {day.suppliers.toLocaleString("ko-KR")}곳 · {won(day.payoutAmount)}
                </button>
              ))}
            </div>
          )}
          {!view.closed && <p className="sa-notice"><AlertTriangle size={15} aria-hidden="true" /><span>{periodTitle(kind, period)}은 아직 끝나지 않았어요. 금액은 지금까지 판매 기준이에요.{isFee ? " 판매 수수료는 달이 끝난 뒤(다음 달 1일부터) 청구할 수 있어요." : ""}{kind === "daily" ? " 지급 완료 뒤에 들어온 주문은 '금액이 바뀜'으로 알려 드려요." : ""}</span></p>}
          {isFee && view.closed && billable.length > 0 && (
            <div className="ssa-bulk">
              <span><BadgePercent size={16} aria-hidden="true" /> 청구 전 <b>{billable.length.toLocaleString("ko-KR")}곳</b> · 합계 <b>{won(billable.reduce((sum, row) => sum + payable(row), 0))}</b></span>
              <button type="button" className="primary-action" onClick={() => void billAll()} disabled={busy !== ""}><Send size={15} aria-hidden="true" /> 한 번에 청구하기</button>
            </div>
          )}
          {!isFee && view.otherCycle && view.otherCycle.suppliers > 0 && (
            <p className="sa-notice ssa-info ssa-other-cycle">
              <span>다른 지급 주기 공급사(이 기간 판매분)는 각 탭에서 봐요:</span>
              {view.otherCycle.byCycle
                ? (Object.entries(view.otherCycle.byCycle) as Array<[SupplierSettlementCycle, { suppliers: number; payoutAmount: number }]>).map(([cycle, entry]) => (
                  <button key={cycle} type="button" onClick={() => switchKind(CYCLE_TAB[cycle] ?? "weekly")}>{SUPPLIER_CYCLE_LABELS[cycle] ?? cycle} {entry.suppliers.toLocaleString("ko-KR")}곳 · {won(entry.payoutAmount)} ›</button>
                ))
                : <span>{view.otherCycle.suppliers.toLocaleString("ko-KR")}곳 · {won(view.otherCycle.payoutAmount)}</span>}
            </p>
          )}
          {view.rows.length === 0 ? (
            <section className="admin-card sa-empty"><HandCoins size={30} aria-hidden="true" /><strong>{periodTitle(kind, period)} {isFee ? "받을 판매 수수료가" : "지급할 공급사가"} 없어요.</strong><p>발주오라 판매를 불러오면 DB센터 상품의 공급사로 나눠 정산 금액이 계산됩니다. 정산 방식은 공급사 관리에서 정해요.</p>{period < currentPeriod && <button type="button" className="outline-button" onClick={showCurrent}>진행 중인 {CURRENT_NAME[kind]} 판매분 보기</button>}</section>
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
                              <td data-label={`수수료(${row.commissionRate}%)`}><b>{won(payable(row))}</b><small>{row.commissionRate}%{row.invoiceAmounts && view.invoice && !view.invoice.vatIncluded ? ` · 수수료 ${won(row.commission)} + 부가세 ${won(row.invoiceAmounts.tax)}` : ""} · {formatPayoutLabel({ payoutStart: view.payoutFrom, payoutEnd: view.payoutTo })}까지</small></td>
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
                            <small>{row.doneAt ? `확인 ${formatDateTime(row.doneAt)}` : row.paidAt ? `${isFee ? "청구" : "지급"} ${formatDateTime(row.paidAt)}` : ""}{row.updatedBy ? ` · ${row.updatedBy}` : ""}</small>
                            {isFee && row.commission > 0 && (
                              <span className={`ssa-invoice${row.invoice?.issued ? " is-issued" : ""}`}>
                                <Receipt size={12} aria-hidden="true" /> {row.invoice?.issued ? `세금계산서 발행${row.invoice.issuedAt ? ` · ${formatDateTime(row.invoice.issuedAt)}` : ""}` : "세금계산서 발행 전"}
                                {row.invoice?.issued && <button type="button" className="ssa-invoice-undo" onClick={() => void markInvoices([row.supplierName], false)} disabled={busy !== ""} aria-label={`${row.supplierName} 세금계산서 발행 표시 되돌리기`} title="발행 표시 되돌리기"><Undo2 size={12} /></button>}
                              </span>
                            )}
                            {isFee && row.commission > 0 && (row.taxProblems?.length ?? 0) > 0 && <small className="sa-warn-text"><AlertTriangle size={12} aria-hidden="true" /><span>세금계산서 정보 부족: {row.taxProblems?.join(", ")} — <Link to={row.supplierId ? `/admin/suppliers?supplier=${encodeURIComponent(row.supplierId)}` : "/admin/suppliers"}>{row.supplierId ? "공급사 관리에서 채우기" : "공급사 관리에 등록하기"}</Link></span></small>}
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
                              {next && <button type="button" className="primary-action" onClick={() => void change(row, next)} disabled={busy === row.supplierName || (!owed && row.status === "pending") || (isFee && row.status === "pending" && !view.closed)} title={isFee && row.status === "pending" && !view.closed ? "달이 끝난 뒤(다음 달 1일부터) 청구할 수 있어요" : undefined}>{NEXT_LABEL[kind][row.status]}</button>}
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
                  ? <>판매 수수료 = 판매수수료 방식 공급사의 한 달 판매 대금(배송비 제외) × 수수료율. 달이 끝나면 <b>청구하기</b>(공급사 센터 달력에 1~3일 입금일·금액) → 공급사가 보내면 <b>입금 확인</b>(정산 완료) → 아래에서 <b>{COMMISSION_INVOICE_ITEM}</b> 세금계산서를 발행해요.</>
                  : <>지급 금액 = 물품 대금(판매수수료 = 판매 금액 100%, 일반 도매 = 원가 × 판매 수량) + 배송비(100%). {kind === "daily" ? "그날 판매분을 그날 보내고(공급사는 입금을 확인한 뒤 출고)" : kind === "weekly" ? "월~일 판매분을 다음 주 월요일에 보내고" : "1일~말일 판매분을 다음 달 1~3일에 보내고"} <b>지급 완료로</b> 바꿔요. 물품 대금 세금계산서(면세 상품은 계산서)는 공급사가 지급 금액으로 두고푸드에 발행해요. 판매수수료 방식의 수수료는 '판매 수수료 청구' 탭에서 {kind === "daily" ? "다음 달 1~3일에 한 달 판매 대금(배송비 제외) 기준으로 " : ""}따로 받아요.</>}
              </p>
            </section>
          )}
          {isFee && view.invoice && view.rows.some((row) => row.commission > 0) && (
            <FeeInvoicePanel
              info={view.invoice}
              month={period}
              busy={busy}
              downloaded={downloaded}
              onVatMode={(included) => void saveVatMode(included)}
              onDownload={(names) => void downloadInvoices(names)}
              onMark={(names) => void markInvoices(names, true)}
            />
          )}
        </>
      )}
    </div>
  );
}
