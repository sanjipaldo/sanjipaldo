// 관리자 > 발주오라 동기화 > 맞추기 카드(2026-11-23 관리자 요청: 발주오라 관리자에서 먼저 바꾼 가격·썸네일 등을
// 발주오라 값을 기준으로 DB센터에 가져오는 반대 방향 버튼, 상품·가격·썸네일·카테고리·배송비 정책까지 양쪽을 같게).
// 2026-11-26: 판매 상태(품절·도매몰 노출)·상품 정보 칸(과세·원산지·관리코드·바코드·내용량 등)을 더하고, 반대로 "DB센터 기준으로 발주오라 맞추기"도 둡니다.
// ① 발주오라 값 새로 읽기(비교, 책갈피) → ② 방향과 칸을 고르고 칸별로 지금 다른 상품 수 보기 → ③ 맞추기.
// - 발주오라 기준: 고른 칸 중 지금 다른 칸만 DB센터를 바꿉니다(서버 pullFromBaljuora, 같은 칸·'이대로 두기'로 뺀 칸은 그대로). 25개씩 나눠 보냅니다.
// - DB센터 기준: 고른 칸 중 지금 다른 칸만 발주오라로 보내는 동기화 작업을 만듭니다(책갈피로 실행). 상품 정보 칸은 DB센터가 비어 있으면 보내지 않습니다.
// - 도매몰 노출은 공개 단가표 노출과 이어져 있어 처음에는 고르지 않은 상태로 둡니다(발주오라에만 있던 상품은 DB센터에서 숨김으로 등록되기 때문).
import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import {
  BALJUORA_FIELD_SHORT_LABELS,
  BALJUORA_PULL_ONLY_FIELDS,
  BALJUORA_PUSH_ONLY_FIELDS,
  canPullDiff,
  canPushDiff,
  type BaljuoraFieldDiff,
  type BaljuoraSyncField
} from "@repo/shared/baljuora-sync";

type MasterItem = { productId: string; kind: "new" | "update"; diffs: BaljuoraFieldDiff[] };
type PullSkip = { id: string; name: string; field: BaljuoraSyncField; reason: string };
type PullResult = { updated: number; created: number; unchanged?: number; failed: Array<{ id: string; name: string; error: string }>; skipped?: PullSkip[] };
type Summary = { updated: number; created: number; unchanged: number; failed: PullResult["failed"]; skipped: PullSkip[] };
export type MasterMode = "pull" | "push";

// 화면 순서: 상품명 → 가격 4종 → 썸네일 → 카테고리 → 배송비 정책 / 판매 상태 / 상품 정보
export const MASTER_FIELD_GROUPS: Array<{ label: string; fields: BaljuoraSyncField[] }> = [
  { label: "상품·가격", fields: ["name", "supplyPrice", "groupPrice", "consumerPrice", "purchaseCost", "image", "category", "shippingPolicy"] },
  { label: "판매 상태", fields: ["soldOut", "visible"] },
  { label: "상품 정보", fields: ["taxable", "origin", "managementCode", "barcode", "content", "purchaseName", "purchaseQuantity", "shippingUnit", "purchaseDeadline", "summary", "shippingLocation", "manufacturingDate", "expirationDate", "courier", "certification", "tradeType"] }
];
export const MASTER_FIELDS: BaljuoraSyncField[] = MASTER_FIELD_GROUPS.flatMap((group) => group.fields);
// 처음에 고르지 않는 칸(도매몰 노출 = 공개 단가표 노출)
const DEFAULT_OFF: BaljuoraSyncField[] = ["visible"];
// 이 카드에서는 관리자가 쓰는 말로: 대표 이미지 → 썸네일
const FIELD_LABELS: Record<BaljuoraSyncField, string> = { ...BALJUORA_FIELD_SHORT_LABELS, image: "썸네일", visible: "도매몰 노출" };
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

// 방향마다 고를 수 있는 칸: 인증은 가져오기만, 해외배송은 보내기만
function fieldAllowed(mode: MasterMode, field: BaljuoraSyncField) {
  return mode === "pull" ? !BALJUORA_PUSH_ONLY_FIELDS.includes(field) : !BALJUORA_PULL_ONLY_FIELDS.includes(field);
}

function movable(mode: MasterMode, diff: BaljuoraFieldDiff) {
  return mode === "pull" ? canPullDiff(diff, true) : canPushDiff(diff, true);
}

