/* 두고 클래스 — 강사님을 위한 세일즈 첫 화면 (주소 맨 앞 · #/about · #/partner)
 *
 *  - 이 화면을 보는 사람은 앞으로 두고 클래스를 쓸 ‘강사님’이다. 두고 클래스는 강사님께 플랫폼 이용료를 받고, 수강생은 무료로 쓴다
 *  - 이용료는 수강생 수와 상관없이 같다 (100명이든 500명이든). 금액은 상담 때 안내하므로 화면에 숫자를 적지 않는다
 *  - 강사님이 받는 세 가지: ① 강의 소개 랜딩페이지 ② 무료강의 전자책 ③ 수강생을 케어하는 커리큘럼 · 튜토리얼 시스템
 *  - 수강생도 이 주소로 들어오므로 ‘수강생 로그인’은 위 막대 · 첫 화면 · 마지막 안내에 늘 둔다
 *  - 강사 목록 · 숫자는 지금 운영 중인 강사 데이터에서 바로 가져온다 (꾸며 낸 숫자 없음)
 *  - ‘입점 문의’ 팝업 → 마스터 → 강사 입점 문의에서 관리 (#/partner 로 바로 열 수 있음)
 *  - 바닥의 사업자 정보 · 고객센터는 마스터 → 첫 화면 · 사업자 정보에서 고친다 (채운 칸만 보임)
 *  - PC에서 비어 보이지 않게 내용을 넉넉히: 운영 흐름 · 세 가지(세부 기능 6개씩) · 지금 방식과 비교 · 강사센터 메뉴 전체 · 기수 운영 방식 · 자주 묻는 질문 2단
 *  - 휴대폰 · 브라우저 틀 안은 실제 화면을 녹화한 영상(마우스 커서 · 클릭이 보임, 이름은 OOO). 보일 때만 받아서 재생하고,
 *    수강생 화면 · 강사센터 영상은 한 편을 장(chapter)으로 나눠 탭을 누르면 그 장면으로 넘어간다
 *  - 색 · 글꼴은 여기어때 디자인 시스템처럼: Lively red #F94239 하나 + 무채색 회색, Pretendard (home.css 맨 위)
 */
