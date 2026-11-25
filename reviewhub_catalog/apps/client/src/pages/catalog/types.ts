import type { PartnerDeal, PartnerSupplierLink } from "@repo/shared/partner-deal";
import type { PublicProductGroup } from "@repo/shared/product-groups";
export type ShippingType = "domestic" | "overseas";

export type Category = {
  id: string;
  name: string;
  shippingType: ShippingType;
  sortOrder: number;
  isActive: boolean;
  productCount?: number;
};

export type ShippingPolicy = {
  id: string;
  name: string;
  shippingType: ShippingType;
  courier: string | null;
  fee: number;
  feeLabel: string;
  freeShippingThreshold: number | null;
  feeType: "free" | "paid" | "conditional";
  feeBasis: "order" | "quantity" | "weight";
  jejuExtraFee: number;
  islandExtraFee: number;
  returnFee: number | null;
  exchangeFee: number | null;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  // 발주오라형 배송비 유형(migration 025). 예전에 만든 정책은 비어 있습니다.
  rateType?: ShippingRateType | null;
  rateTiers?: ShippingRateTiers | null;
  unitLabel?: string | null;
  freeWholeOrder?: boolean;
  policyCode?: string | null;
  // 관리자 목록: 이 정책이 연결된 상품 수
  productCount?: number;
};

export type ShippingRateType = "fixed" | "free" | "amount" | "quantity" | "unit";
export type ShippingRateTiers = { tiers: Array<{ upTo: number; fee: number }>; last: { fee: number; repeat: boolean } };

