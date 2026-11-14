// 백과사전(농축수산·건강식품) 화면들이 같이 쓰는 두고푸드 단가표 불러오기.
// 목록 ↔ 상세를 오갈 때 큰 단가표를 매번 다시 받지 않도록 1분 동안 같이 씁니다(품목·원료 자료는 import하지 않아 가볍습니다).
import { useEffect, useState } from "react";
import { loadCatalog } from "./PublicCatalog";
import type { CatalogData } from "./types";

let catalogCache: { at: number; promise: Promise<CatalogData | null> } | null = null;

export function loadCatalogShared() {
  if (!catalogCache || Date.now() - catalogCache.at > 60 * 1000) {
    const promise = loadCatalog().then((data) => {
      if (!data) catalogCache = null;
      return data;
    });
    catalogCache = { at: Date.now(), promise };
  }
  return catalogCache.promise;
}

export function useSharedCatalog() {
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
  return { catalog, loading };
}
