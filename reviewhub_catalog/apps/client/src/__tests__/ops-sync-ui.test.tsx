// 2026-11-27 관리자 요청 화면:
// ① 운영 홈 버튼 2개 — 주문 동기화(발주오라 → DB센터) · 상품 동기화(DB센터 → 발주오라, 보낼 것 미리보기·고르기 → 책갈피 한 번으로 읽고 이어서 보냄)
// ② 발주오라 동기화 화면 숫자 카드 팝업 — 보낼 변경 칸별 상세(DB센터·발주오라·마지막으로 맞춘 값) · 연결된 상품 20개씩 · 신규 등록 · 발주오라에만 있음
// ③ DB센터 ↔ 발주오라 상품 수 맞춰 보기 — 원인별 수와 '발주오라와 똑같이 맞추기'(끝날 때까지 이어서)
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock, Toaster: () => null }));
const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import { OpsSyncButtons, OpsSyncPanel, formatSyncTime, relativeTime, useOpsSync, type OpsJobView, type OpsStatus, type ProductPreview } from "@/pages/admin/OpsSync";
import { BaljuoraStatModal, type StatChangeItem } from "@/pages/admin/BaljuoraStatModals";
import { BaljuoraReconcileCard, type AlignView, type ReconcileView } from "@/pages/admin/BaljuoraReconcileCard";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(status < 400 ? { ok: true, data } : { ok: false, error: { message: "실패" } }), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  apiFetch.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  window.localStorage.clear();
});

const idle = (overrides: Partial<OpsStatus> = {}): OpsStatus => ({
  ready: true,
  orders: { job: null, last: null, recent: null },
  products: { phase: "idle", compareJob: null, pushJob: null, options: null, planned: null, stalled: false, error: null, last: null },
  ...overrides
});

function Home() {
  const state = useOpsSync();
  return (
    <MemoryRouter>
      <OpsSyncButtons state={state} />
      <OpsSyncPanel state={state} />
    </MemoryRouter>
  );
}

const job = (id: string, status: OpsJobView["status"], extra: Partial<OpsJobView> = {}): OpsJobView => ({ id, type: "sales", status, createdAt: new Date().toISOString(), finishedAt: status === "done" ? new Date().toISOString() : null, expiresAt: new Date(Date.now() + 1800_000).toISOString(), progress: null, summary: null, ...extra });

