/**
 * ─────────────────────────────────────────────────────────────────
 *  유튜브 댓글 자동 답글 + 레퍼럴 링크 메일 자동 발송 봇 (Google Apps Script)
 * ─────────────────────────────────────────────────────────────────
 *  흐름
 *   1) 내 채널 모든 영상의 새 댓글을 주기적으로 확인
 *   2) [캠페인] 시트의 키워드(예: 후커블)가 들어간 댓글에 대댓글 자동 작성
 *      → 대댓글에는 1회용 인증코드 + 신청 폼 링크가 들어갑니다
 *   3) 구독자가 폼에 이메일 + 인증코드를 제출하면
 *   4) 코드를 확인하고, 해당 제휴사의 레퍼럴 링크를 메일로 자동 발송
 *
 *  답글 문구·키워드·레퍼럴 링크·메일 문구는 모두 구글 시트에서 언제든 바꿀 수 있고,
 *  바꾼 내용은 다음 확인 때부터 바로 적용됩니다.
 *  설치 방법은 README.md 를 보세요.
 */

// ── 시트 이름 / 열 구성 ──────────────────────────────────────────

const SHEETS = {
  DASH: '대시보드',
  SETTINGS: '설정',
  CAMPAIGNS: '캠페인',
  REPLIES: '답글기록',
  MAILS: '메일기록',
  VIDEOS: '내영상',
};

const CAMPAIGN_HEADERS = ['사용', '제휴사', '대상 영상', '키워드', '일치 방식', '답글 내용', '레퍼럴 링크', '메일 제목', '메일 내용'];
const REPLY_HEADERS = ['시간', '제휴사', '영상ID', '댓글ID', '작성자', '작성자 채널ID', '댓글 내용', '보낸 답글', '인증코드', '상태', '코드 사용', '비고'];
const MAIL_HEADERS = ['시간', '제휴사', '이메일', '인증코드', '유튜브 이름', '상태', '비고'];
const VIDEO_HEADERS = ['영상ID', '제목', '게시일', '조회수', '좋아요', '댓글', '자동 답글', '링크'];

// 답글기록 / 메일기록 열 번호 (0부터)
const R = { TIME: 0, CAMPAIGN: 1, VIDEO: 2, THREAD: 3, AUTHOR: 4, AUTHOR_ID: 5, TEXT: 6, REPLY: 7, CODE: 8, STATUS: 9, USED: 10, NOTE: 11 };
const M = { TIME: 0, CAMPAIGN: 1, EMAIL: 2, CODE: 3, NAME: 4, STATUS: 5, NOTE: 6 };

// 답글 상태
const ST = {
  REPLIED: '답글완료',
  TEST: '테스트',
  NOT_SUB: '미구독 답글',
  DUP: '중복(답글 안 함)',
  FAIL: '실패',
};

// 메일 상태
const MS = {
  SENT: '발송완료',
  FAIL: '발송실패',
  BAD_EMAIL: '이메일 오류',
  NO_CODE: '코드 없음',
  USED: '이미 사용된 코드',
  DUP_EMAIL: '중복 이메일',
  NO_LINK: '레퍼럴 링크 없음',
};

// 설정 항목 이름
const K = {
  TEST: '테스트모드',
  INTERVAL: '확인주기(분)',
  DAILY_LIMIT: '하루 최대 답글 수',
  FIRST_HOURS: '처음 확인할 과거 시간',
  FORM_URL: '구글폼 주소',
  FORM_CODE_URL: '구글폼 코드입력 주소',
  FORM_EDIT_URL: '구글폼 편집 주소',
  SENDER_NAME: '보내는 사람 이름',
  REPLY_TO: '답장 받을 이메일',
  CHECK_SUB: '구독 확인',
  NOT_SUB_REPLY: '미구독 답글',
  ONE_PER_PERSON: '같은 사람 한 번만',
  ONE_PER_EMAIL: '같은 이메일 한 번만',
  CHANNEL_ID: '내 채널 ID',
  CHANNEL_TITLE: '내 채널 이름',
};

const SETTING_DEFS = [
  [K.TEST, '예', '예 = 실제로 답글을 달지 않고 [답글기록]에만 남깁니다. 결과를 확인한 뒤 "아니오"로 바꾸세요.'],
  [K.INTERVAL, 10, '댓글 확인 주기. 1, 5, 10, 15, 30 중 하나. 바꾼 뒤 메뉴 > ④ 자동 실행 켜기를 다시 누르세요.'],
  [K.DAILY_LIMIT, 150, 'YouTube API 하루 할당량(10,000) 때문에 답글은 하루 약 190개가 최대입니다.'],
  [K.FIRST_HOURS, 168, '처음 실행할 때 몇 시간 전 댓글까지 답글을 달지 (168 = 7일)'],
  [K.FORM_URL, '', '메뉴 > ③ 신청 구글폼 만들기를 누르면 자동으로 채워집니다. 직접 만든 접수 페이지 주소를 넣어도 됩니다.'],
  [K.FORM_CODE_URL, '', '인증코드가 미리 입력된 폼 주소 (자동). 답글의 {form_code} 자리에 들어갑니다.'],
  [K.FORM_EDIT_URL, '', '폼 문구를 고치고 싶을 때 여는 주소 (자동)'],
  [K.SENDER_NAME, '', '메일에 표시될 보내는 사람 이름 (비우면 채널 이름)'],
  [K.REPLY_TO, '', '구독자가 메일에 답장하면 받을 주소 (비우면 이 구글 계정)'],
  [K.CHECK_SUB, '아니오', '예 = 구독 목록이 공개된 사람 중 미구독자에게는 아래 [미구독 답글]을 답니다. (비공개인 사람은 확인할 수 없어 통과)'],
  [K.NOT_SUB_REPLY, '{name}님 댓글 감사합니다! 채널 구독 후 다시 댓글 남겨주시면 {campaign} 혜택 링크를 보내드릴게요 🙏', '{name}, {campaign} 사용 가능'],
  [K.ONE_PER_PERSON, '예', '예 = 같은 유튜브 계정에는 제휴사별로 한 번만 답글 (두 번째 댓글부터는 기록만 남김)'],
  [K.ONE_PER_EMAIL, '예', '예 = 같은 이메일에는 제휴사별로 한 번만 레퍼럴 메일 발송'],
  [K.CHANNEL_ID, '', '자동 입력 (메뉴 > ② 내 채널 확인)'],
  [K.CHANNEL_TITLE, '', '자동 입력'],
];

