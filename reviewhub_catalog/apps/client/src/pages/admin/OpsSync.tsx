// 운영 홈 > 주문 동기화 · 상품 동기화(2026-11-27 관리자 요청 "DB센터 동기화를 2가지로 — ① 주문 동기화: 주문이 뭐가 들어왔고 매출처·매입처가 누가
// 추가됐는지, 발주오라 통계·거래처 관리·정산 관리·주문 관리·주문 입력 쪽 ② 상품 동기화: DB센터에서 신규 상품·가격·삭제·품절·미노출·카테고리·
// 배송 정책 등 상품 수정이 바뀌면 동기화 버튼으로 발주오라도 다 같이"). 예전 '발주오라 → DB센터 동기화'(아침 동기화) 버튼 자리입니다.
// 발주오라는 서버가 대신 로그인하지 않으므로: 버튼 → 작업 코드 + 발주오라 관리자 창 → 그 창에서 책갈피 '두고푸드 동기화' 한 번.
//   주문 동기화: 매출처·매입처·주문 상품 줄·과세 여부를 읽어 DB센터에 맞추고(새 매입처는 공급사 관리에 등록), 끝나면 요약을 보여 줍니다.
//   상품 동기화: 먼저 보낼 것 미리보기(고르기) → 시작 → 책갈피가 발주오라 상품을 읽고 같은 창에서 이어서 DB센터 변경을 보냅니다.
// 서버: /api/baljuora/admin/ops-sync(상태) · /ops-sync/orders/start · /ops-sync/products/preview · /products/start · /products/continue
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, PackageCheck, ReceiptText, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { BALJUORA_FIELD_SHORT_LABELS, type BaljuoraSyncField } from "@repo/shared/baljuora-sync";
import { apiFetch } from "@/lib/api";
import { clearJobCode, loadJobCode, saveJobCode } from "@/lib/baljuora-job-code";
import { openBaljuoraWindow, runnerOpenMessage, useBaljuoraRunner } from "@/lib/baljuora-window";
import { AdminSheetModal } from "./admin-sheet-modal";
import { BaljuoraRunnerHint, BaljuoraWindowLink } from "./baljuora-window-ui";
import { BaljuoraJobCode, type ReissuedJobCode } from "./BaljuoraJobCode";
import "./ops-sync.css";

type JobStatus = "waiting" | "running" | "done" | "failed" | "expired" | "cancelled";
export type OpsJobView = {
  id: string;
  type: string;
  status: JobStatus;
  createdAt: string;
  startedAt?: string | null;
  finishedAt: string | null;
  expiresAt: string;
  total?: number | null;
  progress: { done: number; total: number; message: string } | null;
  summary: Record<string, unknown> | null;
};
type SupplierResult = { read: number; added: number; names: string[]; fromLines: number; error: string | null };
export type OrdersSummary = {
  jobId: string;
  finishedAt: string;
  start: string | null;
  end: string | null;
  lines: number;
  newLines: number;
  newOrders: number;
  buyers: number;
  newBuyers: number;
  newBuyerNames: string[];
  suppliers: SupplierResult | null;
  complete: boolean;
  error: string | null;
};
export type RecentOrders = { from: string; to: string; total: number; orders: number; cancelled: number; byStatus: Array<{ status: string; label: string; lines: number }> };
type Counts = { updates: number; creates: number; hides: number; categories: number };
type Leftovers = { pull: number; initial: number; only: number; sameName: number; newSupplier: number; shippingUnlinked: number };
export type ProductsSummary = {
  compareJobId: string;
  pushJobId: string | null;
  finishedAt: string;
  received: number | null;
  planned: Counts | null;
  result: { succeeded: number; failed: number; created: number; updated: number; hidden: number; categoryApplied: number; categorySkipped: number } | null;
  failures: Array<{ name: string; error: string }>;
  leftovers: Leftovers | null;
  nothing: boolean;
  error: string | null;
};
export type ProductPhase = "idle" | "waiting" | "reading" | "linking" | "sending" | "done" | "failed";
export type OpsStatus = {
  ready: boolean;
  // official = 발주오라 대시보드 '최근 7일간 주문 현황'(주문 동기화 때 책갈피 1.11.0이 읽은 숫자 그대로, 2026-11-27)
  orders: { job: OpsJobView | null; last: OrdersSummary | null; recent: RecentOrders | null; official?: { at: string; jobId: string | null; items: Array<{ key: string; label: string; count: number }> } | null };
  products: { phase: ProductPhase; compareJob: OpsJobView | null; pushJob: OpsJobView | null; options: ProductOptions | null; planned: Counts | null; stalled: boolean; error: string | null; last: ProductsSummary | null };
};
export type ProductOptions = { updates: boolean; creates: boolean; hides: boolean; categories: boolean };
type Sample = { id: string; name: string; code: string | null };
export type ProductPreview = {
  compared: boolean;
  lastCompareAt: string | null;
  linkedCount: number;
  updates: { count: number; conflicts: number; fields: Array<{ field: BaljuoraSyncField; count: number }>; samples: Sample[] };
  creates: { count: number; samples: Sample[] };
  hides: { count: number; samples: Sample[] };
  categories: { count: number; samples: Array<{ name: string; type: string }>; notes: number };
  leftovers: Leftovers;
};
type Created = { job: OpsJobView; code: string; consoleUrl: string };

