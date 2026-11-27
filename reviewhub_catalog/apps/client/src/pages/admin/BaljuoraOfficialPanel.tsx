// 발주오라 대시보드 숫자(2026-11-27 관리자 신고 "주문 동기화를 최신으로 했는데 나도건강 금액이 발주오라 대시보드와 다르다 — 발주오라 102건
// 4,257,500 · DB센터 110건 385만원. 주문 동기화를 누르면 대시보드의 최근 7일 주문 현황·기간별 매출·매출처 TOP 5·상품별 매출까지 똑같이"):
// 마지막 주문 동기화 때 책갈피(1.11.0)가 읽은 발주오라 대시보드 숫자를 발주오라 화면처럼 네 칸으로 보여 주고, 칸마다 같은 기준으로 계산한
// DB센터 숫자가 같으면 ✓, 다르면 "DB센터 …"를 주황으로 붙입니다. 운영 홈 칸 '발주오라 대시보드'와 판매 현황 화면이 함께 씁니다.
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, LayoutDashboard, RefreshCw } from "lucide-react";
import type { BaljuoraDashboardView, DashboardCompare, SalesBasis } from "@repo/shared/baljuora-dashboard";
import { apiFetch } from "@/lib/api";
import { formatDateTime, readData, won } from "./sales-admin-shared";
import "./baljuora-official.css";

type RecentOurs = { from: string; to: string; total: number; orders: number; cancelled: number; byStatus: Array<{ status: string; label: string; lines: number }> };
type Calibration = { basis: SalesBasis; at: string; score: number; total: number } | null;
export type OfficialDashboardData =
  | { available: false; basis: SalesBasis; basisText: string; calibration: Calibration }
  | { available: true; today: string; view: BaljuoraDashboardView; ours: DashboardCompare; recentOurs: RecentOurs | null; basis: SalesBasis; basisText: string; calibration: Calibration };

const count = (value: number) => value.toLocaleString("ko-KR");

function Check({ official, ours, money }: { official: number | null; ours: number | null | undefined; money?: boolean }) {
  if (official === null || ours === null || ours === undefined) return null;
  if (official === ours) return <span className="bod-check is-same" title="DB센터 계산과 같아요"><CheckCircle2 size={13} aria-hidden="true" /><span className="sr-only">DB센터와 같음</span></span>;
  return <span className="bod-check is-diff">DB센터 {money ? won(ours) : count(ours)}</span>;
}

function amountText(value: number | null) {
  return value === null ? "-" : value.toLocaleString("ko-KR");
}

