// 페이지 안에서 도는 두고푸드 서버: apps/server의 상품 API(catalog.route.ts)를 그대로 마운트하고,
// 로그인은 claude.ai 계정의 편집 권한으로 대신합니다.
import { Hono } from "hono";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { catalogRouter } from "../../apps/server/routes/catalog.route";
import type { AuthUser } from "../../apps/server/_core/auth";
import { getSqlDatabase, setDatabase } from "./browser-db";
import {
  buildPublicBytes,
  loadSqlJs,
  readDatabaseBytes,
  readMeta,
  writeDatabaseBytes,
  type DbApi,
  type Meta
} from "./persistence";

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser | null;
    session: null;
  }
}

type UserApi = { canEdit(): Promise<boolean>; id(): Promise<string | null> };
type ClaudeGlobal = { use(name: string): Promise<unknown> };

const EDITOR_TOKEN = "doogo-artifact-editor";
const ADMIN_USER: AuthUser = {
  id: "reviewhub-master-admin",
  name: "마스터 관리자",
  email: "admin@reviewhub.local",
  emailVerified: true,
  role: "admin",
  username: "admin"
};

const state: {
  store: DbApi | null;
  isEditor: boolean;
  viewerId: string | null;
  mode: "full" | "pub";
  meta: Meta | null;
  pubMeta: Meta | null;
  dirty: boolean;
  saving: boolean;
  timer: ReturnType<typeof setTimeout> | null;
} = { store: null, isEditor: false, viewerId: null, mode: "pub", meta: null, pubMeta: null, dirty: false, saving: false, timer: null };

const app = new Hono({ strict: false });

app.use("/api/*", async (c, next) => {
  const authorized = c.req.header("Authorization") === `Bearer ${EDITOR_TOKEN}` && state.isEditor;
  c.set("user", authorized ? ADMIN_USER : null);
  c.set("session", null);
  await next();
});

const forbidden = () => apiFailure("FORBIDDEN", "관리자센터는 이 페이지의 편집 권한이 있는 claude.ai 계정만 이용할 수 있습니다.");

app.post("/api/auth/sign-in/username", (c) => {
  if (!state.isEditor) return c.json(forbidden(), 403);
  c.header("set-auth-token", EDITOR_TOKEN);
  return c.json({ redirect: false, token: EDITOR_TOKEN, user: { ...ADMIN_USER, image: null } });
});
app.post("/api/auth/sign-in/email", (c) => {
  if (!state.isEditor) return c.json(forbidden(), 403);
  c.header("set-auth-token", EDITOR_TOKEN);
  return c.json({ redirect: false, token: EDITOR_TOKEN, user: { ...ADMIN_USER, image: null } });
});
app.get("/api/auth/get-session", (c) => {
  if (!c.var.user) return c.json(null);
  const now = new Date();
  return c.json({
    session: { id: "artifact-session", token: EDITOR_TOKEN, userId: ADMIN_USER.id, createdAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + 7 * 864e5) },
    user: { ...ADMIN_USER, image: null, createdAt: now, updatedAt: now }
  });
});
app.post("/api/auth/sign-out", (c) => c.json({ success: true }));
app.get("/api/me/profile", (c) => {
  const user = c.var.user;
  if (!user) return c.json(apiFailure("UNAUTHORIZED", "Unauthorized"), 401);
  return c.json(apiSuccess({ profile: user }));
});
app.get("/api/health", (c) => c.json(apiSuccess({ service: "server", runtime: "artifact" })));
app.route("/api/catalog", catalogRouter);
app.onError((error, c) => {
  const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : "";
  console.error("[doogo-backend]", error);
  return c.json(apiFailure("INTERNAL_ERROR", `${error instanceof Error ? error.message.split("\n")[0] : "처리 중 오류가 발생했습니다."}${cause}`), 500);
});
app.notFound((c) => c.json(apiFailure("NOT_FOUND", "요청한 기능을 찾을 수 없습니다."), 404));

// 요청은 한 번에 하나씩 처리합니다(트랜잭션 중간에 다른 요청이 끼어들지 않도록).
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

let readyResolve: () => void;
let readyReject: (error: unknown) => void;
const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });

async function handle(request: Request): Promise<Response> {
  await ready;
  return serialize(async () => {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const isSourcingSubmit = method === "POST" && url.pathname.replace(/\/$/, "") === "/api/catalog/sourcing";
    const response = await app.fetch(request);
    if (method === "GET" || !response.ok) return response;
    if (state.isEditor && request.headers.get("Authorization") === `Bearer ${EDITOR_TOKEN}`) {
      scheduleSave();
    } else if (state.isEditor && isSourcingSubmit) {
      scheduleSave();
    } else if (isSourcingSubmit) {
      return forwardSourcingRequest(response);
    }
    return response;
  });
}

async function forwardSourcingRequest(response: Response) {
  const body = await response.clone().json().catch(() => null) as { data?: { request?: Record<string, unknown> } & Record<string, unknown> } | null;
  const record = (body?.data?.request ?? body?.data) as Record<string, unknown> | undefined;
  if (!state.store || !state.viewerId || !record?.id) {
    return new Response(JSON.stringify(apiFailure("SOURCING_UNAVAILABLE", "claude.ai에 로그인한 상태에서만 소싱 요청을 보낼 수 있습니다.")), { status: 503, headers: { "content-type": "application/json" } });
  }
  try {
    const ref = state.store.doc(`inbox/${state.viewerId}`);
    const snap = await ref.get();
    const requests = { ...((snap.exists ? snap.data()?.requests : undefined) as Record<string, unknown> | undefined ?? {}) };
    requests[String(record.id)] = record;
    await ref.set({ requests });
    return response;
  } catch {
    return new Response(JSON.stringify(apiFailure("SOURCING_SAVE_FAILED", "소싱 요청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.")), { status: 502, headers: { "content-type": "application/json" } });
  }
}

