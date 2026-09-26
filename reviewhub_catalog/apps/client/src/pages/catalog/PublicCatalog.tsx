import { FormEvent, Fragment, type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CalendarRange,
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSnow,
  ChevronDown,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  CloudSun,
  Clock3,
  ExternalLink,
  Factory,
  ImageOff,
  Info,
  MessageCircle,
  PackageCheck,
  PackageSearch,
  PackageX,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
  Sunrise,
  ThermometerSun,
  TrendingUp,
  Truck,
  WalletCards,
  X,
  MoonStar
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type { CatalogData, GuideContent, Notice, OperationsOverview, PriceHistory, Product, ShippingType, SoldOutIssue } from "./types";


const fallbackGuideContent: GuideContent = {
  highlights: [
    "두고푸드 상품은 상품별 마감시간을 기준으로 순차 출고됩니다.",
    "발주 전 최신 단가와 출고 가능 여부를 반드시 확인해 주세요."
  ],
  orderInfo: [
    { label: "발주 마감", value: "상품별 마감시간 이전 주문은 당일 접수됩니다." },
    { label: "송장 안내", value: "출고 당일 오후부터 송장번호가 순차 등록됩니다." },
    { label: "발주 원칙", value: "상품명·옵션·수취인 정보를 정확히 확인해 주세요." }
  ],
  orderMethod: [
    "상품 단가표에서 상품과 옵션별 가격을 확인합니다.",
    "수취인 정보와 요청 옵션을 정확히 작성합니다.",
    "출고 및 송장 등록 여부를 확인합니다."
  ],
  csSummary: "고객 수령 후 24시간 이내 접수된 건을 기준으로 확인합니다.",
  csHow: "송장사진·상품 전체사진·문제 부위 사진과 상세 내용을 함께 준비해 주세요.",
  csRules: [
    "필수 사진이나 상세 내용이 부족하면 처리가 제한될 수 있습니다.",
    "단순 변심이나 맛에 대한 주관적 사유는 교환·환불 대상이 아닙니다.",
    "주소·연락처 오기재와 수취 거부로 인한 반송은 보상되지 않습니다."
  ],
  etc: [
    { label: "세금계산서", value: "발행 일정과 방식은 관리자 공지를 확인해 주세요." },
    { label: "상품 이미지", value: "두고푸드 상품 판매 목적에 한해 사용할 수 있습니다." },
    { label: "최소 주문수량", value: "기본 1개이며 상품별 조건이 우선 적용됩니다." }
  ],
  faq: [
    { q: "주말에도 발주할 수 있나요?", a: "주말 주문은 다음 영업일 마감 전 주문과 함께 순차 처리됩니다." },
    { q: "기존 주문 후 추가 주문이 생겼어요.", a: "추가 상품만 별도 주문으로 접수해 주세요." },
    { q: "판매가는 자유롭게 정할 수 있나요?", a: "공급가는 두고푸드가 안내하며 최종 판매가는 판매자가 결정합니다." }
  ]
};

const fallbackData: CatalogData = {
  categories: [
    { id: "cat-domestic-farm", name: "🥕 농산", shippingType: "domestic", sortOrder: 10, isActive: true },
    { id: "cat-domestic-seafood", name: "🐟 수산", shippingType: "domestic", sortOrder: 20, isActive: true },
    { id: "cat-domestic-livestock", name: "🥩 축산", shippingType: "domestic", sortOrder: 30, isActive: true },
    { id: "cat-domestic-gift", name: "🎁 선물세트", shippingType: "domestic", sortOrder: 40, isActive: true },
    { id: "cat-domestic-food", name: "🥫 식품", shippingType: "domestic", sortOrder: 50, isActive: true },
    { id: "cat-domestic-health", name: "💊 건강식품", shippingType: "domestic", sortOrder: 60, isActive: true },
    { id: "cat-overseas-health", name: "✈️ 해외 건강식품", shippingType: "overseas", sortOrder: 70, isActive: true }
  ],
  products: [
    {
      id: "muskmelon-gift",
      productCode: "ass635",
      name: "머스크메론세트 5kg (2수)",
      imageUrl: null,
      origin: "국내산",
      aPrice: 27000,
      generalPrice: 29700,
      salePrice: null,
      salePriceMode: "autonomous",
      saleStartMonth: 6,
      saleEndMonth: 10,
      isAlwaysOnSale: false,
      shippingFee: "무료 · 도서산간 추가",
      releaseInfo: "평일 오전 10시 마감",
      notes: "선물용 패키지, 산지 수확 상황에 따라 출고일이 달라질 수 있습니다.",
      optionsInfo: "2수 · 총 5kg 내외",
      packaging: "선물박스 + 외피박스",
      courier: "CJ대한통운",
      shippingType: "domestic",
      categoryId: "cat-domestic-gift",
      isVisible: true,
      isSoldOut: false,
      createdAt: "2026-09-10",
      updatedAt: "2026-09-13",
      options: [
        { id: "option-muskmelon-2", productId: "muskmelon-gift", name: "2수 · 총 5kg 내외", aPrice: 27000, generalPrice: 29700, salePrice: null, salePriceMode: "autonomous", isSoldOut: false, sortOrder: 10, createdAt: "2026-09-10", updatedAt: "2026-09-13" },
        { id: "option-muskmelon-3", productId: "muskmelon-gift", name: "3수 · 총 6kg 내외", aPrice: 33500, generalPrice: 36500, salePrice: null, salePriceMode: "autonomous", isSoldOut: false, sortOrder: 20, createdAt: "2026-09-10", updatedAt: "2026-09-13" }
      ]
    },
    {
      id: "shine-muscat",
      productCode: "ass634",
      name: "샤인머스캣 2kg 4~5수",
      imageUrl: null,
      origin: "국내산",
      aPrice: 9500,
      generalPrice: 11000,
      salePrice: null,
      salePriceMode: "autonomous",
      saleStartMonth: 8,
      saleEndMonth: 10,
      isAlwaysOnSale: false,
      shippingFee: "무료 · 제주/도서산간 추가",
      releaseInfo: "평일 오전 9시 40분 마감",
      notes: "산지 수확 후 순차 출고됩니다.",
      optionsInfo: "2kg · 4~5수",
      packaging: "전용박스",
      courier: "CJ대한통운",
      shippingType: "domestic",
      categoryId: "cat-domestic-farm",
      isVisible: true,
      isSoldOut: false,
      createdAt: "2026-09-10",
      updatedAt: "2026-09-13",
      options: [
        { id: "option-shine-2", productId: "shine-muscat", name: "2kg · 4~5수", aPrice: 9500, generalPrice: 11000, salePrice: null, salePriceMode: "autonomous", isSoldOut: false, sortOrder: 10, createdAt: "2026-09-10", updatedAt: "2026-09-13" },
        { id: "option-shine-4", productId: "shine-muscat", name: "4kg · 8~10수", aPrice: 18500, generalPrice: 20900, salePrice: null, salePriceMode: "autonomous", isSoldOut: false, sortOrder: 20, createdAt: "2026-09-10", updatedAt: "2026-09-13" }
      ]
    }
  ],
  notices: [
    { id: "notice-cutoff", title: "발주 마감시간 안내", content: "평일 오전 9시 30분까지 접수된 주문은 당일~2일 이내 출고됩니다.", isPinned: true, isActive: true, createdAt: "2026-09-13", updatedAt: "2026-09-13" },
    { id: "notice-price", title: "가격 변동 확인 필수", content: "농수산물과 해외 상품은 시세 및 환율에 따라 공급가가 변동될 수 있습니다.", isPinned: false, isActive: true, createdAt: "2026-09-13", updatedAt: "2026-09-13" }
  ],
  priceHistory: [
    { id: "history-1", productId: "shine-muscat", productName: "샤인머스캣 2kg 4~5수", optionId: "option-shine-2", optionName: "2kg · 4~5수", field: "generalPrice", oldPrice: 11500, newPrice: 11000, changedBy: "admin", changedAt: "2026-09-13 09:20:00", productImageUrl: null }
  ],
  recentSoldOutIssues: [],
  settings: {
    guide: "상품별 마감시간을 반드시 확인해 주세요.\n주문 정보의 수령인·연락처·주소 오기재로 인한 반송은 보상되지 않습니다.\n신선식품 CS는 수령 후 24시간 이내에 사진을 첨부해 접수해 주세요.",
    guide_sections: JSON.stringify(fallbackGuideContent),
    sourcing_intro: "찾으시는 상품이 목록에 없다면 상품명과 희망 조건을 남겨 주세요."
  }
};

const emptyCatalogData: CatalogData = {
  ...fallbackData,
  products: [],
  notices: [],
  priceHistory: [],
  recentSoldOutIssues: []
};

function formatPrice(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value.toLocaleString("ko-KR")}원`;
}

function effectiveAPrice(aPrice: number | null | undefined, generalPrice: number) {
  return typeof aPrice === "number" && aPrice > 0 ? aPrice : generalPrice;
}

function weightSortValue(value: string) {
  const match = value.match(/(\d+(?:\.\d+)?)\s*(kg|g)\b/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const amount = Number(match[1]);
  return match[2].toLowerCase() === "kg" ? amount * 1000 : amount;
}

function sortedProductOptions(product: Product) {
  return [...(product.options ?? [])].sort((first, second) =>
    weightSortValue(first.name) - weightSortValue(second.name)
    || first.sortOrder - second.sortOrder
    || first.name.localeCompare(second.name, "ko")
  );
}

function formatDate(value: string) {
  const normalized = value.length === 10
    ? `${value}T00:00:00+09:00`
    : value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}.${part("month")}.${part("day")} (${part("weekday")})`;
}

