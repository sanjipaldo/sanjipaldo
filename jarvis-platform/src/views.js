"use strict";
/* 자비스 AI 화면. 구성: 잉크색 내비 → 잉크색 히어로(굵은 대문자 헤드라인) → 흰 콘텐츠 → 잉크색 푸터.
   강조색은 빨강 하나, 버튼은 모두 알약 모양, 카드는 그림자 없이 6px 모서리. */

const h = v => String(v === undefined || v === null ? "" : v)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const fmtTime = iso => {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
};

// 자비스가 대신 운영할 사업 자동화 모듈. 새 모듈은 여기에 한 줄 추가하고 ready:true 로 바꾸면 홈에 열린다.
const MODULES = [
  { key: "youtube", no: "01", en: "YOUTUBE", name: "유튜브 채널 운영", desc: "키워드 댓글에 자동 답글 → 신청 접수 → 레퍼럴 링크 메일. 새 영상도 자동으로 따라갑니다.", href: "/youtube", ready: true },
  { key: "commerce", no: "02", en: "COMMERCE", name: "쇼핑몰 주문 관리", desc: "주문 수집 · 발주 확인 · 송장 전송을 자비스가 대신합니다.", ready: false },
  { key: "cs", no: "03", en: "CUSTOMER", name: "고객 문의 응대", desc: "자주 오는 문의에 자동으로 답하고, 사람이 볼 것만 골라 알려줍니다.", ready: false },
  { key: "report", no: "04", en: "REPORT", name: "매출 · 성과 리포트", desc: "채널 · 쇼핑몰 숫자를 모아 매일 아침 한 장으로 보내줍니다.", ready: false },
];

const PILL = {
  "답글완료": "ok", "발송완료": "ok", "안내 완료": "ok",
  "미리보기": "soft", "테스트": "soft",
  "중복(답글 안 함)": "muted", "중복 이메일": "muted", "안내 댓글 없음": "muted",
};
const pill = s => `<span class="pill ${PILL[s] || "alert"}">${h(s)}</span>`;

const ORB = `<span class="orb" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M14.5 4h3v10.2c0 3.6-2.3 5.8-5.9 5.8-2.2 0-4-.8-5.1-2.3l2.1-2c.7.9 1.7 1.4 2.9 1.4 1.8 0 3-1.1 3-3.1V4z"/></svg></span>`;

function head(title) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${h(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&family=Noto+Sans+KR:wght@300;400;600;700;800&display=swap">
<link rel="stylesheet" href="/static/style.css"></head>`;
}

const COPY_SCRIPT = `<script>
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-copy]"); if (!b) return;
  var t = b.getAttribute("data-copy"), done = function () { var o = b.textContent; b.textContent = "복사됨"; setTimeout(function () { b.textContent = o; }, 1400); };
  if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, function () { window.prompt("복사하세요", t); }); else window.prompt("복사하세요", t);
});
</script>`;

function topNav(user, csrf, section) {
  const links = [["hub", "/hub", "홈"], ["youtube", "/youtube", "유튜브 채널 운영"], ["settings", "/settings", "계정 설정"]];
  if (user.role === "admin") links.push(["admin", "/admin", "관리자"]);
  const items = links.map(([k, href, label]) => `<a href="${href}"${k === section ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  const logout = `<form method="post" action="/logout"><input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn on-dark sm">로그아웃</button></form>`;
  return `<header class="nav"><div class="nav-in">
  <a class="brand" href="/hub">${ORB}<span>JARVIS AI</span></a>
  <nav class="nav-links" aria-label="주 메뉴">${items}</nav>
  <div class="nav-user"><span class="who">${h(user.username)}</span>${logout}</div>
  <details class="nav-menu"><summary aria-label="메뉴 열기">메뉴</summary><div class="nav-sheet">${items}<span class="who">${h(user.username)}</span>${logout}</div></details>
</div></header>`;
}

function hero({ eyebrow, title, size = "page", sub, aside = "", below = "" }) {
  return `<section class="hero hero-${size}"><div class="band-in">
  <div class="hero-grid"><div class="hero-copy">
    ${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ""}
    <h1 class="display">${title}</h1>
    ${sub ? `<p class="hero-sub">${sub}</p>` : ""}
  </div>${aside ? `<div class="hero-aside">${aside}</div>` : ""}</div>
  ${below}
</div></section>`;
}