const SAMPLE_CAMPAIGN = [
  true,
  '후커블',
  '',
  '후커블',
  '포함',
  '{name}님 댓글 감사합니다! 🎁\n' +
    '아래 링크에서 이메일만 입력하시면 후커블 전용 레퍼럴 링크를 메일로 바로 보내드려요.\n' +
    '👉 {form_code}\n' +
    '(인증코드: {code} · 1회용)\n' +
    '---\n' +
    '{name}님 고마워요 🙌 후커블 혜택 링크는 여기서 신청해주세요!\n' +
    '👉 {form_code}\n' +
    '인증코드 {code}',
  'https://여기에-후커블-레퍼럴-링크를-넣으세요',
  '[{campaign}] 요청하신 전용 레퍼럴 링크입니다',
  '안녕하세요 {name}님!\n\n' +
    '영상에 댓글 남겨주셔서 감사합니다.\n' +
    '요청하신 {campaign} 전용 레퍼럴 링크를 보내드립니다.\n\n' +
    '👉 {link}\n\n' +
    '앞으로도 좋은 영상으로 찾아뵐게요. 감사합니다!\n' +
    '- {channel} 드림',
];

const DASH_ROWS = [
  ['오늘 답글 (한국시간)', `=COUNTIFS('${SHEETS.REPLIES}'!J:J,"${ST.REPLIED}",'${SHEETS.REPLIES}'!A:A,">="&TODAY())`],
  ['전체 답글', `=COUNTIF('${SHEETS.REPLIES}'!J:J,"${ST.REPLIED}")`],
  ['오늘 보낸 메일', `=COUNTIFS('${SHEETS.MAILS}'!F:F,"${MS.SENT}",'${SHEETS.MAILS}'!A:A,">="&TODAY())`],
  ['전체 보낸 메일', `=COUNTIF('${SHEETS.MAILS}'!F:F,"${MS.SENT}")`],
  ['발송 안 된 접수 (오류·중복 등)', `=COUNTA('${SHEETS.MAILS}'!F2:F)-COUNTIF('${SHEETS.MAILS}'!F:F,"${MS.SENT}")`],
  ['남은 메일 발송 한도 (오늘)', ''],
  ['자동 실행', '꺼짐'],
  ['마지막 댓글 확인', ''],
  ['마지막 실행 결과', ''],
];

const OVERLAP_MS = 6 * 3600 * 1000;   // 지난번 확인 시점보다 6시간 앞까지 다시 훑어서 늦게 보이는 댓글도 잡음
const MAX_PAGES = 20;                 // 한 번에 최대 2,000개 댓글까지 확인
const MAX_RUN_MS = 4.5 * 60 * 1000;   // Apps Script 6분 제한 전에 멈추고 다음 실행에 이어서
const MAX_FAILS = 3;                  // 같은 댓글에 답글 실패가 3번이면 포기
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_CHARS = CODE_LETTERS + '23456789';
const EMAIL_RE = /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[^\s@<>()"',;:]{2,}$/;
const HANDLERS = ['checkComments', 'refreshVideos', 'onFormSubmitHandler'];

// ── 메뉴 ─────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🤖 유튜브 자동화')
    .addItem('① 처음 설정 (시트 만들기)', 'setupSheets')
    .addItem('② 내 채널 확인', 'checkMyChannel')
    .addItem('③ 신청 구글폼 만들기', 'setupForm')
    .addItem('④ 자동 실행 켜기', 'installTriggers')
    .addSeparator()
    .addItem('지금 댓글 확인하기', 'checkComments')
    .addItem('밀린 접수 · 실패 메일 다시 처리', 'processPendingResponses')
    .addItem('내 영상 목록 새로고침', 'refreshVideos')
    .addSeparator()
    .addItem('자동 실행 끄기', 'removeTriggers')
    .addToUi();
}

