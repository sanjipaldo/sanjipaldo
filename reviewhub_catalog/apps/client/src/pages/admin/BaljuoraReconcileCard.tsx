// 발주오라 동기화 화면 'DB센터 ↔ 발주오라 상품 수 맞춰 보기'(2026-11-27 관리자 요청 "발주오라는 2,998개(판매중 1,779 · 품절 1,219 · 미노출+품절 1,160),
// DB센터는 2,143개 — 왜 일치하지 않는지 먼저 확인하고, 동기화로 DB <> 발주오라를 똑같이 맞출 수 있나?").
// 마지막 비교 기준으로 양쪽 전체·판매중·품절·노출 수를 나란히 놓고, 차이를 원인별로 나눕니다(GET /api/baljuora/admin/reconcile).
// 맞추기 버튼은 기존 가져오기(POST /api/baljuora/admin/pull)를 25개씩 부릅니다 — 발주오라는 바꾸지 않습니다.
//   ① 발주오라에만 있는 상품 → DB센터에 숨김으로(지운 상품은 되살림, 진열순서 맨 뒤 — 공개 단가표에는 안 보임)
//   ② 판매 상태가 다른 연결 상품 → 발주오라 판매 상태(판매중/품절)로
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowDownToLine, Loader2, Scale } from "lucide-react";
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
type PullResult = { updated?: number; created?: number; restored?: number; unchanged?: number; failed?: Array<{ name: string; error: string }> };

const CHUNK = 25;

