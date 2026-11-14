// 마진계산기(2026-11-14): 마진계산기 화면(/margin)과 어디서나 여는 계산기 팝업(오른쪽 아래 "마진계산기", 단가표 마진율 칸 "계산").
// 계산은 lib/margin-calculator.ts, 저장은 이 기기 브라우저(localStorage)만 씁니다(서버·DB 저장 없음).
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Calculator, Download, FolderOpen, PencilLine, Plus, RotateCcw, Save, Search, Store, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { PageFrame } from "./PublicCatalog";
import { loadCatalogShared } from "./catalog-cache";
import type { CatalogData, Product, PublicShippingPolicy } from "./types";
import { representativeFee } from "@/lib/shipping-rates";
import {
  LOW_MARGIN_RATE,
  MARGIN_LIMITS,
  MARGIN_MARKETS,
  type MarginDraft,
  type MarginPrefill,
  type MarginResult,
  type MarginRow,
  type MarginSheet,
  type MarketRates,
  compareMarkets,
  computeMargin,
  emptyDraft,
  findMarket,
  formatRate,
  formatWon,
  loadDraft,
  loadFeeOverrides,
  loadSaves,
  loadSheetRows,
  makeId,
  marketRates,
  parseMoneyText,
  parseRateText,
  rowQuantity,
  salePriceForMargin,
  saveDraft,
  saveFeeOverrides,
  saveSheetRows,
  sheetSummary,
  sheetToCsv,
  upsertSave,
  writeSaves
} from "@/lib/margin-calculator";
import "./margin-calculator.css";

const TARGET_RATES = [10, 20, 30, 40];

const effectiveA = (product: Pick<Product, "aPrice" | "generalPrice">) => (product.aPrice > 0 ? product.aPrice : product.generalPrice);

// 단가표 줄·상품 검색에서 고른 두고푸드 상품을 계산기에 채웁니다(판매처·받은 배송비·부가세 설정은 그대로 둠).
export function applyPrefill(draft: MarginDraft, prefill: MarginPrefill): MarginDraft {
  return {
    ...draft,
    name: prefill.name.slice(0, MARGIN_LIMITS.name),
    productId: prefill.productId,
    aPrice: prefill.aPrice,
    generalPrice: prefill.generalPrice,
    costBasis: "a",
    cost: prefill.aPrice,
    salePrice: prefill.salePrice && prefill.salePrice > 0 ? prefill.salePrice : null,
    shippingOut: prefill.shippingOut,
    extraCost: null
  };
}

export function prefillFromProduct(product: Product, policy?: PublicShippingPolicy): MarginPrefill {
  return {
    productId: product.id,
    name: product.name,
    aPrice: effectiveA(product),
    generalPrice: product.generalPrice,
    salePrice: product.salePriceMode === "fixed" ? product.salePrice : null,
    shippingOut: policy ? representativeFee(policy) : null
  };
}

function draftToRow(draft: MarginDraft, id = makeId(), quantity: number | null = 1): MarginRow {
  return {
    id,
    name: draft.name.trim() || "이름 없는 상품",
    marketId: draft.marketId,
    quantity,
    productId: draft.productId,
    salePrice: draft.salePrice,
    shippingIn: draft.shippingIn,
    cost: draft.cost,
    shippingOut: draft.shippingOut,
    extraCost: draft.extraCost,
    feeRate: draft.feeRate,
    shipFeeRate: draft.shipFeeRate,
    vat: draft.vat
  };
}

function rowToDraft(row: MarginRow, base: MarginDraft): MarginDraft {
  return {
    ...base,
    name: row.name,
    marketId: row.marketId,
    productId: row.productId ?? null,
    salePrice: row.salePrice,
    shippingIn: row.shippingIn,
    cost: row.cost,
    shippingOut: row.shippingOut,
    extraCost: row.extraCost,
    feeRate: row.feeRate,
    shipFeeRate: row.shipFeeRate,
    vat: row.vat,
    aPrice: null,
    generalPrice: null,
    costBasis: "manual"
  };
}

