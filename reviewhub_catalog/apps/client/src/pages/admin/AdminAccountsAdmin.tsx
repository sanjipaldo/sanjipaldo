// 관리자 > 관리자 계정(2026-11-24, 관리자 요청 "메인 마스터 말고 서브 마스터(MD)가 쓰는 같은 권한의 계정").
// 계정·비밀번호는 코드에 넣지 않고 이 화면에서 만듭니다(서버는 해시로만 저장). 아이디는 대소문자를 구분하지 않고(SUBADMIN = subadmin),
// 비밀번호는 구분합니다. 메인 마스터 계정은 지울 수 없고 그 비밀번호는 본인만 바꿉니다.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { KeyRound, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { jsonInit, readData } from "./sales-admin-shared";
import "./sales-admin.css";

type AdminAccount = { id: string; username: string; name: string; createdAt: string | null; isPrimary: boolean; isSelf: boolean };

const PASSWORD_MIN = 8;

function joinedDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function passwordProblem(password: string, confirm: string) {
  if (password.length < PASSWORD_MIN) return `비밀번호는 ${PASSWORD_MIN}자 이상 입력해 주세요.`;
  if (password !== confirm) return "비밀번호 확인이 같지 않아요.";
  return "";
}

export function AdminAccountsAdmin() {
  const [admins, setAdmins] = useState<AdminAccount[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ username: "", name: "", password: "", confirm: "" });
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetForm, setResetForm] = useState({ password: "", confirm: "" });
  const [mine, setMine] = useState({ currentPassword: "", newPassword: "", confirm: "" });

  const load = useCallback(async () => {
    try {
      setAdmins((await readData<{ admins: AdminAccount[] }>(await apiFetch("/catalog/admin/admins", { silent: true }))).admins);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "관리자 계정을 불러오지 못했어요.");
      setAdmins([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = passwordProblem(form.password, form.confirm);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    try {
      const created = (await readData<{ admin: AdminAccount }>(await apiFetch("/catalog/admin/admins", { ...jsonInit("POST", { username: form.username, name: form.name, password: form.password }), silent: true }))).admin;
      toast.success(`'${created.username}' 관리자 계정을 만들었어요. 아이디는 대소문자 구분 없이 로그인할 수 있어요.`);
      setForm({ username: "", name: "", password: "", confirm: "" });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "관리자 계정을 만들지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (event: FormEvent<HTMLFormElement>, admin: AdminAccount) => {
    event.preventDefault();
    const problem = passwordProblem(resetForm.password, resetForm.confirm);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    try {
      await readData(await apiFetch(`/catalog/admin/admins/${encodeURIComponent(admin.id)}/password`, { ...jsonInit("PUT", { password: resetForm.password }), silent: true }));
      toast.success(`'${admin.username}' 비밀번호를 새로 정했어요. 그 계정으로 로그인해 있던 기기는 모두 로그아웃됐어요.`);
      setResetFor(null);
      setResetForm({ password: "", confirm: "" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "비밀번호를 바꾸지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (admin: AdminAccount) => {
    if (!window.confirm(`'${admin.username}' 관리자 계정을 지울까요? 되돌릴 수 없어요.`)) return;
    setBusy(true);
    try {
      await readData(await apiFetch(`/catalog/admin/admins/${encodeURIComponent(admin.id)}`, { method: "DELETE", silent: true }));
      toast.success(`'${admin.username}' 관리자 계정을 지웠어요.`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "관리자 계정을 지우지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const changeMine = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = passwordProblem(mine.newPassword, mine.confirm);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    try {
      await readData(await apiFetch("/catalog/admin/admins/me/password", { ...jsonInit("POST", { currentPassword: mine.currentPassword, newPassword: mine.newPassword }), silent: true }));
      toast.success("내 비밀번호를 바꿨어요. 이 기기는 그대로이고 다른 기기의 로그인은 끊겼어요.");
      setMine({ currentPassword: "", newPassword: "", confirm: "" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "비밀번호를 바꾸지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const sameAsId = form.username.trim() !== "" && form.password.toLowerCase() === form.username.trim().toLowerCase();

  return (
    <div className="sa-page aa-page">
      <div className="admin-page-heading">
        <div><span>ACCOUNTS</span><h1>관리자 계정</h1><p>여기서 만든 계정은 메인 마스터와 같은 권한으로 관리자 화면을 모두 씁니다. 아이디는 대소문자를 구분하지 않고(SUBADMIN = subadmin), 비밀번호는 구분합니다.</p></div>
      </div>

      <section className="admin-card">
        <div className="card-heading"><ShieldCheck size={19} aria-hidden="true" /><div><h2>관리자 목록</h2><p>메인 마스터 계정은 지울 수 없고, 그 비밀번호는 메인 마스터만 바꿀 수 있어요.</p></div></div>
        {!admins ? <div className="admin-loading inline"><div className="spinner" /><span>불러오는 중…</span></div> : (
          <div className="admin-table-wrap">
            <table className="admin-table stackable-table sa-table aa-table">
              <thead><tr><th>아이디</th><th>이름</th><th>만든 날</th><th>관리</th></tr></thead>
              <tbody>
                {admins.map((admin) => (
                  <tr key={admin.id}>
                    <td data-label="아이디"><strong>{admin.username || "(아이디 없음)"}</strong>{admin.isPrimary && <span className="sa-badge is-ok">메인 마스터</span>}{admin.isSelf && <span className="sa-badge">지금 로그인</span>}</td>
                    <td data-label="이름">{admin.name}</td>
                    <td data-label="만든 날">{joinedDate(admin.createdAt)}</td>
                    <td data-label="관리" className="stack-wide">
                      {admin.isSelf || admin.isPrimary ? <small>{admin.isSelf ? "내 비밀번호는 아래에서 바꿔요" : "메인 마스터 본인만 바꿀 수 있어요"}</small> : resetFor === admin.id ? (
                        <form className="aa-inline-form" onSubmit={(event) => void resetPassword(event, admin)}>
                          <input type="password" autoComplete="new-password" placeholder={`새 비밀번호(${PASSWORD_MIN}자 이상)`} aria-label={`${admin.username} 새 비밀번호`} value={resetForm.password} onChange={(event) => setResetForm({ ...resetForm, password: event.target.value })} />
                          <input type="password" autoComplete="new-password" placeholder="새 비밀번호 확인" aria-label={`${admin.username} 새 비밀번호 확인`} value={resetForm.confirm} onChange={(event) => setResetForm({ ...resetForm, confirm: event.target.value })} />
                          <button type="submit" className="primary-action" disabled={busy}>저장</button>
                          <button type="button" className="outline-button" onClick={() => { setResetFor(null); setResetForm({ password: "", confirm: "" }); }}>취소</button>
                        </form>
                      ) : (
                        <span className="aa-actions">
                          <button type="button" className="outline-button" onClick={() => { setResetFor(admin.id); setResetForm({ password: "", confirm: "" }); }}><KeyRound size={15} aria-hidden="true" /> 비밀번호 새로 정하기</button>
                          <button type="button" className="outline-button aa-danger" disabled={busy} onClick={() => void remove(admin)}><Trash2 size={15} aria-hidden="true" /> 지우기</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="sa-grid-2">
        <section className="admin-card">
          <div className="card-heading"><UserPlus size={19} aria-hidden="true" /><div><h2>새 관리자 계정 만들기</h2><p>예: 아이디 subadmin · 이름 MD. 만들면 바로 같은 권한으로 로그인할 수 있어요.</p></div></div>
          <form className="sa-form-grid aa-form" onSubmit={(event) => void create(event)}>
            <label><span>아이디 <b>*</b></span><input autoComplete="off" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="영문·숫자 3~30자" required /><small>대문자로 써도 소문자로 저장돼요.</small></label>
            <label><span>이름</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="예: MD" maxLength={40} /><small>관리자 화면 위쪽에 보이는 이름이에요.</small></label>
            <label><span>비밀번호 <b>*</b></span><input type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /><small>{PASSWORD_MIN}자 이상 · 대소문자를 구분해요.</small></label>
            <label><span>비밀번호 확인 <b>*</b></span><input type="password" autoComplete="new-password" value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} required /></label>
            {sameAsId && <p className="sa-notice is-warn aa-wide">아이디와 같은 비밀번호는 다른 사람이 쉽게 짐작할 수 있어요. 숫자·기호를 섞은 비밀번호를 권해요.</p>}
            <div className="sa-modal-actions aa-wide"><button type="submit" className="primary-action" disabled={busy}><UserPlus size={16} aria-hidden="true" /> 계정 만들기</button></div>
          </form>
        </section>

        <section className="admin-card">
          <div className="card-heading"><KeyRound size={19} aria-hidden="true" /><div><h2>내 비밀번호 바꾸기</h2><p>바꾸면 이 기기는 그대로이고, 다른 기기의 로그인은 끊겨요.</p></div></div>
          <form className="sa-form-grid aa-form" onSubmit={(event) => void changeMine(event)}>
            <label className="is-wide"><span>지금 비밀번호 <b>*</b></span><input type="password" autoComplete="current-password" value={mine.currentPassword} onChange={(event) => setMine({ ...mine, currentPassword: event.target.value })} required /></label>
            <label><span>새 비밀번호 <b>*</b></span><input type="password" autoComplete="new-password" value={mine.newPassword} onChange={(event) => setMine({ ...mine, newPassword: event.target.value })} required /><small>{PASSWORD_MIN}자 이상 · 대소문자를 구분해요.</small></label>
            <label><span>새 비밀번호 확인 <b>*</b></span><input type="password" autoComplete="new-password" value={mine.confirm} onChange={(event) => setMine({ ...mine, confirm: event.target.value })} required /></label>
            <div className="sa-modal-actions aa-wide"><button type="submit" className="primary-action" disabled={busy}><KeyRound size={16} aria-hidden="true" /> 비밀번호 바꾸기</button></div>
          </form>
        </section>
      </div>
    </div>
  );
}
