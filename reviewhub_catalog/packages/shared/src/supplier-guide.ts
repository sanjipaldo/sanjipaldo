// 공급사 사용방법(주문 처리·정산 안내)과 입점 제안서 PDF가 함께 쓰는 운영 기준·영상 목록입니다.
// 관리자 > 사용방법 관리에서 content_settings "supplier_guide"(JSON)로 저장하며, 비어 있는 칸은 아래 기본값을 씁니다.
// 공급사 거래 방식: 별도 공급사 관리자(사이트·프로그램) 없이, 두고푸드가 정한 시간(오전 1회·오후 1회)에 발주서 메일을 보내고
// 공급사는 출고 후 그 메일에 송장을 회신합니다.

export const SUPPLIER_GUIDE_SETTING_KEY = "supplier_guide";

export type SupplierGuideVideo = {
  id: string;
  group: string;
  title: string;
  description: string;
  url: string;
  duration: string;
};

export type SupplierGuideTerms = {
  orderCutoff: string;
  orderSendTime: string;
  shipLeadTime: string;
  invoiceDeadline: string;
  commission: string;
  settlementBasis: string;
  settlementCycle: string;
  settlementPayDay: string;
  settlementOption: string;
  taxInvoice: string;
  deductions: string;
  returnPolicy: string;
};

export type SupplierGuideSettings = SupplierGuideTerms & { videos: SupplierGuideVideo[] };

export const SUPPLIER_TERM_LABELS: Record<keyof SupplierGuideTerms, string> = {
  orderCutoff: "주문(발주) 마감",
  orderSendTime: "발주서 메일 발송",
  shipLeadTime: "출고 기한",
  invoiceDeadline: "송장 회신 마감",
  commission: "판매 수수료",
  settlementBasis: "정산 기준",
  settlementCycle: "정산 주기",
  settlementPayDay: "지급일",
  settlementOption: "주 단위 정산",
  taxInvoice: "세금계산서",
  deductions: "정산 제외·차감",
  returnPolicy: "반품·교환"
};

export const SUPPLIER_VIDEO_GROUPS = ["한눈에 보기", "입점 준비", "주문 처리", "정산"] as const;

// 화면에 기본으로 들어 있는 안내 영상(애니메이션)의 id. 영상 주소가 비어 있으면 이 안내 영상을 재생합니다.
export const SUPPLIER_DEMO_VIDEO_IDS = ["overview", "apply", "order-sheet", "invoice", "cs", "settlement"] as const;
export const hasSupplierDemo = (id: string) => (SUPPLIER_DEMO_VIDEO_IDS as readonly string[]).includes(id);

export const DEFAULT_SUPPLIER_GUIDE: SupplierGuideSettings = {
  orderCutoff: "각 메일 발송 직전까지 들어온 주문",
  orderSendTime: "평일 오전 1회 · 오후 1회 (입점 때 정한 시간)",
  shipLeadTime: "발주 메일을 받은 날 출고(늦어도 2일 이내)",
  invoiceDeadline: "출고 당일 오후 6시까지",
  commission: "판매 대금의 10%(판매·마케팅 대행 수수료) · 매월 초 공급사가 지난달 총 거래 금액의 10%를 입금하면 두고푸드가 세금계산서를 발행합니다.",
  settlementBasis: "정산 기간에 접수된 주문 건의 도매 공급가 합계(판매 대금) 전액",
  settlementCycle: "월 정산(기본) · 매월 1일~말일 주문분",
  settlementPayDay: "다음 달 1~3일 이내, 양사가 정산 금액을 확인한 뒤 판매 대금 100% 입금",
  settlementOption: "거래 금액이 커지면 주 정산으로 바꿀 수 있습니다. 월~일 주문분을 다음 주 월요일에 100% 입금하고, 수수료는 매월 1일에 한 번만 입금합니다.",
  taxInvoice: "판매 대금은 공급사가 두고푸드 앞으로 물품 세금계산서(면세 상품은 계산서)를 발행하고, 수수료는 두고푸드가 공급사 앞으로 세금계산서를 발행합니다.",
  deductions: "출고 전 취소된 주문은 정산에서 빠집니다. 변질·품질 저하 등 공급사 사유로 생긴 반품은 공급사가 책임지며 두고푸드와 협의해 해결합니다.",
  returnPolicy: "반품·CS·배송 문의는 계약 후 만들어지는 카카오톡 단톡방에서 두고푸드 팀원과 함께 처리하고, 반품·교환 회수 주소와 방법은 두고푸드가 확인한 뒤 안내합니다.",
  videos: [
    { id: "overview", group: "한눈에 보기", title: "두고푸드와 거래하는 방법", description: "발주 메일 받고, 출고하고, 송장만 회신하면 끝", url: "", duration: "" },
    { id: "apply", group: "입점 준비", title: "입점 신청하기", description: "신청서 작성 → 제안서 메일 → 담당 MD 상담", url: "", duration: "" },
    { id: "order-sheet", group: "주문 처리", title: "발주서 메일 받기", description: "오전·오후 정해진 시간에 오는 발주서 확인", url: "", duration: "" },
    { id: "invoice", group: "주문 처리", title: "송장 회신하기", description: "발주서 엑셀에 송장번호를 넣어 그 메일에 회신", url: "", duration: "" },
    { id: "cs", group: "주문 처리", title: "취소·반품·교환 처리", description: "단톡방에서 두고푸드 팀과 함께 바로 처리", url: "", duration: "" },
    { id: "settlement", group: "정산", title: "매월 정산 받기", description: "판매 대금 100% 먼저 입금 → 수수료 10%", url: "", duration: "" }
  ]
};

