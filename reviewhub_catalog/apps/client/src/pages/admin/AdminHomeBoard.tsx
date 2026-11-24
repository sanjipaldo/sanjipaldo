// 관리자 운영 홈(2026-11-24 관리자 요청): "판매 현황이 운영 홈에 나오면 좋겠다 · 매출처(셀러)·공급사 총수와 한 달 증감 ·
// 아이디마다 칸을 마우스로 옮기고 + 로 넣고 빼서 원하는 것만 보기 · 한 사람이 많은 셀러를 챙길 수 있게".
// - 칸(위젯): 판매 요약 · 매출처·공급사 · 상품 현황 · 오늘 잘 팔린 상품 · 날짜별 판매 · 상품 판매 TOP 10 · 입점·소싱 요청 ·
//   발주오라 동기화 · 최근 공지 · 매출처/공급사/카테고리 순위. 예전 "데이터센터가 오늘도 준비되어 있습니다" 띠는 뺐습니다.
// - 칸에 마우스를 올리면 오른쪽 위에 손잡이(끌어서 옮기기)·↑↓·넓게/좁게·× 가 보이고, "화면 편집"을 누르면 늘 보입니다(휴대폰).
// - 배치는 로그인한 아이디마다 서버(/api/catalog/admin/home-layout)에 저장되고, 이 기기에도 바로 그리려고 기억해 둡니다.
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown, ArrowUp, BarChart3, Bell, Boxes, ChevronRight, ClipboardList, Crown, GripVertical, Info, LayoutGrid,
  Maximize2, Minimize2, Minus, Package, Plus, RefreshCw, RotateCcw, Store, Tags, TrendingDown, TrendingUp, Users, X
} from "lucide-react";
import { seoulDateKey } from "@repo/shared/supplier-portal";
import { apiFetch } from "@/lib/api";
import { authClient } from "@/lib/auth";
import type { AdminHomeData } from "@/pages/catalog/types";
import { jsonInit, readData, won } from "./sales-admin-shared";
import {
  BuyerRankList, CategoryRankList, DailySalesChart, ProfitBreakdownCards, SalesKpiCards, SupplierRankList, TodayTopList, TopProductsTable,
  salesRangeFor, type SalesSummary
} from "./sales-widgets";
import "./sales-admin.css";
import "./admin-home-board.css";

export type WidgetId =
  | "sales-kpi" | "members" | "catalog-stats" | "sales-today" | "sales-daily" | "sales-top10"
  | "sourcing" | "baljuora" | "notices" | "rank-buyers" | "rank-suppliers" | "rank-categories";
type WidgetSize = "full" | "half";
type WidgetInfo = { id: WidgetId; title: string; description: string; size: WidgetSize; needs: "sales" | "members" | "overview" };

export const HOME_WIDGETS: WidgetInfo[] = [
  { id: "sales-kpi", title: "판매 요약", description: "판매 금액·주문·주문한 매출처·매입원가 뺀 금액(이전 같은 기간과 비교)", size: "full", needs: "sales" },
  { id: "members", title: "매출처·공급사", description: "매출처(셀러)·공급사 총수와 한 달 전보다 늘었는지·줄었는지", size: "half", needs: "members" },
  { id: "catalog-stats", title: "상품 현황", description: "전체·판매중·품절 상품과 가격변동 기록", size: "half", needs: "overview" },
  { id: "sales-today", title: "오늘 잘 팔린 상품", description: "오늘 판매 금액이 큰 상품 5개(썸네일)", size: "half", needs: "sales" },
  { id: "sales-daily", title: "날짜별 판매", description: "날짜별 판매 막대 · 마우스를 올리면 그날 금액", size: "half", needs: "sales" },
  { id: "sales-top10", title: "상품 판매 TOP 10", description: "기간 판매 금액이 큰 상품 10개(썸네일)", size: "full", needs: "sales" },
  { id: "sourcing", title: "입점·소싱 요청", description: "접수·검토중·완료 건수", size: "half", needs: "overview" },
  { id: "baljuora", title: "발주오라 동기화", description: "연결 상품 수와 마지막 동기화", size: "half", needs: "overview" },
  { id: "notices", title: "최근 공지", description: "공개 공지사항에 보이는 최근 공지", size: "half", needs: "overview" },
  { id: "rank-buyers", title: "매출처(셀러) 순위", description: "기간에 많이 주문한 셀러 10곳", size: "half", needs: "sales" },
  { id: "rank-suppliers", title: "공급사 순위", description: "기간 판매 금액이 큰 공급사", size: "half", needs: "sales" },
  { id: "rank-categories", title: "카테고리 순위", description: "DB센터 1차 카테고리별 판매", size: "half", needs: "sales" }
];
const WIDGET_BY_ID = new Map(HOME_WIDGETS.map((widget) => [widget.id, widget]));
export const DEFAULT_HOME_LAYOUT: WidgetId[] = ["sales-kpi", "members", "catalog-stats", "sales-today", "sales-daily", "sales-top10", "sourcing", "baljuora", "notices", "rank-buyers"];
const ALL_IDS = HOME_WIDGETS.map((widget) => widget.id);

