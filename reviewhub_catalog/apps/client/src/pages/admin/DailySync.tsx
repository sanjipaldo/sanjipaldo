// 운영 홈 > 발주오라 → DB센터 동기화(아침 동기화, 2026-11-26 관리자 요청 "아침에 출근할 때 버튼 하나 누르면 발주오라에서 바뀐
// 정산·매출·주문·상품 변경사항이 싹다 DB센터에 맞춰지고, 몇 일 몇 시에 업데이트됐는지 버튼 밑에").
// 발주오라는 서버가 대신 로그인하지 않으므로: 버튼 → 작업 코드 + 발주오라 관리자 창 열기 → 그 창에서 책갈피 '두고푸드 동기화' 한 번 →
// 발주오라 상품·주문·매출처를 다 읽으면 이 화면이 발주오라 변경을 DB센터에 25개씩 반영하고(서버 /baljuora/admin/daily/apply) 마지막 동기화 시각을 남깁니다.
// 반영이 덜 끝난 채 화면을 닫았으면 다음에 운영 홈을 열 때 이어서 반영합니다(읽은 지 12시간 안).
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { clearJobCode, loadJobCode, saveJobCode } from "@/lib/baljuora-job-code";
import { BaljuoraJobCode, type ReissuedJobCode } from "./BaljuoraJobCode";
import { jsonInit, readData } from "./sales-admin-shared";
import "./daily-sync.css";

type JobView = {
  id: string;
  type: string;
  status: "waiting" | "running" | "done" | "failed" | "expired" | "cancelled";
  createdAt: string;
  finishedAt: string | null;
  expiresAt: string;
  progress: { done: number; total: number; message: string } | null;
  summary: Record<string, unknown> | null;
  daily?: boolean;
};
export type DailySummary = {
  jobId: string;
  comparedAt: string | null;
  finishedAt: string | null;
  totalProducts: number;
  totalOnly: number;
  updated: number;
  created: number;
  unchanged: number;
  failed: number;
  skippedFields: number;
  failures: Array<{ name: string; error: string }>;
  conflicts: number;
  pushPending: number;
  newPending: number;
  initialPending: number;
  products: { received: number; linked: number; baljuoraOnly: number } | null;
  sales: { lines: number; buyers: number; complete: boolean; error: string | null; start: string | null; end: string | null } | null;
};
type DailyStatus = { ready: boolean; last: DailySummary | null; job: JobView | null; needsApply: boolean; stale: boolean; applying: { done: number; total: number } | null };
type ApplyStep = { status: "applying" | "done" | "busy"; done: number; total: number; last: DailySummary | null };

const count = (value: number) => value.toLocaleString("ko-KR");

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

