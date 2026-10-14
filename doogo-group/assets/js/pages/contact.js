/* =========================================================
   DOOGO GROUP — contact.js (문의하기)
   분야 선택(URL ?type= 동기화) · 분야별 안내 · 글자 수 · 동의 펼치기
   · 제출 시 검증 · 전송(data-endpoint) 또는 시안 모드 · 접수 완료 화면 · FAQ 아코디언
   ========================================================= */
(function () {
  'use strict';
  /* 움직임 정책: OS 설정과 관계없이 부드러운 스크롤·강조 효과를 쓰고,
     사용자가 '움직임 멈추기'를 고른 경우(html.motion-off)에만 바로 이동·효과 생략 */
  function still() { return !!(window.DOOGO && window.DOOGO.motionOff && window.DOOGO.motionOff()); }
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- 분야 정보 ---------- */
  var TYPES = {
    campus:   { label: '교육 · DOOGO CLASS', topics: 'DOOGO HOLDINGS가 직접 운영하는 교육 플랫폼의 실전 교육 과정, 강사·과정 소개, 온라인 클래스, 교육장 연계', ph: '관심 있는 과정이나 주제, 인원, 희망 일정 등을 적어 주세요.' },
    bio:      { label: '제조 · DOOGOBIO', topics: '뉴질랜드 건강식품 개발, 소량 제조, 패키지·인쇄, 제조 상담·연결 ‘두고커넥트’', ph: '만들고 싶은 제품, 예상 수량, 패키지·인쇄 필요 여부 등을 적어 주세요.' },
    commerce: { label: '커머스 · DOOGO MAKERS', topics: '브랜드 기획, 상품 운영, 브랜드 성장과 EXIT 전략', ph: '브랜드 현황(준비 중·운영 중), 판매 채널, 고민하는 부분을 적어 주세요.' },
    media:    { label: '미디어 · DOOGO MEDIA', topics: '촬영, 유튜브 콘텐츠, 라이브 콘텐츠 제작', ph: '필요한 콘텐츠(촬영·유튜브·라이브), 목적, 희망 일정을 적어 주세요.' },
    ad:       { label: '광고 · DOOGO AD', topics: '네이버·쿠팡 중심 광고 운영, 광고 소재 기획, 성과 분석', ph: '판매 중인 상품과 채널, 현재 광고 운영 여부, 목표를 적어 주세요.' },
    food:     { label: '유통 · DOOGOFOOD', topics: 'DOOGO HOLDINGS가 직접 운영하는 식품 도매 플랫폼의 공급·입점, 상품 공급, 판매자 협력', ph: '공급사인지 판매자인지, 취급 품목과 원하는 협력 방식을 적어 주세요.' },
    space:    { label: '공간 · DOOGO SPACE', topics: '공유오피스, 비상주 사무실, 교육장 대여, 숙박 ‘NORA STAY’', ph: '필요한 공간(공유오피스·비상주·교육장·숙박), 인원, 기간을 적어 주세요.' },
    partner:  { label: '그룹 제휴 · DOOGO HOLDINGS', topics: '지주회사 창구로 받는 사업 간 제휴, 공동 프로젝트, 그룹 차원의 협력 제안', ph: '회사 소개와 제안 내용, 기대하는 협력 방식을 적어 주세요.' }
  };
  var MAX = 1000;

  var form = $('#inquiryForm');
  var done = $('#inquiryDone');
  var card = $('#ct-card');
  if (!form) return;

  var radios = $$('input[name="type"]', form);
  var typeGroup = $('#typeGroup');
  var typeHint = $('#typeHint');
  var typeErr = $('#typeErr');
  var nameEl = $('#f-name');
  var companyEl = $('#f-company');
  var contactEl = $('#f-contact');
  var msgEl = $('#f-message');
  var consentEl = $('#f-consent');
  var consentBox = $('.ct-consent');
  var alertEl = $('#formAlert');
  var submitBtn = $('.ct-submit', form);
  var countNow = $('[data-count-now]');
  var countWrap = $('.ct-count');
  var step1 = $('.ct-step[data-step="1"]');
  var step2 = $('.ct-step[data-step="2"]');
  var defaultHint = typeHint ? typeHint.innerHTML : '';
  var defaultPh = msgEl ? msgEl.getAttribute('data-default-ph') : '';
  var submitted = false; // 첫 제출 이후에만 오류 해제 검사

  /* ---------- 시안 모드 안내 ---------- */
  // data-endpoint가 비어 있으면 시안 모드: 양식 위 안내를 보이고, 연결되면 숨깁니다.
  function getEndpoint() { return (form.getAttribute('data-endpoint') || '').trim(); }
  var isDemo = !(getEndpoint() && window.fetch);
  $$('[data-demo-only]').forEach(function (el) { el.hidden = !isDemo; });

  function currentType() {
    var r = radios.filter(function (x) { return x.checked; })[0];
    return r ? r.value : '';
  }

  /* ---------- URL ?type= 동기화 ---------- */
  function setUrlType(v) {
    if (!window.history || !history.replaceState) return;
    try {
      var u = new URL(window.location.href);
      if (v) u.searchParams.set('type', v); else u.searchParams.delete('type');
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    } catch (e) { /* 무시 */ }
  }

  /* ---------- 분야 선택 반영 ---------- */
  function syncType(opts) {
    opts = opts || {};
    var v = currentType();
    var t = TYPES[v];
    if (typeHint) {
      if (t) {
        typeHint.innerHTML = '<strong>' + t.label + '</strong> ' + t.topics + ' 관련 문의를 받습니다.';
        typeHint.classList.add('is-on');
        if (!still() && !opts.silent) { typeHint.classList.remove('is-flash'); void typeHint.offsetWidth; typeHint.classList.add('is-flash'); }
      } else {
        typeHint.innerHTML = defaultHint;
        typeHint.classList.remove('is-on');
      }
    }
    if (msgEl) msgEl.setAttribute('placeholder', t ? t.ph : defaultPh);
    if (step1) step1.classList.toggle('is-done', !!t);
    $$('.ct-orbit a[data-pick-type], .ct-desk a[data-pick-type]').forEach(function (a) { a.classList.toggle('is-picked', a.getAttribute('data-pick-type') === v); });
    if (!opts.noUrl) setUrlType(v);
    if (submitted) recheck('type');
    syncStep2();
  }
  radios.forEach(function (r) { r.addEventListener('change', function () { syncType(); }); });

  function pickType(v, opts) {
    var r = radios.filter(function (x) { return x.value === v; })[0];
    if (!r) return false;
    r.checked = true;
    syncType(opts);
    return r;
  }

  // 페이지 진입 시 ?type= 으로 미리 선택
  (function () {
    var v = '';
    try { v = (new URL(window.location.href)).searchParams.get('type') || ''; } catch (e) {}
    if (v && TYPES[v]) pickType(v, { silent: true, noUrl: true });
    else syncType({ silent: true, noUrl: true });
  })();

  // 히어로 궤도 · FAQ 버튼 → 같은 페이지에서 분야 선택 후 양식으로 이동
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-pick-type]');
    if (!a) return;
    var v = a.getAttribute('data-pick-type');
    if (!TYPES[v]) return;
    e.preventDefault();
    if (done && !done.hidden) resetForm({ keepFocus: true });
    var r = pickType(v);
    var target = typeGroup || form;
    target.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'start' });
    if (r) setTimeout(function () { try { r.focus({ preventScroll: true }); } catch (err) { r.focus(); } }, still() ? 0 : 450);
  });

  /* ---------- 글자 수 ---------- */
  function syncCount() {
    if (!msgEl || !countNow) return;
    var n = msgEl.value.length;
    countNow.textContent = n;
    if (countWrap) {
      countWrap.classList.toggle('is-near', n >= MAX * 0.9 && n < MAX);
      countWrap.classList.toggle('is-max', n >= MAX);
    }
  }
  if (msgEl) msgEl.addEventListener('input', function () { syncCount(); syncStep2(); });
  syncCount();

  /* ---------- 단계 2 완료 표시 ---------- */
  function syncStep2() {
    if (!step2) return;
    var ok = nameEl.value.trim() && isContact(contactEl.value.trim()) && msgEl.value.trim().length >= 10 && consentEl.checked;
    step2.classList.toggle('is-done', !!ok);
  }
  [nameEl, contactEl].forEach(function (el) { el && el.addEventListener('input', syncStep2); });

  /* ---------- 동의 내용 펼치기 ---------- */
  var cToggle = $('.ct-consent-toggle');
  var cDetail = $('#consentDetail');
  if (cToggle && cDetail) {
    cToggle.addEventListener('click', function () {
      var open = cToggle.getAttribute('aria-expanded') !== 'true';
      cToggle.setAttribute('aria-expanded', String(open));
      cDetail.classList.toggle('is-open', open);
      cToggle.firstChild.nodeValue = open ? '내용 접기 ' : '내용 보기 ';
    });
  }
  if (consentEl) consentEl.addEventListener('change', function () { syncStep2(); if (submitted) recheck('consent'); });

  /* ---------- 검증 ---------- */
  function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
  function isPhone(v) {
    if (!/^[0-9+\-().\s]+$/.test(v)) return false;
    var d = v.replace(/[^0-9]/g, '');
    return d.length >= 9 && d.length <= 13;
  }
  function isContact(v) { return v.indexOf('@') > -1 ? isEmail(v) : isPhone(v); }

  function setError(el, errEl, msg) {
    if (!errEl) return;
    if (msg) {
      errEl.textContent = msg; errEl.hidden = false;
      if (el) el.setAttribute('aria-invalid', 'true');
    } else {
      errEl.textContent = ''; errEl.hidden = true;
      if (el) el.removeAttribute('aria-invalid');
    }
  }

  // 각 필드 검사: 오류 메시지 또는 '' 반환
  var RULES = {
    type: function () { return currentType() ? '' : '문의 분야를 선택해 주세요.'; },
    name: function () { return nameEl.value.trim() ? '' : '이름을 입력해 주세요.'; },
    contact: function () {
      var v = contactEl.value.trim();
      if (!v) return '회신받으실 이메일 또는 연락처를 입력해 주세요.';
      if (v.indexOf('@') > -1) return isEmail(v) ? '' : '이메일 형식을 확인해 주세요. (예: name@company.com)';
      return isPhone(v) ? '' : '이메일 또는 전화번호 형식을 확인해 주세요. (예: 010-0000-0000)';
    },
    message: function () {
      var v = msgEl.value.trim();
      if (!v) return '문의 내용을 입력해 주세요.';
      if (v.length < 10) return '문의 내용을 10자 이상 적어 주세요.';
      return '';
    },
    consent: function () { return consentEl.checked ? '' : '개인정보 수집·이용에 동의해 주세요.'; }
  };
  var FIELDS = {
    type: { el: typeGroup, err: typeErr, focus: function () { var r = radios.filter(function (x) { return x.checked; })[0] || radios[0]; r.focus(); } },
    name: { el: nameEl, err: $('#f-name-err') },
    contact: { el: contactEl, err: $('#f-contact-err') },
    message: { el: msgEl, err: $('#f-message-err') },
    consent: { el: consentEl, err: $('#f-consent-err') }
  };
  var ORDER = ['type', 'name', 'contact', 'message', 'consent'];

  function validateField(key) {
    var msg = RULES[key]();
    var f = FIELDS[key];
    setError(f.el, f.err, msg);
    if (key === 'consent' && consentBox) consentBox.classList.toggle('is-invalid', !!msg);
    return msg;
  }

  // 첫 제출 이후 다시 검사하고 상단 요약(남은 항목 수)도 함께 갱신
  function recheck(key) {
    validateField(key);
    updateAlert();
  }

  // 첫 제출 이후: 고친 필드는 바로 오류를 지움 (입력 중 새 오류를 띄우지는 않음)
  function clearIfFixed(key) {
    if (!submitted) return;
    var f = FIELDS[key];
    if (f.el && f.el.getAttribute('aria-invalid') === 'true' && !RULES[key]()) {
      setError(f.el, f.err, '');
      updateAlert();
    }
  }
  nameEl.addEventListener('input', function () { clearIfFixed('name'); });
  contactEl.addEventListener('input', function () { clearIfFixed('contact'); });
  msgEl.addEventListener('input', function () { clearIfFixed('message'); });
  [nameEl, contactEl, msgEl].forEach(function (el) {
    el.addEventListener('blur', function () {
      var key = el === nameEl ? 'name' : el === contactEl ? 'contact' : 'message';
      if (submitted && el.getAttribute('aria-invalid') === 'true') recheck(key);
    });
  });

  function updateAlert() {
    if (!alertEl || alertEl.classList.contains('is-net')) return;
    var left = ORDER.filter(function (k) { var e = FIELDS[k].err; return e && !e.hidden; }).length;
    if (!left) { alertEl.hidden = true; alertEl.textContent = ''; }
    else alertEl.textContent = '입력 내용을 확인해 주세요. ' + left + '개 항목을 고쳐야 접수할 수 있습니다.';
  }

  function showAlert(msg, net) {
    if (!alertEl) return;
    alertEl.classList.toggle('is-net', !!net);
    alertEl.textContent = msg;
    alertEl.hidden = false;
  }

  /* ---------- 제출 ---------- */
  var sending = false; // 전송 중 중복 제출(Enter 연타 등) 방지
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) return;
    submitted = true;
    if (alertEl) alertEl.classList.remove('is-net');
    var bad = ORDER.filter(function (k) { return !!validateField(k); });
    if (bad.length) {
      showAlert('입력 내용을 확인해 주세요. ' + bad.length + '개 항목을 고쳐야 접수할 수 있습니다.');
      var first = FIELDS[bad[0]];
      if (first.focus) first.focus(); else first.el.focus();
      return;
    }
    if (alertEl) { alertEl.hidden = true; alertEl.textContent = ''; }

    var v = currentType();
    var data = {
      type: v,
      typeLabel: TYPES[v].label,
      name: nameEl.value.trim(),
      company: companyEl.value.trim(),
      contact: contactEl.value.trim(),
      message: msgEl.value.trim(),
      consent: true,
      page: window.location.href,
      submittedAt: new Date().toISOString()
    };
    var endpoint = getEndpoint();
    setLoading(true);

    if (endpoint && window.fetch) {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(data)
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        setLoading(false);
        showDone(data, false);
      }).catch(function () {
        setLoading(false);
        showAlert('전송하지 못했습니다. 잠시 후 다시 시도해 주세요. 입력하신 내용은 그대로 남아 있습니다.', true);
        if (alertEl) { alertEl.setAttribute('tabindex', '-1'); alertEl.focus(); }
      });
    } else {
      // 시안 모드: 실제 전송 없이 '전송되지 않았습니다' 안내 화면을 보여 줍니다.
      setTimeout(function () { setLoading(false); showDone(data, true); }, still() ? 0 : 700);
    }
  });

  function setLoading(on) {
    sending = on;
    if (!submitBtn) return;
    submitBtn.disabled = on;
    submitBtn.classList.toggle('is-loading', on);
    submitBtn.setAttribute('aria-busy', String(on));
    var label = $('.ct-submit-label', submitBtn);
    if (label) label.textContent = on ? '접수하는 중…' : '문의 접수하기';
  }

  /* ---------- 접수 완료 화면 ---------- */
  function showDone(data, demo) {
    if (!done) return;
    $('[data-sum="type"]', done).textContent = data.typeLabel;
    $('[data-sum="name"]', done).textContent = data.name + (data.company ? ' (' + data.company + ')' : '');
    $('[data-sum="contact"]', done).textContent = data.contact;
    var note = $('[data-demo-note]', done);
    if (note) note.hidden = !demo;
    // 시안 모드에서는 '접수되었습니다' 대신 '전송되지 않았습니다' 문구와 안내 아이콘으로 바꿉니다.
    done.classList.toggle('is-demo', !!demo);
    $$('[data-demo-text]', done).forEach(function (el) {
      if (el.getAttribute('data-real-text') === null) el.setAttribute('data-real-text', el.textContent);
      el.textContent = demo ? el.getAttribute('data-demo-text') : el.getAttribute('data-real-text');
    });

    form.hidden = true;
    done.hidden = false;
    done.classList.add('is-enter');
    done.classList.remove('is-show');
    void done.offsetWidth;
    done.classList.add('is-show');
    requestAnimationFrame(function () { requestAnimationFrame(function () { done.classList.remove('is-enter'); }); });

    var top = card.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.5) card.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'start' });
    var title = $('#ct-done-title');
    if (title) setTimeout(function () { try { title.focus({ preventScroll: true }); } catch (e) { title.focus(); } }, 60);
  }

  function resetForm(opts) {
    opts = opts || {};
    form.reset();
    submitted = false;
    ORDER.forEach(function (k) { var f = FIELDS[k]; setError(f.el, f.err, ''); });
    if (consentBox) consentBox.classList.remove('is-invalid');
    if (alertEl) { alertEl.hidden = true; alertEl.textContent = ''; alertEl.classList.remove('is-net'); }
    if (cToggle && cDetail) { cToggle.setAttribute('aria-expanded', 'false'); cDetail.classList.remove('is-open'); cToggle.firstChild.nodeValue = '내용 보기 '; }
    syncCount();
    syncType({ silent: true });
    if (done) { done.hidden = true; done.classList.remove('is-show'); }
    form.hidden = false;
    if (!opts.keepFocus) {
      card.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'start' });
      setTimeout(function () { try { radios[0].focus({ preventScroll: true }); } catch (e) { radios[0].focus(); } }, still() ? 0 : 400);
    }
  }
  var resetBtn = done && $('[data-reset]', done);
  if (resetBtn) resetBtn.addEventListener('click', function () { resetForm(); });

  /* ---------- 화면 크기에 따라 숨긴 히어로 요소(궤도 / 모바일 분야 칩)는 등장 처리만 ---------- */
  $$('.ct-orbit, .ct-desk').forEach(function (box) {
    if (window.getComputedStyle(box).display !== 'none') return;
    if (box.hasAttribute('data-reveal')) box.classList.add('is-in');
    $$('[data-reveal]', box).forEach(function (el) { el.classList.add('is-in'); });
  });

  /* ---------- 왼쪽 안내: 스티키 구간 높이에 맞춰 위치 보정 ---------- */
  // 안내 상단(.ct-aside-in)이 화면보다 길면 아래쪽이 잘리지 않도록 sticky top을 줄입니다.
  var asideIn = $('.ct-aside-in');
  if (asideIn && 'ResizeObserver' in window) {
    new ResizeObserver(function () {
      document.documentElement.style.setProperty('--ct-aside-h', asideIn.offsetHeight + 'px');
    }).observe(asideIn);
  }

  /* ---------- FAQ 아코디언 ---------- */
  $$('.ct-faq-q').forEach(function (btn) {
    var item = btn.closest('.ct-faq-item');
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      item.classList.toggle('is-open', open);
    });
  });
})();
