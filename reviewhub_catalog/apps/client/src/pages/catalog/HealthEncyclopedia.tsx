// 건강식품 백과사전: 고민별 찾기(/encyclopedia/health) · 고민 상세(/encyclopedia/health/concern/:id) · 원료 사전(/encyclopedia/health/ingredients) ·
// 원료 상세(/encyclopedia/health/ingredient/:id) · 판매 전 체크(/encyclopedia/health/guide).
// 셀러가 "이런 고민의 고객에게 무엇을 팔지", "내 상품 원료로 어떤 말을 써도 되는지" 아이디어를 얻는 화면이에요.
// 두고푸드 건강식품(국내·해외) 상품을 원료 이름으로 잇고, 단가표 카드(A단가·일반공급가)와 "상품 구매하기"(도매몰)로 이어집니다.
import { type FormEvent, type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Ban,
  BadgeCheck,
  CalendarHeart,
  Check,
  ChevronRight,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FlaskConical,
  HeartPulse,
  Info,
  Lightbulb,
  Megaphone,
  MessageSquareText,
  PackageSearch,
  Pill,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Store,
  Users,
  X
} from "lucide-react";
import { toast } from "sonner";
import { supplyStatus } from "@/lib/supply-status";
import {
  GENERIC_HEALTH_CS,
  HEALTH_DISCLAIMER,
  HEALTH_GROUPS,
  HEALTH_TYPES,
  HEALTH_TYPE_META,
  concernProductCount,
  concernsForMonth,
  concernsOfIngredient,
  coreIngredientsOf,
  findHealthConcern,
  findHealthIngredient,
  foodIngredientsOf,
  formatConcernMonths,
  groupProductsByIngredient,
  healthConcerns,
  healthGroupOf,
  healthIconLength,
  healthIngredients,
  relatedConcernsOf,
  searchHealth,
  type HealthConcern,
  type HealthGroupId,
  type HealthIngredient,
  type HealthIngredientType
} from "@/lib/health-encyclopedia";
import { useSharedCatalog } from "./catalog-cache";
import { EncyclopediaFrame, copyText, useMediaQuery } from "./encyclopedia-frame";
import { CatalogProductTable, ImageModal, ShippingInfoModal, seasonApplies, seoulMonth } from "./PublicCatalog";
import type { CatalogData, Product, PublicShippingPolicy } from "./types";

// 두고푸드 도매몰(위탁셀러 주문 입력). 농축수산 백과사전의 "상품 구매하기"와 같은 주소예요.
const DOOGO_MALL_URL = "https://shop.baljuora.com/doogofood";

function useHealthCatalog() {
  const { catalog, loading } = useSharedCatalog();
  const grouped = useMemo(() => {
    if (!catalog) return new Map<string, Product[]>();
    return groupProductsByIngredient(catalog.products, new Map(catalog.categories.map((category) => [category.id, category.name])));
  }, [catalog]);
  return { catalog, loading, grouped };
}

