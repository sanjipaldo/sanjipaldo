/* =========================================================
   DOOGO GROUP — brands.js (브랜드와 성과)
   프로젝트 분야 필터(FLIP 재배치) · 성장 사례 카드 쌓임 효과
   ========================================================= */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- 프로젝트 필터 ---------- */
  var chips = $$('[data-filter]');
  var cards = $$('#bn-projs .bn-proj');
  var empty = $('#bn-projs-empty');
  var status = $('#bn-filter-status');
  var resetBtn = $('[data-filter-reset]');
  var busy = null;

  function matches(card, cat) {
    if (card.getAttribute('data-cat') === '*') return true; // 문의 카드는 늘 표시
    return cat === 'all' || (card.getAttribute('data-cat') || '').split(/\s+/).indexOf(cat) > -1;
  }
  function labelOf(cat) {
    var c = chips.filter(function (b) { return b.getAttribute('data-filter') === cat; })[0];
    return c ? c.textContent.trim() : '';
  }
  // 문의 카드가 마지막 줄의 남은 칸을 모두 채우도록
  var grid = $('#bn-projs');
  var cta = $('.bn-proj--cta', grid);
  function fitCta() {
    if (!grid || !cta) return;
    var cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
    var n = cards.filter(function (c) { return !c.hidden && c !== cta; }).length;
    var rest = cols - (n % cols);
    cta.style.gridColumn = rest >= cols ? '1 / -1' : 'span ' + rest;
    cta.classList.toggle('is-wide', cols > 1 && rest > 1);
  }

  function finish(cat) {
    fitCta();
    var shown = cards.filter(function (c) { return !c.hidden && c.getAttribute('data-cat') !== '*'; }).length;
    if (empty) empty.hidden = shown > 0;
    if (status) status.textContent = (cat === 'all' ? '전체' : labelOf(cat)) + ' 분야 프로젝트 ' + shown + '개를 보여 줍니다.';
  }

  function applyFilter(cat) {
    chips.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-filter') === cat)); });
    if (busy) { clearTimeout(busy); busy = null; }
    cards.forEach(function (c) { c.classList.remove('is-leaving', 'is-entering'); c.style.transform = ''; c.style.transition = ''; });

    var leaving = cards.filter(function (c) { return !c.hidden && !matches(c, cat); });
    var entering = cards.filter(function (c) { return c.hidden && matches(c, cat); });
    var staying = cards.filter(function (c) { return !c.hidden && matches(c, cat); });

    if (reduce) {
      cards.forEach(function (c) { c.hidden = !matches(c, cat); });
      finish(cat); return;
    }
    // First: 남는 카드의 현재 위치
    var first = new Map();
    staying.forEach(function (c) { first.set(c, c.getBoundingClientRect()); });

    leaving.forEach(function (c) { c.classList.add('is-leaving'); });
    busy = setTimeout(function () {
      busy = null;
      leaving.forEach(function (c) { c.hidden = true; c.classList.remove('is-leaving'); });
      entering.forEach(function (c) { c.hidden = false; });
      fitCta();
      entering.forEach(function (c, i) {
        c.hidden = false;
        c.style.setProperty('--stagger', (i * 0.06) + 's');
        c.classList.add('is-entering');
        c.addEventListener('animationend', function done() { c.classList.remove('is-entering'); c.removeEventListener('animationend', done); });
      });
      // Last + Invert: 남는 카드는 이전 자리에서 새 자리로 미끄러지듯 이동
      staying.forEach(function (c) {
        var f = first.get(c), l = c.getBoundingClientRect();
        var dx = f.left - l.left, dy = f.top - l.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        c.style.transition = 'none';
        c.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      });
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          staying.forEach(function (c) { c.style.transition = ''; c.style.transform = ''; });
        });
      });
      finish(cat);
    }, leaving.length ? 240 : 0);
  }

  chips.forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.getAttribute('aria-pressed') === 'true') return;
      applyFilter(b.getAttribute('data-filter'));
    });
  });
  if (resetBtn) resetBtn.addEventListener('click', function () { applyFilter('all'); });
  fitCta();
  var fitTimer;
  window.addEventListener('resize', function () { clearTimeout(fitTimer); fitTimer = setTimeout(fitCta, 120); });

  /* ---------- 성장 사례: 사업 장면 영상 ----------
     재생할 수 있는 형식이 없거나 움직임 줄이기 설정이면 내려받지 않고 포스터만 보여 줍니다.
     화면에 보일 때만 재생하고, 사용자가 정지한 영상은 다시 재생하지 않습니다. */
  var caseVids = $$('.bn-case video');
  var managed = [];
  function playable(v) {
    return $$('source', v).some(function (src) {
      var t = src.getAttribute('type');
      if (!t) return true;
      return v.canPlayType(t === 'video/mp4' ? 'video/mp4; codecs="avc1.42E01E"' : t) !== '';
    });
  }
  // 보이고(_inView) · 다음 카드에 덮이지 않았고(_covered) · 사용자가 멈추지 않았을 때만 재생
  function syncVid(v) {
    if (managed.indexOf(v) < 0) return;
    var go = v._inView && !v._covered && v.dataset.userPaused !== '1';
    if (go && v.paused) {
      if (v.preload === 'none') v.preload = 'auto';
      var p = v.play();
      if (p && p.catch) p.catch(function () { var w = v.closest('[data-video-wrap]'); if (w) w.classList.add('is-autoplay-blocked'); });
    } else if (!go && !v.paused) v.pause();
  }
  var vio = ('IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { en.target._inView = en.isIntersecting; syncVid(en.target); });
  }, { threshold: 0.35 }) : null;
  caseVids.forEach(function (v) {
    var wrap = v.closest('[data-video-wrap]');
    if (reduce || !vio || !playable(v)) { if (wrap) wrap.classList.add('is-reduced'); return; }
    v.muted = true;
    managed.push(v);
    vio.observe(v);
  });
  function setCovered(card, covered) {
    var v = $('video', card);
    if (!v || !!v._covered === covered) return;
    v._covered = covered;
    syncVid(v);
  }

  /* ---------- 성장 사례: 쌓이는 카드 (데스크톱) ---------- */
  var cases = $$('.bn-case');
  var stackMq = window.matchMedia('(min-width: 1025px) and (min-height: 760px)');
  var ticking = false;
  function updateStack() {
    ticking = false;
    if (reduce || !stackMq.matches) {
      cases.forEach(function (c) { c.style.removeProperty('--sc'); c.style.removeProperty('--dim'); setCovered(c, false); });
      return;
    }
    cases.forEach(function (c, i) {
      var next = cases[i + 1];
      if (!next) { setCovered(c, false); return; }
      var cr = c.getBoundingClientRect(), nr = next.getBoundingClientRect();
      var h = c.offsetHeight || 1;
      var p = Math.min(Math.max(1 - (nr.top - cr.top) / h, 0), 1);
      c.style.setProperty('--sc', (1 - p * 0.05).toFixed(4));
      c.style.setProperty('--dim', (p * 0.45).toFixed(3));
      setCovered(c, p > 0.6); // 다음 카드에 대부분 덮이면 영상 정지 (동시에 여러 개 디코딩하지 않도록)
    });
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(updateStack); } }
  if (cases.length > 1) {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    updateStack();
  }

})();
