/* =========================================================
   DOOGO GROUP — about-loc.js (그룹 소개 · 05 국내외 거점 탭)
   · 3D 거점 지도(canvas): 아시아·태평양 점 지도를 원근으로 눕힌 판 위에
     대한민국 · 뉴질랜드 거점이 빛기둥으로 솟고, 두 거점을 잇는 곡선 위로 빛 점이 오갑니다.
     색: 하나의 색 띠 — 대한민국(시안 · 일렉트릭 블루) → 인디고 · 바이올렛 → 오키드 → 뉴질랜드(코럴).
     땅의 점 · 곡선 · 빛 점 · 물결이 모두 이 띠에서 색을 가져와 한 벌로 보이게 합니다.
     바다: 깊은 네이비 → 인디고 → 딥 틸 바탕 + 떠다니는 색 안개 · 해류를 따라 흐르는 빛 알갱이 ·
     위경선을 지나가는 빛 · 은은히 빛나는 적도 띠.
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
  // 판 가장자리(데이터가 잘린 쪽)로 갈수록 흐리게
  var edgeFade = function (mx, my) { return sstep(0, 220, mx) * sstep(0, 260, my) * (1 - sstep(820, 900, mx)) * (1 - sstep(960, 1020, my)); };

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

  /* ---------- 색: 하나의 색 띠 ---------- */
  var RAMP = [ // [위치, r, g, b] — 대한민국(0) → 뉴질랜드(1)
    [0.00, 120, 230, 255], // 아이스 시안
    [0.22, 84, 160, 255],  // 일렉트릭 블루(브랜드 블루 계열)
    [0.44, 118, 132, 255], // 인디고
    [0.64, 164, 122, 255], // 바이올렛
    [0.84, 236, 122, 222], // 오키드
    [1.00, 255, 148, 130]  // 코럴
  ];
  var ramp = function (t) {
    t = c01(t);
    var i = 1;
    while (i < RAMP.length - 1 && t > RAMP[i][0]) i++;
    var a = RAMP[i - 1], b = RAMP[i], f = c01((t - a[0]) / (b[0] - a[0]));
    return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
  };
  var WHITE = [255, 255, 255];
  var mix = function (c, d, f) { return [c[0] + (d[0] - c[0]) * f, c[1] + (d[1] - c[1]) * f, c[2] + (d[2] - c[2]) * f]; };
  var rgb = function (c) { return (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0); };
  var rgba = function (c, a) { return 'rgba(' + rgb(c) + ',' + c01(a).toFixed(3) + ')'; };
  // 거점 색: 대한민국 = 일렉트릭 블루 · 시안, 뉴질랜드 = 코럴 · 로즈
  var ACC = {
    kr: { deep: [22, 104, 255], mid: [90, 202, 255], hi: [178, 234, 255] },
    nz: { deep: [255, 74, 122], mid: [255, 136, 130], hi: [255, 198, 184] }
  };
  // 땅 위 한 점의 색 위치(0~1): 대한민국 → 뉴질랜드 축 + 대한민국에서 멀어지는 거리(등장 물결과 같은 방향)
  var AXX = PINS.nz.mx - PINS.kr.mx, AXY = PINS.nz.my - PINS.kr.my, AL2 = AXX * AXX + AXY * AXY, ALEN = Math.sqrt(AL2);
  var landT = function (x, y, r) {
    var s = ((x - PINS.kr.mx) * AXX + (y - PINS.kr.my) * AXY) / AL2;
    var d = Math.sqrt((x - PINS.kr.mx) * (x - PINS.kr.mx) + (y - PINS.kr.my) * (y - PINS.kr.my)) / ALEN;
    var t = (0.5 * s + 0.5 * d) * 1.1;
    t += Math.sin(x * 0.012 + y * 0.007) * 0.035 + (r - 0.5) * 0.07; // 띠 경계가 보이지 않게 점마다 조금씩
    return c01(t);
  };

  // 빛 스프라이트(색별로 한 번만 그려 둠)
  var mkSprite = function (stops) {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (var i = 0; i < stops.length; i++) gr.addColorStop(stops[i][0], stops[i][1]);
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return c;
  };
  var mkGlow = function (c) {
    return mkSprite([[0, 'rgba(255,255,255,1)'], [0.16, rgba(mix(c, WHITE, 0.5), 0.8)], [0.42, rgba(c, 0.3)], [1, rgba(c, 0)]]);
  };
  var mkBlob = function (c) { // 아주 부드러운 색 안개
    return mkSprite([[0, rgba(c, 1)], [0.3, rgba(c, 0.62)], [0.62, rgba(c, 0.2)], [1, rgba(c, 0)]]);
  };
  var GLOW = { kr: mkGlow(ACC.kr.mid), nz: mkGlow(ACC.nz.mid), w: mkGlow([170, 205, 255]) };
  var RSN = 8, RS = []; // 색 띠를 따라 고른 빛
  for (var rsi = 0; rsi <= RSN; rsi++) RS.push(mkGlow(ramp(rsi / RSN)));
  var rampGlow = function (t) { return RS[Math.round(c01(t) * RSN)]; };
  // 바탕 질감(필름 그레인) — 그라데이션 띠무늬를 없애고 매트한 깊이를 줌
  var grain = (function () {
    var c = document.createElement('canvas'), n = 96;
    c.width = c.height = n;
    var g = c.getContext('2d'), im = g.createImageData(n, n), d = im.data, s = 20231;
    for (var i = 0; i < d.length; i += 4) { s = (s * 16807) % 2147483647; var v = 64 + (s % 128); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    g.putImageData(im, 0, 0);
    return c;
  })();

  // 점 만들기: 원래 격자 사이를 촘촘히(S 배) 채우되 해안선은 넓히지 않음(이웃이 모두 육지일 때만)
  var ORD = null, N = 0, DX, DZ, DT, DF, DK, DN, DP, DL, DC, DB, SX, SY, SS, LV, density = 0, maxDK = 1;
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
    DC = new Uint8Array(N); DB = new Float32Array(N);
    SX = new Float32Array(N); SY = new Float32Array(N); SS = new Float32Array(N); LV = new Uint16Array(N);
    maxDK = 1;
    for (var n = 0; n < N; n++) {
      var x = list[n * 4], y = list[n * 4 + 1];
      DX[n] = x - MCX; DZ[n] = y - MCZ; DT[n] = list[n * 4 + 2]; DF[n] = list[n * 4 + 3];
      DK[n] = Math.sqrt((x - PINS.kr.mx) * (x - PINS.kr.mx) + (y - PINS.kr.my) * (y - PINS.kr.my));
      DN[n] = Math.sqrt((x - PINS.nz.mx) * (x - PINS.nz.mx) + (y - PINS.nz.my) * (y - PINS.nz.my));
      DP[n] = ((Math.sin(n * 12.9898 + x * 0.071) * 43758.5453) % 1 + 1) % 1 * TAU;
      var h2 = ((Math.sin(n * 78.233 + y * 0.113) * 24634.6345) % 1 + 1) % 1;
      DC[n] = Math.round(landT(x, y, h2) * (NCB - 1));
      // 밝기: 낮은 주파수 무늬(지형 느낌) + 점마다 작은 차이
      DB[n] = 0.8 + 0.12 * Math.sin(x * 0.043 + Math.sin(y * 0.029) * 1.7) * Math.sin(y * 0.037 + Math.sin(x * 0.024) * 1.4) + (h2 - 0.5) * 0.22;
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

  // 공기 중 먼지(깊이감) — 색 띠에서 고른 색
  var MOTES = [];
  for (var mi = 0; mi < 46; mi++) {
    var rr = function (s) { var v = Math.sin(mi * 78.233 + s * 12.9898) * 43758.5453; return v - Math.floor(v); };
    MOTES.push({ x: -430 + rr(1) * 860, z: -420 + rr(2) * 900, y: 20 + rr(3) * 300, sp: 4 + rr(4) * 8, a: 0.25 + rr(5) * 0.5, ph: rr(6) * TAU, c: rgb(mix(ramp(rr(7)), WHITE, 0.3)) });
  }
  // 앞쪽에 흐릿하게 떠 있는 빛 망울(보케)
  var BOKEH = [];
  for (var bi = 0; bi < 9; bi++) {
    var br = function (s) { var v = Math.sin(bi * 41.17 + s * 93.989) * 23421.631; return v - Math.floor(v); };
    BOKEH.push({ x: -380 + br(1) * 820, z: -260 + br(2) * 760, y: 120 + br(3) * 260, r: 10 + br(4) * 20, a: 0.05 + br(5) * 0.07, ph: br(6) * TAU, t: br(7) });
  }

  // 바다 위 색 안개(판 위 좌표, 느리게 떠다님)
  var NEB = [
    { mx: 300, my: 560, r: 360, c: [20, 92, 255], a: 0.30, sx: 26, sz: 18, w: 0.031, ph: 0.4 },  // 브랜드 블루(동남아 아래)
    { mx: 625, my: 470, r: 390, c: [104, 76, 255], a: 0.34, sx: 34, sz: 22, w: 0.024, ph: 1.9 }, // 바이올렛(가운데 바다)
    { mx: 560, my: 200, r: 300, c: [24, 190, 255], a: 0.22, sx: 30, sz: 16, w: 0.028, ph: 3.1 }, // 시안(북태평양)
    { mx: 860, my: 560, r: 300, c: [190, 70, 255], a: 0.16, sx: 22, sz: 26, w: 0.022, ph: 2.6 }, // 오키드(곡선 바깥 바다)
    { mx: 735, my: 790, r: 300, c: [255, 70, 165], a: 0.19, sx: 24, sz: 20, w: 0.035, ph: 4.4 }, // 마젠타(뉴질랜드 쪽)
    { mx: 160, my: 900, r: 280, c: [0, 168, 186], a: 0.14, sx: 20, sz: 14, w: 0.026, ph: 5.2 }  // 딥 틸(인도양)
  ];
  NEB.forEach(function (n) { n.spr = mkBlob(n.c); });

  // 해류: 소용돌이(북태평양 시계 방향 · 남태평양 · 인도양 반시계 방향) + 적도 해류(서쪽으로)
  var V = { x: 0, y: 0 };
  var flowV = function (x, y, o) {
    var vx = 0, vy = 0, dx, dy, g;
    dx = x - 660; dy = y - 250; g = Math.exp(-(dx * dx + dy * dy) / 60000) * 0.32; vx -= dy * g; vy += dx * g;
    dx = x - 690; dy = y - 720; g = Math.exp(-(dx * dx + dy * dy) / 62000) * 0.3; vx += dy * g; vy -= dx * g;
    dx = x - 40; dy = y - 860; g = Math.exp(-(dx * dx + dy * dy) / 50000) * 0.3; vx += dy * g; vy -= dx * g;
    g = Math.exp(-(y - 515) * (y - 515) / 5000); vx -= 26 * g;
    o.x = vx; o.y = vy;
    return o;
  };
  var FL = [], fseed = 1;
  var frnd = function () { fseed = (fseed * 16807) % 2147483647; return (fseed - 1) / 2147483646; };
  var landAt = function (x, y) { return bil(gLand, x / 10, y / 10); };
  var spawn = function (p, init) {
    for (var k = 0; k < 24; k++) {
      var x = 20 + frnd() * 870, y = 40 + frnd() * 960;
      if (landAt(x, y) > 0.05 || landAt(x - 30, y) + landAt(x + 30, y) + landAt(x, y - 30) + landAt(x, y + 30) > 0.1 || edgeFade(x, y) < 0.35) continue; // 탁 트인 바다에만
      flowV(x, y, V);
      if (V.x * V.x + V.y * V.y < 90) continue;
      p.x = x; p.y = y;
      break;
    }
    p.life = 4.2 + frnd() * 4.2;
    p.age = init ? frnd() * p.life : 0;
    p.c = rgb(mix(ramp(landT(p.x, p.y, 0.5)), WHITE, 0.32));
    p.w = 0.7 + frnd() * 0.45;
  };
  var buildFlow = function (n) {
    if (FL.length === n) return;
    FL = []; fseed = 7;
    for (var i = 0; i < n; i++) { var p = { x: 600, y: 500 }; spawn(p, true); FL.push(p); }
  };
  var stepFlow = function (dt) {
    for (var i = 0; i < FL.length; i++) {
      var p = FL[i];
      flowV(p.x, p.y, V);
      p.x += V.x * dt * 0.95; p.y += V.y * dt * 0.95;
      p.age += dt;
      if (p.age > p.life || landAt(p.x, p.y) > 0.5 || p.x < 0 || p.x > 900 || p.y < 0 || p.y > 1020) spawn(p, false);
    }
  };

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
  var paintBg = function () {
    bg.width = W; bg.height = H;
    // 깊은 바다: 네이비 → 인디고 → 딥 틸
    var g = bgx.createLinearGradient(W * 0.2, 0, W * 0.55, H);
    g.addColorStop(0, '#050A1D'); g.addColorStop(0.42, '#0B1238'); g.addColorStop(0.78, '#071A33'); g.addColorStop(1, '#04192A');
    bgx.fillStyle = g; bgx.fillRect(0, 0, W, H);
    // 판 아래 깔리는 브랜드 블루 빛
    proj(80, 0, 120, PT);
    var r1 = bgx.createRadialGradient(PT.x, PT.y, 0, PT.x, PT.y, Math.max(W, H) * 0.62);
    r1.addColorStop(0, 'rgba(10,93,226,.24)'); r1.addColorStop(0.55, 'rgba(10,93,226,.06)'); r1.addColorStop(1, 'rgba(10,93,226,0)');
    bgx.fillStyle = r1; bgx.fillRect(0, 0, W, H);
    // 위쪽 지평선: 보랏빛 안개 · 오른쪽 위 은은한 마젠타 · 아래 왼쪽 청록
    var glowAt = function (x, y, r, c) {
      var rg = bgx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, c); rg.addColorStop(1, c.replace(/[\d.]+\)$/, '0)'));
      bgx.fillStyle = rg; bgx.fillRect(0, 0, W, H);
    };
    glowAt(W * 0.42, -H * 0.12, H * 0.72, 'rgba(118,104,255,.20)');
    glowAt(W * 1.02, H * 0.08, H * 0.5, 'rgba(214,92,220,.10)');
    glowAt(-W * 0.05, H * 1.02, H * 0.6, 'rgba(0,170,180,.13)');
    // 가장자리 어둡게(비네트)
    var vg = bgx.createRadialGradient(W * 0.5, H * 0.52, Math.min(W, H) * 0.35, W * 0.5, H * 0.52, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(2,5,16,0)'); vg.addColorStop(1, 'rgba(2,5,16,.45)');
    bgx.fillStyle = vg; bgx.fillRect(0, 0, W, H);
    // 필름 그레인
    try {
      bgx.globalCompositeOperation = 'overlay';
      bgx.globalAlpha = 0.16;
      bgx.fillStyle = bgx.createPattern(grain, 'repeat');
      bgx.fillRect(0, 0, W, H);
    } catch (e) { /* 패턴을 못 쓰면 그냥 둠 */ }
    bgx.globalCompositeOperation = 'source-over';
    bgx.globalAlpha = 1;
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
    buildFlow(compact ? 26 : 46);
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
  // 점 색 표 × 밝기 NB 단계:
  //  [0, NCB)            색 띠
  //  BLEND0 + …          빛을 받아 거점 색으로 물드는 중(거점 2 × 2단계 × NCB) — 물결이 띠처럼 끊기지 않고 번지게
  //  ACC0 + k * 3 + j    거점 색(가운데 → 밝은 빛)
  var NCB = 18, NB = 9;
  var PAL = [];
  for (var ci = 0; ci < NCB; ci++) PAL.push(ramp(ci / (NCB - 1)));
  var BLEND0 = NCB, BLENDS = [0.38, 0.72];
  pinKeys.forEach(function (k) { BLENDS.forEach(function (f) { for (var c = 0; c < NCB; c++) PAL.push(mix(PAL[c], ACC[k].mid, f)); }); });
  var ACC0 = PAL.length;
  pinKeys.forEach(function (k) { var A = ACC[k]; PAL.push(A.mid, mix(A.mid, A.hi, 0.5), A.hi); });
  var NPAL = PAL.length;
  var FILL = [];
  for (var pi = 0; pi < NPAL; pi++) for (var li = 0; li < NB; li++) FILL.push(rgba(PAL[pi], (li + 0.6) / NB));
  var counts = new Int32Array(NPAL * NB), starts = new Int32Array(NPAL * NB), poss = new Int32Array(NPAL * NB);

  var planeXf = function (X, Z) { // 판 위의 한 점에서 판과 나란한 국소 변환 (글자 · 원을 판에 눕힘)
    var p0x, p0y;
    proj(X, 0, Z, PT); p0x = PT.x; p0y = PT.y;
    proj(X + 1, 0, Z, PT); var ax = PT.x - p0x, ay = PT.y - p0y;
    proj(X, 0, Z + 1, PT); var bx = PT.x - p0x, by = PT.y - p0y;
    ctx.setTransform(ax, ay, bx, by, p0x, p0y);
    return Math.sqrt(Math.abs(ax * by - ay * bx)); // 대략의 배율
  };

  var drawNebula = function (rev, final) {
    if (rev <= 0) return;
    var tt = final ? 0 : clock;
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < NEB.length; i++) {
      var n = NEB[i];
      var X = n.mx + Math.sin(tt * TAU * n.w + n.ph) * n.sx - MCX, Z = n.my + Math.cos(tt * TAU * n.w * 0.8 + n.ph) * n.sz - MCZ;
      proj(X, 0, Z, PT);
      var cx = PT.x, cy = PT.y, rx = n.r * PT.k;
      proj(X, 0, Z + n.r, PT);
      var ry = Math.max(rx * 0.42, Math.abs(PT.y - cy));
      ctx.globalAlpha = n.a * rev * (0.86 + 0.14 * Math.sin(tt * 0.45 + n.ph * 2));
      ctx.drawImage(n.spr, cx - rx, cy - ry, rx * 2, ry * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  var drawGrid = function (rev, final) {
    if (rev <= 0) return;
    ctx.lineWidth = 1 * dpr;
    var seg = 34, i, s, x0, y0, a;
    // 대한민국 → 뉴질랜드 방향으로 천천히 지나가는 빛
    var sw = -300 + ((clock / 11) % 1) * 2100;
    var LVN = 8, segs = [], L;
    for (L = 0; L < LVN; L++) segs.push([]);
    var line = function (ax, ay, bx, by) {
      for (i = 0; i < seg; i++) {
        var t0 = i / seg, t1 = (i + 1) / seg, tm = (t0 + t1) / 2, mx = ax + (bx - ax) * tm, my = ay + (by - ay) * tm;
        a = edgeFade(mx, my);
        if (a < 0.05) continue;
        var sh = 0;
        if (!final) { var dd = (mx * 0.5 + my * 0.866 - sw) / 130; if (dd > -3 && dd < 3) sh = Math.exp(-dd * dd); }
        var v = a * (1 + 2.4 * sh) / 3.4;
        proj(ax + (bx - ax) * t0 - MCX, 0, ay + (by - ay) * t0 - MCZ, PT); x0 = PT.x; y0 = PT.y;
        proj(ax + (bx - ax) * t1 - MCX, 0, ay + (by - ay) * t1 - MCZ, PT);
        segs[Math.min(LVN - 1, (v * LVN) | 0)].push(x0, y0, PT.x, PT.y);
      }
    };
    for (s = 70; s <= 970; s += 150) if (s !== 520) line(0, s, 900, s);
    for (s = 100; s <= 850; s += 150) line(s, 0, s, 1020);
    // 선 색: 화면 대각선으로 시안 → 바이올렛 → 로즈
    var gg = ctx.createLinearGradient(0, 0, W, H);
    gg.addColorStop(0, 'rgb(130,214,255)'); gg.addColorStop(0.5, 'rgb(150,140,255)'); gg.addColorStop(1, 'rgb(255,150,196)');
    ctx.strokeStyle = gg;
    for (L = 0; L < LVN; L++) {
      var g = segs[L];
      if (!g.length) continue;
      ctx.globalAlpha = 0.1 * 3.4 * rev * (L + 0.5) / LVN;
      ctx.beginPath();
      for (var q = 0; q < g.length; q += 4) { ctx.moveTo(g[q], g[q + 1]); ctx.lineTo(g[q + 2], g[q + 3]); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    drawEquator(rev, final);
    // 판에 누운 좌표 글자
    ctx.save();
    ctx.fillStyle = '#B7BCF5';
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
    tag('EQUATOR 0°', 700, 506, 0.6);
    tag('180°', 812, 1004, 0.42);
    if (!compact) tag('45°S', 150, 962, 0.42);
    ctx.restore();
  };

  // 적도: 은은히 빛나는 색 띠 + 점선 + 천천히 지나가는 반짝임
  var drawEquator = function (rev, final) {
    proj(-MCX, 0, 520 - MCZ, PT); var x0 = PT.x, y0 = PT.y;
    proj(900 - MCX, 0, 520 - MCZ, PT); var x1 = PT.x, y1 = PT.y;
    var g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(90,210,255,0)'); g.addColorStop(0.2, 'rgba(90,210,255,1)');
    g.addColorStop(0.5, 'rgba(140,120,255,1)'); g.addColorStop(0.78, 'rgba(236,120,214,1)'); g.addColorStop(0.96, 'rgba(255,140,150,0)');
    var path = function () { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); };
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = g;
    ctx.lineCap = 'round';
    path();
    var gs = clamp(cssW / 720, 0.5, 1); // 작은 지도에서는 빛 띠도 가늘게
    ctx.globalAlpha = 0.035 * rev; ctx.lineWidth = 18 * gs * dpr; ctx.stroke();
    ctx.globalAlpha = 0.06 * rev; ctx.lineWidth = 5 * gs * dpr; ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.setLineDash([4 * dpr, 6 * dpr]);
    ctx.globalAlpha = 0.62 * rev; ctx.lineWidth = 1 * dpr; ctx.stroke();
    ctx.setLineDash([]);
    if (!final) {
      var s = (clock / 8.5) % 1, sp = 0.09;
      var gl = ctx.createLinearGradient(x0, y0, x1, y1);
      gl.addColorStop(0, 'rgba(255,255,255,0)');
      gl.addColorStop(clamp(s - sp, 0, 1), 'rgba(255,255,255,0)');
      gl.addColorStop(clamp(s, 0, 1), rgba(mix(ramp(0.15 + s * 0.75), WHITE, 0.45), 1));
      gl.addColorStop(clamp(s + sp * 0.35, 0, 1), 'rgba(255,255,255,0)');
      gl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = gl;
      ctx.globalAlpha = 0.34 * rev * edgeFade(s * 900, 520);
      ctx.lineWidth = 1.6 * dpr; path(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  // 해류를 따라 흐르는 빛 알갱이 (머리 위치에서 흐름을 거슬러 올라가며 꼬리를 그림)
  var TRK = 16, TR = new Float32Array((TRK + 1) * 2);
  var FPART = [[11, 16, 0.12, 0.55], [7, 11, 0.3, 0.7], [3, 7, 0.58, 0.85], [0, 3, 1, 1]]; // [끝, 시작, 밝기, 굵기]
  var drawFlow = function (rev, final) {
    if (rev <= 0 || !FL.length) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    var K = TRK, h = 0.1;
    for (var i = 0; i < FL.length; i++) {
      var p = FL[i];
      var env = final ? 0.7 : Math.sin(Math.PI * c01(p.age / p.life));
      var a = env * rev * edgeFade(p.x, p.y) * (1 - c01(landAt(p.x, p.y) * 2.5));
      if (a < 0.03) continue;
      var x = p.x, y = p.y, k;
      proj(x - MCX, 0, y - MCZ, PT); TR[0] = PT.x; TR[1] = PT.y;
      var depth = c01((PT.k - kMin) / (kMax - kMin));
      for (k = 1; k <= K; k++) { flowV(x, y, V); x -= V.x * h; y -= V.y * h; proj(x - MCX, 0, y - MCZ, PT); TR[k * 2] = PT.x; TR[k * 2 + 1] = PT.y; }
      var wd = p.w * dpr * (0.7 + 0.5 * depth);
      // 꼬리 → 머리 순으로 네 토막(뒤로 갈수록 흐리고 가늘게)
      for (var j = 0; j < FPART.length; j++) {
        var P = FPART[j];
        ctx.strokeStyle = 'rgba(' + p.c + ',' + (a * P[2] * 0.45).toFixed(3) + ')';
        ctx.lineWidth = wd * P[3];
        ctx.beginPath(); ctx.moveTo(TR[P[1] * 2], TR[P[1] * 2 + 1]);
        for (k = P[1] - 1; k >= P[0]; k--) ctx.lineTo(TR[k * 2], TR[k * 2 + 1]);
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';
    ctx.globalCompositeOperation = 'source-over';
  };

  var drawDots = function (introAge, final) {
    var n, i, w;
    var R = (density === 2 ? 2.75 : 4.4);
    var nw = waves.length;
    counts.fill(0);
    for (n = 0; n < N; n++) {
      var a = 1, lift = 0;
      if (!final && introAge < 3.2) {
        var tt = (introAge - DL[n]) / 0.6;
        if (tt <= 0) { LV[n] = 65535; continue; }
        if (tt < 1) { a = easeOut3(tt); lift = (easeOutBack(tt) - 1) * 30; }
      }
      // 빛기둥 주변 땅은 거점 색으로 물듦(빛 웅덩이)
      var lk = Math.exp(-DK[n] * DK[n] / 9000) * PINS.kr.grow * PINS.kr.int * 0.5;
      var ln = Math.exp(-DN[n] * DN[n] / 9000) * PINS.nz.grow * PINS.nz.int * 0.5;
      for (w = 0; w < nw; w++) {
        var wv = waves[w], d = wv.key === 'kr' ? DK[n] : DN[n];
        var x = (d - wv.r) / 34;
        if (x > -2.6 && x < 2.6) { var e = Math.exp(-x * x) * wv.amp; lift += e * 10; if (wv.key === 'kr') lk += e; else ln += e; }
      }
      var lit = lk + ln;
      proj(DX[n], lift, DZ[n], PT);
      var depth = (PT.k - kMin) / (kMax - kMin);
      var t = DT[n];
      var al = (t ? 1 : 0.94 * DB[n]) * DF[n] * a * (0.7 + 0.3 * c01(depth));
      if (!final) al *= 0.86 + 0.14 * Math.sin(clock * 1.4 + DP[n]);
      al += lit * 0.55 * DF[n];
      if (al < 0.03) { LV[n] = 65535; continue; }
      var col, kk = lk >= ln ? 0 : 1;
      if (t) col = ACC0 + (t - 1) * 3 + 1;
      else if (lit < 0.12) col = DC[n];
      else if (lit < 0.55) col = BLEND0 + (kk * 2 + (lit < 0.3 ? 0 : 1)) * NCB + DC[n];
      else col = ACC0 + kk * 3 + (lit < 0.85 ? 0 : (lit < 1.15 ? 1 : 2));
      var lv = Math.min(NB - 1, (al * NB) | 0);
      LV[n] = col * NB + lv;
      counts[LV[n]]++;
      SX[n] = PT.x; SY[n] = PT.y;
      SS[n] = Math.max(0.9 * dpr, R * PT.k * (t ? 1.28 : 1) * (1 + lit * 0.3));
    }
    // 색 · 밝기 단계별로 모아(계수 정렬) 단계마다 한 번씩 채움 · 작은 점은 사각형(가장 가벼움), 큰 점만 원
    var b, off = 0, NBK = NPAL * NB;
    for (b = 0; b < NBK; b++) { starts[b] = off; poss[b] = off; off += counts[b]; }
    if (!ORD || ORD.length < N) ORD = new Int32Array(N);
    for (i = 0; i < N; i++) if (LV[i] !== 65535) ORD[poss[LV[i]]++] = i;
    var big = 4.6 * Math.max(1, dpr / 1.5);
    for (b = 0; b < NBK; b++) {
      if (!counts[b]) continue;
      ctx.fillStyle = FILL[b];
      ctx.beginPath();
      for (var o = starts[b], e2 = starts[b] + counts[b]; o < e2; o++) {
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
  // 곡선 색: 대한민국 색 → 색 띠 → 뉴질랜드 색 (조금 밝게)
  var ARC_STOPS = [[0, mix(ACC.kr.mid, WHITE, 0.12)], [0.25, mix(ramp(0.25), WHITE, 0.12)], [0.5, mix(ramp(0.54), WHITE, 0.1)], [0.75, mix(ramp(0.82), WHITE, 0.08)], [1, mix(ACC.nz.mid, WHITE, 0.1)]];
  var arcGrad = function (x0, y0, x1, y1) {
    var g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < ARC_STOPS.length; i++) g.addColorStop(ARC_STOPS[i][0], 'rgb(' + rgb(ARC_STOPS[i][1]) + ')');
    return g;
  };

  var drawArc = function (prog, final) {
    if (prog <= 0) return;
    var n = Math.max(1, Math.round(ARC_N * prog)), i;
    proj(AX[0], 0, AZ[0], PT); var gx0 = PT.x, gy0 = PT.y;
    proj(AX[ARC_N], 0, AZ[ARC_N], PT);
    var gr = arcGrad(gx0, gy0, PT.x, PT.y);
    // 판 위 그림자(점선)
    ctx.setLineDash([2 * dpr, 7 * dpr]);
    ctx.lineWidth = 1.2 * dpr;
    ctx.strokeStyle = gr; ctx.globalAlpha = 0.34;
    ctx.beginPath();
    for (i = 0; i <= n; i++) { proj(AX[i], 0, AZ[i], PT); if (i) ctx.lineTo(PT.x, PT.y); else ctx.moveTo(PT.x, PT.y); }
    ctx.stroke();
    ctx.setLineDash([]);
    // 곡선 본체
    ctx.beginPath();
    for (i = 0; i <= n; i++) { proj(AX[i], AY[i], AZ[i], PT); if (i) ctx.lineTo(PT.x, PT.y); else ctx.moveTo(PT.x, PT.y); }
    if (prog < 1) { arcAt(prog, AP); proj(AP.X, AP.Y, AP.Z, PT); ctx.lineTo(PT.x, PT.y); }
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = gr;
    ctx.globalAlpha = 0.13; ctx.lineWidth = 9 * clamp(cssW / 720, 0.6, 1) * dpr; ctx.stroke();
    ctx.globalAlpha = 0.24; ctx.lineWidth = 3.4 * dpr; ctx.stroke();
    ctx.globalAlpha = final ? 0.95 : 0.85; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.globalAlpha = 1; ctx.lineWidth = 0.6 * dpr; ctx.stroke();
    ctx.lineJoin = 'miter';
    if (prog < 1) { // 그려지는 머리
      arcAt(prog, AP); proj(AP.X, AP.Y, AP.Z, PT);
      var r = 28 * dpr; ctx.drawImage(rampGlow(prog), PT.x - r, PT.y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  var drawPulse = function (q) { // 곡선 위를 지나는 빛 점(혜성) — 꼬리는 지나온 자리의 색 띠를 그대로 끌고 감
    if (q <= 0 || q >= 1.04) return;
    var head = Math.min(q, 1), tail = Math.max(0, head - 0.3), steps = 26, i;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    var px, py;
    for (i = 0; i <= steps; i++) {
      var t = tail + (head - tail) * (i / steps);
      arcAt(t, AP); proj(AP.X, AP.Y, AP.Z, PT);
      if (i) {
        var f = i / steps, c = ramp(t);
        ctx.strokeStyle = rgba(c, f * f * 0.3);
        ctx.lineWidth = (2 + f * 7) * dpr;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(PT.x, PT.y); ctx.stroke();
        ctx.strokeStyle = rgba(mix(c, WHITE, 0.35 + 0.55 * f), f * f * 0.95);
        ctx.lineWidth = (0.8 + f * 2.2) * dpr;
        ctx.stroke();
      }
      px = PT.x; py = PT.y;
    }
    var fade = q > 1 ? 1 - (q - 1) / 0.04 : 1;
    var r = 30 * dpr * (0.8 + 0.4 * PT.k / Math.max(kMax, 1e-6));
    ctx.globalAlpha = fade;
    ctx.drawImage(rampGlow(head), px - r, py - r, r * 2, r * 2);
    r *= 0.42;
    ctx.drawImage(GLOW.w, px - r, py - r, r * 2, r * 2);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(px, py, 2.2 * dpr, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
    ctx.globalCompositeOperation = 'source-over';
  };

  var drawPinBase = function (p, final) { // 판 위의 빛 웅덩이 + 퍼지는 고리 (거점 색)
    if (p.grow <= 0) return;
    var A = ACC[p.key];
    ctx.save();
    var sc = planeXf(p.X, p.Z);
    var I = p.int * Math.min(1, p.grow * 1.6);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.6 * I;
    ctx.drawImage(GLOW[p.key], -74, -74, 148, 148);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.3 * dpr / Math.max(sc, 1e-3);
    var rings = final ? [0.42] : [(clock / 2.8) % 1, (clock / 2.8 + 0.5) % 1];
    for (var i = 0; i < rings.length; i++) {
      var f = rings[i], rr = 9 + f * 56;
      ctx.strokeStyle = rgba(A.mid, (final ? 0.45 : Math.pow(1 - f, 1.6) * 0.85) * I);
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
    }
    // 도착 순간의 큰 고리
    for (var w = 0; w < waves.length; w++) {
      var wv = waves[w];
      if (wv.key !== p.key || wv.age > 1.6) continue;
      var g = wv.age / 1.6;
      ctx.strokeStyle = rgba(A.hi, Math.pow(1 - g, 2) * 0.85 * wv.amp);
      ctx.lineWidth = 2 * dpr / Math.max(sc, 1e-3);
      ctx.beginPath(); ctx.arc(0, 0, 12 + easeOut3(g) * 84, 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = rgba(A.hi, 0.95 * Math.min(1, p.grow * 2));
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
    var A = ACC[p.key];
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
    quad(w0 * 1.9, w0 * 1.15, rgba(A.deep, 0.34 * I), rgba(A.deep, 0));
    quad(w0 * 0.9, w0 * 0.35, rgba(A.mid, 0.8 * Math.min(I, 1.3)), rgba(A.mid, 0));
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
        ctx.drawImage(GLOW[p.key], PT.x - r, PT.y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    }
    // 꼭대기 빛
    var cr = (15 + 6 * I) * dpr * Math.min(1, p.grow * 1.4);
    ctx.drawImage(GLOW[p.key], tx - cr, ty - cr, cr * 2, cr * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(tx, ty, 2.4 * dpr, 0, TAU); ctx.fill();
  };

  var drawMotes = function (rev, final) {
    if (rev <= 0) return;
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < MOTES.length; i++) {
      var m = MOTES[i], y = (m.y + clock * m.sp) % 330;
      proj(m.x + Math.sin(clock * 0.3 + m.ph) * 8, y, m.z, PT);
      var depth = c01((PT.k - kMin) / (kMax - kMin));
      var a = m.a * rev * Math.sin(Math.PI * (y / 330)) * (0.35 + 0.65 * depth);
      if (a < 0.02) continue;
      ctx.fillStyle = 'rgba(' + m.c + ',' + a.toFixed(3) + ')';
      var s = (0.8 + depth * 1.4) * dpr;
      ctx.beginPath(); ctx.arc(PT.x, PT.y, s, 0, TAU); ctx.fill();
    }
    // 앞쪽의 흐릿한 빛 망울
    var tt = final ? 0 : clock;
    for (var j = 0; j < BOKEH.length; j++) {
      var b = BOKEH[j];
      proj(b.x + Math.sin(tt * 0.11 + b.ph) * 24, b.y + Math.sin(tt * 0.17 + b.ph) * 14, b.z + Math.cos(tt * 0.09 + b.ph) * 18, PT);
      var rr = b.r * dpr * (0.6 + 0.8 * c01((PT.k - kMin) / (kMax - kMin)));
      ctx.globalAlpha = b.a * rev * (0.7 + 0.3 * Math.sin(tt * 0.6 + b.ph));
      ctx.drawImage(rampGlow(b.t), PT.x - rr, PT.y - rr, rr * 2, rr * 2);
    }
    ctx.globalAlpha = 1;
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
    drawNebula(rev, final);
    drawGrid(rev, final);
    drawFlow(final ? 1 : easeOut3((t - 0.6) / 1.6), final);
    drawDots(t, final);
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
    drawMotes(rev, final);
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
    stepFlow(dt);
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