function downloadText(fileName: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function savedAtLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

// ---------- 입력칸 ----------

const fieldText = (value: number | null, kind: "money" | "rate") => (value === null ? "" : kind === "rate" ? String(value) : value.toLocaleString("ko-KR"));

function NumberField({
  label,
  hint,
  value,
  onChange,
  kind = "money",
  placeholder,
  extra,
  className = ""
}: {
  label: string;
  hint?: ReactNode;
  value: number | null;
  onChange: (value: number | null) => void;
  kind?: "money" | "rate";
  placeholder?: string;
  extra?: ReactNode;
  className?: string;
}) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => fieldText(value, kind));
  useEffect(() => {
    if (!focused) setText(fieldText(value, kind));
  }, [value, kind, focused]);
  return (
    <div className={`mc-field ${className}`.trim()}>
      <label htmlFor={id}>{label}</label>
      <div className="mc-input">
        <input
          id={id}
          type="text"
          inputMode={kind === "rate" ? "decimal" : "numeric"}
          autoComplete="off"
          placeholder={placeholder ?? "0"}
          value={text}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setText(fieldText(value, kind));
          }}
          onChange={(event) => {
            const raw = event.target.value;
            const parsed = kind === "rate" ? parseRateText(raw) : parseMoneyText(raw);
            setText(kind === "rate" ? raw.replace(/[^\d.]/g, "") : parsed === null ? "" : parsed.toLocaleString("ko-KR"));
            onChange(parsed);
          }}
        />
        <span className="mc-unit" aria-hidden="true">{kind === "rate" ? "%" : "원"}</span>
      </div>
      {hint && <small id={`${id}-hint`}>{hint}</small>}
      {extra}
    </div>
  );
}

// ---------- 결과 ----------

function ResultPanel({ result, vat }: { result: MarginResult | null; vat: boolean }) {
  const tone = result ? (result.profit < 0 ? " is-negative" : result.marginRate < LOW_MARGIN_RATE ? " is-low" : "") : "";
  return (
    <section className={`mc-result${tone}`} aria-live="polite" aria-label="계산 결과">
      <div className="mc-result-grid">
        <div>
          <span>정산금액</span>
          <strong>{result ? formatWon(result.settlement) : "-"}</strong>
          <small>마켓이 보내 주는 돈</small>
        </div>
        <div>
          <span>판매이익</span>
          <strong className="mc-profit">{result ? formatWon(result.profit) : "-"}</strong>
          <small>1개 팔면 남는 돈</small>
        </div>
        <div className="mc-result-rate">
          <span>마진율</span>
          <strong>{result ? formatRate(result.marginRate) : "-"}</strong>
          <small>판매가 기준</small>
        </div>
      </div>
      <p className="mc-result-meta">
        {!result
          ? "판매가를 넣으면 바로 계산돼요."
          : result.profit <= 0
            ? "이 판매가로는 남는 돈이 없어요. 판매가를 올리거나 비용을 줄여 보세요."
            : <>광고 손익분기 ROAS <b>{result.breakEvenRoas?.toLocaleString("ko-KR")}%</b> · 광고 수익률이 이보다 낮으면 손해예요{vat ? <> · 부가세 {formatWon(result.vatAmount)} 반영</> : null}</>}
      </p>
    </section>
  );
}

