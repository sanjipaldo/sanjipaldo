// 백과사전 화면들(홈·시즌 캘린더·첫 상품 찾기·내 후보·상세)과 메인 홈 미리보기가 같이 쓰는 작은 부품.
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { CalendarDays, Heart, Home, Search, Store } from "lucide-react";
import {
  PHASE_META,
  formatMonthRange,
  isFreshCategoryName,
  peakMonths,
  phaseOf,
  produceTone,
  salesMonths,
  seasonPhases,
  type ProduceItem,
  type SeasonPhase
} from "@/lib/encyclopedia";
import { pullSyncedOnce, toggleFavorite, useEncyclopediaStore } from "@/lib/encyclopedia-store";

const PHASE_CLASS: Record<SeasonPhase, string> = { K: "peak", H: "harvest", E: "ending", S: "storage", P: "prep", "-": "off" };
export const phaseClass = (phase: SeasonPhase) => PHASE_CLASS[phase];

// 그림 문자(이모지) 또는 글자 타일을 품목 색 바탕 위에 보여 줍니다.
export function ProduceThumb({ item, size = "md" }: { item: ProduceItem; size?: "sm" | "md" | "lg" }) {
  const glyph = !item.emoji && item.glyph ? item.glyph : null;
  return (
    <span className={`produce-thumb tone-${produceTone(item)} size-${size}`} aria-hidden="true">
      {glyph ? <b className={`produce-glyph len-${Math.min(glyph.length, 4)}`}>{glyph}</b> : <span className="produce-emoji">{item.emoji}</span>}
    </span>
  );
}

export function PhaseBadge({ item, month }: { item: ProduceItem; month: number }) {
  const phase = phaseOf(item, month);
  return <span className={`produce-phase phase-${phaseClass(phase)}`}>{month}월 · {PHASE_META[phase].label}</span>;
}

export function Stars({ level }: { level: number }) {
  return (
    <span className="produce-stars" role="img" aria-label={`추천도 5점 중 ${level}점`}>
      {"★".repeat(level)}<i>{"★".repeat(5 - level)}</i>
    </span>
  );
}

// 두고푸드 보유 여부(도매몰에서 바로 받을 수 있는 상품 수)
export function StockBadge({ count, loading = false, compact = false }: { count: number; loading?: boolean; compact?: boolean }) {
  if (loading) return null;
  return count > 0
    ? <span className="produce-stock is-in"><Store size={compact ? 12 : 13} aria-hidden="true" /> 두고푸드 보유 {count}개</span>
    : <span className="produce-stock is-out">두고푸드 미보유</span>;
}

export function TagChips({ item, limit = 3 }: { item: ProduceItem; limit?: number }) {
  if (!item.tags?.length) return null;
  return <span className="produce-tags">{item.tags.slice(0, limit).map((tag) => <i key={tag}>{tag}</i>)}</span>;
}

export function seasonSummary(item: ProduceItem) {
  const peaks = peakMonths(item);
  return `판매 ${formatMonthRange(salesMonths(item))} · 성수기 ${peaks.length > 0 ? formatMonthRange(peaks) : "연중 고르게"}`;
}

// 1년 시즌 흐름: 12칸 막대 + 이번 달 표시 + 범례
const LEGEND: SeasonPhase[] = ["S", "E", "P", "H", "K"];
export function SeasonBar({ item, month }: { item: ProduceItem; month: number }) {
  const phases = seasonPhases(item);
  return (
    <div className="season-flow">
      <ol className="season-flow-bar" aria-label={`${item.name} 1년 시즌 흐름`}>
        {phases.map((phase, index) => (
          <li key={index} className={`phase-${phaseClass(phase)}${index + 1 === month ? " current" : ""}`} title={`${index + 1}월 · ${PHASE_META[phase].label}`}>
            <span className="sr-only">{index + 1}월 {PHASE_META[phase].label}</span>
            <b aria-hidden="true">{index + 1}</b>
            {index + 1 === month && <em aria-hidden="true">이번 달</em>}
          </li>
        ))}
      </ol>
      <SeasonLegend />
    </div>
  );
}

export function SeasonLegend() {
  return (
    <ul className="season-legend">
      {LEGEND.map((phase) => <li key={phase}><i className={`phase-${phaseClass(phase)}`} aria-hidden="true" />{PHASE_META[phase].label}</li>)}
      <li><i className="phase-off" aria-hidden="true" />{PHASE_META["-"].label}</li>
    </ul>
  );
}

// 시즌 캘린더 줄의 작은 12칸 막대(기준 달에 세로선)
export function MiniSeasonBar({ item, month }: { item: ProduceItem; month: number }) {
  const phases = seasonPhases(item);
  return (
    <span className="mini-season" aria-hidden="true">
      {phases.map((phase, index) => <i key={index} className={`phase-${phaseClass(phase)}${index + 1 === month ? " current" : ""}`} />)}
    </span>
  );
}

// 한국 시간 기준 이번 달(자정·월말이 지나면 바뀜)
export function seoulMonthNow() {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", month: "numeric" }).format(new Date()));
}

export function useSeoulMonth() {
  const [month, setMonth] = useState(seoulMonthNow);
  useEffect(() => {
    const timer = window.setInterval(() => setMonth(seoulMonthNow()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);
  return month;
}

// 농산·수산·선물세트 같은 신선 카테고리 상품만(건강식품 "레몬 ○○" 등 제외) — 메인 홈 미리보기용
export function freshProducts<T extends { categoryId: string }>(products: T[], categories: Array<{ id: string; name: string }>) {
  const nameById = new Map(categories.map((category) => [category.id, category.name]));
  return products.filter((product) => isFreshCategoryName(nameById.get(product.categoryId)));
}

// 내 후보(하트) + 체크리스트: 기기 저장 + 기기 옮기기 코드가 있으면 서버에도 저장
export function useFavoriteProduce() {
  const store = useEncyclopediaStore();
  useEffect(() => { pullSyncedOnce(); }, []);
  return { favorites: store.favorites, toggle: toggleFavorite };
}

// 백과사전 안 메뉴: 홈 · 시즌 캘린더 · 첫 상품 찾기 · 내 후보(개수)
export function EncyclopediaTabs() {
  const { favorites } = useFavoriteProduce();
  const link = ({ isActive }: { isActive: boolean }) => (isActive ? "active" : "");
  return (
    // 바깥 띠(.encyclopedia-tabs-bar)가 위에 고정되며 흰 바탕으로 아래 내용을 가립니다(메뉴 둘레로 내용이 비치지 않게).
    <div className="encyclopedia-tabs-bar">
      <nav className="encyclopedia-tabs" aria-label="백과사전 메뉴">
        <NavLink to="/encyclopedia" end className={link}><Home size={16} aria-hidden="true" /><span>홈</span></NavLink>
        <NavLink to="/encyclopedia/calendar" className={link}><CalendarDays size={16} aria-hidden="true" /><span>시즌 캘린더</span></NavLink>
        <NavLink to="/encyclopedia/finder" className={link}><Search size={16} aria-hidden="true" /><span>첫 상품 찾기</span></NavLink>
        <NavLink to="/encyclopedia/favorites" className={link}><Heart size={16} aria-hidden="true" /><span>내 후보 <b>{favorites.length}</b></span></NavLink>
      </nav>
    </div>
  );
}
