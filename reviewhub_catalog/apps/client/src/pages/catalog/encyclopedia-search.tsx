// 농축수산 백과사전 "판매하는 상품을 검색해 보세요!" 검색칸(이달의 제철 화면 맨 위, PC·휴대폰 같은 방식, 2026-11-16 관리자 요청).
// 입력하는 대로 품목을 찾아 바로 아래 목록으로 보여 주고, 이름이 정확히 맞는 품목은 맨 위에 "정확히 일치"로 둡니다.
// 셀러가 파는 상품명을 그대로 넣어도(예: "청송 부사 사과 특품 5kg") 두고푸드 보유 연결과 같은 규칙(matchesProduceItem)으로 품목을 찾습니다.
// 두고푸드 단가표에 같은 말이 든 상품이 있으면 "단가표에서 N개 보기"(/?q=)로 이어 줍니다.
import { type KeyboardEvent, useId, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, PackageSearch, Search, Store, X } from "lucide-react";
import { matchesProduceItem, normalizeText, produceItems, type ProduceItem } from "@/lib/encyclopedia";
import { PhaseBadge, ProduceThumb, StockBadge, seasonSummary } from "./encyclopedia-ui";

export type ProduceSearchHit = { item: ProduceItem; score: number; exact: boolean };

// 이름 · 괄호 안 품종 · 대표 검색어가 똑같으면 정확히 일치(100) → 같은 묶음 이름(88, 예: "사과" → 홍로·시나노골드) → 이름 앞부분(85) → 이름 안(70) →
// 검색어·묶음 안(60) → 상품명처럼 긴 말에 품목 단어가 들어 있음(55) → 연결 단어 일부(45) → 쓰임·산지·재배·분류(30)
export function searchProduce(query: string, items: ProduceItem[] = produceItems): ProduceSearchHit[] {
  const q = normalizeText(query);
  if (!q) return [];
  const hits: ProduceSearchHit[] = [];
  for (const item of items) {
    const name = normalizeText(item.name);
    const base = normalizeText(item.name.replace(/\([^)]*\)/g, ""));
    const inner = normalizeText(item.name.match(/\(([^)]+)\)/)?.[1]);
    const keyword = normalizeText(item.keyword);
    const group = normalizeText(item.group);
    let score = 0;
    if (q === name || q === base || q === keyword || (inner && q === inner)) score = 100;
    else if (q === group) score = 88;
    else if (name.startsWith(q) || base.startsWith(q)) score = 85;
    else if (name.includes(q)) score = 70;
    else if (keyword.includes(q) || group.includes(q)) score = 60;
    else if (q.length >= 2 && matchesProduceItem(item, query, q)) score = 55;
    else if ((item.match ?? []).some((word) => normalizeText(word).includes(q))) score = 45;
    else if ([...(item.tags ?? []), item.origin ?? "", item.grow ?? "", item.category].some((text) => normalizeText(text).includes(q))) score = 30;
    if (score > 0) hits.push({ item, score, exact: score === 100 });
  }
  return hits.sort((first, second) => second.score - first.score || second.item.level - first.item.level || first.item.name.localeCompare(second.item.name, "ko"));
}

const LIMIT = 8;