// 한국 날짜가 오늘인지
function isTodaySeoul(value: string) {
  const day = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return day(parseTime(value)) === day(new Date());
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function useDailySync(onApplied?: () => void) {
  const [status, setStatus] = useState<DailyStatus | null>(null);
  const [code, setCode] = useState<{ jobId: string; code: string | null; consoleUrl: string | null } | null>(null);
  const [busy, setBusy] = useState<"" | "start" | "cancel">("");
  const [applying, setApplying] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 이번에 화면에서 끝낸 동기화 요약(닫기 전까지 보여 줌)
  const [finished, setFinished] = useState<DailySummary | null>(null);
  const applyingRef = useRef(false);
  const onAppliedRef = useRef(onApplied);
  onAppliedRef.current = onApplied;

  const load = useCallback(async () => {
    const next = await readData<DailyStatus>(await apiFetch("/baljuora/admin/daily", { silent: true }));
    setStatus(next);
    const job = next.job;
    if (job && (job.status === "waiting" || job.status === "running")) {
      setCode((current) => {
        if (current?.jobId === job.id) return current;
        const saved = loadJobCode(job.id);
        return { jobId: job.id, code: saved?.code ?? null, consoleUrl: saved?.consoleUrl ?? null };
      });
    }
    return next;
  }, []);

  useEffect(() => {
    void load().catch(() => setStatus({ ready: false, last: null, job: null, needsApply: false, stale: false, applying: null }));
  }, [load]);

  // 발주오라 창이 읽는 동안 2초마다 봅니다.
  const jobActive = Boolean(status?.job && (status.job.status === "waiting" || status.job.status === "running"));
  useEffect(() => {
    if (!jobActive) return;
    const timer = window.setInterval(() => { void load().catch(() => undefined); }, 2000);
    return () => window.clearInterval(timer);
  }, [jobActive, load]);

  const apply = useCallback(async () => {
    if (applyingRef.current) return;
    applyingRef.current = true;
    setError(null);
    setApplying({ done: 0, total: 0 });
    try {
      let result: ApplyStep | null = null;
      for (let round = 0; round < 600; round += 1) {
        result = await readData<ApplyStep>(await apiFetch("/baljuora/admin/daily/apply", { ...jsonInit("POST", {}), silent: true }));
        setApplying({ done: result.done, total: result.total });
        if (result.status === "done") break;
        // 다른 창이 같은 회차를 반영 중이면 잠깐 기다렸다 다시 봅니다.
        if (result.status === "busy") await wait(3000);
      }
      if (result?.status === "done" && result.last) {
        setFinished(result.last);
        clearJobCode(result.last.jobId);
        toast.success(`발주오라 → DB센터 동기화를 마쳤어요 · ${formatSyncTime(result.last.finishedAt ?? new Date().toISOString())}`);
        onAppliedRef.current?.();
      }
      setCode(null);
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "DB센터에 반영하지 못했어요.");
    } finally {
      applyingRef.current = false;
      setApplying(null);
    }
  }, [load]);

  // 읽기가 끝났는데 반영 전이면 바로(또는 다시 열었을 때 이어서) 반영합니다.
  useEffect(() => {
    if (status?.needsApply && !applyingRef.current) void apply();
  }, [status?.needsApply, apply]);

  const start = useCallback(async () => {
    setBusy("start");
    setError(null);
    setFinished(null);
    try {
      const created = await readData<{ job: JobView; code: string; consoleUrl: string }>(await apiFetch("/baljuora/admin/daily/start", jsonInit("POST", {})));
      saveJobCode({ id: created.job.id, type: created.job.type, code: created.code, consoleUrl: created.consoleUrl, expiresAt: created.job.expiresAt });
      setCode({ jobId: created.job.id, code: created.code, consoleUrl: created.consoleUrl });
      window.open(created.consoleUrl, "_blank", "noopener");
      toast.success("발주오라 관리자 창을 열었어요. 그 창에서 책갈피 '두고푸드 동기화'를 한 번 눌러 주세요.");
      await load();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "동기화를 시작하지 못했어요.");
    } finally {
      setBusy("");
    }
  }, [load]);

  const cancel = useCallback(async () => {
    const job = status?.job;
    if (!job) return;
    setBusy("cancel");
    try {
      await readData(await apiFetch(`/baljuora/admin/jobs/${job.id}/cancel`, { method: "POST" }));
      clearJobCode(job.id);
      setCode(null);
      await load();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "취소하지 못했어요.");
    } finally {
      setBusy("");
    }
  }, [status?.job, load]);

  const reissued = useCallback((result: ReissuedJobCode<JobView>) => {
    saveJobCode({ id: result.job.id, type: result.job.type, code: result.code, consoleUrl: result.consoleUrl, expiresAt: result.job.expiresAt });
    setCode({ jobId: result.job.id, code: result.code, consoleUrl: result.consoleUrl });
  }, []);

  return { status, code, busy, applying, error, finished, jobActive, start, apply, cancel, reissued, closeFinished: () => setFinished(null), clearError: () => setError(null) };
}

export type DailySyncState = ReturnType<typeof useDailySync>;

