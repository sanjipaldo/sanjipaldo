// 발주오라 동기화 화면 'DB센터 ↔ 발주오라 상품 수 맞춰 보기'(2026-11-27 관리자 요청 "발주오라는 2,998개(판매중 1,779 · 품절 1,219 · 미노출+품절 1,160),
// DB센터는 2,143개 — 왜 일치하지 않는지 먼저 확인하고, 동기화로 DB <> 발주오라를 똑같이 맞출 수 있나?").
// 마지막으로 읽은 발주오라 값 기준으로 양쪽 전체·판매중·품절·노출 수를 나란히 놓고, 차이를 원인별로 나눕니다(GET /api/baljuora/admin/reconcile).
// 같은 날 두 번째 요청("2,998개 전체를 DB센터로 가져와 판매중·품절·미노출·전체 수를 똑같이 — 상품도 다 가져와야")으로 맞추는 버튼은
// '발주오라와 똑같이 맞추기' 하나입니다(GET /api/baljuora/admin/align, POST /admin/align/run을 끝날 때까지 되풀이):
//   이름 같은 상품 연결 → 발주오라에만 있는 상품 가져오기(지운 상품 되살림, 발주오라 노출·품절 그대로) → 연결 상품의 품절·노출을 발주오라 값으로.
// 운영 배포 때 한 번 자동으로 돌고(서버 deploy-tasks), 그 뒤에는 이 버튼으로 다시 맞춥니다. 발주오라는 바꾸지 않습니다.
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Scale } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

type Counts = { total: number; selling: number; soldOut: number; visible: number; hidden: number; hiddenSoldOut: number };
export type ReconcileView = {
  compared: boolean;
  lastCompareAt: string | null;
  baljuora: (Counts & { source: "compare" | "estimated" }) | null;
  doogo: Counts & { seasonEnded: number; deleted: number };
  linked: number;
  doogoOnly: { total: number; visible: number; hidden: number };
  baljuoraOnly: { total: number; deleted: number; deletedLinked: number; never: number; selling: number; soldOut: number; visible: number; hidden: number; hiddenSoldOut: number; sameName: number; importIds: string[] };
  soldOut: { doogoSellingBaljuoraSoldOut: number; doogoSoldOutBaljuoraSelling: number; productIds: string[] };
  visible: { doogoHiddenBaljuoraVisible: number; doogoVisibleBaljuoraHidden: number };
};

type AlignCounts = { total: number; selling: number; soldOut: number; seasonEnded: number; visible: number; hidden: number };
type AlignTotals = { linked: number; removed: number; imported: number; restored: number; created: number; states: number; failed: number };
type AlignSide = { doogo: AlignCounts; baljuora: AlignCounts & { unknown: number } };
export type AlignView = {
  compared: boolean;
  lastCompareAt: string | null;
  bundles: number;
  doogo: AlignCounts;
  baljuora: AlignCounts & { unknown: number };
  linked: number;
  doogoOnly: { total: number; visible: number; soldOut: number };
  pending: {
    sameName: number;
    sameNameReview: number;
    imports: number;
    importRestore: number;
    orphans: number;
    states: number;
    stateDetail: { soldOut: number; restock: number; seasonToSoldOut: number; show: number; hide: number };
    total: number;
  };
  matched: boolean;
  run: { startedAt: string; trigger: "deploy" | "admin"; active: boolean; totals: AlignTotals; failures: number } | null;
  last: {
    startedAt: string;
    finishedAt: string;
    by: string;
    trigger: "deploy" | "admin";
    totals: AlignTotals;
    failures: Array<{ step: string; id: string; name: string; error: string }>;
    before: AlignSide;
    after: AlignSide;
    doogoOnly: number;
    sameNameReview: number;
    bundles: number;
    lastCompareAt: string | null;
    matched: boolean;
  } | null;
};
type AlignStepResult = { done: boolean; busy: boolean; view: AlignView };

