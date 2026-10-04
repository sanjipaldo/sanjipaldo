// Code.gs 를 가짜(mock) 구글 서비스 위에서 돌려보는 테스트.  실행: node youtube-referral-bot/test/run-tests.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// ── 가짜 스프레드시트 ──
function makeSheet(name) {
  const data = [];
  const sheet = {
    name, data, formUrl: null,
    getName: () => name,
    getLastRow: () => {
      for (let i = data.length - 1; i >= 0; i--) if ((data[i] || []).some(v => v !== '' && v !== undefined)) return i + 1;
      return 0;
    },
    appendRow(row) { data[sheet.getLastRow()] = row.slice(); },
    getDataRange() {
      const rows = sheet.getLastRow();
      const cols = Math.max(1, ...data.slice(0, rows).map(r => (r || []).length));
      return sheet.getRange(1, 1, Math.max(rows, 1), cols);
    },
    getRange(r, c, nr = 1, nc = 1) {
      if (typeof r === 'string') return noop();
      const range = {
        getValues: () => Array.from({ length: nr }, (_, i) =>
          Array.from({ length: nc }, (_, j) => { const v = (data[r - 1 + i] || [])[c - 1 + j]; return v === undefined ? '' : v; })),
        setValues(vals) {
          vals.forEach((row, i) => row.forEach((v, j) => { data[r - 1 + i] = data[r - 1 + i] || []; data[r - 1 + i][c - 1 + j] = v; }));
          return range;
        },
        setValue(v) { return range.setValues([[v]]); },
        clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (data[r - 1 + i]) data[r - 1 + i][c - 1 + j] = ''; return range; },
      };
      const proxied = new Proxy(range, { get: (t, p) => (p in t ? t[p] : () => proxied) });
      return proxied;
    },
    getFormUrl: () => sheet.formUrl,
    setColumnWidth: () => sheet, setFrozenRows: () => sheet,
  };
  return sheet;
}
function noop() { const p = new Proxy(function () {}, { get: () => () => p, apply: () => p }); return p; }

function makeEnv() {
  const sheets = [];
  const ss = {
    getSheetByName: n => sheets.find(s => s.name === n) || null,
    insertSheet: n => { const s = makeSheet(n); sheets.push(s); return s; },
    getSheets: () => sheets.slice(),
    deleteSheet: s => sheets.splice(sheets.indexOf(s), 1),
    getId: () => 'SSID',
  };
  const props = {};
  const sent = [];
  const inserted = [];
  const yt = { threads: [], subscribed: {}, quotaFailAfter: Infinity, uploads: [], topLevel: [] };
  let mailQuota = 100;
  const ctx = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      getUi: () => { throw new Error('no ui in tests'); },
      newDataValidation: () => noop(),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Logger: { log: () => {} },
    Session: { getScriptTimeZone: () => 'Asia/Seoul', getEffectiveUser: () => ({ getEmail: () => 'owner@test.com' }) },
    Utilities: { formatDate: (d, tz, f) => d.toISOString().slice(0, 10).replace(/-/g, '') },
    MailApp: {
      getRemainingDailyQuota: () => mailQuota,
      sendEmail: o => { if (mailQuota <= 0) throw new Error('quota'); mailQuota--; sent.push(o); },
    },
    YouTube: {
      Channels: { list: () => ({ items: [{ id: 'UC_ME', snippet: { title: '두고TV' }, statistics: { subscriberCount: '1000' }, contentDetails: { relatedPlaylists: { uploads: 'UU_ME' } } }] }) },
      PlaylistItems: {
        list: () => ({ items: yt.uploads.map(v => ({ contentDetails: { videoId: v.id } })) }),
      },
      Videos: {
        list: (part, p) => ({ items: yt.uploads.filter(v => p.id.split(',').includes(v.id)).map(v => Object.assign({ statistics: {} }, v)) }),
      },
      CommentThreads: {
        insert: (body) => { yt.topLevel.push(body.snippet); return {}; },
        list: (part, p) => {
          const start = p.pageToken ? Number(p.pageToken) : 0;
          const items = yt.threads.slice(start, start + 2); // 페이지 넘김 테스트용으로 2개씩
          return { items, nextPageToken: start + 2 < yt.threads.length ? String(start + 2) : undefined };
        },
      },
      Comments: {
        insert: (body) => {
          if (inserted.length >= yt.quotaFailAfter) throw new Error('quotaExceeded');
          inserted.push(body.snippet);
          return {};
        },
      },
      Subscriptions: {
        list: (part, p) => {
          const s = yt.subscribed[p.channelId];
          if (s === undefined) throw new Error('subscriptionForbidden');
          return { items: s ? [{ id: 'x' }] : [] };
        },
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), ctx);
  return {
    ctx, ss, props, sent, inserted, yt,
    setMailQuota: q => { mailQuota = q; },
    run: code => vm.runInContext(code, ctx),
    sheet: n => ss.getSheetByName(n),
  };
}

