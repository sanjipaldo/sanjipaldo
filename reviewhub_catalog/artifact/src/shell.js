// 페이지 셸: 클라이언트의 /api 요청을 페이지 안 서버(__doogoBackend)로 보내고,
// 기본 상품 이미지(화면의 img만 교체, 데이터는 그대로)와 엑셀 다운로드를 claude.ai 페이지 환경에 맞게 연결합니다.
(function () {
  var BASE = "https://doogofood.artifact.invalid";
  window.__SKYBASE_APP_CONFIG__ = { apiBaseUrl: BASE };
  var ASSETS = JSON.parse(document.getElementById("doogo-assets").textContent);

  function backend() {
    return new Promise(function (resolve) {
      (function wait() { if (window.__doogoBackend) resolve(window.__doogoBackend); else setTimeout(wait, 15); })();
    });
  }

  var realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = input instanceof Request ? input.url : String(input);
    if (url.indexOf(BASE + "/api/") !== 0) return realFetch(input, init);
    var request = input instanceof Request ? input : new Request(url, init);
    return backend().then(function (b) { return b.handle(request); }).then(null, function (error) {
      var message = error && error.message ? error.message : "데이터를 불러오지 못했습니다.";
      return new Response(JSON.stringify({ ok: false, error: { code: "BOOT_FAILED", message: message } }), { status: 503, headers: { "content-type": "application/json" } });
    });
  };

  new MutationObserver(function (list) {
    list.forEach(function (m) {
      var nodes = m.type === "attributes" ? [m.target] : Array.prototype.slice.call(m.addedNodes);
      nodes.forEach(function (n) {
        if (n.nodeType !== 1) return;
        var imgs = n.tagName === "IMG" ? [n] : n.querySelectorAll ? n.querySelectorAll("img") : [];
        Array.prototype.forEach.call(imgs, function (img) {
          var src = img.getAttribute("src") || "";
          if (ASSETS[src]) img.setAttribute("src", ASSETS[src]);
        });
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });

  // 엑셀 다운로드: 페이지가 직접 내려받기를 할 수 없으므로 downloads 권한으로 저장 확인창을 띄웁니다.
  var blobs = new Map();
  var createObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (obj) { var u = createObjectURL(obj); if (obj instanceof Blob) blobs.set(u, obj); return u; };
  var anchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    var blob = this.download && blobs.get(this.href);
    if (!blob || !window.claude || !window.claude.use) return anchorClick.call(this);
    var filename = this.download;
    window.claude.use("downloads").then(function (downloads) {
      if (!downloads) throw { message: "이 화면에서는 파일을 내려받을 수 없습니다." };
      return downloads.save({ filename: filename, data: blob });
    }).catch(function (error) {
      if (error && error.code === "declined") return;
      var el = document.getElementById("doogo-save-status") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "doogo-save-status" }));
      el.textContent = "다운로드 실패: " + (error && error.message ? error.message : "다시 시도해 주세요");
      el.dataset.tone = "error";
      el.hidden = false;
    });
  };
})();
