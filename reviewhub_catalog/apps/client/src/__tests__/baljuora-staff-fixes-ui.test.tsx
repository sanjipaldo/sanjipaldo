// 2026-11-27 직원(MD) 신고 화면: 신규 등록의 '같은 상품으로 연결' · 발주오라에만 있음의 'DB센터에서 지운 상품' 표시 ·
// 맞추기 카드의 도매몰 노출 두 묶음(발주오라 노출·DB센터 숨김 / 발주오라 미노출·DB센터 공개)과 상품별 고르기.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BaljuoraFieldDiff } from "@repo/shared/baljuora-sync";

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock, Toaster: () => null }));
const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import { BaljuoraMasterPanel } from "@/pages/admin/BaljuoraMasterPanel";
import { BaljuoraSyncAdmin } from "@/pages/admin/BaljuoraSyncAdmin";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(status < 400 ? { ok: true, data } : { ok: false, error: { message: "실패" } }), { status, headers: { "Content-Type": "application/json" } });
}

function diff(field: BaljuoraFieldDiff["field"], direction: BaljuoraFieldDiff["direction"], extra: Partial<BaljuoraFieldDiff> = {}): BaljuoraFieldDiff {
  return { field, doogo: 1000, baljuora: 2000, direction, ...extra };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  apiFetch.mockReset();
  toastMock.success.mockReset();
  toastMock.info.mockReset();
});

describe("맞추기 카드: 도매몰 노출 두 묶음", () => {
  const visible = (doogo: number, baljuora: number) => diff("visible", "initial", { doogo, baljuora, doogoEmpty: false, baljuoraEmpty: false });
  const items = [
    { productId: "p-on-1", kind: "update" as const, name: "청도 반시 5kg", code: "PD-1", diffs: [visible(0, 1)] },
    { productId: "p-on-2", kind: "update" as const, name: "레드키위 3kg", code: "PD-2", diffs: [visible(0, 1), diff("supplyPrice", "initial")] },
    { productId: "p-off-1", kind: "update" as const, name: "단감 10kg", code: "PD-3", diffs: [visible(1, 0), diff("supplyPrice", "initial")] }
  ];

  const chooseVisible = () => {
    const label = screen.getByText("도매몰 노출", { selector: ".bj-master-field span" }).closest("label") as HTMLElement;
    fireEvent.click(label.querySelector("input") as HTMLInputElement);
  };

  function show(onPush = vi.fn()) {
    render(<BaljuoraMasterPanel items={items} baljuoraOnlyIds={["bj-a", "bj-b"]} restoreCount={1} sameNameOnlyCount={1} doogoOnlyCount={0} compared lastCompareAt={new Date().toISOString()} disabled={false} onCompare={vi.fn()} onDone={vi.fn(async () => undefined)} onPush={onPush} />);
    return onPush;
  }

  it("발주오라 → DB센터: 숨김 → 공개 2개 · 공개 → 숨김 1개로 나눠 보이고, 고르지 않은 상품은 도매몰 노출 없이 가져옵니다", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const bodies: unknown[] = [];
    apiFetch.mockImplementation(async (_path: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return json({ updated: 1, created: 0, unchanged: 0, failed: [], skipped: [] });
    });
    show();
    const split = screen.getByLabelText("도매몰 노출이 다른 상품");
    expect(within(split).getByText("DB센터 숨김 → 공개")).toBeTruthy();
    expect(within(split).getByText("DB센터 공개 → 숨김")).toBeTruthy();
    expect(within(split).getByText("2 / 2")).toBeTruthy();
    expect(within(split).getByText("1 / 1")).toBeTruthy();
    // 지운 상품 되살림·이름 같은 상품 빼 둠 안내
    expect(screen.getByText(/지운 상품 1개는 되살림/)).toBeTruthy();
    expect(screen.getByText(/이름이 같은 상품이 있는 1개는 빼 두었어요/)).toBeTruthy();

    // 도매몰 노출 고르기 → '단감 10kg'(공개 → 숨김)만 빼기
    chooseVisible();
    fireEvent.click(within(split).getByRole("checkbox", { name: /단감 10kg/ }));
    expect(within(split).getByText("0 / 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /발주오라 기준으로 맞추기/ }));
    const message = String((window.confirm as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]);
    expect(message).toContain("도매몰 노출: DB센터 숨김 → 공개 2개 · 공개 → 숨김 0개");
    expect(message).toContain("DB센터에서 지운 상품 1개는 새로 만들지 않고 숨김으로 되살림");
    await waitFor(() => expect(bodies).toHaveLength(3));
    const pulls = bodies as Array<{ productIds?: string[]; fields?: string[]; baljuoraIds?: string[] }>;
    expect(pulls[0]).toMatchObject({ productIds: ["p-on-1", "p-on-2"] });
    expect(pulls[0]?.fields).toContain("visible");
    // '단감 10kg'은 도매몰 노출만 빼고 공급가는 그대로 가져옴
    expect(pulls[1]).toMatchObject({ productIds: ["p-off-1"] });
    expect(pulls[1]?.fields).not.toContain("visible");
    expect(pulls[1]?.fields).toContain("supplyPrice");
    expect(pulls[2]).toEqual({ baljuoraIds: ["bj-a", "bj-b"] });
  });

  it("DB센터 → 발주오라: 묶음 이름이 바뀌고(노출 → 미노출 / 미노출 → 노출), 뺀 묶음의 상품은 도매몰 노출을 보내지 않습니다", () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const onPush = show();
    fireEvent.click(screen.getByRole("tab", { name: /DB센터 → 발주오라/ }));
    const split = screen.getByLabelText("도매몰 노출이 다른 상품");
    expect(within(split).getByText("발주오라 노출 → 미노출")).toBeTruthy();
    expect(within(split).getByText("발주오라 미노출 → 노출")).toBeTruthy();
    chooseVisible();
    // '발주오라 노출 → 미노출' 묶음 통째로 빼기
    fireEvent.click(within(split).getByRole("checkbox", { name: /발주오라 노출 → 미노출/ }));
    fireEvent.click(screen.getByRole("button", { name: /DB센터 기준으로 맞추기/ }));
    expect(onPush).toHaveBeenCalledWith({ "p-on-2": ["supplyPrice"], "p-off-1": ["visible", "supplyPrice"] });
  });
});