function thread(id, text, opts = {}) {
  return {
    id,
    snippet: {
      videoId: opts.videoId || 'L1X_BF5mha4',
      topLevelComment: { snippet: {
        textDisplay: text,
        authorDisplayName: opts.name || '@user_' + id,
        authorChannelId: { value: opts.author || 'UC_' + id },
        publishedAt: new Date(Date.now() - (opts.ageMin || 5) * 60000).toISOString(),
      } },
    },
  };
}

function setSetting(env, key, value) { env.run(`setKeyValue_(SHEETS.SETTINGS, ${JSON.stringify(key)}, ${JSON.stringify(value)})`); }
function rows(env, name) { return env.sheet(name).data.slice(1).filter(r => r && r.some(v => v !== '')); }
function setupWithLink(env) {
  env.run('setupSheets()');
  env.sheet('캠페인').data[1][6] = 'https://hookable.example/ref/SECRET123';
  setSetting(env, '구글폼 주소', 'https://forms.gle/abc');
  setSetting(env, '구글폼 코드입력 주소', 'https://docs.google.com/forms/d/e/X/viewform?usp=pp_url&entry.1={code}');
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('도우미 함수: 정규화·영상ID·버전 나누기·치환', () => {
  const env = makeEnv();
  assert.strictEqual(env.run('normalize_("후커블 !! 🎉")'), '후커블');
  assert.strictEqual(env.run('normalize_("HooKable.")'), 'hookable');
  assert.strictEqual(env.run('extractVideoId_("https://www.youtube.com/watch?v=L1X_BF5mha4&t=3")'), 'L1X_BF5mha4');
  assert.strictEqual(env.run('extractVideoId_("https://youtu.be/L1X_BF5mha4")'), 'L1X_BF5mha4');
  assert.strictEqual(env.run('extractVideoId_("https://youtube.com/shorts/L1X_BF5mha4")'), 'L1X_BF5mha4');
  assert.strictEqual(env.run('extractVideoId_("전체")'), '');
  assert.strictEqual(env.run('splitVariants_("a\\n---\\nb\\n---\\n").length'), 2);
  assert.strictEqual(env.run('render_("{name}/{x}", {name:"@a"})'), '@a/{x}');
  assert.strictEqual(env.run('safeCell_("=HYPERLINK(1)")'), "'=HYPERLINK(1)");
  const code = env.run('newCode_(new Set())');
  assert.match(code, /^[A-Z][A-Z2-9]{5}$/);
});

test('폼 답변 추출: 동의 문항·자동수집 이메일과 섞여 있어도', () => {
  const env = makeEnv();
  const out = env.run(`extractAnswers_({
    '타임스탬프': ['2026'], '개인정보 수집·이용 동의 (메일 발송)': ['동의합니다'],
    '이메일 주소': ['fan@test.com'], '인증코드': [' ab c123 ']
  })`);
  assert.strictEqual(out.email, 'fan@test.com');
  assert.strictEqual(out.code, 'ab c123');
});

test('테스트모드: 답글을 달지 않고 기록만, 반복 실행해도 중복 기록 없음', () => {
  const env = makeEnv();
  setupWithLink(env);
  env.yt.threads = [thread('t1', '후커블 신청합니다!'), thread('t2', '영상 잘 봤어요')];
  env.run('checkComments({})');
  env.run('checkComments({})');
  assert.strictEqual(env.inserted.length, 0);
  const r = rows(env, '답글기록');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0][9], '테스트');
  assert.match(r[0][7], /entry\.1=[A-Z0-9]{6}/);
  assert.ok(!r[0][7].includes('SECRET123'), '레퍼럴 링크가 댓글에 노출되면 안 됨');
});

