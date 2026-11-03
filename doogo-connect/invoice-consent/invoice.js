/*
 * DOOGO CONNECT — 브랜드 개발 컨설팅 인보이스 (A4 2페이지)
 *
 *   1페이지: 인보이스 — 브랜드 개발 컨설팅 용역(A) · On-Demand 공급 준비금(B) · 할인(C)
 *   2페이지: 「On-Demand 해외공급 · 구매대행 거래 구조 확인서」 + 의뢰자 전자 동의 기록
 *
 * 필요한 파일: agreement.js (먼저 불러오기)
 *
 * 쓰는 법
 *   DoogoInvoice.renderInto(element, data, { consent })   // 화면 미리보기
 *   var w = DoogoInvoice.openWindow(data);                // 클릭한 순간(사용자 동작 안)에 호출
 *   DoogoInvoice.writeAndPrint(w, data, { consent });     // 새 창에 쓰고 인쇄(PDF로 저장) 창 열기
 *   DoogoInvoice.buildHTML(data, { consent })             // 인쇄용 전체 HTML 문자열
 *
 * data 모양은 README.md 의 "인보이스 데이터" 를 보세요.
 * items[].kind 가 없으면 자동으로 정합니다 — 금액이 음수거나 이름에 '할인' → discount,
 * 단위가 EA → supply(공급 준비금), 그 밖(SET 등) → service(컨설팅 용역).
 */
