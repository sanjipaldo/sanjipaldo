/* =========================================================
   DOOGO GROUP — home.js (메인 페이지 전용)
   히어로 장면 표시기 · 인트로 글자 새김 · 숫자 카운트(0부터)
   · 그룹 구조(사이트 첫 화면 카드 · 고정 무대 가로 스크롤) · 사업영역 스티키 스토리(사진)
   · One Group · Brands(세로 트리 ↔ 3D 브랜드 슬라이더 동기화) · 리더십 한 줄 카드(.pcard) · 그룹소식 커버플로우 · 화면 밖 애니메이션 정지
   · 해시(#chain 등)로 들어온 경우 #group 높이 계산 뒤 앵커 위치 보정
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

  /* ---------- S3 그룹 구조: 각 사이트 첫 화면 카드 · 고정 무대 가로 스크롤 ----------
     고정 모드(.is-pin): 섹션 높이 = 무대(100svh) + 가로 이동 거리 + 앞뒤로 잠깐 머무는 구간.
       아래로 스크롤한 만큼 카드 줄이 왼쪽으로 이동합니다(transform 만 · rAF + 약한 보간).
       가로 이동량에 따라 '지금 카드'가 정해짐(넓은 화면: 왼쪽 시작선 쪽 · 휴대폰: 화면 가운데) → 지금 카드는 선명·크기 1, 나머지는 0.94·어둡게.
       캡처 이미지는 카드 이동과 반대로 살짝 움직임(html.soft-motion 이면 이 패럴랙스만 끔).
       카드 폭은 무대 높이에 카드 전체(브라우저 창 + 본문)가 들어오도록 계산합니다(리사이즈·글꼴·이미지 로드 시 다시).
     대체 모드(움직임 멈추기 · 높이 560px 미만 화면 · JS 없음 = CSS 기본값): 고정 없이 가로 스크롤 목록 + 이전/다음 버튼.
     'doogo:motion' 이벤트로 바로 전환하고, 보던 카드를 유지합니다. */
  function groupScroll() {
    var root = $('[data-hs]');
    if (!root) return null;
    var html = document.documentElement;
    var stage = $('.hs-stage', root);
    var view = $('[data-hs-view]', root);
    var track = $('[data-hs-track]', root);
    var panel = $('.hs-panel', root);
    var allItems = $$('[data-hs-item]', root);
    var endCell = $('.hs-end', root);
    var chips = $$('[data-hs-go]', root);
    var chipBox = $('[data-hs-chips]', root);
    var numEl = $('[data-hs-num]', root);
    var barEl = $('[data-hs-bar]', root);
    var prevBtn = $('[data-hs-prev]', root);
    var nextBtn = $('[data-hs-next]', root);
    var foot = $('.hs-foot', root);
    if (!stage || !view || !track || !allItems.length) return null;

    var MIN_H = 560;     // 이보다 낮은 화면은 고정하지 않음
    var LERP = 0.17;     // 60fps 한 프레임당 따라가는 비율
    var pinned = null;
    var items = [], cards = [], dims = [], shots = [], n = 0;
    // 가로 이동량 S(px, 카드 줄을 왼쪽으로 민 거리): sStart → sEnd. 카드 i 가 '지금 카드'가 되는 S = sA0 + i × 간격
    var sStart = 0, sA0 = 0, sAn = 0, travel = 0, narrow = false;
    var dwell0 = 0, total = 0, padL = 0, sizeKey = '';
    var x = 0, tx = 0, lastT = 0, raf = 0, near = false, snap = true, curIdx = -1;
    var prevS = [], prevD = [], prevP = [], prevBar = -1;

    function shown(el) { return !!(el && el.getClientRects().length); }
    function collect() {
      items = allItems.filter(shown);
      cards = items.map(function (li) { return $('.hs-card', li); });
      dims = items.map(function (li) { return $('.hs-dim', li); });
      shots = items.map(function (li) { return $('.hs-shot img', li); });
      n = items.length;
      prevS = []; prevD = []; prevP = []; prevBar = -1; curIdx = -1;
    }
    function wantPin() {
      var h = Math.min(window.innerHeight, html.clientHeight || window.innerHeight);
      return !motionOff() && h >= MIN_H;
    }
    function idOf(i) { return items[i] ? +items[i].getAttribute('data-hs-item') : 1; }
    function indexOfId(id) {
      for (var i = 0; i < n; i++) if (idOf(i) === id) return i;
      return -1;
    }

    // ---- 진행 표시: 번호 · 막대 · 칩 · 지금 카드 ----
    function setBar(t) {
      var v = Math.round(t * 10000) / 10000;
      if (!barEl || v === prevBar) return;
      prevBar = v;
      barEl.style.transform = 'scaleX(' + v + ')';
    }
    function setCurrent(i) {
      if (i === curIdx || !n) return;
      curIdx = i;
      var id = idOf(i), chip = null;
      cards.forEach(function (c, j) { c.classList.toggle('is-current', j === i); });
      chips.forEach(function (b) {
        if (+b.getAttribute('data-hs-go') === id) { b.setAttribute('aria-current', 'true'); chip = b; }
        else b.removeAttribute('aria-current');
      });
      if (numEl) numEl.textContent = id === 0 ? '1+5' : pad(id);
      root.classList.toggle('is-hold-now', id === 0);
      // 칩 줄이 넘치면(좁은 화면) 지금 칩이 보이도록 칩 줄만 가로로 이동
      if (chip && chipBox && chipBox.scrollWidth > chipBox.clientWidth + 1) {
        var l = chip.offsetLeft - (chipBox.clientWidth - chip.offsetWidth) / 2;
        chipBox.scrollTo({ left: Math.max(0, l), behavior: motionOff() ? 'auto' : 'smooth' });
      }
    }

    // ---- 고정 모드: 카드 폭 맞춤 → 위치·이동 거리 → 섹션 높이 ----
    function fit() {
      root.style.removeProperty('--hs-card-w');
      root.style.removeProperty('--hs-row-h');
      root.classList.add('is-measure');
      var site = items.filter(function (li) { return $('.hs-shot', li); });
      var probe = site[0] || items[0];
      var cs = getComputedStyle(track);
      var avail = view.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
      var maxW = probe.offsetWidth;
      var minW = Math.min(maxW, desktopMQ.matches ? 320 : 232);
      var w = maxW, h = 0, k;
      function tallest(list) { var m = 0; list.forEach(function (li) { m = Math.max(m, li.offsetHeight); }); return m; }
      for (k = 0; k < 5; k++) {
        h = tallest(site);
        if (h <= avail || w <= minW) break;
        // 캡처는 16:10 → 폭을 1.6px 줄이면 높이가 1px 줄어듦 (본문 줄바꿈 변화는 다음 회차에서 다시 확인)
        w = Math.max(minW, Math.floor(w - (h - avail) * 1.6 - 2));
        root.style.setProperty('--hs-card-w', w + 'px');
      }
      var rowH = Math.max(h, tallest(items));
      if (shown(panel)) rowH = Math.max(rowH, panel.offsetHeight);
      rowH = Math.max(0, Math.min(rowH, Math.floor(avail)));
      root.style.setProperty('--hs-row-h', rowH + 'px');
      root.classList.remove('is-measure');
    }
    // 넓은 화면의 끝 위치: 마지막 카드가 왼쪽 시작선에 멈추고 그 오른쪽에 마무리 칸이 다 보이는 이동량.
    // 줄 끝 여백(--hs-edge-r)이 큰 화면(1680px 이상)에서 마지막 카드가 시작선을 지나 패널 쪽으로 밀려나지 않게 하고,
    // 마무리 칸이 모자라는 화면(1025px 부근)은 마무리 칸 폭만 줄여 맞춥니다.
    function endShift(step, vw) {
      var last = (n - 1) * step;
      if (!endCell) return last;
      var need = function () { return endCell.offsetLeft + endCell.offsetWidth + 8 - vw; };
      var over = need() - last;
      if (over > 0) {
        var ew = Math.max(196, Math.floor(endCell.offsetWidth - over));
        endCell.style.width = ew + 'px';
        endCell.classList.toggle('is-tight', ew < 240);
      }
      return Math.max(last, need());
    }
    function measure() {
      track.style.transform = 'none';
      view.scrollLeft = 0;
      if (endCell) { endCell.style.width = ''; endCell.classList.remove('is-tight'); }
      fit();
      var vw = view.clientWidth, w = items[0].offsetWidth;
      var c0 = items[0].offsetLeft + w / 2, cN = items[n - 1].offsetLeft + w / 2;
      var step = n > 1 ? (cN - c0) / (n - 1) : w;
      var sEnd = Math.max(0, track.offsetWidth - vw);
      // 한 화면에 카드가 1.5장도 안 들어가면(휴대폰) 지금 카드를 가운데에 · 넓은 화면은 첫 카드 왼쪽 정렬에서 시작해 마지막엔 마무리 칸까지
      narrow = vw < step * 1.5;
      if (narrow) { sA0 = c0 - vw / 2; sAn = cN - vw / 2; sStart = Math.min(sA0, sEnd); }
      else {
        // 지금 카드가 왼쪽 시작선보다 더 밀려나지 않게: 끝 = min(줄 끝, 마지막 카드 시작선 + 마무리 칸)
        sEnd = Math.min(sEnd, endShift(step, vw));
        sA0 = 0; sAn = Math.min(sEnd, (n - 1) * step); sStart = 0;
      }
      travel = Math.max(0, sEnd - sStart);
      var sh = stage.offsetHeight;
      dwell0 = Math.round(sh * 0.06);
      total = dwell0 + travel + Math.round(sh * 0.16);
      root.style.height = (sh + total) + 'px';
      snap = true;
      tx = x = xAt(targetT());
      render(x);
    }
    function targetT() {
      if (!travel) return 0;
      return clamp((-root.getBoundingClientRect().top - dwell0) / travel, 0, 1);
    }
    function xAt(t) { return -(sStart + t * travel); }
    function sOf(i) { return sA0 + (n > 1 ? i / (n - 1) : 0) * (sAn - sA0); } // 카드 i 가 지금 카드가 되는 이동량
    function render(xx) {
      track.style.transform = 'translate3d(' + (Math.round(xx * 100) / 100) + 'px,0,0)';
      var S = -xx;
      var t = travel ? clamp((S - sStart) / travel, 0, 1) : 0;
      var a = sAn > sA0 ? (n - 1) * (S - sA0) / (sAn - sA0) : 0;
      var soft = html.classList.contains('soft-motion');
      for (var i = 0; i < n; i++) {
        var d = i - a;
        var f = clamp(1 - Math.abs(d), 0, 1);
        var e = f * f * (3 - 2 * f);
        var s = Math.round((0.94 + 0.06 * e) * 10000) / 10000;
        // 지나간 카드(왼쪽)는 조금 더 어둡게 → 패널 옆에 걸친 조각이 뒤로 물러나 보임
        var o = Math.round((1 - e) * (d < 0 ? 0.6 : 0.42) * 1000) / 1000;
        if (s !== prevS[i]) { cards[i].style.transform = s === 1 ? '' : 'scale(' + s + ')'; prevS[i] = s; }
        if (o !== prevD[i] && dims[i]) { dims[i].style.opacity = o; prevD[i] = o; }
        if (shots[i]) {
          var p = soft ? 0 : Math.round(clamp(-d, -1.2, 1.2) * 3 * 100) / 100; // 확대 1.08 → 양옆 여유 4% 안에서만 이동
          if (p !== prevP[i]) { shots[i].style.transform = soft ? '' : 'translate3d(' + p + '%,0,0) scale(1.08)'; prevP[i] = p; }
        }
      }
      setBar(t);
      setCurrent(clamp(Math.round(a), 0, n - 1));
    }
    function loop(now) {
      raf = 0;
      var dt = lastT ? Math.min(64, now - lastT) : 16.7;
      lastT = now;
      var diff = tx - x;
      if (snap || Math.abs(diff) < 0.3) { x = tx; snap = false; }
      else x += diff * (1 - Math.pow(1 - LERP, dt / 16.7));
      render(x);
      if (x !== tx) raf = requestAnimationFrame(loop);
      else lastT = 0;
    }
    function update() {
      if (!pinned || !near) return;
      tx = xAt(targetT());
      if (tx !== x || snap) { if (!raf) raf = requestAnimationFrame(loop); }
    }
    // 카드 i 가 '지금 카드'가 되는 페이지 스크롤 위치 (i = n 이면 마무리 칸까지 다 보이는 끝 위치)
    function yFor(i) {
      var top = root.getBoundingClientRect().top + window.scrollY;
      var s = i >= n ? sStart + travel : sOf(i);
      return Math.round(top + dwell0 + clamp(s - sStart, 0, travel));
    }
    function clearPin() {
      cancelAnimationFrame(raf); raf = 0; lastT = 0;
      root.style.height = '';
      root.style.removeProperty('--hs-card-w');
      root.style.removeProperty('--hs-row-h');
      track.style.transform = '';
      if (endCell) { endCell.style.width = ''; endCell.classList.remove('is-tight'); }
      allItems.forEach(function (li) {
        var c = $('.hs-card', li), dm = $('.hs-dim', li), im = $('.hs-shot img', li);
        if (c) c.style.transform = '';
        if (dm) dm.style.opacity = '';
        if (im) im.style.transform = '';
      });
      x = tx = 0;
    }

    // ---- 대체 모드: 가로 스크롤 목록 ----
    function fbSync() {
      if (pinned) return;
      var sl = view.scrollLeft, vw = view.clientWidth, max = view.scrollWidth - vw;
      setBar(max > 0 ? clamp(sl / max, 0, 1) : 0);
      var best = 0, bd = Infinity;
      for (var i = 0; i < n; i++) {
        var dd = Math.abs(fbLeft(i) - sl);
        if (dd < bd) { bd = dd; best = i; }
      }
      if (max > 0 && sl >= max - 2) best = n - 1;
      setCurrent(best);
      // disabled 대신 aria-disabled: 키보드 포커스가 버튼에서 튕겨 나가지 않게
      if (prevBtn) prevBtn.setAttribute('aria-disabled', String(sl <= 2));
      if (nextBtn) nextBtn.setAttribute('aria-disabled', String(max <= 2 || sl >= max - 2));
    }
    // 대체 모드에서 카드 i 를 보여 주는 가로 스크롤 위치 (휴대폰은 가운데 · 넓은 화면은 왼쪽 정렬)
    function fbLeft(i) {
      var li = items[i];
      return narrow ? li.offsetLeft + li.offsetWidth / 2 - view.clientWidth / 2 : li.offsetLeft - padL;
    }
    var fbRaf = 0;
    view.addEventListener('scroll', function () {
      if (pinned) { if (view.scrollLeft) view.scrollLeft = 0; return; }
      if (!fbRaf) fbRaf = requestAnimationFrame(function () { fbRaf = 0; fbSync(); });
    }, { passive: true });

    // ---- 이동: 칩 · 이전/다음 ----
    function go(i, smooth) {
      if (!n) return;
      i = clamp(i, 0, n - 1);
      var beh = smooth && !motionOff() ? 'smooth' : 'instant';
      if (pinned) window.scrollTo({ top: yFor(i), behavior: beh });
      else view.scrollTo({ left: Math.max(0, fbLeft(i)), behavior: beh });
    }
    chips.forEach(function (b) {
      b.addEventListener('click', function () {
        var i = indexOfId(+b.getAttribute('data-hs-go'));
        if (i >= 0) go(i, true);
      });
    });
    function off(b) { return b.getAttribute('aria-disabled') === 'true'; }
    if (prevBtn) prevBtn.addEventListener('click', function () { if (!off(prevBtn)) go(curIdx - 1, true); });
    if (nextBtn) nextBtn.addEventListener('click', function () {
      if (off(nextBtn)) return;
      if (curIdx >= n - 1) view.scrollTo({ left: view.scrollWidth, behavior: motionOff() ? 'instant' : 'smooth' });
      else go(curIdx + 1, true);
    });

    // ---- 키보드: 카드 안 링크에 포커스가 가면 그 카드가 보이는 스크롤 위치로 ----
    root.addEventListener('focusin', function (e) {
      if (!pinned) return;
      var kbd = true;
      try { kbd = e.target.matches(':focus-visible'); } catch (err) { /* 무시 */ }
      if (!kbd) return;
      view.scrollLeft = 0;
      var li = e.target.closest && e.target.closest('[data-hs-item]');
      var i = li ? items.indexOf(li) : (endCell && endCell.contains(e.target) ? n : -1);
      if (i < 0) return;
      var y = yFor(i);
      if (Math.abs(window.scrollY - y) > 2) window.scrollTo({ top: y, behavior: 'instant' });
      cancelAnimationFrame(raf); raf = 0;
      tx = x = i >= n ? xAt(1) : -clamp(sOf(i), sStart, sStart + travel);
      render(x);
    });

    // ---- 모드 결정 · 다시 계산 ----
    function layout(force) {
      var want = wantPin();
      var key = window.innerWidth + 'x' + (want ? stage.offsetHeight : 0) + (want ? 'p' : 'f');
      if (!force && want === pinned && key === sizeKey) { update(); return; }
      var r = root.getBoundingClientRect(), y0 = window.scrollY, oldH = r.height;
      var inView = r.top < window.innerHeight && r.bottom > 0;
      var keep = Math.max(0, curIdx), keepId = n ? idOf(keep) : 1;
      var first = pinned === null, switched = want !== pinned;
      if (switched) {
        if (pinned) clearPin();
        pinned = want;
        root.classList.toggle('is-pin', pinned);
      }
      collect();
      if (pinned) measure();
      else {
        root.style.height = '';
        padL = parseFloat(getComputedStyle(track).paddingLeft) || 0;
        narrow = n > 1 && view.clientWidth < (items[1].offsetLeft - items[0].offsetLeft) * 1.5;
      }
      sizeKey = window.innerWidth + 'x' + (pinned ? stage.offsetHeight : 0) + (pinned ? 'p' : 'f');
      if (switched && !first) {
        // 보던 위치 유지: 섹션이 화면에 있으면 같은 카드로, 위쪽에 지나갔으면 높이 차이만큼 보정
        var ki = Math.max(0, indexOfId(keepId));
        if (inView) {
          if (pinned) window.scrollTo({ top: yFor(ki), behavior: 'instant' });
          else {
            window.scrollTo({ top: Math.round(root.getBoundingClientRect().top + window.scrollY), behavior: 'instant' });
            view.scrollTo({ left: Math.max(0, fbLeft(ki)), behavior: 'instant' });
          }
        } else if (r.bottom <= 0) {
          window.scrollTo({ top: y0 + (root.offsetHeight - oldH), behavior: 'instant' });
        }
      }
      if (pinned) { snap = true; update(); if (!near) { tx = x = xAt(targetT()); render(x); } }
      else fbSync();
    }

    // 화면 근처에서만 계산 · 캡처 이미지는 섹션에 가까워지면 미리 불러옴
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          near = en.isIntersecting;
          if (!near) return;
          // 고정 중엔 아래쪽 진행 표시가 화면 아래 10% 안에 머물러 공통 등장(site.js) 관찰에 안 걸릴 수 있어 여기서 드러냄
          if (foot) foot.classList.add('is-in');
          snap = true; update();
        });
      }, { rootMargin: '40% 0px' }).observe(root);
      var lio = new IntersectionObserver(function (entries) {
        if (!entries.some(function (en) { return en.isIntersecting; })) return;
        $$('img[loading="lazy"]', root).forEach(function (im) { im.loading = 'eager'; });
        lio.disconnect();
      }, { rootMargin: '150% 0px' });
      lio.observe(root);
    } else near = true;

    var rt, ft;
    function relayout() { clearTimeout(rt); rt = setTimeout(function () { layout(false); }, 120); }
    function remeasure() { clearTimeout(ft); ft = setTimeout(function () { layout(true); }, 80); }
    window.addEventListener('resize', relayout);
    window.addEventListener('load', function () { layout(true); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layout(true); });
    $$('img', root).forEach(function (im) { if (!im.complete) im.addEventListener('load', remeasure, { once: true }); });
    onMQ(desktopMQ, function () { layout(true); });
    onMotion(function () { requestAnimationFrame(function () { layout(true); }); });
    layout(true);
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

  /* ---------- S6 리더십: 리더 프로필 카드(.pcard) 한 줄 · 넘칠 때만 이전/다음 + 진행 바 ----------
     1280px 이상은 6장이 한 줄에 다 들어가 버튼이 숨고, 1279px 이하는 가로 스크롤 스냅 + 버튼.
     카드 생김새 · 등장 모션은 base.css '리더 프로필 카드 공통'. */
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

  /* ---------- 공통: 무한 캐러셀 (S5 브랜드 슬라이더 · S7 커버플로우) ----------
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

  /* ---------- S5 One Group · Brands: 세로 트리 (슬라이더와 동기화) ----------
     슬라이드 0 = DOOGO HOLDINGS(맨 위 DOOGO GROUP 행) · 1–7 = 트리 행 순서와 같음.
     set(i): 현재 행(aria-current) 표시 + 빛 점이 줄기를 따라 그 행 높이까지 이동(--dy) + 줄기 채움(--f)
             960px 이하(칩 레일)에서는 현재 칩이 보이도록 레일만 가로로 스크롤(페이지는 움직이지 않음).
     화면 진입(.works.is-in, 한 번): 줄기 선 그리기 → 행이 위에서부터 차례로 점등 → DOOGO GROUP 파동 · 카드 등장(CSS).
     움직임 멈추기면 처음부터 다 보인 상태. */
  function worksTree(sec) {
    var wt = $('[data-wt]', sec);
    var rows = wt ? $$('[data-wt-go]', wt) : [];
    var lis = rows.map(function (b) { return b.closest('li'); });
    var list = wt ? $('.wt-list', wt) : null;
    var stem = wt ? $('.wt-stem', wt) : null, dot = stem ? $('.wt-dot', stem) : null;
    var railMQ = window.matchMedia('(max-width: 960px)');
    var ys = null, cur = -1, moveT = 0;

    // .wt 기준 세로 위치 (변형 무시 → 등장 중 이동과 상관없이 제자리 기준)
    function topIn(el) { var y = 0; while (el && el !== wt) { y += el.offsetTop; el = el.offsetParent; } return y; }
    function measure() {
      ys = null;
      if (!stem || !rows.length || railMQ.matches || !wt.offsetHeight) return;
      var sym = $('.wt-sym', rows[0]) || rows[0];
      var y0 = topIn(sym) + sym.offsetHeight + 5;
      ys = rows.map(function (b, i) { return i ? topIn(b) + b.offsetHeight / 2 : y0; });
      stem.style.setProperty('--y0', y0.toFixed(1) + 'px');
      stem.style.setProperty('--h', Math.max(1, ys[ys.length - 1] - y0).toFixed(1) + 'px');
    }
    function place(i, animate) {
      if (!ys || !stem) return;
      var h = Math.max(1, ys[ys.length - 1] - ys[0]);
      var dy = ys[i] - ys[0];
      var prev = parseFloat(stem.style.getPropertyValue('--dy')) || 0;
      if (dot && animate && Math.abs(dy - prev) > 1 && !motionOff()) {
        dot.classList.toggle('is-up', dy < prev);
        dot.classList.add('is-moving');
        clearTimeout(moveT);
        moveT = setTimeout(function () { dot.classList.remove('is-moving'); }, 700);
      }
      stem.style.setProperty('--dy', dy.toFixed(1) + 'px');
      stem.style.setProperty('--f', (dy / h).toFixed(4));
    }
    function railTo(i, smooth) {
      if (!list || !railMQ.matches || !lis[i]) return;
      var max = list.scrollWidth - list.clientWidth;
      if (max <= 2) return;
      var left = clamp(lis[i].offsetLeft - (list.clientWidth - lis[i].offsetWidth) / 2, 0, max);
      if (Math.abs(left - list.scrollLeft) < 2) return;
      try { list.scrollTo({ left: left, behavior: smooth && !motionOff() ? 'smooth' : 'auto' }); } catch (e) { list.scrollLeft = left; }
    }
    function set(i, animate) {
      if (!rows[i]) return;
      var changed = i !== cur;
      cur = i;
      rows.forEach(function (b, j) {
        if (j === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
        lis[j].classList.toggle('is-current', j === i);
      });
      place(i, animate && changed);
      railTo(i, animate);
    }
    function relayout() { measure(); if (cur >= 0) { place(cur, false); railTo(cur, false); } }

    // 화면 진입 모션 (한 번 재생 · 이후 트리·카드는 그대로 두고 슬라이더 동기화만 계속)
    var playing = false, io = null;
    function play() { if (playing) return; playing = true; sec.classList.add('is-in'); if (io) io.disconnect(); }
    if (!('IntersectionObserver' in window) || motionOff()) play();
    else {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (motionOff() || (en.isIntersecting && en.intersectionRatio >= 0.22)) play(); });
      }, { threshold: [0, 0.22] });
      io.observe(sec);
    }
    sec.addEventListener('focusin', play);
    onMotion(function (off) { if (off) play(); });

    // 키보드: 행 사이를 화살표로 이동 (위/아래 · 칩 레일은 왼쪽/오른쪽)
    if (list) list.addEventListener('keydown', function (e) {
      var k = e.key, d = (k === 'ArrowDown' || k === 'ArrowRight') ? 1 : (k === 'ArrowUp' || k === 'ArrowLeft') ? -1 : 0;
      var i = rows.indexOf(document.activeElement);
      if (!d || i < 0) return;
      e.preventDefault();
      rows[(i + d + rows.length) % rows.length].focus();
    });

    var rt = 0;
    function queue() { clearTimeout(rt); rt = setTimeout(relayout, 100); }
    if (wt && 'ResizeObserver' in window) new ResizeObserver(queue).observe(wt);
    else window.addEventListener('resize', queue);
    onMQ(railMQ, queue);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
    window.addEventListener('load', relayout);
    measure();

    return { rows: rows, set: set };
  }

  /* ---------- S5 One Group · Brands: 3D 브랜드 슬라이더 + 트리 동기화 ----------
     무한 반복 · 가운데 카드 강조(크기·밝기) · 자동 넘김 3.5초
     (가운데 카드에 마우스 · 키보드 포커스 · 터치 · 화면 밖 · 탭 숨김 · 움직임 멈추기 · 정지 버튼이면 멈춤)
     슬라이드가 바뀌면 트리의 해당 행이 켜지고, 트리 행을 누르면 그 슬라이드로 이동(자동 넘김은 몇 초 쉰 뒤 재개). */
  function brandSlider() {
    var sec = $('[data-works]');
    var root = $('[data-bs]');
    if (!root) return;
    var tree = sec ? worksTree(sec) : null;
    var curEl = $('[data-bs-cur]', root), fill = $('[data-bs-fill]', root), status = $('[data-bs-status]', root);
    var toggle = $('[data-bs-toggle]', root), vp = $('[data-bs-viewport]', root);
    var names = $$('.bs-name', root).map(function (el) { return el.textContent; });
    var MS = 3500, HOLD = 6000;
    var st = { stopped: false, moff: motionOff(), hover: false, focus: false, touch: false, hold: false, view: false };
    var timer = 0, touchT = 0, holdT = 0, api = null, ready = false;

    function running() { return !!api && !st.stopped && !st.moff && !st.hover && !st.focus && !st.touch && !st.hold && st.view && !document.hidden; }
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
      // 양옆 카드: 데스크톱은 무대 폭 안에 다 들어오는 크기(0.72–0.86배 · 오른쪽 칸이 좁은 961–1180px 는 0.5배까지 줄여
      // 옆 카드가 화면 끝에서 잘리지 않게), 760px 이하는 0.9배로 살짝 보임
      measure: function (s) {
        var w = s.offsetWidth || 300;
        var gap = parseFloat(getComputedStyle(root).getPropertyValue('--bs-gap')) || 22;
        var vw = vp ? vp.clientWidth : window.innerWidth;
        var iw = window.innerWidth;
        var ss = iw <= 760 ? 0.9 : clamp((vw * 0.96 - w - 2 * gap) / (2 * w), iw <= 1180 ? 0.5 : 0.72, 0.86);
        var x1 = w / 2 + gap + (w * ss) / 2;
        return { x1: x1, x2: w * ss + gap, ss: ss, unit: x1 };
      },
      layout: function (d, m) {
        var a = Math.abs(d), sg = d < 0 ? -1 : 1;
        var x = a <= 1 ? d * m.x1 : sg * (m.x1 + (a - 1) * m.x2);
        return { x: x, s: 1 - Math.min(a, 1) * (1 - m.ss), op: clamp(2.6 - a, 0, 1), dim: Math.min(a, 1.6) * 0.36 };
      },
      onChange: function (i, n) {
        if (curEl) curEl.textContent = pad(i + 1);
        if (fill) fill.style.transform = 'scaleX(' + ((i + 1) / n).toFixed(4) + ')';
        if (tree) tree.set(i, ready);
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
    ready = true;

    $('[data-bs-prev]', root).addEventListener('click', function () { api.go(api.cur() - 1, true); });
    $('[data-bs-next]', root).addEventListener('click', function () { api.go(api.cur() + 1, true); });
    // 트리 행 · 칩: 그 슬라이드로 이동하고 자동 넘김은 잠시 쉼
    if (tree) tree.rows.forEach(function (b) {
      b.addEventListener('click', function () {
        var i = +b.getAttribute('data-wt-go') || 0;
        st.hold = true;
        clearTimeout(holdT);
        holdT = setTimeout(function () { st.hold = false; sync(); }, HOLD);
        if (i !== api.cur()) api.go(i, true); else sync();
      });
    });
    // 정지/재생 버튼: 움직임 멈추기 상태에서 누르면 이 슬라이더만 다시 자동 넘김
    if (toggle) toggle.addEventListener('click', function () {
      var stopped = st.stopped || st.moff;
      st.stopped = !stopped; st.moff = false;
      sync(); if (!st.stopped) schedule();
    });
    onMotion(function (off) { st.moff = off; if (!off) st.stopped = false; sync(); });
    // 마우스: 가운데(현재) 카드 위에 있을 때만 멈춤 → 옆 카드·빈 곳에 커서가 있어도 트리와 함께 계속 넘어감
    root.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var on = !!(e.target.closest && e.target.closest('.bs-slide.is-current'));
      if (on !== st.hover) { st.hover = on; sync(); }
    });
    root.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && st.hover) { st.hover = false; sync(); } });
    // 키보드 포커스가 슬라이더 또는 트리 행(칩)에 있으면 자동 넘김을 멈춤 → 행을 Tab 으로 지나가는 동안 슬라이드·현재 행이 바뀌지 않게
    var wtEl = sec ? $('[data-wt]', sec) : null;
    function focusState() {
      var a = document.activeElement, kbd = false;
      if (a && (root.contains(a) || (wtEl && wtEl.contains(a)))) { try { kbd = a.matches(':focus-visible'); } catch (err) { kbd = true; } }
      // 정지/재생 버튼에 포커스가 있을 때는 상태를 버튼이 직접 정하므로 제외
      st.focus = kbd && a !== toggle;
      sync();
    }
    [root, wtEl].forEach(function (el) {
      if (!el) return;
      el.addEventListener('focusin', focusState);
      el.addEventListener('focusout', function () { setTimeout(focusState, 0); });
    });
    document.addEventListener('visibilitychange', sync);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { st.view = en.isIntersecting; sync(); });
      }, { threshold: 0.3 }).observe(root);
    } else st.view = true;
    sync();
  }

  /* ---------- S7 그룹소식: 커버플로우 ----------
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

  /* ---------- 해시로 바로 들어온 경우(index.html#chain · #works · #leaders …) 위치 보정 ----------
     그룹 구조(#group)는 글꼴 · 캡처 이미지 · load 뒤에 높이를 다시 계산하므로, 브라우저가 먼저 옮겨 둔 앵커 위치가 어긋납니다
     (#chain 으로 들어오면 섹션 위가 잘려 보이던 문제). #group 보다 아래 앵커라면 높이 계산이 끝날 때마다 그 앵커로 다시 맞춥니다.
     사용자가 직접 스크롤 · 터치 · 키를 누르면 즉시 멈추고, load 뒤 1.5초(최소 4초)가 지나면 더 이상 건드리지 않습니다. */
  function hashSettle() {
    var id = (location.hash || '').slice(1);
    if (!id) return;
    var target = null;
    try { target = document.getElementById(decodeURIComponent(id)); } catch (e) { target = document.getElementById(id); }
    var group = $('[data-hs]');
    if (!target || !group || !(group.compareDocumentPosition(target) & 4)) return; // 4 = #group 뒤(아래)에 있는 앵커
    var html = document.documentElement;
    var stopped = false, timer = 0, until = Date.now() + 4000;
    var evs = ['wheel', 'touchstart', 'keydown', 'mousedown'];
    // 보정하는 동안은 브라우저의 앵커 이동도 부드러운 스크롤 없이 바로 (위에서부터 페이지 전체를 훑어 내려가지 않게)
    var prevBehavior = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    function stop() {
      if (stopped) return;
      stopped = true; clearTimeout(timer);
      html.style.scrollBehavior = prevBehavior;
      evs.forEach(function (ev) { window.removeEventListener(ev, stop, { passive: true }); });
      window.removeEventListener('scroll', onScroll);
    }
    evs.forEach(function (ev) { window.addEventListener(ev, stop, { passive: true }); });
    function snap() {
      if (stopped) return;
      if (Date.now() > until) { stop(); return; }
      var mt = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
      var y = Math.max(0, Math.round(target.getBoundingClientRect().top + window.scrollY - mt));
      if (Math.abs(window.scrollY - y) > 1) window.scrollTo({ top: y, behavior: 'instant' });
    }
    function queue(ms) { if (stopped) return; clearTimeout(timer); timer = setTimeout(snap, ms); }
    // 사용자 입력 없이 일어난 스크롤(브라우저의 앵커 이동 · load 뒤 다시 이동)이 멈추면 한 번 더 확인
    function onScroll() { queue(140); }
    window.addEventListener('scroll', onScroll, { passive: true });
    // #group(및 위쪽 섹션) 높이가 바뀔 때마다 — 마지막 변화 뒤 잠깐 기다렸다가 한 번
    if ('ResizeObserver' in window) new ResizeObserver(function () { queue(160); }).observe($('#main') || document.body);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { queue(260); });
    if (document.readyState === 'complete') queue(260);
    else window.addEventListener('load', function () { until = Math.max(until, Date.now() + 1500); queue(260); });
    (function expire() { if (stopped) return; if (Date.now() > until) stop(); else setTimeout(expire, until - Date.now() + 50); })();
  }

  /* ---------- 화면 밖이면 반복 애니메이션 정지 (그룹 구조 · 트리 파동) ---------- */
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
  var updaters = [groupScroll(), bizStory()].filter(Boolean);
  leaders();
  hashSettle();
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