test('실제 모드: 키워드 댓글에만 대댓글, 내 댓글·다른 영상 제외, 같은 사람 1번만, 페이지 넘김', () => {
  const env = makeEnv();
  setupWithLink(env);
  setSetting(env, '테스트모드', '아니오');
  env.sheet('캠페인').data[1][2] = 'https://youtu.be/L1X_BF5mha4';
  env.yt.threads = [
    thread('t1', '후 커 블', { author: 'UC_A' }),
    thread('t2', '좋아요'),
    thread('t3', '후커블', { author: 'UC_ME' }),
    thread('t4', '후커블', { videoId: 'OTHERVIDEO1' }),
    thread('t5', '후커블 또 신청', { author: 'UC_A' }),
    thread('t6', 'HOOKABLE 아님 후커블', { author: 'UC_B', name: '@bee' }),
  ];
  const sum = env.run('checkComments({})');
  assert.strictEqual(env.inserted.length, 2, JSON.stringify(sum));
  assert.deepStrictEqual(env.inserted.map(i => i.parentId).sort(), ['t1', 't6']);
  assert.ok(env.inserted.find(i => i.parentId === 't6').textOriginal.includes('@bee'));
  const statuses = rows(env, '답글기록').map(r => r[3] + ':' + r[9]).sort();
  assert.deepStrictEqual(statuses, ['t1:답글완료', 't5:중복(답글 안 함)', 't6:답글완료']);
  // 다시 돌려도 같은 댓글에 또 달지 않음
  env.run('checkComments({})');
  assert.strictEqual(env.inserted.length, 2);
  assert.ok(env.props.WATERMARK);
});

test('정확히 모드 / 오래된 댓글은 첫 실행 범위 밖', () => {
  const env = makeEnv();
  setupWithLink(env);
  setSetting(env, '테스트모드', '아니오');
  env.sheet('캠페인').data[1][4] = '정확히';
  env.yt.threads = [thread('t1', '후커블!'), thread('t2', '후커블 주세요'), thread('t3', '후커블', { ageMin: 60 * 24 * 30 })];
  env.run('checkComments({})');
  assert.deepStrictEqual(env.inserted.map(i => i.parentId), ['t1']);
});

test('하루 최대 답글 수와 API 할당량 초과 시 멈추고 다음에 이어서', () => {
  const env = makeEnv();
  setupWithLink(env);
  setSetting(env, '테스트모드', '아니오');
  setSetting(env, '하루 최대 답글 수', 2);
  env.yt.threads = ['a', 'b', 'c', 'd'].map(x => thread(x, '후커블'));
  const sum = env.run('checkComments({})');
  assert.strictEqual(env.inserted.length, 2);
  assert.match(sum.stopReason, /하루 최대/);
  assert.ok(!env.props.WATERMARK, '중간에 멈추면 기준시점을 옮기지 않음');

  const env2 = makeEnv();
  setupWithLink(env2);
  setSetting(env2, '테스트모드', '아니오');
  env2.yt.quotaFailAfter = 1;
  env2.yt.threads = ['a', 'b', 'c'].map(x => thread(x, '후커블'));
  const s2 = env2.run('checkComments({})');
  assert.strictEqual(env2.inserted.length, 1);
  assert.match(s2.stopReason, /할당량/);
  env2.yt.quotaFailAfter = Infinity;
  env2.run('checkComments({})');
  assert.strictEqual(env2.inserted.length, 3);
});

test('구독 확인: 미구독(공개)→미구독 답글, 비공개→통과', () => {
  const env = makeEnv();
  setupWithLink(env);
  setSetting(env, '테스트모드', '아니오');
  setSetting(env, '구독 확인', '예');
  env.yt.subscribed = { UC_no: false, UC_yes: true };
  env.yt.threads = [thread('n', '후커블', { author: 'UC_no' }), thread('y', '후커블', { author: 'UC_yes' }), thread('p', '후커블', { author: 'UC_private' })];
  env.run('checkComments({})');
  const r = Object.fromEntries(rows(env, '답글기록').map(x => [x[3], x]));
  assert.strictEqual(r.n[9], '미구독 답글');
  assert.strictEqual(r.n[8], '');
  assert.strictEqual(r.y[9], '답글완료');
  assert.strictEqual(r.p[9], '답글완료');
});

