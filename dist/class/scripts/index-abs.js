/* 깨끗한 주소(/vod/p/v5)로 바로 들어와도 index.html 의 CSS · JS · 그림을 맨 위(/)에서 받게 상대 주소를 /… 로 바꿔요.
 * (<base href="/"> 는 브라우저가 미리 받기 시작한 파일에는 늦게 적용돼서 /vod/p/styles.css 같은 헛요청이 생겨요)
 * site.js(Vercel 배포) · dev-server.js 가 같이 써요. 원본 class/index.html 은 그대로 둬서 미리보기 · 파일 열기도 돼요. */
"use strict";
module.exports = (html) => String(html).replace(/(\s(?:src|href)=")(?!https?:|\/|#|data:|mailto:|tel:|javascript:)([^"]+")/g, "$1/$2");
