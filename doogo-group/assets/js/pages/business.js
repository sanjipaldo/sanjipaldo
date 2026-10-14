/* =========================================================
   DOOGO GROUP — business.js (사업영역 목록)
   첫 화면 7개 사업 사진 슬라이드(바로가기 hover/focus 시 그 사업 사진으로 고정) ·
   카드 사진 패럴랙스 · VIEW 커서 · 서브 내비 보정
   움직임 정책(site.js): OS의 '애니메이션 줄이기' 설정과 관계없이 재생하고,
   사용자가 '움직임 멈추기'를 고른 경우(window.DOOGO.motionOff())만 멈춥니다 — 'doogo:motion' 이벤트로 바로 전환.
   패럴랙스만 OS 설정이 켜진 기기(html.soft-motion)에서 끕니다.
   ========================================================= */
(function () {
  'use strict';
  var doc = document.documentElement;
  var motionOff = function () { return !!(window.DOOGO && window.DOOGO.motionOff && window.DOOGO.motionOff()); };
  var softMotion = function () { return doc.classList.contains('soft-motion'); };
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  /* ---------- 1) 첫 화면: 7개 사업 사진 슬라이드 ----------
     5초마다 다음 사업 사진으로 크로스페이드(+느린 줌, business.css). 지금 보이는 사업은 바로가기 카드에 표시.
     · 바로가기에 마우스를 올리거나 포커스하면 그 사업 사진으로 고정, 벗어나면 그 자리에서 다시 넘김
     · 화면 밖 · 탭이 숨겨짐 · 정지 버튼 · '움직임 멈추기' → 멈춤 (다시 켜면 그 자리에서 이어서 넘김)
     · 첫 장 외 사진은 <template> 안에 있다가 넘기기 직전(또는 바로가기에 처음 다가갈 때) 불러옴 */
  var DUR = 5000, FADE = 1250;
  var hero = $('.bz-hero');
  var stack = $('.bz-slides');
  var tpl = document.getElementById('bz-slides-more');
  var jump = $('.bz-jump');
  if (hero && stack && jump) {
    var items = $$('.bz-jump-item', jump);
    var keys = items.map(function (a) { return a.getAttribute('data-key'); });
    var first = $('.bz-slide', stack);
    var spare = tpl && tpl.content ? Array.prototype.slice.call(tpl.content.querySelectorAll('.bz-slide')) : [];
    var slides = keys.map(function (k, i) { return i === 0 ? first : null; });
    var cur = 0, want = 0, top = 1, timer = 0, cleanT = 0;
    var inView = true, pinned = false, userPaused = false;
    var toggle = $('.bz-vtoggle', hero);

    hero.style.setProperty('--slide-dur', DUR + 'ms');
    if (first) first.style.zIndex = 1;

    var slideFor = function (i) { // i번째 사진 <img> (처음 부를 때 template에서 꺼내 문서에 넣음 → 그때 불러오기 시작)
      if (slides[i]) return slides[i];
      var src = spare.filter(function (img) { return img.getAttribute('data-key') === keys[i]; })[0];
      if (!src) return null;
      slides[i] = document.importNode(src, true);
      stack.appendChild(slides[i]);
      return slides[i];
    };
    var ready = function (img) {
      if (!img) return Promise.reject();
      if (img.complete && img.naturalWidth) return Promise.resolve();
      if (img.decode) return img.decode();
      return new Promise(function (res, rej) { img.addEventListener('load', res, { once: true }); img.addEventListener('error', rej, { once: true }); });
    };
    var preloadAll = function () { keys.forEach(function (k, i) { slideFor(i); }); };

    var mark = function (i) {
      items.forEach(function (a, j) { a.classList.toggle('is-cur', j === i); });
    };
    var restartProgress = function () { // 진행선 애니메이션을 처음부터
      hero.classList.remove('is-auto');
      if (running()) { void hero.offsetWidth; hero.classList.add('is-auto'); }
    };
    var running = function () { return !motionOff() && !userPaused && !pinned && inView && !document.hidden; };

    var show = function (i) {
      want = i;
      var img = slideFor(i);
      ready(img).then(function () {
        if (want !== i || i === cur) return;
        // 새 사진을 맨 위에서 처음부터 나타나게 (이미 켜져 있던 사진이면 껐다가 다시)
        img.classList.remove('is-on', 'is-first');
        img.style.zIndex = ++top;
        void img.offsetWidth;
        img.classList.add('is-on');
        cur = i;
        mark(i);
        // 새 사진이 다 덮은 뒤 아래 사진들을 치움(보이지 않는 상태에서 처음 위치로)
        clearTimeout(cleanT);
        cleanT = setTimeout(function () {
          slides.forEach(function (s, j) { if (s && j !== cur) s.classList.remove('is-on', 'is-first'); });
        }, FADE);
        // 다음 사진 미리 불러오기
        if (!motionOff()) slideFor((i + 1) % keys.length);
      }, function () { /* 불러오기 실패: 지금 사진 유지 */ });
    };

    var schedule = function () {
      clearTimeout(timer);
      restartProgress();
      if (!running()) return;
      timer = setTimeout(function () { show((cur + 1) % keys.length); schedule(); }, DUR);
    };

    mark(0);
    // 다음 사진은 첫 화면이 그려진 뒤에 미리 불러옴
    var warm = function () { if (!motionOff()) slideFor(1); };
    if (document.readyState === 'complete') warm(); else window.addEventListener('load', warm, { once: true });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting; schedule();
      }, { threshold: 0.12 }).observe(hero);
    }
    document.addEventListener('visibilitychange', schedule);

    // 이 사진 넘김만 멈추는 버튼 ('움직임 멈추기' 상태에서는 숨김 — 전체 정지가 우선)
    var syncToggle = function () { if (toggle) toggle.hidden = motionOff(); };
    if (toggle) {
      toggle.addEventListener('click', function () {
        userPaused = !userPaused;
        toggle.setAttribute('aria-pressed', String(userPaused));
        toggle.setAttribute('aria-label', userPaused ? '배경 사진 자동 넘김 재생' : '배경 사진 자동 넘김 정지');
        toggle.classList.toggle('is-paused', userPaused);
        schedule();
      });
    }
    document.addEventListener('doogo:motion', function () { syncToggle(); if (!motionOff()) warm(); schedule(); });
    syncToggle();
    schedule();

    // 바로가기 hover · focus → 그 사업 사진으로 고정
    var pin = function (i) { pinned = true; schedule(); show(i); };
    var unpin = function () { if (!pinned) return; pinned = false; schedule(); };
    if (fine) jump.addEventListener('pointerenter', preloadAll);
    items.forEach(function (a, i) {
      if (fine) a.addEventListener('pointerenter', function () { pin(i); });
      a.addEventListener('focus', function () { preloadAll(); pin(i); });
    });
    var kbdIn = function () { // 키보드 포커스(포커스 링이 보이는 상태)가 바로가기 안에 있는지
      var el = document.activeElement;
      if (!el || !jump.contains(el)) return false;
      try { return el.matches(':focus-visible'); } catch (e) { return true; }
    };
    if (fine) jump.addEventListener('pointerleave', function () { if (!kbdIn()) unpin(); });
    jump.addEventListener('focusout', function (e) { if (!jump.contains(e.relatedTarget) && !(fine && jump.matches(':hover'))) unpin(); });
  }

  /* ---------- 3) 카드 사진 VIEW 커서 ---------- */
  if (fine) {
    $$('.bz-media').forEach(function (m) {
      var cur = $('.bz-cursor', m);
      if (!cur) return;
      m.classList.add('has-cursor');
      var tx = 0, ty = 0, x = 0, y = 0, raf = 0, inside = false;
      function loop() {
        x += (tx - x) * 0.2; y += (ty - y) * 0.2;
        cur.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
        if (inside || Math.abs(tx - x) > 0.4 || Math.abs(ty - y) > 0.4) raf = requestAnimationFrame(loop);
        else raf = 0;
      }
      function pos(e) { var r = m.getBoundingClientRect(); tx = e.clientX - r.left; ty = e.clientY - r.top; }
      m.addEventListener('pointerenter', function (e) {
        pos(e); x = tx; y = ty; inside = true; m.classList.add('is-hover');
        if (!raf) raf = requestAnimationFrame(loop);
      });
      m.addEventListener('pointermove', function (e) { pos(e); if (!raf) raf = requestAnimationFrame(loop); });
      m.addEventListener('pointerleave', function () { inside = false; m.classList.remove('is-hover'); });
    });
  }

  /* ---------- 4) 카드 사진 패럴랙스 (움직임 멈추기 · OS 애니메이션 줄이기 기기에서는 끔) ---------- */
  var par = $$('[data-parallax]');
  if (par.length) {
    var ticking = false;
    var update = function () {
      ticking = false;
      if (motionOff() || softMotion()) { par.forEach(function (el) { el.style.removeProperty('--py'); }); return; }
      var vh = window.innerHeight || 800;
      par.forEach(function (el) {
        var box = el.parentElement.getBoundingClientRect();
        if (box.bottom < -120 || box.top > vh + 120) return;
        var p = clamp((box.top + box.height / 2 - vh / 2) / vh, -1, 1);
        el.style.setProperty('--py', (p * -box.height * 0.06).toFixed(1) + 'px');
      });
    };
    var onScroll = function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    document.addEventListener('doogo:motion', onScroll);
    update();
  }


  /* ---------- 서브 내비: 첫 구간보다 위로 올라가면 현재 표시 해제 ---------- */
  var subLinks = Array.prototype.slice.call(document.querySelectorAll('.subnav a[href^="#"]'));
  var firstSec = subLinks.length ? document.querySelector(subLinks[0].getAttribute('href')) : null;
  if (firstSec) {
    var subTick = false;
    var clearTop = function () {
      subTick = false;
      if (firstSec.getBoundingClientRect().top > (window.innerHeight || 800) * 0.6) {
        subLinks.forEach(function (a) { a.classList.remove('is-active'); a.removeAttribute('aria-current'); });
      }
    };
    window.addEventListener('scroll', function () { if (!subTick) { subTick = true; requestAnimationFrame(clearTop); } }, { passive: true });
  }
})();
