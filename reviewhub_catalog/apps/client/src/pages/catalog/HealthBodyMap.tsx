// 건강식품 백과사전 "몸에서 고민 찾기" 그림: 단순한 사람 그림(직접 그린 SVG) + 양옆 이름표 10개 + 아래 "전신" 버튼.
// 이름표(버튼)가 키보드·화면 읽기 프로그램용 조작이고, 그림 위 점은 마우스·손가락으로 눌러도 같은 곳을 고릅니다.
// 고른 곳의 고민 카드는 HealthHomePage가 옆(휴대폰은 아래)에 그립니다.
import { BODY_VIEWBOX, type BodyPartId, HEALTH_BODY_PARTS } from "@/lib/health-body-map";

const { width: W, height: H } = BODY_VIEWBOX;

function BodyFigure({ selected, onSelect }: { selected: BodyPartId; onSelect: (id: BodyPartId) => void }) {
  return (
    <svg className="hl-body-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="hl-body-glow">
          <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="hl-body-shape">
        <path className="hl-body-limb is-arm" d="M64 98 C47 124 39 162 36 200 C33 230 32 248 31 262" />
        <path className="hl-body-limb is-arm" d="M136 98 C153 124 161 162 164 200 C167 230 168 248 169 262" />
        <path className="hl-body-limb is-leg" d="M82 246 L80 330 L78 414" />
        <path className="hl-body-limb is-leg" d="M118 246 L120 330 L122 414" />
        <rect x="58" y="80" width="84" height="178" rx="36" />
        <rect x="90" y="60" width="20" height="26" rx="8" />
        <ellipse cx="100" cy="38" rx="25" ry="29" />
      </g>
      {HEALTH_BODY_PARTS.map((part) => {
        if (!part.dot || !part.label) return null;
        const active = part.id === selected;
        const edge = part.label.side === "left" ? 0 : W;
        return <line key={`line-${part.id}`} className={`hl-body-line${active ? " is-active" : ""}`} x1={edge} y1={part.label.y} x2={part.dot.x} y2={part.dot.y} />;
      })}
      {HEALTH_BODY_PARTS.map((part) => {
        if (!part.dot) return null;
        const active = part.id === selected;
        return (
          <g key={`dot-${part.id}`} className="hl-body-point" onClick={() => onSelect(part.id)}>
            {active && <circle cx={part.dot.x} cy={part.dot.y} r="28" fill="url(#hl-body-glow)" />}
            {active && <circle className="hl-body-pulse" cx={part.dot.x} cy={part.dot.y} r="7" />}
            <circle className={`hl-body-dot${active ? " is-active" : ""}`} cx={part.dot.x} cy={part.dot.y} r={active ? 7 : 5} />
            <circle className="hl-body-hit" cx={part.dot.x} cy={part.dot.y} r="15" />
          </g>
        );
      })}
    </svg>
  );
}

export function HealthBodyMap({ selected, onSelect, counts }: { selected: BodyPartId; onSelect: (id: BodyPartId) => void; counts?: Partial<Record<BodyPartId, number>> }) {
  const label = (side: "left" | "right") =>
    HEALTH_BODY_PARTS.filter((part) => part.label?.side === side).map((part) => (
      <button
        key={part.id}
        type="button"
        aria-pressed={part.id === selected}
        style={{ top: `${((part.label?.y ?? 0) / H) * 100}%` }}
        onClick={() => onSelect(part.id)}
      >
        {part.name}
      </button>
    ));
  const whole = HEALTH_BODY_PARTS.find((part) => part.id === "whole");
  return (
    <div className="hl-body-map">
      <div className="hl-body-figure-wrap" role="group" aria-label="몸에서 고민 고르기">
        <div className="hl-body-labels is-left">{label("left")}</div>
        <div className="hl-body-figure"><BodyFigure selected={selected} onSelect={onSelect} /></div>
        <div className="hl-body-labels is-right">{label("right")}</div>
      </div>
      {whole && (
        <button type="button" className="hl-body-whole" aria-pressed={selected === "whole"} onClick={() => onSelect("whole")}>
          <b>{whole.name}</b><span>면역·활력·항산화</span>{counts?.whole !== undefined ? <small>보유 {counts.whole}개</small> : null}
        </button>
      )}
    </div>
  );
}
