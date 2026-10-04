/*
 * 두고보는 문대표 클래스 — 기본 데이터 (seed)
 *
 * MOON_CONTENT : 문대표 강의 플랫폼의 수강생 화면 내용 (강사센터에서 모두 수정 가능)
 * CLASS_SEED   : 강사·기수·수강생 등 플랫폼 전체 기본값
 *
 * 날짜는 YYYY-MM-DD (한국 시간). youtubeId 는 유튜브 주소나 11자리 ID.
 */
const MOON_CONTENT = {

  brand: {
    name: "두고보는 문대표",
    instructor: "문대표",
    courseTitle: "두고보는 문대표와 함께하는 뉴질랜드 건강식품 실전 클래스",
    shortTitle: "뉴질랜드 건강식품 실전 클래스",
    tagline: "온라인 비즈니스, 함께 성장하는 실전 클래스",
    botName: "24시 문대표 AI봇",
    youtubeChannel: "https://www.youtube.com/@%EB%91%90%EA%B3%A0%EB%B3%B4%EB%8A%94%EB%AC%B8%EB%8C%80%ED%91%9C",
    freeCourseUrl: "https://www.ivyclass.co.kr/free-courses/c8f31bf5-1781-43cb-a4cc-5e713016ba88",
    kakaoChannel: "",
    liveUrl: "",
    loginEyebrow: "DOOGO CLASS · 해외 건기식 브랜드",
    loginHeadline: "내 해외 건기식\n브랜드 만들기",
    loginSub: "나만의 해외 건강식품 만들기, 함께 성장하는 실전 클래스. 매주 과제를 하나씩 해내다 보면, 5주 뒤엔 내 이름의 브랜드의 사장님이 되어있으실거에요.",
    liveTime: "20:00",
    theme: "lime"
  },



  weeks: [
    {
      no: 1, title: "사업 준비 · 판매자 세팅",
      summary: "사업자등록부터 수입식품 구매대행업 등록, 판매 채널 가입까지 판매를 시작할 수 있는 몸을 만듭니다.",
      lessons: [
        { id: "l1-1", title: "OT · 뉴질랜드 건강식품, 왜 지금인가", minutes: 38, youtubeId: "", desc: "시장 규모, 수강 로드맵, 5주 동안 해야 할 일 한눈에 보기" },
        { id: "l1-2", title: "사업자등록 · 통신판매업 신고 따라하기", minutes: 42, youtubeId: "", desc: "홈택스 화면을 보며 그대로 따라 합니다. 업종코드와 과세 유형 선택법" },
        { id: "l1-3", title: "수입식품 위생교육 · 구매대행업 영업등록", minutes: 35, youtubeId: "", desc: "식품안전나라에서 영업등록까지, 막히는 지점만 짚어 드립니다" }
      ],
      missions: [
        { id: "m1-1", title: "사업자등록증 발급", required: true, type: "image",
          desc: "홈택스에서 사업자등록을 신청하고 발급된 사업자등록증을 올려 주세요.",
          steps: ["홈택스 → 신청/제출 → 사업자등록신청(개인)", "업태: 도소매 / 종목: 전자상거래 소매업", "발급 후 PDF·사진으로 저장해 업로드"],
          check: { image: true } },
        { id: "m1-2", title: "통신판매업 신고", required: true, type: "image",
          desc: "정부24에서 통신판매업 신고를 하고 신고증을 올려 주세요.",
          steps: ["구매안전서비스 이용확인증(스마트스토어에서 발급) 먼저 준비", "정부24 → 통신판매업 신고", "신고증 수령 후 업로드"],
          check: { image: true } },
        { id: "m1-3", title: "수입식품 위생교육 이수", required: true, type: "image",
          desc: "한국식품산업협회 수입식품 위생교육(온라인)을 듣고 수료증을 올려 주세요.",
          steps: ["한국식품산업협회 식품위생교육 사이트 접속", "수입식품등 인터넷 구매대행업 신규 교육 선택", "수료증 출력 또는 캡처"],
          check: { image: true } },
        { id: "m1-4", title: "수입식품등 인터넷 구매대행업 영업등록", required: true, type: "image",
          desc: "관할 지방식약청에 영업등록을 하고 영업등록증을 올려 주세요.",
          steps: ["사업자등록증·위생교육 수료증 준비", "식품안전나라 민원 → 영업등록 신청", "영업등록증 발급 후 업로드"],
          check: { image: true } },
        { id: "m1-5", title: "스마트스토어 판매자 가입", required: true, type: "link",
          desc: "네이버 스마트스토어 판매자 가입을 마치고 내 스토어 주소를 적어 주세요.",
          steps: ["사업자 판매자로 가입", "스토어 이름은 브랜드가 될 이름으로", "스토어 주소(URL) 복사해서 제출"],
          check: { link: true, linkHint: "smartstore.naver.com" } },
        { id: "m1-6", title: "쿠팡 윙 판매자 가입", required: true, type: "image",
          desc: "쿠팡 윙 판매자 가입 후 승인 완료 화면을 캡처해 올려 주세요.",
          steps: ["wing.coupang.com 가입", "사업자 정보·정산 계좌 입력", "승인 완료 화면 캡처"],
          check: { image: true } },
        { id: "m1-7", title: "사업용 계좌 · 카드 등록", required: true, type: "text",
          desc: "홈택스에 사업용 계좌와 카드를 등록했는지 확인하고 등록한 은행명을 적어 주세요. (계좌번호는 적지 마세요)",
          steps: ["홈택스 → 사업용 신용카드 등록", "사업용 계좌 신고", "은행명·카드사명만 적어서 제출"],
          check: { minLength: 6 } },
        { id: "m1-8", title: "자기소개 남기기", required: false, type: "text",
          desc: "어떤 이유로 시작했는지, 5주 뒤 어떤 모습이고 싶은지 편하게 적어 주세요.",
          steps: ["이름(닉네임), 지역, 하는 일", "이 강의를 듣는 이유", "5주 뒤 목표"],
          check: { minLength: 50 } },
        { id: "m1-9", title: "관심 품목 3가지 적기", required: false, type: "text",
          desc: "팔아 보고 싶은 뉴질랜드 건강식품 3가지와 이유를 적어 주세요.",
          steps: ["예: 마누카꿀 UMF 10+, 초록입홍합 오일, 프로폴리스", "왜 그 품목인지 한 줄씩"],
          check: { minLength: 30 } },
        { id: "m1-10", title: "1주차 수강 후기", required: false, type: "text",
          desc: "1주차를 마친 소감과 막혔던 부분을 남겨 주세요. 다음 라이브에서 같이 풀어 드립니다.",
          steps: ["가장 도움이 된 내용", "아직 어려운 부분"],
          check: { minLength: 30 } }
      ]
    },
    {
      no: 2, title: "뉴질랜드 소싱 · 마진 설계",
      summary: "무엇을, 어디서, 얼마에 가져와 얼마에 팔지 숫자로 정합니다.",
      lessons: [
        { id: "l2-1", title: "뉴질랜드 건강식품 Top 20 품목 분석", minutes: 46, youtubeId: "", desc: "마누카꿀·초록입홍합·프로폴리스·콜라겐·초유, 잘 팔리는 이유와 피해야 할 품목" },
        { id: "l2-2", title: "현지 공급처 찾기와 가격 비교", minutes: 39, youtubeId: "", desc: "현지 리테일러·약국 체인 가격 구조와 배송대행지 고르는 법" },
        { id: "l2-3", title: "통관 · 위해식품 체크와 마진 계산", minutes: 41, youtubeId: "", desc: "식품안전나라 해외직구 위해식품 확인, 관부가세·환율·수수료까지 넣은 진짜 마진" }
      ],
      missions: [
        { id: "m2-1", title: "뉴질랜드 건강식품 시장조사 10개", required: true, type: "text",
          desc: "관심 품목 10개를 골라 브랜드·용량·현지가·국내 판매가를 정리해 주세요.",
          steps: ["자료실의 ‘뉴질랜드 건강식품 리스트’ 참고", "품목마다 현지가(NZD)와 국내 최저가 적기"],
          check: { minLength: 120, keywords: ["NZD", "원"] } },
        { id: "m2-2", title: "현지 공급처 3곳 비교", required: true, type: "text",
          desc: "같은 상품을 파는 현지 공급처 3곳의 가격·배송비·재고를 비교해 주세요.",
          steps: ["공급처 이름 / 상품가 / 배송비 / 재고 여부", "최종 선택한 공급처와 이유"],
          check: { minLength: 80 } },
        { id: "m2-3", title: "통관 · 금지성분 체크", required: true, type: "image",
          desc: "주력 후보 상품을 식품안전나라 해외직구 위해식품 목록에서 조회한 화면을 올려 주세요.",
          steps: ["식품안전나라 → 해외직구 위해식품 차단목록", "제품명·성분으로 검색", "조회 결과 화면 캡처"],
          check: { image: true } },
        { id: "m2-4", title: "마진 계산표 작성", required: true, type: "text",
          desc: "자료실 마진 계산기로 주력 상품 3개의 판매가와 순이익을 계산해 결과를 적어 주세요.",
          steps: ["현지가·환율·배송대행비·수수료 입력", "상품별 판매가 / 순이익 / 마진율 적기"],
          check: { minLength: 60, keywords: ["%"] } },
        { id: "m2-5", title: "경쟁 셀러 분석", required: false, type: "link",
          desc: "같은 상품을 잘 파는 경쟁 셀러 스토어 링크와 배울 점을 남겨 주세요.",
          steps: ["리뷰 많은 셀러 2~3곳", "상세페이지·가격·사은품에서 배울 점"],
          check: { link: true } },
        { id: "m2-6", title: "주력 상품 1개 선정 이유", required: false, type: "text",
          desc: "첫 번째로 밀어 볼 상품과 그 이유를 적어 주세요.",
          steps: ["상품명", "고른 이유 (마진·검색량·경쟁)"],
          check: { minLength: 40 } }
      ]
    },
    {
      no: 3, title: "상품 등록 · 상세페이지",
      summary: "검색에 걸리는 상품명과 믿음을 주는 상세페이지로 첫 상품을 올립니다.",
      lessons: [
        { id: "l3-1", title: "팔리는 상품명 키워드 공식", minutes: 37, youtubeId: "", desc: "검색량·경쟁도 보는 법과 상품명 50자 안에 담는 순서" },
        { id: "l3-2", title: "상세페이지 템플릿으로 30분 완성", minutes: 52, youtubeId: "", desc: "미리캔버스 템플릿으로 그대로 따라 만들기" },
        { id: "l3-3", title: "건강식품 표시·광고, 이것만은 피하세요", minutes: 28, youtubeId: "", desc: "질병 예방·치료 표현, 과장 광고로 판매 중지 당하지 않는 법" }
      ],
      missions: [
        { id: "m3-1", title: "상품명 키워드 작성", required: true, type: "text",
          desc: "주력 상품의 대표 키워드 5개와 완성한 상품명을 적어 주세요.",
          steps: ["자료실 키워드 리스트 참고", "대표 키워드 5개", "완성 상품명(50자 이내)"],
          check: { minLength: 40 } },
        { id: "m3-2", title: "상세페이지 제작", required: true, type: "image",
          desc: "템플릿으로 만든 상세페이지 이미지를 올려 주세요.",
          steps: ["자료실 ‘상세페이지 템플릿’ 사용", "원산지·용량·섭취방법·주의사항 꼭 넣기"],
          check: { image: true } },
        { id: "m3-3", title: "스마트스토어 첫 상품 등록", required: true, type: "link",
          desc: "스마트스토어에 등록한 첫 상품 링크를 남겨 주세요.",
          steps: ["상품 등록 → 카테고리: 식품 > 건강식품", "구매대행 상품 표시 체크", "상품 링크 복사"],
          check: { link: true, linkHint: "smartstore.naver.com" } },
        { id: "m3-4", title: "쿠팡 첫 상품 등록", required: true, type: "link",
          desc: "쿠팡에 등록한 첫 상품 링크를 남겨 주세요.",
          steps: ["윙 → 상품 등록", "해외구매대행 상품으로 등록", "상품 링크 복사"],
          check: { link: true, linkHint: "coupang.com" } },
        { id: "m3-5", title: "표시·광고 사전 점검", required: true, type: "text",
          desc: "내 상세페이지 문구 중 고친 표현을 ‘원래 → 수정’ 형태로 적어 주세요.",
          steps: ["‘치료’, ‘예방’, ‘완치’ 같은 표현 찾기", "기능성 원료 표현으로 바꾸기"],
          check: { minLength: 30, keywords: ["→"] } },
        { id: "m3-6", title: "상품 10개 등록", required: true, type: "image",
          desc: "판매 채널에 상품 10개 이상 등록된 상품 목록 화면을 올려 주세요.",
          steps: ["스마트스토어 또는 쿠팡 상품 목록", "등록 개수가 보이게 캡처"],
          check: { image: true } },
        { id: "m3-7", title: "썸네일 A/B 테스트", required: false, type: "image",
          desc: "같은 상품의 썸네일 2종을 만들어 올려 주세요.",
          steps: ["배경색·문구를 다르게", "일주일 뒤 클릭률 비교"],
          check: { image: true } },
        { id: "m3-8", title: "묶음 상품 기획", required: false, type: "text",
          desc: "객단가를 올릴 묶음 구성 1개를 기획해 주세요.",
          steps: ["예: 마누카꿀 + 프로폴리스 스프레이 세트", "구성·가격·타깃"],
          check: { minLength: 40 } }
      ]
    },
    {
      no: 4, title: "광고 · 첫 주문 만들기",
      summary: "적은 예산으로 광고를 켜고, 첫 주문과 첫 리뷰를 만듭니다.",
      lessons: [
        { id: "l4-1", title: "네이버 검색광고 하루 1만 원 세팅", minutes: 44, youtubeId: "", desc: "쇼핑검색광고 그룹 구성과 입찰가 정하는 법" },
        { id: "l4-2", title: "쿠팡 광고 자동 · 수동 운영", minutes: 36, youtubeId: "", desc: "ROAS 보고 키워드 끄고 켜는 기준" },
        { id: "l4-3", title: "리뷰가 쌓이는 구조 만들기", minutes: 31, youtubeId: "", desc: "포토리뷰 이벤트, 재구매 쿠폰, 문자 템플릿" }
      ],
      missions: [
        { id: "m4-1", title: "네이버 검색광고 세팅", required: true, type: "image",
          desc: "쇼핑검색광고 캠페인을 만들고 설정 화면을 올려 주세요.",
          steps: ["캠페인 → 쇼핑검색 → 쇼핑몰 상품형", "일 예산 1만 원으로 시작", "설정 화면 캡처"],
          check: { image: true } },
        { id: "m4-2", title: "쿠팡 광고 세팅", required: true, type: "image",
          desc: "쿠팡 광고 캠페인 설정 화면을 올려 주세요.",
          steps: ["매출 최적화 광고로 시작", "일 예산·목표 ROAS 설정", "화면 캡처"],
          check: { image: true } },
        { id: "m4-3", title: "리뷰 이벤트 기획", required: true, type: "text",
          desc: "첫 리뷰를 모을 이벤트 내용을 적어 주세요.",
          steps: ["대상·혜택·기간", "안내 문구"],
          check: { minLength: 40 } },
        { id: "m4-4", title: "첫 주문 인증", required: true, type: "image",
          desc: "첫 주문이 들어온 화면을 올려 주세요. 개인정보는 가리고 올려 주세요!",
          steps: ["주문 관리 화면 캡처", "주문자 이름·연락처·주소 가리기"],
          check: { image: true } }
      ]
    },
    {
      no: 5, title: "운영 · CS · 확장",
      summary: "주문이 늘어도 무너지지 않는 운영 루틴과 다음 단계 계획을 세웁니다.",
      lessons: [
        { id: "l5-1", title: "주문 처리 · 배송대행 · CS 루틴", minutes: 40, youtubeId: "", desc: "하루 30분 운영 루틴, 통관 지연·파손 CS 답변 템플릿" },
        { id: "l5-2", title: "월 매출 1,000만 원으로 가는 확장 전략", minutes: 48, youtubeId: "", desc: "품목 확장, 자사몰, 시니어 고객 재구매 구조" }
      ],
      missions: [
        { id: "m5-1", title: "주문 처리 · CS 매뉴얼", required: true, type: "text",
          desc: "나만의 주문 처리 순서와 자주 올 CS 질문 3개에 대한 답변을 적어 주세요.",
          steps: ["주문 확인 → 발주 → 송장 → 배송 안내 순서", "통관 지연·배송 문의·반품 답변"],
          check: { minLength: 100 } },
        { id: "m5-2", title: "월 매출 목표 · 5주 회고", required: true, type: "text",
          desc: "5주 동안 한 일, 잘된 점, 다음 달 매출 목표를 적어 주세요.",
          steps: ["해낸 것", "아쉬운 것", "다음 달 목표 매출과 실행 계획"],
          check: { minLength: 80 } },
        { id: "m5-3", title: "자사몰 기획", required: false, type: "text",
          desc: "나중에 만들 자사몰의 이름·콘셉트·주력 상품을 적어 주세요.",
          steps: ["브랜드 이름", "타깃 고객", "주력 상품 3개"],
          check: { minLength: 40 } },
        { id: "m5-4", title: "시니어 고객 응대 템플릿", required: false, type: "text",
          desc: "부모님 세대 고객을 위한 쉬운 안내 문자를 만들어 주세요.",
          steps: ["큰 글씨·짧은 문장", "섭취 방법과 배송 기간 안내"],
          check: { minLength: 40 } },
        { id: "m5-5", title: "재구매 쿠폰 설계", required: false, type: "text",
          desc: "재구매를 부르는 쿠폰 조건을 설계해 주세요.",
          steps: ["발급 시점", "할인 금액·조건", "유효 기간"],
          check: { minLength: 30 } },
        { id: "m5-6", title: "수강 소감 영상", required: false, type: "link",
          desc: "1분 소감 영상을 찍어 링크로 남겨 주세요. (유튜브 일부공개·구글드라이브 등)",
          steps: ["5주 전과 지금 달라진 점", "다음 기수에게 한마디"],
          check: { link: true } }
      ]
    }
  ],

  // 강의 오픈(주차 시작일)과 과제 마감(오픈 6일 뒤)은 기수 시작일로 자동 계산된다.
  // 여기에는 강사가 추가하는 일정만 둔다.
  //  scope "all"   : 모든 기수에 반복 — week 주차의 dow 요일 (0=일 … 6=토)
  //  scope "cohort": 특정 기수 하루 — date
  schedule: [
    { id: "e1", type: "qna", title: "1주차 Q&A 라이브", time: "21:00", scope: "all", week: 1, dow: 2 },
    { id: "e2", type: "qna", title: "2주차 Q&A 라이브", time: "21:00", scope: "all", week: 2, dow: 2 },
    { id: "e3", type: "qna", title: "3주차 Q&A · 상세페이지 첨삭", time: "21:00", scope: "all", week: 3, dow: 2 },
    { id: "e4", type: "qna", title: "4주차 Q&A 라이브", time: "21:00", scope: "all", week: 4, dow: 2 },
    { id: "e5", type: "challenge", title: "첫 상품 등록 7일 챌린지 시작", time: "", scope: "all", week: 2, dow: 5 },
    { id: "e6", type: "event", title: "수료식 · 성과 발표", time: "20:00", scope: "all", week: 6, dow: 4 },
    { id: "e7", type: "notice", title: "수입식품 위생교육 신청 안내", time: "", scope: "cohort", cohortId: "c3", date: "2026-10-03" }
  ],

  notices: [
    { id: "n1", pinned: true, date: "2026-10-01", title: "[필독] 3기 수강 안내 · 5주 일정과 과제 제출 방법",
      body: "3기에 오신 것을 환영합니다!\n\n· 매주 목요일 저녁 8시 라이브 강의가 있고, 다시보기는 커리큘럼 메뉴에 올라갑니다.\n· 과제는 ‘과제 제출하기’에서 주차별로 제출하면 자동검수 결과가 바로 나옵니다.\n· 필수 과제를 모두 통과하면 수료증이 발급됩니다.\n· 다음 주차 과제는 매주 목요일에 열립니다.\n\n궁금한 점은 Q&A 메뉴나 24시 문대표 AI봇에 먼저 물어보세요." },
    { id: "n2", pinned: true, date: "2026-10-01", title: "유료강의 자료실 이용 시 주의사항",
      body: "자료실의 전자책·자료 파일·VOD는 3기 유료 수강생 전용입니다.\n무단 다운로드·복사·캡처 배포 시 추적 및 법적 책임이 따를 수 있습니다." },
    { id: "n3", pinned: false, date: "2026-10-02", title: "1주차 라이브 다시보기 업로드 완료",
      body: "10/1(목) 1주차 라이브 다시보기가 커리큘럼 1주차에 올라갔습니다.\n사업자등록 화면은 영상 12분부터 보시면 됩니다." },
    { id: "n4", pinned: false, date: "2026-10-03", title: "수입식품 위생교육 신청 링크 안내",
      body: "구매대행업 영업등록 전에 위생교육 수료증이 꼭 필요합니다.\n‘서류 준비 가이드’ 메뉴 3단계에 신청 방법과 링크를 정리해 두었습니다." },
    { id: "n5", pinned: false, date: "2026-10-03", title: "10/6(화) 1주차 Q&A 라이브 안내",
      body: "10/6(화) 밤 9시, 1주차 Q&A 라이브가 있습니다.\n질문은 라이브 채팅으로 남겨 주시면 순서대로 답변드립니다." }
  ],

  // category 는 Q&A 화면의 분류 칩으로 보인다
  faqs: [
    { id: "q1", category: "수강 · 로그인", q: "로그인이 안 돼요.", a: "강사 선택 → 수강 신청 때 적은 이름 → 휴대폰 번호 뒷자리 4자리 순서로 로그인합니다. 이름에 띄어쓰기가 들어가지 않았는지 확인해 주세요. 수강 신청 후 강사님이 승인하기 전에는 로그인되지 않아요.", tags: ["로그인", "비밀번호", "접속", "승인"] },
    { id: "q2", category: "수강 · 로그인", q: "수강 신청은 어떻게 하나요?", a: "로그인 화면 아래 ‘수강 신청하기’에서 기수를 고르고 이름과 전화번호 뒷자리를 적으면 됩니다. 결제 확인 후 강사님이 승인하면 바로 로그인할 수 있어요.", tags: ["수강 신청", "신청", "가입"] },
    { id: "q3", category: "수강 · 로그인", q: "휴대폰과 PC에서 같이 쓸 수 있나요?", a: "네. 같은 이름과 뒷자리로 어느 기기에서든 로그인할 수 있어요. 과제 사진은 휴대폰에서 바로 찍어 올리면 편합니다.", tags: ["휴대폰", "모바일", "PC", "기기"] },
    { id: "q4", category: "라이브 · 강의", q: "라이브를 놓쳤어요. 다시 볼 수 있나요?", a: "라이브 다음 날까지 커리큘럼 메뉴에 다시보기가 올라갑니다. 강의 일정 메뉴에서 다음 라이브 시간도 확인할 수 있어요.", tags: ["라이브", "다시보기", "녹화", "놓침"] },
    { id: "q5", category: "라이브 · 강의", q: "다음 주차 강의는 언제 열리나요?", a: "매주 목요일에 다음 주차 강의와 과제가 열립니다. 강의 일정 메뉴의 파란 점(강의 오픈)으로 날짜를 확인하세요.", tags: ["주차", "오픈", "공개", "언제"] },
    { id: "q6", category: "과제 · 수료", q: "과제는 언제까지 내야 하나요?", a: "주차가 열리고 6일 뒤(수요일)가 과제 마감일입니다. 마감이 지나도 제출은 가능하지만, 수료식 전까지 필수 과제를 모두 통과해야 수료증이 나와요.", tags: ["과제", "마감", "기한", "제출"] },
    { id: "q7", category: "과제 · 수료", q: "자동검수에서 ‘보완 필요’가 나왔어요.", a: "결과 아래에 부족한 항목이 적혀 있어요. 사진이 필요한 과제는 이미지를, 링크가 필요한 과제는 주소를, 글 과제는 안내된 분량과 핵심 단어를 채워 다시 제출해 주세요.", tags: ["자동검수", "보완", "반려", "다시"] },
    { id: "q8", category: "과제 · 수료", q: "강사님이 보완을 요청했어요.", a: "과제 화면에 강사님이 남긴 내용이 보여요. 그대로 고쳐서 다시 제출하면 강사님이 한 번 더 확인합니다.", tags: ["보완 요청", "강사 확인", "재제출"] },
    { id: "q9", category: "과제 · 수료", q: "수료증은 어떻게 받나요?", a: "필수 과제를 모두 통과하면 수료증 메뉴에서 이름이 들어간 수료증이 열립니다. PC에서는 인쇄하거나 PDF로 저장할 수 있어요.", tags: ["수료증", "수료", "조건"] },
    { id: "q10", category: "사업자 · 서류", q: "개인 사업자로 시작해도 되나요?", a: "네. 대부분 간이과세 개인사업자로 시작합니다. 연 매출이 기준을 넘으면 일반과세자로 자동 전환되니 처음부터 법인을 만들 필요는 없습니다.", tags: ["사업자", "간이", "법인", "개인"] },
    { id: "q11", category: "사업자 · 서류", q: "직장인도 사업자등록을 할 수 있나요?", a: "법적으로 가능합니다. 다만 회사 취업규칙에 겸업 금지 조항이 있는지 먼저 확인하세요. 사업소득이 생기면 건강보험료가 추가로 나올 수 있어요.", tags: ["직장인", "겸업", "건강보험"] },
    { id: "q12", category: "사업자 · 서류", q: "수입식품 인터넷 구매대행업 등록은 꼭 해야 하나요?", a: "네. 해외 식품·건강식품을 구매대행으로 판매하려면 반드시 영업등록을 해야 합니다. 등록 전에 한국식품산업협회 수입식품 위생교육을 먼저 이수해야 해요.", tags: ["구매대행업", "영업등록", "위생교육", "식약처"] },
    { id: "q13", category: "사업자 · 서류", q: "구매안전서비스 이용확인증은 어디서 받나요?", a: "스마트스토어 판매자센터 → 판매자 정보 메뉴에서 ‘구매안전서비스 이용확인증’을 내려받을 수 있습니다. 쿠팡 윙에서도 발급돼요.", tags: ["통신판매업", "구매안전서비스", "확인증"] },
    { id: "q14", category: "소싱 · 통관", q: "1회 직구 면세 한도는 얼마인가요?", a: "목록통관 기준 미국발은 200달러, 그 외 국가는 150달러가 일반적인 면세 기준입니다. 건강기능식품은 1인당 6병까지 자가사용 인정 기준이 있으니 고객 안내에 꼭 넣어 주세요. 기준은 바뀔 수 있으니 관세청 공지를 확인하세요.", tags: ["면세", "관세", "통관", "6병", "한도"] },
    { id: "q15", category: "소싱 · 통관", q: "배송대행지는 어디를 써야 하나요?", a: "뉴질랜드 현지 배송대행지 중 식품 통관 경험이 많은 곳을 고르세요. 2주차 강의에서 비교표를 드립니다. 배송비는 무게 기준이라 꿀처럼 무거운 상품은 꼭 계산기에 넣어 보세요.", tags: ["배송대행", "배대지", "배송"] },
    { id: "q16", category: "소싱 · 통관", q: "팔면 안 되는 성분은 어떻게 확인하나요?", a: "식품안전나라 ‘해외직구 위해식품 차단목록’에서 제품명이나 성분으로 검색하세요. 목록에 있으면 통관이 막히니 소싱 후보에서 빼야 합니다.", tags: ["위해식품", "금지성분", "차단목록", "성분"] },
    { id: "q17", category: "판매 · 광고", q: "마진은 어느 정도 남겨야 하나요?", a: "광고비·반품·환율 변동까지 생각하면 판매가 기준 순이익 20~30%를 목표로 잡으세요. 자료실의 마진 계산기에 현지가·환율·배송대행비·수수료를 넣으면 바로 계산됩니다.", tags: ["마진", "이익", "계산", "가격"] },
    { id: "q18", category: "판매 · 광고", q: "상세페이지에 ‘면역력 강화’라고 써도 되나요?", a: "일반식품(꿀 등)에는 질병·기능성 표현을 쓸 수 없습니다. 건강기능식품도 식약처가 인정한 기능성 문구 그대로만 쓸 수 있어요. ‘치료’, ‘예방’, ‘완치’ 같은 표현은 절대 쓰지 마세요.", tags: ["광고", "표현", "상세페이지", "면역", "표시"] },
    { id: "q19", category: "판매 · 광고", q: "광고비는 하루 얼마로 시작하나요?", a: "처음에는 하루 1만 원으로 시작해서 일주일 동안 클릭과 판매를 보고 늘리세요. 4주차 강의에서 끄고 켜는 기준을 알려 드립니다.", tags: ["광고비", "예산", "광고"] },
    { id: "q20", category: "이용 안내", q: "화면이 이상하거나 버튼이 안 눌려요.", a: "Q&A의 ‘요청사항’ 탭에서 ‘문의하기’를 눌러 어떤 화면에서 무엇을 눌렀는지 적고 스크린샷을 함께 올려 주세요. 강사님이 확인 후 고쳐 드립니다.", tags: ["오류", "버그", "안 돼요", "고장", "요청사항"] }
  ],

  // 홍보 랜딩페이지 (강사센터 ‘홍보 랜딩페이지’에서 모두 고칠 수 있다)
  landing: {
    published: true,
    hero: {
      eyebrow: "두고보는 문대표 · 해외 건기식 브랜드 클래스",
      title: "뉴질랜드 건강식품으로\n내 브랜드 만들기",
      sub: "상품 고르기부터 사업자·통관 서류, 상세페이지, 첫 판매까지. 5주 동안 매주 과제를 하나씩 해내면 내 이름의 건강식품 브랜드가 생겨요.",
      ctaLabel: "4기 수강 신청하기", ctaUrl: "", image: ""
    },
    about: {
      title: "강사 소개", name: "문대표", role: "두고보는 문대표 · 뉴질랜드 건강식품 브랜드 대표",
      body: "뉴질랜드 현지에서 건강식품을 직접 소싱해 한국에 판매하고 있어요. 처음 시작하는 분들이 서류와 통관에서 막혀 포기하지 않도록, 제가 겪은 시행착오를 순서대로 정리해 알려 드립니다.",
      photo: "", career: ["뉴질랜드 건강식품 수입·판매", "유튜브 ‘두고보는 문대표’ 운영", "해외 건기식 브랜드 클래스 1~3기 운영"]
    },
    points: {
      title: "5주 동안 이렇게 바뀌어요",
      items: [
        { title: "1주차 · 사업 준비", desc: "사업자등록, 통신판매업 신고, 수입식품 영업등록까지 서류를 끝내요." },
        { title: "2주차 · 상품 고르기", desc: "뉴질랜드 건강식품 중 팔리는 상품을 고르는 기준과 마진 계산을 배워요." },
        { title: "3주차 · 통관과 첫 입고", desc: "수입 신고와 검사 절차를 따라 하며 첫 물건을 들여와요." },
        { title: "4~5주차 · 판매 시작", desc: "상세페이지와 스마트스토어를 열고 첫 주문을 받아요." }
      ],
      forWho: ["해외 건강식품을 직접 팔아 보고 싶은 분", "서류·통관이 어려워서 시작을 미루고 있던 분", "퇴근 후·주말에 부업으로 브랜드를 만들고 싶은 분", "혼자 하다 막혀서 같이 끝까지 갈 사람이 필요한 분"]
    },
    reviews: {
      title: "먼저 들은 수강생 이야기",
      items: [
        { name: "김*진", meta: "2기 수료", text: "서류에서 매번 막혔는데 순서대로 따라 하니 2주 만에 수입식품 영업등록까지 끝냈어요.", sample: true },
        { name: "박*호", meta: "1기 수료", text: "매주 과제가 있어서 미루지 않게 됐어요. 5주차에 첫 주문을 받았습니다.", sample: true },
        { name: "이*아", meta: "3기 수강 중", text: "AI봇에 밤에 물어봐도 바로 답이 와서 좋아요. 라이브 때는 더 자세히 물어봐요.", sample: true }
      ]
    },
    pricing: {
      title: "수강 안내", price: "", original: "", period: "5주 과정 + 다시보기",
      includes: ["주차별 강의 영상", "34개 실습 과제와 자동 검수", "매주 라이브 Q&A", "서류 준비 가이드 · 마진 계산기", "24시 문대표 AI봇", "수료증 발급"],
      ctaLabel: "4기 수강 신청하기", ctaUrl: "", note: "결제 후 수강생 전용 학습 플랫폼 계정을 열어 드려요."
    },
    cta: { title: "5주 뒤, 내 이름의 브랜드 사장님이 되어 있을 거예요", sub: "매주 하나씩, 같이 끝까지 가요.", label: "지금 신청하기", url: "" },
    contact: { instagram: "", email: "", phone: "", company: "두고보는 문대표" }
  },
  // 처음 들어온 수강생이 홈에서 하나씩 체크하는 시작 가이드
  guide: [
    { id: "g-1", title: "강의 일정 확인하기", desc: "라이브 Q&A와 과제 마감일을 먼저 확인해 두세요.", url: "#/schedule" },
    { id: "g-2", title: "[필독] 공지 읽기", desc: "수강 방법과 5주 일정이 정리돼 있어요.", url: "#/notices" },
    { id: "g-3", title: "1주차 첫 강의 보기", desc: "다 본 강의는 ‘시청 완료’로 표시해 주세요.", url: "#/curriculum" },
    { id: "g-4", title: "AI봇에게 궁금한 점 물어보기", desc: "과제·서류·일정을 24시간 답해 드려요.", url: "#/bot" }
  ],
  docsGuide: [
    { id: "d1", title: "사업자등록", where: "홈택스", url: "https://www.hometax.go.kr", time: "즉시 ~ 3일", cost: "무료",
      docs: ["신분증", "임대차계약서 (자택이면 생략 가능)"],
      tips: ["업태 ‘도매 및 소매업’, 종목 ‘전자상거래 소매업’(525101)", "처음엔 간이과세자로 시작하는 경우가 많아요"] },
    { id: "d2", title: "통신판매업 신고", where: "정부24", url: "https://www.gov.kr", time: "1 ~ 3일", cost: "등록면허세 (지역별 상이)",
      docs: ["사업자등록증", "구매안전서비스 이용확인증"],
      tips: ["구매안전서비스 이용확인증은 스마트스토어·쿠팡에서 발급", "신고증은 시·군·구청에서 수령 또는 온라인 발급"] },
    { id: "d3", title: "수입식품 위생교육", where: "한국식품산업협회", url: "https://www.kfia.or.kr", time: "온라인 약 8시간", cost: "교육비 별도",
      docs: ["사업자 정보", "본인 인증"],
      tips: ["‘수입식품등 인터넷 구매대행업’ 신규 영업자 교육 선택", "수료증은 바로 출력 가능"] },
    { id: "d4", title: "수입식품등 인터넷 구매대행업 영업등록", where: "식품안전나라 · 관할 지방식약청", url: "https://www.foodsafetykorea.go.kr", time: "3 ~ 7일", cost: "수수료 소액",
      docs: ["사업자등록증", "위생교육 수료증", "신분증"],
      tips: ["영업등록증이 있어야 오픈마켓에서 구매대행 식품 판매 가능", "주소지 관할 지방식약청에서 처리"] },
    { id: "d5", title: "판매 채널 가입", where: "스마트스토어 · 쿠팡 윙", url: "https://sell.smartstore.naver.com", time: "1 ~ 3일", cost: "무료",
      docs: ["사업자등록증", "통신판매업 신고증", "정산 계좌 통장 사본"],
      tips: ["스토어 이름은 나중에 브랜드가 됩니다", "구매대행 카테고리 서류로 영업등록증 제출"] }
  ],

  resources: {
    ebook: [
      { id: "e1", title: "뉴질랜드 건강식품 구매대행 A to Z", meta: "전자책 · 86쪽", desc: "사업 준비부터 첫 주문까지 강의 전체를 한 권으로", url: "" },
      { id: "e2", title: "마누카꿀 완전 정복 가이드북", meta: "가이드북 · 32쪽", desc: "UMF·MGO 등급 읽는 법과 고객 설명 문구", url: "" },
      { id: "e3", title: "건강식품 표시·광고 금지 표현 사전", meta: "가이드북 · 24쪽", desc: "써도 되는 말, 쓰면 안 되는 말 정리", url: "" }
    ],
    file: [
      { id: "f1", title: "뉴질랜드 건강식품 리스트 150", meta: "엑셀 · 시트 3개", desc: "브랜드·용량·현지가·국내가 비교", url: "" },
      { id: "f2", title: "건강식품 키워드 리스트", meta: "엑셀", desc: "카테고리별 검색량 높은 키워드 모음", url: "" },
      { id: "f3", title: "마진 계산기", meta: "바로 사용", desc: "현지가·환율·배송비·수수료로 순이익 계산", url: "", tool: "calculator" },
      { id: "f4", title: "상세페이지 템플릿", meta: "미리캔버스", desc: "건강식품 상세페이지 5종", url: "" },
      { id: "f5", title: "CS 답변 템플릿", meta: "문서", desc: "통관 지연·파손·반품 상황별 답변", url: "" }
    ],
    vod: [
      { id: "v1", title: "쿠팡 로켓그로스 vs 판매자배송", meta: "VOD · 32분", desc: "건강식품은 어떤 방식이 유리할까", youtubeId: "" },
      { id: "v2", title: "네이버 스마트스토어 판매 실전", meta: "VOD · 45분", desc: "상위 노출 셀러의 운영 화면 공개", youtubeId: "" },
      { id: "v3", title: "현지 도매몰 발주 따라하기", meta: "VOD · 27분", desc: "주문부터 배송대행 신청까지 실제 화면", youtubeId: "" },
      { id: "v4", title: "대량 발주와 단가 협상", meta: "VOD · 38분", desc: "월 매출이 커졌을 때 공급가 낮추는 법", youtubeId: "" }
    ],
    senior: [
      { id: "g1", title: "처음 시작하는 분을 위한 컴퓨터 기초", meta: "기초 · 15분", desc: "파일 저장, 캡처, 업로드 방법", youtubeId: "",
        body: "컴퓨터가 낯설어도 괜찮아요. 이 영상 하나로 과제 제출에 필요한 기본기를 익힐 수 있어요.\n\n1. 폴더 만들고 파일 저장하기\n2. 화면 캡처하기 (윈도우 Win+Shift+S / 맥 Cmd+Shift+4)\n3. 캡처한 사진을 과제에 올리기\n\n아래 체크리스트를 내려받아 하나씩 표시하면서 따라 해 보세요.",
        attachments: [{"id": "a1", "name": "컴퓨터 기초 체크리스트.csv", "data": "data:text/csv;charset=utf-8,%EF%BB%BF%EC%88%9C%EC%84%9C%2C%ED%95%A0%20%EC%9D%BC%2C%ED%99%95%EC%9D%B8%0A1%2C%EB%B0%94%ED%83%95%ED%99%94%EB%A9%B4%EC%97%90%20%27%EB%91%90%EA%B3%A0%ED%81%B4%EB%9E%98%EC%8A%A4%27%20%ED%8F%B4%EB%8D%94%20%EB%A7%8C%EB%93%A4%EA%B8%B0%2C%0A2%2C%ED%99%94%EB%A9%B4%20%EC%BA%A1%EC%B2%98%ED%95%98%EA%B8%B0%20%28%EC%9C%88%EB%8F%84%EC%9A%B0%3A%20Win%2BShift%2BS%20/%20%EB%A7%A5%3A%20Cmd%2BShift%2B4%29%2C%0A3%2C%EC%BA%A1%EC%B2%98%ED%95%9C%20%EC%82%AC%EC%A7%84%EC%9D%84%20%ED%8F%B4%EB%8D%94%EC%97%90%20%EC%A0%80%EC%9E%A5%ED%95%98%EA%B8%B0%2C%0A4%2C%EA%B3%BC%EC%A0%9C%20%EC%A0%9C%EC%B6%9C%ED%95%98%EA%B8%B0%20%ED%99%94%EB%A9%B4%EC%97%90%EC%84%9C%20%EC%82%AC%EC%A7%84%20%EC%98%AC%EB%A6%AC%EA%B8%B0%2C%0A", "size": 242}] },
      { id: "g2", title: "스마트폰으로 사진 찍고 올리기", meta: "기초 · 12분", desc: "과제 사진을 휴대폰으로 올리는 방법", youtubeId: "",
        body: "서류 사진은 밝은 곳에서 위에서 수직으로 찍으면 글자가 잘 보여요.\n\n· 주민등록번호·계좌번호는 손가락이나 편집 기능으로 가리기\n· 과제 화면에서 ‘사진 또는 PDF 선택’ → 앨범에서 고르기", attachments: [] },
      { id: "g3", title: "홈택스 공동인증서 쉽게 만들기", meta: "기초 · 18분", desc: "간편인증과 공동인증서 차이", youtubeId: "",
        body: "사업자등록은 간편인증(카카오·네이버·PASS)으로도 할 수 있어요. 공동인증서가 필요한 경우와 만드는 방법을 차례로 알려 드려요.", attachments: [] },
      { id: "g4", title: "카카오톡으로 고객 응대하기", meta: "기초 · 14분", desc: "톡톡·카톡 채널 기본 사용법", youtubeId: "",
        body: "스마트스토어 톡톡과 카카오톡 채널로 고객 문의에 답하는 기본 방법이에요. 자주 쓰는 답변은 ‘빠른 답변’에 저장해 두세요.", attachments: [] }
    ]
  },

  motivation: [
    { id: "mv1", title: "“하루에 500병씩 팔려요” | 뉴질랜드산 꿀 팔아서 월 순수익 2억 원 버는 30대", minutes: "31:57", youtubeId: "", date: "2026-10-03" },
    { id: "mv2", title: "직장 다니면서 월 300 부수입, 퇴근 후 1시간 루틴", minutes: "18:24", youtubeId: "", date: "2026-10-02" },
    { id: "mv3", title: "60대에 시작한 구매대행, 1년 만에 바뀐 것들", minutes: "22:10", youtubeId: "", date: "2026-10-01" },
    { id: "mv4", title: "첫 주문까지 걸린 19일, 포기하고 싶던 순간", minutes: "15:48", youtubeId: "", date: "2026-09-30" },
    { id: "mv5", title: "초록입홍합 하나로 월 매출 3천 만든 상세페이지", minutes: "26:03", youtubeId: "", date: "2026-09-29" },
    { id: "mv6", title: "실패한 상품 3개에서 배운 소싱 원칙", minutes: "19:37", youtubeId: "", date: "2026-09-28" }
  ],

  quotes: [
    "오늘의 작은 실천이 더 큰 기회를 만듭니다",
    "완벽하게 시작하지 말고, 시작하고 나서 완벽해지세요",
    "첫 주문은 실력이 아니라 꾸준함이 만듭니다",
    "어제보다 한 개 더 올린 상품이 내일의 매출입니다"
  ]
};

