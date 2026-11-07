import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { DEFAULT_SUPPLIER_GUIDE, SUPPLIER_DEMO_VIDEO_IDS, hasSupplierDemo, parseSupplierGuide, supplierVideoEmbed } from "@repo/shared/supplier-guide";
import { buildPartnerProposalPdf, proposalFileName } from "../services/partner-proposal";
import { SUPPLIER_PROPOSAL_PAGES } from "../services/proposal-pdf-data";

describe("supplier guide settings", () => {
  it("falls back to defaults for empty or broken values", () => {
    expect(parseSupplierGuide(null)).toEqual(DEFAULT_SUPPLIER_GUIDE);
    expect(parseSupplierGuide("not json")).toEqual(DEFAULT_SUPPLIER_GUIDE);
    expect(parseSupplierGuide("[]").orderCutoff).toBe(DEFAULT_SUPPLIER_GUIDE.orderCutoff);
  });

  it("keeps saved terms and videos, filling blank terms with defaults", () => {
    const guide = parseSupplierGuide(JSON.stringify({
      invoiceDeadline: "출고 당일 오후 5시까지",
      settlementCycle: "  ",
      videos: [{ id: "a", group: "주문 처리", title: "송장 회신", url: "https://youtu.be/dQw4w9WgXcQ" }, { title: "" }]
    }));
    expect(guide.invoiceDeadline).toBe("출고 당일 오후 5시까지");
    expect(guide.settlementCycle).toBe(DEFAULT_SUPPLIER_GUIDE.settlementCycle);
    expect(guide.videos).toHaveLength(1);
    expect(guide.videos[0]).toMatchObject({ id: "a", title: "송장 회신", description: "", duration: "" });
  });

  it("describes the email-based order flow (AM/PM order mails, no supplier admin)", () => {
    expect(DEFAULT_SUPPLIER_GUIDE.orderSendTime).toContain("오전 1회");
    expect(DEFAULT_SUPPLIER_GUIDE.orderSendTime).toContain("오후 1회");
    expect(JSON.stringify(DEFAULT_SUPPLIER_GUIDE)).not.toContain("발주오라");
  });

  it("upgrades untouched old default texts and the old default video list", () => {
    const legacyVideos = ["apply", "product-info", "order-sheet", "invoice", "cs", "settlement"].map((id) => ({ id, group: "주문 처리", title: id, description: "", url: "", duration: "" }));
    const guide = parseSupplierGuide(JSON.stringify({ orderCutoff: "평일 오전 9시 30분", orderSendTime: "평일 오전 10시 전후", shipLeadTime: "발주서를 받은 날 출고(늦어도 2일 이내)", videos: legacyVideos }));
    expect(guide.orderCutoff).toBe(DEFAULT_SUPPLIER_GUIDE.orderCutoff);
    expect(guide.orderSendTime).toBe(DEFAULT_SUPPLIER_GUIDE.orderSendTime);
    expect(guide.shipLeadTime).toBe(DEFAULT_SUPPLIER_GUIDE.shipLeadTime);
    expect(guide.videos.map((video) => video.id)).toEqual(DEFAULT_SUPPLIER_GUIDE.videos.map((video) => video.id));
    // 관리자가 직접 고친 문구·주소를 넣은 영상 목록은 그대로 둡니다.
    const custom = parseSupplierGuide(JSON.stringify({ orderSendTime: "평일 오전 11시 · 오후 3시", videos: legacyVideos.map((video, index) => (index === 0 ? { ...video, url: "https://youtu.be/dQw4w9WgXcQ" } : video)) }));
    expect(custom.orderSendTime).toBe("평일 오전 11시 · 오후 3시");
    expect(custom.videos.map((video) => video.id)).toEqual(legacyVideos.map((video) => video.id));
  });

  it("ships a built-in demo for every default video", () => {
    expect(DEFAULT_SUPPLIER_GUIDE.videos.every((video) => hasSupplierDemo(video.id) && !video.url)).toBe(true);
    expect(SUPPLIER_DEMO_VIDEO_IDS).toHaveLength(6);
    expect(hasSupplierDemo("product-info")).toBe(false);
  });

  it("turns video links into embeds", () => {
    expect(supplierVideoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({ kind: "youtube", src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0" });
    expect(supplierVideoEmbed("https://youtu.be/dQw4w9WgXcQ?t=3").kind).toBe("youtube");
    expect(supplierVideoEmbed("https://youtube.com/shorts/dQw4w9WgXcQ").kind).toBe("youtube");
    expect(supplierVideoEmbed("https://vimeo.com/123456")).toEqual({ kind: "vimeo", src: "https://player.vimeo.com/video/123456" });
    expect(supplierVideoEmbed("https://cdn.example.com/guide.mp4").kind).toBe("file");
    expect(supplierVideoEmbed("https://example.com/watch").kind).toBe("link");
    expect(supplierVideoEmbed("javascript:alert(1)").kind).toBe("none");
    expect(supplierVideoEmbed("http://insecure.example.com/a.mp4").kind).toBe("none");
  });
});

describe("partner proposal pdf", () => {
  it("serves the designed A4 landscape proposal and stamps the company name on the cover", async () => {
    const generic = await buildPartnerProposalPdf({});
    expect(Buffer.from(generic.slice(0, 5)).toString()).toBe("%PDF-");
    const genericDoc = await PDFDocument.load(generic);
    expect(genericDoc.getPageCount()).toBe(SUPPLIER_PROPOSAL_PAGES);
    const size = genericDoc.getPage(0).getSize();
    expect(Math.round(size.width)).toBe(842);
    expect(Math.round(size.height)).toBe(595);

    const stamped = await buildPartnerProposalPdf({ companyName: "영동 햇살농원", date: new Date("2026-11-07T03:00:00Z") });
    const doc = await PDFDocument.load(stamped);
    expect(doc.getPageCount()).toBe(SUPPLIER_PROPOSAL_PAGES);
    expect(doc.getTitle()).toContain("영동 햇살농원");
    expect(stamped.length).toBeGreaterThan(generic.length);
    // Vercel 함수 응답 한도(4.5MB) 안이어야 내려받기·메일 첨부가 됩니다.
    expect(stamped.length).toBeLessThan(4.5 * 1024 * 1024);
  }, 30000);

  it("makes safe file names", () => {
    expect(proposalFileName(null)).toBe("두고푸드_공급사_입점제안서.pdf");
    expect(proposalFileName("가나/다:라")).toBe("두고푸드_입점제안서_가나 다 라.pdf");
  });
});
