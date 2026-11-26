// 공급사 정보 변경 알림(2026-11-27 관리자 요청 "공급사가 사업자등록번호·정산 계좌를 바꾸면 admin에서도 '공급사가 변경했다' 정도 알림 로그창"):
// - SupplierProfileAlert: 관리자 화면 오른쪽 아래(휴대폰은 아래)에 뜨는 작은 알림 창("봄날농원 · 정산 계좌 변경" 한 줄씩, 최근 3곳).
//   확인하지 않은 변경이 있을 때만, '확인했어요'를 누르면 사라지고, '기록 보기'는 공급사 관리의 변경 기록(전·후 값)으로 갑니다.
//   닫기(×)는 새 변경이 올 때까지 숨김.
// - SupplierProfileChangeLog: 공급사 관리 화면 아래 "공급사 정보 변경 기록"(새 알림 · 전체). 계좌번호는 끝 4자리만 보입니다.
// 숫자(확인 전 알림 수)는 관리자 화면 틀이 1분마다 받는 /catalog/admin/supplier-requests/summary의 profileChanges입니다.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Bell, CheckCheck, History, Landmark, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { SUPPLIER_PROFILE_FIELD_LABELS, profileChangeAction, profileChangeText, type SupplierProfileChange } from "@repo/shared/supplier-profile";
import "./supplier-profile-alerts.css";

type ChangeList = { available: boolean; unchecked: number; changes: SupplierProfileChange[] };

async function readData<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({ ok: false }))) as { ok: boolean; data: T; error?: { message?: string } };
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "요청을 처리하지 못했습니다.");
  return payload.data;
}

async function loadChanges(scope: "unchecked" | "all", limit: number) {
  return readData<ChangeList>(await apiFetch(`/catalog/admin/supplier-profile-changes?scope=${scope}&limit=${limit}`, { silent: true }));
}

async function checkChanges(ids?: string[]) {
  return readData<{ unchecked: number }>(await apiFetch("/catalog/admin/supplier-profile-changes/check", {
    method: "POST",
    silent: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ids ? { ids } : {})
  }));
}