const ACTIVE_PHASES: ProductPhase[] = ["waiting", "reading", "linking", "sending"];
const count = (value: number | null | undefined) => Number(value ?? 0).toLocaleString("ko-KR");
const isActiveJob = (job: OpsJobView | null | undefined) => Boolean(job && (job.status === "waiting" || job.status === "running"));

async function readData<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({ ok: false }))) as { ok: boolean; data: T; error?: { message?: string } };
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "처리하지 못했어요.");
  return payload.data;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

// 서버 시각(ISO 또는 SQLite 형식, UTC) → 한국 시각
function parseTime(value: string) {
  return new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
}

export function formatSyncTime(value: string) {
  const date = parseTime(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" }).format(date);
}

export function relativeTime(value: string, now = Date.now()) {
  const minutes = Math.floor((now - parseTime(value).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function isTodaySeoul(value: string) {
  const day = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return day(parseTime(value)) === day(new Date());
}

function shortDate(value: string | null) {
  return value ? value.slice(5).replace("-", ".") : "";
}

function names(list: string[], limit = 4) {
  if (list.length === 0) return "";
  return list.length > limit ? `${list.slice(0, limit).join(", ")} 외 ${list.length - limit}곳` : list.join(", ");
}

export function useOpsSync(onFinished?: () => void) {
  const [status, setStatus] = useState<OpsStatus | null>(null);
  const [codes, setCodes] = useState<Record<string, { code: string | null; consoleUrl: string | null }>>({});
  const [busy, setBusy] = useState<"" | "orders" | "preview" | "products" | "continue" | "cancel">("");
  const [preview, setPreview] = useState<ProductPreview | null>(null);
  const [finishedOrders, setFinishedOrders] = useState<OrdersSummary | null>(null);
  const [finishedProducts, setFinishedProducts] = useState<ProductsSummary | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const previous = useRef<OpsStatus | null>(null);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const load = useCallback(async () => {
    const next = await readData<OpsStatus>(await apiFetch("/baljuora/admin/ops-sync", { silent: true }));
    const before = previous.current;
    previous.current = next;
    setStatus(next);
    // 진행 중인 작업의 작업 코드는 이 기기에 기억해 둔 값으로 다시 보여 줍니다(서버에는 SHA-256만 있음).
    const activeJobs = [next.orders.job, next.products.compareJob, next.products.pushJob].filter((job): job is OpsJobView => isActiveJob(job));
    if (activeJobs.length > 0) {
      setCodes((current) => {
        let changed = false;
        const copy = { ...current };
        for (const job of activeJobs) {
          if (copy[job.id]) continue;
          const saved = loadJobCode(job.id);
          copy[job.id] = { code: saved?.code ?? null, consoleUrl: saved?.consoleUrl ?? null };
          changed = true;
        }
        return changed ? copy : current;
      });
    }
    if (before) {
      const ordersJobId = isActiveJob(before.orders.job) ? before.orders.job!.id : null;
      if (ordersJobId && next.orders.last?.jobId === ordersJobId) {
        setFinishedOrders(next.orders.last);
        clearJobCode(ordersJobId);
        toast.success(`주문 동기화를 마쳤어요 · ${formatSyncTime(next.orders.last.finishedAt)}`);
        onFinishedRef.current?.();
      }
      const compareId = before.products.compareJob?.id;
      if (ACTIVE_PHASES.includes(before.products.phase) && next.products.phase === "done" && next.products.last && next.products.last.compareJobId === compareId) {
        setFinishedProducts(next.products.last);
        [compareId, before.products.pushJob?.id, next.products.pushJob?.id].forEach((id) => { if (id) clearJobCode(id); });
        toast.success(`상품 동기화를 마쳤어요 · ${formatSyncTime(next.products.last.finishedAt)}`);
        onFinishedRef.current?.();
      }
    }
    return next;
  }, []);

  useEffect(() => {
    void load().catch(() => setStatus({ ready: false, orders: { job: null, last: null, recent: null, official: null }, products: { phase: "idle", compareJob: null, pushJob: null, options: null, planned: null, stalled: false, error: null, last: null } }));
  }, [load]);

  // 발주오라 창이 읽거나 보내는 동안 2초마다(이어 가기가 멈췄으면 10초마다) 봅니다. 비교가 끝난 지 35분이 지나면 멈춥니다.
  const ordersActive = isActiveJob(status?.orders.job);
  const phase = status?.products.phase ?? "idle";
  const compareFinished = status?.products.compareJob?.finishedAt ?? null;
  const linkingExpired = phase === "linking" && Boolean(compareFinished && Date.now() - parseTime(compareFinished).getTime() > 35 * 60_000);
  const productsActive = ACTIVE_PHASES.includes(phase) && !linkingExpired;
  const slow = phase === "linking" && Boolean(status?.products.stalled);
  useEffect(() => {
    if (!ordersActive && !productsActive) return;
    const timer = window.setInterval(() => { void load().catch(() => undefined); }, slow && !ordersActive ? 10_000 : 2000);
    return () => window.clearInterval(timer);
  }, [ordersActive, productsActive, slow, load]);

  const remember = useCallback((created: Created) => {
    saveJobCode({ id: created.job.id, type: created.job.type, code: created.code, consoleUrl: created.consoleUrl, expiresAt: created.job.expiresAt });
    setCodes((current) => ({ ...current, [created.job.id]: { code: created.code, consoleUrl: created.consoleUrl } }));
    // 1.12.0: 늘 같은 발주오라 창으로(책갈피를 한 번 누른 창이면 오른쪽 아래 동기화 버튼이 받아 바로 시작)
    openBaljuoraWindow(created.consoleUrl);
  }, []);

  const startOrders = useCallback(async () => {
    setBusy("orders");
    setFinishedOrders(null);
    try {
      const message = runnerOpenMessage("발주오라 관리자 창을 열었어요. 그 창에서 책갈피 '두고푸드 동기화'를 한 번 눌러 주세요.");
      remember(await readData<Created>(await apiFetch("/baljuora/admin/ops-sync/orders/start", jsonInit("POST", {}))));
      toast.success(message);
      await load();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "주문 동기화를 시작하지 못했어요.");
    } finally {
      setBusy("");
    }
  }, [load, remember]);

  const openProducts = useCallback(async () => {
    setBusy("preview");
    try {
      setPreview(await readData<ProductPreview>(await apiFetch("/baljuora/admin/ops-sync/products/preview", { silent: true })));
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "보낼 것을 확인하지 못했어요.");
    } finally {
      setBusy("");
    }
  }, []);

  const startProducts = useCallback(async (options: ProductOptions) => {
    setBusy("products");
    setFinishedProducts(null);
    try {
      const message = runnerOpenMessage("발주오라 관리자 창을 열었어요. 그 창에서 책갈피 '두고푸드 동기화'를 한 번만 누르면 읽고 이어서 보내요.");
      remember(await readData<Created>(await apiFetch("/baljuora/admin/ops-sync/products/start", jsonInit("POST", { options }))));
      setPreview(null);
      toast.success(message);
      await load();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "상품 동기화를 시작하지 못했어요.");
    } finally {
      setBusy("");
    }
  }, [load, remember]);

  const continueProducts = useCallback(async () => {
    setBusy("continue");
    try {
      const result = await readData<{ nothing: true } | ({ nothing: false } & Created)>(await apiFetch("/baljuora/admin/ops-sync/products/continue", jsonInit("POST", {})));
      if (result.nothing) toast.success("보낼 변경이 없어요. DB센터와 발주오라 상품이 같아요.");
      else {
        const message = runnerOpenMessage("보내기 창을 열었어요. 그 창에서 책갈피 '두고푸드 동기화'를 한 번 더 눌러 주세요.");
        remember(result);
        toast.success(message);
      }
      await load();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "이어서 보내지 못했어요.");
    } finally {
      setBusy("");
    }
  }, [load, remember]);

  const cancel = useCallback(async (jobId: string) => {
    setBusy("cancel");
    try {
      await readData(await apiFetch(`/baljuora/admin/jobs/${jobId}/cancel`, { method: "POST" }));
      clearJobCode(jobId);
      setDismissed((current) => new Set(current).add(jobId));
      await load();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "취소하지 못했어요.");
    } finally {
      setBusy("");
    }
  }, [load]);

  const reissued = useCallback((result: ReissuedJobCode<OpsJobView>) => {
    saveJobCode({ id: result.job.id, type: result.job.type, code: result.code, consoleUrl: result.consoleUrl, expiresAt: result.job.expiresAt });
    setCodes((current) => ({ ...current, [result.job.id]: { code: result.code, consoleUrl: result.consoleUrl } }));
  }, []);

  return {
    status,
    codes,
    busy,
    preview,
    finishedOrders,
    finishedProducts,
    dismissed,
    ordersActive,
    productsActive,
    linkingExpired,
    startOrders,
    openProducts,
    startProducts,
    continueProducts,
    cancel,
    reissued,
    closePreview: () => setPreview(null),
    closeOrders: () => setFinishedOrders(null),
    closeProducts: () => setFinishedProducts(null),
    dismiss: (id: string) => setDismissed((current) => new Set(current).add(id))
  };
}

