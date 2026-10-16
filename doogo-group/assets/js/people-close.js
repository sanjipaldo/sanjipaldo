/* =========================================================
   DOOGO GROUP — people-close.js (사람들 마무리 배너 '3D 링' · 22차)
   leadership.html .cbx--orbit [data-orbit] — 스타일 assets/css/people-close.css
   · 카드 7장(두고 사람들 6 + '+ YOU')을 원 위에 두고 매 프레임 x = sin θ · R, z = cos θ · R 로 원근 투영
     → 깊이에 따라 크기 · 투명도 · 밝기 · 흐림 · 쌓임 순서가 바뀌고, 가장 앞 카드에 .is-front (이름 · 테두리 빛)
   · 한 바퀴 약 34초로 천천히 돎(앞 카드가 왼쪽으로) · 마우스를 올리면 가까운 카드에 맞춰 멈춤
   · 끌기 · 밀기로 돌리기(놓으면 관성) · 마우스 위치에 따라 시점이 살짝 기욺(터치는 없음)
   · 화면에 들어오면 .is-live — 카드가 가운데에서 돌며 펼쳐지는 등장
   · 화면 밖이거나 탭이 가려지면 프레임 루프를 멈춤
   · '움직임 멈추기'(html.motion-off): 회전 · 등장 · 끌기 없이 '+ YOU' 카드가 앞인 정지 구도, doogo:motion 이벤트로 바로 전환
   ========================================================= */
