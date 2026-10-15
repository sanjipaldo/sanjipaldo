/* =========================================================
   DOOGO GROUP — about-loc.js (그룹 소개 · 05 국내외 거점 탭)
   · 3D 거점 지도(canvas): 아시아·태평양 점 지도를 원근으로 눕힌 판 위에
     대한민국 · 뉴질랜드 거점이 빛기둥으로 솟고, 두 거점을 잇는 곡선 위로 빛 점이 오갑니다.
     처음 보일 때: 카메라가 내려앉으며 점들이 대한민국에서부터 물결처럼 떠오름 → 대한민국 빛기둥 → 곡선 그리기 → 뉴질랜드 빛기둥.
     이후: 천천히 흔들리는 카메라 · 핀 파동 · 빛 점이 닿으면 지도 위로 퍼지는 물결 · (마우스) 포인터 기울기.
   · 거점 카드: 포인터 기울기 · 빛 반사, 카드에 올리면 지도에서 그 거점을 강조.
   지도 데이터는 같은 <figure> 안의 대체 SVG(점 경로)를 그대로 읽어 씁니다(스크립트가 없으면 그 SVG 가 보임).
   탭 패널이 숨어 있다가 보이면(크기 0 → 실제 크기) 다시 등장 모션을 재생, 화면 밖이면 멈춤.
   움직임 멈추기(html.motion-off · window.DOOGO.motionOff() · 'doogo:motion')면 마지막 정지 화면만 그립니다.
   html.soft-motion(OS 애니메이션 줄이기) 기기는 포인터 기울기만 뺍니다.
   ========================================================= */
