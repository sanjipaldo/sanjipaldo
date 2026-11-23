// 발주오라 상품 카테고리 맞추기(DB센터 → 발주오라, 2026-11-23 관리자 요청).
// DB센터 1차·2차 카테고리를 기준으로 발주오라 상품 카테고리에 없는 것은 추가하고 이름이 다르면 DB센터 이름으로 바꿉니다.
// 발주오라 카테고리는 지우지 않고, 브랜드별(1차 > 2차 > 3차 브랜드)은 통째로 뺍니다. 보내기 전에 바뀔 내용을 보여 줍니다.
import { useState } from "react";
import { FolderTree, Loader2, Plus, Send, X } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_CATEGORY_TREE_EXCLUDE, plainCategoryName, type BaljuoraCategory, type CategoryTreeOp } from "@repo/shared/baljuora-sync";
import { apiFetch } from "@/lib/api";

export type CategoryTreeView = {
  ready: boolean;
  ops: CategoryTreeOp[];
  notes: Array<{ doogoId: string; name: string; reason: string }>;
  excluded: string[];
  excludeNames: string[];
  baljuoraOnly: Array<{ id: string; path: string }>;
  baljuoraOnlyCount: number;
  importable: Array<{ baljuoraId: string; name: string; path: string; doogoCategoryId: string }>;
  subcategoryCount: number;
};

type Props = {
  tree: CategoryTreeView | undefined;
  doogoCategories: Array<{ id: string; name: string }>;
  baljuoraCategories: BaljuoraCategory[];
  disabled: boolean;
  sending: boolean;
  onSend: () => void;
  onChanged: () => Promise<void> | void;
};

// 기본 제외(브랜드별)는 화면에서 풀지 않습니다(관리자 요청 "브랜드별은 특별히 제외").
const isLockedExclude = (name: string) => DEFAULT_CATEGORY_TREE_EXCLUDE.some((item) => plainCategoryName(item) === plainCategoryName(name));

