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
  formatBaljuoraCode,
  type BaljuoraCategory,
  type BaljuoraFieldDiff,
  type BaljuoraProductSnapshot,
  type BaljuoraSyncField
} from "@repo/shared/baljuora-sync";
import { BaljuoraMasterPanel } from "./BaljuoraMasterPanel";
import { BaljuoraAlignSettings, type BaljuoraPolicyOption, type DoogoPolicyOption } from "./BaljuoraAlignSettings";
import "./baljuora-sync-admin.css";

type Settings = { merchantSlug: string; groupKeyword: string; categoryMap: Record<string, string>; baljuoraCategoryMap: Record<string, string>; shippingPolicyMap: Record<string, string>; templateCode: string | null };
type JobView = {
  id: string;
  type: "compare" | "push";
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
  diffs: BaljuoraFieldDiff[];
  syncStatus: string | null;
  lastPushedAt: string | null;
};
type Changes = {
  compared: boolean;
  lastCompareAt: string | null;
  linkedCount: number;
  // 발주오라에서 매출처 그룹(황금농부) 공급가를 읽었는지. false면 수강생 단가는 비교·전송하지 못합니다.
  groupPriceReadable?: boolean;
  productCount: number;
  items: ChangeItem[];
  baljuoraOnly: BaljuoraProductSnapshot[];
  unmappedCategories: Array<{ id: string; name: string }>;
};
type Tab = "push" | "new" | "pull" | "only";
const PAGE_SIZE = 40;

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
function bookmarkletHref(origin: string) {
  return `javascript:(function(){var o=${JSON.stringify(origin)};window.__doogoSyncOrigin=o;var s=document.createElement("script");s.src=o+"/baljuora-sync.js?t="+Date.now();s.onerror=function(){alert("두고푸드 동기화 스크립트를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.")};document.body.appendChild(s);})();`;
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

function DiffValue({ field, value, categoryPath, policyName }: { field: BaljuoraSyncField; value: string | number | null; categoryPath: (id: string) => string; policyName: (id: string) => string }) {
  if (field === "image") return value ? <img className="bj-diff-thumb" src={String(value)} alt="" loading="lazy" /> : <span className="bj-muted">없음</span>;
  if (field === "shippingPolicy") return <span>{value ? policyName(String(value)) : "없음"}</span>;
  if (field === "category") return <span>{value ? String(value).split(",").map(categoryPath).join(", ") : "없음"}</span>;
  if (field === "name") return <span>{value || "없음"}</span>;
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
  const [busy, setBusy] = useState<"" | "compare" | "push" | "pull" | "ignore" | "settings" | "cancel">("");
  const [job, setJob] = useState<{ view: JobView; code: string | null; consoleUrl: string | null } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<Settings | null>(null);
  const [openJob, setOpenJob] = useState<JobView | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const load = useCallback(async () => {
    try {
      const [nextOverview, nextChanges] = await Promise.all([
        readData<Overview>(await apiFetch("/baljuora/admin/overview", { silent: true })),
        readData<Changes>(await apiFetch("/baljuora/admin/changes", { silent: true }))
      ]);
      setOverview(nextOverview);
      setChanges(nextChanges);
      setSettingsDraft(nextOverview.settings);
      setJob((current) => current ?? (nextOverview.activeJob ? { view: nextOverview.activeJob, code: null, consoleUrl: null } : null));
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
        const { job: next } = await readData<{ job: JobView }>(await apiFetch(`/baljuora/admin/jobs/${jobId}`, { silent: true }));
        if (stopped) return;
        setJob((current) => current && current.view.id === next.id ? { ...current, view: next } : current);
        if (next.status !== "waiting" && next.status !== "running") {
          if (next.status === "done") toast.success(next.type === "compare" ? "발주오라 상품을 불러왔습니다." : "동기화를 마쳤습니다.");
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

  const lists = useMemo(() => {
    const items = changes?.items ?? [];
    const push = items.filter((item) => item.kind === "update" && (item.diffs.some((diff) => diff.direction !== "pull") || item.syncStatus === "failed"));
    const pull = items.filter((item) => item.kind === "update" && item.diffs.some((diff) => diff.direction === "pull" || diff.direction === "both"));
    const fresh = items.filter((item) => item.kind === "new");
    return { push, pull, new: fresh, newVisible: fresh.filter((item) => item.isVisible) };
  }, [changes]);

  const rows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const match = (text: string) => !keyword || text.toLowerCase().includes(keyword);
    if (tab === "only") return (changes?.baljuoraOnly ?? []).filter((item) => match(`${item.code ?? ""} ${item.name}`));
    const source = tab === "push" ? lists.push : tab === "pull" ? lists.pull : includeHidden ? lists.new : lists.newVisible;
    return source.filter((item) => match(`${item.code ?? ""} ${item.name} ${item.supplierName ?? ""}`));
  }, [tab, query, lists, includeHidden, changes]);

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
      window.open(created.consoleUrl, "_blank", "noopener");
      toast.success("발주오라 관리자 창을 열었습니다. 그 창에서 책갈피 '두고푸드 동기화'를 눌러 주세요.");
      setSelected(new Set());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "작업을 만들지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  const pushSelected = () => {
    const ids = [...selected];
    if (ids.length === 0) return toast.info("동기화할 상품을 골라 주세요.");
    void startJob({ type: "push", productIds: ids }, "push");
  };

  const pullSelected = async () => {
    const ids = [...selected];
    if (ids.length === 0) return toast.info("가져올 상품을 골라 주세요.");
    const message = tab === "only"
      ? `발주오라에만 있는 상품 ${ids.length}개를 DB센터에 새 상품으로 등록할까요? (공개 단가표에는 숨김으로 등록됩니다)`
      : `고른 ${ids.length}개 상품의 DB센터 값을 발주오라 값으로 바꿀까요? (가격이 바뀌면 가격변동 이력에 남습니다)`;
    if (!window.confirm(message)) return;
    setBusy("pull");
    try {
      // '발주오라에서 바뀜' 탭: 발주오라에서 바뀐 칸만 가져옵니다(DB센터에서 고친 칸은 그대로).
      const body = tab === "only" ? { baljuoraIds: ids } : { productIds: ids, onlyPulled: true };
      const result = await readData<{ updated: number; created: number; failed: Array<{ name: string; error: string }> }>(await apiFetch("/baljuora/admin/pull", jsonInit("POST", body)));
      toast.success(tab === "only" ? `${result.created}개를 DB센터에 등록했습니다.` : `${result.updated}개를 발주오라 값으로 바꿨습니다.`);
      if (result.failed.length) toast.error(`${result.failed.length}개 실패: ${result.failed.slice(0, 2).map((item) => `${item.name} (${item.error})`).join(", ")}`);
      setSelected(new Set());
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "가져오지 못했습니다.");
    } finally {
      setBusy("");
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
  const counts = { push: lists.push.length, new: includeHidden ? lists.new.length : lists.newVisible.length, pull: lists.pull.length, only: changes?.baljuoraOnly.length ?? 0 };
  const view = job?.view;
  const jobDone = view && !["waiting", "running"].includes(view.status);
  const progressPercent = view?.progress && view.progress.total > 0 ? Math.min(100, Math.round((view.progress.done / view.progress.total) * 100)) : view?.status === "done" ? 100 : 6;

  return (
    <div className="bj-sync">
      <div className="admin-page-heading">
        <div>
          <span>BALJUORA SYNC</span>
          <h1>발주오라 동기화</h1>
          <p>DB센터와 발주오라 도매몰의 상품·가격·썸네일·카테고리·배송비 정책을 양쪽 같게 맞춥니다. DB센터에서 고친 값은 발주오라로 보내고(보낼 변경), 발주오라에서 먼저 고친 값은 발주오라 기준으로 가져옵니다.</p>
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
          <a className="bj-settle-open" href={`${BALJUORA_CONSOLE_ORIGIN}/${overview?.settings.merchantSlug || BALJUORA_DEFAULT_MERCHANT_SLUG}/dashboard#doogo-settle`} target="_blank" rel="noreferrer"><ExternalLink size={15} aria-hidden="true" /> 발주오라 정산 화면 열기</a>
          <small>열린 창에서 책갈피를 누르면 입/출금 계좌 조회로 이동해 시작해요.</small>
        </div>
      </section>

      <section className="admin-card bj-howto">
        <div className="bj-howto-copy">
          <h2><Bookmark size={18} aria-hidden="true" /> 처음 한 번: 책갈피 만들기</h2>
          <p>발주오라는 API가 없고 로그인에 사람 확인이 있어서, <b>로그인해 둔 발주오라 관리자 창</b>에서 책갈피를 눌러 실행합니다. 아래 버튼을 브라우저 즐겨찾기(북마크) 막대로 끌어다 놓으세요.</p>
          <ol>
            <li>DB센터에서 <b>발주오라 상품 불러오기</b> 또는 <b>동기화</b>를 누르면 발주오라 관리자 창이 열립니다.</li>
            <li>열린 창에서 로그인돼 있는지 확인하고, 즐겨찾기 막대의 <b>두고푸드 동기화</b>를 누릅니다.</li>
            <li>발주오라 창 오른쪽 아래에 진행 상황이 나오고, 이 화면에도 결과가 보입니다.</li>
          </ol>
        </div>
        <div className="bj-howto-action">
          <BookmarkletLink origin={origin} />
          <small>즐겨찾기 막대가 안 보이면 Ctrl+Shift+B(맥은 ⌘+Shift+B)</small>
        </div>
      </section>

      <div className="bj-stats">
        <article><span>연결된 상품</span><strong>{(changes?.linkedCount ?? 0).toLocaleString("ko-KR")}</strong><small>DB센터 상품 {(changes?.productCount ?? 0).toLocaleString("ko-KR")}개 중</small></article>
        <article className={counts.push > 0 ? "is-attention" : ""}><span>보낼 변경</span><strong>{counts.push.toLocaleString("ko-KR")}</strong><small>DB센터에서 바뀐 상품</small></article>
        <article className={counts.new > 0 ? "is-attention" : ""}><span>신규 등록</span><strong>{compared ? counts.new.toLocaleString("ko-KR") : "-"}</strong><small>발주오라에 없는 노출 상품</small></article>
        <article><span>발주오라에만 있음</span><strong>{compared ? counts.only.toLocaleString("ko-KR") : "-"}</strong><small>DB센터에 없는 발주오라 상품</small></article>
        <article><span>마지막 비교 · 동기화</span><strong className="bj-stat-time">{formatDateTime(overview?.lastCompareAt ?? null)}</strong><small>동기화 {formatDateTime(overview?.lastPushAt ?? null)}</small></article>
      </div>

      {view && (
        <section className={`admin-card bj-job is-${view.status}`} aria-live="polite">
          <div className="bj-job-head">
            <div>
              <span className="bj-job-kind">{view.type === "compare" ? "발주오라 상품 불러오기(비교)" : `동기화 ${view.total ?? 0}개`}</span>
              <h2>{STATUS_LABELS[view.status]}{view.status === "running" && <Loader2 className="bj-spin" size={18} aria-hidden="true" />}</h2>
            </div>
            {jobDone ? <button type="button" className="bj-icon-button" onClick={() => setJob(null)} aria-label="작업 닫기"><X size={18} /></button> : <button type="button" className="outline-button" onClick={() => void cancelJob()} disabled={busy === "cancel"}>작업 취소</button>}
          </div>
          {view.status === "waiting" && (
            <div className="bj-job-waiting">
              <p>열린 <b>발주오라 관리자 창</b>에서 즐겨찾기 막대의 <b>두고푸드 동기화</b>를 눌러 주세요. 로그인 화면이 나오면 로그인한 뒤 다시 누르면 됩니다.</p>
              {job?.code && <div className="bj-code"><span>작업 코드</span><strong>{formatBaljuoraCode(job.code)}</strong><small>창에서 코드를 물어보면 이 코드를 넣으세요 · {formatDateTime(view.expiresAt)}까지</small></div>}
              {job?.consoleUrl && <a className="primary-action" href={job.consoleUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> 발주오라 관리자 창 다시 열기</a>}
            </div>
          )}
          <div className="bj-progress"><div style={{ width: `${progressPercent}%` }} /></div>
          <p className="bj-job-message">{view.progress?.message ?? ""}</p>
          {jobDone && view.summary && (
            <div className="bj-job-summary">
              {view.type === "compare"
                ? <span>발주오라 상품 {Number(view.summary.received ?? 0).toLocaleString("ko-KR")}개 읽음 · 연결 {Number(view.summary.linked ?? 0).toLocaleString("ko-KR")}개 · 발주오라에만 있음 {Number(view.summary.baljuoraOnly ?? 0).toLocaleString("ko-KR")}개</span>
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
        baljuoraOnlyIds={(changes?.baljuoraOnly ?? []).map((snapshot) => snapshot.id)}
        doogoOnlyCount={lists.new.length}
        compared={compared}
        lastCompareAt={changes?.lastCompareAt ?? overview?.lastCompareAt ?? null}
        disabled={Boolean(busy) || jobActive}
        onCompare={() => void startJob({ type: "compare" }, "compare")}
        onDone={load}
      />

      {changes?.compared && changes.groupPriceReadable === false && (
        <p className="bj-notice"><AlertTriangle size={15} aria-hidden="true" /> 지금 목록은 수강생 단가(‘{overview?.settings.groupKeyword || "황금농부"}’ 매출처 그룹 공급가)를 읽기 전 비교 결과예요. <b>발주오라 상품 불러오기(비교)</b>를 한 번 다시 하면 수강생 단가·매입원가·카테고리를 새로 읽어 진짜 차이만 남아요(그 전에 보내는 상품도 수강생 단가를 함께 맞춥니다).</p>
      )}
      {changes && changes.unmappedCategories.length > 0 && overview && overview.baljuoraCategories.length > 0 && (
        <p className="bj-notice"><AlertTriangle size={15} aria-hidden="true" /> 발주오라 카테고리와 연결되지 않은 DB센터 카테고리 {changes.unmappedCategories.length}개: {changes.unmappedCategories.slice(0, 4).map((category) => category.name).join(", ")}{changes.unmappedCategories.length > 4 ? " 등" : ""} · <button type="button" onClick={() => setSettingsOpen(true)}>카테고리 연결하기</button></p>
      )}

      <section className="admin-card bj-list">
        <div className="bj-tabs" role="tablist" aria-label="변경 종류">
          {([
            ["push", "보낼 변경", counts.push],
            ["new", "신규 등록", counts.new],
            ["pull", "발주오라에서 바뀜", counts.pull],
            ["only", "발주오라에만 있음", counts.only]
          ] as Array<[Tab, string, number]>).map(([key, label, count]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}<b>{count.toLocaleString("ko-KR")}</b></button>
          ))}
        </div>
        <div className="bj-toolbar">
          <div className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="상품코드·상품명·매입처 검색" /></div>
          {tab === "new" && <label className="bj-check"><input type="checkbox" checked={includeHidden} onChange={(event) => setIncludeHidden(event.target.checked)} /> 숨긴 상품도 보기</label>}
          <div className="bj-toolbar-actions">
            <span>{selected.size > 0 ? `${selected.size}개 선택` : `${rows.length.toLocaleString("ko-KR")}개`}</span>
            {(tab === "push" || tab === "new") && <button type="button" className="primary-action" onClick={pushSelected} disabled={!compared || selected.size === 0 || Boolean(busy) || jobActive}>{busy === "push" ? <Loader2 className="bj-spin" size={15} /> : <Send size={15} />} 선택 {selected.size}개 동기화</button>}
            {(tab === "pull" || tab === "only") && <button type="button" className="primary-action" onClick={() => void pullSelected()} disabled={selected.size === 0 || Boolean(busy)}><ArrowDownToLine size={15} /> {tab === "only" ? "DB센터로 가져오기" : "발주오라 값 가져오기"}</button>}
            {(tab === "push" || tab === "pull") && <button type="button" className="outline-button" onClick={() => void ignoreSelected()} disabled={selected.size === 0 || Boolean(busy)}>이대로 두기</button>}
          </div>
        </div>
        {!compared && tab !== "push" ? (
          <div className="empty-admin">먼저 <b>발주오라 상품 불러오기(비교)</b>를 해 주세요.</div>
        ) : rows.length === 0 ? (
          <div className="empty-admin">{tab === "push" ? "보낼 변경이 없습니다. DB센터와 발주오라 값이 같습니다." : tab === "new" ? "발주오라에 새로 등록할 상품이 없습니다." : tab === "pull" ? "발주오라에서 따로 바뀐 값이 없습니다." : "발주오라에만 있는 상품이 없습니다."}</div>
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
                      </div>
                    </label>
                  );
                }
                const item = row;
                const shown = tab === "pull" ? item.diffs.filter((diff) => diff.direction === "pull" || diff.direction === "both") : item.diffs.filter((diff) => diff.direction !== "pull");
                return (
                  <label key={item.productId} className={`bj-row${item.syncStatus === "failed" ? " is-failed" : ""}`} role="listitem">
                    <input type="checkbox" checked={selected.has(item.productId)} onChange={() => toggle(item.productId)} />
                    {item.imageUrl ? <img className="bj-row-thumb" src={item.imageUrl} alt="" loading="lazy" /> : <span className="bj-row-thumb is-empty" />}
                    <div className="bj-row-main">
                      <strong>{item.name}{!item.isVisible && <em className="bj-tag">숨김</em>}{item.syncStatus === "failed" && <em className="bj-tag is-danger">지난 동기화 실패</em>}</strong>
                      <small>{item.code ?? "상품코드 없음(발주오라가 새 코드를 만듭니다)"} · {doogoCategoryName(item.categoryId)}{item.supplierName ? ` · ${item.supplierName}` : ""}</small>
                      {item.kind === "new" ? (
                        <div className="bj-diffs"><span className="bj-diff is-new">발주오라에 새로 등록</span></div>
                      ) : (
                        <div className="bj-diffs">
                          {shown.map((diff) => (
                            <span key={diff.field} className={`bj-diff is-${diff.direction}`} title={`${BALJUORA_FIELD_LABELS[diff.field]} · ${BALJUORA_DIRECTION_LABELS[diff.direction]}`}>
                              <b>{BALJUORA_FIELD_SHORT_LABELS[diff.field]}</b>
                              {tab === "pull"
                                ? <><DiffValue field={diff.field} value={diff.doogo} categoryPath={categoryPath} policyName={policyName} /><ChevronLeft size={12} aria-hidden="true" /><DiffValue field={diff.field} value={diff.baljuora} categoryPath={categoryPath} policyName={policyName} /></>
                                : <><DiffValue field={diff.field} value={diff.baljuora} categoryPath={categoryPath} policyName={policyName} /><ChevronRight size={12} aria-hidden="true" /><DiffValue field={diff.field} value={diff.doogo} categoryPath={categoryPath} policyName={policyName} /></>}
                              {diff.direction !== "push" && <i>{BALJUORA_DIRECTION_LABELS[diff.direction]}</i>}
                            </span>
                          ))}
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
        <p className="bj-legend">{tab === "pull" ? "표시: DB센터 값 ← 발주오라 값. '발주오라 값 가져오기'는 DB센터 상품을 발주오라 값으로 바꿉니다." : "표시: 지금 발주오라 값 → 보낼 DB센터 값. 공급가 ← 일반공급가 · 그룹 공급가 ← 수강생 단가 · 소비자가 ← 지정 판매가 · 매입원가 ← 원가."}</p>
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
              <label><span>신규 상품 설정 복사용 발주오라 상품코드</span><input value={settingsDraft.templateCode ?? ""} onChange={(event) => setSettingsDraft({ ...settingsDraft, templateCode: event.target.value || null })} placeholder="예: PD1794971213122" /><small>새 상품의 매입처·매입/매출 배송정책을 이 상품에서 복사합니다. 같은 매입처의 연결 상품이 있으면 그 상품을 먼저 씁니다.</small></label>
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
