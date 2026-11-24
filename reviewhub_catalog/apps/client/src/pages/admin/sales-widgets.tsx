// 판매 현황 화면 조각(2026-11-24): 관리자 > 판매 현황과 운영 홈이 같이 씁니다.
// - 오늘 잘 팔린 상품·상품 판매 TOP 10에 상품 썸네일(DB센터 상품과 이어진 줄만, 없으면 상자 그림)
// - 날짜별 판매 막대: 마우스를 올리거나(PC) 누르거나(휴대폰) 키보드로 고르면 그날 판매 금액(원 단위)·주문·수량 말풍선
// - TOP 10 수량·판매 금액 글씨를 키움
import { useMemo, useRef, useState } from "react";
import { BadgePercent, Boxes, Crown, Package, Truck, Wallet } from "lucide-react";
import { addDays, monthRange, nextMonthKey, weekdayOf } from "@repo/shared/supplier-portal";
import { compactWon, percent, won, type SalesSyncState } from "./sales-admin-shared";

export type SalesTotals = { amount: number; quantity: number; orders: number; buyers: number; cost: number; returnAmount: number; lines: number };
export type SalesProductRank = { key: string; productId: string | null; name: string; supplierName: string | null; categoryName: string; amount: number; quantity: number; orders: number; imageUrl?: string | null };
// 두고푸드 수익 나눠 보기(2026-11-25, 서버 profitBreakdown): 판매수수료 예상 · 일반 도매 마진 · 배송비 차익 · 공급사에 줄 배송비
export type ProfitBreakdown = {
  commission: { amount: number; fee: number; suppliers: number; minRate: number | null; maxRate: number | null };
  wholesale: { amount: number; cost: number; margin: number; suppliers: number; costMissing: number };
  shipping: { received: number; paid: number; margin: number };
  unassigned: { amount: number; suppliers: number };
  profit: number;
};
export type SalesSummary = {
  from: string;
  to: string;
  today: string;
  hasData: boolean;
  totals: SalesTotals;
  breakdown?: ProfitBreakdown;
  previous: { from: string; to: string; amount: number; orders: number };
  pending: { count: number; amount: number };
  todaySales: { totals: SalesTotals; topProducts: SalesProductRank[] };
  daily: Array<{ date: string; amount: number; orders: number; quantity: number }>;
  topProducts: SalesProductRank[];
  topSuppliers: Array<{ name: string; amount: number; quantity: number; products: number }>;
  categories: Array<{ categoryId: string | null; categoryName: string; amount: number; quantity: number }>;
  topBuyers: Array<{ key: string; name: string; amount: number; orders: number; quantity: number }>;
  sync: SalesSyncState;
};

export type SalesPreset = "today" | "yesterday" | "week" | "month" | "lastMonth" | "custom";

