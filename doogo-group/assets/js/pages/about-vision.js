/* =========================================================
   DOOGO GROUP — about-vision.js
   그룹 소개 › 비전과 철학 › 다섯 가지 약속 (.ab-vows-stage, 모양은 about-vision.css)
   · 빛 줄기(SVG): 다섯 메달의 중심을 이어 그림 (창 크기 · 탭 전환으로 자리가 바뀌면 다시 그림)
   · 등장: 한 줄 5장(1180px 이상)은 화면에 들어오면 01→05 차례로 일어서고, 빛이 왼쪽에서 달려와 메달을 차례로 켬.
           세로 목록(1179px 이하)은 카드가 화면에 들어올 때마다 일어서고, 빛 줄기는 스크롤을 따라 아래로 내려가며 켬.
   · 다 켜지면 가끔 빛 한 점이 01→05 를 다시 지나가며 메달마다 맥박 (화면 밖이면 정지).
   · 마우스(정밀 포인터 · 한 줄 배치): 카드가 커서 쪽으로 눌리듯 기울고 반사광이 따라감. html.soft-motion 이면 기울기 없음.
   · 탭 패널(.ab-panel)이 숨어 있다가 보이면 그때 시작. html.motion-off · 'doogo:motion' 이면 다 켜진 정지 그림.
   ========================================================= */
