// 공급사 사용법 안내 영상(애니메이션) 대본. 영상마다 장면(scene) 목록이며, 장면은 위 자막 + "공급사 | 두고푸드" 표시 + 아래 화면(view)으로 그립니다.
// 거래 방식: 별도 공급사 관리자 없이, 두고푸드가 정한 시간(오전 1회·오후 1회)에 발주서 메일을 보내고 공급사는 그 메일에 송장을 회신합니다.
// 자막 title의 **글자**는 강조색으로 보입니다. 업체명·주문·금액은 모두 예시입니다.

export type DemoActor = "supplier" | "doogo";
export type DemoTimed<T> = T | Array<[number, T]>;

export type DemoMail = {
  from: string;
  subject: string;
  time: string;
  attach?: boolean;
  tag?: string;
  tone?: "new" | "done" | "alert" | "muted";
  at?: number;
  read?: boolean;
};

export type DemoView =
  | { kind: "chat"; date: string; ask: string; reply: string; replyAt?: number }
  | { kind: "steps"; tag: string; intro: string; title: string; items: Array<{ title: string; sub: string; who: DemoActor }>; focusWho?: DemoActor; focusAt?: number }
  | { kind: "checks"; tag: string; intro: string; title: string; items: Array<{ title: string; sub?: string; mark?: "ok" | "minus" }> }
  | { kind: "inbox"; mails: DemoMail[]; openAt?: number; status?: DemoTimed<string> }
  | {
    kind: "mail";
    mode: "read" | "reply";
    from?: string;
    to?: string;
    subject: string;
    time?: string;
    body?: string[];
    quote?: string;
    attachment?: { name: string; meta: string; type: "xlsx" | "pdf" };
    reply?: string;
    clickAt?: number;
    status?: DemoTimed<string>;
  }
  | { kind: "sheet"; mode: "view" | "type" | "register"; file: string; status?: string; total?: number }
  | { kind: "form"; url: string; heading: string; sub: string; fields: Array<{ label: string; value: string }>; submit?: string; done?: string; status?: string }
  | { kind: "confirm"; title: string; sub: string; items: string[]; pill: string; base: "sheet" | "mail" }
  | {
    kind: "done";
    badge: string;
    title: string;
    rows: Array<{ label: string; value: string; tone?: "minus" }>;
    total?: { label: string; value: number; suffix: string };
    message?: string;
    toggle?: string;
  }
  | { kind: "group"; title: string; members: string; messages: Array<{ who: DemoActor; name: string; text: string; at: number }> }
  | { kind: "cover" }
  | { kind: "end"; line?: string; big?: string };

export type DemoScene = {
  caption: { kicker: string; title: string };
  duration: number;
  actor: DemoTimed<DemoActor>;
  view: DemoView;
};

export type DemoScript = { id: string; scenes: DemoScene[] };

// 예시 발주서(엑셀) 줄: 수령인 · 주소 · 상품 · 수량 · 택배사 · 송장번호
export const DEMO_SHEET_ROWS = [
  { name: "김민지", address: "서울 마포구 월드컵로", item: "부사 사과 5kg", qty: "1", courier: "CJ대한통운", invoice: "681234567890" },
  { name: "이서준", address: "경기 성남시 분당구", item: "부사 사과 3kg", qty: "2", courier: "CJ대한통운", invoice: "681234567891" },
  { name: "박지우", address: "부산 해운대구 우동", item: "배 선물세트", qty: "1", courier: "CJ대한통운", invoice: "681234567892" },
  { name: "최하은", address: "대전 유성구 봉명동", item: "부사 사과 5kg", qty: "1", courier: "CJ대한통운", invoice: "681234567893" },
  { name: "정도윤", address: "인천 연수구 송도동", item: "사과·배 혼합", qty: "1", courier: "CJ대한통운", invoice: "681234567894" },
  { name: "강예린", address: "광주 서구 치평동", item: "부사 사과 3kg", qty: "3", courier: "CJ대한통운", invoice: "681234567895" }
];

