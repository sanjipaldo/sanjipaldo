/* =========================================================
   DOOGO GROUP — site.js (모든 페이지 공통)
   헤더 상태 · 드롭다운/메가메뉴 · 모바일 메뉴 · 스크롤 등장 · 숫자 카운트
   · 그룹 영상 모달 · 배경 영상 자동재생 처리 · 패밀리 사이트 · 토스트
   ========================================================= */
(function () {
  'use strict';
  var doc = document.documentElement;
  doc.classList.add('js');
  /* 움직임 정책(두고 사이트 공통): OS의 '애니메이션 줄이기' 설정과 관계없이 모션·영상은 재생합니다.
     대신 화면 왼쪽 아래 '움직임 멈추기' 버튼으로 모두 멈출 수 있고, 선택은 이 브라우저에 기억됩니다(localStorage).
     OS 설정이 켜져 있으면 html.soft-motion 만 붙여, 페이지에서 패럴랙스·기울기 같은 큰 움직임만 줄일 수 있게 합니다.
     페이지 스크립트는 window.DOOGO.motionOff() 로 확인하고, 'doogo:motion' 이벤트(detail.off)로 전환을 받습니다. */
  var MOTION_KEY = 'doogo-motion-off';
  var motionOff = false;
  try { motionOff = window.localStorage.getItem(MOTION_KEY) === '1'; } catch (e) {}
  if (motionOff) doc.classList.add('motion-off');
  try { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) doc.classList.add('soft-motion'); } catch (e) {}
  window.DOOGO = window.DOOGO || {};
  window.DOOGO.motionOff = function () { return doc.classList.contains('motion-off'); };
  var reduceMotion = motionOff;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- 헤더: 스크롤 상태 ---------- */
  var header = $('[data-header-el]');
  var lastY = window.scrollY, turnY = lastY, dir = 0;
  function kbdFocusIn(el) { // 키보드 포커스(포커스 링이 보이는 상태)가 el 안에 있는지
    var a = document.activeElement;
    if (!a || !el.contains(a)) return false;
    try { return a.matches(':focus-visible'); } catch (e) { return true; }
  }
  function headerBusy() { // 메뉴가 열렸거나 헤더 안에 키보드 포커스가 있으면 숨기지 않음
    return header.classList.contains('is-mega') || header.classList.contains('is-menu') || doc.classList.contains('is-locked') || kbdFocusIn(header);
  }
  function onScroll() {
    var y = window.scrollY;
    if (!header) return;
    header.classList.toggle('is-scrolled', y > 24);
    // 방향이 바뀐 지점부터의 누적 이동량으로 판단 → 천천히 끌어올려도 헤더가 다시 나타남
    var d = y > lastY ? 1 : (y < lastY ? -1 : 0);
    if (d && d !== dir) { dir = d; turnY = lastY; }
    if (y < 480) header.classList.remove('is-hidden');
    else if (dir > 0 && y - turnY > 8) { if (!headerBusy()) header.classList.add('is-hidden'); }
    else if (dir < 0 && turnY - y > 12) header.classList.remove('is-hidden');
    lastY = y;
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  // 숨은 헤더 안으로 키보드 포커스가 들어오면 다시 보여 줌
  if (header) header.addEventListener('focusin', function () { header.classList.remove('is-hidden'); });

  /* ---------- Tab 이동 중 표시 (base.css: html.is-tabbing 의 scroll-padding) ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Tab') doc.classList.add('is-tabbing');
    else if (!/^(Shift|Control|Alt|Meta)$/.test(e.key)) doc.classList.remove('is-tabbing');
  }, true);
  document.addEventListener('pointerdown', function () { doc.classList.remove('is-tabbing'); }, true);

  /* ---------- 현재 메뉴 표시 ---------- */
  var page = document.body.getAttribute('data-page') || '';
  var section = page.indexOf('business') === 0 ? 'business' : page;
  $$('.gnb > ul > li[data-nav]').forEach(function (li) {
    if (li.getAttribute('data-nav') === section) {
      var a = li.querySelector('.gnb-link');
      if (a) { a.classList.add('is-current'); a.setAttribute('aria-current', 'page'); }
    }
  });
  // 메가메뉴 · 모바일 메뉴: 지금 페이지와 주소(파일명)가 같은 링크에 표시, 모바일은 해당 그룹을 펼쳐 둠
  // (확장자 없는 주소 /about 으로 서빙돼도 맞도록 .html 은 떼고 비교)
  var file = (location.pathname.split('/').pop() || 'index').toLowerCase().replace(/\.html$/, '');
  $$('.mega a[href], #mnav .mnav-panel a[href]').forEach(function (a) {
    var h = (a.getAttribute('href') || '').toLowerCase().replace(/\.html$/, '');
    if (h === file) a.setAttribute('aria-current', 'page');
  });
  var curToggle = $('.mnav-toggle[aria-controls="mnav-' + section + '"]');
  if (curToggle) {
    var curPanel = document.getElementById(curToggle.getAttribute('aria-controls'));
    curToggle.setAttribute('aria-expanded', 'true');
    if (curPanel) curPanel.hidden = false;
    if (curToggle.parentElement) curToggle.parentElement.classList.add('is-current');
  }
  if (file === 'contact') $$('[data-nav-cta]').forEach(function (a) { a.setAttribute('aria-current', 'page'); });
  // 푸터 메인 카테고리: 지금 있는 대분류에 표시 (같은 파일이면 aria-current, 하위 페이지면 모양만)
  $$('.ft-nav a[data-nav]').forEach(function (a) {
    if (a.getAttribute('data-nav') !== section) return;
    a.classList.add('is-current');
    if ((a.getAttribute('href') || '').toLowerCase().replace(/\.html$/, '') === file) a.setAttribute('aria-current', 'page');
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
  // .mega 는 li.has-mega 안에 있어 마우스 진입·이탈은 위 li 처리로 함께 다룹니다
  var mega = $('.mega');
  if (mega) {
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
  // 메뉴가 열린 동안 뒤쪽 본문·푸터는 inert → 포커스가 메뉴(와 헤더) 안에서만 돕니다
  function setBackgroundInert(on) {
    Array.prototype.forEach.call(document.body.children, function (el) {
      if (el === header || el === mnav || el.id === 'toast' || /^(SCRIPT|svg)$/i.test(el.tagName)) return;
      if (on) { if (!el.inert) { el.inert = true; el.setAttribute('data-menu-inert', ''); } }
      else if (el.hasAttribute('data-menu-inert')) { el.inert = false; el.removeAttribute('data-menu-inert'); }
    });
  }
  function setMenu(open) {
    if (!mnav || !menuBtn) return;
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? '전체 메뉴 닫기' : '전체 메뉴 열기');
    if (open) {
      mnav.hidden = false;
      requestAnimationFrame(function () { mnav.classList.add('is-open'); });
      header.classList.add('is-menu');
      header.classList.remove('is-hidden');
      doc.classList.add('is-locked');
      setBackgroundInert(true);
    } else {
      mnav.classList.remove('is-open');
      header.classList.remove('is-menu');
      doc.classList.remove('is-locked');
      setBackgroundInert(false);
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
  if ('IntersectionObserver' in window && !window.DOOGO.motionOff()) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-in'); });
  }
  // Tab 으로 화면 아래 가장자리의 요소에 포커스가 가면 관찰 영역 밖이라도 바로 드러냄
  document.addEventListener('focusin', function (e) {
    for (var n = e.target; n && n.nodeType === 1 && n !== document.body; n = n.parentElement) {
      if (n.hasAttribute('data-reveal') || n.hasAttribute('data-lines')) n.classList.add('is-in');
    }
  });

  /* ---------- 숫자 카운트: <span data-count="7" data-suffix="개"> ---------- */
  function runCount(el) {
    var target = parseFloat(el.getAttribute('data-count')) || 0;
    var suffix = el.getAttribute('data-suffix') || '';
    var dur = 1400, start = null;
    if (window.DOOGO.motionOff()) { el.textContent = target + suffix; return; }
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
     페이지가 열리면 바로 무음 자동재생합니다(화면 밖이면 잠시 멈춤).
     브라우저·앱이 자동재생을 막으면(.is-autoplay-blocked) 화면을 처음 터치·클릭하는 순간 바로 재생합니다. */
  var bgVideos = $$('video[data-autoplay]');
  function videoWrap(v) { return v.closest('[data-video-wrap]') || v.parentElement; }
  function inView(v) { var r = v.getBoundingClientRect(); return r.bottom > 0 && r.top < (window.innerHeight || doc.clientHeight) && r.width > 0; }
  var blockedVideos = [], gestureArmed = false;
  var GESTURES = ['pointerdown', 'touchstart', 'keydown', 'click'];
  function onFirstGesture() {
    gestureArmed = false;
    GESTURES.forEach(function (t) { document.removeEventListener(t, onFirstGesture, true); });
    var list = blockedVideos.slice(); blockedVideos.length = 0;
    list.forEach(function (v) { if (inView(v)) tryPlay(v); });
  }
  function armGesture() {
    if (gestureArmed) return; gestureArmed = true;
    GESTURES.forEach(function (t) { document.addEventListener(t, onFirstGesture, { capture: true, passive: true }); });
  }
  function tryPlay(v) {
    if (window.DOOGO.motionOff() || v.dataset.userPaused === '1') return;
    v.muted = true;
    var p = v.play();
    // 자동재생이 막힌 경우(NotAllowedError)만 '막힘'으로 표시하고 첫 터치를 기다립니다.
    // 로딩 중 화면 밖으로 나가 pause()된 경우(AbortError)는 무시합니다.
    if (p && p.catch) p.catch(function (err) {
      if (err && err.name === 'NotAllowedError') {
        videoWrap(v).classList.add('is-autoplay-blocked');
        if (blockedVideos.indexOf(v) < 0) blockedVideos.push(v);
        armGesture();
      }
    });
  }
  bgVideos.forEach(function (v) {
    v.muted = true; v.defaultMuted = true;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    if (!window.DOOGO.motionOff()) v.setAttribute('autoplay', '');
    v.addEventListener('playing', function () { videoWrap(v).classList.remove('is-autoplay-blocked'); });
  });
  if ('IntersectionObserver' in window) {
    var vio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var v = en.target;
        if (en.isIntersecting) {
          if (v.preload === 'none') v.preload = 'auto';
          tryPlay(v);
        } else if (!v.paused) v.pause();
      });
    }, { threshold: 0.15 });
    bgVideos.forEach(function (v) { vio.observe(v); });
  }
  // 첫 화면에 보이는 영상은 관찰을 기다리지 않고 바로 시작
  bgVideos.forEach(function (v) { if (inView(v)) tryPlay(v); });
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
    // 모바일 메뉴 안에서 열었으면 메뉴는 닫히므로, 닫을 때 메뉴 버튼으로 돌아갑니다
    if (lastFocus && mnav && mnav.contains(lastFocus)) lastFocus = menuBtn;
    if (film && !film.getAttribute('poster') && film.dataset.filmPoster) film.setAttribute('poster', film.dataset.filmPoster);
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
    if (lastFocus && (!lastFocus.isConnected || lastFocus.getClientRects().length === 0)) lastFocus = (menuBtn && menuBtn.getClientRects().length) ? menuBtn : null;
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

  /* ---------- 서브 내비(페이지 안 앵커) 현재 위치 표시 ----------
     .subnav 또는 [data-scrollspy] 안의 #앵커 링크. 가로로 넘치는 목록이면 현재 항목이 보이도록 밀어 줍니다. */
  function revealInBar(a) {
    var bar = a.closest('ul, ol');
    if (!bar || bar.scrollWidth <= bar.clientWidth + 1) return;
    var br = bar.getBoundingClientRect(), ar = a.getBoundingClientRect();
    if (ar.left >= br.left + 8 && ar.right <= br.right - 8) return;
    var left = Math.max(0, bar.scrollLeft + (ar.left - br.left) - 16);
    try { bar.scrollTo({ left: left, behavior: reduceMotion ? 'auto' : 'smooth' }); } catch (e) { bar.scrollLeft = left; }
  }
  var subLinks = $$('.subnav a[href^="#"], [data-scrollspy] a[href^="#"]');
  if (subLinks.length && 'IntersectionObserver' in window) {
    var map = {};
    subLinks.forEach(function (a) { var t = $(a.getAttribute('href')); if (t) map[t.id] = a; });
    var sio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && map[en.target.id]) {
          subLinks.forEach(function (a) { a.classList.remove('is-active'); a.removeAttribute('aria-current'); });
          map[en.target.id].classList.add('is-active'); map[en.target.id].setAttribute('aria-current', 'true');
          revealInBar(map[en.target.id]);
        }
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    Object.keys(map).forEach(function (id) { sio.observe(document.getElementById(id)); });
  }

  // 서브 내비가 가로로 넘치면 끝 흐림 표시 (base.css: .is-scrollable / .is-start / .is-end)
  $$('.subnav ul, .subnav ol').forEach(function (bar) {
    function edge() {
      var max = bar.scrollWidth - bar.clientWidth;
      bar.classList.toggle('is-scrollable', max > 2);
      bar.classList.toggle('is-start', bar.scrollLeft <= 2);
      bar.classList.toggle('is-end', bar.scrollLeft >= max - 2);
    }
    bar.addEventListener('scroll', edge, { passive: true });
    window.addEventListener('resize', edge);
    window.addEventListener('load', edge);
    edge();
  });

  /* ---------- 하단 CTA 띠 배경: 가까워질 때만 불러오기 ---------- */
  var bands = $$('.cta-band');
  if (bands.length && 'IntersectionObserver' in window) {
    var bio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-near'); bio.unobserve(en.target); } });
    }, { rootMargin: '900px 0px' });
    bands.forEach(function (b) { bio.observe(b); });
  } else bands.forEach(function (b) { b.classList.add('is-near'); });

  /* ---------- 맨 위로 (푸터): JS가 없으면 #main 으로 이동 ---------- */
  $$('[data-to-top]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      // 움직임 줄이기 설정이면 base.css 가 scroll-behavior 를 끄므로 'auto' 는 바로 이동합니다
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      var logo = $('.hd-logo');
      if (logo) { try { logo.focus({ preventScroll: true }); } catch (err) { logo.focus(); } }
    });
  });

  /* ---------- 움직임 멈추기 버튼 (왼쪽 아래) ---------- */
  (function () {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'motion-toggle';
    function sync() {
      var off = window.DOOGO.motionOff();
      b.setAttribute('aria-pressed', String(off));
      b.innerHTML = '<span class="mt-ico" aria-hidden="true"></span><span class="mt-txt">' + (off ? '움직임 켜기' : '움직임 멈추기') + '</span>';
    }
    b.addEventListener('click', function () {
      var off = !window.DOOGO.motionOff();
      doc.classList.toggle('motion-off', off);
      try { window.localStorage.setItem(MOTION_KEY, off ? '1' : '0'); } catch (e) {}
      if (off) {
        bgVideos.forEach(function (v) { v.pause(); });
        revealEls.forEach(function (el) { el.classList.add('is-in'); });
      } else {
        bgVideos.forEach(function (v) { if (v.dataset.userPaused !== '1') { v.setAttribute('autoplay', ''); if (inView(v)) tryPlay(v); } });
      }
      sync();
      try { document.dispatchEvent(new CustomEvent('doogo:motion', { detail: { off: off } })); } catch (e) {}
    });
    sync();
    document.body.appendChild(b);
  })();

  /* ---------- 연도 ---------- */
  $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
