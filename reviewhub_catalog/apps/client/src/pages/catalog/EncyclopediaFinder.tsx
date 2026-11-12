// 백과사전 "첫 상품 찾기"(/encyclopedia/finder): 질문 4개(시작 달 · 배송 · 경험 · 판매 방향)에 답하면 품목 5개를 이유와 함께 추천합니다.
// 두고푸드에 있는 품목(도매몰에서 바로 받을 수 있는 상품)에 점수를 더 줍니다. 추천 계산은 lib/encyclopedia.ts recommendProduce.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronRight, Heart, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { finderWindow, formatMonthRange, recommendProduce, type FinderAnswers } from "@/lib/encyclopedia";
import { addFavorites } from "@/lib/encyclopedia-store";
import { useEncyclopediaCatalog } from "./encyclopedia-catalog";
import { EncyclopediaLayout, FavoriteButton } from "./encyclopedia-shared";
import { ProduceThumb, Stars, StockBadge, TagChips, seasonSummary, useFavoriteProduce, useSeoulMonth } from "./encyclopedia-ui";

type Option<T extends string> = { value: T; label: string; hint: string };

const SHIP_OPTIONS: Array<Option<FinderAnswers["ship"]>> = [
  { value: "room", label: "상온 택배만", hint: "아이스박스 없이 일반 택배로 보내는 품목만" },
  { value: "chill", label: "냉장(아이스팩)까지", hint: "아이스팩·보냉 포장이 필요한 품목도 괜찮아요" },
  { value: "any", label: "냉동까지 모두", hint: "얼린 채 보내는 수산물도 괜찮아요" }
];
const SKILL_OPTIONS: Array<Option<FinderAnswers["skill"]>> = [
  { value: "easy", label: "처음이에요", hint: "초보 추천 ★4 이상, 클레임 걱정이 적은 품목" },
  { value: "some", label: "조금 해 봤어요", hint: "★3 이상, 보통 수준의 관리가 필요한 품목까지" },
  { value: "any", label: "어려워도 괜찮아요", hint: "시즌이 짧거나 예민한 품목도 포함" }
];
const GOAL_OPTIONS: Array<Option<FinderAnswers["goal"]>> = [
  { value: "doogo", label: "두고푸드 상품으로 바로", hint: "공급처를 찾지 않고 두고푸드 도매몰에서 바로 시작" },
  { value: "gift", label: "선물·명절용", hint: "선물세트·명절 수요가 큰 품목 위주" },
  { value: "home", label: "집밥·간식용", hint: "매일 먹는 반찬·간식·다이어트 품목 위주" },
  { value: "any", label: "상관없어요", hint: "시기와 추천도만 보고 골라요" }
];

const STEP_TITLES = ["언제부터 팔기 시작할까요?", "배송은 어떻게 할 수 있나요?", "판매 경험은 어느 정도인가요?", "어떤 판매를 하고 싶나요?"];