// ── 1. 처음 설정 ─────────────────────────────────────────────────

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const dash = ss.getSheetByName(SHEETS.DASH) || ss.insertSheet(SHEETS.DASH, 0);
  if (dash.getLastRow() === 0) {
    dash.getRange(1, 1, 1, 2).setValues([['항목', '값']]);
    dash.getRange(2, 1, DASH_ROWS.length, 2).setValues(DASH_ROWS);
    styleHeader_(dash, 2);
    dash.setColumnWidth(1, 220);
    dash.setColumnWidth(2, 420);
  }

  const settings = ss.getSheetByName(SHEETS.SETTINGS) || ss.insertSheet(SHEETS.SETTINGS);
  if (settings.getLastRow() === 0) {
    settings.getRange(1, 1, 1, 3).setValues([['항목', '값', '설명']]);
    styleHeader_(settings, 3);
    settings.setColumnWidth(1, 180);
    settings.setColumnWidth(2, 360);
    settings.setColumnWidth(3, 560);
  }
  const existing = getSettings_();
  SETTING_DEFS.forEach(([key, value, help]) => {
    if (!(key in existing)) settings.appendRow([key, value, help]);
  });

  const camp = ss.getSheetByName(SHEETS.CAMPAIGNS) || ss.insertSheet(SHEETS.CAMPAIGNS);
  if (camp.getLastRow() === 0) {
    camp.getRange(1, 1, 1, CAMPAIGN_HEADERS.length).setValues([CAMPAIGN_HEADERS]);
    camp.getRange(2, 1, 1, SAMPLE_CAMPAIGN.length).setValues([SAMPLE_CAMPAIGN]);
    styleHeader_(camp, CAMPAIGN_HEADERS.length);
    camp.getRange('A2:A200').insertCheckboxes();
    camp.getRange('E2:E200').setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(['포함', '정확히'], true).build());
    camp.getRange('A1:I200').setVerticalAlignment('top');
    camp.getRange('F2:F200').setWrap(true);
    camp.getRange('I2:I200').setWrap(true);
    [60, 110, 200, 140, 80, 380, 260, 240, 380].forEach((w, i) => camp.setColumnWidth(i + 1, w));
    camp.getRange('A1').setNote('체크한 줄만 동작합니다.');
    camp.getRange('C1').setNote('비우면 내 채널 전체 영상. 특정 영상만 하려면 영상 주소나 ID를 쉼표로 여러 개 넣으세요.');
    camp.getRange('D1').setNote('쉼표로 여러 개 가능 (예: 후커블, hookable). 띄어쓰기·대소문자·기호는 무시하고 비교합니다.');
    camp.getRange('E1').setNote('포함 = 댓글 안에 키워드가 들어있으면 / 정확히 = 댓글이 키워드 그 자체일 때만');
    camp.getRange('F1').setNote('줄에 --- 만 적으면 여러 버전으로 나뉘고 무작위로 하나를 씁니다 (스팸 판정 예방).\n' +
      '{name} 작성자 이름, {code} 인증코드, {form_code} 코드가 입력된 폼 주소, {form} 폼 주소, {campaign} 제휴사');
    camp.getRange('G1').setNote('구독자 메일에만 들어가는 비밀 링크. 유튜브 댓글에는 절대 노출되지 않습니다.');
    camp.getRange('I1').setNote('{name} {email} {campaign} {link} {code} {channel} 사용 가능. {link}를 빼먹으면 맨 아래에 자동으로 붙습니다.');
  }

  const replies = ensureLogSheet_(ss, SHEETS.REPLIES, REPLY_HEADERS);
  replies.getRange('I:I').setNumberFormat('@');
  ensureLogSheet_(ss, SHEETS.MAILS, MAIL_HEADERS).getRange('D:D').setNumberFormat('@');
  ensureLogSheet_(ss, SHEETS.VIDEOS, VIDEO_HEADERS);

  // 비어 있는 기본 시트 정리
  ['Sheet1', '시트1'].forEach(name => {
    const sh = ss.getSheetByName(name);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });

  alert_('처음 설정 완료!\n\n다음 순서:\n② 내 채널 확인 → [캠페인] 시트에 제휴사·레퍼럴 링크 입력 → ③ 신청 구글폼 만들기 → 테스트 → ④ 자동 실행 켜기');
}

function ensureLogSheet_(ss, name, headers) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    styleHeader_(sh, headers.length);
  }
  return sh;
}

function styleHeader_(sh, cols) {
  sh.getRange(1, 1, 1, cols).setFontWeight('bold').setBackground('#fde7e9');
  sh.setFrozenRows(1);
}

// ── 2. 내 채널 ───────────────────────────────────────────────────

function checkMyChannel() {
  const ch = myChannel_(true);
  alert_(`연결된 유튜브 채널\n\n이름: ${ch.title}\nID: ${ch.id}\n구독자: ${ch.subscribers}\n\n` +
    '이 채널이 맞지 않으면, 시트를 채널 소유 구글 계정으로 열고 다시 권한을 승인하세요.\n(브랜드 계정 채널은 승인 화면에서 해당 채널을 선택)');
}

function myChannel_(force) {
  const cache = CacheService.getScriptCache();
  if (!force) {
    const cached = cache.get('MY_CHANNEL');
    if (cached) return JSON.parse(cached);
  }
  const res = YouTube.Channels.list('snippet,statistics,contentDetails', { mine: true });
  const ch = (res.items || [])[0];
  if (!ch) {
    throw new Error('이 구글 계정에 연결된 유튜브 채널이 없습니다. 채널을 소유한 계정으로 권한을 승인하세요.');
  }
  const info = {
    id: ch.id,
    title: ch.snippet.title,
    subscribers: ch.statistics ? ch.statistics.subscriberCount : '',
    uploads: ch.contentDetails.relatedPlaylists.uploads,
  };
  cache.put('MY_CHANNEL', JSON.stringify(info), 6 * 3600);
  setKeyValue_(SHEETS.SETTINGS, K.CHANNEL_ID, info.id);
  setKeyValue_(SHEETS.SETTINGS, K.CHANNEL_TITLE, info.title);
  return info;
}

// ── 3. 신청 폼 ───────────────────────────────────────────────────

