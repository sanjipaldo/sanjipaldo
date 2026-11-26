// 공급사 센터 대시보드(2026-11-25 관리자 요청 "공급사 화면 메인에도 판매 현황 — 달력에 얼마 팔렸는지, 그래프는 앞에,
// 썸네일 이미지, 정산 금액은 자동으로 계산해서 깔끔하게"). 정산 방식(판매수수료 · 일반 도매)에 따라 금액 이름과 안내가 바뀝니다.
// 일반 도매 공급사에게는 두고푸드 판매가 대신 공급가(원가) 기준 금액만 옵니다(서버가 바꿔서 보냄).
// 공급사에게 보이는 화면이라 주문 프로그램 이름(도매몰 시스템)은 쓰지 않습니다.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BadgePercent, Banknote, BookOpen, Boxes, CalendarDays, CircleAlert, ClipboardList, PackagePlus, ShieldAlert, Trophy } from "lucide-react";
import {
  COMMISSION_INVOICE_ITEM,
  SUPPLIER_FEE_STATUS_LABELS,
  SUPPLIER_PAYOUT_STATUS_LABELS,
  SUPPLIER_REQUEST_KIND_LABELS,
  SUPPLIER_RETURN_POLICY,
  formatPayoutLabel,
  formatPeriodLabel,
  monthRange,
  nextMonthKey,
  settlementPlanText,
  settlementSettingsLabel,
  weekdayOf,
  type SupplierSettlementSettings,
  type SupplierSettlementState
} from "@repo/shared/supplier-portal";
import { DailySalesChart, SalesThumb } from "../admin/sales-widgets";
import "../admin/sales-admin.css";
import {
  compactWon,
  count,
  dayLabel,
  monthLabel,
  shortDateTime,
  supplierGet,
  won,
  type SalesDay,
  type SalesMonth,
  type SalesRankItem,
  type SettlementSummary,
  type SupplierDashboard,
  type SupplierFee,
  type SupplierProfile
} from "./supplier-api";
import { RequestStatusPill } from "./supplier-ui";
import { rememberSupplierReturn } from "./supplier-return";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 정산 방식(예전 서버면 계정의 수수료율·주기 + 판매수수료 방식) */
export function settlementOf(profile: SupplierProfile): SupplierSettlementSettings {
  return profile.settlement ?? { type: "commission", commissionRate: profile.account.commissionRate, cycle: profile.account.settlementCycle };
}

function shortDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `${date.getMonth() + 1}.${date.getDate()}`;
}

/** 정산 입금 상태(두고푸드 → 공급사) */
export function PayoutStatus({ state, done }: { state: SupplierSettlementState | null | undefined; done?: boolean }) {
  const status = state?.status ?? "pending";
  const paid = status !== "pending";
  const when = paid ? shortDate(state?.paidAt) : "";
  return (
    <span className={`sup-pay-status ${paid ? "is-paid" : done ? "is-late" : "is-pending"}`}>
      {SUPPLIER_PAYOUT_STATUS_LABELS[status]}{when ? ` · ${when}` : ""}
      {state?.memo ? <small> · {state.memo}</small> : null}
    </span>
  );
}

/** 판매 수수료 상태(공급사 → 두고푸드) */
export function FeeStatus({ state }: { state: SupplierSettlementState | null | undefined }) {
  const status = state?.status ?? "pending";
  return <span className={`sup-fee-status is-${status}`}>{SUPPLIER_FEE_STATUS_LABELS[status]}</span>;
}

/** 한 정산의 금액 계산(물품 대금 + 배송비 = 입금, 판매수수료면 수수료와 실 수령) */
export function SettlementMoneyList({ summary, settings }: { summary: SettlementSummary; settings: SupplierSettlementSettings }) {
  const goods = summary.goodsAmount ?? summary.netAmount;
  const shipping = summary.shippingFee ?? 0;
  const commission = settings.type === "commission";
  return (
    <dl className="sup-money-list sup-settle-money">
      <div><dt>{commission ? "물품 대금 (판매 금액 100%)" : "물품 대금 (공급가 × 판매 수량)"}</dt><dd>{won(goods)}</dd></div>
      <div><dt>배송비 (100%)</dt><dd>{won(shipping)}</dd></div>
      <div className="is-total"><dt>입금 합계</dt><dd>{won(summary.payoutAmount)}</dd></div>
      {commission && <div className="is-fee"><dt>판매 수수료 {settings.commissionRate}% <small>다음 달 1~3일에 한 달 치를 두고푸드로</small></dt><dd>{summary.commission ? `-${won(summary.commission)}` : "0원"}</dd></div>}
      {commission && <div className="is-total is-income"><dt>실 수령 예상</dt><dd>{won(summary.netIncome)}</dd></div>}
      {summary.costMissing ? <div className="is-warn"><dt>공급가를 확인 중인 판매 {count(summary.costMissing, "줄")}은 금액에서 빠져 있어요.</dt><dd /></div> : null}
    </dl>
  );
}

