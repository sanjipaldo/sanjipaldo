# DOOGO CONNECT — 구매대행용 인보이스 + PDF 다운로드 전 동의 팝업

doogoconnect.com 의뢰자 센터의 「견적서 미리보기 → 견적서 PDF 다운로드」에 붙여 쓰는 모듈입니다.
프레임워크 없이 순수 JavaScript라서 React·Next·일반 HTML 어디에나 붙일 수 있습니다.

| 파일 | 하는 일 |
|---|---|
| `agreement.js` | 「On-Demand 해외공급 · 구매대행 거래 구조 확인서」 문안 (조항 14개 · 동의 항목 7개 · 확인 문구). **팝업과 PDF 2페이지가 이 파일 하나를 같이 씁니다.** |
| `invoice.js` | A4 2페이지 인보이스 — 1페이지 인보이스 / 2페이지 거래 구조 확인서 + 전자 동의 기록 |
| `consent.js` | PDF 다운로드 전 동의 팝업 + 동의 기록 + 인쇄(PDF로 저장) 창 |
| `assets/doogobio-logo.png` | 기존 견적서 PDF에서 뽑은 DOOGOBIO 로고 (투명 배경) |
| `demo.html` | 기존 「견적서 미리보기」 창을 흉내 낸 데모 |

데모 실행: 저장소 맨 위 폴더에서 `python3 -m http.server 4173` → `http://localhost:4173/doogo-connect/invoice-consent/demo.html`

---

## 1. 무엇이 바뀌나

### 1페이지 — 견적서(OEM) → 브랜드 개발 컨설팅 인보이스

| 예전 견적서 | 새 인보이스 |
|---|---|
| 제목 `견 적 서` | `인 보 이 스` · BRAND DEVELOPMENT CONSULTING INVOICE |
| 구분 `제조사` · 업태 `제조 관련 공급 견적` | 구분 `해외 제조·판매원` · 업태 `브랜드 개발 컨설팅 · On-Demand 해외 공급` |
| 품목이 한 표에 섞여 있음 | **A. 브랜드 개발 컨설팅 용역** (디자인 패키지 등) / **B. On-Demand 공급 준비금** (제품·용기 — *소유권 DOOGOBIO NZ, 이전되지 않음*) / **C. 할인** |
| 합계만 | 합계 + 청구 구성(A·B) + **소비자 주문 1EA당 충당 공급단가** (예: NZ$12.91) |
| 일반 안내사항 | "OEM·사입 대금 아님 / 소유권 미이전 / 주문 건별 충당 / 2페이지 확인서에 따름" |

할인은 **컨설팅 용역비(A)에서 먼저** 빼고, 남는 경우에만 공급 준비금(B)에서 뺍니다. 그래서 예시 견적($1,701.90)도 총액은 그대로이고 1EA당 공급단가가 NZ$12.91로 깔끔하게 나옵니다.

### 2페이지 — 거래 구조 확인서 (새로 생김)

거래 흐름 5단계 그림 + 조항 14개 + **의뢰자 전자 동의 기록**(동의 ID · 일시(KST) · 상호/대표/사업자번호 · 구매대행업 등록번호 · 7/7 동의 · 확인 문구 · 문서 버전 · SHA-256 지문)이 인쇄됩니다.
동의를 거치지 않은 출력본(관리자 미리보기 등)에는 "동의 전 — 효력 없음" 표시가 나옵니다.

### 다운로드 전 팝업 — 나중에 "몰랐다"를 막는 장치

화면 전체를 쓰는 팝업입니다. 넓은 화면(가로 1100px·세로 700px 이상)에서는 왼쪽에 확인서 전문, 오른쪽에 동의 항목·입력칸이 나란히 보이고 각각 따로 스크롤됩니다. 태블릿·휴대폰에서는 한 줄로 이어집니다. (`sample/consent-popup.png`, `sample/consent-popup-mobile.png`)

1. 확인서 전문을 **끝까지 스크롤해야** 체크박스가 열립니다 (읽은 시각 기록).
2. 동의 7개를 **하나씩 직접** 체크 — "전체 동의" 버튼은 일부러 없습니다.
3. 상호 · 대표자 · 사업자등록번호 · 구매대행업 영업등록번호(또는 "판매 전 등록 약속") 입력.
4. 확인 문구 `구매대행 구조에 동의합니다`를 **직접 타이핑** (붙여넣기 막음).
5. 동의 기록이 저장되고, 그 기록이 박힌 PDF가 열립니다. 같은 주문은 다음부터 팝업 없이 바로 열립니다.
6. 「동의하지 않음」이면 PDF를 받을 수 없습니다.

---

## 2. 사이트에 붙이는 법

### 스크립트 불러오기 (순서 중요)

```html
<script src="/invoice-consent/agreement.js"></script>
<script src="/invoice-consent/invoice.js"></script>
<script src="/invoice-consent/consent.js"></script>
```

`assets/doogobio-logo.png`는 `invoice.js`와 같은 폴더 기준 `assets/`에서 찾습니다. 다른 곳에 두면 `print.logoUrl`로 알려 주세요.

