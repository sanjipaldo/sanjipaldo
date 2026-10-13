/* =========================================================
   DOOGO GROUP — home.js (메인 페이지 전용)
   히어로 장면 표시기 · 인트로 단어 하이라이트 · 그룹 구조도
   · 사업영역 스티키 스토리 · 지연 포스터 · 화면 밖 애니메이션 정지
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

    function label(i, t) {
      if (!countEl) return;
      var en, ko;
      if (i >= 0) { en = ranges[i].en ? ranges[i].en.textContent : ''; ko = ranges[i].ko ? ranges[i].ko.textContent : ''; countEl.textContent = pad(i + 1) + ' / ' + pad(items.length); }
      else if (t < ranges[0].start) { en = 'IDEA'; ko = '하나의 아이디어에서'; countEl.textContent = '00 / ' + pad(items.length); }
      else { en = 'DOOGO GROUP'; ko = '일곱 사업이 하나로'; countEl.textContent = pad(items.length) + ' / ' + pad(items.length); }
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

  /* ---------- S3 그룹 구조도: 탭 + SVG 연결선 ---------- */
  function groupChart() {
    var root = $('[data-gchart]');
    if (!root) return;
    var tabs = $$('[role="tab"]', root);
    var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute('aria-controls')); });
    var svg = $('.glines', root), top = $('.gchart-top', root), hub = $('.ghub', root);
    var NS = 'http://www.w3.org/2000/svg';
    var lines = [], flows = [], dots = [];
    var active = 0, timer = null, visible = false;
    var AUTO_MS = 6500;                 // 자동 넘김 간격(읽을 시간 확보)
    var off = false, hovering = false;  // off: 사용자가 끔(조작·버튼) / hovering: 마우스가 구조도 위
    var autoBtn = $('[data-gauto-btn]', root), curEl = $('[data-gauto-cur]', root);

    tabs.forEach(function (t, i) {
      var l = document.createElementNS(NS, 'path'); l.setAttribute('class', 'gline'); l.setAttribute('pathLength', '1'); l.style.setProperty('--i', i);
      var f = document.createElementNS(NS, 'path'); f.setAttribute('class', 'gflow'); f.setAttribute('pathLength', '1');
      var d = document.createElementNS(NS, 'circle'); d.setAttribute('class', 'gdot'); d.setAttribute('r', '3.5');
      svg.appendChild(l); svg.appendChild(f); svg.appendChild(d);
      lines.push(l); flows.push(f); dots.push(d);
    });

    // 지주회사 노드 아래 → 각 사업 아이콘 위로 곡선
    function draw() {
      if (!desktopMQ.matches) return;
      var box = top.getBoundingClientRect();
      if (!box.width) return;
      svg.setAttribute('viewBox', '0 0 ' + Math.round(box.width) + ' ' + Math.round(box.height));
      var h = hub.getBoundingClientRect();
      var x0 = h.left + h.width / 2 - box.left, y0 = h.bottom - box.top;
      tabs.forEach(function (t, i) {
        var ic = $('.gnode-ico', t).getBoundingClientRect();
        var x1 = ic.left + ic.width / 2 - box.left, y1 = ic.top - box.top - 10;
        var dy = y1 - y0;
        var d = 'M' + x0.toFixed(1) + ' ' + y0.toFixed(1) +
          ' C' + x0.toFixed(1) + ' ' + (y0 + dy * 0.62).toFixed(1) + ' ' + x1.toFixed(1) + ' ' + (y1 - dy * 0.62).toFixed(1) + ' ' + x1.toFixed(1) + ' ' + y1.toFixed(1);
        lines[i].setAttribute('d', d); flows[i].setAttribute('d', d);
        dots[i].setAttribute('cx', x1.toFixed(1)); dots[i].setAttribute('cy', y1.toFixed(1));
      });
    }

    function select(i, focus) {
      active = i;
      tabs.forEach(function (t, j) {
        var on = j === i;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        lines[j].classList.toggle('is-on', on); flows[j].classList.toggle('is-on', on); dots[j].classList.toggle('is-on', on);
        if (panels[j]) panels[j].classList.toggle('is-active', on);
      });
      if (curEl) curEl.textContent = pad(i + 1);
      if (focus) tabs[i].focus();
    }
    function syncBtn() {
      if (!autoBtn) return;
      autoBtn.setAttribute('aria-pressed', String(off));
      autoBtn.setAttribute('aria-label', off ? '계열 사업 자동 넘김 다시 시작' : '계열 사업 자동 넘김 일시정지');
      autoBtn.classList.toggle('is-paused', off);
    }
    function runAuto() {
      clearTimeout(timer); timer = null;
      root.classList.remove('is-auto');
      if (off || hovering || reduceMotion || !visible || !desktopMQ.matches) return;
      void root.offsetWidth; // 진행 바 애니메이션을 처음부터
      root.classList.add('is-auto');
      timer = setTimeout(function () { select((active + 1) % tabs.length); runAuto(); }, AUTO_MS);
    }
    function stopAuto() { off = true; syncBtn(); runAuto(); }
    root.style.setProperty('--auto-ms', AUTO_MS + 'ms');
    if (reduceMotion && autoBtn) autoBtn.closest('.gauto').hidden = true;

    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { stopAuto(); select(i); });
      t.addEventListener('mouseenter', function () { select(i); }); // 호버는 일시정지(아래 root 호버)만
      t.addEventListener('focus', function () { stopAuto(); select(i); });
      t.addEventListener('keydown', function (e) {
        var n = tabs.length, j = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % n;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + n) % n;
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = n - 1;
        if (j !== null) { e.preventDefault(); select(j, true); }
      });
    });
    root.addEventListener('focusin', function (e) { if (e.target.closest('.gpanel')) stopAuto(); });
    // 구조도(노드·패널) 위에 마우스가 있으면 일시정지 → 벗어나면 다시 시작
    root.addEventListener('mouseenter', function () { hovering = true; runAuto(); });
    root.addEventListener('mouseleave', function () { hovering = false; runAuto(); });
    root.addEventListener('touchstart', function () { if (!off) stopAuto(); }, { passive: true });
    if (autoBtn) autoBtn.addEventListener('click', function () { off = !off; syncBtn(); runAuto(); });

    // 데스크톱 = 탭, 1024px 이하 = 세로 트리(모든 패널 펼침)
    function setMode() {
      var desk = desktopMQ.matches;
      root.classList.toggle('is-tabs', desk);
      panels.forEach(function (p, j) {
        if (!p) return;
        if (desk) { p.setAttribute('role', 'tabpanel'); p.setAttribute('aria-labelledby', tabs[j].id); }
        else { p.removeAttribute('role'); p.removeAttribute('aria-labelledby'); }
      });
      if (desk) draw();
      runAuto();
    }
    onMQ(desktopMQ, setMode);
    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(draw, 120); });
    window.addEventListener('load', draw);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
    setMode();
    select(0);
    syncBtn();

    // 화면에 들어오면 선 그리기 + 자동 순환 (화면 밖이면 정지)
    var section = root.closest('section');
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          visible = en.isIntersecting;
          if (visible) { draw(); root.classList.add('is-drawn'); }
          if (section) section.classList.toggle('is-paused', !visible);
          runAuto();
        });
      }, { threshold: 0.25 }).observe(root);
    } else root.classList.add('is-drawn');
  }

  /* ---------- S4 사업영역: 스티키 스크롤 스토리 ---------- */
  function bizStory() {
    var root = $('[data-biz-story]');
    if (!root) return null;
    var rows = $$('.biz-row', root);
    var vids = $$('.biz-frame video', root);
    var caps = $$('.biz-cap', root);
    var dots = $$('.biz-dots i', root);
    var ovls = $$('.biz-ovl-i', root);
    var labelEl = $('[data-biz-label]', root);
    var active = -1, centerIdx = -1, inView = false;
    var offAt = [], lastScroll = 0, px = null, py = null;
    // 재생할 수 있는 형식(source type)이 없으면 영상을 내려받지 않고 포스터만 보여 줍니다
    function playable(v) {
      return $$('source', v).some(function (src) {
        var t = src.getAttribute('type');
        if (!t) return true;
        return v.canPlayType(t === 'video/mp4' ? 'video/mp4; codecs="avc1.42E01E"' : t) !== '';
      });
    }
    var canPlay = vids.map(playable);

    function syncVideos() {
      vids.forEach(function (v, j) {
        var should = canPlay[j] && j === active && inView && desktopMQ.matches && !reduceMotion;
        if (should) {
          if (v.preload === 'none') v.preload = 'auto';
          // 오래 쉬었던 영상만 처음부터 — 잠깐 오간 경우엔 이어서 재생(깜빡임·재시작 방지)
          if (v.paused && offAt[j] && Date.now() - offAt[j] > 4000 && v.readyState > 0) { try { v.currentTime = 0; } catch (e) { /* 무시 */ } }
          safePlay(v);
        } else if (!v.paused) { v.pause(); offAt[j] = Date.now(); }
      });
    }
    function setActive(i) {
      if (i === active || i < 0) return;
      active = i;
      rows.forEach(function (r, j) { r.classList.toggle('is-active', j === i); });
      vids.forEach(function (v, j) { v.classList.toggle('is-active', j === i); });
      caps.forEach(function (c, j) { c.classList.toggle('is-active', j === i); });
      dots.forEach(function (d, j) { d.classList.toggle('is-active', j === i); });
      ovls.forEach(function (o, j) { o.classList.toggle('is-active', j === i); });
      if (labelEl) labelEl.textContent = pad(i + 1) + ' / ' + pad(rows.length) + ' · ' + (rows[i].getAttribute('data-brand') || '');
      syncVideos();
    }
    // 화면 가운데 선에 걸린 행이 활성
    // (활성 행만 펼쳐지지만, 이웃 행끼리 접힘·펼침이 같은 속도라 가운데 판정이 흔들리지 않습니다)
    function update(vh) {
      lastScroll = Date.now();
      if (!desktopMQ.matches) return;
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
        if (!moved || Date.now() - lastScroll < 250 || !desktopMQ.matches) return;
        setActive(j);
      });
      r.addEventListener('focusin', function () { if (desktopMQ.matches) setActive(j); });
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { inView = en.isIntersecting; syncVideos(); });
      }, { threshold: 0.1 }).observe(root);
    }
    onMQ(desktopMQ, syncVideos);
    setActive(0);
    return update;
  }

  /* ---------- 지연 포스터: 화면 근처에 온 영상에만 poster 지정 ---------- */
  function lazyPosters() {
    var vids = $$('video[data-poster]');
    function set(v) { if (!v.getAttribute('poster')) v.setAttribute('poster', v.getAttribute('data-poster')); }
    if (!('IntersectionObserver' in window)) { vids.forEach(set); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { set(en.target); io.unobserve(en.target); } });
    }, { rootMargin: '900px 0px' });
    vids.forEach(function (v) { io.observe(v); });
  }

  /* ---------- 화면 밖이면 반복 애니메이션 정지 (마키 · 흐르는 점) ---------- */
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
  var updaters = [introWords(), bizStory()].filter(Boolean);
  groupChart();
  lazyPosters();
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
