import { FormEvent, Fragment, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Boxes,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronsLeft,
  GripVertical,
  ChevronsRight,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Download,
  FileSpreadsheet,
  History,
  Info,
  LogOut,
  Menu,
  PackagePlus,
  Pencil,
  Plus,
  Save,
  Send,
  Search,
  ShieldCheck,
  Store,
  Tags,
  TrendingUp,
  Trash2,
  Truck,
  Upload,
  WalletCards,
  X,
  LayoutDashboard,
  ListOrdered
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { authClient, clearAuthToken } from "@/lib/auth";
import type { AdminCatalogData, AdminHomeData, AdminOverview, Category, CatalogSyncOutboxItem, CatalogSyncOverview, CatalogSyncRun, GuideContent, Notice, OperationsOverview, PriceHistory, Product, ProductGroup, ProductOption, SalesOverview, ShippingPolicy, ShippingType, SourcingRequest, Supplier } from "../catalog/types";

type AdminSection = "home" | "products" | "bundles" | "sort" | "categories" | "shippingPolicies" | "suppliers" | "changes" | "transmissions" | "sales" | "notices" | "history" | "sourcing" | "sync";
type ProductOptionDraft = Pick<ProductOption, "id" | "name" | "costPrice" | "aPrice" | "generalPrice" | "salePrice" | "salePriceMode" | "isSoldOut" | "sortOrder">;
type BulkWorkbookPreview = {
  totalRows: number;
  matchedRows: number;
  affectedProducts: number;
  changes: Array<{
    row: number;
    productName: string;
    optionName: string | null;
    field: string;
    before: string | number | boolean | null;
    after: string | number | boolean | null;
  }>;
  errors: Array<{ row: number; message: string }>;
  warnings: string[];
  format?: "bulk" | "baljuora";
  newProducts?: number;
};

const emptyData: AdminCatalogData = { categories: [], products: [], notices: [], priceHistory: [], recentSoldOutIssues: [], sourcingRequests: [], settings: {} };
// Keep the last successful admin payload in memory while navigating between
// console sections. The server still revalidates in the background, but a
// revisited list can render immediately instead of showing the full-page
// loader again.
const adminDataCache = new Map<AdminSection, AdminCatalogData>();
let adminHomeCache: AdminHomeData | null = null;
let bundleGroupsCache: { groups: ProductGroup[]; storedAt: number } | null = null;
const fallbackGuide: GuideContent = {
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
    { q: "송하인 주소와 번호를 비워도 되나요?", a: "정확한 배송 안내를 위해 발주 시 송하인 정보를 함께 입력해 주세요." },
    { q: "판매가는 자유롭게 정할 수 있나요?", a: "공급가는 두고푸드가 안내하며 최종 판매가는 판매자가 결정합니다." }
  ]
};

function parseGuide(value?: string): GuideContent {
  if (!value) return fallbackGuide;
  try {
    const parsed = JSON.parse(value) as Partial<GuideContent>;
    return {
      highlights: parsed.highlights ?? fallbackGuide.highlights,
      orderInfo: parsed.orderInfo ?? fallbackGuide.orderInfo,
      orderMethod: parsed.orderMethod ?? fallbackGuide.orderMethod,
      csSummary: parsed.csSummary ?? fallbackGuide.csSummary,
      csHow: parsed.csHow ?? fallbackGuide.csHow,
      csRules: parsed.csRules ?? fallbackGuide.csRules,
      etc: parsed.etc ?? fallbackGuide.etc,
      faq: parsed.faq ?? fallbackGuide.faq
    };
  } catch {
    return fallbackGuide;
  }
}

// 상품 편집 화면의 이미지 미리보기: 불러오지 못하면(잘못된 주소 등) 바로 알려 줍니다.
function ProductImagePreview({ url, onClear }: { url: string; onClear: () => void }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return (
    <span className={`product-image-preview ${failed ? "failed" : ""}`}>
      {failed ? <span className="product-image-broken">이미지를 불러올 수 없습니다.<br />주소를 확인하거나 다시 업로드해 주세요.</span> : <img src={url} alt="상품 이미지 미리보기" onError={() => setFailed(true)} />}
      <span className="product-image-preview-meta"><b>{failed ? "미리보기 실패" : "미리보기"}</b><button type="button" onClick={onClear}>이미지 지우기</button></span>
    </span>
  );
}

type BulkField = "isVisible" | "isSoldOut" | "categoryId" | "shippingPolicyId" | "courier" | "supplierName" | "season" | "imageUrl" | "notes" | "packaging";

// 선택한 상품 일괄 변경(발주오라 "상품 일괄 변경"과 같은 방식: 체크한 항목만 바뀝니다).
function BulkEditModal({ ids, categories, shippingPolicies, suppliers, nonSeasonalCount = 0, preset, onClose, onDone }: { ids: string[]; categories: Category[]; shippingPolicies: ShippingPolicy[]; suppliers: Supplier[]; nonSeasonalCount?: number; preset?: "seasonInfo"; onClose: () => void; onDone: () => void }) {
  const [enabled, setEnabled] = useState<Record<BulkField, boolean>>({ isVisible: false, isSoldOut: false, categoryId: false, shippingPolicyId: false, courier: false, supplierName: false, season: preset === "seasonInfo", imageUrl: false, notes: preset === "seasonInfo", packaging: false });
  const [isVisible, setIsVisible] = useState(true);
  const [isSoldOut, setIsSoldOut] = useState(false);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [shippingPolicyId, setShippingPolicyId] = useState("");
  const [courier, setCourier] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [alwaysOnSale, setAlwaysOnSale] = useState(false);
  const [startMonth, setStartMonth] = useState(1);
  const [endMonth, setEndMonth] = useState(12);
  const [imageUrl, setImageUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [packaging, setPackaging] = useState("");
  const [pickingEnd, setPickingEnd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);
  const toggle = (field: BulkField) => setEnabled((current) => ({ ...current, [field]: !current[field] }));
  const selectedCount = Object.values(enabled).filter(Boolean).length;

  const upload = async (file: File) => {
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size >= 5 * 1024 * 1024) {
      toast.error("상품 이미지는 5MB 미만 JPEG 또는 PNG만 올릴 수 있습니다.");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const payload = await readData<{ file: { downloadUrl: string } }>(await apiFetch("/catalog/admin/products/image-upload", { method: "POST", body: form }));
      setImageUrl(payload.file.downloadUrl);
      setEnabled((current) => ({ ...current, imageUrl: true }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "이미지 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
      if (imageRef.current) imageRef.current.value = "";
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedCount === 0 || busy) return;
    const changes: Record<string, unknown> = {};
    if (enabled.isVisible) changes.isVisible = isVisible;
    if (enabled.isSoldOut) changes.isSoldOut = isSoldOut;
    if (enabled.categoryId) changes.categoryId = categoryId;
    if (enabled.shippingPolicyId) changes.shippingPolicyId = shippingPolicyId || null;
    if (enabled.courier) changes.courier = courier.trim() || null;
    if (enabled.supplierName) changes.supplierName = supplierName || null;
    if (enabled.season) changes.season = { isAlwaysOnSale: alwaysOnSale, saleStartMonth: alwaysOnSale ? null : startMonth, saleEndMonth: alwaysOnSale ? null : endMonth };
    if (enabled.imageUrl) changes.imageUrl = imageUrl.trim() || null;
    if (enabled.notes) changes.notes = notes.trim() || null;
    if (enabled.packaging) changes.packaging = packaging.trim() || null;
    if (!window.confirm(`선택한 ${ids.length.toLocaleString("ko-KR")}개 상품의 ${selectedCount}개 항목을 변경할까요?`)) return;
    setBusy(true);
    try {
      // 서버 시간 제한을 넘지 않도록 100개씩 나눠 저장합니다.
      for (let index = 0; index < ids.length; index += 100) {
        await readData(await apiFetch("/catalog/admin/products/bulk-update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: ids.slice(index, index + 100), changes }) }));
      }
      toast.success(`${ids.length.toLocaleString("ko-KR")}개 상품을 일괄 변경했습니다.`);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "일괄 변경에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const row = (field: BulkField, label: string, control: React.ReactNode) => (
    <div className={`bulk-edit-row ${enabled[field] ? "on" : ""}`}>
      <label className="bulk-edit-check"><input type="checkbox" checked={enabled[field]} onChange={() => toggle(field)} /> {label}</label>
      <fieldset disabled={!enabled[field]}>{control}</fieldset>
    </div>
  );
  const months = Array.from({ length: 12 }, (_, index) => index + 1);
  // 달력 버튼: 처음 누른 달 = 시작, 다음에 누른 달 = 끝(10월 → 2월처럼 해를 넘겨도 됨)
  const pickMonth = (month: number) => {
    if (!pickingEnd) {
      setStartMonth(month);
      setEndMonth(month);
      setPickingEnd(true);
    } else {
      setEndMonth(month);
      setPickingEnd(false);
    }
  };
  const inRange = (month: number) => startMonth <= endMonth ? month >= startMonth && month <= endMonth : month >= startMonth || month <= endMonth;
  const rangeLength = startMonth <= endMonth ? endMonth - startMonth + 1 : 12 - startMonth + 1 + endMonth;
  const seasonControl = (
    <div className="bulk-season-picker">
      <label className="bulk-edit-inline"><input type="checkbox" checked={alwaysOnSale} onChange={(event) => setAlwaysOnSale(event.target.checked)} /> 연중 판매(제철 없음)</label>
      <div className={`bulk-month-grid ${alwaysOnSale ? "disabled" : ""}`} role="group" aria-label="제철 월 선택">
        {months.map((month) => <button type="button" key={month} disabled={alwaysOnSale} className={`${inRange(month) ? "in" : ""} ${month === startMonth ? "start" : ""} ${month === endMonth ? "end" : ""}`} onClick={() => pickMonth(month)} aria-pressed={inRange(month)}>{month}월</button>)}
      </div>
      <p className="bulk-season-summary">{alwaysOnSale ? "연중 판매로 표시됩니다." : <><b>{startMonth}월 ~ {endMonth}월</b> ({rangeLength}개월) · {pickingEnd ? "끝나는 달을 눌러 주세요." : "시작 달부터 다시 누르면 새로 고릅니다."}</>}</p>
      {nonSeasonalCount > 0 && <small className="bulk-season-warning">선택한 상품 중 {nonSeasonalCount}개는 제철 적용 카테고리(농산·수산·축산·선물세트·식품)가 아니어서 판매기간이 바뀌지 않습니다.</small>}
    </div>
  );

  return (
    <div className="editor-overlay" role="presentation">
      <form className="editor-panel bulk-edit-panel" onSubmit={submit}>
        <div className="editor-header"><div><span>BULK EDIT</span><h2>상품 일괄 변경</h2><p className="bulk-edit-sub">선택한 상품 {ids.length.toLocaleString("ko-KR")}개 · 체크한 항목만 바뀝니다.</p></div><button type="button" onClick={onClose} aria-label="닫기"><X size={20} /></button></div>
        <div className="bulk-edit-body">
          {row("season", "제철 월(판매기간)", seasonControl)}
          {row("notes", "상품 안내", <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="공개 단가표 '상품 안내'에 보이는 문구 (비우면 삭제)" />)}
          {row("packaging", "포장 안내", <input value={packaging} onChange={(event) => setPackaging(event.target.value)} placeholder="예: 전용박스, 선물박스 + 외피박스 (비우면 삭제)" />)}
          {row("imageUrl", "상품 이미지", <div className="bulk-edit-image"><input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://... 또는 업로드 (비우면 이미지 삭제)" /><button type="button" onClick={() => imageRef.current?.click()} disabled={uploading}><Upload size={14} /> {uploading ? "업로드 중…" : "JPEG/PNG 업로드"}</button><input ref={imageRef} type="file" accept="image/jpeg,image/png" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />{imageUrl && <img src={imageUrl} alt="일괄 변경 이미지 미리보기" />}</div>)}
          {row("isVisible", "노출설정", <div className="bulk-edit-choices"><label><input type="radio" checked={isVisible} onChange={() => setIsVisible(true)} /> 노출</label><label><input type="radio" checked={!isVisible} onChange={() => setIsVisible(false)} /> 미노출</label></div>)}
          {row("isSoldOut", "품절여부", <div className="bulk-edit-choices"><label><input type="radio" checked={!isSoldOut} onChange={() => setIsSoldOut(false)} /> 판매중</label><label><input type="radio" checked={isSoldOut} onChange={() => setIsSoldOut(true)} /> 품절</label></div>)}
          {row("categoryId", "카테고리", <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.shippingType === "overseas" ? "[해외] " : ""}{category.name}</option>)}</select>)}
          {row("shippingPolicyId", "배송정책", <select value={shippingPolicyId} onChange={(event) => setShippingPolicyId(event.target.value)}><option value="">정책 연결 해제(직접 입력)</option>{shippingPolicies.map((policy) => <option key={policy.id} value={policy.id}>{policy.shippingType === "overseas" ? "[해외] " : ""}{policy.name}</option>)}</select>)}
          {row("courier", "택배사", <input value={courier} onChange={(event) => setCourier(event.target.value)} placeholder="비우면 택배사 삭제" />)}
          {row("supplierName", "매입처", <select value={supplierName} onChange={(event) => setSupplierName(event.target.value)}><option value="">미지정</option>{suppliers.filter((supplier) => supplier.isActive).map((supplier) => <option key={supplier.id} value={supplier.name}>{supplier.name}</option>)}</select>)}
        </div>
        <div className="editor-footer"><button type="button" onClick={onClose}>취소</button><button className="primary-action" type="submit" disabled={busy || selectedCount === 0}><Save size={16} /> {busy ? "변경 중…" : selectedCount === 0 ? "변경할 항목을 체크하세요" : `${selectedCount}개 항목 변경하기`}</button></div>
      </form>
    </div>
  );
}

async function readData<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({ ok: false }))) as { ok: boolean; data: T; error?: { message?: string } };
  // 서버가 알려 준 실패 이유(예: 어떤 입력값이 잘못됐는지)를 그대로 보여 줍니다.
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "데이터 처리에 실패했습니다.");
  return payload.data;
}

