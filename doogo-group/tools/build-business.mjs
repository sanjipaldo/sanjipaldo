#!/usr/bin/env node
/* =========================================================
   DOOGO GROUP — 사업영역 페이지 생성기
   business.html(사업영역 목록) + business-{slug}.html(7개 사업 상세)를 한 번에 만듭니다.

   사용법 (doogo-group 폴더에서):
     node tools/build-business.mjs
     node tools/sync-partials.mjs business.html business-campus.html business-bio.html business-commerce.html \
       business-media.html business-ad.html business-food.html business-space.html

   - 생성된 HTML 파일이 최종 결과물입니다. 문구를 고칠 때는 이 파일의 BIZ 데이터를 고친 뒤 다시 실행하세요.
     (HTML을 직접 고쳐도 되지만, 그 뒤에 이 스크립트를 다시 실행하면 덮어써집니다.)
   - 헤더/푸터는 partials/ 내용을 그대로 넣습니다(sync-partials.mjs와 같은 결과).
   - 그룹 구성(3차 확정): 지주회사 DOOGO HOLDINGS가 교육(DOOGO CLASS)과 유통(DOOGOFOOD)을 직접 운영하고,
     그룹사 5곳(DOOGO SPACE 공간 & 라이프스타일 · DOOGO MEDIA 미디어 & 콘텐츠 · DOOGO MAKERS 브랜드 커머스 · DOOGO AD 마케팅 · DOOGOBIO NZ 뉴질랜드 건강식품 제조)이
     나머지 사업을 맡습니다. 사업별 운영 회사·리더는 BIZ[].corp (화면의 회사·브랜드 이름은 모두 영문 표기)
     리더 직함은 corp.title — DOOGO MEDIA 김윤정 · DOOGO MAKERS 신동훈은 '총괄이사' (나머지는 기본 직함 '대표이사')
     (title이 없으면 기본 직함 · 화면의 직함은 모두 ttl(corp)로 씁니다)
   - 사업 분야 이름(6차 확정): 교육업 · 제조업 · 브랜드 커머스 · 미디어 & 콘텐츠 · 마케팅 · 유통 · 공간 & 라이프스타일 (BIZ[].area — HTML 문구라 &는 &amp;로 씀)
     그룹사 분야 라벨(corp.field)이 사업 분야 이름과 같으면 운영 회사 칩에서 분야를 다시 쓰지 않습니다(corpChip).
   - 사진: assets/img/photo/{name}.webp — PHOTO 표의 크기·alt와 함께 사용
     BIZ[].hero {f 사진 이름, fx/fy 데스크톱 초점, mx 모바일 가로 초점} — 상세 첫 화면 + business.html 첫 화면 슬라이드
     BIZ[].gallery 현장 2장(사진 또는 3D 렌더, 히어로와 같은 사진이면 zoom/focus로 확대 디테일 컷)
     → 사진을 바꿀 때는 같은 이름으로 덮어쓰고 초점 값만 맞추면 됩니다.
   - 운영 사이트(4차): BIZ[].web — 사업마다 실제 사이트(새 창)와 첫 화면 캡처 assets/img/sites/{shot}(-720).webp.
     상세 페이지 '운영 사이트' 구간(#site) · 첫 화면 핵심 정보 띠 · 마무리 버튼, business.html 카드의 주소 알약에 씁니다.
     캡처를 새로 찍으면 같은 이름으로 덮어쓰고 WEB_DATE의 기준 날짜만 고치세요.
     (공간 상세의 NORA STAY 카드 사진 sites/space-stay.webp = space.webp 캡처 속 숙소 사진 부분을 잘라 낸 것 — 캡처를 바꾸면 같이 다시 자르기)
   - 담당 리더(5차): 리더 프로필 카드(.pcard · 생김새는 base.css '15. 리더 프로필 카드 공통', 배치만 business-detail.css)
     사진은 BIZ[].corp.photo (assets/img/people/{photo}.webp 900×1200 · -600.webp) — 사진이 생기면 corp에 photo만 넣으면
     실루엣·'사진 준비 중'·'이력과 사진은' 문구가 사진·'이력은 확정 후 게시합니다.'로 바뀝니다.
   - 스타일: assets/css/pages/business.css, business-detail.css
     마무리 배너(맨 아래 · 페이지마다 다름): assets/css/cta-variants.css — PICK_BAND(목록) · bizBand(상세, 제목 BIZ[].band)
     동작:   assets/js/pages/business.js,  business-detail.js
   ========================================================= */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampAssets } from './stamp-assets.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// 그룹사·직접 운영 사업의 실제 사이트 (사용자가 준 주소 그대로 · 모두 새 창)
const CLASS_URL = 'https://www.doogoclass.com'; // DOOGO CLASS (교육)
const FOOD_URL = 'https://www.doogofood.com';   // DOOGOFOOD (유통 · 식품 도매 플랫폼)
// DOOGO MAKERS(브랜드 커머스)가 키우는 자사몰 브랜드 두 곳 (14차 — doogofood.com 은 이제 DOOGOFOOD 에만 씀)
const ONEDAY_URL = 'https://www.onedaycore.com/'; // ONEDAYCORE 원데이코어 · 캐나다 건강식품
const MAURINZ_URL = 'https://maurinz.co.kr/';      // MAURINZ 마우리엔젯 · 뉴질랜드 건강식품
const BIO_URL = 'https://www.doogobio.com/';    // DOOGOBIO
const CONNECT_URL = 'https://www.doogoconnect.com/'; // DOOGO CONNECT 두고커넥트 · 해외 건강식품 소량 OEM 플랫폼 (DOOGOBIO 운영)
const AD_URL = 'https://www.doogoad.com/';      // DOOGO AD
const REVIEW_URL = 'https://www.reviewhub.co.kr/'; // REVIEW HUB 리뷰허브 · 프리미엄 체험단 마케팅 플랫폼 (DOOGO AD 운영)
const NORA_URL = 'https://www.norastay.com/';   // NORA STAY (DOOGO SPACE 숙박)
const MEDIA_URL = 'https://www.youtube.com/@%EB%91%90%EA%B3%A0%EB%B3%B4%EB%8A%94%EB%AC%B8%EB%8C%80%ED%91%9C'; // DOOGO MEDIA · YouTube 두고보는 문대표