function lastLine(state: DailySyncState) {
  const { status, applying, jobActive } = state;
  if (applying) return applying.total > 0 ? `DB센터에 반영 중 ${count(applying.done)} / ${count(applying.total)}` : "DB센터에 반영할 것을 찾는 중…";
  if (jobActive && status?.job) return status.job.status === "waiting" ? "발주오라 창에서 책갈피를 눌러 주세요" : status.job.progress?.message || "발주오라 값을 읽는 중…";
  if (status?.last?.finishedAt) return `마지막 동기화 ${formatSyncTime(status.last.finishedAt)}`;
  if (status && !status.ready) return "DB 업데이트(034) 뒤에 쓸 수 있어요";
  return "아직 동기화한 적 없어요";
}

// 운영 홈 머리 오른쪽: 버튼 + 버튼 밑 마지막 동기화(몇 일 몇 시)
export function DailySyncButton({ state }: { state: DailySyncState }) {
  const { status, busy, applying, jobActive } = state;
  const lastAt = status?.last?.finishedAt ?? null;
  const notToday = Boolean(status?.ready && !applying && !jobActive && (!lastAt || !isTodaySeoul(lastAt)));
  const working = Boolean(applying) || jobActive;
  return (
    <div className="dsync">
      <button type="button" className={`dsync-button${working ? " is-working" : ""}`} onClick={() => void state.start()} disabled={!status?.ready || Boolean(busy) || working}>
        {busy === "start" || working ? <Loader2 className="dsync-spin" size={17} aria-hidden="true" /> : <RefreshCw size={17} aria-hidden="true" />}
        <span>발주오라 → DB센터 동기화</span>
      </button>
      <p className={`dsync-last${notToday ? " is-warn" : ""}`} aria-live="polite">
        {lastLine(state)}
        {lastAt && !working && <small> · {relativeTime(lastAt)}{notToday ? " · 오늘 아직 안 했어요" : ""}</small>}
      </p>
    </div>
  );
}

