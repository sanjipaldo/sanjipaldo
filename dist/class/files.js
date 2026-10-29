/* 파일 내려받기 · PDF 만들기 (영수증 · 정산 명세서 · 수료증 · 노트 · 수업 자료 · CSV)
 * - PDF: 화면의 문서를 그대로 그려(html2canvas) A4 PDF(jsPDF)로 만들어요. 한글 글꼴이 깨지지 않아요.
 * - 저장: 보통 브라우저는 바로 내려받기. claude.ai 미리보기 안에서는 브라우저가 내려받기를 막아서,
 *   미리보기가 주는 ‘파일 저장’ 창(downloads)을 거쳐 저장해요. */
(function () {
  "use strict";
  const framed = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  let dlP = null;
  const dlCap = () => {
    if (!framed || !window.claude || typeof window.claude.use !== "function") return Promise.resolve(null);
    return dlP || (dlP = Promise.resolve(window.claude.use("downloads")).catch(() => null));
  };
  const origClick = HTMLAnchorElement.prototype.click;
  function anchor(blob, name) {
    const u = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = u; a.download = name; a.__dg = 1; a.style.display = "none";
    document.body.appendChild(a); origClick.call(a); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 10000);
  }
  /** 파일 저장. 돌려주는 값: "saved" | "declined" | "busy" */
  async function save(name, data) {
    const blob = data instanceof Blob ? data : new Blob([data]);
    const d = await dlCap();
    if (d) {
      try { await d.save({ filename: name, data: blob }); return "saved"; }
      catch (e) {
        const c = e && e.code;
        if (c === "declined") return "declined";
        if (c === "rate_limited") return "busy";
        // 허용 목록 밖 확장자 등은 브라우저 내려받기로 한 번 더
      }
    }
    anchor(blob, name); return "saved";
  }
  async function saveUrl(url, name) {
    const r = await fetch(url);
    if (!r.ok) throw new Error("fetch " + r.status);
    return save(name, await r.blob());
  }
  // 이미 있는 내려받기 링크(a[download])도 미리보기 안에서는 같은 길로
  function viaCap(a) {
    const name = a.getAttribute("download") || decodeURIComponent(String(a.href).split("/").pop().split("?")[0]) || "download";
    saveUrl(a.href, name).catch(() => { a.__dg = 1; origClick.call(a); });
  }
  if (framed) {
    HTMLAnchorElement.prototype.click = function () {
      if (!this.__dg && this.hasAttribute("download") && window.claude) { viaCap(this); return; }
      return origClick.call(this);
    };
    document.addEventListener("click", (e) => {
      if (!window.claude || e.defaultPrevented) return;
      const a = e.target.closest && e.target.closest("a[download]");
      if (!a || a.__dg) return;
      e.preventDefault(); viaCap(a);
    }, true);
  }

  /* ---------- PDF ---------- */
  const loadJs = (src) => new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("load " + src)); document.head.appendChild(s); });
  let libP = null;
  const libs = () => libP || (libP = Promise.all([
    window.html2canvas ? 0 : loadJs("assets/lib/html2canvas.min.js"),
    window.jspdf ? 0 : loadJs("assets/lib/jspdf.umd.min.js")
  ]).catch((e) => { libP = null; throw e; }));
  /**
   * el 을 A4 PDF로 저장. opt: { width(px, 이 폭으로 다시 배치해 그림), landscape, margin(mm), title, scale }
   * 길면 여러 장으로 나눠요.
   */
  async function pdf(el, name, opt) {
    opt = opt || {};
    if (!el) throw new Error("no element");
    await libs();
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* 글꼴 대기 실패는 무시 */ } }
    const W = opt.width || 0;
    const canvas = await window.html2canvas(el, {
      scale: opt.scale || 2, backgroundColor: "#ffffff", useCORS: true, logging: false,
      windowWidth: Math.max(window.innerWidth, W ? W + 80 : 0),
      onclone: (doc, c) => {
        c.classList.add("dg-pdf-on");
        if (W) { c.style.setProperty("width", W + "px", "important"); c.style.setProperty("max-width", "none", "important"); }
        c.querySelectorAll("[data-pdf-hide]").forEach((x) => { x.style.display = "none"; });
      }
    });
    const land = opt.landscape != null ? !!opt.landscape : canvas.width > canvas.height * 1.15;
    const J = window.jspdf.jsPDF, doc = new J({ orientation: land ? "landscape" : "portrait", unit: "mm", format: "a4", compress: true });
    const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight(), m = opt.margin != null ? opt.margin : 10;
    const iw = pw - m * 2, ih = ph - m * 2, k = iw / canvas.width, pagePx = Math.floor(ih / k);
    if (canvas.height <= pagePx * 1.04 || land) {
      const h = canvas.height * k, fit = Math.min(1, ih / h), w2 = iw * fit, h2 = h * fit;
      doc.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", (pw - w2) / 2, m, w2, h2);
    } else {
      for (let y = 0, i = 0; y < canvas.height; y += pagePx, i++) {
        const c = document.createElement("canvas"); c.width = canvas.width; c.height = Math.min(pagePx, canvas.height - y);
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(canvas, 0, y, canvas.width, c.height, 0, 0, canvas.width, c.height);
        if (i) doc.addPage();
        doc.addImage(c.toDataURL("image/jpeg", 0.94), "JPEG", m, m, iw, c.height * k);
      }
    }
    doc.setProperties({ title: opt.title || name.replace(/\.pdf$/i, ""), creator: "DOOGO CLASS" });
    return save(name, doc.output("blob"));
  }
  /** 버튼을 ‘만드는 중’으로 바꿔 두고 PDF 저장 → 결과를 알려 주는 공통 처리 */
  async function pdfBtn(btn, el, name, opt, toast) {
    const say = toast || ((t) => { try { window.alert(t); } catch (e) { /* 알림을 못 띄워도 괜찮아요 */ } });
    if (btn && btn.dataset.busy) return;
    const old = btn ? btn.innerHTML : "";
    if (btn) { btn.dataset.busy = "1"; btn.disabled = true; btn.textContent = "PDF 만드는 중…"; }
    try {
      const r = await pdf(el, name, opt);
      if (r === "saved") say("PDF를 저장했어요. 내려받기 폴더를 확인해 주세요.");
      else if (r === "busy") say("저장 창이 이미 열려 있어요. 잠시 후 다시 눌러 주세요.");
    } catch (e) {
      say("PDF를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      if (btn) { btn.innerHTML = old; btn.disabled = false; delete btn.dataset.busy; }
    }
  }
  /* ---------- 바깥 영상(비메오 · 유튜브)이 보안 정책(CSP)에 막히면 ----------
   * claude.ai 미리보기는 보안 정책으로 바깥 영상 플레이어(iframe)를 막아요 (링크가 잘못된 게 아니에요).
   * 막힌 자리에 브라우저 오류 화면 대신 ‘새 창에서 보기’ 안내를 그려요. 정식 사이트(doogoclass.com)는 막지 않아서 이 안내가 나오지 않고 바로 재생돼요. */
  const blocked = {};
  const originOf = (u) => { try { return new URL(u, location.href).origin; } catch (e) { return ""; } };
  const watchUrl = (src) => {
    let m = String(src).match(/player\.vimeo\.com\/video\/(\d+)(?:\?[^#]*?\bh=([0-9a-f]+))?/i); if (m) return "https://vimeo.com/" + m[1] + (m[2] ? "/" + m[2] : "");
    m = String(src).match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{6,})/i); if (m) return "https://www.youtube.com/watch?v=" + m[1];
    return String(src);
  };
  const escA = (t) => String(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  function swapFrame(f) {
    if (!f.parentNode || f.__dgx) return; f.__dgx = 1;
    const u = watchUrl(f.getAttribute("src") || ""), vm = /vimeo/.test(u), box = document.createElement("div");
    box.className = "dg-xb"; box.setAttribute("role", "note");
    box.innerHTML = '<div class="dg-xb-in"><span class="dg-xb-ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></span>' +
      "<b>이 미리보기 화면에서는 " + (vm ? "비메오" : "유튜브") + " 영상이 재생되지 않아요</b>" +
      "<p>claude.ai 미리보기가 보안 정책으로 바깥 영상 플레이어를 막고 있어요. 영상 링크는 정상이에요.<br>실제 사이트(doogoclass.com)에서는 이 자리에서 바로 재생돼요.</p>" +
      '<a class="dg-xb-go" href="' + escA(u) + '" target="_blank" rel="noopener">새 창에서 영상 보기 ↗</a></div>';
    f.parentNode.replaceChild(box, f);
  }
  function sweep() { Array.prototype.forEach.call(document.querySelectorAll("iframe[src]"), (f) => { if (blocked[originOf(f.src)]) swapFrame(f); }); }
  document.addEventListener("securitypolicyviolation", (e) => {
    if (!/^(frame|child|default)-src/.test(e.effectiveDirective || e.violatedDirective || "")) return;
    const o = originOf(e.blockedURI || ""); if (!o || !/vimeo|youtube/.test(o)) return;
    blocked[o] = 1; sweep();
  });
  if ("MutationObserver" in window) new MutationObserver(() => { for (const k in blocked) { sweep(); return; } }).observe(document.documentElement, { childList: true, subtree: true });

  window.DGFILE = { save, saveUrl, pdf, pdfBtn, framed };
})();
