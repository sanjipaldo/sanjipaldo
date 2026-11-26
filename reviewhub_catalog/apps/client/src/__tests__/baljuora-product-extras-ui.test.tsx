// 상품 정보 칸 화면(2026-11-26 관리자 요청 "발주오라 상품관리자 페이지와 빠지는 거 없이 양방향으로"):
// 관리자 상품 창의 '발주오라 상품 정보' 묶음과, 동기화 화면 맞추기 카드의 방향(발주오라 → DB센터 · DB센터 → 발주오라)·칸 고르기.
import React, { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyProductExtras, type ProductExtras } from "@repo/shared/product-extras";
import type { BaljuoraFieldDiff } from "@repo/shared/baljuora-sync";

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock, Toaster: () => null }));

import { ProductExtrasSection, type BaljuoraExtraHint, type ProductExtrasStatus } from "@/pages/admin/ProductExtrasSection";
import { BaljuoraMasterPanel } from "@/pages/admin/BaljuoraMasterPanel";

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

function Harness({ initial, status = "ready", baljuora = null, onChange }: { initial: ProductExtras; status?: ProductExtrasStatus; baljuora?: BaljuoraExtraHint; onChange?: (value: ProductExtras) => void }) {
  const [value, setValue] = useState(initial);
  return <ProductExtrasSection value={value} status={status} taxableDefault={false} baljuora={baljuora} onChange={(next) => { setValue(next); onChange?.(next); }} />;
}

describe("관리자 상품 창 > 발주오라 상품 정보", () => {
  it("과세 여부(자동·과세·비과세)·내용량·발주마감을 고치고, 발주오라 값이 다르면 칸 아래에 보여 줍니다", () => {
    const changes: ProductExtras[] = [];
    render(<Harness initial={{ ...emptyProductExtras(), barcode: "8801", certificationKinds: ["haccp"], taxonomyName: "농산물 > 과일" }} baljuora={{ extra: { barcode: "8802", description: "아삭한 부사" }, isTaxable: true }} onChange={(value) => changes.push(value)} />);
    const section = screen.getByRole("region", { name: "발주오라 상품 정보" });
    expect(within(section).getByText("발주오라: 8802")).toBeTruthy();
    expect(within(section).getByText("발주오라: 아삭한 부사")).toBeTruthy();
    expect(within(section).getByText("발주오라: 과세")).toBeTruthy(); // 자동(비과세)과 발주오라 과세가 다름
    fireEvent.click(within(section).getByRole("radio", { name: "과세" }));
    expect(changes.at(-1)?.isTaxable).toBe(true);
    expect(within(section).queryByText("발주오라: 과세")).toBeNull();
    fireEvent.change(within(section).getByLabelText("내용량 양"), { target: { value: "5" } });
    fireEvent.change(within(section).getByLabelText("내용량 단위"), { target: { value: "kg" } });
    fireEvent.change(within(section).getByLabelText("내용량 개수"), { target: { value: "10" } });
    fireEvent.change(within(section).getByLabelText("내용량 기준"), { target: { value: "each" } });
    expect(within(section).getByText("보이는 모양: 개당 0.5kg × 10개")).toBeTruthy();
    expect(changes.at(-1)).toMatchObject({ contentAmount: 5, contentUnit: "kg", contentCount: 10, contentBasis: "each" });
    // 인증·상품 분류는 발주오라에서 가져온 값을 보여 주기만
    expect(within(section).getByText("HACCP")).toBeTruthy();
    expect(within(section).getByText("농산물 > 과일")).toBeTruthy();
  });

  it("DB 업데이트 전(표 없음)이면 칸을 막고 안내합니다", () => {
    render(<Harness initial={emptyProductExtras()} status="missing" />);
    expect(screen.getByText(/운영 배포 후/)).toBeTruthy();
    // 칸 묶음(fieldset)을 막으면 브라우저가 안쪽 칸을 모두 막습니다.
    expect((screen.getByRole("radio", { name: "과세" }).closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
  });
});

function diff(field: BaljuoraFieldDiff["field"], direction: BaljuoraFieldDiff["direction"], extra: Partial<BaljuoraFieldDiff> = {}): BaljuoraFieldDiff {
  return { field, doogo: "d", baljuora: "b", direction, ...extra };
}

describe("동기화 > 맞추기 카드(양방향)", () => {
  const items = [
    { productId: "p-1", kind: "update" as const, diffs: [diff("supplyPrice", "pull"), diff("origin", "initial", { doogoEmpty: false, baljuoraEmpty: false }), diff("barcode", "pull", { doogo: null, doogoEmpty: true, baljuoraEmpty: false }), diff("certification", "pull", { doogo: null, doogoEmpty: true, baljuoraEmpty: false }), diff("visible", "initial", { doogo: 0, baljuora: 1, doogoEmpty: false, baljuoraEmpty: false })] },
    { productId: "p-2", kind: "update" as const, diffs: [diff("soldOut", "push", { doogo: 1, baljuora: 0, doogoEmpty: false, baljuoraEmpty: false }), diff("tradeType", "initial", { doogo: "overseas", baljuora: null, doogoEmpty: false, baljuoraEmpty: false })] }
  ];

  function show(onPush = vi.fn()) {
    render(<BaljuoraMasterPanel items={items} baljuoraOnlyIds={[]} doogoOnlyCount={0} compared lastCompareAt={new Date().toISOString()} disabled={false} onCompare={vi.fn()} onDone={vi.fn(async () => undefined)} onPush={onPush} />);
    return onPush;
  }

  const count = (label: string) => {
    const field = screen.getByText(label, { selector: ".bj-master-field span" }).closest("label") as HTMLElement;
    return { text: field.querySelector("em")?.textContent, checked: (field.querySelector("input") as HTMLInputElement).checked };
  };

  it("발주오라 → DB센터: 가져올 수 있는 칸만 세고, 해외배송(보내기만)은 없으며, 도매몰 노출은 처음에 고르지 않음", () => {
    show();
    expect(screen.getByRole("heading", { name: "발주오라 기준으로 DB센터 맞추기" })).toBeTruthy();
    expect(count("공급가")).toEqual({ text: "1", checked: true });
    expect(count("바코드")).toEqual({ text: "1", checked: true });
    expect(count("인증")).toEqual({ text: "1", checked: true });
    expect(count("도매몰 노출")).toEqual({ text: "1", checked: false });
    expect(screen.queryByText("해외배송", { selector: ".bj-master-field span" })).toBeNull();
  });

  it("DB센터 → 발주오라: DB센터가 비어 있는 칸·인증은 보내지 않고, 고른 칸으로 동기화 작업을 만듭니다", () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const onPush = show();
    fireEvent.click(screen.getByRole("tab", { name: /DB센터 → 발주오라/ }));
    expect(screen.getByRole("heading", { name: "DB센터 기준으로 발주오라 맞추기" })).toBeTruthy();
    expect(screen.queryByText("인증", { selector: ".bj-master-field span" })).toBeNull();
    expect(count("바코드").text).toBe("0");
    expect(count("해외배송").text).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: /DB센터 기준으로 맞추기/ }));
    expect(onPush).toHaveBeenCalledWith({ "p-1": ["supplyPrice", "origin"], "p-2": ["soldOut", "tradeType"] });
  });
});
