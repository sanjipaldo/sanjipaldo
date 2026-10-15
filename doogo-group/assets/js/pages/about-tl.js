/* =========================================================
   DOOGO GROUP — about-tl.js (주요 연혁 · 3D 연도 + 빛 레일, 모양은 about-tl.css)
   · 연도 무대: 네 자리마다 0~9 면을 가진 숫자 드럼을 만들고, 지금 읽는 연도로 X축 회전 (오도미터 — 오른쪽 자리부터 차례로).
       연도가 바뀌는 순간 숫자 전체가 살짝 젖혀졌다 돌아오고 광택 띠가 지나감. 처음 보일 때는 가장 오래된 연도(2020)에서
       지금 연도까지 굴러 올라감. 아래 '05 Milestones'(그 해 항목 수) · 연도 바로가기(누르면 그 연도로 스크롤).
   · 빛 레일: 화면의 기준선(높이의 약 55%)까지 블루 빛이 채워지고, 빛 머리는 그 지점을 부드럽게 따라감(지수 감쇠 —
       따라잡으면 rAF 중지). 머리가 지난 항목의 구슬 · 월이 켜지고, 머리가 지난 마지막 연도 머리가 '지금 연도'.
   · 등장: 항목 줄이 화면에 들어오면 아래에서 X축으로 일어섬(같이 들어온 줄은 0.09초씩 차례로).
   · 마우스(정밀 포인터): 줄이 유리 카드로 떠오르며 커서 쪽으로 살짝 기울고 반사광이 따라감. html.soft-motion 이면 기울기 없음.
   · 탭 패널(.ab-panel)이 숨어 있으면 크기가 0 이라 재지 않고, 보이게 되면(ResizeObserver · 탭 클릭) 다시 잼. 창 크기 · 글꼴도.
   · 화면 밖이면 스크롤 계산 · 흐르는 빛 · 맥박 모두 정지(.is-paused).
   · html.motion-off(window.DOOGO.motionOff()) · 'doogo:motion' 이벤트: 다 켜진 정지 그림, 연도는 회전 없이 바로 바뀜.
   ========================================================= */
