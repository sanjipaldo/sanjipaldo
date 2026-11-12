// 백과사전 목록·상세·메인 홈 미리보기가 같이 쓰는 작은 부품(썸네일·시즌 막대·내 후보 저장).
import { useCallback, useEffect, useState } from "react";
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

const PHASE_CLASS: Record<SeasonPhase, string> = { K: "peak", H: "harvest", E: "ending", S: "storage", P: "prep", "-": "off" };
export const phaseClass = (phase: SeasonPhase) => PHASE_CLASS[phase];

// 그림 문자(이모지) 또는 글자 타일을 품목 색 바탕 위에 보여 줍니다.
export function ProduceThumb({ item, size = "md" }: { item: ProduceItem; size?: "sm" | "md" | "lg" }) {
  const glyph = !item.emoji && item.glyph ? item.glyph : null;
  return (
    <span className={`produce-thumb tone-${produceTone(item)} size-${size}`} aria-hidden="true">
      {glyph ? <b className={`produce-glyph len-${Math.min(glyph.length, 3)}`}>{glyph}</b> : <span className="produce-emoji">{item.emoji}</span>}
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
      <ul className="season-legend">
        {LEGEND.map((phase) => <li key={phase}><i className={`phase-${phaseClass(phase)}`} aria-hidden="true" />{PHASE_META[phase].label}</li>)}
        <li><i className="phase-off" aria-hidden="true" />{PHASE_META["-"].label}</li>
      </ul>
    </div>
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

// 농산·수산·선물세트 같은 신선 카테고리 상품만(건강식품 "레몬 ○○" 등 제외)
export function freshProducts<T extends { categoryId: string }>(products: T[], categories: Array<{ id: string; name: string }>) {
  const nameById = new Map(categories.map((category) => [category.id, category.name]));
  return products.filter((product) => isFreshCategoryName(nameById.get(product.categoryId)));
}

// 내 후보(하트): 이 기기 브라우저에만 저장합니다. 저장이 막힌 브라우저에서도 화면 안에서는 동작합니다.
const FAVORITES_KEY = "doogo:encyclopedia:favorites";
const FAVORITES_EVENT = "doogo:encyclopedia-favorites";
let memoryFavorites: string[] | null = null;

function readFavorites(): string[] {
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    if (raw === null) return memoryFavorites ?? [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return memoryFavorites ?? [];
  }
}

export function useFavoriteProduce() {
  const [favorites, setFavorites] = useState<string[]>(readFavorites);
  useEffect(() => {
    const sync = () => setFavorites(readFavorites());
    const onStorage = (event: StorageEvent) => { if (event.key === FAVORITES_KEY) sync(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener(FAVORITES_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(FAVORITES_EVENT, sync);
    };
  }, []);
  const toggle = useCallback((id: string) => {
    const current = readFavorites();
    const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
    memoryFavorites = next;
    try {
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
    } catch {
      // 저장이 막힌 브라우저(사생활 보호 모드 등): 이번 방문 동안만 기억합니다.
    }
    setFavorites(next);
    window.dispatchEvent(new Event(FAVORITES_EVENT));
    return next.includes(id);
  }, []);
  return { favorites, toggle };
}