export type OpsSyncState = ReturnType<typeof useOpsSync>;

// 책갈피를 한 번 누른 발주오라 창(오른쪽 아래 동기화 버튼)이 있으면 그 창이 작업을 받아 바로 시작합니다(책갈피 1.12.0).
const RUNNER_WAITING_TEXT = "발주오라 창에서 시작을 기다리는 중";

const PRODUCT_PHASE_TEXT: Partial<Record<ProductPhase, string>> = {
  waiting: "발주오라 창에서 책갈피를 눌러 주세요",
  reading: "발주오라 상품을 읽는 중…",
  linking: "보낼 변경을 정하는 중…",
  sending: "발주오라로 보내는 중…"
};

function lastLine(lastAt: string | null | undefined, ready: boolean) {
  if (lastAt) return `마지막 ${formatSyncTime(lastAt)}`;
  return ready ? "아직 동기화한 적 없어요" : "DB 업데이트 뒤에 쓸 수 있어요";
}

// 운영 홈 머리 오른쪽: 버튼 2개 + 버튼마다 밑에 마지막 동기화(몇 일 몇 시)
export function OpsSyncButtons({ state }: { state: OpsSyncState }) {
  const { status, busy, ordersActive, productsActive } = state;
  const ready = Boolean(status?.ready);
  const ordersJob = status?.orders.job ?? null;
  const running = ordersJob?.status === "running" || ["reading", "sending"].includes(status?.products.phase ?? "");
  const ordersLast = status?.orders.last?.finishedAt ?? null;
  const productsLast = status?.products.last?.finishedAt ?? null;
  const productPhase = status?.products.phase ?? "idle";
  const pushProgress = status?.products.pushJob?.progress;
  const runner = useBaljuoraRunner();
  const waitingText = runner ? RUNNER_WAITING_TEXT : PRODUCT_PHASE_TEXT.waiting;
  const ordersText = ordersActive ? (ordersJob?.status === "waiting" ? waitingText : ordersJob?.progress?.message || "주문을 읽는 중…") : lastLine(ordersLast, ready);
  const productsText = productsActive
    ? productPhase === "sending" && pushProgress && pushProgress.total > 0 ? `발주오라로 보내는 중 ${count(pushProgress.done)} / ${count(pushProgress.total)}` : productPhase === "waiting" ? waitingText : PRODUCT_PHASE_TEXT[productPhase] ?? ""
    : lastLine(productsLast, ready);
  const warn = (lastAt: string | null, active: boolean) => ready && !active && (!lastAt || !isTodaySeoul(lastAt));
  return (
    <div className="osync" role="group" aria-label="발주오라 동기화">
      <div className="osync-item">
        <button type="button" className={`osync-button is-orders${ordersActive ? " is-working" : ""}`} onClick={() => void state.startOrders()} disabled={!ready || Boolean(busy) || ordersActive || running} title="발주오라의 주문·매출처·매입처를 DB센터에 맞춰요(통계·거래처·정산·주문 관리)">
          {busy === "orders" || ordersActive ? <Loader2 className="osync-spin" size={18} aria-hidden="true" /> : <ReceiptText size={18} aria-hidden="true" />}
          <span className="osync-label"><b>주문 동기화</b><small>발주오라 → DB센터</small></span>
        </button>
        <p className={`osync-last${warn(ordersLast, ordersActive) ? " is-warn" : ""}`} aria-live="polite">
          {ordersText}
          {ordersLast && !ordersActive && <small> · {relativeTime(ordersLast)}</small>}
        </p>
      </div>
      <div className="osync-item">
        <button type="button" className={`osync-button is-products${productsActive ? " is-working" : ""}`} onClick={() => void state.openProducts()} disabled={!ready || Boolean(busy) || productsActive || running} title="DB센터에서 바꾼 상품(신규·가격·삭제·품절·미노출·카테고리·배송 정책)을 발주오라에 맞춰요">
          {busy === "preview" || busy === "products" || productsActive ? <Loader2 className="osync-spin" size={18} aria-hidden="true" /> : <PackageCheck size={18} aria-hidden="true" />}
          <span className="osync-label"><b>상품 동기화</b><small>DB센터 → 발주오라</small></span>
        </button>
        <p className={`osync-last${warn(productsLast, productsActive) ? " is-warn" : ""}`} aria-live="polite">
          {productsText}
          {productsLast && !productsActive && <small> · {relativeTime(productsLast)}</small>}
        </p>
      </div>
    </div>
  );
}

