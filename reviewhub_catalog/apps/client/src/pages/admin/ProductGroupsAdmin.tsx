// 관리자 > 옵션 묶음 관리(2026-11-21 관리자 요청, 2026-11-22 자동 묶음).
// 사이즈·등급별로 따로 등록한 상품(발주오라 상품코드 1:1)을 "옵션 묶음"으로 묶어 공개 단가표에서 카드 하나 + 옵션 팝업으로 보여 줍니다.
// 이름이 비슷한 상품(무게·개수·등급만 다른 상품)은 저장하지 않아도 공개 단가표에서 자동으로 묶여 보입니다.
// - 저장한 묶음: 이름·옵션 이름·안내 문구를 바꾼 묶음(수정·풀기, 풀면 다시 자동 묶음)
// - 자동 묶음: 지금 자동으로 묶여 보이는 묶음(이대로 저장·고쳐서 저장·따로 보이기), 기존 묶음에 넣을 새 상품,
//   "따로 보이기"로 뺀 상품(다시 자동으로)
// - 편집 창: 이름·대표 이미지·카테고리·상품 안내·배송 안내·자료 링크, 옵션 순서·옵션 이름, 상품 찾아 넣기
// 상품 하나는 묶음 하나에만 들어갑니다(다른 묶음에 넣으면 옮겨지고, 비게 된 묶음은 지워집니다).
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, EyeOff, Layers, Pencil, Plus, RotateCcw, Save, Search, Sparkles, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { autoOptionLabels, groupBaseName, type ProductGroupSuggestion } from "@repo/shared/product-groups";
import { SUPPLY_STATUS_LABELS, seasonApplies, supplyStatus, type SupplyStatus } from "@repo/shared/supply-status";
import type { Category, Product } from "../catalog/types";
import type { GroupChoice, GroupMembership } from "./product-group-tools";
import "./product-groups-admin.css";

type GroupProduct = Pick<Product, "id" | "productCode" | "name" | "imageUrl" | "aPrice" | "generalPrice" | "categoryId" | "shippingType" | "isVisible" | "isSoldOut" | "isAlwaysOnSale" | "saleStartMonth" | "saleEndMonth"> & { isSeasonEnded?: boolean; supplierName?: string | null; displayOrder?: number };
type AdminGroup = {
  id: string;
  name: string;
  imageUrl: string | null;
  categoryId: string | null;
  description: string | null;
  shippingNote: string | null;
  materialsUrl: string | null;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  items: Array<{ productId: string; sortOrder: number; optionLabel: string | null; product: GroupProduct }>;
};
type SuggestionsPayload = { ungroupedCount: number; suggestions: ProductGroupSuggestion[]; joins: Array<{ groupId: string; groupName: string; productIds: string[] }>; excludedIds?: string[]; products: GroupProduct[] };
export type GroupDraft = { id: string | null; name: string; imageUrl: string; categoryId: string; description: string; shippingNote: string; materialsUrl: string; items: Array<{ productId: string; optionLabel: string }> };

const PAGE_SIZE = 20;

async function readData<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({ ok: false }))) as { ok: boolean; data: T; error?: { message?: string } };
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "데이터 처리에 실패했습니다.");
  return payload.data;
}

