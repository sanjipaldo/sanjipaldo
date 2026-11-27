// 2026-11-27 관리자 요청 화면:
// ① 상품 리스트 '발주오라 번호' — 발주오라 상품 리스트처럼 지금 목록에서 최근 등록한 상품이 가장 큰 번호(전체 2,998개면 맨 위 2998, 맨 아래 1)
// ② '발주오라 새로 읽고 맞추기' — 비교(새로 읽기)가 끝나면 저절로 '발주오라와 똑같이 맞추기'(노출 1,865 vs 1,864 같은 차이를 맞춤)
// ③ '발주오라 대시보드' 칸 — 주문 동기화 때 읽은 발주오라 대시보드 숫자 그대로 + DB센터 계산과 칸마다 비교(같으면 ✓, 다르면 DB센터 숫자)
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock, Toaster: () => null }));
const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import { baljuoraNumbers, sortByBaljuoraOrder } from "@/lib/baljuora-number";
import { BaljuoraReconcileCard, type AlignView, type ReconcileView } from "@/pages/admin/BaljuoraReconcileCard";
import { BaljuoraOfficialPanel, type OfficialDashboardData } from "@/pages/admin/BaljuoraOfficialPanel";
import { DEFAULT_SALES_BASIS } from "@repo/shared/baljuora-dashboard";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(status < 400 ? { ok: true, data } : { ok: false, error: { message: "실패" } }), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  apiFetch.mockReset();
  toastMock.info.mockReset();
  toastMock.success.mockReset();
  window.sessionStorage.clear();
});

describe("상품 리스트 발주오라 번호", () => {
  const items = ["하이웰", "네이처맥스", "감귤", "새로 등록", "DB센터만"].map((name) => ({ id: name }));
  // 서버 순서(최근 등록이 앞): 네이처맥스 → 감귤 → DB센터만 → 하이웰. '새로 등록'은 서버 순서에 없음(방금 등록)
  const order = new Map([["네이처맥스", 0], ["감귤", 1], ["DB센터만", 2], ["하이웰", 3]]);

  it("전체 목록: 최근 등록이 위, 맨 위 번호 = 목록 상품 수, 맨 아래(가장 먼저 등록) = 1", () => {
    const sorted = sortByBaljuoraOrder(items, order);
    expect(sorted.map((item) => item.id)).toEqual(["새로 등록", "네이처맥스", "감귤", "DB센터만", "하이웰"]);
    expect([...baljuoraNumbers(sorted)]).toEqual([["새로 등록", 5], ["네이처맥스", 4], ["감귤", 3], ["DB센터만", 2], ["하이웰", 1]]);
  });

  it("거른 목록(예: 노출 상품만)은 그 목록 안에서 다시 번호를 붙입니다 — 발주오라 '노출' 거르기처럼", () => {
    const visibleOnly = items.filter((item) => item.id !== "감귤" && item.id !== "새로 등록");
    const numbers = baljuoraNumbers(sortByBaljuoraOrder(visibleOnly, order));
    expect([...numbers]).toEqual([["네이처맥스", 3], ["DB센터만", 2], ["하이웰", 1]]);
  });
});

