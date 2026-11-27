// 발주오라 동기화 화면 숫자 카드 팝업(2026-11-27 관리자 요청 "연결된 상품 2142·보낼 변경 19·신규 등록 3·발주오라에만 있음 8을 누르면 팝업으로
// 어떤 상품인지·이게 무엇인지, 20개씩 1/2/3 페이지 · 보낼 변경은 오류일 수도 있으니 DB <> 발주오라 무엇이 바뀌었는지 상세 내역도").
// - 보낼 변경: 상품마다 칸별 DB센터 값(보낼 값) · 발주오라 값(마지막으로 읽은 값) · 마지막으로 맞춘 값(기준)과 그때 이후 어느 쪽이 바뀌었는지,
//   판단(DB센터에서 바뀜 · 양쪽에서 바뀜 · 처음부터 다름 · 발주오라에서 바뀜)과 보내는지/안 보내는지를 보여 줍니다(발주오라를 다시 읽지 않음).
// - 연결된 상품: 서버가 20개씩(GET /api/baljuora/admin/linked) — 검색·다른 칸 있음/같음.
// - 신규 등록·발주오라에만 있음: 화면이 이미 받은 목록을 20개씩.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, Loader2, Search } from "lucide-react";
import { BALJUORA_FIELD_LABELS, BALJUORA_FIELD_SHORT_LABELS, canPushDiff, type BaljuoraFieldDiff, type BaljuoraProductSnapshot, type BaljuoraSyncField } from "@repo/shared/baljuora-sync";
import { apiFetch } from "@/lib/api";
import { AdminSheetModal, SheetPager } from "./admin-sheet-modal";

export type StatKind = "linked" | "push" | "new" | "only";
type DiffBase = { doogo?: string | number | null; baljuora?: string | number | null };
export type StatDiff = BaljuoraFieldDiff & { base?: DiffBase };
export type StatChangeItem = {
  productId: string;
  kind: "new" | "update";
  code: string | null;
  name: string;
  imageUrl: string | null;
  categoryId: string;
  isVisible: boolean;
  supplierName: string | null;
  newSupplier?: boolean;
  sameName?: { code: string | null; name: string; blocked: string | null; holder: { name: string; code: string | null; isVisible: boolean; deleted: boolean } | null };
  diffs: StatDiff[];
  syncStatus: string | null;
  lastPushedAt: string | null;
  baseAt?: string | null;
  lastPulledAt?: string | null;
  preview?: { supplyPrice: number; groupPrice: number; consumerPrice: number | null; purchaseCost: number | null };
};
export type StatOnlyItem = BaljuoraProductSnapshot & { deletedMatch?: { id: string; name: string; code: string }; sameNameProduct?: { id: string; name: string; code: string | null } };
type LinkedRow = {
  productId: string;
  name: string;
  code: string | null;
  imageUrl: string | null;
  categoryName: string | null;
  supplierName: string | null;
  isVisible: boolean;
  isSoldOut: boolean;
  generalPrice: number;
  studentPrice: number;
  baljuora: { id: string; code: string | null; name: string; imageUrl: string | null; supplyPrice: number | null; groupPrice: number | null; groupPriceKnown: boolean; isVisible: boolean | null; isSoldOut: boolean | null };
  diffCount: number;
  diffFields: BaljuoraSyncField[];
  syncStatus: string | null;
  lastPulledAt: string | null;
  lastPushedAt: string | null;
};
type LinkedPage = { total: number; page: number; size: number; pages: number; filter: "all" | "diff" | "same"; counts: { all: number; diff: number; same: number }; items: LinkedRow[] };

const PAGE = 20;