function setupForm() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const st = getSettings_();
  if (st[K.FORM_URL]) {
    const ui = SpreadsheetApp.getUi();
    const answer = ui.alert('이미 폼 주소가 있습니다. 새 폼을 하나 더 만들까요?', ui.ButtonSet.YES_NO);
    if (answer !== ui.Button.YES) return;
  }

  let title = '제휴 혜택 신청';
  try { title = `${myChannel_().title} 제휴 혜택 신청`; } catch (e) { /* 채널 확인 전이면 기본 제목 */ }

  const form = FormApp.create(title);
  form.setDescription('유튜브 답글에서 받은 인증코드와 이메일을 입력하시면, 제휴사 전용 레퍼럴 링크를 메일로 바로 보내드립니다.');
  form.setConfirmationMessage('신청 완료! 몇 분 안에 메일이 도착합니다. 메일이 안 보이면 스팸함·프로모션함도 확인해주세요 🙏');
  form.setShowLinkToRespondAgain(false);
  form.setAllowResponseEdits(false);

  form.addTextItem()
    .setTitle('이메일 주소')
    .setHelpText('레퍼럴 링크를 받을 이메일')
    .setRequired(true)
    .setValidation(FormApp.createTextValidation().setHelpText('이메일 형식으로 입력해주세요').requireTextIsEmail().build());
  const codeItem = form.addTextItem()
    .setTitle('인증코드')
    .setHelpText('유튜브 답글에 적힌 6자리 코드 (답글의 링크로 들어오셨다면 이미 입력되어 있어요)')
    .setRequired(true);
  form.addCheckboxItem()
    .setTitle('개인정보 수집·이용 동의')
    .setHelpText('수집 항목: 이메일 주소 / 목적: 신청하신 제휴사 레퍼럴 링크 발송 / 보유 기간: 발송 후 1년 (요청 시 즉시 삭제)')
    .setChoiceValues(['동의합니다'])
    .setRequired(true);

  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  const published = form.getPublishedUrl();
  let shortUrl = published;
  try { shortUrl = form.shortenFormUrl(published); } catch (e) { /* 짧은 주소 실패 시 원래 주소 */ }
  const prefilled = form.createResponse()
    .withItemResponse(codeItem.createResponse('ZZCODEZZ'))
    .toPrefilledUrl()
    .replace('ZZCODEZZ', '{code}');

  setKeyValue_(SHEETS.SETTINGS, K.FORM_URL, shortUrl);
  setKeyValue_(SHEETS.SETTINGS, K.FORM_CODE_URL, prefilled);
  setKeyValue_(SHEETS.SETTINGS, K.FORM_EDIT_URL, form.getEditUrl());
  ensureFormTrigger_(ss);

  alert_(`신청 폼을 만들었습니다.\n\n폼 주소: ${shortUrl}\n\n접수 내용은 이 시트의 새 탭(설문지 응답)에 쌓이고, 접수되면 바로 메일이 나갑니다.\n폼 문구는 [설정] > 구글폼 편집 주소에서 고칠 수 있습니다. (질문 제목의 "메일", "코드" 글자는 지우지 마세요)`);
}

function ensureFormTrigger_(ss) {
  const exists = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'onFormSubmitHandler');
  if (!exists) {
    ScriptApp.newTrigger('onFormSubmitHandler')
      .forSpreadsheet(ss || SpreadsheetApp.getActiveSpreadsheet())
      .onFormSubmit()
      .create();
  }
}

// ── 4. 자동 실행 ─────────────────────────────────────────────────

function installTriggers() {
  const st = getSettings_();
  const allowed = [1, 5, 10, 15, 30];
  const wanted = Number(st[K.INTERVAL]) || 10;
  const every = allowed.reduce((a, b) => (Math.abs(b - wanted) < Math.abs(a - wanted) ? b : a));

  removeOurTriggers_();
  ScriptApp.newTrigger('checkComments').timeBased().everyMinutes(every).create();
  ScriptApp.newTrigger('refreshVideos').timeBased().everyDays(1).atHour(6).create();
  ensureFormTrigger_();
  const ch = myChannel_(true);

  setKeyValue_(SHEETS.DASH, '자동 실행', `켜짐 (${every}분마다 · ${ch.title})`);
  const testNote = isYes_(st[K.TEST])
    ? '\n\n⚠️ 지금은 테스트모드입니다. 실제로 답글을 달려면 [설정] > 테스트모드를 "아니오"로 바꾸세요.'
    : '';
  alert_(`자동 실행을 켰습니다.\n\n· ${every}분마다 새 댓글 확인 → 답글\n· 폼 접수 즉시 메일 발송\n· 매일 아침 영상 목록 새로고침\n\n이제 시트를 닫아도 구글 서버에서 계속 돌아갑니다.${testNote}`);
}

function removeTriggers() {
  removeOurTriggers_();
  setKeyValue_(SHEETS.DASH, '자동 실행', '꺼짐');
  alert_('자동 실행을 껐습니다. (답글·메일 모두 멈춤)\n그 사이 들어온 폼 접수는 다시 켠 뒤 "밀린 접수 다시 처리"로 보낼 수 있습니다.');
}

function removeOurTriggers_() {
  ScriptApp.getProjectTriggers()
    .filter(t => HANDLERS.indexOf(t.getHandlerFunction()) !== -1)
    .forEach(t => ScriptApp.deleteTrigger(t));
}

// ── 댓글 확인 → 대댓글 ──────────────────────────────────────────