const YT_TABS = [["dash", "/youtube", "대시보드"], ["new", "/youtube/campaigns/new", "캠페인 만들기"], ["demo", "/youtube/demo", "가상 유튜브"], ["emails", "/youtube/emails", "보낸 메일"], ["settings", "/youtube/settings", "채널 설정"]];
const moduleTabs = active => `<div class="tabs"><div class="band-in"><nav class="tab-row" aria-label="유튜브 채널 운영 메뉴">${YT_TABS.map(([k, href, label]) => `<a href="${href}"${k === active ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav></div></div>`;

function footer() {
  return `<footer class="footer"><div class="band-in">
  <div class="foot-grid">
    <div class="foot-brand">${ORB}<div><b>JARVIS AI</b><p>사장님 대신 24시간 운영하는 사업 자동화 비서</p></div></div>
    <div><p class="caps">자동화 모듈</p>${MODULES.map(m => m.ready ? `<a href="${m.href}">${m.name}</a>` : `<span>${m.name} · 준비 중</span>`).join("")}</div>
    <div><p class="caps">계정</p><a href="/hub">홈</a><a href="/settings">계정 설정</a></div>
  </div>
  <p class="foot-note">© JARVIS AI · 테스트 버전</p>
</div></footer>`;
}

function layout({ title, user, csrf, flash, section, tab, heroHtml, body }) {
  const warn = user.defaultPassword
    ? `<div class="notice alert">테스트용 기본 비밀번호(admin)를 쓰고 있습니다. 실제 운영 전에 <a href="/settings#password">계정 설정</a>에서 꼭 바꾸세요.</div>` : "";
  const msg = flash ? `<div class="notice ${flash.type === "error" ? "alert" : "ok"}" role="status">${h(flash.text)}</div>` : "";
  return `${head(`${title} · JARVIS AI`)}<body>
${topNav(user, csrf, section)}
${heroHtml}
${tab ? moduleTabs(tab) : ""}
<main class="content"><div class="band-in stack-lg">${warn}${msg}${body}</div></main>
${footer()}
${COPY_SCRIPT}</body></html>`;
}

// ── 로그인 / 가입 ──
function authPage({ mode, error, allowSignup }) {
  const signup = mode === "signup";
  return `${head(signup ? "가입 · JARVIS AI" : "로그인 · JARVIS AI")}<body class="auth">
<section class="auth-hero"><div class="auth-copy">
  <a class="brand" href="/login">${ORB}<span>JARVIS AI</span></a>
  <h1 class="display">YOUR<br>BUSINESS,<br>ON<br>AUTOPILOT.</h1>
  <p class="hero-sub">사장님 대신 24시간 운영하는 자동화 비서. 첫 번째 자비스는 유튜브 채널 운영입니다.</p>
</div></section>
<main class="auth-panel"><div class="auth-card">
  <p class="eyebrow dark">${signup ? "CREATE ACCOUNT" : "SIGN IN"}</p>
  <h2 class="title-md">${signup ? "자비스 시작하기" : "다시 오신 걸 환영합니다"}</h2>
  ${error ? `<div class="notice alert">${h(error)}</div>` : ""}
  <form method="post" action="${signup ? "/signup" : "/login"}" class="stack">
    <label>아이디<input name="username" id="username" autocomplete="username" required minlength="3" maxlength="30"></label>
    <label>비밀번호<input name="password" id="password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" required></label>
    ${signup ? '<label>비밀번호 확인<input name="password2" id="password2" type="password" autocomplete="new-password" required></label>' : ""}
    <button class="btn primary block">${signup ? "가입하고 시작하기" : "로그인"}</button>
  </form>
  ${allowSignup ? `<p class="muted">${signup ? '이미 계정이 있나요? <a href="/login">로그인</a>' : '처음이신가요? <a href="/signup">무료로 가입하기</a>'}</p>` : ""}
  ${!signup ? '<p class="badge">테스트 계정 &nbsp;admin / admin</p>' : ""}
</div></main></body></html>`;
}

// ── 자비스 AI 홈 ──
function hubPage(p) {
  const { user, csrf, youtube } = p;
  const s = youtube.stats;
  const cards = MODULES.map(m => m.ready ? `
    <article class="module featured">
      <div class="module-top"><span class="caps">MODULE ${m.no}</span><span class="pill on-dark">작동 중</span></div>
      <h3 class="module-en">${m.en}</h3>
      <p class="module-name">${m.name}</p>
      <p class="module-desc">${m.desc}</p>
      <dl class="module-stats">
        <div><dt>캠페인</dt><dd>${youtube.campaigns.length}</dd></div>
        <div><dt>오늘 답글</dt><dd>${s.todayReplies}</dd></div>
        <div><dt>보낸 메일</dt><dd>${s.sent}</dd></div>
      </dl>
      <a class="btn primary" href="${m.href}">열기</a>
    </article>` : `
    <article class="module">
      <div class="module-top"><span class="caps">MODULE ${m.no}</span><span class="badge">준비 중</span></div>
      <h3 class="module-en">${m.en}</h3>
      <p class="module-name">${m.name}</p>
      <p class="module-desc">${m.desc}</p>
    </article>`).join("");
  const heroHtml = hero({
    size: "hero",
    eyebrow: `${h(user.username)}님의 자동화 본부`,
    title: "JARVIS AI",
    sub: "사장님 대신 24시간 운영하는 사업 자동화 비서. 모듈을 하나씩 켜면 자비스가 그 일을 맡습니다.",
  });
  const body = `
  <div class="section-head"><div><p class="eyebrow dark">MODULES</p><h2 class="title-lg">자비스가 맡을 일</h2></div></div>
  <div class="modules">${cards}</div>`;
  return layout({ title: "홈", user, csrf, flash: p.flash, section: "hub", heroHtml, body });
}

// ── 유튜브: 대시보드 ──
function statusBadges({ user, provider, googleReady }) {
  const mp = (user.settings.mail && user.settings.mail.provider) || "outbox";
  const mailNames = { outbox: "메일 미리보기 (실제 발송 안 함)", resend: "메일 Resend 발송", gmail: "메일 Gmail 발송" };
  return [
    provider === "live" ? `<span class="pill on-dark">채널 연결됨 · ${h(user.youtube && user.youtube.title)}</span>` : '<span class="pill on-dark-soft">데모 모드 · 가상 유튜브</span>',
    provider === "live" && user.settings.testMode ? '<span class="pill red">테스트모드</span>' : "",
    `<span class="pill on-dark-soft">${mailNames[mp]}</span>`,
    provider !== "live" && googleReady ? '<a class="pill on-dark-soft" href="/youtube/settings">실제 유튜브 연결 →</a>' : "",
  ].join("");
}

function dashboardPage(p) {
  const { user, csrf, stats, campaigns, recent, formUrl } = p;
  const lastRun = user.state && user.state.lastRun ? `마지막 확인 ${fmtTime(user.state.lastRun.at)} · ${h(user.state.lastRun.text)}` : "아직 확인 전";
  const runForm = `<form method="post" action="/youtube/run"><input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn on-dark">지금 댓글 확인</button></form>`;
  const heroHtml = hero({
    size: "xl",
    eyebrow: "MODULE 01 · 유튜브 채널 운영",
    title: "YOUTUBE<br>AUTOPILOT",
    sub: "키워드 댓글에 답하고, 신청을 받고, 레퍼럴 링크를 보냅니다.",
    aside: runForm,
    below: `<div class="badges">${statusBadges(p)}</div>
      <dl class="hero-stats">
        <div><dt>오늘 답글</dt><dd>${stats.todayReplies}</dd><span>하루 한도 ${h(user.settings.dailyLimit)}</span></div>
        <div><dt>전체 답글</dt><dd>${stats.replies}</dd><span>자동으로 단 대댓글</span></div>
        <div><dt>신청 접수</dt><dd>${stats.submissions}</dd><span>신청 폼 제출</span></div>
        <div><dt>레퍼럴 메일</dt><dd>${stats.sent}</dd><span>${stats.preview ? `미리보기 ${stats.preview}건 포함` : "발송 완료"}</span></div>
      </dl>
      <p class="hero-meta">${lastRun} · ${h(user.settings.intervalMin)}분마다 자동 확인</p>`,
  });

  const campCards = campaigns.length ? campaigns.map(c => `
    <article class="card">
      <div class="card-top"><a href="/youtube/campaigns/${h(c.id)}" class="title-sm link-plain">${h(c.name)}</a>${c.active ? '<span class="pill ok">작동 중</span>' : '<span class="pill muted">멈춤</span>'}</div>
      <p class="muted">${c.target === "channel" ? "내 채널 전체 영상 · 새 영상 자동 포함" : `영상 ${c.videos.length}개`} · 키워드 ${h(c.keywords.join(", "))} · ${c.exact ? "정확히" : "포함"}</p>
      <dl class="mini-stats"><div><dt>답글</dt><dd>${c.stats.replies}</dd></div><div><dt>접수</dt><dd>${c.stats.subs}</dd></div><div><dt>메일</dt><dd>${c.stats.sent}</dd></div></dl>
      <div class="copy-row"><code class="clip">${h(formUrl(c))}</code><button type="button" class="btn outline sm" data-copy="${h(formUrl(c))}">폼 링크 복사</button></div>
    </article>`).join("") : `<div class="empty"><p class="title-sm">아직 캠페인이 없습니다</p><p class="muted">위에 유튜브 링크와 레퍼럴 링크를 넣으면 바로 시작합니다.</p></div>`;

  const recentRows = recent.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>시간</th><th>종류</th><th>내용</th><th>상태</th></tr></thead><tbody>${recent.map(r => `
    <tr><td class="num">${fmtTime(r.at)}</td><td>${h(r.kind)}</td><td class="wrap">${h(r.text)}</td><td>${pill(r.status)}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty"><p class="muted">아직 기록이 없습니다.</p></div>';

  const body = `
  <section class="quick">
    <div class="quick-copy"><p class="eyebrow dark">QUICK START</p><h2 class="title-lg">유튜브 링크 넣고 바로 시작</h2>
      <p class="muted">답글 문구와 메일 문구는 기본값으로 만들어지고, 만든 뒤 언제든 바꿀 수 있습니다.</p></div>
    <form method="post" action="/youtube/campaigns" class="quick-form">
      <input type="hidden" name="_csrf" value="${h(csrf)}"><input type="hidden" name="quick" value="1">
      <label class="span2">유튜브 영상 링크 <small>여러 개면 쉼표로 · 비우면 내 채널 전체 (새 영상 자동 포함)</small>
        <input name="videos" id="q-videos" placeholder="https://www.youtube.com/watch?v=L1X_BF5mha4"></label>
      <label>제휴사 이름<input name="name" id="q-name" required placeholder="후커블"></label>
      <label>반응할 댓글 키워드<input name="keywords" id="q-keywords" required placeholder="후커블"></label>
      <label class="span2">보낼 레퍼럴 링크 <small>댓글에는 나가지 않고 메일로만 전달</small>
        <input name="referralLink" id="q-link" type="url" required placeholder="https://..."></label>
      <div class="span2"><button class="btn primary">자동화 시작</button></div>
    </form>
  </section>
  <section class="stack">
    <div class="section-head"><div><p class="eyebrow dark">CAMPAIGNS</p><h2 class="title-lg">내 캠페인</h2></div><a class="btn outline sm" href="/youtube/campaigns/new">자세히 만들기</a></div>
    <div class="cards">${campCards}</div>
  </section>
  <section class="stack">
    <div class="section-head"><div><p class="eyebrow dark">ACTIVITY</p><h2 class="title-lg">최근 활동</h2></div></div>
    ${recentRows}
  </section>`;
  return layout({ title: "유튜브 채널 운영", user, csrf, flash: p.flash, section: "youtube", tab: "dash", heroHtml, body });
}

// ── 유튜브: 캠페인 ──
function campaignForm(c, csrf, isNew) {
  const action = isNew ? "/youtube/campaigns" : `/youtube/campaigns/${h(c.id)}`;
  return `<form method="post" action="${action}" class="stack form">
  <input type="hidden" name="_csrf" value="${h(csrf)}">
  <div class="two">
    <label>제휴사 이름<input name="name" id="c-name" required value="${h(c.name)}"></label>
    <label class="check"><input type="checkbox" name="active" id="c-active" ${c.active ? "checked" : ""}> <span>사용 <small>체크하면 자동으로 동작</small></span></label>
  </div>
  <fieldset><legend>어느 영상의 댓글에 반응할까요?</legend>
    <label class="check"><input type="radio" name="target" value="channel" id="c-t-ch" ${c.target === "channel" ? "checked" : ""}> <span>내 채널 전체 영상 <small>새로 올리는 영상도 자동 포함</small></span></label>
    <label class="check"><input type="radio" name="target" value="videos" id="c-t-v" ${c.target !== "channel" ? "checked" : ""}> <span>특정 영상만</span></label>
    <label>영상 링크 <small>여러 개면 쉼표나 줄바꿈으로</small><textarea name="videos" id="c-videos" rows="2" placeholder="https://www.youtube.com/watch?v=...">${h((c.videos || []).map(v => `https://youtu.be/${v}`).join("\n"))}</textarea></label>
  </fieldset>
  <div class="two">
    <label>키워드 <small>쉼표로 여러 개 · 띄어쓰기·대소문자·기호 무시</small><input name="keywords" id="c-keywords" required value="${h((c.keywords || []).join(", "))}"></label>
    <label>일치 방식<select name="exact" id="c-exact"><option value="0" ${!c.exact ? "selected" : ""}>포함 — 댓글 안에 키워드가 있으면</option><option value="1" ${c.exact ? "selected" : ""}>정확히 — 댓글이 키워드 그 자체</option></select></label>
  </div>
  <label>대댓글 문구 <small>줄에 --- 만 적으면 여러 버전으로 나뉘어 무작위로 사용 · {name} 작성자 · {code} 인증코드 · {form} 신청 폼 주소 · {campaign} 제휴사</small>
    <textarea name="replyTemplate" id="c-reply" rows="8">${h(c.replyTemplate)}</textarea></label>
  <label>레퍼럴 링크 <small>메일에만 들어가고 댓글에는 절대 나가지 않습니다</small><input name="referralLink" id="c-link" type="url" required value="${h(c.referralLink)}"></label>
  <label>메일 제목<input name="mailSubject" id="c-subject" value="${h(c.mailSubject)}"></label>
  <label>메일 내용 <small>{name} {email} {campaign} {link} {code} {channel} · {link}를 빼면 맨 아래에 자동으로 붙음</small>
    <textarea name="mailBody" id="c-body" rows="8">${h(c.mailBody)}</textarea></label>
  <label>새 영상 안내 댓글 <small>"내 채널 전체 영상"일 때 새 영상에 내 채널 이름으로 자동 작성 · 비우면 안 남김 · {keyword} {campaign} {title}</small>
    <textarea name="announce" id="c-announce" rows="3">${h(c.announce)}</textarea></label>
  <div class="checks">
    <label class="check"><input type="checkbox" name="onePerPerson" id="c-opp" ${c.onePerPerson ? "checked" : ""}> <span>같은 사람에게는 한 번만 답글</span></label>
    <label class="check"><input type="checkbox" name="onePerEmail" id="c-ope" ${c.onePerEmail ? "checked" : ""}> <span>같은 이메일에는 한 번만 발송</span></label>
  </div>
  <div class="btn-row"><button class="btn primary">${isNew ? "캠페인 만들기" : "저장"}</button>${isNew ? "" : '<a class="btn outline" href="/youtube">대시보드로</a>'}</div>
</form>`;
}

function campaignPage(p) {
  const { user, csrf, camp, isNew, replies = [], subs = [], formUrl, videoTitles = {} } = p;
  if (isNew) {
    const heroHtml = hero({ eyebrow: "유튜브 채널 운영", title: "새 캠페인", sub: "제휴사 하나에 캠페인 하나. 키워드, 답글, 레퍼럴 링크, 메일을 정합니다." });
    return layout({ title: "캠페인 만들기", user, csrf, flash: p.flash, section: "youtube", tab: "new", heroHtml, body: `<div class="panel">${campaignForm(camp, csrf, true)}</div>` });
  }
  const repTable = replies.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>시간</th><th>영상</th><th>작성자</th><th>댓글</th><th>인증코드</th><th>상태</th><th>코드 사용</th></tr></thead><tbody>${replies.map(r => `
    <tr><td class="num">${fmtTime(r.at)}</td><td>${h(videoTitles[r.videoId] || r.videoId)}</td><td>${h(r.author)}</td><td class="wrap">${h(r.comment)}</td><td class="code">${h(r.code || "")}</td><td>${pill(r.status)}${r.note ? `<div class="muted small">${h(r.note)}</div>` : ""}</td><td>${h(r.usedBy || "")}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty"><p class="muted">아직 반응한 댓글이 없습니다.</p></div>';
  const subTable = subs.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>시간</th><th>이메일</th><th>인증코드</th><th>유튜브 이름</th><th>상태</th></tr></thead><tbody>${subs.map(s => `
    <tr><td class="num">${fmtTime(s.at)}</td><td>${h(s.email)}</td><td class="code">${h(s.code)}</td><td>${h(s.author || "")}</td><td>${pill(s.status)}${s.note ? `<div class="muted small">${h(s.note)}</div>` : ""}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty"><p class="muted">아직 접수가 없습니다.</p></div>';

  const actions = `<div class="btn-row">
    <form method="post" action="/youtube/campaigns/${h(camp.id)}/toggle"><input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn on-dark">${camp.active ? "멈추기" : "다시 켜기"}</button></form>
    <form method="post" action="/youtube/campaigns/${h(camp.id)}/delete" onsubmit="return confirm('이 캠페인과 기록을 삭제할까요?')"><input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn on-dark">삭제</button></form></div>`;
  const heroHtml = hero({
    eyebrow: "유튜브 채널 운영 · 캠페인", title: h(camp.name), aside: actions,
    below: `<div class="badges">${camp.active ? '<span class="pill on-dark">작동 중</span>' : '<span class="pill on-dark-soft">멈춤</span>'}<span class="pill on-dark-soft">${camp.target === "channel" ? "내 채널 전체 영상" : `영상 ${camp.videos.length}개`}</span><span class="pill on-dark-soft">키워드 ${h(camp.keywords.join(", "))}</span></div>`,
  });
  const body = `
  <section class="panel stack">
    <div><p class="eyebrow dark">APPLICATION FORM</p><h2 class="title-md">신청 폼 링크</h2></div>
    <p class="muted">대댓글에는 이 주소 뒤에 그 사람의 인증코드가 붙어서 나갑니다. 구독자가 열면 코드가 미리 입력되어 있어 이메일만 적으면 됩니다.</p>
    <div class="copy-row"><code class="clip">${h(formUrl)}</code><button type="button" class="btn outline sm" data-copy="${h(formUrl)}">복사</button><a class="btn outline-red sm" href="${h(formUrl)}" target="_blank" rel="noopener">열어보기</a></div>
  </section>
  <section class="stack"><div class="section-head"><div><p class="eyebrow dark">REPLIES</p><h2 class="title-lg">댓글 처리 기록</h2></div></div>${repTable}</section>
  <section class="stack"><div class="section-head"><div><p class="eyebrow dark">SUBMISSIONS</p><h2 class="title-lg">신청 접수 기록</h2></div></div>${subTable}</section>
  <section class="stack"><div class="section-head"><div><p class="eyebrow dark">SETTINGS</p><h2 class="title-lg">설정 바꾸기</h2></div></div><div class="panel">${campaignForm(camp, csrf, false)}</div></section>`;
  return layout({ title: camp.name, user, csrf, flash: p.flash, section: "youtube", tab: "", heroHtml, body });
}

// ── 유튜브: 가상 유튜브 ──
function demoPage(p) {
  const { user, csrf, videos, comments, provider } = p;
  const top = v => comments.filter(c => c.videoId === v.id && !c.parentId).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const repliesOf = id => comments.filter(c => c.parentId === id);
  const linkify = t => h(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  const cmt = (c, reply) => `<div class="cmt${reply ? " reply" : ""}"><span class="av${c.authorChannelId && c.authorChannelId.startsWith("DEMO_") ? " me" : ""}">${h((c.author || "?").replace("@", "").slice(0, 1).toUpperCase())}</span>
    <div><p class="cmt-name">${h(c.author)} <small>${fmtTime(c.publishedAt)}${c.pinnedNotice ? " · 자비스 안내 댓글" : ""}</small></p><p class="cmt-text">${linkify(c.text)}</p></div></div>`;
  const videoCards = videos.length ? videos.map(v => `
    <article class="panel stack video">
      <div class="section-head"><div><p class="caps muted">영상 ID <code class="as-is">${h(v.id)}</code></p><h3 class="title-sm">${h(v.title)}</h3></div><button type="button" class="btn outline sm" data-copy="https://www.youtube.com/watch?v=${h(v.id)}">영상 링크 복사</button></div>
      <form method="post" action="/youtube/demo/comments" class="comment-form">
        <input type="hidden" name="_csrf" value="${h(csrf)}"><input type="hidden" name="videoId" value="${h(v.id)}">
        <input name="author" id="a-${h(v.id)}" value="@fan_${Math.floor(Math.random() * 900 + 100)}" aria-label="댓글 작성자">
        <input name="text" id="t-${h(v.id)}" placeholder="댓글 내용 (예: 후커블 신청합니다!)" required aria-label="댓글 내용">
        <button class="btn outline sm">구독자로 댓글 달기</button>
      </form>
      <div class="comments">${top(v).map(c => cmt(c) + repliesOf(c.id).map(r => cmt(r, true)).join("")).join("") || '<p class="muted">아직 댓글이 없습니다.</p>'}</div>
    </article>`).join("") : '<div class="empty"><p class="title-sm">가상 영상이 없습니다</p><p class="muted">위에서 하나 올려 보세요.</p></div>';

  const runForm = `<form method="post" action="/youtube/run"><input type="hidden" name="_csrf" value="${h(csrf)}"><input type="hidden" name="back" value="demo"><button class="btn primary">자비스 지금 확인</button></form>`;
  const heroHtml = hero({
    eyebrow: "유튜브 채널 운영 · 시험장", title: "가상 유튜브", aside: runForm,
    sub: "구글 연결 없이 자비스를 처음부터 끝까지 시험합니다. 가상 영상을 올리고 구독자처럼 댓글을 달면, 자비스가 실제와 똑같이 답글을 답니다.",
  });
  const body = `
  ${provider === "live" ? '<div class="notice alert">지금은 실제 유튜브에 연결되어 있어 자비스는 이 가상 유튜브를 보지 않습니다. 채널 설정에서 "데모 모드"로 바꾸면 여기서 시험할 수 있습니다.</div>' : ""}
  <ol class="steps">
    <li><b>가상 영상 올리기</b><span>아래 칸에 제목을 넣습니다</span></li>
    <li><b>캠페인 만들기</b><span>대시보드에서 · 링크를 비우면 채널 전체</span></li>
    <li><b>키워드 댓글 달기</b><span>구독자인 척 댓글을 답니다</span></li>
    <li><b>자비스 지금 확인</b><span>답글이 달린 것을 확인합니다</span></li>
    <li><b>신청하기</b><span>답글 링크를 열고 이메일 제출 → 보낸 메일</span></li>
  </ol>
  <form method="post" action="/youtube/demo/videos" class="panel upload">
    <input type="hidden" name="_csrf" value="${h(csrf)}">
    <label>가상 영상 제목<input name="title" id="demo-title" required value="후커블로 숏폼 훅 만드는 법"></label>
    <button class="btn primary">가상 영상 올리기</button>
  </form>
  ${videoCards}`;
  return layout({ title: "가상 유튜브", user, csrf, flash: p.flash, section: "youtube", tab: "demo", heroHtml, body });
}

// ── 유튜브: 보낸 메일 ──
function emailsPage(p) {
  const { user, csrf, emails } = p;
  const rows = emails.length ? emails.map(e => `
    <details class="mail"><summary><span class="num">${fmtTime(e.at)}</span><span class="mail-to">${h(e.to)}</span><span class="mail-subject">${h(e.subject)}</span>${pill(e.status)}</summary>
      <div class="mail-body"><p class="caps muted">${h(e.kind)} · ${h(e.provider)}${e.error ? ` · ${h(e.error)}` : ""}</p><pre>${h(e.text)}</pre></div></details>`).join("") : '<div class="empty"><p class="muted">아직 보낸 메일이 없습니다.</p></div>';
  const heroHtml = hero({ eyebrow: "유튜브 채널 운영", title: "보낸 메일", sub: "신청한 구독자에게 보낸 레퍼럴 메일과 새 영상 알림입니다. ‘미리보기’는 발송 방식이 미리보기라 실제로 나가지 않은 메일입니다." });
  return layout({ title: "보낸 메일", user, csrf, flash: p.flash, section: "youtube", tab: "emails", heroHtml, body: `<div class="mails">${rows}</div>` });
}

const opt = (v, cur, label) => `<option value="${v}" ${String(cur) === String(v) ? "selected" : ""}>${label}</option>`;

// ── 유튜브: 채널 설정 ──
function youtubeSettingsPage(p) {
  const { user, csrf, googleReady } = p;
  const s = user.settings;
  const yt = user.youtube;
  const connect = !googleReady
    ? `<div class="notice alert">이 서버에는 아직 구글 연결 정보(GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)가 없습니다. 플랫폼 운영자가 넣으면 여기서 "유튜브 채널 연결" 버튼이 생깁니다. 그 전까지는 데모 모드로 시험할 수 있습니다.</div>`
    : yt
      ? `<div class="connect"><div><p class="caps muted">연결된 채널</p><p class="title-sm">${h(yt.title)}</p><p class="muted small">${h(yt.id)}</p></div>
         <form method="post" action="/auth/google/disconnect"><input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn outline sm">연결 끊기</button></form></div>`
      : `<div class="connect"><p class="muted">유튜브 채널을 가진 구글 계정으로 연결하세요. 브랜드 계정 채널이면 연결 화면에서 그 채널을 고르세요.</p><a class="btn primary" href="/auth/google?kind=youtube">유튜브 채널 연결</a></div>`;
  const heroHtml = hero({ eyebrow: "유튜브 채널 운영", title: "채널 설정", sub: "어느 채널에서, 얼마나 자주, 얼마나 많이 답할지 정합니다." });
  const body = `
  <section class="panel stack"><div><p class="eyebrow dark">CHANNEL</p><h2 class="title-md">유튜브 연결</h2></div>${connect}</section>
  <form method="post" action="/youtube/settings" class="panel stack form">
    <input type="hidden" name="_csrf" value="${h(csrf)}">
    <div><p class="eyebrow dark">AUTOPILOT</p><h2 class="title-md">자동 운영</h2></div>
    <label>운영 모드<select name="mode" id="s-mode">${opt("demo", s.mode, "데모 모드 — 가상 유튜브로 시험")}${opt("live", s.mode, "실제 유튜브 — 연결한 채널에서 동작")}</select></label>
    <label class="check"><input type="checkbox" name="testMode" id="s-test" ${s.testMode ? "checked" : ""}> <span>테스트모드 <small>실제 유튜브에서 답글을 달지 않고 기록만 남김</small></span></label>
    <div class="two">
      <label>확인 주기<select name="intervalMin" id="s-interval">${[1, 5, 10, 15, 30].map(n => opt(n, s.intervalMin, `${n}분마다`)).join("")}</select></label>
      <label>하루 최대 답글 수 <small>유튜브 API 무료 한도로 하루 약 190개가 최대</small><input name="dailyLimit" id="s-limit" type="number" min="1" max="190" value="${h(s.dailyLimit)}"></label>
    </div>
    <label>처음 확인할 과거 시간 <small>처음 켤 때 몇 시간 전 댓글까지 답할지</small><input name="firstHours" id="s-first" type="number" min="1" max="720" value="${h(s.firstHours)}"></label>
    <label class="check"><input type="checkbox" name="newVideoAuto" id="s-newvid" ${s.newVideoAuto !== false ? "checked" : ""}> <span>새 영상 자동화 <small>새 영상 감지 → 안내 댓글 · 알림 메일</small></span></label>
    <label>새 영상 알림 받을 이메일 <small>비우면 알림 안 보냄</small><input name="notifyEmail" id="s-notify" type="email" value="${h(s.notifyEmail)}"></label>
    <div class="btn-row"><button class="btn primary">채널 설정 저장</button></div>
  </form>`;
  return layout({ title: "채널 설정", user, csrf, flash: p.flash, section: "youtube", tab: "settings", heroHtml, body });
}

// ── 계정 설정 (모든 모듈 공통) ──
function accountPage(p) {
  const { user, csrf, googleReady } = p;
  const m = user.settings.mail || {};
  const heroHtml = hero({ eyebrow: "JARVIS AI", title: "계정 설정", sub: "모든 자비스 모듈이 같이 쓰는 메일 발송 방식과 비밀번호입니다." });
  const body = `
  <form method="post" action="/settings" class="panel stack form" id="mail">
    <input type="hidden" name="_csrf" value="${h(csrf)}">
    <div><p class="eyebrow dark">MAIL</p><h2 class="title-md">메일 발송</h2></div>
    <label>발송 방식<select name="mailProvider" id="s-mailp">${opt("outbox", m.provider || "outbox", "미리보기만 — 실제로 보내지 않음")}${opt("resend", m.provider, "Resend API로 발송")}${opt("gmail", m.provider, "내 Gmail로 발송 (구글 연결 필요)")}</select></label>
    <div class="two">
      <label>보내는 사람 이름<input name="senderName" id="s-sender" value="${h(m.senderName)}" placeholder="${h((user.youtube && user.youtube.title) || user.username)}"></label>
      <label>답장 받을 이메일<input name="replyTo" id="s-replyto" type="email" value="${h(m.replyTo)}"></label>
    </div>
    <div class="two">
      <label>Resend 보내는 주소 <small>Resend에서 인증한 도메인 주소</small><input name="mailFrom" id="s-from" type="email" value="${h(m.from)}" placeholder="hello@mydomain.com"></label>
      <label>Resend API 키 <small>${m.resendKey ? "저장됨 · 바꿀 때만 입력" : "re_로 시작"}</small><input name="resendKey" id="s-rkey" type="password" autocomplete="off"></label>
    </div>
    ${googleReady ? `<p class="muted">Gmail 발송: ${user.google && user.google.gmail ? `연결됨 (${h(user.google.email || "")})` : '<a href="/auth/google?kind=gmail">Gmail 발송 권한 연결하기</a>'} · 일반 Gmail은 하루 100통, Workspace는 1,500통까지</p>` : ""}
    <div class="btn-row"><button class="btn primary">메일 설정 저장</button></div>
  </form>
  <form method="post" action="/settings/password" class="panel stack form" id="password">
    <input type="hidden" name="_csrf" value="${h(csrf)}">
    <div><p class="eyebrow dark">SECURITY</p><h2 class="title-md">비밀번호 바꾸기</h2></div>
    <div class="two"><label>지금 비밀번호<input name="current" id="p-cur" type="password" autocomplete="current-password" required></label>
    <label>새 비밀번호 <small>8자 이상</small><input name="next" id="p-next" type="password" autocomplete="new-password" required minlength="8"></label></div>
    <div class="btn-row"><button class="btn outline">비밀번호 바꾸기</button></div>
  </form>`;
  return layout({ title: "계정 설정", user, csrf, flash: p.flash, section: "settings", heroHtml, body });
}

// ── 관리자 ──
function adminPage(p) {
  const { user, csrf, users } = p;
  const rows = users.map(u => `<tr><td>${h(u.username)}</td><td>${u.role === "admin" ? '<span class="pill ok">관리자</span>' : "일반"}</td><td>${h(u.mode)}</td><td>${h(u.channel || "")}</td><td class="num">${u.campaigns}</td><td class="num">${u.replies}</td><td class="num">${u.sent}</td><td class="num">${fmtTime(u.createdAt)}</td></tr>`).join("");
  const heroHtml = hero({ eyebrow: "JARVIS AI · ADMIN", title: "관리자", sub: `가입자 ${users.length}명과 사용량입니다.` });
  return layout({ title: "관리자", user, csrf, flash: p.flash, section: "admin", heroHtml,
    body: `<div class="table-wrap"><table class="table"><thead><tr><th>아이디</th><th>권한</th><th>모드</th><th>채널</th><th>캠페인</th><th>답글</th><th>메일</th><th>가입</th></tr></thead><tbody>${rows}</tbody></table></div>` });
}

// ── 구독자용 신청 폼 (공개) ──
function publicFormPage({ camp, channelTitle, code, result, email }) {
  const done = result && result.ok;
  return `${head(`${camp ? camp.name : "신청"} 혜택 신청`)}<body class="public">
<header class="public-hero"><div class="public-in">
  ${camp ? `<p class="eyebrow">${h(channelTitle)}</p><h1 class="display">${h(camp.name)}<br>혜택 신청</h1>` : '<h1 class="display">페이지를<br>찾을 수 없습니다</h1>'}
</div></header>
<main class="public-in public-body">
  ${result ? `<div class="notice ${result.ok ? "ok" : "alert"}" role="status">${h(result.message)}</div>` : ""}
  ${camp && !done ? `<p class="lead">유튜브 답글에서 받은 인증코드와 이메일을 입력하시면, ${h(camp.name)} 전용 링크를 메일로 바로 보내드립니다.</p>
  <form method="post" class="stack">
    <label>이메일 주소<input name="email" id="f-email" type="email" required autocomplete="email" value="${h(email)}" placeholder="you@example.com"></label>
    <label>인증코드 <small>답글 링크로 들어오셨다면 이미 입력되어 있어요</small><input name="code" id="f-code" required value="${h(code)}" class="code-input" maxlength="12" autocapitalize="characters"></label>
    <label class="check consent"><input type="checkbox" name="consent" id="f-consent" required> <span><b>개인정보 수집·이용 동의</b><small>수집 항목: 이메일 주소 · 목적: 신청하신 제휴사 링크 발송 · 보유 기간: 발송 후 1년 (요청 시 즉시 삭제)</small></span></label>
    <button class="btn primary block">링크 받기</button>
  </form>` : ""}
  <p class="powered">${ORB}<span>Powered by JARVIS AI</span></p>
</main></body></html>`;
}

module.exports = { authPage, hubPage, dashboardPage, campaignPage, demoPage, emailsPage, youtubeSettingsPage, accountPage, adminPage, publicFormPage, MODULES, h };