function percentOf(job: OpsJobView | null | undefined, fallback: number) {
  const progress = job?.progress;
  if (progress && progress.total > 0) return Math.min(100, Math.max(3, Math.round((progress.done / progress.total) * 100)));
  return job?.status === "running" ? fallback : 4;
}

function WaitingBlock({ state, job, text }: { state: OpsSyncState; job: OpsJobView; text: React.ReactNode }) {
  const saved = state.codes[job.id];
  return (
    <>
      <p>{text}</p>
      <BaljuoraJobCode jobId={job.id} code={saved?.code ?? null} expiresAt={job.expiresAt} onReissued={state.reissued} />
      {saved?.consoleUrl && <BaljuoraWindowLink className="primary-action osync-open" href={saved.consoleUrl}><ExternalLink size={15} aria-hidden="true" /> 발주오라 관리자 창 다시 열기</BaljuoraWindowLink>}
      <BaljuoraRunnerHint />
    </>
  );
}

function OrdersPanel({ state }: { state: OpsSyncState }) {
  const { status, busy, finishedOrders, dismissed } = state;
  const runner = useBaljuoraRunner();
  const job = status?.orders.job ?? null;
  if (job && isActiveJob(job)) {
    return (
      <section className="admin-card osync-panel" aria-live="polite">
        <div className="osync-panel-head">
          <ReceiptText size={18} aria-hidden="true" />
          <h2>{job.status === "waiting" ? `주문 동기화 · ${runner ? RUNNER_WAITING_TEXT : "발주오라 창에서 책갈피를 눌러 주세요"}` : "주문 동기화 · 발주오라 주문을 읽는 중"}</h2>
          <button type="button" className="osync-close" onClick={() => void state.cancel(job.id)} disabled={busy === "cancel"} aria-label="주문 동기화 취소" title="취소"><X size={17} /></button>
        </div>
        {job.status === "waiting" ? (
          <WaitingBlock state={state} job={job} text={<>열린 <b>발주오라 관리자 창</b>에서 즐겨찾기의 <b>두고푸드 동기화</b>를 한 번 누르면 매출처·매입처·주문(상품 줄)·과세 여부를 읽어 DB센터에 맞춰요. 새 매입처는 공급사 관리에 등록해요.</>} />
        ) : (
          <>
            <div className="osync-bar"><div style={{ width: `${percentOf(job, 15)}%` }} /></div>
            <p>{job.progress?.message || "발주오라 주문을 읽는 중…"}</p>
          </>
        )}
      </section>
    );
  }
  if (job && (job.status === "failed" || job.status === "expired") && !dismissed.has(job.id) && Date.now() - parseTime(job.createdAt).getTime() < 12 * 3600_000) {
    return (
      <section className="admin-card osync-panel is-error" role="status">
        <div className="osync-panel-head"><AlertTriangle size={18} aria-hidden="true" /><h2>{job.status === "expired" ? "책갈피를 누르지 않아 주문 동기화가 만료됐어요" : "발주오라 주문을 다 읽지 못했어요"}</h2><button type="button" className="osync-close" onClick={() => state.dismiss(job.id)} aria-label="닫기"><X size={17} /></button></div>
        <p>{job.status === "failed" && typeof job.summary?.error === "string" ? job.summary.error : "주문 동기화를 다시 눌러 주세요. 발주오라 관리자 창에 로그인돼 있는지도 확인해 주세요."}</p>
      </section>
    );
  }
  if (!finishedOrders) return null;
  const summary = finishedOrders;
  const recent = status?.orders.recent ?? null;
  const official = status?.orders.official ?? null;
  const suppliers = summary.suppliers;
  return (
    <section className="admin-card osync-panel is-done" role="status">
      <div className="osync-panel-head"><CheckCircle2 size={18} aria-hidden="true" /><h2>주문 동기화 완료 · {formatSyncTime(summary.finishedAt)}</h2><button type="button" className="osync-close" onClick={state.closeOrders} aria-label="닫기"><X size={17} /></button></div>
      <p className="osync-sub">발주오라 → DB센터 · 주문일 {shortDate(summary.start)} ~ {shortDate(summary.end)}</p>
      <ul className="osync-facts">
        <li><span>주문</span><b>{count(summary.lines)}줄</b><em>{summary.newLines > 0 ? `새로 들어온 주문 ${count(summary.newOrders)}건 · ${count(summary.newLines)}줄` : "새로 들어온 주문 없음"}</em></li>
        <li><span>매출처(셀러)</span><b>{count(summary.buyers)}곳</b><em>{summary.newBuyers > 0 ? `새 매출처 ${count(summary.newBuyers)}곳 · ${names(summary.newBuyerNames)}` : "새 매출처 없음"}</em></li>
        <li><span>매입처(공급사)</span><b>{suppliers ? `${count(suppliers.read || suppliers.fromLines)}곳` : "-"}</b><em>{suppliers && suppliers.added > 0 ? `공급사 관리에 새로 등록 ${count(suppliers.added)}곳 · ${names(suppliers.names)}` : "새 매입처 없음"}{suppliers?.error ? " · 매입처 목록을 못 읽어 주문에 나온 매입처로 맞췄어요" : ""}</em></li>
      </ul>
      {official && official.items.length > 0 ? (
        <div className="osync-status" aria-label="최근 7일 주문 현황(발주오라 대시보드)">
          <span className="osync-status-title">최근 7일간 주문 현황 <small>발주오라 대시보드 그대로 · {formatSyncTime(official.at)}</small></span>
          <div className="osync-chips">
            {official.items.map((item) => <span key={item.key} className={`osync-chip${item.key === "total" ? " is-total" : item.key === "cancelled" || item.key === "returned" || item.key === "exchanged" ? " is-cancel" : item.count > 0 ? " has-value" : ""}`}><em>{item.label}</em><b>{count(item.count)}</b></span>)}
          </div>
        </div>
      ) : recent && (
        <div className="osync-status" aria-label="최근 7일 주문 현황">
          <span className="osync-status-title">최근 7일 주문 현황 <small>{shortDate(recent.from)} ~ {shortDate(recent.to)} · 주문 상품 줄</small></span>
          <div className="osync-chips">
            {recent.byStatus.map((item) => <span key={item.status} className={`osync-chip${item.lines > 0 ? " has-value" : ""}`}><em>{item.label}</em><b>{count(item.lines)}</b></span>)}
            <span className="osync-chip is-total"><em>전체</em><b>{count(recent.total)}</b></span>
            <span className="osync-chip is-cancel"><em>취소</em><b>{count(recent.cancelled)}</b></span>
          </div>
        </div>
      )}
      {!summary.complete && <p className="osync-warn">주문을 끝까지 읽지 못했어요{summary.error ? `: ${summary.error}` : ""}. 주문 동기화를 다시 눌러 주세요.</p>}
      <p className="osync-links">판매 현황(통계)·공급사 정산·세금계산서도 새 주문으로 계산돼요. <Link to="/admin/sales">판매 현황</Link> · <Link to="/admin/buyers">매출처</Link> · <Link to="/admin/suppliers">공급사 관리</Link> · <Link to="/admin/settlements">공급사 정산</Link></p>
    </section>
  );
}

