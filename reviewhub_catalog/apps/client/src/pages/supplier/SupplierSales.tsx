// 공급사 센터 > 판매·정산: 날짜별 판매·반품 달력, 정산 입금일, 상품 판매 순위(썸네일).
// 2026-11-25부터 정산 방식(판매수수료 · 일반 도매)에 따라 금액이 바뀝니다: 판매수수료 = 판매 금액, 일반 도매 = 공급가(원가) × 수량.
// 정산 입금 = 물품 대금 + 배송비(100%), 판매수수료 방식은 한 달 판매 대금의 수수료를 다음 달 1~3일에 두고푸드로 보냅니다.
import { useEffect, useMemo, useState } from "react";
import { BadgePercent, Banknote, CalendarDays, ChevronLeft, ChevronRight, CircleAlert, ShieldAlert, Trophy } from "lucide-react";
import {
  SUPPLIER_RETURN_POLICY,
  addDays,
  formatPayoutLabel,
  formatPeriodLabel,
  monthRange,
  nextMonthKey,
  seoulDateKey,
  settlementPlanText,
  settlementSettingsLabel,
  weekdayOf,
  type SupplierSettlementSettings
} from "@repo/shared/supplier-portal";
import { SalesThumb } from "../admin/sales-widgets";
import "../admin/sales-admin.css";
import { compactWon, count, dayLabel, monthLabel, supplierGet, won, type SalesMonth } from "./supplier-api";
import { FeeList, FeeStatus, PayoutStatus, SettlementMoneyList, feeDueMap, feePayable } from "./supplier-dashboard";

type PayoutDay = SalesMonth["payoutDays"][number];

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function defaultSelected(data: SalesMonth) {
  const { start, end } = monthRange(data.month);
  if (data.today >= start && data.today <= end) return data.today;
  const firstSale = data.days.find((day) => day.saleAmount > 0 || day.returnAmount > 0);
  if (firstSale) return firstSale.date;
  return data.payoutDays[0]?.date && data.payoutDays[0].date >= start ? data.payoutDays[0].date : start;
}

