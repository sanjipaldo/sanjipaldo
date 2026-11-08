import { describe, expect, it } from "vitest";
import { DEFAULT_SELLER_GUIDE, SELLER_DEMO_VIDEO_IDS, SELLER_OFFICIAL_VIDEOS, SELLER_SHOP_URL, SELLER_VIDEO_GROUPS, hasSellerDemo, parseSellerGuide } from "@repo/shared/seller-guide";
import { hasSupplierDemo, supplierVideoEmbed } from "@repo/shared/supplier-guide";

describe("seller guide settings", () => {
  it("falls back to the default video list for empty or broken values", () => {
    expect(parseSellerGuide(null)).toEqual(DEFAULT_SELLER_GUIDE);
    expect(parseSellerGuide("not json")).toEqual(DEFAULT_SELLER_GUIDE);
    expect(parseSellerGuide("[1,2]")).toEqual(DEFAULT_SELLER_GUIDE);
    expect(parseSellerGuide(JSON.stringify({ videos: "x" }))).toEqual(DEFAULT_SELLER_GUIDE);
  });

  it("keeps a saved list (titles required, max 30, blank group → first group)", () => {
    const guide = parseSellerGuide(JSON.stringify({
      videos: [
        { id: "seller-order", group: "", title: " 주문 입력 ", url: "https://youtu.be/HzgfyAkll-Y" },
        { id: "x", title: "" },
        ...Array.from({ length: 40 }, (_, index) => ({ id: `v${index}`, group: "주문하기", title: `영상 ${index}` }))
      ]
    }));
    expect(guide.videos).toHaveLength(29);
    expect(guide.videos[0]).toMatchObject({ id: "seller-order", group: SELLER_VIDEO_GROUPS[0], title: "주문 입력", url: "https://youtu.be/HzgfyAkll-Y", description: "", duration: "" });
    expect(parseSellerGuide(JSON.stringify({ videos: [] })).videos).toEqual([]);
  });

  it("ships a built-in animated demo for every default video, separate from the supplier demos", () => {
    expect(SELLER_DEMO_VIDEO_IDS).toHaveLength(8);
    expect(DEFAULT_SELLER_GUIDE.videos.map((video) => video.id)).toEqual([...SELLER_DEMO_VIDEO_IDS]);
    expect(DEFAULT_SELLER_GUIDE.videos.every((video) => hasSellerDemo(video.id) && !video.url && SELLER_VIDEO_GROUPS.includes(video.group as (typeof SELLER_VIDEO_GROUPS)[number]))).toBe(true);
    expect(SELLER_DEMO_VIDEO_IDS.some((id) => hasSupplierDemo(id))).toBe(false);
  });

  it("points sellers to the DOOGO wholesale shop and the official Baljuora videos", () => {
    expect(SELLER_SHOP_URL).toBe("https://shop.baljuora.com/doogofood");
    expect(SELLER_OFFICIAL_VIDEOS.map((video) => supplierVideoEmbed(video.url).kind)).toEqual(["youtube", "youtube"]);
  });
});
