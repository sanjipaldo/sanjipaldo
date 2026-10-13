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
   - 사업별 영상 프레이밍: BIZ[].op(모바일·카드 가로 위치), BIZ[].frame {vs 확대, vx/vy 초점, q:'right' 문구 오른쪽}
     → 사업 영상(biz-{slug}.mp4)을 교체하면 이 값만 맞추면 됩니다.
   - 현장 갤러리의 '그룹 영상 속' 사진은 히어로 포스터와 겹치지 않게 영상 5초 지점을 잘라낸 별도 정지 화면입니다:
       ffmpeg -ss 5 -i assets/video/biz-{slug}.mp4 -frames:v 1 -vf "crop=W:H:X:Y" -c:v libwebp -quality 84 assets/img/biz/still-{slug}.webp
     (크기는 BIZ[].still [W, H]와 맞출 것)
   - 스타일: assets/css/pages/business.css, business-detail.css
     동작:   assets/js/pages/business.js,  business-detail.js
   ========================================================= */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MARKET_URL = 'https://doogofood-ops-hub.eugenemoon.chatgpt.site';

/* ---------- 아이콘 ---------- */
const ico = (id, cls = 'ico') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
const ARROW = ico('i-arrow', 'ico ico-arrow');
const ARROW_UR = ico('i-arrow-ur', 'ico');
const CHECK = ico('i-check', 'ico');
const NEWWIN = '<span class="sr-only">(새 창)</span>';
// 브랜드명이 줄바꿈으로 갈라지지 않게 (화면 문구에만 사용 — 속성값에는 쓰지 말 것)
const nw = (t) => t.replace(/DOOGO MARKET|NORA STAY|두고클래스|두고커넥트/g, (m) => `<span class="nowrap">${m}</span>`);
const DOWN = ico('i-arrow', 'ico ico-arrow ico-down');
const SIL = '<svg class="dt-sil" viewBox="0 0 300 400" aria-hidden="true" focusable="false"><circle cx="150" cy="148" r="64"/><path d="M24 400c0-86 56-146 126-146s126 60 126 146Z"/></svg>';

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
    slug: 'campus', num: '01', area: '교육', en: 'DOOGO CAMPUS', ko: '두고캠퍼스', chain: 'Education', icon: 'i-campus', key: true,
    defLabel: '교육 플랫폼', def: '사람을 성장시키고, 새로운 사업과 브랜드를 만듭니다.',
    role: '경험과 노하우를 나누고, 새로운 사업과 브랜드의 시작을 돕습니다.',
    services: ['실전 교육', '강사·과정 소개', '온라인 클래스 ‘두고클래스’', '교육장 연계(두고스페이스)'],
    targets: ['창업·부업을 준비하는 분', '브랜드를 키우려는 사업자', '실무 역량을 키우려는 분'],
    cta: { label: '교육 플랫폼 보기', pending: '두고클래스 교육 플랫폼' },
    site: { label: '두고클래스 바로가기', pending: '두고클래스 사이트' },
    narration: '경험을 나누면, 또 다른 시작이 태어납니다.',
    op: '44%', frame: { vs: 1.08, vx: '0%', vy: '55%' }, still: [960, 540],
    facts: [['대표 서비스', '온라인 클래스 ‘두고클래스’'], ['함께 쓰는 공간', '두고스페이스 교육장']],
    svcHead: '두고캠퍼스가 하는 일',
    svcLead: '실전 교육부터 온라인 클래스, 교육장까지 배움에 필요한 과정을 한곳에서 연결합니다.',
    detail: [
      { icon: 's-lecture', name: '실전 교육', desc: '사업을 직접 운영하며 얻은 경험을 바탕으로, 창업과 브랜드 운영에 바로 쓰는 내용을 다룹니다.' },
      { icon: 's-mentor', name: '강사·과정 소개', desc: '분야별 강사와 과정을 한곳에서 소개해, 배우려는 목적에 맞는 과정을 찾도록 돕습니다.' },
      { icon: 's-online', name: '온라인 클래스 ‘두고클래스’', desc: '시간과 장소에 얽매이지 않고 들을 수 있는 온라인 클래스로 실전 과정을 만납니다.' },
      { icon: 's-classroom', name: '교육장 연계', desc: '오프라인 수업과 모임은 두고스페이스의 교육장과 연계해 진행합니다.' },
    ],
    scenes: [{ src: 'assets/img/biz/campus-scene.webp', w: 714, h: 450, alt: '강의실에서 강사가 수강생들에게 발표하는 교육 현장 예시 이미지' }],
    photoPlan: ['강의·수업 현장', '강사와 과정 소개 자료', '교육장과 수강생 모습'],
    sceneLead: '강의가 열리는 현장과 강사, 수강생이 함께하는 장면을 실제 사진으로 담을 예정입니다.',
    relNav: '두고클래스',
    leaderTask: '실전 교육 과정과 강사·과정 운영, 온라인 클래스 ‘두고클래스’',
  },
  {
    slug: 'bio', num: '02', area: '제조', en: 'DOOGO BIO NZ', ko: '두고바이오 NZ', chain: 'Product', icon: 'i-bio',
    defLabel: '건강식품 제조', def: '뉴질랜드 건강식품 소량 제조 및 인쇄까지, 좋은 제품을 만듭니다.',
    role: '뉴질랜드 건강식품의 개발과 소량 제조, 제품화를 지원합니다.',
    services: ['제품 개발', '소량 제조', '패키지·인쇄', '제조 상담·연결 ‘두고커넥트’'],
    targets: ['자체 건강식품 브랜드를 준비하는 사업자', '소량으로 시작하려는 셀러'],
    cta: { label: '제조 상담하기', href: 'contact.html?type=bio' },
    site: { label: '두고바이오 NZ 사이트', pending: '두고바이오 NZ 사이트' },
    narration: '살펴보고, 시험하고, 다시 들여다보며.',
    op: '4%', frame: { vs: 1.2, vx: '0%', vy: '50%', q: 'right' }, still: [800, 450],
    heroAlt: { label: '두고커넥트 알아보기', href: '#related' },
    facts: [['대표 서비스', '제조 상담·연결 ‘두고커넥트’'], ['주요 제품', '뉴질랜드 건강식품']],
    svcHead: '두고바이오 NZ가 하는 일',
    svcLead: '제품 개발부터 소량 제조, 패키지·인쇄까지 건강식품이 제품이 되는 과정을 함께합니다.',
    detail: [
      { icon: 's-flask', name: '제품 개발', desc: '만들고 싶은 건강식품의 방향을 함께 정리하고, 원료와 제형을 검토해 제품으로 구체화합니다.' },
      { icon: 's-boxes', name: '소량 제조', desc: '처음부터 큰 물량을 준비하기 어려운 브랜드도 소량으로 시작할 수 있도록 제조를 지원합니다.' },
      { icon: 's-print', name: '패키지·인쇄', desc: '제품에 맞는 용기·라벨·패키지를 정하고, 인쇄까지 이어서 준비합니다.' },
      { icon: 's-link', name: '제조 상담·연결 ‘두고커넥트’', desc: '무엇부터 준비할지 막막할 때, 상담으로 필요한 제조 과정을 정리하고 연결합니다.' },
    ],
    scenes: [{ src: 'assets/img/biz/bio-scene.webp', w: 642, h: 570, alt: '뉴질랜드 산을 배경으로 연구원이 건강식품 원료를 살피는 제조 현장 예시 이미지' }],
    photoPlan: ['제품과 원료', '제조·검수 과정', '패키지·인쇄 결과물'],
    sceneLead: '실제 제품과 원료, 제조와 패키지 과정을 사진으로 소개할 예정입니다.',
    relNav: '두고커넥트',
    leaderTask: '건강식품 제품 개발과 소량 제조, 패키지·인쇄, 제조 상담 ‘두고커넥트’',
  },
  {
    slug: 'commerce', num: '03', area: '커머스', en: 'DOOGO COMMERCE', ko: '두고커머스', chain: 'Brand', icon: 'i-commerce',
    defLabel: '브랜드 커머스', def: '브랜드를 만들고 성장시키며, EXIT까지 연결합니다.',
    role: '브랜드를 기획하고 운영하며, 판매와 성장 전략을 함께 만듭니다.',
    services: ['브랜드 기획', '상품 운영', '브랜드 성장과 EXIT 전략'],
    targets: ['새 브랜드를 만들려는 분', '운영 중인 브랜드를 키우려는 사업자'],
    cta: { label: '브랜드 보기', href: 'brands.html#brands' },
    site: { label: '운영 브랜드 보기', href: 'brands.html#brands' },
    narration: '생각은 제품이 되고, 제품은 브랜드가 됩니다.',
    op: '57%', frame: { vs: 1.2, vx: '74%', vy: '55%' }, still: [800, 450],
    facts: [['대표 서비스', '브랜드 기획 · 운영 · EXIT 전략'], ['연계할 수 있는 사업', '미디어 · 광고 · 유통']],
    svcHead: '두고커머스가 하는 일',
    svcLead: '브랜드의 시작부터 운영과 성장, 그다음 단계까지 함께 고민합니다.',
    detail: [
      { icon: 's-bulb', name: '브랜드 기획', desc: '누구에게 무엇을 팔지부터 이름·콘셉트·상품 구성까지, 브랜드의 기본을 함께 설계합니다.' },
      { icon: 's-store', name: '상품 운영', desc: '상세페이지·가격·재고 등 판매에 필요한 운영을 맡아 브랜드가 꾸준히 팔리도록 관리합니다.' },
      { icon: 's-growth', name: '브랜드 성장과 EXIT 전략', desc: '판매 채널과 콘텐츠를 넓혀 브랜드를 키우고, EXIT까지 내다보는 성장 전략을 세웁니다.' },
    ],
    scenes: [{ src: 'assets/img/biz/commerce-scene.webp', w: 588, h: 615, alt: '온라인 쇼핑 화면과 진열된 건강식품 제품이 보이는 커머스 예시 이미지' }],
    photoPlan: ['운영 브랜드와 상품', '상세페이지·판매 화면', '브랜드가 자라 온 과정'],
    sceneLead: '운영 중인 브랜드와 상품, 판매 화면을 실제 자료로 소개할 예정입니다.',
    relNav: '성장 단계',
    leaderTask: '브랜드 기획과 상품 운영, 브랜드 성장과 EXIT 전략',
  },
  {
    slug: 'media', num: '04', area: '미디어', en: 'DOOGO MEDIA', ko: '두고미디어', chain: 'Content', icon: 'i-media',
    defLabel: '미디어 & 콘텐츠', def: '사람을 모으고, 브랜드를 키우는 미디어를 만듭니다.',
    role: '사람과 브랜드의 가치를 영상과 콘텐츠로 전합니다.',
    services: ['촬영', '유튜브 콘텐츠', '라이브 콘텐츠 제작'],
    targets: ['콘텐츠로 고객을 모으려는 브랜드', '강사·전문가'],
    cta: { label: '콘텐츠 문의하기', href: 'contact.html?type=media' },
    site: { label: '두고미디어 채널', pending: '두고미디어 채널' },
    narration: '그 가치를 발견하고, 이야기로 전합니다.',
    op: '47%', frame: { vs: 1.2, vx: '38%', vy: '45%' }, still: [800, 450],
    heroAlt: { label: '콘텐츠 형식 보기', href: '#related' },
    facts: [['대표 서비스', '촬영 · 유튜브 · 라이브 콘텐츠'], ['연계할 수 있는 사업', '교육 · 커머스 · 광고']],
    svcHead: '두고미디어가 하는 일',
    svcLead: '브랜드와 사람의 이야기를 촬영하고, 유튜브와 라이브로 고객에게 전합니다.',
    detail: [
      { icon: 's-camera', name: '촬영', desc: '브랜드와 사람을 보여 줄 영상과 사진을 촬영해, 콘텐츠와 판매에 쓰는 소스를 만듭니다.' },
      { icon: 's-video', name: '유튜브 콘텐츠', desc: '채널의 방향을 잡고, 기획·촬영·편집으로 이어지는 유튜브 콘텐츠를 만듭니다.' },
      { icon: 's-live', name: '라이브 콘텐츠 제작', desc: '라이브 방송과 실시간 강의를 준비하고 진행해, 고객과 바로 만나는 콘텐츠를 만듭니다.' },
    ],
    scenes: [{ src: 'assets/img/biz/media-scene.webp', w: 576, h: 465, alt: '카메라와 조명 앞에서 진행자가 콘텐츠를 촬영하는 스튜디오 예시 이미지' }],
    photoPlan: ['촬영 현장', '유튜브·라이브 콘텐츠 화면', '스튜디오와 제작 장비'],
    sceneLead: '촬영 현장과 실제로 만든 콘텐츠 화면을 사진으로 소개할 예정입니다.',
    relNav: '콘텐츠 형식',
    leaderTask: '촬영과 유튜브·라이브 콘텐츠 기획·제작',
  },
  {
    slug: 'ad', num: '05', area: '광고', en: 'DOOGO AD', ko: '두고애드', chain: 'Marketing', icon: 'i-ad',
    defLabel: '퍼포먼스 마케팅', def: '네이버·쿠팡을 중심으로 브랜드를 더 멀리 알립니다.',
    role: '브랜드가 필요한 고객에게 닿도록 광고를 기획하고 운영합니다.',
    services: ['네이버·쿠팡 중심 광고 운영', '광고 소재 기획', '성과 분석'],
    targets: ['온라인으로 판매 중인 브랜드·셀러'],
    cta: { label: '광고 상담하기', href: 'contact.html?type=ad' },
    site: { label: '두고애드 사이트', pending: '두고애드 사이트' },
    narration: '각자의 가능성이, 필요한 사람에게 닿도록.',
    op: '17%', frame: { vs: 1.2, vx: '0%', vy: '50%', q: 'right' }, still: [960, 540],
    heroAlt: { label: '운영 채널 보기', href: '#related' },
    facts: [['운영 채널', '네이버 · 쿠팡 중심'], ['연계할 수 있는 사업', '커머스 · 미디어']],
    svcHead: '두고애드가 하는 일',
    svcLead: '판매가 일어나는 채널을 중심으로 광고를 기획하고, 결과를 다음 운영에 반영합니다.',
    detail: [
      { icon: 's-target', name: '네이버·쿠팡 중심 광고 운영', desc: '고객이 상품을 찾고 구매하는 채널을 중심으로 광고를 설정하고 꾸준히 관리합니다.' },
      { icon: 's-pen', name: '광고 소재 기획', desc: '상품의 강점이 한눈에 보이도록 광고 문구와 이미지·영상 소재를 기획합니다.' },
      { icon: 's-chart', name: '성과 분석', desc: '광고 결과를 정리해 무엇이 효과가 있었는지 확인하고, 다음 운영에 반영합니다.' },
    ],
    scenes: [{ src: 'assets/img/biz/ad-scene.webp', w: 579, h: 435, alt: '광고 성과 그래프가 띄워진 화면을 함께 보는 마케팅 현장 예시 이미지' }],
    photoPlan: ['캠페인 소재', '운영 채널 화면', '공개 가능한 범위의 성과 리포트'],
    sceneLead: '실제 캠페인 소재와 운영 화면을 공개 가능한 범위에서 소개할 예정입니다.',
    relNav: '운영 채널',
    leaderTask: '네이버·쿠팡 중심 광고 운영, 광고 소재 기획과 성과 분석',
  },
  {
    slug: 'food', num: '06', area: '유통', en: 'DOOGO FOOD', ko: '두고푸드', chain: 'Sales', icon: 'i-food',
    defLabel: '식품 유통', def: '대한민국 농수산물과 건강식품을 연결하여 좋은 먹거리를 전합니다.',
    role: '농수산물과 가공식품, 건강식품의 공급사와 판매자를 연결합니다.',
    services: ['식품 전문 도매 플랫폼 ‘DOOGO MARKET’', '상품 공급', '판매자 협력'],
    targets: ['식품 공급사(생산자·제조사)', '온라인 위탁 판매자'],
    cta: { label: '도매 플랫폼 보기', ext: MARKET_URL },
    site: { label: 'DOOGO MARKET 바로가기', ext: MARKET_URL },
    narration: '좋은 먹거리도, 정성을 담아 일상으로.',
    op: '79%', frame: { vs: 1.2, vx: '100%', vy: '55%' }, still: [960, 540],
    facts: [['대표 서비스', '식품 도매 플랫폼 ‘DOOGO MARKET’'], ['연결 대상', '공급사 · 위탁 판매자']],
    svcHead: '두고푸드가 하는 일',
    svcLead: '식품 공급사와 판매자가 한곳에서 만나도록, 도매 플랫폼과 상품 공급·판매자 협력을 연결합니다.',
    detail: [
      { icon: 's-store', name: '도매 플랫폼 ‘DOOGO MARKET’', desc: '위탁셀러와 공급사를 잇는 식품 전문 B2B 도매 플랫폼을 운영합니다.' },
      { icon: 's-truck', name: '상품 공급', desc: '농수산물·가공식품·건강식품 공급사의 상품을 모아 판매자에게 공급합니다.' },
      { icon: 'i-partner', name: '판매자 협력', desc: '온라인 위탁 판매자가 좋은 식품을 찾아 판매할 수 있도록 상품 정보와 판매를 함께 돕습니다.' },
    ],
    scenes: [{ src: 'assets/img/biz/food-scene.webp', w: 603, h: 720, alt: '신선 식품이 진열된 매장과 배송 트럭이 보이는 식품 유통 예시 이미지' }],
    photoPlan: ['산지와 상품', '공급사·판매자 연결 현장', 'DOOGO MARKET 화면'],
    sceneLead: '산지와 상품, 공급사와 판매자가 만나는 현장을 실제 사진으로 담을 예정입니다.',
    relNav: 'DOOGO MARKET',
    leaderTask: '식품 도매 플랫폼 DOOGO MARKET 운영, 공급사와 판매자 연결',
  },
  {
    slug: 'space', num: '07', area: '공간', en: 'DOOGO SPACE', ko: '두고스페이스', chain: 'Space', icon: 'i-space',
    defLabel: '공간 & 숙박', def: '공유오피스·비상주 사무실 그리고 NORA STAY를 통한 숙박 사업까지, 사람과 비즈니스를 위한 공간을 만듭니다.',
    role: '함께 일하고 배우며, 쉬어갈 수 있는 공간을 만듭니다.',
    services: ['공유오피스', '비상주 사무실', '교육장 대여', '숙박 ‘NORA STAY’'],
    targets: ['작은 팀·1인 사업자', '교육·행사 주최자', '여행·출장객'],
    cta: { label: '공간 알아보기', href: 'contact.html?type=space' },
    site: { label: 'NORA STAY 바로가기', pending: 'NORA STAY 사이트' },
    narration: '함께 일하고, 잠시 쉬어갈 자리까지.',
    op: '86%', frame: { vs: 1.2, vx: '100%', vy: '50%' }, still: [960, 540],
    heroAlt: { label: '공간 둘러보기', href: '#related' },
    facts: [['대표 서비스', '공유오피스 · 비상주 · 교육장'], ['숙박', 'NORA STAY']],
    svcHead: '두고스페이스가 하는 일',
    svcLead: '일하고, 배우고, 쉬어가는 데 필요한 공간을 목적에 맞게 제공합니다.',
    detail: [
      { icon: 's-desk', name: '공유오피스', desc: '작은 팀과 1인 사업자가 필요한 만큼 자리를 쓰며 함께 일하는 업무 공간입니다.' },
      { icon: 's-address', name: '비상주 사무실', desc: '상주하지 않아도 사업장 주소가 필요한 사업자를 위한 비상주 사무실 서비스입니다.' },
      { icon: 's-classroom', name: '교육장 대여', desc: '강의·워크숍·모임을 위한 교육장을 대여하며, 두고캠퍼스 수업 공간으로도 연계합니다.' },
      { icon: 's-bed', name: '숙박 ‘NORA STAY’', desc: '여행과 출장 중 편하게 쉬어갈 수 있는 숙박 서비스 NORA STAY를 함께 운영합니다.' },
    ],
    scenes: [
      { src: 'assets/img/biz/stay-scene.webp', w: 630, h: 420, alt: '바다가 보이는 NORA STAY 객실 예시 이미지' },
      { src: 'assets/img/biz/space-scene.webp', w: 630, h: 255, alt: '책상과 의자가 놓인 밝은 공유오피스 예시 이미지' },
    ],
    photoPlan: ['공유오피스·비상주 공간', '교육장', 'NORA STAY 객실'],
    sceneLead: '실제 시설과 사용하는 모습을 공간별 사진으로 소개할 예정입니다.',
    relNav: '공간 안내',
    leaderTask: '공유오피스·비상주 사무실·교육장 운영, 숙박 ‘NORA STAY’',
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

function head({ title, desc, css }) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
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
      <p class="lead" data-reveal style="--d:.1s">제조·브랜드·콘텐츠·광고·유통·교육·공간, 그리고 그룹 제휴까지 하나의 창구로 접수합니다.</p>
      <div class="cta-chips" data-reveal style="--d:.15s">
        <a href="contact.html?type=campus">교육</a><a href="contact.html?type=bio">제조</a><a href="contact.html?type=commerce">커머스</a><a href="contact.html?type=media">미디어</a><a href="contact.html?type=ad">광고</a><a href="contact.html?type=food">유통</a><a href="contact.html?type=space">공간</a><a href="contact.html?type=partner">그룹 제휴</a>
      </div>
      <div class="cta-band-actions" data-reveal style="--d:.2s">
        <a class="btn btn--primary btn--lg" href="contact.html">사업 상담하기 ${ARROW}</a>
        <a class="btn btn--ghost btn--lg" href="contact.html?type=partner">제휴 제안하기</a>
      </div>
    </div>
  </section>`;

// 버튼/링크: {href} 내부, {ext} 외부(새 창), {pending} 준비 중
function action(a, cls, opts = {}) {
  const label = opts.label || a.label;
  const extra = opts.sr ? `<span class="sr-only">${opts.sr}</span>` : '';
  if (a.ext) return `<a class="${cls}" href="${a.ext}" target="_blank" rel="noopener">${label} ${ARROW_UR}${NEWWIN}</a>`;
  if (a.pending) return `<a class="${cls}" href="#" data-pending="${a.pending}">${label}${extra}</a>`;
  return `<a class="${cls}" href="${a.href}">${label}${opts.arrow ? ' ' + ARROW : ''}${extra}</a>`;
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

  const cards = BIZ.map((b, i) => `      <article class="bz-card${b.key ? ' is-key' : ''}" id="${b.slug}" aria-labelledby="bz-t-${b.slug}" style="--op:${b.op}">
        <a class="bz-media" href="business-${b.slug}.html" tabindex="-1" aria-hidden="true" data-reveal="scale">
          <span class="bz-media-inner" data-parallax>
            <video data-autoplay muted loop playsinline preload="none" data-poster="assets/video/biz-${b.slug}.webp"><source src="assets/video/biz-${b.slug}.mp4" type="video/mp4"></video>
          </span>
          <span class="bz-media-tag"><span class="en">${b.num}</span>${b.area}</span>
          <span class="bz-media-quote">“${b.narration}”</span>
          <span class="bz-cursor"><span class="bz-cursor-in"><span class="en">VIEW</span>${ico('i-arrow-ur', '')}</span></span>
        </a>
        <div class="bz-body">
          <div class="bz-top" data-reveal>
            <span class="bz-num en" aria-hidden="true">${b.num}</span>
            <span class="bz-stage en">${b.chain}</span>
            ${b.key ? '<span class="bz-key">그룹 주요 사업</span>' : ''}
          </div>
          <h3 class="bz-title" id="bz-t-${b.slug}" data-reveal style="--d:.05s"><span class="bz-area">${b.area}</span><span class="bz-brand"><span class="en">${b.en}</span><span class="bz-brand-ko">${b.ko}</span></span></h3>
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
      </article>`).join('\n\n');

  const main = `  <!-- 1. 첫 화면 -->
  <section class="page-hero page-hero--navy bz-hero" aria-labelledby="bz-title" data-video-wrap>
    <div class="bz-hero-media" aria-hidden="true">
      <video id="bz-hero-video" data-autoplay muted loop playsinline preload="metadata" poster="assets/video/hero-poster.webp"><source src="assets/video/hero-loop.mp4" type="video/mp4"></video>
      <div class="bz-hero-swap"></div>
    </div>
    <div class="bz-hero-shade" aria-hidden="true"></div>
    <div class="container bz-hero-inner">
      <nav aria-label="현재 위치"><ol class="breadcrumb"><li><a href="index.html">홈</a></li><li aria-current="page">사업영역</li></ol></nav>
      <span class="eyebrow" data-reveal="fade">Our Business</span>
      <h1 class="display bz-hero-title" id="bz-title" data-lines><span class="line"><span>배우고, 만들고,</span></span><span class="line"><span class="accent">키우고.</span></span></h1>
      <p class="lead bz-hero-lead" data-reveal style="--d:.25s">제품을 만드는 일부터 사람을 키우는 일까지.<br class="hide-mobile"> 두고그룹의 7개 사업이 성장의 다음 단계를 함께 만듭니다.</p>
      <div class="bz-hero-foot" data-reveal style="--d:.35s">
        <div class="bz-jump-head">
          <p class="bz-jump-label"><span class="en">7 Businesses</span>사업 바로가기</p>
          <button class="bz-vtoggle" type="button" data-video-toggle="#bz-hero-video" aria-label="배경 영상 정지">${pauseIcons}</button>
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
        <p class="lead" data-reveal style="--d:.15s">사업마다 하는 일과 주요 서비스, 함께하면 좋은 분을 정리했습니다. 자세히 보기에서 사업별 상세를, 옆 버튼에서 바로 상담이나 서비스로 이어집니다.</p>
      </div>

      <div class="bz-cards">
${cards}
      </div>
    </div>
  </section>

${CTA_BAND}`;

  return shell({
    title: '사업영역',
    desc: '배우고, 만들고, 키우고. 교육·제조·커머스·미디어·광고·유통·공간, 두고그룹의 7개 사업을 한 번에 소개합니다.',
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
      { name: '문대표', sub: '문원오 · 그룹 대표', course: '뉴질랜드 건기식 브랜딩', len: '5주 과정', photo: 'assets/img/people/moon-wonoh.webp' },
      { name: '로직메이커', course: '실전 클래스', len: '4주 과정', initial: '로' },
      { name: '황금농부', course: '실전 클래스', len: '4주 과정', initial: '황' },
      { name: '초이', course: '실전 클래스', len: '4주 과정', initial: '초' },
    ];
    return `      <div class="dt-rel-head">
        <div>
          <span class="eyebrow" data-reveal="fade">Online Class</span>
          <h2 class="h2" id="rel-title" data-lines style="margin-top:20px"><span class="line"><span>온라인 클래스</span></span><span class="line"><span class="accent">‘두고클래스’</span></span></h2>
        </div>
        <div class="dt-rel-side" data-reveal style="--d:.15s">
          <p class="lead">현장에서 쌓은 경험을 강의로 나눕니다. 두고클래스에서 실전 클래스와 과정별 강사를 만날 수 있고, 오프라인 수업은 두고스페이스 교육장과 연계해 진행합니다.</p>
          <div class="dt-rel-actions">
            <a class="btn btn--white" href="#" data-pending="두고클래스 사이트">두고클래스 바로가기</a>
            <a class="btn btn--ghost" href="business-space.html">교육장 알아보기 ${ARROW}</a>
          </div>
        </div>
      </div>
      <ul class="dt-people">
${people.map((p, i) => `        <li class="dt-person${p.photo ? ' has-photo' : ''}" data-reveal style="--d:${(i * 0.08).toFixed(2)}s">
          <div class="dt-person-photo">
            ${p.photo ? `<img src="${p.photo}" alt="${p.name}(${p.sub}) 프로필 사진" width="627" height="694" loading="lazy">` : `<span class="dt-avatar" aria-hidden="true">${p.initial}</span>`}
            <span class="dt-person-len">${p.len}</span>
          </div>
          <div class="dt-person-body">
            <p class="dt-person-course">${p.course}</p>
            <h3 class="dt-person-name">${p.name}</h3>
            ${p.sub ? `<p class="dt-person-sub">${p.sub}</p>` : '<p class="dt-person-sub">두고클래스 강사</p>'}
          </div>
        </li>`).join('\n')}
      </ul>
      <p class="dt-rel-note" data-reveal>강사·과정 정보는 두고클래스 강사 소개 화면을 기준으로 정리했습니다. 세부 일정과 신청은 두고클래스에서 안내합니다.</p>`;
  },
  bio: () => steps({
    eyebrow: 'DOOGO CONNECT', h2: ['제조 상담·연결 서비스', '<span class="accent">‘두고커넥트’</span>'],
    lead: '무엇부터 준비해야 할지 막막할 때, 두고커넥트가 상담부터 제품 개발, 소량 제조와 패키지까지 필요한 과정을 이어 줍니다.',
    actions: `<a class="btn btn--white" href="contact.html?type=bio">두고커넥트 상담 신청 ${ARROW}</a>`,
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
    actions: `<a class="btn btn--white" href="brands.html#brands">운영 브랜드 보기 ${ARROW}</a>`,
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
        <li class="dt-channel dt-channel--note" data-reveal style="--d:.16s"><p>운영 채널은 네이버·쿠팡 중심입니다.</p></li>
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
          <span class="eyebrow" data-reveal="fade">DOOGO MARKET</span>
          <h2 class="h2" id="rel-title" data-lines style="margin-top:20px"><span class="line"><span>위탁셀러와 공급사를 잇는</span></span><span class="line"><span class="accent">식품 전문 도매 플랫폼</span></span></h2>
        </div>
        <div class="dt-rel-side" data-reveal style="--d:.15s">
          <p class="lead">DOOGO MARKET(두고마켓)은 농수산물·가공식품·건강식품 공급사와 온라인 위탁 판매자를 연결하는 B2B 도매 플랫폼입니다.</p>
          <div class="dt-rel-actions"><a class="btn btn--primary" href="${MARKET_URL}" target="_blank" rel="noopener">DOOGO MARKET 바로가기 ${ARROW_UR}${NEWWIN}</a></div>
        </div>
      </div>
      <div class="dt-paths">
        <article class="dt-path" data-reveal="left">
          <span class="dt-path-ico">${ico('s-seed', '')}</span>
          <p class="dt-path-en en">Supplier</p>
          <h3 class="dt-path-title">공급사</h3>
          <p class="dt-path-who">생산자 · 제조사</p>
          <p class="dt-path-desc">농수산물과 가공식품, 건강식품을 판매자에게 소개하고 온라인 판로를 넓힙니다.</p>
          <a class="link-arrow" href="contact.html?type=food">공급 문의하기 ${ARROW}</a>
        </article>
        <div class="dt-path-hub" data-reveal="scale" aria-hidden="true">
          <span class="dt-hub-line"></span>
          <span class="dt-hub-core"><span class="en">DOOGO</span><span class="en">MARKET</span></span>
          <span class="dt-hub-line"></span>
        </div>
        <article class="dt-path" data-reveal="right">
          <span class="dt-path-ico">${ico('i-partner', '')}</span>
          <p class="dt-path-en en">Seller</p>
          <h3 class="dt-path-title">판매자</h3>
          <p class="dt-path-who">온라인 위탁 판매자</p>
          <p class="dt-path-desc">직접 재고를 두지 않는 위탁 방식으로, 판매할 식품 상품을 찾고 거래를 시작합니다.</p>
          <a class="link-arrow" href="${MARKET_URL}" target="_blank" rel="noopener">플랫폼에서 상품 찾기 ${ARROW_UR}${NEWWIN}</a>
        </article>
      </div>`,
  space: () => {
    // 2) 주요 서비스 카드와 겹치지 않게: 공간별 '이런 분께'와 연결 정보를 큰 번호 목록으로, NORA STAY는 사진 카드로
    const spaces = [
      { en: 'Shared Office', ko: '공유오피스', use: '필요한 만큼 자리를 쓰며 함께 일하는 업무 공간', who: '작은 팀 · 1인 사업자' },
      { en: 'Virtual Office', ko: '비상주 사무실', use: '상주하지 않아도 사업장 주소가 필요할 때', who: '1인 사업자' },
      { en: 'Classroom', ko: '교육장', use: '강의·워크숍·모임 공간', who: '교육 · 행사 주최자', link: ['business-campus.html', '두고캠퍼스 수업과 연계'] },
    ];
    return `      <div class="dt-rel-head">
        <div>
          <span class="eyebrow" data-reveal="fade">Spaces</span>
          <h2 class="h2" id="rel-title" data-lines style="margin-top:20px"><span class="line"><span>일하고, 배우고, 쉬어가는</span></span><span class="line"><span>네 가지 공간</span></span></h2>
        </div>
        <div class="dt-rel-side" data-reveal style="--d:.15s">
          <p class="lead">목적에 맞는 공간을 고를 수 있도록 공유오피스·비상주 사무실·교육장, 그리고 숙박 <span class="nowrap">NORA STAY</span>를 함께 운영합니다.</p>
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
        <div class="dt-stay-media media-cover">
          <img src="assets/img/biz/stay-scene.webp" alt="바다가 보이는 NORA STAY 객실 예시 이미지" width="630" height="420" loading="lazy">
          <span class="dt-stay-badge">이미지 예시</span>
        </div>
        <div class="dt-stay-body">
          <span class="dt-row-num en">04</span>
          <p class="dt-stay-en en">Stay</p>
          <h3 class="dt-stay-title"><span class="en nowrap">NORA STAY</span> 숙박</h3>
          <p class="dt-stay-desc">여행과 출장 중에 편하게 쉬어갈 수 있는 두고스페이스의 숙박 서비스입니다. 일하는 공간에서 쉬는 공간까지, 머무는 시간 전체를 함께 준비합니다.</p>
          <p class="dt-stay-for"><span>이런 분께</span>여행객 · 출장객</p>
          <a class="btn btn--white btn--sm" href="#" data-pending="NORA STAY 사이트">NORA STAY 바로가기</a>
        </div>
      </article>`;
  },
};

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

  // 히어로 두 번째 버튼: 서비스 CTA가 '문의하기'와 같은 주소면 페이지 안 관련 구간으로 보냄
  const heroSecond = (b.cta.href === `contact.html?type=${b.slug}` && b.heroAlt)
    ? `<a class="btn btn--line btn--lg" href="${b.heroAlt.href}">${b.heroAlt.label} ${DOWN}</a>`
    : action(b.cta, 'btn btn--line btn--lg');
  const fr = b.frame || {};
  const frameStyle = `--op:${b.op};--vs:${fr.vs || 1};--vx:${fr.vx || '50%'};--vy:${fr.vy || '50%'}`;

  // 현장 사진: 원본 비율(--ar)·원본 폭(--w)을 넘겨, 화면에서 원본보다 크게 늘어나지 않도록 CSS에서 제한
  const sceneFigs = b.scenes.map((s, i) => `        <figure class="dt-shot dt-shot--scene" data-reveal style="--d:${(i * 0.08).toFixed(2)}s;--ar:${s.w}/${s.h};--w:${s.w}px">
          <div class="media-cover"><img src="${s.src}" alt="${s.alt}" width="${s.w}" height="${s.h}" loading="lazy"></div>
          <figcaption><span class="badge-sample">이미지 예시</span> 실제 현장 사진으로 교체 예정</figcaption>
        </figure>`).join('\n');

  const main = `${SPRITE}

  <!-- 1. 첫 화면 -->
  <section class="page-hero dt-hero" aria-labelledby="dt-title">
    <div class="dt-hero-glow" aria-hidden="true"></div>
    <div class="container">
      <nav aria-label="현재 위치"><ol class="breadcrumb"><li><a href="index.html">홈</a></li><li><a href="business.html">사업영역</a></li><li aria-current="page">${b.area}</li></ol></nav>
      <span class="eyebrow" data-reveal="fade">${b.num} · ${b.chain}</span>
      <h1 class="dt-title" id="dt-title" data-lines><span class="line"><span class="en">${b.en}</span></span></h1>
      <div class="dt-hero-grid">
        <div class="dt-hero-copy">
          <p class="dt-sub" data-reveal style="--d:.15s"><span class="dt-sub-ico">${ico(b.icon, '')}</span><span>${b.ko}</span><i aria-hidden="true"></i><span>${b.area}</span>${b.key ? '<span class="dt-key">그룹 주요 사업</span>' : ''}</p>
          <p class="dt-role" data-reveal style="--d:.2s">${b.role}</p>
        </div>
        <div class="dt-hero-actions" data-reveal style="--d:.28s">
          <a class="btn btn--primary btn--lg" href="contact.html?type=${b.slug}">문의하기 ${ARROW}</a>
          ${heroSecond}
        </div>
      </div>
    </div>
    <div class="container dt-frame-wrap">
      <figure class="dt-frame${fr.q === 'right' ? ' is-q-right' : ''}" data-video-wrap data-reveal="scale" style="${frameStyle}">
        <div class="dt-frame-media" data-parallax>
          <video id="dt-video" data-autoplay muted loop playsinline preload="metadata" poster="assets/video/biz-${b.slug}.webp" aria-hidden="true" tabindex="-1"><source src="assets/video/biz-${b.slug}.mp4" type="video/mp4"></video>
        </div>
        <figcaption class="dt-quote">
          <span class="dt-quote-label en">Group Film · ${b.en}</span>
          <q>${b.narration}</q>
        </figcaption>
        <div class="dt-frame-ctrl">
          <button class="dt-film-btn" type="button" data-film-open><span class="play-ring">${ico('i-play', '')}</span><span>그룹 영상 보기</span></button>
          <button class="dt-vtoggle" type="button" data-video-toggle="#dt-video" aria-label="배경 영상 정지">${pauseIcons}</button>
        </div>
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
    <div class="container"><ul><li><a href="#services">주요 서비스</a></li><li><a href="#scene">현장</a></li><li><a href="#related">${b.relNav}</a></li><li><a href="#leader">담당 대표</a></li><li><a href="#inquiry">문의</a></li></ul></div>
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
        <a class="btn btn--dark btn--sm dt-for-cta" href="contact.html?type=${b.slug}">${b.area} 상담 신청 ${ARROW}</a>
      </div>
    </div>
  </section>

  <!-- 3. 현장 -->
  <section class="section section--ivory dt-scene" id="scene" aria-labelledby="scene-title">
    <div class="container">
      <div class="sec-head sec-head--split">
        <div>
          <span class="eyebrow" data-reveal="fade">On Site</span>
          <h2 class="h2" id="scene-title" data-lines style="margin-top:20px"><span class="line"><span>현장에서 보는 ${b.area}</span></span></h2>
        </div>
        <p class="lead" data-reveal style="--d:.15s">${b.sceneLead}</p>
      </div>
      <div class="dt-gallery${b.scenes.length > 1 ? ' has-two' : ''}">
${sceneFigs}
        <figure class="dt-shot dt-shot--film" data-reveal style="--d:.12s">
          <div class="media-cover"><img src="assets/img/biz/still-${b.slug}.webp" alt="그룹 영상 속 ${b.en} 건물을 가까이에서 본 장면" width="${b.still[0]}" height="${b.still[1]}" loading="lazy"></div>
          <figcaption><span class="en">Group Film</span> 그룹 영상 속 ${b.en}</figcaption>
          <button class="dt-shot-play" type="button" data-film-open aria-label="그룹 영상 보기">${ico('i-play', '')}</button>
        </figure>
        <div class="dt-plan dt-plan--wide" data-reveal style="--d:.18s">
          <p class="dt-plan-label"><span class="badge-sample">준비 중</span> 이곳에 담길 사진</p>
          <ol class="dt-plan-list">
${b.photoPlan.map((p, i) => `            <li><span class="en">${String(i + 1).padStart(2, '0')}</span>${p}</li>`).join('\n')}
          </ol>
          <p class="note">이미지 예시 · 실제 현장 사진으로 교체 예정</p>
        </div>
      </div>
    </div>
  </section>

  <!-- 4. 관련 브랜드·프로젝트 -->
  <section class="section section--navy dt-rel dt-rel--${b.slug}" id="related" aria-labelledby="rel-title">
    <div class="container">
${REL[b.slug]()}
    </div>
  </section>

  <!-- 5. 담당 대표 -->
  <section class="section dt-leader" id="leader" aria-labelledby="leader-title">
    <div class="container dt-leader-grid">
      <div class="dt-leader-head">
        <span class="eyebrow" data-reveal="fade">Leader</span>
        <h2 class="h2" id="leader-title" data-lines style="margin-top:20px"><span class="line"><span>이 사업을</span></span><span class="line"><span>이끄는 사람</span></span></h2>
        <p class="lead" data-reveal style="--d:.15s">담당 대표의 이름·직함·사진은 공식 자료가 확정되는 대로 게시합니다.</p>
        <a class="link-arrow" href="leadership.html#leaders" data-reveal style="--d:.2s">사업을 이끄는 사람들 전체 보기 ${ico('i-arrow')}</a>
      </div>
      <article class="dt-leader-card" data-reveal="scale" aria-labelledby="leader-name">
        <div class="dt-leader-photo">
          <span class="dt-leader-num en" aria-hidden="true">${b.num}</span>
          ${ico(b.icon, 'dt-leader-ico')}
          ${SIL}
          <span class="dt-leader-badge"><i aria-hidden="true"></i>프로필 준비 중</span>
        </div>
        <div class="dt-leader-body">
          <p class="dt-leader-area">${b.area} <span class="en">${b.en}</span></p>
          <h3 class="dt-leader-name" id="leader-name">${b.area} 사업 담당 대표</h3>
          <p class="dt-leader-status">대표자 프로필 준비 중</p>
          <dl class="dt-leader-dl">
            <div><dt>담당 영역</dt><dd>${b.area} · ${b.ko}</dd></div>
            <div><dt>핵심 업무</dt><dd>${b.leaderTask}</dd></div>
          </dl>
          <a class="btn btn--line btn--sm" href="leadership.html#leaders">리더십 페이지에서 보기 ${ARROW}</a>
        </div>
      </article>
    </div>
  </section>

  <!-- 6. 마무리: 문의 · 이전/다음 · 다른 사업 -->
  <section class="section section--ivory dt-close" id="inquiry" aria-labelledby="ask-title">
    <div class="container">
      <div class="dt-ask" data-reveal>
        <div class="dt-ask-copy">
          <span class="eyebrow">Inquiry · ${b.area}</span>
          <h2 class="dt-ask-title" id="ask-title">${b.ko}와 함께할<br> 일을 알려 주세요.</h2>
          <p class="dt-ask-desc">문의 분야가 ‘${b.area}’로 선택된 상태로 접수 화면이 열립니다. 담당자가 확인한 뒤 남겨 주신 연락처로 회신합니다.</p>
        </div>
        <div class="dt-ask-actions">
          <a class="btn btn--white btn--lg" href="contact.html?type=${b.slug}">${b.area} 문의하기 ${ARROW}</a>
          ${action(b.site, 'btn btn--ghost btn--lg')}
        </div>
      </div>

      <nav class="dt-pager" aria-label="이전·다음 사업">
        <a class="dt-pager-card is-prev" href="business-${prev.slug}.html" data-reveal="left">
          <span class="dt-pager-media"><img src="assets/img/biz/thumb-${prev.slug}.webp" alt="" width="480" height="270" loading="lazy"></span>
          <span class="dt-pager-body">
            <span class="dt-pager-dir">${ico('i-arrow')}이전 사업</span>
            <span class="dt-pager-name"><span class="en">${prev.num}</span>${prev.area}</span>
            <span class="dt-pager-brand en">${prev.en}</span>
          </span>
        </a>
        <a class="dt-pager-card is-next" href="business-${next.slug}.html" data-reveal="right">
          <span class="dt-pager-media"><img src="assets/img/biz/thumb-${next.slug}.webp" alt="" width="480" height="270" loading="lazy"></span>
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
    desc: `${b.ko}(${b.en}) — ${b.role} ${b.defLabel}: ${b.def}`,
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
