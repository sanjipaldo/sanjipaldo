"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { createApp } = require("../src/server");

async function start() {
  const app = createApp({ dataFile: null, port: 0, noScheduler: true, env: { BASE_URL: "https://jarvis.example" } });
  const port = await new Promise(r => app.listen(r));
  const base = `http://127.0.0.1:${port}`;
  const jar = {};
  async function req(method, path, form, opts = {}) {
    const headers = { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ") };
    let body;
    if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(form).toString(); }
    const res = await fetch(base + path, { method, headers, body, redirect: "manual" });
    const sc = res.headers.get("set-cookie");
    if (sc && !opts.noCookies) { const [kv] = sc.split(";"); const [k, v] = kv.split("="); if (v) jar[k] = v; else delete jar[k]; }
    return { status: res.status, location: res.headers.get("location"), text: await res.text() };
  }
  const csrfOf = html => (html.match(/name="_csrf" value="([^"]+)"/) || [])[1];
  return { app, req, csrfOf, jar, data: app.db.data };
}

test("admin/admin 로그인 → 유튜브 링크 넣기 → 키워드 댓글 자동 답글 → 신청 폼 → 레퍼럴 메일", async () => {
  const { app, req, csrfOf, data } = await start();
  try {
    assert.strictEqual((await req("GET", "/youtube")).location, "/login");
    assert.strictEqual((await req("POST", "/login", { username: "admin", password: "틀림" })).status, 400);
    const login = await req("POST", "/login", { username: "admin", password: "admin" });
    assert.strictEqual(login.location, "/hub");
    const hub = await req("GET", "/hub");
    assert.match(hub.text, /JARVIS AI/);
    assert.match(hub.text, /유튜브 채널 운영/);
    const dash = await req("GET", "/youtube");
    assert.match(dash.text, /테스트용 기본 비밀번호/);
    const csrf = csrfOf(dash.text);
    assert.ok(csrf);
    assert.strictEqual((await req("POST", "/youtube/run", { _csrf: "wrong" })).status, 403);

    // 가상 영상 올리고, 그 영상 링크로 빠른 시작
    await req("POST", "/youtube/demo/videos", { _csrf: csrf, title: "숏폼 훅 만드는 법" });
    const video = data.demoVideos[0];
    const created = await req("POST", "/youtube/campaigns", { _csrf: csrf, quick: "1", videos: `https://www.youtube.com/watch?v=${video.id}`, name: "후커블", keywords: "후커블", referralLink: "https://hookable.example/ref/SECRET" });
    assert.match(created.location, /^\/youtube\/campaigns\/\w+$/);
    const camp = data.campaigns[0];
    assert.deepStrictEqual(camp.videos, [video.id]);
    assert.strictEqual(camp.target, "videos");

    // 구독자 댓글 2개 (하나는 키워드 없음)
    await req("POST", "/youtube/demo/comments", { _csrf: csrf, videoId: video.id, author: "@minji", text: "후 커 블 신청합니다!" });
    await req("POST", "/youtube/demo/comments", { _csrf: csrf, videoId: video.id, author: "@tom", text: "영상 잘 봤어요" });
    await req("POST", "/youtube/run", { _csrf: csrf });
    const rep = data.replies.find(r => r.status === "답글완료");
    assert.ok(rep, JSON.stringify(data.replies));
    assert.strictEqual(data.replies.length, 1);
    const demoReply = data.demoComments.find(c => c.parentId);
    assert.ok(demoReply.text.includes(`https://jarvis.example/f/${camp.slug}?c=${rep.code}`), demoReply.text);
    assert.ok(demoReply.text.includes("@minji"));
    assert.ok(!demoReply.text.includes("SECRET"), "레퍼럴 링크는 댓글에 나가면 안 됨");

    // 다시 확인해도 같은 댓글에 또 달지 않음
    await req("POST", "/youtube/run", { _csrf: csrf });
    assert.strictEqual(data.demoComments.filter(c => c.parentId).length, 1);

    // 구독자 신청 폼 (로그인 없이)
    const form = await req("GET", `/f/${camp.slug}?c=${rep.code}`, null, { noCookies: true });
    assert.strictEqual(form.status, 200);
    assert.match(form.text, new RegExp(`value="${rep.code}"`));
    const noConsent = await req("POST", `/f/${camp.slug}`, { email: "minji@test.com", code: rep.code });
    assert.match(noConsent.text, /동의해 주세요/);
    const ok = await req("POST", `/f/${camp.slug}`, { email: "minji@test.com", code: rep.code.toLowerCase(), consent: "on" });
    assert.match(ok.text, /신청 완료/);
    const mail = data.emails.find(e => e.to === "minji@test.com");
    assert.strictEqual(mail.status, "미리보기");
    assert.ok(mail.text.includes("https://hookable.example/ref/SECRET"));
    assert.ok(mail.text.includes("@minji"));

    const stolen = await req("POST", `/f/${camp.slug}`, { email: "thief@test.com", code: rep.code, consent: "on" });
    assert.match(stolen.text, /이미 사용된 인증코드/);
    const wrong = await req("POST", `/f/${camp.slug}`, { email: "x@test.com", code: "ZZZZZZ", consent: "on" });
    assert.match(wrong.text, /인증코드를 찾을 수 없습니다/);
    assert.strictEqual(data.emails.length, 1);
    assert.deepStrictEqual(data.submissions.map(s => s.status), ["동의 안 함", "미리보기", "이미 사용된 코드", "코드 없음"]);

    const page = await req("GET", `/youtube/campaigns/${camp.id}`);
    assert.match(page.text, /minji@test.com/);
    const emails = await req("GET", "/youtube/emails");
    assert.match(emails.text, /요청하신 전용 레퍼럴 링크/);
  } finally {
    await app.close();
  }
});

