"use strict";
/* 셀러 쇼핑몰 키 보관소. 키는 브라우저에 남기지 않고 서버에서만 AES-256-GCM으로 암호화해 파일에 둔다.
   DOOGO_SECRET_KEY: 32바이트 키 (hex 64자 또는 base64). 운영에서는 KMS 같은 키 관리 서비스로 바꾸는 것을 권장. */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function loadKey(raw = process.env.DOOGO_SECRET_KEY) {
  if (!raw) throw new Error("DOOGO_SECRET_KEY 환경변수가 필요해요 (32바이트 키).");
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("DOOGO_SECRET_KEY는 32바이트여야 해요.");
  return key;
}

function encrypt(key, value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}

function decrypt(key, box) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(box.iv, "base64"));
  decipher.setAuthTag(Buffer.from(box.tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(box.data, "base64")), decipher.final()]).toString("utf8"));
}

function mask(value) { const text = String(value || ""); return text.length <= 4 ? "••••" : `••••••••${text.slice(-4)}`; }

function createCredentialStore({ file = process.env.DOOGO_CREDENTIAL_FILE || path.join(__dirname, "..", "data", "credentials.enc.json"), key = loadKey() } = {}) {
  const read = () => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; } };
  const write = all => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(all, null, 2), { mode: 0o600 }); };
  return {
    save(sellerLoginId, channel, credentials) {
      const all = read();
      all[`${sellerLoginId}:${channel}`] = encrypt(key, credentials);
      write(all);
      return Object.fromEntries(Object.entries(credentials).map(([name, value]) => [name, /secret|key/i.test(name) ? mask(value) : value]));
    },
    get(sellerLoginId, channel) {
      const box = read()[`${sellerLoginId}:${channel}`];
      if (!box) throw Object.assign(new Error("이 쇼핑몰은 아직 연결되지 않았어요."), { status: 404 });
      return decrypt(key, box);
    },
    remove(sellerLoginId, channel) { const all = read(); delete all[`${sellerLoginId}:${channel}`]; write(all); }
  };
}

module.exports = { createCredentialStore, encrypt, decrypt, mask, loadKey };