/** 시간 트리거와 메뉴에서 호출. 메뉴에서 누르면 결과를 팝업으로 보여줍니다. */
function checkComments(e) {
  const summary = withLock_(() => {
    const sum = checkComments_();
    try {
      sum.mail = processPending_();
    } catch (err) {
      sum.mailError = String(err.message || err);
    }
    setKeyValue_(SHEETS.DASH, '마지막 댓글 확인', new Date());
    setKeyValue_(SHEETS.DASH, '마지막 실행 결과', summaryText_(sum));
    return sum;
  });
  if (!e) alert_(summary ? summaryText_(summary) : '다른 작업이 실행 중입니다. 잠시 뒤 다시 눌러주세요.');
  return summary;
}

function checkComments_() {
  const started = Date.now();
  const st = getSettings_();
  const testMode = isYes_(st[K.TEST]);
  const sum = { testMode, scanned: 0, matched: 0, replied: 0, tested: 0, notSub: 0, skipped: 0, failed: 0, stopReason: '' };

  const campaigns = getCampaigns_().filter(c => c.enabled && c.keywords.length && c.replyVariants.length);
  if (!campaigns.length) {
    sum.stopReason = '사용 중인 캠페인이 없습니다 ([캠페인] 시트 확인)';
    return sum;
  }
  const me = myChannel_();

  // 지금까지 기록 불러오기
  const replySheet = sheet_(SHEETS.REPLIES);
  const counts = s => s === ST.REPLIED || s === ST.NOT_SUB || s === ST.DUP || (testMode && s === ST.TEST);
  const processed = new Set();
  const fails = {};
  const done = new Set();
  const codes = new Set();
  readRows_(replySheet, REPLY_HEADERS.length).forEach(r => {
    const s = r[R.STATUS];
    if (counts(s)) processed.add(r[R.THREAD]);
    if (s === ST.FAIL) fails[r[R.THREAD]] = (fails[r[R.THREAD]] || 0) + 1;
    if (s === ST.REPLIED || (testMode && s === ST.TEST)) done.add(r[R.CAMPAIGN] + '|' + r[R.AUTHOR_ID]);
    if (r[R.CODE]) codes.add(String(r[R.CODE]));
  });

  const props = PropertiesService.getScriptProperties();
  const wmKey = testMode ? 'WATERMARK_TEST' : 'WATERMARK';
  const watermark = Number(props.getProperty(wmKey)) || 0;
  const since = watermark ? watermark - OVERLAP_MS : started - (Number(st[K.FIRST_HOURS]) || 168) * 3600 * 1000;
  let newest = watermark;
  let budget = (Number(st[K.DAILY_LIMIT]) || 150) - todayReplies_();
  const onePerPerson = isYes_(st[K.ONE_PER_PERSON]);
  const checkSub = isYes_(st[K.CHECK_SUB]);
  const formUrl = String(st[K.FORM_URL] || '');
  const formCodeUrl = String(st[K.FORM_CODE_URL] || '');

  let pageToken = '';
  let pages = 0;
  let interrupted = false;

  scan:
  do {
    const params = { allThreadsRelatedToChannelId: me.id, order: 'time', maxResults: 100, textFormat: 'plainText' };
    if (pageToken) params.pageToken = pageToken;
    const res = YouTube.CommentThreads.list('snippet', params);
    pages++;
    pageToken = res.nextPageToken || '';

    for (const t of res.items || []) {
      const c = t.snippet.topLevelComment.snippet;
      const published = new Date(c.publishedAt).getTime();
      if (published < since) { pageToken = ''; break scan; }
      sum.scanned++;
      if (published > newest) newest = published;

      if (processed.has(t.id) || (fails[t.id] || 0) >= MAX_FAILS) continue;
      const authorId = (c.authorChannelId && c.authorChannelId.value) || '';
      if (authorId === me.id) continue;
      const videoId = t.snippet.videoId || c.videoId || '';
      if (!videoId) continue;
      const camp = findCampaign_(campaigns, videoId, c.textDisplay);
      if (!camp) continue;
      sum.matched++;

      if (Date.now() - started > MAX_RUN_MS) {
        interrupted = true;
        sum.stopReason = '실행 시간 한도 → 다음 실행에 이어서 처리';
        break scan;
      }

      const name = c.authorDisplayName || '';
      const base = [new Date(), camp.name, videoId, t.id, safeCell_(name), authorId, safeCell_(c.textDisplay)];

      if (onePerPerson && authorId && done.has(camp.name + '|' + authorId)) {
        replySheet.appendRow(base.concat(['', '', ST.DUP, '', '이미 답글을 받은 사람']));
        processed.add(t.id);
        sum.skipped++;
        continue;
      }
      if (!testMode && budget <= 0) {
        interrupted = true;
        sum.stopReason = '하루 최대 답글 수 도달 → 내일 이어서 처리';
        break scan;
      }

      let text;
      let code = '';
      let status = ST.REPLIED;
      if (checkSub && authorId && isSubscribed_(authorId, me.id) === false) {
        status = ST.NOT_SUB;
        text = render_(st[K.NOT_SUB_REPLY] || '', { name, campaign: camp.name });
      } else {
        code = newCode_(codes);
        text = render_(pick_(camp.replyVariants), {
          name,
          code,
          campaign: camp.name,
          form: formUrl,
          form_code: formCodeUrl ? formCodeUrl.replace('{code}', code) : formUrl,
        });
      }

      if (testMode) {
        const note = '테스트모드 - 실제로 달리지 않음' + (status === ST.NOT_SUB ? ' (미구독 답글)' : '');
        replySheet.appendRow(base.concat([safeCell_(text), code, ST.TEST, '', note]));
        processed.add(t.id);
        if (code) done.add(camp.name + '|' + authorId);
        sum.tested++;
        continue;
      }

      try {
        YouTube.Comments.insert({ snippet: { parentId: t.id, textOriginal: text } }, 'snippet');
        bumpTodayReplies_();
        budget--;
        replySheet.appendRow(base.concat([safeCell_(text), code, status, '', '']));
        processed.add(t.id);
        if (status === ST.REPLIED) {
          done.add(camp.name + '|' + authorId);
          sum.replied++;
        } else {
          sum.notSub++;
        }
      } catch (err) {
        const msg = String(err.message || err);
        replySheet.appendRow(base.concat([safeCell_(text), '', ST.FAIL, '', msg.slice(0, 500)]));
        sum.failed++;
        if (/quota/i.test(msg)) {
          interrupted = true;
          sum.stopReason = 'YouTube API 하루 할당량 초과 → 내일(한국시간 오후 4~5시 초기화) 이어서 처리';
          break scan;
        }
      }
    }
  } while (pageToken && pages < MAX_PAGES);

  if (!interrupted && newest) props.setProperty(wmKey, String(newest));
  return sum;
}

