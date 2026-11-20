// 공급사 센터 > 판매·정산: 날짜별 판매·반품 달력, 정산 입금일, 상품 판매 순위.
// 판매 데이터(supplier_sales)는 두고푸드 주문 데이터 연결 후 채워집니다. 연결 전에는 0원과 안내만 보입니다.
import { useEffect, useMemo, useState } from "react";
import { Banknote, CalendarDays, ChevronLeft, ChevronRight, CircleAlert, Trophy } from "lucide-react";
import {
  SUPPLIER_CYCLE_LABELS,
  addDays,
  formatPayoutLabel,
  formatPeriodLabel,
  monthRange,
  nextMonthKey,
  seoulDateKey,
  weekdayOf
} from "@repo/shared/supplier-portal";
import { compactWon, count, dayLabel, monthLabel, supplierGet, won, type SalesMonth } from "./supplier-api";

type PayoutDay = SalesMonth["payoutDays"][number];

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function defaultSelected(data: SalesMonth) {
  const { start, end } = monthRange(data.month);
  if (data.today >= start && data.today <= end) return data.today;
  const firstSale = data.days.find((day) => day.saleAmount > 0 || day.returnAmount > 0);
  if (firstSale) return firstSale.date;
  return data.payoutDays[0]?.date && data.payoutDays[0].date >= start ? data.payoutDays[0].date : start;
}

// 정산 방식 안내(공급사 사용방법·입점 제안서와 같은 기준)
export function cycleDescription(cycle: SalesMonth["cycle"], rate: number) {
  if (cycle === "weekly") {
    return `주 정산: 월요일~일요일 판매분을 다음 주 월요일에 판매 대금 100%로 먼저 입금해요. 수수료 ${rate}%는 매월 1일에 지난달 거래 금액 기준으로 한 번 보내 주시면 됩니다.`;
  }
  return `월 정산: 매달 1일~말일 판매분을 양사가 확인한 뒤 다음 달 1~3일에 판매 대금 100%를 먼저 입금해요. 받으신 뒤 수수료 ${rate}%를 보내 주시면 두고푸드가 수수료 세금계산서를 발행합니다.`;
}