type Helpers = {
  // 칸 값 보기(동기화 화면의 변경 칩과 같은 모양: 가격·이미지·카테고리 경로·배송 정책 이름·상품 정보 칸)
  renderValue: (field: BaljuoraSyncField, value: string | number | null, auto?: boolean) => ReactNode;
  doogoCategoryName: (id: string) => string;
  categoryPath: (id: string) => string;
  // 이 DB센터 배송 정책과 연결한 발주오라 정책이 있는지(없으면 배송비 정책 칸은 보내지 않음)
  policyLinked: (doogoPolicyId: string) => boolean;
};

async function readData<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({ ok: false }))) as { ok: boolean; data: T; error?: { message?: string } };
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "불러오지 못했어요.");
  return payload.data;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function won(value: number | null | undefined) {
  return value === null || value === undefined ? "없음" : `${Number(value).toLocaleString("ko-KR")}원`;
}

const squash = (text: string | null | undefined) => String(text ?? "").toLowerCase().replace(/\s+/g, "");

function usePaged<T>(items: T[], query: string, text: (item: T) => string) {
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const keyword = squash(query);
    return keyword ? items.filter((item) => squash(text(item)).includes(keyword)) : items;
  }, [items, query, text]);
  useEffect(() => { setPage(1); }, [query]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages);
  return { filtered, page: current, pages, rows: filtered.slice((current - 1) * PAGE, current * PAGE), setPage };
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="bjs-search">
      <Search size={16} aria-hidden="true" />
      <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </label>
  );
}

function Thumb({ src }: { src: string | null | undefined }) {
  return src ? <img className="bjs-thumb" src={src} alt="" loading="lazy" /> : <span className="bjs-thumb is-empty" aria-hidden="true" />;
}

function scrollTop() {
  document.querySelector(".bjs-modal .asm-body")?.scrollTo({ top: 0 });
}

// ─── 보낼 변경: 칸별 상세 ─────────────────────────────────────────────────────

const DIRECTION_TEXT: Record<StatDiff["direction"], string> = {
  push: "DB센터에서 바뀜",
  pull: "발주오라에서 바뀜",
  both: "양쪽에서 바뀜",
  initial: "처음부터 다름"
};

const DIRECTION_HELP: Record<StatDiff["direction"], string> = {
  push: "마지막으로 맞춘 뒤 DB센터 값만 바뀌었어요(발주오라는 그때 값 그대로).",
  pull: "마지막으로 맞춘 뒤 발주오라 값만 바뀌었어요.",
  both: "마지막으로 맞춘 뒤 DB센터와 발주오라 값이 모두 바뀌었어요.",
  initial: "처음 연결할 때부터 값이 달랐어요(맞춘 적 없는 칸)."
};

function sendState(diff: StatDiff, helpers: Helpers) {
  if (diff.field === "shippingPolicy" && diff.doogo && !helpers.policyLinked(String(diff.doogo))) return { send: false, text: "보내지 않음 · 배송비 정책 연결 필요" };
  if (canPushDiff(diff, false)) return { send: true, text: diff.direction === "both" ? "DB센터 값으로 보냄" : "보냄" };
  if (diff.direction === "pull") return { send: false, text: "보내지 않음 · '발주오라에서 바뀜' 탭에서 가져오기" };
  return { send: false, text: "보내지 않음 · 맞추기 카드에서 방향 고르기" };
}

function changedSince(base: string | number | null | undefined, now: string | number | null | undefined) {
  if (base === undefined) return null;
  return String(base ?? "") !== String(now ?? "");
}