function findCampaign_(campaigns, videoId, text) {
  const t = normalize_(text);
  if (!t) return null;
  return campaigns.find(c =>
    (!c.videos.length || c.videos.indexOf(videoId) !== -1) &&
    c.keywords.some(k => (c.exact ? t === k : t.indexOf(k) !== -1))) || null;
}

function isSubscribed_(authorId, myId) {
  try {
    const res = YouTube.Subscriptions.list('id', { channelId: authorId, forChannelId: myId, maxResults: 1 });
    return (res.items || []).length > 0;
  } catch (e) {
    return null; // 구독 목록 비공개 → 확인 불가
  }
}

function newCode_(codes) {
  let code;
  do {
    code = CODE_LETTERS.charAt(Math.floor(Math.random() * CODE_LETTERS.length));
    for (let i = 0; i < 5; i++) code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  } while (codes.has(code));
  codes.add(code);
  return code;
}

// YouTube 할당량은 미국 태평양시간 자정에 초기화되므로 그 기준으로 셉니다.
function quotaDayKey_() {
  return 'REPLIES_' + Utilities.formatDate(new Date(), 'America/Los_Angeles', 'yyyyMMdd');
}

function todayReplies_() {
  return Number(PropertiesService.getScriptProperties().getProperty(quotaDayKey_())) || 0;
}

function bumpTodayReplies_() {
  const props = PropertiesService.getScriptProperties();
  const key = quotaDayKey_();
  props.setProperty(key, String((Number(props.getProperty(key)) || 0) + 1));
}

// ── 폼 접수 → 레퍼럴 메일 ───────────────────────────────────────

/** 폼이 제출되면 바로 실행 (스프레드시트 폼 제출 트리거) */
function onFormSubmitHandler(e) {
  withLock_(() => {
    const ctx = loadMailCtx_();
    handleSubmission_(ctx, extractAnswers_((e && e.namedValues) || {}));
    setKeyValue_(SHEETS.DASH, '남은 메일 발송 한도 (오늘)', MailApp.getRemainingDailyQuota());
  });
}

/** 메뉴: 폼 응답 시트 전체를 훑어 아직 처리 안 된 접수와 실패한 메일을 다시 처리 */
function processPendingResponses() {
  const res = withLock_(processPending_);
  alert_(res ? mailSummaryText_(res) : '다른 작업이 실행 중입니다. 잠시 뒤 다시 눌러주세요.');
}

function processPending_() {
  const res = { sent: 0, problems: 0 };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const responseSheets = ss.getSheets().filter(sh => {
    try { return !!sh.getFormUrl(); } catch (e) { return false; }
  });
  res.quota = MailApp.getRemainingDailyQuota();
  setKeyValue_(SHEETS.DASH, '남은 메일 발송 한도 (오늘)', res.quota);
  if (!responseSheets.length || res.quota <= 0) return res;

  const ctx = loadMailCtx_();
  responseSheets.forEach(sh => {
    const values = sh.getDataRange().getValues();
    const headers = values[0] || [];
    for (let i = 1; i < values.length; i++) {
      const nv = {};
      headers.forEach((h, j) => { if (h !== '') nv[h] = [values[i][j]]; });
      const status = handleSubmission_(ctx, extractAnswers_(nv));
      if (status === MS.SENT) res.sent++;
      else if (status && status !== 'already' && status !== 'empty') res.problems++;
    }
  });
  res.quota = MailApp.getRemainingDailyQuota();
  setKeyValue_(SHEETS.DASH, '남은 메일 발송 한도 (오늘)', res.quota);
  return res;
}

function loadMailCtx_() {
  const replySh = sheet_(SHEETS.REPLIES);
  const mailSh = sheet_(SHEETS.MAILS);
  const replies = readRows_(replySh, REPLY_HEADERS.length);
  const mails = readRows_(mailSh, MAIL_HEADERS.length);
  const codeRow = {};
  replies.forEach((r, i) => { if (r[R.CODE]) codeRow[String(r[R.CODE]).toUpperCase()] = i; });
  const pairRow = {};
  const sentEmail = new Set();
  mails.forEach((m, i) => {
    pairRow[pairKey_(m[M.EMAIL], m[M.CODE])] = i;
    if (m[M.STATUS] === MS.SENT) sentEmail.add(m[M.CAMPAIGN] + '|' + String(m[M.EMAIL]).toLowerCase());
  });
  return { replySh, mailSh, replies, mails, codeRow, pairRow, sentEmail, campaigns: getCampaigns_(), st: getSettings_() };
}