export function SupplierSales() {
  const currentMonth = seoulDateKey().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<SalesMonth | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void supplierGet<SalesMonth>(`/sales?month=${month}`)
      .then((value) => {
        if (!active) return;
        setData(value);
        setError("");
        setSelected(defaultSelected(value));
      })
      .catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : "판매 내역을 불러오지 못했어요."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month, retry]);

  const view = data && data.month === month ? data : null;
  const { start, end } = monthRange(month);
  const dayMap = useMemo(() => new Map((view?.days ?? []).map((day) => [day.date, day])), [view]);
  const payoutMap = useMemo(() => {
    const map = new Map<string, { first: boolean; payout: PayoutDay }>();
    for (const payout of view?.payoutDays ?? []) {
      for (let date = payout.date; date <= payout.endDate; date = addDays(date, 1)) map.set(date, { first: date === payout.date, payout });
    }
    return map;
  }, [view]);
  const cells: Array<string | null> = [
    ...Array.from({ length: weekdayOf(start) }, () => null),
    ...Array.from({ length: Number(end.slice(-2)) }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`)
  ];
  const selectedDay = selected ? dayMap.get(selected) : undefined;
  const selectedPayout = selected ? payoutMap.get(selected) : undefined;
  const totals = view?.totals;
  const rate = view?.commissionRate ?? 0;
  const cycle = view?.cycle ?? "monthly";

  return (
    <>
      <div className="admin-page-heading">
        <div><span>SALES &amp; SETTLEMENT</span><h1>판매·정산</h1><p>날짜별 판매·반품과 정산 입금일을 달력으로 확인합니다. 날짜를 누르면 그날 내역이 보여요.</p></div>
        {view && <span className="source-status connected">{SUPPLIER_CYCLE_LABELS[cycle]} · 수수료 {rate}%</span>}
      </div>
      {error && !view ? (
        <section className="admin-card"><div className="empty-state"><CircleAlert size={28} /><strong>판매 내역을 불러오지 못했어요.</strong><span>{error}</span><button type="button" className="sup-retry" onClick={() => setRetry((value) => value + 1)}>다시 불러오기</button></div></section>
      ) : !view ? (
        <div className="admin-loading inline"><div className="spinner" /><span>판매 내역을 불러오는 중…</span></div>
      ) : (
        <>
          {!view.hasAnySales && (
            <div className="sup-info-banner">
              <CalendarDays size={20} aria-hidden="true" />
              <div><strong>아직 들어온 판매 내역이 없어요.</strong><p>두고푸드 주문 데이터가 연결되면 날짜별 판매·반품과 정산 금액이 자동으로 채워져요. {cycleDescription(cycle, rate)}</p></div>
            </div>
          )}
          <section className="sales-kpi-grid sup-kpi">
            <article><span>판매 금액</span><strong>{won(totals?.saleAmount ?? 0)}</strong><small>{count(totals?.orderCount ?? 0, "건")} · {count(totals?.saleQuantity ?? 0)}</small></article>
            <article><span>반품 금액</span><strong className={totals?.returnAmount ? "is-return" : ""}>{totals?.returnAmount ? `-${won(totals.returnAmount)}` : "0원"}</strong><small>{count(totals?.returnQuantity ?? 0)} 반품</small></article>
            <article><span>정산 대상 금액</span><strong>{won(totals?.netAmount ?? 0)}</strong><small>판매 금액 − 반품 금액</small></article>
            <article><span>실 수령 예상</span><strong>{won(totals?.netIncome ?? 0)}</strong><small>수수료 {rate}% {won(totals?.commission ?? 0)} 빼고</small></article>
          </section>
          <div className="sales-layout sup-sales-layout">
            <section className="admin-card sales-calendar-card sup-calendar-card" aria-busy={loading}>
              <div className="sales-calendar-heading">
                <button type="button" onClick={() => setMonth(nextMonthKey(month, -1))} aria-label="이전 달"><ChevronLeft size={17} /></button>
                <h2>{monthLabel(month)}</h2>
                <button type="button" onClick={() => setMonth(nextMonthKey(month, 1))} aria-label="다음 달"><ChevronRight size={17} /></button>
                {month !== currentMonth && <button type="button" className="sup-this-month" onClick={() => setMonth(currentMonth)}>이번 달</button>}
              </div>
              <div className="sales-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
              <div className="sup-calendar">
                {cells.map((date, index) => {
                  if (!date) return <span key={`blank-${index}`} className="sup-cal-cell is-blank" aria-hidden="true" />;
                  const item = dayMap.get(date);
                  const payout = payoutMap.get(date);
                  const isToday = date === view.today;
                  const weekday = weekdayOf(date);
                  const labelParts = [dayLabel(date)];
                  if (item?.saleAmount) labelParts.push(`판매 ${won(item.saleAmount)}`);
                  if (item?.returnAmount) labelParts.push(`반품 ${won(item.returnAmount)}`);
                  if (payout) labelParts.push(payout.first ? `정산 입금 ${won(payout.payout.amount)}` : "정산 입금 기간");
                  return (
                    <button
                      key={date}
                      type="button"
                      className={`sup-cal-cell ${isToday ? "is-today" : ""} ${selected === date ? "is-selected" : ""} ${payout ? "is-payout" : ""} ${weekday === 0 ? "is-sunday" : weekday === 6 ? "is-saturday" : ""}`}
                      onClick={() => setSelected(date)}
                      aria-pressed={selected === date}
                      aria-label={labelParts.join(", ")}
                    >
                      <b>{Number(date.slice(-2))}{isToday && <em>오늘</em>}</b>
                      {item && item.saleAmount > 0 && <strong><span className="sup-full">{won(item.saleAmount)}</span><span className="sup-compact">{compactWon(item.saleAmount)}</span></strong>}
                      {item && item.returnAmount > 0 && <small className="is-return">반품 <span className="sup-full">{won(item.returnAmount)}</span><span className="sup-compact">{compactWon(item.returnAmount)}</span></small>}
                      {item && item.orderCount > 0 && <small className="sup-full">{item.orderCount}건 · {item.saleQuantity}개</small>}
                      {payout && (
                        <span className={`sup-cal-payout ${payout.payout.done ? "is-done" : ""}`}>
                          <em>{payout.first ? "입금" : <>입금<span className="sup-full"> 기간</span></>}</em>
                          {payout.first && payout.payout.amount > 0 && <span className="sup-full">{won(payout.payout.amount)}</span>}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="sup-calendar-legend"><span className="is-sale">판매</span><span className="is-return">반품</span><span className="is-payout">정산 입금일</span><span className="is-today">오늘</span></p>
            </section>
            <aside className="sup-sales-aside">
              {selected && (
                <section className="admin-card sup-day-card" aria-live="polite">
                  <h2>{dayLabel(selected)}</h2>
                  {selectedDay ? (
                    <dl className="sup-money-list">
                      <div><dt>판매 금액</dt><dd>{won(selectedDay.saleAmount)}</dd></div>
                      <div><dt>주문 · 수량</dt><dd>{selectedDay.orderCount}건 · {selectedDay.saleQuantity}개</dd></div>
                      <div><dt>반품</dt><dd className={selectedDay.returnAmount ? "is-return" : ""}>{selectedDay.returnAmount ? `-${won(selectedDay.returnAmount)} (${selectedDay.returnQuantity}개)` : "없음"}</dd></div>
                      <div className="is-total"><dt>순매출</dt><dd>{won(selectedDay.netAmount)}</dd></div>
                    </dl>
                  ) : <p className="sup-muted-text">이 날 판매·반품 내역이 없어요.</p>}
                  {selectedPayout && (
                    <div className={`sup-day-payout ${selectedPayout.payout.done ? "is-done" : ""}`}>
                      <Banknote size={17} aria-hidden="true" />
                      <div>
                        <strong>{selectedPayout.first ? "정산 입금일" : "정산 입금 기간"} · {formatPayoutLabel({ payoutStart: selectedPayout.payout.date, payoutEnd: selectedPayout.payout.endDate })}</strong>
                        <span>{formatPeriodLabel({ start: selectedPayout.payout.periodStart, end: selectedPayout.payout.periodEnd })} 판매분 {selectedPayout.payout.amount > 0 ? won(selectedPayout.payout.amount) : "없음"} · {selectedPayout.payout.done ? "지난 정산" : "입금 예정"}</span>
                      </div>
                    </div>
                  )}
                </section>
              )}
              <section className="admin-card sup-settle-card">
                <div className="card-heading"><Banknote size={19} aria-hidden="true" /><div><h2>{monthLabel(month)} 판매분 정산</h2><p>{SUPPLIER_CYCLE_LABELS[cycle]} · 수수료 {rate}%</p></div></div>
                <div className="sup-settle-list">
                  {view.settlements.map((settlement) => (
                    <article key={settlement.start}>
                      <div className="sup-settle-head"><span>{formatPeriodLabel(settlement)} 판매분</span><strong>{formatPayoutLabel(settlement)} 입금</strong></div>
                      <dl className="sup-money-list">
                        <div><dt>판매 대금(100%)</dt><dd>{won(settlement.payoutAmount)}</dd></div>
                        <div><dt>수수료({rate}%)</dt><dd>{settlement.commission ? `-${won(settlement.commission)}` : "0원"}</dd></div>
                        <div className="is-total"><dt>실 수령 예상</dt><dd>{won(settlement.netIncome)}</dd></div>
                      </dl>
                    </article>
                  ))}
                </div>
                <p className="sup-card-note">{cycleDescription(cycle, rate)}</p>
              </section>
              {view.payoutDays.length > 0 && (
                <section className="admin-card sup-payout-card">
                  <h2>{monthLabel(month)} 입금 일정</h2>
                  <ul>
                    {view.payoutDays.map((payout) => (
                      <li key={payout.date} className={payout.done ? "is-done" : ""}>
                        <b>{formatPayoutLabel({ payoutStart: payout.date, payoutEnd: payout.endDate })}</b>
                        <span>{formatPeriodLabel({ start: payout.periodStart, end: payout.periodEnd })} 판매분</span>
                        <strong>{payout.amount > 0 ? won(payout.amount) : "판매 없음"}</strong>
                        <em>{payout.done ? "지난 정산" : "입금 예정"}</em>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </aside>
          </div>
          <section className="admin-card sup-ranking-card">
            <div className="card-heading"><Trophy size={19} aria-hidden="true" /><div><h2>{monthLabel(month)} 상품 판매 순위</h2><p>순매출(판매 − 반품)이 큰 순서예요.</p></div></div>
            {view.ranking.length === 0 ? (
              <div className="sales-empty"><Trophy size={28} /><strong>이 달 판매 내역이 없어요.</strong><p>판매가 들어오면 가장 잘 팔린 상품부터 순위가 보여요.</p></div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table stackable-table sup-ranking-table">
                  <thead><tr><th>순위</th><th>상품</th><th>판매</th><th>반품</th><th>순매출</th></tr></thead>
                  <tbody>
                    {view.ranking.map((item, index) => (
                      <tr key={`${item.productId ?? item.productCode ?? item.productName}`}>
                        <td data-label="순위"><b className={`supplier-rank rank-${Math.min(index + 1, 3)}`}>{index + 1}위</b></td>
                        <td data-label="상품" className="stack-wide"><strong>{item.productName}</strong>{item.productCode && <small>{item.productCode}</small>}</td>
                        <td data-label="판매">{won(item.amount)}<small>{item.quantity.toLocaleString("ko-KR")}개</small></td>
                        <td data-label="반품" className={item.returnAmount ? "is-return" : ""}>{item.returnAmount ? `-${won(item.returnAmount)}` : "-"}{item.returnQuantity > 0 && <small>{item.returnQuantity.toLocaleString("ko-KR")}개</small>}</td>
                        <td data-label="순매출"><b className="sup-money">{won(item.netAmount)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {view.ranking.length > 0 && (
              <ol className="sup-rank-list sup-rank-mobile">
                {view.ranking.map((item, index) => (
                  <li key={`${item.productId ?? item.productCode ?? item.productName}`}>
                    <b className={`supplier-rank rank-${Math.min(index + 1, 3)}`}>{index + 1}위</b>
                    <strong>{item.productName}<small>판매 {count(item.quantity)}{item.returnQuantity ? ` · 반품 ${count(item.returnQuantity)}` : ""}</small></strong>
                    <span>{won(item.netAmount)}<small>{item.returnAmount ? `반품 -${won(item.returnAmount)}` : `순매출`}</small></span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </>
  );
}
