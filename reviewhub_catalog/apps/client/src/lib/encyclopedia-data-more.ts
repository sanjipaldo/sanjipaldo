// 농수산물 백과사전 추가 품목(2026-11-12) — 두고푸드가 직접 정리한 참고용 정보입니다.
// 시기·문구는 두고푸드가 새로 쓴 것이고, 다른 서비스의 자료를 옮겨 오지 않았습니다.
// season 규칙과 match/exclude/pattern 쓰는 법은 encyclopedia-data.ts와 같습니다.
import type { ProduceItem } from "./encyclopedia";
import { LIVE_SHELLFISH_CS } from "./encyclopedia-data";

export const MORE_PRODUCE_ITEMS: ProduceItem[] = [
  // ───────── 과일 ─────────
  {
    id: "house-mandarin", name: "하우스감귤", group: "감귤·만감류", category: "과일", emoji: "🍊", tone: "orange",
    season: "---PHKKKE---", ship: "상온", risk: "보통", level: 3, keyword: "하우스감귤", origin: "제주",
    grow: "하우스", tags: ["선물", "간식"],
    tip: "한여름에 나오는 귤이라 '여름 귤'로 소개하면 선물 수요가 있습니다. 더운 철 배송이라 무름·곰팡이 문의가 늘어나니 소포장과 아이스팩, '받는 즉시 냉장'을 챙기세요.",
    match: ["하우스감귤"]
  },
  {
    id: "kumquat", name: "금귤(낑깡)", group: "감귤·만감류", category: "과일", emoji: "🍊", tone: "orange",
    season: "KKE------PHK", ship: "상온", risk: "낮음", level: 3, keyword: "금귤", origin: "제주, 전남 순천",
    grow: "노지·하우스", tags: ["간식", "청·담금"],
    tip: "껍질째 먹는 작은 귤로 생으로 먹거나 정과·청을 담급니다. 300g·500g 소포장이 잘 나가고, 새콤한 맛이 강하다는 점을 미리 알려 주세요.",
    match: ["금귤", "낑깡", "금감"]
  },
  {
    id: "karahyang", name: "카라향", group: "감귤·만감류", category: "과일", emoji: "🍊", tone: "orange",
    season: "--PHKE------", ship: "상온", risk: "보통", level: 3, keyword: "카라향", origin: "제주",
    grow: "하우스", tags: ["선물", "간식"],
    tip: "한라봉·천혜향이 끝난 봄~초여름에 이어서 팔기 좋은 만감류입니다. 껍질이 잘 까지고 새콤달콤해 '봄 귤'로 소개하고, 크기별 옵션을 나눠 주세요.",
    match: ["카라향"]
  },
  {
    id: "apple-arisu", name: "아리수", group: "사과", category: "과일", emoji: "🍎", tone: "red",
    season: "-------PKE--", ship: "상온", risk: "보통", level: 3, keyword: "아리수 사과", origin: "경북, 충북",
    grow: "노지", tags: ["명절", "선물"],
    tip: "추석 무렵 나오는 국산 품종 사과로 홍로와 함께 추석 선물로 많이 나갑니다. 오래 두기 어려우니 추석 앞뒤 3주에 판매를 모으세요.",
    match: ["아리수"]
  },
  {
    id: "apple-mini", name: "미니사과", group: "사과", category: "과일", emoji: "🍎", tone: "red",
    season: "-------PKKE-", ship: "상온", risk: "낮음", level: 4, keyword: "미니사과", origin: "경북, 충북",
    grow: "노지", tags: ["간식", "선물"],
    tip: "한 입 크기 사과라 아이 간식·도시락·답례품으로 인기가 많습니다. 껍질째 먹는 간식이라는 점을 앞에 쓰고, 1kg·2kg 소포장과 선물 상자를 함께 두세요.",
    match: ["미니사과", "알프스오토메", "꼬마사과"]
  },
  {
    id: "pear-wonhwang", name: "원황배", group: "배", category: "과일", emoji: "🍐", tone: "yellow",
    season: "------PHK---", ship: "상온", risk: "보통", level: 3, keyword: "원황배", origin: "전남 나주, 경기 안성",
    grow: "노지", tags: ["명절", "선물"],
    tip: "신고배보다 먼저 나오는 이른 배라 추석이 빠른 해에 선물로 많이 나갑니다. 오래 두기 어려우니 추석 뒤에는 빨리 정리하고, 과즙이 많다는 점을 강조하세요.",
    match: ["원황"]
  },
  {
    id: "peach-sinbi", name: "신비복숭아", group: "복숭아·자두", category: "과일", emoji: "🍑", tone: "pink",
    season: "----PK------", ship: "상온", risk: "높음", level: 2, keyword: "신비복숭아", origin: "경북 경산·영천",
    grow: "노지", tags: ["간식", "별미"],
    tip: "6월에 2~3주만 나오는 이른 복숭아라 '올해 첫 복숭아'를 기다리는 고객이 많습니다. 물량이 적고 무르기 쉬우니 예약 판매로 받고 끝나는 날을 미리 알려 두세요.",
    match: ["신비"]
  },
  {
    id: "peach-flat", name: "납작복숭아", group: "복숭아·자두", category: "과일", emoji: "🍑", tone: "pink",
    season: "-----PKE----", ship: "상온", risk: "높음", level: 2, keyword: "납작복숭아", origin: "경북, 충북",
    grow: "노지", tags: ["간식", "별미"],
    tip: "도넛처럼 납작한 모양이 눈에 띄어 사진 반응이 좋은 복숭아입니다. 실물 사진과 크기 정보를 충분히 넣고, 눌림에 약하니 포장 방식을 꼭 확인하세요.",
    match: ["납작"]
  },
  {
    id: "apricot", name: "살구", group: "복숭아·자두", category: "과일", glyph: "살구", tone: "orange",
    season: "----PKE-----", ship: "상온", risk: "높음", level: 2, keyword: "살구", origin: "경북 의성·청송, 경기",
    grow: "노지", tags: ["별미", "청·담금"],
    tip: "6월 중순부터 2~3주만 나오는 과일이라 시즌을 놓치기 쉽습니다. 잘 익은 살구는 금방 무르니 '받으면 바로 냉장'을 적고, 잼·청용 대용량 옵션을 따로 두세요.",
    match: ["살구"]
  },
  {
    id: "omija", name: "오미자", group: "베리·열매", category: "과일", glyph: "오미자", tone: "red",
    season: "-------PKE--", ship: "냉장", risk: "보통", level: 3, keyword: "생오미자", origin: "경북 문경, 전북 장수",
    grow: "노지", tags: ["청·담금", "보양"],
    tip: "9월 한 달 남짓 생오미자가 나와 오미자청을 담그려는 고객이 몰립니다. 수확 날짜와 냉장 발송을 분명히 하고, 그 밖의 달에는 말린 오미자로 이어서 팔 수 있어요.",
    match: ["오미자"], exclude: ["오미자차", "오미자청", "원액", "진액"]
  },
  {
    id: "aronia", name: "아로니아", group: "베리·열매", category: "과일", emoji: "🫐", tone: "purple",
    season: "------PKE---", ship: "냉동", risk: "낮음", level: 3, keyword: "생아로니아", origin: "충북 단양, 경북",
    grow: "노지", tags: ["다이어트", "홈카페"],
    tip: "떫은맛이 강해 생으로 먹기보다 갈아 마시는 용도가 많습니다. 떫은맛을 미리 알리고 요거트·스무디 활용법을 보여 주면 재구매가 늘고, 냉동 상품은 1년 내내 팔 수 있어요.",
    match: ["아로니아"], exclude: ["분말", "즙", "진액", "젤리"]
  },
  {
    id: "bokbunja", name: "복분자", group: "베리·열매", category: "과일", glyph: "복분자", tone: "purple",
    season: "----PKE-----", ship: "냉동", risk: "높음", level: 2, keyword: "생복분자", origin: "전북 고창, 전남 담양",
    grow: "노지", tags: ["청·담금", "보양"],
    tip: "6월 2~3주 동안 따서 대부분 바로 얼려 보냅니다. 얼린 복분자는 녹이면 즙이 나온다는 점을 알리고, 청·주스용 대용량과 가정용 소포장을 나눠 두세요.",
    match: ["복분자"], exclude: ["복분자주", "즙", "원액", "진액", "와인"]
  },
  {
    id: "mulberry", name: "오디", group: "베리·열매", category: "과일", glyph: "오디", tone: "purple",
    season: "---PHK------", ship: "냉동", risk: "높음", level: 2, keyword: "생오디", origin: "전북 부안, 경북 상주",
    grow: "노지", tags: ["간식", "청·담금"],
    tip: "뽕나무 열매로 5~6월에 잠깐 나옵니다. 생과는 하루 이틀이면 물러 얼려서 보내는 경우가 많고, 손과 옷에 물이 든다는 점을 미리 알려 주세요.",
    match: ["오디"], exclude: ["즙", "잼", "진액", "오디오"]
  },
  {
    id: "raspberry", name: "산딸기", group: "베리·열매", category: "과일", emoji: "🍓", tone: "red",
    season: "----PKE-----", ship: "냉장", risk: "높음", level: 2, keyword: "산딸기", origin: "경남 함안·김해",
    grow: "노지", tags: ["간식", "별미"],
    tip: "6월 한 달 남짓 나오는 귀한 베리라 생과는 냉장 당일 발송이 꼭 필요합니다. 생과 시즌이 끝나면 얼린 산딸기로 이어서 팔 수 있어요.",
    match: ["산딸기"]
  },
  {
    id: "cherry-kr", name: "앵두", group: "베리·열매", category: "과일", emoji: "🍒", tone: "red",
    season: "----PK------", ship: "냉장", risk: "높음", level: 1, keyword: "앵두", origin: "경기, 충북",
    grow: "노지", tags: ["별미"],
    tip: "1~2주 만에 끝나는 아주 짧은 과일이라 소량 예약 판매가 알맞습니다. 쉽게 무르고 터지니 가까운 지역부터 시작하세요.",
    match: ["앵두"]
  },
  {
    id: "dragonfruit", name: "용과", group: "키위·열대 과일", category: "과일", glyph: "용과", tone: "pink",
    season: "HHHHHHKKKKHH", ship: "상온", risk: "보통", level: 3, keyword: "용과", origin: "수입(베트남), 제주·전남(국산)",
    grow: "수입·하우스", tags: ["간식", "다이어트"],
    tip: "속이 붉은 용과와 흰 용과의 맛 차이를 사진으로 비교해 주세요. 국산 용과는 여름~가을에 나오고, 수입 용과는 1년 내내 들어옵니다.",
    match: ["용과"]
  },
  {
    id: "passionfruit", name: "패션프루트(백향과)", group: "키위·열대 과일", category: "과일", glyph: "백향과", tone: "yellow",
    season: "-----PKKE---", ship: "상온", risk: "보통", level: 2, keyword: "패션후르츠", origin: "제주, 전남, 경남",
    grow: "하우스", tags: ["홈카페", "별미"],
    tip: "겉이 쭈글쭈글해질 때가 먹기 좋은 때라 '주름은 상한 것이 아니에요'를 꼭 적어 주세요. 반으로 잘라 떠먹거나 에이드·요거트에 넣는 법을 보여 주면 좋습니다.",
    match: ["패션후르츠", "패션프루트", "백향과"]
  },
  {
    id: "jujube-apple", name: "사과대추", group: "대추", category: "과일", glyph: "대추", tone: "red",
    season: "-------PKE--", ship: "상온", risk: "보통", level: 3, keyword: "사과대추", origin: "충남, 경북",
    grow: "노지", tags: ["간식", "명절"],
    tip: "보통 대추보다 훨씬 커서 사과처럼 아삭하게 먹는 생대추입니다. 9~10월에 짧게 나오니 추석 선물로 묶어 팔고, 냉장 보관하면 아삭함이 오래간다고 알려 주세요.",
    match: ["사과대추", "왕대추"]
  },
  {
    id: "watermelon-mini", name: "애플수박(미니수박)", group: "수박·참외·멜론", category: "과일", emoji: "🍉", tone: "green",
    season: "----PHKE----", ship: "상온", risk: "보통", level: 3, keyword: "애플수박", origin: "충북, 경남, 전북",
    grow: "하우스", tags: ["간식"],
    tip: "1~2kg 작은 수박이라 1~2인 가구와 캠핑 수요가 많습니다. 들고 다니기 좋은 크기와 껍질째 깎아 먹는 법을 보여 주세요.",
    match: ["애플수박", "미니수박"]
  },

  // ───────── 채소 ─────────
  {
    id: "zucchini", name: "애호박", group: "오이·가지·호박", category: "채소", glyph: "애호박", tone: "green",
    season: "HHHHKKKKHHHH", ship: "상온", risk: "보통", level: 3, keyword: "애호박", origin: "경기, 강원, 경남 진주",
    grow: "하우스·노지", tags: ["집밥"],
    tip: "찌개·전·볶음에 1년 내내 쓰이는 반찬 채소입니다. 비닐을 씌워 키운 애호박인지와 개수(2입·10입)를 적고, 무르기 쉬우니 냉장 보관을 안내하세요.",
    match: ["애호박"]
  },
  {
    id: "chili-fresh", name: "고추(풋고추·청양)", group: "옥수수·고추", category: "채소", emoji: "🌶️", tone: "green",
    season: "HHHHKKKKKHHH", ship: "상온", risk: "낮음", level: 3, keyword: "청양고추", origin: "경북 영양·청송, 전남, 강원",
    grow: "하우스·노지", tags: ["집밥"],
    tip: "매운 청양고추, 맵지 않은 오이고추·아삭이고추, 볶음용 꽈리고추처럼 쓰임이 달라 맛 표기가 중요합니다. 1kg 단위가 기본이고 식당용 대용량 수요도 꾸준해요.",
    match: ["청양고추", "풋고추", "오이고추", "꽈리고추", "아삭이고추"]
  },
  {
    id: "paprika", name: "파프리카", group: "오이·가지·호박", category: "채소", emoji: "🫑", tone: "red",
    season: "HHHHHHHHHHHH", ship: "상온", risk: "보통", level: 3, keyword: "파프리카", origin: "전남 강진·화순, 경남 진주, 강원",
    grow: "하우스", tags: ["다이어트", "집밥"],
    tip: "빨강·노랑·주황을 섞은 혼합 구성이 가장 잘 나갑니다. 개수와 크기 등급을 함께 적고, 꼭지 마름·작은 흠은 맛과 상관없다는 안내를 넣으세요.",
    match: ["파프리카"]
  },
  {
    id: "asparagus", name: "아스파라거스", group: "잎·줄기채소", category: "채소", emoji: "🌱", tone: "green",
    season: "--PHKKE-----", ship: "냉장", risk: "보통", level: 3, keyword: "국산 아스파라거스", origin: "강원 양구·화천, 전남",
    grow: "하우스", tags: ["다이어트", "별미"],
    tip: "봄에 나오는 햇순이 가장 연합니다. 굵기별 등급을 나눠 팔고, 세워서 냉장 보관하라는 안내와 구이·샐러드 활용법을 함께 보여 주세요.",
    match: ["아스파라거스"]
  },
  {
    id: "pumpkin-old", name: "늙은호박", group: "오이·가지·호박", category: "채소", emoji: "🎃", tone: "orange",
    season: "SE-----PHKKS", ship: "상온", risk: "낮음", level: 3, keyword: "늙은호박", origin: "경북, 전남, 충북",
    grow: "노지·저장", tags: ["보양", "집밥"],
    tip: "호박즙·호박죽용으로 가을부터 겨울까지 꾸준히 팔립니다. 한 통 무게가 커서 택배비를 꼭 확인하고, 속을 파낸 손질 호박은 냉장·냉동으로 따로 구성하세요.",
    match: ["늙은호박", "청둥호박", "맷돌호박"]
  },
  {
    id: "corn-chodang", name: "초당옥수수", group: "옥수수·고추", category: "채소", emoji: "🌽", tone: "yellow",
    season: "---PHKE-----", ship: "상온", risk: "보통", level: 4, keyword: "초당옥수수", origin: "제주, 전남 무안·해남, 경기",
    grow: "노지·하우스", tags: ["간식", "별미"],
    tip: "생으로도 먹을 만큼 단 옥수수라 초여름 인기 품목입니다. 따고 나면 단맛이 빨리 줄어드니 당일 수확·발송과 '받는 즉시 냉장'을 꼭 적어 주세요.",
    match: ["초당옥수수"]
  },
  {
    id: "broccoli", name: "브로콜리", group: "잎·줄기채소", category: "채소", emoji: "🥦", tone: "green",
    season: "KKKE-----PHK", ship: "상온", risk: "보통", level: 3, keyword: "제주 브로콜리", origin: "제주(겨울), 강원 평창(여름)",
    grow: "노지", tags: ["다이어트", "집밥"],
    tip: "겨울 제주 브로콜리가 단단하고 맛이 좋습니다. 꽃봉오리가 노랗게 피면 품질 문의가 오니 '받는 즉시 냉장'을 안내하고, 개수와 무게를 함께 적으세요.",
    match: ["브로콜리"]
  },
  {
    id: "cauliflower", name: "콜리플라워", group: "잎·줄기채소", category: "채소", glyph: "콜리", tone: "yellow",
    season: "KKKE-----PHK", ship: "상온", risk: "보통", level: 2, keyword: "콜리플라워", origin: "제주",
    grow: "노지", tags: ["다이어트"],
    tip: "밥 대신 잘게 다져 먹는 저탄수 식단 수요가 있습니다. 흰색이 누렇게 변하지 않도록 냉장 보관을 안내하세요.",
    match: ["콜리플라워"]
  },
  {
    id: "kohlrabi", name: "콜라비", group: "잎·줄기채소", category: "채소", glyph: "콜라비", tone: "purple",
    season: "KKKE-----PHK", ship: "상온", risk: "낮음", level: 3, keyword: "콜라비", origin: "제주",
    grow: "노지", tags: ["다이어트", "간식"],
    tip: "무처럼 아삭하고 달아 생으로 깍둑썰기하거나 피클로 먹습니다. 단단하고 오래가서 배송이 쉬운 편이고, 껍질 벗기는 법을 함께 보여 주면 좋아요.",
    match: ["콜라비"]
  },
  {
    id: "beet", name: "비트", group: "뿌리채소", category: "채소", glyph: "비트", tone: "red",
    season: "KKKSE----PHK", ship: "상온", risk: "낮음", level: 3, keyword: "비트", origin: "제주, 강원",
    grow: "노지", tags: ["다이어트", "홈카페"],
    tip: "착즙·샐러드용으로 찾는 붉은 뿌리채소입니다. 손과 도마에 물이 든다는 점을 알리고, 흙째 두면 오래간다고 안내하세요.",
    match: ["비트"], exclude: ["즙", "분말"]
  },
  {
    id: "yeolmu", name: "열무", group: "잎·줄기채소", category: "채소", emoji: "🥬", tone: "green",
    season: "--PHKKKHHE--", ship: "상온", risk: "보통", level: 3, keyword: "열무", origin: "경기, 충북, 강원",
    grow: "노지·하우스", tags: ["김장", "집밥"],
    tip: "여름 열무김치·열무국수 수요가 많습니다. 시들기 쉬워 당일 수확 출고가 중요하고, 한 단 무게(1~1.5kg 내외)를 기준으로 적어 주세요.",
    match: ["열무"], exclude: ["김치"]
  },
  {
    id: "lettuce", name: "상추", group: "잎·줄기채소", category: "채소", emoji: "🥬", tone: "green",
    season: "HHKKKHHHKKHH", ship: "냉장", risk: "높음", level: 2, keyword: "상추", origin: "경기 남양주·이천, 충남 논산",
    grow: "하우스·노지", tags: ["집밥"],
    tip: "쌈 수요로 1년 내내 팔리지만 여름에는 금방 물러 아이스팩이 꼭 필요합니다. 적상추·청상추를 나누고 무게 기준으로 파세요.",
    match: ["상추"]
  },
  {
    id: "ssukgat", name: "쑥갓", group: "잎·줄기채소", category: "채소", emoji: "🌿", tone: "green",
    season: "--PKKH--HK--", ship: "냉장", risk: "보통", level: 2, keyword: "쑥갓", origin: "경기, 충남",
    grow: "하우스·노지", tags: ["집밥"],
    tip: "매운탕·전골에 향을 내는 채소라 소량 묶음 판매가 알맞습니다. 다른 탕 재료와 묶어 구성하면 객단가를 올릴 수 있어요.",
    match: ["쑥갓"]
  },
  {
    id: "bok-choy", name: "청경채", group: "잎·줄기채소", category: "채소", emoji: "🥬", tone: "green",
    season: "HHHHHHHHHHHH", ship: "냉장", risk: "보통", level: 3, keyword: "청경채", origin: "경기, 충남",
    grow: "하우스", tags: ["집밥"],
    tip: "볶음·샤브샤브·마라탕 재료로 꾸준히 팔립니다. 작은 청경채와 일반 크기를 나누고, 무게와 포기 수를 함께 적어 주세요.",
    match: ["청경채"]
  },
  {
    id: "perilla-leaf", name: "깻잎", group: "잎·줄기채소", category: "채소", emoji: "🌿", tone: "green",
    season: "HHHHKKKKKHHH", ship: "냉장", risk: "보통", level: 3, keyword: "깻잎", origin: "충남 금산, 경남 밀양",
    grow: "하우스·노지", tags: ["집밥"],
    tip: "쌈·장아찌·김밥 수요로 1년 내내 팔립니다. 묶음 장수와 총 무게를 적고, 장아찌용 대용량을 따로 두세요.",
    match: ["깻잎"], exclude: ["깻잎김치", "장아찌"]
  },
  {
    id: "buchu", name: "부추", group: "잎·줄기채소", category: "채소", emoji: "🌿", tone: "green",
    season: "HHKKKHHHHHHH", ship: "냉장", risk: "보통", level: 3, keyword: "부추", origin: "경기 양주, 경북 포항",
    grow: "하우스·노지", tags: ["집밥"],
    tip: "봄에 처음 베는 부추가 연하고 향이 좋습니다. 영양부추·일반부추를 나눠 팔고, 시들기 쉬우니 신문지에 싸서 냉장 보관하라고 안내하세요.",
    match: ["부추"], exclude: ["김치"]
  },
  {
    id: "ssam-veg", name: "쌈채소 모둠", group: "잎·줄기채소", category: "채소", emoji: "🥬", tone: "green",
    season: "HHHHHHHHHHHH", ship: "냉장", risk: "높음", level: 2, keyword: "쌈채소 모듬", origin: "경기, 충남",
    grow: "하우스", tags: ["집밥", "다이어트"],
    tip: "로메인·케일·적겨자처럼 여러 잎채소를 한 상자에 담은 구성이 잘 나갑니다. 더운 철에는 시들기 쉬우니 보냉 포장과 출고 요일을 꼭 확인하세요.",
    match: ["쌈채소", "유럽채소", "모듬채소", "모둠채소"]
  },
  {
    id: "bomdong", name: "봄동", group: "파·배추·무", category: "채소", emoji: "🥬", tone: "green",
    season: "KKKE-------P", ship: "상온", risk: "보통", level: 3, keyword: "봄동", origin: "전남 진도·해남",
    grow: "노지", tags: ["별미", "집밥"],
    tip: "겨울 노지에서 자라 달고 고소한 배추로 겉절이·봄동전 수요가 많습니다. 포기 크기를 사진으로 보여 주고 kg 단위로 파세요.",
    match: ["봄동"]
  },
  {
    id: "jjokpa", name: "쪽파", group: "파·배추·무", category: "채소", glyph: "쪽파", tone: "green",
    season: "--KE---PHKKE", ship: "상온", risk: "보통", level: 3, keyword: "쪽파", origin: "전남 신안·진도, 경기",
    grow: "노지", tags: ["김장", "집밥"],
    tip: "김장철과 파김치 철에 주문이 몰립니다. 다듬는 데 손이 많이 가서 깐쪽파가 인기가 높으니, 흙쪽파와 깐쪽파를 나눠 팔아 보세요.",
    match: ["쪽파"], exclude: ["김치"]
  },
  {
    id: "lotus-root", name: "연근", group: "뿌리채소", category: "채소", glyph: "연근", tone: "brown",
    season: "KKKSS---PHKK", ship: "상온", risk: "낮음", level: 3, keyword: "연근", origin: "전남 무안, 경남 김해, 대구",
    grow: "노지", tags: ["집밥"],
    tip: "연근조림 반찬용으로 꾸준히 팔립니다. 흙연근·세척 연근·썬 연근(냉장)을 나누고, 자르면 색이 변하는 것은 자연스러운 일이라고 알려 주세요.",
    match: ["연근"]
  },
  {
    id: "deodeok", name: "더덕", group: "뿌리채소", category: "채소", glyph: "더덕", tone: "brown",
    season: "HHHKKHHHKKKH", ship: "상온", risk: "낮음", level: 3, keyword: "더덕", origin: "강원 횡성·홍천, 제주",
    grow: "노지·산지 재배", tags: ["보양", "집밥"],
    tip: "구이·무침용으로 향이 진한 봄·가을에 특히 잘 팔립니다. 껍질을 벗긴 깐더덕(냉장)과 흙더덕을 나누고, 굵기별로 값을 달리하세요.",
    match: ["더덕"]
  },
  {
    id: "taro", name: "토란", group: "뿌리채소", category: "채소", glyph: "토란", tone: "brown",
    season: "S------PKKSS", ship: "상온", risk: "낮음", level: 3, keyword: "토란", origin: "전남 곡성, 경남",
    grow: "노지", tags: ["명절", "집밥"],
    tip: "추석 토란국 수요가 가장 큽니다. 깐토란(냉장)과 흙토란을 나누고, 손질할 때 맨손이면 가려울 수 있으니 장갑을 쓰라고 안내하세요.",
    match: ["토란"]
  },
  {
    id: "yam", name: "마(산마)", group: "뿌리채소", category: "채소", glyph: "마", tone: "brown",
    season: "KKKSSSSSPHKK", ship: "상온", risk: "낮음", level: 3, keyword: "안동 마", origin: "경북 안동, 경남 진주",
    grow: "노지", tags: ["보양", "다이어트"],
    tip: "생으로 갈아 먹는 건강식으로 찾습니다. 긴 마와 둥근 마의 차이, 끈적임은 자연스러운 성분이라는 점을 함께 알려 주세요.",
    pattern: "(산|장|둥근|안동|참|생)\\s?마(\\s|$|\\d|\\()|(^|[\\s\\]\\)])마(\\s|$|\\d|\\()"
  },
  {
    id: "doraji", name: "도라지", group: "뿌리채소", category: "채소", glyph: "도라지", tone: "brown",
    season: "KKHHHHHHHKKK", ship: "상온", risk: "낮음", level: 3, keyword: "국산 도라지", origin: "경북 봉화, 강원",
    grow: "노지", tags: ["명절", "집밥"],
    tip: "명절 나물과 도라지무침 수요가 많습니다. 깐도라지(냉장)와 통도라지를 나누고 몇 년 키운 것인지 적어 주세요. 배도라지즙은 가공품으로 따로 팝니다.",
    match: ["도라지"], exclude: ["즙", "도라지청", "정과", "진액"]
  },
  {
    id: "yacon", name: "야콘", group: "뿌리채소", category: "채소", glyph: "야콘", tone: "brown",
    season: "SSSE-----PKK", ship: "상온", risk: "낮음", level: 3, keyword: "야콘", origin: "강원, 경북 상주",
    grow: "노지", tags: ["다이어트", "간식"],
    tip: "배처럼 아삭하고 달아 생으로 먹는 뿌리채소입니다. 캐고 1~2주 지나면 단맛이 오른다는 점과 상온 보관법을 알려 주세요.",
    match: ["야콘"]
  },
  {
    id: "sunchoke", name: "돼지감자", group: "뿌리채소", category: "채소", glyph: "돼지감자", tone: "brown",
    season: "KKKE-----PKK", ship: "상온", risk: "낮음", level: 3, keyword: "돼지감자", origin: "강원, 경북",
    grow: "노지", tags: ["다이어트"],
    tip: "혈당 관리 식단으로 찾는 고객이 많습니다. 생물과 말린 차(가공품)를 구분하고, 흙째 서늘하게 보관하라고 안내하세요.",
    match: ["돼지감자", "뚱딴지"]
  },
  {
    id: "turmeric", name: "울금", group: "뿌리채소", category: "채소", glyph: "울금", tone: "yellow",
    season: "SS-------PKK", ship: "상온", risk: "낮음", level: 2, keyword: "진도 울금", origin: "전남 진도, 전북",
    grow: "노지", tags: ["보양"],
    tip: "강황과 같은 계열의 노란 뿌리로 늦가을에 생울금이 나옵니다. 손과 옷에 노랗게 물든다는 점을 알리고, 생울금(냉장)과 분말(가공품)을 나눠 파세요.",
    match: ["울금"], exclude: ["분말", "울금환", "진액"]
  },

  // ───────── 버섯·나물 ─────────
  {
    id: "ginseng", name: "인삼(수삼)", group: "인삼·산양삼", category: "버섯·나물", glyph: "인삼", tone: "brown",
    season: "HHHHHHHPKKHH", ship: "냉장", risk: "보통", level: 2, keyword: "금산 수삼", origin: "충남 금산, 경북 영주",
    grow: "밭 재배", tags: ["선물", "보양", "명절"],
    tip: "명절 선물과 보양식 수요가 큽니다. 몇 년 키운 것인지와 뿌리 굵기로 값이 정해지니 옵션에 분명히 쓰고, 수삼은 냉장 보관 기간을 안내하세요.",
    match: ["수삼", "인삼"], exclude: ["홍삼", "진액", "정과", "절편", "산양삼", "장뇌삼", "인삼주"]
  },
  {
    id: "ssuk", name: "쑥", group: "봄나물", category: "버섯·나물", emoji: "🌿", tone: "green",
    season: "-PKKE-------", ship: "냉장", risk: "보통", level: 3, keyword: "해풍쑥", origin: "전남 신안·진도, 경남 남해",
    grow: "노지", tags: ["별미"],
    tip: "이른 봄 섬 지역에서 바닷바람을 맞고 자란 쑥이 인기가 많습니다. 쑥국·쑥떡용 생쑥과 데쳐 얼린 쑥을 나누면 시즌이 지나도 팔 수 있어요.",
    pattern: "(햇|해풍|섬|생|데친|국산)\\s?쑥(?!갓)|(^|[\\s\\]\\)])쑥(\\s|$|\\d|\\()"
  },
  {
    id: "chwi", name: "취나물", group: "봄나물", category: "버섯·나물", emoji: "🌿", tone: "green",
    season: "SSPHKESSSSSS", ship: "냉장", risk: "보통", level: 3, keyword: "취나물", origin: "강원, 경북 울릉",
    grow: "노지·산지", tags: ["집밥", "명절"],
    tip: "봄에는 생취나물, 나머지 달에는 말린 묵나물로 팔 수 있습니다. 정월대보름(1~2월)에 묵나물 수요가 크니 그 전에 물량을 준비하세요.",
    match: ["취나물"], exclude: ["곰취"]
  },
  {
    id: "chamnamul", name: "참나물", group: "봄나물", category: "버섯·나물", emoji: "🌿", tone: "green",
    season: "HHKKKHHHHHHH", ship: "냉장", risk: "보통", level: 3, keyword: "참나물", origin: "경북, 강원, 경기",
    grow: "하우스·노지", tags: ["집밥"],
    tip: "미나리와 비슷한 향긋함으로 무침·샐러드에 씁니다. 줄기가 꺾이지 않게 포장하고, 한 묶음 무게를 적어 주세요.",
    match: ["참나물"]
  },
  {
    id: "myeongi", name: "명이나물(산마늘)", group: "봄나물", category: "버섯·나물", emoji: "🌿", tone: "green",
    season: "--PKE-------", ship: "냉장", risk: "보통", level: 2, keyword: "명이나물", origin: "강원, 경북 울릉",
    grow: "산지 재배", tags: ["별미"],
    tip: "생잎은 4~5월에 잠깐 나오고 대부분 장아찌로 담급니다. 생잎 예약 판매와 장아찌용 대용량을 함께 두면 좋아요.",
    match: ["명이", "산마늘"]
  },
  {
    id: "gomchwi", name: "곰취", group: "봄나물", category: "버섯·나물", emoji: "🌿", tone: "green",
    season: "--PHKE------", ship: "냉장", risk: "보통", level: 2, keyword: "곰취", origin: "강원 양구·인제·태백",
    grow: "산지 재배", tags: ["별미"],
    tip: "향긋한 쌈용 산나물로 잎 크기가 고른 것이 좋은 값을 받습니다. 쌈·장아찌 활용법을 함께 보여 주세요.",
    match: ["곰취"]
  },
  {
    id: "bangpung", name: "방풍나물", group: "봄나물", category: "버섯·나물", emoji: "🌿", tone: "green",
    season: "-PKKE-------", ship: "냉장", risk: "보통", level: 3, keyword: "방풍나물", origin: "경남 남해, 전남",
    grow: "노지", tags: ["별미"],
    tip: "쌉싸름한 맛의 봄나물로 무침 수요가 많습니다. 산지 이름을 앞에 쓰고, 줄기가 억세지기 전 시기에 파세요.",
    match: ["방풍"]
  },
  {
    id: "eomnamu", name: "엄나무순(개두릅)", group: "봄나물", category: "버섯·나물", emoji: "🌿", tone: "green",
    season: "--PK--------", ship: "냉장", risk: "높음", level: 1, keyword: "엄나무순", origin: "강원, 경북",
    grow: "노지·산지", tags: ["별미"],
    tip: "두릅보다 쌉쌀하고 향이 강한 봄 순으로 1~2주면 시즌이 끝납니다. 금방 피어 버리니 산지 당일 발송이 꼭 필요해요.",
    match: ["엄나무", "개두릅"]
  },
  {
    id: "ttangdureup", name: "땅두릅", group: "봄나물", category: "버섯·나물", emoji: "🌿", tone: "green",
    season: "-PHKE-------", ship: "냉장", risk: "보통", level: 2, keyword: "땅두릅", origin: "강원, 충북",
    grow: "노지·하우스", tags: ["별미"],
    tip: "나무에서 따는 두릅보다 줄기가 길고 연하며 재배가 많아 시즌이 조금 깁니다. 데치는 법과 곁들임 양념을 보여 주세요.",
    match: ["땅두릅"]
  },
  {
    id: "meowi", name: "머위", group: "봄나물", category: "버섯·나물", emoji: "🌿", tone: "green",
    season: "-PKKE-------", ship: "냉장", risk: "보통", level: 3, keyword: "머위", origin: "전남, 경남",
    grow: "노지", tags: ["별미", "집밥"],
    tip: "쌉쌀한 머위잎은 쌈으로, 머위대는 들깨볶음으로 먹습니다. 잎과 대를 나눠 팔고 손질법을 함께 알려 주세요.",
    match: ["머위"]
  },
  {
    id: "godeulbbaegi", name: "고들빼기", group: "봄나물", category: "버섯·나물", emoji: "🌿", tone: "green",
    season: "--KE----PKK-", ship: "상온", risk: "낮음", level: 2, keyword: "고들빼기", origin: "전남 여수, 경기",
    grow: "노지", tags: ["김장"],
    tip: "쌉쌀한 고들빼기김치를 담그는 가을에 수요가 몰립니다. 쓴맛을 빼는 방법을 함께 알려 주면 좋아요.",
    match: ["고들빼기"], exclude: ["김치"]
  },
  {
    id: "dried-namul", name: "묵나물 세트", group: "말린 나물", category: "버섯·나물", emoji: "🌿", tone: "brown",
    season: "KKSSSSSSKSSK", ship: "상온", risk: "낮음", level: 4, keyword: "묵나물 세트", origin: "강원, 경북",
    grow: "건조 가공", tags: ["명절", "선물"],
    tip: "정월대보름(1~2월)과 명절에 수요가 큰 말린 나물 모둠입니다. 상온에서 오래 두고 먹을 수 있고, 불리고 삶는 법을 함께 안내하세요.",
    match: ["묵나물", "건나물", "말린나물", "나물세트"]
  },
  {
    id: "king-oyster", name: "새송이버섯", group: "버섯", category: "버섯·나물", emoji: "🍄", tone: "brown",
    season: "HHHHHHHHHHHH", ship: "냉장", risk: "낮음", level: 4, keyword: "새송이버섯", origin: "경남 진주, 충북",
    grow: "배지 재배", tags: ["집밥"],
    tip: "1년 내내 값이 안정된 버섯이라 처음 팔기 좋습니다. 2kg·4kg 대용량은 식당 수요가 있고, 구이용 굵기를 사진으로 보여 주세요.",
    match: ["새송이"]
  },
  {
    id: "oyster-mushroom", name: "느타리버섯", group: "버섯", category: "버섯·나물", emoji: "🍄", tone: "brown",
    season: "HHHHHHHHHHHH", ship: "냉장", risk: "보통", level: 3, keyword: "느타리버섯", origin: "경기, 충남",
    grow: "배지 재배", tags: ["집밥"],
    tip: "볶음·전골용 가정 수요가 많습니다. 물러지기 쉬우니 소포장과 냉장 배송을 기본으로 하세요.",
    match: ["느타리"]
  },
  {
    id: "neungi", name: "능이버섯", group: "버섯", category: "버섯·나물", emoji: "🍄", tone: "brown",
    season: "-------PKK--", ship: "냉장", risk: "높음", level: 1, keyword: "자연산 능이버섯", origin: "강원, 경북",
    grow: "자연산", tags: ["보양", "별미"],
    tip: "가을에만 나오는 귀한 자연산 버섯이라 시세가 해마다 크게 다릅니다. 생물은 예약 판매로 받고, 얼린 능이로 시즌 뒤에도 이어서 팔 수 있어요.",
    match: ["능이"]
  },
  {
    id: "button-mushroom", name: "양송이버섯", group: "버섯", category: "버섯·나물", emoji: "🍄", tone: "brown",
    season: "HHHHHHHHHHHH", ship: "냉장", risk: "보통", level: 3, keyword: "양송이버섯", origin: "충남 부여·보령",
    grow: "배지 재배", tags: ["집밥"],
    tip: "샐러드·구이·수프용으로 1년 내내 팔립니다. 갈색으로 변하거나 물기가 생기지 않게 냉장 배송하고, 크기(소·중·대)를 나눠 주세요.",
    match: ["양송이"]
  },
  {
    id: "lions-mane", name: "노루궁뎅이버섯", group: "버섯", category: "버섯·나물", emoji: "🍄", tone: "brown",
    season: "HHHHHHHHHHHH", ship: "냉장", risk: "보통", level: 2, keyword: "노루궁뎅이버섯", origin: "충북, 전남",
    grow: "배지 재배", tags: ["보양"],
    tip: "건강식으로 찾는 버섯이라 생물과 말린 것을 나눠 팝니다. 생김새가 낯설어 요리법을 함께 보여 주면 구매가 쉬워요.",
    match: ["노루궁뎅이"]
  },

  // ───────── 곡물·견과 ─────────
  {
    id: "glutinous-rice", name: "찹쌀", group: "곡물", category: "곡물·견과", emoji: "🍚", tone: "yellow",
    season: "SSSSSSSPHKKS", ship: "상온", risk: "낮음", level: 3, keyword: "햇찹쌀", origin: "전남, 전북, 경기",
    grow: "노지", tags: ["집밥", "명절"],
    tip: "명절 떡·약밥과 찰밥 수요가 있습니다. 생산 연도와 도정 날짜를 적고, 4kg·10kg 소포장을 함께 두세요.",
    match: ["찹쌀"], exclude: ["떡", "과자"]
  },
  {
    id: "barley", name: "보리", group: "곡물", category: "곡물·견과", emoji: "🌾", tone: "yellow",
    season: "SSSSPKSSSSSS", ship: "상온", risk: "낮음", level: 3, keyword: "햇보리", origin: "전북 김제, 전남",
    grow: "노지", tags: ["집밥", "다이어트"],
    tip: "6월 햇보리가 나오면 보리밥·잡곡 수요가 늘어납니다. 찰보리·늘보리 차이를 적고 생산 연도를 분명히 해 주세요.",
    match: ["보리"], exclude: ["보리차", "엿기름", "굴비", "보리새우"]
  },
  {
    id: "oats", name: "귀리", group: "곡물", category: "곡물·견과", emoji: "🌾", tone: "yellow",
    season: "SSSSPKSSSSSS", ship: "상온", risk: "낮음", level: 3, keyword: "국산 귀리", origin: "전북 정읍, 전남",
    grow: "노지", tags: ["다이어트", "집밥"],
    tip: "다이어트·건강 식단으로 꾸준히 팔립니다. 국산과 수입을 분명히 나누고, 쌀과 섞는 비율 같은 먹는 법을 함께 안내하세요.",
    match: ["귀리"]
  },
  {
    id: "red-bean", name: "팥", group: "곡물", category: "곡물·견과", glyph: "팥", tone: "red",
    season: "SSSSSSSSPHKK", ship: "상온", risk: "낮음", level: 3, keyword: "국산 팥", origin: "전북, 경기, 강원",
    grow: "노지", tags: ["집밥", "명절"],
    tip: "12월 동지 팥죽과 겨울 단팥 수요가 큽니다. 생산 연도를 적고, 여름에는 벌레가 생기지 않게 냉장 보관을 안내하세요.",
    pattern: "(^|[\\s\\]\\)])팥(\\s|$|\\d|\\()|(국산|붉은|적|햇|통)\\s?팥(\\s|$|\\d|\\()"
  },
  {
    id: "mung-bean", name: "녹두", group: "곡물", category: "곡물·견과", glyph: "녹두", tone: "green",
    season: "SSSSSSSPKSSS", ship: "상온", risk: "낮음", level: 3, keyword: "국산 녹두", origin: "전남, 경북",
    grow: "노지", tags: ["명절", "집밥"],
    tip: "명절 녹두전과 숙주 기르기 수요가 있습니다. 껍질 벗긴 깐녹두와 통녹두를 나누고 생산 연도를 적어 주세요.",
    match: ["녹두"], exclude: ["녹두전", "빈대떡"]
  },
  {
    id: "ginkgo", name: "은행", group: "견과", category: "곡물·견과", glyph: "은행", tone: "yellow",
    season: "SS------PKKS", ship: "상온", risk: "낮음", level: 3, keyword: "깐은행", origin: "충남, 전남, 경북",
    grow: "노지", tags: ["간식", "집밥"],
    tip: "가을에 나와 겨울까지 깐은행(냉동)과 껍질 은행으로 팝니다. 한 번에 많이 먹지 않도록 섭취량 안내를 넣어 주세요.",
    match: ["은행"]
  },
  {
    id: "pine-nut", name: "잣", group: "견과", category: "곡물·견과", glyph: "잣", tone: "brown",
    season: "SSSSSSSPHKKS", ship: "상온", risk: "낮음", level: 3, keyword: "가평 잣", origin: "경기 가평, 강원 홍천",
    grow: "산지", tags: ["명절", "선물"],
    tip: "국산 잣은 값이 높아 원산지 문의가 많습니다. 산지와 생산 연도를 분명히 쓰고, 기름이 많아 냉동 보관하라고 안내하세요.",
    pattern: "(^|[\\s\\]\\)])잣(\\s|$|\\d|\\()|(가평|홍천|국산|백|황|햇)\\s?잣"
  },

  // ───────── 가공·김장 ─────────
  {
    id: "kimjang-sauce", name: "김장 양념", group: "김장", category: "가공·김장", glyph: "양념", tone: "red",
    season: "---------PKK", ship: "냉장", risk: "보통", level: 2, keyword: "김장 양념", origin: "국내 산지 가공",
    grow: "가공", tags: ["김장"], processed: true,
    tip: "절임배추와 묶은 김장 세트로 팔면 객단가가 크게 오릅니다. 배추 몇 포기 분량인지와 받는 날짜를 절임배추와 맞추는 것이 핵심이에요.",
    match: ["김장양념", "김치양념", "김치속"]
  },
  {
    id: "kimchi", name: "김치", group: "김장", category: "가공·김장", glyph: "김치", tone: "red",
    season: "HHHHHHHHHKKK", ship: "냉장", risk: "보통", level: 3, keyword: "포기김치", origin: "국내 김치 제조",
    grow: "가공", tags: ["김장", "집밥"], processed: true,
    tip: "배추·고춧가루 원산지를 꼭 밝혀야 하는 품목입니다. 숙성 정도와 맵기를 옵션에 적고, 아이스박스 포장과 '받으면 바로 냉장'을 안내하세요.",
    match: ["김치"], exclude: ["김치양념", "김치속", "볶음김치", "김치찌개"]
  },
  {
    id: "persimmon-chips", name: "감말랭이", group: "곶감·말랭이", category: "가공·김장", glyph: "감", tone: "orange",
    season: "KKE-------PK", ship: "냉장", risk: "낮음", level: 4, keyword: "감말랭이", origin: "경북 상주·청도",
    grow: "건조 가공", tags: ["간식", "선물"],
    tip: "겨울 간식·답례품으로 잘 나갑니다. 얼려 두면 쫀득함이 오래간다고 안내하고, 소포장과 선물 상자를 함께 두세요.",
    match: ["감말랭이"]
  },
  {
    id: "sweetpotato-chips", name: "고구마말랭이", group: "곶감·말랭이", category: "가공·김장", emoji: "🍠", tone: "purple",
    season: "KKKE------PK", ship: "상온", risk: "낮음", level: 4, keyword: "고구마말랭이", origin: "전남 해남, 경기 여주",
    grow: "건조 가공", tags: ["간식", "다이어트"],
    tip: "겨울 간식·다이어트 간식으로 꾸준히 팔립니다. 촉촉한 반건조(냉장)와 바싹 말린 것을 나누고, 원료 고구마 산지를 적어 주세요.",
    match: ["고구마말랭이"]
  },
  {
    id: "sesame-oil", name: "참기름·들기름", group: "기름·청", category: "가공·김장", glyph: "기름", tone: "yellow",
    season: "KHHHHHHHKKKK", ship: "상온", risk: "보통", level: 3, keyword: "국산 참기름", origin: "국내 방앗간",
    grow: "착유 가공", tags: ["명절", "선물", "집밥"], processed: true,
    tip: "국산·수입 원료 표기와 짠 날짜를 가장 많이 묻습니다. 병이 깨지지 않게 완충 포장을 확인하고, 명절 선물세트로 구성해 보세요.",
    match: ["참기름", "들기름"]
  },
  {
    id: "pear-doraji", name: "배도라지즙", group: "기름·청", category: "가공·김장", glyph: "즙", tone: "yellow",
    season: "KKKHHHHHHKKK", ship: "상온", risk: "낮음", level: 4, keyword: "배도라지즙", origin: "국내 가공",
    grow: "착즙 가공", tags: ["선물", "보양"], processed: true,
    tip: "환절기·겨울 선물 수요가 큰 가공품입니다. 한 상자 포 수와 1포 용량, 배·도라지 원료 비율을 분명히 적어 주세요.",
    match: ["배도라지", "도라지배"]
  },
  {
    id: "yuzu-cheong", name: "유자청", group: "기름·청", category: "가공·김장", glyph: "유자청", tone: "yellow",
    season: "KKE-------PK", ship: "상온", risk: "보통", level: 3, keyword: "유자청", origin: "전남 고흥, 경남 거제",
    grow: "가공", tags: ["홈카페", "선물"], processed: true,
    tip: "겨울 유자차 수요와 선물세트가 많습니다. 유자 함량과 설탕 비율을 적고, 유리병이면 깨짐 방지 포장을 꼭 확인하세요.",
    match: ["유자청", "유자차"]
  },

  // ───────── 수산 ─────────
  {
    id: "salted-shrimp", name: "새우젓", group: "젓갈·건어물", category: "수산", glyph: "새우젓", tone: "pink",
    season: "SSSSSHHSPKKS", ship: "냉장", risk: "보통", level: 3, keyword: "육젓 새우젓", origin: "충남 강경·광천, 인천 소래",
    grow: "염장 가공", tags: ["김장"], processed: true,
    tip: "잡는 때에 따라 오젓·육젓·추젓으로 나뉘고 육젓이 가장 비쌉니다. 김장철에 주문이 몰리니 9~10월에 물량을 확보하세요.",
    match: ["새우젓", "육젓", "추젓", "오젓"]
  },
  {
    id: "jeotgal", name: "젓갈(명란·창란 등)", group: "젓갈·건어물", category: "수산", glyph: "젓갈", tone: "red",
    season: "HHHHHHHHKKKK", ship: "냉장", risk: "보통", level: 3, keyword: "명란젓", origin: "강원 속초, 충남 강경, 부산",
    grow: "염장 가공", tags: ["집밥", "선물", "명절"], processed: true,
    tip: "저염·일반 염도를 표기하고 냉동 보관을 안내하세요. 여러 젓갈을 묶은 선물세트가 명절에 잘 나갑니다.",
    match: ["명란", "창란", "오징어젓", "낙지젓", "어리굴젓", "갈치속젓", "젓갈"], exclude: ["새우젓"]
  },
  {
    id: "gejang", name: "게장", group: "젓갈·건어물", category: "수산", emoji: "🦀", tone: "orange",
    season: "HHHKKKHHHHHH", ship: "냉동", risk: "보통", level: 3, keyword: "간장게장", origin: "충남 서산·태안, 전남 여수",
    grow: "가공", tags: ["별미", "선물"], processed: true,
    tip: "알이 찬 봄 암꽃게로 담근 게장이 가장 인기가 많습니다. 얼린 채 받아 냉장에서 천천히 녹이는 법과 국산 꽃게인지를 분명히 적어 주세요.",
    match: ["게장"]
  },
  {
    id: "hwangtae", name: "황태", group: "젓갈·건어물", category: "수산", glyph: "황태", tone: "yellow",
    season: "KHHHHHHHKHHK", ship: "상온", risk: "낮음", level: 4, keyword: "황태채", origin: "강원 인제·평창",
    grow: "덕장 건조", tags: ["명절", "집밥"],
    tip: "겨울 덕장에서 말린 황태는 1년 내내 해장국·구이용으로 팔립니다. 황태채·통황태·황태포를 나누고, 원료 명태의 원산지를 정확히 적어 주세요.",
    match: ["황태", "북어", "먹태"]
  },
  {
    id: "maesaengi", name: "매생이", group: "해조류", category: "수산", glyph: "매생이", tone: "green",
    season: "KKE-------PK", ship: "냉장", risk: "보통", level: 3, keyword: "장흥 매생이", origin: "전남 장흥·완도·고흥",
    grow: "양식", tags: ["별미"],
    tip: "겨울 한철 매생이국·떡국용으로 찾습니다. 한 덩이 단위로 얼린 상품이 편하고, 이물질 손질 여부를 적어 주세요.",
    match: ["매생이"]
  },
  {
    id: "tot", name: "톳", group: "해조류", category: "수산", glyph: "톳", tone: "brown",
    season: "SSKKKSSSSSSS", ship: "냉장", risk: "낮음", level: 3, keyword: "생톳", origin: "전남 완도, 제주",
    grow: "양식", tags: ["집밥", "다이어트"],
    tip: "봄에 나오는 생톳과 염장톳·말린 톳으로 1년 내내 팔 수 있습니다. 톳밥·무침 레시피를 함께 보여 주세요.",
    pattern: "(^|[\\s\\]\\)])톳(\\s|$|\\d|\\()|(생|건|염장|완도|제주)\\s?톳"
  },
  {
    id: "dasima", name: "다시마", group: "해조류", category: "수산", glyph: "다시마", tone: "brown",
    season: "SSSSKKKSSSSS", ship: "상온", risk: "낮음", level: 4, keyword: "완도 다시마", origin: "전남 완도, 부산 기장",
    grow: "양식·건조", tags: ["집밥"],
    tip: "국물용으로 1년 내내 꾸준히 팔리는 상온 상품이라 처음 시작하기 좋습니다. 겉의 하얀 가루는 감칠맛 성분이지 곰팡이가 아니라고 알려 주세요.",
    match: ["다시마"]
  },
  {
    id: "gamtae", name: "감태", group: "해조류", category: "수산", glyph: "감태", tone: "green",
    season: "KKKE------PH", ship: "상온", risk: "낮음", level: 2, keyword: "서산 감태", origin: "충남 서산·태안",
    grow: "자연산", tags: ["별미", "선물"],
    tip: "김보다 쌉싸름하고 향이 진한 겨울 해초입니다. 구운 감태는 선물 수요가 있으니 상온 선물세트로 구성해 보세요.",
    match: ["감태"]
  },
  {
    id: "yellowtail", name: "방어", group: "생선", category: "수산", emoji: "🐟", tone: "blue",
    season: "KKE------PHK", ship: "냉장", risk: "높음", level: 2, keyword: "대방어", origin: "제주 모슬포, 강원",
    grow: "자연산", tags: ["별미"],
    tip: "겨울 회 수요가 큰 생선으로 클수록 값이 높습니다. 손질 상품은 냉장 당일 발송이 기본이고, 부위 구성을 사진으로 보여 주세요.",
    match: ["방어"]
  },
  {
    id: "gizzard-shad", name: "전어", group: "생선", category: "수산", emoji: "🐟", tone: "blue",
    season: "------PKKE--", ship: "냉장", risk: "높음", level: 2, keyword: "가을 전어", origin: "전남 광양·보성, 경남 사천",
    grow: "자연산", tags: ["별미"],
    tip: "가을을 대표하는 생선이라 8~10월에 모아서 팝니다. 구이용·회용 손질 여부를 적고 냉장 당일 발송을 확인하세요.",
    match: ["전어"]
  },
  {
    id: "spanish-mackerel", name: "삼치", group: "생선", category: "수산", emoji: "🐟", tone: "blue",
    season: "KKE-----PHKK", ship: "냉동", risk: "낮음", level: 3, keyword: "삼치", origin: "전남 여수, 제주",
    grow: "자연산", tags: ["집밥"],
    tip: "기름이 오르는 겨울 삼치가 가장 맛있습니다. 토막·순살 손질 상품을 얼려서 팔면 배송이 쉬워요.",
    match: ["삼치"]
  },
  {
    id: "cod", name: "대구", group: "생선", category: "수산", emoji: "🐟", tone: "blue",
    season: "KKE-------PK", ship: "냉장", risk: "높음", level: 2, keyword: "생대구", origin: "경남 거제·진해",
    grow: "자연산", tags: ["별미"],
    tip: "겨울 대구탕·지리 수요가 큽니다. 생대구는 냉장 당일 발송이 꼭 필요하고, 알·이리 포함 여부를 옵션에 적어 주세요.",
    pattern: "(생|활|거제|진해|손질|냉동|통)\\s?대구(?!광역|시)|대구(탕|지리|살|알|이리|포)"
  },
  {
    id: "croaker", name: "민어", group: "생선", category: "수산", emoji: "🐟", tone: "blue",
    season: "-----PKKE---", ship: "냉장", risk: "높음", level: 1, keyword: "민어", origin: "전남 신안, 목포",
    grow: "자연산", tags: ["보양", "별미"],
    tip: "복날 보양 생선으로 여름에 값이 가장 높습니다. kg 단가와 손질 상태(회·탕용)를 분명히 하고, 비싼 품목이라 보상 기준을 미리 정하세요.",
    match: ["민어"]
  },
  {
    id: "tilefish", name: "옥돔", group: "생선", category: "수산", emoji: "🐟", tone: "blue",
    season: "KKKE-----PHK", ship: "냉동", risk: "낮음", level: 3, keyword: "제주 옥돔", origin: "제주",
    grow: "자연산·반건조", tags: ["명절", "선물"],
    tip: "명절 선물용 반건조 옥돔이 대표 상품입니다. 마리당 크기와 염도를 적고, 손질·급랭 상태를 사진으로 보여 주세요.",
    match: ["옥돔"]
  },
  {
    id: "flatfish", name: "가자미", group: "생선", category: "수산", emoji: "🐟", tone: "blue",
    season: "KKKKHHHHHHKK", ship: "냉동", risk: "보통", level: 3, keyword: "참가자미", origin: "경북 포항, 강원 속초",
    grow: "자연산·반건조", tags: ["집밥"],
    tip: "구이·조림용 반건조 가자미가 꾸준히 팔립니다. 마리 수와 크기를 적고 냉동 보관법을 안내하세요.",
    match: ["가자미"]
  },
  {
    id: "halibut", name: "광어", group: "생선", category: "수산", emoji: "🐟", tone: "blue",
    season: "KKKHHHHHHHKK", ship: "냉장", risk: "높음", level: 2, keyword: "광어회", origin: "제주, 전남 완도",
    grow: "양식", tags: ["별미"],
    tip: "양식이라 1년 내내 나오지만 겨울 광어가 가장 맛있습니다. 회는 손질 당일 발송이 기본이고, 살아 있는 채 보내기는 어렵다는 점을 알아 두세요.",
    match: ["광어"]
  },
  {
    id: "doddari", name: "도다리", group: "생선", category: "수산", emoji: "🐟", tone: "blue",
    season: "-PKKE-------", ship: "냉장", risk: "높음", level: 2, keyword: "도다리쑥국", origin: "경남 통영·거제",
    grow: "자연산", tags: ["별미"],
    tip: "봄 도다리쑥국으로 찾는 생선입니다. 손질 도다리와 쑥을 함께 담은 쑥국 세트가 반응이 좋아요.",
    match: ["도다리"]
  },
  {
    id: "monkfish", name: "아귀", group: "생선", category: "수산", emoji: "🐟", tone: "blue",
    season: "KKKKE-----PK", ship: "냉동", risk: "보통", level: 3, keyword: "아귀찜", origin: "경남 마산·통영",
    grow: "자연산", tags: ["별미"],
    tip: "아귀찜·아귀탕 재료로 손질 아귀를 얼려서 팝니다. 간 포함 여부와 손질 뒤 무게를 적어 주세요.",
    match: ["아귀"]
  },
  {
    id: "red-snow-crab", name: "홍게", group: "게·새우", category: "수산", emoji: "🦀", tone: "red",
    season: "KKKKHH--HHKK", ship: "냉동", risk: "보통", level: 3, keyword: "홍게", origin: "경북 영덕·울진, 강원 동해",
    grow: "자연산", tags: ["별미"],
    tip: "대게보다 값이 낮아 찜용 가성비 게로 인기가 많습니다. 쪄서 얼린 홍게는 1년 내내 팔 수 있고, 살이 찬 정도를 미리 알려 주세요.",
    match: ["홍게"], exclude: ["게장"]
  },
  {
    id: "clam", name: "바지락", group: "조개", category: "수산", emoji: "🐚", tone: "brown",
    season: "HHKKKE--HHHH", ship: "냉장", risk: "보통", level: 3, keyword: "해감 바지락", origin: "충남 태안, 전북 고창, 인천",
    grow: "갯벌", tags: ["집밥"],
    tip: "봄 바지락이 살이 가장 오릅니다. 해감 여부를 상품명에 적고, 봄철에는 패류독소 소식을 확인한 뒤 판매하세요.",
    cs: LIVE_SHELLFISH_CS, match: ["바지락"]
  },
  {
    id: "nakji", name: "낙지", group: "오징어·문어", category: "수산", emoji: "🐙", tone: "red",
    season: "HHHKE--PKKKH", ship: "냉장", risk: "높음", level: 2, keyword: "세발낙지", origin: "전남 무안·신안·목포",
    grow: "자연산", tags: ["보양", "별미"],
    tip: "가을 세발낙지가 대표이고 6~7월은 잡지 못하는 기간입니다. 살아 있는 낙지는 배송이 어려워 손질해 얼린 낙지를 함께 두세요.",
    match: ["낙지"], exclude: ["낙지젓"]
  },
  {
    id: "sea-squirt", name: "멍게", group: "조개", category: "수산", glyph: "멍게", tone: "orange",
    season: "--PHKKE-----", ship: "냉장", risk: "높음", level: 2, keyword: "통영 멍게", origin: "경남 통영·거제",
    grow: "양식", tags: ["별미"],
    tip: "봄~초여름 향이 가장 좋은 멍게는 깐멍게(냉장 당일)와 껍질째 멍게로 나눠 팝니다. 비빔밥용 냉동 멍게는 시즌 뒤에도 팔 수 있어요.",
    match: ["멍게"]
  },
  {
    id: "pen-shell", name: "키조개", group: "조개", category: "수산", emoji: "🐚", tone: "brown",
    season: "KKKKE-----PH", ship: "냉장", risk: "보통", level: 2, keyword: "키조개 관자", origin: "충남 보령, 전남 장흥",
    grow: "자연산", tags: ["별미"],
    tip: "손질한 관자 상품이 편해서 잘 나갑니다. 구이 레시피를 보여 주고 관자 크기와 개수를 적어 주세요.",
    match: ["키조개"]
  },
  {
    id: "egg-cockle", name: "새조개", group: "조개", category: "수산", emoji: "🐚", tone: "brown",
    season: "KKKE-------P", ship: "냉장", risk: "높음", level: 1, keyword: "새조개 샤브샤브", origin: "충남 홍성, 전남 여수",
    grow: "자연산", tags: ["별미"],
    tip: "겨울 한철 샤브샤브용으로 찾는 비싼 조개입니다. 시즌이 짧아 예약 판매가 알맞고, 손질한 살의 냉장 배송을 확인하세요.",
    match: ["새조개"]
  },
  {
    id: "sea-cucumber", name: "해삼", group: "조개", category: "수산", glyph: "해삼", tone: "brown",
    season: "KKKKE----PHK", ship: "냉장", risk: "보통", level: 2, keyword: "해삼", origin: "경남 통영, 강원, 제주",
    grow: "자연산·양식", tags: ["보양", "별미"],
    tip: "겨울~봄 생해삼과 값이 높은 말린 해삼으로 나뉩니다. 내장 손질 여부와 말린 해삼을 불리는 법을 분명히 적어 주세요.",
    match: ["해삼"]
  },
  {
    id: "corbicula", name: "재첩", group: "조개", category: "수산", emoji: "🐚", tone: "brown",
    season: "--PKKE------", ship: "냉장", risk: "보통", level: 3, keyword: "섬진강 재첩", origin: "경남 하동, 전남 광양",
    grow: "자연산", tags: ["보양", "집밥"],
    tip: "봄 섬진강 재첩국이 대표 상품입니다. 생재첩과 끓여 얼린 재첩국을 나누고 해감 여부를 적어 주세요.",
    cs: LIVE_SHELLFISH_CS, match: ["재첩"]
  }
];