### 「견적서 PDF 다운로드」 버튼

```js
downloadButton.onclick = function () {
  // ⚠ 클릭 처리 안에서 바로 부르세요 (새 창 팝업 차단 방지). await 뒤에 부르면 막힐 수 있습니다.
  DoogoConsent.downloadInvoice(invoiceData, {
    account: { id: user.id, email: user.email },
    existingRecord: order.consentRecord || null,   // 서버에 저장된 이 주문의 동의 기록 (없으면 null)
    onRecord: function (record) {                  // 동의 기록을 서버에 저장 — 꼭 연결하세요
      return fetch('/api/consents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      }).then(function (r) {
        if (!r.ok) throw new Error('저장 실패 ' + r.status);
        return r.json(); // { serverId, serverAt, ip } 등을 돌려주면 record 에 합쳐져 PDF 에도 남습니다
      });
    },
    onDone: function (record) { /* 미리보기 새로 그리기 등 */ }
  });
};
```

`onRecord`가 실패하면 팝업에 오류가 뜨고 PDF는 열리지 않습니다(기록 없는 PDF가 나가지 않게).

### React에서

```jsx
<button onClick={() => window.DoogoConsent.downloadInvoice(toInvoiceData(order), { account, existingRecord: order.consentRecord ?? null, onRecord: saveConsent })}>
  인보이스 PDF 다운로드
</button>
```

### 미리보기 창 안의 종이 모양

```js
DoogoInvoice.renderInto(document.querySelector('#preview'), invoiceData, { consent: recordOrNull });
```

### 관리자 쪽 「인쇄 및 저장 (PDF)」 (동의 팝업 없이)

```js
btn.onclick = function () {
  var w = DoogoInvoice.openWindow(invoiceData);                 // 클릭 순간에 창 먼저
  DoogoInvoice.writeAndPrint(w, invoiceData, { consent: order.consentRecord || null });
};
```

### 인보이스 데이터 (`invoiceData`)

```js
{
  orderNo: 'ORD-159765485267',
  issueDate: '2026-11-03',          // 'YYYY-MM-DD' 또는 Date
  validDays: 7,
  currency: 'NZD',
  productTitle: '100% 뉴질랜드 프로폴리스 익스트렉트 리퀴드 (알콜프리) 25ml',
  supplier: { name: 'DOOGOBIO NZ', manager: 'DOOGO CONNECT', role: '해외 제조·판매원',
              address: '3F, 10 Piermark Drive, Auckland', email: 'doogobio.bill@gmail.com',
              note: '브랜드 개발 컨설팅 · On-Demand 해외 공급' },
  client:   { company: '산지팔도', representative: '문원오', bizNo: '' },
  logistics:{ threePL: 'ACI EXPRESS' },
  court: '서울중앙지방법원',          // 제14조 관할 법원 (선택)
  prepQty: 100,                     // 공급 준비 수량 (없으면 EA 품목 중 가장 큰 수량)
  items: [
    { kind: 'service',  name: '[일반] 전체 디자인 패키지_알뜰패키지 A', sub: '디자인 패키지', qty: 1,   unit: 'SET', price: 600 },
    { kind: 'supply',   name: '100% 뉴질랜드 프로폴리스 … 25ml',         sub: 'DOOGOBIO NZ',  qty: 100, unit: 'EA',  price: 9.41 },
    { kind: 'supply',   name: '라벨 + 단상자 (3.50)',                    sub: '용기/포장 옵션', qty: 100, unit: 'EA', price: 3.50 },
    { kind: 'discount', name: '수강생 할인', sub: '제품, 용기, 디자인 포함 전체 10% 할인', qty: 1, unit: 'SET', price: -189.10 }
  ]
}
```

`kind`를 안 넣으면 자동으로 정합니다: 금액이 음수이거나 이름에 '할인' → `discount`, 단위 `EA` → `supply`, 그 밖(`SET` 등) → `service`.
지금 사이트의 견적 품목을 그대로 넘겨도 예시처럼 나뉩니다.

### 동의 기록 (`record`) — 서버에 그대로 저장하세요

```js
{
  id: 'DGC-20261103-XBUOJ', type: 'doogo-connect.ondemand-structure-consent',
  orderNo, docTitle, docVersion: '1.0', docEffectiveDate, docHash /* SHA-256 */, vars,
  client: { company, representative, bizNo, importFoodRegNo, importFoodRegPending },
  account, checks: [{ id, text, agreed: true } × 7], phrase,
  readToEnd: true, openedAt, readAt, agreedAt, agreedAtKST, timezone, userAgent, pageUrl
}
```

서버에서는 여기에 **서버 시각과 접속 IP를 붙여 저장**하고, 지우거나 고칠 수 없게(추가만 되게) 보관하는 것을 권합니다.
브라우저 `localStorage`에도 사본을 남기지만, 이건 같은 브라우저에서 팝업을 다시 안 띄우기 위한 것일 뿐 증거 보관용이 아닙니다.

### 문안을 고칠 때

