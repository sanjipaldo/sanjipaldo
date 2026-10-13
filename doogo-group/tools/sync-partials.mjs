#!/usr/bin/env node
// 모든 페이지(*.html)의 공통 헤더·푸터를 partials/ 의 최신 내용으로 맞춥니다.
// 사용법: node tools/sync-partials.mjs            (모든 페이지)
//        node tools/sync-partials.mjs about.html  (지정한 페이지만)
// 페이지 안의 <!-- @header:start --> ~ <!-- @header:end -->, <!-- @footer:start --> ~ <!-- @footer:end --> 사이를 바꿉니다.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const parts = {
  header: readFileSync(join(root, 'partials/header.html'), 'utf8').trim(),
  footer: readFileSync(join(root, 'partials/footer.html'), 'utf8').trim(),
};
let changed = 0;
const only = process.argv.slice(2).map(f => f.replace(/^.*\//, ''));
const files = readdirSync(root).filter(f => f.endsWith('.html') && (!only.length || only.includes(f)));
for (const file of files) {
  const path = join(root, file);
  let html = readFileSync(path, 'utf8');
  const before = html;
  for (const [name, body] of Object.entries(parts)) {
    const re = new RegExp(`(<!-- @${name}:start -->)[\\s\\S]*?(<!-- @${name}:end -->)`);
    if (re.test(html)) html = html.replace(re, `$1\n${body}\n$2`);
    else console.warn(`! ${file}: @${name} 표시가 없습니다`);
  }
  if (html !== before) { writeFileSync(path, html); changed++; console.log(`✓ ${file}`); }
}
console.log(`완료: ${changed}개 페이지 갱신`);
