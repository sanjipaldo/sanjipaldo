/* =========================================================
   DOOGO GROUP — about.js (그룹 소개)
   히어로(지주회사로 모이는 그룹사 · 패럴랙스) · 첫 화면 숫자 굴림 · 소개 문장 글자 새김 · 태그라인 스크롤 채움
   · 그룹 조직도(지주회사 → 연결선 그리기 → 그룹사 · 흐르는 빛) · 연혁 숫자 굴림 · 연혁 진행선 · 화면 밖 무한 모션 정지
   · 탭(그룹 소개 · 비전과 철학 · 그룹 구조 · 주요 연혁 · 국내외 거점 — 주소 #앵커 연동, 맨 아래)
   모션은 OS 설정과 관계없이 재생합니다. 사용자가 '움직임 멈추기'를 고르면(window.DOOGO.motionOff()) 최종 상태로 보여 주고,
   'doogo:motion' 이벤트로 다시 켜면 이어서 움직입니다. OS 설정이 켜진 기기(html.soft-motion)는 패럴랙스만 뺍니다.
   ========================================================= */
(function () {
  'use strict';
  var doc = document.documentElement;
  var motionOff = function () { return !!(window.DOOGO && window.DOOGO.motionOff && window.DOOGO.motionOff()); };
  var softMotion = function () { return doc.classList.contains('soft-motion'); };
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var hasIO = 'IntersectionObserver' in window;
  var onMotion = []; // 'doogo:motion' 전환 때 부를 함수들 (off: true/false)
  var onShow = [];   // 탭 패널이 새로 보일 때 부를 함수들 (panel) — 숨어 있던 동안 0 으로 잰 위치를 다시 잼
  // 움직이는 중에 멈추면, 이미 시작된 전환(transition)까지 바로 끝 상태로 보냅니다
  var finishAnims = function (root) {
    if (!root || !root.getAnimations) return;
    root.getAnimations({ subtree: true }).forEach(function (a) { try { a.finish(); } catch (e) { /* 무한 반복은 base.css 가 정지 */ } });
  };
  document.addEventListener('doogo:motion', function (e) {
    var off = !!(e.detail && e.detail.off);
    onMotion.forEach(function (fn) { fn(off); });
    if (off) requestAnimationFrame(function () { finishAnims($('#main')); });
  });

  /* ---------- 스크롤 연동 (rAF 한 번에 처리) ---------- */
  var stageFig = $('[data-stage]');
  var tagline = $('[data-tagline]');
  var words = tagline ? $$('span', tagline) : [];
  var timeline = $('[data-timeline]');
  var tlTrack = timeline ? $('.ab-tl-track', timeline) : null;
  var tlYears = timeline ? $$('[data-tl-year]', timeline).map(function (y) {
    return { el: y, items: $$('.ab-tl-item', y).map(function (li) { return { el: li, dot: $('.ab-tl-dot', li), y: 0 }; }) };
  }) : [];
  var tlGeo = { top: 0, h: 0 };
  var ticking = false;
  // transform(등장 모션)의 영향을 받지 않는 위치: offsetTop 을 anc 까지 더함
  var offTop = function (el, anc) { var y = 0; while (el && el !== anc) { y += el.offsetTop; el = el.offsetParent; } return y; };
  // 연혁 진행선: 첫 점 ~ 마지막 점 사이에만 (창 크기 · 글꼴이 바뀌면 다시 계산)
  function layoutTimeline() {
    if (!tlTrack) return;
    var first = null, last = null;
    tlYears.forEach(function (yr) {
      yr.items.forEach(function (it) {
        if (!it.dot) return;
        it.y = offTop(it.dot, timeline) + it.dot.offsetHeight / 2;
        if (!first) first = it;
        last = it;
      });
    });
    if (!first) return;
    tlGeo.top = first.y; tlGeo.h = Math.max(1, last.y - first.y);
    tlTrack.style.top = tlGeo.top.toFixed(1) + 'px';
    tlTrack.style.height = tlGeo.h.toFixed(1) + 'px';
  }

  function update() {
    ticking = false;
    var vh = window.innerHeight || 800;
    var still = motionOff();

    // 1) 히어로 무대 패럴랙스: 배경 궤도와 앞쪽(지주회사·그룹사)이 서로 반대로 조금씩 (about.css 에서 --py 배율)
    if (stageFig) {
      if (still || softMotion()) stageFig.style.removeProperty('--py');
      else {
        var r = stageFig.getBoundingClientRect();
        if (r.bottom > 0 && r.top < vh) {
          var p = (r.top + r.height / 2 - vh / 2) / vh; // -1 ~ 1
          stageFig.style.setProperty('--py', clamp(p * -70, -60, 60).toFixed(1) + 'px');
        }
      }
    }

    // 2) 영문 태그라인: 스크롤에 따라 단어가 차례로 채워짐 (한 번 채워진 단어는 유지)
    var tr = words.length ? tagline.getBoundingClientRect() : null;
    if (tr && tr.height > 0) { // 숨은 탭 패널 안이면(크기 0) 건너뜀 — 안 그러면 보이기도 전에 다 채워짐
      var prog = clamp((vh * 0.88 - tr.top) / (tr.height + vh * 0.4), 0, 1);
      var lit = still ? words.length : Math.round(prog * words.length * 1.2);
      words.forEach(function (w, i) { if (i < lit) w.classList.add('is-lit'); });
    }

    // 3) 연혁 진행선: 화면 60% 지점까지 선이 채워지고(transform), 지난 항목의 점 · 연도가 켜집니다.
    //    지금 읽는 연도는 블루(.is-current), 지난 연도는 잉크색, 아직인 연도는 윤곽선. 움직임 멈추기면 끝까지 채운 상태.
    if (tlTrack && tlGeo.h > 1) {
      var tr0 = timeline.getBoundingClientRect();
      var mark = vh * 0.6;
      var tp = still ? 1 : clamp((mark - tr0.top - tlGeo.top) / tlGeo.h, 0, 1);
      tlTrack.style.setProperty('--p', tp.toFixed(4));
      tlTrack.style.setProperty('--hy', (tp * tlGeo.h).toFixed(1) + 'px');
      tlTrack.style.setProperty('--ho', !still && tp > 0 && tp < 1 ? '1' : '0');
      var cur = -1;
      tlYears.forEach(function (yr, yi) {
        var any = false;
        yr.items.forEach(function (it) {
          var hit = still || tr0.top + it.y <= mark;
          it.el.classList.toggle('is-reached', hit);
          if (hit) any = true;
        });
        yr.el.classList.toggle('is-reached', any);
        if (any) cur = yi;
      });
      tlYears.forEach(function (yr, yi) { yr.el.classList.toggle('is-current', !still && yi === cur); });
    }
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { layoutTimeline(); onScroll(); });
  layoutTimeline();
  update();
  onMotion.push(function () { update(); });
  onShow.push(function () { layoutTimeline(); update(); });
  if (timeline) {
    if ('ResizeObserver' in window) new ResizeObserver(function () { layoutTimeline(); onScroll(); }).observe(timeline);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layoutTimeline(); onScroll(); });
  }

  /* ---------- 첫 화면 숫자: 1 지주회사 · 5 그룹사 · 7 사업영역 · 2 국가 ----------
     0 … n 숫자 띠를 transform 으로 굴려 올립니다(약 1.8초, 칸마다 0.15초 지연, 이징).
     화면에 30% 들어오면 시작하고, 완전히 벗어나는 순간 0 으로 되돌려 두었다가 다시 들어오면 또 굴립니다.
     숫자 아래 얇은 선은 .is-counted 로 왼쪽부터 그려집니다 — 첫 화면에서는 블록이 떠오른(fade-up) 뒤에 그려지도록 --line-base 로 늦춤. */
  var facts = $('[data-facts]');
  if (facts) {
    var nums = $$('[data-ab-count]', facts).map(function (el) {
      var n = parseInt(el.getAttribute('data-ab-count'), 10) || 0;
      var strip = '';
      for (var k = 0; k <= n; k++) strip += '<span>' + k + '</span>';
      el.innerHTML = '<span class="ab-odo" aria-hidden="true"><span class="ab-odo-strip">' + strip + '</span></span><span class="sr-only">' + n + '</span>';
      return { n: n, odo: el.firstChild };
    });
    var firstRoll = true, factsIn = false;
    var showFinal = function () {
      nums.forEach(function (o) { o.odo.classList.remove('is-rolling'); o.odo.style.setProperty('--n', o.n); });
      facts.classList.add('is-counted');
    };
    var resetFacts = function () { // 전환 없이 즉시 0 · 밑줄 지움
      nums.forEach(function (o) { o.odo.classList.remove('is-rolling'); o.odo.style.setProperty('--n', 0); });
      facts.classList.remove('is-counted');
    };
    var roll = function () {
      if (motionOff()) { showFinal(); return; }
      resetFacts();
      void facts.offsetWidth; // 0 으로 되돌린 상태를 먼저 그린 뒤 굴림 시작
      var base = firstRoll ? 0.55 : 0.08; // 처음엔 등장(fade-up: --d .45s + .8s) 모션과 맞춰 조금 늦게
      facts.style.setProperty('--line-base', firstRoll ? '.85s' : '.12s');
      firstRoll = false;
      nums.forEach(function (o, i) {
        o.odo.style.setProperty('--odo-dur', '1.8s');
        o.odo.style.setProperty('--odo-delay', (base + i * 0.15).toFixed(2) + 's');
        o.odo.classList.add('is-rolling');
        o.odo.style.setProperty('--n', o.n);
      });
      facts.classList.add('is-counted');
    };
    if (!hasIO || motionOff()) showFinal();
    else resetFacts();
    if (hasIO) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && en.intersectionRatio >= 0.3) { if (!factsIn) { factsIn = true; roll(); } }
          else if (!en.isIntersecting && factsIn) { factsIn = false; if (!motionOff()) resetFacts(); } // 완전히 벗어나면 0 으로 되돌려 두고 다음에 다시 굴림
        });
      }, { threshold: [0, 0.3] }).observe(facts);
    }
    onMotion.push(function (off) { if (off) showFinal(); else if (factsIn) roll(); });
  }

  /* ---------- 소개 문장 글자 새김 (data-engrave) ----------
     글자마다 span 으로 나눠(aria-hidden) 화면에 들어오면 차례로 새기고, 원문은 sr-only 로 한 번만 읽힙니다.
     다 새겨지면 강조 구절([data-accent])이 블루로 바뀌고 밑줄이 그려집니다. */
  var eg = $('[data-engrave]');
  if (eg) {
    var plain = eg.textContent.replace(/\s+/g, ' ').trim();
    var vis = document.createElement('span'); vis.setAttribute('aria-hidden', 'true');
    var chars = [], accents = [];
    var addText = function (text, target, isAccent) {
      text.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) { target.appendChild(document.createTextNode(' ')); return; }
        var w = document.createElement('span'); w.className = 'eg-w';
        Array.prototype.forEach.call(part, function (ch) {
          var c = document.createElement('span'); c.className = 'eg-c'; c.textContent = ch;
          w.appendChild(c); chars.push(c); if (isAccent) accents.push(c);
        });
        target.appendChild(w);
      });
    };
    Array.prototype.slice.call(eg.childNodes).forEach(function (node) {
      if (node.nodeType === 3) addText(node.textContent, vis, false);
      else if (node.nodeType === 1 && node.hasAttribute('data-accent')) {
        var acc = document.createElement('span'); acc.className = 'eg-accent';
        addText(node.textContent, acc, true);
        vis.appendChild(acc);
      } else if (node.nodeType === 1) addText(node.textContent, vis, false);
    });
    var sr = document.createElement('span'); sr.className = 'sr-only'; sr.textContent = plain;
    eg.textContent = ''; eg.appendChild(sr); eg.appendChild(vis);
    chars.forEach(function (c, i) { c.style.setProperty('--ci', i); });
    accents.forEach(function (c, i) { c.style.setProperty('--ai', i); });
    // egPlayed: 실제로 한 글자씩 새겨졌는지. 멈춤 상태에서 최종 모습만 보인 경우엔 false 로 두어,
    // 나중에 '움직임 켜기'를 누르면 (보이는 중이면 바로, 아니면 화면에 들어올 때) 처음부터 새깁니다.
    var accTimer = 0, egPlayed = false, egIn = false, egIO = null;
    var finish = function () { clearTimeout(accTimer); eg.classList.add('is-on', 'is-accent'); };
    var start = function () {
      if (motionOff()) { finish(); return; }
      egPlayed = true;
      if (egIO) egIO.disconnect();
      eg.classList.add('is-on');
      accTimer = setTimeout(function () { eg.classList.add('is-accent'); }, chars.length * 24 + 750);
    };
    var rearm = function () { // 전환 없이 즉시 새기기 전 상태로
      clearTimeout(accTimer);
      eg.classList.add('is-reset');
      eg.classList.remove('is-on', 'is-accent');
      void eg.offsetWidth;
      eg.classList.remove('is-reset');
    };
    eg.classList.add('is-split');
    if (!hasIO || motionOff()) finish();
    if (hasIO) {
      egIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { egIn = en.isIntersecting; if (egIn) start(); });
      }, { rootMargin: '0px 0px -18% 0px', threshold: 0.2 });
      egIO.observe(eg);
    }
    onMotion.push(function (off) {
      if (off) { finish(); return; }
      if (egPlayed || !hasIO) return;
      rearm();
      if (egIn) requestAnimationFrame(start);
    });
  }

  /* ---------- 히어로 무대: 다섯 그룹사가 지주회사로 모여듭니다 ----------
     그룹사 타일 가운데 → 지주회사 3D(블록 덩어리) 가장자리까지 선을 실제 위치로 계산해 그립니다(창 크기가 바뀌면 다시 계산).
     등장: 지주회사 → 바깥에 흩어져 있던 그룹사가 01~05 차례로 모임(--ox/--oy: 바깥쪽 출발 위치) → 선 → 끝점.
     다 모인 뒤에는 화면에 보이는 동안만 빛 점이 선을 따라 가운데로 흐르고 고리가 퍼집니다(.is-vis). */
  if (stageFig) {
    var fg = $('.ab-stage-fg', stageFig);
    var core = $('.ab-core', stageFig);
    var sats = $$('.ab-sat', stageFig);
    var raysBox = $('.ab-rays', stageFig);
    var rays = sats.map(function (s, i) {
      var ray = document.createElement('span');
      ray.className = 'ab-ray'; ray.style.setProperty('--i', i); ray.appendChild(document.createElement('i'));
      raysBox.appendChild(ray);
      return ray;
    });
    var layoutStage = function () {
      var W = fg.offsetWidth;
      if (!W || !core.offsetWidth) return;
      // 지주회사 3D 안의 가운데 블록(이미지 가로 50% · 세로 47.6%)과 블록 덩어리의 반지름(가로 37% · 세로 28%)
      var cw = core.offsetWidth, ch = core.offsetHeight;
      var cl = core.offsetLeft - cw / 2; // .ab-core 는 translate: -50% 0 (offsetLeft 는 translate 전 위치)
      var ax = cl + cw * 0.5, ay = core.offsetTop + ch * 0.476, rx = cw * 0.37, ry = ch * 0.28;
      stageFig.style.setProperty('--ax', ax.toFixed(1) + 'px');
      stageFig.style.setProperty('--ay', ay.toFixed(1) + 'px');
      stageFig.style.setProperty('--pr', (rx * 2).toFixed(1) + 'px');
      sats.forEach(function (s, i) {
        var tile = s.firstElementChild, half = tile.offsetWidth / 2;
        var cx = s.offsetLeft + half, cy = s.offsetTop + tile.offsetHeight / 2;
        var dx = ax - cx, dy = ay - cy, d = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / d, uy = dy / d;
        var edge = 1 / Math.sqrt((ux / rx) * (ux / rx) + (uy / ry) * (uy / ry)); // 이 방향에서 블록 덩어리 가장자리까지
        var len = Math.max(0, d - edge);
        var ray = rays[i];
        ray.style.left = cx.toFixed(1) + 'px'; ray.style.top = cy.toFixed(1) + 'px'; ray.style.width = len.toFixed(1) + 'px';
        ray.style.setProperty('--a', Math.atan2(dy, dx).toFixed(4) + 'rad');
        ray.style.setProperty('--len', len.toFixed(1) + 'px');
        ray.style.setProperty('--from', Math.min(len, half / Math.max(Math.abs(ux), Math.abs(uy))).toFixed(1) + 'px'); // 타일 가장자리에서 출발
        s.style.setProperty('--ox', (-ux * W * 0.13).toFixed(1) + 'px'); // 모이기 전: 지주회사 반대쪽(바깥)으로 물러나 있음
        s.style.setProperty('--oy', (-uy * W * 0.13).toFixed(1) + 'px');
      });
    };
    layoutStage();
    var coreImg = $('img', core);
    if (coreImg && !coreImg.complete) coreImg.addEventListener('load', layoutStage);
    var stageRaf = 0;
    window.addEventListener('resize', function () { cancelAnimationFrame(stageRaf); stageRaf = requestAnimationFrame(layoutStage); });

    var gathered = false, gTimers = [];
    var gatherNow = function () { gTimers.forEach(clearTimeout); gathered = true; stageFig.classList.add('is-gather', 'is-gathered'); };
    if (!hasIO || motionOff()) gatherNow();
    else stageFig.classList.add('is-armed');
    if (hasIO) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          stageFig.classList.toggle('is-vis', en.isIntersecting); // 화면 밖이면 빛 점·고리·영상 버튼 링 정지
          if (en.isIntersecting && !gathered && en.intersectionRatio >= 0.25) {
            gathered = true;
            layoutStage();
            // 첫 화면에서는 무대가 떠오르는(data-reveal scale, --d .2s) 동안 조금 기다렸다가 모읍니다
            gTimers.push(setTimeout(function () { stageFig.classList.add('is-gather'); }, 260));
            gTimers.push(setTimeout(function () { stageFig.classList.add('is-gathered'); }, 260 + 2100));
          }
        });
      }, { threshold: [0, 0.25] }).observe(stageFig);
    }
    onMotion.push(function (off) { if (off) gatherNow(); });
  }

  /* ---------- 공통: 숫자 띠 굴림 (0–9 세로 띠를 transform 으로 올려 멈춤) ---------- */
  // el 의 글자를 숫자 띠로 바꿉니다. 숫자는 0–9 를 한 바퀴 돈 뒤(10 + n) 멈춤. 반환: 띠 목록 [{ strip, n }]
  // 칸 너비는 멈출 숫자에 맞춤(tab 이면 모든 칸을 같은 너비로 — 큰 숫자에서 굴러가는 동안 잘림이 없게)
  function buildRoll(el, text, cls, delayOf, tab) {
    var html = '', di = 0;
    Array.prototype.forEach.call(text, function (ch) {
      if (/\d/.test(ch)) {
        var s = '';
        for (var k = 0; k < 10 + (+ch) + 1; k++) s += '<span>' + (k % 10) + '</span>';
        html += '<span class="' + cls + '"><span class="' + cls + '-w">' + (tab ? '0' : ch) + '</span><span class="' + cls + '-s" data-d="' + ch + '" style="--dl:' + delayOf(di).toFixed(2) + 's">' + s + '</span></span>';
        di++;
      } else html += '<span class="' + cls + '-c">' + ch + '</span>';
    });
    el.innerHTML = html;
    return $$('.' + cls + '-s', el).map(function (s) { return { strip: s, n: 10 + (+s.getAttribute('data-d')) }; });
  }

  /* ---------- 그룹 조직도: 지주회사 → 연결선 → 그룹사 다섯 ----------
     연결선은 지주회사 아래 가운데(모바일은 왼쪽 줄기)에서 각 그룹사 카드 접점까지의 SVG path 로, 카드의 실제 위치로 계산합니다
     (ResizeObserver · 창 크기 · 글꼴 로드 때 다시 계산). 다섯 선은 같은 거리 D 만큼 함께 그려져(stroke-dashoffset) 줄기에서 갈라지듯 보이고,
     선이 닿는 순서대로 카드가 올라오며 얼굴 원이 톡 튀어나옵니다.
       · 1100px 이상(한 줄) · 700–1099px(3 + 2): 지주회사가 보이면 시간에 따라 그립니다.
       · 699px 이하(세로 줄기): 스크롤을 따라 그립니다 — 화면 아래쪽 80% 선까지 줄기가 자라고, 지나간 카드에 가지가 뻗습니다.
     다 그려지면 화면에 보이는 동안만(.is-live) 빛이 지주회사에서 다섯 그룹사로 흐르고(Web Animations · transform/opacity),
     도착한 접점에서 파동이 퍼집니다. 움직임 멈추기면 처음부터 다 그려진 정지 상태로 보여 줍니다. */
  var oc = $('[data-oc]');
  if (oc) (function () {
    var chart = $('[data-oc-chart]', oc);
    var svg = $('.ab-oc-svg', oc);
    var fx = $('.ab-oc-fx', oc);
    var root = $('[data-oc-root]', oc);
    var NS = 'http://www.w3.org/2000/svg';
    var CL = 56; // 빛 꼬리 길이 (about.css .ab-oc-comet 너비와 같게)
    var mqRow = window.matchMedia('(min-width: 1100px)');
    var mqTree = window.matchMedia('(max-width: 699.98px)');
    var modeNow = function () { return mqRow.matches ? 'row' : (mqTree.matches ? 'tree' : 'split'); };
    var f1 = function (v) { return (Math.round(v * 10) / 10).toString(); };
    var mk = function (cls) { var s = document.createElement('span'); s.className = cls; fx.appendChild(s); return s; };
    var place = function (el, x, y) { el.style.left = f1(x) + 'px'; el.style.top = f1(y) + 'px'; };

    // SVG: 위(흰빛) → 아래(블루) 그라데이션 + 그룹사마다 번짐선 · 선
    var defs = document.createElementNS(NS, 'defs');
    var grad = document.createElementNS(NS, 'linearGradient');
    grad.setAttribute('id', 'ab-oc-grad'); grad.setAttribute('gradientUnits', 'userSpaceOnUse');
    grad.setAttribute('x1', '0'); grad.setAttribute('x2', '0'); grad.setAttribute('y1', '0'); grad.setAttribute('y2', '1');
    [['0', '#FFFFFF', '.95'], ['1', '#6FA2F2', '.75']].forEach(function (s) {
      var st = document.createElementNS(NS, 'stop');
      st.setAttribute('offset', s[0]); st.setAttribute('stop-color', s[1]); st.setAttribute('stop-opacity', s[2]);
      grad.appendChild(st);
    });
    defs.appendChild(grad); svg.appendChild(defs);
    var items = $$('.ab-oc-node', oc).map(function (node) {
      var glow = document.createElementNS(NS, 'path'); glow.setAttribute('class', 'ab-oc-glow');
      var line = document.createElementNS(NS, 'path'); line.setAttribute('class', 'ab-oc-line');
      svg.appendChild(glow); svg.appendChild(line);
      var card = $('.ab-oc-card', node);
      return { node: node, card: card, av: $('.ab-oc-av', card), glow: glow, line: line, L: 0, on: false, end: null };
    });
    // 겹침 순서: 빛 < 파동 < 접점
    items.forEach(function (it) { it.comet = mk('ab-oc-comet'); });
    var rootPing = mk('ab-oc-ping');
    items.forEach(function (it) { it.ping = mk('ab-oc-ping'); });
    var rootPort = mk('ab-oc-port ab-oc-port--root');
    items.forEach(function (it) { it.port = mk('ab-oc-port'); });

    var geo = { maxL: 0, mode: '', x0: 0, y0: 0 };
    var D = 0, Dt = 0, state = 'armed', raf = 0, timers = [], vis = false, anims = [];

    function layout() {
      var W = chart.clientWidth, H = chart.clientHeight;
      if (!W || !H) return;
      var cr = chart.getBoundingClientRect(), rr = root.getBoundingClientRect();
      var m = modeNow();
      var y0 = rr.bottom - cr.top, sy = y0 - 4; // 카드 아래에 살짝 숨겨 시작
      var x0 = m === 'tree' ? (parseFloat(getComputedStyle(chart).getPropertyValue('--oc-spine')) || 16) : rr.left - cr.left + rr.width / 2;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      var top1 = Infinity;
      items.forEach(function (it) {
        var nr = it.node.getBoundingClientRect(); // li 는 움직이지 않음(등장 모션은 안쪽 카드)
        if (m === 'tree') it.end = { x: nr.left - cr.left, y: nr.top - cr.top + it.card.offsetTop + it.av.offsetTop + it.av.offsetHeight / 2 };
        else { it.end = { x: nr.left - cr.left + nr.width / 2, y: nr.top - cr.top }; top1 = Math.min(top1, it.end.y); }
      });
      var busY = m === 'tree' ? 0 : y0 + (top1 - y0) / 2;
      var maxL = 0;
      items.forEach(function (it) {
        var e = it.end, d, r;
        if (m === 'tree') {
          r = Math.max(0, Math.min(14, (e.x - x0) / 2, (e.y - sy) / 2));
          d = 'M' + f1(x0) + ' ' + f1(sy) + 'V' + f1(e.y - r) + 'Q' + f1(x0) + ' ' + f1(e.y) + ' ' + f1(x0 + r) + ' ' + f1(e.y) + 'H' + f1(e.x);
        } else {
          var dx = e.x - x0;
          if (Math.abs(dx) < 1.5) d = 'M' + f1(x0) + ' ' + f1(sy) + 'V' + f1(e.y);
          else {
            var s = dx > 0 ? 1 : -1;
            r = Math.max(0, Math.min(18, Math.abs(dx) / 2, (busY - sy) / 2, (e.y - busY) / 2));
            d = 'M' + f1(x0) + ' ' + f1(sy) + 'V' + f1(busY - r) + 'Q' + f1(x0) + ' ' + f1(busY) + ' ' + f1(x0 + s * r) + ' ' + f1(busY) +
              'H' + f1(e.x - s * r) + 'Q' + f1(e.x) + ' ' + f1(busY) + ' ' + f1(e.x) + ' ' + f1(busY + r) + 'V' + f1(e.y);
          }
        }
        it.line.setAttribute('d', d); it.glow.setAttribute('d', d);
        it.L = it.line.getTotalLength();
        maxL = Math.max(maxL, it.L);
        place(it.port, e.x, e.y); place(it.ping, e.x, e.y);
      });
      place(rootPort, x0, y0); place(rootPing, x0, y0);
      grad.setAttribute('y1', f1(y0)); grad.setAttribute('y2', f1(Math.max(y0 + 1, H)));
      var changed = geo.maxL && (Math.abs(geo.maxL - maxL) > .5 || geo.mode !== m);
      var modeSwitched = geo.mode && geo.mode !== m;
      geo = { maxL: maxL, mode: m, x0: x0, y0: y0 };
      if (modeSwitched && state === 'drawing') { finishDraw(); return; } // 그리는 중에 배치가 바뀌면(창 회전 등) 바로 끝 상태로
      paint();
      if (changed && anims.length) { stopFx(); syncLive(); } // 모양이 바뀌면 흐르는 빛을 새 선으로
    }
    var lRaf = 0;
    var relayout = function () { cancelAnimationFrame(lRaf); lRaf = requestAnimationFrame(layout); };

    // 같은 거리 D 만큼 다섯 선을 함께 그림 (줄기는 겹쳐 하나로 보임). 다 닿은 선은 dash 를 풀어 둠
    function paint() {
      items.forEach(function (it) {
        if (!it.L) return;
        var full = state === 'done' || D >= it.L;
        [it.line, it.glow].forEach(function (p) {
          if (full) { p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; }
          else { p.style.strokeDasharray = f1(it.L) + ' ' + f1(it.L + 20); p.style.strokeDashoffset = f1(it.L - Math.max(0, D)); }
        });
        if (!it.on && (full || D >= it.L - 1)) { it.on = true; it.node.classList.add('is-on'); it.port.classList.add('is-on'); }
      });
    }
    var ease = function (p) { return p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; };
    function drawTimed() {
      state = 'drawing';
      var t0 = 0, from = D, dur = clamp(geo.maxL / 0.6, 1100, 1900);
      var step = function (ts) {
        if (state !== 'drawing') return;
        if (!t0) t0 = ts;
        var p = clamp((ts - t0) / dur, 0, 1);
        D = from + (geo.maxL - from) * ease(p);
        paint();
        if (p < 1) raf = requestAnimationFrame(step); else finishDraw();
      };
      raf = requestAnimationFrame(step);
    }
    // 모바일: 화면 80% 선까지 줄기가 따라 자람 (시간 기준으로 부드럽게 쫓아감 — 프레임이 느려도 같은 속도)
    var lastT = 0;
    function chase(ts) {
      raf = 0;
      if (state !== 'drawing') return;
      var now = ts || performance.now(), dt = lastT ? Math.min(64, now - lastT) : 16;
      lastT = now;
      var cr = chart.getBoundingClientRect(), vh = window.innerHeight || 800;
      Dt = Math.max(Dt, vh * 0.8 - (cr.top + geo.y0) + 40);
      if (Dt > D + .5) { D = Math.min(Dt, D + Math.max(dt * .35, (Dt - D) * (1 - Math.exp(-dt / 140)))); paint(); }
      if (D >= geo.maxL) { finishDraw(); return; }
      if (Dt > D + .5) raf = requestAnimationFrame(chase);
      else lastT = 0;
    }
    window.addEventListener('scroll', function () { if (state === 'drawing' && geo.mode === 'tree' && !raf) raf = requestAnimationFrame(chase); }, { passive: true });

    function finishDraw() {
      cancelAnimationFrame(raf); raf = 0;
      state = 'done'; D = Infinity;
      paint();
      rootPort.classList.add('is-on');
      oc.classList.add('is-done');
      timers.push(setTimeout(syncLive, motionOff() ? 0 : 450));
    }

    // 1 + 5 숫자 굴림
    var rolls = [];
    $$('[data-oc-n]', oc).forEach(function (el, i) {
      var r = buildRoll(el, el.getAttribute('data-oc-n'), 'ab-rd', function () { return .45 + i * .2; }, true);
      rolls = rolls.concat(r);
    });
    var rollTo = function (animate) {
      oc.classList.toggle('is-rolling', !!animate);
      rolls.forEach(function (r) { r.strip.style.setProperty('--n', r.n); });
    };

    function play() {
      if (state !== 'armed') return;
      state = 'play';
      layout();
      oc.classList.add('is-play');
      rollTo(true);
      timers.push(setTimeout(function () { rootPort.classList.add('is-on'); }, 700));
      timers.push(setTimeout(function () {
        if (state !== 'play') return;
        if (geo.mode === 'tree') { state = 'drawing'; Dt = 0; chase(); }
        else drawTimed();
      }, 760));
    }
    function finishAll() { // 움직임 멈추기 · 키보드 진입: 기다리지 않고 최종 상태로
      timers.forEach(clearTimeout); timers = [];
      cancelAnimationFrame(raf); raf = 0;
      oc.classList.add('is-play');
      rollTo(false);
      if (state !== 'done') { layout(); finishDraw(); }
    }

    // 흐르는 빛 (다 그려진 뒤 · 화면에 보일 때만). 다섯 빛이 같은 속도로 줄기를 함께 내려와 갈라지고, 닿는 곳에서 파동
    function stopFx() { anims.forEach(function (a) { try { a.cancel(); } catch (e) {} }); anims = []; }
    function samples(it) {
      var n = Math.max(2, Math.ceil(it.L / 10)), pts = [], k;
      for (k = 0; k <= n; k++) { var s = it.L * k / n, p = it.line.getPointAtLength(s); pts.push({ s: s, x: p.x, y: p.y }); }
      for (k = 0; k < pts.length; k++) {
        var a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
        var ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
        pts[k].a = ang < -90 ? ang + 360 : ang; // 왼쪽(180°)이 -180° 로 뒤집혀 한 바퀴 돌지 않게
      }
      return pts;
    }
    function startFx() {
      stopFx();
      if (!fx.animate || !geo.maxL) return;
      var v = Math.max(0.3, geo.maxL / 2800); // px/ms
      var T = geo.maxL / v + 1500;           // 한 번 흐르고 잠시 쉼
      var flash = 950;
      anims.push(rootPing.animate([
        { offset: 0, opacity: .9, transform: 'scale(.5)' },
        { offset: 800 / T, opacity: 0, transform: 'scale(2.8)' },
        { offset: 1, opacity: 0, transform: 'scale(2.8)' }
      ], { duration: T, iterations: Infinity, easing: 'linear' }));
      items.forEach(function (it) {
        var kf = samples(it).map(function (p) {
          return {
            offset: (p.s / v) / T,
            opacity: Math.max(0, Math.min(1, p.s / 36, (it.L - p.s) / 26)),
            transform: 'translate3d(' + f1(p.x - CL) + 'px,' + f1(p.y - 1) + 'px,0) rotate(' + f1(p.a) + 'deg)'
          };
        });
        kf.push({ offset: 1, opacity: 0, transform: kf[kf.length - 1].transform });
        anims.push(it.comet.animate(kf, { duration: T, iterations: Infinity, easing: 'linear' }));
        var a0 = (it.L / v) / T, a1 = Math.min(.999, a0 + flash / T);
        anims.push(it.ping.animate([
          { offset: 0, opacity: 0, transform: 'scale(.5)' },
          { offset: a0, opacity: 0, transform: 'scale(.5)' },
          { offset: Math.min(a1, a0 + 110 / T), opacity: .95, transform: 'scale(.9)' },
          { offset: a1, opacity: 0, transform: 'scale(2.5)' },
          { offset: 1, opacity: 0, transform: 'scale(2.5)' }
        ], { duration: T, iterations: Infinity, easing: 'linear' }));
      });
    }
    function syncLive() {
      var live = vis && state === 'done' && !motionOff();
      oc.classList.toggle('is-live', live);
      if (motionOff()) { stopFx(); return; }
      if (live) { if (!anims.length) startFx(); else anims.forEach(function (a) { a.play(); }); }
      else anims.forEach(function (a) { a.pause(); });
    }

    // 시작 상태
    layout();
    if (!hasIO || motionOff()) finishAll();
    else oc.classList.add('is-armed');
    if ('ResizeObserver' in window) { var ro = new ResizeObserver(relayout); ro.observe(chart); ro.observe(root); }
    window.addEventListener('resize', relayout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
    window.addEventListener('load', relayout);
    if (hasIO) {
      var playIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { play(); playIO.disconnect(); } });
      }, { rootMargin: '0px 0px -24% 0px' });
      playIO.observe(root);
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { vis = en.isIntersecting; oc.classList.toggle('is-vis', vis); syncLive(); });
      }, { rootMargin: '60px 0px' }).observe(oc);
    }
    // 키보드로 들어오면 기다리지 않고 모두 보여 줌
    oc.addEventListener('focusin', function () { if (state !== 'done') finishAll(); });
    // 탭으로 '그룹 구조'가 다시 보이면 카드 위치로 선을 다시 계산 (숨어 있던 동안은 크기 0 이라 건너뜀)
    // 탭이 열렸을 때 조직도 상자가 이미 화면 안에 충분히 보이면 스크롤을 기다리지 않고 그리기 시작
    onShow.push(function (panel) {
      if (!panel.contains(oc)) return;
      layout();
      requestAnimationFrame(function () {
        layout();
        if (state === 'armed' && hasIO && !motionOff() && oc.getBoundingClientRect().top < (window.innerHeight || 800) * 0.72) play();
      });
    });
    onMotion.push(function (off) { if (off) { stopFx(); finishAll(); } syncLive(); });
  })();

  /* ---------- 연혁 숫자: 30억원+ · 105,855개+ · 10,000개+ · 100곳+ ----------
     숫자마다 0–9 띠가 한 바퀴 돌고 멈춥니다(왼쪽 숫자부터 · 칸마다 조금씩 늦게). 화면에 35% 들어오면 한 번. */
  var stats = $('[data-stats]');
  if (stats) {
    var statRolls = [];
    $$('[data-roll]', stats).forEach(function (el, si) {
      statRolls = statRolls.concat(buildRoll(el, el.getAttribute('data-roll'), 'ab-rd', function (di) { return .1 + si * .14 + di * .07; }));
    });
    var statsDone = false;
    var statsFinal = function () { statsDone = true; stats.classList.remove('is-rolled'); statRolls.forEach(function (r) { r.strip.style.setProperty('--n', r.n); }); };
    var statsRoll = function () {
      if (statsDone) return;
      if (motionOff()) { statsFinal(); return; }
      statsDone = true;
      stats.classList.add('is-rolled');
      statRolls.forEach(function (r) { r.strip.style.setProperty('--n', r.n); });
    };
    if (!hasIO || motionOff()) statsFinal();
    else {
      var statsIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { statsRoll(); statsIO.disconnect(); } });
      }, { threshold: 0.35 });
      statsIO.observe(stats);
    }
    onMotion.push(function (off) { if (off) statsFinal(); });
  }

  /* ---------- 화면 밖 무한 모션 정지 (배터리·성능) ----------
     비전 마키 띠, 지도(SMIL 빛 점 + 핀 파동)는 화면에 보일 때만 움직입니다. 움직임 멈추기면 멈춘 채로. */
  var mapSvg = $('.ab-map-svg');
  var mapFig = $('[data-map]');
  var canPauseSvg = mapSvg && typeof mapSvg.pauseAnimations === 'function';
  var mapVisible = false;
  var syncMap = function () { if (!canPauseSvg) return; if (mapVisible && !motionOff()) mapSvg.unpauseAnimations(); else mapSvg.pauseAnimations(); };
  if (hasIO) {
    var idleIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        en.target.classList.toggle('is-paused', !en.isIntersecting);
        if (en.target === mapFig) { mapVisible = en.isIntersecting; syncMap(); }
      });
    }, { rootMargin: '80px 0px' });
    [$('.ab-vision-flow'), mapFig].forEach(function (el) { if (el) { el.classList.add('is-paused'); idleIO.observe(el); } });
  }
  syncMap();
  onMotion.push(syncMap);

  /* ---------- 탭: 그룹 소개 · 비전과 철학 · 그룹 구조 · 주요 연혁 · 국내외 거점 ----------
     탭 바(role=tablist) 아래에는 선택된 패널 하나만 보입니다. 주소 #앵커(about.html#structure 등)와 이어져 있어
       · 처음 열 때: #앵커의 탭(없으면 '그룹 소개'). <head> 의 작은 스크립트가 먼저 그 패널만 보이게 해 두고 여기서 이어받습니다.
       · 탭을 누르면: 주소를 history.replaceState 로 바꿔 둠(화면은 튀지 않음 · 방문 기록은 늘지 않음).
       · 헤더 메뉴 · 본문 링크로 #앵커가 바뀌거나 뒤로/앞으로 가면(hashchange): 그 탭을 열고 탭 바가 헤더 바로 아래 오도록 맞춤.
     바뀔 때는 지금 패널이 잠깐 흐려지고(0.12초) 새 패널이 살짝 올라오며 나타납니다(0.32초). 화면 위치 이동은 내용이 흐려진 사이에
     한 번에 하므로 보이지 않습니다. 탭 바를 지나 내려가 있었을 때만 탭 바 자리로 올리고, 히어로를 보고 있었다면 그대로 둡니다.
     움직임 멈추기(html.motion-off)면 바로 바뀝니다. 키보드: ←/→ · Home/End 로 탭 사이 이동, Enter/Space 로 선택. */
  (function () {
    var bar = $('[data-ab-tabs]');
    var wrap = $('[data-ab-panels]');
    var list = bar && $('[role="tablist"]', bar);
    if (!bar || !wrap || !list) return;
    var header = $('[data-header-el]');
    var tabs = [], tabMap = {}, panels = {}, ids = [];
    $$('[role="tab"]', list).forEach(function (t) {
      var id = t.getAttribute('aria-controls'), p = id && document.getElementById(id);
      if (!p) return;
      tabs.push(t); tabMap[id] = t; panels[id] = p; ids.push(id);
    });
    if (!ids.length) return;
    var valid = function (id) { return ids.indexOf(id) >= 0; };
    var hashId = function () {
      var h = (location.hash || '').slice(1);
      try { h = decodeURIComponent(h); } catch (e) { /* 그대로 */ }
      return valid(h) ? h : '';
    };
    var cur = '', token = 0, outA = null, inA = null;

    // 탭 바 높이(앵커 위치 보정용 CSS 변수) · 검은 알약 위치
    var measureBar = function () { doc.style.setProperty('--ab-tabs-h', bar.offsetHeight + 'px'); };
    var moveInd = function (glide) {
      var t = tabMap[cur];
      if (!t || !t.offsetWidth) return;
      list.classList.toggle('is-glide', !!glide && !motionOff());
      list.style.setProperty('--ind-x', t.offsetLeft + 'px');
      list.style.setProperty('--ind-y', t.offsetTop + 'px');
      list.style.setProperty('--ind-w', t.offsetWidth + 'px');
      list.style.setProperty('--ind-h', t.offsetHeight + 'px');
      list.classList.add('is-ind');
    };
    // 탭 바가 가로로 넘칠 때(모바일) 선택된 탭이 가운데쯤 보이도록 탭 바만 옆으로 밉니다
    var revealTab = function (t, smooth) {
      var max = list.scrollWidth - list.clientWidth;
      if (!t || max <= 1) return;
      var left = clamp(t.offsetLeft - (list.clientWidth - t.offsetWidth) / 2, 0, max);
      if (Math.abs(left - list.scrollLeft) < 2) return;
      try { list.scrollTo({ left: left, behavior: smooth && !motionOff() ? 'smooth' : 'auto' }); } catch (e) { list.scrollLeft = left; }
    };
    var setTabs = function (id) {
      tabs.forEach(function (t) {
        var on = t.getAttribute('aria-controls') === id;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
      });
    };

    // 탭 바가 헤더 바로 아래 붙는 스크롤 위치 (탭 바는 sticky 라 패널 묶음의 위치로 계산).
    // 헤더가 스크롤로 숨어 있던 중이면(탭 바가 화면 맨 위) 그 상태 그대로 탭 바를 맨 위에 둡니다 —
    // 헤더를 억지로 꺼내면 마우스 아래로 내려온 헤더 메뉴가 열려 버리기 때문.
    var hdHidden = function () { return !!(header && header.classList.contains('is-hidden')); };
    var barY = function (hide) {
      var hh = header && !hide ? header.offsetHeight : 0;
      return Math.max(0, Math.round(wrap.getBoundingClientRect().top + window.scrollY - bar.offsetHeight - hh));
    };
    // 이 스크립트가 옮긴 스크롤 직후에는 헤더 상태를 유지합니다(site.js 는 크게 움직이면 헤더를 숨기거나 꺼냄)
    var keepHd = 0, keepHide = false;
    window.addEventListener('scroll', function () {
      if (!keepHd || !header) return;
      if (Date.now() > keepHd) { keepHd = 0; return; }
      header.classList.toggle('is-hidden', keepHide);
    }, { passive: true });
    var jump = function (y, smooth, hide) {
      if (Math.abs(window.scrollY - y) < 2) return;
      keepHd = Date.now() + (smooth && !motionOff() ? 1000 : 260); keepHide = !!hide;
      if (smooth && !motionOff()) { try { window.scrollTo({ top: y, behavior: 'smooth' }); return; } catch (e) { /* 아래로 */ } }
      var sb = doc.style.scrollBehavior;
      doc.style.scrollBehavior = 'auto'; // base.css 의 html { scroll-behavior: smooth } 를 잠시 끄고 한 번에
      window.scrollTo(0, y);
      doc.style.scrollBehavior = sb;
    };
    // mode: 'always' = 탭 바 자리로(헤더 메뉴 · #앵커 — 헤더를 보이게) · 'past' = 탭 바를 지나 내려가 있을 때만(히어로를 보던 중이면 그대로)
    var place = function (mode, smooth) {
      if (!mode) return;
      var hide = mode === 'past' && hdHidden();
      var y = barY(hide);
      if (mode === 'always' || window.scrollY > y + 2) jump(y, smooth, hide);
    };

    function show(id, o) {
      o = o || {};
      if (!valid(id)) return;
      var to = panels[id];
      var same = id === cur && !to.hidden;
      cur = id;
      setTabs(id);
      moveInd(!o.instant);
      revealTab(tabMap[id], !o.instant);
      if (o.hash && location.hash !== '#' + id) { try { history.replaceState(history.state, '', '#' + id); } catch (e) { /* file:// 등 */ } }
      if (same) { if (outA) { outA.cancel(); outA = null; } place(o.scroll, true); return; }
      var t = ++token;
      var animate = !o.instant && !motionOff() && typeof to.animate === 'function';
      var from = ids.map(function (k) { return panels[k]; }).filter(function (p) { return p !== to && !p.hidden; })[0];
      var reveal = function () {
        if (t !== token) return;
        ids.forEach(function (k) { panels[k].hidden = panels[k] !== to; });
        if (outA) { outA.cancel(); outA = null; }
        if (inA) { inA.cancel(); inA = null; }
        place(o.scroll, false); // 내용이 흐려진 사이에 한 번에 옮김
        onShow.forEach(function (fn) { try { fn(to); } catch (e) { /* 한 모듈 오류가 탭 전환을 막지 않게 */ } });
        update();
        if (o.focus) { try { to.focus({ preventScroll: true }); } catch (e) { to.focus(); } }
        if (animate && !motionOff()) {
          inA = to.animate([{ opacity: 0, transform: 'translate3d(0, 18px, 0)' }, { opacity: 1, transform: 'none' }],
            { duration: 320, easing: 'cubic-bezier(.2, .7, .2, 1)' });
          inA.onfinish = function () { inA = null; };
        }
      };
      // 이미 흐려지는 중이면 그 끝에 새 패널을 보여 주도록만 바꿈 (빠르게 여러 번 눌러도 깜빡이지 않게)
      if (outA && from && outA.effect && outA.effect.target === from) { outA.onfinish = reveal; return; }
      if (outA) { outA.cancel(); outA = null; }
      if (animate && from) {
        outA = from.animate([{ opacity: 0 }], { duration: 120, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' });
        outA.onfinish = reveal;
      } else reveal();
    }

    // 클릭(Enter 도 링크 클릭으로 들어옴) · 새 탭으로 열기(⌘/Ctrl/Shift/가운데 버튼)는 브라우저에 맡김
    tabs.forEach(function (t) {
      t.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0) return;
        e.preventDefault();
        show(t.getAttribute('aria-controls'), { hash: true, scroll: 'past' });
      });
    });
    list.addEventListener('keydown', function (e) {
      var i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      var n = null;
      if (e.key === 'ArrowRight') n = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') n = tabs[0];
      else if (e.key === 'End') n = tabs[tabs.length - 1];
      else if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); tabs[i].click(); return; }
      if (!n) return;
      e.preventDefault();
      // 화살표는 포커스만 옮기는 방식(선택은 Enter/Space) — 탭 사이를 오가는 동안 패널·화면이 바뀌지 않도록
      tabs.forEach(function (x) { x.tabIndex = x === n ? 0 : -1; });
      try { n.focus({ preventScroll: true }); } catch (err) { n.focus(); }
      revealTab(n, true);
    });
    // 포커스가 탭 바를 떠나면 Tab 순서는 다시 선택된 탭부터
    list.addEventListener('focusout', function (e) {
      if (e.relatedTarget && list.contains(e.relatedTarget)) return;
      tabs.forEach(function (x) { x.tabIndex = x.getAttribute('aria-selected') === 'true' ? 0 : -1; });
    });

    // 헤더 메뉴 · 본문 링크(about.html#structure, #structure) · 뒤로/앞으로
    window.addEventListener('hashchange', function () {
      var id = hashId();
      if (!id) { if (!location.hash) show(ids[0], { scroll: 'past' }); return; } // #main 같은 다른 앵커는 그대로
      var a = document.activeElement;
      var focus = !!(a && a !== document.body && ((header && header.contains(a)) || (cur && panels[cur].contains(a))));
      show(id, { scroll: 'always', focus: focus });
    });

    // 시작: <head> 스크립트가 정한 패널을 hidden 속성으로 이어받음
    var first = hashId() || ids[0];
    cur = first;
    ids.forEach(function (k) { panels[k].hidden = k !== first; });
    setTabs(first);
    doc.classList.add('ab-tabs-ready');
    measureBar();
    moveInd(false);
    revealTab(tabMap[first], false);
    var relayoutBar = function () { measureBar(); moveInd(false); };
    if ('ResizeObserver' in window) new ResizeObserver(relayoutBar).observe(list);
    window.addEventListener('resize', relayoutBar);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayoutBar);

    // #앵커로 들어왔으면 탭 바가 헤더 바로 아래 오도록 (글꼴 · 이미지가 늦게 자리를 잡아도 사용자가 움직이기 전이면 다시 맞춤)
    if (hashId()) {
      var touched = false;
      ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(function (ev) {
        window.addEventListener(ev, function () { touched = true; }, { once: true, passive: true, capture: true });
      });
      place('always', false);
      var settle = function () { if (!touched) { measureBar(); place('always', false); } };
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(settle);
      window.addEventListener('load', function () { settle(); requestAnimationFrame(settle); setTimeout(settle, 120); });
    }
    requestAnimationFrame(function () { onShow.forEach(function (fn) { try { fn(panels[first]); } catch (e) { /* 계속 */ } }); });
  })();
})();