function formatPrice(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatDateTime(value: string) {
  const normalized = value.length === 10
    ? `${value}T00:00:00+09:00`
    : value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}.${part("month")}.${part("day")} (${part("weekday")}) ${part("hour")}:${part("minute")}`;
}

function priceFieldLabel(field: "costPrice" | "aPrice" | "generalPrice" | "salePrice") {
  return field === "costPrice" ? "원가" : field === "aPrice" ? "A단가" : field === "generalPrice" ? "일반공급가" : "지정 판매가";
}

function marginRate(aPrice: number | undefined, costPrice: number | undefined) {
  if (!aPrice || aPrice <= 0 || !costPrice || costPrice < 0) return null;
  return Math.max(0, ((aPrice - costPrice) / aPrice) * 100);
}

function effectiveAPrice(aPrice: number | null | undefined, generalPrice: number) {
  return typeof aPrice === "number" && aPrice > 0 ? aPrice : generalPrice;
}

function lowestProductAPrice(product: Product) {
  if (product.options.length === 0) return effectiveAPrice(product.aPrice, product.generalPrice);
  return Math.min(...product.options.map((option) => effectiveAPrice(option.aPrice, option.generalPrice)));
}

function lowestProductGeneralPrice(product: Product) {
  if (product.options.length === 0) return product.generalPrice;
  return Math.min(...product.options.map((option) => option.generalPrice));
}

function buildPageNumbers(total: number, current: number) {
  const visible = new Set<number>([1, total]);
  for (let value = Math.max(1, current - 2); value <= Math.min(total, current + 2); value += 1) visible.add(value);
  const sorted = Array.from(visible).sort((first, second) => first - second);
  const result: Array<number | "ellipsis"> = [];
  sorted.forEach((value, index) => {
    if (index > 0 && sorted[index - 1] !== value - 1) result.push("ellipsis");
    result.push(value);
  });
  return result;
}

function formatSeoulOperationTime(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(value);
}

function DoogoLogo({ light = false }: { light?: boolean }) {
  return <img data-image-slot={light ? "brand.doogo-food.logo-white" : "brand.doogo-food.logo-color"} className={`doogo-logo ${light ? "light" : ""}`} src={light ? "/assets/brand/doogo-food-logo-white.png" : "/assets/brand/doogo-food-logo-color.png"} alt="두고푸드" width="156" height="52" />;
}

export function AdminLoginPage() {
  const navigate = useNavigate();
  const { data: session, isPending, refetch: refetchSession } = authClient.useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  if (isPending) return <div className="admin-loading"><div className="spinner" /><span>보안 세션 확인 중…</span></div>;
  if (session?.user && !redirecting) return <Navigate to="/admin/home" replace />;
  if (redirecting) return <div className="admin-loading"><div className="spinner" /><span>대시보드로 이동 중…</span></div>;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await authClient.signIn.username({ username, password });
      if (result.error) throw new Error(result.error.message || "아이디 또는 비밀번호를 확인해 주세요.");

      // Mark the handoff before refetching. The session atom updates during
      // this await, so the reverse guard must not start a second navigation
      // while this submit handler is completing the protected-route handoff.
      setRedirecting(true);

      // On slower mobile browsers the bearer token can be persisted before
      // Better Auth's session store publishes its new value. Refresh the
      // session before routing so AdminGuard does not briefly see a guest and
      // bounce the successful login back to /admin.
      await refetchSession();
      const refreshed = await authClient.getSession();
      if (!refreshed.data?.user) {
        throw new Error("로그인 세션을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }

      toast.success("마스터 관리자로 로그인했습니다.");
      navigate("/admin/home", { replace: true });
    } catch (error) {
      setRedirecting(false);
      toast.error(error instanceof Error ? error.message : "로그인에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="admin-login-page">
      <section className="login-brand-panel">
        <Link to="/" className="public-brand"><DoogoLogo /></Link>
        <div><span className="login-kicker">MASTER CONSOLE</span><h1>상품과 가격 변동을<br /><mark className="hero-highlight">한 곳에서</mark> 관리하세요.</h1><p>상품 등록부터 카테고리, 공지, 소싱 요청과 가격 이력까지 연결된 운영 공간입니다.</p></div>
        <div className="login-brand-footer">
          <small>© 2026 DOOGO FOOD</small>
          <div className="login-landing-actions">
            <button type="button" onClick={() => { if (window.history.length > 1) navigate(-1); else navigate("/"); }}>← 뒤로가기</button>
            <Link to="/">공개 상품 DB로 돌아가기</Link>
          </div>
        </div>
      </section>
      <section className="login-form-panel">
        <form onSubmit={submit} className="login-card">
          <span className="login-icon"><ShieldCheck size={24} /></span>
          <h2>마스터 관리자</h2>
          <p>관리자 계정으로 로그인해 주세요.</p>
          <label htmlFor="admin-username">아이디<input id="admin-username" name="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label>
          <label htmlFor="admin-password">비밀번호<input id="admin-password" name="password" value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required /></label>
          <button type="submit" disabled={submitting}>{submitting ? "확인 중…" : "로그인"}</button>
        </form>
      </section>
    </main>
  );
}

const adminNav: Array<{ section: AdminSection; label: string; icon: typeof Boxes; group?: "product" | "transfer" | "openapi" }> = [
  { section: "home", label: "홈", icon: LayoutDashboard },
  { section: "products", label: "상품 리스트", icon: Boxes, group: "product" },
  { section: "sort", label: "상품 진열순서 설정", icon: ArrowDown, group: "product" },
  { section: "categories", label: "상품 카테고리", icon: Tags, group: "product" },
  { section: "shippingPolicies", label: "배송 정책", icon: Truck, group: "product" },
  { section: "suppliers", label: "공급처", icon: Store, group: "product" },
  { section: "changes", label: "상품 변경전", icon: ClipboardList, group: "transfer" },
  { section: "transmissions", label: "상품 변경완료", icon: Send, group: "transfer" },
  { section: "sales", label: "통계", icon: CalendarDays },
  { section: "notices", label: "공지·필독", icon: Bell },
  { section: "history", label: "가격변동 이력", icon: History },
  { section: "sourcing", label: "입점·소싱 요청", icon: ClipboardList },
  { section: "sync", label: "발주오라 연동", icon: TrendingUp, group: "openapi" }
];

const blankProduct = {
  id: "",
  productCode: "",
  name: "",
  imageUrl: "",
  origin: "국내산",
  supplierName: "",
  costPrice: 0,
  aPrice: 0,
  generalPrice: 0,
  salePrice: null as number | null,
  salePriceMode: "autonomous" as "autonomous" | "fixed",
  saleStartMonth: null as number | null,
  saleEndMonth: null as number | null,
  isAlwaysOnSale: false,
  shippingFee: "무료",
  releaseInfo: "",
  notes: "",
  optionsInfo: "",
  packaging: "",
  courier: "",
  shippingPolicyId: null as string | null,
  shippingType: "domestic" as ShippingType,
  categoryId: "",
  isVisible: true,
  isSoldOut: false,
  options: [] as ProductOptionDraft[]
};

type ProductDraft = typeof blankProduct;

const seasonalCategoryNames = new Set(["농산", "수산", "축산", "선물세트", "식품"]);

function plainCategoryName(name: string) {
  return name.replace(/^[^\p{L}\p{N}[]+\s*/u, "").trim();
}

function isHealthCategory(category?: Category) {
  return Boolean(category && plainCategoryName(category.name).includes("건강식품"));
}

function isSeasonalCategory(category?: Category) {
  return Boolean(category && seasonalCategoryNames.has(plainCategoryName(category.name)));
}

export function CatalogAdmin({ section }: { section: AdminSection }) {
  const navigate = useNavigate();
  const cachedData = adminDataCache.get(section);
  const [data, setData] = useState<AdminCatalogData>(cachedData ?? emptyData);
  const [homeData, setHomeData] = useState<AdminHomeData | null>(section === "home" ? adminHomeCache : null);
  const [loading, setLoading] = useState(() => section === "home" ? !adminHomeCache : !cachedData);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [operations, setOperations] = useState<OperationsOverview | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [openNavGroups, setOpenNavGroups] = useState<Record<"product" | "transfer" | "openapi", boolean>>({
    product: true,
    transfer: true,
    openapi: true
  });

  // Keep the page underneath the drawer from moving while the mobile menu is
  // open. The drawer itself remains the scroll container so every menu item
  // stays reachable on shorter mobile screens.
  useEffect(() => {
    if (!sidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sidebarOpen]);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    // Bundles load only their group payload on demand. Fetching the complete
    // 2,347-product catalog here made the bundle list wait for data it never
    // renders.
    const childOwnsData = new Set<AdminSection>(["bundles", "shippingPolicies", "suppliers", "sales", "changes", "transmissions", "sync"]);
    if (childOwnsData.has(section)) {
      if (!silent) setLoading(false);
      return;
    }
    try {
      const endpoint = section === "products"
        ? "/catalog/admin/products?preview=1"
        : section === "bundles" || section === "sort"
          ? "/catalog/admin/products"
          : section === "categories"
            ? "/catalog/admin/categories/summary"
        : section === "notices"
          ? "/catalog/admin/notices"
          : section === "home"
            ? "/catalog/admin/overview"
            : section === "history"
              ? "/catalog/admin/history"
              : section === "sourcing"
                ? "/catalog/admin/sourcing"
            : "/catalog/admin";
      const response = await apiFetch(endpoint);
      if (section === "home") {
        const nextHome = await readData<AdminHomeData>(response);
        adminHomeCache = nextHome;
        setHomeData(nextHome);
      } else {
        let next = await readData<AdminCatalogData | { categories: Category[] }>(response);
        if (section === "products" && "products" in next && next.products.length === 0 && next.catalogTotals?.productCount) {
          const fallbackResponse = await apiFetch("/catalog/admin", { silent: true });
          if (fallbackResponse.ok) {
            next = await readData<AdminCatalogData>(fallbackResponse);
          }
        }
        if (section === "categories") {
          const nextData = { ...data, categories: (next as { categories: Category[] }).categories };
          adminDataCache.set(section, nextData);
          setData(nextData);
        } else {
          const nextData = next as AdminCatalogData;
          adminDataCache.set(section, nextData);
          setData(nextData);
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "관리 데이터를 불러오지 못했습니다.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [section]);

  useEffect(() => {
    const nextCachedData = adminDataCache.get(section);
    const hasCachedHome = section === "home" && adminHomeCache !== null;
    if (section === "home") setHomeData(adminHomeCache);
    else setData(nextCachedData ?? emptyData);
    setLoading(section === "home" ? !hasCachedHome : !nextCachedData && section !== "bundles");
    void refresh(Boolean(hasCachedHome || nextCachedData || section === "bundles"));
  }, [refresh, section]);

  useEffect(() => {
    const current = adminNav.find((item) => item.section === section)?.group;
    if (current) setOpenNavGroups((state) => ({ ...state, [current]: true }));
  }, [section]);

  useEffect(() => {
    let active = true;
    const loadOperations = async () => {
      try {
        const response = await apiFetch("/catalog/operations", { auth: false, silent: true });
        if (!response.ok) return;
        const payload = (await response.json()) as { ok?: boolean; data?: OperationsOverview };
        if (active && payload.ok && payload.data) setOperations(payload.data);
      } catch {
        if (active) setOperations(null);
      }
    };
    void loadOperations();
    const operationsTimer = window.setInterval(() => void loadOperations(), 60 * 1000);
    const clockTimer = window.setInterval(() => setClock(new Date()), 1000);
    return () => {
      active = false;
      window.clearInterval(operationsTimer);
      window.clearInterval(clockTimer);
    };
  }, []);

  const signOut = async () => {
    await authClient.signOut();
    clearAuthToken();
    navigate("/admin", { replace: true });
  };

  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="admin-brand"><Link to="/admin/home" aria-label="관리자 홈으로 이동"><DoogoLogo /></Link><button onClick={() => setSidebarOpen(false)} aria-label="메뉴 닫기"><X size={20} /></button></div>
        <div className="admin-role"><ShieldCheck size={17} /><span><small>MASTER</small><strong>마스터 관리자</strong></span></div>
        <Link to="/admin/products" className="admin-sidebar-primary" onClick={() => setSidebarOpen(false)}><Plus size={16} /> 상품 등록</Link>
        <nav>
          {adminNav.map((item, index) => {
            const Icon = item.icon;
            const previousGroup = adminNav[index - 1]?.group;
            const groupCaption = item.group && item.group !== previousGroup
              ? <button
                type="button"
                className={`nav-caption nav-group-caption ${openNavGroups[item.group] ? "open" : ""}`}
                onClick={() => setOpenNavGroups((state) => ({ ...state, [item.group!]: !state[item.group!] }))}
                aria-expanded={openNavGroups[item.group]}
              >
                <span>{item.group === "product" ? "상품 관리" : item.group === "transfer" ? "상품 전송 현황" : "OPEN API"}</span>
                <ChevronDown size={14} />
              </button>
              : null;
            const groupOpen = !item.group || openNavGroups[item.group];
            return <Fragment key={item.section}>{groupCaption}{groupOpen && <Link to={`/admin/${item.section}`} className={`${section === item.section ? "active" : ""} ${item.group ? "nav-child" : ""}`} onClick={() => setSidebarOpen(false)}><Icon size={18} />{item.label}<ChevronRight size={15} /></Link>}</Fragment>;
          })}
        </nav>
        <div className="sidebar-bottom"><Link to="/" onClick={() => setSidebarOpen(false)}><Truck size={17} /> 공개 페이지 보기</Link><button onClick={() => void signOut()}><LogOut size={17} /> 로그아웃</button></div>
      </aside>
      {sidebarOpen && <button className="admin-sidebar-backdrop" type="button" onClick={() => setSidebarOpen(false)} aria-label="관리자 메뉴 닫기" />}
      <main className="admin-main">
        <header className="admin-topbar"><button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="메뉴 열기"><Menu size={21} /></button><div><strong>{adminNav.find((item) => item.section === section)?.label}</strong><span>DOOGO FOOD 상품 정보 운영</span></div><div className="admin-topbar-tools"><button type="button" className="today-chip" onClick={() => setOperationsOpen(true)}><CalendarDays size={14} /> 오늘 운영</button><span className="admin-chip"><ShieldCheck size={15} /> 마스터 관리자</span></div></header>
        <div className="admin-content">
          {loading ? <div className="admin-loading inline"><div className="spinner" /><span>데이터 불러오는 중…</span></div> : (
            <>
              {section === "home" && <AdminHome data={homeData} />}
              {section === "products" && <ProductsAdmin data={data} refresh={refresh} updateData={setData} />}
              {section === "bundles" && <BundlesAdmin data={data} />}
              {section === "sort" && <ProductsAdmin data={data} refresh={refresh} updateData={setData} sortOnly />}
              {section === "changes" && <ChangeQueueAdmin mode="changes" />}
              {section === "transmissions" && <ChangeQueueAdmin mode="transmissions" />}
              {section === "categories" && <CategoriesAdmin data={data} refresh={refresh} />}
              {section === "shippingPolicies" && <ShippingPoliciesAdmin />}
              {section === "suppliers" && <SuppliersAdmin />}
              {section === "sales" && <SalesAdmin />}
              {section === "notices" && <NoticesAdmin data={data} refresh={refresh} />}
              {section === "history" && <HistoryAdmin data={data} />}
              {section === "sourcing" && <SourcingAdmin data={data} refresh={refresh} />}
              {section === "sync" && <CatalogSyncAdmin />}
            </>
          )}
        </div>
      </main>
      {operationsOpen && (
        <div className="editor-overlay operation-overlay" role="presentation" onMouseDown={() => setOperationsOpen(false)}>
          <section className="operation-detail-modal" role="dialog" aria-modal="true" aria-labelledby="operation-detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="editor-header">
              <div><span>DAILY OPERATION</span><h2 id="operation-detail-title">오늘 운영 현황</h2></div>
              <button type="button" onClick={() => setOperationsOpen(false)} aria-label="오늘 운영 팝업 닫기"><X size={21} /></button>
            </div>
            <p className="operation-current-time"><CalendarDays size={17} /> {formatSeoulOperationTime(clock)}</p>
            <div className="operation-detail-grid">
              <article className={operations?.operation.isClosed ? "closed" : "open"}>
                <span>두고푸드 선과장</span>
                <strong>{operations?.operation.status ?? "운영정보 확인 중"}</strong>
                <small>{operations?.operation.reason ?? "대한민국 공휴일 여부를 확인하고 있습니다."}</small>
              </article>
              <article>
                <span>이번 달 신규 상품</span>
                <strong>{operations?.monthlyStats.newProducts ?? 0}<small>개</small></strong>
                <small>현재 월에 추가된 상품</small>
              </article>
              <article>
                <span>이번 달 품절 전환 (시즌완료)</span>
                <strong>{operations?.monthlyStats.soldOutChanges ?? 0}<small>개</small></strong>
                <small>현재 월에 품절 처리된 상품·옵션</small>
              </article>
            </div>
            <button className="operation-modal-close" type="button" onClick={() => setOperationsOpen(false)}>확인</button>
          </section>
        </div>
      )}
    </div>
  );
}

function AdminHome({ data }: { data: AdminHomeData | null }) {
  if (!data) {
    return <div className="admin-loading inline"><div className="spinner" /><span>운영 요약을 불러오는 중…</span></div>;
  }
  const { overview, sync, sales } = data;
  const salesConnected = sales.sourceConnected;
  return (
    <>
      <div className="admin-page-heading admin-home-heading">
        <div>
          <span>DOOGO FOOD DATA CENTER</span>
          <h1>운영 홈</h1>
          <p>상품, 가격, 소싱 요청과 발주오라 연결 상태를 한눈에 확인합니다.</p>
        </div>
      </div>
      <section className="admin-home-hero">
        <div>
          <span className="section-kicker">TODAY AT DOOGO FOOD</span>
          <h2>데이터센터가 오늘도 준비되어 있습니다.</h2>
          <p>실제 DB에 저장된 상품과 요청만 집계해 보여드립니다.</p>
        </div>
        <div className="admin-home-live"><span className="live-dot" /> 실시간 DB 요약</div>
      </section>
      <div className="admin-home-stat-grid">
        <Link className="admin-home-stat featured" to="/admin/products"><span>전체 상품</span><strong>{overview.productCount.toLocaleString("ko-KR")}</strong><small>노출 {overview.visibleProductCount.toLocaleString("ko-KR")}개</small></Link>
        <Link className="admin-home-stat" to="/admin/products"><span>공급중 상품</span><strong>{Math.max(0, overview.visibleProductCount - overview.soldOutProductCount).toLocaleString("ko-KR")}</strong><small>현재 공개 공급 상품</small></Link>
        <Link className="admin-home-stat" to="/admin/products"><span>품절 상품</span><strong>{overview.soldOutProductCount.toLocaleString("ko-KR")}</strong><small>관리자에서 품절 처리한 상품</small></Link>
        <Link className="admin-home-stat" to="/admin/history"><span>가격변동 로그</span><strong>{overview.priceHistoryCount.toLocaleString("ko-KR")}</strong><small>전체 누적 이력</small></Link>
      </div>
      <div className="admin-home-grid">
        <section className="admin-card admin-home-panel">
          <div className="card-heading"><ClipboardList size={19} /><div><h2>입점·소싱 요청</h2><p>새로 들어온 소싱 요청과 입점 신청 처리 현황입니다.</p></div><Link to="/admin/sourcing">전체 보기 <ChevronRight size={14} /></Link></div>
          <div className="admin-home-request-stats">
            <Link to="/admin/sourcing?status=received"><span>접수</span><strong>{overview.sourcingCounts.received}</strong></Link>
            <Link to="/admin/sourcing?status=reviewing"><span>검토중</span><strong>{overview.sourcingCounts.reviewing}</strong></Link>
            <Link to="/admin/sourcing?status=completed"><span>완료</span><strong>{overview.sourcingCounts.completed}</strong></Link>
          </div>
        </section>
        <section className="admin-card admin-home-panel">
          <div className="card-heading"><TrendingUp size={19} /><div><h2>발주오라 연동</h2><p>실제 인증 상태만 표시합니다.</p></div><Link to="/admin/sync">상세 보기 <ChevronRight size={14} /></Link></div>
          <div className="admin-home-connection"><span className={`connection-dot ${sync.writeIntegration.status === "connected" ? "connected" : ""}`} /><strong>{sync.writeIntegration.account ? `${sync.writeIntegration.account} 계정 연결` : "연결된 계정 없음"}</strong><small>{sync.writeIntegration.status === "connected" ? "실시간 연동중" : "추가 인증 필요"}</small></div>
          <div className="admin-home-connection-meta"><span>연결 상품</span><b>{sync.linkedProducts.toLocaleString("ko-KR")}개</b><span>전송 대기</span><b>{sync.outbox.blocked.toLocaleString("ko-KR")}개</b></div>
        </section>
        <section className="admin-card admin-home-panel">
          <div className="card-heading"><WalletCards size={19} /><div><h2>매출 현황</h2><p>{salesConnected ? "발주오라 주문 원본 기준" : "주문 원본 연결 상태"}</p></div><Link to="/admin/sales">상세 보기 <ChevronRight size={14} /></Link></div>
          {salesConnected ? <div className="admin-home-sales"><strong>{sales.totals.revenue.toLocaleString("ko-KR")}원</strong><span>이번 달 매출</span><small>순이익 {sales.totals.profit.toLocaleString("ko-KR")}원 · 주문 {sales.totals.orderCount.toLocaleString("ko-KR")}건</small></div> : <div className="admin-home-unavailable"><Info size={18} /><span>발주오라 주문 원본이 연결되면 매출·순이익이 표시됩니다.</span></div>}
        </section>
        <section className="admin-card admin-home-panel admin-home-notice-panel">
          <div className="card-heading"><Bell size={19} /><div><h2>최근 공지</h2><p>공개 공지사항에 표시되는 내용입니다.</p></div><Link to="/admin/notices">관리 <ChevronRight size={14} /></Link></div>
          <div className="admin-home-notices">{overview.recentNotices.length > 0 ? overview.recentNotices.map((notice) => <Link key={notice.id} to="/admin/notices"><span>{notice.isPinned ? "필독" : "공지"}</span><strong>{notice.title}</strong><small>{notice.updatedAt.slice(0, 10)}</small></Link>) : <div className="admin-home-unavailable"><Info size={18} /><span>등록된 공지가 없습니다.</span></div>}</div>
        </section>
      </div>
    </>
  );
}

function ProductsAdmin({ data, refresh, updateData, sortOnly = false }: { data: AdminCatalogData; refresh: (silent?: boolean) => Promise<void>; updateData: Dispatch<SetStateAction<AdminCatalogData>>; sortOnly?: boolean }) {
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("all");
  const [shippingFilter, setShippingFilter] = useState<"all" | ShippingType>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "visible" | "soldout">("all");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(() => new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState<false | "all" | "seasonInfo">(false);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProductDraft | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [sortItems, setSortItems] = useState<Product[]>([]);
  const [sortOriginalOrder, setSortOriginalOrder] = useState<Record<string, number>>({});
  const [sortPositionValues, setSortPositionValues] = useState<number[]>([]);
  const [sortQuery, setSortQuery] = useState("");
  const [sortCategory, setSortCategory] = useState("all");
  const [sortPageSize, setSortPageSize] = useState(10);
  const [sortPage, setSortPage] = useState(1);
  const [sortSaving, setSortSaving] = useState(false);
  const [draggedSortProductId, setDraggedSortProductId] = useState<string | null>(null);
  const sortDragRef = useRef<string | null>(null);
  const [dragOverSortProductId, setDragOverSortProductId] = useState<string | null>(null);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkPreview, setBulkPreview] = useState<BulkWorkbookPreview | null>(null);
  const [excelBusy, setExcelBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shippingPolicies, setShippingPolicies] = useState<ShippingPolicy[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [hydrating, setHydrating] = useState(false);
  useEffect(() => {
    void apiFetch("/catalog/admin/shipping-policies", { silent: true }).then(async (response) => {
      if (!response.ok) return;
      const payload = await readData<{ policies: ShippingPolicy[] }>(response);
      setShippingPolicies(payload.policies);
    }).catch(() => undefined);
    void apiFetch("/catalog/admin/suppliers", { silent: true }).then(async (response) => {
      if (!response.ok) return;
      const payload = await readData<{ suppliers: Supplier[] }>(response);
      setSuppliers(payload.suppliers);
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!data.isPartial || hydrating) return;
    setHydrating(true);
    void apiFetch("/catalog/admin/products", { silent: true })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await readData<AdminCatalogData>(response);
        updateData(payload);
        adminDataCache.set("products", payload);
      })
      .catch(() => undefined)
      .finally(() => setHydrating(false));
  }, [data.isPartial, hydrating, updateData]);
  const products = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return data.products.filter((product) => {
      const category = data.categories.find((item) => item.id === product.categoryId);
      const matchesQuery = !normalized || `${product.name} ${product.productCode || ""}`.toLowerCase().includes(normalized);
      const matchesShipping = shippingFilter === "all" || product.shippingType === shippingFilter;
      const matchesCategory = categoryFilter === "all" || product.categoryId === categoryFilter;
      const matchesMonth = month === "all" || !isSeasonalCategory(category) || product.isAlwaysOnSale || (product.saleStartMonth !== null && product.saleEndMonth !== null && (product.saleStartMonth <= product.saleEndMonth ? Number(month) >= product.saleStartMonth && Number(month) <= product.saleEndMonth : Number(month) >= product.saleStartMonth || Number(month) <= product.saleEndMonth));
      const matchesStatus = statusFilter === "all"
        || (statusFilter === "visible" && product.isVisible)
        || (statusFilter === "soldout" && (product.isSoldOut || product.options?.some((option) => option.isSoldOut)));
      return matchesQuery && matchesShipping && matchesCategory && matchesMonth && matchesStatus;
    });
  }, [categoryFilter, data.categories, data.products, month, query, shippingFilter, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(products.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedProducts = products.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const productOrderMap = useMemo(() => {
    const ordered = [...data.products].sort((first, second) => {
      const firstOrder = first.displayOrder ?? Number.MAX_SAFE_INTEGER;
      const secondOrder = second.displayOrder ?? Number.MAX_SAFE_INTEGER;
      return firstOrder - secondOrder || first.name.localeCompare(second.name);
    });
    return new Map(ordered.map((product, index) => [product.id, index + 1]));
  }, [data.products]);
  const currentPageProductIds = useMemo(() => pagedProducts.map((product) => product.id), [pagedProducts]);
  const selectedOnCurrentPage = currentPageProductIds.filter((id) => selectedProductIds.has(id)).length;
  const allCurrentPageSelected = currentPageProductIds.length > 0 && selectedOnCurrentPage === currentPageProductIds.length;
  const pageNumbers = buildPageNumbers(pageCount, currentPage).filter((value): value is number => value !== "ellipsis");
  useEffect(() => {
    setPage(1);
  }, [query, month, shippingFilter, categoryFilter, statusFilter, pageSize]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  const visibleCategories = data.categories.filter((category) => shippingFilter === "all" || category.shippingType === shippingFilter);
  const showProductStatus = (status: "all" | "visible" | "soldout") => {
    setQuery("");
    setMonth("all");
    setShippingFilter("all");
    setCategoryFilter("all");
    setStatusFilter(status);
    window.requestAnimationFrame(() => document.getElementById("admin-product-list")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };
  // 검색·필터 결과 전체 선택/해제(페이지와 관계없이). 예: "곶감" 검색 → 13개 한 번에 선택
  const filteredProductIds = useMemo(() => products.map((product) => product.id), [products]);
  const allFilteredSelected = filteredProductIds.length > 0 && filteredProductIds.every((id) => selectedProductIds.has(id));
  const toggleAllFiltered = () => {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (allFilteredSelected) filteredProductIds.forEach((id) => next.delete(id));
      else filteredProductIds.forEach((id) => next.add(id));
      return next;
    });
  };
  const [quickBusy, setQuickBusy] = useState(false);
  // 선택 바의 빠른 변경(품절/판매중/노출/숨김): 확인 한 번으로 바로 적용
  const quickBulkUpdate = async (changes: { isSoldOut?: boolean; isVisible?: boolean }, label: string) => {
    const ids = Array.from(selectedProductIds);
    if (ids.length === 0 || quickBusy) return;
    if (!window.confirm(`선택한 ${ids.length.toLocaleString("ko-KR")}개 상품을 '${label}'(으)로 변경할까요?`)) return;
    setQuickBusy(true);
    try {
      for (let index = 0; index < ids.length; index += 100) {
        await readData(await apiFetch("/catalog/admin/products/bulk-update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: ids.slice(index, index + 100), changes }) }));
      }
      toast.success(`${ids.length.toLocaleString("ko-KR")}개 상품을 '${label}'(으)로 변경했습니다.`);
      setSelectedProductIds(new Set());
      void refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "일괄 변경에 실패했습니다.");
    } finally {
      setQuickBusy(false);
    }
  };
  const toggleCurrentPageSelection = () => {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (allCurrentPageSelected) {
        currentPageProductIds.forEach((id) => next.delete(id));
      } else {
        currentPageProductIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };
  const sortFilteredProducts = useMemo(() => {
    const normalized = sortQuery.trim().toLowerCase();
    return sortItems.filter((product) => (
      (sortCategory === "all" || product.categoryId === sortCategory)
      && (!normalized || `${product.name} ${product.productCode || ""}`.toLowerCase().includes(normalized))
    ));
  }, [sortCategory, sortItems, sortQuery]);
  const sortPageCount = Math.max(1, Math.ceil(sortFilteredProducts.length / sortPageSize));
  const sortCurrentPage = Math.min(sortPage, sortPageCount);
  const sortPagedProducts = sortFilteredProducts.slice((sortCurrentPage - 1) * sortPageSize, sortCurrentPage * sortPageSize);
  const sortPageNumbers = Array.from({ length: sortPageCount }, (_, index) => index + 1)
    .filter((value) => value === 1 || value === sortPageCount || Math.abs(value - sortCurrentPage) <= 2);

  useEffect(() => {
    setSortPage(1);
  }, [sortCategory, sortPageSize, sortQuery]);

  const openSortManager = () => {
    const ordered = [...data.products].sort((first, second) => {
      const firstOrder = first.displayOrder ?? Number.MAX_SAFE_INTEGER;
      const secondOrder = second.displayOrder ?? Number.MAX_SAFE_INTEGER;
      return firstOrder - secondOrder;
    });
    const positionValues = ordered.map((product, index) => product.displayOrder ?? ((index + 1) * 10));
    setSortItems(ordered);
    setSortPositionValues(positionValues);
    setSortOriginalOrder(Object.fromEntries(ordered.map((product, index) => [product.id, positionValues[index]])));
    setSortQuery("");
    setSortCategory("all");
    setSortPageSize(10);
    setSortPage(1);
    setSortOpen(true);
  };

  // 진열순서 전용 화면: 처음 열 때와 저장 후 최신 상품 순서로 다시 불러옵니다.
  const [sortNeedsInit, setSortNeedsInit] = useState(sortOnly);
  useEffect(() => {
    if (!sortOnly || !sortNeedsInit || data.products.length === 0) return;
    openSortManager();
    setSortNeedsInit(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortOnly, sortNeedsInit, data.products]);

  const moveSortProduct = (productId: string, direction: "up" | "down" | "top") => {
    setSortItems((current) => {
      const sourceIndex = current.findIndex((product) => product.id === productId);
      if (sourceIndex < 0) return current;
      if (direction === "top") {
        if (sourceIndex === 0) return current;
        const next = [...current];
        const [selected] = next.splice(sourceIndex, 1);
        next.unshift(selected);
        return next;
      }
      const visibleIds = sortFilteredProducts.map((product) => product.id);
      const visibleIndex = visibleIds.indexOf(productId);
      const targetId = direction === "up" ? visibleIds[visibleIndex - 1] : visibleIds[visibleIndex + 1];
      if (!targetId) return current;
      const targetIndex = current.findIndex((product) => product.id === targetId);
      if (targetIndex < 0) return current;
      const next = [...current];
      [next[sourceIndex], next[targetIndex]] = [next[targetIndex], next[sourceIndex]];
      return next;
    });
    if (direction === "top") setSortPage(1);
  };

  const moveSortProductBefore = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    setSortItems((current) => {
      const sourceIndex = current.findIndex((product) => product.id === draggedId);
      const targetIndex = current.findIndex((product) => product.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      const [dragged] = next.splice(sourceIndex, 1);
      // 끌어다 놓은 상품이 대상 상품의 자리를 차지합니다(아래로 옮기면 대상 뒤, 위로 옮기면 대상 앞).
      next.splice(targetIndex, 0, dragged);
      return next;
    });
  };

  // 손잡이(⋮⋮)를 눌러 끄는 방식: 마우스·터치 모두 동작하도록 포인터 이벤트를 사용합니다(모바일은 HTML 드래그앤드롭 미지원).
  const findSortTargetId = (x: number, y: number) =>
    (document.elementFromPoint(x, y)?.closest("[data-sort-id]") as HTMLElement | null)?.dataset.sortId ?? null;

  const handleSortPointerDown = (event: ReactPointerEvent<HTMLElement>, productId: string) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    sortDragRef.current = productId;
    setDraggedSortProductId(productId);
    setDragOverSortProductId(null);
  };

  const handleSortPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const draggedId = sortDragRef.current;
    if (!draggedId) return;
    const targetId = findSortTargetId(event.clientX, event.clientY);
    setDragOverSortProductId(targetId && targetId !== draggedId ? targetId : null);
    const list = event.currentTarget.closest(".display-order-list");
    if (list && list.scrollHeight > list.clientHeight) {
      const rect = list.getBoundingClientRect();
      if (event.clientY < rect.top + 48) list.scrollTop -= 14;
      else if (event.clientY > rect.bottom - 48) list.scrollTop += 14;
    } else if (event.clientY < 120) {
      window.scrollBy(0, -14);
    } else if (event.clientY > window.innerHeight - 90) {
      window.scrollBy(0, 14);
    }
  };

  const handleSortPointerEnd = (event: ReactPointerEvent<HTMLElement>, cancelled = false) => {
    const draggedId = sortDragRef.current;
    sortDragRef.current = null;
    if (draggedId && !cancelled) {
      const targetId = findSortTargetId(event.clientX, event.clientY);
      if (targetId) moveSortProductBefore(draggedId, targetId);
    }
    setDraggedSortProductId(null);
    setDragOverSortProductId(null);
  };

  const saveDisplayOrder = async () => {
    const items = sortItems.map((product, index) => ({
      id: product.id,
      displayOrder: sortPositionValues[index] ?? ((index + 1) * 10)
    })).filter((item) => sortOriginalOrder[item.id] !== item.displayOrder);
    if (items.length === 0) {
      toast.info("변경된 노출순서가 없습니다.");
      return;
    }
    setSortSaving(true);
    try {
      const response = await apiFetch("/catalog/admin/products/display-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items })
      });
      if (!response.ok) return;
      toast.success(`${items.length}개 상품의 노출순서를 저장했습니다.`);
      setSortOpen(false);
      await refresh();
      if (sortOnly) setSortNeedsInit(true);
    } finally {
      setSortSaving(false);
    }
  };

  const startEdit = (product?: Product) => setEditing(product ? {
    id: product.id,
    productCode: product.productCode || "",
    name: product.name,
    imageUrl: product.imageUrl || "",
    origin: product.origin || "",
    supplierName: product.supplierName || "",
    costPrice: product.costPrice ?? 0,
    aPrice: product.aPrice,
    generalPrice: product.generalPrice,
    salePrice: product.salePrice ?? null,
    salePriceMode: product.salePriceMode ?? "autonomous",
    saleStartMonth: product.saleStartMonth ?? null,
    saleEndMonth: product.saleEndMonth ?? null,
    isAlwaysOnSale: product.isAlwaysOnSale ?? false,
    shippingFee: product.shippingFee,
    releaseInfo: product.releaseInfo || "",
    notes: product.notes || "",
    optionsInfo: product.optionsInfo || "",
    packaging: product.packaging || "",
    courier: product.courier || "",
    shippingPolicyId: product.shippingPolicyId ?? null,
    shippingType: product.shippingType,
    categoryId: product.categoryId,
    isVisible: product.isVisible,
    isSoldOut: product.isSoldOut,
    options: (product.options ?? []).map((option) => ({
      id: option.id,
      name: option.name,
      costPrice: option.costPrice ?? 0,
      aPrice: option.aPrice,
      generalPrice: option.generalPrice,
      salePrice: option.salePrice ?? null,
      salePriceMode: option.salePriceMode ?? product.salePriceMode ?? "autonomous",
      isSoldOut: option.isSoldOut,
      sortOrder: option.sortOrder
    }))
  } : { ...blankProduct, categoryId: data.categories[0]?.id || "" });

  const editingCategory = editing ? data.categories.find((category) => category.id === editing.categoryId) : undefined;
  const editingHealthProduct = isHealthCategory(editingCategory);
  const editingSeasonalProduct = isSeasonalCategory(editingCategory);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing || saving) return;
    const editingId = editing.id;
    setSaving(true);
    try {
      const response = await apiFetch(editingId ? `/catalog/admin/products/${editingId}` : "/catalog/admin/products", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing)
      });
      const payload = await readData<{ product: Product }>(response);
      updateData((current) => {
        const exists = current.products.some((product) => product.id === payload.product.id);
        const products = exists
          ? current.products.map((product) => product.id === payload.product.id ? payload.product : product)
          : [...current.products, payload.product];
        products.sort((first, second) => (first.displayOrder ?? Number.MAX_SAFE_INTEGER) - (second.displayOrder ?? Number.MAX_SAFE_INTEGER));
        return { ...current, products };
      });
      toast.success(editingId ? "상품과 가격 이력이 저장되었습니다." : "신규 상품이 등록되었습니다.");
      setEditing(null);
      void refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "상품을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const uploadProductImage = async (file: File) => {
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast.error("상품 이미지는 JPEG 또는 PNG만 업로드할 수 있습니다.");
      return;
    }
    if (file.size >= 5 * 1024 * 1024) {
      toast.error("상품 이미지는 5MB 미만만 업로드할 수 있습니다.");
      return;
    }
    setImageBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await apiFetch("/catalog/admin/products/image-upload", { method: "POST", body: form });
      const payload = await readData<{ file: { downloadUrl: string } }>(response);
      setEditing((current) => current ? { ...current, imageUrl: payload.file.downloadUrl } : current);
      toast.success("상품 이미지를 업로드했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "상품 이미지 업로드에 실패했습니다.");
    } finally {
      setImageBusy(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const remove = async (product: Product) => {
    if (!window.confirm(`'${product.name}' 상품을 삭제할까요?`)) return;
    const response = await apiFetch(`/catalog/admin/products/${product.id}`, { method: "DELETE" });
    if (!response.ok) return;
    toast.success("상품을 삭제했습니다.");
    await refresh();
  };

  const downloadWorkbook = async (mode: "list" | "bulk") => {
    setExcelBusy(true);
    try {
      const response = await apiFetch(`/catalog/admin/products/export?mode=${mode}`);
      if (!response.ok) return;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      anchor.href = url;
      anchor.download = mode === "bulk" ? `상품일괄변경_${today}.xlsx` : `상품리스트_${today}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(mode === "bulk" ? "일괄변경 양식을 다운로드했습니다." : "상품 리스트를 다운로드했습니다.");
    } finally {
      setExcelBusy(false);
    }
  };

  const downloadSelectedWorkbook = async () => {
    const ids = Array.from(selectedProductIds);
    if (ids.length === 0) {
      toast.info("엑셀로 받을 상품을 먼저 체크해 주세요.");
      return;
    }
    setExcelBusy(true);
    try {
      const response = await apiFetch("/catalog/admin/products/export-selected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids })
      });
      if (!response.ok) return;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      anchor.href = url;
      anchor.download = `선택상품리스트_${today}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(`체크한 ${ids.length.toLocaleString("ko-KR")}개 상품을 다운로드했습니다.`);
    } finally {
      setExcelBusy(false);
    }
  };

  const previewWorkbook = async (file: File) => {
    setExcelBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await apiFetch("/catalog/admin/products/import-preview", { method: "POST", body: form });
      const preview = await readData<BulkWorkbookPreview>(response);
      setBulkFile(file);
      setBulkPreview(preview);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "엑셀 파일을 확인하지 못했습니다.");
    } finally {
      setExcelBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const applyWorkbook = async () => {
    if (!bulkFile || !bulkPreview || bulkPreview.errors.length > 0) return;
    if (!window.confirm(`${bulkPreview.affectedProducts}개 상품의 ${bulkPreview.changes.length}개 항목을 변경할까요?`)) return;
    setExcelBusy(true);
    try {
      const form = new FormData();
      form.set("file", bulkFile);
      const response = await apiFetch("/catalog/admin/products/import-apply", { method: "POST", body: form });
      if (!response.ok) return;
      toast.success("엑셀 일괄변경을 적용하고 가격변동 이력을 기록했습니다.");
      setBulkFile(null);
      setBulkPreview(null);
      await refresh();
    } finally {
      setExcelBusy(false);
    }
  };

  // 노출순서 편집 본문: 상품 리스트의 팝업과 "상품 진열순서 설정" 전용 화면에서 함께 사용합니다.
  const sortEditorBody = (
    <>
  <div className="display-order-toolbar">
    <div className="search-field"><Search size={17} /><input value={sortQuery} onChange={(event) => setSortQuery(event.target.value)} placeholder="상품명·상품코드 검색" /></div>
    <select value={sortCategory} onChange={(event) => setSortCategory(event.target.value)} aria-label="노출순서 카테고리 필터"><option value="all">전체 카테고리</option>{data.categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select>
    <select value={sortPageSize} onChange={(event) => setSortPageSize(Number(event.target.value))} aria-label="노출순서 페이지당 상품 수"><option value={10}>10개씩 보기</option><option value={20}>20개씩 보기</option><option value={30}>30개씩 보기</option></select>
  </div>
  <div className="display-order-list">
    {sortPagedProducts.map((product) => {
      const globalIndex = sortItems.findIndex((item) => item.id === product.id);
      const visibleIndex = sortFilteredProducts.findIndex((item) => item.id === product.id);
      const category = data.categories.find((item) => item.id === product.categoryId);
      return (
        <article
          key={product.id}
          data-sort-id={product.id}
          className={`${draggedSortProductId === product.id ? "dragging" : ""}${dragOverSortProductId === product.id ? " drag-over" : ""}`.trim()}
        >
          <strong className="display-order-rank">{globalIndex + 1}</strong>
          {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span className="admin-image-placeholder"><Boxes size={19} /></span>}
          <div className="display-order-product"><strong>{product.name}</strong><small>{product.productCode || product.id} · {category?.name || "카테고리 미지정"}</small><small className="display-order-drag-hint">⋮⋮ 손잡이를 끌어 순서 변경</small></div>
          <div className="display-order-controls">
            <button
              type="button"
              className="display-order-handle"
              aria-label={`${product.name} 끌어서 순서 변경`}
              onPointerDown={(event) => handleSortPointerDown(event, product.id)}
              onPointerMove={handleSortPointerMove}
              onPointerUp={(event) => handleSortPointerEnd(event)}
              onPointerCancel={(event) => handleSortPointerEnd(event, true)}
            ><GripVertical size={18} /></button>
            <button type="button" onClick={() => moveSortProduct(product.id, "top")} disabled={globalIndex === 0}>맨 위</button>
            <button type="button" onClick={() => moveSortProduct(product.id, "up")} disabled={visibleIndex === 0} aria-label={`${product.name} 위로 이동`}><ArrowUp size={16} /></button>
            <button type="button" onClick={() => moveSortProduct(product.id, "down")} disabled={visibleIndex === sortFilteredProducts.length - 1} aria-label={`${product.name} 아래로 이동`}><ArrowDown size={16} /></button>
          </div>
        </article>
      );
    })}
    {sortPagedProducts.length === 0 && <div className="empty-state"><Search size={25} /><strong>조건에 맞는 상품이 없습니다.</strong></div>}
  </div>
  <div className="catalog-pagination admin-product-pagination display-order-pagination">
    <span>{sortFilteredProducts.length === 0 ? "0개" : `${(sortCurrentPage - 1) * sortPageSize + 1}–${Math.min(sortCurrentPage * sortPageSize, sortFilteredProducts.length)}개`} <small>/ 총 {sortFilteredProducts.length}개</small></span>
    <nav aria-label="노출순서 상품 페이지">
      <button type="button" onClick={() => setSortPage((value) => Math.max(1, value - 1))} disabled={sortCurrentPage === 1} aria-label="이전 페이지"><ChevronLeft size={15} /></button>
      {sortPageNumbers.map((value, index) => <Fragment key={value}>{index > 0 && sortPageNumbers[index - 1] !== value - 1 ? <span>…</span> : null}<button type="button" className={value === sortCurrentPage ? "active" : ""} onClick={() => setSortPage(value)}>{value}</button></Fragment>)}
      <button type="button" onClick={() => setSortPage((value) => Math.min(sortPageCount, value + 1))} disabled={sortCurrentPage === sortPageCount} aria-label="다음 페이지"><ChevronRight size={15} /></button>
    </nav>
  </div>
    </>
  );

  if (sortOnly) {
    return (
      <>
        <div className="admin-page-heading"><div><span>DISPLAY ORDER</span><h1>상품 진열순서 설정</h1><p>⋮⋮ 손잡이를 끌거나 맨 위·↑·↓ 버튼으로 순서를 바꾼 뒤 저장하세요. 전체 단가표와 각 카테고리에 같은 순서로 적용됩니다.</p></div></div>
        <section className="admin-card display-order-page">
          {sortEditorBody}
          <div className="editor-footer"><button type="button" onClick={() => setSortNeedsInit(true)} disabled={sortSaving}>변경 취소</button><button className="primary-action" type="button" onClick={() => void saveDisplayOrder()} disabled={sortSaving}><Save size={16} /> {sortSaving ? "저장 중…" : "노출순서 저장"}</button></div>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="admin-page-heading"><div><span>PRODUCT MANAGEMENT</span><h1>{sortOnly ? "상품 진열순서 설정" : "상품 리스트"}</h1><p>{sortOnly ? "전체·카테고리에서 공통으로 적용되는 노출 순서를 설정합니다." : "상품은 간결하게 노출하고 사이즈별 옵션과 가격은 한 화면에서 관리합니다."}</p></div><div className="admin-heading-actions">{!sortOnly && <><button className="display-order-action" type="button" onClick={openSortManager}><ArrowUp size={17} /> 노출순서 관리</button><button className="primary-action" onClick={() => startEdit()}><PackagePlus size={17} /> 신규 상품 등록</button></>}</div></div>
      <div className="admin-stat-grid">
        <button type="button" className={`admin-stat-card featured ${statusFilter === "all" ? "selected" : ""}`} onClick={() => showProductStatus("all")}><div><span>등록 상품</span><strong>{(data.catalogTotals?.productCount ?? data.products.length).toLocaleString("ko-KR")}</strong><small>전체 상품 DB와 동일한 원본</small></div><Boxes size={24} /></button>
        <button type="button" className={`admin-stat-card ${statusFilter === "visible" ? "selected" : ""}`} onClick={() => showProductStatus("visible")}><div><span>노출 상품</span><strong>{(data.catalogTotals?.visibleProductCount ?? data.products.filter((item) => item.isVisible).length).toLocaleString("ko-KR")}</strong><small>공개 단가표 상품 보기</small></div><TrendingUp size={22} /></button>
        <button type="button" className={`admin-stat-card ${statusFilter === "soldout" ? "selected" : ""}`} onClick={() => showProductStatus("soldout")}><div><span>품절 상품·옵션</span><strong>{(data.catalogTotals?.soldOutProductCount ?? (data.products.filter((item) => item.isSoldOut).length + data.products.reduce((total, item) => total + (item.options?.filter((option) => option.isSoldOut).length ?? 0), 0))).toLocaleString("ko-KR")}</strong><small>{hydrating ? "전체 상품 목록 준비 중…" : "판매 중지 상품 보기"}</small></div><PackagePlus size={22} /></button>
        <Link className="admin-stat-card" to="/admin/history"><div><span>최근 가격변동</span><strong>{(data.priceHistoryCount ?? data.priceHistory.length).toLocaleString("ko-KR")}</strong><small>변경 이력 바로가기</small></div><History size={22} /></Link>
      </div>
      <section className="admin-card">
        <div className="excel-sync-panel">
          <div>
            <span className="excel-icon"><FileSpreadsheet size={21} /></span>
            <div><strong>발주오라형 엑셀 상품 관리</strong><small>발주오라 상품리스트 엑셀을 그대로 올리면 가격·품절·노출이 반영되고 신규 상품이 등록됩니다. 가격 변경은 가격변동 이력에 자동 기록됩니다.</small></div>
          </div>
          <div className="excel-actions">
            <button type="button" className="selected-excel-action" onClick={() => void downloadSelectedWorkbook()} disabled={excelBusy || selectedProductIds.size === 0}><Download size={15} /> 선택 상품 {selectedProductIds.size > 0 ? `(${selectedProductIds.size})` : ""} 다운로드</button>
            <button onClick={() => void downloadWorkbook("list")} disabled={excelBusy}><Download size={15} /> 상품 리스트</button>
            <button onClick={() => void downloadWorkbook("bulk")} disabled={excelBusy}><FileSpreadsheet size={15} /> 일괄변경 양식</button>
            <button className="excel-upload-action" onClick={() => fileInputRef.current?.click()} disabled={excelBusy}><Upload size={15} /> 엑셀 업로드</button>
            <input ref={fileInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void previewWorkbook(file); }} />
          </div>
          <div className="sync-status"><span /> 발주오라 API 자동연동 준비 · 보안 인증 연결 대기</div>
        </div>
        <div className="admin-toolbar product-filter-toolbar">
          <div className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="상품명·상품코드 검색" /></div>
          <select value={shippingFilter} onChange={(event) => { setShippingFilter(event.target.value as "all" | ShippingType); setCategoryFilter("all"); }}><option value="all">전체 배송</option><option value="domestic">국내배송</option><option value="overseas">해외배송</option></select>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">전체 카테고리</option>{visibleCategories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select>
          <select className="admin-month-filter" value={month} onChange={(event) => setMonth(event.target.value)}><option value="all">전체 판매월</option>{Array.from({ length: 12 }, (_, index) => index + 1).map((value) => <option key={value} value={String(value)}>{value}월 상품</option>)}</select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "visible" | "soldout")}><option value="all">전체 상태</option><option value="visible">노출 상품</option><option value="soldout">품절 상품</option></select>
          <label className="page-size-select">페이지당 <select aria-label="페이지당 상품 수" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option value={10}>10개씩 보기</option><option value={20}>20개씩 보기</option><option value={30}>30개씩 보기</option></select></label>
          <button type="button" className="filter-reset" onClick={() => { setQuery(""); setShippingFilter("all"); setCategoryFilter("all"); setMonth("all"); setStatusFilter("all"); }}>초기화</button>
          <span>총 {(data.isPartial ? data.catalogTotals?.productCount ?? products.length : products.length).toLocaleString("ko-KR")}개{hydrating ? " · 전체 목록 준비 중" : ""}</span>
        </div>
        <div className="bulk-select-row">
          <label className="bulk-select-all"><input type="checkbox" checked={allFilteredSelected} ref={(element) => { if (element) element.indeterminate = !allFilteredSelected && filteredProductIds.some((id) => selectedProductIds.has(id)); }} onChange={toggleAllFiltered} disabled={filteredProductIds.length === 0} /> 검색 결과 전체 선택 <b>{filteredProductIds.length.toLocaleString("ko-KR")}개</b></label>
        </div>
        {selectedProductIds.size > 0 && !bulkEditOpen && <div className="bulk-selection-bar" role="region" aria-label="선택한 상품 일괄 작업">
          <strong>{selectedProductIds.size.toLocaleString("ko-KR")}개 선택됨</strong>
          <div className="bulk-quick-actions" aria-label="빠른 변경">
            <button type="button" disabled={quickBusy} onClick={() => void quickBulkUpdate({ isSoldOut: true }, "품절")}>품절</button>
            <button type="button" disabled={quickBusy} onClick={() => void quickBulkUpdate({ isSoldOut: false }, "판매중")}>판매중</button>
            <button type="button" disabled={quickBusy} onClick={() => void quickBulkUpdate({ isVisible: true }, "노출")}>노출</button>
            <button type="button" disabled={quickBusy} onClick={() => void quickBulkUpdate({ isVisible: false }, "숨김")}>숨김</button>
            <button type="button" className="bulk-season-quick" disabled={quickBusy} onClick={() => setBulkEditOpen("seasonInfo")}><CalendarDays size={15} /> 제철 월·상품 안내</button>
          </div>
          <div className="bulk-main-actions"><button type="button" className="primary-action" onClick={() => setBulkEditOpen("all")} disabled={quickBusy}><Pencil size={15} /> 상세 일괄 변경</button><button type="button" onClick={() => setSelectedProductIds(new Set())} disabled={quickBusy}>선택 해제</button></div>
        </div>}
        <div className="admin-table-wrap product-admin-table-wrap" id="admin-product-list"><table className="admin-table product-admin-table"><thead><tr><th className="product-select-column"><label className="product-select-control"><input type="checkbox" ref={(element) => { if (element) element.indeterminate = selectedOnCurrentPage > 0 && !allCurrentPageSelected; }} checked={allCurrentPageSelected} onChange={toggleCurrentPageSelection} aria-label="현재 페이지 상품 전체 선택" /><span>선택</span></label></th><th>상품정보</th><th>노출순서</th><th>배송/카테고리</th><th>판매기간</th><th>매입처</th><th>원가</th><th>A단가</th><th>일반공급가</th><th>판매가</th><th>마진율</th><th>상태</th><th>관리</th></tr></thead><tbody>
          {pagedProducts.map((product) => {
            const options = product.options ?? [];
            const representativeOption = options.length > 0
              ? options.reduce((lowest, option) => effectiveAPrice(option.aPrice, option.generalPrice) < effectiveAPrice(lowest.aPrice, lowest.generalPrice) ? option : lowest, options[0])
              : null;
            const minimumAPrice = lowestProductAPrice(product);
            const minimumGeneralPrice = lowestProductGeneralPrice(product);
            const category = data.categories.find((item) => item.id === product.categoryId);
            const costPrice = representativeOption?.costPrice ?? product.costPrice ?? 0;
            const margin = marginRate(minimumAPrice, costPrice);
            const expanded = expandedProductId === product.id;
            // 옵션 단가 패널: PC는 표 아래 펼침 행, 모바일은 옵션 버튼 바로 아래에 같은 내용을 보여줍니다.
            const optionPanel = expanded && options.length > 0 ? (
              <div className="admin-option-panel">
                        <div className="admin-option-panel-heading"><div><span>OPTION PRICE</span><strong>{product.name} 옵션 단가</strong></div><small>옵션별 원가와 A단가 마진을 한눈에 확인할 수 있습니다.</small></div>
                        <div className="admin-option-list">
                          {options.map((option) => {
                            const optionMargin = marginRate(effectiveAPrice(option.aPrice, option.generalPrice), option.costPrice);
                            return <article key={option.id}>{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span className="admin-image-placeholder"><Boxes size={18} /></span>}<div className="admin-option-name"><strong>{option.name}</strong><small>{product.name}</small></div><div><span>원가</span><b className="cost-price">{formatPrice(option.costPrice ?? 0)}</b></div><div><span>A단가</span><b className="admin-a-price">{formatPrice(effectiveAPrice(option.aPrice, option.generalPrice))}</b></div><div><span>일반공급가</span><b className="admin-general-price">{formatPrice(option.generalPrice)}</b></div><div><span>판매가</span><b className="admin-sale-price">{option.salePriceMode === "fixed" ? option.salePrice === null ? "미설정" : formatPrice(option.salePrice) : "자율"}</b></div><div><span>마진율</span><em className="prominent">{optionMargin !== null ? `${Math.round(optionMargin)}%` : "-"}</em></div><div><span>상태</span><b className={option.isSoldOut ? "admin-option-sold-out" : ""}>{option.isSoldOut ? "품절" : "판매중"}</b></div></article>;
                          })}
                        </div>
                      </div>
            ) : null;
            return (
              <Fragment key={product.id}>
                <tr className={expanded ? "expanded" : ""}>
                  <td className="product-select-cell" data-label="선택"><label className="product-select-control"><input type="checkbox" checked={selectedProductIds.has(product.id)} onChange={() => toggleProductSelection(product.id)} aria-label={`${product.name} 선택`} /><span>선택</span></label></td>
                  <td className="admin-product-primary"><div className="admin-product-cell">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span className="admin-image-placeholder"><Boxes size={20} /></span>}<div className="admin-product-copy"><strong>{product.name}</strong><small>{product.productCode || product.id} · {product.origin || "-"}</small>{options.length > 0 && <button type="button" className="admin-option-toggle" onClick={() => setExpandedProductId(expanded ? null : product.id)} aria-expanded={expanded}>{expanded ? "옵션 접기" : `옵션 ${options.length}개 보기`} <ChevronRight size={14} /></button>}</div></div>{optionPanel && <div className="admin-inline-options">{optionPanel}</div>}</td>
                  <td data-label="노출순서"><strong className="display-order-number">{productOrderMap.get(product.id) ?? "-"}</strong></td>
                  <td data-label="배송·카테고리"><strong>{product.shippingType === "domestic" ? "국내배송" : "해외배송"}</strong><small>{category?.name || "-"}</small></td>
                  <td data-label="판매기간"><strong>{isSeasonalCategory(category) ? product.isAlwaysOnSale ? "상시 판매" : `${product.saleStartMonth || "-"}월 ~ ${product.saleEndMonth || "-"}월` : "상시"}</strong><small>{isSeasonalCategory(category) ? product.isAlwaysOnSale ? "연중 판매" : "월별 제철상품" : "기간 적용 제외"}</small></td>
                  <td data-label="매입처"><strong>{product.supplierName || "미지정"}</strong></td>
                  <td data-label="원가"><b className="cost-price">{formatPrice(costPrice)}</b></td>
                  <td data-label="A단가"><b className="admin-a-price">{formatPrice(minimumAPrice)}</b><small>{options.length > 0 ? "옵션 최저 A단가" : "기본 A단가"}</small></td>
                  <td data-label="일반공급가"><b className="admin-general-price">{formatPrice(minimumGeneralPrice)}</b><small>{options.length > 0 ? "옵션 최저가" : "기본가"}</small></td>
                  <td data-label="판매가"><b className="admin-sale-price">{product.salePriceMode === "fixed" ? product.salePrice === null ? "미설정" : formatPrice(product.salePrice) : "자율"}</b><small>{product.salePriceMode === "fixed" ? "지정 판매가" : "판매자 자율"}</small></td>
                  <td data-label="마진율">{margin !== null ? <strong className="margin-rate prominent">{Math.round(margin)}%</strong> : <small>계산 대기</small>}</td>
                  <td data-label="상태"><span className={`status-pill ${product.isVisible ? "active" : ""}`}>{product.isVisible ? "노출" : "숨김"}</span><span className={`status-pill ${product.isSoldOut ? "danger" : ""}`}>{product.isSoldOut ? "품절" : "판매중"}</span></td>
                  <td data-label="관리"><div className="row-actions product-row-actions"><button type="button" onClick={() => startEdit(product)}><Pencil size={15} /> 수정</button><button type="button" className="danger" onClick={() => void remove(product)} aria-label={`${product.name} 삭제`}><Trash2 size={15} /> 삭제</button></div></td>
                </tr>
                {expanded && options.length > 0 && (
                  <tr className="admin-option-detail-row">
                    <td colSpan={13}>
                      {optionPanel}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody></table>{products.length === 0 && <div className="empty-state"><Boxes size={28} /><strong>조건에 맞는 상품이 없습니다.</strong><span>다른 요약 카드나 전체 상태를 선택해 주세요.</span></div>}</div>
        <div className="catalog-pagination admin-product-pagination">
          <span>{products.length === 0 ? "0개" : `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, products.length)}개`} <small>/ 총 {products.length}개</small></span>
          <nav aria-label="상품 목록 페이지">
            <button type="button" onClick={() => setPage(1)} disabled={currentPage === 1} aria-label="첫 페이지"><ChevronsLeft size={15} /></button>
            <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1} aria-label="이전 페이지"><ChevronLeft size={15} /></button>
            {pageNumbers.map((value, index) => <Fragment key={value}>{index > 0 && pageNumbers[index - 1] !== value - 1 ? <span>…</span> : null}<button type="button" className={value === currentPage ? "active" : ""} onClick={() => setPage(value)}>{value}</button></Fragment>)}
            <button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount} aria-label="다음 페이지"><ChevronRight size={15} /></button>
            <button type="button" onClick={() => setPage(pageCount)} disabled={currentPage === pageCount} aria-label="마지막 페이지"><ChevronsRight size={15} /></button>
          
          </nav>
        </div>
      </section>
      {sortOpen && !sortOnly && (
        <div className="editor-overlay" role="presentation" onMouseDown={() => setSortOpen(false)}>
          <section className="display-order-modal" role="dialog" aria-modal="true" aria-labelledby="display-order-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="editor-header">
              <div><span>DISPLAY ORDER</span><h2 id="display-order-title">상품 노출순서 관리</h2><p>저장한 순서는 전체 단가표와 각 카테고리 목록에 동일하게 적용됩니다.</p></div>
              <button type="button" onClick={() => setSortOpen(false)} aria-label="노출순서 관리 닫기"><X size={21} /></button>
            </div>
            {sortEditorBody}
            <div className="editor-footer"><button type="button" onClick={() => setSortOpen(false)}>취소</button><button className="primary-action" type="button" onClick={() => void saveDisplayOrder()} disabled={sortSaving}><Save size={16} /> {sortSaving ? "저장 중…" : "노출순서 저장"}</button></div>
          </section>
        </div>
      )}
      {editing && <div className="editor-overlay"><form className="editor-panel" onSubmit={save}><div className="editor-header"><div><span>PRODUCT EDITOR</span><h2>{editing.id ? "상품 수정" : "신규 상품 등록"}</h2></div><button type="button" onClick={() => setEditing(null)} disabled={saving} aria-label="닫기"><X size={21} /></button></div><div className="editor-grid">
        <label>상품코드<input value={editing.productCode} onChange={(event) => setEditing({ ...editing, productCode: event.target.value })} placeholder="미입력 시 자동 생성" /></label>
        <label className="full">상품명<input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} required /></label>
        <label>배송유형<select value={editing.shippingType} onChange={(event) => { const shippingType = event.target.value as ShippingType; const category = data.categories.find((item) => item.shippingType === shippingType); const health = isHealthCategory(category); const seasonal = isSeasonalCategory(category); setEditing({ ...editing, shippingType, categoryId: category?.id || "", shippingPolicyId: null, salePriceMode: health ? "fixed" : editing.salePriceMode, saleStartMonth: seasonal ? editing.saleStartMonth : null, saleEndMonth: seasonal ? editing.saleEndMonth : null, isAlwaysOnSale: seasonal ? editing.isAlwaysOnSale : false, options: editing.options.map((option) => ({ ...option, salePriceMode: health ? "fixed" : option.salePriceMode })) }); }}><option value="domestic">국내배송</option><option value="overseas">해외배송</option></select></label>
        <label>카테고리<select value={editing.categoryId} onChange={(event) => { const category = data.categories.find((item) => item.id === event.target.value); const health = isHealthCategory(category); const seasonal = isSeasonalCategory(category); setEditing({ ...editing, categoryId: event.target.value, salePriceMode: health ? "fixed" : editing.salePriceMode, saleStartMonth: seasonal ? editing.saleStartMonth : null, saleEndMonth: seasonal ? editing.saleEndMonth : null, isAlwaysOnSale: seasonal ? editing.isAlwaysOnSale : false, options: editing.options.map((option) => ({ ...option, salePriceMode: health ? "fixed" : option.salePriceMode })) }); }} required>{data.categories.filter((item) => item.shippingType === editing.shippingType).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>원가<input type="number" min="0" value={editing.costPrice} onChange={(event) => setEditing({ ...editing, costPrice: Number(event.target.value) })} required /><small>원가 기준 A단가 마진율이 자동 계산됩니다.</small></label>
        <label>A단가<input type="number" min="0" value={editing.aPrice} onChange={(event) => setEditing({ ...editing, aPrice: Number(event.target.value) })} required /><strong className="margin-rate editor-margin">{marginRate(editing.aPrice, editing.costPrice)?.toFixed(1) ?? "-"}% 마진</strong></label>
        <label>일반공급가<input type="number" min="0" value={editing.generalPrice} onChange={(event) => setEditing({ ...editing, generalPrice: Number(event.target.value) })} required /></label>
        <label>판매가 정책<select value={editingHealthProduct ? "fixed" : editing.salePriceMode} disabled={editingHealthProduct} onChange={(event) => setEditing({ ...editing, salePriceMode: event.target.value as "autonomous" | "fixed" })}><option value="autonomous">자율 판매가</option><option value="fixed">지정 판매가</option></select><small>{editingHealthProduct ? "건강식품은 지정 판매가만 사용할 수 있습니다." : "판매자가 자유롭게 정하거나 지정가를 안내할 수 있습니다."}</small></label>
        <label>지정 판매가<input type="number" min="0" value={editing.salePrice ?? ""} disabled={(editingHealthProduct ? "fixed" : editing.salePriceMode) !== "fixed"} onChange={(event) => setEditing({ ...editing, salePrice: event.target.value ? Number(event.target.value) : null })} placeholder="지정 판매가 입력" /></label>
        {editingSeasonalProduct && <>
          <label>판매 시작월<select value={editing.isAlwaysOnSale ? "always" : editing.saleStartMonth ?? ""} onChange={(event) => event.target.value === "always" ? setEditing({ ...editing, isAlwaysOnSale: true, saleStartMonth: null, saleEndMonth: null }) : setEditing({ ...editing, isAlwaysOnSale: false, saleStartMonth: event.target.value ? Number(event.target.value) : null })}><option value="">미설정</option><option value="always">상시 판매</option>{Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{month}월</option>)}</select><small>상시 판매를 선택하면 종료월은 사용할 수 없습니다.</small></label>
          <label>판매 종료월<select value={editing.saleEndMonth ?? ""} disabled={editing.isAlwaysOnSale} onChange={(event) => setEditing({ ...editing, saleEndMonth: event.target.value ? Number(event.target.value) : null })}><option value="">{editing.isAlwaysOnSale ? "상시 판매 (선택 불가)" : "미설정"}</option>{Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{month}월</option>)}</select></label>
        </>}
        <label className="full">상품 이미지<input value={editing.imageUrl} onChange={(event) => setEditing({ ...editing, imageUrl: event.target.value })} placeholder="https://... 또는 아래 업로드" /><span className="image-upload-row"><button type="button" onClick={() => imageInputRef.current?.click()} disabled={imageBusy}><Upload size={14} /> {imageBusy ? "업로드 중…" : "JPEG/PNG 업로드"}</button><input ref={imageInputRef} type="file" accept="image/jpeg,image/png" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadProductImage(file); }} /></span>{editing.imageUrl ? <ProductImagePreview url={editing.imageUrl} onClear={() => setEditing({ ...editing, imageUrl: "" })} /> : <small className="product-image-empty">이미지를 올리거나 주소를 넣으면 여기에서 미리 볼 수 있습니다.</small>}</label>
        <label>매입처<select value={editing.supplierName} onChange={(event) => setEditing({ ...editing, supplierName: event.target.value })}><option value="">미지정</option>{editing.supplierName && !suppliers.some((supplier) => supplier.name === editing.supplierName) && <option value={editing.supplierName}>{editing.supplierName} (기존 입력)</option>}{suppliers.filter((supplier) => supplier.isActive).map((supplier) => <option value={supplier.name} key={supplier.id}>{supplier.name}</option>)}</select><small>공급처 메뉴에서 등록한 매입처를 선택할 수 있습니다.</small></label>
        <label>원산지<input value={editing.origin} onChange={(event) => setEditing({ ...editing, origin: event.target.value })} /></label>
        <label>배송 정책<select value={editing.shippingPolicyId ?? ""} onChange={(event) => {
          const policyId = event.target.value || null;
          const policy = shippingPolicies.find((item) => item.id === policyId);
          setEditing({
            ...editing,
            shippingPolicyId: policyId,
            shippingFee: policy ? `${policy.name}${policy.feeLabel ? ` [${policy.feeLabel}]` : ""}` : editing.shippingFee,
            courier: policy?.courier || editing.courier
          });
        }}><option value="">직접 입력</option>{shippingPolicies.filter((policy) => policy.shippingType === editing.shippingType && policy.isActive).map((policy) => <option value={policy.id} key={policy.id}>{policy.name} · {policy.feeLabel}</option>)}</select><small>정책을 선택하면 배송비와 택배사가 자동으로 반영됩니다.</small></label>
        <label>배송비<input value={editing.shippingFee} onChange={(event) => setEditing({ ...editing, shippingFee: event.target.value })} /></label>
        <label>출고 안내<input value={editing.releaseInfo} onChange={(event) => setEditing({ ...editing, releaseInfo: event.target.value })} /></label>
        <label>택배사<input value={editing.courier} onChange={(event) => setEditing({ ...editing, courier: event.target.value })} /></label>
        <label>규격/중량<input value={editing.optionsInfo} onChange={(event) => setEditing({ ...editing, optionsInfo: event.target.value })} /></label>
        <label>포장방법<input value={editing.packaging} onChange={(event) => setEditing({ ...editing, packaging: event.target.value })} /></label>
        <label className="full">참고사항<textarea rows={4} value={editing.notes} onChange={(event) => setEditing({ ...editing, notes: event.target.value })} /></label>
        <label className="check-label"><input type="checkbox" checked={editing.isVisible} onChange={(event) => setEditing({ ...editing, isVisible: event.target.checked })} /> 공개 노출</label>
        <label className="check-label"><input type="checkbox" checked={editing.isSoldOut} onChange={(event) => setEditing({ ...editing, isSoldOut: event.target.checked })} /> 품절/준비중 표시 (노출 유지)</label>
      </div><div className="editor-footer"><button type="button" onClick={() => setEditing(null)} disabled={saving}>취소</button><button className="primary-action" type="submit" disabled={saving}><Save size={16} /> {saving ? "빠르게 저장 중…" : "저장하기"}</button></div></form></div>}
      {bulkEditOpen && <BulkEditModal ids={Array.from(selectedProductIds)} categories={data.categories} shippingPolicies={shippingPolicies} suppliers={suppliers} preset={bulkEditOpen === "seasonInfo" ? "seasonInfo" : undefined} nonSeasonalCount={data.products.filter((product) => selectedProductIds.has(product.id) && !isSeasonalCategory(data.categories.find((category) => category.id === product.categoryId))).length} onClose={() => setBulkEditOpen(false)} onDone={() => { setBulkEditOpen(false); setSelectedProductIds(new Set()); void refresh(true); }} />}
      {bulkPreview && <div className="editor-overlay"><section className="excel-preview-panel"><div className="editor-header"><div><span>EXCEL PREVIEW</span><h2>상품 일괄변경 미리보기</h2></div><button type="button" onClick={() => { setBulkPreview(null); setBulkFile(null); }} aria-label="닫기"><X size={21} /></button></div>
        <div className="excel-preview-summary"><article><span>읽은 행</span><strong>{bulkPreview.totalRows}</strong></article><article><span>매칭 행</span><strong>{bulkPreview.matchedRows}</strong></article><article><span>변경 상품</span><strong>{bulkPreview.affectedProducts}</strong></article><article><span>변경 항목</span><strong>{bulkPreview.changes.length}</strong></article>{bulkPreview.newProducts ? <article><span>신규 상품</span><strong>{bulkPreview.newProducts}</strong></article> : null}</div>
        {bulkPreview.errors.length > 0 && <div className="excel-error-list"><strong>수정이 필요한 행</strong>{bulkPreview.errors.map((error) => <p key={`${error.row}-${error.message}`}>{error.row}행 · {error.message}</p>)}</div>}
        <div className="excel-change-list">{bulkPreview.changes.length === 0 ? <p className="excel-empty">변경되는 값이 없습니다.</p> : bulkPreview.changes.slice(0, 100).map((change, index) => <div key={`${change.row}-${change.field}-${index}`}><span>{change.row}행</span><strong>{change.productName}{change.optionName ? <small>{change.optionName}</small> : null}</strong><em>{change.field}</em><del>{String(change.before ?? "-")}</del><ChevronRight size={14} /><b>{String(change.after ?? "-")}</b></div>)}</div>
        <div className="excel-warning-list">{bulkPreview.warnings.map((warning) => <p key={warning}>• {warning}</p>)}</div>
        <div className="editor-footer"><button type="button" onClick={() => { setBulkPreview(null); setBulkFile(null); }}>취소</button><button className="primary-action" type="button" onClick={() => void applyWorkbook()} disabled={excelBusy || bulkPreview.errors.length > 0 || bulkPreview.changes.length === 0}><Upload size={16} /> {excelBusy ? "적용 중…" : "변경 적용"}</button></div>
      </section></div>}
    </>
  );
}

function BundlesAdmin({ data }: { data: AdminCatalogData }) {
  const cachedProductData = adminDataCache.get("products");
  const [groups, setGroups] = useState<ProductGroup[]>(bundleGroupsCache?.groups ?? []);
  const [products, setProducts] = useState<Product[]>(Array.isArray(cachedProductData?.products) && cachedProductData.products.length > 0
    ? cachedProductData.products
    : Array.isArray(data.products) ? data.products : []);
  const [productsPartial, setProductsPartial] = useState(Boolean(cachedProductData?.isPartial || data.isPartial));
  const [loading, setLoading] = useState(() => !bundleGroupsCache);
  const [productsLoading, setProductsLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>(Array.isArray(data.categories) ? data.categories : []);
  const [editing, setEditing] = useState<ProductGroup | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [candidatePageSize, setCandidatePageSize] = useState(30);
  const [candidatePage, setCandidatePage] = useState(1);
  const [imageBusy, setImageBusy] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [sortItems, setSortItems] = useState<ProductGroup[]>([]);
  const [sortSaving, setSortSaving] = useState(false);
  const bundleImageInputRef = useRef<HTMLInputElement>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await apiFetch("/catalog/admin/groups");
      const payload = await readData<{ groups?: ProductGroup[] }>(response);
      const nextGroups = Array.isArray(payload.groups) ? payload.groups : [];
      const sortedGroups = [...nextGroups].sort((first, second) => first.displayOrder - second.displayOrder || first.name.localeCompare(second.name));
      bundleGroupsCache = { groups: sortedGroups, storedAt: Date.now() };
      setGroups(sortedGroups);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "묶음상품을 불러오지 못했습니다.");
    } finally {
      if (!silent) setLoading(false);
    }
  };
  useEffect(() => {
    void load(Boolean(bundleGroupsCache));
  }, []);
  useEffect(() => {
    if (!formOpen) return;
    if (categories.length === 0) {
      void apiFetch("/catalog/admin/categories/summary", { silent: true }).then(async (response) => {
        if (!response.ok) return;
        const payload = await readData<{ categories: Category[] }>(response);
        setCategories(Array.isArray(payload.categories) ? payload.categories : []);
      }).catch(() => undefined);
    }
    if ((products.length === 0 || productsPartial) && !productsLoading) {
      setProductsLoading(true);
      void apiFetch("/catalog/admin/products", { silent: true }).then(async (response) => {
        if (!response.ok) return;
        const payload = await readData<AdminCatalogData>(response);
        const nextProducts = Array.isArray(payload.products) ? payload.products : [];
        setProducts(nextProducts);
        setProductsPartial(Boolean(payload.isPartial));
        adminDataCache.set("products", payload);
      }).catch(() => undefined).finally(() => setProductsLoading(false));
    }
  }, [categories.length, formOpen, products.length, productsLoading, productsPartial]);
  const open = (group?: ProductGroup) => {
    setFormOpen(true);
    setEditing(group ?? null);
    setName(group?.name ?? "");
    setImageUrl(group?.imageUrl ?? "");
    setCategoryId(group?.categoryId ?? "");
    setDescription(group?.description ?? "");
    setQuery("");
    setCandidatePage(1);
    setSelectedIds(group?.items.map((item) => item.productId) ?? []);
  };
  const uploadBundleImage = async (file: File) => {
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast.error("대표 이미지는 JPEG 또는 PNG만 업로드할 수 있습니다.");
      return;
    }
    if (file.size >= 5 * 1024 * 1024) {
      toast.error("대표 이미지는 5MB 미만만 업로드할 수 있습니다.");
      return;
    }
    setImageBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await apiFetch("/catalog/admin/groups/image-upload", { method: "POST", body: form });
      const payload = await readData<{ file: { downloadUrl: string } }>(response);
      setImageUrl(payload.file.downloadUrl);
      toast.success("묶음상품 대표 이미지를 업로드했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "대표 이미지 업로드에 실패했습니다.");
    } finally {
      setImageBusy(false);
      if (bundleImageInputRef.current) bundleImageInputRef.current.value = "";
    }
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    const response = await apiFetch(editing ? `/catalog/admin/groups/${editing.id}` : "/catalog/admin/groups", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, imageUrl: imageUrl || null, categoryId: categoryId || null, description: description || null, productIds: selectedIds, isVisible: true })
    });
    if (!response.ok) return;
    toast.success(editing ? "묶음상품을 수정했습니다." : "묶음상품을 등록했습니다.");
    setEditing(null); setFormOpen(false); setImageUrl("");
    await load();
  };
  const remove = async (group: ProductGroup) => {
    if (!window.confirm(`${group.name} 묶음상품을 삭제할까요?`)) return;
    const response = await apiFetch(`/catalog/admin/groups/${group.id}`, { method: "DELETE" });
    if (response.ok) { toast.success("묶음상품을 삭제했습니다."); await load(); }
  };
  const filteredCandidates = products.filter((product) => {
    const normalized = query.trim().toLowerCase();
    return !normalized || `${product.name} ${product.productCode ?? ""}`.toLowerCase().includes(normalized);
  });
  const candidateTotalPages = Math.max(1, Math.ceil(filteredCandidates.length / candidatePageSize));
  const visibleCandidates = filteredCandidates.slice((candidatePage - 1) * candidatePageSize, candidatePage * candidatePageSize);
  const allFilteredSelected = filteredCandidates.length > 0 && filteredCandidates.every((product) => selectedIds.includes(product.id));
  useEffect(() => {
    setCandidatePage((current) => Math.min(current, candidateTotalPages));
  }, [candidateTotalPages]);
  const toggleProduct = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const toggleAllCandidates = () => setSelectedIds((current) => allFilteredSelected
    ? current.filter((id) => !filteredCandidates.some((product) => product.id === id))
    : Array.from(new Set([...current, ...filteredCandidates.map((product) => product.id)])));
  const openSortManager = () => {
    setSortItems([...groups]);
    setSortOpen(true);
  };
  const moveGroup = (groupId: string, direction: "up" | "down") => {
    setSortItems((current) => {
      const sourceIndex = current.findIndex((group) => group.id === groupId);
      if (sourceIndex < 0) return current;
      const targetIndex = direction === "up" ? sourceIndex - 1 : sourceIndex + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      [next[sourceIndex], next[targetIndex]] = [next[targetIndex], next[sourceIndex]];
      return next;
    });
  };
  const saveGroupOrder = async () => {
    const items = sortItems.map((group, index) => ({ id: group.id, displayOrder: (index + 1) * 10 }));
    setSortSaving(true);
    try {
      const response = await apiFetch("/catalog/admin/groups/display-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items })
      });
      if (!response.ok) return;
      toast.success("묶음상품 순위를 저장했습니다.");
      setSortOpen(false);
      await load();
    } finally {
      setSortSaving(false);
    }
  };
  return <><div className="admin-page-heading"><div><span>BUNDLE PRODUCTS</span><h1>묶음상품 리스트</h1><p>일반상품을 여러 개 묶어 대표 썸네일과 함께 관리합니다.</p></div><div className="admin-heading-actions"><button className="display-order-action" type="button" onClick={openSortManager}><ListOrdered size={16} /> 상품 순위 변경</button><button className="primary-action" type="button" onClick={() => open()}><Plus size={16} /> 묶음상품 등록</button></div></div>
    {loading ? <div className="admin-loading inline"><div className="spinner" /><span>묶음상품을 불러오는 중…</span></div> : <div className="bundle-grid">{groups.map((group, index) => {
      const validItems = group.items.filter((item) => item.product);
      const groupSupplyPrices = validItems.flatMap((item) => {
        const options = item.product?.options ?? [];
        return options.length > 0
          ? options.map((option) => effectiveAPrice(option.aPrice, option.generalPrice))
          : [effectiveAPrice(item.product?.aPrice, item.product?.generalPrice ?? 0)];
      });
      const lowestGroupSupplyPrice = groupSupplyPrices.length > 0 ? Math.min(...groupSupplyPrices) : null;
      const groupImage = group.imageUrl || validItems[0]?.product?.imageUrl || "";
      return <article className="bundle-card" key={group.id}><div className="bundle-thumb">{groupImage ? <img src={groupImage} alt="" loading="lazy" /> : <PackagePlus size={30} />}<div className="bundle-thumb-overlay"><div className="bundle-parent-line"><span>그룹상품 {index + 1}</span><small>일반상품 {group.items.length}개</small></div><h2>{group.name}</h2>{lowestGroupSupplyPrice !== null && <div className="bundle-price-summary">대표 공급가 최저 <strong>{formatPrice(lowestGroupSupplyPrice)}</strong></div>}</div></div><div className="bundle-card-body"><div className="bundle-card-summary"><span>묶음상품명</span><strong>{group.name}</strong><small>매핑된 일반상품 <b>{group.items.length.toLocaleString("ko-KR")}개</b></small></div><p>{group.description || "대표 상품을 선택해 묶음으로 관리합니다."}</p><div className="bundle-item-strip">{group.items.slice(0, 5).map((item) => <img key={item.id} src={item.product?.imageUrl || "/assets/products/placeholder.webp"} alt="" loading="lazy" />)}</div>{validItems.length !== group.items.length && <div className="bundle-missing-item">연결된 상품 정보 일부를 불러오지 못했습니다.</div>}<div className="bundle-card-actions"><button type="button" onClick={() => open(group)}><Pencil size={14} /> 수정</button><button type="button" onClick={() => void remove(group)}><Trash2 size={14} /> 삭제</button></div></div></article>;
    })}{groups.length === 0 && <div className="empty-state"><PackagePlus size={28} /><strong>등록된 묶음상품이 없습니다.</strong><span>일반상품을 묶어 첫 그룹상품을 만들어 보세요.</span></div>}</div>}
    {formOpen ? <div className="editor-overlay" role="presentation"><form className="editor-panel bundle-editor" onSubmit={save}><div className="editor-header"><div><span>BUNDLE EDITOR</span><h2>{editing ? "묶음상품 수정" : "묶음상품 등록"}</h2></div><button type="button" onClick={() => { setEditing(null); setFormOpen(false); setName(""); setImageUrl(""); }} aria-label="닫기"><X size={20} /></button></div><div className="editor-grid"><label>그룹상품명<input value={name} onChange={(event) => setName(event.target.value)} required /></label><label>대표 카테고리<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">선택 안 함</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label className="full bundle-image-field">대표 이미지<input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://... 또는 아래에서 업로드" /><span className="image-upload-row"><button type="button" onClick={() => bundleImageInputRef.current?.click()} disabled={imageBusy}><Upload size={14} /> {imageBusy ? "업로드 중…" : "JPEG/PNG 업로드"}</button><input ref={bundleImageInputRef} type="file" accept="image/jpeg,image/png" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadBundleImage(file); }} />{imageUrl && <img src={imageUrl} alt="묶음상품 대표 이미지 미리보기" />}</span><small>발주오라의 상품 이미지처럼 대표 썸네일로 사용합니다. 상세페이지 입력은 제공하지 않습니다.</small></label><label className="full">설명<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></label><label className="full">일반상품 검색<input value={query} onChange={(event) => { setQuery(event.target.value); setCandidatePage(1); }} placeholder="상품명 또는 상품코드" /></label><div className="bundle-picker-toolbar full"><label className="bundle-select-all"><input type="checkbox" checked={allFilteredSelected} onChange={toggleAllCandidates} disabled={filteredCandidates.length === 0} /> 전체 선택</label><span>검색 결과 {productsLoading ? "불러오는 중…" : `${filteredCandidates.length.toLocaleString("ko-KR")}개 · 현재 ${visibleCandidates.length}개`}</span><label>페이지당<select aria-label="묶음상품 일반상품 페이지당 표시 수" value={candidatePageSize} onChange={(event) => { setCandidatePageSize(Number(event.target.value)); setCandidatePage(1); }}><option value={10}>10개</option><option value={20}>20개</option><option value={30}>30개</option></select></label></div><div className="bundle-product-picker full">{productsLoading ? <div className="bundle-picker-empty">일반상품 목록을 빠르게 불러오는 중입니다…</div> : visibleCandidates.map((product) => <label key={product.id} className={`bundle-product-option ${selectedIds.includes(product.id) ? "selected" : ""}`}><input type="checkbox" checked={selectedIds.includes(product.id)} onChange={() => toggleProduct(product.id)} /><img src={product.imageUrl || "/assets/products/placeholder.webp"} alt="" loading="lazy" /><span className="bundle-product-main"><strong>{product.name}</strong><small>{product.productCode || product.id}</small></span><span className="bundle-product-prices"><b>공급가 {formatPrice(lowestProductGeneralPrice(product))}</b><b>A단가 {formatPrice(lowestProductAPrice(product))}</b></span></label>)}{!productsLoading && visibleCandidates.length === 0 && <div className="bundle-picker-empty">검색 결과가 없습니다.</div>}</div><div className="bundle-picker-pagination full" aria-label="묶음상품 일반상품 페이지"><button type="button" disabled={candidatePage <= 1} onClick={() => setCandidatePage((current) => current - 1)} aria-label="이전 일반상품 페이지"><ChevronLeft size={15} /></button>{Array.from({ length: candidateTotalPages }, (_, index) => index + 1).slice(0, 7).map((page) => <button type="button" key={page} className={page === candidatePage ? "active" : ""} onClick={() => setCandidatePage(page)}>{page}</button>)}<button type="button" disabled={candidatePage >= candidateTotalPages} onClick={() => setCandidatePage((current) => current + 1)} aria-label="다음 일반상품 페이지"><ChevronRight size={15} /></button></div></div><div className="editor-actions bundle-editor-actions"><span>{selectedIds.length}개 일반상품 선택</span><button type="submit" className="primary-action">저장</button></div></form></div> : null}
    {sortOpen ? <div className="editor-overlay" role="presentation"><section className="editor-panel bundle-sort-panel" role="dialog" aria-modal="true" aria-labelledby="bundle-sort-title"><div className="editor-header"><div><span>BUNDLE ORDER</span><h2 id="bundle-sort-title">묶음상품 순위 변경</h2><p>위로·아래로 이동한 순서가 공개 화면의 묶음상품 노출 순서가 됩니다.</p></div><button type="button" onClick={() => setSortOpen(false)} aria-label="묶음상품 순위 변경 닫기"><X size={20} /></button></div><div className="bundle-sort-list">{sortItems.map((group, index) => <article key={group.id}><strong className="bundle-sort-rank">{index + 1}</strong><img src={group.imageUrl || group.items[0]?.product?.imageUrl || "/assets/products/placeholder.webp"} alt="" /><div><b>{group.name}</b><small>일반상품 {group.items.length}개</small></div><div className="bundle-sort-controls"><button type="button" onClick={() => moveGroup(group.id, "up")} disabled={index === 0 || sortSaving} aria-label={`${group.name} 위로 이동`}><ArrowUp size={15} /> 위로</button><button type="button" onClick={() => moveGroup(group.id, "down")} disabled={index === sortItems.length - 1 || sortSaving} aria-label={`${group.name} 아래로 이동`}><ArrowDown size={15} /> 아래로</button></div></article>)}{sortItems.length === 0 && <div className="empty-state">등록된 묶음상품이 없습니다.</div>}</div><div className="editor-footer"><button type="button" onClick={() => setSortOpen(false)}>취소</button><button className="primary-action" type="button" onClick={() => void saveGroupOrder()} disabled={sortSaving || sortItems.length === 0}><Save size={16} /> {sortSaving ? "저장 중…" : "순위 저장"}</button></div></section></div> : null}
  </>;
}

function ShippingPoliciesAdmin() {
  const [policies, setPolicies] = useState<ShippingPolicy[]>([]);
  const [editing, setEditing] = useState<ShippingPolicy | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [shippingType, setShippingType] = useState<ShippingType>("domestic");
  const [courier, setCourier] = useState("");
  const [feeLabel, setFeeLabel] = useState("무료배송");
  const [fee, setFee] = useState("0");
  const [description, setDescription] = useState("");
  const load = async () => {
    const response = await apiFetch("/catalog/admin/shipping-policies");
    if (response.ok) setPolicies((await readData<{ policies: ShippingPolicy[] }>(response)).policies);
  };
  useEffect(() => { void load(); }, []);
  const open = (policy?: ShippingPolicy) => {
    setFormOpen(true);
    setEditing(policy ?? null); setName(policy?.name ?? ""); setShippingType(policy?.shippingType ?? "domestic"); setCourier(policy?.courier ?? ""); setFeeLabel(policy?.feeLabel ?? "무료배송"); setFee(String(policy?.fee ?? 0)); setDescription(policy?.description ?? "");
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const response = await apiFetch(editing ? `/catalog/admin/shipping-policies/${editing.id}` : "/catalog/admin/shipping-policies", { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, shippingType, courier: courier || null, fee: Number(fee) || 0, feeLabel, description: description || null, isActive: true }) });
    if (!response.ok) return;
    toast.success("배송 정책을 저장했습니다."); setEditing(null); setFormOpen(false); setName(""); await load();
  };
  const remove = async (policy: ShippingPolicy) => {
    const response = await apiFetch(`/catalog/admin/shipping-policies/${policy.id}`, { method: "DELETE" });
    if (response.ok) { toast.success("배송 정책을 삭제했습니다."); await load(); }
  };
  const editorOpen = formOpen;
  return <><div className="admin-page-heading"><div><span>SHIPPING POLICY</span><h1>배송 정책</h1><p>상품 등록 시 선택할 배송비·택배사 정책을 관리합니다.</p></div><button className="primary-action" type="button" onClick={() => open()}><Plus size={16} /> 정책 등록</button></div><div className="policy-grid">{policies.map((policy) => <article className="policy-card" key={policy.id}><div><span className={`delivery-badge ${policy.shippingType}`}>{policy.shippingType === "domestic" ? "국내배송" : "해외배송"}</span><h2>{policy.name}</h2><strong>{policy.feeLabel}</strong><small>{policy.courier || "택배사 지정"} · {policy.description || "설명 없음"}</small></div><div className="bundle-card-actions"><button type="button" onClick={() => open(policy)}><Pencil size={14} /> 수정</button><button type="button" onClick={() => void remove(policy)}><Trash2 size={14} /> 삭제</button></div></article>)}</div>{editorOpen && <div className="editor-overlay"><form className="editor-panel" onSubmit={save}><div className="editor-header"><div><span>SHIPPING POLICY</span><h2>{editing ? "배송 정책 수정" : "배송 정책 등록"}</h2></div><button type="button" onClick={() => { setEditing(null); setFormOpen(false); setName(""); }} aria-label="닫기"><X size={20} /></button></div><div className="editor-grid"><label>정책명<input value={name} onChange={(event) => setName(event.target.value)} required /></label><label>배송유형<select value={shippingType} onChange={(event) => setShippingType(event.target.value as ShippingType)}><option value="domestic">국내배송</option><option value="overseas">해외배송</option></select></label><label>택배사<input value={courier} onChange={(event) => setCourier(event.target.value)} /></label><label>배송비<input value={fee} onChange={(event) => setFee(event.target.value)} inputMode="numeric" /></label><label>표시 문구<input value={feeLabel} onChange={(event) => setFeeLabel(event.target.value)} /></label><label className="full">설명<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></label></div><div className="editor-actions"><button type="submit" className="primary-action">저장</button></div></form></div>}</>;
}

function SuppliersAdmin() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [businessNumber, setBusinessNumber] = useState("");
  const [representative, setRepresentative] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [memo, setMemo] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await apiFetch("/catalog/admin/suppliers");
      if (response.ok) setSuppliers((await readData<{ suppliers: Supplier[] }>(response)).suppliers);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "공급처를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const reset = () => {
    setEditing(null);
    setFormOpen(false);
    setName("");
    setBusinessNumber("");
    setRepresentative("");
    setPhone("");
    setEmail("");
    setAddress("");
    setMemo("");
  };

  const open = (supplier?: Supplier) => {
    setEditing(supplier ?? null);
    setFormOpen(true);
    setName(supplier?.name ?? "");
    setBusinessNumber(supplier?.businessNumber ?? "");
    setRepresentative(supplier?.representative ?? "");
    setPhone(supplier?.phone ?? "");
    setEmail(supplier?.email ?? "");
    setAddress(supplier?.address ?? "");
    setMemo(supplier?.memo ?? "");
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = { name, businessNumber: businessNumber || null, representative: representative || null, phone: phone || null, email: email || null, address: address || null, memo: memo || null, isActive: true };
    const response = await apiFetch(editing ? `/catalog/admin/suppliers/${editing.id}` : "/catalog/admin/suppliers", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) return;
    toast.success(editing ? "공급처 정보를 수정했습니다." : "공급처를 등록했습니다.");
    reset();
    await load();
  };

  const remove = async (supplier: Supplier) => {
    if (!window.confirm(`${supplier.name} 공급처를 사용 중지할까요? 기존 상품의 매입처 정보는 유지됩니다.`)) return;
    const response = await apiFetch(`/catalog/admin/suppliers/${supplier.id}`, { method: "DELETE" });
    if (response.ok) {
      toast.success("공급처를 사용 중지했습니다.");
      await load();
    }
  };

  return <><div className="admin-page-heading"><div><span>SUPPLIER MANAGEMENT</span><h1>공급처</h1><p>상품에 연결할 매입처 정보를 발주오라형 목록으로 관리합니다.</p></div><button className="primary-action" type="button" onClick={() => open()}><Plus size={16} /> 신규 등록</button></div>
    <section className="supplier-admin-card admin-card">
      <div className="supplier-admin-toolbar"><div><strong>매입처 리스트</strong><span>상품 편집기에서 선택할 수 있는 활성 공급처 {suppliers.filter((supplier) => supplier.isActive).length}개</span></div><span className="supplier-admin-note">기존 상품의 매입처 텍스트는 삭제하지 않습니다.</span></div>
      {loading ? <div className="admin-loading inline"><div className="spinner" /><span>공급처를 불러오는 중…</span></div> : suppliers.length === 0 ? <div className="empty-state"><Store size={28} /><strong>등록된 공급처가 없습니다.</strong><span>신규 등록 버튼으로 첫 매입처를 추가해 주세요.</span></div> : <div className="admin-table-wrap supplier-table-wrap"><table className="admin-table supplier-table"><thead><tr><th>번호</th><th>매입처명</th><th>사업자등록번호</th><th>대표자</th><th>담당자 연락처</th><th>주소</th><th>상태</th><th>관리</th></tr></thead><tbody>{suppliers.map((supplier, index) => <tr key={supplier.id}><td>{suppliers.length - index}</td><td><strong>{supplier.name}</strong>{supplier.memo && <small>{supplier.memo}</small>}</td><td>{supplier.businessNumber || "-"}</td><td>{supplier.representative || "-"}</td><td>{supplier.phone || "-"}</td><td>{supplier.address || "-"}</td><td><span className={`status-pill ${supplier.isActive ? "active" : "danger"}`}>{supplier.isActive ? "사용" : "중지"}</span></td><td><div className="row-actions"><button type="button" onClick={() => open(supplier)}><Pencil size={14} /> 수정</button>{supplier.isActive && <button type="button" className="danger" onClick={() => void remove(supplier)}><Trash2 size={14} /> 중지</button>}</div></td></tr>)}</tbody></table></div>}
    </section>
    {formOpen && <div className="editor-overlay" role="presentation" onMouseDown={reset}><form className="editor-panel supplier-editor" onSubmit={save} onMouseDown={(event) => event.stopPropagation()}><div className="editor-header"><div><span>SUPPLIER REGISTER</span><h2>{editing ? "매입처 수정" : "매입처 신규 등록"}</h2><p>상품에서 선택할 매입처 기본정보를 입력합니다.</p></div><button type="button" onClick={reset} aria-label="공급처 등록 닫기"><X size={20} /></button></div><div className="editor-grid"><label>매입처명*<input value={name} onChange={(event) => setName(event.target.value)} placeholder="상호명을 입력해 주세요." required /></label><label>대표자 성함<input value={representative} onChange={(event) => setRepresentative(event.target.value)} placeholder="대표자 성함" /></label><label>사업자등록번호<input value={businessNumber} onChange={(event) => setBusinessNumber(event.target.value)} placeholder="사업자등록번호" /></label><label>담당자 휴대폰번호<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="010-0000-0000" /></label><label>담당자 이메일<input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="example@company.com" /></label><label className="full">주소<input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="주소를 입력해 주세요." /></label><label className="full">비고<textarea value={memo} onChange={(event) => setMemo(event.target.value)} rows={4} placeholder="배송·정산·연락 가능 시간 등 참고사항" /></label></div><div className="editor-footer"><button type="button" onClick={reset}>취소</button><button className="primary-action" type="submit"><Save size={16} /> 저장하기</button></div></form></div>}
  </>;
}

function CategoriesAdmin({ data, refresh }: { data: AdminCatalogData; refresh: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [shippingType, setShippingType] = useState<ShippingType>("domestic");
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const response = await apiFetch("/catalog/admin/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, shippingType, sortOrder: data.categories.length + 1, isActive: true }) });
    if (!response.ok) return;
    setName("");
    toast.success("카테고리를 추가했습니다.");
    await refresh();
  };
  const remove = async (category: Category) => {
    if (!window.confirm(`'${category.name}' 카테고리를 삭제할까요?`)) return;
    const response = await apiFetch(`/catalog/admin/categories/${category.id}`, { method: "DELETE" });
    if (!response.ok) return;
    await refresh();
  };
  return <><div className="admin-page-heading"><div><span>CATEGORY</span><h1>상품 카테고리</h1><p>두고푸드 7개 대카테고리와 상품 수를 관리합니다.</p></div></div><div className="category-admin-grid">{(["domestic", "overseas"] as const).map((type) => <section className="admin-card" key={type}><div className="card-heading"><Truck size={19} /><div><h2>{type === "domestic" ? "국내배송" : "해외배송"}</h2><p>{data.categories.filter((item) => item.shippingType === type).length}개 카테고리</p></div></div><div className="category-admin-list">{data.categories.filter((item) => item.shippingType === type).map((category) => <div key={category.id}><span>{category.name}</span><small>상품 {category.productCount ?? data.products.filter((item) => item.categoryId === category.id).length}개</small><button onClick={() => void remove(category)} aria-label={`${category.name} 삭제`}><Trash2 size={15} /></button></div>)}</div></section>)}</div><form className="admin-card inline-create" onSubmit={create}><div><h2>카테고리 추가</h2><p>새 분류를 배송유형에 연결합니다.</p></div><select value={shippingType} onChange={(event) => setShippingType(event.target.value as ShippingType)}><option value="domestic">국내배송</option><option value="overseas">해외배송</option></select><input value={name} onChange={(event) => setName(event.target.value)} placeholder="카테고리명" required /><button className="primary-action" type="submit"><Plus size={16} /> 추가</button></form></>;
}

function NoticesAdmin({ data, refresh }: { data: AdminCatalogData; refresh: () => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [editingNoticeId, setEditingNoticeId] = useState<string | null>(null);
  const [noticeImageBusy, setNoticeImageBusy] = useState(false);
  const noticeImageInputRef = useRef<HTMLInputElement>(null);
  const [guide, setGuide] = useState<GuideContent>(() => parseGuide(data.settings.guide_sections));
  const [savingGuide, setSavingGuide] = useState(false);
  useEffect(() => {
    setGuide(parseGuide(data.settings.guide_sections));
  }, [data.settings.guide_sections]);
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const response = await apiFetch(editingNoticeId ? `/catalog/admin/notices/${editingNoticeId}` : "/catalog/admin/notices", { method: editingNoticeId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, content, imageUrl: imageUrl || null, youtubeUrl: youtubeUrl || null, isPinned: editingNoticeId ? data.notices.find((notice) => notice.id === editingNoticeId)?.isPinned : false, isActive: true }) });
    if (!response.ok) return;
    setTitle(""); setContent(""); setImageUrl(""); setYoutubeUrl(""); setEditingNoticeId(null);
    toast.success(editingNoticeId ? "공지를 수정했습니다." : "공지를 등록했습니다.");
    await refresh();
  };
  const toggle = async (notice: Notice) => {
    const response = await apiFetch(`/catalog/admin/notices/${notice.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: notice.title, content: notice.content, imageUrl: notice.imageUrl || null, youtubeUrl: notice.youtubeUrl || null, isPinned: notice.isPinned, isActive: !notice.isActive }) });
    if (response.ok) await refresh();
  };
  const uploadNoticeImage = async (file: File) => {
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast.error("공지 이미지는 JPEG 또는 PNG만 업로드할 수 있습니다.");
      return;
    }
    if (file.size >= 5 * 1024 * 1024) {
      toast.error("공지 이미지는 5MB 미만만 업로드할 수 있습니다.");
      return;
    }
    setNoticeImageBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await apiFetch("/catalog/admin/products/image-upload", { method: "POST", body: form });
      const payload = await readData<{ file: { downloadUrl: string } }>(response);
      setImageUrl(payload.file.downloadUrl);
      toast.success("공지 이미지를 업로드했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "공지 이미지 업로드에 실패했습니다.");
    } finally {
      setNoticeImageBusy(false);
      if (noticeImageInputRef.current) noticeImageInputRef.current.value = "";
    }
  };
  const saveGuide = async () => {
    setSavingGuide(true);
    try {
      const response = await apiFetch("/catalog/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "guide_sections", value: JSON.stringify(guide) }) });
      if (!response.ok) return;
      toast.success("필독사항과 FAQ를 저장했습니다.");
      await refresh();
    } finally {
      setSavingGuide(false);
    }
  };
  const updateStringList = (key: "highlights" | "orderMethod" | "csRules", index: number, value: string) => {
    setGuide({ ...guide, [key]: guide[key].map((item, itemIndex) => itemIndex === index ? value : item) });
  };
  const removeStringList = (key: "highlights" | "orderMethod" | "csRules", index: number) => {
    setGuide({ ...guide, [key]: guide[key].filter((_, itemIndex) => itemIndex !== index) });
  };
  return (
    <>
      <div className="admin-page-heading"><div><span>CONTENT</span><h1>공지 · 필독사항</h1><p>공개 페이지의 공지, 발주 안내, CS 기준과 FAQ를 모두 관리합니다.</p></div><button className="primary-action" onClick={() => void saveGuide()} disabled={savingGuide}><Save size={16} /> {savingGuide ? "저장 중…" : "전체 안내 저장"}</button></div>
      <div className="notice-admin-grid">
        <section className="admin-card notice-manager"><div className="card-heading"><Bell size={19} /><div><h2>{editingNoticeId ? "공지 수정" : "공지 등록"}</h2><p>텍스트·이미지·YouTube 주소를 함께 저장합니다.</p></div></div><form className="stack-form" onSubmit={create}><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="공지 제목" required /><textarea value={content} onChange={(event) => setContent(event.target.value)} rows={5} placeholder="공지 내용" required /><input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="공지 이미지 URL (선택)" /><div className="image-upload-row"><button type="button" onClick={() => noticeImageInputRef.current?.click()} disabled={noticeImageBusy}><Upload size={14} /> {noticeImageBusy ? "업로드 중…" : "공지 이미지 업로드"}</button><input ref={noticeImageInputRef} type="file" accept="image/jpeg,image/png" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadNoticeImage(file); }} />{imageUrl && <img src={imageUrl} alt="공지 이미지 미리보기" />}</div><input value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} inputMode="url" placeholder="YouTube 영상 URL (youtu.be 또는 youtube.com)" /><small className="notice-youtube-help">공개 팝업에는 공지 제목 → YouTube 영상 → 본문 순서로 표시됩니다.</small><div className="notice-form-actions"><button className="primary-action" type="submit"><Plus size={16} /> {editingNoticeId ? "공지 수정" : "공지 등록"}</button>{editingNoticeId && <button type="button" onClick={() => { setEditingNoticeId(null); setTitle(""); setContent(""); setImageUrl(""); setYoutubeUrl(""); }}>취소</button>}</div></form><div className="admin-notice-list">{data.notices.map((notice) => <div key={notice.id}><span className={`status-pill ${notice.isActive ? "active" : ""}`}>{notice.isActive ? "노출" : "숨김"}</span><div><strong>{notice.title}</strong><small>{notice.content}</small>{notice.youtubeUrl && <em className="notice-media-chip">YouTube 포함</em>}</div><div className="notice-row-actions"><button onClick={() => { setEditingNoticeId(notice.id); setTitle(notice.title); setContent(notice.content); setImageUrl(notice.imageUrl || ""); setYoutubeUrl(notice.youtubeUrl || ""); }}>수정</button><button onClick={() => void toggle(notice)}>{notice.isActive ? "숨기기" : "노출"}</button></div></div>)}</div></section>
        <div className="guide-editor-stack">
          <section className="admin-card guide-editor-card">
            <div className="card-heading"><ClipboardList size={19} /><div><h2>상단 필독 문구</h2><p>필독사항 첫 화면에서 가장 강조되는 문구입니다.</p></div></div>
            <div className="repeat-editor">{guide.highlights.map((item, index) => <div key={`highlight-${index}`}><input value={item} onChange={(event) => updateStringList("highlights", index, event.target.value)} /><button onClick={() => removeStringList("highlights", index)} aria-label="필독 문구 삭제"><Trash2 size={15} /></button></div>)}</div>
            <button className="add-line" onClick={() => setGuide({ ...guide, highlights: [...guide.highlights, ""] })}><Plus size={15} /> 문구 추가</button>
          </section>
          <section className="admin-card guide-editor-card">
            <div className="card-heading"><Truck size={19} /><div><h2>발주 정보</h2><p>발주 마감, 송장, 발주 원칙 등의 항목을 편집합니다.</p></div></div>
            <div className="pair-editor">{guide.orderInfo.map((item, index) => <div key={`order-info-${index}`}><input value={item.label} onChange={(event) => setGuide({ ...guide, orderInfo: guide.orderInfo.map((row, rowIndex) => rowIndex === index ? { ...row, label: event.target.value } : row) })} placeholder="항목명" /><textarea value={item.value} onChange={(event) => setGuide({ ...guide, orderInfo: guide.orderInfo.map((row, rowIndex) => rowIndex === index ? { ...row, value: event.target.value } : row) })} rows={2} placeholder="내용" /><button onClick={() => setGuide({ ...guide, orderInfo: guide.orderInfo.filter((_, rowIndex) => rowIndex !== index) })} aria-label="발주 정보 삭제"><Trash2 size={15} /></button></div>)}</div>
            <button className="add-line" onClick={() => setGuide({ ...guide, orderInfo: [...guide.orderInfo, { label: "", value: "" }] })}><Plus size={15} /> 발주 정보 추가</button>
          </section>
          <section className="admin-card guide-editor-card">
            <div className="card-heading"><Boxes size={19} /><div><h2>발주 방법</h2><p>공개 페이지에 순서대로 표시됩니다.</p></div></div>
            <div className="repeat-editor numbered">{guide.orderMethod.map((item, index) => <div key={`method-${index}`}><span>{index + 1}</span><input value={item} onChange={(event) => updateStringList("orderMethod", index, event.target.value)} /><button onClick={() => removeStringList("orderMethod", index)} aria-label="발주 방법 삭제"><Trash2 size={15} /></button></div>)}</div>
            <button className="add-line" onClick={() => setGuide({ ...guide, orderMethod: [...guide.orderMethod, ""] })}><Plus size={15} /> 단계 추가</button>
          </section>
          <section className="admin-card guide-editor-card">
            <div className="card-heading"><CircleHelp size={19} /><div><h2>CS 안내</h2><p>접수 기준, 접수 방법과 처리 규칙을 관리합니다.</p></div></div>
            <div className="stack-form"><label>접수 기준<input value={guide.csSummary} onChange={(event) => setGuide({ ...guide, csSummary: event.target.value })} /></label><label>접수 방법<textarea rows={3} value={guide.csHow} onChange={(event) => setGuide({ ...guide, csHow: event.target.value })} /></label></div>
            <div className="repeat-editor">{guide.csRules.map((item, index) => <div key={`rule-${index}`}><input value={item} onChange={(event) => updateStringList("csRules", index, event.target.value)} /><button onClick={() => removeStringList("csRules", index)} aria-label="CS 규칙 삭제"><Trash2 size={15} /></button></div>)}</div>
            <button className="add-line" onClick={() => setGuide({ ...guide, csRules: [...guide.csRules, ""] })}><Plus size={15} /> CS 규칙 추가</button>
          </section>
          <section className="admin-card guide-editor-card">
            <div className="card-heading"><ClipboardList size={19} /><div><h2>기타 안내</h2><p>세금계산서, 상품 이미지, 배송비 등의 안내입니다.</p></div></div>
            <div className="pair-editor">{guide.etc.map((item, index) => <div key={`etc-${index}`}><input value={item.label} onChange={(event) => setGuide({ ...guide, etc: guide.etc.map((row, rowIndex) => rowIndex === index ? { ...row, label: event.target.value } : row) })} placeholder="항목명" /><textarea value={item.value} onChange={(event) => setGuide({ ...guide, etc: guide.etc.map((row, rowIndex) => rowIndex === index ? { ...row, value: event.target.value } : row) })} rows={2} placeholder="내용" /><button onClick={() => setGuide({ ...guide, etc: guide.etc.filter((_, rowIndex) => rowIndex !== index) })} aria-label="기타 안내 삭제"><Trash2 size={15} /></button></div>)}</div>
            <button className="add-line" onClick={() => setGuide({ ...guide, etc: [...guide.etc, { label: "", value: "" }] })}><Plus size={15} /> 기타 안내 추가</button>
          </section>
          <section className="admin-card guide-editor-card faq-editor-card">
            <div className="card-heading"><CircleHelp size={19} /><div><h2>FAQ 편집</h2><p>질문과 답변을 추가하거나 삭제할 수 있습니다.</p></div></div>
            <div className="faq-editor-list">{guide.faq.map((item, index) => <article key={`faq-${index}`}><div className="faq-editor-number">Q{index + 1}</div><label>질문<input value={item.q} onChange={(event) => setGuide({ ...guide, faq: guide.faq.map((row, rowIndex) => rowIndex === index ? { ...row, q: event.target.value } : row) })} /></label><label>답변<textarea rows={3} value={item.a} onChange={(event) => setGuide({ ...guide, faq: guide.faq.map((row, rowIndex) => rowIndex === index ? { ...row, a: event.target.value } : row) })} /></label><button onClick={() => setGuide({ ...guide, faq: guide.faq.filter((_, rowIndex) => rowIndex !== index) })} aria-label={`${index + 1}번 FAQ 삭제`}><Trash2 size={15} /></button></article>)}</div>
            <button className="add-line" onClick={() => setGuide({ ...guide, faq: [...guide.faq, { q: "", a: "" }] })}><Plus size={15} /> FAQ 추가</button>
          </section>
        </div>
      </div>
    </>
  );
}