(function (root) {
  'use strict';

  var A = root.DOOGO_AGREEMENT;
  if (!A) throw new Error('[DoogoInvoice] agreement.js 를 먼저 불러와 주세요.');

  var SCRIPT_BASE = (function () {
    try {
      var s = document.currentScript && document.currentScript.src;
      return s ? new URL('.', s).href : '';
    } catch (e) { return ''; }
  })();

  var DEFAULTS = {
    logoUrl: SCRIPT_BASE + 'assets/doogobio-logo.png',
    fontCssUrl: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css'
  };

  /* ---------- 작은 도구들 ---------- */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function money(n) {
    var v = round2(n);
    var s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (v < 0 ? '-$' : '$') + s;
  }
  function toDate(d) {
    if (d instanceof Date) return d;
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      var p = d.split('-');
      return new Date(+p[0], +p[1] - 1, +p[2]);
    }
    return d ? new Date(d) : new Date();
  }
  function koDate(d) {
    var x = toDate(d);
    return x.getFullYear() + '. ' + (x.getMonth() + 1) + '. ' + x.getDate() + '.';
  }
  function addDays(d, n) { var x = new Date(toDate(d).getTime()); x.setDate(x.getDate() + n); return x; }
  function absUrl(u) {
    if (!u) return '';
    try { return new URL(u, document.baseURI).href; } catch (e) { return u; }
  }
  function kstString(iso) {
    try {
      return new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      }).format(new Date(iso)) + ' (KST)';
    } catch (e) { return iso; }
  }

  /* ---------- 데이터 정리 ---------- */
  function inferKind(it) {
    if (it.kind) return it.kind;
    var price = Number(it.price != null ? it.price : it.amount) || 0;
    if (price < 0 || /할인|discount/i.test(it.name || '')) return 'discount';
    if (String(it.unit || '').toUpperCase() === 'EA') return 'supply';
    return 'service';
  }

  function normalize(data) {
    data = data || {};
    var sup = data.supplier || {};
    var cli = data.client || {};
    var vars = {
      supplierName: sup.name || A.defaults.supplierName,
      threePL: (data.logistics && data.logistics.threePL) || A.defaults.threePL,
      court: data.court || A.defaults.court
    };
    var items = (data.items || []).map(function (it) {
      var qty = Number(it.qty != null ? it.qty : 1) || 0;
      var price = Number(it.price) || 0;
      var amount = it.amount != null ? Number(it.amount) : qty * price;
      return {
        kind: inferKind(it), name: it.name || '', sub: it.sub || '',
        qty: qty, unit: it.unit || '', price: price, amount: round2(amount)
      };
    });
    var sum = function (k) { return round2(items.filter(function (i) { return i.kind === k; }).reduce(function (s, i) { return s + i.amount; }, 0)); };
    var a = sum('service'), b = sum('supply'), d = sum('discount');
    var disc = Math.abs(d);
    var dA = Math.min(disc, Math.max(a, 0));          // 할인은 컨설팅 용역비에서 먼저 뺍니다
    var dB = round2(disc - dA);                        // 남는 할인만 공급 준비금에서 뺍니다
    var aNet = round2(a - dA), bNet = round2(b - dB);
    var prepQty = Number(data.prepQty) || items.filter(function (i) {
      return i.kind === 'supply' && String(i.unit).toUpperCase() === 'EA';
    }).reduce(function (m, i) { return Math.max(m, i.qty); }, 0);
    var unitCredit = prepQty ? round2(bNet / prepQty) : null;
    var currency = data.currency || 'NZD';
    var issue = toDate(data.issueDate || new Date());
    var validDays = data.validDays != null ? Number(data.validDays) : 7;

    return {
      raw: data,
      orderNo: data.orderNo || '',
      issueDate: issue,
      validUntil: addDays(issue, validDays),
      validDays: validDays,
      currency: currency,
      supplier: {
        name: vars.supplierName,
        manager: sup.manager || 'DOOGO CONNECT',
        role: sup.role || '해외 제조·판매원',
        address: sup.address || '3F, 10 Piermark Drive, Auckland',
        email: sup.email || 'doogobio.bill@gmail.com',
        note: sup.note || '브랜드 개발 컨설팅 · On-Demand 해외 공급'
      },
      client: {
        company: cli.company || '',
        representative: cli.representative || '',
        bizNo: cli.bizNo || ''
      },
      productTitle: data.productTitle || ((items.filter(function (i) { return i.kind === 'supply'; })[0] || {}).name || ''),
      vars: vars,
      items: items,
      totals: {
        service: a, supply: b, discount: d,
        serviceNet: aNet, supplyNet: bNet,
        discountOnService: round2(dA), discountOnSupply: dB,
        total: round2(a + b + d), prepQty: prepQty, unitCredit: unitCredit
      }
    };
  }

  /* ---------- 스타일 ---------- */
  var CSS = [
    '.dgi-doc{font-family:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif;color:#111827;-webkit-print-color-adjust:exact;print-color-adjust:exact;line-height:1.45;word-break:keep-all;overflow-wrap:anywhere}',
    '.dgi-doc *{box-sizing:border-box}',
    '.dgi-page{width:210mm;height:297mm;padding:13mm 15mm 11mm;background:#fff;position:relative;overflow:hidden;display:flex;flex-direction:column}',
    '.dgi-doc p,.dgi-doc h1,.dgi-doc h2,.dgi-doc h3,.dgi-doc ol,.dgi-doc ul{margin:0;padding:0}',

    /* 머리 */
    '.dgi-head{display:grid;grid-template-columns:40mm 1fr 40mm;align-items:center;margin-bottom:7mm}',
    '.dgi-logo{height:21mm;width:auto;justify-self:center}',
    '.dgi-titlewrap{text-align:center}',
    '.dgi-title{display:inline-block;font-size:21pt;font-weight:800;letter-spacing:.42em;padding:0 0 2.2mm .42em;border-bottom:2.4px solid #111827;line-height:1.2}',
    '.dgi-subtitle{margin-top:2mm;font-size:7.4pt;font-weight:600;letter-spacing:.22em;color:#6b7280}',

    /* 정보 */
    '.dgi-info{display:grid;grid-template-columns:1fr 92mm;gap:8mm;align-items:start}',
    '.dgi-meta p{font-size:9pt;font-weight:600;margin-bottom:1.2mm}',
    '.dgi-meta b{font-weight:800}',
    '.dgi-to{margin-top:5mm;border-bottom:1.6px solid #111827;padding-bottom:1.6mm;max-width:76mm}',
    '.dgi-to-name{font-size:13pt;font-weight:800}',
    '.dgi-to-name span{font-weight:700;margin-left:1mm}',
    '.dgi-to-rep{font-size:8pt;color:#374151;margin-top:.8mm}',
    '.dgi-lead{font-size:8.6pt;color:#374151;margin-top:4.6mm}',
    '.dgi-sup{width:100%;border-collapse:collapse;font-size:7.6pt;table-layout:fixed}',
    '.dgi-sup td,.dgi-sup th{border:1px solid #111827;padding:1.6mm 1.4mm;text-align:center;vertical-align:middle}',
    '.dgi-sup th{font-weight:700;background:#fff}',
    '.dgi-sup .dgi-sup-v{writing-mode:vertical-rl;text-orientation:upright;letter-spacing:.3em;font-weight:800;width:7mm;padding:1mm}',
    '.dgi-sup .dgi-strong{font-weight:800}',
    '.dgi-sup .dgi-left{text-align:left;font-size:7pt}',

    /* 합계 상자 */
    '.dgi-total{margin-top:6mm;border:1px solid #111827;background:#f8fafc;display:flex;justify-content:space-between;align-items:center;padding:4.2mm 4.6mm}',
    '.dgi-total span{font-size:10pt;font-weight:800}',
    '.dgi-total small{font-weight:600;color:#6b7280;font-size:8pt}',
    '.dgi-total strong{font-size:17pt;font-weight:800;letter-spacing:-.01em}',

    /* 구조 표시 칩 */
    '.dgi-chips{list-style:none;display:flex;gap:2mm;margin-top:2.6mm}',
    '.dgi-chips li{flex:1;border:1px solid #cbd5e1;border-radius:1.4mm;padding:1.5mm 2mm;font-size:6.9pt;font-weight:700;color:#1f2937;text-align:center;background:#fff}',
    '.dgi-chips li b{color:#15803d}',

    /* 품목표 */
    '.dgi-items{width:100%;border-collapse:collapse;margin-top:4mm;font-size:8pt;table-layout:fixed}',
    '.dgi-items th,.dgi-items td{border:1px solid #111827;padding:2mm 2.2mm;vertical-align:middle}',
    '.dgi-items thead th{background:#f8fafc;font-weight:800;text-align:center;font-size:7.8pt}',
    '.dgi-items .c{text-align:center}',
    '.dgi-items .r{text-align:right;font-variant-numeric:tabular-nums}',
    '.dgi-items .b{font-weight:800}',
    '.dgi-items td.dgi-name{font-weight:700;font-size:8.3pt}',
    '.dgi-items .dgi-name small{display:block;font-weight:500;font-size:6.6pt;color:#6b7280;margin-top:.6mm}',
    '.dgi-items tr.dgi-sec td{background:#f1f5f9;font-weight:800;font-size:7.6pt;padding:1.4mm 2.2mm;border-left:1px solid #111827;border-right:1px solid #111827}',
    '.dgi-items tr.dgi-sec td span{font-weight:600;color:#475569;margin-left:2mm;font-size:6.8pt}',
    '.dgi-items tfoot td{background:#f8fafc;font-weight:800;font-size:9.2pt;padding:3mm 2.2mm}',

    /* 청구 구성 */
    '.dgi-breakdown{margin-top:3mm;display:grid;grid-template-columns:1fr 1fr 1fr;border:1px solid #111827}',
    '.dgi-breakdown div{padding:2.2mm 2.6mm;border-right:1px solid #111827}',
    '.dgi-breakdown div:last-child{border-right:0;background:#f0fdf4}',
    '.dgi-breakdown p{font-size:6.8pt;color:#475569;font-weight:600}',
    '.dgi-breakdown strong{display:block;font-size:10pt;font-weight:800;margin-top:.6mm;font-variant-numeric:tabular-nums}',
    '.dgi-breakdown em{display:block;font-style:normal;font-size:6.3pt;color:#64748b;margin-top:.4mm}',

    /* 안내사항 */
    '.dgi-notice{margin-top:4mm;border:1px solid #111827;padding:3.2mm 4.4mm}',
    '.dgi-notice h3{font-size:8.6pt;font-weight:800;text-decoration:underline;text-underline-offset:2px;margin-bottom:1.6mm}',
    '.dgi-notice ol{padding-left:4mm}',
    '.dgi-notice li{font-size:7.1pt;color:#1f2937;margin-bottom:.9mm;line-height:1.5}',
    '.dgi-notice li b{font-weight:800}',

    /* 바닥 */
    '.dgi-foot{margin-top:auto;padding-top:3mm;display:flex;justify-content:center;align-items:center;position:relative}',
    '.dgi-brand{font-size:8.4pt;font-weight:800;font-style:italic;letter-spacing:.32em;color:#9ca3af}',
    '.dgi-pno{position:absolute;right:0;font-size:7pt;color:#9ca3af}',

    /* 2페이지 */
    '.dgi-p2{padding-top:11mm}',
    '.dgi-p2-head{display:flex;align-items:center;gap:4mm;border-bottom:2.2px solid #111827;padding-bottom:2.6mm}',
    '.dgi-p2-head img{height:11mm;width:auto}',
    '.dgi-p2-head h2{font-size:13.4pt;font-weight:800;letter-spacing:-.01em}',
    '.dgi-p2-head p{font-size:6.9pt;color:#4b5563;margin-top:.6mm}',
    '.dgi-parties{display:grid;grid-template-columns:1fr 1fr;gap:2mm;margin-top:2.6mm}',
    '.dgi-parties div{border:1px solid #cbd5e1;border-radius:1.2mm;padding:1.6mm 2.4mm;font-size:6.9pt;line-height:1.5}',
    '.dgi-parties b{display:block;font-size:6.4pt;color:#64748b;font-weight:700}',
    '.dgi-parties strong{font-weight:800;font-size:7.6pt}',
    '.dgi-flow{list-style:none;display:grid;grid-template-columns:repeat(5,1fr);gap:2.4mm;margin-top:2.6mm;counter-reset:f}',
    '.dgi-flow li{position:relative;border:1px solid #111827;border-radius:1.2mm;padding:1.5mm 1.8mm;background:#f8fafc;counter-increment:f}',
    '.dgi-flow li:not(:last-child):after{content:"";position:absolute;right:-2.2mm;top:50%;width:0;height:0;border-left:1.6mm solid #111827;border-top:1.2mm solid transparent;border-bottom:1.2mm solid transparent;transform:translateY(-50%)}',
    '.dgi-flow b{display:block;font-size:6.9pt;font-weight:800}',
    '.dgi-flow b:before{content:counter(f) ". ";color:#15803d}',
    '.dgi-flow span{display:block;font-size:5.9pt;color:#475569;line-height:1.4;margin-top:.4mm}',
    '.dgi-clauses{column-count:2;column-gap:5mm;margin-top:3mm;font-size:6.45pt;line-height:1.5;color:#111827;text-align:left}',
    '.dgi-clause{break-inside:avoid-column;margin-bottom:1.5mm}',
    '.dgi-clause h4{font-size:6.9pt;font-weight:800;margin:0 0 .3mm}',
    '.dgi-clause p{margin:0 0 .3mm}',
    '.dgi-clause ol{margin:.2mm 0 0 3.6mm;padding:0}',
    '.dgi-clause li{margin-bottom:.2mm}',
    '.dgi-consent{margin-top:auto;display:grid;grid-template-columns:58mm 1fr;border:1.4px solid #111827}',
    '.dgi-consent-sup{padding:2.4mm 3mm;border-right:1px solid #111827;font-size:6.9pt;line-height:1.55}',
    '.dgi-consent-sup b{display:block;font-size:6.4pt;color:#64748b;font-weight:700}',
    '.dgi-consent-sup strong{font-size:8.4pt;font-weight:800}',
    '.dgi-consent-rec{padding:2.2mm 3mm}',
    '.dgi-consent-rec h4{font-size:7.2pt;font-weight:800;margin:0 0 1mm;display:flex;justify-content:space-between;align-items:center}',
    '.dgi-consent-rec h4 em{font-style:normal;font-size:6.4pt;font-weight:800;padding:.4mm 1.6mm;border-radius:1mm}',
    '.dgi-ok{background:#dcfce7;color:#166534}',
    '.dgi-no{background:#fee2e2;color:#991b1b}',
    '.dgi-consent-rec table{width:100%;border-collapse:collapse;font-size:6.4pt}',
    '.dgi-consent-rec th{text-align:left;color:#64748b;font-weight:700;width:24mm;padding:.35mm 0;vertical-align:top}',
    '.dgi-consent-rec td{font-weight:600;padding:.35mm 0;word-break:break-all}',
    '.dgi-consent-empty{font-size:7pt;color:#991b1b;font-weight:700;line-height:1.6;padding-top:1mm}',
    '.dgi-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:5.5pt;letter-spacing:-.01em}',

    /* 화면에서 볼 때 */
    '@media screen{.dgi-doc .dgi-page{margin:0 auto 18px;box-shadow:0 10px 30px rgba(15,23,42,.14)}}',
    /* 인쇄 */
    '@media print{@page{size:A4;margin:0}html,body{margin:0;padding:0;background:#fff}.dgi-page{break-after:page;page-break-after:always;box-shadow:none;margin:0}.dgi-page:last-child{break-after:auto;page-break-after:auto}.dgi-noprint{display:none!important}}'
  ].join('\n');

  /* ---------- 1페이지 ---------- */
  function page1(n, opt) {
    var t = n.totals, s = n.supplier, c = n.client;
    var logo = absUrl(opt.logoUrl || DEFAULTS.logoUrl);

    var groups = [
      { kind: 'service', title: 'A. 브랜드 개발 컨설팅 용역', note: 'Brand Development Consulting · 용역 대가' },
      { kind: 'supply', title: 'B. On-Demand 공급 준비금', note: '의뢰 브랜드 전용 생산 준비 · 제품 소유권 ' + s.name + ' (이전되지 않음)' },
      { kind: 'discount', title: 'C. 할인', note: '' }
    ];
    var no = 0;
    var rows = groups.map(function (g) {
      var list = n.items.filter(function (i) { return i.kind === g.kind; });
      if (!list.length) return '';
      return '<tr class="dgi-sec"><td colspan="6">' + esc(g.title) + (g.note ? '<span>' + esc(g.note) + '</span>' : '') + '</td></tr>' +
        list.map(function (i) {
          no += 1;
          return '<tr>' +
            '<td class="c">' + no + '</td>' +
            '<td class="dgi-name">' + esc(i.name) + (i.sub ? '<small>' + esc(i.sub) + '</small>' : '') + '</td>' +
            '<td class="c">' + esc(i.qty) + '</td>' +
            '<td class="c">' + esc(i.unit) + '</td>' +
            '<td class="r">' + money(i.price) + '</td>' +
            '<td class="r b">' + money(i.amount) + '</td></tr>';
        }).join('');
    }).join('');

    var unitTxt = t.unitCredit != null ? 'NZ$' + t.unitCredit.toFixed(2) : '인보이스 기재 공급단가';
    var discTxt = t.discount ? ('할인 ' + money(t.discount) + ' 반영' + (t.discountOnSupply ? ' (준비금에서 ' + money(-t.discountOnSupply) + ')' : '')) : '할인 없음';

    return '' +
      '<section class="dgi-page">' +
        '<header class="dgi-head">' +
          (logo ? '<img class="dgi-logo" src="' + esc(logo) + '" alt="' + esc(s.name) + '">' : '<span></span>') +
          '<div class="dgi-titlewrap"><h1 class="dgi-title">인보이스</h1><div class="dgi-subtitle">BRAND DEVELOPMENT CONSULTING INVOICE</div></div>' +
          '<span></span>' +
        '</header>' +
        '<div class="dgi-info">' +
          '<div class="dgi-meta">' +
            '<p><b>No.</b> ' + esc(n.orderNo) + '</p>' +
            '<p><b>Date.</b> ' + koDate(n.issueDate) + '</p>' +
            '<p><b>유효기간.</b> ' + koDate(n.validUntil) + '까지</p>' +
            '<p><b>Email :</b> ' + esc(s.email) + '</p>' +
            '<div class="dgi-to"><div class="dgi-to-name">' + esc(c.company || '의뢰자') + '<span>귀하</span></div>' +
              '<div class="dgi-to-rep">' + esc(c.representative) + (c.representative ? ' · ' : '') + '의뢰자 (해외구매대행 사업자)' + (c.bizNo ? ' · ' + esc(c.bizNo) : '') + '</div></div>' +
            '<p class="dgi-lead">아래와 같이 브랜드 개발 컨설팅 용역 대금을 청구합니다.</p>' +
          '</div>' +
          '<table class="dgi-sup"><colgroup><col style="width:7mm"><col style="width:17mm"><col><col style="width:12mm"><col style="width:17mm"></colgroup>' +
            '<tr><td class="dgi-sup-v" rowspan="4">공급자</td><th>상호</th><td class="dgi-strong" colspan="3">' + esc(s.name) + '</td></tr>' +
            '<tr><th>담당</th><td class="dgi-strong">' + esc(s.manager) + '</td><th>구분</th><td>' + esc(s.role) + '</td></tr>' +
            '<tr><th>주소</th><td class="dgi-left" colspan="3">' + esc(s.address) + '</td></tr>' +
            '<tr><th>업태/비고</th><td colspan="3">' + esc(s.note) + '</td></tr>' +
          '</table>' +
        '</div>' +
        '<div class="dgi-total"><span>총 청구금액 <small>(' + esc(n.currency) + ')</small></span><strong>' + money(t.total) + '</strong></div>' +
        '<ul class="dgi-chips">' +
          '<li>OEM 제조 · 제품 매매(사입) 계약 <b>아님</b></li>' +
          '<li>제품 소유권 · 품질 · 유통기한 책임 <b>' + esc(s.name) + '</b></li>' +
          '<li>국내 판매 <b>해외구매대행</b> (소비자 명의 직배송)</li>' +
        '</ul>' +
        '<table class="dgi-items"><colgroup><col style="width:9mm"><col><col style="width:14mm"><col style="width:13mm"><col style="width:25mm"><col style="width:27mm"></colgroup>' +
          '<thead><tr><th>No</th><th>품명 및 내역</th><th>수량</th><th>단위</th><th>단가 (' + esc(n.currency) + ')</th><th>금액 (' + esc(n.currency) + ')</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
          '<tfoot><tr><td colspan="5" class="c">총계</td><td class="r">' + money(t.total) + '</td></tr></tfoot>' +
        '</table>' +
        '<div class="dgi-breakdown">' +
          '<div><p>A. 브랜드 개발 컨설팅 용역</p><strong>' + money(t.serviceNet) + '</strong><em>' + esc(discTxt) + '</em></div>' +
          '<div><p>B. On-Demand 공급 준비금</p><strong>' + money(t.supplyNet) + '</strong><em>소유권 ' + esc(s.name) + ' · 주문 건별 충당</em></div>' +
          '<div><p>충당 기준 (소비자 주문 1EA당)</p><strong>' + esc(unitTxt) + '</strong><em>준비 수량 ' + esc(t.prepQty || '-') + 'EA 기준</em></div>' +
        '</div>' +
        '<div class="dgi-notice"><h3>[ 안내사항 ]</h3><ol>' +
          '<li>본 인보이스는 <b>브랜드 개발 컨설팅 용역 대가와 On-Demand 공급 준비금</b>에 대한 청구서이며, OEM 제조 위탁 · 제품 매매(사입) 대금이 아닙니다.</li>' +
          '<li>대금을 지급해도 <b>제품 소유권은 의뢰자에게 이전되지 않습니다.</b> 제품은 ' + esc(s.name) + ' 명의로 제조되어 뉴질랜드 현지 물류센터(' + esc(n.vars.threePL) + ')에 보관되며, 품질 · 유통기한 책임은 ' + esc(s.name) + '에 있습니다.</li>' +
          '<li>공급 준비금은 국내 소비자 주문 건별로 <b>1EA당 ' + esc(unitTxt) + '씩</b> 해당 주문의 물품대금에 충당되며, 소유권은 출고 시점에 ' + esc(s.name) + '에서 주문 소비자에게 직접 이전됩니다.</li>' +
          '<li>본 인보이스는 발행일로부터 ' + esc(n.validDays) + '일간 유효하며, 생산 준비는 대금 확인 후 진행됩니다. 원료 수급 · 환율에 따라 금액이 일부 조정될 수 있습니다.</li>' +
          '<li>거래 구조와 당사자 의무는 2페이지 「' + esc(A.shortTitle) + '」에 따르며, 의뢰자의 전자 동의 기록이 함께 인쇄됩니다.</li>' +
        '</ol></div>' +
        '<footer class="dgi-foot"><span class="dgi-brand">' + esc(s.name) + '</span><span class="dgi-pno">1 / 2</span></footer>' +
      '</section>';
  }

  /* ---------- 2페이지 ---------- */
  function clausesHTML(vars) {
    return A.clauses.map(function (c) {
      return '<div class="dgi-clause"><h4>' + esc(c.t) + '</h4>' +
        (c.p || []).map(function (p) { return '<p>' + esc(A.fill(p, vars)) + '</p>'; }).join('') +
        (c.list ? '<ol>' + c.list.map(function (l) { return '<li>' + esc(A.fill(l, vars)) + '</li>'; }).join('') + '</ol>' : '') +
        '</div>';
    }).join('');
  }

  function consentHTML(n, rec) {
    if (!rec) {
      return '<div class="dgi-consent-rec"><h4>의뢰자 전자 동의 기록 <em class="dgi-no">동의 전</em></h4>' +
        '<p class="dgi-consent-empty">이 출력본은 의뢰자가 거래 구조 확인서에 전자 동의하기 전의 미리보기입니다.<br>' +
        '두고커넥트 의뢰자 센터에서 「동의하고 PDF 다운로드」를 거친 출력본에만 동의 기록이 인쇄됩니다.</p></div>';
    }
    var cl = rec.client || {};
    var reg = cl.importFoodRegNo ? esc(cl.importFoodRegNo) : (cl.importFoodRegPending ? '등록 전 — 판매 시작 전 등록 약속' : '-');
    var checks = (rec.checks || []).filter(function (c) { return c.agreed; }).length;
    return '<div class="dgi-consent-rec"><h4>의뢰자 전자 동의 기록 <em class="dgi-ok">동의 완료</em></h4><table>' +
      '<tr><th>동의 ID</th><td class="dgi-mono">' + esc(rec.id) + '</td></tr>' +
      '<tr><th>동의 일시</th><td>' + esc(rec.agreedAtKST || kstString(rec.agreedAt)) + '</td></tr>' +
      '<tr><th>의뢰자</th><td>' + esc(cl.company) + ' · 대표 ' + esc(cl.representative) + ' · 사업자등록번호 ' + esc(cl.bizNo) + '</td></tr>' +
      '<tr><th>구매대행업 등록</th><td>' + reg + '</td></tr>' +
      (rec.account && (rec.account.email || rec.account.id) ? '<tr><th>동의 계정</th><td>' + esc(rec.account.email || rec.account.id) + '</td></tr>' : '') +
      '<tr><th>동의 내용</th><td>항목별 동의 ' + checks + '/' + A.checks.length + ' · 확인 문구 “' + esc(rec.phrase) + '” 직접 입력 · 확인서 전문 끝까지 읽음</td></tr>' +
      '<tr><th>동의 문서</th><td>' + esc(rec.docTitle || A.title) + ' v' + esc(rec.docVersion) + '</td></tr>' +
      '<tr><th>문서 지문</th><td class="dgi-mono">SHA-256 ' + esc(rec.docHash) + '</td></tr>' +
      '</table></div>';
  }

  function page2(n, opt) {
    var s = n.supplier, c = n.client, rec = opt.consent || null;
    var logo = absUrl(opt.logoUrl || DEFAULTS.logoUrl);
    var flow = A.flow.map(function (f) {
      return '<li><b>' + esc(A.fill(f.t, n.vars)) + '</b><span>' + esc(A.fill(f.d, n.vars)) + '</span></li>';
    }).join('');
    var cc = rec && rec.client ? rec.client : c;
    return '' +
      '<section class="dgi-page dgi-p2">' +
        '<header class="dgi-p2-head">' + (logo ? '<img src="' + esc(logo) + '" alt="">' : '') +
          '<div><h2>' + esc(A.title) + '</h2>' +
          '<p>본 확인서는 인보이스 No. ' + esc(n.orderNo) + '의 일부이며, 의뢰자의 전자 동의로 효력이 생깁니다. · 문서 버전 v' + esc(A.version) + ' (' + esc(A.effectiveDate) + ')</p></div>' +
        '</header>' +
        '<div class="dgi-parties">' +
          '<div><b>공급자 · 해외 제조 · 판매원 (이하 “두고바이오”)</b><strong>' + esc(s.name) + '</strong> · 담당 ' + esc(s.manager) + '<br>' + esc(s.address) + '</div>' +
          '<div><b>의뢰자 · 해외구매대행 사업자 (이하 “의뢰자”)</b><strong>' + esc(cc.company || '-') + '</strong> · 대표 ' + esc(cc.representative || '-') + '<br>사업자등록번호 ' + esc(cc.bizNo || '-') + '</div>' +
        '</div>' +
        '<ol class="dgi-flow">' + flow + '</ol>' +
        '<div class="dgi-clauses">' + clausesHTML(n.vars) + '</div>' +
        '<div class="dgi-consent">' +
          '<div class="dgi-consent-sup"><b>공급자 확인</b><strong>' + esc(s.name) + '</strong><br>담당 ' + esc(s.manager) + '<br>발행일 ' + koDate(n.issueDate) + '<br>위 거래 구조로 브랜드 개발 컨설팅 용역 및 On-Demand 해외 공급을 수행합니다.</div>' +
          consentHTML(n, rec) +
        '</div>' +
        '<footer class="dgi-foot"><span class="dgi-brand">' + esc(s.name) + '</span><span class="dgi-pno">2 / 2</span></footer>' +
      '</section>';
  }

  /* ---------- 공개 API ---------- */
  function pagesHTML(data, opt) {
    opt = opt || {};
    var rc = opt.consent && opt.consent.client;
    if (rc) { // 동의할 때 입력한 의뢰자 정보를 인보이스에도 그대로 씁니다
      data = Object.assign({}, data, { client: Object.assign({}, data && data.client, {
        company: rc.company || (data.client || {}).company,
        representative: rc.representative || (data.client || {}).representative,
        bizNo: rc.bizNo || (data.client || {}).bizNo
      }) });
    }
    var n = normalize(data);
    return '<div class="dgi-doc">' + page1(n, opt) + page2(n, opt) + '</div>';
  }

  function docTitle(data) {
    return '인보이스_' + ((data && data.orderNo) || 'DOOGOBIO');
  }

  function buildHTML(data, opt) {
    opt = opt || {};
    var font = opt.fontCssUrl === false ? '' : absUrl(opt.fontCssUrl || DEFAULTS.fontCssUrl);
    var autoPrint = opt.autoPrint !== false;
    return '<!doctype html><html lang="ko"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(docTitle(data)) + '</title>' +
      (font ? '<link rel="stylesheet" href="' + esc(font) + '">' : '') +
      '<style>' + CSS + '\nbody{margin:0;background:#e5e7eb}' +
      '.dgi-bar{position:sticky;top:0;z-index:2;display:flex;gap:10px;justify-content:center;align-items:center;padding:10px;background:#111827;color:#fff;font:600 13px/1.4 "Pretendard Variable",Pretendard,sans-serif}' +
      '.dgi-bar button{font:inherit;border:0;border-radius:8px;padding:8px 14px;background:#3b82f6;color:#fff;cursor:pointer}' +
      '@media screen{.dgi-doc{padding:18px 0}}</style></head><body>' +
      '<div class="dgi-bar dgi-noprint">인쇄 창에서 대상(프린터)을 <b>「PDF로 저장」</b>으로 고르면 PDF 파일로 저장됩니다. <button type="button" onclick="window.print()">인쇄 / PDF로 저장</button></div>' +
      pagesHTML(data, opt) +
      (autoPrint ? '<script>(function(){function go(){setTimeout(function(){window.focus();window.print();},200);}' +
        'window.addEventListener("load",function(){var f=document.fonts&&document.fonts.ready;(f?f.then(go,go):go());});})();<\/script>' : '') +
      '</body></html>';
  }

  /* 반드시 클릭(사용자 동작) 안에서 바로 부르세요 — 팝업 차단을 피하려고 창을 먼저 엽니다 */
  function openWindow(data) {
    var w = null;
    try { w = window.open('', '_blank'); } catch (e) { w = null; }
    if (w && w.document) {
      try {
        w.document.open();
        w.document.write('<!doctype html><meta charset="utf-8"><title>' + esc(docTitle(data)) + '</title>' +
          '<body style="margin:0;display:grid;place-items:center;height:100vh;font:600 15px/1.5 sans-serif;color:#334155">인보이스 PDF를 준비하고 있어요…</body>');
        w.document.close();
      } catch (e) { /* 무시 */ }
    }
    return w;
  }

  /* 새 창이 막혔을 때: 숨은 iframe 으로 인쇄 */
  function printViaIframe(html) {
    var f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    var d = f.contentWindow.document;
    d.open(); d.write(html); d.close();
    setTimeout(function () { try { document.body.removeChild(f); } catch (e) { /* 무시 */ } }, 60000);
  }

  function writeAndPrint(w, data, opt) {
    var html = buildHTML(data, opt);
    if (w && !w.closed && w.document) {
      w.document.open(); w.document.write(html); w.document.close();
      return w;
    }
    printViaIframe(html);
    return null;
  }

  var cssInjected = false;
  function injectCSS() {
    if (cssInjected || typeof document === 'undefined') return;
    var st = document.createElement('style');
    st.setAttribute('data-doogo-invoice', A.version);
    st.textContent = CSS;
    document.head.appendChild(st);
    cssInjected = true;
  }

  /* 화면 미리보기 — 부모 너비에 맞게 자동 축소 */
  function renderInto(el, data, opt) {
    if (!el) return;
    injectCSS();
    el.innerHTML = pagesHTML(data, opt);
    var doc = el.querySelector('.dgi-doc');
    function fit() {
      var pagePx = 210 * 96 / 25.4; // 793.7px
      var avail = el.clientWidth - 8;
      var z = Math.min(1, avail / pagePx);
      doc.style.zoom = z > 0 ? String(z) : '1';
    }
    fit();
    if (!el.__dgiFit) {
      el.__dgiFit = true;
      window.addEventListener('resize', function () {
        var d = el.querySelector('.dgi-doc');
        if (d) { doc = d; fit(); }
      });
    }
  }

  root.DoogoInvoice = {
    version: A.version,
    normalize: normalize,
    pagesHTML: pagesHTML,
    buildHTML: buildHTML,
    renderInto: renderInto,
    openWindow: openWindow,
    writeAndPrint: writeAndPrint,
    money: money,
    kstString: kstString
  };
})(typeof window !== 'undefined' ? window : globalThis);
