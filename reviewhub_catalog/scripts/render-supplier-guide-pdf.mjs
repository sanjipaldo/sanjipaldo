#!/usr/bin/env node
// 두고푸드 공급사 설명서 PDF(공급사 센터 사용 설명서, 16:9 슬라이드)를 만듭니다: apps/server/assets/guide/supplier-guide.html → Chromium PDF.
// 공급사 센터 위 줄 "공급사 안내" 버튼이 여는 PDF입니다(버튼 링크는 apps/client/src/pages/supplier/supplier-guide.tsx).
// 사용: node scripts/render-supplier-guide-pdf.mjs [출력 PDF 경로] [--png <쪽 그림 폴더>]
//   --png 를 붙이면 확인용으로 쪽마다 PNG도 저장합니다.
// 준비: Playwright(크로미움). 저장소 의존성이 아니면 PLAYWRIGHT_MODULE=<설치 경로>로 알려 줍니다.
//       글꼴은 Pretendard(SIL OFL)를 씁니다. PRETENDARD_DIR=<Pretendard-*.otf 폴더>가 없으면 npm에서 받아 임시 폴더에 둡니다.
// 화면 그림(apps/server/assets/guide/shots/*.jpg)은 로컬 DB의 예시 계정(봄날농원)으로 찍은 것입니다.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetDir = path.join(root, "apps/server/assets/guide");
const proposalDir = path.join(root, "apps/server/assets/proposal");
const brandDir = path.join(root, "apps/client/public/assets/brand");
const iconDir = path.join(root, "apps/client/node_modules/lucide-react/dist/esm/icons");
const args = process.argv.slice(2);
const pngIndex = args.indexOf("--png");
const pngDir = pngIndex >= 0 ? path.resolve(args[pngIndex + 1] || path.join(tmpdir(), "doogo-supplier-guide-png")) : null;
const outArg = args.find((arg, index) => !arg.startsWith("--") && (pngIndex < 0 || index !== pngIndex + 1));
const outPdf = path.resolve(outArg || path.join(tmpdir(), "doogo-food-supplier-guide.pdf"));
const PRETENDARD_VERSION = "1.3.9";

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

function fontDir() {
  if (process.env.PRETENDARD_DIR) return path.resolve(process.env.PRETENDARD_DIR);
  const cache = path.join(tmpdir(), `doogo-pretendard-${PRETENDARD_VERSION}`);
  const dir = path.join(cache, "package/dist/public/static");
  if (!existsSync(path.join(dir, "Pretendard-Bold.otf"))) {
    mkdirSync(cache, { recursive: true });
    execFileSync("npm", ["pack", `pretendard@${PRETENDARD_VERSION}`, "--silent"], { cwd: cache, stdio: ["ignore", "pipe", "inherit"] });
    execFileSync("tar", ["-xzf", `pretendard-${PRETENDARD_VERSION}.tgz`], { cwd: cache });
  }
  return dir;
}

// lucide 아이콘(ISC) → SVG 문자열
const iconCache = new Map();
function iconSvg(name) {
  if (iconCache.has(name)) return iconCache.get(name);
  const source = readFileSync(path.join(iconDir, `${name}.mjs`), "utf8");
  // 옛 이름(예: circle-help)은 새 이름 파일을 다시 내보내기만 하므로 그 파일을 읽습니다.
  const alias = source.match(/export \{ default \} from '\.\/([a-z0-9-]+)\.mjs';/);
  if (alias) {
    const svg = iconSvg(alias[1]);
    iconCache.set(name, svg);
    return svg;
  }
  const match = source.match(/const __iconNode = (\[[\s\S]*?\]);\n/);
  if (!match) throw new Error(`아이콘을 읽지 못했습니다: ${name}`);
  const nodes = Function(`"use strict"; return (${match[1]});`)();
  const inner = nodes.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([key]) => key !== "key").map(([key, value]) => `${key}="${value}"`).join(" ")}/>`).join("");
  const svg = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  iconCache.set(name, svg);
  return svg;
}

const fonts = fontDir();
const url = (dir) => pathToFileURL(dir).href;
const html = readFileSync(path.join(assetDir, "supplier-guide.html"), "utf8")
  .replaceAll("{{FONT_DIR}}", url(fonts))
  .replaceAll("{{BRAND_DIR}}", url(brandDir))
  .replaceAll("{{ASSET_DIR}}", url(assetDir))
  .replaceAll("{{PROPOSAL_DIR}}", url(proposalDir))
  .replace(/<i class="ic" data-icon="([a-z0-9-]+)"><\/i>/g, (_, name) => iconSvg(name));
if (/\{\{[A-Z_]+\}\}/.test(html)) throw new Error("바꾸지 못한 자리 표시가 남아 있습니다.");
if (html.includes("발주오라")) throw new Error("공급사에게 보이는 설명서에는 주문 프로그램 이름을 쓰지 않습니다.");
const workDir = path.join(tmpdir(), "doogo-supplier-guide-render");
mkdirSync(workDir, { recursive: true });
const htmlPath = path.join(workDir, "supplier-guide.html");
writeFileSync(htmlPath, html);

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const failed = [];
  page.on("requestfailed", (request) => failed.push(request.url()));
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  if (failed.length) throw new Error(`불러오지 못한 파일: ${failed.join(", ")}`);
  const check = await page.evaluate(() => ({
    pages: document.querySelectorAll(".page").length,
    missingFonts: [...document.fonts].filter((font) => font.status !== "loaded").map((font) => `${font.family} ${font.weight}`),
    brokenImages: [...document.images].filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.src.split("/").pop()),
    overflow: [...document.querySelectorAll(".page")].map((section, index) => {
      const box = section.getBoundingClientRect();
      // data-bleed는 오른쪽으로만 넘칠 수 있습니다. 쪽 아래로 넘친 그림은 PDF에서 통째로 빠지므로(화면 그림에는 보여도) 늘 걸러 냅니다.
      const over = [...section.querySelectorAll("*")].filter((el) => {
        if (el.closest(".shot") || el.closest("svg")) return false;
        const r = el.getBoundingClientRect();
        if (r.width <= 0) return false;
        return r.bottom > box.bottom + 0.5 || (!el.closest("[data-bleed]") && r.right > box.right + 0.5);
      }).length;
      return over ? `${index + 1}쪽: 넘친 요소 ${over}개` : null;
    }).filter(Boolean)
  }));
  if (check.missingFonts.length) throw new Error(`글꼴을 불러오지 못했습니다: ${check.missingFonts.join(", ")}`);
  if (check.brokenImages.length) throw new Error(`그림을 불러오지 못했습니다: ${check.brokenImages.join(", ")}`);
  if (check.overflow.length) console.warn("⚠ 쪽 밖으로 넘친 요소:", check.overflow.join(" / "));
  mkdirSync(path.dirname(outPdf), { recursive: true });
  await page.pdf({ path: outPdf, preferCSSPageSize: true, printBackground: true });
  const bytes = readFileSync(outPdf);
  console.log(`PDF ${check.pages}쪽 · ${(bytes.length / 1024 / 1024).toFixed(1)}MB → ${outPdf}`);
  if (pngDir) {
    mkdirSync(pngDir, { recursive: true });
    const sections = await page.locator(".page").all();
    for (const [index, section] of sections.entries()) {
      await section.screenshot({ path: path.join(pngDir, `page-${String(index + 1).padStart(2, "0")}.png`) });
    }
    console.log(`쪽 그림 ${sections.length}장 → ${pngDir}`);
  }
} finally {
  await browser.close();
}