describe("운영 홈 주문 동기화 · 상품 동기화 버튼", () => {
  it("시각은 한국 시각으로, 버튼 밑에 각각 마지막 동기화를 보여 줍니다", async () => {
    expect(formatSyncTime("2026-11-26T00:12:00.000Z")).toContain("26");
    expect(relativeTime(new Date(Date.now() - 3 * 3600_000).toISOString())).toBe("3시간 전");
    const finishedAt = new Date(Date.now() - 2 * 3600_000).toISOString();
    apiFetch.mockImplementation(async () => json(idle({
      orders: { job: null, recent: null, last: { jobId: "o-1", finishedAt, start: "2026-11-01", end: "2026-11-27", lines: 10, newLines: 2, newOrders: 1, buyers: 3, newBuyers: 0, newBuyerNames: [], suppliers: null, complete: true, error: null } }
    })));
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("button", { name: /주문 동기화/ })).toBeTruthy());
    expect(screen.getByRole("button", { name: /상품 동기화/ })).toBeTruthy();
    const lines = [...document.querySelectorAll(".osync-last")].map((node) => node.textContent ?? "");
    expect(lines[0]).toMatch(/^마지막 .* · 2시간 전/);
    expect(lines[1]).toBe("아직 동기화한 적 없어요");
  });

  it("주문 동기화: 작업 코드 + 발주오라 창을 열고, 읽기가 끝나면 새 매출처·새 매입처·최근 7일 주문 현황 요약을 보여 줍니다", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    let phase: "idle" | "running" | "done" = "idle";
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/baljuora/admin/ops-sync/orders/start") {
        expect(init?.method).toBe("POST");
        phase = "running";
        return json({ job: job("o-2", "waiting"), code: "ABCDE12345", consoleUrl: "https://console.baljuora.com/doogofood/dashboard#doogo-sync=ABCDE12345" });
      }
      if (path === "/baljuora/admin/ops-sync") {
        if (phase === "idle") return json(idle());
        if (phase === "running") return json(idle({ orders: { job: job("o-2", "waiting"), last: null, recent: null } }));
        return json(idle({
          orders: {
            job: job("o-2", "done"),
            last: { jobId: "o-2", finishedAt: new Date().toISOString(), start: "2026-11-01", end: "2026-11-27", lines: 144, newLines: 12, newOrders: 9, buyers: 51, newBuyers: 2, newBuyerNames: ["하루마켓", "새벽상회"], suppliers: { read: 40, added: 1, names: ["새매입처1"], fromLines: 12, error: null }, complete: true, error: null },
            recent: { from: "2026-11-21", to: "2026-11-27", total: 144, orders: 120, cancelled: 26, byStatus: [{ status: "pending", label: "주문대기", lines: 0 }, { status: "accepted", label: "주문접수", lines: 0 }, { status: "purchased", label: "발주완료", lines: 2 }, { status: "preparing", label: "배송준비중", lines: 0 }, { status: "shipping", label: "배송중", lines: 48 }, { status: "delivered", label: "배송완료", lines: 94 }] }
          }
        }));
      }
      return json({});
    });
    render(<Home />);
    const button = await screen.findByRole("button", { name: /주문 동기화/ });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(open).toHaveBeenCalledWith(expect.stringContaining("#doogo-sync=ABCDE12345"), "_blank", "noopener"));
    expect(await screen.findByText(/주문 동기화 · 발주오라 창에서 책갈피를 눌러 주세요/)).toBeTruthy();
    expect(screen.getByText("ABCDE-12345")).toBeTruthy();

    phase = "done";
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 2100)); });
    const panel = (await screen.findByText(/주문 동기화 완료/)).closest("section") as HTMLElement;
    expect(within(panel).getByText(/새 매출처 2곳 · 하루마켓, 새벽상회/)).toBeTruthy();
    expect(within(panel).getByText(/공급사 관리에 새로 등록 1곳 · 새매입처1/)).toBeTruthy();
    expect(within(panel).getByText("배송중").nextSibling?.textContent).toBe("48");
    expect(within(panel).getByText("취소").nextSibling?.textContent).toBe("26");
    expect(within(panel).getByRole("link", { name: "판매 현황" }).getAttribute("href")).toBe("/admin/sales");
    expect(toastMock.success).toHaveBeenCalledWith(expect.stringContaining("주문 동기화를 마쳤어요"));
  }, 10_000);

  it("상품 동기화: 보낼 것 미리보기에서 고른 것만 시작하고, 지운 상품 숨기기를 빼면 그대로 보냅니다", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const preview: ProductPreview = {
      compared: true,
      lastCompareAt: new Date().toISOString(),
      linkedCount: 2140,
      updates: { count: 19, conflicts: 2, fields: [{ field: "supplyPrice", count: 12 }, { field: "image", count: 5 }], samples: [{ id: "p-1", name: "샤인머스캣 2kg", code: "PD-1" }] },
      creates: { count: 3, samples: [{ id: "p-2", name: "신상 사과 3kg", code: "PD-2" }] },
      hides: { count: 2, samples: [{ id: "bj-9", name: "단종 포도", code: "PD-9" }] },
      categories: { count: 1, samples: [{ name: "🍎 과일 → 🍎 제철 과일", type: "rename" }], notes: 0 },
      leftovers: { pull: 4, initial: 7, only: 6, sameName: 1, newSupplier: 0, shippingUnlinked: 0 }
    };
    let started: unknown = null;
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/baljuora/admin/ops-sync/products/preview") return json(preview);
      if (path === "/baljuora/admin/ops-sync/products/start") {
        started = JSON.parse(String(init?.body));
        return json({ job: job("c-1", "waiting", { type: "compare" }), code: "QWERT67890", consoleUrl: "https://console.baljuora.com/doogofood/dashboard#doogo-sync=QWERT67890" });
      }
      return json(idle());
    });
    render(<Home />);
    const button = await screen.findByRole("button", { name: /상품 동기화/ });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    const dialog = await screen.findByRole("dialog", { name: "상품 동기화" });
    expect(within(dialog).getByText("19개")).toBeTruthy();
    expect(within(dialog).getByText(/공급가 12 · 이미지 5/)).toBeTruthy();
    expect(within(dialog).getByText(/양쪽에서 바뀐 상품 2개는 DB센터 값으로/)).toBeTruthy();
    expect(within(dialog).getByText(/예: 신상 사과 3kg/)).toBeTruthy();
    expect(within(dialog).getByText(/발주오라에서 바뀐 상품 4개/)).toBeTruthy();
    // 지운 상품 숨기기 빼기
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /지운 상품 숨기기/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: /발주오라 창 열고 시작/ }));
    await waitFor(() => expect(started).toEqual({ options: { updates: true, creates: true, hides: false, categories: true } }));
    expect(open).toHaveBeenCalledWith(expect.stringContaining("#doogo-sync=QWERT67890"), "_blank", "noopener");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("상품 동기화 진행: 읽기 → 보낼 것 정하기 → 보내기 단계를 보여 주고, 끝나면 신규·변경·숨김·실패와 저절로 바꾸지 않은 것을 알려 줍니다", async () => {
    let step = 0;
    const compareJob: OpsJobView = { ...job("c-1", "running"), type: "compare", progress: { done: 500, total: 2998, message: "발주오라 상품 목록 500 / 2998개 읽음" } };
    apiFetch.mockImplementation(async (path: string) => {
      if (path !== "/baljuora/admin/ops-sync") return json({});
      if (step === 0) return json(idle({ products: { phase: "reading", compareJob, pushJob: null, options: null, planned: null, stalled: false, error: null, last: null } }));
      if (step === 1) return json(idle({ products: { phase: "sending", compareJob: { ...compareJob, status: "done" }, pushJob: job("p-1", "running", { type: "push", progress: { done: 3, total: 12, message: "수정 3 / 12" } }), options: null, planned: { updates: 9, creates: 2, hides: 1, categories: 0 }, stalled: false, error: null, last: null } }));
      return json(idle({ products: { phase: "done", compareJob: { ...compareJob, status: "done" }, pushJob: job("p-1", "done", { type: "push" }), options: null, planned: null, stalled: false, error: null, last: {
        compareJobId: "c-1", pushJobId: "p-1", finishedAt: new Date().toISOString(), received: 2998, planned: { updates: 9, creates: 2, hides: 1, categories: 0 },
        result: { succeeded: 11, failed: 1, created: 2, updated: 8, hidden: 1, categoryApplied: 0, categorySkipped: 0 },
        failures: [{ name: "약과", error: "발주오라 응답 400" }], leftovers: { pull: 4, initial: 0, only: 6, sameName: 1, newSupplier: 0, shippingUnlinked: 0 }, nothing: false, error: null
      } } }));
    });
    render(<Home />);
    expect(await screen.findByText("발주오라 상품 목록 500 / 2998개 읽음")).toBeTruthy();
    const steps = document.querySelector(".osync-steps") as HTMLElement;
    expect(within(steps).getByText("발주오라 상품 읽기").closest("li")?.className).toContain("is-current");
    step = 1;
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 2100)); });
    expect(await screen.findByText(/보내는 것: 신규 등록 2개 · 바뀐 상품 9개 · 지운 상품 미노출 1개/)).toBeTruthy();
    expect(screen.getByText(/발주오라로 보내는 중 3 \/ 12/)).toBeTruthy();
    step = 2;
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 2100)); });
    const panel = (await screen.findByText(/상품 동기화 완료/)).closest("section") as HTMLElement;
    expect(within(panel).getByText(/발주오라 상품 2,998개를 새로 읽음/)).toBeTruthy();
    expect(within(panel).getByText("신규 등록").nextSibling?.textContent).toBe("2개");
    expect(within(panel).getByText("지운 상품").nextSibling?.textContent).toBe("1개");
    expect(within(panel).getByText(/약과/)).toBeTruthy();
    expect(within(panel).getByText(/발주오라에서 바뀐 상품 4개 · 발주오라에만 있는 상품 6개/)).toBeTruthy();
    expect(within(panel).getByRole("link", { name: /발주오라 동기화 화면에서 보기/ }).getAttribute("href")).toBe("/admin/sync");
  }, 10_000);
});

