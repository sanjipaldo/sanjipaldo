// 관리자 > 상품 카테고리(2026-11-23): 1차 카테고리(단가표·상품 등록에 씀)와 2차 카테고리(발주오라 상품 카테고리 1차 > 2차와 맞추는 이름).
// 여기서 카테고리를 추가하거나 이름을 바꾸면 발주오라 동기화로 보낼 때 발주오라 상품 카테고리도 똑같이 바뀝니다(브랜드별은 제외).
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_CATEGORY_TREE_EXCLUDE, isExcludedCategoryName } from "@repo/shared/baljuora-sync";
import { apiFetch } from "@/lib/api";
import type { AdminCatalogData, Category, ShippingType } from "../catalog/types";

type Subcategory = { id: string; categoryId: string; name: string; sortOrder: number };
// 분류 전 상품 모음(📦 기타·미분류)은 DB센터 안에서만 쓰는 칸이라 발주오라 카테고리로 보내지 않습니다(서버와 같은 기준).
const INTERNAL_CATEGORY_NAMES = new Set(["📦 기타", "미분류"]);
type Editing = { kind: "category" | "sub"; id: string; name: string };

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export function CategoriesAdmin({ data, refresh }: { data: AdminCatalogData; refresh: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [shippingType, setShippingType] = useState<ShippingType>("domestic");
  const [subs, setSubs] = useState<Subcategory[]>([]);
  const [subsReady, setSubsReady] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [adding, setAdding] = useState<{ categoryId: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSubs = useCallback(async () => {
    const response = await apiFetch("/catalog/admin/subcategories", { silent: true });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: { subcategories?: Subcategory[] } } | null;
    setSubs(response.ok && payload?.ok ? payload.data?.subcategories ?? [] : []);
    setSubsReady(response.ok);
  }, []);

  useEffect(() => { void loadSubs(); }, [loadSubs]);

  const run = async (work: () => Promise<Response>, done: string) => {
    if (busy) return false;
    setBusy(true);
    try {
      const response = await work();
      if (!response.ok) return false;
      toast.success(done);
      return true;
    } finally {
      setBusy(false);
    }
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ok = await run(() => apiFetch("/catalog/admin/categories", jsonInit("POST", { name, shippingType, sortOrder: data.categories.length + 1, isActive: true })), "카테고리를 추가했습니다.");
    if (!ok) return;
    setName("");
    await refresh();
  };

  const remove = async (category: Category) => {
    if (!window.confirm(`'${category.name}' 카테고리를 삭제할까요?`)) return;
    if (await run(() => apiFetch(`/catalog/admin/categories/${category.id}`, { method: "DELETE" }), "카테고리를 삭제했습니다.")) await refresh();
  };

  const saveEdit = async () => {
    if (!editing) return;
    const nextName = editing.name.trim();
    if (!nextName) return toast.error("이름을 입력해 주세요.");
    if (editing.kind === "category") {
      const category = data.categories.find((item) => item.id === editing.id);
      if (!category) return;
      // 1차 카테고리 저장은 배송유형·순서·사용 여부도 함께 보내야 바뀌지 않습니다.
      const ok = await run(() => apiFetch(`/catalog/admin/categories/${category.id}`, jsonInit("PUT", { name: nextName, shippingType: category.shippingType, sortOrder: category.sortOrder, isActive: category.isActive })), "카테고리 이름을 바꿨습니다.");
      if (!ok) return;
      setEditing(null);
      await refresh();
      return;
    }
    const ok = await run(() => apiFetch(`/catalog/admin/subcategories/${editing.id}`, jsonInit("PUT", { name: nextName })), "2차 카테고리 이름을 바꿨습니다.");
    if (!ok) return;
    setEditing(null);
    await loadSubs();
  };

  const addSub = async () => {
    if (!adding) return;
    const subName = adding.name.trim();
    if (!subName) return toast.error("2차 카테고리 이름을 입력해 주세요.");
    const ok = await run(() => apiFetch("/catalog/admin/subcategories", jsonInit("POST", { categoryId: adding.categoryId, name: subName })), "2차 카테고리를 추가했습니다.");
    if (!ok) return;
    setAdding(null);
    await loadSubs();
  };

  const removeSub = async (sub: Subcategory) => {
    if (!window.confirm(`2차 카테고리 '${sub.name}'를 삭제할까요?\n발주오라 상품 카테고리는 지우지 않습니다(DB센터에서만 지움).`)) return;
    if (await run(() => apiFetch(`/catalog/admin/subcategories/${sub.id}`, { method: "DELETE" }), "2차 카테고리를 삭제했습니다.")) await loadSubs();
  };

  const nameEditor = (target: Editing) => (
    <form className="category-name-edit" onSubmit={(event) => { event.preventDefault(); void saveEdit(); }}>
      <input value={target.name} onChange={(event) => setEditing({ ...target, name: event.target.value })} maxLength={target.kind === "sub" ? 50 : 80} autoFocus aria-label="새 이름" />
      <button type="submit" className="is-save" disabled={busy} aria-label="이름 저장"><Check size={15} /></button>
      <button type="button" className="is-cancel" onClick={() => setEditing(null)} aria-label="이름 바꾸기 취소"><X size={15} /></button>
    </form>
  );

  return (
    <>
      <div className="admin-page-heading"><div><span>CATEGORY</span><h1>상품 카테고리</h1><p>두고푸드 1차 카테고리와 상품 수, 2차 카테고리를 관리합니다.</p></div></div>
      <p className="category-tree-help">2차 카테고리는 발주오라 상품 카테고리(1차 &gt; 2차)와 맞추는 이름입니다. 카테고리를 추가하거나 이름을 바꾼 뒤 <b>발주오라 동기화</b>에서 보내면 발주오라 상품 카테고리도 똑같이 바뀝니다(브랜드별은 제외). 단가표와 상품 등록은 1차 카테고리만 씁니다.</p>
      <div className="category-admin-grid">
        {(["domestic", "overseas"] as const).map((type) => {
          const list = data.categories.filter((item) => item.shippingType === type);
          return (
            <section className="admin-card" key={type}>
              <div className="card-heading"><Truck size={19} /><div><h2>{type === "domestic" ? "국내배송" : "해외배송"}</h2><p>{list.length}개 카테고리</p></div></div>
              <div className="category-admin-list">
                {list.map((category) => {
                  const children = subs.filter((sub) => sub.categoryId === category.id);
                  const internal = INTERNAL_CATEGORY_NAMES.has(category.name.trim());
                  const excluded = internal || isExcludedCategoryName(category.name, DEFAULT_CATEGORY_TREE_EXCLUDE);
                  const isEditing = editing?.kind === "category" && editing.id === category.id;
                  return (
                    <div key={category.id} className="category-admin-item">
                      <div className="category-admin-row">
                        {isEditing ? nameEditor(editing) : <span>{category.name}{excluded && <em className="category-exclude-tag">{internal ? "발주오라로 보내지 않음" : "발주오라 맞추기 제외"}</em>}</span>}
                        <small>상품 {category.productCount ?? data.products.filter((item) => item.categoryId === category.id).length}개</small>
                        {!isEditing && <button type="button" className="is-edit" onClick={() => setEditing({ kind: "category", id: category.id, name: category.name })} aria-label={`${category.name} 이름 바꾸기`}><Pencil size={14} /></button>}
                        <button type="button" onClick={() => void remove(category)} aria-label={`${category.name} 삭제`}><Trash2 size={15} /></button>
                      </div>
                      {subsReady && !excluded && (
                        <div className="category-sub-list" aria-label={`${category.name} 2차 카테고리`}>
                          {children.map((sub) => (editing?.kind === "sub" && editing.id === sub.id
                            ? <div key={sub.id} className="category-sub-chip is-editing">{nameEditor(editing)}</div>
                            : (
                              <div key={sub.id} className="category-sub-chip">
                                <span>{sub.name}</span>
                                <button type="button" className="is-edit" onClick={() => setEditing({ kind: "sub", id: sub.id, name: sub.name })} aria-label={`${sub.name} 이름 바꾸기`}><Pencil size={12} /></button>
                                <button type="button" onClick={() => void removeSub(sub)} aria-label={`${sub.name} 삭제`}><X size={12} /></button>
                              </div>
                            )))}
                          {adding?.categoryId === category.id ? (
                            <form className="category-sub-add is-open" onSubmit={(event) => { event.preventDefault(); void addSub(); }}>
                              <input value={adding.name} onChange={(event) => setAdding({ ...adding, name: event.target.value })} placeholder="2차 카테고리 이름" maxLength={50} autoFocus aria-label={`${category.name} 2차 카테고리 이름`} />
                              <button type="submit" className="is-save" disabled={busy} aria-label="2차 카테고리 추가"><Check size={14} /></button>
                              <button type="button" className="is-cancel" onClick={() => setAdding(null)} aria-label="2차 카테고리 추가 취소"><X size={14} /></button>
                            </form>
                          ) : (
                            <button type="button" className="category-sub-add" onClick={() => setAdding({ categoryId: category.id, name: "" })}><Plus size={13} /> 2차 추가</button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <form className="admin-card inline-create" onSubmit={create}>
        <div><h2>카테고리 추가</h2><p>새 1차 분류를 배송유형에 연결합니다.</p></div>
        <select value={shippingType} onChange={(event) => setShippingType(event.target.value as ShippingType)}><option value="domestic">국내배송</option><option value="overseas">해외배송</option></select>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="카테고리명" required />
        <button className="primary-action" type="submit" disabled={busy}><Plus size={16} /> 추가</button>
      </form>
    </>
  );
}
