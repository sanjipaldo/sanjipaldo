// 농수산물 백과사전: 홈(/encyclopedia) · 시즌 캘린더(/encyclopedia/calendar) · 내 후보(/encyclopedia/favorites) · 품목 상세(/encyclopedia/:id).
// 첫 상품 찾기는 EncyclopediaFinder.tsx. 두고푸드 단가표에 있는 품목은 상세 위쪽(썸네일과 품목명 사이)에 A단가·일반공급가를
// 단가표와 같은 모양으로 보여 주고, "상품 구매하기"로 두고푸드 도매몰에 바로 갑니다.
import { type ReactNode, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCopy,
  Copy,
  ExternalLink,
  Heart,
  Info,
  Lightbulb,
  Link2,
  ListChecks,
  MessageSquareText,
  PackageSearch,
  PhoneCall,
  Search,
  ShieldAlert,
  ShoppingCart,
  Smartphone,
  Snowflake,
  Sparkles,
  Sprout,
  Store,
  TrendingUp,
  Truck,
  X
} from "lucide-react";
import { toast } from "sonner";
import { CatalogProductTable, ImageModal, ShippingInfoModal, seasonApplies } from "./PublicCatalog";
import type { CatalogData, Product, PublicShippingPolicy } from "./types";
import { supplyStatus } from "@/lib/supply-status";
import {
  DOOGO_MALL_URL,
  LEVEL_LABELS,
  MONTH_NOTES,
  PHASE_META,
  PRODUCE_CATEGORIES,
  SALES_PHASES,
  catalogSearchWord,
  contactLabel,
  findProduceItem,
  formatMonthRange,
  itemsForMonth,
  normalizeText,
  peakMonths,
  phaseOf,
  produceChecklist,
  produceCs,
  produceInquiryMessage,
  produceItems,
  relatedProduceItems,
  salesMonths,
  type ProduceCategory,
  type ProduceItem,
  type ProduceSearchStat
} from "@/lib/encyclopedia";
import { createSyncCode, linkSyncCode, setCheck, unlinkSync, useEncyclopediaStore } from "@/lib/encyclopedia-store";
import { searchRise, searchStatOf, useEncyclopediaCatalog, useProduceSearchStats } from "./encyclopedia-catalog";
import { EncyclopediaLayout, FavoriteButton, MonthPicker, ProduceCard, copyText, useMediaQuery, validMonth } from "./encyclopedia-shared";
import { MiniSeasonBar, PhaseBadge, ProduceThumb, SeasonBar, SeasonLegend, Stars, StockBadge, TagChips, phaseClass, seasonSummary, useFavoriteProduce, useSeoulMonth } from "./encyclopedia-ui";

const CATEGORY_ICON: Record<ProduceCategory, string> = { 과일: "🍎", 채소: "🥬", "버섯·나물": "🍄", "곡물·견과": "🌾", 수산: "🐟", "가공·김장": "🫙" };
const formatCount = (value: number) => value.toLocaleString("ko-KR");
const isSelling = (item: ProduceItem, month: number) => SALES_PHASES.includes(phaseOf(item, month));

// ───────── 홈 ─────────
export function EncyclopediaHomePage() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  // 예전 목록 주소(?q=, ?cat= …)는 시즌 캘린더로 보냅니다.
  if (["q", "cat", "fav", "doogo"].some((key) => params.has(key))) return <Navigate to={`/encyclopedia/calendar${location.search}`} replace />;
  return <EncyclopediaHome />;
}

const GUIDE_HIDDEN_KEY = "doogo:encyclopedia:guide-hidden";

