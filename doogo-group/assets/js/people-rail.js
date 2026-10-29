/* =========================================================
   DOOGO GROUP — people-rail.js (두고 사람들 줄 · 21차 → 30차)
   메인 #leaders · leadership.html #leaders 공통: 프로필 카드를 한 줄로 넘겨 보는 줄
   · 30차: 브라우저 가로 스크롤(.prail-view overflow-x) 위에서 움직임 — 양 끝 너머로 밀리거나 빈자리가 생기지 않음
     처음에는 항상 첫 카드(문원오)부터 (주소에 카드 #id 가 있으면 leadership.js 가 그 카드를 보여 줌)
   · 마우스: 줄을 잡고 끌기 → 놓으면 관성으로 미끄러지다 가까운 카드 앞에서 부드럽게 멈춤
   · 손가락: 브라우저 기본 밀기 (+ 카드 앞에 붙는 scroll-snap · people-rail.css)
   · 트랙패드 가로 스크롤 · ← → 키(줄 안에 포커스가 있을 때 한 장씩) · 아래 가는 진행 막대
   · 같은 사람은 한 번씩만 (복제 없음)
   · root._prail = { go(k, instant), count } — k 번째 카드가 맨 앞(왼쪽 여백 선)에 오도록
   ========================================================= */
(function () {
  'use strict';
  var motionOff = function () { return !!(window.DOOGO && window.DOOGO.motionOff && window.DOOGO.motionOff()); };
  var raf = window.requestAnimationFrame || function (f) { return setTimeout(function () { f(Date.now()); }, 16); };
  var caf = window.cancelAnimationFrame || clearTimeout;
  var now = function () { return (window.performance && performance.now) ? performance.now() : Date.now(); };

  function init(root) {
    var view = root.querySelector('.prail-view'), track = root.querySelector('.prail-track');
    if (!view || !track) return;
    var items = Array.prototype.slice.call(track.querySelectorAll('.prail-item'));
    var n = items.length;
    if (!n) return;

    // 진행 막대 (줄 아래 · 보이는 범위만큼 채움)
    var bar = document.createElement('div');
    bar.className = 'container prail-bar';
    bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = '<span class="prail-bar-line"><i></i></span>';
    view.parentNode.insertBefore(bar, view.nextSibling);
    var fill = bar.querySelector('i');

    function maxScroll() { return Math.max(0, view.scrollWidth - view.clientWidth); }
    function pad() { return parseFloat(getComputedStyle(track).paddingLeft) || 0; }
    // k 번째 카드를 맨 앞(왼쪽 여백 선)에 두는 스크롤 위치
    function targetOf(k) {
      var it = items[Math.max(0, Math.min(n - 1, k))];
      return Math.max(0, Math.min(maxScroll(), view.scrollLeft + it.getBoundingClientRect().left - view.getBoundingClientRect().left - pad()));
    }
    function nearest() {
      var best = 0, bd = Infinity, x = view.scrollLeft;
      for (var i = 0; i < n; i++) { var d = Math.abs(targetOf(i) - x); if (d < bd) { bd = d; best = i; } }
      return best;
    }
    function paint() {
      var m = maxScroll();
      root.classList.toggle('is-static', m < 2);
      root.classList.toggle('is-start', view.scrollLeft <= 1);
      root.classList.toggle('is-end', view.scrollLeft >= m - 1);
      var vw = view.clientWidth, sw = view.scrollWidth || 1;
      fill.style.width = (Math.min(1, vw / sw) * 100).toFixed(2) + '%';
      fill.style.transform = 'translateX(' + (m ? (view.scrollLeft / m) * (sw - vw) / vw * 100 : 0).toFixed(2) + '%)';
    }
    view.addEventListener('scroll', function () { paint(); }, { passive: true });

    // 부드럽게 옮기기 (관성 뒤 카드 맞춤 · 키 · go)
    var anim = 0;
    function stop() { if (anim) { caf(anim); anim = 0; } root.classList.remove('is-gliding'); }
    function glideTo(x, ms) {
      stop();
      x = Math.max(0, Math.min(maxScroll(), x));
      var x0 = view.scrollLeft, dx = x - x0;
      if (Math.abs(dx) < 1 || motionOff()) { view.scrollLeft = x; return; }
      var t0 = now(), dur = ms || 520;
      root.classList.add('is-gliding'); // 움직이는 동안 snap 끔
      (function stepFn() {
        anim = raf(function () {
          var p = Math.min(1, (now() - t0) / dur), e = 1 - Math.pow(1 - p, 3);
          view.scrollLeft = x0 + dx * e;
          if (p < 1) stepFn(); else { anim = 0; root.classList.remove('is-gliding'); }
        });
      })();
    }

    // 마우스로 끌기 → 관성 → 가까운 카드 앞에서 멈춤 (손가락 · 펜은 브라우저 기본 스크롤)
    var drag = null, suppress = false;
    view.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0 || maxScroll() < 2) return;
      stop();
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, s0: view.scrollLeft, on: false, samples: [{ x: e.clientX, t: e.timeStamp }] };
    });
    view.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x0;
      if (!drag.on) {
        if (Math.abs(dx) < 5) return;
        if (Math.abs(e.clientY - drag.y0) > Math.abs(dx)) { drag = null; return; }
        drag.on = true;
        root.classList.add('is-drag');
        try { view.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      }
      e.preventDefault();
      view.scrollLeft = drag.s0 - dx;
      drag.samples.push({ x: e.clientX, t: e.timeStamp });
      if (drag.samples.length > 6) drag.samples.shift();
    });
    function endDrag(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      var d = drag; drag = null;
      if (!d.on) return;
      root.classList.remove('is-drag');
      suppress = true;
      setTimeout(function () { suppress = false; }, 0);
      // 마지막 약 100ms 의 속도(px/ms) → 관성 거리 → 가까운 카드 앞으로
      var a = d.samples[0], b = d.samples[d.samples.length - 1], v = 0;
      for (var i = d.samples.length - 1; i >= 0; i--) { if (b.t - d.samples[i].t > 100) { a = d.samples[i]; break; } a = d.samples[i]; }
      if (b.t > a.t) v = (b.x - a.x) / (b.t - a.t);
      v = Math.max(-4, Math.min(4, v));
      var land = view.scrollLeft - v * 260; // 관성으로 더 가는 거리
      var best = 0, bd = Infinity;
      for (var k = 0; k < n; k++) { var dd = Math.abs(targetOf(k) - land); if (dd < bd) { bd = dd; best = k; } }
      var to = targetOf(best);
      if (land >= maxScroll() - 4) to = maxScroll();
      glideTo(to, 560 + Math.min(320, Math.abs(v) * 120));
    }
    view.addEventListener('pointerup', endDrag);
    view.addEventListener('pointercancel', function (e) { if (drag && e.pointerId === drag.id) { drag = null; root.classList.remove('is-drag'); } });
    view.addEventListener('click', function (e) { if (suppress) { e.preventDefault(); e.stopPropagation(); suppress = false; } }, true);
    view.addEventListener('dragstart', function (e) { e.preventDefault(); });

    // ← → 키: 한 장씩
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      e.preventDefault();
      glideTo(targetOf(nearest() + (e.key === 'ArrowRight' ? 1 : -1)));
    });

    // 처음엔 항상 첫 카드부터 (브라우저가 이전 가로 위치를 되살리지 않게)
    view.scrollLeft = 0;
    window.addEventListener('pageshow', function (e) { if (e.persisted) { view.scrollLeft = 0; paint(); } });
    window.addEventListener('resize', paint);
    window.addEventListener('load', paint);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(paint);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { if (en[0].isIntersecting) { root.classList.add('is-seen'); paint(); } }, { threshold: 0 }).observe(root);
    } else root.classList.add('is-seen');

    root.classList.add('is-ready');
    paint();

    root._prail = {
      count: n,
      go: function (k, instant) {
        var x = targetOf(((k % n) + n) % n);
        if (instant) { stop(); view.scrollLeft = x; paint(); } else glideTo(x);
      }
    };
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-prail]'), init);
})();
