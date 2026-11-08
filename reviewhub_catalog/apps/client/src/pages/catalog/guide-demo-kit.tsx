// 사용법 안내 영상(공급사·위탁셀러 공용) 그리기 도구: 시간(초) → 위치·투명도 계산, 커서·상태 줄·아바타.
// 모든 움직임은 time 값으로 계산하므로(CSS 애니메이션 없음) 같은 시간이면 같은 화면이 나오고 mp4로도 그대로 뽑을 수 있습니다.
import type { CSSProperties } from "react";
import type { DemoActor, DemoTimed } from "./guide-demo-scripts";

export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const prog = (t: number, start: number, duration: number) => (duration <= 0 ? (t >= start ? 1 : 0) : clamp((t - start) / duration));
export const easeOut = (p: number) => 1 - (1 - p) ** 3;
export const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
export const lerp = (from: number, to: number, p: number) => from + (to - from) * p;

export function appear(t: number, at: number, duration = 0.35, dy = 10): CSSProperties {
  const p = easeOut(prog(t, at, duration));
  return { opacity: p, transform: `translateY(${((1 - p) * dy).toFixed(2)}px)` };
}

export function typed(text: string, t: number, start: number, cps = 16) {
  const chars = Array.from(text);
  return chars.slice(0, Math.floor(Math.max(0, t - start) * cps)).join("");
}
export const typeTime = (text: string, cps = 16) => Array.from(text).length / cps;

export function timed<T>(value: DemoTimed<T> | undefined, t: number): T | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return value as T;
  const entries = value as Array<[number, T]>;
  let current = entries[0]?.[1];
  for (const [at, item] of entries) if (t >= at) current = item;
  return current;
}

// 클릭 효과(0~1). 클릭 전·후에는 0
export const clickPulse = (t: number, at: number | undefined, duration = 0.4) => (at === undefined || t < at || t > at + duration ? 0 : prog(t, at, duration));

export function moveCursor(t: number, from: [number, number], to: [number, number], start: number, duration = 0.6): [number, number] {
  const p = easeInOut(prog(t, start, duration));
  return [lerp(from[0], to[0], p), lerp(from[1], to[1], p)];
}

// 커서 경로: [도착 시각, 위치] 목록을 차례로 따라갑니다(각 구간은 move초 동안 이동, 나머지는 멈춤).
export function cursorPath(t: number, start: [number, number], stops: Array<{ at: number; to: [number, number]; move?: number }>): [number, number] {
  let from = start;
  for (const stop of stops) {
    const move = stop.move ?? 0.55;
    if (t < stop.at) return moveCursor(t, from, stop.to, stop.at - move, move);
    from = stop.to;
  }
  return from;
}

export function lines(text: string) {
  const parts = text.split("\n");
  return parts.map((part, index) => <span key={index}>{part}{index < parts.length - 1 && <br />}</span>);
}

export function highlight(title: string) {
  return title.split("**").map((part, index) => (index % 2 === 1 ? <em key={index}>{part}</em> : <span key={index}>{part}</span>));
}

// 글자 폭(대략, px): 한글 = 글자 크기, 공백 0.3배, 그 밖 0.58배. 버튼·말풍선 자리 계산에 씁니다.
export const textPx = (text: string, size: number) => Array.from(text).reduce((sum, char) => sum + (/[가-힣ㄱ-ㅎ·]/.test(char) ? size * (char === "·" ? 0.5 : 1) : char === " " ? size * 0.3 : size * 0.58), 0);

export const whoName = (who: DemoActor) => (who === "supplier" ? "공급사" : who === "seller" ? "셀러" : "두고푸드");

export function Avatar({ size = 24 }: { size?: number }) {
  return <span className="gd-avatar" style={{ width: size, height: size }}><img src="/icon-192.png" alt="" draggable={false} /></span>;
}

export function Cursor({ x, y, who, click = 0 }: { x: number; y: number; who: DemoActor; click?: number }) {
  const pressed = click > 0 && click < 1;
  const scale = pressed ? 1 - 0.2 * Math.sin(click * Math.PI) : 1;
  return (
    <span className={`gd-cursor is-${who}`} style={{ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` }}>
      {pressed && <span className="gd-ripple" style={{ opacity: 1 - click, transform: `translate(-50%, -50%) scale(${(0.4 + click * 1.6).toFixed(2)})` }} />}
      <svg width="16" height="19" viewBox="0 0 16 19" style={{ transform: `scale(${scale.toFixed(3)})` }}>
        <path d="M1.5 1.2 L1.5 15.4 L5.3 12 L8.2 17.6 L10.8 16.4 L7.9 10.9 L13.4 10.9 Z" fill="#111827" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      <b>{whoName(who)}</b>
    </span>
  );
}

export function StatusStrip({ who, text, count }: { who: DemoActor; text?: string; count?: string }) {
  if (!text) return null;
  return <div className={`gd-status is-${who}`}><i />{text}{count && <b>{count}</b>}</div>;
}
