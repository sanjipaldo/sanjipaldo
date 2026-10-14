/* =========================================================
   DOOGO GROUP — business-detail.js (사업 상세 7개 공통)
   첫 화면 사진 프레임: 느린 줌(Ken Burns)은 화면에 보일 때만 · 패럴랙스 · 서브 내비 현재 위치 보정
   (그룹 영상 창·등장 모션·준비 중 링크는 site.js가 처리)
   움직임 정책(site.js): OS 설정과 관계없이 재생하고, '움직임 멈추기'(window.DOOGO.motionOff())일 때만 멈춥니다.
   패럴랙스만 OS의 '애니메이션 줄이기'가 켜진 기기(html.soft-motion)에서 끕니다.
   ========================================================= */
(function () {
  'use strict';
  var doc = document.documentElement;
  var motionOff = function () { return !!(window.DOOGO && window.DOOGO.motionOff && window.DOOGO.motionOff()); };
  var softMotion = function () { return doc.classList.contains('soft-motion'); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  /* ---------- 사진 프레임 느린 줌: 보일 때만 진행, 화면 밖이면 그 자리에서 멈춤 ('움직임 멈추기'는 CSS html.motion-off) ---------- */
  if ('IntersectionObserver' in window) {
    var kio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { en.target.classList.toggle('is-live', en.isIntersecting); });
    }, { threshold: 0.05 });
    $$('.dt-frame').forEach(function (f) { kio.observe(f); });
  }

  /* ---------- 사진 프레임 패럴랙스 (움직임 멈추기 · OS 애니메이션 줄이기 기기에서는 끔) ---------- */
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
