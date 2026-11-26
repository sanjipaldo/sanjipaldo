// 공급사 센터 > 내 상품: 두고푸드에 등록된 내 상품(매입처 = 내 공급사) 목록과
// 변경 요청(수정) · 신규 상품 등록 요청 창. 상품 값은 바로 바뀌지 않고 두고푸드 승인 후 반영됩니다.
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BadgeCheck, Boxes, CircleAlert, Clock3, ImagePlus, PackagePlus, Pencil, Search, Send, X } from "lucide-react";
import { toast } from "sonner";
import { SUPPLIER_UPDATE_FIELDS, supplierChangeRows, type SupplierProductChanges } from "@repo/shared/supplier-portal";
import { SUPPLY_STATUS_LABELS, type SupplyStatus } from "@/lib/supply-status";
import {
  digitsOnly,
  parseDigits,
  productStatus,
  seasonText,
  seoulMonthNumber,
  supplierGet,
  supplierPost,
  uploadSupplierImage,
  won,
  type SupplierCategory,
  type SupplierProduct,
  type SupplierRequestItem
} from "./supplier-api";
import { ChangeRowList, RequestStatusPill, SupplierPager, SupplierPageSize, useSupplierPaging } from "./supplier-ui";

// ── 입력 값 ─────────────────────────────────────────────────────────────
type ProductDraft = {
  name: string;
  origin: string;
  imageUrl: string;
  costPrice: string;
  salePriceMode: "autonomous" | "fixed";
  salePrice: string;
  isAlwaysOnSale: boolean;
  saleStartMonth: string;
  saleEndMonth: string;
  isSoldOut: boolean;
};

const EMPTY_DRAFT: ProductDraft = {
  name: "",
  origin: "",
  imageUrl: "",
  costPrice: "",
  salePriceMode: "autonomous",
  salePrice: "",
  isAlwaysOnSale: false,
  saleStartMonth: "",
  saleEndMonth: "",
  isSoldOut: false
};

function productToDraft(product: SupplierProduct): ProductDraft {
  return {
    name: product.name,
    origin: product.origin ?? "",
    imageUrl: product.imageUrl ?? "",
    costPrice: product.costPrice ? String(product.costPrice) : "0",
    salePriceMode: product.salePriceMode === "fixed" ? "fixed" : "autonomous",
    salePrice: product.salePrice ? String(product.salePrice) : "",
    isAlwaysOnSale: product.isAlwaysOnSale,
    saleStartMonth: product.saleStartMonth ? String(product.saleStartMonth) : "",
    saleEndMonth: product.saleEndMonth ? String(product.saleEndMonth) : "",
    isSoldOut: product.isSoldOut
  };
}

// 승인 대기 중인 요청이 있으면 그 내용을 입력칸에 다시 채웁니다.
function withPendingChanges(draft: ProductDraft, changes: SupplierProductChanges): ProductDraft {
  const next = { ...draft };
  if (typeof changes.name === "string") next.name = changes.name;
  if ("origin" in changes) next.origin = changes.origin ?? "";
  if ("imageUrl" in changes) next.imageUrl = changes.imageUrl ?? "";
  if (typeof changes.costPrice === "number") next.costPrice = String(changes.costPrice);
  if (changes.salePriceMode) next.salePriceMode = changes.salePriceMode;
  if ("salePrice" in changes) next.salePrice = changes.salePrice ? String(changes.salePrice) : "";
  if (typeof changes.isAlwaysOnSale === "boolean") next.isAlwaysOnSale = changes.isAlwaysOnSale;
  if ("saleStartMonth" in changes) next.saleStartMonth = changes.saleStartMonth ? String(changes.saleStartMonth) : "";
  if ("saleEndMonth" in changes) next.saleEndMonth = changes.saleEndMonth ? String(changes.saleEndMonth) : "";
  if (typeof changes.isSoldOut === "boolean") next.isSoldOut = changes.isSoldOut;
  return next;
}

