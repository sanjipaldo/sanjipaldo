// 백과사전 화면들이 같이 쓰는 자료 불러오기: 두고푸드 단가표(품목별 보유 상품) + 네이버 검색량.
// 목록 ↔ 상세를 오갈 때 큰 단가표를 매번 다시 받지 않도록 1분 동안 같이 씁니다.
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { groupProductsByProduce, searchKeyOf, type ProduceItem, type ProduceSearchStat, type ProduceSearchStats } from "@/lib/encyclopedia";
import { loadCatalog } from "./PublicCatalog";
import type { CatalogData, Product } from "./types";

let catalogCache: { at: number; promise: Promise<CatalogData | null> } | null = null;
function loadCatalogShared() {
  if (!catalogCache || Date.now() - catalogCache.at > 60 * 1000) {
    const promise = loadCatalog().then((data) => {
      if (!data) catalogCache = null;
      return data;
    });
    catalogCache = { at: Date.now(), promise };
  }
  return catalogCache.promise;
}

export function useEncyclopediaCatalog() {
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void loadCatalogShared().then((data) => {
      if (!active) return;
      setCatalog(data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);
  const grouped = useMemo(() => {
    if (!catalog) return new Map<string, Product[]>();
    return groupProductsByProduce(catalog.products, new Map(catalog.categories.map((category) => [category.id, category.name])));
  }, [catalog]);
  return { catalog, loading, grouped };
}

// 네이버 검색량(관리자가 모아 둔 값). 아직 없으면 빈 목록입니다.
let statsCache: Promise<ProduceSearchStats | null> | null = null;
function loadSearchStats() {
  if (!statsCache) {
    statsCache = apiFetch("/catalog/produce-search", { auth: false, silent: true })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: ProduceSearchStats } | null;
        return response.ok && payload?.ok && payload.data ? payload.data : null;
      })
      .catch(() => null);
  }
  return statsCache;
}

export function useProduceSearchStats() {
  const [stats, setStats] = useState<ProduceSearchStats | null>(null);
  useEffect(() => {
    let active = true;
    void loadSearchStats().then((value) => {
      if (active) setStats(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return stats;
}

export const searchStatOf = (stats: ProduceSearchStats | null, item: ProduceItem): ProduceSearchStat | undefined =>
  stats?.keywords[searchKeyOf(item.keyword)];

// 다음 달에 검색이 이번 달보다 얼마나 오르는지(월별 추정이 있는 검색어만)
export function searchRise(stat: ProduceSearchStat | undefined, month: number) {
  const months = stat?.months;
  if (!months || months.length !== 12) return null;
  const now = months[month - 1] ?? 0;
  const next = months[month % 12] ?? 0;
  if (now <= 0 || next <= now) return null;
  return { now, next, ratio: next / now };
}