function parseGuideContent(value?: string): GuideContent {
  if (!value) return fallbackGuideContent;
  try {
    const parsed = JSON.parse(value) as Partial<GuideContent>;
    return {
      highlights: parsed.highlights ?? fallbackGuideContent.highlights,
      orderInfo: parsed.orderInfo ?? fallbackGuideContent.orderInfo,
      orderMethod: parsed.orderMethod ?? fallbackGuideContent.orderMethod,
      csSummary: parsed.csSummary ?? fallbackGuideContent.csSummary,
      csHow: parsed.csHow ?? fallbackGuideContent.csHow,
      csRules: parsed.csRules ?? fallbackGuideContent.csRules,
      etc: parsed.etc ?? fallbackGuideContent.etc,
      faq: parsed.faq ?? fallbackGuideContent.faq
    };
  } catch {
    return fallbackGuideContent;
  }
}

function BrandLogo({ light = false }: { light?: boolean }) {
  return (
    <img
      data-image-slot={light ? "brand.doogo-food.logo-white" : "brand.doogo-food.logo-color"}
      className={`doogo-logo ${light ? "light" : ""}`}
      src={light ? "/assets/brand/doogo-food-logo-white.png" : "/assets/brand/doogo-food-logo-color.png"}
      alt="두고푸드"
      width="156"
      height="52"
    />
  );
}

function normalizeCatalogData(data: CatalogData) {
  return {
    ...data,
    products: data.products.map((product) => ({
      ...product,
      salePrice: product.salePrice ?? null,
      salePriceMode: product.salePriceMode ?? "autonomous",
      saleStartMonth: product.saleStartMonth ?? null,
      saleEndMonth: product.saleEndMonth ?? null,
      isAlwaysOnSale: product.isAlwaysOnSale ?? false,
      options: (product.options ?? []).map((option) => ({
        ...option,
        salePrice: option.salePrice ?? null,
        salePriceMode: option.salePriceMode ?? product.salePriceMode ?? "autonomous"
      }))
    })),
    priceHistory: data.priceHistory.map((history) => ({
      ...history,
      productImageUrl: history.productImageUrl ?? null
    })),
    recentSoldOutIssues: (data.recentSoldOutIssues ?? []).map((issue) => ({
      ...issue,
      productImageUrl: issue.productImageUrl ?? null
    }))
  };
}

async function loadCatalog() {
  const response = await apiFetch("/catalog", { auth: false, silent: true });
  if (!response.ok) return null;
  const payload = (await response.json()) as { ok?: boolean; data?: CatalogData };
  if (!payload.ok || !payload.data) return null;
  return normalizeCatalogData(payload.data);
}

async function loadCatalogInitial() {
  const response = await apiFetch("/catalog/initial", { auth: false, silent: true });
  if (!response.ok) return null;
  const payload = (await response.json()) as { ok?: boolean; data?: CatalogData };
  if (!payload.ok || !payload.data) return null;
  return normalizeCatalogData(payload.data);
}

async function loadOperations() {
  const response = await apiFetch("/catalog/operations", { auth: false, silent: true });
  if (!response.ok) return null;
  const payload = (await response.json()) as { ok?: boolean; data?: OperationsOverview };
  return payload.ok ? payload.data ?? null : null;
}

async function loadGuideSettings() {
  const response = await apiFetch("/catalog/guide", { auth: false, silent: true });
  if (!response.ok) return null;
  const payload = (await response.json()) as { ok?: boolean; data?: { settings?: CatalogData["settings"] } };
  return payload.ok ? payload.data?.settings ?? null : null;
}

async function loadNotices() {
  const response = await apiFetch("/catalog/notices", { auth: false, silent: true });
  if (!response.ok) return null;
  const payload = (await response.json()) as { ok?: boolean; data?: { notices?: Notice[] } };
  return payload.ok ? payload.data?.notices ?? null : null;
}

// 관리자가 상품·가격을 바꾸면 공개 화면이 곧바로 다시 불러오도록: 창 포커스·탭 복귀·데이터 변경 알림(doogo:catalog-changed)에 반응합니다.
const CATALOG_CHANGED_EVENT = "doogo:catalog-changed";

function onCatalogRefreshSignal(refresh: () => void) {
  let lastRun = 0;
  const run = () => {
    const now = Date.now();
    if (now - lastRun < 3000) return;
    lastRun = now;
    refresh();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") run();
  };
  window.addEventListener("focus", run);
  window.addEventListener(CATALOG_CHANGED_EVENT, run);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.removeEventListener("focus", run);
    window.removeEventListener(CATALOG_CHANGED_EVENT, run);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

const seasonalCategories = new Set(["농산", "수산", "축산", "선물세트", "식품"]);

function plainCategoryName(name?: string) {
  return name?.replace(/^[^\p{L}\p{N}[]+\s*/u, "").trim() ?? "";
}

function isSeasonalCategory(categoryName?: string) {
  return seasonalCategories.has(plainCategoryName(categoryName));
}

function isMonthInSeason(month: number, startMonth: number | null, endMonth: number | null) {
  if (!startMonth || !endMonth) return true;
  if (startMonth <= endMonth) return month >= startMonth && month <= endMonth;
  return month >= startMonth || month <= endMonth;
}

function seasonLabel(product: Product, categoryName?: string) {
  if (!isSeasonalCategory(categoryName)) return "상시 판매";
  if (product.isAlwaysOnSale) return "상시 판매";
  if (!product.saleStartMonth || !product.saleEndMonth) return "판매기간 미설정";
  if (product.saleStartMonth === product.saleEndMonth) return `${product.saleStartMonth}월 판매`;
  return `${product.saleStartMonth}월 ~ ${product.saleEndMonth}월`;
}

function salePriceLabel(mode: "autonomous" | "fixed", value: number | null) {
  if (mode === "autonomous") return { main: "자율", sub: "판매자 자율 판매가" };
  return {
    main: value === null ? "미설정" : formatPrice(value),
    sub: "지정 판매가"
  };
}

function priceFieldLabel(field: PriceHistory["field"]) {
  if (field === "aPrice") return "A단가";
  if (field === "generalPrice") return "일반공급가";
  return "지정 판매가";
}

function seoulClock(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(value);
}

function seoulMonth(value: Date) {
  return Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    month: "numeric"
  }).format(value));
}

function BrandHeader() {
  return (
    <header className="public-header">
      <Link to="/" className="public-brand" aria-label="두고푸드 상품 DB 홈">
        <BrandLogo />
      </Link>
      <nav className="public-nav" aria-label="주요 메뉴">
        <NavLink to="/" end>단가표</NavLink>
        <NavLink to="/notices">가격변동</NavLink>
        <NavLink to="/guide">공지사항</NavLink>
        <button className="sourcing-nav-button" type="button" onClick={() => window.dispatchEvent(new CustomEvent("doogo:sourcing-open"))}><PackageSearch size={14} /> 소싱해주세요!</button>
        <a href="https://pf.kakao.com/_NyuVn" target="_blank" rel="noreferrer"><MessageCircle size={14} /> 1:1 상담</a>
      </nav>
      <div className="public-external-links" aria-label="두고푸드 외부 사이트">
        <a className="company-profile-link" href="https://www.doogofood.com/" target="_blank" rel="noreferrer">
          공식홈페이지 <ExternalLink size={14} />
        </a>
        <a className="wholesale-mall-link" href="https://shop.baljuora.com/doogofood" target="_blank" rel="noreferrer">
          도매몰 <ExternalLink size={14} />
        </a>
      </div>
    </header>
  );
}