/** "11.27(금) 14:02" (한국 시각) */
export function changeTime(value: string) {
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("month")}.${part("day")}(${part("weekday")}) ${part("hour")}:${part("minute")}`;
}

function ChangeDetail({ change }: { change: SupplierProfileChange }) {
  return (
    <ul className="spc-detail">
      {change.fields.map((field) => {
        const value = change.summary[field];
        return (
          <li key={field}>
            <b>{SUPPLIER_PROFILE_FIELD_LABELS[field]} {profileChangeAction(value)}</b>
            <span>{value?.before ? <><s>{value.before}</s><ArrowRight size={12} aria-label="에서" /></> : null}<em>{value?.after ?? "지움"}</em></span>
          </li>
        );
      })}
    </ul>
  );
}

/** 관리자 화면 오른쪽 아래 알림 창 */
export function SupplierProfileAlert({ count, onChecked }: { count: number; onChecked: () => void }) {
  const [changes, setChanges] = useState<SupplierProfileChange[]>([]);
  const [hiddenAt, setHiddenAt] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (count <= 0) {
      setChanges([]);
      return;
    }
    let active = true;
    void loadChanges("unchecked", 3).then((data) => { if (active) setChanges(data.changes); }).catch(() => undefined);
    return () => { active = false; };
  }, [count]);

  if (count <= 0 || count <= hiddenAt || changes.length === 0) return null;

  const confirm = async () => {
    setBusy(true);
    try {
      await checkChanges();
      toast.success("공급사 정보 변경 알림을 확인했어요.");
      onChecked();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "알림을 확인하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="spc-alert" role="status" aria-live="polite" aria-label="공급사 정보 변경 알림">
      <header>
        <span className="spc-alert-icon" aria-hidden="true"><Bell size={17} /></span>
        <div><strong>공급사 정보 변경 알림</strong><small>공급사가 직접 등록·변경했어요 · {count.toLocaleString("ko-KR")}건</small></div>
        <button type="button" className="spc-alert-close" onClick={() => setHiddenAt(count)} aria-label="알림 창 닫기(새 변경이 오면 다시 보여요)"><X size={17} /></button>
      </header>
      <ol className="spc-alert-list">
        {changes.map((change) => (
          <li key={change.id}>
            <div className="spc-alert-row"><b>{change.supplierName}</b><time dateTime={change.createdAt}>{changeTime(change.createdAt)}</time></div>
            <span className="spc-alert-what">{profileChangeText(change)}</span>
          </li>
        ))}
      </ol>
      {count > changes.length && <p className="spc-alert-more">외 {(count - changes.length).toLocaleString("ko-KR")}건은 기록에서 볼 수 있어요.</p>}
      <div className="spc-alert-actions">
        <Link to="/admin/suppliers#profile-changes" className="spc-alert-link"><History size={15} aria-hidden="true" /> 기록 보기</Link>
        <button type="button" className="primary-action" onClick={() => void confirm()} disabled={busy}><CheckCheck size={16} aria-hidden="true" /> {busy ? "확인하는 중…" : "확인했어요"}</button>
      </div>
    </aside>
  );
}

/** 공급사 관리 화면의 변경 기록 */
export function SupplierProfileChangeLog({ onChecked }: { onChecked?: () => void }) {
  const [scope, setScope] = useState<"unchecked" | "all">("unchecked");
  const [data, setData] = useState<ChangeList | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (next: "unchecked" | "all") => {
    setLoading(true);
    try {
      const result = await loadChanges(next, next === "all" ? 100 : 50);
      setData(result);
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "변경 기록을 불러오지 못했습니다.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // 처음: 새 알림이 없으면 전체 기록으로
  useEffect(() => {
    void load("unchecked").then((result) => {
      if (result && result.available && result.unchecked === 0) {
        setScope("all");
        void load("all");
      }
    });
  }, [load]);

  // 알림 창의 '기록 보기'(#profile-changes)로 오면 이 칸으로 내려 줍니다.
  useEffect(() => {
    if (window.location.hash !== "#profile-changes") return;
    const timer = window.setTimeout(() => document.getElementById("profile-changes")?.scrollIntoView({ block: "start", behavior: "smooth" }), 120);
    return () => window.clearTimeout(timer);
  }, []);

  const switchScope = (next: "unchecked" | "all") => {
    setScope(next);
    void load(next);
  };

  const confirm = async (ids?: string[]) => {
    setBusy(true);
    try {
      await checkChanges(ids);
      toast.success(ids ? "알림을 확인했어요." : "새 알림을 모두 확인했어요.");
      onChecked?.();
      await load(scope);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "알림을 확인하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const unchecked = data?.unchecked ?? 0;
  return (
    <section className="admin-card spc-log" id="profile-changes" aria-labelledby="spc-log-title">
      <div className="card-heading">
        <Landmark size={19} aria-hidden="true" />
        <div>
          <h2 id="spc-log-title">공급사 정보 변경 기록</h2>
          <p>공급사가 공급사 센터에서 사업자등록번호·정산 계좌를 등록하거나 바꾼 기록이에요. 계좌번호는 끝 4자리만 보여요(전체 번호는 거래명세서의 입금 계좌).</p>
        </div>
      </div>
      {data && !data.available ? (
        <p className="spc-log-empty">운영 배포(DB 업데이트 038)가 끝나면 이곳에 기록이 쌓여요.</p>
      ) : (
        <>
          <div className="spc-log-toolbar">
            <div className="spc-log-tabs" role="tablist" aria-label="기록 보기 방식">
              <button type="button" role="tab" aria-selected={scope === "unchecked"} className={scope === "unchecked" ? "active" : ""} onClick={() => switchScope("unchecked")}>새 알림 <b>{unchecked.toLocaleString("ko-KR")}</b></button>
              <button type="button" role="tab" aria-selected={scope === "all"} className={scope === "all" ? "active" : ""} onClick={() => switchScope("all")}>전체 기록</button>
            </div>
            {unchecked > 0 && <button type="button" className="spc-log-check-all" onClick={() => void confirm()} disabled={busy}><CheckCheck size={15} aria-hidden="true" /> 새 알림 모두 확인</button>}
          </div>
          {loading && !data ? <div className="admin-loading inline"><div className="spinner" /><span>기록을 불러오는 중…</span></div>
            : !data || data.changes.length === 0 ? <p className="spc-log-empty">{scope === "unchecked" ? "새 알림이 없어요." : "아직 기록이 없어요."}</p>
            : (
              <ol className="spc-log-list">
                {data.changes.map((change) => (
                  <li key={change.id} className={change.checkedAt ? "" : "is-new"}>
                    <div className="spc-log-head">
                      <strong>{change.supplierName}</strong>
                      <span className="spc-log-what">{profileChangeText(change)}</span>
                      <time dateTime={change.createdAt}>{changeTime(change.createdAt)}</time>
                    </div>
                    <ChangeDetail change={change} />
                    <div className="spc-log-foot">
                      <small>{change.changedBy ? `공급사 아이디 ${change.changedBy}` : "공급사"}</small>
                      {change.checkedAt
                        ? <small className="spc-log-checked">확인 · {changeTime(change.checkedAt)}{change.checkedBy ? ` · ${change.checkedBy}` : ""}</small>
                        : <button type="button" className="spc-log-check" onClick={() => void confirm([change.id])} disabled={busy}>확인</button>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
        </>
      )}
    </section>
  );
}