// 입력칸 → 서버로 보낼 값(판매가 자율이면 판매가 비움, 상시 판매면 판매월 비움 — 서버와 같은 규칙)
function draftValues(draft: ProductDraft) {
  const fixed = draft.salePriceMode === "fixed";
  return {
    name: draft.name.trim(),
    imageUrl: draft.imageUrl || null,
    origin: draft.origin.trim() || null,
    costPrice: parseDigits(draft.costPrice),
    salePriceMode: draft.salePriceMode,
    salePrice: fixed ? parseDigits(draft.salePrice) : null,
    isAlwaysOnSale: draft.isAlwaysOnSale,
    saleStartMonth: draft.isAlwaysOnSale || !draft.saleStartMonth ? null : Number(draft.saleStartMonth),
    saleEndMonth: draft.isAlwaysOnSale || !draft.saleEndMonth ? null : Number(draft.saleEndMonth),
    isSoldOut: draft.isSoldOut
  };
}

type DraftValues = ReturnType<typeof draftValues>;

function sameValue(first: unknown, second: unknown) {
  const normalize = (value: unknown) => (value === undefined || value === "" ? null : value);
  return normalize(first) === normalize(second);
}

// 지금 상품 값과 다른 칸만 보냅니다. 판매가(방식·금액)와 판매 기간(상시·시작·종료)은 묶어서 보냅니다.
function changedValues(values: DraftValues, base: DraftValues): SupplierProductChanges {
  const changes: Record<string, unknown> = {};
  for (const field of SUPPLIER_UPDATE_FIELDS) if (!sameValue(values[field], base[field])) changes[field] = values[field];
  const priceFields = ["salePriceMode", "salePrice"] as const;
  const seasonFields = ["isAlwaysOnSale", "saleStartMonth", "saleEndMonth"] as const;
  if (priceFields.some((field) => field in changes)) for (const field of priceFields) changes[field] = values[field];
  if (seasonFields.some((field) => field in changes)) for (const field of seasonFields) changes[field] = values[field];
  return changes as SupplierProductChanges;
}

function validateDraft(draft: ProductDraft, kind: "update" | "create") {
  const values = draftValues(draft);
  if (!values.name) return "상품명을 입력해 주세요.";
  if (values.costPrice === null || (kind === "create" && values.costPrice <= 0)) return "공급가를 입력해 주세요.";
  if (values.salePriceMode === "fixed" && !values.salePrice) return "권장 판매가를 입력해 주세요. 정하지 않으려면 '판매자 자율'을 골라 주세요.";
  if (!values.isAlwaysOnSale && Boolean(values.saleStartMonth) !== Boolean(values.saleEndMonth)) return "판매 시작월과 종료월을 함께 골라 주세요.";
  return "";
}

function priceWarning(values: DraftValues) {
  if (values.salePriceMode === "fixed" && values.salePrice && values.costPrice && values.salePrice < values.costPrice) {
    return "권장 판매가가 공급가보다 낮아요. 금액을 한 번 더 확인해 주세요.";
  }
  return "";
}

function useEscapeKey(onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, []);
}

// ── 입력 부품 ───────────────────────────────────────────────────────────
function PriceInput({ value, onChange, disabled, placeholder }: { value: string; onChange: (value: string) => void; disabled?: boolean; placeholder?: string }) {
  return (
    <span className={`sup-price-input ${disabled ? "is-disabled" : ""}`}>
      <input
        inputMode="numeric"
        autoComplete="off"
        value={value ? Number(value).toLocaleString("ko-KR") : ""}
        onChange={(event) => onChange(digitsOnly(event.target.value))}
        disabled={disabled}
        placeholder={placeholder}
      />
      <em>원</em>
    </span>
  );
}

function MonthSelect({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">월 선택</option>
      {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={String(index + 1)}>{index + 1}월</option>)}
    </select>
  );
}