test("채널 전체 캠페인: 새 영상 자동 감지 → 안내 댓글 → 새 영상 댓글에도 답글", async () => {
  const { app, req, csrfOf, data } = await start();
  try {
    await req("POST", "/login", { username: "admin", password: "admin" });
    const csrf = csrfOf((await req("GET", "/youtube")).text);
    await req("POST", "/youtube/campaigns", { _csrf: csrf, quick: "1", videos: "", name: "후커블", keywords: "후커블", referralLink: "https://hookable.example/ref/X" });
    assert.strictEqual(data.campaigns[0].target, "channel");
    await req("POST", "/youtube/settings", { _csrf: csrf, mode: "demo", intervalMin: "10", dailyLimit: "150", firstHours: "168", newVideoAuto: "on", notifyEmail: "owner@test.com" });
    await req("POST", "/youtube/run", { _csrf: csrf });            // 처음: 기준 시점 기록
    await new Promise(r => setTimeout(r, 5));
    await req("POST", "/youtube/demo/videos", { _csrf: csrf, title: "새 영상!" });
    const v = data.demoVideos[0];
    await req("POST", "/youtube/run", { _csrf: csrf });
    assert.strictEqual(data.newVideos.length, 1);
    assert.strictEqual(data.newVideos[0].status, "안내 완료");
    const notice = data.demoComments.find(c => c.pinnedNotice);
    assert.match(notice.text, /"후커블"/);
    assert.ok(data.emails.some(e => e.to === "owner@test.com" && /새 영상 감지/.test(e.subject)));

    await req("POST", "/youtube/demo/comments", { _csrf: csrf, videoId: v.id, author: "@new", text: "후커블" });
    await req("POST", "/youtube/run", { _csrf: csrf });
    assert.strictEqual(data.replies.filter(r => r.status === "답글완료").length, 1, "자비스 자신의 안내 댓글에는 답하지 않음");
    await req("POST", "/youtube/run", { _csrf: csrf });
    assert.strictEqual(data.newVideos.length, 1);
  } finally {
    await app.close();
  }
});

test("가입한 사용자는 자기 캠페인만 보고, 관리자 화면에 못 들어감", async () => {
  const { app, req, csrfOf, data } = await start();
  try {
    await req("POST", "/login", { username: "admin", password: "admin" });
    let csrf = csrfOf((await req("GET", "/youtube")).text);
    await req("POST", "/youtube/campaigns", { _csrf: csrf, quick: "1", videos: "", name: "A사", keywords: "a사", referralLink: "https://a.example" });
    const adminCamp = data.campaigns[0];
    await req("POST", "/logout", { _csrf: csrf });

    assert.match((await req("POST", "/signup", { username: "Creator1", password: "short", password2: "short" })).text, /8자 이상/);
    const signup = await req("POST", "/signup", { username: "creator1", password: "password123", password2: "password123" });
    assert.strictEqual(signup.location, "/hub");
    csrf = csrfOf((await req("GET", "/youtube")).text);
    assert.strictEqual((await req("GET", `/youtube/campaigns/${adminCamp.id}`)).status, 404);
    assert.strictEqual((await req("GET", "/admin")).status, 404);
    const bad = await req("POST", "/youtube/campaigns", { _csrf: csrf, quick: "1", videos: "not a link", name: "B", keywords: "b", referralLink: "https://b.example" });
    assert.strictEqual(bad.location, "/youtube");
    assert.strictEqual(data.campaigns.length, 1);
    const leak = await req("POST", "/youtube/campaigns", { _csrf: csrf, name: "C", target: "channel", keywords: "c", referralLink: "https://c.example/r", replyTemplate: "링크 https://c.example/r" });
    assert.match(leak.text, /레퍼럴 링크를 넣지 마세요/);

    await req("POST", "/settings/password", { _csrf: csrf, current: "password123", next: "newpassword9" });
    await req("POST", "/logout", { _csrf: csrf });
    assert.strictEqual((await req("POST", "/login", { username: "creator1", password: "newpassword9" })).location, "/hub");
  } finally {
    await app.close();
  }
});
