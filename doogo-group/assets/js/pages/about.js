/* =========================================================
   DOOGO GROUP — about.js (그룹 소개)
   히어로(지주회사로 모이는 자회사 · 패럴랙스) · 첫 화면 숫자 굴림 · 태그라인 스크롤 채움
   · 그룹 구조(지주회사 → 자회사) 순차 등장 · 연혁 진행선 · 화면 밖 무한 모션 정지
   ========================================================= */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  /* ---------- 스크롤 연동 (rAF 한 번에 처리) ---------- */
  var stageFig = $('[data-stage]');
  var tagline = $('[data-tagline]');
  var words = tagline ? $$('span', tagline) : [];
  var timeline = $('[data-timeline]');
  var track = timeline ? $('.ab-timeline-track', timeline) : null;
  var years = timeline ? $$('.ab-year', timeline) : [];
  var ticking = false;

  function update() {
    ticking = false;
    var vh = window.innerHeight || 800;

    // 1) 히어로 무대 패럴랙스: 배경 궤도와 앞쪽(지주회사·자회사)이 서로 반대로 조금씩 (about.css 에서 --py 배율)
    if (stageFig && !reduce) {
      var r = stageFig.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh) {
        var p = (r.top + r.height / 2 - vh / 2) / vh; // -1 ~ 1
        stageFig.style.setProperty('--py', clamp(p * -70, -60, 60).toFixed(1) + 'px');
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

  var hasIO = 'IntersectionObserver' in window;

  /* ---------- 첫 화면 숫자: 1 지주회사 · 5 자회사 · 7 사업영역 · 2 국가 ----------
     0 … n 숫자 띠를 transform 으로 굴려 올립니다(이징). 화면에서 완전히 벗어나는 순간 0 으로 되돌려 두었다가
     다시 들어와 절반 이상 보이면 또 굴립니다(최종 숫자 → 0 으로 튀는 모습이 보이지 않게).
     숫자 아래 얇은 선은 .is-counted 로 왼쪽부터 그려집니다 — 첫 화면에서는 블록이 떠오른(fade-up) 뒤에 그려지도록 --line-base 로 늦춤.
     움직임 줄이기면 최종 숫자만 보여 줍니다. */
  var facts = $('[data-facts]');
  if (facts) {
    var nums = $$('[data-ab-count]', facts).map(function (el) {
      var n = parseInt(el.getAttribute('data-ab-count'), 10) || 0;
      var strip = '';
      for (var k = 0; k <= n; k++) strip += '<span>' + k + '</span>';
      el.innerHTML = '<span class="ab-odo" aria-hidden="true"><span class="ab-odo-strip">' + strip + '</span></span><span class="sr-only">' + n + '</span>';
      return { n: n, odo: el.firstChild };
    });
    var showFinal = function () {
      nums.forEach(function (o) { o.odo.style.setProperty('--n', o.n); });
      facts.classList.add('is-counted');
    };
    if (reduce || !hasIO) showFinal();
    else {
      var firstRoll = true, factsIn = false;
      var reset = function () { // 전환 없이 즉시 0 · 밑줄 지움
        nums.forEach(function (o) { o.odo.classList.remove('is-rolling'); o.odo.style.setProperty('--n', 0); });
        facts.classList.remove('is-counted');
      };
      var roll = function () {
        reset();
        void facts.offsetWidth; // 0 으로 되돌린 상태를 먼저 그린 뒤 굴림 시작
        var base = firstRoll ? 0.55 : 0.08; // 처음엔 등장(fade-up: --d .45s + .8s) 모션과 맞춰 조금 늦게
        facts.style.setProperty('--line-base', firstRoll ? '.85s' : '.12s');
        firstRoll = false;
        nums.forEach(function (o, i) {
          o.odo.style.setProperty('--odo-dur', (0.95 + o.n * 0.12).toFixed(2) + 's');
          o.odo.style.setProperty('--odo-delay', (base + i * 0.12).toFixed(2) + 's');
          o.odo.classList.add('is-rolling');
          o.odo.style.setProperty('--n', o.n);
        });
        facts.classList.add('is-counted');
      };
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && en.intersectionRatio >= 0.55) { if (!factsIn) { factsIn = true; roll(); } }
          else if (!en.isIntersecting && factsIn) { factsIn = false; reset(); } // 완전히 벗어나면 0 으로 되돌려 두고 다음에 다시 굴림
        });
      }, { threshold: [0, 0.6] }).observe(facts);
    }
  }

  /* ---------- 히어로 무대: 다섯 자회사가 지주회사로 모여듭니다 ----------
     자회사 타일 가운데 → 지주회사 3D(블록 덩어리) 가장자리까지 선을 실제 위치로 계산해 그립니다(창 크기가 바뀌면 다시 계산).
     등장: 지주회사 → 바깥에 흩어져 있던 자회사가 01~05 차례로 모임(--ox/--oy: 바깥쪽 출발 위치) → 선 → 끝점.
     다 모인 뒤에는 화면에 보이는 동안만 빛 점이 선을 따라 가운데로 흐르고 고리가 퍼집니다(.is-vis). */
  if (stageFig) {
    var fg = $('.ab-stage-fg', stageFig);
    var core = $('.ab-core', stageFig);
    var sats = $$('.ab-sat', stageFig);
    var raysBox = $('.ab-rays', stageFig);
    var rays = sats.map(function (s, i) {
      var ray = document.createElement('span');
      ray.className = 'ab-ray'; ray.style.setProperty('--i', i); ray.appendChild(document.createElement('i'));
      raysBox.appendChild(ray);
      return ray;
    });
    var layoutStage = function () {
      var W = fg.offsetWidth;
      if (!W || !core.offsetWidth) return;
      // 지주회사 3D 안의 가운데 블록(이미지 가로 50% · 세로 47.6%)과 블록 덩어리의 반지름(가로 37% · 세로 28%)
      var cw = core.offsetWidth, ch = core.offsetHeight;
      var cl = core.offsetLeft - cw / 2; // .ab-core 는 translate: -50% 0 (offsetLeft 는 translate 전 위치)
      var ax = cl + cw * 0.5, ay = core.offsetTop + ch * 0.476, rx = cw * 0.37, ry = ch * 0.28;
      stageFig.style.setProperty('--ax', ax.toFixed(1) + 'px');
      stageFig.style.setProperty('--ay', ay.toFixed(1) + 'px');
      stageFig.style.setProperty('--pr', (rx * 2).toFixed(1) + 'px');
      sats.forEach(function (s, i) {
        var tile = s.firstElementChild, half = tile.offsetWidth / 2;
        var cx = s.offsetLeft + half, cy = s.offsetTop + tile.offsetHeight / 2;
        var dx = ax - cx, dy = ay - cy, d = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / d, uy = dy / d;
        var edge = 1 / Math.sqrt((ux / rx) * (ux / rx) + (uy / ry) * (uy / ry)); // 이 방향에서 블록 덩어리 가장자리까지
        var len = Math.max(0, d - edge);
        var ray = rays[i];
        ray.style.left = cx.toFixed(1) + 'px'; ray.style.top = cy.toFixed(1) + 'px'; ray.style.width = len.toFixed(1) + 'px';
        ray.style.setProperty('--a', Math.atan2(dy, dx).toFixed(4) + 'rad');
        ray.style.setProperty('--len', len.toFixed(1) + 'px');
        ray.style.setProperty('--from', Math.min(len, half / Math.max(Math.abs(ux), Math.abs(uy))).toFixed(1) + 'px'); // 타일 가장자리에서 출발
        s.style.setProperty('--ox', (-ux * W * 0.13).toFixed(1) + 'px'); // 모이기 전: 지주회사 반대쪽(바깥)으로 물러나 있음
        s.style.setProperty('--oy', (-uy * W * 0.13).toFixed(1) + 'px');
      });
    };
    layoutStage();
    var coreImg = $('img', core);
    if (coreImg && !coreImg.complete) coreImg.addEventListener('load', layoutStage);
    var stageRaf = 0;
    window.addEventListener('resize', function () { cancelAnimationFrame(stageRaf); stageRaf = requestAnimationFrame(layoutStage); });

    if (reduce || !hasIO) stageFig.classList.add('is-gathered');
    else {
      stageFig.classList.add('is-armed');
      var gathered = false;
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          stageFig.classList.toggle('is-vis', en.isIntersecting); // 화면 밖이면 빛 점·고리·영상 버튼 링 정지
          if (en.isIntersecting && !gathered && en.intersectionRatio >= 0.25) {
            gathered = true;
            layoutStage();
            // 첫 화면에서는 무대가 떠오르는(data-reveal scale, --d .2s) 동안 조금 기다렸다가 모읍니다
            setTimeout(function () { stageFig.classList.add('is-gather'); }, 260);
            setTimeout(function () { stageFig.classList.add('is-gathered'); }, 260 + 2100);
          }
        });
      }, { threshold: [0, 0.25] }).observe(stageFig);
    }
  }

  /* ---------- 그룹 구조: 지주회사 → 연결선 → 자회사 01~05 순차 등장 ----------
     데스크톱(5열): 지주회사 카드가 보이면 줄기·가로선이 그려지고, 자회사마다 선이 내려간 뒤 카드가 차례로 올라옵니다(CSS 지연).
     1100px 이하(세로 트리): 카드마다 화면에 들어올 때 줄기 → 가지 → 카드 순으로 그려집니다.
     다 그려진 뒤에는 화면에 보이는 동안만 선을 따라 빛이 흐릅니다. 움직임 줄이기면 처음부터 모두 보입니다. */
  var org = $('[data-org]');
  if (org && !reduce && hasIO) {
    var subs = $$('.ab-sub', org);
    var vertical = window.matchMedia('(max-width: 1100px)');
    var played = false;
    var showAll = function () { subs.forEach(function (li) { li.classList.add('is-in'); }); };
    var startLive = function () {
      org.classList.add('is-done');
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { org.classList.toggle('is-live', en.isIntersecting); });
      }).observe(org);
    };
    var play = function () {
      if (played) return;
      played = true;
      org.classList.add('is-play');
      if (!vertical.matches) showAll();
      setTimeout(startLive, vertical.matches ? 1200 : 3000); // 데스크톱: 마지막 카드(05)가 다 올라온 뒤 (about.css 의 지연과 맞춤)
    };
    org.classList.add('is-armed');
    var holdIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { play(); holdIO.disconnect(); } });
    }, { rootMargin: '0px 0px -20% 0px' });
    holdIO.observe($('.ab-hold', org) || org);
    var subIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); subIO.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -16% 0px' });
    subs.forEach(function (li) { subIO.observe(li); });
    // 키보드로 들어오면 기다리지 않고 바로 모두 보여 줌
    org.addEventListener('focusin', function () { play(); showAll(); });
  }

  /* ---------- 화면 밖 무한 모션 정지 (배터리·성능) ----------
     비전 마키 띠, 지도(SMIL 빛 점 + 핀 파동)는 화면에 보일 때만 움직입니다. 움직임 줄이기면 처음부터 멈춤. */
  var mapSvg = $('.ab-map-svg');
  var canPauseSvg = mapSvg && typeof mapSvg.pauseAnimations === 'function';
  if (reduce) { if (canPauseSvg) mapSvg.pauseAnimations(); }
  else if (hasIO) {
    var idleIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        en.target.classList.toggle('is-paused', !en.isIntersecting);
        if (en.target === mapFig && canPauseSvg) { if (en.isIntersecting) mapSvg.unpauseAnimations(); else mapSvg.pauseAnimations(); }
      });
    }, { rootMargin: '80px 0px' });
    var mapFig = $('[data-map]');
    [$('.ab-vision-flow'), mapFig].forEach(function (el) { if (el) { el.classList.add('is-paused'); idleIO.observe(el); } });
    if (canPauseSvg) mapSvg.pauseAnimations();
  }
})();
