const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '../..');
const dist = path.join(root, '.preview-build');
const work = path.join(root, '.preview-build-data');
const pub = path.join(root, 'apps/client/public');
const { signin, rec } = JSON.parse(fs.readFileSync(path.join(work, 'recorded.json'), 'utf8'));
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const jsFile = html.match(/src="\/(assets\/index-[^"]+\.js)"/)[1];
const cssFile = html.match(/href="\/(assets\/index-[^"]+\.css)"/)[1];
let js = fs.readFileSync(path.join(dist, jsFile), 'utf8');
let css = fs.readFileSync(path.join(dist, cssFile), 'utf8');
const mime = { png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml' };
const assetMap = {};
for (const dir of ['assets/brand', 'assets/products']) for (const f of fs.readdirSync(path.join(pub, dir))) {
  const ext = f.split('.').pop();
  assetMap['/' + dir + '/' + f] = `data:${mime[ext]};base64,` + fs.readFileSync(path.join(pub, dir, f)).toString('base64');
}
assetMap['/assets/products/placeholder.webp'] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(pub, 'placeholder.svg')).toString('base64');
const inline = (s) => s.replace(/\/assets\/(brand|products)\/[a-zA-Z0-9_.-]+\.(png|webp)/g, (m) => assetMap[m] || m);
const inlineBrand = (s) => s.replace(/\/assets\/brand\/[a-zA-Z0-9_.-]+\.png/g, (m) => assetMap[m] || m);
js = inlineBrand(js); css = inline(css);
for (const k of Object.keys(assetMap)) if (k.startsWith('/assets/brand/')) delete assetMap[k];
for (const k of Object.keys(rec)) { try { rec[k].body = JSON.parse(rec[k].body); } catch {} }
const data = JSON.stringify({ signin, rec, assets: assetMap }).replace(/</g, '\\u003c');
const shim = fs.readFileSync(path.join(__dirname, 'preview-shim.js'), 'utf8');
const out = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex,nofollow" />
<meta name="theme-color" content="#159565" />
<title>두고푸드 상품 DB 미리보기</title>
<script id="preview-data" type="application/json">${data}</script>
<script>${shim}</script>
<style>${css.replace(/<\/style/gi, '<\\/style')}</style>
</head>
<body>
<div id="root"></div>
<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>`;
const outDir = path.join(root, 'preview'); fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'doogofood-preview.html'), out);
console.log('bytes', out.length);