describe("발주오라 새로 읽고 맞추기", () => {
  const counts = (total: number, selling: number, soldOut: number, visible: number) => ({ total, selling, soldOut, seasonEnded: 0, visible, hidden: total - visible });
  const view: ReconcileView = {
    compared: true,
    lastCompareAt: "2026-11-27T11:36:00.000Z",
    baljuora: { total: 2998, selling: 1844, soldOut: 1154, visible: 1865, hidden: 1133, hiddenSoldOut: 1100, source: "compare" },
    doogo: { total: 2998, selling: 1844, soldOut: 1154, seasonEnded: 0, visible: 1865, hidden: 1133, hiddenSoldOut: 1100, deleted: 40 },
    linked: 2998,
    doogoOnly: { total: 0, visible: 0, hidden: 0 },
    baljuoraOnly: { total: 0, deleted: 0, deletedLinked: 0, never: 0, selling: 0, soldOut: 0, visible: 0, hidden: 0, hiddenSoldOut: 0, sameName: 0, importIds: [] },
    soldOut: { doogoSellingBaljuoraSoldOut: 0, doogoSoldOutBaljuoraSelling: 0, productIds: [] },
    visible: { doogoHiddenBaljuoraVisible: 0, doogoVisibleBaljuoraHidden: 0 }
  };
  const pendingNone = { sameName: 0, sameNameReview: 0, imports: 0, importRestore: 0, orphans: 0, states: 0, stateDetail: { soldOut: 0, restock: 0, seasonToSoldOut: 0, show: 0, hide: 0 }, total: 0 };
  const align = (overrides: Partial<AlignView> = {}): AlignView => ({
    compared: true,
    lastCompareAt: "2026-11-27T11:36:00.000Z",
    bundles: 0,
    doogo: counts(2998, 1844, 1154, 1865),
    baljuora: { ...counts(2998, 1844, 1154, 1865), unknown: 0 },
    linked: 2998,
    doogoOnly: { total: 0, visible: 0, soldOut: 0 },
    pending: pendingNone,
    matched: true,
    run: null,
    last: null,
    ...overrides
  });

  it("누르면 비교 작업을 만들고(책갈피 안내), 그 뒤에 끝난 비교가 보이면 확인 없이 저절로 맞추고 한 번만 부릅니다", async () => {
    const confirm = vi.fn((_message?: string) => true);
    vi.stubGlobal("confirm", confirm);
    const onCompare = vi.fn(async () => undefined);
    const onChanged = vi.fn(async () => undefined);
    let current = align();
    let runs = 0;
    apiFetch.mockImplementation(async (path: string) => {
      if (path === "/baljuora/admin/reconcile") return json(view);
      if (path === "/baljuora/admin/align") return json(current);
      if (path === "/baljuora/admin/align/run") {
        runs += 1;
        return json({ done: true, busy: false, view: align({ lastCompareAt: current.lastCompareAt, doogo: counts(2998, 1844, 1154, 1864), baljuora: { ...counts(2998, 1844, 1154, 1864), unknown: 0 } }) });
      }
      throw new Error(`unexpected ${path}`);
    });
    const { rerender } = render(<BaljuoraReconcileCard stamp={1} disabled={false} onChanged={onChanged} onCompare={onCompare} />);
    await screen.findByText(/발주오라와 상품 수가 같아요/);
    fireEvent.click(screen.getByRole("button", { name: "발주오라 새로 읽고 맞추기" }));
    expect(String(confirm.mock.calls[0]?.[0])).toContain("발주오라 상품을 새로 읽고");
    await waitFor(() => expect(onCompare).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/책갈피 '두고푸드 동기화'를 눌러 주세요/)).toBeTruthy();
    expect(runs).toBe(0);
    // 책갈피로 새로 읽기가 끝남 → 동기화 화면이 다시 불러옴(stamp) → 저절로 맞추기
    current = align({ lastCompareAt: new Date(Date.now() + 1000).toISOString(), pending: { ...pendingNone, states: 1, stateDetail: { ...pendingNone.stateDetail, hide: 1 }, total: 1 }, matched: false });
    rerender(<BaljuoraReconcileCard stamp={2} disabled={false} onChanged={onChanged} onCompare={onCompare} />);
    await waitFor(() => expect(runs).toBe(1));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(toastMock.info).toHaveBeenCalledWith(expect.stringContaining("새로 읽었어요"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(window.sessionStorage.getItem("doogo:baljuora-align-after-compare")).toBeNull();
    // 한 번 더 그려도 다시 맞추지 않음
    rerender(<BaljuoraReconcileCard stamp={3} disabled={false} onChanged={onChanged} onCompare={onCompare} />);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(runs).toBe(1);
  });

  it("취소하면 비교 작업을 만들지 않습니다", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    const onCompare = vi.fn();
    apiFetch.mockImplementation(async (path: string) => json(path === "/baljuora/admin/reconcile" ? view : align()));
    render(<BaljuoraReconcileCard stamp={1} disabled={false} onChanged={vi.fn()} onCompare={onCompare} />);
    fireEvent.click(await screen.findByRole("button", { name: "발주오라 새로 읽고 맞추기" }));
    expect(onCompare).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("doogo:baljuora-align-after-compare")).toBeNull();
  });
});