(function () {
  "use strict";

  const root = document.getElementById("root");
  const { esc } = DB;
  const icon = window.icon;
  const isActive = () => document.body.dataset.mode === "home";
  const IMG = "assets/home/";

  /* ---------- 내용 ---------- */
  const PAINS = [
    ["layers", "자료가 여기저기 흩어져 있어요", "영상은 유튜브, 자료는 단톡방 · 드라이브 · 노션에. 기수가 바뀔 때마다 다시 정리해요."],
    ["activity", "누가 어디까지 했는지 몰라요", "단톡방만으로는 멈춘 수강생을 찾기 어려워요. 결국 열심인 몇 명만 챙기게 돼요."],
    ["message", "같은 질문에 매번 답해요", "서류 · 일정 · 과제 방법… 기수마다 같은 질문이 반복돼요."],
    ["megaphone", "랜딩 · 전자책은 매번 따로", "모집 페이지와 무료강의 전자책을 기수마다 따로 만들고 고쳐요."]
  ];
  const FEATURES = [
    { no: "01", tag: "모집", title: "강의 소개 랜딩페이지", vid: "v-lp", lead: "내 강의를 소개하고 수강 신청까지 받는 세일즈 페이지예요.",
      pts: ["커리큘럼 · 후기 · 강사 소개 · 모집 일정을 한 페이지에", "신청하면 강사센터 ‘수강 신청’으로 바로 들어와요", "문구 · 사진 · 순서를 강사센터에서 직접 고쳐요"],
      more: [["layers", "10가지 구역", "첫 화면 · 강사 소개 · 커리큘럼 · 후기 · 가격 · FAQ를 켜고 끄고 순서까지"], ["phone", "휴대폰에 맞춘 화면", "수강생 대부분이 보는 휴대폰에서 먼저 보기 좋게"],
        ["userPlus", "신청 → 승인 대기", "신청하면 강사센터 ‘승인 대기’에 바로 들어와요"], ["calendar", "모집 일정 자동", "다음 기수 시작일 · 모집 중 표시가 기수에 맞춰"],
        ["image", "사진 · 이력 · 후기", "강사 사진 · 경력 · 수강 후기를 직접 올려요"], ["link", "주소 하나로 홍보", "카카오톡 · 인스타그램 · 유튜브에 링크 하나로"]] },
    { no: "02", tag: "무료 강의", title: "무료강의 전자책", vid: "v-free", lead: "무료 강의 신청자에게 전자책과 실전 자료를 순서대로 열어 주는 페이지예요.",
      pts: ["무료 강의 신청 · 일정 카운트다운 · 신청자 전용 자료", "전자책 · 실전 자료를 하나씩 순서대로 열어 줘요", "무료 강의에서 유료 강의 신청으로 자연스럽게 이어져요"],
      more: [["clock", "강의 카운트다운", "무료 강의까지 남은 일 · 시간 · 분 · 초가 보여요"], ["library", "선물 전자책 순차 공개", "정한 날짜 · 시간에 한 권씩 자동으로 열려요"],
        ["video", "강의 전 영상", "유튜브 영상을 넘겨 보며 강사님을 먼저 만나요"], ["message", "질문 미리 받기", "강의 전에 궁금한 점을 이 페이지에서 모아요"],
        ["headset", "오픈채팅 연결", "카카오톡 오픈채팅방으로 바로 이어져요"], ["store", "유료 강의로 연결", "진행 예정 강의 · 신청 링크로 자연스럽게"]] },
    { no: "03", tag: "수강생 케어", title: "커리큘럼 · 튜토리얼 시스템", vid: "v-care", lead: "1주차부터 수료까지 수강생을 끝까지 케어하는 나만의 강의실이에요.",
      pts: ["주차별 강의 · 과제 · 자동 검수 · 강사 피드백", "진행률 · 수료증 · 24시간 AI 도우미 · 1:1 소통", "강사센터에서 진척도를 보고 코치와 나눠 운영해요"],
      more: [["book", "주차별 커리큘럼", "강의 · 핵심 목표 · 과제 · 자료가 주차별로"], ["checks", "자동 검수", "글자 수 · 키워드 · 링크 · 사진을 바로 확인"],
        ["pen", "강사 · 코치 피드백", "승인하거나 보완할 점을 남기면 바로 보여요"], ["activity", "진행률 · 성장 단계", "씨앗부터 숲까지, 해낸 만큼 자라요"],
        ["award", "수료증", "필수 과제를 마치면 이름이 새겨진 수료증"], ["sparkles", "24시간 AI 도우미", "강사님이 올린 자료로 밤에도 답해요"]] }
  ];
  const STUDENT_TABS = [
    { key: "tutorial", at: 0, ic: "book", title: "주차별 튜토리얼", desc: "이번 주에 볼 강의와 할 과제가 순서대로 정리돼 있어요. 1주차부터 차근차근 따라오고, 다 본 강의는 ‘시청 완료’로 체크해요." },
    { key: "mission", at: 4.97, ic: "checks", title: "과제 제출 · 피드백", desc: "사진 · 링크 · 글로 과제를 내면 자동 검수로 바로 확인하고, 강사님과 코치가 승인하거나 보완할 점을 알려 줘요." },
    { key: "cert", at: 10.55, ic: "award", title: "진행률 · 수료증", desc: "잘 따라가고 있는지 진행률로 바로 보여요. 필수 과제를 모두 통과하면 이름이 새겨진 수료증이 나와요." },
    { key: "bot", at: 13.72, ic: "sparkles", title: "24시간 AI 도우미", desc: "과제 방법 · 서류 · 일정 · 내 진도를 물어보면 강사님이 올린 자료로 바로 답해요. 새벽에도요." },
    { key: "channel", at: 16.93, ic: "message", title: "강사 · 코치 1:1 소통", desc: "막히는 순간 강사님과 코치에게 바로 연결돼요. 카카오톡 채널 · 오픈채팅 등 강사님이 정한 창구로 이어져요." },
    { key: "guide", at: 20.68, ic: "clipboard", title: "실무 가이드", desc: "사업자 등록처럼 강의에 필요한 준비를 단계별로 안내해요. 기관 · 기간 · 서류 · 강사님 팁까지 한 화면에." },
    { key: "library", at: 24.45, ic: "library", title: "유료강의 자료실", desc: "전자책 · 엑셀 양식 · VOD · 기초 가이드 영상까지, 강사님의 노하우가 한 권의 책처럼 정리돼 있어요." },
    { key: "schedule", at: 30.25, ic: "calendar", title: "강의 일정 · 공지", desc: "라이브 · 과제 마감 · 공지를 달력으로 한눈에. 해외에 있는 강사님과도 시간을 헷갈리지 않아요." }
  ];
  const STUDENT_MORE = [
    ["flame", "동기부여 채널", "지칠 때 다시 힘을 주는 영상"],
    ["handshake", "제휴 혜택", "수강생 전용 할인 · 혜택"],
    ["sprout", "시작 가이드", "처음 들어와도 할 일이 보이게"],
    ["help", "요청사항 · Q&A", "불편한 점은 바로 강사님께"],
    ["phone", "휴대폰 · PC", "어디서든 같은 내 강의실"],
    ["shieldCheck", "승인제 입장", "승인된 수강생만 들어와요"]
  ];
  // 강사센터는 핵심 화면 세 개만 보여 준다 (메뉴 전체는 공개하지 않음)
  const ADMIN_TABS = [
    { key: "dash", at: 0, title: "대시보드" },
    { key: "students", at: 9.84, title: "수강생 승인 · 진척도" },
    { key: "review", at: 19.9, title: "과제 검수" }
  ];
  const ADMIN_FEATURES = [
    ["palette", "내 이름의 강의 플랫폼", "강의 이름 · 색상 · 메뉴 · 로그인 화면까지 강사님 브랜드로 운영해요."],
    ["layers", "커리큘럼 · 과제 직접 편집", "주차 · 강의 · 과제 · 엑셀 양식을 직접 고치고, 기수마다 다른 커리큘럼도 써요."],
    ["activity", "수강생 진척도 한눈에", "누가 어디까지 했는지, 누가 멈춰 있는지 보여서 먼저 챙길 수 있어요."],
    ["checks", "과제 검수 · 일괄 승인", "자동 검수 결과를 보고 한 번에 승인하거나 보완을 요청해요."],
    ["users", "코치와 함께 운영", "코치 계정에 필요한 메뉴만 열어 주고 검수 · 답변을 나눠요."],
    ["userPlus", "승인제 수강생 관리", "신청을 확인하고 승인한 사람만 들어와요. 기수별로 관리해요."],
    ["megaphone", "랜딩 · 무료강의 페이지 편집", "강의 소개 페이지와 무료강의 전자책 페이지를 직접 고쳐요."],
    ["refresh", "끝난 기수에게도 계속", "새 영상 · 자료를 올리면 이전 기수도 함께 보고 다시 찾아와요."]
  ];
  // 한 기수 운영 흐름 (어느 화면이 맡는지)
  const FLOW = [
    ["store", "모집", "강의 소개 랜딩페이지", "커리큘럼 · 후기 · 일정으로 모집"],
    ["video", "무료 강의", "무료강의 전자책", "카운트다운 · 선물 전자책으로 신청자 모으기"],
    ["userPlus", "신청 · 승인", "강사센터", "신청을 확인하고 승인한 사람만 입장"],
    ["book", "주차별 학습", "튜토리얼 강의실", "1주차부터 강의 · 과제를 순서대로"],
    ["checks", "과제 · 피드백", "강사센터 · 코치", "자동 검수 + 강사 · 코치 피드백"],
    ["award", "수료", "튜토리얼 강의실", "필수 과제를 마치면 수료증"],
    ["refresh", "다음 기수", "강사센터", "커리큘럼 그대로, 다음 기수 바로 시작"]
  ];
  // 단톡방 · 드라이브로 운영할 때와 비교
  const COMPARE = [
    ["강의 자료", "유튜브 · 드라이브 · 단톡방 · 노션에 흩어져 있어요", "주차별 강의실 한곳에 순서대로 정리돼요"],
    ["진도 확인", "누가 어디까지 했는지 일일이 물어봐야 해요", "수강생별 진행률 · 성장 단계가 한눈에 보여요"],
    ["과제 검수", "사진 · 링크를 단톡방에서 하나씩 찾아 확인해요", "자동 검수 뒤 승인 · 보완 요청을 한 번에 해요"],
    ["반복 질문", "같은 질문에 기수마다 다시 답해요", "AI 도우미 · Q&A · 실무 가이드가 먼저 답해요"],
    ["모집 · 무료 강의", "랜딩 · 전자책을 기수마다 따로 만들고 고쳐요", "강사센터에서 고치면 바로 반영돼요"],
    ["운영 인력", "강사님 혼자, 또는 단톡방 관리자 한 명", "코치 계정에 필요한 메뉴만 나눠 맡겨요"],
    ["수료 후", "단톡방이 닫히면 수강생과의 연결도 끝나요", "강의실이 남아 새 자료로 계속 이어져요"],
    ["수강생이 늘면", "관리할 일이 그만큼 함께 늘어요", "같은 이용료 · 같은 운영 방식 그대로예요"]
  ];
  // 강사센터에서 직접 고치는 메뉴 (실제 강사센터 메뉴 그대로)
  const ADMIN_MENUS = [
    ["운영", ["대시보드", "수강생 관리", "기수 관리", "다음 기수 신청", "과제 검수", "요청사항 답변", "코치 관리"]],
    ["수강생 화면 콘텐츠", ["기본 정보 · 색상 · AI봇", "메뉴 구성", "시작 가이드", "커리큘럼", "과제", "강의 일정", "공지사항", "Q&A", "서류 준비 가이드", "유료강의 자료실", "동기부여", "1:1 소통채널", "제휴채널"]],
    ["홍보", ["강의 소개 랜딩페이지", "무료강의 전자책 페이지", "받은 질문 모아보기"]]
  ];
  // 기수 운영 방식 (강사센터 ‘다음 기수 신청’과 같은 흐름)
  const COHORT = [
    ["handshake", "1기 입점", "상담 뒤 플랫폼을 세팅하고 첫 기수를 열어요"],
    ["send", "다음 기수 신청", "강사센터에서 기수 · 시작일 · 연락처를 남겨요"],
    ["file", "입금 · 세금계산서", "무통장 입금을 확인하고 세금계산서를 발행해요"],
    ["layers", "기수 오픈", "두고 클래스가 기수를 열면, 그다음은 강사님이 자유롭게"]
  ];
  const STEPS = [
    ["입점 문의", "팝업으로 강의 정보를 남겨 주세요."],
    ["상담 · 자료 정리", "강의 방식 · 커리큘럼 · 자료를 함께 정리해요."],
    ["플랫폼 세팅", "내 이름 · 색상 · 랜딩 · 전자책 · 커리큘럼을 세팅해요."],
    ["수강생 초대", "수강 신청을 승인하면 바로 로그인해요."],
    ["기수 운영", "진척도 · 과제 · 질문을 강사센터에서 관리해요."]
  ];
  const FAQS = [
    ["이용료는 어떻게 되나요?", "수강생 수와 상관없이 강사님 한 분당 정해진 이용료예요. 수강생은 모두 무료로 써요. 정확한 금액은 강의 규모와 필요한 세팅을 듣고 입점 상담 때 안내해 드려요.", true],
    ["수강생이 많아지면 비용이 늘어나나요?", "아니요. 수강생이 100명이든 500명이든, 기수를 몇 번 열든 이용료는 같아요."],
    ["지금 쓰는 강의 자료를 옮길 수 있나요?", "네. 강의 영상(유튜브 링크) · 전자책 · 엑셀 양식 · 과제를 강사센터에서 올리면 돼요. 처음 세팅은 두고 클래스가 함께 도와드려요."],
    ["내 브랜드로 운영할 수 있나요?", "강의 이름 · 색상 · 메뉴 · 로그인 화면 · 강의 소개 페이지까지 강사님 브랜드로 운영해요. 수강생에게는 강사님의 강의 플랫폼으로 보여요."],
    ["코치(조교)와 같이 운영할 수 있나요?", "코치 계정을 만들고 필요한 메뉴만 열어 줄 수 있어요. 과제 검수 · 질문 답변을 나눠서 해요."],
    ["끝난 기수는 어떻게 되나요?", "수료한 뒤에도 강의실은 그대로 남아요. 새 자료를 올리면 이전 기수도 함께 보고, 그 연결이 다음 기수 모집으로 이어져요."],
    ["수강생은 어떻게 로그인하나요?", "회원가입 없이 강사를 고르고 이름과 휴대폰 뒷자리 4자리로 들어와요. 강사님이 승인한 수강생만 들어올 수 있어요."],
    ["다음 기수는 어떻게 여나요?", "강사센터 ‘다음 기수 신청’에 기수 · 시작 예정일 · 연락처를 남기면 담당자가 연락드려요. 입금 확인과 세금계산서 발행이 끝나면 기수를 열어 드리고, 그다음은 강사님이 자유롭게 고쳐요."],
    ["결제는 어떻게 하나요?", "지금은 무통장 입금으로 받고, 입금이 확인되면 세금계산서를 발행해 드려요."],
    ["입점하면 언제부터 쓸 수 있나요?", "강의 자료가 준비돼 있다면 상담 뒤 바로 세팅을 시작해요. 다음 기수 시작일에 맞춰 준비를 마칠 수 있게 일정을 함께 잡아요."]
  ];

  /* ---------- 데이터 (지금 운영 중인 강사) ---------- */
  function classes() {
    return DB.activeInstructors().map((x) => {
      const c = DB.content(x.id) || {};
      const b = c.brand || {};
      const t = DB.themeOf(b.theme);
      const weeks = c.weeks || [];
      const L = DB.landingOf ? DB.landingOf(x.id) : null;
      const F = DB.freeOf ? DB.freeOf(x.id) : null;
      const ct = (L && L.contact) || {};
      return {
        id: x.id, name: b.name || x.displayName, who: b.instructor || x.displayName, title: b.courseTitle || "", t,
        photo: b.photo || "", field: b.field || b.shortTitle || "",
        yt: b.youtubeChannel || ct.youtube || "", ig: b.instagram || ct.instagram || "", kakao: b.kakaoChannel || ct.kakao || "",
        weeks: weeks.length, missions: weeks.reduce((n, w) => n + (w.missions || []).length, 0),
        landing: !!(L && L.published), free: !!(F && F.published)
      };
    });
  }

  /* ---------- 조각 ---------- */
  const mark = (t) => '<mark class="hm-mark">' + t + "</mark>";
  // 두고 원본 로고 — 두고 파랑 심볼 + 두 줄(doogo / CLASS) (icons.js 공용)
  const brandLock = (cls) => window.doogoClassLock(cls);
  // 실제 화면 녹화 영상: 처음엔 첫 장면 사진만, 화면에 보이면 영상을 받아 소리 없이 반복 재생 (wireVideos)
  const PAUSE = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg>';
  const video = (vid, alt, ch) => '<video class="hm-vid" muted playsinline loop preload="none" poster="' + IMG + vid + '.webp" data-src="' + IMG + vid + '"' + (ch ? " data-ch" : "") + ' aria-label="' + esc(alt || "") + ' (실제 화면 녹화)"></video>' +
    '<button type="button" class="hm-vid-btn" data-hm-vid aria-label="영상 멈추기">' + PAUSE + "</button>";
  // 휴대폰 틀 — 화면을 가리는 검정 노치(스피커) 없이 깔끔하게
  const phone = (vid, cls, alt, ch) => '<div class="hm-phone ' + (cls || "") + '">' + video(vid, alt, ch) + "</div>";
  const browser = (vid, cls, alt, ch) => '<div class="hm-browser ' + (cls || "") + '"><div class="hm-browser-bar"><i></i><i></i><i></i><span>doogo-class.vercel.app</span></div><div class="hm-browser-scr">' + video(vid, alt, ch) + "</div></div>";
  const scrollBtn = (to, label, cls) => '<button type="button" class="' + cls + '" data-hm-scroll="' + to + '">' + label + "</button>";
  const applyBtn = (label, cls) => '<button type="button" class="' + cls + '" data-hm-apply>' + label + "</button>";
  const arrow = () => icon("arrowRight", "sm");
  const d = (i) => ' style="--i:' + i + '"';
  const checks = (list) => '<ul class="hm-checks">' + list.map((x) => "<li>" + icon("check", "xs") + "<span>" + x + "</span></li>").join("") + "</ul>";
  // 구역 제목: 빨강 아이콘 + 굵은 제목 · 설명 · 오른쪽 버튼 (PC에서는 한 줄로 넓게) · 아래 구분선
  const secHead = (ic, title, sub, right) => '<div class="hm-shead hm-reveal' + (sub ? "" : " no-sub") + '"><div class="hm-shead-main"><span class="hm-shead-ic">' + icon(ic) + '</span><h2 class="hm-h2">' + title + "</h2></div>" +
    (sub ? '<p class="hm-sub">' + sub + "</p>" : "") + (right ? '<div class="hm-shead-r">' + right + "</div>" : "") + "</div>";

  let stTab = "tutorial", adTab = "dash";

  function header() {
    return '<header class="hm-top" id="hm-top"><div class="hm-wrap hm-top-in">' +
      '<button type="button" class="hm-logo" data-hm-scroll="top" aria-label="두고 클래스 맨 위로">' + brandLock() + "</button>" +
      '<nav class="hm-nav" aria-label="소개 메뉴">' +
        scrollBtn("hm-flow", "운영 흐름", "hm-nav-a") + scrollBtn("hm-features", "3가지 기능", "hm-nav-a") + scrollBtn("hm-students", "수강생 화면", "hm-nav-a") + scrollBtn("hm-teachers", "강사센터", "hm-nav-a") +
        scrollBtn("hm-pricing", "이용료", "hm-nav-a") + scrollBtn("hm-classes", "강사진", "hm-nav-a") + scrollBtn("hm-faq", "FAQ", "hm-nav-a") +
      "</nav>" +
      '<div class="hm-top-r"><a class="hm-top-link" href="#/center">강사센터</a><a class="hm-btn hm-btn-sec hm-btn-sm" href="#/login"><span class="hm-hide-m">수강생 </span>로그인</a>' + applyBtn("입점 문의", "hm-btn hm-btn-p hm-btn-sm") + "</div>" +
    '</div><i class="hm-top-prog" id="hm-prog" aria-hidden="true"></i></header>';
  }

  function hero() {
    const pts = [["users", "수강생은 무료"], ["layers", "수강생 수 무제한 · 같은 이용료"], ["refresh", "기수 무제한 운영"]];
    return '<section class="hm-hero" id="hm-hero"><div class="hm-hero-glow" aria-hidden="true"></div><div class="hm-wrap hm-hero-in">' +
      '<div class="hm-hero-copy">' +
        '<p class="hm-pill"><i class="hm-dot"></i>강사님을 위한 강의 운영 플랫폼</p>' +
        '<h1 class="hm-h1">강의는 강사님이,<br>운영은 ' + mark("두고 클래스") + "가</h1>" +
        '<p class="hm-lead">강의 소개 랜딩페이지 · 무료강의 전자책 · 수강생 케어 튜토리얼까지, <b>강사님 이름으로 된 강의 플랫폼</b> 하나로 운영하세요. 수강생은 무료, 강사님은 수강생 수와 상관없이 같은 이용료예요.</p>' +
        '<div class="hm-cta">' + applyBtn("입점 문의하기" + arrow(), "hm-btn hm-btn-p hm-btn-lg") + scrollBtn("hm-features", "3가지 기능 보기", "hm-btn hm-btn-sec hm-btn-lg") + "</div>" +
        '<ul class="hm-hero-pts">' + pts.map((x) => "<li>" + icon(x[0], "xs") + x[1] + "</li>").join("") + "</ul>" +
        '<p class="hm-student-link">수강생이신가요? <a href="#/login">수강생 로그인' + icon("arrowRight", "xs") + "</a></p>" +
      "</div>" +
      '<div class="hm-hero-art">' +
        browser("v-admin", "hm-hero-browser", "강사센터 화면") +
        '<div class="hm-hero-phone-wrap">' + phone("v-home", "hm-hero-phone", "수강생 홈 화면") + "</div>" +
        '<div class="hm-chip hm-chip-a">' + icon("check", "sm ok") + "<span><b>1주차 과제 승인</b><small>OOO 강사님 · 방금</small></span></div>" +
        '<div class="hm-chip hm-chip-b"><span><small>3기 평균 진도</small><b>72%</b></span><i class="hm-chip-bar"><i style="width:72%"></i></i></div>' +
        '<div class="hm-chip hm-chip-c">' + icon("award", "sm") + "<span><b>수료증 발급</b><small>필수 과제 23개 통과</small></span></div>" +
      "</div>" +
    "</div>" +
    "</section>";
  }

  // 기수가 늘수록 버거워지는 운영 → 두고 클래스의 세 가지
  function problem() {
    return '<section class="hm-sec hm-soft" id="hm-why"><div class="hm-wrap">' +
      secHead("target", "기수가 늘수록, 운영이 버거워지셨나요?", "1기 · 2기 · 3기를 이어 가는 강사님들이 가장 많이 겪는 일이에요.") +
      '<div class="hm-pains">' + PAINS.map((x, i) => '<article class="hm-pain hm-hov hm-reveal"' + d(i) + '><span class="hm-ic hm-ic-mute">' + icon(x[0]) + "</span><h3>" + x[1] + "</h3><p>" + x[2] + "</p></article>").join("") + "</div>" +
      '<div class="hm-answer hm-reveal"><span class="hm-sym" aria-hidden="true"></span><p>두고 클래스는 강의 운영에 필요한 ' + mark("3가지") + "를 강사님 이름의 플랫폼 하나에 담았어요.</p>" + scrollBtn("hm-features", "3가지 보기" + arrow(), "hm-answer-go") + "</div>" +
    "</div></section>";
  }

  // 한 기수 운영 흐름 — 모집부터 다음 기수까지 어느 화면이 맡는지
  function flow() {
    return '<section class="hm-sec hm-flow-sec" id="hm-flow"><div class="hm-wrap">' +
      secHead("activity", "한 기수 운영, 처음부터 끝까지 한곳에서", "모집 → 무료 강의 → 신청 · 승인 → 주차별 학습 → 과제 피드백 → 수료 → 다음 기수. 지금 단톡방 · 드라이브 · 노션 · 구글폼으로 나눠 하던 일을 두고 클래스 하나로 이어요.", scrollBtn("hm-compare", "지금 방식과 비교" + arrow(), "hm-shead-link")) +
      '<ol class="hm-flow">' + FLOW.map((x, i) => '<li class="hm-flow-i hm-hov hm-reveal"' + d(i) + '><span class="hm-flow-no">' + String(i + 1).padStart(2, "0") + '</span><span class="hm-ic hm-ic-sm">' + icon(x[0]) + "</span><b>" + x[1] + '</b><em>' + x[2] + "</em><p>" + x[3] + "</p></li>").join("") + "</ol>" +
    "</div></section>";
  }

  // 강사님이 받는 세 가지 — 실제 화면과 함께 (왼쪽 · 오른쪽 번갈아)
  function features() {
    const row = (f, i) => '<article class="hm-frow hm-reveal' + (i % 2 ? " rev" : "") + '">' +
      '<div class="hm-frow-copy"><p class="hm-frow-top"><span class="hm-frow-no">' + f.no + '</span><span class="hm-frow-tag">' + f.tag + "</span></p>" +
        "<h3>" + f.title + '</h3><p class="hm-frow-lead">' + f.lead + "</p>" + checks(f.pts) +
        '<ul class="hm-frow-more">' + f.more.map((m) => '<li><span class="hm-ic hm-ic-xs">' + icon(m[0]) + "</span><span><b>" + m[1] + "</b><small>" + m[2] + "</small></span></li>").join("") + "</ul></div>" +
      '<div class="hm-frow-art"><div class="hm-show-glow" aria-hidden="true"></div>' + phone(f.vid, "hm-frow-phone", f.title + " 화면") + '<p class="hm-cap">' + icon("play", "xs") + "실제 화면 녹화 · 예시 데이터</p></div>" +
    "</article>";
    return '<section class="hm-sec" id="hm-features"><div class="hm-wrap">' +
      secHead("layers", "강사님 이름으로 운영하는 3가지", "모집부터 수료 후 관리까지, 한 기수를 운영하는 데 필요한 화면이 모두 들어 있어요. 수강생 수와 상관없이 전부 포함돼요.", applyBtn("입점 문의" + arrow(), "hm-shead-link")) +
      '<div class="hm-frows">' + FEATURES.map(row).join("") + "</div>" +
    "</div></section>";
  }

  // 단톡방 · 드라이브로 운영할 때와 비교
  function compare() {
    return '<section class="hm-sec hm-soft" id="hm-compare"><div class="hm-wrap">' +
      secHead("swap", "단톡방 · 드라이브로 운영할 때와 무엇이 다른가요", "강의 내용은 그대로, 운영하는 방식만 바뀌어요. 기수가 쌓일수록 차이가 커져요.", applyBtn("입점 문의" + arrow(), "hm-shead-link")) +
      // 줄마다 화면에 들어오면: 지금 방식 글자에 빨간 줄이 그어지고 → 두고 쪽 체크가 톡 튀어나오며 강조된다
      '<div class="hm-cmp" role="table" aria-label="운영 방식 비교">' +
        '<div class="hm-cmp-row hm-cmp-head" role="row"><span role="columnheader">항목</span><span role="columnheader">지금 방식 <small>단톡방 · 드라이브 · 노션</small></span><span role="columnheader">' + brandLock("hm-lock-xs") + "</span></div>" +
        COMPARE.map((r) => '<div class="hm-cmp-row hm-reveal" role="row"><b role="rowheader">' + r[0] + '</b><span role="cell" class="hm-cmp-old"><s class="hm-cmp-strike">' + r[1] + '</s></span><span role="cell" class="hm-cmp-new"><i class="hm-cmp-ok">' + icon("check", "xs") + "</i><span>" + r[2] + "</span></span></div>").join("") +
      "</div>" +
    "</div></section>";
  }

  function students() {
    const cur = STUDENT_TABS.find((x) => x.key === stTab) || STUDENT_TABS[0];
    return '<section class="hm-sec" id="hm-students"><div class="hm-wrap">' +
      secHead("book", "수강생은 이런 강의실을 받아요", "강사님 강의를 신청한 수강생이 로그인하면 열리는 화면이에요. 오늘 할 일과 내 진도가 언제나 보여서, 1주차부터 수료까지 길을 잃지 않아요.") +
      '<div class="hm-show">' +
        '<div class="hm-show-tabs" role="tablist" aria-label="수강생 기능">' + STUDENT_TABS.map((x) =>
          '<button type="button" role="tab" class="hm-tab' + (x.key === cur.key ? " on" : "") + '" aria-selected="' + (x.key === cur.key) + '" data-hm-st="' + x.key + '">' +
            '<span class="hm-tab-ic">' + icon(x.ic) + '</span><span class="hm-tab-t"><b>' + x.title + "</b><small>" + x.desc + "</small></span></button>").join("") +
        "</div>" +
        '<div class="hm-show-art"><div class="hm-show-glow" aria-hidden="true"></div>' + phone("v-student", "hm-show-phone", "수강생 화면", true) +
          '<p class="hm-show-cap"><b>' + cur.title + "</b><span>" + cur.desc + "</span></p></div>" +
      "</div>" +
      '<div class="hm-more">' + STUDENT_MORE.map((x, i) => '<div class="hm-more-i hm-hov hm-reveal"' + d(i) + '><span class="hm-ic hm-ic-sm">' + icon(x[0]) + "</span><b>" + x[1] + "</b><span>" + x[2] + "</span></div>").join("") + "</div>" +
    "</div></section>";
  }

  function teachers() {
    const cur = ADMIN_TABS.find((x) => x.key === adTab) || ADMIN_TABS[0];
    return '<section class="hm-sec hm-soft" id="hm-teachers"><div class="hm-wrap">' +
      secHead("activity", "강사님은 강사센터에서 모든 수강생을 한눈에", "커리큘럼을 한 번 올려 두면 수강생은 혼자서도 따라오고, 강사님은 진도 · 과제 · 질문을 한 화면에서 확인해요. 코치와 나눠서 운영할 수도 있어요.") +
      '<div class="hm-atabs" role="tablist" aria-label="강사센터 화면">' + ADMIN_TABS.map((x) => '<button type="button" role="tab" class="hm-atab' + (x.key === cur.key ? " on" : "") + '" aria-selected="' + (x.key === cur.key) + '" data-hm-ad="' + x.key + '">' + x.title + "</button>").join("") + "</div>" +
      '<div class="hm-ashot">' + browser("v-admin", "hm-admin-browser", "강사센터", true) + '<p class="hm-cap">' + icon("play", "xs") + "실제 강사센터 화면 녹화 · 예시 데이터 (이름은 가렸어요)</p></div>" +
      '<div class="hm-feats">' + ADMIN_FEATURES.map((x, i) => '<article class="hm-feat hm-hov hm-reveal"' + d(i % 4) + '><span class="hm-ic">' + icon(x[0]) + "</span><h3>" + x[1] + "</h3><p>" + x[2] + "</p></article>").join("") + "</div>" +
      '<div class="hm-menus hm-reveal"><div class="hm-menus-h"><b>강사센터에서 직접 고치는 메뉴</b><span>코치 계정에는 이 중 필요한 메뉴만 열어 줄 수 있어요</span></div>' +
        '<div class="hm-menus-g">' + ADMIN_MENUS.map((g) => '<div class="hm-menus-col"><em>' + g[0] + " <small>" + g[1].length + "</small></em><ul>" + g[1].map((m) => "<li>" + m + "</li>").join("") + "</ul></div>").join("") + "</div></div>" +
    "</div></section>";
  }

  // 이용료 구조 — 금액은 상담 때 안내 (화면에 숫자를 적지 않는다)
  function pricing() {
    const scale = [["100명", 20], ["300명", 60], ["500명", 100]];
    return '<section class="hm-sec" id="hm-pricing"><div class="hm-wrap">' +
      secHead("coins", "수강생은 무료, 강사님은 하나의 이용료", "수강생이 100명이든 500명이든 이용료는 같아요. 수강생이 늘어도 비용 걱정 없이 다음 기수를 여세요.") +
      '<p class="hm-price-note hm-reveal">' + icon("award", "sm") + "<span>수강료 <b>239만 ~ 399만 원</b>짜리 강의, 수강생이 낸 만큼의 경험을 드리세요. 이용료는 수강생 수와 상관없이 고정이라, 기수가 커질수록 한 명당 부담은 줄어들어요.</span></p>" +
      '<div class="hm-plans">' +
        '<article class="hm-plan hm-plan-main hm-reveal"' + d(0) + '><p class="hm-plan-who">강사님</p><b class="hm-plan-price">정액 이용료</b><p class="hm-plan-desc">수강생 수와 상관없이 강사님 한 분당 정해진 이용료</p>' +
          checks(["강의 소개 랜딩페이지 · 무료강의 전자책 · 튜토리얼 시스템 모두 포함", "수강생 수 · 기수 제한 없음", "강사센터 · 코치 계정 · AI 도우미 포함", "처음 세팅을 함께 도와드려요"]) +
          applyBtn("이용료 상담 받기" + arrow(), "hm-btn hm-btn-p hm-btn-lg hm-btn-block") + '<small class="hm-plan-foot">정확한 이용료는 입점 상담 때 안내해 드려요.</small></article>' +
        '<article class="hm-plan hm-reveal"' + d(1) + '><p class="hm-plan-who">수강생</p><b class="hm-plan-price">0<small>원</small></b><p class="hm-plan-desc">강사님 강의를 신청한 수강생은 모두 무료</p>' +
          checks(["회원가입 없는 승인제 로그인", "휴대폰 · PC 어디서나, 앱 설치 없이", "수료 후에도 강의실은 그대로", "24시간 AI 도우미 · 1:1 소통"]) + "</article>" +
        '<div class="hm-scale hm-reveal"' + d(2) + '><p class="hm-scale-t">수강생이 늘어도 이용료는 그대로</p>' +
          scale.map((s) => '<div class="hm-scale-row"><span class="hm-scale-n">수강생 ' + s[0] + '</span><span class="hm-scale-bar"><i style="width:' + s[1] + '%"></i></span><span class="hm-scale-fee">' + icon("check", "xs") + "같은 이용료</span></div>").join("") +
          '<p class="hm-scale-foot">인원당 과금이 아니라서, 모집이 잘될수록 강사님께 유리해요.</p></div>' +
      "</div>" +
      '<div class="hm-cohort hm-reveal"><div class="hm-cohort-h"><b>기수 단위로 운영해요</b><span>무통장 입금 · 세금계산서 발행 · 기수 오픈까지 강사센터에서 이어져요</span></div>' +
        '<ol class="hm-cohort-steps">' + COHORT.map((x, i) => '<li><span class="hm-ic hm-ic-sm">' + icon(x[0]) + '</span><span><em>STEP ' + (i + 1) + "</em><b>" + x[1] + "</b><small>" + x[2] + "</small></span></li>").join("") + "</ol></div>" +
    "</div></section>";
  }

  // 기수가 쌓일수록 강해지는 구조
  function lifelong() {
    const loop = [["layers", "1기 커리큘럼 세팅", "한 번 올리면 그대로 다음 기수에"], ["refresh", "2기 · 3기는 복사해서 바로", "기수별 일정 · 커리큘럼만 바꿔요"],
      ["heart", "끝난 기수에게도 새 자료", "강의실은 수료 후에도 남아요"], ["megaphone", "후기 · 단골이 다음 모집으로", "랜딩페이지 · 무료강의로 다시 연결"]];
    return '<section class="hm-sec hm-soft hm-life"><div class="hm-wrap hm-life-in">' +
      '<div class="hm-life-copy hm-reveal">' +
        '<h2 class="hm-h2 hm-h2-xl">기수가 쌓일수록,<br>' + mark("강의가 강해져요") + ".</h2>" +
        "<p>1기 때 만든 커리큘럼 · 자료 · 과제를 2기, 3기에 그대로 쓰고 기수마다 조금씩 다듬기만 하면 돼요. 운영에 쓰던 시간을 강의에 쓰세요.</p>" +
        "<p>끝난 기수도 강의실에 남아 새 자료를 받아요. 그렇게 이어지는 연결이 <b>후기 · 단골 수강생 · 나만의 팬</b>이 되고, 다음 기수 모집으로 돌아와요.</p>" +
      "</div>" +
      '<ol class="hm-loop" aria-label="기수가 쌓이는 순서">' + loop.map((x, i) => '<li class="hm-loop-i hm-hov hm-reveal"' + d(i) + '><span class="hm-ic hm-ic-sm">' + icon(x[0]) + '</span><span class="hm-loop-t"><b>' + x[1] + "</b><small>" + x[2] + '</small></span><em>0' + (i + 1) + "</em></li>").join("") + "</ol>" +
    "</div></section>";
  }

  /* 강사진 — 프로필 사진 카드 (타이탄클래스 강사진처럼: 사진 · 이름 · 분야 · 구분선 · SNS) */
  const SNS = {
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><path d="M17.5 6.5h.01"/></svg>',
    kakao: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>'
  };
  const SILHOUETTE = '<svg class="hm-tc-ph" viewBox="0 0 200 250" aria-hidden="true"><circle cx="100" cy="92" r="44"/><path d="M18 250c4-58 40-92 82-92s78 34 82 92Z"/></svg>';
  function classList(list) {
    const sns = (x) => [["youtube", x.yt, "유튜브"], ["instagram", x.ig, "인스타그램"], ["kakao", x.kakao, "카카오톡"]]
      .filter((v) => /^https?:\/\//i.test(v[1]))
      .map((v) => '<a class="hm-sns" href="' + esc(v[1]) + '" target="_blank" rel="noopener" aria-label="' + esc(x.who) + " " + v[2] + '">' + SNS[v[0]] + "</a>").join("");
    const card = (x, i) => {
      const photo = '<span class="hm-tc-shape" aria-hidden="true"></span>' + (x.photo ? '<img src="' + esc(x.photo) + '" alt="' + esc(x.who) + ' 강사" decoding="async">' : SILHOUETTE) +
        '<span class="hm-tc-tag">' + x.weeks + "주 과정</span>";
      return '<article class="hm-tc hm-reveal" style="--i:' + i + '">' +
        (x.landing ? '<a class="hm-tc-photo" href="#/p/' + esc(x.id) + '" aria-label="' + esc(x.who) + ' 강의 소개">' + photo + "</a>" : '<div class="hm-tc-photo">' + photo + "</div>") +
        '<div class="hm-tc-body"><h3>' + esc(x.who) + '</h3><p class="hm-tc-field">' + esc(x.field) + '</p><p class="hm-tc-course">' + esc(x.title) + "</p></div>" +
        '<div class="hm-tc-foot"><span class="hm-tc-sns">' + sns(x) + '</span><span class="hm-tc-links">' +
          (x.landing ? '<a href="#/p/' + esc(x.id) + '">강의 소개</a>' : "") + (x.free ? '<a href="#/free/' + esc(x.id) + '">무료 강의</a>' : "") +
          '<a class="hm-tc-login" href="#/login?ins=' + esc(x.id) + '">로그인</a></span></div>' +
      "</article>";
    };
    return '<section class="hm-sec" id="hm-classes"><div class="hm-wrap">' +
      secHead("award", "지금 두고 클래스로 강의하는 강사님", "강사님마다 자기 이름 · 색 · 커리큘럼으로 운영하고 있어요. 강의 소개와 무료 강의 페이지도 직접 눌러 보세요.", applyBtn("입점 문의" + arrow(), "hm-shead-link")) +
      '<div class="hm-tcs">' + list.map(card).join("") + "</div>" +
      '<div class="hm-join hm-reveal"><span class="hm-join-ic">' + icon("plus") + '</span><div class="hm-join-t"><b>다음 강사님의 자리</b><p>지금 하고 있는 강의를 그대로 옮겨 드려요. 커리큘럼 정리부터 첫 기수 세팅까지 함께해요.</p></div>' +
        applyBtn("입점 문의하기" + arrow(), "hm-btn hm-btn-p") + "</div>" +
    "</div></section>";
  }

  // 입점 순서 (강사님 기준)
  function journey() {
    return '<section class="hm-sec hm-soft" id="hm-how"><div class="hm-wrap">' +
      secHead("checks", "입점은 이렇게 진행돼요", "문의를 남겨 주시면 상담부터 세팅까지 함께해요. 다음 기수 시작 전에 준비를 마칠 수 있어요.", applyBtn("입점 문의" + arrow(), "hm-shead-link")) +
      '<ol class="hm-steps">' + STEPS.map((s, i) => '<li class="hm-step hm-hov hm-reveal"' + d(i) + '><span class="hm-step-no">' + String(i + 1).padStart(2, "0") + "</span><b>" + s[0] + "</b><p>" + s[1] + "</p></li>").join("") + "</ol>" +
      '<div class="hm-login-demo hm-reveal">' +
        '<div class="hm-ld-copy"><h3>수강생 계정 안내도 필요 없어요</h3><p>수강생은 아이디 · 비밀번호 없이 강사 선택 → 이름 → 휴대폰 뒷자리로 들어와요. 강사님이 따로 계정을 만들어 줄 필요가 없어요.</p><a class="hm-btn hm-btn-sec" href="#/login">수강생 로그인 화면 보기' + arrow() + "</a></div>" +
        '<div class="hm-ld-card" aria-hidden="true">' +
          '<div class="hm-ld-f"><small>1. 수강 중인 강사님</small><span><span class="hm-sym"></span>OOO 강사님' + icon("chevRight", "xs") + "</span></div>" +
          '<div class="hm-ld-f"><small>2. 이름</small><span>OOO</span></div>' +
          '<div class="hm-ld-f"><small>3. 휴대폰 번호 뒷자리</small><span class="hm-ld-pw">● ● ● ●</span></div>' +
          '<span class="hm-ld-btn">로그인</span>' +
        "</div>" +
      "</div>" +
    "</div></section>";
  }

  function faq() {
    return '<section class="hm-sec" id="hm-faq"><div class="hm-wrap hm-faq-in">' +
      secHead("help", "자주 묻는 질문", "이용료 · 기수 운영 · 자료 옮기기 · 수강생 로그인까지, 입점 전에 가장 많이 물어보시는 것들이에요.", applyBtn("1:1 입점 상담" + arrow(), "hm-shead-link")) +
      '<div class="hm-faqs hm-reveal">' + FAQS.map((q, i) => '<details class="hm-faq"' + (i < 2 ? " open" : "") + "><summary><span>Q</span>" + q[0] + icon("chevDown", "sm") + "</summary><p>" + q[1] + "</p>" +
        (q[2] ? '<div class="hm-faq-cta">' + applyBtn("이용료 상담 받기" + arrow(), "hm-btn hm-btn-p hm-btn-sm") + "</div>" : "") + "</details>").join("") + "</div>" +
    "</div></section>";
  }

  function finalCta() {
    const pts = [["headset", "상담은 무료", "강의 방식 · 자료 · 일정부터 함께 정리해요"], ["layers", "처음 세팅을 함께", "랜딩 · 전자책 · 커리큘럼을 같이 만들어요"], ["users", "수강생은 무료", "수강생 수와 상관없이 같은 이용료"]];
    return '<section class="hm-final"><div class="hm-wrap hm-final-in">' +
      '<div class="hm-final-copy"><p class="hm-final-k">' + icon("sparkles", "xs") + "다음 기수 준비, 지금 시작하세요</p>" +
        '<h2 class="hm-h2">다음 기수부터,<br>' + mark("두고 클래스") + "로 운영해 보세요</h2>" +
        "<p>강의 소개 랜딩페이지 · 무료강의 전자책 · 튜토리얼 시스템을 강사님 이름으로. 문의를 남겨 주시면 확인 후 바로 연락드려요.</p>" +
        '<div class="hm-cta">' + applyBtn("입점 문의하기" + arrow(), "hm-btn hm-btn-p hm-btn-lg") + '<a class="hm-btn hm-btn-sec hm-btn-lg" href="#/login">수강생 로그인</a></div></div>' +
      '<ul class="hm-final-pts">' + pts.map((x) => '<li><span class="hm-final-ic">' + icon(x[0]) + "</span><span><b>" + x[1] + "</b><small>" + x[2] + "</small></span></li>").join("") + "</ul>" +
    "</div></section>";
  }

  /* 바닥 — 브랜드 · 바로가기 3단 · 고객센터 · 사업자 정보(채운 칸만) · 약관. 내용은 마스터 → 첫 화면 · 사업자 정보 */
  function footer() {
    const S = DB.siteInfo ? DB.siteInfo() : { company: "(주)두고홀딩스" };
    const url = (u) => (/^https?:\/\//i.test(u || "") ? u : "");
    const ext = (href, label, cls) => '<a' + (cls ? ' class="' + cls + '"' : "") + ' href="' + esc(href) + '" target="_blank" rel="noopener">' + label + "</a>";
    const bizDigits = String(S.bizNo || "").replace(/[^0-9]/g, "");
    const tel = (v) => '<a href="tel:' + esc(String(v).replace(/[^0-9+]/g, "")) + '">' + esc(v) + "</a>";
    const info = [
      ["상호", esc(S.company || "(주)두고홀딩스")], S.ceo && ["대표", esc(S.ceo)],
      S.bizNo && ["사업자등록번호", esc(S.bizNo) + (bizDigits.length === 10 ? " " + ext("https://www.ftc.go.kr/bizCommPop.do?wrkr_no=" + bizDigits, "사업자정보확인", "hm-foot-chk") : "")],
      S.mailOrderNo && ["통신판매업 신고", esc(S.mailOrderNo)], S.address && ["주소", esc(S.address)],
      S.phone && ["고객센터", tel(S.phone)], S.email && ["이메일", '<a href="mailto:' + esc(S.email) + '">' + esc(S.email) + "</a>"],
      S.privacyOfficer && ["개인정보 보호책임자", esc(S.privacyOfficer)], ["호스팅 제공자", esc(S.hosting || "Vercel Inc.")]
    ].filter(Boolean);
    const legal = (key, label, href) => (url(href) ? ext(href, label) : '<button type="button" data-hm-legal="' + key + '">' + label + "</button>");
    return '<footer class="hm-foot"><div class="hm-wrap">' +
      '<div class="hm-foot-top">' +
        '<div class="hm-foot-brand">' + brandLock() + "<p>강사님 이름으로 운영하는 강의 플랫폼.<br>강의 소개 랜딩페이지 · 무료강의 전자책 · 수강생 케어 튜토리얼 시스템을 하나로.</p>" +
          '<div class="hm-foot-cta">' + applyBtn("입점 문의하기" + arrow(), "hm-btn hm-btn-p hm-btn-sm") + '<a class="hm-btn hm-btn-sec hm-btn-sm" href="#/center">강사센터</a></div></div>' +
        '<nav class="hm-foot-cols" aria-label="바로가기">' +
          '<div class="hm-foot-col"><b>두고 클래스</b>' + scrollBtn("hm-features", "3가지 기능", "hm-foot-a") + scrollBtn("hm-students", "수강생 화면", "hm-foot-a") + scrollBtn("hm-teachers", "강사센터 둘러보기", "hm-foot-a") + scrollBtn("hm-pricing", "이용료 · 기수 운영", "hm-foot-a") + scrollBtn("hm-classes", "강사진", "hm-foot-a") + "</div>" +
          '<div class="hm-foot-col"><b>바로가기</b>' + applyBtn("강사 입점 문의", "hm-foot-apply") + '<a href="#/center">강사센터 로그인</a><a href="#/login">수강생 로그인</a><a href="#/center/billing">다음 기수 신청</a></div>' +
          '<div class="hm-foot-col"><b>고객지원</b>' + scrollBtn("hm-faq", "자주 묻는 질문", "hm-foot-a") + legal("terms", "이용약관", S.terms) + legal("privacy", "<strong>개인정보처리방침</strong>", S.privacy) +
            (S.email ? '<a href="mailto:' + esc(S.email) + '">이메일 문의</a>' : "") + "</div>" +
        "</nav>" +
        '<div class="hm-foot-cs"><b>고객센터</b>' +
          (S.phone ? '<p class="hm-foot-tel">' + tel(S.phone) + "</p>" : '<p class="hm-foot-tel hm-foot-tel-sm">입점 문의로 남겨 주세요</p>') +
          "<p>" + (S.hours ? esc(S.hours) : "입점 문의는 24시간 남길 수 있어요") + "</p>" +
          (S.email ? '<p><a href="mailto:' + esc(S.email) + '">' + esc(S.email) + "</a></p>" : "") +
          applyBtn(icon("handshake", "xs") + "입점 문의 남기기", "hm-foot-cs-btn") + "</div>" +
      "</div>" +
      '<div class="hm-foot-biz"><dl class="hm-foot-info">' + info.map((x) => "<div><dt>" + x[0] + "</dt><dd>" + x[1] + "</dd></div>").join("") + "</dl>" +
        '<div class="hm-foot-bottom"><nav class="hm-foot-legal" aria-label="약관">' + legal("terms", "이용약관", S.terms) + legal("privacy", "<strong>개인정보처리방침</strong>", S.privacy) + legal("oss", "오픈소스 라이선스", "") + "</nav>" +
        '<p class="hm-foot-copy">© 2026 ' + esc(S.company || "(주)두고홀딩스") + ". All rights reserved.</p></div></div>" +
    "</div></footer>";
  }
  // 약관 (사이트 주소를 정하기 전에는 수강생 화면과 같은 내용을 팝업으로)
  function openLegal(key) {
    const L = (window.CLASS_LEGAL || {})[key];
    if (!L) return;
    const mr = document.getElementById("modal-root");
    mr.innerHTML = '<div class="hm-mbg" data-hm-bg><div class="hm-modal hm-modal-doc" role="dialog" aria-modal="true" aria-labelledby="hm-lg-t">' +
      '<button type="button" class="hm-modal-x" data-hm-close aria-label="닫기">' + icon("x") + "</button>" +
      '<div class="hm-modal-in"><div class="hm-modal-head"><h2 id="hm-lg-t">' + esc(L[0]) + '</h2></div><div class="hm-doc">' + esc(L[1]) + "</div>" +
      '<button type="button" class="hm-btn hm-btn-p hm-btn-lg hm-btn-block" data-hm-close>확인</button></div></div></div>';
    document.documentElement.classList.add("hm-noscroll");
  }

  /* ---------- 강사 입점 문의 팝업 ---------- */
  const field = (name, label, opt) => {
    opt = opt || {};
    const req = opt.req ? ' <em aria-hidden="true">*</em>' : ' <small>(선택)</small>';
    const attrs = ' id="ap-' + name + '" name="' + name + '"' + (opt.req ? " required" : "") + (opt.ph ? ' placeholder="' + esc(opt.ph) + '"' : "") + (opt.ac ? ' autocomplete="' + opt.ac + '"' : "") + (opt.max ? ' maxlength="' + opt.max + '"' : "");
    const input = opt.area ? '<textarea class="hm-in"' + attrs + ' rows="' + (opt.rows || 3) + '"></textarea>' : '<input class="hm-in" type="' + (opt.type || "text") + '"' + attrs + (opt.im ? ' inputmode="' + opt.im + '"' : "") + ">";
    return '<div class="hm-fld' + (opt.wide ? " wide" : "") + '"><label for="ap-' + name + '">' + label + req + "</label>" + input + "</div>";
  };
  function openApply() {
    const mr = document.getElementById("modal-root");
    mr.innerHTML = '<div class="hm-mbg" data-hm-bg><div class="hm-modal" role="dialog" aria-modal="true" aria-labelledby="hm-ap-t">' +
      '<button type="button" class="hm-modal-x" data-hm-close aria-label="닫기">' + icon("x") + "</button>" +
      '<div class="hm-modal-in" id="hm-ap-body">' +
        '<div class="hm-modal-head">' + brandLock() + '<h2 id="hm-ap-t">강사 입점 문의</h2><p>강사님의 노하우를 두고 클래스 튜토리얼 강의 플랫폼으로 만들어 드려요. 남겨 주시면 확인 후 연락드릴게요.</p></div>' +
        '<form id="hm-apply" class="hm-form" novalidate>' +
          '<div class="hm-grid2">' + field("name", "성함", { req: true, ac: "name", max: 40, ph: "홍길동" }) + field("phone", "연락처", { req: true, type: "tel", im: "tel", ac: "tel", max: 30, ph: "010-0000-0000" }) + "</div>" +
          field("email", "이메일", { req: true, type: "email", im: "email", ac: "email", max: 120, ph: "name@example.com" }) +
          field("where", "지금 강의하고 있는 곳", { max: 120, ph: "예: 클래스101 · 유튜브 · 오프라인 · 아직 없어요" }) +
          field("course", "어떤 강의인가요", { req: true, area: true, rows: 3, max: 1500, ph: "강의 주제 · 대상 · 기간 · 수강생 수 등을 자유롭게 적어 주세요" }) +
          field("link", "강의 페이지 · 채널 주소", { type: "url", im: "url", max: 300, ph: "https://" }) +
          field("message", "하고 싶은 말", { area: true, rows: 2, max: 1500, ph: "궁금한 점이나 원하는 점을 남겨 주세요" }) +
          '<label class="hm-agree"><input type="checkbox" name="agree"><span>개인정보 수집 · 이용에 동의합니다 <em>(필수)</em><small>입점 상담을 위해 성함 · 연락처 · 이메일 · 강의 정보를 받아요. 상담에만 쓰고, 상담이 끝나면 지체 없이 지워요.</small></span></label>' +
          '<p class="hm-form-err" id="hm-ap-err" role="alert"></p>' +
          '<button type="submit" class="hm-btn hm-btn-p hm-btn-lg hm-btn-block">입점 문의 보내기' + icon("send", "sm") + "</button>" +
        "</form>" +
      "</div></div></div>";
    document.documentElement.classList.add("hm-noscroll");
    setTimeout(() => { const f = document.getElementById("ap-name"); if (f) f.focus(); }, 60);
  }
  function closeApply() {
    document.getElementById("modal-root").innerHTML = "";
    document.documentElement.classList.remove("hm-noscroll");
    if (/^#\/partner/.test(location.hash)) history.replaceState(null, "", "#/about");
  }
  async function submitApply(f) {
    const err = document.getElementById("hm-ap-err");
    const v = (n) => f[n].value.trim();
    const a = { name: v("name"), phone: v("phone"), email: v("email"), where: v("where"), course: v("course"), link: v("link"), message: v("message"), agree: f.agree.checked };
    const bad = (msg, n) => { err.textContent = msg; if (n && f[n]) f[n].focus(); };
    if (!a.name) return bad("성함을 적어 주세요.", "name");
    if (!/^[0-9+\-() ]{8,}$/.test(a.phone)) return bad("연락처를 숫자로 적어 주세요. (예: 010-0000-0000)", "phone");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) return bad("이메일 주소를 확인해 주세요.", "email");
    if (!a.course) return bad("어떤 강의인지 적어 주세요.", "course");
    if (!a.agree) return bad("개인정보 수집 · 이용에 동의해 주세요.");
    err.textContent = "";
    const btn = f.querySelector("button[type=submit]");
    btn.disabled = true; btn.classList.add("is-busy");
    try {
      const r = await DB.applyPartner(a);
      if (!r || r.error) { btn.disabled = false; btn.classList.remove("is-busy"); return bad(r && r.error === "locked" ? "문의가 많이 들어와 잠시 막혔어요. 조금 뒤에 다시 보내 주세요." : r && r.error === "input" ? "입력한 내용을 다시 확인해 주세요." : "보내지 못했어요. 잠시 후 다시 시도해 주세요."); }
      document.getElementById("hm-ap-body").innerHTML = '<div class="hm-done"><span class="hm-done-ic">' + icon("check") + '</span><h2 id="hm-ap-t">입점 문의가 접수됐어요</h2><p>' + esc(a.name) + " 강사님, 남겨 주신 연락처로 확인 후 연락드릴게요.<br>두고 클래스와 함께할 날을 기다릴게요.</p>" +
        '<button type="button" class="hm-btn hm-btn-p hm-btn-lg" data-hm-close>확인</button></div>';
    } catch (e) {
      btn.disabled = false; btn.classList.remove("is-busy");
      bad("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  /* ---------- 그리기 ---------- */
  let io = null;
  function reveal() {
    if (io) io.disconnect();
    const els = root.querySelectorAll(".hm-reveal:not(.in)");
    if (!("IntersectionObserver" in window)) { els.forEach((el) => el.classList.add("in")); return; }
    io = new IntersectionObserver((list) => list.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
    els.forEach((el) => io.observe(el));
  }
  function render() {
    window.applyStudentTheme(null);
    document.title = "두고 클래스 — 강사님을 위한 강의 운영 플랫폼";
    dark = null;
    const list = classes();
    root.innerHTML = '<div class="hm">' + header() + "<main>" + hero() + problem() + flow() + features() + compare() + students() + teachers() + pricing() + lifelong() + classList(list) + journey() + faq() + finalCta() + "</main>" + footer() + "</div>";
    onScroll();
    reveal();
    wireVideos();
    if (/^#\/partner/.test(location.hash)) openApply();
  }
  function mount() { root.innerHTML = ""; render(); window.scrollTo(0, 0); }

  /* ---------- 실제 화면 녹화 영상 ---------- */
  let vio = null, vload = null;
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // H.264(mp4)을 못 트는 브라우저(일부 크로미움 · 리눅스 파이어폭스)는 VP9(webm)으로
  let vidExt = null;
  const pickExt = (v) => vidExt || (vidExt = v.canPlayType('video/mp4; codecs="avc1.640028"') ? ".mp4" : v.canPlayType('video/webm; codecs="vp9"') ? ".webm" : ".mp4");
  function loadVid(v) {
    if (v.getAttribute("src") || v.dataset.loading) return;
    const url = v.dataset.src + pickExt(v);
    if (!v.hasAttribute("data-ch") || !window.fetch || !(window.URL && URL.createObjectURL)) { v.src = url; v.load(); return; }
    // 탭으로 장면을 넘기는 영상은 통째로 받아 둔다 (구간 요청을 못 하는 곳에서도 원하는 장면으로 넘어가게, 1MB 남짓)
    v.dataset.loading = "1";
    fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); })
      .then((bl) => { v.src = URL.createObjectURL(bl); }, () => { v.src = url; })
      .then(() => { delete v.dataset.loading; v.load(); if (v.dataset.want === "1") playVid(v); });
  }
  function playVid(v) {
    if (v.dataset.anim) return;
    v.dataset.want = "1";
    loadVid(v);
    if (!v.getAttribute("src")) return;
    const pr = v.play();
    if (pr && pr.catch) pr.catch((err) => { if (err && err.name === "NotAllowedError") useAnim(v); });
    // 재생을 조용히 막는 곳: 받아 둔 장면이 있는데도 멈춰 있으면 움직이는 그림으로
    clearTimeout(v._chk);
    v._chk = setTimeout(() => { if (v.dataset.want === "1" && v.dataset.hold !== "1" && v.paused && v.readyState >= 2 && v.isConnected) useAnim(v); }, 3000);
  }
  // 영상 자동 재생을 막는 앱 안 브라우저(일부 웹뷰 · 절전 모드): 같은 녹화를 움직이는 그림(v-*.anim.webp)으로 보여 준다
  function useAnim(v) {
    if (v.dataset.anim || !v.isConnected) return;
    v.dataset.anim = "1"; v.dataset.want = "";
    const img = document.createElement("img");
    img.className = "hm-vid-anim"; img.alt = v.getAttribute("aria-label") || ""; img.decoding = "async";
    img.src = v.dataset.src + ".anim.webp";
    img.onerror = () => { img.remove(); v.hidden = false; delete v.dataset.anim; };
    v.hidden = true; v.after(img);
  }
  function stopVid(v) { v.dataset.want = ""; clearTimeout(v._chk); if (!v.paused) v.pause(); }
  function applySeek(v) {
    const at = v.dataset.seek;
    if (at == null || at === "" || v.readyState < 1) return;
    delete v.dataset.seek;
    try { v.currentTime = Number(at) + 0.05; } catch (err) { /* 아직 못 넘김 */ }
  }
  function setVidBtn(v) {
    const b = v.parentNode.querySelector("[data-hm-vid]");
    if (!b) return;
    const paused = v.dataset.hold === "1";
    b.innerHTML = paused ? icon("play") : PAUSE;
    b.classList.toggle("paused", paused);
    b.setAttribute("aria-label", paused ? "영상 재생" : "영상 멈추기");
  }
  // 화면에 보일 때만 받아서 재생 (안 보이면 멈춤). 움직임 줄이기 설정이면 멈춘 채로 두고 버튼으로 재생
  function wireVideos() {
    if (vio) vio.disconnect();
    const vids = Array.from(root.querySelectorAll("video.hm-vid"));
    vids.forEach((v) => {
      if (reduceMotion()) v.dataset.hold = "1";
      setVidBtn(v);
      v.addEventListener("timeupdate", onVidTime);
      v.addEventListener("loadedmetadata", () => applySeek(v));
    });
    if (!("IntersectionObserver" in window)) { vids.forEach((v) => { loadVid(v); if (v.dataset.hold !== "1") playVid(v); }); return; }
    // 받기는 화면에 오기 조금 전에 미리 (바로 움직이게)
    if (vload) vload.disconnect();
    vload = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { loadVid(en.target); vload.unobserve(en.target); } }), { rootMargin: "400px 0px" });
    // 재생은 지금 보고 있는 화면에서만: 영상이 절반 넘게 보이면 재생, 거의 안 보이면 멈춤 (아래에 있는 영상은 내려가서 볼 때 시작)
    vio = new IntersectionObserver((ents) => ents.forEach((en) => {
      const v = en.target;
      const seen = en.isIntersecting && (en.intersectionRatio >= 0.5 || en.intersectionRect.height >= window.innerHeight * 0.5);
      if (seen) { if (v.dataset.hold !== "1") playVid(v); }
      else if (!en.isIntersecting || en.intersectionRatio < 0.2) stopVid(v);
    }), { threshold: [0, 0.2, 0.5, 0.75, 1] });
    vids.forEach((v) => { vload.observe(v); vio.observe(v); });
  }
  // 수강생 화면 · 강사센터: 영상이 다음 장으로 넘어가면 탭 · 설명도 같이 바뀐다
  function chapterAt(list, t) { let cur = list[0]; list.forEach((x) => { if (t + 0.05 >= x.at) cur = x; }); return cur; }
  function markStudentTab(cur) {
    stTab = cur.key;
    root.querySelectorAll("[data-hm-st]").forEach((b) => { const on = b.dataset.hmSt === cur.key; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    const cap = root.querySelector(".hm-show-cap");
    if (cap) cap.innerHTML = "<b>" + cur.title + "</b><span>" + cur.desc + "</span>";
  }
  function markAdminTab(cur) {
    adTab = cur.key;
    root.querySelectorAll("[data-hm-ad]").forEach((b) => { const on = b.dataset.hmAd === cur.key; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
  }
  function onVidTime(e) {
    const v = e.target;
    if (v.closest(".hm-show")) { const cur = chapterAt(STUDENT_TABS, v.currentTime); if (cur.key !== stTab) markStudentTab(cur); }
    else if (v.closest(".hm-ashot")) { const cur = chapterAt(ADMIN_TABS, v.currentTime); if (cur.key !== adTab) markAdminTab(cur); }
  }
  function seekVid(v, at) {
    v.dataset.seek = at;
    applySeek(v);
    if (v.dataset.hold !== "1") playVid(v); else loadVid(v);
  }

  // 위 막대: 조금 내려가면 밝은 회색 유리(타이탄클래스처럼), 아래 파란 줄은 읽은 만큼 차오른다 · 휴대폰 주소창 색도 같이
  let dark = null, ticking = false;
  function onScroll() {
    if (!isActive() || ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      if (!isActive()) return;
      const top = document.getElementById("hm-top"), prog = document.getElementById("hm-prog");
      if (!top) return;
      const y = window.scrollY, max = document.documentElement.scrollHeight - window.innerHeight;
      const on = y > 24;
      if (on !== dark) {
        dark = on;
        top.classList.toggle("scrolled", on);
        const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", "#ffffff");
      }
      if (prog) prog.style.transform = "scaleX(" + (max > 0 ? Math.min(1, y / max) : 0).toFixed(4) + ")";
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  // 메뉴 · "3가지 기능 보기" 같은 버튼으로 그 칸까지 내려가기.
  // window.scrollTo 는 이 페이지가 다른 화면 안(클로드 아티팩트처럼 글 길이만큼 늘어난 틀)에 들어가 있으면
  // 아무것도 움직이지 못한다 → scrollIntoView 는 바깥 화면까지 같이 스크롤해 준다 (위 막대 높이는 CSS scroll-margin-top)
  function scrollToId(id) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior = reduce ? "auto" : "smooth";
    const el = id === "top" ? root.querySelector(".hm") : document.getElementById(id);
    if (!el) return;
    if (id === "top") window.scrollTo({ top: 0, behavior });
    try { el.scrollIntoView({ behavior, block: "start" }); }
    catch (err) { el.scrollIntoView(true); }
  }

  document.addEventListener("click", (e) => {
    if (!isActive()) return;
    if (e.target.closest("[data-hm-close]") || (e.target.matches && e.target.matches("[data-hm-bg]"))) { closeApply(); return; }
    if (e.target.closest("[data-hm-apply]")) { e.preventDefault(); openApply(); return; }
    const lg = e.target.closest("[data-hm-legal]");
    if (lg) { e.preventDefault(); openLegal(lg.dataset.hmLegal); return; }
    const s = e.target.closest("[data-hm-scroll]");
    if (s) { e.preventDefault(); scrollToId(s.dataset.hmScroll); return; }
    const vb = e.target.closest("[data-hm-vid]");
    if (vb) {
      const v = vb.parentNode.querySelector("video.hm-vid");
      if (v) { if (v.dataset.hold === "1") { v.dataset.hold = ""; playVid(v); } else { v.dataset.hold = "1"; stopVid(v); } setVidBtn(v); }
      return;
    }
    // 탭: 영상의 그 장면으로 넘긴다
    const st = e.target.closest("[data-hm-st]");
    if (st) {
      const cur = STUDENT_TABS.find((x) => x.key === st.dataset.hmSt) || STUDENT_TABS[0];
      markStudentTab(cur);
      const v = root.querySelector(".hm-show video.hm-vid");
      if (v) seekVid(v, cur.at);
      return;
    }
    const ad = e.target.closest("[data-hm-ad]");
    if (ad) {
      const cur = ADMIN_TABS.find((x) => x.key === ad.dataset.hmAd) || ADMIN_TABS[0];
      markAdminTab(cur);
      const v = root.querySelector(".hm-ashot video.hm-vid");
      if (v) seekVid(v, cur.at);
    }
  });
  document.addEventListener("submit", (e) => {
    if (!isActive() || e.target.id !== "hm-apply") return;
    e.preventDefault();
    submitApply(e.target);
  });
  document.addEventListener("keydown", (e) => {
    if (isActive() && e.key === "Escape" && document.querySelector(".hm-mbg")) closeApply();
  });

  window.HomeApp = { render, mount, openApply };
})();