function EncyclopediaHome() {
  const currentMonth = useSeoulMonth();
  const [params, setParams] = useSearchParams();
  const month = validMonth(params.get("month")) ?? currentMonth;
  const nextMonth = (month % 12) + 1;
  const { loading, grouped } = useEncyclopediaCatalog();
  const stats = useProduceSearchStats();
  const { favorites, toggle } = useFavoriteProduce();
  const favoriteSet = new Set(favorites);
  const [guideHidden, setGuideHidden] = useState(() => {
    try {
      return window.localStorage.getItem(GUIDE_HIDDEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const count = (item: ProduceItem) => grouped.get(item.id)?.length ?? 0;
  const byDoogoThenLevel = (first: ProduceItem, second: ProduceItem) => Number(count(second) > 0) - Number(count(first) > 0) || second.level - first.level || first.name.localeCompare(second.name, "ko");
  const groups = useMemo(() => itemsForMonth(month), [month]);
  const selling = produceItems.filter((item) => isSelling(item, month));
  const beginner = selling.filter((item) => item.level >= 4 && item.risk !== "높음").sort(byDoogoThenLevel);
  const doogoNow = selling.filter((item) => count(item) > 0).sort((first, second) => count(second) - count(first));
  const opening = produceItems.filter((item) => !isSelling(item, month) && ["H", "K"].includes(phaseOf(item, nextMonth))).sort(byDoogoThenLevel);
  const rising = stats
    ? produceItems
        .map((item) => ({ item, rise: searchRise(searchStatOf(stats, item), month) }))
        .filter((entry): entry is { item: ProduceItem; rise: NonNullable<ReturnType<typeof searchRise>> } => entry.rise !== null && entry.rise.next >= 300)
        .sort((first, second) => second.rise.ratio - first.rise.ratio)
        .slice(0, 6)
    : [];
  const note = MONTH_NOTES[month];
  const card = (item: ProduceItem) => <ProduceCard key={item.id} item={item} month={month} doogoCount={count(item)} loading={loading} favorite={favoriteSet.has(item.id)} onToggle={toggle} />;
  const pickMonth = (value: number) => {
    const next = new URLSearchParams(params);
    if (value === currentMonth) next.delete("month");
    else next.set("month", String(value));
    setParams(next, { replace: true });
  };
  const hideGuide = () => {
    setGuideHidden(true);
    try {
      window.localStorage.setItem(GUIDE_HIDDEN_KEY, "1");
    } catch {
      // 저장이 막혀도 이번 화면에서는 숨깁니다.
    }
  };
  const monthQuery = month === currentMonth ? "" : `&month=${month}`;

  return (
    <EncyclopediaLayout className="encyclopedia-home">
      <section className="enc-hero" aria-labelledby="enc-hero-title">
        <div className="enc-hero-copy">
          <span className="enc-hero-kicker"><BookOpen size={14} aria-hidden="true" /> 두고푸드 농수산물 백과사전</span>
          <h1 id="enc-hero-title"><b>{month}</b>월</h1>
          <p>지금 팔 수 있는 품목 <strong>{formatCount(selling.length)}개</strong>, 산지에 먼저 연락할 품목 <strong>{formatCount(groups.P.length)}개</strong>가 있어요.</p>
        </div>
        <div className="enc-hero-stats">
          <Link to={`/encyclopedia/calendar?selling=1${monthQuery}`}><strong>{groups.K.length}</strong><span>성수기 품목</span></Link>
          <Link to={`/encyclopedia/calendar?selling=1&easy=1${monthQuery}`}><strong>{beginner.length}</strong><span>초보 추천</span></Link>
          <Link to={`/encyclopedia/calendar?doogo=1${monthQuery}`}><strong>{loading ? "…" : grouped.size}</strong><span>두고푸드 보유</span></Link>
          <Link to="/encyclopedia/favorites"><strong>{favorites.length}</strong><span>내 후보</span></Link>
        </div>
      </section>
      <MonthPicker month={month} currentMonth={currentMonth} onPick={pickMonth} />

      {!guideHidden && (
        <section className="enc-start" aria-labelledby="enc-start-title">
          <div className="enc-start-head">
            <h2 id="enc-start-title">처음이라면 이 순서로 시작해 보세요</h2>
            <button type="button" className="enc-start-close" onClick={hideGuide} aria-label="시작 안내 닫기"><X size={16} /></button>
          </div>
          <p>위탁판매는 재고 없이 산지나 두고푸드가 고객에게 바로 보내 주는 방식이라, 품목 고르기와 산지 연락 시기가 가장 중요해요.</p>
          <ol>
            <li><Link to="/encyclopedia/finder"><b>1</b><div><strong>첫 상품 찾기</strong><span>질문 4개에 답하면 나에게 맞는 품목 5개를 골라 드려요.</span></div><ChevronRight size={18} aria-hidden="true" /></Link></li>
            <li><Link to="/encyclopedia/favorites"><b>2</b><div><strong>후보 담고 공급처 확인하기</strong><span>두고푸드에 있으면 공급가를 바로 보고, 없으면 산지 문의 메시지를 복사해 보내세요.</span></div><ChevronRight size={18} aria-hidden="true" /></Link></li>
            <li><Link to="/encyclopedia/calendar"><b>3</b><div><strong>시즌 캘린더로 다음 달 준비하기</strong><span>성수기·준비 기간을 보고 다음 시즌 상품을 미리 정하세요.</span></div><ChevronRight size={18} aria-hidden="true" /></Link></li>
          </ol>
        </section>
      )}

      {note && (
        <section className="enc-memo" aria-label={`${month}월 메모`}>
          <span className="enc-memo-icon" aria-hidden="true"><Lightbulb size={20} /></span>
          <div><strong>{month}월 · {note.title}</strong><p>{note.body}</p></div>
        </section>
      )}

      <HomeRail title={`초보에게 추천하는 ${month}월 품목`} desc="지금 팔 수 있고 클레임 걱정이 적은 품목이에요." icon={<Sparkles size={18} />} more={`/encyclopedia/calendar?selling=1&easy=1${monthQuery}`}>
        {beginner.slice(0, 8).map(card)}
      </HomeRail>
      {doogoNow.length > 0 && (
        <HomeRail title="두고푸드에서 바로 받을 수 있는 품목" desc="두고푸드 도매몰에 있는 상품이라 공급처를 따로 찾지 않아도 돼요." icon={<Store size={18} />} more={`/encyclopedia/calendar?doogo=1${monthQuery}`}>
          {doogoNow.slice(0, 8).map(card)}
        </HomeRail>
      )}
      {rising.length > 0 && (
        <section className="enc-rising" aria-labelledby="enc-rising-title">
          <div className="enc-section-head">
            <span className="enc-section-icon"><TrendingUp size={18} /></span>
            <div><h2 id="enc-rising-title">{nextMonth}월에 검색이 오르는 품목</h2><p>네이버 검색이 오르기 직전이 상세페이지·광고를 준비할 때예요.</p></div>
          </div>
          <ul>
            {rising.map(({ item, rise }) => (
              <li key={item.id}>
                <Link to={`/encyclopedia/${item.id}`}>
                  <ProduceThumb item={item} size="sm" />
                  <div><strong>{item.name}</strong><span>{seasonSummary(item)}</span></div>
                  <em><ArrowUpRight size={14} aria-hidden="true" /> {rise.ratio.toFixed(1)}배</em>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {opening.length > 0 && (
        <HomeRail title={`${nextMonth}월에 시즌이 열리는 품목`} desc="지금 산지와 물량·가격을 맞춰 두면 시즌 시작부터 팔 수 있어요." icon={<CalendarDays size={18} />} more={`/encyclopedia/calendar?month=${nextMonth}&selling=1`}>
          {opening.slice(0, 8).map(card)}
        </HomeRail>
      )}

      <section className="enc-categories" aria-labelledby="enc-categories-title">
        <div className="enc-section-head">
          <span className="enc-section-icon"><Sprout size={18} /></span>
          <div><h2 id="enc-categories-title">분류별로 보기</h2><p>{month}월에 팔 수 있는 품목 수예요.</p></div>
        </div>
        <div className="enc-category-grid">
          {PRODUCE_CATEGORIES.map((category) => {
            const all = produceItems.filter((item) => item.category === category);
            const now = all.filter((item) => isSelling(item, month)).length;
            return (
              <Link key={category} to={`/encyclopedia/calendar?cat=${encodeURIComponent(category)}${monthQuery}`}>
                <span aria-hidden="true">{CATEGORY_ICON[category]}</span>
                <strong>{category}</strong>
                <small>{now}개 판매중 · 전체 {all.length}개</small>
              </Link>
            );
          })}
        </div>
      </section>
    </EncyclopediaLayout>
  );
}

function HomeRail({ title, desc, icon, more, children }: { title: string; desc: string; icon: ReactNode; more: string; children: ReactNode }) {
  return (
    <section className="enc-rail-section">
      <div className="enc-section-head">
        <span className="enc-section-icon">{icon}</span>
        <div><h2>{title}</h2><p>{desc}</p></div>
        <Link to={more} className="enc-more">전체 보기 <ChevronRight size={15} aria-hidden="true" /></Link>
      </div>
      <div className="produce-rail">{children}</div>
    </section>
  );
}

// ───────── 시즌 캘린더 ─────────
const CALENDAR_FILTERS = [
  { key: "selling", label: (month: number) => `${month}월 판매중` },
  { key: "easy", label: () => "초보 추천 ★4+" },
  { key: "room", label: () => "상온 배송" },
  { key: "doogo", label: () => "두고푸드 보유" },
  { key: "fav", label: () => "내 후보" }
] as const;
type CalendarFilter = (typeof CALENDAR_FILTERS)[number]["key"];

function itemSearchText(item: ProduceItem) {
  return normalizeText([item.name, item.group, item.category, item.keyword, item.origin ?? "", item.grow ?? "", ...(item.tags ?? []), ...(item.match ?? [])].join(" "));
}

export function EncyclopediaCalendarPage() {
  const currentMonth = useSeoulMonth();
  const [params, setParams] = useSearchParams();
  const month = validMonth(params.get("month")) ?? currentMonth;
  const categoryParam = params.get("cat") ?? "";
  const category: ProduceCategory | "all" = (PRODUCE_CATEGORIES as readonly string[]).includes(categoryParam) ? (categoryParam as ProduceCategory) : "all";
  const query = params.get("q") ?? "";
  const active = (key: CalendarFilter) => params.get(key) === "1";
  const stats = useProduceSearchStats();
  const hasSearch = Boolean(stats && Object.keys(stats.keywords).length > 0);
  const sort = params.get("sort") === "name" ? "name" : params.get("sort") === "search" && hasSearch ? "search" : "recommend";
  const { loading, grouped } = useEncyclopediaCatalog();
  const { favorites, toggle } = useFavoriteProduce();
  const favoriteSet = new Set(favorites);
  const updateParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };
  const normalizedQuery = normalizeText(query);
  const count = (item: ProduceItem) => grouped.get(item.id)?.length ?? 0;
  const searchTotal = (item: ProduceItem) => searchStatOf(stats, item)?.total ?? 0;
  const visible = produceItems.filter((item) =>
    (category === "all" || item.category === category) &&
    (!active("selling") || isSelling(item, month)) &&
    (!active("easy") || item.level >= 4) &&
    (!active("room") || item.ship === "상온") &&
    (!active("doogo") || count(item) > 0) &&
    (!active("fav") || favoriteSet.has(item.id)) &&
    (!normalizedQuery || itemSearchText(item).includes(normalizedQuery))
  );
  const phaseRank: Record<string, number> = { K: 0, H: 1, E: 2, S: 3, P: 4, "-": 5 };
  const sorted = [...visible].sort((first, second) => {
    if (sort === "name") return first.name.localeCompare(second.name, "ko");
    if (sort === "search") return searchTotal(second) - searchTotal(first) || first.name.localeCompare(second.name, "ko");
    return phaseRank[phaseOf(first, month)] - phaseRank[phaseOf(second, month)] || Number(count(second) > 0) - Number(count(first) > 0) || second.level - first.level || first.name.localeCompare(second.name, "ko");
  });
  const sections = PRODUCE_CATEGORIES.map((value) => ({ category: value, items: sorted.filter((item) => item.category === value) })).filter((section) => section.items.length > 0);

  return (
    <EncyclopediaLayout className="encyclopedia-calendar">
      <div className="enc-page-head">
        <h1>시즌 캘린더</h1>
        <p>{produceItems.length}개 품목의 1년 판매 시기를 한 줄씩 보여 드려요. 막대는 1~12월이고, 세로선이 기준 달({month}월)이에요.</p>
      </div>
      <section className="encyclopedia-panel" aria-label="품목 찾기">
        <MonthPicker month={month} currentMonth={currentMonth} onPick={(value) => updateParam("month", value === currentMonth ? null : String(value))} />
        <div className="encyclopedia-toolbar">
          <div className="search-field">
            <Search size={17} />
            <input type="search" value={query} onChange={(event) => updateParam("q", event.target.value || null)} placeholder="품목·품종·산지 검색 (예: 귤, 제주, 김장)" aria-label="시즌 캘린더 품목 검색" />
            {query && <button type="button" className="search-clear" onClick={() => updateParam("q", null)} aria-label="검색어 지우기"><X size={15} /></button>}
          </div>
          <label className="enc-sort">
            <span>정렬</span>
            <select value={sort} onChange={(event) => updateParam("sort", event.target.value === "recommend" ? null : event.target.value)} aria-label="정렬">
              <option value="recommend">{month}월 시즌 순</option>
              <option value="name">이름 순</option>
              {hasSearch && <option value="search">검색 많은 순</option>}
            </select>
          </label>
        </div>
        <div className="category-chips encyclopedia-categories">
          <button type="button" className={category === "all" ? "active" : ""} onClick={() => updateParam("cat", null)}>전체 <small>{produceItems.length}</small></button>
          {PRODUCE_CATEGORIES.map((value) => (
            <button key={value} type="button" className={category === value ? "active" : ""} onClick={() => updateParam("cat", value)}>
              {value} <small>{produceItems.filter((item) => item.category === value).length}</small>
            </button>
          ))}
        </div>
        <div className="enc-filter-chips" role="group" aria-label="조건">
          {CALENDAR_FILTERS.map((filter) => (
            <button key={filter.key} type="button" className={active(filter.key) ? "active" : ""} aria-pressed={active(filter.key)} onClick={() => updateParam(filter.key, active(filter.key) ? null : "1")}>
              {active(filter.key) && <Check size={14} aria-hidden="true" />}{filter.label(month)}
              {filter.key === "fav" && <b>{favorites.length}</b>}
            </button>
          ))}
        </div>
        <div className="enc-calendar-legend"><SeasonLegend /><span>{visible.length}개 품목</span></div>
      </section>

      {sections.length === 0 ? (
        <div className="empty-state encyclopedia-empty">
          <PackageSearch size={30} />
          <strong>조건에 맞는 품목이 없어요.</strong>
          <span>조건을 하나씩 꺼 보거나 검색어를 바꿔 보세요.</span>
        </div>
      ) : (
        sections.map((section) => (
          <section key={section.category} className="enc-calendar-group" aria-label={`${section.category} ${section.items.length}개`}>
            <div className="enc-calendar-group-head">
              <h2><span aria-hidden="true">{CATEGORY_ICON[section.category]}</span> {section.category} <small>{section.items.length}</small></h2>
              <ol className="mini-season-scale" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <li key={index} className={index + 1 === month ? "current" : ""}>{index + 1}</li>)}</ol>
            </div>
            <ul className="enc-calendar-rows">
              {section.items.map((item) => (
                <CalendarRow key={item.id} item={item} month={month} count={count(item)} loading={loading} favorite={favoriteSet.has(item.id)} onToggle={toggle} stat={searchStatOf(stats, item)} />
              ))}
            </ul>
          </section>
        ))
      )}
    </EncyclopediaLayout>
  );
}

function CalendarRow({ item, month, count, loading, favorite, onToggle, stat, extra }: { item: ProduceItem; month: number; count: number; loading: boolean; favorite: boolean; onToggle: (id: string) => boolean; stat?: ProduceSearchStat; extra?: ReactNode }) {
  const phase = phaseOf(item, month);
  return (
    <li className="enc-calendar-row">
      <Link to={`/encyclopedia/${item.id}`} className="enc-calendar-link">
        <ProduceThumb item={item} size="sm" />
        <div className="enc-calendar-main">
          <strong>{item.name}</strong>
          <span className="enc-calendar-season">{seasonSummary(item)}</span>
          <span className="enc-calendar-meta">{item.ship} 배송 · 클레임 {item.risk} · ★{item.level}{stat ? ` · 월 검색 ${formatCount(stat.total)}` : ""}</span>
          <MiniSeasonBar item={item} month={month} />
          {extra}
        </div>
        <div className="enc-calendar-side">
          <span className={`produce-phase phase-${phaseClass(phase)}`}>{PHASE_META[phase].label}</span>
          <StockBadge count={count} loading={loading} compact />
        </div>
      </Link>
      <FavoriteButton item={item} favorite={favorite} onToggle={onToggle} />
    </li>
  );
}

// ───────── 내 후보 ─────────
export function EncyclopediaFavoritesPage() {
  const month = useSeoulMonth();
  const store = useEncyclopediaStore();
  const { toggle } = useFavoriteProduce();
  const { loading, grouped } = useEncyclopediaCatalog();
  const stats = useProduceSearchStats();
  const items = store.favorites.map((id) => findProduceItem(id)).filter((item): item is ProduceItem => Boolean(item));
  return (
    <EncyclopediaLayout className="encyclopedia-favorites">
      <div className="enc-page-head">
        <h1>내 후보 <small>{items.length}개</small></h1>
        <p>하트를 누른 품목이 여기에 모여요. 품목을 눌러 두고푸드 공급가를 보거나 산지 문의 메시지를 복사하세요.</p>
      </div>
      <SyncCard />
      {items.length === 0 ? (
        <div className="empty-state encyclopedia-empty">
          <Heart size={30} />
          <strong>아직 담은 품목이 없어요.</strong>
          <span>첫 상품 찾기로 추천을 받거나, 시즌 캘린더에서 하트를 눌러 보세요.</span>
          <div className="enc-empty-actions">
            <Link to="/encyclopedia/finder" className="produce-doogo-request">첫 상품 찾기 <ChevronRight size={16} aria-hidden="true" /></Link>
            <Link to="/encyclopedia/calendar" className="enc-secondary-link">시즌 캘린더 보기</Link>
          </div>
        </div>
      ) : (
        <ul className="enc-calendar-rows enc-favorite-rows">
          {items.map((item) => {
            const total = produceChecklist(item).length;
            const done = (store.checks[item.id] ?? []).filter(Boolean).length;
            return (
              <CalendarRow
                key={item.id}
                item={item}
                month={month}
                count={grouped.get(item.id)?.length ?? 0}
                loading={loading}
                favorite
                onToggle={toggle}
                stat={searchStatOf(stats, item)}
                extra={<span className={`enc-check-progress${done === total ? " is-done" : ""}`}><ListChecks size={13} aria-hidden="true" /> 산지 확인 {done}/{total}</span>}
              />
            );
          })}
        </ul>
      )}
    </EncyclopediaLayout>
  );
}

function SyncCard() {
  const store = useEncyclopediaStore();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const code = await createSyncCode();
      toast.success(`기기 옮기기 코드 ${code}를 만들었어요.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "코드를 만들지 못했어요.");
    } finally {
      setBusy(false);
    }
  };
  const link = async () => {
    if (!input.trim()) return;
    if (store.favorites.length > 0 && !window.confirm("이 기기의 내 후보가 코드에 저장된 후보로 바뀌어요. 계속할까요?")) return;
    setBusy(true);
    try {
      const saved = await linkSyncCode(input);
      setInput("");
      toast.success(`코드 ${saved.code}의 후보 ${saved.favorites.length}개를 불러왔어요.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "코드를 불러오지 못했어요.");
    } finally {
      setBusy(false);
    }
  };
  const statusText = store.syncStatus === "saving" ? "저장하는 중…" : store.syncStatus === "error" ? "저장하지 못했어요. 인터넷 연결을 확인해 주세요." : "바뀔 때마다 자동으로 저장돼요.";
  return (
    <section className="enc-sync" aria-labelledby="enc-sync-title">
      <span className="enc-sync-icon" aria-hidden="true"><Smartphone size={20} /></span>
      <div className="enc-sync-body">
        <h2 id="enc-sync-title">다른 기기에서도 보기</h2>
        {store.code ? (
          <>
            <p>휴대폰·PC에서 아래 코드를 입력하면 같은 후보와 체크 기록이 보여요. {statusText}</p>
            <div className="enc-sync-code">
              <b aria-label={`기기 옮기기 코드 ${store.code.split("").join(" ")}`}>{store.code}</b>
              <button
                type="button"
                onClick={async () => {
                  const copied = await copyText(store.code ?? "");
                  if (copied) toast.success("코드를 복사했어요.");
                  else toast.error("복사하지 못했어요. 코드를 직접 적어 주세요.");
                }}
              >
                <Copy size={14} aria-hidden="true" /> 복사
              </button>
              <button type="button" className="enc-sync-unlink" onClick={() => { unlinkSync(); toast.success("이 기기와 코드 연결을 끊었어요. 후보는 이 기기에 그대로 남아요."); }}><X size={14} aria-hidden="true" /> 연결 끊기</button>
            </div>
          </>
        ) : (
          <>
            <p>로그인 없이 6자리 코드로 후보를 옮길 수 있어요. 코드만 알면 후보를 볼 수 있으니 다른 사람에게는 알려 주지 마세요(이름·연락처는 저장하지 않아요).</p>
            <div className="enc-sync-actions">
              <button type="button" className="produce-doogo-request" disabled={busy} onClick={() => void create()}><Link2 size={15} aria-hidden="true" /> 기기 옮기기 코드 만들기</button>
              <form className="enc-sync-form" onSubmit={(event) => { event.preventDefault(); void link(); }}>
                <input value={input} onChange={(event) => setInput(event.target.value.toUpperCase())} maxLength={9} placeholder="받은 코드 입력" aria-label="기기 옮기기 코드 입력" />
                <button type="submit" disabled={busy || !input.trim()}>불러오기</button>
              </form>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ───────── 상세 ─────────
const SHIP_HINT: Record<ProduceItem["ship"], string> = {
  상온: "일반 택배로 보낼 수 있어요",
  냉장: "아이스팩·보냉 포장이 필요해요",
  냉동: "얼린 채 아이스박스로 보내요"
};
const RISK_HINT: Record<ProduceItem["risk"], string> = {
  낮음: "상하거나 깨질 걱정이 적어요",
  보통: "포장·보관 안내를 꼼꼼히 챙기세요",
  높음: "배송 사고가 잦아요. 보상 기준부터 정하세요"
};
const RISK_CLASS: Record<ProduceItem["risk"], string> = { 낮음: "low", 보통: "mid", 높음: "high" };

function nextSaleMonth(item: ProduceItem, month: number) {
  for (let step = 1; step <= 12; step += 1) {
    const next = ((month - 1 + step) % 12) + 1;
    if (isSelling(item, next)) return next;
  }
  return null;
}

export function EncyclopediaDetailPage() {
  const { id } = useParams();
  const item = findProduceItem(id);
  const month = useSeoulMonth();
  const { catalog, loading, grouped } = useEncyclopediaCatalog();
  const stats = useProduceSearchStats();
  const { favorites, toggle } = useFavoriteProduce();
  if (!item) {
    return (
      <EncyclopediaLayout>
        <div className="empty-state encyclopedia-empty">
          <PackageSearch size={30} />
          <strong>찾는 품목이 없어요.</strong>
          <span>시즌 캘린더에서 다시 골라 주세요.</span>
          <Link to="/encyclopedia/calendar" className="produce-doogo-request">시즌 캘린더로 가기 <ChevronRight size={16} /></Link>
        </div>
      </EncyclopediaLayout>
    );
  }
  return (
    <ProduceDetail
      key={item.id}
      item={item}
      month={month}
      catalog={catalog}
      loading={loading}
      grouped={grouped}
      stat={searchStatOf(stats, item)}
      favorite={favorites.includes(item.id)}
      onToggleFavorite={toggle}
    />
  );
}

function ProduceDetail({
  item,
  month,
  catalog,
  loading,
  grouped,
  stat,
  favorite,
  onToggleFavorite
}: {
  item: ProduceItem;
  month: number;
  catalog: CatalogData | null;
  loading: boolean;
  grouped: Map<string, Product[]>;
  stat?: ProduceSearchStat;
  favorite: boolean;
  onToggleFavorite: (id: string) => boolean;
}) {
  const navigate = useNavigate();
  const store = useEncyclopediaStore();
  const phase = phaseOf(item, month);
  const selling = isSelling(item, month);
  const sales = salesMonths(item);
  const peaks = peakMonths(item);
  const products = useMemo(() => grouped.get(item.id) ?? [], [grouped, item.id]);
  const categories = useMemo(() => catalog?.categories ?? [], [catalog]);
  const policyById = useMemo(() => new Map((catalog?.shippingPolicies ?? []).map((policy) => [policy.id, policy])), [catalog]);
  // 판매중 상품을 먼저, 그다음 시즌 종료·품절(같은 상태 안에서는 단가표 순서)
  const statusById = useMemo(() => {
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    return new Map(products.map((product) => [product.id, supplyStatus(product, seasonApplies(product, categoryById.get(product.categoryId)?.name), month)]));
  }, [categories, month, products]);
  const sortedProducts = useMemo(() => {
    const rank = (product: Product) => ({ on_sale: 0, season_ended: 1, sold_out: 2 })[statusById.get(product.id) ?? "on_sale"];
    return [...products].sort((first, second) => rank(first) - rank(second));
  }, [products, statusById]);
  const onSaleCount = products.filter((product) => statusById.get(product.id) === "on_sale").length;
  // 단가표 카드가 길어 휴대폰에서는 1개, PC에서는 3개를 먼저 보여 줍니다.
  const compact = useMediaQuery("(max-width: 720px)");
  const initialCount = compact ? 1 : 3;
  const [showAllProducts, setShowAllProducts] = useState(false);
  const visibleProducts = showAllProducts ? sortedProducts : sortedProducts.slice(0, initialCount);
  const [imagePreview, setImagePreview] = useState<{ src: string; alt: string } | null>(null);
  const [shippingInfo, setShippingInfo] = useState<{ product: Product; policy?: PublicShippingPolicy } | null>(null);
  const checklist = produceChecklist(item);
  const checked = Array.from({ length: checklist.length }, (_, index) => store.checks[item.id]?.[index] === true);
  const checkedCount = checked.filter(Boolean).length;
  const message = produceInquiryMessage(item);
  const related = relatedProduceItems(item, 6);
  const next = selling ? null : nextSaleMonth(item, month);
  const naverShopping = `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(item.keyword)}`;
  const naverSearch = `https://search.naver.com/search.naver?query=${encodeURIComponent(item.keyword)}`;

  return (
    <EncyclopediaLayout className="produce-detail-page">
      <Link
        to="/encyclopedia/calendar"
        className="produce-back"
        onClick={(event) => {
          // 목록에서 들어왔으면 뒤로 가기로 돌아가 고른 달·검색어를 그대로 둡니다.
          const state = window.history.state as { idx?: number } | null;
          if ((state?.idx ?? 0) > 0) {
            event.preventDefault();
            navigate(-1);
          }
        }}
      >
        <ArrowLeft size={16} aria-hidden="true" /> 목록으로
      </Link>

      <div className="produce-detail-top">
        <div className="produce-detail-thumb">
          <ProduceThumb item={item} size="lg" />
          <PhaseBadge item={item} month={month} />
        </div>

        <section className="produce-doogo" aria-labelledby="produce-doogo-title">
          <div className="produce-doogo-head">
            <div>
              <span className="section-kicker">DOOGO PRICE</span>
              <h2 id="produce-doogo-title">두고푸드 공급가</h2>
              <p>
                {loading
                  ? "두고푸드 단가표를 확인하고 있어요."
                  : products.length > 0
                    ? `두고푸드에서 바로 받을 수 있는 ${item.name} 상품 ${products.length}개 · 지금 판매중 ${onSaleCount}개`
                    : `${item.name}은(는) 아직 두고푸드에 없는 품목이에요.`}
              </p>
            </div>
            {!loading && products.length > 0 && (
              <div className="produce-doogo-actions">
                <Link to={`/?q=${encodeURIComponent(catalogSearchWord(item))}`} className="produce-doogo-all">단가표에서 보기 <ChevronRight size={16} aria-hidden="true" /></Link>
                <a href={DOOGO_MALL_URL} target="_blank" rel="noreferrer" className="produce-doogo-buy"><ShoppingCart size={16} aria-hidden="true" /> 상품 구매하기</a>
              </div>
            )}
          </div>
          {loading ? (
            <div className="catalog-loading-state produce-doogo-loading"><div className="spinner" /><strong>공급가를 불러오고 있습니다.</strong></div>
          ) : products.length > 0 ? (
            <>
              <div className="catalog-table-wrap produce-doogo-table">
                <CatalogProductTable products={visibleProducts} categories={categories} policyById={policyById} currentMonth={month} onImage={setImagePreview} onShipping={setShippingInfo} />
              </div>
              {sortedProducts.length > initialCount && (
                <button type="button" className="produce-doogo-more" aria-expanded={showAllProducts} onClick={() => setShowAllProducts((value) => !value)}>
                  {showAllProducts ? "접기" : `${sortedProducts.length - initialCount}개 더 보기`}
                </button>
              )}
              <p className="produce-doogo-hint">주문은 두고푸드 도매몰에서 해요. 도매몰에 로그인한 뒤 같은 상품코드로 찾으면 됩니다.</p>
            </>
          ) : (
            <div className="produce-doogo-empty">
              <PackageSearch size={26} aria-hidden="true" />
              <div><strong>이 품목을 두고푸드에서 받고 싶다면</strong><span>소싱 요청을 남겨 주시면 산지를 찾아 연락드려요.</span></div>
              <Link to="/sourcing" className="produce-doogo-request">소싱 요청하기 <ChevronRight size={16} aria-hidden="true" /></Link>
            </div>
          )}
        </section>

        <div className="produce-detail-info">
          <nav className="produce-breadcrumb" aria-label="품목 위치">
            <Link to="/encyclopedia">백과사전</Link>
            <ChevronRight size={13} aria-hidden="true" />
            <Link to={`/encyclopedia/calendar?cat=${encodeURIComponent(item.category)}`}>{item.category}</Link>
            <ChevronRight size={13} aria-hidden="true" />
            <span>{item.group}</span>
          </nav>
          <h1>{item.name}</h1>
          <div className="produce-detail-level"><Stars level={item.level} /><span>{LEVEL_LABELS[item.level]}</span></div>
          <p className="produce-detail-season">{seasonSummary(item)}</p>
          <div className="produce-detail-badges"><StockBadge count={products.length} loading={loading} /><TagChips item={item} limit={4} /></div>
          <div className="produce-stat-grid">
            <div className="produce-stat">
              <span>{item.ship === "상온" ? <Truck size={15} aria-hidden="true" /> : <Snowflake size={15} aria-hidden="true" />} 배송</span>
              <strong>{item.ship}</strong>
              <small>{SHIP_HINT[item.ship]}</small>
            </div>
            <div className={`produce-stat risk-${RISK_CLASS[item.risk]}`}>
              <span><ShieldAlert size={15} aria-hidden="true" /> 클레임 리스크</span>
              <strong>{item.risk}</strong>
              <small>{RISK_HINT[item.risk]}</small>
            </div>
            <div className="produce-stat">
              <span><CalendarDays size={15} aria-hidden="true" /> 판매 기간</span>
              <strong>{sales.length === 12 ? "연중" : `${sales.length}개월`}</strong>
              <small>{formatMonthRange(sales)}</small>
            </div>
          </div>
          <div className="produce-detail-actions">
            <FavoriteButton item={item} favorite={favorite} onToggle={onToggleFavorite} withLabel />
            <a className="produce-naver-button" href={naverShopping} target="_blank" rel="noreferrer">네이버 쇼핑 보기 <ExternalLink size={14} aria-hidden="true" /></a>
          </div>
        </div>
      </div>

      <div className="produce-sections">
        <section className="produce-section span-2">
          <h2><CalendarDays size={18} aria-hidden="true" /> 1년 시즌 흐름 {peaks.length > 0 && <small>성수기 {formatMonthRange(peaks)}</small>}</h2>
          <SeasonBar item={item} month={month} />
          <p className="produce-section-note">
            {month}월은 <b className={`phase-text phase-${phaseClass(phase)}`}>{PHASE_META[phase].status}</b>이에요.{" "}
            {selling ? "지금 판매할 수 있어요." : phase === "P" ? "곧 시즌이 열려요. 산지에 미리 연락해 두세요." : next ? `다음 판매는 ${next}월쯤 시작해요.` : ""}
          </p>
        </section>

        <SearchSection item={item} month={month} stat={stat} naverShopping={naverShopping} naverSearch={naverSearch} />

        <section className="produce-section produce-tip">
          <h2><Lightbulb size={18} aria-hidden="true" /> 셀러 팁</h2>
          <p>{item.tip}</p>
        </section>

        <section className="produce-section span-2">
          <h2><MessageSquareText size={18} aria-hidden="true" /> 예상 CS와 미리 막는 법</h2>
          <ol className="produce-cs-list">
            {produceCs(item).map((entry) => (
              <li key={entry.q}>
                <strong>“{entry.q}”</strong>
                <p>{entry.a}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="produce-section">
          <h2><Info size={18} aria-hidden="true" /> 기본 정보</h2>
          <dl className="produce-info-list">
            <div><dt>분류</dt><dd>{item.category} › {item.group}</dd></div>
            {item.grow && <div><dt>재배·형태</dt><dd>{item.grow}</dd></div>}
            {item.origin && <div><dt>주요 산지</dt><dd>{item.origin}</dd></div>}
            <div><dt>판매 기간</dt><dd>{formatMonthRange(sales)}</dd></div>
            <div><dt>성수기</dt><dd>{peaks.length > 0 ? formatMonthRange(peaks) : "연중 고르게"}</dd></div>
            <div><dt>산지 연락 시기</dt><dd>{contactLabel(item)}</dd></div>
            <div><dt>{month}월 상태</dt><dd><span className={`produce-now ${selling ? "on" : phase === "P" ? "prep" : "off"}`}>{selling ? "지금 판매중" : PHASE_META[phase].status}</span></dd></div>
            <div><dt>배송</dt><dd>{item.ship} 배송</dd></div>
            {item.tags && item.tags.length > 0 && <div><dt>잘 팔리는 쓰임</dt><dd>{item.tags.join(" · ")}</dd></div>}
            <div><dt>두고푸드</dt><dd>{loading ? "확인 중" : products.length > 0 ? `보유 ${products.length}개 (판매중 ${onSaleCount}개)` : "미보유 · 소싱 요청 가능"}</dd></div>
          </dl>
          <p className="produce-info-foot">도매·소매 시세는 <a href="https://www.kamis.or.kr/" target="_blank" rel="noreferrer">KAMIS 농산물 유통 정보 <ExternalLink size={12} aria-hidden="true" /></a>에서 확인하세요.</p>
        </section>

        <section className="produce-section">
          <h2><PhoneCall size={18} aria-hidden="true" /> 산지 문의 메시지</h2>
          <p>문자·카카오톡으로 산지에 보낼 첫 문의 예시예요. 상황에 맞게 고쳐 쓰세요.</p>
          <pre className="produce-message">{message}</pre>
          <button
            type="button"
            className="produce-copy-button"
            onClick={async () => {
              const copied = await copyText(message);
              if (copied) toast.success("문의 메시지를 복사했어요. 산지에 붙여 넣어 보내세요.");
              else toast.error("복사하지 못했어요. 메시지를 길게 눌러 직접 복사해 주세요.");
            }}
          >
            <ClipboardCopy size={16} aria-hidden="true" /> 문의 메시지 복사하기
          </button>
        </section>

        <section className="produce-section">
          <h2><ListChecks size={18} aria-hidden="true" /> 산지 확인 체크리스트 <small>{checkedCount}/{checklist.length}</small></h2>
          <ul className="produce-checklist">
            {checklist.map((text, index) => (
              <li key={text}>
                <label>
                  <input type="checkbox" checked={checked[index]} onChange={() => setCheck(item.id, index, !checked[index], checklist.length)} />
                  <span>{text}</span>
                </label>
              </li>
            ))}
          </ul>
          {checkedCount === checklist.length && <p className="produce-check-done"><Check size={15} aria-hidden="true" /> 모두 확인했어요. 이제 상세페이지를 준비해 보세요!</p>}
        </section>

        <section className="produce-section">
          <h2><Sparkles size={18} aria-hidden="true" /> 함께 보면 좋은 품목</h2>
          <div className="produce-related">
            {related.map((other) => {
              const otherPhase = phaseOf(other, month);
              return (
                <Link key={other.id} to={`/encyclopedia/${other.id}`} className="produce-related-item">
                  <ProduceThumb item={other} size="sm" />
                  <div>
                    <strong>{other.name}</strong>
                    <small className={`phase-text phase-${phaseClass(otherPhase)}`}>{month}월 · {PHASE_META[otherPhase].label}</small>
                  </div>
                  {grouped.has(other.id) && <em>두고푸드</em>}
                </Link>
              );
            })}
          </div>
        </section>
      </div>
      {imagePreview && <ImageModal src={imagePreview.src} alt={imagePreview.alt} onClose={() => setImagePreview(null)} />}
      {shippingInfo && <ShippingInfoModal product={shippingInfo.product} policy={shippingInfo.policy} onClose={() => setShippingInfo(null)} />}
    </EncyclopediaLayout>
  );
}

// 네이버 검색: 검색어 + (모아 둔 값이 있으면) 최근 30일 검색수·경쟁·1~12월 추정 그래프·연관 검색어
function SearchSection({ item, month, stat, naverShopping, naverSearch }: { item: ProduceItem; month: number; stat?: ProduceSearchStat; naverShopping: string; naverSearch: string }) {
  const months = stat?.months && stat.months.length === 12 ? stat.months : null;
  const max = months ? Math.max(...months, 1) : 1;
  const peakMonth = months ? months.indexOf(Math.max(...months)) + 1 : null;
  return (
    <section className="produce-section produce-search">
      <h2><Search size={18} aria-hidden="true" /> 네이버 검색 <small>검색어 ‘{item.keyword}’</small></h2>
      {stat && stat.total > 0 ? (
        <div className="produce-search-stats">
          <div><span>최근 30일 검색수</span><strong>{formatCount(stat.total)}</strong><small>PC {formatCount(stat.pc)} · 모바일 {formatCount(stat.mobile)}</small></div>
          {stat.comp && <div><span>광고 경쟁</span><strong>{stat.comp}</strong><small>네이버 검색광고 기준</small></div>}
          {peakMonth && <div><span>가장 많이 찾는 달</span><strong>{peakMonth}월</strong><small>월별 추정 검색수 기준</small></div>}
        </div>
      ) : (
        <p>이 검색어로 경쟁 상품의 가격·구성·후기를 먼저 살펴보세요.</p>
      )}
      {months && (
        <ol className="produce-search-bars" aria-label="1~12월 추정 검색수">
          {months.map((value, index) => (
            <li key={index} className={`${index + 1 === month ? "current" : ""}${index + 1 === peakMonth ? " peak" : ""}`.trim()} title={`${index + 1}월 약 ${formatCount(value)}회`}>
              <i style={{ height: `${Math.max(4, Math.round((value / max) * 100))}%` }} aria-hidden="true" />
              <span>{index + 1}</span>
            </li>
          ))}
        </ol>
      )}
      {stat?.related && stat.related.length > 0 && (
        <div className="produce-related-keywords"><span>연관 검색어</span>{stat.related.map(([keyword, total]) => <i key={keyword}>{keyword} <b>{formatCount(total)}</b></i>)}</div>
      )}
      <div className="produce-keyword">
        <b>{item.keyword}</b>
        <button
          type="button"
          onClick={async () => {
            const copied = await copyText(item.keyword);
            if (copied) toast.success("검색어를 복사했어요.");
            else toast.error("복사하지 못했어요. 길게 눌러 직접 복사해 주세요.");
          }}
        >
          <ClipboardCopy size={14} aria-hidden="true" /> 복사
        </button>
      </div>
      <div className="produce-link-row">
        <a href={naverShopping} target="_blank" rel="noreferrer">네이버 쇼핑 <ExternalLink size={13} aria-hidden="true" /></a>
        <a href={naverSearch} target="_blank" rel="noreferrer">네이버 통합검색 <ExternalLink size={13} aria-hidden="true" /></a>
      </div>
      {stat?.updatedAt && <p className="produce-search-date">네이버 검색광고·데이터랩 자료 · {stat.updatedAt.slice(0, 10).replace(/-/g, ".")} 기준 · 월별 값은 추정치예요.</p>}
    </section>
  );
}
