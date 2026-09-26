# Vercel 배포

화면(apps/client)은 정적 파일로, 서버(apps/server의 Hono 앱 전체)는 `api/index.mjs` 서버리스 함수 하나로(`vercel.json`에서 `/api/*` 전체를 이 함수로 rewrite) 배포합니다.
Vercel 프로젝트의 **Root Directory는 `reviewhub_catalog`** 입니다.

- `vercel.json`: 설치·빌드 명령, `/api/*` 외 경로는 `index.html`(SPA)
- `deploy/vercel/build.mjs`: 화면 빌드 + 서버 번들(`.vercel-server/handler.mjs`)
- `deploy/vercel/migrate-db.mjs`: 원격 DB(Turso)에 마이그레이션 적용, 선택적으로 admin 비밀번호 설정

## 환경변수 (Vercel Project → Settings → Environment Variables)

| 이름 | 값 |
|---|---|
| `SKYBASE_DB_ENDPOINT` | Turso DB URL을 `https://`로 (예: `https://doogofood-xxx.turso.io`) |
| `SKYBASE_DB_AUTH_TOKEN` | Turso DB 토큰 |
| `SKYBASE_DB_NAMESPACE` | 아무 값 (예: `prod`) — 비어 있으면 서버가 DB 미설정으로 판단 |
| `BETTER_AUTH_SECRET` | 32자 이상 임의 문자열 |
| `BETTER_AUTH_URL` | `https://<배포 도메인>/api/auth` |
| `ALLOWED_ORIGINS` | `https://<배포 도메인>` |

## Turso 연동(Vercel 마켓플레이스)

`vercel integration add tursocloud/database`로 연결하면 `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN`이 들어옵니다.
- 서버는 `env-map.ts`에서 이를 `SKYBASE_DB_*`로 옮겨 씁니다(위 표의 DB 변수는 따로 넣지 않아도 됨).
- 운영 배포 빌드마다 `migrate-db.mjs`가 새 마이그레이션만 적용합니다.
- admin 비밀번호를 바꿀 때만 `ADMIN_PASSWORD`를 잠시 넣고 배포한 뒤 바로 지웁니다(남겨 두면 배포마다 다시 설정됨).

## 이미지 저장소(Vercel Blob)

Skywork 파일 게이트웨이 대신 Vercel Blob 공개 저장소(`doogofood-images`)를 씁니다.
- 서버 번들에서 `apps/server/services/s3_storage.ts`를 `blob-storage.ts`로 바꿔 끼웁니다.
- 필요한 변수는 `BLOB_READ_WRITE_TOKEN` 하나이며, 저장소를 프로젝트에 연결하면 자동으로 들어옵니다.

## 입점 신청 자동 안내 메일(Resend)

입점 신청이 들어오면 신청자 이메일로 접수 안내 메일을 보냅니다. 아래 변수가 없으면 메일만 건너뛰고(관리자에 "메일 미발송") 신청은 정상 저장됩니다.

| 이름 | 값 |
|---|---|
| `RESEND_API_KEY` | Resend 대시보드 → API Keys에서 발급 |
| `MAIL_FROM` | 보내는 사람, 예: `두고푸드 <md@doogofood.site>` (Resend에서 doogofood.site 도메인 인증 필요) |
| `MAIL_NOTIFY_TO` | (선택) 새 입점 신청 알림을 받을 MD 이메일 |

같은 이메일로 10분 안에 다시 신청하면 메일은 다시 보내지 않습니다(자동 메일 남용 방지).

## CLI 배포

```bash
cd reviewhub_catalog
DB_URL=libsql://<db>.turso.io DB_TOKEN=<토큰> ADMIN_PASSWORD=<비밀번호> node deploy/vercel/migrate-db.mjs --yes   # 처음 한 번
vercel link          # 또는 VERCEL_TOKEN으로 --token 사용
vercel deploy --prod
```

로컬 확인: `node deploy/vercel/build.mjs` 후 `/api/*`를 `api/index.mjs`로, 나머지를 `apps/client/dist`로 보내면 됩니다.
