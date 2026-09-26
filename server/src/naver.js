"use strict";
/* 네이버 커머스API 클라이언트 (스마트스토어)
   - 두고는 '커머스솔루션' 또는 'API 대행사'로 등록한 애플리케이션 하나(client_id/secret)를 쓴다.
     셀러의 '내 스토어 애플리케이션' 키를 받아 쓰는 것은 네이버 정책상 금지라, 셀러에게는 판매자 계정 ID만 받는다.
   - 토큰: POST /external/v1/oauth2/token (application/x-www-form-urlencoded)
     client_secret_sign = base64( bcrypt( `${client_id}_${timestamp}`, client_secret ) )
     type=SELLER, account_id=셀러 계정 ID → 그 셀러 스토어용 토큰
   - 상품 이미지는 외부 URL을 바로 쓸 수 없어 /external/v1/product-images/upload 로 먼저 올린 뒤 받은 URL을 쓴다.
   - 스마트스토어는 상품 삭제 API가 있다: DELETE /external/v2/products/origin-products/{originProductNo} */
const bcrypt = require("bcryptjs");

const DEFAULT_BASE = "https://api.commerce.naver.com/external";

function clientSecretSign(clientId, clientSecret, timestamp) {
  const hashed = bcrypt.hashSync(`${clientId}_${timestamp}`, clientSecret);
  return Buffer.from(hashed, "utf8").toString("base64");
}

class NaverError extends Error {
  constructor(message, status, body) { super(message); this.name = "NaverError"; this.status = status; this.body = body; }
}

function createNaverClient({ clientId, clientSecret, accountId }, { baseUrl = process.env.NAVER_API_BASE || DEFAULT_BASE, fetchImpl = fetch, now = () => Date.now() } = {}) {
  if (!clientId || !clientSecret) throw new Error("두고 서버에 네이버 커머스API 애플리케이션(client_id/secret)이 설정되지 않았어요.");
  if (!accountId) throw new Error("스마트스토어 판매자 계정 ID가 필요해요.");
  let cached = null;

  async function token() {
    if (cached && cached.expiresAt - 60_000 > now()) return cached.accessToken;
    const timestamp = now();
    const form = new URLSearchParams({ client_id: clientId, timestamp: String(timestamp), client_secret_sign: clientSecretSign(clientId, clientSecret, timestamp), grant_type: "client_credentials", type: "SELLER", account_id: accountId });
    const res = await fetchImpl(`${baseUrl}/v1/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) throw new NaverError(data.message || `네이버 토큰 발급 실패 (${res.status})`, res.status, data);
    cached = { accessToken: data.access_token, expiresAt: now() + Number(data.expires_in || 10800) * 1000 };
    return cached.accessToken;
  }

  async function call(method, path, { body, headers = {}, raw = false } = {}) {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await token()}`, ...(raw ? {} : { "Content-Type": "application/json" }), ...headers },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body)
    });
    const text = await res.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!res.ok) throw new NaverError(data.message || `네이버 커머스API 오류 (${res.status})`, res.status, data);
    return data;
  }

  /* 공급사 이미지 URL을 받아 네이버 이미지 서버에 올린다 (요청은 스토어당 한 번에 하나씩) */
  async function uploadImagesFromUrls(urls) {
    const form = new FormData();
    for (const [index, url] of urls.entries()) {
      const res = await fetchImpl(url);
      if (!res.ok) throw new NaverError(`이미지를 가져오지 못했어요: ${url}`, res.status, {});
      const type = res.headers.get("content-type") || "image/jpeg";
      const blob = new Blob([await res.arrayBuffer()], { type });
      form.append("imageFiles", blob, `doogo-${index + 1}.${type.includes("png") ? "png" : "jpg"}`);
    }
    const data = await call("POST", "/v1/product-images/upload", { body: form, raw: true });
    return (data.images || []).map(image => image.url);
  }

  return {
    accountId,
    token,
    verify: async () => ({ ok: Boolean(await token()) }),
    uploadImagesFromUrls,
    createProduct: payload => call("POST", "/v2/products", { body: payload }),
    getProduct: originProductNo => call("GET", `/v2/products/origin-products/${originProductNo}`),
    updateProduct: (originProductNo, payload) => call("PUT", `/v2/products/origin-products/${originProductNo}`, { body: payload }),
    changeStatus: (originProductNo, statusType, stockQuantity) => call("PUT", `/v1/products/origin-products/${originProductNo}/change-status`, { body: { statusType, ...(stockQuantity === undefined ? {} : { stockQuantity }) } }),
    deleteProduct: originProductNo => call("DELETE", `/v2/products/origin-products/${originProductNo}`)
  };
}

module.exports = { createNaverClient, clientSecretSign, NaverError };
