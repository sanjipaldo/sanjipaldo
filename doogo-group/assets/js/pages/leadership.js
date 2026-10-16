/* =========================================================
   DOOGO GROUP — leadership.js (두고 사람들)
   짧은 그룹 소개(1 + 5 숫자 카운트 · 트리 그리기 · 흐르는 빛) · 프로필 카드 줄 앵커(줄 자체는 people-rail.js)
   · 프로필 상세 (dialog: 열기/닫기 · 이전/다음 · Esc · 바깥 클릭)
   카드 생김새·등장 모션은 base.css 프로필 카드 공통(.pcard)이 맡습니다.
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

  /* ---------- 프로필 카드 줄 (21차 타이탄식 · people-rail.js) ----------
     카드 앵커(#ceo · #leader-space …)나 '회사로 찾기' · 그룹 구조 링크로 오면: 그 사람 카드를 줄 맨 앞으로 옮기고 줄이 보이게 내려감 */
  (function () {
    var rail = $('.ld-rail[data-prail]');
    var grid = $('[id="ld-grid"]');
    if (!rail || !grid) return;
    var items = $$('.ld-card[data-leader]', grid);
    var html = document.documentElement;
    function cardOf(hash) {
      var id = (hash || '').replace(/^#/, '');
      if (!id) return -1;
      try { id = decodeURIComponent(id); } catch (e) { /* 그대로 */ }
      for (var i = 0; i < items.length; i++) if (items[i].id === id) return i;
      return -1;
    }
    function docTop(el) { var y = 0; for (var n = el; n; n = n.offsetParent) y += n.offsetTop; return y; }
    function showCard(k, smooth) {
      if (rail._prail) rail._prail.go(k, !smooth);
      var hh = parseFloat(getComputedStyle(html).getPropertyValue('--header-h')) || 84;
      var y = Math.max(0, Math.round(docTop(rail) - hh - 24));
      var beh = smooth && !motionOff() ? 'smooth' : 'instant';
      if (Math.abs(window.scrollY - y) > 2) window.scrollTo({ top: y, behavior: beh });
    }
    // 해시로 바로 들어온 경우: 글꼴·사진이 자리 잡은 뒤 한 번 맞춤 (사용자가 먼저 움직이면 그대로 둠)
    var entry = cardOf(location.hash);
    if (entry >= 0) {
      var prevBehavior = html.style.scrollBehavior, userMoved = false;
      html.style.scrollBehavior = 'auto';
      ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (ev) { window.addEventListener(ev, function () { userMoved = true; }, { passive: true, once: true }); });
      var settle = function () {
        if (!userMoved) showCard(entry, false);
        setTimeout(function () { if (!userMoved) showCard(entry, false); html.style.scrollBehavior = prevBehavior; }, 350);
      };
      if (document.readyState === 'complete') setTimeout(settle, 60);
      else window.addEventListener('load', function () { setTimeout(settle, 60); });
    }
    window.addEventListener('hashchange', function () {
      var k = cardOf(location.hash);
      if (k >= 0) showCard(k, false);
    });
    // 같은 페이지 안 링크(회사로 찾기 · 그룹 구조 트리 → 카드)
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var k = cardOf(a.getAttribute('href'));
      if (k < 0) return;
      e.preventDefault();
      if (history.pushState) history.pushState(null, '', '#' + items[k].id); else location.hash = items[k].id;
      showCard(k, true);
    });
  })();

  /* ---------- 프로필 상세 ----------
     카드의 data-* (이름 · 직함(data-title, 없으면 '대표이사') · 회사 · 분야 · 주요 서비스(data-services, DOOGO HOLDINGS 는 data-brands → 운영 브랜드 링크) · 사업영역 · 소개 · 한마디 · 사진)만 옮겨 보여 줍니다. 이력은 '확정 후 게시'.
     사진이 없는 사람은 카드와 같은 실루엣 + '사진 준비 중'. */
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
  // 사업 이름 + '사업': '교육업'·'공간 & 라이프스타일'처럼 이미 '업'으로 끝나거나 '&'로 묶인 이름은 '사업'을 붙이지 않음
  function bizName(l) { return /업$|&/.test(l) ? l : l + ' 사업'; }
  function fill(i) {
    var d = cards[i].dataset;
    var links = parseLinks(d.links);
    var first = links[0] || { label: '', href: 'business.html' };
    var map = { name: d.name, title: d.title || '대표이사', co: d.co, tag: d.tag || '', field: d.field, services: d.services || '', area: bizName(first.label), note: d.note || '', quote: d.quote || '', idx: pad(i + 1) };
    Object.keys(map).forEach(function (k) { $$('[data-m="' + k + '"]', modal).forEach(function (el) { el.textContent = map[k]; }); });
    // 사업영역: 연결된 사업 페이지 링크 (DOOGO HOLDINGS 는 교육업 · 유통 두 개)
    //  분야와 사업영역 이름이 같으면(공간 & 라이프스타일 · 마케팅 · 브랜드 커머스) 같은 말이 겹치지 않게 이 줄을 숨김 — 아래 버튼으로 이동
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
    // 이력: 카드의 data-career('|'로 구분)가 있으면 목록으로, 없으면 '확정 후 게시'
    var careerEl = $('[data-m-career]', modal);
    if (careerEl) {
      careerEl.innerHTML = '';
      var items = (d.career || '').split('|').filter(Boolean);
      careerEl.classList.toggle('is-pending', !items.length);
      if (items.length) {
        var ul = document.createElement('ul'); ul.className = 'ld-m-career';
        items.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
        careerEl.appendChild(ul);
      } else careerEl.textContent = '확정 후 게시';
    }
    $$('[data-m-row]', modal).forEach(function (row) {
      var k = row.getAttribute('data-m-row');
      row.hidden = !d[k];
    });
    var tag = $('.ld-m-co .ld-tag', modal);
    if (tag) { tag.classList.toggle('ld-tag--hold', d.tag === '지주회사'); tag.classList.toggle('ld-tag--global', d.tag === '해외법인'); }
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
  // 줄 양옆을 채우는 복제 카드(people-rail.js · data-prail-src = 원본 번호)를 눌러도 같은 사람 상세
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-prail-src] [data-leader-open]');
    if (!btn) return;
    var k = parseInt(btn.closest('[data-prail-src]').getAttribute('data-prail-src'), 10);
    if (k >= 0 && k < cards.length) open(k, $('[data-leader-open]', cards[k]));
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
