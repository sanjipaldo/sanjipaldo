// 관리자 상품 리스트·상품 등록 화면에서 쓰는 옵션 묶음 도구(2026-11-21 관리자 요청).
// - useGroupMemberships: 상품마다 어느 옵션 묶음에 들어 있는지(033 전 DB면 ready=false)
// - GroupTag: 상품 이름 아래 "묶음 · 이름 (옵션 수)" 표시 → 옵션 묶음 관리에서 바로 수정
// - ProductGroupField: 상품 등록·수정 창의 "옵션 묶음" 선택 칸(같은 기본 이름의 묶음을 추천)
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Layers, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { groupBaseKey } from "@repo/shared/product-groups";
import type { Product } from "../catalog/types";
import "./product-groups-admin.css";

export type GroupMembership = { groupId: string; name: string; size: number };
export type GroupChoice = { id: string; name: string; size: number };

export function useGroupMemberships() {
  const [ready, setReady] = useState(false);
  const [memberships, setMemberships] = useState<Record<string, GroupMembership>>({});
  const reload = useCallback(async () => {
    try {
      const response = await apiFetch("/catalog/admin/groups/memberships", { silent: true });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: { ready: boolean; memberships: Record<string, GroupMembership> } } | null;
      if (!response.ok || !payload?.ok || !payload.data) return;
      setReady(payload.data.ready);
      setMemberships(payload.data.memberships);
    } catch {
      // 묶음 표시만 못 그릴 뿐 상품 리스트는 그대로 씁니다.
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const groups = useMemo(() => {
    const byId = new Map<string, GroupChoice>();
    for (const membership of Object.values(memberships)) byId.set(membership.groupId, { id: membership.groupId, name: membership.name, size: membership.size });
    return Array.from(byId.values()).sort((first, second) => first.name.localeCompare(second.name, "ko"));
  }, [memberships]);
  return { ready, memberships, groups, reload };
}

export function GroupTag({ membership }: { membership?: GroupMembership }) {
  if (!membership) return null;
  return (
    <Link className="admin-group-tag" to={`/admin/bundles?group=${encodeURIComponent(membership.groupId)}`} title={`옵션 묶음 “${membership.name}” (옵션 ${membership.size}개) · 눌러서 수정`}>
      <Layers size={12} aria-hidden="true" /><span>옵션 묶음</span><b>{membership.size}</b><span className="sr-only"> · {membership.name}</span>
    </Link>
  );
}

type FieldProduct = Pick<Product, "name" | "categoryId" | "shippingType">;

// 같은 배송유형·카테고리·기본 이름(무게·개수·등급을 뺀 이름)의 묶음이 있으면 추천합니다.
export function suggestGroupFor(product: FieldProduct, products: Product[], memberships: Record<string, GroupMembership>) {
  const key = `${product.shippingType}|${product.categoryId}|${groupBaseKey(product.name)}`;
  if (!groupBaseKey(product.name)) return null;
  for (const item of products) {
    const membership = memberships[item.id];
    if (!membership) continue;
    if (`${item.shippingType}|${item.categoryId}|${groupBaseKey(item.name)}` === key) return membership;
  }
  return null;
}

export function ProductGroupField({ value, onChange, groups, suggestion }: { value: string; onChange: (groupId: string) => void; groups: GroupChoice[]; suggestion: GroupMembership | null }) {
  return (
    <label className="full product-group-field">
      옵션 묶음
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">묶지 않음 (단일 상품 카드로 보여요)</option>
        {groups.map((group) => <option key={group.id} value={group.id}>{group.name} · 옵션 {group.size}개</option>)}
      </select>
      {suggestion && suggestion.groupId !== value && (
        <button type="button" className="product-group-suggest" onClick={() => onChange(suggestion.groupId)}>
          <Sparkles size={13} aria-hidden="true" /> 추천: “{suggestion.name}” 묶음에 넣기
        </button>
      )}
      <small>같은 상품의 다른 사이즈·등급과 묶으면 공개 단가표에서 카드 하나의 옵션으로 보여요. 상품코드·가격·품절은 상품마다 그대로예요. 새 묶음은 “옵션 묶음 관리”에서 만듭니다.</small>
    </label>
  );
}
