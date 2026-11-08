// 입점 신청 메일: ① 신청자에게 접수 안내 + 공급사 입점 제안서 PDF, ② 두고푸드(cs.doogo@gmail.com)에 새 신청 알림(신청 내용 전부 · 답장하면 신청자에게 · 관리자 바로가기).
// 보내는 방법(둘 다 있으면 Resend를 씁니다). 설정이 없으면 보내지 않고 "skipped"로 기록합니다.
// - Gmail(또는 다른 SMTP): SMTP_USER(예: cs.doogo@gmail.com) + SMTP_PASS(Google 계정 "앱 비밀번호" 16자리, 띄어쓰기 상관없음).
//   SMTP_HOST·SMTP_PORT를 비우면 smtp.gmail.com:465(SSL). 보내는 사람은 SMTP_USER(또는 MAIL_FROM).
// - Resend API: RESEND_API_KEY + MAIL_FROM(예: "두고푸드 <md@doogofood.site>", Resend에서 도메인 인증 필요)
// - MAIL_NOTIFY_TO: 새 입점 신청 알림을 받을 주소(쉼표로 여러 개). 비우면 cs.doogo@gmail.com
import nodemailer, { type Transporter } from "nodemailer";

type PartnerMailInput = {
  companyName: string;
  requesterName: string;
  email: string;
  businessType: string;
  productName: string;
};

export type MailResult = "sent" | "failed" | "skipped";
export type MailAttachment = { filename: string; content: Uint8Array };
type MailMessage = { to: string[]; subject: string; html: string; text: string; attachments?: MailAttachment[]; replyTo?: string };

export const DEFAULT_PARTNER_NOTIFY_TO = "cs.doogo@gmail.com";
const SITE_URL = "https://doogofood.site";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

function smtpConfig() {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, "");
  if (!user || !pass) return null;
  const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT) || 465;
  return { host, port, secure: port === 465, auth: { user, pass } };
}

export type MailTransport = "resend" | "smtp" | "none";

export function mailTransport(): MailTransport {
  if (process.env.RESEND_API_KEY?.trim()) return "resend";
  if (smtpConfig()) return "smtp";
  return "none";
}

export function isMailConfigured() {
  return mailTransport() !== "none";
}

function fromAddress(transport: MailTransport) {
  const configured = process.env.MAIL_FROM?.trim();
  if (configured) return configured;
  if (transport === "smtp") return `"두고푸드" <${process.env.SMTP_USER?.trim()}>`;
  return "두고푸드 <onboarding@resend.dev>";
}

// 같은 설정이면 SMTP 연결 설정을 다시 쓰고(함수가 살아 있는 동안), 설정이 바뀌면 새로 만듭니다.
let smtpCache: { key: string; transporter: Transporter } | null = null;
function smtpTransporter(config: NonNullable<ReturnType<typeof smtpConfig>>) {
  const key = `${config.host}:${config.port}:${config.auth.user}:${config.auth.pass.length}`;
  if (!smtpCache || smtpCache.key !== key) {
    smtpCache = { key, transporter: nodemailer.createTransport({ ...config, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 }) };
  }
  return smtpCache.transporter;
}

async function sendMail(message: MailMessage): Promise<MailResult> {
  const transport = mailTransport();
  if (transport === "none" || message.to.length === 0) return "skipped";
  const from = fromAddress(transport);
  try {
    if (transport === "resend") {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY?.trim()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
          ...(message.attachments?.length ? { attachments: message.attachments.map((file) => ({ filename: file.filename, content: Buffer.from(file.content).toString("base64") })) } : {})
        }),
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) console.error("[mail] resend failed", response.status);
      return response.ok ? "sent" : "failed";
    }
    const config = smtpConfig();
    if (!config) return "skipped";
    await smtpTransporter(config).sendMail({
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      ...(message.attachments?.length ? { attachments: message.attachments.map((file) => ({ filename: file.filename, content: Buffer.from(file.content) })) } : {})
    });
    return "sent";
  } catch (error) {
    console.error("[mail] send failed", transport, error instanceof Error ? error.message : error);
    return "failed";
  }
}

const GUIDE_URL = "https://doogofood.site/how-to/supplier";

