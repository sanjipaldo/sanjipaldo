import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { authClient, clearAuthToken } from "@/lib/auth";
import { RequireAuth } from "./route-guards";

type AdminGuardProps = {
  children: ReactNode;
  redirectTo?: string;
  forbiddenFallback?: ReactNode;
};

type RoleState = "checking" | "admin" | "supplier" | "user";

function AdminAccessLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

function AdminAccessForbidden() {
  const navigate = useNavigate();
  const signOut = async () => {
    await authClient.signOut().catch(() => undefined);
    clearAuthToken();
    navigate("/admin", { replace: true });
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
        <p className="text-xs font-semibold text-muted-foreground">403 Forbidden</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">관리자 권한이 없어요</h1>
        <p className="mt-2 text-sm text-muted-foreground">이 계정은 마스터 관리자 화면을 볼 수 없습니다. 관리자 계정으로 다시 로그인해 주세요.</p>
        <button type="button" className="mt-4 rounded-full border px-4 py-2 text-sm font-semibold" onClick={() => void signOut()}>로그아웃</button>
      </div>
    </div>
  );
}

export async function isSupplierAccount() {
  try {
    const response = await apiFetch("/supplier/me", { silent: true });
    if (!response.ok) return false;
    const payload = (await response.json()) as { ok?: boolean; data?: { supplier?: { id?: string } } };
    return Boolean(payload.ok && payload.data?.supplier?.id);
  } catch {
    return false;
  }
}

async function readApiData<T>(response: Response): Promise<T | null> {
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: T } | null;
  return payload?.ok && payload.data ? payload.data : null;
}

function RequireAdminRole({ children, forbiddenFallback }: Omit<AdminGuardProps, "redirectTo">) {
  const [role, setRole] = useState<RoleState>("checking");

  useEffect(() => {
    let active = true;
    setRole("checking");

    void apiFetch("/me/profile")
      .then((response) => readApiData<{ profile: { role: "admin" | "user" } }>(response))
      .then(async (data) => {
        if (!active) {
          return;
        }
        if (data?.profile.role === "admin") {
          setRole("admin");
          return;
        }
        // 공급사 계정이면 관리자 화면 대신 공급사 센터로 보냅니다(공급사 정보가 실제로 온 경우만).
        const supplier = await isSupplierAccount();
        if (active) setRole(supplier ? "supplier" : "user");
      })
      .catch(() => {
        if (active) {
          setRole("user");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (role === "checking") {
    return <AdminAccessLoading />;
  }

  if (role === "supplier") {
    return <Navigate to="/supplier/home" replace />;
  }

  if (role !== "admin") {
    return <>{forbiddenFallback ?? <AdminAccessForbidden />}</>;
  }

  return <>{children}</>;
}

export function AdminGuard({ children, redirectTo = "/auth", forbiddenFallback }: AdminGuardProps) {
  return (
    <RequireAuth redirectTo={redirectTo}>
      <RequireAdminRole forbiddenFallback={forbiddenFallback}>{children}</RequireAdminRole>
    </RequireAuth>
  );
}

export const RequireAdmin = AdminGuard;