const STEPS: Array<{ key: ProductPhase; label: string }> = [
  { key: "reading", label: "발주오라 상품 읽기" },
  { key: "linking", label: "보낼 것 정하기" },
  { key: "sending", label: "발주오라로 보내기" }
];

function ProductSteps({ phase }: { phase: ProductPhase }) {
  const index = phase === "waiting" ? -1 : STEPS.findIndex((step) => step.key === phase);
  return (
    <ol className="osync-steps">
      {STEPS.map((step, position) => <li key={step.key} className={position < index ? "is-done" : position === index ? "is-current" : ""}><span>{position + 1}</span>{step.label}</li>)}
    </ol>
  );
}

function leftoverText(leftovers: Leftovers | null) {
  if (!leftovers) return [];
  return [
    leftovers.pull ? `발주오라에서 바뀐 상품 ${count(leftovers.pull)}개` : "",
    leftovers.initial ? `처음부터 다른 칸만 남은 상품 ${count(leftovers.initial)}개` : "",
    leftovers.only ? `발주오라에만 있는 상품 ${count(leftovers.only)}개` : "",
    leftovers.sameName ? `발주오라에 이름이 같은 상품 ${count(leftovers.sameName)}개(같은 상품으로 연결 필요)` : "",
    leftovers.newSupplier ? `새 매입처 상품 ${count(leftovers.newSupplier)}개(발주오라에서 첫 상품 등록 필요)` : "",
    leftovers.shippingUnlinked ? `배송비 정책 연결 필요 ${count(leftovers.shippingUnlinked)}개` : ""
  ].filter(Boolean);
}