export function BaljuoraCategoryTreeCard({ tree, doogoCategories, baljuoraCategories, disabled, sending, onSend, onChanged }: Props) {
  const [importing, setImporting] = useState(false);
  const [savingExclude, setSavingExclude] = useState(false);
  if (!tree) return null;

  // 보내지 않을 DB센터 1차 카테고리(예: 쓰지 않는 '💊 건강식품')를 제외 목록에 넣거나 뺍니다. 발주오라 1차 카테고리 이름에도 똑같이 적용됩니다.
  const saveExclude = async (next: string[]) => {
    setSavingExclude(true);
    try {
      const response = await apiFetch("/baljuora/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoryTreeExclude: next }) });
      if (!response.ok) return;
      await onChanged();
    } finally {
      setSavingExclude(false);
    }
  };
  const excludeName = (name: string) => {
    if (!window.confirm(`'${name}' 카테고리는 발주오라로 보내지 않고 맞추기에서 뺄까요?\n(동기화 설정에서 다시 넣을 수 있습니다)`)) return;
    void saveExclude([...tree.excludeNames, name]);
  };
  const doogoName = (id: string) => doogoCategories.find((category) => category.id === id)?.name ?? "";
  const baljuoraPath = (id: string | null) => (id ? baljuoraCategories.find((category) => category.id === id)?.path ?? "" : "");
  const parentLabel = (op: Extract<CategoryTreeOp, { type: "add" }>) => op.parentBaljuoraId ? baljuoraPath(op.parentBaljuoraId) : op.parentRef?.startsWith("c:") ? doogoName(op.parentRef.slice(2)) : "";
  const adds = tree.ops.filter((op): op is Extract<CategoryTreeOp, { type: "add" }> => op.type === "add");
  const renames = tree.ops.filter((op): op is Extract<CategoryTreeOp, { type: "rename" }> => op.type === "rename");
  const excludedText = (tree.excluded.length ? tree.excluded : tree.excludeNames).join(", ") || "없음";

  const importAll = async () => {
    if (!window.confirm(`발주오라 2차 카테고리 ${tree.importable.length}개를 DB센터 2차 카테고리로 가져옵니다(같은 이름, 브랜드별 제외).\n발주오라는 바뀌지 않고, 이후 DB센터에서 이름을 바꾸면 동기화 때 발주오라도 바뀝니다.`)) return;
    setImporting(true);
    try {
      const response = await apiFetch("/baljuora/admin/categories/import-subcategories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: { created: number; failed: Array<{ name: string; reason: string }> } } | null;
      if (!response.ok || !payload?.ok || !payload.data) return;
      const { created, failed } = payload.data;
      if (failed.length) toast.warning(`2차 카테고리 ${created}개를 가져왔고 ${failed.length}개는 못 가져왔습니다: ${failed.slice(0, 3).map((item) => `${item.name}(${item.reason})`).join(", ")}`);
      else toast.success(`발주오라 2차 카테고리 ${created}개를 DB센터로 가져왔습니다.`);
      await onChanged();
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="admin-card bj-tree" aria-labelledby="bj-tree-title">
      <div className="bj-tree-head">
        <span className="bj-direction is-push">DB센터 → 발주오라</span>
        <h2 id="bj-tree-title"><FolderTree size={18} aria-hidden="true" /> 발주오라 상품 카테고리 맞추기</h2>
        <p>DB센터 <b>상품 카테고리</b>(1차·2차)를 기준으로 발주오라 상품 카테고리에 없는 것은 추가하고, 이름이 다르면 DB센터 이름으로 바꿉니다. 발주오라 카테고리는 지우지 않습니다. 제외: <b>{excludedText}</b>(그 아래 브랜드 카테고리 포함, 상품에 붙은 브랜드 카테고리도 그대로 둠).</p>
      </div>
      {!tree.ready ? (
        <p className="bj-tree-empty">발주오라 카테고리를 아직 읽지 않았습니다. 위의 <b>발주오라 상품 불러오기(비교)</b>를 먼저 해 주세요.</p>
      ) : (
        <>
          {tree.importable.length > 0 && (
            <div className="bj-tree-import">
              <div>
                <strong>발주오라 2차 카테고리 {tree.importable.length}개가 DB센터에 아직 없습니다</strong>
                <small>{tree.importable.slice(0, 6).map((item) => item.path).join(" · ")}{tree.importable.length > 6 ? " 등" : ""}</small>
              </div>
              <button type="button" className="outline-button" onClick={() => void importAll()} disabled={disabled || importing}>
                {importing ? <Loader2 className="bj-spin" size={15} /> : <Plus size={15} />} DB센터로 가져오기
              </button>
            </div>
          )}
          {tree.ops.length === 0 ? (
            <p className="bj-tree-empty is-ok">발주오라 상품 카테고리가 DB센터 카테고리와 같습니다(브랜드별 제외).</p>
          ) : (
            <ul className="bj-tree-ops" aria-label="발주오라에서 바뀔 카테고리">
              {adds.map((op) => (
                <li key={op.ref} className="is-add">
                  <b>추가</b>
                  <span>{op.level === 2 ? `${parentLabel(op) || "?"} > ` : ""}<strong>{op.name}</strong></span>
                  <small>{op.level === 1 ? "1차" : "2차"}</small>
                  {op.level === 1 && <button type="button" className="bj-tree-skip" onClick={() => excludeName(op.name)} disabled={disabled || savingExclude}>보내지 않기</button>}
                </li>
              ))}
              {renames.map((op) => (
                <li key={op.baljuoraId} className="is-rename"><b>이름 변경</b><span>{op.from} → <strong>{op.to}</strong></span><small>{op.level === 1 ? "1차" : "2차"}</small></li>
              ))}
            </ul>
          )}
          {tree.excludeNames.length > 0 && (
            <div className="bj-tree-excludes" aria-label="맞추기에서 뺀 카테고리">
              <span>맞추기에서 뺀 카테고리</span>
              {tree.excludeNames.map((name) => (
                <em key={name}>{name}{!isLockedExclude(name) && <button type="button" onClick={() => void saveExclude(tree.excludeNames.filter((item) => item !== name))} disabled={disabled || savingExclude} aria-label={`${name} 다시 맞추기에 넣기`}><X size={11} /></button>}</em>
              ))}
            </div>
          )}
          {tree.notes.length > 0 && (
            <ul className="bj-tree-notes">
              {tree.notes.slice(0, 8).map((note) => <li key={note.doogoId}>{note.name}: {note.reason}</li>)}
            </ul>
          )}
          {tree.baljuoraOnlyCount > 0 && (
            <details className="bj-tree-only">
              <summary>발주오라에만 있는 카테고리 {tree.baljuoraOnlyCount.toLocaleString("ko-KR")}개(지우지 않고 그대로 둠)</summary>
              <p>{tree.baljuoraOnly.slice(0, 80).map((item) => item.path).join(" · ")}{tree.baljuoraOnlyCount > 80 ? " 등" : ""}</p>
            </details>
          )}
          <div className="bj-tree-actions">
            <small>상품을 동기화할 때도 이 카테고리 변경이 먼저 함께 보내집니다.</small>
            <button type="button" className="primary-action" onClick={onSend} disabled={disabled || sending || tree.ops.length === 0}>
              {sending ? <Loader2 className="bj-spin" size={15} /> : <Send size={15} />} 발주오라 카테고리에 보내기{tree.ops.length ? ` (${tree.ops.length}건)` : ""}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
