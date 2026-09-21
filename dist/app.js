const STORAGE_KEY = "doogofood-ops-demo-v1";
const AUTH_KEY = "doogofood-current-account";
const REMEMBER_KEY = "doogofood-remembered-id";
const accounts = {
  admin: { password: "admin", role: "master", roles: ["master"], name: "마스터 관리자", roleLabel: "마스터" },
  sup: { password: "sup", role: "supplier", roles: ["supplier"], name: "두고 공급사", roleLabel: "공급사" },
  seller: { password: "seller", role: "seller", roles: ["seller"], name: "위탁셀러 데모", roleLabel: "위탁셀러" }
};
const roleMenus = {
  master: ["대시보드", "회원 승인", "공급사 관리", "위탁셀러 관리", "거래처 연결", "상품 관리", "주문 관리", "취소 · 환불", "운영 로그", "공지사항 관리"],
  supplier: ["대시보드", "상품 관리", "거래처 연결", "주문 · 출고 관리", "취소 · 환불", "배송 · 송장 설정", "가격 관리", "정산 내역", "내 정보"],
  seller: ["대시보드", "상품 소싱", "PICK 상품", "공급사 문의", "주문관리", "취소 환불", "매출 캘린더", "가격 변경알림", "쇼핑몰 연동", "정기구독", "내정보", "상품 판매중", "두고머니", "공지사항", "상품승인", "상품매핑"]
};
const roleMenuGroups = {
  master: [
    { label: "홈", indexes: [0] },
    { label: "회원 · 권한", indexes: [1, 2, 3, 4] },
    { label: "통합 운영", indexes: [5, 6, 7, 8, 9] }
  ],
  supplier: [
    { label: "홈", indexes: [0] },
    { label: "상품 · 거래처", indexes: [1, 2] },
    { label: "주문 · 배송", indexes: [3, 4, 5] },
    { label: "가격 · 정산", indexes: [6, 7] },
    { label: "계정", indexes: [8] }
  ],
  seller: [
    { label: "홈", indexes: [0] },
    { label: "상품", indexes: [1, 2, 14, 15, 11, 7] },
    { label: "거래처", indexes: [3] },
    { label: "주문 · 정산", indexes: [4, 5, 12, 6] },
    { label: "판매채널", indexes: [8] },
    { label: "계정", indexes: [13, 9, 10] }
  ]
};
const menuIcons = {
  master: ["home", "approval", "supplier", "seller", "connection", "product", "order", "refund", "log", "notice"],
  supplier: ["home", "product", "connection", "order", "refund", "printer", "price", "settlement", "settings"],
  seller: ["home", "market", "product", "message", "order", "refund", "calendar", "bell", "connection", "card", "settings", "onsale", "settlement", "notice", "approval", "mapping"]
};

const DEFAULT_DASHBOARD_LAYOUT = ["hero", "order-control", "quick-actions", "notices", "sales", "product-sales", "price-alerts", "recent-orders"];

/* 네이버쇼핑/스마트스토어 기준 4단계 카테고리 체계: 대분류 > 중분류 > 소분류 > 세분류 */
const naverCategoryTree = {
  "식품": {
    "농산물": {
      "과일": ["사과", "감귤", "포도", "배", "딸기"],
      "채소": ["배추", "무", "감자", "고구마"],
      "버섯": ["표고버섯", "느타리버섯", "새송이버섯"],
      "쌀·잡곡·견과": ["쌀", "잡곡", "견과류"]
    },
    "수산물": {
      "어류": ["고등어", "갈치", "연어", "참치"],
      "갑각류": ["꽃게", "새우", "랍스터"],
      "건어물": ["멸치", "미역", "다시마"]
    },
    "축산물": {
      "쇠고기": ["한우", "수입육"],
      "돼지고기": ["삼겹살", "목살"],
      "닭고기": ["삼계용", "구이용"]
    },
    "가공식품": {
      "김치·반찬": ["포기김치", "깍두기", "밑반찬"],
      "건조식품": ["건표고버섯", "건나물", "육포"],
      "즉석·간편식": ["즉석밥", "국·탕", "냉동식품"]
    },
    "건강식품": {
      "꿀·프로폴리스": ["마누카꿀", "아카시아꿀", "프로폴리스"],
      "영양제": ["오메가3", "비타민", "홍삼", "유산균"],
      "차·건강즙": ["전통차", "건강즙"]
    },
    "생수·음료": {
      "생수": ["먹는샘물", "탄산수"],
      "음료": ["주스", "탄산음료"]
    },
    "커피·원두·차": {
      "원두·커피": ["원두", "인스턴트커피"],
      "차": ["녹차", "홍차"]
    },
    "간편조리식품": {
      "밀키트": ["국·찌개", "요리"],
      "냉동안주": ["튀김", "만두"]
    }
  },
  "패션의류": {
    "여성의류": { "아우터": ["코트", "자켓", "패딩"], "상의": ["니트", "블라우스", "티셔츠"], "하의": ["청바지", "슬랙스", "스커트"] },
    "남성의류": { "아우터": ["코트", "자켓", "패딩"], "상의": ["셔츠", "티셔츠"], "하의": ["청바지", "슬랙스"] },
    "베이비의류": { "상의": ["바디수트", "우주복"], "하의": ["레깅스"] },
    "언더웨어·잠옷": { "언더웨어": ["속옷세트"], "잠옷": ["파자마"] }
  },
  "패션잡화": {
    "여성가방": { "숄더백": ["미니백", "크로스백"], "토트백": ["에코백"] },
    "남성가방": { "백팩": ["노트북백팩"], "서류가방": ["브리프케이스"] },
    "신발": { "스니커즈": ["캔버스화", "러닝화"], "구두": ["로퍼", "옥스포드"] },
    "패션소품": { "벨트": ["가죽벨트"], "지갑": ["카드지갑", "장지갑"] }
  },
  "화장품/미용": {
    "스킨케어": { "기초케어": ["토너", "에센스", "크림"], "마스크팩": ["시트팩"] },
    "메이크업": { "베이스메이크업": ["파운데이션", "쿠션"], "포인트메이크업": ["립스틱", "아이섀도"] },
    "헤어케어": { "샴푸·린스": ["탈모샴푸"], "헤어스타일링": ["왁스", "에센스"] },
    "바디케어": { "바디워시": ["바디워시"], "바디로션": ["바디로션"] }
  },
  "디지털/가전": {
    "PC": { "PC부품": ["CPU", "메인보드", "RAM", "그래픽카드", "SSD"], "PC액세서리": ["마우스", "키보드", "모니터암"], "게임기/타이틀": ["콘솔게임기", "게임타이틀"] },
    "휴대폰": { "스마트폰": ["갤럭시", "아이폰"], "액세서리": ["케이스", "보호필름"] },
    "노트북": { "노트북": ["울트라북", "게이밍노트북"], "액세서리": ["파우치", "독"] },
    "생활가전": { "주방가전": ["에어프라이어", "전자레인지"], "계절가전": ["에어컨", "선풍기"] }
  },
  "가구/인테리어": {
    "침실가구": { "침대": ["프레임", "매트리스"], "옷장": ["붙박이장", "드레스룸"] },
    "거실가구": { "소파": ["패브릭소파", "가죽소파"], "테이블": ["거실테이블"] },
    "홈데코": { "패브릭": ["커튼", "러그"], "액자·소품": ["액자", "화병"] },
    "조명": { "실내조명": ["LED조명", "스탠드"], "무드등": ["무드등"] }
  },
  "출산/육아": {
    "기저귀·물티슈": { "기저귀": ["팬티형", "밴드형"], "물티슈": ["휴대용", "리필용"] },
    "분유·이유식": { "분유": ["단계별분유"], "이유식": ["초기이유식"] },
    "유아동의류": { "상의": ["바디수트"], "하의": ["레깅스"] },
    "유모차·카시트": { "유모차": ["절충형", "디럭스형"], "카시트": ["신생아용", "확장형"] }
  },
  "스포츠/레저": {
    "골프": { "골프클럽": ["드라이버", "아이언"], "골프웨어": ["상의", "하의"] },
    "캠핑·등산": { "캠핑용품": ["텐트", "침낭"], "등산용품": ["등산화", "배낭"] },
    "헬스·요가": { "헬스용품": ["덤벨", "요가매트"], "요가웨어": ["레깅스"] },
    "자전거": { "자전거": ["로드바이크", "MTB"], "액세서리": ["헬멧", "라이트"] }
  },
  "생활/건강": {
    "생활용품": { "주방용품": ["밀폐용기", "냄비"], "세탁·청소": ["세제", "청소도구"] },
    "건강용품": { "혈압·체온계": ["혈압계"], "마사지기": ["안마의자"] },
    "반려동물용품": { "사료": ["강아지사료", "고양이사료"], "용품": ["장난감", "하네스"] },
    "문구·사무용품": { "필기구": ["볼펜", "연필"], "사무용품": ["파일", "노트"] }
  },
  "여가/생활편의": {
    "도서": { "소설": ["국내소설", "해외소설"], "자기계발": ["에세이"] },
    "티켓·공연": { "공연": ["콘서트", "뮤지컬"], "전시": ["미술전시"] },
    "여행·항공권": { "항공권": ["국내선", "국제선"], "숙박": ["호텔", "펜션"] },
    "상품권": { "온라인상품권": ["문화상품권"], "모바일상품권": ["기프티콘"] }
  },
  "면세점": {
    "향수·화장품": { "향수": ["여성향수", "남성향수"], "화장품": ["스킨케어세트"] },
    "주류": { "위스키": ["싱글몰트"], "와인": ["레드와인"] },
    "패션잡화": { "가방": ["명품가방"], "지갑": ["명품지갑"] }
  }
};
function categoryLevelOptions(level, path) {
  if (level === 1) return Object.keys(naverCategoryTree);
  const major = naverCategoryTree[path[0]];
  if (!major) return [];
  if (level === 2) return Object.keys(major);
  const mid = major[path[1]];
  if (!mid) return [];
  if (level === 3) return Object.keys(mid);
  const sub = mid[path[2]];
  return Array.isArray(sub) ? sub : [];
}
function categorySelectTag(name, level, path, extraAttrs = "") {
  const options = categoryLevelOptions(level, path);
  const current = path[level - 1] || "";
  const placeholder = level === 1 ? "대분류 선택" : "선택";
  return `<select name="${name}" data-category-level="${level}" ${options.length ? "" : "disabled"} ${extraAttrs}><option value="">${placeholder}</option>${options.map(option => `<option value="${escapeHtml(option)}" ${current === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select>`;
}

const initialState = {
  schemaVersion: 22,
  contentOverrides: {},
  notices: [
    { id: "notice-1", title: "상품 썸네일·상세페이지 복사 기능 안내", detail: "PICK 상품에서 판매정보를 수정하고 채널별로 등록할 수 있습니다.", date: "오늘", cta: "PICK 상품 바로가기", action: "open-my-products" },
    { id: "notice-2", title: "상품코드 기반 주문 매핑 기능 업데이트", detail: "외부몰 상품명을 바꿔도 DF-코드로 공급사 상품에 연결됩니다.", date: "오늘", cta: "주문 매핑 바로가기", action: "open-order-mapping" },
    { id: "notice-3", title: "거래처 연결 코드 이용 안내", detail: "승인된 공급사의 코드를 등록하면 매핑 가능한 상품이 열립니다.", date: "09.08", cta: "거래처 연결 바로가기", action: "open-connections" },
    { id: "notice-4", title: "송장 자동전송 설정 안내", detail: "공급사 송장이 등록되면 연결 쇼핑몰에 반영할 수 있습니다.", date: "09.07", cta: "쇼핑몰 연동 바로가기", action: "open-seller-channels" }
  ],
  sellerDashboard: { layout: [...DEFAULT_DASHBOARD_LAYOUT] },
  chatFavorites: {},
  partnerNotes: {},
  members: [
    { id: "MB-1000", loginId: "admin", password: "admin", role: "master", roleLabel: "마스터", name: "마스터 관리자", company: "주식회사 두고홀딩스", representative: "문원오", businessNo: "000-00-00000", contact: "010-0000-0000", email: "admin@doogofood.com", status: "approved", appliedAt: "2026.09.01", approvedAt: "2026.09.01", businessFile: "" },
    { id: "MB-1001", loginId: "sup", password: "sup", role: "supplier", roleLabel: "공급사", name: "산지팔도", company: "산지팔도", representative: "공급사 담당자", businessNo: "123-45-67890", contact: "010-1234-5678", email: "supplier@example.com", status: "approved", appliedAt: "2026.09.02", approvedAt: "2026.09.02", businessFile: "사업자등록증_샘플.pdf" },
    { id: "MB-1002", loginId: "seller", password: "seller", role: "seller", roles: ["seller"], roleLabel: "위탁셀러", name: "두고 셀러", company: "두고 셀러샵", supplierCompany: "", representative: "위탁셀러", businessNo: "234-56-78901", contact: "010-2345-6789", email: "seller@example.com", status: "approved", appliedAt: "2026.09.03", approvedAt: "2026.09.03", businessFile: "사업자등록증_샘플.pdf" },
    { id: "MB-1003", loginId: "freshfarm", password: "freshfarm", role: "supplier", roleLabel: "공급사", name: "신선농장", company: "신선농장", representative: "김농부", businessNo: "345-67-89012", contact: "010-3456-7890", email: "farm@example.com", status: "pending", appliedAt: "오늘 10:24", approvedAt: "", businessFile: "신선농장_사업자등록증.pdf" },
    { id: "MB-1004", loginId: "market88", password: "market88", role: "seller", roleLabel: "위탁셀러", name: "마켓88", company: "마켓88", representative: "이셀러", businessNo: "456-78-90123", contact: "010-4567-8901", email: "market88@example.com", status: "pending", appliedAt: "오늘 11:05", approvedAt: "", businessFile: "마켓88_사업자등록증.pdf" },
    { id: "MB-1005", loginId: "brandlab", password: "brandlab", role: "seller", roles: ["seller"], roleLabel: "위탁셀러", name: "브랜드랩", company: "브랜드랩 스토어", representative: "김브랜드", businessNo: "567-89-01234", contact: "010-5678-9012", email: "brandlab@example.com", status: "approved", appliedAt: "2026.08.18", approvedAt: "2026.08.18", businessFile: "브랜드랩_사업자등록증.pdf" }
  ],
  supplierApplications: [
    { id: "SA-1001", sellerLoginId: "brandlab", company: "브랜드랩 푸드", businessNo: "567-89-01234", category: "건강식품·브랜드 상품", website: "brandlab.example", introduction: "자체 기획 건강식품을 위탁셀러에게 공급하고 싶습니다.", businessFile: "브랜드랩_사업자등록증.pdf", status: "pending", appliedAt: "오늘 10:40", reviewedAt: "", rejectionReason: "", attempt: 1 }
  ],
  products: [
    { id: "DF-1024", imageIndex: 0, emoji: "🍎", name: "경북 프리미엄 사과 3kg", supplier: "산지팔도", supplierLoginId: "sup", supply: 21800, recommended: 29900, stock: 84, categoryGroup: "식품", category: "농산물", categorySub: "과일", categoryDetail: "사과", status: "판매중", imported: true, origin: "경상북도", shippingType: "domestic", originCountry: "대한민국", deliveryDays: "1~2일", detail: "정품 선별 사과 · 센터배송 · 상세페이지 제공" },
    { id: "DF-2088", imageIndex: 1, emoji: "🍯", name: "뉴질랜드 마누카 허니 UMF 15+", supplier: "산지팔도", supplierLoginId: "sup", supply: 34900, recommended: 49800, stock: 42, categoryGroup: "식품", category: "건강식품", categorySub: "꿀·프로폴리스", categoryDetail: "마누카꿀", status: "판매중", imported: false, origin: "뉴질랜드", shippingType: "overseas", originCountry: "뉴질랜드", deliveryDays: "7~12일", customsRequired: true, detail: "뉴질랜드 현지 정식 수입 상품 · 안전 포장 · 개인통관부호 필요" },
    { id: "DF-3142", imageIndex: 2, emoji: "🍄", name: "무농약 생표고버섯 1kg", supplier: "산지팔도", supplierLoginId: "sup", supply: 12400, recommended: 18900, stock: 120, categoryGroup: "식품", category: "농산물", categorySub: "버섯", categoryDetail: "표고버섯", status: "판매중", imported: false, origin: "충청남도", detail: "당일 선별 생표고 · 신선 포장 · 상세페이지 제공" },
    { id: "DF-3201", imageIndex: 3, emoji: "🍊", name: "제주 하우스 감귤 3kg", supplier: "산지팔도", supplierLoginId: "sup", supply: 16500, recommended: 23900, stock: 76, categoryGroup: "식품", category: "농산물", categorySub: "과일", categoryDetail: "감귤", status: "판매중", imported: false, origin: "제주특별자치도", detail: "고당도 하우스 감귤 · 산지직송 · 상세페이지 제공" },
    { id: "DF-3240", imageIndex: 4, emoji: "🦀", name: "국내산 손질 꽃게 1kg", supplier: "산지팔도", supplierLoginId: "sup", supply: 18900, recommended: 26900, stock: 38, categoryGroup: "식품", category: "수산물", categorySub: "갑각류", categoryDetail: "꽃게", status: "판매중", imported: false, origin: "서해안", detail: "선별 손질 꽃게 · 아이스 포장 · 상세페이지 제공" },
    { id: "DF-3268", imageIndex: 5, emoji: "🐟", name: "제주 은갈치 실속세트", supplier: "산지팔도", supplierLoginId: "sup", supply: 27800, recommended: 38900, stock: 55, categoryGroup: "식품", category: "수산물", categorySub: "어류", categoryDetail: "갈치", status: "판매중", imported: false, origin: "제주특별자치도", detail: "제주 은갈치 선물 구성 · 냉동배송 · 상세페이지 제공" },
    { id: "DF-3304", imageIndex: 6, emoji: "🥬", name: "국산 3도씨 포기김치 5kg", supplier: "산지팔도", supplierLoginId: "sup", supply: 19600, recommended: 28900, stock: 92, categoryGroup: "식품", category: "가공식품", categorySub: "김치·반찬", categoryDetail: "포기김치", status: "판매중", imported: false, origin: "대한민국", detail: "국산 원재료 포기김치 · 냉장배송 · 상세페이지 제공" },
    { id: "DF-3357", imageIndex: 7, emoji: "🍇", name: "호주산 씨없는 청포도 1.5kg", supplier: "산지팔도", supplierLoginId: "sup", supply: 24500, recommended: 34900, stock: 64, categoryGroup: "식품", category: "농산물", categorySub: "과일", categoryDetail: "포도", status: "판매중", imported: false, origin: "호주 빅토리아", shippingType: "overseas", originCountry: "호주", deliveryDays: "6~10일", customsRequired: true, detail: "호주 산지 선별 청포도 · 해외직구 냉장 포장 · 개인통관부호 필요" },
    { id: "DF-3420", imageIndex: 2, emoji: "🍄", name: "중국 운남성 건표고 슬라이스 500g", supplier: "산지팔도", supplierLoginId: "sup", supply: 9900, recommended: 15900, stock: 106, categoryGroup: "식품", category: "가공식품", categorySub: "건조식품", categoryDetail: "건표고버섯", status: "판매중", imported: false, origin: "중국 운남성", shippingType: "overseas", originCountry: "중국", deliveryDays: "7~14일", customsRequired: true, detail: "운남성 건표고 선별 상품 · 해외직구 합배송 가능 · 개인통관부호 필요" }
  ],
  sellerProducts: [
    { id: "SP-1001", sellerLoginId: "seller", productId: "DF-1024", salePrice: 29900, approvalStatus: "승인완료", channel: "네이버 스마트스토어", channels: ["smartstore", "coupang"], channelStatuses: { smartstore: "판매중", coupang: "판매중", kakao: "판매중지/미노출", cafe24: "미연동" }, channelDetails: { smartstore: { title: "산지직송 경북 프리미엄 사과 3kg", salePrice: 29900, category: "식품 > 농산물 > 사과", reviews: 128 }, coupang: { title: "고당도 경북 사과 실속형 3kg", salePrice: 30900, category: "식품 > 과일 > 사과", reviews: 42 }, kakao: { title: "선물용 경북 프리미엄 사과 3kg", salePrice: 31900, category: "푸드 > 신선식품 > 과일", reviews: 8 }, cafe24: { title: "경북 프리미엄 사과 3kg", salePrice: 29900, category: "농산물 > 과일", reviews: 0 } }, status: "판매중", copiedAt: "2026.09.07", imageIndex: 0, detailSnapshot: "정품 선별 사과 · 센터배송 · 상세페이지 제공", contentCopied: true },
    { id: "SP-1002", sellerLoginId: "seller", productId: "DF-2088", salePrice: 49800, approvalStatus: "승인대기", channel: "네이버 스마트스토어", channels: [], channelStatuses: { smartstore: "판매중지/미노출", coupang: "미연동", kakao: "미연동", cafe24: "미연동" }, channelDetails: { smartstore: { title: "뉴질랜드 마누카 허니 UMF 15+", salePrice: 49800, category: "식품 > 건강식품 > 꿀", reviews: 0 } }, status: "등록대기", copiedAt: "2026.09.08", imageIndex: 1, detailSnapshot: "뉴질랜드 현지 정식 수입 상품 · 안전 포장 · 개인통관부호 필요", contentCopied: true },
    { id: "SP-1003", sellerLoginId: "seller", productId: "DF-3201", salePrice: 23900, approvalStatus: "승인완료", channel: "쿠팡", channels: ["coupang"], channelStatuses: { smartstore: "미연동", coupang: "판매중", kakao: "미연동", cafe24: "미연동" }, channelDetails: { coupang: { title: "달콤한 제주 하우스 감귤 3kg", salePrice: 24900, category: "식품 > 과일 > 감귤", reviews: 15 } }, status: "판매중", copiedAt: "2026.09.08", imageIndex: 3, detailSnapshot: "고당도 하우스 감귤 · 산지직송 · 상세페이지 제공", contentCopied: true }
  ],
  orders: [
    { id: "DO-260909-044", sellerLoginId: "seller", supplierLoginId: "sup", assignedSupplier: "산지팔도", productId: "DF-2088", customer: "최마누카", recipientName: "최마누카", phone: "010-7721-4408", postalCode: "06028", address: "서울특별시 강남구 압구정로 28", addressDetail: "502호", deliveryMessage: "통관 완료 후 연락주세요.", shippingType: "overseas", personalCustomsCode: "P260909044001", qty: 1, amount: 49800, channel: "카카오 쇼핑", status: "배송준비중", tracking: "", carrier: "한진택배", orderDate: "2026-09-09", createdAt: "오늘 10:18", settlementStatus: "scheduled" },
    { id: "DO-260907-031", sellerLoginId: "seller", supplierLoginId: "", assignedSupplier: "산지팔도", productId: "DF-1024", mappedProductId: "DF-1024", mappingStatus: "mapped", paymentStatus: "paid", paymentMethod: "deposit", supplyTotal: 43600, forwardedAt: "", customer: "김두고", recipientName: "김두고", phone: "010-8291-4402", postalCode: "06236", address: "서울특별시 강남구 테헤란로 152", addressDetail: "두고빌딩 7층", deliveryMessage: "문 앞에 놓아주세요.", shippingType: "domestic", personalCustomsCode: "", qty: 2, amount: 59800, channel: "네이버 스마트스토어", status: "주문접수", tracking: "", carrier: "한진택배", orderDate: "2026-09-07", createdAt: "오늘 09:31", settlementStatus: "scheduled" },
    { id: "DO-260907-028", sellerLoginId: "seller", supplierLoginId: "sup", assignedSupplier: "산지팔도", productId: "DF-1024", customer: "이푸드", recipientName: "이푸드", phone: "010-3567-9088", postalCode: "48058", address: "부산광역시 해운대구 센텀중앙로 90", addressDetail: "1203호", deliveryMessage: "경비실에 맡겨주세요.", shippingType: "domestic", personalCustomsCode: "", qty: 1, amount: 29900, channel: "쿠팡", status: "배송중", tracking: "456823901155", carrier: "CJ대한통운", provisionalTracking: true, channelTrackingStatuses: { coupang: "전송완료" }, orderDate: "2026-09-06", createdAt: "오늘 08:42", settlementStatus: "scheduled" },
    { id: "DO-260905-022", sellerLoginId: "seller", supplierLoginId: "sup", assignedSupplier: "산지팔도", productId: "DF-1024", customer: "박환불", recipientName: "박환불", phone: "010-4521-0022", postalCode: "04524", address: "서울특별시 중구 세종대로 110", addressDetail: "샘플동 301호", deliveryMessage: "출고 전 취소 요청", shippingType: "domestic", personalCustomsCode: "", qty: 2, amount: 59800, channel: "[샘플주문]", status: "환불완료", tracking: "", carrier: "한진택배", orderDate: "2026-09-05", createdAt: "09.05 15:34", settlementStatus: "excluded" },
    { id: "DO-260831-014", sellerLoginId: "seller", supplierLoginId: "sup", assignedSupplier: "산지팔도", productId: "DF-1024", customer: "정완료", recipientName: "정완료", phone: "010-9000-8314", postalCode: "30128", address: "세종특별자치시 한누리대로 2130", addressDetail: "101동 804호", deliveryMessage: "문 앞 배송", shippingType: "domestic", personalCustomsCode: "", qty: 3, amount: 89700, channel: "네이버 스마트스토어", status: "배송완료", tracking: "501234567890", carrier: "한진택배", orderDate: "2026-08-31", createdAt: "08.31 09:14", settlementStatus: "completed", settledAt: "2026.09.05" }
  ],
  connections: [
    { id: "CN-1001", supplierLoginId: "sup", sellerLoginId: "seller", status: "connected", createdAt: "2026.09.03" }
  ],
  connectionInvites: [
    { id: "IV-1001", supplierLoginId: "sup", code: "SANDI-84H3", status: "active", createdAt: "2026.09.03" }
  ],
  connectionMessages: [
    { id: "MSG-1001", supplierLoginId: "sup", sellerLoginId: "seller", senderLoginId: "sup", text: "사과 상품은 평일 오전 10시 주문까지 당일 출고됩니다.", createdAt: "오늘 09:05" },
    { id: "MSG-1002", supplierLoginId: "sup", sellerLoginId: "seller", senderLoginId: "seller", text: "추석 선물 포장 옵션도 상세페이지에 반영하겠습니다.", createdAt: "오늘 09:18" },
    { id: "MSG-1003", supplierLoginId: "sup", sellerLoginId: "seller", senderLoginId: "sup", text: "네, 상품 이미지와 출고 공지를 오늘 안에 업데이트하겠습니다.", createdAt: "오늘 09:26" }
  ],
  shippingProfiles: {
    sup: { carrier: "한진택배", sender: "산지팔도 물류센터", contractCode: "HJD-29014", labelFormat: "A4 2분할", autoIssue: true }
  },
  goodflowConnections: {
    sup: { status: "connected", merchantId: "SANDI-DEMO", carrier: "한진택배", lastSync: "오늘 08:30", autoTracking: true }
  },
  refunds: [
    { id: "RF-260908-01", orderId: "DO-260907-028", sellerLoginId: "seller", supplierLoginId: "sup", type: "반품", reason: "상품 일부 파손", detail: "포장 개봉 시 사과 1개가 눌려 있었습니다.", consumerRefundAmount: 29900, amount: 21800, status: "공급사 입고확인 대기", responsibility: "공급사 귀책", consumerRefunded: true, consumerRefundedAt: "오늘 13:08", returnCarrier: "한진택배", returnTracking: "507891234567", returnRequestedAt: "오늘 13:20", returnDeliveredAt: "오늘 16:35", supplierReceived: false, depositCredited: false, supplierSettlementOffset: false, requestedAt: "오늘 13:10" },
    { id: "RF-260905-02", orderId: "DO-260905-022", sellerLoginId: "seller", supplierLoginId: "sup", type: "주문 취소", reason: "출고 전 고객 요청", detail: "출고 전 취소가 확인되어 두고머니 환불이 완료되었습니다.", consumerRefundAmount: 59800, amount: 43600, status: "환불완료", responsibility: "공급사 승인 · 회수 없음", consumerRefunded: true, consumerRefundedAt: "09.05 15:38", noPickup: true, supplierReceived: true, depositCredited: true, supplierSettlementOffset: true, requestedAt: "09.05 15:40", completedAt: "09.05 16:02" }
  ],
  channelConnections: {
    seller: [
      { id: "smartstore", name: "네이버 스마트스토어", mark: "N", color: "#03c75a", status: "connected", storeName: "두고 셀러샵", lastSync: "방금 전", trackingAutomation: true, syncInterval: 10, lastTrackingPush: "8분 전" },
      { id: "coupang", name: "쿠팡", mark: "C", color: "#e83b35", status: "connected", storeName: "두고", lastSync: "12분 전", trackingAutomation: true, syncInterval: 10, lastTrackingPush: "12분 전" },
      { id: "kakao", name: "카카오 쇼핑", mark: "K", color: "#f6c600", status: "pending", storeName: "연결 확인중", lastSync: "-", trackingAutomation: false, syncInterval: 10, lastTrackingPush: "-" },
      { id: "cafe24", name: "CAFE24", mark: "24", color: "#3159d9", status: "disconnected", storeName: "미연결", lastSync: "-", trackingAutomation: false, syncInterval: 10, lastTrackingPush: "-" }
    ]
  },
  subscriptions: {
    seller: { plan: "두고셀러 베이직", monthlyFee: 5900, status: "active", nextBilling: "2026.10.08", method: "국민카드 •••• 1234", autoRenew: true }
  },
  notificationServices: {
    seller: { plan: "알림톡 스탠다드", monthlyFee: 2900, status: "active", kakao: true, email: true, emailAddress: "seller@example.com", emailEnabled: true, pcNotice: false, orderNotice: true, trackingNotice: true, refundNotice: true, priceNotice: true, deliveryDelayNotice: false, stockNotice: true, monthlyLimit: 500, used: 23 }
  },
  notificationEvents: [
    { id: "NT-1001", recipientLoginId: "sup", audienceRole: "supplier", type: "order", channels: ["카카오 알림톡", "이메일"], title: "신규 주문이 자동 배정되었습니다", detail: "DO-260907-031 · 경북 프리미엄 사과 3kg 2개", createdAt: "오늘 09:31", read: false, delivery: "데모 대기" },
    { id: "NT-1002", recipientLoginId: "seller", audienceRole: "seller", type: "tracking", channels: ["카카오 알림톡", "이메일"], title: "송장번호가 등록되었습니다", detail: "DO-260907-028 · CJ대한통운 456823901155", createdAt: "오늘 08:49", read: false, delivery: "데모 대기" },
    { id: "NT-1003", recipientLoginId: "admin", audienceRole: "master", type: "approval", channels: ["운영센터"], title: "공급사 요청이 도착했습니다", detail: "브랜드랩 푸드 · 1차 검토 대기", createdAt: "오늘 10:40", read: false, delivery: "내부 알림" }
  ],
  deposits: {
    seller: { balance: 43600, totalRefunded: 43600, pending: 21800, withdrawalPending: 0, bankAccount: null, withdrawals: [], transactions: [{ id: "DP-260905-01", type: "환불 충전", amount: 43600, reference: "RF-260905-02", createdAt: "09.05 16:02" }] }
  },
  salesLedger: [
    { date: "2026-09-01", channel: "smartstore", sales: 159800, cost: 111200, orders: 5 },
    { date: "2026-09-02", channel: "coupang", sales: 226400, cost: 166100, orders: 7 },
    { date: "2026-09-03", channel: "smartstore", sales: 89500, cost: 62300, orders: 3 },
    { date: "2026-09-04", channel: "kakao", sales: 119600, cost: 82400, orders: 4 },
    { date: "2026-09-05", channel: "cafe24", sales: 69800, cost: 43600, orders: 2 },
    { date: "2026-09-06", channel: "coupang", sales: 179400, cost: 130800, orders: 6 },
    { date: "2026-09-07", channel: "smartstore", sales: 248900, cost: 171600, orders: 8 },
    { date: "2026-09-08", channel: "coupang", sales: 99700, cost: 72000, orders: 3 },
    { date: "2026-09-08", channel: "smartstore", sales: 49800, cost: 37000, orders: 2 },
    { date: "2026-09-10", channel: "kakao", sales: 99200, cost: 69100, orders: 3 },
    { date: "2026-09-12", channel: "smartstore", sales: 198700, cost: 139400, orders: 6 },
    { date: "2026-09-15", channel: "cafe24", sales: 129800, cost: 89200, orders: 4 },
    { date: "2026-09-18", channel: "coupang", sales: 269100, cost: 194000, orders: 9 },
    { date: "2026-09-22", channel: "smartstore", sales: 219400, cost: 151800, orders: 7 },
    { date: "2026-09-25", channel: "kakao", sales: 149600, cost: 102900, orders: 5 },
    { date: "2026-09-29", channel: "cafe24", sales: 179300, cost: 122500, orders: 6 }
  ],
  priceAlerts: [
    { id: "PA-01", productId: "DF-1024", recipients: ["seller"], oldPrice: 20500, newPrice: 21800, status: "확인필요", createdAt: "오늘 09:10" }
  ],
  productMappings: [],
  errors: [
    { id: "ER-001", source: "두고", title: "외부 연동 비활성", detail: "프로토타입 안전 모드로 인해 외부 채널 전송이 보류되었습니다.", time: "상시", level: "info" }
  ],
  logs: [
    { id: 1, type: "sync", title: "주문 수집 완료", detail: "두고 주문 2건을 샘플 데이터로 수집했습니다.", time: "오늘 09:32", state: "done" },
    { id: 2, type: "price", title: "공급가 변경 감지", detail: "DF-1024 공급가가 1,300원 인상되었습니다.", time: "오늘 09:10", state: "pending" },
    { id: 3, type: "safe", title: "외부 연동 잠금", detail: "데모 모드에서는 판매채널·택배사·결제망 전송이 차단됩니다.", time: "상시", state: "blocked" }
  ]
};

let state = loadState();
let activeRole = "seller";
let activeMenuIndex = 0;
let currentAccount = null;
let partnerLoginRole = "supplier";
let signupReturnTarget = "seller";
let signupStep = 1;
let sellerCategory = "전체보기";
let sellerCategoryGroup = "식품";
let sellerCategorySub = "전체보기";
let sellerCategoryDetail = "전체보기";
let sellerShippingFilter = "all";
let sellerCountry = "전체 국가";
let sellerBrand = "전체 브랜드";
let sellerProductSearch = "";
let marketViewMode = "grid";
let pickStatusFilter = "all";
let onSaleSearch = "";
let onSaleDateFrom = "";
let onSaleDateTo = "";
let noticeModalIndex = -1;
let sellerOrderSearch = "";
let sellerOrderStage = "all";
let refundMonth = "2026-09";
let refundSearch = "";
let refundTypeFilter = "all";
let salesMetric = "sales";
let supplierOrderStatus = "all";
let supplierSettlementMonth = "2026-09";
let supplierSettlementTab = "scheduled";
let expandedSellerProductId = null;
let editMode = false;
let dashboardDraftLayout = null;
let dashboardEditSnapshot = null;
let dashboardDraggingId = "";
let activeChatConnectionId = "";
let chatRoomFilter = "all";
let chatRoomSearch = "";

function cloneInitial() { return JSON.parse(JSON.stringify(initialState)); }
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return cloneInitial();
    const base = cloneInitial();
    const savedSchemaVersion = Number(saved.schemaVersion || 0);
    const isPreV10 = savedSchemaVersion < 10;
    const isPreV21 = savedSchemaVersion < 21;
    const mergeById = (savedItems, seedItems) => [...(savedItems || []), ...seedItems.filter(seed => !(savedItems || []).some(item => item.id === seed.id))];
    const merged = { ...base, ...saved, schemaVersion: 22, sellerDashboard: { ...base.sellerDashboard, ...(saved.sellerDashboard || {}) }, contentOverrides: { ...(base.contentOverrides || {}), ...(saved.contentOverrides || {}) }, chatFavorites: { ...(base.chatFavorites || {}), ...(saved.chatFavorites || {}) }, partnerNotes: { ...(base.partnerNotes || {}), ...(saved.partnerNotes || {}) }, members: saved.members || base.members, supplierApplications: saved.supplierApplications || base.supplierApplications, logs: saved.logs || base.logs, errors: saved.errors || base.errors, connections: saved.connections || base.connections, connectionInvites: saved.connectionInvites || base.connectionInvites, connectionMessages: saved.connectionMessages || base.connectionMessages, shippingProfiles: { ...base.shippingProfiles, ...(saved.shippingProfiles || {}) }, goodflowConnections: { ...base.goodflowConnections, ...(saved.goodflowConnections || {}) }, refunds: saved.refunds || base.refunds, channelConnections: { ...base.channelConnections, ...(saved.channelConnections || {}) }, subscriptions: { ...base.subscriptions, ...(saved.subscriptions || {}) }, notificationServices: { ...base.notificationServices, ...(saved.notificationServices || {}) }, notificationEvents: saved.notificationEvents || base.notificationEvents, deposits: { ...base.deposits, ...(saved.deposits || {}) }, salesLedger: saved.salesLedger || base.salesLedger };
    merged.sellerDashboard.layout = [...new Set((merged.sellerDashboard.layout || DEFAULT_DASHBOARD_LAYOUT).filter(id => DEFAULT_DASHBOARD_LAYOUT.includes(id)))];
    if (!merged.sellerDashboard.layout.length) merged.sellerDashboard.layout = [...DEFAULT_DASHBOARD_LAYOUT];
    merged.supplierApplications = mergeById(saved.supplierApplications, base.supplierApplications).map(application => ({ ...application, introduction: application.introduction === "자체 브랜드 상품을 두고푸드 위탁셀러에게 공급하고 싶습니다." ? "자체 브랜드 상품을 두고 위탁셀러에게 공급하고 싶습니다." : application.introduction }));
    const approvedSupplierLogins = new Set(merged.supplierApplications.filter(application => application.status === "approved").map(application => application.sellerLoginId));
    merged.members = mergeById(saved.members, base.members).map(member => ({ ...member, roles: member.role === "seller" ? ["seller", ...(approvedSupplierLogins.has(member.loginId) ? ["supplier"] : [])] : [member.role] }));
    merged.connections = mergeById(saved.connections, base.connections).filter(connection => !isPreV10 || connection.id !== "CN-1002");
    merged.connectionMessages = mergeById(saved.connectionMessages, base.connectionMessages);
    merged.notificationEvents = mergeById(saved.notificationEvents, base.notificationEvents);
    const savedProducts = (saved.products || []).filter(product => !isPreV10 || product.id !== "DF-3510");
    const addedSeedProducts = savedProducts.length ? base.products.filter(product => !savedProducts.some(savedProduct => savedProduct.id === product.id)) : [];
    merged.products = [...(savedProducts.length ? savedProducts : base.products), ...addedSeedProducts].map((product, index) => ({ status: "판매중", supplierLoginId: "sup", imageIndex: index % 8, tax: "과세", cutoff: "10:00", orderName: product.name, orderUnit: 1, purchasePrice: product.supply, shippingPolicy: "무료배송", carrier: "한진택배", warehouse: "공급사 직배송", weight: 1, unit: "KG", managementCode: product.id, barcode: "", visibility: "연결 셀러", manufactureDate: "", shelfLife: "수령 후 냉장·냉동 보관", detail: "센터배송 · 상세페이지 제공", shippingType: "domestic", originCountry: "대한민국", deliveryDays: "1~3일", customsRequired: false, ...(base.products.find(seed => seed.id === product.id) || {}), ...product }));
    merged.channelConnections.seller = (merged.channelConnections.seller || base.channelConnections.seller).map(channel => {
      const seed = base.channelConnections.seller.find(item => item.id === channel.id) || {};
      return { trackingAutomation: false, syncInterval: 10, lastTrackingPush: "-", ...seed, ...channel };
    });
    merged.sellerProducts = mergeById(saved.sellerProducts, base.sellerProducts).map((item, index) => {
      const product = merged.products.find(product => product.id === item.productId);
      const channels = Array.isArray(item.channels) ? item.channels : [channelIdFromName(item.channel || "네이버 스마트스토어")];
      const channelStatuses = Object.fromEntries(merged.channelConnections.seller.map(channel => [channel.id, channels.includes(channel.id) ? "판매중" : channel.status === "disconnected" ? "미연동" : "판매중지/미노출"]));
      const seedDetails = base.sellerProducts.find(seed => seed.productId === item.productId)?.channelDetails || {};
      const channelDetails = Object.fromEntries(merged.channelConnections.seller.map((channel, channelIndex) => [channel.id, { title: product?.name || "판매 상품", salePrice: Number(item.salePrice || product?.recommended || 0) + channelIndex * 500, category: `${product?.category || "식품"} > ${product?.originCountry || "상품"}`, reviews: channelIndex ? 1 : 12, ...(seedDetails[channel.id] || {}), ...(item.channelDetails?.[channel.id] || {}) }]));
      return { id: `SP-${1001 + index}`, sellerLoginId: "seller", copiedAt: "2026.09.07", imageIndex: product?.imageIndex ?? 0, customTitle: product?.name || "판매 상품", managementCode: item.id || `SP-${1001 + index}`, sellerCategory: product?.category || "식품", retailPrice: Number(item.salePrice || product?.recommended || 0), shippingPolicyOverride: product?.shippingPolicy || "공급사 정책 사용", carrierOverride: product?.carrier || "공급사 지정 택배", deliveryDaysOverride: product?.deliveryDays || "1~3일", summaryOverride: product?.summary || "", detailOverride: product?.detail || "상세페이지 제공", returnPolicy: "공급사 반품 정책에 따름", detailSnapshot: product?.detail || "상세페이지 제공", contentCopied: true, approvalStatus: item.approvalStatus || "승인완료", channels, channelStatuses, channelDetails, ...item, channelStatuses: { ...channelStatuses, ...(item.channelStatuses || {}) }, channelDetails };
    });
    merged.orders = mergeById(saved.orders, base.orders).filter(order => !isPreV10 || order.id !== "DO-260908-041").map((order, index) => {
      const sourceProduct = merged.products.find(product => product.id === order.productId);
      const hydrated = {
        sellerLoginId: "seller",
        supplierLoginId: "sup",
        assignedSupplier: productNameSupplier(order.productId, merged.products),
        recipientName: order.customer || "수취인",
        phone: "010-0000-0000",
        postalCode: "00000",
        address: "샘플 배송지",
        addressDetail: "",
        deliveryMessage: "문 앞에 놓아주세요.",
        shippingType: sourceProduct?.shippingType || "domestic",
        personalCustomsCode: "",
        orderDate: `2026-09-${String(Math.max(1,7-index)).padStart(2,"0")}`,
        createdAt: "이전 주문",
        settlementStatus: "scheduled",
        channelTrackingStatuses: {},
        externalProductName: sourceProduct?.name || "외부 주문 상품",
        externalProductCode: order.productId || "",
        mappingStatus: order.productId ? "mapped" : "unmapped",
        mappedProductId: order.productId || "",
        paymentStatus: "paid",
        paymentMethod: "legacy",
        supplyTotal: (sourceProduct?.supply || 0) * Number(order.qty || 1),
        forwardedAt: order.createdAt || "이전 주문",
        ...order
      };
      const normalizedStatus = hydrated.status === "출고대기" ? "신규주문" : hydrated.status;
      if (Number(saved.schemaVersion || 0) < 20 && order.id === "DO-260907-031") {
        return { ...hydrated, supplierLoginId: "", status: "주문접수", forwardedAt: "" };
      }
      return { ...hydrated, status: normalizedStatus };
    });
    merged.priceAlerts = (saved.priceAlerts || base.priceAlerts).map(alert => ({ recipients: ["seller"], ...alert }));
    merged.notificationServices.seller = { ...base.notificationServices.seller, ...(merged.notificationServices.seller || {}) };
    merged.deposits.seller = { ...base.deposits.seller, ...(merged.deposits.seller || {}), withdrawalPending: Number(merged.deposits.seller?.withdrawalPending || 0), bankAccount: merged.deposits.seller?.bankAccount || null, withdrawals: merged.deposits.seller?.withdrawals || [], transactions: merged.deposits.seller?.transactions || base.deposits.seller.transactions };
    base.salesLedger.forEach(seed => { if (!merged.salesLedger.some(item => item.date === seed.date && item.channel === seed.channel)) merged.salesLedger.push(seed); });
    const previousCompletedTotal = (saved.refunds || []).filter(refund => refund.status === "환불완료").reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
    const previousPendingTotal = (saved.refunds || []).filter(refund => refund.status !== "환불완료").reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
    merged.refunds = mergeById(saved.refunds, base.refunds).map(refund => {
      const status = ({ "공급사 확인중": "공급사 검토중", "회수 진행중": "반품 회수중" })[refund.status] || refund.status;
      const order = merged.orders.find(item => item.id === refund.orderId);
      const product = merged.products.find(item => item.id === (order?.mappedProductId || order?.productId));
      const consumerRefundAmount = Number(refund.consumerRefundAmount ?? refund.amount ?? order?.amount ?? 0);
      const fullSupplyAmount = Number(product?.supply || 0) * Number(order?.qty || 1);
      const refundRatio = Number(order?.amount || 0) > 0 ? Math.min(1, consumerRefundAmount / Number(order.amount)) : 1;
      const supplyRefundAmount = Math.round(fullSupplyAmount * refundRatio);
      const amount = isPreV21 && supplyRefundAmount ? supplyRefundAmount : Number(refund.amount || supplyRefundAmount);
      return { consumerRefunded: true, consumerRefundedAt: refund.requestedAt || "접수 전 완료", supplierReceived: status === "환불완료", depositCredited: false, supplierSettlementOffset: false, ...refund, consumerRefundAmount, amount, status };
    });
    if (isPreV21) {
      const wallet = merged.deposits.seller;
      const completedRefunds = merged.refunds.filter(refund => refund.sellerLoginId === "seller" && refund.status === "환불완료");
      const pendingRefunds = merged.refunds.filter(refund => refund.sellerLoginId === "seller" && refund.status !== "환불완료");
      const completedTotal = completedRefunds.reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
      const pendingTotal = pendingRefunds.reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
      wallet.balance = Math.max(0, Number(wallet.balance || 0) - Math.max(0, previousCompletedTotal - completedTotal));
      wallet.totalRefunded = Math.max(0, Number(wallet.totalRefunded || 0) - Math.max(0, previousCompletedTotal - completedTotal));
      wallet.pending = Math.max(0, Number(wallet.pending || 0) - Math.max(0, previousPendingTotal - pendingTotal));
      wallet.transactions = (wallet.transactions || []).map(transaction => {
        const refund = completedRefunds.find(item => item.id === transaction.reference);
        return refund && transaction.type === "환불 충전" ? { ...transaction, amount: refund.amount } : transaction;
      });
    }
    return merged;
  }
  catch { return cloneInitial(); }
}
function productNameSupplier(productId, products = state?.products || []) { return products.find(product => product.id === productId)?.supplier || "미배정"; }
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function money(value) { return Number(value).toLocaleString("ko-KR") + "원"; }
function productOf(id) { return state.products.find(p => p.id === id); }
function currentSellerProducts() { return state.sellerProducts.filter(item => item.sellerLoginId === (currentAccount?.loginId || "seller")); }
function currentSupplierProducts() { return state.products.filter(product => product.supplierLoginId === (currentAccount?.loginId || "sup")); }
function currentSellerOrders() { return state.orders.filter(order => order.sellerLoginId === (currentAccount?.loginId || "seller")); }
function currentSupplierOrders() { return state.orders.filter(order => order.supplierLoginId === (currentAccount?.loginId || "sup") && order.paymentStatus !== "pending"); }
function orderMappingStatus(order) { return order?.mappingStatus || (order?.productId ? "mapped" : "unmapped"); }
function orderPaymentStatus(order) { return order?.paymentStatus || "paid"; }
function orderSupplierProgressLabel(order) {
  if (orderPaymentStatus(order) === "pending") return "공급사 전달 전";
  if (order.status === "배송준비중") return "공급사에게 주문전송";
  if (order.status === "배송중" || order.status === "배송완료") return "공급사 송장등록 완료";
  return order.supplierLoginId ? "공급사 전달 완료" : "공급사 발주 대기";
}
function orderSourceProduct(order) { return productOf(order?.mappedProductId || order?.productId); }
function sellerProductTitle(item, product = productOf(item?.productId)) { return item?.customTitle || item?.sellerTitle || product?.name || "판매 상품"; }
function orderSellerTitle(order) {
  if (order?.externalProductName) return order.externalProductName;
  const item = state.sellerProducts.find(product => product.sellerLoginId === order?.sellerLoginId && product.productId === (order?.mappedProductId || order?.productId));
  return sellerProductTitle(item, orderSourceProduct(order));
}
function sellerMappingRequiredOrders() { return currentSellerOrders().filter(order => orderMappingStatus(order) !== "mapped"); }
function sellerPaymentRequiredOrders() { return currentSellerOrders().filter(order => orderMappingStatus(order) === "mapped" && orderPaymentStatus(order) === "pending"); }
function currentPriceAlerts() { const id = currentAccount?.loginId || "seller"; return state.priceAlerts.filter(alert => (alert.recipients || ["seller"]).includes(id)); }
function currentSellerConnections() { const id = currentAccount?.loginId || "seller"; return state.connections.filter(connection => connection.sellerLoginId === id && connection.status === "connected"); }
function currentSupplierConnections() { const id = currentAccount?.loginId || "sup"; return state.connections.filter(connection => connection.supplierLoginId === id && connection.status === "connected"); }
function memberByLogin(id) { return state.members.find(member => member.loginId === id); }
function supplierName(loginId) { const member = memberByLogin(loginId); return member?.supplierCompany || member?.company || loginId; }
function workspaceCompany(role = activeRole) { return role === "supplier" ? (currentAccount?.supplierCompany || currentAccount?.company || "공급사") : (currentAccount?.company || currentAccount?.name || "계정"); }
function supplierProfile() { return state.shippingProfiles[currentAccount?.loginId || "sup"] || { carrier: "한진택배", sender: "공급사 출고지", contractCode: "미설정", labelFormat: "A4 2분할", autoIssue: true }; }
function goodflowProfile() { return state.goodflowConnections?.[currentAccount?.loginId || "sup"] || { status: "disconnected", merchantId: "", carrier: supplierProfile().carrier, lastSync: "-", autoTracking: true }; }
function accountRoles(account = currentAccount) { return account?.roles?.length ? account.roles : [account?.role].filter(Boolean); }
function roleLabel(role = activeRole) { return ({ seller: "위탁셀러", supplier: "공급사", master: "마스터" })[role] || role; }
function latestSupplierApplication(loginId = currentAccount?.loginId) {
  return [...(state.supplierApplications || [])].filter(application => application.sellerLoginId === loginId).sort((a, b) => Number(b.attempt || 0) - Number(a.attempt || 0))[0] || null;
}
function pendingApprovalCount() {
  return state.members.filter(member => member.status === "pending").length + (state.supplierApplications || []).filter(application => application.status === "pending").length;
}
function platformFee(amount) { return Math.round(Number(amount || 0) * 0.07); }
function sellerDeposit(loginId = currentAccount?.loginId || "seller") {
  if (!state.deposits[loginId]) state.deposits[loginId] = { balance: 0, totalRefunded: 0, pending: 0, withdrawalPending: 0, bankAccount: null, withdrawals: [], transactions: [] };
  state.deposits[loginId].withdrawalPending = Number(state.deposits[loginId].withdrawalPending || 0);
  state.deposits[loginId].withdrawals = state.deposits[loginId].withdrawals || [];
  state.deposits[loginId].transactions = state.deposits[loginId].transactions || [];
  return state.deposits[loginId];
}
function notificationService(loginId = currentAccount?.loginId || "seller") {
  if (!state.notificationServices[loginId]) state.notificationServices[loginId] = { plan: "알림톡 스탠다드", monthlyFee: 2900, status: "paused", kakao: true, email: true, emailEnabled: true, emailAddress: currentAccount?.email || "seller@example.com", pcNotice: true, orderNotice: true, trackingNotice: true, refundNotice: true, priceNotice: true, deliveryDelayNotice: true, stockNotice: true, monthlyLimit: 500, used: 0 };
  return state.notificationServices[loginId];
}
function visibleNotifications() {
  const loginId = currentAccount?.loginId;
  return (state.notificationEvents || []).filter(item => item.recipientLoginId === loginId && (!item.audienceRole || item.audienceRole === activeRole));
}
function notificationTypeLabel(type) {
  return ({ order: "주문", tracking: "송장", refund: "환불", approval: "승인", shipment: "배송", system: "운영" })[type] || "알림";
}
function closeMobileSidebar(returnFocus = false) {
  const app = document.getElementById("appView");
  const backdrop = document.getElementById("mobileSidebarBackdrop");
  const trigger = document.getElementById("mobileMenuButton");
  const sidebar = document.getElementById("appSidebar");
  const isMobile = window.matchMedia("(max-width: 720px)").matches;
  app.dataset.sidebarOpen = "false";
  backdrop.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
  sidebar.inert = isMobile;
  document.body.classList.remove("mobile-menu-open");
  if (returnFocus && isMobile) trigger.focus();
}
function openMobileSidebar() {
  const app = document.getElementById("appView");
  const backdrop = document.getElementById("mobileSidebarBackdrop");
  const trigger = document.getElementById("mobileMenuButton");
  const sidebar = document.getElementById("appSidebar");
  app.dataset.sidebarOpen = "true";
  backdrop.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
  sidebar.inert = false;
  document.body.classList.add("mobile-menu-open");
  document.getElementById("mobileSidebarClose").focus();
}
function pushNotification(recipientLoginId, audienceRole, type, title, detail, channels = ["카카오 알림톡", "이메일"]) {
  state.notificationEvents.unshift({ id: `NT-${Date.now()}-${Math.random().toString(36).slice(2,5)}`, recipientLoginId, audienceRole, type, channels, title, detail, createdAt: "방금 전", read: false, delivery: "데모 대기" });
}
function audit(title, detail, stateName = "done", type = "change") {
  state.logs.unshift({ id: Date.now() + Math.random(), type, title, detail, actor: currentAccount?.name || "시스템", time: "방금 전", state: stateName });
}
function getAccount(id) {
  const normalized = String(id || "").trim().toLowerCase();
  const member = state.members.find(item => item.loginId.toLowerCase() === normalized);
  return member || (accounts[normalized] ? { id: normalized, loginId: normalized, status: "approved", ...accounts[normalized] } : null);
}
function margin(supply, sale) {
  const cost = Number(supply);
  const price = Number(sale);
  if (!Number.isFinite(cost) || !Number.isFinite(price) || price <= 0) return 0;
  return Math.round((price - cost) / price * 100);
}
function priceFromMargin(cost, marginRate) {
  const base = Number(cost);
  const rate = Math.min(95, Math.max(-100, Number(marginRate)));
  if (!Number.isFinite(base) || base < 0 || !Number.isFinite(rate)) return 0;
  const raw = base / (1 - rate / 100);
  return Math.max(0, Math.ceil(raw / 100) * 100);
}
function channelIdFromName(name) {
  const value = String(name || "").toLowerCase();
  if (value.includes("샘플주문")) return "sample";
  if (value.includes("쿠팡")) return "coupang";
  if (value.includes("카카오")) return "kakao";
  if (value.includes("카페") || value.includes("cafe")) return "cafe24";
  return "smartstore";
}
function channelMeta(id) {
  if (id === "sample") return { id: "sample", name: "샘플주문", mark: "S", color: "#111827", status: "internal" };
  return (state.channelConnections?.seller || initialState.channelConnections.seller).find(item => item.id === id) || { id, name: id, mark: "S", color: "#1761e8", status: "disconnected" };
}
function channelAsset(id) {
  return {
    smartstore: { slot: "channel.smartstore", src: "assets/channel-smartstore.webp", alt: "네이버 스마트스토어" },
    coupang: { slot: "channel.coupang", src: "assets/channel-coupang.png", alt: "쿠팡" },
    kakao: { slot: "channel.kakao", src: "assets/channel-kakao.png", alt: "카카오 쇼핑" },
    cafe24: { slot: "channel.cafe24", src: "assets/channel-cafe24.png", alt: "CAFE24" }
  }[id] || null;
}
function sellerChannels(loginId = currentAccount?.loginId || "seller") {
  return state.channelConnections[loginId] || state.channelConnections.seller || [];
}
function sellerProductChannelStatus(item, channel) {
  if (item.channelStatuses?.[channel.id]) return item.channelStatuses[channel.id];
  if (channel.status === "disconnected") return "미연동";
  return (item.channels || []).includes(channel.id) ? "판매중" : "판매중지/미노출";
}
function sellerChannelDetail(item, channel, product = productOf(item.productId)) {
  return item.channelDetails?.[channel.id] || { title: product?.name || "판매 상품", salePrice: Number(item.salePrice || product?.recommended || 0), category: `${product?.category || "식품"} > ${product?.originCountry || "상품"}`, reviews: 0 };
}
function channelSyncBadge(item, channel, status) {
  if (status !== "판매중") return "";
  const sync = item.channelSyncStatus?.[channel.id] || "synced";
  if (sync === "edited") return `<em class="channel-sync-chip edited">수정완료 · 전송전</em>`;
  if (sync === "sending") return `<em class="channel-sync-chip sending">전송중…</em>`;
  return `<em class="channel-sync-chip synced">동기화 완료</em>`;
}
function channelBranchRow(item, channel, product) {
  const status = sellerProductChannelStatus(item, channel);
  const statusClass = status === "판매중" ? "live" : status === "미연동" ? "unlinked" : "paused";
  const detail = sellerChannelDetail(item, channel, product);
  const channelMargin = margin(product?.supply || 0, detail.salePrice || item.salePrice);
  return `<div class="seller-channel-branch channel-commerce-detail">${channelMark(channel.id)}<span class="channel-product-copy"><b>${escapeHtml(channel.name)}</b><strong>${escapeHtml(detail.title)}</strong><small>${escapeHtml(detail.category)}</small></span><span class="channel-price-stack"><small>소비자가</small><b>${money(detail.salePrice)}</b><em>원가 ${money(product?.supply || 0)}</em></span><span class="channel-review channel-margin-stat"><b>${channelMargin}%</b><small>마진율</small></span><span class="channel-status-stack"><em class="channel-sale-status ${statusClass}">[${escapeHtml(status)}]</em>${channelSyncBadge(item, channel, status)}</span>${status === "판매중" ? `<div class="channel-sync-actions"><button type="button" class="channel-sync-btn pull" data-action="sync-channel-listing" data-id="${item.id}" data-channel="${channel.id}">상품 동기화</button><button type="button" class="channel-sync-btn push" data-action="push-channel-listing" data-id="${item.id}" data-channel="${channel.id}">상품 전송</button><button type="button" class="channel-sync-btn stop" data-action="open-stop-channel" data-id="${item.id}" data-channel="${channel.id}">판매중지</button></div>` : ""}</div>`;
}
function stopChannelListingModal(sellerProductId, channelId) {
  const item = state.sellerProducts.find(entry => entry.id === sellerProductId);
  const channel = sellerChannels().find(entry => entry.id === channelId);
  if (!item || !channel) return;
  const reasons = [
    { value: "상품중지", desc: "판매를 일시적으로 중단합니다." },
    { value: "품절", desc: "재고가 소진되어 주문을 받을 수 없습니다." },
    { value: "미진열", desc: "채널 진열대에서 내립니다." },
    { value: "미노출", desc: "검색·카테고리에서 노출을 숨깁니다." }
  ];
  openModal(`<h2>판매중지 처리</h2><p>${escapeHtml(channel.name)} · ${escapeHtml(sellerProductTitle(item))}<br>중지 사유를 선택하면 해당 채널의 상태가 즉시 변경됩니다.</p>
    <form id="stopChannelForm" class="form-grid" data-id="${item.id}" data-channel="${channelId}">
      <div class="form-field full stop-reason-list">${reasons.map((reason, index) => `<label><input type="radio" name="reason" value="${escapeHtml(reason.value)}" ${index === 0 ? "checked" : ""}><span><b>${escapeHtml(reason.value)}</b><small>${escapeHtml(reason.desc)}</small></span></label>`).join("")}</div>
      <div class="modal-actions full"><button type="button" class="secondary-button" data-close-modal>취소</button><button type="submit" class="refund-button">판매중지 처리</button></div>
    </form>`);
}
function queueTrackingSync(order) {
  if (!order?.tracking) return;
  const item = state.sellerProducts.find(product => product.sellerLoginId === order.sellerLoginId && product.productId === order.productId);
  const selected = new Set(item?.channels || [channelIdFromName(order.channel)]);
  order.channelTrackingStatuses = order.channelTrackingStatuses || {};
  sellerChannels(order.sellerLoginId).forEach(channel => {
    if (!selected.has(channel.id)) return;
    if (channel.status !== "connected") order.channelTrackingStatuses[channel.id] = "연동 필요";
    else order.channelTrackingStatuses[channel.id] = channel.trackingAutomation ? "자동전송 완료 · 데모" : "자동화 꺼짐";
  });
  order.channelTrackingSyncedAt = "방금 전";
}
function runSellerTrackingSync(showFeedback = true) {
  if (!currentAccount || activeRole !== "seller") return 0;
  let sent = 0;
  sellerChannels().filter(channel => channel.status === "connected" && channel.trackingAutomation).forEach(channel => {
    currentSellerOrders().forEach(order => {
      if (order.tracking && order.channelTrackingStatuses?.[channel.id] === "10분 자동전송 대기") {
        order.channelTrackingStatuses[channel.id] = "자동전송 완료 · 데모";
        order.channelTrackingSyncedAt = "방금 전";
        sent += 1;
      }
    });
    channel.lastTrackingPush = "방금 전";
  });
  if (sent) audit("송장 자동 동기화", `${sent}건의 송장 정보를 판매채널 전송완료 데모 상태로 변경했습니다. 실제 외부 API 전송은 연결 전입니다.`, "done", "channel");
  saveState();
  if (activeMenuIndex === 8) { render(); updateAccountUI(); }
  if (showFeedback) showToast(sent ? `${sent}건의 송장 동기화를 완료했습니다.` : "모든 송장이 최신 동기화 상태입니다.");
  return sent;
}
function channelMark(id, compact = false) {
  const channel = channelMeta(id);
  const asset = channelAsset(id);
  if (asset) return `<span class="channel-mark channel-mark-image ${compact ? "compact" : ""}"><img data-image-slot="${asset.slot}" src="${asset.src}" alt="${asset.alt}"></span>`;
  return `<span class="channel-mark ${compact ? "compact" : ""}" style="--channel-color:${channel.color}">${escapeHtml(channel.mark)}</span>`;
}
function menuIcon(name) {
  const paths = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-7h6v7"/>',
    market: '<path d="M4 7h16l-1 13H5L4 7Z"/><path d="M8 7a4 4 0 0 1 8 0"/><path d="M8 11h.01M16 11h.01"/>',
    product: '<path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5V16l-8 5-8-5V7.5Z"/><path d="M12 12v9"/>',
    message: '<path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9h8M8 12h5"/>',
    order: '<path d="M6 3h12v18H6z"/><path d="M9 3v3h6V3M9 10h6M9 14h6M9 18h4"/>',
    refund: '<path d="M8 7H4v-4"/><path d="M4 7a9 9 0 1 1-1 8"/><path d="M9 12h6M12 9v6"/>',
    calendar: '<path d="M4 5h16v16H4zM8 3v4M16 3v4M4 9h16"/><path d="M8 13h3v3H8z"/>',
    connection: '<path d="M9.5 14.5 7 17a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0"/><path d="m14.5 9.5 2.5-2.5a3 3 0 0 1 4 4l-4 4a3 3 0 0 1-4 0"/><path d="m8 16 8-8"/>',
    bell: '<path d="M6 16h12l-1.5-2v-4.5a4.5 4.5 0 0 0-9 0V14L6 16Z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
    card: '<path d="M3 6h18v12H3zM3 10h18M7 15h3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5L9 6a8 8 0 0 0-1.7 1L5 6 3 9.5 5.1 11a7 7 0 0 0 0 2L3 14.5 5 18l2.3-1a8 8 0 0 0 1.7 1l.5 3h5l.5-3a8 8 0 0 0 1.7-1l2.3 1 2-3.5-2.1-1.5a7 7 0 0 0 .1-1Z"/>',
    approval: '<path d="M7 3h10v4H7zM5 5H3v16h18V5h-2"/><path d="m8 14 3 3 6-7"/>',
    supplier: '<path d="M3 9h18l-2-5H5L3 9Z"/><path d="M5 9v12h14V9M9 21v-6h6v6"/>',
    seller: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    log: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
    printer: '<path d="M7 8V3h10v5M7 17H4v-7h16v7h-3M7 14h10v7H7z"/><path d="M17 11h.01"/>',
    price: '<path d="M4 5h10l6 6-9 9-7-7V5Z"/><circle cx="9" cy="10" r="1"/>',
    settlement: '<path d="M4 5h16v14H4zM8 9h8M8 13h5M16 16h.01"/>',
    onsale: '<path d="M20.5 7.5 12 3 3.5 7.5 12 12l8.5-4.5Z"/><path d="M3.5 7.5v9L12 21l8.5-4.5v-9"/><path d="m9 14 2 2 4-4"/>',
    notice: '<path d="M3 11v2a2 2 0 0 0 2 2h1l3 4v-4h2l7-4V7l-7-4H9L6 7H5a2 2 0 0 0-2 2Z"/><path d="M13 15.5V19a2 2 0 0 0 4 0v-2"/>',
    mapping: '<path d="M8 7h5a4 4 0 0 1 0 8h-1"/><path d="m10 4-3 3 3 3"/><path d="M16 17h-5a4 4 0 0 1 0-8h1"/><path d="m14 20 3-3-3-3"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name] || paths.product}</svg>`;
}
function roleIconMarkup(role) {
  const paths = {
    seller: '<path d="M5 9h14l-1 11H6L5 9Z"/><path d="M8 9V7a4 4 0 0 1 8 0v2"/><circle cx="12" cy="14" r="2.2"/><path d="M9 19a3 3 0 0 1 6 0"/>',
    supplier: '<path d="M3 9h18l-2-5H5L3 9Z"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6M7 12h.01M17 12h.01"/>',
    master: '<path d="M12 3 4 6.5v5.2c0 4.7 3.1 7.7 8 9.3 4.9-1.6 8-4.6 8-9.3V6.5L12 3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[role] || paths.seller}</svg>`;
}
function dashboardStatusIcon(type) {
  const paths = {
    total: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M8 14h3M8 17h7"/>',
    new: '<path d="M5 5h14v16H5z"/><path d="M8 9h8M8 13h5"/><circle cx="17" cy="17" r="4"/><path d="M17 15v4M15 17h4"/>',
    received: '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/><path d="m14.5 17 1.5 1.5 3-3"/>',
    ordered: '<path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5V16l-8 5-8-5V7.5Z"/><path d="M12 12v9"/>',
    preparing: '<path d="M4 7h16v13H4z"/><path d="M8 7a4 4 0 0 1 8 0M8 12h8M8 16h5"/>',
    shipping: '<path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    delivered: '<path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5V16l-8 5-8-5V7.5Z"/><path d="m8.5 15.5 2 2 4.5-4.5"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[type] || paths.total}</svg>`;
}
function dashboardKpiCard({ action, icon, label, value, description, tone = "blue", attributes = "" }) {
  return `<button type="button" class="dashboard-kpi-card tone-${tone}" data-action="${action}" ${attributes}>
    <span class="dashboard-kpi-icon">${dashboardStatusIcon(icon)}</span>
    <strong>${value}</strong>
    <small>${escapeHtml(description)}</small>
    <b>${escapeHtml(label)}</b>
  </button>`;
}
function accountGreetingName() {
  if (!currentAccount) return "고객";
  const representative = String(currentAccount.representative || "").trim();
  if (representative && !["위탁셀러", "공급사 담당자", "담당자"].includes(representative)) return representative;
  return currentAccount.name || currentAccount.company || roleLabel();
}
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
function contentText(key, fallback) {
  const saved = state.contentOverrides?.[key];
  return typeof saved === "string" && saved.trim() ? saved : fallback;
}
function editableText(key, fallback, className = "") {
  return `<span class="editable-copy ${className}" data-edit-key="${escapeHtml(key)}" contenteditable="${editMode ? "true" : "false"}" spellcheck="false">${escapeHtml(contentText(key, fallback))}</span>`;
}
function statusChip(status) {
  const colors = { "신규주문": "orange", "주문접수": "orange", "발주완료": "blue", "배송준비중": "orange", "배송중": "blue", "배송완료": "green", "출고취소": "red", "판매중": "green", "판매중지": "red", "확인필요": "red", "반영완료": "green", "공급사 확인중": "orange", "공급사 검토중": "orange", "협의 필요": "red", "회수 진행중": "blue", "반품 회수중": "blue", "공급사 입고확인 대기": "orange", "환불완료": "green", "두고머니 충전완료": "green", "예치금 충전완료": "green", "반품접수": "red", "환불접수": "red", "연동중": "blue", "확인중": "orange", "미연동": "red" };
  return `<span class="chip ${colors[status] || ""}">${status}</span>`;
}

function memberStatusChip(status) {
  const meta = {
    pending: ["승인 대기", "orange"],
    approved: ["승인 완료", "blue"],
    rejected: ["반려", "red"],
    suspended: ["이용 정지", "red"]
  }[status] || [status, ""];
  return `<span class="chip ${meta[1]}">${meta[0]}</span>`;
}

function render() {
  renderSeller();
  renderSupplier();
  renderMaster();
  document.getElementById("appView").dataset.role = activeRole;
  document.querySelectorAll(".role-view").forEach(view => view.classList.remove("active"));
  document.getElementById(`${activeRole}View`).classList.add("active");
  const baseTitle = ({ seller: "위탁셀러 워크스페이스", supplier: "공급사 워크스페이스", master: "마스터 운영센터" })[activeRole];
  const defaultTitle = activeMenuIndex === 0 ? baseTitle : roleMenus[activeRole][activeMenuIndex];
  const isDashboard = activeMenuIndex === 0;
  document.getElementById("pageContext").textContent = `${roleLabel()} ${isDashboard ? "대시보드" : "업무 메뉴"}`;
  document.getElementById("pageTitle").textContent = isDashboard
    ? `안녕하세요 ${accountGreetingName()}님! 👋`
    : (activeRole === "seller" ? contentText(`seller.page.${activeMenuIndex}`, defaultTitle) : defaultTitle);
  document.getElementById("pageSubtitle").textContent = isDashboard
    ? "오늘도 두고와 함께 쇼핑몰 성장을 만들어 가세요!"
    : `${roleLabel()} 업무를 한 화면에서 확인하고 처리하세요.`;
  const demoNotice = document.getElementById("demoNotice");
  if (demoNotice) demoNotice.hidden = activeRole === "seller" && (editMode || [3, 6].includes(activeMenuIndex));
  document.getElementById("appView").dataset.editMode = String(editMode && activeRole === "seller" && activeMenuIndex === 0);
}

function updateAccountUI() {
  if (!currentAccount) return;
  const accountNameText = activeRole === "supplier" ? workspaceCompany("supplier") : activeRole === "seller" ? (currentAccount.company || currentAccount.name) : currentAccount.name;
  document.getElementById("accountName").textContent = accountNameText;
  document.getElementById("accountRole").textContent = `${roleLabel()} 모드`;
  document.getElementById("accountAvatar").textContent = String(accountNameText || "?").trim().charAt(0);
  const dropdownName = document.getElementById("dropdownAccountName");
  if (dropdownName) dropdownName.textContent = activeRole === "supplier" ? (currentAccount.supplierCompany || currentAccount.company || currentAccount.name) : (currentAccount.company || currentAccount.name);
  const subscriptionAction = document.querySelector('[data-account-action="subscription"]');
  if (subscriptionAction) subscriptionAction.hidden = activeRole !== "seller";
  const dropdownRole = document.querySelector("#accountDropdown > div small");
  if (dropdownRole) dropdownRole.textContent = `${roleLabel()} 모드 · ${accountRoles().length > 1 ? "복수 역할 계정" : "전용 계정"}`;
  const switchButton = document.getElementById("workspaceSwitchButton");
  switchButton.hidden = currentAccount.role !== "seller";
  document.getElementById("workspaceSwitchLabel").textContent = "사용자 전환";
  document.getElementById("sidebarRoleIcon").innerHTML = roleIconMarkup(activeRole);
  document.getElementById("sidebarRoleName").textContent = roleLabel();
  const notices = visibleNotifications();
  document.getElementById("notificationCount").textContent = notices.filter(item => !item.read).length;
  document.getElementById("notificationButton").classList.toggle("has-alert", notices.some(item => !item.read));
  const alertCount = activeRole === "seller" ? currentPriceAlerts().filter(alert => alert.status === "확인필요").length : 0;
  const pendingCount = activeRole === "master" ? pendingApprovalCount() : 0;
  const shippingCount = activeRole === "supplier" ? currentSupplierOrders().filter(order => ["신규주문", "배송준비중"].includes(order.status)).length : 0;
  document.getElementById("workspaceMenu").innerHTML = roleMenuGroups[activeRole].map(group => {
    const buttons = group.indexes.map(index => {
      const item = roleMenus[activeRole][index];
      const badge = (activeRole === "seller" && index === 7 && alertCount) || (activeRole === "master" && index === 1 && pendingCount) || (activeRole === "supplier" && index === 3 && shippingCount);
      const badgeValue = activeRole === "seller" ? alertCount : activeRole === "supplier" ? shippingCount : pendingCount;
      return `<button type="button" class="${index === activeMenuIndex ? "active" : ""}" data-menu-index="${index}"${index === activeMenuIndex ? ' aria-current="page"' : ""}><span class="menu-icon">${menuIcon(menuIcons[activeRole][index])}</span><span class="menu-text">${escapeHtml(item)}</span>${badge ? `<b class="menu-badge">${badgeValue}</b>` : ""}</button>`;
    }).join("");
    return `<section class="workspace-menu-group"><p>${escapeHtml(group.label)}</p>${buttons}</section>`;
  }).join("");
  renderNotificationDropdown();
  const resetContentButton = document.getElementById("resetContentButton");
  if (resetContentButton) resetContentButton.hidden = true;
}

function showLogin() {
  currentAccount = null;
  document.getElementById("appView").hidden = true;
  document.getElementById("signupView").hidden = true;
  document.getElementById("partnerLoginView").hidden = true;
  document.getElementById("loginView").hidden = false;
  document.getElementById("loginPassword").value = "";
  document.getElementById("loginError").textContent = "";
  setTimeout(() => document.getElementById("loginId").focus(), 0);
}

function showPartnerLogin(role = "supplier") {
  currentAccount = null;
  document.getElementById("appView").hidden = true;
  document.getElementById("signupView").hidden = true;
  document.getElementById("loginView").hidden = true;
  document.getElementById("partnerLoginView").hidden = false;
  setPartnerLoginRole(role);
  document.getElementById("partnerLoginPassword").value = "";
  document.getElementById("partnerLoginError").textContent = "";
  setTimeout(() => document.getElementById("partnerLoginId").focus(), 0);
}

function setPartnerLoginRole(role) {
  partnerLoginRole = role === "master" ? "master" : "supplier";
  const isSupplier = partnerLoginRole === "supplier";
  document.querySelectorAll("[data-partner-role]").forEach(button => button.classList.toggle("active", button.dataset.partnerRole === partnerLoginRole));
  document.getElementById("partnerLoginTitle").textContent = isSupplier ? "공급사 로그인" : "관리자 로그인";
  document.getElementById("partnerLoginDescription").textContent = isSupplier ? "상품·재고·주문·송장을 관리합니다." : "전체 회원·상품·주문·이력을 관리합니다.";
  document.getElementById("partnerAccessLabel").textContent = isSupplier ? "공급사 전용" : "관리자 전용";
  document.getElementById("supplierSignupPrompt").hidden = !isSupplier;
  document.getElementById("partnerFindAccount").hidden = !isSupplier;
  document.getElementById("partnerDemoAccounts").innerHTML = `<p>클릭해서 데모 계정 입력</p><div><button data-partner-demo="${partnerLoginRole}">${isSupplier ? "공급사" : "관리자"} 데모 <b>${isSupplier ? "sup / sup" : "admin / admin"}</b></button></div>`;
  document.getElementById("partnerLoginId").value = "";
  document.getElementById("partnerLoginPassword").value = "";
  document.getElementById("partnerLoginError").textContent = "";
}

function showApp(accountId) {
  const account = getAccount(accountId);
  if (!account || account.status !== "approved") return showLogin();
  currentAccount = { roles: [account.role], ...account, id: account.loginId || accountId };
  activeRole = currentAccount.role;
  activeMenuIndex = 0;
  sellerCategory = "전체보기";
  sellerCategoryGroup = "식품";
  sellerCategorySub = "전체보기";
  sellerCategoryDetail = "전체보기";
  sellerShippingFilter = "all";
  sellerCountry = "전체 국가";
  sellerBrand = "전체 브랜드";
  sellerProductSearch = "";
  sellerOrderSearch = "";
  sellerOrderStage = "all";
  activeChatConnectionId = "";
  chatRoomFilter = "all";
  chatRoomSearch = "";
  editMode = false;
  refundMonth = "2026-09";
  refundSearch = "";
  refundTypeFilter = "all";
  sessionStorage.setItem(AUTH_KEY, currentAccount.loginId || accountId);
  document.getElementById("loginView").hidden = true;
  document.getElementById("partnerLoginView").hidden = true;
  document.getElementById("signupView").hidden = true;
  document.getElementById("appView").hidden = false;
  closeMobileSidebar();
  render();
  updateAccountUI();
  window.scrollTo({ top: 0 });
}

function initAuth() {
  const rememberedId = localStorage.getItem(REMEMBER_KEY) || "";
  document.getElementById("loginId").value = rememberedId;
  document.getElementById("rememberId").checked = Boolean(rememberedId);
  const sessionId = (sessionStorage.getItem(AUTH_KEY) || "").toLowerCase();
  if (getAccount(sessionId)?.status === "approved") showApp(sessionId);
  else showLogin();
}

function showSignup(role = "seller", returnTarget = "seller") {
  const normalizedRole = role === "supplier" ? "supplier" : "seller";
  signupReturnTarget = returnTarget;
  document.getElementById("loginView").hidden = true;
  document.getElementById("partnerLoginView").hidden = true;
  document.getElementById("appView").hidden = true;
  document.getElementById("signupView").hidden = false;
  document.getElementById("signupFormWrap").hidden = false;
  document.getElementById("signupComplete").hidden = true;
  document.getElementById("signupForm").reset();
  document.getElementById("signupRole").value = normalizedRole;
  document.getElementById("signupTitle").textContent = normalizedRole === "supplier" ? "두고 공급사 가입" : "두고 가입하기";
  document.getElementById("signupTypeLabel").textContent = normalizedRole === "supplier" ? "SUPPLIER REGISTRATION" : "SELLER REGISTRATION";
  document.getElementById("signupDescription").textContent = normalizedRole === "supplier" ? "3단계 입력 후 공급사 입점 승인을 요청합니다." : "3단계 입력 후 위탁셀러 승인을 요청합니다.";
  document.getElementById("signupVisualEyebrow").textContent = normalizedRole === "supplier" ? "DOOGO SUPPLIER" : "DOOGO SELLER";
  document.getElementById("signupVisualTitle").innerHTML = normalizedRole === "supplier" ? "좋은 상품을 공급하고,<br>새로운 판매처를 만나세요." : "좋은 공급상품을 골라,<br>바로 판매를 시작하세요.";
  document.getElementById("signupVisualDescription").innerHTML = normalizedRole === "supplier" ? "상품 등록부터 주문·송장·정산까지<br>두고가 공급사의 운영을 하나로 연결합니다." : "상품 소싱부터 주문·송장·가격 변경까지<br>두고가 공급과 판매를 하나의 흐름으로 연결합니다.";
  setSignupStep(1);
  window.scrollTo({ top: 0 });
}

function setSignupStep(step) {
  signupStep = Math.max(1, Math.min(3, Number(step) || 1));
  document.querySelectorAll("[data-signup-step]").forEach(panel => {
    const active = Number(panel.dataset.signupStep) === signupStep;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
  document.querySelectorAll("[data-signup-step-nav]").forEach(button => {
    const value = Number(button.dataset.signupStepNav);
    button.classList.toggle("active", value === signupStep);
    button.classList.toggle("complete", value < signupStep);
    const badge = button.querySelector("b");
    if (badge) badge.textContent = value < signupStep ? "✓" : String(value);
  });
  document.querySelectorAll("[data-signup-error]").forEach(element => element.textContent = "");
  document.querySelector(`[data-signup-step="${signupStep}"] input:not([type="hidden"])`)?.focus();
}

function validateSignupStep(step) {
  const form = document.getElementById("signupForm");
  const panel = form.querySelector(`[data-signup-step="${step}"]`);
  const error = panel?.querySelector("[data-signup-error]");
  const fields = [...(panel?.querySelectorAll("input[required]") || [])];
  for (const field of fields) {
    if (!field.checkValidity()) {
      if (error) error.textContent = field.validationMessage || "필수 항목을 확인해 주세요.";
      field.reportValidity();
      field.focus();
      return false;
    }
  }
  if (step === 1 && form.elements.password.value !== form.elements.passwordConfirm.value) {
    if (error) error.textContent = "비밀번호가 서로 일치하지 않습니다.";
    form.elements.passwordConfirm.focus();
    return false;
  }
  const email = String(form.elements.email.value || "").trim().toLowerCase();
  if (step === 1 && getAccount(email)) {
    if (error) error.textContent = "이미 가입된 이메일입니다.";
    form.elements.email.focus();
    return false;
  }
  if (step === 3 && !String(form.elements.referralCode.value || "").trim()) {
    if (error) error.textContent = "추천인 코드는 필수입니다.";
    form.elements.referralCode.focus();
    return false;
  }
  return true;
}

function returnToLogin() {
  document.getElementById("signupView").hidden = true;
  if (signupReturnTarget === "partner") showPartnerLogin("supplier");
  else showLogin();
}

function nextMemberId() {
  const largest = Math.max(...state.members.map(member => Number(member.id.replace(/\D/g, "")) || 1000));
  return `MB-${largest + 1}`;
}

function sectionHero(title, description, action = "") {
  return `<div class="hero-row section-hero"><div class="hero-copy"><h2>${title}</h2><p>${description}</p></div>${action}</div>`;
}

function sellerCatalogProducts() {
  const connectedSuppliers = new Set(currentSellerConnections().map(connection => connection.supplierLoginId));
  const query = sellerProductSearch.trim().toLowerCase();
  return state.products.filter(product => {
    const matchesText = !query || [product.id, product.name, product.supplier, product.origin, product.originCountry, product.category].some(value => String(value || "").toLowerCase().includes(query));
    const matchesShipping = sellerShippingFilter === "all" || (sellerShippingFilter === "overseas" ? product.shippingType === "overseas" : product.shippingType !== "overseas");
    const matchesCountry = sellerCountry === "전체 국가" || product.originCountry === sellerCountry;
    const matchesBrand = sellerBrand === "전체 브랜드" || product.supplier === sellerBrand;
    const matchesCategory = sellerCategory === "전체보기" || product.category === sellerCategory;
    const matchesSub = sellerCategorySub === "전체보기" || product.categorySub === sellerCategorySub;
    const matchesDetail = sellerCategoryDetail === "전체보기" || product.categoryDetail === sellerCategoryDetail;
    return product.status === "판매중" && product.soldOut !== "품절" && product.exposure !== "미노출" && product.visibility !== "비노출" && connectedSuppliers.has(product.supplierLoginId) && matchesCategory && matchesSub && matchesDetail && matchesText && matchesShipping && matchesCountry && matchesBrand;
  });
}

function productPhoto(product, className = "") {
  const index = Number(product?.imageIndex ?? 0) % 8;
  return `<img class="product-photo ${className}" src="assets/product-${String(index).padStart(2,"0")}.jpg" alt="${escapeHtml(product?.name || "상품 이미지")}">`;
}

function marketToolbar() {
  const categories = ["전체보기", "농산물", "수산물", "가공식품", "건강식품"];
  const countries = ["전체 국가", ...new Set(state.products.map(product => product.originCountry || "대한민국"))];
  const brands = ["전체 브랜드", ...new Set(state.products.map(product => product.supplier))];
  const path = [sellerCategoryGroup, sellerCategory === "전체보기" ? "" : sellerCategory, sellerCategorySub === "전체보기" ? "" : sellerCategorySub, sellerCategoryDetail === "전체보기" ? "" : sellerCategoryDetail];
  return `<div class="market-toolbar market-toolbar-shop"><label class="catalog-search"><span>⌕</span><input id="sellerCatalogSearch" value="${escapeHtml(sellerProductSearch)}" placeholder="상품명·브랜드·원산지 검색"></label><div class="market-filter-row">
    <div class="category-select-group"><span class="category-select-label">카테고리 <small>네이버쇼핑 기준 4단계</small></span><div class="category-select-pair category-select-quad">
      <select id="marketCategoryGroupSelect">${categoryLevelOptions(1, path).map(option => `<option value="${escapeHtml(option)}" ${sellerCategoryGroup === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select>
      <select id="marketCategoryMidSelect"><option value="전체보기" ${sellerCategory === "전체보기" ? "selected" : ""}>전체보기</option>${categoryLevelOptions(2, path).map(option => `<option ${sellerCategory === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select>
      <select id="marketCategorySubSelect"><option value="전체보기" ${sellerCategorySub === "전체보기" ? "selected" : ""}>전체보기</option>${categoryLevelOptions(3, path).map(option => `<option ${sellerCategorySub === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select>
      <select id="marketCategoryDetailSelect"><option value="전체보기" ${sellerCategoryDetail === "전체보기" ? "selected" : ""}>전체보기</option>${categoryLevelOptions(4, path).map(option => `<option ${sellerCategoryDetail === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select>
    </div></div>
    <label><span>소싱 국가</span><select id="marketCountrySelect">${countries.map(country => `<option ${sellerCountry === country ? "selected" : ""}>${escapeHtml(country)}</option>`).join("")}</select></label><label><span>브랜드</span><select id="marketBrandSelect">${brands.map(brand => `<option ${sellerBrand === brand ? "selected" : ""}>${escapeHtml(brand)}</option>`).join("")}</select></label><div class="shipping-tabs"><button class="${sellerShippingFilter === "all" ? "active" : ""}" data-action="filter-shipping" data-filter="all">전체</button><button class="${sellerShippingFilter === "domestic" ? "active" : ""}" data-action="filter-shipping" data-filter="domestic">국내배송</button><button class="${sellerShippingFilter === "overseas" ? "active" : ""}" data-action="filter-shipping" data-filter="overseas">해외소싱</button></div><button class="market-reset" data-action="reset-market-filter">초기화</button></div><div class="category-pills">${categories.slice(1).map(category => `<button class="${sellerCategory === category ? "active" : ""}" data-action="filter-products" data-category="${category}">${category}</button>`).join("")}<div class="market-view-toggle" role="group" aria-label="상품 보기 방식"><button type="button" class="${marketViewMode === "grid" ? "active" : ""}" data-action="set-market-view" data-view="grid" aria-label="바둑판 보기"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg></button><button type="button" class="${marketViewMode === "list" ? "active" : ""}" data-action="set-market-view" data-view="list" aria-label="목록 보기"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="16" width="18" height="4" rx="1"/></svg></button></div></div><span>검색 결과 <b>${sellerCatalogProducts().length}</b>개</span></div>`;
}

function marketplaceHeroTemplate() {
  const countries = [...new Set(state.products.map(product => product.originCountry || "대한민국"))];
  return `<div class="marketplace-hero open-market-hero"><div><span>DOOGO SOURCING</span><h2>나라·브랜드·카테고리로<br>내 매장 상품을 찾으세요</h2><p>승인된 공급사의 판매 콘텐츠와 공급 조건을 비교하고 바로 내 쇼핑몰로 가져올 수 있습니다.</p><button class="white-button" data-action="market-scroll">지금 소싱 시작하기 →</button></div><div class="marketplace-hero-stats"><div><b>${state.products.filter(product => product.status === "판매중").length}</b><span>판매 가능 상품</span></div><div><b>${countries.length}개국</b><span>글로벌 소싱</span></div><div><b>${currentSellerConnections().length}곳</b><span>승인 공급사</span></div></div></div>
    <section class="market-discovery"><div class="market-discovery-head"><span>DISCOVER</span><h3>어떤 방식으로 소싱할까요?</h3><p>원하는 탐색 기준을 먼저 선택하면 상품을 더 빠르게 비교할 수 있습니다.</p></div><div class="market-discovery-grid"><button data-action="market-preset" data-country="대한민국"><span>🇰🇷</span><b>국내 산지직송</b><small>당일·익일 출고 상품</small></button><button data-action="market-preset" data-filter="overseas"><span>🌏</span><b>해외 소싱</b><small>국가별 정식 수입 상품</small></button><button data-action="open-brand-directory"><span>✦</span><b>브랜드별 보기</b><small>검증된 공급사 상품</small></button><button data-action="market-preset" data-category="건강식품"><span>▦</span><b>카테고리 소싱</b><small>업종별 인기 상품</small></button></div></section>`;
}
function brandDirectoryGroups() {
  const groups = {};
  state.products.forEach(product => {
    const brand = product.supplier;
    groups[product.category] = groups[product.category] || new Map();
    const bucket = groups[product.category];
    bucket.set(brand, (bucket.get(brand) || 0) + 1);
  });
  return groups;
}
function brandDirectoryModal() {
  const groups = brandDirectoryGroups();
  const categories = Object.keys(groups);
  openModal(`<div class="brand-directory-head"><span>DOOGO BRAND</span><h2>브랜드관</h2><p>카테고리별 입점 브랜드를 확인하고, 브랜드를 선택하면 해당 브랜드 상품만 바로 검색됩니다.</p></div>
    <div class="brand-directory-body">${categories.length ? categories.map(category => `<section class="brand-directory-group"><h3>${escapeHtml(category)}</h3><div class="brand-directory-grid">${[...groups[category].entries()].map(([brand, count]) => `<button type="button" class="brand-directory-card" data-action="select-brand" data-brand="${escapeHtml(brand)}" data-category="${escapeHtml(category)}"><span class="brand-directory-avatar">${escapeHtml(brand.slice(0,1))}</span><b>${escapeHtml(brand)}</b><small>${count}개 상품</small></button>`).join("")}</div></section>`).join("") : `<div class="empty">등록된 브랜드가 없습니다.</div>`}</div>`);
  document.querySelector("#modal .modal").classList.add("brand-directory-modal");
}

function sellerProductsTable() {
  const items = currentSellerProducts().filter(item => item.approvalStatus === "승인대기");
  if (!items.length) return `<div class="empty">승인 대기중인 상품이 없습니다. 공급사 승인이 완료되면 ‘상품승인’ 메뉴로 이동합니다.</div>`;
  return `<div class="seller-product-tree">${items.map(item => {
    const product = productOf(item.productId);
    return `<article class="seller-product-node pick-approval-node">
      <div class="seller-product-parent pick-approval-row">
        ${productPhoto({ ...product, imageIndex: item.imageIndex }, "table-photo")}
        <span class="seller-product-main"><small>원본코드 ${escapeHtml(item.productId)} · ${escapeHtml(item.id)}</small><strong>${escapeHtml(sellerProductTitle(item, product))}</strong><em>공급가 ${money(product?.supply || 0)} · 지정판매가 ${money(product?.recommended || 0)}</em></span>
        <span class="seller-product-price"><small>내가 판매하고 싶은 가격</small><b>${money(item.salePrice)}</b><em>마진 ${margin(product?.supply || 0, item.salePrice)}%</em></span>
        <span class="seller-product-live"><b class="approval-pending-badge">승인대기</b><small>공급사 승인 후 진행 가능</small></span>
        <div class="pick-approval-actions"><button type="button" class="secondary-button" data-action="simulate-supplier-approval" data-id="${item.id}">데모: 공급사 승인 시뮬레이션</button></div>
      </div>
    </article>`;
  }).join("")}</div>`;
}

function supplierProductsTable() {
  const products = currentSupplierProducts();
  return `<div class="table-wrap"><table><thead><tr><th>상품</th><th>카테고리</th><th>공급가</th><th>권장 판매가</th><th>재고</th><th>셀러 선택</th><th>상태</th><th>관리</th></tr></thead><tbody>
    ${products.length ? products.map(product => `<tr><td><div class="table-product">${productPhoto(product, "table-photo")}<span><strong>${escapeHtml(product.name)}</strong><small>${product.id}</small></span></div></td><td>${escapeHtml(product.category)}</td><td><strong>${money(product.supply)}</strong></td><td>${money(product.recommended)}</td><td><b class="${product.stock < 50 ? "stock-low" : ""}">${product.stock}개</b></td><td>${state.sellerProducts.filter(item => item.productId === product.id).length}곳</td><td>${statusChip(product.status)}</td><td><div class="row-actions"><button class="small-button" data-action="edit-product" data-id="${product.id}">수정</button><button class="small-button" data-action="adjust-stock" data-id="${product.id}">재고</button><button class="small-button reject" data-action="change-price" data-id="${product.id}">가격</button></div></td></tr>`).join("") : `<tr><td colspan="8"><div class="empty">등록된 상품이 없습니다.</div></td></tr>`}
  </tbody></table></div>`;
}

function masterProductsTable() {
  return `<div class="table-wrap"><table><thead><tr><th>상품</th><th>공급사</th><th>카테고리</th><th>공급가</th><th>재고</th><th>선택 셀러</th><th>상태</th><th>최근 관리</th></tr></thead><tbody>${state.products.map(product => `<tr><td><div class="table-product">${productPhoto(product, "table-photo")}<span><strong>${escapeHtml(product.name)}</strong><small>${product.id}</small></span></div></td><td>${escapeHtml(product.supplier)}</td><td>${escapeHtml(product.category)}</td><td>${money(product.supply)}</td><td><b class="${product.stock < 50 ? "stock-low" : ""}">${product.stock}개</b></td><td>${state.sellerProducts.filter(item => item.productId === product.id).length}곳</td><td>${statusChip(product.status)}</td><td><button class="text-button" data-action="product-history" data-id="${product.id}">변경 이력</button></td></tr>`).join("")}</tbody></table></div>`;
}

function memberDirectoryTable(role) {
  const members = state.members.filter(member => (member.roles || [member.role]).includes(role));
  return `<div class="table-wrap"><table><thead><tr><th>사업자</th><th>대표자</th><th>사업자등록번호</th><th>연락처</th><th>상품/주문</th><th>가입 상태</th><th>관리</th></tr></thead><tbody>
    ${members.length ? members.map(member => { const volume = role === "supplier" ? `${state.products.filter(product => product.supplierLoginId === member.loginId).length}개 상품` : `${state.orders.filter(order => order.sellerLoginId === member.loginId).length}건 주문`; const company = role === "supplier" ? (member.supplierCompany || member.company) : member.company; return `<tr><td><strong>${escapeHtml(company)}</strong>${(member.roles||[]).length>1 ? ` <span class="dual-role-badge">복수역할</span>` : ""}<br><small>${escapeHtml(member.loginId)}</small></td><td>${escapeHtml(member.representative)}</td><td>${escapeHtml(member.businessNo)}</td><td>${escapeHtml(member.contact)}</td><td>${volume}</td><td>${memberStatusChip(member.status)}</td><td><div class="row-actions"><button class="text-button" data-action="member-detail" data-id="${member.id}">상세</button>${member.status === "approved" ? `<button class="small-button reject" data-action="toggle-member" data-id="${member.id}">이용 정지</button>` : member.status === "suspended" ? `<button class="small-button approve" data-action="toggle-member" data-id="${member.id}">재활성</button>` : ""}</div></td></tr>`; }).join("") : `<tr><td colspan="7"><div class="empty">해당 회원이 없습니다.</div></td></tr>`}
  </tbody></table></div>`;
}

function accountProfileTemplate() {
  const account = currentAccount;
  const company = activeRole === "supplier" ? (account.supplierCompany || account.company) : account.company;
  const editButton = `<button class="primary-button" data-action="account-tab" data-tab="business">사업자 정보 수정</button>`;
  return `${sectionHero("내 사업자 정보", "승인된 계정과 사업자 정보를 확인하고 변경할 수 있습니다.", editButton)}<div class="panel profile-panel"><div class="member-detail-grid"><div><span>상호명</span><b>${escapeHtml(company)}</b></div><div><span>대표자명</span><b>${escapeHtml(account.representative)}</b></div><div><span>사업자등록번호</span><b>${escapeHtml(account.businessNo)}</b></div><div><span>현재 모드</span><b>${escapeHtml(roleLabel())}${accountRoles().length > 1 ? " · 복수 역할" : ""}</b></div><div><span>연락처</span><b>${escapeHtml(account.contact)}</b></div><div><span>이메일</span><b>${escapeHtml(account.email)}</b></div></div><div class="profile-actions"><button class="secondary-button" data-action="account-tab" data-tab="business">정보 수정</button>${account.role === "seller" ? `<button class="role-profile-switch" data-account-action="role-switch">⇄ 사용자 전환 및 공급사 권한 관리</button>` : ""}</div></div>${activeRole === "supplier" ? goodflowIntegrationTemplate() : ""}`;
}

function sellerAccountProfileTemplate() {
  const account = currentAccount;
  const subscription = state.subscriptions[account.loginId] || state.subscriptions.seller;
  const application = latestSupplierApplication();
  const connectedChannels = (state.channelConnections[account.loginId] || state.channelConnections.seller || []).filter(channel => channel.status === "connected").length;
  const supplierButton = accountRoles().includes("supplier")
    ? `<button class="profile-link-button" data-action="open-user-switch"><span>⇄</span><b>사용자 전환</b><small>승인된 공급사 워크스페이스 열기</small><em>열기</em></button>`
    : application?.status === "pending"
      ? `<button class="profile-link-button" data-action="open-user-switch"><span>⌛</span><b>공급사 요청 현황</b><small>${escapeHtml(application.company)} · 검토 진행 중</small><em>확인</em></button>`
      : `<button class="profile-link-button accent" data-action="open-supplier-application"><span>＋</span><b>${application?.status === "rejected" ? "공급사 다시 요청하기" : "공급사 요청하기"}</b><small>자체 브랜드 상품을 두고 위탁셀러에게 공급</small><em>신청</em></button>`;
  return `<section class="seller-profile-hero">
      <div class="profile-gradient"></div>
      <div class="profile-identity"><span class="profile-symbol"><img src="assets/doogomarket-symbol.png" alt=""></span><div><span>SELLER BUSINESS PROFILE</span><h2>${escapeHtml(account.company || account.name)}</h2><p>${escapeHtml(account.representative)} 대표 · 위탁셀러 승인 계정</p></div><span class="profile-approved">✓ 사업자 승인 완료</span></div>
      <div class="profile-glance"><div><span>판매 상품</span><strong>${currentSellerProducts().length}개</strong></div><div><span>연결 공급사</span><strong>${currentSellerConnections().length}곳</strong></div><div><span>연동 채널</span><strong>${connectedChannels}개</strong></div><div><span>이용 플랜</span><strong>${escapeHtml(subscription.plan)}</strong></div></div>
    </section>
    <div class="seller-profile-layout">
      <section class="panel seller-business-card"><div class="profile-section-head"><div><span>BUSINESS INFORMATION</span><h3>사업자 기본 정보</h3><p>주문·정산·세금계산서에 사용되는 계정 정보입니다.</p></div><button class="secondary-button" data-action="account-tab" data-tab="business">정보 수정</button></div><div class="profile-detail-grid"><div><span>상호명</span><b>${escapeHtml(account.company)}</b></div><div><span>대표자명</span><b>${escapeHtml(account.representative)}</b></div><div><span>사업자등록번호</span><b>${escapeHtml(account.businessNo)}</b></div><div><span>연락처</span><b>${escapeHtml(account.contact)}</b></div><div class="wide"><span>이메일</span><b>${escapeHtml(account.email)}</b></div><div><span>계정 권한</span><b>${accountRoles().length > 1 ? "위탁셀러 · 공급사" : "위탁셀러"}</b></div><div><span>업태 · 종목</span><b>${escapeHtml(account.businessType || "미입력")} · ${escapeHtml(account.businessItem || "미입력")}</b></div><div class="wide"><span>사업장 주소</span><b>${escapeHtml(account.businessAddress || "미입력")}</b></div><div><span>세금계산서 이메일</span><b>${escapeHtml(account.taxInvoiceEmail || account.email)}</b></div><div><span>공급사 노출 전화번호</span><b>${escapeHtml(account.supplierVisiblePhone || "미입력")}</b></div><div class="wide"><span>정산 계좌</span><b>${account.bankName ? `${escapeHtml(account.bankName)} ${escapeHtml(account.bankAccountNumber || "")} (${escapeHtml(account.bankAccountHolder || account.representative)})` : "미입력"}</b></div></div></section>
      <section class="panel seller-service-card"><div class="profile-section-head"><div><span>QUICK SETTINGS</span><h3>서비스 및 권한 관리</h3><p>자주 사용하는 설정으로 바로 이동합니다.</p></div></div><div class="profile-link-list"><button class="profile-link-button" data-action="open-seller-channels"><span>↗</span><b>쇼핑몰 연동</b><small>네이버·쿠팡·카카오·CAFE24</small><em>관리</em></button><button class="profile-link-button" data-action="open-seller-subscription"><span>₩</span><b>정기구독</b><small>${money(subscription.monthlyFee)} · 다음 결제 ${escapeHtml(subscription.nextBilling)}</small><em>관리</em></button>${supplierButton}</div></section>
    </div>`;
}

function goodflowIntegrationTemplate() {
  const profile = goodflowProfile();
  const connected = profile.status === "connected";
  return `<section class="panel goodflow-card"><div class="goodflow-brand"><span>G</span><div><small>DELIVERY API</small><h3>굿스플로 택배 연동</h3><p>계약 택배사를 연결해 배송준비중 주문의 송장번호와 라벨을 자동 생성합니다.</p></div></div><dl><div><dt>연동 상태</dt><dd>${connected ? `<span class="live-dot">연동중</span>` : `<span class="chip red">미연동</span>`}</dd></div><div><dt>연동 택배사</dt><dd>${escapeHtml(profile.carrier || "미설정")}</dd></div><div><dt>계정 코드</dt><dd>${escapeHtml(profile.merchantId || "미설정")}</dd></div><div><dt>마지막 동기화</dt><dd>${escapeHtml(profile.lastSync || "-")}</dd></div></dl><button class="${connected ? "secondary-button" : "primary-button"}" data-action="goodflow-settings">${connected ? "굿스플로 연동 설정" : "굿스플로 연동 시작"}</button><small class="integration-disclaimer">프로토타입에서는 연동 정보만 브라우저에 저장되며 실제 굿스플로 API를 호출하지 않습니다.</small></section>`;
}

function partnerMessengerTemplate(connections, perspective) {
  if (!connections.length) return `<div class="panel empty connection-empty">연결된 거래처가 생기면 두고톡으로 상품·출고 메시지를 주고받을 수 있습니다.</div>`;
  const roomRows = connections.map(connection => {
    const party = perspective === "seller" ? memberByLogin(connection.supplierLoginId) : memberByLogin(connection.sellerLoginId);
    const name = perspective === "seller" ? supplierName(connection.supplierLoginId) : (party?.company || connection.sellerLoginId);
    const roomMessages = state.connectionMessages.filter(message => message.supplierLoginId === connection.supplierLoginId && message.sellerLoginId === connection.sellerLoginId);
    const last = roomMessages.at(-1);
    const unread = Boolean(last && last.senderLoginId !== currentAccount.loginId);
    const trading = state.orders.some(order => order.supplierLoginId === connection.supplierLoginId && order.sellerLoginId === connection.sellerLoginId);
    const favorite = Boolean(state.chatFavorites?.[connection.id]);
    return { connection, party, name, last, unread, trading, favorite };
  });
  const query = chatRoomSearch.trim().toLowerCase();
  const visibleRooms = roomRows.filter(room => {
    const queryMatch = !query || [room.name, room.last?.text, room.party?.representative].some(value => String(value || "").toLowerCase().includes(query));
    const filterMatch = chatRoomFilter === "all" || (chatRoomFilter === "unread" && room.unread) || (chatRoomFilter === "trading" && room.trading) || (chatRoomFilter === "favorite" && room.favorite);
    return queryMatch && filterMatch;
  });
  const active = connections.find(connection => connection.id === activeChatConnectionId) || visibleRooms[0]?.connection || connections[0];
  activeChatConnectionId = active.id;
  const supplier = memberByLogin(active.supplierLoginId);
  const seller = memberByLogin(active.sellerLoginId);
  const other = perspective === "seller" ? supplier : seller;
  const otherName = perspective === "seller" ? supplierName(active.supplierLoginId) : (seller?.company || active.sellerLoginId);
  const messages = state.connectionMessages.filter(message => message.supplierLoginId === active.supplierLoginId && message.sellerLoginId === active.sellerLoginId);
  const products = state.products.filter(product => product.supplierLoginId === active.supplierLoginId);
  const orders = state.orders.filter(order => order.supplierLoginId === active.supplierLoginId && order.sellerLoginId === active.sellerLoginId);
  const tradedProducts = new Set(orders.map(order => order.productId)).size;
  const favorite = Boolean(state.chatFavorites?.[active.id]);
  return `<div id="supplierInquiryPanel" class="messenger-shell panel">
    <aside class="messenger-list"><div class="messenger-list-head"><b>메시지</b><span>${connections.length}</span></div><div class="messenger-tabs">${[["all","전체"],["unread","안읽음"],["trading","거래중"],["favorite","즐겨찾기"]].map(([key,label]) => `<button type="button" class="${chatRoomFilter === key ? "active" : ""}" data-action="chat-filter" data-filter="${key}">${label}</button>`).join("")}</div><label><span>⌕</span><input id="chatRoomSearch" value="${escapeHtml(chatRoomSearch)}" placeholder="거래처·메시지 검색"></label><div class="messenger-room-list">${visibleRooms.length ? visibleRooms.map(room => `<button class="messenger-party ${room.connection.id === active.id ? "active" : ""}" type="button" data-action="select-chat-room" data-id="${room.connection.id}"><span class="connection-avatar ${perspective === "supplier" ? "seller" : ""}">${perspective === "seller" ? "공" : "셀"}</span><span><b>${escapeHtml(room.name)}</b><small>${escapeHtml(room.last?.text || "새 대화를 시작하세요")}</small></span><em>${room.unread ? `<i>새 메시지</i>` : escapeHtml(room.last?.createdAt || room.connection.createdAt)}</em></button>`).join("") : `<div class="messenger-empty">조건에 맞는 대화가 없습니다.</div>`}</div></aside>
    <section class="messenger-main"><header><div><b>${escapeHtml(otherName)}</b><small><i></i> 거래중 · 평균 응답 1시간 이내</small></div><div class="messenger-head-actions"><button type="button" data-action="toggle-chat-favorite" data-id="${active.id}" aria-pressed="${favorite}">${favorite ? "★ 즐겨찾기" : "☆ 즐겨찾기"}</button><button type="button" data-action="${perspective === "seller" ? "supplier-contact" : "partner-detail"}" data-id="${perspective === "seller" ? active.supplierLoginId : active.sellerLoginId}">거래처 정보</button></div></header><div class="chat-context-strip"><span>상품·주문번호를 메시지에 연결해 거래 기록을 한곳에 남길 수 있습니다.</span><button type="button" data-action="${perspective === "seller" ? "open-catalog" : "open-supplier-orders"}">${perspective === "seller" ? "공급 상품 보기" : "주문 확인"} →</button></div><div class="chat-thread rich-thread"><div class="chat-date"><span>오늘</span></div>${messages.map(message => { const mine = message.senderLoginId === currentAccount.loginId; const senderName = message.senderLoginId === active.supplierLoginId ? supplierName(active.supplierLoginId) : (seller?.company || active.sellerLoginId); return `<div class="chat-message ${mine ? "mine" : ""}"><small>${escapeHtml(senderName)} · ${message.createdAt}</small><p>${escapeHtml(message.text)}</p>${message.productId ? `<button data-action="product-detail" data-id="${message.productId}">연결 상품 보기 →</button>` : ""}${message.orderId ? `<button data-action="order-detail" data-id="${message.orderId}">주문 ${escapeHtml(message.orderId)} 보기 →</button>` : ""}</div>`; }).join("")}</div><form id="connectionMessageForm" class="chat-compose rich-compose"><input type="hidden" name="supplierLoginId" value="${active.supplierLoginId}"><input type="hidden" name="sellerLoginId" value="${active.sellerLoginId}"><button type="button" class="chat-attach-photo" data-action="chat-attach" aria-label="사진 첨부하기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.5"/></svg><span>사진 첨부하기</span></button><input name="text" placeholder="메시지를 입력해 주세요 (Enter 전송)" maxlength="240" required><button class="primary-button" type="submit">전송</button></form></section>
    <aside class="messenger-profile"><span class="connection-avatar large">${perspective === "seller" ? "공" : "셀"}</span><h3>${escapeHtml(otherName)}</h3><p>${escapeHtml(other?.representative || "담당자")} · ${perspective === "seller" ? "공급사" : "위탁셀러"}</p><div class="messenger-rating"><b>★ 4.9</b><span>거래 만족도</span></div><div class="messenger-profile-kpis"><span><small>거래 상품</small><b>${tradedProducts}개</b></span><span><small>누적 주문</small><b>${orders.length}건</b></span><span><small>평균 응답</small><b>1시간</b></span><span><small>공급 상품</small><b>${products.length}개</b></span></div><div><span>연락처</span><b>${escapeHtml(other?.contact || "-")}</b></div><div><span>이메일</span><b>${escapeHtml(other?.email || "-")}</b></div><label class="partner-note"><span>거래처 메모</span><textarea id="partnerNoteInput" rows="3" placeholder="내부 메모를 남겨주세요.">${escapeHtml(state.partnerNotes?.[active.id] || "")}</textarea></label><button type="button" data-action="save-chat-note" data-id="${active.id}">메모 저장</button><div class="messenger-products"><span>최근 공급상품</span>${products.slice(0,2).map(product => `<button type="button" data-action="product-detail" data-id="${product.id}">${productPhoto(product,"table-photo")}<b>${escapeHtml(product.name)}</b></button>`).join("")}</div><small>두고톡은 주문 건수가 아니라 거래처 관계를 기준으로 하나만 열립니다.</small></aside>
  </div>`;
}

function sellerConnectionTemplate() {
  const connections = currentSellerConnections();
  const pcNotice = notificationService().pcNotice;
  return `${partnerMessengerTemplate(connections, "seller")}
    <div class="pc-notice-bar pc-notice-below ${pcNotice ? "on" : ""}"><span>🔔</span><div><b>PC 알림으로 새 메시지를 바로 확인하세요</b><small>거래처가 답변하면 브라우저 알림으로 안내합니다.</small></div><button class="notification-permission" data-action="toggle-pc-notifications">${pcNotice ? "PC 알림 켜짐" : "PC 알림 받기"}</button><button class="text-button" data-action="open-chat-settings">알림 설정</button></div>
    <div class="connection-utility panel connection-utility-bottom"><div><span class="connection-avatar">＋</span><p><b>새 공급사 연결</b><small>공급사가 발급한 코드를 등록합니다. 주문이 여러 건 생성되어도 거래처별 채팅방은 하나만 유지됩니다.</small></p></div><form id="connectSupplierForm" class="connection-code-form"><input name="code" placeholder="예: SANDI-84H3" required><button class="primary-button" type="submit">연결하기</button></form></div>`;
}

function supplierConnectionTemplate() {
  const connections = currentSupplierConnections();
  const invite = state.connectionInvites.find(item => item.supplierLoginId === currentAccount.loginId && item.status === "active");
  return `${sectionHero("거래처 연결", "연결 코드를 셀러에게 전달하고 주문·상품·출고 대화를 두고톡에서 관리합니다.", `<button class="secondary-button" data-action="generate-invite">연결 코드 새로 만들기</button>`)}
    <div class="invite-code-box panel"><span>현재 연결 코드</span><strong>${escapeHtml(invite?.code || "미발급")}</strong><button class="text-button" data-action="copy-invite" data-code="${escapeHtml(invite?.code || "")}">코드 복사</button><small>승인된 위탁셀러만 연결할 수 있습니다.</small></div>${supplierPartnerSalesTemplate(connections)}${partnerMessengerTemplate(connections, "supplier")}`;
}

function supplierPartnerSalesTemplate(connections) {
  if (!connections.length) return "";
  const connection = connections[0];
  const seller = memberByLogin(connection.sellerLoginId);
  const sellerItems = state.sellerProducts.filter(item => item.sellerLoginId === connection.sellerLoginId && productOf(item.productId)?.supplierLoginId === currentAccount.loginId);
  const orders = state.orders.filter(order => order.supplierLoginId === currentAccount.loginId && order.sellerLoginId === connection.sellerLoginId);
  const totalQty = orders.reduce((sum, order) => sum + Number(order.qty || 0), 0);
  const totalSales = orders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
  return `<section class="panel partner-sales-panel"><div class="panel-head"><div><h3>${escapeHtml(seller?.company || connection.sellerLoginId)} 판매 현황</h3><p>이 거래처가 가져간 내 상품과 주문·판매 실적입니다.</p></div><span class="chip blue">실시간 샘플</span></div><div class="partner-sales-kpis"><div><span>판매 중인 내 상품</span><strong>${sellerItems.length}개</strong></div><div><span>누적 주문</span><strong>${orders.length}건</strong></div><div><span>누적 판매수량</span><strong>${totalQty}개</strong></div><div><span>소비자 판매액</span><strong>${money(totalSales)}</strong></div></div><div class="table-wrap"><table><thead><tr><th>상품</th><th>판매 채널</th><th>주문</th><th>판매 수량</th><th>판매액</th></tr></thead><tbody>${sellerItems.length ? sellerItems.map(item => { const product = productOf(item.productId); const productOrders = orders.filter(order => order.productId === item.productId); return `<tr><td><div class="table-product">${productPhoto(product,"table-photo")}<span><strong>${escapeHtml(product?.name || "상품")}</strong><small>${escapeHtml(item.id)}</small></span></div></td><td>${escapeHtml((item.channels || []).map(id => channelMeta(id).name).join(", ") || item.channel)}</td><td>${productOrders.length}건</td><td>${productOrders.reduce((sum,order)=>sum+order.qty,0)}개</td><td><strong>${money(productOrders.reduce((sum,order)=>sum+order.amount,0))}</strong></td></tr>`; }).join("") : `<tr><td colspan="5"><div class="empty">이 거래처가 아직 가져간 상품이 없습니다.</div></td></tr>`}</tbody></table></div></section>`;
}

function masterConnectionsTemplate() {
  return `${sectionHero("거래처 연결 관리", "공급사와 위탁셀러의 연결 상태, 공유 상품과 주문 흐름을 통합 조회합니다.")}<div class="stats-grid"><div class="stat-card"><span class="label">활성 연결</span><strong>${state.connections.filter(item => item.status === "connected").length}</strong><small>상품·주문 공유 중</small></div><div class="stat-card"><span class="label">활성 초대코드</span><strong>${state.connectionInvites.filter(item => item.status === "active").length}</strong><small>공급사 발급</small></div><div class="stat-card"><span class="label">운영 메모</span><strong>${state.connectionMessages.length}</strong><small>양쪽 계정 공유</small></div></div><div class="panel"><div class="panel-head"><div><h3>전체 연결 관계</h3><p>연결된 공급사·셀러와 데이터 범위를 확인합니다.</p></div></div><div class="table-wrap"><table><thead><tr><th>연결번호</th><th>공급사</th><th>위탁셀러</th><th>공유 상품</th><th>연결 주문</th><th>상태</th><th>연결일</th></tr></thead><tbody>${state.connections.map(connection => `<tr><td class="order-id">${connection.id}</td><td><strong>${escapeHtml(memberByLogin(connection.supplierLoginId)?.company || connection.supplierLoginId)}</strong></td><td><strong>${escapeHtml(memberByLogin(connection.sellerLoginId)?.company || connection.sellerLoginId)}</strong></td><td>${state.products.filter(product => product.supplierLoginId === connection.supplierLoginId).length}개</td><td>${state.orders.filter(order => order.supplierLoginId === connection.supplierLoginId && order.sellerLoginId === connection.sellerLoginId).length}건</td><td><span class="live-dot">연결됨</span></td><td>${connection.createdAt}</td></tr>`).join("")}</tbody></table></div></div>`;
}

function shippingSettingsTemplate() {
  const profile = supplierProfile();
  return `${sectionHero("배송 · 송장 설정", "공급사 계정의 택배 계약과 굿스플로 연결을 저장하면 배송준비중 주문에서 송장을 자동 발급할 수 있습니다.")}${goodflowIntegrationTemplate()}<div class="shipping-settings"><div class="panel shipping-profile-card"><div class="panel-head"><div><h3>내 택배 계약 프로필</h3><p>송장 자동발급 시 기본값으로 사용됩니다.</p></div><span class="chip blue">계정 전용</span></div><form id="shippingProfileForm" class="shipping-profile-form"><div class="form-field"><label>기본 택배사</label><select name="carrier"><option ${profile.carrier === "한진택배" ? "selected" : ""}>한진택배</option><option ${profile.carrier === "CJ대한통운" ? "selected" : ""}>CJ대한통운</option><option ${profile.carrier === "롯데택배" ? "selected" : ""}>롯데택배</option></select></div><div class="form-field"><label>출고지명</label><input name="sender" value="${escapeHtml(profile.sender)}" required></div><div class="form-field"><label>택배 계약코드</label><input name="contractCode" value="${escapeHtml(profile.contractCode)}" required></div><div class="form-field"><label>송장 용지</label><select name="labelFormat"><option ${profile.labelFormat === "A4 2분할" ? "selected" : ""}>A4 2분할</option><option ${profile.labelFormat === "A4 4분할" ? "selected" : ""}>A4 4분할</option><option ${profile.labelFormat === "감열 100×150" ? "selected" : ""}>감열 100×150</option></select></div><label class="auto-issue-check"><input type="checkbox" name="autoIssue" ${profile.autoIssue ? "checked" : ""}><span><b>송장번호 자동 생성</b><small>배송준비중 주문에서 번호 발급·라벨 출력·셀러 반영</small></span></label><button class="primary-button" type="submit">배송 설정 저장</button></form></div><div class="panel label-preview"><div class="panel-head"><div><h3>송장 미리보기</h3><p>${escapeHtml(profile.labelFormat)}</p></div></div><div class="shipping-label-mini"><span>${escapeHtml(profile.carrier)}</span><b>DO-260909-044</b><strong>5057 2048 3911</strong><small>보내는 분 · ${escapeHtml(profile.sender)}<br>받는 분 · 최마누카</small><i></i><em>|||| ||| |||| | |||||</em></div><p>실제 택배사 API는 연결하지 않고 화면에서 자동발급 흐름만 검증합니다.</p></div></div>`;
}

function sellerMarketplaceTemplate() {
  const products = sellerCatalogProducts();
  const empty = `<div class="empty catalog-empty"><b>검색 결과가 없습니다.</b><span>국가·브랜드·카테고리 조건을 바꿔 다시 확인해 주세요.</span><button class="secondary-button" data-action="reset-market-filter">필터 초기화</button></div>`;
  const listing = marketViewMode === "list"
    ? `<div class="market-product-list">${products.length ? products.map(productRowSellerList).join("") : empty}</div>`
    : `<div class="product-card-grid shop-grid">${products.length ? products.map(productRowSeller).join("") : empty}</div>`;
  return `${marketplaceHeroTemplate()}<div id="marketProductGrid" class="panel seller-market-panel">${marketToolbar()}<div class="catalog-summary"><span>공급 상품 <b>${products.length}</b>개</span><small>국가·브랜드·카테고리 조건을 비교한 뒤 원본 상세페이지와 공급사 정보를 확인하세요.</small></div>${listing}</div>`;
}

function roleRefunds(role) {
  return role === "seller" ? state.refunds.filter(item => item.sellerLoginId === currentAccount.loginId) : role === "supplier" ? state.refunds.filter(item => item.supplierLoginId === currentAccount.loginId) : state.refunds;
}
function filteredRefunds(role, { ignoreType = false } = {}) {
  const query = refundSearch.trim().toLowerCase();
  return roleRefunds(role).filter(item => {
    const order = state.orders.find(order => order.id === item.orderId);
    const product = productOf(order?.productId);
    const monthMatch = refundMonth === "all" || String(order?.orderDate || "").startsWith(refundMonth);
    const typeMatch = ignoreType || refundTypeFilter === "all" || item.type === refundTypeFilter;
    const searchMatch = !query || [item.id, item.orderId, item.type, item.reason, product?.name, order?.customer, order?.recipientName, order?.phone].some(value => String(value || "").toLowerCase().includes(query));
    return monthMatch && typeMatch && searchMatch;
  });
}
function refundTypeCounts(role) {
  const scoped = filteredRefunds(role, { ignoreType: true });
  return {
    all: scoped.length,
    "주문 취소": scoped.filter(item => item.type === "주문 취소").length,
    "반품": scoped.filter(item => item.type === "반품").length,
    "교환": scoped.filter(item => item.type === "교환").length,
  };
}
function refundActionMarkup(role, item) {
  const completed = item.status === "환불완료";
  if (role === "supplier" && !completed) {
    if (["공급사 검토중", "협의 필요"].includes(item.status)) return `<div class="refund-row-actions"><button class="small-button" data-action="request-return-pickup" data-id="${item.id}">반품 회수 요청</button><button class="small-button approve" data-action="approve-no-pickup-refund" data-id="${item.id}">회수 없이 승인</button><button class="text-button" data-action="open-refund-consult" data-id="${item.id}">협의 요청</button><button class="text-button" data-action="refund-detail" data-id="${item.id}">상세</button></div>`;
    if (item.status === "반품 회수중") return `<div class="refund-row-actions"><button class="small-button" data-action="simulate-return-delivery" data-id="${item.id}">택배 도착 처리</button><button class="text-button" data-action="refund-detail" data-id="${item.id}">상세</button></div>`;
    if (item.status === "공급사 입고확인 대기") return `<div class="refund-row-actions"><button class="small-button approve" data-action="confirm-return-receipt" data-id="${item.id}">반품 입고 확인</button><button class="text-button" data-action="refund-detail" data-id="${item.id}">상세</button></div>`;
  }
  return `<div class="refund-row-actions">${role === "seller" && item.status === "협의 필요" ? `<button class="small-button" data-action="open-refund-chat" data-id="${item.id}">두고톡 협의</button>` : ""}<button class="text-button" data-action="refund-detail" data-id="${item.id}">상세보기</button></div>`;
}
function refundRows(role, items = filteredRefunds(role)) {
  if (!items.length) return `<tr><td colspan="8"><div class="empty">조건에 맞는 취소·환불 요청이 없습니다.</div></td></tr>`;
  return items.map(item => {
    const order = state.orders.find(order => order.id === item.orderId);
    const product = productOf(order?.mappedProductId || order?.productId);
    const returnInfo = item.noPickup ? "회수 없음" : item.returnTracking ? `${item.returnCarrier || "택배"} ${item.returnTracking}` : "회수 방법 결정 전";
    return `<tr><td class="order-id">${item.id}<br><small>${escapeHtml(order?.orderDate || item.requestedAt)}</small></td><td><div class="table-product">${productPhoto(product,"table-photo")}<span><button class="supplier-link" data-action="order-detail" data-id="${order?.id}">${order?.id || "-"}</button><strong>${escapeHtml(product?.name || "상품")}</strong><small>${order?.qty || 0}개 · ${escapeHtml(order?.channel || "-")}</small></span></div></td><td><strong>${escapeHtml(order?.recipientName || order?.customer || "-")}</strong><br><small>${escapeHtml(order?.phone || "-")}</small></td><td><strong>${escapeHtml(item.type)}</strong><br><small>${escapeHtml(item.reason)} · ${escapeHtml(returnInfo)}</small></td><td><strong>${money(item.amount)}</strong><br><small>소비자 ${money(item.consumerRefundAmount || item.amount)}</small></td><td><div class="settlement-state"><b>${item.depositCredited ? "두고머니 충전완료" : "두고머니 충전 대기"}</b><small>${item.supplierSettlementOffset ? "공급사 정산 0원" : "공급사 정산 보류"}</small></div></td><td>${statusChip(item.status)}</td><td>${refundActionMarkup(role, item)}</td></tr>`;
  }).join("");
}
function refundMobileCards(role, items = filteredRefunds(role)) {
  if (!items.length) return `<div id="refundMobileResults" class="mobile-refund-list" data-role="${role}"><div class="empty">조건에 맞는 취소·환불 요청이 없습니다.</div></div>`;
  return `<div id="refundMobileResults" class="mobile-refund-list" data-role="${role}">${items.map(item => {
    const order = state.orders.find(order => order.id === item.orderId);
    const product = productOf(order?.mappedProductId || order?.productId);
    return `<article class="mobile-refund-card"><header><div><b>${escapeHtml(item.id)}</b><small>${escapeHtml(order?.orderDate || item.requestedAt)}</small></div>${statusChip(item.status)}</header><button class="mobile-card-product" data-action="order-detail" data-id="${order?.id}">${productPhoto(product,"table-photo")}<span><small>${escapeHtml(order?.id || "-")} · ${escapeHtml(order?.channel || "-")}</small><strong>${escapeHtml(product?.name || "상품")}</strong><em>${order?.qty || 0}개 · 두고머니 ${money(item.amount)}</em></span></button><dl><div><dt>주문자</dt><dd>${escapeHtml(order?.recipientName || order?.customer || "-")}<small>${escapeHtml(order?.phone || "-")}</small></dd></div><div><dt>소비자 환불액</dt><dd>${money(item.consumerRefundAmount || item.amount)}</dd></div><div><dt>요청 내용</dt><dd>${escapeHtml(item.type)}<small>${escapeHtml(item.reason)}</small></dd></div><div><dt>반품 회수</dt><dd>${item.noPickup ? "회수 없음" : item.returnTracking ? `${escapeHtml(item.returnCarrier || "택배")}<small>${escapeHtml(item.returnTracking)}</small>` : "결정 대기"}</dd></div><div><dt>두고머니</dt><dd>${item.depositCredited ? `${money(item.amount)} 충전완료` : "입고 확인 후 충전"}</dd></div><div><dt>공급사 정산</dt><dd>${item.supplierSettlementOffset ? "0원 · 제외완료" : "정산 보류"}</dd></div></dl><footer>${refundActionMarkup(role, item)}</footer></article>`;
  }).join("")}</div>`;
}
function refundTemplate(role) {
  const allItems = roleRefunds(role);
  const typeCounts = refundTypeCounts(role);
  const items = filteredRefunds(role);
  const completed = allItems.filter(item => item.status === "환불완료");
  const offset = completed.filter(item => item.supplierSettlementOffset).reduce((sum, item) => sum + item.amount, 0);
  const deposit = role === "seller" ? sellerDeposit() : null;
  const awaitingReceipt = allItems.filter(item => item.status === "공급사 입고확인 대기").length;
  const summary = role === "seller" ? `<div class="refund-summary-grid"><div class="refund-summary-card primary"><span>사용 가능 두고머니</span><strong>${money(deposit.balance)}</strong><small>상품 결제 또는 계좌 출금 가능</small></div><div class="refund-summary-card"><span>환불 처리중</span><strong>${money(deposit.pending)}</strong><small>입고 확인 전에는 충전 보류</small></div><div class="refund-summary-card"><span>출금 처리중</span><strong>${money(deposit.withdrawalPending)}</strong><small>은행 이체 결과 대기</small></div><div class="refund-summary-card"><span>누적 환불 충전</span><strong>${money(deposit.totalRefunded)}</strong><small>${deposit.transactions.filter(item => item.type === "환불 충전").length}건 환불</small></div></div>` : role === "supplier" ? `<div class="refund-summary-grid"><div class="refund-summary-card primary dark"><span>환불 완료 주문 지급액</span><strong>0원</strong><small>입고 확인 즉시 정산 대상 제외</small></div><div class="refund-summary-card"><span>이번 달 정산 제외</span><strong>-${money(offset)}</strong><small>${completed.length}건 환불 확정</small></div><div class="refund-summary-card"><span>입고 확인 대기</span><strong>${awaitingReceipt}건</strong><small>실물 확인 후 완료 처리</small></div><div class="refund-summary-card"><span>전체 처리 대기</span><strong>${allItems.filter(item => item.status !== "환불완료").length}건</strong><small>농수산물은 회수 없이 승인 가능</small></div></div>` : `<div class="refund-summary-grid"><div class="refund-summary-card primary dark"><span>두고머니 지급 완료</span><strong>${money(completed.reduce((sum,item)=>sum+item.amount,0))}</strong><small>${completed.length}건</small></div><div class="refund-summary-card"><span>공급사 정산 제외</span><strong>${money(offset)}</strong><small>정산지급대행 자동 조정</small></div><div class="refund-summary-card"><span>입고 확인 대기</span><strong>${awaitingReceipt}건</strong><small>공급사 확정 필요</small></div><div class="refund-summary-card"><span>전체 처리중</span><strong>${allItems.filter(item=>item.status!=="환불완료").length}건</strong><small>통합 모니터링</small></div></div>`;
  const policyMessage = role === "seller" ? "판매채널에서 소비자 환불을 먼저 완료한 뒤 요청하세요. 반품 상품이 공급사에 입고되면 공급대금이 두고머니로 자동 충전됩니다." : role === "supplier" ? "반품 실물을 받은 뒤 ‘반품 입고 확인’을 눌러야 셀러 두고머니 충전과 내 정산 제외가 동시에 확정됩니다." : "입고 확인 또는 회수 없음 승인을 기준으로 두고머니 충전과 공급사 정산 제외가 한 번에 처리됩니다.";
  return `${sectionHero("취소 · 환불 관리", "소비자 환불, 반품 회수, 공급사 입고 확인, 두고머니 충전까지 하나의 상태로 연결합니다.", role === "seller" ? `<button class="primary-button" data-action="open-doogo-money">두고머니 관리</button>` : "")}${summary}
    <div class="refund-policy-callout panel"><span>안전한 환불 기준</span><b>${policyMessage}</b><small>위탁셀러는 환불을 요청하고, 환불 확정 권한은 공급사의 입고 확인 또는 회수 없음 승인에만 부여됩니다.</small></div>
    <div class="refund-flow refund-flow-five panel"><div class="refund-step done"><b>1</b><span>소비자 환불<small>판매채널에서 처리</small></span></div><i></i><div class="refund-step done"><b>2</b><span>셀러 요청<small>증빙·사유 접수</small></span></div><i></i><div class="refund-step active"><b>3</b><span>공급사 판단<small>회수·미회수·협의</small></span></div><i></i><div class="refund-step"><b>4</b><span>입고 확인<small>택배 도착·실물 확인</small></span></div><i></i><div class="refund-step"><b>5</b><span>자동 정산<small>두고머니 충전·지급 0원</small></span></div></div>
    <div class="refund-type-tabs panel" role="tablist" aria-label="취소·반품·교환 구분">
      <button type="button" class="${refundTypeFilter === "all" ? "active" : ""}" data-action="refund-type-filter" data-type="all"><span>전체</span><b>${typeCounts.all}</b></button>
      <button type="button" class="${refundTypeFilter === "주문 취소" ? "active" : ""}" data-action="refund-type-filter" data-type="주문 취소"><span>취소</span><b>${typeCounts["주문 취소"]}</b></button>
      <button type="button" class="${refundTypeFilter === "반품" ? "active" : ""}" data-action="refund-type-filter" data-type="반품"><span>반품</span><b>${typeCounts["반품"]}</b></button>
      <button type="button" class="${refundTypeFilter === "교환" ? "active" : ""}" data-action="refund-type-filter" data-type="교환"><span>교환</span><b>${typeCounts["교환"]}</b></button>
    </div>
    <div class="refund-filter-panel panel"><label><span>월별 조회</span><select id="refundMonthSelect"><option value="all" ${refundMonth === "all" ? "selected" : ""}>전체 기간</option><option value="2026-09" ${refundMonth === "2026-09" ? "selected" : ""}>2026년 9월</option><option value="2026-08" ${refundMonth === "2026-08" ? "selected" : ""}>2026년 8월</option></select></label><label class="refund-search"><span>빠른 검색</span><input id="refundSearch" value="${escapeHtml(refundSearch)}" placeholder="주문번호·상품·주문자명·연락처"></label><button class="secondary-button" data-action="clear-refund-filter">검색 초기화</button><em id="refundResultCount">${items.length}건</em></div>
    <div class="panel"><div class="panel-head"><div><h3>${role === "master" ? "전체 환불 요청" : "환불 요청 목록"}</h3><p>소비자 환불액과 공급대금 두고머니를 분리해 처리 상태를 관리합니다.</p></div><span class="chip orange">${allItems.filter(item => item.status !== "환불완료").length}건 처리중</span></div><div class="table-wrap refund-desktop-table"><table><thead><tr><th>요청번호</th><th>주문/상품</th><th>주문자</th><th>유형·사유</th><th>두고머니</th><th>두고머니/정산</th><th>상태</th><th>처리</th></tr></thead><tbody id="refundResults" data-role="${role}">${refundRows(role, items)}</tbody></table></div>${refundMobileCards(role, items)}</div>`;
}

const sellerOrderStages = [
  ["overview", "주문 등록 현황"], ["all", "전체 주문 리스트"], ["mapping", "매핑 필요"], ["payment", "결제 대기"], ["received", "주문접수"], ["ordered", "발주완료"], ["preparing", "배송준비중"], ["shipping", "배송중"], ["delivered", "배송완료"]
];
function sellerOrderSubset(stage = sellerOrderStage) {
  const orders = currentSellerOrders();
  if (["all", "overview"].includes(stage)) return orders;
  if (stage === "mapping") return orders.filter(order => orderMappingStatus(order) !== "mapped");
  if (stage === "payment") return orders.filter(order => orderMappingStatus(order) === "mapped" && orderPaymentStatus(order) === "pending");
  if (stage === "ordered") return orders.filter(order => order.status === "발주완료");
  const statuses = { waiting: ["주문대기"], received: ["신규주문", "주문접수"], preparing: ["배송준비중"], shipping: ["배송중"], delivered: ["배송완료"] }[stage] || [];
  return orders.filter(order => statuses.includes(order.status));
}
function sellerOrderStageCount(stage) { return sellerOrderSubset(stage).length; }
function sellerOrderManagementTemplate() {
  const orders = currentSellerOrders();
  const filteredOrders = sellerOrderSubset();
  const activeLabel = sellerOrderStages.find(item => item[0] === sellerOrderStage)?.[1] || "전체 주문 리스트";
  const overview = `<div class="order-stage-overview"><button class="needs-action" data-action="filter-order-stage" data-stage="mapping"><span>매핑 필요</span><strong>${sellerOrderStageCount("mapping")}</strong><small>공급사 상품 선택</small></button><button class="needs-payment" data-action="filter-order-stage" data-stage="payment"><span>결제 대기</span><strong>${sellerOrderStageCount("payment")}</strong><small>결제 후 공급사 전달</small></button><button data-action="filter-order-stage" data-stage="preparing"><span>배송준비중</span><strong>${sellerOrderStageCount("preparing")}</strong><small>송장 발급 대기</small></button><button data-action="filter-order-stage" data-stage="shipping"><span>배송중</span><strong>${sellerOrderStageCount("shipping")}</strong><small>송장 전송 완료</small></button></div>`;
  return `${sectionHero("주문 관리", "외부 주문을 상품코드로 매핑하고 공급가 결제 후 공급사에 전달합니다.", `<button class="primary-button" data-action="single-order">+ 외부 주문 불러오기</button>`)}
    <div class="order-workspace"><details class="order-stage-menu panel" open><summary><span>${menuIcon("order")}</span><b>주문 관리</b><small>단계별 메뉴 열기</small><i>⌄</i></summary><nav>${sellerOrderStages.map(([key,label]) => `<button class="${sellerOrderStage === key ? "active" : ""}" type="button" data-action="filter-order-stage" data-stage="${key}"><span>${label}</span><b>${sellerOrderStageCount(key)}</b></button>`).join("")}</nav></details><section class="order-stage-content">
      <div class="order-search-panel panel"><label><span>⌕</span><input id="sellerOrderSearch" value="${escapeHtml(sellerOrderSearch)}" placeholder="주문번호, 고객명, 외부 상품명, 상품코드 검색"></label><div><span>전체 ${orders.length}건</span><span>매핑 ${sellerMappingRequiredOrders().length}건</span><span>결제 ${sellerPaymentRequiredOrders().length}건</span></div></div>
      ${sellerOrderStage === "overview" ? overview : ""}
      <div class="panel"><div class="panel-head"><div><h3>${activeLabel}</h3><p>행을 열어 주소·배송메시지·개인통관부호·송장 상태까지 확인할 수 있습니다.</p></div><button class="secondary-button" data-action="clear-order-search">검색 초기화</button></div><div id="sellerOrderResults">${ordersTable("seller", sellerOrderSearch, filteredOrders)}</div></div>
    </section></div>`;
}

function salesProductBreakdown(entry) {
  const products = currentSellerProducts().map(item => productOf(item.productId)).filter(Boolean);
  const catalog = products.length > 1 ? products : [productOf("DF-1024"), productOf("DF-3142"), productOf("DF-3201")].filter(Boolean);
  const lineCount = Math.min(entry.orders > 4 ? 3 : 2, catalog.length);
  let remainingSales = entry.sales;
  let remainingCost = entry.cost;
  let remainingQty = entry.orders;
  return catalog.slice(0, lineCount).map((product, index) => {
    const last = index === lineCount - 1;
    const ratio = index === 0 ? .58 : lineCount === 3 && index === 1 ? .27 : 1;
    const sales = last ? remainingSales : Math.round(entry.sales * ratio / 100) * 100;
    const cost = last ? remainingCost : Math.round(entry.cost * ratio / 100) * 100;
    const qty = last ? Math.max(1, remainingQty) : Math.max(1, Math.round(entry.orders * ratio));
    remainingSales -= sales; remainingCost -= cost; remainingQty -= qty;
    return { product, sales, cost, qty };
  });
}

function salesCalendarTemplate() {
  const entries = state.salesLedger || [];
  const channels = [...(state.channelConnections.seller || []), channelMeta("sample")];
  const totalSales = entries.reduce((sum, item) => sum + item.sales, 0);
  const totalCost = entries.reduce((sum, item) => sum + item.cost, 0);
  const totalProfit = totalSales - totalCost;
  const totalOrders = entries.reduce((sum, item) => sum + item.orders, 0);
  const openingBalance = 420000;
  const expectedBalance = openingBalance + totalProfit;
  const cells = [];
  [30,31].forEach(day => cells.push(`<div class="cashflow-day muted"><div class="cashflow-day-head"><span>${day}</span><em>8월</em></div><div class="cashflow-empty">이월</div></div>`));
  for (let day = 1; day <= 30; day += 1) {
    const date = `2026-09-${String(day).padStart(2,"0")}`;
    const daily = entries.filter(item => item.date === date);
    const sales = daily.reduce((sum, item) => sum + item.sales, 0);
    const profit = daily.reduce((sum, item) => sum + item.sales - item.cost, 0);
    const orders = daily.reduce((sum,item)=>sum+item.orders,0);
    const dailyChannels = [...new Set(daily.map(item => item.channel))];
    const channelMarkers = dailyChannels.length ? `<em class="day-channel-stack">${dailyChannels.slice(0,2).map(channelId => `<i style="--dot:${channelMeta(channelId).color}">${escapeHtml(channelMeta(channelId).mark)}</i>`).join("")}${dailyChannels.length > 2 ? `<b>+${dailyChannels.length - 2}</b>` : ""}</em>` : "";
    cells.push(`<button class="cashflow-day ${day === 8 ? "today" : ""} ${sales ? "has-sales" : ""}" data-action="calendar-day" data-date="${date}"><div class="cashflow-day-head"><span>${day}</span>${channelMarkers}</div>${sales ? `<div class="cashflow-amount"><b>${money(salesMetric === "sales" ? sales : profit)}</b><small>주문 ${orders}건</small></div>` : `<div class="cashflow-empty">판매 없음</div>`}</button>`);
  }
  [1,2,3].forEach(day => cells.push(`<div class="cashflow-day muted"><div class="cashflow-day-head"><span>${day}</span><em>10월</em></div><div class="cashflow-empty">다음 달</div></div>`));
  return `<div class="cashflow-titlebar"><div><span>SALES CASHFLOW</span><h2>판매 현금 흐름 캘린더</h2><p>판매채널 매출과 공급가를 반영한 순수익·잔액 흐름을 날짜별로 확인합니다.</p></div><div class="metric-toggle"><button class="${salesMetric === "sales" ? "active" : ""}" data-action="sales-metric" data-metric="sales">매출 보기</button><button class="${salesMetric === "profit" ? "active" : ""}" data-action="sales-metric" data-metric="profit">순수익 보기</button></div></div>
    <div class="sales-kpi-grid cashflow-kpis"><div class="sales-kpi primary"><span>9월 총 매출</span><strong>${money(totalSales)}</strong><small>판매 채널 합계</small></div><div class="sales-kpi"><span>예상 순수익</span><strong>${money(totalProfit)}</strong><small>공급가 차감 기준</small></div><div class="sales-kpi"><span>총 주문</span><strong>${totalOrders}건</strong><small>샘플주문 포함</small></div><div class="sales-kpi"><span>평균 수익률</span><strong>${Math.round(totalProfit / totalSales * 100)}%</strong><small>이번 달 누적</small></div></div>
    <div class="cashflow-workspace"><section class="panel cashflow-calendar-panel"><div class="cashflow-calendar-toolbar"><div class="calendar-navigation"><button class="icon-button" data-action="calendar-month" aria-label="이전 달">‹</button><strong>2026년 9월</strong><button class="icon-button" data-action="calendar-month" aria-label="다음 달">›</button><button class="secondary-button" data-action="calendar-today">오늘</button></div><span>채널 문자가 여러 개면 같은 날 복수 채널에서 판매된 것입니다. 날짜를 눌러 상품 순위를 확인하세요.</span></div><div class="cashflow-scroll"><div class="cashflow-calendar"><div class="cashflow-week"><b>SUN</b><b>MON</b><b>TUE</b><b>WED</b><b>THU</b><b>FRI</b><b>SAT</b></div><div class="cashflow-grid">${cells.join("")}</div></div></div></section>
    <aside class="cashflow-side"><section class="panel balance-summary"><div class="balance-summary-head"><span>MONTHLY BALANCE</span><h3>9월 현금 흐름</h3><p>매출과 매입을 기준으로 계산한 예상 잔액입니다.</p></div><div class="opening-balance"><span>전월 이월 잔액</span><strong>${money(openingBalance)}</strong></div><dl><div><dt>입금</dt><dd>+${money(totalSales)}</dd></div><div class="sub"><dt>쇼핑몰 매출</dt><dd>${money(totalSales)}</dd></div><div><dt>총 매입비</dt><dd>-${money(totalCost)}</dd></div><div class="sub"><dt>공급 상품 원가</dt><dd>-${money(totalCost)}</dd></div></dl><div class="expected-balance"><span>예상 잔액</span><strong>${money(expectedBalance)}</strong><small>이번 달 순수익 +${money(totalProfit)}</small></div></section><section class="panel compact-channel-breakdown"><div class="panel-head"><div><h3>판매처별 매출</h3><p>9월 누적 기준</p></div></div>${channels.map(channel => { const data = entries.filter(item => item.channel === channel.id); const sales = data.reduce((sum,item)=>sum+item.sales,0); const share = totalSales ? Math.round(sales/totalSales*100) : 0; return `<div class="channel-sales-row">${channelMark(channel.id)}<div><b>${escapeHtml(channel.name)}</b><i><em style="width:${share}%;--channel-color:${channel.color}"></em></i></div><strong>${money(sales)}<small>${share}%</small></strong></div>`; }).join("")}</section></aside></div>`;
}

function channelIntegrationTemplate() {
  const channels = sellerChannels();
  const notice = notificationService();
  const events = visibleNotifications().slice(0,4);
  const automationCount = channels.filter(channel => channel.status === "connected" && channel.trackingAutomation).length;
  const pendingTotal = currentSellerOrders().filter(order => Object.values(order.channelTrackingStatuses || {}).includes("10분 자동전송 대기")).length;
  return `${sectionHero("쇼핑몰 연동 · 드랍쉬핑 자동화", "공급사가 발급한 송장을 내 주문에 자동으로 받고, 켜 둔 판매채널에 10분 단위로 전송합니다.", `<button class="secondary-button" data-action="run-tracking-sync">지금 송장 동기화</button>`)}
    <section class="tracking-automation-hero"><div><span>AUTOMATED DROPSHIPPING</span><h3>송장 자동전송 ${automationCount}개 채널 사용중</h3><p>대기 ${pendingTotal}건 · 각 쇼핑몰별로 자동화를 켜고 끌 수 있습니다.</p></div><div class="automation-flow"><span><b>1</b>공급사 송장출력</span><i>→</i><span><b>2</b>셀러 주문 자동입력</span><i>→</i><span><b>3</b>10분마다 채널 전송</span></div></section>
    <div class="api-safe-notice"><b>데모 안전 모드</b><span>현재 화면은 자동화 상태와 전송 대기열만 브라우저에 저장하며 실제 쇼핑몰 API에는 전송하지 않습니다.</span></div>
    <div class="channel-connect-grid">${channels.map(channel => { const pending = currentSellerOrders().filter(order => order.channelTrackingStatuses?.[channel.id] === "10분 자동전송 대기").length; const automationEnabled = channel.status === "connected" && channel.trackingAutomation; return `<article class="panel channel-connect-card ${automationEnabled ? "automation-on" : ""}"><div class="channel-card-head">${channelMark(channel.id)}<div><h3>${escapeHtml(channel.name)}</h3><p>${escapeHtml(channel.storeName)}</p></div>${statusChip(channel.status === "connected" ? "연동중" : channel.status === "pending" ? "확인중" : "미연동")}</div><div class="automation-setting"><span><b>송장 자동전송</b><small>${channel.status === "connected" ? "10분 간격 · 공급사 송장 자동 반영" : "채널 연동 후 사용할 수 있습니다."}</small></span><button type="button" class="automation-switch ${automationEnabled ? "on" : ""}" data-action="toggle-channel-automation" data-id="${channel.id}" ${channel.status === "connected" ? "" : "disabled"} aria-pressed="${automationEnabled}"><i></i>${automationEnabled ? "켜짐" : "꺼짐"}</button></div><dl><div><dt>주문 수집</dt><dd>${channel.status === "connected" ? "자동" : "대기"}</dd></div><div><dt>송장 대기열</dt><dd>${pending}건</dd></div><div><dt>최근 송장 전송</dt><dd>${escapeHtml(channel.lastTrackingPush || "-")}</dd></div></dl><button class="${channel.status === "connected" ? "secondary-button" : "primary-button"}" data-action="connect-channel" data-id="${channel.id}">${channel.status === "connected" ? "연동 설정" : "연동 시작"}</button></article>`; }).join("")}</div>
    <form id="dropshippingEmailForm" class="panel dropshipping-email-card"><div class="dropshipping-email-head"><div><span>EMAIL AUTOMATION</span><h3>드랍쉬핑 이메일 알림</h3><p>API 자동화에서 놓치기 쉬운 주문·송장·환불·가격 변동을 원하는 이메일로 받아보세요.</p></div><label class="email-master-switch"><input type="checkbox" name="emailEnabled" ${notice.emailEnabled ? "checked" : ""}><i></i><span>${notice.emailEnabled ? "ON" : "OFF"}</span></label></div><div class="email-recipient-row"><label><span>수신 이메일</span><input name="emailAddress" type="email" value="${escapeHtml(notice.emailAddress || currentAccount.email || "")}" placeholder="ops@example.com" required></label><small>주문 운영 담당자 메일을 입력해 주세요.</small></div><fieldset><legend>수신할 알림 선택</legend><label><input type="checkbox" name="events" value="orderNotice" ${notice.orderNotice ? "checked" : ""}><span><b>신규 주문</b><small>채널 주문 수집·공급사 자동배정</small></span></label><label><input type="checkbox" name="events" value="trackingNotice" ${notice.trackingNotice ? "checked" : ""}><span><b>송장 등록</b><small>공급사 송장 발급·채널 전송</small></span></label><label><input type="checkbox" name="events" value="refundNotice" ${notice.refundNotice ? "checked" : ""}><span><b>취소·환불</b><small>반품 완료·예치금 환불</small></span></label><label><input type="checkbox" name="events" value="priceNotice" ${notice.priceNotice ? "checked" : ""}><span><b>가격 변경</b><small>공급가 변동·마진 위험</small></span></label><label><input type="checkbox" name="events" value="deliveryDelayNotice" ${notice.deliveryDelayNotice ? "checked" : ""}><span><b>배송 지연</b><small>송장 미등록·집하 지연</small></span></label><label><input type="checkbox" name="events" value="stockNotice" ${notice.stockNotice ? "checked" : ""}><span><b>재고 부족</b><small>품절 임박·판매중지 권고</small></span></label></fieldset><div class="email-form-actions"><span>설정은 쇼핑몰 API 자동화와 함께 적용됩니다.</span><button class="primary-button" type="submit">이메일 알림 저장</button></div></form>
    <div class="notification-service-layout"><section class="panel notification-service-card"><div class="notification-service-head"><span class="talk-symbol">TALK</span><div><span>PAID ADD-ON</span><h3>실시간 카카오 알림톡</h3><p>신규 주문은 공급사에게, 송장 등록은 위탁셀러에게 알림톡·이메일로 안내합니다.</p></div><span class="chip blue">${notice.status === "active" ? "이용중" : "미가입"}</span></div><div class="notification-price"><b>${money(notice.monthlyFee)}</b><span>/ 월 · ${notice.monthlyLimit}건 포함</span><em>${notice.used}건 사용</em></div><div class="notification-options"><button class="${notice.orderNotice ? "on" : ""}" data-action="toggle-notice-setting" data-setting="orderNotice"><i></i><span><b>신규 주문 알림</b><small>공급사 카카오톡·이메일</small></span></button><button class="${notice.trackingNotice ? "on" : ""}" data-action="toggle-notice-setting" data-setting="trackingNotice"><i></i><span><b>송장 등록 알림</b><small>위탁셀러 카카오톡·이메일</small></span></button></div><button class="primary-button" data-action="manage-alert-plan">유료 알림 서비스 관리</button></section><section class="panel notification-history"><div class="panel-head"><div><h3>최근 알림 미리보기</h3><p>실제 발송 전 메시지와 수신 대상을 확인합니다.</p></div><button class="text-button" data-action="open-notifications">전체보기</button></div>${events.length ? events.map(item => `<div class="notification-event"><span class="notification-type ${item.type}">${notificationTypeLabel(item.type)}</span><div><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.detail)} · ${item.channels.join("+")}</small></div><em>${item.createdAt}</em></div>`).join("") : `<div class="empty">최근 알림이 없습니다.</div>`}</section></div>`;
}

function subscriptionTemplate() {
  const subscription = state.subscriptions[currentAccount.loginId] || state.subscriptions.seller;
  const notice = notificationService();
  const total = subscription.monthlyFee + (notice.status === "active" ? notice.monthlyFee : 0);
  return `${sectionHero("정기구독", "두고셀러 기본 이용권과 실시간 알림톡 유료 부가서비스를 함께 관리합니다.")}<div class="subscription-layout"><div class="panel subscription-plan-card"><span class="plan-kicker">CURRENT PLAN</span><h2>${escapeHtml(subscription.plan)}</h2><div class="plan-price"><strong>${money(subscription.monthlyFee).replace("원","")}</strong><span>원 / 월</span></div><ul><li>공급상품 무제한 열람</li><li>상품 썸네일·상세페이지 복사</li><li>주문·송장·환불 통합관리</li><li>4개 판매채널 연동 설정</li></ul><button class="primary-button" data-action="billing-settings">결제수단 관리</button><small>실제 결제는 연결하지 않은 데모입니다.</small></div><div class="subscription-info"><div class="panel"><div class="panel-head"><div><h3>이용중인 서비스</h3><p>다음 결제 예정일과 월 청구액을 확인합니다.</p></div><span class="chip blue">월 ${money(total)}</span></div><dl class="subscription-dl"><div><dt>두고셀러 베이직</dt><dd>${money(subscription.monthlyFee)}</dd></div><div><dt>${escapeHtml(notice.plan)}</dt><dd>${money(notice.monthlyFee)}</dd></div><div><dt>다음 결제 예정</dt><dd>${escapeHtml(subscription.nextBilling)}</dd></div><div><dt>자동 갱신</dt><dd><button class="subscription-toggle ${subscription.autoRenew ? "on" : ""}" data-action="toggle-subscription"><i></i>${subscription.autoRenew ? "켜짐" : "꺼짐"}</button></dd></div></dl><button class="alert-plan-link" data-action="manage-alert-plan"><span class="talk-symbol small">TALK</span><span><b>실시간 알림톡 부가서비스</b><small>월 2,900원 · 500건 포함 · 현재 ${notice.used}건 사용</small></span><strong>설정 →</strong></button></div><div class="panel billing-history"><div class="panel-head"><div><h3>결제 내역</h3><p>샘플 청구 기록</p></div></div><div><span>2026.09.08</span><b>기본 구독 + 알림톡</b><strong>${money(total)} <em>결제완료</em></strong></div><div><span>2026.08.08</span><b>두고셀러 베이직</b><strong>5,900원 <em>결제완료</em></strong></div></div></div></div>`;
}

function sellerApprovedProductsTemplate() {
  const channels = sellerChannels();
  const items = currentSellerProducts().filter(item => item.approvalStatus !== "승인대기");
  return `${sectionHero("상품승인", "공급사 승인이 끝난 상품을 내 상품으로 관리합니다. 가격·상품명·상세페이지를 자유롭게 수정하고, 판매 채널을 선택해 상품을 전송하세요.")}<div class="panel">
    <div class="panel-head"><div><h3>승인완료 상품</h3><p>상품 전송을 완료하면 ‘상품 판매중’으로 이동합니다.</p></div><span class="chip">${items.length}개</span></div>
    ${items.length ? `<div class="seller-product-tree">${items.map(item => {
      const product = productOf(item.productId);
      const marginPct = margin(product?.supply || 0, item.salePrice);
      const liveChannels = channels.filter(channel => sellerProductChannelStatus(item, channel) === "판매중");
      const liveCount = liveChannels.length;
      return `<article class="seller-product-node pick-approval-node">
        <div class="seller-product-parent pick-approval-row">
          ${productPhoto({ ...product, imageIndex: item.imageIndex }, "table-photo")}
          <span class="seller-product-main"><small>원본코드 ${escapeHtml(item.productId)} · ${escapeHtml(item.id)}</small><strong>${escapeHtml(sellerProductTitle(item, product))}</strong><em>공급가 ${money(product?.supply || 0)} · 지정판매가 ${money(product?.recommended || 0)}</em></span>
          <span class="seller-product-price"><small>내가 판매하고 싶은 가격</small><b>${money(item.salePrice)}</b><em>마진 ${marginPct}%</em></span>
          <span class="seller-product-live">${liveCount ? `<b class="deployed-badge">${liveCount === channels.length ? "판매중" : "부분판매중"}</b><span class="live-channel-icons">${liveChannels.map(channel => channelMark(channel.id, true)).join("")}</span>` : `<b>승인완료 · 미게시</b><small>판매 채널을 선택해 전송하세요</small>`}</span>
          <div class="pick-approval-actions"><button class="master-edit-button" data-action="edit-seller-product" data-id="${item.id}">마스터상품 수정</button><button class="secondary-button" data-action="product-detail" data-id="${product?.id}">상품 상세</button><button class="primary-button" data-action="manage-product-channels" data-id="${item.id}">상품 전송</button></div>
        </div>
      </article>`;
    }).join("")}</div>` : `<div class="empty">승인완료된 상품이 없습니다. PICK 상품에서 공급사 승인이 완료되면 여기에 표시됩니다.</div>`}
  </div>`;
}
function sellerOnSaleProductsTemplate() {
  const channels = sellerChannels();
  const liveItems = currentSellerProducts().filter(item => item.approvalStatus !== "승인대기" && channels.some(channel => sellerProductChannelStatus(item, channel) === "판매중"));
  const query = onSaleSearch.trim().toLowerCase();
  const normalizeDate = value => String(value || "").replace(/\./g, "-");
  const filtered = liveItems.filter(item => {
    const product = productOf(item.productId);
    const matchesQuery = !query || [sellerProductTitle(item, product), item.productId, item.id].some(value => String(value || "").toLowerCase().includes(query));
    const itemDate = normalizeDate(item.copiedAt);
    const matchesFrom = !onSaleDateFrom || (itemDate && itemDate >= onSaleDateFrom);
    const matchesTo = !onSaleDateTo || (itemDate && itemDate <= onSaleDateTo);
    return matchesQuery && matchesFrom && matchesTo;
  });
  return `${sectionHero("상품 판매중", "실제로 채널에 배포되어 판매중인 상품과 마진을 확인합니다.")}<div class="panel">
    <div class="panel-head"><div><h3>판매중 상품 목록</h3><p>검색 또는 등록일 범위로 상품을 좁혀볼 수 있습니다.</p></div><span class="chip">${filtered.length}개</span></div>
    <div class="onsale-filter-bar">
      <label class="catalog-search"><span>⌕</span><input id="onSaleSearchInput" value="${escapeHtml(onSaleSearch)}" placeholder="상품명·코드 검색"></label>
      <label class="onsale-date-field"><span>등록일</span><input type="date" id="onSaleDateFromInput" value="${escapeHtml(onSaleDateFrom)}"></label>
      <span class="onsale-date-sep">~</span>
      <label class="onsale-date-field"><span>&nbsp;</span><input type="date" id="onSaleDateToInput" value="${escapeHtml(onSaleDateTo)}"></label>
      <button type="button" class="secondary-button" data-action="reset-onsale-filter">초기화</button>
    </div>
    ${filtered.length ? `<div class="seller-product-tree">${filtered.map(item => {
      const product = productOf(item.productId);
      const expanded = expandedSellerProductId === item.id;
      const liveChannels = channels.filter(channel => sellerProductChannelStatus(item, channel) === "판매중");
      const liveMargins = liveChannels.map(channel => margin(product?.supply || 0, sellerChannelDetail(item, channel, product).salePrice || item.salePrice));
      const avgMarginPct = liveMargins.length ? Math.round(liveMargins.reduce((sum, value) => sum + value, 0) / liveMargins.length) : margin(product?.supply || 0, item.salePrice);
      const fullyLive = liveChannels.length === channels.length;
      return `<article class="seller-product-node ${expanded ? "expanded" : ""}">
        <button class="seller-product-parent" type="button" data-action="toggle-product-channels" data-id="${item.id}" aria-expanded="${expanded}">
          <span class="tree-chevron">${expanded ? "⌄" : "›"}</span>${productPhoto({ ...product, imageIndex: item.imageIndex }, "table-photo")}
          <span class="seller-product-main"><small>원본코드 ${escapeHtml(item.productId)} · ${escapeHtml(item.id)}</small><strong>${escapeHtml(sellerProductTitle(item, product))}</strong><em>등록일 ${escapeHtml(item.copiedAt || "-")}</em></span>
          <span class="seller-product-price onsale-avg-margin"><small>내 판매가</small><b>${money(item.salePrice)}</b><em>평균 마진 ${avgMarginPct}%</em></span>
          <span class="seller-product-live"><b class="deployed-badge">${fullyLive ? "판매중" : "부분판매중"}</b><span class="live-channel-icons">${liveChannels.map(channel => channelMark(channel.id, true)).join("")}</span></span>
        </button>
        ${expanded ? `<div class="seller-channel-branches">
          <div class="branch-guide"><span></span><b>채널별 판매 현황</b><small>채널마다 실제 판매 상태·소비자가와 동기화 여부를 표시합니다.</small></div>
          ${channels.map(channel => channelBranchRow(item, channel, product)).join("")}
          <div class="seller-product-actions"><button class="secondary-button" data-action="edit-seller-product" data-id="${item.id}">상품 수정</button><button class="secondary-button" data-action="product-detail" data-id="${product?.id}">상품 상세</button><button class="secondary-button" data-action="manage-product-channels" data-id="${item.id}">쇼핑몰 자동등록</button><button class="secondary-button" data-action="simulate-order" data-id="${item.id}">단건 주문접수</button></div>
        </div>` : ""}
      </article>`;
    }).join("")}</div>` : `<div class="empty">${liveItems.length ? "조건에 맞는 판매중 상품이 없습니다." : "아직 판매중인 상품이 없습니다. PICK 상품에서 판매를 시작해 주세요."}</div>`}
  </div>`;
}
function currentProductMappings() { const id = currentAccount?.loginId || "seller"; return (state.productMappings || []).filter(mapping => mapping.sellerLoginId === id); }
function unmappedExternalProducts() {
  const mappedCodes = new Set(currentProductMappings().filter(mapping => mapping.status === "매핑완료").map(mapping => mapping.externalProductCode));
  const seen = new Set();
  return currentSellerOrders().filter(order => {
    const code = order.externalProductCode;
    if (!code || mappedCodes.has(code) || seen.has(code) || orderMappingStatus(order) === "mapped") return false;
    seen.add(code);
    return true;
  });
}
function sellerProductMappingTemplate() {
  const pending = unmappedExternalProducts();
  const mapped = currentProductMappings().filter(mapping => mapping.status === "매핑완료");
  return `${sectionHero("상품매핑", "외부 판매채널 상품코드를 공급사 원본 상품에 연결합니다. 한 번 매핑하면 같은 상품코드의 신규 주문이 자동으로 연결되며, 연결을 바꾸려면 먼저 매핑을 해지해야 합니다.", `<button type="button" class="primary-button" data-action="open-product-mapping-form">+ 매핑 설정</button>`)}
    <div class="panel">
      <div class="panel-head"><div><h3>매핑 필요</h3><p>신규 주문에서 수집되었지만 아직 공급사 상품과 연결되지 않았습니다.</p></div><span class="chip red">${pending.length}건</span></div>
      <div class="mapping-list">${pending.length ? pending.map(order => `<article class="mapping-row"><span class="mapping-status unmapped">매핑 필요</span><div class="mapping-main"><b>${escapeHtml(order.externalProductName || "외부 상품")}</b><small>${escapeHtml(order.channel)} · 외부코드 ${escapeHtml(order.externalProductCode || "-")}</small></div><button type="button" class="small-button approve" data-action="open-product-mapping-form" data-code="${escapeHtml(order.externalProductCode || "")}" data-name="${escapeHtml(order.externalProductName || "")}" data-channel="${escapeHtml(order.channel || "")}">매핑 설정</button></article>`).join("") : `<div class="empty">매핑이 필요한 신규 주문이 없습니다.</div>`}</div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h3>매핑완료</h3><p>매핑을 해지하기 전까지 같은 상품코드의 주문은 자동으로 연결됩니다.</p></div><span class="chip">${mapped.length}건</span></div>
      <div class="mapping-list">${mapped.length ? mapped.map(mapping => { const product = productOf(mapping.productId); return `<article class="mapping-row mapped"><span class="mapping-status mapped">매핑완료</span><div class="mapping-main"><b>${escapeHtml(mapping.externalProductName || "외부 상품")}</b><small>${escapeHtml(mapping.channel || "-")} · 외부코드 ${escapeHtml(mapping.externalProductCode)}</small></div><span class="mapping-arrow">→</span><div class="mapping-target"><b>${escapeHtml(product?.name || "공급사 상품")}</b><small>${escapeHtml(mapping.supplier || product?.supplier || "-")} · ${escapeHtml(mapping.productId)}</small></div><button type="button" class="small-button reject" data-action="unmap-product-mapping" data-id="${mapping.id}">매핑 해지</button></article>`; }).join("") : `<div class="empty">매핑된 상품이 없습니다.</div>`}</div>
    </div>`;
}
function renderSellerSection(index) {
  if (index === 1) return sellerMarketplaceTemplate();
  if (index === 2) return `${sectionHero("PICK 상품", "공급사 승인을 기다리는 상품만 표시합니다. 승인완료되면 ‘상품승인’ 메뉴로 이동합니다.")}<div class="panel"><div class="panel-head"><div><h3>승인대기 상품</h3><p>공급사 승인이 완료될 때까지 이 화면에서 확인합니다.</p></div><span class="chip">${currentSellerProducts().filter(item => item.approvalStatus === "승인대기").length}개 대기중</span></div>${sellerProductsTable()}</div>`;
  if (index === 11) return sellerOnSaleProductsTemplate();
  if (index === 12) return sellerDoogoMoneyTemplate();
  if (index === 13) return sellerNoticesTemplate();
  if (index === 14) return sellerApprovedProductsTemplate();
  if (index === 15) return sellerProductMappingTemplate();
  if (index === 3) return sellerConnectionTemplate();
  if (index === 4) return sellerOrderManagementTemplate();
  if (index === 5) return refundTemplate("seller");
  if (index === 6) return salesCalendarTemplate();
  if (index === 7) { const alerts = currentPriceAlerts(); return `${sectionHero("가격 변경알림", "공급가가 바뀐 상품을 빨간색 알림으로 확인하고 판매가를 검토합니다.")}<div class="panel"><div class="panel-head"><div><h3>공급가 변경 내역</h3><p>확인하지 않은 변경을 우선 표시합니다. 신경 쓸 필요가 없는 변경은 삭제로 바로 정리하세요.</p></div><span class="chip red">${alerts.filter(alert => alert.status === "확인필요").length}건 확인 필요</span></div><div class="alert-list price-alert-rows">${alerts.length ? alerts.map(alert => priceAlertRow(alert, "row")).join("") : `<div class="empty">가격 변경 알림이 없습니다.</div>`}</div></div>`; }
  if (index === 8) return channelIntegrationTemplate();
  if (index === 9) return subscriptionTemplate();
  return sellerAccountProfileTemplate();
}

function renderSupplierSection(index) {
  if (index === 1) return `${sectionHero("상품 관리", "상품 등록·수정·재고·판매 상태를 한 화면에서 관리합니다.", `<button class="primary-button" data-action="register-product">+ 새 상품 등록</button>`)}<div class="panel"><div class="panel-head"><div><h3>내 등록 상품</h3><p>재고 50개 미만은 빨간색으로 표시됩니다.</p></div><span class="chip">${currentSupplierProducts().length}개 상품</span></div>${supplierProductsTable()}</div>`;
  if (index === 2) return supplierConnectionTemplate();
  if (index === 3) return supplierOrderManagementTemplate();
  if (index === 4) return refundTemplate("supplier");
  if (index === 5) return shippingSettingsTemplate();
  if (index === 6) return `${sectionHero("가격 관리", "공급가 변경 시 상품을 가져간 위탁셀러에게 빨간색 알림이 생성됩니다.")}<div class="panel"><div class="panel-head"><div><h3>상품별 공급가</h3><p>가격 버튼을 눌러 변경 알림 흐름을 확인하세요.</p></div></div>${supplierProductsTable()}</div>`;
  if (index === 7) return supplierSettlementTemplate();
  return accountProfileTemplate();
}

function logsTemplate() {
  return `<div class="content-grid equal"><div class="panel"><div class="panel-head"><div><h3>전체 변경 이력</h3><p>회원·상품·가격·주문·송장 작업 기록</p></div><span class="chip">${state.logs.length}건</span></div><div class="activity-list log-scroll">${state.logs.map(log => `<div class="activity-item"><strong><span class="timeline-dot ${log.state}"></span>${escapeHtml(log.title)}</strong><p>${escapeHtml(log.detail)}<br><b>${escapeHtml(log.actor || "시스템")}</b> · ${escapeHtml(log.time)}</p></div>`).join("")}</div></div><div class="panel"><div class="panel-head"><div><h3>오류·연동 로그</h3><p>외부 연동 보류와 처리 오류</p></div><span class="chip red">${state.errors.length}건</span></div><div class="activity-list">${state.errors.map(error => `<div class="activity-item error-item"><strong><span class="timeline-dot blocked"></span>${escapeHtml(error.title)}</strong><p>${escapeHtml(error.source)} · ${escapeHtml(error.detail)}<br>${escapeHtml(error.time)}</p></div>`).join("")}</div></div></div>`;
}

function masterNoticesAdminTemplate() {
  const list = state.notices || [];
  return `${sectionHero("공지사항 관리", "위탁셀러·공급사에게 노출되는 공지사항을 등록하고 수정합니다.", `<button type="button" class="primary-button" data-action="edit-notice">+ 공지 등록</button>`)}
    <div class="panel notice-admin-panel"><div class="panel-head"><div><h3>등록된 공지사항</h3><p>새 공지는 목록 맨 위에 노출됩니다.</p></div><span class="chip">${list.length}건</span></div>
    <div class="notice-admin-list">${list.length ? list.map(n => `<article class="notice-admin-row"><div><b>${escapeHtml(n.title)}</b><small>${escapeHtml(n.date)} · ${escapeHtml(n.detail)}</small></div><div class="row-actions"><button type="button" class="text-button" data-action="edit-notice" data-id="${n.id}">수정</button><button type="button" class="small-button reject" data-action="delete-notice" data-id="${n.id}">삭제</button></div></article>`).join("") : `<div class="empty">등록된 공지사항이 없습니다.</div>`}</div></div>`;
}
function noticeFormModal(id) {
  const notice = id ? (state.notices || []).find(n => n.id === id) : null;
  openModal(`<h2>${notice ? "공지사항 수정" : "공지사항 등록"}</h2><form id="noticeForm" class="form-grid" data-id="${notice?.id || ""}">
    <div class="form-field full"><label>제목</label><input name="title" value="${escapeHtml(notice?.title || "")}" required></div>
    <div class="form-field full"><label>내용</label><textarea name="detail" rows="4" required>${escapeHtml(notice?.detail || "")}</textarea></div>
    <div class="form-field"><label>날짜 표기</label><input name="date" value="${escapeHtml(notice?.date || "오늘")}" placeholder="예: 오늘, 09.08" required></div>
    <div class="modal-actions full"><button type="button" class="secondary-button" data-close-modal>취소</button><button class="primary-button" type="submit">${notice ? "저장" : "등록"}</button></div>
  </form>`);
}
function renderMasterSection(index) {
  if (index === 1) return `${sectionHero("회원 · 권한 승인", "신규 사업자 가입과 위탁셀러의 공급사 요청을 한 화면에서 검토합니다.")}${supplierApplicationsTemplate()}<div class="panel approval-panel"><div class="panel-head"><div><h3>신규 사업자 가입 승인</h3><p>승인 전에는 로그인할 수 없습니다.</p></div><span class="chip ${state.members.some(member => member.status === "pending") ? "red" : ""}">${state.members.filter(member => member.status === "pending").length}건 대기</span></div>${membersTable()}</div>`;
  if (index === 2) return `${sectionHero("공급사 관리", "공급사 사업자 정보와 상품·주문 현황, 이용 상태를 전체 조회합니다.")}<div class="panel"><div class="panel-head"><div><h3>전체 공급사</h3><p>상세정보 확인과 계정 이용 정지가 가능합니다. 복수 역할 계정도 함께 표시됩니다.</p></div><span class="chip">${state.members.filter(member => (member.roles || [member.role]).includes("supplier")).length}곳</span></div>${memberDirectoryTable("supplier")}</div>`;
  if (index === 3) return `${sectionHero("위탁셀러 관리", "위탁셀러 사업자 정보와 판매상품·주문 현황을 전체 조회합니다.")}<div class="panel"><div class="panel-head"><div><h3>전체 위탁셀러</h3><p>회원별 활동 상태와 주문 수를 확인합니다.</p></div><span class="chip">${state.members.filter(member => member.role === "seller").length}곳</span></div>${memberDirectoryTable("seller")}</div>`;
  if (index === 4) return masterConnectionsTemplate();
  if (index === 5) return `${sectionHero("전체 상품 관리", "모든 공급사의 상품·공급가·재고·셀러 선택 현황을 조회합니다.")}<div class="panel"><div class="panel-head"><div><h3>통합 상품 목록</h3><p>변경 이력으로 공급사의 작업 기록을 추적합니다.</p></div><span class="chip">${state.products.length}개</span></div>${masterProductsTable()}</div>`;
  if (index === 6) return `${sectionHero("전체 주문 관리", "주문 접수부터 공급사 자동 배정, 송장 반영까지 한 화면에서 확인합니다.")}<div class="panel"><div class="panel-head"><div><h3>통합 주문 목록</h3><p>셀러와 공급사 사이의 처리 상태를 모니터링합니다.</p></div><span class="chip orange">처리 필요 ${state.orders.filter(order => ["신규주문","주문접수","발주완료","배송준비중"].includes(order.status)).length}건</span></div>${ordersTable("master")}</div>`;
  if (index === 7) return refundTemplate("master");
  if (index === 9) return masterNoticesAdminTemplate();
  return `${sectionHero("연동·변경 로그", "모든 주요 변경과 오류를 시간순으로 저장하고 확인합니다.")}${logsTemplate()}`;
}

function sellerDashboardLayout() {
  const source = editMode && dashboardDraftLayout ? dashboardDraftLayout : state.sellerDashboard?.layout;
  const valid = [...new Set((source || DEFAULT_DASHBOARD_LAYOUT).filter(id => DEFAULT_DASHBOARD_LAYOUT.includes(id)))];
  if (editMode && Array.isArray(dashboardDraftLayout)) return valid;
  return valid.length ? valid : [...DEFAULT_DASHBOARD_LAYOUT];
}

function dashboardWidgetFrame(id, title, html) {
  return `<div class="dashboard-widget dashboard-widget-${id}" data-dashboard-widget="${id}" draggable="${editMode ? "true" : "false"}">
    ${editMode ? `<div class="dashboard-widget-controls"><span class="dashboard-drag-handle" aria-label="${escapeHtml(title)} 이동">⋮⋮ 드래그</span><b>${escapeHtml(title)}</b><span class="dashboard-mobile-movers"><button type="button" data-action="move-dashboard-widget" data-id="${id}" data-direction="up" aria-label="${escapeHtml(title)} 위로 이동">↑</button><button type="button" data-action="move-dashboard-widget" data-id="${id}" data-direction="down" aria-label="${escapeHtml(title)} 아래로 이동">↓</button></span><button type="button" class="dashboard-remove-widget" data-action="remove-dashboard-widget" data-id="${id}" aria-label="${escapeHtml(title)} 삭제">×</button></div>` : ""}
    ${html}
  </div>`;
}

function dashboardWidgetPickerModal() {
  const visible = new Set(sellerDashboardLayout());
  const labels = {
    hero: "오늘의 운영 안내",
    "order-control": "주문 처리 현황",
    "quick-actions": "빠른 실행",
    notices: "공지사항",
    sales: "매출·두고머니",
    "product-sales": "PICK 상품",
    "price-alerts": "가격 변경 알림",
    "recent-orders": "최근 주문"
  };
  const hidden = DEFAULT_DASHBOARD_LAYOUT.filter(id => !visible.has(id));
  openModal(`<div class="widget-picker-head"><span>DASHBOARD WIDGETS</span><h2>위젯 추가</h2><p>숨긴 위젯을 다시 대시보드에 추가할 수 있습니다.</p></div><div class="widget-picker-grid">${hidden.length ? hidden.map(id => `<button type="button" data-action="restore-dashboard-widget" data-id="${id}"><span>＋</span><b>${labels[id]}</b><small>대시보드 맨 아래에 추가</small></button>`).join("") : `<div class="empty">현재 모든 위젯이 표시되고 있습니다.</div>`}</div><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>닫기</button></div>`);
}

function renderSeller() {
  if (activeRole === "seller" && activeMenuIndex > 0) {
    document.getElementById("sellerView").innerHTML = renderSellerSection(activeMenuIndex);
    return;
  }
  const sellerProducts = currentSellerProducts();
  const sellerOrders = currentSellerOrders();
  const alerts = currentPriceAlerts().filter(a => a.status === "확인필요");
  const waiting = sellerOrders.filter(o => o.status === "신규주문").length;
  const received = sellerOrders.filter(o => o.status === "주문접수").length;
  const ordered = sellerOrders.filter(o => o.status === "발주완료").length;
  const preparing = sellerOrders.filter(o => o.status === "배송준비중").length;
  const shipping = sellerOrders.filter(o => o.status === "배송중").length;
  const delivered = sellerOrders.filter(o => o.status === "배송완료").length;
  const salesTotal = state.salesLedger.reduce((sum, item) => sum + item.sales, 0);
  const profitTotal = state.salesLedger.reduce((sum, item) => sum + item.sales - item.cost, 0);
  const deposit = sellerDeposit();
  const mappingRequired = sellerMappingRequiredOrders();
  const paymentRequired = sellerPaymentRequiredOrders();
  const refundCounts = {
    cancel: state.refunds.filter(item => item.sellerLoginId === currentAccount.loginId && item.type === "주문 취소").length,
    return: state.refunds.filter(item => item.sellerLoginId === currentAccount.loginId && item.type === "반품").length,
    exchange: state.refunds.filter(item => item.sellerLoginId === currentAccount.loginId && item.type === "교환").length
  };
  const statusButton = (stage, icon, label, count, caption, tone = "blue") => dashboardKpiCard({
    action: "dashboard-order-stage",
    icon,
    label,
    value: `${count}건`,
    description: caption,
    tone,
    attributes: `data-stage="${stage}"`
  });
  const todaysNewOrders = sellerOrders.filter(o => String(o.createdAt || "").includes("오늘")).length;
  const shippingDelayed = sellerOrders.filter(o => o.status === "배송준비중" && !String(o.createdAt || "").includes("오늘")).length;
  const widgets = {
    hero: `<div class="hero-row seller-dashboard-head">
      <div class="hero-copy"><span class="dashboard-eyebrow">SELLER OPERATIONS</span><h2>${escapeHtml(contentText("seller.dashboard.title", "오늘 처리할 주문을 한눈에 확인하세요."))}</h2><p>${escapeHtml(contentText("seller.dashboard.description", "상품 매핑부터 결제·발주·배송·클레임까지 단계별로 바로 이동할 수 있습니다."))}</p></div>
      <div class="dashboard-head-actions"><span>마지막 업데이트 · 방금 전</span><button class="secondary-button" data-action="refresh-dashboard">↻ 새로고침</button></div>
      <div class="dashboard-quick-stats">
        <button type="button" data-action="dashboard-order-stage" data-stage="received"><b>${todaysNewOrders}</b><span>오늘 수집된 주문(신규)</span></button>
        <button type="button" data-action="dashboard-order-stage" data-stage="preparing"><b>${shippingDelayed}</b><span>출고지연 주문</span></button>
        <button type="button" data-action="open-order-mapping"><b>${mappingRequired.length}</b><span>주문재확인 건</span></button>
      </div>
    </div>`,
    "order-control": `${(mappingRequired.length || paymentRequired.length) ? `<section class="seller-mapping-banner"><div><span>ORDER MAPPING</span><h3>공급사 전달 전 확인할 주문이 ${mappingRequired.length + paymentRequired.length}건 있습니다.</h3><p>매핑 ${mappingRequired.length}건 · 결제 대기 ${paymentRequired.length}건</p></div><button data-action="open-order-mapping">주문 매핑하기 →</button></section>` : ""}
    <section class="order-command-center panel">
      <div class="command-center-head"><div><span>ORDER CONTROL</span><h3>${escapeHtml(contentText("seller.dashboard.orderTitle", "주문 처리 현황"))}</h3><p>${escapeHtml(contentText("seller.dashboard.orderDescription", "숫자를 누르면 해당 주문만 바로 조회됩니다."))}</p></div><button class="secondary-button" data-action="open-orders">전체 주문 보기 →</button></div>
      <div class="order-kpi-groups seller-order-kpis">
        <div class="kpi-group kpi-group-single"><span class="kpi-group-label">결제완료</span><div class="kpi-group-cards">
          ${statusButton("all","total","총 주문",sellerOrders.length,"전체 주문 내역","blue")}
        </div></div>
        <div class="kpi-group"><span class="kpi-group-label">신규주문</span><div class="kpi-group-cards">
          ${statusButton("received","new","신규주문",waiting,"확인이 필요한 주문","yellow")}
          ${statusButton("received","received","주문접수",received,"공급사 발주 대기","cyan")}
        </div></div>
        <div class="kpi-group-arrow" aria-hidden="true"><span>주문확인</span><i>›</i></div>
        <div class="kpi-group"><span class="kpi-group-label">출고관리</span><div class="kpi-group-cards">
          ${statusButton("ordered","ordered","발주완료",ordered,"공급사 확인 대기","purple")}
          ${statusButton("preparing","preparing","배송준비중",preparing,"송장 발급 대기","orange")}
        </div></div>
        <div class="kpi-group-arrow" aria-hidden="true"><span>배송시작</span><i>›</i></div>
        <div class="kpi-group"><span class="kpi-group-label">배송관리 · 최근 7일</span><div class="kpi-group-cards">
          ${statusButton("shipping","shipping","배송중",shipping,"택배 이동중","green")}
          ${statusButton("delivered","delivered","배송완료",delivered,"구매자 수령","mint")}
        </div></div>
      </div>
      <div class="dashboard-claim-strip"><div><span>클레임 관리</span><b>취소·반품·교환 요청을 바로 확인하세요.</b></div><button type="button" data-action="open-refunds" data-type="주문 취소"><span>취소</span><b>${refundCounts.cancel}</b></button><button type="button" data-action="open-refunds" data-type="반품"><span>반품</span><b>${refundCounts.return}</b></button><button type="button" data-action="open-refunds" data-type="교환"><span>교환</span><b>${refundCounts.exchange}</b></button>
      </div>
    </section>`,
    "quick-actions": `<div class="seller-quick-actions"><button data-action="open-catalog"><span>＋</span><b>상품 소싱하기</b><small>국가·브랜드·카테고리별 소싱</small></button><button data-action="open-connections"><span>⌁</span><b>거래처 연결</b><small>공급사 코드 등록</small></button><button data-action="open-my-products"><span>▦</span><b>PICK 상품</b><small>상품명·가격·쇼핑몰 관리</small></button><button data-action="open-order-mapping"><span>⇄</span><b>주문 매핑</b><small>${mappingRequired.length + paymentRequired.length ? `${mappingRequired.length + paymentRequired.length}건 처리 필요` : "상품코드·결제 연결"}</small></button></div>`,
    notices: `<div class="panel dashboard-notices"><div class="panel-head"><div><h3>공지사항</h3><p>두고 운영 안내</p></div><button class="text-button" data-action="open-notices">더보기 →</button></div><div class="notice-list">${(state.notices || []).map(n => `<button data-action="open-notice-detail" data-id="${n.id}"><b>${escapeHtml(n.title)}</b><span>${escapeHtml(n.date)}</span></button>`).join("")}</div></div>`,
    sales: `<div class="panel sales-summary"><div class="panel-head"><div><h3>9월 매출·두고머니</h3><p>4개 판매채널 샘플 집계</p></div><div class="refund-head-actions"><button class="text-button" data-action="open-sales-calendar">달력</button><button class="text-button" data-action="open-doogo-money">두고머니 관리 →</button></div></div><dl><div><dt>오늘 매출</dt><dd>${money(state.salesLedger.filter(item=>item.date==="2026-09-08").reduce((sum,item)=>sum+item.sales,0))}</dd></div><div><dt>이번 달 매출</dt><dd>${money(salesTotal)}</dd></div><div><dt>예상 순수익</dt><dd>${money(profitTotal)}</dd></div><div><dt>사용 가능 두고머니</dt><dd class="deposit-value">${money(deposit.balance)}</dd></div></dl></div>`,
    "product-sales": `<div class="panel product-sales"><div class="panel-head"><div><h3>PICK 상품</h3><p>내가 선택한 판매상품</p></div><button class="text-button" data-action="open-my-products">관리 →</button></div>${sellerProducts.length ? `<div class="product-sale-list">${sellerProducts.map(item => { const product = productOf(item.productId); const amount = sellerOrders.filter(order => (order.mappedProductId || order.productId) === item.productId).reduce((sum,order)=>sum+order.amount,0); const isOnSale = sellerChannels().some(channel => sellerProductChannelStatus(item, channel) === "판매중"); return `<button class="product-sale-row" data-action="edit-seller-product" data-id="${item.id}">${productPhoto(product,"sale-photo")}<span><b>${escapeHtml(sellerProductTitle(item, product))}</b><small>${money(amount)}</small></span><em class="chip ${isOnSale ? "" : "orange"}">${isOnSale ? "판매중" : "판매대기"}</em></button>`; }).join("")}</div>` : `<div class="empty">PICK한 상품이 없습니다.</div>`}</div>`,
    "price-alerts": `<div class="panel">
        <div class="panel-head"><div><h3>가격 변경 알림</h3><p>공급가 변동이 있는 상품입니다.</p></div>${alerts.length ? `<span class="chip red">${alerts.length}건</span>` : `<span class="chip">완료</span>`}</div>
        <div class="alert-list">${alerts.length ? alerts.map(priceAlertRow).join("") : `<div class="empty">확인할 가격 변경이 없습니다.</div>`}</div>
      </div>`,
    "recent-orders": `<div class="panel">
      <div class="panel-head"><div><h3>최근 주문</h3><p>공급사 송장 처리 결과가 이 화면에 자동 반영됩니다.</p></div><span class="chip orange">샘플 주문</span></div>
      ${ordersTable("seller")}
    </div>`
  };
  const labels = { hero: "오늘의 운영 안내", "order-control": "주문 처리 현황", "quick-actions": "빠른 실행", notices: "공지사항", sales: "매출·두고머니", "product-sales": "PICK 상품", "price-alerts": "가격 변경 알림", "recent-orders": "최근 주문" };
  const layout = sellerDashboardLayout();
  document.getElementById("sellerView").innerHTML = `
    ${editMode ? `<div class="dashboard-edit-toolbar"><div><span>대시보드 편집 중</span><b>위젯을 드래그해 순서를 바꾸고 × 버튼으로 숨길 수 있습니다.</b></div><div><button type="button" class="secondary-button" data-action="add-dashboard-widget">＋ 위젯 추가</button><button type="button" class="secondary-button" data-action="reset-dashboard-layout">기본 배치</button><button type="button" class="secondary-button" data-action="cancel-dashboard-edit">취소</button><button type="button" class="primary-button" data-action="save-dashboard-layout">변경사항 저장</button></div></div>` : `<div class="dashboard-widget-toolbar"><span>내 대시보드</span><button type="button" class="secondary-button" data-action="toggle-edit-mode">⚙ 위젯 설정</button></div>`}
    <div class="dashboard-widget-canvas">${layout.map(id => dashboardWidgetFrame(id, labels[id], widgets[id])).join("")}${editMode ? `<button type="button" class="dashboard-add-widget" data-action="add-dashboard-widget"><span>＋</span><b>위젯 추가</b><small>필요한 위젯을 선택해 대시보드를 구성하세요.</small></button>` : ""}</div>`;
}

function isFreePricedProduct(p) { return p.category === "농산물" || p.category === "수산물"; }
function catalogPriceRows(p) {
  const freePriced = isFreePricedProduct(p);
  const profitRow = freePriced ? `<div><dt>지정판매가</dt><dd>자율</dd></div>` : `<div><dt>예상 수익</dt><dd class="profit-text">${money(p.recommended - p.supply)}</dd></div>`;
  const marginRow = freePriced ? `<div><dt>마진율</dt><dd class="margin-free">-%</dd></div>` : `<div><dt>마진율</dt><dd>${margin(p.supply, p.recommended)}%</dd></div>`;
  return `<div><dt>공급가</dt><dd>${money(p.supply)}</dd></div>${profitRow}${marginRow}`;
}
function productRowSeller(p) {
  const sellerItem = currentSellerProducts().find(x => x.productId === p.id);
  const changed = currentPriceAlerts().some(alert => alert.productId === p.id && alert.status === "확인필요");
  const isLive = sellerItem ? sellerChannels().some(channel => sellerProductChannelStatus(sellerItem, channel) === "판매중") : false;
  const pickState = !sellerItem ? "none" : sellerItem.approvalStatus === "승인대기" ? "pending" : isLive ? "live" : "approved";
  const pickLabel = { none: "PICK하기", pending: "승인대기", approved: "판매중", live: "판매중" }[pickState];
  const pickClass = pickState === "none" ? "" : pickState === "live" ? "done" : "picked";
  return `<article class="market-product-card" data-action="product-detail" data-id="${p.id}" tabindex="0" aria-label="${escapeHtml(p.name)} 상세 보기">
    <div class="market-product-image">${productPhoto(p, "catalog-photo")}<b>발주마감 ${escapeHtml(p.cutoff || "10:00")}</b><em>${escapeHtml(p.category)}</em><span class="shipping-badge ${p.shippingType === "overseas" ? "overseas" : "domestic"}">${p.shippingType === "overseas" ? `해외직구 · ${escapeHtml(p.originCountry)}` : "국내배송"}</span>${changed ? `<strong class="price-alert-flag">공급가 변경</strong>` : ""}</div>
    <div class="market-product-body">
      <small>${escapeHtml(p.supplier)} · ${p.id}</small><h4>${escapeHtml(p.name)}</h4>
      <dl>${catalogPriceRows(p)}</dl>
      <div class="market-card-actions"><button class="text-button" data-action="supplier-contact" data-id="${p.supplierLoginId}" data-product-id="${p.id}">공급사 문의</button><button class="small-button ${pickClass}" data-action="${sellerItem ? "open-picked-product" : "import-product"}" data-id="${p.id}">${pickLabel}</button></div>
    </div>
  </article>`;
}
function productRowSellerList(p) {
  const sellerItem = currentSellerProducts().find(x => x.productId === p.id);
  const changed = currentPriceAlerts().some(alert => alert.productId === p.id && alert.status === "확인필요");
  const isLive = sellerItem ? sellerChannels().some(channel => sellerProductChannelStatus(sellerItem, channel) === "판매중") : false;
  const pickState = !sellerItem ? "none" : sellerItem.approvalStatus === "승인대기" ? "pending" : isLive ? "live" : "approved";
  const pickLabel = { none: "PICK하기", pending: "승인대기", approved: "판매중", live: "판매중" }[pickState];
  const pickClass = pickState === "none" ? "" : pickState === "live" ? "done" : "picked";
  const freePriced = isFreePricedProduct(p);
  return `<article class="market-product-list-row" data-action="product-detail" data-id="${p.id}" tabindex="0" aria-label="${escapeHtml(p.name)} 상세 보기">
    <div class="list-row-image">${productPhoto(p, "catalog-photo")}${changed ? `<strong class="price-alert-flag">공급가 변경</strong>` : ""}</div>
    <div class="list-row-body">
      <span class="list-row-badges"><em class="shipping-badge ${p.shippingType === "overseas" ? "overseas" : "domestic"}">${p.shippingType === "overseas" ? `해외직구 · ${escapeHtml(p.originCountry)}` : "국내배송"}</em><small>발주마감 ${escapeHtml(p.cutoff || "10:00")}</small></span>
      <h4>${escapeHtml(p.name)}</h4>
      <small class="list-row-meta">${escapeHtml(p.supplier)} · ${p.id} · ${escapeHtml(p.category)}</small>
    </div>
    <div class="list-row-price"><span><small>공급가</small><b>${money(p.supply)}</b></span><span>${freePriced ? `<small>지정판매가</small><b>자율</b>` : `<small>예상 수익</small><b class="profit-text">${money(p.recommended - p.supply)}</b>`}</span><span><small>마진율</small><b class="${freePriced ? "margin-free" : ""}">${freePriced ? "-%" : `${margin(p.supply, p.recommended)}%`}</b></span></div>
    <div class="list-row-actions"><button class="text-button" data-action="supplier-contact" data-id="${p.supplierLoginId}" data-product-id="${p.id}">공급사 문의</button><button class="small-button ${pickClass}" data-action="${sellerItem ? "open-picked-product" : "import-product"}" data-id="${p.id}">${pickLabel}</button></div>
  </article>`;
}

function priceAlertRow(a, layout = "card") {
  const p = productOf(a.productId);
  const acked = a.status !== "확인필요";
  if (layout === "row") {
    return `<div class="alert-row ${acked ? "acked" : ""}">
      <span class="chip ${acked ? "" : "red"}">${acked ? "확인완료" : "변경"}</span>
      <div class="alert-row-main"><strong>${p.name}</strong><small>${p.supplier}에서 공급가를 변경했습니다.</small></div>
      <div class="price-change"><del>${money(a.oldPrice)}</del><span>→</span><b>${money(a.newPrice)}</b></div>
      <div class="alert-row-actions"><button class="small-button" data-action="review-price" data-id="${a.id}">채널 판매가 일괄 변경</button>${acked ? "" : `<button class="text-button" data-action="ack-price" data-id="${a.id}">확인 처리</button>`}<button class="small-button reject" data-action="delete-price-alert" data-id="${a.id}">삭제</button></div>
    </div>`;
  }
  return `<div class="alert-item ${acked ? "acked" : ""}">
    <div class="alert-top"><strong>${p.name}</strong><span class="chip ${acked ? "" : "red"}">${acked ? "확인완료" : "변경"}</span></div>
    <p>${p.supplier}에서 공급가를 변경했습니다.</p>
    <div class="price-change"><del>${money(a.oldPrice)}</del><span>→</span><b>${money(a.newPrice)}</b></div>
    <div class="alert-actions"><button class="small-button" data-action="review-price" data-id="${a.id}">채널 판매가 일괄 변경</button>${acked ? "" : `<button class="text-button" data-action="ack-price" data-id="${a.id}">확인 처리</button>`}</div>
  </div>`;
}

function supplierPerformanceTemplate() {
  const orders = currentSupplierOrders();
  const products = currentSupplierProducts();
  const rows = products.map(product => {
    const productOrders = orders.filter(order => order.productId === product.id);
    const qty = productOrders.reduce((sum, order) => sum + order.qty, 0);
    const sales = productOrders.reduce((sum, order) => sum + order.amount, 0);
    const grossSettlement = productOrders.filter(order => !state.refunds.some(refund => refund.orderId === order.id && refund.status === "환불완료")).reduce((sum, order) => sum + product.supply * order.qty, 0);
    const fee = platformFee(grossSettlement);
    const settlement = Math.max(0, grossSettlement - fee);
    const purchaseCost = productOrders.reduce((sum, order) => sum + Math.round((product.purchasePrice || product.supply * .72) * order.qty), 0);
    return { product, qty, sales, grossSettlement, fee, settlement, profit: Math.max(0, settlement - purchaseCost) };
  }).sort((a,b) => b.sales - a.sales);
  const seeded = rows.some(row => row.sales) ? rows : products.slice(0,3).map((product,index) => { const qty = 18-index*4; const grossSettlement = product.supply*qty; const fee = platformFee(grossSettlement); const settlement = grossSettlement-fee; return { product, qty, sales: product.recommended*qty, grossSettlement, fee, settlement, profit: Math.round(settlement*.22) }; });
  const totalSales = seeded.reduce((sum,row)=>sum+row.sales,0);
  const totalGrossSettlement = seeded.reduce((sum,row)=>sum+row.grossSettlement,0);
  const totalFee = seeded.reduce((sum,row)=>sum+row.fee,0);
  const totalSettlement = seeded.reduce((sum,row)=>sum+row.settlement,0);
  const totalProfit = seeded.reduce((sum,row)=>sum+row.profit,0);
  const maxSales = Math.max(...seeded.map(row=>row.sales),1);
  return `<section class="supplier-performance"><div class="supplier-performance-head"><div><span>2026년 9월 · BRAND PARTNER</span><h3>이번 달 판매 성과</h3><p>브랜드 공급 매출에서 두고 중개 수수료 7%를 차감한 정산·순수익 예상입니다.</p></div><button class="secondary-button" data-action="open-settlement">정산 상세 →</button></div><div class="supplier-metrics five"><div><span>소비자 매출</span><strong>${money(totalSales)}</strong><small>연결 셀러 판매 합계</small></div><div><span>공급 매출</span><strong>${money(totalGrossSettlement)}</strong><small>환불 주문 자동 제외</small></div><div><span>두고 수수료</span><strong>-${money(totalFee)}</strong><small>공급 매출의 7%</small></div><div><span>정산 예정</span><strong>${money(totalSettlement)}</strong><small>수수료 차감 후</small></div><div><span>예상 순수익</span><strong>${money(totalProfit)}</strong><small>${seeded.reduce((sum,row)=>sum+row.qty,0)}개 판매</small></div></div><div class="supplier-product-ranking"><div class="panel-head"><div><h3>잘 팔리는 상품 TOP</h3><p>매출이 높은 순서로 자동 정렬됩니다.</p></div><span class="chip blue">실시간 집계</span></div>${seeded.length ? seeded.slice(0,4).map((row,index)=>`<div class="supplier-rank-row"><b>${index+1}</b>${productPhoto(row.product,"sale-photo")}<span><strong>${escapeHtml(row.product.name)}</strong><small>${row.qty}개 판매 · 수수료 ${money(row.fee)} · 순수익 ${money(row.profit)}</small><i><em style="width:${Math.round(row.sales/maxSales*100)}%"></em></i></span><strong>${money(row.sales)}</strong></div>`).join("") : `<div class="empty">아직 집계할 판매상품이 없습니다.</div>`}</div></section>`;
}

function supplierOrderManagementTemplate() {
  const allOrders = currentSupplierOrders();
  const statuses = ["발주완료", "배송준비중", "배송중", "배송완료"];
  const filtered = supplierOrderStatus === "all" ? allOrders : allOrders.filter(order => order.status === supplierOrderStatus);
  const readyCount = allOrders.filter(order => order.status === "배송준비중" && !order.tracking).length;
  return `${sectionHero("주문 · 출고 관리", "신규주문 확인부터 굿스플로 송장 발급, 배송완료까지 단계별로 처리합니다.", `<button class="primary-button" data-action="auto-issue-all" ${readyCount ? "" : "disabled"}>배송준비중 송장 일괄발급</button>`)}
    <div class="supplier-order-flow panel">${statuses.map((status, index) => `<button type="button" class="${supplierOrderStatus === status ? "active" : ""}" data-action="filter-supplier-orders" data-status="${status}"><span>0${index + 1}</span><b>${status}</b><strong>${allOrders.filter(order => order.status === status).length}</strong></button>`).join("")}</div>
    <div class="panel"><div class="panel-head"><div><h3>배정 주문</h3><p>송장 출력은 배송준비중 주문에서만 가능하며, 발급 즉시 배송중으로 이동합니다.</p></div><div class="order-filter-tabs"><button class="${supplierOrderStatus === "all" ? "active" : ""}" data-action="filter-supplier-orders" data-status="all">전체 ${allOrders.length}</button>${statuses.map(status => `<button class="${supplierOrderStatus === status ? "active" : ""}" data-action="filter-supplier-orders" data-status="${status}">${status}</button>`).join("")}</div></div>${ordersTable("supplier", "", filtered)}</div>`;
}

function supplierSettlementTemplate() {
  const supplierOrders = currentSupplierOrders();
  const months = [...new Set(["2026-09", "2026-08", ...supplierOrders.map(order => String(order.orderDate || "").slice(0, 7)).filter(Boolean)])].sort().reverse();
  if (!months.includes(supplierSettlementMonth)) supplierSettlementMonth = months[0] || "2026-09";
  const monthOrders = supplierOrders.filter(order => String(order.orderDate || "").startsWith(supplierSettlementMonth));
  const refundFor = order => state.refunds.find(refund => refund.orderId === order.id && refund.status === "환불완료" && refund.supplierSettlementOffset);
  const gross = monthOrders.reduce((sum, order) => sum + (productOf(order.productId)?.supply || 0) * order.qty, 0);
  const offset = monthOrders.filter(refundFor).reduce((sum, order) => sum + (productOf(order.productId)?.supply || 0) * order.qty, 0);
  const fee = platformFee(Math.max(0, gross - offset));
  const payable = Math.max(0, gross - offset - fee);
  const scheduled = monthOrders.filter(order => order.settlementStatus !== "completed" && !refundFor(order));
  const completed = monthOrders.filter(order => order.settlementStatus === "completed" && !refundFor(order));
  const rows = supplierSettlementTab === "completed" ? completed : scheduled;
  const monthLabel = `${Number(supplierSettlementMonth.slice(5, 7))}월`;
  return `${sectionHero("정산 내역", "월별 공급 매출과 두고 중개 수수료 7%, 환불 정산 제외 내역을 확인합니다.", `<label class="settlement-month-picker"><span>정산 월</span><select id="supplierSettlementMonthSelect">${months.map(month => `<option value="${month}" ${month === supplierSettlementMonth ? "selected" : ""}>${month.replace("-", ".")}</option>`).join("")}</select></label>`)}
    <div class="settlement-hero five"><div><span>${monthLabel} 지급 예정액</span><strong>${money(payable)}</strong><small>월말 마감 · 샘플 계산</small></div><div><span>공급 매출</span><b>${money(gross)}</b></div><div class="negative"><span>환불 정산 제외</span><b>-${money(offset)}</b></div><div class="negative"><span>두고 수수료 7%</span><b>-${money(fee)}</b></div><div><span>정산 완료</span><b>${completed.length}건</b></div></div>
    <div class="panel settlement-panel"><div class="settlement-tabs"><button class="${supplierSettlementTab === "scheduled" ? "active" : ""}" data-action="settlement-tab" data-tab="scheduled"><span>정산 예정</span><b>${scheduled.length}건</b></button><button class="${supplierSettlementTab === "completed" ? "active" : ""}" data-action="settlement-tab" data-tab="completed"><span>정산 완료</span><b>${completed.length}건</b></button></div><div class="panel-head"><div><h3>${supplierSettlementTab === "completed" ? "지급 완료 내역" : "지급 예정 내역"}</h3><p>환불 완료 주문은 목록과 지급액에서 제외되며 변경 이력에 남습니다.</p></div><span class="chip ${supplierSettlementTab === "completed" ? "blue" : "orange"}">${rows.length}건</span></div><div class="table-wrap"><table><thead><tr><th>주문번호</th><th>상품</th><th>배송 상태</th><th>공급 매출</th><th>수수료 7%</th><th>${supplierSettlementTab === "completed" ? "지급 완료액" : "지급 예정액"}</th></tr></thead><tbody>${rows.map(order => { const product = productOf(order.productId); const base = (product?.supply || 0) * order.qty; const rowFee = platformFee(base); return `<tr><td class="order-id">${order.id}<br><small>${escapeHtml(order.settledAt || order.orderDate || "-")}</small></td><td>${escapeHtml(product?.name || "상품")}</td><td>${statusChip(order.status)}</td><td>${money(base)}</td><td>-${money(rowFee)}</td><td><strong>${money(base - rowFee)}</strong></td></tr>`; }).join("") || `<tr><td colspan="6"><div class="empty">선택한 월의 ${supplierSettlementTab === "completed" ? "정산 완료" : "정산 예정"} 주문이 없습니다.</div></td></tr>`}</tbody></table></div></div>`;
}

function renderSupplier() {
  if (activeRole === "supplier" && activeMenuIndex > 0) {
    document.getElementById("supplierView").innerHTML = renderSupplierSection(activeMenuIndex);
    return;
  }
  const products = currentSupplierProducts();
  const orders = currentSupplierOrders();
  const newOrders = orders.filter(o => ["신규주문", "발주완료"].includes(o.status));
  const readyOrders = orders.filter(o => o.status === "배송준비중");
  document.getElementById("supplierView").innerHTML = `
    <div class="hero-row">
      <div class="hero-copy"><h2>상품부터 출고까지, 한 흐름으로 처리하세요</h2><p>상품을 등록하고 계정 전용 택배 설정으로 송장을 자동 발급하면 셀러 화면에 즉시 반영됩니다.</p></div>
      <div class="row-actions"><button class="secondary-button" data-action="auto-issue-all" ${readyOrders.length ? "" : "disabled"}>송장 일괄발급</button><button class="primary-button" data-action="register-product">+ 새 상품 등록</button></div>
    </div>
    <div class="dashboard-kpi-grid role-dashboard-kpis">
      ${dashboardKpiCard({ action:"open-supplier-products", icon:"ordered", label:"등록 상품", value:`${products.length}개`, description:`판매중 ${products.filter(product => product.status === "판매중").length}개`, tone:"blue" })}
      ${dashboardKpiCard({ action:"open-supplier-orders", icon:"new", label:"신규 주문", value:`${newOrders.length}건`, description:"셀러 발주 확인 필요", tone:"yellow", attributes:'data-status="발주완료"' })}
      ${dashboardKpiCard({ action:"open-supplier-orders", icon:"preparing", label:"배송준비중", value:`${readyOrders.length}건`, description:"포장·송장 발급 대기", tone:"orange", attributes:'data-status="배송준비중"' })}
      ${dashboardKpiCard({ action:"open-supplier-orders", icon:"shipping", label:"오늘 출고", value:`${orders.filter(o=>o.status==="배송중").length}건`, description:"발급 송장 확인", tone:"green", attributes:'data-status="배송중"' })}
      ${dashboardKpiCard({ action:"open-supplier-connections", icon:"received", label:"연결 셀러", value:`${currentSupplierConnections().length}곳`, description:"상품·주문 현황", tone:"purple" })}
    </div>
    ${supplierPerformanceTemplate()}
    <div class="panel">
      <div class="panel-head"><div><h3>주문 · 출고 관리</h3><p>신규주문 확인 후 배송준비중에서 송장을 출력합니다.</p></div><span class="chip orange">${newOrders.length + readyOrders.length}건 처리 필요</span></div>
      ${ordersTable("supplier")}
    </div>
    <div class="content-grid equal" style="margin-top:16px">
      <div class="panel">
        <div class="panel-head"><div><h3>내 등록 상품</h3><p>공급가 변경 시 셀러에게 알림이 생성됩니다.</p></div></div>
        <div class="product-list">${products.map(productRowSupplier).join("")}</div>
      </div>
      <div class="panel">
        <div class="panel-head"><div><h3>출고 흐름</h3><p>한 번의 처리로 상태를 연결합니다.</p></div></div>
        <div class="flow-strip">
          <div class="flow-step active"><b>① 주문 확인</b><small>두고에서 수집된 주문을 확인합니다.</small></div><div class="flow-arrow">→</div>
          <div class="flow-step active"><b>② 송장 자동발급</b><small>내 택배 설정으로 번호와 라벨을 생성합니다.</small></div><div class="flow-arrow">→</div>
          <div class="flow-step"><b>③ 상태 전달</b><small>셀러·마스터 반영, OMS 전송은 데모 대기.</small></div>
        </div>
      </div>
    </div>`;
}

function productRowSupplier(p) {
  return `<div class="product-row">
    ${productPhoto(p, "product-thumb")}
    <div class="product-title"><strong>${p.name}</strong><small>${p.category} · 재고 ${p.stock}개</small></div>
    <div><span class="cell-label">공급가</span><span class="cell-value">${money(p.supply)}</span></div>
    <div class="mobile-hide"><span class="cell-label">셀러 선택</span><span class="cell-value">${state.sellerProducts.filter(x=>x.productId===p.id).length}곳</span></div>
    <button class="small-button" data-action="change-price" data-id="${p.id}">가격 변경</button>
  </div>`;
}

function orderActionsMarkup(order, role) {
  const hasRefund = state.refunds.some(item => item.orderId === order.id);
  if (role === "seller" && orderMappingStatus(order) !== "mapped") {
    return `<span class="mapping-status unmapped">상품 매핑 필요</span><button class="small-button approve" data-action="map-order" data-id="${order.id}">상품 매핑</button><button class="text-button" data-action="order-detail" data-id="${order.id}">주문 상세</button>`;
  }
  if (role === "seller" && orderPaymentStatus(order) === "pending") {
    return `<span class="mapping-status payment">공급가 결제 대기</span><button class="small-button approve" data-action="pay-order" data-id="${order.id}">결제 후 전달</button><button class="text-button" data-action="map-order" data-id="${order.id}">매핑 변경</button><button class="text-button" data-action="order-detail" data-id="${order.id}">주문 상세</button>`;
  }
  if (role === "seller" && ["신규주문", "주문접수"].includes(order.status)) {
    return `<span class="mapping-status payment">공급사 발주 대기</span><button class="small-button approve" data-action="dispatch-supplier-order" data-id="${order.id}">공급사 발주</button><button class="text-button" data-action="order-detail" data-id="${order.id}">주문 상세</button>${!hasRefund ? `<button class="text-button refund-link" data-action="request-refund" data-id="${order.id}">취소·환불</button>` : ""}`;
  }
  const supplierActions = ["신규주문", "발주완료"].includes(order.status) ? `<button class="small-button approve" data-action="prepare-shipment" data-id="${order.id}">주문 확인·포장</button>` : order.status === "배송준비중" && !order.tracking ? `<div class="row-actions"><button class="small-button approve" data-action="auto-tracking" data-id="${order.id}">자동송장출력</button><button class="text-button" data-action="tracking" data-id="${order.id}">직접 입력</button></div>` : order.status === "배송중" ? `<div class="shipment-inline-actions"><button class="text-button label-reprint" data-action="show-label" data-id="${order.id}">송장 보기</button><button class="text-button" data-action="complete-shipping" data-id="${order.id}">배송완료</button>${order.provisionalTracking ? `<button class="text-button refund-link" data-action="cancel-shipment" data-id="${order.id}">집하 전 취소</button>` : ""}</div>` : order.tracking ? `<button class="text-button label-reprint" data-action="show-label" data-id="${order.id}">송장 보기</button>` : "";
  return `${role === "supplier" ? `${order.tracking ? `<span class="tracking-inline">${escapeHtml(order.carrier)}<strong>${escapeHtml(order.tracking)}</strong>${order.provisionalTracking ? `<small>가송장</small>` : ""}</span>` : ""}${supplierActions}` : order.tracking ? `<span class="tracking-inline">${escapeHtml(order.carrier)}<strong>${escapeHtml(order.tracking)}</strong></span>` : `<span class="waiting-text">${order.status === "발주완료" ? "공급사 주문 확인 대기" : "공급사 처리 대기"}</span>`}<button class="text-button" data-action="order-detail" data-id="${order.id}">주문 상세</button>${role === "seller" && !hasRefund ? `<button class="text-button refund-link" data-action="request-refund" data-id="${order.id}">취소·환불</button>` : ""}`;
}

function mobileOrderCards(orders, role) {
  if (!orders.length) return `<div class="mobile-order-list"><div class="empty">표시할 주문이 없습니다.</div></div>`;
  return `<div class="mobile-order-list">${orders.map(order => {
    const product = orderSourceProduct(order);
    const displayName = role === "supplier" ? product?.name : orderSellerTitle(order);
    return `<article class="mobile-order-card ${orderMappingStatus(order) !== "mapped" ? "mapping-required" : ""}"><header><button data-action="order-detail" data-id="${order.id}">${escapeHtml(order.id)}</button>${statusChip(order.status)}</header><small class="mobile-order-time">${escapeHtml(order.createdAt)}</small><div class="mobile-card-product">${productPhoto(product,"table-photo")}<span><small>${channelMark(channelIdFromName(order.channel),true)} ${escapeHtml(order.channel)} · ${order.shippingType === "overseas" ? "해외직구" : "국내배송"}</small><strong>${escapeHtml(displayName || "매핑 전 외부 상품")}</strong><em>${orderMappingStatus(order) === "mapped" ? `${escapeHtml(order.mappedProductId || order.productId)} · ${escapeHtml(order.assignedSupplier || product?.supplier || "미배정")}` : `외부코드 ${escapeHtml(order.externalProductCode || "-")} · 공급사 미배정`}</em></span></div><dl><div><dt>수취인</dt><dd>${escapeHtml(order.recipientName || order.customer)}<small>${escapeHtml(order.phone || "-")}</small></dd></div><div><dt>수량</dt><dd>${order.qty}개</dd></div><div><dt>주문금액</dt><dd>${money(order.amount)}</dd></div></dl><footer class="order-cell-actions">${orderActionsMarkup(order, role)}</footer></article>`;
  }).join("")}</div>`;
}

function ordersTable(role, query = "", sourceOverride = null) {
  const source = sourceOverride || (role === "seller" ? currentSellerOrders() : role === "supplier" ? currentSupplierOrders() : state.orders);
  const normalized = String(query || "").trim().toLowerCase();
  const orders = source.filter(order => { const product = orderSourceProduct(order); return !normalized || [order.id, order.customer, order.recipientName, order.phone, order.channel, order.tracking, order.externalProductName, order.externalProductCode, order.mappedProductId, product?.name].some(value => String(value || "").toLowerCase().includes(normalized)); });
  return `<div class="table-wrap order-desktop-table"><table><thead><tr><th>주문번호</th><th>상품</th><th>배정 공급사</th><th>수취인</th><th>수량/금액</th><th>상태</th><th>송장·관리</th></tr></thead><tbody>
    ${orders.length ? orders.map(o => {
      const p = orderSourceProduct(o);
      const displayName = role === "supplier" ? p?.name : orderSellerTitle(o);
      return `<tr class="order-click-row ${orderMappingStatus(o) !== "mapped" ? "mapping-required-row" : ""}" data-action="order-detail" data-id="${o.id}" tabindex="0" aria-label="${escapeHtml(o.id)} 주문 상세 보기"><td class="order-id"><button data-action="order-detail" data-id="${o.id}">${o.id}</button><br><small>${escapeHtml(o.createdAt)}</small></td><td><button class="order-product-link" data-action="order-detail" data-id="${o.id}"><strong>${escapeHtml(displayName || "매핑 전 외부 상품")}</strong><small>${channelMark(channelIdFromName(o.channel),true)} ${escapeHtml(o.channel)} · ${orderMappingStatus(o) === "mapped" ? `원본 ${escapeHtml(o.mappedProductId || o.productId)}` : `외부코드 ${escapeHtml(o.externalProductCode || "-")}`}</small></button></td><td><strong>${escapeHtml(orderMappingStatus(o) === "mapped" ? (o.assignedSupplier || p?.supplier || "미배정") : "매핑 필요")}</strong><br><small>${orderSupplierProgressLabel(o)}</small></td><td>${escapeHtml(o.recipientName || o.customer)}<br><small>${escapeHtml(o.phone || "-")}</small></td><td>${o.qty}개 · ${money(o.amount)}</td><td>${statusChip(o.status)}</td><td><div class="order-cell-actions">${orderActionsMarkup(o, role)}</div></td></tr>`;
    }).join("") : `<tr><td colspan="7"><div class="empty">표시할 주문이 없습니다.</div></td></tr>`}
  </tbody></table></div>${mobileOrderCards(orders, role)}`;
}

function membersTable() {
  const members = [...state.members].filter(member => member.role !== "master").sort((a, b) => ({ pending: 0, rejected: 1, approved: 2 }[a.status] ?? 3) - ({ pending: 0, rejected: 1, approved: 2 }[b.status] ?? 3));
  return `<div class="table-wrap"><table class="member-table"><thead><tr><th>신청자</th><th>가입 유형</th><th>사업자 정보</th><th>신청일</th><th>상태</th><th>처리</th></tr></thead><tbody>
    ${members.map(member => `<tr>
      <td><strong>${escapeHtml(member.company)}</strong><br><small>${escapeHtml(member.representative)} · ${escapeHtml(member.loginId)}</small></td>
      <td><span class="member-role ${member.role}">${member.roleLabel}</span></td>
      <td>${escapeHtml(member.businessNo)}<br><small>${escapeHtml(member.contact)}</small></td>
      <td>${escapeHtml(member.appliedAt)}</td>
      <td>${memberStatusChip(member.status)}${member.rejectReason ? `<br><small class="reject-note">${escapeHtml(member.rejectReason)}</small>` : ""}</td>
      <td>${member.status === "pending" ? `<div class="member-actions"><button class="small-button approve" data-action="approve-member" data-id="${member.id}">승인</button><button class="small-button reject" data-action="reject-member" data-id="${member.id}">반려</button><button class="text-button" data-action="member-detail" data-id="${member.id}">상세</button></div>` : `<button class="text-button" data-action="member-detail" data-id="${member.id}">상세보기</button>`}</td>
    </tr>`).join("")}
  </tbody></table></div>`;
}

function supplierApplicationsTemplate() {
  const applications = [...(state.supplierApplications || [])].sort((a, b) => ({ pending: 0, rejected: 1, approved: 2 }[a.status] ?? 3) - ({ pending: 0, rejected: 1, approved: 2 }[b.status] ?? 3));
  const statusLabel = application => application.status === "pending" ? memberStatusChip("pending") : application.status === "approved" ? memberStatusChip("approved") : memberStatusChip("rejected");
  return `<div class="panel supplier-review-panel"><div class="panel-head"><div><h3>공급사 모드 전환 심사</h3><p>기존 위탁셀러가 브랜드사·제조사 공급 권한을 신청한 내역입니다.</p></div><span class="chip ${(applications.some(item => item.status === "pending")) ? "red" : ""}">${applications.filter(item => item.status === "pending").length}건 심사 대기</span></div><div class="table-wrap"><table class="member-table"><thead><tr><th>신청 계정</th><th>공급사 정보</th><th>주요 카테고리</th><th>신청 차수</th><th>상태·사유</th><th>심사</th></tr></thead><tbody>${applications.length ? applications.map(application => { const member = memberByLogin(application.sellerLoginId); return `<tr><td><strong>${escapeHtml(member?.company || application.sellerLoginId)}</strong><br><small>${escapeHtml(application.sellerLoginId)} · ${escapeHtml(member?.representative || "-")}</small></td><td><strong>${escapeHtml(application.company)}</strong><br><small>${escapeHtml(application.businessNo)} · ${escapeHtml(application.businessFile)}</small></td><td>${escapeHtml(application.category)}<br><small>${escapeHtml(application.website || "홈페이지 미입력")}</small></td><td>${application.attempt || 1}차<br><small>${escapeHtml(application.appliedAt)}</small></td><td>${statusLabel(application)}${application.rejectionReason ? `<p class="review-reason">${escapeHtml(application.rejectionReason)}</p>` : ""}</td><td>${application.status === "pending" ? `<div class="member-actions"><button type="button" class="small-button approve" data-action="approve-supplier-application" data-id="${application.id}">승인</button><button type="button" class="small-button reject" data-action="reject-supplier-application" data-id="${application.id}">거절</button></div>` : `<button type="button" class="text-button" data-action="supplier-application-detail" data-id="${application.id}">상세보기</button>`}</td></tr>`; }).join("") : `<tr><td colspan="6"><div class="empty">공급사 전환 신청이 없습니다.</div></td></tr>`}</tbody></table></div></div>`;
}

function supplierApplicationDetailModal(id) {
  const application = state.supplierApplications.find(item => item.id === id);
  const member = memberByLogin(application?.sellerLoginId);
  if (!application) return;
  openModal(`<div class="supplier-application-head"><span>SUPPLIER REVIEW</span><h2>${escapeHtml(application.company)}</h2><p>${escapeHtml(member?.company || application.sellerLoginId)} 계정의 ${application.attempt || 1}차 공급사 전환 신청</p></div><div class="member-detail-grid"><div><span>신청 계정</span><b>${escapeHtml(application.sellerLoginId)}</b></div><div><span>대표자</span><b>${escapeHtml(member?.representative || "-")}</b></div><div><span>사업자등록번호</span><b>${escapeHtml(application.businessNo)}</b></div><div><span>카테고리</span><b>${escapeHtml(application.category)}</b></div><div><span>홈페이지</span><b>${escapeHtml(application.website || "미입력")}</b></div><div><span>증빙 파일</span><b>${escapeHtml(application.businessFile)}</b></div><div class="full"><span>공급 역량 및 브랜드 소개</span><b>${escapeHtml(application.introduction)}</b></div>${application.rejectionReason ? `<div class="full reject-box"><span>반려 사유</span><b>${escapeHtml(application.rejectionReason)}</b></div>` : ""}</div><div class="fee-policy-card"><span>두고 거래 수수료</span><strong>7%</strong><p>승인 후 플랫폼에서 완료된 정산 매출 기준</p></div><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>닫기</button>${application.status === "pending" ? `<button type="button" class="small-button reject" data-action="reject-supplier-application" data-id="${application.id}">거절</button><button type="button" class="primary-button" data-action="approve-supplier-application" data-id="${application.id}">공급사 권한 승인</button>` : ""}</div>`);
}

function renderMaster() {
  if (activeRole === "master" && activeMenuIndex > 0) {
    document.getElementById("masterView").innerHTML = renderMasterSection(activeMenuIndex);
    return;
  }
  const pendingAlerts = state.priceAlerts.filter(a => a.status === "확인필요").length;
  const shipped = state.orders.filter(o => o.status === "배송중").length;
  const pendingMembers = pendingApprovalCount();
  const suppliers = state.members.filter(member => (member.roles || [member.role]).includes("supplier") && member.status === "approved").length;
  const sellers = state.members.filter(member => member.role === "seller" && member.status === "approved").length;
  document.getElementById("masterView").innerHTML = `
    <div class="hero-row">
      <div class="hero-copy"><h2>거래 흐름을 한눈에 보고, 예외만 관리하세요</h2><p>상품·주문·송장·가격 변경과 OMS 전달 상태를 통합 모니터링합니다.</p></div>
      <span class="chip orange">외부 연동 잠금</span>
    </div>
    <div class="dashboard-kpi-grid role-dashboard-kpis">
      ${dashboardKpiCard({ action:"open-master-section", icon:"new", label:"가입·권한 승인", value:`${pendingMembers}건`, description:"심사가 필요한 신청", tone:"yellow", attributes:'data-index="1"' })}
      ${dashboardKpiCard({ action:"open-master-section", icon:"ordered", label:"활성 공급사", value:`${suppliers}곳`, description:"승인된 공급 파트너", tone:"blue", attributes:'data-index="2"' })}
      ${dashboardKpiCard({ action:"open-master-section", icon:"received", label:"활성 위탁셀러", value:`${sellers}곳`, description:"승인된 판매 파트너", tone:"purple", attributes:'data-index="3"' })}
      ${dashboardKpiCard({ action:"open-master-section", icon:"shipping", label:"전체 주문", value:`${state.orders.length}건`, description:`배송중 ${shipped}건`, tone:"green", attributes:'data-index="6"' })}
      ${dashboardKpiCard({ action:"open-master-section", icon:"preparing", label:"상품 변경 확인", value:`${pendingAlerts}건`, description:"가격 알림 상품 관리", tone:"orange", attributes:'data-index="5"' })}
    </div>
    <div class="panel approval-panel">
      <div class="panel-head"><div><h3>사업자 가입 승인 관리</h3><p>신청 사업자 정보를 검토한 뒤 역할별 서비스 접근을 승인합니다.</p></div><span class="chip ${pendingMembers ? "red" : ""}">${pendingMembers}건 승인 대기</span></div>
      ${membersTable()}
    </div>
    <div class="panel">
      <div class="panel-head"><div><h3>두고 데이터 흐름</h3><p>상품·주문·송장·환불을 역할별로 연결하고 판매채널 연동은 안전 모드로 관리합니다.</p></div><button class="text-button" data-action="show-boundary">전체 흐름 보기</button></div>
      <div class="flow-strip">
        <div class="flow-step active"><b>공급사</b><small>상품 등록 · 주문 확인<br>송장 출력</small></div><div class="flow-arrow">→</div>
        <div class="flow-step active"><b>두고</b><small>셀러 매칭 · 가격 알림<br>상태 통합</small></div><div class="flow-arrow">↔</div>
        <div class="flow-step"><b>판매채널 API</b><small>주문 수집 · 송장 반영<br><b style="color:#ad6a00;margin-top:5px">데모 안전 모드</b></small></div>
      </div>
    </div>
    <div class="content-grid" style="margin-top:16px">
      <div class="panel">
        <div class="panel-head"><div><h3>전체 주문 모니터링</h3><p>역할별 상태가 동일하게 유지되는지 확인합니다.</p></div></div>
        ${ordersTable("master")}
      </div>
      <div class="panel">
        <div class="panel-head"><div><h3>운영 · 연동 로그</h3><p>외부로 나갈 이벤트까지 기록합니다.</p></div></div>
        <div class="activity-list">${state.logs.map(log => `<div class="activity-item"><strong><span class="timeline-dot ${log.state}"></span>${log.title}</strong><p>${log.detail}<br>${log.time}</p></div>`).join("")}</div>
      </div>
    </div>`;
}

function setRole(role) {
  if (currentAccount && !accountRoles().includes(role)) return showToast("이 계정에는 해당 역할 권한이 없습니다.");
  activeRole = role; activeMenuIndex = 0; closeModal(); closeMobileSidebar(); render(); updateAccountUI(); window.scrollTo({ top: 0, behavior: "smooth" });
}
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message; toast.classList.add("show");
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("show"), 2500);
}
function openModal(html) {
  const modal = document.querySelector("#modal .modal");
  modal.classList.remove("product-detail-modal", "product-editor-modal", "seller-product-editor-modal", "shipping-label-modal", "calendar-detail-modal", "channel-price-modal", "order-detail-modal");
  document.getElementById("modalContent").innerHTML = html;
  document.getElementById("modal").hidden = false;
}
function closeModal() { const modal = document.querySelector("#modal .modal"); document.getElementById("modal").hidden = true; modal.classList.remove("product-detail-modal", "product-editor-modal", "seller-product-editor-modal", "shipping-label-modal", "calendar-detail-modal", "channel-price-modal", "order-detail-modal"); }

const ADDRESS_SEARCH_RESULTS = [
  { postal: "06236", address: "서울특별시 강남구 테헤란로 152", building: "강남파이낸스센터" },
  { postal: "04524", address: "서울특별시 중구 세종대로 110", building: "서울시청" },
  { postal: "03181", address: "서울특별시 종로구 종로 1", building: "교보생명빌딩" },
  { postal: "48058", address: "부산광역시 해운대구 센텀중앙로 90", building: "센텀시티" },
  { postal: "41911", address: "대구광역시 동구 동대구로 550", building: "동대구역" },
  { postal: "63122", address: "제주특별자치도 제주시 연삼로 473", building: "제주시청" },
  { postal: "21554", address: "인천광역시 남동구 정각로 29", building: "인천시청" },
  { postal: "35240", address: "대전광역시 서구 둔산로 100", building: "대전시청" }
];
function openAddressPopup() {
  document.getElementById("addressPopupInput").value = "";
  renderAddressPopupResults("");
  document.getElementById("addressPopup").hidden = false;
  requestAnimationFrame(() => document.getElementById("addressPopupInput").focus());
}
function closeAddressPopup() { document.getElementById("addressPopup").hidden = true; }
function renderAddressPopupResults(query) {
  const results = document.getElementById("addressPopupResults");
  if (!results) return;
  const q = query.trim().toLowerCase();
  const matches = ADDRESS_SEARCH_RESULTS.filter(item => !q || `${item.address} ${item.building} ${item.postal}`.toLowerCase().includes(q));
  results.innerHTML = matches.length ? matches.map(item => `<button type="button" data-action="select-address" data-postal="${item.postal}" data-address="${item.address}"><b>${item.postal}</b><span>${escapeHtml(item.address)}<small>${escapeHtml(item.building)}</small></span></button>`).join("") : `<div class="empty">검색 결과가 없습니다. 도로명·건물명으로 다시 검색해 주세요.</div>`;
}

function accountRecoveryModal(role = "seller") {
  if (role === "master") return showToast("마스터 계정은 운영 보안 담당자에게 문의해 주세요.");
  const label = role === "supplier" ? "공급사" : "위탁셀러";
  const sampleName = role === "supplier" ? "공급사 담당자" : "위탁셀러";
  const sampleEmail = role === "supplier" ? "supplier@example.com" : "seller@example.com";
  openModal(`<div class="recovery-head"><span>ACCOUNT RECOVERY</span><h2>${label} 계정 찾기</h2><p>가입할 때 등록한 사업자 정보로 아이디를 확인하거나 비밀번호를 다시 설정합니다.</p></div><div class="account-recovery-grid">
    <form id="findAccountIdForm" class="recovery-card"><input type="hidden" name="role" value="${role}"><span class="recovery-number">01</span><h3>아이디 찾기</h3><p>대표자명과 등록 이메일을 입력해 주세요.</p><div class="form-field"><label>대표자명</label><input name="representative" placeholder="${sampleName}" required></div><div class="form-field"><label>이메일</label><input name="email" type="email" placeholder="${sampleEmail}" required></div><button class="primary-button" type="submit">아이디 확인</button></form>
    <form id="resetPasswordForm" class="recovery-card"><input type="hidden" name="role" value="${role}"><span class="recovery-number">02</span><h3>비밀번호 재설정</h3><p>아이디와 등록 이메일을 확인한 뒤 새 비밀번호를 저장합니다.</p><div class="form-field"><label>아이디</label><input name="loginId" placeholder="아이디 입력" required></div><div class="form-field"><label>등록 이메일</label><input name="email" type="email" placeholder="${sampleEmail}" required></div><div class="form-field"><label>새 비밀번호</label><input name="password" type="password" minlength="6" placeholder="6자 이상" required></div><button class="primary-button" type="submit">새 비밀번호 저장</button></form>
  </div><div class="api-safe-notice"><b>데모 안내</b><span>실제 인증 메일은 발송하지 않으며 현재 브라우저의 승인 계정 정보만 확인합니다.</span></div>`);
}

function accountRecoveryResult(title, detail) {
  openModal(`<div class="recovery-result"><span>✓</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(detail)}</p><button type="button" class="primary-button" data-close-modal>로그인으로 돌아가기</button></div>`);
}

function productDetailModal(id) {
  const p = productOf(id);
  if (!p) return;
  const sellerItem = currentSellerProducts().find(item => item.productId === p.id);
  const supplier = memberByLogin(p.supplierLoginId);
  const overseas = p.shippingType === "overseas";
  const isLive = sellerItem ? sellerChannels().some(channel => sellerProductChannelStatus(sellerItem, channel) === "판매중") : false;
  const pickState = !sellerItem ? "none" : sellerItem.approvalStatus === "승인대기" ? "pending" : isLive ? "live" : "approved";
  const pickAction = sellerItem ? "open-picked-product" : "import-product";
  const pickLabel = { none: "PICK하기", pending: "승인대기", approved: "판매중", live: "판매중" }[pickState];
  openModal(`<div class="product-detail-page"><div class="product-breadcrumb"><button type="button" data-action="open-catalog">공급 상품몰</button><span>›</span><button type="button" data-action="filter-products" data-category="${escapeHtml(p.category)}">${escapeHtml(p.category)}</button><span>›</span> ${escapeHtml(p.name)}</div><div class="product-detail">
    <div class="product-detail-visual">${productPhoto(p, "detail-photo")}<small>${escapeHtml(p.category)}</small><span class="detail-shipping-badge ${overseas ? "overseas" : ""}">${overseas ? `해외직구 · ${escapeHtml(p.originCountry)}` : "국내배송"}</span></div>
    <div class="product-detail-copy">
      <span class="detail-kicker">${escapeHtml(p.supplier)} · ${p.id}</span><h2>${escapeHtml(p.name)}</h2><p>${escapeHtml(p.detail || "승인된 공급사가 제공하는 위탁판매 상품입니다.")}</p>
      <div class="detail-price"><span>셀러 공급가</span><strong>${money(p.supply)}</strong><small>권장 판매가 ${money(p.recommended)} · 예상 수익 ${money(p.recommended-p.supply)}</small></div>
      <dl class="detail-specs"><div><dt>현재 재고</dt><dd class="${p.stock < 50 ? "stock-low" : ""}">${p.stock}개</dd></div><div><dt>배송기간</dt><dd>${escapeHtml(p.deliveryDays || "1~3일")}</dd></div><div><dt>배송정책</dt><dd>${escapeHtml(p.shippingPolicy || "무료배송")}</dd></div><div><dt>원산지</dt><dd>${escapeHtml(p.origin || "대한민국")}</dd></div><div><dt>발주마감</dt><dd>${escapeHtml(p.cutoff || "10:00")}</dd></div><div><dt>통관정보</dt><dd>${overseas ? "개인통관부호 필수" : "해당 없음"}</dd></div></dl>
      <div class="supplier-mini-card"><span class="connection-avatar">공</span><div><b>${escapeHtml(p.supplier)}</b><small>${escapeHtml(supplier?.representative || "공급사 담당자")} · 평일 09:00~18:00</small></div><button data-action="supplier-contact" data-id="${p.supplierLoginId}" data-product-id="${p.id}">바로 문의</button></div>
      <div class="detail-cta-row"><button type="button" class="secondary-button" data-action="supplier-contact" data-id="${p.supplierLoginId}" data-product-id="${p.id}">공급사 문의</button><button type="button" class="primary-button" data-action="${pickAction}" data-id="${p.id}">${pickLabel}</button></div>
    </div></div>
    <div class="detail-tabs" role="tablist"><button type="button" class="active" data-action="product-detail-tab" data-target="product">상품 상세정보</button><button type="button" data-action="product-detail-tab" data-target="shipping">배송·반품 안내</button><button type="button" data-action="product-detail-tab" data-target="supplier">공급사 정보</button></div>
    <section class="detail-tab-panel active" data-detail-panel="product"><div class="long-detail"><div class="long-detail-title"><span>FRESH SELECTED</span><h2>${escapeHtml(p.name)}</h2><p>두고가 확인한 공급사 원본 정보로 만든 샘플 상세페이지입니다.</p></div><div class="long-detail-image">${productPhoto(p,"long-detail-photo")}<div><span>${overseas ? "OVERSEAS DIRECT" : "FARM TO TABLE"}</span><h3>${escapeHtml(p.origin)}에서<br>꼼꼼하게 선별했습니다</h3><p>${escapeHtml(p.detail)}</p></div></div><div class="detail-feature-grid"><div><b>01</b><span>선별 품질</span><p>출고 전 상품 상태와 포장 기준을 확인합니다.</p></div><div><b>02</b><span>${overseas ? "안전한 통관" : "빠른 산지출고"}</span><p>${overseas ? "개인통관부호를 주문별로 확인합니다." : "발주 마감 전 주문은 빠르게 출고합니다."}</p></div><div><b>03</b><span>판매 콘텐츠 제공</span><p>정사각형 썸네일과 상세설명을 함께 복사합니다.</p></div></div><div class="detail-info-board"><h3>상품 고시정보</h3><dl><div><dt>상품명</dt><dd>${escapeHtml(p.name)}</dd></div><div><dt>원산지</dt><dd>${escapeHtml(p.origin)}</dd></div><div><dt>공급사</dt><dd>${escapeHtml(p.supplier)}</dd></div><div><dt>보관방법</dt><dd>${escapeHtml(p.shelfLife || "상품별 표시사항 참조")}</dd></div><div><dt>배송</dt><dd>${overseas ? `해외직구 ${escapeHtml(p.deliveryDays)}` : `국내택배 ${escapeHtml(p.deliveryDays)}`}</dd></div><div><dt>반품</dt><dd>두고에서 요청 후 공급사 확인</dd></div></dl></div></div></section>
    <section class="detail-tab-panel" data-detail-panel="shipping" hidden><div class="detail-policy-grid"><article><span>배송</span><h3>${overseas ? "해외직구 배송" : "공급사 직배송"}</h3><p>${escapeHtml(p.deliveryDays || "1~3일")} 내 배송을 원칙으로 하며, 발주마감 ${escapeHtml(p.cutoff || "10:00")} 이전 결제 주문부터 순차 출고됩니다.</p></article><article><span>반품</span><h3>반품·교환 접수</h3><p>셀러의 취소·환불 메뉴에서 주문과 사유를 선택하면 공급사 확인 후 회수 또는 환불 절차가 진행됩니다.</p></article><article><span>주의</span><h3>${overseas ? "통관정보 확인" : "신선식품 확인"}</h3><p>${overseas ? "수취인의 개인통관부호가 일치하지 않으면 배송이 지연될 수 있습니다." : "신선식품은 단순 변심보다 파손·품질 이슈를 우선 확인합니다."}</p></article></div></section>
    <section class="detail-tab-panel" data-detail-panel="supplier" hidden><div class="detail-supplier-board"><span class="connection-avatar large">공</span><div><span>SUPPLIER PARTNER</span><h3>${escapeHtml(p.supplier)}</h3><p>${escapeHtml(supplier?.representative || "공급사 담당자")} · 승인 공급사</p></div><dl><div><dt>연락처</dt><dd>${escapeHtml(supplier?.contact || "-")}</dd></div><div><dt>이메일</dt><dd>${escapeHtml(supplier?.email || "-")}</dd></div><div><dt>상담시간</dt><dd>평일 09:00~18:00</dd></div><div><dt>공급상품</dt><dd>${state.products.filter(product => product.supplierLoginId === p.supplierLoginId).length}개</dd></div></dl><button class="primary-button" data-action="supplier-contact" data-id="${p.supplierLoginId}" data-product-id="${p.id}">두고톡으로 문의하기</button></div></section>
    <div class="sticky-detail-actions"><span><b>${money(p.supply)}</b> 공급가 · 재고 ${p.stock}개</span><div><button class="secondary-button" data-close-modal>닫기</button><button class="primary-button" data-action="${pickAction}" data-id="${p.id}">${pickLabel}</button></div></div>
  </div>`);
  document.querySelector("#modal .modal").classList.add("product-detail-modal");
}

function importModal(id) {
  const p = productOf(id);
  document.querySelector("#modal .modal").classList.remove("product-detail-modal");
  openModal(`<h2>두고 상품 PICK</h2><p>공급사 원본은 유지하고 썸네일·상세페이지 사본과 내 판매가를 ‘PICK 상품’에 보관합니다.</p>
    <form id="importForm" class="form-grid" data-id="${p.id}">
      <div class="copy-preview full">${productPhoto(p,"copy-preview-photo")}<div><span>복사할 원본 콘텐츠</span><b>${escapeHtml(p.name)}</b><small>AI 상품 썸네일 ✓ · 상세페이지 ✓ · 공급 옵션 ✓</small></div></div>
      <div class="form-field full"><label>내 판매 상품명</label><input name="customTitle" value="${escapeHtml(p.name)}" maxlength="100" required><small>쇼핑몰에는 이 상품명으로 등록되며 공급사 원본 상품코드 ${escapeHtml(p.id)}는 그대로 유지됩니다.</small></div>
      <div class="form-field full"><label>기본 판매가</label><input name="salePrice" type="number" value="${p.recommended}" min="${p.supply}"></div>
      <div class="calc-box"><span>공급가 ${money(p.supply)}</span><strong id="marginPreview">예상 마진율 ${margin(p.supply,p.recommended)}%</strong></div>
      <label class="auto-issue-check full"><input type="checkbox" name="copyContent" checked><span><b>썸네일·상세페이지 함께 복사</b><small>복사 시점의 콘텐츠를 PICK 상품에 저장합니다.</small></span></label>
      <div class="import-flow-note full"><b>다음 단계</b><span>PICK 상품에서 ‘쇼핑몰 자동등록’을 눌러 연결된 채널을 선택하세요.</span></div>
      <div class="modal-actions full"><button type="button" class="secondary-button" data-close-modal>취소</button><button type="submit" class="primary-button">PICK하기</button></div>
    </form>`);
}

function editSellerProductModal(sellerProductId) {
  const item = state.sellerProducts.find(product => product.id === sellerProductId);
  const source = item && productOf(item.productId);
  if (!item || !source) return;
  const value = (key, fallback = "") => escapeHtml(item?.[key] ?? fallback);
  const selected = (key, option, fallback = "") => (item?.[key] ?? fallback) === option ? "selected" : "";
  const channels = sellerChannels();
  openModal(`<div class="product-editor-head balju-product-head seller-product-editor-head"><div><span>DOOGO SELLER · PRODUCT EDITOR</span><h2>상품 수정</h2><p>발주오라형 단일 상품 편집 화면에서 판매명·가격·콘텐츠·배송·채널 정보를 관리합니다.</p></div><div class="editor-progress"><b>1 기본정보</b><b>2 판매가격</b><b>3 이미지·상세</b><b>4 배송·채널</b></div></div>
    <form id="sellerProductEditForm" class="product-editor-form balju-product-form seller-product-editor-form" data-id="${item.id}">
      <div class="source-code-lock seller-source-lock"><span>공급사 원본 상품 · 수정 잠금</span><b>${escapeHtml(source.id)} · ${escapeHtml(source.name)}</b><small>주문 매핑과 공급사 전달은 항상 이 DF 상품코드를 사용합니다. 아래 변경사항은 위탁셀러 판매 사본에만 저장됩니다.</small></div>
      <section class="editor-section"><div class="editor-section-title"><span>01</span><div><h3>상품 기본정보</h3><p>판매채널에 사용할 내 상품명과 관리 기준을 설정합니다.</p></div></div><div class="editor-grid cols-4">
        <div class="form-field span-3"><label>내 판매 상품명 *</label><input name="customTitle" value="${escapeHtml(sellerProductTitle(item, source))}" maxlength="100" required></div>
        <div class="form-field"><label>판매 상태 *</label><select name="status"><option ${selected("status","판매중","판매중")}>판매중</option><option ${selected("status","판매중지")}>판매중지</option><option ${selected("status","가져오기 완료")}>등록 준비중</option></select></div>
        <div class="form-field span-2"><label>셀러 관리코드</label><input name="managementCode" value="${value("managementCode", item.id)}" maxlength="50"></div>
        <div class="form-field"><label>내 카테고리</label><select name="sellerCategory"><option ${selected("sellerCategory","농산물",source.category)}>농산물</option><option ${selected("sellerCategory","수산물",source.category)}>수산물</option><option ${selected("sellerCategory","가공식품",source.category)}>가공식품</option><option ${selected("sellerCategory","건강식품",source.category)}>건강식품</option></select></div>
        <div class="form-field"><label>과세 구분</label><input value="${escapeHtml(source.tax || "과세")} · 공급사 원본" disabled></div>
        <div class="form-field span-2"><label>공급사 상품명</label><input value="${escapeHtml(source.name)}" disabled></div>
        <div class="form-field"><label>공급사 상품코드</label><input value="${escapeHtml(source.id)}" disabled></div>
        <div class="form-field"><label>원본 재고</label><input value="${Number(source.stock || 0).toLocaleString("ko-KR")}개" disabled></div>
      </div></section>
      <section class="editor-section"><div class="editor-section-title"><span>02</span><div><h3>매입·판매 가격</h3><p>공급가를 기준으로 내 기본 판매가와 소비자가를 설정합니다.</p></div></div><div class="purchase-strip seller-purchase-strip"><div><span>공급사</span><b>${escapeHtml(source.supplier)}</b></div><div><span>불변 공급가</span><b>${money(source.supply)}</b></div><div><span>공급 배송정책</span><b>${escapeHtml(source.shippingPolicy || "무료배송")}</b></div><div><span>예상 마진</span><b id="sellerProductMargin">${margin(source.supply, Number(item.salePrice || source.recommended))}%</b></div></div><div class="editor-grid cols-4 price-editor-grid">
        <div class="form-field"><label>공급가</label><input value="${source.supply}" disabled></div>
        <div class="form-field"><label>내 기본 판매가 *</label><input name="salePrice" type="number" value="${Number(item.salePrice || source.recommended)}" min="${source.supply}" required></div>
        <div class="form-field"><label>소비자가</label><input name="retailPrice" type="number" value="${Number(item.retailPrice || item.salePrice || source.recommended)}" min="0"></div>
        <div class="form-field"><label>원본 권장 판매가</label><input value="${Number(source.recommended || 0)}" disabled></div>
      </div><div class="api-safe-notice"><b>상품코드 매핑 유지</b><span>상품명과 판매가를 변경해도 외부 주문은 ${escapeHtml(source.id)} 코드로 ${escapeHtml(source.supplier)} 공급사 상품에 연결됩니다.</span></div></section>
      <section class="editor-section"><div class="editor-section-title"><span>03</span><div><h3>상품 이미지·상세설명</h3><p>공급사 콘텐츠 사본을 내 판매 방식에 맞게 편집합니다.</p></div></div><div class="image-picker">${Array.from({length:8},(_,index)=>`<label><input type="radio" name="imageIndex" value="${index}" ${Number(item.imageIndex ?? source.imageIndex ?? 0) === index ? "checked" : ""}><span>${productPhoto({name:`내 상품 이미지 ${index+1}`,imageIndex:index},"picker-photo")}<b>이미지 ${index+1}</b></span></label>`).join("")}</div><div class="editor-grid">
        <div class="form-field full balju-file-field"><label>내 상품 이미지 파일</label><input name="imageFile" type="file" accept="image/png,image/jpeg,image/webp"><small>프로토타입에서는 선택 상태만 확인하며, 저장 시 위 이미지 선택값을 사용합니다.</small></div>
        <div class="form-field full"><label>목록용 간략설명</label><input name="summaryOverride" value="${value("summaryOverride", source.summary || "")}" maxlength="100" placeholder="상품 목록에 표시할 설명"></div>
        <div class="form-field full"><label>내 상품 상세설명 *</label><textarea name="detailOverride" rows="8" maxlength="1500" required>${value("detailOverride", item.detailSnapshot || source.detail)}</textarea><small>공급사 원본 상세정보는 보존되며 이 내용은 내 판매 콘텐츠에만 적용됩니다.</small></div>
      </div></section>
      <section class="editor-section"><div class="editor-section-title"><span>04</span><div><h3>배송·판매채널 설정</h3><p>고객에게 표시할 배송 안내와 채널별 상품 정보를 함께 관리합니다.</p></div></div><div class="editor-grid cols-4">
        <div class="form-field"><label>내 배송정책</label><select name="shippingPolicyOverride"><option ${selected("shippingPolicyOverride","공급사 정책 사용",source.shippingPolicy || "공급사 정책 사용")}>공급사 정책 사용</option><option ${selected("shippingPolicyOverride","무료배송")}>무료배송</option><option ${selected("shippingPolicyOverride","조건부 무료")}>조건부 무료</option><option ${selected("shippingPolicyOverride","유료배송 3,000원")}>유료배송 3,000원</option></select></div>
        <div class="form-field"><label>표시 택배사</label><select name="carrierOverride"><option ${selected("carrierOverride","공급사 지정 택배",source.carrier || "공급사 지정 택배")}>공급사 지정 택배</option><option ${selected("carrierOverride","한진택배")}>한진택배</option><option ${selected("carrierOverride","CJ대한통운")}>CJ대한통운</option><option ${selected("carrierOverride","롯데택배")}>롯데택배</option></select></div>
        <div class="form-field"><label>표시 배송기간</label><input name="deliveryDaysOverride" value="${value("deliveryDaysOverride", source.deliveryDays || "1~3일")}"></div>
        <div class="form-field"><label>원산지</label><input value="${escapeHtml(source.origin || source.originCountry || "대한민국")} · 원본" disabled></div>
        <div class="form-field span-2"><label>반품·교환 안내</label><input name="returnPolicy" value="${value("returnPolicy","공급사 반품 정책에 따름")}"></div>
        <div class="form-field span-2"><label>해외상품 통관 안내</label><input value="${source.shippingType === "overseas" ? "개인통관고유부호 필수" : "국내배송 상품 · 해당 없음"}" disabled></div>
      </div><div class="seller-channel-editor"><div class="balju-table-title"><b>판매채널별 상품 정보</b><span>연동된 채널마다 상품명·가격·카테고리를 별도로 저장합니다.</span></div>${channels.map(channel => { const detail = sellerChannelDetail(item, channel, source); return `<article><span>${channelMark(channel.id)}</span><div><b>${escapeHtml(channel.name)}</b><small>${escapeHtml(sellerProductChannelStatus(item, channel))}</small></div><label>상품명<input name="channelTitle__${channel.id}" value="${escapeHtml(detail.title)}"></label><label>판매가<input name="channelPrice__${channel.id}" type="number" min="${source.supply}" value="${Number(detail.salePrice || item.salePrice)}"></label><label>카테고리<input name="channelCategory__${channel.id}" value="${escapeHtml(detail.category || item.sellerCategory || source.category)}"></label></article>`; }).join("")}</div></section>
      <div class="editor-sticky-actions"><span>공급사 원본은 변경되지 않으며 셀러 판매 사본만 저장됩니다.</span><div><button type="button" class="secondary-button" data-close-modal>취소</button><button type="submit" class="primary-button">상품 수정 저장</button></div></div>
    </form>`);
  document.querySelector("#modal .modal").classList.add("product-editor-modal", "seller-product-editor-modal");
}

function externalOrderModal() {
  openModal(`<div class="external-order-head"><span>MARKETPLACE ORDER</span><h2>외부 주문 불러오기</h2><p>쿠팡·스마트스토어 등에서 들어온 상품명을 그대로 등록한 뒤 공급사 상품에 매핑합니다.</p></div>
    <form id="externalOrderForm" class="form-grid order-form">
      <div class="form-field full"><label>외부몰 상품명 *</label><input name="externalProductName" value="쿠팡 판매상품 샘플" placeholder="판매채널에 등록한 상품명" required></div>
      <div class="form-field"><label>외부 상품코드</label><input name="externalProductCode" value="CP-${String(Date.now()).slice(-6)}" placeholder="쿠팡 sellerProductId 등"></div>
      <div class="form-field"><label>판매채널 *</label><select name="channel"><option>쿠팡</option><option>네이버 스마트스토어</option><option>카카오 쇼핑</option><option>CAFE24</option></select></div>
      <div class="form-field"><label>판매금액 *</label><input name="amount" type="number" value="29900" min="100" required></div>
      <div class="form-field"><label>수량 *</label><input name="qty" type="number" value="1" min="1" required></div>
      <div class="form-field"><label>주문자명 *</label><input name="customer" value="쿠팡 고객" required></div>
      <div class="form-field"><label>수취인 *</label><input name="recipientName" value="홍두고" required></div>
      <div class="form-field"><label>연락처 *</label><input name="phone" value="010-1234-5678" inputmode="tel" required></div>
      <div class="form-field"><label>우편번호 *</label><input name="postalCode" value="06236" inputmode="numeric" required></div>
      <div class="form-field full"><label>주소 *</label><input name="address" value="서울특별시 강남구 테헤란로 152" required></div>
      <div class="form-field full"><label>상세주소</label><input name="addressDetail" value="두고빌딩 7층"></div>
      <div class="form-field full"><label>배송 메시지</label><input name="deliveryMessage" value="문 앞에 놓아주세요."></div>
      <div class="mapping-flow-note full"><b>등록 후 흐름</b><span>신규주문 → 공급사 상품 매핑 → 공급가 결제 → 해당 공급사 신규주문 자동 전달</span></div>
      <div class="modal-actions full"><button type="button" class="secondary-button" data-close-modal>취소</button><button type="submit" class="primary-button">신규주문으로 불러오기</button></div>
    </form>`);
}

function orderMappingModal(orderId) {
  const order = state.orders.find(item => item.id === orderId);
  if (!order) return;
  const connectedSupplierIds = new Set(currentSellerConnections().map(connection => connection.supplierLoginId));
  const products = state.products.filter(product => product.status === "판매중" && connectedSupplierIds.has(product.supplierLoginId));
  if (!products.length) return showToast("먼저 거래처 연결에서 공급사 코드를 등록해 주세요.");
  openModal(`<div class="mapping-modal-head"><span>PRODUCT CODE MAPPING</span><h2>공급사 상품 매핑</h2><p>외부몰 상품명과 관계없이 선택한 공급사 원본 상품코드로 주문을 연결합니다.</p></div>
    <div class="external-order-summary"><span>외부 주문 상품</span><b>${escapeHtml(order.externalProductName || "상품명 미확인")}</b><small>${escapeHtml(order.channel)} · 외부코드 ${escapeHtml(order.externalProductCode || "-")} · ${order.qty}개</small></div>
    <form id="orderMappingForm" class="form-grid" data-id="${order.id}">
      <div class="form-field full"><label>공급사 원본 상품 *</label><select name="productId" required>${products.map(product => `<option value="${product.id}" ${product.id === (order.mappedProductId || order.productId) ? "selected" : ""}>${escapeHtml(product.supplier)} · ${product.id} · ${escapeHtml(product.name)} · 공급가 ${money(product.supply)}</option>`).join("")}</select></div>
      <div class="mapping-code-card full"><span>매핑 기준</span><b>상품명 대신 DF-코드를 저장합니다.</b><small>셀러가 상품명·판매가를 변경해도 공급사 주문 전달 대상은 변하지 않습니다.</small></div>
      <div class="modal-actions full"><button type="button" class="secondary-button" data-close-modal>취소</button><button type="submit" class="primary-button">상품코드 매핑 저장</button></div>
    </form>`);
}

function productMappingFormModal(prefill = {}) {
  const connectedSupplierIds = new Set(currentSellerConnections().map(connection => connection.supplierLoginId));
  const products = state.products.filter(product => product.status === "판매중" && connectedSupplierIds.has(product.supplierLoginId));
  if (!products.length) return showToast("먼저 거래처 연결에서 공급사 코드를 등록해 주세요.");
  const channels = ["쿠팡", "네이버 스마트스토어", "카카오 쇼핑", "CAFE24"];
  openModal(`<div class="mapping-modal-head"><span>PRODUCT MAPPING</span><h2>상품 매핑 설정</h2><p>외부 상품코드를 공급사 원본 상품에 연결합니다. 매핑 후에는 같은 상품코드의 신규 주문이 자동으로 연결됩니다.</p></div>
    <form id="productMappingForm" class="form-grid">
      <div class="form-field full"><label>외부 상품명 *</label><input name="externalProductName" value="${escapeHtml(prefill.externalProductName || "")}" placeholder="판매채널에 등록한 상품명" required></div>
      <div class="form-field"><label>외부 상품코드 *</label><input name="externalProductCode" value="${escapeHtml(prefill.externalProductCode || "")}" placeholder="쿠팡 sellerProductId 등" required></div>
      <div class="form-field"><label>판매채널</label><select name="channel">${channels.map(channel => `<option ${prefill.channel === channel ? "selected" : ""}>${channel}</option>`).join("")}</select></div>
      <div class="form-field full"><label>공급사 원본 상품 *</label><select name="productId" required>${products.map(product => `<option value="${product.id}">${escapeHtml(product.supplier)} · ${product.id} · ${escapeHtml(product.name)} · 공급가 ${money(product.supply)}</option>`).join("")}</select></div>
      <div class="mapping-code-card full"><span>매핑 안내</span><b>한 번 매핑하면 자동으로 유지됩니다.</b><small>같은 상품코드의 신규 주문은 이후 매핑 확인 없이 바로 결제 단계로 진행됩니다. 매핑을 바꾸려면 먼저 ‘매핑 해지’를 눌러주세요.</small></div>
      <div class="modal-actions full"><button type="button" class="secondary-button" data-close-modal>취소</button><button type="submit" class="primary-button">매핑 설정</button></div>
    </form>`);
}

function unmapProductMappingModal(mappingId) {
  const mapping = currentProductMappings().find(item => item.id === mappingId);
  if (!mapping) return;
  const product = productOf(mapping.productId);
  openModal(`<h2>매핑 해지</h2><p>${escapeHtml(mapping.externalProductName || "외부 상품")} · 외부코드 ${escapeHtml(mapping.externalProductCode)}<br>매핑을 해지하면 ${escapeHtml(product?.name || "연결된 공급사 상품")}과의 연결이 끊어지고, 같은 상품코드의 신규 주문은 다시 매핑이 필요합니다.</p>
    <form id="unmapProductMappingForm" data-id="${mapping.id}">
      <div class="modal-actions full"><button type="button" class="secondary-button" data-close-modal>취소</button><button type="submit" class="refund-button">매핑 해지</button></div>
    </form>`);
}

function orderPaymentModal(orderId) {
  const order = state.orders.find(item => item.id === orderId);
  const product = orderSourceProduct(order);
  if (!order || !product || orderMappingStatus(order) !== "mapped") return showToast("먼저 공급사 상품을 매핑해 주세요.");
  const supplyTotal = product.supply * Number(order.qty || 1);
  const deposit = sellerDeposit(order.sellerLoginId);
  openModal(`<div class="payment-modal-head"><span>SUPPLY PAYMENT</span><h2>공급가 결제</h2><p>결제가 완료되면 ${escapeHtml(product.supplier)} 공급사의 신규주문으로 즉시 전달됩니다.</p></div>
    <div class="payment-order-card">${productPhoto(product,"order-detail-photo")}<div><small>${escapeHtml(product.id)} · 불변 상품코드</small><b>${escapeHtml(product.name)}</b><span>${order.qty}개 · 공급가 합계 ${money(supplyTotal)}</span></div></div>
    <form id="orderPaymentForm" class="payment-method-form" data-id="${order.id}">
      <label class="payment-method-option"><input type="radio" name="paymentMethod" value="deposit" checked><span><b>두고머니 결제</b><small>현재 잔액 ${money(deposit.balance)}</small></span><strong>${deposit.balance >= supplyTotal ? "결제 가능" : "잔액 부족"}</strong></label>
      <label class="payment-method-option"><input type="radio" name="paymentMethod" value="card"><span><b>신용카드 결제</b><small>카드정보를 받지 않는 데모 승인</small></span><strong>데모</strong></label>
      <div class="payment-total"><span>공급가 결제금액</span><strong>${money(supplyTotal)}</strong></div>
      <div class="api-safe-notice"><b>데모 결제 안내</b><span>실제 카드 승인이나 외부 PG 호출 없이 주문 전달 흐름만 검증합니다.</span></div>
      <div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>취소</button><button type="submit" class="primary-button">결제하고 공급사에 전달</button></div>
    </form>`);
}

function sellerNoticesTemplate() {
  const list = state.notices || [];
  return `${sectionHero("공지사항", "두고 운영에 필요한 최근 업데이트와 안내를 확인하세요.")}<div class="panel notice-board">${list.length ? list.map(n => `<button type="button" class="notice-row" data-action="open-notice-detail" data-id="${n.id}"><b>${escapeHtml(n.title)}</b><span>${escapeHtml(n.date)}</span></button>`).join("") : `<div class="empty">등록된 공지사항이 없습니다.</div>`}</div>`;
}
function renderNoticeModal() {
  const list = state.notices || [];
  if (!list.length) return closeModal();
  noticeModalIndex = Math.min(Math.max(noticeModalIndex, 0), list.length - 1);
  const n = list[noticeModalIndex];
  openModal(`<div class="notice-popup">
    <div class="notice-popup-head"><span>DOOGO NOTICE</span><b>${escapeHtml(n.date)}</b></div>
    <h2>${escapeHtml(n.title)}</h2>
    <p>${escapeHtml(n.detail)}</p>
    ${n.action ? `<button type="button" class="secondary-button" data-action="${escapeHtml(n.action)}">${escapeHtml(n.cta || "바로가기")} →</button>` : ""}
    <div class="notice-popup-nav">
      <button type="button" class="text-button" data-action="notice-modal-nav" data-dir="prev" ${noticeModalIndex === 0 ? "disabled" : ""}>← 이전</button>
      <span>${noticeModalIndex + 1} / ${list.length}</span>
      <button type="button" class="text-button" data-action="notice-modal-nav" data-dir="next" ${noticeModalIndex === list.length - 1 ? "disabled" : ""}>다음 →</button>
    </div>
    <div class="modal-actions"><button class="secondary-button" type="button" data-close-modal>닫기</button></div>
  </div>`);
}
function noticeDetailModal(id) {
  const list = state.notices || [];
  const index = list.findIndex(n => n.id === id);
  noticeModalIndex = index >= 0 ? index : 0;
  renderNoticeModal();
}

function copiedContentModal(sellerProductId) {
  const item = state.sellerProducts.find(product => product.id === sellerProductId);
  const source = item && productOf(item.productId);
  if (!item || !source) return;
  openModal(`<div class="copied-content-view"><div class="copy-content-head">${productPhoto({ ...source, imageIndex: item.imageIndex },"copied-detail-photo")}<div><span>PICK 상품 콘텐츠 사본</span><h2>${escapeHtml(sellerProductTitle(item, source))}</h2><p>원본 ${escapeHtml(source.id)} · ${escapeHtml(item.channel || "쇼핑몰 등록 전")} · ${item.copiedAt} 복사</p></div></div><div class="copy-check-grid"><div><span>상품 썸네일</span><b>복사 완료 ✓</b></div><div><span>상세페이지</span><b>복사 완료 ✓</b></div><div><span>옵션·원산지</span><b>복사 완료 ✓</b></div><div><span>상품코드 연결</span><b>${escapeHtml(source.id)} 유지 ✓</b></div></div><div class="copied-detail-text"><span>복사된 상세설명</span><p>${escapeHtml(item.detailSnapshot || source.detail)}</p></div><div class="modal-actions"><button class="secondary-button" data-close-modal>닫기</button></div></div>`);
}

function supplierContactModal(supplierLoginId, productId = "") {
  const supplier = memberByLogin(supplierLoginId);
  const connection = state.connections.find(item => item.supplierLoginId === supplierLoginId && item.sellerLoginId === currentAccount.loginId);
  const product = productOf(productId);
  if (!supplier) return;
  const company = supplierName(supplierLoginId);
  openModal(`<div class="contact-modal-head"><span class="connection-avatar">공</span><div><span>DIRECT SUPPLIER CONTACT</span><h2>${escapeHtml(company)}</h2><p>연결된 공급사 담당자에게 두고 안에서 바로 문의합니다.</p></div><span class="live-dot">상담 가능</span></div><div class="contact-info-grid"><div><span>담당자</span><b>${escapeHtml(supplier.representative)}</b></div><div><span>전화</span><b>${escapeHtml(supplier.contact)}</b></div><div><span>이메일</span><b>${escapeHtml(supplier.email)}</b></div><div><span>운영시간</span><b>평일 09:00~18:00</b></div></div><form id="supplierInquiryForm" class="form-grid" data-supplier="${supplier.loginId}" data-seller="${currentAccount.loginId}"><input type="hidden" name="supplierLoginId" value="${supplier.loginId}"><input type="hidden" name="sellerLoginId" value="${currentAccount.loginId}"><div class="form-field full"><label>문의 상품</label><select name="productId"><option value="">일반 운영 문의</option>${state.products.filter(item => item.supplierLoginId === supplierLoginId).map(item => `<option value="${item.id}" ${item.id === product?.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></div><div class="form-field full"><label>문의 내용</label><textarea name="text" rows="4" placeholder="재고, 출고일, 상품 콘텐츠 등 문의 내용을 입력해 주세요." required>${product ? `${product.name} 상품의 출고 일정과 판매 콘텐츠를 확인하고 싶습니다.` : ""}</textarea></div><div class="api-safe-notice full"><b>내부 메시지</b><span>이 문의는 현재 브라우저 샘플 데이터에만 저장됩니다.</span></div><div class="modal-actions full"><button type="button" class="secondary-button" data-close-modal>닫기</button><button class="primary-button" type="submit">공급사에 문의 남기기</button></div></form>${connection ? `<p class="contact-connected-note">✓ ${escapeHtml(company)}와 정상 연결된 계정입니다.</p>` : ""}`);
}

function manageProductChannelsModal(sellerProductId) {
  const item = state.sellerProducts.find(product => product.id === sellerProductId);
  if (!item) return;
  const product = productOf(item.productId);
  const selected = item.channels || [];
  const channels = sellerChannels();
  const connectedCount = channels.filter(channel => channel.status === "connected").length;
  openModal(`<div class="auto-publish-head"><span>ONE CLICK PUBLISH</span><h2>쇼핑몰 상품 자동등록</h2><p>${escapeHtml(product?.name || "상품")}의 상품명·판매가·카테고리·상세 콘텐츠를 연결 쇼핑몰에 한 번에 등록합니다.</p><div><b>${connectedCount}개 쇼핑몰 등록 가능</b><small>미연동 채널은 ‘쇼핑몰 연동’에서 먼저 연결해 주세요.</small></div></div><form id="productChannelsForm" class="channel-check-list" data-id="${item.id}">${channels.map(channel => `<label class="${channel.status !== "connected" ? "disabled-channel" : ""}"><input type="checkbox" name="channels" value="${channel.id}" ${selected.includes(channel.id) ? "checked" : ""} ${channel.status !== "connected" ? "disabled" : ""}><span>${channelMark(channel.id)}<b>${escapeHtml(channel.name)}</b><small>${channel.status === "connected" ? `${escapeHtml(channel.storeName)} · ${selected.includes(channel.id) ? "현재 [판매중] · 다시 등록 가능" : "자동등록 가능"}` : channel.status === "pending" ? "[연동 대기] 승인 후 등록 가능" : "[미연동] 쇼핑몰 연동 필요"}</small></span></label>`).join("")}<div class="auto-publish-note"><b>등록되는 정보</b><span>상품명 · 판매가 · 원산지 · 카테고리 · 썸네일 · 상세페이지</span></div><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>취소</button><button class="primary-button" type="submit">선택 쇼핑몰 자동등록</button></div></form>`);
}

function orderDetailModal(orderId) {
  const order = state.orders.find(item => item.id === orderId);
  const product = orderSourceProduct(order);
  if (!order) return;
  const refund = state.refunds.find(item => item.orderId === order.id);
  const trackingStatuses = Object.entries(order.channelTrackingStatuses || {});
  const mapped = orderMappingStatus(order) === "mapped";
  const paid = orderPaymentStatus(order) !== "pending";
  const flow = ["신규주문", "주문접수", "발주완료", "배송준비중", "배송중", "배송완료"];
  const currentIndex = flow.indexOf(order.status);
  const timeline = flow.map((label, index) => `<div class="${index < currentIndex ? "done" : index === currentIndex ? "active" : ""}"><i>${index < currentIndex ? "✓" : index + 1}</i><span><b>${label}</b><small>${label === "신규주문" ? "판매채널 주문 수집" : label === "주문접수" ? "상품 매핑·공급가 결제" : label === "발주완료" ? "공급사 주문 전달" : label === "배송준비중" ? "공급사 확인·포장" : label === "배송중" ? "송장 등록·채널 전송" : "구매자 수령"}</small></span></div>`).join("");
  const sellerPrimary = !mapped
    ? `<button class="primary-button" data-action="map-order" data-id="${order.id}">상품 매핑</button>`
    : !paid
      ? `<button class="primary-button" data-action="pay-order" data-id="${order.id}">공급가 결제</button>`
      : ["신규주문", "주문접수"].includes(order.status)
        ? `<button class="primary-button" data-action="dispatch-supplier-order" data-id="${order.id}">공급사 발주하기</button>`
        : "";
  const supplierPrimary = ["신규주문", "발주완료"].includes(order.status)
    ? `<button class="primary-button" data-action="prepare-shipment" data-id="${order.id}">주문 확인·포장 시작</button>`
    : order.status === "배송준비중" && !order.tracking
      ? `<button class="primary-button" data-action="tracking" data-id="${order.id}">송장 입력</button>`
      : order.status === "배송중"
        ? `<button class="primary-button" data-action="complete-shipping" data-id="${order.id}">배송완료 처리</button>`
        : "";
  openModal(`<div class="order-detail-head"><div><span>DOOGO ORDER</span><h2>${order.id}</h2><p>${escapeHtml(order.createdAt)} · ${channelMark(channelIdFromName(order.channel),true)} ${escapeHtml(order.channel)}</p></div>${statusChip(order.status)}</div>
    <div class="order-status-timeline">${timeline}</div>
    <div class="order-product-summary">${productPhoto(product,"order-detail-photo")}<div><b>${escapeHtml(activeRole === "supplier" ? (product?.name || "상품") : orderSellerTitle(order))}</b><span>${order.qty}개 · ${money(order.amount)}</span><small>${mapped ? `원본코드 ${escapeHtml(order.mappedProductId || order.productId)} · ${escapeHtml(order.assignedSupplier || product?.supplier || "미배정")}` : `외부코드 ${escapeHtml(order.externalProductCode || "-")} · 상품 매핑 필요`}</small></div></div>
    ${activeRole === "seller" && mapped ? (() => {
      const supplyTotal = Number(product?.supply || 0) * Number(order.qty || 1);
      const unitSalePrice = Number(order.qty) ? order.amount / order.qty : order.amount;
      const marginPct = margin(product?.supply || 0, unitSalePrice);
      const netProfit = order.amount - supplyTotal;
      return `<section class="order-detail-section"><h3>수익 정보</h3><div class="mapping-detail-grid order-profit-grid"><div><span>공급가 결제</span><b>${money(supplyTotal)}</b></div><div><span>판매채널</span><b>${escapeHtml(order.channel)}</b></div><div><span>마진</span><b>${marginPct}%</b></div><div><span>순이익</span><b class="profit-positive">${money(netProfit)}</b></div></div></section>`;
    })() : ""}
    <section class="order-detail-section"><h3>상품 매핑·결제·발주</h3><div class="mapping-detail-grid"><div><span>외부몰 상품명</span><b>${escapeHtml(order.externalProductName || orderSellerTitle(order))}</b></div><div><span>공급사 원본코드</span><b>${mapped ? escapeHtml(order.mappedProductId || order.productId) : "매핑 전"}</b></div><div><span>공급가 결제</span><b>${paid ? `결제 완료 · ${escapeHtml(order.paymentMethod === "deposit" ? "두고머니" : order.paymentMethod === "card" ? "신용카드 데모" : "기존 주문")}` : "결제 대기"}</b></div><div><span>공급사 발주</span><b>${order.supplierLoginId ? `${escapeHtml(order.supplierOrderId || "발주번호 생성")} · ${escapeHtml(order.forwardedAt || "전달 완료")}` : paid ? "위탁셀러 발주 대기" : "결제 후 발주 가능"}</b></div></div></section>
    <details class="order-detail-section order-recipient-details"><summary><h3>수취인·배송 정보</h3><i>⌄</i></summary><div class="member-detail-grid"><div><span>성함</span><b>${escapeHtml(order.recipientName || order.customer)}</b></div><div><span>연락처</span><b>${escapeHtml(order.phone || "-")}</b></div><div class="full"><span>주소</span><b>(${escapeHtml(order.postalCode || "-")}) ${escapeHtml(order.address || "-")} ${escapeHtml(order.addressDetail || "")}</b></div><div class="full"><span>배송 메시지</span><b>${escapeHtml(order.deliveryMessage || "없음")}</b></div>${order.shippingType === "overseas" ? `<div class="full customs-field"><span>개인통관고유부호</span><b>${escapeHtml(order.personalCustomsCode || "미입력")}</b></div>` : ""}</div></details>
    <section class="order-detail-section"><h3>송장·판매채널 전송</h3><div class="tracking-summary"><span>${order.tracking ? "송장 반영 완료" : order.status === "배송준비중" ? "공급사 송장 입력 대기" : order.supplierLoginId ? "공급사 주문 확인 대기" : "공급사 발주 전"}</span><b>${order.tracking ? `${escapeHtml(order.carrier)} ${escapeHtml(order.tracking)}` : "아직 송장번호가 없습니다."}</b></div>${trackingStatuses.length ? `<div class="tracking-channel-statuses">${trackingStatuses.map(([channelId,status]) => `<div>${channelMark(channelId,true)}<span>${escapeHtml(channelMeta(channelId).name)}</span><b>${escapeHtml(status)}</b></div>`).join("")}</div>` : `<div class="channel-sync-empty">송장이 입력되면 연결된 판매채널에 자동 전송 상태가 표시됩니다.</div>`}</section>
    <div class="modal-actions"><button class="secondary-button" data-close-modal>닫기</button>${activeRole === "seller" ? sellerPrimary : activeRole === "supplier" ? supplierPrimary : ""}${activeRole === "seller" && !refund && !["배송완료", "환불완료"].includes(order.status) ? `<button class="refund-button" data-action="request-refund" data-id="${order.id}">취소·환불 요청</button>` : ""}</div>`);
  document.querySelector("#modal .modal").classList.add("order-detail-modal");
}

function refundRequestModal(orderId) {
  const order = state.orders.find(item => item.id === orderId);
  const product = productOf(order?.mappedProductId || order?.productId);
  if (!order) return;
  const supplyRefundAmount = Number(product?.supply || 0) * Number(order.qty || 1);
  openModal(`<div class="refund-request-head"><span>SELLER REFUND REQUEST</span><h2>취소 · 환불 요청</h2><p>${order.id} · ${escapeHtml(product?.name || "상품")}</p></div><form id="refundRequestForm" class="form-grid" data-id="${order.id}"><div class="form-field"><label>요청 유형</label><select name="type"><option>반품</option><option>주문 취소</option><option>교환</option></select></div><div class="form-field"><label>소비자 환불액</label><input name="consumerRefundAmount" type="number" value="${order.amount}" readonly><small>판매채널에서 소비자에게 돌려준 주문 금액</small></div><div class="form-field full money-refund-field"><label>두고머니 환급 예정액</label><input name="amount" type="number" value="${supplyRefundAmount}" readonly><small>공급가 ${money(product?.supply || 0)} × ${order.qty || 1}개 기준이며, 공급사 확정 후 충전됩니다.</small></div><div class="form-field full"><label>사유</label><select name="reason"><option>상품 파손</option><option>오배송</option><option>단순 변심</option><option>배송 지연</option></select></div><div class="form-field full"><label>상세 내용</label><textarea name="detail" rows="4" placeholder="상품 상태와 소비자 요청 내용을 구체적으로 입력해 주세요." required>소비자 환불 처리를 완료했습니다. 상품 상태 확인이 필요합니다.</textarea></div><label class="consumer-refund-confirm full"><input type="checkbox" name="consumerRefunded" required><span><b>판매채널에서 소비자 환불을 완료했습니다.</b><small>소비자 결제 환불은 판매채널에서 먼저 처리하고, 두고에서는 공급대금만 두고머니로 복구합니다.</small></span></label><div class="refund-rule-preview full"><div><b>반품 회수 건</b><span>택배 도착 → 공급사 입고 확인 → 두고머니 자동 충전</span></div><div><b>회수하지 않는 건</b><span>공급사 승인 → 두고머니 자동 충전</span></div></div><div class="api-safe-notice full"><b>정산 안전장치</b><span>위탁셀러가 임의로 환불완료 처리할 수 없으며, 확정 시 공급사 정산도 자동으로 0원 처리됩니다.</span></div><div class="modal-actions full"><button class="secondary-button" data-close-modal>취소</button><button class="refund-button" type="submit">공급사 확인 요청</button></div></form>`);
}

function refundProgressIndex(refund) {
  if (refund.status === "환불완료") return 5;
  if (refund.status === "공급사 입고확인 대기") return 4;
  if (refund.status === "반품 회수중") return 3;
  if (["공급사 검토중", "협의 필요"].includes(refund.status)) return 2;
  return 1;
}

function refundDetailModal(refundId) {
  const refund = state.refunds.find(item => item.id === refundId);
  const order = state.orders.find(item => item.id === refund?.orderId);
  if (!refund) return;
  const product = productOf(order?.mappedProductId || order?.productId);
  const completed = refund.status === "환불완료";
  const customer = order?.recipientName || order?.customer || "-";
  const progress = refundProgressIndex(refund);
  const returnMethod = refund.noPickup ? "공급사 승인 · 회수 없음" : refund.returnTracking ? `${refund.returnCarrier || "택배"} ${refund.returnTracking}` : "공급사 확인 후 결정";
  const steps = [["소비자 환불", refund.consumerRefundedAt || "완료"], ["두고 요청", refund.requestedAt || "접수"], ["회수·협의", refund.noPickup ? "회수 없음 승인" : refund.returnRequestedAt || refund.status], ["공급사 입고 확인", refund.supplierReceivedAt || (refund.returnDeliveredAt ? "택배 도착 · 확인 대기" : "대기")], ["두고머니·정산 확정", refund.completedAt || "대기"]];
  openModal(`<div class="refund-detail-head"><span>REFUND DETAIL</span><h2>${refund.id}</h2><p>${statusChip(refund.status)} · 주문 ${refund.orderId}</p></div><div class="refund-product-summary">${productPhoto(product,"order-detail-photo")}<div><b>${escapeHtml(product?.name || "상품")}</b><span>${order?.qty || 1}개 · 소비자 환불 ${money(refund.consumerRefundAmount || refund.amount)}</span><small>두고머니 ${money(refund.amount)} · ${escapeHtml(order?.channel || "판매채널 미확인")} · 주문일 ${escapeHtml(order?.orderDate || order?.createdAt || "-")}</small></div></div>${refund.consultationNote ? `<div class="refund-consult-note"><b>공급사 협의 요청</b><span>${escapeHtml(refund.consultationNote)}</span><button class="text-button" data-action="open-refund-chat" data-id="${refund.id}">두고톡에서 협의하기 →</button></div>` : ""}<div class="member-detail-grid refund-detail-grid"><div><span>주문자명</span><b>${escapeHtml(customer)}</b></div><div><span>연락처</span><b>${escapeHtml(order?.phone || "-")}</b></div><div><span>소비자 환불</span><b>${money(refund.consumerRefundAmount || refund.amount)} · ${refund.consumerRefunded ? `처리 완료 ${escapeHtml(refund.consumerRefundedAt || "-")}` : "미확인"}</b></div><div><span>두고머니 환급</span><b>${completed ? `${money(refund.amount)} 충전완료` : `${money(refund.amount)} 충전 대기`}</b></div><div><span>요청 유형</span><b>${escapeHtml(refund.type)}</b></div><div><span>요청 사유</span><b>${escapeHtml(refund.reason)}</b></div><div><span>회수 방식</span><b>${escapeHtml(returnMethod)}</b></div><div><span>공급사 정산</span><b>${completed ? "지급 대상 제외 · 0원" : "확정 전 보류"}</b></div><div class="full"><span>상세 내용</span><b>${escapeHtml(refund.detail)}</b></div><div class="full"><span>반품 회수지</span><b>${refund.noPickup ? "회수하지 않음" : escapeHtml(order ? `(${order.postalCode || "-"}) ${order.address || ""} ${order.addressDetail || ""}` : "-")}</b></div></div>${refund.returnTracking ? `<div class="return-tracking-box"><span>반품 송장</span><b>${escapeHtml(refund.returnCarrier || "택배사")} ${escapeHtml(refund.returnTracking)}</b><small>${refund.returnDeliveredAt ? `택배 도착 ${escapeHtml(refund.returnDeliveredAt)} · 공급사 입고 확인 ${refund.supplierReceived ? "완료" : "대기"}` : "반품 회수중"}</small></div>` : ""}<div class="refund-timeline refund-timeline-five">${steps.map(([label,time], index) => { const step = index + 1; const stepClass = completed || progress > step ? "done" : progress === step ? "active" : ""; return `<div class="${stepClass}"><i></i><b>${label}</b><span>${escapeHtml(time)}</span></div>`; }).join("")}</div><div class="modal-actions"><button class="secondary-button" data-close-modal>닫기</button>${activeRole === "supplier" && refund.status === "공급사 입고확인 대기" ? `<button class="primary-button" data-action="confirm-return-receipt" data-id="${refund.id}">반품 입고 확인</button>` : ""}${refund.status === "협의 필요" ? `<button class="primary-button" data-action="open-refund-chat" data-id="${refund.id}">두고톡 협의</button>` : ""}</div>`);
}

function refundConsultModal(refundId) {
  const refund = state.refunds.find(item => item.id === refundId);
  const order = state.orders.find(item => item.id === refund?.orderId);
  const product = productOf(order?.mappedProductId || order?.productId);
  if (!refund) return;
  openModal(`<div class="refund-request-head"><span>DOOGO TALK CONSULTATION</span><h2>셀러와 환불 협의</h2><p>${refund.id} · ${escapeHtml(product?.name || refund.orderId)}</p></div><form id="refundConsultForm" class="form-grid" data-id="${refund.id}"><div class="form-field full"><label>협의가 필요한 내용</label><textarea name="note" rows="5" required placeholder="예: 상품 사진을 확인한 뒤 회수 여부를 결정하겠습니다.">${escapeHtml(refund.consultationNote || "상품 상태 사진과 포장 상태를 확인한 뒤 회수 여부를 결정하겠습니다.")}</textarea></div><div class="api-safe-notice full"><b>대화방 기준</b><span>주문마다 새 채팅방을 만들지 않고, 기존 거래처별 두고톡 한 곳에 주문번호와 함께 기록합니다.</span></div><div class="modal-actions full"><button class="secondary-button" data-close-modal>취소</button><button class="primary-button" type="submit">두고톡에 협의 요청</button></div></form>`);
}

function finalizeRefund(refund, options = {}) {
  if (!refund || refund.status === "환불완료") return null;
  const noPickup = Boolean(options.noPickup);
  refund.status = "환불완료";
  refund.noPickup = noPickup;
  refund.supplierReceived = true;
  refund.supplierReceivedAt = options.supplierReceivedAt || "방금 전";
  refund.depositCredited = true;
  refund.supplierSettlementOffset = true;
  refund.responsibility = noPickup ? "공급사 승인 · 회수 없음" : "반품 입고 확인 완료";
  refund.completedAt = "방금 전";
  const deposit = sellerDeposit(refund.sellerLoginId);
  if (!deposit.transactions.some(item => item.reference === refund.id)) {
    deposit.balance += Number(refund.amount || 0);
    deposit.totalRefunded += Number(refund.amount || 0);
    deposit.pending = Math.max(0, deposit.pending - Number(refund.amount || 0));
    deposit.transactions.unshift({ id: `DP-${Date.now()}`, type: "환불 충전", amount: refund.amount, reference: refund.id, createdAt: "방금 전" });
  }
  const order = state.orders.find(item => item.id === refund.orderId);
  if (order) { order.status = "환불완료"; order.settlementStatus = "excluded"; }
  const product = productOf(order?.mappedProductId || order?.productId);
  pushNotification(refund.sellerLoginId, "seller", "refund", "환불 공급대금이 두고머니로 충전되었습니다", `${product?.name || refund.orderId} · ${order?.qty || 1}개 · 두고머니 ${money(refund.amount)} · 공급사 정산 제외`);
  audit("환불 두고머니 지급·정산 제외", `${refund.id} · ${product?.name || refund.orderId} · ${noPickup ? "회수 없음 승인" : "공급사 반품 입고 확인"} · 셀러 두고머니 ${money(refund.amount)} 충전, 공급사 정산 0원 처리`, "done", "refund");
  return { order, product };
}

function doogoMoneyContent() {
  const wallet = sellerDeposit();
  const bank = wallet.bankAccount;
  const transactions = wallet.transactions.slice(0, 8);
  return `<div class="doogo-money-balances"><button type="button" class="primary" data-action="open-doogo-money-history"><span>사용 가능</span><strong>${money(wallet.balance)}</strong><small>구매·출금 가능 · 사용내역 보기 →</small></button><div><span>환불 처리중</span><strong>${money(wallet.pending)}</strong><small>공급사 입고 확인 전</small></div><div><span>출금 처리중</span><strong>${money(wallet.withdrawalPending)}</strong><small>은행 이체 결과 대기</small></div></div><section class="money-bank-card"><div><span>출금 계좌</span>${bank ? `<b>${escapeHtml(bank.bankName)} · •••• ${escapeHtml(bank.accountNumber.slice(-4))}</b><small>${escapeHtml(bank.holder)} · 계좌 확인 완료</small>` : `<b>등록된 계좌가 없습니다.</b><small>본인 또는 사업자 명의 계좌를 등록해 주세요.</small>`}</div><button class="secondary-button" data-action="edit-doogo-money-bank">${bank ? "계좌 변경" : "계좌 등록"}</button></section><button type="button" class="money-history-link" data-action="open-doogo-money-history"><span>📄</span><b>사용내역 확인</b><small>충전·사용·출금 전체 내역 보기</small><em>→</em></button>${bank ? `<form id="doogoMoneyWithdrawForm" class="money-withdraw-form"><label><span>출금 신청 금액</span><div><input name="amount" type="number" min="1000" max="${wallet.balance}" step="100" value="${wallet.balance}" required><b>원</b></div><small>신청 즉시 사용 가능 두고머니에서 차감되고, 이체 실패 시 자동 복구됩니다.</small></label><button class="primary-button" type="submit" ${wallet.balance < 1000 ? "disabled" : ""}>등록 계좌로 출금</button></form>` : `<div class="money-empty-action"><b>먼저 출금 계좌를 등록해 주세요.</b><button class="primary-button" data-action="edit-doogo-money-bank">출금 계좌 등록</button></div>`}<div class="money-usage-strip"><div><b>상품 공급대금</b><span>두고 주문 접수 시 사용</span></div><div><b>서비스 결제</b><span>정기구독·부가서비스에 사용</span></div><div><b>계좌 출금</b><span>등록 계좌로 환급 신청</span></div></div><section class="money-history"><div class="panel-head"><div><h3>두고머니 내역</h3><p>충전·사용·출금 상태가 원장에 남습니다.</p></div></div>${transactions.length ? transactions.map(item => `<div class="money-history-row"><span><b>${escapeHtml(item.type)}</b><small>${escapeHtml(item.reference || "두고머니")} · ${escapeHtml(item.createdAt || "-")}</small></span><strong class="${Number(item.amount) < 0 ? "minus" : "plus"}">${Number(item.amount) > 0 ? "+" : ""}${money(item.amount)}</strong></div>`).join("") : `<div class="empty">두고머니 내역이 없습니다.</div>`}</section>${wallet.withdrawals.length ? `<section class="withdrawal-list"><h3>출금 진행 내역</h3>${wallet.withdrawals.slice(0,4).map(item => `<div><span><b>${escapeHtml(item.bankName)} •••• ${escapeHtml(item.accountLast4)}</b><small>${escapeHtml(item.requestedAt)} · ${escapeHtml(item.status)}</small></span><strong>${money(item.amount)}</strong>${item.status === "이체 처리중" ? `<em><button class="text-button" data-action="complete-withdrawal-demo" data-id="${item.id}">이체 성공</button><button class="text-button danger" data-action="fail-withdrawal-demo" data-id="${item.id}">이체 실패</button></em>` : ""}</div>`).join("")}</section>` : ""}<div class="api-safe-notice"><b>프로토타입 안내</b><span>현재는 실제 은행 계좌 확인·이체를 실행하지 않습니다. 운영 적용 시 전자금융업자 또는 지급대행사의 계좌 인증·이체 결과 웹훅과 연결해야 합니다.</span></div>`;
}
function doogoMoneyModal() {
  openModal(`<div class="doogo-money-head"><span>DOOGO MONEY</span><h2>두고머니</h2><p>환불금은 공급사 입고 확인 후 두고머니로 충전되며, 공급대금 결제 또는 등록 계좌 출금에 사용할 수 있습니다.</p></div>${doogoMoneyContent()}<div class="modal-actions"><button class="secondary-button" data-close-modal>닫기</button></div>`);
  document.querySelector("#modal .modal").classList.add("doogo-money-modal");
}
function sellerDoogoMoneyTemplate() {
  return `${sectionHero("두고머니", "환불 충전, 공급대금 결제, 계좌 출금까지 두고머니 흐름을 한 화면에서 확인합니다.")}<div class="panel doogo-money-page">${doogoMoneyContent()}</div>`;
}

function doogoMoneyHistoryModal() {
  const wallet = sellerDeposit();
  const transactions = wallet.transactions || [];
  openModal(`<div class="doogo-money-head"><span>DOOGO MONEY</span><h2>두고머니 사용내역</h2><p>충전·사용·출금이 발생한 순서대로 모두 표시합니다.</p></div><section class="money-history money-history-full">${transactions.length ? transactions.map(item => `<div class="money-history-row"><span><b>${escapeHtml(item.type)}</b><small>${escapeHtml(item.reference || "두고머니")} · ${escapeHtml(item.createdAt || "-")}</small></span><strong class="${Number(item.amount) < 0 ? "minus" : "plus"}">${Number(item.amount) > 0 ? "+" : ""}${money(item.amount)}</strong></div>`).join("") : `<div class="empty">두고머니 내역이 없습니다.</div>`}</section><div class="modal-actions"><button class="secondary-button" data-close-modal>닫기</button></div>`);
}
function doogoMoneyBankModal() {
  const bank = sellerDeposit().bankAccount || {};
  openModal(`<div class="doogo-money-head"><span>WITHDRAWAL ACCOUNT</span><h2>두고머니 출금 계좌</h2><p>환불금을 받을 본인 또는 사업자 명의 계좌를 등록합니다.</p></div><form id="doogoMoneyBankForm" class="form-grid"><div class="form-field"><label>은행</label><select name="bankName"><option ${bank.bankName === "국민은행" ? "selected" : ""}>국민은행</option><option ${bank.bankName === "신한은행" ? "selected" : ""}>신한은행</option><option ${bank.bankName === "우리은행" ? "selected" : ""}>우리은행</option><option ${bank.bankName === "하나은행" ? "selected" : ""}>하나은행</option><option ${bank.bankName === "농협은행" ? "selected" : ""}>농협은행</option><option ${bank.bankName === "카카오뱅크" ? "selected" : ""}>카카오뱅크</option></select></div><div class="form-field"><label>예금주</label><input name="holder" value="${escapeHtml(bank.holder || currentAccount?.representative || "위탁셀러")}" required></div><div class="form-field full"><label>계좌번호</label><input name="accountNumber" inputmode="numeric" value="${escapeHtml(bank.accountNumber || "")}" placeholder="숫자만 입력" pattern="[0-9]{10,16}" required></div><label class="consumer-refund-confirm full"><input type="checkbox" name="ownershipConfirmed" required><span><b>본인 또는 사업자 명의 계좌임을 확인했습니다.</b><small>실운영에서는 1원 인증 또는 오픈뱅킹 계좌 실명 확인 절차가 필요합니다.</small></span></label><div class="modal-actions full"><button class="secondary-button" data-action="open-doogo-money">취소</button><button class="primary-button" type="submit">계좌 확인·등록</button></div></form>`);
}

function channelConnectModal(channelId) {
  const channel = sellerChannels().find(item => item.id === channelId);
  if (!channel) return;
  openModal(`<div class="channel-modal-head">${channelMark(channel.id)}<div><h2>${escapeHtml(channel.name)} 연동 설정</h2><p>두고와 동기화할 범위를 선택합니다.</p></div></div><form id="channelConnectForm" class="form-grid" data-id="${channel.id}"><div class="form-field full"><label>쇼핑몰명</label><input name="storeName" value="${escapeHtml(channel.storeName === "미연결" || channel.storeName === "연결 확인중" ? "두고 셀러샵" : channel.storeName)}" required></div><div class="form-field"><label>API ID <small>데모 값</small></label><input name="apiId" value="DEMO-${channel.id.toUpperCase()}" required></div><div class="form-field"><label>Secret Key <small>저장 안 함</small></label><input name="secret" type="password" value="demo-secret" required></div><label class="auto-issue-check full"><input type="checkbox" name="orders" checked><span><b>신규 주문 자동 수집</b><small>실제 연결 전 판매채널별 승인과 검증이 필요합니다.</small></span></label><label class="auto-issue-check full"><input type="checkbox" name="tracking" checked><span><b>송장번호 자동 반영</b><small>공급사 출고 완료 후 채널 주문에 반영합니다.</small></span></label><div class="api-safe-notice full"><b>안전 모드</b><span>입력값은 서버나 외부 채널로 보내지 않으며 화면 상태만 저장합니다.</span></div><div class="modal-actions full"><button class="secondary-button" data-close-modal>취소</button><button class="primary-button" type="submit">테스트 연결</button></div></form>`);
}

function billingSettingsModal() {
  const subscription = state.subscriptions[currentAccount.loginId] || state.subscriptions.seller;
  const notice = notificationService();
  const total = subscription.monthlyFee + (notice.status === "active" ? notice.monthlyFee : 0);
  openModal(`<h2>결제수단 관리</h2><p>두고셀러 베이직 + 알림톡 부가서비스 · 월 ${money(total)}</p><div class="billing-card"><span>현재 결제수단</span><b>${escapeHtml(subscription.method)}</b><small>다음 결제 예정 ${escapeHtml(subscription.nextBilling)}</small></div><div class="api-safe-notice"><b>데모 결제</b><span>실제 카드 등록·승인·정기결제는 실행하지 않습니다.</span></div><div class="modal-actions"><button class="secondary-button" data-close-modal>닫기</button><button class="primary-button" data-action="demo-payment">새 결제수단 테스트</button></div>`);
}

function notificationTypeIcon(type) {
  return ({ order: "✓", tracking: "↗", refund: "↩", approval: "★", price: "₩", shipment: "↗", settlement: "₩" })[type] || "✓";
}

function renderNotificationDropdown() {
  const dropdown = document.getElementById("notificationDropdown");
  if (!dropdown || !currentAccount) return;
  const events = visibleNotifications();
  const unread = events.filter(item => !item.read).length;
  dropdown.innerHTML = `<div class="notification-dropdown-head"><div><b>알림</b><span>${unread ? `${unread}개 안읽음` : "새 알림 없음"}</span></div><button type="button" data-action="mark-notifications-read" ${unread ? "" : "disabled"}>모두 읽음</button></div>
    <div class="notification-dropdown-list">${events.length ? events.slice(0, 8).map(item => `<button type="button" class="notification-dropdown-item ${item.read ? "" : "unread"}" data-action="open-notification-item" data-id="${item.id}"><span class="notification-dropdown-icon ${item.type}">${notificationTypeIcon(item.type)}</span><span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.detail)}</small><em>${escapeHtml(item.createdAt)} · ${escapeHtml(notificationTypeLabel(item.type))}</em></span>${item.read ? "" : `<i aria-label="안 읽음"></i>`}</button>`).join("") : `<div class="notification-dropdown-empty"><span>🔔</span><b>새로운 알림이 없습니다.</b><small>주문·송장·환불 상태가 바뀌면 여기에 표시됩니다.</small></div>`}</div>
    <div class="notification-dropdown-footer"><button type="button" data-action="clear-notifications" ${events.length ? "" : "disabled"}>알림 전체 삭제</button>${activeRole === "seller" ? `<button type="button" data-action="manage-alert-plan">알림 설정</button>` : ""}</div>`;
}

function setNotificationDropdown(open) {
  const dropdown = document.getElementById("notificationDropdown");
  const button = document.getElementById("notificationButton");
  if (!dropdown || !button) return;
  if (open) renderNotificationDropdown();
  dropdown.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
}

function closeNotificationDropdown() {
  setNotificationDropdown(false);
}

function openNotificationItem(id) {
  const item = state.notificationEvents.find(event => event.id === id);
  if (!item) return;
  item.read = true;
  saveState();
  closeNotificationDropdown();
  const destinations = {
    seller: { order: 4, tracking: 4, shipment: 4, refund: 5, price: 7 },
    supplier: { order: 3, tracking: 3, shipment: 3, refund: 4, price: 6, settlement: 7 },
    master: { approval: 1, order: 6, tracking: 6, shipment: 6, refund: 7, price: 5 }
  };
  const destination = destinations[activeRole]?.[item.type];
  if (Number.isInteger(destination)) {
    activeMenuIndex = destination;
    render();
    updateAccountUI();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    updateAccountUI();
  }
}

function alertPlanModal() {
  const notice = notificationService();
  openModal(`<div class="alert-plan-modal"><span class="talk-symbol">TALK</span><h2>실시간 알림톡 부가서비스</h2><p>월 2,900원으로 신규 주문과 송장 등록을 카카오 알림톡·이메일로 안내합니다.</p><div class="alert-plan-price"><strong>2,900원</strong><span>/ 월</span><b>${notice.monthlyLimit}건 포함</b></div><ul><li>공급사 신규 주문 자동 배정 알림</li><li>위탁셀러 송장번호 등록 알림</li><li>이메일 동시 발송 설정</li><li>최근 알림 발송 이력 확인</li></ul><div class="api-safe-notice"><b>샘플 구독</b><span>실제 카카오 비즈메시지·결제 API는 호출하지 않습니다.</span></div><div class="modal-actions"><button class="secondary-button" data-close-modal>닫기</button><button class="primary-button" data-action="toggle-alert-plan">${notice.status === "active" ? "부가서비스 이용중" : "데모로 가입하기"}</button></div></div>`);
}

function userSwitchModal() {
  const roles = accountRoles();
  const application = latestSupplierApplication();
  const canUseSupplier = roles.includes("supplier");
  const statusCopy = application?.status === "pending" ? "요청 검토 중" : application?.status === "rejected" ? "요청 반려" : "요청 가능";
  const applicationPanel = canUseSupplier ? `<div class="switch-approved-note"><b>공급사 권한 승인 완료</b><span>같은 계정에서 위탁판매와 브랜드 공급 업무를 분리해 관리할 수 있습니다.</span></div>` : application?.status === "pending" ? `<div class="switch-review-state pending"><span>공급사 요청</span><b>요청 내용을 검토하고 있습니다</b><small>${escapeHtml(application.company)} · ${escapeHtml(application.appliedAt)} 접수</small></div>` : application?.status === "rejected" ? `<div class="switch-review-state rejected"><span>최근 검토 결과</span><b>공급사 요청이 반려되었습니다</b><small>${escapeHtml(application.rejectionReason || "반려 사유를 확인해 주세요.")}</small><button type="button" class="primary-button" data-action="open-supplier-application">내용 보완 후 다시 요청하기</button></div>` : `<div class="switch-review-state"><span>공급사 권한</span><b>브랜드사·제조사로 상품을 공급하시나요?</b><small>공급사 요청서를 제출하고 승인받으면 공급사 워크스페이스가 열립니다.</small><button type="button" class="primary-button" data-action="open-supplier-application">공급사 요청하기</button></div>`;
  openModal(`<div class="user-switch-modal"><div class="switch-modal-head"><span>⇄</span><div><h2>사용자 전환</h2><p>이동할 워크스페이스를 선택해 주세요. 선택 전에는 화면이 바뀌지 않습니다.</p></div></div><div class="workspace-choice-grid"><button type="button" class="workspace-choice ${activeRole === "seller" ? "current" : ""}" data-action="switch-workspace" data-role="seller"><span>셀</span><div><b>위탁셀러</b><small>상품 소싱 · 판매 · 주문 관리</small></div><em>${activeRole === "seller" ? "현재 사용 중" : "전환하기"}</em></button><button type="button" class="workspace-choice ${activeRole === "supplier" ? "current" : ""} ${canUseSupplier ? "" : "locked"}" ${canUseSupplier ? 'data-action="switch-workspace" data-role="supplier"' : "disabled"}><span>공</span><div><b>공급사</b><small>브랜드 상품 · 주문 · 송장 · 정산</small></div><em>${canUseSupplier ? (activeRole === "supplier" ? "현재 사용 중" : "전환하기") : statusCopy}</em></button></div>${applicationPanel}<div class="switch-policy"><b>권한 정책</b><p>일반 위탁셀러 계정에는 공급사 메뉴가 열리지 않습니다. 마스터 승인 후에만 사용자 전환에서 공급사 모드를 선택할 수 있습니다.</p></div><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>닫기</button></div></div>`);
}

function supplierApplicationModal() {
  const member = memberByLogin(currentAccount.loginId) || currentAccount;
  const previous = latestSupplierApplication();
  const attempt = Number(previous?.attempt || 0) + 1;
  openModal(`<div class="supplier-application-head"><span>BRAND PARTNER</span><h2>공급사 ${previous?.status === "rejected" ? "다시 요청하기" : "요청하기"}</h2><p>자체 브랜드·제조사 정보를 등록하면 두고 운영 기준에 따라 검토합니다.</p></div>${previous?.status === "rejected" ? `<div class="rejection-reason-box"><b>이전 반려 사유</b><p>${escapeHtml(previous.rejectionReason || "보완 후 다시 요청해 주세요.")}</p></div>` : ""}<form id="supplierApplicationForm" class="form-grid" data-attempt="${attempt}"><div class="form-field"><label>공급사 상호명 *</label><input name="company" value="${escapeHtml(previous?.company || member.supplierCompany || member.company)}" required></div><div class="form-field"><label>사업자등록번호 *</label><input name="businessNo" value="${escapeHtml(previous?.businessNo || member.businessNo)}" required></div><div class="form-field"><label>주요 공급 카테고리 *</label><select name="category" required><option>농수산물</option><option>가공식품</option><option>건강식품·브랜드 상품</option><option>해외직구 상품</option><option>기타</option></select></div><div class="form-field"><label>브랜드·회사 홈페이지</label><input name="website" value="${escapeHtml(previous?.website || "")}" placeholder="https://"></div><div class="form-field full"><label>공급 역량 및 브랜드 소개 *</label><textarea name="introduction" rows="5" required placeholder="생산·재고·출고 가능 범위와 주요 상품을 입력해 주세요.">${escapeHtml(previous?.introduction || "자체 브랜드 상품을 두고 위탁셀러에게 공급하고 싶습니다.")}</textarea></div><div class="form-field full"><label>사업자 증빙 *</label><input name="businessFile" type="file" accept=".pdf,.jpg,.jpeg,.png" required></div><label class="auto-issue-check full"><input type="checkbox" name="feeAgreement" required><span><b>거래 수수료 7% 정책에 동의합니다</b><small>두고를 통해 완료된 공급 거래의 정산 매출 기준으로 적용됩니다.</small></span></label><div class="api-safe-notice full"><b>검토 안내</b><span>반려되더라도 사유를 보완해 다시 요청할 수 있습니다.</span></div><div class="modal-actions full"><button type="button" class="secondary-button" data-action="open-user-switch">취소</button><button type="submit" class="primary-button">공급사 요청하기</button></div></form>`);
}

function supplierApplicationRejectModal(id) {
  const application = state.supplierApplications.find(item => item.id === id);
  if (!application) return;
  openModal(`<h2>공급사 전환 신청 반려</h2><p>${escapeHtml(application.company)}에 전달할 보완 사유를 구체적으로 작성해 주세요.</p><form id="supplierApplicationRejectForm" class="form-grid" data-id="${application.id}"><div class="form-field full"><label>반려 사유 *</label><textarea name="reason" rows="5" required placeholder="예: 공급 상품의 제조·유통 증빙이 부족합니다. 식품 관련 영업신고증과 브랜드 권한 서류를 보완해 주세요."></textarea></div><div class="api-safe-notice full"><b>재신청 가능</b><span>반려 사유는 신청자의 사용자 전환 화면에 표시되며, 보완 후 다시 심사를 요청할 수 있습니다.</span></div><div class="modal-actions full"><button type="button" class="secondary-button" data-close-modal>취소</button><button type="submit" class="small-button reject">사유 전달 및 반려</button></div></form>`);
}

function accountSettingsModal(tab = "profile") {
  const account = currentAccount;
  const company = activeRole === "supplier" ? (account.supplierCompany || account.company) : account.company;
  const titles = { profile: "정보 수정", mypage: "마이페이지 설정", business: "사업자 정보 수정" };
  const mypageFields = `<div class="form-field full"><label>스토어 표시명</label><input name="displayName" value="${escapeHtml(company)}"></div><div class="form-field"><label>알림 이메일</label><input name="email" value="${escapeHtml(account.email)}"></div><div class="form-field"><label>연락 가능 시간</label><input name="contactTime" value="${escapeHtml(account.contactTime || "평일 09:00~18:00")}"></div><div class="form-field"><label>공급사 노출 전화번호 <small>공급사와의 거래처 연결·주문 문의에 표시됩니다</small></label><input name="supplierVisiblePhone" value="${escapeHtml(account.supplierVisiblePhone || "")}" placeholder="010-0000-0000"></div>`;
  const profileFields = `<div class="form-field"><label>상호명</label><input name="company" value="${escapeHtml(company)}" ${tab === "business" ? "required" : ""}></div><div class="form-field"><label>대표자</label><input name="representative" value="${escapeHtml(account.representative)}"></div><div class="form-field"><label>연락처</label><input name="contact" value="${escapeHtml(account.contact)}"></div><div class="form-field"><label>이메일</label><input name="email" value="${escapeHtml(account.email)}"></div>`;
  const businessFields = `<div class="form-field"><label>사업자등록번호</label><input name="businessNo" value="${escapeHtml(account.businessNo)}"></div><div class="form-field"><label>업태</label><input name="businessType" value="${escapeHtml(account.businessType || "")}" placeholder="도소매업"></div><div class="form-field"><label>종목</label><input name="businessItem" value="${escapeHtml(account.businessItem || "")}" placeholder="전자상거래업"></div><div class="form-field full"><label>사업장 주소</label><input name="businessAddress" value="${escapeHtml(account.businessAddress || "")}" placeholder="사업장 소재지를 입력해 주세요"></div><div class="form-field full"><label>세금계산서 발행 이메일</label><input name="taxInvoiceEmail" type="email" value="${escapeHtml(account.taxInvoiceEmail || account.email || "")}" placeholder="tax@example.com"></div><div class="settings-subsection full"><b>정산 계좌 정보</b><small>두고머니 출금 및 정산 지급에 사용됩니다.</small></div><div class="form-field"><label>은행명</label><input name="bankName" value="${escapeHtml(account.bankName || "")}" placeholder="예: 국민은행"></div><div class="form-field"><label>계좌번호</label><input name="bankAccountNumber" value="${escapeHtml(account.bankAccountNumber || "")}" placeholder="계좌번호 입력"></div><div class="form-field full"><label>예금주</label><input name="bankAccountHolder" value="${escapeHtml(account.bankAccountHolder || account.representative || "")}"></div>`;
  openModal(`<div class="settings-tabs"><button class="${tab === "profile" ? "active" : ""}" data-action="account-tab" data-tab="profile">기본 정보</button><button class="${tab === "mypage" ? "active" : ""}" data-action="account-tab" data-tab="mypage">마이페이지</button><button class="${tab === "business" ? "active" : ""}" data-action="account-tab" data-tab="business">사업자 정보</button></div><h2>${titles[tab]}</h2><p>데모 계정의 설정을 확인하고 브라우저 안에서 수정합니다.</p><form id="accountSettingsForm" class="form-grid" data-tab="${tab}">${tab === "mypage" ? mypageFields : tab === "business" ? profileFields + businessFields : profileFields}<div class="modal-actions full"><button class="secondary-button" data-close-modal>취소</button><button class="primary-button" type="submit">설정 저장</button></div></form>`);
}

function goodflowSettingsModal() {
  const profile = goodflowProfile();
  openModal(`<div class="goodflow-modal-head"><span>G</span><div><small>GOODS FLOW · DELIVERY API</small><h2>굿스플로 택배 연동</h2><p>공급사 계정에 택배 계약정보를 연결하고 자동송장 범위를 설정합니다.</p></div></div><form id="goodflowSettingsForm" class="form-grid"><div class="form-field"><label>연동 상태</label><select name="status"><option value="connected" ${profile.status === "connected" ? "selected" : ""}>연동중</option><option value="disconnected" ${profile.status !== "connected" ? "selected" : ""}>미연동</option></select></div><div class="form-field"><label>택배사</label><select name="carrier"><option ${profile.carrier === "한진택배" ? "selected" : ""}>한진택배</option><option ${profile.carrier === "CJ대한통운" ? "selected" : ""}>CJ대한통운</option><option ${profile.carrier === "롯데택배" ? "selected" : ""}>롯데택배</option></select></div><div class="form-field full"><label>굿스플로 고객사 코드</label><input name="merchantId" value="${escapeHtml(profile.merchantId || "SANDI-DEMO")}" required></div><label class="auto-issue-check full"><input type="checkbox" name="autoTracking" ${profile.autoTracking ? "checked" : ""}><span><b>배송준비중 주문 자동송장 허용</b><small>버튼을 누른 주문에만 가송장을 생성하고 배송중으로 전환합니다.</small></span></label><div class="api-safe-notice full"><b>프로토타입 연동</b><span>계정과 상태만 브라우저에 저장되며 실제 굿스플로·택배사 API를 호출하지 않습니다.</span></div><div class="modal-actions full"><button type="button" class="secondary-button" data-close-modal>취소</button><button type="submit" class="primary-button">연동 설정 저장</button></div></form>`);
}

function trackingModal(orderId) {
  const order = state.orders.find(o => o.id === orderId), p = productOf(order.productId);
  openModal(`<h2>송장 출력 · 출고 처리</h2><p>${order.id} · ${p.name}<br>처리하면 두고의 셀러와 마스터 화면에 즉시 반영됩니다.</p>
    <form id="trackingForm" class="form-grid" data-id="${order.id}">
      <div class="form-field"><label>택배사</label><select name="carrier"><option>한진택배</option><option>CJ대한통운</option><option>롯데택배</option></select></div>
      <div class="form-field"><label>송장번호</label><input name="tracking" value="5057${String(Date.now()).slice(-8)}" required></div>
      <div class="calc-box"><span>셀러 · 마스터 화면</span><strong>즉시 반영</strong></div>
      <div class="calc-box" style="background:#fff5da;color:#8d6114"><span>판매채널 API</span><strong>반영 대기 · 실제 전송 없음</strong></div>
      <div class="modal-actions full"><button type="button" class="secondary-button" data-close-modal>취소</button><button type="submit" class="primary-button">송장 출력 및 반영</button></div>
    </form>`);
}

function shipmentCancelModal(orderId) {
  const order = state.orders.find(item => item.id === orderId);
  if (!order || order.status !== "배송중" || !order.provisionalTracking) return showToast("집하 전 자동발급 가송장만 취소할 수 있습니다.");
  openModal(`<h2>가송장 출고 취소</h2><p>${order.id} · ${escapeHtml(order.carrier)} ${escapeHtml(order.tracking)}<br>택배 집하 전 취소를 가정한 데모 흐름입니다.</p><form id="shipmentCancelForm" class="form-grid" data-id="${order.id}"><div class="form-field full"><label>취소 사유 *</label><select name="reason"><option>고객 출고 전 취소</option><option>재고 부족</option><option>주소 오류</option><option>상품 준비 지연</option></select></div><div class="form-field full"><label>공급사 메모</label><textarea name="memo" rows="4" required>집하 전 가송장을 취소하고 셀러에게 상태를 전달합니다.</textarea></div><div class="api-safe-notice full"><b>실운영 권장 로직</b><span>택배사 취소 성공을 먼저 확인한 뒤 출고취소로 변경해야 합니다. 이 데모는 외부 API를 호출하지 않습니다.</span></div><div class="modal-actions full"><button type="button" class="secondary-button" data-close-modal>닫기</button><button type="submit" class="refund-button">가송장 취소 처리</button></div></form>`);
}

function shipmentLabelModal(orderId, batchCount = 1) {
  const order = state.orders.find(item => item.id === orderId);
  const product = productOf(order?.productId);
  if (!order) return;
  const profile = state.shippingProfiles[order.supplierLoginId] || supplierProfile();
  openModal(`<div class="shipment-result"><div class="shipment-success">✓</div><h2>${batchCount > 1 ? `${batchCount}건 송장 자동발급 완료` : "송장 자동발급 완료"}</h2><p>두고 셀러 주문 화면에 즉시 반영했고 판매채널 전송은 안전 대기 로그만 저장했습니다.</p><div class="print-label" id="printLabel"><div class="print-label-head"><b>${escapeHtml(order.carrier)}</b><span>${escapeHtml(profile.labelFormat)}</span></div><strong class="tracking-big">${escapeHtml(order.tracking)}</strong><div class="barcode-lines">|||| ||| ||||| | |||| || |||||</div><dl><div><dt>주문번호</dt><dd>${order.id}</dd></div><div><dt>보내는 분</dt><dd>${escapeHtml(profile.sender)}</dd></div><div><dt>받는 분</dt><dd>${escapeHtml(order.recipientName || order.customer)}</dd></div><div><dt>주소</dt><dd>${escapeHtml(`${order.address || ""} ${order.addressDetail || ""}`)}</dd></div><div><dt>상품</dt><dd>${escapeHtml(product?.name || "상품")} · ${order.qty}개</dd></div></dl></div><div class="modal-actions"><button class="secondary-button" data-close-modal>닫기</button><button class="primary-button" data-action="print-label">송장 인쇄</button></div></div>`);
  document.querySelector("#modal .modal").classList.add("shipping-label-modal");
}

function autoIssueTracking(orderId, showResult = true) {
  const order = state.orders.find(item => item.id === orderId);
  if (!order || order.tracking) return;
  if (order.status !== "배송준비중") return showToast("주문 확인 후 배송준비중 상태에서 송장을 출력해 주세요.");
  const goodflow = state.goodflowConnections?.[order.supplierLoginId];
  if (!goodflow || goodflow.status !== "connected") return showToast("내 정보에서 굿스플로 택배 연동을 먼저 설정해 주세요.");
  const profile = state.shippingProfiles[order.supplierLoginId] || supplierProfile();
  const suffix = `${Date.now()}${order.id.replace(/\D/g, "")}`.slice(-10);
  order.carrier = profile.carrier;
  order.tracking = `50${suffix}`;
  order.status = "배송중";
  order.provisionalTracking = true;
  order.shippedAt = "방금 전";
  queueTrackingSync(order);
  const notice = state.notificationServices[order.sellerLoginId] || state.notificationServices.seller;
  if (notice?.status === "active" && notice.trackingNotice) { pushNotification(order.sellerLoginId, "seller", "tracking", "송장번호가 등록되었습니다", `${order.id} · ${order.carrier} ${order.tracking}`); notice.used += 1; }
  audit("송장 자동발급·출력", `${order.id} · ${order.carrier} ${order.tracking} · 공급사 계정 설정으로 자동 생성, 두고 셀러 즉시 반영, 활성 쇼핑몰 10분 자동전송 대기`, "pending", "tracking");
  saveState(); render(); updateAccountUI();
  if (showResult) shipmentLabelModal(order.id);
}

function autoIssueAllTracking() {
  const waiting = currentSupplierOrders().filter(order => order.status === "배송준비중" && !order.tracking);
  if (!waiting.length) return showToast("자동발급할 배송준비중 주문이 없습니다.");
  waiting.forEach(order => autoIssueTracking(order.id, false));
  shipmentLabelModal(waiting[0].id, waiting.length);
}

function registerProductModal() {
  productEditorModal();
}

function editProductModal(id) {
  const product = productOf(id);
  if (!product) return;
  productEditorModal(product);
}

function productEditorModal(product = null) {
  const isEdit = Boolean(product);
  const value = (key, fallback = "") => escapeHtml(product?.[key] ?? fallback);
  const selected = (key, option, fallback = "") => (product?.[key] ?? fallback) === option ? "selected" : "";
  const connected = currentSupplierConnections();
  openModal(`<div class="product-editor-head balju-product-head"><div><span>DOOGO · SINGLE PRODUCT</span><h2>${isEdit ? "상품 정보 수정" : "상품 등록"}</h2><p>${isEdit ? `${product.id} · 모든 수정 내용은 마스터 변경 이력에 저장됩니다.` : "발주오라 단일 상품등록 구조를 기준으로 매입·가격·배송·노출 정보를 한 번에 입력합니다."}</p></div><div class="editor-progress"><b>1 기본정보</b><b>2 매입·가격</b><b>3 이미지·안내</b><b>4 배송·노출</b></div></div>
    <form id="${isEdit ? "editProductForm" : "productForm"}" class="product-editor-form balju-product-form" ${isEdit ? `data-id="${product.id}"` : ""}>
      <section class="editor-section"><div class="editor-section-title"><span>01</span><div><h3>상품 기본정보</h3><p>상품 상태와 발주 기준을 설정합니다.</p></div></div><div class="editor-grid cols-4">
        <div class="form-field full category-cascade-field"><label>카테고리 * <small>네이버쇼핑 기준 대분류·중분류·소분류·세분류</small></label><div class="category-cascade-row">${(() => { const path = [product?.categoryGroup || "식품", product?.category || "", product?.categorySub || "", product?.categoryDetail || ""]; return `${categorySelectTag("categoryGroup", 1, path, "required")}${categorySelectTag("category", 2, path, "required")}${categorySelectTag("categorySub", 3, path, "required")}${categorySelectTag("categoryDetail", 4, path, "required")}`; })()}</div></div>
        <div class="form-field"><label>판매 상태 *</label><select name="status"><option ${selected("status","판매중","판매중")}>판매중</option><option ${selected("status","판매중지")}>판매중지</option></select></div>
        <div class="form-field"><label>과세 여부 *</label><select name="tax"><option ${selected("tax","과세","과세")}>과세</option><option ${selected("tax","비과세")}>비과세</option></select></div>
        <div class="form-field span-2"><label>상품코드</label><input value="${value("id", "등록 시 자동 생성")}" disabled></div>
        <div class="form-field"><label>품절 여부 *</label><select name="soldOut"><option value="판매가능" ${selected("soldOut","판매가능","판매가능")}>판매가능</option><option value="품절" ${selected("soldOut","품절")}>품절</option></select></div>
        <div class="form-field"><label>노출 여부 *</label><select name="exposure"><option value="노출" ${selected("exposure","노출","노출")}>노출</option><option value="미노출" ${selected("exposure","미노출")}>미노출</option></select></div>
        <div class="form-field span-3"><label>상품명 *</label><input name="name" value="${value("name")}" placeholder="예: 제주 레드키위 2kg" required></div>
        <div class="form-field"><label>발주 마감시간 *</label><input name="cutoff" type="time" value="${value("cutoff","10:00")}" required></div>
        <div class="form-field span-2"><label>발주 상품명</label><input name="orderName" value="${value("orderName")}" placeholder="비워두면 상품명과 동일"></div>
        <div class="form-field"><label>발주 단위</label><input name="orderUnit" type="number" value="${value("orderUnit",1)}" min="1"></div>
        <div class="form-field"><label>배송 유형 *</label><select name="shippingType"><option value="domestic" ${selected("shippingType","domestic","domestic")}>국내배송</option><option value="overseas" ${selected("shippingType","overseas")}>해외직구</option></select></div>
      </div></section>
      <section class="editor-section"><div class="editor-section-title"><span>02</span><div><h3>매입·판매 가격</h3><p>공급사 매입처와 셀러 공급가격을 구분합니다.</p></div></div><div class="purchase-strip"><div><span>기본 매입처</span><b>${escapeHtml(workspaceCompany("supplier"))}</b></div><div><span>매입 원가</span><input name="purchasePrice" type="number" value="${value("purchasePrice", product?.supply || 15900)}" min="100" required></div><div><span>매입 배송정책</span><input name="purchaseShipping" value="${value("purchaseShipping","공급사 직배송")}" required></div><div><span>부자재비</span><input name="surcharge" type="number" value="${value("surcharge",0)}" min="0"></div></div><div class="editor-grid cols-4 price-editor-grid">
        <div class="form-field"><label>공급가 *</label><input name="supply" type="number" value="${value("supply",15900)}" min="100" required></div><div class="form-field"><label>권장 판매가 *</label><input name="recommended" type="number" value="${value("recommended",22900)}" min="100" required></div><div class="form-field"><label>소비자가</label><input name="retailPrice" type="number" value="${value("retailPrice",29900)}" min="0"></div><div class="form-field"><label>판매 배송정책 *</label><select name="shippingPolicy"><option ${selected("shippingPolicy","무료배송","무료배송")}>무료배송</option><option ${selected("shippingPolicy","조건부 무료")}>조건부 무료</option><option ${selected("shippingPolicy","유료배송 3,000원")}>유료배송 3,000원</option></select></div>
      </div><div class="balju-partner-table"><div class="balju-table-title"><b>매출처/그룹 개별공급가 설정</b><span>연결 거래처별 노출 및 공급가</span></div><div class="balju-table-row heading"><span>타입</span><span>거래처명</span><span>공급가</span><span>판매 배송정책</span><span>노출</span></div><div class="balju-table-row"><span>기본</span><b>연결된 위탁셀러 전체</b><strong>${money(product?.supply || 15900)}</strong><span>${escapeHtml(product?.shippingPolicy || "무료배송")}</span><em>노출</em></div></div></section>
      <section class="editor-section"><div class="editor-section-title"><span>03</span><div><h3>상품 이미지·매출처 안내사항</h3><p>대표 이미지를 선택하고 셀러에게 복사될 상품정보를 입력합니다.</p></div></div><div class="image-picker">${Array.from({length:8},(_,index)=>`<label><input type="radio" name="imageIndex" value="${index}" ${(product?.imageIndex ?? 0) === index ? "checked" : ""}><span>${productPhoto({name:`AI 상품 이미지 ${index+1}`,imageIndex:index},"picker-photo")}<b>이미지 ${index+1}</b></span></label>`).join("")}</div><div class="editor-grid"><div class="form-field full balju-file-field"><label>상품 이미지 파일</label><input name="imageFile" type="file" accept="image/png,image/jpeg,image/webp"><small>JPG·PNG·WEBP, 10MB 이하. 파일을 선택하지 않으면 위 대표 이미지가 사용됩니다.</small></div><div class="form-field"><label>원산지</label><input name="origin" value="${value("origin","대한민국")}" placeholder="예: 제주특별자치도"></div><div class="form-field"><label>원산 국가</label><select name="originCountry"><option ${selected("originCountry","대한민국","대한민국")}>대한민국</option><option ${selected("originCountry","중국")}>중국</option><option ${selected("originCountry","뉴질랜드")}>뉴질랜드</option><option ${selected("originCountry","호주")}>호주</option></select></div><div class="form-field"><label>예상 배송기간</label><input name="deliveryDays" value="${value("deliveryDays","1~3일")}"></div><div class="form-field"><label>제조·수확일</label><input name="manufactureDate" value="${value("manufactureDate")}" placeholder="예: 주문일 기준 2일 이내"></div><div class="form-field"><label>소비기한·보관법</label><input name="shelfLife" value="${value("shelfLife","수령 후 냉장·냉동 보관")}"></div><div class="form-field full"><label>상품 간략설명</label><input name="summary" value="${value("summary")}" maxlength="100" placeholder="상품 목록에 표시할 100자 이내 설명"></div><div class="form-field full"><label>상품 상세설명 *</label><textarea name="detail" rows="8" maxlength="1000" required>${value("detail","센터배송 · 전 채널 판매 가능 · 상세페이지 제공")}</textarea><small>이 내용과 선택한 상품 이미지가 위탁셀러의 PICK 상품에 함께 복사됩니다.</small></div></div></section>
      <section class="editor-section"><div class="editor-section-title"><span>04</span><div><h3>배송·재고·노출</h3><p>물류정보와 연결 셀러 노출 범위를 설정합니다.</p></div></div><div class="editor-grid cols-4"><div class="form-field"><label>택배사</label><select name="carrier"><option ${selected("carrier","한진택배","한진택배")}>한진택배</option><option ${selected("carrier","CJ대한통운")}>CJ대한통운</option><option ${selected("carrier","롯데택배")}>롯데택배</option></select></div><div class="form-field"><label>창고</label><input name="warehouse" value="${value("warehouse","공급사 직배송")}"></div><div class="form-field"><label>초기 재고 *</label><input name="stock" type="number" value="${value("stock",100)}" min="0" required></div><div class="form-field"><label>단위</label><div class="unit-input"><input name="weight" type="number" value="${value("weight",1)}" min="0" step="0.1"><select name="unit"><option ${selected("unit","KG","KG")}>KG</option><option ${selected("unit","EA")}>EA</option><option ${selected("unit","BOX")}>BOX</option></select></div></div><div class="form-field"><label>관리코드</label><input name="managementCode" value="${value("managementCode")}" placeholder="최대 50자"></div><div class="form-field"><label>바코드</label><input name="barcode" value="${value("barcode")}" placeholder="영문·숫자 입력"></div><div class="form-field span-2"><label>상품 노출 범위</label><select name="visibility"><option value="연결 셀러" ${selected("visibility","연결 셀러","연결 셀러")}>연결 셀러 전체</option><option value="선택 셀러" ${selected("visibility","선택 셀러")}>선택 셀러만</option><option value="비노출" ${selected("visibility","비노출")}>비노출</option></select></div></div><div class="connected-visibility"><span>연결 거래처</span>${connected.length ? connected.map(connection=>`<b>✓ ${escapeHtml(memberByLogin(connection.sellerLoginId)?.company || connection.sellerLoginId)}</b>`).join("") : `<small>연결된 셀러가 없습니다.</small>`}</div></section>
      <div class="editor-sticky-actions"><span>필수항목을 확인한 뒤 저장해 주세요.</span><div><button type="button" class="secondary-button" data-close-modal>취소</button><button type="submit" class="primary-button">${isEdit ? "수정 내용 저장" : "상품 등록·셀러 노출"}</button></div></div>
    </form>`);
  document.querySelector("#modal .modal").classList.add("product-editor-modal");
}

function adjustStockModal(id) {
  const product = productOf(id);
  if (!product) return;
  openModal(`<h2>상품 재고 조정</h2><p>${escapeHtml(product.name)}의 현재 재고는 <b>${product.stock}개</b>입니다.</p>
    <form id="stockForm" class="form-grid" data-id="${product.id}">
      <div class="form-field"><label>현재 재고</label><input value="${product.stock}" disabled></div>
      <div class="form-field"><label>변경 재고</label><input name="stock" type="number" value="${product.stock}" min="0" required></div>
      <div class="form-field full"><label>조정 사유</label><input name="reason" placeholder="예: 신규 입고 50개" required></div>
      <div class="modal-actions full"><button type="button" class="secondary-button" data-close-modal>취소</button><button type="submit" class="primary-button">재고 반영</button></div>
    </form>`);
}

function simulateOrderModal(sellerProductId) {
  const sellerProduct = state.sellerProducts.find(item => item.id === sellerProductId);
  const product = sellerProduct && productOf(sellerProduct.productId);
  if (!sellerProduct || !product) return;
  const overseas = product.shippingType === "overseas";
  openModal(`<h2>단건 주문 접수</h2><p><span class="sample-order-badge">[샘플주문]</span> ${overseas ? `<b>해외직구 상품</b>으로 개인통관고유부호가 필요합니다.` : `원본 상품코드 <b>${escapeHtml(product.id)}</b>로 매핑한 뒤 공급가 결제를 진행합니다.`}</p>
    <form id="simulateOrderForm" class="form-grid order-form" data-id="${sellerProduct.id}">
      <div class="form-field full"><label>내 판매 상품</label><input value="${escapeHtml(sellerProductTitle(sellerProduct, product))} · 원본 ${escapeHtml(product.id)}" disabled></div>
      <div class="form-field"><label>주문자명 *</label><input name="customer" value="신규 고객" required></div>
      <div class="form-field"><label>수취인 성함 *</label><input name="recipientName" value="홍두고" required></div>
      <div class="form-field"><label>연락처 *</label><input name="phone" value="010-1234-5678" placeholder="010-0000-0000" required></div>
      <div class="form-field"><label>판매채널 *</label><select name="channel"><option selected>[샘플주문]</option><option>네이버 스마트스토어</option><option>쿠팡</option><option>카카오 쇼핑</option><option>CAFE24</option></select></div>
      <div class="form-field"><label>우편번호 *</label><div class="postcode-row"><input name="postalCode" value="06236" required><button type="button" data-action="open-address-popup">주소 검색</button></div></div>
      <div class="form-field"><label>수량 *</label><div class="qty-stepper"><button type="button" class="qty-step-btn" data-action="qty-step" data-step="-1" aria-label="수량 감소">−</button><input name="qty" type="number" value="1" min="1" max="${product.stock}" required><button type="button" class="qty-step-btn" data-action="qty-step" data-step="1" aria-label="수량 증가">+</button></div></div>
      <div class="form-field full"><label>주소 *</label><input name="address" value="서울특별시 강남구 테헤란로 152" required></div>
      <div class="form-field full"><label>상세주소</label><input name="addressDetail" value="두고빌딩 7층"></div>
      ${overseas ? `<div class="form-field full customs-input"><label>개인통관고유부호 *</label><input name="personalCustomsCode" value="P123456789012" pattern="P[0-9]{12}" placeholder="P로 시작하는 13자리" required><small>해외직구 주문에만 공급사에 전달됩니다.</small></div>` : `<input type="hidden" name="personalCustomsCode" value="">`}
      <div class="form-field full"><label>배송 메시지</label><input name="deliveryMessage" value="문 앞에 놓아주세요."></div>
      <div class="calc-box"><span>매핑 공급사</span><strong>${escapeHtml(product.supplier)}</strong></div><div class="calc-box"><span>판매 주문금액</span><strong>${money(sellerProduct.salePrice)}</strong></div>
      <div class="modal-actions full"><button type="button" class="secondary-button" data-close-modal>취소</button><button type="submit" class="primary-button">주문 접수 후 결제</button></div>
    </form>`);
}

function productHistoryModal(id) {
  const product = productOf(id);
  const logs = state.logs.filter(log => log.detail?.includes(id));
  openModal(`<h2>상품 변경 이력</h2><p>${escapeHtml(product?.name || id)} · ${id}</p><div class="activity-list history-list">${logs.length ? logs.map(log => `<div class="activity-item"><strong><span class="timeline-dot ${log.state}"></span>${escapeHtml(log.title)}</strong><p>${escapeHtml(log.detail)}<br>${escapeHtml(log.actor || "시스템")} · ${escapeHtml(log.time)}</p></div>`).join("") : `<div class="empty">저장된 변경 이력이 없습니다.</div>`}</div><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>닫기</button></div>`);
}

function changePriceModal(id) {
  const p = productOf(id);
  openModal(`<h2>공급가 변경</h2><p>변경 즉시 이 상품을 가져간 위탁셀러에게 가격 검토 알림이 생성됩니다.</p>
    <form id="priceForm" class="form-grid" data-id="${p.id}">
      <div class="form-field full"><label>상품</label><input value="${p.name}" disabled></div>
      <div class="form-field"><label>현재 공급가</label><input value="${p.supply}" disabled></div>
      <div class="form-field"><label>변경 공급가</label><input name="newPrice" type="number" value="${p.supply + 1000}" min="100" required></div>
      <div class="modal-actions full"><button type="button" class="secondary-button" data-close-modal>취소</button><button type="submit" class="primary-button">가격 변경 알림 생성</button></div>
    </form>`);
}

function reviewPriceModal(alertId) {
  const alert = state.priceAlerts.find(a => a.id === alertId), p = productOf(alert.productId);
  const sellerProduct = currentSellerProducts().find(x => x.productId === p.id);
  if (!sellerProduct) return showToast("먼저 이 상품을 PICK 상품에 보관해 주세요.");
  const channels = sellerChannels().filter(channel => sellerProductChannelStatus(sellerProduct, channel) !== "미연동");
  openModal(`<div class="channel-price-head"><span>CHANNEL PRICE CONTROL</span><h2>채널 판매가 일괄 변경</h2><p>${escapeHtml(p.name)}의 원가와 목표 마진율을 기준으로 채널별 판매가를 계산합니다.</p><div class="price-cost-summary"><span>이전 원가 <del>${money(alert.oldPrice)}</del></span><strong><small>현재 원가</small>${money(alert.newPrice)}</strong><button type="button" class="secondary-button" data-action="apply-recommended-prices" data-price="${p.recommended}">모두 권장가 적용</button></div></div>
    <form id="reviewPriceForm" class="channel-price-form" data-id="${alert.id}" data-supply="${alert.newPrice}">
      <div class="channel-price-table">
        <div class="channel-price-row heading"><span>반영</span><span>판매 채널 / 상태</span><span>현재 상품명 · 카테고리</span><span>현재 판매가</span><span>목표 마진율</span><span>변경 판매가</span><span>계산 마진</span></div>
        ${channels.map(channel => {
          const detail = sellerChannelDetail(sellerProduct, channel, p);
          const status = sellerProductChannelStatus(sellerProduct, channel);
          const currentMargin = margin(alert.newPrice, detail.salePrice);
          return `<div class="channel-price-row">
            <input type="checkbox" name="channels" value="${channel.id}" ${status === "판매중" ? "checked" : ""}>
            <span class="channel-price-channel">${channelMark(channel.id)}<b>${escapeHtml(channel.name)}</b><small>[${escapeHtml(status)}]</small></span>
            <span class="channel-price-copy"><b>${escapeHtml(detail.title)}</b><small>${escapeHtml(detail.category)} · ${detail.reviews} review${detail.reviews === 1 ? "" : "s"}</small></span>
            <span class="current-sale-price"><small>현재 판매가</small><b>${money(detail.salePrice)}</b></span>
            <label class="target-margin-field"><input class="channel-target-margin" name="margin_${channel.id}" type="number" min="-100" max="95" step="1" value="${currentMargin}" aria-label="${escapeHtml(channel.name)} 목표 마진율"><em>%</em></label>
            <label class="new-price-field"><span>변경 판매가</span><input class="channel-new-price" name="price_${channel.id}" type="number" min="0" step="100" value="${detail.salePrice}" required aria-label="${escapeHtml(channel.name)} 변경 판매가"></label>
            <strong class="calculated-margin"><small>마진</small><b>${currentMargin}%</b></strong>
          </div>`;
        }).join("")}
      </div>
      <div class="channel-price-note"><b>자동 계산</b><span>목표 마진율을 입력하면 현재 원가 기준 판매가가 100원 단위로 자동 계산됩니다. 판매가를 직접 바꾸면 마진율도 즉시 다시 계산됩니다.</span></div>
      <div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>취소</button><button type="submit" class="primary-button">선택 채널 판매가 변경</button></div>
    </form>`);
  document.querySelector("#modal .modal").classList.add("channel-price-modal");
}

function guideModal() {
  openModal(`<h2>두고 클릭 검증 흐름</h2><p>각 역할은 별도 계정으로 로그인합니다. 같은 브라우저의 샘플 데이터가 세 화면에 이어집니다.</p>
    <div class="guide-steps">
      <div class="guide-step"><span>1</span><div><b>두고 · 상품 PICK</b><small>상품과 상세페이지를 PICK 상품에 먼저 보관</small></div><b class="guide-account">seller</b></div>
      <div class="guide-step"><span>2</span><div><b>공급사에 직접 문의</b><small>상품별 문의를 남기고 공급사 계정에서 같은 메시지 확인</small></div><b class="guide-account">seller</b></div>
      <div class="guide-step"><span>3</span><div><b>주문 접수 · 자동 배정</b><small>수취인·주소·배송메시지·해외직구 통관정보 입력</small></div><b class="guide-account">seller</b></div>
      <div class="guide-step"><span>4</span><div><b>송장 자동발급 · 출력</b><small>공급사 계정 배송 설정으로 번호 생성 후 셀러 즉시 반영</small></div><b class="guide-account">sup</b></div>
      <div class="guide-step"><span>5</span><div><b>알림톡·이메일 미리보기</b><small>주문 배정은 공급사, 송장 등록은 셀러 알림함에 자동 생성</small></div><b class="guide-account">seller / sup</b></div>
      <div class="guide-step"><span>6</span><div><b>두고머니 환불 · 정산 제외</b><small>공급사 입고 확인 시 셀러 두고머니 충전, 공급사 지급 예정금 0원</small></div><b class="guide-account">seller / sup</b></div>
      <div class="guide-step"><span>7</span><div><b>복수 역할 전환</b><small>seller 계정 우측 메뉴에서 공급사 모드로 전환</small></div><b class="guide-account">seller</b></div>
      <div class="guide-step"><span>8</span><div><b>전체 운영 확인</b><small>회원·상품·주문·환불·변경 로그를 마스터에서 통합 조회</small></div><b class="guide-account">admin</b></div>
    </div>`);
}

function memberDetailModal(id) {
  const member = state.members.find(item => item.id === id);
  if (!member) return;
  const roles = member.roles?.length ? member.roles : [member.role];
  const suppliedProducts = roles.includes("supplier") ? state.products.filter(product => product.supplierLoginId === member.loginId) : [];
  const sellingProducts = roles.includes("seller") ? state.sellerProducts.filter(item => item.sellerLoginId === member.loginId).map(item => productOf(item.productId)).filter(Boolean) : [];
  const relatedProducts = [...suppliedProducts, ...sellingProducts.filter(product => !suppliedProducts.some(item => item.id === product.id))];
  const relatedOrders = state.orders.filter(order => (roles.includes("supplier") && order.supplierLoginId === member.loginId) || (roles.includes("seller") && order.sellerLoginId === member.loginId));
  const roleSummary = roles.map(role => roleLabel(role)).join(" + ");
  openModal(`<h2>사업자 회원 상세</h2><p>${memberStatusChip(member.status)} · ${escapeHtml(roleSummary)}${roles.length > 1 ? ' <span class="dual-role-badge">복수역할</span>' : ""}</p>
    <div class="member-detail-grid">
      <div><span>상호명</span><b>${escapeHtml(member.company)}</b></div><div><span>대표자명</span><b>${escapeHtml(member.representative)}</b></div>
      <div><span>사업자등록번호</span><b>${escapeHtml(member.businessNo)}</b></div><div><span>가입 아이디</span><b>${escapeHtml(member.loginId)}</b></div>
      <div><span>연락처</span><b>${escapeHtml(member.contact)}</b></div><div><span>이메일</span><b>${escapeHtml(member.email)}</b></div>
      <div><span>추천인 코드</span><b>${escapeHtml(member.referralCode || "기존 회원")}</b></div><div><span>마케팅 수신</span><b>${member.marketingConsent ? "동의" : "미동의"}</b></div>
      ${roles.length > 1 ? `<div><span>공급사 상호</span><b>${escapeHtml(member.supplierCompany || member.company)}</b></div><div><span>사용 가능 모드</span><b>위탁셀러 ↔ 공급사</b></div>` : ""}
      <div class="full"><span>사업자등록증</span><b>${escapeHtml(member.businessFile || "첨부 없음")}</b></div>
      <div class="full"><span>신청일</span><b>${escapeHtml(member.appliedAt)}</b></div>
      ${member.rejectReason ? `<div class="full reject-box"><span>반려 사유</span><b>${escapeHtml(member.rejectReason)}</b></div>` : ""}
    </div>
    <div class="linked-data-summary"><div><span>공급 등록 / 판매 선택</span><b>${suppliedProducts.length} / ${sellingProducts.length}개</b></div><div><span>연결 주문</span><b>${relatedOrders.length}건</b></div><div><span>처리 금액</span><b>${money(relatedOrders.reduce((sum, order) => sum + order.amount, 0))}</b></div></div>
    <div class="linked-data-list"><h3>연결된 운영 데이터</h3>${relatedProducts.length ? relatedProducts.map(product => `<div>${productPhoto(product,"linked-photo")}<b>${escapeHtml(product.name)}</b><small>${product.id} · 재고 ${product.stock}개</small></div>`).join("") : `<p>연결된 상품이 없습니다.</p>`}</div>
    <div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>닫기</button>${member.status === "pending" ? `<button type="button" class="primary-button" data-action="approve-member" data-id="${member.id}">가입 승인</button>` : ""}</div>`);
}

function rejectMemberModal(id) {
  const member = state.members.find(item => item.id === id);
  if (!member) return;
  openModal(`<h2>가입 신청 반려</h2><p>${escapeHtml(member.company)}의 신청을 반려하고 신청자에게 안내할 사유를 기록합니다.</p>
    <form id="rejectMemberForm" class="form-grid" data-id="${member.id}">
      <div class="form-field full"><label>반려 사유</label><input name="reason" placeholder="예: 사업자등록증 식별 불가" required></div>
      <div class="modal-actions full"><button type="button" class="secondary-button" data-close-modal>취소</button><button type="submit" class="primary-button">반려 처리</button></div>
    </form>`);
}

document.addEventListener("click", event => {
  const signupNext = event.target.closest("[data-signup-next]");
  if (signupNext) { if (validateSignupStep(signupStep)) setSignupStep(signupStep + 1); return; }
  const signupPrev = event.target.closest("[data-signup-prev]");
  if (signupPrev) { setSignupStep(signupStep - 1); return; }
  const signupNav = event.target.closest("[data-signup-step-nav]");
  if (signupNav) {
    const nextStep = Number(signupNav.dataset.signupStepNav);
    if (nextStep < signupStep || (nextStep === signupStep + 1 && validateSignupStep(signupStep))) setSignupStep(nextStep);
    return;
  }
  if (event.target.closest("[data-signup-login]")) { returnToLogin(); return; }
  if (event.target.closest("#mobileMenuButton")) { openMobileSidebar(); return; }
  if (event.target.closest("#mobileSidebarClose, #mobileSidebarBackdrop")) { closeMobileSidebar(true); return; }
  const accountButton = event.target.closest("#accountMenuButton");
  const accountDropdown = document.getElementById("accountDropdown");
  if (accountButton) {
    closeNotificationDropdown();
    const willOpen = accountDropdown.hidden;
    accountDropdown.hidden = !willOpen;
    accountButton.setAttribute("aria-expanded", String(willOpen));
    return;
  }
  const accountAction = event.target.closest("[data-account-action]");
  if (accountAction) {
    accountDropdown.hidden = true;
    document.getElementById("accountMenuButton").setAttribute("aria-expanded", "false");
    const action = accountAction.dataset.accountAction;
    if (action === "role-switch") { userSwitchModal(); return; }
    if (action === "subscription" && activeRole === "seller") { activeMenuIndex = 9; render(); updateAccountUI(); return; }
    return accountSettingsModal(action);
  }
  if (accountDropdown && !event.target.closest(".account-menu-wrap")) { accountDropdown.hidden = true; document.getElementById("accountMenuButton").setAttribute("aria-expanded", "false"); }
  if (!event.target.closest(".notification-center-wrap")) closeNotificationDropdown();
  const partnerTab = event.target.closest("[data-partner-role]");
  if (partnerTab) return setPartnerLoginRole(partnerTab.dataset.partnerRole);
  const partnerDemo = event.target.closest("[data-partner-demo]");
  if (partnerDemo) {
    const id = partnerDemo.dataset.partnerDemo === "master" ? "admin" : "sup";
    document.getElementById("partnerLoginId").value = id;
    document.getElementById("partnerLoginPassword").value = id;
    document.getElementById("partnerLoginError").textContent = "";
    return document.getElementById("partnerLoginPassword").focus();
  }
  if (event.target.closest("[data-close-modal]")) return closeModal();
  const jump = event.target.closest("[data-jump]")?.dataset.jump;
  if (jump) { closeModal(); return setRole(jump); }
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const { action, id } = target.dataset;
  if (action === "toggle-edit-mode") {
    if (!editMode) {
      dashboardEditSnapshot = [...(state.sellerDashboard?.layout || DEFAULT_DASHBOARD_LAYOUT)];
      dashboardDraftLayout = [...dashboardEditSnapshot];
      editMode = true;
    } else {
      state.sellerDashboard = { layout: [...sellerDashboardLayout()] };
      saveState();
      editMode = false;
      dashboardDraftLayout = null;
      dashboardEditSnapshot = null;
    }
    render(); updateAccountUI();
    showToast(editMode ? "위젯 편집 모드입니다. 드래그해 순서를 변경하세요." : "대시보드 배치를 저장했습니다.");
    return;
  }
  if (action === "save-dashboard-layout") {
    state.sellerDashboard = { layout: [...sellerDashboardLayout()] };
    saveState();
    editMode = false;
    dashboardDraftLayout = null;
    dashboardEditSnapshot = null;
    render(); updateAccountUI(); showToast("대시보드 위젯 배치를 저장했습니다.");
    return;
  }
  if (action === "cancel-dashboard-edit") {
    dashboardDraftLayout = dashboardEditSnapshot ? [...dashboardEditSnapshot] : [...(state.sellerDashboard?.layout || DEFAULT_DASHBOARD_LAYOUT)];
    editMode = false;
    dashboardDraftLayout = null;
    dashboardEditSnapshot = null;
    render(); updateAccountUI(); showToast("대시보드 편집을 취소했습니다.");
    return;
  }
  if (action === "reset-dashboard-layout") {
    dashboardDraftLayout = [...DEFAULT_DASHBOARD_LAYOUT];
    render(); updateAccountUI(); showToast("기본 위젯 배치로 되돌렸습니다. 저장하면 적용됩니다.");
    return;
  }
  if (action === "remove-dashboard-widget") {
    dashboardDraftLayout = sellerDashboardLayout().filter(widgetId => widgetId !== id);
    render(); updateAccountUI(); showToast("위젯을 숨겼습니다. 위젯 추가에서 다시 불러올 수 있습니다.");
    return;
  }
  if (action === "move-dashboard-widget") {
    const layout = [...sellerDashboardLayout()];
    const currentIndex = layout.indexOf(id);
    const nextIndex = target.dataset.direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= layout.length) return;
    [layout[currentIndex], layout[nextIndex]] = [layout[nextIndex], layout[currentIndex]];
    dashboardDraftLayout = layout;
    render(); updateAccountUI(); showToast("위젯 위치를 변경했습니다.");
    return;
  }
  if (action === "add-dashboard-widget") { dashboardWidgetPickerModal(); return; }
  if (action === "restore-dashboard-widget") {
    if (!dashboardDraftLayout) dashboardDraftLayout = [...sellerDashboardLayout()];
    if (!dashboardDraftLayout.includes(id) && DEFAULT_DASHBOARD_LAYOUT.includes(id)) dashboardDraftLayout.push(id);
    closeModal(); render(); updateAccountUI(); showToast("위젯을 대시보드에 추가했습니다.");
    return;
  }
  if (action === "reset-content-overrides") {
    state.contentOverrides = {};
    saveState(); render(); updateAccountUI(); showToast("셀러 화면 문구를 기본값으로 되돌렸습니다.");
    return;
  }
  if (editMode && event.target.closest("[data-edit-key]")) {
    event.preventDefault();
    event.stopPropagation();
    event.target.closest("[data-edit-key]").focus();
    return;
  }
  if (action === "open-dashboard") { event.preventDefault(); closeMobileSidebar(); activeMenuIndex = 0; render(); updateAccountUI(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  if (action === "open-user-switch") { userSwitchModal(); return; }
  if (action === "switch-workspace") { setRole(target.dataset.role); return; }
  if (action === "open-supplier-application") { supplierApplicationModal(); return; }
  if (action === "open-seller-channels") { activeMenuIndex = 8; render(); updateAccountUI(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  if (action === "open-seller-subscription") { activeMenuIndex = 9; render(); updateAccountUI(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  if (action === "open-doogo-money") { doogoMoneyModal(); return; }
  if (action === "open-doogo-money-history") { doogoMoneyHistoryModal(); return; }
  if (action === "edit-doogo-money-bank") { doogoMoneyBankModal(); return; }
  if (action === "complete-withdrawal-demo") {
    const wallet = sellerDeposit();
    const withdrawal = wallet.withdrawals.find(item => item.id === id);
    if (withdrawal?.status === "이체 처리중") {
      withdrawal.status = "출금완료";
      withdrawal.completedAt = "방금 전";
      wallet.withdrawalPending = Math.max(0, wallet.withdrawalPending - withdrawal.amount);
      audit("두고머니 계좌 출금 완료", `${withdrawal.id} · ${money(withdrawal.amount)} · ${withdrawal.bankName} •••• ${withdrawal.accountLast4}`, "done", "money");
      saveState(); render(); updateAccountUI(); doogoMoneyModal(); showToast("등록 계좌로 두고머니 출금을 완료했습니다.");
    }
    return;
  }
  if (action === "fail-withdrawal-demo") {
    const wallet = sellerDeposit();
    const withdrawal = wallet.withdrawals.find(item => item.id === id);
    if (withdrawal?.status === "이체 처리중") {
      withdrawal.status = "이체 실패 · 자동 복구";
      withdrawal.failedAt = "방금 전";
      wallet.withdrawalPending = Math.max(0, wallet.withdrawalPending - withdrawal.amount);
      wallet.balance += withdrawal.amount;
      wallet.transactions.unshift({ id: `DM-${Date.now()}`, type: "출금 실패 복구", amount: withdrawal.amount, reference: withdrawal.id, createdAt: "방금 전" });
      audit("두고머니 출금 실패 복구", `${withdrawal.id} · ${money(withdrawal.amount)}을 사용 가능 두고머니로 복구했습니다.`, "blocked", "money");
      saveState(); render(); updateAccountUI(); doogoMoneyModal(); showToast("이체 실패 금액을 사용 가능 두고머니로 복구했습니다.");
    }
    return;
  }
  if (action === "supplier-application-detail") { supplierApplicationDetailModal(id); return; }
  if (action === "reject-supplier-application") { supplierApplicationRejectModal(id); return; }
  if (action === "approve-supplier-application") {
    const application = state.supplierApplications.find(item => item.id === id);
    const member = memberByLogin(application?.sellerLoginId);
    if (!application || !member || application.status !== "pending") return;
    application.status = "approved"; application.reviewedAt = "방금 전"; application.rejectionReason = "";
    member.roles = [...new Set([...(member.roles || [member.role]), "seller", "supplier"])];
    member.supplierCompany = application.company;
    pushNotification(member.loginId, "seller", "approval", "공급사 모드가 승인되었습니다", `${application.company} · 사용자 전환에서 공급사 워크스페이스를 선택할 수 있습니다.`, ["운영센터"]);
    audit("공급사 모드 승인", `${application.company} · ${member.loginId} 계정에 공급사 권한을 추가했습니다.`, "done", "member");
    saveState(); closeModal(); render(); updateAccountUI(); showToast(`${application.company}의 공급사 권한을 승인했습니다.`); return;
  }
  if (action === "open-notifications") {
    if (accountDropdown) {
      accountDropdown.hidden = true;
      document.getElementById("accountMenuButton").setAttribute("aria-expanded", "false");
    }
    const dropdown = document.getElementById("notificationDropdown");
    setNotificationDropdown(dropdown?.hidden !== false);
    return;
  }
  if (action === "mark-notifications-read") {
    visibleNotifications().forEach(item => item.read = true);
    saveState();
    updateAccountUI();
    setNotificationDropdown(true);
    return;
  }
  if (action === "clear-notifications") {
    const visibleIds = new Set(visibleNotifications().map(item => item.id));
    state.notificationEvents = state.notificationEvents.filter(item => !visibleIds.has(item.id));
    saveState();
    updateAccountUI();
    setNotificationDropdown(true);
    showToast("현재 워크스페이스의 알림을 삭제했습니다.");
    return;
  }
  if (action === "open-notification-item") { openNotificationItem(id); return; }
  if (action === "goodflow-settings") { goodflowSettingsModal(); return; }
  if (action === "filter-supplier-orders") { supplierOrderStatus = target.dataset.status || "all"; render(); updateAccountUI(); return; }
  if (action === "settlement-tab") { supplierSettlementTab = target.dataset.tab || "scheduled"; render(); updateAccountUI(); return; }
  if (action === "open-supplier-products") { activeMenuIndex = 1; render(); updateAccountUI(); window.scrollTo({top:0,behavior:"smooth"}); return; }
  if (action === "open-supplier-connections") { activeMenuIndex = 2; render(); updateAccountUI(); window.scrollTo({top:0,behavior:"smooth"}); return; }
  if (action === "open-supplier-orders") { supplierOrderStatus = target.dataset.status || "all"; activeMenuIndex = 3; render(); updateAccountUI(); window.scrollTo({top:0,behavior:"smooth"}); return; }
  if (action === "open-master-section") { activeMenuIndex = Number(target.dataset.index || 0); render(); updateAccountUI(); window.scrollTo({top:0,behavior:"smooth"}); return; }
  if (action === "prepare-shipment") {
    const order = state.orders.find(item => item.id === id);
    if (order && ["신규주문", "발주완료"].includes(order.status)) { order.status = "배송준비중"; order.confirmedAt = "방금 전"; audit("공급사 주문 확인·포장 시작", `${order.id} · 배송준비중으로 변경했습니다.`, "pending", "order"); saveState(); closeModal(); render(); updateAccountUI(); showToast("주문을 확인하고 배송준비중으로 이동했습니다."); }
    return;
  }
  if (action === "dispatch-supplier-order") {
    const order = state.orders.find(item => item.id === id);
    const product = orderSourceProduct(order);
    if (!order || !product || orderMappingStatus(order) !== "mapped" || orderPaymentStatus(order) === "pending") return showToast("상품 매핑과 공급가 결제를 먼저 완료해 주세요.");
    order.supplierLoginId = product.supplierLoginId;
    order.assignedSupplier = product.supplier;
    order.status = "발주완료";
    order.forwardedAt = "방금 전";
    order.supplierOrderId = order.supplierOrderId || `PO-${String(Date.now()).slice(-8)}`;
    pushNotification(product.supplierLoginId, "supplier", "order", "신규 발주가 도착했습니다", `${order.id} · ${product.id} ${product.name} ${order.qty}개`);
    audit("공급사 발주 완료", `${order.id} · ${order.supplierOrderId} · ${product.supplier} 공급사에 주문을 전달했습니다.`, "done", "order");
    saveState(); closeModal(); render(); updateAccountUI(); showToast(`${product.supplier} 공급사에 발주를 완료했습니다.`);
    return;
  }
  if (action === "complete-shipping") {
    const order = state.orders.find(item => item.id === id);
    if (order?.status === "배송중") { order.status = "배송완료"; order.deliveredAt = "방금 전"; order.provisionalTracking = false; audit("배송 완료", `${order.id} · 배송완료 처리`, "done", "shipment"); pushNotification(order.sellerLoginId, "seller", "shipment", "배송이 완료되었습니다", `${order.id} · ${order.carrier} ${order.tracking}`); saveState(); render(); updateAccountUI(); showToast("배송완료로 변경했습니다."); }
    return;
  }
  if (action === "cancel-shipment") { shipmentCancelModal(id); return; }
  if (action === "manage-alert-plan") { closeNotificationDropdown(); alertPlanModal(); return; }
  if (action === "toggle-alert-plan") { const notice = notificationService(); notice.status = notice.status === "active" ? "paused" : "active"; audit("알림톡 부가서비스 변경", `${notice.plan} 상태를 ${notice.status === "active" ? "이용중" : "일시정지"}으로 변경했습니다.`, "done", "subscription"); saveState(); closeModal(); render(); updateAccountUI(); showToast(`알림톡 부가서비스를 ${notice.status === "active" ? "활성화" : "일시정지"}했습니다.`); return; }
  if (action === "toggle-notice-setting") { const notice = notificationService(); const setting = target.dataset.setting; if (["orderNotice","trackingNotice"].includes(setting)) notice[setting] = !notice[setting]; audit("알림톡 수신 설정 변경", `${setting} 알림을 ${notice[setting] ? "켰습니다" : "껐습니다"}.`, "done", "notification"); saveState(); render(); updateAccountUI(); showToast("알림 수신 설정을 저장했습니다."); return; }
  if (action === "toggle-pc-notifications") { const notice = notificationService(); notice.pcNotice = !notice.pcNotice; audit("두고톡 PC 알림 설정", `새 메시지 PC 알림을 ${notice.pcNotice ? "켰습니다" : "껐습니다"}.`, "done", "notification"); saveState(); render(); updateAccountUI(); showToast(`PC 알림을 ${notice.pcNotice ? "켰습니다" : "껐습니다"}.`); return; }
  if (action === "open-chat-settings") { const notice = notificationService(); openModal(`<h2>두고톡 알림 설정</h2><p>거래처 메시지를 어떤 방식으로 확인할지 선택합니다.</p><div class="chat-setting-list"><button data-action="toggle-pc-notifications"><span><b>PC 브라우저 알림</b><small>새 메시지와 공급사 답변</small></span><em>${notice.pcNotice ? "켜짐" : "꺼짐"}</em></button><button data-action="toggle-notice-setting" data-setting="trackingNotice"><span><b>송장 등록 알림</b><small>두고톡·상단 알림함</small></span><em>${notice.trackingNotice ? "켜짐" : "꺼짐"}</em></button></div><div class="modal-actions"><button class="secondary-button" data-close-modal>닫기</button></div>`); return; }
  if (action === "single-order") { externalOrderModal(); return; }
  if (action === "open-address-popup") { openAddressPopup(); return; }
  if (action === "close-address-popup") { closeAddressPopup(); return; }
  if (action === "select-address") { const form = document.querySelector("#modal form"); if (form) { form.elements.postalCode.value = target.dataset.postal; form.elements.address.value = target.dataset.address; closeAddressPopup(); form.elements.addressDetail.focus(); } return; }
  if (action === "qty-step") {
    const input = target.parentElement.querySelector('input[name="qty"]');
    if (!input) return;
    const min = Number(input.min || 1), max = Number(input.max || Infinity);
    const next = Number(input.value || 1) + Number(target.dataset.step);
    input.value = Math.min(max, Math.max(min, next));
    return;
  }
  if (action === "chat-attach") { showToast("데모에서는 사진을 업로드하지 않고 첨부 위치만 확인합니다."); return; }
  if (action === "chat-filter") { chatRoomFilter = target.dataset.filter || "all"; render(); updateAccountUI(); return; }
  if (action === "select-chat-room") { activeChatConnectionId = id; render(); updateAccountUI(); return; }
  if (action === "toggle-chat-favorite") {
    state.chatFavorites = state.chatFavorites || {};
    state.chatFavorites[id] = !state.chatFavorites[id];
    saveState(); render(); updateAccountUI(); showToast(state.chatFavorites[id] ? "즐겨찾기에 추가했습니다." : "즐겨찾기에서 해제했습니다."); return;
  }
  if (action === "save-chat-note") {
    state.partnerNotes = state.partnerNotes || {};
    state.partnerNotes[id] = document.getElementById("partnerNoteInput")?.value.trim() || "";
    saveState(); showToast("거래처 메모를 저장했습니다."); return;
  }
  if (action === "filter-products") { sellerCategoryGroup = "식품"; sellerCategory = target.dataset.category || "전체보기"; sellerCategorySub = "전체보기"; sellerCategoryDetail = "전체보기"; render(); updateAccountUI(); return; }
  if (action === "filter-shipping") { sellerShippingFilter = target.dataset.filter || "all"; render(); updateAccountUI(); return; }
  if (action === "market-preset") { sellerCategory = target.dataset.category || "전체보기"; sellerShippingFilter = target.dataset.filter || "all"; sellerCountry = target.dataset.country || "전체 국가"; sellerBrand = target.dataset.brand || "전체 브랜드"; render(); updateAccountUI(); requestAnimationFrame(() => document.getElementById("marketProductGrid")?.scrollIntoView({ behavior:"smooth", block:"start" })); return; }
  if (action === "open-brand-directory") { brandDirectoryModal(); return; }
  if (action === "select-brand") { closeModal(); sellerBrand = target.dataset.brand || "전체 브랜드"; sellerCategory = "전체보기"; render(); updateAccountUI(); requestAnimationFrame(() => document.getElementById("marketProductGrid")?.scrollIntoView({ behavior:"smooth", block:"start" })); return; }
  if (action === "reset-market-filter") { sellerCategory = "전체보기"; sellerCategoryGroup = "식품"; sellerCategorySub = "전체보기"; sellerCategoryDetail = "전체보기"; sellerShippingFilter = "all"; sellerCountry = "전체 국가"; sellerBrand = "전체 브랜드"; sellerProductSearch = ""; render(); updateAccountUI(); return; }
  if (action === "set-market-view") { marketViewMode = target.dataset.view || "grid"; render(); updateAccountUI(); return; }
  if (action === "reset-onsale-filter") { onSaleSearch = ""; onSaleDateFrom = ""; onSaleDateTo = ""; render(); updateAccountUI(); return; }
  if (action === "market-scroll") { document.getElementById("marketProductGrid")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  if (action === "product-detail") { productDetailModal(id); return; }
  if (action === "product-detail-tab") {
    const modal = target.closest(".product-detail-page");
    modal?.querySelectorAll(".detail-tabs button").forEach(button => button.classList.toggle("active", button === target));
    modal?.querySelectorAll("[data-detail-panel]").forEach(panel => {
      const active = panel.dataset.detailPanel === target.dataset.target;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
    target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }
  if (action === "open-picked-product") {
    closeModal(); activeMenuIndex = 2;
    expandedSellerProductId = state.sellerProducts.find(item => item.sellerLoginId === currentAccount.loginId && item.productId === id)?.id || null;
    render(); updateAccountUI(); window.scrollTo({ top: 0, behavior: "smooth" }); showToast("PICK 상품에서 판매정보를 확인할 수 있습니다."); return;
  }
  if (action === "import-product") { importModal(id); return; }
  if (action === "supplier-contact") { supplierContactModal(id, target.dataset.productId || ""); return; }
  if (action === "partner-detail") { const member = memberByLogin(id); if (member) memberDetailModal(member.id); }
  if (action === "manage-product-channels") manageProductChannelsModal(id);
  if (action === "edit-seller-product") editSellerProductModal(id);
  if (action === "map-order") orderMappingModal(id);
  if (action === "pay-order") orderPaymentModal(id);
  if (action === "open-product-mapping-form") { productMappingFormModal({ externalProductCode: target.dataset.code || "", externalProductName: target.dataset.name || "", channel: target.dataset.channel || "" }); return; }
  if (action === "unmap-product-mapping") { unmapProductMappingModal(id); return; }
  if (action === "open-notices") { activeMenuIndex = 13; render(); updateAccountUI(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  if (action === "open-notice-detail") { noticeDetailModal(id); return; }
  if (action === "edit-notice") { noticeFormModal(id); return; }
  if (action === "delete-notice") {
    state.notices = (state.notices || []).filter(n => n.id !== id);
    audit("공지사항 삭제", `${id} 공지사항을 삭제했습니다.`, "done", "product");
    saveState(); render(); updateAccountUI(); showToast("공지사항을 삭제했습니다."); return;
  }
  if (action === "notice-modal-nav") {
    const list = state.notices || [];
    if (target.dataset.dir === "prev" && noticeModalIndex > 0) noticeModalIndex--;
    if (target.dataset.dir === "next" && noticeModalIndex < list.length - 1) noticeModalIndex++;
    renderNoticeModal();
    return;
  }
  if (action === "toggle-product-channels") { expandedSellerProductId = expandedSellerProductId === id ? null : id; render(); updateAccountUI(); return; }
  if (action === "pick-status-filter") { pickStatusFilter = target.dataset.status || "all"; render(); updateAccountUI(); return; }
  if (action === "simulate-supplier-approval") {
    const item = state.sellerProducts.find(entry => entry.id === id);
    if (item) {
      item.approvalStatus = "승인완료";
      audit("PICK 상품 승인", `${item.id} 상품이 공급사 승인을 받아 자유롭게 수정할 수 있습니다.`, "done", "product");
      saveState();
    }
    render(); updateAccountUI(); showToast("데모: 공급사가 상품을 승인했습니다. 이제 자유롭게 수정할 수 있어요."); return;
  }
  if (action === "sync-channel-listing") {
    const item = state.sellerProducts.find(entry => entry.id === id);
    const channel = sellerChannels().find(entry => entry.id === target.dataset.channel);
    const detail = item?.channelDetails?.[target.dataset.channel];
    if (item && detail) {
      item.salePrice = Number(detail.salePrice) || item.salePrice;
      item.customTitle = detail.title || item.customTitle;
      item.channelSyncStatus = item.channelSyncStatus || {};
      item.channelSyncStatus[target.dataset.channel] = "synced";
      saveState();
    }
    render(); updateAccountUI(); showToast(`${channel?.name || "채널"}의 최신 상품명·가격을 두고로 불러와 동기화했습니다.`); return;
  }
  if (action === "push-channel-listing") {
    const item = state.sellerProducts.find(entry => entry.id === id);
    const channelId = target.dataset.channel;
    const channel = sellerChannels().find(entry => entry.id === channelId);
    if (!item || !channelId) return;
    item.channelSyncStatus = item.channelSyncStatus || {};
    item.channelSyncStatus[channelId] = "sending";
    saveState(); render(); updateAccountUI();
    setTimeout(() => {
      item.channelDetails = item.channelDetails || {};
      const previous = item.channelDetails[channelId] || {};
      item.channelDetails[channelId] = { ...previous, title: sellerProductTitle(item), salePrice: item.salePrice };
      item.channelSyncStatus[channelId] = "synced";
      audit("판매채널 상품 전송", `${item.id} · ${channel?.name || channelId}에 최신 상품명·가격을 전송해 동기화를 완료했습니다.`, "done", "channel");
      saveState(); render(); updateAccountUI(); showToast(`${channel?.name || "채널"}에 전송을 완료했습니다.`);
    }, 700);
    return;
  }
  if (action === "open-stop-channel") { stopChannelListingModal(id, target.dataset.channel); return; }
  if (action === "focus-inquiry") document.getElementById("supplierInquiryPanel")?.scrollIntoView({ behavior: "smooth", block: "center" });
  if (action === "order-detail") orderDetailModal(id);
  if (action === "request-refund") refundRequestModal(id);
  if (action === "refund-detail") refundDetailModal(id);
  if (action === "request-return-pickup") {
    const refund = state.refunds.find(item => item.id === id);
    if (refund && ["공급사 검토중", "협의 필요"].includes(refund.status)) {
      refund.status = "반품 회수중";
      refund.noPickup = false;
      refund.returnCarrier = supplierProfile().carrier || "한진택배";
      refund.returnTracking = refund.returnTracking || `R${String(Date.now()).slice(-11)}`;
      refund.returnRequestedAt = "방금 전";
      refund.responsibility = "반품 회수 요청";
      pushNotification(refund.sellerLoginId, "seller", "refund", "공급사가 반품 회수를 요청했습니다", `${refund.orderId} · ${refund.returnCarrier} ${refund.returnTracking}`);
      audit("반품 회수 요청", `${refund.id} · ${refund.returnCarrier} ${refund.returnTracking} · 공급사 입고 확인 전 두고머니·정산 보류`, "pending", "refund");
      saveState(); render(); updateAccountUI(); showToast("반품 회수를 요청했습니다. 택배 도착 후 입고 확인이 필요합니다.");
    }
    return;
  }
  if (action === "simulate-return-delivery") {
    const refund = state.refunds.find(item => item.id === id);
    if (refund?.status === "반품 회수중") {
      refund.status = "공급사 입고확인 대기";
      refund.returnDeliveredAt = "방금 전";
      pushNotification(refund.supplierLoginId, "supplier", "refund", "반품 택배가 도착했습니다", `${refund.orderId} · 실물 확인 후 입고 확인을 완료해 주세요.`, ["운영센터"]);
      audit("반품 택배 도착", `${refund.id} · ${refund.returnCarrier || "택배"} ${refund.returnTracking || "송장 미확인"} · 공급사 입고 확인 대기`, "pending", "refund");
      saveState(); render(); updateAccountUI(); showToast("택배 도착 상태를 반영했습니다. 실물 확인 후 입고 확인을 눌러 주세요.");
    }
    return;
  }
  if (action === "confirm-return-receipt") {
    const refund = state.refunds.find(item => item.id === id);
    if (refund?.status === "공급사 입고확인 대기") {
      const result = finalizeRefund(refund, { supplierReceivedAt: "방금 전" });
      saveState(); closeModal(); render(); updateAccountUI(); showToast(`${result?.product?.name || "상품"} 반품 입고를 확인했습니다. 두고머니 충전과 정산 제외가 완료되었습니다.`);
    }
    return;
  }
  if (action === "approve-no-pickup-refund") {
    const refund = state.refunds.find(item => item.id === id);
    if (refund && ["공급사 검토중", "협의 필요"].includes(refund.status)) {
      const result = finalizeRefund(refund, { noPickup: true, supplierReceivedAt: "회수 없음 승인" });
      saveState(); closeModal(); render(); updateAccountUI(); showToast(`${result?.product?.name || "상품"}을 회수 없이 승인했습니다. 셀러 두고머니가 충전되었습니다.`);
    }
    return;
  }
  if (action === "open-refund-consult") { refundConsultModal(id); return; }
  if (action === "open-refund-chat") {
    const refund = state.refunds.find(item => item.id === id);
    if (!refund) return;
    closeModal();
    activeMenuIndex = activeRole === "seller" ? 3 : activeRole === "supplier" ? 2 : activeMenuIndex;
    render(); updateAccountUI(); window.scrollTo({ top: 0, behavior: "smooth" });
    showToast(`${refund.orderId} 환불 협의가 연결된 거래처 두고톡에 표시됩니다.`);
    return;
  }
  if (action === "clear-refund-filter") { refundMonth = "2026-09"; refundSearch = ""; refundTypeFilter = "all"; render(); updateAccountUI(); return; }
  if (action === "refund-type-filter") { refundTypeFilter = target.dataset.type || "all"; render(); updateAccountUI(); return; }
  if (action === "sales-metric") { salesMetric = target.dataset.metric || "sales"; render(); updateAccountUI(); }
  if (action === "calendar-month") { showToast("현재 프로토타입은 2026년 9월 샘플 데이터를 표시합니다."); return; }
  if (action === "calendar-today") { document.querySelector(".cashflow-day.today")?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }); showToast("9월 8일 샘플 기준일로 이동했습니다."); return; }
  if (action === "calendar-day") {
    const daily = state.salesLedger.filter(item => item.date === target.dataset.date);
    const ranked = daily.flatMap(item => salesProductBreakdown(item).map(row => ({ ...row, channel: item.channel }))).sort((a,b) => b.sales - a.sales);
    const dailySales = daily.reduce((sum,item)=>sum+item.sales,0);
    const dailyProfit = daily.reduce((sum,item)=>sum+item.sales-item.cost,0);
    openModal(`<div class="calendar-detail-head"><span>DAILY SALES REPORT</span><h2>${target.dataset.date} 판매 상세</h2><p>채널별 실적과 상품 판매 순위를 함께 확인합니다.</p><div><b>총 매출 ${money(dailySales)}</b><strong>예상 순수익 ${money(dailyProfit)}</strong><em>${daily.reduce((sum,item)=>sum+item.orders,0)}건 주문</em></div></div><div class="calendar-channel-summary">${daily.map(item => `<div>${channelMark(item.channel)}<span><b>${escapeHtml(channelMeta(item.channel).name)}</b><small>${item.orders}건 판매</small></span><strong>${money(item.sales)}<small>순수익 ${money(item.sales-item.cost)}</small></strong></div>`).join("")}</div><section class="calendar-ranking"><div class="calendar-ranking-head"><h3>상품 판매 순위</h3><span>수량 · 매출 · 예상 수익</span></div>${ranked.length ? ranked.map((row,index) => `<div class="calendar-rank-row"><b>${index+1}</b>${productPhoto(row.product,"table-photo")}<span><strong>${escapeHtml(row.product.name)}</strong><small>${channelMark(row.channel,true)} ${escapeHtml(channelMeta(row.channel).name)}</small></span><em>${row.qty}개 판매</em><strong>${money(row.sales)}<small>수익 ${money(row.sales-row.cost)}</small></strong></div>`).join("") : `<div class="empty">이 날짜에는 판매 데이터가 없습니다.</div>`}</section><div class="modal-actions"><button class="secondary-button" data-close-modal>닫기</button></div>`);
    document.querySelector("#modal .modal").classList.add("calendar-detail-modal");
  }
  if (action === "connect-channel") channelConnectModal(id);
  if (action === "filter-order-stage") { sellerOrderStage = target.dataset.stage || "all"; sellerOrderSearch = ""; render(); updateAccountUI(); return; }
  if (action === "dashboard-order-stage") { activeMenuIndex = 4; sellerOrderStage = target.dataset.stage || "all"; sellerOrderSearch = ""; render(); updateAccountUI(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  if (action === "open-refunds") { activeMenuIndex = 5; refundMonth = "all"; refundSearch = ""; refundTypeFilter = target.dataset.type || "all"; render(); updateAccountUI(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  if (action === "apply-recommended-prices") { document.querySelectorAll("#reviewPriceForm .channel-new-price").forEach(input => { input.value = target.dataset.price || input.value; input.dispatchEvent(new Event("input", { bubbles:true })); }); showToast("모든 채널에 권장 판매가를 입력했습니다."); return; }
  if (action === "toggle-channel-automation") {
    const channel = sellerChannels().find(item => item.id === id);
    if (!channel || channel.status !== "connected") return showToast("쇼핑몰 연동을 완료한 뒤 자동화를 켜 주세요.");
    channel.trackingAutomation = !channel.trackingAutomation;
    currentSellerOrders().filter(order => order.tracking).forEach(queueTrackingSync);
    audit("쇼핑몰 송장 자동화 변경", `${channel.name} · 10분 송장 자동전송을 ${channel.trackingAutomation ? "켰습니다" : "껐습니다"}.`, "done", "channel");
    saveState(); render(); updateAccountUI(); showToast(`${channel.name} 송장 자동전송을 ${channel.trackingAutomation ? "켰습니다" : "껐습니다"}.`); return;
  }
  if (action === "run-tracking-sync") {
    runSellerTrackingSync(true); return;
  }
  if (action === "billing-settings") billingSettingsModal();
  if (action === "toggle-subscription") { const subscription = state.subscriptions[currentAccount.loginId] || state.subscriptions.seller; subscription.autoRenew = !subscription.autoRenew; audit("정기구독 자동 갱신 변경", `자동 갱신을 ${subscription.autoRenew ? "켰습니다" : "껐습니다"}.`, "done", "subscription"); saveState(); render(); showToast(`자동 갱신을 ${subscription.autoRenew ? "켰습니다" : "껐습니다"}.`); }
  if (action === "demo-payment") showToast("데모에서는 실제 카드 정보를 받지 않습니다.");
  if (action === "account-tab") accountSettingsModal(target.dataset.tab);
  if (action === "clear-order-search") { sellerOrderSearch = ""; render(); updateAccountUI(); }
  if (action === "open-catalog") { closeModal(); activeMenuIndex = 1; render(); updateAccountUI(); window.scrollTo({top:0,behavior:"smooth"}); showToast("두고로 이동했습니다."); }
  if (action === "open-connections") { closeModal(); activeMenuIndex = 3; render(); updateAccountUI(); window.scrollTo({top:0,behavior:"smooth"}); }
  if (action === "open-my-products") { closeModal(); activeMenuIndex = 2; render(); updateAccountUI(); window.scrollTo({top:0,behavior:"smooth"}); }
  if (action === "open-approved-products") { closeModal(); activeMenuIndex = 14; render(); updateAccountUI(); window.scrollTo({top:0,behavior:"smooth"}); }
  if (action === "open-onsale-products") { closeModal(); activeMenuIndex = 11; render(); updateAccountUI(); window.scrollTo({top:0,behavior:"smooth"}); }
  if (action === "open-orders") { closeModal(); activeMenuIndex = 4; render(); updateAccountUI(); window.scrollTo({top:0,behavior:"smooth"}); }
  if (action === "open-order-mapping") { closeModal(); activeMenuIndex = 4; sellerOrderStage = sellerMappingRequiredOrders().length ? "mapping" : sellerPaymentRequiredOrders().length ? "payment" : "overview"; render(); updateAccountUI(); window.scrollTo({top:0,behavior:"smooth"}); }
  if (action === "open-sales-calendar") { closeModal(); activeMenuIndex = 6; render(); updateAccountUI(); window.scrollTo({top:0,behavior:"smooth"}); }
  if (action === "open-settlement") { activeMenuIndex = 7; render(); updateAccountUI(); window.scrollTo({top:0,behavior:"smooth"}); }
  if (action === "refresh-dashboard") { render(); updateAccountUI(); showToast("주문·송장 현황을 새로고침했습니다."); }
  if (action === "tracking") trackingModal(id);
  if (action === "auto-tracking") autoIssueTracking(id);
  if (action === "auto-issue-all") autoIssueAllTracking();
  if (action === "show-label") shipmentLabelModal(id);
  if (action === "print-label") window.print();
  if (action === "copied-content") copiedContentModal(id);
  if (action === "generate-invite") {
    state.connectionInvites.filter(item => item.supplierLoginId === currentAccount.loginId && item.status === "active").forEach(item => item.status = "expired");
    const code = `SUP-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    state.connectionInvites.unshift({ id: `IV-${Date.now()}`, supplierLoginId: currentAccount.loginId, code, status: "active", createdAt: "방금 전" });
    audit("거래처 연결 코드 발급", `${workspaceCompany("supplier")} 공급사 연결 코드 ${code}를 새로 발급했습니다.`, "done", "connection");
    saveState(); render(); updateAccountUI(); showToast("새 연결 코드를 발급했습니다.");
  }
  if (action === "copy-invite") {
    const code = target.dataset.code;
    if (navigator.clipboard?.writeText && code) navigator.clipboard.writeText(code).catch(() => {});
    showToast(`${code || "연결 코드"}를 복사했습니다.`);
  }
  if (action === "register-product") registerProductModal();
  if (action === "edit-product") editProductModal(id);
  if (action === "adjust-stock") adjustStockModal(id);
  if (action === "simulate-order") simulateOrderModal(id);
  if (action === "product-history") productHistoryModal(id);
  if (action === "change-price") changePriceModal(id);
  if (action === "review-price") reviewPriceModal(id);
  if (action === "member-detail") memberDetailModal(id);
  if (action === "reject-member") rejectMemberModal(id);
  if (action === "approve-member") {
    const member = state.members.find(item => item.id === id);
    if (!member || member.status !== "pending") return;
    member.status = "approved";
    member.approvedAt = "방금 전";
    member.rejectReason = "";
    audit("사업자 가입 승인", `${member.company} · ${member.roleLabel} 계정의 서비스 접근을 승인했습니다.`, "done", "member");
    saveState(); closeModal(); render(); updateAccountUI(); showToast(`${member.company}의 가입을 승인했습니다.`);
  }
  if (action === "toggle-member") {
    const member = state.members.find(item => item.id === id);
    if (!member || !["approved", "suspended"].includes(member.status)) return;
    member.status = member.status === "approved" ? "suspended" : "approved";
    audit(member.status === "approved" ? "회원 이용 재활성" : "회원 이용 정지", `${member.company} · ${member.roleLabel} 계정 상태를 ${member.status === "approved" ? "승인" : "이용 정지"}로 변경했습니다.`, member.status === "approved" ? "done" : "blocked", "member");
    saveState(); render(); updateAccountUI(); showToast(`${member.company} 계정 상태를 변경했습니다.`);
  }
  if (action === "ack-price") {
    const alert = state.priceAlerts.find(a => a.id === id); alert.status = "반영완료"; audit("가격 알림 확인", `${alert.productId} 공급가 변경을 확인 처리했습니다.`, "done", "price"); saveState(); render(); updateAccountUI(); showToast("가격 변경을 확인 처리했습니다.");
  }
  if (action === "delete-price-alert") {
    const alert = state.priceAlerts.find(a => a.id === id);
    if (alert) { audit("가격 알림 삭제", `${alert.productId} 공급가 변경 알림을 삭제했습니다.`, "done", "price"); state.priceAlerts = state.priceAlerts.filter(a => a.id !== id); }
    saveState(); render(); updateAccountUI(); showToast("가격 변경 알림을 삭제했습니다.");
  }
  if (action === "show-boundary") guideModal();
});

document.addEventListener("dragstart", event => {
  const widget = event.target.closest?.("[data-dashboard-widget]");
  if (!editMode || !widget) return;
  dashboardDraggingId = widget.dataset.dashboardWidget || "";
  widget.classList.add("dragging");
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", dashboardDraggingId);
  }
});

document.addEventListener("dragover", event => {
  const widget = event.target.closest?.("[data-dashboard-widget]");
  if (!editMode || !dashboardDraggingId || !widget || widget.dataset.dashboardWidget === dashboardDraggingId) return;
  event.preventDefault();
  document.querySelectorAll(".dashboard-widget.drag-over").forEach(item => item.classList.remove("drag-over"));
  widget.classList.add("drag-over");
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
});

document.addEventListener("drop", event => {
  const widget = event.target.closest?.("[data-dashboard-widget]");
  if (!editMode || !dashboardDraggingId || !widget) return;
  event.preventDefault();
  const targetId = widget.dataset.dashboardWidget;
  const layout = sellerDashboardLayout().filter(id => id !== dashboardDraggingId);
  const targetIndex = layout.indexOf(targetId);
  const rect = widget.getBoundingClientRect();
  const after = event.clientY > rect.top + rect.height / 2;
  layout.splice(Math.max(0, targetIndex + (after ? 1 : 0)), 0, dashboardDraggingId);
  dashboardDraftLayout = layout;
  dashboardDraggingId = "";
  render(); updateAccountUI();
});

document.addEventListener("dragend", () => {
  dashboardDraggingId = "";
  document.querySelectorAll(".dashboard-widget.dragging, .dashboard-widget.drag-over").forEach(item => item.classList.remove("dragging", "drag-over"));
});

document.getElementById("loginForm").addEventListener("submit", event => {
  event.preventDefault();
  const id = document.getElementById("loginId").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value.trim();
  const account = getAccount(id);
  if (!account || String(account.password) !== password) {
    document.getElementById("loginError").textContent = "아이디 또는 비밀번호를 다시 확인해 주세요.";
    document.getElementById("loginPassword").focus();
    return;
  }
  if (account.role !== "seller") {
    document.getElementById("loginError").textContent = "공급사·관리자는 왼쪽 파트너센터에서 로그인해 주세요.";
    return;
  }
  if (account.status === "pending") {
    document.getElementById("loginError").textContent = "마스터 승인 대기 중인 계정입니다.";
    return;
  }
  if (account.status === "rejected") {
    document.getElementById("loginError").textContent = `가입 신청이 반려되었습니다${account.rejectReason ? `: ${account.rejectReason}` : "."}`;
    return;
  }
  if (account.status !== "approved") {
    document.getElementById("loginError").textContent = "현재 이용할 수 없는 계정입니다.";
    return;
  }
  if (document.getElementById("rememberId").checked) localStorage.setItem(REMEMBER_KEY, id);
  else localStorage.removeItem(REMEMBER_KEY);
  showApp(id);
});

document.getElementById("partnerLoginForm").addEventListener("submit", event => {
  event.preventDefault();
  const id = document.getElementById("partnerLoginId").value.trim().toLowerCase();
  const password = document.getElementById("partnerLoginPassword").value.trim();
  const account = getAccount(id);
  if (!account || String(account.password) !== password) {
    document.getElementById("partnerLoginError").textContent = "아이디 또는 비밀번호를 다시 확인해 주세요.";
    return document.getElementById("partnerLoginPassword").focus();
  }
  if (account.role !== partnerLoginRole) {
    document.getElementById("partnerLoginError").textContent = `${partnerLoginRole === "supplier" ? "공급사" : "관리자"} 계정으로 로그인해 주세요.`;
    return;
  }
  if (account.status === "pending") return void (document.getElementById("partnerLoginError").textContent = "마스터 승인 대기 중인 계정입니다.");
  if (account.status === "rejected") return void (document.getElementById("partnerLoginError").textContent = `가입 신청이 반려되었습니다${account.rejectReason ? `: ${account.rejectReason}` : "."}`);
  if (account.status !== "approved") return void (document.getElementById("partnerLoginError").textContent = "현재 이용할 수 없는 계정입니다.");
  if (document.getElementById("rememberPartnerId").checked) localStorage.setItem(REMEMBER_KEY, id);
  showApp(id);
});

document.getElementById("openPartnerCenter").addEventListener("click", () => showPartnerLogin("supplier"));
document.getElementById("mobilePartnerCenterLink").addEventListener("click", () => showPartnerLogin("supplier"));
document.getElementById("backToSellerLogin").addEventListener("click", showLogin);
document.getElementById("mobileBackToSellerLogin").addEventListener("click", showLogin);
document.getElementById("openSignup").addEventListener("click", () => showSignup("seller", "seller"));
document.getElementById("openSupplierSignup").addEventListener("click", () => showSignup("supplier", "partner"));
document.getElementById("backToLogin").addEventListener("click", returnToLogin);
document.getElementById("completeToLogin").addEventListener("click", returnToLogin);
document.querySelectorAll("[data-find-account]").forEach(button => button.addEventListener("click", event => {
  const fromPartner = Boolean(event.currentTarget.closest("#partnerLoginView"));
  accountRecoveryModal(fromPartner ? partnerLoginRole : "seller");
}));

document.getElementById("signupForm").addEventListener("submit", event => {
  event.preventDefault();
  if (!validateSignupStep(3)) return;
  const data = new FormData(event.currentTarget);
  const loginId = String(data.get("email") || "").trim().toLowerCase();
  if (getAccount(loginId)) {
    showToast("이미 가입된 이메일입니다.");
    setSignupStep(1);
    event.currentTarget.elements.email.focus();
    return;
  }
  const role = data.get("role");
  const file = data.get("businessFile");
  const member = {
    id: nextMemberId(), loginId, password: String(data.get("password") || ""), role,
    roleLabel: role === "supplier" ? "공급사" : "위탁셀러", name: String(data.get("company") || ""),
    company: String(data.get("company") || ""), representative: String(data.get("representative") || ""),
    businessNo: String(data.get("businessNo") || ""), contact: String(data.get("contact") || ""),
    email: String(data.get("email") || ""), referralCode: String(data.get("referralCode") || "").trim().toUpperCase(),
    marketingConsent: Boolean(data.get("marketingConsent")), status: "pending", appliedAt: "방금 전", approvedAt: "",
    businessFile: file && file.name ? file.name : "", rejectReason: "", roles: [role]
  };
  state.members.push(member);
  state.logs.unshift({ id: Date.now(), type: "member", title: "신규 사업자 가입 신청", detail: `${member.company} · ${member.roleLabel} 승인 요청이 접수되었습니다.`, time: "방금 전", state: "pending" });
  saveState();
  localStorage.setItem(REMEMBER_KEY, loginId);
  document.getElementById("signupCompleteCompany").textContent = member.company;
  document.getElementById("signupFormWrap").hidden = true;
  document.getElementById("signupComplete").hidden = false;
});

document.getElementById("togglePassword").addEventListener("click", event => {
  const input = document.getElementById("loginPassword");
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  event.currentTarget.textContent = show ? "숨김" : "보기";
});

document.getElementById("togglePartnerPassword").addEventListener("click", event => {
  const input = document.getElementById("partnerLoginPassword");
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  event.currentTarget.textContent = show ? "숨김" : "보기";
});

document.querySelectorAll("[data-demo-login]").forEach(button => button.addEventListener("click", () => {
  const id = button.dataset.demoLogin;
  document.getElementById("loginId").value = id;
  document.getElementById("loginPassword").value = id;
  document.getElementById("loginError").textContent = "";
  document.getElementById("loginPassword").focus();
}));

document.getElementById("workspaceMenu").addEventListener("click", event => {
  if (editMode && event.target.closest("[data-edit-key]")) return;
  const button = event.target.closest("button");
  if (!button) return;
  activeMenuIndex = Number(button.dataset.menuIndex);
  if (activeMenuIndex !== 0) editMode = false;
  closeMobileSidebar(); render(); updateAccountUI(); window.scrollTo({ top: 0, behavior: "smooth" });
});

document.addEventListener("change", event => {
  if (event.target.id === "supplierSettlementMonthSelect") {
    supplierSettlementMonth = event.target.value;
    render(); updateAccountUI();
  }
  if (event.target.id === "marketCategoryGroupSelect") { sellerCategoryGroup = event.target.value; sellerCategory = "전체보기"; sellerCategorySub = "전체보기"; sellerCategoryDetail = "전체보기"; render(); updateAccountUI(); }
  if (event.target.id === "marketCategoryMidSelect") { sellerCategory = event.target.value; sellerCategorySub = "전체보기"; sellerCategoryDetail = "전체보기"; render(); updateAccountUI(); }
  if (event.target.id === "marketCategorySubSelect") { sellerCategorySub = event.target.value; sellerCategoryDetail = "전체보기"; render(); updateAccountUI(); }
  if (event.target.id === "marketCategoryDetailSelect") { sellerCategoryDetail = event.target.value; render(); updateAccountUI(); }
  if (event.target.dataset && event.target.dataset.categoryLevel) {
    const level = Number(event.target.dataset.categoryLevel);
    const form = event.target.closest("form");
    if (form) {
      const getSelect = l => form.querySelector(`[data-category-level="${l}"]`);
      const path = [1, 2, 3, 4].map(l => getSelect(l)?.value || "");
      for (let l = level + 1; l <= 4; l++) {
        const select = getSelect(l);
        if (!select) continue;
        const options = categoryLevelOptions(l, path);
        select.innerHTML = `<option value="">${l === 1 ? "대분류 선택" : "선택"}</option>${options.map(option => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}`;
        select.disabled = !options.length;
        path[l - 1] = "";
      }
    }
  }
  if (event.target.id === "onSaleSearchInput") { onSaleSearch = event.target.value; render(); updateAccountUI(); }
  if (event.target.id === "onSaleDateFromInput") { onSaleDateFrom = event.target.value; render(); updateAccountUI(); }
  if (event.target.id === "onSaleDateToInput") { onSaleDateTo = event.target.value; render(); updateAccountUI(); }
  if (event.target.id === "marketCountrySelect") { sellerCountry = event.target.value; render(); updateAccountUI(); }
  if (event.target.id === "marketBrandSelect") { sellerBrand = event.target.value; render(); updateAccountUI(); }
  if (event.target.id === "refundMonthSelect") { refundMonth = event.target.value; render(); updateAccountUI(); }
});

document.addEventListener("input", event => {
  if (event.target.id === "addressPopupInput") { renderAddressPopupResults(event.target.value); return; }
  if (event.target.id === "chatRoomSearch") {
    chatRoomSearch = event.target.value;
    render(); updateAccountUI();
    requestAnimationFrame(() => {
      const input = document.getElementById("chatRoomSearch");
      if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    });
    return;
  }
  if (event.target.id === "sellerCatalogSearch") {
    sellerProductSearch = event.target.value;
    const products = sellerCatalogProducts();
    const panel = event.target.closest(".panel");
    const grid = panel?.querySelector(".product-card-grid");
    if (grid) grid.innerHTML = products.length ? products.slice(0, panel.classList.contains("seller-market-panel") ? products.length : 6).map(productRowSeller).join("") : `<div class="empty catalog-empty"><b>검색 결과가 없습니다.</b><span>상품명·공급사·원산지를 다시 검색해 주세요.</span></div>`;
    panel?.querySelectorAll(".market-toolbar > span b, .catalog-summary span b").forEach(element => element.textContent = products.length);
  }
  if (event.target.id === "sellerOrderSearch") {
    sellerOrderSearch = event.target.value;
    const results = document.getElementById("sellerOrderResults");
    if (results) results.innerHTML = ordersTable("seller", sellerOrderSearch, sellerOrderSubset());
  }
  if (event.target.id === "refundSearch") {
    refundSearch = event.target.value;
    const results = document.getElementById("refundResults");
    const role = results?.dataset.role || activeRole;
    const items = filteredRefunds(role);
    if (results) results.innerHTML = refundRows(role, items);
    const mobileResults = document.getElementById("refundMobileResults");
    if (mobileResults) mobileResults.outerHTML = refundMobileCards(role, items);
    const count = document.getElementById("refundResultCount");
    if (count) count.textContent = `${items.length}건`;
  }
  if (event.target.name === "salePrice" && event.target.closest("#importForm")) {
    const p = productOf(event.target.closest("form").dataset.id);
    document.getElementById("marginPreview").textContent = `예상 마진율 ${margin(p.supply, Number(event.target.value))}%`;
  }
  if (event.target.name === "salePrice" && event.target.closest("#sellerProductEditForm")) {
    const item = state.sellerProducts.find(product => product.id === event.target.closest("form").dataset.id);
    const product = productOf(item?.productId);
    const preview = document.getElementById("sellerProductMargin");
    if (product && preview) preview.textContent = `${margin(product.supply, Number(event.target.value))}%`;
  }
  if (event.target.classList.contains("channel-new-price")) {
    const form = event.target.closest("#reviewPriceForm");
    const row = event.target.closest(".channel-price-row");
    const preview = row?.querySelector(".calculated-margin b");
    const marginInput = row?.querySelector(".channel-target-margin");
    if (form && preview) {
      const nextMargin = margin(Number(form.dataset.supply), Number(event.target.value));
      preview.textContent = `${nextMargin}%`;
      if (marginInput) marginInput.value = nextMargin;
      row.classList.toggle("loss-price", nextMargin < 0);
    }
  }
  if (event.target.classList.contains("channel-target-margin")) {
    const form = event.target.closest("#reviewPriceForm");
    const row = event.target.closest(".channel-price-row");
    const priceInput = row?.querySelector(".channel-new-price");
    const preview = row?.querySelector(".calculated-margin b");
    if (form && priceInput && preview) {
      const nextPrice = priceFromMargin(Number(form.dataset.supply), Number(event.target.value));
      priceInput.value = nextPrice;
      const nextMargin = margin(Number(form.dataset.supply), nextPrice);
      preview.textContent = `${nextMargin}%`;
      row.classList.toggle("loss-price", nextMargin < 0);
    }
  }
});

document.addEventListener("keydown", event => {
  const editable = event.target.closest?.("[data-edit-key]");
  if (!editable || !editMode) return;
  if (event.key === "Enter") {
    event.preventDefault();
    editable.blur();
  }
  if (event.key === "Escape") {
    event.preventDefault();
    editable.textContent = contentText(editable.dataset.editKey, editable.textContent);
    editable.blur();
  }
});

document.addEventListener("blur", event => {
  const editable = event.target.closest?.("[data-edit-key]");
  if (!editable || !editMode) return;
  const key = editable.dataset.editKey;
  const value = editable.textContent.replace(/\s+/g, " ").trim();
  if (!value) {
    delete state.contentOverrides[key];
    render(); updateAccountUI(); showToast("빈 문구는 기본값으로 되돌렸습니다.");
    return;
  }
  state.contentOverrides[key] = value;
  saveState();
  if (key.startsWith("seller.menu.") || key.startsWith("seller.page.")) updateAccountUI();
  showToast("문구를 저장했습니다.");
}, true);

document.addEventListener("submit", event => {
  event.preventDefault();
  const form = event.target, data = Object.fromEntries(new FormData(form));
  if (form.id === "findAccountIdForm") {
    const role = data.role === "supplier" ? "supplier" : "seller";
    const email = String(data.email || "").trim().toLowerCase();
    const name = String(data.representative || "").trim().toLowerCase();
    const member = state.members.find(item => (item.roles || [item.role]).includes(role) && item.status === "approved" && String(item.email || "").toLowerCase() === email && [item.representative, item.name, item.company].some(value => String(value || "").trim().toLowerCase() === name));
    if (!member) return showToast("일치하는 승인 계정을 찾지 못했습니다.");
    accountRecoveryResult("아이디를 찾았습니다", `${roleLabel(role)} 아이디: ${member.loginId}`); return;
  }
  if (form.id === "resetPasswordForm") {
    const role = data.role === "supplier" ? "supplier" : "seller";
    const loginId = String(data.loginId || "").trim().toLowerCase();
    const email = String(data.email || "").trim().toLowerCase();
    const member = state.members.find(item => item.loginId.toLowerCase() === loginId && (item.roles || [item.role]).includes(role) && item.status === "approved" && String(item.email || "").toLowerCase() === email);
    if (!member) return showToast("아이디와 등록 이메일을 다시 확인해 주세요.");
    member.password = String(data.password || "");
    if (accounts[loginId]) accounts[loginId].password = member.password;
    audit("비밀번호 재설정", `${loginId} · ${roleLabel(role)} 계정의 비밀번호를 재설정했습니다.`, "done", "member");
    saveState(); accountRecoveryResult("비밀번호를 변경했습니다", "새 비밀번호로 로그인해 주세요."); return;
  }
  if (form.id === "importForm") {
    const sequence = 1001 + state.sellerProducts.length;
    const source = productOf(form.dataset.id);
    const customTitle = String(data.customTitle || source.name).trim();
    const channelStatuses = Object.fromEntries(sellerChannels().map(channel => [channel.id, channel.status === "connected" ? "자동등록 전" : channel.status === "pending" ? "연동 대기" : "미연동"]));
    const channelDetails = Object.fromEntries(sellerChannels().map((channel,index) => [channel.id, { title: customTitle, salePrice: Number(data.salePrice) + index * 500, category: `${source.category} > ${source.originCountry || "상품"}`, reviews: 0 }]));
    state.sellerProducts.push({ id: `SP-${sequence}`, sellerLoginId: currentAccount.loginId, productId: form.dataset.id, customTitle, salePrice: Number(data.salePrice), approvalStatus: "승인대기", channel: "", channels: [], channelStatuses, channelDetails, status: "가져오기 완료", copiedAt: "방금 전", imageIndex: source.imageIndex, detailSnapshot: source.detail, contentCopied: Boolean(data.copyContent), channelPrepared: false, sourceUpdatedAt: "방금 전" });
    audit("두고 상품 PICK", `${form.dataset.id} 상품의 썸네일·상세페이지·공급조건을 PICK 상품에 보관했습니다. 공급사 승인 후 자유롭게 수정할 수 있습니다.`, "done", "product");
    saveState(); closeModal(); activeMenuIndex = 2; pickStatusFilter = "pending"; expandedSellerProductId = `SP-${sequence}`; render(); updateAccountUI(); showToast("PICK 상품에 보관했습니다. 공급사 승인 후 판매를 시작할 수 있어요.");
  }
  if (form.id === "sellerProductEditForm") {
    const item = state.sellerProducts.find(product => product.id === form.dataset.id);
    const source = productOf(item?.productId);
    if (!item || !source) return showToast("수정할 판매상품을 찾지 못했습니다.");
    const oldTitle = sellerProductTitle(item, source);
    item.customTitle = String(data.customTitle || "").trim();
    item.salePrice = Number(data.salePrice);
    item.retailPrice = Number(data.retailPrice || data.salePrice);
    item.managementCode = String(data.managementCode || item.id).trim();
    item.sellerCategory = String(data.sellerCategory || source.category);
    item.status = String(data.status || "판매중");
    item.imageIndex = Number(data.imageIndex ?? item.imageIndex ?? source.imageIndex ?? 0);
    item.summaryOverride = String(data.summaryOverride || "").trim();
    item.detailOverride = String(data.detailOverride || "").trim();
    item.detailSnapshot = item.detailOverride || source.detail;
    item.shippingPolicyOverride = String(data.shippingPolicyOverride || source.shippingPolicy || "공급사 정책 사용");
    item.carrierOverride = String(data.carrierOverride || source.carrier || "공급사 지정 택배");
    item.deliveryDaysOverride = String(data.deliveryDaysOverride || source.deliveryDays || "1~3일").trim();
    item.returnPolicy = String(data.returnPolicy || "공급사 반품 정책에 따름").trim();
    item.channelDetails = item.channelDetails || {};
    sellerChannels().forEach(channel => {
      const current = sellerChannelDetail(item, channel, source);
      item.channelDetails[channel.id] = {
        ...current,
        title: String(data[`channelTitle__${channel.id}`] || item.customTitle).trim(),
        salePrice: Number(data[`channelPrice__${channel.id}`] || item.salePrice),
        category: String(data[`channelCategory__${channel.id}`] || item.sellerCategory).trim()
      };
    });
    item.channelSyncStatus = item.channelSyncStatus || {};
    sellerChannels().forEach(channel => { if (sellerProductChannelStatus(item, channel) === "판매중") item.channelSyncStatus[channel.id] = "edited"; });
    audit("위탁셀러 상품 수정", `${item.id} · 원본 ${item.productId} 유지 · ${oldTitle} → ${item.customTitle} · 판매가 ${money(item.salePrice)} · 채널별 정보 저장`, "done", "product");
    saveState(); closeModal(); render(); updateAccountUI(); showToast("상품 정보를 저장했습니다. 판매중인 채널은 전송 전까지 '수정완료 · 전송전' 상태로 표시됩니다.");
  }
  if (form.id === "externalOrderForm") {
    const orderId = `DO-${String(Date.now()).slice(-9)}`;
    const externalProductCode = String(data.externalProductCode || "").trim();
    const existingMapping = currentProductMappings().find(mapping => mapping.externalProductCode === externalProductCode && mapping.status === "매핑완료");
    const mappedProduct = existingMapping ? productOf(existingMapping.productId) : null;
    state.orders.unshift({
      id: orderId,
      sellerLoginId: currentAccount.loginId,
      supplierLoginId: "",
      assignedSupplier: mappedProduct?.supplier || "",
      productId: mappedProduct?.id || "",
      mappedProductId: mappedProduct?.id || "",
      externalProductName: String(data.externalProductName || "").trim(),
      externalProductCode,
      mappingStatus: mappedProduct ? "mapped" : "unmapped",
      paymentStatus: "pending",
      paymentMethod: "",
      supplyTotal: mappedProduct ? mappedProduct.supply * Number(data.qty || 1) : 0,
      forwardedAt: "",
      customer: data.customer,
      recipientName: data.recipientName,
      phone: data.phone,
      postalCode: data.postalCode,
      address: data.address,
      addressDetail: data.addressDetail,
      deliveryMessage: data.deliveryMessage,
      shippingType: mappedProduct?.shippingType || "domestic",
      personalCustomsCode: "",
      qty: Number(data.qty),
      amount: Number(data.amount),
      channel: data.channel,
      status: "신규주문",
      tracking: "",
      carrier: mappedProduct?.carrier || "",
      channelTrackingStatuses: {},
      orderDate: "2026-09-13",
      createdAt: "방금 전",
      settlementStatus: "pending-payment"
    });
    if (mappedProduct) audit("외부 주문 자동 매핑", `${orderId} · ${data.channel} · ${data.externalProductName} · 기존 매핑으로 ${mappedProduct.id} 자동 연결`, "done", "order");
    else audit("외부 주문 수집", `${orderId} · ${data.channel} · ${data.externalProductName} · 상품 매핑 대기`, "pending", "order");
    saveState(); closeModal();
    if (mappedProduct) { activeMenuIndex = 4; sellerOrderStage = "payment"; render(); updateAccountUI(); showToast("신규주문을 불러왔습니다. 기존 매핑으로 자동 연결되어 결제 단계로 이동했습니다."); }
    else { activeMenuIndex = 4; sellerOrderStage = "mapping"; render(); updateAccountUI(); showToast("신규주문을 불러왔습니다. 공급사 상품을 매핑해 주세요."); }
  }
  if (form.id === "orderMappingForm") {
    const order = state.orders.find(item => item.id === form.dataset.id);
    const product = productOf(data.productId);
    if (!order || !product) return showToast("매핑할 주문 또는 상품을 찾지 못했습니다.");
    order.mappedProductId = product.id;
    order.productId = product.id;
    order.mappingStatus = "mapped";
    order.assignedSupplier = product.supplier;
    order.supplierLoginId = "";
    order.shippingType = product.shippingType || "domestic";
    order.carrier = product.carrier || "한진택배";
    order.supplyTotal = product.supply * Number(order.qty || 1);
    order.paymentStatus = "pending";
    order.settlementStatus = "pending-payment";
    if (order.externalProductCode) {
      state.productMappings = state.productMappings || [];
      let mapping = state.productMappings.find(item => item.sellerLoginId === currentAccount.loginId && item.externalProductCode === order.externalProductCode);
      if (!mapping) { mapping = { id: `PM-${Date.now()}`, sellerLoginId: currentAccount.loginId, createdAt: "방금 전" }; state.productMappings.unshift(mapping); }
      mapping.externalProductCode = order.externalProductCode;
      mapping.externalProductName = order.externalProductName || mapping.externalProductName;
      mapping.channel = order.channel || mapping.channel;
      mapping.productId = product.id;
      mapping.supplier = product.supplier;
      mapping.status = "매핑완료";
      mapping.mappedAt = "방금 전";
    }
    audit("외부 주문 상품코드 매핑", `${order.id} · ${order.externalProductName || "외부 상품"} → ${product.id} ${product.name} · 공급사 전달 전`, "pending", "order");
    saveState(); closeModal(); render(); updateAccountUI(); orderPaymentModal(order.id); showToast(`${product.id} 상품으로 매핑했습니다. 같은 상품코드의 다음 주문부터는 자동으로 연결됩니다.`);
  }
  if (form.id === "productMappingForm") {
    const product = productOf(data.productId);
    const code = String(data.externalProductCode || "").trim();
    if (!product) return showToast("매핑할 공급사 상품을 찾지 못했습니다.");
    if (!code) return showToast("외부 상품코드를 입력해 주세요.");
    state.productMappings = state.productMappings || [];
    let mapping = state.productMappings.find(item => item.sellerLoginId === currentAccount.loginId && item.externalProductCode === code);
    if (!mapping) { mapping = { id: `PM-${Date.now()}`, sellerLoginId: currentAccount.loginId, createdAt: "방금 전" }; state.productMappings.unshift(mapping); }
    mapping.externalProductCode = code;
    mapping.externalProductName = String(data.externalProductName || "").trim();
    mapping.channel = data.channel;
    mapping.productId = product.id;
    mapping.supplier = product.supplier;
    mapping.status = "매핑완료";
    mapping.mappedAt = "방금 전";
    currentSellerOrders().forEach(order => {
      if (order.externalProductCode === code && orderMappingStatus(order) !== "mapped") {
        order.mappedProductId = product.id;
        order.productId = product.id;
        order.mappingStatus = "mapped";
        order.assignedSupplier = product.supplier;
        order.shippingType = product.shippingType || order.shippingType;
        order.carrier = product.carrier || order.carrier;
        order.supplyTotal = product.supply * Number(order.qty || 1);
      }
    });
    audit("상품 매핑 설정", `${code} · ${mapping.externalProductName || "외부 상품"} → ${product.id} ${product.name} · 자동 매핑 등록`, "done", "product");
    saveState(); closeModal(); render(); updateAccountUI(); showToast("상품 매핑을 설정했습니다. 이후 같은 상품코드의 주문은 자동으로 연결됩니다.");
  }
  if (form.id === "unmapProductMappingForm") {
    const mapping = currentProductMappings().find(item => item.id === form.dataset.id);
    if (mapping) {
      audit("상품 매핑 해지", `${mapping.externalProductCode} · ${mapping.externalProductName || "외부 상품"} 매핑을 해지했습니다.`, "done", "product");
      state.productMappings = (state.productMappings || []).filter(item => item.id !== mapping.id);
    }
    saveState(); closeModal(); render(); updateAccountUI(); showToast("매핑을 해지했습니다.");
  }
  if (form.id === "orderPaymentForm") {
    const order = state.orders.find(item => item.id === form.dataset.id);
    const product = orderSourceProduct(order);
    if (!order || !product || orderMappingStatus(order) !== "mapped") return showToast("상품 매핑 정보를 다시 확인해 주세요.");
    if (orderPaymentStatus(order) !== "pending") return showToast("이미 결제되어 공급사에 전달된 주문입니다.");
    const supplyTotal = product.supply * Number(order.qty || 1);
    const paymentMethod = String(data.paymentMethod || "deposit");
    if (product.stock < Number(order.qty || 1)) return showToast("공급사 재고가 부족해 결제할 수 없습니다.");
    if (paymentMethod === "deposit") {
      const deposit = sellerDeposit(order.sellerLoginId);
      if (deposit.balance < supplyTotal) return showToast("두고머니 잔액이 부족합니다. 신용카드 데모 결제를 선택해 주세요.");
      deposit.balance -= supplyTotal;
      deposit.transactions.unshift({ id: `DP-${Date.now()}`, type: "주문 공급가 결제", amount: -supplyTotal, reference: order.id, createdAt: "방금 전" });
    }
    product.stock -= Number(order.qty || 1);
    order.supplierLoginId = "";
    order.assignedSupplier = product.supplier;
    order.paymentStatus = "paid";
    order.paymentMethod = paymentMethod;
    order.supplyTotal = supplyTotal;
    order.forwardedAt = "";
    order.status = "주문접수";
    order.settlementStatus = "scheduled";
    audit("공급가 결제·주문접수", `${order.id} · ${product.id} · ${money(supplyTotal)} · ${paymentMethod === "deposit" ? "두고머니" : "신용카드 데모"} 결제 · 공급사 발주 대기`, "done", "order");
    saveState(); closeModal(); sellerOrderStage = "received"; render(); updateAccountUI(); showToast("주문접수가 완료되었습니다. 공급사 발주를 진행해 주세요.");
  }
  if (form.id === "connectSupplierForm") {
    const code = String(data.code || "").trim().toUpperCase();
    const invite = state.connectionInvites.find(item => item.code.toUpperCase() === code && item.status === "active");
    if (!invite) return showToast("유효한 공급사 연결 코드를 확인해 주세요.");
    const exists = state.connections.some(item => item.supplierLoginId === invite.supplierLoginId && item.sellerLoginId === currentAccount.loginId && item.status === "connected");
    if (exists) return showToast("이미 연결된 공급사입니다.");
    state.connections.push({ id: `CN-${Date.now()}`, supplierLoginId: invite.supplierLoginId, sellerLoginId: currentAccount.loginId, status: "connected", createdAt: "방금 전" });
    audit("공급사·셀러 거래처 연결", `${currentAccount.company} 위탁셀러가 ${memberByLogin(invite.supplierLoginId)?.company || invite.supplierLoginId} 공급사와 연결되었습니다.`, "done", "connection");
    saveState(); render(); updateAccountUI(); showToast("공급사와 연결되어 상품이 열렸습니다.");
  }
  if (form.id === "noticeForm") {
    const id = form.dataset.id;
    state.notices = state.notices || [];
    if (id) {
      const notice = state.notices.find(item => item.id === id);
      if (notice) { notice.title = String(data.title || "").trim(); notice.detail = String(data.detail || "").trim(); notice.date = String(data.date || "").trim() || "오늘"; }
      audit("공지사항 수정", `${id} 공지사항을 수정했습니다.`, "done", "product");
    } else {
      const newId = `notice-${Date.now()}`;
      state.notices.unshift({ id: newId, title: String(data.title || "").trim(), detail: String(data.detail || "").trim(), date: String(data.date || "").trim() || "오늘" });
      audit("공지사항 등록", `${newId} 공지사항을 새로 등록했습니다.`, "done", "product");
    }
    saveState(); closeModal(); render(); updateAccountUI(); showToast(id ? "공지사항을 수정했습니다." : "공지사항을 등록했습니다.");
    return;
  }
  if (form.id === "connectionMessageForm") {
    state.connectionMessages.push({ id: `MSG-${Date.now()}`, supplierLoginId: data.supplierLoginId, sellerLoginId: data.sellerLoginId, senderLoginId: currentAccount.loginId, text: String(data.text || "").trim(), createdAt: "방금 전" });
    audit("거래처 운영 메모 등록", `${memberByLogin(data.supplierLoginId)?.company || data.supplierLoginId} ↔ ${memberByLogin(data.sellerLoginId)?.company || data.sellerLoginId} 연결에 운영 메모를 저장했습니다.`, "done", "connection");
    saveState(); render(); updateAccountUI(); showToast("거래처 양쪽 화면에 메모를 반영했습니다.");
  }
  if (form.id === "supplierInquiryForm") {
    const product = productOf(data.productId);
    const messageText = `${product ? `[${product.name}] ` : ""}${String(data.text || "").trim()}`;
    state.connectionMessages.push({ id: `MSG-${Date.now()}`, supplierLoginId: data.supplierLoginId, sellerLoginId: data.sellerLoginId, senderLoginId: currentAccount.loginId, productId: data.productId || "", text: messageText, createdAt: "방금 전" });
    audit("공급사 직접 문의", `${memberByLogin(data.supplierLoginId)?.company || data.supplierLoginId}에 상품·운영 문의를 저장했습니다.`, "done", "connection");
    saveState(); closeModal(); render(); updateAccountUI(); showToast("공급사 문의가 내부 메시지에 저장되었습니다.");
  }
  if (form.id === "productChannelsForm") {
    const item = state.sellerProducts.find(product => product.id === form.dataset.id);
    const channels = new FormData(form).getAll("channels");
    if (!channels.length) return showToast("판매채널을 하나 이상 선택해 주세요.");
    item.channels = channels;
    item.channel = channelMeta(channels[0]).name;
    item.status = "판매중";
    item.channelPrepared = true;
    item.publishedAt = "방금 전";
    item.channelStatuses = item.channelStatuses || {};
    sellerChannels().forEach(channel => { item.channelStatuses[channel.id] = channels.includes(channel.id) ? "판매중" : channel.status === "connected" ? "판매중지/미노출" : channel.status === "pending" ? "연동 대기" : "미연동"; });
    audit("쇼핑몰 상품 자동등록", `${item.id} · ${channels.map(id => channelMeta(id).name).join(", ")}에 상품명·판매가·카테고리·콘텐츠 등록 결과를 반영했습니다.`, "done", "channel");
    saveState(); closeModal(); activeMenuIndex = 11; render(); updateAccountUI(); window.scrollTo({top:0,behavior:"smooth"}); showToast(`${channels.length}개 쇼핑몰에 상품을 전송했습니다.`);
  }
  if (form.id === "stopChannelForm") {
    const item = state.sellerProducts.find(entry => entry.id === form.dataset.id);
    const channelId = form.dataset.channel;
    const channel = sellerChannels().find(entry => entry.id === channelId);
    const reason = String(data.reason || "상품중지");
    if (!item || !channelId) return;
    item.channels = (item.channels || []).filter(id => id !== channelId);
    item.channelStatuses = item.channelStatuses || {};
    item.channelStatuses[channelId] = reason;
    if (item.channelSyncStatus) delete item.channelSyncStatus[channelId];
    audit("판매채널 판매중지", `${item.id} · ${channel?.name || channelId} 채널을 '${reason}' 상태로 변경했습니다.`, "done", "channel");
    saveState(); closeModal(); render(); updateAccountUI(); showToast(`${channel?.name || "채널"}을(를) '${reason}' 상태로 변경했습니다.`);
  }
  if (form.id === "shippingProfileForm") {
    state.shippingProfiles[currentAccount.loginId] = { carrier: data.carrier, sender: data.sender, contractCode: data.contractCode, labelFormat: data.labelFormat, autoIssue: Boolean(data.autoIssue) };
    audit("공급사 송장 설정 저장", `${workspaceCompany("supplier")} · ${data.carrier} · ${data.labelFormat} 계정 전용 설정을 저장했습니다.`, "done", "tracking");
    saveState(); render(); updateAccountUI(); showToast("내 계정의 배송·송장 설정을 저장했습니다.");
  }
  if (form.id === "goodflowSettingsForm") {
    state.goodflowConnections[currentAccount.loginId] = { status: data.status, merchantId: data.merchantId, carrier: data.carrier, lastSync: "방금 전", autoTracking: Boolean(data.autoTracking) };
    audit("굿스플로 택배 연동 설정", `${workspaceCompany("supplier")} · ${data.carrier} · ${data.status === "connected" ? "연동중" : "미연동"} 상태를 저장했습니다. 외부 API 호출 없음.`, "done", "tracking");
    saveState(); closeModal(); render(); updateAccountUI(); showToast("굿스플로 택배 연동 설정을 저장했습니다.");
  }
  if (form.id === "trackingForm") {
    const order = state.orders.find(o => o.id === form.dataset.id);
    if (!order || order.status !== "배송준비중") return showToast("배송준비중 주문에서만 송장을 입력할 수 있습니다.");
    order.carrier = data.carrier; order.tracking = data.tracking; order.status = "배송중"; order.provisionalTracking = false; order.shippedAt = "방금 전"; queueTrackingSync(order);
    const notice = state.notificationServices[order.sellerLoginId] || state.notificationServices.seller;
    if (notice?.status === "active" && notice.trackingNotice) { pushNotification(order.sellerLoginId, "seller", "tracking", "송장번호가 등록되었습니다", `${order.id} · ${data.carrier} ${data.tracking}`); notice.used += 1; }
    audit("송장 정보 반영", `${order.id} · ${data.carrier} ${data.tracking} · 두고 위탁셀러 주문에 즉시 반영, 활성 쇼핑몰 10분 자동전송 대기`, "pending", "tracking");
    saveState(); closeModal(); render(); showToast("송장이 출력되고 역할별 화면에 반영됐습니다.");
  }
  if (form.id === "shipmentCancelForm") {
    const order = state.orders.find(item => item.id === form.dataset.id);
    if (!order || order.status !== "배송중" || !order.provisionalTracking) return showToast("집하 전 자동발급 가송장만 취소할 수 있습니다.");
    order.cancelledTracking = order.tracking; order.cancelledCarrier = order.carrier; order.tracking = ""; order.status = "출고취소"; order.provisionalTracking = false; order.shippingCancelReason = data.reason; order.shippingCancelMemo = data.memo; order.settlementStatus = "excluded";
    Object.keys(order.channelTrackingStatuses || {}).forEach(channelId => { order.channelTrackingStatuses[channelId] = "전송 취소"; });
    pushNotification(order.sellerLoginId, "seller", "shipment", "공급사가 가송장을 취소했습니다", `${order.id} · ${data.reason}`, ["내부 알림"]);
    audit("가송장 출고 취소", `${order.id} · ${order.cancelledCarrier} ${order.cancelledTracking} · ${data.reason} · 외부 택배 API 미호출`, "blocked", "tracking");
    saveState(); closeModal(); render(); updateAccountUI(); showToast("가송장을 취소하고 셀러 화면에 반영했습니다.");
  }
  if (form.id === "productForm") {
    const id = `DF-${4000 + state.products.length * 17}`;
    state.products.unshift({ id, emoji: "📦", imageIndex: Number(data.imageIndex), name: data.name, supplier: workspaceCompany("supplier"), supplierLoginId: currentAccount.loginId, supply: Number(data.supply), recommended: Number(data.recommended), retailPrice: Number(data.retailPrice || 0), purchasePrice: Number(data.purchasePrice), purchaseShipping: data.purchaseShipping, surcharge: Number(data.surcharge || 0), soldOut: data.soldOut, exposure: data.exposure, stock: Number(data.stock), categoryGroup: data.categoryGroup, category: data.category, categorySub: data.categorySub, categoryDetail: data.categoryDetail, status: data.status, tax: data.tax, cutoff: data.cutoff, orderName: data.orderName || data.name, orderUnit: Number(data.orderUnit || 1), shippingPolicy: data.shippingPolicy, carrier: data.carrier, warehouse: data.warehouse, weight: Number(data.weight || 0), unit: data.unit, managementCode: data.managementCode || id, barcode: data.barcode || "", origin: data.origin, originCountry: data.originCountry, deliveryDays: data.deliveryDays, shippingType: data.shippingType, customsRequired: data.shippingType === "overseas", manufactureDate: data.manufactureDate, shelfLife: data.shelfLife, summary: data.summary || "", detail: data.detail, visibility: data.visibility, imported: false });
    audit("공급 상품 등록", `${id} · ${data.name} · AI 썸네일·상세페이지 포함 · 연결 셀러 마켓에 공개되었습니다.`, "done", "product");
    saveState(); closeModal(); render(); showToast("상품이 등록되어 셀러 마켓에 반영됐습니다.");
  }
  if (form.id === "editProductForm") {
    const product = productOf(form.dataset.id);
    const before = `${product.name} / ${product.category} / ${money(product.supply)} / ${money(product.recommended)} / ${product.status}`;
    const oldSupply = product.supply;
    Object.assign(product, { imageIndex: Number(data.imageIndex), name: data.name, supply: Number(data.supply), recommended: Number(data.recommended), retailPrice: Number(data.retailPrice || 0), purchasePrice: Number(data.purchasePrice), purchaseShipping: data.purchaseShipping, surcharge: Number(data.surcharge || 0), soldOut: data.soldOut, exposure: data.exposure, stock: Number(data.stock), categoryGroup: data.categoryGroup, category: data.category, categorySub: data.categorySub, categoryDetail: data.categoryDetail, status: data.status, tax: data.tax, cutoff: data.cutoff, orderName: data.orderName || data.name, orderUnit: Number(data.orderUnit || 1), shippingPolicy: data.shippingPolicy, carrier: data.carrier, warehouse: data.warehouse, weight: Number(data.weight || 0), unit: data.unit, managementCode: data.managementCode || product.id, barcode: data.barcode || "", origin: data.origin, originCountry: data.originCountry, deliveryDays: data.deliveryDays, shippingType: data.shippingType, customsRequired: data.shippingType === "overseas", manufactureDate: data.manufactureDate, shelfLife: data.shelfLife, summary: data.summary || "", detail: data.detail, visibility: data.visibility });
    if (oldSupply !== product.supply) {
      const recipients = [...new Set(state.sellerProducts.filter(item => item.productId === product.id).map(item => item.sellerLoginId))];
      recipients.forEach((recipient,index)=>state.priceAlerts.unshift({ id:`PA-${Date.now()}-${index}`, productId:product.id, recipients:[recipient], oldPrice:oldSupply, newPrice:product.supply, status:"확인필요", createdAt:"방금 전" }));
    }
    audit("상품 정보 수정", `${product.id} · ${before} → ${product.name} / ${product.category} / ${money(product.supply)} / ${money(product.recommended)} / ${product.status}`, oldSupply !== product.supply ? "pending" : "done", "product");
    saveState(); closeModal(); render(); showToast("상품 정보를 수정했습니다.");
  }
  if (form.id === "stockForm") {
    const product = productOf(form.dataset.id), oldStock = product.stock, nextStock = Number(data.stock);
    product.stock = nextStock;
    audit("상품 재고 조정", `${product.id} · 재고 ${oldStock}개 → ${nextStock}개 · ${data.reason}`, nextStock < 50 ? "pending" : "done", "stock");
    saveState(); closeModal(); render(); showToast(`재고를 ${nextStock}개로 반영했습니다.`);
  }
  if (form.id === "simulateOrderForm") {
    const sellerProduct = state.sellerProducts.find(item => item.id === form.dataset.id), product = productOf(sellerProduct.productId), qty = Number(data.qty);
    if (qty > product.stock) {
      state.errors.unshift({ id: `ER-${Date.now()}`, source: "주문 접수", title: "재고 부족", detail: `${product.id} 주문 ${qty}개 / 현재 재고 ${product.stock}개`, time: "방금 전", level: "error" });
      saveState(); closeModal(); showToast("재고가 부족하여 주문을 접수하지 못했습니다."); return;
    }
    const orderId = `DO-${String(Date.now()).slice(-9)}`;
    state.orders.unshift({ id: orderId, sellerLoginId: currentAccount.loginId, supplierLoginId: "", assignedSupplier: product.supplier, productId: product.id, mappedProductId: product.id, externalProductName: sellerProductTitle(sellerProduct, product), externalProductCode: sellerProduct.id, mappingStatus: "mapped", paymentStatus: "pending", paymentMethod: "", supplyTotal: product.supply * qty, forwardedAt: "", customer: data.customer, recipientName: data.recipientName, phone: data.phone, postalCode: data.postalCode, address: data.address, addressDetail: data.addressDetail, deliveryMessage: data.deliveryMessage, shippingType: product.shippingType || "domestic", personalCustomsCode: data.personalCustomsCode || "", qty, amount: sellerProduct.salePrice * qty, channel: data.channel, status: "신규주문", tracking: "", carrier: product.carrier || "한진택배", channelTrackingStatuses: {}, orderDate: "2026-09-13", createdAt: "방금 전", settlementStatus: "pending-payment" });
    const channelId = channelIdFromName(data.channel);
    const ledgerEntry = state.salesLedger.find(item => item.date === "2026-09-08" && item.channel === channelId);
    if (ledgerEntry) { ledgerEntry.sales += sellerProduct.salePrice * qty; ledgerEntry.cost += product.supply * qty; ledgerEntry.orders += 1; }
    else state.salesLedger.push({ date: "2026-09-08", channel: channelId, sales: sellerProduct.salePrice * qty, cost: product.supply * qty, orders: 1 });
    audit("단건 주문 접수·상품코드 자동 매핑", `${orderId} · ${product.id} ${qty}개 · ${data.channel} · 공급가 결제 대기`, "pending", "order");
    saveState(); closeModal(); render(); updateAccountUI(); orderPaymentModal(orderId); showToast(`${product.id} 상품에 매핑했습니다. 공급가를 결제해 주세요.`);
  }
  if (form.id === "doogoMoneyBankForm") {
    const wallet = sellerDeposit();
    if (!data.ownershipConfirmed) return showToast("계좌 명의 확인에 동의해 주세요.");
    const accountNumber = String(data.accountNumber || "").replace(/\D/g, "");
    if (!/^[0-9]{10,16}$/.test(accountNumber)) return showToast("계좌번호는 숫자 10~16자리로 입력해 주세요.");
    wallet.bankAccount = { bankName: data.bankName, holder: data.holder, accountNumber, verified: true, verifiedAt: "방금 전" };
    audit("두고머니 출금 계좌 등록", `${data.bankName} · ${data.holder} · •••• ${accountNumber.slice(-4)} · 데모 계좌 확인`, "done", "money");
    saveState(); render(); updateAccountUI(); doogoMoneyModal(); showToast("두고머니 출금 계좌를 등록했습니다.");
  }
  if (form.id === "doogoMoneyWithdrawForm") {
    const wallet = sellerDeposit();
    const amount = Number(data.amount || 0);
    if (!wallet.bankAccount) return showToast("출금 계좌를 먼저 등록해 주세요.");
    if (amount < 1000 || amount > wallet.balance) return showToast("사용 가능 두고머니 안에서 1,000원 이상 입력해 주세요.");
    const withdrawal = { id: `WD-${String(Date.now()).slice(-9)}`, amount, status: "이체 처리중", bankName: wallet.bankAccount.bankName, accountLast4: wallet.bankAccount.accountNumber.slice(-4), requestedAt: "방금 전" };
    wallet.balance -= amount;
    wallet.withdrawalPending += amount;
    wallet.withdrawals.unshift(withdrawal);
    wallet.transactions.unshift({ id: `DM-${Date.now()}`, type: "계좌 출금 신청", amount: -amount, reference: withdrawal.id, createdAt: "방금 전" });
    audit("두고머니 계좌 출금 신청", `${withdrawal.id} · ${money(amount)} · 사용 가능 잔액 즉시 차감, 은행 이체 결과 대기`, "pending", "money");
    saveState(); render(); updateAccountUI(); doogoMoneyModal(); showToast("출금을 신청했습니다. 사용 가능 두고머니에서 즉시 차감했습니다.");
  }
  if (form.id === "refundRequestForm") {
    const order = state.orders.find(item => item.id === form.dataset.id);
    if (!order || !data.consumerRefunded) return showToast("판매채널의 소비자 환불 완료 여부를 확인해 주세요.");
    const product = orderSourceProduct(order);
    if (!product || !order.supplierLoginId) return showToast("공급사 발주가 완료된 주문에서 환불을 요청해 주세요.");
    const refund = { id: `RF-${String(Date.now()).slice(-8)}`, orderId: order.id, sellerLoginId: order.sellerLoginId, supplierLoginId: order.supplierLoginId, type: data.type, reason: data.reason, detail: data.detail, consumerRefundAmount: Number(data.consumerRefundAmount), amount: Number(data.amount), status: "공급사 검토중", responsibility: "공급사 판단 대기", consumerRefunded: true, consumerRefundedAt: "방금 전", noPickup: false, supplierReceived: false, depositCredited: false, supplierSettlementOffset: false, requestedAt: "방금 전" };
    state.refunds.unshift(refund);
    sellerDeposit(order.sellerLoginId).pending += refund.amount;
    order.status = data.type === "주문 취소" ? "환불접수" : "반품접수";
    order.settlementStatus = "hold";
    pushNotification(order.supplierLoginId, "supplier", "refund", "새 환불 요청을 확인해 주세요", `${order.id} · 소비자 ${money(refund.consumerRefundAmount)} · 공급대금 ${money(refund.amount)} · 회수 여부 선택 필요`, ["운영센터", "이메일"]);
    audit("취소·환불 요청 접수", `${refund.id} · ${order.id} · 소비자 환불 ${money(refund.consumerRefundAmount)} 완료 · 두고머니 예정 ${money(refund.amount)} · 공급사 회수 판단 대기`, "pending", "refund");
    saveState(); closeModal(); activeMenuIndex = 5; render(); updateAccountUI(); showToast("두고에 환불 요청을 접수했습니다.");
  }
  if (form.id === "refundConsultForm") {
    const refund = state.refunds.find(item => item.id === form.dataset.id);
    if (!refund) return showToast("환불 요청을 찾지 못했습니다.");
    refund.status = "협의 필요";
    refund.consultationNote = data.note;
    refund.consultedAt = "방금 전";
    state.connectionMessages.push({ id: `MSG-${Date.now()}`, supplierLoginId: refund.supplierLoginId, sellerLoginId: refund.sellerLoginId, senderLoginId: currentAccount.loginId, text: `[환불 협의 ${refund.orderId}] ${data.note}`, createdAt: "방금 전" });
    pushNotification(refund.sellerLoginId, "seller", "refund", "공급사가 환불 협의를 요청했습니다", `${refund.orderId} · 두고톡에서 내용을 확인해 주세요.`);
    audit("환불 협의 요청", `${refund.id} · 거래처별 두고톡에 ${refund.orderId} 협의 내용을 기록했습니다.`, "pending", "refund");
    saveState(); closeModal(); render(); updateAccountUI(); showToast("기존 거래처 두고톡에 협의 요청을 보냈습니다.");
  }
  if (form.id === "channelConnectForm") {
    const channel = sellerChannels().find(item => item.id === form.dataset.id);
    if (!channel) return showToast("연동할 쇼핑몰 정보를 찾지 못했습니다.");
    channel.status = "connected";
    channel.storeName = data.storeName;
    channel.lastSync = "방금 전";
    channel.trackingAutomation = Boolean(data.tracking);
    channel.syncInterval = 10;
    currentSellerProducts().forEach(item => { item.channelStatuses = item.channelStatuses || {}; if (!item.channelStatuses[channel.id] || item.channelStatuses[channel.id] === "미연동") item.channelStatuses[channel.id] = "판매중지/미노출"; });
    audit("쇼핑몰 테스트 연동", `${channel.name} · ${data.storeName} 연결 상태를 데모로 저장했습니다. 실제 API 전송 없음.`, "done", "channel");
    saveState(); closeModal(); render(); showToast(`${channel.name} 테스트 연결을 완료했습니다.`);
  }
  if (form.id === "dropshippingEmailForm") {
    const notice = notificationService();
    const formData = new FormData(form);
    const selected = new Set(formData.getAll("events"));
    notice.emailEnabled = Boolean(formData.get("emailEnabled"));
    notice.emailAddress = String(formData.get("emailAddress") || "").trim();
    ["orderNotice","trackingNotice","refundNotice","priceNotice","deliveryDelayNotice","stockNotice"].forEach(key => { notice[key] = selected.has(key); });
    audit("드랍쉬핑 이메일 알림 설정", `${notice.emailAddress} · ${notice.emailEnabled ? "수신 켜짐" : "수신 꺼짐"} · ${selected.size}개 이벤트 선택`, "done", "notification");
    saveState(); render(); updateAccountUI(); showToast("드랍쉬핑 이메일 알림 설정을 저장했습니다.");
  }
  if (form.id === "accountSettingsForm") {
    const member = memberByLogin(currentAccount.loginId);
    if (data.company) {
      const companyKey = activeRole === "supplier" ? "supplierCompany" : "company";
      if (member) member[companyKey] = data.company;
      currentAccount[companyKey] = data.company;
    }
    ["representative","contact","email","businessNo","businessType","businessItem","businessAddress","taxInvoiceEmail","bankName","bankAccountNumber","bankAccountHolder","contactTime","supplierVisiblePhone"].forEach(key => { if (data[key] && member) member[key] = data[key]; if (data[key]) currentAccount[key] = data[key]; });
    if (data.displayName) {
      const companyKey = activeRole === "supplier" ? "supplierCompany" : "company";
      if (member) member[companyKey] = data.displayName;
      currentAccount[companyKey] = data.displayName;
    }
    audit("계정 설정 수정", `${currentAccount.loginId} · ${form.dataset.tab} 설정을 저장했습니다.`, "done", "member");
    saveState(); closeModal(); render(); updateAccountUI(); showToast("계정 설정을 저장했습니다.");
  }
  if (form.id === "priceForm") {
    const p = productOf(form.dataset.id), old = p.supply, next = Number(data.newPrice); p.supply = next;
    const recipients = [...new Set(state.sellerProducts.filter(item => item.productId === p.id).map(item => item.sellerLoginId))];
    recipients.forEach((recipient, index) => state.priceAlerts.unshift({ id: `PA-${Date.now()}-${index}`, productId: p.id, recipients: [recipient], oldPrice: old, newPrice: next, status: "확인필요", createdAt: "방금 전" }));
    audit("공급가 변경 감지", `${p.id} 공급가 ${money(old)} → ${money(next)} · ${recipients.length}개 셀러 계정에 빨간색 알림 생성`, "pending", "price");
    saveState(); closeModal(); render(); updateAccountUI(); showToast(`${recipients.length}곳의 위탁셀러에게 가격 알림을 생성했습니다.`);
  }
  if (form.id === "reviewPriceForm") {
    const alert = state.priceAlerts.find(a => a.id === form.dataset.id), product = productOf(alert.productId);
    const sellerProduct = currentSellerProducts().find(x => x.productId === alert.productId);
    const formData = new FormData(form);
    const selected = formData.getAll("channels");
    if (!selected.length) return showToast("판매가를 변경할 채널을 하나 이상 선택해 주세요.");
    sellerProduct.channelDetails = sellerProduct.channelDetails || {};
    selected.forEach(channelId => { const current = sellerChannelDetail(sellerProduct, channelMeta(channelId), product); sellerProduct.channelDetails[channelId] = { ...current, salePrice: Number(formData.get(`price_${channelId}`)) }; });
    sellerProduct.salePrice = Number(sellerProduct.channelDetails[selected[0]].salePrice); sellerProduct.status = "판매중"; alert.status = "반영완료";
    audit("채널 판매가 일괄 변경", `${alert.productId} · ${selected.map(id => channelMeta(id).name).join(", ")} 판매가를 한 번에 변경했습니다.`, "done", "price");
    saveState(); closeModal(); render(); updateAccountUI(); showToast(`${selected.length}개 채널 판매가를 한 번에 변경했습니다.`);
  }
  if (form.id === "rejectMemberForm") {
    const member = state.members.find(item => item.id === form.dataset.id);
    if (!member || member.status !== "pending") return;
    member.status = "rejected";
    member.rejectReason = data.reason;
    audit("사업자 가입 반려", `${member.company} 가입 신청을 반려했습니다. 사유: ${data.reason}`, "blocked", "member");
    saveState(); closeModal(); render(); updateAccountUI(); showToast(`${member.company}의 가입을 반려했습니다.`);
  }
  if (form.id === "supplierApplicationForm") {
    const member = memberByLogin(currentAccount.loginId);
    const file = form.elements.businessFile?.files?.[0];
    const application = { id: `SA-${Date.now()}`, sellerLoginId: currentAccount.loginId, company: data.company, businessNo: data.businessNo, category: data.category, website: data.website, introduction: data.introduction, businessFile: file?.name || "사업자등록증_샘플.pdf", status: "pending", appliedAt: "방금 전", reviewedAt: "", rejectionReason: "", attempt: Number(form.dataset.attempt || 1) };
    state.supplierApplications.push(application);
    pushNotification("admin", "master", "approval", "공급사 요청이 도착했습니다", `${application.company} · ${application.attempt}차 검토`, ["운영센터"]);
    audit("공급사 요청 접수", `${member?.company || currentAccount.loginId} · ${application.company} · ${application.attempt}차 요청`, "pending", "member");
    saveState(); closeModal(); userSwitchModal(); updateAccountUI(); showToast("공급사 요청을 접수했습니다.");
  }
  if (form.id === "supplierApplicationRejectForm") {
    const application = state.supplierApplications.find(item => item.id === form.dataset.id);
    if (!application || application.status !== "pending") return;
    application.status = "rejected"; application.reviewedAt = "방금 전"; application.rejectionReason = data.reason;
    pushNotification(application.sellerLoginId, "seller", "approval", "공급사 요청이 반려되었습니다", data.reason, ["운영센터"]);
    audit("공급사 요청 반려", `${application.company} · ${data.reason}`, "blocked", "member");
    saveState(); closeModal(); render(); updateAccountUI(); showToast("반려 사유를 신청자에게 전달했습니다.");
  }
});

document.getElementById("guideButton").addEventListener("click", guideModal);
document.getElementById("dismissNotice")?.addEventListener("click", e => e.currentTarget.parentElement.remove());
document.getElementById("resetDemo")?.addEventListener("click", () => { state = cloneInitial(); saveState(); activeRole = accountRoles().includes(activeRole) ? activeRole : (currentAccount?.role || "seller"); render(); updateAccountUI(); showToast("샘플 데이터를 처음 상태로 돌렸습니다."); });
document.getElementById("logoutButton").addEventListener("click", () => { const role = currentAccount?.role; sessionStorage.removeItem(AUTH_KEY); if (role === "supplier" || role === "master") showPartnerLogin(role); else showLogin(); });
document.getElementById("modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
document.getElementById("addressPopup").addEventListener("click", e => { if (e.target.id === "addressPopup") closeAddressPopup(); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && document.getElementById("appView").dataset.sidebarOpen === "true") { closeMobileSidebar(true); return; }
  if (e.key === "Escape" && !document.getElementById("addressPopup").hidden) { closeAddressPopup(); return; }
  if (e.key === "Escape") closeModal();
  if ((e.key === "Enter" || e.key === " ") && e.target.matches(".market-product-card")) { e.preventDefault(); productDetailModal(e.target.dataset.id); }
  if ((e.key === "Enter" || e.key === " ") && e.target.matches(".order-click-row")) { e.preventDefault(); orderDetailModal(e.target.dataset.id); }
});

window.addEventListener("resize", () => {
  if (!window.matchMedia("(max-width: 720px)").matches) closeMobileSidebar();
  else if (document.getElementById("appView").dataset.sidebarOpen !== "true") document.getElementById("appSidebar").inert = true;
});

document.getElementById("globalSearch").addEventListener("keydown", event => {
  if (event.key !== "Enter") return;
  const query = event.currentTarget.value.trim().toLowerCase();
  if (!query) return;
  const scopedOrders = activeRole === "seller" ? currentSellerOrders() : activeRole === "supplier" ? currentSupplierOrders() : state.orders;
  const order = scopedOrders.find(item => [item.id, item.customer, item.recipientName, item.phone].some(value => String(value || "").toLowerCase().includes(query)));
  if (order) {
    activeMenuIndex = activeRole === "master" ? 6 : activeRole === "supplier" ? 3 : 4;
    if (activeRole === "seller") sellerOrderSearch = event.currentTarget.value.trim();
    render(); updateAccountUI(); orderDetailModal(order.id); return;
  }
  showToast("일치하는 주문번호 또는 주문자를 찾지 못했습니다.");
});

function startTyping(elementId, messages) {
  const element = document.getElementById(elementId);
  if (!element) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { element.textContent = messages[0]; return; }
  let messageIndex = 0, characterIndex = 0, deleting = false;
  const tick = () => {
    const message = messages[messageIndex];
    characterIndex += deleting ? -1 : 1;
    element.textContent = message.slice(0, Math.max(0, characterIndex));
    let delay = deleting ? 32 : 70;
    if (!deleting && characterIndex >= message.length) { deleting = true; delay = 1800; }
    else if (deleting && characterIndex <= 0) { deleting = false; messageIndex = (messageIndex + 1) % messages.length; delay = 420; }
    setTimeout(tick, delay);
  };
  tick();
}

const requestedPortal = new URLSearchParams(window.location.search).get("portal");
initAuth();
if (requestedPortal === "partner") showPartnerLogin("supplier");
if (requestedPortal === "master") showPartnerLogin("master");
startTyping("sellerTypingText", ["좋은 공급상품을 소싱받아,\n원클릭으로 바로 판매를 시작해보세요.", "주문부터 송장 전송까지,\n드랍쉬핑을 자동화하세요.", "브랜드와 셀러가 만나는 곳,\n두고입니다."]);
startTyping("partnerTypingText", ["내 브랜드 상품을 등록하고,\n새로운 셀러를 만나세요.", "상품과 주문을 한곳에서,\n운영은 더 정확하게.", "공급과 판매가 연결되는 곳,\n두고입니다."]);
window.setInterval(() => runSellerTrackingSync(false), 10 * 60 * 1000);
