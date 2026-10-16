/* =========================================================
   DOOGO GROUP — people-rail.js (두고 사람들 '타이탄' 줄 · 21차)
   메인 #leaders · leadership.html #leaders 공통: 프로필 카드가 화면 왼쪽 끝에서 오른쪽 끝까지 이어지는 무한 루프 줄
   · [data-prail] 안 .prail-track 의 카드(.prail-item)를 앞뒤로 한 벌씩 복제해 끊김 없이 돎 (가운데 한 벌이 원본)
   · 첫 카드는 다른 섹션 제목과 같은 왼쪽 선(.container 안쪽)에서 시작 — 그 왼쪽도 앞 카드로 채워져 여백 없음
   · 양옆 화살표(data-prail-prev / next) · 마우스 끌기 · 손가락 밀기 · ← → 키(줄 안에 포커스가 있을 때)
   · 자동 넘김 3.6초 — 마우스를 올리거나 포커스 · 끄는 중 · 화면 밖 · 탭이 가려졌을 때는 멈춤, '움직임 멈추기'면 자동 넘김 없음
   · 복제 카드: aria-hidden · 안의 링크/버튼은 탭으로 가지 않음(tabindex -1) · id 와 data-leader 를 지우고 data-prail-src="원본 번호"
     (눌러도 원본과 같은 곳으로 · leadership.js 는 data-prail-src 로 상세를 엶)
   · root._prail = { go(k, instant), count } — 원본 k 번째 카드를 맨 앞(첫 줄 자리)으로
   ========================================================= */
