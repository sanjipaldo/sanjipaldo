// 위탁셀러 사용방법(/how-to/seller) 사용법 영상 목록입니다. 관리자 > 사용방법 관리 > 위탁셀러에서 content_settings "seller_guide"(JSON)로 저장하며,
// 저장한 적이 없거나 잘못된 값이면 아래 기본 목록(애니메이션 안내 영상 8편)을 씁니다. 영상 주소(YouTube·Vimeo·mp4)를 넣으면 그 영상을 재생합니다.
// 위탁셀러 거래 방식: 두고푸드 DB센터 단가표에서 상품을 고르고, 고객 주문은 두고푸드 도매몰(발주오라)에 입력합니다.
// 주문 마감·송장·CS 기준 문구는 공지사항 설정(guide_sections)을 함께 씁니다.
import { parseGuideVideoList, type SupplierGuideVideo } from "./supplier-guide";

export const SELLER_GUIDE_SETTING_KEY = "seller_guide";

export type SellerGuideSettings = { videos: SupplierGuideVideo[] };

export const SELLER_SHOP_URL = "https://shop.baljuora.com/doogofood";

export const SELLER_VIDEO_GROUPS = ["한눈에 보기", "상품 찾기", "주문하기", "취소·반품"] as const;

// 화면에 기본으로 들어 있는 위탁셀러 안내 영상(애니메이션)의 id. 영상 주소가 비어 있으면 이 안내 영상을 재생합니다.
export const SELLER_DEMO_VIDEO_IDS = ["seller-overview", "seller-find", "seller-price", "seller-order", "seller-excel", "seller-tracking", "seller-cancel", "seller-return"] as const;
export const hasSellerDemo = (id: string) => (SELLER_DEMO_VIDEO_IDS as readonly string[]).includes(id);

// 도매몰 실제 화면은 발주오라 공식 영상으로 함께 안내합니다(새 창으로 열기).
export const SELLER_OFFICIAL_VIDEOS = [
  { title: "주문입력 하는법", channel: "발주오라 공식 영상", url: "https://youtu.be/HzgfyAkll-Y" },
  { title: "주문취소 하는법", channel: "발주오라 공식 영상", url: "https://youtu.be/5RtBMjW032g" }
] as const;

export const DEFAULT_SELLER_GUIDE: SellerGuideSettings = {
  videos: [
    { id: "seller-overview", group: "한눈에 보기", title: "두고푸드로 판매하는 방법", description: "단가표에서 고르고, 도매몰에 주문만 넣으면 출고·송장은 두고푸드가", url: "", duration: "" },
    { id: "seller-find", group: "상품 찾기", title: "단가표에서 상품 찾기", description: "공급가·판매가·배송비·품절 확인하고 상품 사진 받기", url: "", duration: "" },
    { id: "seller-price", group: "상품 찾기", title: "가격변동·품절 확인하기", description: "주문 전에 오늘 바뀐 가격과 품절 상품 확인", url: "", duration: "" },
    { id: "seller-order", group: "주문하기", title: "도매몰에 주문 입력하기", description: "주문 입력 › 단일 주문 입력으로 한 건씩 등록", url: "", duration: "" },
    { id: "seller-excel", group: "주문하기", title: "엑셀로 대량 주문하기", description: "주문서 엑셀을 올리고 상품 매칭 후 한 번에 등록", url: "", duration: "" },
    { id: "seller-tracking", group: "주문하기", title: "송장번호 확인하기", description: "배송중 주문의 송장을 엑셀로 받아 내 판매처에 발송처리", url: "", duration: "" },
    { id: "seller-cancel", group: "취소·반품", title: "주문 취소하기", description: "출고 전까지 전체 주문 리스트에서 바로 취소", url: "", duration: "" },
    { id: "seller-return", group: "취소·반품", title: "반품·교환 접수하기", description: "고객 수령 후 24시간 안에 사진 3장과 함께", url: "", duration: "" }
  ]
};

// 저장된 JSON을 읽어 기본 목록과 합칩니다(영상 목록이 없거나 잘못되면 기본 목록, 최대 30개).
export function parseSellerGuide(value?: string | null): SellerGuideSettings {
  let raw: Record<string, unknown> = {};
  if (value) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) raw = parsed as Record<string, unknown>;
    } catch {
      raw = {};
    }
  }
  return { videos: parseGuideVideoList(raw.videos, SELLER_VIDEO_GROUPS[0]) || DEFAULT_SELLER_GUIDE.videos };
}
