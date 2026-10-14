/* =========================================================
   DOOGO GROUP — leadership.js (리더십)
   그룹 대표 사진 미세 모션
   ========================================================= */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };

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
