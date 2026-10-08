/* Vercel 배포용 화면 파일 모으기 — class/ 에서 브라우저가 받는 파일만 class/.site 로 복사한다.
 * 서버 코드(api) · 빌드 스크립트(scripts) · 설명서 · 설정 · 숨김 파일은 넣지 않는다. */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, ".site");
const SKIP = new Set(["api", "scripts", "README.md", "vercel.json", "node_modules"]);

fs.rmSync(OUT, { recursive: true, force: true });
let n = 0;
(function copy(dir, out) {
  fs.mkdirSync(out, { recursive: true });
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    if (e.name.startsWith(".") || (dir === ROOT && SKIP.has(e.name))) return;
    const from = path.join(dir, e.name), to = path.join(out, e.name);
    if (e.isDirectory()) copy(from, to);
    else if (e.isFile()) { fs.copyFileSync(from, to); n++; }
  });
})(ROOT, OUT);
console.log("[site] 화면 파일 " + n + "개 → class/.site");