describe("발주오라 동기화 화면 숫자 카드 팝업", () => {
  const helpers = {
    renderValue: (_field: string, value: string | number | null) => <span>{value === null ? "없음" : typeof value === "number" ? `${value.toLocaleString("ko-KR")}원` : value}</span>,
    doogoCategoryName: (id: string) => (id === "cat-1" ? "🥕 농산" : ""),
    categoryPath: (id: string) => id,
    policyLinked: () => true
  };
  const pushItems: StatChangeItem[] = [{
    productId: "p-1", kind: "update", code: "PD-1", name: "샤인머스캣 2kg", imageUrl: null, categoryId: "cat-1", isVisible: true, supplierName: "청도농원", syncStatus: "imported", lastPushedAt: null,
    baseAt: "2026-11-26T00:12:00.000Z", lastPulledAt: "2026-11-27T11:36:00.000Z",
    diffs: [
      { field: "supplyPrice", doogo: 12500, baljuora: 12000, direction: "push", base: { doogo: 12000, baljuora: 12000 } },
      { field: "consumerPrice", doogo: 20000, baljuora: 21000, direction: "pull", base: { doogo: 20000, baljuora: 20000 } }
    ]
  }];

  it("보낼 변경: 상품마다 칸별 DB센터 값·발주오라 값·마지막으로 맞춘 값과 판단(보냄/안 보냄)을 보여 줍니다", () => {
    render(<MemoryRouter><BaljuoraStatModal kind="push" count={1} onClose={vi.fn()} onOpenTab={vi.fn()} pushItems={pushItems} newItems={[]} onlyItems={[]} helpers={helpers as never} lastCompareAt="2026-11-27T11:36:00.000Z" /></MemoryRouter>);
    const dialog = screen.getByRole("dialog", { name: /보낼 변경/ });
    expect(within(dialog).getByText(/보낼 칸: 공급가 1/)).toBeTruthy();
    const rows = within(dialog).getAllByRole("row");
    const price = rows.find((row) => row.textContent?.includes("공급가 ← 일반공급가") || row.textContent?.includes("공급가"))!;
    expect(price.textContent).toContain("DB센터에서 바뀜");
    expect(price.textContent).toContain("12,500원");
    expect(price.textContent).toContain("12,000원");
    expect(price.textContent).toContain("그 뒤 바뀜");
    expect(price.textContent).toContain("보냄");
    const consumer = rows.find((row) => row.textContent?.includes("발주오라에서 바뀜"))!;
    expect(consumer.textContent).toContain("보내지 않음");
    expect(within(dialog).getByText(/마지막으로 맞춘 때/)).toBeTruthy();
  });

  it("연결된 상품: 서버에서 20개씩 받아 쪽 번호로 넘기고, 다른 칸 있음으로 거릅니다", async () => {
    const pageOf = (page: number) => ({
      total: 2140, page, size: 20, pages: 107, filter: "all", counts: { all: 2140, diff: 19, same: 2121 },
      items: Array.from({ length: 20 }, (_, index) => ({ productId: `p-${page}-${index}`, name: `상품 ${page}-${index}`, code: `PD-${page}-${index}`, imageUrl: null, categoryName: "🥕 농산", supplierName: "청도농원", isVisible: true, isSoldOut: false, generalPrice: 12000, studentPrice: 11000, baljuora: { id: `bj-${index}`, code: `PD-${page}-${index}`, name: `상품 ${page}-${index}`, imageUrl: null, supplyPrice: 12000, groupPrice: null, groupPriceKnown: true, isVisible: true, isSoldOut: false }, diffCount: index === 0 ? 1 : 0, diffFields: index === 0 ? ["supplyPrice"] : [], syncStatus: "imported", lastPulledAt: "2026-11-27T11:36:00.000Z", lastPushedAt: null }))
    });
    const requested: string[] = [];
    apiFetch.mockImplementation(async (path: string) => {
      requested.push(path);
      const params = new URLSearchParams(path.split("?")[1]);
      return json(pageOf(Number(params.get("page"))));
    });
    render(<MemoryRouter><BaljuoraStatModal kind="linked" count={2140} onClose={vi.fn()} onOpenTab={vi.fn()} pushItems={[]} newItems={[]} onlyItems={[]} helpers={helpers as never} lastCompareAt={null} /></MemoryRouter>);
    expect(await screen.findByText("상품 1-0")).toBeTruthy();
    expect(screen.getByText("1–20개 / 총 2,140개")).toBeTruthy();
    expect(screen.getByText(/다른 칸 1개 · 공급가/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(await screen.findByText("상품 2-0")).toBeTruthy();
    expect(requested.some((path) => path.includes("page=2") && path.includes("size=20"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /다른 칸 있음 19/ }));
    await waitFor(() => expect(requested.some((path) => path.includes("filter=diff") && path.includes("page=1"))).toBe(true));
  });

  it("신규 등록·발주오라에만 있음: 어떤 상품인지(들어갈 값·지운 상품·상태)와 무엇인지 설명을 보여 줍니다", () => {
    const onOpenTab = vi.fn();
    const onClose = vi.fn();
    const { unmount } = render(<MemoryRouter><BaljuoraStatModal kind="new" count={1} onClose={onClose} onOpenTab={onOpenTab} pushItems={[]} newItems={[{ productId: "p-2", kind: "new", code: "PD-2", name: "신상 사과 3kg", imageUrl: null, categoryId: "cat-1", isVisible: true, supplierName: "청도농원", syncStatus: null, lastPushedAt: null, diffs: [], preview: { supplyPrice: 15000, groupPrice: 14000, consumerPrice: null, purchaseCost: 11000 } }]} onlyItems={[]} helpers={helpers as never} lastCompareAt={null} /></MemoryRouter>);
    expect(screen.getByText(/DB센터에는 있고 발주오라에는 없는 상품이에요/)).toBeTruthy();
    expect(screen.getByText(/발주오라에 들어갈 값: 공급가 15,000원 · 수강생\(그룹\) 14,000원/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "아래 목록 탭에서 보기" }));
    expect(onOpenTab).toHaveBeenCalledWith("new");
    expect(onClose).toHaveBeenCalled();
    unmount();
    render(<MemoryRouter><BaljuoraStatModal kind="only" count={1} onClose={vi.fn()} onOpenTab={vi.fn()} pushItems={[]} newItems={[]} onlyItems={[{ id: "bj-9", kind: "product", code: "PD-9", name: "단종 포도", supplyPrice: 9000, consumerPrice: null, purchaseCost: 7000, imageUrls: [], isVisible: false, isSoldOut: true, updatedAt: null, deletedMatch: { id: "p-9", name: "단종 포도", code: "PD-9" } }]} helpers={helpers as never} lastCompareAt={null} /></MemoryRouter>);
    expect(screen.getByText("발주오라 미노출")).toBeTruthy();
    expect(screen.getByText("품절")).toBeTruthy();
    expect(screen.getByText(/DB센터에서 지운 상품\(PD-9\)/)).toBeTruthy();
  });
});

describe("DB센터 ↔ 발주오라 상품 수 맞춰 보기", () => {
  const view: ReconcileView = {
    compared: true,
    lastCompareAt: "2026-11-27T11:36:00.000Z",
    baljuora: { total: 2998, selling: 1779, soldOut: 1219, visible: 1838, hidden: 1160, hiddenSoldOut: 1160, source: "compare" },
    doogo: { total: 2140, selling: 1804, soldOut: 336, seasonEnded: 0, visible: 1809, hidden: 331, hiddenSoldOut: 300, deleted: 900 },
    linked: 2140,
    doogoOnly: { total: 0, visible: 0, hidden: 0 },
    baljuoraOnly: { total: 858, deleted: 840, deletedLinked: 10, never: 8, selling: 60, soldOut: 798, visible: 2, hidden: 856, hiddenSoldOut: 790, sameName: 0, importIds: Array.from({ length: 858 }, (_, index) => `bj-${index}`) },
    soldOut: { doogoSellingBaljuoraSoldOut: 3, doogoSoldOutBaljuoraSelling: 1, productIds: ["p-1", "p-2", "p-3", "p-4"] },
    visible: { doogoHiddenBaljuoraVisible: 0, doogoVisibleBaljuoraHidden: 2 }
  };
  const counts = (total: number, selling: number, soldOut: number, visible: number) => ({ total, selling, soldOut, seasonEnded: 0, visible, hidden: total - visible });
  const align = (overrides: Partial<AlignView> = {}): AlignView => ({
    compared: true,
    lastCompareAt: "2026-11-27T11:36:00.000Z",
    bundles: 0,
    doogo: counts(2140, 1804, 336, 1809),
    baljuora: { ...counts(2998, 1779, 1219, 1838), unknown: 0 },
    linked: 2140,
    doogoOnly: { total: 0, visible: 0, soldOut: 0 },
    pending: { sameName: 0, sameNameReview: 0, imports: 858, importRestore: 850, orphans: 0, states: 6, stateDetail: { soldOut: 3, restock: 1, seasonToSoldOut: 0, show: 0, hide: 2 }, total: 864 },
    matched: false,
    run: null,
    last: null,
    ...overrides
  });
  const doneLast: NonNullable<AlignView["last"]> = {
    startedAt: "2026-11-27T13:40:00.000Z",
    finishedAt: "2026-11-27T13:42:00.000Z",
    by: "master",
    trigger: "admin",
    totals: { linked: 0, removed: 0, imported: 858, restored: 850, created: 8, states: 6, failed: 0 },
    failures: [],
    before: { doogo: counts(2140, 1804, 336, 1809), baljuora: { ...counts(2998, 1779, 1219, 1838), unknown: 0 } },
    after: { doogo: counts(2998, 1779, 1219, 1838), baljuora: { ...counts(2998, 1779, 1219, 1838), unknown: 0 } },
    doogoOnly: 0,
    sameNameReview: 0,
    bundles: 0,
    lastCompareAt: "2026-11-27T11:36:00.000Z",
    matched: true
  };

  it("양쪽 전체·판매중·품절·노출 수와 차이 원인을 보여 주고, '발주오라와 똑같이 맞추기'를 끝날 때까지 이어서 부릅니다", async () => {
    const confirm = vi.fn((_message?: string) => true);
    vi.stubGlobal("confirm", confirm);
    const onChanged = vi.fn(async () => undefined);
    let runs = 0;
    apiFetch.mockImplementation(async (path: string) => {
      if (path === "/baljuora/admin/reconcile") return json(view);
      if (path === "/baljuora/admin/align") return json(align());
      if (path === "/baljuora/admin/align/run") {
        runs += 1;
        // 첫 번째는 시간 안에 다 못 끝냄 → 화면이 다시 부름 → 두 번째에 끝
        if (runs === 1) return json({ done: false, busy: false, view: align({ pending: { ...align().pending, imports: 400, total: 406 }, run: { startedAt: doneLast.startedAt, trigger: "admin", active: false, totals: { ...doneLast.totals, imported: 458, restored: 450, created: 8, states: 0 }, failures: 0 } }) });
        return json({ done: true, busy: false, view: align({ doogo: doneLast.after.doogo, pending: { ...align().pending, imports: 0, importRestore: 0, states: 0, total: 0 }, matched: true, last: doneLast }) });
      }
      throw new Error(`unexpected ${path}`);
    });
    render(<BaljuoraReconcileCard stamp={1} disabled={false} onChanged={onChanged} />);
    const table = await screen.findByRole("table", { name: "DB센터와 발주오라 상품 수" });
    const total = within(table).getAllByRole("row").find((row) => row.textContent?.startsWith("전체 상품"))!;
    expect(total.textContent).toContain("2,140");
    expect(total.textContent).toContain("2,998");
    expect(total.textContent).toContain("발주오라 +858");
    expect(screen.getByText(/DB센터에서 지운 상품 850개\(발주오라에는 남아 있음\)/)).toBeTruthy();
    // 할 일: 가져올 상품 858개(지운 상품 850개 되살림) · 판매 상태·노출 6개
    expect(screen.getByText("858개")).toBeTruthy();
    expect(screen.getByText(/DB센터에서 지운 상품 850개는 되살림/)).toBeTruthy();
    expect(screen.getByText(/품절로 3 · 판매중으로 1 · 숨김으로 2/)).toBeTruthy();
    // 예전의 숨김 가져오기·품절만 맞추기 버튼은 없고 한 번에 맞추는 버튼 하나
    expect(screen.queryByRole("button", { name: /DB센터로 가져오기\(숨김\)/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "발주오라 기준으로 품절 맞추기" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "발주오라와 똑같이 맞추기" }));
    expect(String(confirm.mock.calls[0]?.[0])).toContain("발주오라에만 있는 상품 858개");
    expect(String(confirm.mock.calls[0]?.[0])).toContain("공개 '가격변동'·'품절이슈'·'신규상품'에는 올리지 않아요");
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(runs).toBe(2);
    expect(toastMock.success).toHaveBeenCalledWith(expect.stringContaining("DB센터 2,998개 = 발주오라 2,998개"));
    expect(await screen.findByText(/발주오라와 상품 수가 같아요/)).toBeTruthy();
    expect(screen.getByText(/가져온 상품 858개\(지운 상품 되살림 850 · 새로 8\)/)).toBeTruthy();
  });

  it("맞춘 뒤에는 같다고 보여 주고(배포 때 자동이면 그렇게), 취소하면 부르지 않습니다", async () => {
    const confirm = vi.fn((_message?: string) => false);
    vi.stubGlobal("confirm", confirm);
    const calls: string[] = [];
    apiFetch.mockImplementation(async (path: string) => {
      calls.push(path);
      if (path === "/baljuora/admin/reconcile") return json(view);
      if (path === "/baljuora/admin/align") return json(align({ pending: { ...align().pending, imports: 2, importRestore: 0, states: 0, total: 2 }, last: { ...doneLast, trigger: "deploy" } }));
      return json({});
    });
    render(<BaljuoraReconcileCard stamp={1} disabled={false} onChanged={vi.fn()} />);
    expect(await screen.findByText(/운영 배포 때 자동/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "발주오라와 똑같이 맞추기" }));
    expect(confirm).toHaveBeenCalled();
    expect(calls).not.toContain("/baljuora/admin/align/run");
  });
});