function ImageField({ value, original, onChange }: { value: string; original?: string; onChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast.error("상품 이미지는 JPG 또는 PNG만 올릴 수 있어요.");
      return;
    }
    if (file.size >= 5 * 1024 * 1024) {
      toast.error("상품 이미지는 5MB보다 작아야 해요.");
      return;
    }
    setUploading(true);
    try {
      onChange(await uploadSupplierImage(file));
      toast.success("이미지를 올렸어요. 요청을 보내야 두고푸드에 전달돼요.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "이미지를 올리지 못했어요.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  return (
    <div className="sup-image-field">
      <span className="sup-image-preview">{value ? <img src={value} alt="" /> : <ImagePlus size={22} aria-hidden="true" />}</span>
      <div>
        <div className="sup-image-actions">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}><ImagePlus size={14} /> {uploading ? "올리는 중…" : value ? "이미지 바꾸기" : "이미지 올리기"}</button>
          {original !== undefined && value !== original && <button type="button" onClick={() => onChange(original)}>원래 이미지로</button>}
          {original === undefined && value && <button type="button" onClick={() => onChange("")}>이미지 빼기</button>}
        </div>
        <small>JPG·PNG, 5MB 미만. 정사각형(1:1) 사진이 단가표에서 가장 잘 보여요.</small>
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png" hidden onChange={(event) => void pick(event.target.files?.[0])} />
    </div>
  );
}

function ProductFields({ draft, update, kind, originalImage, extra }: {
  draft: ProductDraft;
  update: (patch: Partial<ProductDraft>) => void;
  kind: "update" | "create";
  originalImage?: string;
  extra?: ReactNode;
}) {
  const fixed = draft.salePriceMode === "fixed";
  return (
    <>
      <label className="full">상품명*<input value={draft.name} onChange={(event) => update({ name: event.target.value })} maxLength={200} placeholder="예: 청송 꿀사과 5kg(16~20과)" required /></label>
      <div className="sup-field full">
        <span className="sup-field-label">상품 이미지</span>
        <ImageField value={draft.imageUrl} original={kind === "update" ? originalImage ?? "" : undefined} onChange={(imageUrl) => update({ imageUrl })} />
      </div>
      <label>공급가*<PriceInput value={draft.costPrice} onChange={(costPrice) => update({ costPrice })} placeholder="1개 공급가" /><small>두고푸드에 공급하는 1개 가격이에요. 정산은 이 금액으로 계산합니다.</small></label>
      <label>원산지<input value={draft.origin} onChange={(event) => update({ origin: event.target.value })} maxLength={100} placeholder="예: 국내산(경북 청송)" /></label>
      <label>권장 판매가 방식
        <select value={draft.salePriceMode} onChange={(event) => update({ salePriceMode: event.target.value === "fixed" ? "fixed" : "autonomous" })}>
          <option value="autonomous">판매자 자율</option>
          <option value="fixed">지정 판매가</option>
        </select>
        <small>지정 판매가로 정하면 셀러에게 이 가격으로 팔도록 안내해요.</small>
      </label>
      <label>권장 판매가{fixed ? "*" : ""}<PriceInput value={fixed ? draft.salePrice : ""} onChange={(salePrice) => update({ salePrice })} disabled={!fixed} placeholder={fixed ? "소비자 판매가" : "판매자 자율"} /><small>{fixed ? "소비자에게 파는 1개 가격이에요." : "판매자 자율이면 비워 둡니다."}</small></label>
      <div className="sup-field">
        <span className="sup-field-label">판매 기간</span>
        <div className="sup-season-row">
          <select aria-label="판매 기간 방식" value={draft.isAlwaysOnSale ? "always" : "season"} onChange={(event) => update({ isAlwaysOnSale: event.target.value === "always" })}>
            <option value="season">기간 판매</option>
            <option value="always">상시 판매</option>
          </select>
          {!draft.isAlwaysOnSale && <>
            <MonthSelect label="판매 시작월" value={draft.saleStartMonth} onChange={(saleStartMonth) => update({ saleStartMonth })} />
            <span aria-hidden="true">~</span>
            <MonthSelect label="판매 종료월" value={draft.saleEndMonth} onChange={(saleEndMonth) => update({ saleEndMonth })} />
          </>}
        </div>
        <small>제철 상품은 판매 시작월·종료월을 골라 주세요. 해를 넘기면 10월~3월처럼 고르면 됩니다.</small>
      </div>
      {kind === "update" && (
        <label>판매 상태
          <select value={draft.isSoldOut ? "soldout" : "onsale"} onChange={(event) => update({ isSoldOut: event.target.value === "soldout" })}>
            <option value="onsale">판매중</option>
            <option value="soldout">품절</option>
          </select>
          <small>품절로 바꾸면 승인 후 단가표에 품절로 표시돼요.</small>
        </label>
      )}
      {extra}
    </>
  );
}

// ── 변경 요청(수정) 창 ──────────────────────────────────────────────────
function UpdateRequestModal({ product, pending, onClose, onSaved }: {
  product: SupplierProduct;
  pending?: SupplierRequestItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const base = useMemo(() => productToDraft(product), [product]);
  const baseValues = useMemo(() => draftValues(base), [base]);
  const [draft, setDraft] = useState<ProductDraft>(() => (pending ? withPendingChanges(base, pending.changes) : base));
  const [note, setNote] = useState(pending?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEscapeKey(onClose);

  const values = draftValues(draft);
  const changes = changedValues(values, baseValues);
  const changeCount = supplierChangeRows(changes, baseValues).length;
  const warning = priceWarning(values);
  const update = (patch: Partial<ProductDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = validateDraft(draft, "update");
    if (problem) {
      setError(problem);
      return;
    }
    if (changeCount === 0) {
      setError("바뀐 내용이 없어요. 바꿀 값을 고친 뒤 보내 주세요.");
      return;
    }
    setSaving(true);
    try {
      const result = await supplierPost<{ request: SupplierRequestItem; replaced: boolean }>("/requests", {
        kind: "update",
        productId: product.id,
        changes,
        note: note.trim() || null
      });
      toast.success(result.replaced ? "승인 대기 중이던 요청을 새 내용으로 바꿨어요." : "변경 요청을 보냈어요. 두고푸드가 승인하면 반영돼요.");
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "요청을 보내지 못했어요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="editor-overlay" role="presentation" onMouseDown={onClose}>
      <form className="editor-panel sup-request-editor" role="dialog" aria-modal="true" aria-labelledby="sup-update-title" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()} noValidate>
        <div className="editor-header">
          <div><span>CHANGE REQUEST</span><h2 id="sup-update-title">상품 변경 요청</h2><p>{product.name}{product.productCode ? ` · ${product.productCode}` : ""} · 바꿀 값만 고친 뒤 보내 주세요. 두고푸드가 확인하고 승인하면 반영돼요.</p></div>
          <button type="button" onClick={onClose} aria-label="변경 요청 닫기"><X size={20} /></button>
        </div>
        <div className="editor-grid">
          {pending && <p className="sup-form-note full"><Clock3 size={15} aria-hidden="true" /> 승인 대기 중인 요청이 있어 그 내용을 불러왔어요. 다시 보내면 기존 요청이 새 내용으로 바뀝니다.</p>}
          <ProductFields draft={draft} update={update} kind="update" originalImage={product.imageUrl ?? ""} />
          <label className="full">요청 메모<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={3} placeholder="바꾸는 이유나 적용 희망일을 적어 주세요. 예: 12월 1일 출고분부터 공급가 인상" /></label>
          <section className="sup-diff-preview full" aria-live="polite">
            <h3>바뀌는 항목 <b>{changeCount}개</b></h3>
            {changeCount > 0 ? <ChangeRowList changes={changes} snapshot={baseValues} /> : <p className="sup-diff-empty">아직 바꾼 값이 없어요. 위 칸을 고치면 여기에 "지금 → 바꿀 값"이 보여요.</p>}
            {warning && <p className="sup-form-warning"><CircleAlert size={15} aria-hidden="true" /> {warning}</p>}
          </section>
        </div>
        <div className="editor-footer sup-editor-footer">
          {error && <p className="sup-form-error" role="alert">{error}</p>}
          <button type="button" onClick={onClose}>취소</button>
          <button className="primary-action" type="submit" disabled={saving}><Send size={16} /> {saving ? "보내는 중…" : "변경 요청 보내기"}</button>
        </div>
      </form>
    </div>
  );
}

// ── 신규 상품 등록 요청 창(사이드 메뉴 "상품 등록 요청") ─────────────────
export function CreateRequestModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<ProductDraft>(EMPTY_DRAFT);
  const [shippingType, setShippingType] = useState<"domestic" | "overseas">("domestic");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [categories, setCategories] = useState<SupplierCategory[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEscapeKey(onClose);

  useEffect(() => {
    let active = true;
    void supplierGet<{ categories: SupplierCategory[] }>("/categories")
      .then((data) => { if (active) setCategories(data.categories); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const values = draftValues(draft);
  const warning = priceWarning(values);
  const shippingCategories = categories.filter((category) => category.shippingType === shippingType);
  const update = (patch: Partial<ProductDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = validateDraft(draft, "create");
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      // 신규 등록은 판매 상태를 보내지 않습니다(승인하면 판매중으로 등록).
      const changes: SupplierProductChanges = {
        name: values.name,
        imageUrl: values.imageUrl,
        origin: values.origin,
        costPrice: values.costPrice ?? 0,
        salePriceMode: values.salePriceMode,
        salePrice: values.salePrice,
        isAlwaysOnSale: values.isAlwaysOnSale,
        saleStartMonth: values.saleStartMonth,
        saleEndMonth: values.saleEndMonth,
        shippingType,
        categoryId: categoryId || null,
        description: description.trim() || null
      };
      await supplierPost("/requests", {
        kind: "create",
        changes,
        note: note.trim() || null
      });
      toast.success("신규 상품 등록 요청을 보냈어요. 두고푸드가 확인 후 등록하면 내 상품에 보여요.");
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "요청을 보내지 못했어요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="editor-overlay" role="presentation" onMouseDown={onClose}>
      <form className="editor-panel sup-request-editor" role="dialog" aria-modal="true" aria-labelledby="sup-create-title" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()} noValidate>
        <div className="editor-header">
          <div><span>NEW PRODUCT REQUEST</span><h2 id="sup-create-title">신규 상품 등록 요청</h2><p>새 상품 정보를 보내 주시면 두고푸드가 확인한 뒤 상품코드·카테고리를 정해 단가표에 등록합니다.</p></div>
          <button type="button" onClick={onClose} aria-label="신규 상품 등록 요청 닫기"><X size={20} /></button>
        </div>
        <div className="editor-grid">
          <ProductFields
            draft={draft}
            update={update}
            kind="create"
            extra={<>
              <label>배송
                <select value={shippingType} onChange={(event) => { setShippingType(event.target.value === "overseas" ? "overseas" : "domestic"); setCategoryId(""); }}>
                  <option value="domestic">국내배송</option>
                  <option value="overseas">해외배송</option>
                </select>
              </label>
              <label>희망 카테고리
                <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  <option value="">두고푸드가 정해 주세요</option>
                  {shippingCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label className="full">상품 설명<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={5} placeholder="규격(중량·과수·수량), 포장, 보관 방법, 출고 가능 요일, 상세페이지·썸네일 위치 등을 적어 주세요." /><small>{description.length.toLocaleString("ko-KR")} / 2,000자</small></label>
            </>}
          />
          <label className="full">요청 메모<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={2} placeholder="두고푸드에 따로 전할 말이 있으면 적어 주세요." /></label>
          {warning && <p className="sup-form-warning full"><CircleAlert size={15} aria-hidden="true" /> {warning}</p>}
        </div>
        <div className="editor-footer sup-editor-footer">
          {error && <p className="sup-form-error" role="alert">{error}</p>}
          <button type="button" onClick={onClose}>취소</button>
          <button className="primary-action" type="submit" disabled={saving}><Send size={16} /> {saving ? "보내는 중…" : "등록 요청 보내기"}</button>
        </div>
      </form>
    </div>
  );
}

// ── 내 상품 목록 ────────────────────────────────────────────────────────
type ProductFilter = "all" | "on_sale" | "unavailable" | "pending";

function normalizeSearch(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function SupplyPill({ status }: { status: SupplyStatus }) {
  return <span className={`status-pill sup-supply is-${status}`}>{SUPPLY_STATUS_LABELS[status]}</span>;
}

export function SupplierProducts({ reloadKey, onCreate, onChanged }: { reloadKey: number; onCreate: () => void; onChanged: () => void }) {
  const [products, setProducts] = useState<SupplierProduct[] | null>(null);
  const [requests, setRequests] = useState<SupplierRequestItem[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProductFilter>("all");
  const [editing, setEditing] = useState<SupplierProduct | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const load = useCallback(async () => {
    try {
      const [productData, requestData] = await Promise.all([
        supplierGet<{ products: SupplierProduct[] }>("/products"),
        supplierGet<{ requests: SupplierRequestItem[] }>("/requests")
      ]);
      setProducts(productData.products);
      setRequests(requestData.requests);
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "상품을 불러오지 못했어요.");
    }
  }, []);

  useEffect(() => { void load(); }, [load, reloadKey]);

  // 변경 요청 내역의 "요청 고치기"(?edit=상품 id)로 들어오면 그 상품의 변경 요청 창을 바로 엽니다.
  const editId = searchParams.get("edit");
  useEffect(() => {
    if (!editId || !products) return;
    const target = products.find((product) => product.id === editId);
    if (target) setEditing(target);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("edit");
      return next;
    }, { replace: true });
  }, [editId, products, setSearchParams]);

  const month = seoulMonthNumber();
  const rows = useMemo(() => (products ?? []).map((product) => ({ product, status: productStatus(product, month) })), [products, month]);
  const pendingByProduct = useMemo(() => new Map(requests.filter((request) => request.status === "pending" && request.kind === "update" && request.productId).map((request) => [request.productId as string, request])), [requests]);
  const counts = {
    all: rows.length,
    on_sale: rows.filter((row) => row.status === "on_sale").length,
    unavailable: rows.filter((row) => row.status !== "on_sale").length,
    pending: rows.filter((row) => pendingByProduct.has(row.product.id)).length
  };
  const searchText = normalizeSearch(query);
  const filtered = rows.filter(({ product, status }) => {
    if (filter === "on_sale" && status !== "on_sale") return false;
    if (filter === "unavailable" && status === "on_sale") return false;
    if (filter === "pending" && !pendingByProduct.has(product.id)) return false;
    if (!searchText) return true;
    return normalizeSearch(`${product.name} ${product.productCode ?? ""}`).includes(searchText);
  });
  // 쪽 나누기: 기본 10개씩, 공급사가 개수를 바꿀 수 있어요(이 브라우저에 기억). 검색·상태 칸을 바꾸면 1쪽부터.
  const paging = useSupplierPaging(filtered, "supplier-products");

  const filterCards: Array<{ key: ProductFilter; label: string; value: number; note: string; icon: typeof Boxes }> = [
    { key: "all", label: "내 상품", value: counts.all, note: "두고푸드에 등록된 상품", icon: Boxes },
    { key: "on_sale", label: "판매중", value: counts.on_sale, note: "단가표에서 판매 중", icon: BadgeCheck },
    { key: "unavailable", label: "품절·시즌 종료", value: counts.unavailable, note: "지금 판매하지 않는 상품", icon: CircleAlert },
    { key: "pending", label: "승인 대기", value: counts.pending, note: "변경 요청을 확인하는 중", icon: Clock3 }
  ];

  return (
    <>
      <div className="admin-page-heading">
        <div><span>MY PRODUCTS</span><h1>내 상품</h1><p>두고푸드에 등록된 내 상품의 공급가·권장 판매가를 확인하고 변경을 요청합니다. 변경은 두고푸드 승인 후 반영돼요.</p></div>
        <button className="primary-action" type="button" onClick={onCreate}><PackagePlus size={16} /> 상품 등록 요청</button>
      </div>
      {error && !products ? (
        <section className="admin-card"><div className="empty-state"><CircleAlert size={28} /><strong>상품을 불러오지 못했어요.</strong><span>{error}</span><button type="button" className="sup-retry" onClick={() => void load()}>다시 불러오기</button></div></section>
      ) : !products ? (
        <div className="admin-loading inline"><div className="spinner" /><span>내 상품을 불러오는 중…</span></div>
      ) : (
        <>
          <section className="admin-stat-grid sup-filter-grid" aria-label="상품 상태로 거르기">
            {filterCards.map((card, index) => {
              const Icon = card.icon;
              return (
                <button key={card.key} type="button" className={`admin-stat-card ${index === 0 ? "featured" : ""} ${filter === card.key ? "selected" : ""}`} onClick={() => { setFilter(filter === card.key ? "all" : card.key); paging.resetPage(); }} aria-pressed={filter === card.key}>
                  <div><span>{card.label}</span><strong>{card.value.toLocaleString("ko-KR")}</strong><small>{card.note}</small></div>
                  <Icon size={22} aria-hidden="true" />
                </button>
              );
            })}
          </section>
          <section className="admin-card sup-products-card" ref={paging.listRef}>
            <div className="admin-toolbar sup-toolbar">
              <label className="search-field"><Search size={17} aria-hidden="true" /><input value={query} onChange={(event) => { setQuery(event.target.value); paging.resetPage(); }} placeholder="상품명·상품코드 검색" aria-label="상품명·상품코드 검색" /></label>
              <div className="admin-toolbar-meta sup-toolbar-meta">
                <span className="sup-list-count">{filtered.length.toLocaleString("ko-KR")}개 상품</span>
                <SupplierPageSize paging={paging} label="페이지당 상품 수" />
              </div>
            </div>
            <p className="sup-card-note">공급가·권장 판매가·판매 상태를 바꾸려면 <b>변경 요청</b>을 눌러 주세요. 두고푸드가 승인하기 전까지는 지금 값이 그대로 보여요.</p>
            {rows.length === 0 ? (
              <div className="empty-state"><Boxes size={28} /><strong>아직 연결된 내 상품이 없어요.</strong><span>두고푸드가 상품에 공급사를 지정하면 여기에 보여요. 새 상품은 "상품 등록 요청"으로 보내 주세요.</span><button type="button" className="primary-action" onClick={onCreate}><PackagePlus size={16} /> 상품 등록 요청</button></div>
            ) : filtered.length === 0 ? (
              <div className="empty-state"><Search size={28} /><strong>조건에 맞는 상품이 없어요.</strong><span>검색어나 위의 상태 칸을 바꿔 보세요.</span></div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table stackable-table sup-product-table">
                  <thead><tr><th>상품</th><th>공급가</th><th>권장 판매가</th><th>판매 기간</th><th>상태</th><th>관리</th></tr></thead>
                  <tbody>
                    {paging.shown.map(({ product, status }) => {
                      const pending = pendingByProduct.get(product.id);
                      return (
                        <tr key={product.id} className={status !== "on_sale" ? "is-unavailable" : ""}>
                          <td data-label="상품" className="stack-wide">
                            <div className="sup-product-cell">
                              <span className="sup-thumb">{product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : <Boxes size={20} aria-hidden="true" />}</span>
                              <div>
                                <strong>{product.name}</strong>
                                <small>{product.productCode || "상품코드 없음"} · {product.categoryName ?? "카테고리 미정"} · {product.shippingType === "overseas" ? "해외배송" : "국내배송"}</small>
                                {product.origin && <small>원산지 {product.origin}</small>}
                                {product.groupName && <span className="sup-group-tag" title="두고푸드 단가표에서 이 이름의 카드 하나에 다른 사이즈와 함께 옵션으로 보여요.">단가표 묶음 · {product.groupName}</span>}
                              </div>
                            </div>
                          </td>
                          <td data-label="공급가"><b className="sup-money">{won(product.costPrice)}</b></td>
                          <td data-label="권장 판매가">{product.salePriceMode === "fixed" && product.salePrice ? <b className="sup-money">{won(product.salePrice)}</b> : <span className="sup-muted">판매자 자율</span>}</td>
                          <td data-label="판매 기간">{seasonText(product)}</td>
                          <td data-label="상태">
                            <div className="sup-pill-row">
                              <SupplyPill status={status} />
                              {!product.isVisible && <span className="status-pill">단가표 숨김</span>}
                              {pending && <RequestStatusPill status="pending" />}
                            </div>
                          </td>
                          <td data-label="관리" className="stack-wide">
                            <div className="row-actions"><button type="button" onClick={() => setEditing(product)}><Pencil size={14} /> {pending ? "요청 고치기" : "변경 요청"}</button></div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <SupplierPager paging={paging} label="내 상품 페이지" />
          </section>
        </>
      )}
      {editing && (
        <UpdateRequestModal
          product={editing}
          pending={pendingByProduct.get(editing.id)}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged(); }}
        />
      )}
    </>
  );
}

