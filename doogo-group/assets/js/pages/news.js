/* =========================================================
   DOOGO GROUP — news.js (그룹소식)
   분류 탭(URL ?cat= 동기화) · 제목 검색 · 아코디언 본문 · 피처 기사 · 결과 없음 상태
   ========================================================= */
(function () {
  'use strict';
  /* 움직임 정책: OS 설정과 관계없이 탭·목록 모션과 부드러운 스크롤을 쓰고,
     사용자가 '움직임 멈추기'를 고른 경우(html.motion-off)에만 바로 바꿉니다 */
  function still() { return !!(window.DOOGO && window.DOOGO.motionOff && window.DOOGO.motionOff()); }
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  var CATS = ['all', 'notice', 'business', 'campus', 'recruit'];
  var LABEL = { all: '전체 소식', notice: '공지', business: '사업 소식', campus: '교육 현장', recruit: '채용 소식' };

  var tablist = $('.nw-tabs');
  var tabs = $$('.nw-tab');
  var ind = $('.nw-tab-ind');
  var panel = $('#nw-panel');
  var items = $$('.nw-item');
  var featWrap = $('#nw-feature-wrap');
  var form = $('.nw-search');
  var input = $('#nw-q');
  var clearBtn = $('.nw-search-clear');
  var empty = $('#nw-empty');
  var result = $('#nw-result');
  var pager = $('#nw-pager');
  var toolbar = $('.nw-toolbar');
  var header = $('[data-header-el]');
  if (!tablist || !panel || !items.length) return;

  var state = { cat: 'all', q: '' };

  // 제목 원문 보관 (검색어 강조 후 되돌리기용)
  items.forEach(function (li) { var t = $('.nw-title-t', li); li._title = t ? t.textContent : ''; });

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  /* ---------- 탭 선택 표시 ---------- */
  function moveInd(instant) {
    if (!ind) return;
    var sel = tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0];
    if (!sel) return;
    if (instant) ind.style.transition = 'none';
    ind.style.setProperty('--x', sel.offsetLeft + 'px');
    ind.style.setProperty('--w', sel.offsetWidth + 'px');
    if (instant) { void ind.offsetWidth; ind.style.transition = ''; }
  }
  function keepTabVisible(t) {
    var l = t.offsetLeft, r = l + t.offsetWidth;
    if (l < tablist.scrollLeft) tablist.scrollLeft = Math.max(0, l - 16);
    else if (r > tablist.scrollLeft + tablist.clientWidth) tablist.scrollLeft = r - tablist.clientWidth + 16;
    updateTabsEdge();
  }
  // 모바일: 탭 줄이 더 이어지면 오른쪽 끝을 흐리게 (끝까지 밀면 사라짐)
  function updateTabsEdge() {
    var max = tablist.scrollWidth - tablist.clientWidth;
    tablist.classList.toggle('is-end', max <= 2 || tablist.scrollLeft >= max - 2);
  }
  tablist.addEventListener('scroll', updateTabsEdge, { passive: true });

  /* ---------- 피처 기사 (전체 분류 + 검색어 없음일 때만) ----------
     감쌈 요소의 grid-template-rows 1fr ↔ 0fr 로 높이가 부드럽게 접히고 펼쳐집니다. */
  function setFeature(show, instant) {
    if (!featWrap) return;
    var off = !show;
    if (featWrap.classList.contains('is-off') === off) return;
    if (instant || still()) {
      featWrap.classList.add('is-instant');
      featWrap.classList.toggle('is-off', off);
      void featWrap.offsetHeight;
      featWrap.classList.remove('is-instant');
    } else {
      featWrap.classList.toggle('is-off', off);
    }
  }

  /* ---------- 툴바가 붙은 상태에서 바꾸면 목록 맨 위로 ----------
     게시판 시작점(피처 감쌈 요소의 위쪽 끝)은 피처가 접혀도 문서 안 위치가 변하지 않으므로,
     접힘 애니메이션과 동시에 스크롤해도 목표가 흔들리지 않습니다. */
  function keepBoardInView() {
    if (!toolbar || getComputedStyle(toolbar).position !== 'sticky') return;
    var anchor = featWrap || result || panel;
    var aTop = anchor.getBoundingClientRect().top;
    if (aTop >= toolbar.getBoundingClientRect().bottom - 1) return; // 목록 시작이 이미 보임
    // 위로 올라가면 공통 헤더가 다시 나타나므로(site.js) 헤더 높이까지 비워 둡니다.
    var headH = header ? header.offsetHeight : 0;
    var target = aTop + window.scrollY - headH - toolbar.offsetHeight - 24;
    window.scrollTo({ top: Math.max(0, target), behavior: still() ? 'auto' : 'smooth' });
  }

  /* ---------- 목록 그리기 ---------- */
  function highlight(li, q) {
    var t = $('.nw-title-t', li), raw = li._title;
    if (!t) return;
    var i = q ? raw.toLowerCase().indexOf(q) : -1;
    if (i < 0) { t.textContent = raw; return; }
    t.innerHTML = esc(raw.slice(0, i)) + '<mark>' + esc(raw.slice(i, i + q.length)) + '</mark>' + esc(raw.slice(i + q.length));
  }
  function render(opts) {
    opts = opts || {};
    var q = state.q.trim().toLowerCase();
    var shown = [];
    items.forEach(function (li) {
      var okCat = state.cat === 'all' || li.getAttribute('data-cat') === state.cat;
      var okQ = !q || li._title.toLowerCase().indexOf(q) > -1;
      var show = okCat && okQ;
      var wasHidden = li.hidden;
      li.hidden = !show;
      highlight(li, q);
      if (!show && li.classList.contains('is-open')) setOpen(li, false);
      if (show) {
        shown.push(li);
        if (!still() && !opts.instant && (opts.restagger || wasHidden)) {
          li.classList.remove('is-entering');
          void li.offsetWidth;
          li.style.setProperty('--stagger', (shown.length - 1) * 0.05 + 's');
          li.classList.add('is-entering');
        }
      }
    });
    if (empty) empty.hidden = shown.length > 0;
    if (pager) pager.hidden = shown.length === 0;
    setFeature(state.cat === 'all' && !q, opts.instant);
    if (result) {
      var n = '<strong>' + shown.length + '</strong>건';
      result.innerHTML = q
        ? '‘' + esc(state.q.trim()) + '’ 검색 결과 ' + n + (state.cat !== 'all' ? ' · ' + LABEL[state.cat] : '')
        : LABEL[state.cat] + ' ' + n;
    }
    if (opts.scroll) keepBoardInView();
  }
  items.forEach(function (li) {
    li.addEventListener('animationend', function () { li.classList.remove('is-entering'); });
  });

  /* ---------- 주소(?cat=) 동기화 ---------- */
  function syncUrl(hash) {
    try {
      var u = new URL(window.location.href);
      if (state.cat === 'all') u.searchParams.delete('cat'); else u.searchParams.set('cat', state.cat);
      history.replaceState(null, '', u.pathname + u.search + (hash ? '#' + hash : ''));
    } catch (e) { /* file:// 등에서는 무시 */ }
  }

  /* ---------- 분류 탭 ---------- */
  // o.instant: 애니메이션 없이 · o.url:false 주소 유지 · o.scroll:false 목록 위치 보정 안 함
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
    render({ restagger: true, instant: o.instant, scroll: !o.instant && o.scroll !== false });
    if (o.url !== false) syncUrl();
  }
  tabs.forEach(function (t) {
    t.addEventListener('click', function () { selectTab(t.getAttribute('data-cat')); });
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
    selectTab(next.getAttribute('data-cat'));
  });

  /* ---------- 검색 ---------- */
  function toggleClear() { if (clearBtn) clearBtn.hidden = !input.value; }
  function resetQuery() { if (input) input.value = ''; state.q = ''; toggleClear(); }
  if (form) form.addEventListener('submit', function (e) { e.preventDefault(); input.blur(); });
  if (input) {
    input.addEventListener('input', function () { state.q = input.value; toggleClear(); render({ scroll: true }); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && input.value) { e.preventDefault(); resetQuery(); render({ scroll: true }); }
    });
  }
  if (clearBtn) clearBtn.addEventListener('click', function () { resetQuery(); render({ scroll: true }); input.focus({ preventScroll: true }); });

  /* ---------- 아코디언 ---------- */
  function setOpen(li, open) {
    var btn = $('.nw-row', li);
    li.classList.toggle('is-open', open);
    if (btn) btn.setAttribute('aria-expanded', String(open));
  }
  items.forEach(function (li) {
    var btn = $('.nw-row', li);
    if (!btn) return;
    btn.addEventListener('click', function () {
      var open = !li.classList.contains('is-open');
      setOpen(li, open);
      syncUrl(open ? li.id : '');
    });
  });

  // 게시물 열기 (피처 기사 버튼 · #주소)
  function openPost(id, focus) {
    var li = document.getElementById(id);
    if (!li || !li.classList.contains('nw-item')) return false;
    if (li.hidden) {
      resetQuery();
      selectTab('all', { url: false, instant: true, scroll: false });
    }
    setOpen(li, true);
    syncUrl(id);
    li.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'start' });
    if (focus) { var b = $('.nw-row', li); if (b) b.focus({ preventScroll: true }); }
    return true;
  }
  $$('[data-open]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (openPost(a.getAttribute('data-open'), true)) e.preventDefault();
    });
  });

  // 결과 없음 → 초기화
  var resetBtn = $('[data-reset]');
  if (resetBtn) resetBtn.addEventListener('click', function () {
    resetQuery();
    selectTab('all');
    tabs[0].focus({ preventScroll: true });
  });

  // 히어로 영상 카드: 첫 등장 애니메이션이 끝나면 고정
  var heroFilm = $('.nw-hero-film');
  if (heroFilm) heroFilm.addEventListener('animationend', function () { heroFilm.classList.add('is-done'); });

  /* ---------- 툴바 붙음 표시 ---------- */
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

  /* ---------- 처음 상태: ?cat= · ?q= · #게시물 ---------- */
  var params = new URLSearchParams(window.location.search);
  var q0 = params.get('q');
  if (q0 && input) { input.value = q0; state.q = q0; toggleClear(); }
  var rawCat = params.get('cat');
  selectTab(rawCat || 'all', { instant: true, url: false });
  var h = decodeURIComponent((window.location.hash || '').slice(1));
  var hasPost = !!(h && document.getElementById(h) && document.getElementById(h).classList.contains('nw-item'));
  // 잘못된 ?cat= 값은 전체로 보여 주고 주소에서도 정리합니다.
  if (rawCat !== null && CATS.indexOf(rawCat) < 0) syncUrl(hasPost ? h : '');
  updateTabsEdge();
  if (hasPost) setTimeout(function () { openPost(h, false); }, 350);
})();
