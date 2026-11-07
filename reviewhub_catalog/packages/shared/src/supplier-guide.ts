// 공급사 사용방법(주문 처리·정산 안내)과 입점 제안서 PDF가 함께 쓰는 운영 기준·영상 목록입니다.
// 관리자 > 사용방법 관리에서 content_settings "supplier_guide"(JSON)로 저장하며, 비어 있는 칸은 아래 기본값을 씁니다.

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
  orderSendTime: "발주서 발송",
  shipLeadTime: "출고 기한",
  invoiceDeadline: "송장 회신 마감",
  settlementBasis: "정산 기준",
  settlementCycle: "정산 주기",
  settlementPayDay: "지급일",
  settlementOption: "주 단위 정산",
  taxInvoice: "세금계산서",
  deductions: "정산 제외·차감",
  returnPolicy: "반품·교환"
};

export const SUPPLIER_VIDEO_GROUPS = ["입점 준비", "주문 처리", "정산"] as const;

export const DEFAULT_SUPPLIER_GUIDE: SupplierGuideSettings = {
  orderCutoff: "평일 오전 9시 30분",
  orderSendTime: "평일 오전 10시 전후",
  shipLeadTime: "발주서를 받은 날 출고(늦어도 2일 이내)",
  invoiceDeadline: "출고 당일 오후 6시까지",
  settlementBasis: "한 달 동안 실제로 접수된 주문 건의 공급가를 모두 합산한 금액",
  settlementCycle: "월 1회 · 지난달 1일~말일 주문분",
  settlementPayDay: "매월 1일, 지난달 주문분을 정산해 드립니다",
  settlementOption: "물량이 크거나 주문 건이 많으면 주 단위 정산으로 바꿀 수 있습니다.",
  taxInvoice: "정산 금액으로 공급사가 두고푸드 앞으로 세금계산서(면세 상품은 계산서)를 발행합니다.",
  deductions: "출고 전 취소된 주문은 정산에서 빠지고, 공급사 사유(오배송·파손·품질)로 생긴 반품·교환 비용은 차감합니다.",
  returnPolicy: "반품·교환은 두고푸드가 확인한 뒤 안내드린 주소와 방법으로 진행합니다.",
  videos: [
    { id: "apply", group: "입점 준비", title: "입점 신청하기", description: "신청서 작성부터 제안서 메일 확인까지", url: "", duration: "" },
    { id: "product-info", group: "입점 준비", title: "상품 정보 보내기", description: "상품명·규격·공급가·이미지 정리 방법", url: "", duration: "" },
    { id: "order-sheet", group: "주문 처리", title: "발주서 확인하기", description: "메일로 받은 공급사별 발주서(엑셀) 보는 법", url: "", duration: "" },
    { id: "invoice", group: "주문 처리", title: "송장 등록·회신하기", description: "발주서 엑셀에 송장번호를 넣어 회신하는 법", url: "", duration: "" },
    { id: "cs", group: "주문 처리", title: "취소·반품·교환 처리", description: "출고 전 취소 확인과 반품 회수 진행", url: "", duration: "" },
    { id: "settlement", group: "정산", title: "정산 내역 확인·세금계산서", description: "월 정산 내역 확인과 세금계산서 발행", url: "", duration: "" }
  ]
};

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
    (Object.keys(SUPPLIER_TERM_LABELS) as Array<keyof SupplierGuideTerms>).map((key) => [key, clean(raw[key], 300) || DEFAULT_SUPPLIER_GUIDE[key]])
  ) as SupplierGuideTerms;
  const videos = Array.isArray(raw.videos)
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