// 서버가 예전 버전이거나 응답 모양이 다르면 칸을 그리지 않습니다.
function isReconcileView(value: unknown): value is ReconcileView {
  const view = value as Partial<ReconcileView> | null;
  return Boolean(view && view.doogo && view.baljuoraOnly && Array.isArray(view.baljuoraOnly.importIds) && view.soldOut && Array.isArray(view.soldOut.productIds) && view.visible && view.doogoOnly);
}
function isAlignView(value: unknown): value is AlignView {
  const view = value as Partial<AlignView> | null;
  return Boolean(view && view.doogo && view.baljuora && view.pending && typeof view.pending.total === "number");
}
const n = (value: number | null | undefined) => Number(value ?? 0).toLocaleString("ko-KR");

async function readData<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({ ok: false }))) as { ok: boolean; data: T; error?: { message?: string } };
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "처리하지 못했어요.");
  return payload.data;
}

function formatTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function Delta({ doogo, baljuora }: { doogo: number; baljuora: number | null }) {
  if (baljuora === null) return <span className="bjr-delta">-</span>;
  const gap = baljuora - doogo;
  return <span className={`bjr-delta${gap === 0 ? " is-same" : ""}`}>{gap === 0 ? "같음" : `${gap > 0 ? "발주오라 +" : "DB센터 +"}${n(Math.abs(gap))}`}</span>;
}

function stateText(detail: AlignView["pending"]["stateDetail"]) {
  return [
    detail.soldOut ? `품절로 ${n(detail.soldOut)}` : "",
    detail.seasonToSoldOut ? `시즌종료 → 품절 ${n(detail.seasonToSoldOut)}` : "",
    detail.restock ? `판매중으로 ${n(detail.restock)}` : "",
    detail.show ? `공개로 ${n(detail.show)}` : "",
    detail.hide ? `숨김으로 ${n(detail.hide)}` : ""
  ].filter(Boolean).join(" · ");
}

function totalsText(totals: AlignTotals) {
  return [
    totals.imported ? `가져온 상품 ${n(totals.imported)}개(지운 상품 되살림 ${n(totals.restored)} · 새로 ${n(totals.created)})` : "",
    totals.states ? `판매 상태·노출 맞춤 ${n(totals.states)}개` : "",
    totals.linked ? `이름 같은 상품 연결 ${n(totals.linked)}개` : "",
    totals.failed ? `실패 ${n(totals.failed)}개` : ""
  ].filter(Boolean).join(" · ") || "바꿀 것이 없었어요";
}