`agreement.js`의 글자를 바꾸면 **`version`을 꼭 올리세요.** 버전이 바뀌면 모든 의뢰자에게 팝업이 다시 뜨고, 예전 동의 기록에는 예전 버전·지문이 남습니다.
서버에서 문서 지문을 검증하려면 `DoogoConsent.hash(vars)`와 같은 방식(`agreement.js`의 `canonicalText` → SHA-256)으로 계산하면 됩니다.

---

## 3. 꼭 읽어 주세요 — 서류만으로는 구매대행이 되지 않습니다

세관·식약처·국세청은 **이름이 아니라 실제 거래 내용**을 봅니다(실질 판단).
인보이스 제목을 "컨설팅"으로 바꿔도, 실제로 의뢰자가 물건을 사서 재고를 갖고 있다가 파는 구조라면 "구매대행을 가장한 수입·판매"로 볼 수 있습니다.
그래서 이번 양식은 제품·용기 금액을 "컨설팅"으로 숨기지 않고 **공급 준비금(소유권 미이전 · 주문 건별 충당)** 으로 따로 적었습니다. 숨기는 것보다 이쪽이 실제 운영과 맞고 설명하기 쉽습니다.

확인서 문구가 힘을 가지려면, 운영이 아래처럼 실제로 돌아가야 합니다.

| 확인할 것 | 이렇게 되어 있어야 합니다 |
|---|---|
| ACI EXPRESS(3PL) 입고 명의 | **DOOGOBIO NZ 계정** (의뢰자 계정 ✕) |
| 발송 건별 상업송장 | 판매자 DOOGOBIO NZ → 구매자 **주문 소비자 본인**, 실제 거래가격(1EA당 공급단가) |
| 통관 | 소비자 이름 · 개인통관고유부호, 1건씩. 국내 사업장으로 묶어 들여오기 ✕ |
| 유통기한 지난 재고 | **DOOGOBIO NZ 비용**으로 폐기·교체 (의뢰자가 손해 보면 사실상 의뢰자 재고로 보일 수 있음) |
| 공급 준비금 | 주문마다 1EA당 금액이 차감되는 기록을 의뢰자 센터에 남기기 (제7조) |
| 제품 라벨 | 제조·판매원 **DOOGOBIO NZ (뉴질랜드 주소)** — 의뢰자를 국내 판매원으로 적지 않기 |
| 의뢰자 판매 페이지 | "해외구매대행 상품" 표시, 해외 판매자·제조국·배송·반품 조건, 효능 광고 ✕ |
| 의뢰자 자격 | 수입식품등 인터넷 구매대행업 영업등록(관할 지방식약청) · 위생교육 · 통신판매업 신고 |
| 1회 주문 수량 | 관세청 자가사용 인정기준 이내 (지금 기준 건강기능식품 6병, 면세 미화 150달러 — 바뀔 수 있으니 확인) |
| 상표 | 의뢰자가 이미 한국에 자기 이름으로 상표를 냈다면 제10조 ①과 맞지 않으니 문구 조정 필요 |

### 왜 팝업을 이렇게 만들었나

- 「약관의 규제에 관한 법률」 제3조는 사업자에게 **중요한 내용을 분명히 알리고 설명할 의무**를 줍니다. 설명하지 않은 조항은 계약 내용으로 주장할 수 없습니다.
  끝까지 읽기 · 항목별 체크 · 확인 문구 직접 입력 · 기록의 PDF 인쇄는 "설명했고, 본인이 이해하고 동의했다"는 증거를 남기기 위한 것입니다.
- 제12조 ②("다른 구조를 주장하지 않는다")에는 **두고바이오의 고의·중대한 과실은 빼는 단서**를 달았습니다. 이런 단서 없이 모든 청구를 막는 조항은 같은 법 제7조(면책조항 금지) · 제14조(소송 제기 금지) 등에 따라 무효가 될 수 있어서, 오히려 조항 전체가 약해집니다.
- 결국 분쟁을 막는 힘은 "포기한다"는 문구보다 **충분히 설명했다는 기록**과 **실제 운영이 확인서대로 돌아간다는 사실**에서 나옵니다.

### 쓰기 전에 전문가 확인을 받으세요

이 문안은 법률 자문이 아니라 초안입니다. 실제 사용 전 **관세사**(통관 구조 · 과세가격 · 자가사용 기준)와 **변호사**(약관 · 계약 효력)의 확인을, 필요하면 **세무사**(구매대행 수수료 매출 처리 · 뉴질랜드 GST)와 **변리사**(상표 명의 · 이전)의 확인도 받아 주세요.
특히 다음은 사업 방침에 따라 정해야 해서 기본값만 넣어 두었습니다.

- 제7조 ③ 남은 공급 준비금 처리 (지금: 정식 수입 대금으로 전환 또는 협의 정산)
- 제10조 ② 브랜드 권리 이전 대가 (지금: 컨설팅 용역 대가에 포함 — 추가 비용 없음)
- 제14조 관할 법원 (지금: 서울중앙지방법원 · `invoiceData.court`로 변경) — 의뢰자에게 지나치게 불리한 관할 합의는 약관규제법 제14조로 무효가 될 수 있습니다
- 계약 기간 1년 · 자동 연장
