// 관리자 > 판매 현황(2026-11-23, 관리자 요청 "1차 개발"): 발주오라에서 불러온 판매로 오늘 잘 팔린 상품, 기간 TOP 10,
// 공급사·카테고리·매출처(셀러) 순위를 봅니다. 주문대기(입금 전)·취소·삭제는 매출에서 빼고, 취소·반품 수량은 뺀 수량으로 셉니다.
// 2026-11-24: 화면 조각을 sales-widgets.tsx로 옮겨 운영 홈과 같이 씁니다(막대 금액 말풍선·상품 썸네일·TOP 10 큰 글씨).
import { useCallback, useEffect, useState } from "react";
import { BarChart3, CalendarDays, Info, Package, Store, Tags, Users } from "lucide-react";
import { toast } from "sonner";
import { seoulDateKey } from "@repo/shared/supplier-portal";
import { apiFetch } from "@/lib/api";
import { SalesSyncCard, readData, won } from "./sales-admin-shared";
import { BuyerRankList, CategoryRankList, DailySalesChart, SalesKpiCards, SupplierRankList, TodayTopCard, TopProductsTable, salesRangeFor, type SalesPreset, type SalesSummary } from "./sales-widgets";
import "./sales-admin.css";

const PRESETS: Array<{ key: SalesPreset; label: string }> = [
  { key: "today", label: "오늘" },
  { key: "yesterday", label: "어제" },
  { key: "week", label: "이번 주" },
  { key: "month", label: "이번 달" },
  { key: "lastMonth", label: "지난달" },
  { key: "custom", label: "직접 고르기" }
];

export function SalesDashboardAdmin() {
  const today = seoulDateKey();
  const [preset, setPreset] = useState<SalesPreset>("month");
  const [custom, setCustom] = useState(() => salesRangeFor("month", today));
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const range = preset === "custom" ? custom : salesRangeFor(preset, today);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await readData<SalesSummary>(await apiFetch(`/baljuora/admin/sales/summary?from=${range.from}&to=${range.to}`, { silent: true })));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "판매 현황을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => { void load(); }, [load]);

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
          <SalesKpiCards summary={summary} />
          {summary.pending.count > 0 && <p className="sa-notice"><Info size={15} aria-hidden="true" /><span>주문대기(입금 전) {summary.pending.count.toLocaleString("ko-KR")}줄 · {won(summary.pending.amount)}은 매출에서 뺐어요. 입금되면 다음 불러오기 때 들어옵니다.</span></p>}

          <div className="sa-grid-2">
            <TodayTopCard summary={summary} />
            <section className="admin-card sa-daily">
              <div className="card-heading"><BarChart3 size={19} aria-hidden="true" /><div><h2>날짜별 판매</h2><p>{summary.from} ~ {summary.to} · 막대에 마우스를 올리면 그날 판매 금액이 보여요</p></div></div>
              <DailySalesChart summary={summary} />
            </section>
          </div>

          <section className="admin-card sa-top10">
            <div className="card-heading"><Package size={19} aria-hidden="true" /><div><h2>상품 판매 TOP 10</h2><p>판매 금액이 큰 순서 · {summary.from === summary.to ? summary.from : `${summary.from} ~ ${summary.to}`}</p></div></div>
            <TopProductsTable summary={summary} />
          </section>

          <div className="sa-grid-3">
            <section className="admin-card">
              <div className="card-heading"><Store size={19} aria-hidden="true" /><div><h2>공급사 순위</h2><p>공급사 제품 판매 금액</p></div></div>
              <SupplierRankList summary={summary} />
            </section>
            <section className="admin-card">
              <div className="card-heading"><Tags size={19} aria-hidden="true" /><div><h2>카테고리 순위</h2><p>DB센터 1차 카테고리 기준</p></div></div>
              <CategoryRankList summary={summary} />
            </section>
            <section className="admin-card">
              <div className="card-heading"><Users size={19} aria-hidden="true" /><div><h2>매출처(셀러) 순위</h2><p>많이 주문한 셀러</p></div></div>
              <BuyerRankList summary={summary} />
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