export type Supplier = {
  id: string;
  name: string;
  businessNumber: string | null;
  representative: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  memo: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductOption = {
  id: string;
  productId: string;
  name: string;
  costPrice?: number;
  aPrice: number;
  generalPrice: number;
  salePrice: number | null;
  salePriceMode: "autonomous" | "fixed";
  isSoldOut: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type Product = {
  id: string;
  productCode: string | null;
  name: string;
  imageUrl: string | null;
  origin: string | null;
  supplierName?: string | null;
  costPrice?: number;
  aPrice: number;
  generalPrice: number;
  salePrice: number | null;
  salePriceMode: "autonomous" | "fixed";
  saleStartMonth: number | null;
  saleEndMonth: number | null;
  isAlwaysOnSale: boolean;
  shippingFee: string;
  releaseInfo: string | null;
  notes: string | null;
  optionsInfo: string | null;
  packaging: string | null;
  courier: string | null;
  shippingPolicyId?: string | null;
  shippingType: ShippingType;
  categoryId: string;
  displayOrder?: number;
  isVisible: boolean;
  isSoldOut: boolean;
  // 관리자가 직접 지정한 시즌종료(migration 028)
  isSeasonEnded?: boolean;
  createdAt: string;
  updatedAt: string;
  options: ProductOption[];
};

export type ProductGroupItem = {
  id: string;
  productId: string;
  sortOrder: number;
  product: Product | null;
};

export type ProductGroup = {
  id: string;
  name: string;
  imageUrl: string | null;
  categoryId: string | null;
  description: string | null;
  displayOrder: number;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
  items: ProductGroupItem[];
};

export type Notice = {
  id: string;
  title: string;
  content: string;
  imageUrl?: string | null;
  youtubeUrl?: string | null;
  isPinned: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PriceHistory = {
  id: string;
  productId: string;
  productName: string;
  optionId: string | null;
  optionName: string | null;
  field: "costPrice" | "aPrice" | "generalPrice" | "salePrice";
  oldPrice: number;
  newPrice: number;
  changedBy: string;
  changedAt: string;
  productImageUrl: string | null;
};

export type SoldOutIssue = {
  id: string;
  productId: string;
  productName: string;
  productImageUrl: string | null;
  optionId: string | null;
  optionName: string | null;
  createdAt: string;
  status: "품절";
  // 품절이슈 카드의 배송·카테고리·판매기간 줄(단가표에서 숨긴 상품도 표시)
  productCode?: string | null;
  shippingType?: ShippingType;
  categoryId?: string | null;
  shippingPolicyId?: string | null;
  saleStartMonth?: number | null;
  saleEndMonth?: number | null;
  isAlwaysOnSale?: boolean;
};

export type OperationsOverview = {
  generatedAt: string;
  timeZone: "Asia/Seoul";
  weather: Array<{
    region: string;
    city: string;
    temperature: number | null;
    weatherCode: number | null;
    condition: string;
    observedAt: string | null;
    available: boolean;
  }>;
  currentWeather: {
    region: string;
    city: string;
    temperature: number | null;
    weatherCode: number | null;
    condition: string;
    observedAt: string | null;
    available: boolean;
  } | null;
  operation: {
    isClosed: boolean;
    status: "정상운영" | "선과장 휴무" | "공휴일 확인 지연";
    reason: string;
    sourceAvailable: boolean;
  };
  monthlyStats: {
    newProducts: number;
    soldOutChanges: number;
    activityChanges: number;
  };
};

export type GuideInfoItem = {
  label: string;
  value: string;
};

export type GuideFaqItem = {
  q: string;
  a: string;
};

export type GuideContent = {
  highlights: string[];
  orderInfo: GuideInfoItem[];
  orderMethod: string[];
  csSummary: string;
  csHow: string;
  csRules: string[];
  etc: GuideInfoItem[];
  faq: GuideFaqItem[];
};

export type SourcingRequest = {
  id: string;
  productName: string;
  desiredPrice: string | null;
  referenceUrl: string | null;
  requesterName: string;
  contact: string;
  details: string | null;
  status: "received" | "reviewing" | "completed";
  requestType?: "sourcing" | "partner";
  companyName?: string | null;
  email?: string | null;
  businessType?: string | null;
  emailStatus?: "sent" | "failed" | "skipped" | null;
  emailSentAt?: string | null;
  createdAt: string;
  updatedAt: string;
  // 입점 신청 진행 단계·계약 조건(partner_deals, 입점 신청만)
  deal?: PartnerDeal | null;
  // 입점 성공 → 이은 공급사(없으면 이름이 같은 공급사)·정산 방식·공급사 센터 계정(입점 신청만, 2026-11-25)
  supplierLink?: PartnerSupplierLink | null;
};

// 공개 단가표에 내려오는 배송 정책(관리용 필드 제외)
export type PublicShippingPolicy = Omit<ShippingPolicy, "isActive" | "sortOrder" | "createdAt" | "updatedAt" | "productCount">;

export type CatalogData = {
  categories: Category[];
  shippingPolicies?: PublicShippingPolicy[];
  products: Product[];
  // 옵션 묶음(migration 033): 같은 상품의 사이즈들을 카드 하나 + 옵션 팝업으로 보여 줄 상품 ID 묶음
  groups?: PublicProductGroup[];
  notices: Notice[];
  priceHistory: PriceHistory[];
  // 공개 단가표 응답은 최근 가격변동 일부만 싣고, 기간 안 전체 건수는 여기에 담습니다.
  priceHistoryCount?: number;
  recentSoldOutIssues: SoldOutIssue[];
  settings: Record<string, string>;
  isPartial?: boolean;
  // 공개 단가표 버전(서버 /api/catalog 응답, 2026-11-24): 화면이 1분마다 /api/catalog/version과 비교해 바뀌었을 때만 다시 받습니다.
  catalogVersion?: string | null;
  catalogTotals?: {
    productCount: number;
    visibleProductCount: number;
    soldOutProductCount?: number;
  };
};

export type AdminCatalogData = CatalogData & {
  sourcingRequests: SourcingRequest[];
  priceHistoryCount?: number;
};

export type AdminOverview = {
  productCount: number;
  visibleProductCount: number;
  soldOutProductCount: number;
  groupProductCount: number;
  generalProductCount: number;
  priceHistoryCount: number;
  sourcingCounts: {
    all: number;
    received: number;
    reviewing: number;
    completed: number;
  };
  recentNotices: Notice[];
};

export type AdminHomeData = {
  overview: AdminOverview;
  // 발주오라 동기화 요약(관리자 > 발주오라 동기화). ready=false면 DB 업데이트(034) 전입니다.
  baljuora: {
    ready: boolean;
    linkedCount: number;
    lastCompareAt: string | null;
    lastPushAt: string | null;
    lastPushSummary: Record<string, unknown> | null;
  };
};