/** 폼 응답의 질문 제목에서 이메일·인증코드를 찾아냅니다 (직접 만든 폼도 "메일", "코드"가 제목에 있으면 동작). */
function extractAnswers_(nv) {
  const entries = Object.keys(nv).map(k => {
    const v = Array.isArray(nv[k]) ? nv[k][0] : nv[k];
    return [k, v === undefined || v === null ? '' : String(v).trim()];
  });
  const isEmailKey = k => /메일|e-?mail/i.test(k) && !/동의/.test(k);
  let email = '';
  let code = '';
  for (const [k, v] of entries) if (isEmailKey(k) && EMAIL_RE.test(v)) { email = v; break; }
  if (!email) for (const [k, v] of entries) if (isEmailKey(k) && v) { email = v; break; }
  if (!email) for (const [, v] of entries) if (EMAIL_RE.test(v)) { email = v; break; }
  for (const [k, v] of entries) if (/코드|code/i.test(k)) { code = v; break; }
  return { email, code };
}

function pairKey_(email, code) {
  return String(email || '').trim().toLowerCase() + '|' + String(code || '').toUpperCase();
}

/** 접수 1건 처리. 이미 처리한 접수면 'already'. 결과는 [메일기록]에 남깁니다. */
function handleSubmission_(ctx, answer) {
  const email = String(answer.email || '').trim();
  const code = String(answer.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!email && !code) return 'empty';

  const key = pairKey_(email, code);
  const existing = ctx.pairRow[key];
  if (existing !== undefined && ctx.mails[existing][M.STATUS] !== MS.FAIL) return 'already';

  const result = decideAndSend_(ctx, email, code);
  const row = [new Date(), result.campaign || '', safeCell_(email), code, safeCell_(result.name || ''), result.status, result.note || ''];
  if (existing !== undefined) {
    ctx.mailSh.getRange(existing + 2, 1, 1, row.length).setValues([row]);
    ctx.mails[existing] = row;
  } else {
    ctx.mailSh.appendRow(row);
    ctx.mails.push(row);
    ctx.pairRow[key] = ctx.mails.length - 1;
  }
  return result.status;
}

function decideAndSend_(ctx, email, code) {
  if (!EMAIL_RE.test(email)) return { status: MS.BAD_EMAIL };
  const ri = ctx.codeRow[code];
  if (ri === undefined) return { status: MS.NO_CODE, note: code ? '' : '코드를 입력하지 않음' };

  const rr = ctx.replies[ri];
  const campaign = String(rr[R.CAMPAIGN]);
  const name = String(rr[R.AUTHOR] || '').replace(/^'/, '');
  if (rr[R.USED]) return { status: MS.USED, campaign, name, note: String(rr[R.USED]) };

  const camp = ctx.campaigns.find(c => c.name === campaign);
  if (!camp || !camp.link) return { status: MS.NO_LINK, campaign, name, note: '[캠페인] 시트에서 레퍼럴 링크 확인' };
  if (isYes_(ctx.st[K.ONE_PER_EMAIL]) && ctx.sentEmail.has(campaign + '|' + email.toLowerCase())) {
    return { status: MS.DUP_EMAIL, campaign, name, note: '이 이메일로 이미 발송함' };
  }
  if (MailApp.getRemainingDailyQuota() <= 0) {
    return { status: MS.FAIL, campaign, name, note: '오늘 메일 발송 한도 초과 → 내일 자동 재발송' };
  }

  try {
    sendReferralMail_(ctx.st, camp, { email, name, code });
  } catch (err) {
    return { status: MS.FAIL, campaign, name, note: String(err.message || err).slice(0, 300) };
  }

  const used = `${email} · ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')}`;
  ctx.replySh.getRange(ri + 2, R.USED + 1).setValue(used);
  rr[R.USED] = used;
  ctx.sentEmail.add(campaign + '|' + email.toLowerCase());
  return { status: MS.SENT, campaign, name };
}

function sendReferralMail_(st, camp, v) {
  const vars = {
    name: v.name,
    email: v.email,
    code: v.code,
    campaign: camp.name,
    link: camp.link,
    channel: String(st[K.CHANNEL_TITLE] || ''),
  };
  const subject = render_(camp.subject || '[{campaign}] 요청하신 레퍼럴 링크입니다', vars);
  let body = render_(camp.body || '요청하신 {campaign} 레퍼럴 링크입니다.\n\n{link}', vars);
  if (body.indexOf(camp.link) === -1) body += `\n\n${camp.link}`;

  const opts = { to: v.email, subject, body, htmlBody: toHtml_(body) };
  const senderName = String(st[K.SENDER_NAME] || st[K.CHANNEL_TITLE] || '').trim();
  if (senderName) opts.name = senderName;
  const replyTo = String(st[K.REPLY_TO] || '').trim();
  if (replyTo) opts.replyTo = replyTo;
  MailApp.sendEmail(opts);
}

// ── 내 영상 목록 ─────────────────────────────────────────────────

function refreshVideos(e) {
  const ch = myChannel_(true);
  const ids = [];
  let pageToken = '';
  let pages = 0;
  do {
    const params = { playlistId: ch.uploads, maxResults: 50 };
    if (pageToken) params.pageToken = pageToken;
    const res = YouTube.PlaylistItems.list('contentDetails', params);
    (res.items || []).forEach(it => ids.push(it.contentDetails.videoId));
    pageToken = res.nextPageToken || '';
    pages++;
  } while (pageToken && pages < 20);

  const replyCount = {};
  readRows_(sheet_(SHEETS.REPLIES), REPLY_HEADERS.length).forEach(r => {
    if (r[R.STATUS] === ST.REPLIED) replyCount[r[R.VIDEO]] = (replyCount[r[R.VIDEO]] || 0) + 1;
  });

  const rows = [];
  for (let i = 0; i < ids.length; i += 50) {
    const res = YouTube.Videos.list('snippet,statistics', { id: ids.slice(i, i + 50).join(','), maxResults: 50 });
    (res.items || []).forEach(v => {
      const s = v.statistics || {};
      rows.push([
        v.id,
        safeCell_(v.snippet.title),
        new Date(v.snippet.publishedAt),
        Number(s.viewCount || 0),
        Number(s.likeCount || 0),
        Number(s.commentCount || 0),
        replyCount[v.id] || 0,
        `https://www.youtube.com/watch?v=${v.id}`,
      ]);
    });
  }
  rows.sort((a, b) => b[2] - a[2]);

  const sh = sheet_(SHEETS.VIDEOS);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, VIDEO_HEADERS.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, VIDEO_HEADERS.length).setValues(rows);
  if (!e) alert_(`영상 ${rows.length}개를 [${SHEETS.VIDEOS}] 시트에 불러왔습니다.`);
}

