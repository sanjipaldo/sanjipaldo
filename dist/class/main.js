/* 화면 전환: #/center… 는 강사센터·마스터(admin.js), #/p/… 는 강사 홍보 랜딩페이지(landing.js), 나머지는 수강생 센터(app.js)
 * 서버(/api)가 있으면 데이터를 서버에서 받아 오고(여러 기기·여러 사람이 같은 데이터), 없으면 이 브라우저에 저장한다. */
(function () {
  "use strict";
  let mode = null;
  function go() {
    const h = location.hash;
    const next = /^#\/center/.test(h) ? "admin" : /^#\/(p|free)(\/|\?|$)/.test(h) ? "landing" : "student";
    const changed = next !== mode;
    mode = next;
    document.body.dataset.mode = next;
    if (next === "admin") window.applyStudentTheme(null); else document.body.dataset.master = "";
    document.getElementById("modal-root").innerHTML = "";
    const app = next === "admin" ? window.AdminApp : next === "landing" ? window.LandingApp : window.StudentApp;
    if (changed) app.mount(); else app.render();
  }

  // 서버 로그인 상태와 이 브라우저에 남은 화면 세션을 맞춘다 (다른 기기에서 로그아웃 · 계정 중지 등)
  function reconcile() {
    const me = DB.remote.me;
    const st = DB.session.student();
    if (st && st.preview && !me.admin) DB.session.setStudent(null);
    else if (st && !st.preview && !(me.student && me.student.sid === st.id)) DB.session.setStudent(null);
    const ad = DB.session.admin();
    if (ad) {
      const a = me.admin;
      const ok = a && a.role === ad.role && (a.role === "master" || (a.iid === ad.instructorId && (a.role !== "coach" || a.cid === ad.coachId)));
      if (!ok) DB.session.setAdmin(null);
    }
  }

  // 다른 사람이 바꾼 내용이 들어오면 다시 그린다. 입력 중이거나 팝업이 열려 있으면 다음 화면 이동 때까지 미룬다
  let typing = false, waiting = false;
  document.addEventListener("input", () => { typing = true; }, true);
  document.addEventListener("submit", () => { setTimeout(() => { typing = false; }, 0); }, true);
  const busy = () => typing || !!document.querySelector("#modal-root > *") || (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName));
  function onRemote(type, info) {
    if (type === "reset") { location.reload(); return; }
    if (type === "error") { notify(info, "warn"); return; }
    if (type === "offline") { notify("인터넷 연결이 불안정해 저장을 다시 시도하고 있어요.", "warn", "offline"); return; }
    if (type === "saving" && info === false) { const t = document.querySelector('.toast[data-key="offline"]'); if (t) t.remove(); return; }
    if (type !== "change") return;
    reconcile();
    if (busy()) { waiting = true; return; }
    go();
  }
  function notify(msg, kind, key) {
    const box = document.getElementById("toast-root");
    if (!box || (key && box.querySelector('[data-key="' + key + '"]'))) return;
    const t = document.createElement("div");
    t.className = "toast";
    if (key) t.dataset.key = key;
    t.innerHTML = (window.icon ? window.icon(kind === "warn" ? "alert" : "check", "sm") : "") + "<span>" + DB.esc(msg) + "</span>";
    box.appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }

  function start(server) {
    DB.load();
    if (server) { reconcile(); DB.remote.listen(onRemote); }
    else {
      // 다른 탭(예: 강사센터 탭)에서 바뀐 내용을 이 탭에도 반영
      window.addEventListener("storage", (e) => {
        if (e.key && e.key.indexOf("moonclass:db") === 0) { DB.load(); go(); }
      });
    }
    window.addEventListener("hashchange", () => { typing = false; if (waiting) waiting = false; go(); });
    go();
  }
  // 네이버 카페 링크: 휴대폰에서는 모바일 카페(m.cafe.naver.com), PC 에서는 PC 카페로 연다
  // (PC 주소 그대로 휴대폰에서 열면 글이 PC 화면 틀 안에 작게 보인다)
  const MOBILE = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  function cafeLink(href, mobile) {
    let u;
    try { u = new URL(href); } catch (e) { return href; }
    const host = u.hostname.toLowerCase();
    if (host !== "cafe.naver.com" && host !== "m.cafe.naver.com") return href;
    if ((host === "m.cafe.naver.com") === mobile) return href;
    let club = "", cid = "", aid = "";
    const fromPath = (p) => {
      let m = /\/cafes\/(\d+)\/articles\/(\d+)/.exec(p);
      if (m) { cid = m[1]; aid = m[2]; return; }
      m = /ArticleRead\.nhn\?(.*)$/i.exec(p);
      if (m) { const q = new URLSearchParams(m[1]); cid = q.get("clubid") || ""; aid = q.get("articleid") || ""; }
    };
    const inner = u.searchParams.get("iframe_url_utf8") || u.searchParams.get("iframe_url");
    if (inner) { try { fromPath(decodeURIComponent(inner)); } catch (e) { fromPath(inner); } }
    fromPath(u.pathname + u.search);
    const seg = u.pathname.split("/").filter(Boolean);
    if (seg[0] === "ca-fe" && seg[1] && !/^(web|cafes)$/.test(seg[1])) seg.shift();
    if (seg[0] && !/^(f-e|ca-fe|ArticleRead\.nhn|ArticleList\.nhn|MyCafeIntro\.nhn)$/i.test(seg[0])) {
      club = seg[0];
      if (!aid && /^\d+$/.test(seg[1] || "")) aid = seg[1];
    }
    if (mobile) {
      if (club && aid) return "https://m.cafe.naver.com/" + club + "/" + aid;
      if (cid && aid) return "https://m.cafe.naver.com/ca-fe/web/cafes/" + cid + "/articles/" + aid;
      if (club) return "https://m.cafe.naver.com/" + club;
    } else {
      if (club && aid) return "https://cafe.naver.com/" + club + "/" + aid;
      if (cid && aid) return "https://cafe.naver.com/ca-fe/cafes/" + cid + "/articles/" + aid;
      if (club) return "https://cafe.naver.com/" + club;
    }
    return href;
  }
  window.cafeLink = cafeLink;
  const fixCafe = (e) => {
    const a = e.target && e.target.closest && e.target.closest("a[href]");
    if (!a || !/cafe\.naver\.com/i.test(a.href)) return;
    const next = cafeLink(a.href, MOBILE);
    if (next !== a.href) a.href = next;
  };
  document.addEventListener("click", fixCafe, true);
  document.addEventListener("auxclick", fixCafe, true);
  document.addEventListener("contextmenu", fixCafe, true);

  const root = document.getElementById("root");
  root.innerHTML = '<div class="boot-wait" role="status"><span class="boot-spin"></span>불러오는 중…</div>';
  DB.remote.connect().then(start, (err) => {
    console.error(err);
    root.innerHTML = '<div class="boot-wait boot-err" role="alert"><b>서버에 연결하지 못했어요</b><span>잠시 후 다시 시도해 주세요.</span><button type="button" onclick="location.reload()">다시 시도</button></div>';
  });
})();