const AM_SHEET = "두고푸드_발주서_1106_오전.xlsx";
const AM_SUBJECT = "[두고푸드] 11/6(금) 오전 발주서 · 12건";
const PM_SUBJECT = "[두고푸드] 11/6(금) 오후 발주서 · 7건";
const YESTERDAY: DemoMail[] = [
  { from: "두고푸드 발주", subject: "[두고푸드] 11/5(목) 오후 발주서 · 9건", time: "어제", attach: true, tag: "회신 완료", tone: "done", read: true },
  { from: "두고푸드 발주", subject: "[두고푸드] 11/5(목) 오전 발주서 · 15건", time: "어제", attach: true, tag: "회신 완료", tone: "done", read: true }
];

// 첫 장면(표지): 영상 제목과 "이 영상에서 볼 내용"(장면 목록). 재생 전 화면도 이 표지가 보입니다.
const cover: DemoScene = { caption: { kicker: "", title: "" }, duration: 2.6, actor: "doogo", view: { kind: "cover" } };
const end: DemoScene = { caption: { kicker: "", title: "" }, duration: 3.6, actor: "doogo", view: { kind: "end" } };

export const SUPPLIER_DEMO_SCRIPTS: Record<string, DemoScript> = {
  overview: {
    id: "overview",
    scenes: [
      cover,
      {
        caption: { kicker: "두고푸드 공급사라면", title: "**메일 두 번**이면 끝나요" },
        duration: 4.8,
        actor: [[0, "supplier"], [1.2, "doogo"]],
        view: { kind: "chat", date: "11월 6일 (금) 오전 9:40", ask: "입점하면 주문은\n어떻게 받아요?", reply: "따로 관리자 사이트는 없어요.\n정한 시간에 발주서를 메일로 보내 드리면\n출고하고 송장만 회신해 주세요.", replyAt: 1.2 }
      },
      {
        caption: { kicker: "누가 무엇을 하는지", title: "**순서**부터 정리해 드려요" },
        duration: 4.6,
        actor: "doogo",
        view: {
          kind: "steps",
          tag: "두고푸드 · 거래 순서 안내",
          intro: "이 순서로 진행돼요.",
          title: "공급사 거래 순서",
          focusWho: "supplier",
          focusAt: 3.1,
          items: [
            { title: "발주서 메일 보내기", sub: "오전 1회 · 오후 1회, 정한 시간에", who: "doogo" },
            { title: "발주서대로 포장·출고", sub: "메일로 받은 엑셀 그대로", who: "supplier" },
            { title: "송장번호 회신", sub: "받은 메일에 답장으로", who: "supplier" },
            { title: "송장 등록·셀러 전달", sub: "위탁셀러 주문에 반영", who: "doogo" },
            { title: "판매 대금 100% 입금", sub: "다음 달 1~3일 · 수수료 10%는 그 뒤", who: "doogo" }
          ]
        }
      },
      {
        caption: { kicker: "발주서는", title: "**정한 시간**에 메일로 와요" },
        duration: 4.0,
        actor: "doogo",
        view: {
          kind: "inbox",
          status: "두고푸드가 발주서를 보내고 있어요",
          mails: [
            { from: "두고푸드 발주", subject: PM_SUBJECT, time: "오후 2:00", attach: true, tag: "새 메일", tone: "new", at: 2.1 },
            { from: "두고푸드 발주", subject: AM_SUBJECT, time: "오전 10:00", attach: true, tag: "새 메일", tone: "new", at: 0.6 },
            ...YESTERDAY
          ]
        }
      },
      {
        caption: { kicker: "발주서 엑셀 한 장에", title: "**주문 정보**가 다 있어요" },
        duration: 3.9,
        actor: "supplier",
        view: { kind: "sheet", mode: "view", file: AM_SHEET, status: "공급사가 발주서를 보고 있어요" }
      },
      {
        caption: { kicker: "포장·출고는", title: "**공급사가 직접**" },
        duration: 3.7,
        actor: "supplier",
        view: { kind: "confirm", base: "sheet", title: "출고 전 확인", sub: "발주서대로 보내 주세요", items: ["상품·수량 확인", "보내는 사람: 셀러 상호로 표기", "택배 접수·송장 출력"], pill: "출고했다면 송장만 회신해 주세요" }
      },
      {
        caption: { kicker: "송장은", title: "**발주서 엑셀에 입력**해요" },
        duration: 4.3,
        actor: "supplier",
        view: { kind: "sheet", mode: "type", file: AM_SHEET, status: "공급사가 송장번호를 입력하고 있어요" }
      },
      {
        caption: { kicker: "받은 메일에", title: "**그대로 회신**하면 끝" },
        duration: 4.0,
        actor: [[0, "supplier"], [2.5, "doogo"]],
        view: {
          kind: "mail",
          mode: "reply",
          to: "두고푸드 발주",
          subject: `RE: ${AM_SUBJECT}`,
          attachment: { name: "두고푸드_발주서_1106_오전_송장.xlsx", meta: "송장 12건 입력", type: "xlsx" },
          reply: "오전 발주 12건 출고했습니다.\n송장 회신드립니다.",
          clickAt: 2.1,
          status: [[0, "공급사가 회신하고 있어요"], [2.5, "두고푸드가 송장을 받았어요"]]
        }
      },
      {
        caption: { kicker: "송장 등록부터 정산까지", title: "**두고푸드가 알아서**" },
        duration: 4.2,
        actor: "doogo",
        view: {
          kind: "done",
          badge: "오늘 발주 처리 완료",
          title: "11/6(금) 발주 처리",
          rows: [
            { label: "오전 발주서 12건", value: "송장 회신 완료" },
            { label: "오후 발주서 7건", value: "송장 회신 완료" }
          ],
          message: "송장은 위탁셀러에게 바로 전달했어요.\n이번 달 판매 대금은 다음 달 1~3일에\n100% 먼저 입금해 드려요.",
          toggle: "정산 내역 메일로 받기"
        }
      },
      end
    ]
  },

  apply: {
    id: "apply",
    scenes: [
      cover,
      {
        caption: { kicker: "두고푸드에 입점하려면", title: "**신청서 한 장**이면 돼요" },
        duration: 4.8,
        actor: [[0, "supplier"], [1.2, "doogo"]],
        view: { kind: "chat", date: "11월 6일 (금) 오전 10:52", ask: "두고푸드에 상품을\n공급하고 싶어요", reply: "사용방법 › 공급사에서\n입점 신청서를 남겨 주세요.\n입점 제안서를 바로 메일로 보내 드려요.", replyAt: 1.2 }
      },
      {
        caption: { kicker: "입점은", title: "**5단계**로 진행돼요" },
        duration: 4.4,
        actor: "doogo",
        view: {
          kind: "steps",
          tag: "두고푸드 · 입점 절차 안내",
          intro: "이 순서로 진행돼요.",
          title: "입점 순서",
          items: [
            { title: "입점 신청서 작성", sub: "doogofood.site · 5분이면 끝", who: "supplier" },
            { title: "입점 제안서 메일", sub: "신청하면 바로 PDF로", who: "doogo" },
            { title: "담당 MD 상담", sub: "영업일 2~3일 안에 연락", who: "doogo" },
            { title: "상품 자료·메일 시간 정하기", sub: "상세페이지·썸네일·도매 공급가", who: "supplier" },
            { title: "판매 시작", sub: "단가표·신규상품에 노출", who: "doogo" }
          ]
        }
      },
      {
        caption: { kicker: "신청서에는", title: "**업체 정보만** 적으면 돼요" },
        duration: 5.2,
        actor: "supplier",
        view: {
          kind: "form",
          url: "doogofood.site/how-to/supplier",
          heading: "입점 신청",
          sub: "업체 정보를 남기면 입점 제안서를 보내 드려요",
          fields: [
            { label: "업체명", value: "봄날농원" },
            { label: "업종", value: "농가" },
            { label: "주요 상품", value: "부사 사과 · 배 선물세트" },
            { label: "연락처", value: "010-1234-5678" },
            { label: "이메일", value: "bomnal@example.com" }
          ],
          submit: "입점 신청하기",
          done: "신청이 접수됐어요",
          status: "공급사가 신청서를 쓰고 있어요"
        }
      },
      {
        caption: { kicker: "신청하면 바로", title: "**입점 제안서**가 메일로 와요" },
        duration: 4.0,
        actor: [[0, "doogo"], [1.8, "supplier"]],
        view: {
          kind: "mail",
          mode: "read",
          from: "두고푸드 DB센터",
          time: "오전 11:02",
          subject: "[두고푸드] 봄날농원 입점 신청이 접수되었습니다",
          body: ["입점 신청이 접수되었습니다.", "첨부한 입점 제안서에서 주문 처리·정산 방법을 확인해 주세요.", "담당 MD가 영업일 2~3일 안에 연락드립니다."],
          attachment: { name: "두고푸드_입점제안서_봄날농원.pdf", meta: "PDF · 4쪽", type: "pdf" },
          clickAt: 2.5,
          status: [[0, "두고푸드가 제안서를 보냈어요"], [1.8, "공급사가 메일을 확인하고 있어요"]]
        }
      },
      {
        caption: { kicker: "제안서 한 부에 주문 처리부터", title: "**정산 방법**까지 다 있어요" },
        duration: 4.2,
        actor: "doogo",
        view: {
          kind: "checks",
          tag: "입점 제안서 · PDF 4쪽",
          intro: "제안서에는 이런 내용이 있어요.",
          title: "입점 제안서 내용",
          items: [
            { title: "두고푸드 소개 · 입점 혜택", sub: "재고 부담 없는 위탁 판매" },
            { title: "입점 절차", sub: "신청부터 판매 시작까지 1~2주" },
            { title: "주문 처리 방법", sub: "발주서 메일 받고 송장 회신" },
            { title: "판매 수수료 · 정산", sub: "판매 대금 100% 먼저, 수수료 10%" },
            { title: "준비 서류 · 문의", sub: "사업자등록증 · 통장 사본 등" }
          ]
        }
      },
      {
        caption: { kicker: "담당 MD가", title: "**2~3일 안에 연락**드려요" },
        duration: 4.2,
        actor: "doogo",
        view: {
          kind: "done",
          badge: "입점 신청 접수 완료",
          title: "봄날농원 입점 상담",
          rows: [
            { label: "담당 MD 연락", value: "영업일 2~3일 안" },
            { label: "함께 정할 것", value: "도매 공급가 · 수수료 10%" },
            { label: "발주서 메일 시간", value: "오전 1회 · 오후 1회" }
          ],
          message: "상품 정보만 보내 주시면\n등록부터 판매까지 두고푸드가 챙길게요."
        }
      },
      end
    ]
  },

  "order-sheet": {
    id: "order-sheet",
    scenes: [
      cover,
      {
        caption: { kicker: "주문이 들어오면", title: "**하루 2번** 메일로 보내요" },
        duration: 4.8,
        actor: [[0, "supplier"], [1.2, "doogo"]],
        view: { kind: "chat", date: "11월 6일 (금) 오전 9:12", ask: "주문은 어디서\n확인해요?", reply: "따로 접속할 사이트는 없어요.\n오전 1번, 오후 1번 정한 시간에\n발주서를 메일로 보내 드려요.", replyAt: 1.2 }
      },
      {
        caption: { kicker: "메일 시간은", title: "**입점할 때** 같이 정해요" },
        duration: 4.6,
        actor: "doogo",
        view: {
          kind: "form",
          url: "두고푸드 · 공급사 발주 메일 설정",
          heading: "발주서 메일 설정",
          sub: "봄날농원 · 입점 상담 때 정한 내용",
          fields: [
            { label: "받는 메일 주소", value: "bomnal@example.com" },
            { label: "오전 발주 메일", value: "오전 10:00" },
            { label: "오후 발주 메일", value: "오후 2:00" },
            { label: "송장 회신 마감", value: "출고 당일 오후 6시" }
          ],
          submit: "저장",
          done: "저장했어요",
          status: "두고푸드가 메일 시간을 등록하고 있어요"
        }
      },
      {
        caption: { kicker: "오전 10시", title: "**오전 발주서**가 도착해요" },
        duration: 3.9,
        actor: [[0, "doogo"], [1.8, "supplier"]],
        view: {
          kind: "inbox",
          openAt: 2.6,
          status: [[0, "두고푸드가 발주서를 보냈어요"], [1.8, "공급사가 메일을 확인하고 있어요"]],
          mails: [{ from: "두고푸드 발주", subject: AM_SUBJECT, time: "오전 10:00", attach: true, tag: "새 메일", tone: "new", at: 0.5 }, ...YESTERDAY]
        }
      },
      {
        caption: { kicker: "메일을 열면", title: "**발주서 엑셀**이 있어요" },
        duration: 4.1,
        actor: "supplier",
        view: {
          kind: "mail",
          mode: "read",
          from: "두고푸드 발주",
          time: "오전 10:00",
          subject: AM_SUBJECT,
          body: ["봄날농원 담당자님, 오늘 오전 발주 12건입니다.", "출고 후 첨부 엑셀에 택배사·송장번호를 입력해 이 메일로 회신해 주세요.", "회신 마감: 출고 당일 오후 6시"],
          attachment: { name: AM_SHEET, meta: "엑셀 · 12건", type: "xlsx" },
          clickAt: 2.6,
          status: "공급사가 메일을 확인하고 있어요"
        }
      },
      {
        caption: { kicker: "발주서 엑셀 한 장에", title: "**주문 정보**가 다 있어요" },
        duration: 3.9,
        actor: "supplier",
        view: { kind: "sheet", mode: "view", file: AM_SHEET, status: "공급사가 발주서를 보고 있어요" }
      },
      {
        caption: { kicker: "보내는 사람은", title: "**셀러 상호**로 적어 주세요" },
        duration: 3.7,
        actor: "supplier",
        view: { kind: "confirm", base: "sheet", title: "출고 전 확인", sub: "발주서대로 보내 주세요", items: ["상품·수량 확인", "보내는 사람: 발주서의 셀러 상호", "발주 메일 받은 날 출고"], pill: "출고했다면 송장을 회신해 주세요" }
      },
      {
        caption: { kicker: "오후 2시", title: "**오후 발주서**도 똑같이" },
        duration: 3.8,
        actor: "doogo",
        view: {
          kind: "inbox",
          status: "두고푸드가 오후 발주서를 보냈어요",
          mails: [
            { from: "두고푸드 발주", subject: PM_SUBJECT, time: "오후 2:00", attach: true, tag: "새 메일", tone: "new", at: 0.6 },
            { from: "두고푸드 발주", subject: AM_SUBJECT, time: "오전 10:00", attach: true, tag: "회신 완료", tone: "done", read: true },
            ...YESTERDAY
          ]
        }
      },
      end
    ]
  },

  invoice: {
    id: "invoice",
    scenes: [
      cover,
      {
        caption: { kicker: "출고했다면", title: "**송장번호만** 보내 주세요" },
        duration: 4.8,
        actor: [[0, "supplier"], [1.2, "doogo"]],
        view: { kind: "chat", date: "11월 6일 (금) 오후 3:30", ask: "송장은 어떻게\n보내요?", reply: "받은 발주서 엑셀에\n택배사·송장번호를 입력해서\n그 메일에 회신하면 돼요.", replyAt: 1.2 }
      },
      {
        caption: { kicker: "공급사는", title: "**3단계**면 끝나요" },
        duration: 4.2,
        actor: "doogo",
        view: {
          kind: "steps",
          tag: "두고푸드 · 송장 회신 안내",
          intro: "이렇게만 해 주세요.",
          title: "송장 회신 순서",
          items: [
            { title: "발주서 엑셀 열기", sub: "발주 메일에 첨부된 파일", who: "supplier" },
            { title: "택배사·송장번호 입력", sub: "주문 줄마다 입력", who: "supplier" },
            { title: "받은 메일에 회신", sub: "엑셀을 첨부해 답장", who: "supplier" },
            { title: "송장 등록·셀러 전달", sub: "두고푸드가 처리해요", who: "doogo" }
          ]
        }
      },
      {
        caption: { kicker: "발주서 엑셀에", title: "**송장번호를 입력**해요" },
        duration: 4.6,
        actor: "supplier",
        view: { kind: "sheet", mode: "type", file: AM_SHEET, status: "공급사가 송장번호를 입력하고 있어요" }
      },
      {
        caption: { kicker: "받은 메일에", title: "**그대로 회신**해요" },
        duration: 4.0,
        actor: "supplier",
        view: {
          kind: "mail",
          mode: "reply",
          to: "두고푸드 발주",
          subject: `RE: ${AM_SUBJECT}`,
          attachment: { name: "두고푸드_발주서_1106_오전_송장.xlsx", meta: "송장 12건 입력", type: "xlsx" },
          reply: "오전 발주 12건 출고했습니다.\n송장 회신드립니다.",
          clickAt: 2.6,
          status: "공급사가 회신하고 있어요"
        }
      },
      {
        caption: { kicker: "회신 마감은", title: "**출고 당일 오후 6시**" },
        duration: 3.9,
        actor: "doogo",
        view: {
          kind: "checks",
          tag: "두고푸드 · 송장 회신 기준",
          intro: "이것만 지켜 주세요.",
          title: "송장 회신 기준",
          items: [
            { title: "출고 당일 오후 6시까지 회신", sub: "늦어지면 미리 알려 주세요" },
            { title: "오전·오후 메일마다 각각 회신", sub: "받은 메일에 답장으로" },
            { title: "택배사·송장번호를 정확하게", sub: "고객 배송 조회에 그대로 쓰여요" }
          ]
        }
      },
      {
        caption: { kicker: "회신하면", title: "**두고푸드가 등록**해요" },
        duration: 3.9,
        actor: "doogo",
        view: { kind: "sheet", mode: "register", file: "두고푸드_발주서_1106_오전_송장.xlsx", status: "두고푸드가 송장을 등록하고 있어요", total: 12 }
      },
      {
        caption: { kicker: "위탁셀러에게도", title: "**자동으로 전달**돼요" },
        duration: 4.2,
        actor: "doogo",
        view: {
          kind: "done",
          badge: "송장 등록 완료",
          title: "11/6(금) 오전 발주서 12건",
          rows: [
            { label: "송장 12건 등록", value: "완료" },
            { label: "위탁셀러 주문에 반영", value: "완료" },
            { label: "고객 배송 조회", value: "시작" }
          ],
          message: "송장 잘 받았어요.\n오후 발주서는 오후 2시에 보내 드릴게요.",
          toggle: "배송 문제가 생기면 바로 알려 드릴게요"
        }
      },
      end
    ]
  },

  cs: {
    id: "cs",
    scenes: [
      cover,
      {
        caption: { kicker: "취소·반품이 생기면", title: "**단톡방**에서 바로 처리해요" },
        duration: 4.8,
        actor: [[0, "supplier"], [1.2, "doogo"]],
        view: { kind: "chat", date: "11월 6일 (금) 오전 11:05", ask: "주문 취소나 반품은\n어떻게 해요?", reply: "계약하면 두고푸드 팀과\n카카오톡 단톡방이 열려요.\n반품·CS·배송 문의를 그 방에서\n함께 바로 이야기해요.", replyAt: 1.2 }
      },
      {
        caption: { kicker: "출고 전 취소는", title: "**바로 알려** 드려요" },
        duration: 4.4,
        actor: [[0, "doogo"], [1.7, "supplier"], [3.0, "doogo"]],
        view: {
          kind: "group",
          title: "두고푸드 × 봄날농원",
          members: "단톡방 · 5명",
          messages: [
            { who: "doogo", name: "두고푸드 CS", text: "김○○ 고객님 사과 5kg 주문 취소 요청이에요. 출고 전이면 빼 주세요.", at: 0.4 },
            { who: "supplier", name: "봄날농원", text: "아직 출고 전이라 이번 발주에서 뺐습니다.", at: 1.8 },
            { who: "doogo", name: "두고푸드 CS", text: "확인했습니다. 감사합니다!", at: 3.1 }
          ]
        }
      },
      {
        caption: { kicker: "변질·품질 저하 반품은", title: "**공급사가 책임**져요" },
        duration: 4.6,
        actor: [[0, "doogo"], [1.8, "supplier"], [3.1, "doogo"]],
        view: {
          kind: "group",
          title: "두고푸드 × 봄날농원",
          members: "단톡방 · 5명",
          messages: [
            { who: "doogo", name: "두고푸드 CS", text: "이○○ 고객님 사과 일부가 상했다고 사진 보내 주셨어요. 확인 부탁드려요.", at: 0.4 },
            { who: "supplier", name: "봄날농원", text: "확인했습니다. 교환 상품 내일 다시 보내 드릴게요.", at: 1.9 },
            { who: "doogo", name: "두고푸드 CS", text: "네, 회수 주소와 방법은 제가 안내드릴게요.", at: 3.2 }
          ]
        }
      },
      {
        caption: { kicker: "반품·교환은 두고푸드가", title: "**확인한 뒤** 안내해요" },
        duration: 4.4,
        actor: "doogo",
        view: {
          kind: "steps",
          tag: "두고푸드 · 반품·교환 안내",
          intro: "이 순서로 진행돼요.",
          title: "반품·교환 순서",
          items: [
            { title: "반품·교환 요청 접수", sub: "셀러·고객 요청을 받아요", who: "doogo" },
            { title: "사유·사진 확인", sub: "단톡방에서 함께 확인", who: "doogo" },
            { title: "회수 주소·방법 안내", sub: "두고푸드가 안내드려요", who: "doogo" },
            { title: "회수 상품 확인", sub: "상태 확인 후 회신", who: "supplier" },
            { title: "교환 출고 또는 반품 완료", sub: "교환이면 다시 출고", who: "supplier" }
          ]
        }
      },
      {
        caption: { kicker: "정산할 때는", title: "**사유에 따라** 달라요" },
        duration: 4.0,
        actor: "doogo",
        view: {
          kind: "checks",
          tag: "두고푸드 · 정산 기준",
          intro: "정산에는 이렇게 반영돼요.",
          title: "취소·반품 정산 기준",
          items: [
            { title: "출고 전 취소", sub: "정산에서 빠져요", mark: "ok" },
            { title: "변질·품질 저하 반품", sub: "공급사 책임 · 두고푸드와 협의해 해결", mark: "minus" },
            { title: "반품 사진·내용", sub: "단톡방에서 함께 확인해요", mark: "ok" }
          ]
        }
      },
      end
    ]
  },

  settlement: {
    id: "settlement",
    scenes: [
      cover,
      {
        caption: { kicker: "정산은", title: "**100% 먼저** 입금해요" },
        duration: 4.8,
        actor: [[0, "supplier"], [1.2, "doogo"]],
        view: { kind: "chat", date: "11월 30일 (월) 오후 4:10", ask: "정산은 언제\n받아요?", reply: "한 달 판매 대금을 다음 달 1~3일에\n100% 먼저 입금해 드려요.\n수수료 10%는 받으신 뒤에\n입금해 주시면 돼요.", replyAt: 1.2 }
      },
      {
        caption: { kicker: "매달", title: "**이 순서로** 정산해요" },
        duration: 4.4,
        actor: "doogo",
        view: {
          kind: "steps",
          tag: "두고푸드 · 정산 안내",
          intro: "매달 이렇게 진행돼요.",
          title: "월 정산 순서",
          items: [
            { title: "1일~말일 주문 합계 확인", sub: "두고푸드와 공급사가 함께", who: "doogo" },
            { title: "물품 세금계산서 발행", sub: "판매 대금 전액 · 면세는 계산서", who: "supplier" },
            { title: "판매 대금 100% 입금", sub: "다음 달 1~3일 이내", who: "doogo" },
            { title: "수수료 10% 입금", sub: "판매 대금을 받은 뒤", who: "supplier" },
            { title: "수수료 세금계산서 발행", sub: "판매·마케팅 대행 수수료", who: "doogo" }
          ]
        }
      },
      {
        caption: { kicker: "11월 판매 200만원이면", title: "**200만원** 먼저 입금" },
        duration: 4.4,
        actor: "doogo",
        view: {
          kind: "done",
          badge: "11월 정산 예시",
          title: "봄날농원 · 11월 1일~30일",
          rows: [
            { label: "11월 판매 대금", value: "2,000,000원" },
            { label: "12/1~12/3 두고푸드 입금", value: "2,000,000원" },
            { label: "수수료 10% · 공급사 입금", value: "-200,000원", tone: "minus" }
          ],
          total: { label: "공급사 실수령", value: 1800000, suffix: "원" }
        }
      },
      {
        caption: { kicker: "정산 내역은", title: "**메일로** 보내 드려요" },
        duration: 4.0,
        actor: [[0, "doogo"], [1.8, "supplier"]],
        view: {
          kind: "mail",
          mode: "read",
          from: "두고푸드 정산",
          time: "12월 1일",
          subject: "[두고푸드] 11월 정산 내역 · 판매 대금 2,000,000원",
          body: ["11월 1일~30일 주문분 정산 내역입니다.", "확인 후 물품 세금계산서(면세 상품은 계산서)를 발행해 주세요.", "판매 대금 2,000,000원은 12월 1~3일에 100% 입금됩니다."],
          attachment: { name: "두고푸드_정산내역_2026-11.xlsx", meta: "엑셀 · 주문 건별 내역", type: "xlsx" },
          clickAt: 2.5,
          status: [[0, "두고푸드가 정산 내역을 보냈어요"], [1.8, "공급사가 메일을 확인하고 있어요"]]
        }
      },
      {
        caption: { kicker: "물품 세금계산서는", title: "**공급사가 발행**해요" },
        duration: 3.8,
        actor: "supplier",
        view: { kind: "confirm", base: "mail", title: "물품 세금계산서 발행", sub: "정산 내역을 확인하고 발행해 주세요", items: ["공급받는 자: 두고푸드", "금액: 판매 대금 2,000,000원", "면세 상품은 계산서로 발행"], pill: "발행하면 판매 대금이 입금돼요" }
      },
      {
        caption: { kicker: "수수료 10%는", title: "**받은 뒤에** 입금해요" },
        duration: 4.4,
        actor: "doogo",
        view: {
          kind: "done",
          badge: "11월 정산 완료",
          title: "12월 초 정산",
          rows: [
            { label: "판매 대금 100% 입금", value: "2,000,000원" },
            { label: "수수료 10% 입금(공급사)", value: "200,000원" },
            { label: "수수료 세금계산서", value: "두고푸드 발행" }
          ],
          message: "거래가 커지면 주 정산으로 바꿀 수 있어요.\n수수료는 매월 1일에 한 번만 내시면 돼요.",
          toggle: "정산 내역 메일로 받기"
        }
      },
      end
    ]
  }
};

export const demoDuration = (script: DemoScript) => script.scenes.reduce((sum, scene) => sum + scene.duration, 0);

export function formatDemoTime(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// 자막 강조 표시(**…**)를 뺀 글자(장면 목록·접근성 문구용)
export const plainCaption = (title: string) => title.replace(/\*\*/g, "");

// 표지·마무리 화면을 뺀 본 장면(장면 목록에 보여 줄 것)
export const isChapterScene = (scene: DemoScene) => scene.view.kind !== "cover" && scene.view.kind !== "end";
