// 메인 홈 "이번 달 제철 백과사전" 미리보기: 이번 달 성수기(모자라면 출하 중) 품목 8개와 두고푸드 공급 상품 수.
// 품목 데이터가 단가표 첫 화면을 무겁게 하지 않도록 메인 홈에서 따로(지연) 불러옵니다.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ChevronRight, Store } from "lucide-react";
import { PHASE_META, formatMonthRange, groupProductsByProduce, itemsForMonth, phaseOf, salesMonths, type ProduceItem } from "@/lib/encyclopedia";
import { ProduceThumb, phaseClass, useSeoulMonth } from "./encyclopedia-ui";

export default function EncyclopediaTeaser({ products, categories }: { products: Array<{ name: string; categoryId: string }>; categories: Array<{ id: string; name: string }> }) {
  const month = useSeoulMonth();
  const grouped = useMemo(() => groupProductsByProduce(products, new Map(categories.map((category) => [category.id, category.name]))), [products, categories]);
  const picks = useMemo(() => {
    const groups = itemsForMonth(month);
    const rank = (list: ProduceItem[]) =>
      [...list].sort((first, second) => Number(grouped.has(second.id)) - Number(grouped.has(first.id)) || second.level - first.level);
    return [...rank(groups.K), ...rank(groups.H)].slice(0, 8);
  }, [grouped, month]);
  if (picks.length === 0) return null;
  return (
    <section className="encyclopedia-teaser" aria-labelledby="encyclopedia-teaser-title">
      <div className="encyclopedia-teaser-head">
        <div className="encyclopedia-teaser-title">
          <span className="encyclopedia-teaser-icon" aria-hidden="true"><BookOpen size={24} /></span>
          <div>
            <span className="section-kicker">PRODUCE GUIDE</span>
            <h2 id="encyclopedia-teaser-title">{month}월 제철 백과사전</h2>
            <p>지금 팔기 좋은 품목의 시기·배송·CS 대비법과 두고푸드 공급가를 한눈에 보세요.</p>
          </div>
        </div>
        <Link to="/encyclopedia" className="encyclopedia-teaser-more">
          <span className="encyclopedia-teaser-more-label">백과사전</span> 전체 보기 <ChevronRight size={17} aria-hidden="true" />
        </Link>
      </div>
      <div className="encyclopedia-teaser-list">
        {picks.map((item) => {
          const phase = phaseOf(item, month);
          const count = grouped.get(item.id)?.length ?? 0;
          return (
            <Link key={item.id} to={`/encyclopedia/${item.id}`} className="encyclopedia-teaser-item">
              <ProduceThumb item={item} size="sm" />
              <div>
                <strong>{item.name}</strong>
                <small><span className={`phase-text phase-${phaseClass(phase)}`}>{PHASE_META[phase].label}</span> · 판매 {formatMonthRange(salesMonths(item))}</small>
                {count > 0 && <em><Store size={12} aria-hidden="true" /> 두고푸드 보유 {count}개</em>}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
