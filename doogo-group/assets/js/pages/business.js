/* =========================================================
   DOOGO GROUP — business.js (사업영역 목록)
   첫 화면 7개 사업 사진 슬라이드(바로가기 hover/focus 시 그 사업 사진으로 고정) ·
   가치사슬 3D 계단(14차) · 7개 사업 탭(14차 · 주소 #slug 와 맞춤) · 소개 화면 사진 패럴랙스 · VIEW 커서
   움직임 정책(site.js): OS의 '애니메이션 줄이기' 설정과 관계없이 재생하고,
   사용자가 '움직임 멈추기'를 고른 경우(window.DOOGO.motionOff())만 멈춥니다 — 'doogo:motion' 이벤트로 바로 전환.
   패럴랙스만 OS 설정이 켜진 기기(html.soft-motion)에서 끕니다.
   ========================================================= */
(function () {
  'use strict';
  var doc = document.documentElement;
  var motionOff = function () { return !!(window.DOOGO && window.DOOGO.motionOff && window.DOOGO.motionOff()); };
  var softMotion = function () { return doc.classList.contains('soft-motion'); };
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var hasIO = 'IntersectionObserver' in window;
  var parKick = function () {}; // 소개 화면이 바뀌면 패럴랙스 위치를 다시 (4)에서 채움)

  /* ---------- 1) 첫 화면: 7개 사업 사진 슬라이드 ----------
     5초마다 다음 사업 사진으로 크로스페이드(+느린 줌, business.css). 지금 보이는 사업은 바로가기 카드에 표시.
     · 바로가기에 마우스를 올리거나 포커스하면 그 사업 사진으로 고정, 벗어나면 그 자리에서 다시 넘김
     · 화면 밖 · 탭이 숨겨짐 · 정지 버튼 · '움직임 멈추기' → 멈춤 (다시 켜면 그 자리에서 이어서 넘김)
     · 첫 장 외 사진은 <template> 안에 있다가 넘기기 직전(또는 바로가기에 처음 다가갈 때) 불러옴
     · 바로가기가 가로로 넘기는 한 줄(휴대폰)이면, 자동 넘김으로 바뀐 사업 카드가 보이도록 띠만 가로로 따라 넘김 */
  var DUR = 5000, FADE = 1250;
  var hero = $('.bz-hero');
  var stack = $('.bz-slides');
  var tpl = document.getElementById('bz-slides-more');
  var jump = $('.bz-jump');
  if (hero && stack && jump) {
    var items = $$('.bz-jump-item', jump);
    var keys = items.map(function (a) { return a.getAttribute('data-key'); });
    var first = $('.bz-slide', stack);
    var spare = tpl && tpl.content ? Array.prototype.slice.call(tpl.content.querySelectorAll('.bz-slide')) : [];
    var slides = keys.map(function (k, i) { return i === 0 ? first : null; });
    var cur = 0, want = 0, top = 1, timer = 0, cleanT = 0;
    var inView = true, pinned = false, userPaused = false;
    var toggle = $('.bz-vtoggle', hero);

    hero.style.setProperty('--slide-dur', DUR + 'ms');
    if (first) first.style.zIndex = 1;

    var slideFor = function (i) { // i번째 사진 <img> (처음 부를 때 template에서 꺼내 문서에 넣음 → 그때 불러오기 시작)
      if (slides[i]) return slides[i];
      var src = spare.filter(function (img) { return img.getAttribute('data-key') === keys[i]; })[0];
      if (!src) return null;
      slides[i] = document.importNode(src, true);
      stack.appendChild(slides[i]);
      return slides[i];
    };
    var ready = function (img) {
      if (!img) return Promise.reject();
      if (img.complete && img.naturalWidth) return Promise.resolve();
      if (img.decode) return img.decode();
      return new Promise(function (res, rej) { img.addEventListener('load', res, { once: true }); img.addEventListener('error', rej, { once: true }); });
    };
    var preloadAll = function () { keys.forEach(function (k, i) { slideFor(i); }); };

    var mark = function (i) {
      items.forEach(function (a, j) { a.classList.toggle('is-cur', j === i); });
    };

    // 휴대폰처럼 바로가기가 가로로 넘기는 한 줄일 때: 자동 넘김으로 바뀐 사업 카드가 띠 밖에 있으면 그 카드까지 띠를 넘김
    // (지금 사진이 어느 사업인지 표시가 화면에서 사라지지 않게). 사용자가 띠를 만지거나 넘긴 뒤 4초 동안,
    // 띠 안에 포커스가 있을 때, 첫 화면이 안 보일 때는 건드리지 않음. 페이지 세로 위치는 바꾸지 않음(띠만 가로로).
    var touchedAt = 0, autoUntil = 0;
    var userTouch = function () { touchedAt = Date.now(); };
    ['pointerdown', 'touchstart', 'wheel'].forEach(function (ev) { jump.addEventListener(ev, userTouch, { passive: true }); });
    jump.addEventListener('scroll', function () { if (Date.now() > autoUntil) userTouch(); }, { passive: true });
    var follow = function (i) {
      if (jump.scrollWidth <= jump.clientWidth + 2 || !inView || jump.contains(document.activeElement) || Date.now() - touchedAt < 4000) return;
      var li = items[i].parentNode;
      var box = jump.getBoundingClientRect(), r = li.getBoundingClientRect();
      var pad = parseFloat(window.getComputedStyle(jump).scrollPaddingLeft) || 0;
      if (r.left >= box.left + pad - 1 && r.right <= box.right - pad + 1) return; // 이미 다 보임
      var left = clamp(jump.scrollLeft + (r.left - box.left) - pad, 0, jump.scrollWidth - jump.clientWidth);
      autoUntil = Date.now() + 1000;
      try { jump.scrollTo({ left: left, behavior: motionOff() ? 'auto' : 'smooth' }); } catch (e) { jump.scrollLeft = left; }
    };
    var restartProgress = function () { // 진행선 애니메이션을 처음부터
      hero.classList.remove('is-auto');
      if (running()) { void hero.offsetWidth; hero.classList.add('is-auto'); }
    };
    var running = function () { return !motionOff() && !userPaused && !pinned && inView && !document.hidden; };

    var show = function (i) {
      want = i;
      var img = slideFor(i);
      ready(img).then(function () {
        if (want !== i || i === cur) return;
        // 새 사진을 맨 위에서 처음부터 나타나게 (이미 켜져 있던 사진이면 껐다가 다시)
        img.classList.remove('is-on', 'is-first');
        img.style.zIndex = ++top;
        void img.offsetWidth;
        img.classList.add('is-on');
        cur = i;
        mark(i);
        if (!pinned) follow(i);
        // 새 사진이 다 덮은 뒤 아래 사진들을 치움(보이지 않는 상태에서 처음 위치로)
        clearTimeout(cleanT);
        cleanT = setTimeout(function () {
          slides.forEach(function (s, j) { if (s && j !== cur) s.classList.remove('is-on', 'is-first'); });
        }, FADE);
        // 다음 사진 미리 불러오기
        if (!motionOff()) slideFor((i + 1) % keys.length);
      }, function () { /* 불러오기 실패: 지금 사진 유지 */ });
    };

    var schedule = function () {
      clearTimeout(timer);
      restartProgress();
      if (!running()) return;
      timer = setTimeout(function () { show((cur + 1) % keys.length); schedule(); }, DUR);
    };

    mark(0);
    // 다음 사진은 첫 화면이 그려진 뒤에 미리 불러옴
    var warm = function () { if (!motionOff()) slideFor(1); };
    if (document.readyState === 'complete') warm(); else window.addEventListener('load', warm, { once: true });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting; schedule();
      }, { threshold: 0.12 }).observe(hero);
    }
    document.addEventListener('visibilitychange', schedule);

    // 이 사진 넘김만 멈추는 버튼 ('움직임 멈추기' 상태에서는 숨김 — 전체 정지가 우선)
    var syncToggle = function () { if (toggle) toggle.hidden = motionOff(); };
    if (toggle) {
      toggle.addEventListener('click', function () {
        userPaused = !userPaused;
        toggle.setAttribute('aria-pressed', String(userPaused));
        toggle.setAttribute('aria-label', userPaused ? '배경 사진 자동 넘김 재생' : '배경 사진 자동 넘김 정지');
        toggle.classList.toggle('is-paused', userPaused);
        schedule();
      });
    }
    document.addEventListener('doogo:motion', function () { syncToggle(); if (!motionOff()) warm(); schedule(); });
    syncToggle();
    schedule();

    // 바로가기 hover · focus → 그 사업 사진으로 고정
    var pin = function (i) { pinned = true; schedule(); show(i); };
    var unpin = function () { if (!pinned) return; pinned = false; schedule(); };
    if (fine) jump.addEventListener('pointerenter', preloadAll);
    items.forEach(function (a, i) {
      if (fine) a.addEventListener('pointerenter', function () { pin(i); });
      a.addEventListener('focus', function () { preloadAll(); pin(i); });
    });
    var kbdIn = function () { // 키보드 포커스(포커스 링이 보이는 상태)가 바로가기 안에 있는지
      var el = document.activeElement;
      if (!el || !jump.contains(el)) return false;
      try { return el.matches(':focus-visible'); } catch (e) { return true; }
    };
    if (fine) jump.addEventListener('pointerleave', function () { if (!kbdIn()) unpin(); });
    jump.addEventListener('focusout', function (e) { if (!jump.contains(e.relatedTarget) && !(fine && jump.matches(':hover'))) unpin(); });
  }

  /* ---------- 3) 소개 화면 사진 VIEW 커서 ---------- */
  if (fine) {
    $$('.bz-media').forEach(function (m) {
      var cur = $('.bz-cursor', m);
      if (!cur) return;
      m.classList.add('has-cursor');
      var tx = 0, ty = 0, x = 0, y = 0, raf = 0, inside = false;
      function loop() {
        x += (tx - x) * 0.2; y += (ty - y) * 0.2;
        cur.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
        if (inside || Math.abs(tx - x) > 0.4 || Math.abs(ty - y) > 0.4) raf = requestAnimationFrame(loop);
        else raf = 0;
      }
      function pos(e) { var r = m.getBoundingClientRect(); tx = e.clientX - r.left; ty = e.clientY - r.top; }
      m.addEventListener('pointerenter', function (e) {
        pos(e); x = tx; y = ty; inside = true; m.classList.add('is-hover');
        if (!raf) raf = requestAnimationFrame(loop);
      });
      m.addEventListener('pointermove', function (e) { pos(e); if (!raf) raf = requestAnimationFrame(loop); });
      m.addEventListener('pointerleave', function () { inside = false; m.classList.remove('is-hover'); });
    });
  }

  /* ---------- 4) 소개 화면 사진 패럴랙스 (움직임 멈추기 · OS 애니메이션 줄이기 기기에서는 끔) ---------- */
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
    parKick = onScroll;
    update();
  }


  /* ---------- 2) 가치사슬 — 3D 계단 (14차 · 회사 소개 가치사슬과 같은 동작) ----------
     화면에 들어오면: 카메라가 비스듬한 각도에서 제자리로 → 기둥이 차례로 솟음 → 빛 줄기가 계단 윤곽을 따라 오르며 기둥마다 불을 켬
     (위 계기판 숫자 01 → 07 → EXIT) → 정상(EXIT)이 번쩍이고 빛기둥 · 바닥 파동. 그 뒤로는 빛 하나가 줄기를 따라 계속 흐르며
     지나가는 기둥을 비춥니다(화면에 보일 때만). 마우스를 올리면 무대가 살짝 기울어집니다(html.soft-motion 이면 생략).
     기둥 하나하나는 그 단계를 맡은 사업 상세 페이지 링크입니다(a.bz-vc-step).
     움직임 멈추기 · JS 없음: 처음부터 최종 상태(모두 켜짐 · 줄기 그려짐). */
  var chain = $('[data-chain]');
  if (chain) (function () {
    var scene = $('[data-chain-scene]', chain);
    var svg = $('[data-chain-beam]', chain);
    var meter = $('.bz-vc-meter', chain);
    var meterN = $('[data-chain-n]', chain);
    var meterT = $('[data-chain-t]', chain);
    if (!scene || !svg) return;
    var pHalo = $('.bz-vc-beam-halo', svg), pBase = $('.bz-vc-beam-base', svg), pLine = $('.bz-vc-beam-line', svg);
    var pGlow = $('.bz-vc-beam-glow', svg), pCore = $('.bz-vc-beam-core', svg);
    var steps = $$('.bz-vc-step', chain).concat($$('.bz-vc-goal', chain));
    var goal = steps[steps.length - 1];
    var labels = steps.map(function (el, i) {
      return { n: i < steps.length - 1 ? ('0' + (i + 1)).slice(-2) : 'EXIT', t: i < steps.length - 1 ? (el.getAttribute('data-t') || '') : 'Brand Growth' };
    });
    var geo = { L: 0, at: [], mode: '' };
    var state = 'idle', vis = false, timers = [], raf = 0, anims = [];
    var f1 = function (v) { return (Math.round(v * 10) / 10).toString(); };
    var offIn = function (el) { var x = 0, y = 0; while (el && el !== scene) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; } return { x: x, y: y }; };

    // 빛 줄기 경로: 가로 계단이면 기둥 윗변 · 다음 기둥 왼변을 따라 오르는 윤곽, 세로 계단이면 왼쪽 줄기(마디 → 마디)
    function layout() {
      var W = scene.offsetWidth, H = scene.offsetHeight;
      if (!W || !H) return false;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      var rows = window.matchMedia('(max-width: 1100px)').matches;
      var d = '', L = 0, at = [], px = 0, py = 0;
      var go = function (x, y) { L += Math.abs(x - px) + Math.abs(y - py); d += ' L' + f1(x) + ' ' + f1(y); px = x; py = y; };
      var box = steps.map(function (el) { var o = offIn(el); return { x: o.x, y: o.y, w: el.offsetWidth, h: el.offsetHeight }; });
      if (!rows) {
        px = box[0].x; py = box[0].y; d = 'M' + f1(px) + ' ' + f1(py);
        box.forEach(function (b, i) {
          if (i) { go(b.x, py); go(b.x, b.y); }
          at.push(L);
          if (i < box.length - 1) go(b.x + b.w, b.y);
          else go(b.x + b.w / 2, b.y);
        });
      } else {
        var cs = getComputedStyle(steps[0], '::before');
        var sx = box[0].x + (parseFloat(cs.left) || -24) + (parseFloat(cs.width) || 11) / 2;
        px = sx; py = box[0].y + box[0].h / 2; d = 'M' + f1(px) + ' ' + f1(py);
        box.forEach(function (b) { go(sx, b.y + b.h / 2); at.push(L); });
      }
      geo.L = Math.max(1, L); geo.at = at; geo.mode = rows ? 'rows' : 'cols';
      [pHalo, pBase, pLine, pGlow, pCore].forEach(function (p) { if (p) p.setAttribute('d', d); });
      pLine.style.strokeDasharray = f1(geo.L + 2) + ' ' + f1(geo.L + 2);
      if (state === 'idle' || state === 'armed') pLine.style.strokeDashoffset = f1(geo.L + 2);
      else if (state === 'done') pLine.style.strokeDashoffset = '0';
      return true;
    }

    var setMeter = function (i, tick) {
      if (!meterN || !labels[i]) return;
      if (meter) meter.style.setProperty('--p', i + 1);
      if (meterN.textContent === labels[i].n) return;
      meterN.textContent = labels[i].n;
      if (meterT) meterT.textContent = labels[i].t;
      if (tick && meter) { meter.classList.remove('is-tick'); void meter.offsetWidth; meter.classList.add('is-tick'); }
    };
    var light = function (i) { steps[i].classList.add('is-lit'); };

    // 최종 상태 (움직임 멈추기 · IO 없음)
    function finishAll() {
      timers.forEach(clearTimeout); timers = [];
      cancelAnimationFrame(raf); raf = 0;
      steps.forEach(function (el, i) { light(i); });
      chain.classList.remove('is-armed', 'is-on');
      state = 'done';
      layout();
      pLine.style.strokeDashoffset = '0';
      setMeter(steps.length - 1, false);
      syncLive();
    }

    // 등장
    function play() {
      if (state !== 'armed') return;
      if (motionOff()) { finishAll(); return; }
      if (!layout()) return;
      state = 'rising';
      chain.classList.add('is-on');
      timers.push(setTimeout(draw, softMotion() ? 900 : 1500));
    }
    function draw() {
      state = 'drawing';
      var t0 = 0, D = 2300, lit = -1;
      var ease = function (p) { return p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; };
      var step = function (ts) {
        if (!t0) t0 = ts;
        var p = Math.min(1, (ts - t0) / D), s = ease(p) * geo.L;
        pLine.style.strokeDashoffset = f1(geo.L + 2 - s);
        while (lit + 1 < steps.length && geo.at[lit + 1] <= s + 1) { lit++; if (lit < steps.length - 1) { light(lit); setMeter(lit, true); } }
        if (p < 1) { raf = requestAnimationFrame(step); return; }
        raf = 0;
        pLine.style.strokeDashoffset = '0';
        light(steps.length - 1); setMeter(steps.length - 1, true);
        goal.classList.add('is-peak');
        chain.classList.add('is-done');
        timers.push(setTimeout(function () { goal.classList.remove('is-peak'); }, 1200));
        state = 'done';
        timers.push(setTimeout(syncLive, 700));
      };
      raf = requestAnimationFrame(step);
    }

    // 흐르는 빛: 혜성(빛 머리 + 번짐)이 줄기를 따라 오르고, 지나가는 기둥 앞면이 번쩍
    function stopFx() { anims.forEach(function (a) { try { a.cancel(); } catch (e) {} }); anims = []; }
    function startFx() {
      stopFx();
      if (!pCore.animate || !geo.L) return;
      var v = geo.mode === 'rows' ? .32 : .62;          // px/ms
      var run = geo.L / v, T = run + 1600, C = Math.min(140, geo.L * .2);
      var kf = [
        { strokeDashoffset: C, offset: 0 },
        { strokeDashoffset: -geo.L, offset: run / T },
        { strokeDashoffset: -geo.L, offset: 1 }
      ];
      [pGlow, pCore].forEach(function (p, k) {
        var c = k ? C * .55 : C;
        p.style.strokeDasharray = f1(c) + ' ' + f1(geo.L + C + 10);
        anims.push(p.animate(kf, { duration: T, iterations: Infinity, easing: 'linear' }));
      });
      steps.forEach(function (el, i) {
        var fl = el.querySelector('.bz-cf-flash');
        if (!fl) return;
        var a0 = Math.min(.97, geo.at[i] / v / T);
        anims.push(fl.animate([
          { opacity: 0, offset: 0 },
          { opacity: 0, offset: a0 },
          { opacity: i === steps.length - 1 ? 1 : .8, offset: Math.min(.98, a0 + 140 / T) },
          { opacity: 0, offset: Math.min(.99, a0 + 1100 / T) },
          { opacity: 0, offset: 1 }
        ], { duration: T, iterations: Infinity, easing: 'linear' }));
      });
    }
    function syncLive() {
      var live = vis && state === 'done' && !motionOff();
      chain.classList.toggle('is-live', live);
      if (motionOff()) { stopFx(); return; }
      if (live) { if (!anims.length) startFx(); else anims.forEach(function (a) { a.play(); }); }
      else anims.forEach(function (a) { a.pause(); });
    }

    // 마우스 기울기 (화면에 보일 때 · 마우스만)
    var tx = 0, ty = 0, gx = 0, gy = 0, tRaf = 0;
    var tiltOk = function () { return !motionOff() && !softMotion() && window.matchMedia('(hover: hover) and (pointer: fine)').matches; };
    function tilt() {
      tx += (gx - tx) * .08; ty += (gy - ty) * .08;
      scene.style.setProperty('--tx', tx.toFixed(2) + 'deg');
      scene.style.setProperty('--ty', ty.toFixed(2) + 'deg');
      tRaf = (Math.abs(gx - tx) > .01 || Math.abs(gy - ty) > .01) ? requestAnimationFrame(tilt) : 0;
    }
    var kick = function () { if (!tRaf) tRaf = requestAnimationFrame(tilt); };
    chain.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse' || !tiltOk()) return;
      var r = chain.getBoundingClientRect();
      gy = ((e.clientX - r.left) / r.width - .5) * 12;   // 좌우 → rotateY
      gx = ((e.clientY - r.top) / r.height - .5) * -7;   // 위아래 → rotateX
      kick();
    });
    chain.addEventListener('pointerleave', function () { gx = 0; gy = 0; kick(); });

    // 시작
    var relayout = function () { // 크기 · 배치가 바뀌면 경로를 다시 그리고, 흐르던 빛도 새 길이로
      if (!layout()) return;
      if (state === 'done' && anims.length) { stopFx(); syncLive(); }
    };
    if (!hasIO || motionOff()) finishAll();
    else { chain.classList.add('is-armed'); state = 'armed'; setMeter(0, false); layout(); }
    if ('ResizeObserver' in window) new ResizeObserver(function () { relayout(); }).observe(scene);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
    if (hasIO) {
      var playIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting && state === 'armed') { play(); if (state !== 'armed') playIO.disconnect(); } });
      }, { rootMargin: '0px 0px -22% 0px', threshold: 0.15 });
      playIO.observe(chain);
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          vis = en.isIntersecting;
          chain.classList.toggle('is-vis', vis);
          if (!vis) { gx = gy = 0; kick(); }
          syncLive();
        });
      }, { rootMargin: '80px 0px' }).observe(chain);
    }
    document.addEventListener('doogo:motion', function () {
      if (motionOff()) { stopFx(); finishAll(); gx = gy = tx = ty = 0; scene.style.removeProperty('--tx'); scene.style.removeProperty('--ty'); }
      syncLive();
    });
  })();

  /* ---------- 5) 7개 사업 탭 (14차) ----------
     탭(role=tab · #slug 링크) 하나를 고르면 그 사업의 소개 화면(role=tabpanel · id=slug) 하나만 보입니다.
     · 왼쪽/오른쪽 화살표 · Home · End 로 옮기면 바로 고름(자동 활성화), Space · Enter 도 고름
     · 주소 #slug 와 맞춤: business.html#bio 처럼 들어오거나 주소가 바뀌면 그 탭을 고르고 탭 줄까지 내려감, 고르면 주소도 바꿈(기록은 쌓지 않음)
     · 페이지 안 다른 #slug 링크(첫 화면 사업 바로가기)도 같은 방식으로 탭을 고름
     · 탭 줄이 가로로 넘치면(휴대폰) 고른 탭을 가운데로 넘김 · 고른 탭 뒤 남색 알약이 미끄러져 옮겨 감
     · 소개 화면이 바뀔 때 사진이 열리며 가라앉고 글이 차례로 떠오름(.is-enter) — 움직임 멈추기면 바로 바뀜
     (20차) 이전 · 다음 사업으로 넘기기: 탭 줄 양끝 화살표(1100 이하) · 소개 화면 양옆 화살표(1101 이상) · 소개 화면 아래 이전/다음 카드
       · 휴대폰은 소개 화면을 좌우로 밀어도 넘어감. 넘긴 방향에서 소개 화면이 밀려 들어옴(data-dir)
       · 알약은 두 탭 사이로 늘어났다가 새 탭 크기로 줄어듦 · 탭 줄 아래 진행 막대(--p) · 처음 보일 때 탭이 차례로 떠오름(.is-in) */
  var tablist = $('.bz-tabs[role="tablist"]');
  if (tablist) (function () {
    var tabs = $$('[role="tab"]', tablist);
    var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute('aria-controls')); });
    if (panels.some(function (p) { return !p; })) return;
    var ids = panels.map(function (p) { return p.id; });
    var ink = $('.bz-tab-ink', tablist);
    var bar = $('.bz-tabbar');
    var spot = $('.bz-tabs-spot');
    var side = $('.bz-side');
    var sideNames = side ? $$('[data-side-name]', side) : [];
    var navBtns = $$('.bz-tabnav');
    var cur = -1, inkT = 0;
    var info = function (j) {
      var t = tabs[j], n = $('.bz-tab-n', t), a = $('.bz-tab-t', t);
      return { n: n ? n.textContent : '', html: a ? a.innerHTML : '', text: a ? a.textContent : '' };
    };
    var headerH = function () { return parseFloat(getComputedStyle(doc).getPropertyValue('--header-h')) || 84; };
    var idxOf = function (hash) { try { hash = decodeURIComponent(hash || ''); } catch (e) {} return ids.indexOf(hash.replace(/^#/, '')); };

    function setInk(x, w) { ink.style.setProperty('--x', x.toFixed(2) + 'px'); ink.style.setProperty('--w', w.toFixed(2) + 'px'); }
    // 탭 위치(탭 줄 안쪽 좌표 · 소수점까지 — offsetLeft 는 반올림돼 1px 어긋남)
    function box(t) {
      var a = t.getBoundingClientRect(), b = tablist.getBoundingClientRect();
      return { l: a.left - b.left - tablist.clientLeft + tablist.scrollLeft, w: a.width };
    }
    // from: 옮기기 전 탭 — 먼저 두 탭을 다 덮도록 늘였다가(.is-stretch) 새 탭 크기로 줄임
    function placeInk(instant, from) {
      if (!ink || cur < 0) return;
      var t = tabs[cur];
      clearTimeout(inkT);
      ink.style.setProperty('--t', t.offsetTop + 'px');
      ink.style.setProperty('--h', t.offsetHeight + 'px');
      tablist.classList.add('has-ink');
      var to = box(t);
      if (instant) {
        ink.classList.remove('is-ready', 'is-stretch');
        setInk(to.l, to.w);
        void ink.offsetWidth; ink.classList.add('is-ready');
        return;
      }
      if (from >= 0 && from !== cur && tabs[from]) {
        var f = box(tabs[from]);
        var l = Math.min(f.l, to.l), r = Math.max(f.l + f.w, to.l + to.w);
        ink.classList.add('is-stretch');
        setInk(l, r - l);
        inkT = setTimeout(function () { ink.classList.remove('is-stretch'); setInk(to.l, to.w); }, 190);
      } else {
        ink.classList.remove('is-stretch');
        setInk(to.l, to.w);
      }
    }
    // 이전 · 다음 화살표의 사업 이름 · 진행 막대
    function syncNav() {
      var n = tabs.length, a = info((cur - 1 + n) % n), b = info((cur + 1) % n);
      if (sideNames[0]) sideNames[0].innerHTML = '<span class="en">' + a.n + '</span>' + a.html;
      if (sideNames[1]) sideNames[1].innerHTML = '<span class="en">' + b.n + '</span>' + b.html;
      navBtns.forEach(function (btn) {
        var back = +btn.getAttribute('data-step') < 0, x = back ? a : b;
        btn.setAttribute('aria-label', (back ? '이전 사업: ' : '다음 사업: ') + x.n + ' ' + x.text);
      });
      if (bar) bar.style.setProperty('--p', ((cur + 1) / n).toFixed(4));
    }
    function edge() {
      var max = tablist.scrollWidth - tablist.clientWidth;
      tablist.classList.toggle('is-scrollable', max > 2);
      tablist.classList.toggle('is-start', tablist.scrollLeft <= 2);
      tablist.classList.toggle('is-end', tablist.scrollLeft >= max - 2);
    }
    function center(smooth) {
      var max = tablist.scrollWidth - tablist.clientWidth;
      if (max <= 2 || cur < 0) return;
      var t = tabs[cur];
      var left = clamp(t.offsetLeft - (tablist.clientWidth - t.offsetWidth) / 2, 0, max);
      try { tablist.scrollTo({ left: left, behavior: smooth ? 'smooth' : 'auto' }); } catch (e) { tablist.scrollLeft = left; }
    }
    // 탭 줄이 헤더 바로 아래 오는 위치(= 소개 화면 맨 위가 보이는 위치)로
    function toList(smooth, onlyIfPast) {
      if (!spot) return;
      var y = Math.max(0, spot.getBoundingClientRect().top + window.pageYOffset - headerH());
      if (onlyIfPast && window.pageYOffset <= y + 2) return;
      var b = smooth && !motionOff() ? 'smooth' : 'auto';
      try { window.scrollTo({ top: y, behavior: b }); } catch (e) { window.scrollTo(0, y); }
    }

    function select(i, o) {
      o = o || {};
      if (i < 0 || i >= tabs.length) return;
      var prev = cur, changed = i !== cur;
      cur = i;
      tabs.forEach(function (t, j) {
        var on = j === i;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        t.classList.toggle('is-on', on);
        panels[j].classList.toggle('is-on', on);
        panels[j].hidden = !on;
      });
      placeInk(prev < 0 || motionOff(), prev);
      center(prev >= 0 && !motionOff());
      if (changed && prev >= 0) {
        var p = panels[i], t = tabs[i];
        p.setAttribute('data-dir', o.dir || (i > prev ? 'next' : 'prev'));
        p.classList.remove('is-enter');
        t.classList.remove('is-pop');
        if (!motionOff()) {
          void p.offsetWidth; p.classList.add('is-enter'); t.classList.add('is-pop');
          clearTimeout(p._bzT); p._bzT = setTimeout(function () { p.classList.remove('is-enter'); t.classList.remove('is-pop'); }, 1800);
        }
      }
      syncNav();
      if (o.hash && ('#' + ids[i]) !== location.hash) { try { history.replaceState(history.state, '', '#' + ids[i]); } catch (e) {} }
      if (o.focus) { try { tabs[i].focus({ preventScroll: true }); } catch (e) { tabs[i].focus(); } }
      if (o.scroll) toList(o.scroll === 'smooth', o.onlyIfPast);
      parKick();
    }

    // 클릭 · 키보드
    tablist.addEventListener('click', function (e) {
      var t = e.target.closest('[role="tab"]');
      if (!t) return;
      e.preventDefault();
      select(tabs.indexOf(t), { hash: true, scroll: 'smooth', onlyIfPast: true });
    });
    tablist.addEventListener('keydown', function (e) {
      var i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      var n = tabs.length, to = -1;
      if (e.key === 'ArrowRight') to = (i + 1) % n;
      else if (e.key === 'ArrowLeft') to = (i - 1 + n) % n;
      else if (e.key === 'Home') to = 0;
      else if (e.key === 'End') to = n - 1;
      else if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') to = i;
      if (to < 0) return;
      e.preventDefault();
      select(to, { hash: true, focus: true, scroll: 'smooth', onlyIfPast: true });
    });
    tablist.addEventListener('scroll', edge, { passive: true });

    // 이전 · 다음: 한 칸씩(끝에서는 처음으로 돌아감)
    function step(d, o) {
      var n = tabs.length;
      o = o || {}; o.dir = d < 0 ? 'prev' : 'next';
      select((cur + d + n) % n, o);
    }
    // 탭 줄 양끝 · 소개 화면 양옆 화살표 — 소개 화면 중간을 보고 있었다면 새 사업의 맨 위로
    $$('.bz-tabnav, .bz-side-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        step(+btn.getAttribute('data-step') < 0 ? -1 : 1, { hash: true, scroll: 'smooth', onlyIfPast: true });
      });
    });
    // 소개 화면 아래 이전 / 다음 카드
    $$('.bz-pg[data-go]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        select(ids.indexOf(btn.getAttribute('data-go')), { hash: true, focus: true, scroll: 'smooth', dir: btn.classList.contains('bz-pg--prev') ? 'prev' : 'next' });
      });
    });
    // 휴대폰: 소개 화면을 좌우로 밀면 이전 · 다음 (세로 스크롤 · 화면 가장자리 뒤로 가기 몸짓과는 구분)
    var pz = $('.bz-panels');
    if (pz) {
      var sx = 0, sy = 0, st = 0, track = false;
      pz.addEventListener('touchstart', function (e) {
        var t = e.touches[0];
        track = e.touches.length === 1 && t.clientX > 24 && t.clientX < window.innerWidth - 24;
        if (track) { sx = t.clientX; sy = t.clientY; st = Date.now(); }
      }, { passive: true });
      pz.addEventListener('touchend', function (e) {
        if (!track) return;
        track = false;
        var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
        if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.8 || Date.now() - st > 700) return;
        step(dx < 0 ? 1 : -1, { hash: true, scroll: 'smooth', onlyIfPast: true });
      }, { passive: true });
      pz.addEventListener('touchcancel', function () { track = false; }, { passive: true });
    }

    // 처음 보일 때: 탭 줄(.is-in) · 양옆 화살표(.is-seen)
    if ('IntersectionObserver' in window) {
      var seen = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.add(e.target === bar ? 'is-in' : 'is-seen');
          seen.unobserve(e.target);
        });
      }, { threshold: 0.15 });
      if (bar) seen.observe(bar);
      if (side) seen.observe(side);
    } else {
      if (bar) bar.classList.add('is-in');
      if (side) side.classList.add('is-seen');
    }

    // 페이지 안의 다른 #slug 링크(첫 화면 사업 바로가기 등)
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest('a[href^="#"]');
      if (!a || tablist.contains(a)) return;
      var i = idxOf(a.getAttribute('href'));
      if (i < 0) return;
      e.preventDefault();
      select(i, { hash: true, scroll: 'smooth' });
      try { panels[i].focus({ preventScroll: true }); } catch (err) {}
    });
    // 주소의 #slug 가 바뀌면(뒤로 가기 · 직접 입력)
    window.addEventListener('hashchange', function () {
      var i = idxOf(location.hash);
      if (i >= 0) select(i, { scroll: 'auto' });
    });

    // 처음: 주소에 #slug 가 있으면 그 탭을 고르고 탭 줄까지 (글꼴·사진 자리 잡힌 뒤 한 번 더 맞춤)
    var start = idxOf(location.hash);
    select(start >= 0 ? start : 0);
    if (start >= 0) {
      var moved = false;
      ['wheel', 'touchmove', 'keydown'].forEach(function (t) { window.addEventListener(t, function () { moved = true; }, { once: true, passive: true }); });
      var land = function () { if (!moved) toList(false); };
      requestAnimationFrame(land);
      if (document.readyState === 'complete') setTimeout(land, 60); else window.addEventListener('load', function () { setTimeout(land, 60); }, { once: true });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(land);
    }

    // 알약 위치 · 넘침 표시는 글꼴이 바뀌거나 폭이 바뀌면 다시
    var refit = function () { placeInk(true); edge(); };
    if ('ResizeObserver' in window) new ResizeObserver(refit).observe(tablist);
    else window.addEventListener('resize', refit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { refit(); center(false); });
    edge();

    // 탭 줄이 붙어 있는 동안 아래 그림자
    if (bar && spot) {
      var sTick = false;
      var stuck = function () {
        sTick = false;
        var top = parseFloat(getComputedStyle(bar).top) || 0;
        bar.classList.toggle('is-stuck', spot.getBoundingClientRect().top < top - 1 && bar.getBoundingClientRect().top <= top + 1);
      };
      window.addEventListener('scroll', function () { if (!sTick) { sTick = true; requestAnimationFrame(stuck); } }, { passive: true });
      stuck();
    }
  })();
})();

