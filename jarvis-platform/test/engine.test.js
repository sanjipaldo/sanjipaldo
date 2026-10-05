"use strict";
const test = require("node:test");
const assert = require("node:assert");
const E = require("../src/engine");
const { createLiveProvider } = require("../src/providers");
const { buildMime } = require("../src/mail");
const { createCipher, hashPassword, verifyPassword } = require("../src/security");

test("도우미: 정규화·영상 ID·버전·치환·코드", () => {
  assert.strictEqual(E.normalize("후 커블!! 🎉"), "후커블");
  assert.strictEqual(E.extractVideoId("https://www.youtube.com/watch?v=L1X_BF5mha4&t=3"), "L1X_BF5mha4");
  assert.strictEqual(E.extractVideoId("https://youtu.be/L1X_BF5mha4"), "L1X_BF5mha4");
  assert.strictEqual(E.extractVideoId("https://youtube.com/shorts/L1X_BF5mha4"), "L1X_BF5mha4");
  assert.deepStrictEqual(E.parseVideoIds("https://youtu.be/L1X_BF5mha4, L1X_BF5mha4\nxx"), ["L1X_BF5mha4"]);
  assert.strictEqual(E.splitVariants(E.DEFAULT_REPLY).length, 2);
  assert.strictEqual(E.render("{name}/{x}", { name: "@a" }), "@a/{x}");
  assert.match(E.newCode(new Set()), /^[A-Z][A-Z2-9]{5}$/);
  const camps = [{ target: "videos", videos: ["v1"], keywords: ["후커블"], exact: true }];
  assert.ok(E.findCampaign(camps, "v1", "후커블!"));
  assert.ok(!E.findCampaign(camps, "v1", "후커블 주세요"));
  assert.ok(!E.findCampaign(camps, "v2", "후커블"));
});

test("보안: 비밀번호 해시와 토큰 암호화", () => {
  const h = hashPassword("admin");
  assert.ok(verifyPassword("admin", h));
  assert.ok(!verifyPassword("admin2", h));
  const c = createCipher("s");
  const enc = c.encrypt({ refresh: "r" });
  assert.ok(!enc.includes("r\""));
  assert.deepStrictEqual(c.decrypt(enc), { refresh: "r" });
  assert.strictEqual(createCipher("other").decrypt(enc), null);
});

test("실제 유튜브 제공자: API 호출 모양과 할당량 오류", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.includes("/commentThreads?")) {
      return new Response(JSON.stringify({ items: [{ id: "T1", snippet: { videoId: "V1", topLevelComment: { snippet: { textDisplay: "후커블", authorDisplayName: "@a", authorChannelId: { value: "UC_A" }, publishedAt: "2026-10-05T00:00:00Z" } } } }] }), { status: 200 });
    }
    if (url.includes("/comments?")) return new Response(JSON.stringify({ error: { message: "quota", errors: [{ reason: "quotaExceeded" }] } }), { status: 403 });
    return new Response("{}", { status: 200 });
  };
  const yt = createLiveProvider({ getToken: async () => "TOKEN", fetchImpl, apiBase: "https://yt.test" });
  const r = await yt.listThreads({ videoId: "V1" });
  assert.deepStrictEqual(r.items[0], { id: "T1", videoId: "V1", text: "후커블", author: "@a", authorChannelId: "UC_A", publishedAt: "2026-10-05T00:00:00Z" });
  assert.match(calls[0].url, /videoId=V1/);
  assert.strictEqual(calls[0].init.headers.authorization, "Bearer TOKEN");
  await assert.rejects(yt.reply("T1", "hi"), e => e.quota === true);
  assert.deepStrictEqual(JSON.parse(calls[1].init.body), { snippet: { parentId: "T1", textOriginal: "hi" } });
});

test("Gmail용 메일 본문: 한글 제목 인코딩", () => {
  const mime = buildMime({ from: "a@b.c", to: "x@y.z", subject: "[후커블] 링크", text: "안녕 https://x.y" });
  assert.match(mime, /Subject: =\?UTF-8\?B\?/);
  assert.match(mime, /multipart\/alternative/);
});
