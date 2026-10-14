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
     그룹사 5곳(DOOGO SPACE 공간 · DOOGO MEDIA 콘텐츠 · DOOGO MAKERS 브랜드 · DOOGO AD 마케팅 · DOOGOBIO 건기식 제조)이
     나머지 사업을 맡습니다. 사업별 운영 회사·대표는 BIZ[].corp (화면의 회사·브랜드 이름은 모두 영문 표기)
   - 사진: assets/img/photo/{name}.webp (AI로 만든 예시 · 실제 사진으로 교체 예정) — PHOTO 표의 크기·alt와 함께 사용
     BIZ[].hero {f 사진 이름, fx/fy 데스크톱 초점, mx 모바일 가로 초점} — 상세 첫 화면 + business.html 첫 화면 슬라이드
     BIZ[].gallery 현장 2장(사진 또는 3D 렌더, 히어로와 같은 사진이면 zoom/focus로 확대 디테일 컷)
     → 실제 사진으로 바꿀 때는 같은 이름으로 덮어쓰고 초점 값만 맞추면 됩니다.
   - 운영 사이트(4차): BIZ[].web — 사업마다 실제 사이트(새 창)와 첫 화면 캡처 assets/img/sites/{shot}(-720).webp.
     상세 페이지 '운영 사이트' 구간(#site) · 첫 화면 핵심 정보 띠 · 마무리 버튼, business.html 카드의 주소 알약에 씁니다.
     캡처를 새로 찍으면 같은 이름으로 덮어쓰고 WEB_DATE의 기준 날짜만 고치세요.
     (공간 상세의 NORA STAY 카드 사진 sites/space-stay.webp = space.webp 캡처 속 숙소 사진 부분을 잘라 낸 것 — 캡처를 바꾸면 같이 다시 자르기)
   - 담당 대표(5차): 리더 프로필 카드(.pcard · 생김새는 base.css '15. 리더 프로필 카드 공통', 배치만 business-detail.css)
     사진은 BIZ[].corp.photo (assets/img/people/{photo}.webp 900×1200 · -600.webp) — 사진이 생기면 corp에 photo만 넣으면
     실루엣·'사진 준비 중'·'이력과 사진은' 문구가 사진·'이력은 확정 후 게시합니다.'로 바뀝니다.
   - 스타일: assets/css/pages/business.css, business-detail.css
     동작:   assets/js/pages/business.js,  business-detail.js
   ========================================================= */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// 그룹사·직접 운영 사업의 실제 사이트 (사용자가 준 주소 그대로 · 모두 새 창)
const CLASS_URL = 'https://www.doogoclass.com'; // DOOGO CLASS (교육)
const FOOD_URL = 'https://www.doogofood.com';   // DOOGOFOOD (유통 · 식품 도매 플랫폼)
const MAKERS_URL = 'https://www.doogofood.com/'; // DOOGO MAKERS — 같은 DOOGOFOOD 사이트(운영 주체를 단정하지 않고 '연결 사이트'로 표기)
const BIO_URL = 'https://www.doogobio.com/';    // DOOGOBIO
const AD_URL = 'https://www.doogoad.com/';      // DOOGO AD
const NORA_URL = 'https://www.norastay.com/';   // NORA STAY (DOOGO SPACE 숙박)
const MEDIA_URL = 'https://www.youtube.com/@%EB%91%90%EA%B3%A0%EB%B3%B4%EB%8A%94%EB%AC%B8%EB%8C%80%ED%91%9C'; // DOOGO MEDIA · YouTube 두고보는 문대표

/* ---------- 아이콘 ---------- */
const ico = (id, cls = 'ico') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
const ARROW = ico('i-arrow', 'ico ico-arrow');
const ARROW_UR = ico('i-arrow-ur', 'ico');
const CHECK = ico('i-check', 'ico');
const NEWWIN = '<span class="sr-only">(새 창)</span>';
// 브랜드명이 줄바꿈으로 갈라지지 않게 (화면 문구에만 사용 — 속성값에는 쓰지 말 것)
const nw = (t) => t.replace(/DOOGO (?:HOLDINGS|CLASS|SPACE|MEDIA|MAKERS|AD)|DOOGOFOOD|DOOGOBIO|NORA STAY|두고커넥트/g, (m) => `<span class="nowrap">${m}</span>`);
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
// 대표 프로필 사진 (5차 · 배경 없는 상반신 컷아웃 900×1200 + 작은 판 -600, 세 사람의 머리 크기·위치를 맞춰 둠)
//  photo: 파일 이름(assets/img/people/{photo}.webp · {photo}-600.webp). 사진이 없는 대표는 공통 카드의 중립 실루엣 + '사진 준비 중'
const PEOPLE = 'assets/img/people';
const peopleSrcset = (name) => `${PEOPLE}/${name}-600.webp 600w, ${PEOPLE}/${name}.webp 900w`;
// 지주회사가 직접 운영하는 사업(교육·유통)의 운영 회사
const HOLD = { en: 'DOOGO HOLDINGS', type: '지주회사', direct: true, role: '교육 및 총괄 운영', field: '교육 · 총괄 운영', ceo: '문원오', photo: 'leader-moon-wonoh', anchor: 'ceo' };
const AI_NOTE = 'AI로 만든 예시 이미지 · 실제 사진으로 교체 예정';

/* ---------- 이미지 (AI 생성 예시) ---------- */
const PHOTO = {
  campus: { w: 1280, h: 950, alt: '밝은 강의실에서 강사가 성인 수강생들 앞에서 강의하는 모습' },
  studio: { w: 1280, h: 949, alt: '링라이트와 카메라 앞에서 온라인 강의를 촬영하는 모습' },
  bio: { w: 1280, h: 952, alt: '건강식품 제조 현장에서 작업자가 캡슐 병을 검수하는 모습' },
  commerce: { w: 1280, h: 950, alt: '라벨을 붙이기 전의 박스·병·파우치 패키지와 컬러칩을 살펴보는 디자이너의 손' },
  media: { w: 1280, h: 951, alt: '도심 야외에서 짐벌 카메라와 붐마이크로 영상 콘텐츠를 촬영하는 모습' },
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
const corpChip = (c) => (c.direct ? `${c.type} · 직접 운영` : c.field + (c.place ? ` · ${c.place}` : ''));

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
  's-chat': '<path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9.5h8M8 12.5h5"/>',
};
const SPRITE = `<svg class="sr-only" aria-hidden="true" focusable="false">\n${Object.entries(SVC_ICONS).map(([id, d]) => `    <symbol id="${id}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</g></symbol>`).join('\n')}\n  </svg>`;

/* ---------- 7개 사업 데이터 (순서 고정: 교육이 첫 번째) ---------- */
const BIZ = [
  {
    slug: 'campus', num: '01', area: '교육', en: 'DOOGO CLASS', chain: 'Education', icon: 'i-campus',
    corp: HOLD,
    defLabel: '교육 플랫폼', def: '사람을 성장시키고, 새로운 사업과 브랜드를 만듭니다.',
    role: '경험과 노하우를 나누고, 새로운 사업과 브랜드의 시작을 돕습니다.',
    services: ['실전 교육', '강사·과정 소개', '온라인 클래스', '교육장 연계(DOOGO SPACE)'],
    targets: ['창업·부업을 준비하는 분', '브랜드를 키우려는 사업자', '실무 역량을 키우려는 분'],
    ask: '교육 상담하기',
    cta: { label: '교육 플랫폼 보기', ext: CLASS_URL },
    web: web({ name: 'DOOGO CLASS', kind: '강의 플랫폼', host: 'doogoclass.com', url: CLASS_URL, shot: 'class', close: 'DOOGO CLASS 바로가기',
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
    sceneLead: '온라인 클래스 촬영과 강의실 수업, 배움이 이루어지는 두 장면입니다. 실제 현장 사진으로 교체할 예정입니다.',
    relNav: '강사·과정',
  },
  {
    slug: 'bio', num: '02', area: '제조', en: 'DOOGOBIO', chain: 'Product', icon: 'i-bio',
    corp: { en: 'DOOGOBIO', field: '건기식 제조', place: '뉴질랜드', ceo: '백영호', key: 'bio' },
    scope: '제품 개발 · 소량 제조 · 패키지·인쇄',
    defLabel: '건강식품 제조', def: '뉴질랜드 건강식품 소량 제조 및 인쇄까지, 좋은 제품을 만듭니다.',
    role: '뉴질랜드 건강식품의 개발과 소량 제조, 제품화를 지원합니다.',
    services: ['제품 개발', '소량 제조', '패키지·인쇄', '제조 상담·연결 ‘두고커넥트’'],
    targets: ['자체 건강식품 브랜드를 준비하는 사업자', '소량으로 시작하려는 셀러'],
    ask: '제조 상담하기',
    cta: { label: '제조 상담하기', href: ASK('bio') },
    web: web({ name: 'DOOGOBIO', kind: '웹사이트', host: 'doogobio.com', url: BIO_URL, shot: 'bio', close: 'DOOGOBIO 사이트',
      desc: '건강식품 B2B 도매와 OEM 제조, 제조 상담·연결 ‘두고커넥트’를 안내하는 DOOGOBIO의 사이트입니다.' }),
    narration: '살펴보고, 시험하고, 다시 들여다보며.',
    hero: { f: 'bio', fx: '50%', fy: '24%', mx: '68%' },
    gallery: [photo('bio', { label: '캡슐 병 검수', zoom: 1.5, focus: '46% 66%', alt: '생산 라인 위 캡슐 병을 장갑 낀 손으로 하나씩 검수하는 모습(확대)' }), render('bio', { label: 'DOOGOBIO' })],
    heroAlt: { label: '두고커넥트 알아보기', href: '#related' },
    facts: [['대표 서비스', '제조 상담·연결 ‘두고커넥트’'], ['사이트', SITE(BIO_URL)]],
    svcHead: 'DOOGOBIO가 하는 일',
    svcLead: '제품 개발부터 소량 제조, 패키지·인쇄까지 건강식품이 제품이 되는 과정을 함께합니다.',
    detail: [
      { icon: 's-flask', name: '제품 개발', desc: '만들고 싶은 건강식품의 방향을 함께 정리하고, 원료와 제형을 검토해 제품으로 구체화합니다.' },
      { icon: 's-boxes', name: '소량 제조', desc: '처음부터 큰 물량을 준비하기 어려운 브랜드도 소량으로 시작할 수 있도록 제조를 지원합니다.' },
      { icon: 's-print', name: '패키지·인쇄', desc: '제품에 맞는 용기·라벨·패키지를 정하고, 인쇄까지 이어서 준비합니다.' },
      { icon: 's-link', name: '제조 상담·연결 ‘두고커넥트’', desc: '무엇부터 준비할지 막막할 때, 상담으로 필요한 제조 과정을 정리하고 연결합니다.' },
    ],
    sceneLead: '건강식품이 제품이 되는 제조 현장입니다. 실제 제품과 제조 과정 사진으로 교체할 예정입니다.',
    relNav: '두고커넥트',
  },
  {
    slug: 'commerce', num: '03', area: '커머스', en: 'DOOGO MAKERS', chain: 'Brand', icon: 'i-commerce',
    corp: { en: 'DOOGO MAKERS', field: '브랜드', ceo: '신동훈', key: 'makers' },
    scope: '브랜드 기획 · 상품 운영 · EXIT 전략',
    defLabel: '브랜드 커머스', def: '브랜드를 만들고 성장시키며, EXIT까지 연결합니다.',
    role: '브랜드를 기획하고 운영하며, 판매와 성장 전략을 함께 만듭니다.',
    services: ['브랜드 기획', '상품 운영', '브랜드 성장과 EXIT 전략'],
    targets: ['새 브랜드를 만들려는 분', '운영 중인 브랜드를 키우려는 사업자'],
    ask: '커머스 상담하기',
    cta: { label: '브랜드 보기', href: 'brands.html#brands' },
    web: web({ name: 'DOOGO MAKERS', kind: '연결 사이트', site: 'DOOGOFOOD', title: '연결 사이트', eyebrow: 'Related Site',
      host: 'doogofood.com', url: MAKERS_URL, shot: 'makers', close: '연결 사이트 바로가기',
      desc: 'DOOGO MAKERS와 연결된 DOOGOFOOD 식품 도매 플랫폼입니다. 생산자와 판매자를 잇는 식품 전문 B2B 도매 사이트를 볼 수 있습니다.' }),
    narration: '생각은 제품이 되고, 제품은 브랜드가 됩니다.',
    hero: { f: 'commerce', fx: '50%', fy: '48%', mx: '56%' },
    gallery: [photo('commerce', { label: '패키지 디자인', zoom: 1.7, focus: '70% 78%', alt: '무지 패키지 박스를 들고 컬러칩과 맞춰 보는 디자이너의 손(확대)' }), render('makers', { label: 'DOOGO MAKERS' })],
    facts: [['대표 서비스', '브랜드 기획 · 운영 · EXIT 전략'], ['연결 사이트', SITE(MAKERS_URL)]],
    svcHead: 'DOOGO MAKERS가 하는 일',
    svcLead: '브랜드의 시작부터 운영과 성장, 그다음 단계까지 함께 고민합니다.',
    detail: [
      { icon: 's-bulb', name: '브랜드 기획', desc: '누구에게 무엇을 팔지부터 이름·콘셉트·상품 구성까지, 브랜드의 기본을 함께 설계합니다.' },
      { icon: 's-store', name: '상품 운영', desc: '상세페이지·가격·재고 등 판매에 필요한 운영을 맡아 브랜드가 꾸준히 팔리도록 관리합니다.' },
      { icon: 's-growth', name: '브랜드 성장과 EXIT 전략', desc: '판매 채널과 콘텐츠를 넓혀 브랜드를 키우고, EXIT까지 내다보는 성장 전략을 세웁니다.' },
    ],
    sceneLead: '브랜드의 첫인상을 만드는 패키지와 디자인 작업 장면입니다. 실제 브랜드와 상품 자료로 교체할 예정입니다.',
    relNav: '성장 단계',
  },
  {
    slug: 'media', num: '04', area: '미디어', en: 'DOOGO MEDIA', chain: 'Content', icon: 'i-media',
    corp: { en: 'DOOGO MEDIA', field: '콘텐츠', ceo: '김윤정', key: 'media' },
    scope: '촬영 · 유튜브 · 라이브 콘텐츠',
    defLabel: '미디어 & 콘텐츠', def: '사람을 모으고, 브랜드를 키우는 미디어를 만듭니다.',
    role: '사람과 브랜드의 가치를 영상과 콘텐츠로 전합니다.',
    services: ['촬영', '유튜브 콘텐츠', '라이브 콘텐츠 제작'],
    targets: ['콘텐츠로 고객을 모으려는 브랜드', '강사·전문가'],
    ask: '콘텐츠 문의하기',
    cta: { label: '콘텐츠 문의하기', href: ASK('media') },
    web: web({ name: 'DOOGO MEDIA', kind: 'YouTube 채널', host: '두고보는 문대표', bar: 'youtube.com/@두고보는문대표', yt: true, url: MEDIA_URL, shot: 'media',
      btn: '채널 바로가기', close: 'DOOGO MEDIA 채널', desc: 'DOOGO MEDIA의 유튜브 채널 <span class="nowrap">‘두고보는 문대표’</span>입니다. 채널에서 영상 콘텐츠를 볼 수 있습니다.' }),
    narration: '그 가치를 발견하고, 이야기로 전합니다.',
    hero: { f: 'media', fx: '50%', fy: '38%', mx: '62%' },
    gallery: [photo('media', { label: '촬영 장비', zoom: 1.75, focus: '36% 48%', alt: '짐벌에 단 카메라로 출연자를 촬영하는 모습(확대)' }), render('media', { label: 'DOOGO MEDIA' })],
    heroAlt: { label: '콘텐츠 형식 보기', href: '#related' },
    facts: [['대표 서비스', '촬영 · 유튜브 · 라이브 콘텐츠'], ['유튜브 채널', SITE(MEDIA_URL, '두고보는 문대표')]],
    svcHead: 'DOOGO MEDIA가 하는 일',
    svcLead: '브랜드와 사람의 이야기를 촬영하고, 유튜브와 라이브로 고객에게 전합니다.',
    detail: [
      { icon: 's-camera', name: '촬영', desc: '브랜드와 사람을 보여 줄 영상과 사진을 촬영해, 콘텐츠와 판매에 쓰는 소스를 만듭니다.' },
      { icon: 's-video', name: '유튜브 콘텐츠', desc: '채널의 방향을 잡고, 기획·촬영·편집으로 이어지는 유튜브 콘텐츠를 만듭니다.' },
      { icon: 's-live', name: '라이브 콘텐츠 제작', desc: '라이브 방송과 실시간 강의를 준비하고 진행해, 고객과 바로 만나는 콘텐츠를 만듭니다.' },
    ],
    sceneLead: '도심 야외 촬영처럼 콘텐츠가 만들어지는 현장입니다. 실제 촬영 현장과 결과물로 교체할 예정입니다.',
    relNav: '콘텐츠 형식',
  },
  {
    slug: 'ad', num: '05', area: '광고', en: 'DOOGO AD', chain: 'Marketing', icon: 'i-ad',
    corp: { en: 'DOOGO AD', field: '마케팅', ceo: '김신용', key: 'ad', photo: 'leader-kim-sinyong' },
    scope: '네이버·쿠팡 광고 운영 · 소재 기획 · 성과 분석',
    defLabel: '퍼포먼스 마케팅', def: '네이버·쿠팡을 중심으로 브랜드를 더 멀리 알립니다.',
    role: '브랜드가 필요한 고객에게 닿도록 광고를 기획하고 운영합니다.',
    services: ['네이버·쿠팡 중심 광고 운영', '광고 소재 기획', '성과 분석'],
    targets: ['온라인으로 판매 중인 브랜드·셀러'],
    ask: '광고 상담하기',
    cta: { label: '광고 상담하기', href: ASK('ad') },
    web: web({ name: 'DOOGO AD', kind: '웹사이트', host: 'doogoad.com', url: AD_URL, shot: 'ad', close: 'DOOGO AD 사이트',
      desc: 'DOOGO AD의 마케팅 플랫폼입니다. 서비스 소개와 마케팅 상품, 제휴 상담 안내를 사이트에서 확인할 수 있습니다.' }),
    narration: '각자의 가능성이, 필요한 사람에게 닿도록.',
    hero: { f: 'ad', fx: '50%', fy: '45%', mx: '50%' },
    gallery: [photo('ad', { label: '성과 리뷰', zoom: 1.8, focus: '45% 40%', alt: '회의실 대형 화면에 띄운 광고 성과 그래프와 발표하는 사람(확대)' }), render('ad', { label: 'DOOGO AD' })],
    heroAlt: { label: '운영 채널 보기', href: '#related' },
    facts: [['운영 채널', '네이버 · 쿠팡'], ['사이트', SITE(AD_URL)]],
    svcHead: 'DOOGO AD가 하는 일',
    svcLead: '판매가 일어나는 채널을 중심으로 광고를 기획하고, 결과를 다음 운영에 반영합니다.',
    detail: [
      { icon: 's-target', name: '네이버·쿠팡 중심 광고 운영', desc: '고객이 상품을 찾고 구매하는 채널을 중심으로 광고를 설정하고 꾸준히 관리합니다.' },
      { icon: 's-pen', name: '광고 소재 기획', desc: '상품의 강점이 한눈에 보이도록 광고 문구와 이미지·영상 소재를 기획합니다.' },
      { icon: 's-chart', name: '성과 분석', desc: '광고 결과를 정리해 무엇이 효과가 있었는지 확인하고, 다음 운영에 반영합니다.' },
    ],
    sceneLead: '광고 성과를 함께 보며 다음 운영을 정하는 회의 장면입니다. 공개 가능한 실제 운영 자료로 교체할 예정입니다.',
    relNav: '운영 채널',
  },
  {
    slug: 'food', num: '06', area: '유통', en: 'DOOGOFOOD', chain: 'Sales', icon: 'i-food',
    corp: HOLD, // DOOGO HOLDINGS 직접 운영 · 담당 대표 문원오
    defLabel: '식품 유통', def: '대한민국 농수산물과 건강식품을 연결하여 좋은 먹거리를 전합니다.',
    role: '농수산물과 가공식품, 건강식품의 공급사와 판매자를 연결합니다.',
    services: ['식품 전문 도매 플랫폼 운영', '상품 공급', '판매자 협력'],
    targets: ['식품 공급사(생산자·제조사)', '온라인 위탁 판매자'],
    ask: '유통 상담하기',
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
    sceneLead: '산지에서 선별된 상품이 판매자에게 가기까지의 현장입니다. 실제 산지와 상품 사진으로 교체할 예정입니다.',
    relNav: '도매 플랫폼',
  },
  {
    slug: 'space', num: '07', area: '공간', en: 'DOOGO SPACE', chain: 'Space', icon: 'i-space',
    corp: { en: 'DOOGO SPACE', field: '공간', ceo: '문성오', key: 'space', photo: 'leader-moon-sungoh' },
    scope: '공유오피스 · 비상주 사무실 · 교육장 · NORA STAY',
    defLabel: '공간 & 숙박', def: '공유오피스·비상주 사무실 그리고 NORA STAY를 통한 숙박 사업까지, 사람과 비즈니스를 위한 공간을 만듭니다.',
    role: '함께 일하고 배우며, 쉬어갈 수 있는 공간을 만듭니다.',
    services: ['공유오피스', '비상주 사무실', '교육장 대여', '숙박 ‘NORA STAY’'],
    targets: ['작은 팀·1인 사업자', '교육·행사 주최자', '여행·출장객'],
    ask: '공간 상담하기',
    cta: { label: '공간 상담하기', href: ASK('space') },
    web: web({ name: 'NORA STAY', kind: 'DOOGO SPACE 숙박', host: 'norastay.com', url: NORA_URL, shot: 'space', close: 'NORA STAY 바로가기',
      desc: 'DOOGO SPACE의 숙박 서비스 NORA STAY의 사이트입니다. 숙소 소개와 예약 안내를 확인할 수 있습니다.' }),
    narration: '함께 일하고, 잠시 쉬어갈 자리까지.',
    // 첫 화면·현장 사진은 공간 사업 전체(공유오피스·교육장)를 보여 주는 예시 — NORA STAY를 가리키는 곳(관련 구간 카드 · 운영 사이트)은
    // 실제 사이트(norastay.com) 첫 화면 캡처와 그 일부(sites/space-stay.webp)만 씁니다 (5차 · AI 바다 객실 사진은 실제와 달라 뺌)
    hero: { f: 'cowork', fx: '50%', fy: '62%', mx: '64%' },
    thumb: 'space-office', // 이전·다음 사업 카드 썸네일 = 첫 화면 사진(공유오피스) — 기본 thumb-{slug}.webp(바다 객실)는 헤더 메뉴용으로 남김
    gallery: [
      photo('cowork', { label: '공유오피스', zoom: 1.6, focus: '74% 72%', alt: '공유오피스 책상에서 노트북으로 일하는 사람들(확대)' }),
      photo('campus', { label: '교육장', pos: '58% 50%', alt: '밝은 교육장에서 강사가 성인 수강생들 앞에서 강의하는 모습' }),
    ],
    heroAlt: { label: '공간 둘러보기', href: '#related' },
    facts: [['대표 서비스', '공유오피스 · 비상주 · 교육장'], ['숙박', `NORA STAY · ${SITE(NORA_URL)}`]],
    svcHead: 'DOOGO SPACE가 하는 일',
    svcLead: '일하고, 배우고, 쉬어가는 데 필요한 공간을 목적에 맞게 제공합니다.',
    detail: [
      { icon: 's-desk', name: '공유오피스', desc: '작은 팀과 1인 사업자가 필요한 만큼 자리를 쓰며 함께 일하는 업무 공간입니다.' },
      { icon: 's-address', name: '비상주 사무실', desc: '상주하지 않아도 사업장 주소가 필요한 사업자를 위한 비상주 사무실 서비스입니다.' },
      { icon: 's-classroom', name: '교육장 대여', desc: '강의·워크숍·모임을 위한 교육장을 대여하며, DOOGO CLASS 수업 공간으로도 연계합니다.' },
      { icon: 's-bed', name: '숙박 ‘NORA STAY’', desc: '여행과 출장 중 편하게 쉬어갈 수 있는 숙박 서비스 NORA STAY로 이어집니다.' },
    ],
    sceneLead: '함께 일하는 공유오피스와 함께 배우는 교육장, 두 가지 공간입니다. 실제 시설 사진으로 교체할 예정입니다.',
    relNav: '공간 안내',
  },
];

// 가치사슬 7단계 (기획안 순서) → 사업 연결
const CHAIN = [
  { ko: '제품 제조', en: 'PRODUCT', slug: 'bio' },
  { ko: '브랜드 기획', en: 'BRAND', slug: 'commerce' },
  { ko: '콘텐츠 제작', en: 'CONTENT', slug: 'media' },
  { ko: '교육·인재 육성', en: 'EDUCATION', slug: 'campus' },
  { ko: '마케팅', en: 'MARKETING', slug: 'ad' },
  { ko: '판매·유통', en: 'SALES', slug: 'food' },
  { ko: '공간·숙박', en: 'SPACE', slug: 'space' },
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
  <meta property="og:site_name" content="두고그룹 DOOGO GROUP">
  <meta property="og:title" content="${title} | 두고그룹">
  <meta property="og:description" content="${desc}">
  <meta property="og:image" content="assets/img/og/og-default.jpg">
  <link rel="icon" href="assets/img/logo/doogo-symbol.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="assets/img/logo/apple-touch-icon.png">
  <link rel="stylesheet" href="assets/fonts/pretendard/pretendardvariable-dynamic-subset.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap">
  <link rel="stylesheet" href="assets/css/base.css">
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

const CTA_BAND = `  <section class="cta-band" aria-labelledby="cta-title">
    <div class="container">
      <span class="eyebrow">Contact</span>
      <h2 class="h2" id="cta-title" data-reveal style="margin-top:20px">다음 사업, 두고그룹과 함께 이야기해 보세요.</h2>
      <p class="lead" data-reveal style="--d:.1s">교육·제조·커머스·미디어·광고·유통·공간, 그리고 그룹 제휴까지 하나의 창구로 접수합니다.</p>
      <div class="cta-chips" data-reveal style="--d:.15s">
        ${[['campus', '교육'], ['bio', '제조'], ['commerce', '커머스'], ['media', '미디어'], ['ad', '광고'], ['food', '유통'], ['space', '공간'], ['partner', '그룹 제휴']].map(([t, l]) => `<a href="${ASK(t)}">${l}</a>`).join('')}
      </div>
      <div class="cta-band-actions" data-reveal style="--d:.2s">
        <a class="btn btn--primary btn--lg" href="contact.html">사업 상담하기 ${ARROW}</a>
        <a class="btn btn--ghost btn--lg" href="${ASK('partner')}">제휴 문의하기</a>
      </div>
    </div>
  </section>`;

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
  const jump = BIZ.map((b, i) => `          <li><a class="bz-jump-item" href="#${b.slug}" data-key="${b.slug}">
            <span class="bz-jump-num en">${b.num}</span>
            <span class="bz-jump-ico">${ico(b.icon, '')}</span>
            <span class="bz-jump-txt"><strong>${b.area}</strong><span class="en">${b.en}</span></span>
          </a></li>`).join('\n');

  const rail = CHAIN.map((c, i) => {
    const b = BIZ.find(x => x.slug === c.slug);
    return `          <li style="--i:${i}"><a href="business-${c.slug}.html"><span class="bz-rail-dot" aria-hidden="true"></span><strong>${c.ko}</strong><span class="bz-rail-en en">${c.en}</span><span class="bz-rail-biz"><span class="en">${b.num}</span>${b.area}${ico('i-arrow-ur', '')}</span><span class="sr-only"> — ${b.en} 상세 보기</span></a></li>`;
  }).join('\n');

  const subnav = BIZ.map(b => `<li><a href="#${b.slug}"><span class="en">${b.num}</span> ${b.area}</a></li>`).join('');

  const cards = BIZ.map((b, i) => {
    const ph = PHOTO[b.hero.f];
    return `      <article class="bz-card" id="${b.slug}" aria-labelledby="bz-t-${b.slug}">
        <a class="bz-media" href="business-${b.slug}.html" tabindex="-1" aria-hidden="true" data-reveal="scale">
          <span class="bz-media-inner" data-parallax>
            <img src="assets/img/photo/${b.hero.f}.webp" alt="" width="${ph.w}" height="${ph.h}" loading="lazy" decoding="async" style="object-position:${b.hero.mx} ${b.hero.fy}">
          </span>
          <span class="bz-media-tag"><span class="en">${b.num}</span>${b.area}</span>
          <span class="bz-media-quote">“${b.narration}”</span>
          <span class="bz-cursor"><span class="bz-cursor-in"><span class="en">VIEW</span>${ico('i-arrow-ur', '')}</span></span>
        </a>
        <div class="bz-body">
          <div class="bz-top" data-reveal>
            <span class="bz-num en" aria-hidden="true">${b.num}</span>
            <span class="bz-stage en">${b.chain}</span>
          </div>
          <h3 class="bz-title" id="bz-t-${b.slug}" data-reveal style="--d:.05s"><span class="bz-area">${b.area}</span><span class="bz-brand"><span class="en">${b.en}</span></span></h3>
          <p class="bz-corp" data-reveal style="--d:.08s"><span class="bz-corp-k">운영</span><strong class="bz-corp-n en">${b.corp.en}</strong><span class="bz-corp-type${b.corp.direct ? ' is-hold' : ''}">${corpChip(b.corp)}</span><span class="bz-corp-ceo">대표 <strong>${b.corp.ceo}</strong></span></p>
          <!-- 운영 사이트 주소: 데스크톱은 번호 줄 오른쪽, 모바일은 운영 회사 줄 아래 (business.css) -->
          <a class="bz-site" href="${b.web.url}" target="_blank" rel="noopener" data-reveal="fade" style="--d:.1s">${b.web.yt ? `<span>YouTube · ${b.web.host}</span>` : `<span class="en">${b.web.host}</span>`}${ARROW_UR}<span class="sr-only"> — ${b.web.name} ${b.web.yt ? '유튜브 채널' : b.web.site !== b.web.name ? `연결 사이트(${b.web.site})` : '사이트'}(새 창)</span></a>
          <p class="bz-def" data-reveal style="--d:.1s"><span class="bz-def-label">${b.defLabel}</span>${nw(b.def)}</p>
          <p class="bz-role" data-reveal style="--d:.12s">${b.role}</p>
          <div class="bz-info" data-reveal style="--d:.16s">
            <div class="bz-info-col">
              <p class="bz-label">주요 서비스</p>
              <ul class="bz-svcs">
${b.services.map(s => `                <li>${CHECK}<span>${nw(s)}</span></li>`).join('\n')}
              </ul>
            </div>
            <div class="bz-info-col bz-for">
              <p class="bz-label">이런 분께</p>
              <ul class="bz-for-list">
${b.targets.map(t => `                <li>${t}</li>`).join('\n')}
              </ul>
            </div>
          </div>
          <div class="bz-actions" data-reveal style="--d:.2s">
            <a class="btn btn--dark" href="business-${b.slug}.html">자세히 보기 ${ARROW}<span class="sr-only"> — ${b.area} ${b.en}</span></a>
            ${action(b.cta, 'btn btn--line')}
          </div>
        </div>
      </article>`;
  }).join('\n\n');

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
      <nav aria-label="현재 위치"><ol class="breadcrumb"><li><a href="index.html">홈</a></li><li aria-current="page">사업영역</li></ol></nav>
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

  <!-- 2. 가치사슬 띠 -->
  <section class="bz-chain" aria-labelledby="chain-title">
    <div class="container bz-chain-inner">
      <div class="bz-chain-head" data-reveal="fade">
        <span class="eyebrow">Value Chain</span>
        <h2 class="bz-chain-title" id="chain-title">제품에서 사람까지, <br>7단계로 이어지는 성장</h2>
        <p class="bz-chain-note">단계를 누르면 그 단계를 맡은 사업의 상세 페이지로 이동합니다.</p>
      </div>
      <div class="bz-rail-wrap">
        <ol class="bz-rail" data-reveal="fade">
${rail}
          <li class="bz-rail-goal" style="--i:7"><span class="bz-rail-dot" aria-hidden="true">${ico('i-arrow-ur', '')}</span><strong>브랜드 성장 &amp; EXIT</strong><span class="bz-rail-en en">BRAND GROWTH &amp; EXIT</span><span class="bz-rail-biz is-goal">그룹이 함께 만드는 결과</span></li>
        </ol>
      </div>
    </div>
  </section>

  <nav class="subnav bz-subnav" aria-label="사업 바로가기">
    <div class="container"><ul>${subnav}</ul></div>
  </nav>

  <!-- 3. 7개 사업 -->
  <section class="section bz-list" aria-labelledby="list-title">
    <div class="container">
      <div class="sec-head sec-head--split bz-list-head">
        <div>
          <span class="eyebrow" data-reveal="fade">7 Businesses</span>
          <h2 class="h2" id="list-title" data-lines style="margin-top:20px"><span class="line"><span>필요한 사업을</span></span><span class="line"><span>찾아보세요</span></span></h2>
        </div>
        <p class="lead" data-reveal style="--d:.15s">사업마다 운영 회사와 하는 일, 주요 서비스, 함께하면 좋은 분을 정리했습니다. ‘자세히 보기’를 누르면 사업별 상세 페이지로, 옆 버튼을 누르면 상담이나 각 서비스로 바로 이동합니다.</p>
      </div>

      <div class="bz-cards">
${cards}
      </div>
      <p class="note bz-note" data-reveal>사업 사진은 AI로 만든 예시 이미지이며, 실제 사진으로 교체할 예정입니다.</p>
    </div>
  </section>

${CTA_BAND}`;

  return shell({
    title: '사업영역',
    desc: '배우고, 만들고, 키우고. 지주회사 DOOGO HOLDINGS와 다섯 그룹사가 운영하는 교육·제조·커머스·미디어·광고·유통·공간, 7개 사업영역을 한 번에 소개합니다.',
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
      { name: '문대표', sub: ['문원오', 'DOOGO HOLDINGS 대표'], course: '뉴질랜드 건기식 브랜딩', len: '5주 과정', photo: 'leader-moon-wonoh' },
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
    lead: '무엇부터 준비해야 할지 막막할 때, 두고커넥트가 상담부터 제품 개발, 소량 제조와 패키지까지 필요한 과정을 이어 줍니다.',
    actions: `<a class="btn btn--white" href="${ASK('bio')}">제조 상담하기 ${ARROW}</a>`,
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
    lead: '브랜드를 만드는 데서 끝나지 않고, 운영과 성장을 거쳐 다음 단계까지 함께 설계합니다. 성장 단계에서는 그룹의 콘텐츠·광고·유통 사업과 연계할 수 있습니다.',
    actions: `<a class="btn btn--white" href="${ASK('commerce')}">커머스 상담하기 ${ARROW}</a>`,
    label: '브랜드 성장 단계',
    goalLast: true,
    items: [
      { icon: 's-bulb', ko: '기획', en: 'Plan', desc: '시장과 고객을 살펴 브랜드 콘셉트와 첫 상품을 정합니다.' },
      { icon: 's-store', ko: '운영', en: 'Operate', desc: '판매 채널을 열고 상품과 고객 응대를 안정적으로 운영합니다.' },
      { icon: 's-growth', ko: '성장', en: 'Grow', desc: '콘텐츠·광고·유통과 연계해 판매를 넓힙니다.', links: [['business-media.html', '미디어'], ['business-ad.html', '광고'], ['business-food.html', '유통']] },
      { icon: 's-flag', ko: 'EXIT', en: 'Exit', desc: '브랜드의 가치를 정리해 다음 단계로 연결합니다.' },
    ],
  }),
  media: () => {
    // 2) 주요 서비스 카드(무엇을 하는지)와 겹치지 않게: 형식별 '결과물'과 '이런 분께'를 큰 번호 목록으로
    const formats = [
      { en: 'Shooting', ko: '촬영', out: '영상 · 사진 소스', who: '콘텐츠로 고객을 모으려는 브랜드' },
      { en: 'YouTube', ko: '유튜브 콘텐츠', out: '채널에 올리는 영상 콘텐츠', who: '강사·전문가 · 브랜드' },
      { en: 'Live', ko: '라이브 콘텐츠', out: '실시간 방송 · 강의', who: '강사·전문가 · 브랜드' },
    ];
    return `      <div class="dt-rel-head">
        <div>
          <span class="eyebrow" data-reveal="fade">Content Formats</span>
          <h2 class="h2" id="rel-title" data-lines style="margin-top:20px"><span class="line"><span>목적에 맞는</span></span><span class="line"><span>세 가지 콘텐츠 형식</span></span></h2>
        </div>
        <div class="dt-rel-side" data-reveal style="--d:.15s">
          <p class="lead">알리고 싶은 내용과 만나고 싶은 고객에 맞춰 형식을 고르고, 기획부터 촬영·편집까지 이어서 진행합니다.</p>
        </div>
      </div>
      <ol class="dt-rows">
        <li class="dt-rows-head" aria-hidden="true"><span>형식</span><span>결과물</span><span>이런 분께</span></li>
${formats.map((f, i) => `        <li class="dt-row" data-reveal style="--d:${(i * 0.08).toFixed(2)}s">
          <span class="dt-row-num en">${String(i + 1).padStart(2, '0')}</span>
          <h3 class="dt-row-title"><span class="dt-row-en en">${f.en}</span>${f.ko}</h3>
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
          <p class="lead"><span class="nowrap">DOOGOFOOD</span>(doogofood.com)는 농수산물·가공식품·건강식품 공급사와 온라인 위탁 판매자를 연결하는 B2B 식품 도매 플랫폼입니다. 지주회사 <span class="nowrap">DOOGO HOLDINGS</span>가 직접 운영합니다.</p>
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
    //    NORA STAY는 실제 사이트 첫 화면 속 숙소 사진(일부)을 쓴 카드로 (AI 이미지는 실제 숙소와 달라 쓰지 않음)
    const spaces = [
      { en: 'Shared Office', ko: '공유오피스', use: '필요한 만큼 자리를 쓰며 함께 일하는 업무 공간', who: '작은 팀 · 1인 사업자' },
      { en: 'Virtual Office', ko: '비상주 사무실', use: '상주하지 않아도 사업장 주소가 필요할 때', who: '1인 사업자' },
      { en: 'Classroom', ko: '교육장', use: '강의·워크숍·모임 공간', who: '교육 · 행사 주최자', link: ['business-campus.html', 'DOOGO CLASS 수업과 연계'] },
    ];
    return `      <div class="dt-rel-head">
        <div>
          <span class="eyebrow" data-reveal="fade">Spaces</span>
          <h2 class="h2" id="rel-title" data-lines style="margin-top:20px"><span class="line"><span>일하고, 배우고, 쉬어가는</span></span><span class="line"><span>네 가지 공간</span></span></h2>
        </div>
        <div class="dt-rel-side" data-reveal style="--d:.15s">
          <p class="lead">목적에 맞는 공간을 고를 수 있도록 공유오피스·비상주 사무실·교육장을 마련하고, 숙박은 <span class="nowrap">NORA STAY</span>로 이어집니다.</p>
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
          <span class="dt-row-num en">04</span>
          <p class="dt-stay-en en">Stay</p>
          <h3 class="dt-stay-title"><span class="en nowrap">NORA STAY</span> 숙박</h3>
          <p class="dt-stay-desc">여행과 출장 중에 편하게 쉬어갈 수 있는 <span class="nowrap">DOOGO SPACE</span>의 숙박 서비스입니다. 일하는 공간에서 쉬는 공간까지, 머무는 시간 전체를 함께 준비합니다.</p>
          <p class="dt-stay-for"><span>이런 분께</span>여행객 · 출장객</p>
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
      <div class="dt-web-card" data-reveal data-web>
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
        </div>
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
  const corpPill = `<a class="dt-corp${c.direct ? ' is-hold' : ''}" href="about.html#structure"><span class="dt-corp-k">운영</span><span class="dt-corp-n en">${c.en}</span><span class="dt-corp-type">${corpChip(c)}</span><span class="sr-only"> — 그룹 구조 보기</span></a>`;

  // 현장: 사진 2장 또는 사진 + 브랜드 3D 렌더 (모두 AI로 만든 예시)
  //  히어로와 같은 사진을 큰 칸에 쓸 때는 zoom/focus로 확대한 '디테일 컷'으로 보여 줘 반복을 피함
  const shotStyle = (g) => {
    const st = [g.pos && `object-position:${g.pos}`, g.zoom && `--z:${g.zoom};--zo:${g.focus || '50% 50%'}`].filter(Boolean).join(';');
    return st ? ` style="${st}"` : '';
  };
  const shots = b.gallery.map((g, i) => `        <figure class="dt-shot dt-shot--${g.kind}" data-reveal style="--d:${(i * 0.14).toFixed(2)}s">
          <div class="dt-shot-media"><img src="${g.src}" alt="${g.alt}" width="${g.w}" height="${g.h}" loading="lazy" decoding="async"${shotStyle(g)}></div>
          <span class="dt-shot-label"><span class="en">${String(i + 1).padStart(2, '0')}</span>${g.label}</span>
          <figcaption>${g.kind === 'render' ? 'AI로 만든 브랜드 3D 이미지' : AI_NOTE}</figcaption>
        </figure>`).join('\n');

  // 담당 대표: 리더 프로필 카드(.pcard · 생김새는 base.css '15. 리더 프로필 카드 공통') 가로형 한 장
  //  사진 칸 = 흰 칸 + 두고 'd' 심볼 + 상반신 사진(문원오 · 문성오 · 김신용) 또는 중립 실루엣 + '사진 준비 중'
  //  본문 = 이름 · 영문 회사명 · 분야 → 이 사업과 관련된 정보(dl) → '자세히 보기'(카드 전체가 링크) + 안내 문구 · 이력은 지어내지 않음
  const leaderVisual = c.photo
    ? `<div class="pcard-ph">
          <img class="pcard-img" src="${PEOPLE}/${c.photo}-600.webp" srcset="${peopleSrcset(c.photo)}" sizes="(max-width: 560px) calc(100vw - 40px), (max-width: 1180px) 40vw, 380px" width="900" height="1200" alt="${c.ceo} ${c.en} 대표" loading="lazy" decoding="async">
        </div>`
    : `<div class="pcard-ph is-empty" aria-hidden="true"><span class="pcard-sil"></span><span class="pcard-soon">사진 준비 중</span></div>`;
  const leaderLead = c.direct
    ? `지주회사 <span class="nowrap">${c.en}</span>의 대표로, ${b.area} 사업 <span class="nowrap">${b.en}</span>를 직접 운영하며 그룹 총괄 운영을 이끕니다.`
    : `${b.area} 사업은 그룹사 <span class="nowrap">${c.en}</span>가 맡고, ${c.ceo} 대표가 이끌고 있습니다.`;
  // 회사 줄: 영문 회사명(공통 .pcard-co) + 지주회사 / 해외 거점 칩 — 분야는 그 아래 .pcard-field 한 줄
  const leaderTag = c.direct ? `<span class="dt-corp-type is-hold">${c.type}</span>` : c.place ? `<span class="dt-corp-type is-place">${c.place}</span>` : '';
  const leaderBody = `<h3 class="pcard-name" id="leader-name">${c.ceo} <small>대표</small></h3>
          <p class="dt-leader-co"><span class="pcard-co en">${c.en}</span>${leaderTag}</p>
          <p class="pcard-field"><span class="sr-only">분야 </span>${c.field}</p>
${c.direct ? `          <blockquote class="dt-leader-quote"><p>“제품과 브랜드, 그리고 사람의 성장이 이어지는 사업을 만듭니다.”</p></blockquote>
` : `          <p class="dt-leader-role"><span class="dt-leader-role-k">${b.area} 사업</span>${b.role}</p>
`}          <div class="dt-leader-more">
            <dl class="dt-leader-dl">
${c.direct ? `              <div><dt>직접 운영</dt><dd class="dt-dd-chips"><span class="dt-dd-chip${b.slug === 'campus' ? ' is-cur' : ''}"><span class="en">DOOGO CLASS</span>교육</span><span class="dt-dd-chip${b.slug === 'food' ? ' is-cur' : ''}"><span class="en">DOOGOFOOD</span>유통</span></dd></div>
              <div><dt>강의</dt><dd><span class="en nowrap">DOOGO CLASS</span> ‘문대표’ · 뉴질랜드 건기식 브랜딩</dd></div>`
    : `              <div><dt>주요 서비스</dt><dd class="dt-dd-chips">${b.scope.split(' · ').map(x => `<span class="dt-dd-chip is-svc">${nw(x)}</span>`).join('')}</dd></div>`}
            </dl>
          </div>
          <div class="pcard-foot dt-leader-foot">
            <a class="pcard-link pcard-stretch" href="leadership.html#${c.anchor || `leader-${c.key}`}">자세히 보기<span class="sr-only"> (${c.en} ${c.ceo} 대표 · 리더십)</span> ${ico('i-arrow')}</a>
            <p class="dt-leader-note"><i aria-hidden="true"></i>${c.photo ? '이력은 확정 후 게시합니다.' : '이력과 사진은 확정 후 게시합니다.'}</p>
          </div>`;

  const main = `${SPRITE}

  <!-- 1. 첫 화면 -->
  <section class="page-hero dt-hero" aria-labelledby="dt-title">
    <div class="dt-hero-glow" aria-hidden="true"></div>
    <div class="container">
      <nav aria-label="현재 위치"><ol class="breadcrumb"><li><a href="index.html">홈</a></li><li><a href="business.html">사업영역</a></li><li aria-current="page">${b.area}</li></ol></nav>
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
        <span class="dt-frame-badge">AI로 만든 예시 이미지</span>
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
    <div class="container"><ul><li><a href="#services">주요 서비스</a></li><li><a href="#site">${b.web.title}</a></li><li><a href="#scene">현장</a></li><li><a href="#related">${b.relNav}</a></li><li><a href="#leader">담당 대표</a></li><li><a href="#inquiry">문의</a></li></ul></div>
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
${b.detail.map((s, i) => `        <li class="dt-svc" data-reveal style="--d:${(i * 0.07).toFixed(2)}s">
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
          <h2 class="h2" id="scene-title" data-lines style="margin-top:20px"><span class="line"><span>현장에서 보는 ${b.area}</span></span></h2>
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

  <!-- 6. 담당 대표 -->
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
          <p class="dt-ask-desc">문의 분야가 ‘${b.area}’${euro(b.area)} 선택된 상태로 접수 화면이 열립니다. 담당자가 확인한 뒤 남겨 주신 연락처로 회신합니다.</p>
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

${CTA_BAND}`;

  return shell({
    title: `${b.area} · ${b.en}`,
    // 회사 이름은 한 번만: 직접 운영 사업은 '운영 회사 직접 운영', 그룹사 사업은 회사 이름이 곧 브랜드라 생략
    desc: `${b.en} — 두고그룹 ${b.area} 사업 (${c.direct ? `${c.en} 직접 운영 · ` : ''}대표 ${c.ceo}). ${b.role} ${b.def}`,
    css: 'business-detail', js: 'business-detail',
    bodyAttrs: `data-page="business-${b.slug}"`,
    main,
  });
}

/* ---------- 쓰기 ---------- */
const out = [['business.html', buildList()], ...BIZ.map((b, i) => [`business-${b.slug}.html`, buildDetail(b, i)])];
for (const [file, html] of out) {
  writeFileSync(join(root, file), html);
  console.log(`✓ ${file}`);
}
console.log(`완료: ${out.length}개 페이지 생성`);