export async function sendPartnerReceivedMail(input: PartnerMailInput, proposal?: MailAttachment | null): Promise<MailResult> {
  const company = escapeHtml(input.companyName);
  const name = escapeHtml(input.requesterName);
  const product = escapeHtml(input.productName);
  const subject = `[두고푸드] ${input.companyName} 입점 신청이 접수되었습니다 · 입점 제안서 첨부`;
  const text = [
    `${input.requesterName}님, 안녕하세요. 두고푸드입니다.`,
    "",
    `${input.companyName}의 입점 신청이 정상적으로 접수되었습니다.`,
    `주요 상품: ${input.productName}`,
    "",
    proposal ? "주문 처리 방법과 정산 기준을 정리한 「공급사 입점 제안서(PDF)」를 첨부해 드립니다." : "",
    `사용방법 안내: ${GUIDE_URL}`,
    "",
    "담당 MD가 신청 내용을 검토한 뒤 영업일 기준 2~3일 안에 입력하신 연락처로 연락드리겠습니다.",
    "문의: 카카오톡 채널 https://pf.kakao.com/_NyuVn",
    "",
    "두고푸드 데이터 센터 · https://doogofood.site"
  ].filter((line, index, lines) => line !== "" || lines[index - 1] !== "").join("\n");
  const html = `<!doctype html><html lang="ko"><body style="margin:0;padding:24px;background:#f2f4f1;font-family:Pretendard,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#0e0f0c">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e4e8e1;border-radius:20px">
<tr><td style="padding:28px 28px 8px"><div style="display:inline-block;padding:4px 10px;border-radius:999px;background:#e2f6d5;color:#163300;font-size:12px;font-weight:700">입점 신청 접수 완료</div>
<h1 style="margin:16px 0 8px;font-size:22px;line-height:1.4">${name}님, 입점 신청이 접수되었습니다.</h1>
<p style="margin:0;color:#454745;font-size:15px;line-height:1.7">두고푸드에 관심 가져 주셔서 감사합니다.<br>담당 MD가 신청 내용을 검토한 뒤 <b>영업일 기준 2~3일 안에</b> 입력하신 연락처로 연락드리겠습니다.</p>
${proposal ? `<p style="margin:14px 0 0;padding:12px 14px;border-radius:12px;background:#e2f6d5;color:#163300;font-size:14px;line-height:1.6">📎 주문 처리 방법과 정산 기준을 정리한 <b>공급사 입점 제안서(PDF)</b>를 첨부해 드립니다.</p>` : ""}
<p style="margin:14px 0 0"><a href="${GUIDE_URL}" style="display:inline-block;padding:11px 18px;border-radius:999px;background:#9fe870;color:#163300;font-size:14px;font-weight:700;text-decoration:none">공급사 사용방법 보기</a></p></td></tr>
<tr><td style="padding:16px 28px"><table role="presentation" width="100%" style="background:#f7faf6;border-radius:14px"><tr><td style="padding:14px 16px;font-size:14px;line-height:1.8;color:#454745">
<b style="color:#0e0f0c">업체명</b> ${company}<br><b style="color:#0e0f0c">주요 상품</b> ${product}</td></tr></table></td></tr>
<tr><td style="padding:8px 28px 28px;font-size:13px;color:#868685;line-height:1.7">문의: <a href="https://pf.kakao.com/_NyuVn" style="color:#054d28">카카오톡 1:1 상담</a><br>두고푸드 데이터 센터 · <a href="https://doogofood.site" style="color:#054d28">doogofood.site</a></td></tr>
</table></body></html>`;
  return sendMail({ to: [input.email], subject, html, text, attachments: proposal ? [proposal] : [] });
}