// 예전 기본 문구(발주오라 자동 발송 · 오전 10시 1회 기준). 저장된 값이 예전 기본 문구 그대로면 새 기본 문구로 바꿔 보여 줍니다
// (관리자가 직접 고친 문구는 그대로 둡니다).
// 정산 문구는 2026-11-07 판매 수수료 10%·판매 대금 100% 선입금 방식으로 바뀌어, 예전 기본 문구도 새 기본 문구로 보여 줍니다.
const LEGACY_TERM_DEFAULTS: Partial<Record<keyof SupplierGuideTerms, string[]>> = {
  orderCutoff: ["평일 오전 9시 30분"],
  orderSendTime: ["평일 오전 10시 전후"],
  shipLeadTime: ["발주서를 받은 날 출고(늦어도 2일 이내)"],
  settlementBasis: ["한 달 동안 실제로 접수된 주문 건의 공급가를 모두 합산한 금액"],
  settlementCycle: ["월 1회 · 지난달 1일~말일 주문분"],
  settlementPayDay: ["매월 1일, 지난달 주문분을 정산해 드립니다"],
  settlementOption: ["물량이 크거나 주문 건이 많으면 주 단위 정산으로 바꿀 수 있습니다."],
  taxInvoice: ["정산 금액으로 공급사가 두고푸드 앞으로 세금계산서(면세 상품은 계산서)를 발행합니다."],
  deductions: ["출고 전 취소된 주문은 정산에서 빠지고, 공급사 사유(오배송·파손·품질)로 생긴 반품·교환 비용은 차감합니다."],
  returnPolicy: ["반품·교환은 두고푸드가 확인한 뒤 안내드린 주소와 방법으로 진행합니다."]
};
const LEGACY_VIDEO_IDS = ["apply", "product-info", "order-sheet", "invoice", "cs", "settlement"];

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

// 저장된 JSON을 읽어 기본값과 합칩니다(잘못된 값·빈 칸은 기본값, 영상은 최대 30개).
export function parseSupplierGuide(value?: string | null): SupplierGuideSettings {
  let raw: Record<string, unknown> = {};
  if (value) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) raw = parsed as Record<string, unknown>;
    } catch {
      raw = {};
    }
  }
  const terms = Object.fromEntries(
    (Object.keys(SUPPLIER_TERM_LABELS) as Array<keyof SupplierGuideTerms>).map((key) => {
      const value = clean(raw[key], 300);
      return [key, !value || LEGACY_TERM_DEFAULTS[key]?.includes(value) ? DEFAULT_SUPPLIER_GUIDE[key] : value];
    })
  ) as SupplierGuideTerms;
  // 예전 기본 영상 목록(주소 없이 그대로 저장된 경우)은 새 기본 목록(안내 영상 6편)으로 보여 줍니다.
  const legacyVideos = Array.isArray(raw.videos)
    && raw.videos.length === LEGACY_VIDEO_IDS.length
    && raw.videos.every((item, index) => Boolean(item) && typeof item === "object" && (item as Record<string, unknown>).id === LEGACY_VIDEO_IDS[index] && !clean((item as Record<string, unknown>).url, 500));
  const videos = Array.isArray(raw.videos) && !legacyVideos
    ? raw.videos.slice(0, 30).flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const video = item as Record<string, unknown>;
      const title = clean(video.title, 80);
      if (!title) return [];
      return [{
        id: clean(video.id, 40) || `video-${index + 1}`,
        group: clean(video.group, 30) || SUPPLIER_VIDEO_GROUPS[0],
        title,
        description: clean(video.description, 160),
        url: clean(video.url, 500),
        duration: clean(video.duration, 10)
      }];
    })
    : DEFAULT_SUPPLIER_GUIDE.videos;
  return { ...terms, videos };
}

export type VideoEmbed =
  | { kind: "youtube" | "vimeo"; src: string }
  | { kind: "file"; src: string }
  | { kind: "link"; src: string }
  | { kind: "none"; src: "" };

// 영상 주소 → 화면에 넣을 방식(YouTube·Vimeo는 iframe, mp4·webm 파일은 video, 그 밖의 https 주소는 링크).
export function supplierVideoEmbed(url: string): VideoEmbed {
  const value = url.trim();
  if (!/^https:\/\//i.test(value)) return { kind: "none", src: "" };
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { kind: "none", src: "" };
  }
  const host = parsed.hostname.replace(/^www\./, "").replace(/^m\./, "");
  const youtubeId = host === "youtu.be"
    ? parsed.pathname.slice(1).split("/")[0]
    : host === "youtube.com" || host === "youtube-nocookie.com"
      ? parsed.searchParams.get("v") || parsed.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/)?.[1] || ""
      : "";
  if (youtubeId && /^[A-Za-z0-9_-]{6,20}$/.test(youtubeId)) return { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0` };
  const vimeoId = host === "vimeo.com" ? parsed.pathname.match(/^\/(\d+)/)?.[1] : host === "player.vimeo.com" ? parsed.pathname.match(/^\/video\/(\d+)/)?.[1] : undefined;
  if (vimeoId) return { kind: "vimeo", src: `https://player.vimeo.com/video/${vimeoId}` };
  if (/\.(mp4|webm|mov)$/i.test(parsed.pathname)) return { kind: "file", src: value };
  return { kind: "link", src: value };
}
