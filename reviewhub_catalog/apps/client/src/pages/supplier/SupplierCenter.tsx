// 공급사 센터(/supplier, 2026-11-20 관리자 요청).
// - 마스터 관리자가 만들어 준 공급사 아이디·비밀번호로 로그인합니다(회원가입 없음).
// - 화면 틀은 마스터 관리자와 같은 모양(왼쪽 메뉴 · 위 제목 줄 · 카드)입니다.
// - 메뉴: 대시보드 · 내 상품 · 변경 요청 내역 · 판매·정산 · 내 정보, 왼쪽 위 "상품 등록 요청".
// 공급사에게 보이는 화면이라 주문 프로그램 이름(도매몰 시스템)은 쓰지 않습니다.
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  Banknote,
  BookOpen,
  Boxes,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  PackagePlus,
  Store,
  Trophy,
  Truck,
  UserRound,
  X
} from "lucide-react";
import { toast } from "sonner";
import { RequireAuth } from "@/components/auth/route-guards";
import { apiFetch } from "@/lib/api";
import { authClient, clearAuthToken } from "@/lib/auth";
import {
  SUPPLIER_CYCLE_LABELS,
  SUPPLIER_PASSWORD_MIN,
  SUPPLIER_PASSWORD_RECOMMENDED,
  SUPPLIER_REQUEST_KIND_LABELS,
  formatPayoutLabel,
  formatPeriodLabel
} from "@repo/shared/supplier-portal";
import { count, dayLabel, monthLabel, shortDateTime, supplierGet, supplierPost, won, type SupplierDashboard, type SupplierProfile, type SupplierRequestItem } from "./supplier-api";
import { CreateRequestModal, SupplierProducts } from "./SupplierProducts";
import { SupplierRequests } from "./SupplierRequests";
import { SupplierSales, cycleDescription } from "./SupplierSales";
import { RequestStatusPill, SettlementStatus } from "./supplier-ui";
import "./supplier-center.css";

export const SUPPLIER_SECTIONS = ["home", "products", "requests", "sales", "account"] as const;
export type SupplierSection = (typeof SUPPLIER_SECTIONS)[number];

const supplierNav: Array<{ section: SupplierSection; label: string; icon: typeof Boxes }> = [
  { section: "home", label: "대시보드", icon: LayoutDashboard },
  { section: "products", label: "내 상품", icon: Boxes },
  { section: "requests", label: "변경 요청 내역", icon: ClipboardList },
  { section: "sales", label: "판매·정산", icon: CalendarDays },
  { section: "account", label: "내 정보", icon: UserRound }
];

function DoogoLogo() {
  return <img data-image-slot="brand.doogo-food.logo-color" className="doogo-logo" src="/assets/brand/doogo-food-logo-color.png" alt="두고푸드" width="156" height="52" />;
}

// ── 로그인한 계정이 공급사 계정인지 확인 ────────────────────────────────
type AccessResult =
  | { state: "supplier"; profile: SupplierProfile }
  | { state: "guest" }
  | { state: "admin" | "other" | "unavailable"; message: string };

async function checkSupplierAccess(): Promise<AccessResult> {
  let response: Response;
  try {
    response = await apiFetch("/supplier/me", { silent: true });
  } catch {
    return { state: "other", message: "인터넷 연결을 확인한 뒤 다시 시도해 주세요." };
  }
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: SupplierProfile; error?: { message?: string } } | null;
  if (response.ok && payload?.ok && payload.data) return { state: "supplier", profile: payload.data };
  if (response.status === 401) return { state: "guest" };
  const message = payload?.error?.message || "";
  if (response.status === 503) return { state: "unavailable", message: message || "공급사 센터는 운영 배포가 끝난 뒤 쓸 수 있어요." };
  try {
    const profileResponse = await apiFetch("/me/profile", { silent: true });
    const body = (await profileResponse.json().catch(() => null)) as { data?: { profile?: { role?: string } } } | null;
    if (body?.data?.profile?.role === "admin") return { state: "admin", message: "마스터 관리자 계정으로 로그인되어 있어요. 공급사 센터는 공급사 아이디로 로그인해 주세요." };
  } catch {
    // 역할을 모르면 아래 기본 안내
  }
  return { state: "other", message: message || "공급사 계정이 아니에요. 두고푸드에서 받은 공급사 아이디로 로그인해 주세요." };
}

