// 농수산물 백과사전 품목 데이터 — 두고푸드가 직접 정리한 참고용 정보입니다.
// season: 1~12월 한 글자씩 (K 성수기 · H 출하 · E 끝물 · S 저장 판매 · P 준비 기간(산지 연락) · - 비수기)
// match/exclude/pattern: 두고푸드 단가표 상품명에서 이 품목을 찾는 말(운영 상품명 기준으로 맞춤)
import type { ProduceCs, ProduceItem } from "./encyclopedia";

const SWEET_POTATO_CS: ProduceCs[] = [
  { q: "고구마가 썩어서 왔어요", a: "고구마는 10℃ 아래에서 상합니다. '냉장고 말고 서늘한 실내에 신문지로 싸서 보관'을 상세 위쪽에 크게 적어 두세요." },
  { q: "단맛이 덜해요", a: "수확 직후보다 2~3주 숙성(큐어링) 뒤 단맛이 오릅니다. 출하 시기와 숙성 여부를 상세에 적어 주세요." },
  { q: "크기가 제각각이에요", a: "한입·중·특상처럼 옵션마다 크기 기준(g 또는 cm)을 숫자로 보여 주세요." }
];

export const LIVE_SHELLFISH_CS: ProduceCs[] = [
  { q: "모래가 씹혀요", a: "조개류는 해감이 필요합니다. 소금물 해감 방법과 시간을 사진으로 안내하세요." },
  { q: "입을 벌린 것이 많아요", a: "살아 있는 조개는 건드리면 입을 닫습니다. 죽은 조개 비율에 따른 보상 기준을 미리 정해 두세요." },
  { q: "어떻게 손질해요?", a: "솔로 닦기·삶는 시간 같은 손질·조리법을 상세에 함께 보여 주세요." }
];

