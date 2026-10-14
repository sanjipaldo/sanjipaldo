/* =========================================================
   DOOGO GROUP — brands.js (브랜드와 성과)
   브랜드 3D 카드(포인터를 따라 떠오름) · 프로젝트 분야 필터(FLIP 재배치) · 성장 사례 카드 쌓임 효과
   ========================================================= */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- 브랜드 3D 카드: 포인터를 따라 오브젝트가 살짝 기울며 떠오름 ----------
     마우스(정밀 포인터)에서만, 움직임 줄이기 설정이면 동작하지 않습니다. CSS 변수 --mx/--my(-1~1)만 바꾸고
     실제 움직임은 CSS transform 전환(.9s)으로 부드럽게 따라갑니다. */
  if (!reduce && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    $$('.bn-card:not(.bn-card--chain)').forEach(function (card) {
      var media = $('.bn-card-media', card);
      if (!media) return;
      var raf = 0, nx = 0, ny = 0;
      function apply() { raf = 0; card.style.setProperty('--mx', nx.toFixed(3)); card.style.setProperty('--my', ny.toFixed(3)); }
      card.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse') return;
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
  function ctaLayout(n) { // 문의 카드 앞에 n장이 보일 때 문의 카드의 칸 수와 넓은 모양 여부
    var cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
    var rest = cols - (n % cols);
    return { col: rest >= cols ? '1 / -1' : 'span ' + rest, wide: cols > 1 && rest > 1 };
  }
  function fitCta() {
    if (!grid || !cta) return;
    var L = ctaLayout(cards.filter(function (c) { return !c.hidden && c !== cta; }).length);
    cta.style.gridColumn = L.col;
    cta.classList.toggle('is-wide', L.wide);
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

    // 문의 카드의 모양(칸 수 · 넓은 모양)이 바뀔 차례면, 다른 카드가 빠지는 동안 함께 흐려졌다가
    // 새 자리에서 다시 나타나게 합니다 (FLIP 이동 대신 — 크기가 달라져 미끄러지면 어색하므로)
    var morph = false;
    if (cta) {
      var next = ctaLayout(cards.filter(function (c) { return c !== cta && matches(c, cat); }).length);
      morph = !reduce && (next.col !== cta.style.gridColumn || next.wide !== cta.classList.contains('is-wide'));
      cta.classList.toggle('is-morph', morph);
    }

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
        if (morph && c === cta) return;
        var f = first.get(c), l = c.getBoundingClientRect();
        var dx = f.left - l.left, dy = f.top - l.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        c.style.transition = 'none';
        c.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      });
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          staying.forEach(function (c) { c.style.transition = ''; c.style.transform = ''; });
          if (cta) cta.classList.remove('is-morph');
        });
      });
      finish(cat);
    }, (leaving.length || morph) ? 240 : 0);
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

  /* ---------- 성장 사례: 쌓이는 카드 (데스크톱) ---------- */
  var cases = $$('.bn-case');
  var stackMq = window.matchMedia('(min-width: 1025px) and (min-height: 760px)');
  var ticking = false;
  function updateStack() {
    ticking = false;
    if (reduce || !stackMq.matches) {
      cases.forEach(function (c) { c.style.removeProperty('--sc'); c.style.removeProperty('--dim'); });
      return;
    }
    cases.forEach(function (c, i) {
      var next = cases[i + 1];
      if (!next) return;
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
    updateStack();
  }

})();
