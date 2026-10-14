/* =========================================================
   DOOGO GROUP — home.js (메인 페이지 전용)
   히어로 장면 표시기 · 인트로 글자 새김 · 숫자 카운트(0부터)
   · 그룹 구조(그룹사 카드 쌓기) · 사업영역 스티키 스토리(사진) · One Group 트리(DOOGO GROUP → 7개 사업)
   · 리더십 한 줄 카드 · 브랜드 슬라이더 · 그룹소식 커버플로우 · 화면 밖 애니메이션 정지
   움직임 정책: OS의 '애니메이션 줄이기' 설정과 관계없이 모든 모션을 재생합니다.
   사용자가 '움직임 멈추기' 버튼(site.js)을 고른 경우에만 멈춥니다 → motionOff() · 'doogo:motion' 이벤트.
   ========================================================= */
(function () {
  'use strict';
  var desktopMQ = window.matchMedia('(min-width: 1025px)');
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  // play() 거절(자동재생 차단·연속 전환)로 콘솔 오류가 나지 않게
  function safePlay(v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
  function onMQ(mq, fn) { if (mq.addEventListener) mq.addEventListener('change', fn); else if (mq.addListener) mq.addListener(fn); }
  // 사용자가 '움직임 멈추기'를 고른 경우만 true (site.js)
  function motionOff() { return !!(window.DOOGO && window.DOOGO.motionOff && window.DOOGO.motionOff()); }
  var motionFns = [];
  function onMotion(fn) { motionFns.push(fn); }
  document.addEventListener('doogo:motion', function (e) {
    var off = !!(e && e.detail && e.detail.off);
    motionFns.forEach(function (fn) { fn(off); });
  });

  /* ---------- S1 히어로: 영상 장면 표시기 ----------
     각 .scene 버튼의 data-start / data-end(초)로 현재 장면을 계산합니다.
     영상을 교체하면 index.html 의 시간 값만 바꾸면 됩니다. */
  function heroScenes() {
    var video = $('#heroVideo');
    var items = $$('.scene[data-start]');
    if (!video || !items.length) return;
    var countEl = $('[data-scene-count]'), enEl = $('[data-scene-en]'), koEl = $('[data-scene-ko]');
    var ranges = items.map(function (b) {
      return { start: parseFloat(b.getAttribute('data-start')) || 0, end: parseFloat(b.getAttribute('data-end')) || 0, en: (b.querySelector('.scene-en') || {}).lastChild, ko: b.querySelector('.scene-ko') };
    });
    var current = -2, raf = null;

    /* 장면 카운터는 사업 번호(01 교육 …)와 헷갈리지 않게 'SCENE 1 / 7' 형식으로 표시합니다. */
    function label(i, t) {
      if (!countEl) return;
      var en, ko;
      if (i >= 0) { en = ranges[i].en ? ranges[i].en.textContent : ''; ko = ranges[i].ko ? ranges[i].ko.textContent : ''; countEl.textContent = 'SCENE ' + (i + 1) + ' / ' + items.length; }
      else if (t < ranges[0].start) { en = 'IDEA'; ko = 'GOOD BUSINESS'; countEl.textContent = 'INTRO'; }
      else { en = 'ONE GROUP'; ko = 'A BETTER TOMORROW'; countEl.textContent = 'OUTRO'; }
      enEl.textContent = en; koEl.textContent = ko;
    }
    function render() {
      var t = video.currentTime || 0, active = -1;
      ranges.forEach(function (r, i) {
        var p = clamp((t - r.start) / ((r.end - r.start) || 1), 0, 1);
        items[i].style.setProperty('--p', p.toFixed(4));
        if (t >= r.start && t < r.end) active = i;
      });
      if (active !== current) {
        items.forEach(function (b, i) {
          b.classList.toggle('is-active', i === active);
          if (i === active) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
        });
        label(active, t);
        current = active;
      }
    }
    function loop() { render(); raf = video.paused ? null : requestAnimationFrame(loop); }
    video.addEventListener('play', function () { if (!raf) raf = requestAnimationFrame(loop); });
    video.addEventListener('timeupdate', render);
    video.addEventListener('seeked', render);
    video.addEventListener('loadedmetadata', render);
    items.forEach(function (b, i) {
      b.addEventListener('click', function () {
        try { video.currentTime = ranges[i].start + 0.02; } catch (e) { /* 메타데이터 전 */ }
        render();
      });
    });
    render();
  }

  /* ---------- S1 히어로: 자동재생 차단 표시 보정 ----------
     site.js 는 play() 가 거절되면 무조건 .is-autoplay-blocked 를 붙입니다.
     로딩 중 화면 밖으로 스크롤해 pause() 된 경우(AbortError)도 '차단'으로 남지 않도록,
     실제로 재생이 시작되면 지우고, 사용자가 직접 정지했거나 재생 중이면 붙지 않게 합니다. */
  function heroPlayGuard() {
    var video = $('#heroVideo');
    var hero = video && video.closest('.hero');
    if (!hero) return;
    function clear() { hero.classList.remove('is-autoplay-blocked'); }
    // 마크업의 autoplay 는 '움직임 멈추기'를 고른 경우에만 거둠 (OS 설정과 무관하게 자동재생)
    if (motionOff()) { video.removeAttribute('autoplay'); video.autoplay = false; if (!video.paused) video.pause(); }
    // 메타데이터만 받고 멈춰 있으면(일부 브라우저의 preload 제한) 데이터가 준비되는 대로 다시 재생 시도
    video.addEventListener('canplay', function () {
      if (video.paused && !motionOff() && video.dataset.userPaused !== '1') {
        var r = video.getBoundingClientRect();
        if (r.bottom > 0 && r.top < window.innerHeight) safePlay(video);
      }
    });
    // 자동재생이 정말 막히면 play 이벤트가 오지 않으므로, play/playing 이 오면 차단이 아님
    video.addEventListener('play', clear);
    video.addEventListener('playing', clear);
    if ('MutationObserver' in window) {
      new MutationObserver(function () {
        if (!hero.classList.contains('is-autoplay-blocked')) return;
        if (!video.paused || video.dataset.userPaused === '1') clear();
      }).observe(hero, { attributes: true, attributeFilter: ['class'] });
    }
    // 큰 재생 버튼은 토글이 아니라 '재생'만 (재생 중에 눌려 멈추는 일 방지)
    var big = $('[data-hero-play]', hero), toggle = $('.hero-toggle', hero);
    if (big) big.addEventListener('click', function () {
      video.dataset.userPaused = '0';
      safePlay(video);
      if (toggle) toggle.focus({ preventScroll: true });
    });
  }

  /* ---------- S2 인트로: 글자가 하나씩 새겨지는 큰 문장 ----------
     원문은 sr-only 로 한 번만 읽히고, 화면용 글자 조각(span.eg-c)은 aria-hidden.
     단어(span.eg-w)는 줄바꿈되지 않게 묶고, '하나의 흐름으로'(data-accent)는 한 덩어리(span.eg-accent).
     화면에 들어오면(.is-on) 글자마다 --ci × 26ms 지연으로 흐림→선명 · 아래→제자리 · 투명→잉크색,
     다 새겨지면(.is-accent) '하나의 흐름으로'가 블루로 바뀌고 밑줄이 그려집니다.
     화면 밖으로 완전히 나가면 처음 상태로 되돌려, 다시 들어올 때 다시 새깁니다. */
  var EG_STEP = 26; // 글자당 지연(ms)
  function engrave() {
    var el = $('[data-engrave]');
    if (!el) return;
    var full = el.textContent.replace(/\s+/g, ' ').trim();
    var vis = document.createElement('span');
    vis.className = 'eg';
    vis.setAttribute('aria-hidden', 'true');
    var chars = [], accents = [];
    function build(node, target, accent) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          n.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { target.appendChild(document.createTextNode(' ')); return; }
            var w = document.createElement('span');
            w.className = 'eg-w';
            Array.from(part).forEach(function (ch) {
              var c = document.createElement('span');
              c.className = 'eg-c';
              c.textContent = ch;
              w.appendChild(c); chars.push(c);
              if (accent) accents.push(c);
            });
            target.appendChild(w);
          });
        } else if (n.nodeName === 'BR') {
          target.appendChild(n.cloneNode(false));
        } else if (n.nodeType === 1) {
          if (n.hasAttribute('data-accent')) {
            var a = document.createElement('span');
            a.className = 'eg-accent';
            target.appendChild(a);
            build(n, a, true);
          } else build(n, target, accent);
        }
      });
    }
    build(el, vis, false);
    var sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = full;
    el.textContent = '';
    el.appendChild(sr);
    el.appendChild(vis);
    chars.forEach(function (c, i) { c.style.setProperty('--ci', i); });
    accents.forEach(function (c, i) { c.style.setProperty('--ai', i); });
    el.style.setProperty('--eg-n', chars.length);
    el.classList.add('is-split');

    var accentT = 0;
    var total = chars.length * EG_STEP + 700; // 마지막 글자가 자리 잡을 무렵 강조 시작
    function play() {
      if (el.classList.contains('is-on')) return;
      el.classList.add('is-on');
      clearTimeout(accentT);
      if (motionOff()) { el.classList.add('is-accent'); return; }
      accentT = setTimeout(function () { el.classList.add('is-accent'); }, total);
    }
    function reset() {
      if (!el.classList.contains('is-on')) return;
      clearTimeout(accentT);
      el.classList.add('no-tr');
      el.classList.remove('is-on', 'is-accent');
      void el.offsetWidth;
      el.classList.remove('no-tr');
    }
    if (!('IntersectionObserver' in window)) { el.classList.add('is-on', 'is-accent'); return; }
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (motionOff()) { play(); return; }
        if (en.isIntersecting && en.intersectionRatio >= 0.3) play();
        else if (!en.isIntersecting) reset();
      });
    }, { threshold: [0, 0.3] }).observe(el);
    onMotion(function (off) {
      if (off) { clearTimeout(accentT); el.classList.add('is-on', 'is-accent'); return; }
      // 다시 켰을 때 화면 밖이면 처음 상태로 → 들어올 때 다시 새김
      var r = el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= window.innerHeight) reset();
    });
  }

  /* ---------- S2 숫자 4칸: 0부터 세어 올라가는 숫자 + 아래 선 그리기 ----------
     숫자는 0 … n 이 세로로 쌓인 띠(.fact-reel)가 위로 올라가며 0부터 차례로 지나갑니다(약 1.8초, 칸마다 0.15초 지연).
     칸이 화면에 30% 들어오면 재생(.is-on), 화면 밖으로 완전히 나가면 0으로 되돌려 다시 들어올 때마다 처음부터.
     움직임 멈추기: 띠 없이 최종 숫자만. */
  function factsCount() {
    var root = $('[data-facts]');
    if (!root || !('IntersectionObserver' in window)) return;
    var facts = $$('.fact', root);
    var nums = $$('.fact-count', root);
    var built = false;
    function build() {
      if (built) return;
      built = true;
      nums.forEach(function (el) {
        var n = parseInt(el.getAttribute('data-to'), 10) || 0;
        var reel = document.createElement('span');
        reel.className = 'fact-reel';
        for (var d = 0; d <= n; d++) { var s = document.createElement('span'); s.textContent = d; reel.appendChild(s); }
        el.textContent = '';
        el.appendChild(reel);
        el.style.setProperty('--n', n);
      });
      root.classList.add('is-ready');
    }
    function unbuild() {
      if (!built) return;
      built = false;
      nums.forEach(function (el) { el.textContent = el.getAttribute('data-to'); });
      root.classList.remove('is-ready');
      facts.forEach(function (f) { f.classList.remove('is-on'); });
    }
    if (!motionOff()) build();
    // 칸마다 관찰: 모바일 2×2 에서도 보이는 줄부터 재생
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!built) return;
        if (en.isIntersecting && en.intersectionRatio >= 0.3) en.target.classList.add('is-on');
        else if (!en.isIntersecting) en.target.classList.remove('is-on');
      });
    }, { threshold: [0, 0.3] });
    facts.forEach(function (f) { io.observe(f); });
    onMotion(function (off) {
      if (off) unbuild();
      else {
        build();
        // 지금 보이는 칸은 바로 다시 셈
        facts.forEach(function (f) {
          var r = f.getBoundingClientRect();
          if (r.top < window.innerHeight * 0.85 && r.bottom > 0) requestAnimationFrame(function () { requestAnimationFrame(function () { f.classList.add('is-on'); }); });
        });
      }
    });
  }

  /* ---------- S3 그룹 구조: 그룹사 카드 스티키 쌓기 ----------
     카드(li.gs-card)는 CSS sticky 로 한 장씩 올라와 겹칩니다.
     여기서는 스크롤 위치로 ① 아래 깔린 카드의 축소·어둡게 ② 들어오는 카드 이미지의 정착(1.08→1)
     ③ 왼쪽 패널의 세로선 채움과 그룹사 번호 채움(데스크톱) / 지주회사 카드의 세로선(1024px 이하)을 계산합니다.
     transform·opacity 만 바꿉니다. 움직임 멈추기(html.motion-off)면 CSS 가 쌓지 않는 목록으로 바꾸고,
     여기서는 선·번호를 모두 채운 정지 상태로 둡니다(전환 시 'doogo:motion' 으로 다시 계산). */
  function groupStack() {
    var root = $('[data-gs]');
    if (!root) return null;
    var cards = $$('.gs-card', root);
    var inners = cards.map(function (c) { return $('.gs-card-in', c); });
    var shades = cards.map(function (c) { return $('.gs-shade', c); });
    var imgs = cards.map(function (c) { return $('.gs-visual img', c); });
    var nodes = $$('[data-gs-node]', root);
    var fill = $('[data-gs-fill]', root);
    var conn = $('[data-gs-conn]', root);
    var panel = $('.gs-panel', root);
    var ghost = $('.gs-ghost', root);
    var list = $('.gs-cards', root);
    var n = cards.length;
    if (!n || !list) return null;

    root.classList.add('is-live');

    var tops = [], hs = [], natural = [], nodeY = [0];
    var measured = false, near = false, isStatic = false;
    var prev = { scale: [], shade: [], img: [], fill: -1, conn: -1, on: -1, cur: -2, ghost: -1 };
    function resetPrev() { prev = { scale: [], shade: [], img: [], fill: -1, conn: -1, on: -1, cur: -2, ghost: -1 }; }

    // 움직임 멈추기: 쌓지 않는 목록(CSS) · 선과 번호는 모두 채운 상태
    function setStatic() {
      if (isStatic) return;
      isStatic = true;
      inners.forEach(function (el) { el.style.transform = ''; });
      shades.forEach(function (el) { el.style.opacity = ''; });
      imgs.forEach(function (el) { if (el) el.style.scale = ''; });
      if (ghost) ghost.style.opacity = '';
      if (fill) fill.style.transform = 'scaleY(1)';
      if (conn) conn.style.transform = 'scaleY(1)';
      nodes.forEach(function (a) { a.classList.add('is-on'); a.classList.remove('is-current'); });
      root.style.removeProperty('--gs-eq');
      resetPrev();
    }

    function measure() {
      // 1024px 이하(카드 높이 auto): 다섯 장을 가장 큰 카드 높이로 맞춤
      // → 쌓인 더미가 같은 순간에 함께 떠나고(CSS 마진), 아래 깔린 카드가 비어져 나오지 않음
      root.style.removeProperty('--gs-eq');
      if (!desktopMQ.matches) {
        var mx = 0;
        inners.forEach(function (el) { mx = Math.max(mx, el.offsetHeight); });
        if (mx) root.style.setProperty('--gs-eq', Math.ceil(mx) + 'px');
      }
      var sy = window.scrollY;
      var gap = parseFloat(getComputedStyle(list).rowGap) || 0;
      var y = list.getBoundingClientRect().top + sy; // 목록 자체는 스티키가 아니므로 제자리 위치
      cards.forEach(function (c, i) {
        tops[i] = parseFloat(getComputedStyle(c).top) || 0;
        hs[i] = c.offsetHeight || 1;
        natural[i] = y;
        y += hs[i] + gap;
      });
      // 세로선 위 그룹사 점의 위치(선 길이 대비 0~1)
      if (fill) {
        var lr = fill.parentNode.getBoundingClientRect();
        var lh = lr.height || 1;
        nodeY = [0].concat(nodes.map(function (a) {
          var d = $('.gs-dot', a).getBoundingClientRect();
          return clamp((d.top + d.height / 2 - lr.top) / lh, 0, 1);
        }));
      }
      measured = true;
    }
    // 진행값 s(0~5) → 세로선 채움 비율: 점과 점 사이를 이어서 채움
    function lineAt(s) {
      if (s <= 0) return 0;
      var k = Math.min(Math.floor(s), n - 1), f = s - k;
      return nodeY[k] + ((nodeY[k + 1] || 1) - nodeY[k]) * f;
    }
    function setNodes(on, cur) {
      if (on === prev.on && cur === prev.cur) return;
      prev.on = on; prev.cur = cur;
      nodes.forEach(function (a, i) {
        a.classList.toggle('is-on', i < on);
        a.classList.toggle('is-current', i === cur);
      });
    }
    function setFill(v) {
      if (!fill || Math.abs(v - prev.fill) < 0.0005) return;
      prev.fill = v;
      fill.style.transform = 'scaleY(' + v.toFixed(4) + ')';
    }

    function update(vh) {
      if (motionOff()) { setStatic(); return; }
      isStatic = false;
      if (!near) return;
      if (!measured) measure();
      var desk = desktopMQ.matches;
      var p = [], s = 0, on = 0, i;
      for (i = 0; i < n; i++) {
        var r = cards[i].getBoundingClientRect();
        // 0: 아직 아래 / 1: 제자리에 붙음(또는 지나감)
        var v = clamp(1 - (r.top - tops[i]) / (hs[i] * 0.85), 0, 1);
        p.push(v); s += v;
        if (v >= 0.55) on = i + 1;
      }
      // 1024px 이하에서 쓰는 위치도 쓰기 전에 모두 읽어 둠 (레이아웃 강제 방지)
      var pr = desk ? null : panel.getBoundingClientRect();
      var cr = desk || !conn ? null : conn.parentNode.getBoundingClientRect();
      // 아래 깔린 카드: 위에 쌓인 장수만큼 작아지고 어두워짐
      var depth = 0;
      for (i = n - 1; i >= 0; i--) {
        var sc = Math.round((1 - Math.min(depth, 4) * 0.045) * 10000) / 10000;
        var sh = Math.round(Math.min(0.6, depth * 0.3) * 1000) / 1000;
        var e = 1 - Math.pow(1 - p[i], 3);
        var im = Math.round((1.08 - 0.08 * e) * 10000) / 10000;
        if (sc !== prev.scale[i]) { inners[i].style.transform = 'scale(' + sc + ')'; prev.scale[i] = sc; }
        if (sh !== prev.shade[i]) { shades[i].style.opacity = sh; prev.shade[i] = sh; }
        if (im !== prev.img[i] && imgs[i]) { imgs[i].style.scale = im; prev.img[i] = im; }
        depth += p[i];
      }
      // 자리 표시(+5)는 첫 카드가 덮는 동안 사라짐 (축소된 카드 뒤로 테두리가 비치지 않게)
      if (ghost) {
        var g = Math.round((1 - p[0]) * 1000) / 1000;
        if (g !== prev.ghost) { ghost.style.opacity = g; prev.ghost = g; }
      }
      if (desk) {
        setFill(lineAt(s));
        setNodes(on, on - 1);
      } else {
        // 1024px 이하: 지주회사 카드가 지나가는 동안 세로선이 그룹사 쪽으로 그려짐
        var t = clamp((vh * 0.85 - pr.top) / (pr.height * 0.95), 0, 1);
        setFill(lineAt(t * n));
        setNodes(Math.floor(t * n + 0.02), -1);
        if (cr) {
          var c = Math.round(clamp((vh * 0.8 - cr.top) / (cr.height || 1), 0, 1) * 1000) / 1000;
          if (c !== prev.conn) { conn.style.transform = 'scaleY(' + c + ')'; prev.conn = c; }
        }
      }
    }

    // 그룹사 바로가기: 해당 카드가 맨 위에 막 쌓인 위치로 이동
    nodes.forEach(function (a, i) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        measure();
        window.scrollTo({ top: Math.max(0, natural[i] - tops[i] + 1), behavior: motionOff() ? 'auto' : 'smooth' });
        inners[i].setAttribute('tabindex', '-1');
        inners[i].focus({ preventScroll: true });
      });
    });
    // 키보드로 아래 깔린 카드 안 링크에 포커스가 가면 그 카드가 맨 위에 오도록
    root.addEventListener('focusin', function (e) {
      var li = e.target.closest && e.target.closest('.gs-card');
      if (!li) return;
      var kbd = true;
      try { kbd = e.target.matches(':focus-visible'); } catch (err) { /* 무시 */ }
      if (!kbd) return;
      var i = cards.indexOf(li);
      requestAnimationFrame(function () {
        measure();
        var y = Math.max(0, natural[i] - tops[i] + 1);
        if (Math.abs(window.scrollY - y) > 4) window.scrollTo({ top: y, behavior: 'instant' });
      });
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { near = en.isIntersecting; if (near) update(window.innerHeight); });
      }, { rootMargin: '200px 0px' }).observe(root);
    } else near = true;
    var rt;
    function remeasure() { measured = false; prev.fill = -1; prev.conn = -1; update(window.innerHeight); }
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(remeasure, 120); });
    window.addEventListener('load', remeasure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
    onMQ(desktopMQ, remeasure);
    onMotion(function () { resetPrev(); requestAnimationFrame(remeasure); });
    if (motionOff()) setStatic();
    return update;
  }

  /* ---------- S4 사업영역: 스티키 스크롤 스토리 (사진) ----------
     데스크톱: 화면 가운데에 걸린 행이 활성 → 오른쪽 프레임의 사진이 크로스페이드 + 느린 줌(CSS).
     프레임이 처음 화면에 들어올 때 첫 사진부터 줌이 보이도록, 그 전에는 활성 사진을 두지 않습니다.
     1024px 이하: 카드 사진이 화면에 들어오면 1.1 → 1 로 천천히 자리 잡음(.is-in). */
  function bizStory() {
    var root = $('[data-biz-story]');
    if (!root) return null;
    var rows = $$('.biz-row', root);
    var phs = $$('.biz-ph', root);
    var caps = $$('.biz-cap', root);
    var dots = $$('.biz-dots i', root);
    var ovls = $$('.biz-ovl-i', root);
    var frame = $('.biz-frame', root);
    var labelEl = $('[data-biz-label]', root);
    var active = -1, centerIdx = -1, lastScroll = 0, px = null, py = null;
    var seen = !('IntersectionObserver' in window);

    function setActive(i) {
      if (i === active || i < 0) return;
      active = i;
      rows.forEach(function (r, j) { r.classList.toggle('is-active', j === i); });
      phs.forEach(function (p, j) { p.classList.toggle('is-active', j === i); });
      caps.forEach(function (c, j) { c.classList.toggle('is-active', j === i); });
      dots.forEach(function (d, j) { d.classList.toggle('is-active', j === i); });
      ovls.forEach(function (o, j) { o.classList.toggle('is-active', j === i); });
      if (labelEl) labelEl.textContent = pad(i + 1) + ' / ' + pad(rows.length) + ' · ' + (rows[i].getAttribute('data-brand') || '');
    }
    // 화면 가운데 선에 걸린 행이 활성
    // (활성 행만 펼쳐지지만, 이웃 행끼리 접힘·펼침이 같은 속도라 가운데 판정이 흔들리지 않습니다)
    function update(vh) {
      lastScroll = Date.now();
      if (!seen || !desktopMQ.matches) return;
      var mid = vh * 0.5, idx = -1;
      for (var j = 0; j < rows.length; j++) {
        var r = rows[j].getBoundingClientRect();
        if (r.top <= mid && r.bottom > mid) { idx = j; break; }
      }
      if (idx === -1) idx = rows[0].getBoundingClientRect().top > mid ? 0 : rows.length - 1;
      if (idx !== centerIdx) { centerIdx = idx; setActive(idx); }
    }
    // 호버 전환은 '실제로 포인터를 움직였을 때'만.
    // 휠 스크롤로 커서 아래 행이 바뀌는 경우(좌표 변화 없음)와 스크롤 직후는 무시 → 가운데 행과 번갈아 바뀌지 않음
    rows.forEach(function (r, j) {
      r.addEventListener('mousemove', function (e) {
        var moved = px !== null && (e.screenX !== px || e.screenY !== py);
        px = e.screenX; py = e.screenY;
        if (!moved || Date.now() - lastScroll < 250 || !desktopMQ.matches || !seen) return;
        setActive(j);
      });
      r.addEventListener('focusin', function () { if (desktopMQ.matches) { seen = true; setActive(j); } });
    });

    if (seen) setActive(0);
    else {
      // 첫 사진의 줌을 아껴 둠: 전환 없이 활성 표시를 지웠다가, 프레임이 보이면 그때 활성화
      if (frame) frame.classList.add('no-tr');
      phs.forEach(function (p) { p.classList.remove('is-active'); });
      if (frame) { void frame.offsetWidth; frame.classList.remove('no-tr'); }
      active = 0; // 목록·캡션의 첫 항목 표시는 마크업 그대로 유지
      var sio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          seen = true; sio.disconnect();
          active = -1; centerIdx = -1;
          if (desktopMQ.matches) update(window.innerHeight); else setActive(0);
        });
      }, { rootMargin: '0px 0px -15% 0px' });
      sio.observe(frame || root);
      // 1024px 이하에서 시작하면 프레임이 보이지 않으므로(display:none) 목록으로 판단
      if (!desktopMQ.matches) { seen = true; sio.disconnect(); active = -1; setActive(0); }
    }

    // 1024px 이하 카드 사진: 들어올 때 천천히 자리 잡음
    var medias = $$('.biz-row-media', root);
    if ('IntersectionObserver' in window) {
      var mio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); mio.unobserve(en.target); } });
      }, { rootMargin: '0px 0px -10% 0px' });
      medias.forEach(function (m) { mio.observe(m); });
    } else medias.forEach(function (m) { m.classList.add('is-in'); });
    onMQ(desktopMQ, function () { seen = true; centerIdx = -1; if (desktopMQ.matches) update(window.innerHeight); });
    return update;
  }

  /* ---------- S5 One Group: 위의 DOOGO GROUP → 아래 7개 사업 트리 ----------
     실제 노드 위치를 재서 선(SVG path)과 빛 점 경로를 만듭니다(px 좌표 · 크기가 바뀌면 다시 만듦).
     - 760px 초과: 짧은 줄기 → 7개 가지(곡선)가 각 노드 윗면으로
     - 760px 이하: 가운데 세로 줄기 → 좌우 노드 안쪽 면으로 가지 · 일곱 번째는 줄기 끝
     재생(.is-in): ① 줄기·가지가 위에서 아래로 그려지고(지연·길이는 여기서 path 마다 지정)
     ② 선이 닿는 순간 노드가 왼쪽부터 차례로 켜지며(.is-lit) ③ 다 켜지면 빛 점이 계속 흐르고(.is-flow) ④ 위 노드에 파동(CSS).
     화면 밖으로 완전히 나가면 처음 상태로 되돌려, 다시 들어올 때마다 다시 이어집니다.
     움직임 멈추기면 다 이어진 상태만 보여 줍니다. */
  function tree() {
    var root = $('[data-tree]');
    if (!root) return;
    var svg = $('.tree-lines', root), flowEl = $('.tree-flow', root), core = $('.tree-core', root);
    var items = $$('.tree-item', root);
    var nodes = items.map(function (li) { return $('.tree-node', li); });
    var n = items.length;
    if (!svg || !core || !n) return;
    var colMQ = window.matchMedia('(max-width: 760px)');
    var NS = 'http://www.w3.org/2000/svg';
    var canFlow = !!(window.CSS && CSS.supports && CSS.supports('offset-path', 'path("M 0 0 L 1 1")'));
    var main = null, segs = [], plan = { lit: [], flowAt: 0 }, timers = [], playing = false, built = false, lastKey = '';

    function r1(v) { return Math.round(v * 10) / 10; }
    function mk(d) { var p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); svg.appendChild(p); return p; }
    function timing(p, dl, du, ez) {
      p.style.setProperty('--dl', dl.toFixed(2) + 's');
      p.style.setProperty('--dur', du.toFixed(2) + 's');
      p.style.setProperty('--ez', ez);
    }

    // 트리 안 좌표(변형 무시): 등장 전 이동·호버 들림과 상관없이 제자리 기준으로 잼
    function box(el) {
      var x = 0, y = 0, w = el.offsetWidth, h = el.offsetHeight;
      while (el && el !== root) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; }
      return { l: x, r: x + w, t: y, b: y + h, cx: x + w / 2, cy: y + h / 2 };
    }
    function build() {
      var W = root.offsetWidth, H = root.offsetHeight;
      if (!W) return false;
      var C = box(core);
      var cx = r1(C.cx), y0 = r1(C.b);
      var col = colMQ.matches;
      var q = nodes.map(box);
      var key = [Math.round(W), Math.round(H), Math.round(cx), Math.round(q[n - 1].t), col ? 1 : 0].join('x');
      if (built && key === lastKey) return true;
      lastKey = key;
      svg.setAttribute('viewBox', '0 0 ' + r1(W) + ' ' + r1(H));
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      segs = []; main = null;
      var flows = [], lit = [];
      var T0 = 0.3; // 위 노드가 나타난 뒤 선이 출발하는 시각(초)
      if (!col) {
        // 줄기(짧게) → 가지(곡선)
        var yJ = r1(y0 + Math.min(26, (q[0].t - y0) * 0.2));
        var tDur = 0.32;
        main = mk('M' + cx + ' ' + y0 + 'V' + yJ);
        timing(main, T0, tDur, 'cubic-bezier(.5,0,1,1)');
        q.forEach(function (o, i) {
          // 줄기에서 갈라질 때 노드 쪽으로 살짝 기울여 출발 → 가지끼리 겹치지 않고 부채꼴로 퍼짐
          var nx = r1(o.cx), ny = r1(o.t - 1), h = ny - yJ;
          var c = 'C' + r1(cx + (nx - cx) * 0.14) + ' ' + r1(yJ + h * 0.52) + ' ' + nx + ' ' + r1(yJ + h * 0.26) + ' ' + nx + ' ' + ny;
          var p = mk('M' + cx + ' ' + yJ + c);
          var dl = T0 + tDur - 0.02 + i * 0.12, du = 0.8;
          timing(p, dl, du, 'cubic-bezier(.22,.6,.3,1)');
          segs[i] = p;
          flows[i] = 'M ' + cx + ' ' + y0 + ' V ' + yJ + ' ' + c;
          lit[i] = dl + du * 0.88;
        });
      } else {
        // 세로 줄기 → 좌우 가지
        var last = q[n - 1];
        var mid = function (o) { return Math.abs(o.cx - cx) < 8; };
        var yEnd = r1(mid(last) ? last.t - 1 : last.cy);
        var len = Math.max(1, yEnd - y0), sDur = Math.max(0.95, len / 340);
        main = mk('M' + cx + ' ' + y0 + 'V' + yEnd);
        timing(main, T0, sDur, 'linear');
        q.forEach(function (o, i) {
          if (mid(o)) { // 줄기 끝 가운데 노드
            flows[i] = 'M ' + cx + ' ' + y0 + ' V ' + r1(o.t - 1);
            lit[i] = T0 + sDur * Math.min(1, (o.t - y0) / len);
            segs[i] = null;
            return;
          }
          var left = o.cx < cx, ex = r1(left ? o.r + 1 : o.l - 1), ny = r1(o.cy);
          var rr = Math.min(12, Math.abs(cx - ex) / 2), sx = left ? -1 : 1, yS = r1(ny - rr);
          var b = 'Q' + cx + ' ' + ny + ' ' + r1(cx + sx * rr) + ' ' + ny + 'H' + ex;
          var p = mk('M' + cx + ' ' + yS + b);
          var dl = T0 + sDur * Math.max(0, (yS - y0) / len) + (left ? 0 : 0.1), du = 0.4;
          timing(p, dl, du, 'cubic-bezier(.22,.6,.3,1)');
          segs[i] = p;
          flows[i] = 'M ' + cx + ' ' + y0 + ' V ' + yS + ' ' + b.replace(/([QH])/g, ' $1 ');
          lit[i] = dl + du * 0.85;
        });
      }
      // 길이 → dash 값 (Safari 의 pathLength 처리 차이를 피해 실제 길이로)
      $$('path', svg).forEach(function (p) {
        var L = 0;
        try { L = p.getTotalLength(); } catch (e) { L = 2000; }
        p.style.setProperty('--len', Math.ceil(L + 2) + 'px');
      });
      // 이미 켜진 노드의 가지는 켜진 색으로
      items.forEach(function (li, i) { if (li.classList.contains('is-lit')) markLit(i); });
      // 빛 점
      flowEl.textContent = '';
      if (canFlow) {
        flows.forEach(function (d, i) {
          var s = document.createElement('i');
          s.className = 'tree-dot';
          s.style.setProperty('--i', i);
          s.style.offsetPath = 'path("' + d + '")';
          flowEl.appendChild(s);
        });
      }
      plan = { lit: lit, flowAt: Math.max.apply(null, lit) + 0.2 };
      built = true;
      return true;
    }

    function markLit(i) {
      items[i].classList.add('is-lit');
      if (segs[i]) segs[i].classList.add('is-lit');
      if (main) main.classList.add('is-lit');
    }
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }
    function play() {
      if (playing) return;
      if (!built && !build()) return;
      playing = true;
      void root.offsetWidth; // 새로 만든 선의 시작 상태(숨김)를 먼저 확정 → 전환으로 그려짐
      root.classList.add('is-in');
      plan.lit.forEach(function (t, i) { timers.push(setTimeout(function () { markLit(i); }, t * 1000)); });
      timers.push(setTimeout(function () { root.classList.add('is-flow'); }, plan.flowAt * 1000));
    }
    function reset() {
      if (!playing) return;
      playing = false;
      clearTimers();
      root.classList.add('no-tr');
      root.classList.remove('is-in', 'is-flow');
      items.forEach(function (li) { li.classList.remove('is-lit'); });
      $$('path', svg).forEach(function (p) { p.classList.remove('is-lit'); });
      void root.offsetWidth;
      root.classList.remove('no-tr');
    }
    function finish() {
      clearTimers();
      if (!built) build();
      playing = true;
      root.classList.add('no-tr');
      root.classList.add('is-in', 'is-flow');
      for (var i = 0; i < n; i++) markLit(i);
      void root.offsetWidth;
      root.classList.remove('no-tr');
    }

    // 노드에 올리면 그 가지와 줄기가 진하게
    nodes.forEach(function (a, i) {
      function hot(on) {
        var p = segs[i];
        if (p) p.classList.toggle('is-hot', on);
        if (main) main.classList.toggle('is-hot', on);
      }
      a.addEventListener('pointerenter', function () { hot(true); });
      a.addEventListener('pointerleave', function () { hot(false); });
      a.addEventListener('focus', function () { hot(true); });
      a.addEventListener('blur', function () { hot(false); });
    });

    // 크기가 바뀌면 경로를 다시 만듦 (재생 중이면 새 선은 바로 다 그려진 상태로 들어옴)
    var rt = 0;
    function rebuild() { clearTimeout(rt); rt = setTimeout(function () { build(); }, 120); }
    if ('ResizeObserver' in window) new ResizeObserver(rebuild).observe(root);
    else window.addEventListener('resize', rebuild);
    onMQ(colMQ, rebuild);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { lastKey = ''; build(); });
    window.addEventListener('load', function () { lastKey = ''; build(); });

    if (!('IntersectionObserver' in window)) { finish(); return; }
    build();
    if (motionOff()) finish();
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (motionOff()) { finish(); return; }
        if (en.isIntersecting && en.intersectionRatio >= 0.35) play();
        else if (!en.isIntersecting) reset();
      });
    }, { threshold: [0, 0.35] }).observe(root);
    // 키보드로 노드에 들어오면 바로 재생
    root.addEventListener('focusin', play);
    onMotion(function (off) {
      if (off) { finish(); return; }
      var r = root.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= window.innerHeight) reset();
    });
  }

  /* ---------- S6 리더십: 한 줄 카드 · 넘칠 때만 이전/다음 + 진행 바 ----------
     1200px 이상은 6열이 한 줄에 다 들어가 버튼이 숨고, 좁은 화면에서는 가로 스크롤 스냅 + 버튼. */
  function leaders() {
    var wrap = $('[data-ldr]');
    if (!wrap) return;
    var track = $('.ldr', wrap), prev = $('[data-ldr-prev]', wrap), next = $('[data-ldr-next]', wrap), fill = $('[data-ldr-fill]', wrap);
    if (!track) return;
    var raf = 0;
    function step() {
      var it = $('.ldr-item', track);
      var gap = parseFloat(getComputedStyle(track).columnGap) || 14;
      return it ? it.getBoundingClientRect().width + gap : track.clientWidth * 0.8;
    }
    function sync() {
      raf = 0;
      var max = track.scrollWidth - track.clientWidth;
      var on = max > 4;
      wrap.classList.toggle('is-scroll', on);
      if (prev) prev.disabled = !on || track.scrollLeft <= 2;
      if (next) next.disabled = !on || track.scrollLeft >= max - 2;
      if (fill) fill.style.setProperty('--p', on ? Math.min(1, (track.scrollLeft + track.clientWidth) / track.scrollWidth).toFixed(4) : '1');
    }
    function queue() { if (!raf) raf = requestAnimationFrame(sync); }
    function go(dir) { track.scrollBy({ left: dir * step(), behavior: motionOff() ? 'auto' : 'smooth' }); }
    if (prev) prev.addEventListener('click', function () { go(-1); });
    if (next) next.addEventListener('click', function () { go(1); });
    track.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    window.addEventListener('load', queue);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(queue);
    sync();
  }

  /* ---------- 공통: 무한 캐러셀 (S7 브랜드 슬라이더 · S8 커버플로우) ----------
     모든 슬라이드는 한 칸에 겹쳐 있고, 현재 카드 기준 거리 d(… -1, 0, 1 …, 범위 [-n/2, n/2))로 배치합니다.
     o.layout(d, m) → { x, z, ry, s, op, dim } · o.measure(첫 슬라이드) → m (m.unit: 한 칸 넘기는 끌기 거리 px)
     반대편 끝으로 넘어가는 카드(이음매)는 전환 없이 옮긴 뒤 투명도만 서서히 올립니다.
     transform · opacity 만 바꿉니다. */
  function carousel(root, o) {
    var viewport = $(o.viewport, root);
    var slides = $$(o.slide, root);
    var n = slides.length;
    if (!viewport || n < 2) return null;
    var dims = slides.map(function (s) { return $(o.dim, s); });
    var links = slides.map(function (s) { return $('a[href]', s); });
    var cur = 0, m = null, prevD = [], drag = null, frame = 0, justDragged = false;

    function wrapD(v) { var h = n / 2; return ((v + h) % n + n) % n - h; }
    function measure() { m = o.measure(slides[0]); }
    function place(f) {
      if (!m) measure();
      for (var i = 0; i < n; i++) {
        var d = wrapD(i - cur + (f || 0));
        var L = o.layout(d, m);
        var s = slides[i];
        var jump = prevD[i] != null && Math.abs(d - prevD[i]) > n / 2 - 0.01;
        if (jump) { s.classList.add('no-tr'); s.style.opacity = '0'; }
        s.style.transform = 'translate3d(' + L.x.toFixed(2) + 'px,0,' + (L.z || 0).toFixed(1) + 'px)' +
          (L.ry ? ' rotateY(' + L.ry.toFixed(2) + 'deg)' : '') + ' scale(' + L.s.toFixed(4) + ')';
        s.style.zIndex = String(100 - Math.round(Math.abs(d) * 10));
        if (dims[i]) dims[i].style.opacity = L.dim.toFixed(3);
        if (jump) { void s.offsetWidth; s.classList.remove('no-tr'); }
        s.style.opacity = L.op.toFixed(3);
        prevD[i] = d;
      }
    }
    function mark() {
      slides.forEach(function (s, i) { s.classList.toggle('is-current', i === cur); });
      if (o.onChange) o.onChange(cur, n);
    }
    function go(i, user) {
      cur = ((i % n) + n) % n;
      place(0);
      mark();
      if (o.onGo) o.onGo(cur, user);
    }

    /* 끌기 · 스와이프: 가로로 8px 이상 움직이면 시작, 세로가 더 크면 페이지 스크롤에 양보 */
    function release() { if (drag && o.onPress) o.onPress(drag.type, false); drag = null; }
    viewport.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, on: false, lx: e.clientX, lt: e.timeStamp, v: 0, type: e.pointerType };
      if (o.onPress) o.onPress(e.pointerType, true);
    });
    viewport.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (!drag.on) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) >= Math.abs(dx)) { release(); return; }
        drag.on = true;
        root.classList.add('is-dragging');
        try { viewport.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      }
      var dt = e.timeStamp - drag.lt;
      if (dt > 0) drag.v = 0.7 * ((e.clientX - drag.lx) / dt) + 0.3 * drag.v;
      drag.lx = e.clientX; drag.lt = e.timeStamp; drag.dx = dx;
      if (!frame) frame = requestAnimationFrame(function () { frame = 0; if (drag && drag.on) place(drag.dx / m.unit); });
    });
    function end(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var d = drag;
      release();
      if (!d.on) return;
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      root.classList.remove('is-dragging');
      justDragged = true;
      setTimeout(function () { justDragged = false; }, 80);
      var f = d.dx / m.unit;
      var k = Math.round(f);
      if (k === 0 && (Math.abs(f) > 0.16 || Math.abs(d.v) > 0.35)) k = (Math.abs(d.v) > 0.35 ? d.v : f) > 0 ? 1 : -1;
      go(cur - k, true);
    }
    viewport.addEventListener('pointerup', end);
    viewport.addEventListener('pointercancel', end);
    viewport.addEventListener('dragstart', function (e) { e.preventDefault(); });

    // 끌고 난 뒤의 클릭은 무시 · 옆 카드를 누르면 이동 대신 가운데로
    root.addEventListener('click', function (e) {
      var s = e.target.closest && e.target.closest(o.slide);
      if (justDragged && s) { e.preventDefault(); e.stopPropagation(); return; }
      if (!s) return;
      var i = slides.indexOf(s);
      if (i !== cur) { e.preventDefault(); e.stopPropagation(); go(i, true); }
    }, true);
    // 키보드: Tab 으로 옆 카드에 오면 가운데로 · 좌우 화살표로 넘김(포커스도 따라감)
    root.addEventListener('focusin', function (e) {
      var s = e.target.closest && e.target.closest(o.slide);
      if (!s) return;
      var kbd = true;
      try { kbd = e.target.matches(':focus-visible'); } catch (err) { /* 무시 */ }
      var i = slides.indexOf(s);
      if (kbd && i !== cur) go(i, true);
    });
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      var onSlide = document.activeElement && document.activeElement.closest && document.activeElement.closest(o.slide);
      go(cur + (e.key === 'ArrowRight' ? 1 : -1), true);
      if (onSlide && links[cur]) links[cur].focus({ preventScroll: true });
    });

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { measure(); slides.forEach(function (s) { s.classList.add('no-tr'); }); place(0); void root.offsetWidth; slides.forEach(function (s) { s.classList.remove('no-tr'); }); }, 120);
    });

    // 시작: 전환 없이 제자리에
    root.classList.add('is-ready');
    slides.forEach(function (s) { s.classList.add('no-tr'); });
    measure();
    place(0);
    mark();
    void root.offsetWidth;
    slides.forEach(function (s) { s.classList.remove('no-tr'); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); place(0); });

    return { go: go, cur: function () { return cur; }, n: n };
  }

  /* ---------- S7 브랜드와 서비스: 3D 브랜드 슬라이더 ----------
     무한 반복 · 가운데 카드 강조(크기·밝기) · 자동 넘김 3.5초
     (마우스 올림 · 키보드 포커스 · 터치 · 화면 밖 · 탭 숨김 · 움직임 줄이기 · 정지 버튼이면 멈춤) */
  function brandSlider() {
    var root = $('[data-bs]');
    if (!root) return;
    var curEl = $('[data-bs-cur]', root), fill = $('[data-bs-fill]', root), status = $('[data-bs-status]', root);
    var toggle = $('[data-bs-toggle]', root);
    var names = $$('.bs-name', root).map(function (el) { return el.textContent; });
    var MS = 3500;
    var st = { stopped: false, moff: motionOff(), hover: false, focus: false, touch: false, view: false };
    var timer = 0, touchT = 0, api = null;

    function running() { return !!api && !st.stopped && !st.moff && !st.hover && !st.focus && !st.touch && st.view && !document.hidden; }
    function ring() { root.classList.remove('is-auto'); if (running()) { void root.offsetWidth; root.classList.add('is-auto'); } }
    function schedule() {
      clearTimeout(timer); timer = 0;
      if (running()) timer = setTimeout(function () { timer = 0; api.go(api.cur() + 1, false); }, MS);
      ring();
    }
    function sync() {
      var stopped = st.stopped || st.moff;
      root.classList.toggle('is-stopped', stopped);
      if (toggle) toggle.setAttribute('aria-label', stopped ? '자동 넘김 시작' : '자동 넘김 정지');
      if (running()) { if (!timer) schedule(); }
      else { clearTimeout(timer); timer = 0; root.classList.remove('is-auto'); }
    }

    api = carousel(root, {
      viewport: '[data-bs-viewport]', slide: '.bs-slide', dim: '.bs-dim',
      measure: function (s) {
        var w = s.offsetWidth || 340;
        var gap = parseFloat(getComputedStyle(root).getPropertyValue('--bs-gap')) || 24;
        var ss = window.innerWidth <= 640 ? 0.9 : 0.86;
        var x1 = w / 2 + gap + (w * ss) / 2;
        return { x1: x1, x2: w * ss + gap, ss: ss, unit: x1 };
      },
      layout: function (d, m) {
        var a = Math.abs(d), sg = d < 0 ? -1 : 1;
        var x = a <= 1 ? d * m.x1 : sg * (m.x1 + (a - 1) * m.x2);
        return { x: x, s: 1 - Math.min(a, 1) * (1 - m.ss), op: clamp(3 - a, 0, 1), dim: Math.min(a, 1.6) * 0.34 };
      },
      onChange: function (i, n) {
        if (curEl) curEl.textContent = pad(i + 1);
        if (fill) fill.style.transform = 'scaleX(' + ((i + 1) / n).toFixed(4) + ')';
      },
      onGo: function (i, user) {
        if (user && status) status.textContent = (i + 1) + ' / ' + names.length + ' ' + (names[i] || '');
        schedule();
      },
      onPress: function (type, down) {
        if (type === 'mouse') return;
        clearTimeout(touchT);
        if (down) { st.touch = true; sync(); }
        else touchT = setTimeout(function () { st.touch = false; sync(); }, 4000);
      }
    });
    if (!api) return;

    $('[data-bs-prev]', root).addEventListener('click', function () { api.go(api.cur() - 1, true); });
    $('[data-bs-next]', root).addEventListener('click', function () { api.go(api.cur() + 1, true); });
    // 정지/재생 버튼: 움직임 멈추기 상태에서 누르면 이 슬라이더만 다시 자동 넘김
    if (toggle) toggle.addEventListener('click', function () {
      var stopped = st.stopped || st.moff;
      st.stopped = !stopped; st.moff = false;
      sync(); if (!st.stopped) schedule();
    });
    onMotion(function (off) { st.moff = off; if (!off) st.stopped = false; sync(); });
    root.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { st.hover = true; sync(); } });
    root.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') { st.hover = false; sync(); } });
    function focusState() {
      var a = document.activeElement, kbd = false;
      if (a && root.contains(a)) { try { kbd = a.matches(':focus-visible'); } catch (err) { kbd = true; } }
      // 정지/재생 버튼에 포커스가 있을 때는 상태를 버튼이 직접 정하므로 제외
      st.focus = kbd && a !== toggle;
      sync();
    }
    root.addEventListener('focusin', focusState);
    root.addEventListener('focusout', function () { setTimeout(focusState, 0); });
    document.addEventListener('visibilitychange', sync);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { st.view = en.isIntersecting; sync(); });
      }, { threshold: 0.3 }).observe(root);
    }
    sync();
  }

  /* ---------- S8 그룹소식: 커버플로우 ----------
     가운데 카드는 정면, 양옆은 rotateY 로 살짝 돌아 뒤로 물러남 · 점 표시 · 이전/다음 · 스와이프 */
  function coverflow() {
    var root = $('[data-cf]');
    if (!root) return;
    var dots = $$('[data-cf-dots] button', root);
    var api = carousel(root, {
      viewport: '[data-cf-viewport]', slide: '.cf-slide', dim: '.cf-dim',
      measure: function (s) {
        var w = s.offsetWidth || 360;
        var mob = window.innerWidth <= 640;
        // 데스크톱: 옆 카드의 안쪽 가장자리(태그·제목이 시작되는 쪽)가 가운데 카드 밑으로 숨지 않게 x1 ≈ 0.97w
        // (회전·원근으로 안쪽 끝이 가운데 쪽으로 약 0.4w 당겨 보이므로 가운데 카드 끝(0.5w)에 맞춤)
        return mob
          ? { x1: w * 0.62, x2: w * 0.4, rot: 32, z: 130, ss: 0.92, edge: 1.6, dk: 0.22, unit: w * 0.7 }
          : { x1: w * 0.97, x2: w * 0.42, rot: 34, z: 150, ss: 0.94, edge: 2.5, dk: 0.1, unit: w * 0.9 };
      },
      layout: function (d, m) {
        var a = Math.abs(d), sg = d < 0 ? -1 : 1;
        var x = a <= 1 ? d * m.x1 : sg * (m.x1 + (a - 1) * m.x2);
        return {
          x: x, z: -Math.min(a, 2) * m.z, ry: -sg * Math.min(a, 1) * m.rot, s: 1 - Math.min(a, 1) * (1 - m.ss),
          op: clamp((m.edge - a) / 0.5, 0, 1), dim: Math.min(a, 1) * m.dk + clamp(a - 1, 0, 1) * 0.14
        };
      },
      onChange: function (i) {
        dots.forEach(function (b, j) { if (j === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
      }
    });
    if (!api) return;
    $('[data-cf-prev]', root).addEventListener('click', function () { api.go(api.cur() - 1, true); });
    $('[data-cf-next]', root).addEventListener('click', function () { api.go(api.cur() + 1, true); });
    dots.forEach(function (b, j) { b.addEventListener('click', function () { api.go(j, true); }); });
  }

  /* ---------- 화면 밖이면 반복 애니메이션 정지 (마키 · 트리 빛 점·파동) ---------- */
  function pauseOffscreen() {
    var els = $$('[data-anim]');
    if (!els.length || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { en.target.classList.toggle('is-paused', !en.isIntersecting); });
    }, { rootMargin: '100px 0px' });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- 실행 + 스크롤 루프 (rAF 1회로 묶음) ---------- */
  heroScenes();
  heroPlayGuard();
  engrave();
  factsCount();
  var updaters = [groupStack(), bizStory()].filter(Boolean);
  tree();
  leaders();
  brandSlider();
  coverflow();
  pauseOffscreen();

  var ticking = false;
  function tick() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var vh = window.innerHeight;
      updaters.forEach(function (fn) { fn(vh); });
    });
  }
  window.addEventListener('scroll', tick, { passive: true });
  window.addEventListener('resize', tick);
  tick();
})();
