"use strict";
/* 도로명주소 검색 (행정안전부 도로명주소 개발자센터 ‘검색 API’)
   https://business.juso.go.kr/addrlink/openApi/apiExprn.do
   승인키(confmKey)는 서버 환경변수 JUSO_CONFM_KEY 에만 둔다 (브라우저에 노출하지 않음).
   GET /api/address/search?keyword=강남대로146길 28&page=1  →  { total, page, items:[{ zipCode, roadAddress, jibunAddress, building, roadAddressEn }] } */
const JUSO_URL = "https://business.juso.go.kr/addrlink/addrLinkApi.do";

/* 검색어에 쓰면 안 되는 특수문자·SQL 예약어를 걸러 낸다 (도로명주소 API 안내 기준) */
function cleanKeyword(text) {
  return String(text || "")
    .replace(/[%=><\[\]{}'";\\]/g, " ")
    .replace(/\b(OR|SELECT|INSERT|DELETE|UPDATE|CREATE|DROP|EXEC|UNION|FETCH|DECLARE|TRUNCATE)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

async function searchAddress({ keyword, page = 1, perPage = 10 }, { confmKey = process.env.JUSO_CONFM_KEY, fetchImpl = globalThis.fetch } = {}) {
  const q = cleanKeyword(keyword);
  if (q.length < 2) return { total: 0, page: 1, items: [] };
  if (!confmKey) throw Object.assign(new Error("주소 검색 승인키(JUSO_CONFM_KEY)가 설정되지 않았어요."), { status: 503 });
  const params = new URLSearchParams({ confmKey, currentPage: String(Math.max(1, Number(page) || 1)), countPerPage: String(Math.min(30, Math.max(1, Number(perPage) || 10))), keyword: q, resultType: "json" });
  const response = await fetchImpl(`${JUSO_URL}?${params}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw Object.assign(new Error(`주소 검색 서버 응답 오류 (${response.status})`), { status: 502 });
  const data = await response.json();
  const common = data?.results?.common || {};
  if (common.errorCode && common.errorCode !== "0") throw Object.assign(new Error(common.errorMessage || "주소 검색에 실패했어요."), { status: 400, code: common.errorCode });
  const items = (data?.results?.juso || []).map(row => ({
    zipCode: row.zipNo || "",
    roadAddress: row.roadAddr || row.roadAddrPart1 || "",
    jibunAddress: row.jibunAddr || "",
    building: row.bdNm || "",
    roadAddressEn: row.engAddr || ""
  }));
  return { total: Number(common.totalCount || items.length), page: Number(common.currentPage || page), items };
}

module.exports = { searchAddress, cleanKeyword };
