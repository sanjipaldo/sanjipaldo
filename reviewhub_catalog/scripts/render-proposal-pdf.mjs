#!/usr/bin/env node
// 공급사 입점 제안서 PDF(A4 가로 · 인쇄용)를 만듭니다: apps/server/assets/proposal/supplier-proposal.html → Chromium PDF.
// 사용: node scripts/render-proposal-pdf.mjs [출력 PDF 경로] [--server]
//   --server 를 붙이면 서버가 쓰는 데이터 파일(apps/server/services/proposal-pdf-data.ts)도 새로 씁니다.
//   (서버는 이 PDF를 그대로 내려 주고, 입점 신청 메일에 보낼 때만 표지에 "○○ 귀하"를 찍습니다.)
// 준비: Playwright(크로미움). 저장소 의존성이 아니면 PLAYWRIGHT_MODULE=<설치 경로>로 알려 줍니다.
//       글꼴은 Pretendard(SIL OFL)를 씁니다. PRETENDARD_DIR=<Pretendard-*.otf 폴더>가 없으면 npm에서 받아 임시 폴더에 둡니다.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetDir = path.join(root, "apps/server/assets/proposal");
const brandDir = path.join(root, "apps/client/public/assets/brand");
const iconDir = path.join(root, "apps/client/node_modules/lucide-react/dist/esm/icons");
const args = process.argv.slice(2);
const writeServer = args.includes("--server");
const outPdf = path.resolve(args.find((arg) => !arg.startsWith("--")) || path.join(tmpdir(), "doogo-supplier-proposal.pdf"));
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
let html = readFileSync(path.join(assetDir, "supplier-proposal.html"), "utf8")
  .replaceAll("{{FONT_DIR}}", url(fonts))
  .replaceAll("{{BRAND_DIR}}", url(brandDir))
  .replaceAll("{{ASSET_DIR}}", url(assetDir))
  .replace(/<i class="ic" data-icon="([a-z0-9-]+)"><\/i>/g, (_, name) => iconSvg(name));
const workDir = path.join(tmpdir(), "doogo-proposal-render");
mkdirSync(workDir, { recursive: true });
const htmlPath = path.join(workDir, "supplier-proposal.html");
writeFileSync(htmlPath, html);

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1123, height: 794 } });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const check = await page.evaluate(() => ({
    pages: document.querySelectorAll(".page").length,
    missingFonts: [...document.fonts].filter((font) => font.status !== "loaded").map((font) => `${font.family} ${font.weight}`),
    overflow: [...document.querySelectorAll(".page")].map((section, index) => {
      const box = section.getBoundingClientRect();
      const over = [...section.querySelectorAll("*")].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.bottom > box.bottom + 0.5 || r.right > box.right + 0.5);
      }).length;
      return over ? `${index + 1}쪽: 넘친 요소 ${over}개` : null;
    }).filter(Boolean),
    addressee: (() => {
      const r = document.getElementById("addressee").getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    })()
  }));
  if (check.missingFonts.length) throw new Error(`글꼴을 불러오지 못했습니다: ${check.missingFonts.join(", ")}`);
  if (check.overflow.length) console.warn("⚠ 쪽 밖으로 넘친 요소:", check.overflow.join(" / "));
  mkdirSync(path.dirname(outPdf), { recursive: true });
  await page.pdf({ path: outPdf, preferCSSPageSize: true, printBackground: true });
  const bytes = readFileSync(outPdf);
  console.log(`PDF ${check.pages}쪽 · ${(bytes.length / 1024).toFixed(0)}KB → ${outPdf}`);
  if (writeServer) {
    // CSS px → PDF pt(×0.75). PDF 좌표는 왼쪽 아래가 원점입니다(A4 가로 높이 595.28pt).
    const pt = (value) => Math.round(value * 0.75 * 100) / 100;
    const box = { x: pt(check.addressee.x), y: Math.round((595.28 - pt(check.addressee.y + check.addressee.height)) * 100) / 100, width: pt(check.addressee.width), height: pt(check.addressee.height) };
    const target = path.join(root, "apps/server/services/proposal-pdf-data.ts");
    writeFileSync(target, `// 자동 생성 파일입니다(scripts/render-proposal-pdf.mjs --server). 직접 고치지 말고 supplier-proposal.html을 고친 뒤 다시 만드세요.\n// 공급사 입점 제안서 PDF(A4 가로 ${check.pages}쪽)와 표지의 업체명 자리(PDF pt, 왼쪽 아래 기준).\nexport const SUPPLIER_PROPOSAL_PAGES = ${check.pages};\nexport const SUPPLIER_PROPOSAL_ADDRESSEE_BOX = ${JSON.stringify(box)};\nexport const SUPPLIER_PROPOSAL_PDF_BASE64 =\n  "${bytes.toString("base64")}";\n`);
    console.log(`서버 데이터 → ${path.relative(root, target)} (업체명 자리 ${JSON.stringify(box)})`);
  }
} finally {
  await browser.close();
}