function ProductsPanel({ state }: { state: OpsSyncState }) {
  const { status, busy, finishedProducts, dismissed, linkingExpired } = state;
  const runner = useBaljuoraRunner();
  const products = status?.products;
  const phase = products?.phase ?? "idle";
  const compareJob = products?.compareJob ?? null;
  const pushJob = products?.pushJob ?? null;
  if (products && ACTIVE_PHASES.includes(phase) && compareJob && !linkingExpired) {
    const activeJob = phase === "sending" ? pushJob : compareJob;
    const stalled = phase === "linking" && products.stalled;
    return (
      <section className="admin-card osync-panel is-products" aria-live="polite">
        <div className="osync-panel-head">
          <PackageCheck size={18} aria-hidden="true" />
          <h2>{phase === "waiting" ? `상품 동기화 · ${runner ? RUNNER_WAITING_TEXT : "발주오라 창에서 책갈피를 눌러 주세요"}` : stalled ? "상품 동기화 · 발주오라 창이 보내기로 이어 가지 못했어요" : "상품 동기화 · DB센터 → 발주오라"}</h2>
          {activeJob && isActiveJob(activeJob) && <button type="button" className="osync-close" onClick={() => void state.cancel(activeJob.id)} disabled={busy === "cancel"} aria-label="상품 동기화 취소" title="취소"><X size={17} /></button>}
        </div>
        <ProductSteps phase={phase} />
        {phase === "waiting" ? (
          <WaitingBlock state={state} job={compareJob} text={<>열린 <b>발주오라 관리자 창</b>에서 즐겨찾기의 <b>두고푸드 동기화</b>를 <b>한 번만</b> 누르면 발주오라 상품을 읽고, 같은 창에서 이어서 DB센터에서 바꾼 상품을 발주오라로 보내요.</>} />
        ) : stalled ? (
          <>
            <p>발주오라 상품은 다 읽었는데 보내기를 시작하지 못했어요(발주오라 창을 닫았거나 연결이 끊김). <b>이어서 보내기</b>를 누르면 발주오라 창으로 보내기 작업을 보내요. 오른쪽 아래 동기화 버튼이 켜진 창이면 바로, 새로 열린 창이면 책갈피를 한 번 더 누르면 보내요.</p>
            <button type="button" className="primary-action osync-open" onClick={() => void state.continueProducts()} disabled={Boolean(busy)}><RefreshCw size={15} aria-hidden="true" /> 이어서 보내기</button>
          </>
        ) : (
          <>
            <div className="osync-bar"><div style={{ width: `${phase === "linking" ? 50 : percentOf(activeJob, 12)}%` }} /></div>
            <p>{phase === "linking" ? "방금 읽은 발주오라 값으로 보낼 변경을 정하는 중이에요. 발주오라 창을 닫지 말아 주세요." : activeJob?.progress?.message || PRODUCT_PHASE_TEXT[phase]}</p>
            {phase === "sending" && products.planned && <p className="osync-sub">보내는 것: {plannedText(products.planned)}</p>}
          </>
        )}
      </section>
    );
  }
  const failedJob = phase === "failed" ? (pushJob && !["done", "waiting", "running"].includes(pushJob.status) ? pushJob : compareJob) : null;
  if (products && failedJob && failedJob.status !== "cancelled" && !dismissed.has(failedJob.id) && Date.now() - parseTime(failedJob.createdAt).getTime() < 12 * 3600_000) {
    return (
      <section className="admin-card osync-panel is-error" role="status">
        <div className="osync-panel-head"><AlertTriangle size={18} aria-hidden="true" /><h2>{failedJob.status === "expired" ? "책갈피를 누르지 않아 상품 동기화가 만료됐어요" : failedJob.type === "push" ? "발주오라로 다 보내지 못했어요" : "발주오라 상품을 다 읽지 못했어요"}</h2><button type="button" className="osync-close" onClick={() => state.dismiss(failedJob.id)} aria-label="닫기"><X size={17} /></button></div>
        <p>{typeof failedJob.summary?.error === "string" ? failedJob.summary.error : products.error ?? "상품 동기화를 다시 눌러 주세요. 발주오라 관리자 창에 로그인돼 있는지도 확인해 주세요."}</p>
      </section>
    );
  }
  if (linkingExpired && compareJob && !dismissed.has(compareJob.id)) {
    return (
      <section className="admin-card osync-panel is-error" role="status">
        <div className="osync-panel-head"><AlertTriangle size={18} aria-hidden="true" /><h2>상품을 읽은 지 오래돼 보내지 않았어요</h2><button type="button" className="osync-close" onClick={() => state.dismiss(compareJob.id)} aria-label="닫기"><X size={17} /></button></div>
        <p>발주오라 창이 보내기로 이어 가지 못한 채 30분이 지났어요. 최신 값으로 보내도록 상품 동기화를 다시 눌러 주세요.</p>
      </section>
    );
  }
  if (!finishedProducts) return null;
  const summary = finishedProducts;
  const left = leftoverText(summary.leftovers);
  return (
    <section className="admin-card osync-panel is-done" role="status">
      <div className="osync-panel-head"><CheckCircle2 size={18} aria-hidden="true" /><h2>상품 동기화 완료 · {formatSyncTime(summary.finishedAt)}</h2><button type="button" className="osync-close" onClick={state.closeProducts} aria-label="닫기"><X size={17} /></button></div>
      <p className="osync-sub">DB센터 → 발주오라{summary.received !== null ? ` · 발주오라 상품 ${count(summary.received)}개를 새로 읽음` : ""}</p>
      {summary.nothing || !summary.result ? (
        <p>보낼 변경이 없었어요. DB센터와 발주오라 상품이 같아요.</p>
      ) : (
        <ul className="osync-facts is-products">
          <li><span>신규 등록</span><b>{count(summary.result.created)}개</b><em>발주오라에 새로 올림{summary.planned ? ` · 보낸 ${count(summary.planned.creates)}개 중` : ""}</em></li>
          <li><span>바뀐 상품</span><b>{count(summary.result.updated)}개</b><em>가격·상품명·썸네일·카테고리·배송비·품절·노출 등{summary.planned ? ` · ${count(summary.planned.updates)}개 중` : ""}</em></li>
          <li><span>지운 상품</span><b>{count(summary.result.hidden)}개</b><em>발주오라 미노출·품절로 바꿈{summary.planned ? ` · ${count(summary.planned.hides)}개 중` : ""}</em></li>
          <li><span>카테고리</span><b>{count(summary.result.categoryApplied)}건</b><em>{summary.result.categorySkipped ? `못 한 것 ${count(summary.result.categorySkipped)}건` : "추가·이름 바꾸기"}</em></li>
          {summary.result.failed > 0 && <li className="is-fail"><span>실패</span><b>{count(summary.result.failed)}개</b><em>아래 까닭을 확인해 주세요</em></li>}
        </ul>
      )}
      {summary.error && <p className="osync-warn">중간에 멈췄어요: {summary.error}</p>}
      {summary.failures.length > 0 && <ul className="osync-failures">{summary.failures.slice(0, 5).map((entry, index) => <li key={index}><b>{entry.name}</b> {entry.error}</li>)}</ul>}
      {left.length > 0 && <p className="osync-follow">저절로 바꾸지 않은 것: {left.join(" · ")} — <Link to="/admin/sync">발주오라 동기화 화면에서 보기</Link></p>}
    </section>
  );
}

