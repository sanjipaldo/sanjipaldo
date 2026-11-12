// 농수산물 백과사전: 목록(/encyclopedia — 달별 제철 달력·분류·검색·내 후보)과 품목 상세(/encyclopedia/:id).
// 두고푸드 단가표에 있는 품목은 상세 위쪽(썸네일과 품목명 사이)에 A단가·일반공급가를 단가표와 같은 모양으로 보여 줍니다.
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCopy,
  ExternalLink,
  Flame,
  Heart,
  Info,
  Lightbulb,
  ListChecks,
  MessageSquareText,
  PackageSearch,
  PhoneCall,
  Search,
  ShieldAlert,
  Snowflake,
  Sparkles,
  Sprout,
  Store,
  Truck,
  Warehouse,
  X
} from "lucide-react";
import { toast } from "sonner";
import { CatalogProductTable, ImageModal, PageFrame, ShippingInfoModal, loadCatalog, seasonApplies } from "./PublicCatalog";
import type { CatalogData, Product, PublicShippingPolicy } from "./types";
import { supplyStatus } from "@/lib/supply-status";
import {
  LEVEL_LABELS,
  PHASE_META,
  PRODUCE_CATEGORIES,
  SALES_PHASES,
  catalogSearchWord,
  contactLabel,
  findProduceItem,
  formatMonthRange,
  groupProductsByProduce,
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
  type ProduceItem
} from "@/lib/encyclopedia";
import { PhaseBadge, ProduceThumb, SeasonBar, Stars, freshProducts, phaseClass, seasonSummary, useFavoriteProduce, useSeoulMonth } from "./encyclopedia-ui";

// 목록 ↔ 상세를 오갈 때 큰 단가표를 매번 다시 받지 않도록 1분 동안 같이 씁니다.
let catalogCache: { at: number; promise: Promise<CatalogData | null> } | null = null;
function loadCatalogShared() {
  if (!catalogCache || Date.now() - catalogCache.at > 60 * 1000) {
    const promise = loadCatalog().then((data) => {
      if (!data) catalogCache = null;
      return data;
    });
    catalogCache = { at: Date.now(), promise };
  }
  return catalogCache.promise;
}

function useEncyclopediaCatalog() {
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void loadCatalogShared().then((data) => {
      if (!active) return;
      setCatalog(data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);
  const grouped = useMemo(
    () => (catalog ? groupProductsByProduce(freshProducts(catalog.products, catalog.categories)) : new Map<string, Product[]>()),
    [catalog]
  );
  return { catalog, loading, grouped };
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener?.("change", update);
    return () => list.removeEventListener?.("change", update);
  }, [query]);
  return matches;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand("copy");
      area.remove();
      return copied;
    } catch {
      return false;
    }
  }
}

function FavoriteButton({ item, favorite, onToggle, withLabel = false }: { item: ProduceItem; favorite: boolean; onToggle: (id: string) => boolean; withLabel?: boolean }) {
  return (
    <button
      type="button"
      className={`${withLabel ? "produce-candidate" : "produce-fav"}${favorite ? " active" : ""}`}
      aria-pressed={favorite}
      aria-label={withLabel ? undefined : favorite ? `${item.name} 내 후보에서 빼기` : `${item.name} 내 후보에 담기`}
      onClick={() => {
        const added = onToggle(item.id);
        toast.success(added ? `${item.name}을(를) 내 후보에 담았어요.` : `${item.name}을(를) 내 후보에서 뺐어요.`);
      }}
    >
      <Heart size={withLabel ? 17 : 18} fill={favorite ? "currentColor" : "none"} aria-hidden="true" />
      {withLabel && (favorite ? "내 후보에 담김" : "내 후보에 담기")}
    </button>
  );
}

function ProduceCard({ item, month, doogoCount, favorite, onToggle }: { item: ProduceItem; month: number; doogoCount: number; favorite: boolean; onToggle: (id: string) => boolean }) {
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
          {doogoCount > 0 && <span className="produce-doogo-chip"><Store size={13} aria-hidden="true" /> 두고푸드 공급 {doogoCount}개</span>}
        </div>
      </Link>
      <FavoriteButton item={item} favorite={favorite} onToggle={onToggle} />
    </article>
  );
}

type SectionKey = "K" | "H" | "SE" | "P";
const SECTIONS: Array<{ key: SectionKey; title: (month: number) => string; desc: string; icon: ReactNode }> = [
  { key: "K", title: (month) => `${month}월 성수기`, desc: "지금 가장 맛있고 많이 팔리는 품목이에요.", icon: <Flame size={18} /> },
  { key: "H", title: () => "출하 중", desc: "지금 수확해서 내보내는 품목이에요.", icon: <Sprout size={18} /> },
  { key: "SE", title: () => "저장 판매 · 끝물", desc: "저장해 둔 물량이나 시즌 막바지 품목이에요.", icon: <Warehouse size={18} /> },
  { key: "P", title: () => "지금 산지에 연락할 품목", desc: "곧 시즌이 열려요. 미리 산지와 공급 조건을 맞춰 두세요.", icon: <PhoneCall size={18} /> }
];
const PHASE_ORDER: Record<string, number> = { K: 0, H: 1, E: 2, S: 3, P: 4, "-": 5 };