// ── 공통 도우미 ──────────────────────────────────────────────────

function getSettings_() {
  const sh = sheet_(SHEETS.SETTINGS);
  const s = {};
  sh.getDataRange().getValues().slice(1).forEach(r => {
    const key = String(r[0]).trim();
    if (key) s[key] = r[1];
  });
  return s;
}

function getCampaigns_() {
  const sh = sheet_(SHEETS.CAMPAIGNS);
  return sh.getDataRange().getValues().slice(1).map(r => ({
    enabled: isYes_(r[0]),
    name: String(r[1]).trim(),
    videos: parseVideoIds_(r[2]),
    keywords: String(r[3]).split(/[,\n]/).map(normalize_).filter(Boolean),
    exact: String(r[4]).trim() === '정확히',
    replyVariants: splitVariants_(r[5]),
    link: String(r[6]).trim(),
    subject: String(r[7] || ''),
    body: String(r[8] || ''),
  })).filter(c => c.name);
}

function setKeyValue_(sheetName, key, value) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sh) return;
  const keys = sh.getDataRange().getValues().map(r => String(r[0]).trim());
  const i = keys.indexOf(key);
  if (i > 0) sh.getRange(i + 1, 2).setValue(value);
  else sh.appendRow([key, value]);
}

function sheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error(`'${name}' 시트가 없습니다. 메뉴 > ① 처음 설정을 먼저 실행하세요.`);
  return sh;
}

function readRows_(sh, cols) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, cols).getValues();
}

function parseVideoIds_(value) {
  return String(value || '').split(/[\s,]+/).map(extractVideoId_).filter(Boolean);
}

function extractVideoId_(s) {
  s = String(s || '').trim();
  if (!s) return '';
  const m = s.match(/(?:[?&]v=|youtu\.be\/|\/shorts\/|\/live\/|\/embed\/)([\w-]{11})/);
  if (m) return m[1];
  return /^[\w-]{11}$/.test(s) ? s : '';
}

/** 띄어쓰기·기호·이모지·대소문자를 무시하고 비교하기 위한 정리 */
function normalize_(s) {
  return String(s || '').normalize('NFC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

function splitVariants_(text) {
  return String(text || '').split(/\r?\n\s*-{3,}\s*(?:\r?\n|$)/).map(v => v.trim()).filter(Boolean);
}

function pick_(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function render_(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (m, k) =>
    (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
}

function isYes_(v) {
  if (v === true) return true;
  return ['예', '네', 'y', 'yes', 'true', 'o', 'on', '켜기', '사용'].indexOf(String(v).trim().toLowerCase()) !== -1;
}

/** 시트에 넣을 때 =, +, - 로 시작하는 글이 수식으로 바뀌지 않도록 */
function safeCell_(s) {
  s = String(s === undefined || s === null ? '' : s);
  return /^[=+\-]/.test(s) ? "'" + s : s;
}

function toHtml_(text) {
  const escaped = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const linked = escaped.replace(/https?:\/\/[^\s<]+/g, url => `<a href="${url}">${url}</a>`);
  return `<div style="font-family:sans-serif;font-size:15px;line-height:1.7">${linked.replace(/\r?\n/g, '<br>')}</div>`;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(60 * 1000)) return null;
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function alert_(msg) {
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    Logger.log(msg); // 트리거 실행 중에는 팝업을 띄울 수 없음
  }
}

function summaryText_(s) {
  if (!s) return '';
  const parts = [
    s.testMode ? '[테스트모드]' : '',
    `댓글 ${s.scanned}개 확인`,
    `키워드 일치 ${s.matched}`,
    `답글 ${s.replied}`,
    s.tested ? `테스트 기록 ${s.tested}` : '',
    s.notSub ? `미구독 답글 ${s.notSub}` : '',
    s.skipped ? `중복 ${s.skipped}` : '',
    s.failed ? `실패 ${s.failed}` : '',
  ].filter(Boolean);
  let text = parts.join(' · ');
  if (s.stopReason) text += `\n⚠️ ${s.stopReason}`;
  if (s.mail) text += `\n📧 ${mailSummaryText_(s.mail)}`;
  if (s.mailError) text += `\n📧 메일 처리 오류: ${s.mailError}`;
  return text;
}

function mailSummaryText_(m) {
  return `메일 발송 ${m.sent}건 · 문제 ${m.problems}건 · 남은 발송 한도 ${m.quota}`;
}
