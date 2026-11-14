// 건강식품 백과사전 "몸에서 고민 찾기"(2026-11-14, 관리자 요청 "사람을 먼저 보여주고 그 증상으로 소싱… 참고 화면은 너무 정신없으니 깔끔하고 분명하게").
// 단순한 사람 그림(두고푸드가 직접 그린 SVG, viewBox 200×440) 위 10곳 + 그림 아래 "전신" 1개만 둡니다.
// 부위마다 고민(lib/health-encyclopedia-data.ts의 HEALTH_CONCERNS id)을 묶고, 21개 고민이 모두 한 곳 이상에 들어갑니다(테스트로 확인).
import { type HealthConcern, findHealthConcern } from "./health-encyclopedia";

export type BodyPartId = "head" | "eye" | "mouth" | "heart" | "liver" | "waist" | "gut" | "skin" | "pelvis" | "joint" | "whole";

export type BodyPart = {
  id: BodyPartId;
  name: string;
  hint: string;
  concerns: string[];
  /** 그림 위 점 위치(viewBox 좌표). 전신은 점 없이 그림 아래 버튼 */
  dot?: { x: number; y: number };
  /** 이름표 위치: 그림 왼쪽/오른쪽 칸, 세로 위치(viewBox y) */
  label?: { side: "left" | "right"; y: number };
};

export const BODY_VIEWBOX = { width: 200, height: 440 } as const;

export const HEALTH_BODY_PARTS: BodyPart[] = [
  { id: "head", name: "머리·수면", hint: "기억력·집중이 걱정이거나 잠이 얕은 고객", concerns: ["memory", "sleep"], dot: { x: 100, y: 22 }, label: { side: "left", y: 26 } },
  { id: "eye", name: "눈", hint: "화면을 오래 보거나 눈이 침침한 고객", concerns: ["eye"], dot: { x: 111, y: 40 }, label: { side: "right", y: 40 } },
  { id: "mouth", name: "입·잇몸", hint: "잇몸이 붓거나 입 냄새가 신경 쓰이는 고객", concerns: ["oral"], dot: { x: 100, y: 57 }, label: { side: "left", y: 86 } },
  { id: "heart", name: "심장·혈관", hint: "혈행·콜레스테롤·혈압을 챙기는 40대 이상", concerns: ["blood-flow", "cholesterol", "blood-pressure"], dot: { x: 116, y: 116 }, label: { side: "right", y: 108 } },
  { id: "liver", name: "간", hint: "술자리가 잦고 늘 피곤한 직장인", concerns: ["liver"], dot: { x: 82, y: 150 }, label: { side: "left", y: 150 } },
  { id: "waist", name: "혈당·체지방", hint: "식후 혈당·뱃살이 걱정인 고객", concerns: ["blood-sugar", "body-fat"], dot: { x: 133, y: 178 }, label: { side: "right", y: 172 } },
  { id: "gut", name: "장·소화", hint: "배변이 불편하거나 속이 더부룩한 고객", concerns: ["gut"], dot: { x: 100, y: 204 }, label: { side: "right", y: 236 } },
  { id: "skin", name: "피부", hint: "건조함·자외선·주름이 신경 쓰이는 고객", concerns: ["skin"], dot: { x: 34, y: 202 }, label: { side: "left", y: 214 } },
  { id: "pelvis", name: "여성·남성", hint: "여성 건강·임신 준비·남성 활력을 챙기는 고객", concerns: ["women", "pregnancy", "men"], dot: { x: 100, y: 244 }, label: { side: "left", y: 278 } },
  { id: "joint", name: "관절·뼈·근육", hint: "무릎·뼈가 약해지거나 근력이 떨어지는 고객", concerns: ["joint", "bone", "muscle"], dot: { x: 120, y: 330 }, label: { side: "right", y: 330 } },
  { id: "whole", name: "전신", hint: "면역·활력·항산화처럼 몸 전체를 챙기는 고객", concerns: ["immunity", "energy", "antioxidant"] }
];

export const DEFAULT_BODY_PART: BodyPartId = "eye";

export function findBodyPart(id: string | null | undefined) {
  return HEALTH_BODY_PARTS.find((part) => part.id === id) ?? null;
}

export function bodyPartConcerns(part: BodyPart): HealthConcern[] {
  return part.concerns.map((id) => findHealthConcern(id)).filter((concern): concern is HealthConcern => Boolean(concern));
}

// 그 부위 고민들에 이어진 두고푸드 상품 수(여러 고민에 겹치는 상품은 한 번만)
export function bodyPartProductCount<T extends { id: string }>(part: BodyPart, grouped: Map<string, T[]>) {
  const ids = new Set<string>();
  for (const concern of bodyPartConcerns(part)) for (const ingredient of concern.ingredients) for (const product of grouped.get(ingredient) ?? []) ids.add(product.id);
  return ids.size;
}