export const PRODUCE_ITEMS: ProduceItem[] = [
  // ───────── 과일 ─────────
  {
    id: "apple-fuji", name: "사과(부사)", group: "사과", category: "과일", emoji: "🍎", tone: "red",
    season: "SSSSSSE-PHKK", ship: "상온", risk: "보통", level: 5, keyword: "부사 사과",
    origin: "경북 청송·영주·안동, 충북 충주",
    grow: "노지·저장", tags: ["선물", "명절", "간식"],
    tip: "11월 햇부사가 나오면 '꿀 사과'를 찾는 사람이 크게 늘어납니다. 꿀(밀병)은 해마다 다르니 '꿀은 보장하지 않습니다'를 미리 적어 두고, 봄 이후에는 '저장 사과'라고 밝히고 파는 것이 좋습니다.",
    cs: [
      { q: "꿀(밀병)이 없어요", a: "꿀은 품종·날씨에 따라 생기는 것이라 보장할 수 없다는 문구를 상세 위쪽과 옵션명 근처에 두세요." },
      { q: "푸석하고 아삭하지 않아요", a: "3월 이후 저장 사과는 식감이 달라질 수 있다고 적고, 저온(CA) 저장 여부를 산지에 확인해 함께 쓰세요." },
      { q: "멍이 들어 왔어요", a: "난좌(과일 받침)·완충재 포장인지 확인하고, 도착 사진으로 부분 보상하는 기준을 미리 정하세요." }
    ],
    match: ["부사"]
  },
  {
    id: "apple-hongro", name: "홍로", group: "사과", category: "과일", emoji: "🍎", tone: "red",
    season: "------PHKE--", ship: "상온", risk: "보통", level: 4, keyword: "홍로 사과", origin: "경북 영주·청송, 충북",
    grow: "노지", tags: ["명절", "선물"],
    tip: "추석 차례상과 선물용으로 많이 찾는 9월 사과입니다. 저장성이 약해 추석이 지나면 맛과 값이 함께 떨어지니, 추석 2~3주 전에 판매를 열고 추석 뒤에는 물량을 줄이세요.",
    match: ["홍로"]
  },
  {
    id: "apple-shinano", name: "시나노골드", group: "사과", category: "과일", emoji: "🍏", tone: "yellow",
    season: "SE------PKKS", ship: "상온", risk: "보통", level: 4, keyword: "시나노골드", origin: "경북 영주·청송·봉화",
    grow: "노지", tags: ["선물", "간식"],
    tip: "노란 껍질에 새콤달콤한 맛이라 '노란 사과'로 소개하면 반응이 좋습니다. 수확 기간이 짧아 10월에 물량을 확보해 두고, 부사와 섞은 혼합 선물세트로 객단가를 올려 보세요.",
    match: ["시나노"]
  },
  {
    id: "apple-gamhong", name: "감홍", group: "사과", category: "과일", emoji: "🍎", tone: "red",
    season: "--------PKE-", ship: "상온", risk: "보통", level: 3, keyword: "감홍 사과", origin: "경북 문경·봉화",
    grow: "노지", tags: ["선물", "별미"],
    tip: "당도가 아주 높은 대신 생산량이 적고 시즌이 짧아 아는 사람만 찾는 사과입니다. '문경 감홍'처럼 산지 이름을 함께 써 검색을 잡고, 10월 한 달에 판매를 집중하세요.",
    match: ["감홍"]
  },
  {
    id: "apple-summer", name: "여름 사과(아오리)", group: "사과", category: "과일", emoji: "🍏", tone: "green",
    season: "-----PHKE---", ship: "상온", risk: "보통", level: 3, keyword: "아오리 사과", origin: "경북, 충북",
    grow: "노지", tags: ["간식", "별미"],
    tip: "7~8월에만 나오는 풋사과로 새콤한 맛을 좋아하는 고객과 첫 사과를 기다리는 고객이 찾습니다. 익을수록 푸석해지니 '받으면 냉장 보관, 빨리 드세요'를 꼭 적어 주세요.",
    match: ["아오리", "썸머킹", "쓰가루"]
  },
  {
    id: "pear", name: "배(신고)", group: "배", category: "과일", emoji: "🍐", tone: "yellow",
    season: "SSSSE--PHKKS", ship: "상온", risk: "보통", level: 4, keyword: "신고배", origin: "전남 나주, 충남 천안·아산, 울산",
    grow: "노지·저장", tags: ["명절", "선물"],
    tip: "추석과 설 선물로 가장 많이 팔리는 과일입니다. 한 상자 과수(개수)에 따라 값 차이가 크니 '7.5kg 9~11과'처럼 무게와 과수를 함께 적어 비교하기 쉽게 만드세요.",
    cs: [
      { q: "배가 깨지거나 멍들었어요", a: "배는 눌림에 약합니다. 개별 캡(스티로폼망)과 칸막이 포장인지 확인하고 사진 접수 기준을 적어 두세요." },
      { q: "단맛이 덜해요", a: "수확 직후보다 저장·숙성 뒤 단맛이 오른다는 점과 산지 당도 기준을 함께 안내하세요." },
      { q: "받는 분 주소로 보내고 싶어요", a: "명절에는 받는 분 주소를 따로 받는 방법과 명절 전 출고 마감일을 미리 공지하세요." }
    ],
    match: ["신고배", "나주배"], exclude: ["원황", "즙"]
  },
  {
    id: "persimmon-sweet", name: "단감", group: "감", category: "과일", glyph: "감", tone: "orange",
    season: "E------PHKKS", ship: "상온", risk: "보통", level: 4, keyword: "단감", origin: "경남 창원·진주·김해",
    grow: "노지", tags: ["간식"],
    tip: "껍질째 아삭하게 먹는 감이라 단단한 감을 원하는 고객이 많습니다. 상온에 두면 금방 물러지니 '냉장 보관하면 오래 아삭합니다'를 상세에 크게 적어 주세요.",
    match: ["단감"], exclude: ["태추"]
  },
  {
    id: "persimmon-taechu", name: "태추 단감", group: "감", category: "과일", glyph: "감", tone: "orange",
    season: "--------PHKE", ship: "상온", risk: "보통", level: 3, keyword: "태추단감", origin: "경남, 전남",
    grow: "노지", tags: ["선물", "간식"],
    tip: "일반 단감보다 크고 즙이 많은 품종이라 '배처럼 아삭한 큰 단감'으로 소개하면 좋습니다. 늦가을 짧은 기간에 나오니 10월 말에 예약 판매를 미리 열어 두세요.",
    match: ["태추"]
  },
  {
    id: "persimmon-daebong", name: "대봉감", group: "감", category: "과일", glyph: "감", tone: "orange",
    season: "E-------PHKK", ship: "상온", risk: "높음", level: 3, keyword: "대봉감", origin: "전남 영암·광양, 경북 상주",
    grow: "노지", tags: ["선물", "간식"],
    tip: "단단한 상태로 보내 집에서 홍시로 익혀 먹는 감입니다. '받은 직후에는 떫어요, 상온에서 1~2주 익혀 드세요'를 가장 위에 적지 않으면 떫다는 문의가 쏟아집니다.",
    cs: [
      { q: "떫어서 못 먹겠어요", a: "대봉은 익혀 먹는 감이라 도착 직후에는 떫습니다. 후숙 방법(상온·사과와 함께 두기)과 먹기 좋은 상태 사진을 보여 주세요." },
      { q: "익히다가 곰팡이가 났어요", a: "꼭지가 젖지 않게 꼭지를 아래로 두고 서늘한 곳에서 익히라고 안내하세요." },
      { q: "터진 감이 섞여 왔어요", a: "익은 감은 터지기 쉽습니다. 단단한 대봉 위주로 보내는지, 칸막이 포장을 쓰는지 확인하세요." }
    ],
    match: ["대봉"], exclude: ["곶감", "건시", "말랭이"]
  },
  {
    id: "persimmon-bansi", name: "청도 반시", group: "감", category: "과일", glyph: "감", tone: "orange",
    season: "-------PHKE-", ship: "상온", risk: "높음", level: 2, keyword: "청도반시", origin: "경북 청도",
    grow: "노지", tags: ["간식", "별미"],
    tip: "씨 없는 납작한 감으로 대부분 홍시나 아이스 홍시로 팝니다. 익은 홍시는 배송 중 터지기 쉬우니, 처음에는 단단한 반시를 보내 집에서 익히는 상품부터 시작하세요.",
    match: ["반시", "홍시"], exclude: ["대봉"]
  },
  {
    id: "persimmon-dried", name: "곶감", group: "곶감·말랭이", category: "가공·김장", glyph: "곶감", tone: "orange",
    season: "KE-------PHK", ship: "냉장", risk: "보통", level: 4, keyword: "상주곶감", origin: "경북 상주, 충북 영동, 경남 산청",
    grow: "건조 가공", tags: ["명절", "선물", "간식"],
    tip: "설 선물 수요가 가장 큰 품목입니다. 말랑한 반건시와 쫀득한 건시의 차이를 사진으로 보여 주고, 하얀 가루(시상)는 곰팡이가 아니라 당분이라는 안내를 꼭 넣으세요.",
    cs: [
      { q: "하얀 가루가 곰팡이 아닌가요?", a: "곶감 겉의 하얀 가루는 당분이 올라온 시상입니다. 곰팡이(초록·검은 점, 솜털)와 구별하는 사진을 함께 보여 주세요." },
      { q: "너무 딱딱해요(너무 물러요)", a: "건시·반건시의 수분 차이와 보관 온도를 옵션 이름에 적어 기대와 다르지 않게 하세요." },
      { q: "설 전에 받을 수 있나요?", a: "설 연휴 택배 마감일을 상세와 공지에 미리 적고, 마감 뒤 주문은 연휴 뒤 출고로 안내하세요." }
    ],
    match: ["곶감", "건시"]
  },
  {
    id: "mandarin", name: "감귤", group: "감귤·만감류", category: "과일", emoji: "🍊", tone: "orange",
    season: "KE------PHKK", ship: "상온", risk: "보통", level: 5, keyword: "제주 감귤", origin: "제주",
    grow: "노지", tags: ["간식", "선물"],
    tip: "겨울 대표 과일로 검색량이 가장 많은 품목 중 하나입니다. 2S~2L 크기 기준을 표로 보여 주고, 10월 극조생은 새콤하고 12월로 갈수록 달아진다는 시기별 맛 차이를 알려 주면 재구매가 늘어요.",
    cs: [
      { q: "상한 귤이 섞여 왔어요", a: "감귤은 한두 개 상하는 일이 잦습니다. '받는 즉시 상자를 열어 골라 주세요'와 사진 접수 후 개수만큼 보상하는 기준을 적어 두세요." },
      { q: "너무 시어요", a: "시즌 초 극조생은 신맛이 강합니다. 출하 시기와 당도(브릭스)를 옵션 옆에 적어 주세요." },
      { q: "크기가 섞여 왔어요", a: "랜덤과·혼합과는 크기가 섞인다는 점을 옵션명에 분명히 쓰세요." }
    ],
    match: ["감귤"], exclude: ["하우스"]
  },
  {
    id: "hallabong", name: "한라봉", group: "감귤·만감류", category: "과일", emoji: "🍊", tone: "orange",
    season: "KKSE------PH", ship: "상온", risk: "보통", level: 4, keyword: "한라봉", origin: "제주",
    grow: "하우스·노지", tags: ["명절", "선물"],
    tip: "꼭지가 볼록 튀어나온 모양이 특징이고 설 선물로 많이 나갑니다. 숙성을 거친 2월 전후가 가장 달아 12월부터 '설 선물 예약'을 받는 셀러가 많아요.",
    match: ["한라봉"]
  },
  {
    id: "cheonhyehyang", name: "천혜향", group: "감귤·만감류", category: "과일", emoji: "🍊", tone: "orange",
    season: "HKKE-------P", ship: "상온", risk: "보통", level: 3, keyword: "천혜향", origin: "제주",
    grow: "하우스", tags: ["선물"],
    tip: "껍질이 얇고 향이 진해 '향이 좋은 귤'로 소개하기 좋습니다. 껍질이 얇아 눌림에 약하니 낱개 포장이나 칸막이 여부를 산지에 확인하세요.",
    match: ["천혜향"]
  },
  {
    id: "redhyang", name: "레드향", group: "감귤·만감류", category: "과일", emoji: "🍊", tone: "red",
    season: "KKE-------PH", ship: "상온", risk: "보통", level: 3, keyword: "레드향", origin: "제주",
    grow: "하우스", tags: ["선물", "명절"],
    tip: "붉은빛 껍질과 높은 당도로 겨울 선물용 인기가 많습니다. 한라봉·천혜향과 묶은 '만감류 맛보기 세트'로 구성하면 처음 사는 고객도 쉽게 고릅니다.",
    match: ["레드향"]
  },
  {
    id: "hwanggeumhyang", name: "황금향", group: "감귤·만감류", category: "과일", emoji: "🍊", tone: "yellow",
    season: "E------PHKKK", ship: "상온", risk: "보통", level: 3, keyword: "황금향", origin: "제주",
    grow: "하우스·노지", tags: ["선물", "명절"],
    tip: "추석 무렵 하우스 물량부터 나오기 시작하는 가을 만감류입니다. 껍질이 잘 까지고 과즙이 많아 '가을 선물 귤'로 소개하고, 선물용과 가정용 크기를 나눠 파세요.",
    match: ["황금향"]
  },
  {
    id: "lemon", name: "레몬", group: "레몬·수입 과일", category: "과일", emoji: "🍋", tone: "yellow",
    season: "KKHHHHHHHHKK", ship: "상온", risk: "낮음", level: 4, keyword: "레몬", origin: "수입(미국·칠레 등), 제주",
    grow: "수입·노지", tags: ["홈카페", "대용량"],
    tip: "수입 레몬은 1년 내내 나오고 제주 국산 레몬은 겨울에 잠깐 나옵니다. 레몬청·레몬수용 대량 구매가 많으니 10개·20개·30개처럼 개수 단위 옵션을 두면 고르기 쉬워요.",
    match: ["레몬"], exclude: ["클린톡스", "레몬즙", "레몬청", "원액", "스틱", "젤리"]
  },
  {
    id: "orange", name: "오렌지", group: "레몬·수입 과일", category: "과일", emoji: "🍊", tone: "orange",
    season: "KKKKEHHH--PH", ship: "상온", risk: "낮음", level: 4, keyword: "네이블 오렌지", origin: "수입(미국 캘리포니아 등)",
    grow: "수입", tags: ["간식", "홈카페"],
    tip: "미국산 네이블 오렌지가 들어오는 겨울~봄이 가장 맛있고 값도 좋습니다. 개당 무게(g)와 과수로 크기를 보여 주고, 착즙용 대용량 옵션을 따로 두세요.",
    match: ["오렌지"], exclude: ["주스", "쥬스", "즙"]
  },
  {
    id: "grapefruit", name: "자몽", group: "레몬·수입 과일", category: "과일", glyph: "자몽", tone: "pink",
    season: "KKKKHHHHHHHK", ship: "상온", risk: "낮음", level: 3, keyword: "자몽", origin: "수입(미국·이스라엘·남아공)",
    grow: "수입", tags: ["다이어트", "홈카페"],
    tip: "다이어트와 홈카페 수요로 꾸준히 팔리는 수입 과일입니다. 쓴맛을 걱정하는 고객이 많으니 '루비(붉은 속) 자몽'처럼 속 색과 맛을 함께 적어 주세요.",
    match: ["자몽"], exclude: ["에이드", "자몽청"]
  },
  {
    id: "yuzu", name: "유자", group: "레몬·수입 과일", category: "과일", emoji: "🍋", tone: "yellow",
    season: "---------PKE", ship: "상온", risk: "보통", level: 2, keyword: "고흥 유자", origin: "전남 고흥, 경남 거제",
    grow: "노지", tags: ["청·담금", "홈카페"],
    tip: "생과는 11~12월에 짧게 나오고 대부분 유자청을 담그는 용도로 팝니다. '유자청 담그기용'처럼 쓰임새를 앞에 쓰고 3kg·5kg 단위로 준비하세요.",
    match: ["유자"], exclude: ["유자차", "유자청"]
  },
  {
    id: "grape", name: "포도(캠벨·거봉)", group: "포도", category: "과일", emoji: "🍇", tone: "purple",
    season: "-----PHKKE--", ship: "상온", risk: "높음", level: 3, keyword: "캠벨 포도", origin: "경북 김천·영천·상주, 충북 영동",
    grow: "노지·비가림", tags: ["간식"],
    tip: "포도는 송이에서 알이 떨어지는(탈립) 문의가 많은 과일입니다. 한 송이씩 봉지 포장하는지, 송이 수와 무게를 함께 적었는지 확인하고 '알 떨어짐은 품질과 무관'이라는 안내를 넣으세요.",
    cs: [
      { q: "알이 다 떨어져서 왔어요", a: "배송 중 알 떨어짐(탈립)이 생길 수 있다고 적고, 알만 떨어진 경우와 무른 경우의 보상 기준을 나눠 두세요." },
      { q: "하얀 가루가 묻어 있어요", a: "포도 겉의 하얀 가루(과분)는 신선하다는 표시라는 안내를 사진과 함께 넣으세요." },
      { q: "너무 셔요", a: "수확 시기별 당도 차이와 산지에서 잰 당도를 함께 적어 주세요." }
    ],
    match: ["포도", "캠벨", "거봉"], exclude: ["샤인", "건포도", "포도즙", "주스"]
  },
  {
    id: "grape-shine", name: "샤인머스캣", group: "포도", category: "과일", emoji: "🍇", tone: "green",
    season: "E----PHKKKSS", ship: "상온", risk: "보통", level: 4, keyword: "샤인머스캣", origin: "경북 김천·상주·영천, 충북 영동",
    grow: "비가림·하우스", tags: ["선물", "명절", "간식"],
    tip: "씨 없이 껍질째 먹는 청포도로 송이 크기·알 굵기·당도에 따라 값이 크게 달라집니다. '2kg 3~4송이, 당도 18브릭스 이상'처럼 숫자로 비교할 수 있게 쓰면 믿음이 갑니다.",
    match: ["샤인"]
  },
  {
    id: "peach", name: "복숭아", group: "복숭아·자두", category: "과일", emoji: "🍑", tone: "pink",
    season: "----PHKKE---", ship: "상온", risk: "높음", level: 2, keyword: "복숭아", origin: "경북 영천·청도, 충북 음성·충주",
    grow: "노지", tags: ["간식", "별미"],
    tip: "여름 인기 과일이지만 눌림·무름에 아주 약해 클레임이 가장 많은 과일 중 하나입니다. 딱딱이와 물렁이를 나눠 팔고, 품종이 2주 단위로 바뀌니 산지와 출하 일정을 자주 맞추세요.",
    cs: [
      { q: "멍들고 물러서 왔어요", a: "복숭아는 손자국만으로도 멍이 듭니다. 개별 캡·난좌 포장과 아이스팩 여부를 확인하고, 도착 당일 사진 접수 기준을 정해 두세요." },
      { q: "딱딱해요(물렁해요)", a: "딱딱이·물렁이 중 어떤 복숭아인지 상품명에 쓰고, 물렁이는 상온 후숙 방법을 안내하세요." },
      { q: "주문한 품종이 아니에요", a: "복숭아는 시기마다 품종이 바뀝니다. '시기별로 품종이 바뀔 수 있음'을 상세에 적어 두세요." }
    ],
    match: ["복숭아", "백도", "황도"], exclude: ["천도", "통조림", "신비", "납작"]
  },
  {
    id: "nectarine", name: "천도복숭아", group: "복숭아·자두", category: "과일", emoji: "🍑", tone: "red",
    season: "----PHKE----", ship: "상온", risk: "보통", level: 3, keyword: "천도복숭아", origin: "경북 영천·경산",
    grow: "노지", tags: ["간식"],
    tip: "털이 없고 새콤달콤해 껍질째 먹기 좋다는 점을 강조하세요. 일반 복숭아보다 단단해 배송이 조금 수월하지만, 더운 날에는 아이스팩 여부를 꼭 확인하세요.",
    match: ["천도"], exclude: ["신비"]
  },
  {
    id: "plum", name: "자두", group: "복숭아·자두", category: "과일", glyph: "자두", tone: "purple",
    season: "----PHKE----", ship: "상온", risk: "보통", level: 3, keyword: "자두", origin: "경북 김천·의성",
    grow: "노지", tags: ["간식", "별미"],
    tip: "6월 대석, 7월 후무사처럼 품종이 바뀌며 한여름에 짧게 팝니다. 덜 익으면 시고 다 익으면 무르기 쉬우니 '받고 1~2일 상온 후숙' 안내를 함께 쓰세요.",
    match: ["자두"], exclude: ["푸룬", "건자두"]
  },
  {
    id: "watermelon", name: "수박", group: "수박·참외·멜론", category: "과일", emoji: "🍉", tone: "green",
    season: "---PHKKE----", ship: "상온", risk: "보통", level: 3, keyword: "수박", origin: "충북 음성, 전북 고창, 경남 함안",
    grow: "하우스·노지", tags: ["간식"],
    tip: "무게가 커서 택배비 비중이 높은 과일입니다. 공급가에 택배비가 들어가는지 꼭 확인하고, 깨짐 보상 기준(사진 접수)을 미리 정한 뒤 판매하세요.",
    match: ["수박"], exclude: ["애플수박", "미니수박"]
  },
  {
    id: "chamoe", name: "참외", group: "수박·참외·멜론", category: "과일", emoji: "🍈", tone: "yellow",
    season: "-PHKKKEE----", ship: "상온", risk: "보통", level: 4, keyword: "성주 참외", origin: "경북 성주",
    grow: "하우스", tags: ["간식"],
    tip: "봄부터 초여름까지 꾸준히 팔리는 국민 과일입니다. '로얄과·꼬마 참외'처럼 크기별 이름을 붙여 고르기 쉽게 하고, 꼭지 쪽이 무르기 쉬우니 냉장 보관 안내를 넣으세요.",
    match: ["참외"]
  },
  {
    id: "melon", name: "멜론", group: "수박·참외·멜론", category: "과일", emoji: "🍈", tone: "green",
    season: "----PHKKE---", ship: "상온", risk: "보통", level: 3, keyword: "머스크멜론", origin: "전남 곡성, 충남 논산, 경북 고령",
    grow: "하우스", tags: ["선물", "간식"],
    tip: "먹기 좋은 때를 맞추는 것이 핵심입니다. '꼭지 주변이 말랑해지면 드세요'처럼 후숙 신호를 사진으로 보여 주면 맛이 없다는 문의가 크게 줄어요.",
    match: ["멜론", "메론"]
  },
  {
    id: "strawberry", name: "딸기", group: "딸기·베리", category: "과일", emoji: "🍓", tone: "red",
    season: "KKKEE----PHH", ship: "냉장", risk: "높음", level: 2, keyword: "딸기", origin: "충남 논산, 경남 산청·진주, 전남 담양",
    grow: "하우스", tags: ["간식", "선물"],
    tip: "겨울~봄 대표 과일이지만 무르기 쉬워 배송 난도가 높습니다. 딸기가 겹치지 않는 1단 포장인지, 수확 당일 출고인지 확인하고 처음에는 소량 예약 판매로 시작해 보세요.",
    match: ["딸기"], exclude: ["잼", "우유", "딸기청", "산딸기"]
  },
  {
    id: "blueberry", name: "블루베리", group: "딸기·베리", category: "과일", emoji: "🫐", tone: "blue",
    season: "---PHKKE----", ship: "냉장", risk: "보통", level: 3, keyword: "국산 블루베리", origin: "전북 고창, 충북, 경기",
    grow: "노지·하우스·수입", tags: ["간식", "다이어트"],
    tip: "국산 생 블루베리는 6~7월에 잠깐 나오고 그 밖의 달에는 수입·냉동 블루베리가 팔립니다. 생과는 '받는 즉시 냉장'을, 냉동은 해동하면 무른 식감이 된다는 점을 미리 알려 주세요.",
    match: ["블루베리"], exclude: ["퓨레", "즙", "잼", "건조"]
  },
  {
    id: "cherry", name: "체리", group: "딸기·베리", category: "과일", emoji: "🍒", tone: "red",
    season: "H---HKKE---H", ship: "냉장", risk: "보통", level: 3, keyword: "체리", origin: "수입(미국·칠레)",
    grow: "수입", tags: ["간식", "선물"],
    tip: "미국산은 초여름, 칠레산은 겨울에 들어옵니다. 알 크기에 따라 값이 다르니 크기 표기를 함께 쓰고, 꼭지 마름은 품질과 상관없다는 안내를 넣으세요.",
    match: ["체리"], exclude: ["토마토"]
  },
  {
    id: "kiwi", name: "키위", group: "키위·열대 과일", category: "과일", emoji: "🥝", tone: "green",
    season: "KKKEHHHHHHKK", ship: "상온", risk: "보통", level: 4, keyword: "골드키위", origin: "제주·전남(국산), 뉴질랜드(수입)",
    grow: "노지·수입", tags: ["간식"],
    tip: "국산 키위는 겨울~봄, 뉴질랜드산은 초여름~가을에 나와 1년 내내 팔 수 있습니다. 단단하게 도착하는 경우가 많아 '사과와 함께 두면 빨리 익어요' 같은 후숙 방법을 꼭 적어 주세요.",
    cs: [
      { q: "딱딱하고 시어요", a: "키위는 후숙 과일입니다. 상온 후숙 방법과 먹기 좋은 말랑함 정도를 안내하세요." },
      { q: "너무 물러서 왔어요", a: "더운 날에는 후숙이 빨리 진행됩니다. 단단한 상태로 보내는지 산지에 확인하세요." },
      { q: "그린과 골드 차이가 뭐예요?", a: "새콤한 그린, 달콤한 골드처럼 맛 차이를 한 줄로 비교해 두세요." }
    ],
    match: ["키위"]
  },
  {
    id: "mango", name: "망고", group: "키위·열대 과일", category: "과일", emoji: "🥭", tone: "yellow",
    season: "HHHHHKKKHHHH", ship: "상온", risk: "보통", level: 3, keyword: "애플망고", origin: "제주·전남(국산 애플망고), 태국·페루(수입)",
    grow: "하우스·수입", tags: ["선물"],
    tip: "수입 망고는 1년 내내, 국산 애플망고는 여름에 나옵니다. 국산은 값이 높은 만큼 선물세트로 구성하고, 수입 망고는 골드망고·애플망고 차이를 사진으로 비교해 주세요.",
    match: ["망고"], exclude: ["망고스틴", "젤리", "주스"]
  },
  {
    id: "banana", name: "바나나", group: "키위·열대 과일", category: "과일", emoji: "🍌", tone: "yellow",
    season: "HHHHHHHHHHHH", ship: "상온", risk: "낮음", level: 3, keyword: "바나나", origin: "수입(필리핀·에콰도르 등)",
    grow: "수입", tags: ["간식", "대용량"],
    tip: "1년 내내 값이 안정적인 수입 과일입니다. 초록빛으로 도착해 노랗게 익는다는 점과 검은 반점(슈가 스팟)은 잘 익은 표시라는 점을 사진으로 안내하세요.",
    match: ["바나나"], exclude: ["우유", "칩"]
  },
  {
    id: "avocado", name: "아보카도", group: "키위·열대 과일", category: "과일", emoji: "🥑", tone: "green",
    season: "HHHHHHHHHHHH", ship: "상온", risk: "보통", level: 2, keyword: "아보카도", origin: "수입(멕시코·페루 등)",
    grow: "수입", tags: ["다이어트", "집밥"],
    tip: "먹기 좋은 때를 맞추기 어려워 '딱딱해요', '속이 까매요' 문의가 잦습니다. 익는 단계별 껍질 색 사진과 '살짝 눌러서 들어가면 먹기 좋아요'를 적어 주세요.",
    match: ["아보카도"]
  },
  {
    id: "pomegranate", name: "석류", group: "키위·열대 과일", category: "과일", glyph: "석류", tone: "red",
    season: "KE------PHKK", ship: "상온", risk: "낮음", level: 3, keyword: "석류", origin: "수입(미국·튀르키예 등)",
    grow: "수입", tags: ["다이어트", "홈카페"],
    tip: "가을~겨울에 수입 생과가 들어옵니다. 겉모양보다 알맹이 색이 중요하니 반으로 자른 사진을 대표로 쓰고, 알 쉽게 빼는 법을 함께 소개해 보세요.",
    match: ["석류"], exclude: ["콜라겐", "즙", "젤리", "스틱"]
  },
  {
    id: "fig", name: "무화과", group: "무화과·매실", category: "과일", glyph: "무화과", tone: "purple",
    season: "------PHKE--", ship: "냉장", risk: "높음", level: 1, keyword: "영암 무화과", origin: "전남 영암·해남",
    grow: "노지·하우스", tags: ["별미"],
    tip: "수확 뒤 2~3일이면 물러지는 아주 예민한 과일입니다. 산지에서 바로 보내는 냉장 배송이 아니면 클레임이 잦으니, 경험을 쌓은 뒤 예약 판매로 짧게 운영하세요.",
    match: ["무화과"]
  },
  {
    id: "maesil", name: "매실", group: "무화과·매실", category: "과일", glyph: "매실", tone: "green",
    season: "---PHKE-----", ship: "상온", risk: "보통", level: 3, keyword: "청매실", origin: "전남 광양·순천, 경남 하동",
    grow: "노지", tags: ["청·담금"],
    tip: "매실청을 담그는 6월 초 2~3주가 판매의 거의 전부입니다. 5월부터 예약을 받고 청매실·황매실 차이와 담그기 좋은 날짜를 함께 써 주세요.",
    match: ["매실"], exclude: ["매실청", "매실액", "원액"]
  },
  {
    id: "quince", name: "모과", group: "무화과·매실", category: "과일", glyph: "모과", tone: "yellow",
    season: "--------PKKE", ship: "상온", risk: "낮음", level: 3, keyword: "모과", origin: "충북, 전남",
    grow: "노지", tags: ["청·담금"],
    tip: "향이 좋아 모과청·방향용으로 찾는 가을 과일입니다. 겉에 끈적한 기름기가 생기는 것은 자연스러운 현상이라는 안내를 넣으면 문의가 줄어요.",
    match: ["모과"]
  },

  // ───────── 채소 ─────────
  {
    id: "sweet-potato-honey", name: "꿀고구마(베니하루카)", group: "고구마", category: "채소", emoji: "🍠", tone: "purple",
    season: "KKSSE--PHHKK", ship: "상온", risk: "보통", level: 5, keyword: "꿀고구마 베니하루카", origin: "경기 여주, 전남 해남·영암",
    grow: "노지·저장", tags: ["간식", "다이어트"],
    tip: "구우면 꿀처럼 진득해지는 고구마로 겨울 검색량이 아주 많습니다. 숙성 뒤 단맛이 올라 11월 이후가 가장 맛있고, 세척·비세척 옵션을 나눠 두면 고르기 쉬워요.",
    cs: SWEET_POTATO_CS, match: ["꿀고구마", "베니하루카"], exclude: ["말랭이"]
  },
  {
    id: "sweet-potato-chestnut", name: "밤고구마", group: "고구마", category: "채소", emoji: "🍠", tone: "purple",
    season: "KSSSE--PHKKK", ship: "상온", risk: "보통", level: 5, keyword: "밤고구마", origin: "경기 여주, 전남 해남, 전북 고창",
    grow: "노지·저장", tags: ["간식", "다이어트"],
    tip: "포슬포슬한 식감을 좋아하는 고객이 찾는 고구마입니다. 꿀고구마와 식감 차이를 한 줄로 비교해 두고, 겨울 내내 꾸준히 팔리니 산지와 저장 물량을 미리 약속해 두세요.",
    cs: SWEET_POTATO_CS, match: ["밤고구마"], exclude: ["말랭이"]
  },
  {
    id: "sweet-potato-pumpkin", name: "호박고구마", group: "고구마", category: "채소", emoji: "🍠", tone: "orange",
    season: "KKSSE--PHHKK", ship: "상온", risk: "보통", level: 5, keyword: "호박고구마", origin: "전남 해남, 경기 여주",
    grow: "노지·저장", tags: ["간식", "다이어트"],
    tip: "속이 주황빛이고 촉촉해 아이 간식용으로 인기가 많습니다. 해남·여주처럼 산지 이름이 검색어가 되니 상품명 앞에 산지를 넣고, 작은 '한입' 크기 옵션을 꼭 두세요.",
    cs: SWEET_POTATO_CS, match: ["호박고구마"], exclude: ["말랭이"]
  },
  {
    id: "potato", name: "감자", group: "감자·양파·마늘", category: "채소", emoji: "🥔", tone: "brown",
    season: "SSSPHKKKKSSS", ship: "상온", risk: "보통", level: 4, keyword: "햇감자", origin: "강원 평창·강릉, 경북 김천, 전남 보성",
    grow: "노지·저장", tags: ["집밥", "대용량"],
    tip: "6~7월 햇감자가 가장 많이 팔리고 가을에는 강원 고랭지 감자가 이어집니다. 햇빛을 받으면 껍질이 초록빛으로 변하니 '어두운 곳에 보관'과 '초록 부분은 깎아 드세요'를 안내하세요.",
    match: ["감자"], exclude: ["고구마", "감자칩", "전분", "돼지감자"]
  },
  {
    id: "onion", name: "양파", group: "감자·양파·마늘", category: "채소", emoji: "🧅", tone: "brown",
    season: "SSPHKKSSSSSS", ship: "상온", risk: "낮음", level: 4, keyword: "햇양파", origin: "전남 무안, 경남 창녕, 경북",
    grow: "노지·저장", tags: ["집밥", "대용량"],
    tip: "5~6월 햇양파 철에 값이 가장 좋고 나머지 달에는 저장 양파가 나갑니다. 무거운 품목이라 15kg·20kg 대용량은 택배비 포함 여부를 꼭 확인하세요.",
    match: ["양파"], exclude: ["양파즙"]
  },
  {
    id: "garlic", name: "마늘", group: "감자·양파·마늘", category: "채소", emoji: "🧄", tone: "brown",
    season: "SSSPHKKSSSSS", ship: "상온", risk: "낮음", level: 4, keyword: "깐마늘", origin: "경북 의성, 충남 서산·태안, 전남 고흥, 경남 남해",
    grow: "노지·저장", tags: ["집밥", "김장"],
    tip: "6월 햇마늘 철에는 통마늘·마늘쫑을 찾고, 1년 내내는 깐마늘이 꾸준히 팔립니다. 깐마늘은 냉장 보관 기간이 짧으니 300g·500g 소포장 옵션을 두면 재구매가 늘어요.",
    match: ["마늘"], exclude: ["흑마늘", "마늘즙", "진액"]
  },
  {
    id: "green-onion", name: "대파", group: "파·배추·무", category: "채소", glyph: "대파", tone: "green",
    season: "KKKHHHHHHHKK", ship: "상온", risk: "보통", level: 3, keyword: "흙대파", origin: "전남 진도·신안(겨울), 경기·강원(여름)",
    grow: "노지", tags: ["집밥", "김장"],
    tip: "겨울 남쪽 섬 지역 대파가 달고 굵어 가장 맛있습니다. 부피가 커 꺾이거나 시들 수 있으니 흙대파·손질대파를 나누고 보관법(신문지에 싸서 냉장)을 함께 적으세요.",
    match: ["대파"]
  },
  {
    id: "napa-cabbage", name: "배추", group: "파·배추·무", category: "채소", emoji: "🥬", tone: "green",
    season: "SSSHHHHHHKKE", ship: "상온", risk: "보통", level: 3, keyword: "김장배추", origin: "전남 해남(겨울), 강원(여름 고랭지)",
    grow: "노지", tags: ["김장"],
    tip: "11월 김장철에 수요가 몰립니다. 한 망(3포기) 단위로 무게 기준을 적고, 여름 고랭지 배추는 무름이 잦으니 더운 철에는 판매량을 줄이는 것이 좋아요.",
    match: ["배추"], exclude: ["양배추", "절임", "김치", "봄동"]
  },
  {
    id: "salted-cabbage", name: "절임배추", group: "김장", category: "가공·김장", emoji: "🥬", tone: "green",
    season: "--------PHKK", ship: "상온", risk: "높음", level: 2, keyword: "절임배추 20kg", origin: "전남 해남, 충북 괴산, 강원",
    grow: "절임 가공", tags: ["김장"],
    tip: "김장철 3~4주에 주문이 몰리는 대표 예약 상품입니다. 받는 날짜를 고르는 '날짜 지정 배송'과 물 빼는 시간 안내가 핵심이고, 출고가 밀리면 큰 클레임이 되니 산지 하루 출고량을 꼭 확인하세요.",
    cs: [
      { q: "너무 짜요(덜 절여졌어요)", a: "절임 정도는 산지마다 다릅니다. 물기 빼는 시간과 헹굼 여부를 상세에 적어 주세요." },
      { q: "원하는 날짜에 안 왔어요", a: "김장철에는 날짜 지정 옵션과 주문 마감 시간을 정해 두고, 택배 지연 가능성을 미리 안내하세요." },
      { q: "무게가 적어요", a: "절임배추는 물이 빠지며 무게가 줄어듭니다. 출고할 때의 무게 기준을 밝혀 두세요." }
    ],
    match: ["절임배추"]
  },
  {
    id: "radish", name: "무", group: "파·배추·무", category: "채소", glyph: "무", tone: "green",
    season: "SSSHHHHHHKKK", ship: "상온", risk: "낮음", level: 4, keyword: "제주 월동무", origin: "제주(겨울), 강원(여름 고랭지)",
    grow: "노지", tags: ["김장", "집밥"],
    tip: "가을~겨울 무가 달고 단단해 김장·조림용으로 많이 팔립니다. 무거운 품목이라 10kg·20kg 상자의 택배비를 꼭 확인하고, 개수(입수) 범위도 함께 적어 주세요.",
    pattern: "월동무|(^|[\\s\\]\\)])무(\\s|$|\\d|\\()"
  },
  {
    id: "altari", name: "알타리무(총각무)", group: "파·배추·무", category: "채소", glyph: "총각", tone: "green",
    season: "--PHKE--PHKE", ship: "상온", risk: "보통", level: 3, keyword: "알타리무", origin: "전남 여수, 경기, 강원",
    grow: "노지", tags: ["김장"],
    tip: "총각김치를 담그는 봄·가을에 짧게 팔립니다. 생 알타리와 절임 알타리를 나눠 팔고, 절임은 받는 날 바로 담가야 한다는 안내를 넣어 주세요.",
    match: ["알타리", "총각무"]
  },
  {
    id: "gat", name: "갓", group: "파·배추·무", category: "채소", glyph: "갓", tone: "purple",
    season: "KKKE----PHKK", ship: "상온", risk: "보통", level: 3, keyword: "돌산갓", origin: "전남 여수 돌산",
    grow: "노지", tags: ["김장"],
    tip: "갓김치를 담그는 가을~겨울에 수요가 몰립니다. 톡 쏘는 맛이 특징이라 '돌산갓'처럼 산지 이름을 앞에 쓰고, 생갓과 절임갓 옵션을 나눠 보세요.",
    exclude: ["김치"], pattern: "(생|절임|돌산|청|적)\\s?갓|(^|[\\s\\]\\)])갓(\\s|$|\\d|\\()"
  },
  {
    id: "carrot", name: "당근", group: "당근·양배추", category: "채소", emoji: "🥕", tone: "orange",
    season: "KKKSSE---PHK", ship: "상온", risk: "낮음", level: 4, keyword: "제주 흙당근", origin: "제주 구좌, 부산 강서(겨울)",
    grow: "노지·저장", tags: ["다이어트", "집밥"],
    tip: "겨울 제주 당근이 달고 향이 좋아 착즙용으로 많이 팔립니다. 흙당근은 오래가고 세척당근은 쓰기 편하다는 차이를 적고, 주스용 못난이 옵션을 두면 대량 구매가 늘어요.",
    match: ["당근"], exclude: ["당근즙"]
  },
  {
    id: "cabbage", name: "양배추", group: "당근·양배추", category: "채소", emoji: "🥬", tone: "green",
    season: "KKKEHHHHHHHK", ship: "상온", risk: "낮음", level: 3, keyword: "양배추", origin: "제주(겨울), 강원(여름 고랭지)",
    grow: "노지", tags: ["다이어트", "집밥"],
    tip: "다이어트·위 건강 식단으로 꾸준히 팔립니다. 한 통 무게(1.5~2kg 내외)를 적고, 겨울 제주와 여름 강원 양배추를 이어서 팔면 1년 내내 운영할 수 있어요.",
    match: ["양배추"], exclude: ["즙"]
  },
  {
    id: "tomato", name: "토마토", group: "토마토", category: "채소", emoji: "🍅", tone: "red",
    season: "HHKKKKHHHHHH", ship: "상온", risk: "보통", level: 4, keyword: "완숙토마토", origin: "충남 부여, 강원 춘천·화천, 전남 담양",
    grow: "하우스", tags: ["다이어트", "간식"],
    tip: "봄(3~6월)이 가장 맛있고 값도 좋습니다. 주스용(못난이)과 생식용(특품)을 나눠 팔면 고객층이 넓어지고, 꼭지 쪽 갈라짐은 맛과 상관없다는 안내를 넣어 두세요.",
    match: ["토마토"], exclude: ["방울", "대저", "짭짤이", "케첩"]
  },
  {
    id: "cherry-tomato", name: "방울토마토", group: "토마토", category: "채소", emoji: "🍅", tone: "red",
    season: "HHKKKKHHHHHH", ship: "상온", risk: "보통", level: 4, keyword: "대추방울토마토", origin: "충남 부여·논산, 경남 밀양",
    grow: "하우스", tags: ["간식", "다이어트"],
    tip: "간식·도시락용으로 1년 내내 팔립니다. 길쭉한 대추방울은 단단하고 당도가 높아 배송에 유리하니, 처음 시작한다면 대추방울토마토부터 권합니다.",
    match: ["방울토마토"]
  },
  {
    id: "daejeo-tomato", name: "대저토마토", group: "토마토", category: "채소", emoji: "🍅", tone: "red",
    season: "HKKKE------P", ship: "상온", risk: "보통", level: 3, keyword: "대저 짭짤이 토마토", origin: "부산 강서구 대저동",
    grow: "하우스", tags: ["별미", "간식"],
    tip: "짠맛과 단맛이 함께 나는 '짭짤이'로 늦겨울~봄에만 나옵니다. 찾는 사람이 분명하니 1~2월에 예약 판매를 열고, 크기(2S~L) 기준을 꼭 적어 주세요.",
    match: ["대저", "짭짤이"]
  },
  {
    id: "cucumber", name: "오이", group: "오이·가지·호박", category: "채소", emoji: "🥒", tone: "green",
    season: "HHHKKKKHHHHH", ship: "상온", risk: "보통", level: 3, keyword: "오이", origin: "충남 천안, 경북 상주·구미",
    grow: "하우스·노지", tags: ["집밥", "다이어트"],
    tip: "여름 오이지·오이소박이 철에 대량 주문이 늘어납니다. 50개·100개 같은 개수 옵션과 취청오이·백다다기 품종 구분을 함께 적어 주세요.",
    match: ["오이"], exclude: ["오이스터"]
  },
  {
    id: "eggplant", name: "가지", group: "오이·가지·호박", category: "채소", emoji: "🍆", tone: "purple",
    season: "HHHHKKKKKHHH", ship: "상온", risk: "보통", level: 3, keyword: "가지", origin: "경기 여주, 경북, 전남",
    grow: "하우스·노지", tags: ["집밥"],
    tip: "여름철 반찬 수요가 많은 채소입니다. 껍질이 매끈하고 윤기 나는 사진을 쓰고, 모양이 다양한 가정용과 정품을 나눠 팔면 가격 선택지가 생깁니다.",
    pattern: "(정품|가정용|국내산|햇|흙)\\s?가지(\\s|$|\\d|\\()|^\\s*(\\[[^\\]]*\\]\\s*)?가지(\\s|$|\\d|\\()"
  },
  {
    id: "sweet-pumpkin", name: "단호박", group: "오이·가지·호박", category: "채소", emoji: "🎃", tone: "orange",
    season: "----PHKKSSE-", ship: "상온", risk: "낮음", level: 3, keyword: "단호박", origin: "제주, 강원, 전남",
    grow: "노지", tags: ["다이어트", "간식"],
    tip: "여름 햇단호박이 가장 많이 나오고 저장성이 좋아 가을까지 팔 수 있습니다. 작은 미니 단호박은 1~2인 가구에 인기가 많아 따로 구성해 보세요.",
    match: ["단호박"]
  },
  {
    id: "corn", name: "옥수수", group: "옥수수·고추", category: "채소", emoji: "🌽", tone: "yellow",
    season: "-----PKKE---", ship: "상온", risk: "보통", level: 4, keyword: "찰옥수수", origin: "강원 홍천·정선, 충북 괴산",
    grow: "노지", tags: ["간식", "별미"],
    tip: "7~8월 찰옥수수는 수확 뒤 시간이 지날수록 맛이 떨어집니다. '당일 수확·당일 발송'인지 확인하고, 시즌이 지나면 삶아 얼린 냉동 옥수수로 이어서 팔 수 있어요.",
    match: ["옥수수"], exclude: ["옥수수차", "콘", "초당"]
  },
  {
    id: "chili-powder", name: "고춧가루(건고추)", group: "김장", category: "가공·김장", emoji: "🌶️", tone: "red",
    season: "SSSSSSPHKKSS", ship: "상온", risk: "보통", level: 3, keyword: "국산 고춧가루", origin: "경북 영양·청송·안동, 충북 괴산",
    grow: "건조·분쇄 가공", tags: ["김장"],
    tip: "8~10월 햇고추가 나오면 김장 대비 고춧가루 수요가 크게 늘어납니다. 보통맛·매운맛, 김치용·고추장용 굵기를 나눠 팔고, 생산 연도와 원산지를 상세 위쪽에 크게 적어 주세요.",
    match: ["고춧가루", "건고추", "태양초"]
  },
  {
    id: "spinach", name: "시금치", group: "잎채소", category: "채소", emoji: "🥬", tone: "green",
    season: "KKKE-----PHK", ship: "상온", risk: "보통", level: 3, keyword: "섬초 시금치", origin: "전남 신안(섬초), 경북 포항(포항초)",
    grow: "노지", tags: ["집밥"],
    tip: "겨울 바닷바람을 맞은 노지 시금치가 달아 '섬초·포항초'로 검색합니다. 잎채소라 시들기 쉬우니 출고 당일 수확인지 확인하고, 받는 즉시 냉장 보관 안내를 넣어 주세요.",
    match: ["시금치", "섬초", "포항초"]
  },
  {
    id: "ginger", name: "생강", group: "뿌리채소", category: "채소", glyph: "생강", tone: "brown",
    season: "SSSSSS--PKKS", ship: "상온", risk: "낮음", level: 3, keyword: "햇생강", origin: "충남 서산·태안, 전북 완주",
    grow: "노지·저장", tags: ["김장", "청·담금"],
    tip: "11월 생강청·김장철에 수요가 몰립니다. 흙생강은 오래가고 깐생강은 편리하다는 차이를 적고, 생강청용 대용량 옵션을 따로 두세요.",
    match: ["생강"], exclude: ["생강차", "생강청", "진저"]
  },
  {
    id: "burdock", name: "우엉", group: "뿌리채소", category: "채소", glyph: "우엉", tone: "brown",
    season: "KKKSS----PHK", ship: "냉장", risk: "보통", level: 3, keyword: "우엉채", origin: "경남 진주·김해, 경북 안동",
    grow: "노지", tags: ["집밥"],
    tip: "김밥·우엉조림 재료로 1년 내내 꾸준히 팔리고 햇우엉은 늦가을부터 나옵니다. 채 썬 우엉은 색이 빨리 변하니 냉장 배송과 받는 날 조리하라는 안내가 필요해요.",
    match: ["우엉"], exclude: ["우엉차"]
  },

  // ───────── 버섯·나물 ─────────
  {
    id: "shiitake", name: "표고버섯", group: "버섯", category: "버섯·나물", emoji: "🍄", tone: "brown",
    season: "HHKKKHHHKKKH", ship: "냉장", risk: "보통", level: 4, keyword: "생표고버섯", origin: "충남 청양·부여, 경북 문경, 전남 장흥",
    grow: "원목·배지 재배", tags: ["선물", "집밥"],
    tip: "봄·가을 원목 표고가 가장 향이 좋고, 거북 등처럼 갈라진 '화고'가 최상품입니다. 생표고는 냉장 배송, 건표고는 실온 판매로 나눠 운영하면 1년 내내 팔 수 있어요.",
    match: ["표고"]
  },
  {
    id: "cham-songi", name: "참송이버섯", group: "버섯", category: "버섯·나물", emoji: "🍄", tone: "brown",
    season: "HHHHHHHHHHHH", ship: "냉장", risk: "보통", level: 3, keyword: "참송이버섯", origin: "충북·경북 등 재배 농가",
    grow: "배지 재배", tags: ["선물", "집밥"],
    tip: "송이처럼 쫄깃한 식감을 내는 재배 버섯으로 1년 내내 고른 품질로 나옵니다. 크기·모양에 따라 고급·상급을 나눠 팔고, 구이용 레시피를 함께 보여 주면 잘 팔려요.",
    match: ["참송이"]
  },
  {
    id: "pine-mushroom", name: "송이버섯(자연산)", group: "버섯", category: "버섯·나물", emoji: "🍄", tone: "brown",
    season: "-------PKK--", ship: "냉장", risk: "높음", level: 1, keyword: "자연산 송이버섯", origin: "강원 양양·인제, 경북 봉화·울진",
    grow: "자연산", tags: ["선물", "명절", "별미"],
    tip: "추석 무렵 한 달 남짓 나오는 최고가 임산물로, 날씨에 따라 그해 물량과 값이 크게 흔들립니다. 등급 기준과 산림조합 공판 시세를 함께 보며 예약 판매로만 운영하는 것이 안전해요.",
    pattern: "자연산\\s?송이|(^|[\\s\\]\\)])송이버섯"
  },
  {
    id: "dallae", name: "달래", group: "봄나물", category: "버섯·나물", emoji: "🌿", tone: "green",
    season: "PHKKE-------", ship: "냉장", risk: "보통", level: 3, keyword: "달래", origin: "충남 서산·태안, 경북 성주",
    grow: "노지·하우스", tags: ["별미", "집밥"],
    tip: "봄을 알리는 나물로 2~4월에 짧게 팔립니다. 흙을 털어 낸 세척 달래가 편리하고, 달래장·된장국 레시피를 함께 보여 주면 소량 구매가 늘어요.",
    match: ["달래"]
  },
  {
    id: "naengi", name: "냉이", group: "봄나물", category: "버섯·나물", emoji: "🌿", tone: "green",
    season: "HKKE-------P", ship: "냉장", risk: "보통", level: 3, keyword: "냉이", origin: "충남 서산, 전남",
    grow: "노지", tags: ["별미", "집밥"],
    tip: "이른 봄 된장국용으로 찾는 나물입니다. 뿌리 손질에 손이 많이 가서 손질 냉이의 인기가 높으니, 손질 여부를 옵션 이름에 꼭 넣어 주세요.",
    match: ["냉이"]
  },
  {
    id: "dureup", name: "두릅", group: "봄나물", category: "버섯·나물", emoji: "🌿", tone: "green",
    season: "--PKE-------", ship: "냉장", risk: "높음", level: 2, keyword: "참두릅", origin: "강원, 경북, 충북",
    grow: "자연산·재배", tags: ["별미"],
    tip: "4월 한 달 남짓 나오는 귀한 봄나물입니다. 수확 뒤 금방 잎이 피어 버려 산지 당일 발송이 꼭 필요하고, 참두릅·땅두릅 차이를 사진으로 보여 주세요.",
    match: ["두릅"], exclude: ["개두릅", "땅두릅"]
  },
  {
    id: "minari", name: "미나리", group: "봄나물", category: "버섯·나물", emoji: "🌿", tone: "green",
    season: "PHKKE-------", ship: "냉장", risk: "보통", level: 3, keyword: "한재미나리", origin: "경북 청도, 경기 양평",
    grow: "노지·하우스", tags: ["별미"],
    tip: "봄 삼겹살과 함께 먹는 한재미나리가 2~4월에 큰 인기를 끕니다. 줄기가 꺾이지 않게 길게 포장하는지, 이물질 세척 상태를 산지에 확인하세요.",
    match: ["미나리"]
  },
  {
    id: "gosari", name: "고사리", group: "말린 나물", category: "버섯·나물", emoji: "🌿", tone: "brown",
    season: "SSPHKSSSSSSS", ship: "상온", risk: "낮음", level: 3, keyword: "국산 고사리", origin: "제주, 전남 구례, 경남 남해",
    grow: "건조", tags: ["명절", "집밥"],
    tip: "봄에 꺾어 말린 고사리를 1년 내내 팔고, 차례상·비빔밥 재료로 설과 추석에 수요가 늘어납니다. 원산지 문의가 많으니 국산 표기와 건조 방식을 크게 적어 주세요.",
    match: ["고사리"]
  },
  {
    id: "sanyangsam", name: "산양삼", group: "인삼·산양삼", category: "버섯·나물", glyph: "삼", tone: "brown",
    season: "KHHHHHHPKKHK", ship: "냉장", risk: "보통", level: 2, keyword: "산양삼", origin: "강원, 경북, 전남 등 산림",
    grow: "산림 재배", tags: ["선물", "보양"],
    tip: "명절 선물과 건강 선물로 1년 내내 나가는 고가 임산물입니다. 나이(연근)와 뿌리 수로 값이 정해지니 '7~8년근 5뿌리'처럼 분명히 적고, 생산 이력·검사 자료를 받아 두세요.",
    match: ["산양삼", "장뇌삼"]
  },

  // ───────── 곡물·견과 ─────────
  {
    id: "rice", name: "쌀", group: "곡물", category: "곡물·견과", emoji: "🍚", tone: "yellow",
    season: "SSSSSSSPHKKS", ship: "상온", risk: "낮음", level: 4, keyword: "햅쌀", origin: "경기 이천·김포·여주, 강원 철원, 전북",
    grow: "노지", tags: ["집밥", "대용량"],
    tip: "9~10월 햅쌀이 나오면 '햅쌀' 검색이 크게 늘어납니다. 도정 날짜를 적고 4kg·10kg 소포장과 대포장을 함께 두며, 품종(고시히카리·추청·신동진 등)을 상품명에 넣으세요.",
    match: ["쌀"], exclude: ["떡", "쌀국수", "과자", "쌀눈", "누룽지", "찹쌀"]
  },
  {
    id: "grains", name: "잡곡(현미·흑미)", group: "곡물", category: "곡물·견과", emoji: "🌾", tone: "yellow",
    season: "SSSSSSSSPHKS", ship: "상온", risk: "낮음", level: 3, keyword: "혼합 잡곡", origin: "전북, 전남, 경북",
    grow: "노지", tags: ["집밥", "다이어트"],
    tip: "건강식 수요로 1년 내내 팔리고, 햇곡이 나오는 늦가을에 새 상품을 내기 좋습니다. 생산 연도와 원산지를 크게 쓰고, 여름에는 벌레가 생기지 않게 냉장 보관을 안내하세요.",
    match: ["잡곡", "현미", "흑미"]
  },
  {
    id: "bean", name: "콩(서리태)", group: "곡물", category: "곡물·견과", glyph: "콩", tone: "brown",
    season: "SSSSSSSSPHKS", ship: "상온", risk: "낮음", level: 3, keyword: "서리태", origin: "경기 파주·연천, 강원, 경북",
    grow: "노지", tags: ["집밥"],
    tip: "서리를 맞고 거두는 서리태는 10~11월 햇콩 철에 가장 많이 팔립니다. 콩물·콩밥·두부용처럼 쓰임새별로 소개하고 생산 연도를 꼭 적어 주세요.",
    match: ["서리태", "백태", "흑태", "약콩", "쥐눈이콩", "검은콩", "메주콩"]
  },
  {
    id: "sesame", name: "참깨·들깨", group: "곡물", category: "곡물·견과", glyph: "깨", tone: "yellow",
    season: "SSSSSSSPHKKS", ship: "상온", risk: "보통", level: 3, keyword: "국산 참깨", origin: "경북 안동, 전남, 충남",
    grow: "노지", tags: ["집밥"],
    tip: "가을 수확 뒤 햇깨가 나오면 참기름·들기름을 짜려는 수요가 늘어납니다. 수입산과 값 차이가 커 원산지 문의가 많으니 국산 증빙 자료를 산지에 꼭 받아 두세요.",
    match: ["참깨", "들깨"]
  },
  {
    id: "chestnut", name: "밤", group: "견과", category: "곡물·견과", emoji: "🌰", tone: "brown",
    season: "SE-----PKKSS", ship: "상온", risk: "보통", level: 4, keyword: "공주 알밤", origin: "충남 공주·부여, 전남 광양, 경남 산청",
    grow: "노지", tags: ["간식", "명절"],
    tip: "추석 전후 햇밤이 나오면 생밤·깐밤 수요가 몰립니다. 벌레(밤바구미) 문의가 가장 많으니 선별·저온 저장 여부를 확인하고, '받으면 냉장 보관'을 크게 적어 주세요.",
    cs: [
      { q: "벌레가 나왔어요", a: "햇밤에는 벌레 먹은 밤이 섞일 수 있습니다. 선별·저온 저장 여부를 확인하고 사진 접수 보상 기준을 미리 적어 두세요." },
      { q: "곰팡이가 폈어요", a: "밤은 상온에서 금방 상합니다. '받는 즉시 냉장 보관, 2주 안에 드세요'를 크게 적어 주세요." },
      { q: "속이 상한 밤이 있어요", a: "겉으로 구별하기 어려운 속 상함이 생길 수 있다고 미리 안내하고, 개수 기준 보상 방법을 정해 두세요." }
    ],
    pattern: "(알|생|깐|햇|공주|정안|약|군)\\s?밤(?!고구마|호박)|(^|[\\s\\]\\)])밤(\\s|$|\\d|\\()"
  },
  {
    id: "walnut", name: "호두", group: "견과", category: "곡물·견과", glyph: "호두", tone: "brown",
    season: "SSSSSSSPHKKS", ship: "상온", risk: "낮음", level: 3, keyword: "국산 호두", origin: "충남 천안, 경북 김천·상주",
    grow: "노지", tags: ["간식", "명절"],
    tip: "가을 햇호두가 나오면 알호두와 깐호두 수요가 함께 늘어납니다. 국산은 값이 높아 수입산과 비교되니 원산지와 생산 연도를 분명히 쓰고 냉동 보관 안내를 넣으세요.",
    match: ["호두"], exclude: ["곶감", "과자"]
  },
  {
    id: "jujube", name: "대추", group: "견과", category: "곡물·견과", glyph: "대추", tone: "red",
    season: "SSSSSSSPHKKS", ship: "상온", risk: "낮음", level: 3, keyword: "보은 대추", origin: "충북 보은, 경북 경산, 경남 밀양",
    grow: "노지·건조", tags: ["명절", "보양"],
    tip: "9~10월 생대추는 사과처럼 아삭하게 먹고, 말린 건대추는 1년 내내 차·요리용으로 팔립니다. 생대추는 냉장 배송, 건대추는 실온 판매로 나눠 운영하세요.",
    match: ["대추"], exclude: ["토마토", "대추차", "대추칩", "사과대추", "왕대추"]
  },
  {
    id: "peanut", name: "땅콩", group: "견과", category: "곡물·견과", emoji: "🥜", tone: "brown",
    season: "SSSSSSSPHKKS", ship: "상온", risk: "낮음", level: 3, keyword: "국산 땅콩", origin: "경기 여주, 전북 고창",
    grow: "노지", tags: ["간식"],
    tip: "가을에는 햇땅콩을 삶아 먹으려는 수요가 있고 볶음땅콩은 1년 내내 팔립니다. 기름이 많아 쉽게 쩐내가 나니 냉장·냉동 보관 안내와 생산 연도를 꼭 적어 주세요.",
    match: ["땅콩"], exclude: ["버터", "잼", "과자"]
  },

  // ───────── 수산 ─────────
  {
    id: "cockle", name: "꼬막", group: "조개", category: "수산", emoji: "🐚", tone: "brown",
    season: "KKKE-----PHK", ship: "냉장", risk: "보통", level: 4, keyword: "벌교 꼬막", origin: "전남 보성 벌교, 여수",
    grow: "갯벌", tags: ["별미", "집밥"],
    tip: "찬바람이 불 때 살이 차는 겨울 조개로 '벌교 꼬막'이 대표 검색어입니다. 참꼬막·새꼬막 차이와 해감 방법을 상세에 적어 두면 모래가 씹힌다는 문의가 줄어요.",
    cs: LIVE_SHELLFISH_CS, match: ["꼬막"]
  },
  {
    id: "scallop", name: "가리비", group: "조개", category: "수산", emoji: "🐚", tone: "pink",
    season: "KKKKE----PHK", ship: "냉장", risk: "보통", level: 4, keyword: "홍가리비", origin: "경남 고성·통영",
    grow: "양식", tags: ["별미"],
    tip: "겨울~봄 홍가리비가 찜·구이용으로 인기가 많습니다. 1kg당 개수를 적고 산지 세척·선별 여부를 확인하세요. 봄철에는 패류독소 소식을 확인한 뒤 판매해야 합니다.",
    cs: LIVE_SHELLFISH_CS, match: ["가리비"]
  },
  {
    id: "oyster", name: "굴", group: "조개", category: "수산", emoji: "🦪", tone: "blue",
    season: "KKE------PHK", ship: "냉장", risk: "높음", level: 3, keyword: "통영 생굴", origin: "경남 통영·거제, 전남 여수",
    grow: "양식", tags: ["김장", "별미"],
    tip: "겨울 김장·굴밥 수요로 11~2월에 주문이 몰립니다. 생굴은 차가운 상태 유지가 생명이라 아이스박스·아이스팩 포장과 '받는 날 드세요' 안내가 꼭 필요해요.",
    match: ["굴", "석화"], exclude: ["굴비", "굴소스", "굴젓"]
  },
  {
    id: "mussel", name: "홍합", group: "조개", category: "수산", emoji: "🦪", tone: "blue",
    season: "KKE------PHK", ship: "냉장", risk: "보통", level: 3, keyword: "홍합", origin: "경남 거제·창원, 전남 여수",
    grow: "양식", tags: ["집밥"],
    tip: "찬바람이 불면 홍합탕 수요가 늘어납니다. 껍질에 붙은 수염(족사) 손질 여부를 옵션에 적고, 따뜻한 철에는 패류독소 소식을 확인한 뒤 판매하세요.",
    cs: LIVE_SHELLFISH_CS, match: ["홍합"]
  },
  {
    id: "abalone", name: "전복", group: "조개", category: "수산", glyph: "전복", tone: "blue",
    season: "HHHHKKKKHHHH", ship: "냉장", risk: "보통", level: 4, keyword: "완도 활전복", origin: "전남 완도·진도",
    grow: "양식", tags: ["보양", "선물", "명절"],
    tip: "양식 덕분에 1년 내내 나오지만 살이 오르는 5~8월과 명절 선물 철에 특히 잘 팔립니다. 1kg당 마리 수로 크기를 고르게 하고, 손질법(솔로 닦고 이빨 떼기)을 함께 보여 주세요.",
    match: ["전복"], exclude: ["전복죽"]
  },
  {
    id: "gwamegi", name: "과메기", group: "생선", category: "수산", emoji: "🐟", tone: "blue",
    season: "KKE------PHK", ship: "냉장", risk: "보통", level: 3, keyword: "포항 과메기", origin: "경북 포항 구룡포",
    grow: "반건조 가공", tags: ["별미"],
    tip: "찬바람이 부는 11월 말부터 2월까지 '야채 세트' 구성이 가장 잘 나갑니다. 꽁치·청어 과메기 차이와 껍질 손질 여부를 적고, 김·쪽파·마늘 같은 곁들임을 함께 보여 주세요.",
    match: ["과메기"]
  },
  {
    id: "eel", name: "장어", group: "생선", category: "수산", glyph: "장어", tone: "blue",
    season: "HHHHHKKKHHHH", ship: "냉장", risk: "보통", level: 3, keyword: "풍천장어", origin: "전북 고창, 전남 영암·장성",
    grow: "양식", tags: ["보양"],
    tip: "복날이 있는 7~8월에 주문이 몰리는 보양식입니다. 생물과 초벌구이 옵션을 나눠 팔고, 손질 뒤 무게(살 중량)인지 손질 전 무게인지 분명히 적어 주세요.",
    match: ["장어"]
  },
  {
    id: "hairtail", name: "갈치", group: "생선", category: "수산", emoji: "🐟", tone: "blue",
    season: "HHE---PHKKKH", ship: "냉동", risk: "보통", level: 3, keyword: "제주 은갈치", origin: "제주, 전남 목포",
    grow: "자연산", tags: ["집밥", "선물"],
    tip: "가을이 갈치 맛이 가장 좋은 때이고 제주 은갈치는 선물용으로도 많이 나갑니다. 마리당 크기와 토막 수를 함께 적고, 손질·급랭 상태를 사진으로 보여 주세요.",
    match: ["갈치"], exclude: ["속젓"]
  },
  {
    id: "mackerel", name: "고등어", group: "생선", category: "수산", emoji: "🐟", tone: "blue",
    season: "HHE-----PKKK", ship: "냉동", risk: "낮음", level: 3, keyword: "순살 고등어", origin: "부산, 제주, 경남 통영",
    grow: "자연산·가공", tags: ["집밥"],
    tip: "가을~초겨울 기름이 오른 고등어가 가장 맛있습니다. 순살·자반(간고등어) 같은 손질 상품은 1년 내내 팔기 좋고, 염도와 한 팩 무게를 분명히 적어 주세요.",
    match: ["고등어"]
  },
  {
    id: "gulbi", name: "굴비(조기)", group: "생선", category: "수산", emoji: "🐟", tone: "yellow",
    season: "KKHHHHHPKHHK", ship: "냉동", risk: "보통", level: 2, keyword: "영광 굴비", origin: "전남 영광 법성포",
    grow: "염장 건조 가공", tags: ["명절", "선물"],
    tip: "설·추석 선물세트의 대표 수산물입니다. 크기와 엮음 수에 따라 값이 크게 다르니 비교표를 만들고, 국내산·수입산 원산지 표기를 정확히 해 주세요.",
    match: ["굴비", "참조기"]
  },
  {
    id: "anchovy", name: "멸치", group: "생선", category: "수산", emoji: "🐟", tone: "blue",
    season: "KSSHKKSPKKSK", ship: "상온", risk: "낮음", level: 3, keyword: "국물용 멸치", origin: "경남 통영·남해, 부산 기장",
    grow: "건조", tags: ["집밥", "명절"],
    tip: "볶음용(작은 멸치)과 국물용(큰 멸치)처럼 크기에 따라 쓰임이 다르니 옵션을 크기로 나누세요. 명절 선물세트 수요가 크고, '받으면 냉동 보관'을 안내하면 오래 신선하게 먹을 수 있어요.",
    match: ["멸치"], exclude: ["액젓"]
  },
  {
    id: "snow-crab", name: "대게", group: "게·새우", category: "수산", emoji: "🦀", tone: "red",
    season: "HKKKE-----PH", ship: "냉장", risk: "높음", level: 2, keyword: "영덕 대게", origin: "경북 영덕·울진",
    grow: "자연산", tags: ["별미", "선물"],
    tip: "겨울~봄 금어기가 풀린 기간에만 국산 대게가 나옵니다. 살이 찬 정도에 따라 값 차이가 크고 '살이 비었다'는 문의가 잦으니 등급 기준을 분명히 적으세요.",
    match: ["대게"], exclude: ["홍게", "게장"]
  },
  {
    id: "blue-crab", name: "꽃게", group: "게·새우", category: "수산", emoji: "🦀", tone: "orange",
    season: "--PHKK-PHKKE", ship: "냉장", risk: "높음", level: 2, keyword: "활 꽃게", origin: "인천 연평도, 충남 태안·서산",
    grow: "자연산", tags: ["별미"],
    tip: "봄에는 알이 꽉 찬 암꽃게, 가을에는 살이 오른 수꽃게가 제철입니다. 여름(6월 말~8월 중순)은 금어기라 판매를 쉬고, 활꽃게는 배송 중 죽을 수 있다는 점과 보상 기준을 미리 정해 두세요.",
    match: ["꽃게"], exclude: ["게장"]
  },
  {
    id: "shrimp", name: "새우(흰다리·대하)", group: "게·새우", category: "수산", emoji: "🦐", tone: "orange",
    season: "-------PKKE-", ship: "냉장", risk: "보통", level: 3, keyword: "흰다리새우", origin: "충남 태안·홍성, 전남 신안",
    grow: "양식·자연산", tags: ["별미"],
    tip: "9~10월 가을 새우철에 소금구이용 활새우가 몰려 나갑니다. 활새우는 배송 중 일부가 죽을 수 있다는 점과 보상 기준을 정해 두고, 1kg당 마리 수를 적어 크기를 비교하게 하세요.",
    match: ["새우", "대하"], exclude: ["새우젓", "새우깡"]
  },
  {
    id: "squid", name: "오징어", group: "오징어·문어", category: "수산", emoji: "🦑", tone: "blue",
    season: "HHE--HHKKKHH", ship: "냉동", risk: "보통", level: 3, keyword: "반건조 오징어", origin: "강원 주문진, 경북 울릉·포항",
    grow: "자연산·건조", tags: ["간식", "집밥"],
    tip: "여름~가을이 동해 오징어 철이지만 해마다 잡히는 양의 차이가 큽니다. 반건조(피데기)·마른오징어·생물처럼 상태를 나눠 팔고, 마리 수와 총중량을 함께 적어 주세요.",
    match: ["오징어"], exclude: ["오징어젓"]
  },
  {
    id: "hanchi", name: "한치", group: "오징어·문어", category: "수산", emoji: "🦑", tone: "blue",
    season: "----PKKE----", ship: "냉동", risk: "보통", level: 3, keyword: "제주 한치", origin: "제주",
    grow: "자연산", tags: ["별미"],
    tip: "여름밤 제주 바다에서 잡는 한치는 6~7월이 제철입니다. 손질 여부(내장 제거)와 냉동 상태를 분명히 적고, 물회·한치무침 같은 먹는 법을 함께 보여 주세요.",
    match: ["한치"]
  },
  {
    id: "octopus", name: "문어", group: "오징어·문어", category: "수산", emoji: "🐙", tone: "red",
    season: "KKHHHHHHHHKK", ship: "냉장", risk: "높음", level: 2, keyword: "돌문어", origin: "경북 포항·울진, 강원, 제주",
    grow: "자연산", tags: ["명절", "별미"],
    tip: "제사·명절 상차림과 선물로 많이 나갑니다. 활문어는 배송 중 상태 변화가 크니 삶은 문어(냉동) 옵션도 함께 두고, 제수용은 무게와 모양 기준을 미리 정해 두세요.",
    match: ["문어"]
  },
  {
    id: "jukkumi", name: "주꾸미", group: "오징어·문어", category: "수산", emoji: "🐙", tone: "purple",
    season: "-PKKE---HKE-", ship: "냉동", risk: "보통", level: 3, keyword: "주꾸미", origin: "충남 서천·보령, 전북 군산",
    grow: "자연산", tags: ["별미"],
    tip: "3~4월 알이 꽉 찬 봄 주꾸미가 가장 인기가 많습니다. 5~8월은 금어기라 생물 판매가 어려우니, 봄에 손질·급랭한 주꾸미로 이어서 파는 방법을 산지와 의논해 보세요.",
    match: ["주꾸미", "쭈꾸미"]
  },
  {
    id: "laver", name: "김", group: "해조류", category: "수산", glyph: "김", tone: "green",
    season: "KKKSSSSSSPHK", ship: "상온", risk: "낮음", level: 4, keyword: "햇김", origin: "전남 완도·고흥·신안, 충남 서천",
    grow: "양식·가공", tags: ["집밥", "명절", "선물"],
    tip: "겨울에 처음 딴 햇김(첫물김)이 향이 가장 좋아 12~2월에 잘 팔립니다. 조미김·김밥김·곱창김처럼 쓰임새별로 나누고, 명절 선물세트로 구성하면 객단가가 올라가요.",
    pattern: "(조미|구운|돌|곱창|파래|재래|김밥|도시락|전장|햇|생|광천|완도)\\s?김(?!치|장|포)|(^|[\\s\\]\\)])김(\\s|$|\\d|\\()"
  },
  {
    id: "miyeok", name: "미역", group: "해조류", category: "수산", glyph: "미역", tone: "green",
    season: "HKKKSSSSSSSP", ship: "상온", risk: "낮음", level: 3, keyword: "기장 미역", origin: "부산 기장, 전남 완도·진도",
    grow: "양식·건조", tags: ["집밥"],
    tip: "늦겨울~봄에 햇미역이 나오고 말린 미역은 1년 내내 산모·생일 미역국용으로 팔립니다. 기장·완도처럼 산지 이름이 검색어이니 상품명 앞에 넣어 주세요.",
    match: ["미역"]
  }
];