test('폼 접수 → 레퍼럴 메일 발송, 코드 1회용, 오류 기록, 실패 재발송', () => {
  const env = makeEnv();
  setupWithLink(env);
  setSetting(env, '테스트모드', '아니오');
  env.yt.threads = [thread('t1', '후커블', { name: '@fan1' }), thread('t2', '후커블', { name: '@fan2' })];
  env.run('checkComments({})');
  const [c1, c2] = rows(env, '답글기록').map(r => r[8]);

  const submit = (email, code) => env.run(`onFormSubmitHandler({ namedValues: { '이메일 주소': [${JSON.stringify(email)}], '인증코드': [${JSON.stringify(code)}] } })`);
  submit('fan1@test.com', c1.toLowerCase());
  assert.strictEqual(env.sent.length, 1);
  assert.strictEqual(env.sent[0].to, 'fan1@test.com');
  assert.ok(env.sent[0].body.includes('https://hookable.example/ref/SECRET123'));
  assert.ok(env.sent[0].body.includes('@fan1'));
  assert.ok(env.sent[0].htmlBody.includes('<a href="https://hookable.example/ref/SECRET123">'));
  assert.strictEqual(env.sent[0].name, '두고TV');

  submit('fan1@test.com', c1);               // 같은 접수 다시 → 무시
  submit('thief@test.com', c1);              // 남의 코드 재사용 → 막힘
  submit('fan1@test.com', c2);               // 같은 이메일로 다른 코드 → 중복 이메일
  submit('bad-email', c2);                   // 이메일 오류
  submit('x@test.com', 'ZZZZZZ');            // 없는 코드
  assert.strictEqual(env.sent.length, 1);
  const m = rows(env, '메일기록').map(r => r[5]);
  assert.deepStrictEqual(m, ['발송완료', '이미 사용된 코드', '중복 이메일', '이메일 오류', '코드 없음']);
  assert.match(String(rows(env, '답글기록')[0][10]), /fan1@test.com/);

  // 메일 한도 초과 → 발송실패 → 한도 회복 후 밀린 접수 처리로 재발송
  env.setMailQuota(0);
  submit('fan2@test.com', c2);
  assert.strictEqual(rows(env, '메일기록').slice(-1)[0][5], '발송실패');
  env.setMailQuota(50);
  const resp = env.ss.insertSheet('설문지 응답 시트1');
  resp.formUrl = 'https://docs.google.com/forms/x';
  resp.data.push(['타임스탬프', '이메일 주소', '인증코드', '개인정보 수집·이용 동의']);
  resp.data.push([new Date(), 'fan2@test.com', c2, '동의합니다']);
  resp.data.push([new Date(), 'fan1@test.com', c1, '동의합니다']);
  const res = env.run('processPending_()');
  assert.strictEqual(res.sent, 1);
  assert.strictEqual(env.sent.length, 2);
  assert.strictEqual(env.sent[1].to, 'fan2@test.com');
  assert.strictEqual(rows(env, '메일기록').filter(r => r[5] === '발송실패').length, 0);
  env.run('processPending_()');
  assert.strictEqual(env.sent.length, 2, '밀린 접수 처리를 여러 번 눌러도 중복 발송 없음');
});

test('테스트모드 코드로도 메일 흐름을 끝까지 시험할 수 있음', () => {
  const env = makeEnv();
  setupWithLink(env);
  env.yt.threads = [thread('t1', '후커블')];
  env.run('checkComments({})');
  const code = rows(env, '답글기록')[0][8];
  env.run(`onFormSubmitHandler({ namedValues: { '이메일 주소': ['me@test.com'], '인증코드': ['${code}'] } })`);
  assert.strictEqual(env.sent.length, 1);
});

function upload(id, title, minsAgo, privacy = 'public') {
  return { id, snippet: { title, publishedAt: new Date(Date.now() - minsAgo * 60000).toISOString() }, status: { privacyStatus: privacy } };
}

