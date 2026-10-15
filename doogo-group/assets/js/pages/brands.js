/* =========================================================
   DOOGO GROUP — brands.js (브랜드와 성과)
   브랜드 3D 카드(포인터를 따라 떠오름) · 프로젝트 커버플로우 · 성장 사례 카드 쌓임 효과
   · 탭(운영 브랜드 · 프로젝트 · 성장 사례 · 협력 파트너 — 주소 #앵커 연동, 맨 아래)
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
  var onShow = []; // 탭 패널이 새로 보일 때 부를 함수들 (panel) — 숨어 있던 동안 0 으로 잰 크기·위치를 다시 잼

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

    function instant() { if (!root.offsetWidth) return; slides.forEach(function (s) { s.classList.add('no-tr'); }); measure(); place(0); void root.offsetWidth; slides.forEach(function (s) { s.classList.remove('no-tr'); }); }
    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(instant, 120); });

    // 시작: 전환 없이 제자리에
    root.classList.add('is-ready');
    instant();
    mark(false);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (root.offsetWidth) { measure(); place(0); } });
    // 탭 패널이 숨어 있던 동안에는 카드 폭이 0 이므로, 보이게 되면 전환 없이 다시 재서 제자리에
    onShow.push(function (panel) { if (panel.contains(root)) instant(); });
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
      if (!c.offsetParent) { c.style.removeProperty('--sc'); c.style.removeProperty('--dim'); return; } // 숨은 탭 패널
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
    onShow.push(function (panel) { if (panel.contains(cases[0])) updateStack(); });
  }

  /* ---------- 탭: 운영 브랜드 · 프로젝트 · 성장 사례 · 협력 파트너 ----------
     탭 바(role=tablist) 아래에는 선택된 패널 하나만 보입니다(그룹 소개 페이지와 같은 방식). 주소 #앵커(brands.html#projects 등)와 이어져 있어
       · 처음 열 때: #앵커의 탭(없으면 '운영 브랜드'). <head> 의 작은 스크립트가 먼저 그 패널만 보이게 해 두고 여기서 이어받습니다.
       · 탭을 누르면: 주소를 history.replaceState 로 바꿔 둠(방문 기록은 늘지 않음).
       · 히어로의 01–04 목록을 누르면: 그 탭을 열고 탭 바가 헤더 바로 아래 오도록 부드럽게 내려감.
       · 헤더 메뉴 · 다른 링크로 #앵커가 바뀌거나 뒤로/앞으로 가면(hashchange): 그 탭을 열고 탭 바 자리로 맞춤.
     바뀔 때는 지금 패널이 잠깐 흐려지고(0.12초) 새 패널이 살짝 올라오며 나타납니다(0.34초).
     움직임 멈추기(html.motion-off)면 바로 바뀝니다. 키보드: ←/→ · Home/End 로 탭 사이 이동, Enter/Space 로 선택. */
  (function () {
    var bar = $('[data-bn-tabs]');
    var wrap = $('[data-bn-panels]');
    var list = bar && $('[role="tablist"]', bar);
    if (!bar || !wrap || !list) return;
    var header = $('[data-header-el]') || $('.site-header');
    var tabs = [], tabMap = {}, panels = {}, ids = [];
    $$('[role="tab"]', list).forEach(function (t) {
      var id = t.getAttribute('aria-controls'), p = id && document.getElementById(id);
      if (!p) return;
      tabs.push(t); tabMap[id] = t; panels[id] = p; ids.push(id);
    });
    if (!ids.length) return;
    var valid = function (id) { return ids.indexOf(id) >= 0; };
    var hashId = function () {
      var h = (location.hash || '').slice(1);
      try { h = decodeURIComponent(h); } catch (e) { /* 그대로 */ }
      return valid(h) ? h : '';
    };
    var cur = '', token = 0, outA = null, inA = null;

    // 탭 바 높이(앵커 위치 보정용 CSS 변수) · 검은 알약 위치
    var measureBar = function () { root.style.setProperty('--bn-tabs-h', bar.offsetHeight + 'px'); };
    var moveInd = function (glide) {
      var t = tabMap[cur];
      if (!t || !t.offsetWidth) return;
      list.classList.toggle('is-glide', !!glide && !motionOff());
      list.style.setProperty('--ind-x', t.offsetLeft + 'px');
      list.style.setProperty('--ind-y', t.offsetTop + 'px');
      list.style.setProperty('--ind-w', t.offsetWidth + 'px');
      list.style.setProperty('--ind-h', t.offsetHeight + 'px');
      list.classList.add('is-ind');
    };
    // 탭 바가 가로로 넘칠 때(모바일) 선택된 탭이 가운데 오도록 탭 바만 옆으로 밉니다
    var revealTab = function (t, smooth) {
      var max = list.scrollWidth - list.clientWidth;
      if (!t || max <= 1) return;
      var left = clamp(t.offsetLeft - (list.clientWidth - t.offsetWidth) / 2, 0, max);
      if (Math.abs(left - list.scrollLeft) < 2) return;
      try { list.scrollTo({ left: left, behavior: smooth && !motionOff() ? 'smooth' : 'auto' }); } catch (e) { list.scrollLeft = left; }
    };
    var setTabs = function (id) {
      tabs.forEach(function (t) {
        var on = t.getAttribute('aria-controls') === id;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
      });
    };

    // 탭 바가 헤더 바로 아래 붙는 스크롤 위치 (탭 바는 sticky 라 패널 묶음의 위치로 계산).
    // 헤더가 스크롤로 숨어 있던 중이면 그 상태 그대로 탭 바를 맨 위에 둡니다.
    var hdHidden = function () { return !!(header && header.classList.contains('is-hidden')); };
    var barY = function (hide) {
      var hh = header && !hide ? header.offsetHeight : 0;
      return Math.max(0, Math.round(wrap.getBoundingClientRect().top + window.scrollY - bar.offsetHeight - hh));
    };
    // 이 스크립트가 옮긴 스크롤 직후에는 헤더 상태를 유지합니다(site.js 는 크게 움직이면 헤더를 숨기거나 꺼냄)
    var keepHd = 0, keepHide = false;
    window.addEventListener('scroll', function () {
      if (!keepHd || !header) return;
      if (Date.now() > keepHd) { keepHd = 0; return; }
      header.classList.toggle('is-hidden', keepHide);
    }, { passive: true });
    var jump = function (y, smooth, hide) {
      if (Math.abs(window.scrollY - y) < 2) return;
      var soft = smooth && !motionOff();
      keepHd = Date.now() + (soft ? 1100 : 260); keepHide = !!hide;
      if (soft) { try { window.scrollTo({ top: y, behavior: 'smooth' }); return; } catch (e) { /* 아래로 */ } }
      var sb = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto'; // base.css 의 html { scroll-behavior: smooth } 를 잠시 끄고 한 번에
      window.scrollTo(0, y);
      root.style.scrollBehavior = sb;
    };
    // mode: 'always' = 탭 바 자리로(헤더를 보이게) · 'past' = 탭 바를 지나 내려가 있을 때만(히어로를 보던 중이면 그대로)
    var place = function (mode, smooth) {
      if (!mode) return;
      var hide = mode === 'past' && hdHidden();
      var y = barY(hide);
      if (mode === 'always' || window.scrollY > y + 2) jump(y, smooth, hide);
    };

    // o: { hash: 주소 바꿈, scroll: 'always' | 'past', smooth: 화면 이동을 부드럽게(히어로 목록), focus: 패널로 포커스, instant: 전환 없이 }
    function show(id, o) {
      o = o || {};
      if (!valid(id)) return;
      var to = panels[id];
      var same = id === cur && !to.hidden;
      cur = id;
      setTabs(id);
      moveInd(!o.instant);
      revealTab(tabMap[id], !o.instant);
      if (o.hash && location.hash !== '#' + id) { try { history.replaceState(history.state, '', '#' + id); } catch (e) { /* file:// 등 */ } }
      if (same) { if (outA) { outA.cancel(); outA = null; } place(o.scroll, true); return; }
      var t = ++token;
      var animate = !o.instant && !motionOff() && typeof to.animate === 'function';
      var from = ids.map(function (k) { return panels[k]; }).filter(function (p) { return p !== to && !p.hidden; })[0];
      // 히어로 목록에서 왔으면 화면은 처음부터 부드럽게 내려가고(탭 바 위치는 패널이 바뀌어도 그대로), 그 사이 패널이 바뀜
      if (o.smooth) place(o.scroll, true);
      var reveal = function () {
        if (t !== token) return;
        ids.forEach(function (k) { panels[k].hidden = panels[k] !== to; });
        if (outA) { outA.cancel(); outA = null; }
        if (inA) { inA.cancel(); inA = null; }
        if (!o.smooth) place(o.scroll, false); // 내용이 흐려진 사이에 한 번에 옮김
        onShow.forEach(function (fn) { try { fn(to); } catch (e) { /* 한 모듈 오류가 탭 전환을 막지 않게 */ } });
        if (o.focus) { try { to.focus({ preventScroll: true }); } catch (e) { to.focus(); } }
        if (animate && !motionOff()) {
          inA = to.animate([{ opacity: 0, transform: 'translate3d(0, 22px, 0)' }, { opacity: 1, transform: 'none' }],
            { duration: 340, easing: 'cubic-bezier(.2, .7, .2, 1)' });
          inA.onfinish = function () { inA = null; };
        }
      };
      // 이미 흐려지는 중이면 그 끝에 새 패널을 보여 주도록만 바꿈 (빠르게 여러 번 눌러도 깜빡이지 않게)
      if (outA && from && outA.effect && outA.effect.target === from) { outA.onfinish = reveal; return; }
      if (outA) { outA.cancel(); outA = null; }
      if (animate && from) {
        outA = from.animate([{ opacity: 0 }], { duration: 120, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' });
        outA.onfinish = reveal;
      } else reveal();
    }

    // 클릭(Enter 도 링크 클릭으로 들어옴) · 새 탭으로 열기(⌘/Ctrl/Shift/가운데 버튼)는 브라우저에 맡김
    var plain = function (e) { return !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0); };
    tabs.forEach(function (t) {
      t.addEventListener('click', function (e) {
        if (!plain(e)) return;
        e.preventDefault();
        show(t.getAttribute('aria-controls'), { hash: true, scroll: 'past' });
      });
    });
    // 히어로의 01–04 목록: 그 탭을 열고 탭 바 자리로 부드럽게
    $$('[data-bn-jump] a[aria-controls]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('aria-controls');
        if (!plain(e) || !valid(id)) return;
        e.preventDefault();
        show(id, { hash: true, scroll: 'always', smooth: true });
        // 키보드로 눌렀으면 이어서 읽을 곳(선택된 탭)으로 포커스
        try { if (a.matches(':focus-visible')) tabMap[id].focus({ preventScroll: true }); } catch (err) { /* 무시 */ }
      });
    });
    list.addEventListener('keydown', function (e) {
      var i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      var n = null;
      if (e.key === 'ArrowRight') n = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') n = tabs[0];
      else if (e.key === 'End') n = tabs[tabs.length - 1];
      else if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); tabs[i].click(); return; }
      if (!n) return;
      e.preventDefault();
      // 화살표는 포커스만 옮기는 방식(선택은 Enter/Space) — 탭 사이를 오가는 동안 패널·화면이 바뀌지 않도록
      tabs.forEach(function (x) { x.tabIndex = x === n ? 0 : -1; });
      try { n.focus({ preventScroll: true }); } catch (err) { n.focus(); }
      revealTab(n, true);
    });
    // 포커스가 탭 바를 떠나면 Tab 순서는 다시 선택된 탭부터
    list.addEventListener('focusout', function (e) {
      if (e.relatedTarget && list.contains(e.relatedTarget)) return;
      tabs.forEach(function (x) { x.tabIndex = x.getAttribute('aria-selected') === 'true' ? 0 : -1; });
    });

    // 헤더 메뉴 · 다른 링크(brands.html#projects, #projects) · 뒤로/앞으로
    window.addEventListener('hashchange', function () {
      var id = hashId();
      if (!id) { if (!location.hash) show(ids[0], { scroll: 'past' }); return; } // #main 같은 다른 앵커는 그대로
      var a = document.activeElement;
      var focus = !!(a && a !== document.body && ((header && header.contains(a)) || (cur && panels[cur].contains(a))));
      show(id, { scroll: 'always', focus: focus });
    });

    // 시작: <head> 스크립트가 정한 패널을 hidden 속성으로 이어받음
    var first = hashId() || ids[0];
    cur = first;
    ids.forEach(function (k) { panels[k].hidden = k !== first; });
    setTabs(first);
    root.classList.add('bn-tabs-ready');
    measureBar();
    moveInd(false);
    revealTab(tabMap[first], false);
    var relayoutBar = function () { measureBar(); moveInd(false); };
    if ('ResizeObserver' in window) new ResizeObserver(relayoutBar).observe(list);
    window.addEventListener('resize', relayoutBar);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { relayoutBar(); revealTab(tabMap[cur], false); });

    // #앵커로 들어왔으면 탭 바가 헤더 바로 아래 오도록 (글꼴 · 이미지가 늦게 자리를 잡아도 사용자가 움직이기 전이면 다시 맞춤)
    if (hashId()) {
      var touched = false;
      ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(function (ev) {
        window.addEventListener(ev, function () { touched = true; }, { once: true, passive: true, capture: true });
      });
      place('always', false);
      var settle = function () { if (!touched) { measureBar(); place('always', false); } };
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(settle);
      window.addEventListener('load', function () { settle(); requestAnimationFrame(settle); setTimeout(settle, 120); });
    }
    requestAnimationFrame(function () { onShow.forEach(function (fn) { try { fn(panels[first]); } catch (e) { /* 계속 */ } }); });
  })();

})();