function HistoryAdmin({ data }: { data: AdminCatalogData }) {
  const [historyData, setHistoryData] = useState<AdminCatalogData>(data);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("all");
  const [pageSize, setPageSize] = useState(5);
  const [page, setPage] = useState(1);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    void apiFetch("/catalog/admin/history", { silent: true })
      .then(async (response) => {
        if (!response.ok) return;
        const next = await readData<AdminCatalogData>(response);
        if (active) setHistoryData(next);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    void apiFetch("/catalog/admin/groups", { silent: true })
      .then(async (response) => {
        if (!response.ok) return;
        const next = await readData<{ groups: ProductGroup[] }>(response);
        if (active) setGroups(next.groups);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const grouped = useMemo<HistoryAdminGroup[]>(() => {
    const groups = new Map<string, HistoryAdminGroup>();
    historyData.priceHistory.forEach((history) => {
      const key = `${history.productId}|${history.optionId || "base"}|${history.changedAt}`;
      const current = groups.get(key);
      if (current) current.changes.push(history);
      else groups.set(key, {
        key,
        productId: history.productId,
        productName: history.productName,
        optionName: history.optionName,
        changedAt: history.changedAt,
        changes: [history]
      });
    });
    return Array.from(groups.values()).sort((first, second) => second.changedAt.localeCompare(first.changedAt));
  }, [historyData.priceHistory]);

  const filtered = useMemo(() => grouped.filter((history) => {
    const haystack = `${history.productName} ${history.optionName || ""} ${history.changes.map((change) => priceFieldLabel(change.field)).join(" ")}`.toLowerCase();
    const monthValue = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", month: "2-digit" }).format(new Date(history.changedAt.includes("T") ? history.changedAt : `${history.changedAt.replace(" ", "T")}Z`));
    return (!query.trim() || haystack.includes(query.trim().toLowerCase())) && (month === "all" || monthValue === month.padStart(2, "0"));
  }), [grouped, month, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => { setPage(1); }, [query, month, pageSize]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  const groupByProductId = useMemo(() => {
    const mapping = new Map<string, ProductGroup>();
    groups.forEach((group) => group.items.forEach((item) => mapping.set(item.productId, group)));
    return mapping;
  }, [groups]);

  const historySections = useMemo(() => {
    const sections = new Map<string, { id: string; title: string; imageUrl: string | null; isBundle: boolean; histories: HistoryAdminGroup[] }>();
    paged.forEach((history) => {
      const group = groupByProductId.get(history.productId);
      const id = group?.id ?? "ungrouped";
      const current = sections.get(id);
      if (current) {
        current.histories.push(history);
      } else {
        sections.set(id, {
          id,
          title: group?.name ?? "일반 상품 변경",
          imageUrl: group?.imageUrl ?? history.changes[0]?.productImageUrl ?? null,
          isBundle: Boolean(group),
          histories: [history]
        });
      }
    });
    return Array.from(sections.values()).sort((first, second) => Number(second.isBundle) - Number(first.isBundle));
  }, [groupByProductId, paged]);

  const renderHistoryRow = (history: HistoryAdminGroup) => {
    const increased = history.changes.some((change) => change.newPrice > change.oldPrice);
    const decreased = history.changes.some((change) => change.newPrice < change.oldPrice);
    const tone = increased && !decreased ? "increase" : !increased && decreased ? "decrease" : "mixed";
    return (
      <tr className={tone} key={history.key}>
        <td data-label="변경일시">{formatDateTime(history.changedAt)}</td>
        <td data-label="상품·옵션" className="history-product-cell"><span className="history-product-image">{history.changes[0]?.productImageUrl ? <img src={history.changes[0].productImageUrl} alt="" /> : <Boxes size={16} />}</span><span><strong>{history.productName}</strong>{history.optionName ? <small>{history.optionName}</small> : null}</span></td>
        <td data-label="변경 항목"><div className="history-change-stack">{history.changes.map((change) => <span className={`status-pill ${change.newPrice > change.oldPrice ? "increase" : "decrease"}`} key={change.id}>{priceFieldLabel(change.field)} {change.newPrice > change.oldPrice ? "인상" : "인하"}</span>)}</div></td>
        <td data-label="이전 가격"><div className="history-change-stack">{history.changes.map((change) => <del key={change.id}>{formatPrice(change.oldPrice)}</del>)}</div></td>
        <td data-label="변경 가격"><div className="history-change-stack">{history.changes.map((change) => <b className="history-new-price" key={change.id}>{formatPrice(change.newPrice)}</b>)}</div></td>
        <td data-label="증감액"><div className="history-change-stack">{history.changes.map((change) => { const increasedChange = change.newPrice > change.oldPrice; return <strong className={`history-difference ${increasedChange ? "increase" : "decrease"}`} key={change.id}>{increasedChange ? <ArrowUp size={14} /> : <ArrowDown size={14} />}{formatPrice(Math.abs(change.newPrice - change.oldPrice))}</strong>; })}</div></td>
        <td data-label="관리자">{history.changes[0]?.changedBy || "-"}</td>
      </tr>
    );
  };

  return (
    <>
      <div className="admin-page-heading"><div><span>AUDIT LOG</span><h1>가격변동 이력</h1><p>한 번의 저장에서 여러 가격이 바뀌어도 상품·옵션별로 한 건으로 묶어 표시합니다.</p></div></div>
      <section className="admin-card">
        {historyLoading ? <div className="admin-loading inline compact"><div className="spinner" /><span>가격변동 이력을 불러오는 중…</span></div> : <>
          <div className="history-filter-toolbar"><div className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="상품명·옵션명 검색" /></div><select value={month} onChange={(event) => setMonth(event.target.value)}><option value="all">전체 월</option>{Array.from({ length: 12 }, (_, index) => index + 1).map((value) => <option key={value} value={String(value)}>{value}월</option>)}</select><label className="page-size-select">페이지당 <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} aria-label="가격변동 이력 페이지당 표시 수"><option value={5}>5개</option><option value={10}>10개</option><option value={20}>20개</option></select></label><span>{filtered.length}건</span></div>
          <div className="history-group-list">
            {historySections.map((section) => {
              const expanded = expandedGroups[section.id] ?? false;
              return <section className={`history-group-card ${expanded ? "open" : ""}`} key={section.id}>
                <button type="button" className="history-group-heading" onClick={() => setExpandedGroups((state) => ({ ...state, [section.id]: !expanded }))} aria-expanded={expanded}>
                  <span className="history-group-image">{section.imageUrl ? <img src={section.imageUrl} alt="" /> : <Boxes size={18} />}</span>
                  <span><small>{section.isBundle ? "묶음상품" : "일반 상품"}</small><strong>{section.title}</strong><em>{section.histories.length}건의 가격변동</em></span>
                  <ChevronDown size={18} />
                </button>
                {expanded && <div className="history-group-body"><div className="admin-table-wrap history-admin-wrap"><table className="admin-table history-admin-table"><thead><tr><th>변경일시</th><th>상품·옵션</th><th>변경 항목</th><th>이전 가격</th><th>변경 가격</th><th>증감액</th><th>관리자</th></tr></thead><tbody>{section.histories.map(renderHistoryRow)}</tbody></table></div></div>}
              </section>;
            })}
            {historySections.length === 0 && <div className="empty-admin">조건에 맞는 가격변동 이력이 없습니다.</div>}
          </div>
          {filtered.length > 0 && <div className="catalog-pagination admin-history-pagination"><span>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)}개 <small>/ 총 {filtered.length}건</small></span><nav aria-label="가격변동 이력 페이지"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1} aria-label="이전 가격변동 이력 페이지"><ChevronLeft size={15} /></button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((value) => <button type="button" className={value === currentPage ? "active" : ""} key={value} onClick={() => setPage(value)}>{value}</button>)}<button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount} aria-label="다음 가격변동 이력 페이지"><ChevronRight size={15} /></button></nav></div>}
        </>}
      </section>
    </>
  );
}

