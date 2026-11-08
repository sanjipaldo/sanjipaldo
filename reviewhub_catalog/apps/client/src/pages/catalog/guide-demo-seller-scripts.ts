// 위탁셀러 사용법 안내 영상(애니메이션) 대본. 공급사 영상과 같은 형식(위 2줄 자막 · "위탁셀러 | 두고푸드" 표시 · 흰 화면 · 커서)입니다.
// 위탁셀러 거래 방식: 두고푸드 DB센터(doogofood.site) 단가표에서 상품을 고르고, 고객 주문이 들어오면 두고푸드 도매몰(발주오라,
// shop.baljuora.com/doogofood)에 주문을 넣습니다. 공급사 발주·출고·송장 등록은 두고푸드가 하고, 셀러는 송장을 받아 자기 판매처에 발송처리합니다.
// 도매몰 메뉴·상태·버튼 이름은 실제 도매몰과 같게 씁니다(주문 입력 › 단일 주문 입력·대량 주문 입력(엑셀), 주문 관리 › 주문 등록 현황·전체 주문 리스트·배송중·배송완료,
// CS 관리 › 취소·교환·반품 리스트, 주문대기 → 주문접수 → 발주완료 → 배송준비중 → 배송중 → 배송완료). 규칙은 공지사항(발주 마감·송장 안내·CS 기준)과 같습니다.
// 셀러 상호·고객·주문·금액은 모두 예시("하루마켓")입니다.
import { SELLER_SHOP_URL } from "@repo/shared/seller-guide";
import { DEMO_COVER_SCENE as cover, DEMO_END_SCENE as end, type DemoCatalogRow, type DemoOrderRow, type DemoScript } from "./guide-demo-scripts";