// 서버가 예전 버전이거나 응답 모양이 다르면 칸을 그리지 않습니다.
function isReconcileView(value: unknown): value is ReconcileView {
  const view = value as Partial<ReconcileView> | null;
  return Boolean(view && view.doogo && view.baljuoraOnly && Array.isArray(view.baljuoraOnly.importIds) && view.soldOut && Array.isArray(view.soldOut.productIds) && view.visible && view.doogoOnly);
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

export function BaljuoraReconcileCard({ stamp, disabled, onChanged }: { stamp: unknown; disabled: boolean; onChanged: () => Promise<void> | void }) {
  const [data, setData] = useState<ReconcileView | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "import" | "soldOut">("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    let stopped = false;
    void (async () => {
      try {
        const next = await readData<unknown>(await apiFetch("/baljuora/admin/reconcile", { silent: true }));
        if (stopped) return;
        if (!isReconcileView(next)) {
          setUnavailable(true);
          return;
        }
        setUnavailable(false);
        setData(next);
        setError(null);
      } catch (failure) {
        if (!stopped) setError(failure instanceof Error ? failure.message : "상품 수를 불러오지 못했어요.");
      }
    })();
    return () => { stopped = true; };
  }, [stamp]);

  const runChunks = async (kind: "import" | "soldOut", ids: string[]) => {
    setBusy(kind);
    setProgress({ done: 0, total: ids.length });
    const totals = { updated: 0, created: 0, restored: 0, failed: [] as Array<{ name: string; error: string }> };
    try {
      for (let index = 0; index < ids.length; index += CHUNK) {
        const part = ids.slice(index, index + CHUNK);
        const body = kind === "import" ? { baljuoraIds: part, placeAtEnd: true } : { productIds: part, fields: ["soldOut"] };
        const result = await readData<PullResult>(await apiFetch("/baljuora/admin/pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
        totals.updated += result.updated ?? 0;
        totals.created += result.created ?? 0;
        totals.restored += result.restored ?? 0;
        totals.failed.push(...(result.failed ?? []));
        setProgress({ done: Math.min(ids.length, index + CHUNK), total: ids.length });
      }
      if (kind === "import") toast.success(`발주오라에만 있던 상품 ${n(totals.created)}개를 DB센터에 숨김으로 가져왔어요${totals.restored ? `(지운 상품 ${n(totals.restored)}개 되살림)` : ""}${totals.failed.length ? ` · 실패 ${n(totals.failed.length)}개` : ""}.`);
      else toast.success(`판매 상태를 발주오라 기준으로 ${n(totals.updated)}개 맞췄어요${totals.failed.length ? ` · 실패 ${n(totals.failed.length)}개` : ""}.`);
      if (totals.failed.length > 0) toast.error(`실패: ${totals.failed.slice(0, 3).map((item) => `${item.name} — ${item.error}`).join(" / ")}`);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "맞추지 못했어요.");
    } finally {
      setBusy("");
      setProgress(null);
      await onChanged();
    }
  };

  const importOnly = () => {
    if (!data) return;
    const ids = data.baljuoraOnly.importIds;
    if (ids.length === 0) return toast.info("가져올 상품이 없어요.");
    const deleted = data.baljuoraOnly.deleted + data.baljuoraOnly.deletedLinked;
    const ok = window.confirm([
      `발주오라에만 있는 상품 ${n(ids.length)}개를 DB센터로 가져올까요?`,
      "· DB센터에 숨김(공개 단가표에 안 보임)으로 등록하고, 진열순서는 맨 뒤에 둬요.",
      deleted > 0 ? `· 그중 DB센터에서 지운 상품(상품코드가 같음)은 새로 만들지 않고 되살려요.` : "",
      "· 상품명·가격·이미지·카테고리·판매 상태(품절)는 발주오라 값으로 채워요. 발주오라는 바뀌지 않아요.",
      data.baljuoraOnly.sameName > 0 ? `· DB센터에 이름이 같은 상품이 있는 ${n(data.baljuoraOnly.sameName)}개는 빼요(신규 등록 탭에서 '같은 상품으로 연결').` : "",
      "상품이 많으면 몇 분 걸릴 수 있어요. 끝날 때까지 이 화면을 닫지 말아 주세요."
    ].filter(Boolean).join("\n"));
    if (ok) void runChunks("import", ids);
  };

  const alignSoldOut = () => {
    if (!data) return;
    const ids = data.soldOut.productIds;
    if (ids.length === 0) return toast.info("판매 상태가 다른 상품이 없어요.");
    const ok = window.confirm([
      `판매 상태가 다른 연결 상품 ${n(ids.length)}개를 발주오라 기준으로 맞출까요?`,
      `· DB센터 판매중 → 품절 ${n(data.soldOut.doogoSellingBaljuoraSoldOut)}개 · DB센터 품절(시즌종료 포함) → 판매중 ${n(data.soldOut.doogoSoldOutBaljuoraSelling)}개`,
      "· 공개 단가표의 판매 상태도 바로 바뀌어요. 발주오라는 바뀌지 않아요.",
      "반대로 DB센터 값으로 발주오라를 바꾸려면 아래 맞추기 카드에서 'DB센터 → 발주오라'와 '품절'을 골라 주세요."
    ].join("\n"));
    if (ok) void runChunks("soldOut", ids);
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
  const working = busy !== "";
  return (
    <section className="admin-card bjr-card" aria-labelledby="bjr-title">
      <div className="bjr-head">
        <div>
          <h2 id="bjr-title"><Scale size={18} aria-hidden="true" /> DB센터 ↔ 발주오라 상품 수 맞춰 보기</h2>
          <p>{data.compared ? `마지막 비교 ${formatTime(data.lastCompareAt)} 기준이에요. 최신 수는 '발주오라 상품 불러오기(비교)'를 한 번 하면 바뀌어요.` : "아직 발주오라 상품을 읽지 않았어요. '발주오라 상품 불러오기(비교)'를 먼저 해 주세요."}</p>
        </div>
      </div>
      {bj?.source === "estimated" && <p className="bjr-note">발주오라 판매중·품절 수는 연결 기록으로 계산한 값이에요(이번 업데이트 전 비교). 비교를 한 번 다시 하면 발주오라 상품 리스트와 같은 정확한 수로 바뀌어요.</p>}
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
      <p className="bjr-sub">DB센터 수는 지운 상품을 뺀 수예요(지운 상품 {n(data.doogo.deleted)}개). 연결된 상품 {n(data.linked)}개.</p>

      <ol className="bjr-reasons">
        <li>
          <div>
            <b>발주오라에만 있는 상품 {n(only.total)}개</b>
            <p>DB센터에서 지운 상품 {n(only.deleted + only.deletedLinked)}개(발주오라에는 남아 있음) · DB센터에 처음부터 없던 상품 {n(only.never)}개 — 그중 발주오라 미노출·품절 {n(only.hiddenSoldOut)}개 · 판매중 {n(only.selling)}개.{only.sameName > 0 ? ` DB센터에 이름이 같은 상품이 있는 ${n(only.sameName)}개는 가져오지 않아요(신규 등록 탭에서 연결).` : ""}</p>
          </div>
          <button type="button" className="primary-action" onClick={importOnly} disabled={disabled || working || only.importIds.length === 0}>
            {busy === "import" ? <Loader2 className="bj-spin" size={15} aria-hidden="true" /> : <ArrowDownToLine size={15} aria-hidden="true" />}
            {busy === "import" && progress ? `가져오는 중 ${n(progress.done)} / ${n(progress.total)}` : `DB센터로 가져오기(숨김) ${n(only.importIds.length)}개`}
          </button>
        </li>
        <li>
          <div>
            <b>DB센터에만 있는 상품 {n(data.doogoOnly.total)}개</b>
            <p>발주오라에 아직 없는 상품이에요(공개 {n(data.doogoOnly.visible)} · 숨김 {n(data.doogoOnly.hidden)}). 공개 상품은 운영 홈 '상품 동기화'(신규 등록)로 발주오라에 올라가요.</p>
          </div>
        </li>
        <li>
          <div>
            <b>판매 상태가 다른 연결 상품 {n(soldOutGap)}개</b>
            <p>DB센터 판매중 · 발주오라 품절 {n(data.soldOut.doogoSellingBaljuoraSoldOut)}개 · DB센터 품절(시즌종료 포함) · 발주오라 판매중 {n(data.soldOut.doogoSoldOutBaljuoraSelling)}개.</p>
          </div>
          <button type="button" className="outline-button" onClick={alignSoldOut} disabled={disabled || working || soldOutGap === 0}>
            {busy === "soldOut" ? <Loader2 className="bj-spin" size={15} aria-hidden="true" /> : null}
            {busy === "soldOut" && progress ? `맞추는 중 ${n(progress.done)} / ${n(progress.total)}` : "발주오라 기준으로 품절 맞추기"}
          </button>
        </li>
        <li>
          <div>
            <b>노출 상태가 다른 연결 상품 {n(visibleGap)}개</b>
            <p>DB센터 숨김 · 발주오라 노출 {n(data.visible.doogoHiddenBaljuoraVisible)}개 · DB센터 공개 · 발주오라 미노출 {n(data.visible.doogoVisibleBaljuoraHidden)}개. 공개 단가표와 이어져 있어 아래 맞추기 카드에서 방향과 상품을 골라 맞춰요.</p>
          </div>
        </li>
      </ol>
      <p className="bjr-foot">①과 ③을 맞추면 DB센터의 전체·판매중·품절 수가 발주오라와 같아져요(②의 DB센터에만 있는 상품은 발주오라에 올라가면 같아짐). DB센터에서 다시 상품을 지우면 운영 홈 '상품 동기화'가 발주오라에서도 미노출·품절로 바꿔요.</p>
    </section>
  );
}