// 기간 단추 → 시작일·끝일(한국 날짜). 이번 주는 월요일부터, 직접 고르기는 화면이 정합니다(여기서는 이번 달).
export function salesRangeFor(preset: SalesPreset, today: string) {
  if (preset === "today") return { from: today, to: today };
  if (preset === "yesterday") return { from: addDays(today, -1), to: addDays(today, -1) };
  if (preset === "week") return { from: addDays(today, -((weekdayOf(today) + 6) % 7)), to: today };
  if (preset === "lastMonth") {
    const range = monthRange(nextMonthKey(today.slice(0, 7), -1));
    return { from: range.start, to: range.end };
  }
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

const count = (value: number) => value.toLocaleString("ko-KR");
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function dayLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${month}월 ${day}일(${weekday})`;
}

export function SalesChange({ now, before }: { now: number; before: number }) {
  if (!before) return <small>이전 기간 판매 없음</small>;
  const change = Math.round(((now - before) / before) * 1000) / 10;
  return <small className={change >= 0 ? "sa-up" : "sa-down"}>이전 같은 기간보다 {change >= 0 ? "▲" : "▼"} {Math.abs(change)}%</small>;
}

export function ShareBar({ value, total }: { value: number; total: number }) {
  const share = percent(value, total);
  return <span className="sa-share" aria-label={`비중 ${share}%`}><i style={{ width: `${Math.max(2, Math.min(100, share))}%` }} /><em>{share}%</em></span>;
}

// 상품 썸네일. 이미지가 없거나 못 불러오면 상자 그림을 보여 줍니다(이름은 옆에 있어 대체 글은 비움).
export function SalesThumb({ src, size = 44 }: { src?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="sa-thumb is-empty" style={{ width: size, height: size }} aria-hidden="true"><Package size={Math.round(size * 0.46)} /></span>;
  return <img className="sa-thumb" src={src} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

export function SalesKpiCards({ summary }: { summary: SalesSummary }) {
  const totals = summary.totals;
  const margin = totals.amount - totals.cost;
  const profit = summary.breakdown?.profit;
  return (
    <section className="sales-kpi-grid sa-kpi">
      <article><span>판매 금액</span><strong>{won(totals.amount)}</strong><SalesChange now={totals.amount} before={summary.previous.amount} /></article>
      <article><span>주문</span><strong>{count(totals.orders)}건</strong><small>상품 {count(totals.quantity)}개{totals.returnAmount ? ` · 취소·반품 -${won(totals.returnAmount)}` : ""}</small></article>
      <article><span>주문한 매출처</span><strong>{count(totals.buyers)}곳</strong><small>셀러(매출처) 수</small></article>
      {profit === undefined ? (
        <article><span>매입원가 뺀 금액</span><strong>{won(margin)}</strong><small>{totals.amount ? `판매 금액의 ${percent(margin, totals.amount)}% · 매입원가가 있는 줄 기준` : "판매 없음"}</small></article>
      ) : (
        <article className="is-profit"><span>두고푸드 예상 수익</span><strong>{won(profit)}</strong><small>{totals.amount ? `판매 금액의 ${percent(profit, totals.amount)}% · 수수료 + 도매 마진 + 배송비 차익` : "판매 없음"}</small></article>
      )}
    </section>
  );
}

function rateLabel(minRate: number | null, maxRate: number | null) {
  if (minRate === null || maxRate === null) return "10%";
  return minRate === maxRate ? `${minRate}%` : `${minRate}~${maxRate}%`;
}

/** 두고푸드 수익 나눠 보기: 판매 금액을 정산 방식별로 나눠 두고푸드 몫을 바로 셈합니다(공급사 관리의 정산 방식 기준). */
export function ProfitBreakdownCards({ summary }: { summary: SalesSummary }) {
  const breakdown = summary.breakdown;
  if (!breakdown) return null;
  const { commission, wholesale, shipping, unassigned } = breakdown;
  return (
    <>
      <section className="sa-profit-grid" aria-label="두고푸드 수익 나눠 보기">
        <article className="is-commission">
          <span><BadgePercent size={16} aria-hidden="true" /> 판매수수료 예상 <em>순이익</em></span>
          <strong>{won(commission.fee)}</strong>
          <small>판매 {won(commission.amount)} × {rateLabel(commission.minRate, commission.maxRate)} · 공급사 {count(commission.suppliers)}곳 · 다음 달 1~3일 받음</small>
        </article>
        <article className="is-wholesale">
          <span><Boxes size={16} aria-hidden="true" /> 일반 도매 파트</span>
          <strong>{won(wholesale.amount)}</strong>
          <small>{wholesale.suppliers ? `마진 ${won(wholesale.margin)} (원가 ${won(wholesale.cost)}) · 공급사 ${count(wholesale.suppliers)}곳` : "도매(매입) 공급사 판매 없음"}{wholesale.costMissing ? ` · 원가 모르는 판매 ${count(wholesale.costMissing)}줄` : ""}</small>
        </article>
        <article className="is-shipping">
          <span><Truck size={16} aria-hidden="true" /> 배송비 차익 <em>순이익</em></span>
          <strong>{won(shipping.margin)}</strong>
          <small>받은 배송비 {won(shipping.received)} − 공급사 지급 {won(shipping.paid)}</small>
        </article>
        <article className="is-payout">
          <span><Wallet size={16} aria-hidden="true" /> 공급사에 줄 배송비 <em>100% 지급</em></span>
          <strong>{won(shipping.paid)}</strong>
          <small>공급사 매입 배송비 · 정산 때 그대로 보냄</small>
        </article>
      </section>
      {unassigned.amount > 0 && <p className="sa-profit-note">공급사 목록에 없는 매입처 {count(unassigned.suppliers)}곳(판매 {won(unassigned.amount)})은 판매수수료 10%로 셈했어요. 공급사 관리에서 등록하고 정산 방식을 정해 주세요.</p>}
    </>
  );
}

export function TodayTopList({ summary, limit = 5 }: { summary: SalesSummary; limit?: number }) {
  const items = summary.todaySales.topProducts.slice(0, limit);
  if (items.length === 0) return <p className="sa-muted sa-pad">오늘 들어온 판매가 아직 없어요. (불러온 뒤의 주문만 보여요)</p>;
  return (
    <ol className="sa-rank-list sa-product-list">
      {items.map((item, index) => (
        <li key={item.key}>
          <b className={`sa-rank rank-${Math.min(index + 1, 4)}`}>{index + 1}</b>
          <SalesThumb src={item.imageUrl} />
          <span><strong title={item.name}>{item.name}</strong><small>{item.supplierName ?? "공급사 미지정"} · {count(item.quantity)}개 · {count(item.orders)}건</small></span>
          <em>{won(item.amount)}</em>
        </li>
      ))}
    </ol>
  );
}

export function TodayTopCard({ summary, limit = 5 }: { summary: SalesSummary; limit?: number }) {
  return (
    <section className="admin-card sa-today">
      <div className="card-heading"><Crown size={19} aria-hidden="true" /><div><h2>오늘 잘 팔린 상품</h2><p>{summary.today} · 판매 {won(summary.todaySales.totals.amount)} · 주문 {count(summary.todaySales.totals.orders)}건</p></div></div>
      <TodayTopList summary={summary} limit={limit} />
    </section>
  );
}

// 날짜별 판매 막대. 막대를 가리키면(마우스·탭·키보드) 위쪽 말풍선에 그날 판매 금액·주문·수량을 원 단위로 보여 줍니다.
export function DailySalesChart({ summary }: { summary: Pick<SalesSummary, "daily" | "from" | "to" | "today"> }) {
  const [active, setActive] = useState<number | null>(null);
  // 휴대폰(크롬)은 막대를 누른 직후 마우스가 떠난 것처럼(mouseleave) 알려 말풍선이 바로 닫히므로, 누른 직후의 떠남은 무시합니다.
  const touchedAt = useRef(0);
  const days = useMemo(() => {
    const byDate = new Map(summary.daily.map((day) => [day.date, day]));
    const list: Array<{ date: string; amount: number; orders: number; quantity: number }> = [];
    for (let date = summary.from; date <= summary.to && list.length < 120; date = addDays(date, 1)) {
      const day = byDate.get(date);
      list.push({ date, amount: day?.amount ?? 0, orders: day?.orders ?? 0, quantity: day?.quantity ?? 0 });
    }
    return list;
  }, [summary]);
  const max = Math.max(1, ...days.map((day) => day.amount));
  const total = days.reduce((sum, day) => sum + day.amount, 0);
  const best = days.reduce<(typeof days)[number] | null>((top, day) => (day.amount > (top?.amount ?? 0) ? day : top), null);
  const activeDay = active !== null ? days[active] : null;
  const tipPosition = active === null ? 50 : ((active + 0.5) / days.length) * 100;
  const tipAlign = active === null ? "center" : tipPosition < 18 ? "start" : tipPosition > 82 ? "end" : "center";
  return (
    <div className="sa-chart">
      <div className="sa-bars" onTouchStart={() => { touchedAt.current = Date.now(); }} onMouseLeave={() => { if (Date.now() - touchedAt.current > 1000) setActive(null); }}>
        {activeDay && (
          <div className={`sa-bar-tip is-${tipAlign}`} style={{ left: `${tipPosition}%` }} role="status">
            <span>{dayLabel(activeDay.date)}{activeDay.date === summary.today ? " · 오늘" : ""}</span>
            <strong>{won(activeDay.amount)}</strong>
            <small>주문 {count(activeDay.orders)}건 · 상품 {count(activeDay.quantity)}개</small>
          </div>
        )}
        {days.map((day, index) => (
          <button
            type="button"
            key={day.date}
            className={`sa-bar${day.date === summary.today ? " is-today" : ""}${active === index ? " is-active" : ""}`}
            aria-label={`${dayLabel(day.date)} 판매 ${won(day.amount)}, 주문 ${count(day.orders)}건`}
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive((current) => (current === index ? null : current))}
            onClick={() => setActive(index)}
          >
            <i style={{ height: `${Math.max(day.amount > 0 ? 3 : 0, (day.amount / max) * 100)}%` }} />
            {days.length <= 31 && <em>{Number(day.date.slice(-2))}</em>}
          </button>
        ))}
      </div>
      <p className="sa-chart-foot">
        합계 <b>{won(total)}</b> · 하루 평균 <b>{won(Math.round(total / Math.max(1, days.length)))}</b>
        {best && best.amount > 0 ? <> · 가장 많이 판 날 <b>{dayLabel(best.date)} {won(best.amount)}</b></> : null}
      </p>
    </div>
  );
}

export function TopProductsTable({ summary, limit = 10 }: { summary: SalesSummary; limit?: number }) {
  const items = summary.topProducts.slice(0, limit);
  if (items.length === 0) return <p className="sa-muted sa-pad">이 기간에 판매가 없어요.</p>;
  return (
    <div className="sa-top-box">
      <div className="admin-table-wrap">
        <table className="admin-table stackable-table sa-table sa-top-table">
          <thead><tr><th>순위</th><th>상품</th><th>공급사</th><th>카테고리</th><th>수량</th><th>판매 금액</th><th>비중</th></tr></thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.key}>
                <td data-label="순위"><b className={`sa-rank rank-${Math.min(index + 1, 4)}`}>{index + 1}위</b></td>
                <td data-label="상품" className="stack-wide"><span className="sa-product-cell"><SalesThumb src={item.imageUrl} size={48} /><span className="sa-product-text"><strong>{item.name}</strong><small className="sa-product-meta">{item.supplierName ?? "-"} · {item.categoryName}</small></span></span></td>
                <td data-label="공급사">{item.supplierName ?? "-"}</td>
                <td data-label="카테고리">{item.categoryName}</td>
                <td data-label="수량" className="sa-qty"><b>{count(item.quantity)}개</b><small>{count(item.orders)}건</small></td>
                <td data-label="판매 금액" className="sa-amount"><b>{won(item.amount)}</b></td>
                <td data-label="비중"><ShareBar value={item.amount} total={summary.totals.amount} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SupplierRankList({ summary }: { summary: SalesSummary }) {
  if (summary.topSuppliers.length === 0) return <p className="sa-muted sa-pad">이 기간에 판매가 없어요.</p>;
  return (
    <ol className="sa-rank-list">
      {summary.topSuppliers.map((item, index) => (
        <li key={item.name}><b className={`sa-rank rank-${Math.min(index + 1, 4)}`}>{index + 1}</b><span><strong>{item.name}</strong><small>상품 {item.products}종 · {count(item.quantity)}개</small><ShareBar value={item.amount} total={summary.totals.amount} /></span><em>{compactWon(item.amount)}원</em></li>
      ))}
    </ol>
  );
}

export function CategoryRankList({ summary }: { summary: SalesSummary }) {
  if (summary.categories.length === 0) return <p className="sa-muted sa-pad">이 기간에 판매가 없어요.</p>;
  return (
    <ol className="sa-rank-list">
      {summary.categories.map((item, index) => (
        <li key={item.categoryId ?? "none"}><b className={`sa-rank rank-${Math.min(index + 1, 4)}`}>{index + 1}</b><span><strong>{item.categoryName}</strong><small>{count(item.quantity)}개</small><ShareBar value={item.amount} total={summary.totals.amount} /></span><em>{compactWon(item.amount)}원</em></li>
      ))}
    </ol>
  );
}

export function BuyerRankList({ summary }: { summary: SalesSummary }) {
  if (summary.topBuyers.length === 0) return <p className="sa-muted sa-pad">이 기간에 주문한 매출처가 없어요.</p>;
  return (
    <ol className="sa-rank-list">
      {summary.topBuyers.map((item, index) => (
        <li key={item.key}><b className={`sa-rank rank-${Math.min(index + 1, 4)}`}>{index + 1}</b><span><strong>{item.name}</strong><small>주문 {count(item.orders)}건 · {count(item.quantity)}개</small><ShareBar value={item.amount} total={summary.totals.amount} /></span><em>{compactWon(item.amount)}원</em></li>
      ))}
    </ol>
  );
}