// 관리자 > 입점·소싱 요청에서 "제안서 메일 보내기"를 누르면 같은 제안서 PDF를 다시 보냅니다.
export async function sendPartnerProposalMail(input: { companyName: string; requesterName: string; email: string }, proposal: MailAttachment): Promise<MailResult> {
  const company = escapeHtml(input.companyName);
  const name = escapeHtml(input.requesterName);
  const subject = `[두고푸드] ${input.companyName} 공급사 입점 제안서를 보내드립니다`;
  const text = [
    `${input.requesterName}님, 안녕하세요. 두고푸드입니다.`,
    "",
    `${input.companyName} 담당자님께 「공급사 입점 제안서(PDF)」를 보내드립니다.`,
    "주문 처리 방법과 정산 기준을 확인해 주세요.",
    `사용방법 안내: ${GUIDE_URL}`,
    "",
    "문의: 카카오톡 채널 https://pf.kakao.com/_NyuVn",
    "두고푸드 데이터 센터 · https://doogofood.site"
  ].join("\n");
  const html = `<!doctype html><html lang="ko"><body style="margin:0;padding:24px;background:#f2f4f1;font-family:Pretendard,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#0e0f0c">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e4e8e1;border-radius:20px">
<tr><td style="padding:28px"><div style="display:inline-block;padding:4px 10px;border-radius:999px;background:#e2f6d5;color:#163300;font-size:12px;font-weight:700">공급사 입점 제안서</div>
<h1 style="margin:16px 0 8px;font-size:22px;line-height:1.4">${name}님, ${company} 입점 제안서를 보내드립니다.</h1>
<p style="margin:0;color:#454745;font-size:15px;line-height:1.7">주문 처리 방법과 정산 기준을 정리한 PDF를 첨부했습니다.</p>
<p style="margin:16px 0 0"><a href="${GUIDE_URL}" style="display:inline-block;padding:11px 18px;border-radius:999px;background:#9fe870;color:#163300;font-size:14px;font-weight:700;text-decoration:none">공급사 사용방법 보기</a></p>
<p style="margin:18px 0 0;font-size:13px;color:#868685;line-height:1.7">문의: <a href="https://pf.kakao.com/_NyuVn" style="color:#054d28">카카오톡 1:1 상담</a> · <a href="https://doogofood.site" style="color:#054d28">doogofood.site</a></p></td></tr>
</table></body></html>`;
  return sendMail({ to: [input.email], subject, html, text, attachments: [proposal] });
}

// ───────── 두고푸드 알림: 새 입점 신청이 들어오면 신청 내용 전부를 회사 메일로 보냅니다 ─────────

export type PartnerNotifyInput = {
  id: string;
  createdAt: string;
  companyName: string;
  businessType: string;
  productName: string;
  requesterName: string;
  contact: string;
  email: string;
  referenceUrl?: string | null;
  representative?: string | null;
  businessNumber?: string | null;
  shipFrom?: string | null;
  monthlyVolume?: string | null;
  salesChannels?: string | null;
  intro?: string | null;
};

// 알림 받을 주소: MAIL_NOTIFY_TO(쉼표·세미콜론·띄어쓰기로 여러 개), 비었거나 잘못되면 cs.doogo@gmail.com
export function partnerNotifyRecipients() {
  const list = (process.env.MAIL_NOTIFY_TO ?? "").split(/[,;\s]+/).map((value) => value.trim()).filter((value) => EMAIL_PATTERN.test(value));
  return list.length > 0 ? Array.from(new Set(list)) : [DEFAULT_PARTNER_NOTIFY_TO];
}

export const partnerAdminUrl = (id: string) => `${SITE_URL}/admin/sourcing?partner=${encodeURIComponent(id)}`;

// "2026년 11월 8일(일) 오후 8:23" (한국 시간)
const seoulDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit", hour12: true })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}년 ${parts.month}월 ${parts.day}일(${parts.weekday}) ${parts.dayPeriod} ${parts.hour}:${parts.minute}`;
};

const shorten = (value: string, max: number) => (Array.from(value).length > max ? `${Array.from(value).slice(0, max - 1).join("")}…` : value);

