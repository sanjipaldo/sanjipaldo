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
- 공식 API 또는 서버 토큰이 제공되기 전에는 외부 상품 생성·수정·삭제를 실행하지 않습니다.
- 비밀번호 원문을 DB에 저장하지 않습니다.

## 6. 현재 상품 운영 규칙

- 공개 상품 상태는 `상품준비중`, `품절`만 글자로 표시합니다.
- 정상 공급 상품에는 `공급중` 문구를 표시하지 않습니다.
- 공개 정상 상품은 흰색, 품절 상품은 연한 빨간색 배경입니다.
- 원산지가 비어 있으면 원산지 안내를 표시하지 않습니다.
- 상품 노출순서는 `products.displayOrder`가 유일한 기준입니다.
- 관리자 진열순서 관리에서 드래그 앤 드롭과 위/아래 버튼을 모두 제공합니다.
- 공개 전체 목록과 카테고리 목록은 같은 진열순서를 사용합니다.
- 옵션 기능은 사용하지 않습니다. 발주오라 일반상품처럼 규격(중량·과수)마다 상품을 1개씩 등록하며, 상품코드로 발주오라 엑셀과 1:1로 맞춥니다(migration 019에서 기존 옵션을 독립 상품으로 분리).
- 새로 등록한 상품은 진열순서 맨 앞에 배치됩니다. 여러 상품의 공통 값은 상품 리스트의 "일괄 변경"으로 바꿉니다.

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

## 9. 작업 완료 보고 형식

완료 보고에는 아래를 반드시 포함합니다.

- 변경된 파일
- 변경된 기능과 값
- PC·모바일 반영 여부
- 검증 명령과 결과
- 배포 버전 및 확인 URL
- 실제로 구현하지 못한 외부 연동이나 제한사항