function itemSearchText(item: ProduceItem) {
  return normalizeText([item.name, item.group, item.category, item.keyword, item.origin ?? "", ...(item.match ?? [])].join(" "));
}

export function EncyclopediaPage() {
  const currentMonth = useSeoulMonth();
  const [params, setParams] = useSearchParams();
  const monthParam = Number(params.get("month"));
  const month = Number.isInteger(monthParam) && monthParam >= 1 && monthParam <= 12 ? monthParam : currentMonth;
  const categoryParam = params.get("cat") ?? "";
  const category: ProduceCategory | "all" = (PRODUCE_CATEGORIES as readonly string[]).includes(categoryParam) ? (categoryParam as ProduceCategory) : "all";
  const query = params.get("q") ?? "";
  const onlyDoogo = params.get("doogo") === "1";
  const onlyFavorites = params.get("fav") === "1";
  const { loading, grouped } = useEncyclopediaCatalog();
  const { favorites, toggle } = useFavoriteProduce();
  const favoriteSet = new Set(favorites);
  // 휴대폰에서는 달 버튼이 가로로 넘어가므로 고른 달이 보이게 가운데로 옮깁니다.
  const monthsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = monthsRef.current;
    const active = container?.querySelector<HTMLElement>("button.active");
    if (!container || !active || container.scrollWidth <= container.clientWidth) return;
    container.scrollLeft = active.offsetLeft - (container.clientWidth - active.offsetWidth) / 2;
  }, [month]);

  // 고른 달·분류·검색어는 주소에 남겨 상세에 다녀와도(뒤로 가기) 그대로 보이게 합니다.
  const updateParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const normalizedQuery = normalizeText(query);
  const visible = (item: ProduceItem) =>
    (category === "all" || item.category === category) &&
    (!onlyDoogo || grouped.has(item.id)) &&
    (!onlyFavorites || favoriteSet.has(item.id)) &&
    (!normalizedQuery || itemSearchText(item).includes(normalizedQuery));
  const byDoogoThenLevel = (first: ProduceItem, second: ProduceItem) =>
    Number(grouped.has(second.id)) - Number(grouped.has(first.id)) || second.level - first.level || first.name.localeCompare(second.name, "ko");
  const monthGroups = useMemo(() => itemsForMonth(month), [month]);
  const flatMode = Boolean(normalizedQuery) || onlyFavorites;
  const flatItems = flatMode
    ? produceItems.filter(visible).sort((first, second) => PHASE_ORDER[phaseOf(first, month)] - PHASE_ORDER[phaseOf(second, month)] || byDoogoThenLevel(first, second))
    : [];
  const sections = flatMode ? [] : SECTIONS.map((section) => ({ ...section, items: monthGroups[section.key].filter(visible).sort(byDoogoThenLevel) })).filter((section) => section.items.length > 0);
  const card = (item: ProduceItem) => (
    <ProduceCard key={item.id} item={item} month={month} doogoCount={grouped.get(item.id)?.length ?? 0} favorite={favoriteSet.has(item.id)} onToggle={toggle} />
  );
  const empty = (
    <div className="empty-state encyclopedia-empty">
      <PackageSearch size={30} />
      <strong>{onlyFavorites && !normalizedQuery ? "아직 내 후보에 담은 품목이 없어요." : "조건에 맞는 품목이 없어요."}</strong>
      <span>{onlyFavorites && !normalizedQuery ? "품목 카드의 하트를 눌러 팔고 싶은 품목을 모아 보세요." : "다른 달이나 분류를 골라 보거나 검색어를 바꿔 보세요."}</span>
    </div>
  );

  return (
    <PageFrame>
      <main className="content-page encyclopedia-page">
        <section className="encyclopedia-hero">
          <div className="encyclopedia-hero-copy">
            <span className="hero-eyebrow"><BookOpen size={14} aria-hidden="true" /> 두고푸드 농수산물 백과사전</span>
            <h1>언제, 무엇을 팔면 좋을까?</h1>
            <p>품목 {produceItems.length}개의 제철 시기·배송·클레임 위험·CS 대비법과 산지 문의 메시지까지 한곳에 모았어요. 두고푸드가 공급하는 품목은 A단가·일반공급가도 바로 보여 드려요.</p>
          </div>
          <div className="encyclopedia-hero-stats">
            <div><strong>{produceItems.length}</strong><span>품목</span></div>
            <div><strong>{loading ? "…" : grouped.size}</strong><span>두고푸드 공급</span></div>
            <div><strong>{monthGroups.K.length}</strong><span>{month}월 성수기</span></div>
          </div>
        </section>

        <section className="encyclopedia-panel" aria-label="품목 찾기">
          <div className="encyclopedia-months" role="group" aria-label="달 고르기" ref={monthsRef}>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
              <button key={value} type="button" className={value === month ? "active" : ""} aria-pressed={value === month} onClick={() => updateParam("month", value === currentMonth ? null : String(value))}>
                {value}월{value === currentMonth && <small>이번 달</small>}
              </button>
            ))}
          </div>
          <div className="encyclopedia-toolbar">
            <div className="search-field">
              <Search size={17} />
              <input type="search" value={query} onChange={(event) => updateParam("q", event.target.value || null)} placeholder="품목·산지 검색 (예: 고구마, 굴, 제주)" aria-label="백과사전 품목 검색" />
              {query && <button type="button" className="search-clear" onClick={() => updateParam("q", null)} aria-label="검색어 지우기"><X size={15} /></button>}
            </div>
            <div className="encyclopedia-toggles">
              <button type="button" className={`encyclopedia-toggle${onlyFavorites ? " active" : ""}`} aria-pressed={onlyFavorites} onClick={() => updateParam("fav", onlyFavorites ? null : "1")}>
                <Heart size={15} fill={onlyFavorites ? "currentColor" : "none"} aria-hidden="true" /> 내 후보 <b>{favorites.length}</b>
              </button>
              <button type="button" className={`encyclopedia-toggle${onlyDoogo ? " active" : ""}`} aria-pressed={onlyDoogo} onClick={() => updateParam("doogo", onlyDoogo ? null : "1")}>
                <Store size={15} aria-hidden="true" /> 두고푸드 공급만
              </button>
            </div>
          </div>
          <div className="category-chips encyclopedia-categories">
            <button type="button" className={category === "all" ? "active" : ""} onClick={() => updateParam("cat", null)}>전체 <small>{produceItems.length}</small></button>
            {PRODUCE_CATEGORIES.map((value) => (
              <button key={value} type="button" className={category === value ? "active" : ""} onClick={() => updateParam("cat", value)}>
                {value} <small>{produceItems.filter((item) => item.category === value).length}</small>
              </button>
            ))}
          </div>
        </section>

        {flatMode ? (
          <section className="encyclopedia-section">
            <div className="encyclopedia-section-head">
              <span className="encyclopedia-section-icon"><Search size={18} /></span>
              <div><h2>{onlyFavorites && !normalizedQuery ? "내 후보" : "검색 결과"} <small>{flatItems.length}개</small></h2><p>카드의 배지는 {month}월 기준이에요.</p></div>
            </div>
            {flatItems.length > 0 ? <div className="produce-grid">{flatItems.map(card)}</div> : empty}
          </section>
        ) : sections.length > 0 ? (
          sections.map((section) => (
            <section key={section.key} className={`encyclopedia-section section-${section.key.toLowerCase()}`}>
              <div className="encyclopedia-section-head">
                <span className="encyclopedia-section-icon">{section.icon}</span>
                <div><h2>{section.title(month)} <small>{section.items.length}개</small></h2><p>{section.desc}</p></div>
              </div>
              <div className="produce-grid">{section.items.map(card)}</div>
            </section>
          ))
        ) : (
          empty
        )}
        <p className="encyclopedia-note">시기·산지 정보는 두고푸드가 정리한 참고 자료예요. 지역·날씨·품종에 따라 해마다 달라질 수 있으니 판매 전에 산지에 꼭 확인해 주세요.</p>
      </main>
    </PageFrame>
  );
}

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
    if (SALES_PHASES.includes(phaseOf(item, next))) return next;
  }
  return null;
}

