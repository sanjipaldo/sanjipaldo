(function () {
  var BASE = "https://preview.doogofood.invalid";
  window.__SKYBASE_APP_CONFIG__ = { apiBaseUrl: BASE };
  var DATA = JSON.parse(document.getElementById("preview-data").textContent);
  var TOKEN = DATA.signin.token;
  var realFetch = window.fetch.bind(window);
  function fixAssets(text) {
    return text.replace(/\/assets\/(brand|products)\/[a-zA-Z0-9_.-]+\.(png|webp)/g, function (m) { return DATA.assets[m] || m; });
  }
  function json(body, status, headers) {
    return new Response(fixAssets(typeof body === "string" ? body : JSON.stringify(body)), {
      status: status || 200,
      headers: Object.assign({ "content-type": "application/json" }, headers || {})
    });
  }
  function authed(init, req) {
    var h = new Headers((init && init.headers) || (req && req.headers) || {});
    return (h.get("authorization") || "") === "Bearer " + TOKEN;
  }
  new MutationObserver(function (list) {
    list.forEach(function (m) {
      var nodes = m.type === "attributes" ? [m.target] : Array.prototype.slice.call(m.addedNodes);
      nodes.forEach(function (n) {
        if (n.nodeType !== 1) return;
        var imgs = n.tagName === "IMG" ? [n] : n.querySelectorAll ? n.querySelectorAll("img") : [];
        Array.prototype.forEach.call(imgs, function (img) {
          var src = img.getAttribute("src") || "";
          if (src.indexOf("/assets/products/") === 0 && DATA.assets[src]) img.setAttribute("src", DATA.assets[src]);
        });
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
  window.fetch = function (input, init) {
    var req = input instanceof Request ? input : null;
    var url = req ? req.url : String(input);
    if (url.indexOf(BASE + "/api/") !== 0) return realFetch(input, init);
    var u = new URL(url);
    var method = ((init && init.method) || (req && req.method) || "GET").toUpperCase();
    var p = u.pathname;
    if (p === "/api/auth/sign-in/username" && method === "POST") {
      return Promise.resolve(json(DATA.signin, 200, { "set-auth-token": TOKEN }));
    }
    if (p === "/api/auth/sign-out") return Promise.resolve(json({ success: true }));
    if (p === "/api/auth/get-session") {
      return Promise.resolve(authed(init, req) ? json(DATA.rec["/api/auth/get-session"].body) : json("null"));
    }
    if (method === "GET") {
      if (p.indexOf("/api/catalog/admin") === 0 || p === "/api/me/profile") {
        if (!authed(init, req)) return Promise.resolve(json({ ok: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, 401));
      }
      var hit = DATA.rec[p + u.search] || DATA.rec[p];
      if (!hit) {
        var keys = Object.keys(DATA.rec);
        for (var i = 0; i < keys.length; i++) if (keys[i].split("?")[0] === p) { hit = DATA.rec[keys[i]]; break; }
      }
      if (hit) return Promise.resolve(json(hit.body, hit.status));
      return Promise.resolve(json({ ok: false, error: { code: "PREVIEW_NO_DATA", message: "미리보기에 포함되지 않은 데이터입니다." } }, 404));
    }
    return Promise.resolve(json({ ok: false, error: { code: "PREVIEW_READ_ONLY", message: "미리보기 화면에서는 저장·변경되지 않습니다." } }, 403));
  };
})();
