/* =========================================================
   DOOGO GROUP — about.js (그룹 소개)
   히어로 패럴랙스 · 태그라인 스크롤 채움 · 생태계 크게 보기 · 연혁 진행선 · 지도 모션
   ========================================================= */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  /* ---------- 스크롤 연동 (rAF 한 번에 처리) ---------- */
  var town = $('.ab-town');
  var townMedia = $('[data-parallax]');
  var tagline = $('[data-tagline]');
  var words = tagline ? $$('span', tagline) : [];
  var timeline = $('[data-timeline]');
  var track = timeline ? $('.ab-timeline-track', timeline) : null;
  var years = timeline ? $$('.ab-year', timeline) : [];
  var ticking = false;

  function update() {
    ticking = false;
    var vh = window.innerHeight || 800;

    // 1) 히어로 마을 일러스트 패럴랙스
    if (town && townMedia && !reduce) {
      var r = town.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh) {
        var p = (r.top + r.height / 2 - vh / 2) / vh; // -1 ~ 1
        townMedia.style.setProperty('--py', clamp(p * -70, -60, 60).toFixed(1) + 'px');
      }
    }

    // 2) 영문 태그라인: 스크롤에 따라 단어가 차례로 채워짐
    if (words.length) {
      var tr = tagline.getBoundingClientRect();
      var prog = clamp((vh * 0.88 - tr.top) / (tr.height + vh * 0.4), 0, 1);
      var lit = reduce ? words.length : Math.round(prog * words.length * 1.2);
      // 한 번 채워진 단어는 유지 (위로 스크롤해도 다시 흐려지지 않음)
      words.forEach(function (w, i) { if (i < lit) w.classList.add('is-lit'); });
    }

    // 3) 연혁 진행선
    if (timeline && track) {
      var t = track.getBoundingClientRect();
      var mark = vh * 0.62;
      var tp = clamp((mark - t.top) / Math.max(t.height, 1), 0, 1);
      track.style.setProperty('--p', tp.toFixed(3));
      years.forEach(function (y) {
        var dot = $('.ab-year-dot', y);
        var dr = (dot || y).getBoundingClientRect();
        y.classList.toggle('is-reached', dr.top < mark);
      });
    }
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();

  /* ---------- 생태계 인포그래픽 크게 보기 (dialog) ---------- */
  var lb = $('#ab-lightbox');
  var html = document.documentElement;
  if (lb) {
    var lbImg = $('img[data-src]', lb);
    var opener = null;
    var openLb = function (btn) {
      opener = btn;
      if (lbImg && !lbImg.getAttribute('src')) lbImg.setAttribute('src', lbImg.getAttribute('data-src'));
      if (typeof lb.showModal === 'function') lb.showModal(); else lb.setAttribute('open', '');
      html.classList.add('is-locked');
      var c = $('[data-lightbox-close]', lb); if (c) c.focus();
    };
    var closeLb = function () {
      if (typeof lb.close === 'function' && lb.open) lb.close(); else { lb.removeAttribute('open'); onClosed(); }
    };
    var onClosed = function () {
      html.classList.remove('is-locked');
      if (opener && opener.focus) opener.focus();
    };
    $$('[data-lightbox-open]').forEach(function (b) { b.addEventListener('click', function () { openLb(b); }); });
    $$('[data-lightbox-close]', lb).forEach(function (b) { b.addEventListener('click', closeLb); });
    lb.addEventListener('close', onClosed);
    // 바깥(배경) 클릭 시 닫기
    lb.addEventListener('click', function (e) {
      if (e.target !== lb) return;
      var r = lb.getBoundingClientRect();
      var inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) closeLb();
    });
    // 이미지 바깥 여백(본문 영역) 클릭도 닫기
    var body = $('.ab-lightbox-body', lb);
    if (body) body.addEventListener('click', function (e) { if (e.target === body) closeLb(); });
    // showModal 미지원 브라우저 Esc 처리
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && lb.hasAttribute('open') && typeof lb.showModal !== 'function') closeLb(); });
  }

  /* ---------- 지도: 움직임 줄이기면 SMIL 정지 ---------- */
  var mapSvg = $('.ab-map-svg');
  if (mapSvg && reduce && typeof mapSvg.pauseAnimations === 'function') mapSvg.pauseAnimations();
})();
