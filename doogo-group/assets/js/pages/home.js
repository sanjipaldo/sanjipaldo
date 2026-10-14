/* =========================================================
   DOOGO GROUP — home.js (메인 페이지 전용)
   히어로 장면 표시기 · 인트로 단어 하이라이트 · 숫자 굴림
   · 그룹 구조(자회사 카드 쌓기) · 사업영역 스티키 스토리(사진) · One Group 집결
   · 브랜드 슬라이더 · 그룹소식 커버플로우 · 화면 밖 애니메이션 정지
   ========================================================= */
(function () {
  'use strict';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var desktopMQ = window.matchMedia('(min-width: 1025px)');
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  // play() 거절(자동재생 차단·연속 전환)로 콘솔 오류가 나지 않게
  function safePlay(v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
  function onMQ(mq, fn) { if (mq.addEventListener) mq.addEventListener('change', fn); else if (mq.addListener) mq.addListener(fn); }

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
      else if (t < ranges[0].start) { en = 'IDEA'; ko = '하나의 아이디어에서'; countEl.textContent = 'INTRO'; }
      else { en = 'DOOGO GROUP'; ko = '일곱 사업이 하나로'; countEl.textContent = 'OUTRO'; }
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

  /* ---------- S2 인트로: 스크롤에 따라 단어가 차오름 ---------- */
  function introWords() {
    var el = $('[data-words]');
    if (!el) return null;
    var words = [];
    function wrap(node, accent) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var s = document.createElement('span');
            s.className = 'w' + (accent ? ' w--accent' : '');
            s.textContent = part;
            frag.appendChild(s); words.push(s);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1) {
          wrap(n, accent || n.hasAttribute('data-accent'));
        }
      });
    }
    wrap(el, false);
    el.classList.add('is-split');
    if (reduceMotion) { words.forEach(function (w) { w.classList.add('is-on'); }); return null; }
    var lit = -1;
    return function (vh) {
      var r = el.getBoundingClientRect();
      // 문장 위쪽이 화면 85% 지점에 오면 시작 → 문장 아래쪽이 45% 지점에 오면 끝
      var p = (vh * 0.85 - r.top) / (vh * 0.4 + r.height);
      var n = Math.round(clamp(p, 0, 1) * words.length);
      if (n === lit) return;
      lit = n;
      words.forEach(function (w, i) { w.classList.toggle('is-on', i < n); });
    };
  }

  /* ---------- S2 숫자 4칸: 굴러 올라가는 숫자 + 선 그리기 ----------
     칸이 화면에 절반쯤 들어오면 재생(.is-on), 화면 밖으로 완전히 나가면 0으로 되돌려
     다시 들어올 때마다 처음부터 재생합니다. 움직임 줄이기면 최종 숫자만. */
  function factsRoll() {
    var root = $('[data-facts]');
    if (!root) return;
    if (reduceMotion || !('IntersectionObserver' in window)) return; // 정적: 마크업의 숫자 그대로
    $$('.fact-roll', root).forEach(function (el) {
      var n = parseInt(el.getAttribute('data-roll'), 10) || 0;
      var reel = document.createElement('span');
      reel.className = 'fact-reel';
      for (var d = 0; d <= n; d++) { var s = document.createElement('span'); s.textContent = d; reel.appendChild(s); }
      el.textContent = '';
      el.appendChild(reel);
      el.style.setProperty('--n', n);
      el.style.setProperty('--rd', (1.15 + n * 0.11).toFixed(2) + 's'); // 큰 숫자는 조금 더 길게 굴러감
    });
    root.classList.add('is-ready');
    // 칸마다 관찰: 모바일 2×2 에서도 보이는 줄부터 재생
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && en.intersectionRatio >= 0.45) en.target.classList.add('is-on');
        else if (!en.isIntersecting) en.target.classList.remove('is-on');
      });
    }, { threshold: [0, 0.45] });
    $$('.fact', root).forEach(function (f) { io.observe(f); });
  }

  /* ---------- S3 그룹 구조: 자회사 카드 스티키 쌓기 ----------
     카드(li.gs-card)는 CSS sticky 로 한 장씩 올라와 겹칩니다.
     여기서는 스크롤 위치로 ① 아래 깔린 카드의 축소·어둡게 ② 들어오는 카드 이미지의 정착(1.08→1)
     ③ 왼쪽 패널의 세로선 채움과 자회사 번호 채움(데스크톱) / 지주회사 카드의 세로선(1024px 이하)을 계산합니다.
     transform·opacity 만 바꿉니다. */
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

    // 움직임 줄이기: 쌓지 않는 목록(CSS) · 선과 번호는 모두 채운 상태
    if (reduceMotion) {
      root.classList.add('is-static');
      nodes.forEach(function (a) { a.classList.add('is-on'); });
      return null;
    }
    root.classList.add('is-live');

    var tops = [], hs = [], natural = [], nodeY = [0];
    var measured = false, near = false;
    var prev = { scale: [], shade: [], img: [], fill: -1, conn: -1, on: -1, cur: -2, ghost: -1 };

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
      // 세로선 위 자회사 점의 위치(선 길이 대비 0~1)
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
        // 1024px 이하: 지주회사 카드가 지나가는 동안 세로선이 자회사 쪽으로 그려짐
        var t = clamp((vh * 0.85 - pr.top) / (pr.height * 0.95), 0, 1);
        setFill(lineAt(t * n));
        setNodes(Math.floor(t * n + 0.02), -1);
        if (cr) {
          var c = Math.round(clamp((vh * 0.8 - cr.top) / (cr.height || 1), 0, 1) * 1000) / 1000;
          if (c !== prev.conn) { conn.style.transform = 'scaleY(' + c + ')'; prev.conn = c; }
        }
      }
    }

    // 자회사 바로가기: 해당 카드가 맨 위에 막 쌓인 위치로 이동
    nodes.forEach(function (a, i) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        measure();
        window.scrollTo({ top: Math.max(0, natural[i] - tops[i] + 1), behavior: 'smooth' });
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
    function remeasure() { measured = false; prev.fill = -1; prev.conn = -1; if (near) update(window.innerHeight); }
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(remeasure, 120); });
    window.addEventListener('load', remeasure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
    onMQ(desktopMQ, remeasure);
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
    var seen = reduceMotion || !('IntersectionObserver' in window);

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
    if ('IntersectionObserver' in window && !reduceMotion) {
      var mio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); mio.unobserve(en.target); } });
      }, { rootMargin: '0px 0px -10% 0px' });
      medias.forEach(function (m) { mio.observe(m); });
    } else medias.forEach(function (m) { m.classList.add('is-in'); });
    onMQ(desktopMQ, function () { seen = true; centerIdx = -1; if (desktopMQ.matches) update(window.innerHeight); });
    return update;
  }

  /* ---------- S5 One Group: 일곱 사업이 가운데로 모임(집결) ----------
     무대가 화면에 충분히 들어오면 .is-in → CSS 가 노드 모임 → 선 그리기 → 빛 점 흐름 → 파동을 차례로 재생.
     화면 밖으로 완전히 나가면 전환 없이 처음 상태로 되돌려, 다시 들어올 때마다 다시 모입니다. */
  function converge() {
    var root = $('[data-cv]');
    if (!root) return;
    if (reduceMotion || !('IntersectionObserver' in window)) { root.classList.add('is-in', 'is-done'); return; }
    var doneT = 0;
    function play() {
      if (root.classList.contains('is-in')) return;
      root.classList.add('is-in');
      clearTimeout(doneT);
      doneT = setTimeout(function () { root.classList.add('is-done'); }, 2300);
    }
    function reset() {
      if (!root.classList.contains('is-in')) return;
      clearTimeout(doneT);
      root.classList.add('no-tr');
      root.classList.remove('is-in', 'is-done');
      void root.offsetWidth;
      root.classList.remove('no-tr');
    }
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && en.intersectionRatio >= 0.42) play();
        else if (!en.isIntersecting) reset();
      });
    }, { threshold: [0, 0.42] }).observe(root);
    // 키보드로 노드에 들어오면 바로 완성 상태로
    root.addEventListener('focusin', play);
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
    var st = { stopped: reduceMotion, hover: false, focus: false, touch: false, view: false };
    var timer = 0, touchT = 0, api = null;

    function running() { return !!api && !st.stopped && !st.hover && !st.focus && !st.touch && st.view && !document.hidden; }
    function ring() { root.classList.remove('is-auto'); if (running()) { void root.offsetWidth; root.classList.add('is-auto'); } }
    function schedule() {
      clearTimeout(timer); timer = 0;
      if (running()) timer = setTimeout(function () { timer = 0; api.go(api.cur() + 1, false); }, MS);
      ring();
    }
    function sync() {
      root.classList.toggle('is-stopped', st.stopped);
      if (toggle) toggle.setAttribute('aria-label', st.stopped ? '자동 넘김 시작' : '자동 넘김 정지');
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
    if (toggle) toggle.addEventListener('click', function () { st.stopped = !st.stopped; sync(); if (!st.stopped) schedule(); });
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

  /* ---------- 화면 밖이면 반복 애니메이션 정지 (마키 · 집결 궤도·빛 점·파동) ---------- */
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
  factsRoll();
  var updaters = [introWords(), groupStack(), bizStory()].filter(Boolean);
  converge();
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
