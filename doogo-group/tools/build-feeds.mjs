// 검색 등록용 파일을 만듭니다: sitemap.xml(모든 페이지) · rss.xml(그룹소식 news.html 의 소식) · robots.txt
//   사용: node tools/build-feeds.mjs   — 페이지를 더하거나 그룹소식을 고친 뒤 다시 실행하세요.
//   네이버 서치어드바이저 · 구글 서치 콘솔에는 https://www.doogogroup.com/sitemap.xml , /rss.xml 을 제출합니다.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://www.doogogroup.com';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (h) => h.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// ---------- sitemap.xml ----------
const PRIORITY = { 'index.html': '1.0', 'about.html': '0.9', 'business.html': '0.9', 'leadership.html': '0.8', 'brands.html': '0.8', 'news.html': '0.8', 'contact.html': '0.7', 'faq.html': '0.6', 'privacy.html': '0.3', 'email-policy.html': '0.3' };
const pages = readdirSync(root).filter(f => f.endsWith('.html')).sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
const urls = pages.map(f => {
  const loc = f === 'index.html' ? `${SITE}/` : `${SITE}/${f}`;
  const mod = statSync(join(root, f)).mtime.toISOString().slice(0, 10);
  const pr = PRIORITY[f] || (f.startsWith('business-') ? '0.8' : '0.5');
  return `  <url><loc>${loc}</loc><lastmod>${mod}</lastmod><priority>${pr}</priority></url>`;
});
writeFileSync(join(root, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);

// ---------- rss.xml (news.html 의 li.nw-item) ----------
const news = readFileSync(join(root, 'news.html'), 'utf8');
const chunks = news.split('<li class="nw-item" ').slice(1).map(c => c.split(/<\/ol>|<\/ul>\s*<\/div>\s*<\/section>/)[0]);
const items = chunks.map(c => {
  const id = (c.match(/^id="([^"]+)"/) || [])[1];
  const attrs = c.slice(0, c.search(/>\s*</) + 1), body = c;
  const sum = (attrs.match(/data-sum="([^"]*)"/) || [])[1] || '';
  const img = (attrs.match(/data-img="([^"]*)"/) || [])[1] || '';
  const title = plain((body.match(/class="nw-title-t"[^>]*>([\s\S]*?)<\/span>/) || [])[1] || '');
  const cat = plain((body.match(/class="nw-cat[^"]*"[^>]*>([\s\S]*?)<\/span>/) || [])[1] || '');
  const date = (body.match(/datetime="(\d{4}-\d{2}-\d{2})"/) || [])[1];
  // 본문: nw-body-pad 안의 문단(링크 줄 nw-links 제외) — 네이버는 본문 전체 제공을 권장
  const pad = (body.match(/class="nw-body-pad">([\s\S]*?)<\/div><\/div>/) || [])[1] || '';
  const text = [...pad.matchAll(/<(p|li|dt|dd)(?![^>]*nw-links)[^>]*>([\s\S]*?)<\/\1>/g)].map(x => plain(x[2])).filter(Boolean).join('\n') || sum;
  return { id, sum, img, title, cat, date, text };
}).filter(it => it.title && it.date);
const rfc = (d) => new Date(`${d}T09:00:00+09:00`).toUTCString();
const rssItems = items.map(it => {
  const link = `${SITE}/news.html#${it.id}`;
  const html = `${it.img ? `<p><img src="${SITE}/${it.img}" alt="${esc(it.title)}"></p>` : ''}${it.text.split('\n').map(t => `<p>${esc(t)}</p>`).join('')}`;
  return `    <item>
      <title>${esc(it.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${rfc(it.date)}</pubDate>${it.cat ? `\n      <category>${esc(it.cat)}</category>` : ''}
      <description><![CDATA[${html}]]></description>
    </item>`;
});
const last = items.map(it => it.date).sort().pop();
writeFileSync(join(root, 'rss.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>두고그룹 그룹소식</title>
    <link>${SITE}/news.html</link>
    <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml"/>
    <description>지주회사 DOOGO HOLDINGS와 다섯 그룹사, 두고그룹의 공지 · 사업 소식 · 교육 현장 소식</description>
    <language>ko</language>
    <lastBuildDate>${rfc(last)}</lastBuildDate>
${rssItems.join('\n')}
  </channel>
</rss>
`);

// ---------- robots.txt ----------
writeFileSync(join(root, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`sitemap.xml ${urls.length}개 페이지 · rss.xml ${items.length}개 소식 · robots.txt`);