(function () {
  'use strict';
  var motionOff = function () { return !!(window.DOOGO && window.DOOGO.motionOff && window.DOOGO.motionOff()); };
  var AUTO_MS = 3600;

  function clone(src, k) {
    var c = src.cloneNode(true);
    c.classList.add('is-clone');
    c.setAttribute('aria-hidden', 'true');
    c.setAttribute('data-prail-src', String(k));
    c.removeAttribute('id');
    c.removeAttribute('data-leader');
    c.removeAttribute('aria-labelledby');
    Array.prototype.forEach.call(c.querySelectorAll('[id]'), function (el) { el.removeAttribute('id'); });
    Array.prototype.forEach.call(c.querySelectorAll('[aria-labelledby]'), function (el) { el.removeAttribute('aria-labelledby'); });
    Array.prototype.forEach.call(c.querySelectorAll('a, button'), function (el) { el.tabIndex = -1; });
    return c;
  }

  function init(root) {
    var view = root.querySelector('.prail-view'), track = root.querySelector('.prail-track');
    if (!view || !track) return;
    var orig = Array.prototype.slice.call(track.children);
    var n = orig.length;
    if (n < 2) return;

    var pre = document.createDocumentFragment(), post = document.createDocumentFragment();
    orig.forEach(function (o, k) { pre.appendChild(clone(o, k)); post.appendChild(clone(o, k)); });
    track.insertBefore(pre, track.firstChild);
    track.appendChild(post);
    var items = Array.prototype.slice.call(track.children);

    // 첫 카드 자리: .container 안쪽 왼쪽 선
    var anchor = document.createElement('div');
    anchor.className = 'container prail-anchor';
    anchor.setAttribute('aria-hidden', 'true');
    anchor.innerHTML = '<span></span>';
    root.insertBefore(anchor, root.firstChild);

    var idx = n, step = 0, start = 0, x = 0;
    var prevBtn = root.querySelector('[data-prail-prev]'), nextBtn = root.querySelector('[data-prail-next]');

    function measure() {
      var a = items[0].getBoundingClientRect(), b = items[1].getBoundingClientRect();
      step = b.left - a.left || a.width;
      start = anchor.firstChild.getBoundingClientRect().left - view.getBoundingClientRect().left;
    }
    function pos(i) { return start - i * step; }
    function setX(px, anim) {
      x = px;
      track.classList.toggle('no-tr', !anim);
      track.style.transform = 'translate3d(' + px.toFixed(2) + 'px,0,0)';
      if (!anim) void track.offsetWidth;
    }
    function render(anim) { setX(pos(idx), anim && !motionOff()); }
    // 가운데 한 벌 밖으로 나가면 같은 모양의 원본 자리로 몰래 옮김
    function normalize() {
      if (idx < n) { idx += n; render(false); }
      else if (idx >= 2 * n) { idx -= n; render(false); }
    }
    function go(d) {
      normalize();
      idx += d;
      render(true);
    }
    function currentX() {
      var m = getComputedStyle(track).transform;
      if (!m || m === 'none') return x;
      var v = m.match(/matrix(3d)?\(([^)]+)\)/);
      if (!v) return x;
      var p = v[2].split(',').map(parseFloat);
      return v[1] ? p[12] : p[4];
    }
    track.addEventListener('transitionend', function (e) {
      if (e.target === track && e.propertyName === 'transform') normalize();
    });

    // 화살표
    if (prevBtn) prevBtn.addEventListener('click', function () { go(-1); hold(); });
    if (nextBtn) nextBtn.addEventListener('click', function () { go(1); hold(); });
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      e.preventDefault();
      go(e.key === 'ArrowRight' ? 1 : -1); hold();
    });
    // 키보드로 원본 카드에 들어오면 그 카드를 맨 앞으로
    track.addEventListener('focusin', function (e) {
      var it = e.target.closest('.prail-item');
      if (!it || it.classList.contains('is-clone')) return;
      var k = orig.indexOf(it);
      if (k < 0) return;
      view.scrollLeft = 0; // 브라우저가 포커스 따라 옆으로 밀어 둔 것을 되돌림
      normalize();
      if (idx !== n + k) { idx = n + k; render(true); }
    });

    // 끌기 · 밀기 (세로 스크롤은 브라우저에 맡김: touch-action: pan-y)
    var drag = null, suppress = false;
    view.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      measure();
      var cx = currentX();
      setX(cx, false);
      idx = Math.round((start - cx) / step);
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, base: cx, on: false, lx: e.clientX, lt: e.timeStamp, v: 0 };
    });
    view.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (!drag.on) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
        drag.on = true;
        root.classList.add('is-drag');
        try { view.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      }
      var px = drag.base + dx;
      var f = (start - px) / step;
      if (f < n / 2) { drag.base -= n * step; px -= n * step; }
      else if (f > 2 * n + n / 2) { drag.base += n * step; px += n * step; }
      var dt = e.timeStamp - drag.lt;
      if (dt > 0) drag.v = (e.clientX - drag.lx) / dt;
      drag.lx = e.clientX; drag.lt = e.timeStamp;
      setX(px, false);
    });
    function endDrag(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      var was = drag.on, v = drag.v;
      drag = null;
      root.classList.remove('is-drag');
      if (!was) return;
      suppress = true;
      setTimeout(function () { suppress = false; }, 0);
      var f = (start - x) / step - Math.max(-1, Math.min(1, v * 0.9));
      idx = Math.round(f);
      render(true);
      hold();
    }
    view.addEventListener('pointerup', endDrag);
    view.addEventListener('pointercancel', function (e) { if (drag && e.pointerId === drag.id) { var on = drag.on; drag = null; root.classList.remove('is-drag'); if (on) render(true); } });
    view.addEventListener('click', function (e) { if (suppress) { e.preventDefault(); e.stopPropagation(); suppress = false; } }, true);
    view.addEventListener('dragstart', function (e) { e.preventDefault(); });

    // 자동 넘김
    var timer = 0, inView = false, hover = false, focusIn = false, holdUntil = 0;
    function hold() { holdUntil = Date.now() + 6000; }
    function canRun() { return inView && !hover && !focusIn && !drag && !motionOff() && document.visibilityState !== 'hidden'; }
    function tick() {
      timer = setTimeout(tick, AUTO_MS);
      if (!canRun() || Date.now() < holdUntil) return;
      go(1);
    }
    root.addEventListener('mouseenter', function () { hover = true; });
    root.addEventListener('mouseleave', function () { hover = false; hold(); });
    root.addEventListener('focusin', function () { focusIn = true; });
    root.addEventListener('focusout', function (e) { if (!root.contains(e.relatedTarget)) focusIn = false; });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        inView = en[0].isIntersecting;
        if (inView) root.classList.add('is-seen');
      }, { threshold: 0.25 }).observe(root);
    } else { inView = true; root.classList.add('is-seen'); }

    function refit() { measure(); render(false); }
    window.addEventListener('resize', refit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
    window.addEventListener('load', refit);
    document.addEventListener('doogo:motion', function () { render(false); });

    root.classList.add('is-ready');
    refit();
    hold();
    timer = setTimeout(tick, AUTO_MS);

    root._prail = {
      count: n,
      go: function (k, instant) {
        if (!step) measure();
        idx = n + ((k % n) + n) % n;
        render(!instant);
        hold();
      }
    };
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-prail]'), init);
})();
