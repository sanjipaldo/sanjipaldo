// 관리자 > 발주오라 동기화(2026-11-22, 관리자 요청 "DB센터에서 고치고 동기화 버튼 → 발주오라 도매몰에도 똑같이").
// 발주오라는 API가 없고 관리자 로그인에 사람 확인이 있어, 로그인해 둔 발주오라 관리자 창에서 책갈피 "두고푸드 동기화"를 눌러 실행합니다.
// 순서: ① 발주오라 상품 불러오기(비교) → 두 쪽 상품을 상품코드로 연결 ② 변경 목록에서 고르고 "동기화" → 작업 코드 + 발주오라 창 열기
//       → 그 창에서 책갈피 누르기 → 이 화면에 진행 상황·결과가 보입니다.
// 탭: 보낼 변경(DB센터에서 바뀐 값) · 신규 등록(발주오라에 없는 DB센터 상품) · 발주오라에서 바뀜(가져오기/이대로 두기) · 발주오라에만 있음(가져오기)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDownToLine, Bookmark, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Landmark, Link2, Loader2, RefreshCw, Search, Send, Settings2, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import {
  BALJUORA_CONSOLE_ORIGIN,
  BALJUORA_DEFAULT_MERCHANT_SLUG,
  BALJUORA_DIRECTION_LABELS,
  BALJUORA_FIELD_LABELS,
  BALJUORA_FIELD_SHORT_LABELS,
  canPullDiff,
  canPushDiff,
  isExtraField,
  type BaljuoraCategory,
  type BaljuoraFieldDiff,
  type BaljuoraProductSnapshot,
  type BaljuoraSyncField
} from "@repo/shared/baljuora-sync";
import { certificationLabel, formatContent, formatShippingUnit } from "@repo/shared/product-extras";
import { BaljuoraMasterPanel } from "./BaljuoraMasterPanel";
import { BaljuoraCategoryTreeCard, type CategoryTreeView } from "./BaljuoraCategoryTreeCard";
import { BaljuoraAlignSettings, type BaljuoraPolicyOption, type DoogoPolicyOption } from "./BaljuoraAlignSettings";
import { BaljuoraJobCode, type ReissuedJobCode } from "./BaljuoraJobCode";
import { BaljuoraStatModal, type StatKind } from "./BaljuoraStatModals";
import { BaljuoraReconcileCard } from "./BaljuoraReconcileCard";
import { clearJobCode, loadJobCode, saveJobCode } from "@/lib/baljuora-job-code";
import { bookmarkletHref, openBaljuoraWindow, runnerOpenMessage } from "@/lib/baljuora-window";
import { detectInstallPlatform } from "@/lib/app-install";
import { BaljuoraRunnerHint, BaljuoraWindowLink, MobileBookmarkletGuide } from "./baljuora-window-ui";
import "./baljuora-sync-admin.css";

// salesOnCompare·salesMonths(2026-11-23): 발주오라 상품 불러오기(비교) 때 판매·매출처도 함께 불러올지, 기간(이번 달 포함 최근 N개월)
// dailyRegisterNew(2026-11-26): 운영 홈 아침 동기화 때 발주오라에만 있는 새 상품도 DB센터에 숨김으로 등록할지(기본 켬)
type Settings = { merchantSlug: string; groupKeyword: string; categoryMap: Record<string, string>; baljuoraCategoryMap: Record<string, string>; shippingPolicyMap: Record<string, string>; templateCode: string | null; salesOnCompare?: boolean; salesMonths?: number; dailyRegisterNew?: boolean };
type JobView = {
  id: string;
  type: "compare" | "push" | "sales";
  salesRange?: { start: string; end: string } | null;
  status: "waiting" | "running" | "done" | "failed" | "expired" | "cancelled";
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  expiresAt: string;
  total: number | null;
  progress: { done: number; total: number; message: string } | null;
  summary: Record<string, unknown> | null;
  items?: Array<{ productId: string; ok: boolean; action: "create" | "update"; name?: string; applied?: BaljuoraSyncField[]; skipped?: Array<{ field: BaljuoraSyncField; reason: string }>; error?: string | null }>;
  diagnostics?: Record<string, unknown> | null;
};
type Overview = {
  // DB센터 → 발주오라 상품 카테고리 맞추기(추가·이름 바꾸기, 브랜드별 제외)
  categoryTree?: CategoryTreeView;
  settings: Settings;
  doogoCategories: Array<{ id: string; name: string; shippingType: string }>;
  baljuoraCategories: BaljuoraCategory[];
  doogoShippingPolicies?: DoogoPolicyOption[];
  baljuoraShippingPolicies?: BaljuoraPolicyOption[];
  group: { id: string; name: string } | null;
  linkedCount: number;
  lastCompareAt: string | null;
  lastPushAt: string | null;
  activeJob: JobView | null;
  jobs: JobView[];
};
type ChangeItem = {
  productId: string;
  kind: "new" | "update";
  code: string | null;
  name: string;
  imageUrl: string | null;
  categoryId: string;
  isVisible: boolean;
  baljuoraId: string | null;
  supplierName: string | null;
  // 신규 등록인데 같은 매입처로 연결된 상품이 하나도 없음(새 매입처, 2026-11-25)
  newSupplier?: boolean;
  // 신규 등록인데 발주오라에 이름이 같은 상품이 있음(발주오라는 같은 이름 상품을 새로 받지 않음 → '같은 상품으로 연결', 2026-11-27)
  sameName?: SameName;
  // base = 마지막으로 맞춘 값(기준, '보낼 변경' 상세 팝업에서 어느 쪽이 바뀌었는지 보여 줌)
  diffs: Array<BaljuoraFieldDiff & { base?: { doogo?: string | number | null; baljuora?: string | number | null } }>;
  syncStatus: string | null;
  lastPushedAt: string | null;
  baseAt?: string | null;
  lastPulledAt?: string | null;
  // 신규 등록 상품이 발주오라에 들어갈 값('신규 등록' 카드 팝업)
  preview?: { supplyPrice: number; groupPrice: number; consumerPrice: number | null; purchaseCost: number | null };
};
type SameName = {
  baljuoraId: string;
  code: string | null;
  name: string;
  // 그 발주오라 상품과 지금 연결된 DB센터 상품(없으면 아직 아무 상품과도 연결 안 됨)
  holder: { id: string; name: string; code: string | null; isVisible: boolean; deleted: boolean } | null;
  // 바로 연결할 수 없는 까닭
  blocked: string | null;
};
// 발주오라에만 있는 상품 + 표시(2026-11-27): 상품코드가 같은 DB센터 지운 상품(가져오면 숨김으로 되살림) · 이름이 같은 DB센터 신규 등록 상품
type OnlyItem = BaljuoraProductSnapshot & {
  deletedMatch?: { id: string; name: string; code: string };
  sameNameProduct?: { id: string; name: string; code: string | null };
};
type Changes = {
  compared: boolean;
  lastCompareAt: string | null;
  linkedCount: number;
  // 발주오라에서 매출처 그룹(황금농부) 공급가를 읽었는지. false면 수강생 단가는 비교·전송하지 못합니다.
  groupPriceReadable?: boolean;
  productCount: number;
  items: ChangeItem[];
  baljuoraOnly: OnlyItem[];
  unmappedCategories: Array<{ id: string; name: string }>;
  // 상품 정보 칸 표(037)가 있는지(false = 운영 배포 전 → 원산지·택배사·판매 상태·과세 밖의 상품 정보 칸은 비교하지 않음)
  extrasReady?: boolean;
};
// changed = DB센터에서 바꿈(마지막으로 맞춘 뒤 DB센터에서 고친 칸만, 2026-11-23 관리자 요청 "내가 지금 바꿔서 발주오라에 보내야 할 것만 따로")
type Tab = "changed" | "push" | "new" | "pull" | "only";
const PAGE_SIZE = 40;
// 가져오기(발주오라에서 바뀜·발주오라에만 있음)를 한 번에 보내는 상품 수
const PULL_CHUNK = 25;

