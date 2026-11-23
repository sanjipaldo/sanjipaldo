// 관리자 > 판매 현황(2026-11-23, 관리자 요청 "1차 개발"): 발주오라에서 불러온 판매로 오늘 잘 팔린 상품, 기간 TOP 10,
// 공급사·카테고리·매출처(셀러) 순위를 봅니다. 주문대기(입금 전)·취소·삭제는 매출에서 빼고, 취소·반품 수량은 뺀 수량으로 셉니다.
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, Crown, Info, Package, Store, Tags, Users } from "lucide-react";
import { toast } from "sonner";
import { addDays, monthRange, nextMonthKey, seoulDateKey, weekdayOf } from "@repo/shared/supplier-portal";
import { apiFetch } from "@/lib/api";
import { SalesSyncCard, compactWon, percent, readData, won, type SalesSyncState } from "./sales-admin-shared";
import "./sales-admin.css";

type Totals = { amount: number; quantity: number; orders: number; buyers: number; cost: number; returnAmount: number; lines: number };
type ProductRank = { key: string; productId: string | null; name: string; supplierName: string | null; categoryName: string; amount: number; quantity: number; orders: number };
type Summary = {
  from: string;
  to: string;
  today: string;
  hasData: boolean;
  totals: Totals;
  previous: { from: string; to: string; amount: number; orders: number };
  pending: { count: number; amount: number };
  todaySales: { totals: Totals; topProducts: ProductRank[] };
  daily: Array<{ date: string; amount: number; orders: number; quantity: number }>;
  topProducts: ProductRank[];
  topSuppliers: Array<{ name: string; amount: number; quantity: number; products: number }>;
  categories: Array<{ categoryId: string | null; categoryName: string; amount: number; quantity: number }>;
  topBuyers: Array<{ key: string; name: string; amount: number; orders: number; quantity: number }>;
  sync: SalesSyncState;
};

type Preset = "today" | "yesterday" | "week" | "month" | "lastMonth" | "custom";
const PRESETS: Array<{ key: Preset; label: string }> = [
  { key: "today", label: "오늘" },
  { key: "yesterday", label: "어제" },
  { key: "week", label: "이번 주" },
  { key: "month", label: "이번 달" },
  { key: "lastMonth", label: "지난달" },
  { key: "custom", label: "직접 고르기" }
];