function won(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function studentPrice(product: Pick<Product, "aPrice" | "generalPrice">) {
  return product.aPrice > 0 ? product.aPrice : product.generalPrice;
}

function seoulMonth() {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", month: "numeric" }).format(new Date()));
}

function priceRange(values: number[]) {
  if (values.length === 0) return "-";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? won(min) : `${won(min)} ~ ${won(max)}`;
}

// 상품 이미지(못 불러오면 빈 칸 대신 묶음 아이콘)
function AdminThumb({ src, size = 16 }: { src?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="admin-image-placeholder"><Layers size={size} /></span>;
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

let productListCache: GroupProduct[] | null = null;
let categoryCache: Category[] | null = null;

async function loadAdminProducts() {
  if (productListCache) return productListCache;
  const response = await apiFetch("/catalog/admin/products", { silent: true });
  const payload = await readData<{ products: GroupProduct[] }>(response);
  productListCache = payload.products;
  return productListCache;
}

async function loadCategories() {
  if (categoryCache) return categoryCache;
  const response = await apiFetch("/catalog/admin/categories/summary", { silent: true });
  const payload = await readData<{ categories: Category[] }>(response);
  categoryCache = payload.categories;
  return categoryCache;
}

// 선택한 상품으로 새 묶음 초안: 이름은 기본 이름(무게·개수·등급 뺀 이름), 옵션은 일반공급가 낮은 순
export function draftFromProducts(products: GroupProduct[]): GroupDraft {
  const sorted = [...products].sort((first, second) => first.generalPrice - second.generalPrice || first.name.localeCompare(second.name, "ko"));
  return {
    id: null,
    name: sorted[0] ? groupBaseName(sorted[0].name) || sorted[0].name : "",
    imageUrl: "",
    categoryId: sorted[0]?.categoryId ?? "",
    description: "",
    shippingNote: "",
    materialsUrl: "",
    items: sorted.map((product) => ({ productId: product.id, optionLabel: "" }))
  };
}

function draftFromGroup(group: AdminGroup): GroupDraft {
  return {
    id: group.id,
    name: group.name,
    imageUrl: group.imageUrl ?? "",
    categoryId: group.categoryId ?? "",
    description: group.description ?? "",
    shippingNote: group.shippingNote ?? "",
    materialsUrl: group.materialsUrl ?? "",
    items: group.items.map((item) => ({ productId: item.productId, optionLabel: item.optionLabel ?? "" }))
  };
}

function statusOf(product: GroupProduct, categories: Category[], month: number): SupplyStatus {
  const category = categories.find((item) => item.id === product.categoryId);
  return supplyStatus({ ...product, isSeasonEnded: product.isSeasonEnded ?? false }, seasonApplies(product, category?.name), month);
}

function StatusCounts({ products, categories, month }: { products: GroupProduct[]; categories: Category[]; month: number }) {
  const counts = new Map<SupplyStatus, number>();
  for (const product of products) counts.set(statusOf(product, categories, month), (counts.get(statusOf(product, categories, month)) ?? 0) + 1);
  return (
    <span className="group-status-counts">
      {(["on_sale", "sold_out", "season_ended"] as const).filter((status) => counts.get(status)).map((status) => (
        <span key={status} className={`group-status is-${status}`}>{SUPPLY_STATUS_LABELS[status]} {counts.get(status)}</span>
      ))}
    </span>
  );
}

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  return (
    <div className="group-pager" aria-label="쪽 이동">
      <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="이전 쪽"><ChevronLeft size={15} /></button>
      <span>{page} / {pages}</span>
      <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="다음 쪽"><ChevronRight size={15} /></button>
    </div>
  );
}

export function ProductGroupsAdmin() {
  const location = useLocation();
  const navigate = useNavigate();
  const month = seoulMonth();
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(true);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionsPayload | null>(null);
  const [categories, setCategories] = useState<Category[]>(categoryCache ?? []);
  const [products, setProducts] = useState<GroupProduct[]>(productListCache ?? []);
  // 처음에는 자동 묶음 탭. 상품 리스트의 "옵션 묶음" 표시(?group=…)에서 들어오면 저장한 묶음 탭,
  // "자동 묶음" 표시(?tab=auto&q=이름)에서 들어오면 자동 묶음 탭을 그 이름으로 거른 채 엽니다.
  const [tab, setTab] = useState<"groups" | "suggestions">(() => {
    const params = new URLSearchParams(location.search);
    return params.get("group") || params.get("tab") === "saved" ? "groups" : "suggestions";
  });
  const [query, setQuery] = useState(() => new URLSearchParams(location.search).get("q") ?? "");
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<GroupDraft | null>(null);
  const [busy, setBusy] = useState(false);

  const loadGroups = useCallback(async () => {
    const payload = await readData<{ ready: boolean; groups: AdminGroup[] }>(await apiFetch("/catalog/admin/groups"));
    setReady(payload.ready);
    setGroups(payload.groups);
    return payload;
  }, []);
  const loadSuggestions = useCallback(async () => {
    const response = await apiFetch("/catalog/admin/groups/suggestions", { silent: true });
    if (!response.ok) return;
    setSuggestions(await readData<SuggestionsPayload>(response));
  }, []);
  const reloadAll = useCallback(async () => {
    productListCache = null;
    await Promise.all([loadGroups(), loadSuggestions(), loadAdminProducts().then(setProducts)]);
  }, [loadGroups, loadSuggestions]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [payload] = await Promise.all([
          loadGroups(),
          loadSuggestions().catch(() => undefined),
          loadCategories().then((value) => { if (active) setCategories(value); }).catch(() => undefined),
          loadAdminProducts().then((value) => { if (active) setProducts(value); }).catch(() => undefined)
        ]);
        // 상품 리스트의 "묶음" 표시에서 들어오면(/admin/bundles?group=…) 그 묶음 편집 창을 바로 엽니다.
        const groupId = new URLSearchParams(location.search).get("group");
        const target = groupId ? payload.groups.find((group) => group.id === groupId) : null;
        if (active && target) setDraft(draftFromGroup(target));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "옵션 묶음을 불러오지 못했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
    // 처음 열 때 한 번만 불러옵니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setPage(1); }, [query, tab]);

  const productById = useMemo(() => {
    const map = new Map<string, GroupProduct>();
    for (const product of suggestions?.products ?? []) map.set(product.id, product);
    for (const group of groups) for (const item of group.items) map.set(item.productId, item.product);
    for (const product of products) map.set(product.id, product);
    return map;
  }, [groups, products, suggestions]);
  const memberships = useMemo(() => {
    const map: Record<string, GroupMembership> = {};
    for (const group of groups) for (const item of group.items) map[item.productId] = { groupId: group.id, name: group.name, size: group.items.length };
    return map;
  }, [groups]);
  const groupedCount = Object.keys(memberships).length;
  const normalized = query.trim().toLowerCase();
  const filteredGroups = useMemo(() => groups.filter((group) => !normalized
    || group.name.toLowerCase().includes(normalized)
    || group.items.some((item) => `${item.product.name} ${item.product.productCode ?? ""}`.toLowerCase().includes(normalized))), [groups, normalized]);
  const filteredSuggestions = useMemo(() => (suggestions?.suggestions ?? []).filter((suggestion) => !normalized
    || suggestion.name.toLowerCase().includes(normalized)
    || suggestion.productIds.some((id) => (productById.get(id)?.name ?? "").toLowerCase().includes(normalized))), [normalized, productById, suggestions]);
  const filteredJoins = useMemo(() => (suggestions?.joins ?? []).filter((join) => !normalized
    || join.groupName.toLowerCase().includes(normalized)
    || join.productIds.some((id) => (productById.get(id)?.name ?? "").toLowerCase().includes(normalized))), [normalized, productById, suggestions]);
  const excludedIds = useMemo(() => suggestions?.excludedIds ?? [], [suggestions]);
  const filteredExcluded = useMemo(() => excludedIds.filter((id) => !normalized || `${productById.get(id)?.name ?? ""} ${productById.get(id)?.productCode ?? ""}`.toLowerCase().includes(normalized)), [excludedIds, normalized, productById]);
  const autoCount = suggestions?.suggestions.length ?? 0;
  const autoProductCount = (suggestions?.suggestions ?? []).reduce((sum, suggestion) => sum + suggestion.productIds.length, 0);
  const joinProductCount = (suggestions?.joins ?? []).reduce((sum, join) => sum + join.productIds.length, 0);
  const categoryName = (id: string | null) => categories.find((category) => category.id === id)?.name ?? "";

  const createFromSuggestion = async (suggestion: ProductGroupSuggestion, silent = false) => {
    const draftValue = draftFromProducts(suggestion.productIds.map((id) => productById.get(id)).filter((item): item is GroupProduct => Boolean(item)));
    const response = await apiFetch("/catalog/admin/groups", {
      method: "POST",
      silent: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: suggestion.name || draftValue.name, categoryId: suggestion.categoryId || draftValue.categoryId || null, items: draftValue.items.map((item) => ({ productId: item.productId })) })
    });
    await readData(response);
    if (!silent) toast.success(`“${suggestion.name}” 묶음을 저장했습니다(옵션 ${suggestion.productIds.length}개). “저장한 묶음”에서 이름·옵션 이름을 바꿀 수 있어요.`);
  };

  const quickCreate = async (suggestion: ProductGroupSuggestion) => {
    setBusy(true);
    try {
      await createFromSuggestion(suggestion);
      await Promise.all([loadGroups(), loadSuggestions()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "묶음을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  // "따로 보이기": 자동 묶음에서 빼고 상품마다 카드 하나로 / 다시 자동으로
  const setExcluded = async (productIds: string[], excluded: boolean, label: string) => {
    setBusy(true);
    try {
      await readData(await apiFetch("/catalog/admin/groups/exclusions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productIds, excluded }) }));
      toast.success(excluded ? `${label} 상품 ${productIds.length}개를 따로 보이게 했습니다.` : `${label} 상품 ${productIds.length}개를 다시 자동 묶음으로 돌렸습니다.`);
      await Promise.all([loadGroups(), loadSuggestions()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "바꾸지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const joinGroup = async (join: SuggestionsPayload["joins"][number]) => {
    setBusy(true);
    try {
      await readData(await apiFetch("/catalog/admin/groups/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productIds: join.productIds, groupId: join.groupId }) }));
      toast.success(`“${join.groupName}” 묶음에 상품 ${join.productIds.length}개를 넣었습니다.`);
      await Promise.all([loadGroups(), loadSuggestions()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "묶음에 넣지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const removeGroup = async (group: AdminGroup) => {
    if (!window.confirm(`“${group.name}” 묶음을 풀까요?\n상품 ${group.items.length}개는 그대로 남고, 이름이 비슷한 상품끼리 다시 자동으로 묶여 보여요(저장한 이름·옵션 이름·안내 문구는 없어집니다). 따로 보이게 하려면 “자동 묶음” 탭이나 상품 리스트에서 “따로 보이기”를 쓰세요.`)) return;
    setBusy(true);
    try {
      await readData(await apiFetch(`/catalog/admin/groups/${encodeURIComponent(group.id)}`, { method: "DELETE" }));
      toast.success("묶음을 풀었습니다. 상품은 그대로이고, 이름이 비슷한 상품끼리 다시 자동으로 묶여 보여요.");
      await Promise.all([loadGroups(), loadSuggestions()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "묶음을 풀지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const closeEditor = () => {
    setDraft(null);
    if (location.search.includes("group=")) navigate("/admin/bundles", { replace: true });
  };

  const pageGroups = filteredGroups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageSuggestions = filteredSuggestions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <div className="admin-page-heading">
        <div>
          <span>OPTION GROUPS</span>
          <h1>옵션 묶음 관리</h1>
          <p>사이즈·등급별로 따로 등록한 상품은 이름이 비슷하면(무게·개수·등급만 다르면) 공개 단가표에서 <strong>자동으로 묶여</strong> 카드 하나로 보여요. 카드를 누르면 옵션별 공급가·최근 7일 가격 흐름·상품 안내가 팝업으로 열립니다. 묶음 이름·옵션 이름·안내 문구를 바꾸려면 저장하고, 따로 보여야 하는 상품은 “따로 보이기”로 뺍니다. 상품코드·가격·품절은 상품마다 그대로입니다.</p>
        </div>
        <button className="primary-action group-new-button" type="button" onClick={() => setDraft(draftFromProducts([]))} disabled={!ready}><Plus size={16} /> 새 묶음 만들기</button>
      </div>
      {!ready && <div className="group-admin-notice" role="status">옵션 묶음 저장은 운영 배포(DB 033 적용)가 끝난 뒤 할 수 있어요. 지금도 공개 단가표에는 이름이 비슷한 상품이 자동으로 묶여 보입니다.</div>}
      <section className="admin-card group-admin-card">
        <div className="group-admin-summary">
          <article className="is-accent"><span>자동 묶음</span><strong>{autoCount.toLocaleString("ko-KR")}</strong><small>이름이 비슷해 자동으로 묶여 보여요(상품 {autoProductCount.toLocaleString("ko-KR")}개)</small></article>
          <article><span>저장한 묶음</span><strong>{groups.length.toLocaleString("ko-KR")}</strong><small>이름·옵션 이름을 정한 묶음(상품 {groupedCount.toLocaleString("ko-KR")}개)</small></article>
          <article><span>기존 묶음에 넣을 상품</span><strong>{joinProductCount.toLocaleString("ko-KR")}</strong><small>저장한 묶음과 이름이 같은 새 상품</small></article>
          <article><span>따로 보이는 상품</span><strong>{excludedIds.length.toLocaleString("ko-KR")}</strong><small>자동 묶음에서 뺀 상품</small></article>
        </div>
        <div className="group-admin-toolbar">
          <div className="group-admin-tabs" role="tablist" aria-label="옵션 묶음 보기">
            <button type="button" role="tab" aria-selected={tab === "suggestions"} className={tab === "suggestions" ? "active" : ""} onClick={() => setTab("suggestions")}><Sparkles size={15} /> 자동 묶음 <b>{autoCount}</b></button>
            <button type="button" role="tab" aria-selected={tab === "groups"} className={tab === "groups" ? "active" : ""} onClick={() => setTab("groups")}><Layers size={15} /> 저장한 묶음 <b>{groups.length}</b></button>
          </div>
          <div className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="묶음 이름·상품명·상품코드 검색" aria-label="옵션 묶음 검색" /></div>
        </div>
        {loading ? <div className="admin-loading inline"><div className="spinner" /><span>옵션 묶음을 불러오는 중…</span></div> : tab === "groups" ? (
          filteredGroups.length === 0 ? (
            <div className="empty-admin group-admin-empty">
              <strong>{groups.length === 0 ? "아직 저장한 묶음이 없습니다." : "검색 결과가 없습니다."}</strong>
              {groups.length === 0 && <span>이름이 비슷한 상품은 저장하지 않아도 공개 단가표에서 자동으로 묶여 보여요. 묶음 이름·옵션 이름·안내 문구를 바꾸고 싶은 묶음만 “자동 묶음” 탭에서 저장하세요.</span>}
              {groups.length === 0 && <button type="button" className="primary-action" onClick={() => setTab("suggestions")}><Sparkles size={15} /> 자동 묶음 보기</button>}
            </div>
          ) : (
            <>
              <div className="admin-table-wrap"><table className="admin-table stackable-table group-admin-table">
                <thead><tr><th>옵션 묶음</th><th>옵션</th><th>일반공급가</th><th>수강생 단가</th><th>판매 상태</th><th>관리</th></tr></thead>
                <tbody>{pageGroups.map((group) => {
                  const labels = group.items.map((item) => item.optionLabel?.trim() || "");
                  const auto = autoOptionLabels(group.items.map((item) => item.product.name));
                  const shown = labels.map((label, index) => label || auto[index]);
                  const image = group.imageUrl || group.items.find((item) => item.product.imageUrl)?.product.imageUrl;
                  return (
                    <tr key={group.id}>
                      <td data-label="옵션 묶음" className="stack-wide">
                        <div className="group-admin-name">
                          <AdminThumb src={image} size={18} />
                          <div><strong>{group.name}</strong><small>{categoryName(group.categoryId) || "카테고리 미지정"}{group.materialsUrl ? " · 자료 링크 있음" : ""}</small><span className="group-label-preview">{shown.slice(0, 4).join(" · ")}{shown.length > 4 ? ` 외 ${shown.length - 4}개` : ""}</span></div>
                        </div>
                      </td>
                      <td data-label="옵션"><strong>{group.items.length}개</strong></td>
                      <td data-label="일반공급가">{priceRange(group.items.map((item) => item.product.generalPrice))}</td>
                      <td data-label="수강생 단가">{priceRange(group.items.map((item) => studentPrice(item.product)))}</td>
                      <td data-label="판매 상태"><StatusCounts products={group.items.map((item) => item.product)} categories={categories} month={month} /></td>
                      <td data-label="관리"><div className="row-actions"><button type="button" onClick={() => setDraft(draftFromGroup(group))} disabled={busy || !ready}><Pencil size={14} /> 수정</button><button type="button" className="danger" onClick={() => void removeGroup(group)} disabled={busy || !ready}><Trash2 size={14} /> 풀기</button></div></td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
              <Pager page={page} total={filteredGroups.length} onPage={setPage} />
            </>
          )
        ) : (
          <div className="group-suggestions">
            {filteredJoins.length > 0 && (
              <section className="group-suggestion-block is-join">
                <h3>기존 묶음에 넣을 상품 <small>저장한 묶음과 이름이 같은 새 상품은 자동으로 들어가지 않고 따로 보여요. 넣어 주세요.</small></h3>
                <ul>{filteredJoins.map((join) => (
                  <li key={join.groupId}>
                    <div><strong>“{join.groupName}” 묶음에 {join.productIds.length}개</strong><span>{join.productIds.map((id) => productById.get(id)?.name ?? id).slice(0, 4).join(" · ")}{join.productIds.length > 4 ? ` 외 ${join.productIds.length - 4}개` : ""}</span></div>
                    <button type="button" className="primary-action" onClick={() => void joinGroup(join)} disabled={busy || !ready}><Plus size={14} /> 묶음에 넣기</button>
                  </li>
                ))}</ul>
              </section>
            )}
            <section className="group-suggestion-block">
              <div className="group-suggestion-head">
                <h3>자동 묶음 <small>{filteredSuggestions.length.toLocaleString("ko-KR")}개 · 무게·개수·등급을 뺀 이름·카테고리·배송유형이 같은 상품이라 공개 단가표에 이렇게 묶여 보여요(숨김 상품은 단가표에 안 보임). 이름·옵션 이름·안내 문구를 바꾸려면 저장하세요.</small></h3>
              </div>
              {filteredSuggestions.length === 0 ? <div className="empty-admin">{suggestions ? "자동으로 묶인 묶음이 없습니다." : "자동 묶음을 불러오는 중이거나 운영 배포 후 볼 수 있어요."}</div> : (
                <>
                  <ul>{pageSuggestions.map((suggestion) => {
                    const items = suggestion.productIds.map((id) => productById.get(id)).filter((item): item is GroupProduct => Boolean(item));
                    const labels = autoOptionLabels(items.map((item) => item.name));
                    return (
                      <li key={suggestion.key}>
                        <div>
                          <strong>{suggestion.name} <em>옵션 {suggestion.productIds.length}개</em></strong>
                          <span>{categoryName(suggestion.categoryId)} · 일반공급가 {priceRange(items.map((item) => item.generalPrice))}</span>
                          <span className="group-label-preview">{labels.slice(0, 6).join(" · ")}{labels.length > 6 ? ` 외 ${labels.length - 6}개` : ""}</span>
                        </div>
                        <div className="group-suggestion-actions">
                          <button type="button" className="group-single-button" onClick={() => { if (window.confirm(`“${suggestion.name}” 상품 ${suggestion.productIds.length}개를 따로 보이게 할까요?\n자동 묶음에서 빠져 공개 단가표에서 상품마다 카드 하나로 보여요. 아래 “따로 보이는 상품”에서 되돌릴 수 있어요.`)) void setExcluded(suggestion.productIds, true, `“${suggestion.name}”`); }} disabled={busy}><EyeOff size={14} /> 따로 보이기</button>
                          <button type="button" onClick={() => setDraft({ ...draftFromProducts(items), name: suggestion.name })} disabled={busy || !ready}><Pencil size={14} /> 고쳐서 저장</button>
                          <button type="button" className="primary-action" onClick={() => void quickCreate(suggestion)} disabled={busy || !ready}><Save size={14} /> 이대로 저장</button>
                        </div>
                      </li>
                    );
                  })}</ul>
                  <Pager page={page} total={filteredSuggestions.length} onPage={setPage} />
                </>
              )}
            </section>
            {filteredExcluded.length > 0 && (
              <section className="group-suggestion-block is-single">
                <div className="group-suggestion-head">
                  <h3>따로 보이는 상품 <small>{filteredExcluded.length.toLocaleString("ko-KR")}개 · 자동 묶음에서 빼서 상품마다 카드 하나로 보여요</small></h3>
                  <button type="button" className="group-bulk-button" onClick={() => void setExcluded(filteredExcluded, false, normalized ? "검색 결과" : "따로 보이던")} disabled={busy}><RotateCcw size={15} /> {filteredExcluded.length.toLocaleString("ko-KR")}개 모두 다시 자동으로</button>
                </div>
                <ul>{filteredExcluded.slice(0, 60).map((id) => (
                  <li key={id}>
                    <div><strong>{productById.get(id)?.name ?? id}</strong><span>{productById.get(id)?.productCode ?? ""}{productById.get(id) && !productById.get(id)!.isVisible ? " · 단가표 숨김" : ""}</span></div>
                    <button type="button" onClick={() => void setExcluded([id], false, "")} disabled={busy}><RotateCcw size={14} /> 다시 자동으로</button>
                  </li>
                ))}{filteredExcluded.length > 60 && <li className="is-more">외 {filteredExcluded.length - 60}개 — 검색으로 찾아 주세요.</li>}</ul>
              </section>
            )}
          </div>
        )}
      </section>
      {draft && (
        <ProductGroupEditorModal
          initial={draft}
          products={Array.from(productById.values())}
          categories={categories}
          memberships={memberships}
          onClose={closeEditor}
          onSaved={() => { closeEditor(); void reloadAll(); }}
        />
      )}
    </>
  );
}

// ── 묶음 편집 창(관리자 상품 리스트의 "옵션 묶기"에서도 씁니다) ───────────────────

export function ProductGroupEditorModal({ initial, products, categories, memberships, onClose, onSaved }: {
  initial: GroupDraft;
  products: GroupProduct[];
  categories: Category[];
  memberships: Record<string, GroupMembership>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<GroupDraft>(initial);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const month = seoulMonth();
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const items = draft.items.map((item) => ({ ...item, product: productById.get(item.productId) })).filter((item): item is typeof item & { product: GroupProduct } => Boolean(item.product));
  const autoLabels = autoOptionLabels(items.map((item) => item.product.name));
  const inDraft = new Set(draft.items.map((item) => item.productId));
  const normalized = search.trim().toLowerCase();
  const results = useMemo(() => normalized.length < 1 ? [] : products
    .filter((product) => !inDraft.has(product.id) && `${product.name} ${product.productCode ?? ""}`.toLowerCase().includes(normalized))
    .slice(0, 30),
  // inDraft는 draft.items에서 바로 계산합니다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [draft.items, normalized, products]);
  const update = (patch: Partial<GroupDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const move = (index: number, delta: number) => setDraft((current) => {
    const next = [...current.items];
    const target = index + delta;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target], next[index]];
    return { ...current, items: next };
  });
  const sortByPrice = () => setDraft((current) => ({
    ...current,
    items: [...current.items].sort((first, second) => (productById.get(first.productId)?.generalPrice ?? 0) - (productById.get(second.productId)?.generalPrice ?? 0))
  }));

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, saving]);

  const uploadImage = async (file: File) => {
    if (!["image/jpeg", "image/png"].includes(file.type)) return toast.error("대표 이미지는 JPEG 또는 PNG만 올릴 수 있습니다.");
    if (file.size >= 5 * 1024 * 1024) return toast.error("대표 이미지는 5MB 미만만 올릴 수 있습니다.");
    setImageBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const payload = await readData<{ file: { downloadUrl: string } }>(await apiFetch("/catalog/admin/groups/image-upload", { method: "POST", body: form }));
      update({ imageUrl: payload.file.downloadUrl });
      toast.success("대표 이미지를 올렸습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "대표 이미지를 올리지 못했습니다.");
    } finally {
      setImageBusy(false);
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (items.length === 0) return toast.error("묶을 상품을 1개 이상 넣어 주세요.");
    if (!draft.name.trim()) return toast.error("묶음 이름을 입력해 주세요.");
    setSaving(true);
    try {
      const body = {
        name: draft.name.trim(),
        imageUrl: draft.imageUrl.trim() || null,
        categoryId: draft.categoryId || null,
        description: draft.description.trim() || null,
        shippingNote: draft.shippingNote.trim() || null,
        materialsUrl: draft.materialsUrl.trim() || null,
        items: items.map((item) => ({ productId: item.productId, optionLabel: item.optionLabel.trim() || null }))
      };
      const result = await readData<{ movedFromGroups: number; removedGroups: number }>(await apiFetch(draft.id ? `/catalog/admin/groups/${encodeURIComponent(draft.id)}` : "/catalog/admin/groups", {
        method: draft.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }));
      toast.success(`${draft.id ? "옵션 묶음을 저장했습니다." : "옵션 묶음을 만들었습니다."}${result.movedFromGroups > 0 ? ` 다른 묶음에 있던 상품을 옮겼어요${result.removedGroups > 0 ? `(비게 된 묶음 ${result.removedGroups}개는 정리)` : ""}.` : ""}`);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "옵션 묶음을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const previewImage = draft.imageUrl.trim() || items.find((item) => item.product.imageUrl)?.product.imageUrl || "";
  return (
    <div className="editor-overlay" role="presentation" onMouseDown={() => { if (!saving) onClose(); }}>
      <form className="editor-panel group-editor" onSubmit={save} onMouseDown={(event) => event.stopPropagation()} aria-label={draft.id ? "옵션 묶음 수정" : "새 옵션 묶음"}>
        <div className="editor-header">
          <div><span>OPTION GROUP</span><h2>{draft.id ? "옵션 묶음 수정" : "새 옵션 묶음"}</h2><p>공개 단가표에서 이 이름의 카드 하나로 보이고, 아래 상품들이 팝업 옵션표에 순서대로 나옵니다.</p></div>
          <button type="button" onClick={onClose} aria-label="옵션 묶음 창 닫기"><X size={20} /></button>
        </div>
        <div className="group-editor-body">
        <div className="editor-grid">
          <label className="full">묶음 이름*<input value={draft.name} onChange={(event) => update({ name: event.target.value })} placeholder="예: (비세척) 여주 꿀고구마 (베니하루카)" required maxLength={160} /><small>공개 단가표 카드와 팝업 맨 위에 보이는 이름입니다.</small></label>
          <label>대표 카테고리<select value={draft.categoryId} onChange={(event) => update({ categoryId: event.target.value })}><option value="">첫 옵션 상품의 카테고리</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label>상세페이지·사진 자료 링크<input type="url" value={draft.materialsUrl} onChange={(event) => update({ materialsUrl: event.target.value })} placeholder="https://… (구글 드라이브·상세페이지 등)" /><small>카드 아래와 팝업에 “상세페이지·사진 자료” 버튼으로 보여요.</small></label>
          <label className="full group-image-field">대표 이미지
            <input value={draft.imageUrl} onChange={(event) => update({ imageUrl: event.target.value })} placeholder="비우면 첫 옵션 상품 이미지를 씁니다" />
            <span className="image-upload-row">
              <button type="button" onClick={() => imageInputRef.current?.click()} disabled={imageBusy}><Upload size={14} /> {imageBusy ? "올리는 중…" : "JPEG/PNG 올리기"}</button>
              <input ref={imageInputRef} type="file" accept="image/jpeg,image/png" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file); event.target.value = ""; }} />
              {previewImage && <span className="group-image-preview" aria-label="대표 이미지 미리보기"><AdminThumb key={previewImage} src={previewImage} size={20} /></span>}
            </span>
          </label>
          <label className="full">상품 안내 및 참고사항<textarea rows={4} value={draft.description} onChange={(event) => update({ description: event.target.value })} placeholder="비우면 첫 옵션 상품의 참고사항을 보여 줍니다. 예: 수확 직후 선별해 보내며, 크기에 따라 개수가 달라질 수 있어요." maxLength={4000} /></label>
          <label className="full">배송 안내 덧붙임<textarea rows={2} value={draft.shippingNote} onChange={(event) => update({ shippingNote: event.target.value })} placeholder="예: 제주·도서산간 배송 불가 / 주문 마감 오전 10시" maxLength={1000} /><small>배송 정책(배송비·제주·도서산간·택배사)은 상품의 배송 정책에서 자동으로 보여 주고, 여기 적은 문구를 맨 위에 덧붙입니다.</small></label>
        </div>
        <section className="group-editor-options" aria-label="옵션 목록">
          <div className="group-editor-options-head">
            <div><strong>옵션 {items.length}개</strong><span>위에서부터 팝업 옵션표 순서예요. 옵션 이름을 비우면 상품명에서 겹치는 말을 빼고 자동으로 만듭니다.</span></div>
            <button type="button" onClick={sortByPrice} disabled={items.length < 2}><ArrowUpDown size={14} /> 일반공급가 낮은 순</button>
          </div>
          {items.length === 0 ? <div className="group-editor-empty">아래에서 상품을 찾아 넣어 주세요.</div> : (
            <ol className="group-editor-list">{items.map((item, index) => {
              const status = statusOf(item.product, categories, month);
              const other = memberships[item.productId];
              return (
                <li key={item.productId}>
                  <AdminThumb src={item.product.imageUrl} />
                  <div className="group-editor-product">
                    <strong>{item.product.name}</strong>
                    <small>{item.product.productCode || "코드 없음"} · 일반 {won(item.product.generalPrice)} · 수강생 {won(studentPrice(item.product))} · <span className={`group-status is-${status}`}>{SUPPLY_STATUS_LABELS[status]}</span>{!item.product.isVisible ? " · 숨김" : ""}</small>
                    {other && other.groupId !== draft.id && <em className="group-editor-move">지금 “{other.name}” 묶음에 있어요. 저장하면 이 묶음으로 옮겨집니다.</em>}
                  </div>
                  <label className="group-editor-label">옵션 이름<input value={item.optionLabel} onChange={(event) => setDraft((current) => ({ ...current, items: current.items.map((row) => row.productId === item.productId ? { ...row, optionLabel: event.target.value } : row) }))} placeholder={autoLabels[index]} maxLength={120} /></label>
                  <div className="group-editor-row-actions">
                    <button type="button" onClick={() => move(draft.items.findIndex((row) => row.productId === item.productId), -1)} disabled={index === 0} aria-label={`${item.product.name} 위로`}><ArrowUp size={14} /></button>
                    <button type="button" onClick={() => move(draft.items.findIndex((row) => row.productId === item.productId), 1)} disabled={index === items.length - 1} aria-label={`${item.product.name} 아래로`}><ArrowDown size={14} /></button>
                    <button type="button" className="danger" onClick={() => setDraft((current) => ({ ...current, items: current.items.filter((row) => row.productId !== item.productId) }))} aria-label={`${item.product.name} 빼기`}><X size={14} /></button>
                  </div>
                </li>
              );
            })}</ol>
          )}
          <div className="group-editor-add">
            <div className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="상품명·상품코드로 찾아 옵션 넣기" aria-label="옵션으로 넣을 상품 검색" /></div>
            {normalized && (
              <ul className="group-editor-results">
                {results.length === 0 ? <li className="is-empty">찾는 상품이 없습니다.</li> : results.map((product) => (
                  <li key={product.id}>
                    <button type="button" onClick={() => { setDraft((current) => ({ ...current, items: [...current.items, { productId: product.id, optionLabel: "" }] })); }}>
                      <span><strong>{product.name}</strong><small>{product.productCode || "코드 없음"} · 일반 {won(product.generalPrice)}{memberships[product.id] ? ` · 지금 “${memberships[product.id].name}” 묶음` : ""}</small></span>
                      <Plus size={15} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        </div>
        <div className="editor-footer"><button type="button" onClick={onClose} disabled={saving}>취소</button><button className="primary-action" type="submit" disabled={saving || items.length === 0}><Save size={16} /> {saving ? "저장 중…" : draft.id ? "묶음 저장" : "묶음 만들기"}</button></div>
      </form>
    </div>
  );
}

// ── 상품 리스트에서 고른 상품: 새 묶음 만들기 / 기존 묶음에 넣기 / 따로 보이기 / 다시 자동으로 / 묶음에서 빼기 ─────────────────

export function SelectionGroupModal({ products, groups, memberships, excluded, categories, onClose, onDone }: {
  products: GroupProduct[];
  groups: GroupChoice[];
  memberships: Record<string, GroupMembership>;
  excluded?: Set<string>;
  categories: Category[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [targetGroupId, setTargetGroupId] = useState(groups[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [editorDraft, setEditorDraft] = useState<GroupDraft | null>(null);
  const [allProducts, setAllProducts] = useState<GroupProduct[]>(products);
  const groupedCount = products.filter((product) => memberships[product.id]).length;
  const excludedCount = products.filter((product) => excluded?.has(product.id)).length;
  useEffect(() => {
    void loadAdminProducts().then((list) => setAllProducts(list)).catch(() => undefined);
  }, []);
  const assign = async (groupId: string | null) => {
    setBusy(true);
    try {
      await readData(await apiFetch("/catalog/admin/groups/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productIds: products.map((product) => product.id), groupId }) }));
      toast.success(groupId ? `상품 ${products.length}개를 묶음에 넣었습니다.` : `상품 ${products.length}개를 묶음에서 뺐습니다.`);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "묶음을 바꾸지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };
  const setSingle = async (single: boolean) => {
    setBusy(true);
    try {
      const productIds = single ? products.map((product) => product.id) : products.filter((product) => excluded?.has(product.id)).map((product) => product.id);
      await readData(await apiFetch("/catalog/admin/groups/exclusions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productIds, excluded: single }) }));
      toast.success(single ? `상품 ${productIds.length}개를 따로 보이게 했습니다.` : `상품 ${productIds.length}개를 다시 자동 묶음으로 돌렸습니다.`);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "바꾸지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };
  if (editorDraft) {
    return <ProductGroupEditorModal initial={editorDraft} products={allProducts} categories={categories} memberships={memberships} onClose={onClose} onSaved={onDone} />;
  }
  return (
    <div className="editor-overlay" role="presentation" onMouseDown={() => { if (!busy) onClose(); }}>
      <section className="editor-panel group-select-panel" role="dialog" aria-modal="true" aria-label="선택한 상품 옵션 묶기" onMouseDown={(event) => event.stopPropagation()}>
        <div className="editor-header">
          <div><span>OPTION GROUP</span><h2>선택한 상품 {products.length}개 묶기</h2><p>묶은 상품은 공개 단가표에서 카드 하나의 옵션으로 보여요(이름이 비슷한 상품은 저장하지 않아도 자동으로 묶여요). 상품코드·가격·품절은 그대로입니다.</p></div>
          <button type="button" onClick={onClose} aria-label="닫기"><X size={20} /></button>
        </div>
        <div className="group-select-body">
        <ul className="group-select-products">{products.slice(0, 6).map((product) => <li key={product.id}>{product.name}{memberships[product.id] ? <em> · 지금 “{memberships[product.id].name}”</em> : excluded?.has(product.id) ? <em> · 지금 따로 보이기</em> : null}</li>)}{products.length > 6 && <li className="is-more">외 {products.length - 6}개</li>}</ul>
        <div className="group-select-options">
          <article>
            <strong>새 묶음 만들기</strong>
            <span>이름·옵션 순서·옵션 이름을 확인한 뒤 만듭니다.</span>
            <button type="button" className="primary-action" onClick={() => setEditorDraft(draftFromProducts(products))} disabled={busy}><Plus size={15} /> 새 묶음으로 묶기</button>
          </article>
          <article>
            <strong>기존 묶음에 넣기</strong>
            <span>골라 둔 상품을 묶음 맨 뒤 옵션으로 붙입니다.</span>
            {groups.length === 0 ? <em>아직 만든 묶음이 없습니다.</em> : (
              <div className="group-select-row">
                <select value={targetGroupId} onChange={(event) => setTargetGroupId(event.target.value)} aria-label="넣을 옵션 묶음">{groups.map((group) => <option key={group.id} value={group.id}>{group.name} · 옵션 {group.size}개</option>)}</select>
                <button type="button" onClick={() => void assign(targetGroupId)} disabled={busy || !targetGroupId}>넣기</button>
              </div>
            )}
          </article>
          <article>
            <strong>따로 보이기</strong>
            <span>자동 묶음·저장한 묶음에서 빼고 상품마다 카드 하나로 보여요.</span>
            <button type="button" className="danger-action" onClick={() => void setSingle(true)} disabled={busy}><EyeOff size={15} /> 따로 보이기</button>
          </article>
          {excludedCount > 0 && (
            <article>
              <strong>다시 자동으로 묶기</strong>
              <span>고른 상품 중 {excludedCount}개가 따로 보이고 있어요. 되돌리면 이름이 비슷한 상품과 자동으로 묶여 보여요.</span>
              <button type="button" onClick={() => void setSingle(false)} disabled={busy}><RotateCcw size={15} /> 다시 자동으로</button>
            </article>
          )}
          {groupedCount > 0 && (
            <article>
              <strong>저장한 묶음에서 빼기</strong>
              <span>고른 상품 중 {groupedCount}개가 저장한 묶음에 있어요. 빼면 같은 이름 묶음이 남아 있는 상품은 따로 보이고, 아니면 자동 묶음 규칙을 따릅니다.</span>
              <button type="button" className="danger-action" onClick={() => void assign(null)} disabled={busy}><Trash2 size={15} /> 묶음에서 빼기</button>
            </article>
          )}
        </div>
        </div>
      </section>
    </div>
  );
}
