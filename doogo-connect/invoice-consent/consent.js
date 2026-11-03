/*
 * DOOGO CONNECT — 인보이스 PDF 다운로드 전 「거래 구조 확인 및 동의」 팝업
 *
 * 필요한 파일: agreement.js → invoice.js → consent.js (이 순서로 불러오기)
 *
 * 가장 쉬운 사용법 — 기존 「견적서 PDF 다운로드」 버튼의 클릭 처리를 이것으로 바꾸면 끝:
 *
 *   button.onclick = function () {
 *     DoogoConsent.downloadInvoice(invoiceData, {
 *       account: { id: user.id, email: user.email },        // 로그인한 의뢰자
 *       existingRecord: serverRecordOrNull,                   // 서버에 이미 저장된 동의 기록(있으면 팝업 생략)
 *       onRecord: function (record) {                         // 동의 기록을 서버에 저장 (꼭 연결하세요)
 *         return fetch('/api/consents', { method: 'POST', headers: { 'Content-Type': 'application/json' },
 *                                          body: JSON.stringify(record) }).then(function (r) { return r.json(); });
 *       }
 *     });
 *   };
 *
 * 동의 팝업만 띄우고 싶을 때:  DoogoConsent.open({ orderNo, client, account }).then(function (record) { ... })
 *   → 동의하면 record 객체, 닫거나 「동의하지 않음」이면 null
 */
