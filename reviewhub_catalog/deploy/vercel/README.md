# Vercel 배포

화면(apps/client)은 정적 파일로, 서버(apps/server의 Hono 앱 전체)는 `api/[[...route]].mjs` 서버리스 함수 하나로 배포합니다.
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

## CLI 배포

```bash
cd reviewhub_catalog
DB_URL=libsql://<db>.turso.io DB_TOKEN=<토큰> ADMIN_PASSWORD=<비밀번호> node deploy/vercel/migrate-db.mjs --yes   # 처음 한 번
vercel link          # 또는 VERCEL_TOKEN으로 --token 사용
vercel deploy --prod
```

로컬 확인: `node deploy/vercel/build.mjs` 후 `/api/*`를 `api/[[...route]].mjs`로, 나머지를 `apps/client/dist`로 보내면 됩니다.
