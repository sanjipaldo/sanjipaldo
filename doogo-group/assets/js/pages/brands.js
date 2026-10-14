/* =========================================================
   DOOGO GROUP — brands.js (브랜드와 성과)
   브랜드 3D 카드(포인터를 따라 떠오름) · 프로젝트 커버플로우 · 성장 사례 카드 쌓임 효과
   ========================================================= */
(function () {
  'use strict';
  /* 움직임 정책: OS의 '애니메이션 줄이기'와 관계없이 모션은 재생하고, 사용자가 '움직임 멈추기'를 고른 경우(html.motion-off)만 멈춥니다.
     OS 설정이 켜진 기기(html.soft-motion)에서는 포인터를 따라 기우는 효과만 생략합니다. */
  var root = document.documentElement;
  function motionOff() { return !!(window.DOOGO && window.DOOGO.motionOff && window.DOOGO.motionOff()); }
  var soft = root.classList.contains('soft-motion');
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- 브랜드 3D 카드: 포인터를 따라 오브젝트가 살짝 기울며 떠오름 ----------
     마우스(정밀 포인터)에서만 — 움직임 멈추기 상태이거나 OS 설정이 켜진 기기(soft-motion)에서는 동작하지 않습니다.
     CSS 변수 --mx/--my(-1~1)만 바꾸고 실제 움직임은 CSS transform 전환(.9s)으로 부드럽게 따라갑니다. */
  if (!soft && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    $$('.bn-card:not(.bn-card--chain)').forEach(function (card) {
      var media = $('.bn-card-media', card);
      if (!media) return;
      var raf = 0, nx = 0, ny = 0;
      function apply() { raf = 0; card.style.setProperty('--mx', nx.toFixed(3)); card.style.setProperty('--my', ny.toFixed(3)); }
      card.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse' || motionOff()) return;
        var r = media.getBoundingClientRect();
        nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
        ny = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
        if (!raf) raf = requestAnimationFrame(apply);
      });
      card.addEventListener('pointerleave', function () {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        card.style.removeProperty('--mx'); card.style.removeProperty('--my');
      });
    });
  }

  /* ---------- 프로젝트: 큰 이미지 커버플로우 (메인 그룹소식 커버플로우와 같은 동작) ----------
     모든 슬라이드는 한 칸에 겹쳐 있고, 현재 카드 기준 거리 d(… -1, 0, 1 …, 범위 [-n/2, n/2))로 배치 · 무한 반복.
     가운데 카드는 정면 · 크게, 양옆은 rotateY 로 살짝 돌아 뒤로 물러남. transform · opacity 만 바꿉니다.
     이전/다음 · 점 · 스와이프/드래그(가로 8px 이상, 세로가 크면 페이지 스크롤에 양보) · ←→ 키 · 옆 카드를 누르면 가운데로.
     자동 넘김 없음. 움직임 멈추기(html.motion-off)에서도 그대로 동작하고 전환만 즉시(base.css). */
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function coverflow() {
    var root = $('[data-pf]');
    if (!root) return;
    var viewport = $('[data-pf-viewport]', root);
    var slides = $$('.bn-pf-slide', root);
    var n = slides.length;
    if (!viewport || n < 2) return;
    var dots = $$('[data-pf-dots] button', root);
    var curEl = $('[data-pf-cur]', root), statusEl = $('[data-pf-status]', root);
    var dims = slides.map(function (s) { return $('.bn-pf-dim', s); });
    var links = slides.map(function (s) { return $('a[href]', s); });
    var titles = slides.map(function (s) { return (s.getAttribute('aria-label') || '').split(' · ').slice(1).join(' · '); });
    var cur = 0, m = null, prevD = [], drag = null, frame = 0, justDragged = false;
    var mobMQ = window.matchMedia('(max-width: 640px)');

    function wrapD(v) { var h = n / 2; return ((v + h) % n + n) % n - h; }
    function measure() {
      var w = slides[0].offsetWidth || 600;
      // 데스크톱: 옆 카드는 가운데 카드 뒤로 대부분 숨고 바깥쪽 가장자리만 보임 · 모바일: 양옆 가장자리 약간
      m = mobMQ.matches
        ? { x1: w * 0.66, x2: w * 0.4, rot: 30, z: 140, ss: 0.92, edge: 1.6, dk: 0.3, unit: w * 0.7 }
        : { x1: w * 0.8, x2: w * 0.36, rot: 26, z: 200, ss: 0.9, edge: 1.7, dk: 0.2, unit: w * 0.75 };
    }
    function layout(d) {
      var a = Math.abs(d), sg = d < 0 ? -1 : 1;
      var x = a <= 1 ? d * m.x1 : sg * (m.x1 + (a - 1) * m.x2);
      return {
        x: x, z: -Math.min(a, 2) * m.z, ry: -sg * Math.min(a, 1) * m.rot, s: 1 - Math.min(a, 1) * (1 - m.ss),
        op: clamp((m.edge - a) / 0.5, 0, 1), dim: Math.min(a, 1) * m.dk + clamp(a - 1, 0, 1) * 0.14
      };
    }
    function place(f) {
      if (!m) measure();
      for (var i = 0; i < n; i++) {
        var d = wrapD(i - cur + (f || 0));
        var L = layout(d);
        var s = slides[i];
        // 반대편 끝으로 넘어가는 카드(이음매)는 전환 없이 옮긴 뒤 투명도만 서서히
        var jump = prevD[i] != null && Math.abs(d - prevD[i]) > n / 2 - 0.01;
        if (jump) { s.classList.add('no-tr'); s.style.opacity = '0'; }
        s.style.transform = 'translate3d(' + L.x.toFixed(2) + 'px,0,' + L.z.toFixed(1) + 'px)' +
          (L.ry ? ' rotateY(' + L.ry.toFixed(2) + 'deg)' : '') + ' scale(' + L.s.toFixed(4) + ')';
        s.style.zIndex = String(100 - Math.round(Math.abs(d) * 10));
        if (dims[i]) dims[i].style.opacity = L.dim.toFixed(3);
        if (jump) { void s.offsetWidth; s.classList.remove('no-tr'); }
        s.style.opacity = L.op.toFixed(3);
        prevD[i] = d;
      }
    }
    function mark(user) {
      slides.forEach(function (s, i) { s.classList.toggle('is-current', i === cur); });
      dots.forEach(function (b, j) { if (j === cur) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
      if (curEl) curEl.textContent = (cur < 9 ? '0' : '') + (cur + 1);
      if (statusEl && user) statusEl.textContent = (cur + 1) + ' / ' + n + (titles[cur] ? ' · ' + titles[cur] : '');
    }
    function go(i, user) {
      cur = ((i % n) + n) % n;
      place(0);
      mark(user);
    }

    function release() { drag = null; }
    viewport.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, on: false, lx: e.clientX, lt: e.timeStamp, v: 0 };
    });
    viewport.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (!drag.on) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) >= Math.abs(dx)) { release(); return; }
        drag.on = true;
        root.classList.add('is-dragging');
        try { viewport.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      }
      var dt = e.timeStamp - drag.lt;
      if (dt > 0) drag.v = 0.7 * ((e.clientX - drag.lx) / dt) + 0.3 * drag.v;
      drag.lx = e.clientX; drag.lt = e.timeStamp; drag.dx = dx;
      if (!frame) frame = requestAnimationFrame(function () { frame = 0; if (drag && drag.on) place(drag.dx / m.unit); });
    });
    function end(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var d = drag;
      release();
      if (!d.on) return;
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      root.classList.remove('is-dragging');
      justDragged = true;
      setTimeout(function () { justDragged = false; }, 80);
      var f = d.dx / m.unit;
      var k = Math.round(f);
      if (k === 0 && (Math.abs(f) > 0.16 || Math.abs(d.v) > 0.35)) k = (Math.abs(d.v) > 0.35 ? d.v : f) > 0 ? 1 : -1;
      go(cur - k, true);
    }
    viewport.addEventListener('pointerup', end);
    viewport.addEventListener('pointercancel', end);
    viewport.addEventListener('dragstart', function (e) { e.preventDefault(); });

    // 끌고 난 뒤의 클릭은 무시 · 옆 카드를 누르면 사이트 대신 가운데로
    root.addEventListener('click', function (e) {
      var s = e.target.closest && e.target.closest('.bn-pf-slide');
      if (justDragged && s) { e.preventDefault(); e.stopPropagation(); return; }
      if (!s) return;
      var i = slides.indexOf(s);
      if (i !== cur) { e.preventDefault(); e.stopPropagation(); go(i, true); }
    }, true);
    // 키보드: Tab 으로 옆 카드에 오면 가운데로 · 좌우 화살표로 넘김(카드에 포커스가 있으면 따라감)
    root.addEventListener('focusin', function (e) {
      var s = e.target.closest && e.target.closest('.bn-pf-slide');
      if (!s) return;
      var kbd = true;
      try { kbd = e.target.matches(':focus-visible'); } catch (err) { /* 무시 */ }
      var i = slides.indexOf(s);
      if (kbd && i !== cur) go(i, true);
    });
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      var onSlide = document.activeElement && document.activeElement.closest && document.activeElement.closest('.bn-pf-slide');
      go(cur + (e.key === 'ArrowRight' ? 1 : -1), true);
      if (onSlide && links[cur]) links[cur].focus({ preventScroll: true });
    });
    $('[data-pf-prev]', root).addEventListener('click', function () { go(cur - 1, true); });
    $('[data-pf-next]', root).addEventListener('click', function () { go(cur + 1, true); });
    dots.forEach(function (b, j) { b.addEventListener('click', function () { go(j, true); }); });

    function instant() { slides.forEach(function (s) { s.classList.add('no-tr'); }); measure(); place(0); void root.offsetWidth; slides.forEach(function (s) { s.classList.remove('no-tr'); }); }
    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(instant, 120); });

    // 시작: 전환 없이 제자리에
    root.classList.add('is-ready');
    instant();
    mark(false);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); place(0); });
  }
  coverflow();

  /* ---------- 성장 사례: 쌓이는 카드 (데스크톱) ---------- */
  var cases = $$('.bn-case');
  var stackMq = window.matchMedia('(min-width: 1025px) and (min-height: 760px)');
  var ticking = false;
  function updateStack() {
    ticking = false;
    if (motionOff() || !stackMq.matches) {
      cases.forEach(function (c) { c.style.removeProperty('--sc'); c.style.removeProperty('--dim'); });
      return;
    }
    cases.forEach(function (c, i) {
      var next = cases[i + 1];
      if (!next) return;
      var cr = c.getBoundingClientRect(), nr = next.getBoundingClientRect();
      var h = c.offsetHeight || 1;
      var p = Math.min(Math.max(1 - (nr.top - cr.top) / h, 0), 1);
      c.style.setProperty('--sc', (1 - p * 0.05).toFixed(4));
      c.style.setProperty('--dim', (p * 0.45).toFixed(3));
    });
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(updateStack); } }
  if (cases.length > 1) {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    document.addEventListener('doogo:motion', onScroll); // 움직임 멈추기/켜기 전환 시 바로 반영
    updateStack();
  }

})();
