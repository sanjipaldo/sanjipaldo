"use strict";
/* 비밀번호 해시(scrypt), 세션, 토큰 암호화(AES-256-GCM) */
const crypto = require("node:crypto");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const actual = crypto.scryptSync(String(password), salt, 32);
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function createCipher(secret) {
  const key = crypto.createHash("sha256").update(String(secret)).digest();
  return {
    encrypt(value) {
      if (value === undefined || value === null || value === "") return "";
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv("aes-256-gcm", key, iv);
      const enc = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
      return [iv, c.getAuthTag(), enc].map(b => b.toString("base64")).join(".");
    },
    decrypt(text) {
      if (!text) return null;
      try {
        const [iv, tag, enc] = String(text).split(".").map(s => Buffer.from(s, "base64"));
        const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
        d.setAuthTag(tag);
        return JSON.parse(Buffer.concat([d.update(enc), d.final()]).toString("utf8"));
      } catch (e) {
        return null;
      }
    },
  };
}

const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString("base64url");

/** 아주 단순한 시도 횟수 제한 (로그인·폼 제출 남용 방지) */
function createRateLimiter(limit, windowMs) {
  const hits = new Map();
  return key => {
    const now = Date.now();
    const list = (hits.get(key) || []).filter(t => now - t < windowMs);
    list.push(now);
    hits.set(key, list);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k);
    return list.length <= limit;
  };
}

module.exports = { hashPassword, verifyPassword, createCipher, randomToken, createRateLimiter };
