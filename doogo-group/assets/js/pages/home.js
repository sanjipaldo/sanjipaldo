/* =========================================================
   DOOGO GROUP — home.js (메인 페이지 전용)
   히어로 장면 표시기 · 인트로 글자 새김 · 숫자 카운트(0부터)
   · 운영 프로젝트(사이트 첫 화면 카드 7장 · 좌우 슬라이드) · 사업영역 스티키 스토리(사진)
   · One Group · Brands(세로 트리 ↔ 3D 브랜드 슬라이더 동기화) · 리더십 한 줄 카드(.pcard) · 그룹소식 커버플로우 · 화면 밖 애니메이션 정지
   · 해시(#chain 등)로 들어온 경우 글꼴 · 이미지 로드 뒤 앵커 위치 보정
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

  /* ---------- S3 두고그룹이 운영하는 프로젝트: 좌우 슬라이드 ----------
     페이지 세로 스크롤은 절대 가로채지 않습니다(고정 · 섹션 높이 계산 · 세로 휠 가로채기 없음).
     카드 줄(.gp-view)은 일반 가로 스크롤 영역 + scroll-snap → 터치 스와이프 · 가로 휠 · 트랙패드는 브라우저 기본 동작.
     더하는 것: 이전/다음 버튼 · 마우스 끌기(놓으면 가장 가까운 카드로) · 진행 표시(01 / 07 + 막대) · 지금 카드 강조 · 키보드 포커스 따라가기.
     '지금 카드'(cur): 버튼으로 고른 카드, 또는 손으로 넘겼을 때 왼쪽 시작선에 가장 가까운 카드.
       넓은 화면은 끝에서 마지막 2–3장이 한 화면에 함께 보이므로, 끝 위치에서는 버튼이 스크롤 없이 강조만 다음 카드로 옮깁니다.
     움직임 멈추기(html.motion-off): 같은 동작 · 스크롤 전환만 즉시. */
  function groupProjects() {
    var root = $('[data-gp]');
    if (!root) return;
    var view = $('[data-gp-view]', root);
    var items = $$('[data-gp-item]', root);
    var n = items.length;
    if (!view || !n) return;
    var cards = items.map(function (li) { return $('.gp-card', li); });
    var numEl = $('[data-gp-num]', root);
    var barEl = $('[data-gp-bar]', root);
    var prevBtn = $('[data-gp-prev]', root);
    var nextBtn = $('[data-gp-next]', root);
    var live = $('[data-gp-live]', root);
    var cur = -1, driving = 0, driveT = 0, raf = 0;

    items.forEach(function (li, i) { li.style.setProperty('--i', i); });
    function beh() { return motionOff() ? 'instant' : 'smooth'; }
    function maxL() { return Math.max(0, view.scrollWidth - view.clientWidth); }
    // 카드 i 를 왼쪽 시작선에 맞추는 스크롤 위치 (첫 카드 = 0)
    function leftOf(i) { return items[i].offsetLeft - items[0].offsetLeft; }
    function lead() {
      var sl = view.scrollLeft, best = 0, bd = Infinity;
      for (var i = 0; i < n; i++) { var d = Math.abs(leftOf(i) - sl); if (d < bd) { bd = d; best = i; } }
      return best;
    }
    // 지금 화면에 다 보이는 카드 범위
    function fullyShown(i) {
      var sl = view.scrollLeft, edge = items[0].offsetLeft;
      var l = items[i].offsetLeft, r = l + items[i].offsetWidth;
      return l >= sl - 2 && r <= sl + view.clientWidth - Math.min(edge, 24) + 2;
    }
    function name(i) { var h = $('h3', items[i]); return h ? h.textContent.replace(/YouTube$/, '').trim() : ''; }
    function setCur(i, say) {
      i = clamp(i, 0, n - 1);
      if (i !== cur) {
        cur = i;
        cards.forEach(function (c, j) { c.classList.toggle('is-current', j === i); });
        if (numEl) numEl.textContent = pad(i + 1);
        if (barEl) barEl.style.transform = 'scaleX(' + ((i + 1) / n).toFixed(4) + ')';
      }
      // disabled 대신 aria-disabled: 키보드 포커스가 버튼에서 튕겨 나가지 않게
      if (prevBtn) prevBtn.setAttribute('aria-disabled', String(cur <= 0));
      if (nextBtn) nextBtn.setAttribute('aria-disabled', String(cur >= n - 1));
      if (say && live) live.textContent = (cur + 1) + ' / ' + n + ' ' + name(cur);
    }
    // 프로그램이 움직이는 동안(버튼 · 끌기 뒤 맞춤)에는 스크롤 위치로 cur 를 바꾸지 않음
    function drive() {
      driving = 1; clearTimeout(driveT);
      driveT = setTimeout(function () { driving = 0; }, motionOff() ? 60 : 900);
    }
    function go(i, say) {
      i = clamp(i, 0, n - 1);
      setCur(i, say);
      var target = Math.min(leftOf(i), maxL());
      if (Math.abs(view.scrollLeft - target) < 2 && fullyShown(i)) return; // 이미 보임(넓은 화면의 끝) → 강조만 이동
      drive();
      view.scrollTo({ left: target, behavior: beh() });
    }
    function onScroll() {
      raf = 0;
      if (driving || drag) return;
      var l = lead();
      // 끝까지 넘겼을 때: 보이는 카드 중 지금 카드를 유지(이미 보이는 뒤쪽 카드를 골라 둔 경우), 아니면 시작선 카드
      if (view.scrollLeft >= maxL() - 2 && cur >= l && fullyShown(cur)) setCur(cur);
      else setCur(l);
    }
    view.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(onScroll); }, { passive: true });
    if ('onscrollend' in window) view.addEventListener('scrollend', function () { if (!drag) { driving = 0; clearTimeout(driveT); } });

    if (prevBtn) prevBtn.addEventListener('click', function () { if (cur > 0) go(cur - 1, true); });
    if (nextBtn) nextBtn.addEventListener('click', function () { if (cur < n - 1) go(cur + 1, true); });

    // ---- 마우스 끌기 (터치 · 펜은 브라우저 기본 스와이프) ----
    var drag = null, moved = false;
    view.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = { id: e.pointerId, x0: e.clientX, sl0: view.scrollLeft, on: false, lx: e.clientX, lt: e.timeStamp, v: 0 };
      moved = false;
    });
    view.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x0;
      if (!drag.on) {
        if (Math.abs(dx) < 6) return;
        drag.on = true; moved = true;
        view.classList.add('is-drag');
        try { view.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      }
      var dt = Math.max(1, e.timeStamp - drag.lt);
      drag.v = 0.8 * ((e.clientX - drag.lx) / dt) + 0.2 * drag.v;
      drag.lx = e.clientX; drag.lt = e.timeStamp;
      view.scrollLeft = drag.sl0 - dx;
      e.preventDefault();
    });
    function endDrag(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      var was = drag.on, v = drag.v;
      drag = null;
      if (!was) return;
      view.classList.remove('is-drag');
      // 놓을 때 속도만큼 조금 더 간 위치에서 가장 가까운 카드로
      var aim = view.scrollLeft - v * 160, best = 0, bd = Infinity;
      for (var i = 0; i < n; i++) { var d = Math.abs(Math.min(leftOf(i), maxL()) - aim); if (d < bd) { bd = d; best = i; } }
      go(best, false);
    }
    view.addEventListener('pointerup', endDrag);
    view.addEventListener('pointercancel', endDrag);
    view.addEventListener('lostpointercapture', endDrag);
    // 끌기 직후의 클릭(링크 열림)은 막음
    view.addEventListener('click', function (e) {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
    }, true);
    view.addEventListener('dragstart', function (e) { e.preventDefault(); });

    // ---- 키보드: 카드 안 링크로 탭 이동하면 그 카드가 다 보이게 · ←/→ 로 카드 이동 ----
    root.addEventListener('focusin', function (e) {
      var li = e.target.closest && e.target.closest('[data-gp-item]');
      if (!li) return;
      var i = items.indexOf(li);
      if (i < 0) return;
      setCur(i);
      if (!fullyShown(i)) { drive(); view.scrollTo({ left: Math.min(leftOf(i), maxL()), behavior: 'instant' }); }
    });
    view.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var i = cur + (e.key === 'ArrowRight' ? 1 : -1);
      if (i < 0 || i >= n) return;
      e.preventDefault();
      go(i, true);
      var a = $('a[href]', items[i]);
      if (a) a.focus({ preventScroll: true });
    });

    // 캡처 이미지는 섹션에 가까워지면 미리 불러옴(가로로 숨어 있는 카드 포함)
    if ('IntersectionObserver' in window) {
      var lio = new IntersectionObserver(function (entries) {
        if (!entries.some(function (en) { return en.isIntersecting; })) return;
        $$('img[loading="lazy"]', root).forEach(function (im) { im.loading = 'eager'; });
        lio.disconnect();
      }, { rootMargin: '120% 0px' });
      lio.observe(root);
    }
    window.addEventListener('resize', function () { if (!raf) raf = requestAnimationFrame(onScroll); });
    setCur(0);
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
     글꼴 · 이미지 로드로 위쪽 섹션 높이가 바뀌면 브라우저가 먼저 옮겨 둔 앵커 위치가 어긋날 수 있어,
     #group 보다 아래 앵커라면 높이 변화가 멈출 때마다 그 앵커로 다시 맞춥니다.
     사용자가 직접 스크롤 · 터치 · 키를 누르면 즉시 멈추고, load 뒤 1.5초(최소 4초)가 지나면 더 이상 건드리지 않습니다. */
  function hashSettle() {
    var id = (location.hash || '').slice(1);
    if (!id) return;
    var target = null;
    try { target = document.getElementById(decodeURIComponent(id)); } catch (e) { target = document.getElementById(id); }
    var group = $('#group');
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
  groupProjects();
  var updaters = [bizStory()].filter(Boolean);
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
