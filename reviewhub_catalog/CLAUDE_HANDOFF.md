# DOOGO FOOD DB CENTER — Claude 인수인계 문서

## 1. Claude에게 전달할 첫 요청

아래 문장을 Claude의 첫 메시지로 사용하면 됩니다.

> 첨부한 ZIP은 두고푸드 상품 DB 플랫폼의 v63 전체 원본입니다. 먼저 `CLAUDE.md`, `CLAUDE_HANDOFF.md`, `AGENTS.md`, `.skywork/brief.md`를 읽고 기존 구조와 디자인을 유지해 주세요. 공개 화면과 관리자 화면은 항상 PC와 모바일을 함께 수정하고, 요청한 범위 밖의 확정된 디자인은 변경하지 마세요. 발주오라는 공식 쓰기 API와 서버 인증 계약이 확인되기 전까지 실제 상품 전송 성공을 구현하거나 가장하지 마세요. 작업 전 관련 코드를 확인하고, 완료 후 변경 파일·검증 결과·배포 결과를 명확히 알려 주세요.

## 2. 현재 전달 상태

- 프로젝트명: `reviewhub_catalog`
- 기준 배포: v63
- 공개 도메인: `https://doogofood.site/`
- 공개 관리자: `https://doogofood.site/admin`
- Skywork Website ID: `01a09b15-cc65-746e-93cf-389e5af4ab6b`
- 프로젝트 유형: self-host full-stack
- 최근 v63 소스 검증:
  - local gate 성공
  - failure 0
  - warning 0
- 소스 ZIP에는 `node_modules`, Git 내부 이력, 캐시, 생성된 빌드 결과를 제외했습니다.
- 배포 DB의 실제 운영 레코드 전체 덤프는 ZIP에 포함되지 않습니다. 스키마와 마이그레이션은 포함됩니다.

## 3. 서비스 구성

### 공개 사용자

- `/`: 공개 단가표, 날씨, 운영 현황, 상품 검색·필터
- `/guide`: 공지·필독·발주/CS/기타 안내·FAQ
- `/notices`: 가격변동과 최근 품절 이슈
- `/sourcing`: 소싱 요청

### 관리자

- `/admin`: 관리자 로그인
- `/admin/home`: 운영 요약
- `/admin/products`: 일반상품 목록·등록·수정·삭제·엑셀
- `/admin/sort`: 상품 진열순서
- `/admin/categories`: 상품 카테고리
- `/admin/shippingPolicies`: 배송 정책
- `/admin/suppliers`: 매입처
- `/admin/changes`: 상품 변경전
- `/admin/transmissions`: 상품 변경완료·전송 이력
- `/admin/sales`: 통계
- `/admin/notices`: 공지·필독 관리
- `/admin/history`: 가격변동 이력
- `/admin/sourcing`: 소싱 요청 관리
- `/admin/sync`: 발주오라 연동 상태

`/admin/bundles`는 묶음상품 운영을 중단했기 때문에 `/admin/products`로 이동합니다.

## 4. v63까지 반영된 핵심 기능

### 공개 상품 DB

- 일반상품 단일 모델
- 상품/옵션 A단가와 일반공급가
- 자율 또는 지정 판매가
- 배송유형·카테고리·판매월 필터
- 페이지당 5/10/20개와 숫자 페이지
- 옵션 펼치기
- 품절 상품 연한 빨간색 처리
- 정상 상품 흰색 처리
- 공급중 문구 숨김
- 시즌 범위 밖 `상품준비중`
- 실제 품절 `품절`
- 원산지 미입력 시 문구 숨김

### 관리자 상품관리

- 상품 목록 및 중앙 편집 팝업
- 상품코드, 이미지, 매입처, 배송 정책
- 원가·A단가·일반공급가·판매가·마진
- 옵션별 가격과 품절
- 상시 판매와 판매 시작/종료월
- 10/20/30개 페이지 크기
- 상품별 체크박스와 현재 페이지 전체 선택
- 선택 상품만 엑셀 다운로드
- 발주오라형 상품 목록·일괄변경 엑셀
- PC 표와 모바일 카드 레이아웃
- 모바일 선택 영역을 카드 상단 한 줄로 정렬

### 진열순서

- `products.displayOrder`를 공개 순서의 단일 기준으로 사용
- 상품 리스트에서 실제 전체 노출순위 표시
- 진열순서 팝업에서 검색·카테고리·페이지 크기 제공
- 드래그 앤 드롭으로 순서 변경
- 모바일용 `맨 위`, `위`, `아래` 버튼 유지
- 저장된 순서를 전체와 카테고리에 동일 적용

### 공지·가격변동·소싱

- 공지 제목·YouTube·본문·이미지 팝업
- FAQ 페이지당 5개
- 공개 가격변동 5/10/20개
- 인상 빨강, 인하 파랑
- 상품 이미지와 옵션별 변경
- 최근 7일 품절 이슈
- 소싱 요청 접수/검토중/완료 관리

### 매입처·배송정책·통계

- 매입처 등록·수정·사용중지
- 상품 편집기에서 매입처 선택
- 배송 정책 등록 후 상품 편집기에 자동 반영
- 매출 원본 미연결 시 임의 숫자를 생성하지 않고 연결 대기 표시

### 발주오라