type LayoutState = { visible: WidgetId[]; sizes: Partial<Record<WidgetId, WidgetSize>> };
type StoredLayout = { visible: string[]; known: string[]; sizes: Record<string, string> };
type SalesPeriod = "today" | "week" | "month";
const PERIODS: Array<{ key: SalesPeriod; label: string }> = [{ key: "today", label: "오늘" }, { key: "week", label: "이번 주" }, { key: "month", label: "이번 달" }];

type CountChange = { total: number; previous: number | null; change: number | null; changeRate: number | null; basis: "snapshot" | "joined"; recent: number };
type MemberStats = { asOf: string; since: string; buyers: (CountChange & { activeBuyers: number }) | null; suppliers: CountChange & { accounts: number | null } };

const isWidgetId = (value: unknown): value is WidgetId => typeof value === "string" && WIDGET_BY_ID.has(value as WidgetId);
const count = (value: number) => value.toLocaleString("ko-KR");

// 서버에 저장한 배치 → 화면 배치. 저장한 뒤 새로 생긴 칸(known에 없는 기본 칸)은 끝에 붙여 보여 줍니다.
export function normalizeHomeLayout(stored: StoredLayout | null | undefined): LayoutState {
  if (!stored || !Array.isArray(stored.visible)) return { visible: [...DEFAULT_HOME_LAYOUT], sizes: {} };
  const visible = stored.visible.filter(isWidgetId).filter((id, index, list) => list.indexOf(id) === index);
  const known = new Set(Array.isArray(stored.known) ? stored.known : []);
  for (const id of DEFAULT_HOME_LAYOUT) if (!known.has(id) && !visible.includes(id)) visible.push(id);
  const sizes: LayoutState["sizes"] = {};
  for (const [id, size] of Object.entries(stored.sizes ?? {})) if (isWidgetId(id) && (size === "full" || size === "half")) sizes[id] = size;
  return { visible, sizes };
}

function layoutCacheKey(userId: string) {
  return `doogo:admin-home-layout:${userId}`;
}

function readCachedLayout(userId: string | undefined): LayoutState | null {
  if (!userId) return null;
  try {
    const raw = window.localStorage.getItem(layoutCacheKey(userId));
    return raw ? normalizeHomeLayout(JSON.parse(raw) as StoredLayout) : null;
  } catch {
    return null;
  }
}

function writeCachedLayout(userId: string | undefined, layout: LayoutState | null) {
  if (!userId) return;
  try {
    if (layout) window.localStorage.setItem(layoutCacheKey(userId), JSON.stringify({ visible: layout.visible, known: ALL_IDS, sizes: layout.sizes }));
    else window.localStorage.removeItem(layoutCacheKey(userId));
  } catch {
    // 저장이 막힌 브라우저는 서버 저장만 씁니다.
  }
}

function readPeriod(): SalesPeriod {
  try {
    const value = window.localStorage.getItem("doogo:admin-home-period");
    return value === "today" || value === "week" ? value : "month";
  } catch {
    return "month";
  }
}