function DiffDetail({ item, diff, helpers }: { item: StatChangeItem; diff: StatDiff; helpers: Helpers }) {
  const state = sendState(diff, helpers);
  const base = diff.base;
  // 카테고리 기준의 DB센터 값은 DB센터 카테고리 id(지금 값은 연결된 발주오라 카테고리)
  const doogoNow = diff.field === "category" ? item.categoryId : diff.doogo;
  const doogoChanged = changedSince(base?.doogo, doogoNow);
  const baljuoraChanged = changedSince(base?.baljuora, diff.baljuora);
  const baseDoogo = base?.doogo === undefined ? null : diff.field === "category" ? (base.doogo ? helpers.doogoCategoryName(String(base.doogo)) || String(base.doogo) : "없음") : helpers.renderValue(diff.field, base.doogo);
  return (
    <div className={`bjs-diff${state.send ? " is-send" : " is-hold"}`} role="row">
      <div className="bjs-diff-field" role="cell"><b>{BALJUORA_FIELD_LABELS[diff.field]}</b><span className={`bjs-dir is-${diff.direction}`} title={DIRECTION_HELP[diff.direction]}>{DIRECTION_TEXT[diff.direction]}</span></div>
      <div className="bjs-diff-value is-doogo" role="cell">
        <small>DB센터 {state.send ? "(보낼 값)" : ""}</small>
        <span>{diff.field === "category" ? <>{helpers.doogoCategoryName(item.categoryId) || "없음"}<em className="bjs-sub">→ 발주오라 {diff.doogo ? helpers.categoryPath(String(diff.doogo)) : "연결 없음"}</em></> : helpers.renderValue(diff.field, diff.doogo, diff.doogoEmpty)}</span>
      </div>
      <div className="bjs-diff-value is-baljuora" role="cell">
        <small>발주오라(마지막으로 읽은 값)</small>
        <span>{helpers.renderValue(diff.field, diff.baljuora)}</span>
      </div>
      <div className="bjs-diff-value is-base" role="cell">
        <small>마지막으로 맞춘 값{item.baseAt ? ` · ${formatTime(item.baseAt)}` : ""}</small>
        {base ? (
          <span className="bjs-base">
            <span>DB센터 {baseDoogo ?? "기록 없음"}{doogoChanged !== null && <em className={doogoChanged ? "is-changed" : "is-same"}>{doogoChanged ? "그 뒤 바뀜" : "그대로"}</em>}</span>
            <span>발주오라 {base.baljuora === undefined ? "기록 없음" : helpers.renderValue(diff.field, base.baljuora)}{baljuoraChanged !== null && <em className={baljuoraChanged ? "is-changed" : "is-same"}>{baljuoraChanged ? "그 뒤 바뀜" : "그대로"}</em>}</span>
          </span>
        ) : <span className="bjs-muted">{diff.field === "image" ? "썸네일은 마지막으로 보낸 이미지와 비교해요" : "맞춘 기록 없음(처음 연결)"}</span>}
      </div>
      <div className={`bjs-diff-send${state.send ? " is-send" : ""}`} role="cell">{state.send ? <ArrowRight size={14} aria-hidden="true" /> : null}{state.text}</div>
    </div>
  );
}

