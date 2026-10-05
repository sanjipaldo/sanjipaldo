/* 로컬 개발 서버 — 정적 파일 + /api (Vercel 함수와 같은 코드)를 한 번에 띄운다.
 *
 *   CLASS_SQLITE=/tmp/class.db MASTER_PASSWORD=test node scripts/dev-server.js 4400
 *
 * TURSO_DATABASE_URL · TURSO_AUTH_TOKEN 이 있으면 Turso 에, 없으면 CLASS_SQLITE 파일(node:sqlite)에 저장한다. */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.argv[2] || process.env.PORT || 4400);
if (!process.env.TURSO_DATABASE_URL && !process.env.CLASS_SQLITE) process.env.CLASS_SQLITE = path.join(require("os").tmpdir(), "doogo-class-dev.db");

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8" };
const handlers = {};
const api = (name) => {
  if (!/^[a-z-]+$/.test(name) || !fs.existsSync(path.join(ROOT, "api", name + ".js"))) return null;
  return (handlers[name] = handlers[name] || require(path.join(ROOT, "api", name + ".js")));
};

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  const m = u.pathname.match(/^\/api\/([a-z-]+)$/);
  if (m) {
    const h = api(m[1]);
    if (!h) { res.statusCode = 404; return res.end("not found"); }
    req.query = Object.fromEntries(u.searchParams.entries());
    return h(req, res);
  }
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || /[\\/](api|scripts)[\\/]|[\\/]\./.test(path.relative(ROOT, file) ? "/" + path.relative(ROOT, file) : "")) { res.statusCode = 404; return res.end("not found"); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.statusCode = 404; return res.end("not found"); }
    res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
    res.end(buf);
  });
}).listen(PORT, () => console.log("doogo class dev server → http://localhost:" + PORT + " (" + (process.env.TURSO_DATABASE_URL ? "Turso" : "SQLite " + process.env.CLASS_SQLITE) + ")"));