(function () {
  'use strict';
  var stage = document.querySelector('[data-vows]');
  if (!stage) return;
  var doc = document.documentElement;
  var list = stage.querySelector('.ab-vows');
  var items = Array.prototype.slice.call(stage.querySelectorAll('.ab-vow'));
  var svg = stage.querySelector('[data-vows-beam]');
  if (!list || !items.length || !svg) return;
  var rail = svg.querySelector('.ab-vows-rail');
  var lits = Array.prototype.slice.call(svg.querySelectorAll('.ab-vows-lit'));
  var head = svg.querySelector('.ab-vows-head');
  var paths = Array.prototype.slice.call(svg.querySelectorAll('path'));

  var mq = function (q) { try { return window.matchMedia(q); } catch (e) { return { matches: false }; } };
  var rowMQ = mq('(min-width: 1180px)');
  var fineMQ = mq('(hover: hover) and (pointer: fine)');
  var motionOff = function () {
    return window.DOOGO && typeof window.DOOGO.motionOff === 'function' ? window.DOOGO.motionOff() : doc.classList.contains('motion-off');
  };
  var hasIO = 'IntersectionObserver' in window;
  var P = 7.5;          // 반복 빛 한 바퀴(초) — CSS --P 와 같게
  var TRAVEL = 0.4;     // 그중 빛이 지나가는 몫 (CSS vowComet 40%)
  var OVER = 1.15;      // 빛 한 점이 끝을 지나 사라지는 거리 (CSS vowComet)

  /* 큰 숫자: 앞 글자 뒤로 같은 윤곽 7장을 겹쳐 두께를 만듦 (장식 · aria-hidden 안) */
  items.forEach(function (li) {
    var num = li.querySelector('.ab-vow-num'), b = num && num.querySelector('b');
    if (!b || num.querySelector('i')) return;
    var frag = document.createDocumentFragment();
    for (var k = 7; k >= 1; k--) {
      var layer = document.createElement('i');
      layer.textContent = b.textContent;
      layer.style.setProperty('--k', k);
      frag.appendChild(layer);
    }
    num.insertBefore(frag, b);
  });

  /* ---------- 빛 줄기 길 ---------- */
  var pts = [], cum = [], fr = [], total = 0, railLen = 0, ready = false;
  var centerOf = function (el) {
    var x = el.offsetWidth / 2, y = el.offsetHeight / 2, n = el;
    while (n && n !== stage) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return n === stage ? [x, y] : null;
  };
  function build() {
    ready = false;
    if (!stage.offsetWidth || !stage.offsetHeight) return;
    var row = rowMQ.matches;
    var c = items.map(function (li) { return centerOf(li.querySelector('.ab-vow-orb')); });
    if (c.some(function (p) { return !p; })) return;
    var first = c[0], last = c[c.length - 1];
    var a, z;
    if (row) {
      // 한 줄: 첫 타일 왼쪽 끝 → 메달들 → 마지막 타일 오른쪽 끝 (타일 윗변을 따라)
      var l0 = items[0].offsetLeft + list.offsetLeft, l1 = items[items.length - 1].offsetLeft + list.offsetLeft + items[items.length - 1].offsetWidth;
      a = [l0 + 6, first[1]]; z = [l1 - 6, last[1]];
    } else {
      // 세로: 첫 메달 위 · 마지막 메달 아래로 짧은 꼬리
      var t = Math.min(64, Math.max(36, (c.length > 1 ? (c[1][1] - c[0][1]) * .4 : 48)));
      a = [first[0], first[1] - t]; z = [last[0], last[1] + t];
    }
    pts = [a].concat(c, [z]);
    cum = [0]; total = 0;
    for (var i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      cum.push(total);
    }
    if (total < 1) return;
    fr = c.map(function (p, k) { return cum[k + 1] / total; });
    var d = 'M' + pts.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' L');
    paths.forEach(function (p) { p.setAttribute('d', d); });
    railLen = total;
    // 양 끝은 흐리게 (한 줄 = 좌우 · 세로 = 위아래)
    var fade = row ? 'linear-gradient(90deg, transparent ' + a[0].toFixed(0) + 'px, #000 ' + (a[0] + 36).toFixed(0) + 'px, #000 ' + (z[0] - 36).toFixed(0) + 'px, transparent ' + z[0].toFixed(0) + 'px)'
                   : 'linear-gradient(180deg, transparent ' + a[1].toFixed(0) + 'px, #000 ' + (first[1] - 4).toFixed(0) + 'px, #000 ' + (last[1] + 4).toFixed(0) + 'px, transparent ' + z[1].toFixed(0) + 'px)';
    svg.style.webkitMaskImage = fade; svg.style.maskImage = fade;
    // 반복 빛이 각 메달에 닿는 시각 (CSS --hit)
    items.forEach(function (li, k) { li.style.setProperty('--hit', (fr[k] / OVER * TRAVEL * P).toFixed(3) + 's'); });
    ready = true;
    paint();
  }

  /* ---------- 빛이 달려가며 메달을 켬 ---------- */
  var prog = 0, target = 0, raf = 0, lastT = 0, started = false, done = false, visible = false, armed = false;
  function light(li) { if (!li.classList.contains('is-lit')) li.classList.add('is-lit'); }
  function paint() {
    if (!ready) return;
    if (armed) {
      var o = String(Math.max(0, 1 - prog).toFixed(4));
      lits.forEach(function (p) { p.style.strokeDashoffset = o; });
    }
    if (head && rail && prog > 0 && prog < 1) {
      try {
        var pt = rail.getPointAtLength(prog * railLen);
        head.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ')');
      } catch (e) { /* 길이 아직 없음 */ }
    }
    items.forEach(function (li, i) { if (prog >= fr[i] - 0.004) light(li); });
  }
  function tick(t) {
    raf = 0;
    if (!ready) { lastT = 0; return; }
    var dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
    lastT = t;
    var speed = (rowMQ.matches ? 860 : 1000) / Math.max(1, railLen); // 화면 px/초 → 길 비율/초
    if (prog < target) { prog = Math.min(target, prog + speed * dt); paint(); }
    stage.classList.toggle('is-drawing', prog < target && prog < 1);
    if (prog < target) raf = requestAnimationFrame(tick);
    else { lastT = 0; if (prog >= 1) finish(); }
  }
  var run = function () { if (!raf && ready) raf = requestAnimationFrame(tick); };

  function rise(li, delay) {
    if (li.classList.contains('is-up')) return;
    li.style.setProperty('--rd', delay.toFixed(2) + 's');
    li.classList.add('is-up');
  }
  function finish() {
    if (done) return;
    done = true;
    stage.classList.remove('is-drawing');
    stage.classList.add('is-done');
    syncLive();
  }
  // 반복(빛 한 점 · 맥박)은 다 켜진 뒤 · 움직임 켜짐 · 화면 안일 때만
  function syncLive() {
    var on = done && !motionOff();
    stage.classList.toggle('is-live', on);
    stage.classList.toggle('is-paused', !visible);
  }

  /* 화면 위치에 따라: 한 줄 = 한 번에 차례로 · 세로 = 카드마다, 빛 줄기는 스크롤을 따라 */
  function check() {
    if (!armed || !ready || done) return;
    var vh = window.innerHeight || doc.clientHeight;
    var r = stage.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh) return;
    if (rowMQ.matches) {
      if (started || (r.top > vh * 0.74 && r.bottom > vh)) return; // 윗부분이 화면 74% 선 위로 오거나 전체가 보이면
      started = true;
      items.forEach(function (li, i) { rise(li, i * 0.13); });
      setTimeout(function () { target = 1; run(); }, 650);
      return;
    }
    // 세로: 카드 윗변이 화면 아래 88% 선을 넘으면 일어섬 (같이 들어온 카드끼리는 0.1초 간격)
    var batch = 0;
    items.forEach(function (li) {
      if (li.classList.contains('is-up')) return;
      if (r.top + li.offsetTop < vh * 0.88) { rise(li, batch * 0.1); batch++; }
    });
    // 빛 줄기: 화면 72% 선까지 (마지막 카드가 다 보이면 끝까지) — 한 번 켜진 곳은 다시 꺼지지 않음
    var line = vh * 0.72 - r.top, f = 0;
    if (line >= pts[pts.length - 1][1]) f = 1;
    else if (line > pts[0][1]) {
      for (var k = 1; k < pts.length; k++) {
        if (line <= pts[k][1]) {
          var y0 = pts[k - 1][1], y1 = pts[k][1];
          f = (cum[k - 1] + (y1 > y0 ? (line - y0) / (y1 - y0) : 1) * (cum[k] - cum[k - 1])) / total;
          break;
        }
      }
    }
    var lastLi = items[items.length - 1];
    if (r.top + lastLi.offsetTop + lastLi.offsetHeight <= vh) f = 1;
    if (f > target) { target = f; started = true; run(); }
  }

  /* 다 켜진 정지 그림 (움직임 멈추기 · 관찰 기능 없음) */
  function finalize() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    armed = false;
    stage.classList.remove('is-armed', 'is-drawing');
    items.forEach(function (li) { li.classList.add('is-up', 'is-lit'); });
    lits.forEach(function (p) { p.style.strokeDashoffset = ''; });
    prog = target = 1; started = true;
    done = true;
    stage.classList.add('is-done');
    resetTilt();
    syncLive();
  }

  /* ---------- 마우스 기울기 · 반사광 ---------- */
  var tilts = [], RAD = Math.PI / 180;
  var tiltOK = function () { return rowMQ.matches && fineMQ.matches && !motionOff() && !doc.classList.contains('soft-motion'); };
  items.forEach(function (li) {
    var card = li.querySelector('.ab-vow-card');
    if (!card) return;
    var s = { x: 0, y: 0, h: 0, tx: 0, ty: 0, th: 0, raf: 0 };
    var lastF = 0;
    var frame = function (t) {
      s.raf = 0;
      var dt = lastF ? Math.min(0.1, (t - lastF) / 1000) : 1 / 60;
      lastF = t;
      var k = 1 - Math.pow(0.88, dt * 60); // 화면 주사율과 관계없이 같은 빠르기로 따라감
      s.x += (s.tx - s.x) * k; s.y += (s.ty - s.y) * k; s.h += (s.th - s.h) * k;
      var still = Math.abs(s.tx - s.x) < 0.01 && Math.abs(s.ty - s.y) < 0.01 && Math.abs(s.th - s.h) < 0.004;
      if (still && !s.th) { s.x = s.y = s.h = 0; lastF = 0; clear(); return; }
      card.style.transform = 'perspective(1100px) translateY(' + (-8 * s.h).toFixed(2) + 'px) rotateX(' + s.x.toFixed(3) + 'deg) rotateY(' + s.y.toFixed(3) + 'deg)';
      // 메달(약 44px 높이에 떠 있는 셈)이 기울기만큼 비켜 보이는 시차 · 살짝 커짐
      card.style.setProperty('--ox', (44 * Math.sin(s.y * RAD)).toFixed(2));
      card.style.setProperty('--oy', (-44 * Math.sin(s.x * RAD)).toFixed(2));
      card.style.setProperty('--lift', s.h.toFixed(3));
      if (!still) s.raf = requestAnimationFrame(frame); else lastF = 0;
    };
    var kick = function () { if (!s.raf) s.raf = requestAnimationFrame(frame); };
    var clear = function () { card.style.transform = ''; card.style.removeProperty('--ox'); card.style.removeProperty('--oy'); card.style.removeProperty('--lift'); };
    var reset = function (instant) {
      s.tx = s.ty = s.th = 0;
      card.classList.remove('is-hover');
      if (instant) { if (s.raf) cancelAnimationFrame(s.raf); s.raf = 0; lastF = 0; s.x = s.y = s.h = 0; clear(); }
      else kick();
    };
    tilts.push(reset);
    li.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch' || !fineMQ.matches || motionOff() || !li.classList.contains('is-up')) return;
      var r = li.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      var py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      card.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
      card.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
      if (!tiltOK()) { if (s.th || s.h) reset(true); card.classList.add('is-hover'); return; } // 반사광만
      card.classList.add('is-hover');
      s.ty = (px - 0.5) * 2 * 7;   // 오른쪽을 가리키면 오른쪽이 눌림
      s.tx = (0.5 - py) * 2 * 6;   // 위를 가리키면 위가 눌림
      s.th = 1;
      kick();
    });
    li.addEventListener('pointerleave', function () { reset(false); });
  });
  function resetTilt() { tilts.forEach(function (fn) { fn(true); }); }

  /* ---------- 시작 ---------- */
  build();
  if (motionOff() || !hasIO) finalize();
  else { armed = true; stage.classList.add('is-armed'); }

  var queued = 0;
  var schedule = function () { if (!queued) queued = requestAnimationFrame(function () { queued = 0; check(); }); };
  window.addEventListener('scroll', function () { if (visible) schedule(); }, { passive: true });

  var relayout = function () { build(); schedule(); };
  if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(stage);
  window.addEventListener('resize', relayout);
  var onMQ = function () { resetTilt(); relayout(); };
  if (rowMQ.addEventListener) rowMQ.addEventListener('change', onMQ); else if (rowMQ.addListener) rowMQ.addListener(onMQ);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);

  // 화면 안팎: 등장 시작 · 반복 정지 (탭 패널이 숨어 있으면 '밖')
  if (hasIO) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        visible = en.isIntersecting;
        if (visible) { if (!ready) build(); check(); }
        syncLive();
      });
    }, { rootMargin: '80px 0px' }).observe(stage);
  }

  // 왼쪽 아래 '움직임 멈추기/켜기'
  document.addEventListener('doogo:motion', function (e) {
    var off = e && e.detail && typeof e.detail.off === 'boolean' ? e.detail.off : motionOff();
    if (off) finalize(); else { resetTilt(); syncLive(); }
  });
})();
