// 공개 단가표 상품 카드 + 옵션 팝업(2026-11-21 관리자 요청).
// 두고푸드는 사이즈·등급마다 상품을 따로 등록하고(발주오라 상품코드 1:1), 관리자 "옵션 묶음"으로 묶은 상품은
// 카드 하나로 보여 줍니다. 카드를 누르면 팝업에서 전체 옵션(일반공급가·수강생 단가·상태), 상품 안내, 배송 안내,
// 상세페이지·사진 자료, 최근 7일 가격 흐름(이전·현재 공급가 + 그래프), 이 상품 엑셀 다운로드를 봅니다.
// 묶지 않은 상품은 옵션 1개짜리 카드입니다. 원가·매입처는 다루지 않습니다.
import { type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Ban, CalendarRange, Calculator, ChevronRight, CircleHelp, Download, Layers, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { SUPPLY_STATUS_LABELS, supplyStatus, type SupplyStatus } from "@/lib/supply-status";
import { seasonApplies } from "@repo/shared/supply-status";
import { GENERAL_PRICE_LABEL, STUDENT_PRICE_LABEL, optionLabelsFor, type ProductOptionsDetail, type PublicProductGroup } from "@repo/shared/product-groups";
import { formatMarginRate, saleMargin } from "@/lib/sale-margin";
import { openMarginCalculator } from "@/lib/margin-open";
import { representativeFee } from "@/lib/shipping-rates";
import { ProductThumb, effectiveAPrice, formatPrice, productImageSrc, salePriceLabel, seasonLabel, shippingFeeSummary, shippingInfoRows } from "./catalog-format";
import type { CatalogData, Product, PublicShippingPolicy } from "./types";
import "./product-cards.css";

export type CatalogCard = {
  key: string;
  group: PublicProductGroup | null;
  name: string;
  categoryId: string;
  // 옵션(=상품) 목록과 옵션 이름. 묶지 않은 상품은 자기 자신 하나입니다.
  options: Product[];
  labels: string[];
  // 목록에서 이 카드를 만든 상품(신규 배지 등)
  lead: Product;
  // 카드 이미지로 쓸 상품(묶음 대표 이미지가 없을 때)
  imageProduct: Product;
};

// 보여 줄 상품(필터·검색 결과, 진열 순서) → 카드. 묶음은 그 묶음 상품이 목록에 처음 나온 자리에 한 번만 놓고,
// 옵션은 전체 상품(allProducts)에서 묶음 순서대로 모읍니다.
export function buildCatalogCards(visible: Product[], allProducts: Product[], groups?: PublicProductGroup[]): CatalogCard[] {
  const byId = new Map(allProducts.map((product) => [product.id, product]));
  for (const product of visible) if (!byId.has(product.id)) byId.set(product.id, product);
  const groupOf = new Map<string, PublicProductGroup>();
  for (const group of groups ?? []) {
    for (const productId of group.productIds) if (!groupOf.has(productId)) groupOf.set(productId, group);
  }
  const cards: CatalogCard[] = [];
  const seen = new Set<string>();
  for (const product of visible) {
    const group = groupOf.get(product.id) ?? null;
    const key = group ? `group:${group.id}` : product.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const options = group ? group.productIds.map((id) => byId.get(id)).filter((item): item is Product => Boolean(item)) : [product];
    if (options.length === 0) options.push(product);
    const labels = optionLabelsFor(options.map((option) => option.name), options.map((option) => group?.optionLabels?.[option.id]));
    cards.push({
      key,
      group,
      name: group?.name ?? product.name,
      categoryId: group?.categoryId || product.categoryId,
      options,
      labels,
      lead: product,
      imageProduct: options.find((option) => productImageSrc(option)) ?? product
    });
  }
  return cards;
}

export function catalogOptionCount(cards: CatalogCard[]) {
  return cards.reduce((total, card) => total + card.options.length, 0);
}

type OptionSummary = { index: number; product: Product; label: string; status: SupplyStatus; general: number; student: number };

function summarizeOptions(card: CatalogCard, categories: CatalogData["categories"], currentMonth: number) {
  const categoryName = (product: Product) => categories.find((category) => category.id === product.categoryId)?.name;
  const options: OptionSummary[] = card.options.map((product, index) => ({
    index,
    product,
    label: card.labels[index],
    status: supplyStatus(product, seasonApplies(product, categoryName(product)), currentMonth),
    general: product.generalPrice,
    student: effectiveAPrice(product.aPrice, product.generalPrice)
  }));
  const status: SupplyStatus = options.some((option) => option.status === "on_sale") ? "on_sale" : options.some((option) => option.status === "season_ended") ? "season_ended" : "sold_out";
  // "N원 부터": 판매중 옵션이 있으면 그중 가장 낮은 값, 없으면 전체에서 가장 낮은 값
  const pool = options.filter((option) => option.status === "on_sale");
  const candidates = pool.length > 0 ? pool : options;
  const generalBasis = candidates.reduce((lowest, option) => option.general < lowest.general ? option : lowest, candidates[0]);
  const studentBasis = candidates.reduce((lowest, option) => option.student < lowest.student ? option : lowest, candidates[0]);
  const varies = new Set(options.map((option) => option.general)).size > 1 || new Set(options.map((option) => option.student)).size > 1;
  return { options, status, generalBasis, studentBasis, varies };
}

type GridProps = {
  cards: CatalogCard[];
  categories: CatalogData["categories"];
  policyById: Map<string, PublicShippingPolicy>;
  currentMonth: number;
  onShipping: (info: { product: Product; policy?: PublicShippingPolicy }) => void;
  renderBadge?: (product: Product) => ReactNode;
};

// 상품 카드 목록(PC 4칸 → 태블릿 2~3칸 → 모바일 1칸). 단가표·신규상품·백과사전이 같이 씁니다.
export function CatalogProductGrid({ cards, categories, policyById, currentMonth, onShipping, renderBadge }: GridProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const openCard = cards.find((card) => card.key === openKey) ?? null;
  useEffect(() => {
    if (openKey && !cards.some((card) => card.key === openKey)) setOpenKey(null);
  }, [cards, openKey]);
  return (
    <>
      <div className="product-card-grid">
        {cards.map((card) => (
          <ProductCard key={card.key} card={card} categories={categories} policyById={policyById} currentMonth={currentMonth} onOpen={() => setOpenKey(card.key)} onShipping={onShipping} renderBadge={renderBadge} />
        ))}
      </div>
      {openCard && (
        <ProductOptionsModal card={openCard} categories={categories} policyById={policyById} currentMonth={currentMonth} onShipping={onShipping} onClose={() => setOpenKey(null)} />
      )}
    </>
  );
}

function ProductCard({ card, categories, policyById, currentMonth, onOpen, onShipping, renderBadge }: Omit<GridProps, "cards"> & { card: CatalogCard; onOpen: () => void }) {
  const summary = summarizeOptions(card, categories, currentMonth);
  const first = card.options[0];
  const categoryName = categories.find((category) => category.id === card.categoryId)?.name ?? categories.find((category) => category.id === first.categoryId)?.name;
  const policy = first.shippingPolicyId ? policyById.get(first.shippingPolicyId) : undefined;
  const shipping = shippingFeeSummary(first, policy);
  const multi = card.options.length > 1;
  const basis = summary.studentBasis.product;
  const allAutonomous = card.options.every((option) => option.salePriceMode !== "fixed");
  const margin = !multi && first.salePriceMode === "fixed" ? saleMargin(summary.studentBasis.student, first.salePrice) : null;
  const saleText = allAutonomous ? "자율" : multi ? "옵션별 지정" : salePriceLabel(first.salePriceMode, first.salePrice).main;
  const origins = [...new Set(card.options.map((option) => option.origin?.trim()).filter(Boolean))];
  const unavailable = summary.status !== "on_sale";
  return (
    <article className={`product-card is-${summary.status}`}>
      <button type="button" className="product-card-media" onClick={onOpen} aria-label={`${card.name} 옵션·가격 보기`}>
        <ProductThumb product={card.imageProduct} src={card.group?.imageUrl} className="product-card-image" size={360} alt="" />
        <span className={`product-card-status is-${summary.status}`}>{summary.status === "sold_out" && <Ban size={12} strokeWidth={2.6} aria-hidden="true" />}{SUPPLY_STATUS_LABELS[summary.status]}{summary.status !== "on_sale" && <em> · 주문 불가</em>}</span>
        {multi && <span className="product-card-count"><Layers size={12} aria-hidden="true" /> 옵션 {card.options.length}</span>}
      </button>
      <div className="product-card-body">
        <div className="product-card-tags">
          {renderBadge?.(card.lead)}
          <span className={`delivery-badge ${first.shippingType}`}>{first.shippingType === "domestic" ? "국내배송" : "해외배송"}</span>
          {categoryName && <span className="product-card-category">{categoryName}</span>}
        </div>
        <h3 className="product-card-title"><button type="button" onClick={onOpen}>{card.name}</button></h3>
        {origins.length > 0 && <p className="product-card-origin">{origins.join(" · ")}</p>}
        <div className="product-card-meta">
          <button type="button" className={`shipping-fee-button ${shipping.kind}`} onClick={() => onShipping({ product: first, policy })} aria-label={`${card.name} 배송비 안내 보기`}><span className="shipping-fee-text">배송비 <b>{shipping.text}</b></span><CircleHelp size={14} aria-hidden="true" /></button>
          <span className="season-badge"><CalendarRange size={12} aria-hidden="true" /> {seasonLabel(first, categoryName)}</span>
        </div>
        <dl className={`product-card-prices${unavailable ? " is-muted" : ""}`}>
          <div className="is-general">
            <dt>{GENERAL_PRICE_LABEL}</dt>
            <dd><b>{summary.generalBasis.general.toLocaleString("ko-KR")}</b>원{summary.varies && <small>부터</small>}</dd>
            {multi && <p>{summary.generalBasis.label} 기준</p>}
          </div>
          <div className="is-student">
            <dt>{STUDENT_PRICE_LABEL}</dt>
            <dd><b>{summary.studentBasis.student.toLocaleString("ko-KR")}</b>원{summary.varies && <small>부터</small>}</dd>
            {multi && <p>{summary.studentBasis.label} 기준</p>}
          </div>
        </dl>
        <div className="product-card-sale">
          <span>판매가 <b className={allAutonomous ? "is-autonomous" : ""}>{saleText}</b></span>
          {margin && <span className={`product-card-margin${margin.rate < 0 ? " is-negative" : ""}`}>마진 <b>{formatMarginRate(margin.rate)}</b></span>}
          <button
            type="button"
            className="margin-calc-button"
            onClick={() => openMarginCalculator({ productId: basis.id, name: multi ? `${card.name} · ${summary.studentBasis.label}` : card.name, aPrice: summary.studentBasis.student, generalPrice: basis.generalPrice, salePrice: basis.salePriceMode === "fixed" ? basis.salePrice : null, shippingOut: policy ? representativeFee(policy) : null })}
            aria-label={`${card.name} 마진계산기로 계산하기`}
          >
            <Calculator size={13} aria-hidden="true" /> 계산
          </button>
        </div>
        <button type="button" className="product-card-open" onClick={onOpen}>
          <span>{multi ? `전체 옵션 ${card.options.length}개 · 상품 안내` : "가격 흐름 · 상품 안내 보기"}</span><ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
      {card.group?.materialsUrl && (
        <a className="product-card-foot" href={card.group.materialsUrl} target="_blank" rel="noopener noreferrer">상세페이지 · 사진 자료 <ArrowUpRight size={15} aria-hidden="true" /></a>
      )}
    </article>
  );
}

// ── 옵션 팝업 ────────────────────────────────────────────────────────

function seoulDay(value: string) {
  const normalized = value.length === 10 ? `${value}T00:00:00+09:00` : value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const time = new Date(normalized).getTime();
  return Number.isNaN(time) ? "" : new Date(time + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function shortDay(day: string) {
  return day ? `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}` : "";
}

function downloadName(header: string | null, fallback: string) {
  const match = header?.match(/filename\*=UTF-8''([^;]+)/i);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

type ModalProps = {
  card: CatalogCard;
  categories: CatalogData["categories"];
  policyById: Map<string, PublicShippingPolicy>;
  currentMonth: number;
  onShipping: (info: { product: Product; policy?: PublicShippingPolicy }) => void;
  onClose: () => void;
};

export function ProductOptionsModal({ card, categories, policyById, currentMonth, onShipping, onClose }: ModalProps) {
  const titleId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const summary = useMemo(() => summarizeOptions(card, categories, currentMonth), [card, categories, currentMonth]);
  const [selectedId, setSelectedId] = useState(() => summary.generalBasis.product.id);
  const [detail, setDetail] = useState<ProductOptionsDetail | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "failed">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const first = card.options[0];
  const categoryName = categories.find((category) => category.id === card.categoryId)?.name;
  const policy = first.shippingPolicyId ? policyById.get(first.shippingPolicyId) : undefined;

  useEffect(() => {
    let active = true;
    setLoadState("loading");
    void apiFetch(`/catalog/options/${encodeURIComponent(card.lead.id)}`, { auth: false, silent: true })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: ProductOptionsDetail } | null;
        if (!active) return;
        if (response.ok && payload?.ok && payload.data) {
          setDetail(payload.data);
          setLoadState("ready");
        } else {
          setLoadState("failed");
        }
      })
      .catch(() => { if (active) setLoadState("failed"); });
    return () => { active = false; };
  }, [card.lead.id, reloadKey]);

  // 열려 있는 동안 뒤 화면이 스크롤되지 않게 하고, 닫으면 원래대로 돌립니다. Esc는 맨 위 팝업일 때만 닫습니다.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sectionRef.current?.focus({ preventScroll: true });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const dialogs = Array.from(document.querySelectorAll('[aria-modal="true"]'));
      if (dialogs[dialogs.length - 1] === sectionRef.current || dialogs.length === 0) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  const download = async () => {
    setDownloading(true);
    try {
      const response = await apiFetch(`/catalog/options/${encodeURIComponent(card.lead.id)}/export`, { auth: false, silent: true });
      if (!response.ok) throw new Error("상품 엑셀을 만들지 못했습니다.");
      const blob = await response.blob();
      const filename = downloadName(response.headers.get("Content-Disposition"), `두고푸드_${card.name}_공급가.xlsx`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("상품 엑셀을 내려받았습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "상품 엑셀을 내려받지 못했습니다.");
    } finally {
      setDownloading(false);
    }
  };

  const group = detail?.group ?? null;
  const description = group?.description?.trim()
    || [first.notes?.trim(), first.packaging?.trim() ? `포장: ${first.packaging.trim()}` : ""].filter(Boolean).join("\n");
  const shippingLines = [
    group?.shippingNote?.trim(),
    ...shippingInfoRows(first, policy).filter(([label]) => label !== "배송비 유형").map(([label, value]) => `${label}: ${value.replace(/\n/g, " / ")}`),
    first.releaseInfo?.trim() ? `출고 안내: ${first.releaseInfo.trim()}` : ""
  ].filter((line): line is string => Boolean(line));
  const materialsUrl = group?.materialsUrl ?? card.group?.materialsUrl ?? null;
  const selected = summary.options.find((option) => option.product.id === selectedId) ?? summary.options[0];
  const trend = detail?.trends[selected.product.id];
  const days = detail?.days ?? [];
  const anyFixedSale = card.options.some((option) => option.salePriceMode === "fixed");

  return createPortal(
    <div className="public-modal-backdrop product-options-backdrop" role="presentation" onMouseDown={onClose}>
      <section ref={sectionRef} tabIndex={-1} className="product-options-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()}>
        <header className="product-options-head">
          <ProductThumb product={card.imageProduct} src={card.group?.imageUrl} className="product-options-thumb" size={56} alt="" />
          <div className="product-options-title">
            <span>{[first.shippingType === "domestic" ? "국내배송" : "해외배송", categoryName].filter(Boolean).join(" · ")}</span>
            <h2 id={titleId}>{card.name}</h2>
          </div>
          <button type="button" className="product-options-close" onClick={onClose} aria-label="옵션 팝업 닫기">닫기 <X size={16} aria-hidden="true" /></button>
        </header>
        <div className="product-options-body">
          <section className="product-options-section" aria-labelledby={`${titleId}-options`}>
            <div className="product-options-section-head">
              <h3 id={`${titleId}-options`}>전체 옵션 <small>전체 {card.options.length}개</small></h3>
              <button type="button" className="product-options-excel" onClick={() => void download()} disabled={downloading}>
                <Download size={15} aria-hidden="true" /> {downloading ? "만드는 중…" : "이 상품 엑셀 다운로드"}
              </button>
            </div>
            <div className="product-options-table-wrap">
              <table className="product-options-table">
                <thead><tr><th scope="col">옵션</th><th scope="col">{GENERAL_PRICE_LABEL}</th><th scope="col">{STUDENT_PRICE_LABEL}</th><th scope="col">상태</th></tr></thead>
                <tbody>
                  {summary.options.map((option) => {
                    const fixedMargin = option.product.salePriceMode === "fixed" ? saleMargin(option.student, option.product.salePrice) : null;
                    const isSelected = option.product.id === selected.product.id;
                    return (
                      <tr key={option.product.id} className={`${isSelected ? "is-selected " : ""}is-${option.status}`} onClick={() => setSelectedId(option.product.id)}>
                        <th scope="row">
                          <button type="button" className="product-option-name" aria-pressed={isSelected} onClick={(event) => { event.stopPropagation(); setSelectedId(option.product.id); }}>{option.label}</button>
                          {option.product.salePriceMode === "fixed" && <small>지정 판매가 {formatPrice(option.product.salePrice)}{fixedMargin ? ` · 마진 ${formatMarginRate(fixedMargin.rate)}` : ""}</small>}
                        </th>
                        <td className="is-general">{formatPrice(option.general)}</td>
                        <td className="is-student">{formatPrice(option.student)}</td>
                        <td><span className={`product-option-status is-${option.status}`}>{SUPPLY_STATUS_LABELS[option.status]}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="product-options-hint">{anyFixedSale ? "지정 판매가가 있는 옵션은 옵션 이름 아래에 적었어요." : "판매가는 판매자가 자율로 정합니다."} 옵션을 누르면 아래 가격 흐름이 그 옵션으로 바뀝니다.</p>
          </section>

          <section className="product-options-section">
            <h3>상품 안내 및 참고사항</h3>
            {loadState === "loading" && !description ? <p className="product-options-muted">불러오는 중…</p> : <p className="product-options-text">{description || "등록된 상품 안내가 없습니다."}</p>}
          </section>

          <section className="product-options-section">
            <div className="product-options-section-head">
              <h3>배송 안내</h3>
              <button type="button" className="product-options-link-button" onClick={() => onShipping({ product: first, policy })}>배송비 자세히 <ChevronRight size={14} aria-hidden="true" /></button>
            </div>
            <ul className="product-options-lines">{shippingLines.map((line) => <li key={line}>{line}</li>)}</ul>
          </section>

          {materialsUrl && (
            <a className="product-options-materials" href={materialsUrl} target="_blank" rel="noopener noreferrer">상세페이지·사진 자료 열기 <ArrowUpRight size={16} aria-hidden="true" /></a>
          )}

          <section className="product-options-section product-options-trend" aria-labelledby={`${titleId}-trend`}>
            <div className="product-options-section-head">
              <div>
                <h3 id={`${titleId}-trend`}>최근 7일 가격 흐름</h3>
                {days.length > 0 && <span className="product-options-range">{days[0]} ~ {days[days.length - 1]}</span>}
              </div>
            </div>
            {card.options.length > 1 && (
              <label className="product-options-select">
                <span>확인할 옵션</span>
                <select value={selected.product.id} onChange={(event) => setSelectedId(event.target.value)}>
                  {summary.options.map((option) => <option key={option.product.id} value={option.product.id}>{option.label}</option>)}
                </select>
              </label>
            )}
            {loadState === "failed" ? (
              <div className="product-options-error" role="status">
                <span>가격 흐름을 불러오지 못했어요.</span>
                <button type="button" onClick={() => setReloadKey((value) => value + 1)}><RefreshCw size={14} aria-hidden="true" /> 다시 불러오기</button>
              </div>
            ) : !trend ? (
              <p className="product-options-muted">가격 흐름을 불러오는 중…</p>
            ) : (
              <>
                <div className="price-step-cards">
                  <article className="price-step-card is-previous">
                    <h4>이전 공급가</h4>
                    <small>{trend.previous ? `${shortDay(seoulDay(trend.previous.changedAt))} 변경 전` : "이전 기록 없음"}</small>
                    {trend.previous ? (
                      <dl>
                        <div><dt>{GENERAL_PRICE_LABEL}</dt><dd>{formatPrice(trend.previous.general)}</dd></div>
                        <div><dt>{STUDENT_PRICE_LABEL}</dt><dd>{formatPrice(trend.previous.student)}</dd></div>
                      </dl>
                    ) : <p>기록 없음</p>}
                  </article>
                  <article className="price-step-card is-current">
                    <h4>현재 공급가</h4>
                    <small>{trend.current.since} 기준</small>
                    <dl>
                      <div className="is-lead"><dt>{GENERAL_PRICE_LABEL}</dt><dd>{formatPrice(trend.current.general)}</dd></div>
                      <div><dt>{STUDENT_PRICE_LABEL}</dt><dd>{formatPrice(trend.current.student)}</dd></div>
                    </dl>
                  </article>
                </div>
                <PriceTrendChart
                  days={days}
                  series={[
                    { key: "general", label: GENERAL_PRICE_LABEL, values: trend.general, color: "#2a78d6" },
                    { key: "student", label: STUDENT_PRICE_LABEL, values: trend.student, color: "#008300", dash: "6 4" }
                  ]}
                />
                <p className="product-options-footnote">그래프는 오늘까지 실제로 적용된 하루 마감 가격입니다. 이전 공급가는 마지막 가격 변경 직전 가격이에요.</p>
              </>
            )}
          </section>
        </div>
      </section>
    </div>,
    document.body
  );
}

// ── 가격 흐름 그래프(SVG): 일반공급가 실선 · 수강생 단가 점선, 날짜 위치에 맞춰 십자선 + 툴팁 ──

type TrendSeries = { key: string; label: string; values: number[]; color: string; dash?: string };

function niceStep(raw: number) {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const base = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / base;
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10) * base;
}

export function niceScale(minValue: number, maxValue: number, count = 4) {
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return { min: 0, max: 1, ticks: [0, 1] };
  let low = minValue;
  let high = maxValue;
  if (low === high) {
    const pad = Math.max(100, niceStep(Math.abs(low) * 0.03));
    low -= pad;
    high += pad;
  }
  const step = niceStep((high - low) / (count - 1));
  const min = Math.floor(low / step) * step;
  const max = Math.ceil(high / step) * step;
  const ticks: number[] = [];
  for (let value = min; value <= max + step / 2; value += step) ticks.push(Math.round(value));
  return { min, max: max === min ? min + step : max, ticks };
}

function useElementWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const measured = Math.round(element.getBoundingClientRect().width);
      setWidth(measured > 0 ? Math.max(220, measured) : fallback);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fallback]);
  return [ref, width] as const;
}

function PriceTrendChart({ days, series }: { days: string[]; series: TrendSeries[] }) {
  const [wrapRef, width] = useElementWidth(320);
  const [active, setActive] = useState<number | null>(null);
  const height = 200;
  const margin = { top: 14, right: 16, bottom: 30, left: 56 };
  const plotWidth = Math.max(120, width - margin.left - margin.right);
  const plotHeight = height - margin.top - margin.bottom;
  const values = series.flatMap((item) => item.values);
  const scale = niceScale(Math.min(...values), Math.max(...values));
  const x = (index: number) => margin.left + (days.length <= 1 ? plotWidth / 2 : (index * plotWidth) / (days.length - 1));
  const y = (value: number) => margin.top + plotHeight - ((value - scale.min) / (scale.max - scale.min)) * plotHeight;
  const labelEvery = plotWidth / Math.max(1, days.length) < 40 ? 2 : 1;
  const last = days.length - 1;
  const pickFromPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const offset = event.clientX - rect.left;
    let nearest = 0;
    for (let index = 1; index < days.length; index += 1) if (Math.abs(x(index) - offset) < Math.abs(x(nearest) - offset)) nearest = index;
    setActive(nearest);
  };
  const onKeyDown = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    if (event.key === "ArrowLeft") { event.preventDefault(); setActive((value) => Math.max(0, (value ?? last) - 1)); }
    if (event.key === "ArrowRight") { event.preventDefault(); setActive((value) => Math.min(last, (value ?? last) + 1)); }
  };
  const describe = series.map((item) => `${item.label} ${formatPrice(item.values[0])}에서 ${formatPrice(item.values[last])}`).join(", ");
  const tooltipWidth = 156;
  const tooltipLeft = active === null ? 0 : Math.min(Math.max(0, x(active) - tooltipWidth / 2), Math.max(0, width - tooltipWidth));
  return (
    <div className="price-trend">
      <div className="price-trend-legend" aria-hidden="true">
        {series.map((item) => (
          <span key={item.key}>
            <svg width="22" height="8" viewBox="0 0 22 8"><line x1="1" y1="4" x2="21" y2="4" stroke={item.color} strokeWidth="2" strokeLinecap="round" strokeDasharray={item.dash} /></svg>
            {item.label} <b>{formatPrice(item.values[last])}</b>
          </span>
        ))}
        <small>단위: 원</small>
      </div>
      <div className="price-trend-plot" ref={wrapRef}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`최근 7일 가격 흐름: ${describe}. 좌우 화살표로 날짜별 가격을 볼 수 있어요.`}
          tabIndex={0}
          onPointerMove={pickFromPointer}
          onPointerDown={pickFromPointer}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(last)}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
        >
          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line className="price-trend-grid" x1={margin.left} x2={margin.left + plotWidth} y1={y(tick)} y2={y(tick)} />
              <text className="price-trend-tick" x={margin.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">{tick.toLocaleString("ko-KR")}</text>
            </g>
          ))}
          {days.map((day, index) => ((last - index) % labelEvery === 0 ? (
            <text key={day} className="price-trend-tick" x={x(index)} y={height - 9} textAnchor="middle">{shortDay(day)}</text>
          ) : null))}
          {active !== null && <line className="price-trend-crosshair" x1={x(active)} x2={x(active)} y1={margin.top} y2={margin.top + plotHeight} />}
          {series.map((item) => (
            <path key={item.key} d={item.values.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ")} fill="none" stroke={item.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={item.dash} />
          ))}
          {series.map((item) => item.values.map((value, index) => (
            <circle key={`${item.key}-${days[index]}`} cx={x(index)} cy={y(value)} r={active === index ? 5 : 4} fill={item.color} stroke="#ffffff" strokeWidth={2} />
          )))}
        </svg>
        {active !== null && (
          <div className="price-trend-tooltip" style={{ left: tooltipLeft, width: tooltipWidth }} role="status">
            <strong>{Number(days[active].slice(5, 7))}월 {Number(days[active].slice(8, 10))}일</strong>
            {series.map((item) => (
              <span key={item.key}>
                <svg width="16" height="8" viewBox="0 0 16 8" aria-hidden="true"><line x1="1" y1="4" x2="15" y2="4" stroke={item.color} strokeWidth="2" strokeLinecap="round" strokeDasharray={item.dash ? "4 3" : undefined} /></svg>
                <b>{formatPrice(item.values[active])}</b><em>{item.label}</em>
              </span>
            ))}
          </div>
        )}
      </div>
      <details className="price-trend-table">
        <summary>날짜별 가격 표로 보기</summary>
        <table>
          <thead><tr><th scope="col">날짜</th>{series.map((item) => <th scope="col" key={item.key}>{item.label}</th>)}</tr></thead>
          <tbody>{days.map((day, index) => <tr key={day}><th scope="row">{shortDay(day)}</th>{series.map((item) => <td key={item.key}>{formatPrice(item.values[index])}</td>)}</tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}