// 브라우저 주소 줄에 보일 도매몰 주소(https:// 제외)
export const SELLER_SHOP_HOST = SELLER_SHOP_URL.replace(/^https:\/\//, "");
const shop = (page: string) => `${SELLER_SHOP_HOST} › ${page}`;

const APPLE5: DemoCatalogRow = { name: "부사 사과 5kg (가정용)", code: "ass00121", emoji: "🍎", a: 21900, general: 23900, sale: "자율", ship: "무료", status: "판매중" };
const APPLE3: DemoCatalogRow = { name: "부사 사과 3kg (선물용)", code: "ass00122", emoji: "🍎", a: 14900, general: 16500, sale: "19,900원", ship: "무료", status: "판매중" };
const SHINANO: DemoCatalogRow = { name: "시나노골드 사과 3kg", code: "ass00140", emoji: "🍏", a: 18900, general: 20500, sale: "자율", ship: "3,500원", status: "품절" };
const APPLE_ROWS = [APPLE5, APPLE3, SHINANO];

// 도매몰 주문(예시 고객은 공급사 영상의 발주서와 같은 사람들)
const order = (index: number, patch: Partial<DemoOrderRow> = {}): DemoOrderRow => ({ ...ORDER_BASE[index], ...patch });
const ORDER_BASE: DemoOrderRow[] = [
  { no: "HM-1106-001", name: "김민지", item: "부사 사과 5kg", qty: 1, status: "주문대기", invoice: "681234567890" },
  { no: "HM-1106-002", name: "이서준", item: "부사 사과 3kg", qty: 2, status: "주문대기", invoice: "681234567891" },
  { no: "HM-1106-003", name: "박지우", item: "배 선물세트", qty: 1, status: "주문대기", invoice: "681234567892" },
  { no: "HM-1106-004", name: "최하은", item: "부사 사과 5kg", qty: 1, status: "주문대기", invoice: "681234567893" },
  { no: "HM-1106-005", name: "정도윤", item: "사과·배 혼합", qty: 1, status: "주문대기", invoice: "681234567894" },
  { no: "HM-1106-006", name: "강예린", item: "부사 사과 3kg", qty: 3, status: "주문대기", invoice: "681234567895" }
];

export const SELLER_DEMO_SCRIPTS: Record<string, DemoScript> = {
  "seller-overview": {
    id: "seller-overview",
    audience: "seller",
    scenes: [
      cover,
      {
        caption: { kicker: "두고푸드 위탁셀러라면", title: "**재고 없이** 판매해요" },
        duration: 4.8,
        actor: [[0, "seller"], [1.2, "doogo"]],
        view: { kind: "chat", date: "11월 6일 (금) 오전 9:10", ask: "재고 없이 두고푸드\n상품을 팔 수 있나요?", reply: "네, 단가표에서 상품을 고르고\n주문이 들어오면 도매몰에\n주문만 넣어 주세요.\n출고·송장 등록은 두고푸드가 해요.", replyAt: 1.2 }
      },
      {
        caption: { kicker: "누가 무엇을 하는지", title: "**순서**부터 볼게요" },
        duration: 4.8,
        actor: "doogo",
        view: {
          kind: "steps",
          tag: "두고푸드 · 위탁 판매 순서",
          intro: "이 순서로 진행돼요.",
          title: "위탁 판매 순서",
          focusWho: "seller",
          focusAt: 3.2,
          items: [
            { title: "단가표에서 상품 고르기", sub: "공급가·판매가·배송비 확인", who: "seller" },
            { title: "내 판매처에 상품 등록", sub: "상품 사진은 도매몰 자료실에서", who: "seller" },
            { title: "도매몰에 주문 입력", sub: "한 건씩 또는 엑셀로 한 번에", who: "seller" },
            { title: "공급사 발주·출고", sub: "정해진 발주 시간에 공급사로", who: "doogo" },
            { title: "송장 등록", sub: "출고 당일 오후부터 순차 등록", who: "doogo" }
          ]
        }
      },
      {
        caption: { kicker: "판매할 상품은", title: "**단가표**에서 골라요" },
        duration: 5.2,
        actor: "seller",
        view: {
          kind: "catalog",
          query: "사과",
          typeAt: 0.7,
          rows: APPLE_ROWS,
          focus: [{ at: 2.9, row: 0, field: "price", note: "도매몰에서는 내 거래 조건 단가로\n자동 주문돼요" }],
          status: "셀러가 단가표에서 상품을 찾고 있어요"
        }
      },
      {
        caption: { kicker: "주문이 들어오면", title: "**도매몰에 주문**만 넣어요" },
        duration: 4.6,
        actor: [[0, "seller"], [2.4, "doogo"]],
        view: {
          kind: "orders",
          page: "주문 등록 현황",
          rows: [order(0, { at: 0.4 }), order(1, { at: 0.9 }), order(2, { at: 1.4 })],
          changes: [{ at: 2.6, rows: "all", status: "주문접수" }],
          status: [[0, "셀러가 주문을 등록했어요"], [2.4, "두고푸드가 주문을 접수했어요"]]
        }
      },
      {
        caption: { kicker: "출고와 송장 등록은", title: "**두고푸드가** 해요" },
        duration: 4.8,
        actor: "doogo",
        view: {
          kind: "orders",
          page: "전체 주문 리스트",
          rows: [order(0, { status: "주문접수" }), order(1, { status: "주문접수" }), order(2, { status: "주문접수" })],
          changes: [{ at: 0.8, rows: "all", status: "배송준비중" }, { at: 2.2, rows: "all", status: "배송중" }],
          toast: { at: 2.5, text: "송장 3건이 등록됐어요" },
          status: [[0, "공급사가 포장·출고하고 있어요"], [2.2, "두고푸드가 송장을 등록했어요"]]
        }
      },
      {
        caption: { kicker: "송장을 받으면", title: "**발송처리**만 하면 끝" },
        duration: 4.4,
        actor: "seller",
        view: {
          kind: "done",
          badge: "오늘 주문 처리 완료",
          title: "11/6(금) 하루마켓 주문",
          rows: [
            { label: "도매몰 주문 입력", value: "3건" },
            { label: "주문 접수 · 공급사 발주", value: "두고푸드" },
            { label: "송장 등록", value: "3건 · 배송중" }
          ],
          message: "송장을 엑셀로 받아 내 판매처에\n발송처리만 하면 끝이에요."
        }
      },
      end
    ]
  },

  "seller-find": {
    id: "seller-find",
    audience: "seller",
    scenes: [
      cover,
      {
        caption: { kicker: "판매할 상품은", title: "**단가표**에 다 있어요" },
        duration: 4.6,
        actor: [[0, "seller"], [1.2, "doogo"]],
        view: { kind: "chat", date: "11월 6일 (금) 오전 9:20", ask: "어떤 상품을\n팔 수 있어요?", reply: "doogofood.site 단가표에\n판매 중인 상품이 모두 있어요.\n가격·배송비·판매기간도\n함께 볼 수 있어요.", replyAt: 1.2 }
      },
      {
        caption: { kicker: "상품명·상품코드로", title: "**검색**해서 찾아요" },
        duration: 4.4,
        actor: "seller",
        view: { kind: "catalog", query: "사과", typeAt: 0.7, rows: APPLE_ROWS, status: "셀러가 상품을 검색하고 있어요" }
      },
      {
        caption: { kicker: "공급가는 두 가지예요", title: "**A단가·일반공급가**" },
        duration: 4.2,
        actor: "seller",
        view: { kind: "catalog", query: "사과", rows: APPLE_ROWS, focus: [{ at: 0.7, row: 0, field: "price", note: "A단가: 제휴 조건이 적용된 단가\n일반공급가: 일반 판매자 기준" }], status: "셀러가 공급가를 보고 있어요" }
      },
      {
        caption: { kicker: "판매가는", title: "**자율**이 기본이에요" },
        duration: 4.4,
        actor: "seller",
        view: {
          kind: "catalog",
          query: "사과",
          rows: APPLE_ROWS,
          focus: [
            { at: 0.6, row: 0, field: "sale", note: "판매가 자율: 내 판매처 가격은\n내가 정해요" },
            { at: 2.3, row: 1, field: "sale", note: "지정 판매가: 안내된 금액으로\n판매해 주세요" }
          ],
          status: "셀러가 판매가를 보고 있어요"
        }
      },
      {
        caption: { kicker: "주문하기 전에", title: "**배송비·품절**도 봐요" },
        duration: 4.4,
        actor: "seller",
        view: {
          kind: "catalog",
          query: "사과",
          rows: APPLE_ROWS,
          focus: [
            { at: 0.6, row: 0, field: "ship", note: "배송비 무료 또는 금액 표시 ·\n누르면 배송 정책이 보여요" },
            { at: 2.3, row: 2, field: "status", note: "품절·시즌종료 상품은\n주문할 수 없어요" }
          ],
          status: "셀러가 배송비와 판매 상태를 보고 있어요"
        }
      },
      {
        caption: { kicker: "새 상품·제철 상품은", title: "**메뉴별로** 볼 수 있어요" },
        duration: 4.4,
        actor: "doogo",
        view: {
          kind: "checks",
          tag: "두고푸드 DB센터 · 메뉴",
          intro: "이 메뉴도 함께 보세요.",
          title: "상품 고를 때 보는 메뉴",
          items: [
            { title: "신규상품", sub: "최근 7일 새로 들어온 상품" },
            { title: "월별 제철상품", sub: "이번 달 제철 품목만 모아 보기" },
            { title: "가격변동 · 품절이슈", sub: "오늘 바뀐 가격과 품절 상품" },
            { title: "소싱 요청", sub: "찾는 상품이 없으면 요청하기" }
          ]
        }
      },
      {
        caption: { kicker: "상품 사진은", title: "**도매몰 자료실**에서 받아요" },
        duration: 4.2,
        actor: "seller",
        view: {
          kind: "done",
          badge: "상품 등록 준비",
          title: "내 판매처에 상품 등록하기",
          rows: [
            { label: "상품 사진", value: "도매몰 › 사진자료 다운로드" },
            { label: "상품 목록", value: "도매몰 › 엑셀 다운로드" },
            { label: "사용 범위", value: "두고푸드 상품 판매용" }
          ],
          message: "상품 이미지는 두고푸드 상품을\n판매할 때만 쓸 수 있어요."
        }
      },
      end
    ]
  },

  "seller-price": {
    id: "seller-price",
    audience: "seller",
    scenes: [
      cover,
      {
        caption: { kicker: "주문하기 전에", title: "**오늘 바뀐 것**부터 봐요" },
        duration: 4.6,
        actor: [[0, "seller"], [1.2, "doogo"]],
        view: { kind: "chat", date: "11월 6일 (금) 오전 8:50", ask: "가격이 바뀌면\n어떻게 알 수 있어요?", reply: "가격변동 메뉴에 매일 올라와요.\n품절된 상품은 품절이슈에서\n바로 확인할 수 있어요.", replyAt: 1.2 }
      },
      {
        caption: { kicker: "가격변동 메뉴에서", title: "**인상·인하**를 확인해요" },
        duration: 4.8,
        actor: "seller",
        view: {
          kind: "feed",
          mode: "price",
          items: [
            { name: "부사 사과 5kg (가정용)", code: "ass00121", emoji: "🍎", from: 21900, to: 22900, when: "오늘 08:30" },
            { name: "제주 감귤 3kg", code: "ass00312", emoji: "🍊", from: 12900, to: 11900, when: "오늘 08:30" },
            { name: "신고배 7.5kg 선물세트", code: "ass00231", emoji: "🍐", from: 39000, to: 41000, when: "오늘 08:30" }
          ],
          status: "셀러가 오늘 가격변동을 보고 있어요"
        }
      },
      {
        caption: { kicker: "내 판매처 가격은", title: "**엑셀로 받아** 바꿔요" },
        duration: 4.2,
        actor: "seller",
        view: {
          kind: "feed",
          mode: "price",
          items: [
            { name: "부사 사과 5kg (가정용)", code: "ass00121", emoji: "🍎", from: 21900, to: 22900, when: "오늘 08:30" },
            { name: "제주 감귤 3kg", code: "ass00312", emoji: "🍊", from: 12900, to: 11900, when: "오늘 08:30" },
            { name: "신고배 7.5kg 선물세트", code: "ass00231", emoji: "🍐", from: 39000, to: 41000, when: "오늘 08:30" }
          ],
          download: { at: 1.6, file: "1106 가격변동 공지.xlsx" },
          status: "셀러가 가격변동 엑셀을 받고 있어요"
        }
      },
      {
        caption: { kicker: "품절이슈 메뉴에서", title: "**품절 상품**을 확인해요" },
        duration: 4.4,
        actor: "seller",
        view: {
          kind: "feed",
          mode: "soldout",
          items: [
            { name: "샤인머스캣 2kg", code: "ass00410", emoji: "🍇", when: "11.6(금) 10:20 · 오늘 품절" },
            { name: "시나노골드 사과 3kg", code: "ass00140", emoji: "🍏", when: "11.5(목) 18:05 · 어제 품절" }
          ],
          status: "셀러가 품절 상품을 보고 있어요"
        }
      },
      {
        caption: { kicker: "매일 주문하기 전에", title: "**3분**이면 충분해요" },
        duration: 4.6,
        actor: "doogo",
        view: {
          kind: "checks",
          tag: "주문 전 확인",
          intro: "주문 전에 이렇게 확인하세요.",
          title: "매일 확인하기",
          items: [
            { title: "가격변동 확인", sub: "오늘과 지난 3일 바뀐 가격" },
            { title: "품절이슈 확인", sub: "품절 상품은 내 판매처에서 판매 중지" },
            { title: "내 판매처 가격 수정", sub: "가격변동 엑셀로 한 번에" },
            { title: "신규상품 등록", sub: "새로 들어온 상품 추가" }
          ]
        }
      },
      end
    ]
  },

  "seller-order": {
    id: "seller-order",
    audience: "seller",
    scenes: [
      cover,
      {
        caption: { kicker: "고객 주문이 들어오면", title: "**도매몰**에 주문을 넣어요" },
        duration: 4.8,
        actor: [[0, "seller"], [1.2, "doogo"]],
        view: { kind: "chat", date: "11월 6일 (금) 오전 9:30", ask: "주문이 들어오면\n어디에 넣어요?", reply: "두고푸드 도매몰에 로그인해서\n주문 입력 메뉴에 넣어 주세요.\n한 건씩도, 엑셀로 한 번에도 돼요.", replyAt: 1.2 }
      },
      {
        caption: { kicker: "도매몰 메뉴에서", title: "**주문 입력**을 눌러요" },
        duration: 3.4,
        actor: "seller",
        view: { kind: "menu", open: "주문 입력", target: "단일 주문 입력", clickAt: 2.2, status: "셀러가 도매몰 메뉴를 고르고 있어요" }
      },
      {
        caption: { kicker: "상품과 받는 분을 넣고", title: "**주문 등록**을 눌러요" },
        duration: 6.6,
        actor: "seller",
        view: {
          kind: "form",
          url: shop("단일 주문 입력"),
          heading: "단일 주문 입력",
          sub: "상품과 받는 분 정보를 입력해요",
          fields: [
            { label: "상품코드 · 상품명", value: "ass00121 부사 사과 5kg" },
            { label: "수량", value: "1" },
            { label: "받는 분 · 연락처", value: "김민지 · 010-2345-6789" },
            { label: "주소", value: "서울 마포구 월드컵로 12" },
            { label: "주문번호", value: "HM-1106-001" }
          ],
          submit: "주문 등록",
          done: "주문대기로 등록됐어요",
          status: "셀러가 주문을 입력하고 있어요"
        }
      },
      {
        caption: { kicker: "등록하기 전에", title: "**5가지**만 확인해요" },
        duration: 4.6,
        actor: "doogo",
        view: {
          kind: "checks",
          tag: "주문 입력 체크",
          intro: "이것만 확인하세요.",
          title: "주문 입력 전 확인",
          items: [
            { title: "상품코드 · 수량", sub: "단가표와 같은 상품코드로" },
            { title: "받는 분 이름·연락처·주소", sub: "잘못 적어 반송되면 보상되지 않아요" },
            { title: "보내는 사람(송하인)", sub: "내 상호·연락처로 적어요" },
            { title: "주문번호", sub: "같은 주문이 두 번 들어가지 않게" },
            { title: "발주 마감", sub: "상품별 마감시간 전 주문은 당일 접수" }
          ]
        }
      },
      {
        caption: { kicker: "등록한 주문은", title: "**주문 등록 현황**에서 봐요" },
        duration: 4.8,
        actor: [[0, "seller"], [2.2, "doogo"]],
        view: {
          kind: "orders",
          page: "주문 등록 현황",
          rows: [order(0, { at: 0.3 }), order(4, { status: "주문접수" }), order(5, { status: "주문접수" })],
          changes: [{ at: 2.4, rows: [0], status: "주문접수" }],
          toast: { at: 2.6, text: "주문이 접수됐어요" },
          status: [[0, "주문대기 · 접수를 기다리고 있어요"], [2.2, "두고푸드가 주문을 접수했어요"]]
        }
      },
      {
        caption: { kicker: "접수된 주문은", title: "**두고푸드가 발주**해요" },
        duration: 4.4,
        actor: "doogo",
        view: {
          kind: "done",
          badge: "주문 접수 완료",
          title: "HM-1106-001 · 김민지",
          rows: [
            { label: "주문 상태", value: "주문접수" },
            { label: "공급사 발주", value: "정해진 발주 시간에" },
            { label: "송장 등록", value: "출고 당일 오후부터" }
          ],
          message: "결제할 금액은 도매몰 위쪽\n'결제금액보기'에서 확인해요."
        }
      },
      end
    ]
  },

  "seller-excel": {
    id: "seller-excel",
    audience: "seller",
    scenes: [
      cover,
      {
        caption: { kicker: "주문이 많을 때는", title: "**엑셀로 한 번에**" },
        duration: 4.6,
        actor: [[0, "seller"], [1.2, "doogo"]],
        view: { kind: "chat", date: "11월 6일 (금) 오전 9:40", ask: "주문이 많으면\n한 건씩 넣어야 해요?", reply: "아니요, 주문서 엑셀을 올리면\n한 번에 등록돼요.\n상품은 처음 한 번만 연결하면 돼요.", replyAt: 1.2 }
      },
      {
        caption: { kicker: "도매몰 메뉴에서", title: "**대량 주문 입력**을 눌러요" },
        duration: 3.4,
        actor: "seller",
        view: { kind: "menu", open: "주문 입력", target: "대량 주문 입력(엑셀)", clickAt: 2.2, status: "셀러가 도매몰 메뉴를 고르고 있어요" }
      },
      {
        caption: { kicker: "내 판매처 주문서 엑셀을", title: "**그대로** 준비해요" },
        duration: 4.0,
        actor: "seller",
        view: { kind: "sheet", mode: "view", file: "하루마켓_주문_1106.xlsx", tab: "주문서", status: "셀러가 주문서 엑셀을 열었어요" }
      },
      {
        caption: { kicker: "엑셀을 올리면", title: "**상품 매칭** 후 등록해요" },
        duration: 6.0,
        actor: "seller",
        view: {
          kind: "upload",
          file: "하루마켓_주문_1106.xlsx",
          orders: 6,
          rows: [
            { mine: "[하루] 꿀사과 5kg", product: "ass00121 부사 사과 5kg", auto: true },
            { mine: "[하루] 꿀사과 3kg", product: "ass00122 부사 사과 3kg", auto: true },
            { mine: "[하루] 배 선물세트", product: "ass00231 배 선물세트", auto: false },
            { mine: "[하루] 사과·배 혼합", product: "ass00230 사과·배 혼합", auto: true }
          ],
          dropAt: 1.0,
          matchAt: 3.2,
          registerAt: 4.6,
          status: [[0, "셀러가 주문서를 올리고 있어요"], [4.7, "주문 6건이 주문대기로 등록됐어요"]]
        }
      },
      {
        caption: { kicker: "한 번 매칭한 상품은", title: "**다음부터 자동**이에요" },
        duration: 4.4,
        actor: "doogo",
        view: {
          kind: "checks",
          tag: "엑셀 주문 팁",
          intro: "이것만 기억하세요.",
          title: "엑셀 주문 체크",
          items: [
            { title: "상품 매칭", sub: "한 번 연결하면 다음부터 자동" },
            { title: "매칭 바꾸기", sub: "상품 관리 › 상품 매칭 리스트" },
            { title: "품절 상품", sub: "품절이슈에서 먼저 확인" },
            { title: "주문번호", sub: "같은 주문이 두 번 들어가지 않게" }
          ]
        }
      },
      {
        caption: { kicker: "올린 주문은", title: "**주문 등록 현황**에서 봐요" },
        duration: 4.6,
        actor: [[0, "seller"], [2.4, "doogo"]],
        view: {
          kind: "orders",
          page: "주문 등록 현황",
          rows: [order(0), order(1), order(2), order(3), order(4), order(5)],
          changes: [{ at: 2.6, rows: "all", status: "주문접수" }],
          status: [[0, "주문 6건 · 주문대기"], [2.4, "두고푸드가 6건을 접수했어요"]]
        }
      },
      end
    ]
  },

  "seller-tracking": {
    id: "seller-tracking",
    audience: "seller",
    scenes: [
      cover,
      {
        caption: { kicker: "출고가 되면", title: "**송장이 자동 등록**돼요" },
        duration: 4.8,
        actor: [[0, "seller"], [1.2, "doogo"]],
        view: { kind: "chat", date: "11월 6일 (금) 오후 5:10", ask: "송장번호는\n언제 나와요?", reply: "출고 당일 오후부터\n순차적으로 등록돼요.\n배송중 메뉴에서 확인하고\n엑셀로 받을 수 있어요.", replyAt: 1.2 }
      },
      {
        caption: { kicker: "도매몰 메뉴에서", title: "**주문 관리 › 배송중**" },
        duration: 3.4,
        actor: "seller",
        view: { kind: "menu", open: "주문 관리", target: "배송중", clickAt: 2.2, status: "셀러가 도매몰 메뉴를 고르고 있어요" }
      },
      {
        caption: { kicker: "배송중 주문의", title: "**송장을 엑셀로** 받아요" },
        duration: 5.0,
        actor: "seller",
        view: {
          kind: "orders",
          page: "배송중",
          rows: [order(0, { status: "배송중" }), order(1, { status: "배송중" }), order(2, { status: "배송중" }), order(3, { status: "배송중" })],
          actions: ["엑셀 다운로드"],
          select: { rows: "all", at: 1.0 },
          action: { label: "엑셀 다운로드", at: 2.2 },
          toast: { at: 2.4, text: "송장 엑셀을 받았어요" },
          status: "셀러가 송장을 확인하고 있어요"
        }
      },
      {
        caption: { kicker: "받은 송장을 내 판매처에", title: "**발송처리**하면 끝" },
        duration: 4.6,
        actor: "seller",
        view: { kind: "sheet", mode: "register", file: "배송중_송장_1106.xlsx", tab: "배송중", status: "셀러가 내 판매처에 송장을 등록하고 있어요" }
      },
      {
        caption: { kicker: "고객이 물어보면", title: "**검색**으로 바로 찾아요" },
        duration: 4.4,
        actor: "doogo",
        view: {
          kind: "checks",
          tag: "주문·송장 찾기",
          intro: "이렇게 찾을 수 있어요.",
          title: "주문·송장 찾기",
          items: [
            { title: "고객명 · 휴대폰번호", sub: "전체 주문 리스트에서 검색" },
            { title: "송장번호", sub: "택배사 배송 조회로 위치 확인" },
            { title: "배송 시작 알림", sub: "도매몰 알림 설정에서 켜요" },
            { title: "송장 등록 시간", sub: "출고 당일 오후부터 순차 등록" }
          ]
        }
      },
      end
    ]
  },

  "seller-cancel": {
    id: "seller-cancel",
    audience: "seller",
    scenes: [
      cover,
      {
        caption: { kicker: "고객이 취소하면", title: "**출고 전**까지 취소돼요" },
        duration: 4.8,
        actor: [[0, "seller"], [1.2, "doogo"]],
        view: { kind: "chat", date: "11월 6일 (금) 오전 9:50", ask: "고객이 주문을\n취소했어요", reply: "출고 전이면 바로 취소할 수 있어요.\n전체 주문 리스트에서 주문을 골라\n취소를 눌러 주세요.", replyAt: 1.2 }
      },
      {
        caption: { kicker: "취소하기 전에", title: "**주문 상태**를 봐요" },
        duration: 4.6,
        actor: "doogo",
        view: {
          kind: "checks",
          tag: "주문 상태별 취소",
          intro: "상태에 따라 달라요.",
          title: "취소할 수 있는 주문",
          items: [
            { title: "주문대기", sub: "바로 취소·삭제할 수 있어요", mark: "ok" },
            { title: "주문접수 · 발주완료 · 배송준비중", sub: "출고 전이면 취소 · 발주 당일 오전에", mark: "ok" },
            { title: "배송중 · 배송완료", sub: "취소 대신 반품으로 접수해요", mark: "minus" }
          ]
        }
      },
      {
        caption: { kicker: "도매몰 메뉴에서", title: "**전체 주문 리스트**로" },
        duration: 3.4,
        actor: "seller",
        view: { kind: "menu", open: "주문 관리", target: "전체 주문 리스트", clickAt: 2.2, status: "셀러가 도매몰 메뉴를 고르고 있어요" }
      },
      {
        caption: { kicker: "주문을 고르고", title: "**취소**를 눌러요" },
        duration: 6.0,
        actor: "seller",
        view: {
          kind: "orders",
          page: "전체 주문 리스트",
          rows: [order(0, { status: "배송중" }), order(1, { status: "배송준비중" }), order(2, { status: "주문접수" }), order(3, { status: "주문접수" })],
          actions: ["취소", "교환", "반품"],
          select: { rows: [2], at: 1.0 },
          action: { label: "취소", at: 2.0 },
          dialog: { at: 2.15, title: "즉시 취소 하시겠습니까?", sub: "HM-1106-003 · 박지우 · 배 선물세트", confirm: "취소하기", confirmAt: 3.4, tone: "danger" },
          changes: [{ at: 3.55, rows: [2], status: "취소완료" }],
          toast: { at: 3.65, text: "취소가 완료되었습니다" },
          status: "셀러가 주문을 취소하고 있어요"
        }
      },
      {
        caption: { kicker: "취소한 주문은", title: "**취소 리스트**에서 봐요" },
        duration: 4.4,
        actor: "seller",
        view: {
          kind: "done",
          badge: "주문 취소 완료",
          title: "HM-1106-003 · 박지우",
          rows: [
            { label: "주문 상태", value: "취소완료" },
            { label: "확인 메뉴", value: "CS 관리 › 취소 리스트" },
            { label: "환불", value: "취소 승인 후 순차 환불" }
          ],
          message: "이미 출고된 주문은 취소 대신\n반품으로 접수해 주세요."
        }
      },
      end
    ]
  },

  "seller-return": {
    id: "seller-return",
    audience: "seller",
    scenes: [
      cover,
      {
        caption: { kicker: "상품에 문제가 있으면", title: "**24시간 안에** 접수해요" },
        duration: 4.8,
        actor: [[0, "seller"], [1.2, "doogo"]],
        view: { kind: "chat", date: "11월 7일 (토) 오전 10:15", ask: "고객이 받은 상품에\n문제가 있대요", reply: "고객이 받은 지 24시간 안에\n사진과 내용을 함께 접수해 주세요.\n확인한 뒤 회수 방법을 안내드려요.", replyAt: 1.2 }
      },
      {
        caption: { kicker: "접수하기 전에", title: "**사진 3장**을 준비해요" },
        duration: 4.4,
        actor: "doogo",
        view: {
          kind: "checks",
          tag: "반품·교환 준비물",
          intro: "이 자료를 준비해 주세요.",
          title: "접수할 때 필요한 것",
          items: [
            { title: "송장 사진", sub: "받은 상자에 붙은 송장" },
            { title: "상품 전체 사진", sub: "받은 상품 전체가 보이게" },
            { title: "문제 부위 사진", sub: "파손·변질 부위를 가까이" },
            { title: "상세 내용", sub: "어떤 문제가 몇 개인지" }
          ]
        }
      },
      {
        caption: { kicker: "도매몰 메뉴에서", title: "**주문 관리 › 배송완료**" },
        duration: 3.4,
        actor: "seller",
        view: { kind: "menu", open: "주문 관리", target: "배송완료", clickAt: 2.2, status: "셀러가 도매몰 메뉴를 고르고 있어요" }
      },
      {
        caption: { kicker: "주문을 고르고", title: "**반품**을 신청해요" },
        duration: 7.0,
        actor: "seller",
        view: {
          kind: "orders",
          page: "배송완료",
          rows: [order(0, { status: "배송완료" }), order(1, { status: "배송완료" }), order(4, { status: "배송완료" })],
          actions: ["교환", "반품"],
          select: { rows: [0], at: 1.0 },
          action: { label: "반품", at: 1.9 },
          dialog: {
            at: 2.05,
            title: "반품 신청",
            sub: "HM-1106-001 · 김민지 · 부사 사과 5kg",
            options: ["고객변심", "배송지연", "오배송", "불량", "기타"],
            pick: "불량",
            pickAt: 2.8,
            detail: "상자 파손으로 사과 3개 멍듦",
            photos: 3,
            confirm: "반품 신청",
            confirmAt: 5.3
          },
          changes: [{ at: 5.45, rows: [0], status: "반품접수" }],
          toast: { at: 5.55, text: "반품이 접수됐어요" },
          status: "셀러가 반품을 신청하고 있어요"
        }
      },
      {
        caption: { kicker: "두고푸드가 확인한 뒤", title: "**회수 방법**을 안내해요" },
        duration: 4.4,
        actor: "doogo",
        view: {
          kind: "done",
          badge: "반품 접수 완료",
          title: "HM-1106-001 · 김민지",
          rows: [
            { label: "사유", value: "불량 · 상자 파손" },
            { label: "확인 메뉴", value: "CS 관리 › 반품 리스트" },
            { label: "교환", value: "'교환' 버튼으로 같은 방법" }
          ],
          message: "임의로 반품을 보내지 말고\n안내받은 주소와 방법으로 보내 주세요."
        }
      },
      {
        caption: { kicker: "이런 경우는", title: "**교환·환불이 어려워요**" },
        duration: 4.6,
        actor: "doogo",
        view: {
          kind: "checks",
          tag: "반품·교환 기준",
          intro: "이 기준을 확인하세요.",
          title: "교환·환불이 어려운 경우",
          items: [
            { title: "단순 변심 · 맛", sub: "주관적인 사유는 대상이 아니에요", mark: "minus" },
            { title: "주소·연락처를 잘못 적음", sub: "반송은 보상되지 않아요", mark: "minus" },
            { title: "수령 후 24시간이 지남", sub: "확인이 어려울 수 있어요", mark: "minus" },
            { title: "일부만 문제", sub: "확인된 수량만 처리해요", mark: "ok" }
          ]
        }
      },
      end
    ]
  }
};
