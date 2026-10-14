/* =========================================================
   DOOGO GROUP — leadership.js (리더십)
   그룹 대표 사진 미세 모션 · 화면 밖 무한 모션 정지 · 자회사 대표 상세 (dialog: 열기/닫기 · 이전/다음 · Esc · 바깥 클릭)
   ========================================================= */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- 대표 사진: 마우스 위치에 따른 미세 이동 ---------- */
  var stage = $('[data-tilt]');
  if (stage && !reduce && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    var img = $('.ld-ceo-img', stage);
    var ring = $('.ld-ceo-ring', stage);
    stage.addEventListener('pointermove', function (e) {
      var r = stage.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      if (img) { img.style.setProperty('--ix', (x * 10).toFixed(1) + 'px'); img.style.setProperty('--iy', (y * 6).toFixed(1) + 'px'); }
      if (ring) { ring.style.setProperty('--rx', (x * -14).toFixed(1) + 'px'); ring.style.setProperty('--ry', (y * -10).toFixed(1) + 'px'); }
    });
    stage.addEventListener('pointerleave', function () {
      [img, ring].forEach(function (el) { if (el) { el.style.removeProperty('--ix'); el.style.removeProperty('--iy'); el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); } });
    });
  }

  /* ---------- 화면 밖이면 '문대표' 칩의 둥실 모션 정지 ---------- */
  var ceoFig = $('.ld-ceo-fig');
  if (ceoFig && !reduce && 'IntersectionObserver' in window) {
    ceoFig.classList.add('is-paused');
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { ceoFig.classList.toggle('is-paused', !en.isIntersecting); });
    }, { rootMargin: '80px 0px' }).observe(ceoFig);
  }

  /* ---------- 자회사 대표 상세 ----------
     카드의 data-* (이름 · 법인 · 구분 · 역할 · 연결 사업)만 옮겨 보여 줍니다. 이력은 '확정 후 게시'. */
  var modal = $('#ld-modal');
  var cards = $$('[data-leader]');
  if (!modal || !cards.length) return;
  if (typeof modal.showModal !== 'function') { // dialog 를 지원하지 않으면 상세 버튼을 숨김 (카드에 같은 사실이 모두 있음)
    $$('[data-leader-open]').forEach(function (b) { b.hidden = true; });
    return;
  }
  var html = document.documentElement;
  var inner = $('.ld-m-in', modal);
  var render = $('.ld-m-render', modal);
  var cur = 0, opener = null, swapTimer = null;
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };

  function fill(i) {
    var d = cards[i].dataset;
    var map = { name: d.name, mono: d.mono, co: d.co, coSub: d.coSub, type: d.type, role: d.role, area: d.area, idx: pad(i + 1) };
    Object.keys(map).forEach(function (k) { $$('[data-m="' + k + '"]', modal).forEach(function (el) { el.textContent = map[k]; }); });
    $$('[data-m-link]', modal).forEach(function (a) { a.setAttribute('href', d.href); });
    var c = $('[data-m-contact]', modal); if (c) c.setAttribute('href', 'contact.html?type=' + d.contact);
    if (render) { render.setAttribute('width', d.w || 671); render.src = d.img; }
    cur = i;
  }
  function show(i) { // 열린 상태에서 이전/다음
    i = (i + cards.length) % cards.length;
    if (reduce) { fill(i); return; }
    clearTimeout(swapTimer);
    inner.classList.add('is-swap');
    swapTimer = setTimeout(function () { fill(i); requestAnimationFrame(function () { inner.classList.remove('is-swap'); }); }, 200);
  }
  function open(i, btn) {
    opener = btn || null;
    fill(i);
    modal.classList.remove('is-closing');
    modal.showModal();
    html.classList.add('is-locked');
    var c = $('[data-m-close]', modal); if (c) c.focus();
  }
  function close() {
    if (!modal.open || modal.classList.contains('is-closing')) return;
    if (reduce) { modal.close(); return; }
    modal.classList.add('is-closing');
    setTimeout(function () { modal.classList.remove('is-closing'); modal.close(); }, 250);
  }

  cards.forEach(function (card, i) {
    var btn = $('[data-leader-open]', card);
    if (btn) btn.addEventListener('click', function () { open(i, btn); });
  });
  modal.addEventListener('close', function () {
    html.classList.remove('is-locked');
    if (opener && opener.focus) opener.focus();
  });
  modal.addEventListener('cancel', function (e) { e.preventDefault(); close(); }); // Esc 도 닫힘 모션을 거쳐 닫음
  modal.addEventListener('click', function (e) {
    if (e.target === modal) { close(); return; } // 바깥(배경)
    if (e.target.closest('[data-m-close]')) { close(); return; }
    var step = e.target.closest('[data-m-step]');
    if (step) show(cur + parseInt(step.getAttribute('data-m-step'), 10));
  });
  modal.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); show(cur + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); show(cur - 1); }
  });
})();
