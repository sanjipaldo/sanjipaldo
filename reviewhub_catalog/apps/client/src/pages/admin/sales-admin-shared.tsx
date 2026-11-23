// 관리자 > 판매 현황·매출처·세금계산서·공급사 정산(2026-11-23, 관리자 요청 "1차 개발")에서 함께 쓰는 값·도우미·작업 카드.
// 발주오라 판매·매출처는 발주오라 동기화와 같은 방식(작업 코드 → 로그인해 둔 발주오라 관리자 창에서 책갈피 "두고푸드 동기화")으로 읽어 옵니다.
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { formatBaljuoraCode } from "@repo/shared/baljuora-sync";
import { apiFetch } from "@/lib/api";

export async function readData<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({ ok: false }))) as { ok: boolean; data: T; error?: { message?: string } };
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "요청을 처리하지 못했습니다.");
  return payload.data;
}

export function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export function won(value: number | null | undefined) {
  return `${Math.round(value ?? 0).toLocaleString("ko-KR")}원`;
}

export function compactWon(value: number) {
  const amount = Math.round(value);
  if (Math.abs(amount) >= 100_000_000) return `${(amount / 100_000_000).toFixed(amount % 100_000_000 === 0 ? 0 : 1)}억`;
  if (Math.abs(amount) >= 10_000) return `${Math.round(amount / 10_000).toLocaleString("ko-KR")}만`;
  return amount.toLocaleString("ko-KR");
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function monthLabel(month: string) {
  const [year, value] = month.split("-");
  return `${year}년 ${Number(value)}월`;
}

export function percent(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export async function saveResponseFile(response: Response, fallbackName: string) {
  const disposition = response.headers.get("Content-Disposition") || "";
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const name = encoded ? decodeURIComponent(encoded) : /filename="([^"]+)"/.exec(disposition)?.[1] || fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // 바로 지우면 일부 브라우저에서 파일 이름이 사라져 잠시 뒤에 지웁니다.
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export type SalesSyncState = { at: string; jobId: string; start: string; end: string; complete: boolean; lines: number; buyers: number; error: string | null } | null;

export function SyncStateNote({ sync }: { sync: SalesSyncState }) {
  if (!sync) return <span className="sa-sync-note is-empty">아직 발주오라 판매를 불러온 적이 없어요.</span>;
  return (
    <span className={`sa-sync-note ${sync.complete ? "" : "is-partial"}`}>
      마지막 불러오기 {formatDateTime(sync.at)} · {sync.start} ~ {sync.end} · 판매 {sync.lines.toLocaleString("ko-KR")}줄 · 매출처 {sync.buyers.toLocaleString("ko-KR")}곳
      {!sync.complete && <b> · 주문을 끝까지 읽지 못함{sync.error ? `(${sync.error})` : ""}</b>}
    </span>
  );
}

type JobView = {
  id: string;
  type: "compare" | "push" | "sales";
  status: "waiting" | "running" | "done" | "failed" | "expired" | "cancelled";
  expiresAt: string;
  progress: { done: number; total: number; message: string } | null;
  summary: Record<string, unknown> | null;
  salesRange?: { start: string; end: string } | null;
};

const STATUS_LABELS: Record<JobView["status"], string> = { waiting: "발주오라 창에서 시작을 기다리는 중", running: "발주오라에서 읽는 중", done: "다 불러왔어요", failed: "불러오지 못했어요", expired: "작업 코드가 만료됐어요", cancelled: "취소했어요" };
const MONTH_OPTIONS = [1, 2, 3, 6, 12];

/** 발주오라에서 판매·매출처 불러오기(작업 만들기 → 발주오라 창 열기 → 책갈피 → 진행 상황) */
export function SalesSyncCard({ sync, onDone, compact = false }: { sync: SalesSyncState; onDone: () => void; compact?: boolean }) {
  const [months, setMonths] = useState(2);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<{ view: JobView; code: string; consoleUrl: string } | null>(null);
  const active = job ? job.view.status === "waiting" || job.view.status === "running" : false;

  const start = async () => {
    setBusy(true);
    try {
      const created = await readData<{ job: JobView; code: string; consoleUrl: string }>(await apiFetch("/baljuora/admin/jobs", jsonInit("POST", { type: "sales", months })));
      setJob({ view: created.job, code: created.code, consoleUrl: created.consoleUrl });
      window.open(created.consoleUrl, "_blank", "noopener");
      toast.success("발주오라 관리자 창을 열었어요. 그 창에서 책갈피 '두고푸드 동기화'를 눌러 주세요.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "작업을 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!job) return;
    await apiFetch(`/baljuora/admin/jobs/${job.view.id}/cancel`, { method: "POST" });
    setJob(null);
  };

  const jobId = job?.view.id;
  const poll = useCallback(async (id: string) => {
    const { job: next } = await readData<{ job: JobView }>(await apiFetch(`/baljuora/admin/jobs/${id}`, { silent: true }));
    setJob((current) => current && current.view.id === next.id ? { ...current, view: next } : current);
    if (next.status === "done") {
      toast.success("발주오라 판매·매출처를 불러왔어요.");
      onDone();
    }
  }, [onDone]);

  useEffect(() => {
    if (!jobId || !active) return;
    const timer = window.setInterval(() => { void poll(jobId).catch(() => undefined); }, 2000);
    return () => window.clearInterval(timer);
  }, [jobId, active, poll]);

  const view = job?.view;
  const progress = view?.progress;
  const progressPercent = progress && progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : view?.status === "done" ? 100 : view?.status === "running" ? 15 : 0;
  return (
    <section className={`admin-card sa-sync-card ${compact ? "is-compact" : ""}`} aria-live="polite">
      <div className="sa-sync-head">
        <div>
          <h2><RefreshCw size={18} aria-hidden="true" /> 발주오라에서 판매·매출처 불러오기</h2>
          <p>주문(주문일 기준)과 매출처(셀러) 회원을 읽어 DB센터에 저장해요. 같은 기간을 다시 불러오면 취소·반품으로 바뀐 수량도 반영됩니다. <b>발주오라 상품 불러오기(비교)</b>를 할 때도 함께 불러와요.</p>
          <SyncStateNote sync={sync} />
        </div>
        <div className="sa-sync-actions">
          <label>
            <span>기간</span>
            <select value={months} onChange={(event) => setMonths(Number(event.target.value))} disabled={busy || active}>
              {MONTH_OPTIONS.map((value) => <option key={value} value={value}>{value === 1 ? "이번 달" : `최근 ${value}개월`}</option>)}
            </select>
          </label>
          <button type="button" className="primary-action" onClick={() => void start()} disabled={busy || active}>
            {busy ? <Loader2 className="sa-spin" size={16} /> : <RefreshCw size={16} />} 불러오기
          </button>
        </div>
      </div>
      {view && (
        <div className={`sa-job is-${view.status}`}>
          <div className="sa-job-head">
            <strong>
              {view.status === "done" ? <CheckCircle2 size={16} aria-hidden="true" /> : view.status === "failed" || view.status === "expired" ? <AlertTriangle size={16} aria-hidden="true" /> : <Loader2 className="sa-spin" size={16} aria-hidden="true" />}
              {STATUS_LABELS[view.status]}
            </strong>
            {active ? <button type="button" className="outline-button" onClick={() => void cancel()}>작업 취소</button> : <button type="button" className="sa-icon-button" onClick={() => setJob(null)} aria-label="작업 닫기"><X size={16} /></button>}
          </div>
          {view.status === "waiting" && (
            <div className="sa-job-waiting">
              <p>열린 <b>발주오라 관리자 창</b>에서 즐겨찾기 막대의 <b>두고푸드 동기화</b>를 눌러 주세요. 책갈피는 <b>발주오라 동기화</b> 메뉴에서 만들 수 있어요.</p>
              <div className="sa-code"><span>작업 코드</span><strong>{formatBaljuoraCode(job.code)}</strong></div>
              <a className="outline-button" href={job.consoleUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> 발주오라 관리자 창 다시 열기</a>
            </div>
          )}
          <div className="sa-progress"><div style={{ width: `${progressPercent}%` }} /></div>
          {progress?.message && <p className="sa-job-message">{progress.message}</p>}
        </div>
      )}
    </section>
  );
}