/* ---------- 8) 마무리 배너 '맞는 창구로 연결' — 컨시어지 (22차 · build-business.mjs PICK_BAND · business.css '22차') ----------
   왼쪽 메뉴(7개 사업 + 그룹 제휴)에서 하나를 고르면 오른쪽 카드가 그 창구로 바뀌고, 카드의 큰 버튼 하나가
   분야가 선택된 접수 화면(contact.html?type=…)으로 이어집니다.
   · 스크립트가 없으면 메뉴 항목이 곧 접수 화면 링크 — 여기서 탭(role=tablist/tab/tabpanel)으로 바꿈
   · 고르기: 클릭 · 키보드(↑↓←→ · Home · End · Enter · Space, 자동 선택) · 마우스를 잠깐 올려 두기(1025 이상)
     — 카드 쪽으로 비스듬히 지나가는 중이면 기다려서, 버튼으로 가는 길에 다른 줄이 골라지지 않게 함
     — Ctrl/⌘/Shift 클릭 · 가운데 버튼은 원래 링크대로(새 탭에서 바로 접수 화면)
   · 위 3단계 안내: 처음엔 ①이 차례, 사업을 직접 고르면 ① 완료(체크) → ② 차례 + 버튼 위로 빛이 한 번 지나감
   · 1024 이하: 칩 한 줄을 가로로 넘김(고른 칩을 가운데로) · 카드가 화면 아래로 벗어나 있으면 카드가 보이게 살짝 내림
   · 카드: 마우스를 따라 살짝 기울고 사진이 반대로 조금 움직임(1025 이상 · 마우스 · html.soft-motion 이면 생략)
   · 움직임 멈추기(html.motion-off · 'doogo:motion'): 바로 바뀌고 기울기·빛 없음 */