export function BaljuoraMasterPanel({ items, baljuoraOnlyIds, doogoOnlyCount, compared, lastCompareAt, disabled, onCompare, onDone, onPush }: {
  items: MasterItem[];
  baljuoraOnlyIds: string[];
  doogoOnlyCount: number;
  compared: boolean;
  lastCompareAt: string | null;
  disabled: boolean;
  onCompare: () => void;
  onDone: () => Promise<void>;
  // DB센터 기준으로 맞추기: 고른 칸으로 동기화 작업을 만듭니다(부모가 작업 코드·발주오라 창을 엶).
  onPush?: (fieldsByProduct: Record<string, BaljuoraSyncField[]>) => void;
}) {
  const [mode, setMode] = useState<MasterMode>("pull");
  const [fields, setFields] = useState<Set<BaljuoraSyncField>>(() => new Set(MASTER_FIELDS.filter((field) => !DEFAULT_OFF.includes(field))));
  const [includeOnly, setIncludeOnly] = useState(true);
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const pushMode = mode === "push";

  const counts = useMemo(() => {
    const result = Object.fromEntries(MASTER_FIELDS.map((field) => [field, 0])) as Record<BaljuoraSyncField, number>;
    for (const item of items) {
      if (item.kind !== "update") continue;
      for (const field of new Set(item.diffs.filter((diff) => movable(mode, diff)).map((diff) => diff.field))) result[field] = (result[field] ?? 0) + 1;
    }
    return result;
  }, [items, mode]);
  const chosen = useMemo(() => MASTER_FIELDS.filter((field) => fields.has(field) && fieldAllowed(mode, field)), [fields, mode]);
  const targets = useMemo(() => items.filter((item) => item.kind === "update" && item.diffs.some((diff) => chosen.includes(diff.field) && movable(mode, diff))).map((item) => item.productId), [items, chosen, mode]);
  const onlyIds = includeOnly && !pushMode ? baljuoraOnlyIds : [];
  const staleMinutes = lastCompareAt && !Number.isNaN(parseTime(lastCompareAt).getTime()) ? Math.floor((Date.now() - parseTime(lastCompareAt).getTime()) / 60000) : null;
  const stale = staleMinutes !== null && staleMinutes >= STALE_MINUTES;

  const toggleField = (field: BaljuoraSyncField) => setFields((current) => {
    const next = new Set(current);
    if (next.has(field)) next.delete(field); else next.add(field);
    return next;
  });

  const runPush = () => {
    if (!onPush) return;
    const fieldsByProduct: Record<string, BaljuoraSyncField[]> = {};
    for (const item of items) {
      if (item.kind !== "update") continue;
      const list = [...new Set(item.diffs.filter((diff) => chosen.includes(diff.field) && canPushDiff(diff, true)).map((diff) => diff.field))];
      if (list.length > 0) fieldsByProduct[item.productId] = list;
    }
    const productCount = Object.keys(fieldsByProduct).length;
    if (productCount === 0) {
      toast.info("고른 칸에서 발주오라와 다른 상품이 없습니다.");
      return;
    }
    const lines = [
      "DB센터 값을 기준으로 발주오라를 맞출까요?",
      "",
      `· 상품 ${productCount.toLocaleString("ko-KR")}개: ${chosen.map((field) => FIELD_LABELS[field]).join(", ")} 중 지금 다른 칸만 발주오라로 보냅니다.`,
      "· 상품 정보 칸은 DB센터에 값이 있을 때만 보냅니다(비어 있는 칸으로 발주오라 값을 지우지 않음).",
      "· 동기화 작업을 만들고 발주오라 관리자 창을 엽니다. 그 창에서 책갈피를 눌러 주세요."
    ];
    if (!window.confirm(lines.join("\n"))) return;
    onPush(fieldsByProduct);
  };

  const runPull = async () => {
    if (targets.length === 0 && onlyIds.length === 0) {
      toast.info("고른 칸에서 발주오라와 다른 상품이 없습니다.");
      return;
    }
    const lines = [
      "발주오라 값을 기준으로 DB센터를 맞출까요?",
      "",
      targets.length > 0 ? `· 상품 ${targets.length.toLocaleString("ko-KR")}개: ${chosen.map((field) => FIELD_LABELS[field]).join(", ")} 중 지금 다른 칸만 발주오라 값으로 바꿉니다.` : "",
      onlyIds.length > 0 ? `· 발주오라에만 있는 상품 ${onlyIds.length.toLocaleString("ko-KR")}개를 DB센터에 숨김으로 등록합니다.` : "",
      fields.has("visible") && targets.length > 0 ? "· 도매몰 노출을 골라서 공개 단가표 노출(공개/숨김)도 발주오라와 같게 바뀝니다." : "",
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
        <div className="bj-master-modes" role="tablist" aria-label="맞추는 방향">
          <button type="button" role="tab" aria-selected={!pushMode} className={!pushMode ? "active" : ""} onClick={() => setMode("pull")} disabled={busy}><ArrowDownToLine size={14} aria-hidden="true" /> 발주오라 → DB센터</button>
          <button type="button" role="tab" aria-selected={pushMode} className={pushMode ? "active" : ""} onClick={() => setMode("push")} disabled={busy || !onPush}><ArrowUpFromLine size={14} aria-hidden="true" /> DB센터 → 발주오라</button>
        </div>
        <h2 id="bj-master-title">{pushMode ? "DB센터 기준으로 발주오라 맞추기" : "발주오라 기준으로 DB센터 맞추기"}</h2>
        <p>{pushMode
          ? "DB센터에서 정리한 판매 상태·상품 정보·가격을 발주오라로 보냅니다. 고른 칸 중 지금 다른 칸만 보내고, DB센터에 비어 있는 상품 정보 칸은 보내지 않아요."
          : "발주오라 관리자에서 먼저 바꾼 가격·썸네일·카테고리·배송비 정책·품절·상품 정보를 DB센터로 가져옵니다. 발주오라 값이 기준이 되고, 발주오라는 바뀌지 않습니다."}</p>
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
            <small>숫자는 지금 발주오라와 다르고 {pushMode ? "보낼 수 있는" : "가져올 수 있는"} 상품 수예요. 도매몰 노출은 공개 단가표 노출과 이어져 있어 직접 골라 주세요.</small>
            {MASTER_FIELD_GROUPS.map((group) => (
              <div key={group.label} className="bj-master-group">
                <span className="bj-master-group-label">{group.label}</span>
                <div className="bj-master-fields" role="group" aria-label={`맞출 칸: ${group.label}`}>
                  {group.fields.filter((field) => fieldAllowed(mode, field)).map((field) => (
                    <label key={field} className={`bj-master-field${counts[field] ? "" : " is-zero"}`}>
                      <input type="checkbox" checked={fields.has(field)} onChange={() => toggleField(field)} disabled={busy} />
                      <span>{FIELD_LABELS[field]}</span>
                      <em>{compared ? counts[field].toLocaleString("ko-KR") : "-"}</em>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {!pushMode && (
              <div className="bj-master-fields" role="group" aria-label="발주오라에만 있는 상품">
                <label className={`bj-master-field is-wide${baljuoraOnlyIds.length ? "" : " is-zero"}`}>
                  <input type="checkbox" checked={includeOnly} onChange={(event) => setIncludeOnly(event.target.checked)} disabled={busy} />
                  <span>발주오라에만 있는 상품 DB센터에 등록(숨김)</span>
                  <em>{compared ? baljuoraOnlyIds.length.toLocaleString("ko-KR") : "-"}</em>
                </label>
              </div>
            )}
          </div>
        </li>
        <li>
          <b aria-hidden="true">3</b>
          <div>
            <strong>{pushMode ? "DB센터 값으로 맞추기" : "발주오라 값으로 맞추기"}</strong>
            <small>{compared ? `상품 ${targets.length.toLocaleString("ko-KR")}개${onlyIds.length ? ` · 새로 등록 ${onlyIds.length.toLocaleString("ko-KR")}개` : ""}` : "먼저 1번으로 발주오라 값을 읽어 주세요."}</small>
          </div>
          {pushMode
            ? <button type="button" className="primary-action" onClick={runPush} disabled={busy || !compared || targets.length === 0}><ArrowUpFromLine size={15} /> DB센터 기준으로 맞추기</button>
            : <button type="button" className="primary-action" onClick={() => void runPull()} disabled={busy || !compared || (targets.length === 0 && onlyIds.length === 0)}>{running ? <Loader2 className="bj-spin" size={15} /> : <ArrowDownToLine size={15} />} 발주오라 기준으로 맞추기</button>}
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
      <p className="bj-master-note">DB센터에만 있는 상품 {doogoOnlyCount.toLocaleString("ko-KR")}개는 지우지 않습니다. 발주오라에도 올리려면 아래 <b>신규 등록</b> 탭에서 동기화해 주세요. 인증은 발주오라에서 인증번호와 함께 관리해 가져오기만 하고, 해외배송은 DB센터 배송유형으로 보내기만 합니다.</p>
    </section>
  );
}