/** 발주오라 대시보드 숫자 칸. stamp가 바뀌면(주문 동기화가 끝남) 다시 불러옵니다. */
export function BaljuoraOfficialPanel({ stamp = 0, compact = false }: { stamp?: number; compact?: boolean }) {
  const [data, setData] = useState<OfficialDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await readData<OfficialDashboardData>(await apiFetch("/baljuora/admin/sales/official", { silent: true })));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "발주오라 대시보드 숫자를 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load, stamp]);

  const head = (
    <div className="bod-head">
      <LayoutDashboard size={18} aria-hidden="true" />
      <div>
        <h2>발주오라 대시보드</h2>
        <p>{data?.available ? `마지막 업데이트 ${formatDateTime(data.view.at)} · 주문 동기화 때 발주오라에서 그대로 읽음` : "주문 동기화 때 발주오라 대시보드 숫자를 그대로 읽어 와요"}</p>
      </div>
      <button type="button" className="bod-refresh" onClick={() => void load()} disabled={loading} aria-label="다시 불러오기"><RefreshCw size={15} className={loading ? "is-spinning" : undefined} /></button>
    </div>
  );

  if (error && !data) return <section className="admin-card bod-panel">{head}<p className="bod-empty"><AlertTriangle size={15} aria-hidden="true" /> {error}</p></section>;
  if (!data) return <section className="admin-card bod-panel">{head}<p className="bod-empty">불러오는 중…</p></section>;
  if (!data.available) {
    return (
      <section className="admin-card bod-panel">
        {head}
        <p className="bod-empty">운영 홈 <b>주문 동기화</b>를 한 번 누르면 발주오라 대시보드의 최근 7일 주문 현황·기간별 매출·매출처 TOP 5·상품별 매출이 여기 그대로 보이고, DB센터 숫자와 칸마다 맞춰 봐요.</p>
        <p className="bod-basis">DB센터 계산 기준: {data.basisText}</p>
      </section>
    );
  }
  const { view, ours, recentOurs } = data;
  const recentOurByKey = new Map<string, number>((recentOurs?.byStatus ?? []).map((item) => [item.status, item.lines]));
  if (recentOurs) {
    recentOurByKey.set("total", recentOurs.total);
    recentOurByKey.set("cancelled", recentOurs.cancelled);
  }
  const unread = [
    !view.recentOrders && "최근 7일간 주문 현황",
    !view.periods && "기간별 매출",
    !view.topSellers && "매출처 TOP",
    !view.topProducts && "상품별 매출"
  ].filter(Boolean) as string[];
  const sellers = ours.sellers.slice(0, compact ? 5 : 10);
  const products = ours.products.slice(0, compact ? 5 : 10);
  return (
    <section className={`admin-card bod-panel${loading ? " is-loading" : ""}`}>
      {head}
      {view.recentOrders && (
        <div className="bod-recent" aria-label="최근 7일간 주문 현황">
          <span className="bod-title">최근 7일간 주문 현황</span>
          <ul>
            {view.recentOrders.items.map((item) => (
              <li key={item.key} className={item.key === "total" ? "is-total" : item.key === "cancelled" || item.key === "returned" || item.key === "exchanged" ? "is-cs" : undefined}>
                <em>{item.label}</em><b>{count(item.count)}</b><Check official={item.count} ours={recentOurByKey.get(item.key)} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="bod-grid">
        {view.periods && (
          <div className="bod-block">
            <span className="bod-title">기간별 매출 <small>주문일자 기준 · 배송비 포함</small></span>
            <table className="bod-table">
              <thead><tr><th>구분</th><th>매출</th><th>매입</th><th>마진</th></tr></thead>
              <tbody>
                {ours.periods.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">{row.label}</th>
                    <td><b>{amountText(row.sales)}</b><Check official={row.sales} ours={row.ours.sales} money /></td>
                    <td><b>{amountText(row.purchase)}</b><Check official={row.purchase} ours={row.ours.purchase} money /></td>
                    <td><b>{amountText(row.margin)}</b><Check official={row.margin} ours={row.ours.margin} money /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {view.topSellers && (
          <div className="bod-block">
            <span className="bod-title">매출처 TOP {view.topSellers.rows.length} {view.topSellers.period.label} <small>배송비 포함</small></span>
            <ol className="bod-rank">
              {sellers.map((row, index) => (
                <li key={`${row.name}-${index}`}>
                  <span className="bod-no">{index + 1}</span>
                  <strong>{row.name}</strong>
                  <span className="bod-num"><em>주문</em><b>{row.orders === null ? "-" : `${count(row.orders)}건`}</b><Check official={row.orders} ours={row.ours ? row.ours.orders : 0} /></span>
                  <span className="bod-num is-amount"><b>{amountText(row.amount)}</b><Check official={row.amount} ours={row.ours ? row.ours.amount : 0} money /></span>
                </li>
              ))}
            </ol>
          </div>
        )}
        {view.topProducts && (
          <div className="bod-block">
            <span className="bod-title">상품별 매출 {view.topProducts.period.label} <small>배송비 포함</small></span>
            <ol className="bod-rank is-products">
              {products.map((row, index) => (
                <li key={`${row.name}-${index}`}>
                  <span className="bod-no">{index + 1}</span>
                  <strong>{row.name}</strong>
                  <span className="bod-num"><em>판매량</em><b>{row.quantity === null ? "-" : count(row.quantity)}</b><Check official={row.quantity} ours={row.ours ? row.ours.quantity : 0} /></span>
                  <span className="bod-num is-amount"><b>{amountText(row.amount)}</b><Check official={row.amount} ours={row.ours ? row.ours.amount : 0} money /></span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      {(unread.length > 0 || view.errors.length > 0) && (
        <p className="bod-warn"><AlertTriangle size={14} aria-hidden="true" /> {unread.length > 0 ? `${unread.join("·")}은(는) 발주오라 응답을 아직 읽지 못했어요.` : ""}{view.errors.length > 0 ? ` 발주오라 응답 오류 ${view.errors.length}건(${view.errors.map((item) => item.status || "연결").join(", ")}).` : ""} 다음 주문 동기화 때 다시 읽어요.</p>
      )}
      <p className="bod-basis">DB센터 계산 기준: {data.basisText}{data.calibration ? ` · 발주오라 숫자 ${count(data.calibration.total)}개 중 ${count(data.calibration.score)}개와 같은 기준으로 맞춤(${formatDateTime(data.calibration.at)})` : ""} · ✓ = DB센터 계산과 같음, 주황 = DB센터 계산이 다름(주문 동기화를 다시 누르면 맞춰져요)</p>
    </section>
  );
}
