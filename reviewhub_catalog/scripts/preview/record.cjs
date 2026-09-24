const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const base = process.env.PREVIEW_SOURCE_URL || 'http://127.0.0.1:3100';
  const path = require('path'); const work = path.resolve(__dirname, '../../.preview-build-data'); fs.mkdirSync(work, { recursive: true });
  const rec = {};
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('response', async (res) => {
    const u = new URL(res.url());
    if (!u.pathname.startsWith('/api/') || res.request().method() !== 'GET') return;
    try { const body = await res.text(); rec[u.pathname + u.search] = { status: res.status(), type: res.headers()['content-type'] || '', body }; } catch {}
  });
  const visit = async (path, wait = 2500) => { await p.goto(base + path, { waitUntil: 'networkidle' }); await p.waitForTimeout(wait); };
  for (const path of ['/', '/guide', '/notices', '/sourcing']) await visit(path);
  const r = await p.request.post(base + '/api/auth/sign-in/username', { data: { username: 'admin', password: process.env.LOCAL_ADMIN_PASSWORD }, headers: { origin: base } });
  const signin = await r.json();
  await p.evaluate(t => localStorage.setItem('better-auth-token', t), signin.token);
  for (const s of ['home','products','sort','changes','transmissions','categories','shippingPolicies','suppliers','sales','notices','history','sourcing','sync']) await visit('/admin/' + s);
  fs.writeFileSync(path.join(work, 'recorded.json'), JSON.stringify({ signin, rec }));
  console.log(Object.entries(rec).map(([k, v]) => `${v.status} ${k} ${v.body.length}`).join('\n'));
  await b.close();
})();
