// 공개 화면(사용방법·공개 단가표 등) 맨 위 "공급사 화면으로 돌아가기"(2026-11-26 관리자 요청: 뒤로 가기 말고 왼쪽 위 버튼으로 공급사 센터에 돌아오기).
// - 공급사 센터의 "공급사 사용방법"·"공개 단가표 보기"를 누를 때 이 탭(sessionStorage)에 돌아갈 공급사 화면 주소를 적어 둡니다.
// - 공개 화면 틀(PageFrame)은 그 기록이 있을 때만 이 줄을 보여 줍니다. 서버에 묻지 않으므로 일반 방문자 화면·속도에는 영향이 없습니다.
// - 로그아웃하면 기록을 지웁니다. 공개 화면 묶음에 들어가므로 공급사 센터의 다른 파일·CSS는 불러오지 않습니다.
// - 홈(/)은 미리 그려 둔 HTML(prerender)을 이어받으므로, 첫 화면은 줄 없이 그리고 붙은 직후(그리기 전)에 기록을 읽습니다.
import { useEffect, useLayoutEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const SUPPLIER_RETURN_KEY = "doogo-supplier-return";
const SUPPLIER_PATH = /^\/supplier\/[a-z]+$/;

export function rememberSupplierReturn(path: string) {
  try {
    window.sessionStorage.setItem(SUPPLIER_RETURN_KEY, SUPPLIER_PATH.test(path) ? path : "/supplier/home");
  } catch {
    // 저장할 수 없는 환경(사생활 보호 모드 등)이면 버튼 없이 지나갑니다.
  }
}

export function readSupplierReturn() {
  try {
    const value = window.sessionStorage.getItem(SUPPLIER_RETURN_KEY);
    return value && SUPPLIER_PATH.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function forgetSupplierReturn() {
  try {
    window.sessionStorage.removeItem(SUPPLIER_RETURN_KEY);
  } catch {
    // 지울 수 없는 환경이면 그대로 둡니다.
  }
}

const useBeforePaintEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function SupplierReturnBar() {
  const [path, setPath] = useState<string | null>(null);
  useBeforePaintEffect(() => { setPath(readSupplierReturn()); }, []);
  if (!path) return null;
  return (
    <div className="supplier-return-bar">
      <Link to={path} className="supplier-return-link"><ArrowLeft size={15} aria-hidden="true" />공급사 화면으로 돌아가기</Link>
    </div>
  );
}
