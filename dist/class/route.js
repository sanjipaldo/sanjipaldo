/* 주소 — 정식 주소(www.doogoclass.com · *.vercel.app)에서는 ‘#’ 없는 깨끗한 주소를 써요.
 *   /vod/p/v5 · /doinggo · /center/master · /login · /terms · /privacy · /refund
 * 화면 코드는 예전처럼 ROUTE.hash 로 ‘#/vod/p/v5’ 모양을 읽고 쓰면 돼요 (안에서 주소창 경로로 바꿔 줘요).
 *   읽기  ROUTE.hash            → "#/vod/p/v5" (대표 주소 / 는 "")
 *   이동  ROUTE.hash = "#/vod"   → 주소창 /vod (기록 남김) + hashchange 알림 — 화면 코드가 듣던 그대로
 *   바꾸기 ROUTE.replace("#/vod") → 기록을 남기지 않고 주소만 · ROUTE.redirect(…) 는 바꾸고 다시 그리기
 *   ROUTE.dropQuery(["pay"])     → 주소창 ? 뒤에서 결제 · 카카오 돌아오기 값만 지우기
 *   ROUTE.abs("#/p/moon")        → 공유용 전체 주소 (https://www.doogoclass.com/p/moon)
 *   ROUTE.frag("id")             → SVG 안 그림 참조(<use href> · url(#…))용 — <base> 가 있어도 같은 문서를 가리키게
 * <a href="#/…"> 를 누르면 새로고침 없이 이동해요. 예전 주소(/#/vod/p/v5 · 카카오 · 결제 돌아오기)로 들어오면 /vod/p/v5 로 바꿔요.
 * 미리보기(claude.ai) · 정적 서버 · 파일로 열 때는 진짜 #주소를 그대로 써요 (그곳엔 /vod 같은 주소를 index.html 로 넘겨 줄 서버가 없어서).
 * 켜는 조건은 index.html <head> 맨 위 스크립트가 정해요 (window.__dcClean · 상대 주소가 맨 위(/)를 기준으로 열리게 <base href="/">). */
(function () {
  "use strict";
  const clean = !!window.__dcClean;
  // 주소창 ? 뒤에서 keys 만 지우고 남은 것 ("?tab=vod" 또는 "") — 깨끗한 주소에서는 화면 쿼리(?tab= · ?q=)도 여기 있어서 통째로 지우면 안 돼요
  const leftQuery = (keys) => { const q = new URLSearchParams(location.search); (keys || Array.from(q.keys())).forEach((k) => q.delete(k)); const s = q.toString(); return s ? "?" + s : ""; };
  const fire = () => { let e; try { e = new HashChangeEvent("hashchange"); } catch (x) { e = document.createEvent("Event"); e.initEvent("hashchange", false, false); } window.dispatchEvent(e); };
  if (!clean) {
    window.ROUTE = {
      clean: false,
      get hash() { return location.hash; },
      set hash(v) { location.hash = v; },
      replace(v) { history.replaceState(null, "", location.pathname + location.search + (v && v !== "#" ? v : "")); },
      redirect(v) { location.replace(v && v !== "#" ? v : "#/"); },
      dropQuery(keys) { history.replaceState(null, "", location.pathname + leftQuery(keys) + location.hash); },
      abs: (h) => location.href.split("#")[0] + (h || ""),
      frag: (id) => "#" + id
    };
    return;
  }
  // "#/vod/p/v5?x=1" → "/vod/p/v5?x=1" · "" · "#" · "#/" → "/"
  const toPath = (h) => { h = String(h || "").replace(/^#/, ""); if (!h || h === "/") return "/"; return h.charAt(0) === "/" ? h : "/" + h; };
  const here = () => (location.pathname === "/index.html" ? "/" : location.pathname) + location.search;
  // 예전 #주소 → 경로. 주소창 ? 뒤(결제 · 카카오 돌아오기 값)는 남겨요
  function absorb() {
    const h = location.hash;
    if (h.indexOf("#/") !== 0) return false;
    const raw = h.slice(1), qi = raw.indexOf("?"), p = qi >= 0 ? raw.slice(0, qi) : raw, qs = new URLSearchParams(location.search);
    if (qi >= 0) new URLSearchParams(raw.slice(qi + 1)).forEach((v, k) => qs.set(k, v));
    const s = qs.toString();
    history.replaceState(history.state, "", (p === "/" ? "/" : p) + (s ? "?" + s : ""));
    return true;
  }
  absorb();
  window.ROUTE = {
    clean: true,
    get hash() {
      if (location.hash.indexOf("#/") === 0) return location.hash; // 바꾸기 직전 (아래 hashchange 에서 바로 바꿔요)
      const p = location.pathname;
      return p === "/" || p === "/index.html" ? "" : "#" + p + location.search;
    },
    // 브라우저처럼 알림은 바로 다음 차례에 (주소를 바꾼 코드가 하던 일을 마저 끝낸 뒤 화면을 다시 그려요)
    set hash(v) { const to = toPath(v); if (to === here()) return; history.pushState(null, "", to); setTimeout(fire, 0); },
    replace(v) { history.replaceState(null, "", toPath(v)); },
    redirect(v) { history.replaceState(null, "", toPath(v)); setTimeout(fire, 0); },
    dropQuery(keys) { history.replaceState(null, "", location.pathname + leftQuery(keys)); },
    abs: (h) => location.origin + toPath(h),
    frag: (id) => location.pathname + location.search + "#" + id
  };
  // 누가 진짜 #주소를 바꿔도(예전 링크 · 주소창에 직접) 다른 화면 코드보다 먼저 경로로 바꿔 둬요
  window.addEventListener("hashchange", (e) => { if (e.isTrusted) absorb(); });
  // 뒤로 · 앞으로: 화면 코드에는 hashchange 로 알려요 (#주소가 바뀐 거면 브라우저가 hashchange 를 따로 보내요)
  window.addEventListener("popstate", () => { if (location.hash.indexOf("#/") !== 0) fire(); });
  // <a href="#/…"> → 새로고침 없이 이동 · <a href="#아이디"> → 그 자리로 스크롤 (<base> 때문에 맨 위 주소로 가 버리지 않게)
  // 화면 코드가 먼저 처리(preventDefault)한 클릭 · 새 창 · 새 탭 · 내려받기는 건드리지 않아요
  window.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
    const href = a.getAttribute("href") || "";
    if (href.charAt(0) !== "#") return;
    e.preventDefault();
    if (href === "#" || href.indexOf("#/") === 0) { window.ROUTE.hash = href; return; }
    let id = href.slice(1); try { id = decodeURIComponent(id); } catch (x) {}
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  });
})();