/* ---------- 아이콘 ---------- */
const ico = (id, cls = 'ico') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
const ARROW = ico('i-arrow', 'ico ico-arrow');
const ARROW_UR = ico('i-arrow-ur', 'ico');
const CHECK = ico('i-check', 'ico');
const NEWWIN = '<span class="sr-only">(새 창)</span>';
// '준비 중' 작은 표시 (DOOGO SPACE F&B 사업부처럼 아직 열지 않은 서비스 — 지어내지 않고 정직하게 표시)
const SOON = '<span class="soon-tag">준비 중</span>';
// 브랜드명·'&'로 묶인 사업 분야 이름이 줄바꿈으로 갈라지지 않게 (화면 문구에만 사용 — 속성값에는 쓰지 말 것)
const nw = (t) => t.replace(/DOOGO (?:HOLDINGS|CLASS|SPACE|MEDIA|MAKERS|CONNECT|AD)|DOOGOFOOD|DOOGOBIO(?: NZ)?|ONEDAYCORE|MAURINZ|REVIEW HUB|NORA STAY|두고커넥트|미디어 &amp; 콘텐츠|공간 &amp; 라이프스타일/g, (m) => `<span class="nowrap">${m}</span>`);
// 마지막 낱말 + 아이콘을 한 덩어리로 (줄이 넘어갈 때 화살표만 다음 줄에 혼자 남지 않게)
const glue = (t, icon) => { const k = t.lastIndexOf(' '); return k < 0 ? `<span class="nowrap">${t}${icon}</span>` : `${t.slice(0, k + 1)}<span class="nowrap">${t.slice(k + 1)}${icon}</span>`; };
const DOWN = ico('i-arrow', 'ico ico-arrow ico-down');
// 문의 페이지: 분야를 미리 고른 상태로 양식(#inquiry)까지 바로 내려가게 (contact.html 자신의 분야 칩과 같은 형식)
const ASK = (type) => `contact.html?type=${type}#inquiry`;
// 받침에 맞는 조사 '으로/로' (ㄹ 받침은 '로')
const euro = (word) => {
  const c = word.charCodeAt(word.length - 1) - 0xAC00;
  if (c < 0 || c > 11171) return '로';
  const jong = c % 28;
  return jong === 0 || jong === 8 ? '로' : '으로';
};
// 외부 서비스 주소 링크 (상세 첫 화면 핵심 정보 띠) — text 를 주면 주소 대신 그 이름(예: 유튜브 채널명)을 보여 줌
const SITE = (url, text) => `<a class="dt-site" href="${url}" target="_blank" rel="noopener">${text ? `<span>${text}</span>` : `<span class="en">${url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span>`}${ARROW_UR}${NEWWIN}</a>`;
// 사이트 링크 여러 개(한 사업이 사이트 두 곳을 가질 때 · 한 줄에 하나씩)
const SITES = (...links) => `<span class="dt-sites">${links.join('')}</span>`;
// 운영 사이트 블록(상세 3번 구간) · 사업영역 목록의 주소 알약에 쓰는 사이트 정보
//  shot: assets/img/sites/{shot}.webp (1200×750) · {shot}-720.webp (720×450) — 각 사이트 실제 첫 화면 캡처, 2026년 10월 14일 기준
//  host: 화면에 크게 보이는 주소(유튜브는 채널명) · bar: 브라우저 주소 알약 · desc: 캡처에 보이는 내용만으로 쓴 한 줄 소개
//  title/eyebrow: 구간 제목(운영 사이트 · 운영 채널 · 연결 사이트) · site: 캡처 속 사이트 이름(alt·스크린리더 문구, 기본 = name)
const WEB_DATE = '2026년 10월 기준';
const web = (o) => ({
  bar: o.host, btn: '사이트 바로가기', site: o.name,
  title: o.yt ? '운영 채널' : '운영 사이트', eyebrow: o.yt ? 'Official Channel' : 'Official Site',
  note: `${o.yt ? '채널' : '사이트'} 첫 화면 · ${WEB_DATE}`, ...o,
});
const LOCK = '<svg class="dt-web-lock" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.6" fill="currentColor"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
// 리더 프로필 사진 (5차 · 배경 없는 상반신 컷아웃 900×1200 + 작은 판 -600, 머리 크기·위치를 맞춰 둠 · 여섯 명 모두 사진 있음)
//  photo: 파일 이름(assets/img/people/{photo}.webp · {photo}-600.webp). 사진이 없는 리더는 공통 카드의 중립 실루엣 + '사진 준비 중'
const PEOPLE = 'assets/img/people';
// 리더 직함: corp.title(총괄이사 등) · 없으면 '대표이사'
const ttl = (c) => c.title || '대표이사';
const peopleSrcset = (name) => `${PEOPLE}/${name}-600.webp 600w, ${PEOPLE}/${name}.webp 900w`;
// 지주회사가 직접 운영하는 사업(교육·유통)의 운영 회사
const HOLD = { en: 'DOOGO HOLDINGS', type: '지주회사', direct: true, role: '교육 · 그룹 경영 · 투자 및 성장 지원', field: '교육 · 그룹 경영 · 투자 및 성장 지원', ceo: '문원오', photo: 'leader-moon-wonoh', anchor: 'ceo' };

/* ---------- 이미지 ---------- */
// 문원오 대표 주요 이력 (23차 · 사용자 확정본, 이 순서 그대로 맨 위에) — leadership.html 의 data-career 와 같게 유지
const CEO_CAREER = [
  '뉴질랜드 AUT 대학교 비즈니스·마케팅 졸업',
  '現 두고그룹 총괄 대표이사',
  '前 (주) 키위몬 대표이사',
];
// 그룹사 대표 · 총괄이사 주요 이력 (21차 · 사용자 확정본, 이 순서 그대로) — leadership.html 의 data-career 와 같게 유지
const LEADER_CAREER = {
  bio: ['現 DOOGOBIO NZ 대표이사', '前 NATURAL HONEY NZ 대표이사', '前 하이웰 대표이사'], // 백영호
  ad: ['現 두고애드 대표', '前 히즈마케팅 대표', '前 제로커머스 대표'], // 김신용
  space: ['現 NORA STAY 대표이사', '現 DOOGO SPACE 대표이사', '現 문득 F&amp;B 대표이사'], // 문성오
  media: ['現 (주) 하이비주얼 대표이사', '現 라온프로덕션 대표', '現 국가무형유산 이수자'], // 김윤정
  makers: ['건국대학교 경제학과 졸업', '現 마우리엔젯 B 총괄이사', '現 신나용 대표이사'], // 신동훈
};
const PHOTO = {
  campus: { w: 1280, h: 950, alt: '밝은 강의실에서 강사가 성인 수강생들 앞에서 강의하는 모습' },
  studio: { w: 1280, h: 949, alt: '링라이트와 카메라 앞에서 온라인 강의를 촬영하는 모습' },
  bio: { w: 1280, h: 952, alt: '건강식품 제조 현장에서 작업자가 캡슐 병을 검수하는 모습' },
  commerce: { w: 1280, h: 950, alt: '라벨을 붙이기 전의 박스·병·파우치 패키지와 컬러칩을 살펴보는 디자이너의 손' },
  'media-creator': { w: 1280, h: 951, alt: '도심 길거리에서 여성 크리에이터가 마이크를 들고 유튜브 방송을 촬영하는 모습' },
  ad: { w: 1280, h: 954, alt: '회의실 대형 화면의 광고 성과 그래프를 보며 마케팅 회의를 하는 모습' },
  food: { w: 1280, h: 951, alt: '선과장에서 작업자들이 컨베이어 위 사과를 선별하는 모습' },
  cowork: { w: 1280, h: 951, alt: '식물이 놓인 밝은 공유오피스에서 사람들이 일하는 모습' },
};
const RENDER = {
  bio: { w: 674, h: 755, alt: 'DOOGOBIO를 표현한 앰버 캡슐 병과 설산 3D 이미지' },
  makers: { w: 674, h: 755, alt: 'DOOGO MAKERS를 표현한 블루 패키지 박스·병·컬러칩 3D 이미지' },
  media: { w: 671, h: 755, alt: 'DOOGO MEDIA를 표현한 방송 카메라와 재생 말풍선 3D 이미지' },
  ad: { w: 671, h: 755, alt: 'DOOGO AD를 표현한 상승 막대그래프와 확성기 3D 이미지' },
  market: { w: 674, h: 755, alt: 'DOOGOFOOD를 표현한 과일·채소 나무상자와 트럭 3D 이미지' },
};
const photo = (name, extra = {}) => ({ kind: 'photo', src: `assets/img/photo/${name}.webp`, ...PHOTO[name], ...extra });
const render = (name, extra = {}) => ({ kind: 'render', src: `assets/img/3d/${name}.webp`, ...RENDER[name], ...extra });

// 운영 회사 표시: 영문 회사명 + 칩(지주회사 직접 운영 / 그룹사 분야 라벨 · 해외 거점)
// area 를 주면(사업 분야 이름 옆에 붙는 칩) 분야 라벨이 그 이름과 같을 때 분야를 다시 쓰지 않음 — 남는 글자가 없으면 칩 자체를 생략
const corpChip = (c, area) => (c.direct ? `${c.type}` : [c.field === area ? '' : c.field, c.place || ''].filter(Boolean).join(' · '));

// 페이지 전용 아이콘 (24×24, 선 1.7)
const SVC_ICONS = {
  's-lecture': '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8M7 8.5h6M7 11.5h4"/>',
  's-mentor': '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.3"/><path d="M15.6 14.2c2.4-.3 4.3 1.3 4.9 4.3"/>',
  's-online': '<rect x="4" y="5" width="16" height="11" rx="1.8"/><path d="M2.5 19h19"/><path d="m10.5 8.4 4 2.4-4 2.4z"/>',
  's-classroom': '<path d="M3 21h18M5 21V10l7-5 7 5v11"/><path d="M10 21v-5h4v5M9 11h6"/>',
  's-flask': '<path d="M9 3h6M10 3v6l-5.2 9A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7.4 15.5h9.2"/>',
  's-boxes': '<rect x="3.5" y="12.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="12.5" width="7" height="7" rx="1.2"/><rect x="8.5" y="3.5" width="7" height="7" rx="1.2"/>',
  's-print': '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7zM17 12h.01"/>',
  's-link': '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  's-bulb': '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z"/>',
  's-store': '<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12v8h13v-8M10 20v-4.5h4V20"/>',
  's-growth': '<path d="M3 20h18"/><path d="m4 15 5-5 4 3 7-7"/><path d="M15 6h5v5"/>',
  's-camera': '<path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.5"/>',
  's-video': '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10 9.3 5 2.7-5 2.7z"/>',
  's-live': '<circle cx="12" cy="12" r="2"/><path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.3 5.3a9.5 9.5 0 0 0 0 13.4M18.7 5.3a9.5 9.5 0 0 1 0 13.4"/>',
  's-target': '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  's-pen': '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5 4 20Z"/><path d="m13.5 7 3 3"/>',
  's-chart': '<path d="M4 4v16h16"/><path d="M8.5 16v-4M12.5 16V8M16.5 16v-6"/>',
  's-truck': '<path d="M3 6h11v10H3zM14 9.5h4l3 3.3V16h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  's-desk': '<rect x="7" y="3.5" width="10" height="7" rx="1.2"/><path d="M12 10.5V13M2.5 13h19M5 13v7M19 13v7"/>',
  's-address': '<path d="M4 21V9l8-5.5L20 9v12"/><path d="M8.5 12.5h7v5h-7z"/><path d="m8.5 12.5 3.5 2.6 3.5-2.6"/>',
  's-bed': '<path d="M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6"/><circle cx="7" cy="11.5" r="2"/>',
  's-person': '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6"/>',
  's-seed': '<path d="M12 21v-8"/><path d="M12 13c0-4 2.6-6.6 7-7-.2 4.3-2.8 7-7 7Z"/><path d="M12 15c0-3.3-2.2-5.5-6-5.8.2 3.6 2.4 5.8 6 5.8Z"/>',
  's-flag': '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  's-cup': '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z"/><path d="M17 10.5h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3.5c-.6.8-.6 1.7 0 2.5M12 3.5c-.6.8-.6 1.7 0 2.5"/><path d="M3 21h15"/>',
  's-chat': '<path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9.5h8M8 12.5h5"/>',
};
const SPRITE = `<svg class="sr-only" aria-hidden="true" focusable="false">\n${Object.entries(SVC_ICONS).map(([id, d]) => `    <symbol id="${id}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</g></symbol>`).join('\n')}\n  </svg>`;

/* ---------- 7개 사업 데이터 (순서 고정: 교육이 첫 번째) ---------- */
const BIZ = [
  {
    slug: 'campus', num: '01', area: '교육업', en: 'DOOGO CLASS', chain: 'Education', icon: 'i-campus',
    corp: HOLD,
    defLabel: '교육 플랫폼', def: '사람을 성장시키고, 새로운 사업과 브랜드를 만듭니다.',
    role: '경험과 노하우를 나누고, 새로운 사업과 브랜드의 시작을 돕습니다.',
    services: ['실전 교육', '강사·과정 소개', '온라인 클래스', '교육장 연계(DOOGO SPACE)'],
    targets: ['창업·부업을 준비하는 분', '브랜드를 키우려는 사업자', '실무 역량을 키우려는 분'],
    ask: '교육 상담하기',
    band: '{en}에서 배움을 시작해 보세요.', // 마무리 배너 제목 ({en} = 영문 브랜드)
    cta: { label: '교육 플랫폼 보기', ext: CLASS_URL },
    web: web({ name: 'DOOGO CLASS', kind: '강의 플랫폼', host: 'doogoclass.com', url: CLASS_URL, shot: 'class-2', close: 'DOOGO CLASS 바로가기',
      desc: '강의 소개 페이지부터 수강생 관리까지, 강사가 자기 이름으로 강의를 운영하는 강의 플랫폼입니다.' }),
    narration: '경험을 나누면, 또 다른 시작이 태어납니다.',
    hero: { f: 'campus', fx: '50%', fy: '42%', mx: '58%' },
    gallery: [photo('studio', { label: '온라인 클래스 촬영', pos: '62% 50%' }), photo('campus', { label: '강의 현장', pos: '50% 50%' })],
    facts: [['대표 서비스', '실전 교육 · 온라인 클래스'], ['사이트', SITE(CLASS_URL)]],
    svcHead: 'DOOGO CLASS가 하는 일',
    svcLead: '실전 교육부터 온라인 클래스, 교육장까지 배움에 필요한 과정을 한곳에서 연결합니다.',
    detail: [
      { icon: 's-lecture', name: '실전 교육', desc: '사업을 직접 운영하며 얻은 경험을 바탕으로, 창업과 브랜드 운영에 바로 쓰는 내용을 다룹니다.' },
      { icon: 's-mentor', name: '강사·과정 소개', desc: '분야별 강사와 과정을 한곳에서 소개해, 배우려는 목적에 맞는 과정을 찾도록 돕습니다.' },
      { icon: 's-online', name: '온라인 클래스', desc: '시간과 장소에 얽매이지 않고 들을 수 있는 온라인 클래스로 실전 과정을 만납니다.' },
      { icon: 's-classroom', name: '교육장 연계', desc: '오프라인 수업과 모임은 DOOGO SPACE의 교육장과 연계해 진행합니다.' },
    ],
    sceneLead: '온라인 클래스 촬영과 강의실 수업, 배움이 이루어지는 두 장면입니다.',
    relNav: '강사·과정',
  },
  {
    slug: 'bio', num: '02', area: '제조업', en: 'DOOGOBIO', chain: 'Product', icon: 'i-bio',
    corp: { en: 'DOOGOBIO NZ', field: '뉴질랜드 건강식품 제조', place: '해외법인', ceo: '백영호', key: 'bio', photo: 'leader-baek-youngho' },
    scope: '제품 개발 · 소량 제조 · 패키지·인쇄',
    defLabel: '건강식품 제조', def: '뉴질랜드 건강식품 소량 제조 및 인쇄까지, 좋은 제품을 만듭니다.',
    role: '뉴질랜드 건강식품의 개발과 소량 제조, 제품화를 지원합니다.',
    services: ['제품 개발', '소량 제조', '패키지·인쇄', '제조 상담·연결 ‘두고커넥트’'],
    targets: ['자체 건강식품 브랜드를 준비하는 사업자', '소량으로 시작하려는 셀러'],
    ask: '제조 상담하기',
    band: '{en}와 <span class="nowrap">첫 제품을</span> 만들어 보세요.',
    cta: { label: '제조 상담하기', href: ASK('bio') },
    web: web({ name: 'DOOGOBIO', kind: '웹사이트', host: 'doogobio.com', url: BIO_URL, shot: 'bio', close: 'DOOGOBIO 사이트',
      desc: '건강식품 B2B 도매와 OEM 제조, 제조 상담·연결 ‘두고커넥트’를 안내하는 DOOGOBIO의 사이트입니다.',
      // 14차: DOOGOBIO가 운영하는 두고커넥트 플랫폼 (사이트 첫 화면 문구 기준)
      moreLabel: 'DOOGOBIO가 함께 운영하는 플랫폼',
      more: [{ name: 'DOOGO CONNECT', kind: '소량 OEM 플랫폼', host: 'doogoconnect.com', url: CONNECT_URL, shot: 'connect', close: 'DOOGO CONNECT 바로가기',
        desc: '건강식품 OEM의 수요와 공급을 온라인으로 연결하는 해외 건강식품 소량 OEM 플랫폼 ‘두고커넥트’입니다. 50개 소량부터 실시간 견적으로 브랜드를 시작할 수 있습니다.' }] }),
    narration: '살펴보고, 시험하고, 다시 들여다보며.',
    hero: { f: 'bio', fx: '50%', fy: '24%', mx: '68%' },
    gallery: [photo('bio', { label: '캡슐 병 검수', zoom: 1.5, focus: '46% 66%', alt: '생산 라인 위 캡슐 병을 장갑 낀 손으로 하나씩 검수하는 모습(확대)' }), render('bio', { label: 'DOOGOBIO' })],
    heroAlt: { label: '두고커넥트 알아보기', href: '#related' },
    facts: [['대표 서비스', '제조 상담·연결 ‘두고커넥트’'], ['사이트', SITES(SITE(BIO_URL), SITE(CONNECT_URL))]],
    svcHead: 'DOOGOBIO가 하는 일',
    svcLead: '제품 개발부터 소량 제조, 패키지·인쇄까지 건강식품이 제품이 되는 과정을 함께합니다.',
    detail: [
      { icon: 's-flask', name: '제품 개발', desc: '만들고 싶은 건강식품의 방향을 함께 정리하고, 원료와 제형을 검토해 제품으로 구체화합니다.' },
      { icon: 's-boxes', name: '소량 제조', desc: '처음부터 큰 물량을 준비하기 어려운 브랜드도 소량으로 시작할 수 있도록 제조를 지원합니다.' },
      { icon: 's-print', name: '패키지·인쇄', desc: '제품에 맞는 용기·라벨·패키지를 정하고, 인쇄까지 이어서 준비합니다.' },
      { icon: 's-link', name: '제조 상담·연결 ‘두고커넥트’', desc: '무엇부터 준비할지 막막할 때, 상담으로 필요한 제조 과정을 정리하고 연결합니다.' },
    ],
    sceneLead: '건강식품이 제품이 되는 제조 현장입니다.',
    relNav: '두고커넥트',
  },
  {
    slug: 'commerce', num: '03', area: '브랜드 커머스', en: 'DOOGO MAKERS', chain: 'Brand', icon: 'i-commerce',
    corp: { en: 'DOOGO MAKERS', field: '브랜드 커머스', ceo: '신동훈', title: '총괄이사', key: 'makers', photo: 'leader-shin-donghoon' },
    scope: '세일즈·영업 · 브랜드 기획 · 상품 운영 · EXIT 전략',
    defLabel: '브랜드 기획 · 운영', def: '브랜드를 만들고 성장시키며, EXIT까지 연결합니다.',
    role: '브랜드를 기획하고 운영하며, 판매와 성장 전략을 함께 만듭니다.',
    services: ['브랜드 기획', '상품 운영', '브랜드 성장과 EXIT 전략'],
    targets: ['새 브랜드를 만들려는 분', '운영 중인 브랜드를 키우려는 사업자'],
    ask: '브랜드 커머스 상담하기',
    band: '{en}가 키우는 브랜드를 만나 보세요.',
    cta: { label: '브랜드 보기', href: 'brands.html#brands' },
    // 14차: DOOGO MAKERS 브랜드팀이 키우는 자사몰 브랜드 두 곳 — ONEDAYCORE(대표) · MAURINZ (사이트 첫 화면 문구 기준)
    web: web({ name: 'ONEDAYCORE', kind: '캐나다 건강식품', title: '브랜드 사이트', eyebrow: 'Brand Sites',
      host: 'onedaycore.com', url: ONEDAY_URL, shot: 'onedaycore', close: 'ONEDAYCORE 바로가기',
      desc: '캐나다 로키산맥의 깨끗한 자연에서 온 원료로 만든 캐나다 건강식품 브랜드 ‘원데이코어’입니다. 대표 제품은 동결건조 고농축 알부민 ‘프리미엄 알부민 골드’입니다.',
      moreLabel: 'DOOGO MAKERS의 또 다른 브랜드',
      more: [{ name: 'MAURINZ', kind: '뉴질랜드 건강식품', host: 'maurinz.co.kr', url: MAURINZ_URL, shot: 'maurinz', close: 'MAURINZ 바로가기',
        desc: '뉴질랜드 마오리 부족이 즐겨 먹던 천연 원료로 영양제를 만드는 뉴질랜드 건강식품 브랜드 ‘마우리엔젯’입니다. 대표 제품은 뉴질랜드산 밀크씨슬입니다.' }] }),
    narration: '생각은 제품이 되고, 제품은 브랜드가 됩니다.',
    hero: { f: 'commerce', fx: '50%', fy: '48%', mx: '56%' },
    gallery: [photo('commerce', { label: '패키지 디자인', zoom: 1.7, focus: '70% 78%', alt: '무지 패키지 박스를 들고 컬러칩과 맞춰 보는 디자이너의 손(확대)' }), render('makers', { label: 'DOOGO MAKERS' })],
    facts: [['대표 서비스', '브랜드 기획 · 운영 · EXIT 전략'], ['브랜드 사이트', SITES(SITE(ONEDAY_URL), SITE(MAURINZ_URL))]],
    svcHead: 'DOOGO MAKERS가 하는 일',
    svcLead: '브랜드의 시작부터 운영과 성장, 그다음 단계까지 함께 고민합니다.',
    detail: [
      { icon: 's-bulb', name: '브랜드 기획', desc: '누구에게 무엇을 팔지부터 이름·콘셉트·상품 구성까지, 브랜드의 기본을 함께 설계합니다.' },
      { icon: 's-store', name: '상품 운영', desc: '상세페이지·가격·재고 등 판매에 필요한 운영을 맡아 브랜드가 꾸준히 팔리도록 관리합니다.' },
      { icon: 's-growth', name: '브랜드 성장과 EXIT 전략', desc: '판매 채널과 콘텐츠를 넓혀 브랜드를 키우고, EXIT까지 내다보는 성장 전략을 세웁니다.' },
    ],
    sceneLead: '브랜드의 첫인상을 만드는 패키지와 디자인 작업 장면입니다.',
    relNav: '성장 단계',
  },
  {
    slug: 'media', num: '04', area: '미디어 &amp; 콘텐츠', en: 'DOOGO MEDIA', chain: 'Owned Media', icon: 'i-media',
    corp: { en: 'DOOGO MEDIA', field: '미디어 &amp; 콘텐츠', ceo: '김윤정', title: '총괄이사', key: 'media', photo: 'leader-kim-yunjung' },
    // 8차: DOOGO MEDIA = 온드미디어(브랜드가 직접 소유·운영하는 채널) 전문 — 분야 이름은 '미디어 & 콘텐츠' 그대로, 설명 문구만 온드미디어로
    scope: '온드미디어 촬영 · 유튜브 채널 운영 · 숏폼·라이브 콘텐츠',
    defLabel: '온드미디어 제작', def: '광고비에 기대지 않고, 브랜드의 자산으로 쌓이는 채널을 만듭니다.',
    role: '브랜드가 직접 소유하는 채널, 온드미디어를 기획하고 촬영하고 운영합니다.',
    services: ['온드미디어 촬영', '브랜드 유튜브 채널 운영', '숏폼·라이브 콘텐츠 제작', '콘텐츠 기획·편집'],
    targets: ['자체 채널로 고객을 모으려는 브랜드', '강사·전문가'],
    ask: '콘텐츠 문의하기',
    band: '{en}와 브랜드 채널을 시작해 보세요.',
    cta: { label: '콘텐츠 문의하기', href: ASK('media') },
    web: web({ name: 'DOOGO MEDIA', kind: 'YouTube 채널', host: '두고보는 문대표', bar: 'youtube.com/@두고보는문대표', yt: true, url: MEDIA_URL, shot: 'media-yt',
      btn: '채널 바로가기', close: 'DOOGO MEDIA 채널', desc: 'DOOGO MEDIA가 운영하는 온드미디어 채널, 유튜브 <span class="nowrap">‘두고보는 문대표’</span>입니다. 채널에서 영상 콘텐츠를 볼 수 있습니다.' }),
    narration: '브랜드의 채널을, 브랜드의 자산으로.',
    hero: { f: 'media-creator', fx: '50%', fy: '38%', mx: '62%' },
    thumb: 'media-creator', // 21차: 여성 크리에이터 길거리 방송 사진 (새 파일 이름 → 캐시에 남은 옛 사진 대신 바로 새 사진)
    gallery: [photo('media-creator', { label: '온드미디어 촬영', zoom: 1.75, focus: '36% 48%', alt: '짐벌 카메라로 길거리 방송 중인 크리에이터를 촬영하는 모습(확대)' }), render('media', { label: 'DOOGO MEDIA' })],
    heroAlt: { label: '온드미디어 알아보기', href: '#related' },
    facts: [['대표 서비스', '온드미디어 촬영 · 유튜브 채널 운영'], ['유튜브 채널', SITE(MEDIA_URL, '두고보는 문대표')]],
    svcHead: 'DOOGO MEDIA가 하는 일',
    svcLead: '브랜드가 직접 소유하는 유튜브·SNS 채널을 기획하고, 촬영과 편집으로 채우고, 꾸준히 운영합니다.',
    detail: [
      { icon: 's-camera', name: '온드미디어 촬영', desc: '브랜드 채널에 올릴 영상과 사진을 촬영해, 채널에 꾸준히 쌓아 갈 콘텐츠 소스를 만듭니다.' },
      { icon: 's-video', name: '브랜드 유튜브 채널 운영', desc: '채널의 방향과 주제를 잡고, 업로드와 관리까지 브랜드 유튜브 채널을 함께 운영합니다.' },
      { icon: 's-live', name: '숏폼·라이브 콘텐츠 제작', desc: 'SNS용 숏폼 영상과 라이브 방송·실시간 강의를 준비해, 고객과 바로 만나는 콘텐츠를 만듭니다.' },
      { icon: 's-pen', name: '콘텐츠 기획·편집', desc: '무엇을 어떤 순서로 보여 줄지 기획하고, 촬영한 소스를 채널에 맞게 편집합니다.' },
    ],
    sceneLead: '도심 야외 촬영처럼 브랜드 채널에 올릴 콘텐츠가 만들어지는 현장입니다.',
    relNav: '온드미디어',
  },
  {
    slug: 'ad', num: '05', area: '마케팅', en: 'DOOGO AD', chain: 'Marketing', icon: 'i-ad',
    corp: { en: 'DOOGO AD', field: '온·오프라인 마케팅', ceo: '김신용', key: 'ad', photo: 'leader-kim-sinyong' },
    scope: '네이버·쿠팡 광고 운영 · 소재 기획 · 성과 분석',
    defLabel: '퍼포먼스 광고', def: '네이버·쿠팡을 중심으로 브랜드를 더 멀리 알립니다.',
    role: '브랜드가 필요한 고객에게 닿도록 광고를 기획하고 운영합니다.',
    services: ['네이버·쿠팡 중심 광고 운영', '체험단 마케팅 ‘리뷰허브’', '광고 소재 기획', '성과 분석'],
    targets: ['온라인으로 판매 중인 브랜드·셀러'],
    ask: '광고 상담하기',
    band: '{en}와 광고를 시작해 보세요.',
    cta: { label: '광고 상담하기', href: ASK('ad') },
    web: web({ name: 'DOOGO AD', kind: '웹사이트', host: 'doogoad.com', url: AD_URL, shot: 'ad', close: 'DOOGO AD 사이트',
      desc: 'DOOGO AD의 마케팅 플랫폼입니다. 서비스 소개와 마케팅 상품, 제휴 상담 안내를 사이트에서 확인할 수 있습니다.',
      // 15차: DOOGO AD가 운영하는 리뷰허브
      moreLabel: 'DOOGO AD가 함께 운영하는 플랫폼',
      more: [{ name: 'REVIEW HUB', kind: '체험단 마케팅 플랫폼', host: 'reviewhub.co.kr', url: REVIEW_URL, shot: 'reviewhub', close: 'REVIEW HUB 바로가기',
        desc: '리뷰허브 · 프리미엄 체험단 마케팅 플랫폼입니다. 브랜드가 체험단을 모집하고 리뷰를 빠르게 확보하도록 돕습니다.' }] }),
    narration: '각자의 가능성이, 필요한 사람에게 닿도록.',
    hero: { f: 'ad', fx: '50%', fy: '45%', mx: '50%' },
    gallery: [photo('ad', { label: '성과 리뷰', zoom: 1.8, focus: '45% 40%', alt: '회의실 대형 화면에 띄운 광고 성과 그래프와 발표하는 사람(확대)' }), render('ad', { label: 'DOOGO AD' })],
    heroAlt: { label: '운영 채널 보기', href: '#related' },
    facts: [['운영 채널', '네이버 · 쿠팡'], ['사이트', SITES(SITE(AD_URL), SITE(REVIEW_URL))]],
    svcHead: 'DOOGO AD가 하는 일',
    svcLead: '판매가 일어나는 채널을 중심으로 광고를 기획하고, 결과를 다음 운영에 반영합니다.',
    detail: [
      { icon: 's-target', name: '네이버·쿠팡 중심 광고 운영', desc: '고객이 상품을 찾고 구매하는 채널을 중심으로 광고를 설정하고 꾸준히 관리합니다.' },
      { icon: 's-pen', name: '광고 소재 기획', desc: '상품의 강점이 한눈에 보이도록 광고 문구와 이미지·영상 소재를 기획합니다.' },
      { icon: 's-chart', name: '성과 분석', desc: '광고 결과를 정리해 무엇이 효과가 있었는지 확인하고, 다음 운영에 반영합니다.' },
    ],
    sceneLead: '광고 성과를 함께 보며 다음 운영을 정하는 회의 장면입니다.',
    relNav: '운영 채널',
  },
  {
    slug: 'food', num: '06', area: '유통', en: 'DOOGOFOOD', chain: 'Sales', icon: 'i-food',
    corp: HOLD, // DOOGO HOLDINGS 직접 운영 · 담당 대표이사 문원오
    defLabel: '식품 유통', def: '대한민국 농수산물과 건강식품을 연결하여 좋은 먹거리를 전합니다.',
    role: '농수산물과 가공식품, 건강식품의 공급사와 판매자를 연결합니다.',
    services: ['식품 전문 도매 플랫폼 운영', '상품 공급', '판매자 협력'],
    targets: ['식품 공급사(생산자·제조사)', '온라인 위탁 판매자'],
    ask: '유통 상담하기',
    band: '{en}에서 좋은 먹거리를 만나 보세요.',
    cta: { label: '도매 플랫폼 보기', ext: FOOD_URL },
    web: web({ name: 'DOOGOFOOD', kind: '도매 플랫폼', host: 'doogofood.com', url: FOOD_URL, shot: 'makers', close: 'DOOGOFOOD 바로가기',
      desc: '생산자와 판매자를 연결하고 필요한 먹거리를 공급하는 식품 전문 B2B 도매 플랫폼입니다.' }),
    narration: '좋은 먹거리도, 정성을 담아 일상으로.',
    hero: { f: 'food', fx: '50%', fy: '52%', mx: '45%' },
    gallery: [photo('food', { label: '사과 선별', zoom: 1.8, focus: '52% 86%', alt: '컨베이어 위 사과를 작업자들이 손으로 고르는 모습(확대)' }), render('market', { label: 'DOOGOFOOD' })],
    facts: [['대표 서비스', '식품 전문 도매 플랫폼'], ['사이트', SITE(FOOD_URL)]],
    svcHead: 'DOOGOFOOD가 하는 일',
    svcLead: '식품 공급사와 판매자가 한곳에서 만나도록, 도매 플랫폼과 상품 공급·판매자 협력을 연결합니다.',
    detail: [
      { icon: 's-store', name: '식품 도매 플랫폼', desc: '위탁셀러와 공급사를 잇는 식품 전문 B2B 도매 플랫폼 DOOGOFOOD를 운영합니다.' },
      { icon: 's-truck', name: '상품 공급', desc: '농수산물·가공식품·건강식품 공급사의 상품을 모아 판매자에게 공급합니다.' },
      { icon: 'i-partner', name: '판매자 협력', desc: '온라인 위탁 판매자가 좋은 식품을 찾아 판매할 수 있도록 상품 정보와 판매를 함께 돕습니다.' },
    ],
    sceneLead: '산지에서 선별된 상품이 판매자에게 가기까지의 현장입니다.',
    relNav: '도매 플랫폼',
  },
  {
    slug: 'space', num: '07', area: '공간 &amp; 라이프스타일', en: 'DOOGO SPACE', chain: 'Space', icon: 'i-space',
    corp: { en: 'DOOGO SPACE', field: '공간 &amp; 라이프스타일', ceo: '문성오', key: 'space', photo: 'leader-moon-sungoh' },
    scope: '공유오피스 · 비상주오피스 · 미팅룸 · 교육장 · NORA STAY',
    defLabel: 'OFFICE · STAY · F&amp;B', def: '공유오피스·비상주오피스·미팅룸·교육장과 NORA STAY 숙박, 그리고 준비 중인 F&amp;B까지, 일하고 머물고 즐기는 모든 순간을 하나의 공간 안에서 연결합니다.',
    role: '일과 휴식, 그리고 한 끼까지. 사람의 하루를 연결하는 공간을 만듭니다.',
    // 주요 서비스(business.html 카드) = 세 갈래 WORK · STAY · F&B — F&B는 DOOGO SPACE 안의 F&B 사업부로 준비 중(별도 회사 아님)
    services: [
      `<b class="svc-pillar en">WORK</b>공유오피스 · 비상주오피스 · 미팅룸 · 교육장`,
      `<b class="svc-pillar en">STAY</b>NORA STAY · 숙박 · 장단기 체류`,
      `<b class="svc-pillar en">F&amp;B${SOON}</b>카페 · 라운지 · 브런치 · 케이터링`,
    ],
    targets: ['작은 팀·1인 사업자', '교육·행사 주최자', '여행·출장·장단기 체류객'],
    ask: '공간 상담하기',
    band: '{en}에서 일하고, 머물러 보세요.',
    cta: { label: '공간 상담하기', href: ASK('space') },
    web: web({ name: 'NORA STAY', kind: 'DOOGO SPACE 숙박', host: 'norastay.com', url: NORA_URL, shot: 'space', close: 'NORA STAY 바로가기',
      desc: 'DOOGO SPACE의 숙박 서비스 NORA STAY의 사이트입니다. 숙소 소개와 예약 안내를 확인할 수 있습니다.' }),
    narration: '일하고, 머물고, 즐기는 하루를 한 공간에.',
    // 첫 화면·현장 사진은 공간 사업 전체(공유오피스·교육장)를 보여 줌 — NORA STAY를 가리키는 곳(관련 구간 카드 · 운영 사이트)은
    // 실제 사이트(norastay.com) 첫 화면 캡처와 그 일부(sites/space-stay.webp)만 씁니다 (5차 · 바다 객실 사진은 NORA STAY 숙소와 달라 뺌)
    hero: { f: 'cowork', fx: '50%', fy: '62%', mx: '64%' },
    thumb: 'space-office', // 이전·다음 사업 카드 썸네일 = 첫 화면 사진(공유오피스) — 기본 thumb-{slug}.webp(바다 객실)는 헤더 메뉴용으로 남김
    gallery: [
      photo('cowork', { label: '공유오피스', zoom: 1.6, focus: '74% 72%', alt: '공유오피스 책상에서 노트북으로 일하는 사람들(확대)' }),
      photo('campus', { label: '교육장', pos: '58% 50%', alt: '밝은 교육장에서 강사가 성인 수강생들 앞에서 강의하는 모습' }),
    ],
    heroAlt: { label: '공간 둘러보기', href: '#related' },
    facts: [['서비스 구성', `WORK · STAY · <span class="nowrap">F&amp;B ${SOON}</span>`], ['숙박', `NORA STAY · ${SITE(NORA_URL)}`]],
    svcHead: 'DOOGO SPACE가 하는 일',
    svcLead: '일하고, 머물고, 즐기는 모든 순간을 하나의 공간 안에서 연결합니다.',
    // 세 갈래(pillar): en 영문 갈래 이름 · items 서비스 칩 · soon 준비 중 표시 (F&B = DOOGO SPACE F&B 사업부, 준비 중)
    detail: [
      { icon: 's-desk', en: 'WORK', name: '일하는 공간', items: ['공유오피스', '비상주오피스', '미팅룸', '교육장'],
        desc: '작은 팀과 1인 사업자의 업무 공간, 사업장 주소가 필요한 비상주오피스, 회의와 강의를 위한 미팅룸·교육장을 마련합니다.' },
      { icon: 's-bed', en: 'STAY', name: '머무는 공간', items: ['NORA STAY', '숙박', '장단기 체류'],
        desc: '여행과 출장, 장단기 체류까지 편하게 머물 수 있도록 숙박 서비스 NORA STAY를 운영합니다.' },
      { icon: 's-cup', en: 'F&amp;B', name: '즐기는 공간', items: ['카페', '라운지', '브런치', '케이터링'], soon: true,
        desc: 'DOOGO SPACE의 F&amp;B 사업부가 공간 안에서 즐기는 한 끼와 휴식을 준비하고 있습니다.' },
    ],
    sceneLead: '함께 일하는 공유오피스와 함께 배우는 교육장, 두 가지 공간입니다.',
    relNav: '공간 안내',
  },
];

/* ---------- 공통 조각 ---------- */
const parts = {
  header: readFileSync(join(root, 'partials/header.html'), 'utf8').trim(),
  footer: readFileSync(join(root, 'partials/footer.html'), 'utf8').trim(),
};

// <html class="js">는 첫 페인트 전에 인라인으로 붙입니다 (site.js는 defer라 늦게 붙으면 첫 화면이 '보임→숨김→등장'으로 깜빡임).
// site.js를 못 불러오면(window.DOOGO 없음) DOMContentLoaded에서 떼어 내 등장 대기 상태로 숨은 내용이 그대로 보이게 합니다.
function head({ title, desc, css }) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <script>(function(d){d.classList.add('js');document.addEventListener('DOMContentLoaded',function(){if(!window.DOOGO)d.classList.remove('js')})})(document.documentElement)</script>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | 두고그룹 DOOGO GROUP</title>
  <meta name="description" content="${desc}">
  <meta name="theme-color" content="#0A1426">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="두고홀딩스 DOOGO HOLDINGS">
  <meta property="og:title" content="${title} | 두고그룹">
  <meta property="og:description" content="${desc}">
  <meta property="og:image" content="assets/img/og/og-default.jpg">
  <link rel="icon" href="favicon.ico" sizes="48x48">
  <link rel="icon" href="assets/img/logo/favicon-d2.svg" type="image/svg+xml">
  <link rel="icon" href="assets/img/logo/favicon-d2-32.png" type="image/png" sizes="32x32">
  <link rel="apple-touch-icon" href="assets/img/logo/apple-touch-icon-d2.png">
  <link rel="manifest" href="site.webmanifest">
  <link rel="stylesheet" href="assets/fonts/pretendard/pretendardvariable-dynamic-subset.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap">
  <link rel="stylesheet" href="assets/css/base.css">
  <link rel="stylesheet" href="assets/css/cta-variants.css">
  <link rel="stylesheet" href="assets/css/pages/${css}.css">
</head>`;
}

function shell({ title, desc, css, js, bodyAttrs, main }) {
  return `${head({ title, desc, css })}
<body ${bodyAttrs}>
<!-- @header:start -->
${parts.header}
<!-- @header:end -->

<main id="main">
${main}
</main>

<!-- @footer:start -->
${parts.footer}
<!-- @footer:end -->
<script src="assets/js/site.js" defer></script>
<script src="assets/js/pages/${js}.js" defer></script>
</body>
</html>
`;
}

/* ---------- 마무리 배너 (페이지 맨 아래 · 푸터 바로 위) ----------
   원래의 공통 CTA 띠(.cta-band)는 두고그룹(about.html)에만 남기고, 페이지마다 다른 배너를 씁니다.
   스타일은 assets/css/cta-variants.css (head()가 모든 사업 페이지에 넣음)
   - business.html: PICK_BAND — '맞는 창구로 연결' 컨시어지 (22차 · .cbx--pick.cbx--qc — 3단계 안내 + 사업 메뉴 + 고른 창구 카드의 큰 버튼 하나)
     모양은 pages/business.css '22차', 동작은 pages/business.js '8)' (cta-variants.css 의 옛 .cbx-tile 타일은 이제 쓰지 않음)
   - business-{slug}.html: bizBand(b) — 그 사업의 문구(BIZ[].band) + 대표 버튼(BIZ[].cta) + 현장 사진 분할 (잉크 네이비 · .cbx--biz) */
// 22차 · 마무리 배너 '맞는 창구로 연결' 컨시어지 — 8번째 창구(그룹 제휴)의 카드 문구 (사업 7개는 BIZ 데이터를 그대로 씀)
const QC_PARTNER = {
  slug: 'partner', num: '+', area: '그룹 제휴', en: 'DOOGO HOLDINGS', icon: 'i-partner', corp: { en: 'DOOGO HOLDINGS' },
  def: '여러 사업이 함께하는 제휴·투자·협업 문의는 지주회사 DOOGO HOLDINGS가 직접 받습니다.',
  services: ['사업 간 제휴·협업', '공동 프로젝트 제안', '투자 및 성장 지원', '그룹 차원의 협력 제안'],
};
// '이런 상담을 받아요' 한 줄: BIZ[].services 는 HTML 조각(공간의 WORK·STAY·F&B 갈래 이름 · 준비 중 표시)이라
// 갈래 이름은 작은 영문 꼬리표로, 준비 중 표시는 어두운 카드용 표시로 바꾸고 나머지 태그는 지움
const qcSvc = (s) => {
  const m = s.match(/^<b class="svc-pillar en">(.*?)<\/b>(.*)$/);
  const tag = m ? `<b class="qc-svc-tag en">${m[1].replace(/<span class="soon-tag">.*?<\/span>/, '')}</b>` : '';
  const soon = s.includes('soon-tag') ? '<span class="qc-soon">준비 중</span>' : '';
  // ' · ' 앞에서는 줄이 바뀌지 않게(가운뎃점이 줄 맨 앞에 오지 않도록)
  return `<span class="qc-svc-t">${tag}${nw((m ? m[2] : s).replace(/<[^>]+>/g, '')).replace(/ · /g, '&nbsp;· ')}${soon}</span>`;
};
// 왼쪽 메뉴 한 줄 = 그 창구의 접수 화면 링크(스크립트가 없을 때 그대로 이동) — business.js '8)'이 탭(role=tab)으로 바꿈
const qcOpt = (b, i) => `              ${b === QC_PARTNER ? `<li class="qc-sep" aria-hidden="true"><span>그룹 차원의 제안이라면</span></li>
              ` : ''}<li style="--i:${i}"><a class="qc-opt${i === 0 ? ' is-on' : ''}${b === QC_PARTNER ? ' qc-opt--partner' : ''}" href="${ASK(b.slug)}" data-key="${b.slug}"><span class="qc-opt-ico" aria-hidden="true">${ico(b.icon, '')}</span><span class="qc-opt-t"><strong>${b.area.replace(/ &amp; /g, '&nbsp;&amp; ')}</strong><span class="en">${b.en}</span></span><span class="qc-opt-n en" aria-hidden="true">${b.num}</span>${ARROW}</a></li>`;
// 오른쪽 카드 한 장 = 고른 창구 (큰 아이콘 · 분야 · 브랜드 · 운영 회사 · 한 줄 정의 · 상담 항목 · 큰 버튼 하나)
//  사진: 그 사업 첫 화면 사진(hero.f · 이 페이지에서 이미 불러온 파일)을 어둡게 깔아 글이 잘 보이게 · 그룹 제휴는 'd' 심볼
const qcPanel = (b, i) => {
  const isP = b === QC_PARTNER;
  const ph = isP ? null : PHOTO[b.hero.f];
  const photo = isP
    ? '<span class="qc-photo qc-photo--mark" aria-hidden="true"></span>'
    : `<span class="qc-photo" aria-hidden="true"><img src="assets/img/photo/${b.hero.f}.webp" alt="" width="${ph.w}" height="${ph.h}" loading="lazy" decoding="async" style="object-position:${b.hero.fx} ${b.hero.fy}"></span>`;
  return `            <div class="qc-panel${i === 0 ? ' is-on' : ''}${isP ? ' qc-panel--partner' : ''}" id="qc-p-${b.slug}" data-key="${b.slug}">
              ${photo}
              <div class="qc-p-in">
                <div class="qc-p-top">
                  <span class="qc-p-badge" aria-hidden="true">${ico(b.icon, '')}</span>
                  <p class="qc-p-meta"><span class="qc-p-kicker en">${isP ? 'Group Partnership' : `Business ${b.num} / 07`}</span><span class="qc-p-corp"><span>${isP ? '창구' : '운영'}</span><b class="en">${b.corp.en}</b></span></p>
                </div>
                <h3 class="qc-p-title"><span class="qc-p-area">${nw(b.area)}</span><span class="qc-p-brand en">${b.en}</span></h3>
                <p class="qc-p-def">${nw(b.def)}</p>
                <div class="qc-p-svc">
                  <p class="qc-p-label">이런 상담을 받아요</p>
                  <ul class="qc-svcs${b.services.some(s => s.includes('svc-pillar')) ? ' is-col' : ''}">
${b.services.map(s => `                    <li>${CHECK}${qcSvc(s)}</li>`).join('\n')}
                  </ul>
                </div>
                <div class="qc-p-act">
                  <a class="btn btn--primary btn--lg qc-cta" href="${ASK(b.slug)}">${glue(isP ? '제휴 문의 시작하기' : `${nw(b.area)} 상담 시작하기`, ARROW)}</a>
                  <p class="qc-p-note"><span class="qc-k en" aria-hidden="true">2</span>누르면 <strong>${nw(b.area)} · ${nw(b.en)}</strong> 분야가 선택된 접수 화면이 열립니다.</p>
                </div>
              </div>
            </div>`;
};
const QC_ALL = [...BIZ, QC_PARTNER];
const PICK_BAND = `  <!-- 마무리 배너 (22차 · 컨시어지): 3단계 안내 + 왼쪽 메뉴에서 창구 하나 고르기 → 오른쪽 카드의 큰 버튼 하나로 접수 화면(분야 선택됨)
       스크립트가 없으면 메뉴 항목이 곧 접수 화면 링크 · 카드는 첫 창구(교육업)만 보임. 동작: business.js '8)' · 모양: business.css '22차' -->
  <section class="cbx cbx--pick cbx--qc" aria-labelledby="pick-title" data-qc>
    <div class="container">
      <div class="qc-head">
        <div class="qc-head-copy">
          <span class="eyebrow" data-reveal="fade">Quick Contact</span>
          <h2 class="h2" id="pick-title" data-reveal style="--d:.06s">어떤 사업이든,<br> 맞는 창구로 연결합니다.</h2>
        </div>
        <ol class="qc-steps" data-reveal style="--d:.14s" aria-label="상담 접수 순서">
          <li class="qc-step is-cur" style="--i:0"><span class="qc-step-n" aria-hidden="true"><b class="en">1</b>${CHECK}</span><span class="qc-step-line" aria-hidden="true"></span><span class="qc-step-t"><strong>사업 고르기</strong><span>상담할 사업을 선택</span></span></li>
          <li class="qc-step" style="--i:1"><span class="qc-step-n" aria-hidden="true"><b class="en">2</b>${CHECK}</span><span class="qc-step-line" aria-hidden="true"></span><span class="qc-step-t"><strong>내용 남기기</strong><span>분야가 선택된 접수 화면에서</span></span></li>
          <li class="qc-step" style="--i:2"><span class="qc-step-n" aria-hidden="true"><b class="en">3</b>${CHECK}</span><span class="qc-step-t"><strong>담당자 회신</strong><span>확인 후 남겨 주신 연락처로</span></span></li>
        </ol>
      </div>
      <div class="qc" data-reveal style="--d:.1s">
        <div class="qc-menu">
          <p class="qc-menu-head" id="qc-menu-t"><span class="qc-k en" aria-hidden="true">1</span>상담할 사업을 고르세요</p>
          <div class="qc-list-wrap">
            <span class="qc-ink" aria-hidden="true"></span>
            <ul class="qc-list">
${QC_ALL.map(qcOpt).join('\n')}
            </ul>
          </div>
        </div>
        <div class="qc-stage">
          <div class="qc-card on-dark">
            <span class="qc-glare" aria-hidden="true"></span>
${QC_ALL.map(qcPanel).join('\n')}
          </div>
        </div>
      </div>
      <p class="cbx-pick-foot qc-foot" data-reveal style="--d:.1s">어느 사업에 맞는지 모르겠다면 분야를 고르지 않고 문의해도 됩니다. <a class="link-arrow" href="contact.html">문의하기 ${ico('i-arrow')}</a></p>
    </div>
  </section>`;

// 사업 상세 마무리 배너: '{브랜드}와 ~해 보세요.' + 그 사업의 대표 버튼(cta: 내부 링크 또는 새 창) + 다른 사업 보기
//  사진은 첫 화면과 같은 사업 사진(이미 불러온 파일)을 확대 컷으로 · 아래에 큰 영문 브랜드 윤곽 글자(장식)
function bizBand(b) {
  const h = b.hero;
  const ph = PHOTO[h.f];
  const title = b.band.replace('{en}', `<span class="en nowrap">${b.en}</span>`);
  const main = b.cta.ext
    ? `<a class="btn btn--primary btn--lg" href="${b.cta.ext}" target="_blank" rel="noopener">${b.cta.label} ${ARROW_UR}${NEWWIN}</a>`
    : `<a class="btn btn--primary btn--lg" href="${b.cta.href}">${b.cta.label} ${ARROW}</a>`;
  return `  <!-- 마무리 배너: ${b.en} 전용 문구 + 대표 버튼 + 현장 사진 -->
  <section class="cbx cbx--biz on-dark" aria-labelledby="biz-close-title">
    <div class="cbx-biz-word en" aria-hidden="true">${b.en}</div>
    <div class="container cbx-biz-grid">
      <div class="cbx-biz-copy">
        <p class="cbx-biz-kicker" data-reveal="fade"><span class="cbx-biz-ico" aria-hidden="true">${ico(b.icon, '')}</span><span class="en">Business ${b.num} / 07</span><i aria-hidden="true"></i><span class="cbx-biz-area">${b.area}</span></p>
        <h2 class="cbx-biz-title" id="biz-close-title" data-reveal style="--d:.08s">${title}</h2>
        <p class="cbx-biz-lead" data-reveal style="--d:.14s">${nw(b.def)}</p>
        <div class="cbx-actions" data-reveal style="--d:.2s">
          ${main}
          <a class="btn btn--ghost btn--lg" href="business.html#businesses">다른 사업 보기</a>
        </div>
      </div>
      <div class="cbx-biz-media" data-reveal="scale" style="--d:.1s" aria-hidden="true">
        <img src="assets/img/photo/${h.f}.webp" alt="" width="${ph.w}" height="${ph.h}" loading="lazy" decoding="async" style="object-position:${h.fx} ${h.fy}">
        <span class="cbx-biz-tag en">${b.en}</span>
        <p class="cbx-biz-quote">${b.narration}</p>
      </div>
    </div>
  </section>`;
}

// 버튼/링크: {href} 내부, {ext} 외부(새 창)
function action(a, cls) {
  if (a.ext) return `<a class="${cls}" href="${a.ext}" target="_blank" rel="noopener">${a.label} ${ARROW_UR}${NEWWIN}</a>`;
  return `<a class="${cls}" href="${a.href}">${a.label}</a>`;
}

const pauseIcons = `<svg class="ico ico-pause" aria-hidden="true"><use href="#i-pause"/></svg><svg class="ico ico-play" aria-hidden="true"><use href="#i-play"/></svg>`;

/* =========================================================
   1) business.html — 사업영역 목록
   ========================================================= */
function buildList() {
  // 7개 사업 바로가기 카드 (7차): 유리 카드 + 그 사업 사진(썸네일 · 마우스를 올리거나 지금 배경에 보이는 사업이면 나타남) ·
  // 원형 아이콘 배지 · 번호 · 분야 이름 · 영문 브랜드 · 한 줄 설명(defLabel) · 아래로 내려가는 화살표.
  // 설명 위 가는 선 = 지금 배경 사진이 넘어가기까지 남은 시간(진행선 · business.css)
  const jump = BIZ.map((b, i) => `          <li><a class="bz-jump-item" href="#${b.slug}" data-key="${b.slug}">
            <span class="bz-jump-bg" aria-hidden="true"><img src="assets/img/biz/thumb-${b.thumb || b.slug}.webp" alt="" width="480" height="270" loading="lazy" decoding="async"></span>
            <span class="bz-jump-top"><span class="bz-jump-ico" aria-hidden="true">${ico(b.icon, '')}</span><span class="bz-jump-num en">${b.num}</span></span>
            <span class="bz-jump-txt"><strong>${nw(b.area)}</strong><span class="en">${b.en}</span></span>
            <span class="bz-jump-foot"><span class="bz-jump-desc">${b.defLabel}</span><span class="bz-jump-go" aria-hidden="true"><span>${ico('i-arrow', '')}${ico('i-arrow', '')}</span></span></span>
          </a></li>`).join('\n');

  // 사업 구조 (23차 · 가치사슬 3D 계단 대체): 지주회사 DOOGO HOLDINGS 기초판 위에 일곱 개 사업 블록이 엇갈려 쌓인 구조물
  //  블록 하나(a.bz-st-block) = 그 사업 상세 페이지 링크. 블록 안: 번호 · 아이콘 · 분야 이름 · 영문 브랜드 · 운영 회사 ↗
  //  윗면 · 옆면 · 앞면 · 지나가는 빛 · 이음새 빛은 .bz-st-geo 안의 <i> 면(aria-hidden) — 모양·배치는 business.css '사업 구조'
  //  is-hold = 지주회사 DOOGO HOLDINGS가 운영하는 사업(교육 · 유통) → 기초판과 같은 흰 재질 · 나머지 다섯 = 그룹사(블루)
  //  data-st-kind = 쌓일 때 위 숫자(지주회사 · 그룹사 · 사업영역)를 올리는 데 씀 (business.js '2) 사업 구조')
  // 분야 이름: '공간 & 라이프스타일'처럼 &로 묶인 이름은 '&' 뒤에서만 줄이 바뀌게 (앞 칸은 붙임)
  const tagArea = (a) => a.replace(/ &amp; /g, '&nbsp;&amp; ');
  const GEO = '<span class="bz-st-geo" aria-hidden="true"><i class="bz-st-top"></i><i class="bz-st-side"></i><i class="bz-st-front"><i class="bz-st-gleam"></i></i><i class="bz-st-seam"></i></span>';
  const blocks = BIZ.map((b, i) => {
    const hold = !!b.corp.direct;
    return `            <li class="bz-st-cell" style="--i:${i}"><a class="bz-st-block${hold ? ' is-hold' : ''}" href="business-${b.slug}.html" data-st-kind="${hold ? 'hold' : 'group'}">${GEO}<span class="bz-st-row"><span class="bz-st-num en">${b.num}</span> <span class="bz-st-ico">${ico(b.icon, '')}</span></span> <strong class="bz-st-area">${tagArea(b.area)}</strong> <span class="bz-st-brand en">${b.en}</span> <span class="bz-st-op"><span class="bz-st-op-k">운영</span> <span class="bz-st-op-n en">${b.corp.en}</span>${ico('i-arrow-ur', 'bz-st-go')}</span><span class="sr-only"> — 상세 보기</span></a></li>`;
  }).join('\n');
  const groupN = new Set(BIZ.filter(b => !b.corp.direct).map(b => b.corp.en)).size; // 그룹사 수 (5)
  const fact = (k, n, key) => `<div class="bz-st-fact"><dt>${k}</dt><dd><span class="bz-st-fig en" data-st-fig="${key}" data-to="${n}">${n}</span></dd></div>`;

  // 7개 사업 탭 (14차): 위 탭 줄(role=tablist · 휴대폰은 가로로 넘기며 고른 탭을 가운데로) + 고른 사업 하나의 소개 화면(role=tabpanel)
  //  탭 = #slug 링크(스크립트가 없어도 그 사업으로 이동) · 소개 화면 id = slug (business.html#bio 처럼 들어와도 그 탭이 열림 · business.js)
  //  첫 탭만 is-on — 나머지는 .js 일 때 숨김(business.css), 스크립트가 고르면 hidden 으로 바꿔 씀
  const tabs = BIZ.map((b, i) => `          <a class="bz-tab${i === 0 ? ' is-on' : ''}" href="#${b.slug}" id="tab-${b.slug}" role="tab" aria-controls="${b.slug}" aria-selected="${i === 0}"${i === 0 ? '' : ' tabindex="-1"'} style="--i:${i}"><span class="bz-tab-ico">${ico(b.icon, '')}</span><span class="bz-tab-n en">${b.num}</span><span class="bz-tab-t">${b.area}</span></a>`).join('\n');
  // 이전 · 다음 사업 화살표 (탭 줄 양끝 · 소개 화면 양옆) — 고른 사업 기준으로 business.js 가 이름을 바꿔 씀
  const LEFT = ico('i-arrow', 'ico ico-l');
  const stepBtn = (d) => `<button class="bz-tabnav bz-tabnav--${d < 0 ? 'prev' : 'next'}" type="button" data-step="${d}" aria-label="${d < 0 ? '이전' : '다음'} 사업">${d < 0 ? LEFT : ico('i-arrow', 'ico')}</button>`;
  const sideBtn = (d, b) => `<button class="bz-side-btn bz-side-btn--${d < 0 ? 'prev' : 'next'}" type="button" data-step="${d}" tabindex="-1"><span class="bz-side-ar">${d < 0 ? LEFT : ico('i-arrow', 'ico')}</span><span class="bz-side-lb"><span class="bz-side-k">${d < 0 ? '이전 사업' : '다음 사업'}</span><span class="bz-side-n" data-side-name><span class="en">${b.num}</span>${b.area}</span></span></button>`;

  // 사업 사이트(새 창) 알약 — 한 사업에 사이트가 둘이면 둘 다 (브랜드 커머스: ONEDAYCORE · MAURINZ / 제조업: DOOGOBIO · DOOGO CONNECT)
  const sitePill = (w) => `<a class="bz-site" href="${w.url}" target="_blank" rel="noopener">${w.yt ? `<span>YouTube · ${w.host}</span>` : `<span class="bz-site-name en">${w.name}</span><span class="bz-site-host en">${w.host}</span>`}${ARROW_UR}<span class="sr-only"> — ${w.name} ${w.yt ? '유튜브 채널' : '사이트'}(새 창)</span></a>`;

  const panels = BIZ.map((b, i) => {
    const ph = PHOTO[b.hero.f];
    const next = BIZ[(i + 1) % BIZ.length];
    const prev = BIZ[(i - 1 + BIZ.length) % BIZ.length];
    const sites = [b.web, ...(b.web.more || [])];
    return `        <article class="bz-panel${i === 0 ? ' is-on' : ''}" id="${b.slug}" role="tabpanel" aria-labelledby="tab-${b.slug}" tabindex="0">
          <a class="bz-media" href="business-${b.slug}.html" tabindex="-1" aria-hidden="true">
            <span class="bz-media-inner" data-parallax>
              <img src="assets/img/photo/${b.hero.f}.webp" alt="" width="${ph.w}" height="${ph.h}" loading="lazy" decoding="async" style="object-position:${b.hero.mx} ${b.hero.fy}">
              <video class="bz-media-video" muted loop playsinline preload="none" disablepictureinpicture tabindex="-1" aria-hidden="true" style="object-position:${b.hero.mx} ${b.hero.fy}"><source src="assets/video/panel-${b.slug}.mp4" type="video/mp4"><source src="assets/video/panel-${b.slug}.webm" type="video/webm"></video>
            </span>
            <span class="bz-media-tag"><span class="en">${b.num}</span>${b.area}</span>
            <span class="bz-media-quote">“${b.narration}”</span>
            <span class="bz-cursor"><span class="bz-cursor-in"><span class="en">VIEW</span>${ico('i-arrow-ur', '')}</span></span>
          </a>
          <div class="bz-body">
            <div class="bz-top">
              <span class="bz-num en" aria-hidden="true">${b.num}</span>
              <span class="bz-stage en">${b.chain}</span>
              <span class="bz-count en" aria-hidden="true">${b.num} / ${String(BIZ.length).padStart(2, '0')}</span>
            </div>
            <h3 class="bz-title" id="bz-t-${b.slug}"><span class="bz-area">${b.area}</span><span class="bz-brand en">${b.en}</span></h3>
            <p class="bz-corp"><span class="bz-corp-k">운영</span><strong class="bz-corp-n en">${b.corp.en}</strong>${corpChip(b.corp, b.area) ? `<span class="bz-corp-type${b.corp.direct ? ' is-hold' : ''}">${corpChip(b.corp, b.area)}</span>` : ''}<span class="bz-corp-ceo">${ttl(b.corp)} <strong>${b.corp.ceo}</strong></span></p>
            <p class="bz-def"><span class="bz-def-label">${b.defLabel}</span>${nw(b.def)}</p>
            <div class="bz-svc-box">
              <p class="bz-label">주요 서비스</p>
              <ul class="bz-svcs${b.services.length > 3 ? ' is-4' : ''}">
${b.services.map(s => `                <li>${CHECK}<span>${nw(s)}</span></li>`).join('\n')}
              </ul>
            </div>
            <div class="bz-sites">
              <p class="bz-label">${b.web.yt ? '운영 채널' : sites.length > 1 ? `${b.web.title} ${sites.length}곳` : b.web.title}</p>
              <div class="bz-site-list">${sites.map(sitePill).join('')}</div>
            </div>
            <div class="bz-actions">
              <a class="btn btn--dark" href="business-${b.slug}.html">자세히 보기 ${ARROW}<span class="sr-only"> — ${b.area} ${b.en}</span></a>
              ${action(b.cta, 'btn btn--line')}
            </div>
            <div class="bz-pager" role="group" aria-label="이전·다음 사업">
              <button class="bz-pg bz-pg--prev" type="button" data-go="${prev.slug}"><span class="bz-pg-ar">${LEFT}</span><span class="bz-pg-txt"><span class="bz-pg-k">이전 사업</span><span class="bz-pg-n"><span class="en">${prev.num}</span>${prev.area}</span></span></button>
              <button class="bz-pg bz-pg--next" type="button" data-go="${next.slug}"><span class="bz-pg-txt"><span class="bz-pg-k">다음 사업</span><span class="bz-pg-n"><span class="en">${next.num}</span>${next.area}</span></span><span class="bz-pg-ar">${ico('i-arrow', 'ico')}</span></button>
            </div>
          </div>
        </article>`;
  }).join('\n');

  // 첫 화면 배경: 7개 사업 사진이 차례로 크로스페이드(+느린 줌). 첫 장만 바로 불러오고,
  // 나머지는 <template> 안에 두어(불러오지 않음) business.js가 넘기기 직전에 하나씩 꺼내 씁니다.
  const slide = (b, i) => {
    const ph = PHOTO[b.hero.f];
    return `<img class="bz-slide${i === 0 ? ' is-on is-first' : ''}" src="assets/img/photo/${b.hero.f}.webp" alt="" width="${ph.w}" height="${ph.h}" decoding="async"${i === 0 ? ' fetchpriority="high"' : ''} data-key="${b.slug}" style="--fx:${b.hero.fx};--fy:${b.hero.fy};--mx:${b.hero.mx}">`;
  };
  const slides = `      <div class="bz-slides">
        ${slide(BIZ[0], 0)}
        <template id="bz-slides-more">
${BIZ.slice(1).map((b, i) => `          ${slide(b, i + 1)}`).join('\n')}
        </template>
      </div>`;

  const main = `  <!-- 1. 첫 화면 -->
  <section class="page-hero page-hero--navy bz-hero" aria-labelledby="bz-title">
    <div class="bz-hero-media" aria-hidden="true">
${slides}
    </div>
    <div class="bz-hero-shade" aria-hidden="true"></div>
    <div class="container bz-hero-inner">
      <nav aria-label="현재 위치"><ol class="breadcrumb"><li><a href="/">홈</a></li><li aria-current="page">사업영역</li></ol></nav>
      <span class="eyebrow" data-reveal="fade">Our Business</span>
      <h1 class="display bz-hero-title" id="bz-title" data-lines><span class="line"><span>배우고, 만들고,</span></span><span class="line"><span class="accent">키우고.</span></span></h1>
      <p class="lead bz-hero-lead" data-reveal style="--d:.25s">제품을 만드는 일부터 사람을 키우는 일까지.<br class="hide-mobile"> 지주회사 <span class="nowrap en">DOOGO HOLDINGS</span>와 다섯 그룹사가<br class="hide-mobile"> 일곱 개 사업으로 성장의 다음 단계를 함께 만듭니다.</p>
      <div class="bz-hero-foot" data-reveal style="--d:.35s">
        <div class="bz-jump-head">
          <p class="bz-jump-label"><span class="bz-org"><span class="bz-org-hold en">DOOGO HOLDINGS</span><span class="bz-org-arrow" aria-hidden="true">${ico('i-arrow', '')}</span><span>7개 사업영역 바로가기</span></span></p>
          <a class="bz-org-link" href="about.html#structure">그룹 구조 보기 ${ico('i-arrow', '')}</a>
          <button class="bz-vtoggle" type="button" aria-pressed="false" aria-label="배경 사진 자동 넘김 정지" hidden>${pauseIcons}</button>
        </div>
        <ul class="bz-jump" aria-label="사업 바로가기">
${jump}
        </ul>
      </div>
    </div>
  </section>

  <!-- 2. 사업 구조: 지주회사 기초판 위 일곱 개 사업 블록 (블록마다 그 사업 상세로) -->
  <section class="bz-chain" aria-labelledby="chain-title">
    <div class="container">
      <div class="bz-st" data-structure>
        <div class="bz-st-bg" aria-hidden="true"><span class="bz-st-grid"></span><span class="bz-st-spot"></span></div>
        <div class="bz-st-head">
          <div class="bz-st-copy">
            <span class="eyebrow">Business Structure</span>
            <h2 class="bz-st-title" id="chain-title" data-lines><span class="line"><span>일곱 개 사업,</span></span><span class="line"><span>하나의 단단한 구조</span></span></h2>
            <p class="bz-st-lead" data-reveal style="--d:.15s">지주회사 <span class="nowrap en">DOOGO HOLDINGS</span>가 경영 · 투자 · <span class="nowrap">성장 지원으로</span> 받치고,<br class="hide-mobile"> 다섯 그룹사와 함께 일곱 개 사업을 체계적으로 운영합니다.</p>
          </div>
          <dl class="bz-st-facts" data-reveal style="--d:.25s">
            ${fact('지주회사', 1, 'hold')}
            ${fact('그룹사', groupN, 'group')}
            ${fact('사업영역', BIZ.length, 'biz')}
          </dl>
        </div>
        <div class="bz-st-stage">
          <p class="bz-st-dim en" aria-hidden="true"><i></i><span>7 Businesses · One Structure</span><i></i></p>
          <ol class="bz-st-blocks" aria-label="DOOGO HOLDINGS 그룹의 일곱 개 사업과 운영 회사">
${blocks}
          </ol>
          <div class="bz-st-base">
            <span class="bz-st-geo" aria-hidden="true"><i class="bz-st-top"></i><i class="bz-st-side"></i><i class="bz-st-front"><i class="bz-st-gleam"></i></i><i class="bz-st-seam"></i></span>
            <span class="bz-st-base-k en" aria-hidden="true">Foundation</span>
            <strong class="bz-st-base-n en">DOOGO HOLDINGS</strong>
            <span class="bz-st-base-t"><span class="bz-st-base-c">지주회사</span><span class="bz-st-base-tags"><span>경영</span><span>투자</span><span>성장 지원</span></span></span>
          </div>
        </div>
        <div class="bz-st-foot">
          <p class="bz-st-legend"><span class="bz-st-leg"><span class="bz-st-key is-hold" aria-hidden="true"></span><span><span class="en">DOOGO HOLDINGS</span> 운영</span></span> <span class="bz-st-leg"><span class="bz-st-key" aria-hidden="true"></span><span>그룹사 운영</span></span></p>
          <p class="bz-st-note">블록을 누르면 사업별 상세 페이지로 이동합니다.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- 3. 7개 사업: 탭 줄 + 고른 사업 하나의 소개 화면 -->
  <section class="section bz-list" id="businesses" aria-labelledby="list-title">
    <div class="container">
      <div class="bz-list-head">
        <div>
          <span class="eyebrow" data-reveal="fade">7 Businesses</span>
          <h2 class="h2" id="list-title" data-lines style="margin-top:20px"><span class="line"><span>필요한 사업을 찾아보세요</span></span></h2>
        </div>
        <p class="bz-list-lead" data-reveal style="--d:.15s">사업을 고르면 운영 회사와 주요 서비스를 바로 볼 수 있습니다. ‘자세히 보기’에서 사업별 상세 페이지로 이어집니다.</p>
      </div>
    </div>
    <div class="bz-tabs-spot" aria-hidden="true"></div>
    <div class="bz-tabbar">
      <div class="container">
        <div class="bz-tabrow">
          ${stepBtn(-1)}
          <div class="bz-tabs" role="tablist" aria-label="7개 사업">
            <span class="bz-tab-ink" aria-hidden="true"></span>
${tabs}
          </div>
          ${stepBtn(1)}
        </div>
      </div>
      <span class="bz-tabbar-prog" aria-hidden="true"><span></span></span>
    </div>
    <div class="container">
      <div class="bz-panels">
${panels}
        <div class="bz-side" aria-hidden="true">
          <div class="bz-side-in">
            ${sideBtn(-1, BIZ[BIZ.length - 1])}
            ${sideBtn(1, BIZ[1])}
          </div>
        </div>
      </div>
    </div>
  </section>
${PICK_BAND}`;

  return shell({
    title: '사업영역',
    desc: '배우고, 만들고, 키우고. 지주회사 DOOGO HOLDINGS와 다섯 그룹사가 운영하는 교육업 · 제조업 · 브랜드 커머스 · 미디어 &amp; 콘텐츠 · 마케팅 · 유통 · 공간 &amp; 라이프스타일, 7개 사업영역을 한 번에 소개합니다.',
    css: 'business', js: 'business',
    bodyAttrs: 'data-page="business" data-header="overlay"',
    main,
  });
}

/* =========================================================
   2) business-{slug}.html — 사업 상세
   ========================================================= */
const REL = {
  campus: () => {
    const people = [
      { name: '문대표', sub: ['문원오', 'DOOGO HOLDINGS 대표이사'], course: '뉴질랜드 건기식 브랜딩', len: '5주 과정', photo: 'leader-moon-wonoh' },
      { name: '로직메이커', course: '실전 클래스', len: '4주 과정', initial: '로' },
      { name: '황금농부', course: '실전 클래스', len: '4주 과정', initial: '황' },
      { name: '초이', course: '실전 클래스', len: '4주 과정', initial: '초' },
    ];
    return `      <div class="dt-rel-head">
        <div>
          <span class="eyebrow" data-reveal="fade">Instructors &amp; Courses</span>
          <h2 class="h2" id="rel-title" data-lines style="margin-top:20px"><span class="line"><span>현장의 경험을 나누는</span></span><span class="line"><span class="accent en">DOOGO CLASS</span></span></h2>
        </div>
        <div class="dt-rel-side" data-reveal style="--d:.15s">
          <p class="lead">현장에서 쌓은 경험을 강의로 나눕니다. <span class="nowrap">DOOGO CLASS</span>(doogoclass.com)에서 실전 클래스와 과정별 강사를 만날 수 있고, 오프라인 수업은 <span class="nowrap">DOOGO SPACE</span> 교육장과 연계해 진행합니다.</p>
          <div class="dt-rel-actions">
            <a class="btn btn--white" href="${CLASS_URL}" target="_blank" rel="noopener">DOOGO CLASS 바로가기 ${ARROW_UR}${NEWWIN}</a>
            <a class="btn btn--ghost" href="business-space.html">교육장 알아보기 ${ARROW}</a>
          </div>
        </div>
      </div>
      <ul class="dt-people">
${people.map((p, i) => `        <li class="dt-person${p.photo ? ' has-photo' : ''}" data-reveal style="--d:${(i * 0.08).toFixed(2)}s">
          <div class="dt-person-photo">
            ${p.photo ? `<img src="${PEOPLE}/${p.photo}-600.webp" srcset="${peopleSrcset(p.photo)}" sizes="(max-width: 640px) 46vw, (max-width: 1180px) 44vw, 300px" alt="${p.name} — ${p.sub.join(' · ')}" width="900" height="1200" loading="lazy" decoding="async">` : `<span class="dt-avatar" aria-hidden="true">${p.initial}</span>`}
            <span class="dt-person-len">${p.len}</span>
          </div>
          <div class="dt-person-body">
            <p class="dt-person-course">${p.course}</p>
            <h3 class="dt-person-name">${p.name}</h3>
            ${p.sub ? `<p class="dt-person-sub is-split"><span>${p.sub[0]}</span><span class="dt-sub-dot" aria-hidden="true"> · </span><span>${nw(p.sub[1])}</span></p>` : '<p class="dt-person-sub"><span class="nowrap">DOOGO CLASS</span> 강사</p>'}
          </div>
        </li>`).join('\n')}
      </ul>
      <p class="dt-rel-note" data-reveal>강사·과정 정보는 <span class="nowrap">DOOGO CLASS</span> 강사 소개 화면을 기준으로 정리했습니다. 세부 일정과 신청은 <span class="nowrap">DOOGO CLASS</span>에서 안내합니다.</p>`;
  },
  bio: () => steps({
    eyebrow: 'Manufacturing Support', h2: ['제조 상담·연결 서비스', '<span class="accent">‘두고커넥트’</span>'],
    // 14차: 두고커넥트 = DOOGOBIO가 운영하는 해외 건강식품 소량 OEM 플랫폼 doogoconnect.com (사이트 첫 화면 문구 기준)
    lead: '무엇부터 준비해야 할지 막막할 때, 두고커넥트가 상담부터 제품 개발, 소량 제조와 패키지까지 필요한 과정을 이어 줍니다. <span class="nowrap">DOOGOBIO</span>가 운영하는 <span class="nowrap">DOOGO CONNECT</span>(doogoconnect.com)는 건강식품 OEM의 수요와 공급을 온라인으로 연결하는 해외 건강식품 소량 OEM 플랫폼으로, 50개 소량부터 실시간 견적으로 시작할 수 있습니다.',
    actions: `<a class="btn btn--white" href="${ASK('bio')}">제조 상담하기 ${ARROW}</a><a class="btn btn--ghost" href="${CONNECT_URL}" target="_blank" rel="noopener">DOOGO CONNECT 바로가기 ${ARROW_UR}${NEWWIN}</a>`,
    label: '제조 흐름',
    items: [
      { icon: 's-chat', ko: '상담', en: 'Consult', desc: '만들고 싶은 제품과 판매 계획을 듣고 방향을 잡습니다.' },
      { icon: 's-flask', ko: '제품 개발', en: 'Develop', desc: '원료·제형·구성을 검토해 제품 사양을 정합니다.' },
      { icon: 's-boxes', ko: '소량 제조', en: 'Produce', desc: '처음 시작하는 브랜드에 맞춰 소량으로 제조합니다.' },
      { icon: 's-print', ko: '패키지·인쇄', en: 'Package', desc: '용기·라벨·패키지를 인쇄해 제품을 완성합니다.' },
    ],
  }),
  commerce: () => steps({
    eyebrow: 'Brand Growth', h2: ['기획에서 EXIT까지,', '브랜드 성장 4단계'],
    lead: '브랜드를 만드는 데서 끝나지 않고, 운영과 성장을 거쳐 다음 단계까지 함께 설계합니다. 성장 단계에서는 그룹의 콘텐츠·마케팅·유통 사업과 연계할 수 있습니다.',
    actions: `<a class="btn btn--white" href="${ASK('commerce')}">브랜드 커머스 상담하기 ${ARROW}</a>`,
    label: '브랜드 성장 단계',
    goalLast: true,
    items: [
      { icon: 's-bulb', ko: '기획', en: 'Plan', desc: '시장과 고객을 살펴 브랜드 콘셉트와 첫 상품을 정합니다.' },
      { icon: 's-store', ko: '운영', en: 'Operate', desc: '판매 채널을 열고 상품과 고객 응대를 안정적으로 운영합니다.' },
      { icon: 's-growth', ko: '성장', en: 'Grow', desc: '콘텐츠·마케팅·유통과 연계해 판매를 넓힙니다.', links: [['business-media.html', '미디어 &amp; 콘텐츠'], ['business-ad.html', '마케팅'], ['business-food.html', '유통']] },
      { icon: 's-flag', ko: 'EXIT', en: 'Exit', desc: '브랜드의 가치를 정리해 다음 단계로 연결합니다.' },
    ],
  }),
  media: () => {
    // 1) 온드미디어 설명(무엇인지 · 왜 자산인지) — 광고 페이지의 채널 카드(.dt-channels)와 같은 생김새
    // 2) 주요 서비스 카드(무엇을 하는지)와 겹치지 않게: 형식별 '결과물'과 '이런 분께'를 큰 번호 목록으로
    const formats = [
      { en: 'Shooting', ko: '온드미디어 촬영', out: '채널에 올릴 영상 · 사진 소스', who: '자체 채널로 고객을 모으려는 브랜드' },
      { en: 'YouTube', ko: '브랜드 유튜브 채널', out: '채널에 쌓이는 영상 콘텐츠', who: '강사·전문가 · 브랜드' },
      { en: 'Short-form · Live', ko: '숏폼·라이브 콘텐츠', out: 'SNS 숏폼 · 실시간 방송 · 강의', who: '강사·전문가 · 브랜드' },
    ];
    return `      <div class="dt-rel-head">
        <div>
          <span class="eyebrow" data-reveal="fade">Owned Media</span>
          <h2 class="h2" id="rel-title" data-lines style="margin-top:20px"><span class="line"><span>브랜드가 직접 소유하는</span></span><span class="line"><span>채널, <span class="accent">온드미디어</span></span></span></h2>
        </div>
        <div class="dt-rel-side" data-reveal style="--d:.15s">
          <p class="lead">온드미디어(Owned Media)는 브랜드가 직접 소유하고 운영하는 유튜브·SNS·블로그·자사몰 같은 콘텐츠 채널입니다. <span class="nowrap">DOOGO MEDIA</span>는 이 채널을 기획하고, 촬영하고, 운영합니다.</p>
        </div>
      </div>
      <ul class="dt-channels" aria-label="온드미디어란">
        <li class="dt-channel" data-reveal><span class="dt-channel-en en">OWNED</span><span class="dt-channel-ko">브랜드가 직접 소유·운영하는 채널</span><p>유튜브·SNS·블로그·자사몰처럼 브랜드가 주인인 채널에서 고객을 직접 만납니다.</p></li>
        <li class="dt-channel" data-reveal style="--d:.08s"><span class="dt-channel-en en">ASSET</span><span class="dt-channel-ko">쌓이는 브랜드 자산</span><p>광고비에 의존하지 않고, 올린 콘텐츠가 채널에 남아 브랜드의 자산으로 쌓입니다.</p></li>
      </ul>
      <ol class="dt-rows" aria-label="콘텐츠 형식">
        <li class="dt-rows-head" aria-hidden="true"><span>형식</span><span>결과물</span><span>이런 분께</span></li>
${formats.map((f, i) => `        <li class="dt-row" data-reveal style="--d:${(i * 0.08).toFixed(2)}s">
          <span class="dt-row-num en">${String(i + 1).padStart(2, '0')}</span>
          <h3 class="dt-row-title"><span class="dt-row-en en">${f.en}</span>${nw(f.ko)}</h3>
          <p class="dt-row-cell"><span class="dt-row-label">결과물</span>${f.out}</p>
          <p class="dt-row-cell"><span class="dt-row-label">이런 분께</span>${f.who}</p>
        </li>`).join('\n')}
      </ol>
      <p class="dt-rel-note" data-reveal>형식별 세부 제공 범위는 상담 후 확정됩니다.</p>`;
  },
  ad: () => steps({
    eyebrow: 'Channels & Process', h2: ['네이버·쿠팡 중심의', '광고 운영'],
    lead: '고객이 상품을 찾고 구매하는 채널에 집중합니다. 목표를 정하는 데서 시작해 소재와 운영, 성과 분석까지 한 흐름으로 이어집니다.',
    label: '광고 운영 4단계',
    pre: `      <ul class="dt-channels" aria-label="운영 채널">
        <li class="dt-channel" data-reveal><span class="dt-channel-en en">NAVER</span><span class="dt-channel-ko">네이버</span><p>검색과 쇼핑에서 상품을 찾는 고객에게 브랜드를 보여 줍니다.</p></li>
        <li class="dt-channel" data-reveal style="--d:.08s"><span class="dt-channel-en en">COUPANG</span><span class="dt-channel-ko">쿠팡</span><p>구매를 고민하는 고객에게 상품이 닿도록 광고를 운영합니다.</p></li>
      </ul>`,
    items: [
      { icon: 's-target', ko: '목표 설정', en: 'Goal', desc: '판매 상황을 살펴 광고로 이루려는 목표를 정합니다.' },
      { icon: 's-pen', ko: '소재 기획', en: 'Creative', desc: '상품의 강점이 보이는 문구와 이미지를 준비합니다.' },
      { icon: 's-growth', ko: '운영', en: 'Operate', desc: '채널별로 광고를 설정하고 꾸준히 관리합니다.' },
      { icon: 's-chart', ko: '성과 분석', en: 'Analyze', desc: '결과를 정리해 다음 운영에 반영합니다.' },
    ],
  }),
  food: () => `      <div class="dt-rel-head">
        <div>
          <span class="eyebrow" data-reveal="fade">Wholesale Platform</span>
          <h2 class="h2" id="rel-title" data-lines style="margin-top:20px"><span class="line"><span>위탁셀러와 공급사를 잇는</span></span><span class="line"><span class="accent">식품 전문 도매 플랫폼</span></span></h2>
        </div>
        <div class="dt-rel-side" data-reveal style="--d:.15s">
          <p class="lead"><span class="nowrap">DOOGOFOOD</span>(doogofood.com)는 농수산물·가공식품·건강식품 공급사와 온라인 위탁 판매자를 연결하는 B2B 식품 도매 플랫폼입니다. 지주회사 <span class="nowrap">DOOGO HOLDINGS</span>가 운영합니다.</p>
          <div class="dt-rel-actions"><a class="btn btn--white" href="${FOOD_URL}" target="_blank" rel="noopener">DOOGOFOOD 바로가기 ${ARROW_UR}${NEWWIN}</a></div>
        </div>
      </div>
      <div class="dt-paths">
        <article class="dt-path" data-reveal="left">
          <span class="dt-path-ico">${ico('s-seed', '')}</span>
          <p class="dt-path-en en">Supplier</p>
          <h3 class="dt-path-title">공급사</h3>
          <p class="dt-path-who">생산자 · 제조사</p>
          <p class="dt-path-desc">농수산물과 가공식품, 건강식품을 판매자에게 소개하고 온라인 판로를 넓힙니다.</p>
          <a class="link-arrow" href="${ASK('food')}">공급 문의하기 ${ARROW}</a>
        </article>
        <div class="dt-path-hub" data-reveal="scale" aria-hidden="true">
          <span class="dt-hub-line"></span>
          <span class="dt-hub-core"><span class="en">DOOGOFOOD</span><span class="dt-hub-sub">B2B 도매</span></span>
          <span class="dt-hub-line"></span>
        </div>
        <article class="dt-path" data-reveal="right">
          <span class="dt-path-ico">${ico('i-partner', '')}</span>
          <p class="dt-path-en en">Seller</p>
          <h3 class="dt-path-title">판매자</h3>
          <p class="dt-path-who">온라인 위탁 판매자</p>
          <p class="dt-path-desc">직접 재고를 두지 않는 위탁 방식으로, 판매할 식품 상품을 찾고 거래를 시작합니다.</p>
          <a class="link-arrow" href="${FOOD_URL}" target="_blank" rel="noopener">플랫폼에서 상품 찾기 ${ARROW_UR}${NEWWIN}</a>
        </article>
      </div>`,
  space: () => {
    // 2) 주요 서비스 카드와 겹치지 않게: 공간별 '이런 분께'와 연결 정보를 큰 번호 목록으로,
    //    NORA STAY는 실제 사이트 첫 화면 속 숙소 사진(일부)을 쓴 카드로 (공간 사진은 NORA STAY 숙소와 달라 쓰지 않음)
    const spaces = [
      { en: 'Shared Office', ko: '공유오피스', use: '필요한 만큼 자리를 쓰며 함께 일하는 업무 공간', who: '작은 팀 · 1인 사업자' },
      { en: 'Virtual Office', ko: '비상주오피스', use: '상주하지 않아도 사업장 주소가 필요할 때', who: '1인 사업자' },
      { en: 'Meeting Room', ko: '미팅룸', use: '회의·상담·인터뷰를 위한 공간', who: '팀 · 외부 미팅이 필요한 사업자' },
      { en: 'Classroom', ko: '교육장', use: '강의·워크숍·모임 공간', who: '교육 · 행사 주최자', link: ['business-campus.html', 'DOOGO CLASS 수업과 연계'] },
    ];
    return `      <div class="dt-rel-head">
        <div>
          <span class="eyebrow" data-reveal="fade">Spaces</span>
          <h2 class="h2" id="rel-title" data-lines style="margin-top:20px"><span class="line"><span>일하고, 머물고, 즐기는</span></span><span class="line"><span>하루를 위한 공간</span></span></h2>
        </div>
        <div class="dt-rel-side" data-reveal style="--d:.15s">
          <p class="lead">일하는 공간(WORK)으로 공유오피스·비상주오피스·미팅룸·교육장을 마련하고, 머무는 공간(STAY)은 <span class="nowrap">NORA STAY</span>로 이어집니다. 카페·라운지 등 F&amp;B는 <span class="nowrap">DOOGO SPACE</span> F&amp;B 사업부에서 준비하고 있습니다.</p>
        </div>
      </div>
      <ol class="dt-rows">
        <li class="dt-rows-head" aria-hidden="true"><span>공간</span><span>이렇게 씁니다</span><span>이런 분께</span></li>
${spaces.map((sp, i) => `        <li class="dt-row" data-reveal style="--d:${(i * 0.08).toFixed(2)}s">
          <span class="dt-row-num en">${String(i + 1).padStart(2, '0')}</span>
          <h3 class="dt-row-title"><span class="dt-row-en en">${sp.en}</span>${sp.ko}</h3>
          <p class="dt-row-cell"><span class="dt-row-label">이렇게 씁니다</span>${sp.use}${sp.link ? ` <a class="dt-row-link" href="${sp.link[0]}">${sp.link[1]} ${ico('i-arrow')}</a>` : ''}</p>
          <p class="dt-row-cell"><span class="dt-row-label">이런 분께</span>${sp.who}</p>
        </li>`).join('\n')}
      </ol>
      <article class="dt-stay" data-reveal>
        <div class="dt-stay-media">
          <img src="assets/img/sites/space-stay.webp" alt="NORA STAY 웹사이트(norastay.com) 첫 화면에 실린 숙소 건물 외관(일부 확대)" width="490" height="584" loading="lazy" decoding="async">
          <span class="dt-stay-badge"><span class="en">norastay.com</span> 첫 화면 일부 · ${WEB_DATE}</span>
        </div>
        <div class="dt-stay-body">
          <span class="dt-row-num en">05</span>
          <p class="dt-stay-en en">Stay</p>
          <h3 class="dt-stay-title"><span class="en nowrap">NORA STAY</span> 숙박</h3>
          <p class="dt-stay-desc">여행과 출장, 장단기 체류까지 편하게 머물 수 있는 <span class="nowrap">DOOGO SPACE</span>의 숙박 서비스입니다. 일하는 공간에서 머무는 공간까지, 하루 전체를 함께 준비합니다.</p>
          <p class="dt-stay-for"><span>이런 분께</span>여행객 · 출장객 · 장단기 체류객</p>
          <a class="btn btn--white" href="${NORA_URL}" target="_blank" rel="noopener">NORA STAY 바로가기 ${ARROW_UR}${NEWWIN}</a>
        </div>
      </article>`;
  },
};

// 운영 사이트 블록: 왼쪽 이름·주소·소개, 오른쪽 브라우저 창 모양 캡처(16:10, 맨 위 사이트 헤더 기준), 아래 바로가기
//  창은 스크롤해 들어오며 뒤로 누운 상태에서 바로 서고(business-detail.js --wp), 주소 막대의 로딩 줄이 지나간 뒤 화면이 선명해짐
function webBlock(b) {
  const w = b.web;
  const what = w.yt ? `유튜브 채널(${w.host})` : `웹사이트(${w.host})`; // 캡처에 보이는 사이트 기준 (MAKERS → DOOGOFOOD 웹사이트)
  return `  <section class="section dt-web" id="site" aria-labelledby="web-title">
    <div class="container">
      <div class="dt-web-card${w.more ? ' has-more' : ''}" data-reveal data-web>
        <div class="dt-web-head">
          <span class="eyebrow">${w.eyebrow}</span>
          <h2 class="dt-web-title" id="web-title">${w.title}</h2>
          <div class="dt-web-id">
            <p class="dt-web-name"><span class="en">${w.name}</span><span class="dt-web-kind">${w.kind}</span></p>
            <p class="dt-web-host${w.yt ? ' is-ko' : ' en'}">${w.host}</p>
            <p class="dt-web-desc">${nw(w.desc)}</p>
          </div>
        </div>
        <figure class="dt-web-shot">
          <div class="dt-web-window">
            <div class="dt-web-bar" aria-hidden="true"><span class="dt-web-dots"><i></i><i></i><i></i></span><span class="dt-web-url">${LOCK}<span>${w.bar}</span></span><span class="dt-web-dots is-ghost"><i></i><i></i><i></i></span></div>
            <div class="dt-web-view"><img src="assets/img/sites/${w.shot}-720.webp" srcset="assets/img/sites/${w.shot}-720.webp 720w, assets/img/sites/${w.shot}.webp 1200w" sizes="(max-width: 860px) calc(100vw - 72px), 46vw" alt="${w.site} ${what} 첫 화면" width="1200" height="750" loading="lazy" decoding="async"></div>
          </div>
          <a class="dt-web-hit" href="${w.url}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true"><span class="dt-web-go">새 창에서 열기 ${ARROW_UR}</span></a>
        </figure>
        <div class="dt-web-foot">
          <a class="btn btn--white btn--lg" href="${w.url}" target="_blank" rel="noopener">${w.btn} ${ARROW_UR}<span class="sr-only"> — ${w.site} ${what}</span>${NEWWIN}</a>
          <p class="dt-web-note">${w.note}</p>
        </div>${w.more ? `
        <div class="dt-web-more">
          <p class="dt-web-more-label">${nw(w.moreLabel)}</p>
          <ul class="dt-web-subs">
${w.more.map(m => `          <li><a class="dt-web-sub" href="${m.url}" target="_blank" rel="noopener">
            <span class="dt-web-sub-shot"><span class="dt-web-sub-bar" aria-hidden="true"><i></i><i></i><i></i></span><img src="assets/img/sites/${m.shot}-720.webp" alt="${m.name} 웹사이트(${m.host}) 첫 화면" width="720" height="450" loading="lazy" decoding="async"></span>
            <span class="dt-web-sub-body">
              <span class="dt-web-name"><span class="en">${m.name}</span><span class="dt-web-kind">${m.kind}</span></span>
              <span class="dt-web-sub-host en">${m.host}</span>
              <span class="dt-web-sub-desc">${nw(m.desc)}</span>
              <span class="dt-web-sub-go">${m.close || '사이트 바로가기'} ${ARROW_UR}${NEWWIN}</span>
            </span>
          </a></li>`).join('\n')}
          </ul>
        </div>` : ''}
      </div>
    </div>
  </section>`;
}

function steps({ eyebrow, h2, lead, actions = '', label, items, pre = '', goalLast = false }) {
  return `      <div class="dt-rel-head">
        <div>
          <span class="eyebrow" data-reveal="fade">${eyebrow}</span>
          <h2 class="h2" id="rel-title" data-lines style="margin-top:20px">${h2.map(l => `<span class="line"><span>${l}</span></span>`).join('')}</h2>
        </div>
        <div class="dt-rel-side" data-reveal style="--d:.15s">
          <p class="lead">${lead}</p>${actions ? `
          <div class="dt-rel-actions">${actions}</div>` : ''}
        </div>
      </div>
${pre}
      <ol class="dt-steps${goalLast ? ' has-goal' : ''}" aria-label="${label}" data-reveal="fade">
${items.map((st, i) => `        <li class="dt-step${goalLast && i === items.length - 1 ? ' is-goal' : ''}" style="--i:${i}">
          <span class="dt-step-no en"><span class="sr-only">단계 </span>${String(i + 1).padStart(2, '0')}</span>
          <h3 class="dt-step-title">${st.ko}${st.en.toLowerCase() === st.ko.toLowerCase() ? '' : ` <span class="en">${st.en}</span>`}</h3>
          <p class="dt-step-desc">${st.desc}</p>${st.links ? `
          <p class="dt-step-links">${st.links.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}</p>` : ''}
        </li>`).join('\n')}
      </ol>`;
}

function buildDetail(b, idx) {
  const prev = BIZ[(idx + BIZ.length - 1) % BIZ.length];
  const next = BIZ[(idx + 1) % BIZ.length];
  const others = BIZ.filter(x => x.slug !== b.slug);
  const svcCount = b.detail.length;

  // 히어로 두 번째 버튼: 서비스 CTA가 문의 버튼과 같은 주소면 페이지 안 관련 구간으로 보냄
  const heroSecond = (b.cta.href === ASK(b.slug) && b.heroAlt)
    ? `<a class="btn btn--line btn--lg" href="${b.heroAlt.href}">${b.heroAlt.label} ${DOWN}</a>`
    : action(b.cta, 'btn btn--line btn--lg');
  const c = b.corp;
  const h = b.hero;
  const hp = PHOTO[h.f];

  // 운영 회사 알약: [운영] 영문 회사명 [지주회사 · 직접 운영 | 분야 라벨] → 그룹 구조로 연결
  //  (분야 라벨이 사업 분야 이름과 같아 칩이 없으면 is-group — 오른쪽 여백을 맞추고 앞에 점 표시)
  const corpPill = `<a class="dt-corp${c.direct ? ' is-hold' : corpChip(c, b.area) ? '' : ' is-group'}" href="about.html#structure"><span class="dt-corp-k">운영</span><span class="dt-corp-n en">${c.en}</span>${corpChip(c, b.area) ? `<span class="dt-corp-type">${corpChip(c, b.area)}</span>` : ''}<span class="sr-only"> — 그룹 구조 보기</span></a>`;

  // 현장: 사진 2장 또는 사진 + 브랜드 3D 렌더
  //  히어로와 같은 사진을 큰 칸에 쓸 때는 zoom/focus로 확대한 '디테일 컷'으로 보여 줘 반복을 피함
  const shotStyle = (g) => {
    const st = [g.pos && `object-position:${g.pos}`, g.zoom && `--z:${g.zoom};--zo:${g.focus || '50% 50%'}`].filter(Boolean).join(';');
    return st ? ` style="${st}"` : '';
  };
  const shots = b.gallery.map((g, i) => `        <figure class="dt-shot dt-shot--${g.kind}" data-reveal style="--d:${(i * 0.14).toFixed(2)}s">
          <div class="dt-shot-media"><img src="${g.src}" alt="${g.alt}" width="${g.w}" height="${g.h}" loading="lazy" decoding="async"${shotStyle(g)}></div>
          <span class="dt-shot-label"><span class="en">${String(i + 1).padStart(2, '0')}</span>${g.label}</span>
        </figure>`).join('\n');

  // 담당 리더: 리더 프로필 카드(.pcard · 생김새는 base.css '15. 리더 프로필 카드 공통') 가로형 한 장
  //  사진 칸 = 흰 칸 + 두고 'd' 심볼 + 상반신 사진(현재 여섯 명 모두) 또는 사진이 없을 때 중립 실루엣 + '사진 준비 중'
  //  본문 = 이름 · 영문 회사명 · 분야 → 이 사업과 관련된 정보(dl) → '자세히 보기'(카드 전체가 링크) + 안내 문구 · 이력은 지어내지 않음
  const leaderVisual = c.photo
    ? `<div class="pcard-ph">
          <img class="pcard-img" src="${PEOPLE}/${c.photo}-600.webp" srcset="${peopleSrcset(c.photo)}" sizes="(max-width: 560px) calc(100vw - 40px), (max-width: 1180px) 40vw, 380px" width="900" height="1200" alt="${c.ceo} ${c.en} ${ttl(c)}" loading="lazy" decoding="async">
        </div>`
    : `<div class="pcard-ph is-empty" aria-hidden="true"><span class="pcard-sil"></span><span class="pcard-soon">사진 준비 중</span></div>`;
  const leaderLead = c.direct
    ? `지주회사 <span class="nowrap">${c.en}</span>의 대표이사로, ${nw(b.area)} 분야의 <span class="nowrap">${b.en}</span>를 운영하며 그룹 총괄 운영을 이끕니다.`
    : `${nw(b.area)} 분야는 그룹사 <span class="nowrap">${c.en}</span>가 맡고, ${c.ceo} ${ttl(c)}가 이끌고 있습니다.`;
  // 회사 줄: 영문 회사명(공통 .pcard-co) + 지주회사 / 해외 거점 칩 — 분야는 그 아래 .pcard-field 한 줄
  const leaderTag = c.direct ? `<span class="dt-corp-type is-hold">${c.type}</span>` : c.place ? `<span class="dt-corp-type is-place">${c.place}</span>` : '';
  const leaderBody = `<h3 class="pcard-name" id="leader-name">${c.ceo} <small>${ttl(c)}</small></h3>
          <p class="dt-leader-co"><span class="pcard-co en">${c.en}</span>${leaderTag}</p>
          <p class="pcard-field"><span class="sr-only">분야 </span>${c.field}</p>
${c.direct ? `          <blockquote class="dt-leader-quote"><p>“제품과 브랜드, 그리고 사람의 성장이 이어지는 사업을 만듭니다.”</p></blockquote>
` : `          <p class="dt-leader-role"><span class="dt-leader-role-k">하는 일</span>${b.role}</p>
`}          <div class="dt-leader-more">
            <dl class="dt-leader-dl">
${c.direct ? `              <div><dt>주요 이력</dt><dd><ul class="dt-career">${CEO_CAREER.map(t => `<li>${t}</li>`).join('')}</ul></dd></div>
              <div><dt>운영 브랜드</dt><dd class="dt-dd-chips"><span class="dt-dd-chip${b.slug === 'campus' ? ' is-cur' : ''}"><span class="en">DOOGO CLASS</span>교육업</span><span class="dt-dd-chip${b.slug === 'food' ? ' is-cur' : ''}"><span class="en">DOOGOFOOD</span>유통</span></dd></div>
              <div><dt>강의</dt><dd><span class="en nowrap">DOOGO CLASS</span> ‘문대표’ · 뉴질랜드 건기식 브랜딩</dd></div>`
    : `${LEADER_CAREER[c.key] ? `              <div><dt>주요 이력</dt><dd><ul class="dt-career">${LEADER_CAREER[c.key].map(t => `<li>${t}</li>`).join('')}</ul></dd></div>
` : ''}              <div><dt>주요 서비스</dt><dd class="dt-dd-chips">${b.scope.split(' · ').map(x => `<span class="dt-dd-chip is-svc">${nw(x)}</span>`).join('')}</dd></div>`}
            </dl>
          </div>
          <div class="pcard-foot dt-leader-foot">
            <a class="pcard-link pcard-stretch" href="leadership.html#${c.anchor || `leader-${c.key}`}">자세히 보기<span class="sr-only"> (${c.en} ${c.ceo} ${ttl(c)} · 두고 사람들)</span> ${ico('i-arrow')}</a>
            ${c.direct || LEADER_CAREER[c.key] ? '' : `<p class="dt-leader-note"><i aria-hidden="true"></i>${c.photo ? '이력은 확정 후 게시합니다.' : '이력과 사진은 확정 후 게시합니다.'}</p>`}
          </div>`;

  const main = `${SPRITE}

  <!-- 1. 첫 화면 -->
  <section class="page-hero dt-hero" aria-labelledby="dt-title">
    <div class="dt-hero-glow" aria-hidden="true"></div>
    <div class="container">
      <nav aria-label="현재 위치"><ol class="breadcrumb"><li><a href="/">홈</a></li><li><a href="business.html">사업영역</a></li><li aria-current="page">${b.area}</li></ol></nav>
      <span class="eyebrow" data-reveal="fade">Business ${b.num} / 07</span>
      <h1 class="display dt-title" id="dt-title" data-lines><span class="line"><span class="en">${b.en}</span></span></h1>
      <div class="dt-hero-grid">
        <div class="dt-hero-copy">
          <p class="dt-sub" data-reveal style="--d:.15s"><span class="dt-sub-ico">${ico(b.icon, '')}</span><span>${b.area}</span><i aria-hidden="true"></i><span>${b.defLabel}</span>${corpPill}</p>
          <p class="dt-role" data-reveal style="--d:.2s">${b.role}</p>
        </div>
        <div class="dt-hero-actions" data-reveal style="--d:.28s">
          <a class="btn btn--primary btn--lg" href="${ASK(b.slug)}">${b.ask} ${ARROW}</a>
          ${heroSecond}
        </div>
      </div>
    </div>
    <div class="container dt-frame-wrap">
      <figure class="dt-frame" data-reveal="scale" style="--fx:${h.fx};--fy:${h.fy};--mx:${h.mx}">
        <div class="dt-frame-media" data-parallax>
          <img class="dt-frame-img" src="assets/img/photo/${h.f}.webp" alt="${hp.alt}" width="${hp.w}" height="${hp.h}" fetchpriority="high" decoding="async">
        </div>
        <div class="dt-frame-ctrl">
          <button class="dt-film-btn" type="button" data-film-open><span class="play-ring">${ico('i-play', '')}</span><span>그룹 영상 보기</span></button>
        </div>
        <figcaption class="dt-quote">
          <span class="dt-quote-label en">${b.en}${b.en.toUpperCase().includes(b.chain.toUpperCase()) ? '' : ` · ${b.chain}`}</span>
          <q>${b.narration}</q>
        </figcaption>
      </figure>
    </div>
    <div class="container">
      <dl class="dt-facts" data-reveal>
        <div><dt>사업영역</dt><dd>${b.area} <span class="en">${b.chain.toUpperCase()}</span></dd></div>
        <div><dt>${b.defLabel}</dt><dd>${nw(b.def)}</dd></div>
${b.facts.map(([k, v]) => `        <div><dt>${k}</dt><dd>${nw(v)}</dd></div>`).join('\n')}
      </dl>
    </div>
  </section>

  <nav class="subnav dt-subnav" aria-label="${b.area} 페이지 안 바로가기">
    <div class="container"><ul><li><a href="#services">주요 서비스</a></li><li><a href="#site">${b.web.title}</a></li><li><a href="#scene">현장</a></li><li><a href="#related">${b.relNav}</a></li><li><a href="#leader">담당 ${ttl(c)}</a></li><li><a href="#inquiry">문의</a></li></ul></div>
  </nav>

  <!-- 2. 주요 서비스 -->
  <section class="section dt-services" id="services" aria-labelledby="svc-title">
    <div class="container">
      <div class="sec-head sec-head--split">
        <div>
          <span class="eyebrow" data-reveal="fade">Services</span>
          <h2 class="h2" id="svc-title" data-lines style="margin-top:20px"><span class="line"><span>${b.svcHead}</span></span></h2>
        </div>
        <p class="lead" data-reveal style="--d:.15s">${b.svcLead}</p>
      </div>
      <ol class="dt-svc-grid" style="--n:${svcCount}">
${b.detail.map((s, i) => s.en
    // 세 갈래 카드(공간: WORK · STAY · F&B) — 영문 갈래 이름 + 한글 이름 + 서비스 칩 + 설명, 준비 중이면 작은 표시
    ? `        <li class="dt-svc is-pillar${s.soon ? ' is-soon' : ''}" data-reveal style="--d:${(i * 0.07).toFixed(2)}s">
          <div class="dt-svc-top"><span class="dt-svc-ico">${ico(s.icon, '')}</span><span class="dt-svc-num en">${String(i + 1).padStart(2, '0')}</span></div>
          <p class="dt-svc-en"><span class="en">${s.en}</span>${s.soon ? SOON : ''}</p>
          <h3 class="dt-svc-name">${nw(s.name)}</h3>
          <ul class="dt-svc-items" aria-label="${s.en} 서비스">${s.items.map(x => `<li>${nw(x)}</li>`).join('')}</ul>
          <p class="dt-svc-desc">${nw(s.desc)}</p>
        </li>`
    : `        <li class="dt-svc" data-reveal style="--d:${(i * 0.07).toFixed(2)}s">
          <div class="dt-svc-top"><span class="dt-svc-ico">${ico(s.icon, '')}</span><span class="dt-svc-num en">${String(i + 1).padStart(2, '0')}</span></div>
          <h3 class="dt-svc-name">${nw(s.name)}</h3>
          <p class="dt-svc-desc">${nw(s.desc)}</p>
        </li>`).join('\n')}
      </ol>
      <div class="dt-for" data-reveal>
        <div class="dt-for-head">
          <span class="dt-for-ico">${ico('s-person', '')}</span>
          <p class="dt-for-label">이런 분께<span class="en">Who it's for</span></p>
        </div>
        <ul class="dt-for-list">
${b.targets.map(t => `          <li>${CHECK}${t}</li>`).join('\n')}
        </ul>
        <a class="btn btn--dark btn--sm dt-for-cta" href="${ASK(b.slug)}">${b.ask} ${ARROW}</a>
      </div>
    </div>
  </section>

  <!-- 3. 운영 사이트: 실제 사이트 첫 화면 캡처(브라우저 창 모양) + 새 창 바로가기 -->
${webBlock(b)}

  <!-- 4. 현장 -->
  <section class="section section--ivory dt-scene" id="scene" aria-labelledby="scene-title">
    <div class="container">
      <div class="sec-head sec-head--split">
        <div>
          <span class="eyebrow" data-reveal="fade">On Site</span>
          <h2 class="h2" id="scene-title" data-lines style="margin-top:20px"><span class="line"><span>현장에서 보는 ${nw(b.area)}</span></span></h2>
        </div>
        <p class="lead" data-reveal style="--d:.15s">${b.sceneLead}</p>
      </div>
      <div class="dt-gallery dt-gallery--${b.gallery[1].kind}">
${shots}
      </div>
    </div>
  </section>

  <!-- 5. 관련 브랜드·프로젝트 -->
  <section class="section section--navy dt-rel dt-rel--${b.slug}" id="related" aria-labelledby="rel-title">
    <div class="container">
${REL[b.slug]()}
    </div>
  </section>

  <!-- 6. 담당 리더 -->
  <section class="section dt-leader" id="leader" aria-labelledby="leader-title">
    <div class="container dt-leader-grid">
      <div class="dt-leader-head">
        <span class="eyebrow" data-reveal="fade">Leader</span>
        <h2 class="h2" id="leader-title" data-lines style="margin-top:20px"><span class="line"><span>이 사업을</span></span><span class="line"><span>이끄는 사람</span></span></h2>
        <p class="lead" data-reveal style="--d:.15s">${leaderLead}</p>
        <a class="link-arrow" href="leadership.html#leaders" data-reveal style="--d:.2s">사업을 이끄는 사람들 전체 보기 ${ico('i-arrow')}</a>
      </div>
      <article class="dt-leader-card pcard pcard--panel pcard--row" data-reveal style="--d:.1s" aria-labelledby="leader-name">
        ${leaderVisual}
        <div class="pcard-body">
          ${leaderBody}
        </div>
      </article>
    </div>
  </section>

  <!-- 7. 마무리: 문의 · 이전/다음 · 다른 사업 -->
  <section class="section section--ivory dt-close" id="inquiry" aria-labelledby="ask-title">
    <div class="container">
      <div class="dt-ask" data-reveal>
        <div class="dt-ask-copy">
          <span class="eyebrow">Inquiry · ${b.area}</span>
          <h2 class="dt-ask-title" id="ask-title"><span class="en nowrap">${b.en}</span>와 함께할<br> 일을 알려 주세요.</h2>
          <p class="dt-ask-desc">문의 분야가 ‘${nw(b.area)}’${euro(b.area)} 선택된 상태로 접수 화면이 열립니다. 담당자가 확인한 뒤 남겨 주신 연락처로 회신합니다.</p>
        </div>
        <div class="dt-ask-actions">
          <a class="btn btn--white btn--lg" href="${ASK(b.slug)}">${b.ask} ${ARROW}</a>
          ${action({ label: b.web.close, ext: b.web.url }, 'btn btn--ghost btn--lg')}
        </div>
      </div>

      <nav class="dt-pager" aria-label="이전·다음 사업">
        <a class="dt-pager-card is-prev" href="business-${prev.slug}.html" data-reveal="left">
          <span class="dt-pager-media"><img src="assets/img/biz/thumb-${prev.thumb || prev.slug}.webp" alt="" width="480" height="270" loading="lazy"></span>
          <span class="dt-pager-body">
            <span class="dt-pager-dir">${ico('i-arrow')}이전 사업</span>
            <span class="dt-pager-name"><span class="en">${prev.num}</span>${prev.area}</span>
            <span class="dt-pager-brand en">${prev.en}</span>
          </span>
        </a>
        <a class="dt-pager-card is-next" href="business-${next.slug}.html" data-reveal="right">
          <span class="dt-pager-media"><img src="assets/img/biz/thumb-${next.thumb || next.slug}.webp" alt="" width="480" height="270" loading="lazy"></span>
          <span class="dt-pager-body">
            <span class="dt-pager-dir">다음 사업${ico('i-arrow')}</span>
            <span class="dt-pager-name"><span class="en">${next.num}</span>${next.area}</span>
            <span class="dt-pager-brand en">${next.en}</span>
          </span>
        </a>
      </nav>

      <div class="dt-others" data-reveal>
        <p class="dt-others-label">다른 사업 보기</p>
        <ul class="dt-others-list">
${others.map(o => `          <li><a href="business-${o.slug}.html">${ico(o.icon, '')}<span class="en">${o.num}</span>${o.area}<span class="sr-only"> ${o.en}</span></a></li>`).join('\n')}
        </ul>
        <a class="link-arrow dt-others-all" href="business.html">사업영역 전체 보기 ${ico('i-arrow')}</a>
      </div>
    </div>
  </section>

${bizBand(b)}`;

  return shell({
    title: `${b.area} · ${b.en}`,
    // 회사 이름은 한 번만: 직접 운영 사업은 '운영 회사 직접 운영', 그룹사 사업은 회사 이름이 곧 브랜드라 생략
    desc: `${b.en} — 두고그룹 ${b.area} 분야 (${c.direct ? `${c.en} · ` : ''}${ttl(c)} ${c.ceo}). ${b.role} ${b.def}`,
    css: 'business-detail', js: 'business-detail',
    bodyAttrs: `data-page="business-${b.slug}"`,
    main,
  });
}

/* ---------- 쓰기 ---------- */
const out = [['business.html', buildList()], ...BIZ.map((b, i) => [`business-${b.slug}.html`, buildDetail(b, i)])];
// SEO 공유 이미지: 실제 배포 주소 기준 절대 경로 + 페이지 주소(og:url)
const SITE_URL = 'https://www.doogogroup.com/';
const OG_IMG = `${SITE_URL}assets/img/og/og-doogo-holdings-4.jpg`;
const ogBlock = (file) => `<meta property="og:url" content="${SITE_URL}${file}">\n  <link rel="canonical" href="${SITE_URL}${file}">
  <meta property="og:locale" content="ko_KR">
  <meta property="og:image" content="${OG_IMG}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="사람과 브랜드, 세상을 연결하는 DOOGO HOLDINGS — 두고홀딩스 글로벌 비즈니스 그룹">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${OG_IMG}">`;
for (const [file, html] of out) {
  writeFileSync(join(root, file), html.replace('<meta property="og:image" content="assets/img/og/og-default.jpg">', ogBlock(file)));
  console.log(`✓ ${file}`);
}
console.log(`완료: ${out.length}개 페이지 생성`);
stampAssets(out.map(([f]) => f));
