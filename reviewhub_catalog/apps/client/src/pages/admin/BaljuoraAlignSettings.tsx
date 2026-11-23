// 관리자 > 발주오라 동기화 > 동기화 설정 안의 "카테고리 맞추기 · 배송비 정책 맞추기"(2026-11-23 관리자 요청: 양쪽 카테고리·배송비 정책까지 같게).
// - 카테고리: DB센터는 대표 카테고리 7개(migration 011), 발주오라는 세부 카테고리가 많습니다. 연결되지 않은 발주오라 카테고리마다
//   어느 DB센터 카테고리로 볼지 고르고(여러 개 → 하나, '설정 저장'), 정말 새로운 카테고리만 DB센터에 같은 이름으로 만들어 연결합니다.
//   DB센터 카테고리 → 발주오라 카테고리(보낼 곳) 연결표는 위(동기화 설정)에 그대로 있습니다. 발주오라 카테고리는 바꾸지 않습니다.
// - 배송비 정책: DB센터 배송 정책 ↔ 발주오라 매출배송정책 연결(배송비 코드·이름이 같으면 비교 때 자동 연결). '설정 저장'으로 저장합니다.
import { useMemo, useState } from "react";
import { FolderPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { BALJUORA_POLICY_TYPE_LABELS, DEFAULT_CATEGORY_TREE_EXCLUDE, excludedBaljuoraCategoryIds, unconnectedBaljuoraCategories, type BaljuoraCategory } from "@repo/shared/baljuora-sync";

export type DoogoPolicyOption = { id: string; name: string; policyCode: string | null; shippingType: string };
export type BaljuoraPolicyOption = { id: string; code: string | null; name: string; type: string | null; convertible: boolean };

export function baljuoraPolicyLabel(policy: BaljuoraPolicyOption) {
  const type = policy.type ? BALJUORA_POLICY_TYPE_LABELS[policy.type] ?? policy.type : "";
  return `${policy.name || "(이름 없음)"}${policy.code ? ` (${policy.code})` : ""}${type ? ` · ${type}` : ""}`;
}

export function BaljuoraAlignSettings({ baljuoraCategories, doogoCategories, savedCategoryMap, savedReverseMap, reverseMap, onReverseMapChange, doogoPolicies, baljuoraPolicies, policyMap, onPolicyMapChange, onCategoriesCreated, excludeNames = DEFAULT_CATEGORY_TREE_EXCLUDE }: {
  // 카테고리 맞추기에서 뺀 발주오라 1차 카테고리(브랜드별): 그 아래 브랜드 카테고리는 연결할 목록에 넣지 않습니다.
  excludeNames?: string[];
  baljuoraCategories: BaljuoraCategory[];
  doogoCategories: Array<{ id: string; name: string; shippingType: string }>;
  savedCategoryMap: Record<string, string>;
  savedReverseMap: Record<string, string>;
  reverseMap: Record<string, string>;
  onReverseMapChange: (next: Record<string, string>) => void;
  doogoPolicies: DoogoPolicyOption[];
  baljuoraPolicies: BaljuoraPolicyOption[];
  policyMap: Record<string, string>;
  onPolicyMapChange: (next: Record<string, string>) => void;
  onCategoriesCreated: () => Promise<void>;
}) {
  // 숨긴(합쳐진) DB센터 카테고리와의 연결은 연결로 보지 않습니다(목록에는 공개 화면에 있는 카테고리만 옴).
  const activeCategoryMap = useMemo(() => {
    const active = new Set(doogoCategories.map((category) => category.id));
    return Object.fromEntries(Object.entries(savedCategoryMap).filter(([doogoId]) => active.has(doogoId)));
  }, [doogoCategories, savedCategoryMap]);
  const missing = useMemo(() => {
    const excluded = excludedBaljuoraCategoryIds(baljuoraCategories, excludeNames);
    return unconnectedBaljuoraCategories(baljuoraCategories, activeCategoryMap, savedReverseMap).filter((category) => !excluded.has(category.id));
  }, [baljuoraCategories, activeCategoryMap, savedReverseMap, excludeNames]);
  const reverseDirty = JSON.stringify(Object.entries(reverseMap).sort()) !== JSON.stringify(Object.entries(savedReverseMap).sort());
  // 표에 보일 줄: 이미 '발주오라 → DB센터'로 연결한 카테고리 + 아직 연결 안 된 카테고리
  const rows = useMemo(() => {
    const ids = new Set([...Object.keys(savedReverseMap), ...missing.map((category) => category.id)]);
    return baljuoraCategories.filter((category) => ids.has(category.id)).sort((first, second) => first.path.localeCompare(second.path, "ko"));
  }, [baljuoraCategories, savedReverseMap, missing]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [shippingType, setShippingType] = useState<"domestic" | "overseas">("domestic");
  const [creating, setCreating] = useState(false);
  const connectedPolicies = new Set(Object.values(policyMap));
  const lonelyPolicies = baljuoraPolicies.filter((policy) => !connectedPolicies.has(policy.id));

  const togglePick = (id: string) => setPicked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const createCategories = async () => {
    // 새로 만들면 화면 설정을 다시 불러오므로, 저장하지 않은 연결 선택이 있으면 먼저 저장하게 합니다(선택이 사라지지 않게).
    if (reverseDirty) return toast.info("고른 카테고리 연결을 먼저 ‘설정 저장’으로 저장한 뒤 새로 만들어 주세요.");
    const chosen = missing.filter((category) => picked.has(category.id) && !reverseMap[category.id]);
    const ids = chosen.map((category) => category.id);
    if (ids.length === 0) return toast.info("새로 만들 발주오라 카테고리를 골라 주세요(DB센터 카테고리를 고른 줄은 연결만 합니다).");
    const names = chosen.map((category) => category.path).join(", ");
    if (!window.confirm(`발주오라 카테고리 ${ids.length}개를 DB센터 ${shippingType === "overseas" ? "해외배송" : "국내배송"} 카테고리로 만들고 연결할까요?\n\n${names}\n\n· 같은 이름의 DB센터 카테고리가 있으면 새로 만들지 않고 연결만 합니다.\n· 새 카테고리는 공개 단가표 카테고리 버튼에도 바로 보여요.\n· 발주오라 카테고리는 바뀌지 않습니다.`)) return;
    setCreating(true);
    try {
      const response = await apiFetch("/baljuora/admin/categories/from-baljuora", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baljuoraCategoryIds: ids, shippingType }) });
      const json = await response.json().catch(() => null) as { ok?: boolean; data?: { created: Array<{ name: string; reused: boolean }> }; error?: { message?: string } } | null;
      if (!response.ok || !json?.ok || !json.data) throw new Error(json?.error?.message || "카테고리를 만들지 못했습니다.");
      const made = json.data.created.filter((item) => !item.reused).length;
      const reused = json.data.created.length - made;
      toast.success(`DB센터 카테고리 ${made}개를 만들고${reused ? ` ${reused}개는 같은 이름 카테고리와` : ""} 연결했습니다.`);
      setPicked(new Set());
      await onCategoriesCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "카테고리를 만들지 못했습니다.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="bj-align">
      <h3>카테고리 맞추기 <small>발주오라 카테고리 → DB센터 카테고리 (발주오라 세부 카테고리 여러 개를 DB센터 대표 카테고리 하나로)</small></h3>
      {baljuoraCategories.length === 0 ? (
        <p className="bj-muted">발주오라 상품 불러오기(비교)를 하면 발주오라 카테고리가 보입니다.</p>
      ) : rows.length === 0 ? (
        <p className="bj-align-ok">발주오라 카테고리가 모두 DB센터 카테고리와 연결돼 있어요(하위 카테고리는 연결한 상위 카테고리로 맞춤).</p>
      ) : (
        <div className="bj-align-box">
          {missing.length > 0 && <p className="bj-align-lead">연결되지 않은 발주오라 카테고리 {missing.length}개 — 어느 DB센터 카테고리로 볼지 골라 ‘설정 저장’을 눌러 주세요. 이 카테고리 상품은 비교·가져오기 때 고른 DB센터 카테고리로 맞춥니다.</p>}
          <div className="bj-align-rows">
            {rows.map((category) => {
              const unconnected = missing.some((item) => item.id === category.id);
              return (
                <div key={category.id} className={`bj-align-row${reverseMap[category.id] ? "" : " is-unmapped"}`}>
                  <label className="bj-align-name">
                    {unconnected && <input type="checkbox" checked={picked.has(category.id)} onChange={() => togglePick(category.id)} disabled={creating || Boolean(reverseMap[category.id])} aria-label={`${category.path} DB센터에 새로 만들기`} />}
                    <span>{category.path}</span>
                  </label>
                  <select value={reverseMap[category.id] ?? ""} onChange={(event) => {
                    const next = { ...reverseMap };
                    if (event.target.value) next[category.id] = event.target.value; else delete next[category.id];
                    onReverseMapChange(next);
                  }} aria-label={`${category.path} → DB센터 카테고리`}>
                    <option value="">연결 안 함</option>
                    {doogoCategories.map((option) => <option key={option.id} value={option.id}>{option.name} ({option.shippingType === "overseas" ? "해외배송" : "국내배송"})</option>)}
                  </select>
                </div>
              );
            })}
          </div>
          {missing.length > 0 && (
            <div className="bj-align-actions">
              <select value={shippingType} onChange={(event) => setShippingType(event.target.value === "overseas" ? "overseas" : "domestic")} aria-label="새 카테고리 배송유형" disabled={creating}>
                <option value="domestic">국내배송 카테고리로</option>
                <option value="overseas">해외배송 카테고리로</option>
              </select>
              <button type="button" className="outline-button" onClick={() => void createCategories()} disabled={creating || picked.size === 0}>
                {creating ? <Loader2 className="bj-spin" size={15} /> : <FolderPlus size={15} />} 체크한 {picked.size}개 DB센터에 새로 만들고 연결
              </button>
            </div>
          )}
          <small>DB센터 카테고리는 대표 카테고리로 정리돼 있어서, 보통은 새로 만들기보다 기존 DB센터 카테고리를 고르는 것을 권해요. 새로 만든 카테고리는 공개 단가표 카테고리 버튼에도 바로 보여요. 발주오라 카테고리는 바뀌지 않습니다.</small>
        </div>
      )}

      <h3>배송비 정책 맞추기 <small>DB센터 배송 정책 → 발주오라 매출배송정책 (배송비 코드·이름이 같으면 자동으로 연결)</small></h3>
      {baljuoraPolicies.length === 0 ? (
        <p className="bj-muted">발주오라 상품 불러오기(비교)를 하면 발주오라 배송비 정책이 보입니다.</p>
      ) : (
        <>
          {doogoPolicies.length === 0 ? <p className="bj-muted">DB센터에 배송 정책이 없습니다. ‘발주오라 기준으로 맞추기’에서 배송비 정책을 가져오면 발주오라 정책과 같은 내용으로 만들어 연결해요.</p> : (
            <div className="bj-category-map">
              {doogoPolicies.map((policy) => (
                <label key={policy.id} className={policyMap[policy.id] ? "" : "is-unmapped"}>
                  <span>{policy.name}<small>{policy.policyCode ? `${policy.policyCode} · ` : ""}{policy.shippingType === "overseas" ? "해외배송" : "국내배송"}</small></span>
                  <select value={policyMap[policy.id] ?? ""} onChange={(event) => {
                    const next = { ...policyMap };
                    if (event.target.value) next[policy.id] = event.target.value; else delete next[policy.id];
                    onPolicyMapChange(next);
                  }}>
                    <option value="">연결 안 함</option>
                    {baljuoraPolicies.map((option) => <option key={option.id} value={option.id}>{baljuoraPolicyLabel(option)}</option>)}
                  </select>
                </label>
              ))}
            </div>
          )}
          {lonelyPolicies.length > 0 && (
            <p className="bj-align-note">
              DB센터와 연결되지 않은 발주오라 배송비 정책 {lonelyPolicies.length}개: {lonelyPolicies.slice(0, 6).map((policy) => `${policy.name}${policy.convertible ? "" : "(직접 만들어야 함)"}`).join(", ")}{lonelyPolicies.length > 6 ? " 등" : ""}.
              {" "}‘발주오라 기준으로 맞추기’에서 배송비 정책을 고르면 같은 내용(유형·구간·제주/도서산간)으로 DB센터에 만들어 연결해요. ‘직접 만들어야 함’은 구간 모양이 달라 배송 정책 메뉴에서 같은 이름으로 만들어 주세요.
            </p>
          )}
        </>
      )}
    </div>
  );
}
