/* DOOGO CLASS — 돈 되는 VOD · 전자책 · LIVE 클래스 스토어 (v4)
 * 디자인: 패스트캠퍼스 디자인 문서(커머스 레드 #fc1c49 · Pretendard Variable · 4px 모서리 · 글자 #171b1f/#747678 · 면 #f5f5f6)를 따른다.
 *         카드 = 썸네일(순위 · 마감 · 찜 수) → 분야 > → 굵은 제목 2줄 → 강사 · 별점 → 수강 기간 | 시간 | 난이도 → 할인율 + 가격 → 배지
 *         상세 = 패스트캠퍼스 강의 상세 구성(오른쪽 결제 상자 · 할인 마감 시계 · 요약 칸 · POINT · 파트별 커리큘럼 · 환불 규정) + 우리 것(맛보기 · 다짐 한마디 · 기수 강의 연결)
 * 상품: VOD 강의 · 전자책 위주(CLASS101처럼) + LIVE · 오프라인 프리미엄 강의(일시 · 장소 · 잔여석)
 * 계정: VOD 수강생만 따로 가입. 시안에서는 늘 체험 계정으로 로그인된 상태(로그아웃하면 이 탭에서만 풀린다)
 * 주소: #/vod · #/vod/c/all(?tab=free|vod|ebook|premium) · #/vod/c/soon · #/vod/c/<분야> · #/vod/search?q= · #/vod/p/<id> · #/vod/about
 *       #/vod/checkout/<id> · #/vod/order/<번호> · #/vod/login · #/vod/signup · #/vod/learn/<id>/<강의>
 *       #/vod/my(/classes|free|vod|ebooks|live|alarm|likes|pending|orders|coupons|points|reviews|posts|badges|account|help)
 * 데이터: DB.data.vod — 지금은 이 브라우저 저장(시안) */
(function () {
  "use strict";
  const esc = (s) => DB.esc(s), won = (n) => DB.won(n), icon = (n, c) => window.icon(n, c);
  const now = () => Date.now(), today = () => DB.date.todayStr();
  const KEY_ME = "doinggo:vod-me", KEY_OUT = "doinggo:vod-out", KEY_TOPIC = "doinggo:vod-topics";
  // 정식 서버(/api)에 붙어 있으면 회원 · 주문 · 후기 · 문의는 서버 문서로 오고 가요 (db.js · api/_lib/vodaccess.js)
  const SRV = () => !!(window.DB && DB.remote && DB.remote.on);
  const stat = () => (SRV() && V().stat) || {};
  const KEY_KK = "doinggo:vod-kk", SRC_KEY = "doinggo:vod-src";
  const ACC = ["#d4f53c", "#19e3a1", "#ff2d87", "#ff9f1a", "#3fb6ff", "#ff3b3b"];
  const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} } };
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };

  /* ================= 데이터 ================= */
  const CATS = [
    { key: "biz", label: "부업 · 창업", icon: "store", color: "#ff0037" },
    { key: "commerce", label: "쇼핑몰 · 커머스", icon: "coins", color: "#111111" },
    { key: "marketing", label: "마케팅 · 브랜딩", icon: "megaphone", color: "#ff5c70" },
    { key: "ai", label: "AI · 콘텐츠", icon: "sparkles", color: "#3b3b3b" },
    { key: "money", label: "재테크", icon: "calculator", color: "#ff0037" },
    { key: "career", label: "커리어 · 자기계발", icon: "award", color: "#111111" }
  ];
  const TOPICS = ["해외 건기식 브랜드", "스마트스토어 위탁판매", "쿠팡 로켓그로스", "해외구매대행", "산지직송 농산물", "1인 무역", "뉴질랜드 직구 소싱", "상세페이지 제작", "AI 그림 굿즈", "챗GPT 블로그", "유튜브 쇼츠 수익화", "인스타 카드뉴스",
    "PDF 전자책", "공동구매 · 공구", "라이브커머스", "와디즈 펀딩", "아마존 셀링", "틱톡샵 판매", "쿠팡파트너스", "네이버 블로그 애드포스트", "디지털 굿즈 판매", "온라인 클래스 만들기", "퍼스널 브랜딩", "유료 커뮤니티 운영",
    "카카오 이모티콘", "노션 템플릿 판매", "Etsy 디지털 파일", "스톡 사진 · 영상", "영상 편집 외주", "썸네일 디자인", "번역 · 로컬라이징", "AI 자동화 외주", "중고 리셀", "핸드메이드 판매", "체험단 · 리뷰", "1:1 컨설팅"];
  // 상품 종류: [짧은 이름, 카드 배지, 상세 안내]
  const TYPE = { vod: ["VOD 강의", "온라인", "온라인 녹화 영상"], ebook: ["전자책", "전자책", "PDF 전자책"], book: ["종이책", "종이책", "택배로 받는 종이책"], live: ["LIVE 강의", "LIVE", "실시간 온라인 강의"], offline: ["오프라인 강의", "오프라인", "현장 강의"] };
  const L = (t, min, o) => Object.assign({ id: "", title: t, min, video: "", preview: false, desc: "", files: [] }, o || {});
  const CH = (title, lessons) => ({ id: "", title, lessons });
  // 상품 v2 필드: color = [썸네일 바탕색, 포인트 색], hook(강조 띠) · tagline(강사 한 줄) · headline(소개 큰 제목 2줄) · likeBase(기존 찜 수) · openAt(오픈 예정일)
  const V2 = {
    v1: { color: ["#1c1c1e", "#d4f53c"], hook: "재고 0원 · 사업자 없이 시작", tagline: "뉴질랜드 건기식 브랜드 대표", headline: "해외 건기식 브랜드,\n0원으로 여는 법 알려드릴게요.", likeBase: 24, badges: ["HOT", "BEST"] },
    v2: { color: ["#1c1c1e", "#ff2d87"], hook: "그림 실력 0이어도 OK", tagline: "긱스쿨 AI 굿즈 강사", headline: "AI 그림으로 굿즈 만들어\n파는 법 알려드릴게요.", likeBase: 15, badges: ["NEW", "NICE"] },
    v3: { color: ["#1c1c1e", "#ff9f1a"], hook: "귤 하나로 월매출 10억", tagline: "산지직송 브랜드 대표", headline: "농산물도 브랜드가 되면\n두 배로 팔려요.", likeBase: 31, badges: ["HOT", "BEST"] },
    v4: { color: ["#1c1c1e", "#19e3a1"], hook: "구매 전환율 2배", tagline: "상세페이지 구조 전문가", headline: "팔리는 상세페이지는\n순서가 정해져 있어요.", likeBase: 12, badges: ["NICE"] },
    v5: { color: ["#1c1c1e", "#3fb6ff"], hook: "하루 1시간 루틴", tagline: "AI 콘텐츠 크리에이터", headline: "챗GPT로 쓰고\n블로그로 버는 루틴.", likeBase: 9, badges: [] },
    v6: { color: ["#1c1c1e", "#d4f53c"], hook: "뉴질랜드 현지 소싱", tagline: "뉴질랜드 건기식 브랜드 대표", headline: "현지에서 직접 고르는\n직구 상품 소싱법.", likeBase: 7, badges: ["NEW"] },
    v7: { color: ["#1c1c1e", "#ff3b3b"], hook: "40분 무료 특강", tagline: "뉴질랜드 건기식 브랜드 대표", headline: "1인 무역,\n처음이라면 여기서부터.", likeBase: 42, badges: ["HOT"] },
    v8: { color: ["#1c1c1e", "#ff9f1a"], hook: "이름 · 로고 · 패키지", tagline: "산지직송 브랜드 대표", headline: "같은 귤도 브랜드가 있으면\n더 비싸게 팔려요.", likeBase: 5, badges: [] }
  };
  // v3(이번 시안)에 더한 값: 업데이트 날짜 · 강의 노트 · 첨부 자료 · 비메오 영상 · 무료 특강 선물 자료
  const V3 = { v1: { updatedAt: "2026-10-20", badges: ["HOT", "BEST", "UPDATE"] }, v7: { gifts: [{ title: "1인 무역 시작 체크리스트", pages: 12, file: "assets/files/v7-gift.pdf" }] } };
  const V3L = {
    "v1-l2-1": { preview: true, desc: "뉴질랜드 제조사를 어디서 찾고, 어떤 기준으로 추려야 하는지 실제 리스트를 보며 설명해요." },
    "v2-l1-3": { preview: true }, "v3-l2-1": { preview: true }, "v4-l2-1": { preview: true }, "v5-l2-1": { preview: true }, "v6-l2-1": { preview: true },
    "v1-l1-1": { desc: "이 클래스를 끝까지 들으면 무엇이 남는지, 한 달 동안 어떤 순서로 따라가면 되는지 먼저 정리해요.", files: [{ name: "4주 실행 계획표.pdf", url: "" }] },
    "v1-l2-2": { desc: "첫 연락 메일은 짧고 구체적일수록 답장이 와요. 그대로 복사해 쓸 수 있는 템플릿 3가지를 드려요.", files: [{ name: "공급처 연락 메일 템플릿.docx", url: "" }] },
    "v1-l3-1": { preview: true, video: "https://vimeo.com/76979871", desc: "아이비클래스처럼 비메오(Vimeo) 링크로 올린 강의 예시예요. 통관 · 인증 · 표시사항을 한 장으로 정리해요.", files: [{ name: "통관 · 표시사항 정리표.xlsx", url: "" }] }
  };
  function seedNew() {
    const P = (o) => ids(Object.assign({ status: "on", share: null, accessDays: null, level: "입문", faq: [], createdAt: now(), type: "vod" }, o));
    return [
      P({ id: "v10", type: "ebook", title: "해외 건기식 브랜드 런칭 체크리스트 전자책", sub: "공급처 연락 메일 · 통관 서류 · 첫 광고 세팅까지 86쪽에 담았어요", cat: "commerce", iid: "moon", creator: "문대표", price: 39000, sale: 29000, saleEnd: "2026-11-20", pages: 86, format: "PDF", base: 860, createdAt: Date.parse("2026-10-16"),
        color: ["#1c1c1e", "#ffd23f"], hook: "PDF 86쪽 · 바로 다운로드", tagline: "뉴질랜드 건기식 브랜드 대표", thumbText: "건기식 런칭\n체크리스트", headline: "막막한 첫 런칭,\n체크리스트 한 권으로 정리해요.", likeBase: 18, badges: ["NEW", "BEST"],
        who: ["강의를 듣기 전에 전체 흐름부터 보고 싶은 분", "할 일을 빠뜨리지 않고 순서대로 챙기고 싶은 분"], learn: ["시장 조사 · 예산 계획표", "공급처 연락 메일 템플릿 5종", "통관 · 표시사항 서류 목록", "광고 3만 원 세팅표"],
        intro: "VOD 클래스에서 다룬 내용을 바로 쓰는 양식과 체크리스트로 정리한 전자책이에요.\n\n결제하면 마이페이지 › 전자책에서 바로 내려받을 수 있어요.",
        curriculum: [CH("1장 시작 전 준비", [L("시장 조사 체크리스트", 12, { preview: true }), L("예산 · 일정 계획표", 8)]), CH("2장 공급처 찾기", [L("제조사 리스트 양식", 10), L("첫 연락 메일 템플릿 5종", 14)]), CH("3장 판매 준비", [L("통관 · 표시사항 서류", 18), L("상세페이지 구성안", 12)]), CH("4장 첫 광고", [L("광고 3만 원 세팅표", 12)])] }),
      P({ id: "v11", type: "ebook", title: "농산물 상세페이지 문장 템플릿 100", sub: "제철 · 산지 · 맛 표현까지, 그대로 붙여 쓰는 판매 문장 100개", cat: "marketing", iid: "farmer", creator: "갓농부", price: 19000, sale: null, saleEnd: "", pages: 64, format: "PDF", base: 420, createdAt: Date.parse("2026-09-30"), updatedAt: "2026-10-22",
        color: ["#1c1c1e", "#19e3a1"], hook: "바로 쓰는 문장 100개", tagline: "산지직송 브랜드 대표", thumbText: "상세페이지\n문장 100", headline: "쓸 말이 막힐 때,\n펼쳐 보는 문장집.", likeBase: 11, badges: ["UPDATE"],
        who: ["상세페이지 문장이 늘 막히는 분"], learn: ["첫 화면 한 줄 문장 20개", "맛 · 식감 표현 30개", "산지 · 생산자 이야기 문장 30개", "후기 유도 문장 20개"], intro: "갓농부가 실제로 팔면서 반응이 좋았던 문장만 모았어요. 10월에 제철 문장 20개를 더했어요.",
        curriculum: [CH("PART 1 첫 화면", [L("한 줄로 사게 만드는 문장", 14, { preview: true })]), CH("PART 2 맛 · 식감", [L("맛 표현 문장", 18)]), CH("PART 3 산지 이야기", [L("생산자 · 산지 문장", 18)]), CH("PART 4 후기", [L("후기 유도 문장", 14)])] }),
      P({ id: "v12", type: "live", title: "AI 굿즈 LIVE 클래스: 2시간 만에 스티커 10종 완성", sub: "Zoom으로 화면을 같이 보며 캐릭터부터 인쇄용 파일까지 만들어요", cat: "ai", iid: "choi", creator: "초이", price: 59000, sale: 49000, saleEnd: "2026-11-10", eventAt: "2026-11-14T20:00", eventMin: 120, seats: 30, link: "https://zoom.us/j/0000000000", replayDays: 7, base: 0, createdAt: Date.parse("2026-10-21"),
        color: ["#1c1c1e", "#ff2d87"], hook: "실시간 Zoom 실습", tagline: "긱스쿨 AI 굿즈 강사", thumbText: "AI 굿즈\nLIVE 실습", headline: "혼자 하면 막히는 부분,\nLIVE로 같이 끝내요.", likeBase: 14, badges: ["NEW"],
        who: ["VOD로는 자꾸 미루게 되는 분", "질문하면서 바로 따라 하고 싶은 분"], learn: ["AI로 일관된 캐릭터 만들기", "스티커 10종 인쇄용 파일", "제작 업체에 바로 보내는 법"], intro: "2시간 동안 초이와 화면을 같이 보며 실습해요. 끝난 뒤 7일 동안 다시보기를 드려요.",
        curriculum: [CH("LIVE 진행 순서", [L("오프닝 · 오늘 만들 것", 10), L("AI로 캐릭터 만들기 실습", 50), L("인쇄용 파일 만들기", 40), L("Q&A", 20)])] }),
      P({ id: "v13", type: "offline", title: "1인 무역 오프라인 워크숍 · 서울 강남", sub: "20명이 한자리에 모여 내 상품 찾기부터 공급처 연락까지 같이 해요", cat: "biz", iid: "moon", creator: "문대표", price: 150000, sale: 120000, saleEnd: "2026-11-15", eventAt: "2026-11-22T14:00", eventMin: 240, seats: 20, place: "서울 강남구 테헤란로 (자세한 주소는 신청 후 안내)", base: 0, createdAt: Date.parse("2026-10-19"),
        color: ["#1c1c1e", "#3fb6ff"], hook: "20명 한정 · 현장 실습", tagline: "뉴질랜드 건기식 브랜드 대표", thumbText: "1인 무역\n오프라인 워크숍", headline: "온라인으로 듣고 끝내지 말고,\n현장에서 같이 시작해요.", likeBase: 22, badges: ["HOT"],
        who: ["직접 만나 질문하고 싶은 분", "같이 시작할 동료가 필요한 분"], learn: ["1인 무역 구조 한눈에 보기", "내 상품 찾기 실습", "공급처 연락 메일 함께 쓰기"], intro: "문대표와 4시간 동안 실습하는 현장 워크숍이에요. 노트북을 꼭 챙겨 오세요.",
        curriculum: [CH("워크숍 진행", [L("1인 무역 구조 한눈에 보기", 40), L("내 상품 찾기 실습", 80), L("공급처 연락 메일 함께 쓰기", 60), L("네트워킹 · Q&A", 60)])] })
    ];
  }
  function seedCoupons() {
    return [
      { id: "cp-welcome", code: "WELCOME", name: "신규 가입 5,000원 할인", kind: "won", value: 5000, max: 0, min: 0, days: 30, endAt: "", types: [], auto: "signup", on: true },
      { id: "cp-10000", code: "DOOGO10000", name: "1만 원 할인 쿠폰", kind: "won", value: 10000, max: 0, min: 50000, days: 0, endAt: "2026-12-31", types: [], auto: "", on: true },
      { id: "cp-ebook", code: "EBOOK20", name: "전자책 20% 할인", kind: "pct", value: 20, max: 0, min: 0, days: 0, endAt: "2026-11-30", types: ["ebook"], auto: "", on: true }
    ];
  }
  // 체험 계정 학습 기록 · 쿠폰 · 포인트 (오늘 날짜 기준으로 만든다)
  function seedDemo(v) {
    const t = today(), D = (n) => DB.date.addDays(t, n);
    v.coupons = v.coupons && v.coupons.length ? v.coupons : seedCoupons();
    v.memberCoupons = v.memberCoupons || {};
    if (!v.memberCoupons["vm-demo"]) v.memberCoupons["vm-demo"] = [{ id: "mc-1", cid: "cp-welcome", at: Date.parse(D(-5)), exp: D(25), usedAt: null, orderNo: "" }, { id: "mc-2", cid: "cp-10000", at: Date.parse(D(-2)), exp: "2026-12-31", usedAt: null, orderNo: "" }];
    v.studyLog = v.studyLog || {};
    if (!v.studyLog["vm-demo"]) { const s = {}; [[-1, 2], [-2, 1], [-3, 3], [-6, 1], [-9, 2], [-12, 1]].forEach((x) => { s[D(x[0])] = x[1]; }); v.studyLog["vm-demo"] = s; }
    const dm = v.members.find((m) => m.id === "vm-demo");
    if (dm && dm.points == null) { dm.points = 3000; dm.pointLog = [{ at: Date.parse(D(-25)), amt: 2000, why: "가입 축하 포인트" }, { at: Date.parse(D(-24)), amt: 1000, why: "첫 구매 적립" }]; }
    const O = (no, mid, pid, at, status, method) => { const p = v.products.find((x) => x.id === pid); if (!p || v.orders.some((o) => o.no === "DC" + no)) return; const amt = p.sale != null && p.sale !== "" ? Number(p.sale) : Number(p.price); v.orders.push({ id: "vo-" + no, no: "DC" + no, mid, pid, title: p.title, list: p.price, amount: amt, method: method || "card", status: status || "paid", at: Date.parse(at), paidAt: status === "pending" ? null : Date.parse(at) }); };
    O("261017008", "vm-demo", "v10", "2026-10-17T21:04:00"); O("261022009", "vm-demo", "v12", "2026-10-22T12:30:00", "paid", "kakao"); O("261023010", "vm-2", "v13", "2026-10-23T10:00:00"); O("261024011", "vm-3", "v12", "2026-10-24T18:20:00"); O("261025012", "vm-3", "v13", "2026-10-25T09:40:00", "pending", "bank");
    v.progress["vm-demo"] = v.progress["vm-demo"] || {};
    if (!v.progress["vm-demo"].v7) v.progress["vm-demo"].v7 = { done: { "v7-l1-1": true }, last: "v7-l1-2" };
  }
  function seed() {
    const P = (o) => Object.assign({ status: "on", share: null, accessDays: 365, level: "입문", faq: [], createdAt: now(), type: "vod" }, o, V2[o.id] || {}, V3[o.id] || {});
    const products = [
      P({ id: "v1", title: "해외 건기식 브랜드, 재고 없이 0원으로 런칭하는 법", sub: "뉴질랜드 현지 공급처 찾기부터 국내 판매 · 통관 · 광고까지", cat: "commerce", iid: "moon", creator: "문대표", price: 390000, sale: 290000, saleEnd: "2026-11-15", thumbText: "건기식 브랜드\n0원 런칭", base: 1240, level: "입문 · 초급", createdAt: Date.parse("2026-08-10"),
        who: ["회사 다니면서 내 브랜드를 갖고 싶은 분", "해외 소싱이 막막해서 시작을 못 한 분", "재고 부담 없이 시작하고 싶은 분"],
        learn: ["해외 공급처를 찾고 첫 연락을 보내는 법", "통관 · 인증 · 표시사항을 한 번에 정리하는 법", "상세페이지와 첫 광고로 첫 주문을 받는 법", "재구매가 일어나는 브랜드 운영 루틴"],
        intro: "두고보는 문대표가 뉴질랜드에서 건강식품 브랜드를 직접 키우며 겪은 시행착오를 강의로 정리했어요.\n\n이 클래스는 ‘무엇을 팔지’보다 ‘어떻게 시작할지’에 집중해요. 강의를 따라 하면 첫 공급처 연락, 첫 상세페이지, 첫 광고까지 한 달 안에 끝낼 수 있게 설계했어요.",
        curriculum: [CH("시작하기 전에", [L("이 클래스로 얻게 될 것", 6, { preview: true, video: "S43tftq_ZT4" }), L("건기식 시장, 지금 들어가도 될까?", 14)]), CH("공급처 찾기", [L("뉴질랜드 제조사 리스트 만드는 법", 18), L("첫 연락 메일 템플릿", 12), L("샘플 받고 비교하는 법", 16)]), CH("판매 준비", [L("통관 · 인증 · 표시사항 정리", 22), L("상세페이지 구조 그대로 따라 하기", 25)]), CH("첫 주문 받기", [L("광고 3만 원으로 반응 보기", 19), L("재구매를 만드는 후기 관리", 15)])],
        faq: [["완전 초보도 들을 수 있나요?", "네. 사업자 등록 전 단계부터 차근차근 설명해요."], ["강의는 언제까지 볼 수 있나요?", "결제할 때 고른 수강권 기간(180일 · 365일 · 3년) 동안 횟수 제한 없이 볼 수 있어요. 기간이 끝나면 1년 연장권으로 진도 그대로 이어서 들을 수 있어요."], ["클래스를 들으면 수입이 보장되나요?", "수입은 보장하지 않아요. 시작에 필요한 방법과 준비 과정을 다루며, 실제 결과는 실행과 시장 조건에 따라 달라져요."]] }),
      P({ id: "v2", title: "AI로 그림 그리고 굿즈로 파는 법", sub: "그림 실력 없이도 AI로 캐릭터를 만들고 스티커 · 키링으로 판매해요", cat: "ai", iid: "choi", creator: "초이", price: 199000, sale: 139000, saleEnd: "2026-11-05", thumbText: "AI 그림으로\n굿즈 만들기", base: 680, createdAt: Date.parse("2026-10-18"),
        who: ["그림은 못 그리지만 굿즈를 만들어 보고 싶은 분", "인스타 · 아이디어스에서 부업을 시작하고 싶은 분"], learn: ["AI 그림 도구로 일관된 캐릭터 만들기", "인쇄용 파일 만들기 (스티커 · 키링)", "제작 업체 고르고 발주하는 법", "SNS로 첫 판매 만들기"],
        intro: "긱스쿨에서 강의 중인 초이의 굿즈 클래스를 VOD로 만나 보세요. AI로 만든 캐릭터를 실제 상품으로 만들어 파는 전 과정을 보여 드려요.",
        curriculum: [CH("AI 그림 기초", [L("오리엔테이션", 5, { preview: true, video: "UBuXWFtgavE" }), L("프롬프트 기본기", 17), L("캐릭터를 일관되게 만드는 법", 21)]), CH("굿즈 만들기", [L("인쇄용 파일 만들기", 19), L("제작 업체 비교 · 발주", 14)]), CH("판매하기", [L("상세페이지와 사진", 16), L("인스타로 첫 판매", 18)])] }),
      P({ id: "v3", title: "귤 하나로 월매출 10억, 농산물 온라인 판매 실전", sub: "산지직송 브랜드를 만들고 스마트스토어 · 자사몰로 파는 법", cat: "commerce", iid: "farmer", creator: "갓농부", price: 249000, sale: 179000, saleEnd: "2026-11-30", thumbText: "귤 하나로\n월매출 10억", base: 2105, createdAt: Date.parse("2026-07-20"),
        who: ["농산물 · 식품을 온라인으로 팔고 싶은 분", "스마트스토어 매출이 정체된 분"], learn: ["산지와 직접 계약하는 법", "제철 상품 기획 캘린더", "리뷰가 쌓이는 포장 · 배송", "자사몰로 재구매 만들기"],
        intro: "귤 단 하나로 월매출 10억을 만든 갓농부의 판매 노하우를 그대로 담았어요.",
        curriculum: [CH("시작", [L("제가 귤을 팔게 된 이유", 9, { preview: true, video: "2HwP51YQtpI" }), L("농산물 온라인 시장 구조", 15)]), CH("상품 만들기", [L("산지 계약 · 단가 협상", 20), L("제철 캘린더 만들기", 13)]), CH("판매 · 운영", [L("스마트스토어 세팅", 24), L("포장 · 배송 · CS", 18), L("자사몰로 재구매 만들기", 22)])] }),
      P({ id: "v4", title: "스마트스토어 상세페이지, 전환율 2배 만드는 구조", sub: "잘 팔리는 상세페이지의 순서와 문장을 그대로 따라 해요", cat: "marketing", iid: "logic", creator: "부알남", price: 179000, sale: 129000, saleEnd: "2026-11-10", thumbText: "상세페이지\n전환율 2배", base: 930, createdAt: Date.parse("2026-09-05"),
        who: ["유입은 있는데 구매가 안 일어나는 분", "상세페이지를 처음 만드는 분"], learn: ["구매 이유를 만드는 첫 화면", "리뷰 · 증거를 배치하는 순서", "모바일에서 읽히는 문장 쓰기"],
        intro: "부알남이 수백 개의 상세페이지를 고치며 찾은 ‘팔리는 순서’를 알려 드려요.",
        curriculum: [CH("구조 이해", [L("팔리는 상세페이지의 7단계", 12, { preview: true }), L("첫 화면 3초 법칙", 14)]), CH("실전 작성", [L("문장 템플릿 20개", 26), L("사진 · 영상 배치", 18)]), CH("개선", [L("데이터로 고치는 법", 16)])] }),
      P({ id: "v5", title: "챗GPT로 블로그 수익화, 하루 1시간 루틴", sub: "주제 잡기부터 글쓰기 · 애드센스 · 체험단까지", cat: "ai", iid: "choi", creator: "초이", price: 89000, sale: 59000, saleEnd: "", thumbText: "챗GPT로\n블로그 수익화", base: 1510, createdAt: Date.parse("2026-09-28"),
        who: ["블로그를 시작했지만 꾸준히 못 쓰는 분"], learn: ["돈이 되는 주제 고르기", "챗GPT로 초안 쓰고 다듬기", "애드센스 · 체험단 연결"], intro: "하루 1시간으로 블로그를 꾸준히 운영하는 루틴을 알려 드려요.",
        curriculum: [CH("준비", [L("수익 구조 이해하기", 10, { preview: true }), L("주제 고르기", 14)]), CH("글쓰기", [L("챗GPT 초안 프롬프트", 18), L("사람 냄새 나게 다듬기", 15)])] }),
      P({ id: "v6", title: "뉴질랜드 직구 소싱 A to Z", sub: "직구 상품 고르기 · 가격 정하기 · 배송 루트까지", cat: "biz", iid: "moon", creator: "문대표", price: 149000, sale: 99000, saleEnd: "", thumbText: "직구 소싱\nA to Z", base: 540, createdAt: Date.parse("2026-10-01"),
        who: ["해외 직구 판매를 시작하고 싶은 분"], learn: ["팔리는 직구 상품 찾기", "마진 계산표 만들기", "배송 · 관세 정리"], intro: "현지에서 직접 소싱하는 문대표의 루트를 공개해요.",
        curriculum: [CH("소싱", [L("상품 고르는 기준", 13, { preview: true }), L("현지 매장 · 도매처", 17)]), CH("판매", [L("마진 계산표", 12), L("배송 · 관세", 16)])] }),
      P({ id: "v7", title: "1인 무역, 처음 시작하는 분을 위한 무료 특강", sub: "무역이 처음인 분을 위한 40분 무료 특강", cat: "biz", iid: "moon", creator: "문대표", price: 0, sale: null, saleEnd: "", thumbText: "1인 무역\n무료 특강", base: 3820, accessDays: null, createdAt: Date.parse("2026-10-20"),
        who: ["무역이 처음인 분", "부업을 찾고 있는 분"], learn: ["1인 무역의 구조", "시작 전에 꼭 알아야 할 것 3가지"], intro: "가볍게 들어 보세요. 무료로 평생 볼 수 있어요. 수강하면 ‘1인 무역 시작 체크리스트’ 전자책을 선물로 드려요.",
        curriculum: [CH("무료 특강", [L("1인 무역이란", 18, { preview: true, video: "https://vimeo.com/1222272497" }), L("시작 전 체크리스트", 22, { video: "https://vimeo.com/1217038359?share=copy&fl=sv&fe=ci" })])] }),
      P({ id: "v8", title: "산지직송 브랜드 만들기: 이름 · 로고 · 패키지", sub: "농산물에 브랜드를 입혀 가격을 올리는 법", cat: "marketing", iid: "farmer", creator: "갓농부", price: 99000, sale: null, saleEnd: "", thumbText: "산지직송\n브랜드 만들기", base: 410, createdAt: Date.parse("2026-10-12"),
        who: ["농산물을 브랜드로 팔고 싶은 분"], learn: ["브랜드 이름 짓기", "패키지 디자인 의뢰하는 법"], intro: "같은 귤도 브랜드가 있으면 더 비싸게 팔려요.",
        curriculum: [CH("브랜드", [L("이름 짓기", 11, { preview: true }), L("로고 · 패키지", 19)])] }),
      seedSoon()
    ].concat(seedNew());
    products.forEach(ids); products.forEach(addLessonNotes);
    const members = [
      { id: "vm-demo", email: "vod@gmail.com", pw: "vod", name: "김OO", phone: "010-0000-1234", createdAt: Date.parse("2026-10-02T10:00:00"), marketing: true },
      { id: "vm-2", email: "lee@example.com", pw: "test1234", name: "이OO", phone: "010-0000-2222", createdAt: Date.parse("2026-10-08T11:00:00") },
      { id: "vm-3", email: "park@example.com", pw: "test1234", name: "박OO", phone: "010-0000-3333", createdAt: Date.parse("2026-10-15T09:00:00") }
    ];
    const O = (no, mid, pid, at, status, method) => { const p = products.find((x) => x.id === pid); const amt = p.sale != null ? p.sale : p.price; return { id: "vo-" + no, no: "DC" + no, mid, pid, title: p.title, list: p.price, amount: amt, method: method || "card", status: status || "paid", at: Date.parse(at), paidAt: status === "pending" ? null : Date.parse(at) }; };
    const orders = [O("261003001", "vm-demo", "v1", "2026-10-03T10:12:00"), O("261009002", "vm-2", "v3", "2026-10-09T21:30:00"), O("261012003", "vm-3", "v1", "2026-10-12T13:05:00"), O("261018004", "vm-2", "v2", "2026-10-18T19:40:00"), O("261021005", "vm-demo", "v7", "2026-10-21T08:00:00", "paid", "free"), O("261024006", "vm-3", "v4", "2026-10-24T15:22:00"), O("261026007", "vm-2", "v5", "2026-10-26T22:10:00", "pending", "bank")];
    const reviews = [
      { id: "vr1", pid: "v1", mid: "vm-2", name: "이OO", rating: 5, text: "공급처 연락 메일 템플릿 하나로 본전 뽑았어요. 실제로 답장 받았습니다!", at: Date.parse("2026-10-14T20:00:00") },
      { id: "vr2", pid: "v1", mid: "vm-3", name: "박OO", rating: 5, text: "통관 · 표시사항 정리 파트가 제일 좋았어요. 막막했던 부분이 한 번에 정리됐어요.", at: Date.parse("2026-10-20T09:30:00") },
      { id: "vr3", pid: "v3", mid: "vm-2", name: "이OO", rating: 5, text: "제철 캘린더 그대로 따라 하는 중이에요. 포장 팁도 바로 써먹었어요.", at: Date.parse("2026-10-16T18:00:00") },
      { id: "vr4", pid: "v2", mid: "vm-2", name: "이OO", rating: 4, text: "AI로 캐릭터 일관되게 만드는 법이 신기했어요. 발주 파트가 조금 더 길었으면!", at: Date.parse("2026-10-22T12:00:00") },
      { id: "vr5", pid: "v4", mid: "vm-3", name: "박OO", rating: 5, text: "첫 화면만 바꿨는데 구매가 늘었어요.", at: Date.parse("2026-10-26T10:00:00") }
    ];
    const v = { ver: 4, products, orders, members, reviews, banners: seedBanners(), pledges: seedPledges(), topics: TOPICS.slice(), topicVotes: { "해외 건기식 브랜드": 18, "쿠팡 로켓그로스": 14, "AI 그림 굿즈": 11, "틱톡샵 판매": 9, "산지직송 농산물": 8 },
      cats: CATS.map((c) => Object.assign({ on: true }, c)), likes: { "vm-demo": ["v3", "v9"] }, progress: { "vm-demo": { v1: { done: { "v1-l1-1": true, "v1-l1-2": true, "v1-l2-1": true }, last: "v1-l2-2" } } }, payouts: [], settings: { share: 70, bank: "", account: "", holder: "", payDays: 3, reviewPoint: 500 } };
    seedDemo(v);
    return v;
  }
  function ids(p) { (p.curriculum || []).forEach((c, ci) => { c.id = c.id || p.id + "-c" + (ci + 1); (c.lessons || []).forEach((l, li) => { l.id = l.id || p.id + "-l" + (ci + 1) + "-" + (li + 1); }); }); return p; }
  function addLessonNotes(p) { (p.curriculum || []).forEach((c) => (c.lessons || []).forEach((l) => { const x = V3L[l.id]; if (!x) return; Object.keys(x).forEach((k) => { if (!l[k] || (Array.isArray(l[k]) && !l[k].length)) l[k] = Array.isArray(x[k]) ? x[k].map((f) => Object.assign({}, f)) : x[k]; }); if (!Array.isArray(l.files)) l.files = []; })); return p; }
  function seedSoon() {
    return ids({ id: "v9", status: "soon", type: "vod", openAt: "2026-11-20", title: "틱톡샵으로 해외 판매 시작하기", sub: "계정 만들기부터 첫 주문 · 배송까지", cat: "commerce", iid: "choi", creator: "초이", price: 199000, sale: 149000, saleEnd: "2026-11-30", accessDays: 365, level: "입문", thumbText: "틱톡샵으로\n해외 판매", base: 0, likeBase: 27, createdAt: Date.parse("2026-10-25"),
      color: ["#1c1c1e", "#ff2d87"], hook: "11월 20일 오픈", tagline: "긱스쿨 AI 굿즈 강사", headline: "틱톡샵, 지금 시작하면\n먼저 자리 잡아요.", badges: ["NEW"], share: null, faq: [],
      who: ["해외 판매를 처음 시작하는 분"], learn: ["틱톡샵 계정 세팅", "첫 상품 올리기", "숏폼으로 첫 주문 받기"], intro: "오픈 알림을 받아 두면 할인가로 가장 먼저 들을 수 있어요.",
      curriculum: [CH("준비", [L("틱톡샵 구조", 10, { preview: true }), L("계정 세팅", 14)]), CH("판매", [L("상품 등록", 16), L("숏폼으로 판매하기", 20)])] });
  }
  function seedBanners() {
    return [
      { id: "vb1", eyebrow: "DOOGO CLASS", title: "돈 되는 노하우,\n먼저 들어 보고 시작해요", sub: "무료 특강부터 VOD · 전자책 · LIVE까지 한곳에서", href: "#/vod/c/all", color: ["#fc1c49", "#fc1c49"], sticker: "따라 하면\n바로 쓰는\n실전 클래스", on: true },
      { id: "vb2", eyebrow: "BEST · 문대표", title: "재고 없이 0원으로\n해외 건기식 브랜드 런칭", sub: "지금 26% 할인 · 12개월 시청", pid: "v1", color: ["#232326", "#3a0f18"], on: true },
      { id: "vb6", eyebrow: "오프라인 · 20명 한정", title: "1인 무역 워크숍,\n현장에서 같이 시작해요", sub: "11월 22일(일) 서울 강남 · 얼리버드 20% 할인", pid: "v13", color: ["#0f2a4a", "#1c4f86"], on: true },
      { id: "vb3", eyebrow: "TEACHER", title: "내 노하우를\nVOD 클래스로 팔아 보세요", sub: "강사 모집 중 · 촬영 · 편집 · 판매까지 함께해요", href: "#/vod/recruit", color: ["#c9f7b0", "#c9f7b0"], dark: true, sticker: "강사\n모집 중", on: true },
      { id: "vb4", eyebrow: "NEW · 초이", title: "그림 실력 없어도\nAI로 굿즈 만들기", sub: "캐릭터부터 첫 판매까지", pid: "v2", color: ["#ff5c8a", "#ff8fa8"], on: true },
      { id: "vb5", eyebrow: "무료 특강", title: "1인 무역,\n처음이라면 여기서", sub: "40분이면 구조가 보여요 · 평생 무료", pid: "v7", color: ["#7a7a80", "#5f5f66"], on: true }
    ];
  }
  function seedPledges() {
    const P = (id, pid, nick, text, at, up) => ({ id, pid, mid: "", nick, text, at: Date.parse(at), up: up || 0 });
    return [P("vp1", "v1", "부지런한 토리", "처음인데 저도 할 수 있을까요? 일단 첫 메일부터 보내 볼게요.", "2026-10-21T21:00:00", 3), P("vp2", "v1", "궁금한 호두", "퇴근하고 하루 30분씩, 한 달 안에 첫 공급처 연락까지 해 볼게요.", "2026-10-23T22:10:00", 5),
      P("vp3", "v3", "웃는 만두", "제철 캘린더 만들어서 다음 달에 첫 판매 도전!", "2026-10-22T08:30:00", 2), P("vp4", "v2", "설레는 밤", "AI 캐릭터로 스티커 10종 만들어서 올려 볼게요.", "2026-10-24T23:00:00", 4), P("vp5", "v7", "느긋한 귤", "무역이 뭔지 감 잡는 게 목표예요.", "2026-10-25T12:00:00", 1)];
  }
  // 예전 시안 데이터가 있으면 주문 · 회원은 그대로 두고 새 필드 · 새 상품만 채운다 (v1 → v2 → v3)
  function migrate(v) {
    if (v.ver !== 2 && v.ver !== 3) {
      v.products.forEach((p) => { const x = V2[p.id]; if (x) Object.keys(x).forEach((k) => { if (k === "color" || k === "badges" || p[k] == null || p[k] === "") p[k] = Array.isArray(x[k]) ? x[k].slice() : x[k]; }); });
      if (!v.products.some((p) => p.id === "v9")) v.products.push(seedSoon());
      if (!Array.isArray(v.pledges)) v.pledges = seedPledges();
      if (!Array.isArray(v.topics)) v.topics = TOPICS.slice();
      if (!v.topicVotes) v.topicVotes = {};
      if (!Array.isArray(v.payouts)) v.payouts = [];
    }
    v.products.forEach((p) => { p.type = p.type || "vod"; const x = V3[p.id]; if (x) Object.keys(x).forEach((k) => { if (p[k] == null || k === "badges") p[k] = Array.isArray(x[k]) ? x[k].map((y) => (typeof y === "object" ? Object.assign({}, y) : y)) : x[k]; }); addLessonNotes(p); });
    seedNew().forEach((p) => { if (!v.products.some((x) => x.id === p.id)) v.products.push(addLessonNotes(p)); });
    if (!v.likes["vm-demo"]) v.likes["vm-demo"] = [];
    v.settings.reviewPoint = v.settings.reviewPoint == null ? 500 : v.settings.reviewPoint;
    v.banners = seedBanners();
    seedDemo(v);
    v.ver = 4;
  }
  /* v8: 수강권 · 부가 상품 기본값 + 체험 데이터 (한 번만) */
  function seedV8(v) {
    const s = v.settings, P = (id) => v.products.find((x) => x.id === id), T = (at) => Date.parse(at), D = (n) => DB.date.addDays(today(), n);
    if (s.extendPct == null) s.extendPct = 50;
    if (s.addonShare == null) s.addonShare = 80;
    s.coach = s.coach || { n: 5, days: 180, price: 150000 };
    s.tea = s.tea || { min: 60, price: 99000, mode: "online" };
    const OLD = "구매일로부터 12개월 동안 횟수 제한 없이 볼 수 있어요.", NEW = "결제할 때 고른 수강권 기간(180일 · 365일 · 3년) 동안 횟수 제한 없이 볼 수 있어요. 기간이 끝나면 1년 연장권으로 진도 그대로 이어서 들을 수 있어요.";
    v.products.forEach((p) => (p.faq || []).forEach((f) => { if (Array.isArray(f) && f[1] === OLD) f[1] = NEW; else if (f && f.a === OLD) f.a = NEW; }));
    const has = (no) => v.orders.some((o) => o.no === no), push = (o) => { if (!has(o.no)) v.orders.push(o); };
    const o1 = v.orders.find((o) => o.no === "DC261003001"); if (o1 && !o1.days) { o1.kind = "course"; o1.days = 365; }
    // 체험 계정: 문대표 VOD에 1:1 코칭권 5회 (1회 사용)
    if (P("v1")) push({ id: "vo-261003101", no: "DC261003101", grp: "DC261003001", kind: "coach", mid: "vm-demo", pid: "v1", title: P("v1").title, coach: { n: 5, days: 180, price: 150000, used: 1, qs: [] }, list: 150000, sale: 150000, amount: 150000, method: "card", share: 80, status: "paid", at: T("2026-10-03T10:12:00"), paidAt: T("2026-10-03T10:12:00") });
    // 체험 계정: 180일 수강권이 끝난 강의 1개 → 1년 연장권 체험
    if (P("v6") && !has("DC260320013")) {
      push({ id: "vo-260320013", no: "DC260320013", kind: "course", days: 180, mid: "vm-demo", pid: "v6", title: P("v6").title, list: Number(P("v6").price) || 0, sale: Number(P("v6").sale) || Number(P("v6").price) || 0, amount: Number(P("v6").sale) || Number(P("v6").price) || 0, method: "card", share: 70, status: "paid", at: T("2026-03-20T20:10:00"), paidAt: T("2026-03-20T20:10:00") });
      const lz = lessons(P("v6")), done = {}; lz.slice(0, Math.max(1, Math.floor(lz.length / 2))).forEach((l) => { done[l.id] = true; });
      v.progress["vm-demo"] = v.progress["vm-demo"] || {}; v.progress["vm-demo"].v6 = { done, last: (lz[Math.floor(lz.length / 2)] || lz[0] || {}).id || "" };
    }
    // TEA TIME: 체험 계정은 일정 확정 · 박OO 님은 확정 대기 (문대표 강사센터 ‘TEA TIME 신청’에 보여요)
    if (P("v1")) {
      push({ id: "vo-261020102", no: "DC261020102", kind: "tea", mid: "vm-demo", pid: "v1", title: P("v1").title, tea: { min: 60, d1: D(4), d2: D(6), slot: "오후 (14~17시)", mode: "online", topic: "스마트스토어에 해외 소싱 상품을 추가해도 될지, 첫 발주 수량을 상담받고 싶어요.", st: "ok", when: D(5) + "T15:00", where: "Zoom (링크는 하루 전 문자로)" }, list: 99000, sale: 99000, amount: 99000, method: "kakao", share: 80, status: "paid", at: T("2026-10-20T13:00:00"), paidAt: T("2026-10-20T13:00:00") });
      push({ id: "vo-261026103", no: "DC261026103", kind: "tea", mid: "vm-3", pid: "v1", title: P("v1").title, tea: { min: 60, d1: D(3), d2: D(8), slot: "저녁 (19~21시)", mode: "online", topic: "첫 수입 통관에서 막혀서, 서류를 직접 보여 드리고 상담받고 싶어요.", st: "req" }, list: 99000, sale: 99000, amount: 99000, method: "card", share: 80, status: "paid", at: T("2026-10-26T21:40:00"), paidAt: T("2026-10-26T21:40:00") });
      // 박OO 님: 코칭권 5회 + 답변을 기다리는 코칭 질문 1개 (두잉고 VOD 수강생 기록에 남겨요)
      if (!has("DC261013104")) {
        const qid = "q-coach-demo";
        push({ id: "vo-261013104", no: "DC261013104", kind: "coach", mid: "vm-3", pid: "v1", title: P("v1").title, coach: { n: 5, days: 180, price: 150000, used: 1, qs: [qid] }, list: 150000, sale: 150000, amount: 150000, method: "card", share: 80, status: "paid", at: T("2026-10-13T09:00:00"), paidAt: T("2026-10-13T09:00:00") });
        try {
          const m3 = v.members.find((x) => x.id === "vm-3"), st = m3 && DB.data && Array.isArray(DB.data.students) ? dgStudent(m3, "moon") : null;
          if (st) { const pg = DB.progress(st.id); if (!pg.questions.some((q) => q.id === qid)) { pg.questions.push({ id: qid, coach: true, category: "강의 내용 질문", title: "공급처에 첫 샘플을 요청할 때 단가도 같이 물어봐도 될까요?", body: "3강에서 알려 주신 메일 템플릿으로 공급처 두 곳에 연락하려고 해요. 샘플 요청 메일에 대량 구매 단가까지 같이 물어보면 실례일까요? 아니면 샘플을 받고 나서 따로 물어보는 게 좋을까요?", images: [], at: T("2026-10-27T22:15:00"), answer: "", answeredAt: 0 }); DB.saveProgress(st.id, pg); } }
        } catch (e) { /* 두잉고 데이터가 아직 없으면 건너뛰어요 */ }
      }
    }
  }
  const WHO_ADD = {
    v1: ["[초급자] 월 100~300만 원 부업 매출을 만들고 싶은 분", "[중급자] 스마트스토어를 건기식 브랜드로 키우고 싶은 분"],
    v2: ["[입문] 그림 실력 없이 내 캐릭터를 만들고 싶은 분", "작은 금액으로 굿즈 판매를 테스트해 보고 싶은 분"],
    v3: ["[중급자] 월 300~2,000만 원 이상 매출을 노리는 분", "제철 상품으로 재구매 손님을 만들고 싶은 분"],
    v4: ["[초급자] 상세페이지를 처음 직접 만드는 분", "광고비를 써도 전환이 안 나와서 답답한 분"],
    v5: ["[하루 1시간] 퇴근 후 짧게 부업을 시작하고 싶은 분", "[초급자] 애드센스 · 체험단으로 첫 수익을 내 보고 싶은 분", "글쓰기가 막막해서 챗GPT 활용법이 궁금한 분"],
    v6: ["[입문] 해외 직구 판매가 처음인 분", "마진이 남는 상품을 숫자로 고르고 싶은 분"],
    v8: ["[입문] 내 농산물에 이름과 로고를 붙이고 싶은 분", "포장 하나로 단가를 올리고 싶은 분"]
  };
  const MAT = {
    "v1-l1-1": [["[1주차] 건기식 브랜드 수익 구조와 전체 로드맵.pdf", "v1-roadmap.pdf", 318], ["4주 실행 계획표.pdf", "v1-plan.pdf", 184]],
    "v1-l2-2": [["공급처 첫 연락 메일 템플릿.pdf", "v1-mail.pdf", 238]],
    "v1-l3-1": [["통관 · 표시사항 정리표.pdf", "v1-customs.pdf", 240]],
    "v2-l1-3": [["AI 캐릭터 일관성 프롬프트 시트.pdf", "v2-prompt.pdf", 249]],
    "v3-l2-2": [["제철 판매 캘린더 (12개월).pdf", "v3-calendar.pdf", 190]],
    "v4-l1-1": [["팔리는 상세페이지 7단계 체크리스트.pdf", "v4-checklist.pdf", 217]],
    "v5-l1-2": [["블로그 주제 고르기 워크시트.pdf", "v5-topic.pdf", 208]],
    "v5-l2-1": [["챗GPT 초안 프롬프트 10선.pdf", "v5-prompts.pdf", 213]],
    "v6-l2-1": [["직구 마진 계산표.pdf", "v6-margin.pdf", 198]],
    "v7-l1-2": [["1인 무역 시작 전 체크리스트.pdf", "v7-check.pdf", 163]],
    "v8-l1-1": [["브랜드 네이밍 워크시트.pdf", "v8-naming.pdf", 172]]
  };
  function seedMat(v) { v.products.forEach((p) => (p.curriculum || []).forEach((c) => (c.lessons || []).forEach((l) => { const add = MAT[l.id]; if (!add) return; l.files = (l.files || []).filter((f) => f.url); add.forEach((x) => { const url = "assets/files/" + x[1]; if (!l.files.some((f) => f.url === url)) l.files.push({ name: x[0], url, size: x[2] }); }); }))); }
  function seedV9(v) { seedMat(v); v.products.forEach((p) => { const add = WHO_ADD[p.id]; if (!add) return; p.who = Array.isArray(p.who) ? p.who : []; if (p.who.length >= 4) return; add.forEach((x) => { if (p.who.indexOf(x) < 0) p.who.push(x); }); }); }
  /* v10: 이미지 배너 견본 한 장 (PC · 모바일 이미지를 따로) — 마스터 › VOD 전시 · 쿠폰 · 설정 › 첫 화면 배너에서 끄거나 바꿔요 */
  const TILES = [["all", "전체", "#/vod/c/all"], ["vod", "VOD 강의", "#/vod/c/all?tab=vod"], ["biz", "부업·창업", "#/vod/c/biz"], ["commerce", "쇼핑몰·커머스", "#/vod/c/commerce"], ["marketing", "마케팅·브랜딩", "#/vod/c/marketing"], ["ai", "AI·콘텐츠", "#/vod/c/ai"],
    ["money", "재테크", "#/vod/c/money"], ["career", "커리어·자기계발", "#/vod/c/career"], ["ebook", "전자책", "#/vod/c/all?tab=ebook"], ["live", "LIVE·오프라인", "#/vod/c/all?tab=premium"], ["free", "무료 강의", "#/vod/c/all?tab=free"], ["soon", "오픈 예정", "#/vod/c/soon", "NEW"]];
  const tileImg = (k) => "assets/vod/cat/" + k + ".webp";
  const seedTiles = () => TILES.map((t) => ({ id: "vt-" + t[0], key: t[0], label: t[1], href: t[2], img: tileImg(t[0]), badge: t[3] || "", on: true }));
  function seedV10(v) { if (!Array.isArray(v.tiles)) v.tiles = seedTiles(); if (!Array.isArray(v.banners) || v.banners.some((b) => b.id === "vb-img1")) return; v.banners.splice(Math.min(1, v.banners.length), 0, { id: "vb-img1", kind: "img", pc: "assets/vod/banner-class-pc.jpg", m: "assets/vod/banner-class-m.jpg", alt: "두잉고 VOD 강의실 — 영상 보면서 적고, 자료는 바로 받기", href: "#/vod/about", pid: "", newTab: false, fit: "cover", bg: "#141418", from: "", to: "", on: true }); }
  /* v11: 전자책 · 수강 선물 PDF (비어 있던 파일만 채워요 — 마스터가 올린 파일은 그대로) */
  function seedV11(v) {
    const F = { v10: "assets/files/v10-ebook.pdf", v11: "assets/files/v11-ebook.pdf" };
    v.products.forEach((p) => { if (F[p.id] && !p.file) p.file = F[p.id]; if (p.id === "v7") (p.gifts || []).forEach((g, i) => { if (!g.file && i === 0) g.file = "assets/files/v7-gift.pdf"; }); });
  }

  /* v12: 가입 쿠폰 5,000원(30일) · 상세페이지에서 받는 쿠폰 · 두잉고 무료 LIVE를 스토어 상품으로 · 강의 소개 글(고민 → 해결) */
  const PITCH = {
    v1: { pains: ["해외 건기식, 팔고는 싶은데 공급처는 어디서 찾지?", "통관 · 인증 서류만 보면 머리가 하얘진다.", "재고를 쌓아 두고 시작했다가 망하면 어떡하지?"],
      pitch: "그런 분들을 위해 뉴질랜드 현지에서 건기식 브랜드를 직접 운영하는 문대표가, 재고 없이 0원으로 첫 브랜드를 런칭하는 전 과정을 공개합니다! 현지 제조사 리스트 만들기 · 첫 연락 메일 · 샘플 요청부터 수입식품 영업등록 · 통관 · 표시사항, 상세페이지와 광고 3만 원 테스트까지. 감으로 하는 소싱이 아니라, 숫자로 마진을 계산하고 서류는 체크리스트로 끝내는 실전 순서를 그대로 따라 하게 됩니다. 여기에 공급처 연락 메일 템플릿 · 통관 서류 체크리스트 · 마진 계산표까지 BONUS 자료로 싹 다 드려요! 이제 혼자 검색하며 헤매지 말고, 첫 공급처 연락부터 첫 주문까지 한 번에 끝내 보세요 :)",
      tags: ["해외소싱", "건기식브랜드", "재고없이", "통관", "스마트스토어"] },
    v2: { pains: ["그림을 못 그리는데 굿즈를 만들 수 있을까?", "AI로 그리면 캐릭터가 매번 달라져서 못 쓰겠다.", "만들어도 어디서 어떻게 팔아야 할지 모르겠다."],
      pitch: "그런 분들을 위해 AI 굿즈로 판매를 이어 가고 있는 초이가, 그림 실력 없이 AI로 나만의 캐릭터를 만들고 스티커 · 키링으로 실제 판매까지 가는 과정을 공개합니다! 캐릭터를 매번 똑같이 뽑는 프롬프트, 인쇄 업체에 바로 보내는 파일 만들기, 소량 제작 단가 비교, 스마트스토어 · 아이디어스 · 플리마켓 판매까지. 예쁜 그림을 만드는 수업이 아니라 팔리는 굿즈를 만드는 수업이에요. 캐릭터 프롬프트 모음 · 인쇄용 템플릿까지 BONUS로 드려요! 작게 만들어 보고 반응을 확인하는 가장 빠른 방법, 지금 시작해 보세요 :)",
      tags: ["AI굿즈", "캐릭터", "스티커", "부업"] },
    v3: { pains: ["농산물은 어디서 사 와야 남는 장사가 될까?", "제철이 지나면 매출이 뚝 떨어진다.", "배송 클레임 하나에 하루 매출이 날아간다."],
      pitch: "그런 분들을 위해 귤 하나로 시작해 월매출 10억을 만든 갓농부가, 산지 계약부터 스마트스토어 · 자사몰 판매까지 실제로 쓰는 방법을 전부 공개합니다! 좋은 산지를 고르는 기준과 계약 방법, 1년 매출을 이어 가는 제철 캘린더, 가격 정하기와 마진 계산, 포장 · 배송 클레임을 줄이는 체크리스트까지. 감으로 파는 농산물이 아니라 숫자와 계절로 파는 시스템을 직접 만들게 됩니다. 산지 계약서 양식 · 제철 캘린더 · 클레임 응대 문장까지 BONUS로 싹 다 드려요! 한 철 장사가 아니라 1년 내내 팔리는 산지직송 브랜드를 만들어 보세요 :)",
      tags: ["산지직송", "농산물판매", "스마트스토어", "자사몰"] },
    v4: { pains: ["광고비는 쓰는데 상세페이지에서 다 나가 버린다.", "뭘 고쳐야 전환율이 오르는지 모르겠다.", "디자인을 맡겨도 팔리는 페이지는 안 나온다."],
      pitch: "그런 분들을 위해 상세페이지를 직접 고쳐 전환율을 올려 온 부알남이, 잘 팔리는 상세페이지의 7단계 순서와 문장을 그대로 공개합니다! 첫 화면 3초 안에 사는 이유를 보여 주는 법, 고민 → 해결 → 증거 → 혜택으로 이어지는 구성, 후기 · 비교표 배치, 휴대폰에서 읽히는 문장 길이까지. 예쁜 페이지가 아니라 팔리는 페이지를 만드는 기준을 실제로 고친 전후 사례로 보여 드려요. 상세페이지 구성안 템플릿 · 첫 화면 문장 공식까지 BONUS로 드려요! 이제 감으로 고치지 말고, 순서대로 고쳐서 전환율을 확인해 보세요 :)",
      tags: ["상세페이지", "전환율", "스마트스토어", "카피라이팅"] },
    v5: { pains: ["블로그를 해야 한다는데 무슨 글을 써야 할지 모르겠다.", "챗GPT로 쓰면 티가 나서 오히려 노출이 안 된다.", "꾸준히 썼는데 돈이 되는 건 하나도 없다."],
      pitch: "그런 분들을 위해 챗GPT로 하루 1시간 블로그 루틴을 운영하는 초이가, 주제 고르기부터 수익화까지 매일 쓰는 방법을 그대로 공개합니다! 돈이 되는 주제를 고르는 기준, 챗GPT로 초안을 뽑고 사람 냄새 나게 다듬는 법, 검색에 걸리는 제목과 구성, 애드센스 · 체험단 · 제휴 링크 연결까지. 글을 많이 쓰는 수업이 아니라 1시간 안에 한 편을 끝내는 루틴을 만드는 수업이에요. 프롬프트 모음 · 주제 캘린더까지 BONUS로 드려요! 오늘부터 하루 1시간, 쌓이는 블로그를 만들어 보세요 :)",
      tags: ["챗GPT", "블로그수익화", "애드센스", "부업"] },
    v6: { pains: ["직구 판매, 어떤 상품을 골라야 할까?", "가격을 얼마로 정해야 남는지 계산이 안 된다.", "배송이 오래 걸려서 클레임이 걱정된다."],
      pitch: "그런 분들을 위해 뉴질랜드 현지에서 직접 상품을 고르는 문대표가, 직구 소싱의 A부터 Z까지 숫자로 보여 드립니다! 잘 팔리는 현지 상품 고르는 기준, 환율 · 배송비 · 수수료까지 넣은 가격 계산, 배송 루트별 장단점과 클레임을 줄이는 안내 문구까지. 감으로 고르는 직구가 아니라 남는 상품만 고르는 방법을 배우게 됩니다. 마진 계산표 · 배송 안내 문구 템플릿까지 BONUS로 드려요! 첫 직구 상품, 이 강의로 정해 보세요 :)",
      tags: ["직구", "해외소싱", "마진계산"] },
    v7: { pains: ["무역은 큰 회사만 하는 거 아닌가?", "영어도 못하는데 해외 공급처랑 연락할 수 있을까?", "시작하려면 돈이 얼마나 필요한지 모르겠다."],
      pitch: "그런 분들을 위해 혼자서 해외 브랜드를 들여와 팔고 있는 문대표가, 1인 무역의 전체 흐름을 40분 안에 정리해 드립니다! 상품 찾기 → 공급처 연락 → 통관 → 판매까지 한 장의 지도로 보고, 처음 시작할 때 꼭 피해야 할 실수 3가지도 알려 드려요. 무료지만 끝까지 들으면 내가 무엇부터 해야 하는지 분명해집니다 :)",
      tags: ["1인무역", "무료특강", "해외소싱"] },
    v8: { pains: ["농산물은 결국 가격 싸움 아닌가?", "브랜드를 만들려면 돈이 많이 들 것 같다.", "이름 · 로고 · 포장, 무엇부터 해야 할지 모르겠다."],
      pitch: "그런 분들을 위해 산지직송 브랜드로 가격을 올려 온 갓농부가, 큰돈 들이지 않고 이름 · 로고 · 패키지를 만드는 방법을 공개합니다! 기억에 남는 브랜드 이름 짓기, 무료 툴로 로고 만들기, 상자 하나로 달라지는 언박싱, 생산자 이야기를 상세페이지에 녹이는 법까지. 같은 귤도 ‘누가 보내는지’가 보이면 더 비싸게 팔려요. 네이밍 워크시트 · 패키지 업체 리스트까지 BONUS로 드려요 :)",
      tags: ["브랜딩", "산지직송", "패키지"] },
    "fl-logic": { pains: ["상세페이지 첫 화면에 뭘 넣어야 할지 모르겠다.", "광고는 나가는데 구매 버튼까지 안 내려온다."],
      pitch: "부알남이 Zoom으로 상세페이지 첫 화면을 같이 보며, 3초 안에 사는 이유를 보여 주는 공식을 알려 드립니다. 끝까지 남아 질문하면 내 상세페이지 첫 화면도 바로 봐 드려요. 신청자 전용 선물 자료와 사전 질문은 무료강의 안내 페이지에서 받을 수 있어요 :)",
      tags: ["무료LIVE", "상세페이지"] },
    "fl-choi": { pains: ["AI로 그린 캐릭터, 굿즈로 팔 수 있을까?", "매번 다른 그림이 나와서 캐릭터가 안 잡힌다."],
      pitch: "초이가 Zoom으로 AI 캐릭터를 처음부터 같이 만들며, 굿즈로 만들기 좋은 그림을 고르는 기준까지 알려 드립니다. 끝나고 나면 내 캐릭터 1개가 손에 남아요. 신청자 전용 선물 자료는 무료강의 안내 페이지에서 받을 수 있어요 :)",
      tags: ["무료LIVE", "AI굿즈"] },
    "fl-farmer": { pains: ["농산물 온라인 판매, 첫 박스는 어떻게 팔지?", "산지에서 바로 보내도 괜찮을까?"],
      pitch: "갓농부가 Zoom으로 귤 한 박스를 온라인에서 처음 팔기까지의 순서를 실시간으로 알려 드립니다. 산지 고르기, 첫 판매 채널, 배송 클레임 줄이는 법까지 질문도 바로 받아요. 신청자 전용 선물 자료는 무료강의 안내 페이지에서 받을 수 있어요 :)",
      tags: ["무료LIVE", "농산물판매"] }
  };
  const FREE_LIVE = [
    { id: "fl-logic", iid: "logic", creator: "부알남", title: "부알남 무료 LIVE: 상세페이지 첫 화면 3초 공식", sub: "Zoom으로 같이 보며 첫 화면부터 고쳐요 · 누구나 무료", thumbText: "상세페이지\n첫 화면 3초", tagline: "상세페이지 전환율 코치", acc: "#ff9f1a", cat: "marketing",
      learn: ["첫 화면 3초 안에 사는 이유 보여 주기", "구매 버튼까지 내려오게 만드는 순서", "내 상세페이지 바로 점검"], who: ["상세페이지를 처음 만드는 분", "광고는 나가는데 구매가 안 되는 분"] },
    { id: "fl-farmer", iid: "farmer", creator: "갓농부", title: "갓농부 무료 LIVE: 귤 한 박스로 시작하는 농산물 판매", sub: "산지 고르기부터 첫 판매 채널까지 · 누구나 무료", thumbText: "농산물 판매\n첫 박스 팔기", tagline: "산지직송 브랜드 대표", acc: "#3fb6ff", cat: "commerce",
      learn: ["좋은 산지 고르는 기준", "첫 판매 채널 정하기", "배송 클레임 줄이는 법"], who: ["농산물 온라인 판매가 처음인 분", "산지직송 브랜드를 꿈꾸는 분"] },
    { id: "fl-choi", iid: "choi", creator: "초이", title: "초이 무료 LIVE: AI로 첫 굿즈 캐릭터 만들기", sub: "그림 실력 없이 캐릭터 1개 완성까지 · 누구나 무료", thumbText: "AI 캐릭터\n첫 굿즈 만들기", tagline: "AI 콘텐츠 크리에이터", acc: "#ff2d87", cat: "ai",
      learn: ["AI로 캐릭터 일관되게 뽑기", "굿즈로 만들기 좋은 그림 고르기", "첫 판매 채널 고르기"], who: ["AI 굿즈가 궁금한 분", "그림은 못 그리지만 캐릭터를 만들고 싶은 분"] }
  ];
  function seedV12(v) {
    const w = (v.coupons = v.coupons || []).find((c) => c.id === "cp-welcome");
    if (w) Object.assign(w, { name: "신규 가입 5,000원 할인", kind: "won", value: 5000, max: 0, min: 0, days: 30, endAt: "", types: [], auto: "signup" });
    if (!v.coupons.some((c) => c.id === "cp-dl-vod")) v.coupons.push({ id: "cp-dl-vod", code: "", name: "VOD 클래스 1만 원 할인", kind: "won", value: 10000, max: 0, min: 100000, days: 14, endAt: "", types: ["vod"], auto: "", dl: true, on: true });
    if (!v.coupons.some((c) => c.id === "cp-dl-first")) v.coupons.push({ id: "cp-dl-first", code: "", name: "두고클래스 첫 구매 3,000원 할인", kind: "won", value: 3000, max: 0, min: 30000, days: 30, endAt: "", types: [], auto: "", dl: true, on: true });
    FREE_LIVE.forEach((x, i) => {
      if (v.products.some((p) => p.id === x.id)) return;
      v.products.push({ id: x.id, type: "live", status: "on", title: x.title, sub: x.sub, cat: x.cat, iid: x.iid, creator: x.creator, price: 0, sale: null, saleEnd: "", eventAt: "", eventMin: 90, seats: "", link: "", replayDays: "", base: 0, createdAt: now(), share: null, accessDays: null, level: "입문", faq: [], fromFree: x.iid,
        color: ["#1c1c1e", x.acc], hook: "LIVE 무료 특강", tagline: x.tagline, thumbText: x.thumbText, headline: x.sub, likeBase: 12 + i * 5, badges: ["NEW"], learn: x.learn, who: x.who,
        intro: x.creator + " 강사님과 Zoom에서 실시간으로 만나는 무료 LIVE예요. 신청하면 마이페이지 › LIVE · 오프라인에서 입장 안내를 볼 수 있어요.",
        curriculum: [{ id: x.id + "-c1", title: "LIVE 진행 순서", lessons: [{ id: x.id + "-l1", title: "오프닝 · 오늘 배울 것", min: 10 }, { id: x.id + "-l2", title: "핵심 강의", min: 50 }, { id: x.id + "-l3", title: "실시간 Q&A", min: 30 }] }] });
    });
    v.products.forEach((p) => { const x = PITCH[p.id]; if (!x) return; if (!(p.pains || []).length) p.pains = x.pains.slice(); if (!p.pitch) p.pitch = x.pitch; if (!(p.tags || []).length) p.tags = x.tags.slice(); });
  }
  function seedV13(v) {
    const p = v.products.find((x) => x.id === "v7"); if (!p) return;
    const lz = []; (p.curriculum || []).forEach((c) => (c.lessons || []).forEach((l) => lz.push(l)));
    const set = (l, url) => { if (l && (!l.video || l.video === "S43tftq_ZT4" || /youtu/.test(l.video))) l.video = url; };
    set(lz[0], "https://vimeo.com/1222272497"); set(lz[1], "https://vimeo.com/1217038359?share=copy&fl=sv&fe=ci");
  }
  /* v14: LIVE · 오프라인 = 카카오톡 오픈채팅방으로 모으고, 강의 날 오픈채팅방에 유튜브 라이브 링크를 올려 진행 (Zoom 은 고를 때만) */
  function seedV14(v) {
    v.products.forEach((p) => {
      if (p.type !== "live" && p.type !== "offline") return;
      if (p.type === "live" && !p.via) p.via = "youtube";
      if (p.kakao == null) p.kakao = "https://open.kakao.com/";
      if (p.type === "live" && p.ytLive == null) p.ytLive = "https://www.youtube.com/";
      ["hook", "intro", "pitch", "sub"].forEach((k) => { if (typeof p[k] === "string" && /Zoom/.test(p[k]) && p.via !== "zoom") p[k] = p[k].replace(/실시간 Zoom 실습/g, "유튜브 LIVE 실습").replace(/Zoom에서 실시간으로/g, "유튜브 라이브로 실시간").replace(/Zoom으로/g, "유튜브 라이브로"); });
    });
  }
  /* v15: 판매 영역 기본값(VOD · 전자책만) + 저장된 홈 섹션 순서에 새 섹션(학습 시스템 · 분야별 · 새로 올라온) 자리 잡기 */
  function seedV15(v) {
    if (!v.biz) v.biz = { ebook: true, live: false, free: false };
    if (Array.isArray(v.homeRails) && v.homeRails.length) {
      const has = (k) => v.homeRails.some((x) => x.k === k), at = (k) => v.homeRails.findIndex((x) => x.k === k);
      if (!has("why")) v.homeRails.splice(at("best") + 1, 0, { k: "why", on: true });
      if (!has("cat")) v.homeRails.splice(Math.max(at("ebook"), at("why")) + 1, 0, { k: "cat", on: true });
      if (!has("new")) v.homeRails.splice(at("cat") + 1, 0, { k: "new", on: true });
    }
  }
  /* v16: 시안 체험 계정 vod@gmail.com / vod · 정산 기본 강사 5 : 플랫폼 5 (광고비도 5 : 5) · 강사별 정산 비율 */
  function seedV16(v) {
    const dm = v.members.find((x) => x.id === "vm-demo");
    if (dm && dm.email === "vod@doinggo.kr") { dm.email = "vod@gmail.com"; dm.pw = "vod"; }
    Object.assign(v.settings, { share: 50, addonShare: 50, adSplit: 50 });
    v.insRates = v.insRates || {};
    const ids = {}; v.products.forEach((p) => { if (p.iid) ids[p.iid] = 1; });
    Object.keys(ids).forEach((iid) => { if (!v.insRates[iid]) v.insRates[iid] = { vod: 50, addon: 50, ad: 50, memo: "기본 계약 · 강사 5 : 플랫폼 5 (촬영 · 편집 · 스튜디오 · 장비 · 운영은 플랫폼이 맡아요)", at: now(), by: "마스터", hist: [] }; });
    // 아직 정산 확정 전인 주문은 새 기본 비율로 다시 계산 (확정된 명세서는 그대로)
    const frozen = {}; (v.payouts || []).forEach((x) => ((x.snap && x.snap.ids) || []).forEach((id) => { frozen[id] = 1; }));
    v.orders.forEach((o) => { if (!frozen[o.id] && o.share != null) o.share = 50; });
    v.adSpend = v.adSpend || [];
    if (!v.adSpend.length) { const d0 = new Date(); d0.setDate(1); d0.setMonth(d0.getMonth() - 1); v.adSpend.push({ id: "ad-demo1", iid: "moon", pid: "v1", ym: d0.getFullYear() + "-" + String(d0.getMonth() + 1).padStart(2, "0"), amount: 400000, memo: "메타(인스타그램) 광고 · 해외 건기식 브랜드", at: now() }); }
  }
  /* v17: 무료 LIVE → 얼리버드 (상품은 둘 · 운영은 하나) · 판매 영역 ‘무료 LIVE’(기본 꺼짐 → 스토어는 지금 그대로) · 홈 섹션 ‘무료 LIVE’ · ‘얼리버드 할인중’
   * 시안 데이터: 문대표 11/17 무료 LIVE → VOD, 갓농부 어제 끝난 무료 LIVE → 얼리버드 진행 중, 초이 · 부알남 · 갓농부 다음 회차 → 각자 VOD */
  function seedV17(v) {
    v.biz = Object.assign({ ebook: true, live: false, free: false }, v.biz || {}); if (v.biz.flive == null) v.biz.flive = false;
    if (Array.isArray(v.homeRails) && v.homeRails.length) {
      const at = (k) => v.homeRails.findIndex((x) => x.k === k);
      ["eb", "flive"].forEach((k) => { if (at(k) < 0) v.homeRails.splice(at("new") >= 0 ? at("new") + 1 : v.homeRails.length, 0, { k, on: true }); });
    }
    const P = (id) => v.products.find((p) => p.id === id), D = (n) => DB.date.addDays(today(), n), T = (x) => Date.parse(x);
    const link = (id, next, ebPrice, ebDays) => { const p = P(id); if (p && p.next == null) Object.assign(p, { next, ebPrice, ebDays, gate: false }); };
    link("fl-choi", "v2", 119000, 3); link("fl-logic", "v4", 99000, 3); link("fl-farmer", "v3", 149000, 3);
    const mk = (o) => { if (P(o.id)) return; v.products.push(Object.assign({ type: "live", status: "on", price: 0, sale: null, saleEnd: "", eventMin: 90, seats: "", link: "", replayDays: "", base: 0, createdAt: now(), share: null, accessDays: null, level: "입문", faq: [], badges: ["NEW"], likeBase: 20, via: "youtube", kakao: "https://open.kakao.com/", ytLive: "https://www.youtube.com/", hook: "LIVE 무료 특강", gate: false,
      curriculum: [{ id: o.id + "-c1", title: "LIVE 진행 순서", lessons: [{ id: o.id + "-l1", title: "오프닝 · 오늘 배울 것", min: 10 }, { id: o.id + "-l2", title: "핵심 강의", min: 60 }, { id: o.id + "-l3", title: "실시간 Q&A · LIVE 참여자 혜택 안내", min: 20 }] }] }, o)); };
    mk({ id: "fl-moon", cat: "commerce", iid: "moon", creator: "문대표", title: "문대표 무료 LIVE: 마진 50%, 경쟁 X 내 해외 건기식 브랜드 만들기", sub: "11월 17일(화) 저녁 7시 30분 · 유튜브 LIVE · 누구나 무료", eventAt: "2026-11-17T19:30",
      color: ["#0b2a5b", "#3fb6ff"], thumbText: "해외 건기식\n브랜드 만들기", tagline: "뉴질랜드 건기식 브랜드 대표", headline: "마진 50%, 경쟁 없이\n내 건기식 브랜드 시작하기", likeBase: 31,
      next: "v1", ebPrice: 249000, ebDays: 3,
      learn: ["경쟁 없는 해외 건기식 상품 고르는 기준", "재고 없이 첫 브랜드를 시작하는 순서", "LIVE 참여자만 받는 얼리버드 혜택"], who: ["회사 다니면서 내 브랜드를 갖고 싶은 분", "해외 소싱이 처음인 분"],
      pains: ["건기식은 경쟁이 너무 세지 않을까?", "재고 쌓일까 봐 시작을 못 하겠다."], tags: ["무료LIVE", "해외건기식", "1인브랜드"],
      pitch: "문대표가 유튜브 LIVE로 뉴질랜드 건기식 브랜드를 직접 키운 순서를 그대로 보여 드려요. 신청하면 오픈채팅방이 열리고, 강의 날 오픈채팅방에 LIVE 링크를 올려 드려요. 끝까지 함께한 분께는 LIVE가 끝난 뒤 얼리버드 혜택이 열려요 :)",
      intro: "문대표 강사님과 유튜브 LIVE로 실시간으로 만나는 무료 특강이에요. 신청하면 카카오톡 오픈채팅방 입장 버튼이 열리고, 강의 날 오픈채팅방에 LIVE 링크를 올려 드려요." });
    mk({ id: "fl-farmer-0", cat: "commerce", iid: "farmer", creator: "갓농부", title: "갓농부 무료 LIVE: 제철 귤, 산지에서 바로 파는 첫걸음", sub: "지난 회차 · 유튜브 LIVE · 누구나 무료", eventAt: D(-1) + "T19:30", badges: [],
      color: ["#1c1c1e", "#ff9f1a"], thumbText: "제철 귤\n산지에서 팔기", tagline: "산지직송 브랜드 대표", headline: "귤 한 박스로 시작하는\n산지직송 판매",
      next: "v3", ebPrice: 149000, ebDays: 7,
      learn: ["산지와 처음 이야기하는 법", "첫 판매 채널 고르기", "LIVE 참여자 얼리버드"], who: ["농산물 온라인 판매가 처음인 분"], tags: ["무료LIVE", "농산물판매"],
      intro: "갓농부 강사님과 유튜브 LIVE로 만난 무료 특강이에요. LIVE가 끝나서 지금은 이어지는 VOD를 얼리버드 가격으로 들을 수 있어요." });
    // 체험 계정 · 다른 회원 신청 기록 (끝난 회차 → 얼리버드 결제 1건까지)
    const has = (no) => v.orders.some((o) => o.no === no), apply = (no, mid, pid, at) => { const p = P(pid); if (!p || has(no)) return; v.orders.push({ id: "vo-" + no.slice(2), no, kind: "course", mid, pid, title: p.title, list: 0, sale: 0, amount: 0, method: "free", share: 50, status: "paid", at: T(at), paidAt: T(at), buyer: { name: (v.members.find((m) => m.id === mid) || {}).name || "", phone: "010-0000-0000" } }); };
    apply("DC261028201", "vm-demo", "fl-moon", D(-1) + "T12:20:00"); apply("DC261028202", "vm-demo", "fl-farmer-0", D(-4) + "T21:05:00"); apply("DC261028203", "vm-2", "fl-farmer-0", D(-3) + "T09:40:00"); apply("DC261028204", "vm-3", "fl-farmer-0", D(-3) + "T13:15:00"); apply("DC261028205", "vm-2", "fl-moon", D(-2) + "T20:30:00");
    if (P("v3") && !has("DC261028206")) v.orders.push({ id: "vo-261028206", no: "DC261028206", kind: "course", days: 365, mid: "vm-3", pid: "v3", title: P("v3").title, list: 274000, sale: 164000, amount: 164000, method: "card", share: 50, status: "paid", at: T(D(-1) + "T22:10:00"), paidAt: T(D(-1) + "T22:10:00"), eb: "fl-farmer-0" });
  }
  /* v18: 회원 DB · CRM — 가입 방식(이메일 · 카카오) · 광고성 정보 수신 동의 기록 · 처음 들어온 경로 · 태그 · 상담 메모
   * 체험 회원 21명: 열성팬 · 재구매 · 첫 구매 · 무료 체험 · 구매 전 · 이탈 위험 · 휴면 · 이용 중지가 고루 보이게 (주문 · 진도 · 쿠폰 · 포인트 · 찜 · 후기까지) */
  function seedV18(v) {
    const T = (d, h) => Date.parse(DB.date.addDays(today(), d) + "T" + (h || "10:00") + ":00"), P = (id) => v.products.find((p) => p.id === id), ds = (ms) => DB.date.toStr(new Date(ms));
    const base = { "vm-demo": ["email", { s: "instagram", c: "fall_launch" }, true, ["얼리어답터"], true], "vm-2": ["kakao", { s: "youtube" }, true, ["후기 작성러"], true], "vm-3": ["email", { s: "naver" }, false, [], false] };
    v.members.forEach((m) => {
      const b = base[m.id] || ["email", { s: "direct" }, false, [], false];
      if (!m.via) m.via = b[0];
      if (m.via === "kakao" && !m.kakaoId) m.kakaoId = "4" + String(m.createdAt).slice(-9);
      if (m.marketing == null) m.marketing = b[4];
      if (!m.consent) m.consent = consentOf(m.marketing, m.createdAt);
      if (!m.src) m.src = Object.assign({ at: m.createdAt }, b[1]);
      if (m.kakaoCh == null) m.kakaoCh = b[2];
      if (!Array.isArray(m.tags)) m.tags = b[3].slice();
      if (!Array.isArray(m.notes)) m.notes = [];
      if (!m.lastLoginAt) m.lastLoginAt = m.id === "vm-demo" ? T(0, "09:10") : m.id === "vm-2" ? T(-2, "21:40") : T(-1, "13:20");
    });
    v.crm = v.crm || {};
    v.crm.rules = Object.assign({ fanN: 3, fanAmt: 500000, fanDays: 60, riskDays: 45, sleepDays: 365, newDays: 7 }, v.crm.rules || {});
    if (!Array.isArray(v.crm.tags)) v.crm.tags = ["얼리어답터", "후기 작성러", "문대표 팬", "갓농부 팬", "초이 팬", "AI 관심", "오프라인 참석", "기존 사이트 회원", "VIP 상담"];
    ["segs", "camps", "msgs", "views", "dl"].forEach((k) => { if (!Array.isArray(v.crm[k])) v.crm[k] = []; });
    if (!v.crm.auto) v.crm.auto = { welcome: true, nobuy: true, live: true, like: false, start: true, cpexp: true, expire: true, winback: false, birth: false, reconsent: true };
    if (v.members.some((m) => m.id === "vm-c01")) return;
    let seq = 300;
    const ord = (mid, name, pid, d, o) => {
      const p = P(pid); if (!p) return null; o = o || {};
      const t = typeOf(p), b0 = basePrice(p), sale = t === "vod" && b0 > 0 ? r1k(b0 * 1.1) : b0, list = t === "vod" && b0 > 0 ? Math.max(sale, r1k((Number(p.price) || b0) * 1.1)) : Number(p.price) || sale;
      const at = T(d, o.h || "20:10"), no = "DC" + ds(at).replace(/-/g, "").slice(2) + String(seq++), cp = o.cp || 0;
      const x = { id: "vo-" + no.slice(2), no, kind: "course", mid, pid, title: p.title, list, sale, amount: Math.max(0, sale - cp), method: sale === 0 ? "free" : o.m || "card", ch: o.ch || "web", share: 50, status: "paid", at, paidAt: at, seed: "crm" };
      if (t === "vod" && sale > 0) x.days = 365;
      if (cp) Object.assign(x, { couponName: "신규 가입 5,000원 할인", couponOff: cp });
      if (o.st === "refunded") Object.assign(x, { status: "refunded", refundedAt: at + 864e5, refundAmount: x.amount, refundWhy: "결제 도용 의심 · 카드사 확인" });
      if (/^(live|offline)$/.test(t)) x.buyer = { name, phone: "010-0000-0000" };
      v.orders.push(x); return x;
    };
    const study = (mid, pid, frac) => { const p = P(pid); if (!p || !frac) return; const ids0 = []; (p.curriculum || []).forEach((c) => (c.lessons || []).forEach((l) => ids0.push(l.id))); if (!ids0.length) return; const k = Math.max(1, Math.min(ids0.length, Math.round(ids0.length * frac))), done = {}; ids0.slice(0, k).forEach((id) => { done[id] = true; }); (v.progress[mid] = v.progress[mid] || {})[pid] = { done, last: ids0[Math.min(k, ids0.length - 1)] }; };
    // [id, 이름, 가입 방식, 가입(며칠 전 · 또는 날짜), 소식 동의, 카톡 채널, 유입, 태그, 주문 [상품, 며칠 전, 옵션, 진도], 마지막 로그인(며칠 전 · 또는 날짜), 추가]
    const S = [
      ["vm-c01", "정OO", "kakao", -96, true, true, { s: "instagram", c: "summer_farm" }, ["갓농부 팬", "오프라인 참석", "VIP 상담"], [["v3", -94, 0, 1], ["v11", -27], ["v1", -20, 0, 0.7], ["v8", -15, 0, 0.9], ["v13", -6]], -1, { pts: 3500, birth: "11-03", gender: "female", age: "30~39", rv: [["v3", 5, "제철 캘린더 그대로 따라 해서 첫 주문 받았어요. 포장 팁까지 바로 써먹었어요!", -60], ["v8", 5, "브랜드 이름 짓는 파트 덕분에 패키지를 새로 맞췄어요.", -8]], note: "오프라인 강의 때 다음 기수 · 1:1 코칭권 문의함. 평일 저녁 연락 선호." }],
      ["vm-c02", "최OO", "email", -78, true, false, { s: "youtube", c: "moon_live" }, ["문대표 팬"], [["v1", -76, 0, 0.9], ["v6", -25, 0, 0.6], ["v10", -12], ["v4", -9, 0, 0.3]], -2, { pts: 1500, rv: [["v1", 5, "공급처 연락 메일 템플릿이 제일 좋았어요. 실제로 답장 받았습니다.", -50]] }],
      ["vm-c03", "한OO", "kakao", -36, true, true, { s: "kakao", c: "channel" }, ["초이 팬", "AI 관심"], [["v5", -30, 0, 1], ["v2", -10, 0, 0.5], ["v12", -7], ["v4", -3, 0, 0.1]], 0, { pts: 2000, birth: "02-17", gender: "male", age: "20~29", rv: [["v5", 4, "하루 1시간 루틴이 현실적이에요. 애드센스 파트가 조금 더 길면 좋겠어요.", -20]] }],
      ["vm-c04", "윤OO", "email", -50, true, false, { s: "naver" }, [], [["v4", -47, { cp: 5000 }, 0.8], ["v5", -20, 0, 0.4]], -5, {}],
      ["vm-c05", "장OO", "kakao", -40, false, true, { s: "instagram" }, [], [["v11", -28], ["v6", -26, 0, 0.7]], -8, {}],
      ["vm-c06", "임OO", "kakao", -33, true, false, { s: "meta", c: "ai_goods", m: "paid_social" }, ["AI 관심"], [["v5", -30, { ch: "ad" }, 0.6], ["v2", -9, { ch: "ad" }, 0.2]], -4, {}],
      ["vm-c07", "오OO", "email", -26, true, false, { s: "google" }, [], [["v1", -25, { cp: 5000 }, 0.15]], -3, {}],
      ["vm-c08", "서OO", "kakao", -18, true, true, { s: "youtube" }, [], [["v5", -16, { cp: 5000, m: "kakao" }, 0.5]], -6, {}],
      ["vm-c09", "신OO", "kakao", -12, false, false, { s: "direct" }, [], [["v3", -5, { m: "toss" }]], -5, { note: "결제 후 강의실에 아직 안 들어옴 · 입장 방법 안내 필요" }],
      ["vm-c10", "권OO", "email", -9, true, false, { s: "ins", by: "moon" }, ["문대표 팬"], [["v6", -8, { cp: 5000, ch: "ins" }, 0.3]], -1, {}],
      ["vm-c11", "황OO", "kakao", -7, true, true, { s: "instagram", c: "free_live" }, [], [["fl-moon", -6], ["v7", -6, 0, 0.5]], -2, { likes: ["v1"] }],
      ["vm-c12", "안OO", "email", -15, true, false, { s: "youtube" }, [], [["fl-farmer-0", -5]], -1, { likes: ["v3"] }],
      ["vm-c13", "송OO", "kakao", -20, false, false, { s: "direct" }, [], [["v7", -8, 0, 0.5]], -8, {}],
      ["vm-c14", "전OO", "kakao", -2, true, true, { s: "instagram", c: "fall_launch" }, [], [], -2, { likes: ["v1", "v9"] }],
      ["vm-c15", "홍OO", "email", -1, false, false, { s: "naver" }, [], [], -1, {}],
      ["vm-c16", "유OO", "email", -22, true, false, { s: "google" }, [], [], -21, { likes: ["v4"] }],
      ["vm-c17", "고OO", "email", -98, true, false, { s: "naver" }, [], [["v3", -96, 0, 0.4]], -61, {}],
      ["vm-c18", "문OO", "kakao", -82, true, true, { s: "youtube" }, [], [["v1", -79, 0, 0.6], ["v3", -75, 0, 0.2]], -52, {}],
      ["vm-c19", "양OO", "email", -70, false, false, { s: "direct" }, [], [["v3", -66, 0, 0.2]], -48, {}],
      ["vm-c20", "손OO", "email", "2024-09-01", true, false, { s: "migrate" }, ["기존 사이트 회원"], [], "2025-08-20", { note: "기존 doogoclass.com 회원을 옮겨 왔어요 · 소식 받기 동의 2년이 지나 다시 확인이 필요해요." }],
      ["vm-c21", "배OO", "email", -30, false, false, { s: "direct" }, [], [["v5", -29, { st: "refunded" }]], -28, { blocked: true, note: "결제 도용 의심 · 카드사 확인 중 (운영팀) — 확인될 때까지 이용 중지" }]
    ];
    const mc = (v.memberCoupons = v.memberCoupons || {}), welcome = (v.coupons || []).find((c) => c.id === "cp-welcome");
    S.forEach((x, i) => {
      const [id, name, via, c0, mkt, kch, src, tags, os, lg, ex] = x, at = typeof c0 === "string" ? Date.parse(c0 + "T10:00:00") : T(c0, "11:" + String(10 + i).padStart(2, "0")), n2 = String(i + 1).padStart(2, "0");
      const m = { id, via, email: (via === "kakao" ? "kakao" : "member") + n2 + "@example.com", name, phone: "010-0000-" + String(4100 + i * 37).slice(-4), marketing: mkt, consent: consentOf(mkt, at, via === "kakao" ? "카카오 가입" : typeof c0 === "string" ? "기존 사이트 가입" : "가입"), src: Object.assign({ at }, src), kakaoCh: kch, tags: tags.slice(), notes: ex.note ? [{ id: "nt-" + id, at: at + 864e5 * 2, by: "ADMIN", text: ex.note }] : [], createdAt: at, points: 0, pointLog: [], loginN: 3 + (i % 7) };
      if (via === "kakao") m.kakaoId = "4" + String(at).slice(-9);
      if (ex.birth) Object.assign(m, { birth: ex.birth, gender: ex.gender, age: ex.age });
      if (ex.blocked) m.blocked = true;
      const la = typeof lg === "string" ? Date.parse(lg + "T20:00:00") : T(lg, "21:" + String(10 + i).padStart(2, "0"));
      m.lastLoginAt = la; m.seenAt = la;
      v.members.push(m);
      // 신규 가입 쿠폰: 가입 30일 안에 첫 결제에 썼으면 사용 완료
      if (welcome) { const w = { id: "mc-" + id + "-w", cid: welcome.id, at, exp: ds(at + 30 * 864e5), usedAt: null, orderNo: "" }; (mc[id] = mc[id] || []).push(w); x.w = w; }
      os.forEach((o) => { const r = ord(id, name, o[0], o[1], o[2] || null); if (!r) return; if (o[2] && o[2].cp && x.w) { x.w.usedAt = r.at; x.w.orderNo = r.no; r.mcid = x.w.id; } if (o[3]) study(id, o[0], o[3]); });
      if (os.length >= 2) { const c10 = (v.coupons || []).find((c) => c.id === "cp-10000"); if (c10) mc[id].push({ id: "mc-" + id + "-10k", cid: c10.id, at: T(Math.max(-60, os[os.length - 1][1]) + 1), exp: c10.endAt || "", usedAt: null, orderNo: "" }); }
      (ex.rv || []).forEach((r) => { v.reviews.push({ id: "vr-" + id + "-" + r[0], pid: r[0], mid: id, name, rating: r[1], text: r[2], at: T(r[3], "22:00") }); m.points += 500; m.pointLog.push({ at: T(r[3], "22:00"), amt: 500, why: "후기 작성 적립" }); });
      if (ex.pts) { m.points += ex.pts; m.pointLog.push({ at: T(-14), amt: ex.pts, why: "구매 적립 · 이벤트" }); }
      if (ex.likes) v.likes[id] = ex.likes.slice();
      if (os.length && !ex.blocked) { const sl = (v.studyLog[id] = v.studyLog[id] || {}); [0, 2, 5, 9].forEach((k, j) => { const d0 = ds(la - k * 864e5); if (d0 >= ds(at)) sl[d0] = 1 + ((i + j) % 3); }); }
    });
    // 지난 캠페인 1건 (보낸 사람 · 7일 안 구매는 실제 주문으로 계산해요)
    if (!v.crm.camps.length) {
      const at = T(-12, "10:00"), to = v.members.filter((m) => m.marketing && !m.blocked && m.createdAt < at).map((m) => m.id);
      v.crm.camps.push({ id: "cm-seed1", name: "10월 새 클래스 오픈 · 1만 원 쿠폰", ch: "brand", ad: true, seg: "sub", text: "(광고) {이름}님, 가을 새 클래스가 열렸어요. 1만 원 할인 쿠폰으로 먼저 들어 보세요.", coupon: "", at, by: "ADMIN", to, skip: v.members.filter((m) => !m.marketing && m.createdAt < at).length });
    }
    if (!v.crm.segs.length) v.crm.segs.push({ id: "sg-seed1", name: "찜만 하고 아직 안 산 회원", rules: [["likes", "gte", "1"], ["paid", "lte", "0"]], at: T(-3) }, { id: "sg-seed2", name: "문대표 강의를 산 회원", rules: [["ins", "is", "moon"]], at: T(-3) });
  }
  /* v19: 환불 규정 기본값 (7일 · 하나도 안 들었으면 회원이 바로 100% 취소) · 예전 FAQ 문구 고치기 · 바로 취소 내역 1건 (시안) */
  function seedV19(v) {
    v.settings = v.settings || {}; v.settings.refund = Object.assign({ instant: true, days: 7, maxUsed: 0, matCounts: true, addons: true, restore: true, ebookDays: 7, eventDays: 3 }, v.settings.refund || {});
    (v.helpFaq || []).forEach((f) => { if (f && /2개 이하 수강이면 전액/.test(f[2] || "")) f[2] = "VOD는 결제 후 7일 이내 · 강의를 하나도 듣지 않았다면 마이페이지 › 주문 · 결제 내역에서 ‘결제 취소 · 100% 환불’로 바로 취소돼요. 전자책은 내려받기 전 7일 이내, LIVE · 오프라인은 3일 전까지 전액 환불이에요. 그 밖에는 ‘환불 요청’을 남겨 주시면 규정에 따라 처리해 드려요."; });
    const P = (id) => v.products.find((p) => p.id === id), T = (d, h) => Date.parse(DB.date.addDays(today(), d) + "T" + (h || "10:00") + ":00");
    if (P("v4") && v.members.some((m) => m.id === "vm-c16") && !v.orders.some((o) => o.no === "DC261017390")) { const p = P("v4"), b0 = basePrice(p), sale = r1k(b0 * 1.1); v.orders.push({ id: "vo-261017390", no: "DC261017390", kind: "course", days: 365, mid: "vm-c16", pid: "v4", title: p.title, list: Math.max(sale, r1k(Number(p.price) * 1.1)), sale, amount: sale, method: "card", ch: "web", share: 50, status: "refunded", at: T(-12, "21:30"), paidAt: T(-12, "21:30"), refundedAt: T(-11, "09:05"), refundAmount: sale, refundKind: "instant", refundWhy: "회원 바로 취소 (1일째 · 들은 강의 0개)", refundBy: "회원", pg: { st: "mock", at: T(-11, "09:05") }, seed: "crm" }); }
  }
  /* v20: 문대표 강의는 스토어에서 미노출 (다른 플랫폼 계약 · 지우지 않음, 마스터 › VOD 클래스 관리 › 강사 노출에서 다시 켤 수 있어요)
   * + 셀러훈(중국 구매대행) VOD 클래스 · 첫 화면 배너. 셀러훈은 두잉고 계정이 없는 강사라 사진은 클래스의 ‘강사 사진’ 칸에 올려요 */
  function seedV20(v) {
    v.insOff = Array.isArray(v.insOff) ? v.insOff : [];
    if (v.insOff.indexOf("moon") < 0) v.insOff.push("moon");
    if (!v.products.some((p) => p.id === "v14")) v.products.push(sellerHoon());
    if (Array.isArray(v.banners) && !v.banners.some((b) => b.id === "vb-seller")) {
      const at = v.banners.findIndex((b) => b.pid === "v1");
      v.banners.splice(at >= 0 ? at : Math.min(1, v.banners.length), 0, { id: "vb-seller", eyebrow: "NEW · 셀러훈", title: "중국 구매대행,\n상품 찾기부터 첫 판매까지", sub: "타오바오 · 1688 소싱 · 스마트스토어 판매", pid: "v14", color: ["#2b0d0d", "#ff4d2e"], on: true });
    }
  }
  /* v21: 문대표 종이책 (전자책 메뉴 · 택배 배송) + 배송 설정 기본값 — 정식 서버는 배포 때 일회성 작업(api/_lib/books.js · oneoff.js)이 같은 책을 넣어요 */
  const MOON_BOOK = {"id": "b1", "type": "book", "status": "on", "showOff": true, "title": "내 인생의 추월차선은 내가 만든다", "sub": "0원에서 시작한 사람이 건네는 4단계 차선 변경법 · 문대표 첫 책", "cat": "biz", "iid": "moon", "creator": "문대표", "author": "문원오", "publisher": "청춘미디어", "price": 15900, "sale": null, "saleEnd": "", "pages": null, "size": "", "isbn": "", "pubDate": "", "shipFee": 0, "stock": "", "share": null, "level": "입문", "base": 0, "likeBase": 0, "cover": "assets/vod/book/moon-cover.webp", "detailImgs": [{"url": "assets/vod/book/moon-mock.webp", "name": "앞표지 · 뒤표지"}, {"url": "assets/vod/book/moon-spread.webp", "name": "표지 펼침면 · 저자 소개"}], "detailMode": "img-text", "color": ["#141414", "#ffd400"], "hook": "문대표 첫 책", "tagline": "두고홀딩스 대표 · 청춘미디어", "thumbText": "내 인생의 추월차선은\n내가 만든다", "headline": "열심히 사는데\n왜 통장은 늘 제자리일까?", "badges": ["NEW"], "pains": ["열심히 사는데 왜 통장은 늘 제자리일까?", "부자를 부러워만 하고, 무엇부터 해야 할지 모르겠다.", "한 번 크게 실패하고 나니 다시 시작할 엄두가 안 난다."], "pitch": "스무 개의 직업 끝에 통장 잔고 0원. 그의 차선을 바꾼 건 블로그 글 하나로 번 첫 5,000원이었어요. 그 첫 돈은 10개의 유통 브랜드사와 제조부터 IT 개발까지 아우르는 두고홀딩스, 뉴질랜드 아시아 최초의 건강식품 제조 인허가, 500명이 넘는 수강생으로 이어졌습니다. 아무것도 없이 시작한 사람이 실제로 밟은 네 단계, MOON 공식을 그대로 담았어요. 읽고 끝나는 책이 아니라 꼭지마다 저자의 실제 답을 보고 내 답을 쓰는 90일 차선 변경 워크북이에요.", "tags": ["문대표", "첫5000원", "MOON공식", "90일워크북", "부업", "창업"], "learn": ["M · 모르는 사람에게서 첫 돈을 받아라 — 1억짜리 계획보다 5,000원짜리 첫 판매", "O · 한 번 더 팔리게 만들어라 — 첫 주문은 마케팅이, 두 번째 주문은 신뢰가 만든다", "O · 내 손을 떠나도 돌아가게 하라 — 70%면 넘기고, 일을 문서로 만들어라", "N · 다음 층으로 올라가라 — 유통 → 브랜드 → 제조 → 교육, 천장을 알아채는 감각"], "who": ["열심히 사는데 통장은 늘 제자리인 분", "부자를 부러워만 하다 이제는 직접 시작하고 싶은 분", "첫 5,000원을 벌어 보고 싶은 부업 · 창업 준비생", "한 번 실패하고 다시 일어설 방법을 찾는 분"], "comment": "“하나의 시도가 실패한 것이지, 당신이라는 사람이 실패한 게 아니다.” 7억을 잃고 다시 일어서며 붙든 문장이에요. 꼭지마다 제 실제 답을 먼저 적어 두었으니, 그 아래에 여러분의 답을 써 보세요. 90일 뒤에는 나만의 차선 변경 계획이 완성돼 있을 거예요.", "intro": "내일은 당연히 오는 것이 아니다. 그래서 나는 ‘언젠가’라는 말을 버렸다.\n\n모르는 사람에게서 첫 돈을 받고(M), 한 번 더 팔리게 만들고(O), 내 손을 떠나도 돌아가게 하고(O), 다음 층으로 올라가라(N). 아무것도 없이 시작한 사람이 실제로 밟은 순서, MOON 공식이에요.\n\n이 책의 사용법 — 꼭지마다 저자의 실제 답(EX)을 먼저 보고, 그 아래에 당신의 답을 쓰세요. 90일 동안 한 꼭지씩, 당신만의 차선 변경 계획이 완성됩니다.\n\n· 7억을 잃고 다시 일어선 실패 읽는 법\n· 2,000개 말고 50개부터, 내 브랜드 시작법\n· 저자가 먼저 답한 질문 25개 · 90일 실천 계획", "creatorBio": "두고홀딩스 창업자이자 그룹 총괄 대표. 제조 · 유통 · 브랜딩 · 마케팅 · 교육 · 호텔 F&B · IT 개발을 아우르는 계열사와 10개의 유통 브랜드사를 이끌고 있어요. 농장 · 호텔 · 이삿짐 등 스무 개가 넘는 일을 거쳐 2019년 마누카꿀 하나로 이커머스를 독학해 첫 이익 5,000원을 남겼고, 2025년 뉴질랜드에서 아시아 최초로 건강식품 제조 인허가를 받았어요. 500명이 넘는 수강생에게 ‘모르는 사람에게서 첫 돈을 받는 법’을 가르치고 있어요.", "faq": [], "curriculum": [], "createdAt": 1793318400000};
  function seedV21(v) {
    if (!v.products.some((p) => p.id === MOON_BOOK.id)) v.products.push(JSON.parse(JSON.stringify(MOON_BOOK)));
    v.settings = v.settings || {}; if (!v.settings.ship) v.settings.ship = Object.assign({}, SHIP_DEF);
  }
  function sellerHoon() {
    return ids({ id: "v14", status: "on", type: "vod", title: "중국 구매대행, 상품 찾기부터 첫 판매까지", sub: "타오바오 · 1688 소싱 · 스마트스토어 등록 · 배송 · CS까지 한 번에", cat: "commerce", iid: "", creator: "셀러훈", creatorPhoto: "assets/home/sellerhoon-profile.webp",
      price: 249000, sale: 179000, saleEnd: "", accessDays: 365, level: "입문 · 초급", thumbText: "중국 구매대행\n첫 판매까지", base: 0, likeBase: 0, createdAt: now(), share: null,
      color: ["#1c1c1e", "#ff4d2e"], hook: "재고 없이 시작하는 구매대행", tagline: "중국 구매대행 셀러", headline: "중국 구매대행,\n상품 찾기부터 첫 판매까지.", badges: ["NEW"],
      creatorBio: "셀러훈은 중국 구매대행으로 직접 상품을 찾고 팔아 온 셀러예요. 타오바오 · 1688에서 상품을 고르는 기준부터 스마트스토어 등록 · 배송 · CS까지 실제로 쓰는 방법을 강의로 정리했어요.",
      who: ["재고 부담 없이 온라인 판매를 시작하고 싶은 분", "중국 구매대행이 궁금하지만 어디서부터 해야 할지 모르는 분", "스마트스토어를 열었는데 올릴 상품이 없는 분"],
      learn: ["타오바오 · 1688에서 팔릴 상품을 고르는 기준", "원가 · 배송비 · 관부가세를 넣은 판매가 계산", "스마트스토어 상품 등록과 상세페이지 만들기", "배송 대행지 · 통관 · 반품 · CS 처리"],
      intro: "중국 구매대행은 주문이 들어온 뒤에 상품을 사서 보내는 방식이라, 재고 없이 시작할 수 있어요.\n\n이 클래스는 ‘무엇을 팔지’부터 ‘주문이 들어온 뒤 무엇을 할지’까지 순서대로 따라 할 수 있게 만들었어요. 수입은 보장하지 않으며, 결과는 실행과 시장 상황에 따라 달라져요.",
      pains: ["구매대행, 무슨 상품을 올려야 팔릴까?", "판매가를 얼마로 해야 남는지 계산이 안 된다.", "주문이 들어오면 배송 · 통관 · 반품은 어떻게 하지?"],
      pitch: "그런 분들을 위해 중국 구매대행으로 직접 판매해 온 셀러훈이, 상품 찾기부터 스마트스토어 등록 · 배송 · CS까지 실제로 쓰는 방법을 순서대로 알려 드립니다! 타오바오 · 1688에서 상품을 고르는 기준, 원가 · 배송비 · 관부가세까지 넣은 가격 계산, 배송 대행지 고르기와 통관, 반품 · 교환 응대까지. 재고 없이 시작해서 첫 주문을 받는 데 필요한 것만 담았어요.",
      tags: ["구매대행", "중국소싱", "타오바오", "1688", "스마트스토어"],
      faq: [["완전 초보도 들을 수 있나요?", "네. 사업자 등록 · 통신판매업 신고 같은 시작 준비부터 설명해요."], ["강의는 언제까지 볼 수 있나요?", "결제할 때 고른 수강권 기간(180일 · 365일 · 3년) 동안 횟수 제한 없이 볼 수 있어요. 기간이 끝나면 1년 연장권으로 진도 그대로 이어서 들을 수 있어요."], ["클래스를 들으면 수입이 보장되나요?", "수입은 보장하지 않아요. 시작에 필요한 방법과 준비 과정을 다루며, 실제 결과는 실행과 시장 조건에 따라 달라져요."]],
      curriculum: [CH("시작하기 전에", [L("중국 구매대행은 어떻게 돈이 남을까", 12, { preview: true }), L("사업자 · 통신판매업 · 판매 채널 준비", 15)]),
        CH("상품 찾기", [L("타오바오 · 1688에서 팔릴 상품 고르는 기준", 20), L("판매 금지 · 인증이 필요한 상품 거르기", 14), L("원가 · 배송비 · 관부가세 넣은 가격 계산", 18)]),
        CH("판매 시작", [L("스마트스토어 상품 등록 · 상세페이지", 22), L("배송 대행지 고르기와 통관", 16)]),
        CH("주문 이후", [L("주문 처리 · 배송 조회 루틴", 14), L("반품 · 교환 · CS 응대 문구", 15)])] });
  }
  // 두잉고 무료강의 날짜가 바뀌면 스토어 무료 LIVE 날짜도 따라가요
  function syncFreeLive() {
    if (!DB.freeOf) return;
    V().products.forEach((p) => { if (!p.fromFree) return; const f = DB.freeOf(p.fromFree); if (f && f.liveAt && p.eventAt !== f.liveAt) { p.eventAt = f.liveAt; save(); } });
  }
  function V() { const d = DB.data, fresh = !d.vod || !Array.isArray(d.vod.products), keep = fresh && d.vod && typeof d.vod === "object" ? d.vod : null; if (fresh) { d.vod = seed(); DB.save(); } else if (d.vod.ver !== 4) { migrate(d.vod); DB.save(); } if (!d.vod.v8) { d.vod.v8 = 1; seedV8(d.vod); DB.save(); } if (!d.vod.v9) { d.vod.v9 = 1; seedV9(d.vod); DB.save(); } if (!d.vod.v10) { d.vod.v10 = 1; seedV10(d.vod); DB.save(); } if (!d.vod.v11) { d.vod.v11 = 1; seedV11(d.vod); DB.save(); } if (!d.vod.v12) { d.vod.v12 = 1; seedV12(d.vod); DB.save(); } if (!d.vod.v13) { d.vod.v13 = 1; seedV13(d.vod); DB.save(); } if (!d.vod.v14) { d.vod.v14 = 1; seedV14(d.vod); DB.save(); } if (!d.vod.v15) { d.vod.v15 = 1; seedV15(d.vod); DB.save(); } if (!d.vod.v16) { d.vod.v16 = 1; seedV16(d.vod); DB.save(); } if (!d.vod.v17) { d.vod.v17 = 1; seedV17(d.vod); DB.save(); } if (!d.vod.v18) { d.vod.v18 = 1; seedV18(d.vod); DB.save(); } if (!d.vod.v19) { d.vod.v19 = 1; seedV19(d.vod); DB.save(); } if (!d.vod.v20) { d.vod.v20 = 1; seedV20(d.vod); DB.save(); } if (!d.vod.v21) { d.vod.v21 = 1; seedV21(d.vod); DB.save(); } if (fresh && SRV()) srvClean(d.vod, keep); if (SRV()) srvShape(d.vod); return d.vod; }
  /** 정식 서버: 회원 · 주문 · 후기 등은 따로 와서(볼 수 있는 것만) 비어 있을 수 있어요 → 빈 목록으로 */
  function srvShape(v) {
    if (!Array.isArray(v.members)) v.members = []; if (!Array.isArray(v.orders)) v.orders = []; if (!Array.isArray(v.reviews)) v.reviews = []; if (!Array.isArray(v.pledges)) v.pledges = []; if (!Array.isArray(v.inquiries)) v.inquiries = []; if (!Array.isArray(v.payouts)) v.payouts = [];
    if (!v.memberCoupons || typeof v.memberCoupons !== "object") v.memberCoupons = {}; if (!v.likes || typeof v.likes !== "object") v.likes = {}; if (!v.progress || typeof v.progress !== "object") v.progress = {}; if (!v.studyLog || typeof v.studyLog !== "object") v.studyLog = {};
  }
  /** 정식 서버: 시안용 체험 데이터(회원 · 주문 · 후기 · 다짐 · 진도 · 정산 · 광고비 · 발송 기록 · 수강생 수 · 찜 수)는 빼고 서버에서 받은 것만 */
  function srvClean(v, keep) {
    ["members", "orders", "reviews", "pledges", "inquiries", "payouts"].forEach((k) => { v[k] = keep && Array.isArray(keep[k]) ? keep[k] : []; });
    ["memberCoupons", "likes", "progress", "studyLog"].forEach((k) => { v[k] = keep && keep[k] && typeof keep[k] === "object" ? keep[k] : {}; });
    v.stat = (keep && keep.stat) || null;
    v.adSpend = []; v.topicVotes = {};
    if (v.crm) { v.crm.camps = []; v.crm.msgs = []; v.crm.dl = []; }
    (v.products || []).forEach((p) => { p.base = 0; p.likeBase = 0; });
    DB.save();
  }
  const save = () => DB.save();
  const cats = () => V().cats.filter((c) => c.on !== false);
  const catOf = (k) => V().cats.find((c) => c.key === k) || { key: k, label: k, icon: "layers" };
  const typeOf = (p) => (p && TYPE[p.type] ? p.type : "vod");
  const isEvent = (p) => typeOf(p) === "live" || typeOf(p) === "offline";
  /* ---------- 종이책 (택배 배송) ----------
   * 전자책 메뉴에서 함께 팔아요. 주문마다 수량(1~10권) · 배송지 · 배송비(주문마다 한 번)를 남기고, 마스터가 배송 관리에서
   * 결제 완료(ready) → 상품 준비 중(prep) → 배송 중(ship · 택배사 + 송장 번호) → 배송 완료(done)로 바꿔요.
   * 배송 중이 된 뒤 정한 날(기본 3일)이 지나면 자동으로 배송 완료로 봐요. 보내기 전이면 회원이 바로 취소, 그 뒤는 취소 · 반품 요청.
   * 도서정가제: 쿠폰은 쓰지 않고, 할인가는 정가의 90% 이상으로만 정해요 (포인트는 결제 수단이라 써요) */
  const isBook = (p) => typeOf(p) === "book";
  const BOOK_MAX = 10;
  const shipFeeOf = (p) => (isBook(p) ? Math.max(0, Math.round(Number(p.shipFee) || 0)) : 0);
  const shipFeeTxt = (p) => (shipFeeOf(p) ? "배송비 " + won(shipFeeOf(p)) : "무료배송");
  const SHIP_DEF = { autoDays: 3, outDays: 2, carrier: "CJ대한통운", returnFee: 6000, returnAddr: "" };
  const shipSet = () => Object.assign({}, SHIP_DEF, (V().settings || {}).ship || {});
  // 택배사 · 배송 조회 주소 (송장 번호를 붙여요)
  const CARRIERS = [["CJ대한통운", "https://trace.cjlogistics.com/next/tracking.html?wblNo="], ["우체국택배", "https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1="], ["한진택배", "https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2="], ["롯데택배", "https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo="], ["로젠택배", "https://www.ilogen.com/web/personal/trace/"], ["경동택배", "https://kdexp.com/service/delivery/etc/delivery.do?barcode="], ["CU 편의점택배", "https://www.cupost.co.kr/postbox/delivery/localResult.cupost?invoice_no="], ["GS25 편의점택배", "https://www.cvsnet.co.kr/invoice/tracking.do?invoice_no="]];
  const trackUrl = (o) => { const s = (o && o.ship) || {}, c = CARRIERS.find((x) => x[0] === s.carrier), no = String(s.inv || "").replace(/[^0-9A-Za-z]/g, ""); return c && no ? c[1] + encodeURIComponent(no) : ""; };
  const SHIP_ST = { wait: ["입금 대기", "wait"], ready: ["결제 완료", "ok"], prep: ["상품 준비 중", "prep"], ship: ["배송 중", "ship"], done: ["배송 완료", "done"], cancel: ["주문 취소", "off"] };
  /** 주문의 지금 배송 상태 (배송 중으로 바꾼 뒤 정한 날이 지나면 배송 완료로 봐요) */
  function shipStOf(o) {
    if (!o || !o.ship) return "";
    if (o.status === "refunded" || o.status === "canceled" || o.status === "failed") return "cancel";
    if (o.status === "pending" || o.status === "ready") return "wait";
    const st = o.ship.st || "ready";
    if (st === "ship" && o.ship.shipAt && now() >= o.ship.shipAt + (Number(shipSet().autoDays) || 3) * 864e5) return "done";
    return SHIP_ST[st] ? st : "ready";
  }
  /** 배송 완료 시각 (직접 바꿨으면 그때, 자동이면 보낸 날 + 정한 날) */
  const shipDoneAt = (o) => (!o || !o.ship ? 0 : o.ship.doneAt || (shipStOf(o) === "done" && o.ship.shipAt ? o.ship.shipAt + (Number(shipSet().autoDays) || 3) * 864e5 : 0));
  /** 남은 재고 (재고를 안 적었으면 null = 제한 없음) */
  function stockLeft(p) {
    if (!isBook(p) || p.stock == null || p.stock === "") return null;
    const sold = SRV() ? Number((stat().sold || {})[p.id]) || 0 : V().orders.filter((o) => o.pid === p.id && kindOf(o) === "course" && (o.status === "paid" || o.status === "pending")).reduce((a, o) => a + (Number(o.qty) || 1), 0);
    return Math.max(0, Number(p.stock) - sold);
  }
  const viaOf = (p) => (p && p.via === "zoom" ? "Zoom" : "유튜브 LIVE");
  const eventTime = (p) => { const t = p && p.eventAt ? new Date(p.eventAt).getTime() : NaN; return isNaN(t) ? 0 : t; };
  const eventPast = (p) => isEvent(p) && eventTime(p) > 0 && now() > eventTime(p) + (Number(p.eventMin) || 60) * 6e4;
  const products = (all) => V().products.filter((p) => all || p.status === "on" || p.status === "soon");
  const onSale = () => V().products.filter((p) => p.status === "on" && !eventPast(p));
  /* 판매 영역 (마스터 › VOD 전시 · 설정 › 판매 영역): 지금은 VOD · 전자책 중심. 꺼 둔 영역(LIVE · 오프라인 / 무료 강의)은
   * 메뉴 · 홈 · 카테고리 아이콘 · 전체 클래스 · 검색 · 강사 페이지에서 숨겨요. 이미 산 강의는 마이페이지에서 그대로 들어요 */
  const BIZ_DEF = { ebook: true, live: false, free: false, flive: false };
  const bizOn = (k) => { const b = V().biz || {}; return b[k] != null ? b[k] !== false : BIZ_DEF[k] !== false; };
  /* 무료 LIVE → 얼리버드 (타이탄 클래스처럼 상품은 둘, 운영은 하나로 이어요)
   * 무료 LIVE(0원 LIVE · 설명회)에 ‘이어지는 유료 강의(next)’ · 얼리버드 가격(ebPrice) · 기간(ebDays) · 끝날 때까지 숨기기(gate)를 적어 두면,
   * LIVE가 끝나는 순간 무료 LIVE 카드는 빠지고 연결한 유료 강의가 얼리버드 가격 · 마감 시계와 함께 ‘얼리버드 할인중’ 섹션에 떠요.
   * 같은 유료 강의에 무료 LIVE를 회차마다 계속 이어 붙일 수 있어요. 판매 영역 ‘무료 LIVE’가 꺼져 있으면 아무것도 바뀌지 않아요 */
  const isFreeEv = (p) => !!p && isEvent(p) && !(Number(p.price) > 0);
  const evEnd = (p) => eventTime(p) + (Number(p.eventMin) || 60) * 6e4;
  function funnelOf(f) {
    if (!isFreeEv(f) || !f.next || !eventTime(f)) return null;
    const end = evEnd(f), e = new Date(end), d0 = e.getFullYear() + "-" + String(e.getMonth() + 1).padStart(2, "0") + "-" + String(e.getDate()).padStart(2, "0");
    const ebDay = DB.date.addDays(d0, Math.max(1, Math.min(60, Number(f.ebDays) || 3))), ebEnd = new Date(ebDay + "T23:59:59").getTime();
    return { f, next: f.next, end, ebDay, ebEnd, ebPrice: Number(f.ebPrice) || 0, phase: now() < end ? "before" : now() <= ebEnd ? "eb" : "done" };
  }
  // 이 유료 강의로 이어지는 무료 LIVE: 얼리버드 중인 회차 → 다가오는 회차 순
  function funnelTo(p) {
    if (!p || isFreeEv(p) || !bizOn("flive")) return null;
    const fs = V().products.filter((f) => f.status === "on" && f.next === p.id).map(funnelOf).filter(Boolean);
    return fs.filter((x) => x.phase === "eb").sort((a, b) => b.end - a.end)[0] || fs.filter((x) => x.phase === "before").sort((a, b) => a.end - b.end)[0] || null;
  }
  const basePrice = (p) => (p.sale != null && p.sale !== "" && (!p.saleEnd || today() <= p.saleEnd) ? Number(p.sale) : Number(p.price) || 0);
  function ebOf(p) { const fn = funnelTo(p); return fn && fn.phase === "eb" && fn.ebPrice > 0 && fn.ebPrice < basePrice(p) ? Object.assign({ price: fn.ebPrice }, fn) : null; }
  // ‘무료 LIVE가 끝날 때까지 숨기기’를 켠 유료 강의는 LIVE가 끝나야 목록에 보여요
  const gatedBy = (p) => { const fn = funnelTo(p); return fn && fn.phase === "before" && fn.f.gate ? fn : null; };
  const bizKey = (p) => (isFreeEv(p) ? "flive" : isEvent(p) ? "live" : typeOf(p) === "ebook" || isBook(p) ? "ebook" : p.status !== "soon" && basePrice(p) === 0 ? "free" : "");
  const bizShow = (p) => !!p && (!bizKey(p) || bizOn(bizKey(p))) && !gatedBy(p) && insShown(p);
  const listed = () => onSale().filter(bizShow);
  const product = (id) => V().products.find((p) => p.id === id) || null;
  const priceOf = (p) => { const e = ebOf(p); return e ? e.price : basePrice(p); };
  // 할인 · 얼리버드 마감 시각 (카드 D-day · 상세 마감 시계)
  const saleEndOf = (p) => { const e = ebOf(p); return e ? e.ebDay + "T23:59:59" : p.saleEnd && pctOf(p) ? p.saleEnd + "T23:59:59" : ""; };
  const pctOf = (p) => { const a = priceOf(p), b = Number(p.price) || 0; return b > 0 && a < b ? Math.round((1 - a / b) * 100) : 0; };
  const monthsOf = (p) => (p.accessDays ? Math.round(p.accessDays / 30.4) : 0);
  const monthOf = (p) => (priceOf(p) >= 50000 ? Math.floor(priceOf(p) / 12) : 0);
  const lessons = (p) => (p.curriculum || []).reduce((a, c) => a.concat(c.lessons || []), []);
  /* 강의 길이: 영상의 실제 길이(비메오 · 유튜브, DB.vdur) → 아직 모르면 적어 둔 분 */
  const lSec = (l) => DB.vdur.sec(l.video, l.durSec, l.min);
  const lLen = (l) => DB.vdur.label(l.video, l.durSec, (Number(l.min) || 0) + "분");
  const totalMin = (p) => Math.round(lessons(p).reduce((a, l) => a + lSec(l), 0) / 60);
  const durTxt = (m) => (m >= 60 ? Math.floor(m / 60) + "시간 " + (m % 60 ? (m % 60) + "분" : "") : m + "분").trim();
  const aboutTxt = (m) => (m >= 90 ? "약 " + Math.round(m / 60) + "시간" : m >= 60 ? "약 1시간" : "약 " + m + "분");
  const reviewsOf = (pid) => V().reviews.filter((r) => r.pid === pid && !r.hidden).sort((a, b) => b.at - a.at);
  const ratingOf = (pid) => { const rs = reviewsOf(pid); return rs.length ? { avg: Math.round(rs.reduce((a, r) => a + r.rating, 0) / rs.length * 10) / 10, n: rs.length } : { avg: 0, n: 0 }; };
  const paidOrders = (pid) => V().orders.filter((o) => o.pid === pid && o.status === "paid" && kindOf(o) === "course");
  const soldOf = (p) => (Number(p.base) || 0) + (SRV() ? Number((stat().sold || {})[p.id]) || 0 : paidOrders(p.id).length);
  const seatsLeft = (p) => (isEvent(p) && Number(p.seats) > 0 ? Math.max(0, Number(p.seats) - (SRV() ? Number((stat().sold || {})[p.id]) || 0 : V().orders.filter((o) => o.pid === p.id && (o.status === "paid" || o.status === "pending")).length)) : null);
  const insPhoto = (iid) => { const c = DB.content && iid ? DB.content(iid) : null; return (c && c.brand && c.brand.photo) || ""; };
  /** 강사 키: 두잉고 강사는 iid, 두잉고 계정이 없는 강사(예: 셀러훈)는 "ext:이름" — 강사진 · 스토어 노출 스위치가 이 키를 써요 */
  const tkey = (p) => (p ? p.iid || (p.creator ? "ext:" + p.creator : "") : "");
  /** 강사 사진: 두잉고 강사 브랜드 사진 → 클래스에 넣은 강사 사진(두잉고 계정 없는 강사) */
  // 두잉고 계정이 없는 강사의 기본 사진 (클래스에 사진을 따로 올리면 그 사진, ‘사진 지우기’를 하면 "none" 으로 안 보여요)
  const EXT_PH = { "셀러훈": "assets/home/sellerhoon-profile.webp" };
  const extPh = (name) => EXT_PH[String(name || "").trim()] || "";
  const phOf = (p) => (p ? insPhoto(p.iid) || (p.creatorPhoto === "none" ? "" : p.creatorPhoto || extPh(p.creator)) : "");
  /* 강사 스토어 노출 (마스터 › VOD 클래스 관리 › 강사 노출): 끈 강사의 클래스 · 배너 · 강사진 카드는 스토어에서 빠지고 새로 살 수 없어요.
   * 클래스는 지우지 않고 판매 상태도 그대로라 다시 켜면 돌아와요. 이미 산 회원은 내 강의실에서 그대로 들어요 */
  const insOff = () => (Array.isArray(V().insOff) ? V().insOff : []);
  // showOff: 강사 노출을 꺼 둔 강사라도 이 상품만은 스토어에 보여요 (예: 강의는 다른 플랫폼 계약이라 숨기고, 종이책은 팔 때)
  const insShown = (p) => !p || !!p.showOff || insOff().indexOf(tkey(p)) < 0;
  /** 강사별 정산 비율 (마스터 › 주문 · 매출 · 정산 › 강사별 비율 · 가격에서 강사와 조율해 확정) — 키는 두잉고 강사 iid, 두잉고 계정이 없으면 "ext:이름" */
  const insRate = (key) => (key && V().insRates && V().insRates[key]) || null;
  const rateNum = (r, k) => (r && r[k] != null && r[k] !== "" && Number(r[k]) >= 0 ? Number(r[k]) : null);
  /* 정산 비율 종류: 강사별 · 종류별로 마스터가 정해요 (기본 강사 5 : 플랫폼 5). 1년 연장권은 VOD 강의 비율 */
  const RATE_KEYS = [["vod", "VOD 강의", "수강권 · 1년 연장권"], ["ebook", "전자책", "PDF 전자책"], ["book", "종이책", "택배로 보내는 종이책 (배송비 제외)"], ["live", "LIVE · 오프라인", "유료 LIVE · 오프라인 강의"], ["coach", "1:1 코칭권", "강사님이 직접 답하는 코칭권"], ["tea", "TEA TIME", "강사님과 Zoom 만남"]];
  const pct01 = (v) => (v != null && v !== "" && Number(v) >= 0 && Number(v) <= 100 ? Number(v) : null);
  /** 기본 비율 (마스터 설정 · 비우면 VOD 50 · 코칭 · TEA TIME 은 예전 ‘부가 상품’ 칸) */
  function rateDef(k) {
    const st = STG(), d = st.rates || {};
    let n = pct01(d[k]);
    if (n == null && k !== "coach" && k !== "tea") n = pct01(st.share);
    if (n == null && (k === "coach" || k === "tea")) n = pct01(st.addonShare);
    return n == null ? 50 : n;
  }
  // 한 번의 확정에서 그 종류 비율 (예전 확정은 vod · addon 두 칸뿐이라 그 값으로)
  function entryRate(e, k) {
    if (!e) return null;
    let n = pct01(e[k]);
    if (n == null && k === "book") n = pct01(e.ebook);
    if (n == null && (k === "ebook" || k === "live" || k === "book")) n = pct01(e.vod);
    if (n == null && (k === "coach" || k === "tea")) n = pct01(e.addon);
    return n;
  }
  // 적용 시작일 (예전 확정 · 처음 기본 계약은 시작일이 없어 처음부터)
  const entryFrom = (e) => Number(e && e.from) || 0;
  /** 그 시각에 효력이 있던 비율 — 비율을 바꿔도 그 전에 결제한 주문은 그때 비율로 정산해요 (at 없으면 지금 · 적용 시작일이 아직 안 온 비율은 그날부터)
   * 시작일이 지난 확정 가운데 가장 나중에 확정한 것: 새로 확정하면 그 시작일부터 앞 확정을 덮어요 */
  function rateAt(key, k, at) {
    const r = insRate(key);
    if (!r) return rateDef(k);
    const t = at || Date.now();
    let use = null;
    (r.hist || []).concat([r]).forEach((e) => { if (e && entryFrom(e) <= t && (!use || (Number(e.at) || 0) >= (Number(use.at) || 0))) use = e; });
    const n = use ? entryRate(use, k) : null;
    return n == null ? rateDef(k) : n;
  }
  /** 적용 시작일이 아직 안 온 확정 (예정 비율 · 그날부터 이 숫자로 정산해요) */
  function rateNext(key) {
    const r = insRate(key);
    if (!r || !(entryFrom(r) > Date.now())) return null;
    const o = { from: entryFrom(r) };
    RATE_KEYS.forEach((x) => { const n = entryRate(r, x[0]); o[x[0]] = n == null ? rateDef(x[0]) : n; });
    return o;
  }
  /** 클래스 종류 → 비율 종류 */
  const rateKeyOfP = (p) => (typeOf(p) === "ebook" ? "ebook" : isBook(p) ? "book" : isEvent(p) ? "live" : "vod");
  /** 강의 판매 비율: 강의별 계약 → 강사 · 종류별 비율 → 기본(강사 50%) */
  const shareOf = (p) => { if (p.share != null && p.share !== "") return Number(p.share); return rateAt(tkey(p), rateKeyOfP(p), 0); };
  const monthsTxt = (d) => (d % 365 === 0 ? (d / 365 * 12) + "개월" : d % 30 === 0 ? (d / 30) + "개월" : d + "일");
  const accessTxt = (p) => (typeOf(p) === "ebook" ? "평생 소장" : isBook(p) ? "택배 배송 · " + shipFeeTxt(p) : isEvent(p) ? (p.replayDays ? "다시보기 " + p.replayDays + "일" : "1회 진행") : plansOf(p).length ? plansOf(p).map((x) => x.label).join(" · ") + " 수강권" : p.accessDays ? monthsTxt(p.accessDays) + " 시청" : "평생 소장");
  const accOf = (p) => (p.color && p.color[1]) || ACC[0];
  const pledgesOf = (pid) => V().pledges.filter((x) => x.pid === pid && !x.hidden).sort((a, b) => b.at - a.at);
  const isNewP = (p) => now() - (p.createdAt || 0) < 21 * 864e5;
  const isUpd = (p) => !!p.updatedAt && DB.date.diffDays(today(), p.updatedAt) <= 30;
  // 회원 · 세션 — 시안은 늘 체험 계정으로 로그인 (로그아웃하면 이 탭에서만 풀림)
  function me() {
    if (SRV()) { const r = DB.remote.me, sid = r && r.vod && r.vod.mid, sm = sid ? V().members.find((x) => x.id === sid) || null : null; return sm && !sm.blocked ? sm : null; }
    let id = ls.get(KEY_ME);
    if (!id && !ss.get(KEY_OUT) && V().members.some((m) => m.id === "vm-demo")) { id = "vm-demo"; ls.set(KEY_ME, id); }
    const m = id ? V().members.find((x) => x.id === id) || null : null;
    return m && !m.blocked ? m : null;
  }
  const setMe = (id) => { ls.set(KEY_ME, id || null); ss.set(KEY_OUT, id ? null : "1"); try { const s = DB.session.student(); if (s && s.vodMid && s.vodMid !== id) DB.session.setStudent(null); } catch (e) {} };
  function ownOrder(mid, pid) { return V().orders.find((o) => o.mid === mid && o.pid === pid && o.status === "paid" && isAccess(o)) || null; }
  const pendOrder = (mid, pid) => (mid ? V().orders.find((o) => o.mid === mid && o.pid === pid && o.status === "pending" && isAccess(o)) || null : null);
  function owns(mid, pid) { return accessEnd(mid, pid) > now(); }
  /* ---------- 수강권 · 부가 상품 (격차 방식) ----------
   * VOD 유료 강의는 수강권 기간을 골라서 사요: 180일 · 365일(추천) · 3년. 클래스마다 가격을 정하고, 비우면 180일 판매가 × 1.1 · × 1.2 (천 원 단위)
   * 부가 상품: 1:1 코칭권 (횟수 · 사용 기간 · 가격) · 강사님과 TEA TIME (시간 · 가격) · 기간이 끝난 강의는 1년 연장권 (365일 가격의 50%)
   * 주문 kind: course(수강권) · extend(1년 연장권) · coach(1:1 코칭권) · tea(TEA TIME). 예전 주문은 kind 없이 course로 봐요 */
  const PLAN_DAYS = [[180, "180일", 1], [365, "365일", 1.1], [1095, "3년", 1.2]];
  const r1k = (n) => Math.round(n / 1000) * 1000;
  const planLabel = (d) => { const x = PLAN_DAYS.find((y) => y[0] === Number(d)); return x ? x[1] : monthsTxt(Number(d) || 0); };
  function plansOf(p) {
    if (!p || typeOf(p) !== "vod" || priceOf(p) === 0) return [];
    const cfg = p.plans || {}, base = priceOf(p), list0 = Number(p.price) || base, eb = ebOf(p), er = eb ? eb.price / basePrice(p) : 1;
    return PLAN_DAYS.map((x) => { const c = cfg[x[0]] || {}; if (c.on === false) return null; const sale = c.price != null && c.price !== "" ? (eb ? r1k(Number(c.price) * er) : Number(c.price)) : r1k(base * x[2]); return { d: x[0], label: x[1], sale, list: Math.max(sale, r1k(list0 * x[2])), day: Math.round(sale / x[0]) }; }).filter(Boolean);
  }
  const defPlan = (p) => { const ps = plansOf(p); return ps.find((x) => x.d === 365) || ps[0] || null; };
  const planOf = (p, d) => plansOf(p).find((x) => x.d === Number(d)) || defPlan(p);
  const y365 = (p) => plansOf(p).find((x) => x.d === 365) || null;
  const STG = () => V().settings;
  function coachOf(p) {
    if (!p || typeOf(p) !== "vod" || priceOf(p) === 0 || !dgOpen(p)) return null;
    const c = p.coach || {}, d = STG().coach || {};
    if (c.on === false) return null;
    const n = Number(c.n) || Number(d.n) || 5, days = Number(c.days) || Number(d.days) || 180, price = c.price != null && c.price !== "" ? Number(c.price) : Number(d.price) || 150000;
    return { n, days, price, per: Math.round(price / n / 100) * 100 };
  }
  const TEA_MODE = { online: "온라인 화상 (Zoom)", offline: "오프라인 만남", both: "온라인 · 오프라인 중 선택" };
  function teaOf(p) {
    if (!p || typeOf(p) !== "vod" || priceOf(p) === 0 || !dgOpen(p)) return null;
    const t = p.tea || {}, d = STG().tea || {};
    if (t.on === false) return null;
    // TEA TIME 은 Zoom(온라인 화상)으로만 진행해요 — 예전 오프라인 · 선택 설정도 Zoom 으로
    return { min: Number(t.min) || Number(d.min) || 60, price: t.price != null && t.price !== "" ? Number(t.price) : Number(d.price) || 99000, mode: "online" };
  }
  const extendPct = () => { const n = Number(STG().extendPct); return n > 0 && n <= 100 ? n : 50; };
  function extendOf(p) { const y = y365(p) || defPlan(p); return y ? { d: 365, sale: r1k(y.sale * extendPct() / 100), list: y.sale } : null; }
  const addonShare = (iid) => rateAt(iid, "coach", 0);
  /** 광고비 강사 분담 비율 (기본 50% · 강사 5 : 플랫폼 5) */
  const adSplitOf = (iid) => { const r = rateNum(insRate(iid), "ad"); if (r != null) return r; const v = STG().adSplit, n = Number(v); return v != null && v !== "" && n >= 0 && n <= 100 ? n : 50; };
  /** 그 달 이 강사 VOD에 쓴 광고비 (마스터가 실제 집행액을 적어요) */
  const adOf = (iid, ym) => (V().adSpend || []).filter((x) => x.iid === iid && x.ym === ym);
  /** 강사 화면에 보여 줄 지금 비율 (빈 칸은 기본값으로 채워서) */
  const rateOf = (key) => { const r = insRate(key) || {}, o = { addon: rateAt(key, "coach", 0), ad: adSplitOf(key), memo: r.memo || "", at: r.at || 0, from: r.from || r.at || 0, by: r.by || "", hist: r.hist || [], next: rateNext(key) }; RATE_KEYS.forEach((x) => { o[x[0]] = rateAt(key, x[0], 0); }); return o; };
  const KIND = { course: "수강권", extend: "1년 연장권", coach: "1:1 코칭권", tea: "TEA TIME" };
  const kindOf = (o) => (o && KIND[o.kind] ? o.kind : "course");
  const isAccess = (o) => kindOf(o) === "course" || kindOf(o) === "extend";
  /* ---------- 정산 비율 (v16) ----------
   * 기본: VOD 판매 강사 50% : 플랫폼 50% (촬영 · 편집 · 스튜디오 · 장비 · 운영은 플랫폼이 맡고, 강사는 강의 자료(PPT)를 준비)
   * 광고비: 마스터가 달마다 실제 집행액을 적고, 강사 50% : 플랫폼 50%로 나눠 강사 몫은 그 달 정산에서 빼요
   * 강사와 따로 조율한 비율은 마스터가 강사별로 확정 → 강사센터 › 판매 정산에 그대로 보여요. 강의별 계약 비율이 있으면 그게 먼저
   * 기준액 = 할인 전 판매가 ÷ 1.1(공급가액). 플랫폼 쿠폰 · 포인트 할인과 결제 수수료(PG)는 플랫폼이 부담해요
   * 유입 경로(강사 링크 · 광고 · 플랫폼)는 판매 분석용으로 주문에 남지만, 비율은 바꾸지 않아요 */
  const SH_DEF = { share: 50, shareIns: 50, shareAd: 50, launchShare: 50, launchDays: 0 };
  const shSet = (k) => { const v = STG()[k], n = Number(v); return v != null && v !== "" && n >= 0 ? n : SH_DEF[k]; };
  const ATTR = "dc:attr", ATTR_DAYS = 7;
  function catchAttr() {
    const qs = new URLSearchParams(ROUTE.hash.split("?")[1] || ""), by = qs.get("by"), um = String(qs.get("utm_medium") || "").toLowerCase();
    try {
      if (by && /^[\w-]{1,40}$/.test(by)) localStorage.setItem(ATTR, JSON.stringify({ ch: "ins", iid: by, at: now() }));
      else if (/^(ad|ads|paid|cpc|cpm|display|paid_social)$/.test(um)) localStorage.setItem(ATTR, JSON.stringify({ ch: "ad", at: now() }));
      const us = String(qs.get("utm_source") || "").toLowerCase().replace(/[^\w.-]/g, "").slice(0, 30);
      if ((us || by) && !localStorage.getItem(SRC_KEY)) localStorage.setItem(SRC_KEY, JSON.stringify({ s: us || "ins", c: String(qs.get("utm_campaign") || "").slice(0, 40), m: um.slice(0, 20), by: by && /^[\w-]{1,40}$/.test(by) ? by : "", at: now() }));
    } catch (e) {}
  }
  // 회원 DB: 가입할 때 처음 들어온 경로를 남기고 지워요 · 광고성 정보 수신 동의는 언제 · 어디서 · 무엇을 동의했는지 기록해요
  function takeSrc() { let x = null; try { x = JSON.parse(localStorage.getItem(SRC_KEY) || "null"); localStorage.removeItem(SRC_KEY); } catch (e) {} return x && x.s ? x : { s: "direct", at: now() }; }
  function consentOf(on, at, how) { const t = at || now(); return { mkt: !!on, ch: on ? ["sms", "email", "kakao"] : [], night: false, at: t, log: [{ at: t, on: !!on, how: how || "가입" }] }; }
  const CH3 = [["sms", "문자"], ["email", "이메일"], ["kakao", "카카오톡"]];
  const chOn = (m, k) => (m.consent ? !!m.consent.mkt && (m.consent.ch || []).indexOf(k) >= 0 : !!m.marketing);
  function setConsent(m, f) {
    const c = m.consent || consentOf(m.marketing, m.createdAt), on = !!f.mkt.checked, pick = CH3.map((x) => x[0]).filter((k) => f["ch_" + k] && f["ch_" + k].checked), ch = on ? (pick.length ? pick : CH3.map((x) => x[0])) : [], night = on && !!(f.night && f.night.checked);
    if (c.mkt !== on || String(c.ch || []) !== String(ch) || !!c.night !== night) { if (on && !c.mkt) c.at = now(); if (!on && c.mkt) c.offAt = now(); c.log = (c.log || []).concat([{ at: now(), on, ch, night, how: "마이페이지" }]).slice(-20); Object.assign(c, { mkt: on, ch, night }); }
    m.consent = c; m.marketing = on;
  }
  // 로그인한 회원이 스토어를 쓰는 동안 마지막 방문 시각을 남겨요 (1시간에 한 번) — 회원 DB ‘최근 활동’ · 이탈 위험 계산에 써요
  function touchSeen() { const id = ls.get(KEY_ME); if (!id) return; const m = V().members.find((x) => x.id === id); if (m && (!m.seenAt || now() - m.seenAt > 36e5)) { m.seenAt = now(); save(); } }
  function chOf(p) {
    let a = null; try { a = JSON.parse(localStorage.getItem(ATTR) || "null"); } catch (e) {}
    if (!a || !(now() - a.at < ATTR_DAYS * 864e5)) return "web";
    return a.ch === "ins" ? (p && p.iid && a.iid === p.iid ? "ins" : "web") : a.ch === "ad" ? "ad" : "web";
  }
  // 새 클래스 오픈 프로모션: 처음 ‘판매 중’이 된 날(openedAt)부터 정해진 날 동안
  const launchOn = (p, at) => { const d = shSet("launchDays"); return d > 0 && !!p && !!p.openedAt && (at || now()) - p.openedAt < d * 864e5; };
  function shareFor(p, ch, addon) {
    return addon ? addonShare(p && p.iid) : shareOf(p);
  }
  const CH_TXT = { web: "플랫폼 유입", ins: "강사 링크", ad: "플랫폼 광고", addon: "1:1 코칭 · TEA TIME" };
  const baseOf = (o) => Math.max(0, Number(o.sale != null ? o.sale : o.amount) || 0);
  const supplyOf = (o) => Math.round(baseOf(o) / 1.1);
  /** 주문 → 비율 종류 · 강사 키 */
  const rateKeyOf = (o) => { const k = kindOf(o); return k === "coach" ? "coach" : k === "tea" ? "tea" : rateKeyOfP(product(o.pid) || {}); };
  const keyOfOrder = (o) => { const p = product(o.pid) || {}; return o.iid || p.iid || (p.creator ? "ext:" + p.creator : ""); };
  /** 주문 정산 비율: 주문에 남은 비율 → 강의별 계약(수강권) → 결제한 때의 강사 · 종류별 비율 */
  const shareVal = (o) => {
    if (o.share != null && o.share !== "") return Number(o.share);
    const p = product(o.pid) || {};
    if (isAccess(o) && p.share != null && p.share !== "") return Number(p.share);
    return rateAt(keyOfOrder(o), rateKeyOf(o), o.paidAt || o.at || 0);
  };
  /* 정산 · 세금계산서 기준 (마스터 › 강사별 비율 · 가격)
   *  gross  판매가(부가세 포함) × 비율 = 정산액. 사업자 강사는 판매가 합계로 두고홀딩스에 세금계산서, 두고홀딩스는 수수료 · 광고비 분담을 강사에게 세금계산서 (예: 100만 원 · 60% → 60만 원 지급)
   *  net    판매가(부가세 포함) × 비율 = 정산액. 사업자 강사는 정산액(부가세 포함)으로 세금계산서
   *  supply 예전 방식: 공급가액(판매가 ÷ 1.1) × 비율 + 사업자는 부가세 10% 더해 지급 */
  const TAX_MODES = { gross: "판매 총액 세금계산서 (기본)", net: "정산액 세금계산서", supply: "공급가액 기준 (예전 방식)" };
  /* 환불 받을 계좌의 은행 — 포트원 표준 은행 코드(가상계좌 환불에 그대로 보내요) · 화면 이름 */
  const BANKS = [["KOOKMIN", "국민은행"], ["SHINHAN", "신한은행"], ["WOORI", "우리은행"], ["HANA", "하나은행"], ["NONGHYUP", "NH농협은행"], ["LOCAL_NONGHYUP", "지역농축협"], ["IBK", "기업은행"], ["KAKAO", "카카오뱅크"], ["TOSS", "토스뱅크"], ["K_BANK", "케이뱅크"], ["KDB", "산업은행"], ["SUHYUP", "수협은행"], ["POST", "우체국"], ["KFCC", "새마을금고"], ["SHINHYUP", "신협"], ["SAVINGS_BANK", "저축은행"], ["BUSAN", "부산은행"], ["KYONGNAM", "경남은행"], ["DAEGU", "아이엠뱅크(대구)"], ["KWANGJU", "광주은행"], ["JEONBUK", "전북은행"], ["JEJU", "제주은행"], ["STANDARD_CHARTERED", "SC제일은행"], ["CITI", "한국씨티은행"], ["NFCF", "산림조합"]];
  const bankName = (code) => (BANKS.find((x) => x[0] === code) || [code, code || ""])[1];
  /** 환불 계좌 칸 (회원 환불 요청 · 마스터 환불 창 같이) */
  const acctFields = (a, pre) => { a = a || {}; pre = pre || "ra"; return '<div class="ra-f"><select name="' + pre + 'Bank" aria-label="은행"><option value="">은행 고르기</option>' + BANKS.map((x) => '<option value="' + x[0] + '"' + (a.bank === x[0] ? " selected" : "") + ">" + x[1] + "</option>").join("") + '</select><input name="' + pre + 'No" inputmode="numeric" maxlength="30" placeholder="계좌번호 (- 없이)" value="' + esc(a.number || "") + '" aria-label="계좌번호"><input name="' + pre + 'Holder" maxlength="20" placeholder="예금주" value="' + esc(a.holder || "") + '" aria-label="예금주"></div>'; };
  /** 환불 계좌 읽기 → { bank, number, holder } 또는 오류 문구 */
  const acctRead = (f, pre) => { pre = pre || "ra"; const g = (n) => String((f.elements.namedItem(pre + n) || {}).value || "").trim(); const a = { bank: g("Bank"), number: g("No").replace(/[^0-9]/g, ""), holder: g("Holder").replace(/\s+/g, " ") };
    if (!a.bank || !BANKS.some((x) => x[0] === a.bank)) return { err: "환불 받을 은행을 골라 주세요." };
    if (a.number.length < 8 || a.number.length > 20) return { err: "계좌번호를 숫자로 정확히 적어 주세요." };
    if (!a.holder) return { err: "예금주 이름을 적어 주세요." };
    return { acct: a }; };
  const taxMode = () => (TAX_MODES[STG().taxMode] ? STG().taxMode : "gross");
  const insAmt = (o) => Math.floor((taxMode() === "supply" ? supplyOf(o) : baseOf(o)) * shareVal(o) / 100 / 10) * 10;
  function optTxt(o) {
    const k = kindOf(o);
    if (k === "coach") return "1:1 코칭권 " + ((o.coach || {}).n || 0) + "회 · " + ((o.coach || {}).days || 0) + "일";
    if (k === "tea") return "강사님과 TEA TIME " + ((o.tea || {}).min || 60) + "분";
    if (k === "extend") return "1년 연장권 · 365일";
    if (o.ship) return "종이책 " + (Number(o.qty) || 1) + "권" + (o.shipFee ? " · 배송비 " + won(o.shipFee) : " · 무료배송");
    return o.days ? planLabel(o.days) + " 수강권" : "";
  }
  /** 이 회원이 이 강의를 볼 수 있는 마지막 시각: 수강권 + 연장권을 이어 붙여 계산 (기간 없는 강의 Infinity · 산 적 없으면 0) */
  function accessEnd(mid, pid) {
    const p = product(pid); if (!mid || !p) return 0;
    const os = V().orders.filter((o) => o.mid === mid && o.pid === pid && o.status === "paid" && isAccess(o)).sort((a, b) => a.paidAt - b.paidAt);
    if (!os.length) return 0;
    if (typeOf(p) !== "vod") return Infinity;
    let end = 0;
    for (const o of os) { const d = Number(o.days) || (kindOf(o) === "extend" ? 365 : Number(p.accessDays) || 0); if (!d) return Infinity; end = Math.max(end, o.paidAt) + d * 864e5; }
    return end;
  }
  const hadCourse = (mid, pid) => !!mid && V().orders.some((o) => o.mid === mid && o.pid === pid && o.status === "paid" && isAccess(o));
  const daysLeft = (mid, pid) => { const e = accessEnd(mid, pid); return e === Infinity ? Infinity : Math.ceil((e - now()) / 864e5); };
  /** 연장권은 기간이 끝났거나 30일 안으로 남았을 때 살 수 있어요 */
  const canExtend = (mid, pid) => { const p = product(pid); return !!p && !!extendOf(p) && hadCourse(mid, pid) && daysLeft(mid, pid) <= 30; };
  /** 1:1 코칭권: 이 회원이 이 강사에게 쓸 수 있는 코칭권들 (사용 기간 안 · 끝나는 순) */
  function coachPasses(mid, iid) {
    return V().orders.filter((o) => o.mid === mid && o.status === "paid" && kindOf(o) === "coach" && o.coach && (product(o.pid) || {}).iid === iid)
      .map((o) => ({ o, end: o.paidAt + (Number(o.coach.days) || 180) * 864e5, left: Math.max(0, (Number(o.coach.n) || 0) - (Number(o.coach.used) || 0)) }))
      .filter((x) => x.end > now()).sort((a, b) => a.end - b.end);
  }
  const coachLeft = (mid, iid) => (mid ? coachPasses(mid, iid).reduce((a, x) => a + x.left, 0) : 0);
  /** 1:1 코칭 질문을 남기면 가장 먼저 끝나는 코칭권에서 1회 차감 */
  function useCoach(mid, iid, qid) { const x = coachPasses(mid, iid).find((y) => y.left > 0); if (!x) return false; x.o.coach.used = (Number(x.o.coach.used) || 0) + 1; (x.o.coach.qs = x.o.coach.qs || []).push(qid); save(); return true; }
  /** 코칭 질문 취소(답변 전 삭제) 시 돌려주기 */
  function giveBackCoach(mid, qid) { const o = V().orders.find((x) => x.mid === mid && kindOf(x) === "coach" && x.coach && (x.coach.qs || []).indexOf(qid) >= 0); if (!o) return; o.coach.qs.splice(o.coach.qs.indexOf(qid), 1); o.coach.used = Math.max(0, (Number(o.coach.used) || 0) - 1); save(); }
  /** TEA TIME: 회원(또는 강사)별 신청 내역. tea.st: req(확정 대기) · ok(일정 확정) · done(진행 완료) · cancel(취소) */
  const teasOf = (mid, iid) => V().orders.filter((o) => (!mid || o.mid === mid) && kindOf(o) === "tea" && o.tea && (o.status === "paid" || o.status === "pending") && (!iid || (product(o.pid) || {}).iid === iid)).sort((a, b) => b.at - a.at);
  const teaWhen = (t) => { if (!t || !t.when) return ""; const d = new Date(t.when); return isNaN(d) ? t.when : DB.date.fmtFull(DB.date.toStr(d)) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  function teaStTxt(o) {
    const t = o.tea || {};
    if (o.status === "pending") return "입금이 확인되면 강사님께 전달돼요";
    if (t.st === "ok") return "일정 확정 · " + teaWhen(t) + (t.where ? " · " + t.where : "");
    if (t.st === "done") return "진행 완료 · " + (teaWhen(t) || "");
    if (t.st === "cancel") return "취소됐어요";
    return "강사님 확인 중 · 희망 " + [t.d1, t.d2].filter(Boolean).map((d) => DB.date.fmtMD ? DB.date.fmtMD(d) : d).join(" / ") + (t.slot ? " " + t.slot : "");
  }
  const TEA_ST = { req: ["확정 대기", "warn"], ok: ["일정 확정", "ok"], done: ["진행 완료", "mute"], cancel: ["취소", "mute"] };
  // 커피잔 · 수강권 아이콘 (icons.js에 없는 것만 여기서)
  const ICX = { coffee: '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M6 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/>', ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>' };
  const icx = (n, cls) => '<svg class="icon ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICX[n] || "") + "</svg>";
  const prog = (mid, pid) => { const v = V(); v.progress[mid] = v.progress[mid] || {}; return (v.progress[mid][pid] = v.progress[mid][pid] || { done: {}, last: "" }); };
  const pctDone = (mid, pid) => { const p = product(pid), lz = p ? lessons(p) : []; if (!lz.length) return 0; const d = prog(mid, pid).done; return Math.round(lz.filter((l) => d[l.id]).length / lz.length * 100); };
  /* ---------- 두잉고 VOD 버전 연결 ----------
   * DOOGO CLASS에서 강사의 VOD(type vod)를 산 회원은 그 강사의 두잉고 ‘VOD 버전’을 써요 (교재 · 업데이트 소식 · 질문 · 체크리스트).
   * 처음 들어올 때 두잉고 수강생 기록(track: "vod", 가상 기수 vod:강사ID)을 만들고, 수강 기간이 끝나거나 환불하면 VOD 버전도 닫혀요 */
  const dgIns = (p) => { const ins = p && p.iid && DB.instructor ? DB.instructor(p.iid) : null; return ins && ins.status === "active" ? ins : null; };
  const dgOpen = (p) => !!p && typeOf(p) === "vod" && p.dg !== false && !!dgIns(p);
  const last4 = (ph) => String(ph || "").replace(/\D/g, "").slice(-4);
  /** 이 회원이 지금 볼 수 있는 이 강사의 VOD 주문들 ({ o, p }) */
  function vodOrdersOf(mid, iid) {
    const seen = {};
    return V().orders.filter((o) => o.mid === mid && o.status === "paid").sort((a, b) => b.paidAt - a.paidAt).map((o) => ({ o, p: product(o.pid) }))
      .filter((x) => x.p && x.p.iid === iid && dgOpen(x.p) && owns(mid, x.p.id) && !seen[x.p.id] && (seen[x.p.id] = 1));
  }
  const vodAccess = (mid, iid) => !!mid && vodOrdersOf(mid, iid).length > 0;
  /** 강사별 VOD 구매자: 두잉고 입장 여부 · 진도 · 최근 공부한 날 */
  function buyersOf(iid) {
    const v = V(), by = {};
    v.orders.forEach((o) => { if ((o.status !== "paid" && o.status !== "refunded") || !isAccess(o)) return; const p = product(o.pid); if (!p || p.iid !== iid || typeOf(p) !== "vod") return; (by[o.mid] = by[o.mid] || []).push({ o, p }); });
    const sts = DB.vodStudentsOf ? DB.vodStudentsOf(iid) : [];
    return Object.keys(by).map((mid) => {
      const m = v.members.find((x) => x.id === mid); if (!m) return null;
      const list = by[mid], paid = list.filter((x) => x.o.status === "paid").filter((x, i, arr) => arr.findIndex((y) => y.p.id === x.p.id) === i), live = paid.filter((x) => owns(mid, x.p.id));
      const study = (v.studyLog || {})[mid] || {};
      return { m, list, paid, live, st: sts.find((s) => s.vodMid === mid) || null, active: live.length > 0, refunded: !paid.length,
        pct: paid.length ? Math.round(paid.reduce((a, x) => a + pctDone(mid, x.p.id), 0) / paid.length) : 0,
        paidAt: Math.max.apply(null, list.map((x) => x.o.paidAt || x.o.at || 0)), lastStudy: Object.keys(study).sort().pop() || "" };
    }).filter(Boolean).sort((a, b) => b.paidAt - a.paidAt);
  }
  /** 두잉고 수강생 기록 (없으면 만들고, 있으면 이름 · 뒷자리를 스토어 회원 정보에 맞춘다) */
  function dgStudent(m, iid) {
    const list = DB.data.students;
    let s = list.find((x) => x.instructorId === iid && x.vodMid === m.id);
    if (!s) { s = { id: DB.uid("vs"), instructorId: iid, cohortId: DB.vodCohortId(iid), track: "vod", name: m.name, phone4: last4(m.phone), status: "approved", appliedAt: today(), vodMid: m.id, source: "doogoclass", joinedAt: now() }; list.push(s); }
    else { s.name = m.name; s.phone4 = last4(m.phone) || s.phone4; if (s.status === "pending") s.status = "approved"; }
    DB.save();
    return s;
  }
  /** 두잉고 로그인 화면: 이름 + 뒷자리로 이 강사의 VOD 구매자 찾기 → { s } · { expired } · null */
  function findBuyer(iid, name, phone4) {
    const n = (x) => String(x || "").replace(/\s+/g, "");
    const hits = V().members.filter((x) => !x.blocked && n(x.name) === n(name) && last4(x.phone) === phone4);
    const ok = hits.find((x) => vodAccess(x.id, iid));
    if (ok) return { s: dgStudent(ok, iid) };
    if (hits.some((x) => V().orders.some((o) => o.mid === x.id && (o.status === "paid" || o.status === "refunded") && (product(o.pid) || {}).iid === iid && typeOf(product(o.pid)) === "vod"))) return { expired: true };
    return null;
  }
  /** 스토어 → ‘강사 두잉고 열기’: 두잉고 수강생으로 로그인해서 그 강사의 VOD 버전 홈으로 */
  function enterDg(pid, lid, to) {
    const m = me(), p = product(pid);
    if (!m || !p || !dgOpen(p) || !owns(m.id, pid)) { toast("이 VOD를 구매한 회원만 들어갈 수 있어요.", "warn"); return; }
    if (SRV()) {
      payApi("dg", { iid: p.iid }).then((r) => {
        if (!r || !r.ok) { toast((r && r.message) || "강의실에 들어가지 못했어요. 잠시 후 다시 시도해 주세요.", "warn"); return; }
        return DB.remote.refresh().then(() => { DB.session.setInstructorPick(p.iid); DB.session.setStudent({ id: r.sid, at: now(), vpid: p.id }); ROUTE.hash = to && /^#\/(qna|home|vodclass)/.test(to) ? to : "#/vodclass/" + encodeURIComponent(pid) + (lid ? "/" + encodeURIComponent(lid) : ""); });
      });
      return;
    }
    const s = dgStudent(m, p.iid);
    if (s.status === "withdrawn") { toast("강사님이 두잉고 이용을 멈춘 계정이에요. 고객센터로 문의해 주세요.", "warn"); return; }
    DB.session.setInstructorPick(p.iid); DB.session.setStudent({ id: s.id, at: now(), vpid: p.id });
    ROUTE.hash = to && /^#\/(qna|home|vodclass)/.test(to) ? to : "#/vodclass/" + encodeURIComponent(pid) + (lid ? "/" + encodeURIComponent(lid) : "");
  }
  /** 스토어 화면에 넣는 ‘강사 두잉고’ 안내 카드 */
  function dgCard(p, cls) {
    if (!dgOpen(p)) return "";
    const ins = dgIns(p), c = DB.content(ins.id) || {}, nm = (c.brand && c.brand.instructor) || p.creator;
    return '<div class="vd-dg ' + (cls || "") + '"><span class="vd-dg-ic">' + (window.doinggoB ? window.doinggoB("black", "vd-dg-logo") : "두잉고") + '</span><div class="vd-dg-t"><b>' + esc(nm) + ' 강사 두잉고 강의실 <em>VOD</em></b><small>강의 영상 · 교재 · 업데이트 소식 · 실습 체크리스트를 한 곳에서 봐요</small></div>' +
      '<button type="button" class="vd-btn vd-btn-dark vd-btn-sm" data-v="dg" data-p="' + esc(p.id) + '">강의실 입장' + icon("arrowRight", "xs") + "</button></div>";
  }
  const liked = (mid, pid) => !!mid && (V().likes[mid] || []).indexOf(pid) >= 0;
  // 찜 수: 서버 모드에서는 서버가 세어 둔 수(stat)에 내가 방금 누른 것을 바로 더해 보여 줘요 — 서버 수가 바뀌면(내 찜이 반영되면) 서버 수 그대로
  const likeAdj = {};
  const likeSrv = (id) => Number((stat().likes || {})[id]) || 0;
  const likeCount = (p) => {
    const base = Number(p.likeBase) || 0;
    if (!SRV()) return base + Object.keys(V().likes).filter((k) => (V().likes[k] || []).indexOf(p.id) >= 0).length;
    const s = likeSrv(p.id), a = likeAdj[p.id];
    if (a && a.s !== s) delete likeAdj[p.id];
    return base + Math.max(0, s + (likeAdj[p.id] ? likeAdj[p.id].d : 0));
  };
  function likeBump(id, on) {
    if (!SRV()) return;
    const s = likeSrv(id), a = likeAdj[id], d = (a && a.s === s ? a.d : 0) + (on ? 1 : -1);
    if (d) likeAdj[id] = { s, d }; else delete likeAdj[id];
  }
  const likeTxt = (n) => (n >= 10 ? Math.floor(n / 10) * 10 + "+" : String(n));
  const nextNo = () => { const d = new Date(), ymd = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0"); return "DC" + ymd + String(V().orders.length + 1).padStart(3, "0") + String(Math.floor(Math.random() * 90 + 10)); };
  /** 결제 수단 [값, 아이콘, 이름, 막힌 이유] — 정식 서버: 포트원 채널이 있는 것만 · 무통장은 계좌를 넣었을 때만 */
  function payOpts() {
    const L = [["card", "coins", "신용 · 체크카드"], ["kakao", "message", "카카오페이"], ["toss", "coins", "토스페이"], ["bank", "building", "무통장 입금"]];
    if (!SRV()) return L;
    const ch = (CFG && CFG.portone && CFG.portone.channels) || {}, bk = bankInfo().real;
    const extra = [ch.transfer ? ["transfer", "building", "실시간 계좌이체"] : null, ch.vbank ? ["vbank", "building", "가상계좌"] : null].filter(Boolean);
    if (extra.length) L.splice(3, 0, ...extra);
    return L.map((z) => z[0] === "bank" ? (bk ? z : z.concat("준비 중")) : ch[z[0]] ? z : z.concat("PG 심사 중")).filter((z) => !(z[3] && z[0] !== "card" && z[0] !== "bank"));
  }
  /** 무통장 계좌: VOD 설정 → 비어 있으면 기수 입금 계좌. real = 실제로 넣은 계좌 (정식 서버는 이때만 무통장을 열어요) */
  const bankInfo = () => {
    const s = V().settings || {}, b = DB.billingInfo ? DB.billingInfo() : {}, x = s.bank && s.account ? s : b.bank && b.account ? b : null;
    if (x) return { bank: x.bank, account: x.account, holder: x.holder || s.holder || b.holder || "(주)두고홀딩스", real: true };
    return SRV() ? { bank: "", account: "", holder: "", real: false } : { bank: "국민은행", account: "000000-00-000000", holder: "(주)두고홀딩스", real: false };
  };
  /** 주문에 남긴 계좌(주문할 때 안내한 그대로) → 없으면 지금 계좌 · 입금 기한 */
  const bankOf = (o) => (o && o.vbank && o.vbank.account ? { real: true, vbank: true, bank: bankName(o.vbank.bank), account: o.vbank.account, holder: o.vbank.holder || "" } : o && o.bankTo && o.bankTo.account ? Object.assign({ real: true }, o.bankTo) : bankInfo());
  const dueOf = (o) => (o && o.dueAt) || (o ? o.at + (Number(V().settings.payDays) || 3) * 864e5 : 0);
  const bankAuto = () => !!(CFG && CFG.bankAuto);
  const fmtDue = (t) => { const d = new Date(t); return DB.date.fmtFull(DB.date.toStr(d)) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  // 쿠폰: 회원이 가진 쿠폰(memberCoupons) → 원본(coupons). 상태는 쓸 수 있음 · 사용 완료 · 기간 만료
  /* ---------- 수업 자료 파일 저장 ----------
   * 시안: 강사 · 마스터가 올린 파일을 이 브라우저(IndexedDB)에 저장하고 lesson.files 에 { name, url: "idb:아이디", size(KB) } 로 남겨요.
   * 정식 서버: 같은 자리에 파일 저장소 주소(https://…)가 들어가요. 수강생 화면은 url 만 보고 내려받기를 처리해요 */
  const MAT_MAX = 20 * 1024 * 1024;
  let idbP = null;
  const idb = () => idbP || (idbP = new Promise((ok, no) => { if (!window.indexedDB) { no(new Error("no-idb")); return; } const r = indexedDB.open("doinggo-files", 1); r.onupgradeneeded = () => r.result.createObjectStore("f"); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }));
  const SRV_MAT_MAX = 3 * 1024 * 1024;
  const asDataUrl = (file) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result || "")); r.onerror = () => no(r.error); r.readAsDataURL(file); });
  /** 파일 올리기 — 시안: 이 브라우저(IndexedDB) · 정식 서버: 서버 파일 저장소(/api/file). scope: pub(사진) · vodp:<클래스>(수업 자료 · 산 회원만) · adm(서류 · 운영자만) */
  async function matPut(file, scope) {
    if (SRV()) {
      if (file.size > SRV_MAT_MAX) throw new Error("big");
      const r = await fetch("/api/file", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: await asDataUrl(file), scope: scope || "pub" }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.url) throw new Error((j && j.error) || "upload");
      return { name: file.name, url: j.url, size: Math.max(1, Math.round(file.size / 1024)), at: Date.now() };
    }
    if (file.size > MAT_MAX) throw new Error("big");
    const db = await idb(), id = DB.uid("mf");
    await new Promise((ok, no) => { const tx = db.transaction("f", "readwrite"); tx.objectStore("f").put(file, id); tx.oncomplete = () => ok(); tx.onerror = () => no(tx.error); });
    return { name: file.name, url: "idb:" + id, size: Math.max(1, Math.round(file.size / 1024)), at: Date.now() };
  }
  async function matGet(id) { const db = await idb(); return new Promise((ok, no) => { const r = db.transaction("f").objectStore("f").get(id); r.onsuccess = () => ok(r.result || null); r.onerror = () => no(r.error); }); }
  /** mode: "dl" 내려받기 · "view" 새 창에서 열기 */
  async function matOpen(f, mode) {
    if (!f || !f.url) return false;
    let href = f.url, tmp = null;
    if (/^idb:/.test(f.url)) { const b = await matGet(f.url.slice(4)).catch(() => null); if (!b) return false; href = tmp = URL.createObjectURL(b); }
    const a = document.createElement("a"); a.href = href;
    if (mode === "dl") a.download = f.name || "수업자료"; else { a.target = "_blank"; a.rel = "noopener"; }
    document.body.appendChild(a); a.click(); a.remove();
    if (tmp) setTimeout(() => URL.revokeObjectURL(tmp), 60000);
    return true;
  }
  const PX = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==", IMGC = {};
  const imgAttr = (u, at) => (/^idb:/.test(u || "") ? at + '="' + (IMGC[u] || PX + '" data-idb="' + esc(u)) + '"' : at + '="' + esc(u || "") + '"');
  function hydrate(scope) {
    (scope || document).querySelectorAll("[data-idb]").forEach((el) => {
      const u = el.dataset.idb, put = (src) => { if (el.tagName === "SOURCE") el.srcset = src; else el.src = src; };
      el.removeAttribute("data-idb");
      if (IMGC[u]) { put(IMGC[u]); return; }
      matGet(u.slice(4)).then((b) => { if (!b) return; IMGC[u] = IMGC[u] || URL.createObjectURL(b); put(IMGC[u]); }).catch(() => {});
    });
  }
  /* 첫 화면 배너: 켜져 있고 노출 기간 안에 있는 것만 (이미지 배너는 이미지가 있어야) */
  const banLive = (b) => b.on !== false && (!b.from || today() >= b.from) && (!b.to || today() <= b.to) && (b.kind !== "img" || !!(b.pc || b.m));
  // 첫 화면 배너: 꺼진 판매 영역(LIVE · 오프라인 / 무료 강의)으로 이어지는 배너는 쉬어요
  const hrefPid = (h) => { const m = String(h || "").match(/^#\/vod\/(?:p|checkout)\/([^/?#]+)/); return m ? decodeURIComponent(m[1]) : ""; };
  const liveBanners = () => V().banners.filter((b) => banLive(b) && (!b.pid || bizShow(product(b.pid))) && (!hrefPid(b.href) || bizShow(product(hrefPid(b.href)))) && tileBiz({ href: b.href }));
  const couponOf = (cid) => (V().coupons || []).find((c) => c.id === cid) || null;
  function myCoupons(mid) {
    return ((V().memberCoupons || {})[mid] || []).map((x) => { const c = couponOf(x.cid); if (!c) return null; const st = x.usedAt ? "used" : x.exp && x.exp < today() ? "exp" : c.on === false ? "off" : "ok"; return { x, c, st }; }).filter(Boolean).sort((a, b) => (a.st === "ok" ? 0 : 1) - (b.st === "ok" ? 0 : 1) || b.x.at - a.x.at);
  }
  const couponTxt = (c) => (c.kind === "pct" ? c.value + "% 할인" + (c.max ? " (최대 " + won(c.max) + ")" : "") : won(c.value) + " 할인");
  const couponCond = (c) => [c.min ? won(c.min) + " 이상 결제 시" : "금액 제한 없음", (c.types || []).length ? c.types.map((t) => TYPE[t] ? TYPE[t][0] : t).join(" · ") + "만" : "모든 클래스"].join(" · ");
  function couponOff(c, p, amount) {
    if (!c || amount <= 0 || isBook(p)) return 0;
    if ((c.types || []).length && c.types.indexOf(typeOf(p)) < 0) return 0;
    if (c.min && amount < c.min) return 0;
    const off = c.kind === "pct" ? Math.floor(amount * c.value / 100 / 10) * 10 : Number(c.value) || 0;
    return Math.min(amount, c.kind === "pct" && c.max ? Math.min(off, c.max) : off);
  }
  const couponsFor = (mid, p, amt) => myCoupons(mid).filter((y) => y.st === "ok").map((y) => Object.assign(y, { off: couponOff(y.c, p, amt) })).filter((y) => y.off > 0).sort((a, b) => b.off - a.off);
  const usableCoupons = (mid, p) => couponsFor(mid, p, (defPlan(p) || {}).sale || priceOf(p));
  function issueCoupon(mid, c) {
    const mc = (V().memberCoupons = V().memberCoupons || {}), list = (mc[mid] = mc[mid] || []);
    if (list.some((x) => x.cid === c.id)) return null;
    const exp = c.days ? DB.date.addDays(today(), c.days) : c.endAt || "";
    const x = { id: DB.uid("mc"), cid: c.id, at: now(), exp: c.endAt && exp > c.endAt ? c.endAt : exp, usedAt: null, orderNo: "" };
    list.push(x); return x;
  }
  const addPoint = (m, amt, why) => { m.points = (Number(m.points) || 0) + amt; (m.pointLog = m.pointLog || []).push({ at: now(), amt, why }); };
  // 학습 기록: 날짜별로 공부한 날 · 연속 수강일
  const logStudy = (mid) => { const v = V(), s = ((v.studyLog = v.studyLog || {})[mid] = v.studyLog[mid] || {}); s[today()] = (s[today()] || 0) + 1; };
  function streakOf(mid) { const s = (V().studyLog || {})[mid] || {}; let d = s[today()] ? today() : DB.date.addDays(today(), -1), n = 0; while (s[d]) { n++; d = DB.date.addDays(d, -1); } return n; }
  // 익명 별명 (찜 · 다짐 한마디): 같은 사람은 늘 같은 별명
  const ADJ = ["반가운", "웃는", "신나는", "설레는", "궁금한", "느긋한", "부지런한", "행복한", "용감한", "다정한"], NOUN = ["호두", "만두", "밤", "복숭아", "망고", "귤", "푸딩", "토리", "모찌", "자두"];
  const hash = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
  const nickOf = (seedStr) => { const h = hash(String(seedStr)); return ADJ[h % ADJ.length] + " " + NOUN[(h >>> 4) % NOUN.length]; };
  const AV_C = ["#ffe1e6", "#e4f3ff", "#e7f8ec", "#fff2d9", "#efe8ff", "#f2f2f2"];
  const av = (nick, cls) => { const h = hash(String(nick)); return '<i class="vd-av ' + (cls || "") + '" style="--c:' + AV_C[h % AV_C.length] + '">' + esc(String(nick).split(" ").pop().slice(0, 1)) + "</i>"; };
  function likersOf(p) {
    const real = Object.keys(V().likes).filter((k) => (V().likes[k] || []).indexOf(p.id) >= 0).map((k) => nickOf(k));
    const fake = Array.from({ length: Math.min(3, Number(p.likeBase) || 0) }, (_, i) => nickOf(p.id + ":" + i));
    return real.concat(fake).slice(0, 3);
  }
  // 두 줄로 나누기 (썸네일 큰 글씨)
  function twoLines(s) {
    s = String(s || "").trim(); if (/\n/.test(s)) return s.split(/\n/).slice(0, 2).join("\n");
    if (s.length <= 9) return s; const w = s.split(" "); let a = "", b = "";
    w.forEach((x) => { if (!b && (a + " " + x).trim().length <= Math.ceil(s.length / 2) + 2) a = (a + " " + x).trim(); else b = (b + " " + x).trim(); });
    return a + (b ? "\n" + b : "");
  }
  const DOWK = ["일", "월", "화", "수", "목", "금", "토"];
  function fmtOpen(d) { const x = DB.date.parseDate(d); return (x.getMonth() + 1) + "월 " + x.getDate() + "일(" + DOWK[x.getDay()] + ") 오픈"; }
  function fmtLive(v) { const d = new Date(v); if (isNaN(d)) return ""; return (d.getMonth() + 1) + "월" + d.getDate() + "일(" + DOWK[d.getDay()] + ") " + (d.getHours() < 12 ? "AM " : "PM ") + ((d.getHours() % 12) || 12) + ":" + String(d.getMinutes()).padStart(2, "0"); }
  function fmtEvent(v, long) { const d = new Date(v); if (isNaN(d)) return ""; const hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); return long ? d.getFullYear() + "년 " + (d.getMonth() + 1) + "월 " + d.getDate() + "일(" + DOWK[d.getDay()] + ") " + hm : (d.getMonth() + 1) + "." + d.getDate() + "(" + DOWK[d.getDay()] + ") " + hm; }
  const placeShort = (s) => String(s || "").replace(/\s*\(.*\)\s*/g, "").split(" ").slice(0, 2).join(" ");
  // 카드 · 상세에 쓰는 한 줄 정보: 수강 기간 | 시간 | 난이도 (종류마다 다르게)
  function metaOf(p) {
    const t = typeOf(p), left = seatsLeft(p);
    if (p.status === "soon") return [p.openAt ? fmtOpen(p.openAt) : "오픈 예정", aboutTxt(totalMin(p)), "알림 신청 시 오픈 할인"];
    if (t === "ebook") return [(p.format || "PDF") + " 전자책", (Number(p.pages) || lessons(p).reduce((a, l) => a + (Number(l.min) || 0), 0)) + "쪽", "평생 소장"];
    if (t === "book") { const sl = stockLeft(p); return ["종이책" + (Number(p.pages) ? " · " + Number(p.pages) + "쪽" : ""), shipFeeTxt(p), sl === 0 ? "품절" : sl != null && sl <= 10 ? sl + "권 남음" : (Number(shipSet().outDays) || 2) + "일 안에 출고"]; }
    if (t === "live") return [fmtEvent(p.eventAt), viaOf(p) + " " + durTxt(Number(p.eventMin) || totalMin(p)), left == null ? "인원 제한 없음" : left ? "잔여 " + left + "석" : "마감"];
    if (t === "offline") return [fmtEvent(p.eventAt), placeShort(p.place) || "오프라인", left == null ? "현장 강의" : left ? "잔여 " + left + "석" : "마감"];
    return [accessTxt(p).replace(" 시청", ""), aboutTxt(totalMin(p)), String(p.level || "입문").split(/\s*·\s*/)[0]];
  }

  /* 썸네일: 업로드한 사진이 있으면 사진. 없으면 종류마다 다른 그림
   * VOD = 어두운 바탕 + 라벨 + 강조 띠 + 큰 제목(마지막 줄 포인트 색) + 강사 누끼 + 포인트 색 곡선
   * 전자책 = 밝은 종이색 바탕 + 형광펜 제목 + 오른쪽에 책 표지(책등 · 종이 단면)
   * LIVE = 짙은 밤색 바탕 + 깜빡이는 LIVE 표시 + 날짜 + 강사 뒤로 퍼지는 동심원
   * 오프라인 = 포인트 색 바탕 + 모눈 + 입장권(날짜 | 정원) + OFFLINE 도장 */
  const artLines = (p) => esc(p.thumbText || twoLines(p.title)).split("\n");
  const artTitle = (lines) => lines.map((l, i) => (i === lines.length - 1 && lines.length > 1 ? "<em>" + l + "</em>" : l)).join("<br>");
  const artSize = (lines) => { const mx = Math.max.apply(null, lines.map((l) => l.replace(/&[a-z#0-9]+;/g, "x").length)); return mx > 11 ? " sm" : mx > 8 ? " md" : ""; };
  const artPh = (p, cls) => { const ph = phOf(p); return ph ? '<img class="' + cls + '" src="' + esc(ph) + '" alt="" loading="lazy">' : '<i class="vd-art-ini">' + esc((p.creator || "D").slice(0, 1)) + "</i>"; };
  const EN_DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const evParts = (v) => { const d = new Date(v); return isNaN(d) ? null : { md: (d.getMonth() + 1) + "." + String(d.getDate()).padStart(2, "0"), dow: EN_DOW[d.getDay()], hm: String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") }; };
  function thumbArt(p, cls) {
    if (p.thumb) return '<span class="vd-art ' + (cls || "") + '"><img class="vd-art-img" ' + imgAttr(p.thumb, "src") + ' alt="" loading="lazy"></span>';
    const c = p.color || ["#1c1c1e", ACC[0]], acc = c[1] || ACC[0], t = typeOf(p), lines = artLines(p), sty = ' style="--bg:' + esc(c[0] || "#1c1c1e") + ";--acc:" + esc(acc) + '"';
    if (t === "book" && !p.label) {
      const pages = Number(p.pages) || 0;
      return '<span class="vd-art vd-art-eb vd-art-bk ' + (cls || "") + '"' + sty + '><i class="vd-eb-glow" aria-hidden="true"></i>' +
        '<span class="vd-eb-lb"><b>BOOK</b>' + esc("종이책 · " + (pages ? pages + "쪽 · " : "") + shipFeeTxt(p)) + "</span>" +
        (p.hook ? '<span class="vd-eb-hk">' + esc(p.hook) + "</span>" : "") +
        '<b class="vd-eb-t' + artSize(lines) + '">' + artTitle(lines) + "</b>" +
        '<small class="vd-eb-c"><em>' + esc(p.author || p.creator || "") + "</em> 지음" + (p.publisher ? " · " + esc(p.publisher) : "") + "</small>" +
        '<span class="vd-eb-book" aria-hidden="true"><i class="vd-eb-pages"></i><span class="vd-eb-cover' + (p.cover ? " has-img" : "") + '">' + (p.cover ? "<img " + imgAttr(p.cover, "src") + ' alt="" loading="lazy">' : "<small>DOOGO CLASS<br>BOOK</small><b>" + lines.join("<br>") + "</b><i>" + esc(p.author || p.creator || "") + "</i>") + "</span></span></span>";
    }
    if (t === "ebook" && !p.label) {
      const pages = Number(p.pages) || lessons(p).reduce((a, l) => a + (Number(l.min) || 0), 0);
      return '<span class="vd-art vd-art-eb ' + (cls || "") + '"' + sty + '><i class="vd-eb-glow" aria-hidden="true"></i>' +
        '<span class="vd-eb-lb"><b>E-BOOK</b>' + esc((p.format || "PDF") + " · " + pages + "쪽") + "</span>" +
        (p.hook ? '<span class="vd-eb-hk">' + esc(p.hook) + "</span>" : "") +
        '<b class="vd-eb-t' + artSize(lines) + '">' + artTitle(lines) + "</b>" +
        '<small class="vd-eb-c"><em>' + esc(p.creator || "") + "</em> 지음 · 평생 소장</small>" +
        '<span class="vd-eb-book" aria-hidden="true"><i class="vd-eb-pages"></i><span class="vd-eb-cover"><small>DOOGO CLASS<br>E-BOOK</small><b>' + lines.join("<br>") + "</b><i>" + esc(p.creator || "") + "</i></span></span></span>";
    }
    if ((t === "live" || t === "offline") && !p.label) {
      const e = evParts(p.eventAt), left = seatsLeft(p);
      if (t === "live") return '<span class="vd-art vd-art-lv ' + (cls || "") + '"' + sty + '><i class="vd-lv-ring r1" aria-hidden="true"></i><i class="vd-lv-ring r2" aria-hidden="true"></i><i class="vd-lv-ring r3" aria-hidden="true"></i>' + artPh(p, "vd-lv-ph") +
        '<span class="vd-lv-top"><span class="vd-lv-on"><i></i>LIVE</span>' + (e ? "<b>" + e.md + "</b><small>" + e.dow + " " + e.hm + "</small>" : "") + "</span>" +
        (p.hook ? '<span class="vd-lv-hk">' + esc(p.hook) + "</span>" : "") +
        '<b class="vd-lv-t' + artSize(lines) + '">' + artTitle(lines) + "</b>" +
        '<small class="vd-lv-c">' + (p.via === "zoom" ? "Zoom" : "유튜브") + ' 실시간 · ' + esc(durTxt(Number(p.eventMin) || totalMin(p) || 60)) + " · <em>" + esc(p.creator || "") + "</em></small></span>";
      return '<span class="vd-art vd-art-of ' + (cls || "") + '"' + sty + '><i class="vd-of-grid" aria-hidden="true"></i><i class="vd-of-sun" aria-hidden="true"></i>' + artPh(p, "vd-of-ph") +
        '<span class="vd-of-lb"><b>OFFLINE</b>' + esc(placeShort(p.place) || "현장 강의") + "</span>" +
        '<b class="vd-of-t' + artSize(lines) + '">' + artTitle(lines) + "</b>" +
        '<span class="vd-of-tk">' + (e ? '<span><b>' + e.md + "</b><small>" + e.dow + " " + e.hm + "</small></span>" : "") + "<span><b>" + (p.seats ? Number(p.seats) : "∞") + "</b><small>" + (p.seats ? "명 한정" + (left != null ? " · 잔여 " + left : "") : "인원 제한 없음") + "</small></span></span>" +
        '<span class="vd-of-stamp" aria-hidden="true">SEAT<br>LIMITED</span></span>';
    }
    const lb = p.label || (p.status === "soon" ? "오픈 예정" : priceOf(p) === 0 ? "무료특강" : "VOD클래스");
    const lbs = p.labelSub != null ? p.labelSub : p.status === "soon" && p.openAt ? fmtOpen(p.openAt) : plansOf(p).length ? "" : accessTxt(p);
    return '<span class="vd-art vd-art-gen ' + (cls || "") + '"' + sty + '>' +
      '<i class="vd-art-sw" aria-hidden="true"></i>' + artPh(p, "vd-art-ph") +
      '<span class="vd-art-lb' + (lbs ? "" : " solo") + '"><b>' + esc(lb) + "</b>" + esc(lbs || "") + "</span>" +
      (p.hook ? '<span class="vd-art-hk">' + esc(p.hook) + "</span>" : "") +
      '<b class="vd-art-t' + artSize(lines) + '">' + artTitle(lines) + "</b>" +
      '<small class="vd-art-c">' + esc(p.tagline || "") + (p.creator ? " <em>" + esc(p.creator) + "</em>" : "") + "</small>" +
      '<i class="vd-art-go" aria-hidden="true">' + icon("arrowUpRight", "xs") + "</i></span>";
  }

  window.VOD = { BANKS, bankName, acctFields, acctRead, extPh, phOf, RATE_KEYS, rateAt, rateDef, rateKeyOf, rateKeyOfP, keyOfOrder, shareVal, TAX_MODES, taxMode, buyersOf, vodOrdersOf, vodAccess, findBuyer, enterDg, dgOpen, dgCard, pctDone, prog, last4, V, save, CATS, TYPE, cats, catOf, typeOf, isEvent, products, product, priceOf, pctOf, monthOf, lessons, totalMin, durTxt, reviewsOf, ratingOf, paidOrders, soldOf, seatsLeft, shareOf, accessTxt, metaOf, fmtEvent, thumbArt, insPhoto, owns, bankInfo, seed, nickOf, likeCount, pledgesOf, couponOf, couponTxt, couponCond, ACC, TOPICS };

  /* ================= 두잉고 강의 묶음 (전체 클래스) ================= */
  // 무료강의 = 무료 VOD + 두잉고 강사 무료 LIVE(#/free) · 프리미엄강의 = LIVE · 오프라인 상품 + 두잉고 기수 강의(#/p) · VOD강의 = 유료 VOD · 전자책
  function liveItems() {
    const out = [];
    (DB.activeInstructors ? DB.activeInstructors() : []).forEach((x, i) => {
      if (V().products.some((p) => p.fromFree === x.id && p.status !== "hidden")) return;
      const f = DB.freeOf && DB.freeOf(x.id), c = DB.content(x.id); if (!f || !f.published || !c) return;
      const t = new Date(f.liveAt).getTime(); if (!(t > now() - 3 * 36e5)) return;
      const b = c.brand || {};
      out.push({ ext: true, href: "#/free/" + x.id, sort: t, p: { id: "free-" + x.id, iid: x.id, creator: b.instructor || x.displayName, title: String(f.hero.title || b.courseTitle || "").replace(/\n/g, " "), thumbText: twoLines(f.hero.title || b.courseTitle), type: "live", eventAt: f.liveAt, eventMin: 90, color: ["#1c1c1e", ACC[(i + 2) % ACC.length]], hook: "LIVE 무료 특강", tagline: b.field || "", catLabel: "두잉고 무료 LIVE", priceTxt: "무료",
        meta: [fmtLive(f.liveAt), "두잉고 LIVE", "누구나 무료"], priceHtml: '<span class="vd-p-free">무료</span>', bd: [["무료", "free"], ["LIVE", "type"]] } });
    });
    return out.sort((a, b) => a.sort - b.sort);
  }
  function premiumItems() {
    return (DB.activeInstructors ? DB.activeInstructors() : []).map((x, i) => {
      const c = DB.content(x.id), lp = DB.landingOf && DB.landingOf(x.id), b = (c && c.brand) || {}; if (!lp || lp.published === false) return null;
      const nx = DB.nextCohortName ? DB.nextCohortName(x.id) : "";
      return { ext: true, href: "#/p/" + x.id, p: { id: "pre-" + x.id, iid: x.id, creator: b.instructor || x.displayName, title: (b.courseTitle || "") + (nx ? " " + nx : ""), thumbText: twoLines(lp.hero.title || b.courseTitle), label: "프리미엄강의", labelSub: "한정인원 모집 중", color: ["#1c1c1e", ACC[(i + 5) % ACC.length]], hook: nx ? nx + " 모집" : "기수 모집", tagline: b.field || "", catLabel: "두잉고 기수 강의", priceTxt: "모집 중",
        meta: [nx || "기수 모집", "매주 과제 · 피드백", "한정 인원"], priceHtml: '<span class="vd-p-soon">모집 중</span>', bd: (i === 0 ? [BADGE.BEST] : [BADGE.NICE]).concat([["기수 강의", "type"]]) } };
    }).filter(Boolean);
  }
  const freeLives = () => listed().filter((p) => isFreeEv(p) && !eventPast(p)).sort((a, b) => eventTime(a) - eventTime(b)).map((p) => ({ href: "#/vod/p/" + p.id, p }));
  // 얼리버드 할인중: 무료 LIVE가 끝나고 얼리버드 기간인 유료 강의 · 마감 가까운 순
  const ebItems = () => listed().filter((p) => ebOf(p)).sort((a, b) => ebOf(a).ebEnd - ebOf(b).ebEnd).map((p) => ({ href: "#/vod/p/" + p.id, p }));
  const vodItems = (free) => listed().filter((p) => typeOf(p) === "vod" && (priceOf(p) === 0) === !!free).sort((a, b) => soldOf(b) - soldOf(a)).map((p) => ({ href: "#/vod/p/" + p.id, p }));
  // 전자책 묶음(메뉴 · 홈 줄)에는 종이책도 함께 — 종이책을 먼저 보여요
  const typeItems = (t) => listed().filter((p) => (t === "event" ? isEvent(p) && !isFreeEv(p) : t === "ebook" ? typeOf(p) === "ebook" || isBook(p) : typeOf(p) === t)).sort((a, b) => (t === "event" ? eventTime(a) - eventTime(b) : t === "ebook" && isBook(a) !== isBook(b) ? isBook(b) - isBook(a) : soldOf(b) - soldOf(a))).map((p) => ({ href: "#/vod/p/" + p.id, p }));

  /* ================= 화면 ================= */
  const root = document.getElementById("root");
  const ui = { slide: 0, timer: null, paused: false };
  // 약관 주소(/terms · /privacy · /refund)는 스토어 안 legal 화면으로
  const route = () => { const h = ROUTE.hash.replace(/^#\/(?=(terms|privacy|refund)(\/|\?|$))/, "#/vod/legal/").replace(/^#\/vod\/?/, ""), q = h.indexOf("?"); const path = (q >= 0 ? h.slice(0, q) : h).split("/").filter(Boolean), qs = new URLSearchParams(q >= 0 ? h.slice(q + 1) : ""); return { path, qs }; };
  const toast = (msg, kind) => { const t = document.createElement("div"); t.className = "toast" + (kind === "warn" ? " warn" : ""); t.innerHTML = icon(kind === "warn" ? "alert" : "check", "sm") + "<span>" + esc(msg) + "</span>"; const box = document.getElementById("toast-root"); box.appendChild(t); const all = box.querySelectorAll(".toast"); for (let i = 0; i < all.length - 1; i++) all[i].remove(); setTimeout(() => t.remove(), 2600); };
  const logoImg = '<img class="vd-logo-img" src="assets/brand/doogo-class-word.svg" alt="DOOGO CLASS">';
  // 두잉고 | DOOGO CLASS 바꾸기: 둥근 알약 + 미끄러지는 손잡이 (지난번에 있던 쪽에서 지금 쪽으로 움직여요)
  const SW_KEY = "doinggo:site-sw";
  const SW_DG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.6 14.2c2.4.2 4.2 1.8 4.7 4.8"/></svg>';
  const SW_VOD = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="4"/><path d="M10.2 9.4v5.2l4.4-2.6z" fill="currentColor" stroke="none"/></svg>';
  const siteSw = (on) => {
    const prev = ss.get(SW_KEY) === "vod" ? "vod" : ss.get(SW_KEY) === "dg" ? "dg" : on; ss.set(SW_KEY, on);
    setTimeout(swWire, 30);
    return '<nav class="site-sw at-' + prev + '" data-from="' + prev + '" data-to="' + on + '" aria-label="서비스 바꾸기"><i class="site-sw-k" aria-hidden="true"></i>' +
      '<a href="#/doinggo" class="' + (on === "dg" ? "on" : "") + '"' + (on === "dg" ? ' aria-current="page"' : "") + '><span class="site-sw-ic">' + SW_DG + "</span>두잉고</a>" +
      '<a href="#/vod" class="' + (on === "vod" ? "on" : "") + '"' + (on === "vod" ? ' aria-current="page"' : "") + '><span class="site-sw-ic">' + SW_VOD + "</span>두고클래스</a></nav>";
  };
  // 손잡이를 글자 폭에 맞춰 놓고, 지난번 쪽 → 지금 쪽으로 미끄러뜨려요
  const swPlace = (n, w) => { const a = n.querySelectorAll("a")[w === "vod" ? 1 : 0]; if (!a) return; n.style.setProperty("--kx", a.offsetLeft + "px"); n.style.setProperty("--kw", a.offsetWidth + "px"); };
  function swWire() {
    document.querySelectorAll(".site-sw[data-to]").forEach((n) => {
      if (n.__sw || !n.offsetWidth) return; n.__sw = 1;
      n.classList.add("no-anim"); swPlace(n, n.dataset.from); n.classList.add("ready"); void n.offsetWidth; n.classList.remove("no-anim");
      requestAnimationFrame(() => requestAnimationFrame(() => { swPlace(n, n.dataset.to); n.classList.remove("at-dg", "at-vod"); n.classList.add("at-" + n.dataset.to); }));
    });
  }
  window.addEventListener("resize", () => document.querySelectorAll(".site-sw.ready").forEach((n) => { n.classList.add("no-anim"); swPlace(n, n.dataset.to); void n.offsetWidth; n.classList.remove("no-anim"); }));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => document.querySelectorAll(".site-sw.ready").forEach((n) => swPlace(n, n.dataset.to)));
  window.siteSwitch = siteSw;
  const BOOK = '<svg class="icon sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>';
  const PAUSE = '<svg class="icon xs" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
  const opsKk = () => (DB.opsKakao ? DB.opsKakao() : { home: "https://pf.kakao.com/_xgxkiWX", chat: "https://pf.kakao.com/_xgxkiWX/chat" });
  const kkBtn = (cls, label) => '<a class="' + cls + '" href="' + esc(opsKk().chat) + '" target="_blank" rel="noopener" data-kk-ops>' + KAKAO + "<span>" + (label || "문의하기") + "</span></a>";
  const KAKAO = '<svg viewBox="0 0 24 24" aria-hidden="true" class="vd-kk-ic"><path fill="currentColor" d="M12 3.6c-5.1 0-9.2 3.2-9.2 7.2 0 2.6 1.7 4.8 4.3 6.1l-.9 3.3c-.1.3.3.6.6.4l3.9-2.6c.4 0 .9.1 1.3.1 5.1 0 9.2-3.2 9.2-7.2S17.1 3.6 12 3.6z"/></svg>';
  // [키, 주소, 이름, 판매 영역] — 판매 영역이 꺼져 있으면 메뉴에서 빠져요
  const NAV = [["home", "#/vod", "돈되는 클래스"], ["all", "#/vod/c/all", "전체 클래스"], ["vod", "#/vod/c/all?tab=vod", "VOD 강의"], ["ebook", "#/vod/c/all?tab=ebook", "전자책", "ebook"], ["flive", "#/vod/c/all?tab=flive", "무료 LIVE", "flive"], ["premium", "#/vod/c/all?tab=premium", "LIVE · 오프라인 강의", "live"], ["teachers", "#/vod/teachers", "강사진"], ["soon", "#/vod/c/soon", "오픈 예정"]];

  // 머리: 패스트캠퍼스 GNB — [로고] [검색] [내 강의실 · 찜 · 프로필] / [전체 카테고리] [주 메뉴 16px] … [보조 메뉴 12px 굵게]
  function header(nav) {
    const m = me(), r = route();
    return '<header class="vd-top"><div class="vd-wrap vd-top-in">' +
      '<a class="vd-logo" href="#/vod" aria-label="DOOGO CLASS 홈">' + logoImg + "</a>" + siteSw("vod") +
      '<form class="vd-search" data-vd-search role="search"><input name="q" type="search" placeholder="어떤 부업을 배워 볼까요?" value="' + esc(r.path[0] === "search" ? r.qs.get("q") || "" : "") + '" aria-label="클래스 검색" autocomplete="off"><button type="submit" aria-label="검색">' + icon("search", "sm") + "</button></form>" +
      '<div class="vd-top-r">' +
        '<a class="vd-tl vd-ic-pc" href="#/vod/my/classes">' + BOOK + "<span>내 강의실</span></a>" +
        '<a class="vd-ic vd-ic-pc" href="#/vod/my/likes" aria-label="찜한 강의" title="찜한 강의">' + icon("heart", "sm") + "</a>" +
        // 로그인하면 오른쪽 위에 ‘OOO님’ — 누르면 내 계정 메뉴 · 로그아웃 (휴대폰의 검색 · 전체 메뉴는 아래 메뉴 버튼 안으로 옮김)
        (m ? '<button type="button" class="vd-acct" data-v="acct" aria-haspopup="dialog" aria-label="' + esc(m.name) + '님 내 계정 메뉴"><span class="vd-me-av">' + esc(m.name.slice(0, 1)) + '</span><span class="vd-acct-n"><small>안녕하세요</small><b>' + esc(m.name) + "님</b></span>" + icon("chevDown", "xs") + "</button>"
          : '<a class="vd-login" href="#/vod/login"><span class="vd-ic-pc">로그인 · 회원가입</span><span class="vd-m-only">로그인</span></a>') +
      "</div></div>" +
      '<nav class="vd-nav" aria-label="메뉴"><div class="vd-wrap vd-nav-in"><div class="vd-nav-l"><button type="button" class="vd-allcat" data-v="drawer">' + icon("menu", "sm") + "<span>전체 카테고리</span></button>" +
        NAV.filter((x) => !x[3] || bizOn(x[3])).map((x) => '<a href="' + x[1] + '" class="' + (nav === x[0] ? "on" : "") + '">' + x[2] + "</a>").join("") +
      '</div><div class="vd-nav-r"><a href="#/vod/about" class="' + (nav === "about" ? "on" : "") + '">DOOGO CLASS 소개</a><button type="button" data-v="recruit">강사 모집</button><a href="#/doinggo">두잉고</a>' + kkBtn("vd-nav-kk", "문의하기") + "</div></div></nav></header>";
  }
  // 바닥: 긱스쿨 푸터 틀(큰 흐르는 글씨 · 바로가기 칸 · ‘도움이 필요하신가요?’ 상자 · 오른쪽 약관 줄 · 사업자 정보) + DOOGO CLASS 색
  function footer() {
    const S = DB.siteInfo ? DB.siteInfo() : { company: "(주)두고홀딩스" };
    const ext = (href, label) => '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + label + "</a>";
    const bizDigits = String(S.bizNo || "").replace(/[^0-9]/g, "");
    const tel = (v) => '<a href="tel:' + esc(String(v).replace(/[^0-9+]/g, "")) + '">' + esc(v) + "</a>";
    const biz = [S.ceo && ["대표", esc(S.ceo)], S.bizNo && ["사업자등록번호", esc(S.bizNo)], S.mailOrderNo && ["통신판매업신고", esc(S.mailOrderNo)], S.address && ["주소", esc(S.address)], S.phone && ["고객센터", tel(S.phone)], S.email && ["이메일", '<a href="mailto:' + esc(S.email) + '">' + esc(S.email) + "</a>"], S.privacyOfficer && ["개인정보 보호책임자", esc(S.privacyOfficer)], ["호스팅 제공자", esc(S.hosting || "Vercel Inc.")]].filter(Boolean);
    const lg = (k, label) => '<button type="button" data-v="legal" data-k="' + k + '">' + label + "</button>";
    const col = (t, items) => '<div class="vd-gf-col"><b>' + t + "</b>" + items.map((x) => (x[0] === "recruit" ? '<button type="button" data-v="recruit">' + x[1] + "</button>" : '<a href="' + x[0] + '">' + x[1] + "</a>")).join("") + "</div>";
    const mq = '<span>YOUR SUCCESS</span><i>✳</i><span class="o">DOOGO CLASS</span><i>✳</i>', kinds = ["VOD", bizOn("ebook") && "전자책", (bizOn("live") || bizOn("flive")) && "LIVE"].filter(Boolean).join(" · ");
    return '<footer class="vd-gf"><div class="vd-gf-mq" aria-hidden="true"><div class="vd-gf-mq-t">' + mq + mq + mq + mq + mq + mq + "</div></div>" +
      '<div class="vd-wrap"><div class="vd-gf-top"><div class="vd-gf-brand">' + logoImg + "<p>돈 되는 노하우를 " + kinds + (/책$/.test(kinds) ? "으로" : "로") + ".<br>직접 해서 번 사람에게 배워요.</p>" +
        // 로그인 바로가기: 강사센터(강사 · 코치) · 두잉고 수강생 강의실
        '<div class="vd-gf-login" aria-label="로그인 바로가기"><small>로그인 바로가기</small>' + [["#/center/login", "monitorPlay", "강사센터 로그인", "강사 · 코치 · 파트너"], ["#/login", "users", "수강생 로그인", "두잉고 기수 강의실"]].map((x) => '<a class="vd-gf-lg" href="' + x[0] + '"><span class="vd-gf-lg-ic">' + icon(x[1], "sm") + "</span><span><b>" + x[2] + "</b><em>" + x[3] + "</em></span>" + icon("arrowUpRight", "xs") + "</a>").join("") + "</div></div>" +
        '<nav class="vd-gf-grid" aria-label="바로가기">' +
          col("클래스", [["#/vod", "돈되는 클래스"], ["#/vod/c/all?tab=vod", "VOD 강의"], bizOn("ebook") && ["#/vod/c/all?tab=ebook", "전자책"], bizOn("flive") && ["#/vod/c/all?tab=flive", "무료 LIVE"], bizOn("live") && ["#/vod/c/all?tab=premium", "LIVE · 오프라인 강의"], bizOn("free") && ["#/vod/c/all?tab=free", "무료강의"], ["#/vod/teachers", "강사진"], ["#/vod/c/soon", "오픈 예정"]].filter(Boolean)) +
          col("마이페이지", [["#/vod/my/classes", "내 강의실"], ["#/vod/my/coupons", "쿠폰"], ["#/vod/my/orders", "주문 · 결제 내역"], ["#/vod/my/account", "회원 정보 수정"]]) +
          col("DOOGO CLASS", [["#/vod/about", "DOOGO CLASS 소개"], ["recruit", "강사 모집"], ["#/center", "강사센터"], ["#/doinggo", "두잉고 (강의 운영 시스템)"]]) +
        "</nav>" +
        '<div class="vd-gf-help"><b>도움이 필요하신가요?</b><p>수강 · 결제 · 환불 문의를 남겨 주시면<br>영업일 기준 하루 안에 답해 드려요.</p><div class="vd-gf-hbtn"><a class="vd-btn vd-btn-p" href="#/vod/my/help">1:1 문의하기 ' + icon("arrowRight", "xs") + "</a>" + kkBtn("vd-btn vd-btn-kakao", "카카오톡 상담") + "</div>" +
          (S.phone || S.hours ? '<p class="vd-gf-cs">' + (S.phone ? "<b>" + tel(S.phone) + "</b>" : "") + (S.hours ? "<small>" + esc(S.hours) + "</small>" : "") + "</p>" : "") + "</div></div>" +
      '<div class="vd-gf-bot"><div class="vd-gf-biz"><strong>' + esc(S.company || "(주)두고홀딩스") + "</strong><dl>" + biz.map((x) => "<div><dt>" + x[0] + "</dt><dd>" + x[1] + "</dd></div>").join("") + "</dl>" + (S.notice ? "<p>" + esc(S.notice) + "</p>" : "") + '<p class="vd-gf-copy">© 2026 ' + esc(S.company || "(주)두고홀딩스") + ". All rights reserved.</p></div>" +
        '<nav class="vd-gf-links" aria-label="약관">' + '<a href="#/terms">이용약관</a><a href="#/privacy"><strong>개인정보처리방침</strong></a><a href="#/refund">환불정책</a>' + lg("oss", "오픈소스 라이선스") + (bizDigits.length === 10 ? ext("https://www.ftc.go.kr/bizCommPop.do?wrkr_no=" + bizDigits, "사업자정보확인") : "") + '<button type="button" data-v="recruit">강사 모집 · 입점 문의</button></nav></div></div></footer>';
  }
  // 휴대폰 아래 메뉴: 왼쪽 ‘메뉴’(전체 메뉴 · 검색) · 찜 · 가운데 ‘홈’ · 내 강의실 · 마이
  const tabbar = (on) => '<nav class="vd-tabbar" aria-label="아래 메뉴">' + [["menu", "", "menu", "메뉴"], ["likes", "#/vod/my/likes", "heart", "찜"], ["home", "#/vod", "home", "홈"], ["cls", "#/vod/my/classes", "monitorPlay", "내 강의실"], ["my", "#/vod/my", "user", "마이"]].map((t) => t[0] === "menu"
    ? '<button type="button" data-v="drawer" aria-label="전체 메뉴 · 검색">' + icon(t[2], "sm") + "<span>" + t[3] + "</span></button>"
    : '<a href="' + t[1] + '" class="' + (t[0] === "home" ? "vd-tab-home " : "") + (on === t[0] ? "on" : "") + '"' + (on === t[0] ? ' aria-current="page"' : "") + ">" + (t[0] === "home" ? '<i class="vd-tab-hc">' + icon(t[2], "sm") + "</i>" : icon(t[2], "sm")) + "<span>" + t[3] + "</span></a>").join("") + "</nav>";
  const shell = (nav, body, tab, cls) => '<div class="vd' + (cls ? " " + cls : "") + '">' + header(nav) + '<main class="vd-main">' + body + "</main>" + footer() + tabbar(tab || "") + "</div>";

  /* ---------- 카드 (스낵클형 · 둥근 썸네일) ---------- */
  // 강사 이름은 사진 + 진한 글씨로 (회색이면 안 보여서)
  const crName = (p) => { const ph = phOf(p); return '<span class="vd-crn">' + (ph ? '<img src="' + esc(ph) + '" alt="" loading="lazy">' : '<i>' + esc((p.creator || "D").slice(0, 1)) + "</i>") + "<b>" + esc(p.creator || "") + "</b></span>"; };
  const BADGE = { BEST: ["BEST", "best"], NEW: ["NEW", "new"], UPDATE: ["업데이트", "upd"], HOT: ["HOT", "hot"], NICE: ["추천", "nice"] };
  function badgesOf(p) {
    const list = ["BEST", "NEW", "UPDATE", "HOT", "NICE"].filter((b) => (p.badges || []).indexOf(b) >= 0 || (b === "UPDATE" && isUpd(p))).map((b) => BADGE[b]);
    return (ebOf(p) ? [["얼리버드", "eb"]] : []).concat(list, [priceOf(p) === 0 && p.status !== "soon" ? ["무료", "free"] : [TYPE[typeOf(p)][1], "type"]]);
  }
  const badgeHtml = (list) => (list.length ? '<div class="vd-badges">' + list.map((b) => '<span class="vd-badge vd-b-' + b[1] + '">' + esc(b[0]) + "</span>").join("") + "</div>" : "");
  const priceHtml = (p) => { const pr = priceOf(p), pct = pctOf(p); return p.status === "soon" ? '<span class="vd-p-soon">오픈 예정</span>' + (pr ? "<s>" + won(pr) + "</s>" : "") : pr === 0 ? '<span class="vd-p-free">무료</span>' : (pct ? "<em>" + pct + "%</em>" : "") + "<strong>" + won(pr) + "</strong>"; };
  // 카드의 월 가격: 12개월 이상 보는 VOD만 (스낵클처럼 ‘월 OO원’)
  const cardMonth = (p) => (y365(p) ? Math.floor(y365(p).sale / 12) : typeOf(p) === "vod" && p.accessDays && p.accessDays >= 365 && priceOf(p) > 0 ? Math.floor(priceOf(p) / monthsOf(p)) : 0);
  function cardMeta(p) {
    const t = typeOf(p), pr = priceOf(p), mo = cardMonth(p), left = seatsLeft(p);
    if (p.status === "soon") return (p.openAt ? fmtOpen(p.openAt) : "오픈 예정") + " · 알림 받으면 오픈 할인";
    if (t === "ebook") return "전자책 · " + (p.format || "PDF") + " " + (Number(p.pages) || 0) + "쪽 · 평생 소장";
    if (t === "book") return "종이책 · " + (Number(p.pages) ? Number(p.pages) + "쪽 · " : "") + shipFeeTxt(p) + (stockLeft(p) === 0 ? " · 품절" : "");
    if (t === "live") return "LIVE 클래스 · " + fmtLive(p.eventAt) + (p.replayDays ? " · 다시보기 포함" : "") + " · 라이브 " + durTxt(Number(p.eventMin) || totalMin(p)) + (left != null ? " · 잔여 " + left + "석" : "");
    if (t === "offline") return "오프라인 클래스 · " + fmtLive(p.eventAt) + " · " + (placeShort(p.place) || "현장") + (left != null ? " · 잔여 " + left + "석" : "");
    return (pr === 0 ? "무료 특강 · " : "VOD 클래스 · ") + accessTxt(p) + (mo ? (y365(p) ? " · 365일 총 " + won(y365(p).sale) : " · 총 " + won(pr)) : "");
  }
  const CHIP = { vod: "VOD 클래스", ebook: "전자책", book: "종이책", live: "LIVE 클래스", offline: "오프라인 클래스" };
  function cardMetaHtml(p) {
    const t = typeOf(p), pr = priceOf(p), left = seatsLeft(p);
    const chip = p.status === "soon" ? ["오픈 예정", "soon"] : pr === 0 ? [t === "live" ? "무료 LIVE" : "무료 특강", "free"] : [CHIP[t] || "클래스", t];
    const parts = p.status === "soon" ? [p.openAt ? fmtOpen(p.openAt) : "오픈 예정", "알림 받으면 오픈 할인"]
      : t === "ebook" ? [(p.format || "PDF") + " " + (Number(p.pages) || 0) + "쪽", "평생 소장"]
      : t === "book" ? [Number(p.pages) ? Number(p.pages) + "쪽" : "", shipFeeTxt(p), stockLeft(p) === 0 ? "품절" : ""]
      : t === "live" ? [fmtLive(p.eventAt), viaOf(p) + " " + durTxt(Number(p.eventMin) || totalMin(p))].concat(p.replayDays ? ["다시보기"] : []).concat(left != null ? ["잔여 " + left + "석"] : pr === 0 ? ["누구나"] : [])
      : t === "offline" ? [fmtLive(p.eventAt), placeShort(p.place) || "현장"].concat(left != null ? ["잔여 " + left + "석"] : [])
      : [y365(p) ? "365일 수강권" : accessTxt(p).replace(" 시청", ""), aboutTxt(totalMin(p)), String(p.level || "입문").split(/\s*·\s*/)[0]];
    return '<span class="vd-cmeta"><span class="vd-kchip vd-kchip-' + chip[1] + '">' + esc(chip[0]) + '</span><span class="vd-cm">' + parts.filter(Boolean).map((x) => "<span>" + esc(x) + "</span>").join("") + "</span></span>";
  }
  const likeBtn = (p, m) => '<button type="button" class="vd-like' + (liked(m && m.id, p.id) ? " on" : "") + '" data-v="like" data-id="' + esc(p.id) + '" aria-label="' + (p.status === "soon" ? "오픈 알림 받기" : "찜하기") + '">' + icon("heart", "sm") + "</button>";
  // 둥근 썸네일(찜) → 제목 → 강사 | ♡ 찜 | ★ 후기 → 월 가격 → 종류 · 기간 → ‘OO님이 찜했어요’
  function card(p, o) {
    o = o || {}; const m = me(), rt = ratingOf(p.id), pr = priceOf(p), mo = cardMonth(p), pct = pctOf(p), lk = likersOf(p), left = seatsLeft(p);
    const se = saleEndOf(p), eb = ebOf(p), dleft = se ? DB.date.diffDays(se.slice(0, 10), today()) : null;
    const ov = o.rank ? '<span class="vd-rank">BEST ' + o.rank + "</span>" : left === 0 ? '<span class="vd-ov">마감</span>' : stockLeft(p) === 0 ? '<span class="vd-ov">품절</span>' : eb ? '<span class="vd-ov vd-ov-eb">얼리버드 ' + (dleft ? "D-" + dleft : "오늘 마감") + "</span>" : dleft != null && dleft >= 0 && dleft <= 7 ? '<span class="vd-ov vd-ov-dd">할인 ' + (dleft ? "D-" + dleft : "오늘 마감") + "</span>" : "";
    const cnt = o.rank && soldOf(p) >= 100 ? '<span class="vd-cnt">' + icon("users", "xs") + '<b><i data-count="' + soldOf(p) + '" data-cid="' + esc(p.id) + '">' + soldOf(p).toLocaleString() + "</i>+</b></span>" : "";
    return '<a class="vd-card" href="#/vod/p/' + esc(p.id) + '"><div class="vd-thumb vd-th-' + typeOf(p) + (ov ? " has-ov" : "") + '">' + thumbArt(p) + (ov || cnt ? '<span class="vd-ovs">' + ov + cnt + "</span>" : "") + likeBtn(p, m) + "</div>" +
      '<div class="vd-card-b"><b class="vd-title">' + esc(p.title) + "</b>" +
        '<span class="vd-cr">' + crName(p) + '<i></i><span class="vd-hc" data-hc="' + esc(p.id) + '">' + icon("heart", "xs") + likeCount(p) + "</span>" + (rt.n ? '<i></i><span class="vd-rvc" title="수강후기 ' + rt.n + "개 · 평균 " + rt.avg.toFixed(1) + '점">' + icon("star", "xs") + rt.avg.toFixed(1) + "<small>후기 " + rt.n + "</small></span>" : "") + "</span>" +
        '<div class="vd-price">' + (p.status === "soon" ? "<strong>오픈 예정</strong>" + (pr ? "<s>" + won(pr) + "</s>" : "") : pr === 0 ? "<strong>무료</strong>" : "<strong>" + won(y365(p) ? y365(p).sale : pr) + "</strong>" + (pct ? "<em>" + pct + "%</em>" : "")) + "</div>" +
        cardMetaHtml(p) +
        (lk.length ? '<span class="vd-social"><span class="vd-avs">' + lk.map((n) => av(n)).join("") + "</span><span><b>" + esc(lk[0]) + "</b>님이 " + (p.status === "soon" ? "알림 신청했어요" : "찜했어요") + "</span></span>" : "") +
      "</div></a>";
  }
  // 두잉고 쪽 강의(무료 LIVE · 기수 강의)도 같은 카드 모양으로
  function xcard(it) {
    const p = it.p;
    return '<a class="vd-card" href="' + esc(it.href) + '"><div class="vd-thumb vd-th-' + typeOf(p) + '">' + thumbArt(p) + "</div>" +
      '<div class="vd-card-b"><b class="vd-title">' + esc(p.title) + '</b><span class="vd-cr">' + crName(p) + '<i></i><span class="vd-xcat">' + esc(p.catLabel || "") + "</span></span>" +
        '<div class="vd-price">' + (p.priceTxt ? "<strong>" + esc(p.priceTxt) + "</strong>" : "") + '</div><span class="vd-cmeta"><span class="vd-kchip vd-kchip-cohort">' + esc(p.catLabel || "두잉고") + '</span><span class="vd-cm">' + (p.meta || []).map((x) => "<span>" + esc(x) + "</span>").join("") + "</span></span></div></a>";
  }
  const anyCard = (it, o) => (it.ext ? xcard(it) : card(it.p || it, o));
  const pager = (id) => '<div class="vd-pager" data-pager="' + id + '"><span class="vd-pager-n"><b>1</b> / 1</span><button type="button" data-v="rail" data-r="' + id + '" data-d="-1" aria-label="이전">' + icon("chevLeft", "sm") + '</button><button type="button" data-v="rail" data-r="' + id + '" data-d="1" aria-label="다음">' + icon("chevRight", "sm") + "</button></div>";
  const emptyBox = (ic, t, p, btn) => '<div class="vd-empty">' + icon(ic) + "<b>" + t + "</b>" + (p ? "<p>" + p + "</p>" : "") + (btn || "") + "</div>";
  // 제목 강조: [앞, 강조] → 글자 새김 뒤 강조 부분이 레드 + 밑줄
  const egTitle = (t) => (Array.isArray(t) ? esc(t[0]) + '<span data-accent>' + esc(t[1]) + "</span>" + esc(t[2] || "") : esc(t));

  /* ---------- 홈 (스낵클 배너 → 분야 알약 → BEST · 전자책 · LIVE·오프라인 · 무료 · 오픈 예정 줄 → 다루는 부업 → 강사진) ---------- */
  const devTopics = () => { try { const a = JSON.parse(ls.get(KEY_TOPIC) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  // 부업 찜: 로그인하면 회원 정보에 저장해 마이페이지 · 다른 기기에서도 보여요 (로그인 전에 찜한 것도 합쳐요)
  const myTopics = () => { const m = me(); if (!m) return devTopics(); if (!Array.isArray(m.topics)) m.topics = devTopics().slice(); return m.topics; };
  const setTopics = (a) => { const m = me(); if (m) m.topics = a; ls.set(KEY_TOPIC, JSON.stringify(a)); save(); };
  const topicChip = (t, dup) => { const on = myTopics().indexOf(t) >= 0; return '<button type="button" class="vd-tchip' + (on ? " on" : "") + '" data-v="topic" data-t="' + esc(t) + '" aria-pressed="' + on + '"' + (dup ? ' tabindex="-1" aria-hidden="true"' : "") + ">" + esc(t) + icon("heart", "xs") + "</button>"; };
  // 관심 부업 탭: 찜한 부업 칩 + 이름이 겹치는 판매 중 클래스
  function myTopicsBody(tps) {
    if (!tps.length) return '<div class="vd-wempty">' + icon("heart") + '<b>찜한 부업이 아직 없어요</b><p>홈 › ‘DOOGO CLASS에서 다루는 부업’에서 ♡를 누르면 여기에 모여요.<br>찜이 많은 부업부터 클래스를 열어요.</p><a class="vd-btn vd-btn-o" href="#/vod">부업 고르러 가기</a></div>';
    const words = tps.join(" ").split(/[\s·,]+/).filter((w) => w.length >= 2), hit = listed().filter((p) => { const t = (p.title + " " + (p.sub || "") + " " + (p.hook || "") + " " + (p.tags || []).join(" ")).toLowerCase(); return words.some((w) => t.indexOf(w.toLowerCase()) >= 0); });
    return '<div class="vd-mytp"><p class="vd-mytp-lead">' + icon("heart", "xs") + " 찜한 부업 <b>" + tps.length + "개</b> · 칩을 다시 누르면 찜이 풀려요. 찜이 많은 부업부터 클래스를 열고, 열리면 알려 드려요.</p>" +
      '<div class="vd-mytp-chips">' + tps.map((k) => topicChip(k)).join("") + "</div>" +
      (hit.length ? '<h3 class="vd-my-sub">관심 부업과 이어지는 클래스</h3><div class="vd-grid vd-grid-3">' + hit.slice(0, 6).map((p) => card(p)).join("") + "</div>" : '<p class="vd-muted vd-my-note">아직 찜한 부업과 딱 맞는 클래스는 없어요. 찜이 모이면 그 부업부터 클래스를 열어요.</p>') + "</div>";
  }
  const TAGC = { red: "red", blue: "blue", pink: "pink", yellow: "yellow", orange: "orange", green: "green" };
  function rail(id, tag, color, title, more, items, o) {
    if (!items.length) return "";
    return '<section class="vd-sec"><div class="vd-sec-h"><div class="vd-sec-t">' + (tag ? '<span class="vd-tag vd-tag-' + TAGC[color] + '" data-rv="fade">' + esc(tag) + "</span>" : "") + '<h2 data-eg>' + egTitle(title) + "</h2></div>" +
      '<div class="vd-sec-r">' + (more ? '<a class="vd-more" href="' + more + '">전체보기' + icon("chevRight", "xs") + "</a>" : "") + pager(id) + "</div></div>" +
      '<div class="vd-row" id="' + id + '" data-rv-kids>' + items.map((it, i) => anyCard(it, o && o.rank && i < 3 ? { rank: i + 1 } : null)).join("") + "</div></section>";
  }
  // 이미지 배너: 마스터가 올린 PC · 모바일 이미지를 그대로 보여요 (모바일 이미지가 없으면 PC 이미지를 가운데 맞춰 잘라요)
  function imgSlide(b, i, clone, href) {
    const pc = b.pc || b.m, m = b.m || "";
    return '<a class="vd-slide img' + (b.fit === "contain" ? " fit" : "") + (i === ui.slide ? " on" : "") + '" href="' + esc(href) + '"' + (b.newTab ? ' target="_blank" rel="noopener"' : "") + ' style="--a:' + esc(b.bg || (b.color || [])[0] || "#111") + '" data-i="' + (clone ? "" : i) + '" tabindex="' + (i === ui.slide ? 0 : -1) + '"' + (clone ? ' aria-hidden="true"' : "") + "><picture>" +
      (m && m !== pc ? '<source media="(max-width: 639px)" ' + imgAttr(m, "srcset") + ">" : "") + "<img " + imgAttr(pc, "src") + ' alt="' + (clone ? "" : esc(b.alt || String(b.title || "").replace(/\n/g, " "))) + '" draggable="false"></picture></a>';
  }
  /* 홈 화면 섹션 (마스터 › VOD 전시 · 쿠폰 · 설정 › 홈 화면 섹션에서 고쳐요)
   * mode: auto = 기본 규칙(판매순 · 날짜순) · pin = 고른 강의를 맨 앞에 + 나머지 자동 · only = 고른 강의만 */
  const RAIL_DEF = [
    { k: "best", tag: "BEST", color: "red", t: ["지금 가장 많이 듣는 ", "클래스", ""], more: "#/vod/c/all?tab=vod", rank: true, rule: "유료 VOD · 많이 팔린 순" },
    { k: "why", tag: "DOOGO CLASS VOD", color: "red", t: ["강의로 끝나지 않고, ", "실행까지 함께하는", " VOD"], more: "#/vod/about", rule: "고정 소개 · 두잉고 강의실 · 수업 자료 · AI 조교 · 강사님 1:1 코칭", fixed: true },
    { k: "ebook", tag: "전자책", color: "blue", t: ["바로 내려받아 따라 하는 ", "전자책", ""], more: "#/vod/c/all?tab=ebook", rule: "전자책 · 많이 팔린 순", biz: "ebook" },
    { k: "cat", tag: "분야별", color: "blue", t: ["분야별로 골라 보는 ", "클래스", ""], more: "#/vod/c/all", rule: "분야 탭 · 판매 중인 VOD · 전자책 · 많이 팔린 순", fixed: true },
    { k: "new", tag: "NEW", color: "green", t: ["새로 올라온 ", "클래스", ""], more: "#/vod/c/new", rule: "VOD · 전자책 · 최근 올라온 순" },
    { k: "flive", tag: "무료 LIVE", color: "yellow", t: ["돈 되는 노하우, ", "무료 LIVE", "로 먼저"], more: "#/vod/c/all?tab=flive", rule: "무료 LIVE · 날짜 가까운 순 · LIVE가 끝나면 자동으로 빠져요", biz: "flive" },
    { k: "eb", tag: "얼리버드", color: "red", t: ["지금만 이 가격, ", "얼리버드 할인중", ""], more: "#/vod/c/all?tab=eb", rule: "무료 LIVE가 끝난 뒤 얼리버드 기간인 강의 · 마감 가까운 순", biz: "flive" },
    { k: "prem", tag: "LIVE · 오프라인", color: "pink", t: ["직접 만나 배우는 ", "프리미엄 강의", ""], more: "#/vod/c/all?tab=premium", rule: "유료 LIVE · 오프라인 · 날짜 가까운 순 + 두잉고 기수 강의", biz: "live" },
    { k: "free", tag: "", color: "yellow", t: ["무료로 ", "먼저 들어", " 보세요"], more: "#/vod/c/all?tab=free", rule: "무료 VOD 특강 · 많이 들은 순", biz: "free" },
    { k: "soon", tag: "오픈 예정", color: "orange", t: ["곧 열리는 클래스, ", "알림 받고 할인", ""], more: "#/vod/c/soon", rule: "오픈 예정 클래스" }
  ];
  function homeRails() {
    const saved = Array.isArray(V().homeRails) ? V().homeRails : [], out = [];
    saved.forEach((x) => { const d = RAIL_DEF.find((r) => r.k === x.k); if (d && !out.some((y) => y.k === x.k)) out.push(Object.assign({}, d, { on: x.on !== false, tag: x.tag != null ? x.tag : d.tag, t: Array.isArray(x.t) && x.t.length ? x.t : d.t, mode: x.mode || "auto", picks: Array.isArray(x.picks) ? x.picks : [] })); });
    RAIL_DEF.forEach((d) => { if (!out.some((y) => y.k === d.k)) out.push(Object.assign({}, d, { on: true, mode: "auto", picks: [] })); });
    return out;
  }
  function railAuto(k) {
    if (k === "best") return listed().filter((p) => typeOf(p) === "vod" && priceOf(p) > 0).sort((a, b) => soldOf(b) - soldOf(a)).map((p) => ({ href: "#/vod/p/" + p.id, p }));
    if (k === "ebook") return typeItems("ebook");
    if (k === "new") return listed().filter((p) => typeOf(p) === "vod" || typeOf(p) === "ebook" || isBook(p)).sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)).map((p) => ({ href: "#/vod/p/" + p.id, p }));
    if (k === "prem") return bizOn("live") ? typeItems("event").concat(premiumItems()) : [];
    if (k === "free") return bizOn("free") ? vodItems(true) : [];
    if (k === "flive") return bizOn("flive") ? freeLives().concat(liveItems()) : [];
    if (k === "eb") return bizOn("flive") ? ebItems() : [];
    if (k === "soon") return V().products.filter((p) => p.status === "soon" && bizShow(p)).map((p) => ({ href: "#/vod/p/" + p.id, p }));
    return [];
  }
  const railShowable = (p) => p && p.status !== "hidden" && (p.status === "soon" || (p.status === "on" && !eventPast(p))) && bizShow(p);
  function railItems(r) {
    const picks = (r.picks || []).map(product).filter(railShowable).map((p) => ({ href: "#/vod/p/" + p.id, p }));
    if (r.mode === "only") return picks;
    if (r.mode === "pin") { const ids = picks.map((x) => x.p.id); return picks.concat(railAuto(r.k).filter((x) => ids.indexOf(x.p.id) < 0)); }
    return railAuto(r.k);
  }
  function pageHome() {
    const bs = liveBanners();
    ui.slide = Math.min(ui.slide, Math.max(0, bs.length - 1));
    const tp = V().topics || [], mine = myTopics(), rows = [0, 1, 2].map((i) => tp.filter((_, j) => j % 3 === i));
    const loop = bs.length > 1 ? [bs[bs.length - 1]].concat(bs, [bs[0]]) : bs, off = bs.length > 1 ? 1 : 0;
    const hero = bs.length ? '<section class="vd-hero"><div class="vd-hero-vp"><div class="vd-hero-track" id="vd-hero" style="--i:' + (ui.slide + off) + '">' +
      loop.map((b, j) => { const i = j - off, clone = i < 0 || i >= bs.length; const p = b.pid ? product(b.pid) : null, ph = b.img || (p ? phOf(p) : ""), href = b.href || (p ? "#/vod/p/" + p.id : "#/vod/c/all");
        if (b.kind === "img") return imgSlide(b, i, clone, href);
        const st = String(b.sticker || "").split("\n");
        return '<a class="vd-slide' + (b.dark ? " dark" : "") + (i === ui.slide ? " on" : "") + '" href="' + esc(href) + '" style="--a:' + esc((b.color || [])[0] || "#111") + ";--b:" + esc((b.color || [])[1] || (b.color || [])[0] || "#333") + '" data-i="' + (clone ? "" : i) + '" tabindex="' + (i === ui.slide ? 0 : -1) + '"' + (clone ? ' aria-hidden="true"' : "") + '><div class="vd-slide-t">' + (b.eyebrow ? "<small>" + esc(b.eyebrow) + "</small>" : "") + "<b>" + esc(b.title || "").replace(/\n/g, "<br>") + "</b>" + (b.sub ? "<p>" + esc(b.sub) + " " + icon("arrowRight", "xs") + "</p>" : "") + "</div>" +
          (b.sticker ? '<span class="vd-burst"><b>' + st.map((l, k) => '<span style="--k:' + k + '">' + esc(l) + "</span>").join("") + "</b></span>" : ph ? '<img class="vd-slide-ph" src="' + esc(ph) + '" alt="">' : "") + "</a>"; }).join("") +
      '</div></div><div class="vd-wrap vd-hero-ctl"><div class="vd-dots">' + bs.map((b, i) => '<button type="button" class="' + (i === ui.slide ? "on" : "") + '" data-v="slide-to" data-i="' + i + '" aria-label="' + (i + 1) + '번째 배너"></button>').join("") + '</div><button type="button" class="vd-ctl" data-v="pause" aria-label="' + (ui.paused ? "자동 넘김 켜기" : "자동 넘김 멈추기") + '">' + (ui.paused ? icon("play", "xs") : PAUSE) + '</button><span class="vd-hero-cnt"><b>' + (ui.slide + 1) + "</b> / " + bs.length + '</span><button type="button" class="vd-ctl" data-v="slide" data-d="-1" aria-label="이전 배너">' + icon("chevLeft", "sm") + '</button><button type="button" class="vd-ctl" data-v="slide" data-d="1" aria-label="다음 배너">' + icon("chevRight", "sm") + "</button></div></section>" : "";
    const tl = (V().tiles || []).filter((t) => t.on !== false && t.label && tileBiz(t));
    const tiles = '<nav class="vd-tiles" aria-label="카테고리 바로가기" style="--n:' + Math.min(12, Math.max(6, tl.length)) + ";--c:" + Math.max(4, Math.ceil(tl.length / 2)) + '">' + tl.map((t, i) => '<a class="vd-tile" href="' + esc(t.href || "#/vod/c/all") + '" style="--d:' + (i * 0.035).toFixed(3) + 's"><span class="vd-tile-ic">' + (t.img ? "<img " + imgAttr(t.img, "src") + ' alt="" width="56" height="56" draggable="false">' : icon("grid")) + (t.badge ? "<em>" + esc(t.badge) + "</em>" : "") + "</span><b>" + esc(t.label) + "</b></a>").join("") + "</nav>";
    const pills = tl.length ? tiles : '<nav class="vd-pills" aria-label="분야" data-rv-kids><a class="vd-pill on" href="#/vod/c/all">전체</a>' + cats().map((c) => '<a class="vd-pill" href="#/vod/c/' + esc(c.key) + '">' + esc(c.label) + "</a>").join("") + '' + (bizOn("ebook") ? '<a class="vd-pill" href="#/vod/c/all?tab=ebook">전자책</a>' : "") + (bizOn("live") ? '<a class="vd-pill" href="#/vod/c/all?tab=premium">LIVE · 오프라인 강의</a>' : "") + '<a></nav>';
    const best = listed().filter((p) => typeOf(p) === "vod" && priceOf(p) > 0).sort((a, b) => soldOf(b) - soldOf(a)).map((p) => ({ p }));
    const chip = topicChip;
    return shell("home", hero + '<div class="vd-wrap">' + pills +
      homeRails().filter((r) => r.on && (!r.biz || bizOn(r.biz))).map((r) => (r.k === "why" ? whyBand(r) : r.k === "cat" ? catSec(r) : rail("vd-r-" + (r.k === "best" ? "now" : r.k), r.tag, r.color, r.t, r.more, railItems(r), r.rank ? { rank: true } : null))).join("") +
      '<section class="vd-sec vd-topics"><div class="vd-topics-h"><h2 data-eg>DOOGO CLASS에서 다루는 <span data-accent>부업</span></h2><p data-rv>다음에 열 부업은 찜으로 골라요. <b>찜이 많은 부업부터 클래스를 열어요.</b><small>마우스를 올리면 멈춰요 · <a href="#/vod/my/likes?t=topics">내가 찜한 부업 보기 ›</a></small></p></div>' +
        rows.map((r, ri) => '<div class="vd-chiprow' + (ri % 2 ? " rev" : "") + '" data-rv="fade" style="--d:' + (ri * 0.12) + 's"><div class="vd-chipmq" style="--dur:' + (48 + ri * 8) + 's">' + r.map((t) => chip(t)).join("") + r.map((t) => chip(t, true)).join("") + "</div></div>").join("") + "</section>" +
      teachers() + "</div>", "home");
  }
  // 카테고리 아이콘: 꺼진 판매 영역으로 가는 아이콘은 숨겨요
  const tileBiz = (t) => { const h = String(t.href || ""); return !(/tab=premium/.test(h) && !bizOn("live")) && !(/tab=free|\/c\/free/.test(h) && !bizOn("free")) && !(/tab=ebook/.test(h) && !bizOn("ebook")) && !(/tab=(flive|eb)\b/.test(h) && !bizOn("flive")); };

  /* 홈 · 소개 공통: DOOGO CLASS VOD 학습 시스템 그림 (사진 대신 CSS로 그린 작은 화면 · 흑백 + 레드 포인트) */
  const SYS = [
    ["room", "두잉고 강의실", "결제하면 바로 열리는 나만의 강의실. 진도 · 이어 보기 · 완료 표시까지 한 곳에서."],
    ["files", "실제로 쓰는 수업 자료", "교재 · 템플릿 · 계산기 · 체크리스트. 강사님이 실제로 쓰는 자료를 그대로 받아요."],
    ["ai", "24시간 AI 조교", "막히는 순간 바로 물어봐요. 강의 내용을 아는 AI 조교가 밤에도 답해요."],
    ["coach", "강사님 1:1 코칭 · TEA TIME", "AI로도 안 풀리면 강사님께 직접. 1:1 코칭으로 내 사업 질문을 묻고, TEA TIME으로 직접 만나요."]
  ];
  const mkBar = (t) => '<div class="mk-bar"><i></i><i></i><i></i><span>' + t + "</span></div>";
  function sysMock(k) {
    if (k === "room") return '<div class="mk-win">' + mkBar("두잉고 강의실") + '<div class="mk-room"><div class="mk-video"><span class="mk-play"></span><span class="mk-wm">김OO · VOD 수강생</span><span class="mk-seek"><u></u></span></div><div class="mk-list"><p class="done"><i></i>1-1 시작 전 체크리스트</p><p class="done"><i></i>1-2 첫 상품 고르기</p><p class="cur"><i></i>2-1 마진 계산하기</p><p><i></i>2-2 상세페이지 만들기</p></div></div><div class="mk-prog"><span>전체 진도</span><b>67%</b><span class="mk-pbar"><u></u></span></div></div>';
    if (k === "files") return '<div class="mk-win">' + mkBar("수업 자료") + '<div class="mk-files">' + [["PDF", "실전 교재", "42쪽"], ["XLSX", "마진 · ROAS 계산기", "엑셀"], ["PDF", "첫 주문 체크리스트", "12항목"], ["ZIP", "상세페이지 템플릿", "5종"]].map((x, i) => '<p style="--k:' + i + '"><em class="t-' + x[0].toLowerCase() + '">' + x[0] + "</em><b>" + x[1] + "</b><small>" + x[2] + '</small><span class="mk-dl"></span></p>').join("") + "</div></div>";
    if (k === "note") return '<div class="mk-win">' + mkBar("강의 노트") + '<div class="mk-notes">' + [["03:12", "재고 없이 시작 → 위탁 · 구매대행부터"], ["12:40", "마진 30% 아래는 광고비에 다 먹혀요"], ["21:05", "첫 주문은 리뷰 체험단으로"]].map((x, i) => '<p style="--k:' + i + '"><time>' + x[0] + "</time><span>" + x[1] + "</span></p>").join("") + '<span class="mk-pen">+ 메모하기</span></div></div>';
    if (k === "ai") return '<div class="mk-win">' + mkBar("AI 조교 · 24시간") + '<div class="mk-chat"><p class="me">첫 상품은 어떻게 골라야 해요?</p><p class="bot">강의에서 말한 기준 세 가지를 먼저 보세요. ① 마진 30% 이상 ② 재구매가 되는 상품 ③ 배송이 쉬운 상품이에요.</p><p class="me">마진 계산은 어디서 해요?</p><p class="bot typing"><i></i><i></i><i></i></p></div></div>';
    if (k === "coach") return '<div class="mk-win">' + mkBar("1:1 코칭 · TEA TIME") + '<div class="mk-coach"><p class="q"><small>내 코칭 질문 · 남은 코칭 2회</small>마진 22%인데 광고를 시작해도 될까요?</p><p class="a"><i class="mk-av">강</i><span><b>강사님 답변</b>광고보다 리뷰 체험단부터 해 보세요. 마진이 30%를 넘으면 그때 시작해요.</span></p><p class="tea"><em>TEA TIME</em><span>11/12 (수) 19:00 · 강남</span><u>확정</u></p></div></div>';
    if (k === "cert") return '<div class="mk-cert"><small>CERTIFICATE OF COMPLETION</small><b>수료증</b><span class="mk-cert-n">김OO</span><p>위 사람은 DOOGO CLASS 클래스를<br>끝까지 수료했기에 이 증서를 드려요.</p><span class="mk-seal">DOOGO<br>CLASS</span></div><div class="mk-badges"><span>첫 수강</span><span>3일 연속</span><span class="on">첫 완강</span></div>';
    return "";
  }
  function whyBand(r) {
    return '<section class="vd-sec vd-why"><div class="vd-why-in"><div class="vd-why-h">' + (r.tag ? '<span class="vd-why-k" data-rv="fade">' + esc(r.tag) + "</span>" : "") + "<h2 data-eg>" + egTitle(r.t) + '</h2><p data-rv="fade">강의만 팔지 않아요. 결제한 날부터 실제로 해 보는 날까지, 강의실 · 자료 · AI 조교 · 강사님 코칭이 함께 움직여요.</p><a class="vd-why-more" href="' + esc(r.more || "#/vod/about") + '">DOOGO CLASS가 다른 이유 ' + icon("arrowRight", "xs") + "</a></div>" +
      '<div class="vd-why-g" data-rv-kids>' + SYS.map((x, i) => '<div class="vd-why-c"><div class="vd-mk vd-mk-' + x[0] + '" aria-hidden="true">' + sysMock(x[0]) + "</div><small>0" + (i + 1) + "</small><b>" + x[1] + "</b><p>" + x[2] + "</p></div>").join("") + "</div></div></section>";
  }
  // 분야별: 분야 탭을 누르면 그 분야의 판매 중인 클래스만 (판매 영역을 따라요)
  function catSecBody() {
    const cs = cats().map((c) => [c, listed().filter((p) => p.cat === c.key).sort((a, b) => soldOf(b) - soldOf(a))]).filter((x) => x[1].length);
    if (!cs.length) return "";
    const cur = cs.find((x) => x[0].key === ui.hcat) || cs[0]; ui.hcat = cur[0].key;
    return '<div class="vd-hcat-tabs" role="tablist" aria-label="분야">' + cs.map((x) => '<button type="button" role="tab" aria-selected="' + (x === cur) + '" class="' + (x === cur ? "on" : "") + '" data-v="hcat" data-k="' + esc(x[0].key) + '">' + esc(x[0].label) + "<small>" + x[1].length + "</small></button>").join("") + "</div>" +
      '<div class="vd-row" id="vd-r-cat">' + cur[1].slice(0, 6).map((p) => card(p)).join("") + "</div>" +
      '<div class="vd-hcat-f"><a class="vd-hcat-all" href="#/vod/c/' + esc(cur[0].key) + '">' + esc(cur[0].label) + " 클래스 전체보기 <b>" + cur[1].length + "</b>" + icon("chevRight", "xs") + "</a>" + pager("vd-r-cat") + "</div>";
  }
  function catSec(r) {
    const b = catSecBody(); if (!b) return "";
    return '<section class="vd-sec vd-hcat"><div class="vd-sec-h"><div class="vd-sec-t">' + (r.tag ? '<span class="vd-tag vd-tag-' + TAGC[r.color] + '" data-rv="fade">' + esc(r.tag) + "</span>" : "") + "<h2 data-eg>" + egTitle(r.t) + '</h2></div><div class="vd-sec-r"><a class="vd-more" href="' + esc(r.more || "#/vod/c/all") + '">전체 클래스' + icon("chevRight", "xs") + '</a></div></div><div id="vd-hcat">' + b + "</div></section>";
  }

  /* ---------- 강사진: 홈 줄 · 강사진 페이지(#/vod/teachers) · 강사 페이지(#/vod/teachers/<강사>) ---------- */
  // 지금 DOOGO CLASS에서 판매 중(또는 오픈 예정)인 강의가 있는 강사만
  function teacherList() {
    const map = {};
    V().products.filter((p) => tkey(p) && (p.status === "soon" || (p.status === "on" && !eventPast(p))) && bizShow(p)).forEach((p) => {
      const k = tkey(p), t = (map[k] = map[k] || { iid: k, name: p.creator, tag: p.tagline || "", cats: [], ps: [], sold: 0, ph: "" });
      if (!t.ph) t.ph = phOf(p);
      const cl = catOf(p.cat).label; if (t.cats.indexOf(cl) < 0) t.cats.push(cl); t.ps.push(p); t.sold += soldOf(p);
      if (!t.tag && p.tagline) t.tag = p.tagline;
    });
    // 순서: 첫 화면 강사진과 같게 문대표 → 초이 → 나머지(강의 많은 순 → 수강생 많은 순)
    const pri = (t) => { const i = ["moon", "choi"].indexOf(t.iid); return i < 0 ? 9 : i; };
    return Object.keys(map).map((k) => map[k]).sort((a, b) => pri(a) - pri(b) || b.ps.length - a.ps.length || b.sold - a.sold);
  }
  const snsOf = (iid) => { const b = ((DB.content && DB.content(iid)) || {}).brand || {}, url = (v, base) => (!v ? "" : /^https?:\/\//.test(v) ? v : base + String(v).replace(/^@/, "")); return [[url(b.instagram, "https://instagram.com/"), "camera", "인스타그램"], [url(b.youtubeChannel, "https://youtube.com/"), "video", "유튜브"], [url(b.kakaoChannel, "https://pf.kakao.com/"), "message", "카카오톡 채널"]].filter((x) => x[0]); };
  const tHref = (iid) => "#/vod/teachers/" + encodeURIComponent(iid);
  function tcCard(t, i) {
    const ph = t.ph || insPhoto(t.iid), sns = snsOf(t.iid);
    return '<div class="vd-tc" style="--c:' + ACC[(i + 1) % ACC.length] + '"><a class="vd-tc-main" href="' + tHref(t.iid) + '"><span class="vd-tc-ph vd-tc-s' + (i % 4) + '"><i class="vd-tc-bg" aria-hidden="true"></i>' + (ph ? '<img src="' + esc(ph) + '" alt="" loading="lazy">' : "<em>" + esc((t.name || "D").slice(0, 1)) + "</em>") + '<span class="vd-tc-n">클래스 ' + t.ps.length + "</span></span>" +
      "<b>" + esc(t.name || "") + "</b><small>" + esc(t.tag || t.cats.join(" · ")) + '</small><span class="vd-tc-cat">' + esc(t.cats.slice(0, 2).join(" · ")) + "</span></a>" +
      '<span class="vd-tc-sns">' + sns.map((x) => '<a href="' + esc(x[0]) + '" target="_blank" rel="noopener" aria-label="' + esc(t.name) + " " + x[2] + '">' + icon(x[1], "xs") + "</a>").join("") + '<a href="' + tHref(t.iid) + '" aria-label="' + esc(t.name) + ' 강사 페이지">' + icon("arrowUpRight", "xs") + "</a></span></div>";
  }
  // 홈 강사진: ‘강사진’ 글씨를 누르면 강사진 페이지로
  function teachers() {
    const list = teacherList().slice(0, 8);
    if (!list.length) return "";
    return '<section class="vd-sec vd-teach"><div class="vd-teach-h"><a class="vd-teach-link" href="#/vod/teachers"><h2 data-eg>강사진</h2><span data-rv="fade">Teachers</span>' + icon("chevRight", "sm") + '</a><p data-rv="fade">직접 해서 번 사람만 가르쳐요.</p><a class="vd-more vd-teach-more" href="#/vod/teachers">강사진 전체보기' + icon("chevRight", "xs") + '</a></div><div class="vd-teach-g" data-rv-kids>' + list.map(tcCard).join("") + "</div></section>";
  }
  function pageTeachers() {
    const list = teacherList(), n = list.reduce((a, t) => a + t.ps.length, 0);
    return shell("teachers", '<div class="vd-wrap vd-tpg"><div class="vd-tpg-h"><p class="vd-tpg-k" data-rv="fade">DOOGO CLASS TEACHERS</p><h1 class="vd-h1">강사진 <small>' + list.length + "명 · 클래스 " + n + "개</small></h1><p data-rv=\"fade\">직접 해서 번 사람만 가르쳐요. 강사님을 누르면 그 강사님이 DOOGO CLASS에서 여는 강의만 모아 볼 수 있어요.</p></div>" +
      (list.length ? '<div class="vd-teach-g vd-tpg-g" data-rv-kids>' + list.map(tcCard).join("") + "</div>" : emptyBox("users", "강사진을 준비하고 있어요", "곧 새로운 강사님이 찾아와요.", "")) + "</div>", "");
  }
  function pageTeacher(iid) {
    const list = teacherList(), i = list.findIndex((x) => x.iid === iid), t = list[i];
    if (!t) return shell("teachers", '<div class="vd-wrap vd-tpg">' + emptyBox("users", "찾는 강사님이 없어요", "지금 DOOGO CLASS에서 강의하는 강사님을 확인해 보세요.", '<a class="vd-btn vd-btn-p" href="#/vod/teachers">강사진 보기</a>') + "</div>", "");
    const b = ((DB.content && DB.content(iid)) || {}).brand || {}, ph = t.ph || insPhoto(iid), sns = snsOf(iid), lp = DB.landingOf && DB.landingOf(iid);
    const career = lp && lp.about && Array.isArray(lp.about.career) ? lp.about.career.slice(0, 5).map((x) => (typeof x === "string" ? x : x.text || x.title || "")).filter(Boolean) : [];
    const rv = t.ps.reduce((a, p) => { const r = ratingOf(p.id); return { n: a.n + r.n, s: a.s + r.avg * r.n }; }, { n: 0, s: 0 });
    const bio = (t.ps.find((p) => p.creatorBio) || {}).creatorBio || (t.name + "님은 직접 해서 번 경험을 DOOGO CLASS 강의로 나누고 있어요. 강의를 누르면 커리큘럼 · 미리보기 · 수강 후기를 볼 수 있어요.");
    const G = [["vod", "VOD 강의", (p) => p.status === "on" && typeOf(p) === "vod"], ["ebook", "전자책 · 종이책", (p) => p.status === "on" && (typeOf(p) === "ebook" || isBook(p))], ["event", "LIVE · 오프라인", (p) => p.status === "on" && isEvent(p)], ["soon", "오픈 예정", (p) => p.status === "soon"]];
    const groups = G.map((g) => [g, t.ps.filter(g[2]).sort((a, c) => soldOf(c) - soldOf(a))]).filter((x) => x[1].length);
    const others = list.filter((x) => x !== t);
    return shell("teachers", '<div class="vd-tp">' +
      '<section class="vd-tp-hero" style="--c:' + ACC[(i + 1) % ACC.length] + '"><div class="vd-wrap vd-tp-in"><nav class="vd-tp-bc" aria-label="위치"><a href="#/vod/teachers">강사진</a>' + icon("chevRight", "xs") + "<span>" + esc(t.name) + "</span></nav>" +
        '<div class="vd-tp-ph" data-rv><i class="vd-tp-bg" aria-hidden="true"></i>' + (ph ? '<img src="' + esc(ph) + '" alt="' + esc(t.name) + ' 강사">' : "<em>" + esc((t.name || "D").slice(0, 1)) + "</em>") + "</div>" +
        '<div class="vd-tp-info"><small class="vd-tp-k" data-rv="fade">DOOGO CLASS 강사</small><h1 data-eg>' + esc(t.name) + "</h1>" + (t.tag || b.field ? '<p class="vd-tp-tag" data-rv>' + esc(t.tag || b.field) + "</p>" : "") +
          '<ul class="vd-tp-cats" data-rv>' + t.cats.map((c) => "<li>" + esc(c) + "</li>").join("") + "</ul>" +
          '<dl class="vd-tp-st" data-rv-kids><div><dt>클래스</dt><dd><i data-count="' + t.ps.length + '">' + t.ps.length + "</i>개</dd></div><div><dt>누적 수강생</dt><dd><i data-count=\"" + t.sold + '">' + t.sold.toLocaleString() + "</i>명+</dd></div>" + (rv.n ? "<div><dt>수강 후기</dt><dd>★ " + (rv.s / rv.n).toFixed(1) + "<small> (" + rv.n + ")</small></dd></div>" : "") + "</dl>" +
          '<p class="vd-tp-bio" data-rv>' + esc(bio) + "</p>" +
          (career.length ? '<ul class="vd-tp-car" data-rv>' + career.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>" : "") +
          (sns.length ? '<div class="vd-tp-sns">' + sns.map((x) => '<a href="' + esc(x[0]) + '" target="_blank" rel="noopener">' + icon(x[1], "xs") + x[2] + "</a>").join("") + "</div>" : "") + "</div></div></section>" +
      '<div class="vd-wrap vd-tp-body">' + groups.map(([g, ps]) => '<section class="vd-gsec"><div class="vd-gsec-h"><span class="vd-tag vd-tag-' + (g[0] === "ebook" ? "blue" : g[0] === "soon" ? "orange" : g[0] === "event" ? "pink" : "red") + '">' + g[1] + "</span><h2>" + esc(t.name) + " 강사의 " + g[1] + '</h2><span class="vd-gsec-n">' + ps.length + '개</span></div><div class="vd-grid">' + ps.map((p) => card(p)).join("") + "</div></section>").join("") +
        (others.length ? '<section class="vd-gsec vd-tp-more"><div class="vd-gsec-h"><h2>다른 강사님도 만나 보세요</h2><a class="vd-more" href="#/vod/teachers">강사진 전체보기' + icon("chevRight", "xs") + '</a></div><div class="vd-teach-g" data-rv-kids>' + others.slice(0, 4).map(tcCard).join("") + "</div></section>" : "") +
      "</div></div>", "");
  }

  /* ---------- 전체 클래스 (무료 · VOD · 전자책 · 프리미엄) ---------- */
  const GSEC = { flive: ["무료 LIVE", "FREE LIVE", "video", "yellow"], eb: ["얼리버드 할인", "EARLY BIRD", "clock", "red"], free: ["무료강의", "FREE", "sparkles", "yellow"], vod: ["VOD 강의", "VOD", "monitorPlay", "red"], ebook: ["전자책", "E-BOOK", "book", "blue"], premium: ["프리미엄 강의", "LIVE · OFFLINE", "award", "pink"] };
  const GBIZ = { ebook: "ebook", premium: "live", free: "free", flive: "flive", eb: "flive" };
  const gItems = (k) => (k === "flive" ? freeLives().concat(liveItems()) : k === "eb" ? ebItems() : k === "free" ? vodItems(true) : k === "premium" ? typeItems("event").concat(premiumItems()) : k === "ebook" ? typeItems("ebook") : vodItems(false));
  const sortItems = (it, s) => sortList(it.filter((x) => !x.ext).map((x) => x.p), s).map((p) => ({ href: "#/vod/p/" + p.id, p })).concat(it.filter((x) => x.ext));
  /** 전체 클래스 (#/vod/c/all) · 분야 (#/vod/c/<분야>) — 분야를 골라도 ‘전체 클래스’ 안에서 VOD · 전자책 … 종류별로 묶어 보여요 */
  function pageAll(ck) {
    const qs = route().qs, cat = ck && cats().some((c) => c.key === ck) ? ck : "", want = qs.get("tab");
    const avail = ["vod", "ebook", "flive", "eb", "premium", "free"].filter((k) => (!GBIZ[k] || bizOn(GBIZ[k])) && (k !== "eb" || want === "eb" || ebItems().length));
    const tab = avail.indexOf(want) >= 0 ? want : "all", keys = tab === "all" ? avail : [tab], s = qs.get("sort") || "pop";
    const TABN = { vod: "VOD 강의", ebook: "전자책", flive: "무료 LIVE", eb: "얼리버드", premium: "LIVE · 오프라인", free: "무료강의" };
    const url = (t, c, srt) => "#/vod/c/" + (c || "all") + (t && t !== "all" ? "?tab=" + t : "") + (srt ? (t && t !== "all" ? "&" : "?") + "sort=" + srt : "");
    const offNote = want && GSEC[want] && avail.indexOf(want) < 0 ? '<div class="vd-biz-off">' + icon("bell", "sm") + "<div><b>" + GSEC[want][0] + "는 지금 준비 중이에요</b><p>지금 DOOGO CLASS는 VOD" + (bizOn("ebook") ? " · 전자책" : "") + " 클래스로 만나요. 열리면 가장 먼저 알려 드릴게요.</p></div></div>" : "";
    let total = 0;
    const body = keys.map((k) => {
      let it = gItems(k); if (cat) it = it.filter((x) => !x.ext && x.p.cat === cat); if (tab !== "all") it = sortItems(it, s);
      total += it.length; const sid = "vd-g-" + k;
      if (!it.length) return tab === "all" ? "" : emptyBox(GSEC[k][2], (cat ? catOf(cat).label + " 분야에는 아직 " + GSEC[k][0] + "가 없어요" : "지금 열린 강의가 없어요"), "다른 분야를 보거나 오픈 예정 클래스에서 알림을 받아 보세요.", '<a class="vd-btn vd-btn-o" href="' + url(tab, "") + '">전체 분야 보기</a><a class="vd-btn vd-btn-o" href="#/vod/c/soon">오픈 예정 보기</a>');
      return '<section class="vd-gsec"><div class="vd-gsec-h"><span class="vd-tag vd-tag-' + GSEC[k][3] + '">' + GSEC[k][1] + "</span><h2>" + (cat ? esc(catOf(cat).label) + " · " : "") + GSEC[k][0] + '</h2><span class="vd-gsec-n">' + it.length + "개</span>" + (tab === "all" ? '<a class="vd-more" href="' + url(k, cat) + '">전체보기' + icon("chevRight", "xs") + "</a>" : "") + "</div>" +
        '<div class="' + (tab === "all" ? "vd-row" : "vd-grid") + '" id="' + sid + '">' + it.map((x) => anyCard(x)).join("") + "</div>" + (tab === "all" && it.length > 3 ? pager(sid) : "") + "</section>"; }).join("");
    const empty = !total && tab === "all" ? emptyBox("sparkles", (cat ? esc(catOf(cat).label) + " 클래스를 준비하고 있어요" : "지금 열린 강의가 없어요"), "곧 열릴 클래스는 ‘오픈 예정’에서 알림을 받아 볼 수 있어요.", '<a class="vd-btn vd-btn-p" href="#/vod/c/soon">오픈 예정 보기</a><a class="vd-btn vd-btn-o" href="#/vod/c/all">전체 클래스 보기</a>') : "";
    const title = cat ? esc(catOf(cat).label) + " <small>" + total + "개</small>" : tab === "all" ? "전체 클래스" : GSEC[tab][0];
    return shell(tab === "all" || cat ? "all" : tab, '<div class="vd-wrap vd-all">' + (cat ? '<nav class="vd-tp-bc vd-all-bc" aria-label="위치"><a href="' + url(tab, "") + '">전체 클래스</a>' + icon("chevRight", "xs") + "<span>" + esc(catOf(cat).label) + "</span></nav>" : "") + '<h1 class="vd-h1">' + title + "</h1>" + offNote +
      '<nav class="vd-gtabs" aria-label="강의 종류"><a href="' + url("all", cat) + '" class="' + (tab === "all" ? "on" : "") + '">전체</a>' + avail.map((k) => '<a href="' + url(k, cat) + '" class="' + (tab === k ? "on" : "") + '">' + TABN[k] + "</a>").join("") + "</nav>" +
      '<nav class="vd-pills" aria-label="분야"><a class="vd-pill' + (cat ? "" : " on") + '" href="' + url(tab, "") + '">전체</a>' + cats().map((c) => '<a class="vd-pill' + (c.key === cat ? " on" : "") + '" href="' + url(tab, c.key) + '">' + esc(c.label) + "</a>").join("") + "</nav>" +
      (tab !== "all" ? '<div class="vd-sorts">' + [["pop", "인기순"], ["like", "찜 많은 순"], ["new", "최신순"], ["sale", "할인율순"], ["low", "낮은 가격순"]].map((x) => '<a class="' + (s === x[0] ? "on" : "") + '" href="' + url(tab, cat, x[0]) + '">' + x[1] + "</a>").join("") + "</div>" : "") +
      body + empty + "</div>", "all");
  }
  /* ---------- 오픈 예정 · 분야 · 검색 ---------- */
  function sortList(list, s) {
    const by = { pop: (a, b) => soldOf(b) - soldOf(a), new: (a, b) => b.createdAt - a.createdAt, low: (a, b) => priceOf(a) - priceOf(b), sale: (a, b) => pctOf(b) - pctOf(a), like: (a, b) => likeCount(b) - likeCount(a) };
    return list.slice().sort(by[s] || by.pop);
  }
  function listPage(key, q) {
    let list = listed(), title = "", nav = "all", sub = "";
    if (q != null) { const k = q.trim().toLowerCase(); title = k ? "‘" + q.trim() + "’ 검색 결과" : "클래스 검색"; list = k ? products().filter(bizShow).filter((p) => (p.title + " " + p.sub + " " + p.creator + " " + catOf(p.cat).label + " " + (p.hook || "") + " " + TYPE[typeOf(p)][0]).toLowerCase().indexOf(k) >= 0) : list; nav = ""; }
    else if (key === "soon") { title = "오픈 예정"; sub = "알림을 신청하면 오픈할 때 할인가로 가장 먼저 알려 드려요."; list = V().products.filter((p) => p.status === "soon" && bizShow(p)); nav = "soon"; }
    else if (key === "best") title = "BEST 클래스";
    else if (key === "new") title = "새로 열린 클래스";
    else if (key === "free") { title = "무료 특강"; list = list.filter((p) => priceOf(p) === 0); }
    else if (!cats().some((c) => c.key === key)) { title = "찾는 분야가 없어요"; list = []; }
    else { title = catOf(key).label; list = list.filter((p) => p.cat === key); }
    const known = q == null && cats().some((c) => c.key === key);
    const s = route().qs.get("sort") || (key === "new" ? "new" : "pop"); list = sortList(list, s);
    const base = q != null ? "#/vod/search?q=" + encodeURIComponent(q) + "&" : "#/vod/c/" + key + "?";
    const sorts = [["pop", "인기순"], ["like", "찜 많은 순"], ["new", "최신순"], ["sale", "할인율순"], ["low", "낮은 가격순"]];
    return shell(nav, '<div class="vd-wrap vd-list">' +
      (q != null ? '<form class="vd-search vd-search-lg" data-vd-search><input name="q" type="search" value="' + esc(q) + '" placeholder="클래스 · 크리에이터 · 부업으로 찾기" aria-label="클래스 검색"><button type="submit" aria-label="검색">' + icon("search", "sm") + "</button></form>" : "") +
      '<div class="vd-list-h"><div><h1 class="vd-h1">' + esc(title) + " <small>" + list.length + "개</small></h1>" + (sub ? "<p>" + sub + "</p>" : "") + "</div></div>" +
      (q == null && key !== "soon" ? '<nav class="vd-pills" aria-label="분야"><a class="vd-pill" href="#/vod/c/all">전체</a>' + cats().map((c) => '<a class="vd-pill' + (c.key === key ? " on" : "") + '" href="#/vod/c/' + esc(c.key) + '">' + esc(c.label) + "</a>").join("") + "</nav>" : "") +
      (key !== "soon" ? '<div class="vd-sorts">' + sorts.map((x) => '<a class="' + (s === x[0] ? "on" : "") + '" href="' + base + "sort=" + x[0] + '">' + x[1] + "</a>").join("") + "</div>" : "") +
      (list.length ? '<div class="vd-grid">' + list.map((p) => card(p)).join("") + "</div>" : known ? emptyBox("sparkles", esc(title) + " 클래스를 준비하고 있어요", "곧 열릴 클래스는 ‘오픈 예정’에서 알림을 받아 볼 수 있어요.", '<a class="vd-btn vd-btn-p" href="#/vod/c/soon">오픈 예정 보기</a><a class="vd-btn vd-btn-o" href="#/vod/c/all">전체 클래스 보기</a>') : emptyBox("search", q != null && q.trim() ? "‘" + esc(q.trim()) + "’에 대한 결과가 없어요." : "찾는 클래스가 없어요", "다른 단어로 찾아보거나 분야부터 골라 보세요.", '<a class="vd-btn vd-btn-o" href="#/vod/c/all">전체 클래스 보기</a>')) +
      "</div>", nav === "all" ? "all" : "");
  }
  /* ---------- DOOGO CLASS 소개: 왜 DOOGO CLASS VOD인가 (검증된 강사 · 단계별 커리큘럼 · 끝까지 가는 학습 시스템) ----------
   * 특정 강의(귤밭 · 산지 등) 이야기 대신, 어떤 클래스가 올라와도 통하는 ‘돈을 내고 들을 이유’를 보여 줘요. 그림은 CSS로 그린 예시 화면 */
  const AB_SLIDES = [["더", "체계적으로.", "처음부터 첫 매출까지,\n순서대로 짠 커리큘럼으로 배워요."], ["더", "실전으로.", "이론을 길게 듣기 전에,\n내일 바로 해볼 것부터 배워요."], ["더", "끝까지.", "진도 · AI 조교 · 강사님 코칭으로,\n혼자 멈추지 않게 이어가요."]];
  const AB_SYS = [
    ["room", "두잉고 강의실", "결제하면 바로 열리는 나만의 강의실", "영상 · 진도 · 이어 보기 · 완료 표시를 한 곳에서. 어디까지 들었는지 기억하지 않아도, 들어가면 멈춘 곳부터 이어져요."],
    ["files", "수업 자료 · 템플릿", "강사님이 실제로 쓰는 자료를 그대로", "교재 PDF · 마진 계산기 · 체크리스트 · 템플릿까지. 보고 끝나는 게 아니라, 받은 자료로 바로 따라 해요."],
    ["note", "강의 노트", "중요한 장면은 시간과 함께 메모", "영상 속 그 장면으로 바로 돌아가는 타임라인 메모. 다 듣고 나면 나만의 실행 노트가 남아요."],
    ["ai", "24시간 AI 조교", "막히는 순간, 밤 12시에도 바로 질문", "강의 내용을 아는 AI 조교가 바로 답해요. 더 깊은 고민은 1:1 코칭권으로 강사님께 직접 물어볼 수 있어요."],
    ["coach", "강사님 1:1 코칭 · TEA TIME", "강의를 만든 강사님께, 내 사업을 직접 물어봐요", "1:1 코칭권으로 내 상품 · 내 상황에 맞는 답을 받고, TEA TIME으로 강사님을 직접 만나요. 영상만 보고 혼자 헤매지 않게, 막히는 지점에서 사람이 답해요."]
  ];
  function pageAbout() {
    const sl = ui.abSlide || 0, ps = listed(), tl = teacherList();
    const learners = V().products.reduce((a, p) => a + soldOf(p), 0), rv = (V().reviews || []).filter((r) => Number(r.rating) > 0), avg = rv.length ? rv.reduce((x, r) => x + Number(r.rating), 0) / rv.length : 0;
    const mq = '<span>따라 하면</span><i>✳</i><span>바로 쓰는</span><i>✳</i><span>실전 노하우</span><i>✳</i><span class="en">DOOGO CLASS</span><i>✳</i>';
    const dot = (t) => '<p class="ab-dot"><i></i>' + t + "</p>";
    const stat = (n, unit, label) => '<div><b><i data-count="' + n + '">' + Number(n).toLocaleString() + "</i>" + unit + "</b><span>" + label + "</span></div>";
    const mark = (v) => (v === "y" ? icon("check", "sm") + '<span class="vd-sr">있어요</span>' : v === "n" ? '<i class="ab2-x" aria-hidden="true"></i><span class="vd-sr">없어요</span>' : '<i class="ab2-tri" aria-hidden="true">△</i><span class="vd-sr">일부</span>');
    const CMP = [["처음부터 첫 매출까지, 순서대로 짠 커리큘럼", "m", "y", "y"], ["직접 해서 번 강사의 실제 화면 · 사례", "m", "m", "y"], ["실제로 쓰는 자료 · 템플릿 · 계산기", "n", "m", "y"], ["막힐 때 물어볼 곳 (AI 조교 · 1:1 코칭)", "n", "n", "y"], ["강사님 1:1 코칭 · TEA TIME", "n", "n", "y"], ["진도 · 강의 노트", "n", "y", "y"], ["강의 업데이트 소식", "n", "n", "y"], ["수강 기간 선택 (180일 · 365일 · 3년) · 연장", "n", "m", "y"]];
    return shell("about", '<div class="ab">' +
      // 1) 첫 화면 + 숫자
      '<section class="ab-hero"><div class="vd-wrap"><div class="ab-hero-in"><div>' + dot("돈 되는 노하우를, 체계적으로") + '<h1 data-eg>돈 되는 일,<br>DOOGO CLASS에서<br>배워봐.</h1></div>' +
        '<div class="ab-hero-r" data-rv><b>돈은 더 벌고 싶은데,<br>어디서부터 시작할지 막막하다면.</b><p>쇼핑몰 · 마케팅 · AI · 재테크까지.<br>직접 해서 번 사람의 노하우를,<br><strong>끝까지 가는 학습 시스템</strong>으로 배워요.</p><div class="ab2-cta"><a class="vd-btn vd-btn-dark" href="#/vod/c/all">클래스 둘러보기 ' + icon("arrowRight", "xs") + '</a><a class="ab2-ghost" href="#/vod/teachers">강사진 보기</a></div></div></div>' +
        '<div class="ab2-stats" data-rv-kids>' + stat(learners, "명+", "누적 수강생") + stat(tl.length, "명", "강의 중인 강사") + stat(ps.length, "개", "지금 열린 클래스") + (avg ? "<div><b>" + avg.toFixed(1) + "<small> / 5</small></b><span>수강 후기 평균</span></div>" : "") + "</div></div></section>" +
      // 2) 흐르는 슬로건 (멈춤 버튼 · 움직임 줄이기 설정에서도 천천히 흘러요)
      '<section class="ab-mq' + (ui.abPaused ? " paused" : "") + '" aria-label="DOOGO CLASS 슬로건"><div class="ab-mq-track" aria-hidden="true">' + mq + mq + mq + mq + '</div><button type="button" data-v="ab-mq" aria-pressed="' + !!ui.abPaused + '">' + (ui.abPaused ? "움직임 다시 켜기" : "움직임 멈추기") + "</button></section>" +
      // 3) 문제 → 줄 긋기
      '<section class="ab-sec"><div class="vd-wrap ab-why"><p class="ab-k" data-rv="fade">DOOGO CLASS를 만든 이유</p><h2 data-eg>강의는 넘쳐나는데,<br><span data-accent>왜 내 통장은 그대로일까?</span></h2>' +
        "<p data-rv>유튜브에도, 블로그에도 ‘월 1000 버는 법’은 넘쳐나요.<br>그런데 막상 따라 해 보면, 어디서 막히는지는 아무도 알려주지 않죠.</p>" +
        '<ul class="ab2-pain" data-rv><li style="--sd:.15s"><span>듣고 나면 끝나는 강의</span></li><li style="--sd:.45s"><span>막혀도 물어볼 곳이 없는 강의</span></li><li style="--sd:.75s"><span>자료는 알아서 찾아야 하는 강의</span></li></ul>' +
        "<p data-rv>DOOGO CLASS는 이 세 가지를 <b>시스템으로</b> 풀었어요.<br>직접 해서 번 사람이 가르치고, 끝까지 가도록 강의실이 함께 움직여요.</p></div></section>" +
      // 3-1) 만드는 팀 · 현장 사진 (세미나 · 수강생 · 귤밭 산지 · 실습) — 이전 소개 페이지에서 다시 가져왔어요
      '<section class="ab-sec ab-gray ab-field"><div class="vd-wrap"><div class="ab-team-h"><div><p class="ab-team-k"><b>DOOGO</b><span>DOOGO CLASS를 만드는 팀</span></p><h2 data-eg>혼자 공부하면 멈추지만,<br>함께 하면 끝까지 가니까.</h2></div>' +
          "<p data-rv>(주)두고홀딩스는 두잉고를 운영하며<br>강사님과 수강생이 기수로 함께 달리는<br>과제 · 피드백 · 라이브 Q&A를 이어왔어요.<br>온라인에서 시작한 배움이 실제 매출로 이어지는 현장에도 함께 갔어요.</p></div>" +
        '<div class="ab-feat" data-rv><div class="ab-feat-t"><small>DOOGO CLASS의 원칙</small><b>“배움은 결국<br>실행으로 증명된다.”</b><p>강의를 듣는 데서 끝나지 않도록, 강의실에 자료 · AI 조교 · 1:1 코칭을 붙인 이유예요.</p><a href="#/doinggo">두잉고 기수 강의 알아보기 ↗</a></div><div class="ab-feat-ph"><img src="assets/vod/intro-speaker.webp" alt="오프라인 세미나에서 강의하는 모습 (AI 예시 이미지)" loading="lazy"><span>DOOGO CLASS 오프라인 세미나</span></div></div>' +
        '<figure class="ab-wide" data-rv><img src="assets/vod/intro-audience.webp" alt="강의를 듣는 수강생들 (AI 예시 이미지)" loading="lazy"><figcaption><span>함께 듣고, 서로의 실행을 응원하는 자리</span><span>DOOGO CLASS Alumni</span></figcaption></figure>' +
        '<div class="ab-trio" data-rv-kids>' + [["panel", "경험을 나누는 대화", "현장에서 직접 묻고, 바로 답을 들었어요."], ["field", "직접 찾아간 산지", "귤밭에서 생산부터 출고까지 함께 봤어요."], ["workshop", "같이 하는 실습", "상세페이지를 그 자리에서 함께 고쳐 봤어요."]].map((x) => '<figure><img src="assets/vod/intro-' + x[0] + '.webp" alt="' + x[1] + ' (AI 예시 이미지)" loading="lazy"><b>' + x[1] + "</b><span>" + x[2] + "</span></figure>").join("") + "</div>" +
        '<div class="ab-story" data-rv><p>첫 주문의 설렘도, 해 보고 나서야 알게 된 실수도.<br>누군가의 경험이 다른 사람의 첫걸음이 되길 바랐어요.</p><h3>이제 그 노하우를,<br>누구나 언제든 볼 수 있게.</h3><p>기수 강의를 기다리지 않아도, 큰 결심을 하지 않아도.<br>궁금한 분야 하나부터 원하는 기간 동안 몇 번이든 볼 수 있는 곳.</p><b>그래서, DOOGO CLASS를 만들었어요.</b><small>사진은 서비스 이해를 돕기 위한 AI 예시 이미지예요.</small></div>' +
      "</div></section>" +
      // 4) 세 가지 원칙 (검정)
      '<section class="ab2-pr"><div class="vd-wrap"><p class="ab2-k" data-rv="fade">WHY DOOGO CLASS</p><h2 data-eg>돈을 내고 들을 이유,<br><span data-accent>세 가지</span>로 증명해요.</h2>' +
        '<div class="ab2-pr-g" data-rv-kids>' + [["01", "검증된 강사", "직접 해서 번 사람만 가르쳐요.", "이론만 아는 사람이 아니라, 지금도 그 일로 돈을 버는 사람이에요. 강의를 열기 전에 실제 경험과 결과를 함께 확인해요."], ["02", "단계별 커리큘럼", "처음부터 첫 매출까지, 순서대로.", "준비 → 실행 → 판매 → 확장. 무엇부터 해야 할지 고민하지 않도록, 해 본 순서 그대로 Part를 나눴어요."], ["03", "끝까지 가는 시스템", "듣고 끝나지 않게, 끝까지.", "진도 · 강의 노트 · 수업 자료 · AI 조교 · 강사님 1:1 코칭까지. 혼자 멈추지 않도록 강의실이 같이 움직여요."]].map((x) => '<article class="ab2-pc"><span class="ab2-pc-n">' + x[0] + "</span><small>" + x[1] + "</small><b>" + x[2] + "</b><p>" + x[3] + "</p></article>").join("") + "</div></div></section>" +
      // 5) 학습 시스템 (지그재그 · 그림이 움직여요)
      '<section class="ab-sec ab2-sys"><div class="vd-wrap">' + dot("결제한 순간부터 첫 성과까지") + '<h2 data-eg>DOOGO CLASS VOD는<br><span data-accent>이렇게</span> 배워요.</h2><p class="ab-sub" data-rv>영상만 보고 끝나는 VOD가 아니에요. 결제하면 강사님의 <b>두잉고 강의실</b>이 열리고,<br>끝까지 가는 데 필요한 도구가 함께 열려요.</p>' +
        '<div class="ab2-rows">' + AB_SYS.map((x, i) => '<div class="ab2-row' + (i % 2 ? " rev" : "") + '" data-rv><div class="ab2-row-t"><small>' + String(i + 1).padStart(2, "0") + " · " + x[1] + "</small><b>" + x[2] + "</b><p>" + x[3] + '</p></div><div class="ab2-row-m"><div class="vd-mk vd-mk-' + x[0] + ' vd-mk-lg" aria-hidden="true">' + sysMock(x[0]) + "</div></div></div>").join("") + '</div><p class="ab-cmp-note" data-rv="fade">화면은 이해를 돕기 위한 예시예요. 자료 · 노트 · 코칭 구성은 클래스마다 달라요.</p></div></section>' +
      // 6) 수강 여정 (선이 그어지며 단계가 켜져요)
      '<section class="ab-sec ab-gray"><div class="vd-wrap">' + dot("수강 여정") + '<h2 data-eg>고르는 순간부터<br><span data-accent>첫 매출</span>까지.</h2>' +
        '<ol class="ab2-road" data-rv>' + [["미리보기로 맛보기", "강의마다 미리보기 영상으로 나에게 맞는지 먼저 확인해요."], ["결제하면 바로 시작", "결제 즉시 두잉고 강의실이 열려요. 기다릴 필요 없어요."], ["Part별로 따라 하기", "순서대로 듣고, 자료로 실습하고, 노트에 남겨요."], ["막히면 바로 질문", "AI 조교에게 묻고, 필요하면 1:1 코칭으로 강사님께."], ["강사님과 첫 매출까지", "1:1 코칭 · TEA TIME으로 강사님과 점검하며, 배운 그대로 첫 매출에 도전해요."]].map((x, i) => '<li style="--k:' + i + '"><span>' + String(i + 1).padStart(2, "0") + "</span><b>" + x[0] + "</b><p>" + x[1] + "</p></li>").join("") + "</ol></div></section>" +
      // 7) 무료 영상 · 일반 VOD와 비교
      '<section class="ab-sec"><div class="vd-wrap">' + dot("무료 영상과 무엇이 다른가요") + '<h2 data-eg>혼자 1년 헤맬 길을,<br><span data-accent>해 본 사람의 지도</span>로.</h2><p class="ab-sub" data-rv>무료 영상은 ‘무엇을’ 알려 주지만, ‘어떤 순서로 · 무엇을 가지고 · 막히면 어떻게’까지는 알려 주지 않아요.<br>DOOGO CLASS에서 사는 건 영상이 아니라, <b>헤매는 시간을 줄여 주는 시스템</b>이에요.</p>' +
        '<div class="ab2-cmp" data-rv><table><thead><tr><th scope="col"><span class="vd-sr">비교 항목</span></th><th scope="col">유튜브<br>무료 영상</th><th scope="col">일반 VOD<br>플랫폼</th><th scope="col" class="us">DOOGO<br>CLASS</th></tr></thead><tbody>' +
          CMP.map((r, ri) => '<tr style="--k:' + ri + '"><th scope="row">' + r[0] + "</th>" + r.slice(1).map((v, k) => '<td class="' + (k === 2 ? "us " : "") + v + '">' + mark(v) + "</td>").join("") + "</tr>").join("") +
        '</tbody></table></div><p class="ab-cmp-note" data-rv="fade">유튜브 무료 영상 · 일반 VOD 플랫폼: 보통의 경우를 뜻해요. 채널 · 서비스마다 제공 범위는 다를 수 있어요.</p></div></section>' +
      // 8) 슬라이드 카드
      '<section class="ab-sec ab-beige"><div class="vd-wrap"><div class="ab-car ab2-car"><div class="ab-car-l"><h2 data-eg>필요한 것만,<br>필요한 만큼.</h2><p data-rv>실제로 어떻게 하는지, 무엇부터 시작할지.<br>해 본 사람의 화면과 사례로 배우고, 바로 따라 해요.</p></div><div class="ab-car-r" data-rv><div class="ab-card" aria-live="polite"><small>' + String(sl + 1).padStart(2, "0") + " / 03</small><b>" + AB_SLIDES[sl][0] + "<br>" + AB_SLIDES[sl][1] + "</b><p>" + AB_SLIDES[sl][2].replace(/\n/g, "<br>") + '</p></div><div class="ab-car-ctl"><small>' + String(sl + 1).padStart(2, "0") + ' / 03</small><button type="button" data-v="ab-slide" data-d="-1" aria-label="이전">←</button><button type="button" data-v="ab-slide" data-d="1" aria-label="다음">→</button></div></div></div></div></section>' +
      // 9) 배우고 나면
      '<section class="ab-sec"><div class="vd-wrap">' + dot("강의를 듣고 나면") + '<h2 data-eg>무엇을 팔고,<br>어떻게 시작할지.</h2><p class="ab-sub" data-rv>어떤 상품을 고르고, 어디서 고객을 만나고, 어떻게 첫 매출을 내는지.<br>직접 해 본 사람에게 배웁니다.</p><h3 class="ab-h3" data-rv>배우고 나면, 이런 것들이 보이도록.</h3>' +
        '<div class="ab-three" data-rv-kids>' + [["무엇을 팔면 될까?", "시장과 상품을 고르는 기준,\n마진이 남는 구조를 알아봐요."], ["실제로 어떻게 할까?", "공급처 연락부터 첫 광고까지,\n해 본 사람의 화면으로 봐요."], ["나는 무엇부터?", "필요한 돈과 시간을 계산하고,\n이번 주에 할 첫 행동을 정해요."]].map((x, i) => "<div><small>0" + (i + 1) + "</small><b>" + x[0] + "</b><p>" + x[1].replace(/\n/g, "<br>") + "</p></div>").join("") + '</div><p class="ab-note">클래스별 내용 · 수강 기간 · 준비물은 상세 페이지에서 확인해 주세요.</p></div></section>' +
      // 10) 약속
      '<section class="ab-sec ab-beige"><div class="vd-wrap ab-split"><div>' + dot("가볍게 배우되, 알아야 할 것은 충분히") + '<h2 data-eg>환상만 키우는 강의보다,<br><span data-accent>실행에 도움이 되는</span> 강의.</h2></div><ul data-rv-kids>' +
        [["수강료 밖의 비용까지", "시작에 드는 도구 · 재고 · 광고비와 들여야 할 시간도 함께 알려줘요."], ["잘된 결과 뒤의 과정까지", "실패했던 상품, 막혔던 순간까지 솔직하게 보여줘요."], ["7일 안, 듣기 전이면 전액 환불", "결제 후 7일 이내 · 강의를 재생하지 않았다면 전액 돌려드려요. 환불 기준은 상세 페이지에 그대로 적어 둬요."], ["수입은 약속하지 않아요", "결과는 실행과 시장에 따라 달라져요. 대신 시작하는 방법은 분명하게 담아요."]].map((x) => "<li><b>" + x[0] + "</b><p>" + x[1] + "</p></li>").join("") + "</ul></div></section>" +
      // 11) 강사진
      (tl.length ? '<section class="ab-sec ab2-tch"><div class="vd-wrap"><div class="ab2-tch-h"><div>' + dot("이 사람들에게 배워요") + '<h2 data-eg>직접 해서 번 사람만<br><span data-accent>가르칩니다.</span></h2></div><a class="ab2-more" href="#/vod/teachers">강사진 전체보기 ' + icon("arrowRight", "xs") + '</a></div><div class="vd-teach-g" data-rv-kids>' + tl.slice(0, 4).map(tcCard).join("") + "</div></div></section>" : "") +
      // 12) 크리에이터
      '<section class="ab-sec ab-gray"><div class="vd-wrap"><h2 data-eg>경험이 강의가 되고,<br>누군가의 첫 매출로 이어져요.</h2><p class="ab-sub" data-rv>DOOGO CLASS 크리에이터는 직접 해서 번 경험과 노하우를 강의로 나누는 사람이에요.</p><div class="ab-flow" data-rv-kids>' +
        [["크리에이터", "노하우를 강의로 만들어요.", "강의 자료를 준비하고,\n촬영과 질문 답변에 참여해요."], ["DOOGO CLASS", "강의를 알리고,\n판매 · 운영을 맡아요.", "상세페이지와 광고를 만들고,\n결제 · 수강 관리 · 정산까지 맡아요."], ["수강생", "내 첫 매출을 만들어요.", "수강 기간 동안 보고 따라 하며,\n강의실 도구로 끝까지 가요."]].map((x, i) => (i ? '<i class="ab-arrow">→</i>' : "") + '<div class="ab-fc' + (i === 1 ? " hl" : "") + '"><small>0' + (i + 1) + "</small><b>" + x[0] + "</b><strong>" + x[1].replace(/\n/g, "<br>") + "</strong><p>" + x[2].replace(/\n/g, "<br>") + "</p></div>").join("") + "</div>" +
        // 마지막 설득: 배우는 사람이 DOOGO CLASS를 고르는 이유 (강사 정산 비율은 대외비라 공개 화면에 쓰지 않아요)
        '<div class="ab-reward ab-why3" data-rv><b>그래서, 배우는 사람은 <span data-accent>DOOGO CLASS</span>를 골라요.</b><div>' +
          [["직접 해서 번 강사", "지금도 그 일로 버는 사람에게 배워요.", "이론만 아는 사람이 아니라, 실제 화면과 숫자로 보여 주는 강사만 모셔요."], ["보고 끝나지 않는 강의실", "자료 · AI 조교 · 1:1 코칭까지.", "듣다 막히면 바로 묻고, 받은 자료로 그 자리에서 따라 해요."], ["부담 없이 시작", "미리보기로 먼저 확인해요.", "결제 후 7일 이내 · 재생 전이면 전액 환불. 나에게 맞는지 보고 시작해요."]].map((x) => "<div><small>" + x[0] + "</small><strong>" + x[1] + "</strong><p>" + x[2] + "</p></div>").join("") +
        '</div><a href="#/vod/c/all">지금 클래스 둘러보기 ↗</a></div></div></section>' +
      // 13) 마무리
      '<section class="ab-dark"><div class="vd-wrap"><p data-rv="fade">새로운 일을 해 보고 싶은 마음을,<br>다음으로 미루지 않도록.</p><b data-rv>“부업 해 보고 싶은데 뭐부터 하지?”</b><b class="lime" data-rv style="--d:.25s">“DOOGO CLASS에서 찾아봐.”</b><small data-rv="fade">그 말이 자연스럽게 나오는 곳을 만들고 있어요.</small><a class="ab2-final" href="#/vod/c/all" data-rv style="--d:.4s">지금 클래스 둘러보기 ' + icon("arrowRight", "xs") + "</a></div></section>" +
      '<section class="ab-join"><div class="vd-wrap"><div><b>크리에이터로 함께해요.</b><p>직접 해서 번 경험과 노하우를 강의로 나누는 사람,<br>DOOGO CLASS 크리에이터를 찾습니다.</p></div><button type="button" class="vd-btn vd-btn-p" data-v="recruit">강사로 지원하기 ↗</button></div></section>' +
      "</div>", "");
  }
  /* ---------- 상세 (패스트캠퍼스 강의 상세 구성 + 맛보기 · 다짐 한마디 · 기수 강의 연결) ---------- */
  const stars = (v) => [1, 2, 3, 4, 5].map((i) => '<i class="' + (v >= i - 0.25 ? "on" : v >= i - 0.75 ? "half" : "") + '">' + icon("star", "xs") + "</i>").join("");
  const REFUND = {
    vod: [["결제 후 7일 이내 · 강의를 재생하지 않았을 때", "전액 환불"], ["결제 후 7일 이내 · 강의를 재생했을 때", "들은 강의 수만큼 빼고 환불 (자료 내려받기 · 실습도 1강으로 계산)"], ["7일이 지난 뒤 · 정상 수강기간의 1/3이 지나기 전", "실 결제 금액의 2/3 환불"], ["정상 수강기간의 1/2이 지나기 전", "실 결제 금액의 1/2 환불"], ["정상 수강기간의 1/2이 지난 뒤", "환불 불가"]],
    ebook: [["결제 후 7일 이내 · 내려받기 전", "전액 환불"], ["한 번이라도 내려받은 뒤", "디지털 콘텐츠 특성상 환불 불가"]],
    book: [["보내기 전 (결제 완료)", "전액 환불 · 마이페이지에서 바로 취소"], ["상품 준비 중", "취소 요청 → 보내기 전이면 전액 환불"], ["받은 날부터 7일 이내 · 단순 변심", "반품 후 환불 (왕복 배송비는 구매자 부담)"], ["파손 · 파본 · 잘못 보낸 책", "받은 날부터 3개월 이내 교환 또는 전액 환불 (배송비는 판매자 부담)"], ["책에 낙서 · 훼손 · 비닐 포장을 뜯은 경우", "단순 변심 반품 불가"]],
    event: [["강의 3일 전까지 취소", "전액 환불"], ["강의 1~2일 전 취소", "결제 금액의 50% 환불"], ["강의 당일 · 불참", "환불 불가"]],
    free: [["무료 강의", "결제 금액이 없어 환불 대상이 아니에요"]],
    coach: [["결제 후 7일 이내 · 코칭권을 쓰지 않았을 때", "전액 환불"], ["한 번이라도 질문을 남긴 뒤", "남은 횟수 × 1회 가격만큼 환불"], ["사용 기간이 끝난 뒤", "환불 불가 (남은 횟수는 사라져요)"]],
    tea: [["강사님이 일정을 확정하기 전", "전액 환불"], ["확정된 일정 3일 전까지 취소", "전액 환불"], ["확정된 일정 1~2일 전 취소", "결제 금액의 50% 환불"], ["당일 취소 · 불참", "환불 불가"]]
  };
  /* v19 환불 규정 (마스터 › 환불 · 취소 관리에서 바꿔요)
   * instant: 회원이 마이페이지에서 바로 100% 취소 · days: 결제 후 며칠 이내 · maxUsed: 들은 강의 몇 개까지 (0 = 하나도 안 들었을 때)
   * matCounts: 자료 내려받기도 1강으로 · addons: 함께 결제한 안 쓴 코칭권도 같이 · restore: 쓴 쿠폰 · 포인트 돌려주기
   * ebookDays: 전자책 내려받기 전 · eventDays: LIVE · 오프라인 강의 며칠 전까지 */
  const RF_DEF = { instant: true, days: 7, maxUsed: 0, matCounts: true, addons: true, restore: true, ebookDays: 7, eventDays: 3 };
  const rfSet = () => Object.assign({}, RF_DEF, (V().settings || {}).refund || {});
  /** 이 강의를 얼마나 썼는지: 연 강의 · 완료한 강의 (+ 자료를 내려받았으면 1강) */
  function usedOf(mid, pid) {
    const pr = ((V().progress || {})[mid] || {})[pid]; if (!pr) return 0;
    const ids = {}; Object.keys(pr.done || {}).forEach((k) => { ids[k] = 1; }); Object.keys(pr.seen || {}).forEach((k) => { ids[k] = 1; }); if (pr.last) ids[pr.last] = 1;
    return Object.keys(ids).length + (rfSet().matCounts && pr.mat ? 1 : 0);
  }
  function markMat(mid, pid) { if (!mid || !pid) return; const pr = prog(mid, pid); pr.mat = (Number(pr.mat) || 0) + 1; pr.matAt = now(); save(); srvTrack(pid, "", "mat"); }
  /** 회원이 마이페이지에서 바로 100% 취소할 수 있는 주문인지 → { ok, why, left(남은 날), used } */
  function instantOf(o) {
    const r = rfSet(), p = o && product(o.pid);
    if (!o || o.status !== "paid" || !(o.amount > 0) || kindOf(o) !== "course" || !p) return { ok: false, why: "" };
    if (SRV() && !(o.pg && o.pg.st === "paid")) return { ok: false, why: "무통장 입금 주문은 환불 요청으로 처리해요. 계좌로 돌려드려요." };
    if (o.method === "vbank") return { ok: false, why: "가상계좌 결제는 환불 요청으로 처리해요. 환불 받을 계좌로 돌려드려요." };
    if (!r.instant) return { ok: false, why: "바로 취소는 지금 쉬고 있어요. 환불 요청을 남겨 주세요." };
    if (o.refundReq) return { ok: false, why: "환불 요청을 처리하고 있어요." };
    const t = typeOf(p), paid = o.paidAt || o.at, left = Math.ceil((paid + (t === "ebook" ? r.ebookDays : r.days) * 864e5 - now()) / 864e5);
    if (t === "book") { const st = shipStOf(o); return st === "ready" ? { ok: true, why: "책을 보내기 전이라 바로 전액 취소돼요.", left: null, used: 0 } : { ok: false, why: st === "prep" ? "상품을 준비하고 있어 취소 요청으로 처리해요." : "이미 보낸 책이라 반품 요청으로 처리해요." }; }
    if (isEvent(p)) { const ev = p.eventAt ? Date.parse(p.eventAt) : 0, dl = Math.floor((ev - now()) / 864e5); return ev && dl >= r.eventDays ? { ok: true, why: "강의 " + r.eventDays + "일 전까지는 바로 전액 취소돼요.", left: dl - r.eventDays + 1, used: 0 } : { ok: false, why: "강의 " + r.eventDays + "일 전이 지나 환불 요청으로 처리해요." }; }
    if (left <= 0) return { ok: false, why: "결제 후 " + (t === "ebook" ? r.ebookDays : r.days) + "일이 지나 환불 요청으로 처리해요." };
    if (t === "ebook") return o.dlAt ? { ok: false, why: "전자책을 내려받아 바로 취소할 수 없어요." } : { ok: true, why: "내려받기 전이라 바로 전액 취소돼요.", left, used: 0 };
    const used = usedOf(o.mid, o.pid);
    if (used > r.maxUsed) return { ok: false, why: "강의를 " + used + "개 들어 환불 요청으로 처리해요.", used };
    return { ok: true, why: r.maxUsed ? "강의를 " + r.maxUsed + "개 이하로 들어 바로 전액 취소돼요." : "아직 강의를 듣지 않아 바로 전액 취소돼요.", left, used };
  }
  /** 즉시 취소: 주문(+ 함께 결제한 안 쓴 코칭권) 전액 환불 · 쿠폰 · 포인트 돌려주기 · PG 취소 결과(pg) 기록 */
  function rfApply(o, pg) {
    const r = rfSet(), at = now(), list = [o].concat(r.addons ? V().orders.filter((x) => x.grp === o.no && x.status === "paid" && (!x.coach || !(Number(x.coach.used) > 0))) : []);
    list.forEach((x) => { if (x.tea) x.tea.st = "cancel"; Object.assign(x, { status: "refunded", refundedAt: at, refundAmount: x.amount, refundKind: "instant", refundWhy: x === o ? "회원 바로 취소 (" + (x.paidAt ? Math.max(1, Math.ceil((at - x.paidAt) / 864e5)) : 1) + "일째 · 들은 강의 " + usedOf(x.mid, x.pid) + "개)" : "함께 결제한 상품 같이 취소", refundBy: "회원", pg: pg || { st: "mock", at } }); if (r.restore) restoreOrder(x); delete x.refundReq; });
    save(); return list.reduce((a, x) => a + x.amount, 0);
  }
  /** 정식 서버 + 포트원이 연결돼 있으면 서버가 카드 결제를 취소하고, 시안에서는 이 브라우저에만 기록해요 */
  function rfCancel(o) {
    if (SRV()) return window.VOD.payApi("cancel", { no: o.no }).then((r) => { if (!r || !r.ok) throw new Error((r && r.message) || "취소하지 못했어요."); return DB.remote.refresh().then(() => r.amount); });
    if (window.VOD.payServer && window.VOD.payServer()) return window.VOD.payApi("cancel", { no: o.no }).then((r) => { if (!r || !r.ok) throw new Error((r && r.message) || "취소하지 못했어요."); return rfApply(o, { st: "done", at: now(), id: r.cancelId || "" }); });
    return Promise.resolve(rfApply(o, { st: "mock", at: now() }));
  }
  function refundTbl() {
    const r = rfSet(), t = Object.assign({}, REFUND);
    t.vod = [["결제 후 " + r.days + "일 이내 · " + (r.maxUsed ? "강의를 " + r.maxUsed + "개 이하로 들었을 때" : "강의를 하나도 듣지 않았을 때"), "100% 전액 환불" + (r.instant ? " · 마이페이지에서 바로 취소" : "")], ["결제 후 " + r.days + "일 이내 · 그보다 많이 들었을 때", REFUND.vod[1][1]]].concat(REFUND.vod.slice(2));
    t.ebook = [["결제 후 " + r.ebookDays + "일 이내 · 내려받기 전", "전액 환불" + (r.instant ? " · 마이페이지에서 바로 취소" : "")]].concat(REFUND.ebook.slice(1));
    t.event = [["강의 " + r.eventDays + "일 전까지 취소", "전액 환불" + (r.instant ? " · 마이페이지에서 바로 취소" : "")]].concat(REFUND.event.slice(1));
    const sh = shipSet(); t.book = REFUND.book.map((x, i) => (i === 2 ? [x[0], "반품 후 환불 (왕복 배송비 " + won(Number(sh.returnFee) || 0) + " 구매자 부담)"] : x));
    return t;
  }
  /** 환불 계산 기준이 되는 ‘정상 수강기간’: 기간제는 그 기간, 평생 소장은 최초 30일 (31일차부터는 무료 수강기간 · 패스트캠퍼스와 같은 방식) */
  const normalDays = (p, o) => (o && o.days ? Number(o.days) : p && p.accessDays ? Number(p.accessDays) : Number((p && p.refundDays) || V().settings.normalDays) || 30);
  const isLifetime = (p) => typeOf(p) === "vod" && !plansOf(p).length && !(p && p.accessDays);
  const periodTxt = (p) => (plansOf(p).length ? "결제할 때 고른 수강권 기간 (" + plansOf(p).map((x) => x.label).join(" · ") + ") · 결제일부터 시작 · 끝나면 1년 연장권(365일 가격의 " + extendPct() + "%)으로 진도 그대로 이어서 수강" : isLifetime(p) ? "평생 소장 · 정상 수강기간 최초 " + normalDays(p) + "일, " + (normalDays(p) + 1) + "일차부터 무료 수강기간 (기간 제한 없음)" : "결제일로부터 " + monthsTxt(normalDays(p)) + " (" + normalDays(p) + "일)");
  /** 콘텐츠 이용 안내 (패스트캠퍼스 강의 페이지 하단 고지와 같은 항목) */
  function useNotes(p) {
    const t = typeOf(p), ev = isEvent(p);
    if (ev) return ["강의 일정 · 장소 · 입장 방법은 마이페이지 › LIVE · 오프라인과 문자로 안내해요.", "강의 내용은 녹화 · 촬영 · 녹음하거나 다른 곳에 올릴 수 없어요.", "강사 사정으로 일정이 바뀌면 미리 알려 드리고, 참석이 어려우면 전액 환불해 드려요.", "천재지변 등 불가피한 사유로 진행이 어려우면 일정을 옮기거나 전액 환불해 드려요."];
    if (t === "book") return ["종이책은 택배로 보내 드려요. 결제 후 " + (Number(shipSet().outDays) || 2) + "일 안에(주말 · 공휴일 빼고) 출고하고, 보낸 날 송장 번호를 마이페이지 › 종이책 · 배송 조회에 올려 드려요.", "배송지는 책을 보내기 전까지 마이페이지에서 바꿀 수 있어요. 보낸 뒤에는 택배사로 바로 연락해 주세요.", "도서정가제에 따라 종이책에는 쿠폰을 쓸 수 없어요. 포인트는 쓸 수 있어요.", "교환 · 반품은 마이페이지 › 주문 · 결제 내역에서 요청하거나 고객센터로 알려 주세요." + (shipSet().returnAddr ? " 반품 주소: " + esc(shipSet().returnAddr) : "")];
    if (t === "ebook") return ["전자책은 결제 후 마이페이지 › 전자책에서 내려받아요. 한 번 내려받으면 디지털 콘텐츠 특성상 청약철회가 제한돼요 (전자상거래법 제17조 제2항 제5호).", "전자책은 구매한 본인만 볼 수 있어요. 무단 복제 · 배포 · 판매 · 공유는 저작권법에 따라 처벌될 수 있어요.", "내용은 더 좋은 자료로 업데이트될 수 있고, 업데이트된 파일도 다시 내려받을 수 있어요."];
    return [
      "수강 기간: " + periodTxt(p) + ". 수강 시작일은 결제일 기준이며, 회사 사정으로 시작이 늦어지면 그만큼 연장돼요.",
      "강의 영상은 내려받기 없이 스트리밍으로만 볼 수 있어요. PC · 모바일 · 태블릿에서 볼 수 있고, 한 계정에서 기기 4대까지 등록할 수 있어요 (넘으면 등록 해제 후 이용).",
      "한 아이디를 여러 사람이 함께 쓸 수 없어요. 동시 접속 기록이 쌓이면 이용이 제한될 수 있어요.",
      "강의 영상 · 자료를 무단으로 녹화 · 캡처 · 배포 · 가공 · 판매하면 저작권법에 따라 처벌될 수 있어요.",
      "디지털 콘텐츠 특성상 강의를 재생하거나 자료를 내려받으면 그 부분은 청약철회가 제한돼요 (전자상거래법 제17조 제2항 제5호). 결제 전에 무료 미리보기로 먼저 확인해 보세요.",
      "강의 내용은 강사 일정에 따라 추가 · 업데이트될 수 있어요. 천재지변 · 폐업 등 서비스를 이어 가기 어려운 경우에는 평생 소장 강의도 서비스가 종료될 수 있어요."
    ].concat(dgOpen(p) ? ["강의는 " + esc(p.creator || "강사") + " 강사 두잉고 강의실에서 봐요. 강의 영상 · 교재 · 업데이트 소식 · 실습 체크리스트를 수강 기간 동안 한 곳에서 쓸 수 있어요."] : [])
      .concat(coachOf(p) ? ["강사에게 직접 묻는 1:1 질문은 1:1 코칭권(" + coachOf(p).n + "회 · " + coachOf(p).days + "일 · " + won(coachOf(p).price) + ")으로 해요. 수강 중인 회원만 살 수 있고, 두잉고 강의실 ‘1:1 코칭 질문’에서 쓰면 1회씩 차감돼요. 그 밖의 궁금증은 자주 묻는 질문 · AI 조교로 도와드려요."] : [])
      .concat(teaOf(p) ? ["강사님과 TEA TIME(" + teaOf(p).min + "분 · " + won(teaOf(p).price) + ")은 수강 중인 회원만 신청할 수 있어요. 희망 날짜를 남기면 강사님이 일정을 확정하고, 확정 전에는 언제든 전액 환불돼요."] : []);
  }
  const refundKey = (p) => (priceOf(p) === 0 ? "free" : isEvent(p) ? "event" : typeOf(p) === "ebook" ? "ebook" : isBook(p) ? "book" : "vod");
  const refundTable = (p) => '<table class="vd-rf"><thead><tr><th>신청 시점</th><th>환불 금액</th></tr></thead><tbody>' + refundTbl()[refundKey(p)].map((r) => "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>").join("") + "</tbody></table>";
  const refundHtml = () => '<div class="vd-rf-all">' + [["VOD 강의 (수강권 · 1년 연장권)", "vod"], ["1:1 코칭권", "coach"], ["강사님과 TEA TIME", "tea"], ["전자책", "ebook"], ["종이책 (택배 배송)", "book"], ["LIVE · 오프라인 강의", "event"]].map((x) => "<h4>" + x[0] + '</h4><table class="vd-rf"><tbody>' + refundTbl()[x[1]].map((r) => "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>").join("") + "</tbody></table>").join("") + '<p class="vd-muted">VOD ‘정상 수강기간’은 결제할 때 고른 수강권 기간(180일 · 365일 · 3년, 연장권은 365일)이에요. 환불 금액은 정가가 아닌 실제 결제 금액 기준이고, 결제에 쓴 쿠폰은 다시 돌려드리지 않아요. 환불 문의: 마이페이지 › 주문 · 결제 내역 또는 고객센터 1:1 문의.</p></div>';
  /* 약관 및 정책 — 이용약관 /terms · 개인정보처리방침 /privacy · 환불정책 /refund (PG 심사 · 공유용으로 탭마다 따로 주소)
   * 글은 legal.js, 환불정책의 상품별 표 · 쿠폰 문구는 마스터 › 환불 · 취소 관리 설정을 그대로 보여 줘요 */
  const LEGAL_TABS = [["terms", "이용약관", "file"], ["privacy", "개인정보처리방침", "shieldCheck"], ["refund", "환불정책", "refresh"]];
  function legalBody(k, text) {
    const H = window.CLASS_LEGAL_HTML || ((x) => "<p>" + esc(x) + "</p>");
    if (k !== "refund") return H(text);
    const r = rfSet(), T = refundTbl();
    const tables = '<div class="vd-rf-all vd-lg-rf">' + [["VOD 강의 (수강권 · 1년 연장권)", "vod"], ["1:1 코칭권", "coach"], ["강사님과 TEA TIME", "tea"], ["전자책", "ebook"], ["종이책 (택배 배송)", "book"], ["LIVE · 오프라인 강의", "event"]].filter((x) => T[x[1]]).map((x) => "<h5>" + x[0] + '</h5><table class="vd-rf"><thead><tr><th>신청 시점</th><th>환불 금액</th></tr></thead><tbody>' + T[x[1]].map((row) => "<tr><td>" + row[0] + "</td><td>" + row[1] + "</td></tr>").join("") + "</tbody></table>").join("") +
      '<p class="vd-muted">VOD ‘정상 수강기간’은 결제할 때 고른 수강권 기간(180일 · 365일 · 3년, 연장권은 365일)이에요. 무료 클래스는 결제 금액이 없어 환불 대상이 아니며, 신청은 언제든 취소할 수 있어요.</p></div>';
    const cp = '<div class="legal-doc"><ul><li>입금 전에 취소한 주문: 쓴 쿠폰 · 포인트를 모두 돌려드려요.</li><li>' + (r.restore ? "전액 환불(바로 취소 포함): 주문에 쓴 쿠폰 · 포인트를 돌려드려요. 사용 기한이 지난 쿠폰은 돌려드리지 않아요." : "전액 환불(바로 취소 포함): 주문에 쓴 쿠폰 · 포인트는 돌려드리지 않아요.") + "</li><li>일부 환불: 실제 결제 금액을 기준으로 계산하며, 쓴 쿠폰 · 포인트는 돌려드리지 않아요.</li><li>쿠폰 · 포인트는 현금으로 바꾸거나 다른 사람에게 넘길 수 없어요.</li></ul></div>";
    return text.split(/\[\[(환불표|쿠폰)\]\]/).map((x, i) => (i % 2 ? (x === "환불표" ? tables : cp) : x.trim() ? H(x) : "")).join("");
  }
  function pageLegal(k) {
    if (!LEGAL_TABS.some((x) => x[0] === k)) k = "terms";
    const L = (window.CLASS_LEGAL || {})[k] || ["", ""], tab = LEGAL_TABS.find((x) => x[0] === k);
    const lines = String(L[1] || "").split("\n"), m = /^시행일:\s*(.+)$/.exec(lines[0] || ""), text = m ? lines.slice(1).join("\n") : L[1] || "";
    let n = 0; const doc = legalBody(k, text).replace(/<h4>/g, () => '<h4 id="lg-s' + (++n) + '">');
    const heads = text.split("\n").filter((x) => x.indexOf("## ") === 0).map((x) => x.slice(3).trim());
    const S = DB.siteInfo ? DB.siteInfo() : {}, url = "www.doogoclass.com/" + k;
    const biz = [["상호", S.company || "(주)두고홀딩스"], S.ceo && ["대표", S.ceo], S.bizNo && ["사업자등록번호", S.bizNo], S.mailOrderNo && ["통신판매업신고", S.mailOrderNo], S.address && ["주소", S.address], S.phone && ["고객센터", S.phone], ["이메일", S.email || "doogobiz@gmail.com"], S.privacyOfficer && ["개인정보 보호책임자", S.privacyOfficer]].filter(Boolean);
    return shell("legal", '<div class="vd-wrap vd-lg">' +
      '<header class="vd-lg-h"><p class="vd-tpg-k">DOOGO CLASS POLICY</p><h1 class="vd-h1">약관 및 정책</h1><p>두고클래스를 이용하기 전에 꼭 확인해 주세요. 탭마다 주소가 따로 있어 그대로 공유할 수 있어요.</p></header>' +
      '<nav class="vd-lg-tabs" aria-label="약관 및 정책">' + LEGAL_TABS.map((x) => '<a href="#/' + x[0] + '" class="' + (x[0] === k ? "on" : "") + '"' + (x[0] === k ? ' aria-current="page"' : "") + ">" + icon(x[2], "sm") + "<span>" + x[1] + "</span></a>").join("") + "</nav>" +
      '<div class="vd-lg-grid"><article class="vd-lg-doc" aria-labelledby="vd-lg-t"><div class="vd-lg-top"><h2 id="vd-lg-t">' + esc(tab[1]) + '</h2><div class="vd-lg-meta">' + (m ? "<span>" + icon("calendar", "xs") + "시행일 " + esc(m[1]) + "</span>" : "") + "<span>" + icon("link", "xs") + esc(url) + '</span><button type="button" class="vd-lg-print" data-v="print">' + icon("printer", "xs") + "인쇄</button></div></div>" + doc + "</article>" +
        '<aside class="vd-lg-side">' + (heads.length > 2 ? '<div class="vd-lg-toc"><b>목차</b>' + heads.map((h, i) => '<button type="button" data-v="jump" data-to="lg-s' + (i + 1) + '">' + esc(h) + "</button>").join("") + "</div>" : "") +
          '<div class="vd-lg-biz"><b>사업자 정보</b><dl>' + biz.map((x) => "<dt>" + x[0] + "</dt><dd>" + esc(x[1]) + "</dd>").join("") + "</dl></div></aside></div></div>", "");
  }
  const cdTxt = (end) => { const d = new Date(end).getTime() - now(); if (!(d > 0)) return "마감"; const dd = Math.floor(d / 864e5), h = Math.floor(d % 864e5 / 36e5), mi = Math.floor(d % 36e5 / 6e4), s = Math.floor(d % 6e4 / 1e3), p2 = (n) => String(n).padStart(2, "0"); return (dd ? dd + "일 " : "") + p2(h) + ":" + p2(mi) + ":" + p2(s); };
  function infoRows(p) {
    const t = typeOf(p), lz = lessons(p), left = seatsLeft(p);
    if (t === "ebook") return [["분량", (Number(p.pages) || 0) + "쪽 · " + (p.curriculum || []).length + "장"], ["형식", (p.format || "PDF") + " 파일"], ["이용", "결제 후 바로 내려받기 · 평생 소장"], ["난이도", p.level || "입문"]];
    if (t === "book") return bookRows(p);
    if (t === "live") return [["일시", fmtEvent(p.eventAt, true)], ["진행", viaOf(p) + " · " + durTxt(Number(p.eventMin) || totalMin(p))], ["정원", p.seats ? p.seats + "명 · 잔여 " + left + "석" : "제한 없음"], ["다시보기", p.replayDays ? "끝난 뒤 " + p.replayDays + "일" : "없음"]];
    if (t === "offline") return [["일시", fmtEvent(p.eventAt, true)], ["장소", p.place || "신청 후 안내"], ["정원", p.seats ? p.seats + "명 · 잔여 " + left + "석" : "제한 없음"], ["진행", durTxt(Number(p.eventMin) || totalMin(p))]];
    return [["수강 기간", accessTxt(p)], ["강의 구성", "강의 " + lz.length + "개 · 총 " + durTxt(totalMin(p))], ["난이도", p.level || "입문"], ["수강 방법", "PC · 모바일 스트리밍 · 기기 4대"]];
  }
  /** 종이책 정보: 저자 · 출판사 · 쪽수 · 판형 · 출간일 · ISBN · 배송 (적은 것만) */
  function bookRows(p) {
    const sl = stockLeft(p), pg = Number(p.pages);
    return [["저자", p.author || p.creator || "-"], ["출판사", p.publisher || "-"]].concat(pg || p.size ? [["쪽수 · 판형", [pg ? pg + "쪽" : "", p.size || ""].filter(Boolean).join(" · ")]] : []).concat(p.pubDate ? [["출간일", DB.date.fmtFull(p.pubDate)]] : []).concat(p.isbn ? [["ISBN", p.isbn]] : [])
      .concat([["배송", "결제 후 " + (Number(shipSet().outDays) || 2) + "일 안에 출고 (주말 · 공휴일 빼고) · " + shipFeeTxt(p)]]).concat(sl != null ? [["재고", sl ? sl + "권" : "품절"]] : []);
  }
  function ctaOf(p, m) {
    const own = m && owns(m.id, p.id), pend = !own && pendOrder(m && m.id, p.id), pr = priceOf(p), left = seatsLeft(p), t = typeOf(p), isLiked = liked(m && m.id, p.id);
    // 끝난 무료 LIVE: 신청자도 · 처음 온 사람도 이어지는 유료 강의(얼리버드)로 보내요
    const fn = isFreeEv(p) && eventPast(p) && bizOn("flive") ? funnelOf(p) : null, nx = fn && product(fn.next);
    if (nx && nx.status === "on" && !(m && owns(m.id, nx.id))) return { href: "#/vod/p/" + nx.id, txt: ebOf(nx) ? "얼리버드로 이어 듣기" : "이어지는 강의 보기", ic: "arrowRight" };
    if (t === "book" && p.status !== "soon") return stockLeft(p) === 0 ? { off: true, txt: "품절됐어요" } : { href: "#/vod/checkout/" + p.id, txt: own ? "한 권 더 사기" : "구매하기", ic: "truck" };
    if (own) return { href: "#/vod/learn/" + p.id, txt: t === "ebook" ? "전자책 열기" : isEvent(p) ? "신청 내역 · 입장 안내" : "강의실에서 이어 보기", ic: t === "ebook" ? "book" : isEvent(p) ? "calendar" : "play" };
    if (pend) return { href: "#/vod/order/" + pend.no, txt: "입금 대기 중 · 주문 보기", ic: "clock", dark: true };
    if (m && plansOf(p).length && hadCourse(m.id, p.id)) return { href: "#/vod/checkout/" + p.id + "?item=extend", txt: "1년 연장권으로 다시 이어서 듣기", ic: "refresh" };
    if (p.status === "soon") return { v: "like", txt: isLiked ? "알림 신청 완료" : "오픈 알림 받기", ic: "bell", on: isLiked };
    if (eventPast(p)) return { off: true, txt: "끝난 강의예요" };
    const gt = gatedBy(p); if (gt) return { href: "#/vod/p/" + gt.f.id, txt: "먼저 무료 LIVE 신청하기", ic: "video" };
    if (left === 0) return { off: true, txt: "마감됐어요" };
    const dp = defPlan(p), s = PSEL[p.id] || {}, sp = dp ? planOf(p, s.d) : null;
    return { href: "#/vod/checkout/" + p.id + (sp ? "?plan=" + sp.d + (s.coach && coachOf(p) ? "&coach=1" : "") : ""), co: !!sp, txt: pr === 0 ? (isEvent(p) ? "무료 LIVE 신청하기" : "무료로 수강신청") : t === "ebook" ? "구매하기" : isEvent(p) ? "신청하기" : "수강신청 하기" };
  }
  const ebDayTxt = (s) => { const d = DB.date.parseDate(s); return (d.getMonth() + 1) + "월 " + d.getDate() + "일(" + DOWK[d.getDay()] + ")"; };
  const shownPrice = (p) => (y365(p) ? y365(p).sale : priceOf(p));
  /* 상세 가격 상자 맨 위: 무료 LIVE ↔ 이어지는 유료 강의 안내 (판매 영역 ‘무료 LIVE’가 켜져 있을 때만) */
  function flNote(p) {
    if (!bizOn("flive")) return "";
    if (isFreeEv(p)) {
      const fn = funnelOf(p), nx = fn && product(fn.next); if (!nx || nx.status === "hidden") return "";
      if (fn.phase === "before") return '<div class="vd-fln"><span class="vd-fln-k">' + icon("gift", "xs") + "LIVE 끝나고 열리는 혜택</span><b>" + esc(nx.title) + "</b><p>LIVE가 끝나면 " + (fn.ebPrice ? "<em>얼리버드 가격</em>으로 " : "") + esc(ebDayTxt(fn.ebDay)) + "까지 열려요. 끝까지 함께하고 혜택 받아 가세요.</p></div>";
      const e = ebOf(nx);
      return '<a class="vd-fln is-after" href="#/vod/p/' + esc(nx.id) + '"><span class="vd-fln-k">' + icon(e ? "clock" : "check", "xs") + (e ? "LIVE 끝 · 얼리버드 진행 중" : "LIVE 끝 · 이어지는 강의") + "</span><b>" + esc(nx.title) + "</b>" +
        (e ? '<p class="vd-fln-p"><em>' + pctOf(nx) + "%</em><strong>" + won(shownPrice(nx)) + '</strong><small>얼리버드 마감까지 <b data-cd="' + esc(e.ebDay + "T23:59:59") + '">' + cdTxt(e.ebDay + "T23:59:59") + "</b></small></p>" : "<p>지금 정가로 들을 수 있어요 " + icon("arrowRight", "xs") + "</p>") + "</a>";
    }
    const gt = gatedBy(p); if (gt) return '<a class="vd-fln" href="#/vod/p/' + esc(gt.f.id) + '"><span class="vd-fln-k">' + icon("video", "xs") + "무료 LIVE 먼저</span><b>" + esc(gt.f.title) + "</b><p>" + esc(fmtLive(gt.f.eventAt)) + " LIVE가 끝나면 이 강의가 " + (gt.ebPrice ? "얼리버드 가격으로 " : "") + "열려요 " + icon("arrowRight", "xs") + "</p></a>";
    const e = ebOf(p); if (e) return '<div class="vd-fln is-eb"><span class="vd-fln-k">' + icon("sparkles", "xs") + "무료 LIVE 끝나고 열린 얼리버드</span><p><b>" + esc(ebDayTxt(e.ebDay)) + " 밤 12시</b>까지만 이 가격이에요. 그 뒤엔 " + (y365(p) ? "365일 수강권 " + won(r1k(y365(p).sale / (e.price / basePrice(p)))) : won(basePrice(p))) + "으로 돌아가요.</p></div>";
    return "";
  }
  const ctaHtml = (p, c, cls) => (c.off ? '<button type="button" class="vd-btn vd-btn-off ' + cls + '" disabled>' + c.txt + "</button>" : c.v ? '<button type="button" class="vd-btn vd-btn-p ' + cls + (c.on ? " is-on" : "") + '" data-v="like" data-id="' + esc(p.id) + '">' + (c.ic ? icon(c.ic, "sm") : "") + c.txt + "</button>" : '<a class="vd-btn ' + (c.dark ? "vd-btn-dark" : "vd-btn-p") + " " + cls + '" href="' + c.href + '"' + (c.co ? ' data-co-link="' + esc(p.id) + '"' : "") + ">" + (c.ic ? icon(c.ic, "sm") : "") + c.txt + "</a>");
  // 상세 본문 글: 고민 · 강의 전/후 (상품에 없으면 상품별 기본값 → 공통 기본값)
  const V5 = {
    v1: { pains: ["해외 소싱, 어디부터 연락해야 할지 모르겠어요", "통관 · 인증 서류만 보면 머리가 하얘져요", "재고가 쌓일까 봐 시작을 못 하겠어요"], before: ["연락할 공급처 0곳", "통관 · 표시사항이 뭔지 모름", "광고비만 쓰고 주문 0건"], after: ["연락할 공급처 리스트 20곳", "서류 체크리스트로 한 번에 정리", "광고 3만 원으로 첫 반응 확인"] },
    v2: { pains: ["그림을 못 그려서 굿즈는 남 얘기 같아요", "AI 그림은 매번 캐릭터가 달라져요", "만들어도 어디서 팔지 모르겠어요"], before: ["캐릭터 아이디어만 머릿속에", "매번 다른 그림이 나옴", "제작 업체 고르는 법을 모름"], after: ["일관된 내 캐릭터 1종", "스티커 · 키링 인쇄용 파일", "인스타로 첫 판매 시작"] },
    v3: { pains: ["농산물을 온라인으로 팔면 남는 게 없대요", "스마트스토어 매출이 몇 달째 그대로예요", "포장 · 배송에서 늘 클레임이 나요"], before: ["시세 따라 흔들리는 매출", "리뷰가 안 쌓이는 상세페이지", "한 번 사고 끝나는 손님"], after: ["산지 직계약으로 안정적인 마진", "제철 캘린더로 미리 준비하는 판매", "자사몰로 이어지는 재구매"] },
    v4: { pains: ["유입은 있는데 구매가 안 일어나요", "상세페이지를 뭐부터 써야 할지 모르겠어요", "디자이너에게 맡겨도 전환율이 그대로예요"], before: ["예쁘기만 한 상세페이지", "3초 만에 나가는 손님", "감으로 고치는 문장"], after: ["팔리는 7단계 순서", "첫 화면에서 사는 이유 전달", "데이터로 고치는 루틴"] }
  };
  const PD_FALLBACK = { pains: ["혼자 시작하려니 어디서부터 해야 할지 막막해요", "강의는 많은데 내 상황에 맞는 걸 모르겠어요", "해 봤는데 어디서 막히는지 모르겠어요"], before: ["무엇부터 할지 막막", "혼자 하는 시행착오", "시간만 흘러감"] };
  const pdText = (p, k) => ((p[k] || []).length ? p[k] : (V5[p.id] || {})[k] || (k === "after" ? (p.learn || []).slice(0, 3) : PD_FALLBACK[k] || []));
  const previewsOf = (p) => lessons(p).filter((l) => l.preview);
  const chapOf = (p, l) => { let r = { ci: 0, li: 0, ch: null }; (p.curriculum || []).forEach((c, ci) => (c.lessons || []).forEach((x, li) => { if (x === l) r = { ci, li, ch: c }; })); return r; };
  // 위: 왼쪽 커버(가운데 미리보기) · 오른쪽 정보 상자 (패스트캠퍼스 강의 상세 첫 화면)
  function buyTop(p) {
    const m = me(), own = m && owns(m.id, p.id), pr = priceOf(p), pct = pctOf(p), left = seatsLeft(p), isLiked = liked(m && m.id, p.id), rt = ratingOf(p.id), pvs = previewsOf(p);
    const end = saleEndOf(p), cps = m && pr > 0 && p.status === "on" ? usableCoupons(m.id, p) : [], best = cps[0], mo = monthOf(p), lk = likersOf(p);
    return '<div class="vd-buy" id="vd-pdt-info">' +
      '<div class="vd-buy-cat"><a href="#/vod/c/' + esc(p.cat) + '">' + esc(catOf(p.cat).label) + "</a>" + icon("chevRight", "xs") + "<span>" + esc(TYPE[typeOf(p)][0]) + "</span></div>" +
      badgeHtml(badgesOf(p)) +
      '<div class="vd-buy-top"><h1>' + esc(p.title) + "</h1></div>" +
      (p.sub ? '<p class="vd-pdt-sub">' + esc(p.sub) + "</p>" : "") +
      '<div class="vd-pdt-rate">' + (rt.n ? '<button type="button" data-v="jump" data-to="vd-s-reviews"><span class="vd-stars sm">' + stars(rt.avg) + "</span><b>" + rt.avg.toFixed(1) + "</b><small>(" + rt.n + ")</small></button><i></i>" : "") + (isBook(p) ? (soldOf(p) ? "<span>판매 <b>" + soldOf(p).toLocaleString() + "권+</b></span><i></i>" : "") : "<span>수강생 <b>" + soldOf(p).toLocaleString() + "명+</b></span><i></i>") + "<span>" + icon("heart", "xs") + likeCount(p) + "</span>" + (lk.length ? '<i></i><span class="vd-avs">' + lk.map((n) => av(n)).join("") + "</span>" : "") + "</div>" +
      '<dl class="vd-buy-info">' + infoRows(p).map((r) => "<div><dt>" + r[0] + "</dt><dd>" + esc(r[1]) + "</dd></div>").join("") + "</dl>" +
      (isEvent(p) && left != null ? '<div class="vd-seat"><div><span>신청 현황</span><b>' + (p.seats - left) + " / " + p.seats + "명</b></div><i><u style=\"width:" + Math.round((p.seats - left) / p.seats * 100) + '%"></u></i>' + (left && left <= 5 ? "<small>마감까지 " + left + "자리 남았어요</small>" : "") + "</div>" : "") +
      '<div class="vd-buy-price">' + (p.status === "soon" ? '<div class="vd-bp-tot"><span>오픈 예정가</span><strong>' + (pr ? won(pr) : "무료") + "</strong></div>" + (p.openAt ? '<p class="vd-buy-mo">' + fmtOpen(p.openAt) + " · 알림 신청하면 오픈 할인을 알려 드려요</p>" : "")
        : pr === 0 ? '<div class="vd-bp-tot"><span>수강료</span><strong class="free">무료</strong></div>'
        : (pct ? '<div class="vd-bp-row"><span>정가</span><s>' + won(p.price) + '</s></div><div class="vd-bp-row red"><span>할인 금액</span><b>-' + won(p.price - pr) + "</b></div>" : "") +
          '<div class="vd-bp-tot"><span>' + (pct ? "할인가" : "판매가") + "</span>" + (pct ? "<em>" + pct + "%</em>" : "") + "<strong>" + won(pr) + "</strong></div>" +
          (mo ? '<p class="vd-buy-mo">12개월 할부 시 월 <b>' + won(mo) + "</b></p>" : "") +
          (end && !own ? '<div class="vd-cd">' + icon("clock", "xs") + '<span>할인 마감까지</span><b data-cd="' + esc(end) + '">' + cdTxt(end) + "</b><span>남음</span></div>" : "") +
          (own ? "" : best ? '<p class="vd-buy-cp"><span class="vd-tag vd-tag-red">쿠폰</span>내 쿠폰 쓰면 <b>' + won(pr - best.off) + "</b>에 살 수 있어요</p>" : !m && !isBook(p) ? '<p class="vd-buy-cp"><span class="vd-tag vd-tag-red">쿠폰</span>가입하면 바로 쓰는 5,000원 할인 쿠폰을 드려요</p>' : "")) + "</div>" +
      '<div class="vd-pdt-btns"><button type="button" class="vd-likebtn' + (isLiked ? " on" : "") + '" data-v="like" data-id="' + esc(p.id) + '" aria-label="찜하기">' + icon("heart", "sm") + "<small>" + likeTxt(likeCount(p)) + '</small></button><button type="button" class="vd-likebtn vd-sharebtn" data-v="share" aria-label="공유하기">' + icon("link", "sm") + "<small>공유</small></button>" +
        (pvs.length && !own ? '<button type="button" class="vd-btn vd-btn-o vd-btn-xl vd-pdt-pv" data-v="pv-open" data-p="' + esc(p.id) + '" data-l="' + esc(pvs[0].id) + '">' + icon("play", "sm") + "미리보기</button>" : "") + ctaHtml(p, ctaOf(p, m), "vd-btn-xl") + "</div>" +
      '<p class="vd-buy-note">' + icon("shieldCheck", "xs") + (refundKey(p) === "vod" ? "결제 후 " + rfSet().days + "일 이내 · 강의를 듣기 전이면 100% 환불" : refundKey(p) === "ebook" ? "내려받기 전 7일 이내 전액 환불" : refundKey(p) === "book" ? "보내기 전이면 바로 취소 · 받은 날부터 7일 안 반품" : refundKey(p) === "event" ? "강의 3일 전까지 전액 환불" : "무료 강의 · 신청 즉시 수강") + ' <button type="button" class="vd-link" data-v="jump" data-to="vd-s-refund">환불 규정</button></p></div>';
  }
  // 아래로 내리면 따라오는 결제 막대 + 누르면 위로 열리는 옵션 창 (패스트캠퍼스 하단 구매 박스)
  function fbarHtml(p) {
    const m = me(), c = ctaOf(p, m), pr = priceOf(p), pct = pctOf(p), pvs = previewsOf(p), own = m && owns(m.id, p.id), end = own ? "" : saleEndOf(p);
    const best = m && pr > 0 && p.status === "on" ? usableCoupons(m.id, p)[0] : null, toCheckout = !!c.co || (!!c.href && /checkout\/[^?]*$/.test(c.href));
    return '<div class="vd-fbar" id="vd-fbar">' +
      (toCheckout ? '<div class="vd-fbar-panel" id="vd-fbar-panel"><div class="vd-wrap vd-fbp"><div class="vd-fbp-h"><b>수강 옵션 선택</b><button type="button" data-v="fbar" aria-label="옵션 창 닫기">' + icon("x", "sm") + "</button></div>" +
        (plansOf(p).length ? planBox(p, "b") : '<label class="vd-fbp-opt"><input type="radio" checked><span><b>' + esc(TYPE[typeOf(p)][0]) + " · " + esc(accessTxt(p)) + "</b><small>" + esc(metaOf(p).join(" · ")) + "</small></span><strong>" + won(pr) + "</strong></label>") +
        (best ? '<p class="vd-fbp-cp"><span class="vd-tag vd-tag-red">쿠폰</span>‘' + esc(best.c.name) + (plansOf(p).length ? "’ 쿠폰은 수강권 금액에 적용돼요" : "’ 쓰면 <b>" + won(pr - best.off) + "</b>") + " <small>결제 화면에서 쿠폰 · 포인트를 고를 수 있어요</small></p>" : "") +
        (plansOf(p).length ? "" : '<div class="vd-fbp-tot"><span>총 상품 금액</span>' + (pct ? "<em>" + pct + "%</em>" : "") + "<strong>" + won(pr) + "</strong></div>") + '<div class="vd-fbp-btns"><button type="button" class="vd-btn vd-btn-o vd-btn-xl" data-v="fbar">닫기</button><a class="vd-btn vd-btn-p vd-btn-xl" href="' + c.href + '"' + (c.co ? ' data-co-link="' + esc(p.id) + '"' : "") + ">" + (pr === 0 ? (isEvent(p) ? "무료 LIVE 신청하기" : "무료로 수강 시작") : "결제하기") + "</a></div></div></div>" : "") +
      '<div class="vd-wrap vd-fbar-in"><span class="vd-fbar-th">' + thumbArt(p) + '</span><div class="vd-fbar-t"><b>' + esc(p.title) + "</b><small>" + esc(TYPE[typeOf(p)][0] + " · " + accessTxt(p)) + "</small></div>" +
        '<div class="vd-fbar-p">' + (p.status === "soon" ? "<strong>오픈 예정</strong>" : pr === 0 ? '<strong class="free">무료</strong>' : plansOf(p).length ? "<small class=\"vd-fbar-from\">180일부터</small><strong>" + won(plansOf(p)[0].sale) + "</strong>" : (pct ? "<em>" + pct + "%</em>" : "") + "<strong>" + won(pr) + "</strong>") + (end ? '<small>' + icon("clock", "xs") + '<b data-cd="' + esc(end) + '">' + cdTxt(end) + "</b> 남음</small>" : "") + "</div>" +
        '<button type="button" class="vd-likebtn' + (liked(m && m.id, p.id) ? " on" : "") + '" data-v="like" data-id="' + esc(p.id) + '" aria-label="찜하기">' + icon("heart", "sm") + "<small>" + likeTxt(likeCount(p)) + "</small></button>" +
        (pvs.length && !own ? '<button type="button" class="vd-btn vd-btn-o vd-fbar-pv" data-v="pv-open" data-p="' + esc(p.id) + '" data-l="' + esc(pvs[0].id) + '">' + icon("play", "sm") + "<span>미리보기</span></button>" : "") +
        (toCheckout ? '<button type="button" class="vd-btn vd-btn-p vd-fbar-cta" data-v="fbar">' + c.txt + icon("chevDown", "xs") + "</button>" : ctaHtml(p, c, "vd-fbar-cta")) + "</div></div>";
  }
  function pvThumb(p, l) {
    const yid = DB.youtubeId ? DB.youtubeId(l.video || "") : "", r = chapOf(p, l);
    return '<span class="vd-pv-th" style="--acc:' + esc(accOf(p)) + '">' + '<i class="vd-pv-bg" aria-hidden="true"><b>' + esc(l.title) + "</b></i>" + (yid ? '<img src="https://i.ytimg.com/vi/' + esc(yid) + '/hqdefault.jpg" alt="" loading="lazy" onerror="this.remove()">' : "") + '<i class="vd-pv-play" aria-hidden="true">' + icon("play") + "</i><small>Part " + (r.ci + 1) + " · " + String(r.li + 1).padStart(2, "0") + "</small><em>" + (typeOf(p) === "ebook" ? (Number(l.min) || 0) + "쪽" : lLen(l)) + "</em></span>";
  }
  /* 상세페이지 이미지 (마스터가 JPG 여러 장 업로드 · 타이탄 클래스처럼 위에서 아래로 이어 붙여 보여요)
   * detailMode: "img-text" 이미지 → 기본 상세 · "img" 이미지만 · "text-img" 기본 상세 → 이미지 · "text" 기본 상세만 */
  const detailImgsOf = (p) => ((p.detailImgs || []).length ? p.detailImgs : p.introImg ? [{ url: p.introImg, name: "상세 이미지" }] : []).filter((x) => x && x.url);
  const detailModeOf = (p) => (detailImgsOf(p).length ? p.detailMode || "img-text" : "text");
  const detailImgsHtml = (p) => { const im = detailImgsOf(p); return im.length ? '<div class="vd-dimgs">' + im.map((x, i) => '<img class="vd-dimg' + (x.part > 1 ? " is-cont" : "") + '" ' + imgAttr(x.url, "src") + ' alt="' + esc(p.title) + " 상세 이미지 " + (i + 1) + '" loading="' + (i < 2 ? "eager" : "lazy") + '" decoding="async">').join("") + "</div>" : ""; };
  // 강사 숫자: 판매 중인 클래스 수 · 누적 수강생 · 평균 평점 (있는 것만)
  function crdStats(p) {
    if (!p.iid) return "";
    const mine = listed().filter((x) => x.iid === p.iid), n = mine.reduce((a, x) => a + soldOf(x), 0), rv = (V().reviews || []).filter((r) => mine.some((x) => x.id === r.pid) && Number(r.rating) > 0);
    const avg = rv.length ? rv.reduce((a, r) => a + Number(r.rating), 0) / rv.length : 0;
    const it = [[mine.length, "클래스"], [n ? n.toLocaleString("ko-KR") + "명" : "", "수강생"], [avg ? avg.toFixed(1) : "", "평균 평점"]].filter((x) => x[0]);
    return it.length ? '<ul class="vd-crd-st">' + it.map((x) => "<li><b>" + x[0] + "</b><span>" + x[1] + "</span></li>").join("") + "</ul>" : "";
  }
  function pageProduct(id) {
    const p = product(id); if (!p || p.status === "hidden" || !insShown(p)) return shell("", '<div class="vd-wrap">' + emptyBox("alert", "판매 중인 클래스가 아니에요", "", '<a class="vd-btn vd-btn-o" href="#/vod">홈으로</a>') + "</div>");
    const m = me(), own = m && owns(m.id, p.id), rt = ratingOf(p.id), rs = reviewsOf(p.id), lz = lessons(p), cat = catOf(p.cat), pls = pledgesOf(p.id), t = typeOf(p), ev = isEvent(p), pvs = previewsOf(p);
    const ins = p.iid && DB.instructor ? DB.instructor(p.iid) : null, insB = p.iid && DB.content ? ((DB.content(p.iid) || {}).brand || {}) : {}, lp = p.iid && DB.landingOf ? DB.landingOf(p.iid) : null;
    const career = lp && lp.about && Array.isArray(lp.about.career) ? lp.about.career.slice(0, 5).map((x) => (typeof x === "string" ? x : x.text || x.title || "")).filter(Boolean) : [];
    // 함께 많이 보는 클래스: 같은 강사 강의만 모이지 않게 — 다른 강사 강의(같은 분야 먼저 · 강사 한 명당 1개) 사이에 같은 강사 강의 1개를 섞어요
    const pool = listed().filter((x) => x.id !== p.id && !isEvent(x)).sort((a, b) => (b.cat === p.cat) - (a.cat === p.cat) || soldOf(b) - soldOf(a));
    const related = [], usedIns = {}, mine = pool.find((x) => x.iid === p.iid);
    pool.forEach((x) => { if (x.iid !== p.iid && !usedIns[x.iid] && related.length < (mine ? 2 : 3)) { usedIns[x.iid] = 1; related.push(x); } });
    pool.forEach((x) => { if (x.iid !== p.iid && related.length < (mine ? 2 : 3) && related.indexOf(x) < 0) related.push(x); });
    if (mine) related.splice(Math.min(1, related.length), 0, mine);
    const dist = [5, 4, 3, 2, 1].map((s) => rs.filter((r) => r.rating === s).length), canReview = own && !(V().reviews || []).some((r) => r.pid === p.id && r.mid === m.id);
    const hl = String(p.headline || p.sub || p.title).split("\n"), myNick = m ? nickOf(m.id) : "익명";
    const sec = (k, ttl, body, cls) => '<section class="vd-pd-sec' + (cls ? " " + cls : "") + '" id="vd-s-' + k + '"><h2 data-eg>' + ttl + "</h2>" + body + "</section>";
    const bk = t === "book", noCur = bk && !(p.curriculum || []).length;
    const curName = t === "ebook" || bk ? "목차" : ev ? "진행 순서" : "커리큘럼", unit = (l) => (t === "ebook" || bk ? (Number(l.min) || 0) + "쪽" : lLen(l));
    const faq = ((p.faq || []).length ? p.faq : bk ? [["언제 받을 수 있나요?", "결제 후 " + (Number(shipSet().outDays) || 2) + "일 안에(주말 · 공휴일 빼고) 보내 드리고, 보통 보낸 다음 날 도착해요. 송장 번호는 마이페이지 › 종이책 · 배송 조회에 올라가요."], ["배송지를 바꿀 수 있나요?", "책을 보내기 전(결제 완료)이면 마이페이지에서 바로 바꿀 수 있어요."], ["여러 권을 살 수 있나요?", "한 번에 " + BOOK_MAX + "권까지 살 수 있어요. 배송비는 주문마다 한 번만 내요."], ["쿠폰을 쓸 수 있나요?", "도서정가제에 따라 종이책에는 쿠폰을 쓸 수 없어요. 포인트는 쓸 수 있어요."]] : t === "ebook" ? [["전자책은 어떻게 받나요?", "결제하면 마이페이지 › 전자책에서 바로 내려받을 수 있어요."], ["휴대폰에서도 볼 수 있나요?", "PDF라서 휴대폰 · 태블릿 · PC 어디서든 볼 수 있어요."]] : ev ? [["입장 링크 · 주소는 언제 오나요?", "신청하면 마이페이지 › LIVE · 오프라인에서 바로 확인할 수 있고, 강의 하루 전에 문자로도 보내 드려요."], ["못 가게 되면 어떻게 하나요?", "강의 3일 전까지 취소하면 전액 환불해 드려요."]] : [["처음 시작하는 사람도 들을 수 있나요?", "처음 접하는 분이 전체 흐름을 이해하도록 구성했어요."], ["수업은 어떻게 듣나요?", "구매하면 바로 ‘내 강의실’에서 볼 수 있어요. " + accessTxt(p) + "이에요."]]);
    const tabs = [["intro", bk ? "책 소개" : "강의 소개"]].concat(plansOf(p).length ? [["plans", "수강권 · 코칭"]] : []).concat(pvs.length ? [["preview", "미리보기 " + pvs.length]] : []).concat(noCur ? [] : [["curri", curName]]).concat([["creator", bk ? "저자 소개" : "강사 소개"], ["reviews", (bk ? "독자 후기" : "수강 후기") + (rs.length ? " " + rs.length : "")], ["pledge", "다짐 한마디"], ["info", bk ? "도서 정보" : "강의 정보"], ["faq", "FAQ"], ["refund", bk ? "교환 · 반품 · 배송" : "환불 · 이용 안내"]]);
    const pains = pdText(p, "pains"), before = pdText(p, "before"), after = pdText(p, "after"), dm = detailModeOf(p), dimg = detailImgsHtml(p);
    const info = bk ? [["도서명", p.title], ["종류", "종이책 (택배 배송)"]].concat(bookRows(p)).concat([["교환 · 반품", "받은 날부터 7일 이내 (파손 · 파본은 3개월 이내)"]]) : [["강의명", p.title], ["크리에이터", p.creator + (p.tagline ? " · " + p.tagline : "")], ["강의 종류", TYPE[t][0] + " (" + TYPE[t][2] + ")"]].concat(infoRows(p)).concat([["강의 자료", lz.some((l) => (l.files || []).length) ? "강의 노트 · 첨부 자료 제공" : t === "ebook" ? "PDF 파일" : "강의 노트 제공"], ["수강 기기", "PC · 모바일 · 태블릿 (스트리밍 · 기기 4대)"]].concat(t === "vod" ? [["수강 기간", periodTxt(p)]] : []).concat(dgOpen(p) ? [["강의실", p.creator + " 강사 두잉고 강의실 (강의 영상 · 교재 · 업데이트 소식)"]] : []).concat([["환불", refundTbl()[refundKey(p)][0][0] + " " + refundTbl()[refundKey(p)][0][1]]]));
    return shell("", '<div class="vd-pd5">' +
      '<section class="vd-pdt vd-pdt7"><div class="vd-wrap"><nav class="vd-crumbs"><a href="#/vod">홈</a>' + icon("chevRight", "xs") + '<a href="#/vod/c/' + esc(p.cat) + '">' + esc(cat.label) + "</a>" + icon("chevRight", "xs") + '<a href="#/vod/c/all?tab=' + (ev ? "premium" : bk ? "ebook" : t) + '">' + esc(TYPE[t][0]) + "</a></nav>" +
        '<div class="vd-pdt-banner vd-th-' + t + '">' + bannerArt(p) + (pvs.length ? '<button type="button" class="vd-pdt-play" data-v="pv-open" data-p="' + esc(p.id) + '" data-l="' + esc(pvs[0].id) + '"><i>' + icon("play") + "</i><span>미리보기 <b>" + pvs.length + "개</b></span></button>" : "") + "</div>" +
        '<div class="vd-pdt-g7">' + pdtMain(p) + buyCard(p) + "</div></div></section>" +
      '<nav class="vd-pd-tabs"><div class="vd-wrap vd-pd-tabs-in">' + tabs.map((x, i) => '<button type="button" data-v="jump" data-to="vd-s-' + x[0] + '" class="' + (i === 0 ? "on" : "") + '">' + x[1] + "</button>").join("") + "</div></nav>" +
      '<div class="vd-wrap"><div class="vd-pd5-col">' +
        '<section class="vd-pd-sec vd-pd-intro" id="vd-s-intro">' + (dm === "img-text" || dm === "img" ? dimg : "") + (dm === "img" ? "" : ('<div class="vd-hl" style="--acc:' + esc(accOf(p)) + '" data-rv><small>' + esc(cat.label) + " · " + esc(TYPE[t][0]) + "</small><h2>" + esc(hl[0]) + (hl[1] ? "<br><em>" + esc(hl[1]) + "</em>" : "") + "</h2>" + (p.sub ? "<p>" + esc(p.sub) + "</p>" : "") + "</div>" +
          '<div class="vd-pain"><p class="vd-k" data-rv="fade">이런 고민, 있으셨죠?</p><ul data-rv-kids>' + pains.map((x, i) => '<li class="' + (i % 2 ? "r" : "") + '"><i>' + icon("message", "sm") + "</i><span>" + esc(x) + "</span></li>").join("") + '</ul>' + (p.pitch ? '<div class="vd-pain-a vd-pain-pitch" data-rv><small>그런 여러분을 위해</small><p>' + esc(p.pitch) + "</p></div></div>" : '<div class="vd-pain-a" data-rv><b>그래서 ' + esc(p.creator || "크리에이터") + "님이 직접 해 본 방법을<br><em>처음부터 순서대로</em> 정리했어요.</b></div></div>") +
          ((p.learn || []).length ? '<div class="vd-points" data-rv-kids>' + p.learn.slice(0, 4).map((x, i) => '<div class="vd-point"><small>POINT ' + String(i + 1).padStart(2, "0") + "</small><b>" + esc(x) + "</b></div>").join("") + "</div>" : "") +
          (before.length && after.length ? '<div class="vd-ba"><h3 data-eg>강의 전과 후, <span data-accent>이렇게 달라져요</span></h3><div class="vd-ba-g" data-rv-kids><div class="vd-ba-b"><small>BEFORE</small><ul>' + before.map((x) => "<li>" + icon("x", "xs") + esc(x) + "</li>").join("") + '</ul></div><i class="vd-ba-ar" aria-hidden="true">' + icon("arrowRight") + '</i><div class="vd-ba-a"><small>AFTER</small><ul>' + after.map((x) => "<li>" + icon("check", "xs") + esc(x) + "</li>").join("") + "</ul></div></div></div>" : "") +
          ((p.who || []).length ? '<div class="vd-who"><h3 data-eg>이런 분들께 <span data-accent>추천해요</span></h3><ul data-rv-kids>' + p.who.map((x) => "<li>" + icon("check", "xs") + "<span>" + esc(x) + "</span></li>").join("") + "</ul></div>" : "") +
          (ev ? '<div class="vd-evbox" data-rv><h3>' + icon("calendar", "sm") + (t === "live" ? "LIVE 강의 안내" : "오프라인 강의 안내") + "</h3><dl>" + infoRows(p).map((r) => "<div><dt>" + r[0] + "</dt><dd>" + esc(r[1]) + "</dd></div>").join("") + "<div><dt>" + (t === "live" ? "입장" : "준비물") + "</dt><dd>" + (t === "live" ? (p.via === "zoom" ? "신청하면 마이페이지에 Zoom 입장 링크가 열려요. 시작 10분 전부터 들어올 수 있어요." : "신청하면 마이페이지 › LIVE · 오프라인에 카카오톡 오픈채팅방 입장 버튼이 열려요. 강의 날 오픈채팅방에 유튜브 라이브 링크를 올려 드려요.") : "노트북 · 충전기 · 신분증 (자세한 주소는 신청 후 문자로 보내 드려요)") + "</dd></div></dl></div>" : "") +
          (p.intro ? '<div class="vd-pd-body" data-rv>' + esc(p.intro).split(/\n\n+/).map((x) => "<p>" + x.replace(/\n/g, "<br>") + "</p>").join("") + "</div>" : ""))) + (dm === "text-img" ? dimg : "") +
          ((p.gifts || []).length ? '<div class="vd-gift" data-rv>' + icon("download", "sm") + "<div><b>수강 선물</b><span>" + p.gifts.map((g) => esc(g.title) + (g.pages ? " (" + g.pages + "쪽)" : "")).join(" · ") + "</span></div></div>" : "") +
          (ins && p.iid ? '<a class="vd-cross" href="#/p/' + esc(p.iid) + '" data-rv><span><small>프리미엄강의 · 한정인원 모집 중</small><b>' + esc(p.creator) + "님과 함께하는 두잉고 기수 강의</b><em>매주 과제 · 피드백 · 라이브 Q&A로 끝까지 함께해요</em></span>" + icon("arrowRight", "sm") + "</a>" : "") + "</section>" +
        (pvs.length ? sec("preview", "구매 전에 <span data-accent>미리보기</span>", '<p class="vd-curri-sum">강의 ' + lz.length + "개 중 " + pvs.length + "개를 결제 전에 먼저 볼 수 있어요. 나에게 맞는지 확인하고 시작하세요.</p>" +
          '<div class="vd-pvs" data-rv-kids>' + pvs.map((l) => '<button type="button" class="vd-pv-card" data-v="pv-open" data-p="' + esc(p.id) + '" data-l="' + esc(l.id) + '">' + pvThumb(p, l) + "<b>" + esc(l.title) + "</b><span>" + esc(l.desc || (chapOf(p, l).ch || {}).title || "") + "</span></button>").join("") + "</div>", "vd-pd-pv") : "") +
        plansSec(p, sec) +
        (noCur ? "" : sec("curri", curName, '<p class="vd-curri-sum">' + (t === "ebook" || bk ? (p.curriculum || []).length + "장 · 총 " + (Number(p.pages) || 0) + "쪽" : ev ? "총 " + durTxt(Number(p.eventMin) || totalMin(p)) + " 진행" : "파트 " + (p.curriculum || []).length + "개 · 클립 " + lz.length + "개 · 총 " + durTxt(totalMin(p))) + "</p>" +
          (p.curriculum || []).map((ch, ci) => '<details class="vd-ch"' + (ci === 0 ? " open" : "") + '><summary><b class="vd-ch-no">' + (t === "ebook" ? "" : "Part " + (ci + 1) + ".") + "</b><span>" + esc(ch.title) + "</span><small>" + (t === "ebook" ? (ch.lessons || []).reduce((a, l) => a + (Number(l.min) || 0), 0) + "쪽" : (ch.lessons || []).length + "개 · " + durTxt(Math.round((ch.lessons || []).reduce((a, l) => a + lSec(l), 0) / 60))) + "</small>" + icon("chevDown", "sm") + "</summary><ul>" +
            (ch.lessons || []).map((l, li) => "<li>" + icon(own || l.preview ? (t === "ebook" ? "file" : "play") : "lock", "xs") + "<span>" + (ci + 1) + "-" + (li + 1) + ". " + esc(l.title) + "</span>" + (l.preview && !own && !ev ? '<button type="button" class="vd-pv" data-v="pv-open" data-p="' + esc(p.id) + '" data-l="' + esc(l.id) + '">미리보기</button>' : "") + "<small>" + unit(l) + "</small></li>").join("") + "</ul></details>").join(""))) +
        // 강사 소개: 강사 얼굴이 먼저 크게 보이게 (PC 왼쪽 큰 세로 사진 · 모바일 위쪽 전체 폭) + 클래스 · 수강생 숫자
        sec("creator", bk ? "저자 소개" : "강사 소개", '<div class="vd-crd vd-crd2" data-rv><div class="vd-crd-ph' + (phOf(p) ? "" : " no") + '">' + (phOf(p) ? '<img src="' + esc(phOf(p)) + '" alt="' + esc(p.creator) + ' 강사">' : "<i>" + esc((p.creator || "?").slice(0, 1)) + "</i>") + '<span class="vd-crd-cap"><small>CREATOR</small><b>' + esc(p.creator) + "</b></span></div><div class=\"vd-crd-body\"><small>" + esc(p.tagline || insB.field || "크리에이터") + "</small><b>" + esc(p.creator) + " <em>강사</em></b>" + crdStats(p) + "<p>" + esc(p.creatorBio || (p.creator + "님은 두잉고에서 기수를 운영하며 수강생과 함께 결과를 만들고 있어요. 이 클래스는 기수 강의의 핵심만 골라 언제든 볼 수 있게 만든 " + TYPE[t][0] + "예요.")) + "</p>" +
          (career.length ? '<ul class="vd-crd-car">' + career.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>" : "") + '<a class="vd-tl-btn" href="' + (p.iid ? tHref(p.iid) : "#/vod/search?q=" + encodeURIComponent(p.creator || "")) + '">' + esc(p.creator) + " 강사 페이지 · 다른 클래스" + icon("chevRight", "xs") + "</a></div></div>") +
        sec("reviews", bk ? "독자 후기" : "수강 후기", (rs.length ? '<div class="vd-rv-sum"><div class="vd-rv-big"><b>' + rt.avg.toFixed(1) + '</b><span class="vd-stars">' + stars(rt.avg) + "</span><small>후기 " + rs.length + "개</small></div><ul>" + dist.map((n, i) => "<li><span>" + (5 - i) + "점</span><i><u style=\"width:" + Math.round(n / rs.length * 100) + '%"></u></i><small>' + n + "</small></li>").join("") + "</ul></div>" : "") +
          (canReview ? '<form class="vd-rv-form" data-vd-review="' + esc(p.id) + '"><b>후기를 남겨 주세요 <small>후기를 쓰면 ' + (Number(V().settings.reviewPoint) || 0).toLocaleString() + "P를 드려요</small></b><div class=\"vd-rate\" role=\"radiogroup\" aria-label=\"별점\">" + [5, 4, 3, 2, 1].map((s) => '<label><input type="radio" name="rating" value="' + s + '"' + (s === 5 ? " checked" : "") + ">" + icon("star", "sm") + "</label>").join("") + '</div><textarea name="text" rows="3" maxlength="500" placeholder="강의를 듣고 좋았던 점을 적어 주세요 (10자 이상)"></textarea><button class="vd-btn vd-btn-p" type="submit">후기 등록</button></form>' : "") +
          (rs.length ? '<ul class="vd-rv-list">' + rs.map((r) => '<li><div class="vd-rv-h">' + av(r.name) + "<b>" + esc(r.name) + '</b><span class="vd-stars sm">' + stars(r.rating) + "</span><time>" + DB.date.fmtFull(DB.date.toStr(new Date(r.at))) + "</time></div><p>" + esc(r.text) + "</p></li>").join("") + "</ul>" : '<p class="vd-muted">아직 후기가 없어요. ' + (bk ? "구매한" : "수강한") + ' 분만 남길 수 있어요.</p>')) +
        sec("pledge", "나의 다짐 한마디", '<form class="vd-plform" data-vd-pledge="' + esc(p.id) + '"><label><span>' + esc(myNick) + ' · 나의 다짐 한마디</span><textarea name="text" rows="2" maxlength="500" placeholder="첫 단계부터 미루지 않고 따라가 볼게요."></textarea></label><div class="vd-plform-f"><small><b data-pl-n>0</b>/500 · 익명</small><button type="submit" class="vd-btn vd-btn-p vd-btn-sm">다짐 남기기</button></div></form>' +
          (pls.length ? '<ul class="vd-pls">' + pls.map((x) => "<li>" + av(x.nick, "lg") + "<div><b>" + esc(x.nick) + "</b><small>한마디 · " + esc(DB.date.toStr(new Date(x.at))) + "</small><p>" + esc(x.text) + '</p><div class="vd-pl-a"><button type="button" data-v="pl-up" data-id="' + esc(x.id) + '" class="' + (m && (x.upBy || []).indexOf(m.id) >= 0 ? "on" : "") + '">' + icon("heart", "xs") + "공감 " + (x.up || 0) + "</button>" + (m && x.mid === m.id ? '<button type="button" data-v="pl-del" data-id="' + esc(x.id) + '">삭제</button>' : "") + "</div></div></li>").join("") + "</ul>" : '<p class="vd-muted">아직 다짐이 없어요. 첫 다짐을 남겨 주세요.</p>')) +
        sec("info", bk ? "도서 정보" : "강의 정보", '<table class="vd-info-t"><tbody>' + info.map((r) => "<tr><th>" + esc(r[0]) + "</th><td>" + esc(r[1]) + "</td></tr>").join("") + "</tbody></table>") +
        sec("faq", "자주 묻는 질문", faq.map((f) => '<details class="vd-faq"><summary><b>Q</b><span>' + esc(f[0]) + "</span>" + icon("chevDown", "sm") + "</summary><p>" + esc(f[1]) + "</p></details>").join("")) +
        sec("refund", bk ? "교환 · 반품 규정" : "환불 규정", (t === "vod" && priceOf(p) > 0 ? '<p class="vd-rf-base">' + icon("calendar", "xs") + "<span>이 강의의 정상 수강기간: <b>" + (plansOf(p).length ? plansOf(p).map((x) => x.label).join(" · ") + " 중 고른 수강권 기간" : normalDays(p) + "일") + "</b>" + (isLifetime(p) ? " (평생 소장 · 31일차부터 무료 수강기간)" : "") + "</span></p>" : "") + refundTable(p) +
          (coachOf(p) ? '<h4 class="vd-rf-h4">1:1 코칭권</h4><table class="vd-rf"><tbody>' + refundTbl().coach.map((r) => "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>").join("") + "</tbody></table>" : "") +
          (teaOf(p) ? '<h4 class="vd-rf-h4">강사님과 TEA TIME</h4><table class="vd-rf"><tbody>' + refundTbl().tea.map((r) => "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>").join("") + "</tbody></table>" : "") +
          '<ul class="vd-notes"><li>환불 금액은 정가가 아닌 실제 결제 금액 기준이에요. 결제에 쓴 쿠폰은 다시 돌려드리지 않고, 쓴 포인트는 다시 넣어 드려요.</li><li>환불 신청은 마이페이지 › 주문 · 결제 내역 또는 고객센터 1:1 문의로 해 주세요. 영업일 기준 3일 안에 처리해요.</li><li>강의 내용 · 일정은 강사 사정에 따라 바뀔 수 있고, 바뀌면 미리 알려 드려요.</li></ul>' +
          '<h3 class="vd-use-h">' + (bk ? "배송 · 이용 안내" : "수강 기간 · 콘텐츠 이용 안내") + '</h3><ul class="vd-notes vd-use">' + useNotes(p).map((x) => "<li>" + x + "</li>").join("") + "</ul>") +
      "</div>" +
      (related.length ? '<section class="vd-pd-sec vd-pd-rel"><h2 data-eg>함께 많이 보는 <span data-accent>클래스</span></h2><div class="vd-grid vd-grid-3" data-rv-kids>' + related.map((x) => card(x)).join("") + "</div></section>" : "") +
      "</div></div>" + fbarHtml(p), "", "vd-has-mbuy");
  }
  /* ---------- 상세 상단 v7: 패스트캠퍼스 강의 페이지 구성 ----------
   * 맨 위 가로로 넓은 대표 배너 → 아래 왼쪽: 분류 · 제목 · 설명 · 강의 정보 박스 / 오른쪽: 가격 · 수강신청 카드 */
  function bannerArt(p) {
    if (p.banner) return '<span class="vd-bn vd-bn-img"><img src="' + esc(p.banner) + '" alt=""></span>';
    const c = p.color || ["#1c1c1e", ACC[0]], t = typeOf(p), lines = artLines(p);
    const lb = p.label || (p.status === "soon" ? "오픈 예정" : priceOf(p) === 0 ? "무료특강" : t === "ebook" ? "전자책" : t === "book" ? "종이책" : t === "live" ? "LIVE 클래스" : t === "offline" ? "오프라인 클래스" : "VOD클래스");
    const lbs = isEvent(p) ? fmtEvent(p.eventAt) : t === "ebook" ? (Number(p.pages) || 0) + "쪽 · " + (p.format || "PDF") : t === "book" ? shipFeeTxt(p) : accessTxt(p);
    const ph = phOf(p), cv = isBook(p) && p.cover ? '<span class="vd-bn-cv"><i class="vd-eb-pages" aria-hidden="true"></i><img ' + imgAttr(p.cover, "src") + ' alt="' + esc(p.title) + ' 표지"></span>' : "";
    return '<span class="vd-bn' + (cv ? " vd-bn-bk" : "") + '" style="--bg:' + esc(c[0] || "#1c1c1e") + ";--acc:" + esc(c[1] || ACC[0]) + '">' +
      '<i class="vd-bn-glow" aria-hidden="true"></i><i class="vd-bn-ring" aria-hidden="true"></i><i class="vd-bn-dots" aria-hidden="true"></i>' +
      (p.thumb ? '<img class="vd-bn-thumb" ' + imgAttr(p.thumb, "src") + ' alt="">' : "") +
      '<span class="vd-bn-txt"><span class="vd-bn-lb"><b>' + esc(lb) + "</b>" + esc(lbs || "") + "</span>" +
        (p.hook ? '<span class="vd-bn-hk">' + esc(p.hook) + "</span>" : "") +
        '<b class="vd-bn-t">' + artTitle(lines) + "</b>" +
        '<small class="vd-bn-c">' + esc(p.tagline || catOf(p.cat).label) + (p.creator ? " <em>" + esc(p.creator) + "</em>" : "") + "</small></span>" +
      (cv || (ph ? '<span class="vd-bn-ph"><i class="vd-bn-sw" aria-hidden="true"></i><img src="' + esc(ph) + '" alt=""></span>' : '<span class="vd-bn-ph"><i class="vd-bn-sw" aria-hidden="true"></i></span>')) +
      "</span>";
  }
  // 강의 소개 글: “고민” 따옴표 → 해결 문단 → 해시태그 (패스트캠퍼스 강의 설명처럼 제목 바로 아래)
  function pitchTop(p) {
    const qs = (p.pains || []).slice(0, 3), txt = qs.map((q) => "“" + q + "”").join(" ") + " " + p.pitch;
    return '<div class="vd-pitch"><p class="vd-pitch-t">' + qs.map((q) => "<b>“" + esc(q) + "”</b>").join(" ") + (qs.length ? " " : "") + esc(p.pitch) + "</p>" + (txt.length > 150 ? '<button type="button" class="vd-pitch-more" data-v="pitch-more">더보기' + icon("chevDown", "xs") + "</button>" : "") +
      ((p.tags || []).length ? '<div class="vd-pitch-tags">' + p.tags.map((t) => "<span>#" + esc(String(t).replace(/^#/, "")) + "</span>").join("") + "</div>" : "") + "</div>";
  }
  function pdtMain(p) {
    const t = typeOf(p), lz = lessons(p), rt = ratingOf(p.id), lk = likersOf(p);
    const desc = p.sub || String(p.intro || "").split(/\n\n+/)[0];
    const rows = infoRows(p).concat(t === "vod" ? [["강의 자료", lz.some((l) => (l.files || []).length) ? "강의 노트 · 첨부 자료" : "강의 노트"]] : []).concat(t === "book" ? [] : [["크리에이터", p.creator || "-"]]);
    return '<div class="vd-pdt-main">' +
      '<div class="vd-buy-cat"><a href="#/vod/c/' + esc(p.cat) + '">' + esc(catOf(p.cat).label) + "</a>" + icon("chevRight", "xs") + "<span>" + esc(TYPE[t][0]) + "</span></div>" +
      badgeHtml(badgesOf(p)) +
      '<h1 class="vd-pdt-h1">' + esc(p.title) + "</h1>" +
      '<div class="vd-pdt-rate">' + (rt.n ? '<button type="button" data-v="jump" data-to="vd-s-reviews"><span class="vd-stars sm">' + stars(rt.avg) + "</span><b>" + rt.avg.toFixed(1) + "</b><small>(" + rt.n + ")</small></button><i></i>" : "") + (isBook(p) ? (soldOf(p) ? "<span>판매 <b>" + soldOf(p).toLocaleString() + "권+</b></span><i></i>" : "") : "<span>수강생 <b>" + soldOf(p).toLocaleString() + "명+</b></span><i></i>") + "<span>" + icon("heart", "xs") + likeCount(p) + "</span>" + (lk.length ? '<i></i><span class="vd-avs">' + lk.map((n) => av(n)).join("") + "</span>" : "") + "</div>" +
      (p.pitch ? pitchTop(p) : desc ? '<p class="vd-pdt-desc">' + esc(desc) + "</p>" : "") +
      (p.fromFree ? '<a class="vd-pdt-free" href="#/free/' + esc(p.fromFree) + '">' + icon("sparkles", "sm") + "<span><b>신청자 전용 선물 자료 · 사전 질문</b>은 무료강의 안내 페이지에서 받아요</span>" + icon("chevRight", "xs") + "</a>" : "") +
      '<div class="vd-pdt-box"><b class="vd-pdt-box-h">' + (t === "book" ? "도서 정보" : "강의 정보") + "</b><dl>" + rows.map((r) => "<div><dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd></div>").join("") + "</dl></div>" +
      (dgOpen(p) ? '<div class="vd-pdt-dg"><span class="vd-dg-ic">' + (window.doinggoB ? window.doinggoB("black", "vd-dg-logo") : "두잉고") + '</span><div><b>구매하면 <em>' + esc(p.creator) + " 강사 두잉고 강의실</em>이 열려요</b><small>강의 영상 · 교재 · 업데이트 소식 · 실습 체크리스트를 한 곳에서 보고, 원하면 1:1 코칭 · 강사님과 TEA TIME까지</small></div></div>" : "") +
      recoBox(p) + "</div>";
  }
  /* ---------- 상세 위쪽: 이런 분들께 추천드려요 · 강사 코멘트 (마스터 › 클래스 편집 › 4. 클래스 소개에서 고쳐요) ---------- */
  const CMT = {
    v1: "건기식 브랜드는 재고가 아니라 공급처와 서류에서 승부가 나요. 제가 뉴질랜드에서 직접 부딪히며 정리한 순서를 그대로 담았어요. 처음이어도 괜찮아요. 1강부터 따라오면 첫 공급처 연락까지는 무조건 해 보게 됩니다. 막히는 부분은 두잉고 강의실에서 1:1 코칭으로 물어보세요.",
    v2: "그림을 못 그려도 괜찮아요. AI로 내 캐릭터를 일관되게 만들고, 스티커 · 키링으로 실제 판매까지 가는 과정을 그대로 보여 드려요. 작게 만들어 보고 반응을 보는 게 제일 빠릅니다.",
    v3: "귤 하나로 시작해 월매출 10억까지 오면서 깨달은 건, 농산물은 ‘어디서 사 오느냐’와 ‘언제 파느냐’가 전부라는 거예요. 산지 계약부터 제철 캘린더, 포장 · 배송 클레임 줄이는 법까지 제가 쓰는 방법을 그대로 드려요.",
    v4: "예쁜 상세페이지보다 팔리는 상세페이지가 먼저예요. 첫 화면 3초 안에 사는 이유를 보여 주는 7단계 순서를, 실제로 고쳐서 전환율이 오른 사례와 함께 알려 드려요.",
    v5: "하루 1시간이면 충분해요. 주제 고르기부터 챗GPT 초안, 사람 냄새 나게 다듬는 법, 애드센스 · 체험단 연결까지 제가 매일 쓰는 루틴을 그대로 옮겼어요. 꾸준히 쓰는 습관만 만들면 수익은 따라와요.",
    v6: "현지에서 직접 고른 상품이 왜 잘 팔리는지, 마진은 어떻게 남기는지 숫자로 보여 드려요. 직구 판매가 처음이라면 이 강의로 첫 상품부터 정해 보세요.",
    v8: "산지직송은 상품보다 ‘누가 보내는지’가 먼저 보여야 팔려요. 이름 · 로고 · 패키지를 큰돈 들이지 않고 만드는 방법을 실제 브랜드 사례로 알려 드려요.",
    v9: "틱톡샵은 지금이 가장 쉬운 시기예요. 계정 세팅부터 첫 판매까지 제가 직접 해 본 순서로 준비하고 있어요. 오픈 알림을 신청해 두세요."
  };
  const cmtOf = (p) => (p && p.comment != null ? String(p.comment) : (p && CMT[p.id]) || "");
  const tagLine = (x) => esc(x).replace(/^\[([^\]]{1,20})\]\s*/, "<b>[$1]</b> ");
  function recoBox(p) {
    const who = (p.who || []).filter(Boolean), cm = cmtOf(p);
    if (!who.length && !cm) return "";
    const upd = p.updatedAt ? DB.date.parseDate(p.updatedAt) : null;
    return '<div class="vd-reco' + (who.length && cm ? "" : " one") + '">' +
      (who.length ? '<div class="vd-reco-l"><h3>이런 분들께 추천드려요</h3><ul>' + who.map((x) => "<li>" + icon("check", "sm") + "<span>" + tagLine(x) + "</span></li>").join("") + "</ul></div>" : "") +
      (cm || upd ? '<div class="vd-reco-r">' +
        (cm ? '<div class="vd-cmt"><b>' + icon("message", "sm") + esc(p.creator || "강사") + " 코멘트</b><p>" + esc(cm) + "</p>" + (cm.length > 90 ? '<button type="button" class="vd-cmt-more" data-v="cmt-more">더보기</button>' : "") + "</div>" : "") +
        (upd ? '<div class="vd-upd"><span class="vd-upd-ic">' + icon("refresh", "sm") + "</span><div><b>" + upd.getFullYear() + "년 " + (upd.getMonth() + 1) + "월 " + upd.getDate() + "일 기준 최신 내용 반영</b><small>" + esc(p.updNote || "새로운 방법이 나오면 강의와 자료를 무조건 업데이트해 드려요.") + "</small></div></div>" : "") +
      "</div>" : "") + "</div>";
  }
  /* ---------- 수강권 선택 상자 (상세 가격 카드 · 하단 옵션 창 · 같은 선택을 함께 써요) ---------- */
  const PSEL = {};
  function planBox(p, sfx) {
    const ps = plansOf(p), s = PSEL[p.id] || {}, sel = planOf(p, s.d), c = coachOf(p), on = !!(s.coach && c);
    return '<div class="vd-plans" data-plans="' + esc(p.id) + '"><p class="vd-plans-h"><b>' + icx("ticket", "xs") + "수강권 선택" + (ebOf(p) ? '<em class="vd-eb-tag">얼리버드</em>' : "") + '</b><small>기간이 끝나도 1년 연장권으로 이어서 들어요</small></p>' +
      ps.map((y) => '<label class="vd-plan' + (y.d === sel.d ? " on" : "") + '"><input type="radio" name="vd-plan-' + sfx + '" value="' + y.d + '" data-plan' + (y.d === sel.d ? " checked" : "") + '><span class="vd-plan-t"><b>' + y.label + " 수강권</b>" + (y.d === 365 ? "<em>추천</em>" : "") + "<small>하루 " + won(y.day) + "</small></span><span class=\"vd-plan-p\">" + (y.list > y.sale ? "<s>" + won(y.list) + "</s>" : "") + "<strong>" + won(y.sale) + "</strong></span></label>").join("") +
      (c ? '<label class="vd-addon' + (on ? " on" : "") + '"><input type="checkbox" value="1" data-plan-coach' + (on ? " checked" : "") + '><span class="vd-addon-t"><b>1:1 코칭권 ' + c.n + "회 함께 사기</b><small>" + c.days + "일 동안 강사에게 직접 질문 · 1회 " + won(c.per) + "</small></span><strong>+" + won(c.price) + "</strong></label>" : "") +
      '<div class="vd-plans-tot"><span>총 결제 예정 금액</span><strong data-plan-tot>' + won(sel.sale + (on ? c.price : 0)) + "</strong></div></div>";
  }
  function planSync(t) {
    const box = t.closest("[data-plans]"); if (!box) return;
    const pid = box.dataset.plans, p = product(pid); if (!p) return;
    const r = box.querySelector("[data-plan]:checked"), ck = box.querySelector("[data-plan-coach]");
    PSEL[pid] = { d: r ? Number(r.value) : (defPlan(p) || {}).d, coach: !!(ck && ck.checked) };
    const s = PSEL[pid], y = planOf(p, s.d), c = coachOf(p), tot = (y ? y.sale : 0) + (s.coach && c ? c.price : 0);
    document.querySelectorAll('[data-plans="' + pid + '"]').forEach((b) => {
      b.querySelectorAll("[data-plan]").forEach((x) => { x.checked = Number(x.value) === y.d; x.closest(".vd-plan").classList.toggle("on", x.checked); });
      const k = b.querySelector("[data-plan-coach]"); if (k) { k.checked = s.coach; k.closest(".vd-addon").classList.toggle("on", s.coach); }
      const tt = b.querySelector("[data-plan-tot]"); if (tt) tt.textContent = won(tot);
    });
    document.querySelectorAll('[data-co-link="' + pid + '"]').forEach((a) => { a.setAttribute("href", "#/vod/checkout/" + pid + "?plan=" + y.d + (s.coach && c ? "&coach=1" : "")); });
  }
  /** 상세 본문 ‘수강권 · 코칭’: 기간별 가격 · 1:1 코칭권 · TEA TIME · 1년 연장권 */
  function plansSec(p, sec) {
    const ps = plansOf(p); if (!ps.length) return "";
    const c = coachOf(p), t = teaOf(p), x = extendOf(p), dp = defPlan(p);
    const feats = [c ? ["message", "1:1 코칭권 " + c.n + "회", won(c.price), c.days + "일 동안 " + esc(p.creator) + " 강사에게 직접 질문하고 답을 받아요. 두잉고 강의실 ‘1:1 코칭 질문’에서 쓰면 1회씩 차감돼요. (1회 " + won(c.per) + ")"] : null,
      t ? ["coffee", "강사님과 TEA TIME " + t.min + "분", won(t.price), "수강생만 신청하는 1:1 만남이에요 (" + TEA_MODE[t.mode] + "). 희망 날짜 · 주제를 남기면 강사님이 일정을 확정해요."] : null,
      x ? ["refresh", "1년 연장권", won(x.sale), "수강 기간이 끝나도 365일 가격의 " + extendPct() + "%로 1년 더, 진도 · 노트 그대로 다시 이어서 들어요."] : null].filter(Boolean);
    return sec("plans", "수강권 · <span data-accent>1:1 코칭</span>", '<p class="vd-curri-sum">평생 소장 대신 필요한 기간만 골라서 더 합리적으로 들어요. 오래 볼수록 하루 가격이 내려가요.</p>' +
      '<div class="vd-plg">' + ps.map((y) => '<div class="vd-plg-c' + (y.d === dp.d ? " rec" : "") + '">' + (y.d === dp.d ? "<em>추천</em>" : "") + "<small>" + y.label + " 수강권</small><b>" + won(y.sale) + "</b>" + (y.list > y.sale ? "<s>" + won(y.list) + "</s>" : "") + "<span>하루 <strong>" + won(y.day) + "</strong></span></div>").join("") + "</div>" +
      (feats.length ? '<ul class="vd-plf">' + feats.map((f) => '<li><span class="vd-plf-ic">' + (f[0] === "coffee" ? icx("coffee", "sm") : icon(f[0], "sm")) + "</span><div><b>" + f[1] + " <em>" + f[2] + "</em></b><p>" + f[3] + "</p></div></li>").join("") + "</ul>" : "") +
      '<p class="vd-muted vd-plf-n">' + icon("alert", "xs") + "1:1 코칭권 · TEA TIME은 수강권이 있는 동안 상세 페이지 · 마이페이지에서 따로 살 수 있어요. 쿠폰은 수강권에만 적용돼요.</p>", "vd-pd-plans");
  }
  /* 상세페이지에서 받는 쿠폰 (마스터 › 전시 · 쿠폰 · 설정에서 ‘상세페이지에서 받기’를 켠 쿠폰 + 가입 쿠폰) */
  const cpAmt = (p) => (defPlan(p) || {}).sale || priceOf(p);
  const dlCoupons = (p) => (V().coupons || []).filter((c) => c.on !== false && (c.dl || c.auto === "signup") && (!c.endAt || c.endAt >= today()) && couponOff(c, p, cpAmt(p)) > 0);
  const hasCp = (mid, c) => ((V().memberCoupons || {})[mid] || []).some((x) => x.cid === c.id);
  function cpDlBtn(p, m) {
    if (!(priceOf(p) > 0) || p.status !== "on" || isBook(p) || (m && owns(m.id, p.id))) return "";
    const cs = dlCoupons(p), left = m ? cs.filter((c) => !hasCp(m.id, c)).length : cs.length;
    if (!cs.length) return "";
    return '<button type="button" class="vd-cpdl' + (left ? "" : " got") + '" data-v="cp-open" data-p="' + esc(p.id) + '">' + icon(left ? "download" : "check", "xs") + (left ? "사용 가능한 쿠폰이 있어요!" : "받은 쿠폰 " + cs.length + "장 · 결제할 때 적용돼요") + "</button>";
  }
  function cpModalBody(p) {
    const m = me(), cs = dlCoupons(p), amt = cpAmt(p), left = m ? cs.filter((c) => !hasCp(m.id, c)) : [];
    const big = (c) => (c.kind === "pct" ? c.value + "<small>%</small>" : Number(c.value) >= 10000 && Number(c.value) % 10000 === 0 ? Number(c.value) / 10000 + "<small>만 원</small>" : Number(c.value).toLocaleString() + "<small>원</small>");
    return '<div class="vd-modal-b vd-cpm"><p class="vd-cpm-lead">' + esc(p.title) + "<br><small>" + (plansOf(p).length ? "365일 수강권 " : "") + won(amt) + " 기준 할인 금액이에요</small></p><ul>" + cs.map((c) => {
      const got = m && hasCp(m.id, c), off = couponOff(c, p, amt);
      return '<li class="vd-cpm-it' + (got ? " got" : "") + '"><div class="vd-cpm-l"><b>' + big(c) + '</b></div><div class="vd-cpm-r"><strong>' + esc(c.name) + "</strong><span>" + esc(couponCond(c)) + "</span><small>" + (c.auto === "signup" ? "가입하면 자동으로 드려요 · " : "") + (c.days ? "받은 날부터 " + c.days + "일 동안 사용" : c.endAt ? DB.date.fmtFull(c.endAt) + "까지" : "기한 없음") + '</small><em>이 클래스에 쓰면 -' + won(off) + "</em></div>" +
        (m ? (got ? '<span class="vd-cpm-b done">' + icon("check", "xs") + "받음</span>" : '<button type="button" class="vd-cpm-b" data-v="cp-get" data-c="' + esc(c.id) + '" data-p="' + esc(p.id) + '">' + icon("download", "xs") + "받기</button>") : "") + "</li>";
    }).join("") + "</ul>" +
      (m ? (left.length > 1 ? '<button type="button" class="vd-btn vd-btn-p vd-btn-xl vd-cpm-all" data-v="cp-get" data-c="all" data-p="' + esc(p.id) + '">쿠폰 ' + left.length + "장 모두 받기</button>" : left.length ? "" : '<p class="vd-cpm-done">' + icon("check", "sm") + "모든 쿠폰을 받았어요. 결제 화면에서 가장 많이 깎이는 쿠폰을 골라 쓸 수 있어요.</p>")
        : '<a class="vd-btn vd-btn-p vd-btn-xl vd-cpm-all" href="#/vod/login?next=' + encodeURIComponent("#/vod/p/" + p.id) + '">로그인하고 쿠폰 받기</a><p class="vd-cpm-note">아직 회원이 아니라면 가입만 해도 <b>5,000원 할인 쿠폰</b>을 바로 드려요 (30일 동안 사용).</p>') +
      '<p class="vd-cpm-note">쿠폰은 결제 1건에 1장만 쓸 수 있어요. 받은 쿠폰은 마이페이지 › 쿠폰에서 볼 수 있어요.</p></div>';
  }
  function buyCard(p) {
    const m = me(), own = m && owns(m.id, p.id), pr = priceOf(p), pct = pctOf(p), left = seatsLeft(p), isLiked = liked(m && m.id, p.id), pvs = previewsOf(p);
    const end = saleEndOf(p), cps = m && pr > 0 && p.status === "on" ? usableCoupons(m.id, p) : [], best = cps[0], mo = monthOf(p), eb = ebOf(p);
    const ps = plansOf(p), ended = !own && !!m && ps.length > 0 && hadCourse(m.id, p.id), ext = ended ? extendOf(p) : null;
    const cd = end && !own ? '<div class="vd-cd' + (eb ? " vd-cd-eb" : "") + '">' + icon("clock", "xs") + "<span>" + (eb ? "얼리버드 마감까지" : "할인 마감까지") + '</span><b data-cd="' + esc(end) + '">' + cdTxt(end) + "</b><span>남음</span></div>" : "";
    const price = p.status === "soon" ? '<div class="vd-pc-top"><span class="vd-pc-lab">오픈 예정가</span><strong>' + (pr ? won(pr) : "무료") + "</strong></div>" + (p.openAt ? '<p class="vd-buy-mo">' + fmtOpen(p.openAt) + " · 알림 신청하면 오픈 할인을 알려 드려요</p>" : "")
      : pr === 0 ? '<div class="vd-pc-top"><span class="vd-pc-lab">수강료</span><strong class="free">무료</strong></div>'
      : own && ps.length ? ownBox(p, m)
      : ext ? '<div class="vd-pc-top"><span class="vd-pc-lab">1년 연장권</span><strong>' + won(ext.sale) + '</strong></div><p class="vd-pc-exp">' + icon("clock", "xs") + "<span>" + DB.date.fmtFull(DB.date.toStr(new Date(accessEnd(m.id, p.id)))) + "에 수강 기간이 끝났어요. 연장하면 진도 · 노트 그대로 <b>다시 이어서 들을 수 있어요</b> (365일 가격의 " + extendPct() + "%).</span></p>"
      : ps.length && p.status === "on" ? planBox(p, "a") + cd + (best ? '<p class="vd-buy-cp"><span class="vd-tag vd-tag-red">쿠폰</span>‘' + esc(best.c.name) + "’ 쿠폰은 결제 화면에서 수강권에 적용돼요</p>" : !m && !isBook(p) ? '<p class="vd-buy-cp"><span class="vd-tag vd-tag-red">쿠폰</span>가입하면 바로 쓰는 5,000원 할인 쿠폰을 드려요</p>' : "")
      : '<div class="vd-pc-top">' + (eb ? '<span class="vd-pc-lab vd-pc-eb">얼리버드가</span>' : "") + (pct ? "<em>" + pct + "%</em>" : '<span class="vd-pc-lab">판매가</span>') + "<strong>" + won(pr) + "</strong></div>" +
        '<dl class="vd-pc-rows">' + (pct ? "<div><dt>정가</dt><dd><s>" + won(p.price) + "</s></dd></div><div><dt>할인 금액</dt><dd class=\"red\">-" + won(p.price - pr) + "</dd></div>" : "") +
          (best && !own ? "<div><dt>쿠폰 적용가</dt><dd><b>" + won(pr - best.off) + "</b></dd></div>" : "") + (mo ? "<div><dt>12개월 할부 시</dt><dd>월 " + won(mo) + "</dd></div>" : "") + "</dl>" + cd +
        (own || best ? "" : !m && !isBook(p) ? '<p class="vd-buy-cp"><span class="vd-tag vd-tag-red">쿠폰</span>가입하면 바로 쓰는 5,000원 할인 쿠폰을 드려요</p>' : "");
    return '<aside class="vd-pc' + (ps.length ? " vd-pc-plans" : "") + '" id="vd-pdt-info">' + flNote(p) + price +
      (isEvent(p) && left != null ? '<div class="vd-seat"><div><span>신청 현황</span><b>' + (p.seats - left) + " / " + p.seats + "명</b></div><i><u style=\"width:" + Math.round((p.seats - left) / p.seats * 100) + '%"></u></i>' + (left && left <= 5 ? "<small>마감까지 " + left + "자리 남았어요</small>" : "") + "</div>" : "") +
      cpDlBtn(p, m) +
      '<div class="vd-pc-btns">' + ctaHtml(p, ctaOf(p, m), "vd-btn-xl") + (own ? addonBtns(p, m) : "") + (pvs.length && !own ? '<button type="button" class="vd-btn vd-btn-o vd-btn-xl" data-v="pv-open" data-p="' + esc(p.id) + '" data-l="' + esc(pvs[0].id) + '">' + icon("play", "sm") + "무료 미리보기 " + pvs.length + "개</button>" : "") + "</div>" +
      '<div class="vd-pc-sub"><button type="button" class="vd-pc-like' + (isLiked ? " on" : "") + '" data-v="like" data-id="' + esc(p.id) + '">' + icon("heart", "sm") + "찜 " + likeTxt(likeCount(p)) + '</button><button type="button" class="vd-pc-like" data-v="share">' + icon("link", "sm") + "공유하기</button></div>" +
      '<p class="vd-buy-note">' + icon("shieldCheck", "xs") + (refundKey(p) === "vod" ? "결제 후 " + rfSet().days + "일 이내 · 강의를 듣기 전이면 100% 환불" : refundKey(p) === "ebook" ? "내려받기 전 7일 이내 전액 환불" : refundKey(p) === "book" ? "보내기 전이면 바로 취소 · 받은 날부터 7일 안 반품" : refundKey(p) === "event" ? "강의 3일 전까지 전액 환불" : "무료 강의 · 신청 즉시 수강") + ' <button type="button" class="vd-link" data-v="jump" data-to="vd-s-refund">환불 규정</button></p></aside>';
  }
  /** 이미 수강 중일 때 가격 자리: 남은 기간 · 진도 · 남은 코칭 */
  function ownBox(p, m) {
    const e = accessEnd(m.id, p.id), dl = daysLeft(m.id, p.id), c = coachOf(p), cl = c ? coachLeft(m.id, p.iid) : 0, tz = teaOf(p) ? teasOf(m.id, p.iid).filter((o) => (o.tea || {}).st === "ok" || (o.tea || {}).st === "req") : [];
    return '<div class="vd-pc-own"><span class="vd-tag vd-tag-blue">수강 중</span><b>' + (e === Infinity ? "기간 제한 없음" : DB.date.fmtFull(DB.date.toStr(new Date(e))) + "까지") + "</b>" + (e !== Infinity ? "<small>D-" + Math.max(0, dl) + "</small>" : "") + "</div>" +
      '<dl class="vd-pc-rows"><div><dt>진도율</dt><dd><b>' + pctDone(m.id, p.id) + "%</b></dd></div>" + (c ? "<div><dt>1:1 코칭권</dt><dd>" + (cl ? "남은 <b>" + cl + "회</b>" : "없음") + "</dd></div>" : "") + (tz.length ? "<div><dt>TEA TIME</dt><dd>" + esc(TEA_ST[(tz[0].tea || {}).st || "req"][0]) + "</dd></div>" : "") + "</dl>";
  }
  /** 수강 중: 연장권 · 코칭권 · TEA TIME 버튼 */
  function addonBtns(p, m) {
    const c = coachOf(p), t = teaOf(p), ext = canExtend(m.id, p.id) ? extendOf(p) : null;
    return (ext ? '<a class="vd-btn vd-btn-o vd-btn-xl" href="#/vod/checkout/' + esc(p.id) + '?item=extend">' + icon("refresh", "sm") + "1년 연장권 " + won(ext.sale) + "</a>" : "") +
      (c || t ? '<div class="vd-pc-add">' + (c ? '<a href="#/vod/checkout/' + esc(p.id) + '?item=coach">' + icon("message", "sm") + "<span><b>1:1 코칭권</b><small>" + c.n + "회 · " + won(c.price) + "</small></span></a>" : "") + (t ? '<a href="#/vod/checkout/' + esc(p.id) + '?item=tea">' + icx("coffee", "sm") + "<span><b>TEA TIME 신청</b><small>" + t.min + "분 · " + won(t.price) + "</small></span></a>" : "") + "</div>" : "");
  }
  // 상세 상단 왼쪽 · 썸네일 아래: 숫자로 보는 강의 + 배우는 것 + (VOD) 강사 두잉고 혜택
  function pdtSummary(p) {
    const t = typeOf(p), ev = isEvent(p), lz = lessons(p);
    const stat = ev ? [["calendar", "일시", fmtEvent(p.eventAt) || "-"], [t === "offline" ? "mapPin" : "video", t === "offline" ? "장소" : "진행", t === "offline" ? placeShort(p.place) || "신청 후 안내" : viaOf(p)], ["users", "정원", p.seats ? p.seats + "명" : "제한 없음"], ["clock", "진행 시간", durTxt(Number(p.eventMin) || totalMin(p))]]
      : t === "ebook" ? [["book", "분량", (Number(p.pages) || 0) + "쪽"], ["layers", "구성", (p.curriculum || []).length + "장"], ["file", "형식", (p.format || "PDF")], ["award", "이용", "평생 소장"]]
      : t === "book" ? [["book", "쪽수", Number(p.pages) ? Number(p.pages) + "쪽" : "-"], ["pen", "저자", p.author || p.creator || "-"], ["truck", "배송", shipFeeTxt(p)], ["clock", "출고", (Number(shipSet().outDays) || 2) + "일 안"]]
      : [["play", "강의 수", lz.length + "개"], ["clock", "총 시간", durTxt(totalMin(p))], ["calendar", "수강 기간", accessTxt(p)], ["sliders", "난이도", p.level || "입문"]];
    const learn = (p.learn || []).slice(0, 3);
    return '<div class="vd-pdt-sum"><ul class="vd-pdt-stat">' + stat.map((x) => "<li>" + icon(x[0], "sm") + "<small>" + x[1] + "</small><b>" + esc(x[2]) + "</b></li>").join("") + "</ul>" +
      (learn.length ? '<div class="vd-pdt-learn"><b>이 클래스에서 배워요</b><ul>' + learn.map((x) => "<li>" + icon("check", "xs") + "<span>" + esc(x) + "</span></li>").join("") + "</ul></div>" : "") +
      (dgOpen(p) ? '<div class="vd-pdt-dg"><span class="vd-dg-ic">' + (window.doinggoB ? window.doinggoB("black", "vd-dg-logo") : "두잉고") + '</span><div><b>구매하면 <em>' + esc(p.creator) + " 강사 두잉고</em>도 함께 열려요</b><small>교재 · 업데이트 소식 · 실습 체크리스트 · 1:1 질문을 강사의 학습 공간에서 수강 기간 동안 써요</small></div></div>" : "") +
      "</div>";
  }
  /* ---------- 로그인 · 회원가입 (패스트캠퍼스 로그인 화면 구성) ---------- */
  const pwField = (name, ac, ph) => '<span class="vd-pw"><input name="' + name + '" type="password" autocomplete="' + ac + '" maxlength="40" placeholder="' + ph + '"><button type="button" data-v="pw-eye" aria-label="비밀번호 보기">' + icon("eye", "sm") + "</button></span>";
  /* 로그인 카드 위 탭 [두잉고 | 두고클래스] — 누르면 페이지를 옮기지 않고 그 자리에서 카드 내용만 바꿔요 (주소는 ?tab=dg 로 기억) */
  const svcTabsHtml = (dg, page) => '<div class="lg-svc" role="tablist" aria-label="로그인할 곳 고르기"><a role="tab" class="lg-svc-dg' + (dg ? " on" : "") + '" href="#/vod/' + page + '?tab=dg" data-v="svc" data-k="dg" aria-selected="' + dg + '"><b>두잉고</b><small>기수 수강생 · 강사 강의실</small></a><a role="tab" class="lg-svc-vod' + (dg ? "" : " on") + '" href="#/vod/' + page + '" data-v="svc" data-k="vod" aria-selected="' + !dg + '"><b>두고클래스</b><small>VOD 구매 회원 · 이메일 로그인</small></a></div>';
  /** ‘두잉고’ 탭 내용: 강사 고르기 → 이름 · 뒷자리 (로그인은 두잉고 화면과 같은 app.js 의 DG_LOGIN 으로) */
  function dgPaneHtml() {
    const L = window.DG_LOGIN;
    if (!L) return '<p class="vd-dgl-lead">두잉고 로그인을 불러오지 못했어요. <a href="#/login">두잉고 로그인 화면</a>에서 로그인해 주세요.</p>';
    const list = L.list(), ins = list.find((x) => x.id === L.pick());
    const av = (x) => '<span class="vd-dgl-av' + (x.photo ? " ph" : "") + '">' + (x.photo ? '<img src="' + esc(x.photo) + '" alt="" decoding="async">' : esc(String(x.name || "?").slice(0, 1))) + "</span>";
    return '<div class="vd-dgl-logo">' + (window.doinggoB ? window.doinggoB("black", "vd-dg-logo") : "<b>두잉고</b>") + "</div>" +
      "<h1>두잉고 강의실<br>로그인</h1>" +
      '<p class="vd-dgl-lead">기수 수강생은 수강 신청할 때 적은 <b>이름 · 전화번호 뒷자리</b>로 들어가요.</p>' +
      (ins
        ? '<div class="vd-dgl-picked">' + av(ins) + '<span class="vd-dgl-t"><small>수강 중인 강의</small><b>' + esc(ins.name) + "</b>" + (ins.title ? "<em>" + esc(ins.title) + "</em>" : "") + '</span><button type="button" class="vd-tl-btn" data-v="dgl-change">변경</button></div>' +
          '<form class="vd-form" data-vd-dgl="' + esc(ins.id) + '" novalidate>' +
            '<label>이름<input name="name" autocomplete="name" maxlength="20" placeholder="예: 홍길동"></label>' +
            '<label>전화번호 뒷자리<span class="vd-pw"><input name="phone4" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="숫자 4자리"><button type="button" data-v="pw-eye" aria-label="번호 보기">' + icon("eye", "sm") + "</button></span></label>" +
            '<p class="vd-err" id="vd-dgl-err" role="alert"></p><button class="vd-btn vd-btn-p vd-btn-xl" type="submit">두잉고 강의실 로그인</button></form>'
        : '<p class="vd-dgl-q">어떤 강사님의 강의를 듣고 계신가요?</p><div class="vd-dgl-list">' + list.map((x) => '<button type="button" class="vd-dgl-ins" data-v="dgl-pick" data-id="' + esc(x.id) + '">' + av(x) + '<span class="vd-dgl-t"><b>' + esc(x.name) + "</b>" + (x.field ? "<small>" + esc(x.field) + "</small>" : "") + "</span>" + icon("chevRight", "sm") + "</button>").join("") + "</div>") +
      '<p class="vd-dgl-foot">' + icon("alert", "xs") + "<span>두고클래스(VOD) 회원 계정과는 따로예요. DOOGO CLASS에서 VOD를 샀다면 위 <b>‘두고클래스’</b> 탭에서 로그인해 주세요.</span></p>";
  }
  function dglPaint(focus) {
    const p = document.querySelector('.vd-svc-pane[data-pane="dg"]'); if (!p) return;
    p.innerHTML = dgPaneHtml();
    const n = focus && p.querySelector("[data-vd-dgl] input[name=name]"); if (n) n.focus({ preventScroll: true });
  }
  function svcSwitch(k) {
    const card = document.querySelector(".vd-auth-card[data-svc]"); if (!card) return;
    const dg = k === "dg", page = route().path[0] === "signup" ? "signup" : "login";
    card.dataset.svc = dg ? "dg" : "vod";
    card.querySelectorAll(".lg-svc [data-k]").forEach((a) => { const on = a.dataset.k === card.dataset.svc; a.classList.toggle("on", on); a.setAttribute("aria-selected", String(on)); });
    card.querySelectorAll(".vd-svc-pane").forEach((x) => { x.hidden = x.dataset.pane !== card.dataset.svc; });
    const qs = new URLSearchParams(route().qs.toString()); if (dg) qs.set("tab", "dg"); else qs.delete("tab");
    ROUTE.replace("#/vod/" + page + (qs.toString() ? "?" + qs.toString() : ""));
    if (dg) dglPaint(false); else tsMount(card);
  }
  function doDgLogin(f) {
    const L = window.DG_LOGIN, err = f.querySelector("#vd-dgl-err"), b = f.querySelector("button[type=submit]");
    if (!L) return;
    if (b) b.disabled = true;
    L.login(f.dataset.vdDgl, f.elements.namedItem("name").value, f.elements.namedItem("phone4").value).then((r) => {
      if (b) b.disabled = false;
      if (r && r.ok) return;
      if (err) { if (r && r.html) err.innerHTML = r.msg; else err.textContent = (r && r.msg) || "로그인하지 못했어요."; }
      const fe = r && r.field && f.elements.namedItem(r.field); if (fe) fe.focus();
    });
  }
  function pageAuth(signup) {
    const q = route().qs, ret = q.get("next") || "", nx = ret ? "?next=" + encodeURIComponent(ret) : "", toDg = ret === "#/vod/dg", dgTab = q.get("tab") === "dg";
    if (!signup && toDg && me() && !dgTab) return pageDg();
    return shell("", '<div class="vd-auth"><div class="vd-auth-card" data-svc="' + (dgTab ? "dg" : "vod") + '">' + svcTabsHtml(dgTab, signup ? "signup" : "login") +
      '<div class="vd-svc-pane" data-pane="dg"' + (dgTab ? "" : " hidden") + ">" + (dgTab ? dgPaneHtml() : "") + "</div>" +
      '<div class="vd-svc-pane" data-pane="vod"' + (dgTab ? " hidden" : "") + ">" + logoImg +
      (toDg ? '<div class="vd-auth-dg"><span class="vd-dg-ic">' + (window.doinggoB ? window.doinggoB("black", "vd-dg-logo") : "두잉고") + "</span><div><b>로그인하면 두잉고 VOD 강의실로 바로 들어가요</b><small>DOOGO CLASS에서 VOD를 살 때 가입한 이메일 · 비밀번호(또는 카카오)로 로그인해 주세요. 두잉고 기수 수강생은 왼쪽 ‘두잉고’ 탭이에요.</small></div></div>" : "") +
      "<h1>" + (signup ? "돈 되는 배움의 시작,<br>DOOGO CLASS 회원가입" : "돈 되는 배움,<br>DOOGO CLASS.") + "</h1>" +
      '<button type="button" class="vd-kakao" data-v="kakao">' + KAKAO + "카카오로 1초 만에 " + (signup ? "가입하기" : "시작하기") + "</button>" +
      '<div class="vd-or"><span>또는 이메일로 ' + (signup ? "가입" : "로그인") + "</span></div>" +
      '<form class="vd-form" data-vd-auth="' + (signup ? "signup" : "login") + '" data-next="' + esc(ret) + '" novalidate>' +
        (signup ? '<label>이름<input name="name" autocomplete="name" maxlength="20" placeholder="이름을 입력해 주세요"></label>' : "") +
        '<label>이메일<input name="email" type="email" autocomplete="email" maxlength="80" placeholder="example@doogoclass.com"></label>' +
        (signup ? '<label>휴대폰 번호<input name="phone" type="tel" inputmode="tel" maxlength="20" placeholder="010-0000-0000"></label>' : "") +
        "<label>비밀번호" + pwField("pw", signup ? "new-password" : "current-password", signup ? "영문 · 숫자 섞어 8자 이상" : "비밀번호를 입력해 주세요") + "</label>" +
        (signup ? "<label>비밀번호 확인" + pwField("pw2", "new-password", "비밀번호를 한 번 더 입력해 주세요") + '</label><div class="vd-agrees"><label class="vd-agree vd-agree-all"><input type="checkbox" data-v="agree-all"><span>전체 동의</span></label><label class="vd-agree"><input type="checkbox" name="agree"><span>(필수) 만 14세 이상이며, 이용약관 · 개인정보 수집 · 이용에 동의해요</span></label><label class="vd-agree"><input type="checkbox" name="mkt"><span>(선택) 할인 · 새 클래스 소식 받기 (문자 · 이메일 · 카카오톡)</span></label></div>' : '<div class="vd-find"><button type="button" class="vd-tl-btn" data-v="pw-find">비밀번호 찾기</button></div>') +
        '<div class="vd-ts" data-ts></div><p class="vd-err" id="vd-auth-err" role="alert"></p><button class="vd-btn vd-btn-p vd-btn-xl" type="submit" disabled>' + (signup ? "가입하기" : "로그인") + "</button></form>" +
      (signup ? '<p class="vd-auth-alt">이미 회원이신가요? <a href="#/vod/login' + nx + '">로그인</a></p>' : '<a class="vd-btn vd-btn-line vd-btn-xl" href="#/vod/signup' + nx + '">이메일로 회원가입</a>' + (V().settings.demoLogin === false ? "" : '<p class="vd-auth-demo">체험 계정 · vod@gmail.com / vod</p>') + '') +
      (signup ? '<p class="vd-auth-gift"><span class="vd-ag-ic">' + icon("gift", "sm") + '</span><span class="vd-ag-t"><b>가입하면 5,000원 할인 쿠폰을 바로 드려요</b><small>가입일부터 30일 동안 쓸 수 있어요</small></span></p>' : "") +
      '</div></div><p class="vd-auth-faq">로그인 · 가입에 문제가 있나요? <button type="button" data-v="auth-faq">자주 묻는 질문</button></p>' +
      '<p class="vd-auth-note">' + icon("alert", "xs") + "두잉고 기수 수강생 계정과는 따로예요. 기수 수강생은 위 <a href=\"#/vod/" + (signup ? "signup" : "login") + "?tab=dg\" data-v=\"svc\" data-k=\"dg\">‘두잉고’ 탭</a>에서 로그인해 주세요.</p></div>");
  }

  /* ================= v19 외부 연결: 포트원(PG) 결제 · 카카오 로그인 · Cloudflare Turnstile =================
   * 정식 서버(Vercel)에서는 /api/vod-config 가 ‘무엇이 연결됐는지’만 알려 줘요 (비밀 값은 절대 화면으로 오지 않아요).
   *  - 포트원: 상점 ID · 채널 키가 있으면 결제 버튼이 포트원 결제창을 열고, 결제 뒤 서버가 포트원에 다시 물어 금액을 확인해요.
   *  - 카카오: 서버에 키가 있으면 ‘카카오로 1초 만에’가 진짜 카카오 동의 화면으로 가요.
   * 서버가 없거나(시안 · 미리보기) 키가 없으면 지금처럼 체험 화면으로 동작해요. */
  let CFG = null, cfgP = null;
  const remoteOn = () => !!(DB.remote && DB.remote.on);
  function loadCfg() {
    if (!remoteOn()) return Promise.resolve(null);
    if (!cfgP) cfgP = fetch("/api/vod-config", { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).then((j) => { CFG = j && j.cfg ? j.cfg : null; return CFG; }, () => null);
    return cfgP;
  }
  const payServer = () => !!(remoteOn() && CFG && CFG.portone && CFG.portone.storeId);
  const kakaoServer = () => !!(remoteOn() && CFG && CFG.kakao);
  const tsKey = () => (remoteOn() && CFG && CFG.turnstile) || "";
  const srvOn = () => !!(remoteOn() && CFG && CFG.auth);
  function srvTrack(pid, lid, ev) { if (srvOn() && pid) payApi("track", { pid, lid: lid || "", ev }).catch(() => {}); }
  /* 마스터가 가격 · 쿠폰 · 환불 규정을 바꾸면 결제 서버에도 같은 가격표를 올려요 (서버가 이 가격표로 금액을 다시 계산해요) */
  const CAT_P = ["id", "title", "type", "status", "price", "sale", "saleEnd", "plans", "accessDays", "eventAt", "eventMin", "seats", "next", "ebPrice", "ebDays", "coach", "tea", "iid", "share", "shipFee", "stock"];
  const CAT_C = ["id", "code", "name", "kind", "value", "max", "min", "days", "endAt", "types", "auto", "dl", "on"];
  const pickK = (o, ks) => { const r = {}; ks.forEach((k) => { if (o && o[k] !== undefined) r[k] = o[k]; }); return r; };
  let catT = null, catLast = "";
  function catalogSnap() {
    const v = V(), s = v.settings || {};
    return { products: v.products.map((p) => Object.assign(pickK(p, CAT_P), { dg: dgOpen(p) }, insShown(p) ? {} : { status: "hidden" })), coupons: (v.coupons || []).map((c) => pickK(c, CAT_C)), settings: pickK(s, ["coach", "tea", "extendPct", "refund"]), biz: v.biz || {} };
  }
  function catSoon() {
    const a = DB.session && DB.session.admin(); if (!remoteOn() || !a || a.role !== "master") return;
    clearTimeout(catT);
    catT = setTimeout(() => loadCfg().then(() => {
      if (!srvOn()) return;
      const c = catalogSnap(), j = JSON.stringify(c); if (j === catLast) return;
      payApi("catalog", { catalog: c }).then((r) => { if (r && r.ok) catLast = j; else console.warn("[vod] 가격표 올리기 실패", r && r.message); });
    }), 1500);
  }
  if (DB.onSave) DB.onSave(catSoon);
  function payApi(action, body) {
    return fetch("/api/vod-pay", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ action }, body || {})) }).then((r) => r.json().catch(() => ({ ok: false, message: "서버 응답을 읽지 못했어요." })));
  }
  function authApi(action, body) {
    return fetch("/api/vod-auth", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ action }, body || {})) }).then((r) => r.json().catch(() => ({ ok: false, message: "서버 응답을 읽지 못했어요." })));
  }
  const loadJs = (src) => new Promise((ok, no) => { if (document.querySelector('script[src="' + src + '"]')) return ok(); const s = document.createElement("script"); s.src = src; s.async = true; s.onload = () => ok(); s.onerror = () => no(new Error("load")); document.head.appendChild(s); });
  /** 서버가 돌려준 회원 정보를 이 화면의 회원 목록에 맞춰 넣고 로그인 상태로 */
  function upsertMember(sm) {
    if (!sm || !sm.id) return null;
    const list = V().members; let m = list.find((x) => x.id === sm.id);
    if (!m) { m = { id: sm.id, createdAt: sm.createdAt || now(), points: 0, pointLog: [], tags: [], notes: [] }; list.push(m); if (!Array.isArray(sm.coupons)) (V().coupons || []).filter((c) => c.auto === "signup" && c.on !== false).forEach((c) => issueCoupon(m.id, c)); }
    ["via", "email", "name", "phone", "marketing", "consent", "kakaoCh", "kakaoId", "birth", "gender", "age", "src"].forEach((k) => { if (sm[k] !== undefined) m[k] = sm[k]; });
    // 쿠폰 · 포인트는 서버가 기준 (결제 때 서버가 같은 쿠폰 번호로 다시 확인해요)
    if (Array.isArray(sm.coupons)) (V().memberCoupons = V().memberCoupons || {})[m.id] = sm.coupons.map((x) => Object.assign({}, x));
    if (sm.points != null) { m.points = Number(sm.points) || 0; if (Array.isArray(sm.pointLog)) m.pointLog = sm.pointLog.slice(); }
    m.lastLoginAt = now(); m.seenAt = now(); setMe(m.id); save(); return m;
  }
  /* 결제창: 정식 → 포트원 V2 (서버가 금액을 정하고 확인) · 시안 → 체험 결제창 */
  const PG_NAME = { card: "신용 · 체크카드", kakao: "카카오페이", toss: "토스페이", naver: "네이버페이", transfer: "실시간 계좌이체", vbank: "가상계좌" };
  function pgOpen(x) {
    if (SRV() && !payServer()) return Promise.reject(new Error("카드 · 간편결제는 PG 심사가 끝나면 열려요. 지금은 무통장 입금으로 결제해 주세요."));
    return payServer() ? pgReal(x) : new Promise((ok) => {
      modal("결제하기", '<div class="vd-modal-b vd-pgm"><p class="vd-pgm-tag">' + icon("shieldCheck", "xs") + "<span>시안 결제창이에요. 실제로는 이 자리에 <b>포트원 결제창</b>(카드사 · 간편결제 화면)이 열려요.</span></p>" +
        '<div class="vd-pgm-sum"><small>' + esc(x.title) + '</small><b>' + won(x.amount) + "</b><span>" + esc(PG_NAME[x.method] || "결제") + "</span></div>" +
        '<div class="vd-pgm-card" aria-hidden="true"><i></i><span>**** **** **** 1234</span><em>체험용 카드</em></div>' +
        '<div class="vd-pgm-a"><button type="button" class="vd-btn vd-btn-o" data-v="pg-no">결제 취소</button><button type="button" class="vd-btn vd-btn-p" data-v="pg-ok">' + won(x.amount) + " 결제하기</button></div>" +
        '<p class="vd-muted vd-pgm-note">결제 취소를 누르면 주문이 만들어지지 않아요 (실제 결제에서 창을 닫은 경우와 같아요).</p></div>', "vd-pg-modal");
      pgWait = (v, fromClose) => { pgWait = null; if (!fromClose) closeModal(); ok(v ? { mock: true, at: now() } : null); };
    });
  }
  let pgWait = null;
  async function pgReal(x) {
    const prep = await payApi("prepare", x.req);
    if (!prep || !prep.ok) throw new Error((prep && prep.message) || "결제를 준비하지 못했어요.");
    if (prep.free) return { server: prep };
    await loadJs("https://cdn.portone.io/v2/browser-sdk.js");
    const ch = CFG.portone.channels || {}, easy = { kakao: "KAKAOPAY", toss: "TOSSPAY", naver: "NAVERPAY" }[x.method];
    const acc = x.method === "transfer" || x.method === "vbank";
    const req = { storeId: CFG.portone.storeId, channelKey: ch[easy || acc ? x.method : "card"] || ch.card, paymentId: prep.paymentId, orderName: prep.orderName, totalAmount: prep.amount, currency: "KRW", payMethod: easy ? "EASY_PAY" : x.method === "transfer" ? "TRANSFER" : x.method === "vbank" ? "VIRTUAL_ACCOUNT" : "CARD",
      customer: { fullName: x.buyer.name || undefined, phoneNumber: x.buyer.phone || undefined, email: x.buyer.email || undefined }, redirectUrl: location.origin + "/?pay=" + encodeURIComponent(prep.paymentId) + "#/vod/order/" + encodeURIComponent(prep.no) };
    if (easy) req.easyPay = { easyPayProvider: easy };
    // 가상계좌: 입금 기한(시간) — 서버 설정 (기본 72시간)
    if (x.method === "vbank") req.virtualAccount = { accountExpiry: { validHours: Number(CFG.portone.vbankHours) || 72 } };
    const res = await window.PortOne.requestPayment(req);
    if (!res || res.code) { payApi("abort", { paymentId: prep.paymentId, code: res && res.code }); return null; }
    const done = await payApi("complete", { paymentId: prep.paymentId });
    if (!done || !done.ok) throw new Error((done && done.message) || "결제를 확인하지 못했어요. 고객센터로 알려 주세요.");
    return { server: done, paymentId: prep.paymentId, txId: res.txId || "" };
  }
  /** 휴대폰 결제(다른 창으로 갔다 돌아옴): 주소의 ?pay= 를 보고 서버에 결제 확인을 마저 해요 */
  function pgReturn() {
    const q = new URLSearchParams(location.search), pid = q.get("pay"); if (!pid || !remoteOn()) return;
    ROUTE.dropQuery(["pay", "paymentId", "code", "message", "pgCode", "pgMessage", "transactionType", "txId"]); // 포트원이 붙여 보내는 값
    if (q.get("code")) { payApi("abort", { paymentId: pid, code: q.get("code") }); toast("결제를 마치지 못했어요. 다시 시도해 주세요.", "warn"); return; }
    payApi("complete", { paymentId: pid }).then((d) => { if (d && d.ok) { DB.remote.refresh().then(() => { render(); toast(d.vbank ? "가상계좌가 발급됐어요. 입금하면 바로 이용할 수 있어요." : "결제를 확인했어요."); }); } else toast((d && d.message) || "결제를 확인하지 못했어요. 고객센터로 알려 주세요.", "warn"); });
  }
  let pgDone = null;
  /** 카카오: 서버 로그인에서 돌아오면(?vodlogin=ok) 서버의 회원 정보로 로그인 */
  const KK_BACK = {
    deny: "카카오 동의를 취소했어요. 이메일로도 가입할 수 있어요.",
    dup: "같은 이메일로 이미 가입한 계정이 있어요. 이메일로 로그인한 뒤 마이페이지 › 계정 설정에서 카카오를 연결해 주세요.",
    blocked: "이용이 중지된 계정이에요. 문의하기(카카오톡 상담)로 알려 주세요.",
    fail: "카카오 로그인을 마치지 못했어요. 잠시 후 다시 시도해 주세요."
  };
  function kkReturn() {
    const q = new URLSearchParams(location.search), st = q.get("vodlogin"); if (!st || !remoteOn()) return;
    ROUTE.dropQuery(["vodlogin"]);
    if (st !== "ok") { toast(KK_BACK[st] || KK_BACK.fail, "warn"); if (st === "dup" && route().path[0] !== "login") ROUTE.hash = "#/vod/login"; return; }
    DB.remote.refresh().then(() => { const mm = me(); render(); if (mm) toast((mm.name || "회원") + "님, 반가워요!"); });
  }
  /** Cloudflare Turnstile (사람 확인): 서버에 사이트 키가 있을 때만 가입 · 로그인 · 문의 양식에 붙여요 */
  function tsMount(scope) {
    const k = tsKey(); if (!k) return;
    (scope || document).querySelectorAll("[data-ts]:not([data-ts-on])").forEach((el) => { el.dataset.tsOn = "1"; loadJs("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit").then(() => { if (window.turnstile) el.dataset.tsId = window.turnstile.render(el, { sitekey: k, size: "flexible" }); }, () => {}); });
  }
  const tsToken = (f) => { const el = f && f.querySelector("[data-ts]"); return el && window.turnstile && el.dataset.tsId != null ? window.turnstile.getResponse(el.dataset.tsId) || "" : ""; };
  Object.assign(window.VOD, { loadCfg, payServer, kakaoServer, payApi, authApi, upsertMember, catalogSnap, catSoon, srvTrack, bankAuto, bankOf, tkey, phOf, insOff, insShown });
  /* ---------- 카카오로 1초 가입 (시안) ----------
   * 실제 서비스: 카카오싱크 동의 화면(카카오가 띄움) → 인가 코드 → 서버에서 토큰 · 사용자 정보 → 회원 DB에 via:"kakao" · 카카오 회원번호로 저장
   * 시안: 같은 동의 항목을 보여 주고, 체험용 카카오 계정으로 가입 · 로그인해요 (이 브라우저에 기억 → 다음부터는 바로 로그인) */
  const KK_NAMES = ["정OO", "최OO", "한OO", "윤OO", "장OO", "임OO", "오OO", "서OO"];
  /** 두잉고 로그인 화면의 ‘두고클래스’ 탭: 카카오 로그인 (서버에 카카오가 연결돼 있으면 바로 · 시안은 두고클래스 로그인 화면에서) */
  function kakaoGo(next) {
    if (kakaoServer()) { location.href = "/api/vod-auth?action=kakao&next=" + encodeURIComponent(next || "#/vod"); return "go"; }
    return SRV() ? "off" : "demo";
  }
  /** 이메일 로그인만 (두잉고 로그인 화면의 ‘두고클래스’ 탭이 써요) → Promise<{ ok, name } | { ok:false, message }> · 화면 이동은 부른 쪽에서 */
  function authLogin(email, pw, ts) {
    // 두잉고 화면으로 바로 들어오면 서버 설정(vod-config)을 아직 안 받았을 수 있어서 먼저 받아요
    return loadCfg().then(() => authLoginNow(email, pw, ts));
  }
  function authLoginNow(email, pw, ts) {
    email = String(email || "").trim().toLowerCase(); pw = String(pw || "");
    const no = (message) => Promise.resolve({ ok: false, message });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return no("이메일 형식이 올바르지 않아요. 다시 확인해 주세요.");
    if (!pw) return no("비밀번호를 입력해 주세요.");
    if (SRV() && !(CFG && CFG.auth)) return no("회원가입 · 로그인을 잠시 준비 중이에요. 운영 상담 채널로 문의해 주세요.");
    if (remoteOn() && CFG && CFG.auth) {
      return authApi("login", { email, pw, ts: ts || "" }).then((r) => {
        if (!r || !r.ok) return { ok: false, message: (r && r.message) || "다시 시도해 주세요." };
        return DB.remote.refresh().then(() => ({ ok: true, name: (r.member && r.member.name) || "회원" }));
      }, () => ({ ok: false, message: "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요." }));
    }
    const hit = V().members.find((x) => String(x.email || "").toLowerCase() === email && x.pw === pw);
    if (!hit) return no("이메일 또는 비밀번호가 맞지 않아요. 다시 확인해 주세요.");
    if (hit.blocked) return no("이용이 중지된 계정이에요. 고객센터로 문의해 주세요.");
    setMe(hit.id); hit.lastLoginAt = now(); hit.loginN = (hit.loginN || 0) + 1; save();
    return Promise.resolve({ ok: true, name: hit.name });
  }
  Object.assign(window.VOD, { authLogin, kakaoGo, tsMount, tsToken, tsOn: () => !!tsKey(), KAKAO_ICON: KAKAO });
  function kakaoStart() {
    if (SRV() && !kakaoServer()) { toast("카카오로 1초 가입은 곧 열려요. 지금은 이메일로 가입해 주세요.", "warn"); return; }
    if (kakaoServer()) { const f = document.querySelector("[data-vd-auth]"), nx = (f && f.dataset.next) || "#/vod"; location.href = "/api/vod-auth?action=kakao&next=" + encodeURIComponent(nx); return; }
    const kid = ls.get(KEY_KK), hit = kid && V().members.find((x) => x.id === kid && !x.blocked);
    if (hit) { kakaoIn(hit, "카카오로 로그인했어요. (시안)"); return; }
    const row = (k, req, t, s) => '<label class="vd-kk-row"><input type="checkbox" data-kk="' + k + '"><span><em class="' + (req ? "req" : "opt") + '">' + (req ? "필수" : "선택") + "</em><b>" + t + "</b>" + (s ? "<small>" + s + "</small>" : "") + "</span></label>";
    modal("카카오로 1초 가입", '<div class="vd-kk" data-vd-kk>' +
      '<div class="vd-kk-top"><span class="vd-kk-logo">' + KAKAO + '</span><div><b>DOOGO CLASS</b><small>카카오 계정 정보로 바로 가입해요</small></div></div>' +
      '<p class="vd-kk-note">' + icon("alert", "xs") + "<span>시안 화면이에요. 실제 서비스에서는 이 자리에 <b>카카오가 띄우는 동의 화면</b>이 나와요. 지금은 체험용 카카오 계정으로 가입돼요.</span></p>" +
      '<label class="vd-kk-row vd-kk-all"><input type="checkbox" data-v="kk-all"><span><b>모두 동의하기</b><small>선택 항목은 동의하지 않아도 가입할 수 있어요</small></span></label>' +
      row("prof", true, "이름 · 카카오계정(이메일) · 휴대폰 번호 제공", "회원 확인 · 수강 안내 · 결제 알림에 써요") + row("terms", true, "DOOGO CLASS 이용약관 동의 (만 14세 이상)") + row("pi", true, "개인정보 수집 · 이용 동의") +
      row("birth", false, "생일 · 성별 · 연령대 제공", "생일 쿠폰 · 맞춤 클래스 추천에 써요") + row("ch", false, "DOOGO CLASS 카카오톡 채널 추가", "새 클래스 · 쿠폰 소식을 채널로 받아요") + row("mkt", false, "할인 · 새 클래스 소식 받기 (광고성 정보)", "문자 · 이메일 · 카카오톡으로 받아요") +
      '<p class="vd-err" id="vd-kk-err" role="alert"></p><button type="button" class="vd-btn vd-kk-ok vd-btn-xl" data-v="kk-ok">' + KAKAO + "동의하고 계속하기</button>" +
      '<button type="button" class="vd-tl-btn vd-kk-demo" data-v="kk-demo">체험 계정(vod@gmail.com)으로 로그인할게요</button></div>', "vd-kk-modal");
  }
  function kakaoIn(m, msg) { setMe(m.id); m.lastLoginAt = now(); m.seenAt = now(); m.loginN = (m.loginN || 0) + 1; save(); closeModal(); toast(msg); const f = document.querySelector("[data-vd-auth]"); ROUTE.hash = (f && f.dataset.next) || "#/vod"; }
  function kakaoOk() {
    const q = (k) => { const x = document.querySelector('[data-kk="' + k + '"]'); return !!(x && x.checked); }, err = document.getElementById("vd-kk-err");
    if (!q("prof") || !q("terms") || !q("pi")) { if (err) err.textContent = "필수 항목 3가지에 동의해 주세요."; return; }
    const list = V().members, n = list.length, r4 = String(1000 + Math.floor(Math.random() * 9000)), t = now();
    const mb = { id: DB.uid("vm"), via: "kakao", kakaoId: "4" + String(t).slice(-9), email: "kakao" + r4 + "@example.com", name: KK_NAMES[n % KK_NAMES.length], phone: "010-0000-" + r4, marketing: q("mkt"), consent: consentOf(q("mkt"), t, "카카오 가입"), src: takeSrc(), kakaoCh: q("ch"), tags: [], notes: [], createdAt: t, seenAt: t, loginN: 0, points: 0, pointLog: [] };
    if (q("birth")) Object.assign(mb, { birth: ["03-14", "07-22", "11-05", "12-24"][n % 4], gender: n % 2 ? "male" : "female", age: ["20~29", "30~39", "40~49"][n % 3] });
    list.push(mb); (V().coupons || []).filter((c) => c.auto === "signup" && c.on !== false).forEach((c) => issueCoupon(mb.id, c));
    ls.set(KEY_KK, mb.id);
    kakaoIn(mb, "카카오로 1초 만에 가입했어요! 5,000원 할인 쿠폰을 넣어 드렸어요. (시안)");
  }
  /* ---------- 두잉고 VOD 강의실 입장 (#/vod/dg) — 두잉고 로그인 › 두고클래스 탭에서 이메일로 로그인하면 여기로 와요 ---------- */
  function dgList(m) {
    const seen = {};
    return V().orders.filter((o) => o.mid === m.id && o.status === "paid").sort((a, b) => b.paidAt - a.paidAt).map((o) => product(o.pid))
      .filter((p) => p && dgOpen(p) && owns(m.id, p.id) && !seen[p.id] && (seen[p.id] = 1));
  }
  function pageDg() {
    const m = me();
    if (!m) { ROUTE.redirect("#/vod/login?next=" + encodeURIComponent("#/vod/dg")); return ""; }
    const list = dgList(m);
    if (list.length === 1) { setTimeout(() => enterDg(list[0].id), 0); return shell("", '<div class="vd-wrap vd-dgp"><p class="vd-dgp-wait">' + esc(list[0].title) + " 강의실로 들어가는 중…</p></div>"); }
    return shell("", '<div class="vd-wrap vd-dgp"><div class="vd-dgp-h"><span class="vd-dg-ic">' + (window.doinggoB ? window.doinggoB("black", "vd-dg-logo") : "두잉고") + "</span><h1>" + esc(m.name) + "님, 어느 강의실로 들어갈까요?</h1><p>VOD마다 두잉고 강의실이 따로 있어요. 강의 영상 · 자료 · 업데이트 소식 · FAQ가 강의별로 정리돼 있어요.</p></div>" +
      (list.length ? '<div class="vd-dgp-g">' + list.map((p) => { const pc = pctDone(m.id, p.id); return '<button type="button" class="vd-dgp-c" data-v="dg" data-p="' + esc(p.id) + '"><span class="vd-dgp-th vd-thumb vd-th-vod">' + thumbArt(p) + '</span><span class="vd-dgp-t"><small>' + esc(p.creator) + " 강사 두잉고</small><b>" + esc(p.title) + '</b><span class="vd-dgp-bar"><i style="width:' + pc + '%"></i></span><em>진도 ' + pc + "% · " + (pc ? "이어 보기" : "1강부터 시작") + "</em></span>" + icon("arrowRight", "sm") + "</button>"; }).join("") + "</div>"
        : emptyBox("monitorPlay", "두잉고 강의실이 열린 VOD가 아직 없어요", "VOD를 사면 그 강사님의 두잉고 강의실이 열려요. 전자책은 마이페이지에서 바로 내려받아요.", '<a class="vd-btn vd-btn-p" href="#/vod/c/all?tab=vod">VOD 둘러보기</a><a class="vd-btn vd-btn-o" href="#/vod/my/classes">내 강의실</a>')) + "</div>", "cls");
  }
  /* ---------- 결제 · 완료 (쿠폰 · 포인트) ---------- */
  const CO_KINDS = ["extend", "coach", "tea"];
  function pageCheckout(id) {
    const p = product(id), m = me(), qs = route().qs, k = CO_KINDS.indexOf(qs.get("item")) >= 0 ? qs.get("item") : "course";
    if (!p) return pageProduct(id);
    if (!m) { ROUTE.redirect("#/vod/login?next=" + encodeURIComponent(ROUTE.hash)); return ""; }
    const back = (msg) => { if (msg) toast(msg, "warn"); ROUTE.redirect("#/vod/p/" + id); return ""; };
    if (!insShown(p)) { ROUTE.redirect("#/vod"); toast("지금은 판매하지 않는 클래스예요.", "warn"); return ""; }
    if (k === "course") {
      if (p.status !== "on" || eventPast(p)) return back();
      if (isBook(p) && stockLeft(p) === 0) return back("품절됐어요. 재입고되면 다시 열려요.");
      if (owns(m.id, p.id) && !isBook(p)) { ROUTE.redirect("#/vod/learn/" + p.id); return ""; }
      if (seatsLeft(p) === 0) return back("자리가 모두 찼어요.");
    } else if (k === "extend" && !canExtend(m.id, p.id)) return back(owns(m.id, p.id) ? "수강 기간이 30일 넘게 남아 있어요. 끝나기 30일 전부터 연장할 수 있어요." : "이 강의를 수강한 회원만 연장할 수 있어요.");
    else if (k === "coach" && !(coachOf(p) && owns(m.id, p.id))) return back("이 강의를 수강 중인 회원만 1:1 코칭권을 살 수 있어요.");
    else if (k === "tea" && !(teaOf(p) && owns(m.id, p.id))) return back("이 강의를 수강 중인 회원만 TEA TIME을 신청할 수 있어요.");
    const ps = k === "course" ? plansOf(p) : [], s = PSEL[p.id] || {}, sel = ps.length ? planOf(p, qs.get("plan") || s.d) : null, c = coachOf(p), t = teaOf(p), x = extendOf(p);
    const coachOn = k === "course" && !!c && !!sel && (qs.get("coach") === "1" || (!qs.get("plan") && !!s.coach));
    const pr = k === "course" ? (sel ? sel.sale : priceOf(p)) : k === "extend" ? x.sale : k === "coach" ? c.price : t.price;
    const list = k === "course" ? (sel ? sel.list : Number(p.price) || 0) : pr, b = bankInfo(), cps = k === "course" && pr > 0 ? couponsFor(m.id, p, pr) : [], pts = Number(m.points) || 0, all = myCoupons(m.id).filter((y) => y.st === "ok").length;
    const bk = isBook(p), sf = shipFeeOf(p), qmax = Math.max(1, Math.min(BOOK_MAX, stockLeft(p) == null ? BOOK_MAX : stockLeft(p)));
    const e0 = accessEnd(m.id, p.id), newEnd = DB.date.toStr(new Date(Math.max(now(), e0 === Infinity ? now() : e0) + 365 * 864e5)), left = c ? coachLeft(m.id, p.iid) : 0;
    const h1 = k === "extend" ? "1년 연장권 결제" : k === "coach" ? "1:1 코칭권 결제" : k === "tea" ? "TEA TIME 신청 · 결제" : bk ? "종이책 주문 · 결제" : pr === 0 ? "무료 수강신청" : "주문 · 결제";
    const kindNote = k === "extend" ? icon("refresh", "xs") + "<span><b>1년 연장권 · 365일</b> 결제하면 <b>" + DB.date.fmtFull(newEnd) + "</b>까지 다시 들을 수 있어요. 진도 · 노트는 그대로 이어져요.</span>"
      : k === "coach" ? icon("message", "xs") + "<span><b>1:1 코칭권 " + c.n + "회 · " + c.days + "일</b> (" + DB.date.fmtFull(DB.date.addDays(today(), c.days)) + "까지) · 두잉고 강의실 ‘1:1 코칭 질문’에서 써요." + (left ? " 지금 남은 코칭 " + left + "회" : "") + "</span>"
      : k === "tea" ? icx("coffee", "xs") + "<span><b>강사님과 TEA TIME " + t.min + "분</b> · " + TEA_MODE[t.mode] + " · 강사님이 일정을 확정하면 알려 드려요.</span>" : "";
    const agree1 = bk ? "수량 · 배송지" : k === "course" ? (isEvent(p) ? "일정 · 장소" : "수강 기간 (" + (sel ? '<span data-co-plan>' + sel.label + "</span> 수강권" : esc(accessTxt(p))) + ")") : k === "extend" ? "연장 기간 (365일 · " + DB.date.fmtFull(newEnd) + "까지)" : k === "coach" ? "코칭권 횟수 (" + c.n + "회) · 사용 기간 (" + c.days + "일)" : "TEA TIME은 강사님 확정 후 일정이 정해지는 것";
    const agree2 = bk ? "보내기 전에는 바로 취소되고, 받은 날부터 7일 안에 반품할 수 있어요 (단순 변심은 왕복 배송비 구매자 부담)." : k === "coach" ? "질문을 남기기 전 7일 이내는 전액, 쓴 뒤에는 남은 횟수만큼 환불돼요." : k === "tea" ? "확정 전 · 확정 3일 전까지 전액, 1~2일 전 50% 환불되고 당일 · 불참은 환불되지 않아요." : typeOf(p) === "ebook" ? "전자책을 내려받으면 청약철회가 제한돼요." : isEvent(p) ? "강의 " + rfSet().eventDays + "일 전까지는 전액, 1~2일 전은 50% 환불되고 당일 · 불참은 환불되지 않아요." : "결제 후 " + rfSet().days + "일 이내 · 강의를 듣기 전이면 마이페이지에서 바로 100% 취소돼요. 강의를 재생하거나 자료를 내려받으면 그 부분은 청약철회가 제한될 수 있어요.";
    return shell("", '<div class="vd-wrap vd-co"><h1 class="vd-h1">' + h1 + '</h1><form class="vd-co-grid" data-vd-pay="' + esc(p.id) + '" data-kind="' + k + '" novalidate><div class="vd-co-main">' +
      '<section class="vd-co-box"><h2>주문 상품</h2><div class="vd-co-item"><span class="vd-co-th">' + thumbArt(p) + "</span><div><small>" + esc(TYPE[typeOf(p)][0]) + " · " + esc(p.creator) + "</small><b>" + esc(p.title) + "</b><span>" + metaOf(p).map(esc).join(" · ") + "</span></div></div>" +
        (kindNote ? '<p class="vd-co-kind">' + kindNote + "</p>" : "") +
        (isEvent(p) ? '<p class="vd-co-ev">' + icon("calendar", "xs") + fmtEvent(p.eventAt, true) + (typeOf(p) === "offline" ? " · " + esc(p.place || "") : " · Zoom LIVE") + "</p>" : "") +
        (bk ? '<div class="vd-co-qty"><span>수량 <small>한 번에 ' + qmax + "권까지" + (stockLeft(p) != null ? " · 남은 재고 " + stockLeft(p) + "권" : "") + '</small></span><div class="vd-qty"><button type="button" data-v="qty" data-d="-1" aria-label="한 권 빼기">' + icon("minus", "xs") + '</button><input name="qty" type="number" min="1" max="' + qmax + '" value="' + Math.min(qmax, Math.max(1, Number(qs.get("qty")) || 1)) + '" inputmode="numeric" aria-label="수량"><button type="button" data-v="qty" data-d="1" aria-label="한 권 더하기">' + icon("plus", "xs") + "</button></div></div>" : "") + "</section>" +
      (bk ? shipBox(m) : "") +
      (sel ? '<section class="vd-co-box"><h2>수강권 선택</h2><div class="vd-plans vd-co-plans">' + ps.map((y) => '<label class="vd-plan' + (y.d === sel.d ? " on" : "") + '"><input type="radio" name="plan" value="' + y.d + '"' + (y.d === sel.d ? " checked" : "") + '><span class="vd-plan-t"><b>' + y.label + " 수강권</b>" + (y.d === 365 ? "<em>추천</em>" : "") + "<small>하루 " + won(y.day) + " · " + DB.date.fmtFull(DB.date.addDays(today(), y.d)) + "까지</small></span><span class=\"vd-plan-p\">" + (y.list > y.sale ? "<s>" + won(y.list) + "</s>" : "") + "<strong>" + won(y.sale) + "</strong></span></label>").join("") + "</div>" +
          (c ? '<label class="vd-addon' + (coachOn ? " on" : "") + '"><input type="checkbox" name="coach" value="1"' + (coachOn ? " checked" : "") + '><span class="vd-addon-t"><b>1:1 코칭권 ' + c.n + "회 함께 사기</b><small>" + c.days + "일 동안 강사에게 직접 질문 · 1회 " + won(c.per) + " · 쿠폰 적용 제외</small></span><strong>+" + won(c.price) + "</strong></label>" : "") + "</section>" : "") +
      (k === "tea" ? '<section class="vd-co-box"><h2>TEA TIME 신청 정보</h2><div class="vd-co-f"><label>희망 날짜 1<input type="date" name="d1" min="' + DB.date.addDays(today(), 2) + '"></label><label>희망 날짜 2 <small>(선택)</small><input type="date" name="d2" min="' + DB.date.addDays(today(), 2) + '"></label>' +
          '<label>희망 시간대<select name="slot"><option>오전 (10~12시)</option><option selected>오후 (14~17시)</option><option>저녁 (19~21시)</option></select></label><label>진행 방식<span class="vd-fixed">' + icon("video", "xs") + ' Zoom 온라인 화상 · 링크는 강사님이 일정 확정 때 보내 드려요</span><input type="hidden" name="mode" value="online"></label>' +
          '<label class="w">이야기하고 싶은 주제<textarea name="topic" rows="4" maxlength="500" placeholder="예: 지금 스마트스토어 월 매출이 300만 원인데, 해외 소싱 상품을 추가해도 될지 상담받고 싶어요."></textarea></label></div><p class="vd-muted vd-co-hint">강사님이 희망 날짜를 보고 일정을 확정하면 마이페이지 › 1:1 코칭 · TEA TIME과 문자로 알려 드려요. 확정 전에는 언제든 전액 환불돼요.</p></section>' : "") +
      '<section class="vd-co-box"><h2>주문자 정보</h2><div class="vd-co-f"><label>이름<input name="name" value="' + esc(m.name) + '" maxlength="20"></label><label>휴대폰<input name="phone" value="' + esc(m.phone || "") + '" maxlength="20"></label><label class="w">이메일<input name="email" value="' + esc(m.email) + '" readonly></label></div></section>' +
      (pr > 0 ? '<section class="vd-co-box"><h2>' + (bk ? "포인트" : "할인 · 쿠폰") + '</h2><div class="vd-co-f">' + (k === "course" && !bk ? '<label class="w">쿠폰 <small>사용 가능 ' + cps.length + "장 · 보유 " + all + '장</small><select name="coupon"><option value="">쿠폰 쓰지 않기</option>' + cps.map((y, i) => '<option value="' + esc(y.x.id) + '"' + (i === 0 ? " selected" : "") + ">" + esc(y.c.name) + " (-" + won(y.off) + ")</option>").join("") + "</select></label>" : "") +
          '<label class="w">포인트 <small>보유 ' + pts.toLocaleString() + 'P · 1P = 1원</small><span class="vd-co-pt"><input name="points" type="number" min="0" max="' + pts + '" step="100" inputmode="numeric" value="0"' + (pts ? "" : " disabled") + '><button type="button" class="vd-btn vd-btn-o vd-btn-sm" data-v="pt-all"' + (pts ? "" : " disabled") + ">전액 사용</button></span></label></div>" +
          (bk ? '<p class="vd-muted vd-co-hint">도서정가제에 따라 종이책에는 쿠폰을 쓸 수 없어요. 포인트는 쓸 수 있어요.</p>' : k !== "course" ? '<p class="vd-muted vd-co-hint">연장권 · 1:1 코칭권 · TEA TIME에는 쿠폰을 쓸 수 없어요. 포인트는 쓸 수 있어요.</p>' : !cps.length ? '<p class="vd-muted vd-co-hint">이 상품에 쓸 수 있는 쿠폰이 없어요. <a class="vd-link" href="#/vod/my/coupons">쿠폰 등록하기</a></p>' : coachOn || c ? '<p class="vd-muted vd-co-hint">쿠폰은 수강권 금액에만 적용돼요.</p>' : "") + "</section>" +
        '<section class="vd-co-box" data-co-pay><h2>결제 수단</h2><div class="vd-pay-opts">' + payOpts().map((z, i, all) => '<label class="vd-pay-opt' + (z[3] ? " off" : "") + '"><input type="radio" name="method" value="' + z[0] + '"' + (z[3] ? " disabled" : "") + (z[0] === (all.find((y) => !y[3]) || [])[0] ? " checked" : "") + "><span>" + icon(z[1], "sm") + z[2] + (z[3] ? "<em>" + z[3] + "</em>" : "") + "</span></label>").join("") + '</div>' + (payOpts().every((z) => z[3]) ? '<p class="vd-co-bank vd-co-wait">' + icon("alert", "xs") + "<span>결제 준비 중이에요. 곧 카드 · 간편결제 · 무통장 입금으로 결제할 수 있어요.</span></p>" : "") + bankBox(b, m, bk ? "book" : k) + "</section>" : "") +
      '<div class="vd-co-agrees"><label class="vd-agree vd-agree-all"><input type="checkbox" data-agree-all><span><b>아래 내용을 모두 확인했고 동의해요</b></span></label>' +
        '<label class="vd-agree"><input type="checkbox" name="agree" data-agree-req><span>(필수) 주문 상품 · ' + agree1 + " · 결제 금액을 확인했어요</span></label>" +
        '<label class="vd-agree"><input type="checkbox" name="agree2" data-agree-req><span>(필수) <button type="button" class="vd-link" data-v="refund">환불 규정</button>을 확인했어요. ' + agree2 + "<small>" + (bk ? "전자상거래법 제17조 · 받은 날부터 7일 이내 청약철회 (책을 훼손하면 제한돼요)" : "전자상거래법 제17조 제2항 제5호 · 디지털 콘텐츠 제공이 시작되면 청약철회가 제한될 수 있어요") + "</small></span></label>" +
        '<label class="vd-agree"><input type="checkbox" name="agree3" data-agree-req><span>' + (bk ? "(필수) 배송을 위해 받는 분 이름 · 연락처 · 주소를 택배사에 제공하는 데 동의해요<small>배송이 끝나면 택배사는 법령에 따른 기간 뒤 파기해요" : "(필수) 콘텐츠 이용 안내에 동의해요<small>" + (isEvent(p) ? "강의 녹화 · 촬영 · 녹음 금지 · 일정 안내 문자 받기" : k === "tea" || k === "coach" ? "코칭 · TEA TIME 내용 녹음 · 녹화 · 무단 공개 금지 · 안내 문자 받기" : "계정 공유 금지 · 기기 4대까지 · 녹화 · 캡처 · 배포 · 판매 금지 (저작권법)")) + "</small></span></label></div>" +
      '</div><aside class="vd-co-side"><div class="vd-co-sum"><h2>결제 금액</h2><dl><div><dt>' + (bk ? '상품 금액 (<span data-co-qty>1</span>권)' : k === "course" ? (sel ? '수강권 (<span data-co-plan>' + sel.label + "</span>)" : "상품 금액") : KIND[k]) + '</dt><dd data-co-list>' + won(list) + "</dd></div>" +
        '<div data-co-disc-row' + (list > pr ? "" : " hidden") + '><dt>할인</dt><dd class="minus" data-co-disc>-' + won(list - pr) + "</dd></div>" +
        (k === "course" && c && sel ? '<div data-co-coach-row' + (coachOn ? "" : " hidden") + "><dt>1:1 코칭권 " + c.n + '회</dt><dd data-co-coach>+' + won(c.price) + "</dd></div>" : "") +
        (bk ? '<div><dt>배송비</dt><dd data-co-ship>' + (sf ? "+" + won(sf) : "무료") + "</dd></div>" : "") +
        (pr > 0 ? (k === "course" && !bk ? '<div><dt>쿠폰 할인</dt><dd class="minus" data-co-cp>-0원</dd></div>' : "") + '<div><dt>포인트 사용</dt><dd class="minus" data-co-pt>-0원</dd></div>' : "") + '<div class="tot"><dt>최종 결제 금액</dt><dd data-co-tot>' + won(pr + (coachOn ? c.price : 0) + (bk ? sf : 0)) + "</dd></div></dl>" +
        '<p class="vd-err" id="vd-pay-err" role="alert"></p><button class="vd-btn vd-btn-p vd-btn-xl" type="submit" data-co-btn>' + (pr === 0 ? (isEvent(p) ? "무료 LIVE 신청하기" : "무료로 수강 시작") : won(pr + (coachOn ? c.price : 0) + (bk ? sf : 0)) + " 결제하기") + "</button>" + (SRV() ? "" : '<p class="vd-co-test">' + icon("alert", "xs") + "시안 화면이라 실제 결제는 되지 않아요. 정식 오픈 때 결제 대행사(PG)를 연결해요.</p>") + "</div></aside></form></div>");
  }
  /* ---------- 종이책 배송지 (결제 화면 · 배송지 바꾸기) ----------
   * 주소 찾기: 다음(카카오) 우편번호 서비스를 화면 안에 열어요. 불러오지 못하면 주소를 직접 적어요 */
  const MEMOS = ["문 앞에 놓아 주세요", "경비실에 맡겨 주세요", "택배함에 넣어 주세요", "배송 전에 연락 주세요"];
  function shipFields(a, pre) {
    a = a || {}; const n = (k) => (pre || "s") + k, memo = a.memo || "", known = !memo || MEMOS.indexOf(memo) >= 0;
    return '<div class="vd-co-f vd-ship-f"><label>받는 분<input name="' + n("name") + '" value="' + esc(a.name || "") + '" maxlength="20" autocomplete="name"></label><label>휴대폰<input name="' + n("phone") + '" value="' + esc(a.phone || "") + '" maxlength="14" inputmode="tel" autocomplete="tel" placeholder="010-0000-0000"></label>' +
      '<label class="w">주소<span class="vd-addr-r"><input name="' + n("zip") + '" value="' + esc(a.zip || "") + '" maxlength="5" inputmode="numeric" placeholder="우편번호" aria-label="우편번호" autocomplete="postal-code"><button type="button" class="vd-btn vd-btn-dark vd-btn-sm" data-v="addr-find" data-pre="' + (pre || "s") + '">' + icon("search", "xs") + '주소 찾기</button></span></label>' +
      '<div class="vd-addr-pop w" data-addr-pop hidden></div>' +
      '<label class="w"><input name="' + n("addr1") + '" value="' + esc(a.addr1 || "") + '" maxlength="120" placeholder="도로명 주소 (주소 찾기로 넣거나 직접 적어요)" aria-label="주소" autocomplete="address-line1"></label>' +
      '<label class="w">상세 주소<input name="' + n("addr2") + '" value="' + esc(a.addr2 || "") + '" maxlength="80" placeholder="동 · 호수 · 건물 이름" autocomplete="address-line2"></label>' +
      '<label class="w">배송 요청사항<select name="' + n("memo") + '" data-v-memo><option value="">선택 안 함</option>' + MEMOS.map((x) => "<option" + (x === memo ? " selected" : "") + ">" + x + "</option>").join("") + '<option value="__"' + (known ? "" : " selected") + '>직접 적기</option></select><input name="' + n("memo2") + '" value="' + esc(known ? "" : memo) + '" maxlength="100" placeholder="요청사항을 적어 주세요"' + (known ? " hidden" : "") + "></label></div>";
  }
  function shipBox(m) {
    const a = m.addr || { name: m.name, phone: m.phone || "" };
    return '<section class="vd-co-box vd-co-ship"><h2>' + icon("truck", "sm") + "배송지</h2>" + (m.addr ? '<p class="vd-co-saved">' + icon("check", "xs") + "지난번에 쓴 배송지를 넣어 뒀어요</p>" : "") + shipFields(a) +
      '<label class="vd-co-keep"><input type="checkbox" name="ssave" checked><span>다음에도 이 배송지 쓰기</span></label></section>';
  }
  /** 배송지 칸 읽기 → { ok, a: {name, phone, zip, addr1, addr2, memo} } | { ok:false, msg, el } */
  function shipRead(f, pre) {
    const g = (k) => f.elements[(pre || "s") + k], memoSel = g("memo") ? g("memo").value : "";
    const a = { name: g("name").value.trim(), phone: g("phone").value.trim().replace(/\s/g, ""), zip: g("zip").value.replace(/\D/g, ""), addr1: g("addr1").value.trim(), addr2: g("addr2").value.trim(), memo: (memoSel === "__" ? (g("memo2").value || "") : memoSel).trim().slice(0, 100) };
    if (!a.name) return { ok: false, msg: "받는 분 이름을 적어 주세요.", el: g("name") };
    if (!/^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(a.phone)) return { ok: false, msg: "받는 분 휴대폰 번호를 010-0000-0000처럼 적어 주세요.", el: g("phone") };
    if (a.zip && a.zip.length !== 5) return { ok: false, msg: "우편번호 5자리를 확인해 주세요.", el: g("zip") };
    if (a.addr1.length < 5) return { ok: false, msg: "주소를 찾거나 적어 주세요.", el: g("addr1") };
    if (!a.addr2) return { ok: false, msg: "상세 주소(동 · 호수)를 적어 주세요. 없으면 ‘없음’이라고 적어 주세요.", el: g("addr2") };
    return { ok: true, a };
  }
  const POSTCODE = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
  function addrFind(btn) {
    const f = btn.closest("form"), pre = btn.dataset.pre || "s", box = f && f.querySelector("[data-addr-pop]"); if (!f || !box) return;
    if (!box.hidden) { box.hidden = true; box.innerHTML = ""; return; }
    const fail = () => { box.hidden = true; toast("주소 검색을 불러오지 못했어요. 주소를 직접 적어 주세요.", "warn"); const x = f.elements[pre + "addr1"]; if (x) x.focus(); };
    loadJs(POSTCODE).then(() => {
      const D = window.daum || window.kakao; if (!D || !D.Postcode) return fail();
      box.hidden = false; box.innerHTML = "";
      new D.Postcode({ width: "100%", height: "100%", oncomplete: (d) => {
        const extra = [d.bname && /[동로가]$/.test(d.bname) ? d.bname : "", d.buildingName && d.apartment === "Y" ? d.buildingName : ""].filter(Boolean).join(", ");
        f.elements[pre + "zip"].value = d.zonecode || "";
        f.elements[pre + "addr1"].value = (d.roadAddress || d.address || "") + (extra ? " (" + extra + ")" : "");
        box.hidden = true; box.innerHTML = ""; const x = f.elements[pre + "addr2"]; if (x) x.focus();
      } }).embed(box);
    }, fail);
  }
  /** 결제 화면 무통장 안내: 계좌(복사) · 예금주 · 입금 기한 · 입금자명 — 무통장을 고르면 펼쳐져요 */
  function bankBox(b, m, k) {
    const first = (payOpts().find((y) => !y[3]) || [])[0] === "bank", days = Number(V().settings.payDays) || 3;
    return '<div class="vd-co-bank' + (first ? " on" : "") + '" data-bank-note><dl class="vd-bank-dl"><div><dt>입금 계좌</dt><dd><b>' + esc(b.bank) + ' <span class="vd-accno">' + esc(b.account) + '</span></b><button type="button" class="vd-copy" data-v="copy" data-t="' + esc(String(b.account).replace(/[^0-9-]/g, "")) + '">계좌 복사</button></dd></div><div><dt>예금주</dt><dd>' + esc(b.holder) + "</dd></div><div><dt>입금 기한</dt><dd>주문 후 " + days + "일 안</dd></div></dl>" +
      '<label class="vd-co-dep">입금자명 <small>통장에 찍히는 이름</small><input name="depositor" value="' + esc(String(m.name || "").replace(/\s+/g, "")) + '" maxlength="20" autocomplete="off"></label>' +
      "<p>" + icon("check", "xs") + "<span>입금자명과 금액이 주문과 같으면 " + (bankAuto() ? "<b>24시간 자동으로 확인</b>돼서" : "확인되는 대로") + " 바로 " + (k === "tea" ? "강사님께 신청이 전달돼요." : k === "book" ? "책을 준비해서 보내 드려요." : "수강할 수 있어요.") + " 이름이 다르면 확인이 늦어질 수 있어요.</span></p></div>";
  }
  // 수강권 · 코칭권 · 쿠폰(수강권에만) · 포인트를 반영한 결제 금액
  function coCalc(f) {
    const p = product(f.dataset.vdPay), m = me(); if (!p || !m) return null;
    const k = f.dataset.kind || "course", c = coachOf(p), el = f.elements;
    let plan = null, list, pr, coach = 0, qty = 1, ship = 0;
    if (k === "course" && isBook(p)) { const sl = stockLeft(p), mx = Math.max(1, Math.min(BOOK_MAX, sl == null ? BOOK_MAX : sl)); qty = Math.max(1, Math.min(mx, Math.floor(Number(el.qty && el.qty.value) || 1))); pr = priceOf(p) * qty; list = Math.max(Number(p.price) || 0, priceOf(p)) * qty; ship = shipFeeOf(p); }
    else if (k === "course") { plan = plansOf(p).length ? planOf(p, el.plan ? el.plan.value : 0) : null; pr = plan ? plan.sale : priceOf(p); list = plan ? plan.list : Number(p.price) || 0; coach = c && el.coach && el.coach.checked ? c.price : 0; }
    else { pr = k === "extend" ? ((extendOf(p) || {}).sale || 0) : k === "coach" ? ((c || {}).price || 0) : ((teaOf(p) || {}).price || 0); list = pr; }
    const sel = k === "course" && f.coupon ? f.coupon.value : "", y = sel ? myCoupons(m.id).find((z) => z.x.id === sel && z.st === "ok") : null;
    const cp = y ? couponOff(y.c, p, pr) : 0, sum = pr + coach + ship, maxPt = Math.max(0, Math.min(Number(m.points) || 0, sum - cp));
    let pt = f.points ? Math.floor(Number(f.points.value) || 0) : 0; pt = Math.max(0, Math.min(pt, maxPt));
    return { p, k, plan, c, list, pr, coach, y, cp, pt, maxPt, qty, ship, tot: Math.max(0, sum - cp - pt) };
  }
  function coPaint(f) {
    const r = coCalc(f); if (!r) return;
    const q = (s) => f.querySelector(s);
    f.querySelectorAll("[data-co-plan]").forEach((x) => { x.textContent = r.plan ? r.plan.label : ""; });
    if (q("[data-co-list]")) q("[data-co-list]").textContent = won(r.list);
    if (q("[data-co-qty]")) q("[data-co-qty]").textContent = r.qty;
    if (f.qty && document.activeElement !== f.qty && Number(f.qty.value) !== r.qty) f.qty.value = String(r.qty);
    if (q("[data-co-disc]")) { q("[data-co-disc]").textContent = "-" + won(r.list - r.pr); q("[data-co-disc-row]").hidden = !(r.list > r.pr); }
    if (q("[data-co-coach-row]")) q("[data-co-coach-row]").hidden = !r.coach;
    f.querySelectorAll(".vd-co-plans .vd-plan").forEach((x) => x.classList.toggle("on", x.querySelector("input").checked));
    const ad = q(".vd-co-box .vd-addon"); if (ad) ad.classList.toggle("on", !!r.coach);
    if (f.coupon) Array.from(f.coupon.options).forEach((o) => { if (!o.value) return; const y = myCoupons(me().id).find((z) => z.x.id === o.value); if (y) o.textContent = y.c.name + " (-" + won(couponOff(y.c, r.p, r.pr)) + ")"; });
    if (q("[data-co-cp]")) q("[data-co-cp]").textContent = "-" + won(r.cp);
    if (q("[data-co-pt]")) q("[data-co-pt]").textContent = "-" + won(r.pt);
    if (f.points && document.activeElement !== f.points && f.points.value !== "" && Number(f.points.value) !== r.pt) f.points.value = r.pt ? String(r.pt) : "";
    q("[data-co-tot]").textContent = won(r.tot);
    const shut = SRV() && r.tot > 0 && payOpts().every((z) => z[3]), cb = q("[data-co-btn]");
    cb.textContent = shut ? "결제 준비 중" : r.pr + r.coach + r.ship === 0 ? (isEvent(r.p) ? "무료 LIVE 신청하기" : "무료로 수강 시작") : r.tot === 0 ? "0원 결제하기" : won(r.tot) + (r.k === "tea" ? " 결제하고 신청하기" : " 결제하기");
    cb.disabled = shut;
    const pay = q("[data-co-pay]"); if (pay) pay.classList.toggle("is-off", r.tot === 0);
  }
  function pageOrder(no) {
    const o = V().orders.find((x) => x.no === no), m = me();
    if (!o || !m || o.mid !== m.id) return shell("", '<div class="vd-wrap">' + emptyBox("alert", "주문을 찾을 수 없어요", "", '<a class="vd-btn vd-btn-o" href="#/vod/my/orders">주문 · 결제 내역</a>') + "</div>");
    const b = bankOf(o), pend = o.status === "pending", p = product(o.pid), t = typeOf(p), k = kindOf(o), sibs = V().orders.filter((x) => x.grp === o.no), total = o.amount + sibs.reduce((a, x) => a + (Number(x.amount) || 0), 0), ptAll = (o.pointOff || 0) + sibs.reduce((a, x) => a + (Number(x.pointOff) || 0), 0);
    const go = !p ? "" : k === "coach" ? ["dg", "message", "1:1 코칭 질문하러 가기"] : k === "tea" ? ["#/vod/my/addons", "calendar", "신청 내역 보기"] : k === "extend" ? ["#/vod/learn/" + p.id, "play", "다시 이어서 듣기"] : t === "book" ? ["#/vod/my/ship", "truck", "배송 조회하기"] : t === "ebook" ? ["#/vod/my/ebooks", "book", "전자책 내려받기"] : isEvent(p) ? ["#/vod/learn/" + p.id, "calendar", "입장 안내 보기"] : ["#/vod/learn/" + p.id, "play", "강의 시작하기"];
    const h = pend ? "주문이 접수됐어요" : k === "extend" ? "연장이 완료됐어요" : k === "coach" ? "1:1 코칭권이 준비됐어요" : k === "tea" ? "TEA TIME 신청이 접수됐어요" : o.amount === 0 && !o.couponOff && !o.pointOff ? (p && isFreeEv(p) ? "무료 LIVE 신청이 완료됐어요" : "수강신청이 완료됐어요") : "결제가 완료됐어요";
    const sub = pend && o.ship ? "입금이 확인되면 책을 준비해서 보내 드려요. 아래 " + (o.method === "vbank" ? "가상계좌" : "계좌") + "로 입금해 주세요." : !pend && o.ship ? "결제 후 " + (Number(shipSet().outDays) || 2) + "일 안에(주말 · 공휴일 빼고) 책을 보내 드려요. 보내면 송장 번호를 마이페이지 › 종이책 · 배송 조회에 올려 드려요." : pend ? (o.method === "vbank" ? "아래 가상계좌로 입금하면 자동으로 확인돼 바로 이용할 수 있어요." : bankAuto() ? "아래 계좌로 입금하면 24시간 자동으로 확인돼 바로 이용할 수 있어요." : "아래 계좌로 입금하면 확인되는 대로 바로 이용할 수 있어요.") : k === "extend" ? DB.date.fmtFull(DB.date.toStr(new Date(accessEnd(o.mid, o.pid)))) + "까지 다시 들을 수 있어요. 진도 · 노트는 그대로예요." : k === "coach" ? "두잉고 강의실 › 1:1 코칭 질문에서 바로 질문할 수 있어요." : k === "tea" ? "강사님이 희망 날짜를 보고 일정을 확정하면 마이페이지와 문자로 알려 드려요." : t === "ebook" ? "마이페이지 › 전자책에서 바로 내려받을 수 있어요." : isEvent(p) ? "마이페이지 › LIVE · 오프라인에서 입장 안내를 확인할 수 있어요." : "내 강의실에서 바로 시작할 수 있어요." + (sibs.some((x) => kindOf(x) === "coach") ? " 1:1 코칭권도 함께 준비됐어요." : "");
    return shell("", '<div class="vd-wrap vd-done"><span class="vd-done-ic' + (pend ? " pend" : "") + '">' + icon(pend ? "clock" : "check") + "</span><h1>" + h + "</h1><p>" + sub + "</p>" +
      '<dl class="vd-done-dl"><div><dt>주문 번호</dt><dd>' + esc(o.no) + "</dd></div><div><dt>상품</dt><dd>" + esc(o.title) + (optTxt(o) ? "<br><small>" + esc(optTxt(o)) + "</small>" : "") + "</dd></div>" + sibs.map((x) => "<div><dt>함께 산 상품</dt><dd>" + esc(optTxt(x)) + " <small>" + won(x.amount) + "</small></dd></div>").join("") + (o.couponOff ? "<div><dt>쿠폰 할인</dt><dd>-" + won(o.couponOff) + " <small>" + esc(o.couponName || "") + "</small></dd></div>" : "") + (o.ship ? "<div><dt>배송지</dt><dd>" + esc(o.ship.name || "") + " · " + esc(o.ship.phone || "") + "<br><small>" + (o.ship.zip ? "(" + esc(o.ship.zip) + ") " : "") + esc((o.ship.addr1 || "") + " " + (o.ship.addr2 || "")) + "</small></dd></div>" : "") + (ptAll ? "<div><dt>포인트</dt><dd>-" + won(ptAll) + "</dd></div>" : "") + "<div><dt>결제 금액</dt><dd><b>" + won(total) + "</b></dd></div>" + (pend ? '<div class="vd-done-bank"><dt>입금 계좌</dt><dd><b>' + esc(b.bank) + ' <span class="vd-accno">' + esc(b.account) + '</span></b> <button type="button" class="vd-copy" data-v="copy" data-t="' + esc(String(b.account).replace(/[^0-9-]/g, "")) + '">계좌 복사</button><br><small>' + (b.vbank ? "가상계좌 · 이 주문 전용 계좌예요" : "예금주 " + esc(b.holder)) + "</small></dd></div>" + (b.vbank ? "" : "<div><dt>입금자명</dt><dd><b>" + esc(o.depositor || (o.buyer && o.buyer.name) || m.name) + "</b><br><small>이 이름 · 이 금액으로 입금해 주세요</small></dd></div>") + "<div><dt>입금 기한</dt><dd>" + esc(fmtDue(dueOf(o))) + "까지</dd></div>" : "") + "</dl>" +
      (!pend && p && dgOpen(p) ? dgCard(p, "vd-dg-done") : "") +
      '<div class="vd-done-btns">' + (!pend && p && isEvent(p) && p.kakao ? '<a class="vd-btn vd-btn-kakao" href="' + esc(p.kakao) + '" target="_blank" rel="noopener">' + icon("message", "sm") + "카카오톡 오픈채팅방 입장하기</a>" : "") + (pend ? '<a class="vd-btn vd-btn-o" href="#/vod/my/pending">결제 대기 보기</a>' : go && go[0] === "dg" ? '<button type="button" class="vd-btn vd-btn-p" data-v="dg" data-p="' + esc(p.id) + '" data-to="#/qna/requests/new">' + icon(go[1], "sm") + go[2] + "</button>" : go ? '<a class="vd-btn vd-btn-p" href="' + go[0] + '">' + icon(go[1], "sm") + go[2] + "</a>" : "") + '<a class="vd-btn vd-btn-o" href="#/vod">다른 클래스 둘러보기</a></div></div>');
  }
  /* ---------- 마이페이지 (패스트캠퍼스 me/home: 왼쪽 프로필 · 묶음 메뉴 / 오른쪽 홈 · 긱스쿨 9개 메뉴) ---------- */
  const MYNAV = [["강의장", [["classes", "내 강의실", "monitorPlay"], ["free", "무료강의", "sparkles"], ["vod", "VOD 강의", "video"], ["addons", "1:1 코칭 · TEA TIME", "message"], ["ebooks", "전자책", "book"], ["live", "LIVE · 오프라인", "calendar"], ["alarm", "오픈 알림", "bell"], ["likes", "찜 · 관심 부업", "heart"]]],
    ["구매", [["pending", "결제 대기", "clock"], ["orders", "주문 · 결제 내역", "file"], ["ship", "종이책 · 배송 조회", "truck"], ["coupons", "쿠폰", "coins"], ["points", "포인트", "award"]]],
    ["활동", [["reviews", "내 수강 후기", "star"], ["posts", "다짐 한마디", "message"], ["badges", "내 배지", "trophy"]]],
    ["계정", [["account", "회원 정보 수정", "user"], ["devices", "기기 관리", "monitorPlay"], ["help", "고객센터 · 1:1 문의", "headset"]]]];
  const MYT = { "": "홈" }; MYNAV.forEach((g) => g[1].forEach((x) => { MYT[x[0]] = x[1]; }));
  const BADGES = [["start", "첫 수강", "강의를 처음 시작했어요", "play", "VOD 강의를 시작하면 받아요"], ["clip10", "클립 10개", "강의 10개를 끝까지 봤어요", "check", "강의 10개를 끝까지 보면 받아요"], ["done", "첫 완강", "클래스 하나를 끝까지 들었어요", "trophy", "클래스 하나를 완강하면 받아요"], ["streak3", "3일 연속", "3일 연속으로 공부했어요", "flame", "3일 연속 공부하면 받아요"], ["review", "첫 후기", "수강 후기를 남겼어요", "star", "수강 후기를 쓰면 받아요"], ["pledge", "다짐 한마디", "다짐을 남겼어요", "message", "다짐 한마디를 남기면 받아요"], ["ebook", "첫 전자책", "전자책을 처음 받았어요", "book", "전자책을 사면 받아요"], ["live", "현장 출석", "LIVE · 오프라인 강의를 신청했어요", "users", "LIVE · 오프라인 강의를 신청하면 받아요"]];
  const myBlk = (title, more, body, cls) => '<section class="vd-my-blk' + (cls ? " " + cls : "") + '"><div class="vd-my-blk-h"><h3>' + title + "</h3>" + (more ? '<a href="' + more + '">전체보기' + icon("chevRight", "xs") + "</a>" : "") + "</div>" + body + "</section>";
  const myEmpty = (text, label, href) => '<div class="vd-my-empty"><p>' + text + "</p>" + (label ? '<a class="vd-btn vd-btn-line vd-btn-sm" href="' + href + '">' + label + "</a>" : "") + "</div>";
  /* 기기 관리: 이 브라우저를 기기로 등록 (시안: 이 브라우저에 저장 · 정식: 서버에서 기기 4대 제한) */
  const DEV_MAX = 4;
  function devId() { let id = ""; try { id = localStorage.getItem("dc:dev") || ""; if (!id) { id = "dv-" + Math.random().toString(36).slice(2, 10); localStorage.setItem("dc:dev", id); } } catch (e) { id = "dv-this"; } return id; }
  function devName() {
    const ua = navigator.userAgent || "", os = /iPhone|iPad/.test(ua) ? (/iPad/.test(ua) ? "iPad" : "iPhone") : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows PC" : "PC";
    const br = /Edg\//.test(ua) ? "Edge" : /Whale\//.test(ua) ? "웨일" : /SamsungBrowser/.test(ua) ? "삼성 인터넷" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "브라우저";
    return { name: os + " · " + br, kind: /iPhone|Android.*Mobile/.test(ua) ? "모바일" : /iPad|Android/.test(ua) ? "태블릿" : "PC" };
  }
  function myDevices(m) {
    const list = (m.devices = Array.isArray(m.devices) ? m.devices : []), id = devId(), n = devName(), t = now();
    let me = list.find((x) => x.id === id);
    if (!me) { if (!list.length && m.id === "vm-demo") list.push({ id: "dv-demo-phone", name: "iPhone · Safari", kind: "모바일", first: t - 40 * 864e5, last: t - 2 * 864e5 }); me = { id, name: n.name, kind: n.kind, first: t, last: t }; list.unshift(me); while (list.length > DEV_MAX) list.pop(); save(); }
    else if (t - me.last > 6e4) { me.last = t; save(); }
    return list.slice().sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : b.last - a.last));
  }
  function myData(m) {
    const v = V(), seen = {};
    const mine = v.orders.filter((o) => o.mid === m.id && o.status === "paid" && isAccess(o)).sort((a, b) => b.at - a.at).map((o) => ({ o, p: product(o.pid) })).filter((x) => x.p && !seen[x.p.id] && (seen[x.p.id] = 1));
    const vods = mine.filter((x) => typeOf(x.p) === "vod"), ing = vods.filter((x) => pctDone(m.id, x.p.id) < 100), done = vods.filter((x) => pctDone(m.id, x.p.id) >= 100);
    const doneL = vods.reduce((a, x) => a.concat(lessons(x.p).filter((l) => prog(m.id, x.p.id).done[l.id])), []);
    const likes = (v.likes[m.id] || []).map(product).filter(Boolean), orders = v.orders.filter((o) => o.mid === m.id).sort((a, b) => b.at - a.at);
    const rv = v.reviews.filter((r) => r.mid === m.id).sort((a, b) => b.at - a.at), pl = v.pledges.filter((x) => x.mid === m.id).sort((a, b) => b.at - a.at), cps = myCoupons(m.id);
    const d = { mine, vods, ing, done, doneL, likes: likes.filter((p) => p.status !== "soon"), alarm: likes.filter((p) => p.status === "soon"), orders, pending: orders.filter((o) => o.status === "pending"), rv, pl, cps, cpOk: cps.filter((y) => y.st === "ok"),
      free: vods.filter((x) => Number(x.p.price) === 0), paidV: vods.filter((x) => Number(x.p.price) > 0), ebooks: mine.filter((x) => typeOf(x.p) === "ebook"), live: mine.filter((x) => isEvent(x.p)).sort((a, b) => eventTime(a.p) - eventTime(b.p)), streak: streakOf(m.id) };
    const has = { start: vods.length > 0, clip10: doneL.length >= 10, done: done.length > 0, streak3: d.streak >= 3, review: rv.length > 0, pledge: pl.length > 0, ebook: d.ebooks.length > 0, live: d.live.length > 0 };
    d.badges = BADGES.map((b) => ({ b, on: !!has[b[0]] }));
    d.coaches = v.orders.filter((o) => o.mid === m.id && kindOf(o) === "coach" && o.coach && o.status === "paid").sort((a, b) => b.paidAt - a.paidAt);
    d.teas = v.orders.filter((o) => o.mid === m.id && kindOf(o) === "tea" && o.tea && o.status !== "refunded" && o.status !== "canceled").sort((a, b) => b.at - a.at);
    d.addN = d.coaches.filter((o) => o.paidAt + (Number(o.coach.days) || 180) * 864e5 > now() && (Number(o.coach.n) || 0) > (Number(o.coach.used) || 0)).length + d.teas.filter((o) => ["req", "ok"].indexOf((o.tea || {}).st) >= 0).length;
    return d;
  }
  function calHtml(m) {
    const s = (V().studyLog || {})[m.id] || {}, t = today(), x = DB.date.parseDate(t), y = x.getFullYear(), mo = x.getMonth(), first = new Date(y, mo, 1).getDay(), days = new Date(y, mo + 1, 0).getDate();
    const ymd = (d) => y + "-" + String(mo + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0"), cnt = Object.keys(s).filter((k) => k.slice(0, 7) === t.slice(0, 7)).length;
    return '<div class="vd-cal"><div class="vd-cal-h"><b>' + y + "년 " + (mo + 1) + "월</b><small>이번 달 " + cnt + "일 공부했어요</small></div><div class=\"vd-cal-g\">" + DOWK.map((w) => "<i>" + w + "</i>").join("") + Array.from({ length: first }, () => "<span></span>").join("") +
      Array.from({ length: days }, (_, i) => { const k = ymd(i + 1); return '<span class="' + (s[k] ? "on" : "") + (k === t ? " today" : "") + (k > t ? " fut" : "") + '"' + (s[k] ? ' title="' + s[k] + '번 공부"' : "") + ">" + (i + 1) + "</span>"; }).join("") + "</div></div>";
  }
  const myCls = (m, list) => '<div class="vd-sroom">' + list.map(({ o, p }) => {
    const ev = isEvent(p), lz = lessons(p), dn = lz.filter((l) => prog(m.id, p.id).done[l.id]).length, pc = pctDone(m.id, p.id), end = accessEnd(m.id, p.id), live = ev ? !eventPast(p) || owns(m.id, p.id) : end > now(), lim = typeOf(p) === "vod" && end && end !== Infinity;
    const dl = lim && live ? Math.max(0, daysLeft(m.id, p.id)) : null, ext = !live && typeOf(p) === "vod" ? extendOf(p) : null, soon = live && lim && canExtend(m.id, p.id), cl = live && coachOf(p) ? coachLeft(m.id, p.iid) : 0;
    const last = lz.find((l) => l.id === prog(m.id, p.id).last), go = ev ? (typeOf(p) === "live" ? "입장 안내 보기" : "참석 안내 보기") : pc >= 100 ? "다시 보기" : pc ? "이어서 학습하기" : "학습 시작하기";
    const chip = priceOf(p) === 0 ? (typeOf(p) === "live" ? "무료 LIVE" : "무료 특강") : CHIP[typeOf(p)] || "클래스";
    const state = ev ? (eventPast(p) ? '<span class="vd-sroom-st end">종료</span>' : '<span class="vd-sroom-st">' + esc(fmtLive(p.eventAt)) + "</span>") : !live ? '<span class="vd-sroom-st end">수강 기간 끝</span>' : pc >= 100 ? '<span class="vd-sroom-st ok">수강 완료</span>' : dl != null ? '<span class="vd-sroom-st' + (dl <= 30 ? " warn" : "") + '">D-' + dl + "</span>" : '<span class="vd-sroom-st">평생 소장</span>';
    const cta = live ? (dgOpen(p) && !ev ? '<button type="button" class="vd-btn vd-btn-p vd-sroom-go" data-v="dg" data-p="' + esc(p.id) + '">' + icon("play", "xs") + go + "</button>" : '<a class="vd-btn vd-btn-p vd-sroom-go" href="#/vod/learn/' + esc(p.id) + '">' + icon(ev ? "calendar" : "play", "xs") + go + "</a>")
      : ext ? '<a class="vd-btn vd-btn-p vd-sroom-go" href="#/vod/checkout/' + esc(p.id) + '?item=extend">' + icon("refresh", "xs") + "1년 연장하고 이어 듣기</a>" : "";
    return '<article class="vd-sroom-it' + (live ? "" : " exp") + '"><a class="vd-sroom-th" href="#/vod/' + (live ? "learn/" : "p/") + esc(p.id) + '">' + thumbArt(p) + (live && !ev ? '<i class="vd-sroom-play" aria-hidden="true">' + icon("play") + "</i>" : "") + "</a>" +
      '<div class="vd-sroom-b"><div class="vd-sroom-top"><span class="vd-kchip vd-kchip-' + (priceOf(p) === 0 ? "free" : typeOf(p)) + '">' + esc(chip) + "</span>" + state + "</div>" +
        '<a class="vd-sroom-t" href="#/vod/p/' + esc(p.id) + '">' + esc(p.title) + '</a><span class="vd-sroom-cr">' + esc(p.creator || "") + " · " + esc(catOf(p.cat).label) + "</span>" +
        (ev ? '<span class="vd-sroom-info">' + icon("calendar", "xs") + esc(fmtEvent(p.eventAt, true)) + " · " + (typeOf(p) === "live" ? viaOf(p) : esc(placeShort(p.place) || "현장")) + "</span>"
          : '<div class="vd-sroom-pg"><div class="vd-sroom-bar"><i style="width:' + pc + '%"></i></div><span><b>' + pc + "%</b><small>" + dn + " / " + lz.length + "강</small></span></div>" +
            '<span class="vd-sroom-info">' + (last ? icon("clock", "xs") + "최근 학습 · " + esc(last.title) : icon("sparkles", "xs") + "아직 시작 전이에요. 1강부터 가볍게 시작해 보세요") + "</span>") +
        '<span class="vd-sroom-sub">' + (lim ? (live ? DB.date.fmtFull(DB.date.toStr(new Date(end))) + "까지 수강" : DB.date.fmtFull(DB.date.toStr(new Date(end))) + "에 수강 기간이 끝났어요") : ev ? "주문 " + esc(o.no) : "평생 소장") + (cl ? " · 1:1 코칭 " + cl + "회 남음" : "") + (live && dgOpen(p) && !ev ? " · 두잉고 강의실에서 열려요" : "") + "</span></div>" +
      '<div class="vd-sroom-act">' + cta + '<a class="vd-btn vd-btn-o vd-sroom-sec" href="#/vod/p/' + esc(p.id) + '">강의 상세</a>' + (soon ? '<a class="vd-sroom-more" href="#/vod/checkout/' + esc(p.id) + '?item=extend">' + icon("refresh", "xs") + "미리 1년 연장하기</a>" : "") + "</div></article>";
  }).join("") + "</div>";
  const myClsOld = (m, list) => '<div class="vd-mycls">' + list.map(({ o, p }) => {
    const pc = pctDone(m.id, p.id), end = accessEnd(m.id, p.id), live = end > now(), lim = typeOf(p) === "vod" && end && end !== Infinity, ext = !live && typeOf(p) === "vod" ? extendOf(p) : null, soon = live && lim && canExtend(m.id, p.id), cl = live && coachOf(p) ? coachLeft(m.id, p.iid) : 0, go = pc >= 100 ? "다시 보기" : pc ? "이어 보기" : "강의 시작";
    return '<article class="vd-mycl' + (live ? "" : " exp") + '"><a class="vd-mycl-th" href="#/vod/' + (live ? "learn/" : "p/") + esc(p.id) + '">' + thumbArt(p) + "</a><div><small>" + esc(p.creator) + " · " + esc(catOf(p.cat).label) + "</small><b>" + esc(p.title) + '</b><div class="vd-prog"><i style="width:' + pc + '%"></i></div><span class="vd-mycl-m">진도율 <b>' + pc + "%</b> · " + (lim ? (live ? DB.date.fmtFull(DB.date.toStr(new Date(end))) + "까지" + (soon ? ' <em class="vd-mycl-d">D-' + Math.max(0, daysLeft(m.id, p.id)) + "</em>" : "") : DB.date.fmtFull(DB.date.toStr(new Date(end))) + " 수강 기간 끝") : "평생 소장") + "</span>" +
      (live && dgOpen(p) ? '<button type="button" class="vd-btn vd-btn-p vd-btn-sm" data-v="dg" data-p="' + esc(p.id) + '">' + icon("play", "xs") + go + '</button><small class="vd-mycl-dgl">' + icon("book", "xs") + "두잉고 강의실에서 열려요</small>" : live ? '<a class="vd-btn vd-btn-p vd-btn-sm" href="#/vod/learn/' + esc(p.id) + '">' + icon("play", "xs") + go + "</a>" : "") +
      (ext ? '<a class="vd-btn vd-btn-p vd-btn-sm vd-mycl-ext" href="#/vod/checkout/' + esc(p.id) + '?item=extend">' + icon("refresh", "xs") + "1년 연장권 · 다시 이어서 듣기 <small>" + won(ext.sale) + "</small></a>" : "") +
      (soon ? '<a class="vd-mycl-more" href="#/vod/checkout/' + esc(p.id) + '?item=extend">' + icon("refresh", "xs") + "미리 1년 연장하기</a>" : "") +
      (cl ? '<small class="vd-mycl-dgl">' + icon("message", "xs") + "1:1 코칭 " + cl + "회 남음</small>" : "") + "</div></article>";
  }).join("") + "</div>";

  /* 마이페이지 공통 카드: 썸네일 · 이름표 · 제목 · 설명 · 버튼 (내 강의실 카드와 같은 모양) */
  const rcCard = (o) => '<article class="vd-rc' + (o.cls ? " " + o.cls : "") + '">' + (o.th ? '<a class="vd-rc-th" href="' + esc(o.href || "#") + '">' + o.th + (o.over || "") + "</a>" : "") +
    '<div class="vd-rc-b">' + (o.chips ? '<div class="vd-rc-top">' + o.chips + "</div>" : "") + '<b class="vd-rc-t">' + o.title + "</b>" + (o.sub ? '<span class="vd-rc-s">' + o.sub + "</span>" : "") + (o.extra || "") + "</div>" +
    (o.act ? '<div class="vd-rc-act">' + o.act + "</div>" : "") + "</article>";
  const rcSt = (t, k) => '<span class="vd-sroom-st' + (k ? " " + k : "") + '">' + t + "</span>";
  const cpTicket = (y) => '<div class="vd-cp vd-cp-' + y.st + '"><div class="vd-cp-l"><b>' + (y.c.kind === "pct" ? y.c.value + "<small>%</small>" : (Number(y.c.value) / 10000 >= 1 ? Number(y.c.value) / 10000 + "<small>만 원</small>" : Number(y.c.value).toLocaleString() + "<small>원</small>")) + "</b></div><div class=\"vd-cp-r\"><strong>" + esc(y.c.name) + "</strong><span>" + esc(couponTxt(y.c)) + " · " + esc(couponCond(y.c)) + "</span><small>" + (y.st === "used" ? "사용 완료" + (y.x.orderNo ? " · " + esc(y.x.orderNo) : "") : y.st === "exp" ? "기간 만료" : y.st === "off" ? "사용 중지된 쿠폰" : (y.x.exp ? DB.date.fmtFull(y.x.exp) + "까지 · D-" + Math.max(0, DB.date.diffDays(y.x.exp, today())) : "기한 없음")) + "</small></div></div>";
  /** 주문의 취소 · 환불 버튼 (주문 · 결제 내역 · 배송 조회가 같이 써요) */
  function rfBtns(o) {
    if (o.refundReq && typeof o.refundReq === "object") return '<span class="vd-st vd-st-wait vd-o-rq">' + (o.ship ? "요청 처리 중" : "환불 요청 중") + '</span><button type="button" class="vd-btn vd-btn-line vd-btn-sm" data-v="rf-undo" data-no="' + esc(o.no) + '">요청 취소</button>';
    if (o.refundReq) return '<span class="vd-st vd-st-wait vd-o-rq">환불 처리 중</span>';
    const q = instantOf(o), bk = !!o.ship, st = bk ? shipStOf(o) : "";
    if (q.ok) return '<button type="button" class="vd-btn vd-btn-p vd-btn-sm vd-rf-now" data-v="rf-now" data-no="' + esc(o.no) + '">' + (bk ? "주문 취소 · 전액 환불" : "결제 취소 · 100% 환불") + '</button><small class="vd-rf-left">' + (bk ? "보내기 전이라 바로 취소돼요" : q.left + "일 남음 · 바로 환불") + "</small>";
    if (bk && st === "done" && shipDoneAt(o) && now() - shipDoneAt(o) > 90 * 864e5) return "";
    return '<button type="button" class="vd-btn vd-btn-line vd-btn-sm" data-v="rf-req" data-no="' + esc(o.no) + '">' + (bk ? (st === "ready" || st === "prep" ? "취소 요청" : "반품 · 교환 요청") : "환불 요청") + "</button>";
  }
  const fmtDT = (t) => { const d = new Date(t); return (d.getMonth() + 1) + "." + d.getDate() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  /** 마이페이지 › 종이책 · 배송 조회 카드: 단계(결제 완료 → 상품 준비 중 → 배송 중 → 배송 완료) · 송장 · 배송지 · 버튼 */
  function shipCard(o) {
    const p = product(o.pid) || {}, s = o.ship || {}, st = shipStOf(o), steps = ["ready", "prep", "ship", "done"], idx = steps.indexOf(st), auto = st === "done" && !s.doneAt;
    const when = { ready: o.paidAt, prep: s.prepAt, ship: s.shipAt, done: shipDoneAt(o) }, tu = trackUrl(o), chip = SHIP_ST[st] || SHIP_ST.ready;
    return '<article class="vd-shc vd-shc-' + st + '" data-no="' + esc(o.no) + '"><div class="vd-shc-h"><a class="vd-shc-th" href="#/vod/p/' + esc(o.pid) + '">' + (p.id ? thumbArt(p) : "") + '</a><div><span class="vd-st vd-st-' + chip[1] + '">' + chip[0] + "</span><small>" + DB.date.fmtFull(DB.date.toStr(new Date(o.at))) + " · " + esc(o.no) + "</small><b>" + esc(o.title) + "</b><span>" + (Number(o.qty) || 1) + "권 · " + won(o.amount) + (o.shipFee ? " (배송비 " + won(o.shipFee) + " 포함)" : " · 무료배송") + "</span></div></div>" +
      (st === "cancel" ? '<p class="vd-shc-note">' + icon("alert", "xs") + "<span>" + (o.status === "refunded" ? "주문을 취소하고 " + won(o.refundAmount != null ? o.refundAmount : o.amount) + "을 돌려드렸어요." : "취소된 주문이에요.") + "</span></p>"
        : st === "wait" ? '<p class="vd-shc-note">' + icon("clock", "xs") + "<span>입금이 확인되면 책을 준비해서 보내 드려요.</span></p>"
        : '<ol class="vd-shc-steps" aria-label="배송 단계">' + steps.map((k, i) => '<li class="' + (i < idx ? "done" : i === idx ? "on" : "") + '"><i>' + icon(i < idx || (i === idx && k === "done") ? "check" : k === "ship" ? "truck" : k === "prep" ? "package" : k === "done" ? "home" : "check", "xs") + "</i><b>" + SHIP_ST[k][0] + "</b><small>" + (when[k] && i <= idx ? fmtDT(when[k]) + (k === "done" && auto ? " (자동)" : "") : "") + "</small></li>").join("") + "</ol>") +
      (s.inv ? '<div class="vd-shc-inv">' + icon("truck", "sm") + "<span><small>" + esc(s.carrier || "택배") + "</small><b>" + esc(s.inv) + '</b></span><button type="button" class="vd-copy" data-v="copy" data-t="' + esc(s.inv) + '">복사</button>' + (tu ? '<a class="vd-btn vd-btn-dark vd-btn-sm" href="' + esc(tu) + '" target="_blank" rel="noopener">배송 조회</a>' : "") + "</div>" : "") +
      '<dl class="vd-shc-addr"><div><dt>받는 분</dt><dd>' + esc(s.name || "") + " · " + esc(s.phone || "") + "</dd></div><div><dt>주소</dt><dd>" + (s.zip ? "(" + esc(s.zip) + ") " : "") + esc(s.addr1 || "") + " " + esc(s.addr2 || "") + "</dd></div>" + (s.memo ? "<div><dt>요청사항</dt><dd>" + esc(s.memo) + "</dd></div>" : "") + "</dl>" +
      '<div class="vd-shc-a">' + (st === "ready" || st === "wait" ? '<button type="button" class="vd-btn vd-btn-o vd-btn-sm" data-v="ship-edit" data-no="' + esc(o.no) + '">' + icon("mapPin", "xs") + "배송지 바꾸기</button>" : "") +
        (o.status === "pending" ? '<button type="button" class="vd-btn vd-btn-o vd-btn-sm" data-v="ord-cancel" data-no="' + esc(o.no) + '">주문 취소</button>' : o.status === "paid" && o.amount > 0 ? rfBtns(o) : "") +
        (st === "done" && p.id && !(V().reviews || []).some((r) => r.pid === p.id && r.mid === o.mid) ? '<a class="vd-btn vd-btn-line vd-btn-sm" href="#/vod/p/' + esc(p.id) + '#vd-s-reviews">' + icon("star", "xs") + "후기 남기기</a>" : "") + "</div></article>";
  }
  function pageMy(sub) {
    const m = me(); if (!m) { ROUTE.redirect("#/vod/login?next=" + encodeURIComponent(ROUTE.hash)); return ""; }
    const legacy = route().qs.get("tab"); if (legacy) sub = { classes: "classes", likes: "likes", orders: "orders", account: "account" }[legacy] || "";
    sub = MYT[sub] != null ? sub : ""; const v = V(), d = myData(m), ST = { paid: ["결제 완료", "ok"], pending: ["입금 대기", "warn"], refunded: ["환불 완료", "mute"], canceled: ["주문 취소", "mute"] };
    const shipN = d.orders.filter((o) => o.ship && ["wait", "ready", "prep", "ship"].indexOf(shipStOf(o)) >= 0).length;
    const cnt = { ship: shipN, addons: d.addN, classes: d.ing.length, free: d.free.length, vod: d.paidV.length, ebooks: d.ebooks.length, live: d.live.length, alarm: d.alarm.length, likes: d.likes.length, pending: d.pending.length, coupons: d.cpOk.length, reviews: d.rv.length, posts: d.pl.length, help: (v.inquiries || []).filter((x) => x.mid === m.id && x.answer && !x.seenAt).length };
    let body = "";
    if (sub === "") {
      const last = d.ing.find((x) => prog(m.id, x.p.id).last) || d.ing[0], mins = Math.round(d.doneL.reduce((a, l) => a + lSec(l), 0) / 60), allL = d.vods.reduce((a, x) => a + lessons(x.p).length, 0);
      const posts = d.pl.map((x) => ({ k: "다짐", t: x.text, p: x.pid, at: x.at })).concat(d.rv.map((r) => ({ k: "후기", t: r.text, p: r.pid, at: r.at }))).sort((a, b) => b.at - a.at).slice(0, 3), earned = d.badges.filter((x) => x.on);
      body = '<p class="vd-my-hi"><b>' + esc(m.name) + "님,</b> " + (d.streak ? d.streak + "일째 꾸준히 공부하고 있어요. 오늘도 한 걸음 더 가 볼까요?" : "오늘 강의 하나로 연속 수강을 시작해 볼까요?") + "</p>" +
        '<div class="vd-my-row"><section class="vd-my-blk vd-streak"><div class="vd-my-blk-h"><h3>연속 수강일</h3></div><p class="vd-streak-n"><b>' + d.streak + "일</b> 연속 수강 중</p>" + calHtml(m) + "</section>" +
          '<section class="vd-my-blk vd-recent"><div class="vd-my-blk-h"><h3>최근 수강 강의</h3><a href="#/vod/my/classes">전체보기' + icon("chevRight", "xs") + "</a></div>" + (last ? '<a class="vd-resume" href="#/vod/learn/' + esc(last.p.id) + '"><span class="vd-resume-th">' + thumbArt(last.p) + "</span><div><small>" + esc(last.p.creator) + "</small><b>" + esc(last.p.title) + '</b><div class="vd-prog"><i style="width:' + pctDone(m.id, last.p.id) + '%"></i></div><span>진도율 ' + pctDone(m.id, last.p.id) + "%</span></div></a>" + '<a class="vd-btn vd-btn-p vd-btn-xl" href="#/vod/learn/' + esc(last.p.id) + '">' + icon("play", "sm") + "이어서 학습하기</a>" : myEmpty("아직 수강 중인 강의가 없어요. 관심 분야의 강의를 둘러보세요.", "강의 둘러보기", "#/vod/c/all")) + "</section></div>" +
        myBlk("학습 통계", "", '<div class="vd-stats"><div><small>완강률</small><b>' + (d.vods.length ? Math.round(d.done.length / d.vods.length * 100) : 0) + "<i>%</i></b><span>완강 " + d.done.length + " / 수강 " + d.vods.length + "</span></div><div><small>학습 시간</small><b>" + Math.floor(mins / 60) + "<i>시간</i> " + (mins % 60) + "<i>분</i></b><span>끝까지 본 강의 기준</span></div><div><small>완료한 클립</small><b>" + d.doneL.length + "<i>개</i></b><span>전체 " + allL + "개 중</span></div></div>") +
        myBlk("내 배지 <small>" + earned.length + " / " + BADGES.length + "</small>", "#/vod/my/badges", earned.length ? '<div class="vd-bdg-row">' + earned.map((x) => '<span class="vd-bdg on">' + icon(x.b[3], "sm") + "<b>" + x.b[1] + "</b></span>").join("") + "</div>" : myEmpty("아직 받은 배지가 없어요. 강의를 시작하면 첫 배지를 드려요.", "강의 시작하기", "#/vod/c/all")) +
        (myTopics().length ? myBlk("내가 찜한 부업", "#/vod/my/likes?t=topics", '<div class="vd-mytp-chips">' + myTopics().map((k) => topicChip(k)).join("") + "</div>") : "") +
        myBlk("내 게시글", "#/vod/my/posts", posts.length ? '<ul class="vd-my-posts">' + posts.map((x) => '<li><span class="vd-tag vd-tag-' + (x.k === "후기" ? "blue" : "red") + '">' + x.k + '</span><a href="#/vod/p/' + esc(x.p) + '">' + esc(x.t) + "</a><time>" + esc(DB.date.toStr(new Date(x.at))) + "</time></li>").join("") + "</ul>" : myEmpty("아직 쓴 글이 없어요. 강의 상세에서 다짐 한마디를 남겨 보세요.", "클래스 둘러보기", "#/vod/c/all")) +
        myBlk("찜한 강의", "#/vod/my/likes", d.likes.length ? '<div class="vd-grid vd-grid-3">' + d.likes.slice(0, 3).map((p) => card(p)).join("") + "</div>" : myEmpty("찜한 강의가 아직 없어요. 마음에 드는 강의를 담아두세요.", "강의 둘러보기", "#/vod/c/all"));
    } else if (sub === "classes") {
      const st = route().qs.get("st") === "done" ? "done" : "ing", list = st === "done" ? d.done : d.ing;
      const avg = d.ing.length ? Math.round(d.ing.reduce((a, x) => a + pctDone(m.id, x.p.id), 0) / d.ing.length) : 0;
      body = '<div class="vd-sroom-sum"><div><small>수강 중</small><b>' + d.ing.length + '<em>개</em></b></div><div><small>수강 완료</small><b>' + d.done.length + '<em>개</em></b></div><div><small>평균 진도율</small><b>' + avg + '<em>%</em></b></div><div><small>연속 학습</small><b>' + streakOf(m.id) + '<em>일</em></b></div></div>' +
        '<div class="vd-subtabs"><a href="#/vod/my/classes" class="' + (st === "ing" ? "on" : "") + '">수강 중 <small>' + d.ing.length + '</small></a><a href="#/vod/my/classes?st=done" class="' + (st === "done" ? "on" : "") + '">수강 완료 <small>' + d.done.length + "</small></a></div>" +
        (list.length ? myCls(m, list) : myEmpty(st === "done" ? "아직 끝까지 들은 강의가 없어요." : "아직 수강 중인 강의가 없어요. 관심 분야의 강의를 둘러보세요.", "강의 둘러보기", "#/vod/c/all"));
    } else if (sub === "free") body = d.free.length ? myCls(m, d.free) : myEmpty("신청한 무료강의가 없어요. 부담 없이 먼저 들어 보세요.", "무료강의 보기", "#/vod/c/all?tab=free");
    else if (sub === "vod") body = d.paidV.length ? myCls(m, d.paidV) : myEmpty("구매한 VOD 강의가 없어요.", "VOD 강의 보기", "#/vod/c/all?tab=vod");
    else if (sub === "addons") {
      body = '<p class="vd-my-lead">강사에게 직접 묻는 <b>1:1 코칭권</b>과 강사님과 만나는 <b>TEA TIME</b>을 한 곳에서 봐요. 수강 중인 강의 상세 페이지에서 살 수 있어요.</p>' +
        '<h3 class="vd-my-sub">1:1 코칭권</h3>' + (d.coaches.length ? '<div class="vd-rcs">' + d.coaches.map((o) => { const p = product(o.pid) || {}, end = o.paidAt + (Number(o.coach.days) || 180) * 864e5, live = end > now(), n = Number(o.coach.n) || 0, used = Number(o.coach.used) || 0, lf = Math.max(0, n - used);
            return rcCard({ cls: live && lf ? "" : "exp", th: p.id ? thumbArt(p) : "", href: "#/vod/p/" + esc(o.pid), chips: '<span class="vd-kchip vd-kchip-vod">1:1 코칭권</span>' + (live ? (lf ? rcSt("남은 " + lf + "회", "ok") : rcSt("모두 사용", "end")) : rcSt("기간 끝", "end")), title: esc(p.title || o.title), sub: esc(p.creator || "") + " 강사 · " + n + "회 중 " + used + "회 사용",
              extra: '<div class="vd-rc-dots">' + Array.from({ length: n }, (_, i) => '<i class="' + (i < used ? "on" : "") + '"></i>').join("") + '</div><span class="vd-rc-s2">' + (live ? DB.date.fmtFull(DB.date.toStr(new Date(end))) + "까지 사용" : "사용 기간이 끝났어요") + "</span>",
              act: live && lf && owns(m.id, o.pid) && dgOpen(p) ? '<button type="button" class="vd-btn vd-btn-p" data-v="dg" data-p="' + esc(o.pid) + '" data-to="#/qna/requests/new">' + icon("message", "xs") + "질문하기</button>" + '<button type="button" class="vd-btn vd-btn-o" data-v="dg" data-p="' + esc(o.pid) + '" data-to="#/qna/requests">내 코칭 질문</button>' : '<a class="vd-btn vd-btn-o" href="#/vod/p/' + esc(o.pid) + '">강의 상세</a>' }); }).join("") + "</div>" : myEmpty("가진 1:1 코칭권이 없어요. 수강 중인 강의 상세 페이지 › 1:1 코칭권에서 살 수 있어요.", "", "")) +
        '<h3 class="vd-my-sub">강사님과 TEA TIME</h3>' + (d.teas.length ? '<div class="vd-rcs">' + d.teas.map((o) => { const p = product(o.pid) || {}, tt = o.tea || {}, st = TEA_ST[tt.st] || TEA_ST.req, pend = o.status === "pending";
            return rcCard({ cls: tt.st === "done" || tt.st === "cancel" ? "exp" : "", th: p.id ? thumbArt(p) : "", href: "#/vod/p/" + esc(o.pid), chips: '<span class="vd-kchip vd-kchip-live">TEA TIME ' + (tt.min || 60) + "분</span>" + rcSt(pend ? "입금 대기" : st[0], pend ? "warn" : st[1] === "ok" ? "ok" : st[1] === "mute" ? "end" : ""), title: esc(teaStTxt(o)), sub: esc(p.creator || "") + " 강사 · " + esc(TEA_MODE[tt.mode] || ""), extra: tt.topic ? '<p class="vd-rc-q">“' + esc(tt.topic) + "”</p>" : "",
              act: '<a class="vd-btn vd-btn-o" href="#/vod/p/' + esc(o.pid) + '">강의 상세</a>' }); }).join("") + "</div>" : myEmpty("신청한 TEA TIME이 없어요. 수강 중인 강의 상세 페이지에서 신청할 수 있어요.", "", ""));
    } else if (sub === "ship") {
      const bo = d.orders.filter((o) => o.ship && o.status !== "failed");
      body = '<p class="vd-my-lead">주문한 <b>종이책</b>의 배송 상태를 봐요. 결제 후 ' + (Number(shipSet().outDays) || 2) + "일 안에(주말 · 공휴일 빼고) 보내 드리고, 보내면 송장 번호가 여기에 올라와요.</p>" +
        (bo.length ? '<div class="vd-shcs">' + bo.map((o) => shipCard(o)).join("") + "</div>" : myEmpty("주문한 종이책이 없어요.", "책 둘러보기", "#/vod/c/all?tab=ebook"));
    } else if (sub === "ebooks") {
      const gifts = d.mine.filter((x) => (x.p.gifts || []).length);
      body = (d.ebooks.length ? '<div class="vd-rcs">' + d.ebooks.map(({ o, p }) => rcCard({ cls: "eb", th: thumbArt(p), href: "#/vod/learn/" + esc(p.id), chips: '<span class="vd-kchip vd-kchip-ebook">전자책</span>' + rcSt("평생 소장", "ok"), title: esc(p.title), sub: esc(p.creator) + " · " + esc(p.format || "PDF") + " " + (Number(p.pages) || 0) + "쪽 · " + DB.date.fmtFull(DB.date.toStr(new Date(o.paidAt))) + " 구매",
            act: '<button type="button" class="vd-btn vd-btn-p" data-v="dl" data-p="' + esc(p.id) + '">' + icon("download", "xs") + "PDF 내려받기</button>" + '<a class="vd-btn vd-btn-o" href="#/vod/learn/' + esc(p.id) + '">목차 보기</a>' })).join("") + "</div>" : myEmpty("구매한 전자책이 없어요. 바로 내려받아 따라 하는 전자책을 둘러보세요.", "전자책 보기", "#/vod/c/all?tab=ebook")) +
        (gifts.length ? '<h3 class="vd-my-sub">강의 선물 자료</h3><div class="vd-rcs">' + gifts.map(({ p }) => p.gifts.map((g, gi) => rcCard({ cls: "gift", th: '<span class="vd-rc-file">' + icon("file") + "<b>PDF</b></span>", href: "#/vod/p/" + esc(p.id), chips: '<span class="vd-kchip vd-kchip-free">수강 선물</span>', title: esc(g.title), sub: esc(p.title) + " 수강 선물 · PDF" + (g.pages ? " " + g.pages + "쪽" : ""), act: '<button type="button" class="vd-btn vd-btn-o" data-v="dl" data-p="' + esc(p.id) + '" data-g="' + gi + '">' + icon("download", "xs") + "내려받기</button>" })).join("")).join("") + "</div>" : "");
    } else if (sub === "live") {
      body = '<div class="vd-ch-note">' + icon("message", "sm") + "<div><b>LIVE · 오프라인은 카카오톡 오픈채팅방에서 진행 안내를 드려요</b><span>신청하면 오픈채팅방 입장 버튼이 열려요. 강의 날 오픈채팅방에 유튜브 라이브 링크를 올려 드리고, 오프라인은 자세한 장소를 알려 드려요.</span></div></div>" +
        (d.live.length ? '<div class="vd-rcs">' + d.live.map(({ o, p }) => { const t = new Date(p.eventAt), past = eventPast(p), dd = DB.date.diffDays(DB.date.toStr(t), today()), tl = typeOf(p) === "live";
          return rcCard({ cls: past ? "exp" : "", th: thumbArt(p), href: "#/vod/learn/" + esc(p.id),
            chips: '<span class="vd-kchip vd-kchip-' + (priceOf(p) === 0 ? "free" : tl ? "live" : "offline") + '">' + (priceOf(p) === 0 ? "무료 LIVE" : tl ? "LIVE" : "오프라인") + "</span>" + (past ? rcSt("종료", "end") : rcSt(dd > 0 ? "D-" + dd : "오늘", dd <= 3 ? "warn" : "")),
            title: esc(p.title), sub: esc(fmtEvent(p.eventAt, true)) + " · " + (tl ? viaOf(p) : esc(placeShort(p.place) || "현장")), extra: '<span class="vd-rc-s2">' + esc(p.creator) + " · 주문 " + esc(o.no) + "</span>",
            act: ebAct(p) + (p.kakao && !past ? '<a class="vd-btn vd-btn-kakao" href="' + esc(p.kakao) + '" target="_blank" rel="noopener">' + icon("message", "xs") + "오픈채팅 입장</a>" : "") + (tl && p.via !== "zoom" && p.ytLive && (past || dd <= 0) ? '<a class="vd-btn vd-btn-yt" href="' + esc(p.ytLive) + '" target="_blank" rel="noopener">' + icon("play", "xs") + (past ? "다시보기" : "라이브 보기") + "</a>" : "") + (p.via === "zoom" && replayOk(p) ? '<a class="vd-btn vd-btn-yt" href="' + esc(p.replayUrl) + '" target="_blank" rel="noopener">' + icon("play", "xs") + "다시보기</a>" : "") + '<a class="vd-btn vd-btn-o" href="#/vod/learn/' + esc(p.id) + '">' + (tl ? "입장 안내" : "참석 안내") + "</a>" }); }).join("") + "</div>" : myEmpty("신청한 LIVE · 오프라인 강의가 없어요.", "프리미엄 강의 보기", "#/vod/c/all?tab=premium"));
    } else if (sub === "alarm") body = d.alarm.length ? '<div class="vd-rcs">' + d.alarm.map((p) => rcCard({ th: thumbArt(p), href: "#/vod/p/" + esc(p.id), chips: '<span class="vd-kchip vd-kchip-soon">오픈 예정</span>' + rcSt(p.openAt ? fmtOpen(p.openAt) : "날짜 미정", "warn"), title: esc(p.title), sub: esc(p.creator || "") + " · " + esc(catOf(p.cat).label), extra: '<span class="vd-rc-s2">' + icon("bell", "xs") + " 오픈하면 할인가로 가장 먼저 알려 드려요</span>",
      act: '<a class="vd-btn vd-btn-o" href="#/vod/p/' + esc(p.id) + '">미리 보기</a><button type="button" class="vd-btn vd-btn-o" data-v="like" data-id="' + esc(p.id) + '">' + icon("bell", "xs") + "알림 끄기</button>" })).join("") + "</div>" : myEmpty("오픈 알림을 신청한 강의가 없어요. 곧 열리는 강의에서 알림을 받아 보세요.", "오픈 예정 보기", "#/vod/c/soon");
    else if (sub === "likes") {
      const LT = [["all", "전체", () => true], ["paid", "유료 강의", (p) => typeOf(p) === "vod" && priceOf(p) > 0], ["free", "무료 강의", (p) => priceOf(p) === 0, "free"], ["ebook", "전자책 · 종이책", (p) => typeOf(p) === "ebook" || isBook(p), "ebook"], ["event", "LIVE · 오프라인", (p) => isEvent(p) && priceOf(p) > 0, "live"]].filter((x) => !x[3] || bizOn(x[3]) || d.likes.some(x[2]));
      const tps = myTopics(), qt = route().qs.get("t"), lt = LT.find((x) => x[0] === qt) || LT[0], ls = d.likes.filter(lt[2]);
      body = '<div class="vd-wtabs">' + LT.map((x) => '<a href="#/vod/my/likes' + (x[0] === "all" ? "" : "?t=" + x[0]) + '" class="' + (x === lt && qt !== "topics" ? "on" : "") + '">' + x[1] + " <small>" + d.likes.filter(x[2]).length + "</small></a>").join("") + '<a href="#/vod/my/likes?t=topics" class="' + (qt === "topics" ? "on" : "") + '">관심 부업 <small>' + tps.length + "</small></a></div>" +
        (qt === "topics" ? myTopicsBody(tps) : ls.length ? '<div class="vd-grid vd-grid-3">' + ls.map((p) => card(p)).join("") + "</div>" : '<div class="vd-wempty">' + icon("heart") + "<b>" + (lt[0] === "all" ? "찜한 강의가 아직 없어요" : lt[1] + " 중 찜한 강의가 없어요") + '</b><p>마음에 드는 강의의 ♡를 누르면 여기에 모여요.</p><a class="vd-btn vd-btn-o" href="#/vod/c/all">강의 둘러보기</a></div>');
    }
    else if (sub === "devices") {
      const dv = myDevices(m), cur = devId();
      body = '<p class="vd-my-lead">한 계정으로 <b>최대 ' + DEV_MAX + "대</b>의 기기에서 강의를 볼 수 있어요. 쓰지 않는 기기는 해제하면 다른 기기를 등록할 수 있어요. 동시에 두 기기에서 재생하면 먼저 보던 기기는 멈춰요.</p>" +
        '<div class="vd-dev-cnt"><b>' + dv.length + "</b> / " + DEV_MAX + "대 등록됨</div>" +
        '<ul class="vd-devs">' + dv.map((x) => '<li class="' + (x.id === cur ? "me" : "") + '"><span class="vd-dev-ic">' + icon(x.kind === "모바일" ? "message" : "monitorPlay", "sm") + "</span><div><b>" + esc(x.name) + (x.id === cur ? ' <em>지금 이 기기</em>' : "") + "</b><small>" + esc(x.kind) + " · 처음 등록 " + esc(DB.date.fmtFull(DB.date.toStr(new Date(x.first)))) + " · 마지막 접속 " + esc(DB.date.fmtFull(DB.date.toStr(new Date(x.last)))) + "</small></div>" + (x.id === cur ? '<span class="vd-st vd-st-ok">사용 중</span>' : '<button type="button" class="vd-btn vd-btn-o vd-btn-sm" data-v="dev-del" data-id="' + esc(x.id) + '">기기 해제</button>') + "</li>").join("") + "</ul>" +
        '<p class="vd-muted vd-my-note">' + icon("alert", "xs") + " 기기 해제는 한 달에 3번까지 할 수 있어요. 모르는 기기가 있다면 비밀번호를 바꾸고 고객센터에 알려 주세요.</p>";
    }
    else if (sub === "pending" || sub === "orders") {
      const ot = sub === "orders" && route().qs.get("t") === "refund" ? "refund" : "pay", isRf = (o) => o.status === "refunded" || o.status === "canceled";
      const list = sub === "pending" ? d.pending : d.orders.filter((o) => (ot === "refund") === isRf(o)), b = bankInfo();
      const otabs = sub === "orders" ? '<div class="vd-wtabs"><a href="#/vod/my/orders" class="' + (ot === "pay" ? "on" : "") + '">결제 내역 <small>' + d.orders.filter((o) => !isRf(o)).length + '</small></a><a href="#/vod/my/orders?t=refund" class="' + (ot === "refund" ? "on" : "") + '">환불 · 취소 내역 <small>' + d.orders.filter(isRf).length + "</small></a></div>" : "";
      body = list.length ? '<ul class="vd-orders">' + list.map((o) => { const st = o.ship && SHIP_ST[shipStOf(o)] && o.status === "paid" ? SHIP_ST[shipStOf(o)] : ST[o.status] || ST.paid, ob = bankOf(o); return '<li class="has-th"><a class="vd-o-th" href="#/vod/p/' + esc(o.pid) + '">' + (product(o.pid) ? thumbArt(product(o.pid)) : "") + "</a><div><small>" + DB.date.fmtFull(DB.date.toStr(new Date(o.at))) + " · " + esc(o.no) + "</small><b>" + esc(o.title) + "</b>" + (optTxt(o) ? '<span class="vd-o-opt">' + esc(optTxt(o)) + "</span>" : "") + (o.ship ? '<a class="vd-o-ship" href="#/vod/my/ship">' + icon("truck", "xs") + "종이책 " + (Number(o.qty) || 1) + "권" + (o.shipFee ? " · 배송비 " + won(o.shipFee) : " · 무료배송") + (o.ship.inv ? " · " + esc(o.ship.carrier || "") + " " + esc(o.ship.inv) : "") + "</a>" : "") + (o.couponOff || o.pointOff ? '<span class="vd-muted">' + (o.couponOff ? "쿠폰 -" + won(o.couponOff) : "") + (o.couponOff && o.pointOff ? " · " : "") + (o.pointOff ? "포인트 -" + won(o.pointOff) : "") + "</span>" : "") + (o.status === "pending" ? '<span class="vd-muted">' + (ob.vbank ? "가상계좌 " + esc(ob.bank) + ' <span class="vd-accno">' + esc(ob.account) + "</span>" : esc(ob.bank) + ' <span class="vd-accno">' + esc(ob.account) + "</span> (" + esc(ob.holder) + ")" + " · 입금자명 " + esc(o.depositor || (o.buyer && o.buyer.name) || m.name || "")) + " · " + esc(fmtDue(dueOf(o))) + "까지 입금</span>" : "") + "</div><strong>" + won(o.amount) + '</strong><span class="vd-st vd-st-' + st[1] + '">' + st[0] + "</span>" + (o.status === "pending" ? '<button type="button" class="vd-btn vd-btn-o vd-btn-sm" data-v="ord-cancel" data-no="' + esc(o.no) + '">주문 취소</button>' : (o.status === "paid" || o.status === "refunded") && o.amount > 0 ? '<button type="button" class="vd-btn vd-btn-o vd-btn-sm" data-v="receipt" data-no="' + esc(o.no) + '">영수증</button>' : "") +
        (o.status === "paid" && o.amount > 0 ? (o.refundReq && typeof o.refundReq === "object" ? '<span class="vd-st vd-st-wait vd-o-rq">환불 요청 중</span><button type="button" class="vd-btn vd-btn-line vd-btn-sm" data-v="rf-undo" data-no="' + esc(o.no) + '">요청 취소</button>' : o.refundReq ? '<span class="vd-st vd-st-wait vd-o-rq">환불 처리 중</span>' : rfBtns(o)) : "") +
        (o.status === "refunded" && o.refundKind === "instant" ? '<small class="vd-rf-left">바로 취소 · ' + won(o.refundAmount || o.amount) + " 환불" + (o.pg && o.pg.st === "mock" ? " (시안)" : "") + "</small>" : "") +
        (o.status === "paid" && o.amount === 0 && product(o.pid) && isEvent(product(o.pid)) && !eventPast(product(o.pid)) ? '<button type="button" class="vd-btn vd-btn-line vd-btn-sm" data-v="ord-cancel0" data-no="' + esc(o.no) + '">신청 취소</button>' : "") +
        (o.status === "canceled" && o.canceledBy === "member" ? '<span class="vd-muted vd-o-by">내가 취소</span>' : "") + "</li>"; }).join("") + '</ul><p class="vd-muted vd-my-note">' + icon("alert", "xs") + " 환불은 상품 종류마다 기준이 달라요. <button type=\"button\" class=\"vd-link\" data-v=\"refund\">환불 규정</button></p>" : myEmpty(sub === "pending" ? "입금을 기다리는 주문이 없어요." : ot === "refund" ? "환불 · 취소한 주문이 없어요." : "아직 주문 내역이 없어요.", "강의 둘러보기", "#/vod/c/all"); body = otabs + body;
    } else if (sub === "coupons") {
      const st = route().qs.get("st") === "used" ? "used" : "ok", list = st === "ok" ? d.cpOk : d.cps.filter((y) => y.st !== "ok");
      body = '<form class="vd-cp-reg" data-vd-coupon><input name="code" maxlength="30" placeholder="쿠폰 코드를 입력해 주세요" aria-label="쿠폰 코드" autocomplete="off"><button type="submit" class="vd-btn vd-btn-dark">쿠폰 등록</button></form><p class="vd-muted vd-cp-hint">시안 체험 코드: <b>EBOOK20</b> (전자책 20% 할인)</p>' +
        '<div class="vd-subtabs"><a href="#/vod/my/coupons" class="' + (st === "ok" ? "on" : "") + '">사용 가능 <small>' + d.cpOk.length + '</small></a><a href="#/vod/my/coupons?st=used" class="' + (st === "used" ? "on" : "") + '">사용 완료 · 만료 <small>' + (d.cps.length - d.cpOk.length) + "</small></a></div>" +
        (list.length ? '<div class="vd-cps">' + list.map(cpTicket).join("") + "</div>" : myEmpty(st === "ok" ? "쓸 수 있는 쿠폰이 없어요. 쿠폰 코드가 있다면 위에서 등록해 주세요." : "사용했거나 만료된 쿠폰이 없어요.", "", ""));
    } else if (sub === "points") {
      const log = (m.pointLog || []).slice().sort((a, b) => b.at - a.at);
      body = '<div class="vd-pt-top"><div><small>사용 가능 포인트</small><b>' + (Number(m.points) || 0).toLocaleString() + '<i>P</i></b></div><ul><li>결제할 때 1P = 1원으로 써요.</li><li>후기를 쓰면 ' + (Number(v.settings.reviewPoint) || 0).toLocaleString() + "P를 드려요.</li><li>주문을 취소하면 쓴 포인트를 돌려드려요.</li></ul></div>" +
        (log.length ? '<ul class="vd-pt-log">' + log.map((x) => "<li><div><b>" + esc(x.why) + "</b><small>" + esc(DB.date.toStr(new Date(x.at))) + '</small></div><strong class="' + (x.amt < 0 ? "minus" : "plus") + '">' + (x.amt > 0 ? "+" : "") + x.amt.toLocaleString() + "P</strong></li>").join("") + "</ul>" : myEmpty("포인트 내역이 없어요.", "", ""));
    } else if (sub === "reviews") {
      const can = d.vods.filter((x) => !d.rv.some((r) => r.pid === x.p.id));
      body = (can.length ? '<div class="vd-callout">' + icon("star", "sm") + "<span>후기를 기다리는 강의가 " + can.length + "개 있어요. 후기를 쓰면 " + (Number(v.settings.reviewPoint) || 0).toLocaleString() + "P를 드려요.</span>" + can.slice(0, 3).map((x) => '<a href="#/vod/p/' + esc(x.p.id) + '">' + esc(x.p.title) + "</a>").join("") + "</div>" : "") +
        (d.rv.length ? '<ul class="vd-rv-list">' + d.rv.map((r) => '<li' + (r.hidden ? ' class="is-hidden"' : "") + '><div class="vd-rv-h"><b>' + esc((product(r.pid) || {}).title || "") + (r.hidden ? ' <em class="vd-rv-hid">운영 정책으로 숨김 처리됨</em>' : "") + '</b><span class="vd-stars sm">' + stars(r.rating) + "</span><time>" + DB.date.fmtFull(DB.date.toStr(new Date(r.at))) + "</time></div><p>" + esc(r.text) + '</p><div class="vd-rv-act"><button type="button" class="vd-btn vd-btn-o vd-btn-sm" data-v="rv-edit" data-id="' + esc(r.id) + '">고치기</button><button type="button" class="vd-btn vd-btn-line vd-btn-sm" data-v="rv-del" data-id="' + esc(r.id) + '">지우기</button></div></li>').join("") + "</ul>" : myEmpty("아직 남긴 후기가 없어요.", "", ""));
    } else if (sub === "posts") body = d.pl.length ? '<ul class="vd-pls">' + d.pl.map((x) => "<li>" + av(x.nick, "lg") + '<div><b><a href="#/vod/p/' + esc(x.pid) + '">' + esc((product(x.pid) || {}).title || "") + "</a></b><small>" + esc(DB.date.toStr(new Date(x.at))) + " · 공감 " + (x.up || 0) + "</small><p>" + esc(x.text) + '</p><div class="vd-pl-a"><button type="button" data-v="pl-del" data-id="' + esc(x.id) + '">삭제</button></div></div></li>').join("") + "</ul>" : myEmpty("남긴 다짐이 없어요. 강의 상세에서 다짐 한마디를 남겨 보세요.", "클래스 둘러보기", "#/vod/c/all");
    else if (sub === "badges") body = '<div class="vd-bdgs">' + d.badges.map((x) => '<div class="vd-bdg' + (x.on ? " on" : "") + '"><span>' + icon(x.b[3], "sm") + "</span><b>" + x.b[1] + "</b><small>" + (x.on ? x.b[2] : x.b[4]) + "</small></div>").join("") + "</div>";
    else if (sub === "help") {
      const iq = (v.inquiries || []).filter((x) => x.mid === m.id).sort((a, b) => b.at - a.at), ht = route().qs.get("t") === "list" ? "list" : "new", unseen = iq.filter((x) => x.answer && !x.seenAt).length;
      const FAQ = helpFaq(), NT = (v.notices || []).filter((x) => x.on !== false).sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.at - a.at);
      const CAT = [["수강 · 강의", "play", "강의 재생 · 진도 · 수강 기간"], ["결제 · 환불", "coins", "결제 · 영수증 · 환불 · 세금계산서"], ["쿠폰 · 포인트", "award", "쿠폰 받기 · 등록 · 포인트"], ["LIVE · 오프라인", "calendar", "오픈채팅 · 라이브 · 장소"], ["계정 · 로그인", "user", "가입 · 로그인 · 기기 관리"], ["오류 · 기술 문의", "alert", "화면 오류 · 자료 내려받기"], ["강사 입점 · 제휴", "handshake", "강의 열기 · 제휴 제안"], ["기타", "message", "그 밖의 궁금한 점"]];
      const myOrders = d.orders.filter((o) => o.status !== "canceled").slice(0, 20);
      body = '<div class="vd-hc-kk"><span class="vd-hc-kk-ic">' + KAKAO + '</span><div><b>카카오톡으로 바로 상담하기</b><small>강의 재생 · 결제 · 환불 · 오류처럼 급한 문제는 두잉고 · 두고클래스 운영 상담 채널로 바로 물어보세요.</small></div>' + kkBtn("vd-btn vd-btn-kakao", "카카오톡 상담") + "</div>" + (NT.length ? '<div class="vd-hc-nt"><div class="vd-hc-h"><h3>공지사항</h3><span>DOOGO CLASS 운영 소식</span></div>' + NT.map((x) => '<details class="vd-faq"' + (x.pin ? " open" : "") + "><summary><em>" + (x.pin ? "필독" : "공지") + "</em><span>" + esc(x.title) + "</span>" + icon("chevDown", "sm") + "</summary><p>" + esc(x.body).replace(/\n/g, "<br>") + "<small>" + esc(DB.date.fmtFull(DB.date.toStr(new Date(x.at)))) + "</small></p></details>").join("") + "</div>" : "") + '<div class="vd-hc-faq"><div class="vd-hc-h"><h3>자주 묻는 질문</h3><span>문의 전에 먼저 확인해 보세요</span></div>' + FAQ.map((f) => '<details class="vd-faq"><summary><em>' + esc(f[0]) + "</em><span>" + esc(f[1]) + "</span>" + icon("chevDown", "sm") + "</summary><p>" + esc(f[2]).replace(/\n/g, "<br>") + "</p></details>").join("") + "</div>" +
        '<div class="vd-hc-tabs"><a href="#/vod/my/help" class="' + (ht === "new" ? "on" : "") + '">' + icon("pen", "xs") + '1:1 문의하기</a><a href="#/vod/my/help?t=list" class="' + (ht === "list" ? "on" : "") + '">' + icon("message", "xs") + "내 문의 내역 <small>" + iq.length + "</small>" + (unseen ? '<i class="vd-hc-new">새 답변 ' + unseen + "</i>" : "") + "</a></div>" +
        (ht === "new"
          ? '<form class="vd-iq2" data-vd-iq novalidate>' +
              '<fieldset class="vd-iq-f"><legend>문의 분류 <em>*</em></legend><div class="vd-iq-cats">' + CAT.map((c, i) => '<label class="vd-iq-cat"><input type="radio" name="cat" value="' + esc(c[0]) + '"' + (i === 0 ? " checked" : "") + '><span><i>' + icon(c[1], "sm") + "</i><b>" + c[0] + "</b><small>" + c[2] + "</small></span></label>").join("") + "</div></fieldset>" +
              '<div class="vd-iq-row"><label class="vd-iq-f"><span>관련 주문 <small>(선택)</small></span><select name="order"><option value="">주문과 관계없는 문의예요</option>' + myOrders.map((o) => '<option value="' + esc(o.no) + '">' + esc(o.no + " · " + o.title).slice(0, 60) + "</option>").join("") + "</select></label>" +
              '<label class="vd-iq-f"><span>답변 알림 이메일</span><input value="' + esc(m.email || "") + '" readonly aria-readonly="true"></label></div>' +
              '<label class="vd-iq-f"><span>제목 <em>*</em></span><input name="title" maxlength="60" placeholder="어떤 점이 궁금하세요?"></label>' +
              '<label class="vd-iq-f"><span>내용 <em>*</em><small class="vd-iq-cnt" data-iq-cnt>0 / 1000</small></span><textarea name="text" rows="6" maxlength="1000" placeholder="상황을 자세히 적어 주시면 더 빨리 도와드릴 수 있어요. (예: 어떤 강의 · 어떤 화면에서 · 무엇이 안 되는지)"></textarea></label>' +
              '<p class="vd-err" id="vd-iq-err" role="alert"></p><div class="vd-iq-foot"><span>' + icon("clock", "xs") + "평일 오전 10시 ~ 오후 6시 · 영업일 기준 하루 안에 답해 드려요</span>" + '<button type="submit" class="vd-btn vd-btn-p vd-btn-xl">문의 남기기</button></div></form>'
          : (iq.length ? '<div class="vd-iq-list">' + iq.map((x) => '<details class="vd-iq-it' + (x.answer ? " ans" : "") + '" data-iq="' + esc(x.id) + '"' + (x.answer && !x.seenAt ? " open" : "") + '><summary><span class="vd-sroom-st ' + (x.answer ? "ok" : "warn") + '">' + (x.answer ? "답변 완료" : "답변 대기") + '</span><span class="vd-iq-cat-t">' + esc(x.cat) + "</span><b>" + esc(x.title) + "</b>" + (x.answer && !x.seenAt ? '<i class="vd-hc-new">NEW</i>' : "") + "<small>" + esc(DB.date.fmtFull(DB.date.toStr(new Date(x.at)))) + "</small>" + icon("chevDown", "sm") + "</summary>" +
                '<div class="vd-iq-body"><div class="vd-iq-q"><span class="vd-iq-who">Q</span><div><p>' + esc(x.text).replace(/\n/g, "<br>") + "</p>" + (x.order ? "<small>관련 주문 " + esc(x.order) + "</small>" : "") + "</div></div>" +
                (x.answer ? '<div class="vd-iq-a2"><span class="vd-iq-who a">A</span><div><b>DOOGO CLASS 고객센터</b><small>' + (x.answeredAt ? esc(DB.date.fmtFull(DB.date.toStr(new Date(x.answeredAt)))) + " 답변" : "") + "</small><p>" + esc(x.answer).replace(/\n/g, "<br>") + "</p></div></div>" : '<p class="vd-iq-wait">' + icon("clock", "xs") + " 담당자가 확인하고 있어요. 답변이 달리면 여기와 이메일로 알려 드려요.</p>") + "</div></details>").join("") + "</div>"
            : myEmpty("아직 남긴 문의가 없어요. 궁금한 점이 있으면 편하게 물어보세요.", "1:1 문의하기", "#/vod/my/help")));
    } else {
      sub = "account";
      body = '<form class="vd-acct vd-form" data-vd-acct novalidate><label>이메일 (아이디)<input value="' + esc(m.email) + '" readonly></label><label>이름<input name="name" value="' + esc(m.name) + '" maxlength="20"></label><label>휴대폰<input name="phone" value="' + esc(m.phone || "") + '" maxlength="20"></label><label class="vd-agree"><input type="checkbox" name="mkt"' + (m.marketing ? " checked" : "") + "><span>할인 · 새 클래스 소식 받기 (선택)</span></label>" +
        '<div class="vd-acct-ch"><span>받을 곳</span>' + CH3.map((c) => '<label><input type="checkbox" name="ch_' + c[0] + '"' + (chOn(m, c[0]) ? " checked" : "") + "><span>" + c[1] + "</span></label>").join("") + '<label><input type="checkbox" name="night"' + (m.consent && m.consent.night ? " checked" : "") + "><span>밤 9시 ~ 아침 8시에도 받기</span></label></div>" +
        (m.consent && m.consent.mkt ? '<p class="vd-muted vd-acct-cs">' + DB.date.fmtFull(DB.date.toStr(new Date(m.consent.at))) + "에 소식 받기에 동의했어요. 2년마다 한 번 동의 여부를 다시 알려 드려요.</p>" : "") +
        (m.via === "kakao" ? '<p class="vd-acct-kk">' + KAKAO + "카카오 계정으로 가입했어요. 로그인은 ‘카카오로 1초 만에 시작하기’로 해요.</p>" : "") +
        '<details class="vd-pwbox"' + (m.via === "kakao" && !m.pw ? " hidden" : "") + '><summary>비밀번호 바꾸기</summary><label>지금 비밀번호' + pwField("pw0", "current-password", "지금 비밀번호") + "</label><label>새 비밀번호" + pwField("pw1", "new-password", "영문 · 숫자 8자 이상") + "</label></details>" +
        '<p class="vd-err" id="vd-acct-err" role="alert"></p><div class="vd-acct-f"><button type="submit" class="vd-btn vd-btn-p">저장</button><button type="button" class="vd-btn vd-btn-o" data-v="logout">로그아웃</button></div><p class="vd-muted">가입일 ' + DB.date.fmtFull(DB.date.toStr(new Date(m.createdAt))) + "</p></form>";
    }
    const menu = '<aside class="vd-my-side"><div class="vd-my-prof"><div class="vd-my-me"><span class="vd-me-av lg">' + esc(m.name.slice(0, 1)) + "</span><div><b>" + esc(m.name) + "</b><small>" + esc(m.email) + '</small></div></div><a class="vd-my-pt" href="#/vod/my/points"><span>포인트</span><b>' + (Number(m.points) || 0).toLocaleString() + "P</b>" + icon("chevRight", "xs") + "</a>" +
        '<div class="vd-my-stat"><a href="#/vod/my/classes"><b>' + d.ing.length + '</b>진행중 강의</a><a href="#/vod/my/coupons"><b>' + d.cpOk.length + '</b>쿠폰</a><a href="#/vod/my/pending"><b>' + d.pending.length + '</b>결제대기</a></div><a class="vd-btn vd-btn-line vd-btn-sm vd-my-pf" href="#/vod/my/account">내 프로필</a></div>' +
      '<nav class="vd-my-nav"><a href="#/vod/my" class="vd-my-home' + (sub === "" ? " on" : "") + '">' + icon("home", "sm") + "<span>홈</span></a>" +
      MYNAV.map((g) => "<p>" + g[0] + "</p>" + g[1].filter((x) => !((x[0] === "free" && !bizOn("free")) || (x[0] === "live" && !bizOn("live"))) || cnt[x[0]]).map((x) => '<a href="#/vod/my/' + x[0] + '" class="' + (sub === x[0] ? "on" : "") + '">' + icon(x[2], "sm") + "<span>" + x[1] + "</span>" + (cnt[x[0]] ? "<small>" + cnt[x[0]] + "</small>" : "") + "</a>").join("")).join("") +
      '<button type="button" class="vd-my-out" data-v="logout">' + icon("logout", "sm") + "<span>로그아웃</span></button></nav></aside>";
    return shell("", '<div class="vd-wrap vd-my"><div class="vd-my-grid">' + menu + '<section class="vd-my-main"><h2 class="vd-my-h2">' + esc(MYT[sub]) + "</h2>" + body + "</section></div></div>", sub === "likes" ? "likes" : sub === "classes" ? "cls" : "my");
  }
  /* ---------- 강의 보기 (VOD: 유튜브 · 비메오 · mp4 / 전자책: 목차 · 내려받기 / LIVE · 오프라인: 입장 안내) ---------- */
  function vimeoSrc(u) {
    const s = String(u || ""), m = s.match(/vimeo\.com\/(?:video\/|channels\/[\w-]+\/|groups\/[\w-]+\/videos\/|manage\/videos\/)?(\d+)(?:\/([0-9a-f]{6,}))?/i); if (!m) return "";
    const h = m[2] || (s.match(/[?&]h=([0-9a-f]+)/i) || [])[1];
    return "https://player.vimeo.com/video/" + m[1] + "?" + (h ? "h=" + h + "&" : "") + "title=0&byline=0&portrait=0&dnt=1";
  }
  function videoHtml(l, auto, ph) {
    const yid = DB.youtubeId ? DB.youtubeId(l.video || "") : "", vm = vimeoSrc(l.video);
    if (vm) return '<iframe src="' + esc(vm + (auto ? "&autoplay=1" : "")) + '" title="' + esc(l.title) + '" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
    if (yid) return '<iframe src="https://www.youtube-nocookie.com/embed/' + esc(yid) + "?rel=0" + (auto ? "&autoplay=1" : "") + '" title="' + esc(l.title) + '" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
    if (l.video && /\.(mp4|webm)(\?|$)/i.test(l.video)) return '<video src="' + esc(l.video) + '" controls playsinline></video>';
    return '<div class="vd-pl-ph">' + icon("monitorPlay") + "<b>" + esc(l.title) + "</b><small>" + (ph || "영상은 마스터 관리자에서 연결해요 (유튜브 · 비메오 · mp4)") + "</small></div>";
  }

  /* ---------- 결제 영수증 (실제 강의 영수증처럼: 공급자 · 구매자 · 결제 내역 · 공급가액/부가세 · 결제 정보 · 직인) ---------- */
  const PAYN = { card: "신용 · 체크카드", kakao: "카카오페이", toss: "토스페이", naver: "네이버페이", transfer: "실시간 계좌이체", vbank: "가상계좌", bank: "무통장 입금", free: "무료", point: "포인트 전액" };
  function rcptGroup(o) {
    const all = V().orders, head = o.grp ? all.find((x) => x.no === o.grp) || o : o;
    return [head].concat(all.filter((x) => x !== head && x.grp === head.no && x.status !== "canceled"));
  }
  function rcptHtml(o) {
    const S = DB.siteInfo ? DB.siteInfo() : {}, m = V().members.find((x) => x.id === o.mid) || {}, rows = rcptGroup(o), head = rows[0];
    const list = rows.reduce((a, x) => a + (Number(x.list) || Number(x.amount) || 0) , 0), cp = rows.reduce((a, x) => a + (Number(x.couponOff) || 0), 0), pt = rows.reduce((a, x) => a + (Number(x.pointOff) || 0), 0);
    const paid = rows.reduce((a, x) => a + (Number(x.amount) || 0), 0), disc = Math.max(0, list - paid - cp - pt), refund = rows.reduce((a, x) => a + (x.status === "refunded" ? Number(x.refundAmount != null ? x.refundAmount : x.amount) || 0 : 0), 0);
    const net = paid - refund, supply = Math.round(net / 1.1), vat = net - supply, at = new Date(head.paidAt || head.at);
    const dt = at.getFullYear() + "." + String(at.getMonth() + 1).padStart(2, "0") + "." + String(at.getDate()).padStart(2, "0") + " " + String(at.getHours()).padStart(2, "0") + ":" + String(at.getMinutes()).padStart(2, "0");
    const issued = new Date(), iss = issued.getFullYear() + "." + String(issued.getMonth() + 1).padStart(2, "0") + "." + String(issued.getDate()).padStart(2, "0");
    const appr = String(Math.abs((head.no || "").split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7))).padStart(8, "0").slice(-8);
    const st = head.status === "refunded" ? ["환불 완료", "ref"] : refund ? ["부분 환불", "ref"] : ["결제 완료", "ok"];
    const tel = String(m.phone || "").replace(/\D/g, ""), telM = tel.length >= 8 ? tel.slice(0, 3) + "-****-" + tel.slice(-4) : "-";
    const row = (k, val, cls) => '<div class="rc-r' + (cls ? " " + cls : "") + '"><dt>' + k + "</dt><dd>" + val + "</dd></div>";
    return '<div class="rc-doc" id="rc-doc">' +
      '<div class="rc-top"><img class="rc-logo" src="assets/brand/doogo-class-word.png" alt="DOOGO CLASS"><div class="rc-ttl"><b>영수증</b><small>RECEIPT</small></div></div>' +
      '<div class="rc-meta"><span>영수증 번호 <b>R-' + esc(head.no) + "</b></span><span>발행일 <b>" + iss + '</b></span><span class="rc-st rc-st-' + st[1] + '">' + st[0] + "</span></div>" +
      '<div class="rc-amt"><small>' + (refund ? "최종 결제 금액 (환불 반영)" : "결제 금액") + "</small><strong>" + won(net) + '</strong><span>' + esc(PAYN[head.method] || (paid ? "결제" : "무료")) + " · " + dt + "</span></div>" +
      '<div class="rc-two">' +
        '<section class="rc-box"><h4>공급자</h4><dl>' + row("상호", esc(S.company || "(주)두고홀딩스")) + row("대표자", esc(S.ceo || "-")) + row("사업자등록번호", esc(S.bizNo || "-")) + row("통신판매업", esc(S.mailOrderNo || "-")) + row("주소", esc(S.address || "-")) + row("문의", esc(S.email || "-")) + "</dl>" +
          '<i class="rc-seal" aria-hidden="true"><b>' + esc(String(S.company || "두고홀딩스").replace(/\(주\)\s*/, "")) + "</b><small>인</small></i></section>" +
        '<section class="rc-box"><h4>구매자</h4><dl>' + row("이름", esc(m.name || "회원")) + row("이메일", esc(m.email || "-")) + row("휴대폰", esc(telM)) + row("주문 번호", esc(head.no)) + row("주문 일시", dt) + "</dl></section>" +
      "</div>" +
      '<section class="rc-box rc-items"><h4>결제 내역</h4><table><thead><tr><th>상품명</th><th>옵션</th><th class="n">수량</th><th class="n">금액</th></tr></thead><tbody>' +
        rows.map((x) => "<tr><td>" + esc(x.title) + (x.status === "refunded" ? ' <em class="rc-tag">환불</em>' : "") + "</td><td>" + esc(optTxt(x) || (product(x.pid) ? TYPE[typeOf(product(x.pid))][0] : "-")) + '</td><td class="n">1</td><td class="n">' + won(Number(x.list) || Number(x.amount) || 0) + "</td></tr>").join("") +
      "</tbody></table>" +
      '<dl class="rc-sum">' + row("상품 금액", won(list)) + (disc ? row("할인", "-" + won(disc)) : "") + (cp ? row("쿠폰 할인", "-" + won(cp) + (head.couponName ? ' <small>(' + esc(head.couponName) + ")</small>" : "")) : "") + (pt ? row("포인트 사용", "-" + won(pt)) : "") + row("결제 금액", won(paid), "b") + (refund ? row("환불 금액", "-" + won(refund)) : "") + row("공급가액", won(supply), "s") + row("부가세", won(vat), "s") + row("합계", won(net), "tot") + "</dl></section>" +
      '<section class="rc-box"><h4>결제 정보</h4><dl class="rc-pay">' + row("결제 수단", esc(PAYN[head.method] || "-")) + row("결제 일시", dt) + row("승인 번호", paid ? appr : "-") + row("거래 상태", st[0]) + "</dl></section>" +
      '<p class="rc-note">위 금액을 정상적으로 결제(수령)했음을 확인합니다.<br>이 영수증은 거래 확인용이에요. 세금계산서 · 현금영수증 발급은 고객센터(' + esc(S.email || "") + ")로 문의해 주세요. (시안 영수증)</p>" +
      '<div class="rc-foot"><span>DOOGO CLASS · www.doogoclass.com</span><span>' + esc(S.company || "") + " · " + esc(S.bizNo || "") + "</span></div></div>";
  }
  const fileList = (files) => ((files || []).length ? '<ul class="vd-files">' + files.map((f) => '<li><a href="' + esc(f.url && !/^idb:/.test(f.url) ? f.url : "#") + '"' + (/^idb:/.test(f.url || "") ? ' data-v="mat" data-u="' + esc(f.url) + '" data-n="' + esc(f.name || "") + '"' : f.url ? ' target="_blank" rel="noopener" download' : ' data-v="dl-none"') + ">" + icon("paperclip", "xs") + "<span>" + esc(f.name || "첨부 자료") + "</span>" + icon("download", "xs") + "</a></li>").join("") + "</ul>" : "");
  function pageEbook(p, m) {
    const o = ownOrder(m.id, p.id);
    return shell("", '<div class="vd-wrap vd-reader"><a class="vd-tl-btn" href="#/vod/my/ebooks">' + icon("arrowLeft", "xs") + "전자책 목록</a><div class=\"vd-reader-g\"><div class=\"vd-reader-cv\">" + thumbArt(p, "lg") + "</div><div><small>" + esc(p.creator) + " · " + esc(p.format || "PDF") + " " + (Number(p.pages) || 0) + "쪽</small><h1>" + esc(p.title) + "</h1><p>" + esc(p.sub || "") + "</p>" +
      '<div class="vd-reader-a"><button type="button" class="vd-btn vd-btn-p vd-btn-xl" data-v="dl" data-p="' + esc(p.id) + '">' + icon("download", "sm") + "PDF 내려받기</button></div><p class=\"vd-muted\">" + (o ? DB.date.fmtFull(DB.date.toStr(new Date(o.paidAt))) + " 구매 · " : "") + "평생 소장 · 내려받은 파일은 개인 학습용으로만 써 주세요.</p></div></div>" +
      '<section class="vd-pd-sec"><h2>목차</h2>' + (p.curriculum || []).map((ch) => '<div class="vd-toc"><b>' + esc(ch.title) + "</b><ul>" + (ch.lessons || []).map((l) => "<li><span>" + esc(l.title) + "</span><small>" + (Number(l.min) || 0) + "쪽</small></li>").join("") + "</ul></div>").join("") + "</section></div>", "my");
  }
  /* 고객센터 자주 묻는 질문: 마스터 › 전시 · 쿠폰 · 설정 › 고객센터 FAQ · 공지에서 고쳐요 (비어 있으면 기본값) */
  const HELP_FAQ_DEF = [["수강", "강의는 언제까지 볼 수 있나요?", "결제할 때 고른 수강권 기간(180일 · 365일 · 3년) 동안 볼 수 있어요. 마이페이지 › 내 강의실에서 남은 기간을 보고, 기간이 끝나면 1년 연장권으로 진도 그대로 이어서 들을 수 있어요."], ["수강", "강사에게 직접 질문할 수 있나요?", "1:1 코칭권을 사면 두잉고 강의실 ‘1:1 코칭 질문’에서 강사에게 직접 질문하고 답을 받아요. 강사님과 만나는 TEA TIME도 수강 중인 강의 상세 페이지에서 신청할 수 있어요."], ["LIVE", "LIVE 강의는 어디서 보나요?", "신청하면 마이페이지 › LIVE · 오프라인에 카카오톡 오픈채팅방 입장 버튼이 열려요. 강의 날 오픈채팅방에 유튜브 라이브 링크를 올려 드려요."], ["환불", "환불은 어떻게 하나요?", "VOD는 결제 후 7일 이내 · 강의를 하나도 듣지 않았다면 마이페이지 › 주문 · 결제 내역에서 ‘결제 취소 · 100% 환불’로 바로 취소돼요. 전자책은 내려받기 전 7일 이내, LIVE · 오프라인은 3일 전까지 전액 환불이에요. 그 밖에는 ‘환불 요청’을 남겨 주시면 규정에 따라 처리해 드려요."], ["쿠폰", "쿠폰은 어디서 쓰나요?", "결제 화면 ‘할인 · 쿠폰’에서 골라 쓸 수 있어요. 강의 상세 페이지 ‘사용 가능한 쿠폰이 있어요!’에서 쿠폰을 받고, 쿠폰 코드는 마이페이지 › 쿠폰에서 등록해요."], ["영수증", "영수증 · 세금계산서가 필요해요.", "주문 · 결제 내역에서 영수증을 PDF로 내려받을 수 있어요. 세금계산서는 1:1 문의(결제 · 환불)로 사업자 정보를 남겨 주세요."]];
  const helpFaq = () => (Array.isArray(V().helpFaq) && V().helpFaq.length ? V().helpFaq : HELP_FAQ_DEF);
  // Zoom LIVE 다시보기: 끝난 뒤 replayDays 동안 (비우면 계속)
  const replayOk = (p) => !!(p && p.replayUrl && eventPast(p) && (!Number(p.replayDays) || now() < evEnd(p) + Number(p.replayDays) * 864e5));
  // 끝난 무료 LIVE → 이어지는 유료 강의 버튼 (얼리버드 중이면 강조)
  const ebAct = (p, xl) => { const fn = bizOn("flive") && eventPast(p) && funnelOf(p), nx = fn && product(fn.next); if (!nx || nx.status !== "on") return ""; const e = ebOf(nx); return '<a class="vd-btn ' + (e ? "vd-btn-p" : "vd-btn-o") + (xl ? " vd-btn-xl" : "") + '" href="#/vod/p/' + esc(nx.id) + '">' + icon(e ? "sparkles" : "arrowRight", xl ? "sm" : "xs") + (e ? "얼리버드 " + pctOf(nx) + "% · " + esc(ebDayTxt(e.ebDay)) + "까지" : "이어지는 강의 보기") + "</a>"; };
  function pageTicket(p, m) {
    const o = ownOrder(m.id, p.id), t = typeOf(p), start = eventTime(p), past = eventPast(p), open = !past && start - now() < 10 * 6e4;
    return shell("", '<div class="vd-wrap vd-ticket-w"><a class="vd-tl-btn" href="#/vod/my/live">' + icon("arrowLeft", "xs") + "LIVE · 오프라인 목록</a>" +
      '<div class="vd-ticket"><div class="vd-ticket-h"><span class="vd-tag vd-tag-' + (t === "live" ? "pink" : "blue") + '">' + TYPE[t][1] + "</span><h1>" + esc(p.title) + "</h1><p>" + esc(p.creator) + "</p></div>" +
        '<dl class="vd-ticket-dl"><div><dt>일시</dt><dd>' + esc(fmtEvent(p.eventAt, true)) + " · " + durTxt(Number(p.eventMin) || totalMin(p)) + "</dd></div>" + (t === "live" ? "<div><dt>진행</dt><dd>" + (p.via === "zoom" ? "Zoom · 시작 10분 전부터 들어올 수 있어요" : "유튜브 라이브 · 링크는 카카오톡 오픈채팅방과 이 화면에 올라와요") + "</dd></div>" : "") + (p.kakao ? "<div><dt>오픈채팅</dt><dd>신청자 전용 카카오톡 오픈채팅방 · 공지와 라이브 링크를 여기서 먼저 알려 드려요</dd></div>" : "") + (t === "live" ? "" : "<div><dt>장소</dt><dd>" + esc(p.place || "신청 후 안내") + ' <a class="vd-link" href="https://map.naver.com/p/search/' + encodeURIComponent(placeShort(p.place) || "") + '" target="_blank" rel="noopener">지도 보기</a></dd></div><div><dt>준비물</dt><dd>노트북 · 충전기 · 신분증</dd></div>') + "<div><dt>주문 번호</dt><dd>" + esc(o ? o.no : "-") + "</dd></div><div><dt>신청자</dt><dd>" + esc(m.name) + " · " + esc(m.phone || m.email) + "</dd></div></dl>" +
        '<div class="vd-ticket-ch">' + ebAct(p, true) + (p.kakao ? '<a class="vd-btn vd-btn-kakao vd-btn-xl" href="' + esc(p.kakao) + '" target="_blank" rel="noopener">' + icon("message", "sm") + "카카오톡 오픈채팅방 입장하기</a>" : "") +
          (t === "live" && p.via !== "zoom" ? (p.ytLive && (past || DB.date.diffDays(DB.date.toStr(new Date(p.eventAt)), today()) <= 0) ? '<a class="vd-btn vd-btn-yt vd-btn-xl" href="' + esc(p.ytLive) + '" target="_blank" rel="noopener">' + icon("play", "sm") + (past ? "유튜브 다시보기" : "유튜브 라이브 보기") + "</a>" : '<button type="button" class="vd-btn vd-btn-off vd-btn-xl" disabled>' + icon("clock", "sm") + "라이브 링크는 강의 날 열려요</button>") : "") + "</div>" +
        (t === "live" && p.via !== "zoom" ? "" : '<div class="vd-ticket-f">' + (past ? (replayOk(p) ? '<a class="vd-btn vd-btn-yt vd-btn-xl" href="' + esc(p.replayUrl) + '" target="_blank" rel="noopener">' + icon("play", "sm") + "다시보기 영상 보기</a>" + (Number(p.replayDays) ? '<p class="vd-muted">' + esc(DB.date.fmtFull(DB.date.toStr(new Date(evEnd(p) + Number(p.replayDays) * 864e5)))) + "까지 볼 수 있어요.</p>" : "") : '<p class="vd-muted">끝난 강의예요.' + (p.replayDays ? " 다시보기 영상은 준비되면 끝난 뒤 " + p.replayDays + "일 동안 이 화면에 올라와요." : "") + "</p>") : t === "live" ? (open && p.link ? '<a class="vd-btn vd-btn-p vd-btn-xl" href="' + esc(p.link) + '" target="_blank" rel="noopener">' + icon("video", "sm") + "Zoom 입장하기</a>" : '<button type="button" class="vd-btn vd-btn-off vd-btn-xl" disabled>' + icon("clock", "sm") + "입장 링크는 시작 10분 전에 열려요</button>") + '<p class="vd-muted">시작까지 <b data-cd="' + esc(p.eventAt) + '">' + cdTxt(p.eventAt) + "</b></p>" : '<p class="vd-muted">강의 하루 전에 자세한 주소 · 주차 안내를 문자로 보내 드려요. 시작까지 <b data-cd="' + esc(p.eventAt) + '">' + cdTxt(p.eventAt) + "</b></p>") + "</div>") + "</div>" +
      '<section class="vd-pd-sec"><h2>진행 순서</h2>' + (p.curriculum || []).map((ch) => '<div class="vd-toc"><b>' + esc(ch.title) + "</b><ul>" + (ch.lessons || []).map((l) => "<li><span>" + esc(l.title) + "</span><small>" + (Number(l.min) || 0) + "분</small></li>").join("") + "</ul></div>").join("") + "</section></div>", "my");
  }
  function pageLearn(pid, lid) {
    const p = product(pid), m = me();
    if (!p) return pageProduct(pid);
    if (!m) { ROUTE.redirect("#/vod/login?next=" + encodeURIComponent("#/vod/learn/" + pid)); return ""; }
    if (!owns(m.id, pid)) { ROUTE.redirect("#/vod/p/" + pid); return ""; }
    if (isBook(p)) { ROUTE.redirect("#/vod/my/ship"); return ""; }
    if (typeOf(p) === "vod" && dgOpen(p)) { setTimeout(() => enterDg(pid, lid), 30); return shell("", '<div class="vd-wrap vd-go-dg"><span class="vd-dg-ic">' + (window.doinggoB ? window.doinggoB("black", "vd-dg-logo") : "두잉고") + "</span><b>" + esc(p.creator) + " 강사 두잉고 강의실로 이동하고 있어요</b><p>강의 영상 · 교재 · 업데이트 소식을 두잉고 강의실에서 한 번에 볼 수 있어요.</p></div>"); }
    if (typeOf(p) === "ebook") return pageEbook(p, m);
    if (isEvent(p)) return pageTicket(p, m);
    const lz = lessons(p), pr = prog(m.id, pid), cur = lz.find((l) => l.id === lid) || lz.find((l) => l.id === pr.last) || lz.find((l) => !pr.done[l.id]) || lz[0];
    if (!cur) return shell("", '<div class="vd-wrap">' + emptyBox("monitorPlay", "아직 올라온 강의가 없어요") + "</div>");
    if (pr.last !== cur.id) pr.last = cur.id;
    pr.seen = pr.seen || {}; if (!pr.seen[cur.id]) pr.seen[cur.id] = now();
    logStudy(m.id); save();
    const idx = lz.indexOf(cur), next = lz[idx + 1], pc = pctDone(m.id, pid);
    return '<div class="vd-player"><header class="vd-pl-top"><a href="#/vod/my/classes" class="vd-pl-back" aria-label="내 강의실로">' + icon("arrowLeft", "sm") + '</a><div><small>' + esc(p.creator) + "</small><b>" + esc(p.title) + '</b></div><span class="vd-pl-prog"><i style="--p:' + pc + '%"></i>' + pc + "%</span>" + kkBtn("vd-pl-kk", "문의하기") + "</header>" +
      '<div class="vd-pl-grid"><div class="vd-pl-main"><div class="vd-pl-video">' + videoHtml(cur) + "</div>" +
        '<div class="vd-pl-info"><small>' + esc(((p.curriculum || []).find((c) => (c.lessons || []).indexOf(cur) >= 0) || {}).title || "") + "</small><h1>" + esc(cur.title) + "</h1><span>" + lLen(cur) + (vimeoSrc(cur.video) ? " · Vimeo" : "") + "</span>" +
          '<div class="vd-pl-btns">' + (pr.done[cur.id] ? '<span class="vd-pl-done">' + icon("check", "sm") + "완료한 강의</span>" : '<button type="button" class="vd-btn vd-btn-p" data-v="done" data-p="' + esc(pid) + '" data-l="' + esc(cur.id) + '">' + icon("check", "sm") + (next ? "완료하고 다음 강의" : "완료하기") + "</button>") + (next ? '<a class="vd-btn vd-btn-o" href="#/vod/learn/' + esc(pid) + "/" + esc(next.id) + '">다음 강의' + icon("chevRight", "xs") + "</a>" : "") + "</div>" +
          (cur.desc || (cur.files || []).length ? '<div class="vd-pl-note">' + (cur.desc ? "<b>강의 노트</b><p>" + esc(cur.desc).replace(/\n/g, "<br>") + "</p>" : "") + ((cur.files || []).length ? "<b>첨부 자료</b>" + fileList(cur.files) : "") + "</div>" : "") + "</div></div>" +
        '<aside class="vd-pl-side">' + dgCard(p, "vd-dg-pl") + '<b class="vd-pl-side-h">커리큘럼 <small>' + lz.filter((l) => pr.done[l.id]).length + " / " + lz.length + "</small></b>" + (p.curriculum || []).map((c) => '<div class="vd-pl-ch"><small>' + esc(c.title) + "</small>" + (c.lessons || []).map((l) => '<a href="#/vod/learn/' + esc(pid) + "/" + esc(l.id) + '" class="' + (l.id === cur.id ? "on" : "") + (pr.done[l.id] ? " done" : "") + '"><i>' + (pr.done[l.id] ? icon("check", "xs") : "") + "</i><span>" + esc(l.title) + ((l.files || []).length ? " " + icon("paperclip", "xs") : "") + "</span><small>" + lLen(l) + "</small></a>").join("") + "</div>").join("") + "</aside></div></div>";
  }

  /* ---------- 강사 모집 팝업 (두잉고 ‘강사 입점 문의’와 같은 마스터 접수함으로 들어가요) ---------- */
  function recruit() {
    const fl = (t, req) => '<span class="vd-fl">' + t + (req ? " <em>*</em>" : "") + "</span>";
    modal("DOOGO CLASS 강사 모집", '<div class="vd-modal-b vd-recruit" id="vd-rc-body"><div class="vd-rc-hero"><small>DOOGO CLASS TEACHER</small><b>직접 해서 번 경험,<br><em>VOD · 전자책</em>으로 팔아 보세요.</b><ul><li>' + icon("check", "xs") + "강의 기획부터 VOD 촬영 · 편집까지 다 도와드려요. 강사님은 강의 자료(PPT)만 준비하면 돼요</li><li>" + icon("check", "xs") + "스튜디오 · 장비 · 촬영 스태프 · 썸네일 · 상세페이지까지 DOOGO CLASS가 준비해요</li><li>" + icon("check", "xs") + "판매 · 광고 · 결제 · 수강생 관리는 맡기고, 강사 페이지 · 강사진에 소개해 후속 클래스도 함께 기획해요</li></ul></div>" +
      '<form class="vd-form vd-rc-f" data-vd-rc novalidate><p class="vd-rc-req"><em>*</em> 표시가 있는 칸은 <b>필수 입력</b>이에요. 나머지는 적어 주시면 상담이 더 빨라요.</p>' +
        '<div class="vd-rc-2"><label>' + fl("성함", 1) + '<input name="name" maxlength="40" autocomplete="name" placeholder="홍길동"></label><label>' + fl("연락처", 1) + '<input name="phone" type="tel" inputmode="tel" maxlength="30" autocomplete="tel" placeholder="010-0000-0000"></label></div>' +
        '<label>' + fl("이메일", 1) + '<input name="email" type="email" inputmode="email" maxlength="120" autocomplete="email" placeholder="name@example.com"></label>' +
        '<div class="vd-rc-2"><label>' + fl("강의 분야") + '<select name="cat">' + cats().map((c) => "<option>" + esc(c.label) + "</option>").join("") + "<option>기타</option></select></label><label>" + fl("지금 강의하고 있는 곳") + "<input name=\"where\" maxlength=\"120\" placeholder=\"유튜브 · 클래스101 · 아직 없어요\"></label></div>" +
        '<div class="vd-rc-types"><span>열고 싶은 강의 <small>(여러 개 고를 수 있어요)</small></span><div>' + ["vod", "ebook", "live", "offline"].filter((k) => k === "vod" || bizOn(k === "ebook" ? "ebook" : "live")).map((k) => '<label class="vd-rc-chip"><input type="checkbox" name="types" value="' + TYPE[k][0] + '"' + (k === "vod" ? " checked" : "") + "><span>" + TYPE[k][0] + "</span></label>").join("") + "</div></div>" +
        '<label>' + fl("어떤 노하우인가요", 1) + '<textarea name="course" rows="3" maxlength="1500" placeholder="주제 · 대상 · 직접 낸 결과(매출 · 수강생 수 등)를 자유롭게 적어 주세요"></textarea></label>' +
        '<label>' + fl("채널 · 강의 페이지 주소") + '<input name="link" type="url" inputmode="url" maxlength="300" placeholder="https://"></label>' +
        '<label class="vd-agree"><input type="checkbox" name="agree"><span>개인정보 수집 · 이용에 동의해요 (필수)<small>상담을 위해 성함 · 연락처 · 이메일 · 강의 정보를 받아요. 상담에만 쓰고, 끝나면 지체 없이 지워요.</small></span></label>' +
        '<p class="vd-err" id="vd-rc-err" role="alert"></p><button type="submit" class="vd-btn vd-btn-p vd-btn-xl">강사 지원하기 ' + icon("send", "sm") + "</button></form></div>", "vd-modal-rec");
    setTimeout(() => { const n = document.querySelector("[data-vd-rc] [name=name]"); if (n) n.focus(); }, 60);
  }
  async function doRecruit(f) {
    const err = document.getElementById("vd-rc-err"), v = (n) => (f[n] ? f[n].value.trim() : ""), types = Array.from(f.querySelectorAll("input[name=types]:checked")).map((x) => x.value);
    const bad = (msg, n) => { err.textContent = msg; if (n && f[n]) f[n].focus(); };
    if (!v("name")) return bad("성함을 적어 주세요.", "name");
    if (!/^[0-9+\-() ]{8,}$/.test(v("phone"))) return bad("연락처를 숫자로 적어 주세요. (예: 010-0000-0000)", "phone");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v("email"))) return bad("이메일 주소를 확인해 주세요.", "email");
    if (!v("course")) return bad("어떤 노하우인지 적어 주세요.", "course");
    if (!f.agree.checked) return bad("개인정보 수집 · 이용에 동의해 주세요.");
    err.textContent = ""; const btn = f.querySelector("button[type=submit]"); btn.disabled = true;
    try {
      const r = await DB.applyPartner({ name: v("name"), phone: v("phone"), email: v("email"), where: "[DOOGO CLASS 강사 모집] " + (v("where") || "-"), course: "[" + (types.join(" · ") || "VOD 강의") + " · " + v("cat") + "] " + v("course"), link: v("link"), message: "DOOGO CLASS 강사 모집 팝업으로 접수했어요.", source: "doogoclass", agree: true });
      if (!r || r.error) { btn.disabled = false; return bad(r && r.error === "locked" ? "지원이 많이 들어와 잠시 막혔어요. 조금 뒤에 다시 보내 주세요." : "보내지 못했어요. 잠시 후 다시 시도해 주세요."); }
      const body = document.getElementById("vd-rc-body");
      if (body) body.innerHTML = '<div class="vd-rc-done"><span class="vd-done-ic">' + icon("check") + "</span><b>강사 지원이 접수됐어요</b><p>" + esc(v("name")) + " 강사님, 남겨 주신 연락처로 확인 후 연락드릴게요.<br>DOOGO CLASS와 함께할 날을 기다릴게요.</p><button type=\"button\" class=\"vd-btn vd-btn-p\" data-v=\"close\">확인</button></div>";
    } catch (e) { btn.disabled = false; bad("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."); }
  }

  /* ---------- 미리보기 창 (클래스101처럼: 왼쪽 영상 · 오른쪽 미리보기 목록 · 아래 수강신청) ---------- */
  function previewModal(pid, lid) {
    const p = product(pid); if (!p) return;
    const pvs = previewsOf(p), cur = pvs.find((l) => l.id === lid) || pvs[0] || lessons(p).find((l) => l.id === lid); if (!cur) return;
    const ebook = typeOf(p) === "ebook", lz = lessons(p);
    const vid = (l) => (ebook ? '<div class="vd-pl-ph">' + icon("book") + "<b>" + esc(l.title) + "</b><small>전자책 미리보기 페이지는 정식 오픈 때 PDF로 연결해요</small></div>" : videoHtml(l, true, "미리보기 영상을 준비하고 있어요"));
    modal("미리보기 · " + p.title, '<div class="vd-pvm"><div class="vd-pvm-v"><div class="vd-modal-video" id="vd-pvm-v">' + vid(cur) + '</div><div class="vd-pvm-now"><small>Part ' + (chapOf(p, cur).ci + 1) + " · " + esc((chapOf(p, cur).ch || {}).title || "") + "</small><b>" + esc(cur.title) + "</b>" + (cur.desc ? "<p>" + esc(cur.desc) + "</p>" : "") + "</div></div>" +
      '<aside class="vd-pvm-l"><b>미리보기 <em>' + pvs.length + "</em> / 전체 " + lz.length + "개</b>" + pvs.map((l) => '<button type="button" class="' + (l.id === cur.id ? "on" : "") + '" data-v="pv-pick" data-p="' + esc(p.id) + '" data-l="' + esc(l.id) + '"><i>' + icon("play", "xs") + "</i><span>" + esc(l.title) + "</span><small>" + (ebook ? (Number(l.min) || 0) + "쪽" : lLen(l)) + "</small></button>").join("") +
        '<p class="vd-pvm-lock">' + icon("lock", "xs") + "나머지 " + Math.max(0, lz.length - pvs.length) + "개 강의는 수강신청 후 볼 수 있어요</p></aside></div>" +
      '<div class="vd-pvm-f"><div><small>' + esc(TYPE[typeOf(p)][0] + " · " + accessTxt(p) + " · 강의 " + lz.length + "개") + "</small><span class=\"vd-price\">" + priceHtml(p) + "</span></div>" + (p.status === "on" ? '<a class="vd-btn vd-btn-p" href="' + esc((ctaOf(p, me()).href) || "#/vod/p/" + p.id) + '" data-v="close">' + esc(ctaOf(p, me()).txt || "수강신청 하기") + "</a>" : '<button type="button" class="vd-btn vd-btn-o" data-v="close">닫기</button>') + "</div>", "vd-modal-pv");
  }

  /* ---------- 움직임 (두고그룹 사이트처럼: 제목 글자 새김 · 스크롤 등장 · 숫자 올라가기 · 흐르는 줄) ----------
   * 운영체제 ‘움직임 줄이기’가 켜져 있어도 꺼 버리지 않고 크게 움직이는 것만 줄여요(두고그룹과 같은 방식) */
  function egSplit(el) {
    if (el.classList.contains("is-split")) return;
    const said = el.textContent.replace(/\s+/g, " ").trim(), vis = document.createElement("span");
    vis.className = "eg"; vis.setAttribute("aria-hidden", "true");
    let i = 0, ai = 0;
    const build = (node, target, acc) => Array.prototype.slice.call(node.childNodes).forEach((n) => {
      if (n.nodeType === 3) n.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { target.appendChild(document.createTextNode(" ")); return; }
        const w = document.createElement("span"); w.className = "eg-w";
        Array.from(part).forEach((ch) => { const c = document.createElement("span"); c.className = "eg-c"; c.textContent = ch; c.style.setProperty("--ci", i++); if (acc) c.style.setProperty("--ai", ai++); w.appendChild(c); });
        target.appendChild(w);
      });
      else if (n.nodeName === "BR") target.appendChild(document.createElement("br"));
      else if (n.nodeType === 1) { const a2 = acc || n.hasAttribute("data-accent"), box = document.createElement(n.nodeName === "EM" ? "em" : "span"); box.className = n.hasAttribute("data-accent") ? "eg-accent" : n.className || ""; target.appendChild(box); build(n, box, a2); }
    });
    build(el, vis, false);
    if (!i) return;
    const sr = document.createElement("span"); sr.className = "vd-sr"; sr.textContent = said;
    el.textContent = ""; el.appendChild(sr); el.appendChild(vis); el.classList.add("is-split"); el.style.setProperty("--eg-n", i);
  }
  function countUp(el) {
    if (el.__c) return; el.__c = 1;
    const to = Number(el.dataset.count) || 0, t0 = performance.now(), d = 1300;
    const step = (ts) => { const k = Math.min(1, (ts - t0) / d), v = Math.round(to * (1 - Math.pow(1 - k, 3))); el.textContent = v.toLocaleString(); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function motion() {
    const box = root.querySelector(".vd"); if (ui.mo) { ui.mo.disconnect(); ui.mo = null; }
    // 같은 화면을 다시 그릴 때(찜 · 후기 · 저장 등)는 움직임 없이 바로 보여요. 주소가 바뀔 때만 움직여요
    if (!box || !("IntersectionObserver" in window) || !ui.anim) return;
    ui.anim = false;
    box.classList.add("mo");
    root.querySelectorAll("[data-eg]").forEach(egSplit);
    root.querySelectorAll("[data-rv-kids]").forEach((el) => Array.prototype.forEach.call(el.children, (c, i) => c.style.setProperty("--i", Math.min(i, 8))));
    const show = (el) => { el.classList.add("is-in"); };
    ui.mo = new IntersectionObserver((ens) => ens.forEach((en) => {
      const h = en.boundingClientRect.height, seen = en.isIntersecting && (en.intersectionRatio >= 0.12 || en.intersectionRect.height >= Math.min(160, h * 0.5));
      if (seen) { show(en.target); ui.mo.unobserve(en.target); }
    }), { rootMargin: "0px 0px -6% 0px", threshold: [0, 0.05, 0.12, 0.3] });
    root.querySelectorAll("[data-eg], [data-rv], [data-rv-kids]").forEach((el) => ui.mo.observe(el));
    // 키보드로 화면 밖 요소에 들어가면 바로 보이게
    box.addEventListener("focusin", (e) => { for (let n = e.target; n && n !== box; n = n.parentElement) if (n.matches && n.matches("[data-rv], [data-rv-kids], [data-eg]")) show(n); });
  }
  /* 숫자 올라가기: 숫자마다 화면(가로로 넘기는 줄 포함)에 실제로 들어올 때 0부터 올라가요.
   * 카드 숫자(data-cid)는 한 번 올라가는 걸 본 뒤로는 이 기기에서 바로 최종 숫자로 보여요 */
  const KEY_CNT = "dc:cnt-seen";
  const cntSeen = () => { try { const a = JSON.parse(ls.get(KEY_CNT) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  function wireCounts() {
    if (ui.co) { ui.co.disconnect(); ui.co = null; }
    if (!("IntersectionObserver" in window)) return;
    const seen = cntSeen(), fresh = Array.prototype.filter.call(root.querySelectorAll("[data-count]"), (el) => !el.__c && !(el.dataset.cid && seen.indexOf(el.dataset.cid) >= 0));
    if (!fresh.length) return;
    fresh.forEach((el) => { el.textContent = "0"; });
    ui.co = new IntersectionObserver((ens) => ens.forEach((en) => {
      if (!en.isIntersecting || en.intersectionRatio < 0.9) return;
      const el = en.target; ui.co.unobserve(el); countUp(el);
      const id = el.dataset.cid; if (id) { const a = cntSeen(); if (a.indexOf(id) < 0) { a.push(id); ls.set(KEY_CNT, JSON.stringify(a.slice(-300))); } }
    }), { threshold: [0, 0.5, 0.9, 1] });
    fresh.forEach((el) => ui.co.observe(el));
  }
  // 맨 위로: 보통은 window.scrollTo. claude.ai 미리보기처럼 글 길이만큼 늘어난 틀 안에서는 window.scrollTo 가 바깥 화면을
  // 못 움직여서(썸네일을 눌러도 중간에 멈춰 보이던 이유) scrollIntoView 로 바깥 화면까지 같이 올려요
  function toTop() {
    window.scrollTo(0, 0);
    if (window.DGFILE && window.DGFILE.framed) { const el = root.firstElementChild || root; try { el.scrollIntoView({ block: "start" }); } catch (e) { el.scrollIntoView(true); } }
  }
  // 상세: 위 정보 상자가 화면 위로 지나가면 아래 결제 막대가 따라 올라와요
  function wireFbar() {
    if (ui.fb) { ui.fb.disconnect(); ui.fb = null; }
    const info = document.getElementById("vd-pdt-info"), fb = document.getElementById("vd-fbar");
    if (!info || !fb || !("IntersectionObserver" in window)) { if (fb) fb.classList.add("on"); return; }
    ui.fb = new IntersectionObserver((ens) => { const en = ens[0]; const on = !en.isIntersecting && en.boundingClientRect.top < 0; fb.classList.toggle("on", on); if (!on) fb.classList.remove("open"); }, { threshold: 0 });
    ui.fb.observe(info);
  }
  window.addEventListener("scroll", () => { if (!isActive()) return; const t = document.querySelector(".vd-top"); if (t) t.classList.toggle("is-sc", window.scrollY > 8); }, { passive: true });

  /* ================= 그리기 · 이벤트 ================= */
  function render() {
    const r = route(), [a, b, c] = r.path;
    clearInterval(ui.timer); clearInterval(ui.cd); if (ui.fb) { ui.fb.disconnect(); ui.fb = null; }
    syncFreeLive();
    let html;
    if (!a || a === "recruit") html = pageHome();
    else if (a === "c") html = !b || b === "all" || cats().some((x) => x.key === b) ? pageAll(b === "all" ? "" : b) : listPage(b);
    else if (a === "teachers") html = b ? pageTeacher(decodeURIComponent(b)) : pageTeachers();
    else if (a === "dg") html = pageDg();
    else if (a === "search") html = listPage(null, r.qs.get("q") || "");
    else if (a === "p") html = pageProduct(b);
    else if (a === "about") html = pageAbout();
    else if (a === "legal") html = pageLegal(b);
    else if (a === "checkout") html = pageCheckout(b);
    else if (a === "order") html = pageOrder(b);
    else if (a === "login") html = pageAuth(false);
    else if (a === "signup") html = pageAuth(true);
    else if (a === "my") html = pageMy(b);
    else if (a === "learn") html = pageLearn(b, c);
    else html = pageHome();
    if (html === "") return;
    try { sessionStorage.setItem("dc:last", ROUTE.hash); } catch (e) {}
    catchAttr(); touchSeen();
    root.innerHTML = html;
    document.title = !a ? "두고클래스 DOOGO CLASS | 실전 강사님의 자기계발 VOD 클래스" : a === "legal" ? ((LEGAL_TABS.find((x) => x[0] === b) || LEGAL_TABS[0])[1] + " | 두고클래스 DOOGO CLASS") : (a === "p" && product(b) ? product(b).title + " | " : "") + "DOOGO CLASS — 돈 되는 클래스"; // 대표 주소 = index.html <title> (SEO)
    window.applyStudentTheme && window.applyStudentTheme(null);
    if (!a && !ui.paused && liveBanners().length > 1) ui.timer = setInterval(() => slide(1), 5000);
    if (document.querySelector("[data-cd]")) ui.cd = setInterval(() => document.querySelectorAll("[data-cd]").forEach((x) => { x.textContent = cdTxt(x.dataset.cd); }), 1000);
    const co = document.querySelector("[data-vd-pay]"); if (co) coPaint(co);
    document.querySelectorAll("[data-vd-auth]").forEach(authReady);
    syncTabs(); wireRails(); motion(); wireCounts(); wireFbar(); hydrate(root); wireSwipe();
    if (a === "recruit") { ROUTE.replace("#/vod"); setTimeout(recruit, 80); }
  }
  function wireSwipe() {
    const t = document.getElementById("vd-hero"); if (!t) return;
    let x0 = null, y0 = 0, moved = false;
    t.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; moved = false; }, { passive: true });
    t.addEventListener("touchend", (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null; if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { moved = true; slide(dx < 0 ? 1 : -1); if (!ui.paused) { clearInterval(ui.timer); ui.timer = setInterval(() => slide(1), 5000); } } }, { passive: true });
    t.addEventListener("click", (e) => { if (moved) { e.preventDefault(); moved = false; } }, true);
  }
  // 끝에서 처음으로 넘어갈 때도 같은 방향으로 이어지게: 양 끝에 복제 배너를 두고, 복제에 도착하면 진짜 배너 자리로 순간 이동
  function slide(d, to) {
    const n = liveBanners().length; if (!n) return;
    const raw = to != null ? to : ui.slide + d;
    ui.slide = (raw + n) % n;
    const t = document.getElementById("vd-hero"); if (!t) return;
    const off = n > 1 ? 1 : 0;
    clearTimeout(ui.jump); t.classList.add("anim"); t.style.setProperty("--i", raw + off);
    ui.jump = setTimeout(() => { t.classList.remove("anim"); if (raw !== ui.slide) t.style.setProperty("--i", ui.slide + off); }, 640);
    t.querySelectorAll(".vd-slide").forEach((x) => { const on = x.dataset.i !== "" && Number(x.dataset.i) === ui.slide; x.classList.toggle("on", on); x.tabIndex = on ? 0 : -1; });
    document.querySelectorAll(".vd-dots button").forEach((x, i) => x.classList.toggle("on", i === ui.slide));
    const c = document.querySelector(".vd-hero-cnt b"); if (c) c.textContent = ui.slide + 1;
  }
  // 가로 줄: 화살표로 한 화면씩 넘기고, ‘지금 / 전체’ 쪽수를 맞춘다
  function railStep(el) { const a = el.children[0], b = el.children[1]; if (!a) return { step: el.clientWidth, per: 1, n: 0 }; const step = b ? b.offsetLeft - a.offsetLeft : a.offsetWidth; const per = Math.max(1, Math.round((el.clientWidth + step - a.offsetWidth) / step)); return { step, per, n: el.children.length }; }
  function railInfo(el) { const r = railStep(el), total = Math.max(1, Math.ceil(r.n / r.per)), cur = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 ? total : Math.min(total, Math.round(el.scrollLeft / (r.step * r.per)) + 1); return { cur, total }; }
  function wireRails() {
    document.querySelectorAll("[data-pager]").forEach((pg) => {
      const el = document.getElementById(pg.dataset.pager); if (!el) return;
      const upd = () => { const i = railInfo(el), n = pg.querySelector(".vd-pager-n"); if (n) n.innerHTML = "<b>" + i.cur + "</b> / " + i.total; const bs = pg.querySelectorAll("button"); bs[0].disabled = i.cur <= 1; bs[1].disabled = i.cur >= i.total; pg.classList.toggle("one", i.total <= 1); };
      el.addEventListener("scroll", () => { clearTimeout(el.__t); el.__t = setTimeout(upd, 60); }, { passive: true }); upd();
    });
  }
  function syncTabs() {
    const tabs = document.querySelectorAll(".vd-pd-tabs button");
    window.removeEventListener("scroll", window.__vdTabs || (() => {}));
    if (!tabs.length) return;
    const onScroll = () => { let on = tabs[0]; tabs.forEach((t) => { const s = document.getElementById(t.dataset.to); if (s && s.getBoundingClientRect().top < 200) on = t; }); tabs.forEach((t) => t.classList.toggle("on", t === on)); };
    window.__vdTabs = onScroll; window.addEventListener("scroll", onScroll, { passive: true });
  }
  // 로그인 · 가입: 칸을 다 채워야 버튼이 켜진다 (패스트캠퍼스처럼 회색 → 레드)
  function authReady(f) {
    const v = (k) => !!(f[k] && f[k].value.trim()), ok = f.dataset.vdAuth === "login" ? v("email") && v("pw") : v("name") && v("email") && v("phone") && v("pw") && v("pw2") && f.agree.checked;
    const b = f.querySelector("button[type=submit]"); if (b) b.disabled = !ok;
    const all = f.querySelector("[data-v='agree-all']"); if (all) all.checked = f.agree.checked && f.mkt.checked;
  }
  const isActive = () => document.body.dataset.mode === "vod";
  const closeModal = () => { document.getElementById("modal-root").innerHTML = ""; if (pgWait) pgWait(false, true); };
  function modal(title, body, cls) {
    document.getElementById("modal-root").innerHTML = '<div class="vd-modal-bg' + (cls ? " " + cls : "") + '" data-v="close"><div class="vd-modal" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="vd-modal-h"><b>' + esc(title) + '</b><button type="button" data-v="close" aria-label="닫기">' + icon("x", "sm") + "</button></div>" + body + "</div></div>";
  }
  // 내 계정 메뉴: 인사 · 내 강의 · 쿠폰 · 포인트 · 자주 가는 곳 · 로그아웃 (PC 는 오른쪽 위에서 펼침, 휴대폰은 아래에서 올라옴)
  function acctBody(m) {
    const d = myData(m), cps = myCoupons(m.id).filter((x) => x.st === "ok").length;
    const link = (h, ic, t, n) => '<a href="' + h + '" data-v="close">' + icon(ic, "sm") + "<span>" + t + "</span>" + (n ? "<em>" + n + "</em>" : "") + icon("chevRight", "xs") + "</a>";
    return '<div class="vd-acct-in">' +
      '<div class="vd-acct-hd"><span class="vd-me-av lg">' + esc(m.name.slice(0, 1)) + "</span><div><b>" + esc(m.name) + "님, 안녕하세요</b><small>" + esc(m.email || "") + "</small></div></div>" +
      '<div class="vd-acct-st">' +
        '<a href="#/vod/my/classes" data-v="close"><b>' + d.mine.length + "</b><small>내 강의</small></a>" +
        '<a href="#/vod/my/coupons" data-v="close"><b>' + cps + "</b><small>쿠폰</small></a>" +
        '<a href="#/vod/my/points" data-v="close"><b>' + (Number(m.points) || 0).toLocaleString() + "P</b><small>포인트</small></a></div>" +
      '<nav class="vd-acct-ls" aria-label="내 계정">' + link("#/vod/my/classes", "monitorPlay", "내 강의실") + link("#/vod/my/likes", "heart", "찜한 클래스", d.likes.length || "") + link("#/vod/my/orders", "file", "주문 · 결제 내역", d.pending.length ? "입금 대기 " + d.pending.length : "") + link("#/vod/my/account", "user", "회원 정보 수정") + link("#/vod/my/help", "headset", "고객센터 · 1:1 문의") + link("#/vod/my", "grid", "마이페이지 전체") + "</nav>" +
      '<button type="button" class="vd-acct-out" data-v="logout">' + icon("logout", "sm") + "로그아웃</button></div>";
  }
  function drawer() {
    const m = me(), item = (h, t, ic) => '<a href="' + h + '" data-v="close">' + icon(ic, "sm") + "<span>" + t + "</span></a>";
    modal("전체 메뉴", '<div class="vd-drawer">' +
      '<form class="vd-search vd-dr-search" data-vd-search role="search"><input name="q" type="search" placeholder="어떤 부업을 배워 볼까요?" aria-label="클래스 검색" autocomplete="off"><button type="submit" aria-label="검색">' + icon("search", "sm") + "</button></form>" + (m ? '<a class="vd-dr-me" href="#/vod/my" data-v="close"><span class="vd-me-av lg">' + esc(m.name.slice(0, 1)) + "</span><div><b>" + esc(m.name) + " 님</b><small>" + esc(m.email) + " · " + (Number(m.points) || 0).toLocaleString() + "P</small></div>" + icon("chevRight", "sm") + "</a>" : '<a class="vd-btn vd-btn-p vd-btn-xl" href="#/vod/login" data-v="close">로그인 · 회원가입</a>') +
      "<p>클래스</p>" + item("#/vod", "돈되는 클래스", "home") + item("#/vod/c/all", "전체 클래스", "layers") + item("#/vod/c/all?tab=vod", "VOD 강의", "monitorPlay") + (bizOn("ebook") ? item("#/vod/c/all?tab=ebook", "전자책", "book") : "") + (bizOn("flive") ? item("#/vod/c/all?tab=flive", "무료 LIVE", "video") : "") + (bizOn("live") ? item("#/vod/c/all?tab=premium", "LIVE · 오프라인 강의", "calendar") : "") + (bizOn("free") ? item("#/vod/c/all?tab=free", "무료강의", "sparkles") : "") + item("#/vod/teachers", "강사진", "users") + item("#/vod/c/soon", "오픈 예정", "bell") +
      "<p>분야</p>" + cats().map((c) => item("#/vod/c/" + c.key, esc(c.label), c.icon)).join("") +
      "<p>마이페이지</p>" + item("#/vod/my/classes", "내 강의실", "monitorPlay") + item("#/vod/my/likes", "찜 · 관심 부업", "heart") + item("#/vod/my/coupons", "쿠폰", "coins") + item("#/vod/my/orders", "주문 · 결제 내역", "file") + item("#/vod/my/help", "고객센터 · 1:1 문의", "headset") +
      "<p>DOOGO CLASS</p>" + item("#/vod/about", "DOOGO CLASS 소개", "store") + '<button type="button" data-v="recruit">' + icon("handshake", "sm") + "<span>강사 모집</span></button>" + item("#/doinggo", "두잉고 (기수 강의)", "arrowUpRight") + '<a href="' + esc(opsKk().chat) + '" target="_blank" rel="noopener" data-kk-ops>' + icon("message", "sm") + "<span>카카오톡 상담 (문의하기)</span></a>" + (m ? '<button type="button" data-v="logout">' + icon("logout", "sm") + "<span>로그아웃</span></button>" : "") + "</div>", "vd-modal-drawer");
  }
  const keepScroll = () => { const y = window.scrollY; render(); window.scrollTo(0, y); };
  // 주문 취소 · 환불 때 쓴 쿠폰 · 포인트를 돌려준다 (마스터 화면도 같이 씀)
  function restoreOrder(o) {
    const v = V();
    if (o.mcid) { const x = ((v.memberCoupons || {})[o.mid] || []).find((y) => y.id === o.mcid); if (x) { x.usedAt = null; x.orderNo = ""; } }
    if (o.pointOff) { const mb = v.members.find((y) => y.id === o.mid); if (mb) addPoint(mb, o.pointOff, "주문 취소 · 포인트 돌려받음 (" + o.no + ")"); }
  }
  window.VOD.restoreOrder = restoreOrder;
  function download(p, gi) {
    const f = gi != null ? ((p.gifts || [])[gi] || {}).file : p.file;
    if (f) {
      const nm = (gi != null ? ((p.gifts || [])[gi] || {}).title || p.title : p.title).replace(/[\\/:*?"<>|]/g, " ").trim() + ".pdf";
      // 마스터가 시안에서 올린 파일(이 브라우저 저장소)은 matOpen 으로, 서버 · 외부 주소는 내려받기 → 안 되면 새 창
      if (/^idb:/.test(f)) { matOpen({ url: f, name: nm }, "dl").then((ok) => toast(ok ? "PDF를 내려받았어요." : "이 브라우저에 저장된 파일이 아니에요. 운영팀에 알려 주세요.", ok ? "" : "warn")); return; }
      if (window.DGFILE) window.DGFILE.saveUrl(f, nm).then((r) => { if (r === "saved") toast("PDF를 내려받았어요."); }, () => window.open(f, "_blank", "noopener")); else window.open(f, "_blank", "noopener");
      return;
    }
    toast("시안이라 실제 PDF 파일은 정식 오픈 때 연결돼요.");
  }
  document.addEventListener("click", (e) => {
    if (!isActive()) return;
    const t = e.target.closest("[data-v]"); if (!t) return;
    const v = t.dataset.v, m = me();
    if (v === "close") { if (e.target === t || t.tagName === "BUTTON" || t.tagName === "A") closeModal(); return; }
    if (v === "recruit") { e.preventDefault(); recruit(); return; }
    if (v === "dg") { e.preventDefault(); enterDg(t.dataset.p, "", t.dataset.to); return; }
    if (v === "mat") { e.preventDefault(); { const rp = route().path; if (rp[0] === "learn" && m) markMat(m.id, rp[1]); } matOpen({ url: t.dataset.u, name: t.dataset.n }, "dl").then((ok) => { if (!ok) toast("이 브라우저에 저장된 파일이 아니에요. 강사님께 다시 올려 달라고 요청해 주세요.", "warn"); }); return; }
    if (v === "dev-del") { const m = me(); if (!m || !Array.isArray(m.devices)) return; if (t.dataset.arm !== "1") { t.dataset.arm = "1"; t.textContent = "한 번 더 누르면 해제"; return; } m.devices = m.devices.filter((x) => x.id !== t.dataset.id); save(); render(); toast("기기를 해제했어요."); return; }
    if (v === "cp-open") { const p = product(t.dataset.p); if (p) modal("사용 가능한 쿠폰", cpModalBody(p), "vd-modal-cp"); return; }
    if (v === "cp-get") {
      const p = product(t.dataset.p); if (!p || !m) return;
      const list = t.dataset.c === "all" ? dlCoupons(p).filter((c) => !hasCp(m.id, c)) : dlCoupons(p).filter((c) => c.id === t.dataset.c);
      if (srvOn()) {
        list.reduce((pr, c) => pr.then((n) => payApi("claim", { cid: c.id }).then((r) => (r && r.ok ? n + 1 : n))), Promise.resolve(0)).then((n) => DB.remote.refresh().then(() => n)).then((n) => {
          const mb2 = document.querySelector(".vd-cpm"); if (mb2) mb2.outerHTML = cpModalBody(p);
          const pc2 = document.querySelector(".vd-cpdl"); if (pc2) pc2.outerHTML = cpDlBtn(p, me());
          toast(n ? "쿠폰 " + n + "장을 받았어요. 결제할 때 바로 쓸 수 있어요." : "이미 받은 쿠폰이에요.");
        });
        return;
      }
      const got = list.filter((c) => issueCoupon(m.id, c)); save();
      const mb = document.querySelector(".vd-cpm"); if (mb) mb.outerHTML = cpModalBody(p);
      toast(got.length ? "쿠폰 " + got.length + "장을 받았어요. 결제할 때 바로 쓸 수 있어요." : "이미 받은 쿠폰이에요.");
      const pc = document.querySelector(".vd-cpdl"); if (pc) pc.outerHTML = cpDlBtn(p, m);
      return;
    }
    if (v === "pitch-more") { const c = t.closest(".vd-pitch"); if (c) { c.classList.toggle("open"); t.innerHTML = (c.classList.contains("open") ? "접기" : "더보기") + icon("chevDown", "xs"); } return; }
    if (v === "cmt-more") { const c = t.closest(".vd-cmt"); if (c) { c.classList.toggle("open"); t.textContent = c.classList.contains("open") ? "접기" : "더보기"; } return; }
    if (v === "pv-open") { e.preventDefault(); e.stopPropagation(); previewModal(t.dataset.p, t.dataset.l); return; }
    if (v === "pv-pick") { const p = product(t.dataset.p), l = p && lessons(p).find((x) => x.id === t.dataset.l); const box = document.getElementById("vd-pvm-v"); if (!l || !box) return; box.innerHTML = typeOf(p) === "ebook" ? '<div class="vd-pl-ph">' + icon("book") + "<b>" + esc(l.title) + "</b><small>전자책 미리보기 페이지는 정식 오픈 때 PDF로 연결해요</small></div>" : videoHtml(l, true, "미리보기 영상을 준비하고 있어요"); const now = document.querySelector(".vd-pvm-now"); if (now) now.innerHTML = "<small>Part " + (chapOf(p, l).ci + 1) + " · " + esc((chapOf(p, l).ch || {}).title || "") + "</small><b>" + esc(l.title) + "</b>" + (l.desc ? "<p>" + esc(l.desc) + "</p>" : ""); document.querySelectorAll(".vd-pvm-l button").forEach((x) => x.classList.toggle("on", x === t)); return; }
    if (v === "fbar") { const fb = document.getElementById("vd-fbar"); if (fb) { fb.classList.add("on"); fb.classList.toggle("open"); } return; }
    if (v === "like") {
      e.preventDefault(); e.stopPropagation();
      if (!m) { toast("로그인하면 찜할 수 있어요.", "warn"); ROUTE.hash = "#/vod/login?next=" + encodeURIComponent(ROUTE.hash); return; }
      const L2 = (V().likes[m.id] = V().likes[m.id] || []), i = L2.indexOf(t.dataset.id), p = product(t.dataset.id);
      if (i >= 0) L2.splice(i, 1); else L2.push(t.dataset.id);
      likeBump(t.dataset.id, i < 0);
      save(); const soon = p && p.status === "soon";
      if (i < 0) document.querySelectorAll('[data-v="like"][data-id="' + t.dataset.id + '"]').forEach((x) => { x.classList.remove("pop"); void x.offsetWidth; x.classList.add("pop"); });
      if (/^#\/vod\/(p|my)\b/.test(ROUTE.hash)) keepScroll();
      else {
        document.querySelectorAll('[data-v="like"][data-id="' + t.dataset.id + '"]').forEach((x) => { x.classList.toggle("on", i < 0); const n = x.querySelector("span, small"); if (n && p) n.textContent = likeTxt(likeCount(p)); });
        if (p) document.querySelectorAll('[data-hc="' + t.dataset.id + '"]').forEach((x) => { x.innerHTML = icon("heart", "xs") + likeCount(p); });
      }
      toast(i >= 0 ? (soon ? "오픈 알림을 껐어요." : "찜을 풀었어요.") : soon ? "오픈하면 가장 먼저 알려 드릴게요." : "찜한 강의에 담았어요.");
      return;
    }
    if (v === "topic") {
      const k = t.dataset.t, mine = myTopics().slice(), i = mine.indexOf(k), tv = (V().topicVotes = V().topicVotes || {});
      if (i >= 0) { mine.splice(i, 1); if (!SRV()) tv[k] = Math.max(0, (tv[k] || 1) - 1); } else { mine.push(k); if (!SRV()) tv[k] = (tv[k] || 0) + 1; }
      setTopics(mine); document.querySelectorAll('[data-v="topic"]').forEach((x) => { if (x.dataset.t !== k) return; x.classList.toggle("on", i < 0); x.setAttribute("aria-pressed", String(i < 0)); });
      if (route().path[0] === "my") keepScroll();
      toast(i >= 0 ? "‘" + k + "’ 찜을 풀었어요." : "‘" + k + "’ 클래스가 열리면 알려 드릴게요."); return;
    }
    if (v === "rail") { e.preventDefault(); const el = document.getElementById(t.dataset.r); if (el) { const r = railStep(el); el.scrollBy({ left: Number(t.dataset.d) * r.step * r.per, behavior: "smooth" }); } return; }
    if (v === "slide") { e.preventDefault(); slide(Number(t.dataset.d)); return; }
    if (v === "slide-to") { e.preventDefault(); slide(0, Number(t.dataset.i)); return; }
    if (v === "pause") { ui.paused = !ui.paused; clearInterval(ui.timer); if (!ui.paused) ui.timer = setInterval(() => slide(1), 5000); t.innerHTML = ui.paused ? icon("play", "xs") : PAUSE; t.setAttribute("aria-label", ui.paused ? "자동 넘김 켜기" : "자동 넘김 멈추기"); return; }
    if (v === "drawer") { drawer(); return; }
    if (v === "acct") { if (m) modal("내 계정", acctBody(m), "vd-modal-acct"); else ROUTE.hash = "#/vod/login"; return; }
    if (v === "ab-mq") { ui.abPaused = !ui.abPaused; const mq = document.querySelector(".ab-mq"), tr = mq && mq.querySelector(".ab-mq-track"); if (mq) mq.classList.toggle("paused", ui.abPaused); if (tr) tr.style.animationPlayState = ui.abPaused ? "paused" : "running"; t.textContent = ui.abPaused ? "움직임 다시 켜기" : "움직임 멈추기"; t.setAttribute("aria-pressed", String(ui.abPaused)); return; }
    if (v === "hcat") { ui.hcat = t.dataset.k; const box = document.getElementById("vd-hcat"); if (box) { box.innerHTML = catSecBody(); hydrate(box); wireRails(); wireCounts(); } return; }
    if (v === "ab-slide") { ui.abSlide = ((ui.abSlide || 0) + Number(t.dataset.d) + AB_SLIDES.length) % AB_SLIDES.length; const sl = ui.abSlide, c = document.querySelector(".ab-card"), n = document.querySelector(".ab-car-ctl small"); if (c) { c.innerHTML = "<small>" + String(sl + 1).padStart(2, "0") + " / 03</small><b>" + AB_SLIDES[sl][0] + "<br>" + AB_SLIDES[sl][1] + "</b><p>" + AB_SLIDES[sl][2].replace(/\n/g, "<br>") + "</p>"; c.classList.remove("in"); void c.offsetWidth; c.classList.add("in"); } if (n) n.textContent = String(sl + 1).padStart(2, "0") + " / 03"; return; }
    if (v === "logout") {
      if (SRV()) { closeModal(); authApi("logout").then(() => DB.remote.logout("student")).catch(() => {}).then(() => { try { DB.session.setStudent(null); } catch (e) {} return DB.remote.refresh(); }).then(() => { toast("로그아웃했어요."); ROUTE.hash = "#/vod"; render(); }); return; }
      setMe(null); closeModal(); toast("로그아웃했어요."); ROUTE.hash = "#/vod"; render(); return;
    }
    if (v === "print") { window.print(); return; }
    if (v === "jump") { const s = document.getElementById(t.dataset.to); if (s) window.scrollTo({ top: s.getBoundingClientRect().top + window.scrollY - 130, behavior: "smooth" }); return; }
    if (v === "copy") { const tx = t.dataset.t || ""; (navigator.clipboard ? navigator.clipboard.writeText(tx) : Promise.reject()).then(() => toast("계좌번호를 복사했어요. " + tx), () => toast("계좌번호: " + tx)); return; }
    if (v === "share") { const u = location.href; if (navigator.clipboard) navigator.clipboard.writeText(u).then(() => toast("주소를 복사했어요."), () => toast("주소: " + u)); else toast("주소: " + u); return; }
    if (v === "refund") { modal("환불 규정", '<div class="vd-modal-b">' + refundHtml() + "</div>"); return; }
    if (v === "legal") { const S = DB.siteInfo ? DB.siteInfo() : {}, k = t.dataset.k, href = k === "terms" ? S.terms : k === "privacy" ? S.privacy : ""; if (/^https?:\/\//i.test(href || "")) { window.open(href, "_blank", "noopener"); return; } const Lg = (window.CLASS_LEGAL || {})[k]; modal(Lg ? Lg[0] : "약관", '<div class="vd-modal-b vd-legal">' + (Lg ? (window.CLASS_LEGAL_HTML ? window.CLASS_LEGAL_HTML(Lg[1]) : esc(Lg[1])) : "정식 오픈 때 올려요.") + "</div>"); return; }
    if (v === "pl-up") { if (!m) { toast("로그인하면 공감할 수 있어요.", "warn"); return; } const x = V().pledges.find((y) => y.id === t.dataset.id); if (!x) return; x.upBy = x.upBy || []; const i = x.upBy.indexOf(m.id); if (i >= 0) { x.upBy.splice(i, 1); x.up = Math.max(0, (x.up || 1) - 1); } else { x.upBy.push(m.id); x.up = (x.up || 0) + 1; } save(); keepScroll(); return; }
    if (v === "pl-del") { const x = V().pledges.find((y) => y.id === t.dataset.id); if (!x || !m || x.mid !== m.id) return; V().pledges.splice(V().pledges.indexOf(x), 1); save(); keepScroll(); toast("다짐을 지웠어요."); return; }
    if (v === "pw-eye") { const inp = t.parentNode.querySelector("input"); if (!inp) return; const show = inp.type === "password"; inp.type = show ? "text" : "password"; t.innerHTML = icon(show ? "eyeOff" : "eye", "sm"); t.setAttribute("aria-label", show ? "비밀번호 숨기기" : "비밀번호 보기"); return; }
    if (v === "kakao") { kakaoStart(); return; }
    if (v === "svc") { e.preventDefault(); svcSwitch(t.dataset.k); return; }
    if (v === "dgl-pick") { if (window.DG_LOGIN) window.DG_LOGIN.setPick(t.dataset.id); dglPaint(true); return; }
    if (v === "dgl-change") { if (window.DG_LOGIN) window.DG_LOGIN.setPick(""); dglPaint(false); return; }
    if (v === "pg-ok" || v === "pg-no") { if (pgWait) pgWait(v === "pg-ok"); return; }
    if (v === "kk-all") { document.querySelectorAll("[data-kk]").forEach((x) => { x.checked = t.checked; }); return; }
    if (v === "kk-ok") { kakaoOk(); return; }
    if (v === "kk-demo") { const d = V().members.find((x) => x.id === "vm-demo"); if (!d) { toast("체험 계정이 없어요.", "warn"); return; } kakaoIn(d, "체험 계정으로 로그인했어요."); return; }
    if (v === "pw-find") { modal("비밀번호 찾기", '<div class="vd-modal-b vd-form"><p class="vd-muted">가입한 이메일을 적으면 비밀번호를 다시 정하는 링크를 보내 드려요.</p><label>이메일<input id="vd-find-mail" type="email" placeholder="example@doogoclass.com"></label><button type="button" class="vd-btn vd-btn-p vd-btn-xl" data-v="pw-send">링크 보내기</button></div>'); return; }
    if (v === "pw-send") { closeModal(); toast("시안이라 메일은 가지 않아요. 체험 계정 비밀번호는 vod예요."); return; }
    if (v === "auth-faq") { modal("로그인 · 가입 자주 묻는 질문", '<div class="vd-modal-b">' + [["두잉고 계정으로 로그인할 수 있나요?", "아니요. DOOGO CLASS는 VOD 수강생 계정을 따로 써요. 두잉고 기수 수강생은 두잉고 로그인을 이용해 주세요."], ["카카오로 가입했는데 이메일 로그인이 안 돼요.", "카카오로 가입한 계정은 ‘카카오로 1초 만에 시작하기’로 로그인해 주세요."], ["비밀번호를 잊었어요.", "로그인 화면의 ‘비밀번호 찾기’에서 가입한 이메일로 재설정 링크를 받을 수 있어요."]].map((f) => '<details class="vd-faq"><summary><b>Q</b><span>' + f[0] + "</span>" + icon("chevDown", "sm") + "</summary><p>" + f[1] + "</p></details>").join("") + "</div>"); return; }
    if (v === "agree-all") { const f = t.closest("form"); if (f) { f.agree.checked = t.checked; f.mkt.checked = t.checked; authReady(f); } return; }
    if (v === "pt-all") { const f = t.closest("form"), r = f && coCalc(f); if (r) { f.points.value = Math.floor(r.maxPt / 1) || 0; coPaint(f); } return; }
    if (v === "qty") { const f = t.closest("form"), q = f && f.qty; if (q) { q.value = String(Math.max(1, Math.min(Number(q.max) || BOOK_MAX, (Number(q.value) || 1) + Number(t.dataset.d || 0)))); coPaint(f); } return; }
    if (v === "addr-find") { e.preventDefault(); addrFind(t); return; }
    if (v === "ship-edit") { const o = V().orders.find((x) => x.no === t.dataset.no); if (!o || !m || o.mid !== m.id || !o.ship) return; if (["ready", "wait"].indexOf(shipStOf(o)) < 0) { toast("이미 책을 준비하고 있어 배송지를 바꿀 수 없어요. 고객센터로 알려 주세요.", "warn"); return; }
      modal("배송지 바꾸기", '<form class="vd-modal-b vd-shipedit" data-vd-shipedit="' + esc(o.no) + '"><p class="vd-muted">책을 보내기 전까지 바꿀 수 있어요.</p>' + shipFields(o.ship, "e") + '<label class="vd-co-keep"><input type="checkbox" name="esave" checked><span>다음 주문에도 이 배송지 쓰기</span></label><p class="vd-err" data-se-err role="alert"></p><button type="submit" class="vd-btn vd-btn-p vd-btn-xl">배송지 저장</button></form>', "vd-modal-sm"); return; }
    if (v === "dl") { const p = product(t.dataset.p); if (p && m && owns(m.id, p.id)) { const o = ownOrder(m.id, p.id); if (o && !o.dlAt && typeOf(p) === "ebook") { o.dlAt = now(); save(); } download(p, t.dataset.g != null ? Number(t.dataset.g) : null); } return; }
    if (v === "dl-none") { e.preventDefault(); toast("시안이라 첨부 파일은 정식 오픈 때 연결돼요."); return; }
    if (v === "ord-cancel" && SRV()) { const o = V().orders.find((x) => x.no === t.dataset.no); if (!o || !m || o.mid !== m.id || o.status !== "pending") return; t.disabled = true; payApi("cancelPending", { no: o.no }).then((r) => { if (!r || !r.ok) { t.disabled = false; toast((r && r.message) || "취소하지 못했어요.", "warn"); return; } return DB.remote.refresh().then(() => { keepScroll(); toast("주문을 취소했어요." + (o.mcid || o.pointOff ? " 쓴 쿠폰 · 포인트를 돌려드렸어요." : "") + " 환불 · 취소 내역에 남아요."); }); }); return; }
    if (v === "ord-cancel") { const o = V().orders.find((x) => x.no === t.dataset.no); if (!o || !m || o.mid !== m.id || o.status !== "pending") return; const at = now(); restoreOrder(o); Object.assign(o, { status: "canceled", canceledAt: at, canceledBy: "member" }); V().orders.filter((x) => x.grp === o.no && x.status === "pending").forEach((x) => { restoreOrder(x); Object.assign(x, { status: "canceled", canceledAt: at, canceledBy: "member" }); }); save(); keepScroll(); toast("주문을 취소했어요." + (o.mcid || o.pointOff ? " 쓴 쿠폰 · 포인트를 돌려드렸어요." : "") + " 환불 · 취소 내역에 남아요."); return; }
    // 0원 신청(무료 LIVE · 0원 결제) 취소: 강의 전까지 · 자리를 돌려줘요
    if (v === "ord-cancel0") { const o = V().orders.find((x) => x.no === t.dataset.no), p = o && product(o.pid); if (!o || !m || o.mid !== m.id || o.status !== "paid" || o.amount > 0 || (p && eventPast(p))) return; if (t.dataset.arm !== "1") { t.dataset.arm = "1"; t.textContent = "한 번 더 누르면 취소"; return; } restoreOrder(o); Object.assign(o, { status: "canceled", canceledAt: now(), canceledBy: "member" }); save(); keepScroll(); toast("신청을 취소했어요." + (o.mcid || o.pointOff ? " 쓴 쿠폰 · 포인트를 돌려드렸어요." : "")); return; }
    // 환불 요청: 사유를 남기면 마스터 ‘환불 요청’ 목록에 올라가요
    if (v === "rf-now") { const o = V().orders.find((x) => x.no === t.dataset.no); if (!o || !m || o.mid !== m.id) return; const q = instantOf(o); if (!q.ok) { toast(q.why || "바로 취소할 수 없는 주문이에요. 환불 요청을 남겨 주세요.", "warn"); return; } const r = rfSet(), adds = r.addons ? V().orders.filter((x) => x.grp === o.no && x.status === "paid" && (!x.coach || !(Number(x.coach.used) > 0))) : [], tot = o.amount + adds.reduce((a, x) => a + x.amount, 0);
      modal("결제 취소 · 100% 환불", '<div class="vd-modal-b vd-rfnow"><p class="vd-rfq-t"><b>' + esc(o.title) + "</b>" + (optTxt(o) ? "<small>" + esc(optTxt(o)) + "</small>" : "") + "<span>결제 " + won(o.amount) + " · " + esc(DB.date.fmtFull(DB.date.toStr(new Date(o.paidAt || o.at)))) + "</span></p>" +
        '<div class="vd-rfnow-box"><b>' + won(tot) + "</b><span>전액 돌려드려요</span></div><ul class=\"vd-rfnow-l\">" + "<li>" + icon("check", "xs") + esc(q.why) + "</li>" + (adds.length ? "<li>" + icon("check", "xs") + "함께 결제한 " + adds.map((x) => esc(optTxt(x) || x.title)).join(", ") + "도 같이 취소돼요.</li>" : "") + (r.restore && (o.mcid || o.pointOff) ? "<li>" + icon("check", "xs") + "결제에 쓴 쿠폰 · 포인트도 돌려드려요.</li>" : "") + "<li>" + icon("check", "xs") + "취소하면 수강 권한이 바로 사라져요.</li><li>" + icon("clock", "xs") + "카드 승인 취소는 카드사에 따라 3~5영업일 걸려요.</li></ul>" +
        '<div class="vd-rfnow-a"><button type="button" class="vd-btn vd-btn-o" data-v="close">그만두기</button><button type="button" class="vd-btn vd-btn-p" data-v="rf-now-ok" data-no="' + esc(o.no) + '">결제 취소하고 환불받기</button></div></div>'); return; }
    if (v === "rf-now-ok") { const o = V().orders.find((x) => x.no === t.dataset.no); if (!o || !m || o.mid !== m.id || !instantOf(o).ok) { closeModal(); return; } t.disabled = true; t.textContent = "취소하는 중…"; rfCancel(o).then((amt) => { closeModal(); render(); toast(won(amt) + "을 환불했어요. 카드사에 따라 3~5영업일 안에 돌아와요." + (o.pg && o.pg.st === "mock" ? " (시안 · 실제 카드 취소 없음)" : "")); }, (er) => { t.disabled = false; t.textContent = "결제 취소하고 환불받기"; toast(String((er && er.message) || "취소하지 못했어요. 고객센터로 문의해 주세요."), "warn"); }); return; }
    if (v === "rf-req") { const o = V().orders.find((x) => x.no === t.dataset.no); if (!o || !m || o.mid !== m.id || o.status !== "paid") return; modal(o.ship ? (shipStOf(o) === "prep" ? "주문 취소 요청" : "반품 · 교환 요청") : "환불 요청", '<form class="vd-modal-b vd-rfq" data-vd-rfreq data-no="' + esc(o.no) + '"><p class="vd-rfq-t"><b>' + esc(o.title) + "</b>" + (optTxt(o) ? "<small>" + esc(optTxt(o)) + "</small>" : "") + "<span>결제 " + won(o.amount) + " · " + esc(DB.date.fmtFull(DB.date.toStr(new Date(o.paidAt || o.at)))) + "</span></p>" +
      (o.ship ? '<p class="vd-rfq-bk">' + icon("truck", "xs") + "<span>" + (shipStOf(o) === "prep" ? "책을 준비하고 있어요. 보내기 전이면 전액 환불해 드려요." : "받은 날부터 7일 안에 반품할 수 있어요. 단순 변심은 왕복 배송비(" + won(Number(shipSet().returnFee) || 0) + ")를 빼고, 파손 · 파본 · 잘못 보낸 책은 전액 환불하거나 바꿔 드려요.") + "</span></p>" : "") +
      '<div class="vd-rfq-why">' + (o.ship ? (shipStOf(o) === "prep" ? ["단순 변심", "다른 책으로 다시 주문", "배송지를 잘못 적었어요", "기타"] : ["단순 변심 (반품)", "파손 · 파본", "잘못 보낸 책", "배송이 오지 않았어요", "기타"]) : ["단순 변심", "생각한 내용과 달라요", "중복 결제", "강의 재생 · 오류", "기타"]).map((x, i) => '<label><input type="radio" name="why" value="' + x + '"' + (i === 0 ? " checked" : "") + "><span>" + x + "</span></label>").join("") + "</div>" +
      '<textarea name="text" rows="3" maxlength="300" placeholder="자세한 사유를 적어 주시면 더 빨리 처리돼요 (선택)"></textarea>' +
      (o.method === "bank" || o.method === "vbank" ? '<div class="vd-rfq-acct"><b>환불 받을 계좌</b><small>' + (o.method === "vbank" ? "가상계좌" : "무통장 입금") + " 결제는 이 계좌로 돌려드려요. 본인 명의 계좌를 적어 주세요.</small>" + acctFields((o.refundReq && o.refundReq.acct) || null) + "</div>" : "") +
      '<p class="vd-err" data-rfq-err></p><p class="vd-muted">' + icon("alert", "xs") + " 환불 금액은 환불 규정(결제일 · 들은 강의 수)에 따라 정해져요. 영업일 1~3일 안에 처리하고 결과를 알려 드려요.</p>" +
      '<button type="submit" class="vd-btn vd-btn-p vd-btn-xl">' + (o.ship ? "요청 보내기" : "환불 요청 보내기") + "</button></form>", "vd-modal-sm"); return; }
    if (v === "rf-undo") { const o = V().orders.find((x) => x.no === t.dataset.no); if (!o || !m || o.mid !== m.id || !o.refundReq || typeof o.refundReq !== "object") return; delete o.refundReq; save(); keepScroll(); toast("환불 요청을 거둬들였어요."); return; }
    if (v === "rv-edit") { const rv = V().reviews.find((x) => x.id === t.dataset.id && x.mid === (me() || {}).id); if (!rv) return; modal("후기 고치기", '<form class="vd-modal-b vd-rv-edit" data-vd-rvedit="' + esc(rv.id) + '"><div class="vd-rv-stars" role="radiogroup" aria-label="별점">' + [5, 4, 3, 2, 1].map((n) => '<label><input type="radio" name="rating" value="' + n + '"' + (rv.rating === n ? " checked" : "") + "><span>" + n + "점</span></label>").join("") + '</div><textarea name="text" rows="5" maxlength="1000" aria-label="후기">' + esc(rv.text) + '</textarea><button type="submit" class="vd-btn vd-btn-p">저장</button></form>'); return; }
    if (v === "rv-del") { const rv = V().reviews.find((x) => x.id === t.dataset.id && x.mid === (me() || {}).id); if (!rv) return; if (t.dataset.arm !== "1") { t.dataset.arm = "1"; t.textContent = "한 번 더 누르면 지워요"; setTimeout(() => { if (t.isConnected) { t.dataset.arm = ""; t.textContent = "지우기"; } }, 3000); return; } V().reviews.splice(V().reviews.indexOf(rv), 1); save(); render(); toast("후기를 지웠어요. 받은 포인트는 그대로예요 (다시 써도 추가 적립은 없어요)."); return; }
    if (v === "rcpt-print") { document.body.classList.add("vd-printing"); window.print(); setTimeout(() => document.body.classList.remove("vd-printing"), 500); return; }
    if (v === "receipt") { const o = V().orders.find((x) => x.no === t.dataset.no); if (!o) return; modal("결제 영수증", '<div class="vd-modal-b vd-rcpt2">' + rcptHtml(o) + '<div class="rc-acts" data-pdf-hide><button type="button" class="vd-btn vd-btn-p vd-btn-xl" data-v="rcpt-pdf" data-no="' + esc(o.no) + '">' + icon("download", "sm") + 'PDF로 내려받기</button></div></div>', "vd-modal-rcpt"); return; }
    if (v === "rcpt-pdf") { const el = document.getElementById("rc-doc"); if (window.DGFILE) window.DGFILE.pdfBtn(t, el, "DOOGO-CLASS-영수증-" + t.dataset.no + ".pdf", { width: 760, margin: 12, title: "DOOGO CLASS 영수증 " + t.dataset.no }, (msg) => toast(msg)); return; }
    if (v === "preview") {
      const p = product(t.dataset.p), l = p && lessons(p).find((x) => x.id === t.dataset.l);
      if (!p) return;
      modal((typeOf(p) === "ebook" ? "미리보기 · " : "맛보기 · ") + (l ? l.title : ""), '<div class="vd-modal-video">' + (typeOf(p) === "ebook" ? '<div class="vd-pl-ph">' + icon("book") + "<b>" + esc(l ? l.title : "") + "</b><small>전자책 미리보기 페이지는 정식 오픈 때 PDF로 연결해요</small></div>" : l ? videoHtml(l, true) : "") + '</div><div class="vd-modal-f">' + (p.status === "on" ? '<a class="vd-btn vd-btn-p" href="#/vod/checkout/' + esc(p.id) + '" data-v="close">' + (priceOf(p) === 0 ? "무료로 수강신청" : typeOf(p) === "ebook" ? "구매하기" : "수강신청 하기") + "</a>" : '<button type="button" class="vd-btn vd-btn-o" data-v="close">닫기</button>') + "</div>");
      return;
    }
    if (v === "done") {
      if (!m) return;
      const p = product(t.dataset.p), pr = prog(m.id, t.dataset.p); pr.done[t.dataset.l] = true; logStudy(m.id); save();
      const lz = lessons(p), i = lz.findIndex((x) => x.id === t.dataset.l), next = lz[i + 1];
      if (next) ROUTE.hash = "#/vod/learn/" + p.id + "/" + next.id; else { render(); toast(pctDone(m.id, p.id) === 100 ? "모든 강의를 완료했어요! 후기도 남겨 주세요." : "완료했어요."); }
    }
  });
  document.addEventListener("keydown", (e) => { if (isActive() && e.key === "Escape" && document.querySelector("#modal-root .vd-modal-bg")) closeModal(); });
  document.addEventListener("input", (e) => {
    if (!isActive()) return;
    const f = e.target.closest && e.target.closest("[data-vd-pledge]"); if (f) { const n = f.querySelector("[data-pl-n]"); if (n) n.textContent = e.target.value.length; return; }
    const a = e.target.closest && e.target.closest("[data-vd-auth]"); if (a) { authReady(a); return; }
    const co = e.target.closest && e.target.closest("[data-vd-pay]"); if (co && (e.target.name === "points" || e.target.name === "qty")) coPaint(co);
  });
  document.addEventListener("submit", (e) => {
    if (!isActive()) return;
    const f = e.target;
    if (f.matches("[data-vd-search]")) { e.preventDefault(); ROUTE.hash = "#/vod/search?q=" + encodeURIComponent(f.q.value.trim()); return; }
    if (f.matches("[data-vd-auth]")) { e.preventDefault(); doAuth(f); return; }
    if (f.matches("[data-vd-dgl]")) { e.preventDefault(); doDgLogin(f); return; }
    if (f.matches("[data-vd-pay]")) { e.preventDefault(); doPay(f); return; }
    if (f.matches("[data-vd-shipedit]")) { e.preventDefault(); doShipEdit(f); return; }
    if (f.matches("[data-vd-review]")) { e.preventDefault(); doReview(f); return; }
    if (f.matches("[data-vd-pledge]")) { e.preventDefault(); doPledge(f); return; }
    if (f.matches("[data-vd-coupon]")) { e.preventDefault(); doCoupon(f); return; }
    if (f.matches("[data-vd-iq]")) { e.preventDefault(); doInquiry(f); return; }
    if (f.matches("[data-vd-rfreq]")) { e.preventDefault(); const m = me(), o = V().orders.find((x) => x.no === f.dataset.no); if (!m || !o || o.mid !== m.id || o.status !== "paid") return; let acct = null; if (o.method === "bank" || o.method === "vbank") { const r = acctRead(f); if (r.err) { const er = f.querySelector("[data-rfq-err]"); if (er) er.textContent = r.err; return; } acct = r.acct; } o.refundReq = Object.assign({ at: now(), by: "member", why: (f.querySelector("input[name=why]:checked") || {}).value || "기타", text: f.text.value.trim().slice(0, 300) }, acct ? { acct } : {}); save(); closeModal(); render(); toast("환불 요청을 보냈어요. 처리 결과는 주문 · 결제 내역에서 볼 수 있어요."); return; }
    if (f.matches("[data-vd-rc]")) { e.preventDefault(); doRecruit(f); return; }
    if (f.matches("[data-vd-acct]")) { e.preventDefault(); doAcct(f); return; }
    if (f.matches("[data-vd-rvedit]")) { e.preventDefault(); const rv = V().reviews.find((x) => x.id === f.dataset.vdRvedit && x.mid === (me() || {}).id), tx = f.text.value.trim(); if (!rv) return; if (tx.length < 10) { toast("후기는 10자 이상 적어 주세요.", "warn"); return; } rv.text = tx; rv.rating = Number((f.querySelector("input[name=rating]:checked") || {}).value) || rv.rating; rv.editedAt = now(); save(); closeModal(); render(); toast("후기를 고쳤어요."); }
  });
  document.addEventListener("toggle", (e) => { const d = e.target; if (!isActive() || !d.matches || !d.matches(".vd-iq-it[open]")) return; const x = (V().inquiries || []).find((y) => y.id === d.dataset.iq); if (x && x.answer && !x.seenAt) { x.seenAt = now(); save(); } }, true);
  document.addEventListener("input", (e) => { const t = e.target; if (!isActive() || !t.closest || !t.closest(".vd-iq2") || t.name !== "text") return; const c = document.querySelector("[data-iq-cnt]"); if (c) c.textContent = t.value.length + " / 1000"; });
  document.addEventListener("change", (e) => {
    if (!isActive()) return;
    if (e.target.name === "method") { const n = document.querySelector("[data-bank-note]"); if (n) n.classList.toggle("on", e.target.value === "bank"); }
    if (e.target.name === "coupon" || e.target.name === "points" || e.target.name === "plan" || e.target.name === "coach" || e.target.name === "qty") { const f = e.target.closest("[data-vd-pay]"); if (f) coPaint(f); }
    // 배송 요청사항 ‘직접 적기’를 고르면 입력 칸이 열려요
    if (e.target.matches && e.target.matches("[data-v-memo]")) { const x = e.target.form && e.target.form.elements[e.target.name + "2"]; if (x) { x.hidden = e.target.value !== "__"; if (!x.hidden) x.focus(); } }
    if (e.target.hasAttribute && (e.target.hasAttribute("data-plan") || e.target.hasAttribute("data-plan-coach"))) planSync(e.target);
    const a = e.target.closest && e.target.closest("[data-vd-auth]"); if (a) authReady(a);
    // 결제 동의: 전체 동의 ↔ 필수 3개
    if (e.target.hasAttribute && e.target.hasAttribute("data-agree-all")) { const fm = e.target.closest("form"); if (fm) fm.querySelectorAll("[data-agree-req]").forEach((x) => { x.checked = e.target.checked; }); }
    else if (e.target.hasAttribute && e.target.hasAttribute("data-agree-req")) { const fm = e.target.closest("form"), all = fm && fm.querySelector("[data-agree-all]"); if (all) all.checked = Array.from(fm.querySelectorAll("[data-agree-req]")).every((x) => x.checked); }
  });
  const pwOk = (s) => s.length >= 8 && /[A-Za-z]/.test(s) && /\d/.test(s);
  function doAuth(f) {
    const err = document.getElementById("vd-auth-err"), v = (k) => (f[k] ? f[k].value.trim() : ""), mode = f.dataset.vdAuth, list = V().members;
    const email = v("email").toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = "이메일 형식이 올바르지 않아요. 다시 확인해 주세요."; return; }
    if (SRV() && !(CFG && CFG.auth)) { err.textContent = "회원가입 · 로그인을 잠시 준비 중이에요. 운영 상담 채널로 문의해 주세요."; return; }
    if (remoteOn() && CFG && CFG.auth) {
      const b = { email, pw: f.pw.value, ts: tsToken(f) };
      if (mode !== "login") Object.assign(b, { name: v("name"), phone: v("phone"), mkt: !!(f.mkt && f.mkt.checked), agree: !!(f.agree && f.agree.checked), pw2: f.pw2 ? f.pw2.value : "", src: takeSrc() });
      authApi(mode === "login" ? "login" : "signup", b).then((r) => { if (!r || !r.ok) { err.textContent = (r && r.message) || "다시 시도해 주세요."; return; } const nm = (r.member && r.member.name) || "회원", cps = (r.member && r.member.coupons) || []; DB.remote.refresh().then(() => { toast(mode === "login" ? (nm + "님, 반가워요!") : "가입을 환영해요, " + nm + "님!" + (cps.length ? " 가입 쿠폰을 넣어 드렸어요." : "")); ROUTE.hash = f.dataset.next || "#/vod"; render(); }); });
      return;
    }
    if (mode === "login") {
      const hit = list.find((x) => x.email.toLowerCase() === email && x.pw === f.pw.value);
      if (!hit) { err.textContent = "이메일 또는 비밀번호가 맞지 않아요. 다시 확인해 주세요."; return; }
      if (hit.blocked) { err.textContent = "이용이 중지된 계정이에요. 고객센터로 문의해 주세요."; return; }
      setMe(hit.id); hit.lastLoginAt = now(); hit.loginN = (hit.loginN || 0) + 1; save(); toast(hit.name + "님, 반가워요!"); ROUTE.hash = f.dataset.next || "#/vod"; return;
    }
    if (!v("name")) { err.textContent = "이름을 적어 주세요."; return; }
    if (list.some((x) => x.email.toLowerCase() === email)) { err.textContent = "이미 가입한 이메일이에요. 로그인해 주세요."; return; }
    if (!/^[0-9+\-() ]{9,}$/.test(v("phone"))) { err.textContent = "휴대폰 번호를 확인해 주세요."; return; }
    if (!pwOk(f.pw.value)) { err.textContent = "비밀번호는 영문과 숫자를 섞어 8자 이상으로 정해 주세요."; return; }
    if (f.pw.value !== f.pw2.value) { err.textContent = "비밀번호 확인이 맞지 않아요."; return; }
    if (!f.agree.checked) { err.textContent = "필수 약관에 동의해 주세요."; return; }
    const mb = { id: DB.uid("vm"), via: "email", email, pw: f.pw.value, name: v("name"), phone: v("phone"), marketing: f.mkt.checked, consent: consentOf(f.mkt.checked), src: takeSrc(), kakaoCh: false, tags: [], notes: [], createdAt: now(), seenAt: now(), loginN: 1, points: 0, pointLog: [] };
    list.push(mb); (V().coupons || []).filter((c) => c.auto === "signup" && c.on !== false).forEach((c) => issueCoupon(mb.id, c));
    setMe(mb.id); save(); toast("가입을 환영해요, " + mb.name + "님! 5,000원 할인 쿠폰(30일)을 넣어 드렸어요."); ROUTE.hash = f.dataset.next || "#/vod";
  }
  function doPay(f) {
    const m = me(), err = document.getElementById("vd-pay-err"), r = coCalc(f);
    if (!r || !m) return;
    const p = r.p, k = r.k;
    if (k === "tea") { if (!f.d1.value) { err.textContent = "희망 날짜를 하나 이상 골라 주세요."; return; } if (f.topic.value.trim().length < 5) { err.textContent = "이야기하고 싶은 주제를 5자 이상 적어 주세요."; return; } }
    if (!f.agree.checked || (f.agree2 && !f.agree2.checked) || (f.agree3 && !f.agree3.checked)) { err.textContent = "필수 동의 3가지에 모두 체크해 주세요."; return; }
    if (k === "course" && seatsLeft(p) === 0) { err.textContent = "방금 자리가 모두 찼어요."; return; }
    let ship = null;
    if (isBook(p)) {
      const sr = shipRead(f, "s"); if (!sr.ok) { err.textContent = sr.msg; if (sr.el) sr.el.focus(); return; }
      ship = sr.a; const sl = stockLeft(p);
      if (sl != null && r.qty > sl) { err.textContent = sl ? "남은 재고가 " + sl + "권이에요. 수량을 줄여 주세요." : "방금 품절됐어요."; return; }
      if (f.ssave && f.ssave.checked) m.addr = Object.assign({}, ship);
    }
    const method = r.pr + r.coach + r.ship === 0 ? "free" : r.tot === 0 ? "point" : (f.method && f.method.value) || (SRV() ? "" : "card");
    if (!method) { err.textContent = payOpts().every((z) => z[3]) ? "결제를 준비하고 있어요. 문의하기로 알려 주시면 바로 도와드릴게요." : "결제 수단을 골라 주세요."; return; }
    const bn = f.name.value.trim(), bp = f.phone.value.trim().replace(/\s/g, ""), needTel = (k === "course" && /^(live|offline)$/.test(typeOf(p))) || k === "tea";
    if (needTel && (!bn || !/^01[016789]-?\d{3,4}-?\d{4}$/.test(bp))) { err.textContent = "주문자 이름과 휴대폰 번호(010-0000-0000)를 정확히 적어 주세요. 입장 · 일정 안내를 보내 드려요."; return; }
    if (bp && !/^[0-9-]{9,14}$/.test(bp)) { err.textContent = "휴대폰 번호를 숫자로 확인해 주세요."; return; }
    if (SRV()) { if (ship && f.ssave && f.ssave.checked) save(); srvPay(f, { p, k, r, method, bn, bp, m, ship }); return; }
    if (!m.name && bn) m.name = bn;
    if (!m.phone && bp) m.phone = bp;
    // 카드 · 간편결제는 결제창(포트원)을 먼저 — 결제가 끝난 뒤에만 주문을 만들어요 (창을 닫으면 주문 없음)
    if (!f.__pg && /^(card|kakao|toss|naver)$/.test(method) && r.tot > 0) {
      const btn = f.querySelector("button[type=submit]");
      if (btn) btn.disabled = true;
      const req = { pid: p.id, kind: k, plan: r.plan ? r.plan.d : null, coach: !!r.coach, mcid: r.y && r.cp ? r.y.x.id : "", points: r.pt || 0, method, qty: r.qty, ship, buyer: { name: bn || m.name, phone: bp || m.phone || "" }, tea: k === "tea" ? { d1: f.d1.value, d2: f.d2.value, slot: f.slot.value, mode: f.mode.value, topic: f.topic.value.trim().slice(0, 500) } : null, expect: r.tot };
      pgOpen({ title: p.title + (r.plan ? " · " + r.plan.label + " 수강권" : "") + (ship && r.qty > 1 ? " " + r.qty + "권" : ""), amount: r.tot, method, buyer: { name: bn || m.name, phone: bp || m.phone || "", email: m.email || "" }, req }).then((res) => {
        if (btn) btn.disabled = false;
        if (!res) { err.textContent = "결제를 취소했어요. 주문은 만들어지지 않았어요."; return; }
        f.__pg = res; doPay(f);
      }, (er) => { if (btn) btn.disabled = false; err.textContent = String((er && er.message) || "결제창을 열지 못했어요. 잠시 후 다시 시도해 주세요."); });
      return;
    }
    const pgr = f.__pg || null; f.__pg = null;
    const no = (pgr && pgr.server && pgr.server.no) || nextNo(), at = now(), status = method === "bank" ? "pending" : "paid", paidAt = status === "paid" ? at : null, ptMain = Math.min(r.pt, r.pr + r.ship - r.cp), ch = chOf(p);
    const o = { id: DB.uid("vo"), no, kind: k, mid: m.id, pid: p.id, title: p.title, list: r.list, sale: r.pr, amount: r.pr + r.ship - r.cp - ptMain, method, ch, share: shareFor(p, ch, !(k === "course" || k === "extend")), status, at, paidAt };
    if (ship) Object.assign(o, { qty: r.qty, unit: priceOf(p), shipFee: r.ship, ship: Object.assign({}, ship, { st: "ready" }) });
    if (bn || bp) o.buyer = { name: bn || m.name, phone: bp || m.phone || "" };
    if (status === "pending") { const bk = bankInfo(); Object.assign(o, { depositor: (f.depositor && f.depositor.value.replace(/\s+/g, "")) || m.name || "", dueAt: at + (Number(V().settings.payDays) || 3) * 864e5, bankTo: { bank: bk.bank, account: bk.account, holder: bk.holder } }); }
    if (k === "course" && r.plan) o.days = r.plan.d;
    if (k === "extend") o.days = 365;
    if (k === "coach") o.coach = { n: r.c.n, days: r.c.days, price: r.c.price, used: 0, qs: [] };
    if (k === "tea") { const tt = teaOf(p); o.tea = { min: tt.min, d1: f.d1.value, d2: f.d2.value, slot: f.slot.value, mode: f.mode.value, topic: f.topic.value.trim().slice(0, 500), st: "req" }; }
    if (r.y && r.cp) { r.y.x.usedAt = now(); r.y.x.orderNo = no; Object.assign(o, { mcid: r.y.x.id, couponName: r.y.c.name, couponOff: r.cp }); }
    if (r.pt) { addPoint(m, -r.pt, "결제에 사용 (" + no + ")"); if (ptMain) o.pointOff = ptMain; }
    if (pgr) o.pg = pgr.mock ? { st: "mock", at: pgr.at } : { st: "paid", paymentId: pgr.paymentId || "", txId: pgr.txId || "" };
    V().orders.push(o);
    // 수강권과 함께 산 1:1 코칭권은 따로 주문(같은 결제 grp)으로 남겨요 → 정산 비율 · 환불을 따로 계산
    const scNo = pgr && pgr.server && Array.isArray(pgr.server.orders) ? (pgr.server.orders.find((x) => x.kind === "coach") || {}).no : "";
    if (r.coach) { const ptC = r.pt - ptMain, oc = { id: DB.uid("vo"), no: scNo || nextNo(), grp: no, kind: "coach", mid: m.id, pid: p.id, title: p.title, coach: { n: r.c.n, days: r.c.days, price: r.c.price, used: 0, qs: [] }, list: r.coach, sale: r.coach, amount: r.coach - ptC, method, ch, share: shareFor(p, ch, true), status, at, paidAt }; if (ptC) oc.pointOff = ptC; if (o.pg) oc.pg = o.pg; V().orders.push(oc); }
    save();
    ROUTE.hash = "#/vod/order/" + o.no;
  }
  /** 정식 서버 결제: 금액 · 쿠폰 · 포인트는 서버가 다시 계산 → 카드 · 간편결제는 포트원 결제창, 무통장 · 0원은 바로 주문 → 서버 데이터 다시 받기 */
  function srvPay(f, x) {
    const { p, k, r, method, bn, bp, m, ship } = x, err = document.getElementById("vd-pay-err"), btn = f.querySelector("button[type=submit]");
    if (!(CFG && CFG.auth)) { err.textContent = "결제를 잠시 준비 중이에요. 운영 상담 채널로 문의해 주세요."; return; }
    const card = /^(card|kakao|toss|naver|transfer|vbank)$/.test(method) && r.tot > 0;
    if (card && !payServer()) { err.textContent = "카드 · 간편결제는 PG 심사가 끝나면 열려요. 지금은 무통장 입금으로 결제해 주세요."; return; }
    const buyer = { name: bn || m.name, phone: bp || m.phone || "" }, depositor = method === "bank" && f.depositor ? f.depositor.value.replace(/\s+/g, "") : "";
    if (method === "bank" && r.tot > 0 && !depositor) { err.textContent = "입금자명을 적어 주세요. 통장에 찍히는 이름이에요."; if (f.depositor) f.depositor.focus(); return; }
    const req = { pid: p.id, depositor, kind: k, plan: r.plan ? r.plan.d : null, coach: !!r.coach, mcid: r.y && r.cp ? r.y.x.id : "", points: r.pt || 0, method, ch: chOf(p), buyer, qty: r.qty, ship: ship || null, tea: k === "tea" ? { d1: f.d1.value, d2: f.d2.value, slot: f.slot.value, mode: f.mode.value, topic: f.topic.value.trim().slice(0, 500) } : null, expect: r.tot };
    if (btn) btn.disabled = true; err.textContent = "";
    const run = card ? pgOpen({ title: p.title + (r.plan ? " · " + r.plan.label + " 수강권" : "") + (ship && r.qty > 1 ? " " + r.qty + "권" : ""), amount: r.tot, method, buyer: Object.assign({ email: m.email || "" }, buyer), req })
      : payApi("prepare", req).then((j) => { if (!j || !j.ok) throw new Error((j && j.message) || "주문을 만들지 못했어요."); return { server: j }; });
    run.then((res) => {
      if (!res) { if (btn) btn.disabled = false; err.textContent = "결제를 취소했어요. 주문은 만들어지지 않았어요."; return; }
      const no = (res.server && res.server.no) || "";
      return DB.remote.refresh().then(() => { if (btn) btn.disabled = false; ROUTE.hash = "#/vod/order/" + no; render(); if (res.server && res.server.bank) toast(ship ? "주문을 받았어요. 입금이 확인되면 책을 준비해서 보내 드려요." : "주문을 받았어요. 입금이 확인되면 바로 이용할 수 있어요."); else if (res.server && res.server.vbank) toast(ship ? "가상계좌가 발급됐어요. 입금하면 책을 준비해서 보내 드려요." : "가상계좌가 발급됐어요. 입금하면 바로 이용할 수 있어요."); });
    }, (er) => { if (btn) btn.disabled = false; err.textContent = String((er && er.message) || "결제하지 못했어요. 잠시 후 다시 시도해 주세요."); });
  }
  /** 배송지 바꾸기 (보내기 전만 · 서버는 결제 완료 · 입금 대기 · 상품 준비 전인 주문만 받아요) */
  function doShipEdit(f) {
    const m = me(), o = m && V().orders.find((x) => x.no === f.dataset.vdShipedit), err = f.querySelector("[data-se-err]");
    if (!o || o.mid !== m.id || !o.ship) return;
    if (["ready", "wait"].indexOf(shipStOf(o)) < 0) { err.textContent = "이미 책을 준비하고 있어 바꿀 수 없어요. 고객센터로 알려 주세요."; return; }
    const r = shipRead(f, "e"); if (!r.ok) { err.textContent = r.msg; if (r.el) r.el.focus(); return; }
    Object.assign(o.ship, r.a, { editAt: now() }); if (f.esave && f.esave.checked) m.addr = Object.assign({}, r.a);
    save(); closeModal(); render(); toast("배송지를 바꿨어요.");
  }
  function doCoupon(f) {
    const m = me(), code = f.code.value.trim().toUpperCase(); if (!m) return;
    if (!code) { toast("쿠폰 코드를 적어 주세요.", "warn"); f.code.focus(); return; }
    const c = (V().coupons || []).find((x) => String(x.code || "").toUpperCase() === code);
    if (!c || c.on === false) { toast("쿠폰 코드를 다시 확인해 주세요.", "warn"); return; }
    if (c.endAt && c.endAt < today()) { toast("기간이 끝난 쿠폰이에요.", "warn"); return; }
    if (srvOn()) { payApi("claim", { code }).then((r) => { if (!r || !r.ok) { toast((r && r.message) || "쿠폰을 받지 못했어요.", "warn"); return; } DB.remote.refresh().then(() => { render(); toast("‘" + (r.name || c.name) + "’ 쿠폰을 받았어요."); }); }); return; }
    if (!issueCoupon(m.id, c)) { toast("이미 받은 쿠폰이에요.", "warn"); return; }
    save(); render(); toast("‘" + c.name + "’ 쿠폰을 받았어요.");
  }
  function doInquiry(f) {
    const m = me(), err = document.getElementById("vd-iq-err"); if (!m) return;
    if (!f.title.value.trim()) { err.textContent = "제목을 적어 주세요."; f.title.focus(); return; }
    if (f.text.value.trim().length < 5) { err.textContent = "내용을 5자 이상 적어 주세요."; f.text.focus(); return; }
    const cat = (f.querySelector("input[name=cat]:checked") || {}).value || "기타";
    (V().inquiries = V().inquiries || []).push({ id: DB.uid("vq"), mid: m.id, cat, order: f.order ? f.order.value : "", title: f.title.value.trim(), text: f.text.value.trim().slice(0, 1000), at: now(), answer: "", answeredAt: null });
    save(); ROUTE.hash = "#/vod/my/help?t=list"; render(); toast("문의를 남겼어요. 영업일 기준 하루 안에 답해 드릴게요.");
  }
  function doReview(f) {
    const m = me(), pid = f.dataset.vdReview, text = f.text.value.trim();
    if (!m || !owns(m.id, pid)) return;
    if (text.length < 10) { toast("후기는 10자 이상 적어 주세요.", "warn"); f.text.focus(); return; }
    V().reviews.push({ id: DB.uid("vr"), pid, mid: m.id, name: m.name.slice(0, 1) + "OO", rating: Number((f.querySelector("input[name=rating]:checked") || {}).value) || 5, text, at: now() });
    const pp = product(pid), paidC = V().orders.some((o) => o.mid === m.id && o.pid === pid && o.status === "paid" && o.amount > 0) || priceOf(pp || {}) > 0, got = (m.rvPts = m.rvPts || []).indexOf(pid) >= 0;
    const pt = paidC && !got ? Number(V().settings.reviewPoint) || 0 : 0; if (pt && !SRV()) { addPoint(m, pt, "후기 작성 적립"); m.rvPts.push(pid); }
    save(); render(); toast("후기를 남겨 주셔서 고마워요!" + (pt ? " " + pt.toLocaleString() + "P를 드렸어요." : ""));
    setTimeout(() => { const s = document.getElementById("vd-s-reviews"); if (s) window.scrollTo({ top: s.getBoundingClientRect().top + window.scrollY - 130 }); }, 30);
  }
  function doPledge(f) {
    const m = me(), text = f.text.value.trim();
    if (!m) { toast("로그인하면 다짐을 남길 수 있어요.", "warn"); ROUTE.hash = "#/vod/login?next=" + encodeURIComponent(ROUTE.hash); return; }
    if (text.length < 2) { toast("다짐을 한 줄 적어 주세요.", "warn"); f.text.focus(); return; }
    V().pledges.push({ id: DB.uid("vp"), pid: f.dataset.vdPledge, mid: m.id, nick: nickOf(m.id), text: text.slice(0, 500), at: now(), up: 0, upBy: [] });
    save(); render(); toast("다짐을 남겼어요. 끝까지 응원할게요!");
    setTimeout(() => { const s = document.getElementById("vd-s-pledge"); if (s) window.scrollTo({ top: s.getBoundingClientRect().top + window.scrollY - 130 }); }, 30);
  }
  function doAcct(f) {
    const m = me(), err = document.getElementById("vd-acct-err"); if (!m) return;
    if (!f.name.value.trim()) { err.textContent = "이름을 적어 주세요."; return; }
    if (SRV() && f.pw1 && f.pw1.value) {
      if (!pwOk(f.pw1.value)) { err.textContent = "새 비밀번호는 영문과 숫자를 섞어 8자 이상으로 정해 주세요."; return; }
      authApi("pw", { pw0: f.pw0.value, pw1: f.pw1.value }).then((r) => { if (!r || !r.ok) { err.textContent = (r && r.message) || "비밀번호를 바꾸지 못했어요."; return; } f.pw0.value = ""; f.pw1.value = ""; toast("비밀번호를 바꿨어요."); });
    } else if (f.pw1 && f.pw1.value) { if (f.pw0.value !== m.pw) { err.textContent = "지금 비밀번호가 맞지 않아요."; return; } if (!pwOk(f.pw1.value)) { err.textContent = "새 비밀번호는 영문과 숫자를 섞어 8자 이상으로 정해 주세요."; return; } m.pw = f.pw1.value; }
    const ph = f.phone.value.trim().replace(/\s/g, "");
    if (ph && !/^01[016789]-?\d{3,4}-?\d{4}$/.test(ph)) { err.textContent = "휴대폰 번호를 010-0000-0000 형식으로 적어 주세요."; return; }
    m.name = f.name.value.trim(); m.phone = ph; setConsent(m, f); save(); render(); toast("회원 정보를 저장했어요.");
  }
  /** 두잉고 강의실(VOD 버전)에서 쓰는 강의장 기능: 같은 진도 기록을 쓰므로 DOOGO CLASS 마이페이지 · 환불 계산과 진도가 맞아요 */
  function markDone(mid, pid, lid) { if (!mid || !owns(mid, pid)) return false; const pr = prog(mid, pid); pr.done[lid] = true; pr.last = lid; pr.seen = pr.seen || {}; if (!pr.seen[lid]) pr.seen[lid] = now(); logStudy(mid); save(); srvTrack(pid, lid, "done"); return true; }
  function markLast(mid, pid, lid) { if (!mid || !owns(mid, pid)) return; const pr = prog(mid, pid); pr.seen = pr.seen || {}; const fresh = !pr.seen[lid]; if (fresh) { pr.seen[lid] = now(); srvTrack(pid, lid, "seen"); } if (pr.last !== lid || fresh) { pr.last = lid; logStudy(mid); save(); } }
  Object.assign(window.VOD, { isBook, BOOK_MAX, shipFeeOf, shipSet, SHIP_DEF, CARRIERS, trackUrl, SHIP_ST, shipStOf, shipDoneAt, stockLeft, MOON_BOOK, RF_DEF, rfSet, usedOf, markMat, instantOf, rfApply, rfCancel, refundTbl, consentOf, CH3, chOn, HELP_FAQ_DEF, helpFaq, issueCoupon, addPoint, replayOk, isFreeEv, funnelOf, funnelTo, ebOf, gatedBy, basePrice, evEnd, eventPast, ebDayTxt, detailImgsOf, detailModeOf, insRate, rateOf, adSplitOf, adOf, shareOf, bizOn, bizShow, BIZ_DEF, teacherList, RAIL_DEF, homeRails, railAuto, railItems, viaOf, shareFor, chOf, CH_TXT, insAmt, supplyOf, baseOf, lSec, lLen, shSet, SH_DEF, launchOn, seedTiles, tileImg, imgAttr, hydrate, liveBanners, banLive, cmtOf, matPut, matOpen, markDone, markLast, videoHtml, fileList, chapOf, plansOf, defPlan, coachOf, teaOf, extendOf, extendPct, addonShare, accessEnd, daysLeft, canExtend, hadCourse, coachPasses, coachLeft, useCoach, giveBackCoach, teasOf, teaWhen, teaStTxt, TEA_MODE, TEA_ST, KIND, kindOf, isAccess, optTxt, icx, PLAN_DAYS, r1k });
  // 파일 크기 한도: 정식 서버는 3MB (Vercel 요청 한도), 시안은 20MB
  Object.defineProperty(window.VOD, "MAT_MAX", { get: () => (SRV() ? SRV_MAT_MAX : MAT_MAX), configurable: true });
  // 주소(경로)가 바뀌면 언제나 맨 위에서 시작 — 같은 화면 안에서 ?정렬 · 탭만 바뀔 때는 보던 자리 그대로
  const pathOf = () => ROUTE.hash.split("?")[0];
  pgDone = () => { render(); };
  window.VodApp = { mount() { loadCfg().then(() => { kkReturn(); pgReturn(); tsMount(); }); root.innerHTML = ""; ui.anim = true; ui.path = pathOf(); render(); if (ui.booted) toTop(); else window.scrollTo(0, 0); ui.booted = true; }, render() { const p = pathOf(), moved = p !== ui.path; ui.path = p; ui.anim = true; render(); if (moved) toTop(); if (CFG) tsMount(); } };
})();