/** 공급사가 두고푸드로 보낼 수수료 금액(부가세 별도 계약이면 수수료 + 부가세) */
export function feePayable(fee: SupplierFee) {
  return fee.amounts?.total ?? fee.commission;
}

/** 수수료 세금계산서(두고푸드 → 공급사) 안내 한 줄 */
function feeInvoiceText(fee: SupplierFee) {
  if (fee.invoice?.issued) return `두고푸드가 '${COMMISSION_INVOICE_ITEM}' 세금계산서를 발행했어요${fee.invoice.issuedAt ? ` · ${shortDate(fee.invoice.issuedAt)}` : ""}`;
  if (fee.state?.status === "done") return `입금 확인됨 · 두고푸드가 '${COMMISSION_INVOICE_ITEM}' 세금계산서를 발행해요`;
  return `입금이 확인되면 두고푸드가 '${COMMISSION_INVOICE_ITEM}' 세금계산서를 발행해요`;
}

/** 판매 수수료 청구(판매수수료 방식만): 그 달 판매분(배송비 제외) × 수수료율 → 두고푸드가 다음 달 초 청구 → 1~3일 입금 → 입금 확인 → 세금계산서 */
export function FeeList({ fees }: { fees: SupplierFee[] }) {
  if (fees.length === 0) return null;
  return (
    <ul className="sup-fee-list">
      {fees.map((fee) => (
        <li key={fee.month} className={fee.state?.status === "paid" ? "is-billed" : fee.state?.status === "done" ? "is-done" : ""}>
          <div>
            <strong>{monthLabel(fee.month)} 판매분 수수료</strong>
            <span>판매 대금 {won(fee.netAmount)}(배송비 제외) × {fee.commissionRate}% · {formatPayoutLabel(fee)}까지 두고푸드로 입금{fee.closed ? "" : " (이 달 판매가 끝나면 확정)"}</span>
            {fee.vatIncluded === false && fee.amounts ? <span>수수료 {won(fee.commission)} + 부가세 {won(fee.amounts.tax)}</span> : null}
            <span className={`sup-fee-invoice${fee.invoice?.issued ? " is-issued" : ""}`}>{feeInvoiceText(fee)}</span>
          </div>
          <b>{won(feePayable(fee))}</b>
          <FeeStatus state={fee.state} />
        </li>
      ))}
    </ul>
  );
}

/** 달력에 표시할 수수료 입금 기간(그 달 1~3일 = 지난달 판매분 수수료). 날짜 → { 첫날 여부, 수수료 } */
export function feeDueMap(fees: SupplierFee[] | undefined, month: string) {
  const map = new Map<string, { first: boolean; fee: SupplierFee }>();
  for (const fee of fees ?? []) {
    if (feePayable(fee) <= 0 || !fee.payoutStart.startsWith(month)) continue;
    const startDay = Number(fee.payoutStart.slice(-2));
    const endDay = Number(fee.payoutEnd.slice(-2));
    for (let day = startDay; day <= endDay; day += 1) {
      const date = `${month}-${String(day).padStart(2, "0")}`;
      map.set(date, { first: day === startDay, fee });
    }
  }
  return map;
}