(function (root) {
  'use strict';

  var A = root.DOOGO_AGREEMENT;
  if (!A) throw new Error('[DoogoConsent] agreement.js 를 먼저 불러와 주세요.');

  var STORE_PREFIX = 'doogo-consent:';

  /* ---------- 도구 ---------- */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function kst(iso) {
    try {
      return new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      }).format(new Date(iso)) + ' (KST)';
    } catch (e) { return iso; }
  }
  function newId() {
    var d = new Date();
    var r = '';
    try {
      var a = new Uint8Array(5); (root.crypto || {}).getRandomValues(a);
      for (var i = 0; i < a.length; i++) r += (a[i] % 36).toString(36);
    } catch (e) { r = Math.random().toString(36).slice(2, 7); }
    return 'DGC-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + r.toUpperCase();
  }
  function fnvHex(str) { // crypto.subtle 을 못 쓸 때(비보안 http) 대체 지문
    var h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      h1 ^= c; h1 = Math.imul(h1, 16777619) >>> 0;
      h2 ^= c; h2 = Math.imul(h2, 2246822519) >>> 0;
    }
    return 'fnv-' + ('0000000' + h1.toString(16)).slice(-8) + ('0000000' + h2.toString(16)).slice(-8);
  }
  function sha256(str) {
    try {
      if (root.crypto && root.crypto.subtle && root.TextEncoder) {
        return root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
          return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
        }).catch(function () { return fnvHex(str); });
      }
    } catch (e) { /* 아래로 */ }
    return Promise.resolve(fnvHex(str));
  }
  function varsOf(opts) {
    var v = {};
    Object.keys(A.defaults).forEach(function (k) { v[k] = A.defaults[k]; });
    var src = opts && opts.vars || {};
    Object.keys(src).forEach(function (k) { if (src[k] != null) v[k] = src[k]; });
    return v;
  }
  function varsFromInvoice(data) {
    data = data || {};
    return {
      supplierName: data.supplier && data.supplier.name,
      threePL: data.logistics && data.logistics.threePL,
      court: data.court
    };
  }

  /* ---------- 기록 보관 (브라우저) ---------- */
  function storeKey(orderNo) { return STORE_PREFIX + 'v' + A.version + ':' + (orderNo || '-'); }
  function getLocalRecord(orderNo) {
    try { var s = root.localStorage.getItem(storeKey(orderNo)); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function saveLocalRecord(rec) {
    try { root.localStorage.setItem(storeKey(rec.orderNo), JSON.stringify(rec)); } catch (e) { /* 저장 못 해도 진행 */ }
  }
  function clearLocalRecords() {
    try {
      Object.keys(root.localStorage).forEach(function (k) { if (k.indexOf(STORE_PREFIX) === 0) root.localStorage.removeItem(k); });
    } catch (e) { /* 무시 */ }
  }

  /* ---------- 스타일 ---------- */
  var CSS = [
    '.dgc-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.62);display:flex;align-items:center;justify-content:center;padding:20px;font-family:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif;color:#0f172a;word-break:keep-all;overflow-wrap:anywhere;animation:dgc-fade .16s ease-out}',
    '.dgc-overlay *{box-sizing:border-box}',
    '@keyframes dgc-fade{from{opacity:0}to{opacity:1}}',
    '@keyframes dgc-up{from{transform:translateY(12px);opacity:.4}to{transform:none;opacity:1}}',
    '.dgc-modal{width:min(760px,100%);max-height:calc(100vh - 40px);display:flex;flex-direction:column;background:#fff;border-radius:16px;box-shadow:0 30px 80px rgba(2,6,23,.45);overflow:hidden;animation:dgc-up .2s ease-out}',
    '.dgc-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;background:#1e293b;color:#fff}',
    '.dgc-eyebrow{margin:0;font-size:12px;font-weight:600;color:#93c5fd;letter-spacing:.02em}',
    '.dgc-head h2{margin:2px 0 0;font-size:18px;font-weight:800;letter-spacing:-.01em}',
    '.dgc-x{flex:none;width:36px;height:36px;border:0;border-radius:10px;background:transparent;color:#cbd5e1;font-size:24px;line-height:1;cursor:pointer}',
    '.dgc-x:hover{background:rgba(255,255,255,.1);color:#fff}',
    '.dgc-body{padding:18px 20px 8px;overflow:auto;-webkit-overflow-scrolling:touch}',
    '.dgc-alert{border:1px solid #fecaca;background:#fef2f2;border-radius:12px;padding:12px 14px}',
    '.dgc-alert strong{display:block;font-size:15px;font-weight:800;color:#991b1b}',
    '.dgc-alert p{margin:4px 0 0;font-size:13.5px;line-height:1.6;color:#3f3f46}',
    '.dgc-keys{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}',
    '.dgc-key{border:1px solid #e2e8f0;border-radius:12px;padding:11px 12px;background:#f8fafc}',
    '.dgc-key i{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:7px;background:#dcfce7;color:#15803d;font-style:normal;font-weight:800;font-size:13px}',
    '.dgc-key b{display:block;margin-top:6px;font-size:13.5px;font-weight:800}',
    '.dgc-key span{display:block;margin-top:2px;font-size:12.5px;line-height:1.5;color:#475569}',
    '.dgc-flow{list-style:none;margin:12px 0 0;padding:0;display:grid;grid-template-columns:repeat(5,1fr);gap:6px;counter-reset:f}',
    '.dgc-flow li{position:relative;border:1px solid #cbd5e1;border-radius:10px;padding:8px 8px 9px;background:#fff;counter-increment:f}',
    '.dgc-flow li b{display:block;font-size:12px;font-weight:800}',
    '.dgc-flow li b:before{content:counter(f) ". ";color:#2563eb}',
    '.dgc-flow li span{display:block;margin-top:2px;font-size:11px;line-height:1.45;color:#64748b}',
    '.dgc-sec-title{margin:18px 0 8px;font-size:14px;font-weight:800;display:flex;justify-content:space-between;align-items:center;gap:8px}',
    '.dgc-sec-title small{font-size:12px;font-weight:700;color:#64748b}',
    '.dgc-read{font-size:12px;font-weight:800;padding:3px 9px;border-radius:999px;background:#fef3c7;color:#92400e;white-space:nowrap}',
    '.dgc-read.is-done{background:#dcfce7;color:#166534}',
    '.dgc-doc{height:230px;overflow:auto;border:1px solid #cbd5e1;border-radius:12px;padding:12px 14px;background:#f8fafc;font-size:13px;line-height:1.65;color:#1e293b;outline:none}',
    '.dgc-doc:focus-visible{box-shadow:0 0 0 3px rgba(59,130,246,.35)}',
    '.dgc-doc h4{margin:10px 0 2px;font-size:13.5px;font-weight:800}',
    '.dgc-doc h4:first-child{margin-top:0}',
    '.dgc-doc p{margin:0 0 3px}',
    '.dgc-doc ol{margin:2px 0 4px 18px;padding:0}',
    '.dgc-doc .dgc-doc-end{margin-top:12px;padding-top:10px;border-top:1px dashed #94a3b8;font-size:12px;color:#64748b;text-align:center}',
    '.dgc-checks{border:0;margin:0;padding:0;min-width:0}',
    '.dgc-checks[disabled]{opacity:.5}',
    '.dgc-check{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:6px;cursor:pointer;font-size:13.5px;line-height:1.55;background:#fff}',
    '.dgc-checks[disabled] .dgc-check{cursor:not-allowed}',
    '.dgc-check:hover{border-color:#93c5fd}',
    '.dgc-check input{flex:none;width:18px;height:18px;margin:2px 0 0;accent-color:#2563eb}',
    '.dgc-check.is-on{border-color:#3b82f6;background:#eff6ff}',
    '.dgc-check em{font-style:normal;font-weight:800;color:#dc2626;margin-right:2px}',
    '.dgc-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
    '.dgc-field label{display:block;font-size:12.5px;font-weight:700;color:#334155;margin-bottom:4px}',
    '.dgc-field input[type=text]{width:100%;height:42px;border:1px solid #cbd5e1;border-radius:10px;padding:0 12px;font:inherit;font-size:14px;color:#0f172a;background:#fff}',
    '.dgc-field input[type=text]:focus{outline:none;border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.2)}',
    '.dgc-field input.is-bad{border-color:#f87171}',
    '.dgc-field .dgc-hint{margin:4px 0 0;font-size:11.5px;color:#64748b}',
    '.dgc-field .dgc-pending{display:flex;gap:8px;align-items:flex-start;margin:6px 0 0;font-size:12.5px;font-weight:500;color:#334155;cursor:pointer;line-height:1.5}',
    '.dgc-pending input{margin:2px 0 0;accent-color:#2563eb}',
    '.dgc-phrase{margin-top:14px;border:1px dashed #94a3b8;border-radius:12px;padding:12px 14px;background:#f8fafc}',
    '.dgc-phrase p{margin:0 0 8px;font-size:13px;color:#334155}',
    '.dgc-phrase p b{color:#0f172a;background:#fff;border:1px solid #cbd5e1;border-radius:6px;padding:1px 6px;user-select:none;-webkit-user-select:none}',
    '.dgc-note{margin:12px 0 6px;font-size:12px;line-height:1.6;color:#64748b}',
    '.dgc-error{margin:8px 0 0;font-size:13px;font-weight:700;color:#b91c1c}',
    '.dgc-foot{display:flex;align-items:center;gap:8px;padding:12px 20px;border-top:1px solid #e2e8f0;background:#fff}',
    '.dgc-progress{margin-right:auto;font-size:12.5px;font-weight:700;color:#64748b}',
    '.dgc-progress b{color:#2563eb}',
    '.dgc-btn{height:44px;border-radius:10px;padding:0 16px;font:inherit;font-size:14px;font-weight:800;cursor:pointer;border:1px solid transparent;white-space:nowrap}',
    '.dgc-btn-ghost{background:#fff;border-color:#cbd5e1;color:#334155}',
    '.dgc-btn-ghost:hover{background:#f1f5f9}',
    '.dgc-btn-primary{background:#3b82f6;color:#fff}',
    '.dgc-btn-primary:hover{background:#2563eb}',
    '.dgc-btn-primary[disabled]{background:#cbd5e1;color:#fff;cursor:not-allowed}',
    '@media (max-width:640px){',
    '.dgc-overlay{padding:0;align-items:stretch}',
    '.dgc-modal{max-height:none;height:100%;border-radius:0}',
    '.dgc-keys{grid-template-columns:1fr}',
    '.dgc-flow{grid-template-columns:1fr}',
    '.dgc-grid{grid-template-columns:1fr}',
    '.dgc-doc{height:260px}',
    '.dgc-foot{flex-wrap:wrap}',
    '.dgc-progress{width:100%}',
    '.dgc-btn{flex:1}',
    '}'
  ].join('\n');

  var cssInjected = false;
  function injectCSS() {
    if (cssInjected) return;
    var st = document.createElement('style');
    st.setAttribute('data-doogo-consent', A.version);
    st.textContent = CSS;
    document.head.appendChild(st);
    cssInjected = true;
  }

  /* ---------- 팝업 ---------- */
  function buildModal(opts, vars) {
    var c = opts.client || {};
    var f = function (t) { return esc(A.fill(t, vars)); };

    var clauses = A.clauses.map(function (cl) {
      return '<h4>' + esc(cl.t) + '</h4>' +
        (cl.p || []).map(function (p) { return '<p>' + f(p) + '</p>'; }).join('') +
        (cl.list ? '<ol>' + cl.list.map(function (l) { return '<li>' + f(l) + '</li>'; }).join('') + '</ol>' : '');
    }).join('');

    var flow = A.flow.map(function (x) { return '<li><b>' + f(x.t) + '</b><span>' + f(x.d) + '</span></li>'; }).join('');

    var checks = A.checks.map(function (ch, i) {
      return '<label class="dgc-check"><input type="checkbox" data-check="' + esc(ch.id) + '">' +
        '<span><em>[필수]</em> ' + (i + 1) + '. ' + f(ch.t) + '</span></label>';
    }).join('');

    return '' +
      '<div class="dgc-modal" role="dialog" aria-modal="true" aria-labelledby="dgc-title">' +
        '<header class="dgc-head"><div><p class="dgc-eyebrow">인보이스 PDF 다운로드 전 확인' + (opts.orderNo ? ' · ' + esc(opts.orderNo) : '') + '</p>' +
          '<h2 id="dgc-title">거래 구조 확인 및 동의</h2></div>' +
          '<button type="button" class="dgc-x" data-act="cancel" aria-label="닫기">×</button></header>' +
        '<div class="dgc-body">' +
          '<div class="dgc-alert"><strong>이 인보이스는 OEM 제조 계약서가 아닙니다.</strong>' +
            '<p>의뢰하신 브랜드 제품을 <b>해외구매대행</b>으로 합법적으로 판매하실 수 있도록, ' + f('{supplierName}') +
            '가 제조 · 보관 · 발송과 품질 책임을 맡는 구조입니다. 아래 확인서를 끝까지 읽고 항목마다 직접 동의해 주세요.</p></div>' +
          '<div class="dgc-keys">' +
            '<div class="dgc-key"><i>1</i><b>제품 주인은 ' + f('{supplierName}') + '</b><span>재고 · 품질 · 유통기한 책임은 두고바이오가 집니다. 대금을 내도 소유권은 넘어오지 않아요.</span></div>' +
            '<div class="dgc-key"><i>2</i><b>주문 건별 해외 직배송</b><span>소비자 본인 명의로 뉴질랜드에서 바로 발송 · 통관돼요. 국내에 재고를 두지 않습니다.</span></div>' +
            '<div class="dgc-key"><i>3</i><b>의뢰자는 구매대행업자</b><span>구매대행업 영업등록 · 통신판매업 신고 · 표시광고 기준은 직접 지켜 주셔야 해요.</span></div>' +
          '</div>' +
          '<ol class="dgc-flow">' + flow + '</ol>' +

          '<div class="dgc-sec-title"><span>' + esc(A.title) + ' <small>v' + esc(A.version) + '</small></span><span class="dgc-read" data-read>끝까지 읽어 주세요 ↓</span></div>' +
          '<div class="dgc-doc" tabindex="0" data-doc aria-label="거래 구조 확인서 전문">' + clauses +
            '<p class="dgc-doc-end">— 확인서 끝 · 이 내용은 내려받는 인보이스 PDF 2페이지에 그대로 인쇄됩니다 —</p></div>' +

          '<div class="dgc-sec-title"><span>항목별 동의 <small>모두 필수 · 확인서를 끝까지 읽으면 체크할 수 있어요</small></span></div>' +
          '<fieldset class="dgc-checks" data-checks disabled><legend style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">항목별 동의</legend>' + checks + '</fieldset>' +

          '<div class="dgc-sec-title"><span>의뢰자 정보 <small>PDF 2페이지 동의 기록에 인쇄됩니다</small></span></div>' +
          '<div class="dgc-grid">' +
            '<div class="dgc-field"><label for="dgc-company">상호 (사업자명)</label><input type="text" id="dgc-company" data-f="company" value="' + esc(c.company) + '" autocomplete="organization"></div>' +
            '<div class="dgc-field"><label for="dgc-rep">대표자 성명</label><input type="text" id="dgc-rep" data-f="representative" value="' + esc(c.representative) + '" autocomplete="name"></div>' +
            '<div class="dgc-field"><label for="dgc-biz">사업자등록번호</label><input type="text" id="dgc-biz" data-f="bizNo" value="' + esc(c.bizNo) + '" inputmode="numeric" placeholder="000-00-00000"><p class="dgc-hint">숫자 10자리</p></div>' +
            '<div class="dgc-field"><label for="dgc-reg">수입식품등 인터넷 구매대행업 영업등록번호</label><input type="text" id="dgc-reg" data-f="importFoodRegNo" value="' + esc(c.importFoodRegNo) + '" placeholder="관할 지방식약청 등록번호">' +
              '<label class="dgc-pending"><input type="checkbox" data-f="importFoodRegPending"' + (c.importFoodRegPending ? ' checked' : '') + '><span>아직 등록 전입니다. 판매를 시작하기 전에 등록하겠습니다.</span></label></div>' +
          '</div>' +

          '<div class="dgc-phrase"><p>마지막으로 아래 문구를 그대로 입력해 주세요: <b>' + esc(A.phrase) + '</b></p>' +
            '<div class="dgc-field"><input type="text" data-f="phrase" aria-label="확인 문구 입력" autocomplete="off" placeholder="' + esc(A.phrase) + '"></div></div>' +

          '<p class="dgc-note">「동의하고 PDF 다운로드」를 누르면 동의 일시 · 계정 · 입력하신 정보 · 문서 버전과 지문(SHA-256)이 기록되고, 내려받는 인보이스 PDF 2페이지에 함께 인쇄됩니다. ' +
            '동의하지 않으시면 인보이스를 내려받을 수 없고 생산 준비도 진행되지 않습니다.</p>' +
          '<p class="dgc-error" data-error hidden></p>' +
        '</div>' +
        '<footer class="dgc-foot"><span class="dgc-progress" data-progress>항목 동의 <b>0</b>/' + A.checks.length + '</span>' +
          '<button type="button" class="dgc-btn dgc-btn-ghost" data-act="cancel">동의하지 않음</button>' +
          '<button type="button" class="dgc-btn dgc-btn-primary" data-act="agree" disabled>' + esc(opts.agreeLabel || '동의하고 PDF 다운로드') + '</button></footer>' +
      '</div>';
  }

  /*
   * open(opts) → Promise<record|null>
   *   opts.orderNo, opts.client{company,representative,bizNo}, opts.account{id,email}, opts.vars,
   *   opts.onRecord(record) → Promise (서버 저장), opts.onAgreeGesture() (클릭 순간 동기 실행 — 새 창 열기용)
   */
  function open(opts) {
    opts = opts || {};
    injectCSS();
    var vars = varsOf(opts);
    var openedAt = new Date().toISOString();
    var canonical = A.canonicalText(vars);
    var hashP = sha256(canonical);
    var prevFocus = document.activeElement;

    return new Promise(function (resolve) {
      var ov = document.createElement('div');
      ov.className = 'dgc-overlay';
      ov.innerHTML = buildModal(opts, vars);
      document.body.appendChild(ov);
      var prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      var $ = function (s) { return ov.querySelector(s); };
      var $$ = function (s) { return Array.prototype.slice.call(ov.querySelectorAll(s)); };
      var docEl = $('[data-doc]'), readEl = $('[data-read]'), checksEl = $('[data-checks]');
      var agreeBtn = $('[data-act="agree"]'), progEl = $('[data-progress] b'), errEl = $('[data-error]');
      var f = {};
      $$('[data-f]').forEach(function (el) { f[el.getAttribute('data-f')] = el; });
      var readAt = null, busy = false, done = false;

      function markRead() {
        if (readAt) return;
        readAt = new Date().toISOString();
        readEl.textContent = '끝까지 읽음 ✓';
        readEl.classList.add('is-done');
        checksEl.disabled = false;
        validate();
      }
      function onScroll() {
        if (docEl.scrollTop + docEl.clientHeight >= docEl.scrollHeight - 6) markRead();
      }
      docEl.addEventListener('scroll', onScroll, { passive: true });
      setTimeout(onScroll, 50); // 화면이 커서 스크롤이 필요 없는 경우

      function bizOk(v) { return /^\d{10}$/.test(String(v || '').replace(/\D/g, '')); }
      function fmtBiz(v) { var d = String(v || '').replace(/\D/g, '').slice(0, 10); return d.length === 10 ? d.slice(0, 3) + '-' + d.slice(3, 5) + '-' + d.slice(5) : v; }

      function state() {
        var checked = $$('[data-check]').filter(function (x) { return x.checked; }).length;
        return {
          checked: checked,
          company: norm(f.company.value),
          representative: norm(f.representative.value),
          bizNo: norm(f.bizNo.value),
          reg: norm(f.importFoodRegNo.value),
          pending: f.importFoodRegPending.checked,
          phrase: norm(f.phrase.value)
        };
      }
      function validate() {
        var s = state();
        progEl.textContent = s.checked;
        $$('.dgc-check').forEach(function (l) { l.classList.toggle('is-on', l.querySelector('input').checked); });
        f.bizNo.classList.toggle('is-bad', !!s.bizNo && !bizOk(s.bizNo));
        f.phrase.classList.toggle('is-bad', !!s.phrase && s.phrase !== norm(A.phrase));
        var ok = !!readAt && s.checked === A.checks.length && !!s.company && !!s.representative &&
          bizOk(s.bizNo) && (!!s.reg || s.pending) && s.phrase === norm(A.phrase);
        agreeBtn.disabled = !ok || busy;
        return ok;
      }
      ov.addEventListener('input', validate);
      ov.addEventListener('change', validate);
      f.bizNo.addEventListener('blur', function () { if (bizOk(f.bizNo.value)) { f.bizNo.value = fmtBiz(f.bizNo.value); validate(); } });
      f.phrase.addEventListener('paste', function (e) { e.preventDefault(); }); // 확인 문구는 직접 입력

      function close(result) {
        if (done) return;
        done = true;
        document.removeEventListener('keydown', onKey, true);
        document.body.style.overflow = prevOverflow;
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) { /* 무시 */ }
        resolve(result);
      }
      function onKey(e) {
        if (e.key === 'Escape' && !busy) { e.preventDefault(); close(null); }
        if (e.key === 'Tab') { // 팝업 안에서만 포커스 이동
          var items = $$('button,input,[tabindex="0"]').filter(function (x) { return !x.disabled && x.offsetParent !== null; });
          if (!items.length) return;
          var first = items[0], last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      document.addEventListener('keydown', onKey, true);
      ov.addEventListener('mousedown', function (e) { if (e.target === ov) { /* 바깥을 눌러도 닫지 않음 — 실수 방지 */ } });

      $$('[data-act="cancel"]').forEach(function (b) { b.addEventListener('click', function () { if (!busy) close(null); }); });

      agreeBtn.addEventListener('click', function () {
        if (!validate() || busy) return;
        var gestureResult = null;
        if (typeof opts.onAgreeGesture === 'function') {
          try { gestureResult = opts.onAgreeGesture(); } catch (e) { gestureResult = null; }
        }
        busy = true; agreeBtn.disabled = true; agreeBtn.textContent = '기록하는 중…'; errEl.hidden = true;
        var s = state();
        var agreedAt = new Date().toISOString();
        hashP.then(function (hash) {
          var rec = {
            id: newId(),
            type: 'doogo-connect.ondemand-structure-consent',
            orderNo: opts.orderNo || '',
            docTitle: A.title,
            docVersion: A.version,
            docEffectiveDate: A.effectiveDate,
            docHash: hash,
            vars: vars,
            client: {
              company: s.company,
              representative: s.representative,
              bizNo: fmtBiz(s.bizNo),
              importFoodRegNo: s.reg,
              importFoodRegPending: !s.reg && s.pending
            },
            account: opts.account || null,
            checks: A.checks.map(function (ch) { return { id: ch.id, text: A.fill(ch.t, vars), agreed: true }; }),
            phrase: s.phrase,
            readToEnd: true,
            openedAt: openedAt,
            readAt: readAt,
            agreedAt: agreedAt,
            agreedAtKST: kst(agreedAt),
            timezone: (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ''; } })(),
            userAgent: navigator.userAgent,
            pageUrl: location.href
          };
          var save = typeof opts.onRecord === 'function' ? Promise.resolve().then(function () { return opts.onRecord(rec); }) : Promise.resolve(null);
          return save.then(function (server) {
            if (server && typeof server === 'object') { // 서버가 돌려준 값(서버 시각·IP·저장 ID 등)을 합칩니다
              Object.keys(server).forEach(function (k) { if (server[k] != null) rec[k] = server[k]; });
            }
            saveLocalRecord(rec);
            rec.__gesture = gestureResult;
            close(rec);
          });
        }).catch(function (err) {
          busy = false; agreeBtn.textContent = opts.agreeLabel || '동의하고 PDF 다운로드';
          errEl.textContent = '동의 기록을 저장하지 못했어요. 잠시 후 다시 눌러 주세요. (' + (err && err.message ? err.message : err) + ')';
          errEl.hidden = false;
          if (gestureResult && gestureResult.close) { try { gestureResult.close(); } catch (e) { /* 무시 */ } }
          validate();
        });
      });

      setTimeout(function () { try { docEl.focus(); } catch (e) { /* 무시 */ } }, 30);
    });
  }

  /*
   * downloadInvoice(data, opts) — 「PDF 다운로드」 클릭 처리 전체
   *   - 이 주문·이 문서 버전에 대한 동의 기록이 있으면: 팝업 없이 바로 인쇄 창 (동의 기록 인쇄)
   *   - 없으면: 동의 팝업 → 동의하면 기록 저장 → 인쇄 창 (동의 기록 인쇄)
   *   반드시 버튼 클릭 처리 안에서 바로 부르세요 (팝업 차단 방지).
   */
  function downloadInvoice(data, opts) {
    opts = opts || {};
    data = data || {};
    var I = root.DoogoInvoice;
    if (!I) throw new Error('[DoogoConsent] invoice.js 를 먼저 불러와 주세요.');
    var printOpt = opts.print || {};

    var existing = opts.existingRecord;
    if (existing === undefined) existing = getLocalRecord(data.orderNo);
    if (existing && existing.docVersion !== A.version) existing = null; // 문안이 바뀌면 다시 동의

    if (existing && !opts.forceConsent) {
      var w0 = I.openWindow(data);
      I.writeAndPrint(w0, data, assign({}, printOpt, { consent: existing }));
      if (typeof opts.onDone === 'function') opts.onDone(existing);
      return Promise.resolve(existing);
    }

    var v = varsFromInvoice(data);
    var vars = assign({}, opts.vars || {});
    Object.keys(v).forEach(function (k) { if (v[k] != null && vars[k] == null) vars[k] = v[k]; });

    return open({
      orderNo: data.orderNo,
      client: assign({}, data.client || {}, opts.client || {}),
      account: opts.account,
      vars: vars,
      onRecord: opts.onRecord,
      agreeLabel: opts.agreeLabel,
      onAgreeGesture: function () { return I.openWindow(data); }
    }).then(function (rec) {
      if (!rec) return null;
      var w = rec.__gesture; delete rec.__gesture;
      I.writeAndPrint(w, data, assign({}, printOpt, { consent: rec }));
      if (typeof opts.onDone === 'function') opts.onDone(rec);
      return rec;
    });
  }

  function assign(t) {
    for (var i = 1; i < arguments.length; i++) {
      var s = arguments[i] || {};
      Object.keys(s).forEach(function (k) { t[k] = s[k]; });
    }
    return t;
  }

  root.DoogoConsent = {
    version: A.version,
    open: open,
    downloadInvoice: downloadInvoice,
    getLocalRecord: getLocalRecord,
    clearLocalRecords: clearLocalRecords,
    canonicalText: function (vars) { return A.canonicalText(varsOf({ vars: vars })); },
    hash: function (vars) { return sha256(A.canonicalText(varsOf({ vars: vars }))); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
