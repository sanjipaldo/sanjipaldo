# 두고 채널 연동 서버 (쿠팡 · 스마트스토어)

두고 앱에서 **상품 전송 한 번**으로 쿠팡·스마트스토어에 상품을 등록하고, 판매중지·품절·삭제·가격/재고 변경을 자동으로 반영하는 서버입니다.

브라우저(두고 앱)는 쇼핑몰 API를 직접 부를 수 없습니다. 두 쇼핑몰 모두 **등록된 서버 IP·서명**이 필요하고, 브라우저 호출(CORS)을 막기 때문입니다. 그래서 요청은 이렇게 흐릅니다.

```
두고 앱  ──▶  두고 채널 연동 서버  ──▶  쿠팡 OPEN API / 네이버 커머스API
```

## 쇼핑몰별 규칙

| 두고 동작 | 스마트스토어 | 쿠팡 |
|---|---|---|
| 상품 전송 | 이미지 업로드(`/v1/product-images/upload`) → 상품 등록(`POST /v2/products`), 바로 판매중 | 상품 생성(`POST …/seller-products`, `requested=true`로 승인 요청) → 승인되면 옵션ID(vendorItemId) 생성 |
| 판매중지 | `change-status` SUSPENSION | 옵션마다 `sales/stop` |
| 품절 | `change-status` OUTOFSTOCK (재고 0) | 옵션마다 재고 0 (`quantities/0`) |
| 판매 재개 | `change-status` SALE | 옵션마다 `sales/resume` + 재고 |
| 삭제 | **상품 삭제** (`DELETE /v2/products/origin-products/{번호}`) | 판매중지 + 재고 0 후 삭제 시도. **승인된 상품은 쿠팡이 삭제를 허용하지 않아** 판매중지로 남깁니다 |
| 가격·재고 | 원상품 조회 후 수정(`PUT`) | 옵션마다 `prices/{가격}`, `quantities/{재고}` |

**CAFE24(자사몰)** — Admin API `https://{mall_id}.cafe24api.com/api/v2/admin`

| 두고 동작 | CAFE24 |
|---|---|
| 연결 | 셀러는 **쇼핑몰 ID만** 입력 → CAFE24 관리자에서 두고마켓 앱 **권한 동의**(OAuth) → 서버가 토큰을 받아 암호화 보관 (access 2시간·refresh 2주, 자동 갱신) |
| 상품 전송 | 이미지 업로드(`POST /products/images`) → 상품 등록(`POST /products`, 진열·판매함) → 품목(variant)별 추가금·재고 |
| 판매중지 / 품절 / 재개 | `selling=F` / 품목 재고 0 / `selling=T, display=T` + 재고 |
| 삭제 | 상품 삭제(`DELETE /products/{번호}`) — 자사몰이라 바로 지워짐 |
| 주문 수집 · 확인 · 송장 | 결제완료(N10) 주문 조회 → 상품준비중(N20) → `POST /orders/{주문번호}/shipments` (CAFE24 택배사 코드) |

## 운영 전에 두고가 해야 할 일

1. **네이버 커머스API**: 두고를 **커머스솔루션** 또는 **API 대행사**로 등록합니다.
   셀러의 '내 스토어 애플리케이션' 아이디·시크릿을 받아 쓰는 방식은 네이버 정책상 금지입니다.
   등록한 두고 애플리케이션의 `client_id`, `client_secret`을 서버 환경변수로 넣고,
   셀러는 스마트스토어센터에서 두고 연동을 승인한 뒤 **판매자 아이디(account_id)**만 두고에 입력합니다.
   토큰은 `type=SELLER`, `account_id=셀러 아이디`로 발급합니다.
2. **쿠팡 OPEN API**: 두고를 쿠팡 **OPEN API 연동업체**로 등록하고 서버 고정 IP를 등록합니다.
   셀러는 Wing > 판매자정보 > 추가판매정보 > OPEN API 키 발급에서 연동업체 '두고마켓'을 고르고
   **업체코드(vendorId) · Access Key · Secret Key · Wing 아이디**를 두고에 입력합니다.
