#!/usr/bin/env node
// 공급사 사용법 안내 영상(애니메이션)을 mp4 파일로 뽑습니다. 카카오톡·유튜브 등으로 따로 공유할 때 씁니다.
// 준비: 로컬 개발 서버(vite, http://127.0.0.1:3100)가 켜져 있어야 하고(개발 서버에서만 /dev/guide-demo/:id 화면이 열림),
//       Playwright(크로미움)와 ffmpeg가 있어야 합니다. Playwright가 이 저장소 의존성이 아니면 PLAYWRIGHT_MODULE=설치 경로로 알려 줍니다.
// 사용: node scripts/render-guide-videos.mjs [영상id,영상id…] [출력 폴더]
//   예) node scripts/render-guide-videos.mjs overview,invoice ./guide-videos
// 결과: 720×1280(9:16) · 30fps · H.264 mp4 (소리 없음)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const ALL_IDS = ["overview", "apply", "order-sheet", "invoice", "cs", "settlement"];
const ids = (process.argv[2] || ALL_IDS.join(",")).split(",").map((id) => id.trim()).filter(Boolean);
const outDir = path.resolve(process.argv[3] || path.join(tmpdir(), "doogo-guide-videos"));
const baseUrl = (process.env.GUIDE_DEMO_BASE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
const fps = 30;
const tail = 0.6; // 마지막 화면을 조금 더 보여 줍니다(초)

function loadPlaywright() {
  for (const id of [process.env.PLAYWRIGHT_MODULE, "playwright"].filter(Boolean)) {
    try {
      return require(id);
    } catch {
      // 다음 후보를 찾습니다.
    }
  }
  throw new Error("playwright를 찾지 못했습니다. PLAYWRIGHT_MODULE=<playwright 설치 경로>로 알려 주세요.");
}

function startEncoder(file) {
  const ffmpeg = spawn("ffmpeg", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "medium", "-movflags", "+faststart", file], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((resolve, reject) => {
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg 종료 코드 ${code}`))));
  });
  const write = (buffer) => new Promise((resolve, reject) => {
    if (ffmpeg.stdin.write(buffer)) resolve();
    else ffmpeg.stdin.once("drain", resolve);
    ffmpeg.stdin.once("error", reject);
  });
  return { write, finish: async () => { ffmpeg.stdin.end(); await done; } };
}

const { chromium } = loadPlaywright();
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2 });
  for (const id of ids) {
    if (!ALL_IDS.includes(id)) throw new Error(`없는 영상 id: ${id} (${ALL_IDS.join(", ")})`);
    await page.goto(`${baseUrl}/dev/guide-demo/${id}`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.__guideDemo));
    await page.evaluate(() => document.fonts.ready);
    const duration = await page.evaluate(() => window.__guideDemo.duration);
    const frames = Math.ceil((duration + tail) * fps);
    const file = path.join(outDir, `doogo-supplier-guide-${id}.mp4`);
    const encoder = startEncoder(file);
    for (let frame = 0; frame < frames; frame += 1) {
      const time = Math.min(duration, frame / fps);
      await page.evaluate((value) => window.__guideDemo.seek(value), time);
      await encoder.write(await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 360, height: 640 } }));
    }
    await encoder.finish();
    console.log(`${id}: ${duration.toFixed(1)}초 → ${file}`);
  }
} finally {
  await browser.close();
}