function PushList({ items, helpers }: { items: StatChangeItem[]; helpers: Helpers }) {
  const [query, setQuery] = useState("");
  const paged = usePaged(items, query, (item) => `${item.name} ${item.code ?? ""} ${item.supplierName ?? ""}`);
  const fieldCounts = useMemo(() => {
    const counts = new Map<BaljuoraSyncField, number>();
    for (const item of items) for (const diff of item.diffs) if (sendState(diff, helpers).send) counts.set(diff.field, (counts.get(diff.field) ?? 0) + 1);
    return [...counts.entries()].sort((first, second) => second[1] - first[1]);
  }, [items, helpers]);
  return (
    <>
      {fieldCounts.length > 0 && <p className="bjs-summary">보낼 칸: {fieldCounts.map(([field, value]) => `${BALJUORA_FIELD_SHORT_LABELS[field]} ${value.toLocaleString("ko-KR")}`).join(" · ")}</p>}
      <SearchBox value={query} onChange={setQuery} placeholder="상품명·상품코드·매입처로 찾기" />
      {paged.rows.length === 0 ? <p className="bjs-empty">{items.length === 0 ? "보낼 변경이 없어요. DB센터와 발주오라 값이 같아요." : "찾는 상품이 없어요."}</p> : (
        <ol className="bjs-products">
          {paged.rows.map((item) => {
            const sending = item.diffs.filter((diff) => sendState(diff, helpers).send).length;
            return (
              <li key={item.productId} className="bjs-product">
                <div className="bjs-product-head">
                  <Thumb src={item.imageUrl} />
                  <div className="bjs-product-title">
                    <strong>{item.name}{!item.isVisible && <em className="bjs-tag">숨김</em>}{item.syncStatus === "failed" && <em className="bjs-tag is-danger">지난 동기화 실패</em>}</strong>
                    <small>{item.code ?? "상품코드 없음"} · {helpers.doogoCategoryName(item.categoryId) || "카테고리 없음"}{item.supplierName ? ` · ${item.supplierName}` : ""}</small>
                    <small className="bjs-times">{item.baseAt ? `마지막으로 맞춘 때 ${formatTime(item.baseAt)}` : "맞춘 기록 없음"}{item.lastPulledAt ? ` · 발주오라 값 읽은 때 ${formatTime(item.lastPulledAt)}` : ""}</small>
                  </div>
                  <span className="bjs-count">{sending > 0 ? `보낼 칸 ${sending}개` : "보낼 칸 없음"}</span>
                </div>
                {item.diffs.length === 0
                  ? <p className="bjs-note"><AlertTriangle size={14} aria-hidden="true" /> 지난 동기화가 실패한 상품이에요. 지금은 다른 칸이 없어요(다시 보내면 결과만 새로 남아요).</p>
                  : <div className="bjs-diffs" role="table" aria-label={`${item.name} 칸별 차이`}>{item.diffs.map((diff) => <DiffDetail key={diff.field} item={item} diff={diff} helpers={helpers} />)}</div>}
              </li>
            );
          })}
        </ol>
      )}
      <SheetPager page={paged.page} pages={paged.pages} total={paged.filtered.length} size={PAGE} onPage={(next) => { paged.setPage(next); scrollTop(); }} />
    </>
  );
}

// ─── 신규 등록 · 발주오라에만 있음 ────────────────────────────────────────────

