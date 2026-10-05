"use strict";
/* 서버에서 그리는 HTML 화면들 */

const h = v => String(v === undefined || v === null ? "" : v)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const fmtTime = iso => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
};

const PILL = {
  "답글완료": "ok", "발송완료": "ok", "안내 완료": "ok", "미리보기": "info", "테스트": "info",
  "중복(답글 안 함)": "muted", "중복 이메일": "muted", "안내 댓글 없음": "muted",
};
const pill = s => `<span class="pill ${PILL[s] || "warn"}">${h(s)}</span>`;

function head(title) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${h(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=IBM+Plex+Sans+KR:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="/static/style.css"></head>`;
}

function layout({ title, user, csrf, flash, active, body }) {
  const nav = [
    ["dashboard", "/dashboard", "대시보드"],
    ["new", "/campaigns/new", "캠페인 만들기"],
    ["demo", "/demo", "가상 유튜브"],
    ["emails", "/emails", "보낸 메일"],
    ["settings", "/settings", "설정"],
  ];
  if (user.role === "admin") nav.push(["admin", "/admin", "관리자"]);
  const warn = user.defaultPassword
    ? `<div class="banner warn">테스트용 기본 비밀번호(admin)를 쓰고 있습니다. 실제 운영 전에 <a href="/settings#password">설정</a>에서 꼭 바꾸세요.</div>` : "";
  return `${head(`${title} · AI 자비스`)}<body>
<header class="top"><div class="top-in">
  <a class="brand" href="/dashboard"><span class="dot"></span>AI 자비스</a>
  <nav>${nav.map(([k, href, label]) => `<a href="${href}"${k === active ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
  <form method="post" action="/logout" class="who"><input type="hidden" name="_csrf" value="${h(csrf)}"><span>${h(user.username)}</span><button class="link-btn">로그아웃</button></form>
</div></header>
<main class="wrap">${warn}${flash ? `<div class="banner ${flash.type === "error" ? "error" : "ok"}">${h(flash.text)}</div>` : ""}${body}</main>
<script>
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-copy]"); if (!b) return;
  var t = b.getAttribute("data-copy"), done = function () { var o = b.textContent; b.textContent = "복사됨"; setTimeout(function () { b.textContent = o; }, 1400); };
  if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, function () { window.prompt("복사하세요", t); }); else window.prompt("복사하세요", t);
});
</script></body></html>`;
}

// ── 로그인 / 가입 ──
function authPage({ mode, error, csrf, allowSignup }) {
  const signup = mode === "signup";
  return `${head(signup ? "가입 · AI 자비스" : "로그인 · AI 자비스")}<body class="auth">
<main class="auth-card">
  <div class="onair"><i></i>ON AIR · 24시간 자동 운영</div>
  <h1>나만의 유튜브 채널<br><span>AI 자비스</span></h1>
  <p class="muted">키워드 댓글에 자동 답글 → 신청 폼 → 제휴사 레퍼럴 링크 메일까지 자동으로.</p>
  ${error ? `<div class="banner error">${h(error)}</div>` : ""}
  <form method="post" action="${signup ? "/signup" : "/login"}" class="stack">
    <input type="hidden" name="_csrf" value="${h(csrf)}">
    <label>아이디<input name="username" id="username" autocomplete="username" required minlength="3" maxlength="30"></label>
    <label>비밀번호<input name="password" id="password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" required></label>
    ${signup ? '<label>비밀번호 확인<input name="password2" id="password2" type="password" autocomplete="new-password" required></label>' : ""}
    <button class="btn primary">${signup ? "가입하고 시작하기" : "로그인"}</button>
  </form>
  ${allowSignup ? `<p class="muted small">${signup ? '이미 계정이 있나요? <a href="/login">로그인</a>' : '처음이신가요? <a href="/signup">무료로 가입하기</a>'}</p>` : ""}
  ${!signup ? '<p class="muted small">테스트 계정: <code>admin</code> / <code>admin</code></p>' : ""}
</main></body></html>`;
}

// ── 대시보드 ──
function connectionChips({ user, provider, googleReady }) {
  const yt = provider === "live"
    ? `<span class="chip ok">유튜브 연결됨 · ${h(user.youtube && user.youtube.title)}</span>`
    : `<span class="chip info">데모 모드 · 가상 유튜브로 시험 중</span>`;
  const test = provider === "live" && user.settings.testMode ? '<span class="chip warn">테스트모드 (실제로 답글 안 달림)</span>' : "";
  const mailNames = { outbox: "메일 미리보기만 (실제 발송 안 함)", resend: "메일: Resend 발송", gmail: "메일: Gmail 발송" };
  const mp = (user.settings.mail && user.settings.mail.provider) || "outbox";
  const mail = `<span class="chip ${mp === "outbox" ? "info" : "ok"}">${mailNames[mp]}</span>`;
  const hint = provider !== "live" && googleReady ? '<a class="chip link" href="/settings#youtube">실제 유튜브 연결하기 →</a>' : "";
  return `<div class="chips">${yt}${test}${mail}${hint}</div>`;
}

function quickForm(csrf) {
  return `<form method="post" action="/campaigns" class="quick">
  <input type="hidden" name="_csrf" value="${h(csrf)}"><input type="hidden" name="quick" value="1">
  <div class="quick-grid">
    <label class="span2">유튜브 영상 링크 <small>여러 개면 쉼표로 · 비우면 내 채널 전체(새 영상 자동 포함)</small>
      <input name="videos" id="q-videos" placeholder="https://www.youtube.com/watch?v=L1X_BF5mha4"></label>
    <label>제휴사 이름<input name="name" id="q-name" required placeholder="후커블"></label>
    <label>반응할 댓글 키워드<input name="keywords" id="q-keywords" required placeholder="후커블"></label>
    <label class="span2">보낼 레퍼럴 링크 <small>댓글에는 안 나가고 메일로만 전달</small>
      <input name="referralLink" id="q-link" type="url" required placeholder="https://..."></label>
  </div>
  <button class="btn primary">자동화 시작</button>
  <p class="muted small">답글 문구와 메일 문구는 기본값으로 만들어지고, 만든 뒤 언제든 바꿀 수 있습니다.</p>
</form>`;
}

function dashboardPage(p) {
  const { user, csrf, stats, campaigns, recent, formUrl } = p;
  const tiles = [
    ["오늘 답글", stats.todayReplies, `하루 한도 ${user.settings.dailyLimit}`],
    ["전체 답글", stats.replies, "자동으로 단 대댓글"],
    ["접수", stats.submissions, "신청 폼 제출"],
    ["보낸 레퍼럴 메일", stats.sent, stats.preview ? `미리보기 ${stats.preview}건 포함` : "발송 완료"],
  ];
  const lastRun = user.state && user.state.lastRun ? `마지막 확인 ${fmtTime(user.state.lastRun.at)} · ${h(user.state.lastRun.text)}` : "아직 확인 전";
  const campRows = campaigns.length ? campaigns.map(c => `
    <article class="camp">
      <div class="camp-head">
        <a href="/campaigns/${h(c.id)}" class="camp-name">${h(c.name)}</a>
        ${c.active ? '<span class="pill ok">작동 중</span>' : '<span class="pill muted">멈춤</span>'}
      </div>
      <div class="muted small">${c.target === "channel" ? "내 채널 전체 영상 (새 영상 자동 포함)" : `영상 ${c.videos.length}개`} · 키워드 ${h(c.keywords.join(", "))} · ${c.exact ? "정확히" : "포함"}</div>
      <div class="camp-stats"><span>답글 <b>${c.stats.replies}</b></span><span>접수 <b>${c.stats.subs}</b></span><span>메일 <b>${c.stats.sent}</b></span></div>
      <div class="row gap"><code class="clip">${h(formUrl(c))}</code><button type="button" class="btn small" data-copy="${h(formUrl(c))}">신청 폼 링크 복사</button></div>
    </article>`).join("") : `<div class="empty">아직 캠페인이 없습니다. 위에서 유튜브 링크와 레퍼럴 링크를 넣으면 바로 시작합니다.</div>`;

  const recentRows = recent.length ? `<table class="grid"><thead><tr><th>시간</th><th>종류</th><th>내용</th><th>상태</th></tr></thead><tbody>${recent.map(r => `
    <tr><td class="mono">${fmtTime(r.at)}</td><td>${h(r.kind)}</td><td class="wrap">${h(r.text)}</td><td>${pill(r.status)}</td></tr>`).join("")}</tbody></table>` : '<div class="empty">아직 기록이 없습니다.</div>';

  const body = `
  <section class="hero-row">
    <div><h1>대시보드</h1>${connectionChips(p)}</div>
    <form method="post" action="/run"><input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn">지금 댓글 확인하기</button></form>
  </section>
  <p class="muted small">${lastRun} · ${user.settings.intervalMin}분마다 자동 확인</p>
  <section class="tiles">${tiles.map(([k, v, s]) => `<div class="tile"><span class="k">${k}</span><b>${v}</b><span class="s">${h(s)}</span></div>`).join("")}</section>
  <section class="card"><h2>유튜브 링크 넣고 바로 시작</h2>${quickForm(csrf)}</section>
  <section><div class="sec-head"><h2>내 캠페인</h2><a class="btn small" href="/campaigns/new">자세히 만들기</a></div><div class="camps">${campRows}</div></section>
  <section><h2>최근 활동</h2><div class="table-wrap">${recentRows}</div></section>`;
  return layout({ title: "대시보드", user, csrf, flash: p.flash, active: "dashboard", body });
}

// ── 캠페인 ──
function campaignForm(c, csrf, isNew) {
  const action = isNew ? "/campaigns" : `/campaigns/${h(c.id)}`;
  return `<form method="post" action="${action}" class="stack campaign-form">
  <input type="hidden" name="_csrf" value="${h(csrf)}">
  <div class="two">
    <label>제휴사 이름<input name="name" id="c-name" required value="${h(c.name)}"></label>
    <label class="check"><input type="checkbox" name="active" id="c-active" ${c.active ? "checked" : ""}> 사용 (체크하면 자동으로 동작)</label>
  </div>
  <fieldset><legend>어느 영상의 댓글에 반응할까요?</legend>
    <label class="check"><input type="radio" name="target" value="channel" id="c-t-ch" ${c.target === "channel" ? "checked" : ""}> 내 채널 전체 영상 <small>새로 올리는 영상도 자동 포함</small></label>
    <label class="check"><input type="radio" name="target" value="videos" id="c-t-v" ${c.target !== "channel" ? "checked" : ""}> 특정 영상만</label>
    <label>영상 링크 <small>여러 개면 쉼표나 줄바꿈으로</small><textarea name="videos" id="c-videos" rows="2" placeholder="https://www.youtube.com/watch?v=...">${h((c.videos || []).map(v => `https://youtu.be/${v}`).join("\n"))}</textarea></label>
  </fieldset>
  <div class="two">
    <label>키워드 <small>쉼표로 여러 개 · 띄어쓰기·대소문자·기호 무시</small><input name="keywords" id="c-keywords" required value="${h((c.keywords || []).join(", "))}"></label>
    <label>일치 방식<select name="exact" id="c-exact"><option value="0" ${!c.exact ? "selected" : ""}>포함 (댓글 안에 키워드가 있으면)</option><option value="1" ${c.exact ? "selected" : ""}>정확히 (댓글이 키워드 그 자체)</option></select></label>
  </div>
  <label>대댓글 문구 <small>줄에 --- 만 적으면 여러 버전으로 나뉘어 무작위로 사용 · {name} 작성자 · {code} 인증코드 · {form} 신청 폼 주소 · {campaign} 제휴사</small>
    <textarea name="replyTemplate" id="c-reply" rows="8">${h(c.replyTemplate)}</textarea></label>
  <label>레퍼럴 링크 <small>메일에만 들어가고 댓글에는 절대 나가지 않습니다</small><input name="referralLink" id="c-link" type="url" required value="${h(c.referralLink)}"></label>
  <div class="two">
    <label>메일 제목<input name="mailSubject" id="c-subject" value="${h(c.mailSubject)}"></label>
    <span></span>
  </div>
  <label>메일 내용 <small>{name} {email} {campaign} {link} {code} {channel} · {link}를 빼면 맨 아래에 자동으로 붙음</small>
    <textarea name="mailBody" id="c-body" rows="8">${h(c.mailBody)}</textarea></label>
  <label>새 영상 안내 댓글 <small>"내 채널 전체 영상"일 때, 새 영상이 올라오면 내 채널 이름으로 자동 작성 · 비우면 안 남김 · {keyword} {campaign} {title}</small>
    <textarea name="announce" id="c-announce" rows="3">${h(c.announce)}</textarea></label>
  <div class="row gap wrap-row">
    <label class="check"><input type="checkbox" name="onePerPerson" id="c-opp" ${c.onePerPerson ? "checked" : ""}> 같은 사람에게는 한 번만 답글</label>
    <label class="check"><input type="checkbox" name="onePerEmail" id="c-ope" ${c.onePerEmail ? "checked" : ""}> 같은 이메일에는 한 번만 발송</label>
  </div>
  <div class="row gap"><button class="btn primary">${isNew ? "만들기" : "저장"}</button>${isNew ? "" : '<a class="btn" href="/dashboard">대시보드로</a>'}</div>
</form>`;
}

function campaignPage(p) {
  const { user, csrf, camp, isNew, replies = [], subs = [], formUrl, videoTitles = {} } = p;
  if (isNew) {
    return layout({ title: "캠페인 만들기", user, csrf, flash: p.flash, active: "new", body: `<h1>캠페인 만들기</h1><section class="card">${campaignForm(camp, csrf, true)}</section>` });
  }
  const repTable = replies.length ? `<table class="grid"><thead><tr><th>시간</th><th>영상</th><th>작성자</th><th>댓글</th><th>인증코드</th><th>상태</th><th>코드 사용</th></tr></thead><tbody>${replies.map(r => `
    <tr><td class="mono">${fmtTime(r.at)}</td><td class="small">${h(videoTitles[r.videoId] || r.videoId)}</td><td>${h(r.author)}</td><td class="wrap">${h(r.comment)}</td><td class="mono">${h(r.code || "")}</td><td>${pill(r.status)}${r.note ? `<div class="muted small">${h(r.note)}</div>` : ""}</td><td class="small">${h(r.usedBy || "")}</td></tr>`).join("")}</tbody></table>` : '<div class="empty">아직 반응한 댓글이 없습니다.</div>';
  const subTable = subs.length ? `<table class="grid"><thead><tr><th>시간</th><th>이메일</th><th>인증코드</th><th>유튜브 이름</th><th>상태</th></tr></thead><tbody>${subs.map(s => `
    <tr><td class="mono">${fmtTime(s.at)}</td><td>${h(s.email)}</td><td class="mono">${h(s.code)}</td><td>${h(s.author || "")}</td><td>${pill(s.status)}${s.note ? `<div class="muted small">${h(s.note)}</div>` : ""}</td></tr>`).join("")}</tbody></table>` : '<div class="empty">아직 접수가 없습니다.</div>';

  const body = `
  <section class="hero-row">
    <div><h1>${h(camp.name)}</h1><div class="chips">${camp.active ? '<span class="chip ok">작동 중</span>' : '<span class="chip">멈춤</span>'}<span class="chip">${camp.target === "channel" ? "내 채널 전체 영상" : `영상 ${camp.videos.length}개`}</span></div></div>
    <div class="row gap">
      <form method="post" action="/campaigns/${h(camp.id)}/toggle"><input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn">${camp.active ? "멈추기" : "다시 켜기"}</button></form>
      <form method="post" action="/campaigns/${h(camp.id)}/delete" onsubmit="return confirm('이 캠페인과 기록을 삭제할까요?')"><input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn danger">삭제</button></form>
    </div>
  </section>
  <section class="card">
    <h2>신청 폼 링크</h2>
    <p class="muted small">대댓글에는 이 주소 뒤에 그 사람의 인증코드가 붙어서 나갑니다. 구독자가 열면 코드가 미리 입력되어 있어 이메일만 적으면 됩니다.</p>
    <div class="row gap"><code class="clip">${h(formUrl)}</code><button type="button" class="btn small" data-copy="${h(formUrl)}">복사</button><a class="btn small" href="${h(formUrl)}" target="_blank" rel="noopener">열어보기</a></div>
  </section>
  <section><h2>댓글 처리 기록</h2><div class="table-wrap">${repTable}</div></section>
  <section><h2>신청 접수 기록</h2><div class="table-wrap">${subTable}</div></section>
  <section class="card"><h2>설정 바꾸기</h2>${campaignForm(camp, csrf, false)}</section>`;
  return layout({ title: camp.name, user, csrf, flash: p.flash, active: "", body });
}

// ── 가상 유튜브 (데모) ──
function demoPage(p) {
  const { user, csrf, videos, comments, provider } = p;
  const byVideo = v => comments.filter(c => c.videoId === v.id && !c.parentId).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const repliesOf = id => comments.filter(c => c.parentId === id);
  const linkify = t => h(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  const cmt = (c, reply) => `<div class="cmt${reply ? " reply" : ""}"><div class="av ${c.authorChannelId && c.authorChannelId.startsWith("DEMO_") ? "me" : "fan"}">${h((c.author || "?").replace("@", "").slice(0, 1))}</div>
    <div><div class="n">${h(c.author)} <small>${fmtTime(c.publishedAt)}${c.pinnedNotice ? " · 자비스 안내 댓글" : ""}</small></div><p>${linkify(c.text)}</p></div></div>`;
  const videoCards = videos.length ? videos.map(v => `
    <article class="card video">
      <div class="sec-head"><div><h3>${h(v.title)}</h3><span class="muted small mono">영상 ID ${h(v.id)}</span></div>
        <button type="button" class="btn small" data-copy="${h(v.id)}">ID 복사</button></div>
      <form method="post" action="/demo/comments" class="row gap wrap-row comment-form">
        <input type="hidden" name="_csrf" value="${h(csrf)}"><input type="hidden" name="videoId" value="${h(v.id)}">
        <input name="author" id="a-${h(v.id)}" placeholder="@구독자 이름" value="@fan_${Math.floor(Math.random() * 900 + 100)}" aria-label="댓글 작성자">
        <input name="text" id="t-${h(v.id)}" placeholder="댓글 내용 (예: 후커블 신청합니다!)" required class="grow" aria-label="댓글 내용">
        <button class="btn small">구독자로 댓글 달기</button>
      </form>
      <div class="comments">${byVideo(v).map(c => cmt(c) + repliesOf(c.id).map(r => cmt(r, true)).join("")).join("") || '<div class="empty small">아직 댓글이 없습니다.</div>'}</div>
    </article>`).join("") : '<div class="empty">가상 영상이 없습니다. 위에서 하나 올려 보세요.</div>';

  const body = `
  <section class="hero-row"><div><h1>가상 유튜브</h1>
    <p class="muted">구글 연결 없이 자비스를 처음부터 끝까지 시험하는 곳입니다. 가상 영상을 올리고 구독자처럼 댓글을 달면, 자비스가 실제와 똑같이 답글을 답니다.</p>
    ${provider === "live" ? '<div class="banner warn">지금은 실제 유튜브에 연결되어 있어 자비스는 이 가상 유튜브를 보지 않습니다. 설정에서 "데모 모드"로 바꾸면 여기서 시험할 수 있습니다.</div>' : ""}</div>
    <form method="post" action="/run"><input type="hidden" name="_csrf" value="${h(csrf)}"><input type="hidden" name="back" value="/demo"><button class="btn primary">자비스 지금 확인하기</button></form>
  </section>
  <ol class="howto"><li>가상 영상 올리기</li><li>대시보드에서 캠페인 만들기 (링크를 비우면 채널 전체)</li><li>구독자로 키워드 댓글 달기</li><li>"자비스 지금 확인하기" → 답글 확인</li><li>답글의 신청 링크 열고 이메일 제출 → 보낸 메일 확인</li></ol>
  <section class="card"><form method="post" action="/demo/videos" class="row gap wrap-row">
    <input type="hidden" name="_csrf" value="${h(csrf)}">
    <input name="title" id="demo-title" placeholder="영상 제목" required class="grow" value="후커블로 숏폼 훅 만드는 법">
    <button class="btn">가상 영상 올리기</button></form></section>
  ${videoCards}`;
  return layout({ title: "가상 유튜브", user, csrf, flash: p.flash, active: "demo", body });
}

// ── 보낸 메일 ──
function emailsPage(p) {
  const { user, csrf, emails } = p;
  const rows = emails.length ? emails.map(e => `
    <details class="mail"><summary><span class="mono">${fmtTime(e.at)}</span><span>${h(e.to)}</span><span class="grow">${h(e.subject)}</span>${pill(e.status)}</summary>
      <div class="mail-body"><div class="muted small">${h(e.kind)} · ${h(e.provider)}${e.error ? ` · ${h(e.error)}` : ""}</div><pre>${h(e.text)}</pre></div></details>`).join("") : '<div class="empty">아직 보낸 메일이 없습니다.</div>';
  const body = `<h1>보낸 메일</h1>
  <p class="muted">신청 폼으로 들어온 사람에게 보낸 레퍼럴 메일과 새 영상 알림입니다. "미리보기"는 발송 방식이 미리보기라 실제로 나가지 않은 메일입니다.</p>
  <section class="mails">${rows}</section>`;
  return layout({ title: "보낸 메일", user, csrf, flash: p.flash, active: "emails", body });
}

// ── 설정 ──
function settingsPage(p) {
  const { user, csrf, googleReady, provider } = p;
  const s = user.settings;
  const m = s.mail || {};
  const yt = user.youtube;
  const ytBlock = !googleReady
    ? `<div class="banner warn">이 서버에는 아직 구글 연결 정보(GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)가 없습니다. 플랫폼 운영자가 넣으면 여기서 "유튜브 채널 연결" 버튼이 생깁니다. 그 전까지는 데모 모드로 시험할 수 있습니다.</div>`
    : yt
      ? `<p>연결된 채널: <b>${h(yt.title)}</b> <span class="muted small mono">${h(yt.id)}</span></p>
         <form method="post" action="/auth/google/disconnect"><input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn small">연결 끊기</button></form>`
      : `<p class="muted">유튜브 채널을 가진 구글 계정으로 연결하세요. 브랜드 계정 채널이면 연결 화면에서 그 채널을 고르세요.</p>
         <a class="btn primary" href="/auth/google?kind=youtube">유튜브 채널 연결</a>`;
  const opt = (v, cur, label) => `<option value="${v}" ${cur === v ? "selected" : ""}>${label}</option>`;
  const body = `<h1>설정</h1>
  <form method="post" action="/settings" class="stack">
    <input type="hidden" name="_csrf" value="${h(csrf)}">
    <section class="card" id="youtube"><h2>유튜브 연결</h2>${ytBlock}
      <label>운영 모드<select name="mode" id="s-mode">${opt("demo", s.mode, "데모 모드 — 가상 유튜브로 시험")}${opt("live", s.mode, "실제 유튜브 — 연결한 채널에서 동작")}</select></label>
      <label class="check"><input type="checkbox" name="testMode" id="s-test" ${s.testMode ? "checked" : ""}> 테스트모드 (실제 유튜브에서 답글을 달지 않고 기록만 남김)</label>
      <div class="two">
        <label>확인 주기 (분)<select name="intervalMin" id="s-interval">${[1, 5, 10, 15, 30].map(n => opt(String(n), String(s.intervalMin), `${n}분마다`)).join("")}</select></label>
        <label>하루 최대 답글 수 <small>유튜브 API 무료 한도로 하루 약 190개가 최대</small><input name="dailyLimit" id="s-limit" type="number" min="1" max="190" value="${h(s.dailyLimit)}"></label>
      </div>
      <label>처음 확인할 과거 시간 (시간) <small>처음 켤 때 몇 시간 전 댓글까지 답할지</small><input name="firstHours" id="s-first" type="number" min="1" max="720" value="${h(s.firstHours)}"></label>
      <label class="check"><input type="checkbox" name="newVideoAuto" id="s-newvid" ${s.newVideoAuto !== false ? "checked" : ""}> 새 영상 자동화 (새 영상 감지 → 안내 댓글 · 알림 메일)</label>
      <label>새 영상 알림 받을 이메일 <small>비우면 알림 안 보냄</small><input name="notifyEmail" id="s-notify" type="email" value="${h(s.notifyEmail)}"></label>
    </section>
    <section class="card" id="mail"><h2>메일 발송</h2>
      <label>발송 방식<select name="mailProvider" id="s-mailp">${opt("outbox", m.provider || "outbox", "미리보기만 (실제로 보내지 않음)")}${opt("resend", m.provider, "Resend API로 발송")}${opt("gmail", m.provider, "내 Gmail로 발송 (구글 연결 필요)")}</select></label>
      <div class="two">
        <label>보내는 사람 이름<input name="senderName" id="s-sender" value="${h(m.senderName)}" placeholder="${h((yt && yt.title) || user.username)}"></label>
        <label>답장 받을 이메일<input name="replyTo" id="s-replyto" type="email" value="${h(m.replyTo)}"></label>
      </div>
      <div class="two">
        <label>Resend 보내는 주소 <small>Resend에서 인증한 도메인 주소</small><input name="mailFrom" id="s-from" type="email" value="${h(m.from)}" placeholder="hello@mydomain.com"></label>
        <label>Resend API 키 <small>${m.resendKey ? "저장됨 · 바꿀 때만 입력" : "re_로 시작"}</small><input name="resendKey" id="s-rkey" type="password" autocomplete="off"></label>
      </div>
      ${googleReady ? `<p class="muted small">Gmail 발송: ${user.google && user.google.gmail ? `연결됨 (${h(user.google.email || "")})` : '<a href="/auth/google?kind=gmail">Gmail 발송 권한 연결하기</a>'} · 일반 Gmail은 하루 100통, Workspace는 1,500통까지</p>` : ""}
    </section>
    <button class="btn primary">설정 저장</button>
  </form>
  <section class="card" id="password"><h2>비밀번호 바꾸기</h2>
    <form method="post" action="/settings/password" class="stack">
      <input type="hidden" name="_csrf" value="${h(csrf)}">
      <div class="two"><label>지금 비밀번호<input name="current" id="p-cur" type="password" autocomplete="current-password" required></label>
      <label>새 비밀번호 <small>8자 이상</small><input name="next" id="p-next" type="password" autocomplete="new-password" required minlength="8"></label></div>
      <button class="btn">비밀번호 바꾸기</button>
    </form></section>`;
  return layout({ title: "설정", user, csrf, flash: p.flash, active: "settings", body });
}

// ── 관리자 ──
function adminPage(p) {
  const { user, csrf, users } = p;
  const rows = users.map(u => `<tr><td>${h(u.username)}</td><td>${u.role === "admin" ? '<span class="pill info">관리자</span>' : "일반"}</td><td>${h(u.mode)}</td><td>${h(u.channel || "")}</td><td class="num">${u.campaigns}</td><td class="num">${u.replies}</td><td class="num">${u.sent}</td><td class="mono">${fmtTime(u.createdAt)}</td></tr>`).join("");
  const body = `<h1>관리자</h1><p class="muted">플랫폼에 가입한 사용자와 사용량입니다.</p>
  <div class="table-wrap"><table class="grid"><thead><tr><th>아이디</th><th>권한</th><th>모드</th><th>채널</th><th>캠페인</th><th>답글</th><th>메일</th><th>가입</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  return layout({ title: "관리자", user, csrf, flash: p.flash, active: "admin", body });
}

// ── 구독자용 신청 폼 (공개) ──
function publicFormPage({ camp, channelTitle, code, result, email }) {
  const done = result && result.ok;
  return `${head(`${camp ? camp.name : "신청"} 혜택 신청`)}<body class="public">
<main class="public-card">
  ${camp ? `<div class="eyebrow">${h(channelTitle)}</div><h1>${h(camp.name)} 혜택 신청</h1>` : "<h1>신청 페이지를 찾을 수 없습니다</h1>"}
  ${result ? `<div class="banner ${result.ok ? "ok" : "error"}">${h(result.message)}</div>` : ""}
  ${camp && !done ? `<p class="muted">유튜브 답글에서 받은 인증코드와 이메일을 입력하시면, ${h(camp.name)} 전용 링크를 메일로 바로 보내드립니다.</p>
  <form method="post" class="stack">
    <label>이메일 주소<input name="email" id="f-email" type="email" required autocomplete="email" value="${h(email)}" placeholder="you@example.com"></label>
    <label>인증코드 <small>답글 링크로 들어오셨다면 이미 입력되어 있어요</small><input name="code" id="f-code" required value="${h(code)}" class="mono" maxlength="12" autocapitalize="characters"></label>
    <label class="check consent"><input type="checkbox" name="consent" id="f-consent" required> <span><b>개인정보 수집·이용 동의</b><br><small>수집 항목: 이메일 주소 · 목적: 신청하신 제휴사 링크 발송 · 보유 기간: 발송 후 1년 (요청 시 즉시 삭제)</small></span></label>
    <button class="btn primary">링크 받기</button>
  </form>` : ""}
  <p class="muted small foot">나만의 유튜브 채널 AI 자비스</p>
</main></body></html>`;
}

module.exports = { authPage, dashboardPage, campaignPage, demoPage, emailsPage, settingsPage, adminPage, publicFormPage, h };