export function ProduceSearchBox({ month, countOf, loading, catalogNames, suggestions }: {
  month: number;
  countOf: (item: ProduceItem) => number;
  loading: boolean;
  catalogNames: string[];
  suggestions: ProduceItem[];
}) {
  const navigate = useNavigate();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const hits = useMemo(() => searchProduce(query), [query]);
  const shown = hits.slice(0, LIMIT);
  const normalized = normalizeText(query);
  const catalogCount = useMemo(() => (normalized.length >= 1 ? catalogNames.filter((name) => normalizeText(name).includes(normalized)).length : 0), [catalogNames, normalized]);
  const calendarLink = `/encyclopedia/calendar?q=${encodeURIComponent(query.trim())}`;
  const expanded = open && normalized.length > 0;

  const go = (item: ProduceItem) => {
    setOpen(false);
    navigate(`/encyclopedia/${item.id}`);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(shown.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(-1, index - 1));
    } else if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = active >= 0 ? shown[active] : shown[0]?.exact || shown.length === 1 ? shown[0] : undefined;
      if (target) go(target.item);
      else if (normalized) navigate(calendarLink);
    }
  };

  return (
    <section className={`enc-psearch${expanded ? " is-open" : ""}`} aria-label="판매하는 상품 검색">
      <div className="enc-psearch-box" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
        <label className="enc-psearch-field">
          <Search size={20} aria-hidden="true" />
          <input
            type="search"
            role="combobox"
            aria-label="판매하는 상품 검색"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
            value={query}
            placeholder="판매하는 상품을 검색해 보세요! (예: 부사 사과, 귤, 꼬막, 절임배추)"
            autoComplete="off"
            onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(-1); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
          />
          {query && <button type="button" className="enc-psearch-clear" onClick={() => { setQuery(""); setActive(-1); }} aria-label="검색어 지우기"><X size={16} /></button>}
        </label>
        {expanded && (
          <div className="enc-psearch-panel">
            {shown.length > 0 ? (
              <>
                <p className="enc-psearch-count">
                  {hits[0].exact ? <><b>정확히 일치하는 품목</b>이 있어요</> : <>비슷한 품목 <b>{hits.length}개</b></>}
                  {hits.length > LIMIT && <> · 위 {LIMIT}개만 보여요</>}
                </p>
                <ul id={listId} role="listbox" aria-label="검색 결과">
                  {shown.map((hit, index) => (
                    <li key={hit.item.id} id={`${listId}-${index}`} role="option" aria-selected={index === active} className={`${hit.exact ? "is-exact" : ""}${index === active ? " is-active" : ""}`.trim()}>
                      <Link to={`/encyclopedia/${hit.item.id}`} tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => setOpen(false)} onMouseEnter={() => setActive(index)}>
                        <ProduceThumb item={hit.item} size="sm" />
                        <span className="enc-psearch-main">
                          <span className="enc-psearch-top">
                            <strong>{hit.item.name}</strong>
                            {hit.exact && <em>정확히 일치</em>}
                          </span>
                          <small>{hit.item.category} · {hit.item.group} · {seasonSummary(hit.item)}</small>
                        </span>
                        <span className="enc-psearch-side">
                          <PhaseBadge item={hit.item} month={month} />
                          <StockBadge count={countOf(hit.item)} loading={loading} compact />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="enc-psearch-empty">
                <PackageSearch size={22} aria-hidden="true" />
                <div><strong>‘{query.trim()}’에 맞는 품목이 아직 없어요.</strong><span>다른 이름(예: 품종·산지)으로 찾아보거나, 두고푸드에 소싱을 요청해 주세요.</span></div>
                <Link to="/sourcing" className="enc-psearch-request" onMouseDown={(event) => event.preventDefault()}>소싱 요청하기</Link>
              </div>
            )}
            <div className="enc-psearch-foot">
              {catalogCount > 0 && (
                <Link to={`/?q=${encodeURIComponent(query.trim())}`} onMouseDown={(event) => event.preventDefault()}>
                  <Store size={15} aria-hidden="true" /> 두고푸드 단가표에서 ‘{query.trim()}’ 상품 {catalogCount.toLocaleString("ko-KR")}개 보기 <ArrowRight size={14} aria-hidden="true" />
                </Link>
              )}
              {hits.length > 0 && (
                <Link to={calendarLink} onMouseDown={(event) => event.preventDefault()}>시즌 캘린더에서 모두 보기 <ArrowRight size={14} aria-hidden="true" /></Link>
              )}
            </div>
          </div>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="enc-psearch-chips" aria-label={`${month}월 많이 찾는 품목`}>
          <span>{month}월 추천 검색</span>
          {suggestions.map((item) => (
            <button key={item.id} type="button" onClick={() => { setQuery(item.name.replace(/\([^)]*\)/g, "")); setOpen(true); setActive(-1); }}>
              {item.name.replace(/\([^)]*\)/g, "")}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