function HealthTabs() {
  const { pathname } = useLocation();
  const tabs = [
    { to: "/encyclopedia/health", label: "고민별 찾기", icon: <HeartPulse size={16} aria-hidden="true" />, active: pathname === "/encyclopedia/health" || pathname.startsWith("/encyclopedia/health/concern") },
    { to: "/encyclopedia/health/ingredients", label: "원료 사전", icon: <FlaskConical size={16} aria-hidden="true" />, active: pathname.startsWith("/encyclopedia/health/ingredient") },
    { to: "/encyclopedia/health/guide", label: "판매 전 체크", icon: <ShieldCheck size={16} aria-hidden="true" />, active: pathname.startsWith("/encyclopedia/health/guide") }
  ];
  return (
    <div className="encyclopedia-tabs-bar">
      <nav className="encyclopedia-tabs is-three" aria-label="건강식품 백과사전 메뉴">
        {tabs.map((tab) => (
          <Link key={tab.to} to={tab.to} className={tab.active ? "active" : ""} aria-current={tab.active ? "page" : undefined}>
            {tab.icon}<span>{tab.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

function HealthLayout({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <EncyclopediaFrame kind="health" tabs={<HealthTabs />} note={HEALTH_DISCLAIMER} className={`health-page ${className}`.trim()}>
      {children}
    </EncyclopediaFrame>
  );
}

function HealthIcon({ icon }: { icon: string }) {
  const length = healthIconLength(icon);
  return <span className={`hl-icon${length ? ` is-glyph len-${Math.min(length, 4)}` : ""}`} aria-hidden="true">{icon}</span>;
}

function IngredientTile({ item, size = "md" }: { item: HealthIngredient; size?: "sm" | "md" | "lg" }) {
  return <span className={`hl-tile hl-t-${item.type} size-${size}`}><HealthIcon icon={item.icon} /></span>;
}

function TypeBadge({ type }: { type: HealthIngredientType }) {
  return <span className={`hl-type hl-t-${type}`}>{HEALTH_TYPE_META[type].label}</span>;
}

function StockBadge({ count, loading }: { count: number; loading: boolean }) {
  if (loading) return null;
  return count > 0
    ? <span className="produce-stock is-in"><Store size={12} aria-hidden="true" /> 두고푸드 보유 {count}개</span>
    : <span className="produce-stock is-out">두고푸드 미보유</span>;
}

// 원료의 대표 문구 한 줄(일반식품은 효능 표현 불가 안내)
function claimLine(item: HealthIngredient) {
  if (item.claims.length > 0) return item.claims[0];
  return item.type === "food" ? "효능 표현 불가 · 원료·원산지·함량·맛으로 소개해요" : "인정받은 제품만 그 제품 포장의 문구를 써요";
}

function BackLink({ to, label }: { to: string; label: string }) {
  const navigate = useNavigate();
  return (
    <Link
      to={to}
      className="produce-back"
      onClick={(event) => {
        // 목록에서 들어왔으면 뒤로 가기로 돌아가 고른 분류·검색어를 그대로 둡니다.
        const state = window.history.state as { idx?: number } | null;
        if ((state?.idx ?? 0) > 0) {
          event.preventDefault();
          navigate(-1);
        }
      }}
    >
      <ArrowLeft size={16} aria-hidden="true" /> {label}
    </Link>
  );
}

function SectionHead({ id, icon, title, desc, children }: { id?: string; icon: ReactNode; title: string; desc?: string; children?: ReactNode }) {
  return (
    <div className="hl-section-head">
      <span className="hl-section-icon" aria-hidden="true">{icon}</span>
      <div>
        <h2 id={id}>{title}</h2>
        {desc && <p>{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function ConcernCard({ concern, grouped, loading }: { concern: HealthConcern; grouped: Map<string, Product[]>; loading: boolean }) {
  const core = coreIngredientsOf(concern);
  return (
    <Link to={`/encyclopedia/health/concern/${concern.id}`} className="hl-concern-card">
      <span className="hl-concern-emoji" aria-hidden="true">{concern.emoji}</span>
      <span className="hl-concern-body">
        <small>{healthGroupOf(concern.group).name}</small>
        <strong>{concern.name}</strong>
        <span className="hl-concern-desc">{concern.desc}</span>
        <span className="hl-chip-row">
          {core.slice(0, 3).map((item) => <i key={item.id} className={`hl-t-${item.type}`}>{item.name}</i>)}
          {core.length > 3 && <i className="is-more">+{core.length - 3}</i>}
        </span>
        <StockBadge count={concernProductCount(concern, grouped)} loading={loading} />
      </span>
      <ChevronRight className="hl-card-arrow" size={18} aria-hidden="true" />
    </Link>
  );
}

function IngredientRow({ item, grouped, loading }: { item: HealthIngredient; grouped: Map<string, Product[]>; loading: boolean }) {
  const concerns = concernsOfIngredient(item.id);
  return (
    <Link to={`/encyclopedia/health/ingredient/${item.id}`} className="hl-ing-row">
      <IngredientTile item={item} size="sm" />
      <span className="hl-ing-row-main">
        <span className="hl-ing-row-title"><strong>{item.name}</strong><TypeBadge type={item.type} /></span>
        {item.aka && <small>{item.aka}</small>}
        <span className="hl-ing-row-claim">{claimLine(item)}</span>
        {concerns.length > 0 && (
          <span className="hl-chip-row is-plain">{concerns.slice(0, 3).map((concern) => <i key={concern.id}>{concern.emoji} {concern.name}</i>)}</span>
        )}
      </span>
      <span className="hl-ing-row-side"><StockBadge count={grouped.get(item.id)?.length ?? 0} loading={loading} /></span>
    </Link>
  );
}

// ── 고민별 찾기(홈) ───────────────────────────────────────────────────
const SUGGESTED_SEARCHES = ["눈", "관절", "유산균", "홍삼", "다이어트", "콜라겐", "갱년기", "프로폴리스"];

export function HealthHomePage() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q")?.trim() ?? "";
  const groupParam = params.get("group");
  const group = HEALTH_GROUPS.some((item) => item.id === groupParam) ? (groupParam as HealthGroupId) : null;
  const [draft, setDraft] = useState(query);
  useEffect(() => setDraft(query), [query]);
  const month = seoulMonth(new Date());
  const { loading, grouped } = useHealthCatalog();
  const result = useMemo(() => searchHealth(query), [query]);
  const monthConcerns = concernsForMonth(month);
  const visible = group ? healthConcerns.filter((concern) => concern.group === group) : healthConcerns;
  const carried = healthIngredients.filter((item) => (grouped.get(item.id)?.length ?? 0) > 0).length;
  const update = (next: Record<string, string | null>) => {
    const copy = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) copy.set(key, value);
      else copy.delete(key);
    }
    setParams(copy, { replace: true });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    update({ q: draft.trim() || null });
  };

  return (
    <HealthLayout className="health-home">
      <section className="hl-hero" aria-labelledby="hl-hero-title">
        <div>
          <span className="hl-hero-kicker"><Pill size={14} aria-hidden="true" /> 두고푸드 건강식품 백과사전</span>
          <h1 id="hl-hero-title">어떤 고민을 가진 고객에게 팔까요?</h1>
          <p>고민을 고르면 팔기 좋은 원료, 써도 되는 문구와 쓰면 안 되는 문구, 두고푸드 상품까지 한 번에 보여 드려요.</p>
          <form className="hl-search" role="search" onSubmit={submit}>
            <Search size={18} aria-hidden="true" />
            <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="고민·원료 검색 (예: 눈 피로, 루테인, 관절)" aria-label="고민·원료 검색" />
            {draft && <button type="button" className="hl-search-clear" aria-label="검색어 지우기" onClick={() => { setDraft(""); update({ q: null }); }}><X size={16} aria-hidden="true" /></button>}
            <button type="submit">찾기</button>
          </form>
        </div>
        <div className="hl-hero-stats">
          <a href="#hl-concerns"><strong>{healthConcerns.length}</strong><span>고객 고민</span></a>
          <Link to="/encyclopedia/health/ingredients"><strong>{healthIngredients.length}</strong><span>원료</span></Link>
          <Link to="/encyclopedia/health/ingredients?doogo=1"><strong>{loading ? "…" : carried}</strong><span>두고푸드 보유 원료</span></Link>
          <Link to="/encyclopedia/health/guide"><strong>6</strong><span>판매 전 체크</span></Link>
        </div>
      </section>

      {query ? (
        <section className="hl-section hl-results" aria-labelledby="hl-results-title">
          <SectionHead id="hl-results-title" icon={<Search size={18} />} title={`'${query}' 검색 결과`} desc={`고민 ${result.concerns.length}개 · 원료 ${result.ingredients.length}개`}>
            <button type="button" className="enc-more hl-results-clear" onClick={() => update({ q: null })}>검색 지우기 <X size={14} aria-hidden="true" /></button>
          </SectionHead>
          {result.concerns.length + result.ingredients.length === 0 ? (
            <div className="hl-empty">
              <PackageSearch size={28} aria-hidden="true" />
              <strong>찾는 고민·원료가 없어요.</strong>
              <span>이렇게 찾아보세요</span>
              <div className="hl-chip-row is-suggest">{SUGGESTED_SEARCHES.map((word) => <button key={word} type="button" onClick={() => update({ q: word })}>{word}</button>)}</div>
            </div>
          ) : (
            <>
              {result.concerns.length > 0 && (
                <div className="hl-concern-grid">{result.concerns.map((concern) => <ConcernCard key={concern.id} concern={concern} grouped={grouped} loading={loading} />)}</div>
              )}
              {result.ingredients.length > 0 && (
                <div className="hl-ing-list hl-results-ings">{result.ingredients.map((item) => <IngredientRow key={item.id} item={item} grouped={grouped} loading={loading} />)}</div>
              )}
            </>
          )}
        </section>
      ) : (
        monthConcerns.length > 0 && (
          <section className="hl-section hl-month" aria-labelledby="hl-month-title">
            <SectionHead id="hl-month-title" icon={<CalendarHeart size={18} />} title={`${month}월에 많이 찾는 고민`} desc="시즌·명절·날씨에 맞춰 미리 상품을 준비해 보세요." />
            <div className="hl-month-list">
              {monthConcerns.map((concern) => (
                <Link key={concern.id} to={`/encyclopedia/health/concern/${concern.id}`}>
                  <span aria-hidden="true">{concern.emoji}</span>{concern.name}
                  {!loading && <small>보유 {concernProductCount(concern, grouped)}개</small>}
                </Link>
              ))}
            </div>
          </section>
        )
      )}

      <section className="hl-concerns" id="hl-concerns" aria-labelledby="hl-concerns-title">
        <div className="hl-concerns-head">
          <h2 id="hl-concerns-title">고민별로 찾기</h2>
          <p>고민을 누르면 팔기 좋은 원료와 문구, 두고푸드 상품을 보여 드려요.</p>
        </div>
        <div className="hl-group-chips" role="group" aria-label="고민 분류">
          <button type="button" className={group ? "" : "active"} aria-pressed={!group} onClick={() => update({ group: null })}>전체 <b>{healthConcerns.length}</b></button>
          {HEALTH_GROUPS.map((item) => (
            <button key={item.id} type="button" className={group === item.id ? "active" : ""} aria-pressed={group === item.id} onClick={() => update({ group: group === item.id ? null : item.id })}>
              <span aria-hidden="true">{item.emoji}</span>{item.name} <b>{healthConcerns.filter((concern) => concern.group === item.id).length}</b>
            </button>
          ))}
        </div>
        <div className="hl-concern-grid">{visible.map((concern) => <ConcernCard key={concern.id} concern={concern} grouped={grouped} loading={loading} />)}</div>
      </section>

      <section className="hl-guide-cta" aria-labelledby="hl-guide-cta-title">
        <span className="hl-guide-cta-icon" aria-hidden="true"><ShieldAlert size={22} /></span>
        <div>
          <h2 id="hl-guide-cta-title">건강식품은 '쓰는 말'이 절반이에요</h2>
          <p>같은 원료라도 건강기능식품이 아니면 효능을 말할 수 없어요. 판매 전에 영업신고·광고 문구·금지 표현을 꼭 확인하세요.</p>
        </div>
        <Link to="/encyclopedia/health/guide" className="produce-doogo-request">판매 전 체크 보기 <ChevronRight size={16} aria-hidden="true" /></Link>
      </section>
    </HealthLayout>
  );
}

// ── 두고푸드 상품 칸(고민·원료 상세 공용) ───────────────────────────────
function DoogoProducts({ products, catalog, loading, keyword, name }: { products: Product[]; catalog: CatalogData | null; loading: boolean; keyword: string; name: string }) {
  const month = seoulMonth(new Date());
  const categories = useMemo(() => catalog?.categories ?? [], [catalog]);
  const policyById = useMemo(() => new Map((catalog?.shippingPolicies ?? []).map((policy) => [policy.id, policy])), [catalog]);
  // 판매중 상품을 먼저, 그다음 시즌 종료·품절(같은 상태 안에서는 단가표 순서)
  const statusById = useMemo(() => {
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    return new Map(products.map((product) => [product.id, supplyStatus(product, seasonApplies(product, categoryById.get(product.categoryId)?.name), month)]));
  }, [categories, month, products]);
  const sorted = useMemo(() => {
    const rank = (product: Product) => ({ on_sale: 0, season_ended: 1, sold_out: 2 })[statusById.get(product.id) ?? "on_sale"];
    return [...products].sort((first, second) => rank(first) - rank(second));
  }, [products, statusById]);
  const onSale = products.filter((product) => statusById.get(product.id) === "on_sale").length;
  const compact = useMediaQuery("(max-width: 720px)");
  const initialCount = compact ? 1 : 3;
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? sorted : sorted.slice(0, initialCount);
  const [imagePreview, setImagePreview] = useState<{ src: string; alt: string } | null>(null);
  const [shippingInfo, setShippingInfo] = useState<{ product: Product; policy?: PublicShippingPolicy } | null>(null);
  const titleId = useId();

  return (
    <section className="produce-doogo hl-doogo" aria-labelledby={titleId}>
      <div className="produce-doogo-head">
        <div>
          <span className="section-kicker">DOOGO PRICE</span>
          <h2 id={titleId}>두고푸드 공급가</h2>
          <p>
            {loading
              ? "두고푸드 단가표를 확인하고 있어요."
              : products.length > 0
                ? `두고푸드에서 바로 받을 수 있는 ${name} 상품 ${products.length}개 · 지금 판매중 ${onSale}개`
                : `${name} 상품은 아직 두고푸드에 없어요.`}
          </p>
        </div>
        {!loading && products.length > 0 && (
          <div className="produce-doogo-actions">
            <Link to={`/?q=${encodeURIComponent(keyword)}`} className="produce-doogo-all">단가표에서 보기 <ChevronRight size={16} aria-hidden="true" /></Link>
            <a href={DOOGO_MALL_URL} target="_blank" rel="noreferrer" className="produce-doogo-buy"><ShoppingCart size={16} aria-hidden="true" /> 상품 구매하기</a>
          </div>
        )}
      </div>
      {loading ? (
        <div className="catalog-loading-state produce-doogo-loading"><div className="spinner" /><strong>공급가를 불러오고 있습니다.</strong></div>
      ) : products.length > 0 ? (
        <>
          <div className="catalog-table-wrap produce-doogo-table">
            <CatalogProductTable products={visible} categories={categories} policyById={policyById} currentMonth={month} onImage={setImagePreview} onShipping={setShippingInfo} />
          </div>
          {sorted.length > initialCount && (
            <button type="button" className="produce-doogo-more" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)}>
              {showAll ? "접기" : `${sorted.length - initialCount}개 더 보기`}
            </button>
          )}
          <p className="produce-doogo-hint">상품명에 원료 이름이 든 상품을 모았어요. 상세페이지 문구는 상품마다 포장의 표시사항(건강기능식품 여부)을 확인한 뒤 쓰세요.</p>
        </>
      ) : (
        <div className="produce-doogo-empty">
          <PackageSearch size={26} aria-hidden="true" />
          <div><strong>이 원료 상품을 두고푸드에서 받고 싶다면</strong><span>소싱 요청을 남겨 주시면 공급처를 찾아 연락드려요.</span></div>
          <Link to="/sourcing" className="produce-doogo-request">소싱 요청하기 <ChevronRight size={16} aria-hidden="true" /></Link>
        </div>
      )}
      {imagePreview && <ImageModal src={imagePreview.src} alt={imagePreview.alt} onClose={() => setImagePreview(null)} />}
      {shippingInfo && <ShippingInfoModal product={shippingInfo.product} policy={shippingInfo.policy} onClose={() => setShippingInfo(null)} />}
    </section>
  );
}

function PhraseColumns({ ok, ng, okTitle = "이렇게 쓰세요", ngTitle = "이런 말은 안 돼요" }: { ok: string[]; ng: string[]; okTitle?: string; ngTitle?: string }) {
  return (
    <div className="hl-phrases">
      <div className="hl-phrase-col is-ok">
        <h3><BadgeCheck size={17} aria-hidden="true" /> {okTitle}</h3>
        <ul>{ok.map((line) => <li key={line}><Check size={15} aria-hidden="true" />{line}</li>)}</ul>
      </div>
      <div className="hl-phrase-col is-ng">
        <h3><Ban size={17} aria-hidden="true" /> {ngTitle}</h3>
        <ul>{ng.map((line) => <li key={line}><X size={15} aria-hidden="true" /><span>{line}</span></li>)}</ul>
      </div>
    </div>
  );
}

function MonthStrip({ months }: { months: number[] }) {
  const now = seoulMonth(new Date());
  const all = months.length === 0;
  return (
    <div className="hl-months" aria-label={all ? "연중" : `많이 찾는 달 ${months.join(", ")}월`}>
      {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
        <span key={month} className={`${all || months.includes(month) ? "on" : ""}${month === now ? " now" : ""}`.trim()}>{month}</span>
      ))}
    </div>
  );
}

async function copyWithToast(text: string, label: string) {
  const copied = await copyText(text);
  if (copied) toast.success(`${label}을(를) 복사했어요.`);
  else toast.error("복사하지 못했어요. 직접 선택해 복사해 주세요.");
}

function NotFound({ what, to, label }: { what: string; to: string; label: string }) {
  return (
    <HealthLayout>
      <div className="empty-state encyclopedia-empty">
        <PackageSearch size={30} />
        <strong>찾는 {what}이(가) 없어요.</strong>
        <span>목록에서 다시 골라 주세요.</span>
        <Link to={to} className="produce-doogo-request">{label} <ChevronRight size={16} /></Link>
      </div>
    </HealthLayout>
  );
}

// ── 고민 상세 ────────────────────────────────────────────────────────
export function HealthConcernPage() {
  const { id } = useParams();
  const concern = findHealthConcern(id);
  const { catalog, loading, grouped } = useHealthCatalog();
  if (!concern) return <NotFound what="고민" to="/encyclopedia/health" label="고민 목록으로 가기" />;
  return <ConcernDetail key={concern.id} concern={concern} catalog={catalog} loading={loading} grouped={grouped} />;
}

function ConcernDetail({ concern, catalog, loading, grouped }: { concern: HealthConcern; catalog: CatalogData | null; loading: boolean; grouped: Map<string, Product[]> }) {
  const core = coreIngredientsOf(concern);
  const foods = foodIngredientsOf(concern);
  const related = relatedConcernsOf(concern);
  const group = healthGroupOf(concern.group);
  const withProducts = core.filter((item) => (grouped.get(item.id)?.length ?? 0) > 0);
  const [selected, setSelected] = useState<string | null>(null);
  const active = withProducts.find((item) => item.id === selected) ?? withProducts[0] ?? null;
  const productCount = concernProductCount(concern, grouped);
  const questions = core.slice(0, 3).map((item) => ({ ...item.cs, from: item.name }));

  return (
    <HealthLayout className="health-concern-page">
      <BackLink to="/encyclopedia/health" label="고민 목록으로" />

      <section className="hl-detail-head" aria-labelledby="hl-concern-title">
        <span className="hl-detail-emoji" aria-hidden="true">{concern.emoji}</span>
        <div className="hl-detail-main">
          <nav className="produce-breadcrumb" aria-label="고민 위치">
            <Link to="/encyclopedia/health">건강식품 백과사전</Link>
            <ChevronRight size={13} aria-hidden="true" />
            <Link to={`/encyclopedia/health?group=${concern.group}`}>{group.name}</Link>
          </nav>
          <h1 id="hl-concern-title">{concern.name}</h1>
          <p>{concern.desc}</p>
          <div className="hl-facts">
            <div><span><Users size={14} aria-hidden="true" /> 주 고객</span><strong>{concern.target}</strong></div>
            <div><span><CalendarHeart size={14} aria-hidden="true" /> 많이 찾는 때</span><strong>{formatConcernMonths(concern)}</strong></div>
            <div><span><Store size={14} aria-hidden="true" /> 두고푸드 상품</span><strong>{loading ? "확인 중" : productCount > 0 ? `${productCount}개 보유` : "아직 없음"}</strong></div>
          </div>
          <div className="hl-keywords">
            <span>고객이 이렇게 검색해요</span>
            {concern.keywords.map((word) => <i key={word}>{word}</i>)}
            <button type="button" onClick={() => void copyWithToast(concern.keywords.join(", "), "검색어")}><Copy size={13} aria-hidden="true" /> 검색어 복사</button>
          </div>
        </div>
      </section>

      <section className="hl-section" aria-labelledby="hl-core-title">
        <SectionHead id="hl-core-title" icon={<FlaskConical size={18} />} title="이 고민에 팔기 좋은 원료" desc="원료마다 쓸 수 있는 문구가 달라요. 누르면 원료별 문구·주의점·두고푸드 상품을 볼 수 있어요." />
        <ol className="hl-rank-list">
          {core.map((item, index) => (
            <li key={item.id}>
              <Link to={`/encyclopedia/health/ingredient/${item.id}`} className="hl-rank-item">
                <b className="hl-rank-num">{index + 1}</b>
                <IngredientTile item={item} size="sm" />
                <span className="hl-rank-main">
                  <span className="hl-rank-title"><strong>{item.name}</strong><TypeBadge type={item.type} /></span>
                  <span className="hl-rank-claim">{claimLine(item)}</span>
                </span>
                <span className="hl-rank-side"><StockBadge count={grouped.get(item.id)?.length ?? 0} loading={loading} /><ChevronRight size={16} aria-hidden="true" /></span>
              </Link>
            </li>
          ))}
        </ol>
        {foods.length > 0 && (
          <div className="hl-foods">
            <h3><ShieldAlert size={16} aria-hidden="true" /> 고객이 함께 찾는 상품 <small>건강기능식품이 아니거나 제품마다 달라 효능 표현에 주의해요</small></h3>
            <div className="hl-food-list">
              {foods.map((item) => (
                <Link key={item.id} to={`/encyclopedia/health/ingredient/${item.id}`}>
                  <IngredientTile item={item} size="sm" />
                  <span><strong>{item.name}</strong><small>{HEALTH_TYPE_META[item.type].label}{!loading ? ` · 보유 ${grouped.get(item.id)?.length ?? 0}개` : ""}</small></span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="hl-section" aria-labelledby="hl-phrase-title">
        <SectionHead id="hl-phrase-title" icon={<Megaphone size={18} />} title="상세페이지·광고 문구" desc="괄호 안 원료로 인정받은 건강기능식품일 때만 그 문구를 쓸 수 있어요." />
        <PhraseColumns ok={concern.ok} ng={concern.ng} />
      </section>

      <div className="hl-two">
        <section className="hl-section" aria-labelledby="hl-tip-title">
          <SectionHead id="hl-tip-title" icon={<Lightbulb size={18} />} title="판매 팁" />
          <p className="hl-text">{concern.tip}</p>
          <p className="hl-text hl-season-note"><CalendarHeart size={15} aria-hidden="true" /> {concern.seasonNote}</p>
          <MonthStrip months={concern.months} />
        </section>
        <section className="hl-section" aria-labelledby="hl-cs-title">
          <SectionHead id="hl-cs-title" icon={<MessageSquareText size={18} />} title="예상 고객 질문" />
          <ul className="hl-cs-list">
            {questions.map((item) => (
              <li key={item.q}><strong>Q. {item.q} <small>{item.from}</small></strong><span>A. {item.a}</span></li>
            ))}
            <li><strong>Q. {GENERIC_HEALTH_CS.q}</strong><span>A. {GENERIC_HEALTH_CS.a}</span></li>
          </ul>
        </section>
      </div>

      <section className="hl-section hl-concern-products" aria-labelledby="hl-products-title">
        <SectionHead id="hl-products-title" icon={<Store size={18} />} title="두고푸드에서 바로 팔 수 있는 상품" desc={loading ? "두고푸드 단가표를 확인하고 있어요." : withProducts.length > 0 ? "원료를 고르면 그 원료가 든 두고푸드 상품을 단가표 모양으로 보여 드려요." : "이 고민의 원료 상품은 아직 두고푸드에 없어요."} />
        {withProducts.length > 1 && (
          <div className="hl-group-chips is-small" role="group" aria-label="원료 고르기">
            {withProducts.map((item) => (
              <button key={item.id} type="button" className={active?.id === item.id ? "active" : ""} aria-pressed={active?.id === item.id} onClick={() => setSelected(item.id)}>
                {item.name} <b>{grouped.get(item.id)?.length ?? 0}</b>
              </button>
            ))}
          </div>
        )}
        {active ? (
          <DoogoProducts key={active.id} products={grouped.get(active.id) ?? []} catalog={catalog} loading={loading} keyword={active.keyword} name={active.name} />
        ) : (
          !loading && (
            <div className="produce-doogo-empty">
              <PackageSearch size={26} aria-hidden="true" />
              <div><strong>이 고민의 상품을 두고푸드에서 받고 싶다면</strong><span>원하는 원료와 함께 소싱 요청을 남겨 주세요.</span></div>
              <Link to="/sourcing" className="produce-doogo-request">소싱 요청하기 <ChevronRight size={16} aria-hidden="true" /></Link>
            </div>
          )
        )}
      </section>

      {related.length > 0 && (
        <section className="hl-section" aria-labelledby="hl-related-title">
          <SectionHead id="hl-related-title" icon={<HeartPulse size={18} />} title="함께 보면 좋은 고민" />
          <div className="hl-concern-grid is-compact">{related.map((item) => <ConcernCard key={item.id} concern={item} grouped={grouped} loading={loading} />)}</div>
        </section>
      )}
    </HealthLayout>
  );
}

// ── 원료 사전 ────────────────────────────────────────────────────────
export function HealthIngredientsPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q")?.trim() ?? "";
  const typeParam = params.get("type");
  const type = HEALTH_TYPES.includes(typeParam as HealthIngredientType) ? (typeParam as HealthIngredientType) : null;
  const onlyDoogo = params.get("doogo") === "1";
  const sort = params.get("sort") === "name" ? "name" : "stock";
  const [draft, setDraft] = useState(query);
  useEffect(() => setDraft(query), [query]);
  const { loading, grouped } = useHealthCatalog();
  const count = (item: HealthIngredient) => grouped.get(item.id)?.length ?? 0;
  const base = query ? searchHealth(query).ingredients : healthIngredients;
  const list = base
    .filter((item) => !type || item.type === type)
    .filter((item) => !onlyDoogo || count(item) > 0)
    .sort((first, second) => (sort === "name" ? first.name.localeCompare(second.name, "ko") : count(second) - count(first) || first.name.localeCompare(second.name, "ko")));
  const update = (next: Record<string, string | null>) => {
    const copy = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) copy.set(key, value);
      else copy.delete(key);
    }
    setParams(copy, { replace: true });
  };

  return (
    <HealthLayout className="health-ingredients">
      <div className="enc-page-head">
        <h1>원료 사전</h1>
        <p>내가 팔려는 상품의 원료로 어떤 말을 써도 되는지, 어떤 고민의 고객이 찾는지 확인하세요. 원료 {healthIngredients.length}개.</p>
      </div>
      <section className="hl-section hl-ing-tools" aria-label="원료 찾기">
        <div className="hl-toolbar">
          <form className="hl-search-box" role="search" onSubmit={(event) => { event.preventDefault(); update({ q: draft.trim() || null }); }}>
            <Search size={17} aria-hidden="true" />
            <input value={draft} onChange={(event) => { setDraft(event.target.value); update({ q: event.target.value.trim() || null }); }} placeholder="원료·제품 이름 검색 (예: 오메가3, 마누카꿀)" aria-label="원료 검색" />
          </form>
          <label className="enc-sort">
            <span>정렬</span>
            <select value={sort} onChange={(event) => update({ sort: event.target.value === "name" ? "name" : null })}>
              <option value="stock">두고푸드 보유 많은 순</option>
              <option value="name">이름 순</option>
            </select>
          </label>
        </div>
        <div className="hl-group-chips" role="group" aria-label="원료 종류">
          <button type="button" className={type ? "" : "active"} aria-pressed={!type} onClick={() => update({ type: null })}>전체 <b>{healthIngredients.length}</b></button>
          {HEALTH_TYPES.map((value) => (
            <button key={value} type="button" className={`hl-type-chip hl-t-${value}${type === value ? " active" : ""}`} aria-pressed={type === value} onClick={() => update({ type: type === value ? null : value })}>
              {HEALTH_TYPE_META[value].label} <b>{healthIngredients.filter((item) => item.type === value).length}</b>
            </button>
          ))}
          <button type="button" className={`hl-doogo-chip${onlyDoogo ? " active" : ""}`} aria-pressed={onlyDoogo} onClick={() => update({ doogo: onlyDoogo ? null : "1" })}><Store size={14} aria-hidden="true" /> 두고푸드 보유</button>
        </div>
        <p className="hl-type-hint"><Info size={15} aria-hidden="true" />{type ? HEALTH_TYPE_META[type].hint : "기능성 원료·영양소는 '건강기능식품' 표시가 있는 제품일 때만 기능성 문구를 쓸 수 있어요. 일반식품은 효능을 말할 수 없어요."}</p>
      </section>
      <p className="hl-list-count">{list.length}개 원료</p>
      {list.length === 0 ? (
        <div className="empty-state encyclopedia-empty"><PackageSearch size={28} /><strong>조건에 맞는 원료가 없어요.</strong><span>검색어나 종류를 바꿔 보세요.</span></div>
      ) : (
        <div className="hl-ing-list">{list.map((item) => <IngredientRow key={item.id} item={item} grouped={grouped} loading={loading} />)}</div>
      )}
    </HealthLayout>
  );
}

// ── 원료 상세 ────────────────────────────────────────────────────────
export function HealthIngredientPage() {
  const { id } = useParams();
  const item = findHealthIngredient(id);
  const { catalog, loading, grouped } = useHealthCatalog();
  if (!item) return <NotFound what="원료" to="/encyclopedia/health/ingredients" label="원료 사전으로 가기" />;
  const products = grouped.get(item.id) ?? [];
  const concerns = concernsOfIngredient(item.id);
  const pairs = (item.pair ?? []).map((pairId) => findHealthIngredient(pairId)).filter((value): value is HealthIngredient => Boolean(value));
  const meta = HEALTH_TYPE_META[item.type];
  const naverShopping = `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(item.keyword)}`;

  return (
    <HealthLayout className="health-ingredient-page">
      <BackLink to="/encyclopedia/health/ingredients" label="원료 사전으로" />

      <section className="hl-detail-head is-ingredient" aria-labelledby="hl-ing-title">
        <IngredientTile item={item} size="lg" />
        <div className="hl-detail-main">
          <nav className="produce-breadcrumb" aria-label="원료 위치">
            <Link to="/encyclopedia/health">건강식품 백과사전</Link>
            <ChevronRight size={13} aria-hidden="true" />
            <Link to={`/encyclopedia/health/ingredients?type=${item.type}`}>{meta.label}</Link>
          </nav>
          <div className="hl-ing-title"><h1 id="hl-ing-title">{item.name}</h1><TypeBadge type={item.type} /></div>
          {item.aka && <p className="hl-aka">{item.aka}</p>}
          <p className="hl-type-hint"><Info size={15} aria-hidden="true" />{meta.hint}</p>
          <div className="hl-ing-badges"><StockBadge count={products.length} loading={loading} /><span className="hl-forms">주로 나오는 형태 · {item.forms}</span></div>
          {concerns.length > 0 && (
            <div className="hl-keywords">
              <span>이 원료를 찾는 고민</span>
              {concerns.map((concern) => <Link key={concern.id} to={`/encyclopedia/health/concern/${concern.id}`}>{concern.emoji} {concern.name}</Link>)}
            </div>
          )}
          <div className="hl-actions">
            <a href={naverShopping} target="_blank" rel="noreferrer" className="enc-secondary-button">네이버 쇼핑 보기 <ExternalLink size={15} aria-hidden="true" /></a>
            <button type="button" className="enc-secondary-button" onClick={() => void copyWithToast(item.keyword, "검색어")}><Copy size={15} aria-hidden="true" /> 검색어 '{item.keyword}' 복사</button>
          </div>
        </div>
      </section>

      <DoogoProducts products={products} catalog={catalog} loading={loading} keyword={item.keyword} name={item.name} />

      <section className={`hl-section hl-claims hl-t-${item.type}`} aria-labelledby="hl-claims-title">
        <SectionHead id="hl-claims-title" icon={item.type === "food" ? <Ban size={18} /> : <ClipboardCheck size={18} />} title={meta.claimTitle} desc={item.type === "food" ? "원재료·원산지·함량·맛·먹는 법으로 소개해요." : "포장에 '건강기능식품' 표시가 있는 제품일 때만 써요. 제품마다 인정받은 문구를 그대로 쓰세요."} />
        {item.type === "food" ? (
          <PhraseColumns ok={item.ok ?? []} ng={item.ng ?? []} okTitle="이렇게 소개하세요" ngTitle="이런 말은 안 돼요" />
        ) : (
          <>
            {item.claims.length > 0 && <ul className="hl-claim-list">{item.claims.map((claim) => <li key={claim}><BadgeCheck size={17} aria-hidden="true" />{claim}</li>)}</ul>}
            {item.claimNote && <p className="hl-claim-note"><Info size={15} aria-hidden="true" />{item.claimNote}</p>}
            <p className="hl-claim-warn"><ShieldAlert size={15} aria-hidden="true" />같은 원료라도 일반식품(즙·진액·젤리 등)이나 해외 구매대행 제품은 기능성 표현을 할 수 없어요.</p>
          </>
        )}
      </section>

      <div className="hl-two">
        <section className="hl-section" aria-labelledby="hl-point-title">
          <SectionHead id="hl-point-title" icon={<Lightbulb size={18} />} title="판매 포인트" />
          <p className="hl-text">{item.point}</p>
        </section>
        <section className="hl-section hl-caution" aria-labelledby="hl-caution-title">
          <SectionHead id="hl-caution-title" icon={<ShieldAlert size={18} />} title="섭취·판매 주의" />
          <p className="hl-text">{item.caution}</p>
        </section>
      </div>

      <section className="hl-section" aria-labelledby="hl-ing-cs-title">
        <SectionHead id="hl-ing-cs-title" icon={<MessageSquareText size={18} />} title="예상 고객 질문" />
        <ul className="hl-cs-list">
          <li><strong>Q. {item.cs.q}</strong><span>A. {item.cs.a}</span></li>
          <li><strong>Q. {GENERIC_HEALTH_CS.q}</strong><span>A. {GENERIC_HEALTH_CS.a}</span></li>
        </ul>
      </section>

      {pairs.length > 0 && (
        <section className="hl-section" aria-labelledby="hl-pair-title">
          <SectionHead id="hl-pair-title" icon={<FlaskConical size={18} />} title="함께 팔기 좋은 원료" desc="묶음 구성·복합 제품 비교에 활용해 보세요." />
          <div className="hl-ing-list">{pairs.map((pair) => <IngredientRow key={pair.id} item={pair} grouped={grouped} loading={loading} />)}</div>
        </section>
      )}
    </HealthLayout>
  );
}

// ── 판매 전 체크 ─────────────────────────────────────────────────────
const GUIDE_CARDS: Array<{ title: string; icon: ReactNode; lines: ReactNode[] }> = [
  {
    title: "건강기능식품인지 먼저 확인해요",
    icon: <BadgeCheck size={18} />,
    lines: [
      "포장에 '건강기능식품' 문구와 인증 마크가 있는 제품만 '~에 도움을 줄 수 있음' 같은 기능성 문구를 쓸 수 있어요.",
      "같은 원료라도 일반식품(즙·진액·젤리·분말 등)이나 해외 구매대행 제품은 기능성 표현을 할 수 없어요.",
      <>원료 사전의 <b>기능성 원료 · 영양소 · 제품마다 확인 · 일반식품</b> 표시를 함께 보세요.</>
    ]
  },
  {
    title: "판매하려면 영업신고가 필요해요",
    icon: <ClipboardCheck size={18} />,
    lines: [
      "건강기능식품을 온라인으로 팔려면 보통 관할 시·군·구청에 '건강기능식품 일반판매업' 영업신고(위생교육 포함)가 필요해요.",
      "스마트스토어·쿠팡 같은 판매처도 건강기능식품을 등록할 때 신고증을 확인해요.",
      "재고 없이 파는 위탁판매도 고객에게 파는 사람은 셀러예요. 지금 기준은 관할 구청·판매처 안내로 한 번 더 확인하세요."
    ]
  },
  {
    title: "광고 문구는 심의받은 내용으로",
    icon: <Megaphone size={18} />,
    lines: [
      "건강기능식품의 상세페이지·광고는 표시·광고 심의를 받은 내용으로 쓰는 게 원칙이에요.",
      "제조·수입사가 받은 심의 문구와 상세페이지를 받아 쓰고, 문구를 마음대로 더하거나 바꾸지 마세요.",
      "받은 심의 결과·상세페이지 원본을 보관해 두면 문의나 신고에 대응하기 쉬워요."
    ]
  },
  {
    title: "이런 표현은 쓰면 안 돼요",
    icon: <Ban size={18} />,
    lines: [
      "질병 이름 + 예방·치료·개선 (당뇨·고혈압·관절염·치매·암 등)",
      "의약품처럼 보이는 말 (약, 처방, 특효, 복용, 치료제)",
      "효과 보장·과장 (100% 효과, 바로 낫는, ○kg 감량 보장)",
      "체험 후기·전후 사진으로 효과를 보여 주기",
      "의사·약사·한의사 등 전문가가 추천한다는 표현",
      "일반식품에 기능성 표현 (면역력 즙, 다이어트 차)"
    ]
  },
  {
    title: "해외 건강식품을 팔 때",
    icon: <ShieldAlert size={18} />,
    lines: [
      "해외 배송(구매대행) 제품은 국내에서 기능성을 인정받은 제품이 아니라서 기능성 표현을 하면 안 돼요.",
      "식약처가 국내 반입을 막은 해외직구 위해식품 성분이 들어 있지 않은지 식품안전나라에서 확인하세요.",
      "'빌베리 60000mg'처럼 원물로 환산한 숫자는 실제 추출물 양이 아니에요. 표기 기준을 함께 적으세요."
    ]
  },
  {
    title: "고객 문의는 이렇게 답해요",
    icon: <MessageSquareText size={18} />,
    lines: [
      "질병·약 복용 질문 → 괜찮다고 단정하지 말고 의사·약사와 상담하도록 안내",
      "효과 질문 → 인정 문구 그대로, 효과가 나타나는 기간·수치는 약속하지 않기",
      "먹고 난 뒤 불편하다는 문의 → 섭취를 멈추고 전문가와 상담하도록 안내, 식약처 이상사례 신고도 안내",
      "보관·섭취 방법 → 제품 포장의 표시 기준으로 안내"
    ]
  }
];

const WORD_SWAPS: Array<{ bad: string; good: string }> = [
  { bad: "복용하세요", good: "섭취하세요" },
  { bad: "면역력 강화", good: "면역력 증진에 도움을 줄 수 있음 (홍삼·알로에 겔 등 인정 원료 제품만)" },
  { bad: "혈액순환 개선", good: "혈행 개선에 도움을 줄 수 있음 (오메가3·은행잎 추출물 등 인정 원료 제품만)" },
  { bad: "시력이 좋아져요", good: "황반색소밀도를 유지하여 눈 건강에 도움을 줄 수 있음 (루테인)" },
  { bad: "살 빠지는", good: "체지방 감소에 도움을 줄 수 있음 (가르시니아·녹차추출물 등 인정 원료 제품만)" },
  { bad: "숙취 해소", good: "쓰지 않아요 → 간 건강에 도움을 줄 수 있음 (밀크씨슬)" },
  { bad: "피로 회복", good: "피로개선에 도움을 줄 수 있음 (홍삼)" },
  { bad: "일반식품의 효능 설명", good: "원재료·원산지·함량·맛·먹는 법" }
];

export function HealthGuidePage() {
  return (
    <HealthLayout className="health-guide">
      <div className="enc-page-head">
        <h1>판매 전 체크</h1>
        <p>건강식품은 무엇을 파느냐만큼 '어떻게 말하느냐'가 중요해요. 상품을 올리기 전에 6가지를 확인하세요.</p>
      </div>
      <div className="hl-guide-grid">
        {GUIDE_CARDS.map((card, index) => (
          <section key={card.title} className="hl-guide-card" aria-labelledby={`hl-guide-${index}`}>
            <h2 id={`hl-guide-${index}`}><b>{index + 1}</b>{card.title}</h2>
            <ul>{card.lines.map((line, lineIndex) => <li key={lineIndex}>{line}</li>)}</ul>
          </section>
        ))}
      </div>
      <section className="hl-section" aria-labelledby="hl-swap-title">
        <SectionHead id="hl-swap-title" icon={<Megaphone size={18} />} title="자주 쓰는 말, 이렇게 바꿔요" desc="오른쪽 문구도 그 원료로 인정받은 건강기능식품일 때만 쓸 수 있어요." />
        <div className="hl-swap-table" role="table" aria-label="표현 바꾸기">
          <div className="hl-swap-row is-head" role="row"><span role="columnheader">이렇게 쓰지 말고</span><span role="columnheader">이렇게 써요</span></div>
          {WORD_SWAPS.map((row) => (
            <div key={row.bad} className="hl-swap-row" role="row">
              <span role="cell" className="is-bad"><X size={14} aria-hidden="true" />{row.bad}</span>
              <span role="cell" className="is-good"><Check size={14} aria-hidden="true" />{row.good}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="hl-section hl-links" aria-labelledby="hl-links-title">
        <SectionHead id="hl-links-title" icon={<ExternalLink size={18} />} title="확인할 때 쓰는 곳" />
        <div className="hl-link-grid">
          <a href="https://www.foodsafetykorea.go.kr" target="_blank" rel="noreferrer"><strong>식품안전나라</strong><span>건강기능식품 정보·해외직구 위해식품 확인 <ExternalLink size={13} aria-hidden="true" /></span></a>
          <a href="https://www.khsa.or.kr" target="_blank" rel="noreferrer"><strong>한국건강기능식품협회</strong><span>표시·광고 심의·위생교육 안내 <ExternalLink size={13} aria-hidden="true" /></span></a>
          <Link to="/encyclopedia/health/ingredients"><strong>원료 사전</strong><span>원료별로 쓸 수 있는 문구 보기 <ChevronRight size={13} aria-hidden="true" /></span></Link>
        </div>
      </section>
    </HealthLayout>
  );
}
