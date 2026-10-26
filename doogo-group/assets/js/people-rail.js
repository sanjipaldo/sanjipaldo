/* =========================================================
   DOOGO GROUP — people-rail.js (두고 사람들 줄 · 21차 → 27차)
   메인 #leaders · leadership.html #leaders 공통: 프로필 카드를 한 줄로 넘겨 보는 줄
   · 27차: 무한 루프(앞뒤 복제) 대신 끝이 있는 줄 — 같은 사람이 양쪽에 두 번 보이지 않음
   · 첫 카드는 다른 섹션 제목과 같은 왼쪽 선(.container 안쪽)에서 시작 · 마지막 카드는 오른쪽 같은 선에서 멈춤
     (카드가 다 들어가는 넓은 화면이면 움직이지 않고 화살표도 숨김 · .is-static)
   · 양옆 화살표(data-prail-prev / next — 끝에 닿으면 흐려지고 aria-disabled) · 마우스 끌기 · 손가락 밀기 · ← → 키
   · 자동 넘김 3.6초 — 마지막 카드에 닿으면 처음으로 돌아감 · 마우스를 올리거나 포커스 · 끄는 중 · 화면 밖 ·
     탭이 가려졌을 때는 멈춤, '움직임 멈추기'면 자동 넘김 없음
   · root._prail = { go(k, instant), count } — k 번째 카드가 보이도록 (첫 줄 자리로, 끝에서는 멈춤)
   ========================================================= */