async function signOutEverywhere() {
  await authClient.signOut().catch(() => undefined);
  clearAuthToken();
}

function loginErrorMessage(error: { message?: string; status?: number; code?: string } | null | undefined) {
  if (!error) return "로그인하지 못했어요. 잠시 후 다시 시도해 주세요.";
  if (error.status === 401 || error.code === "INVALID_USERNAME_OR_PASSWORD" || /invalid/i.test(error.message ?? "")) return "아이디 또는 비밀번호가 맞지 않아요.";
  if (error.status === 429) return "로그인 시도가 많아요. 잠시 후 다시 시도해 주세요.";
  return error.message || "로그인하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

// ── 로그인 화면(/supplier) ──────────────────────────────────────────────
export function SupplierLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
  const returnTo = from?.pathname && /^\/supplier\/[a-z]/.test(from.pathname) ? `${from.pathname}${from.search ?? ""}` : "/supplier/home";
  const { data: session, isPending, refetch: refetchSession } = authClient.useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [sessionCheck, setSessionCheck] = useState<"idle" | "checking" | "done">("idle");
  const [notice, setNotice] = useState<{ message: string; admin: boolean } | null>(null);
  const userId = session?.user?.id;

  // 이미 로그인해 있으면: 공급사 계정이면 바로 대시보드로, 아니면 안내를 보여 줍니다.
  useEffect(() => {
    if (isPending || submitting || redirecting) return;
    if (!userId) {
      setSessionCheck("idle");
      return;
    }
    let active = true;
    setSessionCheck("checking");
    void checkSupplierAccess().then((access) => {
      if (!active) return;
      if (access.state === "supplier") {
        navigate(returnTo, { replace: true });
        return;
      }
      setNotice(access.state === "guest" ? null : { message: access.message, admin: access.state === "admin" });
      setSessionCheck("done");
    });
    return () => { active = false; };
  }, [isPending, userId, submitting, redirecting, navigate, returnTo]);

  const checkingSession = Boolean(userId) && sessionCheck !== "done" && !submitting && !redirecting;
  if (isPending || checkingSession) return <div className="admin-loading"><div className="spinner" /><span>로그인 상태를 확인하는 중…</span></div>;
  if (redirecting) return <div className="admin-loading"><div className="spinner" /><span>공급사 센터로 이동 중…</span></div>;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setNotice(null);
    try {
      if (userId) await signOutEverywhere();
      const result = await authClient.signIn.username({ username: username.trim(), password });
      if (result.error) throw new Error(loginErrorMessage(result.error));
      setRedirecting(true);
      await refetchSession();
      const refreshed = await authClient.getSession();
      if (!refreshed.data?.user) throw new Error("로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
      const access = await checkSupplierAccess();
      if (access.state === "supplier") {
        toast.success(`${access.profile.supplier.name} 공급사 센터에 로그인했어요.`);
        navigate(returnTo, { replace: true });
        return;
      }
      if (access.state === "admin") {
        toast.success("마스터 관리자 계정이라 관리자 화면으로 이동해요.");
        navigate("/admin/home", { replace: true });
        return;
      }
      await signOutEverywhere();
      await refetchSession();
      throw new Error(access.state === "guest" ? "로그인 상태를 확인하지 못했어요. 다시 시도해 주세요." : access.message);
    } catch (failure) {
      setRedirecting(false);
      toast.error(failure instanceof Error ? failure.message : "로그인하지 못했어요.");
    } finally {
      setSubmitting(false);
    }
  };

  const signOutNow = async () => {
    await signOutEverywhere();
    await refetchSession();
    setNotice(null);
    toast.success("로그아웃했어요. 공급사 아이디로 로그인해 주세요.");
  };

  return (
    <main className="admin-login-page supplier-login-page">
      <section className="login-brand-panel">
        <Link to="/" className="public-brand"><DoogoLogo /></Link>
        <div>
          <span className="login-kicker">SUPPLIER CENTER</span>
          <h1>내 상품과 정산을<br /><mark className="hero-highlight">한눈에</mark> 확인하세요.</h1>
          <p>두고푸드에 공급하는 상품의 공급가·권장 판매가, 이번 달 판매와 정산 입금일을 한 곳에서 봅니다. 상품 수정·신규 등록은 요청을 보내면 두고푸드가 확인 후 반영해요.</p>
        </div>
        <div className="login-brand-footer">
          <small>© 2026 DOOGO FOOD</small>
          <div className="login-landing-actions">
            <Link to="/how-to/supplier">공급사 사용방법</Link>
            <Link to="/">공개 상품 DB로 돌아가기</Link>
          </div>
        </div>
      </section>
      <section className="login-form-panel">
        <form onSubmit={submit} className="login-card">
          <span className="login-icon"><Store size={24} /></span>
          <h2>공급사 센터</h2>
          <p>두고푸드에서 받은 공급사 아이디로 로그인해 주세요.</p>
          {notice && (
            <div className="sup-login-notice" role="status">
              <CircleAlert size={17} aria-hidden="true" />
              <div>
                <span>{notice.message}</span>
                <div>
                  {notice.admin && <Link to="/admin/home">관리자 화면으로</Link>}
                  <button type="button" onClick={() => void signOutNow()}>로그아웃</button>
                </div>
              </div>
            </div>
          )}
          <label htmlFor="supplier-username">아이디<input id="supplier-username" name="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required /></label>
          <label htmlFor="supplier-password">비밀번호<input id="supplier-password" name="password" value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required /></label>
          <button type="submit" disabled={submitting}>{submitting ? "확인 중…" : "로그인"}</button>
          <p className="sup-login-help">아이디·비밀번호를 잊으셨으면 두고푸드 담당자에게 문의해 주세요. 회원가입 없이 두고푸드가 계정을 만들어 드려요.</p>
        </form>
      </section>
    </main>
  );
}