(function () {
  'use strict';
  var root = document.querySelector('[data-tl3]');
  if (!root) return;
  var doc = document.documentElement;
  var main = root.querySelector('.ab-tl3-main');
  var rail = root.querySelector('.ab-tl3-rail');
  if (!main || !rail) return;

  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  var mq = function (q) { try { return window.matchMedia(q); } catch (e) { return { matches: false }; } };
  var deskMQ = mq('(min-width: 960px)');
  var fineMQ = mq('(hover: hover) and (pointer: fine)');
  var hasIO = 'IntersectionObserver' in window;
  var motionOff = function () {
    return window.DOOGO && typeof window.DOOGO.motionOff === 'function' ? window.DOOGO.motionOff() : doc.classList.contains('motion-off');
  };
  var softMotion = function () { return doc.classList.contains('soft-motion'); };

  /* ---------- 연도 묶음 · 항목 ---------- */
  var groups = $$('[data-tl3-year]', main).map(function (g) {
    var h = g.querySelector('.ab-tl-y');
    return {
      el: g, h: h, year: h ? parseInt(h.textContent, 10) || 0 : 0, hy: 0, lit: false,
      items: $$('.ab-tl-item', g).map(function (li) {
        return { el: li, row: li.querySelector('.ab-tl3-row'), dot: li.querySelector('.ab-tl-dot'), y: 0, lit: false };
      })
    };
  }).filter(function (g) { return g.year > 999 && g.year < 10000 && g.h; });
  if (!groups.length) return;
  var items = [];
  groups.forEach(function (g) { items = items.concat(g.items); });
  if (!items.length) return;
  var minYear = Math.min.apply(null, groups.map(function (g) { return g.year; }));

  /* ---------- 연도 무대 만들기 ---------- */
  var stage = document.createElement('div');
  stage.className = 'ab-tl3-stage';
  var digitsHTML = '';
  for (var p = 0; p < 4; p++) {
    var faces = '';
    for (var k = 0; k < 10; k++) faces += '<span class="ab-tl3-face" style="--k:' + k + '"><span class="x">' + k + '</span><span class="f">' + k + '</span></span>';
    digitsHTML += '<span class="ab-tl3-d"><span class="ab-tl3-drum">' + faces + '</span></span>';
  }
  stage.innerHTML =
    '<p class="ab-tl3-kick en" aria-hidden="true"><i></i><span>Since <b>' + minYear + '</b></span></p>' +
    '<div class="ab-tl3-hero en" aria-hidden="true"><div class="ab-tl3-floor"><i></i></div><span class="ab-tl3-shadow"></span>' +
      '<div class="ab-tl3-num"><div class="ab-tl3-numin">' + digitsHTML + '</div></div></div>' +
    '<p class="ab-tl3-meta en" aria-hidden="true"><b>00</b><span>Milestones</span></p>' +
    '<nav class="ab-tl3-nav" aria-label="연도별 연혁 바로가기"><span class="ab-tl3-navtrack" aria-hidden="true"><i></i></span><ol>' +
      groups.map(function (g, i) {
        return '<li><button type="button" class="en" data-i="' + i + '"><i aria-hidden="true"></i><span>' + g.year +
          '</span><span class="sr-only">년 연혁으로 이동</span></button></li>';
      }).join('') +
    '</ol></nav>';
  root.insertBefore(stage, root.firstChild);
  root.classList.add('is-ready');

  var numin = stage.querySelector('.ab-tl3-numin');
  var meta = stage.querySelector('.ab-tl3-meta');
  var metaN = meta.querySelector('b');
  var nav = stage.querySelector('.ab-tl3-nav');
  var navBtns = $$('button', nav);
  var digits = $$('.ab-tl3-d', stage).map(function (d) {
    return { el: d, drum: d.querySelector('.ab-tl3-drum'), faces: $$('.ab-tl3-face', d), v: null };
  });
  // Outfit 600 숫자 너비(em) — 칸 너비를 지금 숫자에 맞춰 자간을 고르게
  var DW = [0.66, 0.37, 0.55, 0.55, 0.6, 0.55, 0.57, 0.52, 0.55, 0.57];

  // 드럼 감속: 정지 상태에서 출발해 한 번 살짝 넘었다 돌아오는 감쇠 스프링 — 굴러가는 칸 수와 관계없이
  // 넘치는 각도가 약 7°(숫자 한 칸 36°의 1/5)가 되도록 칸 수마다 곡선을 만듦 (linear() 미지원이면 cubic-bezier)
  var hasLinear = !!(window.CSS && CSS.supports && CSS.supports('transition-timing-function', 'linear(0, 0.5, 1)'));
  var easeCache = {};
  function rollEase(steps) {
    if (!hasLinear) return 'cubic-bezier(.22, 1.08, .36, 1)';
    if (easeCache[steps]) return easeCache[steps];
    // 진동수(w)는 고정해 언제나 길이의 약 1/3 지점에서 가장 많이 넘치고, 넘치는 양(o)으로 감쇠(a)를 정함
    var w = 9.5, o = Math.min(0.22, 7 / (36 * steps)), a = w * -Math.log(o) / Math.PI, pts = [];
    for (var i = 0; i <= 40; i++) {
      var t = i / 40;
      var x = i === 40 ? 1 : 1 - Math.exp(-a * t) * (Math.cos(w * t) + (a / w) * Math.sin(w * t));
      pts.push(x.toFixed(4));
    }
    return (easeCache[steps] = 'linear(' + pts.join(', ') + ')');
  }

  // 연도 → 자리별 드럼 각도. 자리 값 v = floor(연도 / 10^(3-자리)) 를 그대로 쓰므로(-36° × v),
  // 2020 → 2019 처럼 자리올림이 있어도 언제나 같은 방향으로 한 칸씩 굴러감
  var shownYear = null;
  function roll(year, instant) {
    if (year === shownYear) return;
    var from = shownYear;
    shownYear = year;
    digits.forEach(function (d, i) {
      var v = Math.floor(year / Math.pow(10, 3 - i));
      var steps = d.v === null ? 0 : Math.abs(v - d.v);
      d.v = v;
      if (instant || !steps) {
        d.el.style.setProperty('--dur', '0s');
        d.el.style.setProperty('--dl', '0s');
      } else {
        d.el.style.setProperty('--dur', Math.min(1.8, 0.95 + steps * 0.14).toFixed(2) + 's');
        d.el.style.setProperty('--dl', ((3 - i) * 0.07).toFixed(2) + 's');
        d.el.style.setProperty('--roll-ease', rollEase(steps));
      }
      d.drum.style.setProperty('--a', (-36 * v) + 'deg');
      var front = ((v % 10) + 10) % 10;
      d.el.style.setProperty('--w', DW[front]);
      d.faces.forEach(function (f, j) { f.classList.toggle('is-front', j === front); });
    });
    if (!instant && from !== null && !motionOff()) {
      stage.classList.remove('is-flip');
      void stage.offsetWidth; // 애니메이션 다시 시작
      stage.classList.add('is-flip');
      clearTimeout(roll.t);
      roll.t = setTimeout(function () { stage.classList.remove('is-flip'); }, 1800);
    }
  }

  /* ---------- 위치 재기 (패널이 숨어 있으면 0 → 건너뜀) ---------- */
  var geo = { rt: 0, rh: 1, ok: false };
  var offTop = function (el) { var y = 0; while (el && el !== main) { y += el.offsetTop; el = el.offsetParent; } return y; };
  function measure() {
    if (!main.offsetHeight || !main.getClientRects().length) { geo.ok = false; return; }
    groups.forEach(function (g) {
      g.hy = offTop(g.h) + g.h.offsetHeight / 2;
      g.items.forEach(function (it) {
        it.y = it.dot && it.dot.offsetParent ? offTop(it.dot) + it.dot.offsetHeight / 2 : offTop(it.el) + 30;
      });
    });
    geo.rt = groups[0].hy;
    geo.rh = Math.max(1, items[items.length - 1].y - geo.rt);
    geo.ok = true;
    rail.style.top = geo.rt.toFixed(1) + 'px';
    rail.style.bottom = 'auto';
    rail.style.height = geo.rh.toFixed(1) + 'px';
  }

  /* ---------- 스크롤 → 레일 · 구슬 · 지금 연도 ---------- */
  var st = { p: 0, raf: 0, last: 0, vis: !hasIO, yi: -1, smooth: false, introDone: !hasIO };
  var markY = function () { return (window.innerHeight || 800) * (deskMQ.matches ? 0.56 : 0.52); };

  function setCurrent(yi) {
    if (yi === st.yi) return;
    var first = st.yi < 0;
    st.yi = yi;
    var g = groups[yi];
    groups.forEach(function (x, i) { x.el.classList.toggle('is-cur', i === yi); });
    navBtns.forEach(function (b, i) {
      b.classList.toggle('is-on', i === yi);
      b.classList.toggle('is-past', i < yi);
      if (i === yi) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    nav.style.setProperty('--np', groups.length > 1 ? (yi / (groups.length - 1)).toFixed(4) : '1');
    metaN.textContent = pad2(g.items.length);
    if (!first && !motionOff()) {
      meta.classList.remove('is-swap'); void meta.offsetWidth; meta.classList.add('is-swap');
    }
    if (st.introDone) roll(g.year, first || motionOff());
  }

  function tick(now) {
    st.raf = 0;
    if (!geo.ok) measure();
    if (!geo.ok) return;
    var off = motionOff();
    var top = main.getBoundingClientRect().top;
    var rel = markY() - top; // 기준선의 본문 열 안 위치
    var tp = clamp((rel - geo.rt) / geo.rh, 0, 1);
    now = now || (window.performance ? performance.now() : Date.now());
    var dt = st.last ? Math.min(80, now - st.last) : 16;
    st.last = now;
    if (off || !st.smooth) st.p = tp;
    else st.p += (tp - st.p) * (1 - Math.exp(-dt / 130));
    var settled = Math.abs(tp - st.p) < 0.0004;
    if (settled) st.p = tp;
    var pp = off ? 1 : st.p;
    var hy = pp * geo.rh, at = geo.rt + hy;
    rail.style.setProperty('--p', pp.toFixed(4));
    rail.style.setProperty('--hy', hy.toFixed(1) + 'px');
    rail.classList.toggle('is-run', !off && pp > 0.002 && pp < 0.998);
    items.forEach(function (it) {
      var on = off || it.y <= at + 1;
      if (on !== it.lit) { it.lit = on; it.el.classList.toggle('is-lit', on); }
    });
    var yi = 0, ref = off ? rel : at;
    groups.forEach(function (g, i) {
      var on = off || g.hy <= at + 1;
      if (on !== g.lit) { g.lit = on; g.el.classList.toggle('is-lit', on); }
      if (g.hy <= ref + 1) yi = i;
    });
    setCurrent(yi);
    // 바닥 그리드가 스크롤 따라 앞으로 흘러옴
    if (!off && deskMQ.matches) stage.style.setProperty('--gy', (-top * 0.22).toFixed(1) + 'px');
    if (!settled && !off) st.raf = requestAnimationFrame(tick);
    else st.last = 0;
  }
  function kick() { if (!st.raf) st.raf = requestAnimationFrame(tick); }
  function remeasure() { measure(); kick(); }

  window.addEventListener('scroll', function () { if (st.vis) kick(); }, { passive: true });
  window.addEventListener('resize', remeasure);
  if ('ResizeObserver' in window) new ResizeObserver(remeasure).observe(main);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
  window.addEventListener('load', remeasure);
  // 탭을 바꾸면(패널이 보이게 되면) 다시 잼 — ResizeObserver 가 없는 브라우저 대비
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[role="tab"]') : null;
    if (t) setTimeout(remeasure, 180);
  });

  /* ---------- 처음 상태 ---------- */
  var armed = !motionOff() && hasIO;
  // 첫 그림: 레일 · 연도를 바로 맞춰 둠 (등장 전이면 숫자는 가장 오래된 연도에서 대기)
  roll(armed ? minYear : groups[0].year, true);
  measure();
  tick();
  st.smooth = true;

  /* ---------- 등장: 줄(li) · 연도 머리(h3 가 보이면 그 묶음에 .is-up) ---------- */
  var observers = [];
  var introIO = null;
  function revealAll() {
    observers.forEach(function (o) { o.disconnect(); });
    observers = [];
    items.forEach(function (it) { it.el.classList.add('is-up', 'is-done'); });
    groups.forEach(function (g) { g.el.classList.add('is-up'); });
  }
  function finishStage() {
    if (introIO) { introIO.disconnect(); introIO = null; }
    stage.classList.remove('is-armed', 'is-flip');
    stage.classList.add('is-in');
    st.introDone = true;
    roll(groups[Math.max(0, st.yi)].year, true);
  }
  if (armed) {
    root.classList.add('is-armed');
    stage.classList.add('is-armed');
    var rowIO = new IntersectionObserver(function (entries) {
      var n = 0;
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var li = en.target;
        rowIO.unobserve(li);
        var d = n++ * 90; // 함께 들어온 줄은 차례로
        li.style.setProperty('--d', d + 'ms');
        li.classList.add('is-up');
        setTimeout(function () { li.classList.add('is-done'); }, 1300 + d);
      });
    }, { rootMargin: '0px 0px -7% 0px', threshold: 0.15 });
    items.forEach(function (it) { rowIO.observe(it.el); });
    var headIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        headIO.unobserve(en.target);
        var g = groups.filter(function (x) { return x.h === en.target; })[0];
        if (g) g.el.classList.add('is-up');
      });
    }, { rootMargin: '0px 0px -5% 0px', threshold: 0.5 });
    groups.forEach(function (g) { headIO.observe(g.h); });
    observers.push(rowIO, headIO);

    // 무대 첫 등장: 일어서며 숫자가 가장 오래된 연도 → 지금 연도로 굴러 올라감
    introIO = new IntersectionObserver(function (entries) {
      if (!entries.some(function (en) { return en.isIntersecting; })) return;
      introIO.disconnect(); introIO = null;
      if (motionOff()) { finishStage(); return; }
      stage.classList.add('is-in');
      setTimeout(function () {
        if (st.introDone) return;
        st.introDone = true;
        roll(groups[Math.max(0, st.yi)].year, false);
        setTimeout(function () { stage.classList.remove('is-armed'); }, 1600);
      }, 260);
    }, { threshold: 0.35 });
    introIO.observe(stage.querySelector('.ab-tl3-hero'));
  } else {
    revealAll();
    finishStage();
  }

  /* ---------- 화면 안/밖 ---------- */
  if (hasIO) {
    new IntersectionObserver(function (entries) {
      var en = entries[entries.length - 1];
      st.vis = en.isIntersecting;
      root.classList.toggle('is-paused', !st.vis);
      if (st.vis) { if (!geo.ok) measure(); kick(); }
    }, { rootMargin: '160px 0px' }).observe(root);
  }

  /* ---------- 연도 바로가기 ---------- */
  nav.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('button[data-i]') : null;
    if (!b) return;
    var g = groups[+b.getAttribute('data-i')];
    if (!g) return;
    if (!geo.ok) measure();
    var y0 = window.scrollY || window.pageYOffset;
    var hubY = main.getBoundingClientRect().top + y0 + g.hy; // 문서 기준 허브 위치
    var tabsH = parseFloat(getComputedStyle(doc).getPropertyValue('--ab-tabs-h')) || 65;
    var header = document.querySelector('[data-header-el]');
    var down = hubY - y0 > markY();
    var hh = header && !down ? header.offsetHeight : 0; // 아래로 가면 헤더가 숨음(site.js)
    var lead = hh + tabsH + (deskMQ.matches ? 40 : stage.offsetHeight + 20) + g.h.offsetHeight / 2;
    // 고른 연도 머리는 기준선 위, 다음 연도 머리는 기준선 아래에 오도록 (짧은 연도 묶음에서 다음 해로 넘어가지 않게)
    var gi = groups.indexOf(g), next = groups[gi + 1];
    var mk = markY(), at = lead;
    if (next) at = clamp(lead, mk - (next.hy - g.hy) + 28, mk - 28);
    else at = Math.min(lead, mk - 28);
    var y = Math.max(0, Math.round(hubY - at));
    var smooth = !motionOff();
    try { window.scrollTo({ top: y, behavior: smooth ? 'smooth' : 'auto' }); } catch (err) { window.scrollTo(0, y); }
    g.h.setAttribute('tabindex', '-1');
    try { g.h.focus({ preventScroll: true }); } catch (err) { /* 오래된 브라우저 */ }
  });

  /* ---------- 마우스: 유리 카드 기울기 · 반사광 ---------- */
  var tilt = { row: null, raf: 0, x: 0.5, y: 0.5 };
  var tiltOk = function () { return fineMQ.matches && !motionOff() && !softMotion(); };
  function paintTilt() {
    tilt.raf = 0;
    var r = tilt.row;
    if (!r) return;
    r.style.setProperty('--tx', ((0.5 - tilt.y) * 6).toFixed(2) + 'deg');
    r.style.setProperty('--ty', ((tilt.x - 0.5) * 2.4).toFixed(2) + 'deg');
    r.style.setProperty('--gx', (tilt.x * 100).toFixed(1) + '%');
    r.style.setProperty('--gy', (tilt.y * 100).toFixed(1) + '%');
  }
  function clearTilt(r) {
    if (!r) return;
    ['--tx', '--ty', '--gx', '--gy'].forEach(function (k) { r.style.removeProperty(k); });
  }
  main.addEventListener('pointermove', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    var row = e.target && e.target.closest ? e.target.closest('.ab-tl3-row') : null;
    if (row !== tilt.row) { clearTilt(tilt.row); tilt.row = row; }
    if (!row) return;
    var b = row.getBoundingClientRect();
    tilt.x = clamp((e.clientX - b.left) / (b.width || 1), 0, 1);
    tilt.y = clamp((e.clientY - b.top) / (b.height || 1), 0, 1);
    if (!tiltOk()) { // 기울기 없이 반사광만
      row.style.setProperty('--gx', (tilt.x * 100).toFixed(1) + '%');
      row.style.setProperty('--gy', (tilt.y * 100).toFixed(1) + '%');
      return;
    }
    if (!tilt.raf) tilt.raf = requestAnimationFrame(paintTilt);
  });
  main.addEventListener('pointerleave', function () { clearTilt(tilt.row); tilt.row = null; });

  /* ---------- 움직임 멈추기 / 켜기 ---------- */
  document.addEventListener('doogo:motion', function (e) {
    var off = !!(e.detail && e.detail.off);
    if (off) {
      root.classList.remove('is-armed');
      revealAll();
      finishStage();
      clearTilt(tilt.row);
    }
    st.last = 0;
    kick();
  });
})();
