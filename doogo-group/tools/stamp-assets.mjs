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
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) stampAssets(process.argv.slice(2));
