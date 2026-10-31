/* 두잉고 — 강사님을 위한 세일즈 첫 화면 (/doinggo · #/doinggo · #/partner) — 대표 주소(/)는 두고클래스 스토어
 *
 *  - 이 화면을 보는 사람은 앞으로 두잉고를 쓸 ‘강사님’이다. 두잉고는 강사님께 플랫폼 이용료를 받고, 수강생은 무료로 쓴다
 *  - 이용료는 수강생 수와 상관없이 같다 (100명이든 500명이든). 금액은 상담 때 안내하므로 화면에 숫자를 적지 않는다
 *  - 강사님이 받는 세 가지: ① 강의 소개 랜딩페이지 ② 무료강의 전자책 ③ 수강생을 케어하는 커리큘럼 · 튜토리얼 시스템
 *  - 수강생도 이 주소로 들어오므로 ‘수강생 로그인’은 위 막대 · 첫 화면 · 마지막 안내에 늘 둔다
 *  - 강사 목록 · 숫자는 지금 운영 중인 강사 데이터에서 바로 가져온다 (꾸며 낸 숫자 없음)
 *  - ‘입점 문의’ 팝업 → 마스터 → 강사 입점 문의에서 관리 (#/partner 로 바로 열 수 있음)
 *  - 바닥의 사업자 정보 · 고객센터는 마스터 → 첫 화면 · 사업자 정보에서 고친다 (채운 칸만 보임)
 *  - PC에서 비어 보이지 않게 내용을 넉넉히: 운영 흐름 · 세 가지(세부 기능 6개씩) · 지금 방식과 비교 · 강사센터 메뉴 전체 · 기수 운영 방식 · 자주 묻는 질문 2단
 *  - 휴대폰 · 브라우저 틀 안은 실제 화면을 녹화한 영상(마우스 커서 · 클릭이 보임, 이름은 OOO). 보일 때만 받아서 재생하고,
 *    수강생 화면 · 강사센터 영상은 한 편을 장(chapter)으로 나눠 탭을 누르면 그 장면으로 넘어간다
 *  - 색 · 글꼴은 스낵클(snackle.classhub.ai)처럼: 레드 #FF0037 하나 + 무채색 회색, Pretendard 하나 (home.css 맨 위)
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
        ["image", "사진 · 이력 · 후기", "강사 사진 · 경력 · 수강 후기를 직접 올려요"], ["link", "주소 하나로 홍보", "카카오톡 · 인스타그램 · 유튜브에 링크 하나로"]],
      chips: [{ ic: "userPlus", ok: true, b: "수강 신청 1건", s: "방금 · 승인 대기로" }, { s: "4기 모집 중 · D-27", b: "38 / 50명", bar: 76 }] },
    { no: "02", tag: "무료 강의", title: "무료강의 전자책", vid: "v-free", lead: "무료 강의 신청자에게 전자책과 실전 자료를 순서대로 열어 주는 페이지예요.",
      pts: ["무료 강의 신청 · 일정 카운트다운 · 신청자 전용 자료", "전자책 · 실전 자료를 하나씩 순서대로 열어 줘요", "무료 강의에서 유료 강의 신청으로 자연스럽게 이어져요"],
      more: [["clock", "강의 카운트다운", "무료 강의까지 남은 일 · 시간 · 분 · 초가 보여요"], ["library", "선물 전자책 순차 공개", "정한 날짜 · 시간에 한 권씩 자동으로 열려요"],
        ["video", "강의 전 영상", "유튜브 영상을 넘겨 보며 강사님을 먼저 만나요"], ["message", "질문 미리 받기", "강의 전에 궁금한 점을 이 페이지에서 모아요"],
        ["headset", "오픈채팅 연결", "카카오톡 오픈채팅방으로 바로 이어져요"], ["store", "유료 강의로 연결", "진행 예정 강의 · 신청 링크로 자연스럽게"]],
      chips: [{ ic: "library", b: "선물 전자책 2권 공개", s: "신청자 전용 · 방금" }, { s: "무료 강의 시작까지", b: "19일 14:22:05", count: 1693325 }] },
    { no: "03", tag: "수강생 케어", title: "커리큘럼 · 튜토리얼 시스템", vid: "v-care", lead: "1주차부터 수료까지 수강생을 끝까지 케어하는 나만의 강의실이에요.",
      pts: ["주차별 강의 · 과제 · 자동 검수 · 강사 피드백", "진행률 · 수료증 · 24시간 AI 조교 · 1:1 상담", "강사센터에서 진척도를 보고 코치와 나눠 운영해요"],
      more: [["book", "주차별 커리큘럼", "강의 · 핵심 목표 · 과제 · 자료가 주차별로"], ["checks", "자동 검수", "글자 수 · 키워드 · 링크 · 사진을 바로 확인"],
        ["pen", "강사 · 코치 피드백", "승인하거나 보완할 점을 남기면 바로 보여요"], ["activity", "진행률 · 성장 단계", "씨앗부터 숲까지, 해낸 만큼 자라요"],
        ["award", "수료증", "필수 과제를 마치면 이름이 새겨진 수료증"], ["bot", "24시간 AI 조교", "강사님이 올린 자료로 밤에도 답해요"]],
      chips: [{ ic: "check", ok: true, b: "과제 자동 검수 통과", s: "글자 수 · 키워드 · 사진" }, { s: "6주차 · 내 진행률", b: "75%", bar: 75 }] }
  ];
  const STUDENT_TABS = [
    { key: "tutorial", at: 0, ic: "book", title: "주차별 튜토리얼", desc: "이번 주에 볼 강의와 할 과제가 순서대로 정리돼 있어요. 1주차부터 차근차근 따라오고, 다 본 강의는 ‘시청 완료’로 체크해요." },
    { key: "mission", at: 4.98, ic: "checks", title: "과제 제출 · 피드백", desc: "사진 · 링크 · 글로 과제를 내면 자동 검수로 바로 확인하고, 강사님과 코치가 승인하거나 보완할 점을 알려 줘요." },
    { key: "cert", at: 10.55, ic: "award", title: "진행률 · 수료증", desc: "잘 따라가고 있는지 진행률로 바로 보여요. 필수 과제를 모두 통과하면 이름이 새겨진 수료증이 나와요." },
    { key: "bot", at: 13.67, ic: "bot", title: "24시간 AI 조교", desc: "과제 방법 · 서류 · 일정 · 내 진도를 물어보면 강사님이 올린 자료로 바로 답해요. 새벽에도요." },
    { key: "channel", at: 20.72, ic: "message", title: "강사 · 코치 1:1 상담", desc: "막히는 순간 강사님과 코치에게 바로 연결돼요. 카카오톡 채널 · 오픈채팅 등 강사님이 정한 창구로 이어져요." },
    { key: "guide", at: 24.34, ic: "clipboard", title: "실무 체크리스트", desc: "사업자 등록처럼 강의에 필요한 준비를 단계별로 안내해요. 기관 · 기간 · 서류 · 강사님 팁까지 한 화면에." },
    { key: "library", at: 28.11, ic: "library", title: "강의 자료함", desc: "전자책 · 엑셀 양식 · VOD · 기초 가이드 영상까지, 강사님의 노하우가 한 권의 책처럼 정리돼 있어요." },
    { key: "schedule", at: 33.91, ic: "calendar", title: "수업 캘린더 · 클래스 소식", desc: "라이브 · 과제 마감 · 공지를 달력으로 한눈에. 해외에 있는 강사님과도 시간을 헷갈리지 않아요." }
  ];
  const STUDENT_MORE = [
    ["monitorPlay", "라이브 다시보기", "놓친 라이브를 주차별로 다시"],
    ["trophy", "모범 과제", "강사님이 고른 잘한 과제를 보고 따라 해요"],
    ["notebookPen", "학습 노트", "주차별 회고 질문 + 강의 메모 모음"],
    ["bookA", "용어 사전", "낯선 용어를 쉬운 말로, AI 조교도 답해요"],
    ["flame", "응원 영상", "지칠 때 다시 힘을 주는 영상"],
    ["handshake", "제휴 혜택", "수강생 전용 할인 · 혜택"],
    ["sprout", "시작 가이드", "처음 들어와도 할 일이 보이게"],
    ["help", "질문 · 1:1 요청", "FAQ 검색, 안 풀리면 강사님께 바로"],
    ["shieldCheck", "승인제 입장", "승인된 수강생만 들어와요"]
  ];
  // 강사센터는 핵심 화면 세 개만 보여 준다 (메뉴 전체는 공개하지 않음)
  const ADMIN_TABS = [
    { key: "dash", at: 0, title: "대시보드" },
    { key: "students", at: 9.84, title: "수강생 승인 · 진척도" },
    { key: "review", at: 19.89, title: "과제 검수" }
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
    ["heart", "수료 후 관리", "튜토리얼 강의실", "수료 후에도 강의실이 남아 새 자료 · 후기까지"],
    ["refresh", "다음 기수", "강사센터", "커리큘럼 그대로, 다음 기수 바로 시작"]
  ];
  // 단톡방 · 드라이브로 운영할 때와 비교
  const COMPARE = [
    ["강의 자료", "유튜브 · 드라이브 · 단톡방 · 노션에 흩어져 있어요", "주차별 강의실 한곳에 순서대로 정리돼요"],
    ["진도 확인", "누가 어디까지 했는지 일일이 물어봐야 해요", "수강생별 진행률 · 성장 단계가 한눈에 보여요"],
    ["과제 검수", "사진 · 링크를 단톡방에서 하나씩 찾아 확인해요", "자동 검수 뒤 승인 · 보완 요청을 한 번에 해요"],
    ["반복 질문", "같은 질문에 기수마다 다시 답해요", "AI 조교 · FAQ · 용어 사전이 먼저 답해요"],
    ["모집 · 무료 강의", "랜딩 · 전자책을 기수마다 따로 만들고 고쳐요", "강사센터에서 고치면 바로 반영돼요"],
    ["운영 인력", "강사님 혼자, 또는 단톡방 관리자 한 명", "코치 계정에 필요한 메뉴만 나눠 맡겨요"],
    ["수료 후", "단톡방이 닫히면 수강생과의 연결도 끝나요", "강의실이 남아 새 자료로 계속 이어져요"],
    ["수강생이 늘면", "관리할 일이 그만큼 함께 늘어요", "같은 이용료 · 같은 운영 방식 그대로예요"]
  ];
  // 강사센터에서 직접 고치는 메뉴 (실제 강사센터 메뉴 그대로)
  const ADMIN_GROUPS = [
    ["운영", "강사센터에서 관리", [
      ["users", "수강생 · 기수 관리", "누가 어디까지 했는지 보고 기수를 열어요", ["대시보드", "수강생 관리", "기수 관리", "다음 기수 신청"]],
      ["checks", "검수 · 답변 · 코치", "과제와 질문에 답하고 코치와 나눠요", ["과제 검수", "1:1 요청 답변", "코치 관리"]]
    ]],
    ["수강생 화면", "수강생이 보는 강의실", [
      ["palette", "기본 설정", "이름 · 색 · 메뉴를 강사님 브랜드로", ["기본 정보 · 색상 · AI 조교", "메뉴 구성", "시작 가이드"]],
      ["monitorPlay", "배우기", "주차별로 보고 · 하고 · 남겨요", ["주차별 강의", "라이브 다시보기", "과제 · 미션", "모범 과제", "학습 노트 질문"]],
      ["message", "안내 · 소통", "일정과 소식, 궁금한 건 바로", ["수업 캘린더", "클래스 소식", "FAQ", "1:1 상담 채널", "응원 영상"]],
      ["library", "자료 · 혜택", "수료 뒤에도 꺼내 보는 자료", ["강의 자료함", "실무 체크리스트", "용어 사전", "제휴 혜택"]]
    ]],
    ["홍보", "수강생을 모으는 페이지", [
      ["megaphone", "모집 페이지", "소개부터 신청까지 링크 하나로", ["강의 소개 랜딩페이지", "무료강의 전자책 페이지", "받은 질문 모아보기"]]
    ]]
  ];
  const ADMIN_MENUS = [
    ["운영", ["대시보드", "수강생 관리", "기수 관리", "다음 기수 신청", "과제 검수", "1:1 요청 답변", "코치 관리"]],
    ["수강생 화면 콘텐츠", ["기본 정보 · 색상 · AI 조교", "메뉴 구성", "시작 가이드", "주차별 강의", "라이브 다시보기", "과제 · 미션", "모범 과제", "학습 노트 질문", "수업 캘린더", "클래스 소식", "FAQ", "실무 체크리스트", "용어 사전", "강의 자료함", "응원 영상", "1:1 상담 채널", "제휴 혜택"]],
    ["홍보", ["강의 소개 랜딩페이지", "무료강의 전자책 페이지", "받은 질문 모아보기"]]
  ];
  // 기수 운영 방식 (강사센터 ‘다음 기수 신청’과 같은 흐름)
  const COHORT = [
    ["handshake", "1기 입점", "상담 뒤 플랫폼을 세팅하고 첫 기수를 열어요"],
    ["send", "다음 기수 신청", "강사센터에서 기수 · 시작일 · 연락처를 남겨요"],
    ["file", "입금 · 세금계산서", "무통장 입금을 확인하고 세금계산서를 발행해요"],
    ["layers", "기수 오픈", "두잉고가 기수를 열면, 그다음은 강사님이 자유롭게"]
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
    ["지금 쓰는 강의 자료를 옮길 수 있나요?", "네. 강의 영상(유튜브 링크) · 전자책 · 엑셀 양식 · 과제를 강사센터에서 올리면 돼요. 처음 세팅은 두잉고가 함께 도와드려요."],
    ["내 브랜드로 운영할 수 있나요?", "강의 이름 · 색상 · 메뉴 · 로그인 화면 · 강의 소개 페이지까지 강사님 브랜드로 운영해요. 수강생에게는 강사님의 강의 플랫폼으로 보여요."],
    ["코치(조교)와 같이 운영할 수 있나요?", "코치 계정을 만들고 필요한 메뉴만 열어 줄 수 있어요. 과제 검수 · 질문 답변을 나눠서 해요."],
    ["끝난 기수는 어떻게 되나요?", "수료한 뒤에도 강의실은 그대로 남아요. 새 자료를 올리면 이전 기수도 함께 보고, 그 연결이 다음 기수 모집으로 이어져요."],
    ["수강생은 어떻게 로그인하나요?", "회원가입 없이 강사를 고르고 이름과 휴대폰 뒷자리 4자리로 들어와요. 강사님이 승인한 수강생만 들어올 수 있어요."],
    ["다음 기수는 어떻게 여나요?", "강사센터 ‘다음 기수 신청’에 기수 · 시작 예정일 · 연락처를 남기면 담당자가 연락드려요. 입금 확인과 세금계산서 발행이 끝나면 기수를 열어 드리고, 그다음은 강사님이 자유롭게 고쳐요."],
    ["결제는 어떻게 하나요?", "지금은 무통장 입금으로 받고, 입금이 확인되면 세금계산서를 발행해 드려요."],
    ["입점하면 언제부터 쓸 수 있나요?", "강의 자료가 준비돼 있다면 상담 뒤 바로 세팅을 시작해요. 다음 기수 시작일에 맞춰 준비를 마칠 수 있게 일정을 함께 잡아요."]
  ];

  /* ---------- 데이터 (지금 운영 중인 강사) ---------- */
  // 강사님이 지금 강의하는 플랫폼 (카드 이름 옆 배지) — logo 파일이 있으면 로고, 없으면 이름표로 보여요
  const PLATFORMS = {
    ivy: { name: "아이비클래스", en: "아이비클래스", url: "https://www.ivyclass.co.kr/", logo: "assets/platforms/ivyclass-logo-light.png", tone: "ivy" },
    gig: { name: "긱스쿨", en: "긱스쿨", url: "https://gigschool.co.kr/", logo: "assets/platforms/gigschool-logo-light.png", tone: "gig" },
    doogo: { name: "두고클래스", en: "DOOGO CLASS", url: "https://www.doogoclass.com", logo: "assets/brand/doogo-class-word.svg", tone: "doogo" }
  };
  const PLATFORM_OF = { moon: "ivy", choi: "gig" };
  const ORDER = ["moon", "choi"]; // 카드 순서: 문대표 → 초이 → 나머지
  function classes() {
    const rank = (id) => { const i = ORDER.indexOf(id); return i < 0 ? 99 : i; };
    return DB.activeInstructors().slice().sort((a, b) => rank(a.id) - rank(b.id)).map((x) => {
      const c = DB.content(x.id) || {};
      const b = c.brand || {};
      const t = DB.themeOf(b.theme);
      const weeks = c.weeks || [];
      const L = DB.landingOf ? DB.landingOf(x.id) : null;
      const F = DB.freeOf ? DB.freeOf(x.id) : null;
      const ct = (L && L.contact) || {};
      const co = (DB.cohortsOf ? DB.cohortsOf(x.id) : []).filter((k) => k.recruiting && DB.cohortStatus(k) !== "ended").sort((p, q) => String(p.startDate).localeCompare(String(q.startDate)))[0] || null;
      return {
        id: x.id, name: b.name || x.displayName, who: b.instructor || x.displayName, title: b.courseTitle || "", t,
        photo: b.photo || "", field: b.field || b.shortTitle || "",
        yt: b.youtubeChannel || ct.youtube || "", ig: b.instagram || ct.instagram || "", kakao: b.kakaoChannel || ct.kakao || "",
        // ‘N주 과정’은 지금 모집 중인 기수 기준 (예: 문대표 4기 4주) — 모집 중인 기수가 없으면 커리큘럼 주차 수
        weeks: (co && DB.cohortWeeks(co)) || weeks.length, missions: weeks.reduce((n, w) => n + (w.missions || []).length, 0),
        landing: !!(L && L.published), free: !!(F && F.published),
        plat: PLATFORMS[b.platform] || PLATFORMS[PLATFORM_OF[x.id]] || PLATFORMS.doogo
      };
    }).concat(vodOnly());
  }
  // 두잉고 기수 계정 없이 DOOGO CLASS 에서 VOD 를 파는 강사(예: 셀러훈) — 수강생은 두잉고 VOD 강의실에서 들어요. 사진 · 클래스로 가는 카드
  function vodOnly() {
    const X = window.VOD;
    if (!X || !X.V) return [];
    const v = X.V(), off = Array.isArray(v.insOff) ? v.insOff : [], seen = {}, out = [];
    (v.products || []).filter((p) => !p.iid && p.creator && (p.status === "on" || p.status === "soon") && off.indexOf("ext:" + p.creator) < 0).forEach((p) => {
      if (seen[p.creator]) return;
      seen[p.creator] = 1;
      out.push({ id: p.id, vod: "#/vod/p/" + p.id, name: p.creator, who: p.creator, title: p.title, t: null, photo: X.phOf ? X.phOf(p) : p.creatorPhoto || "", field: p.tagline || "",
        yt: "", ig: "", kakao: "", weeks: 0, missions: 0, landing: false, free: false, plat: PLATFORMS.doogo });
    });
    return out;
  }

  /* ---------- 조각 ---------- */
  const mark = (t) => '<mark class="hm-mark">' + t + "</mark>";
  // 첫 화면 로고 — 스낵클 느낌의 DOINGGO 글자 로고 (icons.js doogoClassWord, 강사센터 · 로그인은 예전 doogo + CLASS 배지 그대로)
  const brandLock = (cls) => window.doogoClassWord(cls);
  // 실제 화면 녹화 영상: 처음엔 첫 장면 사진만, 화면에 보이면 영상을 받아 소리 없이 반복 재생 (wireVideos)
  const PAUSE = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg>';
  const video = (vid, alt, ch) => '<video class="hm-vid" muted playsinline loop preload="none" poster="' + IMG + vid + '.webp" data-src="' + IMG + vid + '"' + (ch ? " data-ch" : "") + ' aria-label="' + esc(alt || "") + ' (실제 화면 녹화)"></video>' +
    '<button type="button" class="hm-vid-btn" data-hm-vid aria-label="영상 멈추기">' + PAUSE + "</button>";
  // 휴대폰 틀 — 화면을 가리는 검정 노치(스피커) 없이 깔끔하게
  const phone = (vid, cls, alt, ch) => '<div class="hm-phone ' + (cls || "") + '">' + video(vid, alt, ch) + "</div>";
  // 기능 칸 휴대폰은 입체 무대 위에: 뒤판 · 두께 · 빛 반사 · 바닥 그림자 + 앞에 떠 있는 알림 카드 (스크롤 · 마우스에 따라 기울어짐)
  const fchip = (c, k) => '<div class="hm-fchip hm-fchip-' + k + (c.ic ? "" : " stat") + '" aria-hidden="true">' +
    (c.ic ? icon(c.ic, "sm" + (c.ok ? " ok" : "")) + "<span><b>" + c.b + "</b><small>" + c.s + "</small></span>"
      : "<span><small>" + c.s + "</small><b" + (c.count ? ' data-hm-count="' + c.count + '"' : "") + ">" + c.b + "</b></span>" + (c.bar ? '<i class="hm-chip-bar"><i style="width:' + c.bar + '%"></i></i>' : "")) + "</div>";
  const stage3d = (f) => '<div class="hm-3d"><div class="hm-3d-stage"><span class="hm-3d-sym" aria-hidden="true">' +
    [6, 5, 4, 3, 2, 1, 0].map((k) => '<svg viewBox="0 0 364 380" style="--k:' + k + (k ? "" : ";fill:url(#hm-dsym-g)") + '"><use href="#hm-dsym"/></svg>').join("") + "</span>" +
    phone(f.vid, "hm-frow-phone", f.title + " 화면") + '<i class="hm-3d-glare" aria-hidden="true"></i>' +
    f.chips.map((c, k) => fchip(c, k ? "b" : "a")).join("") + '</div><i class="hm-3d-floor" aria-hidden="true"></i></div>';
  const browser = (vid, cls, alt, ch) => '<div class="hm-browser ' + (cls || "") + '"><div class="hm-browser-bar"><i></i><i></i><i></i><span>www.doinggo.co.kr</span></div><div class="hm-browser-scr">' + video(vid, alt, ch) + "</div></div>";
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
      '<button type="button" class="hm-logo" data-hm-scroll="top" aria-label="두잉고 맨 위로">' + brandLock() + "</button>" + (window.siteSwitch ? window.siteSwitch("dg") : "") +
      '<nav class="hm-nav" aria-label="소개 메뉴">' +
        scrollBtn("hm-classes", "강사진", "hm-nav-a") + scrollBtn("hm-features", "기능 소개", "hm-nav-a") + scrollBtn("hm-students", "수강생 화면", "hm-nav-a") + scrollBtn("hm-pricing", "이용료", "hm-nav-a") + scrollBtn("hm-faq", "자주 묻는 질문", "hm-nav-a") +
      "</nav>" +
      // 오른쪽 위: 강사센터(글자) + 수강생 로그인(빨간 버튼). 입점 문의는 첫 화면 카드 · 강사진 · 맨 아래에서
      '<div class="hm-top-r"><a class="hm-top-link" href="#/center">강사센터</a><a class="hm-btn hm-btn-p hm-btn-sm hm-top-login" href="#/login">수강생 로그인</a></div>' +
    '</div><i class="hm-top-prog" id="hm-prog" aria-hidden="true"></i></header>';
  }

  function hero() {
    // 두잉고 시안(흰 바탕): 왼쪽 글 · 버튼 · 세 가지 약속 + 오른쪽 사진(노트북 · 휴대폰 화면은 실제 강사센터 · 수강생 홈) + 사진 아래로 겹친 기능 카드 3장
    const insList = classes();
    const cards = [["monitorPlay", "강의 운영", "강의 소개부터 주차별 강의 · 자료 · 공지까지 한곳에서 체계적으로 운영해요.", "hm-features"],
      ["users", "수강생 관리", "수강 승인, 진도, 과제 검수와 피드백까지 수강생을 더 가까이에서 챙겨요.", "hm-teachers"],
      ["bot", "AI 학습 지원", "24시간 AI 조교가 과제 · 서류 · 일정 질문에 바로 답해요.", "hm-students"]];
    const ic = (n) => (n === "bars" ? '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20v-6M10 20V9M15 20v-9M20 20V5"/></svg>' : icon(n));
    return '<section class="hm-hero bw-hero" id="hm-hero">' +
      '<div class="hm-wrap"><div class="bw-copy">' +
        '<p class="bw-eyebrow"><span>Doing, GO! 하나씩 해보는 재미</span></p>' +
        '<h1 class="bw-h1">강의는 강사님이,<br>운영은 <em>두잉고</em>가</h1>' +
        '<p class="bw-lead">강의 소개 페이지 · 무료강의 전자책 · 수강생 케어 튜토리얼까지,<br class="bw-br"> <b>강사님 이름으로 된 강의 플랫폼</b> 하나로 운영하세요.</p>' +
        '<div class="bw-ctas"><a class="bw-btn bw-btn-red" href="#/login">' + icon("book") + '수강생 로그인' + arrow() + '</a><button type="button" class="bw-btn bw-btn-line" data-hm-apply>강사님 입점 문의</button></div>' +
        '<ul class="bw-pills">' + [["users", "수강생은 무료"], ["layers", "수강생 수 무제한 · 같은 이용료"], ["refresh", "기수 무제한 운영"]].map((x) => "<li>" + icon(x[0], "sm") + x[1] + "</li>").join("") + "</ul>" +
        '<div class="bw-trust"><span class="bw-avs">' + insList.filter((x) => x.photo).slice(0, 4).map((x) => '<i' + (x.photo ? ' style="background-image:url(' + esc(x.photo) + ')"' : "") + ">" + (x.photo ? "" : esc((x.who || "").slice(0, 1))) + "</i>").join("") + '</span><span><b>많은 강사님들이</b> 두잉고를 사용하고 있어요</span></div>' +
      "</div></div>" +
      '<div class="bw-photo" id="bw-photo" aria-label="노트북과 휴대폰으로 두잉고를 보는 수강생 (화면은 실제 강사센터 · 수강생 홈)"><div class="bw-stage" id="bw-stage">' +
        '<img src="' + IMG + 'bw-photo.webp" alt="" width="982" height="665">' +
        '<video class="bw-bgv" muted loop playsinline autoplay preload="auto" aria-hidden="true" poster="' + IMG + 'bw-photo.webp"><source src="' + IMG + 'bw-photo.mp4" type="video/mp4"><source src="' + IMG + 'bw-photo.webm" type="video/webm"></video>' +
        '<div class="bw-scr bw-lapw" id="bw-lap"><img src="' + IMG + 'bw-admin.webp" alt="" width="1240" height="900"><video class="bw-live" muted loop playsinline autoplay preload="auto" aria-hidden="true"><source src="' + IMG + 'v-admin.mp4" type="video/mp4"><source src="' + IMG + 'v-admin.webm" type="video/webm"></video><i class="bw-glare"></i></div>' +
        '<div class="bw-scr bw-shot" id="bw-ph"><span class="bw-sbar"><b>9:41</b><i></i></span><img src="' + IMG + 'bw-student.webp" alt="" width="780" height="1612"><video class="bw-live" muted loop playsinline autoplay preload="auto" aria-hidden="true"><source src="' + IMG + 'v-home.mp4" type="video/mp4"><source src="' + IMG + 'v-home.webm" type="video/webm"></video><span class="bw-notch"></span><i class="bw-glare"></i></div>' +
      "</div>" +
      '<div class="bw-float bw-float-a" aria-hidden="true">' + icon("check", "sm") + "<span><b>1주차 과제 승인</b><small>OOO 강사님 · 방금</small></span></div>" +
      '<div class="bw-float bw-float-c" aria-hidden="true">' + icon("award", "sm") + "<span><b>수료증 발급</b><small>필수 과제 23개 통과</small></span></div>" +
      '<div class="bw-float bw-float-b" aria-hidden="true"><span><small>3기 평균 진도</small><b>72%</b></span><i class="bw-bar"><i></i></i></div>' +
      "</div>" +
    "</section>";
  }
  // 첫 화면 바로 아래 — 수강생 / 강사님 두 갈래 길 + 숫자 띠 (같은 내용을 한눈에)
  function bwPaths() {
    const nums = [["0원", "수강생 이용료"], ["무제한", "수강생 · 기수"], ["24시간", "AI 조교 답변"], ["8단계", "한 기수 운영 흐름"]];
    return '<section class="bw-paths"><div class="hm-wrap">' +
      '<div class="bw-path-grid">' +
        '<a class="bw-path bw-path-st hm-reveal" style="--i:0" href="#/login"><span class="bw-path-k">수강생이라면</span><b>강사님이 준비한 강의실로<br>바로 들어가세요</b><span class="bw-path-d">주차별 강의 · 과제 · 진도 · 수료증까지 한곳에서. 회원가입 없이 이름과 전화번호 뒷자리로 로그인해요.</span><span class="bw-path-go">수강생 로그인' + arrow() + "</span></a>" +
        '<div class="bw-path bw-path-ins hm-reveal" style="--i:1"><span class="bw-path-k">강사님이라면</span><b>내 이름으로 된<br>강의 플랫폼을 만드세요</b><span class="bw-path-d">강의 소개 페이지 · 무료강의 전자책 · 수강생 케어 시스템을 하나로. 수강생은 무료, 이용료는 하나예요.</span><span class="bw-path-row"><button type="button" class="bw-path-go" data-hm-scroll="hm-features">기능 둘러보기' + arrow() + '</button><button type="button" class="bw-path-sub" data-hm-apply>입점 문의</button></span></div>' +
      "</div>" +
      '<ul class="bw-nums">' + nums.map((x, i) => { const m = /^(\d+)(.*)$/.exec(x[0]); return '<li class="hm-reveal" style="--i:' + i + '"><b' + (m && +m[1] ? ' data-count="' + m[1] + '" data-unit="' + m[2] + '">0' + m[2] : ">" + x[0]) + "</b><small>" + x[1] + "</small></li>"; }).join("") + "</ul>" +
    "</div></section>";
  }
  // 두 갈래 아래, 두잉고로 할 수 있는 일이 양쪽으로 흘러가는 띠 (멈춰 있는 구역 사이에 계속 움직이는 리듬)
  function bwMarquee() {
    const a = ["주차별 강의", "과제 자동 검수", "24시간 AI 조교", "수료증 발급", "진도 · 성장 단계", "1:1 상담 채널", "코치와 나눠 운영"];
    const b = ["강의 소개 랜딩페이지", "무료강의 전자책", "기수 무제한 운영", "수강생은 무료", "라이브 다시보기", "모범 과제", "다음 기수 신청"];
    const row = (list, cls) => { const one = list.map((t) => "<span>" + t + '</span><i aria-hidden="true"></i>').join(""); return '<div class="bw-mq-row ' + cls + '"><div class="bw-mq-track">' + one + one + "</div></div>"; };
    return '<section class="bw-mq" aria-label="두잉고로 할 수 있는 일">' + row(a, "bw-mq-l") + row(b, "bw-mq-r") + "</section>";
  }
  // 두고그룹 홈페이지(doogogroup.com)와 같은 스크롤 모션
  //  ① 구역 제목: 줄마다 가려진 틀 안에서 아래→위로 올라옴(줄당 0.09초)  ② 큰 문장: 글자가 하나씩 새겨짐(흐림→선명 · 아래→제자리, 글자당 26ms) → 강조어 빨강 + 밑줄
  //  ③ 숫자 띠: 숫자 릴이 굴러 올라가고 아래 선이 그어짐 — 화면 밖으로 나갔다 들어오면 다시 재생
  //  OS ‘애니메이션 줄이기’와 상관없이 재생 (두고그룹 홈페이지와 같은 정책)
  function bwMotion() {
    // ① 제목 줄 나누기
    document.querySelectorAll(".hm-shead .hm-h2:not([data-bw-lines])").forEach((h) => {
      h.setAttribute("data-bw-lines", "");
      h.innerHTML = h.innerHTML.split(/<br\s*\/?>/i).map((t, i) => '<span class="bw-line" style="--li:' + i + '"><span>' + t.trim() + "</span></span>").join("");
    });
    // ② 글자 새김
    document.querySelectorAll(".hm-answer p:not([data-bw-eg]), .hm-life-copy .hm-h2:not([data-bw-eg])").forEach((el) => {
      el.setAttribute("data-bw-eg", "");
      const full = el.textContent.replace(/\s+/g, " ").trim(); let ci = 0, ai = 0;
      const vis = document.createElement("span"); vis.className = "bw-eg"; vis.setAttribute("aria-hidden", "true");
      const build = (node, target, accent) => Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) n.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return; if (/^\s+$/.test(part)) { target.appendChild(document.createTextNode(" ")); return; }
          const w = document.createElement("span"); w.className = "bw-eg-w";
          Array.from(part).forEach((ch) => { const c = document.createElement("span"); c.className = "bw-eg-c"; c.textContent = ch; c.style.setProperty("--ci", ci++); if (accent) c.style.setProperty("--ai", ai++); w.appendChild(c); });
          target.appendChild(w);
        });
        else if (n.nodeName === "BR") target.appendChild(document.createElement("br"));
        else if (n.nodeType === 1) { if (n.classList.contains("hm-mark")) { const a = document.createElement("span"); a.className = "bw-eg-accent"; target.appendChild(a); build(n, a, true); } else if (!n.classList.contains("bw-line")) build(n, target, accent); else build(n.firstChild || n, target, accent); }
      });
      build(el, vis, false);
      const sr = document.createElement("span"); sr.className = "sr-only"; sr.textContent = full;
      el.textContent = ""; el.appendChild(sr); el.appendChild(vis); el.classList.add("bw-eg-on-ready");
      let t = 0; const total = ci * 26 + 700;
      const play = () => { if (el.classList.contains("is-on")) return; el.classList.add("is-on"); clearTimeout(t); t = setTimeout(() => el.classList.add("is-accent"), total); };
      const reset = () => { if (!el.classList.contains("is-on")) return; clearTimeout(t); el.classList.add("no-tr"); el.classList.remove("is-on", "is-accent"); void el.offsetWidth; el.classList.remove("no-tr"); };
      if (!("IntersectionObserver" in window)) { el.classList.add("is-on", "is-accent"); return; }
      new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting && e.intersectionRatio >= 0.35) play(); else if (!e.isIntersecting) reset(); }), { threshold: [0, 0.35] }).observe(el);
    });
    // ③ 숫자 릴 + 아래 선
    const nums = document.querySelector(".bw-nums:not([data-bw-facts])");
    if (nums) {
      nums.setAttribute("data-bw-facts", "");
      nums.querySelectorAll("li").forEach((li, i) => {
        li.style.setProperty("--fi", i);
        const b = li.querySelector("b"); const m = /^(\d+)(.*)$/.exec(b.dataset.count ? b.dataset.count + (b.dataset.unit || "") : b.textContent);
        if (m) { const n = +m[1]; b.removeAttribute("data-count"); b._bwc = true; b.innerHTML = '<span class="sr-only">' + n + m[2] + '</span><span class="bw-reel-w" aria-hidden="true" style="--n:' + n + '"><span class="bw-reel">' + Array.from({ length: n + 1 }, (_, d) => "<span>" + d + "</span>").join("") + "</span></span>" + (m[2] ? '<span class="bw-unit">' + m[2] + "</span>" : ""); }
        b.insertAdjacentHTML("afterend", '<span class="bw-rule" aria-hidden="true"><i></i></span>');
      });
      nums.classList.add("is-ready");
      const fio = "IntersectionObserver" in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting && e.intersectionRatio >= 0.3) e.target.classList.add("is-on"); else if (!e.isIntersecting) e.target.classList.remove("is-on"); }), { threshold: [0, 0.3] }) : null;
      nums.querySelectorAll("li").forEach((li) => (fio ? fio.observe(li) : li.classList.add("is-on")));
    }
  }
  // 휴대폰: 첫 화면을 지나면 아래에 고정되는 두 버튼 (수강생 로그인 · 입점 문의)
  function bwDock() {
    return '<div class="bw-dock" id="bw-dock"><a class="bw-dock-a" href="#/login">' + icon("book", "sm") + '수강생 로그인</a><button type="button" class="bw-dock-b" data-hm-apply>' + icon("handshake", "sm") + "입점 문의</button></div>";
  }
  // 사진 속 노트북 · 휴대폰 화면 네 귀퉁이(사진 982 × 665 기준)에 실제 화면을 원근 그대로 붙이고, 사진 틀 너비에 맞춰 키운다
  function bwStage() {
    const Q = { "bw-lap": [1240, 900, [[134.5, 166.5], [619.5, 148.5], [589.5, 525.5], [82.5, 519.5]]], "bw-ph": [780, 1612, [[593, 222], [785, 220], [781, 610], [591, 607]]] };
    const hom = (w, h, q) => {
      const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q, dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
      const den = dx1 * dy2 - dx2 * dy1, g = (sx * dy2 - dx2 * sy) / den, k = (dx1 * sy - sx * dy1) / den;
      const m = [(x1 - x0 + g * x1) / w, (y1 - y0 + g * y1) / w, 0, g / w, (x3 - x0 + k * x3) / h, (y3 - y0 + k * y3) / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1];
      return "matrix3d(" + m.map((v) => +v.toFixed(8)).join(",") + ")";
    };
    // 사진 속 화면이 실제 녹화 영상으로 ‘켜지게’ — 재생이 시작되면 사진 위로 서서히, 화면 밖이면 멈춤
    // 휴대폰: 사진 속 노트북 · 휴대폰 화면 영상은 캡처 사진으로 (영상 3개를 동시에 돌리면 스크롤이 무거움 — 배경 영상만 재생)
    if (window.matchMedia("(max-width: 860px)").matches) document.querySelectorAll(".bw-live").forEach((v) => v.remove());
    document.querySelectorAll(".bw-live, .bw-bgv").forEach((v) => {
      if (v._bw) return; v._bw = true; v.muted = true;
      const on = () => (v.closest(".bw-scr") || v).classList.add("is-on");
      v.addEventListener("playing", on); if (!v.paused && v.readyState > 2) on();
      const go = () => { const p = v.play(); if (p && p.catch) p.catch(() => {}); };
      if ("IntersectionObserver" in window) new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? go() : v.pause())), { threshold: 0.15 }).observe(v); else go();
    });
    // 마우스를 따라 사진이 살짝 기울어지는 입체감 (마우스가 있는 PC만, 움직임 줄이기 설정이면 끔)
    const hp = document.getElementById("bw-photo"), hh = document.getElementById("hm-hero");
    if (false && hp && hh && !hh._bwTilt && window.matchMedia("(hover: hover) and (pointer: fine)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      hh._bwTilt = true;
      hh.addEventListener("pointermove", (e) => { const r = hh.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; hp.style.setProperty("--ry", (x * 5).toFixed(2) + "deg"); hp.style.setProperty("--rx", (-y * 3).toFixed(2) + "deg"); });
      hh.addEventListener("pointerleave", () => { hp.style.setProperty("--ry", "0deg"); hp.style.setProperty("--rx", "0deg"); });
    }
    bwMotion();
    // 숫자 띠: 화면에 들어오면 0부터 올라가는 숫자
    const cio = "IntersectionObserver" in window ? new IntersectionObserver((es) => es.forEach((e) => { if (!e.isIntersecting) return; cio.unobserve(e.target); const el = e.target, to = +el.dataset.count, u = el.dataset.unit || "", t0 = performance.now(), dur = 1300;
      const tick = (t) => { const k = Math.min(1, (t - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - k, 3))); el.textContent = v + u; if (k < 1) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }), { threshold: 0.6 }) : null;
    document.querySelectorAll("[data-count]").forEach((el) => { if (el._bwc) return; el._bwc = true; if (cio) cio.observe(el); else el.textContent = el.dataset.count + (el.dataset.unit || ""); });
    Object.keys(Q).forEach((id) => { const el = document.getElementById(id); if (el) el.style.transform = hom(Q[id][0], Q[id][1], Q[id][2]); });
    const ph = document.getElementById("bw-photo"), st = document.getElementById("bw-stage");
    if (!ph || !st) return;
    const fit = () => st.style.setProperty("--k", ph.clientWidth / 982);
    fit();
    if ("ResizeObserver" in window) new ResizeObserver(fit).observe(ph); else window.addEventListener("resize", fit);
    // 첫 화면을 지나면 휴대폰 아래 고정 버튼을 보이기
    const dock = document.getElementById("bw-dock"), hero = document.getElementById("hm-hero");
    if (dock && hero && hero._bwDock !== true) { hero._bwDock = true; if ("IntersectionObserver" in window) new IntersectionObserver((es) => es.forEach((e) => { const d = document.getElementById("bw-dock"); if (d) d.classList.toggle("on", !e.isIntersecting && e.boundingClientRect.top < 0); })).observe(hero); }
    // 스크롤 끊김 줄이기 ① 글꼴: 한글 글꼴(Pretendard)은 글자 묶음별로 나뉘어 있어, 내려가다 새 글자를 만날 때마다 파일을 받아 다시 그렸다 → 처음에 이 화면 글자 묶음을 미리 모두 받기
    if (!window._bwFonts && document.fonts && document.fonts.load) { window._bwFonts = true; const txt = (document.querySelector(".hm") || document.body).innerText || ""; const uniq = Array.from(new Set(txt.replace(/\s+/g, ""))).join(""); for (let i = 0; i < uniq.length; i += 400) { const part = uniq.slice(i, i + 400); ["400", "600", "700", "800"].forEach((w) => document.fonts.load(w + ' 16px "Pretendard Variable"', part).catch(() => {})); } }
    // ② 화면 밖에서는 계속 도는 애니메이션(흐르는 띠 · 떠 있는 알림)을 멈춤
    if ("IntersectionObserver" in window) { const pio = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle("bw-off", !e.isIntersecting)), { rootMargin: "100px 0px" }); document.querySelectorAll(".bw-mq, #hm-hero").forEach((el) => { if (!el._bwp) { el._bwp = true; pio.observe(el); } }); }
  }

  // 기수가 늘수록 버거워지는 운영 → 두잉고의 세 가지
  function problem() {
    return '<section class="hm-sec hm-soft" id="hm-why"><div class="hm-wrap">' +
      secHead("target", "기수가 늘수록, 운영이 버거워지셨나요?", "1기 · 2기 · 3기를 이어 가는 강사님들이 가장 많이 겪는 일이에요.") +
      '<div class="hm-pains">' + PAINS.map((x, i) => '<article class="hm-pain hm-hov hm-reveal"' + d(i) + '><span class="hm-ic hm-ic-mute">' + icon(x[0]) + "</span><h3>" + x[1] + "</h3><p>" + x[2] + "</p></article>").join("") + "</div>" +
      '<div class="hm-answer hm-reveal"><span class="hm-sym" aria-hidden="true"></span><p>두잉고는 강의 운영에 필요한 ' + mark("3가지") + "를 강사님 이름의 플랫폼 하나에 담았어요.</p>" + scrollBtn("hm-features", "3가지 보기" + arrow(), "hm-answer-go") + "</div>" +
    "</div></section>";
  }

  // 한 기수 운영 흐름 — 모집부터 다음 기수까지 어느 화면이 맡는지
  function flow() {
    return '<section class="hm-sec hm-flow-sec" id="hm-flow"><div class="hm-wrap">' +
      secHead("activity", "한 기수 운영, 처음부터 끝까지 한곳에서", "모집 → 무료 강의 → 신청 · 승인 → 주차별 학습 → 과제 피드백 → 수료 → 수료 후 관리 → 다음 기수. 지금 단톡방 · 드라이브 · 노션 · 구글폼으로 나눠 하던 일을 두잉고 하나로 이어요.", scrollBtn("hm-compare", "지금 방식과 비교" + arrow(), "hm-shead-link")) +
      '<ol class="hm-flow">' + FLOW.map((x, i) => '<li class="hm-flow-i hm-hov hm-reveal"' + d(i) + '><span class="hm-flow-no">' + String(i + 1).padStart(2, "0") + '</span><span class="hm-ic hm-ic-sm">' + icon(x[0]) + "</span><b>" + x[1] + '</b><em>' + x[2] + "</em><p>" + x[3] + "</p></li>").join("") + "</ol>" +
    "</div></section>";
  }

  // 강사님이 받는 세 가지 — 실제 화면과 함께 (왼쪽 · 오른쪽 번갈아)
  function features() {
    const row = (f, i) => '<article class="hm-frow hm-reveal' + (i % 2 ? " rev" : "") + '">' +
      '<div class="hm-frow-copy"><p class="hm-frow-top"><span class="hm-frow-no">' + f.no + '</span><span class="hm-frow-tag">' + f.tag + "</span></p>" +
        "<h3>" + f.title + '</h3><p class="hm-frow-lead">' + f.lead + "</p>" + checks(f.pts) +
        '<ul class="hm-frow-more">' + f.more.map((m) => '<li><span class="hm-ic hm-ic-xs">' + icon(m[0]) + "</span><span><b>" + m[1] + "</b><small>" + m[2] + "</small></span></li>").join("") + "</ul></div>" +
      '<div class="hm-frow-art"><div class="hm-show-glow" aria-hidden="true"></div>' + stage3d(f) + '<p class="hm-cap">' + icon("play", "xs") + '실제 화면 녹화 · 예시 데이터<span class="hm-3d-hint">' + icon("swap", "xs") + "끌어서 돌려 보기</span></p></div>" +
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
        '<div class="hm-cmp-row hm-cmp-head" role="row"><span role="columnheader">항목</span><span role="columnheader">지금 방식 <small>단톡방 · 드라이브 · 노션</small></span><span role="columnheader">' + brandLock("hm-word-xs") + "</span></div>" +
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
      '<div class="bw-mn bw-oo hm-reveal">' +
        '<div class="bw-oo-top">' +
          '<div class="bw-oo-copy"><p class="bw-oo-k"><i class="bw-sw on" aria-hidden="true"><i></i></i>ON / OFF</p>' +
            '<h3 class="bw-oo-h">필요한 것만, 편하게</h3>' +
            '<p class="bw-oo-sub">ON/OFF 기능으로 강사님이 딱 필요한 기능만 쓰세요. 켜고 끄면 수강생 화면 메뉴에 바로 반영돼요.</p>' +
            '<ul class="bw-oo-pts">' + [["끄면 수강생 메뉴에서 바로 빠져요", "1:1 상담 · 제휴 혜택처럼 안 쓰는 메뉴는 끄면 끝"], ["다시 켜면 그대로 돌아와요", "올려 둔 내용은 지워지지 않아요"], ["코치 계정도 메뉴별로", "코치에게는 필요한 메뉴만 열어 줘요"]].map((x) => "<li>" + icon("check", "sm") + "<span><b>" + x[0] + "</b>" + x[1] + "</span></li>").join("") + "</ul>" +
          "</div>" +
          '<div class="bw-oo-v">' + browser("v-menus", "hm-menus-browser", "강사센터 메뉴 구성 ON/OFF", false) + '<p class="hm-cap">' + icon("play", "xs") + "실제 강사센터 ‘메뉴 구성’ 화면 녹화 · 끄면 오른쪽 미리보기에서 바로 빠져요</p></div>" +
        "</div>" +
        '<div class="bw-mn-h"><div><b>강사센터 메뉴 ' + ADMIN_GROUPS.reduce((n, g) => n + g[2].reduce((k, c) => k + c[3].length, 0), 0) + '개, 눌러서 켜고 꺼 보세요</b><span>켜진 메뉴 <em class="bw-oo-n" data-oo-n>' + ADMIN_GROUPS.reduce((n, g) => n + g[2].reduce((k, c) => k + c[3].length, 0), 0) + '</em>개 · 강사님이 쓰는 것만 남겨 두세요.</span></div>' +
          '<ul class="bw-mn-legend">' + ADMIN_GROUPS.map((g, i) => '<li class="t' + i + '"><i></i>' + g[0] + " <small>" + g[2].reduce((k, c) => k + c[3].length, 0) + "</small></li>").join("") + "</ul></div>" +
        '<div class="bw-mn-g">' + ADMIN_GROUPS.map((g, i) => g[2].map((c) => '<div class="bw-mn-c t' + i + '"><div class="bw-mn-ch"><span class="bw-mn-ic">' + icon(c[0]) + '</span><div><em>' + g[0] + "</em><b>" + c[1] + " <small>" + c[3].length + "</small></b></div></div><p>" + c[2] + "</p><ul>" +
          c[3].map((m) => '<li><button type="button" class="bw-tg on" aria-pressed="true"><span>' + m + '</span><i class="bw-sw" aria-hidden="true"><i></i></i></button></li>').join("") + "</ul></div>").join("")).join("") + "</div></div>" +
    "</div></section>";
  }

  // 이용료 구조 — 금액은 상담 때 안내 (화면에 숫자를 적지 않는다)
  function pricing() {
    const scale = [["100명", 20], ["300명", 60], ["500명", 100]];
    return '<section class="hm-sec" id="hm-pricing"><div class="hm-wrap">' +
      secHead("coins", "수강생은 무료, 강사님은 하나의 이용료", "수강생이 100명이든 500명이든 이용료는 같아요. 수강생이 늘어도 비용 걱정 없이 다음 기수를 여세요.") +
      '<div class="hm-plans">' +
        '<article class="hm-plan hm-plan-main hm-reveal"' + d(0) + '><p class="hm-plan-who">강사님</p><b class="hm-plan-price">정액 이용료</b><p class="hm-plan-desc">수강생 수와 상관없이 강사님 한 분당 정해진 이용료</p>' +
          checks(["강의 소개 랜딩페이지 · 무료강의 전자책 · 튜토리얼 시스템 모두 포함", "수강생 수 · 기수 제한 없음", "강사센터 · 코치 계정 · AI 조교 포함", "처음 세팅을 함께 도와드려요"]) +
          applyBtn("이용료 상담 받기" + arrow(), "hm-btn hm-btn-p hm-btn-lg hm-btn-block") + '<small class="hm-plan-foot">정확한 이용료는 입점 상담 때 안내해 드려요.</small></article>' +
        '<article class="hm-plan hm-reveal"' + d(1) + '><p class="hm-plan-who">수강생</p><b class="hm-plan-price">0<small>원</small></b><p class="hm-plan-desc">강사님 강의를 신청한 수강생은 모두 무료</p>' +
          checks(["회원가입 없는 승인제 로그인", "휴대폰 · PC 어디서나, 앱 설치 없이", "수료 후에도 강의실은 그대로", "24시간 AI 조교 · 1:1 상담"]) + "</article>" +
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
  // 강사 SNS — 한눈에 알아보게 실제 서비스 색 마크 (유튜브 빨강 · 인스타 그라데이션 · 카카오 노랑)
  const SNS = {
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="4.5" width="22" height="15" rx="4.5" fill="#ff0000"/><path d="M9.8 8.6v6.8l5.9-3.4z" fill="#fff"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="hm-ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#feda75"/><stop offset=".35" stop-color="#fa7e1e"/><stop offset=".65" stop-color="#d62976"/><stop offset="1" stop-color="#4f5bd5"/></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="6" fill="url(#hm-ig)"/><rect x="6.5" y="6.5" width="11" height="11" rx="3.5" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12" r="2.6" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="16.6" cy="7.4" r="1" fill="#fff"/></svg>',
    kakao: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="#fee500"/><path d="M12 6.2c-3.6 0-6.4 2.2-6.4 5 0 1.8 1.2 3.4 3 4.3l-.6 2.3 2.6-1.7c.5.1.9.1 1.4.1 3.6 0 6.4-2.2 6.4-5s-2.8-5-6.4-5z" fill="#3c1e1e"/></svg>'
  };
  const SILHOUETTE = '<svg class="hm-tc-ph" viewBox="0 0 200 250" aria-hidden="true"><circle cx="100" cy="92" r="44"/><path d="M18 250c4-58 40-92 82-92s78 34 82 92Z"/></svg>';
  // doogo 심볼(링 · 기둥 · 재생 표시)을 크게 — 기능 칸 휴대폰 뒤 · 강사 카드 뒤 배경. 페이지에 한 번만 정의하고 <use> 로 (여러 겹 = 입체 두께)
  const DSYM_DEFS = '<svg class="hm-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>' +
    '<linearGradient id="hm-dsym-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ee5a64"/><stop offset=".5" stop-color="#d21021"/><stop offset="1" stop-color="#a50b18"/></linearGradient>' +
    '<symbol id="hm-dsym" viewBox="0 0 364 380"><path d="M265 333.8L276.8 326.2L288 317.7L298.4 308.3L308 298.1L316.7 287.1L324.4 275.3L331.1 263L336.7 250.2L341.2 236.9L344.6 223.3L346.9 209.4L347.9 195.4L347.8 181.4L346.5 167.4L344 153.6L340.3 140.1L335.5 126.9L329.7 114.2L322.7 102L314.8 90.4L305.9 79.5L296.1 69.5L285.5 60.3L274.2 52L262.2 44.7L249.7 38.4L236.6 33.3L223.2 29.2L209.5 26.3L195.6 24.6L181.5 24L167.5 24.6L153.6 26.4L139.9 29.4L126.5 33.6L113.5 38.8L101 45.1L89 52.5L77.7 60.8L67.2 70.1L57.5 80.2L48.7 91.1L40.8 102.7L33.9 115L28.1 127.7L23.4 140.9L19.8 154.5L17.4 168.3L16.2 182.3L16.1 196.3L17.2 210.3L19.6 224.2L23 237.8L27.6 251L33.3 263.8L40.1 276.1L47.9 287.8L56.6 298.8L66.2 309L76.7 318.3L87.9 326.8L99.8 334.2L112.3 340.6L125.2 346L125.2 346L131.9 347.5L138.6 347.2L145.1 345.1L150.8 341.5L155.4 336.5L158.5 330.4L160 323.8L159.7 317L157.7 310.6L154 304.8L149 300.3L143 297.1L143 297.1L134.1 293.5L125.5 289L117.4 283.9L109.7 278.1L102.5 271.7L95.9 264.7L89.9 257.2L84.5 249.1L79.9 240.7L76 231.9L72.8 222.8L70.4 213.5L68.9 204L68.1 194.4L68.1 184.7L69 175.1L70.6 165.6L73.1 156.3L76.3 147.2L80.3 138.5L85 130.1L90.4 122.1L96.5 114.6L103.2 107.7L110.4 101.3L118.1 95.6L126.4 90.5L135 86.2L143.9 82.6L153.1 79.7L162.5 77.7L172.1 76.4L181.7 76L191.3 76.4L200.9 77.6L210.3 79.6L219.5 82.4L228.5 85.9L237.1 90.2L245.3 95.2L253.1 100.9L260.4 107.2L267.1 114.1L273.2 121.6L278.6 129.5L283.4 137.9L287.4 146.7L290.7 155.7L293.2 165L294.9 174.5L295.8 184.1L295.9 193.7L295.2 203.3L293.7 212.8L291.4 222.2L288.2 231.3L284.4 240.1L279.8 248.6L274.5 256.7L268.5 264.2L261.9 271.3L254.8 277.7L247.1 283.6L239 288.7L265 333.8L258.7 336.4L252 337.2L245.3 336.4L239 333.8L233.6 329.6L229.5 324.2L226.9 318L226 311.2L226.9 304.5L229.5 298.2L233.6 292.9L239 288.7ZM94.9 192.8L169 266.9L274.6 146.1L244.5 119.8L167 208.3L123.2 164.5Z"/></symbol>' +
    "</defs></svg>";
  // 깨끗한 주소(/doinggo)에서는 <base href="/"> 가 있어 #아이디 그림 참조를 이 문서 주소로 바꿔 줘요 (Safari 가 다른 문서로 읽지 않게)
  const fragFix = (h) => (ROUTE.clean ? h.replace(/(href="|url\()#(hm-[\w-]+)/g, (m, a, id) => a + ROUTE.frag(id)) : h);
  const DSYM = '<svg class="hm-tc-sym" viewBox="-4 -4 384 400" aria-hidden="true">' +
    [6, 5, 4, 3, 2, 1].map((k) => '<use href="#hm-dsym" class="hm-tc-ex" x="' + (k * 1.6).toFixed(1) + '" y="' + (k * 2).toFixed(1) + '"/>').join("") +
    '<use href="#hm-dsym" class="hm-tc-face" style="fill:url(#hm-dsym-g)"/></svg>';
  function classList(list) {
    // 강사 유튜브 · 인스타그램 · 카카오톡: 서비스 마크 + 이름표 (무엇으로 가는 링크인지 바로 보이게)
    const sns = (x) => [["youtube", x.yt, "강사 유튜브"], ["instagram", x.ig, "인스타그램"], ["kakao", x.kakao, "카카오톡 채널"]]
      .filter((v) => /^https?:\/\//i.test(v[1]))
      .map((v) => '<a class="hm-sns hm-sns-ic hm-sns-' + v[0] + '" href="' + esc(v[1]) + '" target="_blank" rel="noopener" title="' + v[2] + '" aria-label="' + esc(x.who) + " " + v[2] + ' (새 창)">' + SNS[v[0]] + "</a>").join("");
    // 강의 중인 플랫폼 배지: 로고(또는 이름표) + ↗ — 누르면 그 플랫폼으로
    const plat = (x) => { const p = x.plat; if (!p) return "";
      return '<a class="hm-plat hm-plat-' + p.tone + '" href="' + esc(p.url) + '" target="_blank" rel="noopener" title="' + esc(x.who + " · " + p.name + "에서 강의 중") + '" aria-label="' + esc(x.who + " 강사님이 강의하는 곳: " + p.name) + ' (새 창)">' +
        '<span class="hm-plat-k"><i aria-hidden="true"></i>강의 중</span>' + (p.logo ? (p.plate ? '<span class="hm-plat-plate">' : "") + '<img class="hm-plat-logo" src="' + esc(p.logo) + '" alt="' + esc(p.en || p.name) + '">' + (p.plate ? "</span>" : "") : '<b class="hm-plat-name">' + esc(p.name) + "</b>") + icon("arrowUpRight", "xs") + "</a>"; };
    const card = (x, i) => {
      // 액자(연한 바탕 + 큰 빨간 3D doogo 심볼) 위로 누끼 사진(허리 위까지)의 머리가 살짝 튀어나오게
      const photo = '<span class="hm-tc-frame">' + DSYM + (x.photo ? "" : SILHOUETTE) + "</span>" +
        (x.photo ? '<span class="hm-tc-cut"><img src="' + esc(x.photo) + '" alt="' + esc(x.who) + ' 강사" decoding="async"></span>' : "") +
        '<span class="hm-tc-tag">' + (x.vod ? "VOD 클래스" : x.weeks + "주 과정") + "</span>";
      return '<article class="hm-tc hm-reveal" style="--i:' + i + '">' +
        (x.vod ? '<a class="hm-tc-photo" href="' + esc(x.vod) + '" aria-label="' + esc(x.who) + ' 클래스 보기">' + photo + "</a>" : x.landing ? '<a class="hm-tc-photo" href="#/p/' + esc(x.id) + '" aria-label="' + esc(x.who) + ' 강의 소개">' + photo + "</a>" : '<div class="hm-tc-photo">' + photo + "</div>") +
        '<div class="hm-tc-body"><div class="hm-tc-head"><h3>' + esc(x.who) + '</h3>' + '<div class="hm-tc-sns">' + plat(x) + sns(x) + "</div>" + '</div><p class="hm-tc-field">' + esc(x.field) + '</p><p class="hm-tc-course">' + esc(x.title) + "</p></div>" +
        // 이름 옆: 강사 유튜브 표시 · 아래: 강의 소개 · 무료 강의 두 버튼 → 수강생 로그인 (한 줄 전체) — 카드끼리 버튼 높이가 맞게
        '<div class="hm-tc-foot">' + (x.vod
          // DOOGO CLASS VOD 강사: 미리보기 · 클래스 보기
          ? '<div class="hm-tc-links one"><a class="hm-tc-a" href="' + esc(x.vod) + '">' + icon("circlePlay", "xs") + "무료 미리보기</a>" +
            '<a class="hm-tc-login" href="' + esc(x.vod) + '">DOOGO CLASS에서 보기' + icon("arrowRight", "xs") + "</a></div>"
          : '<div class="hm-tc-links' + (x.landing && x.free ? "" : " one") + '">' +
            (x.landing ? '<a class="hm-tc-a" href="#/p/' + esc(x.id) + '">' + icon("user", "xs") + "강사 소개</a>" : "") +
            (x.free ? '<a class="hm-tc-a" href="#/free/' + esc(x.id) + '">' + icon("circlePlay", "xs") + "무료 강의</a>" : "") +
            '<a class="hm-tc-login" href="#/login?ins=' + esc(x.id) + '">수강생 로그인' + icon("arrowRight", "xs") + "</a></div>") + "</div>" +
      "</article>";
    };
    return '<section class="hm-sec" id="hm-classes"><div class="hm-wrap">' +
      secHead("award", "지금 두잉고로 강의하는 강사님", "강사님마다 자기 이름 · 색 · 커리큘럼으로 운영하고 있어요. 강의 소개와 무료 강의 페이지도 직접 눌러 보세요.", applyBtn("입점 문의" + arrow(), "hm-shead-link")) +
      // 강사진 슬라이드: 좌우 화살표 · 끌어서 넘기기 · 진행 막대 (강사님이 늘어나면 그대로 이어져요)
      '<div class="hm-tcs-wrap" data-hm-tcs>' +
        '<button type="button" class="hm-tcs-arrow prev" data-hm-tc="-1" aria-label="이전 강사님">' + icon("chevLeft") + "</button>" +
        '<div class="hm-tcs" id="hm-tcs" tabindex="0" aria-label="강사님 목록 (좌우로 넘겨 보세요)">' + list.map(card).join("") +
          '<article class="hm-tc hm-tc-next hm-reveal" style="--i:' + list.length + '"><div class="hm-tc-next-in"><span class="hm-tc-next-ic">' + icon("plus") + "</span><b>다음 강사님의 자리</b><p>강사님의 강의도<br>두잉고로 옮겨 드려요</p>" + applyBtn("입점 문의하기" + arrow(), "hm-btn hm-btn-p hm-btn-sm") + "</div></article>" +
        "</div>" +
        '<button type="button" class="hm-tcs-arrow next" data-hm-tc="1" aria-label="다음 강사님">' + icon("chevRight") + "</button>" +
        '<div class="hm-tcs-bar" aria-hidden="true"><i></i></div>' +
      "</div>" +
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

  const FAQ_ITEM = (q, i) => '<details class="hm-faq"' + (i < 2 ? " open" : "") + "><summary><span>Q</span>" + q[0] + icon("chevDown", "sm") + "</summary><p>" + q[1] + "</p>" +
        (q[2] ? '<div class="hm-faq-cta">' + applyBtn("이용료 상담 받기" + arrow(), "hm-btn hm-btn-p hm-btn-sm") + "</div>" : "") + "</details>";
  function faq() {
    return '<section class="hm-sec" id="hm-faq"><div class="hm-wrap hm-faq-in">' +
      secHead("help", "자주 묻는 질문", "이용료 · 기수 운영 · 자료 옮기기 · 수강생 로그인까지, 입점 전에 가장 많이 물어보시는 것들이에요.", applyBtn("1:1 입점 상담" + arrow(), "hm-shead-link")) +
      '<div class="hm-faqs hm-reveal">' + [FAQS.slice(0, Math.ceil(FAQS.length / 2)).map((q, j) => [q, j]), FAQS.slice(Math.ceil(FAQS.length / 2)).map((q, j) => [q, j + Math.ceil(FAQS.length / 2)])].map((col) => '<div class="hm-faq-col">' + col.map(([q, i]) => FAQ_ITEM(q, i)).join("") + "</div>").join("") + "</div>" +
    "</div></section>";
  }

  function finalCta() {
    const pts = [["headset", "상담은 무료", "강의 방식 · 자료 · 일정부터 함께 정리해요"], ["layers", "처음 세팅을 함께", "랜딩 · 전자책 · 커리큘럼을 같이 만들어요"], ["users", "수강생은 무료", "수강생 수와 상관없이 같은 이용료"]];
    return '<section class="hm-final"><div class="hm-wrap hm-final-in">' +
      '<div class="hm-final-copy"><p class="hm-final-k">' + icon("sparkles", "xs") + "다음 기수 준비, 지금 시작하세요</p>" +
        '<h2 class="hm-h2">다음 기수부터,<br>' + mark("두잉고") + "로 운영해 보세요</h2>" +
        "<p>강의 소개 랜딩페이지 · 무료강의 전자책 · 튜토리얼 시스템을 강사님 이름으로. 문의를 남겨 주시면 확인 후 바로 연락드려요.</p>" +
        '<div class="hm-cta">' + applyBtn("입점 문의하기" + arrow(), "hm-btn hm-btn-p hm-btn-lg") + "</div></div>" +
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
    // 사업자 정보 두 줄: ① 상호(굵게) · 대표 · 사업자등록번호 · 통신판매업 ② 주소 · 우편번호 · 연락처 · 호스팅
    const row1 = [
      ["", "<strong>" + esc(S.company || "(주)두고홀딩스") + "</strong>"], S.ceo && ["대표", esc(S.ceo)],
      S.bizNo && ["사업자등록번호", esc(S.bizNo) + (bizDigits.length === 10 ? " " + ext("https://www.ftc.go.kr/bizCommPop.do?wrkr_no=" + bizDigits, "사업자정보확인", "hm-foot-chk") : "")],
      S.mailOrderNo && ["통신판매업신고", esc(S.mailOrderNo)]
    ].filter(Boolean);
    const row2 = [
      S.address && ["주소", esc(S.address)], S.zip && ["우편번호", esc(S.zip)],
      S.phone && ["고객센터", tel(S.phone)], S.email && ["사업제휴 문의", '<a href="mailto:' + esc(S.email) + '">' + esc(S.email) + "</a>"],
      S.privacyOfficer && ["개인정보 보호책임자", esc(S.privacyOfficer)], ["호스팅 제공자", esc(S.hosting || "Vercel Inc.")]
    ].filter(Boolean);
    const dl = (rows) => '<dl class="hm-foot-info">' + rows.map((x) => "<div>" + (x[0] ? "<dt>" + x[0] + "</dt>" : "") + "<dd>" + x[1] + "</dd></div>").join("") + "</dl>";
    // 운영 시간: 첫 마디는 굵게, 나머지(점심 · 휴무)는 작게
    const hrs = String(S.hours || "").split(/\s*·\s*(?=점심|주말|공휴|휴무|토|일요)/);
    const legal = (key, label, href) => (url(href) ? ext(href, label) : '<button type="button" data-hm-legal="' + key + '">' + label + "</button>");
    return '<footer class="hm-foot"><div class="hm-wrap">' +
      '<div class="hm-foot-top">' +
        '<div class="hm-foot-brand">' + brandLock() + "<p>강사님 이름으로 운영하는 강의 플랫폼.<br>강의 소개 랜딩페이지 · 무료강의 전자책 · 수강생 케어 튜토리얼 시스템을 하나로.</p>" +
          '<div class="hm-foot-cta">' + applyBtn("입점 문의하기" + arrow(), "hm-btn hm-btn-p hm-btn-sm") + '<a class="hm-btn hm-btn-sec hm-btn-sm" href="#/center">강사센터</a></div></div>' +
        '<nav class="hm-foot-cols" aria-label="바로가기">' +
          '<div class="hm-foot-col"><b>두잉고</b>' + scrollBtn("hm-features", "3가지 기능", "hm-foot-a") + scrollBtn("hm-students", "수강생 화면", "hm-foot-a") + scrollBtn("hm-teachers", "강사센터 둘러보기", "hm-foot-a") + scrollBtn("hm-pricing", "이용료 · 기수 운영", "hm-foot-a") + scrollBtn("hm-classes", "강사진", "hm-foot-a") + "</div>" +
          '<div class="hm-foot-col"><b>바로가기</b>' + applyBtn("강사 입점 문의", "hm-foot-apply") + '<a href="#/center">강사센터 로그인</a><a href="#/login">수강생 로그인</a><a href="#/center/billing">다음 기수 신청</a></div>' +
          '<div class="hm-foot-col"><b>고객지원</b>' + scrollBtn("hm-faq", "자주 묻는 질문", "hm-foot-a") + legal("terms", "이용약관", S.terms) + legal("privacy", "<strong>개인정보처리방침</strong>", S.privacy) +
            (S.email ? '<a href="mailto:' + esc(S.email) + '">이메일 문의</a>' : "") + "</div>" +
        "</nav>" +
        // 전화가 있으면 고객센터 번호, 없으면 사업제휴 이메일을 크게
        '<div class="hm-foot-cs"><b>' + (S.phone ? "고객센터" : "사업제휴 · 입점 문의") + "</b>" +
          (S.phone ? '<p class="hm-foot-tel">' + tel(S.phone) + "</p>" : S.email ? '<p class="hm-foot-mail"><a href="mailto:' + esc(S.email) + '">' + icon("mail", "xs") + esc(S.email) + "</a></p>" : '<p class="hm-foot-tel hm-foot-tel-sm">입점 문의로 남겨 주세요</p>') +
          (S.hours ? '<p class="hm-foot-hrs"><span>' + esc(hrs[0]) + "</span>" + (hrs.length > 1 ? "<small>" + esc(hrs.slice(1).join(" · ")) + "</small>" : "") + "</p>" : "<p>입점 문의는 24시간 남길 수 있어요</p>") +
          (S.phone && S.email ? '<p><a href="mailto:' + esc(S.email) + '">' + esc(S.email) + "</a></p>" : "") +
          applyBtn(icon("handshake", "xs") + "입점 문의 남기기", "hm-foot-cs-btn") + "</div>" +
      "</div>" +
      '<div class="hm-foot-biz">' + dl(row1) + dl(row2) + (S.notice ? '<p class="hm-foot-notice">' + esc(S.notice) + "</p>" : "") +
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
      '<div class="hm-modal-in"><div class="hm-modal-head"><h2 id="hm-lg-t">' + esc(L[0]) + '</h2></div><div class="hm-doc">' + (window.CLASS_LEGAL_HTML ? window.CLASS_LEGAL_HTML(L[1]) : esc(L[1])) + "</div>" +
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
        '<div class="hm-modal-head">' + brandLock() + '<h2 id="hm-ap-t">강사 입점 문의</h2><p>강사님의 노하우를 두잉고 튜토리얼 강의 플랫폼으로 만들어 드려요. 남겨 주시면 확인 후 연락드릴게요.</p></div>' +
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
    if (/^#\/partner/.test(ROUTE.hash)) ROUTE.replace("#/doinggo");
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
      document.getElementById("hm-ap-body").innerHTML = '<div class="hm-done"><span class="hm-done-ic">' + icon("check") + '</span><h2 id="hm-ap-t">입점 문의가 접수됐어요</h2><p>' + esc(a.name) + " 강사님, 남겨 주신 연락처로 확인 후 연락드릴게요.<br>두잉고와 함께할 날을 기다릴게요.</p>" +
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
    document.title = "두잉고 | 강의는 강사님이, 운영은 두잉고가"; // index.html <title> 과 같게 (SEO)
    dark = null;
    const list = classes();
    root.innerHTML = fragFix('<div class="hm">' + DSYM_DEFS + header() + "<main>" + hero() + bwPaths() + bwMarquee() + problem() + flow() + features() + compare() + students() + teachers() + pricing() + lifelong() + classList(list) + journey() + faq() + finalCta() + "</main>" + footer() + bwDock() + "</div>");
    onScroll();
    reveal();
    wireVideos();
    wire3d();
    wireTcs();
    bwStage();
    if (/^#\/partner/.test(ROUTE.hash)) openApply();
  }
  function mount() { root.innerHTML = ""; render(); window.scrollTo(0, 0); }

  /* ---------- 실제 화면 녹화 영상 ---------- */
  let vio = null, vload = null;
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
  // 화면에 보일 때만 받아서 재생 (안 보이면 멈춤, 다시 보면 멈췄던 곳부터 이어서).
  // 휴대폰의 ‘애니메이션 줄이기’ · 절전 모드여도 멈춘 채로 두지 않는다 (소리 없는 화면 녹화라 저절로 재생)
  /* 강사진 슬라이드: 화살표 한 번 = 카드 한 장, 마우스로 끌어서도 넘겨요 (창 이벤트는 한 번만 연결) */
  let TCS = null, tcsBound = false;
  function wireTcs() {
    const w = root.querySelector("[data-hm-tcs]"); if (!w) { TCS = null; return; }
    const tr = w.querySelector(".hm-tcs"), bar = w.querySelector(".hm-tcs-bar i"), prev = w.querySelector(".prev"), next = w.querySelector(".next");
    const step = () => { const c = tr.querySelector(".hm-tc"); return c ? c.getBoundingClientRect().width + (parseFloat(getComputedStyle(tr).columnGap) || 24) : tr.clientWidth * 0.8; };
    const sync = () => {
      if (!tr.isConnected) return;
      const max = tr.scrollWidth - tr.clientWidth, x = tr.scrollLeft, vis = Math.max(12, (tr.clientWidth / tr.scrollWidth) * 100);
      prev.disabled = x <= 2; next.disabled = x >= max - 2;
      w.classList.toggle("can-slide", max > 2);
      bar.style.width = vis + "%"; bar.style.left = (max > 0 ? (x / max) * (100 - vis) : 0) + "%";
    };
    TCS = { tr, step, sync, down: null, moved: false };
    w.addEventListener("click", (e) => { const b = e.target.closest("[data-hm-tc]"); if (b) tr.scrollBy({ left: step() * Number(b.dataset.hmTc), behavior: "smooth" }); });
    tr.addEventListener("scroll", () => requestAnimationFrame(sync), { passive: true });
    tr.addEventListener("keydown", (e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); tr.scrollBy({ left: step() * (e.key === "ArrowRight" ? 1 : -1), behavior: "smooth" }); } });
    tr.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse" || e.button !== 0) return; TCS.down = { x: e.clientX, l: tr.scrollLeft }; TCS.moved = false; });
    tr.addEventListener("click", (e) => { if (TCS && TCS.moved) { e.preventDefault(); e.stopPropagation(); TCS.moved = false; } }, true);
    tr.addEventListener("dragstart", (e) => e.preventDefault());
    if (!tcsBound) {
      tcsBound = true;
      window.addEventListener("pointermove", (e) => { const T = TCS; if (!T || !T.down) return; const dx = e.clientX - T.down.x; if (Math.abs(dx) > 5) { T.moved = true; T.tr.classList.add("dragging"); T.tr.scrollLeft = T.down.l - dx; } });
      window.addEventListener("pointerup", () => { const T = TCS; if (!T || !T.down) return; T.down = null; if (T.moved) { T.tr.classList.remove("dragging"); const s = T.step(); T.tr.scrollTo({ left: Math.round(T.tr.scrollLeft / s) * s, behavior: "smooth" }); } });
      window.addEventListener("resize", () => { if (TCS) TCS.sync(); });
    }
    sync();
  }
  function wireVideos() {
    if (vio) vio.disconnect();
    const vids = Array.from(root.querySelectorAll("video.hm-vid"));
    vids.forEach((v) => {
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
      tilt3d();
    });
  }

  /* ---------- 기능 칸 휴대폰 입체 ---------- */
  // --sp: 화면 아래에서 들어올 때 +1 → 가운데 0 → 위로 나갈 때 -1 (위아래로 살짝 뜨고 빛 반사만 움직임 · 각도는 늘 정면)
  let st3d = [], v3d = null;
  // 글 길이만큼 늘어난 틀(클로드 아티팩트 등) 안: 이 문서는 스크롤되지 않는다 → 보이는 비율로 대신 계산
  const framed = () => document.documentElement.scrollHeight <= window.innerHeight + 4;
  function tilt3d() {
    return;
    const vh = window.innerHeight;
    st3d.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) return;
      const p = (r.top + r.height / 2 - vh / 2) / ((vh + r.height) / 2);
      el.style.setProperty("--sp", Math.max(-1, Math.min(1, p)).toFixed(3));
    });
  }
  function wire3d() {
    st3d = Array.from(root.querySelectorAll(".hm-3d"));
    root.querySelectorAll("[data-hm-count]").forEach((el) => { el.dataset.end = String(Date.now() + Number(el.dataset.hmCount) * 1000); });
    if (v3d) { v3d.disconnect(); v3d = null; }
    if ("IntersectionObserver" in window) {
      const th = []; for (let i = 0; i <= 20; i++) th.push(i / 20);
      v3d = new IntersectionObserver((ents) => ents.forEach((en) => {
        return;
        const hid = 1 - en.intersectionRatio;
        en.target.style.setProperty("--sp", (en.intersectionRect.top > en.boundingClientRect.top + 1 ? -hid : hid).toFixed(3));
      }), { threshold: th });
      st3d.forEach((el) => v3d.observe(el));
    }
    // 평소에는 정면. 손가락 · 마우스로 끌 때만 돌아간다 — 앞면이 보이는 범위 안에서만 (좌우 ±35° · 위아래 ±15°), 놓으면 살짝 튕기며 정면으로.
    // 휴대폰에서 세로로 끌면 원래대로 화면이 스크롤되고, 가로로 먼저 끌 때만 돌린다 (CSS touch-action: pan-y). 끌고 난 뒤의 클릭은 무시
    st3d.forEach((box) => {
      const stage = box.querySelector(".hm-3d-stage");
      if (!stage) return;
      let d = null, raf = 0, moved = false;
      const put = (gy, gx) => { box.style.setProperty("--gy", gy.toFixed(2)); box.style.setProperty("--gx", gx.toFixed(2)); };
      stage.addEventListener("dragstart", (e) => e.preventDefault());
      stage.addEventListener("pointerdown", (e) => {
        if (e.button > 0) return;
        d = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, touch: e.pointerType !== "mouse", gy: 0, gx: 0 };
      });
      stage.addEventListener("pointermove", (e) => {
        if (!d || e.pointerId !== d.id) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (!d.on) {
          if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
          if (d.touch && Math.abs(dy) > Math.abs(dx)) { d = null; return; }
          d.on = true; moved = true;
          box.classList.remove("releasing"); box.classList.add("dragging");
          try { stage.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
        }
        d.gy = Math.max(-35, Math.min(35, dx * 0.34));
        d.gx = Math.max(-15, Math.min(15, -dy * 0.26));
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (d) put(d.gy, d.gx); });
      });
      const end = (e) => {
        if (!d || (e && e.pointerId !== d.id)) return;
        const was = d.on;
        d = null;
        if (!was) return;
        box.classList.remove("dragging"); box.classList.add("releasing"); put(0, 0);
        setTimeout(() => box.classList.remove("releasing"), 950);
        setTimeout(() => { moved = false; }, 0);
      };
      stage.addEventListener("pointerup", end);
      stage.addEventListener("pointercancel", end);
      // 터치는 손가락이 닿은 안쪽 요소가 먼저 잡고 있어서, 무대가 잡아 올 때 안쪽 요소의 lostpointercapture 가 올라온다 → 무대 자신의 것만
      stage.addEventListener("lostpointercapture", (e) => { if (e.target === stage) end(e); });
      stage.addEventListener("click", (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
    });
  }
  // 무료 강의 카운트다운 카드: 1초마다 줄어든다 (0이 되면 처음부터)
  const pad2 = (x) => String(x).padStart(2, "0");
  setInterval(() => {
    if (!isActive()) return;
    root.querySelectorAll("[data-hm-count]").forEach((el) => {
      let t = Math.round((Number(el.dataset.end) - Date.now()) / 1000);
      if (!(t > 0)) { t = Number(el.dataset.hmCount); el.dataset.end = String(Date.now() + t * 1000); }
      el.textContent = Math.floor(t / 86400) + "일 " + pad2(Math.floor(t / 3600) % 24) + ":" + pad2(Math.floor(t / 60) % 60) + ":" + pad2(t % 60);
    });
  }, 1000);
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

/* 두잉고 시안: 메뉴 ON/OFF 체험 — 눌러서 켜고 끄면 켜진 메뉴 수가 바뀐다 */
document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest(".bw-tg"); if (!t) return;
  const on = !t.classList.contains("on"); t.classList.toggle("on", on); t.setAttribute("aria-pressed", String(on));
  const box = t.closest(".bw-oo"); if (!box) return;
  const n = box.querySelectorAll(".bw-tg.on").length; box.querySelectorAll("[data-oo-n]").forEach((x) => { x.textContent = n; });
});