function PageFrame({ children }: { children: ReactNode }) {
  const [sourcingOpen, setSourcingOpen] = useState(false);
  useEffect(() => {
    const open = () => setSourcingOpen(true);
    window.addEventListener("doogo:sourcing-open", open);
    return () => window.removeEventListener("doogo:sourcing-open", open);
  }, []);
  return (
    <div className="public-app">
      <BrandHeader />
      {children}
      <footer className="public-footer">
        <div className="footer-top footer-compact-row">
          <div className="footer-brand-block">
            <BrandLogo />
            <div><strong>두고푸드 데이터 센터</strong><span>위탁셀러를 위한 실시간 상품/단가 정보센터</span></div>
          </div>
        <nav className="footer-link-groups" aria-label="푸터 바로가기">
          <div>
            <h3>상품 정보</h3>
            <Link to="/">상품 단가표</Link>
            <Link to="/notices">가격변동</Link>
            <Link to="/guide">공지사항</Link>
          </div>
          <div>
            <h3>두고푸드</h3>
            <a href="https://www.doogofood.com/" target="_blank" rel="noreferrer">공식홈페이지 <ExternalLink size={13} /></a>
            <a href="https://shop.baljuora.com/doogofood" target="_blank" rel="noreferrer">도매몰 <ExternalLink size={13} /></a>
          </div>
          <div>
            <h3>고객 지원</h3>
            <a href="https://pf.kakao.com/_NyuVn" target="_blank" rel="noreferrer">1:1 상담 <ExternalLink size={13} /></a>
            <button type="button" onClick={() => setSourcingOpen(true)}>소싱 요청</button>
            <Link to="/admin">관리자센터</Link>
          </div>
        </nav>
          <a className="footer-cta" href="https://pf.kakao.com/_NyuVn" target="_blank" rel="noreferrer"><MessageCircle size={17} /> 1:1 상담하기</a>
        </div>
        <div className="footer-bottom">
          <div className="footer-business-info">
            <p><span>(주) 두고홀딩스</span> <b>|</b> <span>대표: 문원오</span> <b>|</b> <span>사업자등록번호: 726-87-03167</span> <b>|</b> <span>통신판매업신고: 제 2024-세종아름 0878호</span></p>
            <p><span>주소: 세종특별자치시 갈매로 353 에비뉴힐 5층 5023호</span> <span>(우) 30121</span></p>
          </div>
          <small>© 2026 DOOGO FOOD. 상품 정보는 최신 공지와 단가표를 기준으로 확인해 주세요.</small>
        </div>
      </footer>
      {sourcingOpen && <SourcingModal onClose={() => setSourcingOpen(false)} />}
    </div>
  );
}

function productImageSrc(product: Product) {
  if (product.imageUrl) return product.imageUrl;
  const known: Record<string, string> = {
    "muskmelon-gift": "/assets/products/muskmelon-gift.webp",
    "premium-rice-cake": "/assets/products/rice-cake-gift.webp",
    "ramie-songpyeon": "/assets/products/songpyeon.webp",
    "gold-mango": "/assets/products/gold-mango.webp",
    "naju-pear": "/assets/products/naju-pear.webp",
    "shine-muscat": "/assets/products/shine-muscat.webp",
    "hami-melon": "/assets/products/hami-melon.webp",
    "global-supplement": "/assets/products/health-supplement.webp"
  };
  return known[product.id] || "";
}

function ProductThumb({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false);
  const src = productImageSrc(product);
  const slot = product.id === "muskmelon-gift" ? "product.muskmelon-gift.card"
    : product.id === "premium-rice-cake" ? "product.rice-cake-gift.card"
    : product.id === "ramie-songpyeon" ? "product.songpyeon.card"
    : product.id === "gold-mango" ? "product.gold-mango.card"
    : product.id === "naju-pear" ? "product.naju-pear.card"
    : product.id === "shine-muscat" ? "product.shine-muscat.card"
    : product.id === "hami-melon" ? "product.hami-melon.card"
    : product.id === "global-supplement" ? "product.health-supplement.card" : undefined;
  if (!src || failed) {
    return <div className="product-thumb product-thumb-empty"><ImageOff size={26} /><span>이미지 준비중</span></div>;
  }
  return <img data-image-slot={slot} className="product-thumb" src={src} alt={product.name} width="112" height="112" onError={() => setFailed(true)} />;
}

function PublicOptionList({ product }: { product: Product }) {
  return (
    <div className="option-price-list">
      {sortedProductOptions(product).map((option) => (
        <article className={option.isSoldOut ? "sold-out" : ""} key={option.id}>
          <ProductThumb product={product} />
          <div className="option-name-cell"><strong>{product.name}</strong><small>{option.name}</small>{option.isSoldOut && <em>품절</em>}</div>
          <dl>
            <div><dt>A단가</dt><dd>{formatPrice(option.aPrice)}</dd></div>
            <div><dt>일반공급가</dt><dd>{formatPrice(option.generalPrice)}</dd></div>
            <div><dt>판매가</dt><dd>{salePriceLabel(option.salePriceMode, option.salePrice).main}</dd><small>{salePriceLabel(option.salePriceMode, option.salePrice).sub}</small></div>
          </dl>
        </article>
      ))}
    </div>
  );
}