(function () {
  'use strict';
  var root = document.querySelector('[data-qc]');
  if (!root) return;
  var doc = document.documentElement;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var motionOff = function () { return !!(window.DOOGO && window.DOOGO.motionOff && window.DOOGO.motionOff()); };
  var mq = function (q) { return window.matchMedia ? window.matchMedia(q) : { matches: false }; };
  var desk = mq('(min-width: 1025px)');
  var fine = mq('(hover: hover) and (pointer: fine)');
  var now = function () { return window.performance && performance.now ? performance.now() : Date.now(); };

  var shell = $('.qc', root), wrap = $('.qc-list-wrap', root), list = $('.qc-list', root), ink = $('.qc-ink', root), card = $('.qc-card', root);
  var opts = $$('.qc-opt', root);
  var panels = opts.map(function (a) { return document.getElementById('qc-p-' + a.getAttribute('data-key')); });
  if (!shell || !wrap || !list || !opts.length || panels.some(function (p) { return !p; })) return;
  var steps = $$('.qc-step', root);
  var cur = -1, stepped = false;

  // 링크 목록 → 탭
  list.setAttribute('role', 'tablist');
  list.setAttribute('aria-labelledby', 'qc-menu-t');
  Array.prototype.forEach.call(list.children, function (li) { li.setAttribute('role', 'presentation'); });
  opts.forEach(function (a, i) {
    a.id = 'qc-tab-' + a.getAttribute('data-key');
    a.setAttribute('role', 'tab');
    a.setAttribute('aria-controls', panels[i].id);
    panels[i].setAttribute('role', 'tabpanel');
    panels[i].setAttribute('aria-labelledby', a.id);
  });
  var orient = function () { list.setAttribute('aria-orientation', desk.matches ? 'vertical' : 'horizontal'); };

  // 요소의 위치(메뉴 틀 기준 · 등장 중 transform 과 상관없이)
  var offIn = function (el, top) {
    var x = 0, y = 0;
    while (el && el !== top) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; }
    return { x: x, y: y };
  };
  function placeInk(instant) {
    if (!ink || cur < 0) return;
    var a = opts[cur], o = offIn(a, wrap);
    if (instant) ink.classList.add('is-snap');
    ink.style.setProperty('--x', o.x + 'px');
    ink.style.setProperty('--y', o.y + 'px');
    ink.style.setProperty('--w', a.offsetWidth + 'px');
    ink.style.setProperty('--h', a.offsetHeight + 'px');
    if (instant) { void ink.offsetWidth; ink.classList.remove('is-snap'); }
  }
  // 칩 줄(1024 이하): 넘침 표시 · 고른 칩을 가운데로
  function edge() {
    var max = wrap.scrollWidth - wrap.clientWidth;
    wrap.classList.toggle('is-scrollable', max > 2);
    wrap.classList.toggle('is-start', wrap.scrollLeft <= 2);
    wrap.classList.toggle('is-end', wrap.scrollLeft >= max - 2);
  }
  function center(smooth) {
    var max = wrap.scrollWidth - wrap.clientWidth;
    if (max <= 2 || cur < 0) return;
    var a = opts[cur], o = offIn(a, wrap);
    var left = Math.max(0, Math.min(max, o.x - (wrap.clientWidth - a.offsetWidth) / 2));
    try { wrap.scrollTo({ left: left, behavior: smooth ? 'smooth' : 'auto' }); } catch (e) { wrap.scrollLeft = left; }
  }
  // 3단계 안내: 사업을 직접 고르면 ① 완료 → ② 차례
  function markSteps() {
    if (stepped || steps.length < 2) return;
    stepped = true;
    steps[0].classList.remove('is-cur');
    steps[0].classList.add('is-done');
    steps[1].classList.add('is-cur');
  }

  function select(i, o) {
    o = o || {};
    if (i < 0 || i >= opts.length) return;
    var prev = cur, changed = i !== cur;
    cur = i;
    opts.forEach(function (a, j) {
      var on = j === i;
      a.classList.toggle('is-on', on);
      a.setAttribute('aria-selected', on ? 'true' : 'false');
      a.tabIndex = on ? 0 : -1;
      panels[j].classList.toggle('is-on', on);
      if (on) panels[j].removeAttribute('inert'); else panels[j].setAttribute('inert', '');
    });
    placeInk(prev < 0 || motionOff());
    if (changed && prev >= 0) {
      var p = panels[i];
      p.setAttribute('data-dir', i > prev ? 'down' : 'up');
      p.classList.remove('is-enter', 'is-shine');
      if (!motionOff()) {
        void p.offsetWidth;
        p.classList.add('is-enter');
        if (o.user) p.classList.add('is-shine');
        clearTimeout(p._qcT);
        p._qcT = setTimeout(function () { p.classList.remove('is-enter', 'is-shine'); }, 1700);
      }
    }
    if (o.user) markSteps();
    if (!desk.matches) center(prev >= 0 && !motionOff());
    if (o.focus) { try { opts[i].focus({ preventScroll: true }); } catch (e) { opts[i].focus(); } }
    if (o.reveal && !desk.matches && card) { // 칩을 눌렀는데 카드가 화면 아래에 있으면 카드 윗부분이 보이게
      var r = card.getBoundingClientRect(), vh = window.innerHeight || 800;
      if (r.top > vh - 180) {
        try { window.scrollBy({ top: r.top - vh * .45, behavior: motionOff() ? 'auto' : 'smooth' }); } catch (e) { window.scrollBy(0, r.top - vh * .45); }
      }
    }
  }

  // 클릭 (보조 키 · 가운데 버튼은 원래 링크 그대로)
  list.addEventListener('click', function (e) {
    var a = e.target.closest('.qc-opt');
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    select(opts.indexOf(a), { user: true, reveal: true });
  });
  // 키보드 (자동 선택)
  list.addEventListener('keydown', function (e) {
    var i = opts.indexOf(document.activeElement);
    if (i < 0) return;
    var n = opts.length, to = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') to = (i + 1) % n;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') to = (i - 1 + n) % n;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = n - 1;
    else if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') to = i;
    if (to < 0) return;
    e.preventDefault();
    select(to, { user: true, focus: true });
  });

  // 마우스를 잠깐 올려 두면 고름 (1025 이상) — 카드 쪽으로 비스듬히 지나가는 중이면 기다림(메뉴 조준 판정)
  var hT = 0, hi = -1, pts = [];
  var hoverOk = function () { return desk.matches && fine.matches; };
  list.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    pts.push({ x: e.clientX, y: e.clientY, t: now() });
    if (pts.length > 8) pts.shift();
  }, { passive: true });
  // 지금 움직임이 카드(오른쪽) 쪽을 향하는지 — 카드 왼쪽 위·아래 모서리로 그은 두 선의 기울기 변화로 판정
  var aiming = function () {
    var t = now(), recent = pts.filter(function (o) { return t - o.t < 400; }); // 최근 0.4초 움직임만(오래전 위치는 무시)
    if (!card || recent.length < 2) return false;
    var p = recent[recent.length - 1], q = recent[0];
    var r = card.getBoundingClientRect();
    if (p.x >= r.left || p.x <= q.x) return false;
    var sl = function (a, b) { return (b.y - a.y) / (b.x - a.x); };
    var tl = { x: r.left, y: r.top - 30 }, bl = { x: r.left, y: r.bottom + 30 };
    return sl(p, tl) < sl(q, tl) && sl(p, bl) > sl(q, bl);
  };
  // 그 줄에 들어와 잠깐 머물면 고름. 카드 쪽으로 가는 중이었다면 멈춘 게 확인될 때(0.3초)까지 기다림
  var queue = function (i) {
    clearTimeout(hT);
    hi = i;
    var t0 = now(), aimed = false;
    var check = function () {
      if (hi !== i || !hoverOk()) return;
      var idle = pts.length ? now() - pts[pts.length - 1].t : 999;
      if (aiming()) aimed = true;
      if (aimed && idle < 300 && now() - t0 < 1400) { hT = setTimeout(check, 70); return; }
      if (i !== cur) select(i, { user: true });
    };
    hT = setTimeout(check, 110);
  };
  opts.forEach(function (a, i) {
    a.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse' && hoverOk()) queue(i); });
    a.addEventListener('pointerleave', function () { if (hi === i) { clearTimeout(hT); hi = -1; } });
  });

  // 카드 기울기 + 빛 반사 + 사진 시차 (1025 이상 · 마우스)
  if (card) (function () {
    var tx = 0, ty = 0, gx = 0, gy = 0, raf = 0;
    var ok = function () { return desk.matches && fine.matches && !motionOff() && !doc.classList.contains('soft-motion'); };
    var clear = function () {
      card.classList.remove('is-tilting', 'is-tilt');
      ['--rx', '--ry', '--px', '--py'].forEach(function (k) { card.style.removeProperty(k); });
    };
    function loop() {
      tx += (gx - tx) * .1; ty += (gy - ty) * .1;
      var moving = Math.abs(gx - tx) > .004 || Math.abs(gy - ty) > .004;
      if (!moving && !gx && !gy) { raf = 0; tx = ty = 0; clear(); return; }
      card.style.setProperty('--rx', tx.toFixed(3) + 'deg');
      card.style.setProperty('--ry', ty.toFixed(3) + 'deg');
      card.style.setProperty('--px', (ty * -3).toFixed(2) + 'px');
      card.style.setProperty('--py', (tx * 3).toFixed(2) + 'px');
      raf = moving ? requestAnimationFrame(loop) : 0;
    }
    var kick = function () { if (!raf) raf = requestAnimationFrame(loop); };
    card.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse' || !ok()) return;
      var r = card.getBoundingClientRect();
      var u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
      gy = (u - .5) * 4.4;   // 좌우 → rotateY (±2.2°)
      gx = (v - .5) * -3.6;  // 위아래 → rotateX (±1.8°)
      card.style.setProperty('--gx', (u * 100).toFixed(1) + '%');
      card.style.setProperty('--gy', (v * 100).toFixed(1) + '%');
      card.classList.add('is-tilting', 'is-tilt');
      kick();
    });
    card.addEventListener('pointerleave', function () { gx = gy = 0; card.classList.remove('is-tilt'); kick(); });
    document.addEventListener('doogo:motion', function () { if (motionOff()) { gx = gy = tx = ty = 0; cancelAnimationFrame(raf); raf = 0; clear(); } });
  })();

  // 크기·글꼴·배치가 바뀌면 알약 위치 · 칩 넘침 다시
  var refit = function () { orient(); placeInk(true); edge(); };
  wrap.addEventListener('scroll', edge, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(refit).observe(wrap);
  else window.addEventListener('resize', refit);
  if (desk.addEventListener) desk.addEventListener('change', function () { refit(); center(false); });
  else if (desk.addListener) desk.addListener(function () { refit(); center(false); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
  window.addEventListener('load', refit, { once: true });
  document.addEventListener('doogo:motion', function () {
    if (motionOff()) panels.forEach(function (p) { p.classList.remove('is-enter', 'is-shine'); });
    placeInk(true);
  });

  // 시작: 첫 창구(교육업) — 판이 준비되면 블루 알약이 보임
  orient();
  select(0);
  shell.classList.add('is-ready');
  edge();
})();