/*
 * 플랫폼 기본 데이터 (첫 실행 때 한 번 저장되고, 이후에는 강사센터·마스터에서 고친 값이 우선)
 *
 *  instructors : 플랫폼을 분양받은 강사. 강사센터 로그인 = 이름 + 전화번호 뒷자리
 *  content     : 강사별 수강생 화면 내용 (위 MOON_CONTENT 와 같은 구조)
 *  cohorts     : 기수. 1주차 시작일(startDate)만 정하면 주차 공개일·과제 마감일이 계산된다
 *  students    : 수강생. status = pending(승인 대기) | approved(수강 중) | rejected(거절) | withdrawn(탈퇴)
 */
// 예시: 4기부터 쓰는 ‘4주 압축 과정’ — 1~3주차는 그대로, 4·5주차를 한 주로 합친다 (과제 id는 같게 유지)
MOON_CONTENT.curriculumName = "5주 기본 과정";
MOON_CONTENT.curricula = [(function () {
  const w = JSON.parse(JSON.stringify(MOON_CONTENT.weeks));
  const w4 = w[3], w5 = w[4];
  const merged = { no: 4, title: "광고 · 첫 주문 · 운영", summary: "광고로 첫 주문을 만들고, CS와 재구매 관리까지 한 주에 끝내요.", lessons: w4.lessons.concat(w5.lessons), missions: w4.missions.concat(w5.missions) };
  return { id: "cur-4w", name: "4주 압축 과정", weeks: w.slice(0, 3).concat([merged]) };
})()];

