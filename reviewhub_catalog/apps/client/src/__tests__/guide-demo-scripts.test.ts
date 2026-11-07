import { describe, expect, it } from "vitest";
import { SUPPLIER_DEMO_VIDEO_IDS } from "@repo/shared/supplier-guide";
import { SUPPLIER_DEMO_SCRIPTS, demoDuration, formatDemoTime, isChapterScene, plainCaption } from "../pages/catalog/guide-demo-scripts";

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
    for (const script of Object.values(SUPPLIER_DEMO_SCRIPTS)) {
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