function rangeFor(preset: Preset, today: string) {
  if (preset === "today") return { from: today, to: today };
  if (preset === "yesterday") return { from: addDays(today, -1), to: addDays(today, -1) };
  if (preset === "week") return { from: addDays(today, -((weekdayOf(today) + 6) % 7)), to: today };
  if (preset === "lastMonth") {
    const range = monthRange(nextMonthKey(today.slice(0, 7), -1));
    return { from: range.start, to: range.end };
  }
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

function Change({ now, before }: { now: number; before: number }) {
  if (!before) return <small>이전 기간 판매 없음</small>;
  const change = Math.round(((now - before) / before) * 1000) / 10;
  return <small className={change >= 0 ? "sa-up" : "sa-down"}>이전 같은 기간보다 {change >= 0 ? "▲" : "▼"} {Math.abs(change)}%</small>;
}

function ShareBar({ value, total }: { value: number; total: number }) {
  const share = percent(value, total);
  return <span className="sa-share" aria-label={`비중 ${share}%`}><i style={{ width: `${Math.max(2, Math.min(100, share))}%` }} /><em>{share}%</em></span>;
}

export function SalesDashboardAdmin() {
  const today = seoulDateKey();
  const [preset, setPreset] = useState<Preset>("month");
  const [custom, setCustom] = useState(() => rangeFor("month", today));
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const range = preset === "custom" ? custom : rangeFor(preset, today);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await readData<Summary>(await apiFetch(`/baljuora/admin/sales/summary?from=${range.from}&to=${range.to}`, { silent: true })));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "판매 현황을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => { void load(); }, [load]);

  const maxDaily = useMemo(() => Math.max(1, ...(summary?.daily ?? []).map((day) => day.amount)), [summary]);
  const totals = summary?.totals;
  const margin = totals ? totals.amount - totals.cost : 0;
  const days = useMemo(() => {
    if (!summary) return [];
    const byDate = new Map(summary.daily.map((day) => [day.date, day]));
    const list: Array<{ date: string; amount: number; orders: number }> = [];
    for (let date = summary.from; date <= summary.to && list.length < 120; date = addDays(date, 1)) list.push({ date, amount: byDate.get(date)?.amount ?? 0, orders: byDate.get(date)?.orders ?? 0 });
    return list;
  }, [summary]);

  return (
    <div className="sa-page">
      <div className="admin-page-heading">
        <div><span>SALES</span><h1>판매 현황</h1><p>발주오라에서 불러온 판매로 오늘 잘 팔린 상품, 기간별 TOP 10, 공급사·카테고리·매출처 순위를 봅니다.</p></div>
      </div>
      <SalesSyncCard sync={summary?.sync ?? null} onDone={() => void load()} compact />

      <div className="sa-period" role="group" aria-label="기간">
        {PRESETS.map((item) => <button key={item.key} type="button" className={preset === item.key ? "is-active" : ""} aria-pressed={preset === item.key} onClick={() => setPreset(item.key)}>{item.label}</button>)}
        {preset === "custom" ? (
          <span className="sa-period-dates">
            <input type="date" value={custom.from} max={custom.to} onChange={(event) => event.target.value && setCustom({ ...custom, from: event.target.value })} aria-label="시작일" />
            <span>~</span>
            <input type="date" value={custom.to} min={custom.from} onChange={(event) => event.target.value && setCustom({ ...custom, to: event.target.value })} aria-label="끝일" />
          </span>
        ) : <span className="sa-period-label"><CalendarDays size={15} aria-hidden="true" /> {range.from === range.to ? range.from : `${range.from} ~ ${range.to}`}</span>}
      </div>

      {!summary ? (
        <div className="admin-loading inline"><div className="spinner" /><span>판매 현황을 불러오는 중…</span></div>
      ) : !summary.hasData ? (
        <section className="admin-card sa-empty"><BarChart3 size={30} aria-hidden="true" /><strong>아직 불러온 판매가 없어요.</strong><p>위의 <b>불러오기</b>를 누르고 발주오라 관리자 창에서 책갈피를 누르면, 주문과 매출처가 들어와 판매 현황이 채워집니다.</p></section>
      ) : (
        <div className={`sa-stack ${loading ? "sa-dim" : ""}`}>
          <section className="sales-kpi-grid sa-kpi">
            <article><span>판매 금액</span><strong>{won(totals?.amount)}</strong><Change now={totals?.amount ?? 0} before={summary.previous.amount} /></article>
            <article><span>주문</span><strong>{(totals?.orders ?? 0).toLocaleString("ko-KR")}건</strong><small>상품 {(totals?.quantity ?? 0).toLocaleString("ko-KR")}개{totals?.returnAmount ? ` · 취소·반품 -${won(totals.returnAmount)}` : ""}</small></article>
            <article><span>주문한 매출처</span><strong>{(totals?.buyers ?? 0).toLocaleString("ko-KR")}곳</strong><small>셀러(매출처) 수</small></article>
            <article><span>매입원가 뺀 금액</span><strong>{won(margin)}</strong><small>{totals?.amount ? `판매 금액의 ${percent(margin, totals.amount)}% · 매입원가가 있는 줄 기준` : "판매 없음"}</small></article>
          </section>
          {summary.pending.count > 0 && <p className="sa-notice"><Info size={15} aria-hidden="true" /><span>주문대기(입금 전) {summary.pending.count.toLocaleString("ko-KR")}줄 · {won(summary.pending.amount)}은 매출에서 뺐어요. 입금되면 다음 불러오기 때 들어옵니다.</span></p>}

          <div className="sa-grid-2">
            <section className="admin-card sa-today">
              <div className="card-heading"><Crown size={19} aria-hidden="true" /><div><h2>오늘 잘 팔린 상품</h2><p>{summary.today} · 판매 {won(summary.todaySales.totals.amount)} · 주문 {summary.todaySales.totals.orders.toLocaleString("ko-KR")}건</p></div></div>
              {summary.todaySales.topProducts.length === 0 ? <p className="sa-muted">오늘 들어온 판매가 아직 없어요. (불러온 뒤의 주문만 보여요)</p> : (
                <ol className="sa-rank-list">
                  {summary.todaySales.topProducts.map((item, index) => (
                    <li key={item.key}><b className={`sa-rank rank-${Math.min(index + 1, 4)}`}>{index + 1}</b><span><strong>{item.name}</strong><small>{item.supplierName ?? "공급사 미지정"} · {item.quantity.toLocaleString("ko-KR")}개</small></span><em>{won(item.amount)}</em></li>
                  ))}
                </ol>
              )}
            </section>
            <section className="admin-card sa-daily">
              <div className="card-heading"><BarChart3 size={19} aria-hidden="true" /><div><h2>날짜별 판매</h2><p>{summary.from} ~ {summary.to}</p></div></div>
              <div className="sa-bars" role="img" aria-label="날짜별 판매 금액 막대">
                {days.map((day) => (
                  <span key={day.date} className={day.date === summary.today ? "is-today" : ""} title={`${day.date} · ${won(day.amount)} · ${day.orders}건`}>
                    <i style={{ height: `${Math.max(day.amount > 0 ? 4 : 0, (day.amount / maxDaily) * 100)}%` }} />
                    {days.length <= 31 && <em>{Number(day.date.slice(-2))}</em>}
                  </span>
                ))}
              </div>
            </section>
          </div>

          <section className="admin-card sa-top10">
            <div className="card-heading"><Package size={19} aria-hidden="true" /><div><h2>상품 판매 TOP 10</h2><p>판매 금액이 큰 순서 · {summary.from === summary.to ? summary.from : `${summary.from} ~ ${summary.to}`}</p></div></div>
            <div className="admin-table-wrap">
              <table className="admin-table stackable-table sa-table">
                <thead><tr><th>순위</th><th>상품</th><th>공급사</th><th>카테고리</th><th>수량</th><th>판매 금액</th><th>비중</th></tr></thead>
                <tbody>
                  {summary.topProducts.map((item, index) => (
                    <tr key={item.key}>
                      <td data-label="순위"><b className={`sa-rank rank-${Math.min(index + 1, 4)}`}>{index + 1}위</b></td>
                      <td data-label="상품" className="stack-wide"><strong>{item.name}</strong></td>
                      <td data-label="공급사">{item.supplierName ?? "-"}</td>
                      <td data-label="카테고리">{item.categoryName}</td>
                      <td data-label="수량">{item.quantity.toLocaleString("ko-KR")}개<small>{item.orders.toLocaleString("ko-KR")}건</small></td>
                      <td data-label="판매 금액"><b>{won(item.amount)}</b></td>
                      <td data-label="비중"><ShareBar value={item.amount} total={totals?.amount ?? 0} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="sa-grid-3">
            <section className="admin-card">
              <div className="card-heading"><Store size={19} aria-hidden="true" /><div><h2>공급사 순위</h2><p>공급사 제품 판매 금액</p></div></div>
              <ol className="sa-rank-list">
                {summary.topSuppliers.map((item, index) => (
                  <li key={item.name}><b className={`sa-rank rank-${Math.min(index + 1, 4)}`}>{index + 1}</b><span><strong>{item.name}</strong><small>상품 {item.products}종 · {item.quantity.toLocaleString("ko-KR")}개</small><ShareBar value={item.amount} total={totals?.amount ?? 0} /></span><em>{compactWon(item.amount)}원</em></li>
                ))}
              </ol>
            </section>
            <section className="admin-card">
              <div className="card-heading"><Tags size={19} aria-hidden="true" /><div><h2>카테고리 순위</h2><p>DB센터 1차 카테고리 기준</p></div></div>
              <ol className="sa-rank-list">
                {summary.categories.map((item, index) => (
                  <li key={item.categoryId ?? "none"}><b className={`sa-rank rank-${Math.min(index + 1, 4)}`}>{index + 1}</b><span><strong>{item.categoryName}</strong><small>{item.quantity.toLocaleString("ko-KR")}개</small><ShareBar value={item.amount} total={totals?.amount ?? 0} /></span><em>{compactWon(item.amount)}원</em></li>
                ))}
              </ol>
            </section>
            <section className="admin-card">
              <div className="card-heading"><Users size={19} aria-hidden="true" /><div><h2>매출처(셀러) 순위</h2><p>많이 주문한 셀러</p></div></div>
              <ol className="sa-rank-list">
                {summary.topBuyers.map((item, index) => (
                  <li key={item.key}><b className={`sa-rank rank-${Math.min(index + 1, 4)}`}>{index + 1}</b><span><strong>{item.name}</strong><small>주문 {item.orders.toLocaleString("ko-KR")}건 · {item.quantity.toLocaleString("ko-KR")}개</small><ShareBar value={item.amount} total={totals?.amount ?? 0} /></span><em>{compactWon(item.amount)}원</em></li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