// 산지 확인 체크리스트: 품목마다 이 기기에 저장(저장이 막히면 화면 안에서만)
function useChecklist(id: string, length: number) {
  const key = `doogo:encyclopedia:check:${id}`;
  const [checked, setChecked] = useState<boolean[]>(() => {
    try {
      const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
      return Array.from({ length }, (_, index) => Array.isArray(parsed) && parsed[index] === true);
    } catch {
      return Array.from({ length }, () => false);
    }
  });
  const toggle = (index: number) => {
    setChecked((current) => {
      const next = current.map((value, position) => (position === index ? !value : value));
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // 저장이 막힌 브라우저: 화면에서만 체크합니다.
      }
      return next;
    });
  };
  return [checked, toggle] as const;
}

export function EncyclopediaDetailPage() {
  const { id } = useParams();
  const item = findProduceItem(id);
  const month = useSeoulMonth();
  const { catalog, loading, grouped } = useEncyclopediaCatalog();
  const { favorites, toggle } = useFavoriteProduce();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);
  if (!item) {
    return (
      <PageFrame>
        <main className="content-page encyclopedia-page">
          <div className="empty-state encyclopedia-empty">
            <PackageSearch size={30} />
            <strong>찾는 품목이 없어요.</strong>
            <span>백과사전 목록에서 다시 골라 주세요.</span>
            <Link to="/encyclopedia" className="produce-doogo-request">백과사전으로 가기 <ChevronRight size={16} /></Link>
          </div>
        </main>
      </PageFrame>
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
  favorite,
  onToggleFavorite
}: {
  item: ProduceItem;
  month: number;
  catalog: CatalogData | null;
  loading: boolean;
  grouped: Map<string, Product[]>;
  favorite: boolean;
  onToggleFavorite: (id: string) => boolean;
}) {
  const navigate = useNavigate();
  const phase = phaseOf(item, month);
  const selling = SALES_PHASES.includes(phase);
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
  const [checked, toggleCheck] = useChecklist(item.id, checklist.length);
  const checkedCount = checked.filter(Boolean).length;
  const message = produceInquiryMessage(item);
  const related = relatedProduceItems(item, 6);
  const next = selling ? null : nextSaleMonth(item, month);
  const naverShopping = `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(item.keyword)}`;
  const naverSearch = `https://search.naver.com/search.naver?query=${encodeURIComponent(item.keyword)}`;

  return (
    <PageFrame>
      <main className="content-page encyclopedia-page produce-detail-page">
        <Link
          to="/encyclopedia"
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
          <ArrowLeft size={16} aria-hidden="true" /> 백과사전 목록
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
                      : `${item.name}은(는) 아직 두고푸드 단가표에 없는 품목이에요.`}
                </p>
              </div>
              {!loading && products.length > 0 && (
                <Link to={`/?q=${encodeURIComponent(catalogSearchWord(item))}`} className="produce-doogo-all">단가표에서 보기 <ChevronRight size={16} aria-hidden="true" /></Link>
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
              <Link to={`/encyclopedia?cat=${encodeURIComponent(item.category)}`}>{item.category}</Link>
              <ChevronRight size={13} aria-hidden="true" />
              <span>{item.group}</span>
            </nav>
            <h1>{item.name}</h1>
            <div className="produce-detail-level"><Stars level={item.level} /><span>{LEVEL_LABELS[item.level]}</span></div>
            <p className="produce-detail-season">{seasonSummary(item)}</p>
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
            <h2><CalendarDays size={18} aria-hidden="true" /> 1년 시즌 흐름</h2>
            <SeasonBar item={item} month={month} />
            <p className="produce-section-note">
              {month}월은 <b className={`phase-text phase-${phaseClass(phase)}`}>{PHASE_META[phase].status}</b>이에요.{" "}
              {selling ? "지금 판매할 수 있어요." : phase === "P" ? "곧 시즌이 열려요. 산지에 미리 연락해 두세요." : next ? `다음 판매는 ${next}월쯤 시작해요.` : ""}
            </p>
          </section>

          <section className="produce-section">
            <h2><Search size={18} aria-hidden="true" /> 네이버 검색</h2>
            <p>이 검색어로 경쟁 상품의 가격·구성·후기를 먼저 살펴보세요.</p>
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
          </section>

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
              {item.origin && <div><dt>주요 산지</dt><dd>{item.origin}</dd></div>}
              <div><dt>판매 기간</dt><dd>{formatMonthRange(sales)}</dd></div>
              <div><dt>성수기</dt><dd>{peaks.length > 0 ? formatMonthRange(peaks) : "연중 고르게"}</dd></div>
              <div><dt>산지 연락 시기</dt><dd>{contactLabel(item)}</dd></div>
              <div><dt>{month}월 상태</dt><dd><span className={`produce-now ${selling ? "on" : phase === "P" ? "prep" : "off"}`}>{selling ? "지금 판매중" : PHASE_META[phase].status}</span></dd></div>
              <div><dt>배송</dt><dd>{item.ship} 배송</dd></div>
            </dl>
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
                    <input type="checkbox" checked={checked[index] ?? false} onChange={() => toggleCheck(index)} />
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
        <p className="encyclopedia-note">시기·산지 정보는 두고푸드가 정리한 참고 자료예요. 지역·날씨·품종에 따라 해마다 달라질 수 있으니 판매 전에 산지에 꼭 확인해 주세요.</p>
      </main>
      {imagePreview && <ImageModal src={imagePreview.src} alt={imagePreview.alt} onClose={() => setImagePreview(null)} />}
      {shippingInfo && <ShippingInfoModal product={shippingInfo.product} policy={shippingInfo.policy} onClose={() => setShippingInfo(null)} />}
    </PageFrame>
  );
}
