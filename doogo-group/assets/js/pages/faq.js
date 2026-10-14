/* =========================================================
   DOOGO GROUP — faq.js (자주 묻는 질문)
   분류 탭(roving tabindex · 방향키) · 검색 · 아코디언(aria-expanded) · 모두 펼치기/접기
   · URL 동기화(#q-… 질문 열기, #cat-… 분류, ?cat= ?q=) · 질문 링크 복사
   ========================================================= */
(function () {
  'use strict';
  /* 움직임 정책: OS 설정과 관계없이 열고 닫힘·목록 모션과 부드러운 스크롤을 쓰고,
     사용자가 '움직임 멈추기'를 고른 경우(html.motion-off)에만 바로 바꿉니다 */
  function still() { return !!(window.DOOGO && window.DOOGO.motionOff && window.DOOGO.motionOff()); }
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  var CATS = ['all', 'group', 'service', 'partner', 'privacy'];
  var INFO = {
    all:     { k: 'All Questions', t: '전체 질문', d: '그룹 구성부터 서비스 이용, 제휴, 개인정보까지 자주 받는 질문을 모았습니다.' },
    group:   { k: 'Group', t: '그룹', d: '두고그룹의 구성과 리더, 채용 소식을 안내합니다.' },
    service: { k: 'Business', t: '사업·서비스', d: '각 사업의 서비스와 사이트, 이용 방법을 안내합니다.' },
    partner: { k: 'Partnership', t: '제휴·입점', d: '그룹 제휴와 입점, 사업 협업 문의 방법을 안내합니다.' },
    privacy: { k: 'Site & Privacy', t: '사이트·개인정보', d: '문의 방법과 개인정보 처리 기준을 안내합니다.' }
  };

  var tablist = $('.fq-tabs');
  var tabs = $$('.fq-tab');
  var ind = $('.fq-tab-ind');
  var panel = $('#fq-panel');
  var groups = $$('.fq-group');
  var items = $$('.fq-item');
  var toolbar = $('.fq-toolbar');
  var header = $('[data-header-el]');
  var form = $('.fq-search');
  var input = $('#fq-q');
  var clearBtn = $('.fq-search-clear');
  var empty = $('#fq-empty');
  var result = $('#fq-result');
  var side = $('.fq-side-in');
  if (!tablist || !panel || !items.length) return;

  var state = { cat: 'all', q: '' };

  /* ---------- 질문 데이터 준비 ---------- */
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  items.forEach(function (it) {
    var t = $('.fq-t', it);
    it._btn = $('.fq-q', it);
    it._t = t;
    it._title = t ? t.textContent : '';
    it._text = norm(it._title + ' ' + ($('.fq-in', it) || it).textContent);
    it._textNs = it._text.replace(/\s/g, '');
  });

  /* 분류별 질문 수 (마크업의 숫자를 실제 개수로 맞춤) */
  function countOf(cat) { return items.filter(function (it) { return cat === 'all' || it.getAttribute('data-cat') === cat; }).length; }
  CATS.forEach(function (c) {
    $$('[data-tab-count="' + c + '"], [data-cat-count="' + c + '"]').forEach(function (el) { el.textContent = countOf(c); });
  });

  /* ---------- 질문 링크 복사 버튼 (각 답변 아래) ---------- */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? resolve() : reject(); } catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }
  function toast(msg) { if (window.DOOGO && window.DOOGO.toast) window.DOOGO.toast(msg); }
  items.forEach(function (it) {
    var inner = $('.fq-in', it);
    if (!inner) return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'fq-copy';
    // 버튼 이름에 질문 제목을 덧붙여(화면에는 안 보임) 버튼 목록에서 서로 구분되게 합니다
    b.innerHTML = '<svg aria-hidden="true"><use href="#fq-i-link"/></svg><span>이 질문 링크 복사</span><span class="sr-only">: ' + esc(it._title) + '</span>';
    b.addEventListener('click', function () {
      var url = location.href.split('#')[0].split('?')[0] + '#' + it.id;
      copyText(url).then(function () {
        b.classList.add('is-done'); $('span', b).textContent = '링크를 복사했습니다';
        toast('질문 링크를 복사했습니다.');
        setTimeout(function () { b.classList.remove('is-done'); $('span', b).textContent = '이 질문 링크 복사'; }, 2200);
      }, function () { toast('링크를 복사하지 못했습니다. 주소창의 링크를 이용해 주세요.'); });
    });
    var foot = document.createElement('div');
    foot.className = 'fq-foot';
    foot.appendChild(b);
    inner.appendChild(foot);
  });

  /* ---------- 주소 동기화 ---------- */
  function syncUrl(hash) {
    try {
      var u = new URL(window.location.href);
      if (state.cat === 'all') u.searchParams.delete('cat'); else u.searchParams.set('cat', state.cat);
      if (state.q.trim()) u.searchParams.set('q', state.q.trim()); else u.searchParams.delete('q');
      history.replaceState(history.state, '', u.pathname + u.search + (hash ? '#' + hash : ''));
    } catch (e) { /* file:// 등에서는 무시 */ }
  }
  function currentHash() { return decodeURIComponent((window.location.hash || '').slice(1)); }

  /* ---------- 탭 표시 ---------- */
  function moveInd(instant) {
    if (!ind) return;
    var sel = tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0];
    if (!sel) return;
    if (instant || still()) ind.style.transition = 'none';
    ind.style.setProperty('--x', sel.offsetLeft + 'px');
    ind.style.setProperty('--w', sel.offsetWidth + 'px');
    if (instant || still()) { void ind.offsetWidth; ind.style.transition = ''; }
  }
  function keepTabVisible(t) {
    var l = t.offsetLeft, r = l + t.offsetWidth;
    if (l < tablist.scrollLeft) tablist.scrollLeft = Math.max(0, l - 16);
    else if (r > tablist.scrollLeft + tablist.clientWidth) tablist.scrollLeft = r - tablist.clientWidth + 16;
    updateTabsEdge();
  }
  function updateTabsEdge() {
    var max = tablist.scrollWidth - tablist.clientWidth;
    tablist.classList.toggle('is-end', max <= 2 || tablist.scrollLeft >= max - 2);
  }
  tablist.addEventListener('scroll', updateTabsEdge, { passive: true });

  /* ---------- 왼쪽 안내(현재 분류) ---------- */
  function syncSide(n, instant) {
    if (!side) return;
    var info = INFO[state.cat];
    var apply = function () {
      $('#fq-side-k').textContent = info.k;
      $('#fq-side-t').textContent = info.t;
      $('#fq-side-d').textContent = state.q.trim() ? '‘' + state.q.trim() + '’ 검색 결과입니다.' : info.d;
      $('#fq-side-n').textContent = n;
    };
    if (instant || still()) { apply(); return; }
    side.classList.add('is-swap');
    setTimeout(function () { apply(); side.classList.remove('is-swap'); }, 180);
  }

  /* ---------- 목록 그리기 ---------- */
  function highlight(it, q) {
    var t = it._t, raw = it._title;
    if (!t) return;
    var i = q ? raw.toLowerCase().indexOf(q) : -1;
    if (i < 0) { t.textContent = raw; return; }
    t.innerHTML = esc(raw.slice(0, i)) + '<mark>' + esc(raw.slice(i, i + q.length)) + '</mark>' + esc(raw.slice(i + q.length));
  }
  function render(opts) {
    opts = opts || {};
    var q = norm(state.q);
    var qNs = q.replace(/\s/g, '');
    var shown = [];
    items.forEach(function (it) {
      var okCat = state.cat === 'all' || it.getAttribute('data-cat') === state.cat;
      var okQ = !q || it._text.indexOf(q) > -1 || it._textNs.indexOf(qNs) > -1;
      var show = okCat && okQ;
      var was = it.hidden;
      it.hidden = !show;
      highlight(it, q);
      if (show) {
        shown.push(it);
        if (!still() && !opts.instant && (opts.restagger || was)) {
          it.classList.remove('is-entering'); void it.offsetWidth;
          it.style.setProperty('--stagger', Math.min(shown.length - 1, 8) * 0.045 + 's');
          it.classList.add('is-entering');
        }
      }
    });
    groups.forEach(function (g) { g.hidden = !items.some(function (it) { return !it.hidden && g.contains(it); }); });
    if (empty) empty.hidden = shown.length > 0;
    if (result) {
      result.classList.toggle('is-quiet', !q);
      var n = '<strong>' + shown.length + '</strong>개';
      result.innerHTML = q
        ? '‘' + esc(state.q.trim()) + '’ 검색 결과 ' + n + (state.cat !== 'all' ? ' · ' + INFO[state.cat].t : '')
        : INFO[state.cat].t + ' ' + n + ' 질문';
    }
    syncSide(shown.length, opts.instant);
    return shown;
  }
  items.forEach(function (it) { it.addEventListener('animationend', function () { it.classList.remove('is-entering'); }); });

  /* 툴바가 붙은 상태에서 분류를 바꾸면 목록 맨 위로 */
  function boardTop() {
    var headH = header ? header.offsetHeight : 0;
    var tb = toolbar && getComputedStyle(toolbar).position === 'sticky' ? toolbar.offsetHeight : 0;
    return panel.getBoundingClientRect().top + window.scrollY - headH - tb - 24;
  }
  function keepBoardInView(force) {
    var target = boardTop();
    if (!force && window.scrollY <= target + 4) return; // 목록 시작이 이미 보임
    window.scrollTo({ top: Math.max(0, target), behavior: still() ? 'auto' : 'smooth' });
  }

  /* ---------- 분류 탭 ---------- */
  function selectTab(cat, o) {
    o = o || {};
    if (CATS.indexOf(cat) < 0) cat = 'all';
    state.cat = cat;
    tabs.forEach(function (t) {
      var on = t.getAttribute('data-cat') === cat;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on) { panel.setAttribute('aria-labelledby', t.id); keepTabVisible(t); }
    });
    moveInd(o.instant);
    render({ restagger: true, instant: o.instant });
    if (o.scroll) keepBoardInView(o.force);
    if (o.url !== false) syncUrl(o.hash || '');
  }
  tabs.forEach(function (t) {
    t.addEventListener('click', function () { selectTab(t.getAttribute('data-cat'), { scroll: true }); });
  });
  tablist.addEventListener('keydown', function (e) {
    var i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    var next = null;
    if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
    else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
    else if (e.key === 'Home') next = tabs[0];
    else if (e.key === 'End') next = tabs[tabs.length - 1];
    if (!next) return;
    e.preventDefault();
    next.focus({ preventScroll: true });
    selectTab(next.getAttribute('data-cat'), { scroll: true });
  });

  // 히어로의 분류 바로가기
  $$('[data-cat-link]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var c = a.getAttribute('data-cat-link');
      selectTab(c, { scroll: true, force: true, hash: 'cat-' + c });
      var t = tabs.filter(function (x) { return x.getAttribute('data-cat') === c; })[0];
      if (t) setTimeout(function () { t.focus({ preventScroll: true }); }, still() ? 0 : 500);
    });
  });

  /* ---------- 검색 ---------- */
  function toggleClear() { if (clearBtn) clearBtn.hidden = !input.value; }
  function resetQuery() { if (input) input.value = ''; state.q = ''; toggleClear(); }
  var qTimer = 0;
  /* 목록을 내려 본 상태에서 (붙어 있는) 검색창에 입력하면 결과가 줄어 화면 위로 빠져나가므로,
     입력 중에는 목록 시작으로 바로 옮깁니다. 이때 위로 움직였다고 숨은 헤더가 다시 내려와
     검색창을 가리거나 메뉴가 열리지 않도록 헤더는 숨긴 채로 둡니다. */
  var holdHeader = false, holdTimer = 0;
  function holdHeaderHidden() {
    if (!header || !header.classList.contains('is-hidden')) return;
    holdHeader = true;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(function () { holdHeader = false; }, 200);
  }
  window.addEventListener('scroll', function () { if (holdHeader) header.classList.add('is-hidden'); }, { passive: true });
  function followResults() {
    var target = boardTop();
    if (window.scrollY <= target + 4) return; // 목록 시작이 이미 보임
    holdHeaderHidden();
    // html 의 scroll-behavior: smooth 를 잠시 끄고 즉시 이동(입력 중 화면이 미끄러지지 않게)
    var de = document.documentElement, prev = de.style.scrollBehavior;
    de.style.scrollBehavior = 'auto';
    window.scrollTo(0, Math.max(0, target));
    de.style.scrollBehavior = prev;
  }
  if (form) form.addEventListener('submit', function (e) { e.preventDefault(); input.blur(); keepBoardInView(); });
  if (input) {
    input.addEventListener('input', function () {
      holdHeaderHidden(); // 목록이 줄어 브라우저가 스크롤을 끌어올리는 경우도 포함
      state.q = input.value; toggleClear(); render();
      followResults();
      clearTimeout(qTimer); qTimer = setTimeout(function () { syncUrl(''); }, 400);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && input.value) { e.preventDefault(); resetQuery(); render(); syncUrl(''); }
    });
  }
  if (clearBtn) clearBtn.addEventListener('click', function () { resetQuery(); render(); syncUrl(''); input.focus({ preventScroll: true }); });
  var resetBtn = $('[data-reset]', empty || document);
  if (resetBtn) resetBtn.addEventListener('click', function () {
    resetQuery(); selectTab('all', { scroll: true });
    tabs[0].focus({ preventScroll: true });
  });

  /* ---------- 아코디언 ---------- */
  function setOpen(it, open, instant) {
    if (instant || still()) {
      it.classList.add('is-instant');
      requestAnimationFrame(function () { requestAnimationFrame(function () { it.classList.remove('is-instant'); }); });
    }
    it.classList.toggle('is-open', open);
    if (it._btn) it._btn.setAttribute('aria-expanded', String(open));
  }
  items.forEach(function (it) {
    if (!it._btn) return;
    it._btn.addEventListener('click', function () {
      var open = !it.classList.contains('is-open');
      setOpen(it, open);
      if (open) syncUrl(it.id);
      else if (currentHash() === it.id) syncUrl('');
    });
  });
  // 질문 버튼 사이 이동: ↑ ↓ Home End (보이는 질문만)
  panel.addEventListener('keydown', function (e) {
    var btn = e.target.closest && e.target.closest('.fq-q');
    if (!btn) return;
    var list = items.filter(function (it) { return !it.hidden; }).map(function (it) { return it._btn; });
    var i = list.indexOf(btn);
    if (i < 0) return;
    var next = null;
    if (e.key === 'ArrowDown') next = list[Math.min(list.length - 1, i + 1)];
    else if (e.key === 'ArrowUp') next = list[Math.max(0, i - 1)];
    else if (e.key === 'Home') next = list[0];
    else if (e.key === 'End') next = list[list.length - 1];
    if (!next) return;
    e.preventDefault();
    next.focus();
  });

  // 모두 펼치기 / 접기 (보이는 질문만)
  $$('[data-expand]').forEach(function (b) {
    b.addEventListener('click', function () {
      var open = b.getAttribute('data-expand') === 'open';
      items.forEach(function (it) { if (!it.hidden) setOpen(it, open); });
      if (!open) syncUrl('');
    });
  });

  /* ---------- 주소로 질문 열기 (#q-…) · 분류 (#cat-…) ---------- */
  function scrollToItem(it, smooth) {
    var headH = header ? header.offsetHeight : 0;
    var tb = toolbar && getComputedStyle(toolbar).position === 'sticky' ? toolbar.offsetHeight : 0;
    var top = it.getBoundingClientRect().top + window.scrollY - headH - tb - 16;
    window.scrollTo({ top: Math.max(0, top), behavior: smooth && !still() ? 'smooth' : 'auto' });
  }
  function openFromHash(fromLoad) {
    var h = currentHash();
    if (!h) return;
    var el = document.getElementById(h);
    if (el && el.classList.contains('fq-item')) {
      // 지금 분류에서 숨은 질문이면 '전체'로 바꾸고 주소의 ?cat=·?q= 도 지워 탭과 맞춥니다(#q-… 는 유지)
      if (el.hidden) { resetQuery(); selectTab('all', { instant: true, url: false }); syncUrl(h); }
      setOpen(el, true, fromLoad);
      // 글꼴·레이아웃이 자리 잡은 뒤 위치를 맞춥니다
      setTimeout(function () { scrollToItem(el, !fromLoad); try { el._btn.focus({ preventScroll: true }); } catch (e) {} }, fromLoad ? 120 : 0);
      return;
    }
    var m = /^cat-(\w+)$/.exec(h);
    if (m && CATS.indexOf(m[1]) > -1) {
      resetQuery();
      selectTab(m[1], { instant: !!fromLoad, url: false });
      setTimeout(function () { keepBoardInView(true); }, fromLoad ? 120 : 0);
    }
  }
  window.addEventListener('hashchange', function () { openFromHash(false); });

  /* ---------- 툴바 붙음 표시 · 크기 변화 ---------- */
  var ticking = false;
  function onScroll() {
    ticking = false;
    if (!toolbar) return;
    var top = parseFloat(getComputedStyle(toolbar).top) || 0;
    toolbar.classList.toggle('is-stuck', toolbar.getBoundingClientRect().top <= top + 1 && window.scrollY > 200);
  }
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  window.addEventListener('resize', function () { moveInd(true); updateTabsEdge(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { moveInd(true); updateTabsEdge(); });

  /* ---------- 처음 상태 ---------- */
  var params = new URLSearchParams(window.location.search);
  var q0 = params.get('q');
  if (q0 && input) { input.value = q0; state.q = q0; toggleClear(); }
  var rawCat = params.get('cat');
  // 첫 화면에서는 주소의 #해시를 지우지 않습니다(아래에서 질문을 엽니다)
  selectTab(rawCat || 'all', { instant: true, url: false });
  if (rawCat !== null && CATS.indexOf(rawCat) < 0) syncUrl(currentHash());
  updateTabsEdge();
  // 화면 크기 때문에 숨겨진 등장 요소(히어로 분류 바로가기)는 등장 처리만 해 둡니다
  $$('[data-reveal]').forEach(function (el) { if (el.offsetParent === null && getComputedStyle(el).display === 'none') el.classList.add('is-in'); });
  openFromHash(true);
})();