function Breakdown({ draft, result }: { draft: MarginDraft; result: MarginResult | null }) {
  if (!result) return null;
  const rows: Array<[string, number, boolean?]> = [
    ["고객 결제 금액 (판매가 + 받은 배송비)", result.revenue],
    [`판매 수수료 ${draft.feeRate ?? 0}%`, -result.saleFee],
    [`배송비 수수료 ${draft.shipFeeRate ?? 0}%`, -result.shipFee],
    ["정산금액", result.settlement, true],
    ["매입가", -(draft.cost ?? 0)],
    ["보낸 배송비", -(draft.shippingOut ?? 0)],
    ["기타 비용", -(draft.extraCost ?? 0)]
  ];
  if (draft.vat) rows.push(["부가세 (남는 돈 ÷ 11)", -result.vatAmount]);
  rows.push(["판매이익", result.profit, true]);
  return (
    <details className="mc-breakdown">
      <summary>계산 내역 보기</summary>
      <dl>
        {rows.map(([label, value, total]) => (
          <div key={label} className={total ? "is-total" : undefined}>
            <dt>{total ? "= " : value < 0 ? "− " : ""}{label}</dt>
            <dd>{value < 0 ? `−${formatWon(-value)}` : formatWon(value)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

// ---------- 두고푸드 상품 불러오기 ----------

function ProductPicker({ onPick }: { onPick: (prefill: MarginPrefill) => void }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [loading, setLoading] = useState(false);
  const ensureCatalog = () => {
    if (catalog || loading) return;
    setLoading(true);
    void loadCatalogShared().then((data) => {
      setCatalog(data);
      setLoading(false);
    });
  };
  const policyById = useMemo(() => new Map((catalog?.shippingPolicies ?? []).map((policy) => [policy.id, policy])), [catalog]);
  const results = useMemo(() => {
    const key = query.replace(/\s+/g, "").toLowerCase();
    if (!catalog || !key) return [];
    return catalog.products.filter((product) => `${product.name}${product.productCode ?? ""}`.replace(/\s+/g, "").toLowerCase().includes(key)).slice(0, 8);
  }, [catalog, query]);
  const pick = (product: Product) => {
    onPick(prefillFromProduct(product, product.shippingPolicyId ? policyById.get(product.shippingPolicyId) : undefined));
    setQuery("");
    setOpen(false);
  };
  return (
    <div className="mc-picker">
      <label htmlFor={id}>두고푸드 상품 불러오기</label>
      <div className="mc-picker-input">
        <Search size={17} aria-hidden="true" />
        <input
          id={id}
          type="search"
          autoComplete="off"
          placeholder="상품명·상품코드 검색 (예: 루테인, 마누카)"
          value={query}
          onFocus={() => {
            ensureCatalog();
            setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            ensureCatalog();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && results[0]) {
              event.preventDefault();
              pick(results[0]);
            }
            if (event.key === "Escape" && open && query) {
              event.stopPropagation();
              setOpen(false);
            }
          }}
        />
      </div>
      {open && query.trim() && (
        <div className="mc-picker-results" role="group" aria-label="상품 검색 결과">
          {loading || !catalog ? (
            <p>{loading ? "두고푸드 상품을 불러오는 중이에요…" : "상품을 불러오지 못했어요. 잠시 후 다시 검색해 주세요."}</p>
          ) : results.length ? (
            results.map((product) => (
              <button key={product.id} type="button" onClick={() => pick(product)}>
                <strong>{product.name}</strong>
                <span>A단가 {formatWon(effectiveA(product))} · 판매가 {product.salePriceMode === "fixed" && product.salePrice ? formatWon(product.salePrice) : "자율"}</span>
              </button>
            ))
          ) : (
            <p>찾는 상품이 없어요. 다른 이름으로 검색해 보세요.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- 계산기 카드(팝업·화면 공용) ----------

type CalculatorProps = {
  draft: MarginDraft;
  onDraft: (next: MarginDraft) => void;
  overrides: MarketRates;
  onOverrides: (next: MarketRates) => void;
  variant: "page" | "modal";
  editingRow?: boolean;
  onAddToSheet: () => void;
  onCancelEdit?: () => void;
};

export function MarginCalculatorCard({ draft, onDraft, overrides, onOverrides, variant, editingRow, onAddToSheet, onCancelEdit }: CalculatorProps) {
  const marketSelectId = useId();
  const result = useMemo(() => computeMargin(draft), [draft]);
  const market = findMarket(draft.marketId) ?? MARGIN_MARKETS[0];
  const customized = Boolean(overrides[market.id]);
  const update = (patch: Partial<MarginDraft>) => onDraft({ ...draft, ...patch });
  const setRates = (patch: { feeRate?: number | null; shipFeeRate?: number | null }) => {
    const next = { ...draft, ...patch };
    onDraft(next);
    onOverrides({ ...overrides, [market.id]: { feeRate: next.feeRate ?? 0, shipFeeRate: next.shipFeeRate ?? 0 } });
  };
  const resetRates = () => {
    const nextOverrides = { ...overrides };
    delete nextOverrides[market.id];
    onOverrides(nextOverrides);
    onDraft({ ...draft, feeRate: market.feeRate, shipFeeRate: market.shipFeeRate });
  };
  const targetRate = draft.targetRate ?? 30;
  const targetPrice = salePriceForMargin(draft, targetRate);
  const hasProduct = draft.aPrice !== null && draft.generalPrice !== null;
  const reset = () => onDraft({ ...emptyDraft(draft.marketId, overrides), shippingIn: draft.shippingIn, vat: draft.vat, targetRate: draft.targetRate });
  return (
    <div className={`mc-card is-${variant}`}>
      <ResultPanel result={result} vat={draft.vat} />
      <ProductPicker onPick={(prefill) => onDraft(applyPrefill(draft, prefill))} />
      {draft.productId && (
        <div className="mc-loaded">
          <span className="mc-loaded-label">불러온 상품</span>
          <strong>{draft.name}</strong>
          {draft.salePrice === null && <em>판매가가 자율이에요. 내 판매가를 넣어 주세요.</em>}
          {draft.shippingOut === null && <em>단가표에 배송비 정책이 없는 상품이에요. 보낸 배송비를 직접 넣어 주세요.</em>}
        </div>
      )}
      <div className="mc-fields">
        <label className="mc-field mc-name">
          <span>상품명 (선택)</span>
          <input type="text" value={draft.name} maxLength={MARGIN_LIMITS.name} placeholder="계산표에 담을 때 쓰는 이름" onChange={(event) => update({ name: event.target.value })} />
        </label>
        <NumberField label="판매가격" hint="고객이 내는 상품 가격" value={draft.salePrice} onChange={(value) => update({ salePrice: value })} />
        <NumberField
          label="받은 배송비"
          hint="고객에게 받은 배송비 · 무료배송이면 0"
          value={draft.shippingIn}
          onChange={(value) => update({ shippingIn: value })}
          extra={draft.shippingOut ? <button type="button" className="mc-mini-button" onClick={() => update({ shippingIn: draft.shippingOut })}>보낸 배송비만큼 받기</button> : null}
        />
        <NumberField
          label="매입가"
          hint="두고푸드 공급가(A단가 또는 일반공급가)"
          value={draft.cost}
          onChange={(value) => update({ cost: value, costBasis: "manual" })}
          extra={hasProduct ? (
            <div className="mc-basis-toggle" role="group" aria-label="매입가 기준">
              <button type="button" aria-pressed={draft.costBasis === "a"} onClick={() => update({ cost: draft.aPrice, costBasis: "a" })}>A단가 {formatWon(draft.aPrice ?? 0)}</button>
              <button type="button" aria-pressed={draft.costBasis === "general"} onClick={() => update({ cost: draft.generalPrice, costBasis: "general" })}>일반공급가 {formatWon(draft.generalPrice ?? 0)}</button>
            </div>
          ) : null}
        />
        <NumberField label="보낸 배송비" hint="택배비·포장비(두고푸드 주문 때 내는 배송비)" value={draft.shippingOut} onChange={(value) => update({ shippingOut: value })} />
        <NumberField label="기타 비용 (선택)" hint="광고비·사은품 등 1개당" value={draft.extraCost} onChange={(value) => update({ extraCost: value })} />
      </div>
      <div className="mc-market">
        <div className="mc-field">
          <label htmlFor={marketSelectId}>판매처</label>
          <div className="mc-select">
            <Store size={17} aria-hidden="true" />
            <select
              id={marketSelectId}
              value={draft.marketId}
              onChange={(event) => {
                const next = findMarket(event.target.value) ?? MARGIN_MARKETS[0];
                const rates = marketRates(next, overrides);
                update({ marketId: next.id, feeRate: rates.feeRate, shipFeeRate: rates.shipFeeRate });
              }}
            >
              {MARGIN_MARKETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </div>
        </div>
        <NumberField label="판매 수수료" kind="rate" value={draft.feeRate} onChange={(value) => setRates({ feeRate: value })} />
        <NumberField label="배송비 수수료" kind="rate" value={draft.shipFeeRate} onChange={(value) => setRates({ shipFeeRate: value })} />
        <p className="mc-basis">
          {customized ? <span className="mc-tag is-custom">내가 고친 값</span> : market.approximate ? <span className="mc-tag">참고값</span> : null}
          {market.basis}
          {customized && <button type="button" className="mc-link-button" onClick={resetRates}>기본값으로</button>}
        </p>
      </div>
      <label className="mc-vat">
        <input type="checkbox" checked={draft.vat} onChange={(event) => update({ vat: event.target.checked })} />
        <span><b>부가세(10%)까지 빼고 보기</b><small>과세 상품을 일반과세자가 팔 때 · 신선 농산물 같은 면세 상품은 끄세요</small></span>
      </label>
      <div className="mc-target">
        <div className="mc-target-head">
          <strong>목표 마진으로 판매가 구하기</strong>
          <div className="mc-target-chips" role="group" aria-label="목표 마진율">
            {TARGET_RATES.map((rate) => (
              <button key={rate} type="button" aria-pressed={targetRate === rate} onClick={() => update({ targetRate: rate })}>{rate}%</button>
            ))}
            <NumberField className="mc-target-input" label="직접 입력" kind="rate" value={draft.targetRate} onChange={(value) => update({ targetRate: value })} placeholder="30" />
          </div>
        </div>
        <p>
          <span>
            {targetPrice
              ? <>이 판매처에서 마진 <b>{targetRate}%</b>를 남기려면 판매가 <b className="mc-target-price">{formatWon(targetPrice)}</b> 이상</>
              : (draft.cost ?? 0) <= 0
                ? "매입가를 넣으면 목표 마진에 맞는 판매가를 알려 드려요."
                : "이 수수료와 비용으로는 그 마진을 낼 수 없어요. 목표 마진을 낮춰 보세요."}
          </span>
          {targetPrice && targetPrice !== draft.salePrice && <button type="button" className="mc-mini-button" onClick={() => update({ salePrice: targetPrice })}>이 판매가로 계산</button>}
        </p>
      </div>
      <Breakdown draft={draft} result={result} />
      <div className="mc-actions">
        <button type="button" className="mc-secondary" onClick={reset}><RotateCcw size={16} aria-hidden="true" /> 초기화</button>
        {editingRow && onCancelEdit && <button type="button" className="mc-secondary" onClick={onCancelEdit}>고치기 취소</button>}
        <button type="button" className="mc-primary" onClick={onAddToSheet} disabled={!result}>
          {editingRow ? <><Save size={16} aria-hidden="true" /> 계산표에 고쳐 담기</> : <><Plus size={16} aria-hidden="true" /> 계산표에 담기</>}
        </button>
      </div>
    </div>
  );
}

// ---------- 마켓별 비교 ----------

function MarketCompare({ draft, overrides, onPick }: { draft: MarginDraft; overrides: MarketRates; onPick: (marketId: string) => void }) {
  const rows = useMemo(() => compareMarkets(draft, overrides), [draft, overrides]);
  const ready = rows.some((row) => row.result);
  return (
    <section className="mc-panel mc-compare" aria-labelledby="mc-compare-title">
      <header>
        <h2 id="mc-compare-title">마켓별로 남는 돈</h2>
        <p>같은 판매가·공급가로 마켓마다 팔면 얼마나 남는지 비교해요. 누르면 그 마켓으로 계산해요.</p>
      </header>
      {ready ? (
        <ol>
          {rows.map((row, index) => (
            <li key={row.market.id}>
              <button type="button" className={row.market.id === draft.marketId ? "is-current" : undefined} onClick={() => onPick(row.market.id)} aria-pressed={row.market.id === draft.marketId}>
                <span className="mc-compare-rank">{index + 1}</span>
                <span className="mc-compare-name">
                  <strong>{row.market.short}</strong>
                  <small>수수료 {row.feeRate}%{row.customized ? " · 내가 고친 값" : row.market.approximate ? " · 참고값" : ""}</small>
                </span>
                <span className="mc-compare-value">
                  <strong className={row.result && row.result.profit < 0 ? "is-negative" : undefined}>{row.result ? formatWon(row.result.profit) : "-"}</strong>
                  <small>{row.result ? formatRate(row.result.marginRate) : ""}</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mc-empty-text">판매가를 넣으면 마켓별 판매이익을 보여 드려요.</p>
      )}
    </section>
  );
}

// ---------- 계산표(여러 상품 · 저장/불러오기) ----------

function MarginSheetPanel({
  rows,
  onRows,
  onEdit,
  editingId
}: {
  rows: MarginRow[];
  onRows: (rows: MarginRow[]) => void;
  onEdit: (row: MarginRow) => void;
  editingId: string | null;
}) {
  const [saves, setSaves] = useState<MarginSheet[]>(() => loadSaves());
  const [panel, setPanel] = useState<"none" | "save" | "load">("none");
  const [saveName, setSaveName] = useState("");
  const [currentName, setCurrentName] = useState<string | null>(null);
  const summary = useMemo(() => sheetSummary(rows), [rows]);
  const nameInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (panel === "save") nameInputRef.current?.focus();
  }, [panel]);
  const persistSaves = (next: MarginSheet[]) => {
    setSaves(next);
    if (!writeSaves(next)) toast.error("이 브라우저에서는 저장할 수 없어요(개인정보 보호 모드 등).");
  };
  const save = () => {
    if (!rows.length) return;
    const { saves: next, saved } = upsertSave(saves, saveName || currentName || `계산표 ${saves.length + 1}`, rows);
    persistSaves(next);
    setCurrentName(saved.name);
    setPanel("none");
    toast.success(`"${saved.name}"(으)로 저장했어요.`);
  };
  const load = (sheet: MarginSheet) => {
    if (rows.length && !window.confirm(`지금 계산표(${rows.length}개)를 "${sheet.name}"(으)로 바꿀까요? 저장하지 않은 내용은 사라져요.`)) return;
    onRows(sheet.rows.map((row) => ({ ...row })));
    setCurrentName(sheet.name);
    setSaveName(sheet.name);
    setPanel("none");
  };
  const remove = (sheet: MarginSheet) => {
    if (!window.confirm(`저장한 계산표 "${sheet.name}"을(를) 지울까요?`)) return;
    persistSaves(saves.filter((item) => item.id !== sheet.id));
    if (currentName === sheet.name) setCurrentName(null);
  };
  const clear = () => {
    if (rows.length && !window.confirm("지금 계산표를 비우고 새로 시작할까요? 저장하지 않은 내용은 사라져요.")) return;
    onRows([]);
    setCurrentName(null);
    setSaveName("");
  };
  const exportCsv = () => {
    if (!rows.length) return;
    const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()).replace(/-/g, "");
    const label = currentName ? `${currentName.replace(/[\\/:*?"<>|\s]+/g, "_")}_` : "";
    downloadText(`두고푸드_마진계산표_${label}${stamp}.csv`, sheetToCsv(rows));
  };
  const setQuantity = (id: string, quantity: number | null) => onRows(rows.map((row) => (row.id === id ? { ...row, quantity } : row)));
  return (
    <section className="mc-panel mc-sheet" aria-labelledby="mc-sheet-title">
      <header className="mc-sheet-head">
        <div>
          <h2 id="mc-sheet-title">내 계산표{currentName ? <small> · {currentName}</small> : null}</h2>
          <p>계산기에서 "계산표에 담기"를 누르면 여기에 쌓여요. 이름을 붙여 저장하면 다음에 다시 불러올 수 있어요(이 기기 브라우저에 저장).</p>
        </div>
        <div className="mc-sheet-tools">
          <button type="button" onClick={() => { setSaveName(currentName ?? ""); setPanel(panel === "save" ? "none" : "save"); }} disabled={!rows.length} aria-expanded={panel === "save"}><Save size={16} aria-hidden="true" /> 저장</button>
          <button type="button" onClick={() => setPanel(panel === "load" ? "none" : "load")} aria-expanded={panel === "load"}><FolderOpen size={16} aria-hidden="true" /> 불러오기{saves.length ? <b>{saves.length}</b> : null}</button>
          <button type="button" onClick={clear} disabled={!rows.length}><RotateCcw size={16} aria-hidden="true" /> 새 계산표</button>
          <button type="button" onClick={exportCsv} disabled={!rows.length}><Download size={16} aria-hidden="true" /> 엑셀(CSV)</button>
        </div>
      </header>
      {panel === "save" && (
        <form className="mc-save-form" onSubmit={(event) => { event.preventDefault(); save(); }}>
          <label htmlFor="mc-save-name">계산표 이름</label>
          <div>
            <input id="mc-save-name" ref={nameInputRef} type="text" maxLength={MARGIN_LIMITS.name} value={saveName} placeholder={`예: 마누카꿀 · 11월 스마트스토어`} onChange={(event) => setSaveName(event.target.value)} />
            <button type="submit" className="mc-primary">저장하기</button>
          </div>
          <small>{saves.some((item) => item.name === saveName.trim()) ? "같은 이름이 있어요. 저장하면 그 계산표를 새 내용으로 바꿔요." : `최대 ${MARGIN_LIMITS.saves}개까지 저장해요.`}</small>
        </form>
      )}
      {panel === "load" && (
        <div className="mc-load-list">
          {saves.length ? (
            <ul>
              {saves.map((sheet) => (
                <li key={sheet.id}>
                  <button type="button" className="mc-load-main" onClick={() => load(sheet)}>
                    <strong>{sheet.name}</strong>
                    <small>상품 {sheet.rows.length}개 · {savedAtLabel(sheet.savedAt)} 저장</small>
                  </button>
                  <button type="button" className="mc-icon-button" onClick={() => remove(sheet)} aria-label={`${sheet.name} 지우기`}><Trash2 size={16} /></button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mc-empty-text">아직 저장한 계산표가 없어요.</p>
          )}
        </div>
      )}
      <div className="mc-summary">
        <div><span>담은 상품</span><strong>{summary.count.toLocaleString("ko-KR")}<small>개</small></strong></div>
        <div><span>평균 마진율</span><strong>{summary.averageRate === null ? "-" : formatRate(summary.averageRate)}</strong></div>
        <div><span>예상 이익 합계</span><strong>{formatWon(summary.totalProfit)}</strong><small>수량 × 1개당 이익</small></div>
        <div className={summary.lowCount ? "is-warning" : undefined}><span>마진 {LOW_MARGIN_RATE}% 미만</span><strong>{summary.lowCount.toLocaleString("ko-KR")}<small>개</small></strong></div>
        <div className="is-best"><span>가장 많이 남는 상품</span><strong className="mc-best-name">{summary.best ? summary.best.row.name : "-"}</strong>{summary.best && <small>{formatRate(summary.best.result.marginRate)} · {formatWon(summary.best.result.profit)}</small>}</div>
      </div>
      {rows.length ? (
        <div className="mc-table-wrap">
          <table className="mc-table">
            <thead>
              <tr>
                <th>상품</th>
                <th>판매가</th>
                <th>매입가</th>
                <th>배송비</th>
                <th>수수료</th>
                <th>판매이익</th>
                <th>마진율</th>
                <th>손익분기 ROAS</th>
                <th>수량</th>
                <th>예상 이익</th>
                <th><span className="sr-only">관리</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const result = computeMargin(row);
                const market = findMarket(row.marketId);
                return (
                  <tr key={row.id} className={`${editingId === row.id ? "is-editing" : ""}${result && result.marginRate < LOW_MARGIN_RATE ? " is-low" : ""}`.trim() || undefined}>
                    <td className="mc-cell-name"><strong>{row.name}</strong><small>{market?.short ?? "직접 입력"}{row.vat ? " · 부가세 반영" : ""}</small></td>
                    <td data-label="판매가">{formatWon(row.salePrice ?? 0)}</td>
                    <td data-label="매입가">{formatWon(row.cost ?? 0)}</td>
                    <td data-label="배송비" className="mc-cell-two"><span>받은 {formatWon(row.shippingIn ?? 0)}</span><span>보낸 {formatWon(row.shippingOut ?? 0)}</span></td>
                    <td data-label="수수료" className="mc-cell-two"><span>판매 {row.feeRate ?? 0}%</span><span>배송비 {row.shipFeeRate ?? 0}%</span></td>
                    <td data-label="판매이익" className={result && result.profit < 0 ? "is-negative" : undefined}><b>{result ? formatWon(result.profit) : "-"}</b></td>
                    <td data-label="마진율" className="mc-cell-rate"><b className={result && result.profit < 0 ? "is-negative" : undefined}>{result ? formatRate(result.marginRate) : "-"}</b></td>
                    <td data-label="손익분기 ROAS">{result?.breakEvenRoas ? `${result.breakEvenRoas.toLocaleString("ko-KR")}%` : "-"}</td>
                    <td data-label="수량" className="mc-cell-qty">
                      <input type="text" inputMode="numeric" aria-label={`${row.name} 예상 판매 수량`} value={row.quantity === null ? "" : String(row.quantity)} placeholder="1" onChange={(event) => setQuantity(row.id, parseMoneyText(event.target.value))} />
                    </td>
                    <td data-label="예상 이익">{result ? formatWon(result.profit * rowQuantity(row)) : "-"}</td>
                    <td className="mc-cell-actions">
                      <button type="button" className="mc-icon-button" onClick={() => onEdit(row)} aria-label={`${row.name} 계산기에서 고치기`}><PencilLine size={16} /></button>
                      <button type="button" className="mc-icon-button" onClick={() => onRows(rows.filter((item) => item.id !== row.id))} aria-label={`${row.name} 계산표에서 빼기`}><Trash2 size={16} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mc-sheet-empty">
          <Calculator size={28} aria-hidden="true" />
          <strong>아직 담은 상품이 없어요</strong>
          <p>여러 상품을 담으면 마진율·예상 이익을 한눈에 비교하고, 이름을 붙여 저장할 수 있어요.</p>
        </div>
      )}
    </section>
  );
}

// ---------- 공용 상태(이 기기 저장) ----------

function useMarginState(prefill?: MarginPrefill | null) {
  const [overrides, setOverridesState] = useState<MarketRates>(() => loadFeeOverrides());
  const [draft, setDraft] = useState<MarginDraft>(() => {
    const base = loadDraft(loadFeeOverrides());
    return prefill ? applyPrefill(base, prefill) : base;
  });
  useEffect(() => {
    const timer = window.setTimeout(() => saveDraft(draft), 250);
    return () => window.clearTimeout(timer);
  }, [draft]);
  const setOverrides = (next: MarketRates) => {
    setOverridesState(next);
    saveFeeOverrides(next);
  };
  return { overrides, setOverrides, draft, setDraft };
}

// ---------- 팝업 ----------

export function MarginCalculatorModal({ prefill, onClose }: { prefill: MarginPrefill | null; onClose: () => void }) {
  const navigate = useNavigate();
  const titleId = useId();
  const { overrides, setOverrides, draft, setDraft } = useMarginState(prefill);
  const sectionRef = useRef<HTMLElement>(null);
  // 단가표 화면은 시계 때문에 1초마다 다시 그려져 onClose가 매번 새 함수로 옵니다. 포커스 옮기기는 처음 열 때 한 번만 해야
  // 판매처 목록·입력칸이 1초마다 닫히지 않습니다(2026-11-14 수정: 예전에는 [onClose]마다 팝업 테두리로 포커스를 가져감).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    sectionRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);
  const openPage = () => {
    saveDraft(draft);
    onClose();
    navigate("/margin");
  };
  const addToSheet = () => {
    const rows = loadSheetRows();
    if (rows.length >= MARGIN_LIMITS.rows) {
      toast.error(`계산표에는 ${MARGIN_LIMITS.rows}개까지 담을 수 있어요.`);
      return;
    }
    const next = [...rows, draftToRow(draft)];
    if (!saveSheetRows(next)) {
      toast.error("이 브라우저에서는 저장할 수 없어요(개인정보 보호 모드 등).");
      return;
    }
    toast.success(`계산표에 담았어요 (${next.length}개)`, { action: { label: "계산표 보기", onClick: openPage } });
  };
  return (
    <div className="public-modal-backdrop is-sheet mc-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section ref={sectionRef} tabIndex={-1} className="public-modal mc-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="public-modal-close" onClick={onClose} aria-label="마진계산기 닫기"><X size={20} /></button>
        <header className="mc-modal-head">
          <span className="mc-modal-icon" aria-hidden="true"><Calculator size={22} /></span>
          <div>
            <span className="section-kicker">MARGIN CALCULATOR</span>
            <h2 id={titleId}>마진계산기</h2>
            <p>판매가·공급가·마켓 수수료·배송비를 넣으면 남는 돈을 바로 계산해요.</p>
          </div>
        </header>
        <MarginCalculatorCard draft={draft} onDraft={setDraft} overrides={overrides} onOverrides={setOverrides} variant="modal" onAddToSheet={addToSheet} />
        <button type="button" className="mc-modal-foot" onClick={openPage}>
          <span><b>마켓별 비교 · 계산표 저장</b>은 마진계산기 화면에서 볼 수 있어요</span>
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </section>
    </div>
  );
}

// ---------- 화면(/margin) ----------

export function MarginCalculatorPage() {
  const { overrides, setOverrides, draft, setDraft } = useMarginState();
  const [rows, setRowsState] = useState<MarginRow[]>(() => loadSheetRows());
  const [editingId, setEditingId] = useState<string | null>(null);
  const calculatorRef = useRef<HTMLDivElement>(null);
  const setRows = (next: MarginRow[]) => {
    setRowsState(next);
    if (editingId && !next.some((row) => row.id === editingId)) setEditingId(null);
    if (!saveSheetRows(next)) toast.error("이 브라우저에서는 저장할 수 없어요(개인정보 보호 모드 등).");
  };
  const addToSheet = () => {
    if (editingId) {
      const existing = rows.find((row) => row.id === editingId);
      setRows(rows.map((row) => (row.id === editingId ? draftToRow(draft, row.id, existing?.quantity ?? 1) : row)));
      setEditingId(null);
      toast.success("계산표를 고쳤어요.");
      return;
    }
    if (rows.length >= MARGIN_LIMITS.rows) {
      toast.error(`계산표에는 ${MARGIN_LIMITS.rows}개까지 담을 수 있어요.`);
      return;
    }
    setRows([...rows, draftToRow(draft)]);
    toast.success(`계산표에 담았어요 (${rows.length + 1}개)`);
  };
  const edit = (row: MarginRow) => {
    setDraft(rowToDraft(row, draft));
    setEditingId(row.id);
    calculatorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const pickMarket = (marketId: string) => {
    const market = findMarket(marketId);
    if (!market) return;
    const rates = marketRates(market, overrides);
    setDraft({ ...draft, marketId: market.id, feeRate: rates.feeRate, shipFeeRate: rates.shipFeeRate });
  };
  return (
    <PageFrame>
      <main className="content-page margin-page">
        <div className="content-hero mc-hero">
          <span className="section-kicker">MARGIN CALCULATOR</span>
          <h1>마진계산기</h1>
          <p>판매가 · 두고푸드 공급가 · 마켓 수수료 · 배송비를 넣으면 정산금액과 남는 돈(마진율)을 바로 계산해요.</p>
          <ul className="mc-hero-points">
            <li>두고푸드 상품을 고르면 공급가·배송비가 바로 들어가요</li>
            <li>목표 마진에 맞는 판매가를 거꾸로 구해요</li>
            <li>마켓별로 남는 돈을 비교해요</li>
            <li>여러 상품을 계산표로 저장·엑셀로 받아요</li>
          </ul>
        </div>
        <div className="mc-layout">
          <div ref={calculatorRef} className="mc-main">
            {editingId && <p className="mc-editing-note"><PencilLine size={15} aria-hidden="true" /> 계산표의 "{rows.find((row) => row.id === editingId)?.name}"을(를) 고치는 중이에요.</p>}
            <MarginCalculatorCard
              draft={draft}
              onDraft={setDraft}
              overrides={overrides}
              onOverrides={setOverrides}
              variant="page"
              editingRow={Boolean(editingId)}
              onAddToSheet={addToSheet}
              onCancelEdit={() => setEditingId(null)}
            />
          </div>
          <aside className="mc-side">
            <MarketCompare draft={draft} overrides={overrides} onPick={pickMarket} />
            <section className="mc-panel mc-tips" aria-labelledby="mc-tips-title">
              <h2 id="mc-tips-title">이렇게 쓰면 편해요</h2>
              <ul>
                <li><b>단가표 마진율 칸의 "계산"</b>을 누르면 그 상품 공급가·배송비가 들어간 계산기가 열려요.</li>
                <li><b>판매가가 자율인 상품</b>은 목표 마진(예: 30%)을 골라 알맞은 판매가부터 정해 보세요.</li>
                <li><b>수수료를 고치면</b> 그 마켓 값으로 이 기기에 기억해요. "기본값으로"를 누르면 되돌려요.</li>
                <li>찾는 상품이 없으면 <Link to="/sourcing">소싱 요청</Link>을 남겨 주세요.</li>
              </ul>
            </section>
          </aside>
        </div>
        <MarginSheetPanel rows={rows} onRows={setRows} onEdit={edit} editingId={editingId} />
        <p className="encyclopedia-note mc-note">수수료 기본값은 2026년 11월 공개 자료로 정한 참고값이에요. 실제 정산은 각 마켓 판매자센터의 정산 내역을 따르세요. 계산 내용은 이 기기 브라우저에만 저장되고 서버로 보내지 않아요.</p>
      </main>
    </PageFrame>
  );
}