// 머리 아래 한 줄 전체: 책갈피 안내·작업 코드·진행 막대·끝난 요약
export function DailySyncPanel({ state }: { state: DailySyncState }) {
  const { status, code, busy, applying, error, finished, jobActive } = state;
  const job = status?.job ?? null;
  if (applying) {
    const percent = applying.total > 0 ? Math.min(100, Math.round((applying.done / applying.total) * 100)) : 8;
    return (
      <section className="admin-card dsync-panel is-applying" aria-live="polite">
        <div className="dsync-panel-head"><Loader2 className="dsync-spin" size={18} aria-hidden="true" /><h2>DB센터에 반영하는 중</h2></div>
        <div className="dsync-bar"><div style={{ width: `${percent}%` }} /></div>
        <p>{applying.total > 0 ? `발주오라에서 바뀐 상품·새 상품 ${count(applying.done)} / ${count(applying.total)}개 반영` : "발주오라에서 바뀐 것을 찾는 중…"} · 이 화면을 닫지 말아 주세요(닫으면 다음에 열 때 이어서 반영해요).</p>
      </section>
    );
  }
  if (jobActive && job) {
    const percent = job.progress && job.progress.total > 0 ? Math.min(100, Math.round((job.progress.done / job.progress.total) * 100)) : job.status === "running" ? 12 : 4;
    return (
      <section className="admin-card dsync-panel" aria-live="polite">
        <div className="dsync-panel-head">
          <RefreshCw size={18} aria-hidden="true" />
          <h2>{job.status === "waiting" ? "발주오라 창에서 책갈피를 눌러 주세요" : "발주오라 값을 읽는 중"}</h2>
          {job.status === "waiting" && <button type="button" className="dsync-close" onClick={() => void state.cancel()} disabled={busy === "cancel"} aria-label="동기화 취소"><X size={17} /></button>}
        </div>
        {job.status === "waiting" ? (
          <>
            <p>열린 <b>발주오라 관리자 창</b>에서 즐겨찾기의 <b>두고푸드 동기화</b>를 한 번 누르면 상품·주문·매출처·과세 여부를 모두 읽고, 끝나면 이 화면이 DB센터에 반영해요.</p>
            <BaljuoraJobCode jobId={job.id} code={code?.jobId === job.id ? code.code : null} expiresAt={job.expiresAt} onReissued={state.reissued} />
            {code?.jobId === job.id && code.consoleUrl && <a className="primary-action dsync-open" href={code.consoleUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> 발주오라 관리자 창 다시 열기</a>}
          </>
        ) : (
          <>
            <div className="dsync-bar"><div style={{ width: `${percent}%` }} /></div>
            <p>{job.progress?.message || "발주오라 상품·주문을 읽는 중…"}</p>
          </>
        )}
      </section>
    );
  }
  if (error) {
    return (
      <section className="admin-card dsync-panel is-error" role="alert">
        <div className="dsync-panel-head"><AlertTriangle size={18} aria-hidden="true" /><h2>DB센터에 다 반영하지 못했어요</h2><button type="button" className="dsync-close" onClick={state.clearError} aria-label="닫기"><X size={17} /></button></div>
        <p>{error}</p>
        <button type="button" className="outline-button" onClick={() => void state.apply()}>이어서 반영</button>
      </section>
    );
  }
  if (job && (job.status === "failed" || job.status === "expired") && !finished && (!status?.last || status.last.jobId !== job.id) && Date.now() - parseTime(job.createdAt).getTime() < 12 * 3600_000) {
    return (
      <section className="admin-card dsync-panel is-error" role="status">
        <div className="dsync-panel-head"><AlertTriangle size={18} aria-hidden="true" /><h2>{job.status === "expired" ? "책갈피를 누르지 않아 동기화가 만료됐어요" : "발주오라 값을 다 읽지 못했어요"}</h2></div>
        <p>{job.status === "failed" && typeof job.summary?.error === "string" ? job.summary.error : "버튼을 다시 눌러 주세요. 발주오라 관리자 창에 로그인돼 있는지도 확인해 주세요."}</p>
      </section>
    );
  }
  if (status?.stale) {
    return (
      <section className="admin-card dsync-panel is-error" role="status">
        <div className="dsync-panel-head"><AlertTriangle size={18} aria-hidden="true" /><h2>예전에 읽은 발주오라 값이 반영되지 않았어요</h2></div>
        <p>읽은 지 오래돼 저절로 반영하지 않았어요. 버튼을 다시 눌러 최신 값을 읽어 주세요.</p>
      </section>
    );
  }
  if (finished) {
    const parts = [
      `상품 ${count(finished.updated)}개 발주오라 값으로 바뀜`,
      finished.created ? `새 상품 ${count(finished.created)}개 DB센터에 숨김 등록` : "",
      finished.sales ? `주문 ${count(finished.sales.lines)}줄 · 매출처 ${count(finished.sales.buyers)}곳${finished.sales.complete ? "" : "(주문은 일부만)"}` : "",
      finished.failed ? `실패 ${count(finished.failed)}개` : ""
    ].filter(Boolean);
    const follow = [
      finished.conflicts ? `양쪽에서 바뀐 상품 ${count(finished.conflicts)}개(그대로 둠)` : "",
      finished.pushPending ? `DB센터에서 바꿔 발주오라로 보낼 상품 ${count(finished.pushPending)}개` : "",
      finished.newPending ? `발주오라에 새로 등록할 상품 ${count(finished.newPending)}개` : ""
    ].filter(Boolean);
    return (
      <section className="admin-card dsync-panel is-done" role="status">
        <div className="dsync-panel-head"><CheckCircle2 size={18} aria-hidden="true" /><h2>동기화 완료 · {formatSyncTime(finished.finishedAt ?? new Date().toISOString())}</h2><button type="button" className="dsync-close" onClick={state.closeFinished} aria-label="닫기"><X size={17} /></button></div>
        <p>{parts.join(" · ")}. 판매 현황·공급사 정산·세금계산서도 새 주문으로 계산돼요.</p>
        {follow.length > 0 && <p className="dsync-follow">확인할 것: {follow.join(" · ")} — <Link to="/admin/sync">발주오라 동기화 화면에서 보기</Link></p>}
        {finished.failures.length > 0 && <ul className="dsync-failures">{finished.failures.slice(0, 4).map((entry, index) => <li key={index}>{entry.name}: {entry.error}</li>)}</ul>}
      </section>
    );
  }
  return null;
}
