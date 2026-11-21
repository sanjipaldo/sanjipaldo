// 관리자 상품 리스트·상품 등록 화면에서 쓰는 옵션 묶음 도구(2026-11-21 관리자 요청, 2026-11-22 자동 묶음).
// - useGroupMemberships: 상품마다 어느 저장한 묶음에 들어 있는지 + 지금 들어가 있는 자동 묶음 + "따로 보이기" 상품(033 전 DB면 ready=false)
// - GroupTag: 상품 이름 아래 "옵션 묶음 N"(저장한 묶음, 누르면 수정) / "자동 묶음 N" / "따로 보이기" 표시
// - ProductGroupField: 상품 등록·수정 창의 "옵션 묶음" 칸(자동으로 묶기 · 따로 보이기 · 저장한 묶음, 같은 기본 이름의 묶음을 추천)
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Layers, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { groupBaseKey } from "@repo/shared/product-groups";
import type { Product } from "../catalog/types";
import "./product-groups-admin.css";

export type GroupMembership = { groupId: string; name: string; size: number };
export type GroupChoice = { id: string; name: string; size: number };
// 상품 등록·수정 창 "옵션 묶음" 칸의 "따로 보이기" 값(저장한 묶음 ID와 겹치지 않는 값)
export const SINGLE_GROUP_VALUE = "__single__";

type MembershipPayload = { ready: boolean; memberships: Record<string, GroupMembership>; auto?: Record<string, GroupMembership>; excluded?: string[] };

export function useGroupMemberships() {
  const [ready, setReady] = useState(false);
  const [memberships, setMemberships] = useState<Record<string, GroupMembership>>({});
  const [auto, setAuto] = useState<Record<string, GroupMembership>>({});
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const reload = useCallback(async () => {
    try {
      const response = await apiFetch("/catalog/admin/groups/memberships", { silent: true });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: MembershipPayload } | null;
      if (!response.ok || !payload?.ok || !payload.data) return;
      setReady(payload.data.ready);
      setMemberships(payload.data.memberships);
      setAuto(payload.data.auto ?? {});
      setExcluded(new Set(payload.data.excluded ?? []));
    } catch {
      // 묶음 표시만 못 그릴 뿐 상품 리스트는 그대로 씁니다.
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  // 넣을 수 있는 묶음은 저장한 묶음만입니다(자동 묶음은 저장 전이라 넣을 수 없음).
  const groups = useMemo(() => {
    const byId = new Map<string, GroupChoice>();
    for (const membership of Object.values(memberships)) byId.set(membership.groupId, { id: membership.groupId, name: membership.name, size: membership.size });
    return Array.from(byId.values()).sort((first, second) => first.name.localeCompare(second.name, "ko"));
  }, [memberships]);
  return { ready, memberships, auto, excluded, groups, reload };
}

export function GroupTag({ membership, auto, excluded }: { membership?: GroupMembership; auto?: GroupMembership; excluded?: boolean }) {
  if (membership) {
    return (
      <Link className="admin-group-tag" to={`/admin/bundles?group=${encodeURIComponent(membership.groupId)}`} title={`옵션 묶음 “${membership.name}” (옵션 ${membership.size}개) · 눌러서 수정`}>
        <Layers size={12} aria-hidden="true" /><span>옵션 묶음</span><b>{membership.size}</b><span className="sr-only"> · {membership.name}</span>
      </Link>
    );
  }
  if (auto) {
    return (
      <Link className="admin-group-tag is-auto" to={`/admin/bundles?tab=auto&q=${encodeURIComponent(auto.name)}`} title={`자동 묶음 “${auto.name}” (옵션 ${auto.size}개) · 이름이 비슷해 자동으로 묶여 보여요`}>
        <Sparkles size={12} aria-hidden="true" /><span>자동 묶음</span><b>{auto.size}</b><span className="sr-only"> · {auto.name}</span>
      </Link>
    );
  }
  if (excluded) return <span className="admin-group-tag is-single" title="자동 묶음에서 빼서 이 상품만 카드 하나로 보여요">따로 보이기</span>;
  return null;
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

export function ProductGroupField({ value, onChange, groups, suggestion, autoMembership, isNew }: {
  value: string;
  onChange: (groupId: string) => void;
  groups: GroupChoice[];
  suggestion: GroupMembership | null;
  autoMembership?: GroupMembership;
  isNew?: boolean;
}) {
  const status = value === SINGLE_GROUP_VALUE
    ? "이 상품만 카드 하나로 보여요."
    : value
      ? null
      : suggestion
        ? `같은 이름의 저장한 묶음 “${suggestion.name}”이 있어 자동으로는 묶이지 않아요. 아래 추천을 눌러 넣어 주세요.`
        : autoMembership
          ? `지금 공개 단가표: “${autoMembership.name}” 자동 묶음(옵션 ${autoMembership.size}개)으로 보여요.`
          : isNew
            ? "이름이 비슷한 상품(무게·개수·등급만 다른 상품)이 있으면 저장 뒤 자동으로 같이 묶여 보여요."
            : "지금은 이름이 비슷한 상품이 없어 이 상품만 카드 하나로 보여요.";
  return (
    <label className="full product-group-field">
      옵션 묶음
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">자동으로 묶기 (이름이 비슷한 상품과 함께 보여요)</option>
        <option value={SINGLE_GROUP_VALUE}>따로 보이기 (이 상품만 카드 하나로)</option>
        {groups.length > 0 && (
          <optgroup label="저장한 묶음에 넣기">
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name} · 옵션 {group.size}개</option>)}
          </optgroup>
        )}
      </select>
      {status && <span className="product-group-status">{status}</span>}
      {suggestion && suggestion.groupId !== value && (
        <button type="button" className="product-group-suggest" onClick={() => onChange(suggestion.groupId)}>
          <Sparkles size={13} aria-hidden="true" /> 추천: “{suggestion.name}” 묶음에 넣기
        </button>
      )}
      <small>같은 상품의 다른 사이즈·등급은 공개 단가표에서 카드 하나의 옵션으로 보여요. 상품코드·가격·품절은 상품마다 그대로예요. 묶음 이름·옵션 이름은 “옵션 묶음 관리”에서 저장해 바꿉니다.</small>
    </label>
  );
}