async function readData<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({ ok: false }))) as { ok: boolean; data: T; error?: { message?: string } };
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "처리하지 못했습니다.");
  return payload.data;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function won(value: string | number | null) {
  if (value === null || value === "") return "없음";
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString("ko-KR")}원` : String(value);
}

const STATUS_LABELS: Record<JobView["status"], string> = { waiting: "책갈피 기다리는 중", running: "진행 중", done: "완료", failed: "실패", expired: "만료", cancelled: "취소" };

// 북마클릿: 발주오라 관리자 창에 DB센터의 동기화 스크립트를 불러옵니다(React는 javascript: 주소를 막아서 직접 넣습니다).
// 판매·매출처 결과 한 줄(비교 작업 summary.sales 또는 판매 작업 summary)
function salesText(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const sales = value as { lines?: number; buyers?: number; complete?: boolean };
  return ` · 판매 ${Number(sales.lines ?? 0).toLocaleString("ko-KR")}줄 · 매출처 ${Number(sales.buyers ?? 0).toLocaleString("ko-KR")}곳${sales.complete === false ? " (주문은 일부만)" : ""}`;
}

function BookmarkletLink({ origin }: { origin: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    ref.current?.setAttribute("href", bookmarkletHref(origin));
  }, [origin]);
  return (
    <a ref={ref} className="bj-bookmarklet" onClick={(event) => { event.preventDefault(); toast.info("이 버튼은 누르는 게 아니라 즐겨찾기(북마크) 막대로 끌어다 놓는 버튼입니다."); }} draggable>
      <Bookmark size={16} aria-hidden="true" /> 두고푸드 동기화
    </a>
  );
}

// 마지막으로 맞춘 뒤 DB센터에서 바꾼 칸(양쪽에서 바뀐 칸 포함): 'DB센터에서 바꿈' 탭과 요약 줄에 씀
const isDoogoChange = (diff: BaljuoraFieldDiff) => diff.direction === "push" || diff.direction === "both";

// 상품 정보 칸 값 보기(비교 값 모양: 품절·노출·과세 1/0, 내용량 "양|단위|개수|기준", 배송 단위 "단위|수량", 인증 "a,b")
function extraText(field: BaljuoraSyncField, value: string | number | null, auto = false) {
  if (field === "soldOut") return value === null ? "없음" : Number(value) ? "품절" : "판매중";
  if (field === "visible") return value === null ? "없음" : Number(value) ? "노출" : "숨김";
  if (field === "taxable") return value === null ? "없음" : `${Number(value) ? "과세" : "비과세"}${auto ? "(자동)" : ""}`;
  if (field === "tradeType") return value ? "해외" : "국내";
  if (value === null || value === "") return "없음";
  if (field === "content") {
    const [amount, unit, count, basis] = String(value).split("|");
    return formatContent(amount ? Number(amount) : null, unit || null, count ? Number(count) : null, basis || null) || "없음";
  }
  if (field === "shippingUnit") {
    const [type, amount] = String(value).split("|");
    return formatShippingUnit(type || null, amount ? Number(amount) : null) || "없음";
  }
  if (field === "certification") return String(value).split(",").map(certificationLabel).join(", ");
  return String(value);
}

function DiffValue({ field, value, categoryPath, policyName, auto }: { field: BaljuoraSyncField; value: string | number | null; categoryPath: (id: string) => string; policyName: (id: string) => string; auto?: boolean }) {
  if (field === "image") return value ? <img className="bj-diff-thumb" src={String(value)} alt="" loading="lazy" /> : <span className="bj-muted">없음</span>;
  if (field === "shippingPolicy") return <span>{value ? policyName(String(value)) : "없음"}</span>;
  if (field === "category") return <span>{value ? String(value).split(",").map(categoryPath).join(", ") : "없음"}</span>;
  if (field === "name") return <span>{value || "없음"}</span>;
  if (isExtraField(field)) return <span>{extraText(field, value, auto)}</span>;
  return <span>{won(value)}</span>;
}

export function BaljuoraSyncAdmin() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [changes, setChanges] = useState<Changes | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("push");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<"" | "compare" | "push" | "pull" | "ignore" | "settings" | "cancel" | "link">("");
  const [job, setJob] = useState<{ view: JobView; code: string | null; consoleUrl: string | null } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<Settings | null>(null);
  const [openJob, setOpenJob] = useState<JobView | null>(null);
  const [pullProgress, setPullProgress] = useState<{ done: number; total: number } | null>(null);
  // 숫자 카드 팝업(연결된 상품·보낼 변경·신규 등록·발주오라에만 있음, 2026-11-27)
  const [stat, setStat] = useState<StatKind | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  // 휴대폰·태블릿이면 책갈피 안내를 휴대폰 순서부터(PC의 '즐겨찾기 막대로 끌어다 놓기' 버튼은 숨김)
  const mobileDevice = useMemo(() => detectInstallPlatform().mobile, []);

  const load = useCallback(async () => {
    try {
      const [nextOverview, nextChanges] = await Promise.all([
        readData<Overview>(await apiFetch("/baljuora/admin/overview", { silent: true })),
        readData<Changes>(await apiFetch("/baljuora/admin/changes", { silent: true }))
      ]);
      setOverview(nextOverview);
      setChanges(nextChanges);
      setSettingsDraft(nextOverview.settings);
      // 화면을 새로 열면 진행 중 작업은 서버에서, 작업 코드는 이 기기에 기억해 둔 값에서 다시 채웁니다(코드는 서버에 SHA-256만 있음).
      setJob((current) => {
        if (current) return current;
        const active = nextOverview.activeJob;
        if (!active) return null;
        const saved = loadJobCode(active.id);
        return { view: active, code: saved?.code ?? null, consoleUrl: saved?.consoleUrl ?? null };
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "발주오라 동기화 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // 진행 중인 작업은 2초마다 새로 봅니다. 끝나면 변경 목록을 다시 불러옵니다.
  const jobId = job?.view.id;
  const jobActive = job ? job.view.status === "waiting" || job.view.status === "running" : false;
  useEffect(() => {
    if (!jobId || !jobActive) return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      try {
        // light=1: 진행·요약만 받습니다(상품별 결과·기술 정보는 '자세히 보기'에서).
        const { job: next } = await readData<{ job: JobView }>(await apiFetch(`/baljuora/admin/jobs/${jobId}?light=1`, { silent: true }));
        if (stopped) return;
        setJob((current) => current && current.view.id === next.id ? { ...current, view: next } : current);
        if (next.status !== "waiting" && next.status !== "running") {
          clearJobCode(next.id);
          if (next.status === "done") toast.success(next.type === "compare" ? "발주오라 상품을 불러왔습니다." : next.type === "sales" ? "발주오라 판매·매출처를 불러왔습니다." : "동기화를 마쳤습니다.");
          void load();
        }
      } catch {
        // 잠깐 끊겨도 다음 번에 다시 봅니다.
      }
    }, 2000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [jobId, jobActive, load]);

  const categoryPath = useCallback((id: string) => overview?.baljuoraCategories.find((category) => category.id === id)?.path ?? id.slice(0, 8), [overview]);
  const doogoCategoryName = useCallback((id: string) => overview?.doogoCategories.find((category) => category.id === id)?.name ?? "", [overview]);
  // 배송비 정책 이름: DB센터 정책 id(DB센터 쪽 값) 또는 발주오라 정책 id(발주오라 쪽 값)
  const policyName = useCallback((id: string) => overview?.doogoShippingPolicies?.find((policy) => policy.id === id)?.name
    ?? overview?.baljuoraShippingPolicies?.find((policy) => policy.id === id)?.name
    ?? id.slice(0, 8), [overview]);
  // 숫자 카드 팝업에서 칸 값 보기(변경 칩과 같은 모양)
  const statHelpers = useMemo(() => ({
    renderValue: (field: BaljuoraSyncField, value: string | number | null, auto?: boolean) => <DiffValue field={field} value={value} categoryPath={categoryPath} policyName={policyName} auto={auto} />,
    doogoCategoryName,
    categoryPath,
    policyLinked: (doogoPolicyId: string) => Boolean(overview?.settings.shippingPolicyMap?.[doogoPolicyId])
  }), [categoryPath, policyName, doogoCategoryName, overview]);

  const lists = useMemo(() => {
    const items = changes?.items ?? [];
    // 보낼 변경: 가격 등은 '발주오라에서 바뀜'만 빼고, 상품 정보 칸은 DB센터에서 바꾼 칸만(처음부터 다른 칸은 맞추기 카드에서 방향을 고름)
    const push = items.filter((item) => item.kind === "update" && (item.diffs.some((diff) => canPushDiff(diff, false)) || item.syncStatus === "failed"));
    const pull = items.filter((item) => item.kind === "update" && item.diffs.some((diff) => canPullDiff(diff, false)));
    const fresh = items.filter((item) => item.kind === "new");
    const changed = items.filter((item) => item.kind === "update" && item.diffs.some(isDoogoChange));
    return { changed, push, pull, new: fresh, newVisible: fresh.filter((item) => item.isVisible) };
  }, [changes]);
  // DB센터에서 바꾼 칸별 상품 수(요약 줄)
  const changedFieldCounts = useMemo(() => {
    const counts = new Map<BaljuoraSyncField, number>();
    lists.changed.forEach((item) => item.diffs.filter(isDoogoChange).forEach((diff) => counts.set(diff.field, (counts.get(diff.field) ?? 0) + 1)));
    return [...counts.entries()];
  }, [lists]);
  // 처음 열 때 DB센터에서 바꾼 상품이 있으면 그 탭부터 보여 줍니다(관리자가 고른 탭은 그대로).
  const tabTouched = useRef(false);
  useEffect(() => {
    if (!tabTouched.current && changes && lists.changed.length > 0) setTab("changed");
  }, [changes, lists.changed.length]);
  const chooseTab = (next: Tab) => { tabTouched.current = true; setTab(next); };

  const rows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const match = (text: string) => !keyword || text.toLowerCase().includes(keyword);
    if (tab === "only") return (changes?.baljuoraOnly ?? []).filter((item) => match(`${item.code ?? ""} ${item.name}`));
    const source = tab === "changed" ? lists.changed : tab === "push" ? lists.push : tab === "pull" ? lists.pull : includeHidden ? lists.new : lists.newVisible;
    return source.filter((item) => match(`${item.code ?? ""} ${item.name} ${item.supplierName ?? ""}`));
  }, [tab, query, lists, includeHidden, changes]);

  // 신규 등록 탭에서 바로 연결할 수 있는 '이름이 같은 발주오라 상품' 줄(검색·숨김 보기 조건 그대로)
  const sameNameRows = useMemo(() => (tab === "new" ? rows.filter((row): row is ChangeItem => "productId" in row && Boolean(row.sameName && !row.sameName.blocked && row.sameName.code)) : []), [tab, rows]);

  useEffect(() => { setPage(1); setSelected(new Set()); }, [tab, query, includeHidden]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const rowId = (row: ChangeItem | BaljuoraProductSnapshot) => ("productId" in row ? row.productId : row.id);
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(rowId(row)));

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map(rowId)));

  const startJob = async (body: unknown, kind: "compare" | "push") => {
    setBusy(kind);
    try {
      const created = await readData<{ job: JobView; code: string; consoleUrl: string }>(await apiFetch("/baljuora/admin/jobs", jsonInit("POST", body)));
      setJob({ view: created.job, code: created.code, consoleUrl: created.consoleUrl });
      saveJobCode({ id: created.job.id, type: created.job.type, code: created.code, consoleUrl: created.consoleUrl, expiresAt: created.job.expiresAt });
      const message = runnerOpenMessage("발주오라 관리자 창을 열었습니다. 그 창에서 책갈피 '두고푸드 동기화'를 눌러 주세요.");
      openBaljuoraWindow(created.consoleUrl);
      toast.success(message);
      setSelected(new Set());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "작업을 만들지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  const pushSelected = () => {
    let ids = [...selected];
    if (ids.length === 0) return toast.info("동기화할 상품을 골라 주세요.");
    if (tab === "changed") return pushChanged(ids);
    if (tab === "new") {
      // 발주오라에 이름이 같은 상품이 있으면 발주오라가 새로 받지 않아(매번 실패) 보내지 않고 '같은 상품으로 연결'로 안내합니다.
      const sameNameIds = new Set(lists.new.filter((item) => item.sameName).map((item) => item.productId));
      const skipped = ids.filter((id) => sameNameIds.has(id)).length;
      ids = ids.filter((id) => !sameNameIds.has(id));
      if (skipped > 0) toast.info(`발주오라에 이름이 같은 상품이 있는 ${skipped}개는 보내지 않았어요. 그 상품 줄의 '같은 상품으로 연결'을 눌러 주세요.`);
      if (ids.length === 0) return;
    }
    void startJob({ type: "push", productIds: ids }, "push");
  };

  // 같은 상품으로 연결(2026-11-27 직원 신고 "신규 등록 3건 → 이미 발주오라에 있습니다"): DB센터 상품코드를 발주오라 상품코드로 바꿔 잇고,
  // 같은 발주오라 상품에 연결돼 있던 DB센터 숨김 중복 상품은 지웁니다(발주오라는 바뀌지 않음).
  const linkSameName = async (targets: ChangeItem[]) => {
    const linkable = targets.filter((item) => item.sameName && !item.sameName.blocked && item.sameName.code);
    if (linkable.length === 0) return toast.info("바로 연결할 수 있는 상품이 없습니다.");
    const duplicates = linkable.filter((item) => item.sameName?.holder && !item.sameName.holder.deleted);
    const first = linkable[0];
    const firstSame = first.sameName as SameName;
    const lines = linkable.length === 1 ? [
      `'${first.name}'을(를) 발주오라 상품(상품코드 ${firstSame.code})과 같은 상품으로 연결할까요?`,
      "",
      `· DB센터 상품코드 ${first.code ?? "없음"} → ${firstSame.code} (발주오라와 같은 코드로 바꿔 1:1로 연결해요)`,
      firstSame.holder && !firstSame.holder.deleted ? `· 이 발주오라 상품에 연결돼 있던 DB센터 숨김 상품 '${firstSame.holder.name}'(${firstSame.holder.code ?? "상품코드 없음"})은 중복이라 삭제해요.` : "",
      "· 발주오라는 바뀌지 않아요. 연결 뒤 값이 다른 칸은 '보낼 변경(전체)'과 맞추기 카드에서 방향을 골라 맞춰요."
    ] : [
      `발주오라에 이름이 같은 상품이 있는 ${linkable.length}개를 같은 상품으로 연결할까요?`,
      "",
      `· DB센터 상품코드를 발주오라 상품코드로 바꿔 1:1로 연결해요(${linkable.slice(0, 3).map((item) => `${item.code ?? "없음"} → ${item.sameName?.code}`).join(", ")}${linkable.length > 3 ? " 등" : ""}).`,
      duplicates.length > 0 ? `· 같은 발주오라 상품에 연결돼 있던 DB센터 숨김 중복 상품 ${duplicates.length}개는 삭제해요.` : "",
      "· 발주오라는 바뀌지 않아요. 연결 뒤 값이 다른 칸은 '보낼 변경(전체)'과 맞추기 카드에서 방향을 골라 맞춰요."
    ];
    if (!window.confirm(lines.filter(Boolean).join("\n"))) return;
    setBusy("link");
    try {
      const result = await readData<{ linked: number; removed: number; failed: Array<{ name: string; error: string }> }>(await apiFetch("/baljuora/admin/link-same-name", jsonInit("POST", { productIds: linkable.map((item) => item.productId) })));
      if (result.linked > 0) toast.success(`${result.linked}개를 발주오라 상품과 연결했습니다${result.removed ? ` · DB센터 숨김 중복 상품 ${result.removed}개 삭제` : ""}.`);
      if (result.failed.length > 0) toast.error(`${result.failed.length}개는 연결하지 못했습니다: ${result.failed.slice(0, 2).map((item) => `${item.name} (${item.error})`).join(", ")}`);
      setSelected(new Set());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "연결하지 못했습니다.");
    } finally {
      setBusy("");
      await load();
    }
  };

  // DB센터에서 바꿈: 고른 상품의 'DB센터에서 바뀜·양쪽에서 바뀜' 칸만 보냅니다('처음부터 다름' 칸은 건드리지 않음).
  // 카테고리 맞추기(추가·이름 바꾸기)가 있으면 서버가 같은 작업에 먼저 넣습니다.
  const pushChanged = (ids: string[]) => {
    const fieldsByProduct: Record<string, BaljuoraSyncField[]> = {};
    const wanted = new Set(ids);
    lists.changed.forEach((item) => {
      if (!wanted.has(item.productId)) return;
      const fields = item.diffs.filter(isDoogoChange).map((diff) => diff.field);
      if (fields.length) fieldsByProduct[item.productId] = fields;
    });
    const productIds = Object.keys(fieldsByProduct);
    if (productIds.length === 0) return toast.info("DB센터에서 바꾼 칸이 있는 상품을 골라 주세요.");
    void startJob({ type: "push", productIds, fieldsByProduct }, "push");
  };

  // 요약 줄의 "바꾼 것 모두 보내기": DB센터에서 바꾼 상품의 바꾼 칸 + 카테고리 맞추기를 한 작업으로 보냅니다.
  const pushAllChanged = () => {
    const productCount = lists.changed.length;
    const ops = overview?.categoryTree?.ops.length ?? 0;
    if (productCount === 0 && ops === 0) return;
    if (productCount === 0) return pushCategoryTree();
    const parts = [`상품 ${productCount.toLocaleString("ko-KR")}개의 바꾼 칸(${changedFieldCounts.map(([field, count]) => `${BALJUORA_FIELD_SHORT_LABELS[field]} ${count}`).join(", ")})`];
    if (ops > 0) parts.push(`카테고리 ${ops}건(추가·이름 변경, 먼저 보냄)`);
    if (!window.confirm(`DB센터에서 바꾼 ${parts.join("과 ")}을 발주오라에 보냅니다. '처음부터 다름' 칸은 보내지 않습니다. 계속할까요?`)) return;
    pushChanged(lists.changed.map((item) => item.productId));
  };

  const pushCategoryTree = () => {
    const ops = overview?.categoryTree?.ops ?? [];
    if (ops.length === 0) return;
    if (!window.confirm(`발주오라 상품 카테고리에 ${ops.length}건(추가·이름 변경)을 보냅니다. 발주오라 카테고리는 지우지 않고, 브랜드별은 건드리지 않습니다. 계속할까요?`)) return;
    void startJob({ type: "push", productIds: [], categoryTree: true }, "push");
  };

  const pullSelected = async () => {
    const ids = [...selected];
    if (ids.length === 0) return toast.info("가져올 상품을 골라 주세요.");
    const onlyById = new Map((changes?.baljuoraOnly ?? []).map((snapshot) => [snapshot.id, snapshot]));
    const restoreCount = tab === "only" ? ids.filter((id) => onlyById.get(id)?.deletedMatch).length : 0;
    const sameNameCount = tab === "only" ? ids.filter((id) => onlyById.get(id)?.sameNameProduct).length : 0;
    const message = tab === "only"
      ? [
        `발주오라에만 있는 상품 ${ids.length}개를 DB센터에 등록할까요? (공개 단가표에는 숨김으로 등록됩니다)`,
        restoreCount > 0 ? `· 그중 ${restoreCount}개는 DB센터에서 지운 상품과 상품코드가 같아 새로 만들지 않고 그 상품을 숨김으로 되살려 발주오라 값으로 채워요.` : "",
        sameNameCount > 0 ? `· 그중 ${sameNameCount}개는 DB센터에 이름이 같은 상품이 있어요. 같은 상품이면 취소하고 '신규 등록' 탭에서 '같은 상품으로 연결'을 눌러 주세요(가져오면 같은 이름 상품이 하나 더 생겨요).` : ""
      ].filter(Boolean).join("\n")
      : `고른 ${ids.length}개 상품의 DB센터 값을 발주오라 값으로 바꿀까요? (가격이 바뀌면 가격변동 이력에 남습니다)`;
    if (!window.confirm(message)) return;
    setBusy("pull");
    // 많이 고르면(처음 맞출 때 전체 선택 등) 25개씩 나눠 보냅니다(서버는 한 번에 500개까지, 함수 시간 제한도 넘지 않게).
    const total = { updated: 0, created: 0, restored: 0, failed: [] as Array<{ name: string; error: string }> };
    let done = 0;
    setPullProgress({ done: 0, total: ids.length });
    try {
      for (let index = 0; index < ids.length; index += PULL_CHUNK) {
        const part = ids.slice(index, index + PULL_CHUNK);
        // '발주오라에서 바뀜' 탭: 발주오라에서 바뀐 칸만 가져옵니다(DB센터에서 고친 칸은 그대로).
        const body = tab === "only" ? { baljuoraIds: part } : { productIds: part, onlyPulled: true };
        const result = await readData<{ updated: number; created: number; restored?: number; failed: Array<{ name: string; error: string }> }>(await apiFetch("/baljuora/admin/pull", jsonInit("POST", body)));
        total.updated += result.updated;
        total.created += result.created;
        total.restored += result.restored ?? 0;
        total.failed.push(...result.failed);
        done += part.length;
        setPullProgress({ done, total: ids.length });
      }
      toast.success(tab === "only" ? `${total.created}개를 DB센터에 등록했습니다${total.restored ? `(지운 상품 ${total.restored}개는 숨김으로 되살림)` : ""}.` : `${total.updated}개를 발주오라 값으로 바꿨습니다.`);
      if (total.failed.length) toast.error(`${total.failed.length}개 실패: ${total.failed.slice(0, 2).map((item) => `${item.name} (${item.error})`).join(", ")}`);
      setSelected(new Set());
    } catch (error) {
      const reason = error instanceof Error ? error.message : "가져오지 못했습니다.";
      toast.error(done > 0 ? `${ids.length}개 중 ${done}개까지 가져오고 멈췄습니다: ${reason}` : reason);
    } finally {
      setPullProgress(null);
      setBusy("");
      await load();
    }
  };

  const ignoreSelected = async () => {
    const ids = [...selected];
    if (ids.length === 0) return toast.info("상품을 골라 주세요.");
    if (!window.confirm(`고른 ${ids.length}개 상품의 지금 다른 값을 그대로 두고 목록에서 뺄까요? (어느 한쪽 값이 또 바뀌면 다시 보입니다)`)) return;
    setBusy("ignore");
    try {
      const result = await readData<{ ignored: number }>(await apiFetch("/baljuora/admin/ignore", jsonInit("POST", { productIds: ids })));
      toast.success(`${result.ignored}개 상품을 이대로 두었습니다.`);
      setSelected(new Set());
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "처리하지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  const cancelJob = async () => {
    if (!job) return;
    setBusy("cancel");
    try {
      const { job: view } = await readData<{ job: JobView }>(await apiFetch(`/baljuora/admin/jobs/${job.view.id}/cancel`, { method: "POST" }));
      clearJobCode(job.view.id);
      setJob({ ...job, view });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "취소하지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  const saveSettings = async () => {
    if (!settingsDraft) return;
    setBusy("settings");
    try {
      const { settings } = await readData<{ settings: Settings }>(await apiFetch("/baljuora/admin/settings", jsonInit("PUT", settingsDraft)));
      setSettingsDraft(settings);
      toast.success("동기화 설정을 저장했습니다.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "설정을 저장하지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  const openJobDetail = async (id: string) => {
    try {
      const { job: detail } = await readData<{ job: JobView }>(await apiFetch(`/baljuora/admin/jobs/${id}`));
      setOpenJob(detail);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "작업을 불러오지 못했습니다.");
    }
  };

  if (loading) return <div className="admin-loading inline"><div className="spinner" /><span>발주오라 동기화 정보를 불러오는 중…</span></div>;

  const compared = Boolean(changes?.compared);
  const counts = { changed: lists.changed.length, push: lists.push.length, new: includeHidden ? lists.new.length : lists.newVisible.length, pull: lists.pull.length, only: changes?.baljuoraOnly.length ?? 0 };
  const treeOps = overview?.categoryTree?.ops.length ?? 0;
  const view = job?.view;
  const jobDone = view && !["waiting", "running"].includes(view.status);
  const progressPercent = view?.progress && view.progress.total > 0 ? Math.min(100, Math.round((view.progress.done / view.progress.total) * 100)) : view?.status === "done" ? 100 : 6;

  return (
    <div className="bj-sync">
      <div className="admin-page-heading">
        <div>
          <span>BALJUORA SYNC</span>
          <h1>발주오라 동기화</h1>
          <p>DB센터와 발주오라 도매몰의 상품·가격·썸네일·카테고리·배송비 정책·판매 상태(품절·도매몰 노출)·상품 정보(과세·원산지·관리코드·바코드·내용량 등)를 양쪽 같게 맞춥니다. DB센터에서 고친 값은 발주오라로 보내고(보낼 변경), 발주오라에서 먼저 고친 값은 발주오라 기준으로 가져옵니다.</p>
        </div>
        <button type="button" className="outline-button" onClick={() => { setLoading(true); void load(); }}><RefreshCw size={15} /> 새로고침</button>
      </div>

      {/* 입금·정산 반영 도우미(2026-11-23 관리자 요청): 발주오라 정산 관리 > 입/출금 계좌 조회의 버튼을 책갈피가 대신 누름 */}
      <section className="admin-card bj-settle" aria-labelledby="bj-settle-title">
        <div className="bj-settle-copy">
          <h2 id="bj-settle-title"><Landmark size={18} aria-hidden="true" /> 입금·정산 반영 도우미</h2>
          <p>발주오라 <b>정산 관리 › 입/출금 계좌 조회</b>에서 손으로 하던 정산 반영을 책갈피 한 번으로 대신 눌러 드려요.</p>
          <ol>
            <li>발주오라 입/출금 계좌 조회 화면(또는 <b>발주오라 정산 화면 열기</b>로 연 창)에서 즐겨찾기의 <b>두고푸드 동기화</b>를 누릅니다.</li>
            <li><b>계좌내역 조회</b>로 새 입출금을 모은 뒤, <b>업체구분·거래처명이 모두 들어간 정산 대기 건</b>만 골라 목록을 보여 줍니다.</li>
            <li>목록을 확인하고 <b>N건 정산 반영하기</b>를 누르면 <b>정산 반영 처리 → 적용하기</b>까지 눌러 줍니다. 매출처 입금 건은 발주오라가 주문대기 주문을 주문접수로 넘겨요.</li>
          </ol>
          <small>거래처가 비어 있는 건은 건드리지 않고 "직접 확인할 건"으로 알려 줘요. 발주오라 <b>자동 매칭 관리</b>에서 매칭마다 <b>자동 정산완료</b>를 켜 두면, 그 거래처의 새 계좌내역은 발주오라가 확인 없이 바로 정산완료 처리합니다.</small>
        </div>
        <div className="bj-settle-action">
          <BaljuoraWindowLink className="bj-settle-open" href={`${BALJUORA_CONSOLE_ORIGIN}/${overview?.settings.merchantSlug || BALJUORA_DEFAULT_MERCHANT_SLUG}/dashboard#doogo-settle`}><ExternalLink size={15} aria-hidden="true" /> 발주오라 정산 화면 열기</BaljuoraWindowLink>
          <small>열린 창에서 책갈피를 누르면 입/출금 계좌 조회로 이동해 시작해요(오른쪽 아래 동기화 버튼이 켜진 창이면 바로 시작).</small>
        </div>
      </section>

      <section className="admin-card bj-howto">
        <div className="bj-howto-copy">
          <h2><Bookmark size={18} aria-hidden="true" /> 처음 한 번: 책갈피 만들기</h2>
          <p>발주오라는 API가 없고 로그인에 사람 확인이 있어서, <b>로그인해 둔 발주오라 관리자 창</b>에서 책갈피를 눌러 실행합니다. {mobileDevice ? <>휴대폰은 아래 <b>휴대폰에서 책갈피 쓰기</b> 순서대로 북마크를 하나 만들어 두세요.</> : "아래 버튼을 브라우저 즐겨찾기(북마크) 막대로 끌어다 놓으세요."}</p>
          <ol>
            <li>DB센터에서 <b>발주오라 상품 불러오기</b> 또는 <b>동기화</b>를 누르면 발주오라 관리자 창이 열립니다.</li>
            <li>열린 창에서 로그인돼 있는지 확인하고, {mobileDevice ? "북마크" : "즐겨찾기 막대"}의 <b>두고푸드 동기화</b>를 누릅니다.</li>
            <li>발주오라 창 오른쪽 아래에 진행 상황이 나오고, 이 화면에도 결과가 보입니다.</li>
          </ol>
          <p className="bj-howto-fab"><b>한 번 누른 발주오라 창에는 오른쪽 아래 '동기화' 버튼이 남아요.</b> 그 창을 닫지 않으면 다음부터는 DB센터 버튼만 눌러도 그 창에서 바로 시작돼요(책갈피를 다시 누르지 않아도 돼요). 버튼을 누르면 작업 코드로 시작하거나 입금·정산 반영을 고를 수 있어요.</p>
        </div>
        {!mobileDevice && (
          <div className="bj-howto-action">
            <BookmarkletLink origin={origin} />
            <small>즐겨찾기 막대가 안 보이면 Ctrl+Shift+B(맥은 ⌘+Shift+B)</small>
          </div>
        )}
        <MobileBookmarkletGuide origin={origin} open={mobileDevice} />
      </section>

      {/* 숫자 카드를 누르면 그 상품 목록 팝업(2026-11-27 관리자 요청 "누르면 어떤 상품인지 팝업으로, 20개씩 1/2/3 페이지") */}
      <div className="bj-stats">
        <button type="button" className="bj-stat-card" onClick={() => setStat("linked")} aria-label={`연결된 상품 ${(changes?.linkedCount ?? 0).toLocaleString("ko-KR")}개 목록 보기`}><span>연결된 상품</span><strong>{(changes?.linkedCount ?? 0).toLocaleString("ko-KR")}</strong><small>DB센터 상품 {(changes?.productCount ?? 0).toLocaleString("ko-KR")}개 중</small><em className="bj-stat-more">목록 보기 ›</em></button>
        <button type="button" className={`bj-stat-card${counts.push > 0 ? " is-attention" : ""}`} onClick={() => setStat("push")} aria-label={`보낼 변경 ${counts.push.toLocaleString("ko-KR")}개 상세 보기`}><span>보낼 변경</span><strong>{counts.push.toLocaleString("ko-KR")}</strong><small>DB센터에서 바뀐 상품</small><em className="bj-stat-more">무엇을 보내는지 ›</em></button>
        <button type="button" className={`bj-stat-card${counts.new > 0 ? " is-attention" : ""}`} onClick={() => setStat("new")} disabled={!compared} aria-label={`신규 등록 ${compared ? counts.new.toLocaleString("ko-KR") : ""}개 목록 보기`}><span>신규 등록</span><strong>{compared ? counts.new.toLocaleString("ko-KR") : "-"}</strong><small>발주오라에 없는 노출 상품</small>{compared && <em className="bj-stat-more">목록 보기 ›</em>}</button>
        <button type="button" className="bj-stat-card" onClick={() => setStat("only")} disabled={!compared} aria-label={`발주오라에만 있음 ${compared ? counts.only.toLocaleString("ko-KR") : ""}개 목록 보기`}><span>발주오라에만 있음</span><strong>{compared ? counts.only.toLocaleString("ko-KR") : "-"}</strong><small>DB센터에 없는 발주오라 상품</small>{compared && <em className="bj-stat-more">목록 보기 ›</em>}</button>
        <article><span>마지막 비교 · 동기화</span><strong className="bj-stat-time">{formatDateTime(overview?.lastCompareAt ?? null)}</strong><small>동기화 {formatDateTime(overview?.lastPushAt ?? null)}</small></article>
      </div>

      {view && (
        <section className={`admin-card bj-job is-${view.status}`} aria-live="polite">
          <div className="bj-job-head">
            <div>
              <span className="bj-job-kind">{view.type === "compare" ? `발주오라 상품 불러오기(비교)${view.salesRange ? " + 판매·매출처" : ""}` : view.type === "sales" ? `판매·매출처 불러오기${view.salesRange ? ` (${view.salesRange.start} ~ ${view.salesRange.end})` : ""}` : `동기화 ${view.total ?? 0}개`}</span>
              <h2>{STATUS_LABELS[view.status]}{view.status === "running" && <Loader2 className="bj-spin" size={18} aria-hidden="true" />}</h2>
            </div>
            {jobDone ? <button type="button" className="bj-icon-button" onClick={() => { clearJobCode(view.id); setJob(null); }} aria-label="작업 닫기"><X size={18} /></button> : <button type="button" className="outline-button" onClick={() => void cancelJob()} disabled={busy === "cancel"}>작업 취소</button>}
          </div>
          {view.status === "waiting" && (
            <div className="bj-job-waiting">
              <p>열린 <b>발주오라 관리자 창</b>에서 즐겨찾기 막대의 <b>두고푸드 동기화</b>를 눌러 주세요. 로그인 화면이 나오면 로그인한 뒤 다시 누르면 됩니다.</p>
              <BaljuoraJobCode
                jobId={view.id}
                code={job?.code ?? null}
                expiresAt={view.expiresAt}
                onReissued={(result: ReissuedJobCode<JobView>) => {
                  saveJobCode({ id: result.job.id, type: result.job.type, code: result.code, consoleUrl: result.consoleUrl, expiresAt: result.job.expiresAt });
                  setJob({ view: result.job, code: result.code, consoleUrl: result.consoleUrl });
                }}
              />
              {job?.consoleUrl && <BaljuoraWindowLink className="primary-action" href={job.consoleUrl}><ExternalLink size={15} /> 발주오라 관리자 창 다시 열기</BaljuoraWindowLink>}
              <BaljuoraRunnerHint />
            </div>
          )}
          <div className="bj-progress"><div style={{ width: `${progressPercent}%` }} /></div>
          <p className="bj-job-message">{view.progress?.message ?? ""}</p>
          {jobDone && view.summary && (
            <div className="bj-job-summary">
              {view.type === "compare"
                ? <span>발주오라 상품 {Number(view.summary.received ?? 0).toLocaleString("ko-KR")}개 읽음 · 연결 {Number(view.summary.linked ?? 0).toLocaleString("ko-KR")}개 · 발주오라에만 있음 {Number(view.summary.baljuoraOnly ?? 0).toLocaleString("ko-KR")}개{salesText(view.summary.sales)}</span>
                : view.type === "sales"
                  ? <span>{salesText(view.summary).replace(/^ · /, "")} · <a href="/admin/sales">판매 현황 보기</a></span>
                  : <span>성공 {Number(view.summary.succeeded ?? 0)}개 (신규 {Number(view.summary.created ?? 0)} · 수정 {Number(view.summary.updated ?? 0)}) · 실패 {Number(view.summary.failed ?? 0)}개</span>}
              {typeof view.summary.error === "string" && view.summary.error && <p className="bj-error"><AlertTriangle size={15} aria-hidden="true" /> {view.summary.error}</p>}
              <button type="button" className="outline-button" onClick={() => void openJobDetail(view.id)}>자세히 보기</button>
            </div>
          )}
        </section>
      )}

      <section className="admin-card bj-actions">
        <div>
          <span className="bj-direction is-push">DB센터 → 발주오라</span>
          <h2>{compared ? "변경 목록" : "먼저 발주오라 상품을 불러와 주세요"}</h2>
          <p>{compared ? "고른 상품만 동기화합니다. 처음에는 1~2개로 먼저 해 보고 발주오라에서 확인한 뒤 나머지를 보내 주세요." : "두 쪽 상품을 상품코드로 연결해야 무엇이 다른지 정확히 보입니다. 발주오라 상품은 바뀌지 않습니다(읽기만 함)."}</p>
        </div>
        <button type="button" className={compared ? "outline-button" : "primary-action"} onClick={() => void startJob({ type: "compare" }, "compare")} disabled={Boolean(busy) || jobActive}>
          {busy === "compare" ? <Loader2 className="bj-spin" size={15} /> : <Link2 size={15} />} 발주오라 상품 불러오기(비교)
        </button>
      </section>

      <BaljuoraMasterPanel
        items={changes?.items ?? []}
        baljuoraOnlyIds={(changes?.baljuoraOnly ?? []).filter((snapshot) => !snapshot.sameNameProduct).map((snapshot) => snapshot.id)}
        restoreCount={(changes?.baljuoraOnly ?? []).filter((snapshot) => snapshot.deletedMatch && !snapshot.sameNameProduct).length}
        sameNameOnlyCount={(changes?.baljuoraOnly ?? []).filter((snapshot) => snapshot.sameNameProduct).length}
        doogoOnlyCount={lists.new.length}
        compared={compared}
        lastCompareAt={changes?.lastCompareAt ?? overview?.lastCompareAt ?? null}
        disabled={Boolean(busy) || jobActive}
        onCompare={() => void startJob({ type: "compare" }, "compare")}
        onDone={load}
        onPush={(fieldsByProduct) => void startJob({ type: "push", productIds: Object.keys(fieldsByProduct), fieldsByProduct }, "push")}
      />
      {changes?.compared && changes.extrasReady === false && (
        <p className="bj-notice"><AlertTriangle size={15} aria-hidden="true" /> 상품 정보 칸(과세 여부·관리코드·바코드·내용량 등)은 DB 업데이트(037)가 적용된 뒤(운영 배포 후)부터 비교·동기화돼요. 지금은 판매 상태(품절·노출)·원산지·택배사·과세만 비교해요.</p>
      )}

      {changes?.compared && changes.groupPriceReadable === false && (
        <p className="bj-notice"><AlertTriangle size={15} aria-hidden="true" /> 지금 목록은 수강생 단가(‘{overview?.settings.groupKeyword || "황금농부"}’ 매출처 그룹 공급가)를 읽기 전 비교 결과예요. <b>발주오라 상품 불러오기(비교)</b>를 한 번 다시 하면 수강생 단가·매입원가·카테고리를 새로 읽어 진짜 차이만 남아요(그 전에 보내는 상품도 수강생 단가를 함께 맞춥니다).</p>
      )}
      {changes && changes.unmappedCategories.length > 0 && overview && overview.baljuoraCategories.length > 0 && (
        <p className="bj-notice"><AlertTriangle size={15} aria-hidden="true" /> 발주오라 카테고리와 연결되지 않은 DB센터 카테고리 {changes.unmappedCategories.length}개: {changes.unmappedCategories.slice(0, 4).map((category) => category.name).join(", ")}{changes.unmappedCategories.length > 4 ? " 등" : ""} · <button type="button" onClick={() => setSettingsOpen(true)}>카테고리 연결하기</button></p>
      )}

      {compared && (counts.changed > 0 || treeOps > 0) && (
        <section className="bj-changed-strip" aria-label="DB센터에서 바꾼 것">
          <div className="bj-changed-text">
            <span className="bj-direction is-push">DB센터 → 발주오라</span>
            <strong>DB센터에서 바꾼 것 · 발주오라에 보낼 것</strong>
            <span>
              {counts.changed > 0 && <>상품 <b>{counts.changed.toLocaleString("ko-KR")}개</b> — {changedFieldCounts.map(([field, count]) => `${BALJUORA_FIELD_SHORT_LABELS[field]} ${count.toLocaleString("ko-KR")}`).join(" · ")}</>}
              {counts.changed > 0 && treeOps > 0 && <> · </>}
              {treeOps > 0 && <>카테고리 <b>{treeOps}건</b>(추가·이름 변경)</>}
            </span>
          </div>
          <div className="bj-changed-actions">
            {counts.changed > 0 && <button type="button" className="outline-button" onClick={() => chooseTab("changed")}>목록 보기</button>}
            <button type="button" className="primary-action" onClick={pushAllChanged} disabled={Boolean(busy) || jobActive}>{busy === "push" ? <Loader2 className="bj-spin" size={15} /> : <Send size={15} />} 바꾼 것 모두 보내기</button>
          </div>
        </section>
      )}

      <BaljuoraCategoryTreeCard
        tree={overview?.categoryTree}
        doogoCategories={overview?.doogoCategories ?? []}
        baljuoraCategories={overview?.baljuoraCategories ?? []}
        disabled={Boolean(busy) || jobActive}
        sending={busy === "push"}
        onSend={pushCategoryTree}
        onChanged={load}
      />

      {/* DB센터 ↔ 발주오라 상품 수 맞춰 보기(2026-11-27 관리자 요청 "발주오라 2,998개인데 DB센터 2,143개 — 왜 안 맞아?") */}
      <BaljuoraReconcileCard stamp={changes} disabled={Boolean(busy) || jobActive} onChanged={load} onCompare={() => startJob({ type: "compare" }, "compare")} />

      {stat && (
        <BaljuoraStatModal
          kind={stat}
          count={stat === "linked" ? changes?.linkedCount ?? 0 : stat === "push" ? counts.push : stat === "new" ? counts.new : counts.only}
          onClose={() => setStat(null)}
          onOpenTab={(next) => {
            chooseTab(next);
            window.requestAnimationFrame(() => document.querySelector(".bj-list")?.scrollIntoView({ behavior: "smooth", block: "start" }));
          }}
          pushItems={lists.push}
          newItems={includeHidden ? lists.new : lists.newVisible}
          onlyItems={changes?.baljuoraOnly ?? []}
          helpers={statHelpers}
          lastCompareAt={changes?.lastCompareAt ?? overview?.lastCompareAt ?? null}
        />
      )}

      <section className="admin-card bj-list">
        <div className="bj-tabs" role="tablist" aria-label="변경 종류">
          {([
            ["changed", "DB센터에서 바꿈", counts.changed],
            ["push", "보낼 변경(전체)", counts.push],
            ["new", "신규 등록", counts.new],
            ["pull", "발주오라에서 바뀜", counts.pull],
            ["only", "발주오라에만 있음", counts.only]
          ] as Array<[Tab, string, number]>).map(([key, label, count]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={`${tab === key ? "active" : ""}${key === "changed" ? " is-changed" : ""}`} onClick={() => chooseTab(key)}>{label}<b>{count.toLocaleString("ko-KR")}</b></button>
          ))}
        </div>
        <div className="bj-toolbar">
          <div className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="상품코드·상품명·매입처 검색" /></div>
          {tab === "new" && <label className="bj-check"><input type="checkbox" checked={includeHidden} onChange={(event) => setIncludeHidden(event.target.checked)} /> 숨긴 상품도 보기</label>}
          <div className="bj-toolbar-actions">
            <span>{selected.size > 0 ? `${selected.size}개 선택` : `${rows.length.toLocaleString("ko-KR")}개`}</span>
            {tab === "new" && sameNameRows.length > 0 && <button type="button" className="outline-button bj-same-all" onClick={() => void linkSameName(sameNameRows)} disabled={Boolean(busy)}>{busy === "link" ? <Loader2 className="bj-spin" size={15} /> : <Link2 size={15} />} 이름 같은 상품 연결 {sameNameRows.length}개</button>}
            {(tab === "changed" || tab === "push" || tab === "new") && <button type="button" className="primary-action" onClick={pushSelected} disabled={!compared || selected.size === 0 || Boolean(busy) || jobActive}>{busy === "push" ? <Loader2 className="bj-spin" size={15} /> : <Send size={15} />} 선택 {selected.size}개 {tab === "changed" ? "바꾼 칸 보내기" : "동기화"}</button>}
            {(tab === "pull" || tab === "only") && <button type="button" className="primary-action" onClick={() => void pullSelected()} disabled={selected.size === 0 || Boolean(busy)}>{busy === "pull" ? <Loader2 className="bj-spin" size={15} /> : <ArrowDownToLine size={15} />} {busy === "pull" && pullProgress ? `가져오는 중 ${pullProgress.done.toLocaleString("ko-KR")} / ${pullProgress.total.toLocaleString("ko-KR")}` : tab === "only" ? "DB센터로 가져오기" : "발주오라 값 가져오기"}</button>}
            {(tab === "changed" || tab === "push" || tab === "pull") && <button type="button" className="outline-button" onClick={() => void ignoreSelected()} disabled={selected.size === 0 || Boolean(busy)}>이대로 두기</button>}
          </div>
        </div>
        {!compared && tab !== "push" && tab !== "changed" ? (
          <div className="empty-admin">먼저 <b>발주오라 상품 불러오기(비교)</b>를 해 주세요.</div>
        ) : rows.length === 0 ? (
          <div className="empty-admin">{tab === "changed" ? "마지막으로 맞춘 뒤 DB센터에서 바꾼 값이 없습니다. (처음부터 다른 값은 '보낼 변경(전체)' 탭에 있습니다.)" : tab === "push" ? "보낼 변경이 없습니다. DB센터와 발주오라 값이 같습니다." : tab === "new" ? "발주오라에 새로 등록할 상품이 없습니다." : tab === "pull" ? "발주오라에서 따로 바뀐 값이 없습니다." : "발주오라에만 있는 상품이 없습니다."}</div>
        ) : (
          <>
            <div className="bj-rows" role="list">
              <label className="bj-row bj-row-head"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="전체 선택" /><span>전체 {rows.length.toLocaleString("ko-KR")}개 선택</span></label>
              {pagedRows.map((row) => {
                if (!("productId" in row)) {
                  const snapshot = row;
                  return (
                    <label key={snapshot.id} className="bj-row" role="listitem">
                      <input type="checkbox" checked={selected.has(snapshot.id)} onChange={() => toggle(snapshot.id)} />
                      {snapshot.imageUrls[0] ? <img className="bj-row-thumb" src={snapshot.imageUrls[0]} alt="" loading="lazy" /> : <span className="bj-row-thumb is-empty" />}
                      <div className="bj-row-main">
                        <strong>{snapshot.name || "(이름 없음)"}</strong>
                        <small>{snapshot.code ?? "상품코드 없음"} · 공급가 {won(snapshot.supplyPrice)}{snapshot.isVisible === false ? " · 발주오라 미노출" : ""}</small>
                        {(snapshot.deletedMatch || snapshot.sameNameProduct) && (
                          <div className="bj-diffs">
                            {snapshot.deletedMatch && <span className="bj-diff is-restore" title={`DB센터에서 지운 상품 '${snapshot.deletedMatch.name}'이 같은 상품코드(${snapshot.deletedMatch.code})를 갖고 있어요. 'DB센터로 가져오기'를 하면 새로 만들지 않고 그 상품을 숨김으로 되살려 발주오라 값으로 채우고 연결해요.`}>DB센터에서 지운 상품 · 가져오면 숨김으로 되살려요</span>}
                            {snapshot.sameNameProduct && <span className="bj-diff is-supplier">DB센터에 이름이 같은 상품({snapshot.sameNameProduct.code ?? "상품코드 없음"}) · 같은 상품이면 '신규 등록' 탭에서 연결해 주세요</span>}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                }
                const item = row;
                const shown = tab === "pull" ? item.diffs.filter((diff) => canPullDiff(diff, false)) : tab === "changed" ? item.diffs.filter(isDoogoChange) : item.diffs.filter((diff) => canPushDiff(diff, false));
                return (
                  <label key={item.productId} className={`bj-row${item.syncStatus === "failed" ? " is-failed" : ""}`} role="listitem">
                    <input type="checkbox" checked={selected.has(item.productId)} onChange={() => toggle(item.productId)} />
                    {item.imageUrl ? <img className="bj-row-thumb" src={item.imageUrl} alt="" loading="lazy" /> : <span className="bj-row-thumb is-empty" />}
                    <div className="bj-row-main">
                      <strong>{item.name}{!item.isVisible && <em className="bj-tag">숨김</em>}{item.syncStatus === "failed" && <em className="bj-tag is-danger">지난 동기화 실패</em>}</strong>
                      <small>{item.code ?? "상품코드 없음(발주오라가 새 코드를 만듭니다)"} · {doogoCategoryName(item.categoryId)}{item.supplierName ? ` · ${item.supplierName}` : ""}</small>
                      {item.kind === "new" && item.sameName ? (
                        <div className="bj-diffs bj-same">
                          <span className={`bj-diff is-same${item.sameName.blocked ? " is-blocked" : ""}`}>
                            <b>발주오라에 같은 이름 상품</b>
                            <span>{item.sameName.code ?? "상품코드 없음"}</span>
                            <i>{item.sameName.holder
                              ? item.sameName.holder.deleted
                                ? "DB센터에서 지운 상품과 연결돼 있었어요"
                                : item.sameName.holder.isVisible
                                  ? `DB센터 공개 상품 '${item.sameName.holder.name}'과 연결됨`
                                  : `DB센터 숨김 상품(${item.sameName.holder.code ?? "상품코드 없음"})과 연결됨 · 연결하면 그 중복 상품은 삭제`
                              : "아직 DB센터 상품과 연결 안 됨"}</i>
                          </span>
                          {item.sameName.blocked
                            ? <small className="bj-same-note">{item.sameName.blocked}</small>
                            : <button type="button" className="bj-same-link" onClick={(event) => { event.preventDefault(); event.stopPropagation(); void linkSameName([item]); }} disabled={Boolean(busy)}><Link2 size={13} aria-hidden="true" /> 같은 상품으로 연결</button>}
                        </div>
                      ) : item.kind === "new" ? (
                        <div className="bj-diffs">
                          <span className="bj-diff is-new">발주오라에 새로 등록</span>
                          {/* 새 상품은 복사한 상품의 매입처로 등록돼서, 같은 매입처 상품이 발주오라에 없으면 책갈피가 등록을 멈춥니다(1.8.0). */}
                          {item.newSupplier && <span className="bj-diff is-supplier" title="새 상품은 같은 매입처의 발주오라 상품을 복사해 등록합니다. 발주오라에 이 매입처 상품이 하나도 없으면 다른 매입처로 등록되지 않게 멈춥니다 — 발주오라에서 매입처를 만들고 첫 상품을 1개 직접 등록한 뒤 '발주오라 상품 불러오기(비교)'를 하고 동기화해 주세요.">새 매입처 · 발주오라에 같은 매입처 상품이 있어야 등록돼요</span>}
                        </div>
                      ) : (
                        <div className="bj-diffs">
                          {shown.map((diff) => {
                            // DB센터 배송 정책과 연결한 발주오라 매출배송정책이 없으면 이 칸은 보내지 않습니다(보내기에서 빠짐).
                            const needsPolicyLink = tab !== "pull" && diff.field === "shippingPolicy" && Boolean(diff.doogo) && !overview?.settings.shippingPolicyMap?.[String(diff.doogo)];
                            return (
                              <span key={diff.field} className={`bj-diff is-${diff.direction}${needsPolicyLink ? " is-blocked" : ""}`} title={needsPolicyLink ? "이 DB센터 배송 정책과 연결한 발주오라 매출배송정책이 없어 보내지 않습니다. 동기화 설정 > 배송비 정책 맞추기에서 연결해 주세요." : `${BALJUORA_FIELD_LABELS[diff.field]} · ${BALJUORA_DIRECTION_LABELS[diff.direction]}`}>
                                <b>{BALJUORA_FIELD_SHORT_LABELS[diff.field]}</b>
                                {tab === "pull"
                                  ? <><DiffValue field={diff.field} value={diff.doogo} categoryPath={categoryPath} policyName={policyName} auto={diff.doogoEmpty} /><ChevronLeft size={12} aria-hidden="true" /><DiffValue field={diff.field} value={diff.baljuora} categoryPath={categoryPath} policyName={policyName} /></>
                                  : <><DiffValue field={diff.field} value={diff.baljuora} categoryPath={categoryPath} policyName={policyName} /><ChevronRight size={12} aria-hidden="true" /><DiffValue field={diff.field} value={diff.doogo} categoryPath={categoryPath} policyName={policyName} auto={diff.doogoEmpty} /></>}
                                {needsPolicyLink ? <i className="bj-diff-need">연결 필요 · 보내지 않음</i> : diff.direction !== "push" && <i>{diff.direction === "pull" && diff.doogoEmpty ? "DB센터에 없음" : BALJUORA_DIRECTION_LABELS[diff.direction]}</i>}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
            {pageCount > 1 && (
              <div className="bj-pager">
                <button type="button" onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1} aria-label="이전 쪽"><ChevronLeft size={16} /></button>
                <span>{currentPage} / {pageCount}</span>
                <button type="button" onClick={() => setPage(Math.min(pageCount, currentPage + 1))} disabled={currentPage >= pageCount} aria-label="다음 쪽"><ChevronRight size={16} /></button>
              </div>
            )}
          </>
        )}
        <p className="bj-legend">{tab === "pull" ? "표시: DB센터 값 ← 발주오라 값. '발주오라 값 가져오기'는 DB센터 상품을 발주오라 값으로 바꿉니다(비어 있는 발주오라 값으로 DB센터 값을 지우지 않음)." : "표시: 지금 발주오라 값 → 보낼 DB센터 값. 공급가 ← 일반공급가 · 그룹 공급가 ← 수강생 단가 · 소비자가 ← 지정 판매가 · 매입원가 ← 원가 · 품절 ← 판매 상태 · 노출 ← 공개 노출. 처음부터 다른 상품 정보 칸은 위 맞추기 카드에서 방향을 골라 맞춥니다."}</p>
      </section>

      <section className="admin-card bj-settings">
        <button type="button" className="bj-settings-toggle" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen}>
          <Settings2 size={17} aria-hidden="true" /> 동기화 설정 <small>카테고리·배송비 정책 맞추기 · 수강생 그룹 · 신규 상품 기본 설정</small><ChevronDown size={16} className={settingsOpen ? "is-open" : ""} aria-hidden="true" />
        </button>
        {settingsOpen && settingsDraft && overview && (
          <div className="bj-settings-body">
            <div className="bj-settings-grid">
              <label><span>발주오라 관리자 주소 이름</span><input value={settingsDraft.merchantSlug} onChange={(event) => setSettingsDraft({ ...settingsDraft, merchantSlug: event.target.value })} placeholder="doogobiz24" /><small>console.baljuora.com/<b>{settingsDraft.merchantSlug || "doogobiz24"}</b>/dashboard</small></label>
              <label><span>수강생 단가 = 이 이름이 들어간 매출처 그룹의 공급가</span><input value={settingsDraft.groupKeyword} onChange={(event) => setSettingsDraft({ ...settingsDraft, groupKeyword: event.target.value })} placeholder="황금농부" /><small>{overview.group ? `찾은 그룹: ${overview.group.name}` : "발주오라 상품 불러오기 후 찾은 그룹이 보입니다."}</small></label>
              <label><span>신규 상품 설정 복사용 발주오라 상품코드</span><input value={settingsDraft.templateCode ?? ""} onChange={(event) => setSettingsDraft({ ...settingsDraft, templateCode: event.target.value || null })} placeholder="예: PD1794971213122" /><small>새 상품의 매입처·매입/매출 배송정책을 이 상품에서 복사합니다. 같은 매입처의 연결 상품이 있으면 그 상품을 먼저 쓰고, 이 상품의 매입처가 새 상품의 매입처와 다르면 발주오라에서 같은 매입처 상품을 찾아 씁니다(없으면 다른 매입처로 등록되지 않게 멈춤).</small></label>
              <label>
                <span>상품 불러오기(비교) 때 판매·매출처도 함께</span>
                <select value={settingsDraft.salesOnCompare === false ? "off" : String(settingsDraft.salesMonths ?? 2)} onChange={(event) => setSettingsDraft(event.target.value === "off" ? { ...settingsDraft, salesOnCompare: false } : { ...settingsDraft, salesOnCompare: true, salesMonths: Number(event.target.value) })}>
                  <option value="1">함께 불러오기 · 이번 달</option>
                  <option value="2">함께 불러오기 · 최근 2개월</option>
                  <option value="3">함께 불러오기 · 최근 3개월</option>
                  <option value="6">함께 불러오기 · 최근 6개월</option>
                  <option value="off">불러오지 않기</option>
                </select>
                <small>주문(주문일 기준)과 매출처 회원을 읽어 판매 현황·매출처·세금계산서·공급사 정산에 씁니다. 판매만 따로 불러오려면 <a href="/admin/sales">판매 현황</a>에서 하세요.</small>
              </label>
              <label className="bj-settings-check">
                <span>운영 홈 아침 동기화(발주오라 → DB센터)</span>
                <span className="bj-check"><input type="checkbox" checked={settingsDraft.dailyRegisterNew !== false} onChange={(event) => setSettingsDraft({ ...settingsDraft, dailyRegisterNew: event.target.checked })} /> 발주오라에만 있는 새 상품도 DB센터에 숨김으로 등록</span>
                <small>아침 동기화는 판매·주문·매출처를 늘 함께 읽고(위 기간), 발주오라에서 바뀐 칸만 DB센터에 반영해요. 양쪽에서 바뀐 칸·처음부터 다른 칸은 이 화면에서 골라 맞춰요.</small>
              </label>
            </div>
            <h3>카테고리 연결 <small>DB센터 카테고리 → 발주오라 카테고리 (보낼 곳 · 이름이 같으면 자동으로 연결)</small></h3>
            {overview.baljuoraCategories.length === 0 ? <p className="bj-muted">발주오라 상품 불러오기를 하면 발주오라 카테고리 목록이 보입니다.</p> : (
              <div className="bj-category-map">
                {overview.doogoCategories.map((category) => (
                  <label key={category.id} className={settingsDraft.categoryMap[category.id] ? "" : "is-unmapped"}>
                    <span>{category.name}<small>{category.shippingType === "overseas" ? "해외배송" : "국내배송"}</small></span>
                    <select value={settingsDraft.categoryMap[category.id] ?? ""} onChange={(event) => {
                      const next = { ...settingsDraft.categoryMap };
                      if (event.target.value) next[category.id] = event.target.value; else delete next[category.id];
                      setSettingsDraft({ ...settingsDraft, categoryMap: next });
                    }}>
                      <option value="">연결 안 함</option>
                      {overview.baljuoraCategories.map((option) => <option key={option.id} value={option.id}>{option.path}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}
            <BaljuoraAlignSettings
              baljuoraCategories={overview.baljuoraCategories}
              doogoCategories={overview.doogoCategories}
              savedCategoryMap={overview.settings.categoryMap}
              savedReverseMap={overview.settings.baljuoraCategoryMap ?? {}}
              reverseMap={settingsDraft.baljuoraCategoryMap ?? {}}
              onReverseMapChange={(next) => setSettingsDraft({ ...settingsDraft, baljuoraCategoryMap: next })}
              doogoPolicies={overview.doogoShippingPolicies ?? []}
              baljuoraPolicies={overview.baljuoraShippingPolicies ?? []}
              policyMap={settingsDraft.shippingPolicyMap ?? {}}
              onPolicyMapChange={(next) => setSettingsDraft({ ...settingsDraft, shippingPolicyMap: next })}
              onCategoriesCreated={load}
              excludeNames={overview.categoryTree?.excludeNames}
            />
            <div className="bj-settings-actions"><button type="button" className="primary-action" onClick={() => void saveSettings()} disabled={busy === "settings"}>{busy === "settings" ? <Loader2 className="bj-spin" size={15} /> : <CheckCircle2 size={15} />} 설정 저장</button></div>
          </div>
        )}
      </section>

      {overview && overview.jobs.length > 0 && (
        <section className="admin-card bj-history">
          <h2>최근 작업</h2>
          <div className="bj-history-list">
            {overview.jobs.map((entry) => (
              <button key={entry.id} type="button" onClick={() => void openJobDetail(entry.id)}>
                <span>{formatDateTime(entry.createdAt)}</span>
                <strong>{entry.type === "compare" ? "불러오기(비교)" : `동기화 ${entry.total ?? 0}개`}</strong>
                <em className={`status-pill ${entry.status === "done" ? "active" : entry.status === "failed" ? "danger" : ""}`}>{STATUS_LABELS[entry.status]}</em>
                <small>{entry.type === "push" && entry.summary ? `성공 ${Number(entry.summary.succeeded ?? 0)} · 실패 ${Number(entry.summary.failed ?? 0)}` : entry.summary ? `연결 ${Number(entry.summary.linked ?? 0).toLocaleString("ko-KR")}` : entry.progress?.message ?? ""}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {openJob && (
        <div className="editor-overlay" role="presentation" onMouseDown={() => setOpenJob(null)}>
          <section className="bj-job-modal" role="dialog" aria-modal="true" aria-labelledby="bj-job-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="bj-job-modal-head">
              <div><span>{formatDateTime(openJob.createdAt)} · {STATUS_LABELS[openJob.status]}</span><h2 id="bj-job-modal-title">{openJob.type === "compare" ? "발주오라 상품 불러오기(비교)" : `동기화 ${openJob.total ?? 0}개`}</h2></div>
              <button type="button" className="bj-icon-button" onClick={() => setOpenJob(null)} aria-label="닫기"><X size={20} /></button>
            </div>
            <p className="bj-job-message">{openJob.progress?.message}</p>
            {openJob.items && openJob.items.length > 0 && (
              <ul className="bj-result-list">
                {openJob.items.map((item) => (
                  <li key={item.productId} className={item.ok ? "is-ok" : "is-failed"}>
                    <strong>{item.ok ? "✓" : "✕"} {item.name ?? item.productId} <small>{item.action === "create" ? "신규 등록" : "수정"}</small></strong>
                    {item.applied && item.applied.length > 0 && <span>반영: {item.applied.map((field) => BALJUORA_FIELD_SHORT_LABELS[field]).join(", ")}</span>}
                    {item.skipped?.map((entry, index) => <span key={index} className="bj-warn">{BALJUORA_FIELD_SHORT_LABELS[entry.field]}: {entry.reason}</span>)}
                    {item.error && <span className="bj-error">{item.error}</span>}
                  </li>
                ))}
              </ul>
            )}
            {openJob.diagnostics && (
              <details className="bj-diagnostics">
                <summary>기술 정보 (문제가 생기면 이 내용을 개발 담당에게 알려 주세요)</summary>
                <pre>{JSON.stringify(openJob.diagnostics, null, 2)}</pre>
              </details>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
