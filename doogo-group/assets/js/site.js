/* =========================================================
   DOOGO GROUP — site.js (모든 페이지 공통)
   헤더 상태 · 드롭다운/메가메뉴 · 모바일 메뉴 · 스크롤 등장 · 숫자 카운트
   · 그룹 영상 모달 · 배경 영상 자동재생 처리 · 패밀리 사이트 · 토스트
   ========================================================= */
(function () {
  'use strict';
  var doc = document.documentElement;
  doc.classList.add('js');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- 헤더: 스크롤 상태 ---------- */
  var header = $('[data-header-el]');
  var lastY = window.scrollY;
  function onScroll() {
    var y = window.scrollY;
    if (!header) return;
    header.classList.toggle('is-scrolled', y > 24);
    // 아래로 많이 내릴 때 헤더 숨김, 위로 올리면 표시 (메뉴 열림 상태 제외)
    var open = header.classList.contains('is-mega') || header.classList.contains('is-menu') || doc.classList.contains('is-locked');
    if (!open && y > 480 && y > lastY + 6) header.classList.add('is-hidden');
    else if (y < lastY - 6 || y < 480) header.classList.remove('is-hidden');
    lastY = y;
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- 현재 메뉴 표시 ---------- */
  var page = document.body.getAttribute('data-page') || '';
  var section = page.indexOf('business') === 0 ? 'business' : page;
  $$('.gnb > ul > li[data-nav]').forEach(function (li) {
    if (li.getAttribute('data-nav') === section) {
      var a = li.querySelector('.gnb-link');
      if (a) { a.classList.add('is-current'); a.setAttribute('aria-current', 'page'); }
    }
  });

  /* ---------- 데스크톱 드롭다운 · 메가메뉴 ---------- */
  var closeTimer = null;
  function closeAll() {
    $$('.gnb li.is-open').forEach(function (li) {
      li.classList.remove('is-open');
      var a = li.querySelector('.gnb-link'); if (a) a.setAttribute('aria-expanded', 'false');
    });
    if (header) header.classList.remove('is-mega');
  }
  function openItem(li) {
    clearTimeout(closeTimer);
    closeAll();
    li.classList.add('is-open');
    var a = li.querySelector('.gnb-link'); if (a) a.setAttribute('aria-expanded', 'true');
    if (li.classList.contains('has-mega')) header.classList.add('is-mega');
  }
  $$('.gnb > ul > li.has-sub, .gnb > ul > li.has-mega').forEach(function (li) {
    li.addEventListener('mouseenter', function () { openItem(li); });
    li.addEventListener('mouseleave', function () {
      closeTimer = setTimeout(function () {
        if (li.classList.contains('has-mega') && $('.mega:hover')) return;
        closeAll();
      }, 160);
    });
    li.addEventListener('focusin', function () { openItem(li); });
  });
  var mega = $('.mega');
  if (mega) {
    mega.addEventListener('mouseenter', function () { clearTimeout(closeTimer); });
    mega.addEventListener('mouseleave', function () { closeTimer = setTimeout(closeAll, 160); });
    mega.addEventListener('focusout', function (e) {
      if (!header.contains(e.relatedTarget)) closeAll();
    });
  }
  if (header) {
    header.addEventListener('focusout', function (e) {
      if (e.relatedTarget && !header.contains(e.relatedTarget)) closeAll();
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var openLi = $('.gnb li.is-open');
      closeAll();
      if (openLi) { var a = openLi.querySelector('.gnb-link'); if (a) a.focus(); }
    }
  });

  /* ---------- 모바일 메뉴 ---------- */
  var menuBtn = $('.hd-menu-btn');
  var mnav = $('#mnav');
  function setMenu(open) {
    if (!mnav || !menuBtn) return;
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? '전체 메뉴 닫기' : '전체 메뉴 열기');
    if (open) {
      mnav.hidden = false;
      requestAnimationFrame(function () { mnav.classList.add('is-open'); });
      header.classList.add('is-menu');
      doc.classList.add('is-locked');
    } else {
      mnav.classList.remove('is-open');
      header.classList.remove('is-menu');
      doc.classList.remove('is-locked');
      setTimeout(function () { if (!mnav.classList.contains('is-open')) mnav.hidden = true; }, 320);
    }
  }
  if (menuBtn) menuBtn.addEventListener('click', function () { setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'); });
  $$('.mnav-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      var open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      if (panel) panel.hidden = !open;
    });
  });
  if (mnav) {
    mnav.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && mnav.classList.contains('is-open')) { setMenu(false); menuBtn.focus(); } });
    window.addEventListener('resize', function () { if (window.innerWidth > 1024 && mnav.classList.contains('is-open')) setMenu(false); });
  }

  /* ---------- 스크롤 등장 ---------- */
  var revealEls = $$('[data-reveal], [data-lines]');
  // [data-lines] 안의 .line 에 순번(--i) 부여
  $$('[data-lines]').forEach(function (el) {
    $$('.line', el).forEach(function (l, i) { l.style.setProperty('--i', i); });
  });
  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---------- 숫자 카운트: <span data-count="7" data-suffix="개"> ---------- */
  function runCount(el) {
    var target = parseFloat(el.getAttribute('data-count')) || 0;
    var suffix = el.getAttribute('data-suffix') || '';
    var dur = 1400, start = null;
    if (reduceMotion) { el.textContent = target + suffix; return; }
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var v = target * (1 - Math.pow(1 - p, 3));
      el.textContent = (target % 1 ? v.toFixed(1) : Math.round(v)) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var counters = $$('[data-count]');
  if (counters.length && 'IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { runCount(en.target); cio.unobserve(en.target); } });
    }, { threshold: 0.4 });
    counters.forEach(function (el) { cio.observe(el); });
  } else counters.forEach(runCount);

  /* ---------- 배경 영상: <video data-autoplay muted loop playsinline> ----------
     움직임 줄이기 설정이면 자동재생하지 않고 포스터만 보여줍니다.
     자동재생이 막히면 부모에 .is-autoplay-blocked 를 붙입니다 (재생 버튼 노출용). */
  var bgVideos = $$('video[data-autoplay]');
  function tryPlay(v) {
    var p = v.play();
    if (p && p.catch) p.catch(function () { var w = v.closest('[data-video-wrap]') || v.parentElement; w.classList.add('is-autoplay-blocked'); });
  }
  if (!reduceMotion && 'IntersectionObserver' in window) {
    var vio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var v = en.target;
        if (v.dataset.userPaused === '1') return;
        if (en.isIntersecting) {
          if (v.preload === 'none' || !v.currentSrc) { v.preload = 'auto'; }
          tryPlay(v);
        } else if (!v.paused) v.pause();
      });
    }, { threshold: 0.15 });
    bgVideos.forEach(function (v) { v.muted = true; vio.observe(v); });
  } else {
    bgVideos.forEach(function (v) { v.removeAttribute('autoplay'); v.pause(); v.closest('[data-video-wrap]') && v.closest('[data-video-wrap]').classList.add('is-reduced'); });
  }
  // 재생/정지 버튼: <button data-video-toggle="#videoId">
  $$('[data-video-toggle]').forEach(function (btn) {
    var v = $(btn.getAttribute('data-video-toggle'));
    if (!v) return;
    function sync() {
      var playing = !v.paused;
      btn.setAttribute('aria-pressed', String(!playing));
      btn.setAttribute('aria-label', playing ? '배경 영상 정지' : '배경 영상 재생');
      btn.classList.toggle('is-paused', !playing);
    }
    btn.addEventListener('click', function () {
      if (v.paused) { v.dataset.userPaused = '0'; tryPlay(v); var w = v.closest('[data-video-wrap]'); if (w) w.classList.remove('is-autoplay-blocked'); }
      else { v.dataset.userPaused = '1'; v.pause(); }
    });
    v.addEventListener('play', sync); v.addEventListener('pause', sync); sync();
  });

  /* ---------- 그룹 영상 모달 ---------- */
  var modal = $('#film-modal');
  var film = $('#film-video');
  var lastFocus = null;
  function openFilm() {
    if (!modal) return;
    lastFocus = document.activeElement;
    if (film && !film.getAttribute('src') && film.dataset.src) film.setAttribute('src', film.dataset.src);
    modal.hidden = false;
    requestAnimationFrame(function () { modal.classList.add('is-open'); });
    doc.classList.add('is-locked');
    setTimeout(function () { var c = $('[data-film-close]', modal); if (c) c.focus(); if (film) { var p = film.play(); if (p && p.catch) p.catch(function () {}); } }, 60);
  }
  function closeFilm() {
    if (!modal || modal.hidden) return;
    modal.classList.remove('is-open');
    if (film) film.pause();
    doc.classList.remove('is-locked');
    setTimeout(function () { modal.hidden = true; }, 350);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.addEventListener('click', function (e) {
    var opener = e.target.closest('[data-film-open]');
    if (opener) { e.preventDefault(); if (mnav && mnav.classList.contains('is-open')) setMenu(false); openFilm(); return; }
    if (e.target.closest('[data-film-close]') || e.target === modal) closeFilm();
  });
  document.addEventListener('keydown', function (e) {
    if (!modal || modal.hidden) return;
    if (e.key === 'Escape') closeFilm();
    if (e.key === 'Tab') { // 포커스 가두기
      var f = $$('button, video, a[href]', modal).filter(function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- 패밀리 사이트 ---------- */
  var famBtn = $('.family-btn'), famList = $('#family-list');
  if (famBtn && famList) {
    famBtn.addEventListener('click', function () {
      var open = famBtn.getAttribute('aria-expanded') !== 'true';
      famBtn.setAttribute('aria-expanded', String(open)); famList.hidden = !open;
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.family')) { famBtn.setAttribute('aria-expanded', 'false'); famList.hidden = true; }
    });
  }

  /* ---------- 토스트 + 준비 중 링크 ---------- */
  var toastEl = $('#toast'), toastTimer;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg; toastEl.hidden = false;
    requestAnimationFrame(function () { toastEl.classList.add('is-show'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-show'); setTimeout(function () { toastEl.hidden = true; }, 300); }, 2400);
  }
  window.DOOGO = window.DOOGO || {};
  window.DOOGO.toast = toast;
  document.addEventListener('click', function (e) {
    var p = e.target.closest('[data-pending]');
    if (p) { e.preventDefault(); toast((p.getAttribute('data-pending') || '해당 링크') + ' 주소가 확정되면 연결됩니다.'); }
  });

  /* ---------- 서브 내비(페이지 안 앵커) 현재 위치 표시 ---------- */
  var subLinks = $$('.subnav a[href^="#"]');
  if (subLinks.length && 'IntersectionObserver' in window) {
    var map = {};
    subLinks.forEach(function (a) { var t = $(a.getAttribute('href')); if (t) map[t.id] = a; });
    var sio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && map[en.target.id]) {
          subLinks.forEach(function (a) { a.classList.remove('is-active'); a.removeAttribute('aria-current'); });
          map[en.target.id].classList.add('is-active'); map[en.target.id].setAttribute('aria-current', 'true');
        }
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    Object.keys(map).forEach(function (id) { sio.observe(document.getElementById(id)); });
  }

  /* ---------- 연도 ---------- */
  $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
