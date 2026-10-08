# Claude 작업 규칙 — DOOGO FOOD DB CENTER

이 파일은 Claude Code/Claude에게 프로젝트를 넘길 때 가장 먼저 읽히는 운영 지침입니다.

## 1. 프로젝트 개요

- 서비스: 두고푸드 공개 상품 DB 및 관리자 데이터센터
- 배포 버전: v63
- 공개 사이트: `https://doogofood.site/`
- 관리자 진입: `https://doogofood.site/admin`
- 기술 스택:
  - Client: React 19 + TypeScript + Vite + React Router
  - Server: Hono + TypeScript
  - DB: LibSQL/SQLite + Drizzle
  - 패키지 관리: pnpm workspace
- 프로젝트 형태: Skywork self-host full-stack Website

## 2. 작업을 시작할 때 반드시 읽을 파일

1. `CLAUDE_HANDOFF.md`
2. `AGENTS.md`
3. `.skywork/brief.md`
4. 수정 대상과 직접 연결된 파일

전체 프로젝트를 무작정 재구성하지 말고 기존 구현과 디자인을 유지하면서 요청 범위만 수정합니다.

## 3. 주요 소스 위치

- 클라이언트 라우팅: `apps/client/src/App.tsx`
- 공개 상품 DB: `apps/client/src/pages/catalog/PublicCatalog.tsx`
- 관리자 전체 화면: `apps/client/src/pages/admin/CatalogAdmin.tsx`
- 공개·관리자 공통 스타일: `apps/client/src/catalog.css`
- 글로벌 스타일: `apps/client/src/index.css`
- 클라이언트 API 헬퍼: `apps/client/src/lib/api.ts`
- 데이터 타입: `apps/client/src/pages/catalog/types.ts`
- 상품 API 라우트: `apps/server/routes/catalog.route.ts`
- 상품 핵심 서비스: `apps/server/services/catalog.ts`
- 엑셀 처리: `apps/server/services/catalog-excel.ts`
- 발주오라 동기화 상태: `apps/server/services/catalog-sync.ts`
- 운영 현황: `apps/server/services/catalog-operations.ts`
- 매출 통계: `apps/server/services/catalog-sales.ts`
- DB 스키마: `apps/server/db/schema.ts`
- 마이그레이션: `apps/server/migrations/`

## 4. 절대 지켜야 할 구현 규칙

- 공개 화면과 관리자 화면 모두 PC·모바일을 함께 수정합니다.
- 기존 확정 화면은 사용자가 요청하지 않은 범위까지 재디자인하지 않습니다.
- API 호출은 반드시 `apiFetch`를 사용합니다. UI 코드에서 직접 `fetch`, `axios`, `XMLHttpRequest`를 사용하지 않습니다.
- `/admin/*` 화면과 관리자 API 인증을 약화시키지 않습니다.
- `.skywork/website.json`, `.skywork/website/website.json`, `apps/client/public/app-config.js`를 직접 수정하지 않습니다.
- `apps/server/_core/*`는 플랫폼 핵심 코드이므로 일반 기능 작업에서 수정하지 않습니다.
- 기존 마이그레이션 파일을 수정하지 않습니다. DB 변경이 필요하면 다음 번호의 새 마이그레이션을 추가합니다.
- 비밀번호, API 키, DB 토큰을 코드·문서·로그에 넣지 않습니다.
- `git reset --hard`, 강제 checkout, 광범위 삭제를 하지 않습니다.
- 사용자 DB 데이터를 임의로 초기화하거나 샘플 데이터로 덮어쓰지 않습니다.
- 공개 사이트는 현재 일반상품 단일 모델입니다. 묶음상품/그룹상품 UI를 다시 활성화하지 않습니다.

## 5. 발주오라 연동 안전 경계