// ── /supplier/:section ─────────────────────────────────────────────────
export function SupplierCenterRoute() {
  const { section } = useParams();
  if (!section || !(SUPPLIER_SECTIONS as readonly string[]).includes(section)) return <Navigate to="/supplier/home" replace />;
  return <RequireAuth redirectTo="/supplier"><SupplierAccessGate section={section as SupplierSection} /></RequireAuth>;
}

type GateState =
  | { status: "loading" }
  | { status: "ok"; profile: SupplierProfile }
  | { status: "guest" }
  | { status: "blocked"; message: string; admin: boolean; unavailable: boolean };

function SupplierAccessGate({ section }: { section: SupplierSection }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState<GateState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    void checkSupplierAccess().then((access) => {
      if (!active) return;
      if (access.state === "supplier") setState({ status: "ok", profile: access.profile });
      else if (access.state === "guest") setState({ status: "guest" });
      else setState({ status: "blocked", message: access.message, admin: access.state === "admin", unavailable: access.state === "unavailable" });
    });
    return () => { active = false; };
  }, []);

  if (state.status === "loading") return <div className="admin-loading"><div className="spinner" /><span>공급사 센터를 여는 중…</span></div>;
  if (state.status === "guest") return <Navigate to="/supplier" replace state={{ from: location }} />;
  if (state.status === "blocked") {
    const signOut = async () => {
      await signOutEverywhere();
      navigate("/supplier", { replace: true });
    };
    return (
      <main className="sup-blocked">
        <section className="login-card">
          <span className="login-icon"><CircleAlert size={24} /></span>
          <h2>{state.unavailable ? "곧 열려요" : "공급사 센터를 열 수 없어요"}</h2>
          <p>{state.message}</p>
          <div className="sup-blocked-actions">
            {state.admin && <Link className="primary-action" to="/admin/home">관리자 화면으로</Link>}
            <button type="button" onClick={() => void signOut()}><LogOut size={15} /> 로그아웃하고 다시 로그인</button>
            <Link to="/">공개 상품 DB</Link>
          </div>
        </section>
      </main>
    );
  }
  return <SupplierShell section={section} profile={state.profile} />;
}

