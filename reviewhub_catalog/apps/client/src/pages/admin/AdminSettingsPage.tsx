// 관리자 > 설정(마이페이지, 2026-11-26 관리자 요청 "마이페이지 > 설정에서 웹 아이콘을 밖으로 빼는 버튼 — 갤럭시든 아이폰이든 앱처럼").
// 위 칸: 로그인한 관리자(이름·MASTER/SUB MASTER·아이디) + 비밀번호 바꾸기(관리자 계정 화면) · 로그아웃.
// 아래 칸: 앱으로 설치(홈 화면에 추가, components/app-install). 위 줄 '앱으로 설치할 수 있어요' 칩·이름 칩이 이 화면으로 옵니다.
import { Link } from "react-router-dom";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { AppInstallCard } from "@/components/app-install/AppInstall";
import "./admin-settings.css";

export function AdminSettingsPage({ name, username, isPrimary, onSignOut }: { name: string; username: string | null; isPrimary: boolean; onSignOut: () => void }) {
  return (
    <div className="admin-settings-page">
      <section className="admin-card admin-settings-account" aria-label="내 계정">
        <span className="admin-settings-avatar" aria-hidden="true"><ShieldCheck size={22} /></span>
        <div className="admin-settings-who">
          <small>{isPrimary ? "MASTER" : "SUB MASTER"}</small>
          <strong>{name}</strong>
          {username && <span>아이디 {username}</span>}
        </div>
        <div className="admin-settings-actions">
          <Link to="/admin/admins" className="admin-settings-button"><KeyRound size={15} aria-hidden="true" /> 비밀번호 바꾸기</Link>
          <button type="button" className="admin-settings-button is-quiet" onClick={onSignOut}><LogOut size={15} aria-hidden="true" /> 로그아웃</button>
        </div>
      </section>
      <AppInstallCard area="admin" />
    </div>
  );
}
