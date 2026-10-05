"use strict";
/* 구글 OAuth (사용자마다 자기 유튜브 채널 · Gmail 연결)
   플랫폼 운영자가 Google Cloud 에서 OAuth 클라이언트를 만들고 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 을 넣어야 한다. */

const SCOPES = {
  youtube: ["https://www.googleapis.com/auth/youtube.force-ssl"],
  gmail: ["https://www.googleapis.com/auth/gmail.send", "openid", "email"],
};

function createGoogle({ clientId, clientSecret, fetchImpl = fetch, authBase = "https://accounts.google.com", tokenUrl = "https://oauth2.googleapis.com/token" }) {
  const configured = Boolean(clientId && clientSecret);

  function authUrl({ redirectUri, state, kind }) {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: (SCOPES[kind] || SCOPES.youtube).join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    return `${authBase}/o/oauth2/v2/auth?${params}`;
  }

  async function tokenRequest(body) {
    const res = await fetchImpl(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(Object.assign({ client_id: clientId, client_secret: clientSecret }, body)),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`구글 인증 실패: ${json.error_description || json.error || res.status}`);
    return json;
  }

  async function exchangeCode({ code, redirectUri }) {
    const t = await tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
    return { access: t.access_token, refresh: t.refresh_token, expiresAt: Date.now() + (t.expires_in - 60) * 1000, scope: t.scope || "" };
  }

  /** tokens 를 받아 유효한 access token 을 돌려준다. 갱신되면 onUpdate(tokens) 호출 */
  async function accessToken(tokens, onUpdate) {
    if (!tokens || !tokens.refresh) throw new Error("구글 계정이 연결되지 않았습니다");
    if (tokens.access && tokens.expiresAt > Date.now()) return tokens.access;
    const t = await tokenRequest({ refresh_token: tokens.refresh, grant_type: "refresh_token" });
    const next = Object.assign({}, tokens, { access: t.access_token, expiresAt: Date.now() + (t.expires_in - 60) * 1000 });
    if (onUpdate) onUpdate(next);
    return next.access;
  }

  return { configured, authUrl, exchangeCode, accessToken, SCOPES };
}

module.exports = { createGoogle, SCOPES };
