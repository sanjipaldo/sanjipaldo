import { useEffect, useId, useState } from "react";

// 페이지당 보기 개수: 원하는 숫자를 직접 입력합니다(예: 7 → 7개씩). 자주 쓰는 값은 입력칸 목록에서 고를 수 있습니다.
// storageKey를 주면 이 브라우저에서 마지막으로 쓴 값을 기억합니다.
export function readStoredPageSize(storageKey: string | undefined, fallback: number, max = 1000) {
  if (!storageKey || typeof window === "undefined") return fallback;
  try {
    const saved = Number(window.localStorage.getItem(`doogo-page-size:${storageKey}`));
    return Number.isInteger(saved) && saved >= 1 && saved <= max ? saved : fallback;
  } catch {
    return fallback;
  }
}

export function PageSizeInput({
  value,
  onChange,
  label = "페이지당 표시 수",
  presets = [5, 10, 20, 30, 50, 100],
  max = 1000,
  suffix = "개씩",
  prefix = "페이지당",
  storageKey,
  className = "page-size-select"
}: {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  presets?: number[];
  max?: number;
  suffix?: string;
  prefix?: string;
  storageKey?: string;
  className?: string;
}) {
  const listId = useId();
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);

  const commit = (raw: string) => {
    const next = Math.floor(Number(raw));
    if (!Number.isFinite(next) || next < 1) return false;
    const clamped = Math.min(next, max);
    onChange(clamped);
    if (storageKey) {
      try { window.localStorage.setItem(`doogo-page-size:${storageKey}`, String(clamped)); } catch { /* 저장 불가 환경은 무시 */ }
    }
    return true;
  };

  return (
    <label className={`${className} page-size-input`}>
      {prefix && <span>{prefix}</span>}
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        step={1}
        list={listId}
        value={draft}
        aria-label={label}
        onChange={(event) => { setDraft(event.target.value); commit(event.target.value); }}
        onBlur={() => { if (!commit(draft)) setDraft(String(value)); else setDraft(String(Math.min(Math.floor(Number(draft)), max))); }}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); (event.target as HTMLInputElement).blur(); } }}
      />
      <datalist id={listId}>{presets.map((preset) => <option key={preset} value={preset} />)}</datalist>
      {suffix && <span>{suffix}</span>}
    </label>
  );
}
