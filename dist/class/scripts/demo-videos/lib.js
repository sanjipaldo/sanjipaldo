/* 첫 화면(home.js) 데모 영상 녹화 도구
 * 실제 화면을 CDP 스크린캐스트로 찍고(선명), 마우스 커서 · 클릭 효과를 그려 넣고, 이름은 OOO 로 가린다.
 * 화면이 바뀌어 영상을 다시 찍을 때:
 *   1) class/ 에서 정적 서버 켜기 (이 브라우저 저장 모드):  python3 -m http.server 4321
 *   2) node class/scripts/demo-videos/scenes.js lp free home care student admin
 *   3) out/ 의 v-*.mp4 · v-*.jpg 를 assets/home/ 으로 (jpg → webp, mp4 → webm 도 만들기, README 참고)
 *   4) 수강생 화면 · 강사센터 영상의 장(chapter) 시각이 바뀌면 home.js STUDENT_TABS · ADMIN_TABS 의 at 을 맞춘다
 * 필요한 것: playwright(크로미움), ffmpeg */
let chromium;
try { ({ chromium } = require("playwright")); } catch (e) { ({ chromium } = require("/opt/node22/lib/node_modules/playwright")); }
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const B = process.env.B || "http://localhost:4321/";
const SP = __dirname;
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const CHROME = process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

// 화면에 보이는 실명 가리기 (긴 것부터)
const MAP = [
  ["두고보는 문대표", "두고보는 OOO"], ["이수진님", "OOO 수강생님"], ["1기 체험단님", "OOO 수강생님"], ["2기 체험단님", "OOO 수강생님"],
  ["문원오 강사님", "OOO 강사님"], ["문원오 강사", "OOO 강사"], ["문대표", "OOO 강사"], ["이수진", "OOO"], ["1기 체험단", "OOO"], ["2기 체험단", "OOO"], ["문원오", "OOO"]
];
const CURSOR_SVG = '<svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg"><path d="M6 3.5 L24 15.2 L16.2 16.6 L20.6 25.4 L17 27.1 L12.6 18.3 L6 23.6 Z" fill="#141a24" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/></svg>';

const INIT = `(() => {
  const MAP = ${JSON.stringify(MAP)};
  const fix = (n) => {
    const o = n.nodeValue; if (!o) return;
    let t = o;
    for (const [a, b] of MAP) if (t.indexOf(a) > -1) t = t.split(a).join(b);
    t = t.replace(/뒷자리 \\d{4}/g, "뒷자리 ••••");
    if (/^\\s*\\d{4}\\s*$/.test(t) && n.parentElement && n.parentElement.closest("td")) t = "••••";
    if (t !== o) n.nodeValue = t;
  };
  const walk = (root) => {
    if (root.nodeType === 3) { fix(root); return; }
    if (root.nodeType !== 1) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); while (w.nextNode()) fix(w.currentNode);
    root.querySelectorAll && root.querySelectorAll("input, textarea").forEach((i) => { if (/이수진|문원오|문대표/.test(i.value)) i.value = i.value.replace(/문원오|이수진/g, "OOO").replace(/문대표/g, "OOO 강사"); });
  };
  const start = () => {
    walk(document.body);
    new MutationObserver((ms) => { for (const m of ms) { if (m.type === "characterData") fix(m.target); else m.addedNodes.forEach(walk); } })
      .observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();

  const SVG = ${JSON.stringify(CURSOR_SVG)};
  const TIPX = 6, TIPY = 3.5;
  let x = innerWidth * 0.66, y = innerHeight * 0.74, s = 1, el = null, vis = 1;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const place = () => { if (el) { el.style.transform = "translate(" + (x - TIPX) + "px," + (y - TIPY) + "px) scale(" + s + ")"; el.style.opacity = vis; } };
  const ensure = () => {
    if (el && el.isConnected) return el;
    el = document.createElement("div");
    el.id = "__cur"; el.innerHTML = SVG;
    el.style.cssText = "position:fixed;left:0;top:0;width:30px;height:30px;z-index:2147483647;pointer-events:none;transform-origin:6px 3.5px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));transition:opacity .25s";
    document.documentElement.appendChild(el); place(); return el;
  };
  const frame = (fn, ms) => new Promise((res) => { const t0 = performance.now(); (function step(now) { const k = Math.min(1, (now - t0) / ms); fn(ease(k)); if (k < 1) requestAnimationFrame(step); else res(); })(t0); });
  window.__demo = {
    ensure,
    set(nx, ny) { x = nx; y = ny; ensure(); place(); },
    move(tx, ty, ms) {
      ensure(); const sx = x, sy = y, d = Math.hypot(tx - sx, ty - sy);
      ms = ms || Math.min(1000, Math.max(380, d * 1.25));
      const bend = Math.min(40, d * 0.12);
      return frame((e) => { x = sx + (tx - sx) * e; y = sy + (ty - sy) * e - Math.sin(Math.PI * e) * bend; place(); }, ms);
    },
    click() {
      ensure();
      const r = document.createElement("div");
      r.style.cssText = "position:fixed;left:" + (x - 22) + "px;top:" + (y - 22) + "px;width:44px;height:44px;border-radius:50%;background:rgba(210,52,40,.2);border:2px solid rgba(210,52,40,.9);z-index:2147483646;pointer-events:none;transform:scale(.25);opacity:1;transition:transform .55s cubic-bezier(.2,.8,.2,1),opacity .55s ease";
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => requestAnimationFrame(() => { r.style.transform = "scale(1.45)"; r.style.opacity = "0"; }));
      setTimeout(() => r.remove(), 700);
      s = 0.8; place();
      return new Promise((res) => setTimeout(() => { s = 1; place(); res(); }, 150));
    },
    scrollTo(target, ms, sel) {
      const sc = sel ? document.querySelector(sel) : document.scrollingElement;
      const from = sc.scrollTop, max = sc.scrollHeight - sc.clientHeight;
      target = Math.max(0, Math.min(max, target));
      ms = ms || Math.min(1500, Math.max(500, Math.abs(target - from) * 0.8));
      return frame((e) => { sc.scrollTop = from + (target - from) * e; }, ms);
    },
    hide() { vis = 0; ensure(); place(); },
    show() { vis = 1; ensure(); place(); }
  };
})();`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function browser() {
  return chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME } : {});
}
async function context(b, kind) {
  const mobile = kind === "phone";
  const c = await b.newContext(mobile
    ? { viewport: { width: 390, height: 792 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });
  // 유튜브 썸네일은 회색 그림으로 (녹화 환경에서 유튜브에 못 갈 때)
  const thumb = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="480" height="270" fill="#3a3f47"/></svg>';
  await c.route(/ytimg|img\.youtube/, (r) => r.fulfill({ status: 200, contentType: "image/svg+xml", body: thumb }));
  // 유튜브 플레이어는 썸네일 + 재생 버튼으로 대신 (녹화 환경에서는 유튜브에 못 감)
  await c.route(/youtube(-nocookie)?\.com\/embed/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: '<html><body style="margin:0;background:#000"><div style="position:absolute;inset:0;background:url(https://i.ytimg.com/vi/x/hqdefault.jpg) center/cover"></div><div style="position:absolute;left:50%;top:50%;width:68px;height:48px;margin:-24px 0 0 -34px;border-radius:12px;background:#f00"><div style="position:absolute;left:27px;top:14px;border-left:18px solid #fff;border-top:10px solid transparent;border-bottom:10px solid transparent"></div></div></body></html>' }));
  await c.route(/googleapis|gstatic|naver\.com|kakao/, (r) => r.abort());
  await c.addInitScript(INIT);
  return c;
}