describe("발주오라 동기화 화면: 같은 이름 상품 · 지운 상품", () => {
  const overview = { settings: { merchantSlug: "doogobiz24", groupKeyword: "황금농부", categoryMap: {}, baljuoraCategoryMap: {}, shippingPolicyMap: {}, templateCode: null }, doogoCategories: [{ id: "c-ovs", name: "✈️ 해외 건강식품", shippingType: "overseas" }], baljuoraCategories: [], group: null, linkedCount: 1, lastCompareAt: "2026-11-27T01:00:00Z", lastPushAt: null, activeJob: null, jobs: [] };
  const base = { categoryId: "c-ovs", isVisible: true, baljuoraId: null, supplierName: "비타숲", diffs: [], syncStatus: null, lastPushedAt: null, imageUrl: null };
  let changes: Record<string, unknown>;

  beforeEach(() => {
    changes = {
      compared: true,
      lastCompareAt: "2026-11-27T01:00:00Z",
      linkedCount: 1,
      productCount: 3,
      groupPriceReadable: true,
      extrasReady: true,
      unmappedCategories: [],
      items: [
        { ...base, productId: "p-copy", kind: "new", code: "PD1780667766602-1", name: "마우리엔젯 로얄제리 30캡슐", sameName: { baljuoraId: "bj-mau", code: "PD1793847942852", name: "마우리엔젯 로얄제리 30캡슐", holder: { id: "p-hidden", name: "마우리엔젯 로얄제리 30캡슐", code: "PD1793847942852", isVisible: false, deleted: false }, blocked: null } },
        { ...base, productId: "p-blocked", kind: "new", code: "PD-9-1", name: "봄날 사과 5kg", sameName: { baljuoraId: "bj-apple", code: "PD-9", name: "봄날 사과 5kg", holder: { id: "p-apple", name: "봄날 사과 5kg", code: "PD-9", isVisible: true, deleted: false }, blocked: "DB센터 공개 상품 '봄날 사과 5kg'(PD-9)이 이미 이 발주오라 상품과 연결돼 있어요." } },
        { ...base, productId: "p-plain", kind: "new", code: "PD-NEW", name: "새 상품" }
      ],
      baljuoraOnly: [
        { kind: "product", id: "bj-kiwi", code: "PD1791337169317", name: "[제] 레드키위 대과 / 5kg", supplyPrice: 45480, consumerPrice: null, purchaseCost: null, imageUrls: [], isVisible: true, isSoldOut: false, updatedAt: null, deletedMatch: { id: "p-kiwi", name: "[제] 레드키위 대과 / 5kg", code: "PD1791337169317" } }
      ]
    };
  });

  function mockApi(onLink?: (body: unknown) => void, onPull?: (body: unknown) => void) {
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith("/baljuora/admin/overview")) return json(overview);
      if (path.startsWith("/baljuora/admin/changes")) return json(changes);
      if (path === "/baljuora/admin/link-same-name") {
        onLink?.(JSON.parse(String(init?.body)));
        return json({ linked: 1, removed: 1, items: [], failed: [] });
      }
      if (path === "/baljuora/admin/pull") {
        onPull?.(JSON.parse(String(init?.body)));
        return json({ updated: 0, created: 1, restored: 1, unchanged: 0, failed: [], skipped: [] });
      }
      return json({});
    });
  }

  it("신규 등록 탭: 같은 이름 발주오라 상품을 보여 주고 '같은 상품으로 연결'로 잇고, 막힌 상품은 이유를 보여 주며 동기화에서 뺍니다", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("open", vi.fn());
    const links: unknown[] = [];
    mockApi((body) => links.push(body));
    render(<BaljuoraSyncAdmin />);
    fireEvent.click(await screen.findByRole("tab", { name: /신규 등록/ }));
    const row = screen.getByText("마우리엔젯 로얄제리 30캡슐", { selector: "strong" }).closest(".bj-row") as HTMLElement;
    expect(within(row).getByText("발주오라에 같은 이름 상품")).toBeTruthy();
    expect(within(row).getByText("PD1793847942852")).toBeTruthy();
    expect(within(row).getByText(/DB센터 숨김 상품\(PD1793847942852\)과 연결됨 · 연결하면 그 중복 상품은 삭제/)).toBeTruthy();
    const blocked = screen.getByText("봄날 사과 5kg", { selector: "strong" }).closest(".bj-row") as HTMLElement;
    expect(within(blocked).getByText(/이미 이 발주오라 상품과 연결돼 있어요/)).toBeTruthy();
    expect(within(blocked).queryByText("같은 상품으로 연결", { selector: "button" })).toBeNull();
    // 위 '이름 같은 상품 연결'은 바로 연결할 수 있는 1개만
    expect(screen.getByRole("button", { name: /이름 같은 상품 연결 1개/ })).toBeTruthy();

    // 줄 전체가 <label>이라 줄 안 버튼의 접근 이름은 줄 글자 전체가 됨 → 글자로 찾음
    fireEvent.click(within(row).getByText("같은 상품으로 연결", { selector: "button" }));
    const message = String((window.confirm as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]);
    expect(message).toContain("DB센터 상품코드 PD1780667766602-1 → PD1793847942852");
    expect(message).toContain("중복이라 삭제해요");
    await waitFor(() => expect(links).toEqual([{ productIds: ["p-copy"] }]));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(expect.stringContaining("1개를 발주오라 상품과 연결했습니다 · DB센터 숨김 중복 상품 1개 삭제")));

    // 전체 선택 후 동기화: 같은 이름 상품은 빼고 새 상품만 작업으로 만듦
    const jobs: unknown[] = [];
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/baljuora/admin/jobs") {
        jobs.push(JSON.parse(String(init?.body)));
        return json({ job: { id: "job-1", type: "push", status: "waiting", createdAt: "2026-11-27T01:00:00Z", startedAt: null, finishedAt: null, expiresAt: "2026-11-27T02:00:00Z", total: 1, progress: null, summary: null }, code: "ABCDE-FGH23", consoleUrl: "https://console.baljuora.com/doogobiz24/dashboard#doogo-sync=ABCDEFGH23" });
      }
      if (path.startsWith("/baljuora/admin/overview")) return json(overview);
      if (path.startsWith("/baljuora/admin/changes")) return json(changes);
      return json({});
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "전체 선택" }));
    fireEvent.click(screen.getByRole("button", { name: /선택 3개 동기화/ }));
    await waitFor(() => expect(jobs).toEqual([{ type: "push", productIds: ["p-plain"] }]));
    expect(toastMock.info).toHaveBeenCalledWith(expect.stringContaining("이름이 같은 상품이 있는 2개는 보내지 않았어요"));
  });

  it("발주오라에만 있음 탭: DB센터에서 지운 상품은 표시하고, 가져오면 되살린다고 확인 창에 알립니다", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const pulls: unknown[] = [];
    mockApi(undefined, (body) => pulls.push(body));
    render(<BaljuoraSyncAdmin />);
    fireEvent.click(await screen.findByRole("tab", { name: /발주오라에만 있음/ }));
    expect(screen.getByText("DB센터에서 지운 상품 · 가져오면 숨김으로 되살려요")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "전체 선택" }));
    fireEvent.click(screen.getByRole("button", { name: /DB센터로 가져오기/ }));
    expect(String((window.confirm as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])).toContain("그중 1개는 DB센터에서 지운 상품과 상품코드가 같아 새로 만들지 않고 그 상품을 숨김으로 되살려");
    await waitFor(() => expect(pulls).toEqual([{ baljuoraIds: ["bj-kiwi"] }]));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("1개를 DB센터에 등록했습니다(지운 상품 1개는 숨김으로 되살림)."));
  });
});
