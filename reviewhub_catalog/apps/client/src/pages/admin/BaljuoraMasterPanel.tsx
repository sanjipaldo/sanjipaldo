// 관리자 > 발주오라 동기화 > "발주오라 → DB센터 맞추기"(2026-11-23 관리자 요청: 발주오라 관리자에서 먼저 바꾼 가격·썸네일 등을
// 발주오라 값을 기준으로 DB센터에 가져오는 반대 방향 버튼, 상품·가격·썸네일·카테고리·배송비 정책까지 양쪽을 같게).
// ① 발주오라 값 새로 읽기(비교, 책갈피) → ② 칸별로 지금 다른 상품 수를 보고 고르기 → ③ 발주오라 기준으로 맞추기.
// 맞추기는 고른 칸 중 지금 다른 칸만 바꿉니다(서버 pullFromBaljuora, 같은 칸·'이대로 두기'로 뺀 칸은 그대로). 25개씩 나눠 보냅니다.
import { useMemo, useState } from "react";
import { ArrowDownToLine, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { BALJUORA_FIELD_SHORT_LABELS, type BaljuoraFieldDiff, type BaljuoraSyncField } from "@repo/shared/baljuora-sync";

type MasterItem = { productId: string; kind: "new" | "update"; diffs: BaljuoraFieldDiff[] };
type PullSkip = { id: string; name: string; field: BaljuoraSyncField; reason: string };
type PullResult = { updated: number; created: number; unchanged?: number; failed: Array<{ id: string; name: string; error: string }>; skipped?: PullSkip[] };
type Summary = { updated: number; created: number; unchanged: number; failed: PullResult["failed"]; skipped: PullSkip[] };

// 화면 순서: 상품명 → 가격 4종 → 썸네일 → 카테고리 → 배송비 정책
export const MASTER_FIELDS: BaljuoraSyncField[] = ["name", "supplyPrice", "groupPrice", "consumerPrice", "purchaseCost", "image", "category", "shippingPolicy"];
// 이 카드에서는 관리자가 쓰는 말로: 대표 이미지 → 썸네일
const FIELD_LABELS: Record<BaljuoraSyncField, string> = { ...BALJUORA_FIELD_SHORT_LABELS, image: "썸네일" };
const CHUNK = 25;
// 마지막으로 읽은 지 이만큼 지나면 먼저 다시 읽으라고 알려 줍니다.
const STALE_MINUTES = 30;

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function postPull(body: unknown): Promise<PullResult> {
  const response = await apiFetch("/baljuora/admin/pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json().catch(() => null) as { ok?: boolean; data?: PullResult; error?: { message?: string } } | null;
  if (!response.ok || !json?.ok || !json.data) throw new Error(json?.error?.message || "발주오라 값을 가져오지 못했습니다.");
  return json.data;
}

// 서버 시각: ISO(…T…Z) 또는 SQLite 형식(YYYY-MM-DD HH:MM:SS, UTC)
function parseTime(value: string) {
  return new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
}

function formatTime(value: string | null) {
  if (!value) return "아직 읽지 않음";
  const date = parseTime(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(date);
}

export function BaljuoraMasterPanel({ items, baljuoraOnlyIds, doogoOnlyCount, compared, lastCompareAt, disabled, onCompare, onDone }: {
  items: MasterItem[];
  baljuoraOnlyIds: string[];
  doogoOnlyCount: number;
  compared: boolean;
  lastCompareAt: string | null;
  disabled: boolean;
  onCompare: () => void;
  onDone: () => Promise<void>;
}) {
  const [fields, setFields] = useState<Set<BaljuoraSyncField>>(() => new Set(MASTER_FIELDS));
  const [includeOnly, setIncludeOnly] = useState(true);
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  const counts = useMemo(() => {
    const result = Object.fromEntries(MASTER_FIELDS.map((field) => [field, 0])) as Record<BaljuoraSyncField, number>;
    for (const item of items) {
      if (item.kind !== "update") continue;
      for (const field of new Set(item.diffs.map((diff) => diff.field))) result[field] = (result[field] ?? 0) + 1;
    }
    return result;
  }, [items]);
  const targets = useMemo(() => items.filter((item) => item.kind === "update" && item.diffs.some((diff) => fields.has(diff.field))).map((item) => item.productId), [items, fields]);
  const onlyIds = includeOnly ? baljuoraOnlyIds : [];
  const staleMinutes = lastCompareAt && !Number.isNaN(parseTime(lastCompareAt).getTime()) ? Math.floor((Date.now() - parseTime(lastCompareAt).getTime()) / 60000) : null;
  const stale = staleMinutes !== null && staleMinutes >= STALE_MINUTES;

  const toggleField = (field: BaljuoraSyncField) => setFields((current) => {
    const next = new Set(current);
    if (next.has(field)) next.delete(field); else next.add(field);
    return next;
  });

  const run = async () => {
    const chosen = MASTER_FIELDS.filter((field) => fields.has(field));
    if (targets.length === 0 && onlyIds.length === 0) {
      toast.info("고른 칸에서 발주오라와 다른 상품이 없습니다.");
      return;
    }
    const lines = [
      "발주오라 값을 기준으로 DB센터를 맞출까요?",
      "",
      targets.length > 0 ? `· 상품 ${targets.length.toLocaleString("ko-KR")}개: ${chosen.map((field) => FIELD_LABELS[field]).join(", ")} 중 지금 다른 칸만 발주오라 값으로 바꿉니다.` : "",
      onlyIds.length > 0 ? `· 발주오라에만 있는 상품 ${onlyIds.length.toLocaleString("ko-KR")}개를 DB센터에 숨김으로 등록합니다.` : "",
      "· 가격이 바뀌면 가격변동 이력에 남습니다. 발주오라는 바뀌지 않습니다."
    ].filter(Boolean);
    if (!window.confirm(lines.join("\n"))) return;
    const total = targets.length + onlyIds.length;
    const next: Summary = { updated: 0, created: 0, unchanged: 0, failed: [], skipped: [] };
    let done = 0;
    setSummary(null);
    setRunning({ done: 0, total });
    try {
      for (const part of chunks(targets, CHUNK)) {
        const result = await postPull({ productIds: part, fields: chosen });
        next.updated += result.updated;
        next.unchanged += result.unchanged ?? 0;
        next.failed.push(...result.failed);
        next.skipped.push(...(result.skipped ?? []));
        done += part.length;
        setRunning({ done, total });
      }
      for (const part of chunks(onlyIds, CHUNK)) {
        const result = await postPull({ baljuoraIds: part });
        next.created += result.created;
        next.failed.push(...result.failed);
        done += part.length;
        setRunning({ done, total });
      }
      setSummary(next);
      toast.success(`발주오라 기준으로 맞췄습니다: 상품 ${next.updated}개${next.created ? ` · 새로 등록 ${next.created}개` : ""}`);
    } catch (error) {
      setSummary(next);
      toast.error(error instanceof Error ? error.message : "발주오라 값을 가져오지 못했습니다.");
    } finally {
      setRunning(null);
      await onDone();
    }
  };

  const percent = running && running.total > 0 ? Math.min(100, Math.round((running.done / running.total) * 100)) : 0;
  const busy = disabled || Boolean(running);

  return (
    <section className="admin-card bj-master" aria-labelledby="bj-master-title">
      <div className="bj-master-head">
        <span className="bj-direction is-pull">발주오라 → DB센터</span>
        <h2 id="bj-master-title">발주오라 기준으로 DB센터 맞추기</h2>
        <p>발주오라 관리자에서 먼저 바꾼 가격·썸네일·카테고리·배송비 정책을 DB센터로 가져옵니다. 발주오라 값이 기준이 되고, 발주오라는 바뀌지 않습니다.</p>
      </div>
      <ol className="bj-master-steps">
        <li>
          <b aria-hidden="true">1</b>
          <div>
            <strong>발주오라 값 새로 읽기</strong>
            <small className={stale ? "is-warn" : ""}>마지막으로 읽은 때: {formatTime(lastCompareAt)}{stale ? ` · ${staleMinutes}분 지났어요. 먼저 다시 읽어 주세요.` : ""}</small>
          </div>
          <button type="button" className={compared && !stale ? "outline-button" : "primary-action"} onClick={onCompare} disabled={busy}><Link2 size={15} /> 발주오라 값 읽기</button>
        </li>
        <li>
          <b aria-hidden="true">2</b>
          <div>
            <strong>맞출 칸 고르기</strong>
            <small>숫자는 지금 발주오라와 다른 상품 수예요.</small>
            <div className="bj-master-fields" role="group" aria-label="맞출 칸">
              {MASTER_FIELDS.map((field) => (
                <label key={field} className={`bj-master-field${counts[field] ? "" : " is-zero"}`}>
                  <input type="checkbox" checked={fields.has(field)} onChange={() => toggleField(field)} disabled={busy} />
                  <span>{FIELD_LABELS[field]}</span>
                  <em>{compared ? counts[field].toLocaleString("ko-KR") : "-"}</em>
                </label>
              ))}
              <label className={`bj-master-field is-wide${baljuoraOnlyIds.length ? "" : " is-zero"}`}>
                <input type="checkbox" checked={includeOnly} onChange={(event) => setIncludeOnly(event.target.checked)} disabled={busy} />
                <span>발주오라에만 있는 상품 DB센터에 등록(숨김)</span>
                <em>{compared ? baljuoraOnlyIds.length.toLocaleString("ko-KR") : "-"}</em>
              </label>
            </div>
          </div>
        </li>
        <li>
          <b aria-hidden="true">3</b>
          <div>
            <strong>발주오라 값으로 맞추기</strong>
            <small>{compared ? `상품 ${targets.length.toLocaleString("ko-KR")}개${onlyIds.length ? ` · 새로 등록 ${onlyIds.length.toLocaleString("ko-KR")}개` : ""}` : "먼저 1번으로 발주오라 값을 읽어 주세요."}</small>
          </div>
          <button type="button" className="primary-action" onClick={() => void run()} disabled={busy || !compared || (targets.length === 0 && onlyIds.length === 0)}>
            {running ? <Loader2 className="bj-spin" size={15} /> : <ArrowDownToLine size={15} />} 발주오라 기준으로 맞추기
          </button>
        </li>
      </ol>
      {running && (
        <div className="bj-master-running" role="status">
          <div className="bj-progress"><div style={{ width: `${percent}%` }} /></div>
          <span>{running.done.toLocaleString("ko-KR")} / {running.total.toLocaleString("ko-KR")}개 처리 중…</span>
        </div>
      )}
      {summary && (
        <div className="bj-master-result" role="status">
          <strong>맞춘 상품 {summary.updated.toLocaleString("ko-KR")}개{summary.created ? ` · 새로 등록 ${summary.created.toLocaleString("ko-KR")}개` : ""}{summary.unchanged ? ` · 이미 같음 ${summary.unchanged.toLocaleString("ko-KR")}개` : ""}{summary.failed.length ? ` · 실패 ${summary.failed.length}개` : ""}{summary.skipped.length ? ` · 건너뛴 칸 ${summary.skipped.length}개` : ""}</strong>
          {(summary.failed.length > 0 || summary.skipped.length > 0) && (
            <ul>
              {summary.failed.slice(0, 6).map((entry) => <li key={`f-${entry.id}`} className="is-failed">{entry.name}: {entry.error}</li>)}
              {summary.skipped.slice(0, 8).map((entry, index) => <li key={`s-${entry.id}-${entry.field}-${index}`}>{entry.name} · {FIELD_LABELS[entry.field]}: {entry.reason}</li>)}
            </ul>
          )}
        </div>
      )}
      <p className="bj-master-note">DB센터에만 있는 상품 {doogoOnlyCount.toLocaleString("ko-KR")}개는 지우지 않습니다. 발주오라에도 올리려면 아래 <b>신규 등록</b> 탭에서 동기화해 주세요. DB센터에서 고친 값을 발주오라로 보내는 쪽은 아래 <b>보낼 변경</b>입니다.</p>
    </section>
  );
}