// ── 화면 틀(마스터 관리자와 같은 모양) ──────────────────────────────────
function SupplierShell({ section, profile }: { section: SupplierSection; profile: SupplierProfile }) {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!sidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [sidebarOpen]);

  useEffect(() => {
    let active = true;
    void supplierGet<{ requests: SupplierRequestItem[] }>("/requests")
      .then((data) => { if (active) setPendingCount(data.requests.filter((request) => request.status === "pending").length); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [reloadKey]);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [section]);

  const changed = useCallback(() => setReloadKey((value) => value + 1), []);
  const openCreate = useCallback(() => {
    setSidebarOpen(false);
    setCreateOpen(true);
  }, []);

  const signOut = async () => {
    await signOutEverywhere();
    navigate("/supplier", { replace: true });
  };

  const current = supplierNav.find((item) => item.section === section);
  return (
    <div className="admin-shell supplier-shell">
      <aside className={`admin-sidebar ${sidebarOpen ? "open" : ""}`} aria-label="공급사 센터 메뉴">
        <div className="admin-brand"><Link to="/supplier/home" aria-label="공급사 대시보드로 이동"><DoogoLogo /></Link><button onClick={() => setSidebarOpen(false)} aria-label="메뉴 닫기"><X size={20} /></button></div>
        <div className="admin-role"><Store size={17} /><span><small>SUPPLIER</small><strong>{profile.supplier.name}</strong></span></div>
        <button type="button" className="admin-sidebar-primary" onClick={openCreate}><PackagePlus size={16} /> 상품 등록 요청</button>
        <nav>
          {supplierNav.map((item) => {
            const Icon = item.icon;
            const badge = item.section === "requests" && pendingCount > 0 ? <span className="sup-nav-badge" aria-label={`승인 대기 ${pendingCount}건`}>{pendingCount}</span> : null;
            return <Link key={item.section} to={`/supplier/${item.section}`} className={section === item.section ? "active" : ""} aria-current={section === item.section ? "page" : undefined} onClick={() => setSidebarOpen(false)}><Icon size={18} />{item.label}{badge}<ChevronRight size={15} /></Link>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <Link to="/how-to/supplier" onClick={() => setSidebarOpen(false)}><BookOpen size={17} /> 공급사 사용방법</Link>
          <Link to="/" onClick={() => setSidebarOpen(false)}><Truck size={17} /> 공개 단가표 보기</Link>
          <button type="button" onClick={() => void signOut()}><LogOut size={17} /> 로그아웃</button>
        </div>
      </aside>
      {sidebarOpen && <button className="admin-sidebar-backdrop" type="button" onClick={() => setSidebarOpen(false)} aria-label="공급사 메뉴 닫기" />}
      <main className="admin-main">
        <header className="admin-topbar">
          <button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="메뉴 열기"><Menu size={21} /></button>
          <div><strong>{current?.label}</strong><span>DOOGO FOOD 공급사 센터</span></div>
          <div className="admin-topbar-tools"><span className="admin-chip sup-chip"><Store size={15} /> <span className="sup-chip-name">{profile.supplier.name}</span></span></div>
        </header>
        <div className="admin-content">
          {section === "home" && <SupplierHome profile={profile} reloadKey={reloadKey} onCreate={openCreate} />}
          {section === "products" && <SupplierProducts reloadKey={reloadKey} onCreate={openCreate} onChanged={changed} />}
          {section === "requests" && <SupplierRequests reloadKey={reloadKey} onChanged={changed} />}
          {section === "sales" && <SupplierSales />}
          {section === "account" && <SupplierAccount profile={profile} />}
        </div>
      </main>
      {createOpen && (
        <CreateRequestModal
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            changed();
            if (section !== "requests") toast("요청은 '변경 요청 내역'에서 확인할 수 있어요.", { action: { label: "내역 보기", onClick: () => navigate("/supplier/requests") } });
          }}
        />
      )}
    </div>
  );
}

// ── 대시보드 ────────────────────────────────────────────────────────────
function SupplierHome({ profile, reloadKey, onCreate }: { profile: SupplierProfile; reloadKey: number; onCreate: () => void }) {
  const [data, setData] = useState<SupplierDashboard | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    void supplierGet<SupplierDashboard>("/dashboard")
      .then((value) => { if (active) { setData(value); setError(""); } })
      .catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : "대시보드를 불러오지 못했어요."); });
    return () => { active = false; };
  }, [reloadKey, retry]);

  if (error && !data) {
    return <section className="admin-card"><div className="empty-state"><CircleAlert size={28} /><strong>대시보드를 불러오지 못했어요.</strong><span>{error}</span><button type="button" className="sup-retry" onClick={() => setRetry((value) => value + 1)}>다시 불러오기</button></div></section>;
  }
  if (!data) return <div className="admin-loading inline"><div className="spinner" /><span>대시보드를 불러오는 중…</span></div>;

  const { sales, upcomingSettlement: upcoming, products, requests } = data;
  const rate = data.account.commissionRate;
  const onSale = Math.max(0, products.total - products.soldOut);
  return (
    <>
      <div className="admin-page-heading">
        <div><span>SUPPLIER DASHBOARD</span><h1>대시보드</h1><p>{dayLabel(data.today)} 기준 · 이번 달 판매와 다음 정산, 변경 요청 진행 상황을 한눈에 봅니다.</p></div>
        <button className="primary-action" type="button" onClick={onCreate}><PackagePlus size={16} /> 상품 등록 요청</button>
      </div>
      <section className="admin-home-hero sup-hero">
        <div>
          <span className="sup-hero-kicker">{profile.supplier.name}</span>
          <h2>다음 정산은 <mark>{formatPayoutLabel(upcoming)}</mark> 입금 예정이에요.</h2>
          <p>{formatPeriodLabel(upcoming)} 판매분 · 판매 대금 {won(upcoming.payoutAmount)}{upcoming.commission ? ` · 수수료 ${rate}% ${won(upcoming.commission)}` : ""}</p>
        </div>
        <Link to="/supplier/sales" className="admin-home-live"><span className="live-dot" /> 정산 달력 보기</Link>
      </section>
      <section className="admin-home-stat-grid">
        <Link to="/supplier/sales" className="admin-home-stat featured"><span>{monthLabel(data.month)} 판매 금액</span><strong>{won(sales.totals.netAmount)}</strong><small>판매 {won(sales.totals.saleAmount)} · 반품 {won(sales.totals.returnAmount)}</small></Link>
        <Link to="/supplier/sales" className="admin-home-stat"><span>다음 정산 입금</span><strong>{won(upcoming.payoutAmount)}</strong><small>{formatPayoutLabel(upcoming)} · 실 수령 예상 {won(upcoming.netIncome)}</small></Link>
        <Link to="/supplier/products" className="admin-home-stat"><span>판매 중인 상품</span><strong>{count(onSale)}</strong><small>내 상품 {count(products.total)} · 품절 {count(products.soldOut)}{products.hidden ? ` · 숨김 ${count(products.hidden)}` : ""}</small></Link>
        <Link to="/supplier/requests" className="admin-home-stat"><span>승인 대기 요청</span><strong>{count(requests.pending, "건")}</strong><small>두고푸드 승인 후 상품에 반영돼요</small></Link>
      </section>
      <div className="admin-home-grid">
        <section className="admin-card admin-home-panel">
          <div className="card-heading"><Trophy size={19} aria-hidden="true" /><div><h2>이번 달 잘 팔린 상품</h2><p>순매출이 큰 순서 TOP 5</p></div><Link to="/supplier/sales">전체 순위 <ArrowRight size={13} /></Link></div>
          {sales.ranking.length === 0 ? (
            <div className="admin-home-unavailable"><CalendarDays size={17} aria-hidden="true" /> 아직 이번 달 판매 내역이 없어요. 두고푸드 주문 데이터가 연결되면 순위가 자동으로 채워져요.</div>
          ) : (
            <ol className="sup-rank-list">
              {sales.ranking.map((item, index) => (
                <li key={`${item.productId ?? item.productCode ?? item.productName}`}>
                  <b className={`supplier-rank rank-${Math.min(index + 1, 3)}`}>{index + 1}위</b>
                  <strong>{item.productName}</strong>
                  <span>{won(item.netAmount)}<small>{item.netQuantity.toLocaleString("ko-KR")}개</small></span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="admin-card admin-home-panel">
          <div className="card-heading"><Banknote size={19} aria-hidden="true" /><div><h2>다음 정산</h2><p>{SUPPLIER_CYCLE_LABELS[upcoming.cycle]} · {formatPeriodLabel(upcoming)} 판매분</p></div><Link to="/supplier/sales">정산 달력 <ArrowRight size={13} /></Link></div>
          <SettlementStatus state={upcoming.state} detail />
          <dl className="sup-money-list">
            <div><dt>입금 예정일</dt><dd>{formatPayoutLabel(upcoming)}</dd></div>
            <div><dt>판매 대금(100%)</dt><dd>{won(upcoming.payoutAmount)}</dd></div>
            <div><dt>수수료({rate}%)</dt><dd>{upcoming.commission ? `-${won(upcoming.commission)}` : "0원"}</dd></div>
            <div className="is-total"><dt>실 수령 예상</dt><dd>{won(upcoming.netIncome)}</dd></div>
          </dl>
          <p className="sup-card-note">{cycleDescription(upcoming.cycle, rate)}</p>
        </section>
        <section className="admin-card admin-home-panel">
          <div className="card-heading"><ClipboardList size={19} aria-hidden="true" /><div><h2>최근 변경 요청</h2><p>승인 대기 {requests.pending}건</p></div><Link to="/supplier/requests">요청 내역 <ArrowRight size={13} /></Link></div>
          {requests.recent.length === 0 ? (
            <div className="admin-home-unavailable"><ClipboardList size={17} aria-hidden="true" /> 아직 보낸 요청이 없어요. 내 상품에서 변경 요청을 보내거나 새 상품 등록을 요청해 보세요.</div>
          ) : (
            <ul className="sup-recent-list">
              {requests.recent.map((request) => (
                <li key={request.id}>
                  <span className={`sup-kind is-${request.kind}`}>{SUPPLIER_REQUEST_KIND_LABELS[request.kind]}</span>
                  <strong>{request.productName}</strong>
                  <RequestStatusPill status={request.status} />
                  <small>{shortDateTime(request.updatedAt)}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="admin-card admin-home-panel">
          <div className="card-heading"><Boxes size={19} aria-hidden="true" /><div><h2>바로 가기</h2><p>자주 쓰는 메뉴</p></div></div>
          <div className="sup-quick-grid">
            <button type="button" onClick={onCreate}><PackagePlus size={18} /><span><strong>상품 등록 요청</strong><small>새 상품 정보를 보내요</small></span></button>
            <Link to="/supplier/products"><Boxes size={18} /><span><strong>공급가·판매가 확인</strong><small>내 상품 {count(products.total)}</small></span></Link>
            <Link to="/supplier/sales"><CalendarDays size={18} /><span><strong>정산 달력</strong><small>날짜별 판매·반품</small></span></Link>
            <Link to="/how-to/supplier"><BookOpen size={18} /><span><strong>공급사 사용방법</strong><small>주문·송장·정산 안내</small></span></Link>
          </div>
        </section>
      </div>
    </>
  );
}

// ── 내 정보 ─────────────────────────────────────────────────────────────
function SupplierAccount({ profile }: { profile: SupplierProfile }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const { supplier, account } = profile;
  const infoRows: Array<[string, string | null]> = [
    ["업체명", supplier.name],
    ["대표자", supplier.representative],
    ["사업자등록번호", supplier.businessNumber],
    ["담당자 연락처", supplier.phone],
    ["담당자 이메일", supplier.email],
    ["주소", supplier.address]
  ];

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword.length < SUPPLIER_PASSWORD_MIN) {
      toast.error(`새 비밀번호는 ${SUPPLIER_PASSWORD_MIN}자 이상 입력해 주세요.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("새 비밀번호와 확인 칸이 서로 달라요.");
      return;
    }
    setSaving(true);
    try {
      await supplierPost("/password", { currentPassword, newPassword });
      toast.success("비밀번호를 바꿨어요. 다른 기기에서는 다시 로그인해야 해요.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "비밀번호를 바꾸지 못했어요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="admin-page-heading">
        <div><span>MY ACCOUNT</span><h1>내 정보</h1><p>공급사 정보와 정산 방식, 로그인 비밀번호를 관리합니다.</p></div>
      </div>
      <div className="sup-account-grid">
        <section className="admin-card">
          <div className="card-heading"><Store size={19} aria-hidden="true" /><div><h2>공급사 정보</h2><p>정보가 바뀌었으면 두고푸드 담당자에게 알려 주세요.</p></div></div>
          <dl className="sup-info-list">{infoRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "-"}</dd></div>)}</dl>
        </section>
        <section className="admin-card">
          <div className="card-heading"><Banknote size={19} aria-hidden="true" /><div><h2>계정·정산</h2><p>정산 방식과 수수료는 두고푸드와 계약한 기준이에요.</p></div></div>
          <dl className="sup-info-list">
            <div><dt>아이디</dt><dd>{account.username}</dd></div>
            <div><dt>정산 방식</dt><dd>{SUPPLIER_CYCLE_LABELS[account.settlementCycle]}</dd></div>
            <div><dt>판매 수수료</dt><dd>{account.commissionRate}%</dd></div>
            <div><dt>마지막 접속</dt><dd>{shortDateTime(account.lastLoginAt)}</dd></div>
          </dl>
          <p className="sup-card-note">{cycleDescription(account.settlementCycle, account.commissionRate)}</p>
        </section>
        <form className="admin-card sup-password-card" onSubmit={submit}>
          <div className="card-heading"><KeyRound size={19} aria-hidden="true" /><div><h2>비밀번호 바꾸기</h2><p>바꾸면 이 기기를 뺀 다른 기기는 로그아웃돼요.</p></div></div>
          <div className="editor-grid sup-password-grid">
            <label className="full">지금 비밀번호<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>
            <label>새 비밀번호<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={SUPPLIER_PASSWORD_MIN} maxLength={128} required /><small>{SUPPLIER_PASSWORD_RECOMMENDED}자 이상, 영문·숫자를 섞으면 더 안전해요.</small></label>
            <label>새 비밀번호 확인<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" maxLength={128} required /></label>
          </div>
          <div className="sup-password-actions"><button className="primary-action" type="submit" disabled={saving}><KeyRound size={16} /> {saving ? "바꾸는 중…" : "비밀번호 바꾸기"}</button></div>
        </form>
      </div>
    </>
  );
}