type HistoryAdminGroup = {
  key: string;
  productId: string;
  productName: string;
  optionName: string | null;
  changedAt: string;
  changes: PriceHistory[];
};

function SourcingAdmin({ data, refresh }: { data: AdminCatalogData; refresh: () => Promise<void> }) {
  const [sourcingData, setSourcingData] = useState<AdminCatalogData>(data);
  const [sourcingLoading, setSourcingLoading] = useState(data.sourcingRequests.length === 0);
  const [kind, setKind] = useState<"sourcing" | "partner">("sourcing");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | SourcingRequest["status"]>("all");
  const [selectedRequest, setSelectedRequest] = useState<SourcingRequest | null>(null);
  const [pageSize, setPageSize] = useState(5);
  const [page, setPage] = useState(1);
  const loadSourcing = async () => {
    setSourcingLoading(true);
    try {
      const response = await apiFetch("/catalog/admin/sourcing", { silent: true });
      if (response.ok) setSourcingData(await readData<AdminCatalogData>(response));
    } finally {
      setSourcingLoading(false);
    }
  };
  useEffect(() => { void loadSourcing(); }, []);

  const statusLabel = (value: SourcingRequest["status"]) => (
    value === "received" ? "접수" : value === "reviewing" ? "검토중" : "완료"
  );

  const typeOf = (request: SourcingRequest) => request.requestType ?? "sourcing";
  const kindRequests = useMemo(() => sourcingData.sourcingRequests.filter((request) => typeOf(request) === kind), [sourcingData.sourcingRequests, kind]);
  const requestNumber = useMemo(() => new Map(kindRequests.map((request, index) => [request.id, `${kind === "partner" ? "PT" : "SR"}-${String(kindRequests.length - index).padStart(4, "0")}`])), [kindRequests, kind]);
  const filtered = useMemo(() => kindRequests.filter((request) => {
    const keyword = query.trim().toLowerCase();
    const matchesQuery = !keyword || `${request.productName} ${request.requesterName} ${request.contact} ${request.desiredPrice || ""} ${request.details || ""} ${request.companyName || ""} ${request.email || ""} ${request.businessType || ""}`.toLowerCase().includes(keyword);
    return matchesQuery && (status === "all" || request.status === status);
  }), [kindRequests, query, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedRequests = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  useEffect(() => {
    setPage(1);
  }, [query, status, pageSize, kind]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const counts = {
    all: kindRequests.length,
    received: kindRequests.filter((request) => request.status === "received").length,
    reviewing: kindRequests.filter((request) => request.status === "reviewing").length,
    completed: kindRequests.filter((request) => request.status === "completed").length
  };
  const kindCounts = {
    sourcing: sourcingData.sourcingRequests.filter((request) => typeOf(request) === "sourcing").length,
    partner: sourcingData.sourcingRequests.filter((request) => typeOf(request) === "partner").length
  };
  const mailLabel = (value: SourcingRequest["emailStatus"]) => value === "sent" ? "안내 메일 발송" : value === "failed" ? "메일 발송 실패" : value === "skipped" ? "메일 미발송" : "-";
  const isPartner = kind === "partner";

  const update = async (request: SourcingRequest, status: SourcingRequest["status"]) => {
    const response = await apiFetch(`/catalog/admin/sourcing/${request.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!response.ok) return;
    toast.success("처리 상태를 변경했습니다.");
    setSelectedRequest((current) => current?.id === request.id ? { ...current, status, updatedAt: new Date().toISOString() } : current);
    await Promise.all([loadSourcing(), refresh()]);
  };
  return (
    <>
      <div className="admin-page-heading"><div><span>PARTNER & SOURCING</span><h1>입점·소싱 요청</h1><p>소싱 요청과 입점 신청을 탭으로 나눠 확인하고, 상세 팝업에서 처리 상태를 관리합니다.</p></div></div>
      <div className="request-kind-tabs" role="tablist" aria-label="요청 종류">
        <button type="button" role="tab" aria-selected={kind === "sourcing"} className={kind === "sourcing" ? "active" : ""} onClick={() => { setKind("sourcing"); setStatus("all"); }}><PackagePlus size={17} /> 소싱 요청 <small>{kindCounts.sourcing}</small></button>
        <button type="button" role="tab" aria-selected={kind === "partner"} className={kind === "partner" ? "active" : ""} onClick={() => { setKind("partner"); setStatus("all"); }}><Store size={17} /> 입점 신청 <small>{kindCounts.partner}</small></button>
      </div>
      <section className="admin-card request-board-card">
        <div className="request-board-toolbar">
          <div className="request-status-tabs" aria-label="소싱 요청 상태 필터">
            {([
              ["all", "전체"],
              ["received", "접수"],
              ["reviewing", "검토중"],
              ["completed", "완료"]
            ] as const).map(([value, label]) => (
              <button className={status === value ? "active" : ""} key={value} onClick={() => setStatus(value)}>
                {label}<small>{counts[value]}</small>
              </button>
            ))}
          </div>
          <div className="request-board-controls"><div className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isPartner ? "업체명·상품·담당자·이메일 검색" : "상품명·요청자·연락처 검색"} /></div><label className="page-size-select">페이지당 <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} aria-label="소싱 요청 페이지당 표시 수"><option value={5}>5개</option><option value={10}>10개</option><option value={20}>20개</option></select></label></div>
        </div>
        {sourcingLoading ? <div className="admin-loading inline compact"><div className="spinner" /><span>소싱 요청을 불러오는 중…</span></div> : kindRequests.length === 0 ? (
          <div className="empty-admin"><ClipboardList size={28} /><strong>{isPartner ? "접수된 입점 신청이 없습니다." : "접수된 소싱 요청이 없습니다."}</strong></div>
        ) : filtered.length === 0 ? (
          <div className="empty-admin"><Search size={28} /><strong>검색 조건에 맞는 요청이 없습니다.</strong></div>
        ) : (
          <div className="request-board-scroll">
            <table className="request-board-table">
              {isPartner
                ? <thead><tr><th>접수번호</th><th>상태</th><th>업체·주요 상품</th><th>업종</th><th>담당자</th><th>핸드폰 번호</th><th>이메일</th><th>접수일</th><th>관리</th></tr></thead>
                : <thead><tr><th>접수번호</th><th>상태</th><th>요청 상품·내용</th><th>요청자</th><th>핸드폰 번호</th><th>희망가</th><th>접수일</th><th>관리</th></tr></thead>}
              <tbody>
                {pagedRequests.map((request, index) => (
                  <tr key={request.id} tabIndex={0} onClick={() => setSelectedRequest(request)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedRequest(request); }}>
                    <td data-label="접수번호"><span className="request-number">{requestNumber.get(request.id)}</span></td>
                    <td data-label="상태"><span className={`request-status ${request.status}`}>{statusLabel(request.status)}</span></td>
                    {isPartner ? <>
                      <td data-label="업체·주요 상품"><div className="request-product"><strong>{request.companyName || "-"}</strong><small>{request.productName}</small></div></td>
                      <td data-label="업종"><span className="request-type-chip">{request.businessType || "-"}</span></td>
                      <td data-label="담당자"><strong>{request.requesterName}</strong></td>
                      <td data-label="핸드폰 번호"><a className="request-contact" href={`tel:${request.contact.replace(/[^0-9+]/g, "")}`} onClick={(event) => event.stopPropagation()}>{request.contact}</a></td>
                      <td data-label="이메일"><div className="request-email"><a href={`mailto:${request.email ?? ""}`} onClick={(event) => event.stopPropagation()}>{request.email || "-"}</a><small className={`mail-status ${request.emailStatus ?? ""}`}>{mailLabel(request.emailStatus)}</small></div></td>
                    </> : <>
                      <td data-label="요청 상품"><div className="request-product"><strong>{request.productName}</strong><small>{request.details || "상세 요청 없음"}</small></div></td>
                      <td data-label="요청자"><strong>{request.requesterName}</strong></td>
                      <td data-label="핸드폰 번호"><a className="request-contact" href={`tel:${request.contact.replace(/[^0-9+]/g, "")}`}>{request.contact}</a></td>
                      <td data-label="희망가">{request.desiredPrice || "-"}</td>
                    </>}
                    <td data-label="접수일">{request.createdAt.slice(0, 10)}</td>
                    <td data-label="관리"><button className="request-board-action" onClick={(event) => { event.stopPropagation(); setSelectedRequest(request); }}>상세보기 <ChevronRight size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > 0 && <div className="catalog-pagination admin-request-pagination"><span>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)}개 <small>/ 총 {filtered.length}개</small></span><nav aria-label="소싱 요청 페이지"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1} aria-label="이전 소싱 요청 페이지"><ChevronLeft size={15} /></button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((value) => <button type="button" className={value === currentPage ? "active" : ""} key={value} onClick={() => setPage(value)}>{value}</button>)}<button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount} aria-label="다음 소싱 요청 페이지"><ChevronRight size={15} /></button></nav></div>}
      </section>
      {selectedRequest && (
        <div className="editor-overlay" role="presentation" onMouseDown={() => setSelectedRequest(null)}>
          <section className="request-detail-modal" role="dialog" aria-modal="true" aria-labelledby="sourcing-detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="editor-header">
              <div><span>{typeOf(selectedRequest) === "partner" ? "PARTNER APPLICATION DETAIL" : "SOURCING REQUEST DETAIL"}</span><h2 id="sourcing-detail-title">{typeOf(selectedRequest) === "partner" ? selectedRequest.companyName || selectedRequest.productName : selectedRequest.productName}</h2></div>
              <button type="button" onClick={() => setSelectedRequest(null)} aria-label="소싱 요청 상세 닫기"><X size={21} /></button>
            </div>
            <dl className="request-detail-grid">
              <div><dt>현재 상태</dt><dd><span className={`request-status ${selectedRequest.status}`}>{statusLabel(selectedRequest.status)}</span></dd></div>
              <div><dt>접수일시</dt><dd>{selectedRequest.createdAt.slice(0, 16).replace("T", " ")}</dd></div>
              {typeOf(selectedRequest) === "partner" ? <>
                <div><dt>업종</dt><dd>{selectedRequest.businessType || "-"}</dd></div>
                <div><dt>주요 상품</dt><dd>{selectedRequest.productName}</dd></div>
                <div><dt>담당자</dt><dd>{selectedRequest.requesterName}</dd></div>
                <div><dt>연락처</dt><dd><a href={`tel:${selectedRequest.contact.replace(/[^0-9+]/g, "")}`}>{selectedRequest.contact}</a></dd></div>
                <div><dt>이메일</dt><dd>{selectedRequest.email ? <a href={`mailto:${selectedRequest.email}`}>{selectedRequest.email}</a> : "-"}</dd></div>
                <div><dt>자동 안내 메일</dt><dd>{mailLabel(selectedRequest.emailStatus)}{selectedRequest.emailSentAt ? ` · ${selectedRequest.emailSentAt.slice(0, 16).replace("T", " ")}` : ""}</dd></div>
                <div><dt>홈페이지·스토어</dt><dd>{selectedRequest.referenceUrl ? <a href={selectedRequest.referenceUrl} target="_blank" rel="noreferrer">링크 열기</a> : "-"}</dd></div>
              </> : <>
                <div><dt>요청자</dt><dd>{selectedRequest.requesterName}</dd></div>
                <div><dt>연락처</dt><dd>{selectedRequest.contact}</dd></div>
                <div><dt>희망 공급가</dt><dd>{selectedRequest.desiredPrice || "-"}</dd></div>
                <div><dt>참고 URL</dt><dd>{selectedRequest.referenceUrl ? <a href={selectedRequest.referenceUrl} target="_blank" rel="noreferrer">참고 링크 열기</a> : "-"}</dd></div>
              </>}
            </dl>
            <p className="request-detail-note">{selectedRequest.details || (typeOf(selectedRequest) === "partner" ? "업체·상품 소개가 입력되지 않았습니다." : "상세 요청이 입력되지 않았습니다.")}</p>
            <div className="request-detail-actions">
              {([
                ["received", "접수"],
                ["reviewing", "검토중"],
                ["completed", "완료"]
              ] as const).map(([value, label]) => (
                <button className={selectedRequest.status === value ? "active" : ""} key={value} onClick={() => void update(selectedRequest, value)}>{label}</button>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

const syncActionLabels: Record<string, string> = {
  create: "신규 상품",
  update: "상품 정보",
  price: "가격",
  visibility: "노출 상태",
  soldout: "품절 상태",
  delete: "상품 삭제",
  image: "이미지"
};

const syncStatusLabels: Record<string, string> = {
  blocked: "연동 필요",
  pending: "전송가능",
  processing: "전송중",
  succeeded: "전송완료",
  completed: "전송완료",
  failed: "전송실패",
  running: "전송중"
};

function syncStatusLabel(status: string) {
  return syncStatusLabels[status] || status;
}

function ChangeQueueAdmin({ mode }: { mode: "changes" | "transmissions" }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<CatalogSyncOutboxItem[]>([]);
  const [runs, setRuns] = useState<CatalogSyncRun[]>([]);
  const [overview, setOverview] = useState<CatalogSyncOverview | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedFailure, setSelectedFailure] = useState<CatalogSyncOutboxItem | null>(null);
  const [selectedFailureSummary, setSelectedFailureSummary] = useState<CatalogSyncRun | null>(null);
  const load = async () => {
    setLoading(true);
    try {
      const response = await apiFetch("/catalog/admin/sync");
      const payload = await readData<{ overview: CatalogSyncOverview; runs: CatalogSyncRun[]; outbox: CatalogSyncOutboxItem[] }>(response);
      setOverview(payload.overview);
      setItems(payload.outbox);
      setRuns(payload.runs);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);
  const filtered = items.filter((item) => !query.trim() || `${item.productName || ""} ${item.action}`.toLowerCase().includes(query.trim().toLowerCase()));

  if (mode === "transmissions") {
    return <>
      <div className="admin-page-heading"><div><span>TRANSMISSION LOG</span><h1>상품 변경완료</h1><p>발주오라로 보낸 실행과 성공·실패·보류 결과를 확인합니다.</p></div><button className="outline-button" onClick={() => void load()}><History size={15} /> 새로고침</button></div>
      <section className="admin-card sync-explainer-card"><div className="card-heading"><ShieldCheck size={19} /><div><h2>{overview?.writeIntegration.account ? `${overview.writeIntegration.account} 계정` : "연결된 발주오라 계정 없음"}</h2><p>{overview?.writeIntegration.reason || "연동 상태를 확인하고 있습니다."}</p></div><span className={`sync-safe-badge ${overview?.writeIntegration.status === "connected" ? "connected" : ""}`}>{overview?.writeIntegration.status === "connected" ? "실시간 연동중" : "추가 인증 필요"}</span></div></section>
      <section className="admin-card">
        <div className="card-heading"><History size={19} /><div><h2>실행 이력</h2><p>영문 상태 대신 실제 전송 결과를 한국어로 표시합니다.</p></div></div>
        {loading ? <div className="admin-loading inline"><div className="spinner" /></div> : runs.length === 0 ? <div className="empty-admin">전송 실행 내역이 없습니다.</div> : <div className="admin-table-wrap"><table className="admin-table stackable-table"><thead><tr><th>실행 시각</th><th>방향</th><th>트리거</th><th>전체</th><th>성공</th><th>실패/충돌</th><th>상태</th></tr></thead><tbody>{runs.map((run) => { const successCount = Math.max(0, run.total - run.failedCount - run.conflictCount); return <tr key={run.id}><td data-label="실행 시각">{formatDateTime(run.startedAt)}</td><td data-label="방향">{run.direction === "push" ? "두고푸드 → 발주오라" : "발주오라 → 두고푸드"}</td><td data-label="트리거">{run.trigger}</td><td data-label="전체">{run.total.toLocaleString("ko-KR")}</td><td data-label="성공"><strong className="transmission-success-count">{successCount.toLocaleString("ko-KR")} / {run.total.toLocaleString("ko-KR")} 성공</strong></td><td data-label="실패/충돌">{run.failedCount > 0 || run.conflictCount > 0 ? <button type="button" className="transmission-failure-summary" onClick={() => setSelectedFailureSummary(run)}>{run.failedCount + run.conflictCount}건 상세 보기</button> : "0건"}</td><td data-label="상태"><span className={`status-pill ${run.status === "completed" ? "active" : run.status === "failed" ? "danger" : "pending"}`}>{syncStatusLabel(run.status)}</span></td></tr>; })}</tbody></table></div>}
      </section>
      <section className="admin-card">
        <div className="card-heading"><ClipboardList size={19} /><div><h2>상품별 전송 상태</h2><p>전송실패 행을 누르면 상세 사유를 확인할 수 있습니다.</p></div></div>
        {items.length === 0 ? <div className="empty-admin">상품 전송 내역이 없습니다.</div> : <div className="admin-table-wrap"><table className="admin-table transmission-item-table stackable-table"><thead><tr><th>기록 시각</th><th>상품</th><th>작업</th><th>상태</th><th>처리 시각</th></tr></thead><tbody>{items.map((item) => <tr className={item.status === "failed" ? "failure-row" : ""} key={item.id} onClick={() => { if (item.status === "failed") setSelectedFailure(item); }}><td data-label="기록 시각">{formatDateTime(item.createdAt)}</td><td data-label="상품"><strong>{item.productName || item.productId}</strong></td><td data-label="작업">{syncActionLabels[item.action] || item.action}</td><td data-label="상태"><span className={`status-pill ${item.status === "succeeded" ? "active" : item.status === "failed" ? "danger" : "pending"}`}>{syncStatusLabel(item.status)}</span></td><td data-label="처리 시각">{item.processedAt ? formatDateTime(item.processedAt) : "-"}</td></tr>)}</tbody></table></div>}
      </section>
      {selectedFailure && <div className="editor-overlay" role="presentation" onMouseDown={() => setSelectedFailure(null)}><section className="sync-failure-modal" role="dialog" aria-modal="true" aria-labelledby="sync-failure-title" onMouseDown={(event) => event.stopPropagation()}><div className="editor-header"><div><span>TRANSMISSION FAILED</span><h2 id="sync-failure-title">전송실패 사유</h2></div><button type="button" onClick={() => setSelectedFailure(null)} aria-label="닫기"><X size={21} /></button></div><strong>{selectedFailure.productName || selectedFailure.productId}</strong><p>{selectedFailure.lastError || "발주오라에서 상세 실패 사유를 반환하지 않았습니다."}</p><button className="primary-action" type="button" onClick={() => setSelectedFailure(null)}>확인</button></section></div>}
      {selectedFailureSummary && <div className="editor-overlay" role="presentation" onMouseDown={() => setSelectedFailureSummary(null)}><section className="sync-failure-modal transmission-summary-modal" role="dialog" aria-modal="true" aria-labelledby="transmission-summary-title" onMouseDown={(event) => event.stopPropagation()}><div className="editor-header"><div><span>TRANSMISSION SUMMARY</span><h2 id="transmission-summary-title">실패 건 상세</h2></div><button type="button" onClick={() => setSelectedFailureSummary(null)} aria-label="닫기"><X size={21} /></button></div><p className="transmission-summary-copy">{Math.max(0, selectedFailureSummary.total - selectedFailureSummary.failedCount - selectedFailureSummary.conflictCount)} / {selectedFailureSummary.total}건 성공 · {selectedFailureSummary.failedCount + selectedFailureSummary.conflictCount}건 실패·충돌</p><div className="transmission-failure-list">{items.filter((item) => item.status === "failed").slice(0, 20).map((item) => <article key={item.id}><div><strong>{item.productName || item.productId}</strong><small>{syncActionLabels[item.action] || item.action}</small></div><p>{item.lastError || "상세 실패 사유가 반환되지 않았습니다."}</p><Link className="outline-button" to="/admin/products" onClick={() => setSelectedFailureSummary(null)}>상품 수정</Link></article>)}{items.filter((item) => item.status === "failed").length === 0 && <div className="empty-admin">실패 상세가 아직 동기화되지 않았습니다.</div>}</div><button className="primary-action" type="button" onClick={() => setSelectedFailureSummary(null)}>확인</button></section></div>}
    </>;
  }

  return <>
    <div className="admin-page-heading"><div><span>CHANGE QUEUE</span><h1>상품 변경전</h1><p>상품 등록·가격·품절·이미지·삭제 변경을 발주오라 전송 전에 검토합니다.</p></div><Link className="primary-action" to="/admin/transmissions"><Send size={16} /> 상품 변경완료 보기</Link></div>
    <section className="admin-card">
      <div className="admin-toolbar"><div className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="상품명·작업 검색" /></div><span>총 {filtered.length}건</span></div>
      {loading ? <div className="admin-loading inline"><div className="spinner" /></div> : filtered.length === 0 ? <div className="empty-admin">검토할 변경사항이 없습니다.</div> : <div className="admin-table-wrap"><table className="admin-table change-queue-table"><thead><tr><th>변경 시각</th><th>상품</th><th>변경 구분</th><th>주요 변경값</th><th>전송 상태</th><th>발주오라 전송</th></tr></thead><tbody>{filtered.map((item) => {
        const changes = Array.isArray(item.payload.changes) ? item.payload.changes as Array<{ field?: string; optionName?: string | null; before?: unknown; after?: unknown }> : [];
        const canTransmit = item.status === "pending" && overview?.writeIntegration.status === "connected";
        const transmit = async () => {
          if (!canTransmit) return;
          const response = await apiFetch(`/catalog/admin/sync/transmit/${item.id}`, { method: "POST" });
          if (!response.ok) {
            const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
            toast.error(payload?.error?.message || "상품 전송을 시작하지 못했습니다.");
            return;
          }
          toast.success("상품 변경을 전송했고, 상품 변경완료 탭으로 이동합니다.");
          navigate("/admin/transmissions");
        };
        return <tr key={item.id}><td>{formatDateTime(item.createdAt)}</td><td><strong>{item.productName || item.productId}</strong></td><td><span className="change-action-badge">{syncActionLabels[item.action] || item.action}</span></td><td>{changes.length > 0 ? changes.slice(0, 3).map((change, index) => <small key={index}>{change.optionName ? `${change.optionName} · ` : ""}{change.field}: {String(change.before ?? "-")} → {String(change.after ?? "-")}</small>) : <small>{item.action === "create" ? "신규 상품 전체 정보" : item.action === "delete" ? "상품 삭제 요청" : "상품 정보 변경"}</small>}</td><td><span className={`status-pill ${item.status === "succeeded" ? "active" : item.status === "failed" ? "danger" : "pending"}`}>{syncStatusLabel(item.status)}</span></td><td><button className="transmit-button" type="button" onClick={() => void transmit()} disabled={!canTransmit} title={canTransmit ? "발주오라로 전송 후 상품 변경완료 탭으로 이동" : overview?.writeIntegration.reason || "발주오라 연결 후 활성화됩니다."}><Send size={14} /> {canTransmit ? "수정 전송" : item.status === "succeeded" ? "전송완료" : item.status === "failed" ? "전송실패" : "연동 필요"}</button></td></tr>;
      })}</tbody></table></div>}
    </section>
  </>;
}

function SalesAdmin() {
  const today = new Date();
  const [month, setMonth] = useState(`${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`);
  const [data, setData] = useState<SalesOverview | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void apiFetch(`/catalog/admin/sales?month=${month}`).then((response) => readData<SalesOverview>(response)).then((value) => { if (active) setData(value); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month]);
  const [year, monthNumber] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const dayMap = new Map(data?.days.map((day) => [Number(day.date.slice(-2)), day]) ?? []);
  const cells = [...Array.from({ length: firstWeekday }, () => null), ...Array.from({ length: dayCount }, (_, index) => index + 1)];
  const moveMonth = (amount: number) => {
    const next = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
    setMonth(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  return <>
    <div className="admin-page-heading"><div><span>SALES CALENDAR</span><h1>매출 현황</h1><p>일별·월별 매출과 매입처별 순이익을 확인합니다.</p></div><span className={`source-status ${data?.sourceConnected ? "connected" : ""}`}>{data?.sourceStatus || "데이터 확인 중"}</span></div>
    <section className="sales-kpi-grid">
      <article><span>월 매출</span><strong>{formatPrice(data?.totals.revenue ?? 0)}</strong></article>
      <article><span>예상 순이익</span><strong>{formatPrice(data?.totals.profit ?? 0)}</strong></article>
      <article><span>총 주문</span><strong>{(data?.totals.orderCount ?? 0).toLocaleString("ko-KR")}건</strong></article>
      <article><span>평균 수익률</span><strong>{data?.totals.profitRate ?? 0}%</strong></article>
    </section>
    <div className="sales-layout">
      <section className="admin-card sales-calendar-card">
        <div className="sales-calendar-heading"><button onClick={() => moveMonth(-1)} aria-label="이전 달"><ChevronLeft size={17} /></button><h2>{year}년 {monthNumber}월</h2><button onClick={() => moveMonth(1)} aria-label="다음 달"><ChevronRight size={17} /></button></div>
        <div className="sales-weekdays">{["일","월","화","수","목","금","토"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="sales-calendar">{cells.map((day, index) => {
          const item = day ? dayMap.get(day) : null;
          return <article key={index} className={!day ? "blank" : ""}>{day && <><b>{day}</b>{item ? <><strong>{formatPrice(item.revenue)}</strong><small>순익 {formatPrice(item.profit)} · {item.orderCount}건</small></> : <small>판매 데이터 없음</small>}</>}</article>;
        })}</div>
      </section>
      <aside className="admin-card supplier-sales"><h2>매입처별 매출 순위</h2>{loading ? <div className="spinner" /> : data?.suppliers.length ? data.suppliers.map((supplier, index) => <article key={supplier.supplierName}><div className="supplier-sales-heading"><b className={`supplier-rank rank-${Math.min(index + 1, 3)}`}>{index + 1}순위</b><strong>{supplier.supplierName}</strong></div><span>총 매출 {formatPrice(supplier.revenue)}</span><small>순수익 {formatPrice(supplier.profit)} · 판매 {supplier.orderCount.toLocaleString("ko-KR")}건</small></article>) : <div className="sales-empty"><CalendarDays size={28} /><strong>연결된 매출 데이터가 없습니다.</strong><p>발주오라 주문·매출 원본이 연결되면 날짜와 매입처별 실적이 자동 집계됩니다.</p></div>}</aside>
    </div>
  </>;
}

function CatalogSyncAdmin() {
  const [overview, setOverview] = useState<CatalogSyncOverview | null>(null);
  const [runs, setRuns] = useState<CatalogSyncRun[]>([]);
  const [outbox, setOutbox] = useState<CatalogSyncOutboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [merchantUsername, setMerchantUsername] = useState("");
  const [merchantPassword, setMerchantPassword] = useState("");
  const [verifying, setVerifying] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const response = await apiFetch("/catalog/admin/sync");
      const payload = await readData<{ overview: CatalogSyncOverview; runs: CatalogSyncRun[]; outbox: CatalogSyncOutboxItem[] }>(response);
      setOverview(payload.overview);
      setRuns(payload.runs);
      setOutbox(payload.outbox);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "연동 상태를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const verifyConnection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setVerifying(true);
    try {
      const response = await apiFetch("/catalog/admin/sync/connection/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: merchantUsername, password: merchantPassword }),
        silent: true
      });
      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) {
        toast.error(payload?.error?.message || "발주오라 연결을 검증하지 못했습니다.");
        return;
      }
      toast.success("발주오라 계정 연결을 확인했습니다.");
      await refresh();
    } finally {
      setMerchantPassword("");
      setVerifying(false);
    }
  };

  if (loading && !overview) {
    return <div className="admin-loading inline"><div className="spinner" /><span>발주오라 연동 상태 확인 중…</span></div>;
  }

  return (
    <>
      <div className="admin-page-heading">
        <div><span>INTEGRATION CONTROL</span><h1>발주오라 연동</h1><p>두고푸드를 원본으로 관리하고, 발주오라 반영 대기 건을 안전하게 추적합니다.</p></div>
        <button className="outline-button" type="button" onClick={() => void refresh()}><History size={15} /> 새로고침</button>
      </div>
      <section className="sync-summary-grid">
        <article className="admin-card sync-summary-card"><span>초기 이관</span><strong>{overview?.initialImport.imported.toLocaleString("ko-KR")}<small> / {overview?.initialImport.total.toLocaleString("ko-KR")}건</small></strong><em>{overview?.initialImport.status === "completed" ? "완료" : overview?.initialImport.status}</em></article>
        <article className="admin-card sync-summary-card"><span>연결된 상품</span><strong>{overview?.linkedProducts.toLocaleString("ko-KR")}<small>건</small></strong><em>외부 상품 ID 매칭</em></article>
        <article className="admin-card sync-summary-card"><span>반영 대기</span><strong>{overview?.outbox.blocked.toLocaleString("ko-KR")}<small>건</small></strong><em>안전모드 보류</em></article>
        <article className="admin-card sync-summary-card"><span>연결 계정</span><strong>{overview?.writeIntegration.account ? `두고푸드 · ${overview.writeIntegration.account}` : "미연결"}</strong><em>{overview?.writeIntegration.status === "connected" ? "실시간 연동중" : "추가 인증 필요"}</em></article>
      </section>
      <section className="admin-card connection-manager-card">
        <div className="card-heading"><ShieldCheck size={19} /><div><h2>발주오라 도매몰 계정 연결</h2><p>현재 연결 계정: <strong className="connection-account-inline">{overview?.writeIntegration.account || "미연결"}</strong> · 실제 인증 성공 후에만 전송대기 항목이 전송가능으로 바뀝니다. 입력한 비밀번호는 저장하지 않습니다.</p></div><span className={`connection-state ${overview?.writeIntegration.status === "connected" ? "connected" : ""}`}>{overview?.writeIntegration.status === "connected" ? "실시간 연동중" : overview?.writeIntegration.status === "error" ? "연결 끊김" : "연결 해지"}</span></div>
        <form className="connection-form" onSubmit={verifyConnection}>
          <label>마스터 아이디<input value={merchantUsername} onChange={(event) => setMerchantUsername(event.target.value)} autoComplete="username" placeholder="발주오라 도매몰 마스터 아이디" required /></label>
          <label>마스터 비밀번호<input value={merchantPassword} onChange={(event) => setMerchantPassword(event.target.value)} type="password" autoComplete="current-password" placeholder="검증할 때만 사용" required /></label>
          <button className="primary-action" type="submit" disabled={verifying}>{verifying ? "인증 확인 중…" : overview?.writeIntegration.status === "connected" ? "다른 계정 연결" : "연결 확인"}</button>
          <button className="outline-button" type="button" disabled={overview?.writeIntegration.status !== "connected"}>연동 해지</button>
        </form>
        <p className="connection-security-note">현재 발주오라는 로그인 시 Cloudflare 사람 인증을 요구합니다. 공식 API 키·OAuth·서버용 토큰이 확인되지 않으면 계정 비밀번호만으로 연결 완료 처리하지 않습니다.</p>
      </section>
      <section className="admin-card sync-explainer-card">
        <div className="card-heading"><ShieldCheck size={19} /><div><h2>안전한 양방향 연결 상태</h2><p>{overview?.writeIntegration.reason}</p></div><span className={`sync-safe-badge ${overview?.writeIntegration.status === "connected" ? "connected" : ""}`}>{overview?.writeIntegration.status === "connected" ? "실시간 연동중" : "추가 인증 필요"}</span></div>
        <div className="sync-flow"><span>두고푸드 관리자</span><ChevronRight size={16} /><span>동기화 대기열</span><ChevronRight size={16} /><span>발주오라</span></div>
        <p className="sync-note">상품 등록·가격 수정은 이력과 함께 대기열에 기록됩니다. 발주오라 운영사의 공식 쓰기 API와 서버 전용 인증이 승인되면 대기열을 재처리할 수 있습니다. 현재는 기존 발주오라 데이터를 수정하지 않습니다.</p>
      </section>
      <section className="admin-card">
        <div className="card-heading"><History size={19} /><div><h2>동기화 실행 이력</h2><p>초기 읽기 이관과 향후 반영 실행을 확인합니다.</p></div></div>
        {runs.length === 0 ? <div className="empty-admin">아직 실행 이력이 없습니다.</div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>실행 시각</th><th>방향</th><th>트리거</th><th>전체</th><th>생성</th><th>수정</th><th>실패/충돌</th><th>상태</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id}><td>{formatDateTime(run.startedAt)}</td><td>{run.direction === "pull" ? "발주오라 → 두고푸드" : "두고푸드 → 발주오라"}</td><td>{run.trigger}</td><td>{run.total.toLocaleString("ko-KR")}</td><td>{run.createdCount.toLocaleString("ko-KR")}</td><td>{run.updatedCount.toLocaleString("ko-KR")}</td><td>{run.failedCount} / {run.conflictCount}</td><td><span className={`status-pill ${run.status === "completed" ? "active" : run.status === "failed" ? "danger" : "pending"}`}>{syncStatusLabel(run.status)}</span></td></tr>)}</tbody></table></div>}
      </section>
      <section className="admin-card">
        <div className="card-heading"><ClipboardList size={19} /><div><h2>발주오라 반영 대기열</h2><p>변경은 기록되지만, 공식 쓰기 계약 전까지 외부에는 전송하지 않습니다.</p></div></div>
        {outbox.length === 0 ? <div className="empty-admin">대기 중인 변경이 없습니다.</div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>기록 시각</th><th>상품</th><th>작업</th><th>상태</th><th>사유</th></tr></thead><tbody>{outbox.map((item) => <tr key={item.id}><td>{formatDateTime(item.createdAt)}</td><td>{item.productName || item.productId}</td><td>{syncActionLabels[item.action] || item.action}</td><td><span className={`status-pill ${item.status === "succeeded" ? "active" : item.status === "failed" ? "danger" : "pending"}`}>{syncStatusLabel(item.status)}</span></td><td>{item.lastError || "-"}</td></tr>)}</tbody></table></div>}
      </section>
    </>
  );
}