(function () {
  'use strict';
  var root = document.querySelector('[data-orbit]');
  if (!root) return;
  var stage = root.querySelector('.orb-stage');
  var scene = root.querySelector('.orb-scene');
  var ring = root.querySelector('.orb-ring');
  var floor = root.querySelector('.orb-floor');
  var disc = root.querySelector('.orb-disc');
  var aura = root.querySelector('.orb-aura');
  if (!stage || !ring || !scene) return;
  var cards = Array.prototype.slice.call(ring.querySelectorAll('.orb-card'));
  var N = cards.length;
  if (N < 3) return;

  var TAU = Math.PI * 2, STEP = TAU / N;
  var AUTO = -TAU / 34;              // 평균 회전 속도(rad/s) — 한 바퀴 34초
  var LINGER_A = .42, LINGER_B = 1.1; // 카드가 정면에 올 때 느려지고(×.42) 사이에서 빨라짐 — 평균은 AUTO 그대로
  var LINGER_K = Math.sqrt(LINGER_A * (LINGER_A + LINGER_B));
  var CAM = 4;                       // 카메라 거리 = 반지름 × 4 → 크기 앞 1 · 옆 .75 · 뒤 .6
  var REST = -(N - 1) * STEP;        // 정지 구도: 마지막 카드('+ YOU')가 앞
  var START = 0;                     // 움직일 때 첫 구도: 첫 카드(문원오)가 앞
  var INTRO_MS = 2000;
  var motionOff = function () { return !!(window.DOOGO && window.DOOGO.motionOff && window.DOOGO.motionOff()); };
  var now = function () { return (window.performance && performance.now) ? performance.now() : Date.now(); };

  var base = START, vel = AUTO;
  var intro = 0, introT0 = 0;
  var R = 240, cw = 200, ch = 266, lift = 150, rxBase = 260;
  var useBlur = true;                // 좁은 화면(휴대폰)은 흐림 필터 없이 그늘만
  var mx = 0, my = 0, px = 0, py = 0;   // 마우스(-1..1) · 부드럽게 따라가는 값
  var hover = false, drag = null;
  var inView = false, live = false, raf = 0, last = 0, front = -1;
  // 깊이 그늘: 카드마다 어두운 막을 하나 넣고 투명도만 바꿈(합성 단계에서 처리돼 가벼움) — brightness 필터 대신
  var shades = cards.map(function (c) {
    var face = c.querySelector('.orb-face') || c;
    var sh = document.createElement('i');
    sh.className = 'orb-shade';
    face.appendChild(sh);
    return sh;
  });
  var memo = cards.map(function () { return { t: '', o: '', f: '', z: '', s: '' }; });
  var memoScene = '', memoDisc = '', memoAura = '';

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 4); }

  /* 크기 재기 — 카드 크기는 CSS(--cw), 반지름은 무대 폭 안에 들어오게 */
  function measure() {
    var W = stage.clientWidth;
    cw = cards[0].offsetWidth || 200;
    ch = cards[0].offsetHeight || cw * 4 / 3;
    R = Math.max(cw * .9, Math.min(cw * 1.5, (W / 2 - cw * .42) / .79));
    lift = ch * .95;
    useBlur = W > 560;
    rxBase = R * .8 + cw * .12;
    if (floor) {
      var g = floorGeo(R, lift);
      floor.style.setProperty('--rx', rxBase.toFixed(1) + 'px');
      floor.style.setProperty('--ry', g.ry.toFixed(1) + 'px');
      floor.style.setProperty('--cy', g.cy.toFixed(1) + 'px');
    }
  }
  // 카드 아래 끝이 그리는 타원(앞 카드 아래 · 뒤 카드 아래의 가운데)
  function floorGeo(r, lf) {
    var sBack = (CAM - 1) / (CAM + 1);
    var yf = ch / 2 + ch * .03, yb = -(1 - sBack) * lf + sBack * ch / 2;
    return { cy: (yf + yb) / 2, ry: (yf - yb) / 2 + ch * .03 };
  }

  function setFront(i) {
    if (i === front) return;
    if (front > -1) cards[front].classList.remove('is-front');
    front = i;
    cards[i].classList.add('is-front');
  }

  function render() {
    var e = easeOut(intro);
    var r = R * (.3 + .7 * e);
    var yaw = px * .16;
    var lf = lift * (1 - py * .3);
    var a0 = base + yaw + (1 - e) * 2.6;          // 등장: 빠르게 돌며 제자리로
    var fade = clamp(intro * 1.8, 0, 1);
    var best = -2, bi = 0;
    for (var i = 0; i < N; i++) {
      var th = a0 + i * STEP, sn = Math.sin(th), cs = Math.cos(th);
      var s = (CAM - 1) / (CAM - cs);
      var t = (cs + 1) / 2;                        // 0 뒤 · 1 앞
      var x = sn * r * s, y = -(1 - s) * lf;
      var sc = s * (.7 + .3 * e);
      var tr = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) scale(' + sc.toFixed(4) + ') perspective(900px) rotateY(' + (sn * 26).toFixed(2) + 'deg)';
      var op = (clamp(.42 + t * 1.25, 0, 1) * fade).toFixed(3);   // 앞쪽 절반은 불투명 · 뒤로 갈수록 옅게
      var sh = ((1 - t) * .6).toFixed(2);                                   // 뒤로 갈수록 어둡게
      var f = !useBlur ? 'none' : (cs < -.62 ? 'blur(1.6px)' : (cs < -.2 ? 'blur(.8px)' : 'none'));  // 뒤쪽만 흐리게(단계로 — 바뀔 때만 다시 그림)
      var z = String(10 + Math.round(t * 100));
      var m = memo[i], st = cards[i].style;
      if (m.t !== tr) { st.transform = tr; m.t = tr; }
      if (m.o !== op) { st.opacity = op; m.o = op; }
      if (m.f !== f) { st.filter = f; m.f = f; }
      if (m.s !== sh) { shades[i].style.opacity = sh; m.s = sh; }
      if (m.z !== z) { st.zIndex = z; m.z = z; }
      if (cs > best) { best = cs; bi = i; }
    }
    setFront(bi);

    // 바닥 원판: 링 반지름 · 시점 높이에 맞춰 눌림, 눈금은 링과 함께 회전
    if (disc) {
      var g = floorGeo(r, lf);
      var kx = (r * .8 + cw * .12) / rxBase, ky = g.ry / rxBase;
      var dt = 'translate3d(0,' + g.cy.toFixed(1) + 'px,0) scale(' + kx.toFixed(4) + ',' + ky.toFixed(4) + ') rotate(' + (-a0 * 180 / Math.PI).toFixed(2) + 'deg)';
      if (dt !== memoDisc) { disc.style.transform = dt; memoDisc = dt; }
    }
    // 마우스 시차: 무대는 살짝 반대로, 빛 번짐은 같은 쪽으로
    var sc2 = 'translate3d(' + (px * -10).toFixed(1) + 'px,' + (py * -6).toFixed(1) + 'px,0)';
    if (sc2 !== memoScene) { scene.style.transform = sc2; memoScene = sc2; }
    if (aura) {
      var au = 'translate3d(' + (px * 26).toFixed(1) + 'px,' + (py * 16).toFixed(1) + 'px,0)';
      if (au !== memoAura) { aura.style.transform = au; memoAura = au; }
    }
  }

  function running() { return live && inView && !document.hidden && !motionOff(); }
  function schedule() { if (!raf && running()) { raf = requestAnimationFrame(frame); } }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  function frame(ts) {
    raf = 0;
    var dt = clamp((ts - last) / 1000, 0, .1);
    last = ts;
    if (intro < 1) intro = clamp((now() - introT0) / INTRO_MS, 0, 1);
    if (!drag) {
      var paused = hover && intro >= 1;
      var sw = Math.sin(Math.PI * (base / STEP - Math.round(base / STEP)));
      var cruise = AUTO * LINGER_K * (LINGER_A + LINGER_B * sw * sw);   // 정면에서 잠시 머무는 듯한 연속 회전
      vel += ((paused ? 0 : cruise) - vel) * (1 - Math.exp(-dt * (paused ? 5 : 1.6)));
      if (paused) {                                 // 가까운 카드가 정면에 오도록 살며시
        var snap = Math.round(base / STEP) * STEP;
        vel += (snap - base) * 9 * dt;
      }
      base += vel * dt;
      if (Math.abs(base) > TAU * 8) base %= TAU;
    }
    var k = 1 - Math.exp(-dt * 3);
    px += (mx - px) * k; py += (my - py) * k;
    render();
    schedule();
  }

  function begin() {
    if (live) return;
    live = true;
    stage.classList.add('is-live');
    introT0 = now();
    last = introT0;
    schedule();
  }

  /* 움직임 멈추기 ↔ 켜기 */
  function applyMotion() {
    if (motionOff()) {
      stop();
      drag = null; hover = false;
      stage.classList.remove('is-drag');
      live = true; intro = 1;
      stage.classList.add('is-live');
      base = REST; vel = AUTO;
      mx = my = px = py = 0;
      render();
    } else {
      last = now();
      schedule();
    }
  }

  /* 끌기 · 밀기 */
  function onDown(e) {
    if (motionOff() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag = { id: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY, b0: base, lx: e.clientX, lt: now(), v: 0, on: false };
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.on) {
      if (Math.abs(dx) < 6) {
        if (Math.abs(dy) > 10) drag = null;          // 세로로 움직이면 스크롤에 양보
        return;
      }
      drag.on = true;
      drag.x0 = e.clientX; drag.b0 = base;
      stage.classList.add('is-drag');
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    }
    var unit = R * .9;
    base = drag.b0 + (e.clientX - drag.x0) / unit;
    var tn = now(), ddt = (tn - drag.lt) / 1000;
    if (ddt > 0) drag.v = drag.v * .55 + ((e.clientX - drag.lx) / unit / ddt) * .45;
    drag.lx = e.clientX; drag.lt = tn;
    if (!raf) { render(); schedule(); }
    if (e.cancelable && drag.type !== 'mouse') e.preventDefault();
  }
  function onUp(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    if (drag.on) {
      var idle = (now() - drag.lt) / 1000;          // 멈췄다 놓으면 관성 없이
      vel = clamp(idle > .12 ? 0 : drag.v, -5, 5);
      stage.classList.remove('is-drag');
      try { stage.releasePointerCapture(drag.id); } catch (err) {}
    }
    drag = null;
  }
  stage.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  stage.addEventListener('dragstart', function (e) { e.preventDefault(); });

  /* 마우스를 올리면 멈춤 · 시점 기울기(마우스만) */
  stage.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') hover = true; });
  stage.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hover = false; });
  root.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse' || motionOff()) return;
    var sr = stage.getBoundingClientRect(), rr = root.getBoundingClientRect();
    mx = clamp((e.clientX - (sr.left + sr.width / 2)) / (rr.width / 2), -1, 1);
    my = clamp((e.clientY - (sr.top + sr.height / 2)) / (rr.height / 2), -1, 1);
  });
  root.addEventListener('pointerleave', function () { mx = 0; my = 0; });

  /* 화면 안팎 · 탭 가림 */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (ens) {
      ens.forEach(function (en) {
        inView = en.isIntersecting;
        if (inView) { last = now(); schedule(); } else stop();
      });
    }, { threshold: 0 }).observe(root);
    new IntersectionObserver(function (ens, ob) {
      ens.forEach(function (en) { if (en.isIntersecting) { begin(); ob.disconnect(); } });
    }, { threshold: .3 }).observe(stage);
  } else {
    inView = true; begin();
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else { last = now(); schedule(); }
  });
  document.addEventListener('doogo:motion', applyMotion);

  var rzT = 0;
  function onResize() {
    clearTimeout(rzT);
    rzT = setTimeout(function () { measure(); render(); }, 80);
  }
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(stage);
  else window.addEventListener('resize', onResize);

  measure();
  stage.classList.add('is-ready');
  if (motionOff()) applyMotion(); else render();
})();