/* 한 장면 녹화 → { frames:[{data,t}], marks:[[name,t]], t0, t1 } */
async function record(p, run) {
  const vp = p.viewportSize();
  const dpr = await p.evaluate(() => devicePixelRatio);
  const cdp = await p.context().newCDPSession(p);
  const frames = [], marks = [];
  cdp.on("Page.screencastFrame", (f) => {
    frames.push({ data: f.data, t: f.metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await p.evaluate(() => { const t = document.getElementById("toast-root"); if (t) t.innerHTML = ""; __demo.ensure(); });
  await sleep(150);
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: Math.round(vp.width * dpr), maxHeight: Math.round(vp.height * dpr), everyNthFrame: 1 });
  // 처음 한 장이 들어오게 커서를 살짝 움직인다
  await p.evaluate(() => __demo.move(innerWidth * 0.66 + 2, innerHeight * 0.74, 120));
  const t0 = Date.now() / 1000;
  await run((name) => marks.push([name, Date.now() / 1000]));
  await sleep(120);
  const t1 = Date.now() / 1000;
  await cdp.send("Page.stopScreencast");
  await cdp.detach().catch(() => {});
  return { frames, marks, t0, t1 };
}

/* 장면들을 이어 붙여 mp4 로 (+ 첫 장면 사진) → 장(chapter) 시작 시각(초) */
function encode(recs, out, w, h, crf) {
  const dir = fs.mkdtempSync(path.join(SP, "f-"));
  const lines = [];
  let n = 0, clock = 0;
  const chapters = [];
  recs.forEach((rec) => {
    const fr = rec.frames.filter((f) => f.t >= rec.t0 - 0.05);
    if (!fr.length) return;
    const base = fr[0].t;
    rec.marks.forEach(([name, t]) => chapters.push([name, +(clock + Math.max(0, t - base)).toFixed(2)]));
    fr.forEach((f, i) => {
      const file = path.join(dir, "f" + String(++n).padStart(6, "0") + ".jpg");
      fs.writeFileSync(file, Buffer.from(f.data, "base64"));
      const next = i + 1 < fr.length ? fr[i + 1].t : rec.t1;
      const dur = Math.max(1 / 60, next - f.t);
      lines.push("file '" + file + "'", "duration " + dur.toFixed(4));
      clock += dur;
    });
  });
  lines.push(lines[lines.length - 2]); // concat: 마지막 장은 한 번 더
  fs.writeFileSync(path.join(dir, "list.txt"), lines.join("\n"));
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.txt"),
    "-vf", "fps=30,scale=" + w + ":" + h + ":flags=lanczos,format=yuv420p",
    "-c:v", "libx264", "-preset", "slow", "-crf", String(crf || 27), "-profile:v", "high", "-movflags", "+faststart", "-an", out]);
  // 포스터 = 첫 장면
  const poster = out.replace(/\.mp4$/, ".jpg");
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", out, "-frames:v", "1", "-q:v", "4", poster]);
  fs.rmSync(dir, { recursive: true, force: true });
  return { chapters, duration: +clock.toFixed(2) };
}

