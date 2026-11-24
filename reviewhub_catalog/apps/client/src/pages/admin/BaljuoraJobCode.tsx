// 발주오라 작업 코드 칸(2026-11-25): 발주오라 동기화 화면과 판매·매출처 불러오기 칸이 같이 씁니다.
// 코드가 있으면 크게 보여 주고 복사 버튼을, 이 화면을 새로 열어 코드를 모르면 "작업 코드 다시 받기"(기다리는 작업에 새 코드)를 보여 줍니다.
import { useState } from "react";
import { Check, Copy, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { formatBaljuoraCode } from "@repo/shared/baljuora-sync";
import "./baljuora-job-code.css";

export type ReissuedJobCode<J> = { job: J; code: string; consoleUrl: string };

async function readData<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({ ok: false }))) as { ok: boolean; data: T; error?: { message?: string } };
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "요청을 처리하지 못했습니다.");
  return payload.data;
}

function timeLabel(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

export function BaljuoraJobCode<J>({ jobId, code, expiresAt, onReissued }: { jobId: string; code: string | null; expiresAt?: string | null; onReissued: (result: ReissuedJobCode<J>) => void }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const until = timeLabel(expiresAt);

  const reissue = async () => {
    setBusy(true);
    try {
      const result = await readData<ReissuedJobCode<J>>(await apiFetch(`/baljuora/admin/jobs/${jobId}/code`, { method: "POST" }));
      onReissued(result);
      toast.success("새 작업 코드를 받았어요. 예전 코드는 더 이상 쓰지 않아요.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "작업 코드를 다시 받지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(formatBaljuoraCode(code));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.info(`작업 코드: ${formatBaljuoraCode(code)}`);
    }
  };

  if (!code) {
    return (
      <div className="bjc bjc-missing">
        <p><KeyRound size={16} aria-hidden="true" /> 이 화면을 새로 열어서 작업 코드가 안 보여요. 발주오라 창이 코드를 물어보면 아래 버튼으로 새 코드를 받아 넣으세요.</p>
        <button type="button" className="outline-button" onClick={() => void reissue()} disabled={busy}>
          {busy ? <Loader2 className="bjc-spin" size={15} aria-hidden="true" /> : <KeyRound size={15} aria-hidden="true" />} 작업 코드 다시 받기
        </button>
      </div>
    );
  }
  return (
    <div className="bjc">
      <span className="bjc-label">작업 코드</span>
      <div className="bjc-row">
        <strong className="bjc-code" aria-label={`작업 코드 ${code.split("").join(" ")}`}>{formatBaljuoraCode(code)}</strong>
        <button type="button" className="bjc-copy" onClick={() => void copy()} aria-label="작업 코드 복사">
          {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />} {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <small>발주오라 창에서 코드를 물어보면 이 10글자를 넣으세요(대소문자·가운데 줄은 상관없어요){until ? ` · ${until}까지` : ""}</small>
    </div>
  );
}
