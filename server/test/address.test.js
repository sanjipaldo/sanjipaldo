"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { searchAddress, cleanKeyword } = require("../src/address");

test("검색어 정리: 특수문자·예약어 제거", () => {
  assert.equal(cleanKeyword("강남대로146길 28 <script>"), "강남대로146길 28 script");
  assert.equal(cleanKeyword("테헤란로 OR 1=1"), "테헤란로 1 1");
});

test("도로명주소 API 결과를 앱 형식으로 바꾼다", async () => {
  let called = "";
  const fetchImpl = async url => { called = url; return { ok: true, json: async () => ({ results: { common: { errorCode: "0", totalCount: "1", currentPage: "1" }, juso: [{ zipNo: "06125", roadAddr: "서울특별시 강남구 강남대로146길 28 (논현동)", jibunAddr: "서울특별시 강남구 논현동 202-3", bdNm: "", engAddr: "28 Gangnam-daero 146-gil" }] } }) }; };
  const result = await searchAddress({ keyword: "강남대로146길 28" }, { confmKey: "TESTKEY", fetchImpl });
  assert.match(called, /confmKey=TESTKEY/);
  assert.match(called, /resultType=json/);
  assert.equal(result.total, 1);
  assert.deepEqual(result.items[0], { zipCode: "06125", roadAddress: "서울특별시 강남구 강남대로146길 28 (논현동)", jibunAddress: "서울특별시 강남구 논현동 202-3", building: "", roadAddressEn: "28 Gangnam-daero 146-gil" });
});

test("승인키가 없으면 503", async () => {
  await assert.rejects(searchAddress({ keyword: "강남대로" }, { confmKey: "" }), error => error.status === 503);
});

test("API 오류 코드는 메시지로 돌려준다", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ results: { common: { errorCode: "E0005", errorMessage: "검색어가 입력되지 않았습니다." }, juso: null } }) });
  await assert.rejects(searchAddress({ keyword: "강남대로" }, { confmKey: "K", fetchImpl }), /검색어가 입력되지/);
});