function formatStamp(value: string) {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}.${get("month")}.${get("day")} (${get("weekday")}) ${get("hour")}:${get("minute")}`;
}

// ── 칸 내용 ──────────────────────────────────────────────────────────

function ChangeBadge({ stat, unit }: { stat: CountChange; unit: string }) {
  if (stat.change === null) return <span className="ahb-change is-flat"><Minus size={14} aria-hidden="true" /> 비교할 기록 없음</span>;
  if (stat.change === 0) return <span className="ahb-change is-flat"><Minus size={14} aria-hidden="true" /> 한 달 전과 같음</span>;
  const up = stat.change > 0;
  const rate = stat.changeRate === null ? "" : ` ${Math.abs(stat.changeRate)}%`;
  return (
    <span className={`ahb-change ${up ? "is-up" : "is-down"}`}>
      {up ? <TrendingUp size={14} aria-hidden="true" /> : <TrendingDown size={14} aria-hidden="true" />}
      {up ? "증가" : "하락"}{rate} <em>({up ? "+" : "−"}{count(Math.abs(stat.change))}{unit})</em>
    </span>
  );
}

function MemberCard({ icon, label, stat, unit, link, linkLabel, lines }: { icon: ReactNode; label: string; stat: CountChange; unit: string; link: string; linkLabel: string; lines: string[] }) {
  return (
    <article className="ahb-member-card">
      <div className="ahb-member-top"><span className="ahb-member-icon" aria-hidden="true">{icon}</span><span>{label}</span><Link to={link}>{linkLabel} <ChevronRight size={14} /></Link></div>
      <strong>{count(stat.total)}<small>{unit}</small></strong>
      <ChangeBadge stat={stat} unit={unit} />
      <p>{stat.previous !== null ? `한 달 전 ${count(stat.previous)}${unit} → 지금 ${count(stat.total)}${unit}` : "한 달 전 수를 아직 모릅니다"}</p>
      {lines.map((line) => <small key={line}>{line}</small>)}
      {stat.basis === "joined" && <small className="ahb-basis" title="하루 한 번 수를 기록해 두고, 30일이 쌓이면 그 기록과 비교합니다.">가입일·등록일 기준으로 계산했어요</small>}
    </article>
  );
}

function MembersWidget({ stats, error, onRetry }: { stats: MemberStats | null; error: string | null; onRetry: () => void }) {
  if (error) return <WidgetMessage text={error} onRetry={onRetry} />;
  if (!stats) return <WidgetLoading text="매출처·공급사 수를 세는 중…" />;
  return (
    <div className="ahb-members">
      {stats.buyers ? (
        <MemberCard
          icon={<Users size={18} />}
          label="매출처(셀러)"
          stat={stats.buyers}
          unit="곳"
          link="/admin/buyers"
          linkLabel="매출처 보기"
          lines={[`최근 30일 새로 가입 ${count(stats.buyers.recent)}곳 · 주문한 셀러 ${count(stats.buyers.activeBuyers)}곳`]}
        />
      ) : (
        <article className="ahb-member-card is-empty"><div className="ahb-member-top"><span className="ahb-member-icon" aria-hidden="true"><Users size={18} /></span><span>매출처(셀러)</span></div><p>발주오라 매출처를 아직 불러오지 않았어요. 판매 현황에서 불러오기를 해 주세요.</p><Link className="ahb-inline-link" to="/admin/sales">판매 현황으로 <ChevronRight size={14} /></Link></article>
      )}
      <MemberCard
        icon={<Store size={18} />}
        label="공급사"
        stat={stats.suppliers}
        unit="곳"
        link="/admin/suppliers"
        linkLabel="공급사 관리"
        lines={[`최근 30일 새로 등록 ${count(stats.suppliers.recent)}곳${stats.suppliers.accounts !== null ? ` · 공급사 센터 계정 ${count(stats.suppliers.accounts)}개` : ""}`]}
      />
    </div>
  );
}

function CatalogStatsWidget({ data }: { data: AdminHomeData }) {
  const { overview } = data;
  return (
    <div className="admin-home-stat-grid">
      <Link className="admin-home-stat featured" to="/admin/products"><span>전체 상품</span><strong>{count(overview.productCount)}</strong><small>노출 {count(overview.visibleProductCount)}개</small></Link>
      <Link className="admin-home-stat" to="/admin/products"><span>판매중 상품</span><strong>{count(Math.max(0, overview.visibleProductCount - overview.soldOutProductCount))}</strong><small>현재 공개 공급 상품</small></Link>
      <Link className="admin-home-stat" to="/admin/products?status=soldout"><span>품절 상품</span><strong>{count(overview.soldOutProductCount)}</strong><small>관리자에서 품절 처리한 상품</small></Link>
      <Link className="admin-home-stat" to="/admin/history"><span>가격변동 로그</span><strong>{count(overview.priceHistoryCount)}</strong><small>전체 누적 이력</small></Link>
    </div>
  );
}

function SourcingWidget({ data }: { data: AdminHomeData }) {
  const { overview } = data;
  return (
    <section className="admin-card admin-home-panel">
      <div className="card-heading"><ClipboardList size={19} /><div><h2>입점·소싱 요청</h2><p>새로 들어온 소싱 요청과 입점 신청 처리 현황입니다.</p></div><Link to="/admin/sourcing">전체 보기 <ChevronRight size={14} /></Link></div>
      <div className="admin-home-request-stats">
        <Link to="/admin/sourcing?status=received"><span>접수</span><strong>{overview.sourcingCounts.received}</strong></Link>
        <Link to="/admin/sourcing?status=reviewing"><span>검토중</span><strong>{overview.sourcingCounts.reviewing}</strong></Link>
        <Link to="/admin/sourcing?status=completed"><span>완료</span><strong>{overview.sourcingCounts.completed}</strong></Link>
      </div>
    </section>
  );
}

function BaljuoraWidget({ data }: { data: AdminHomeData }) {
  const { baljuora } = data;
  return (
    <section className="admin-card admin-home-panel">
      <div className="card-heading"><RefreshCw size={19} /><div><h2>발주오라 동기화</h2><p>DB센터에서 고친 상품을 발주오라 도매몰에 반영합니다.</p></div><Link to="/admin/sync">동기화하기 <ChevronRight size={14} /></Link></div>
      {baljuora.ready ? (
        <div className="admin-home-connection-meta"><div><span>연결 상품</span><b>{count(baljuora.linkedCount)}개</b></div><div><span>마지막 동기화</span><b>{baljuora.lastPushAt ? formatStamp(baljuora.lastPushAt) : "아직 없음"}</b></div></div>
      ) : <div className="admin-home-unavailable"><Info size={18} /><span>DB 업데이트(034)가 적용되면 사용할 수 있습니다.</span></div>}
    </section>
  );
}

function NoticesWidget({ data }: { data: AdminHomeData }) {
  const { overview } = data;
  return (
    <section className="admin-card admin-home-panel admin-home-notice-panel">
      <div className="card-heading"><Bell size={19} /><div><h2>최근 공지</h2><p>공개 공지사항에 표시되는 내용입니다.</p></div><Link to="/admin/notices">관리 <ChevronRight size={14} /></Link></div>
      <div className="admin-home-notices">{overview.recentNotices.length > 0 ? overview.recentNotices.map((notice) => <Link key={notice.id} to="/admin/notices"><span>{notice.isPinned ? "필독" : "공지"}</span><strong>{notice.title}</strong><small>{notice.updatedAt.slice(0, 10)}</small></Link>) : <div className="admin-home-unavailable"><Info size={18} /><span>등록된 공지가 없습니다.</span></div>}</div>
    </section>
  );
}

function WidgetLoading({ text }: { text: string }) {
  return <div className="ahb-state"><div className="spinner" /><span>{text}</span></div>;
}

function WidgetMessage({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return <div className="ahb-state is-message"><Info size={18} aria-hidden="true" /><span>{text}</span>{onRetry && <button type="button" className="outline-button" onClick={onRetry}>다시 불러오기</button>}</div>;
}

function SalesCard({ icon, title, subtitle, link, children }: { icon: ReactNode; title: string; subtitle: string; link?: boolean; children: ReactNode }) {
  return (
    <section className="admin-card sa-home-card">
      <div className="card-heading">{icon}<div><h2>{title}</h2><p>{subtitle}</p></div>{link && <Link to="/admin/sales">판매 현황 <ChevronRight size={14} /></Link>}</div>
      {children}
    </section>
  );
}

// ── 운영 홈 ──────────────────────────────────────────────────────────

export function AdminHomeBoard({ overview }: { overview: AdminHomeData | null }) {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const userId = session?.user?.id;
  const [layout, setLayout] = useState<LayoutState>(() => readCachedLayout(userId) ?? { visible: [...DEFAULT_HOME_LAYOUT], sizes: {} });
  const [layoutReady, setLayoutReady] = useState(() => readCachedLayout(userId) !== null);
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saveState, setSaveState] = useState<"" | "saving" | "saved" | "error">("");
  const [period, setPeriod] = useState<SalesPeriod>(readPeriod);
  const [sales, setSales] = useState<SalesSummary | null>(null);
  const [salesError, setSalesError] = useState<string | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [members, setMembers] = useState<MemberStats | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<WidgetId | null>(null);
  const [dropHint, setDropHint] = useState<{ id: WidgetId; side: "before" | "after" } | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const gridRef = useRef<HTMLDivElement>(null);

  const today = seoulDateKey();
  const range = salesRangeFor(period, today);
  const needsSales = layout.visible.some((id) => WIDGET_BY_ID.get(id)?.needs === "sales");
  const needsMembers = layout.visible.includes("members");
  const hidden = useMemo(() => HOME_WIDGETS.filter((widget) => !layout.visible.includes(widget.id)), [layout.visible]);

  // 이 아이디의 배치(서버). 이 기기에 기억한 배치가 있으면 먼저 그 배치로 그립니다.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const cached = readCachedLayout(userId);
    if (cached) {
      setLayout(cached);
      setLayoutReady(true);
    }
    void apiFetch("/catalog/admin/home-layout", { silent: true })
      .then((response) => readData<{ layout: StoredLayout | null }>(response))
      .then((data) => {
        if (!active) return;
        const next = normalizeHomeLayout(data.layout);
        setLayout(next);
        writeCachedLayout(userId, data.layout ? next : null);
      })
      .catch(() => undefined)
      .finally(() => { if (active) setLayoutReady(true); });
    return () => { active = false; };
  }, [userId]);
  // 로그인 정보를 끝내 못 읽으면 기본 배치로 그립니다(저장은 아이디를 알 때만).
  useEffect(() => { if (!sessionPending && !userId) setLayoutReady(true); }, [sessionPending, userId]);

  const loadSales = useCallback(async () => {
    setSalesLoading(true);
    setSalesError(null);
    try {
      setSales(await readData<SalesSummary>(await apiFetch(`/baljuora/admin/sales/summary?from=${range.from}&to=${range.to}`, { silent: true })));
    } catch (error) {
      setSalesError(error instanceof Error ? error.message : "판매 현황을 불러오지 못했어요.");
    } finally {
      setSalesLoading(false);
    }
  }, [range.from, range.to]);

  const loadMembers = useCallback(async () => {
    setMembersError(null);
    try {
      setMembers(await readData<MemberStats>(await apiFetch("/catalog/admin/member-stats", { silent: true })));
    } catch (error) {
      setMembersError(error instanceof Error ? error.message : "매출처·공급사 수를 불러오지 못했어요.");
    }
  }, []);

  useEffect(() => { if (needsSales) void loadSales(); }, [needsSales, loadSales]);
  useEffect(() => { if (needsMembers && !members) void loadMembers(); }, [needsMembers, members, loadMembers]);
  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  const commit = useCallback((next: LayoutState) => {
    setLayout(next);
    writeCachedLayout(userId, next);
    setSaveState("saving");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void apiFetch("/catalog/admin/home-layout", { ...jsonInit("PUT", { visible: next.visible, known: ALL_IDS, sizes: next.sizes }), silent: true })
        .then((response) => setSaveState(response.ok ? "saved" : "error"))
        .catch(() => setSaveState("error"));
    }, 500);
  }, [userId]);

  const sizeOf = (id: WidgetId): WidgetSize => layout.sizes[id] ?? WIDGET_BY_ID.get(id)?.size ?? "half";
  const move = (id: WidgetId, delta: number) => {
    const index = layout.visible.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= layout.visible.length) return;
    const visible = [...layout.visible];
    [visible[index], visible[target]] = [visible[target], visible[index]];
    commit({ ...layout, visible });
  };
  const remove = (id: WidgetId) => commit({ ...layout, visible: layout.visible.filter((item) => item !== id) });
  const add = (id: WidgetId) => {
    commit({ ...layout, visible: [...layout.visible.filter((item) => item !== id), id] });
    if (hidden.length <= 1) setAddOpen(false);
  };
  const toggleSize = (id: WidgetId) => commit({ ...layout, sizes: { ...layout.sizes, [id]: sizeOf(id) === "full" ? "half" : "full" } });
  const resetLayout = () => {
    window.clearTimeout(saveTimer.current);
    setLayout({ visible: [...DEFAULT_HOME_LAYOUT], sizes: {} });
    writeCachedLayout(userId, null);
    setSaveState("saving");
    void apiFetch("/catalog/admin/home-layout", { method: "DELETE", silent: true })
      .then((response) => setSaveState(response.ok ? "saved" : "error"))
      .catch(() => setSaveState("error"));
  };
  const changePeriod = (next: SalesPeriod) => {
    setPeriod(next);
    try { window.localStorage.setItem("doogo:admin-home-period", next); } catch { /* 기억만 못 함 */ }
  };

  // 끌어서 옮기기: 손잡이를 잡고 다른 칸 위에 놓으면 그 칸 앞(왼쪽·위) 또는 뒤(오른쪽·아래)로 옮깁니다.
  const onDragStart = (event: DragEvent<HTMLElement>, id: WidgetId) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    const frame = event.currentTarget.closest(".ahb-widget");
    if (frame instanceof HTMLElement) event.dataTransfer.setDragImage(frame, 28, 20);
    setDragId(id);
  };
  const onDragOver = (event: DragEvent<HTMLElement>, id: WidgetId) => {
    if (!dragId || dragId === id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const gridWidth = gridRef.current?.getBoundingClientRect().width ?? rect.width;
    const sideBySide = rect.width < gridWidth * 0.75;
    const side = sideBySide ? (event.clientX < rect.left + rect.width / 2 ? "before" : "after") : (event.clientY < rect.top + rect.height / 2 ? "before" : "after");
    setDropHint((current) => (current?.id === id && current.side === side ? current : { id, side }));
  };
  const onDrop = (event: DragEvent<HTMLElement>, id: WidgetId) => {
    event.preventDefault();
    const from = dragId ?? (event.dataTransfer.getData("text/plain") as WidgetId);
    const side = dropHint?.id === id ? dropHint.side : "before";
    setDragId(null);
    setDropHint(null);
    if (!isWidgetId(from) || from === id) return;
    const visible = layout.visible.filter((item) => item !== from);
    const target = visible.indexOf(id);
    if (target < 0) return;
    visible.splice(side === "after" ? target + 1 : target, 0, from);
    commit({ ...layout, visible });
  };
  const onDragEnd = () => {
    setDragId(null);
    setDropHint(null);
  };

  const salesSubtitle = sales ? (sales.from === sales.to ? sales.from : `${sales.from} ~ ${sales.to}`) : `${range.from} ~ ${range.to}`;
  const salesGate = (content: (summary: SalesSummary) => ReactNode) => {
    if (salesError && !sales) return <WidgetMessage text={salesError} onRetry={() => void loadSales()} />;
    if (!sales) return <WidgetLoading text="판매 현황을 불러오는 중…" />;
    if (!sales.hasData) return <WidgetMessage text="아직 불러온 판매가 없어요. 판매 현황에서 발주오라 판매를 불러오면 여기에 보입니다." />;
    return <div className={salesLoading ? "sa-dim" : undefined}>{content(sales)}</div>;
  };

  const renderWidget = (id: WidgetId): ReactNode => {
    switch (id) {
      case "sales-kpi":
        return (
          <div className="ahb-block">
            <div className="ahb-block-head"><BarChart3 size={18} aria-hidden="true" /><h2>판매 요약</h2><span>{salesSubtitle}</span><Link to="/admin/sales">판매 현황 자세히 <ChevronRight size={14} /></Link></div>
            {salesGate((summary) => (
              <>
                <SalesKpiCards summary={summary} />
                <ProfitBreakdownCards summary={summary} />
                {summary.pending.count > 0 && <p className="sa-notice"><Info size={15} aria-hidden="true" /><span>주문대기(입금 전) {count(summary.pending.count)}줄 · {won(summary.pending.amount)}은 매출에서 뺐어요.</span></p>}
              </>
            ))}
          </div>
        );
      case "members":
        return (
          <div className="ahb-block">
            <div className="ahb-block-head"><Users size={18} aria-hidden="true" /><h2>매출처·공급사</h2><span>{members ? `${members.asOf} 기준 · 한 달 전(${members.since})과 비교` : "한 달 전과 비교"}</span></div>
            <MembersWidget stats={members} error={membersError} onRetry={() => void loadMembers()} />
          </div>
        );
      case "catalog-stats":
        return overview ? (
          <div className="ahb-block">
            <div className="ahb-block-head"><Boxes size={18} aria-hidden="true" /><h2>상품 현황</h2><span>DB센터 상품</span><Link to="/admin/products">상품 리스트 <ChevronRight size={14} /></Link></div>
            <CatalogStatsWidget data={overview} />
          </div>
        ) : <WidgetLoading text="상품 현황을 불러오는 중…" />;
      case "sales-today":
        return <SalesCard icon={<Crown size={19} aria-hidden="true" />} title="오늘 잘 팔린 상품" subtitle={sales ? `${sales.today} · 판매 ${won(sales.todaySales.totals.amount)} · 주문 ${count(sales.todaySales.totals.orders)}건` : today}>{salesGate((summary) => <TodayTopList summary={summary} />)}</SalesCard>;
      case "sales-daily":
        return <SalesCard icon={<BarChart3 size={19} aria-hidden="true" />} title="날짜별 판매" subtitle={`${salesSubtitle} · 막대에 마우스를 올리면 금액`}>{salesGate((summary) => <DailySalesChart summary={summary} />)}</SalesCard>;
      case "sales-top10":
        return <SalesCard icon={<Package size={19} aria-hidden="true" />} title="상품 판매 TOP 10" subtitle={`판매 금액이 큰 순서 · ${salesSubtitle}`} link>{salesGate((summary) => <TopProductsTable summary={summary} />)}</SalesCard>;
      case "rank-buyers":
        return <SalesCard icon={<Users size={19} aria-hidden="true" />} title="매출처(셀러) 순위" subtitle={`많이 주문한 셀러 · ${salesSubtitle}`}>{salesGate((summary) => <BuyerRankList summary={summary} />)}</SalesCard>;
      case "rank-suppliers":
        return <SalesCard icon={<Store size={19} aria-hidden="true" />} title="공급사 순위" subtitle={`공급사 제품 판매 금액 · ${salesSubtitle}`}>{salesGate((summary) => <SupplierRankList summary={summary} />)}</SalesCard>;
      case "rank-categories":
        return <SalesCard icon={<Tags size={19} aria-hidden="true" />} title="카테고리 순위" subtitle={`DB센터 1차 카테고리 · ${salesSubtitle}`}>{salesGate((summary) => <CategoryRankList summary={summary} />)}</SalesCard>;
      case "sourcing":
        return overview ? <SourcingWidget data={overview} /> : <WidgetLoading text="불러오는 중…" />;
      case "baljuora":
        return overview ? <BaljuoraWidget data={overview} /> : <WidgetLoading text="불러오는 중…" />;
      case "notices":
        return overview ? <NoticesWidget data={overview} /> : <WidgetLoading text="불러오는 중…" />;
      default:
        return null;
    }
  };

  return (
    <div className="ahb-board">
      <div className="admin-page-heading admin-home-heading ahb-heading">
        <div>
          <span>DOOGO FOOD DATA CENTER</span>
          <h1>운영 홈</h1>
          <p>판매·매출처·공급사·상품과 요청을 한 화면에서 봅니다. 칸에 마우스를 올리면 옮기거나 뺄 수 있어요.</p>
        </div>
        <div className="ahb-actions">
          <div className="sa-period ahb-period" role="group" aria-label="판매 기간">
            {PERIODS.map((item) => <button key={item.key} type="button" className={period === item.key ? "is-active" : ""} aria-pressed={period === item.key} onClick={() => changePeriod(item.key)}>{item.label}</button>)}
          </div>
          <button type="button" className={`ahb-edit-toggle${editing ? " is-on" : ""}`} aria-pressed={editing} onClick={() => { setEditing((value) => !value); setAddOpen(false); }}>
            <LayoutGrid size={16} aria-hidden="true" /> {editing ? "편집 끝내기" : "화면 편집"}
          </button>
        </div>
      </div>

      {editing && (
        <div className="ahb-editbar" role="status">
          <span>손잡이(<GripVertical size={14} aria-hidden="true" />)를 끌어 옮기거나 ↑↓로 순서를 바꾸고, ×로 빼고, 맨 아래 <b>+ 칸 추가</b>로 다시 넣어요. 이 아이디에만 저장돼요.</span>
          <span className="ahb-save-state">{saveState === "saving" ? "저장 중…" : saveState === "saved" ? "저장됨" : saveState === "error" ? "저장 못 함 · 다시 바꾸면 다시 저장해요" : ""}</span>
          <button type="button" className="outline-button" onClick={resetLayout}><RotateCcw size={15} aria-hidden="true" /> 기본 배치로</button>
        </div>
      )}

      {!layoutReady ? <WidgetLoading text="화면 배치를 불러오는 중…" /> : (
        <div ref={gridRef} className={`ahb-grid${editing ? " is-editing" : ""}${dragId ? " is-dragging" : ""}`}>
          {layout.visible.map((id, index) => {
            const info = WIDGET_BY_ID.get(id)!;
            const size = sizeOf(id);
            const hint = dropHint?.id === id ? ` is-drop-${dropHint.side}` : "";
            return (
              <section
                key={id}
                className={`ahb-widget size-${size}${dragId === id ? " is-dragged" : ""}${hint}`}
                data-widget={id}
                aria-label={info.title}
                onDragOver={(event) => onDragOver(event, id)}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropHint((current) => (current?.id === id ? null : current)); }}
                onDrop={(event) => onDrop(event, id)}
              >
                <div className="ahb-tools" role="toolbar" aria-label={`${info.title} 칸`}>
                  <span className="ahb-handle" draggable onDragStart={(event) => onDragStart(event, id)} onDragEnd={onDragEnd} title="끌어서 옮기기" aria-hidden="true"><GripVertical size={16} /></span>
                  <button type="button" onClick={() => move(id, -1)} disabled={index === 0} aria-label={`${info.title} 앞으로`} title="앞으로"><ArrowUp size={15} /></button>
                  <button type="button" onClick={() => move(id, 1)} disabled={index === layout.visible.length - 1} aria-label={`${info.title} 뒤로`} title="뒤로"><ArrowDown size={15} /></button>
                  <button type="button" onClick={() => toggleSize(id)} aria-label={size === "full" ? `${info.title} 반 칸으로` : `${info.title} 한 줄 전체로`} title={size === "full" ? "반 칸으로" : "한 줄 전체로"}>{size === "full" ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
                  <button type="button" className="is-remove" onClick={() => remove(id)} aria-label={`${info.title} 빼기`} title="빼기"><X size={15} /></button>
                </div>
                {renderWidget(id)}
              </section>
            );
          })}
          {layout.visible.length === 0 && <div className="ahb-empty">보이는 칸이 없어요. 아래 <b>+ 칸 추가</b>로 보고 싶은 칸을 넣어 주세요.</div>}
          {(hidden.length > 0 || editing) && (
            <div className="ahb-add">
              <button type="button" className="ahb-add-toggle" aria-expanded={addOpen} onClick={() => setAddOpen((value) => !value)} disabled={hidden.length === 0}>
                <Plus size={17} aria-hidden="true" /> 칸 추가{hidden.length > 0 ? ` (${hidden.length})` : " · 모든 칸이 화면에 있어요"}
              </button>
              {addOpen && hidden.length > 0 && (
                <ul className="ahb-add-list">
                  {hidden.map((widget) => (
                    <li key={widget.id}>
                      <span><strong>{widget.title}</strong><small>{widget.description}</small></span>
                      <button type="button" className="outline-button" onClick={() => add(widget.id)}><Plus size={15} aria-hidden="true" /> 넣기</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminHomeBoard;