function NoticeModal({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  return (
    <div className="public-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="public-modal notice-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`notice-title-${notice.id}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="public-modal-close" onClick={onClose} aria-label="공지 닫기"><X size={20} /></button>
        <span className="modal-icon"><Bell size={22} /></span>
        <span className="section-kicker">MUST READ</span>
        <h2 id={`notice-title-${notice.id}`}>{notice.title}</h2>
        {notice.youtubeUrl && <div className="notice-video-wrap"><iframe src={notice.youtubeUrl} title={`${notice.title} 영상`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /></div>}
        <p className="notice-modal-content">{notice.content}</p>
        {notice.imageUrl && <img className="notice-modal-image" src={notice.imageUrl} alt={`${notice.title} 안내 이미지`} />}
        <button className="modal-confirm" onClick={onClose}>확인했습니다</button>
      </section>
    </div>
  );
}

function ImageModal({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  return (
    <div className="public-modal-backdrop image-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="image-modal" role="dialog" aria-modal="true" aria-label={`${alt} 이미지`} onMouseDown={(event) => event.stopPropagation()}>
        <button className="public-modal-close" onClick={onClose} aria-label="이미지 닫기"><X size={20} /></button>
        <img src={src} alt={alt} />
      </section>
    </div>
  );
}

// 소싱 요청 입력 항목(팝업·소싱 페이지 공용). 서버로 보내는 필드 이름은 기존과 같습니다.
function SourcingFormFields({ compact = false }: { compact?: boolean }) {
  return (
    <>
      <fieldset className="sourcing-group">
        <legend><span>1</span> 찾는 상품</legend>
        <label><span className="field-label">찾는 상품명 <em aria-hidden="true">필수</em></span><input name="productName" required placeholder="예: 제주 감귤 선물세트 5kg" /></label>
        <div className="form-two">
          <label><span className="field-label">희망 공급가</span><input name="desiredPrice" placeholder="예: 20,000원 이하" /></label>
          <label><span className="field-label">참고 URL</span><input name="referenceUrl" type="url" inputMode="url" placeholder="https://" /></label>
        </div>
        <label><span className="field-label">상세 요청</span><textarea name="details" rows={compact ? 3 : 5} placeholder="규격·수량·포장·희망 출고일·판매 채널 등을 적어 주시면 더 빨리 찾아드려요." /></label>
      </fieldset>
      <fieldset className="sourcing-group">
        <legend><span>2</span> 연락받을 정보</legend>
        <div className="form-two">
          <label><span className="field-label">요청자명 <em aria-hidden="true">필수</em></span><input name="requesterName" required placeholder="상호 또는 이름" autoComplete="name" /></label>
          <label><span className="field-label">연락처 <em aria-hidden="true">필수</em></span><input name="contact" required placeholder="휴대폰 또는 이메일" autoComplete="tel" /></label>
        </div>
        <small className="sourcing-privacy">입력한 연락처는 소싱 결과 안내에만 사용됩니다.</small>
      </fieldset>
    </>
  );
}

function SourcingSteps() {
  return (
    <ol className="sourcing-steps" aria-label="진행 순서">
      <li><b>1</b> 요청 접수</li>
      <li><b>2</b> MD 검토</li>
      <li><b>3</b> 연락 안내</li>
    </ol>
  );
}

function SourcingModal({ onClose }: { onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const form = new FormData(event.currentTarget);
      const response = await apiFetch("/catalog/sourcing", {
        method: "POST",
        auth: false,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries()))
      });
      if (!response.ok) throw new Error("요청을 저장하지 못했습니다.");
      setSubmitted(true);
      toast.success("소싱 요청이 접수되었습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "소싱 요청에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="public-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="public-modal sourcing-modal" role="dialog" aria-modal="true" aria-labelledby="sourcing-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="public-modal-close" onClick={onClose} aria-label="소싱 요청 닫기"><X size={20} /></button>
        <header className="sourcing-modal-head">
          <span className="modal-icon"><PackageSearch size={22} /></span>
          <div>
            <span className="section-kicker">PRODUCT REQUEST</span>
            <h2 id="sourcing-modal-title">소싱해주세요!</h2>
            <p>찾는 상품을 알려주시면 두고푸드 MD가 공급처를 찾아 연락드립니다.</p>
          </div>
        </header>
        {submitted ? (
          <div className="modal-submitted sourcing-done">
            <span className="sourcing-done-icon"><Send size={24} /></span>
            <strong>요청이 접수되었습니다.</strong>
            <p>MD가 검토 후 입력하신 연락처로 안내드립니다. 보통 영업일 기준 1~2일 안에 연락드려요.</p>
            <button className="modal-confirm" onClick={onClose}>닫기</button>
          </div>
        ) : (
          <form className="sourcing-form sourcing-modal-form" onSubmit={submit}>
            <SourcingSteps />
            <SourcingFormFields compact />
            <div className="sourcing-submit-bar">
              <button type="submit" disabled={submitting}>{submitting ? "접수 중…" : "소싱 요청 보내기"} <Send size={16} /></button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function PriceChangeCard({
  history,
  product
}: {
  history: PriceHistoryGroup;
  product?: Product;
}) {
  const increased = history.changes.some((change) => change.newPrice > change.oldPrice);
  const decreased = history.changes.some((change) => change.newPrice < change.oldPrice);
  return (
    <article className={`price-change-card ${increased && !decreased ? "increase" : !increased && decreased ? "decrease" : "mixed"}`}>
      <div className="history-thumb-wrap">
        {product
          ? <ProductThumb product={product} />
          : <div className="product-thumb product-thumb-empty"><ImageOff size={22} /><span>이미지 준비중</span></div>}
      </div>
      <div className="price-change-copy">
        <div className="price-change-meta">
          <time>{formatDate(history.changedAt)}</time>
          <span className={`change-direction-badge ${increased && !decreased ? "increase" : !increased && decreased ? "decrease" : "mixed"}`}>
            {increased && !decreased ? <ArrowUpRight size={13} /> : !increased && decreased ? <ArrowDownRight size={13} /> : <TrendingUp size={13} />}
            {increased && !decreased ? "인상" : !increased && decreased ? "인하" : "변동"}
          </span>
        </div>
        <strong>{history.productName}</strong>
        <small>{history.optionName ? `옵션 · ${history.optionName}` : "상품 기본가격"} · 한 번의 저장에서 변경됨</small>
        <div className="price-change-fields">
          {history.changes.map((change) => {
            const changeIncreased = change.newPrice > change.oldPrice;
            const difference = Math.abs(change.newPrice - change.oldPrice);
            return <div className="price-change-field" key={change.id}><span>{priceFieldLabel(change.field)}</span><del>{formatPrice(change.oldPrice)}</del><ChevronRight size={14} /><b>{formatPrice(change.newPrice)}</b><em className={`change-difference ${changeIncreased ? "increase" : "decrease"}`}>{changeIncreased ? "+" : "-"}{formatPrice(difference)} 변동</em></div>;
          })}
        </div>
      </div>
    </article>
  );
}

type PriceHistoryGroup = {
  key: string;
  productId: string;
  productName: string;
  optionId: string | null;
  optionName: string | null;
  changedAt: string;
  changes: PriceHistory[];
};

function groupPriceHistories(histories: PriceHistory[]) {
  const groups = new Map<string, PriceHistoryGroup>();
  histories.forEach((history) => {
    // A single save uses one changedAt for all fields. Grouping here avoids
    // showing the same product twice when A단가 and 일반공급가 changed together.
    const key = `${history.productId}|${history.optionId || "base"}|${history.changedAt}`;
    const current = groups.get(key);
    if (current) {
      current.changes.push(history);
    } else {
      groups.set(key, {
        key,
        productId: history.productId,
        productName: history.productName,
        optionId: history.optionId,
        optionName: history.optionName,
        changedAt: history.changedAt,
        changes: [history]
      });
    }
  });
  return Array.from(groups.values()).sort((first, second) => second.changedAt.localeCompare(first.changedAt));
}

function PriceChangeBoard({
  histories,
  products,
  pageSize = 5
}: {
  histories: PriceHistory[];
  products: Product[];
  pageSize?: number;
}) {
  const [page, setPage] = useState(1);
  const [displayPageSize, setDisplayPageSize] = useState(pageSize);
  const [direction, setDirection] = useState<"all" | "increase" | "decrease">("all");
  const groupedHistories = useMemo(() => groupPriceHistories(histories), [histories]);
  const filteredHistories = useMemo(() => groupedHistories.filter((history) => {
    const hasIncrease = history.changes.some((change) => change.newPrice > change.oldPrice);
    const hasDecrease = history.changes.some((change) => change.newPrice < change.oldPrice);
    return direction === "all" || (direction === "increase" && hasIncrease) || (direction === "decrease" && hasDecrease);
  }), [direction, groupedHistories]);
  const totalPages = Math.max(1, Math.ceil(filteredHistories.length / displayPageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = filteredHistories.slice((currentPage - 1) * displayPageSize, currentPage * displayPageSize);
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((value) => value === 1 || value === totalPages || Math.abs(value - currentPage) <= 2);
  const increaseCount = groupedHistories.filter((history) => history.changes.some((change) => change.newPrice > change.oldPrice)).length;
  const decreaseCount = groupedHistories.filter((history) => history.changes.some((change) => change.newPrice < change.oldPrice)).length;
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  if (histories.length === 0) {
    return <div className="price-change-empty"><PackageCheck size={24} /><strong>최근 3일간 가격변동이 없습니다.</strong><span>가격이 변경되면 상품과 옵션 단위로 표시됩니다.</span></div>;
  }
  return (
    <>
      <div className="price-board-toolbar">
      <div className="price-direction-filter" aria-label="가격변동 방향 필터">
        <button className={direction === "all" ? "active" : ""} onClick={() => { setDirection("all"); setPage(1); }}>
          전체 <small>{histories.length}</small>
        </button>
        <button className={`increase ${direction === "increase" ? "active" : ""}`} onClick={() => { setDirection("increase"); setPage(1); }}>
          <ArrowUpRight size={15} /> 인상 <small>{increaseCount}</small>
        </button>
        <button className={`decrease ${direction === "decrease" ? "active" : ""}`} onClick={() => { setDirection("decrease"); setPage(1); }}>
          <ArrowDownRight size={15} /> 인하 <small>{decreaseCount}</small>
        </button>
      </div>
      <label className="page-size-select">페이지당 <select value={displayPageSize} onChange={(event) => { setDisplayPageSize(Number(event.target.value)); setPage(1); }} aria-label="가격변동 페이지당 표시 수"><option value={5}>5개</option><option value={10}>10개</option><option value={20}>20개</option></select></label>
      </div>
      {visible.length > 0 ? (
        <div className="price-change-list">
          {visible.map((history) => (
            <PriceChangeCard
              key={history.key}
              history={history}
              product={products.find((product) => product.id === history.productId)}
            />
          ))}
        </div>
      ) : (
        <div className="price-change-empty"><PackageCheck size={24} /><strong>선택한 가격변동이 없습니다.</strong><span>전체 버튼을 누르면 모든 가격변동을 확인할 수 있습니다.</span></div>
      )}
      {totalPages > 1 && (
        <nav className="price-change-pagination" aria-label="가격변동 페이지">
          <button type="button" onClick={() => setPage(1)} disabled={currentPage === 1} aria-label="첫 가격변동 페이지"><ChevronsLeft size={16} /></button>
          <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1} aria-label="이전 가격변동 페이지"><ChevronLeft size={16} /></button>
          {pageNumbers.map((value, index) => <Fragment key={value}>{index > 0 && pageNumbers[index - 1] !== value - 1 && <span>…</span>}<button type="button" className={value === currentPage ? "active" : ""} onClick={() => setPage(value)} aria-current={value === currentPage ? "page" : undefined}>{value}</button></Fragment>)}
          <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage === totalPages} aria-label="다음 가격변동 페이지"><ChevronRight size={16} /></button>
          <button type="button" onClick={() => setPage(totalPages)} disabled={currentPage === totalPages} aria-label="마지막 가격변동 페이지"><ChevronsRight size={16} /></button>
        </nav>
      )}
    </>
  );
}

function SoldOutIssueBoard({ issues }: { issues: SoldOutIssue[] }) {
  return (
    <section className="sold-out-issue-board" aria-labelledby="sold-out-issue-title">
      <div className="sold-out-issue-heading">
        <div>
          <span className="section-kicker">SUPPLY ALERT</span>
          <h2 id="sold-out-issue-title">최근 7일 품절 이슈</h2>
          <p>공급처 사정으로 품절 처리된 상품을 처리일 기준 7일간 안내합니다.</p>
        </div>
        <span className="sold-out-retention">7일 후 자동 초기화</span>
      </div>
      {issues.length === 0 ? (
        <div className="sold-out-issue-empty"><PackageCheck size={21} /><strong>최근 7일 품절 처리 상품이 없습니다.</strong><span>관리자에서 품절 처리된 상품이 이곳에 표시됩니다.</span></div>
      ) : (
        <div className="sold-out-issue-list">
          {issues.map((issue) => (
            <article className="sold-out-issue-card" key={issue.id}>
              <img src={issue.productImageUrl || "/assets/products/placeholder.webp"} alt="" />
              <div><strong>{issue.productName}</strong>{issue.optionName && <small>{issue.optionName}</small>}<time>{formatDate(issue.createdAt)}</time></div>
              <span className="sold-out-status">{issue.status}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function OperationsBoard({
  operations,
  clock
}: {
  operations: OperationsOverview | null;
  clock: Date | null;
}) {
  // 사용자가 고른 지역을 기억합니다(우선순위: 직접 고른 지역 > 접속 IP 위치 > 서울).
  const [selectedRegion, setSelectedRegionState] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("doogo-weather-region");
      if (saved) setSelectedRegionState(saved);
    } catch {
      // 저장소를 쓸 수 없는 환경에서는 기본 위치를 사용합니다.
    }
  }, []);
  const setSelectedRegion = (region: string) => {
    setSelectedRegionState(region);
    try {
      window.localStorage.setItem("doogo-weather-region", region);
    } catch {
      // 저장 실패는 무시합니다.
    }
  };
  const selectedWeather = selectedRegion && operations?.weather.some((item) => item.region === selectedRegion)
    ? operations?.weather.find((item) => item.region === selectedRegion)
    : operations?.currentWeather ?? operations?.weather.find((item) => item.region === "서울") ?? operations?.weather[0];
  const selectableWeather = operations?.weather ?? [];
  const hourFormatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    hourCycle: "h23"
  });
  const hour = clock
    ? Number(hourFormatter.formatToParts(clock).find((part) => part.type === "hour")?.value ?? 12)
    : 12;
  const timePeriod = hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 18 ? "day" : "night";
  const timePeriodLabel = timePeriod === "morning" ? "오전" : timePeriod === "day" ? "낮" : "밤";
  const weatherCode = selectedWeather?.weatherCode;
  const condition = selectedWeather?.condition ?? "";
  const weatherTheme =
    weatherCode !== null && weatherCode !== undefined
      ? weatherCode >= 95
        ? "thunder"
        : (weatherCode >= 71 && weatherCode <= 77) || (weatherCode >= 85 && weatherCode <= 86)
          ? "snow"
          : (weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82)
            ? "rain"
            : weatherCode >= 1 && weatherCode <= 48
              ? "cloud"
              : "clear"
      : /천둥|번개/.test(condition)
        ? "thunder"
        : /눈/.test(condition)
          ? "snow"
          : /비|소나기|이슬비/.test(condition)
            ? "rain"
            : /흐림|구름|안개/.test(condition)
              ? "cloud"
              : "clear";
  const WeatherIcon =
    weatherTheme === "thunder"
      ? CloudLightning
      : weatherTheme === "snow"
        ? CloudSnow
        : weatherTheme === "rain"
          ? CloudRain
          : weatherTheme === "cloud"
            ? Cloud
            : timePeriod === "night"
              ? MoonStar
              : timePeriod === "morning"
                ? Sunrise
                : Sun;
  return (
    <section className="operations-overview" aria-label="오늘의 운영 현황">
      <article className="operations-card weather-card">
        <div className="operations-card-heading"><CloudSun size={18} /><div><span>오늘의 날씨 · {selectedWeather?.region ?? "서울"} 기준</span><strong>{clock ? seoulClock(clock) : "한국시간 확인 중"}</strong></div></div>
        <div className={`weather-primary weather-theme-${weatherTheme} time-${timePeriod}`}>
          <div className="weather-primary-icon"><WeatherIcon size={34} /></div>
          <div className="weather-primary-copy"><strong>{selectedWeather?.temperature === null || selectedWeather?.temperature === undefined ? "--" : `${Math.round(selectedWeather.temperature)}°`}</strong><span>{selectedWeather?.condition ?? "날씨 확인 중"}</span><small>{selectedWeather?.city ?? "서울"} · {selectedRegion ? "선택한 대표도시" : operations?.currentWeather ? "접속 위치 기준" : "서울 기본 위치"}</small></div>
          <div className="weather-scene" aria-hidden="true">
            <span className="weather-time-label">{timePeriodLabel}</span>
            <span className="weather-orb" />
            <span className="weather-cloud weather-cloud-one" />
            <span className="weather-cloud weather-cloud-two" />
            <span className="weather-precipitation weather-precipitation-one" />
            <span className="weather-precipitation weather-precipitation-two" />
            <span className="weather-precipitation weather-precipitation-three" />
            <span className="weather-stars" />
          </div>
        </div>
        <div className="weather-region-list">
          {selectableWeather.map((weather) => (
            <button
              type="button"
              className={`${weather.available ? "" : "unavailable"} ${selectedWeather?.region === weather.region ? "active" : ""}`.trim()}
              key={weather.region}
              onClick={() => setSelectedRegion(weather.region)}
              aria-pressed={selectedWeather?.region === weather.region}
              aria-label={`${weather.region} ${weather.city} 날씨 보기`}
            >
              <span>{weather.region}</span>
              <strong>{weather.temperature === null ? "--" : `${Math.round(weather.temperature)}°`}</strong>
              <small>{weather.condition}</small>
            </button>
          ))}
          {!operations && <div className="weather-loading"><ThermometerSun size={18} /><span>지역 날씨를 불러오는 중입니다.</span></div>}
        </div>
        <small className="weather-source">대표도시 기준 · Open-Meteo · 10분 단위 갱신</small>
      </article>
      <article className={`operations-card facility-card ${operations?.operation.isClosed ? "closed" : "open"}`}>
        <div className="operations-card-heading"><Factory size={18} /><div><span>두고푸드 선과장</span><strong>{operations?.operation.status ?? "운영정보 확인 중"}</strong></div></div>
        <div className="facility-status">
          <span className="live-dot" />
          <div>
            <strong>{!operations ? "오늘의 운영 상태를 확인하고 있습니다." : operations.operation.isClosed ? "오늘은 선과장 휴무입니다." : !operations.operation.sourceAvailable ? "공휴일 정보를 다시 확인하고 있습니다." : "오늘도 정상적으로 운영 중입니다."}</strong>
            <small>{operations?.operation.reason ?? "대한민국 공휴일 여부를 확인하고 있습니다."}</small>
          </div>
        </div>
      </article>
      <article className="operations-card monthly-card">
        <div className="operations-card-heading"><CalendarRange size={18} /><div><span>이번 달 상품 현황</span><strong>{clock ? `${seoulMonth(clock)}월 실시간 집계` : "월간 현황 확인 중"}</strong></div></div>
        <div className="monthly-stat-list">
          <div><PackageCheck size={18} /><span>신규 상품</span><strong>{operations?.monthlyStats.newProducts ?? 0}<small>개</small></strong></div>
          <div><PackageX size={18} /><span>품절 전환 (시즌완료)</span><strong>{operations?.monthlyStats.soldOutChanges ?? 0}<small>개</small></strong></div>
        </div>
      </article>
    </section>
  );
}

export function CatalogHome() {
  const [data, setData] = useState<CatalogData>(emptyCatalogData);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [operations, setOperations] = useState<OperationsOverview | null>(null);
  const [clock, setClock] = useState<Date | null>(null);
  const [query, setQuery] = useState("");
  const [shippingType, setShippingType] = useState<"all" | ShippingType>("all");
  const [categoryId, setCategoryId] = useState("all");
  const [saleMonth, setSaleMonth] = useState<number | "all">("all");
  const [catalogPageSize, setCatalogPageSize] = useState<5 | 10 | 20>(5);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<{ src: string; alt: string } | null>(null);

  useEffect(() => {
    let active = true;
    const refreshCatalog = async () => {
      const initial = await loadCatalogInitial();
      if (!active) return;
      if (initial) {
        setData(initial);
        setCatalogLoading(false);
      }
      const next = await loadCatalog();
      if (active && next) {
        setData(next);
        setCatalogLoading(false);
      } else if (active && !initial) {
        setCatalogLoading(false);
      }
    };
    void refreshCatalog();
    const reloadCatalog = () => {
      void loadCatalog().then((next) => {
        if (active && next) setData(next);
      });
    };
    const timer = window.setInterval(reloadCatalog, 60 * 1000);
    const stopRefreshSignal = onCatalogRefreshSignal(reloadCatalog);
    return () => {
      active = false;
      window.clearInterval(timer);
      stopRefreshSignal();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const refreshOperations = () => {
      void loadOperations().then((next) => {
        if (active && next) setOperations(next);
      });
    };
    refreshOperations();
    setClock(new Date());
    const operationsTimer = window.setInterval(refreshOperations, 60 * 1000);
    const clockTimer = window.setInterval(() => setClock(new Date()), 1000);
    return () => {
      active = false;
      window.clearInterval(operationsTimer);
      window.clearInterval(clockTimer);
    };
  }, []);

  const filteredProducts = useMemo(() => data.products.filter((product) => {
    const normalized = query.trim().toLowerCase();
    const category = data.categories.find((item) => item.id === product.categoryId)?.name ?? "";
    return (shippingType === "all" || product.shippingType === shippingType)
      && (categoryId === "all" || product.categoryId === categoryId)
      && (saleMonth === "all" || (
        isSeasonalCategory(category)
        && (product.isAlwaysOnSale || isMonthInSeason(saleMonth, product.saleStartMonth, product.saleEndMonth))
      ))
      && (!normalized || `${product.name} ${product.origin ?? ""} ${category}`.toLowerCase().includes(normalized));
  }), [categoryId, data.categories, data.products, query, saleMonth, shippingType]);
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / catalogPageSize));
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * catalogPageSize;
    return filteredProducts.slice(startIndex, startIndex + catalogPageSize);
  }, [catalogPageSize, currentPage, filteredProducts]);
  const visiblePageNumbers = useMemo(() => {
    const pageWindowSize = 5;
    let startPage = Math.max(1, currentPage - Math.floor(pageWindowSize / 2));
    const endPage = Math.min(totalPages, startPage + pageWindowSize - 1);
    startPage = Math.max(1, endPage - pageWindowSize + 1);
    return Array.from({ length: Math.max(0, endPage - startPage + 1) }, (_, index) => startPage + index);
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
    setExpandedProductId(null);
  }, [categoryId, query, saleMonth, shippingType, catalogPageSize]);

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
      setExpandedProductId(null);
    }
  }, [currentPage, totalPages]);

  const changeCatalogPage = (page: number) => {
    if (page < 1 || page > totalPages || page === currentPage) return;
    setCurrentPage(page);
    setExpandedProductId(null);
    window.requestAnimationFrame(() => {
      document.querySelector("#price-table")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start"
      });
    });
  };

  const visibleCategories = data.categories.filter((category) => shippingType === "all" || category.shippingType === shippingType);
  const catalogItemCount = data.products.reduce((total, product) => total + Math.max(1, product.options?.length ?? 0), 0);
  const catalogTotalCount = data.catalogTotals?.productCount ?? catalogItemCount;
  const recentChangeCount = data.priceHistory.length;
  const currentMonth = clock ? seoulMonth(clock) : 0;
  // 제철 정보: 선택한 달(전체면 이번 달)에 판매기간이 걸친 제철 상품을 품목명 기준으로 묶어 보여줍니다.
  const highlightMonth = saleMonth === "all" ? currentMonth : saleMonth;
  const seasonalHighlights = useMemo(() => {
    if (!highlightMonth) return { total: 0, byCategory: [] as Array<{ name: string; count: number }>, keywords: [] as Array<{ keyword: string; count: number }> };
    const inSeason = data.products.filter((product) => {
      const category = data.categories.find((item) => item.id === product.categoryId);
      if (!isSeasonalCategory(category?.name) || product.isAlwaysOnSale) return false;
      if (!product.saleStartMonth || !product.saleEndMonth) return false;
      return isMonthInSeason(highlightMonth, product.saleStartMonth, product.saleEndMonth);
    });
    const categoryCounts = new Map<string, number>();
    const keywordCounts = new Map<string, number>();
    for (const product of inSeason) {
      const category = data.categories.find((item) => item.id === product.categoryId);
      const categoryName = category?.name ?? "기타";
      categoryCounts.set(categoryName, (categoryCounts.get(categoryName) ?? 0) + 1);
      const keyword = product.name.replace(/[[(].*?[\])]/g, " ").split(/\s+/).find((token) => /[가-힣A-Za-z]{2,}/.test(token))?.replace(/[^가-힣A-Za-z]/g, "") ?? "";
      if (keyword.length >= 2) keywordCounts.set(keyword, (keywordCounts.get(keyword) ?? 0) + 1);
    }
    return {
      total: inSeason.length,
      byCategory: [...categoryCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      keywords: [...keywordCounts.entries()].map(([keyword, count]) => ({ keyword, count })).sort((a, b) => b.count - a.count).slice(0, 12)
    };
  }, [data.products, data.categories, highlightMonth]);
  return (
    <PageFrame>
      <main className="catalog-main">
        <OperationsBoard operations={operations} clock={clock} />
        <section className="catalog-hero">
          <div>
            <span className="hero-eyebrow"><Sparkles size={14} /> 판매자를 위한 실시간 상품 정보</span>
            <h1>좋은 먹거리 <mark className="hero-highlight">신선함</mark> 그대로</h1>
            <p>생산자와 판매자를 연결하고, 필요한 먹거리를 빠르게 공급하는,<br className="hero-motto-break" /> 대한민국 도매 플랫폼 두고푸드.</p>
          </div>
          <div className="hero-summary">
            <div><strong>{catalogTotalCount.toLocaleString("ko-KR")}</strong><span>등록 상품</span></div>
            <div><strong>{data.categories.length}</strong><span>카테고리</span></div>
            <div><strong>{recentChangeCount}</strong><span>최근 변동</span></div>
          </div>
        </section>
        <section className="catalog-panel" id="price-table">
          <div className="section-heading table-heading">
            <div><span className="section-kicker">PRODUCT LIST</span><h2>상품 단가표</h2><p>상품 이미지를 누르면 크게 확인할 수 있습니다.</p></div>
            <div className="catalog-table-tools">
              <span className="result-count">총 {filteredProducts.length}개 상품</span>
              <label className="page-size-control">페이지당
                <select value={catalogPageSize} onChange={(event) => setCatalogPageSize(Number(event.target.value) as 5 | 10 | 20)} aria-label="페이지당 상품 수">
                  <option value={5}>5개</option><option value={10}>10개</option><option value={20}>20개</option>
                </select>
              </label>
            </div>
          </div>
          <div className="filter-toolbar">
            <div className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="상품명, 원산지 검색" /></div>
            <div className="segmented-control" aria-label="배송 유형">
              {(["all", "domestic", "overseas"] as const).map((value) => (
                <button key={value} className={shippingType === value ? "active" : ""} onClick={() => { setShippingType(value); setCategoryId("all"); }}>
                  {value === "all" ? "전체" : value === "domestic" ? "국내배송" : "해외배송"}
                </button>
              ))}
            </div>
          </div>
          <div className="category-chips">
            <button className={categoryId === "all" ? "active" : ""} onClick={() => setCategoryId("all")}>전체 카테고리</button>
            {visibleCategories.map((category) => <button key={category.id} className={categoryId === category.id ? "active" : ""} onClick={() => setCategoryId(category.id)}>{category.name}</button>)}
          </div>
          <div className="month-filter">
            <span><CalendarRange size={15} /> 월별 제철상품</span>
            <div>
              <button className={saleMonth === "all" ? "active" : ""} onClick={() => setSaleMonth("all")}>전체</button>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                <button key={month} className={saleMonth === month ? "active" : month === currentMonth ? "current" : ""} onClick={() => setSaleMonth(month)}>{month}월</button>
              ))}
            </div>
            <small>농산·수산·축산·선물세트·식품만 월별 판매기간에 따라 검색됩니다.</small>
            <strong className="season-prep-message"><span>SEASON TIP</span> 미리미리 제철 시즌이 되기 전에, 판매 상품을 준비해보세요!</strong>
            {highlightMonth > 0 && (
              <div className="season-highlight" aria-live="polite">
                <div className="season-highlight-title">
                  <strong>{highlightMonth}월 제철</strong>
                  <span>{seasonalHighlights.total > 0 ? `${seasonalHighlights.total}개 상품 · ${seasonalHighlights.byCategory.map((item) => `${item.name} ${item.count}`).join(" · ")}` : "등록된 제철 상품이 없습니다."}</span>
                </div>
                {seasonalHighlights.keywords.length > 0 && (
                  <div className="season-highlight-keywords">
                    {seasonalHighlights.keywords.map((item) => (
                      <button type="button" key={item.keyword} className={query.trim() === item.keyword ? "active" : ""} onClick={() => setQuery(query.trim() === item.keyword ? "" : item.keyword)} aria-pressed={query.trim() === item.keyword}>
                        {item.keyword}<small>{item.count}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="order-legend" aria-label="주문 가능 여부 안내">
            <span className="order-legend-item available"><i aria-hidden="true" /> 흰색 행 · 지금 주문 가능</span>
            <span className="order-legend-item unavailable"><i aria-hidden="true" /> 빨간색 행 · 품절 또는 상품준비중(주문 불가)</span>
          </div>
          <div className="catalog-table-wrap">
            <table className="catalog-table">
              <colgroup>
                <col className="catalog-col-product" />
                <col className="catalog-col-category" />
                <col className="catalog-col-price" />
                <col className="catalog-col-price" />
                <col className="catalog-col-sale" />
                <col className="catalog-col-notes" />
              </colgroup>
              <thead><tr><th>상품</th><th>배송 / 카테고리 / 판매기간</th><th>A단가</th><th>일반공급가</th><th>판매가</th><th>상품 안내</th></tr></thead>
              <tbody>
                {paginatedProducts.map((product) => {
                  const category = data.categories.find((item) => item.id === product.categoryId);
                  const options = product.options ?? [];
                  const sortedOptions = sortedProductOptions(product);
                  const expanded = expandedProductId === product.id;
                  const minimumAPrice = options.length > 0
                    ? Math.min(...sortedOptions.map((option) => effectiveAPrice(option.aPrice, option.generalPrice)))
                    : effectiveAPrice(product.aPrice, product.generalPrice);
                  const minimumGeneralPrice = options.length > 0
                    ? Math.min(...sortedOptions.map((option) => option.generalPrice))
                    : product.generalPrice;
                  const salePolicy = salePriceLabel(product.salePriceMode, product.salePrice);
                  const allOptionsSoldOut = options.length > 0 && options.every((option) => option.isSoldOut);
                  const soldOutNow = Boolean(product.isSoldOut || allOptionsSoldOut);
                  const seasonConfigured = Boolean(product.saleStartMonth && product.saleEndMonth);
                  const availableNow = !product.isSoldOut && !allOptionsSoldOut && (
                    !isSeasonalCategory(category?.name)
                    || product.isAlwaysOnSale
                    || (seasonConfigured && isMonthInSeason(currentMonth, product.saleStartMonth, product.saleEndMonth))
                  );
                  const supplyLabel = soldOutNow ? "품절" : availableNow ? "" : "상품준비중";
                  return (
                    <Fragment key={product.id}>
                      <tr className={`${expanded ? "expanded " : ""}${soldOutNow ? "sold-out order-unavailable" : availableNow ? "supply-active" : "season-waiting order-unavailable"}`.trim()}>
                        <td className="catalog-product-cell">
                          <div className="product-cell"><button type="button" className="product-image-button" onClick={() => { const src = productImageSrc(product); if (src) setImagePreview({ src, alt: product.name }); }} aria-label={`${product.name} 이미지 크게 보기`}><ProductThumb product={product} /></button><div><span className={`delivery-badge ${product.shippingType}`}>{product.shippingType === "domestic" ? "국내배송" : "해외배송"}</span><strong>{product.name}</strong>{product.origin && <small>{product.origin}</small>}{!availableNow || soldOutNow ? <em className={soldOutNow ? "supply-sold-out" : "supply-season-waiting"}>{supplyLabel}</em> : null}{options.length > 0 && <button className="option-toggle" onClick={() => setExpandedProductId(expanded ? null : product.id)} aria-expanded={expanded}>{expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />} 옵션 {options.length}개 {expanded ? "접기" : "보기"}</button>}</div></div>
                          {expanded && options.length > 0 && <div className="mobile-inline-options"><PublicOptionList product={product} /></div>}
                        </td>
                        <td data-label="카테고리·판매기간"><div className="mobile-cell-value"><strong>{category?.name ?? "-"}</strong><small>{product.optionsInfo || (sortedOptions[0]?.name ?? "-")}</small><span className="season-badge"><CalendarRange size={12} /> {seasonLabel(product, category?.name)}</span></div></td>
                        <td data-label="A단가"><div className="mobile-cell-value"><b className="price a-price">{formatPrice(minimumAPrice)}</b><small>{options.length > 1 ? "옵션 최저 A단가" : "A회원 공급가"}</small></div></td>
                        <td data-label="일반공급가"><div className="mobile-cell-value"><b className="price">{formatPrice(minimumGeneralPrice)}</b><small>{options.length > 1 ? "옵션 최저 일반공급가" : "일반 판매자"}</small></div></td>
                        <td data-label="판매가"><div className="mobile-cell-value"><b className={`price sale-price ${product.salePriceMode}`}>{salePolicy.main}</b><small>{salePolicy.sub}</small></div></td>
                        <td data-label="상품 안내"><div className="mobile-cell-value"><p>{product.notes || "-"}</p>{product.packaging && <small>{product.packaging}</small>}</div></td>
                      </tr>
                      {expanded && options.length > 0 && (
                        <tr className="option-detail-row">
                          <td colSpan={6}>
                            <div className="option-detail-panel">
                              <div className="option-detail-heading"><div><span>OPTION PRICE</span><strong>{product.name} 옵션별 공급가</strong></div><small>사이즈와 구성에 따라 단가가 달라집니다.</small></div>
                              <PublicOptionList product={product} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {catalogLoading ? <div className="catalog-loading-state"><div className="spinner" /><strong>최신 상품을 불러오고 있습니다.</strong><span>이전 상품 대신 현재 데이터만 표시합니다.</span></div> : filteredProducts.length === 0 && <div className="empty-state"><PackageSearch size={30} /><strong>조건에 맞는 상품이 없습니다.</strong><span>검색어나 카테고리를 변경해 주세요.</span></div>}
          </div>
          {totalPages > 1 && (
            <div className="catalog-pagination">
              <span className="catalog-pagination-summary">
                {(currentPage - 1) * catalogPageSize + 1}-{Math.min(currentPage * catalogPageSize, filteredProducts.length)}
                <small> / 총 {filteredProducts.length}개</small>
              </span>
              <nav aria-label="상품 단가표 페이지">
                <button
                  type="button"
                  className="catalog-page-step catalog-page-edge"
                  onClick={() => changeCatalogPage(1)}
                  disabled={currentPage === 1}
                  aria-label="첫 상품 페이지"
                >
                  <ChevronsLeft size={16} /><span>처음</span>
                </button>
                <button
                  type="button"
                  className="catalog-page-step"
                  onClick={() => changeCatalogPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  aria-label="이전 상품 페이지"
                >
                  <ChevronLeft size={16} /><span>이전</span>
                </button>
                <div className="catalog-page-numbers">
                  {visiblePageNumbers.map((page, index) => (
                    <Fragment key={page}>
                      {index > 0 && <span aria-hidden="true">/</span>}
                      <button
                        type="button"
                        className={currentPage === page ? "active" : ""}
                        onClick={() => changeCatalogPage(page)}
                        aria-current={currentPage === page ? "page" : undefined}
                        aria-label={`${page}페이지`}
                      >
                        {page}
                      </button>
                    </Fragment>
                  ))}
                </div>
                <button
                  type="button"
                  className="catalog-page-step"
                  onClick={() => changeCatalogPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  aria-label="다음 상품 페이지"
                >
                  <span>다음</span><ChevronRight size={16} />
                </button>
                <button
                  type="button"
                  className="catalog-page-step catalog-page-edge"
                  onClick={() => changeCatalogPage(totalPages)}
                  disabled={currentPage === totalPages}
                  aria-label="마지막 상품 페이지"
                >
                  <span>마지막</span><ChevronsRight size={16} />
                </button>
              </nav>
            </div>
          )}
        </section>
      </main>
      {imagePreview && <ImageModal src={imagePreview.src} alt={imagePreview.alt} onClose={() => setImagePreview(null)} />}
    </PageFrame>
  );
}

export function GuidePage() {
  const [settings, setSettings] = useState<CatalogData["settings"] | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [faqPage, setFaqPage] = useState(1);
  const [noticePage, setNoticePage] = useState(1);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  useEffect(() => {
    void loadGuideSettings().then((next) => next && setSettings(next));
    void loadNotices().then((next) => next && setNotices(next));
  }, []);
  useEffect(() => {
    setNoticePage(1);
  }, [notices.length]);
  const guide = settings ? parseGuideContent(settings.guide_sections) : { ...fallbackGuideContent, faq: [] };
  const faqPageSize = 5;
  const faqPageCount = Math.max(1, Math.ceil(guide.faq.length / faqPageSize));
  const visibleFaq = guide.faq.slice((faqPage - 1) * faqPageSize, faqPage * faqPageSize);
  const pinnedNotice = notices.find((notice) => notice.isPinned);
  const generalNotices = notices.filter((notice) => notice.id !== pinnedNotice?.id);
  const noticePageSize = 3;
  const noticePageCount = Math.max(1, Math.ceil(generalNotices.length / noticePageSize));
  const visibleGeneralNotices = generalNotices.slice((noticePage - 1) * noticePageSize, noticePage * noticePageSize);
  return (
    <PageFrame>
      <main className="content-page">
        <div className="content-hero"><span className="section-kicker">NOTICE & SELLER GUIDE</span><h1>공지사항</h1><p>두고푸드 운영 공지와 판매 전 반드시 확인해야 할 발주·배송·CS 기준을 한곳에서 확인하세요.</p></div>
        {pinnedNotice && (
          <button className="must-read-banner page" type="button" onClick={() => setSelectedNotice(pinnedNotice)}>
            <span><Bell size={17} /><b>필독 공지</b></span>
            <div><strong>{pinnedNotice.title}</strong><small>중요 공지 내용을 팝업으로 확인합니다.</small></div>
            <ChevronRight size={18} />
          </button>
        )}
        {generalNotices.length > 0 && (
          <section className="notice-list general-notices guide-notice-list">
            <div className="section-heading"><div><span className="section-kicker">NOTICE</span><h2>운영 공지</h2><p>공지 제목을 누르면 이미지와 영상이 포함된 전체 내용을 확인할 수 있습니다.</p></div></div>
            {visibleGeneralNotices.map((notice, index) => (
              <button className={`notice-row-button notice-accent-${(index % 3) + 1}`} type="button" key={notice.id} onClick={() => setSelectedNotice(notice)}>
                <span>{formatDate(notice.updatedAt)}</span>
                <div><h2>{notice.title}</h2><p>{notice.content}</p></div>
                <ChevronRight size={18} />
              </button>
            ))}
            {noticePageCount > 1 && <nav className="notice-pagination" aria-label="운영 공지 페이지">{Array.from({ length: noticePageCount }, (_, index) => index + 1).map((value) => <button type="button" key={value} className={noticePage === value ? "active" : ""} onClick={() => setNoticePage(value)} aria-current={noticePage === value ? "page" : undefined}>{value}</button>)}</nav>}
          </section>
        )}
        <section className="guide-dashboard">
          <article className="guide-highlight-card">
            <div className="guide-icon"><ShieldCheck size={24} /></div>
            <div><span className="section-kicker">MUST READ</span><h2>셀러 필독사항</h2>{guide.highlights.map((line) => <p key={line}>{line}</p>)}</div>
          </article>
          <div className="guide-info-grid">
            {guide.orderInfo.map((item, index) => {
              const Icon = index === 0 ? Clock3 : index === 1 ? Truck : WalletCards;
              return <article key={`${item.label}-${index}`}><Icon size={21} /><span>{item.label}</span><strong>{item.value}</strong></article>;
            })}
          </div>
          <div className="guide-two-column">
            <section className="guide-section-card guide-tone-order">
              <div className="card-title"><PackageSearch size={20} /><div><span>ORDER</span><h2>발주 방법</h2></div></div>
              <ol>{guide.orderMethod.map((item) => <li key={item}>{item}</li>)}</ol>
            </section>
            <section className="guide-section-card guide-tone-cs">
              <div className="card-title"><CircleHelp size={20} /><div><span>CS GUIDE</span><h2>CS 요청 안내</h2></div></div>
              <strong className="cs-summary">{guide.csSummary}</strong>
              <p>{guide.csHow}</p>
              <ul>{guide.csRules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
            </section>
          </div>
          <section className="guide-section-card guide-tone-info">
            <div className="card-title"><Info size={20} /><div><span>INFORMATION</span><h2>기타 안내</h2></div></div>
            <div className="guide-etc-grid">{guide.etc.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>
          </section>
          <section className="guide-section-card faq-section">
            <div className="card-title"><CircleHelp size={20} /><div><span>FAQ</span><h2>자주 묻는 질문</h2></div></div>
            <div className="faq-list">
              {visibleFaq.map((item, index) => {
                const absoluteIndex = (faqPage - 1) * faqPageSize + index;
                const open = openFaq === absoluteIndex;
                return (
                  <article key={`${item.q}-${absoluteIndex}`}>
                    <button onClick={() => setOpenFaq(open ? null : absoluteIndex)} aria-expanded={open}>
                      <span><b>Q.</b>{item.q}</span>{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                    {open && <div className="faq-answer"><b>A.</b><p>{item.a}</p></div>}
                  </article>
                );
              })}
            </div>
            {!settings && <div className="faq-loading"><div className="spinner" /><span>최신 FAQ를 불러오는 중입니다.</span></div>}
            {faqPageCount > 1 && <nav className="faq-pagination" aria-label="FAQ 페이지">{Array.from({ length: faqPageCount }, (_, index) => index + 1).map((value) => <button type="button" key={value} className={faqPage === value ? "active" : ""} onClick={() => { setFaqPage(value); setOpenFaq(null); }} aria-current={faqPage === value ? "page" : undefined}>{value}</button>)}</nav>}
          </section>
        </section>
      </main>
      {selectedNotice && <NoticeModal notice={selectedNotice} onClose={() => setSelectedNotice(null)} />}
    </PageFrame>
  );
}

export function NoticesPage() {
  const [data, setData] = useState<CatalogData>(emptyCatalogData);
  useEffect(() => {
    let active = true;
    const reloadCatalog = () => {
      void loadCatalog().then((next) => {
        if (active && next) setData(next);
      });
    };
    reloadCatalog();
    const timer = window.setInterval(reloadCatalog, 60 * 1000);
    const stopRefreshSignal = onCatalogRefreshSignal(reloadCatalog);
    return () => {
      active = false;
      window.clearInterval(timer);
      stopRefreshSignal();
    };
  }, []);
  return (
    <PageFrame>
      <main className="content-page">
        <div className="content-hero"><span className="section-kicker">DAILY PRICE BOARD</span><h1>가격변동</h1><p>경매장 시세판처럼 최근 3일간 상품과 옵션별 변동 가격을 정확하게 확인할 수 있습니다.</p></div>
        <section className="history-page-panel">
          <div className="section-heading"><div><span className="section-kicker">PRICE HISTORY</span><h2>최근 3일 가격변동</h2><p>상품 썸네일, 상품명, 옵션명과 변경 전후 금액을 함께 표시합니다.</p></div></div>
          <PriceChangeBoard histories={data.priceHistory} products={data.products} pageSize={5} />
          <SoldOutIssueBoard issues={data.recentSoldOutIssues} />
        </section>
      </main>
    </PageFrame>
  );
}

export function SourcingPage() {
  const [settings, setSettings] = useState<CatalogData["settings"]>(fallbackData.settings);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    void loadGuideSettings().then((next) => next && setSettings(next));
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    try {
      const response = await apiFetch("/catalog/sourcing", {
        method: "POST",
        auth: false,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries()))
      });
      if (!response.ok) throw new Error("요청을 저장하지 못했습니다.");
      setSubmitted(true);
      toast.success("소싱 요청이 접수되었습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "소싱 요청에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageFrame>
      <main className="content-page sourcing-page">
        <div className="content-hero"><span className="section-kicker">PRODUCT REQUEST</span><h1>소싱해주세요!</h1><p>{settings.sourcing_intro || fallbackData.settings.sourcing_intro}</p></div>
        {submitted ? (
          <section className="submitted-card"><div><Send size={28} /></div><h2>요청이 접수되었습니다.</h2><p>마스터 관리자가 확인 후 입력하신 연락처로 안내드립니다.</p><Link to="/">상품 목록으로 돌아가기</Link></section>
        ) : (
          <form className="sourcing-form" onSubmit={submit}>
            <SourcingSteps />
            <SourcingFormFields />
            <div className="sourcing-submit-bar">
              <button type="submit" disabled={submitting}>{submitting ? "접수 중…" : "소싱 요청 보내기"} <Send size={16} /></button>
            </div>
          </form>
        )}
      </main>
    </PageFrame>
  );
}
