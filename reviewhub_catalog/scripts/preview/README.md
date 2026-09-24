# 단일 HTML 미리보기 만들기

서버 없이 브라우저에서 바로 열 수 있는 `preview/doogofood-preview.html`을 만듭니다.
로컬 서버(CLAUDE.md의 "Claude Code 로컬 실행")가 켜져 있어야 합니다.

1. 데이터 기록: `LOCAL_ADMIN_PASSWORD=<로컬 비밀번호> PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node scripts/preview/record.cjs`
2. 미리보기 빌드: `cd apps/client && LOVABLE_DEV_SERVER=true npx vite build --config ../../scripts/preview/vite.preview.config.ts --mode production`
3. 합치기: `node scripts/preview/assemble.cjs`

- 화면·기능 코드는 원본과 같고, 라우터만 HashRouter(`#/admin` 형태 주소)로 바뀝니다.
- API 응답은 기록 시점 스냅샷입니다. 저장·삭제 등 변경 요청은 "미리보기 화면에서는 저장·변경되지 않습니다"로 거절됩니다.
- 관리자 미리보기 로그인은 아이디 `admin` + 아무 비밀번호로 들어가며, 파일 안에 원가 등 관리자 데이터가 들어 있으니 외부에 공유하지 마세요.
- 생성물(`preview/`, `.preview-build*`)은 Git에 올리지 않습니다.