export function EncyclopediaFinderPage() {
  const currentMonth = useSeoulMonth();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [answers, setAnswers] = useState<FinderAnswers>({ start: currentMonth, ship: "room", skill: "easy", goal: "doogo" });
  const { loading, grouped } = useEncyclopediaCatalog();
  const { favorites, toggle } = useFavoriteProduce();
  const favoriteSet = new Set(favorites);
  const picks = useMemo(() => (done ? recommendProduce(answers, (id) => grouped.get(id)?.length ?? 0) : []), [answers, done, grouped]);
  const set = <K extends keyof FinderAnswers>(key: K, value: FinderAnswers[K]) => setAnswers((previous) => ({ ...previous, [key]: value }));
  const restart = () => {
    setDone(false);
    setStep(0);
  };
  const windowLabel = formatMonthRange(finderWindow(answers.start));

  const choices = <T extends string>(options: Array<Option<T>>, value: T, onPick: (value: T) => void) => (
    <div className="enc-finder-options" role="radiogroup">
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value} className={value === option.value ? "active" : ""} onClick={() => onPick(option.value)}>
          <strong>{option.label}</strong>
          <span>{option.hint}</span>
        </button>
      ))}
    </div>
  );

  return (
    <EncyclopediaLayout className="encyclopedia-finder">
      <div className="enc-page-head">
        <h1>첫 상품 찾기</h1>
        <p>질문 4개에 답하면 시기·배송·경험에 맞는 품목 5개를 골라 드려요. 두고푸드에 있는 품목은 공급처를 따로 찾지 않아도 돼요.</p>
      </div>

      {!done ? (
        <section className="enc-finder-card" aria-labelledby="enc-finder-question">
          <div className="enc-finder-progress" aria-label={`질문 ${step + 1} / 4`}>
            {STEP_TITLES.map((_, index) => <i key={index} className={index <= step ? "active" : ""} />)}
            <span>{step + 1} / 4</span>
          </div>
          <h2 id="enc-finder-question">{STEP_TITLES[step]}</h2>
          {step === 0 && (
            <>
              <p className="enc-finder-hint">고른 달부터 3달({windowLabel}) 안에 팔 수 있는 품목만 추천해요.</p>
              <div className="enc-finder-months" role="radiogroup" aria-label="시작 달">
                {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                  <button key={month} type="button" role="radio" aria-checked={answers.start === month} className={answers.start === month ? "active" : ""} onClick={() => set("start", month)}>
                    {month}월{month === currentMonth && <small>이번 달</small>}
                  </button>
                ))}
              </div>
            </>
          )}
          {step === 1 && choices(SHIP_OPTIONS, answers.ship, (value) => set("ship", value))}
          {step === 2 && choices(SKILL_OPTIONS, answers.skill, (value) => set("skill", value))}
          {step === 3 && choices(GOAL_OPTIONS, answers.goal, (value) => set("goal", value))}
          <div className="enc-finder-nav">
            <button type="button" className="enc-secondary-button" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}><ArrowLeft size={16} aria-hidden="true" /> 이전</button>
            {step < 3
              ? <button type="button" className="enc-primary-button" onClick={() => setStep((value) => Math.min(3, value + 1))}>다음 <ChevronRight size={16} aria-hidden="true" /></button>
              : <button type="button" className="enc-primary-button" onClick={() => setDone(true)}><Search size={16} aria-hidden="true" /> 추천 받기</button>}
          </div>
        </section>
      ) : (
        <section className="enc-finder-result" aria-labelledby="enc-finder-result-title">
          <div className="enc-finder-result-head">
            <div>
              <h2 id="enc-finder-result-title">{answers.start}월부터 팔기 좋은 품목 {picks.length}개</h2>
              <p>{windowLabel} 판매 · {SHIP_OPTIONS.find((option) => option.value === answers.ship)?.label} · {SKILL_OPTIONS.find((option) => option.value === answers.skill)?.label} · {GOAL_OPTIONS.find((option) => option.value === answers.goal)?.label}</p>
            </div>
            <div className="enc-finder-result-actions">
              <button
                type="button"
                className="enc-primary-button"
                disabled={picks.length === 0}
                onClick={() => {
                  addFavorites(picks.map((pick) => pick.item.id));
                  toast.success(`추천 품목 ${picks.length}개를 내 후보에 담았어요.`);
                }}
              >
                <Heart size={16} aria-hidden="true" /> 모두 내 후보에 담기
              </button>
              <button type="button" className="enc-secondary-button" onClick={restart}><RotateCcw size={16} aria-hidden="true" /> 다시 하기</button>
            </div>
          </div>
          {picks.length === 0 ? (
            <div className="empty-state encyclopedia-empty">
              <strong>조건에 맞는 품목이 없어요.</strong>
              <span>배송 조건을 넓히거나 시작 달을 바꿔 보세요.</span>
            </div>
          ) : (
            <ol className="enc-finder-picks">
              {picks.map((pick, index) => (
                <li key={pick.item.id}>
                  <Link to={`/encyclopedia/${pick.item.id}`} className="enc-finder-pick">
                    <b className="enc-finder-rank">{index + 1}</b>
                    <ProduceThumb item={pick.item} size="sm" />
                    <div>
                      <strong>{pick.item.name}</strong>
                      <span className="enc-finder-pick-line"><Stars level={pick.item.level} /> {seasonSummary(pick.item)}</span>
                      <span className="enc-finder-reasons">{pick.reasons.map((reason) => <i key={reason}>{reason}</i>)}</span>
                      <span className="enc-finder-pick-foot"><StockBadge count={grouped.get(pick.item.id)?.length ?? 0} loading={loading} compact /><TagChips item={pick.item} limit={2} /></span>
                    </div>
                  </Link>
                  <FavoriteButton item={pick.item} favorite={favoriteSet.has(pick.item.id)} onToggle={toggle} />
                </li>
              ))}
            </ol>
          )}
          <Link to={`/encyclopedia/calendar?month=${answers.start}&selling=1`} className="enc-more enc-finder-more">시즌 캘린더에서 {answers.start}월 품목 더 보기 <ChevronRight size={15} aria-hidden="true" /></Link>
        </section>
      )}
    </EncyclopediaLayout>
  );
}
