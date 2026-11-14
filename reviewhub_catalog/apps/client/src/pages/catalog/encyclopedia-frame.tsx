// 백과사전 바탕 틀: 맨 위 "농축수산 백과사전 | 건강식품 백과사전" 전환 + 각 백과사전의 안 메뉴 + 아래 안내 문구.
// 품목·원료 자료를 import하지 않아 두 백과사전이 서로의 큰 자료를 불러오지 않습니다.
import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageFrame } from "./PublicCatalog";

export type EncyclopediaKind = "produce" | "health";

export function EncyclopediaKindSwitch({ kind }: { kind: EncyclopediaKind }) {
  const items: Array<{ kind: EncyclopediaKind; to: string; icon: string; title: string; sub: string }> = [
    { kind: "produce", to: "/encyclopedia", icon: "🥕", title: "농축수산 백과사전", sub: "제철·산지·시즌 캘린더" },
    { kind: "health", to: "/encyclopedia/health", icon: "💊", title: "건강식품 백과사전", sub: "고민별 원료·판매 문구" }
  ];
  return (
    <nav className="enc-kind-switch" aria-label="백과사전 종류">
      {items.map((item) => (
        <Link key={item.kind} to={item.to} className={`is-${item.kind}${item.kind === kind ? " active" : ""}`} aria-current={item.kind === kind ? "true" : undefined}>
          <span className="enc-kind-icon" aria-hidden="true">{item.icon}</span>
          <span className="enc-kind-text">
            <strong>{item.title}</strong>
            <small>{item.sub}</small>
          </span>
        </Link>
      ))}
    </nav>
  );
}

export function EncyclopediaFrame({ kind, tabs, note, className = "", children }: { kind: EncyclopediaKind; tabs: ReactNode; note: ReactNode; className?: string; children: ReactNode }) {
  return (
    <PageFrame>
      <main className={`content-page encyclopedia-page is-${kind} ${className}`.trim()}>
        <EncyclopediaKindSwitch kind={kind} />
        {tabs}
        {children}
        <p className="encyclopedia-note">{note}</p>
      </main>
    </PageFrame>
  );
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener?.("change", update);
    return () => list.removeEventListener?.("change", update);
  }, [query]);
  return matches;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand("copy");
      area.remove();
      return copied;
    } catch {
      return false;
    }
  }
}
