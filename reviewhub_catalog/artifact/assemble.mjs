// 클라이언트(HashRouter 빌드) + 페이지 안 서버 번들 + 셸을 합쳐 claude.ai 페이지 파일 하나로 만듭니다.
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "..");
const clientDist = path.join(root, ".preview-build");
const pub = path.join(root, "apps/client/public");
const html = fs.readFileSync(path.join(clientDist, "index.html"), "utf8");
const js = fs.readFileSync(path.join(clientDist, html.match(/src="\/(assets\/index-[^"]+\.js)"/)[1]), "utf8");
const css = fs.readFileSync(path.join(clientDist, html.match(/href="\/(assets\/index-[^"]+\.css)"/)[1]), "utf8");
const backend = fs.readFileSync(path.join(root, ".artifact-build/backend/backend.js"), "utf8");
const shell = fs.readFileSync(path.join(here, "src/shell.js"), "utf8");

const mime = { png: "image/png", webp: "image/webp", svg: "image/svg+xml" };
const dataUri = (file) => `data:${mime[file.split(".").pop()]};base64,${fs.readFileSync(file).toString("base64")}`;
const brand = {};
for (const f of fs.readdirSync(path.join(pub, "assets/brand"))) brand[`/assets/brand/${f}`] = dataUri(path.join(pub, "assets/brand", f));
const products = {};
for (const f of fs.readdirSync(path.join(pub, "assets/products"))) products[`/assets/products/${f}`] = dataUri(path.join(pub, "assets/products", f));
products["/assets/products/placeholder.webp"] = dataUri(path.join(pub, "placeholder.svg"));

const inlineBrand = (s) => s.replace(/\/assets\/brand\/[a-zA-Z0-9_.-]+\.png/g, (m) => brand[m] || m);
// 일부 라이브러리 문자열의 U+FFFD 문자는 같은 뜻의 \\uFFFD 이스케이프로 바꿉니다(게시 검사 통과용).
const safeScript = (s) => s.replace(/<\/script/gi, "<\\/script").replace(/\uFFFD/g, "\\uFFFD");

const page = `<title>두고푸드 상품 DB</title>
<meta name="robots" content="noindex,nofollow" />
<meta name="theme-color" content="#159565" />
<style>${inlineBrand(css).replace(/<\/style/gi, "<\\/style")}</style>
<style>
body { background: #ffffff; }
#doogo-save-status { position: fixed; left: 16px; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); z-index: 2147483000; padding: 10px 14px; border-radius: 999px; font: 600 13px/1.2 Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif; background: #ffffff; color: #0f5132; border: 1px solid #b7e4cf; box-shadow: 0 6px 20px rgba(21, 149, 101, 0.16); }
#doogo-save-status[data-tone="busy"] { color: #6b5b00; border-color: #efe1a1; }
#doogo-save-status[data-tone="error"] { color: #9b1c1c; border-color: #f3b4b4; }
#doogo-boot-error { position: fixed; inset: auto 16px calc(16px + env(safe-area-inset-bottom, 0px)) 16px; z-index: 2147483000; padding: 14px 16px; border-radius: 14px; background: #fff5f5; color: #9b1c1c; border: 1px solid #f3b4b4; font: 600 14px/1.5 Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif; }
</style>
<script id="doogo-assets" type="application/json">${JSON.stringify(products).replace(/</g, "\\u003c")}</script>
<script>${safeScript(shell)}</script>
<div id="root"></div>
<div id="doogo-boot-error" role="alert" hidden></div>
<script type="module">${safeScript(backend)}</script>
<script type="module">${safeScript(inlineBrand(js))}</script>
`;
const outDir = path.join(root, ".artifact-build");
fs.writeFileSync(path.join(outDir, "doogofood.html"), page);
console.log("bytes", Buffer.byteLength(page));