3. **CAFE24**: CAFE24 개발자센터에 두고마켓 앱을 등록하고 `client_id`·`client_secret`·돌아올 주소(redirect URI)를 서버 환경변수로 넣습니다.
   셀러의 CAFE24 비밀번호나 개인 앱 키는 받지 않습니다. 셀러가 앱 권한 동의를 하면 `/api/channels/cafe24/oauth/callback`으로 돌아와 연결됩니다.
4. 카테고리 코드·출고지/반품지 코드는 각 쇼핑몰 API로 불러온 실제 값을 써야 합니다.
   (앱의 '배송 정책 불러오기' 단계에서 저장하는 값. 데모 값은 실제 등록에 쓸 수 없습니다.)

## 실행

```bash
cd server
npm install
DOOGO_SECRET_KEY=$(openssl rand -hex 32) \
DOOGO_SERVER_TOKEN=바꿔주세요 \
DOOGO_ALLOWED_ORIGINS=https://doogo.example.com \
NAVER_CLIENT_ID=두고_커머스API_앱_ID \
NAVER_CLIENT_SECRET='$2a$04$...' \
npm start            # 기본 포트 8787
```

| 환경변수 | 설명 |
|---|---|
| `DOOGO_SECRET_KEY` | 셀러 쇼핑몰 키를 암호화(AES-256-GCM)할 32바이트 키. 운영에서는 KMS 권장 |
| `DOOGO_SERVER_TOKEN` | 두고 앱 → 서버 호출 인증 토큰. **운영에서는 두고 로그인 세션 검증으로 바꿔야 합니다** |
| `DOOGO_ALLOWED_ORIGINS` | 호출을 허용할 두고 앱 주소(쉼표 구분) |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | 두고가 네이버에 등록한 커머스API 애플리케이션 |
| `CAFE24_CLIENT_ID` / `CAFE24_CLIENT_SECRET` | 두고가 CAFE24 개발자센터에 등록한 앱 |
| `CAFE24_REDIRECT_URI` | CAFE24 권한 동의 뒤 돌아올 주소 (예: `https://api.doogo.kr/api/channels/cafe24/oauth/callback`) |
| `COUPANG_API_BASE` / `NAVER_API_BASE` / `CAFE24_API_BASE` | 테스트용 주소 교체 (기본값은 실제 API 주소) |
| `DOOGO_CREDENTIAL_FILE` | 암호화된 키 파일 경로 (기본 `server/data/credentials.enc.json`) |

앱을 서버에 연결하려면 앱 페이지에서 `window.DOOGO_API_BASE`와 `window.DOOGO_API_TOKEN`을 설정합니다.
테스트할 때는 브라우저 localStorage에 `doogo-api-base`, `doogo-api-token`을 넣어도 됩니다.
설정이 없으면 앱은 쇼핑몰로 요청을 보내지 않습니다. (claude.ai 미리보기·내 컴퓨터에서는 흐름 확인용으로 기록만 하고, 실제 도메인에서는 ‘연동 서버 연결 필요’로 안내합니다.)

## API

| 메서드 | 경로 | 본문 |
|---|---|---|
| POST | `/api/channels/:channel/connect` | `{ sellerLoginId, credentials }` 연결 확인 후 암호화 보관, 가린 값만 응답 |
| DELETE | `/api/channels/:channel` | `{ sellerLoginId }` 연결 해제 |
| POST | `/api/listings` | `{ sellerLoginId, channel, listing }` 원클릭 등록 |
| POST | `/api/listings/:channel/:externalId/status` | `{ sellerLoginId, action: stop\|hide\|soldout\|resume, stock, vendorItemIds }` |
| POST | `/api/listings/:channel/:externalId/sync` | `{ sellerLoginId, listing, vendorItemMap }` 가격·재고 동기화 |
| DELETE | `/api/listings/:channel/:externalId` | `{ sellerLoginId, vendorItemIds }` 삭제 (쿠팡은 판매중지로 대체될 수 있음) |
| POST | `/api/orders/:channel/collect` | `{ sellerLoginId, since }` 결제완료 새 주문 가져오기 (스마트스토어: 변경 상품주문 조회 → 상세 조회 / 쿠팡: 발주서 ACCEPT 조회) |
| POST | `/api/orders/:channel/confirm` | `{ sellerLoginId, items: [{ refs }] }` 주문 확인 (스마트스토어 발주확인 / 쿠팡 상품준비중) |
| POST | `/api/orders/:channel/dispatch` | `{ sellerLoginId, items: [{ refs, carrier, naverCode, tracking, update }] }` 송장 전송 (스마트스토어 발송처리 / 쿠팡 송장 업로드·수정). 주문마다 성공·실패 사유를 돌려줌 |