// 정산 방식(예전 서버 응답이면 주기·수수료율 + 판매수수료 방식)
function settingsOf(view: SalesMonth | null): SupplierSettlementSettings {
  return view?.settings ?? { type: view?.type ?? "commission", commissionRate: view?.commissionRate ?? 10, cycle: view?.cycle ?? "weekly" };
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
  const totals = view?.totals;
  const settings = settingsOf(view);
  const rate = settings.commissionRate;
  const commission = settings.type === "commission";
  // 판매 수수료 입금일(공급사 → 두고푸드): 그 달 1~3일 = 지난달 판매분 수수료
  const feeMap = useMemo(() => feeDueMap(commission ? view?.fees : undefined, month), [view, month, commission]);
  const selectedDay = selected ? dayMap.get(selected) : undefined;
  const selectedPayout = selected ? payoutMap.get(selected) : undefined;
  const selectedFee = selected ? feeMap.get(selected) : undefined;
  const amountLabel = commission ? "판매 금액" : "공급 금액";

  return (
    <>
      <div className="admin-page-heading">
        <div><span>SALES &amp; SETTLEMENT</span><h1>판매·정산</h1><p>날짜별 판매·반품과 정산 입금일을 달력으로 확인합니다. 날짜를 누르면 그날 내역이 보여요.</p></div>
        {view && <span className="source-status connected">{settlementSettingsLabel(settings)}</span>}
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
              <div><strong>아직 들어온 판매 내역이 없어요.</strong><p>두고푸드 주문이 들어오면 날짜별 판매·반품과 정산 금액이 자동으로 채워져요. {settlementPlanText(settings)}</p></div>
            </div>
          )}
          <section className="sales-kpi-grid sup-kpi">
            <article><span>{amountLabel}</span><strong>{won(totals?.saleAmount ?? 0)}</strong><small>{count(totals?.orderCount ?? 0, "건")} · {count(totals?.saleQuantity ?? 0)}{commission ? "" : " · 공급가 기준"}</small></article>
            <article><span>반품 금액</span><strong className={totals?.returnAmount ? "is-return" : ""}>{totals?.returnAmount ? `-${won(totals.returnAmount)}` : "0원"}</strong><small>{count(totals?.returnQuantity ?? 0)} 반품</small></article>
            <article><span>물품 대금</span><strong>{won(totals?.goodsAmount ?? totals?.netAmount ?? 0)}</strong><small>{commission ? "판매 − 반품" : "공급가 × 판매 수량"} · 배송비 {won(totals?.shippingFee ?? 0)} 별도</small></article>
            {commission ? (
              <article><span>실 수령 예상</span><strong>{won(totals?.netIncome ?? 0)}</strong><small>입금 {won(totals?.payoutAmount ?? 0)} − 수수료 {rate}% {won(totals?.commission ?? 0)}</small></article>
            ) : (
              <article><span>입금 합계</span><strong>{won(totals?.payoutAmount ?? 0)}</strong><small>물품 대금 + 배송비 · 수수료 없음</small></article>
            )}
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
                  const fee = feeMap.get(date);
                  const isToday = date === view.today;
                  const weekday = weekdayOf(date);
                  const labelParts = [dayLabel(date)];
                  if (item?.saleAmount) labelParts.push(`판매 ${won(item.saleAmount)}`);
                  if (item?.returnAmount) labelParts.push(`반품 ${won(item.returnAmount)}`);
                  if (payout) labelParts.push(payout.first ? `정산 입금 ${won(payout.payout.amount)}` : "정산 입금 기간");
                  if (fee) labelParts.push(fee.first ? `판매 수수료 ${won(feePayable(fee.fee))} 두고푸드로 입금` : "판매 수수료 입금 기간");
                  return (
                    <button
                      key={date}
                      type="button"
                      className={`sup-cal-cell ${isToday ? "is-today" : ""} ${selected === date ? "is-selected" : ""} ${payout ? "is-payout" : ""} ${fee ? "is-fee" : ""} ${weekday === 0 ? "is-sunday" : weekday === 6 ? "is-saturday" : ""}`}
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
                      {fee && (
                        <span className={`sup-cal-fee ${fee.fee.state?.status === "done" ? "is-done" : ""}`}>
                          <em>{fee.first ? "수수료" : <>수수료<span className="sup-full"> 기간</span></>}</em>
                          {fee.first && <span className="sup-full">{won(feePayable(fee.fee))}</span>}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="sup-calendar-legend"><span className="is-sale">판매</span><span className="is-return">반품</span><span className="is-payout">정산 입금일</span>{feeMap.size > 0 && <span className="is-fee">수수료 입금일(공급사 → 두고푸드)</span>}<span className="is-today">오늘</span></p>
            </section>
            <aside className="sup-sales-aside">
              {selected && (
                <section className="admin-card sup-day-card" aria-live="polite">
                  <h2>{dayLabel(selected)}</h2>
                  {selectedDay ? (
                    <dl className="sup-money-list">
                      <div><dt>{amountLabel}</dt><dd>{won(selectedDay.saleAmount)}</dd></div>
                      <div><dt>주문 · 수량</dt><dd>{selectedDay.orderCount}건 · {selectedDay.saleQuantity}개</dd></div>
                      <div><dt>반품</dt><dd className={selectedDay.returnAmount ? "is-return" : ""}>{selectedDay.returnAmount ? `-${won(selectedDay.returnAmount)} (${selectedDay.returnQuantity}개)` : "없음"}</dd></div>
                      <div className="is-total"><dt>{commission ? "순매출" : "공급 금액(반품 뺌)"}</dt><dd>{won(selectedDay.netAmount)}</dd></div>
                      {selectedDay.shippingFee ? <div><dt>배송비</dt><dd>{won(selectedDay.shippingFee)}</dd></div> : null}
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
                  {selectedFee && (
                    <div className={`sup-day-payout is-fee ${selectedFee.fee.state?.status === "done" ? "is-done" : ""}`}>
                      <BadgePercent size={17} aria-hidden="true" />
                      <div>
                        <strong>판매 수수료 입금일 · {formatPayoutLabel(selectedFee.fee)}</strong>
                        <span>{monthLabel(selectedFee.fee.month)} 판매분 수수료 {won(feePayable(selectedFee.fee))}를 두고푸드로 보내 주세요 · <FeeStatus state={selectedFee.fee.state} /></span>
                      </div>
                    </div>
                  )}
                </section>
              )}
              <section className="admin-card sup-settle-card">
                <div className="card-heading"><Banknote size={19} aria-hidden="true" /><div><h2>{monthLabel(month)} 판매분 정산</h2><p>{settlementSettingsLabel(settings)} · 자동 계산</p></div></div>
                <div className="sup-settle-list">
                  {view.settlements.map((settlement) => (
                    <article key={settlement.start}>
                      <div className="sup-settle-head"><span>{formatPeriodLabel(settlement)} 판매분</span><strong>{formatPayoutLabel(settlement)} 입금</strong></div>
                      <PayoutStatus state={settlement.state} done={settlement.payoutEnd < view.today} />
                      <SettlementMoneyList summary={settlement} settings={settings} />
                    </article>
                  ))}
                </div>
                {commission && (view.fees?.length ?? 0) > 0 && (
                  <div className="sup-fee-block">
                    <h3><BadgePercent size={16} aria-hidden="true" /> 판매 수수료 (공급사 → 두고푸드)</h3>
                    <FeeList fees={[...(view.fees ?? [])].reverse()} />
                  </div>
                )}
                <p className="sup-card-note">{settlementPlanText(settings)}</p>
                <p className="sup-policy"><ShieldAlert size={15} aria-hidden="true" /><span>{SUPPLIER_RETURN_POLICY}</span></p>
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
                        <PayoutStatus state={payout.state} done={payout.done} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </aside>
          </div>
          <section className="admin-card sup-ranking-card">
            <div className="card-heading"><Trophy size={19} aria-hidden="true" /><div><h2>{monthLabel(month)} 상품 판매 순위</h2><p>{commission ? "순매출(판매 − 반품)" : "공급 금액(공급가 × 판매 수량, 반품 뺌)"}이 큰 순서예요.</p></div></div>
            {view.ranking.length === 0 ? (
              <div className="sales-empty"><Trophy size={28} /><strong>이 달 판매 내역이 없어요.</strong><p>판매가 들어오면 가장 잘 팔린 상품부터 순위가 보여요.</p></div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table stackable-table sup-ranking-table">
                  <thead><tr><th>순위</th><th>상품</th><th>판매</th><th>반품</th><th>{commission ? "순매출" : "공급 금액"}</th></tr></thead>
                  <tbody>
                    {view.ranking.map((item, index) => (
                      <tr key={`${item.productId ?? item.productCode ?? item.productName}`}>
                        <td data-label="순위"><b className={`supplier-rank rank-${Math.min(index + 1, 3)}`}>{index + 1}위</b></td>
                        <td data-label="상품" className="stack-wide"><span className="sup-rank-product"><SalesThumb src={item.imageUrl} size={44} /><span><strong>{item.productName}</strong>{item.productCode && <small>{item.productCode}</small>}</span></span></td>
                        <td data-label="판매">{won(item.amount)}<small>{item.quantity.toLocaleString("ko-KR")}개</small></td>
                        <td data-label="반품" className={item.returnAmount ? "is-return" : ""}>{item.returnAmount ? `-${won(item.returnAmount)}` : "-"}{item.returnQuantity > 0 && <small>{item.returnQuantity.toLocaleString("ko-KR")}개</small>}</td>
                        <td data-label={commission ? "순매출" : "공급 금액"}><b className="sup-money">{won(item.netAmount)}</b></td>
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
                    <SalesThumb src={item.imageUrl} size={40} />
                    <strong>{item.productName}<small>판매 {count(item.quantity)}{item.returnQuantity ? ` · 반품 ${count(item.returnQuantity)}` : ""}</small></strong>
                    <span>{won(item.netAmount)}<small>{item.returnAmount ? `반품 -${won(item.returnAmount)}` : commission ? "순매출" : "공급 금액"}</small></span>
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
