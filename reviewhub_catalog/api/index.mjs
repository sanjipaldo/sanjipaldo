// /api/* 요청을 받는 Vercel 함수. 실제 코드는 빌드 때 만들어지는 .vercel-server/handler.mjs(apps/server 전체 번들)입니다.
export { default } from "../.vercel-server/handler.mjs";

export const config = { api: { bodyParser: false }, maxDuration: 30 };