`channel`은 `coupang` 또는 `smartstore`. 쇼핑몰 쪽 오류는 `502`와 함께 `upstreamStatus`, `detail`로 돌려줍니다.

## 테스트

```bash
npm test
```

가짜 쿠팡·네이버 서버(`test/fake-upstream.js`)를 띄워 다음을 검증합니다.

- 쿠팡 HMAC 서명 형식
- 네이버 bcrypt 서명
- 쇼핑몰별 요청 본문
- 키 암호화
- 연결 → 등록 → 품절 → 판매중지 → 삭제 → 가격 동기화 전체 흐름
- 주문 수집 → 송장 전송(쿠팡 상품준비중 처리 포함, 실패 사유 전달)
- 조합형 옵션(사이즈×색상) → 네이버 옵션 기준 2개·쿠팡 속성 2개, 의류 상품정보고시

실제 쇼핑몰 호출 검증은 두고 등록(위 1·2번)과 실제 키가 있어야 할 수 있습니다.
요청 필드는 공개 문서를 기준으로 맞췄으니, 운영 전에 각 개발자센터 최신 문서와 한 번 더 대조하세요.

## 본사 운영: 구독 카드 환불 · 일일 매출 보고 (v67)

| 경로 | 하는 일 | 필요한 환경변수 |
|---|---|---|
| `POST /api/billing/refund` `{ paymentKey, cancelAmount, cancelReason, refundId }` | 위탁셀러가 요금제를 해지하면 남은 기간만큼 **카드 부분 취소** (토스페이먼츠 `POST /v1/payments/{paymentKey}/cancel`, `refundId`를 멱등 키로 사용) | `TOSS_SECRET_KEY` |
| `POST /api/reports/daily` `{ title, text, kakao:[번호], email:[주소] }` | 마스터 일일 매출 보고를 **카카오 알림톡 + 이메일**로 발송. 채널마다 성공/실패를 따로 돌려줌 | 알림톡: `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`, `SOLAPI_PFID`(카카오 채널 발신 프로필), `SOLAPI_SENDER`(발신번호), `SOLAPI_TEMPLATE_ID`(승인된 템플릿) · 이메일: `RESEND_API_KEY`, `REPORT_FROM_EMAIL` |

- 알림톡은 **카카오가 승인한 템플릿**으로만 보낼 수 있습니다. 템플릿 본문은 `#{제목}` 과 `#{본문}` 두 변수를 쓰도록 등록해 주세요.
  (`SOLAPI_TEMPLATE_ID`가 없으면 같은 내용을 문자(LMS)로 보냅니다.)
- 카드 환불은 결제할 때 받은 `paymentKey`가 있어야 합니다. 앱은 결제대행(PG)이 연결되면(`window.DOOGO_PG_READY = true`) 해지 즉시 이 경로를 불러 자동 취소하고, 연결 전에는 마스터 ‘구독 · 결제 → 카드 환불 대기’에 올려 PG 관리자 화면에서 취소하도록 안내합니다.
- 지금 매출 보고의 **숫자는 브라우저가 계산해서** 서버로 보냅니다. 주문 데이터가 서버 데이터베이스로 옮겨지면, 서버가 매일 정한 시각에 직접 계산해 보내도록(예: 매일 08:00 크론) 바꾸면 됩니다. 그 전까지는 마스터 화면이 열려 있을 때 정한 시각 이후 하루 한 번 보냅니다.