// ---- 저장 상태 표시 (편집 권한자에게만) ----
function setStatus(text: string, tone: "busy" | "ok" | "error") {
  if (!state.isEditor) return;
  let el = document.getElementById("doogo-save-status");
  if (!el) {
    el = document.createElement("div");
    el.id = "doogo-save-status";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.dataset.tone = tone;
  el.hidden = false;
  if (tone === "ok") setTimeout(() => { if (el && el.dataset.tone === "ok") el.hidden = true; }, 2500);
}

function scheduleSave() {
  state.dirty = true;
  setStatus("변경 내용 저장 대기…", "busy");
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => { void save(); }, 1200);
}

async function save() {
  if (!state.store || !state.isEditor) return;
  if (state.saving) { state.timer = setTimeout(() => { void save(); }, 800); return; }
  state.saving = true;
  state.dirty = false;
  setStatus("저장 중…", "busy");
  try {
    const SQL = await loadSqlJs();
    const fullBytes = await serialize(async () => getSqlDatabase().export());
    state.meta = await writeDatabaseBytes(state.store, "full", fullBytes, state.meta);
    state.pubMeta = await writeDatabaseBytes(state.store, "pub", buildPublicBytes(SQL, fullBytes), state.pubMeta);
    setStatus("저장됨", "ok");
  } catch (error) {
    state.dirty = true;
    setStatus(`저장 실패: ${error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : "다시 시도해 주세요"}`, "error");
  } finally {
    state.saving = false;
  }
}

async function importInbox() {
  if (!state.store) return 0;
  const snap = await state.store.collection("inbox").get();
  let imported = 0;
  for (const doc of snap.docs) {
    const requests = (doc.data()?.requests ?? {}) as Record<string, Record<string, unknown>>;
    for (const record of Object.values(requests)) {
      await serialize(async () => {
        getSqlDatabase().run(
          `INSERT OR IGNORE INTO sourcing_requests (id, productName, desiredPrice, referenceUrl, requesterName, contact, details, status, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, 'received'), COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))`,
          [record.id, record.productName, record.desiredPrice, record.referenceUrl, record.requesterName, record.contact, record.details, record.status, record.createdAt, record.updatedAt].map((v) => (v === undefined ? null : v)) as (string | number | null)[]
        );
      });
      imported += 1;
    }
  }
  if (imported > 0) {
    await save();
    await Promise.all(snap.docs.map((doc) => state.store!.doc(`inbox/${doc.id}`).delete().catch(() => undefined)));
  }
  return imported;
}

function watchRemote() {
  if (!state.store) return;
  state.store.doc(`${state.mode}/meta`).onSnapshot((snap) => {
    const meta = snap.exists ? (snap.data() as unknown as Meta) : null;
    const current = state.mode === "full" ? state.meta : state.pubMeta;
    if (!meta || !current || meta.version <= current.version || state.dirty || state.saving) return;
    void (async () => {
      const loaded = await readDatabaseBytes(state.store!, state.mode);
      if (!loaded || state.dirty || state.saving) return;
      const SQL = await loadSqlJs();
      await serialize(async () => {
        const previous = getSqlDatabase();
        setDatabase(new SQL.Database(loaded.bytes));
        previous.close();
      });
      if (state.mode === "full") state.meta = loaded.meta; else state.pubMeta = loaded.meta;
    })().catch(() => undefined);
  }, () => undefined);
}

async function boot() {
  const claude = (window as unknown as { claude?: ClaudeGlobal }).claude;
  const [SQL, store, user] = await Promise.all([
    loadSqlJs(),
    (claude?.use("db") ?? Promise.resolve(null)) as Promise<DbApi | null>,
    (claude?.use("user") ?? Promise.resolve(null)) as Promise<UserApi | null>
  ]);
  if (!store) throw new Error("이 페이지의 데이터 저장소에 연결할 수 없습니다. claude.ai에서 로그인한 상태로 열어 주세요.");
  state.store = store;
  state.isEditor = user ? await user.canEdit().catch(() => false) : false;
  state.viewerId = user ? await user.id().catch(() => null) : null;
  state.mode = state.isEditor ? "full" : "pub";
  const loaded = await readDatabaseBytes(store, state.mode);
  if (!loaded) throw new Error("아직 저장된 상품 데이터가 없습니다.");
  setDatabase(new SQL.Database(loaded.bytes));
  if (state.mode === "full") {
    state.meta = loaded.meta;
    state.pubMeta = await readMeta(store, "pub");
  } else {
    state.pubMeta = loaded.meta;
  }
  watchRemote();
  if (state.isEditor) {
    void importInbox().catch(() => undefined);
    window.addEventListener("beforeunload", (event) => { if (state.dirty || state.saving) event.preventDefault(); });
  }
}

boot().then(() => readyResolve(), (error) => {
  readyReject(error);
  const message = error instanceof Error ? error.message : "데이터를 불러오지 못했습니다.";
  const banner = document.getElementById("doogo-boot-error");
  if (banner) { banner.textContent = message; banner.hidden = false; }
});
ready.catch(() => undefined);

(window as unknown as { __doogoBackend: unknown }).__doogoBackend = { handle, ready };