function NewList({ items, helpers }: { items: StatChangeItem[]; helpers: Helpers }) {
  const [query, setQuery] = useState("");
  const paged = usePaged(items, query, (item) => `${item.name} ${item.code ?? ""} ${item.supplierName ?? ""}`);
  return (
    <>
      <SearchBox value={query} onChange={setQuery} placeholder="상품명·상품코드·매입처로 찾기" />
      {paged.rows.length === 0 ? <p className="bjs-empty">{items.length === 0 ? "발주오라에 새로 등록할 상품이 없어요." : "찾는 상품이 없어요."}</p> : (
        <ol className="bjs-rows">
          {paged.rows.map((item) => (
            <li key={item.productId} className="bjs-row">
              <Thumb src={item.imageUrl} />
              <div className="bjs-row-main">
                <strong>{item.name}{!item.isVisible && <em className="bjs-tag">숨김</em>}</strong>
                <small>{item.code ?? "상품코드 없음(발주오라가 새 코드를 만들어요)"} · {helpers.doogoCategoryName(item.categoryId) || "카테고리 없음"}{item.supplierName ? ` · 매입처 ${item.supplierName}` : " · 매입처 없음"}</small>
                {item.preview && <small className="bjs-prices">발주오라에 들어갈 값: 공급가 {won(item.preview.supplyPrice)} · 수강생(그룹) {won(item.preview.groupPrice)} · 소비자가 {won(item.preview.consumerPrice)} · 매입원가 {won(item.preview.purchaseCost)}</small>}
                <div className="bjs-chips">
                  {item.sameName ? (
                    <span className="bjs-chip is-warn">발주오라에 이름이 같은 상품({item.sameName.code ?? "상품코드 없음"}) · 새로 등록하지 않고 '같은 상품으로 연결'{item.sameName.blocked ? ` — ${item.sameName.blocked}` : ""}</span>
                  ) : item.newSupplier ? (
                    <span className="bjs-chip is-warn">새 매입처 · 발주오라에 같은 매입처 상품이 있어야 등록돼요</span>
                  ) : <span className="bjs-chip is-new">동기화하면 발주오라에 새로 등록</span>}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      <SheetPager page={paged.page} pages={paged.pages} total={paged.filtered.length} size={PAGE} onPage={(next) => { paged.setPage(next); scrollTop(); }} />
    </>
  );
}

function OnlyList({ items, helpers }: { items: StatOnlyItem[]; helpers: Helpers }) {
  const [query, setQuery] = useState("");
  const paged = usePaged(items, query, (item) => `${item.name} ${item.code ?? ""}`);
  return (
    <>
      <SearchBox value={query} onChange={setQuery} placeholder="상품명·상품코드로 찾기" />
      {paged.rows.length === 0 ? <p className="bjs-empty">{items.length === 0 ? "발주오라에만 있는 상품이 없어요." : "찾는 상품이 없어요."}</p> : (
        <ol className="bjs-rows">
          {paged.rows.map((item) => (
            <li key={item.id} className="bjs-row">
              <Thumb src={item.imageUrls[0]} />
              <div className="bjs-row-main">
                <strong>{item.name || "(이름 없음)"}</strong>
                <small>발주오라 상품코드 {item.code ?? "없음"}{item.categoryIds && item.categoryIds.length > 0 ? ` · ${item.categoryIds.map(helpers.categoryPath).join(", ")}` : ""}</small>
                <small className="bjs-prices">공급가 {won(item.supplyPrice)}{item.groupPrice !== undefined ? ` · 그룹(수강생) ${won(item.groupPrice)}` : ""} · 소비자가 {won(item.consumerPrice)} · 매입원가 {won(item.purchaseCost)}</small>
                <div className="bjs-chips">
                  <span className={`bjs-chip${item.isVisible === false ? " is-muted" : ""}`}>{item.isVisible === false ? "발주오라 미노출" : item.isVisible ? "발주오라 노출" : "노출 모름"}</span>
                  <span className={`bjs-chip${item.isSoldOut ? " is-muted" : ""}`}>{item.isSoldOut ? "품절" : item.isSoldOut === false ? "판매중" : "판매 상태 모름"}</span>
                  {item.deletedMatch && <span className="bjs-chip is-restore">DB센터에서 지운 상품({item.deletedMatch.code}) · 'DB센터로 가져오기'면 숨김으로 되살림 · 운영 홈 상품 동기화는 발주오라 미노출·품절로</span>}
                  {item.sameNameProduct && <span className="bjs-chip is-warn">DB센터에 이름이 같은 상품({item.sameNameProduct.code ?? "상품코드 없음"}) · 같은 상품이면 '신규 등록' 탭에서 연결</span>}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      <SheetPager page={paged.page} pages={paged.pages} total={paged.filtered.length} size={PAGE} onPage={(next) => { paged.setPage(next); scrollTop(); }} />
    </>
  );
}

// ─── 연결된 상품(서버 20개씩) ──────────────────────────────────────────────────

function LinkedList() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [filter, setFilter] = useState<"all" | "diff" | "same">("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LinkedPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 입력이 멈추고 0.3초 뒤에 찾습니다.
  useEffect(() => {
    const timer = window.setTimeout(() => { setSubmitted(query.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let stopped = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), size: String(PAGE), filter });
    if (submitted) params.set("q", submitted);
    void (async () => {
      try {
        const next = await readData<LinkedPage>(await apiFetch(`/baljuora/admin/linked?${params.toString()}`, { silent: true }));
        if (!stopped) setData(next);
      } catch (failure) {
        if (!stopped) setError(failure instanceof Error ? failure.message : "연결된 상품을 불러오지 못했어요.");
      } finally {
        if (!stopped) setLoading(false);
      }
    })();
    return () => { stopped = true; };
  }, [page, filter, submitted]);

  const counts = data?.counts;
  return (
    <>
      <div className="bjs-tools">
        <div className="bjs-filters" role="group" aria-label="연결된 상품 거르기">
          {([["all", "전체", counts?.all], ["diff", "다른 칸 있음", counts?.diff], ["same", "같음", counts?.same]] as const).map(([key, label, value]) => (
            <button key={key} type="button" className={filter === key ? "is-active" : ""} aria-pressed={filter === key} onClick={() => { setFilter(key); setPage(1); }}>{label}{value !== undefined ? ` ${value.toLocaleString("ko-KR")}` : ""}</button>
          ))}
        </div>
        <SearchBox value={query} onChange={setQuery} placeholder="상품명·상품코드·발주오라 코드·매입처로 찾기" />
      </div>
      {error ? <p className="bjs-empty is-error">{error}</p> : !data ? (
        <p className="bjs-empty"><Loader2 className="bjs-spin" size={16} aria-hidden="true" /> 불러오는 중…</p>
      ) : data.items.length === 0 ? <p className="bjs-empty">{submitted ? "찾는 상품이 없어요." : "연결된 상품이 없어요."}</p> : (
        <ol className={`bjs-rows is-linked${loading ? " is-loading" : ""}`}>
          {data.items.map((row) => (
            <li key={row.productId} className="bjs-row">
              <Thumb src={row.imageUrl ?? row.baljuora.imageUrl} />
              <div className="bjs-row-main">
                <strong>{row.name}{!row.isVisible && <em className="bjs-tag">숨김</em>}{row.isSoldOut && <em className="bjs-tag">품절·시즌종료</em>}</strong>
                <small>{row.code ?? "상품코드 없음"}{row.baljuora.code && row.baljuora.code !== row.code ? ` ↔ 발주오라 ${row.baljuora.code}` : " ↔ 발주오라 같은 코드"}{row.categoryName ? ` · ${row.categoryName}` : ""}{row.supplierName ? ` · ${row.supplierName}` : ""}</small>
                <div className="bjs-link-grid">
                  <span><em>일반공급가 ↔ 발주오라 공급가</em><b className={row.baljuora.supplyPrice !== null && row.baljuora.supplyPrice !== row.generalPrice ? "is-diff" : ""}>{won(row.generalPrice)} · {won(row.baljuora.supplyPrice)}</b></span>
                  <span><em>수강생 단가 ↔ 그룹 공급가</em><b className={row.baljuora.groupPriceKnown && row.baljuora.groupPrice !== null && row.baljuora.groupPrice !== row.studentPrice ? "is-diff" : ""}>{won(row.studentPrice)} · {row.baljuora.groupPriceKnown ? row.baljuora.groupPrice === null ? "없음(공급가 적용)" : won(row.baljuora.groupPrice) : "못 읽음"}</b></span>
                  <span><em>공개 ↔ 도매몰</em><b>{row.isVisible ? "공개" : "숨김"} · {row.baljuora.isVisible === null ? "모름" : row.baljuora.isVisible ? "노출" : "미노출"}{row.baljuora.isSoldOut ? " · 품절" : ""}</b></span>
                </div>
                <div className="bjs-chips">
                  {row.diffCount === 0
                    ? <span className="bjs-chip is-same">DB센터 = 발주오라</span>
                    : <span className="bjs-chip is-warn">다른 칸 {row.diffCount}개 · {row.diffFields.map((field) => BALJUORA_FIELD_SHORT_LABELS[field]).join(" · ")}</span>}
                  {row.syncStatus === "failed" && <span className="bjs-chip is-danger">지난 동기화 실패</span>}
                  {row.lastPulledAt && <span className="bjs-chip is-muted">발주오라 값 읽은 때 {formatTime(row.lastPulledAt)}</span>}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {data && <SheetPager page={data.page} pages={data.pages} total={data.total} size={data.size} onPage={(next) => { setPage(next); scrollTop(); }} />}
    </>
  );
}

const TITLES: Record<StatKind, { title: string; kicker: string; description: string; tab: string | null }> = {
  linked: {
    kicker: "DB센터 ↔ 발주오라",
    title: "연결된 상품",
    description: "상품코드로 서로 이어진 DB센터 상품과 발주오라 상품이에요. 마지막으로 읽은 발주오라 값과 DB센터 값을 나란히 보여 주고, 다른 칸이 있으면 표시해요(발주오라를 다시 읽지 않아요 — 최신 값은 '발주오라 상품 불러오기(비교)').",
    tab: null
  },
  push: {
    kicker: "DB센터 → 발주오라",
    title: "보낼 변경",
    description: "동기화하면 발주오라로 보낼 상품과 칸이에요. 칸마다 DB센터 값·발주오라 값·마지막으로 맞춘 값(기준)을 함께 보여 줘서, 어느 쪽이 바뀌었는지 직접 확인할 수 있어요. 이상하면 보내지 말고 '이대로 두기'나 '발주오라 상품 불러오기(비교)'로 다시 확인해 주세요.",
    tab: "push"
  },
  new: {
    kicker: "DB센터 → 발주오라",
    title: "신규 등록",
    description: "DB센터에는 있고 발주오라에는 없는 상품이에요. 동기화하면 같은 매입처의 발주오라 상품에서 매입처·배송 설정을 복사해 새로 등록해요. 이름이 같은 발주오라 상품이 있으면 새로 만들지 않고 '같은 상품으로 연결'을 써요.",
    tab: "new"
  },
  only: {
    kicker: "발주오라 → DB센터",
    title: "발주오라에만 있음",
    description: "발주오라에는 있고 DB센터에는 없는(상품코드가 이어지지 않은) 상품이에요. 'DB센터로 가져오기'를 하면 DB센터에 숨김으로 등록해요(DB센터에서 지운 상품은 되살림). 운영 홈 상품 동기화는 이 상품들을 바꾸지 않고, DB센터에서 지운 상품만 발주오라에서 미노출·품절로 바꿔요.",
    tab: "only"
  }
};

export function BaljuoraStatModal({ kind, count, onClose, onOpenTab, pushItems, newItems, onlyItems, helpers, lastCompareAt }: {
  kind: StatKind;
  count: number;
  onClose: () => void;
  onOpenTab: (tab: "push" | "new" | "only") => void;
  pushItems: StatChangeItem[];
  newItems: StatChangeItem[];
  onlyItems: StatOnlyItem[];
  helpers: Helpers;
  lastCompareAt: string | null;
}) {
  const meta = TITLES[kind];
  return (
    <AdminSheetModal
      kicker={meta.kicker}
      title={<>{meta.title} <span className="bjs-title-count">{count.toLocaleString("ko-KR")}{kind === "linked" || kind === "push" || kind === "new" || kind === "only" ? "개" : ""}</span></>}
      description={<>{meta.description}{lastCompareAt ? ` 마지막 비교: ${formatTime(lastCompareAt)}.` : ""}</>}
      onClose={onClose}
      wide
      className="bjs-modal"
      footer={(
        <>
          {meta.tab && <button type="button" className="outline-button" onClick={() => { onOpenTab(meta.tab as "push" | "new" | "only"); onClose(); }}>아래 목록 탭에서 보기</button>}
          <button type="button" className="primary-action" onClick={onClose}>닫기</button>
        </>
      )}
    >
      {kind === "push" && <PushList items={pushItems} helpers={helpers} />}
      {kind === "new" && <NewList items={newItems} helpers={helpers} />}
      {kind === "only" && <OnlyList items={onlyItems} helpers={helpers} />}
      {kind === "linked" && <LinkedList />}
    </AdminSheetModal>
  );
}
