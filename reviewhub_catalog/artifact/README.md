# claude.ai 페이지 버전 (두고푸드 상품 DB)

게시 주소: https://claude.ai/artifact/NFCHkYHEC6XHw3U271YEfJ (비공개, 소유자와 공유받은 조직 구성원만 열람)

v63 원본을 고치지 않고 그대로 가져와 claude.ai 페이지 하나로 돌리는 빌드입니다.

- 화면: `apps/client` 그대로 (주소만 `#/admin` 형태의 HashRouter)
- 서버: `apps/server/routes/catalog.route.ts`와 서비스 코드를 브라우저에서 그대로 실행
  - `_core/db.ts` → `src/browser-db.ts` (sql.js SQLite + drizzle libsql 호환 클라이언트)
  - `services/s3_storage.ts` → `src/browser-storage.ts` (페이지 파일 저장소 assets)
- 로그인: 관리자센터는 이 페이지의 **편집 권한이 있는 claude.ai 계정**만 들어갈 수 있습니다(아이디·비밀번호 입력값은 확인하지 않음).
- 저장: 페이지 DB(db capability)에 SQLite 파일을 160KB 조각으로 나눠 저장, 바뀐 조각만 다시 씀
  - `full/*`: 전체 DB — 편집 권한자만 읽기·쓰기
  - `pub/*`: 원가·매입처·계정·요청자 연락처·연동/매출 내역을 지운 공개용 DB — 모든 열람자 읽기
  - `inbox/<열람자>`: 편집 권한 없는 열람자의 소싱 요청 → 관리자가 열면 전체 DB로 옮겨짐
- 엑셀 다운로드: downloads 권한의 저장 확인창으로 동작

## 다시 빌드·게시

```bash
cd artifact && npm install                     # sql.js
../node_modules/.bin/vite build --config vite.backend.config.ts
cd ../apps/client && LOVABLE_DEV_SERVER=true npx vite build --config ../../scripts/preview/vite.preview.config.ts --mode production
cd ../.. && node artifact/assemble.mjs         # → .artifact-build/doogofood.html
```

그다음 Artifact 게시(같은 URL로 갱신). 데이터는 페이지 DB에 남아 있으므로 다시 넣지 않습니다.

처음 한 번만: `node artifact/seed.mjs` 로 마이그레이션 000~017에서 DB를 만들어 `.artifact-build/seed/`의 조각을 페이지 DB에 넣었습니다.
이미 운영 중인 페이지에 다시 넣으면 저장된 변경이 덮어써지니 주의하세요.

## 마이그레이션

저장된 DB는 000~017로 만들어졌습니다. 018 이후 마이그레이션은 편집 권한자가 페이지를 열 때 `_artifact_migrations` 표를 기준으로 한 번 적용되고 저장됩니다(`src/backend.ts`의 `applyPendingMigrations`).

## 제한

- 외부 이미지(발주오라 CDN)·날씨(Open-Meteo)는 claude.ai 페이지 보안 정책상 불러올 수 없습니다.
- 공휴일(Nager.Date)도 막혀 있어 2026년 대한민국 공휴일을 `src/backend.ts`에 내장했습니다. 2027년이 되기 전에 목록을 추가해야 합니다.
- 페이지 DB를 쓰는 페이지는 조직 내부 전용이라 외부 공개 링크로 공유할 수 없습니다.
