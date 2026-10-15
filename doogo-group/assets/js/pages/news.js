/* =========================================================
   DOOGO GROUP — news.js (그룹소식)
   소식 배너(게시물마다 하나 · 누르면 게시판의 글이 열림) · 분류 탭(URL ?cat= 동기화) · 제목 검색 · 아코디언 본문 · 결과 없음 상태
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

  /* ---------- 툴바가 붙은 상태에서 바꾸면 목록 맨 위로 ----------
     게시판 시작점(결과 안내 줄)으로 맞춥니다. */
  function keepBoardInView() {
    if (!toolbar || getComputedStyle(toolbar).position !== 'sticky') return;
    var anchor = result || panel;
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

  // 게시물 열기 (소식 배너 · #주소) — 분류·검색으로 가려져 있으면 전체로 되돌린 뒤 엽니다
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

  /* =========================================================
     소식 배너 — 목록의 각 게시물(li)에서 분류·날짜·제목과 data-sum(요약) · data-img(사진) ·
     data-visual(사진이 없을 때 그래픽)을 읽어 배너를 만듭니다. 글을 고치면 배너도 함께 바뀝니다.
     배너를 누르면 아래 게시판에서 해당 글이 열리고(#주소 반영), 자동 넘김은 '움직임 멈추기'에서 꺼집니다.
     ========================================================= */
  var BN_EN = { notice: 'Notice', business: 'Business', campus: 'Campus', recruit: 'Recruit' };
  var BN_DUR = 6500; // 한 배너가 머무는 시간(ms)
  var BN_ICON = {
    privacy: '<path d="M12 3 4.8 5.9v5.6c0 4.5 3.1 8.3 7.2 9.5 4.1-1.2 7.2-5 7.2-9.5V5.9L12 3Z"/><path d="m8.7 12.1 2.3 2.3 4.4-4.6"/>',
    recruit: '<circle cx="9.5" cy="8" r="3.6"/><path d="M3 20c.7-3.7 3.3-6 6.5-6s5.8 2.3 6.5 6M18.5 7.5v6M15.5 10.5h6"/>'
  };
  var BN_BIZ = ['교육업', '제조업', '브랜드 커머스', '미디어 & 콘텐츠', '마케팅', '유통', '공간 & 라이프스타일'];

  function bnArt(li, kind) {
    var core = '', word = '';
    if (kind === 'process') {
      word = 'Process';
      var steps = $$('.nw-steps li', li).map(function (s, i) {
        var n = $('.en', s), label = s.textContent.replace(n ? n.textContent : '', '').trim();
        return '<span class="nw-bn-step"><b class="en">' + esc(n ? n.textContent : String(i + 1)) + '</b><span>' + esc(label) + '</span></span>';
      });
      core = '<span class="nw-bn-steps" style="--n:' + steps.length + '">' + steps.join('') + '</span>';
    } else {
      var chips = kind === 'privacy'
        ? $$('.nw-sum-k', li).map(function (k) { return k.textContent; })
        : kind === 'recruit' ? BN_BIZ : [];
      word = kind === 'privacy' ? 'Privacy' : kind === 'recruit' ? 'Join us' : 'News';
      core = '<span class="nw-bn-orb"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + (BN_ICON[kind] || BN_ICON.privacy) + '</svg></span>' +
        (chips.length ? '<span class="nw-bn-chips">' + chips.map(function (c) { return '<span class="nw-bn-chip">' + esc(c) + '</span>'; }).join('') + '</span>' : '');
    }
    return '<span class="nw-bn-art nw-bn-art--' + esc(kind || 'news') + '">' +
      '<span class="nw-bn-art-grid"></span><span class="nw-bn-art-word en">' + word + '</span>' +
      '<span class="nw-bn-art-core">' + core + '</span></span>';
  }

  var bnSec = $('#nw-banners');
  var bnTrack = $('#nw-bn-track');
  var bnNav = bnSec && $('.nw-bn-nav', bnSec);
  if (bnSec && bnTrack && bnNav) (function () {
    var root = $('.nw-bn', bnSec);
    var stage = $('.nw-bn-stage', bnSec);
    var viewport = $('.nw-bn-viewport', bnSec);
    var countCur = $('.nw-bn-count b', bnSec), countAll = $('.nw-bn-count span', bnSec);
    var toggleBtn = $('[data-bn="toggle"]', bnSec);
    var total = items.length;
    var slides = [], navBtns = [];
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    // 'A·B' 가 가운뎃점에서 줄바꿈되지 않도록 묶습니다
    var tight = function (t) { return esc(t).replace(/\s*·\s*/g, '\u2060·\u2060'); };

    items.forEach(function (li, i) {
      var id = li.id, cat = li.getAttribute('data-cat');
      var catLabel = ($('.nw-cat', li) || {}).textContent || LABEL[cat] || '';
      var timeEl = $('.nw-date', li);
      var date = timeEl ? timeEl.textContent : '';
      var dt = timeEl ? timeEl.getAttribute('datetime') : '';
      var sum = li.getAttribute('data-sum') || '';
      var img = li.getAttribute('data-img');
      var media = img
        ? '<span class="nw-bn-media media-cover"><img src="' + esc(img) + '" alt="" width="1280" height="950" draggable="false" decoding="async"' + (i ? ' loading="lazy"' : '') + '></span>'
        : '<span class="nw-bn-media">' + bnArt(li, li.getAttribute('data-visual')) + '</span>';
      var slide = document.createElement('div');
      slide.className = 'nw-bn-slide';
      slide.setAttribute('role', 'group');
      slide.setAttribute('aria-roledescription', 'slide');
      slide.setAttribute('aria-label', (i + 1) + ' / ' + total);
      slide.innerHTML =
        '<a class="nw-bn-link" href="#' + id + '" draggable="false" aria-labelledby="' + id + '-bn-t ' + id + '-bn-go" aria-describedby="' + id + '-bn-s">' +
          '<span aria-hidden="true">' + media + '<span class="nw-bn-flag en">' + (BN_EN[cat] || 'News') + '</span></span>' +
          '<span class="nw-bn-body">' +
            '<span class="nw-bn-meta"><span class="nw-pill">' + esc(catLabel) + '</span><time class="en" datetime="' + esc(dt) + '">' + esc(date) + '</time></span>' +
            '<strong class="nw-bn-title" id="' + id + '-bn-t">' + tight(li._title) + '</strong>' +
            (sum ? '<span class="nw-bn-sum" id="' + id + '-bn-s">' + esc(sum) + '</span>' : '') +
            '<span class="btn btn--white nw-bn-go" id="' + id + '-bn-go">게시판에서 보기 <svg class="ico ico-arrow" aria-hidden="true"><use href="#i-arrow"/></svg></span>' +
          '</span>' +
        '</a>';
      bnTrack.appendChild(slide);
      slides.push(slide);

      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'nw-bn-tab';
      b.innerHTML = '<span class="nw-bn-tab-bar" aria-hidden="true"><i></i></span>' +
        '<span class="nw-bn-tab-n en" aria-hidden="true">' + pad(i + 1) + '</span>' +
        '<span class="nw-bn-tab-k">' + esc(catLabel) + '</span>' +
        '<span class="nw-bn-tab-t">' + esc(li._title) + '</span>';
      b.setAttribute('aria-controls', 'nw-bn-track');
      bnNav.appendChild(b);
      navBtns.push(b);
    });
    if (countAll) countAll.textContent = pad(total);
    bnSec.hidden = false;

    /* ---------- 넘김 ---------- */
    var cur = -1, leaveTimer = 0;
    function setP(p) {
      var bar = navBtns[cur] && $('.nw-bn-tab-bar i', navBtns[cur]);
      if (bar) bar.style.transform = 'scale' + (bnNav.classList.contains('is-row') ? 'X' : 'Y') + '(' + Math.min(1, p) + ')';
    }
    // 가로 줄일 때 고른 배너 항목을 가운데로 (가로로만 움직여 페이지 스크롤은 그대로)
    function keepTabInView(b, instant) {
      if (bnNav.scrollWidth <= bnNav.clientWidth + 1) return;
      var rel = b.getBoundingClientRect().left - bnNav.getBoundingClientRect().left + bnNav.scrollLeft;
      var to = rel - (bnNav.clientWidth - b.offsetWidth) / 2;
      bnNav.scrollTo({ left: Math.max(0, to), behavior: instant || still() ? 'auto' : 'smooth' });
    }
    function go(i, dir, o) {
      o = o || {};
      i = (i + total) % total;
      if (i === cur) return;
      var prev = cur;
      if (prev > -1) {
        setP(0);
        navBtns[prev].removeAttribute('aria-current');
        $('.nw-bn-tab-bar i', navBtns[prev]).style.transform = '';
      }
      bnTrack.style.setProperty('--dir', dir || 1);
      bnTrack.setAttribute('aria-live', o.auto || o.init ? 'off' : 'polite');
      slides.forEach(function (s, k) {
        s.classList.toggle('is-active', k === i);
        s.classList.toggle('is-leaving', k === prev && !still() && !o.init);
      });
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(function () { slides.forEach(function (s) { s.classList.remove('is-leaving'); }); }, 800);
      cur = i;
      navBtns[i].setAttribute('aria-current', 'true');
      if (countCur) countCur.textContent = pad(i + 1);
      elapsed = 0;
      setP(playing() ? 0 : 1);
      if (!o.init) keepTabInView(navBtns[i]);
    }

    /* ---------- 자동 넘김 (움직임 멈추기 · 직접 멈춤 · 마우스 올림 · 포커스 · 화면 밖에서는 쉼) ---------- */
    var userPaused = false, hover = false, focusIn = false, inView = true, dragging = false;
    var elapsed = 0, last = 0, raf = 0;
    function playing() { return !userPaused && !still(); }
    function canRun() { return playing() && !hover && !focusIn && inView && !dragging && !document.hidden; }
    function frame(t) {
      raf = requestAnimationFrame(frame);
      if (last) elapsed += Math.min(100, t - last);
      last = t;
      setP(elapsed / BN_DUR);
      if (elapsed >= BN_DUR) go(cur + 1, 1, { auto: true });
    }
    function sync() {
      root.classList.toggle('is-paused', !playing());
      if (toggleBtn) toggleBtn.setAttribute('aria-label', playing() ? '배너 자동 넘김 멈추기' : '배너 자동 넘김 시작');
      if (!playing()) setP(1);
      if (canRun()) { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }
      else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }
    if (toggleBtn) toggleBtn.addEventListener('click', function () {
      userPaused = playing();
      if (!userPaused) { elapsed = 0; setP(0); }
      sync();
    });
    stage.addEventListener('mouseenter', function () { hover = true; sync(); });
    stage.addEventListener('mouseleave', function () { hover = false; sync(); });
    root.addEventListener('focusin', function () { focusIn = true; sync(); });
    root.addEventListener('focusout', function (e) { if (!root.contains(e.relatedTarget)) { focusIn = false; sync(); } });
    document.addEventListener('visibilitychange', sync);
    document.addEventListener('doogo:motion', function () { if (!still()) { elapsed = 0; setP(0); } sync(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { inView = en[0].isIntersecting; sync(); }, { threshold: 0.35 }).observe(stage);
    }

    /* ---------- 버튼 · 목록 · 키보드 ---------- */
    $$('[data-bn]', bnSec).forEach(function (b) {
      var k = b.getAttribute('data-bn');
      if (k === 'prev') b.addEventListener('click', function () { go(cur - 1, -1); });
      if (k === 'next') b.addEventListener('click', function () { go(cur + 1, 1); });
    });
    navBtns.forEach(function (b, i) {
      b.addEventListener('click', function () { go(i, i < cur ? -1 : 1); });
    });
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var t = e.target, d = e.key === 'ArrowRight' ? 1 : -1;
      var onLink = t.classList && t.classList.contains('nw-bn-link');
      var ni = navBtns.indexOf(t);
      if (!onLink && ni < 0) return;
      e.preventDefault();
      go(cur + d, d);
      if (onLink) $('.nw-bn-link', slides[cur]).focus({ preventScroll: true });
      else navBtns[cur].focus({ preventScroll: true });
    });

    /* ---------- 배너 누르기 → 게시판의 글 열기 ---------- */
    var moved = false;
    slides.forEach(function (s) {
      var a = $('.nw-bn-link', s);
      a.addEventListener('click', function (e) {
        e.preventDefault();
        if (moved) { moved = false; return; }
        openPost(a.getAttribute('href').slice(1), true);
      });
      a.addEventListener('dragstart', function (e) { e.preventDefault(); });
    });

    /* ---------- 밀어서 넘기기 (터치 · 마우스) ---------- */
    var drag = null;
    viewport.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId, dx: 0, on: false };
      moved = false;
    });
    viewport.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.on) {
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          drag.on = moved = dragging = true;
          try { viewport.setPointerCapture(e.pointerId); } catch (err) {}
          stage.classList.add('is-dragging');
          sync();
        } else if (Math.abs(dy) > 10) { drag = null; return; }
      }
      if (drag.on) {
        drag.dx = dx;
        if (!still()) bnTrack.style.setProperty('--dx', (dx * 0.25).toFixed(1) + 'px');
      }
    });
    function endDrag() {
      if (!drag) return;
      var d = drag;
      drag = null;
      if (!d.on) return;
      dragging = false;
      stage.classList.remove('is-dragging');
      bnTrack.style.removeProperty('--dx');
      if (d.dx <= -48) go(cur + 1, 1);
      else if (d.dx >= 48) go(cur - 1, -1);
      sync();
    }
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);

    /* ---------- 목록 표시 방향 (데스크톱 세로 · 그 외 가로 줄) ---------- */
    function layoutNav() {
      bnNav.classList.toggle('is-row', getComputedStyle(bnNav).flexDirection === 'row');
      if (cur > -1) { setP(playing() ? elapsed / BN_DUR : 1); keepTabInView(navBtns[cur], true); }
    }
    window.addEventListener('resize', layoutNav);

    go(0, 1, { init: true });
    layoutNav();
    sync();
  })();

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
  // 주소의 #게시물이 바뀌면(뒤로 가기 · 직접 입력) 그 글을 엽니다
  window.addEventListener('hashchange', function () {
    var id = decodeURIComponent((window.location.hash || '').slice(1));
    if (id) openPost(id, false);
  });
})();
