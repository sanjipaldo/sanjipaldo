/* =========================================================
   DOOGO GROUP — business.js (사업영역 목록)
   사업 바로가기에 마우스를 올리면 첫 화면 배경이 해당 사업 장면으로 바뀜 ·
   카드 영상 포스터 지연 로드 · 카드 영상 패럴랙스 · VIEW 커서 · 서브 내비 보정
   ========================================================= */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  /* ---------- 0) 영상 재생 (이 페이지는 site.js의 data-autoplay 대신 직접 관리) ----------
     - 첫 화면 영상(data-auto-min): 그 폭 이상에서만 보일 때 자동재생. 좁은 화면·데이터 절약·움직임 줄이기는
       포스터만 보여 주고, 재생/정지 버튼(site.js의 data-video-toggle)으로 원할 때만 재생
     - 카드 영상(data-hover-play): 마우스를 올린 카드만 재생, 벗어나면 정지 (터치 화면은 포스터만 — 영상 파일을 받지 않음) */
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  function play(v) {
    if (v.preload === 'none') v.preload = 'auto';
    var p = v.play();
    if (p && p.catch) p.catch(function () {});
  }
  $$('video[data-auto-min]').forEach(function (v) {
    var wrap = v.closest('[data-video-wrap]') || v.parentElement;
    var mq = window.matchMedia('(min-width: ' + v.getAttribute('data-auto-min') + 'px)');
    v.muted = true;
    if (reduce) { wrap.classList.add('is-reduced'); return; }
    if (saveData || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (v.dataset.userPaused === '1') return;
        if (en.isIntersecting) { if (mq.matches || v.dataset.userPaused === '0') play(v); }
        else if (!v.paused) v.pause();
      });
    }, { threshold: 0.15 }).observe(v);
  });
  if (fine && !reduce && !saveData) {
    $$('.bz-card').forEach(function (card) {
      var v = $('video[data-hover-play]', card);
      if (!v) return;
      v.muted = true;
      card.addEventListener('pointerenter', function () {
        if (!v.getAttribute('poster')) v.setAttribute('poster', v.getAttribute('data-poster'));
        play(v);
      });
      card.addEventListener('pointerleave', function () { if (!v.paused) v.pause(); });
    });
  }

  /* ---------- 1) 카드 영상 포스터: 가까워지면 불러오기 ---------- */
  var lazyVids = $$('video[data-poster]');
  function setPoster(v) { if (!v.getAttribute('poster')) v.setAttribute('poster', v.getAttribute('data-poster')); }
  if ('IntersectionObserver' in window) {
    var pio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { setPoster(en.target); pio.unobserve(en.target); } });
    }, { rootMargin: '900px 0px' });
    lazyVids.forEach(function (v) { pio.observe(v); });
  } else lazyVids.forEach(setPoster);

  /* ---------- 2) 첫 화면: 바로가기 hover → 배경 장면 교체 ---------- */
  var hero = $('.bz-hero');
  var jump = $('.bz-jump');
  var swapBox = $('.bz-hero-swap');
  if (hero && jump && swapBox && fine) {
    var swaps = [];
    var load = function () {
      if (swaps.length) return;
      $$('.bz-jump-item', jump).forEach(function (a) {
        var img = new Image();
        img.alt = ''; img.decoding = 'async'; img.width = 1280; img.height = 720;
        img.setAttribute('data-key', a.getAttribute('data-key'));
        img.src = 'assets/video/biz-' + a.getAttribute('data-key') + '.webp';
        swapBox.appendChild(img); swaps.push(img);
      });
    };
    var show = function (key) {
      load();
      swaps.forEach(function (img) { img.classList.toggle('is-on', img.getAttribute('data-key') === key); });
      hero.classList.add('is-swap');
    };
    var hide = function () {
      hero.classList.remove('is-swap');
      swaps.forEach(function (img) { img.classList.remove('is-on'); });
    };
    jump.addEventListener('pointerenter', load);
    $$('.bz-jump-item', jump).forEach(function (a) {
      var key = a.getAttribute('data-key');
      a.addEventListener('pointerenter', function () { show(key); });
      a.addEventListener('focus', function () { show(key); });
    });
    jump.addEventListener('pointerleave', hide);
    jump.addEventListener('focusout', function (e) { if (!jump.contains(e.relatedTarget)) hide(); });
  }

  /* ---------- 3) 카드 영상 VIEW 커서 ---------- */
  if (fine && !reduce) {
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

  /* ---------- 4) 카드 영상 패럴랙스 ---------- */
  var par = $$('[data-parallax]');
  if (!reduce && par.length) {
    var ticking = false;
    var update = function () {
      ticking = false;
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
