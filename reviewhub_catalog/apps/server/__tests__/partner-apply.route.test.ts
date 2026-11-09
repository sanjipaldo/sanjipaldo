// 공개 입점 신청 POST /api/catalog/partner
// - 봇 차단용 숨은 칸(예전 website, 지금 hp_extra)이 브라우저 자동 완성으로 채워져도 신청을 막지 않습니다(저장 + [확인 필요] 표시, 신청자 메일만 생략).
// - 홈페이지는 https:// 없이 써도 받고, 사업자등록번호는 형식을 따지지 않습니다.
// - 잘못된 칸이 있으면 어느 칸인지 알려 줍니다.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../_core/create-app";
import { executeSql } from "../_core/db";
import { applyMigrations } from "../_test/helpers";

const MAIL_ENV = ["RESEND_API_KEY", "SMTP_USER", "SMTP_PASS", "MAIL_NOTIFY_TO"] as const;

beforeAll(async () => {
  for (const key of MAIL_ENV) delete process.env[key];
  await applyMigrations();
});

beforeEach(async () => {
  await executeSql("DELETE FROM partner_deals");
  await executeSql("DELETE FROM sourcing_requests");
});

let counter = 0;
function application(overrides: Record<string, unknown> = {}) {
  counter += 1;
  return {
    companyName: "[테스트] 오라 샘플",
    businessType: "건강식품",
    productName: "유산균, 초유, 마누카꿀",
    representative: "김대표",
    businessNumber: "123-45-67890",
    shipFrom: "뉴질랜드",
    monthlyVolume: "90박스",
    salesChannels: "자사몰, 네이버쇼핑",
    referenceUrl: "https://example.com/",
    details: "오리지널/레몬\n각 수량이 다릅니다.",
    requesterName: "김담당",
    contact: "010-1234-5678",
    email: `apply-${counter}@example.com`,
    agreePrivacy: true,
    hp_extra: "",
    ...overrides
  };
}

async function post(body: unknown) {
  const res = await app.fetch(new Request("http://localhost/api/catalog/partner", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify(body)
  }));
  const json = (await res.json()) as { ok?: boolean; data?: { request?: { id: string; emailStatus: string | null } }; error?: { message?: string } };
  return { status: res.status, json };
}

async function stored(id: string) {
  const result = await executeSql("SELECT details, referenceUrl, emailStatus FROM sourcing_requests WHERE id = ?", [id]);
  const row = result.rows[0];
  return { details: String(row?.details ?? ""), referenceUrl: row?.referenceUrl == null ? null : String(row.referenceUrl), emailStatus: row?.emailStatus == null ? null : String(row.emailStatus) };
}

describe("POST /api/catalog/partner", () => {
  it("모든 칸을 채운 신청은 접수되고 업체 정보가 저장됩니다", async () => {
    const { status, json } = await post(application());
    expect(status).toBe(201);
    const saved = await stored(json.data!.request!.id);
    expect(saved.details).toContain("[업체 정보]");
    expect(saved.details).toContain("사업자등록번호: 123-45-67890");
    expect(saved.details).not.toContain("[확인 필요]");
    expect(saved.referenceUrl).toBe("https://example.com/");
  });

  it("예전 화면의 숨은 칸(website)이 자동 완성으로 채워져도 막지 않고 [확인 필요]로 저장합니다", async () => {
    const { status, json } = await post(application({ hp_extra: undefined, website: "https://example.com/" }));
    expect(status).toBe(201);
    const saved = await stored(json.data!.request!.id);
    expect(saved.details.startsWith("[확인 필요]")).toBe(true);
    expect(saved.details).toContain("[업체 정보]");
    // 남의 주소로 메일이 나가지 않게 신청자 안내 메일은 보내지 않습니다.
    expect(saved.emailStatus).toBe("skipped");
  });

  it("지금 화면의 숨은 칸(hp_extra)이 채워져도 접수됩니다", async () => {
    const { status, json } = await post(application({ hp_extra: "filled" }));
    expect(status).toBe(201);
    expect((await stored(json.data!.request!.id)).details.startsWith("[확인 필요]")).toBe(true);
  });

  it("홈페이지는 https:// 없이 써도 받고, 주소가 아니면 소개 칸에 입력값을 남깁니다", async () => {
    const plain = await post(application({ referenceUrl: "example.com/shop" }));
    expect(plain.status).toBe(201);
    expect((await stored(plain.json.data!.request!.id)).referenceUrl).toBe("https://example.com/shop");
    const text = await post(application({ referenceUrl: "네이버 스마트스토어 오라샵" }));
    expect(text.status).toBe(201);
    const saved = await stored(text.json.data!.request!.id);
    expect(saved.referenceUrl).toBeNull();
    expect(saved.details).toContain("홈페이지·스토어(입력값): 네이버 스마트스토어 오라샵");
  });

  it("사업자등록번호는 형식을 따지지 않습니다", async () => {
    const { status } = await post(application({ businessNumber: "없음(개인 농가)" }));
    expect(status).toBe(201);
  });

  it("잘못된 칸이 있으면 어느 칸인지 알려 줍니다", async () => {
    expect((await post(application({ productName: "" }))).json.error?.message).toBe("'주요 상품' 칸을 확인해 주세요.");
    expect((await post(application({ businessType: "" }))).json.error?.message).toBe("'업종' 칸을 확인해 주세요.");
    expect((await post(application({ email: "abc" }))).json.error?.message).toBe("이메일 주소를 확인해 주세요.");
    expect((await post(application({ agreePrivacy: false }))).json.error?.message).toBe("개인정보 수집·이용에 동의해 주세요.");
    expect((await executeSql("SELECT count(*) AS n FROM sourcing_requests")).rows[0]?.n).toBe(0);
  });
});