(function () {
  'use strict';
  var motionOff = function () { return !!(window.DOOGO && window.DOOGO.motionOff && window.DOOGO.motionOff()); };
  var AUTO_MS = 3600;

  function init(root) {
    var view = root.querySelector('.prail-view'), track = root.querySelector('.prail-track');
    if (!view || !track) return;
    var items = Array.prototype.slice.call(track.children);
    var n = items.length;
    if (n < 2) return;

    // 첫 카드 자리: .container 안쪽 왼쪽 선
    var anchor = document.createElement('div');
    anchor.className = 'container prail-anchor';
    anchor.setAttribute('aria-hidden', 'true');
    anchor.innerHTML = '<span></span>';
    root.insertBefore(anchor, root.firstChild);

    var idx = 0, step = 0, start = 0, minX = 0, maxI = 0, x = 0;
    var prevBtn = root.querySelector('[data-prail-prev]'), nextBtn = root.querySelector('[data-prail-next]');

    function measure() {
      var a = items[0].getBoundingClientRect(), b = items[1].getBoundingClientRect();
      step = b.left - a.left || a.width;
      var vr = view.getBoundingClientRect();
      start = anchor.firstChild.getBoundingClientRect().left - vr.left;
      // 마지막 카드의 오른쪽 끝이 오른쪽 같은 선(view 폭 - start)에 닿는 자리
      var last = items[n - 1].getBoundingClientRect(), first = items[0].getBoundingClientRect();
      var w = last.right - first.left;
      minX = Math.min(start, vr.width - start - w);
      maxI = Math.max(0, Math.ceil((start - minX) / step - 0.01));
      root.classList.toggle('is-static', maxI === 0);
      if (idx > maxI) idx = maxI;
    }
    function pos(i) { return Math.max(minX, start - i * step); }
    function setX(px, anim) {
      x = px;
      track.classList.toggle('no-tr', !anim);
      track.style.transform = 'translate3d(' + px.toFixed(2) + 'px,0,0)';
      if (!anim) void track.offsetWidth;
    }
    function ends() {
      var atStart = idx <= 0, atEnd = idx >= maxI;
      root.classList.toggle('is-start', atStart);
      root.classList.toggle('is-end', atEnd);
      if (prevBtn) prevBtn.setAttribute('aria-disabled', atStart ? 'true' : 'false');
      if (nextBtn) nextBtn.setAttribute('aria-disabled', atEnd ? 'true' : 'false');
    }
    function render(anim) { setX(pos(idx), anim && !motionOff()); ends(); }
    function go(d) {
      var to = Math.max(0, Math.min(maxI, idx + d));
      if (to === idx) return false;
      idx = to;
      render(true);
      return true;
    }
    function currentX() {
      var m = getComputedStyle(track).transform;
      if (!m || m === 'none') return x;
      var v = m.match(/matrix(3d)?\(([^)]+)\)/);
      if (!v) return x;
      var p = v[2].split(',').map(parseFloat);
      return v[1] ? p[12] : p[4];
    }

    // 화살표
    if (prevBtn) prevBtn.addEventListener('click', function () { go(-1); hold(); });
    if (nextBtn) nextBtn.addEventListener('click', function () { go(1); hold(); });
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      e.preventDefault();
      go(e.key === 'ArrowRight' ? 1 : -1); hold();
    });
    // 키보드로 카드에 들어오면 그 카드가 보이도록
    track.addEventListener('focusin', function (e) {
      var it = e.target.closest('.prail-item');
      var k = items.indexOf(it);
      if (k < 0) return;
      view.scrollLeft = 0; // 브라우저가 포커스 따라 옆으로 밀어 둔 것을 되돌림
      var to = Math.min(maxI, k);
      if (to !== idx) { idx = to; render(true); }
    });

    // 끌기 · 밀기 (세로 스크롤은 브라우저에 맡김: touch-action: pan-y) — 양 끝 너머로는 고무줄처럼 조금만
    var drag = null, suppress = false;
    view.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (maxI === 0) return;
      measure();
      var cx = currentX();
      setX(cx, false);
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
      if (px > start) px = start + (px - start) * 0.3;
      else if (px < minX) px = minX + (px - minX) * 0.3;
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
      idx = Math.max(0, Math.min(maxI, Math.round(f)));
      render(true);
      hold();
    }
    view.addEventListener('pointerup', endDrag);
    view.addEventListener('pointercancel', function (e) { if (drag && e.pointerId === drag.id) { var on = drag.on; drag = null; root.classList.remove('is-drag'); if (on) render(true); } });
    view.addEventListener('click', function (e) { if (suppress) { e.preventDefault(); e.stopPropagation(); suppress = false; } }, true);
    view.addEventListener('dragstart', function (e) { e.preventDefault(); });

    // 자동 넘김 — 끝에 닿으면 처음으로
    var timer = 0, inView = false, hover = false, focusIn = false, holdUntil = 0;
    function hold() { holdUntil = Date.now() + 6000; }
    function canRun() { return maxI > 0 && inView && !hover && !focusIn && !drag && !motionOff() && document.visibilityState !== 'hidden'; }
    function tick() {
      timer = setTimeout(tick, AUTO_MS);
      if (!canRun() || Date.now() < holdUntil) return;
      if (!go(1)) { idx = 0; render(true); }
    }
    root.addEventListener('mouseenter', function () { hover = true; });
    root.addEventListener('mouseleave', function () { hover = false; hold(); });
    root.addEventListener('focusin', function () { focusIn = true; });
    root.addEventListener('focusout', function (e) { if (!root.contains(e.relatedTarget)) focusIn = false; });
    // 줄이 화면에 거의 다 들어온 뒤에만 자동 넘김 — 처음 보일 때는 항상 첫 카드(문원오)부터, 들어올 때마다 6초 쉬었다가
    var seenOnce = false;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        var e = en[0], was = inView;
        if (e.isIntersecting && !seenOnce) {
          seenOnce = true;
          if (idx !== 0) { idx = 0; render(false); }
          root.classList.add('is-seen');
          hold();
        }
        inView = e.isIntersecting && e.intersectionRatio >= 0.6;
        if (inView && !was) hold();
      }, { threshold: [0, 0.6] }).observe(root);
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
        idx = Math.max(0, Math.min(maxI, ((k % n) + n) % n));
        render(!instant);
        hold();
      }
    };
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-prail]'), init);
})();
