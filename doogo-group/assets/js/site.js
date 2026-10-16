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
  // 메가메뉴 · 모바일 메뉴: 지금 페이지와 주소(파일명)가 같은 링크에 표시
  // (확장자 없는 주소 /about 으로 서빙돼도 맞도록 .html 은 떼고 비교)
  var file = (location.pathname.split('/').pop() || 'index').toLowerCase().replace(/\.html$/, '');
  $$('.mega a[href], #mnav a[href]').forEach(function (a) {
    var h = (a.getAttribute('href') || '').toLowerCase().replace(/\.html$/, '');
    if (h === file) a.setAttribute('aria-current', 'page');
  });
  // 모바일 대메뉴: 하위 페이지(예: 사업 상세)에 있어도 속한 대분류를 모양으로 표시
  $$('#mnav .mnav-link[data-nav]').forEach(function (a) {
    if (a.getAttribute('data-nav') === section) a.classList.add('is-current');
  });
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
      mnav.scrollTop = 0;
      // 보이는 상태(닫힌 모양)를 한 번 계산해 둔 뒤 is-open 을 붙여야 줄마다 차례로 올라오는 등장이 처음부터 재생됩니다
      void mnav.offsetWidth;
      mnav.classList.add('is-open');
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
  if (mnav) {
    mnav.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && mnav.classList.contains('is-open')) { setMenu(false); menuBtn.focus(); } });
    window.addEventListener('resize', function () { if (window.innerWidth > 1024 && mnav.classList.contains('is-open')) setMenu(false); });
  }

  /* ---------- 글자 새김 (23차 · 전 페이지 공용) ----------
     메인 인트로 문장('두고그룹은 제품을 만들고…')의 모션을 같은 크기의 큰 글씨에 똑같이 줍니다.
     대상: [data-engrave] + 섹션 제목(.h2) · 사업 마무리 배너 제목 · 상세 '운영 사이트' · 상세 문의 제목 · FAQ 마무리 제목 · 사업영역 사진 위 문장
     · 원문은 sr-only 로 한 번만 읽히고, 화면용 글자 조각(span.eg-c)은 aria-hidden
     · 단어(span.eg-w)는 줄바꿈되지 않게 묶음 · 줄(.line)은 블록(span.eg-line) · <br> 그대로 · .en / .nowrap / .accent 같은 span 은 같은 class 로 다시 감쌈
     · [data-accent] 는 한 덩어리(span.eg-accent) — 다 새겨지면 블루로 바뀌고 밑줄이 그려짐
     · 화면에 30% 들어오면 글자마다 --ci × 26ms 지연으로 흐림→선명 · 아래→제자리 · 투명→글자색, 화면 밖으로 완전히 나가면 처음 상태로(다시 들어올 때 다시 새김)
     · 줄 마스크 등장(data-lines) · 떠오르기(data-reveal)를 쓰던 제목은 그 속성을 떼고 새김으로 바꿈
     · 안에 링크 · 버튼이 있는 제목, 법적 고지 창 안, data-engrave="off" 는 건너뜀 */
  var EG_STEP = 26; // 글자당 지연(ms)
  var EG_AUTO = '.h2, .cbx-biz-title, .dt-ask-title, .dt-web-title, .fq-cta-t, .bz-media-quote';
  var egItems = [];
  function egSplit(el) {
    if (el.classList.contains('is-split') || el.getAttribute('data-engrave') === 'off') return;
    if (el.closest('.legal-modal-body, template') || el.querySelector('a, button, input, select, textarea, img')) return;
    var vis = document.createElement('span');
    vis.className = 'eg';
    vis.setAttribute('aria-hidden', 'true');
    var chars = [], accents = [], said = '';
    function gap() { if (said && !/\s$/.test(said)) said += ' '; }
    function build(node, target, accent) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          said += n.textContent;
          n.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { target.appendChild(document.createTextNode(' ')); return; }
            var w = document.createElement('span');
            w.className = 'eg-w';
            Array.from(part).forEach(function (ch) {
              var c = document.createElement('span');
              c.className = 'eg-c';
              c.textContent = ch;
              w.appendChild(c); chars.push(c);
              if (accent) accents.push(c);
            });
            target.appendChild(w);
          });
        } else if (n.nodeName === 'BR') {
          gap();
          target.appendChild(n.cloneNode(false));
        } else if (n.nodeType === 1) {
          if (n.classList.contains('sr-only')) { said += n.textContent; return; }
          if (n.getAttribute('aria-hidden') === 'true') { target.appendChild(n.cloneNode(true)); return; }
          var box;
          if (n.hasAttribute('data-accent')) {
            box = document.createElement('span');
            box.className = 'eg-accent';
            target.appendChild(box);
            build(n, box, true);
          } else if (n.classList.contains('line')) {
            gap();
            box = document.createElement('span');
            box.className = 'eg-line';
            target.appendChild(box);
            build(n, box, accent);
            gap();
          } else {
            box = document.createElement(/^(B|STRONG|EM|I|SMALL|SUP|SUB|MARK)$/.test(n.nodeName) ? n.nodeName.toLowerCase() : 'span');
            if (n.className) box.className = n.className;
            if (n.hasAttribute('lang')) box.setAttribute('lang', n.getAttribute('lang'));
            target.appendChild(box);
            build(n, box, accent);
          }
        }
      });
    }
    build(el, vis, false);
    if (!chars.length) return;
    var sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = said.replace(/\s+/g, ' ').trim();
    el.textContent = '';
    el.appendChild(sr);
    el.appendChild(vis);
    chars.forEach(function (c, i) { c.style.setProperty('--ci', i); });
    accents.forEach(function (c, i) { c.style.setProperty('--ai', i); });
    el.removeAttribute('data-lines');
    el.removeAttribute('data-reveal');
    var auto = !el.hasAttribute('data-engrave');
    if (auto) el.setAttribute('data-engrave', 'auto');
    el.classList.add('is-split');
    // 24차: 직접 지정한 문장([data-engrave] — 메인 인트로 · 마무리 배너 슬로건 · 회사 소개 문장)은 글자가 적어도 새기는 데 1.7초쯤 걸리게(글자당 26–48ms)
    var step = auto ? EG_STEP : Math.round(Math.max(EG_STEP, Math.min(48, 1700 / chars.length)));
    if (step !== EG_STEP) el.style.setProperty('--eg-step', step + 'ms');
    var accentT = 0, doneT = 0, total = chars.length * step + 700; // 마지막 글자가 자리 잡을 무렵 강조 시작
    el._eg = {
      play: function () {
        if (el.classList.contains('is-on')) return;
        el.classList.add('is-on');
        clearTimeout(accentT);
        if (window.DOOGO.motionOff()) { el.classList.add('is-accent', 'is-done'); return; }
        // .is-done: 다 새겨진 뒤 — 뒤따르는 문장(예: 메인 마무리 배너의 한글 문구)이 이때 나타남 (24차)
        if (accents.length) accentT = setTimeout(function () { el.classList.add('is-accent'); }, total);
        doneT = setTimeout(function () { el.classList.add('is-done'); }, total + 200);
      },
      finish: function () { clearTimeout(accentT); clearTimeout(doneT); el.classList.add('is-on', 'is-accent', 'is-done'); },
      reset: function () {
        if (!el.classList.contains('is-on')) return;
        clearTimeout(accentT); clearTimeout(doneT);
        el.classList.add('no-tr');
        el.classList.remove('is-on', 'is-accent', 'is-done');
        void el.offsetWidth;
        el.classList.remove('no-tr');
      }
    };
    egItems.push(el);
  }
  $$('[data-engrave]').forEach(egSplit);
  $$(EG_AUTO).forEach(egSplit);
  if (egItems.length) {
    if (!('IntersectionObserver' in window)) egItems.forEach(function (el) { el._eg.finish(); });
    else {
      // 24차: 화면에 살짝 걸쳤을 때가 아니라 충분히 들어왔을 때 새김 — 화면 아래 20%를 뺀 영역에 75% 이상(키 큰 문장은 화면 절반 이상) 들어오면 시작,
      // 화면 밖으로 완전히 나가면 처음 상태로(다시 들어올 때 다시 새김)
      var egIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var g = en.target._eg;
          if (window.DOOGO.motionOff()) { g.finish(); return; }
          if (!en.isIntersecting) return;
          var rootH = en.rootBounds ? en.rootBounds.height : window.innerHeight;
          var need = Math.min(0.75, rootH * 0.5 / Math.max(1, en.boundingClientRect.height));
          if (en.intersectionRatio >= need - 0.001) g.play();
        });
      }, { rootMargin: '0px 0px -20% 0px', threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.75] });
      var egOut = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (!en.isIntersecting && !window.DOOGO.motionOff()) en.target._eg.reset(); });
      }, { threshold: 0 });
      egItems.forEach(function (el) { egIO.observe(el); egOut.observe(el); });
    }
    document.addEventListener('doogo:motion', function (e) {
      var off = !!(e.detail && e.detail.off);
      egItems.forEach(function (el) {
        if (off) { el._eg.finish(); return; }
        // 다시 켰을 때 화면 밖이면 처음 상태로 → 들어올 때 다시 새김
        var r = el.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= window.innerHeight) el._eg.reset();
      });
    });
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

  /* ---------- 21차: 페이지 안 메뉴 꾸밈 ----------
     두고그룹 · 브랜드와 성과 탭(.subnav [role=tab]), 사업 상세 바로가기(.subnav #앵커), 그룹소식 분류 탭(.nw-tabs)을
     '이 페이지에 더 볼 메뉴가 있다'가 보이는 메뉴로 꾸밉니다 (생김새: base.css 21차).
     · 왼쪽 안내 'IN THIS PAGE · 05개 메뉴' · 탭마다 번호 01… (소식 분류는 글 개수)
     · 아직 열지 않은 메뉴에 작은 점 — 한 번 열면 사라짐 · 오른쪽 '다음 메뉴 → 이름' · 아래 진행 막대
     탭을 고르는 동작은 각 페이지 스크립트(about.js · brands.js · news.js)와 위 위치 표시가 맡고,
     여기서는 선택 상태(aria-selected · .is-active · aria-current)를 지켜보기만 합니다. 페이지 스크립트보다 먼저 실행되어
     번호를 붙인 뒤의 탭 크기로 알약 위치를 잽니다. */
  (function () {
    var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
    var isOn = function (el) { return el.classList.contains('is-active') || el.getAttribute('aria-current') === 'true' || el.getAttribute('aria-selected') === 'true'; };
    var arrow = '<svg class="ico" aria-hidden="true"><use href="#i-arrow"/></svg>';
    function label(kicker, n, unit) {
      var p = document.createElement('p');
      p.className = 'sn-label';
      p.setAttribute('aria-hidden', 'true');
      p.innerHTML = '<span class="sn-label-k">' + kicker + '</span><span class="sn-label-n"><b>' + pad2(n) + '</b>' + unit + '</span>';
      return p;
    }
    function play(root) {
      if (window.DOOGO.motionOff() || !('IntersectionObserver' in window)) { root.classList.add('sn-in'); return; }
      var io = new IntersectionObserver(function (en) {
        if (!en[0].isIntersecting) return;
        io.disconnect();
        requestAnimationFrame(function () { root.classList.add('sn-in'); });
      });
      io.observe(root);
    }

    // 1) .subnav (탭 또는 앵커 바로가기)
    $$('.subnav').forEach(function (bar) {
      var list = $('ul, ol', bar);
      // 24차: 개인정보처리방침의 세로 목차(.pv-toc)는 자체 디자인이 있어 탭 메뉴 꾸밈을 하지 않음 (번호 겹침 · 글자 세로 줄바꿈 방지)
      if (!list || bar.classList.contains('sn-ready') || bar.classList.contains('pv-toc')) return;
      var links = $$('a', list);
      var n = links.length;
      if (n < 2) return;
      var names = links.map(function (a) { return a.textContent.replace(/\s+/g, ' ').trim(); });
      links.forEach(function (a, i) {
        var num = document.createElement('span');
        num.className = 'sn-num'; num.setAttribute('aria-hidden', 'true'); num.textContent = pad2(i + 1);
        a.insertBefore(num, a.firstChild);
        var dot = document.createElement('i');
        dot.className = 'sn-dot'; dot.setAttribute('aria-hidden', 'true');
        a.appendChild(dot);
        var li = a.closest('li');
        if (li) { li.classList.add('sn-item'); li.style.setProperty('--k', i); }
      });
      var box = list.parentNode;
      box.insertBefore(label('In this page', n, '개 메뉴'), list);
      var next = document.createElement('button');
      next.type = 'button'; next.className = 'sn-next';
      next.innerHTML = '<span class="sn-next-tx"><span class="sn-next-k">다음 메뉴</span><span class="sn-next-t"></span></span><span class="sn-next-ar">' + arrow + '</span>';
      box.appendChild(next);
      var prog = document.createElement('span');
      prog.className = 'sn-prog'; prog.setAttribute('aria-hidden', 'true'); prog.innerHTML = '<i></i>';
      bar.appendChild(prog);
      var nextT = $('.sn-next-t', next);

      var cur = -2, raf = 0;
      function sync() {
        raf = 0;
        var i = -1;
        links.forEach(function (a, k) { if (i < 0 && isOn(a)) i = k; });
        if (i >= 0 && !links[i].classList.contains('is-seen')) links[i].classList.add('is-seen');
        if (i === cur) return;
        cur = i;
        var to = (i + 1) % n, last = i === n - 1;
        nextT.textContent = names[to];
        $('.sn-next-k', next).textContent = last ? '처음으로' : '다음 메뉴';
        next.setAttribute('aria-label', (last ? '처음 메뉴로: ' : '다음 메뉴: ') + names[to]);
        bar.style.setProperty('--p', i < 0 ? '0' : ((i + 1) / n).toFixed(4));
      }
      var queue = function () { if (!raf) raf = requestAnimationFrame(sync); };
      new MutationObserver(queue).observe(list, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-selected', 'aria-current'] });
      next.addEventListener('click', function () {
        var to = links[(cur + 1 + n) % n];
        if (cur < 0) to = links[0];
        to.click();
        if (to.getAttribute('role') === 'tab') { try { to.focus({ preventScroll: true }); } catch (e) { to.focus(); } }
      });
      bar.classList.add('sn-ready');
      sync();
      play(bar);
    });

    // 2) 그룹소식 분류 탭: 번호 대신 분류별 글 개수 · 왼쪽 안내
    var nw = $('.nw-tabs');
    if (nw && !nw.classList.contains('sn-ready')) {
      var items = $$('.nw-item[data-cat]');
      var tabs = $$('.nw-tab[data-cat]', nw);
      tabs.forEach(function (t, i) {
        var cat = t.getAttribute('data-cat');
        var c = cat === 'all' ? items.length : items.filter(function (it) { return it.getAttribute('data-cat') === cat; }).length;
        if (items.length) {
          var b = document.createElement('span');
          b.className = 'sn-cnt'; b.setAttribute('aria-hidden', 'true'); b.textContent = c;
          t.appendChild(b);
          var sr = document.createElement('span');
          sr.className = 'sr-only'; sr.textContent = ' (' + c + '건)';
          t.appendChild(sr);
        }
        t.classList.add('sn-item'); t.style.setProperty('--k', i);
      });
      var row = nw.parentNode;
      if (row) row.insertBefore(label('Newsroom', tabs.length, '개 분류'), nw);
      nw.classList.add('sn-ready');
      play(nw);
      if (row) { row.classList.add('sn-ready'); play(row); }
    }
  })();

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

  /* ---------- 법적 고지 팝업 (푸터 '개인정보처리방침'·'이메일무단수집거부') ----------
     링크 주소의 문서를 불러와 본문(.pv-body / .em-body)만 팝업에 넣습니다. 실패하면 원래 페이지로 이동. */
  (function () {
    var links = $$('a[data-legal-modal]');
    if (!links.length || !window.fetch || !window.DOMParser) return;
    var modal, body, title, foot, lastFocus, cache = {};
    function build() {
      modal = document.createElement('div');
      modal.className = 'legal-modal'; modal.hidden = true;
      modal.innerHTML = '<div class="legal-modal-dim" data-legal-close></div>' +
        '<div class="legal-modal-box" role="dialog" aria-modal="true" aria-labelledby="legal-modal-t">' +
        '<div class="legal-modal-head"><h2 id="legal-modal-t"></h2>' +
        '<button class="legal-modal-x" type="button" data-legal-close aria-label="닫기"><svg aria-hidden="true"><use href="#i-close"/></svg></button></div>' +
        '<div class="legal-modal-body" tabindex="0"></div><div class="legal-modal-foot"></div></div>';
      document.body.appendChild(modal);
      body = $('.legal-modal-body', modal); title = $('#legal-modal-t', modal); foot = $('.legal-modal-foot', modal);
      modal.addEventListener('click', function (e) { if (e.target.closest('[data-legal-close]')) close(); });
      modal.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { close(); return; }
        if (e.key !== 'Tab') return;
        var f = $$('a[href], button, [tabindex="0"]', modal).filter(function (el) { return el.offsetParent !== null; });
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      });
    }
    function close() {
      if (!modal || modal.hidden) return;
      modal.hidden = true; doc.classList.remove('legal-open');
      if (lastFocus) lastFocus.focus();
    }
    function open(a, html) {
      var d = new DOMParser().parseFromString(html, 'text/html');
      var main = d.querySelector('.pv-body, .em-body, article');
      if (!main) return false;
      $$('script, .pv-toc, .pv-glance, .em-mark, .em-k, .em-related, svg, [aria-hidden="true"]', main).forEach(function (n) { n.remove(); });
      $$('[id]', main).forEach(function (n) { n.removeAttribute('id'); });
      $$('a[href^="#"]', main).forEach(function (n) { n.setAttribute('href', a.getAttribute('href') + n.getAttribute('href')); });
      var h1 = d.querySelector('h1');
      title.textContent = (h1 ? h1.textContent : a.textContent).replace(/\s+/g, ' ').trim();
      body.innerHTML = main.innerHTML;
      foot.innerHTML = '<a href="' + a.getAttribute('href') + '">전체 페이지로 보기 →</a>';
      lastFocus = a; modal.hidden = false; doc.classList.add('legal-open');
      body.scrollTop = 0; $('.legal-modal-x', modal).focus();
      return true;
    }
    links.forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        if (!modal) build();
        var url = a.getAttribute('href');
        var go = function () { location.href = url; };
        if (cache[url]) { if (!open(a, cache[url])) go(); return; }
        fetch(url).then(function (r) { if (!r.ok) throw 0; return r.text(); })
          .then(function (t) { cache[url] = t; if (!open(a, t)) go(); })
          .catch(go);
      });
    });
  })();

  /* ---------- 다른 페이지로 넘어오면 늘 맨 위에서 시작 (주소에 #앵커가 없을 때) ---------- */
  if (!location.hash) {
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) {}
    var toTop = function () {
      window.scrollTo(0, 0);
      /* 미리보기 앱처럼 바깥 화면이 대신 스크롤되는 환경에서도 맨 위가 보이도록 */
      try { doc.scrollIntoView({ block: 'start', inline: 'nearest' }); } catch (e) {}
    };
    toTop();
    /* 미리보기 앱은 페이지를 연 뒤 이전 페이지의 스크롤 위치를 다시 넣는 경우가 있어(→ 짧은 페이지는 푸터가 보임),
       사용자가 아직 화면을 만지지 않았다면 열린 뒤 약 2.5초 동안 생기는 스크롤은 맨 위로 되돌립니다. */
    var guardUntil = Date.now() + 2500;
    var touched = function () { window.__userScrolled = true; };
    ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(function (t) {
      window.addEventListener(t, touched, { once: true, passive: true });
    });
    var guard = function () {
      if (window.__userScrolled || Date.now() > guardUntil) { window.removeEventListener('scroll', guard); return; }
      if (window.scrollY > 0) window.scrollTo(0, 0);
    };
    window.addEventListener('scroll', guard, { passive: true });
    window.addEventListener('load', function () {
      guardUntil = Math.max(guardUntil, Date.now() + 1500);
      if (!window.__userScrolled) toTop();
      [120, 400, 900].forEach(function (ms) { setTimeout(function () { if (!window.__userScrolled && window.scrollY > 0) window.scrollTo(0, 0); }, ms); });
    });
    window.addEventListener('pageshow', function (e) { if (e.persisted && !window.__userScrolled) toTop(); });
  }

  /* ---------- 연도 ---------- */
  $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
