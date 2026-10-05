"use strict";
/* Vercel 진입점. 모든 주소를 이 함수로 보내고(vercel.json), 원래 주소는 __path 로 받아 복원한다.
   서버리스라 자동 확인(스케줄러)은 끄고, 데이터는 함수 인스턴스의 /tmp 에만 남는다 (미리보기용). */
const { createApp } = require("../src/server");

const app = createApp({ dataFile: "/tmp/jarvis-db.json", noScheduler: true, seedDemo: true });

module.exports = (req, res) => {
  const url = new URL(req.url, "http://x");
  const original = url.searchParams.get("__path");
  if (original !== null) {
    url.searchParams.delete("__path");
    const qs = url.searchParams.toString();
    req.url = `/${original.replace(/^\/+/, "")}${qs ? `?${qs}` : ""}`;
  }
  return app.handler(req, res);
};