describe("발주오라 대시보드 칸", () => {
  const data: OfficialDashboardData = {
    available: true,
    today: "2026-11-27",
    basis: DEFAULT_SALES_BASIS,
    basisText: "배송비 포함 · 주문 상품 줄 수 · 전량 취소·반품 줄 뺌 · 주문대기 뺌",
    calibration: { basis: DEFAULT_SALES_BASIS, at: "2026-11-27T14:51:09.000Z", score: 9, total: 10 },
    view: {
      at: "2026-11-27T14:51:09.000Z",
      recentOrders: { items: [{ key: "purchased", label: "발주완료", count: 2 }, { key: "shipping", label: "배송중", count: 48 }, { key: "total", label: "전체주문", count: 144 }, { key: "cancelled", label: "취소", count: 26 }] },
      periods: [{ key: "thisMonth", label: "이번달", sales: 12020997, purchase: 11630220, margin: 390777 }],
      topSellers: { period: { key: "thisMonth", from: "2026-11-01", to: "2026-11-27", label: "이번달" }, rows: [{ name: "나도건강", orders: 102, amount: 4257500 }, { name: "티젠아이", orders: 38, amount: 2794300 }] },
      topProducts: null,
      errors: [{ endpoint: "statistics/top-products", status: 500, message: "Internal Server Error" }]
    },
    ours: {
      periods: [{ key: "thisMonth", label: "이번달", sales: 12020997, purchase: 11630220, margin: 390777, ours: { sales: 12020997, purchase: 11630220, margin: 390777, orders: 0, quantity: 0 } }],
      sellers: [
        { name: "나도건강", orders: 102, amount: 4257500, ours: { name: "나도건강", orders: 102, quantity: 301, amount: 4257500 } },
        { name: "티젠아이", orders: 38, amount: 2794300, ours: { name: "티젠아이", orders: 36, quantity: 97, amount: 2794300 } }
      ],
      products: []
    },
    recentOurs: { from: "2026-11-21", to: "2026-11-27", total: 144, orders: 120, cancelled: 26, byStatus: [{ status: "purchased", label: "발주완료", lines: 2 }, { status: "shipping", label: "배송중", lines: 47 }] }
  };

  it("발주오라 숫자를 그대로 보여 주고, DB센터 계산과 같으면 ✓, 다르면 DB센터 숫자를 붙입니다", async () => {
    apiFetch.mockImplementation(async () => json(data));
    render(<BaljuoraOfficialPanel stamp={1} />);
    expect(await screen.findByRole("heading", { name: "발주오라 대시보드" })).toBeTruthy();
    const recent = screen.getByLabelText("최근 7일간 주문 현황");
    expect(within(recent).getByText("144")).toBeTruthy();
    // 배송중: 발주오라 48 · DB센터 47 → 다름
    expect(within(recent).getByText("DB센터 47")).toBeTruthy();
    expect(screen.getByText("4,257,500")).toBeTruthy();
    expect(screen.getByText("12,020,997")).toBeTruthy();
    // 티젠아이 주문건: 발주오라 38 · DB센터 36
    expect(screen.getByText("DB센터 36")).toBeTruthy();
    expect(screen.getAllByText("DB센터와 같음").length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText(/상품별 매출은\(는\) 발주오라 응답을 아직 읽지 못했어요/)).toBeTruthy();
    expect(screen.getByText(/DB센터 계산 기준: 배송비 포함 · 주문 상품 줄 수/)).toBeTruthy();
  });

  it("아직 주문 동기화로 읽은 숫자가 없으면 주문 동기화를 누르라고 안내합니다", async () => {
    apiFetch.mockImplementation(async () => json({ available: false, basis: DEFAULT_SALES_BASIS, basisText: "배송비 포함 · 주문 상품 줄 수 · 전량 취소·반품 줄 뺌 · 주문대기 뺌", calibration: null }));
    render(<BaljuoraOfficialPanel />);
    expect(await screen.findByText(/주문 동기화/)).toBeTruthy();
    expect(screen.getByText(/여기 그대로 보이고/)).toBeTruthy();
  });
});
