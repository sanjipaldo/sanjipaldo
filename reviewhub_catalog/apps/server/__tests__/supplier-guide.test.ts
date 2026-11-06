import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { DEFAULT_SUPPLIER_GUIDE, parseSupplierGuide, supplierVideoEmbed } from "@repo/shared/supplier-guide";
import { buildPartnerProposalPdf, proposalFileName } from "../services/partner-proposal";

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
  it("builds a Korean A4 proposal with the company name", async () => {
    const bytes = await buildPartnerProposalPdf({ companyName: "영동 햇살농원", guide: DEFAULT_SUPPLIER_GUIDE, productCount: 1866 });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(4);
    expect(doc.getTitle()).toContain("영동 햇살농원");
  }, 20000);

  it("makes safe file names", () => {
    expect(proposalFileName(null)).toBe("두고푸드_공급사_입점제안서.pdf");
    expect(proposalFileName("가나/다:라")).toBe("두고푸드_입점제안서_가나 다 라.pdf");
  });
});
