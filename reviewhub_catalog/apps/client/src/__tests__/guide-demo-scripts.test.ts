import { describe, expect, it } from "vitest";
import { SELLER_DEMO_VIDEO_IDS } from "@repo/shared/seller-guide";
import { SUPPLIER_DEMO_VIDEO_IDS } from "@repo/shared/supplier-guide";
import { SUPPLIER_DEMO_SCRIPTS, demoDuration, formatDemoTime, isChapterScene, plainCaption, type DemoScript } from "../pages/catalog/guide-demo-scripts";
import { SELLER_DEMO_SCRIPTS } from "../pages/catalog/guide-demo-seller-scripts";

const ALL_SCRIPTS: DemoScript[] = [...Object.values(SUPPLIER_DEMO_SCRIPTS), ...Object.values(SELLER_DEMO_SCRIPTS)];

describe("공급사 사용법 안내 영상 대본", () => {
  it("기본 영상마다 대본이 있고 표지(제목·볼 내용)로 시작해 마무리 화면으로 끝납니다", () => {
    for (const id of SUPPLIER_DEMO_VIDEO_IDS) {
      const script = SUPPLIER_DEMO_SCRIPTS[id];
      expect(script, id).toBeDefined();
      expect(script.id).toBe(id);
      expect(script.scenes[0]?.view.kind).toBe("cover");
      expect(script.scenes.at(-1)?.view.kind).toBe("end");
      expect(script.scenes.filter(isChapterScene).length).toBeLessThanOrEqual(8);
      expect(script.scenes.every((scene) => scene.duration > 0)).toBe(true);
      const seconds = demoDuration(script);
      expect(seconds).toBeGreaterThan(20);
      expect(seconds).toBeLessThan(45);
    }
  });

  it("자막은 화면 폭(360px)에 한 줄로 들어가는 길이입니다", () => {
    for (const script of ALL_SCRIPTS) {
      for (const scene of script.scenes) {
        if (!isChapterScene(scene)) continue;
        expect(scene.caption.title, script.id).toMatch(/\*\*.+\*\*/);
        expect(Array.from(plainCaption(scene.caption.title)).length, scene.caption.title).toBeLessThanOrEqual(14);
        expect(Array.from(scene.caption.kicker).length, scene.caption.kicker).toBeLessThanOrEqual(20);
      }
    }
  });

  it("공급사용 관리자·발주오라를 안내하지 않습니다(메일 발주·송장 회신 방식)", () => {
    const text = JSON.stringify(SUPPLIER_DEMO_SCRIPTS);
    expect(text).not.toContain("발주오라");
    expect(text).toContain("오전 1번, 오후 1번");
  });

  it("시간을 분:초로 보여 줍니다", () => {
    expect(formatDemoTime(0)).toBe("0:00");
    expect(formatDemoTime(37.4)).toBe("0:37");
    expect(formatDemoTime(65)).toBe("1:05");
  });
});

describe("위탁셀러 사용법 안내 영상 대본", () => {
  it("기본 영상마다 대본이 있고 표지로 시작해 마무리 화면으로 끝나며, 초록 테마(위탁셀러)로 그립니다", () => {
    for (const id of SELLER_DEMO_VIDEO_IDS) {
      const script = SELLER_DEMO_SCRIPTS[id];
      expect(script, id).toBeDefined();
      expect(script.id).toBe(id);
      expect(script.audience).toBe("seller");
      expect(script.scenes[0]?.view.kind).toBe("cover");
      expect(script.scenes.at(-1)?.view.kind).toBe("end");
      expect(script.scenes.filter(isChapterScene).length).toBeLessThanOrEqual(8);
      const seconds = demoDuration(script);
      expect(seconds, id).toBeGreaterThan(20);
      expect(seconds, id).toBeLessThan(45);
      // 셀러 영상에는 공급사 역할이 나오지 않습니다(위탁셀러 | 두고푸드).
      expect(JSON.stringify(script.scenes.map((scene) => scene.actor))).not.toContain("supplier");
    }
  });

  it("도매몰(발주오라) 메뉴·상태 이름을 실제와 같게 씁니다", () => {
    const text = JSON.stringify(SELLER_DEMO_SCRIPTS);
    for (const name of ["단일 주문 입력", "대량 주문 입력(엑셀)", "주문 등록 현황", "전체 주문 리스트", "배송중", "배송완료", "즉시 취소 하시겠습니까?", "반품 신청"]) expect(text, name).toContain(name);
    const menus = Object.values(SELLER_DEMO_SCRIPTS).flatMap((script) => script.scenes.map((scene) => scene.view)).filter((view) => view.kind === "menu");
    expect(menus.length).toBeGreaterThanOrEqual(5);
  });

  it("주문 화면 장면은 시간 순서가 맞습니다(선택 → 버튼 → 확인 창 → 확인)", () => {
    for (const script of Object.values(SELLER_DEMO_SCRIPTS)) {
      for (const scene of script.scenes) {
        const view = scene.view;
        if (view.kind === "orders") {
          if (view.select && view.action) expect(view.select.at, script.id).toBeLessThan(view.action.at);
          if (view.action && view.dialog) expect(view.action.at, script.id).toBeLessThan(view.dialog.at);
          if (view.dialog?.pickAt !== undefined) expect(view.dialog.pickAt, script.id).toBeLessThan(view.dialog.confirmAt);
          if (view.dialog) expect(view.dialog.confirmAt, script.id).toBeLessThan(scene.duration);
          for (const change of view.changes ?? []) expect(change.at, script.id).toBeLessThan(scene.duration);
        }
        if (view.kind === "menu") expect(view.clickAt, script.id).toBeLessThan(scene.duration - 0.6);
        if (view.kind === "upload") {
          expect(view.dropAt).toBeLessThan(view.matchAt ?? view.registerAt);
          expect(view.registerAt).toBeLessThan(scene.duration);
        }
      }
    }
  });
});

