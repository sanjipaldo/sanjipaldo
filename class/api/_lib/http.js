"use strict";
const APP = "doogo-class";

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(Object.assign({ app: APP }, obj)));
}
async function body(req) {
  if (req.body !== undefined) return typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const t = Buffer.concat(chunks).toString("utf8");
  return t ? JSON.parse(t) : {};
}
function query(req) {
  if (req.query) return req.query;
  const u = new URL(req.url, "http://x");
  return Object.fromEntries(u.searchParams.entries());
}
/** 핸들러 감싸기: 메서드 확인 + 오류를 JSON 으로 */
function handler(methods, fn) {
  return async (req, res) => {
    try {
      if (methods.indexOf(req.method) === -1) return send(res, 405, { error: "method" });
      await fn(req, res);
    } catch (e) {
      console.error("[api]", req.method, req.url, e && e.stack ? e.stack : e);
      if (!res.headersSent) send(res, 500, { error: "server", message: String((e && e.message) || e).slice(0, 200) });
    }
  };
}
const ip = (req) => String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || (req.socket && req.socket.remoteAddress) || "").split(",")[0].trim();

module.exports = { send, body, query, handler, ip, APP };
