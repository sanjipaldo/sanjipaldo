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
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

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
};

export type CatalogData = {
  categories: Category[];
  products: Product[];
  notices: Notice[];
  priceHistory: PriceHistory[];
  recentSoldOutIssues: SoldOutIssue[];
  settings: Record<string, string>;
  isPartial?: boolean;
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
  sync: CatalogSyncOverview;
  sales: SalesOverview;
};

export type CatalogSyncOverview = {
  provider: "baljuora";
  sourceOfTruth: "doogofood";
  target: "baljuora";
  initialImport: {
    status: string;
    total: number;
    imported: number;
    lastRunAt: string | null;
  };
  products: number;
  linkedProducts: number;
  outbox: { pending: number; failed: number; blocked: number };
  writeIntegration: {
    status: "disconnected" | "verification_required" | "connected" | "error";
    account: string | null;
    connectedAt: string | null;
    reason: string;
    safeMode: boolean;
  };
};

export type CatalogSyncRun = {
  id: string;
  direction: string;
  trigger: string;
  total: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  conflictCount: number;
  status: string;
  startedAt: string;
  finishedAt: string | null;
};

export type CatalogSyncOutboxItem = {
  id: string;
  productId: string;
  productName: string | null;
  action: string;
  status: string;
  attempts: number;
  payload: Record<string, unknown>;
  lastError: string | null;
  createdAt: string;
  processedAt: string | null;
};

export type SalesOverview = {
  month: string;
  sourceConnected: boolean;
  sourceStatus: string;
  updatedAt: string | null;
  totals: {
    revenue: number;
    cost: number;
    orderCount: number;
    profit: number;
    profitRate: number;
  };
  days: Array<{
    date: string;
    revenue: number;
    cost: number;
    orderCount: number;
    profit: number;
  }>;
  suppliers: Array<{
    supplierName: string;
    revenue: number;
    cost: number;
    orderCount: number;
    profit: number;
  }>;
};