// 메일 제목·본문(HTML·글자)을 만듭니다. 비어 있는 선택 항목은 줄을 빼고, 업체·상품 소개는 따로 보여 줍니다.
export function buildPartnerNotifyMail(input: PartnerNotifyInput) {
  const rows: Array<[string, string]> = [
    ["업체명", input.companyName],
    ["업종", input.businessType],
    ["주요 상품", input.productName],
    ["담당자", input.requesterName],
    ["연락처", input.contact],
    ["이메일", input.email],
    ["대표자", input.representative ?? ""],
    ["사업자등록번호", input.businessNumber ?? ""],
    ["출고지", input.shipFrom ?? ""],
    ["월 공급 가능 물량", input.monthlyVolume ?? ""],
    ["현재 판매 채널", input.salesChannels ?? ""],
    ["홈페이지·스토어", input.referenceUrl ?? ""]
  ];
  const filled = rows.map(([label, value]) => [label, value.trim()] as [string, string]).filter(([, value]) => value);
  const intro = input.intro?.trim() ?? "";
  const when = seoulDateTime(input.createdAt);
  const adminUrl = partnerAdminUrl(input.id);
  const subject = `[두고푸드 입점 신청] ${shorten(input.companyName, 30)} · ${input.businessType} · ${shorten(input.productName, 30)}`;
  const text = [
    `새 입점 신청이 접수되었습니다 (${when}).`,
    "",
    ...filled.map(([label, value]) => `${label}: ${value}`),
    ...(intro ? ["", "[업체·상품 소개]", intro] : []),
    "",
    `관리자에서 보기: ${adminUrl}`,
    `이 메일에 답장하면 신청자(${input.email})에게 바로 갑니다.`,
    "",
    "두고푸드 DB센터 · doogofood.site 입점 신청 팝업에서 자동으로 보낸 메일입니다."
  ].join("\n");
  const cell = (value: string) => escapeHtml(value).replace(/\n/g, "<br>");
  // 휴대폰 메일 앱에서도 잘리지 않게: 긴 이메일·주소는 줄을 바꾸고, 항목 이름 칸은 비율로 둡니다.
  const linkStyle = "color:#054d28;word-break:break-all";
  const link = (label: string, value: string) => {
    if (label === "이메일") return `<a href="mailto:${escapeHtml(value)}" style="${linkStyle}">${escapeHtml(value)}</a>`;
    if (label === "연락처") return `<a href="tel:${escapeHtml(value.replace(/[^0-9+]/g, ""))}" style="${linkStyle}">${escapeHtml(value)}</a>`;
    if (label === "홈페이지·스토어" && /^https?:\/\//i.test(value)) return `<a href="${escapeHtml(value)}" style="${linkStyle}">${escapeHtml(value)}</a>`;
    return cell(value);
  };
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px 12px;background:#f2f4f1;font-family:Pretendard,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#0e0f0c">
<table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e4e8e1;border-radius:20px">
<tr><td style="padding:26px 24px 6px"><div style="display:inline-block;padding:4px 10px;border-radius:999px;background:#163300;color:#9fe870;font-size:12px;font-weight:700">새 입점 신청</div>
<h1 style="margin:14px 0 6px;font-size:21px;line-height:1.4;word-break:keep-all;overflow-wrap:anywhere">${escapeHtml(input.companyName)} 입점 신청이 들어왔어요</h1>
<p style="margin:0;color:#6a6c6a;font-size:13.5px;word-break:keep-all">${escapeHtml(when)} 접수 · ${escapeHtml(input.businessType)}</p></td></tr>
<tr><td style="padding:14px 24px 4px"><table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px;line-height:1.6">
${filled.map(([label, value]) => `<tr><td style="width:30%;padding:9px 10px;border-top:1px solid #edf0ea;color:#6a6c6a;font-weight:700;vertical-align:top;word-break:keep-all">${escapeHtml(label)}</td><td style="padding:9px 10px;border-top:1px solid #edf0ea;color:#0e0f0c;vertical-align:top">${link(label, value)}</td></tr>`).join("\n")}
</table></td></tr>
${intro ? `<tr><td style="padding:10px 24px 0"><div style="padding:14px 16px;border-radius:14px;background:#f7faf6;font-size:14px;line-height:1.7;color:#2f312f;word-break:break-word"><b style="display:block;margin-bottom:4px;color:#163300">업체·상품 소개</b>${cell(intro)}</div></td></tr>` : ""}
<tr><td style="padding:18px 24px 6px"><a href="${escapeHtml(adminUrl)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#9fe870;color:#163300;font-size:14px;font-weight:800;line-height:1.4;text-decoration:none;word-break:keep-all">관리자에서 보기 · 진행 단계 관리</a></td></tr>
<tr><td style="padding:10px 24px 26px;font-size:12.5px;color:#868685;line-height:1.7;word-break:keep-all">이 메일에 <b>답장하면 신청자</b>(<span style="word-break:break-all">${escapeHtml(input.email)}</span>)<b>에게 바로</b> 갑니다.<br>두고푸드 DB센터 · doogofood.site 입점 신청 팝업에서 자동으로 보낸 메일입니다.</td></tr>
</table></body></html>`;
  return { subject, html, text };
}

export async function sendPartnerNotifyMail(input: PartnerNotifyInput): Promise<MailResult> {
  const { subject, html, text } = buildPartnerNotifyMail(input);
  return sendMail({ to: partnerNotifyRecipients(), subject, html, text, replyTo: input.email });
}
