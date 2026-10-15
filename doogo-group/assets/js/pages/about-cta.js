/* =========================================================
   DOOGO GROUP — about-cta.js
   두고그룹(about.html) 탭별 마무리 배너 (모양은 about-cta.css)
   · 탭 패널(.ab-panel)의 hidden 속성은 about.js 가 바꿉니다. 그 변화를 MutationObserver 로 지켜보고,
     같은 이름의 배너(data-acx-tab="intro|vision|structure|history|locations") 하나만 보이게 합니다(나머지는 hidden).
     about.js 가 준비되지 않았으면 <head> 스크립트가 정한 html[data-ab-tab] 을 따릅니다.
   · 등장: 배너 안 [data-acx-g] 묶음이 화면에 들어오면 .is-in. 탭이 바뀌면 새 배너의 .is-in 을 지우고 다시 관찰해
     등장 모션을 처음부터 재생합니다(화면에 보이는 중이면 배너 전체도 살짝 흐렸다 나타남).
   · 움직임 멈추기(html.motion-off · window.DOOGO.motionOff() · 'doogo:motion')면 바로 최종 상태.
   · 국내외 거점 배너: 세종 · 오클랜드 현지 시각(그 배너가 보일 때만 갱신)
   · 주요 연혁 배너: 연혁의 마지막 해 + 1 을 '다음 해' 숫자로
   ========================================================= */
(function () {
  'use strict';
  var doc = document.documentElement;
  var root = document.querySelector('[data-acx]');
  if (!root) return;
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };
  var motionOff = function () {
    return window.DOOGO && typeof window.DOOGO.motionOff === 'function' ? window.DOOGO.motionOff() : doc.classList.contains('motion-off');
  };

  var bands = {}, ids = [];
  each(root.querySelectorAll('[data-acx-tab]'), function (b) {
    var id = b.getAttribute('data-acx-tab');
    bands[id] = b; ids.push(id);
  });
  if (!ids.length) return;
  var panels = Array.prototype.slice.call(document.querySelectorAll('.ab-panel[role="tabpanel"]'));

  // 지금 열린 탭: about.js 가 준비됐으면 숨겨지지 않은 패널, 아니면 <head> 스크립트가 정한 값
  var activeId = function () {
    if (doc.classList.contains('ab-tabs-ready')) {
      for (var i = 0; i < panels.length; i++) { if (!panels[i].hidden && bands[panels[i].id]) return panels[i].id; }
    }
    var t = doc.getAttribute('data-ab-tab');
    return bands[t] ? t : ids[0];
  };

  /* ---------- 등장 ---------- */
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      io.unobserve(en.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }) : null;

  var groups = function (b) { return b.querySelectorAll('[data-acx-g]'); };
  var arm = function (b, replay) {
    each(groups(b), function (g) {
      if (io) io.unobserve(g);
      if (!io || motionOff()) { g.classList.add('is-in'); return; }
      if (replay) g.classList.remove('is-in');
      if (!g.classList.contains('is-in')) io.observe(g);
    });
  };
  var disarm = function (b) { if (io) each(groups(b), function (g) { io.unobserve(g); }); };
  var inView = function (el) {
    var r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < (window.innerHeight || doc.clientHeight);
  };

  /* ---------- 현지 시각 (국내외 거점) ---------- */
  var clocks = root.querySelectorAll('[data-acx-clock]');
  var fmts = {}, clockTimer = 0;
  var tick = function () {
    var now = new Date();
    each(clocks, function (el) {
      var tz = el.getAttribute('data-acx-clock'), out = el.querySelector('[data-acx-time]');
      try {
        fmts[tz] = fmts[tz] || new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
        if (out) out.textContent = fmts[tz].format(now);
        el.hidden = false;
      } catch (e) { el.hidden = true; }
    });
  };
  var startClock = function () { if (!clocks.length || clockTimer) return; tick(); clockTimer = window.setInterval(tick, 20000); };
  var stopClock = function () { if (clockTimer) { window.clearInterval(clockTimer); clockTimer = 0; } };
  document.addEventListener('visibilitychange', function () {
    if (cur !== 'locations') return;
    if (document.hidden) stopClock(); else startClock();
  });

  /* ---------- 다음 해 (주요 연혁) ---------- */
  (function () {
    var el = root.querySelector('[data-acx-next]');
    if (!el) return;
    var max = 0;
    each(document.querySelectorAll('#history time[datetime]'), function (t) {
      var y = parseInt((t.getAttribute('datetime') || '').slice(0, 4), 10);
      if (y > max) max = y;
    });
    if (max > 2000) el.textContent = String(max + 1);
  })();

  /* ---------- 배너 바꾸기 ---------- */
  var cur = '';
  var show = function (id, first) {
    if (!bands[id] || id === cur) return;
    var prev = bands[cur], next = bands[id];
    cur = id;
    ids.forEach(function (k) { bands[k].hidden = k !== id; });
    if (prev) disarm(prev);
    arm(next, !first);
    if (!first && !motionOff() && typeof next.animate === 'function' && inView(next)) {
      next.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, easing: 'cubic-bezier(.2, .7, .2, 1)' });
    }
    if (id === 'locations') startClock(); else stopClock();
  };

  // 처음 한 번은 전환 없이 '등장 전' 상태로 바로 (스크립트 전에 보이던 배너가 지연 시간 동안 남아 있다가 사라지지 않게)
  doc.classList.add('acx-on', 'acx-instant');
  show(activeId(), true);
  void root.offsetHeight;
  var settle = function () { doc.classList.remove('acx-instant'); };
  if (window.requestAnimationFrame) window.requestAnimationFrame(function () { window.requestAnimationFrame(settle); });
  else setTimeout(settle, 50);

  // 탭 전환(about.js 가 패널의 hidden 을 바꿈) · <head> 값이 바뀌는 경우
  if ('MutationObserver' in window) {
    var mo = new MutationObserver(function () { show(activeId()); });
    panels.forEach(function (p) { mo.observe(p, { attributes: true, attributeFilter: ['hidden'] }); });
    mo.observe(doc, { attributes: true, attributeFilter: ['data-ab-tab'] });
  } else {
    window.addEventListener('hashchange', function () { setTimeout(function () { show(activeId()); }, 200); });
    each(document.querySelectorAll('[role="tab"]'), function (t) {
      t.addEventListener('click', function () { setTimeout(function () { show(activeId()); }, 200); });
    });
  }

  // 움직임 멈추기를 켜면 모든 배너를 최종 상태로
  document.addEventListener('doogo:motion', function (e) {
    var off = e && e.detail && typeof e.detail.off === 'boolean' ? e.detail.off : motionOff();
    if (!off) return;
    each(root.querySelectorAll('[data-acx-g]'), function (g) { if (io) io.unobserve(g); g.classList.add('is-in'); });
  });
})();
