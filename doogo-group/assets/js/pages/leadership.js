/* =========================================================
   DOOGO GROUP — leadership.js (리더십)
   사업 대표 프로필 상세(모달) · 이전/다음 이동 · 대표 사진 미세 모션
   ========================================================= */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var html = document.documentElement;

  /* ---------- 사업 대표 프로필 모달 ---------- */
  var modal = $('#ld-modal');
  var cards = $$('.ld-card[data-slug]');
  if (modal && cards.length) {
    var body = $('.ld-modal-body', modal);
    var f = function (name) { return $('[data-f="' + name + '"]', modal); };
    var current = 0;
    var opener = null;

    var fill = function (i) {
      var c = cards[i];
      var d = c.dataset;
      f('num').textContent = d.num;
      f('icon').setAttribute('href', '#' + d.icon);
      f('area').textContent = d.area;
      f('area2').textContent = d.area;
      f('brand').textContent = d.brand;
      f('role').textContent = d.role;
      f('biz').textContent = d.area + ' · ' + d.brand + ' (' + d.brandKo + ')';
      f('task').textContent = d.task;
      f('href').setAttribute('href', 'business-' + d.slug + '.html');
      var scene = f('scene'), src = $('.ld-photo-scene', c);
      if (scene && src) { scene.setAttribute('src', src.getAttribute('src')); scene.setAttribute('width', src.getAttribute('width')); scene.setAttribute('height', src.getAttribute('height')); }
      f('pos').textContent = d.num + ' / ' + String(cards.length).padStart(2, '0');
      current = i;
    };
    var open = function (i, trigger) {
      opener = trigger || null;
      fill(i);
      if (typeof modal.showModal === 'function') modal.showModal(); else modal.setAttribute('open', '');
      html.classList.add('is-locked');
      var c = $('[data-modal-close]', modal); if (c) c.focus();
    };
    var close = function () {
      if (typeof modal.close === 'function' && modal.open) modal.close();
      else { modal.removeAttribute('open'); onClosed(); }
    };
    var onClosed = function () {
      html.classList.remove('is-locked');
      // 이동한 카드가 있으면 그 카드의 버튼으로 포커스를 돌려줌
      var card = cards[current];
      var btn = $('.ld-more', card);
      var target = (opener && card.contains(opener)) ? opener : btn;
      if (target && target.focus) target.focus({ preventScroll: true });
      // ←/→로 다른 프로필로 이동했다면 그 카드가 화면 밖일 수 있음 → 보이도록 스크롤 (scroll-margin 반영)
      var r = card.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      if (r.top < 160 || r.bottom > vh) card.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    };
    var step = function (dir) {
      var next = (current + dir + cards.length) % cards.length;
      if (reduce || !body) { fill(next); return; }
      body.classList.add('is-swap');
      setTimeout(function () { fill(next); body.classList.remove('is-swap'); }, 200);
    };

    cards.forEach(function (card, i) {
      var more = $('.ld-more', card);
      if (more) more.addEventListener('click', function () { open(i, more); });
      var photo = $('[data-open]', card);
      if (photo) photo.addEventListener('click', function () { open(i, more); });
    });
    $$('[data-modal-close]', modal).forEach(function (b) { b.addEventListener('click', close); });
    $$('[data-modal-step]', modal).forEach(function (b) {
      b.addEventListener('click', function () { step(parseInt(b.getAttribute('data-modal-step'), 10) || 1); });
    });
    modal.addEventListener('close', onClosed);
    modal.addEventListener('click', function (e) {
      if (e.target !== modal) return;
      var r = modal.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
    });
    modal.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.hasAttribute('open') && typeof modal.showModal !== 'function') close();
    });
  }

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
})();