function plannedText(planned: Counts) {
  return [
    planned.creates ? `신규 등록 ${count(planned.creates)}개` : "",
    planned.updates ? `바뀐 상품 ${count(planned.updates)}개` : "",
    planned.hides ? `지운 상품 미노출 ${count(planned.hides)}개` : "",
    planned.categories ? `카테고리 ${count(planned.categories)}건` : ""
  ].filter(Boolean).join(" · ") || "없음";
}

function ProductPreviewModal({ state, preview }: { state: OpsSyncState; preview: ProductPreview }) {
  const [options, setOptions] = useState<ProductOptions>({ updates: true, creates: true, hides: true, categories: true });
  const toggle = (key: keyof ProductOptions) => setOptions((current) => ({ ...current, [key]: !current[key] }));
  const none = !options.updates && !options.creates && !options.hides && !options.categories;
  const samples = (list: Sample[], total: number) => list.length > 0 ? <small className="osync-samples">예: {list.map((item) => item.name).join(", ")}{total > list.length ? ` 외 ${count(total - list.length)}개` : ""}</small> : null;
  const left = leftoverText(preview.leftovers);
  const choices: Array<{ key: keyof ProductOptions; title: string; amount: string; text: string; extra?: React.ReactNode }> = [
    {
      key: "updates",
      title: "바뀐 상품 보내기",
      amount: `${count(preview.updates.count)}개`,
      text: "DB센터에서 고친 상품명·가격(공급가·수강생 단가·소비자가·매입원가)·썸네일·카테고리·배송비 정책·품절·노출·상품 정보를 발주오라에 맞춰요.",
      extra: (
        <>
          {preview.updates.fields.length > 0 && <small className="osync-fields">{preview.updates.fields.slice(0, 8).map((item) => `${BALJUORA_FIELD_SHORT_LABELS[item.field] ?? item.field} ${count(item.count)}`).join(" · ")}</small>}
          {preview.updates.conflicts > 0 && <small className="osync-fields is-warn">양쪽에서 바뀐 상품 {count(preview.updates.conflicts)}개는 DB센터 값으로 맞춰요</small>}
          {samples(preview.updates.samples, preview.updates.count)}
        </>
      )
    },
    { key: "creates", title: "신규 등록", amount: `${count(preview.creates.count)}개`, text: "발주오라에 없는 DB센터 공개 상품을 발주오라에 새로 올려요(같은 매입처 상품의 매입처·배송 설정을 복사).", extra: samples(preview.creates.samples, preview.creates.count) },
    { key: "hides", title: "지운 상품 숨기기", amount: `${count(preview.hides.count)}개`, text: "DB센터에서 지운 상품을 발주오라에서 미노출·품절로 바꿔요(발주오라 상품은 지우지 않아요).", extra: samples(preview.hides.samples, preview.hides.count) },
    { key: "categories", title: "카테고리 맞추기", amount: `${count(preview.categories.count)}건`, text: "DB센터에서 추가하거나 이름을 바꾼 카테고리를 발주오라 상품 카테고리에도 똑같이(브랜드별 제외).", extra: preview.categories.samples.length > 0 ? <small className="osync-samples">예: {preview.categories.samples.map((item) => item.name).join(", ")}</small> : null }
  ];
  return (
    <AdminSheetModal
      kicker="DB센터 → 발주오라"
      title="상품 동기화"
      description={<>발주오라 관리자 창에서 책갈피를 <b>한 번</b> 누르면 ① 발주오라 상품을 새로 읽고 ② 아래에서 고른 것만 발주오라로 보내요. {preview.compared && preview.lastCompareAt ? `숫자는 마지막으로 읽은 때(${formatSyncTime(preview.lastCompareAt)}) 기준이라 새로 읽으면 조금 달라질 수 있어요.` : ""}</>}
      onClose={state.closePreview}
      className="osync-modal"
      footer={(
        <>
          <button type="button" className="outline-button" onClick={state.closePreview}>취소</button>
          <button type="button" className="primary-action" onClick={() => void state.startProducts(options)} disabled={none || state.busy === "products"}>
            {state.busy === "products" ? <Loader2 className="osync-spin" size={16} aria-hidden="true" /> : <ExternalLink size={16} aria-hidden="true" />} 발주오라 창 열고 시작
          </button>
        </>
      )}
    >
      {!preview.compared && <p className="osync-note">아직 발주오라 상품을 읽은 적이 없어 보낼 수를 몰라요. 시작하면 먼저 발주오라 상품을 읽고 같은 규칙으로 보낼 것을 정해요.</p>}
      <div className="osync-choices">
        {choices.map((choice) => (
          <label key={choice.key} className={`osync-choice${options[choice.key] ? " is-on" : ""}`}>
            <input type="checkbox" checked={options[choice.key]} onChange={() => toggle(choice.key)} />
            <span className="osync-choice-body">
              <span className="osync-choice-title"><b>{choice.title}</b><em>{choice.amount}</em></span>
              <span className="osync-choice-text">{choice.text}</span>
              {choice.extra}
            </span>
          </label>
        ))}
      </div>
      <div className="osync-leftovers">
        <b>저절로 바꾸지 않는 것</b>
        {left.length > 0 ? <ul>{left.map((text) => <li key={text}>{text}</li>)}</ul> : <p>없어요.</p>}
        <p>발주오라에서 바뀐 값을 DB센터로 가져오거나, 처음부터 다른 칸의 방향을 고르는 일은 <Link to="/admin/sync" onClick={state.closePreview}>발주오라 동기화 화면</Link>에서 해요.</p>
      </div>
    </AdminSheetModal>
  );
}

// 머리 아래 한 줄 전체: 진행 칸·끝난 요약(주문 → 상품 순서), 상품 동기화 미리보기 팝업
export function OpsSyncPanel({ state }: { state: OpsSyncState }) {
  return (
    <>
      <OrdersPanel state={state} />
      <ProductsPanel state={state} />
      {state.preview && <ProductPreviewModal state={state} preview={state.preview} />}
    </>
  );
}
