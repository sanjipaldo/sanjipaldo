// 농축수산 백과사전 화면(홈·시즌 캘린더·첫 상품 찾기·내 후보·상세) 공용: 바탕 틀, 하트 버튼, 품목 카드.
// 맨 위 "농축수산 | 건강식품" 전환과 복사·화면 폭 도구는 encyclopedia-frame.tsx(건강식품 백과사전과 공용)에 있습니다.
import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { LEVEL_LABELS, type ProduceItem } from "@/lib/encyclopedia";
import { EncyclopediaFrame } from "./encyclopedia-frame";
import { EncyclopediaTabs, PhaseBadge, ProduceThumb, Stars, StockBadge, seasonSummary } from "./encyclopedia-ui";

export { copyText, useMediaQuery } from "./encyclopedia-frame";

export function EncyclopediaLayout({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <EncyclopediaFrame
      kind="produce"
      tabs={<EncyclopediaTabs />}
      note="시기·산지 정보는 두고푸드가 정리한 참고 자료예요. 지역·날씨·품종에 따라 해마다 달라질 수 있으니 판매 전에 산지에 꼭 확인해 주세요."
      className={className}
    >
      {children}
    </EncyclopediaFrame>
  );
}

export function FavoriteButton({ item, favorite, onToggle, withLabel = false }: { item: ProduceItem; favorite: boolean; onToggle: (id: string) => boolean; withLabel?: boolean }) {
  return (
    <button
      type="button"
      className={`${withLabel ? "produce-candidate" : "produce-fav"}${favorite ? " active" : ""}`}
      aria-pressed={favorite}
      aria-label={withLabel ? undefined : favorite ? `${item.name} 내 후보에서 빼기` : `${item.name} 내 후보에 담기`}
      onClick={(event) => {
        event.preventDefault();
        const added = onToggle(item.id);
        toast.success(added ? `${item.name}을(를) 내 후보에 담았어요.` : `${item.name}을(를) 내 후보에서 뺐어요.`);
      }}
    >
      <Heart size={withLabel ? 17 : 18} fill={favorite ? "currentColor" : "none"} aria-hidden="true" />
      {withLabel && (favorite ? "내 후보에 담김" : "내 후보에 담기")}
    </button>
  );
}

export function ProduceCard({ item, month, doogoCount, loading, favorite, onToggle }: { item: ProduceItem; month: number; doogoCount: number; loading: boolean; favorite: boolean; onToggle: (id: string) => boolean }) {
  return (
    <article className="produce-card">
      <Link to={`/encyclopedia/${item.id}`} className="produce-card-link">
        <div className="produce-card-thumb">
          <ProduceThumb item={item} />
          <PhaseBadge item={item} month={month} />
        </div>
        <div className="produce-card-body">
          <small>{item.category} › {item.group}</small>
          <strong>{item.name}</strong>
          <span className="produce-card-level"><Stars level={item.level} /> {LEVEL_LABELS[item.level]}</span>
          <p>{seasonSummary(item)}</p>
          <StockBadge count={doogoCount} loading={loading} />
        </div>
      </Link>
      <FavoriteButton item={item} favorite={favorite} onToggle={onToggle} />
    </article>
  );
}

// 1~12월 고르기 버튼(이번 달 표시). 휴대폰에서는 가로로 넘기고 고른 달을 가운데로 옮깁니다.
export function MonthPicker({ month, currentMonth, onPick }: { month: number; currentMonth: number; onPick: (month: number) => void }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const active = container?.querySelector<HTMLElement>("button.active");
    if (!container || !active || container.scrollWidth <= container.clientWidth) return;
    container.scrollLeft = active.offsetLeft - (container.clientWidth - active.offsetWidth) / 2;
  }, [container, month]);
  return (
    <div className="encyclopedia-months" role="group" aria-label="달 고르기" ref={setContainer}>
      {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
        <button key={value} type="button" className={value === month ? "active" : ""} aria-pressed={value === month} onClick={() => onPick(value)}>
          {value}월{value === currentMonth && <small>이번 달</small>}
        </button>
      ))}
    </div>
  );
}

export const validMonth = (value: string | null) => {
  const month = Number(value);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
};
