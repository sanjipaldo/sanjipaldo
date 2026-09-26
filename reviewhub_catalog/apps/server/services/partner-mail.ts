// 입점 신청 접수 안내 메일(Resend API). RESEND_API_KEY가 없으면 발송하지 않고 "skipped"로 기록합니다.
// - MAIL_FROM: 보내는 사람(예: "두고푸드 <md@doogofood.site>", Resend에서 도메인 인증 필요)
// - MAIL_NOTIFY_TO: (선택) 새 입점 신청을 알려 받을 MD 이메일
type PartnerMailInput = {
  companyName: string;
  requesterName: string;
  email: string;
  businessType: string;
  productName: string;
};

export type MailResult = "sent" | "failed" | "skipped";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

async function sendMail(to: string, subject: string, html: string, text: string): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return "skipped";
  const from = process.env.MAIL_FROM?.trim() || "두고푸드 <onboarding@resend.dev>";
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(8000)
    });
    return response.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

export async function sendPartnerReceivedMail(input: PartnerMailInput): Promise<MailResult> {
  const company = escapeHtml(input.companyName);
  const name = escapeHtml(input.requesterName);
  const product = escapeHtml(input.productName);
  const subject = `[두고푸드] ${input.companyName} 입점 신청이 접수되었습니다`;
  const text = [
    `${input.requesterName}님, 안녕하세요. 두고푸드입니다.`,
    "",
    `${input.companyName}의 입점 신청이 정상적으로 접수되었습니다.`,
    `주요 상품: ${input.productName}`,
    "",
    "담당 MD가 신청 내용을 검토한 뒤 영업일 기준 2~3일 안에 입력하신 연락처로 연락드리겠습니다.",
    "문의: 카카오톡 채널 https://pf.kakao.com/_NyuVn",
    "",
    "두고푸드 데이터 센터 · https://doogofood.site"
  ].join("\n");
  const html = `<!doctype html><html lang="ko"><body style="margin:0;padding:24px;background:#f2f4f1;font-family:Pretendard,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#0e0f0c">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e4e8e1;border-radius:20px">
<tr><td style="padding:28px 28px 8px"><div style="display:inline-block;padding:4px 10px;border-radius:999px;background:#e2f6d5;color:#163300;font-size:12px;font-weight:700">입점 신청 접수 완료</div>
<h1 style="margin:16px 0 8px;font-size:22px;line-height:1.4">${name}님, 입점 신청이 접수되었습니다.</h1>
<p style="margin:0;color:#454745;font-size:15px;line-height:1.7">두고푸드에 관심 가져 주셔서 감사합니다.<br>담당 MD가 신청 내용을 검토한 뒤 <b>영업일 기준 2~3일 안에</b> 입력하신 연락처로 연락드리겠습니다.</p></td></tr>
<tr><td style="padding:16px 28px"><table role="presentation" width="100%" style="background:#f7faf6;border-radius:14px"><tr><td style="padding:14px 16px;font-size:14px;line-height:1.8;color:#454745">
<b style="color:#0e0f0c">업체명</b> ${company}<br><b style="color:#0e0f0c">주요 상품</b> ${product}</td></tr></table></td></tr>
<tr><td style="padding:8px 28px 28px;font-size:13px;color:#868685;line-height:1.7">문의: <a href="https://pf.kakao.com/_NyuVn" style="color:#054d28">카카오톡 1:1 상담</a><br>두고푸드 데이터 센터 · <a href="https://doogofood.site" style="color:#054d28">doogofood.site</a></td></tr>
</table></body></html>`;
  const result = await sendMail(input.email, subject, html, text);
  const notifyTo = process.env.MAIL_NOTIFY_TO?.trim();
  if (notifyTo && result !== "skipped") {
    await sendMail(notifyTo, `[입점 신청] ${input.companyName} · ${input.businessType}`, `<p>${company} (${escapeHtml(input.businessType)}) · ${name} · ${escapeHtml(input.email)}<br>주요 상품: ${product}</p><p>관리자 &gt; 입점·소싱 요청에서 확인해 주세요.</p>`, `${input.companyName} (${input.businessType}) · ${input.requesterName} · ${input.email}\n주요 상품: ${input.productName}`);
  }
  return result;
}
