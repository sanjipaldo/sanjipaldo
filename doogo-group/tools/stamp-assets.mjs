// CSS · JS 주소에 내용 해시를 붙입니다(?v=xxxxxxxx).
//   assets/ 는 7일 동안 캐시되므로(vercel.json), 파일을 고쳐도 한 번 들어왔던 휴대폰은 옛 CSS·JS 를 그대로 씁니다.
//   주소 끝 ?v= 가 내용에 따라 바뀌면 브라우저가 새 파일을 바로 받아 갑니다.
//   사용: node tools/stamp-assets.mjs [파일.html ...]   (build-business.mjs · sync-partials.mjs 끝에서도 자동 실행)
//   CSS·JS 만 고쳤을 때도 꼭 한 번 실행하세요.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const RE = /(href|src)="(assets\/[^"?#]+\.(?:css|js))(?:\?v=[0-9a-f]+)?"/g;

export function stampAssets(only = []) {
  const names = only.map(f => f.replace(/^.*\//, ''));
  const files = readdirSync(root).filter(f => f.endsWith('.html') && (!names.length || names.includes(f)));
  const memo = new Map();
  const ver = (rel) => {
    if (!memo.has(rel)) {
      const p = join(root, rel);
      memo.set(rel, existsSync(p) ? createHash('sha1').update(readFileSync(p)).digest('hex').slice(0, 8) : null);
    }
    return memo.get(rel);
  };
  let changed = 0;
  for (const file of files) {
    const path = join(root, file);
    const before = readFileSync(path, 'utf8');
    const after = before.replace(RE, (m, attr, rel) => {
      const v = ver(rel);
      if (!v) { console.warn(`! ${file}: ${rel} 파일이 없습니다`); return m; }
      return `${attr}="${rel}?v=${v}"`;
    });
    if (after !== before) { writeFileSync(path, after); changed++; }
  }
  console.log(`버전 표시: ${changed}개 페이지 갱신`);
  syncCsp();
}

// 24차 보안: vercel.json 의 Content-Security-Policy 에 페이지 안 인라인 스크립트(<script>…</script>)의 sha256 해시를 맞춰 넣습니다.
//   해시가 맞는 인라인 스크립트만 실행되므로, 인라인 스크립트를 고치거나 새로 넣었다면 이 도구를 꼭 다시 실행하세요.
//   (application/ld+json 같은 데이터 블록은 실행되지 않아 제외)
export function syncCsp() {
  const cfgPath = join(root, 'vercel.json');
  if (!existsSync(cfgPath)) return;
  const hashes = new Set();
  for (const file of readdirSync(root).filter(f => f.endsWith('.html'))) {
    const html = readFileSync(join(root, file), 'utf8');
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (/type="application\/(ld\+)?json"/.test(m[1])) continue;
      hashes.add(`'sha256-${createHash('sha256').update(m[2]).digest('base64')}'`);
    }
  }
  const raw = readFileSync(cfgPath, 'utf8');
  const next = raw.replace(/(script-src 'self')[^;"]*/, `$1 ${[...hashes].sort().join(' ')}`);
  if (next !== raw) { writeFileSync(cfgPath, next); console.log(`보안 정책: 인라인 스크립트 해시 ${hashes.size}개 반영`); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) stampAssets(process.argv.slice(2));