(function () {
  'use strict';
  var sec = document.getElementById('locations');
  if (!sec) return;
  var doc = document.documentElement;
  var motionOff = function () {
    return (window.DOOGO && typeof window.DOOGO.motionOff === 'function') ? !!window.DOOGO.motionOff() : doc.classList.contains('motion-off');
  };
  var soft = function () { return doc.classList.contains('soft-motion'); };
  var fine = function () { try { return window.matchMedia('(hover: hover) and (pointer: fine)').matches; } catch (e) { return false; } };
  var tiltOk = function () { return !motionOff() && !soft() && fine(); };
  var hasIO = 'IntersectionObserver' in window;
  var clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  var c01 = function (v) { return v < 0 ? 0 : (v > 1 ? 1 : v); };
  var easeOut3 = function (t) { t = c01(t); return 1 - (1 - t) * (1 - t) * (1 - t); };
  var easeInOut = function (t) { t = c01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var easeOutBack = function (t) { t = c01(t); var c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  var sstep = function (a, b, v) { var t = c01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  var TAU = Math.PI * 2;

  var map = null; // 지도 모듈(카드 → 지도 강조)

  /* =========================================================
     1. 거점 카드 — 포인터 기울기 · 빛 반사 · 지도 강조
     ========================================================= */
  var cards = Array.prototype.slice.call(sec.querySelectorAll('[data-gl-card]'));
  cards.forEach(function (card) {
    var face = card.querySelector('.ab-gl-face');
    var key = card.getAttribute('data-gl-card');
    var rect = null, raf = 0, px = 0.5, py = 0.5;
    var apply = function () {
      raf = 0;
      if (!face) return;
      face.style.setProperty('--rx', ((0.5 - py) * 5).toFixed(2) + 'deg');
      face.style.setProperty('--ry', ((px - 0.5) * 6).toFixed(2) + 'deg');
      face.style.setProperty('--px', (px - 0.5).toFixed(3));
      face.style.setProperty('--py', (py - 0.5).toFixed(3));
      face.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      face.style.setProperty('--my', (py * 100).toFixed(1) + '%');
    };
    var reset = function () {
      if (!face) return;
      ['--rx', '--ry', '--px', '--py', '--mx', '--my'].forEach(function (p) { face.style.removeProperty(p); });
    };
    var on = function () { card.classList.add('is-hover'); if (map) map.focus(key); };
    var off = function () {
      card.classList.remove('is-hover');
      if (map) map.focus(null);
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      reset(); rect = null;
    };
    card.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse' || e.pointerType === 'pen') { rect = card.getBoundingClientRect(); on(); } });
    card.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      if (!tiltOk()) return;
      if (!rect) rect = card.getBoundingClientRect();
      px = c01((e.clientX - rect.left) / Math.max(1, rect.width));
      py = c01((e.clientY - rect.top) / Math.max(1, rect.height));
      if (!raf) raf = requestAnimationFrame(apply);
    });
    card.addEventListener('pointerleave', off);
    card.addEventListener('focusin', function () { card.classList.add('is-hover'); if (map) map.focus(key); });
    card.addEventListener('focusout', function (e) { if (!card.contains(e.relatedTarget)) off(); });
  });
  // 카드 안의 무한 모션(구슬 자오선 · 미니 지도 파동)은 화면에 보일 때만
  if (hasIO && cards.length) {
    var cardIO = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) { en.target.classList.toggle('is-paused', !en.isIntersecting); });
    }, { rootMargin: '60px 0px' });
    cards.forEach(function (c) { c.classList.add('is-paused'); cardIO.observe(c); });
  }

  /* =========================================================
     2. 3D 거점 지도
     ========================================================= */
  var fig = sec.querySelector('[data-gl-map]');
  var cv = fig && fig.querySelector('.ab-gl-cv');
  var ctx = null;
  try { ctx = cv && cv.getContext ? cv.getContext('2d') : null; } catch (e) { ctx = null; }
  var srcLand = fig && fig.querySelector('[data-gl-dots]');
  if (!fig || !ctx || !srcLand) return;

  /* ---------- 데이터: 대체 SVG 의 점(10px 격자 · 경위도 1°≈9.8px) ---------- */
  var GW = 91, GH = 103;
  var readGrid = function (path) {
    var g = new Uint8Array(GW * GH);
    if (!path) return g;
    var d = path.getAttribute('d') || '', re = /M\s*(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)/g, m;
    while ((m = re.exec(d))) {
      var gx = Math.round(+m[1] / 10), gy = Math.round(+m[2] / 10);
      if (gx >= 0 && gx < GW && gy >= 0 && gy < GH) g[gy * GW + gx] = 1;
    }
    return g;
  };
  var gLand = readGrid(srcLand), gKR = readGrid(fig.querySelector('[data-gl-hl="kr"]')), gNZ = readGrid(fig.querySelector('[data-gl-hl="nz"]'));
  for (var gi = 0; gi < gLand.length; gi++) if (gKR[gi] || gNZ[gi]) gLand[gi] = 1;
  var bil = function (g, u, v) {
    var x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    var G = function (x, y) { return (x >= 0 && x < GW && y >= 0 && y < GH) ? g[y * GW + x] : 0; };
    return G(x0, y0) * (1 - fx) * (1 - fy) + G(x0 + 1, y0) * fx * (1 - fy) + G(x0, y0 + 1) * (1 - fx) * fy + G(x0 + 1, y0 + 1) * fx * fy;
  };

  // 지도 좌표(SVG px) → 세계 좌표: X = 동쪽(+), Z = 남쪽(+, 카메라 쪽), Y = 위
  var MCX = 450, MCZ = 510;
  var PINS = {
    kr: { mx: 330, my: 162, h: 230, grow: 0, int: 1, intT: 1, el: null, on: false, flip: false, w: 0, hgt: 0 },
    nz: { mx: 783, my: 930, h: 205, grow: 0, int: 1, intT: 1, el: null, on: false, flip: false, w: 0, hgt: 0 }
  };
  var pinKeys = ['kr', 'nz'];
  pinKeys.forEach(function (k) {
    var p = PINS[k];
    p.key = k;
    p.X = p.mx - MCX; p.Z = p.my - MCZ;
    p.el = fig.querySelector('[data-gl-label="' + k + '"]');
  });
  var countEl = fig.querySelector('[data-gl-count]');

  // 점 만들기: 원래 격자 사이를 촘촘히(S 배) 채우되 해안선은 넓히지 않음(이웃이 모두 육지일 때만)
  var ORD = null, N = 0, DX, DZ, DT, DF, DK, DN, DP, DL, SX, SY, SS, LV, density = 0, maxDK = 1;
  var buildDots = function (S) {
    if (S === density) return;
    density = S;
    var list = [];
    for (var j = 0; j <= (GH - 1) * S; j++) {
      for (var i = 0; i <= (GW - 1) * S; i++) {
        var u = i / S, v = j / S;
        if (bil(gLand, u, v) < 0.55) continue;
        var mx = u * 10, my = v * 10;
        // 가장자리(데이터가 잘린 서쪽 · 북쪽)는 부드럽게 사라지게
        var f = sstep(-20, 130, mx) * sstep(-20, 150, my) * (1 - sstep(870, 905, mx)) * (1 - sstep(1000, 1022, my));
        var r = Math.sqrt(Math.pow((mx - 520) / 520, 2) + Math.pow((my - 560) / 600, 2));
        f *= 1 - 0.3 * sstep(0.6, 1.2, r);
        if (f < 0.03) continue;
        var t = bil(gKR, u, v) >= 0.55 ? 1 : (bil(gNZ, u, v) >= 0.55 ? 2 : 0);
        list.push(mx, my, t, f);
      }
    }
    N = list.length / 4;
    DX = new Float32Array(N); DZ = new Float32Array(N); DT = new Uint8Array(N); DF = new Float32Array(N);
    DK = new Float32Array(N); DN = new Float32Array(N); DP = new Float32Array(N); DL = new Float32Array(N);
    SX = new Float32Array(N); SY = new Float32Array(N); SS = new Float32Array(N); LV = new Uint8Array(N);
    maxDK = 1;
    for (var n = 0; n < N; n++) {
      var x = list[n * 4], y = list[n * 4 + 1];
      DX[n] = x - MCX; DZ[n] = y - MCZ; DT[n] = list[n * 4 + 2]; DF[n] = list[n * 4 + 3];
      DK[n] = Math.sqrt((x - PINS.kr.mx) * (x - PINS.kr.mx) + (y - PINS.kr.my) * (y - PINS.kr.my));
      DN[n] = Math.sqrt((x - PINS.nz.mx) * (x - PINS.nz.mx) + (y - PINS.nz.my) * (y - PINS.nz.my));
      DP[n] = ((Math.sin(n * 12.9898 + x * 0.071) * 43758.5453) % 1 + 1) % 1 * TAU;
      if (DK[n] > maxDK) maxDK = DK[n];
    }
    for (var q = 0; q < N; q++) DL[q] = 0.15 + (DK[q] / maxDK) * 1.35 + (DP[q] / TAU) * 0.12; // 등장 지연(대한민국에서 퍼져 나감)
  };

  // 두 거점을 잇는 곡선: 판 위 직선 + 동쪽으로 살짝 휨 + 위로 솟음
  var ARC_N = 72, AX = new Float32Array(ARC_N + 1), AY = new Float32Array(ARC_N + 1), AZ = new Float32Array(ARC_N + 1);
  var buildArc = function (hk) {
    var a = PINS.kr, b = PINS.nz, dx = b.X - a.X, dz = b.Z - a.Z, len = Math.sqrt(dx * dx + dz * dz);
    var px = dz / len, pz = -dx / len; // 오른쪽(동북쪽)으로 휘는 방향
    for (var i = 0; i <= ARC_N; i++) {
      var t = i / ARC_N, s = Math.sin(Math.PI * t);
      AX[i] = a.X + dx * t + px * len * 0.13 * s;
      AZ[i] = a.Z + dz * t + pz * len * 0.13 * s;
      AY[i] = len * hk * s;
    }
  };
  buildArc(0.27);

  // 공기 중 먼지(깊이감)
  var MOTES = [];
  for (var mi = 0; mi < 42; mi++) {
    var rr = function (s) { var v = Math.sin(mi * 78.233 + s * 12.9898) * 43758.5453; return v - Math.floor(v); };
    MOTES.push({ x: -430 + rr(1) * 860, z: -420 + rr(2) * 900, y: 20 + rr(3) * 300, sp: 4 + rr(4) * 8, a: 0.25 + rr(5) * 0.5, ph: rr(6) * TAU });
  }

  /* ---------- 카메라 · 투영 ---------- */
  var BASE = { el: 0.8, yaw: -0.44, dist: 1400, tx: 40, tz: 60 };
  var cam = { x: 0, y: 0, z: 0, rx: 1, rz: 0, ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: -1 };
  var F = 1, OX = 0, OY = 0, kMin = 0, kMax = 1;
  var setCam = function (el, yaw, dist, tx, tz) {
    var ce = Math.cos(el), se = Math.sin(el), cy = Math.cos(yaw), sy = Math.sin(yaw);
    cam.x = tx + dist * ce * sy; cam.y = dist * se; cam.z = tz + dist * ce * cy;
    cam.fx = -ce * sy; cam.fy = -se; cam.fz = -ce * cy;
    cam.rx = cy; cam.rz = -sy;
    cam.ux = -sy * se; cam.uy = ce; cam.uz = -cy * se;
  };
  var PT = { x: 0, y: 0, k: 1 };
  var proj = function (X, Y, Z, o) {
    var dx = X - cam.x, dy = Y - cam.y, dz = Z - cam.z;
    var z = dx * cam.fx + dy * cam.fy + dz * cam.fz;
    if (z < 10) z = 10;
    var k = F / z;
    o.x = OX + (dx * cam.rx + dz * cam.rz) * k;
    o.y = OY - (dx * cam.ux + dy * cam.uy + dz * cam.uz) * k;
    o.k = k;
    return o;
  };

  /* ---------- 캔버스 크기 · 화면 맞춤 ---------- */
  var W = 0, H = 0, dpr = 1, dprCap = 2, cssW = 0, cssH = 0, sized = false, compact = false;
  var perf = { n: 0, sum: 0, tries: 0 }; // 느린 기기면 해상도를 한 단계씩 낮춤
  var bg = document.createElement('canvas'), bgx = bg.getContext('2d');
  var glow = document.createElement('canvas');
  (function () { // 둥근 빛 스프라이트
    glow.width = glow.height = 128;
    var g = glow.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.18, 'rgba(190,220,255,.75)');
    gr.addColorStop(0.45, 'rgba(80,150,255,.28)');
    gr.addColorStop(1, 'rgba(40,110,240,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  })();
  var paintBg = function () {
    bg.width = W; bg.height = H;
    var g = bgx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#060E1E'); g.addColorStop(0.5, '#0A1630'); g.addColorStop(1, '#081227');
    bgx.fillStyle = g; bgx.fillRect(0, 0, W, H);
    // 판 아래 깔리는 푸른 빛 · 위쪽 지평선 안개
    proj(80, 0, 120, PT);
    var r1 = bgx.createRadialGradient(PT.x, PT.y, 0, PT.x, PT.y, Math.max(W, H) * 0.62);
    r1.addColorStop(0, 'rgba(10,93,226,.30)'); r1.addColorStop(0.55, 'rgba(10,93,226,.08)'); r1.addColorStop(1, 'rgba(10,93,226,0)');
    bgx.fillStyle = r1; bgx.fillRect(0, 0, W, H);
    var r2 = bgx.createRadialGradient(W * 0.5, -H * 0.1, 0, W * 0.5, -H * 0.1, H * 0.7);
    r2.addColorStop(0, 'rgba(111,162,242,.16)'); r2.addColorStop(1, 'rgba(111,162,242,0)');
    bgx.fillStyle = r2; bgx.fillRect(0, 0, W, H);
  };
  var fit = function () {
    setCam(BASE.el, BASE.yaw, BASE.dist, BASE.tx, BASE.tz);
    F = 1; OX = 0; OY = 0;
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, n, add = function () {
      if (PT.x < minX) minX = PT.x; if (PT.x > maxX) maxX = PT.x;
      if (PT.y < minY) minY = PT.y; if (PT.y > maxY) maxY = PT.y;
    };
    for (n = 0; n < N; n++) { if (DF[n] < 0.72) continue; proj(DX[n], 0, DZ[n], PT); add(); }
    pinKeys.forEach(function (k) { topOf(PINS[k], PT); add(); });
    for (n = 0; n <= ARC_N; n += 6) { proj(AX[n], AY[n], AZ[n], PT); add(); }
    var padL = W * (compact ? 0.03 : 0.04), padR = padL, padT = H * (compact ? 0.13 : 0.15), padB = H * (compact ? 0.13 : 0.05);
    var lab = (PINS.nz.w + 34) * dpr;
    for (var it = 0; it < 4; it++) {
      var aw = W - padL - padR, ah = H - padT - padB;
      F = Math.min(aw / (maxX - minX), ah / (maxY - minY));
      OX = padL + (aw - F * (maxX - minX)) / 2 - F * minX;
      OY = padT + (ah - F * (maxY - minY)) / 2 - F * minY;
      if (compact) break;
      topOf(PINS.nz, PT); // 뉴질랜드 이름표가 기둥 오른쪽에 들어갈 자리
      var over = PT.x + lab - (W - 10 * dpr);
      if (over <= 1) break;
      padR += over;
    }
    // 깊이 범위(가까울수록 크고 밝게)
    kMin = 1e9; kMax = -1e9;
    for (n = 0; n < N; n += 7) { proj(DX[n], 0, DZ[n], PT); if (PT.k < kMin) kMin = PT.k; if (PT.k > kMax) kMax = PT.k; }
    if (kMax - kMin < 1e-6) kMax = kMin + 1e-6;
  };
  var measureLabels = function () {
    pinKeys.forEach(function (k) {
      var p = PINS[k];
      if (!p.el) return;
      var inn = p.el.firstElementChild || p.el;
      p.w = inn.offsetWidth; p.hgt = inn.offsetHeight;
    });
  };
  var resize = function () {
    var w = fig.clientWidth, h = fig.clientHeight;
    if (!w || !h) { sized = false; return false; }
    var d = Math.min(window.devicePixelRatio || 1, dprCap);
    if (w === cssW && h === cssH && d === dpr && sized) return true;
    cssW = w; cssH = h; dpr = d;
    compact = w < 560;
    W = Math.round(w * dpr); H = Math.round(h * dpr);
    cv.width = W; cv.height = H;
    buildDots(w >= 560 ? 2 : 1);
    buildArc(compact ? 0.22 : 0.27);
    measureLabels();
    fit();
    paintBg();
    sized = true;
    return true;
  };

  /* ---------- 상태 · 시계 ---------- */
  // phase: idle(아직) → intro(등장) → live(계속) · final(움직임 멈추기 = 정지 화면)
  var phase = 'idle', clock = 0, introT = 0, liveT = 0, lastCycle = -1, last = 0, raf = 0, visible = false, wasHidden = false;
  var waves = []; // 판 위로 퍼지는 물결 {key, t0, amp}
  var focusKey = null;
  var ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  var CYCLE = 5.8, TRAVEL = 2.7;

  var setCount = function (s) { if (countEl && countEl.textContent !== s) countEl.textContent = s; };
  var setLabel = function (k, on) {
    var p = PINS[k];
    if (p.on === on || !p.el) return;
    p.on = on;
    p.el.classList.toggle('is-on', on);
  };

  /* ---------- 그리기 ---------- */
  var NB = 9;
  var TIER = [[146, 170, 214], [196, 222, 255], [118, 174, 255]];
  var FILL = [];
  for (var ti = 0; ti < 3; ti++) for (var li = 0; li < NB; li++) FILL.push('rgba(' + TIER[ti].join(',') + ',' + ((li + 0.6) / NB).toFixed(3) + ')');

  var planeXf = function (X, Z) { // 판 위의 한 점에서 판과 나란한 국소 변환 (글자 · 원을 판에 눕힘)
    var p0x, p0y;
    proj(X, 0, Z, PT); p0x = PT.x; p0y = PT.y;
    proj(X + 1, 0, Z, PT); var ax = PT.x - p0x, ay = PT.y - p0y;
    proj(X, 0, Z + 1, PT); var bx = PT.x - p0x, by = PT.y - p0y;
    ctx.setTransform(ax, ay, bx, by, p0x, p0y);
    return Math.sqrt(Math.abs(ax * by - ay * bx)); // 대략의 배율
  };

  var drawGrid = function (rev) {
    if (rev <= 0) return;
    ctx.lineWidth = 1 * dpr;
    var seg = 34, i, s, x0, y0, a;
    var fadeAt = function (mx, my) { return sstep(0, 220, mx) * sstep(0, 260, my) * (1 - sstep(820, 900, mx)) * (1 - sstep(960, 1020, my)); };
    // 선을 짧게 나눠 가장자리로 갈수록 흐리게 — 같은 밝기 단계끼리 한 번에 그림
    var LVN = 6, segs = [], L;
    for (L = 0; L < LVN; L++) segs.push([]);
    var line = function (ax, ay, bx, by) {
      for (i = 0; i < seg; i++) {
        var t0 = i / seg, t1 = (i + 1) / seg, tm = (t0 + t1) / 2;
        a = fadeAt(ax + (bx - ax) * tm, ay + (by - ay) * tm);
        if (a < 0.05) continue;
        proj(ax + (bx - ax) * t0 - MCX, 0, ay + (by - ay) * t0 - MCZ, PT); x0 = PT.x; y0 = PT.y;
        proj(ax + (bx - ax) * t1 - MCX, 0, ay + (by - ay) * t1 - MCZ, PT);
        segs[Math.min(LVN - 1, (a * LVN) | 0)].push(x0, y0, PT.x, PT.y);
      }
    };
    var flush = function (base, rgb) {
      for (L = 0; L < LVN; L++) {
        var g = segs[L];
        if (!g.length) continue;
        ctx.strokeStyle = 'rgba(' + rgb + ',' + (base * rev * (L + 0.5) / LVN).toFixed(3) + ')';
        ctx.beginPath();
        for (var q = 0; q < g.length; q += 4) { ctx.moveTo(g[q], g[q + 1]); ctx.lineTo(g[q + 2], g[q + 3]); }
        ctx.stroke();
        segs[L] = [];
      }
    };
    for (s = 70; s <= 970; s += 150) if (s !== 520) line(0, s, 900, s);
    for (s = 100; s <= 850; s += 150) line(s, 0, s, 1020);
    flush(0.085, '200,215,240');
    ctx.setLineDash([4 * dpr, 6 * dpr]);
    line(0, 520, 900, 520);
    flush(0.42, '111,162,242');
    ctx.setLineDash([]);
    // 판에 누운 좌표 글자
    ctx.save();
    ctx.fillStyle = '#9FBDEB';
    ctx.font = '600 15px Outfit, Pretendard, sans-serif';
    ctx.textBaseline = 'alphabetic';
    var tag = function (txt, mx, my, al) { // 글자 전체가 화면 안에 있을 때만
      proj(mx - MCX, 0, my - MCZ, PT);
      var m = 14 * dpr;
      if (PT.x < m || PT.y < m * 2 || PT.y > H - m) return;
      proj(mx + 15 * txt.length * 0.62 - MCX, 0, my - MCZ, PT);
      if (PT.x > W - m) return;
      planeXf(mx - MCX, my - MCZ);
      ctx.globalAlpha = al * rev;
      ctx.fillText(txt, 0, 0);
    };
    tag('EQUATOR 0\u00B0', 700, 506, 0.55);
    tag('180\u00B0', 812, 1004, 0.4);
    if (!compact) tag('45\u00B0S', 150, 962, 0.4);
    ctx.restore();
  };

  var drawDots = function (introAge, final) {
    var counts = new Int32Array(3 * NB), n, i, w;
    var R = (density === 2 ? 2.75 : 4.4);
    var nw = waves.length;
    for (n = 0; n < N; n++) {
      var a = 1, lift = 0;
      if (!final && introAge < 3.2) {
        var tt = (introAge - DL[n]) / 0.6;
        if (tt <= 0) { LV[n] = 255; continue; }
        if (tt < 1) { a = easeOut3(tt); lift = (easeOutBack(tt) - 1) * 30; }
      }
      // 빛기둥 주변 땅은 푸르게 물듦(빛 웅덩이)
      var lit = (Math.exp(-DK[n] * DK[n] / 9000) * PINS.kr.grow * PINS.kr.int + Math.exp(-DN[n] * DN[n] / 9000) * PINS.nz.grow * PINS.nz.int) * 0.5;
      for (w = 0; w < nw; w++) {
        var wv = waves[w], d = wv.key === 'kr' ? DK[n] : DN[n];
        var x = (d - wv.r) / 34;
        if (x > -2.6 && x < 2.6) { var e = Math.exp(-x * x) * wv.amp; lift += e * 10; lit += e; }
      }
      proj(DX[n], lift, DZ[n], PT);
      var depth = (PT.k - kMin) / (kMax - kMin);
      var t = DT[n];
      var al = (t ? 1 : 0.86) * DF[n] * a * (0.6 + 0.4 * c01(depth));
      if (!final) al *= 0.88 + 0.12 * Math.sin(clock * 1.4 + DP[n]);
      al += lit * 0.55 * DF[n];
      if (al < 0.03) { LV[n] = 255; continue; }
      var tier = t ? 2 : (lit > 0.22 ? 1 : 0);
      var lv = Math.min(NB - 1, (al * NB) | 0);
      LV[n] = tier * NB + lv;
      counts[LV[n]]++;
      SX[n] = PT.x; SY[n] = PT.y;
      SS[n] = Math.max(0.9 * dpr, R * PT.k * (t ? 1.28 : 1) * (1 + lit * 0.3));
    }
    // 밝기 단계별로 모아(계수 정렬) 단계마다 한 번씩 채움 · 작은 점은 사각형(가장 가벼움), 큰 점만 원
    var b, off = 0, start = new Int32Array(3 * NB);
    for (b = 0; b < 3 * NB; b++) { start[b] = off; off += counts[b]; }
    if (!ORD || ORD.length < N) ORD = new Int32Array(N);
    var pos = start.slice();
    for (i = 0; i < N; i++) if (LV[i] !== 255) ORD[pos[LV[i]]++] = i;
    var big = 4.6 * Math.max(1, dpr / 1.5);
    for (b = 0; b < 3 * NB; b++) {
      if (!counts[b]) continue;
      ctx.fillStyle = FILL[b];
      ctx.beginPath();
      for (var o = start[b], e2 = start[b] + counts[b]; o < e2; o++) {
        i = ORD[o];
        var s = SS[i];
        if (s < big) { var q = Math.max(1, Math.round(s)); ctx.rect(Math.round(SX[i] - q / 2), Math.round(SY[i] - q / 2), q, q); } // 픽셀에 맞춰 무늬(모아레) 없이
        else { ctx.moveTo(SX[i] + s / 2, SY[i]); ctx.arc(SX[i], SY[i], s / 2, 0, TAU); }
      }
      ctx.fill();
    }
  };

  var arcAt = function (t, o) { // 곡선 위 t(0~1) 지점(세계 좌표)
    var f = c01(t) * ARC_N, i = Math.min(ARC_N - 1, Math.floor(f)), r = f - i;
    o.X = AX[i] + (AX[i + 1] - AX[i]) * r; o.Y = AY[i] + (AY[i + 1] - AY[i]) * r; o.Z = AZ[i] + (AZ[i + 1] - AZ[i]) * r;
    return o;
  };
  var AP = { X: 0, Y: 0, Z: 0 };

  var drawArc = function (prog, final) {
    if (prog <= 0) return;
    var n = Math.max(1, Math.round(ARC_N * prog)), i;
    // 판 위 그림자(점선)
    ctx.setLineDash([2 * dpr, 7 * dpr]);
    ctx.lineWidth = 1.2 * dpr;
    ctx.strokeStyle = 'rgba(111,162,242,.26)';
    ctx.beginPath();
    for (i = 0; i <= n; i++) { proj(AX[i], 0, AZ[i], PT); if (i) ctx.lineTo(PT.x, PT.y); else ctx.moveTo(PT.x, PT.y); }
    ctx.stroke();
    ctx.setLineDash([]);
    // 곡선 본체
    proj(AX[0], AY[0], AZ[0], PT); var sx = PT.x, sy = PT.y;
    proj(AX[ARC_N], AY[ARC_N], AZ[ARC_N], PT);
    var gr = ctx.createLinearGradient(sx, sy, PT.x, PT.y);
    gr.addColorStop(0, 'rgba(150,195,255,.95)'); gr.addColorStop(0.5, 'rgba(235,244,255,.95)'); gr.addColorStop(1, 'rgba(150,195,255,.95)');
    ctx.beginPath();
    for (i = 0; i <= n; i++) { proj(AX[i], AY[i], AZ[i], PT); if (i) ctx.lineTo(PT.x, PT.y); else ctx.moveTo(PT.x, PT.y); }
    if (prog < 1) { arcAt(prog, AP); proj(AP.X, AP.Y, AP.Z, PT); ctx.lineTo(PT.x, PT.y); }
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(60,130,255,.16)'; ctx.lineWidth = 7 * dpr; ctx.stroke();
    ctx.strokeStyle = gr; ctx.globalAlpha = final ? 0.85 : 0.72; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
    ctx.globalAlpha = 1;
    if (prog < 1) { // 그려지는 머리
      arcAt(prog, AP); proj(AP.X, AP.Y, AP.Z, PT);
      var r = 26 * dpr; ctx.drawImage(glow, PT.x - r, PT.y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  var drawPulse = function (q) { // 곡선 위를 지나는 빛 점 + 꼬리
    if (q <= 0 || q >= 1.04) return;
    var head = Math.min(q, 1), tail = Math.max(0, head - 0.26), steps = 22, i;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    var px, py;
    for (i = 0; i <= steps; i++) {
      var t = tail + (head - tail) * (i / steps);
      arcAt(t, AP); proj(AP.X, AP.Y, AP.Z, PT);
      if (i) {
        var f = i / steps;
        ctx.strokeStyle = 'rgba(200,228,255,' + (f * f * 0.9).toFixed(3) + ')';
        ctx.lineWidth = (0.8 + f * 2.4) * dpr;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(PT.x, PT.y); ctx.stroke();
      }
      px = PT.x; py = PT.y;
    }
    var fade = q > 1 ? 1 - (q - 1) / 0.04 : 1;
    var r = 22 * dpr * (0.8 + 0.4 * PT.k / Math.max(kMax, 1e-6));
    ctx.globalAlpha = fade;
    ctx.drawImage(glow, px - r, py - r, r * 2, r * 2);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(px, py, 2.2 * dpr, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
    ctx.globalCompositeOperation = 'source-over';
  };

  var drawPinBase = function (p, final) { // 판 위의 빛 웅덩이 + 퍼지는 고리
    if (p.grow <= 0) return;
    ctx.save();
    var sc = planeXf(p.X, p.Z);
    var I = p.int * Math.min(1, p.grow * 1.6);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55 * I;
    ctx.drawImage(glow, -70, -70, 140, 140);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.3 * dpr / Math.max(sc, 1e-3);
    var rings = final ? [0.42] : [(clock / 2.8) % 1, (clock / 2.8 + 0.5) % 1];
    for (var i = 0; i < rings.length; i++) {
      var f = rings[i], rr = 9 + f * 56;
      ctx.strokeStyle = 'rgba(111,170,255,' + ((final ? 0.4 : Math.pow(1 - f, 1.6) * 0.75) * I).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
    }
    // 도착 순간의 큰 고리
    for (var w = 0; w < waves.length; w++) {
      var wv = waves[w];
      if (wv.key !== p.key || wv.age > 1.6) continue;
      var g = wv.age / 1.6;
      ctx.strokeStyle = 'rgba(190,220,255,' + (Math.pow(1 - g, 2) * 0.8 * wv.amp).toFixed(3) + ')';
      ctx.lineWidth = 2 * dpr / Math.max(sc, 1e-3);
      ctx.beginPath(); ctx.arc(0, 0, 12 + easeOut3(g) * 84, 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(235,245,255,' + (0.95 * Math.min(1, p.grow * 2)).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, TAU); ctx.fill();
    ctx.restore();
  };

  var LEAN = 0.35; // 빛기둥은 원근으로 기우는 정도를 줄여 거의 곧게
  var topOf = function (p, o) {
    proj(p.X, 0, p.Z, o); var bx = o.x;
    proj(p.X, p.h, p.Z, o); o.x = bx + (o.x - bx) * LEAN;
    return o;
  };
  var drawPillar = function (p, final) {
    if (p.grow <= 0) return;
    var hgt = p.h * easeOut3(p.grow), I = p.int;
    proj(p.X, 0, p.Z, PT); var bx = PT.x, by = PT.y, k = PT.k;
    proj(p.X, hgt, p.Z, PT); var tx = bx + (PT.x - bx) * LEAN, ty = PT.y;
    var dx = tx - bx, dy = ty - by, len = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / len, ny = dx / len;
    var w0 = 8.5 * k * (0.85 + 0.25 * I);
    ctx.globalCompositeOperation = 'lighter';
    var quad = function (wb, wt, c0, c1) {
      var g = ctx.createLinearGradient(bx, by, tx, ty);
      g.addColorStop(0, c0); g.addColorStop(1, c1);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(bx + nx * wb, by + ny * wb); ctx.lineTo(tx + nx * wt, ty + ny * wt);
      ctx.lineTo(tx - nx * wt, ty - ny * wt); ctx.lineTo(bx - nx * wb, by - ny * wb);
      ctx.closePath(); ctx.fill();
    };
    quad(w0 * 1.9, w0 * 1.15, 'rgba(40,120,255,' + (0.3 * I).toFixed(3) + ')', 'rgba(40,120,255,0)');
    quad(w0 * 0.9, w0 * 0.35, 'rgba(130,190,255,' + (0.75 * Math.min(I, 1.3)).toFixed(3) + ')', 'rgba(111,162,242,0)');
    quad(Math.max(0.6 * dpr, w0 * 0.2), Math.max(0.3 * dpr, w0 * 0.08), 'rgba(255,255,255,' + (0.95 * Math.min(1, I)).toFixed(3) + ')', 'rgba(255,255,255,.05)');
    // 기둥을 타고 오르는 빛 알갱이
    if (!final) {
      for (var j = 0; j < 5; j++) {
        var f = (clock * 0.26 + j / 5 + (p.key === 'nz' ? 0.37 : 0)) % 1;
        var off = ((j * 37) % 7 - 3) * 1.2;
        proj(p.X + off, hgt * f, p.Z - off, PT);
        PT.x = bx + (PT.x - bx) * LEAN;
        var al = Math.sin(Math.PI * f) * 0.85 * Math.min(1, I);
        var r = 7 * dpr;
        ctx.globalAlpha = al;
        ctx.drawImage(glow, PT.x - r, PT.y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    }
    // 꼭대기 빛
    var cr = (14 + 6 * I) * dpr * Math.min(1, p.grow * 1.4);
    ctx.drawImage(glow, tx - cr, ty - cr, cr * 2, cr * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(tx, ty, 2.4 * dpr, 0, TAU); ctx.fill();
  };

  var drawMotes = function (rev) {
    if (rev <= 0) return;
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < MOTES.length; i++) {
      var m = MOTES[i], y = (m.y + clock * m.sp) % 330;
      proj(m.x + Math.sin(clock * 0.3 + m.ph) * 8, y, m.z, PT);
      var depth = c01((PT.k - kMin) / (kMax - kMin));
      var a = m.a * rev * Math.sin(Math.PI * (y / 330)) * (0.35 + 0.65 * depth);
      if (a < 0.02) continue;
      ctx.fillStyle = 'rgba(170,205,255,' + a.toFixed(3) + ')';
      var s = (0.8 + depth * 1.4) * dpr;
      ctx.beginPath(); ctx.arc(PT.x, PT.y, s, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  var placeLabels = function () {
    pinKeys.forEach(function (k) {
      var p = PINS[k];
      if (!p.el) return;
      var gap = 18, pad = 10, mode, x, y;
      if (k === 'nz' && compact) { // 좁은 화면: 뉴질랜드 이름표는 땅 아래쪽(곡선과 겹치지 않게)
        proj(p.X, 0, p.Z, PT);
        x = PT.x / dpr; y = PT.y / dpr;
        mode = 'b';
        x = clamp(x, p.w - 10 + pad, cssW - pad - 10);
        y = Math.min(y, cssH - pad - p.hgt - 18);
      } else {
        topOf(p, PT);
        x = PT.x / dpr; y = PT.y / dpr;
        mode = (x + gap + p.w > cssW - pad) ? 'l' : 'r';
        y = clamp(y, p.hgt / 2 + pad, cssH - p.hgt / 2 - pad);
      }
      if (mode !== p.mode) {
        p.mode = mode;
        p.el.classList.toggle('is-flip', mode === 'l');
        p.el.classList.toggle('is-below', mode === 'b');
      }
      p.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
    });
  };

  /* ---------- 한 장면 ---------- */
  var render = function (final) {
    if (!sized) return;
    var t = introT;
    // 카메라
    var camK = final ? 1 : easeOut3(t / 2.8);
    var el = BASE.el + (1 - camK) * 0.42, yaw = BASE.yaw + (1 - camK) * 0.34, dist = BASE.dist * (1 + (1 - camK) * 0.42);
    if (!final) {
      yaw += Math.sin(clock * TAU / 26) * 0.05 + ptr.x * 0.11;
      el += Math.sin(clock * TAU / 19) * 0.022 - ptr.y * 0.06;
    }
    setCam(el, yaw, dist, BASE.tx, BASE.tz);
    // 진행 값
    var prog;
    if (final) { PINS.kr.grow = 1; PINS.nz.grow = 1; prog = 1; }
    else {
      PINS.kr.grow = c01((t - 0.55) / 0.9);
      PINS.nz.grow = c01((t - 2.75) / 0.8);
      prog = easeInOut((t - 1.25) / 1.6);
    }
    pinKeys.forEach(function (k) {
      var p = PINS[k];
      p.intT = focusKey ? (focusKey === k ? 1.55 : 0.6) : 1;
      p.int += (p.intT - p.int) * (final ? 1 : 0.12);
    });
    // 물결 나이
    for (var i = waves.length - 1; i >= 0; i--) {
      var wv = waves[i];
      wv.age = clock - wv.t0;
      if (wv.age > 3.2 || final) { waves.splice(i, 1); continue; }
      wv.r = wv.age * 300;
      wv.amp = wv.a0 * Math.pow(1 - wv.age / 3.2, 1.3);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(bg, 0, 0);
    var rev = final ? 1 : easeOut3(t / 1.4);
    drawGrid(rev);
    drawDots(t, final);
    drawMotes(rev);
    // 먼 거점(대한민국)부터
    drawPinBase(PINS.kr, final);
    drawPillar(PINS.kr, final);
    drawArc(prog, final);
    drawPinBase(PINS.nz, final);
    drawPillar(PINS.nz, final);
    if (!final && phase === 'live') {
      var cyc = (clock - liveT) / CYCLE, idx = Math.floor(cyc), q = (cyc - idx) * CYCLE / TRAVEL;
      if (idx !== lastCycle) { lastCycle = idx; waves.push({ key: 'kr', t0: clock, a0: 0.55, age: 0, r: 0, amp: 0.55 }); }
      if (q >= 1 && !waves.some(function (w) { return w.key === 'nz' && w.cyc === idx; })) waves.push({ key: 'nz', t0: clock, a0: 1, age: 0, r: 0, amp: 1, cyc: idx });
      drawPulse(q);
    }
    placeLabels();
  };

  /* ---------- 루프 ---------- */
  var frame = function (now) {
    raf = 0;
    if (last && phase === 'live' && perf.tries < 2 && now - last < 120) { // 탭 전환 등으로 생긴 긴 공백은 빼고
      perf.n++; perf.sum += now - last;
      if (perf.n >= 45) {
        if (perf.sum / perf.n > 26 && dprCap > 1) { dprCap = Math.max(1, Math.min(dprCap, window.devicePixelRatio || 1) - 0.5); perf.tries++; sized = false; cssW = 0; resize(); }
        perf.n = 0; perf.sum = 0;
      }
    }
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    clock += dt;
    if (phase === 'intro') {
      introT += dt;
      if (introT > 1.15) { setLabel('kr', true); setCount('01'); }
      if (introT > 2.9 && !waves.some(function (w) { return w.key === 'nz'; }) && PINS.nz.grow > 0) waves.push({ key: 'nz', t0: clock, a0: 1, age: 0, r: 0, amp: 1, cyc: -1 });
      if (introT > 3.15) { setLabel('nz', true); setCount('02'); }
      if (introT > 3.8) { phase = 'live'; liveT = clock + 0.4; lastCycle = -1; }
    }
    ptr.x += (ptr.tx - ptr.x) * Math.min(1, dt * 3.5);
    ptr.y += (ptr.ty - ptr.y) * Math.min(1, dt * 3.5);
    render(false);
    if (running()) raf = requestAnimationFrame(frame);
  };
  var running = function () { return visible && sized && !motionOff() && (phase === 'intro' || phase === 'live'); };
  var sync = function () {
    if (running()) { if (!raf) { last = 0; perf.n = 0; perf.sum = 0; raf = requestAnimationFrame(frame); } }
    else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  };
  var showFinal = function () {
    phase = 'final';
    introT = 99;
    waves.length = 0;
    setLabel('kr', true); setLabel('nz', true); setCount('02');
    ptr.x = ptr.y = ptr.tx = ptr.ty = 0;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    render(true);
  };
  var begin = function () {
    if (!sized) return;
    if (motionOff()) { showFinal(); return; }
    phase = 'intro'; introT = 0; waves.length = 0;
    PINS.kr.grow = PINS.nz.grow = 0;
    setLabel('kr', false); setLabel('nz', false); setCount('00');
    render(false);
    sync();
  };

  // 준비: 캔버스를 보이고 대체 SVG 를 숨김
  cv.hidden = false;
  fig.classList.add('is-3d');
  setCount('02');

  var onSize = function () {
    var ok = resize();
    if (!ok) { // 탭 패널이 숨음 → 다음에 보일 때 등장 모션을 다시
      if (phase !== 'idle') wasHidden = true;
      return;
    }
    if (wasHidden) {
      wasHidden = false;
      if (!motionOff()) { phase = 'idle'; if (visible) begin(); return; }
    }
    if (phase === 'idle') { if (visible || !hasIO) begin(); else { render(true); } return; }
    if (phase === 'final' || !running()) render(phase === 'final');
  };
  if ('ResizeObserver' in window) new ResizeObserver(onSize).observe(fig);
  window.addEventListener('resize', onSize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measureLabels(); if (sized && !running()) render(phase === 'final'); });

  if (hasIO) {
    new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        visible = en.isIntersecting;
        if (visible && phase === 'idle' && en.intersectionRatio >= 0.18) { onSize(); begin(); }
        sync();
      });
    }, { threshold: [0, 0.18, 0.4], rootMargin: '40px 0px' }).observe(fig);
  } else { visible = true; }
  onSize();
  if (!hasIO) begin();

  // 포인터 기울기 (마우스 · 펜, 움직임 멈추기 · soft-motion 이면 없음)
  fig.addEventListener('pointermove', function (e) {
    if ((e.pointerType !== 'mouse' && e.pointerType !== 'pen') || !tiltOk()) return;
    var r = fig.getBoundingClientRect();
    ptr.tx = clamp((e.clientX - r.left) / r.width - 0.5, -0.5, 0.5);
    ptr.ty = clamp((e.clientY - r.top) / r.height - 0.5, -0.5, 0.5);
  });
  fig.addEventListener('pointerleave', function () { ptr.tx = 0; ptr.ty = 0; });

  // 움직임 멈추기 ↔ 켜기
  document.addEventListener('doogo:motion', function (e) {
    var off = !!(e.detail && e.detail.off);
    if (off) { if (sized) showFinal(); else phase = 'final'; }
    else if (phase === 'final') { phase = 'live'; liveT = clock + 0.6; lastCycle = -1; introT = 99; sync(); }
  });

  map = {
    focus: function (k) {
      focusKey = k;
      pinKeys.forEach(function (key) { if (PINS[key].el) PINS[key].el.classList.toggle('is-focus', k === key); });
      if (!running() && sized) render(phase === 'final' || phase === 'idle');
    }
  };
})();
