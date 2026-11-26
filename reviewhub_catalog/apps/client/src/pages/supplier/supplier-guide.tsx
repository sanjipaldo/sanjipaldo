// 공급사 센터 위 줄 "공급사 안내" 버튼(2026-11-26 관리자 요청).
// - 두고푸드 공급사 설명서(PDF)를 새 탭으로 엽니다. 공급사 센터(로그인한 공급사)에만 있는 버튼입니다.
// - PDF 원본: apps/server/assets/guide/supplier-guide.html → scripts/render-supplier-guide-pdf.mjs 로 만듭니다.
// - 링크는 관리자가 PDF를 올린 뒤 따로 알려 줍니다. 비어 있는 동안은 눌렀을 때 "준비 중" 안내만 보여 줍니다.
import { FileText } from "lucide-react";
import { toast } from "sonner";

export const SUPPLIER_GUIDE_PDF_URL = "";

export const SUPPLIER_GUIDE_PENDING_MESSAGE = "공급사 설명서(PDF)를 준비하고 있어요. 곧 여기서 열어 볼 수 있어요.";

export function SupplierGuideButton({ url = SUPPLIER_GUIDE_PDF_URL }: { url?: string }) {
  const href = url.trim();
  if (href) {
    return (
      <a className="today-chip sup-guide-chip" href={href} target="_blank" rel="noopener noreferrer" title="두고푸드 공급사 설명서(PDF)를 새 창으로 열어요">
        <FileText size={14} aria-hidden="true" />공급사 안내
      </a>
    );
  }
  return (
    <button type="button" className="today-chip sup-guide-chip" onClick={() => toast(SUPPLIER_GUIDE_PENDING_MESSAGE)}>
      <FileText size={14} aria-hidden="true" />공급사 안내
    </button>
  );
}