- 초기 이관/연결 상품/반영 대기 통계
- 변경 outbox
- 상품 변경전·변경완료 화면
- 전송 성공/실패/보류 상태
- 실패 사유 표시
- 연결 계정을 `두고푸드 · 계정명` 형태로 표시
- 계정이 없으면 `미연결`
- 공식 쓰기 API 전에는 안전 차단

## 5. 주요 코드 흐름

### 공개 데이터

1. `PublicCatalog.tsx`
2. `apiFetch("/catalog/initial")`, `/catalog`, `/catalog/guide`, `/catalog/notices`
3. `catalog.route.ts`
4. `catalog.ts`, `catalog-operations.ts`
5. LibSQL/SQLite 테이블

### 관리자 상품 저장

1. `CatalogAdmin.tsx` 상품 편집기
2. `POST /api/catalog/admin/products` 또는 `PUT /api/catalog/admin/products/:id`
3. `catalog.route.ts`
4. `catalog.ts`
5. 상품/옵션 저장, 가격변동 이력, 동기화 outbox 기록

### 진열순서

1. 관리자 드래그/위·아래 조작
2. `PUT /api/catalog/admin/products/display-order`
3. 상품별 `displayOrder` 저장
4. 공개 API가 `displayOrder` 기준으로 정렬

### 발주오라 상태

1. `CatalogSyncAdmin`
2. `/api/catalog/admin/sync`
3. `catalog-sync.ts`
4. 연결 상태, outbox, 실행 이력 반환

## 6. DB 변경 이력

- `004_catalog.sql`: 기본 카탈로그
- `005_product_options_and_guide.sql`: 옵션과 안내
- `006_product_codes.sql`: 상품코드
- `007_season_sale_price_and_activity.sql`: 판매기간·판매가·활동
- `008_cost_price_notice_media_and_seed.sql`: 원가·공지 미디어
- `009_price_history_examples.sql`: 가격 이력 관련
- `010_baljuora_catalog_sync.sql`: 발주오라 동기화 경계
- `011_catalog_primary_categories.sql`: 카테고리
- `012_catalog_tower.sql`: DB 타워 기능
- `013_product_display_order.sql`: 진열순서
- `014_catalog_always_on_sale.sql`: 상시 판매
- `015_product_groups_and_shipping_policies.sql`: 과거 그룹/배송정책
- `016_suppliers.sql`: 매입처
- `017_remove_product_groups.sql`: 그룹 데이터 제거

기존 마이그레이션을 수정하지 말고 다음 DB 변경은 `018_...sql`로 추가합니다.

## 7. 중요 디자인 원칙

- 두고푸드 초록색과 흰색 기반
- ReviewHub 계열의 크고 명확한 관리자 타이포그래피
- PC에서는 상품 표가 한눈에 보여야 함
- 모바일에서는 가로 스크롤 대신 카드형
- 주요 터치 버튼과 닫기 버튼은 충분한 크기
- 관리자 사이드바는 모바일 내부 스크롤 가능
- 사용자가 확정한 푸터·헤더·메뉴를 별도 요청 없이 재설계하지 않음

## 8. 알려진 제한사항

### 발주오라 외부 쓰기

현재 가장 중요한 제한입니다.

- 공식 API 문서 없음
- 서버용 API 키/OAuth/PAT 없음
- 로그인 시 Cloudflare 사람 인증 가능성
- 아이디/비밀번호를 서버 자동화에 저장해서는 안 됨

따라서 공식 계약이 확인될 때까지 외부 상품 생성·수정·삭제를 성공 처리하면 안 됩니다.

### 운영 데이터

- 운영 DB 데이터는 배포 환경의 LibSQL에 존재합니다.
- 소스 패키지는 코드·스키마·마이그레이션을 포함하지만 실데이터 덤프는 포함하지 않습니다.
- 상품 수치나 매출 수치를 임의로 샘플 생성하지 않습니다.

### 과거 묶음상품 코드

- 일부 과거 호환 타입·서버 API가 소스에 남아 있을 수 있습니다.
- 현재 사용자 운영 결정은 일반상품 단일 모델입니다.
- 명시적 요청 없이 묶음상품 UI를 다시 노출하지 않습니다.

## 9. 로컬 실행

```bash
pnpm install
```

`.env.example`을 참고하여 로컬 전용 환경변수를 별도로 설정합니다. 비밀값을 Git에 저장하지 않습니다.

```bash
pnpm build
pnpm test
pnpm lint
```

Skywork Code 환경에서는 아래 검증을 우선합니다.

```bash
skywork-cli website validate \
  --path reviewhub_catalog \
  --gate local \
  --progress-jsonl
```

배포:

```bash
skywork-cli website deploy \
  --path reviewhub_catalog \
  --description "사용자에게 보이는 구체적인 변경 요약" \
  --progress-jsonl
```

배포가 반환한 `data.artifactPublish.cmd`를 변경하지 않고 한 번 실행합니다. 공개 반영이 필요하면 새 Artifact version을 지정하여 `website make-public`을 실행합니다.

## 10. 다음 작업 체크리스트

Claude가 새 요청을 받을 때:

1. 사용자 스크린샷과 요청을 번호별로 매핑
2. 현재 배포 화면과 관련 소스 확인
3. 관련 기능의 단일 코드 경로 확인
4. 필요한 파일만 수정
5. PC와 모바일 레이아웃 모두 확인
6. API·DB 변경이면 기존 데이터 호환성 확인
7. 검증 실행
8. 실제 배포가 요청되면 배포 및 Artifact 발행
9. 변경 파일·검증·URL·남은 제한을 보고