test('새 영상 자동화: 처음엔 기준만 잡고, 이후 공개된 새 영상에 캠페인 적용 + 안내 댓글 + 알림 메일', () => {
  const env = makeEnv();
  setupWithLink(env);
  setSetting(env, '테스트모드', '아니오');
  const camp = env.sheet('캠페인').data;
  assert.strictEqual(camp[0][9], '새 영상 자동 적용');
  assert.strictEqual(camp[1][9], true);
  // 두 번째 캠페인: 특정 영상 전용 + 자동 적용 안 함
  camp.push([true, 'B사', 'OLDVIDEO001', '비사', '포함', '{name} {form_code}', 'https://b.example/ref', '', '', false, 'B사 안내']);
  // 후커블은 특정 영상 전용 + 자동 적용
  camp[1][2] = 'https://youtu.be/L1X_BF5mha4';

  env.yt.uploads = [upload('OLDVIDEO001', '예전 영상', 60 * 24)];
  env.run('checkComments({})');                       // 처음: 기준 시점만 기록
  assert.ok(env.props.JARVIS_SINCE);
  assert.strictEqual(env.yt.topLevel.length, 0);

  env.props.JARVIS_SINCE = String(Date.now() - 60 * 60000);  // 1시간 전에 켰다고 가정
  env.yt.uploads = [
    upload('NEWVIDEO001', '새 영상 🎉', 10),
    upload('PRIVATE0001', '비공개 영상', 5, 'private'),
    upload('OLDVIDEO001', '예전 영상', 60 * 24),
  ];
  const sum = env.run('checkComments({})');
  assert.strictEqual(sum.newVideos.length, 1, JSON.stringify(sum));
  assert.strictEqual(env.yt.topLevel.length, 1);
  assert.strictEqual(env.yt.topLevel[0].videoId, 'NEWVIDEO001');
  const ann = env.yt.topLevel[0].topLevelComment.snippet.textOriginal;
  assert.ok(ann.includes('"후커블"') && ann.includes('후커블 전용'), ann);
  assert.ok(!ann.includes('B사'));
  assert.strictEqual(camp[1][2], 'https://youtu.be/L1X_BF5mha4, NEWVIDEO001');
  assert.strictEqual(camp[2][2], 'OLDVIDEO001');
  const notice = env.sent.find(m => m.to === 'owner@test.com');
  assert.ok(notice && notice.subject.includes('새 영상 🎉'));
  assert.strictEqual(rows(env, '새영상기록')[0][5], '안내 완료');

  // 새 영상 댓글에도 바로 답글이 달림
  env.yt.threads = [thread('n1', '후커블!', { videoId: 'NEWVIDEO001' })];
  env.run('checkComments({})');
  assert.deepStrictEqual(env.inserted.map(i => i.parentId), ['n1']);
  assert.strictEqual(env.yt.topLevel.length, 1, '같은 새 영상에 안내 댓글을 두 번 달지 않음');
  assert.ok(rows(env, '내영상').some(r => r[0] === 'NEWVIDEO001'));
});

test('새 영상 자동화: 테스트모드에서는 댓글·캠페인 목록을 바꾸지 않음, 끄면 동작 안 함', () => {
  const env = makeEnv();
  setupWithLink(env);
  env.sheet('캠페인').data[1][2] = 'L1X_BF5mha4';
  env.props.JARVIS_SINCE = String(Date.now() - 60 * 60000);
  env.yt.uploads = [upload('NEWVIDEO001', '새 영상', 10)];
  env.run('checkComments({})');
  assert.strictEqual(env.yt.topLevel.length, 0);
  assert.strictEqual(env.sheet('캠페인').data[1][2], 'L1X_BF5mha4');
  assert.strictEqual(rows(env, '새영상기록')[0][5], '테스트');
  env.run('checkComments({})');
  assert.strictEqual(rows(env, '새영상기록').length, 1);

  const env2 = makeEnv();
  setupWithLink(env2);
  setSetting(env2, '테스트모드', '아니오');
  setSetting(env2, '새 영상 자동화', '아니오');
  env2.props.JARVIS_SINCE = String(Date.now() - 60 * 60000);
  env2.yt.uploads = [upload('NEWVIDEO001', '새 영상', 10)];
  env2.run('checkComments({})');
  assert.strictEqual(env2.yt.topLevel.length, 0);
  assert.strictEqual(rows(env2, '새영상기록').length, 0);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('✔', name); } catch (e) { failed++; console.log('✘', name, '\n  ', e.stack); }
}
console.log(failed ? `\n${failed}개 실패` : `\n전체 ${tests.length}개 통과`);
process.exit(failed ? 1 : 0);