- 발주오라 공식 쓰기 API와 서버 전용 인증 계약이 확인되지 않았습니다.
- 계정 아이디/비밀번호만으로 연결 성공이나 상품 전송 성공을 가장하지 않습니다.
- 현재 기능은 외부 상품 ID, 변경 대기열, 전송 상태, 실패 사유를 관리하는 안전한 준비 단계입니다.
- 연결 방식(발주오라 오픈 API 개발 중): 관리자 > 발주오라 연동에서 몰 ID·API 키·API 주소(https://…baljuora.com만)를 등록합니다. API 키는 AES-GCM으로 암호화해 `integration_connections`에 저장하고 끝 4자리만 표시합니다(migration 021).
- "연결됨"은 등록한 API 주소가 API 키로 실제 2xx 응답했을 때만 표시합니다. 자동 동기화(데이터센터→발주오라, 발주오라→데이터센터) 스위치는 연결됨일 때만 켤 수 있으며, 실제 전송·가져오기 작업은 API 사양 공개 후 구현합니다.
- 공식 API 또는 서버 토큰이 제공되기 전에는 외부 상품 생성·수정·삭제를 실행하지 않습니다.
- 비밀번호 원문을 DB에 저장하지 않습니다.

## 6. 현재 상품 운영 규칙

- 공개 상품 상태는 `판매중`(검정 뱃지·흰색 행), `시즌 종료`·`품절`(빨간 뱃지·연한 빨간색 행)으로 표시합니다.
- 공개 단가표의 카테고리 칸에는 규격(optionsInfo) 문구를 표시하지 않고, 대신 "배송비 무료" 또는 "배송비 유료 (3,500원)" 버튼(?)을 두어 누르면 연결된 배송 정책(부과 방식 주문당/수량별/kg당·무료 조건·제주/도서산간·반품/교환·택배사)을 팝업으로 보여 줍니다. 배송 정책이 연결되지 않은 상품은 모두 "배송비 확인"으로 표시하고, 팝업에서 상품의 배송비 문구와 택배사를 안내합니다. 관리자 상품 편집에서도 규격/중량 입력칸은 없앴습니다.
- 단가관리(danga-admin)·발주오라 "상품 엑셀 일괄변경" 양식(구분=상품/매출처·그룹 행)은 상품 리스트 "엑셀 업로드"로 그대로 올립니다. 상품코드로 매칭하고, 미리보기에서 고른 항목만 반영합니다: 상품 행 매입원가 → 원가, 상품 행 공급가 → 일반공급가, "황금농부" 그룹 행 공급가 → A단가. 없는 코드는 건너뛰고 신규 등록·다른 값 변경은 하지 않습니다.
- 공급사 "단가표" 엑셀(열: 상품명, 기존/변경 원가, (기존/변경 A급단가), 기존/변경 공급가 · "구분" 열 없음)은 상품 리스트 상단 "엑셀 대량 업로드"(또는 "엑셀 업로드")로 올립니다(format `contract`). 원가 = 공급사 공급가, A급단가 칸에 값이 있는 상품은 A급단가("변경" 값 우선). A급 단가 = 원가 ÷ (1 − A 마진), 일반공급가 = 원가 ÷ (1 − 일반 마진), 원 단위 미만 버림. 마진(%)은 미리보기의 "마진 설정"에서 관리자가 0~90%(0.1% 단위)로 입력하며 기본 10%·20%, 브라우저에 마지막 값을 기억합니다(예: 5,250원, 10%/20% → 5,833 / 6,562). 상품코드 열이 없으면 상품명(띄어쓰기 차이 무시)으로 매칭하고, 같은 이름 상품이 여러 개면 건너뜁니다. 없는 상품은 "신규 등록"이 켜져 있으면 미분류·숨김·코드 자동 생성(DG-…)으로 등록합니다. 기존 상품은 미리보기에서 고른 가격 항목만 바뀌고 판매가·품절·노출은 그대로입니다.
- 상품 리스트 선택 바의 "선택 삭제"는 개별 삭제와 같은 방식(숨김 + deletedAt 표시, 발주오라 대기열 기록)으로 최대 500개씩 처리합니다(`POST /api/catalog/admin/products/bulk-delete`). 없는 상품이 섞이면 아무것도 지우지 않습니다.
- 관리자 상품 리스트의 "마진(1개)" 칸은 A단가 기준 마진율과 1개 판매 시 마진 금액(A단가 − 원가)을 함께 보여 줍니다. 상품 수정 창에도 같은 값이 나옵니다.
- 카테고리가 없거나 사용 중지된 상품은 배송유형별 `미분류`(국내·해외)로 모읍니다(migration 023).
- 원산지가 비어 있으면 원산지 안내를 표시하지 않습니다.
- 상품 노출순서는 `products.displayOrder`가 유일한 기준입니다.
- 관리자 진열순서 관리에서 드래그 앤 드롭과 위/아래 버튼을 모두 제공합니다.
- 공개 전체 목록과 카테고리 목록은 같은 진열순서를 사용합니다.
- 옵션 기능은 사용하지 않습니다. 발주오라 일반상품처럼 규격(중량·과수)마다 상품을 1개씩 등록하며, 상품코드로 발주오라 엑셀과 1:1로 맞춥니다(migration 019에서 기존 옵션을 독립 상품으로 분리).
- 새로 등록한 상품은 진열순서 맨 앞에 배치됩니다. 여러 상품의 공통 값은 상품 리스트의 "일괄 변경"으로 바꿉니다.
- 제철 월(판매기간)은 카테고리와 상관없이 저장·표시합니다(미분류 상품 포함). 제철 카테고리(농산·수산·축산·선물세트·식품)는 제철 월이 없으면 "판매기간 미설정/상품준비중", 그 밖의 카테고리는 제철 월이 없으면 "상시 판매"입니다.
- 목록의 "페이지당 보기 개수"는 선택 목록이 아니라 숫자 직접 입력입니다(`components/PageSizeInput.tsx`, 브라우저별로 마지막 값을 기억).
- 배송 정책: 배송비 무료/유료, 유료 부과 방식(주문당 고정·수량별·kg당, migration 024), 기본 배송비, "일정 금액 이상 무료" 기준, 제주·도서산간 추가배송비, 반품·교환 배송비(migration 022). 표시 문구를 비우면 배송비로 자동 작성합니다.

## 6-0. 검색엔진 등록

- `apps/client/index.html`의 `naver-site-verification`, `google-site-verification` 메타 태그는 네이버 서치어드바이저·구글 서치 콘솔 소유 확인용입니다. 확인 후에도 지우지 않습니다.

## 6-1. 데이터 보관과 백업

- 운영 DB: Vercel Marketplace로 만든 Turso(LibSQL) `doogofood-db`, 지역 iad1(미국 동부). Vercel 함수도 iad1에서 실행되며, DB와 함수는 같은 지역에 둡니다(함수만 옮기면 DB 왕복이 길어져 오히려 느려짐).
- 상품 이미지: Vercel Blob `doogofood-images`(공개, `BLOB_READ_WRITE_TOKEN`).
- DB 백업: Vercel Blob `doogofood-backups`(비공개, `BACKUP_READ_WRITE_TOKEN`)의 `db-backups/`에 저장합니다.
  - 자동: `vercel.json` crons가 매일 18:00 UTC(03:00 KST)에 `GET /api/backup/cron`을 호출합니다(`CRON_SECRET` 필요, 운영 배포에서만 실행). 최근 30개만 보관합니다.
  - 관리자 > DB 백업: 목록·내려받기, "지금 백업 저장", "지금 내려받기"(저장소 없이 바로 파일 생성).
  - 형식: gzip JSON(`doogofood-db-backup` v1, 표별 columns/rows). 로그인 계정·세션(user, session, account, verification)과 `integration_connections`(발주오라 API 키)는 제외합니다.
  - 서버 코드는 `services/backup_storage.ts`(기본: 저장소 없음)를 쓰고, Vercel 빌드에서 `deploy/vercel/backup-storage.ts`로 바꿔 끼웁니다.

## 7. 개발 및 검증

의존성 설치:

```bash
pnpm install
```

로컬 개발은 프로젝트 환경에 맞는 DB와 인증 환경변수가 필요합니다. 예시는 `.env.example`을 참고하되 실제 비밀값은 별도로 주입합니다.

Skywork 환경의 최종 검증:

```bash
skywork-cli website validate --path reviewhub_catalog --gate local --progress-jsonl
```

일반 로컬 진단:

```bash
pnpm lint
pnpm test
pnpm build
```

Skywork에서는 검증 성공 후 Website 배포와 Artifact 발행을 별도로 완료해야 사용자에게 새 버전이 전달됩니다.

### Claude Code(클라우드 컨테이너) 로컬 실행

`skywork-cli`가 없는 환경에서는 로컬 LibSQL 서버(`sqld`)로 전체 스택을 실행해 확인합니다. 운영 DB에는 연결하지 않습니다.

1. `sqld` 실행: libsql-server 릴리스의 `sqld --http-listen-addr 127.0.0.1:8080` (데이터 폴더는 저장소 밖에 둡니다)
2. 루트 `.env`(Git 제외) 작성: `SKYBASE_DB_ENDPOINT=http://127.0.0.1:8080`, `SKYBASE_DB_AUTH_TOKEN=local`, `SKYBASE_DB_NAMESPACE=local`, `BETTER_AUTH_URL=http://localhost:3100/api/auth`, `ALLOWED_ORIGINS=http://localhost:3100`
3. 마이그레이션 적용: `SKYBASE_DB_AUTH_TOKEN=local LOCAL_ADMIN_PASSWORD=<로컬 전용 비밀번호> node scripts/local-db.mjs`
   - localhost 엔드포인트만 허용하며, 비밀번호는 로컬 DB의 admin 계정에만 적용됩니다.
4. 개발 서버: `cd apps/client && LOVABLE_DEV_SERVER=true VITE_ENABLE_ROUTE_MESSAGING=true npx vite --host 127.0.0.1` → `http://127.0.0.1:3100` (IPv6가 없는 컨테이너에서는 `--host` 필요)
5. 검증: `pnpm lint`, `pnpm test`, `pnpm --filter client build`, `SERVER_BUILD_TARGET=web pnpm --filter server build`
   - 빌드로 생성된 `apps/server/dist/`는 커밋하지 않습니다(배포 흐름에서 생성).

## 8. 수정·배포 순서 (사용자 지정)

1. 수정은 먼저 로컬(작업 컨테이너)에서만 하고 lint·test·build와 로컬 실행으로 확인합니다. 브랜치에 커밋·푸시까지만 합니다.
2. 사용자가 화면으로 확인해야 하면 Vercel **미리보기 배포**(`vercel deploy`, `--prod` 없음)를 만들어 그 주소를 전달합니다. 운영 사이트(doogofood.site)는 바뀌지 않습니다.
3. 사용자가 "배포해줘"처럼 운영 배포를 명시적으로 요청할 때만 `vercel deploy --prod`를 실행합니다.
4. 운영 배포 후 서버 로그(`vercel logs`)로 주요 API 응답을 확인하고 보고합니다.
5. 배포는 기능(코드)만 반영합니다. 운영 상품 데이터(신규 등록·가격·삭제·가격변동 이력)는 관리자가 계속 바꾸므로 배포 과정에서 건드리지 않습니다.
   - 새 마이그레이션은 칸 추가처럼 기존 데이터를 바꾸지 않는 구조 변경만 허용합니다.
   - 기존 상품 값을 바꾸는 데이터 변경(카테고리 이동, 가격·상태 일괄 수정, 삭제 등)은 배포 전에 사용자에게 내용을 설명하고 명시적으로 허락받은 경우에만 넣습니다.
   - 배포 보고에 이번에 적용되는 마이그레이션과 "기존 데이터 변경 없음/있음"을 적습니다.
   - 테스트는 로컬 DB에서만 합니다. 미리보기 배포도 운영 DB를 쓰므로 미리보기에서 데이터를 바꾸는 테스트를 하지 않습니다.

## 9. 작업 완료 보고 형식

완료 보고에는 아래를 반드시 포함합니다.

- 변경된 파일
- 변경된 기능과 값
- PC·모바일 반영 여부
- 검증 명령과 결과
- 배포 버전 및 확인 URL
- 실제로 구현하지 못한 외부 연동이나 제한사항