window.CLASS_SEED = {
  version: 3,
  instructors: [
    { id: "moon", name: "문원오", phone4: "2186", displayName: "문대표", status: "active", createdAt: "2026-08-01" },
    { id: "logic", name: "로직메이커", phone4: "1111", displayName: "로직메이커", status: "active", createdAt: "2026-09-10",
      brand: { name: "로직메이커", courseTitle: "로직메이커 실전 클래스", theme: "airtable" } },
    { id: "farmer", name: "황금농부", phone4: "3333", displayName: "황금농부", status: "active", createdAt: "2026-09-12",
      brand: { name: "황금농부", courseTitle: "황금농부 실전 클래스", theme: "binance" } },
    { id: "choi", name: "초이", phone4: "2222", displayName: "초이", status: "active", createdAt: "2026-09-20",
      brand: { name: "초이 클래스", courseTitle: "초이와 함께하는 실전 클래스", theme: "pink" },
      menu: { items: [{ key: "home", on: true }, { key: "curriculum", on: true }, { key: "missions", on: true }, { key: "schedule", on: true }, { key: "notices", on: true }, { key: "qna", on: true }, { key: "docs", on: false }, { key: "bot", on: true }, { key: "library", on: true }, { key: "motivation", on: false }, { key: "certificate", on: true }], library: { ebook: true, file: true, vod: true, senior: false } } }
  ],
  content: { moon: MOON_CONTENT },
  cohorts: [
    { id: "c1", instructorId: "moon", name: "1기", startDate: "2026-08-06", recruiting: false, classDow: 4, classTime: "20:00" },
    { id: "c2", instructorId: "moon", name: "2기", startDate: "2026-09-03", recruiting: false, classDow: 4, classTime: "20:00" },
    { id: "c3", instructorId: "moon", name: "3기", startDate: "2026-10-01", recruiting: false, classDow: 4, classTime: "20:00" },
    { id: "c4", instructorId: "moon", name: "4기", startDate: "2026-11-05", recruiting: true, curriculumId: "cur-4w", classDow: 6, classTime: "12:00" },
    { id: "lc1", instructorId: "logic", name: "1기", startDate: "2026-10-08", recruiting: true },
    { id: "fc1", instructorId: "farmer", name: "1기", startDate: "2026-10-01", recruiting: true },
    { id: "cc1", instructorId: "choi", name: "1기", startDate: "2026-10-15", recruiting: true }
  ],
  students: [
    { id: "s1", instructorId: "moon", cohortId: "c3", name: "이수진", phone4: "2186", status: "approved", appliedAt: "2026-09-21" },
    { id: "s2", instructorId: "moon", cohortId: "c3", name: "김민준", phone4: "1234", status: "approved", appliedAt: "2026-09-22" },
    { id: "s3", instructorId: "moon", cohortId: "c3", name: "박서연", phone4: "5678", status: "approved", appliedAt: "2026-09-22" },
    { id: "s4", instructorId: "moon", cohortId: "c3", name: "최영희", phone4: "3321", status: "approved", appliedAt: "2026-09-24" },
    { id: "s5", instructorId: "moon", cohortId: "c3", name: "정하늘", phone4: "7788", status: "approved", appliedAt: "2026-09-25" },
    { id: "s6", instructorId: "moon", cohortId: "c3", name: "오세훈", phone4: "4410", status: "rejected", appliedAt: "2026-09-26", memo: "결제 내역 확인 안 됨" },
    { id: "s7", instructorId: "moon", cohortId: "c3", name: "강다은", phone4: "9021", status: "pending", appliedAt: "2026-10-02" },
    { id: "s8", instructorId: "moon", cohortId: "c4", name: "윤도현", phone4: "6612", status: "pending", appliedAt: "2026-10-02" },
    { id: "s9", instructorId: "moon", cohortId: "c4", name: "한지민", phone4: "1590", status: "pending", appliedAt: "2026-10-03" },
    { id: "s10", instructorId: "moon", cohortId: "c2", name: "서지훈", phone4: "2468", status: "approved", appliedAt: "2026-08-25" },
    { id: "s11", instructorId: "moon", cohortId: "c2", name: "임수빈", phone4: "1357", status: "withdrawn", appliedAt: "2026-08-26", memo: "개인 사정으로 탈퇴 요청" },
    { id: "s12", instructorId: "moon", cohortId: "c1", name: "배준호", phone4: "8080", status: "approved", appliedAt: "2026-07-28" },
    { id: "s13", instructorId: "logic", cohortId: "lc1", name: "홍길동", phone4: "0000", status: "approved", appliedAt: "2026-10-01" },
    { id: "s14", instructorId: "choi", cohortId: "cc1", name: "김영수", phone4: "0000", status: "pending", appliedAt: "2026-10-02" },
    { id: "s15", instructorId: "farmer", cohortId: "fc1", name: "김농부", phone4: "0000", status: "approved", appliedAt: "2026-09-28" }
  ],
  // 마스터가 모든 강사에게 보내는 공지 (강사센터 대시보드 맨 위에 보인다)
  announcements: [
    { id: "an1", date: "2026-10-02", pinned: true, title: "강사센터 업데이트: 과제 일괄 승인 · 영상 팝업 첨부 자료", body: "과제 검수에서 여러 과제를 한 번에 승인할 수 있고, 시니어 기초 가이드 영상에 교습지·엑셀을 첨부할 수 있어요." }
  ],
  // 강사센터 화면을 채우기 위한 예시 제출 기록 (첫 실행 때만 저장)
  sampleProgress: {
    s2: { done: ["m1-1", "m1-2", "m1-3", "m1-5", "m1-8"], question: { category: "화면 깨짐", title: "과제 화면에서 단계 안내 글자가 겹쳐 보여요", body: "1주차 과제 ‘통신판매업 신고’ 화면에서 ‘이렇게 하세요’ 아래 글자가 겹쳐서 읽기 어려워요. 갤럭시 기본 브라우저입니다.", daysAgo: 0 } },
    s3: { done: ["m1-1", "m1-2", "m1-3", "m1-4", "m1-5", "m1-6", "m1-7", "m1-9"], question: { category: "기타", title: "서류 준비 가이드 링크가 열리지 않아요", body: "3단계 ‘한국식품산업협회 바로가기’를 누르면 새 창이 안 떠요.", answer: "팝업 차단 때문이었어요. 주소창 오른쪽의 팝업 허용을 눌러 주시면 열립니다. 안내 문구도 추가해 둘게요.", daysAgo: 3 } },
    s4: { done: ["m1-1"], fix: ["m1-5"], question: { category: "과제 제출", title: "사진을 올렸는데 제출 버튼이 회색이에요", body: "휴대폰에서 사업자등록증 사진을 고르면 미리보기는 뜨는데 제출하기를 눌러도 반응이 없습니다. 아이폰 사파리입니다.", daysAgo: 1 } },
    s5: { done: ["m1-1", "m1-2", "m1-8", "m1-9", "m1-10"], question: { category: "영상 재생", title: "1주차 2강 영상이 소리만 나와요", body: "화면은 검은색이고 소리만 들립니다. 크롬에서 봤어요.", answer: "확인해 보니 영상 주소가 잘못 연결돼 있었어요. 지금 다시 연결했으니 새로고침 후 확인해 주세요!", daysAgo: 2 } },
    s12: { question: { category: "로그인 · 접속", title: "다른 휴대폰에서 로그인이 안 돼요", body: "새 휴대폰으로 바꿨는데 이름과 뒷자리를 넣어도 정보가 없다고 나옵니다.", answer: "1기 수강생으로 등록돼 있어서 ‘문대표’ 강사를 고른 뒤 같은 정보로 들어오시면 됩니다. 띄어쓰기 없이 이름을 넣어 주세요.", daysAgo: 20 } },
    s10: { done: ["m1-1", "m1-2", "m1-3", "m1-4", "m1-5", "m1-6", "m1-7", "m2-1", "m2-2", "m2-3", "m2-4", "m3-1", "m3-2", "m3-3", "m3-4", "m3-5", "m3-6", "m4-1", "m4-2", "m4-3", "m4-4", "m5-1", "m5-2"] }
  }
};
