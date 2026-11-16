// 메인 홈 "건강식품 백과사전" 미리보기(농축수산 "N월 제철 백과사전" 바로 아래, 2026-11-16 관리자 요청).
// 이번 달 많이 찾는 고객 고민 → 연중 고민 → 나머지 순으로 8개, 고민마다 팔기 좋은 원료 3개와 두고푸드 보유 상품 수를 보여 줍니다.
// 원료·고민 자료가 단가표 첫 화면을 무겁게 하지 않도록 메인 홈에서 따로(지연) 불러옵니다.
import { memo, useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, HeartPulse, ShieldCheck, Store } from "lucide-react";
import { concernProductCount, coreIngredientsOf, groupProductsByIngredient, healthConcerns, type HealthConcern } from "@/lib/health-encyclopedia";

const LIMIT = 8;

const seoulMonthNow = () => Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", month: "numeric" }).format(new Date()));

type TeaserProduct = { id: string; name: string; categoryId: string };

// 이번 달 고민(두고푸드 보유 많은 순) → 연중 고민 → 그 밖의 고민 순, 같은 묶음 안에서는 보유 상품 수가 많은 순
export function pickTeaserConcerns(month: number, countOf: (concern: HealthConcern) => number, limit = LIMIT) {
  const rank = (concern: HealthConcern) => (concern.months.includes(month) ? 0 : concern.months.length === 0 ? 1 : 2);
  return [...healthConcerns]
    .sort((first, second) => rank(first) - rank(second) || countOf(second) - countOf(first))
    .slice(0, limit);
}

function HealthEncyclopediaTeaser({ products, categories }: { products: TeaserProduct[]; categories: Array<{ id: string; name: string }> }) {
  const month = useMemo(seoulMonthNow, []);
  const grouped = useMemo(() => groupProductsByIngredient(products, new Map(categories.map((category) => [category.id, category.name]))), [products, categories]);
  const picks = useMemo(() => {
    const counts = new Map(healthConcerns.map((concern) => [concern.id, concernProductCount(concern, grouped)]));
    return pickTeaserConcerns(month, (concern) => counts.get(concern.id) ?? 0).map((concern) => ({ concern, count: counts.get(concern.id) ?? 0 }));
  }, [grouped, month]);
  if (picks.length === 0) return null;
  return (
    <section className="encyclopedia-teaser is-health" aria-labelledby="health-teaser-title">
      <div className="encyclopedia-teaser-head">
        <div className="encyclopedia-teaser-title">
          <span className="encyclopedia-teaser-icon" aria-hidden="true"><HeartPulse size={24} /></span>
          <div>
            <span className="section-kicker">HEALTH GUIDE</span>
            <h2 id="health-teaser-title">고객 고민으로 찾는 건강식품</h2>
            <p>고민을 고르면 팔기 좋은 원료, 써도 되는 문구, 두고푸드 상품까지 한 번에 보여 드려요.</p>
          </div>
        </div>
        <Link to="/encyclopedia/health" className="encyclopedia-teaser-more">
          <span className="encyclopedia-teaser-more-label">건강식품 백과사전</span> 전체 보기 <ChevronRight size={17} aria-hidden="true" />
        </Link>
      </div>
      {/* 단가표 전체를 받아 보유 수가 바뀌면 순서가 바뀝니다. 가로 넘기기(scroll-snap)가 바뀐 카드를 따라 옆으로 밀리지 않게 순서가 바뀌면 목록을 새로 그립니다. */}
      <div className="encyclopedia-teaser-list" key={picks.map(({ concern }) => concern.id).join(",")}>
        {picks.map(({ concern, count }) => {
          const seasonal = concern.months.includes(month);
          const core = coreIngredientsOf(concern).slice(0, 3);
          return (
            <Link key={concern.id} to={`/encyclopedia/health/concern/${concern.id}`} className="encyclopedia-teaser-item">
              <span className="health-teaser-emoji" aria-hidden="true">{concern.emoji}</span>
              <div>
                <strong>{concern.name}</strong>
                <small>
                  {seasonal ? <span className="health-teaser-when is-hot">{month}월 인기</span> : concern.months.length === 0 ? <span className="health-teaser-when">연중</span> : null}
                  {(seasonal || concern.months.length === 0) && core.length > 0 && " · "}
                  {core.map((item) => item.name).join(" · ")}
                </small>
                {count > 0 && <em><Store size={12} aria-hidden="true" /> 두고푸드 보유 {count}개</em>}
              </div>
            </Link>
          );
        })}
      </div>
      <Link to="/encyclopedia/health/guide" className="health-teaser-check">
        <ShieldCheck size={17} aria-hidden="true" />
        <span><b>건강식품은 쓸 수 있는 문구가 정해져 있어요.</b> 올리기 전에 판매 전 체크 6가지를 확인하세요.</span>
        <ChevronRight size={16} aria-hidden="true" />
      </Link>
    </section>
  );
}

export default memo(HealthEncyclopediaTeaser);