// 맨 위 '발주오라와 똑같이 맞추기' 칸
function AlignBox({ align, disabled, working, onRun }: { align: AlignView; disabled: boolean; working: boolean; onRun: () => void }) {
  const { pending, last, run } = align;
  const resume = Boolean(run && !run.active);
  const sameNow = align.matched && pending.total === 0;
  return (
    <div className={`bjr-align${sameNow ? " is-done" : ""}`}>
      <div className="bjr-align-text">
        <b>{sameNow ? <><CheckCircle2 size={16} aria-hidden="true" /> 발주오라와 상품 수가 같아요</> : "발주오라와 똑같이 맞추기"}</b>
        {pending.total > 0 ? (
          <p>
            마지막으로 읽은 발주오라 값 기준으로
            {pending.imports > 0 && <> 발주오라에만 있는 상품 <strong>{n(pending.imports)}개</strong>를 가져오고{pending.importRestore > 0 ? `(DB센터에서 지운 상품 ${n(pending.importRestore)}개는 되살림)` : ""},</>}
            {pending.states > 0 && <> 판매 상태·노출이 다른 연결 상품 <strong>{n(pending.states)}개</strong>를 발주오라 값으로 바꾸고({stateText(pending.stateDetail)}),</>}
            {pending.sameName > 0 && <> 이름 같은 상품 <strong>{n(pending.sameName)}개</strong>를 연결하고,</>}
            {" "}DB센터의 전체·판매중·품절·미노출 수를 발주오라와 똑같이 맞춰요. 발주오라에서 노출 중인 상품은 공개 단가표에도 보여요. 발주오라는 바뀌지 않아요.
          </p>
        ) : (
          <p>{sameNow ? `DB센터 ${n(align.doogo.total)}개 = 발주오라 ${n(align.baljuora.total)}개 · 판매중 ${n(align.doogo.selling)} · 품절 ${n(align.doogo.soldOut)} · 미노출 ${n(align.doogo.hidden)}(마지막으로 읽은 발주오라 값 기준).` : "가져오거나 바꿀 상품은 없어요. 남은 차이는 아래 원인을 봐 주세요."}</p>
        )}
        {last && (
          <p className="bjr-align-last">
            마지막으로 맞춘 때 {formatTime(last.finishedAt)} · {last.trigger === "deploy" ? "운영 배포 때 자동" : `${last.by}님`} · {totalsText(last.totals)}
          </p>
        )}
        {last && last.failures.length > 0 && (
          <details className="bjr-align-fail">
            <summary>맞추지 못한 상품 {n(last.totals.failed)}개 보기</summary>
            <ul>{last.failures.slice(0, 8).map((item) => <li key={`${item.step}-${item.id}`}>{item.name} — {item.error}</li>)}</ul>
          </details>
        )}
        {run && working && <p className="bjr-align-progress" aria-live="polite"><Loader2 className="bj-spin" size={14} aria-hidden="true" /> 맞추는 중… {totalsText(run.totals)} · 남은 일 {n(pending.total)}개</p>}
      </div>
      {pending.total > 0 && (
        <button type="button" className="primary-action" onClick={onRun} disabled={disabled || working || Boolean(run?.active)}>
          {working ? <Loader2 className="bj-spin" size={15} aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
          {working ? "맞추는 중…" : resume ? "이어서 맞추기" : "발주오라와 똑같이 맞추기"}
        </button>
      )}
    </div>
  );
}

export function BaljuoraReconcileCard({ stamp, disabled, onChanged }: { stamp: unknown; disabled: boolean; onChanged: () => Promise<void> | void }) {
  const [data, setData] = useState<ReconcileView | null>(null);
  const [align, setAlign] = useState<AlignView | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let stopped = false;
    void (async () => {
      try {
        const [next, nextAlign] = await Promise.all([
          readData<unknown>(await apiFetch("/baljuora/admin/reconcile", { silent: true })),
          apiFetch("/baljuora/admin/align", { silent: true }).then((response) => readData<unknown>(response)).catch(() => null)
        ]);
        if (stopped) return;
        if (!isReconcileView(next)) {
          setUnavailable(true);
          return;
        }
        setUnavailable(false);
        setData(next);
        setAlign(isAlignView(nextAlign) ? nextAlign : null);
        setError(null);
      } catch (failure) {
        if (!stopped) setError(failure instanceof Error ? failure.message : "상품 수를 불러오지 못했어요.");
      }
    })();
    return () => { stopped = true; };
  }, [stamp]);

  const runAlign = async () => {
    if (!align) return;
    const { pending } = align;
    const ok = window.confirm([
      "발주오라와 똑같이 맞출까요? (마지막으로 읽은 발주오라 값 기준)",
      pending.imports > 0 ? `· 발주오라에만 있는 상품 ${n(pending.imports)}개를 DB센터로 가져와요${pending.importRestore > 0 ? `(지운 상품 ${n(pending.importRestore)}개는 되살림)` : ""}. 발주오라 노출·품절 그대로 — 발주오라에서 노출 중인 상품은 공개 단가표에도 보여요. 진열순서는 맨 뒤.` : "",
      pending.states > 0 ? `· 판매 상태·노출이 다른 연결 상품 ${n(pending.states)}개를 발주오라 값으로 바꿔요(${stateText(pending.stateDetail)}).` : "",
      pending.sameName > 0 ? `· 이름이 같은 상품 ${n(pending.sameName)}개는 같은 상품으로 연결해요.` : "",
      "· 오래전부터 발주오라에 있던 상품이라 공개 '가격변동'·'품절이슈'·'신규상품'에는 올리지 않아요. 발주오라는 바뀌지 않아요.",
      "상품이 많으면 몇 분 걸려요. 끝날 때까지 이 화면을 닫지 말아 주세요."
    ].filter(Boolean).join("\n"));
    if (!ok) return;
    setWorking(true);
    try {
      for (let round = 0; round < 80; round += 1) {
        const result = await readData<AlignStepResult>(await apiFetch("/baljuora/admin/align/run", { method: "POST" }));
        if (isAlignView(result.view)) setAlign(result.view);
        if (result.done) {
          const last = result.view.last;
          toast.success(last?.matched
            ? `발주오라와 똑같이 맞췄어요. DB센터 ${n(last.after.doogo.total)}개 = 발주오라 ${n(last.after.baljuora.total)}개.`
            : `맞췄어요. ${last ? totalsText(last.totals) : ""}`);
          break;
        }
        if (result.busy) {
          toast.info("다른 창(또는 배포)에서 맞추는 중이에요. 잠시 뒤 화면을 새로 열어 확인해 주세요.");
          break;
        }
      }
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "맞추지 못했어요.");
    } finally {
      setWorking(false);
      await onChanged();
    }
  };

  if (unavailable) return null;
  if (error) return <section className="admin-card bjr-card is-error"><p><AlertTriangle size={15} aria-hidden="true" /> {error}</p></section>;
  if (!data) return <section className="admin-card bjr-card"><p className="bjr-loading"><Loader2 className="bj-spin" size={15} aria-hidden="true" /> DB센터 ↔ 발주오라 상품 수를 세는 중…</p></section>;
  const bj = data.baljuora;
  const only = data.baljuoraOnly;
  const soldOutGap = data.soldOut.doogoSellingBaljuoraSoldOut + data.soldOut.doogoSoldOutBaljuoraSelling;
  const visibleGap = data.visible.doogoHiddenBaljuoraVisible + data.visible.doogoVisibleBaljuoraHidden;
  const rows: Array<{ label: string; doogo: number; baljuora: number | null; note?: string }> = [
    { label: "전체 상품", doogo: data.doogo.total, baljuora: bj?.total ?? null },
    { label: "판매중", doogo: data.doogo.selling, baljuora: bj?.selling ?? null },
    { label: "품절", doogo: data.doogo.soldOut + data.doogo.seasonEnded, baljuora: bj?.soldOut ?? null, note: data.doogo.seasonEnded > 0 ? `DB센터 품절 ${n(data.doogo.soldOut)} + 시즌종료 ${n(data.doogo.seasonEnded)}` : undefined },
    { label: "노출(공개)", doogo: data.doogo.visible, baljuora: bj?.visible ?? null },
    { label: "미노출(숨김)", doogo: data.doogo.hidden, baljuora: bj?.hidden ?? null },
    { label: "미노출이면서 품절", doogo: data.doogo.hiddenSoldOut, baljuora: bj?.hiddenSoldOut ?? null }
  ];
  return (
    <section className="admin-card bjr-card" aria-labelledby="bjr-title">
      <div className="bjr-head">
        <div>
          <h2 id="bjr-title"><Scale size={18} aria-hidden="true" /> DB센터 ↔ 발주오라 상품 수 맞춰 보기</h2>
          <p>{data.compared ? `발주오라 수는 마지막으로 읽은 값(비교 ${formatTime(data.lastCompareAt)} + 그 뒤 보낸 결과)이에요. 최신 수는 '발주오라 상품 불러오기(비교)'를 한 번 하면 바뀌어요.` : "아직 발주오라 상품을 읽지 않았어요. '발주오라 상품 불러오기(비교)'를 먼저 해 주세요."}</p>
        </div>
      </div>
      {align && data.compared && <AlignBox align={align} disabled={disabled} working={working} onRun={() => void runAlign()} />}
      {bj?.source === "estimated" && <p className="bjr-note">발주오라 수는 연결 기록으로 계산한 값이에요(이번 업데이트 전 비교). 비교를 한 번 다시 하면 발주오라 상품 리스트와 같은 정확한 수로 바뀌어요.</p>}
      <div className="bjr-table" role="table" aria-label="DB센터와 발주오라 상품 수">
        <div className="bjr-row is-head" role="row"><span role="columnheader">구분</span><span role="columnheader">DB센터</span><span role="columnheader">발주오라</span><span role="columnheader">차이</span></div>
        {rows.map((row) => (
          <div key={row.label} className="bjr-row" role="row">
            <span role="cell">{row.label}{row.note && <small>{row.note}</small>}</span>
            <b role="cell">{n(row.doogo)}</b>
            <b role="cell">{row.baljuora === null ? "-" : n(row.baljuora)}</b>
            <span role="cell"><Delta doogo={row.doogo} baljuora={row.baljuora} /></span>
          </div>
        ))}
      </div>
      <p className="bjr-sub">DB센터 수는 지운 상품을 뺀 수예요(지운 상품 {n(data.doogo.deleted)}개). 연결된 상품 {n(data.linked)}개.{align && align.bundles > 0 ? ` 발주오라 묶음 상품 ${n(align.bundles)}개는 DB센터에 없는 종류라 세지 않아요.` : ""}</p>

      <ol className="bjr-reasons">
        <li>
          <div>
            <b>발주오라에만 있는 상품 {n(only.total)}개</b>
            <p>DB센터에서 지운 상품 {n(only.deleted + only.deletedLinked)}개(발주오라에는 남아 있음) · DB센터에 처음부터 없던 상품 {n(only.never)}개 — 그중 발주오라 미노출·품절 {n(only.hiddenSoldOut)}개 · 판매중 {n(only.selling)}개.</p>
          </div>
        </li>
        <li>
          <div>
            <b>DB센터에만 있는 상품 {n(data.doogoOnly.total)}개</b>
            <p>발주오라에 아직 없는 상품이에요(공개 {n(data.doogoOnly.visible)} · 숨김 {n(data.doogoOnly.hidden)}). 공개 상품은 운영 홈 '상품 동기화'(신규 등록)로 발주오라에 올라가요.{align && align.pending.sameNameReview > 0 ? ` 이름이 같은 발주오라 상품이 있는 ${n(align.pending.sameNameReview)}개는 '신규 등록' 탭에서 직접 연결해 주세요.` : ""}</p>
          </div>
        </li>
        <li>
          <div>
            <b>판매 상태가 다른 연결 상품 {n(soldOutGap)}개</b>
            <p>DB센터 판매중 · 발주오라 품절 {n(data.soldOut.doogoSellingBaljuoraSoldOut)}개 · DB센터 품절(시즌종료 포함) · 발주오라 판매중 {n(data.soldOut.doogoSoldOutBaljuoraSelling)}개.</p>
          </div>
        </li>
        <li>
          <div>
            <b>노출 상태가 다른 연결 상품 {n(visibleGap)}개</b>
            <p>DB센터 숨김 · 발주오라 노출 {n(data.visible.doogoHiddenBaljuoraVisible)}개 · DB센터 공개 · 발주오라 미노출 {n(data.visible.doogoVisibleBaljuoraHidden)}개.</p>
          </div>
        </li>
      </ol>
      <p className="bjr-foot">위 '발주오라와 똑같이 맞추기'가 ①·③·④를 한 번에 맞춰요. ②의 DB센터에만 있는 상품은 운영 홈 '상품 동기화'(신규 등록)로 발주오라에 올라가면 같아져요. DB센터에서 상품을 지우면 운영 홈 '상품 동기화'가 발주오라에서도 미노출·품절로 바꿔요.</p>
    </section>
  );
}