/* 커서 조작 */
async function box(p, sel, nth) {
  const hs = await p.$$(sel);
  const h = hs[nth || 0];
  if (!h) throw new Error("없음: " + sel);
  return { h, b: await h.boundingBox() };
}
/** 요소가 화면 안에 오도록 부드럽게 스크롤 (at: 화면 위에서 몇 % 지점에 둘지) */
async function reveal(p, sel, opts) {
  opts = opts || {};
  let { h, b } = await box(p, sel, opts.nth);
  const vh = p.viewportSize().height, top = opts.top == null ? 90 : opts.top;
  if (b.y < top || b.y + Math.min(b.height, vh * 0.5) > vh - 30) {
    await p.evaluate(([dy, at, ms, s]) => __demo.scrollTo((s ? document.querySelector(s).scrollTop : scrollY) + dy - innerHeight * at, ms, s), [b.y, opts.at == null ? 0.35 : opts.at, opts.ms || 0, opts.scroller || null]);
    await sleep(120);
    b = await h.boundingBox();
  }
  return { h, b };
}
async function point(p, sel, opts) {
  opts = opts || {};
  const { h, b } = await reveal(p, sel, opts);
  const x = b.x + (opts.fx == null ? 0.5 : opts.fx) * b.width + (opts.dx || 0);
  const y = b.y + (opts.fy == null ? 0.5 : opts.fy) * b.height + (opts.dy || 0);
  await p.evaluate(([x, y, ms]) => __demo.move(x, y, ms), [x, y, opts.moveMs || 0]);
  return h;
}
async function tap(p, sel, opts) {
  opts = opts || {};
  const h = await point(p, sel, opts);
  await sleep(opts.before == null ? 160 : opts.before);
  await p.evaluate(() => __demo.click());
  await h.evaluate((el) => (el.tagName === "SUMMARY" ? el.parentElement.toggleAttribute("open") : el.click()));
  await sleep(opts.after == null ? 900 : opts.after);
  return h;
}
async function scrollBy(p, dy, ms, scroller) {
  await p.evaluate(([dy, ms, s]) => __demo.scrollTo((s ? document.querySelector(s).scrollTop : scrollY) + dy, ms, s), [dy, ms || 0, scroller || null]);
}
async function scrollTop(p, y, ms, scroller) {
  await p.evaluate(([y, ms, s]) => __demo.scrollTo(y, ms, s), [y, ms || 0, scroller || null]);
}
async function moveTo(p, fx, fy, ms) {
  await p.evaluate(([fx, fy, ms]) => __demo.move(innerWidth * fx, innerHeight * fy, ms), [fx, fy, ms || 0]);
}
async function type(p, sel, text, delay) {
  await p.focus(sel);
  await p.type(sel, text, { delay: delay || 28 });
}
/** 화면 이동 (녹화 중 · 커서는 그대로) */
async function go(p, hash, wait) {
  await p.evaluate((h) => { location.hash = h; }, hash);
  await sleep(wait || 700);
  await p.evaluate(() => { window.scrollTo(0, 0); const t = document.getElementById("toast-root"); if (t) t.innerHTML = ""; });
}
async function studentLogin(p, name, pw) {
  await p.goto(B + "#/login"); await sleep(700);
  if (await p.$("[data-action=pick-instructor][data-id=moon]")) { await p.click("[data-action=pick-instructor][data-id=moon]"); await sleep(300); }
  await p.fill("#lg-name", name); await p.fill("#lg-phone", pw); await p.click("#login-form button[type=submit]"); await sleep(1200);
  // 첫 로그인 안내 팝업 등은 닫기
  for (let i = 0; i < 3; i++) { const m = await p.$("#modal-root > *"); if (!m) break; const btn = await p.$("#modal-root .btn-primary, #modal-root [data-action=modal-close], #modal-root button"); if (btn) await btn.click(); await sleep(300); }
}

module.exports = { B, SP, MAP, browser, context, record, encode, sleep, box, reveal, point, tap, scrollBy, scrollTop, moveTo, type, go, studentLogin };