/** 대시보드 달력: 날짜마다 판매 금액, 정산 입금일(두고푸드 → 공급사)·수수료 입금일(공급사 → 두고푸드) 표시. 누르면 판매·정산 화면으로 */
function SupplierMiniCalendar({ month, today, days, payoutDays, fees }: { month: string; today: string; days: SalesDay[]; payoutDays: SalesMonth["payoutDays"]; fees?: SupplierFee[] }) {
  const { start, end } = monthRange(month);
  const dayMap = new Map(days.map((day) => [day.date, day]));
  const payoutMap = new Map(payoutDays.map((payout) => [payout.date, payout]));
  const feeMap = feeDueMap(fees, month);
  const cells: Array<string | null> = [
    ...Array.from({ length: weekdayOf(start) }, () => null),
    ...Array.from({ length: Number(end.slice(-2)) }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`)
  ];
  return (
    <div className="sup-mini-cal">
      <div className="sup-mini-week" aria-hidden="true">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="sup-mini-grid">
        {cells.map((date, index) => {
          if (!date) return <span key={`blank-${index}`} className="sup-mini-cell is-blank" aria-hidden="true" />;
          const item = dayMap.get(date);
          const payout = payoutMap.get(date);
          const fee = feeMap.get(date);
          const label = [
            dayLabel(date),
            item?.netAmount ? `판매 ${won(item.netAmount)}` : "판매 없음",
            payout ? `정산 입금 ${won(payout.amount)}` : "",
            fee ? `${monthLabel(fee.fee.month)} 판매 수수료 ${won(feePayable(fee.fee))} 두고푸드로 입금(${formatPayoutLabel(fee.fee)})` : ""
          ].filter(Boolean).join(", ");
          return (
            <Link key={date} to="/supplier/sales" className={`sup-mini-cell${date === today ? " is-today" : ""}${item?.netAmount ? " has-sale" : ""}${payout ? " is-payout" : ""}${fee ? " is-fee" : ""}`} aria-label={label} title={label}>
              <b>{Number(date.slice(-2))}</b>
              {item && item.netAmount > 0 && <span>{compactWon(item.netAmount)}</span>}
              {payout && <em>입금</em>}
              {fee && <em className="is-fee">수수료</em>}
            </Link>
          );
        })}
      </div>
      <p className="sup-mini-legend"><span className="is-sale">판매 금액</span><span className="is-payout">정산 입금일</span>{feeMap.size > 0 && <span className="is-fee">수수료 입금일</span>}<span className="is-today">오늘</span></p>
    </div>
  );
}

function TopProducts({ items, amountLabel }: { items: SalesRankItem[]; amountLabel: string }) {
  return (
    <ol className="sup-rank-list has-thumb">
      {items.map((item, index) => (
        <li key={`${item.productId ?? item.productCode ?? item.productName}`}>
          <b className={`supplier-rank rank-${Math.min(index + 1, 3)}`}>{index + 1}위</b>
          <SalesThumb src={item.imageUrl} size={44} />
          <strong>{item.productName}<small>{count(item.netQuantity)} 판매{item.returnQuantity ? ` · 반품 ${count(item.returnQuantity)}` : ""}</small></strong>
          <span aria-label={`${amountLabel} ${won(item.netAmount)}`}>{won(item.netAmount)}</span>
        </li>
      ))}
    </ol>
  );
}

export function SupplierHome({ profile, reloadKey, onCreate }: { profile: SupplierProfile; reloadKey: number; onCreate: () => void }) {
  const [data, setData] = useState<SupplierDashboard | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    void supplierGet<SupplierDashboard>("/dashboard")
      .then((value) => { if (active) { setData(value); setError(""); } })
      .catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : "대시보드를 불러오지 못했어요."); });
    return () => { active = false; };
  }, [reloadKey, retry]);

  if (error && !data) {
    return <section className="admin-card"><div className="empty-state"><CircleAlert size={28} /><strong>대시보드를 불러오지 못했어요.</strong><span>{error}</span><button type="button" className="sup-retry" onClick={() => setRetry((value) => value + 1)}>다시 불러오기</button></div></section>;
  }
  if (!data) return <div className="admin-loading inline"><div className="spinner" /><span>대시보드를 불러오는 중…</span></div>;

  const settings = data.settlement ?? settlementOf(profile);
  const commission = settings.type === "commission";
  const { sales, upcomingSettlement: upcoming, products, requests } = data;
  const fees = data.fees ?? [];
  const thisMonthFee = fees.find((fee) => fee.month === data.month);
  const amountLabel = commission ? "판매 금액" : "공급 금액";
  const onSale = Math.max(0, products.total - products.soldOut);
  const goods = upcoming.goodsAmount ?? upcoming.netAmount;
  const shipping = upcoming.shippingFee ?? 0;
  // 매일 정산(입금이 확인돼야 출고): 오늘 판매분을 오늘 입금
  const daily = settings.cycle === "daily";
  const chart = {
    from: `${data.month}-01`,
    to: data.today,
    today: data.today,
    daily: sales.days.map((day) => ({ date: day.date, amount: day.netAmount, orders: day.orderCount, quantity: day.saleQuantity }))
  };
  return (
    <>
      <div className="admin-page-heading">
        <div><span>SUPPLIER DASHBOARD</span><h1>대시보드</h1><p>{dayLabel(data.today)} 기준 · 이번 달 판매와 정산 금액을 자동으로 계산해 보여 드려요.</p></div>
        <button className="primary-action" type="button" onClick={onCreate}><PackagePlus size={16} /> 상품 등록 요청</button>
      </div>
      <section className="admin-home-hero sup-hero sup-dash-hero">
        <div>
          <span className="sup-hero-kicker">{profile.supplier.name} · {settlementSettingsLabel(settings)}</span>
          {daily
            ? upcoming.payoutAmount > 0
              ? <h2>오늘 판매분은 <mark>{formatPayoutLabel(upcoming)}</mark> {won(upcoming.payoutAmount)} 입금 예정이에요.</h2>
              : <h2>매일 정산이에요. 오늘(<mark>{formatPayoutLabel(upcoming)}</mark>) 판매가 들어오면 그날 입금해요.</h2>
            : <h2>다음 정산은 <mark>{formatPayoutLabel(upcoming)}</mark> {won(upcoming.payoutAmount)} 입금 예정이에요.</h2>}
          <p>{formatPeriodLabel(upcoming)} 판매분 · 물품 대금 {won(goods)}{shipping ? ` + 배송비 ${won(shipping)}` : ""}{daily ? " · 입금을 확인한 뒤 출고해 주세요" : ""}{commission && upcoming.commission ? ` · 판매 수수료 ${settings.commissionRate}%(${won(upcoming.commission)})는 다음 달 1~3일에 한 달 치를 보내 주세요` : ""}</p>
        </div>
        <Link to="/supplier/sales" className="admin-home-live"><span className="live-dot" /> 정산 달력 보기</Link>
      </section>
      <section className="admin-home-stat-grid">
        <Link to="/supplier/sales" className="admin-home-stat featured"><span>{monthLabel(data.month)} {amountLabel}</span><strong>{won(sales.totals.netAmount)}</strong><small>{commission ? "판매" : "공급"} {won(sales.totals.saleAmount)} · 반품 {won(sales.totals.returnAmount)}</small></Link>
        <Link to="/supplier/sales" className="admin-home-stat"><span>{daily ? "오늘 입금 예정" : "다음 정산 입금"}</span><strong>{won(upcoming.payoutAmount)}</strong><small>{formatPayoutLabel(upcoming)} · <PayoutStatus state={upcoming.state} /></small></Link>
        {commission ? (
          <Link to="/supplier/sales" className="admin-home-stat"><span>{monthLabel(data.month)} 판매 수수료</span><strong>{won(thisMonthFee?.commission ?? sales.totals.commission)}</strong><small>{settings.commissionRate}% · {nextMonthKey(data.month).slice(5).replace(/^0/, "")}월 1~3일 두고푸드로 · {COMMISSION_INVOICE_ITEM} 세금계산서</small></Link>
        ) : (
          <Link to="/supplier/account" className="admin-home-stat"><span>정산 방식</span><strong className="is-text">일반 도매(매입)</strong><small>공급가 × 판매 수량 · 판매 수수료 없음</small></Link>
        )}
        <Link to="/supplier/products" className="admin-home-stat"><span>판매 중인 상품</span><strong>{count(onSale)}</strong><small>내 상품 {count(products.total)} · 품절 {count(products.soldOut)} · 승인 대기 {count(requests.pending, "건")}</small></Link>
      </section>

      <div className="sup-dash-sales">
        <section className="admin-card sup-dash-chart">
          <div className="card-heading"><CalendarDays size={19} aria-hidden="true" /><div><h2>날짜별 {amountLabel}</h2><p>{monthLabel(data.month)} · 막대에 마우스를 올리거나 누르면 그날 금액이 보여요</p></div><Link to="/supplier/sales">판매·정산 <ArrowRight size={13} /></Link></div>
          {sales.hasAnySales ? <DailySalesChart summary={chart} /> : <div className="admin-home-unavailable"><CalendarDays size={17} aria-hidden="true" /> 아직 판매 내역이 없어요. 두고푸드 주문이 들어오면 날짜별 금액이 자동으로 채워져요.</div>}
        </section>
        <section className="admin-card sup-dash-calendar">
          <div className="card-heading"><CalendarDays size={19} aria-hidden="true" /><div><h2>판매 달력</h2><p>날짜마다 {amountLabel} · 정산 입금일</p></div><Link to="/supplier/sales">크게 보기 <ArrowRight size={13} /></Link></div>
          <SupplierMiniCalendar month={data.month} today={data.today} days={sales.days} payoutDays={sales.payoutDays ?? []} fees={commission ? data.fees : undefined} />
        </section>
      </div>

      <div className="admin-home-grid">
        <section className="admin-card admin-home-panel">
          <div className="card-heading"><Trophy size={19} aria-hidden="true" /><div><h2>이번 달 잘 팔린 상품</h2><p>{amountLabel}이 큰 순서 TOP 5</p></div><Link to="/supplier/sales">전체 순위 <ArrowRight size={13} /></Link></div>
          {sales.ranking.length === 0 ? (
            <div className="admin-home-unavailable"><CalendarDays size={17} aria-hidden="true" /> 아직 이번 달 판매 내역이 없어요. 판매가 들어오면 순위가 자동으로 채워져요.</div>
          ) : <TopProducts items={sales.ranking} amountLabel={amountLabel} />}
        </section>
        <section className="admin-card admin-home-panel sup-settle-panel">
          <div className="card-heading"><Banknote size={19} aria-hidden="true" /><div><h2>정산 금액(자동 계산)</h2><p>{formatPeriodLabel(upcoming)} 판매분 → {formatPayoutLabel(upcoming)} 입금</p></div><Link to="/supplier/sales">정산 달력 <ArrowRight size={13} /></Link></div>
          <p className="sup-settle-state"><PayoutStatus state={upcoming.state} done={upcoming.payoutEnd < data.today} /></p>
          <SettlementMoneyList summary={upcoming} settings={settings} />
          {commission && fees.length > 0 && (
            <div className="sup-fee-block">
              <h3><BadgePercent size={16} aria-hidden="true" /> 판매 수수료 (공급사 → 두고푸드)</h3>
              <FeeList fees={[...fees].reverse()} />
            </div>
          )}
          <p className="sup-card-note">{settlementPlanText(settings)}</p>
          <p className="sup-policy"><ShieldAlert size={15} aria-hidden="true" /><span>{SUPPLIER_RETURN_POLICY}</span></p>
        </section>
        <section className="admin-card admin-home-panel">
          <div className="card-heading"><ClipboardList size={19} aria-hidden="true" /><div><h2>최근 변경 요청</h2><p>승인 대기 {requests.pending}건</p></div><Link to="/supplier/requests">요청 내역 <ArrowRight size={13} /></Link></div>
          {requests.recent.length === 0 ? (
            <div className="admin-home-unavailable"><ClipboardList size={17} aria-hidden="true" /> 아직 보낸 요청이 없어요. 내 상품에서 변경 요청을 보내거나 새 상품 등록을 요청해 보세요.</div>
          ) : (
            <ul className="sup-recent-list">
              {requests.recent.map((request) => (
                <li key={request.id}>
                  <span className={`sup-kind is-${request.kind}`}>{SUPPLIER_REQUEST_KIND_LABELS[request.kind]}</span>
                  <strong>{request.productName}</strong>
                  <RequestStatusPill status={request.status} />
                  <small>{shortDateTime(request.updatedAt)}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="admin-card admin-home-panel">
          <div className="card-heading"><Boxes size={19} aria-hidden="true" /><div><h2>바로 가기</h2><p>자주 쓰는 메뉴</p></div></div>
          <div className="sup-quick-grid">
            <button type="button" onClick={onCreate}><PackagePlus size={18} /><span><strong>상품 등록 요청</strong><small>새 상품 정보를 보내요</small></span></button>
            <Link to="/supplier/products"><Boxes size={18} /><span><strong>공급가·판매가 확인</strong><small>내 상품 {count(products.total)}</small></span></Link>
            <Link to="/supplier/sales"><CalendarDays size={18} /><span><strong>정산 달력</strong><small>날짜별 판매·반품·입금</small></span></Link>
            <Link to="/how-to/supplier" onClick={() => rememberSupplierReturn("/supplier/home")}><BookOpen size={18} /><span><strong>공급사 사용방법</strong><small>주문·송장·정산 안내</small></span></Link>
          </div>
        </section>
      </div>
    </>
  );
}
