/* =========================================================
   DOOGO GROUP — leadership.js (리더십)
   짧은 그룹 소개(1 + 5 숫자 카운트 · 트리 그리기 · 흐르는 빛) · 대표 카드 가로 스와이프 컨트롤(휴대폰)
   · 대표 상세 (dialog: 열기/닫기 · 이전/다음 · Esc · 바깥 클릭)
   카드 생김새·등장 모션은 base.css '리더 프로필 카드 공통'(.pcard)이 맡습니다.
   모션은 OS 설정과 관계없이 재생하고, 사용자가 '움직임 멈추기'를 고르면(window.DOOGO.motionOff()) 최종 상태로 보여 줍니다.
   ========================================================= */
(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var motionOff = function () { return !!(window.DOOGO && window.DOOGO.motionOff && window.DOOGO.motionOff()); };
  var hasIO = 'IntersectionObserver' in window;

  /* ---------- 짧은 그룹 소개: 지주회사 1 → 그룹사 5 ----------
     화면에 30% 들어오면 숫자가 0에서 올라가고(1.8초, 칸마다 0.15초 지연), 뿌리 → 줄기 → 가로선 → 그룹사 순서로 그려집니다.
     완전히 벗어나면 처음 상태로 되돌려 두었다가 다시 들어오면 또 재생합니다. 다 그려진 뒤에는 보이는 동안만 빛이 흐릅니다. */
  var brief = $('[data-brief]');
  if (brief) {
    var counts = $$('[data-ld-count]', brief);
    var rafs = [], liveTimer = 0, inView = false;
    var finalNums = function () { counts.forEach(function (el) { el.textContent = el.getAttribute('data-ld-count'); }); };
    var stopCount = function () { rafs.forEach(cancelAnimationFrame); rafs = []; };
    var runCount = function () {
      stopCount();
      counts.forEach(function (el, i) {
        var n = parseInt(el.getAttribute('data-ld-count'), 10) || 0, start = null, delay = 150 * i + 120, dur = 1800;
        el.textContent = '0';
        var step = function (ts) {
          if (start === null) start = ts + delay;
          var p = Math.max(0, Math.min((ts - start) / dur, 1));
          el.textContent = String(Math.round(n * (1 - Math.pow(1 - p, 3))));
          if (p < 1) rafs[i] = requestAnimationFrame(step);
        };
        rafs[i] = requestAnimationFrame(step);
      });
    };
    var reset = function () {
      stopCount(); clearTimeout(liveTimer);
      brief.classList.remove('is-play', 'is-live');
      counts.forEach(function (el) { el.textContent = '0'; });
    };
    var play = function () {
      if (motionOff()) { showStill(); return; }
      brief.classList.add('is-armed'); // 멈춤 → 다시 켬, 키보드로 먼저 보인 뒤에도 다시 그려지도록
      reset();
      void brief.offsetWidth; // 되돌린 상태를 먼저 그린 뒤 재생
      brief.classList.add('is-play');
      runCount();
      liveTimer = setTimeout(function () { if (inView) brief.classList.add('is-live'); }, 2300);
    };
    var showStill = function () {
      stopCount(); clearTimeout(liveTimer);
      brief.classList.remove('is-armed', 'is-live');
      brief.classList.add('is-play');
      finalNums();
    };
    if (!hasIO || motionOff()) showStill();
    else {
      brief.classList.add('is-armed');
      counts.forEach(function (el) { el.textContent = '0'; });
    }
    // 멈춤 상태로 열렸어도 관찰은 계속합니다 — 나중에 '움직임 켜기'를 누르면 보이는 동안 바로, 아니면 다시 들어올 때 재생
    if (hasIO) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && en.intersectionRatio >= 0.3) {
            if (!inView) { inView = true; play(); } // 멈춤이면 play() 가 최종 상태로
          } else if (!en.isIntersecting && inView) {
            inView = false;
            if (!motionOff()) reset();
          }
          if (!en.isIntersecting) brief.classList.remove('is-live'); // 화면 밖이면 흐르는 빛 정지
        });
      }, { threshold: [0, 0.3] }).observe(brief);
    }
    // 키보드로 들어오면 기다리지 않고 바로 보여 줌
    brief.addEventListener('focusin', function () { if (!brief.classList.contains('is-play')) showStill(); });
    // '움직임 멈추기' 전환 — 멈추면 이미 시작된 전환까지 바로 끝 상태로
    document.addEventListener('doogo:motion', function (e) {
      if (e.detail && e.detail.off) {
        showStill();
        requestAnimationFrame(function () {
          var main = $('#main');
          if (main && main.getAnimations) main.getAnimations({ subtree: true }).forEach(function (a) { try { a.finish(); } catch (err) { /* 무한 반복은 base.css 가 정지 */ } });
        });
      } else { brief.classList.add('is-armed'); if (inView) play(); }
    });
  }

  /* ---------- 대표 카드: 휴대폰(680px 이하) 가로 스와이프일 때만 번호 · 진행 막대 · 이전/다음 ----------
     넓은 화면에서는 3열·2열 그리드라 넘치지 않으므로 컨트롤을 숨깁니다. */
  (function () {
    var grid = $('[data-ld-grid]'), ctrl = $('[data-ld-ctrl]');
    if (!grid || !ctrl) return;
    var items = $$('.ld-card', grid);
    var prev = $('[data-ld-prev]', ctrl), next = $('[data-ld-next]', ctrl), fill = $('[data-ld-fill]', ctrl), cur = $('[data-ld-cur]', ctrl);
    var raf = 0;
    var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
    function nearest() {
      var pl = parseFloat(getComputedStyle(grid).scrollPaddingLeft) || 0, best = 0, bd = Infinity;
      items.forEach(function (it, i) { var d = Math.abs(it.offsetLeft - pl - grid.scrollLeft); if (d < bd) { bd = d; best = i; } });
      if (grid.scrollLeft >= grid.scrollWidth - grid.clientWidth - 2) best = items.length - 1;
      return best;
    }
    function sync() {
      raf = 0;
      var max = grid.scrollWidth - grid.clientWidth, on = max > 4;
      ctrl.hidden = !on;
      if (!on) return;
      var i = nearest();
      if (cur) cur.textContent = pad2(i + 1);
      if (prev) prev.disabled = grid.scrollLeft <= 2;
      if (next) next.disabled = grid.scrollLeft >= max - 2;
      if (fill) fill.style.setProperty('--p', Math.min(1, (grid.scrollLeft + grid.clientWidth) / grid.scrollWidth).toFixed(4));
    }
    function queue() { if (!raf) raf = requestAnimationFrame(sync); }
    function go(dir) {
      var i = Math.max(0, Math.min(items.length - 1, nearest() + dir));
      var pl = parseFloat(getComputedStyle(grid).scrollPaddingLeft) || 0;
      grid.scrollTo({ left: items[i].offsetLeft - pl, behavior: motionOff() ? 'auto' : 'smooth' });
    }
    if (prev) prev.addEventListener('click', function () { go(-1); });
    if (next) next.addEventListener('click', function () { go(1); });
    // 가로 스와이프일 때는 줄이 화면에 들어오면 옆으로 가려진 카드까지 한꺼번에 드러냄
    // (밀어 넘길 때 빈 카드가 잠깐 보였다가 나타나지 않도록 — 처음 보이는 카드만 등장 모션이 보임)
    if ('IntersectionObserver' in window) {
      var gio = new IntersectionObserver(function (entries) {
        if (!entries.some(function (en) { return en.isIntersecting; })) return;
        if (grid.scrollWidth - grid.clientWidth <= 4) return;
        items.forEach(function (it) { it.classList.add('is-in'); });
        gio.disconnect();
      }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
      gio.observe(grid);
    }
    grid.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    window.addEventListener('load', queue);
    sync();

    /* 카드 앵커(#ceo · #leader-space …) 위치 보정
       - 휴대폰 가로 스와이프: 브라우저는 줄 안쪽 스크롤에만 scroll-margin 을 적용해 카드 위가 헤더에 가려지므로 직접 맞춤
       - 넓은 화면: 등장 전(아래로 28px 내려가 있던) 위치를 기준으로 이동해 위가 살짝 가려지던 것을 보정 */
    var html = document.documentElement;
    function cardOf(hash) {
      var id = (hash || '').replace(/^#/, '');
      if (!id) return null;
      var el = null;
      try { el = document.getElementById(decodeURIComponent(id)); } catch (e) { el = document.getElementById(id); }
      return el && items.indexOf(el) >= 0 ? el : null;
    }
    function docTop(el) { var y = 0; for (var n = el; n; n = n.offsetParent) y += n.offsetTop; return y; } // transform(등장 모션) 제외
    function showCard(card, smooth) {
      var beh = smooth && !motionOff() ? 'smooth' : 'instant';
      if (grid.scrollWidth - grid.clientWidth > 4) {
        var pl = parseFloat(getComputedStyle(grid).scrollPaddingLeft) || 0;
        grid.scrollTo({ left: Math.max(0, card.offsetLeft - pl), behavior: beh === 'instant' ? 'auto' : 'smooth' });
      }
      var mt = parseFloat(getComputedStyle(card).scrollMarginTop) || 0;
      var y = Math.max(0, Math.round(docTop(card) - mt));
      if (Math.abs(window.scrollY - y) > 2) window.scrollTo({ top: y, behavior: beh });
    }
    // 해시로 바로 들어온 경우: 브라우저의 부드러운 앵커 이동을 잠시 끄고(load 뒤 다시 이동할 때 엇나가지 않게) 끝에 한 번 맞춤
    var entry = cardOf(location.hash);
    if (entry) {
      var prevBehavior = html.style.scrollBehavior, userMoved = false;
      html.style.scrollBehavior = 'auto';
      var mark = function () { userMoved = true; };
      ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (ev) { window.addEventListener(ev, mark, { passive: true, once: true }); });
      var settle = function () {
        if (!userMoved) showCard(entry, false);
        setTimeout(function () { if (!userMoved) showCard(entry, false); html.style.scrollBehavior = prevBehavior; }, 350);
      };
      if (document.readyState === 'complete') setTimeout(settle, 60);
      else window.addEventListener('load', function () { setTimeout(settle, 60); });
    }
    // 주소창 · 뒤로 가기 등으로 해시만 바뀐 경우(브라우저가 먼저 옮긴 뒤 한 번 맞춤)
    window.addEventListener('hashchange', function () {
      var card = cardOf(location.hash);
      if (!card) return;
      card.classList.add('is-in');
      // 브라우저의 (부드러운) 앵커 이동이 끝난 뒤에 맞춤 — 스크롤이 120ms 멈추면
      var t = 0, end = Date.now() + 2500;
      var done = function () { window.removeEventListener('scroll', onS); showCard(card, false); };
      var onS = function () { clearTimeout(t); if (Date.now() > end) { done(); return; } t = setTimeout(done, 120); };
      window.addEventListener('scroll', onS, { passive: true });
      t = setTimeout(done, 160);
    });
    // 같은 페이지 안 링크(회사로 찾기 · 그룹 구조 트리 → 카드)
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var card = cardOf(a.getAttribute('href'));
      if (!card) return;
      e.preventDefault();
      if (history.pushState) history.pushState(null, '', '#' + card.id); else location.hash = card.id;
      card.classList.add('is-in');
      showCard(card, true);
    });
  })();

  /* ---------- 대표 상세 ----------
     카드의 data-* (이름 · 회사 · 분야 · 사업영역 · 직접 운영 · 소개 · 한마디 · 사진)만 옮겨 보여 줍니다. 이력은 '확정 후 게시'.
     사진이 없는 대표는 카드와 같은 실루엣 + '사진 준비 중'. */
  var modal = $('#ld-modal');
  var cards = $$('[data-leader]');
  if (!modal || !cards.length) return;
  if (typeof modal.showModal !== 'function') { // dialog 를 지원하지 않으면 상세 버튼을 숨김 (카드에 같은 사실이 모두 있음)
    $$('[data-leader-open]').forEach(function (b) { b.hidden = true; });
    return;
  }
  var html = document.documentElement;
  var inner = $('.ld-m-in', modal);
  var visual = $('.ld-m-visual', modal);
  var photo = $('.ld-m-photo', modal);
  var areasBox = $('[data-m-areas]', modal);
  var cur = 0, opener = null, swapTimer = null;
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var arrowSvg = '<svg class="ico" aria-hidden="true"><use href="#i-arrow"/></svg>';
  $$('.ld-m-count', modal).forEach(function (el) { el.innerHTML = '<b data-m="idx">01</b> / ' + pad(cards.length); });

  function parseLinks(str) {
    return (str || '').split(',').map(function (pair) {
      var p = pair.split('|'); return { label: (p[0] || '').trim(), href: (p[1] || '').trim() };
    }).filter(function (o) { return o.label && o.href; });
  }
  // 사업 이름 + '사업': '교육업'·'공간 & 숙박업'처럼 이미 '업'으로 끝나거나 '&'로 묶인 이름은 '사업'을 붙이지 않음
  function bizName(l) { return /업$|&/.test(l) ? l : l + ' 사업'; }
  function fill(i) {
    var d = cards[i].dataset;
    var links = parseLinks(d.links);
    var first = links[0] || { label: '', href: 'business.html' };
    var map = { name: d.name, co: d.co, tag: d.tag || '', field: d.field, area: bizName(first.label), note: d.note || '', quote: d.quote || '', idx: pad(i + 1) };
    Object.keys(map).forEach(function (k) { $$('[data-m="' + k + '"]', modal).forEach(function (el) { el.textContent = map[k]; }); });
    // 사업영역: 연결된 사업 페이지 링크 (DOOGO HOLDINGS 는 교육업 · 유통 두 개)
    //  분야와 사업영역 이름이 같으면(공간 & 숙박업 · 미디어 & 콘텐츠 · 마케팅) 같은 말이 겹치지 않게 이 줄을 숨김 — 아래 버튼으로 이동
    if (areasBox) {
      areasBox.innerHTML = '';
      links.forEach(function (o) {
        var a = document.createElement('a');
        a.className = 'ld-m-area'; a.href = o.href;
        a.innerHTML = '<span>' + bizName(o.label) + ' 페이지</span>' + arrowSvg;
        areasBox.appendChild(a);
      });
      areasBox.parentNode.hidden = links.length === 1 && links[0].label === d.field;
    }
    $$('[data-m-link]', modal).forEach(function (a) { a.setAttribute('href', first.href); });
    // 있는 정보만 보여 줌
    $$('[data-m-row]', modal).forEach(function (row) {
      var k = row.getAttribute('data-m-row');
      row.hidden = !(k === 'direct' ? d.direct : d[k]);
    });
    var tag = $('.ld-m-co .ld-tag', modal);
    if (tag) { tag.classList.toggle('ld-tag--hold', d.tag === '지주회사'); tag.classList.toggle('ld-tag--global', d.tag === '뉴질랜드'); }
    var c = $('[data-m-contact]', modal); if (c) c.setAttribute('href', 'contact.html?type=' + d.contact);
    if (photo) { if (d.photo) { photo.src = d.photo; photo.hidden = false; } else photo.hidden = true; }
    if (visual) visual.classList.toggle('has-photo', !!d.photo);
    cur = i;
  }
  function show(i) { // 열린 상태에서 이전/다음
    i = (i + cards.length) % cards.length;
    if (motionOff()) { fill(i); return; }
    clearTimeout(swapTimer);
    inner.classList.add('is-swap');
    swapTimer = setTimeout(function () { fill(i); requestAnimationFrame(function () { inner.classList.remove('is-swap'); }); }, 200);
  }
  function open(i, btn) {
    opener = btn || null;
    fill(i);
    modal.classList.remove('is-closing');
    modal.showModal();
    html.classList.add('is-locked');
    var c = $('[data-m-close]', modal); if (c) c.focus();
  }
  function close() {
    if (!modal.open || modal.classList.contains('is-closing')) return;
    if (motionOff()) { modal.close(); return; }
    modal.classList.add('is-closing');
    setTimeout(function () { modal.classList.remove('is-closing'); modal.close(); }, 250);
  }

  cards.forEach(function (card, i) {
    var btn = $('[data-leader-open]', card);
    if (btn) btn.addEventListener('click', function () { open(i, btn); });
  });
  modal.addEventListener('close', function () {
    html.classList.remove('is-locked');
    if (opener && opener.focus) opener.focus();
  });
  modal.addEventListener('cancel', function (e) { e.preventDefault(); close(); }); // Esc 도 닫힘 모션을 거쳐 닫음
  modal.addEventListener('click', function (e) {
    if (e.target === modal) { close(); return; } // 바깥(배경)
    if (e.target.closest('[data-m-close]')) { close(); return; }
    var step = e.target.closest('[data-m-step]');
    if (step) show(cur + parseInt(step.getAttribute('data-m-step'), 10));
  });
  modal.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); show(cur + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); show(cur - 1); }
  });
})();
