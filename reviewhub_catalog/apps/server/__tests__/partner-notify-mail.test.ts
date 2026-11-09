import net from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PARTNER_NOTIFY_TO, buildPartnerNotifyMail, mailTransport, partnerAdminUrl, partnerNotifyRecipients, sendPartnerNotifyMail, type PartnerNotifyInput } from "../services/partner-mail";

const MAIL_ENV = ["RESEND_API_KEY", "MAIL_FROM", "MAIL_NOTIFY_TO", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(MAIL_ENV.map((key) => [key, process.env[key]]));
  for (const key of MAIL_ENV) delete process.env[key];
});
afterEach(() => {
  for (const key of MAIL_ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const sample: PartnerNotifyInput = {
  id: "req-123",
  createdAt: "2026-11-08T02:30:00.000Z",
  companyName: "[테스트] 봄날 브랜드",
  businessType: "브랜드사",
  productName: "유기농 사과즙 30포",
  requesterName: "김두고",
  contact: "010-1234-5678",
  email: "brand@example.com",
  referenceUrl: "https://smartstore.naver.com/example",
  representative: "김대표",
  businessNumber: "123-45-67890",
  shipFrom: "",
  monthlyVolume: "월 3,000박스",
  salesChannels: null,
  intro: "GAP 인증 <script>alert(1)</script>\n두 번째 줄"
};

describe("입점 신청 알림 메일(두고푸드 → cs.doogo@gmail.com)", () => {
  it("받는 주소는 MAIL_NOTIFY_TO, 비었거나 잘못되면 cs.doogo@gmail.com", () => {
    expect(partnerNotifyRecipients()).toEqual([DEFAULT_PARTNER_NOTIFY_TO]);
    expect(DEFAULT_PARTNER_NOTIFY_TO).toBe("cs.doogo@gmail.com");
    process.env.MAIL_NOTIFY_TO = "not-an-email";
    expect(partnerNotifyRecipients()).toEqual([DEFAULT_PARTNER_NOTIFY_TO]);
    process.env.MAIL_NOTIFY_TO = "md@example.com, cs@example.com;md@example.com";
    expect(partnerNotifyRecipients()).toEqual(["md@example.com", "cs@example.com"]);
  });

  it("신청 내용을 모두 담고(빈 선택 항목은 빼고) HTML을 안전하게 만듭니다", () => {
    const mail = buildPartnerNotifyMail(sample);
    expect(mail.subject).toBe("[두고푸드 입점 신청] [테스트] 봄날 브랜드 · 브랜드사 · 유기농 사과즙 30포");
    for (const value of ["김두고", "010-1234-5678", "brand@example.com", "김대표", "123-45-67890", "월 3,000박스", "https://smartstore.naver.com/example"]) {
      expect(mail.text).toContain(value);
      expect(mail.html).toContain(value);
    }
    expect(mail.text).not.toContain("출고지");
    expect(mail.text).not.toContain("현재 판매 채널");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("두 번째 줄");
    expect(mail.html).toContain(partnerAdminUrl("req-123"));
    expect(partnerAdminUrl("req-123")).toBe("https://doogofood.site/admin/sourcing?partner=req-123");
    expect(mail.text).toContain("2026년 11월 8일(일) 오전 11:30");
    // 휴대폰에서 잘리지 않게: 줄바꿈 막는 칸이 없고, 긴 이메일·주소는 줄을 바꿉니다.
    expect(mail.html).not.toContain("white-space:nowrap");
    expect(mail.html).toContain("word-break:break-all");
  });

  it("숨은 칸이 채워진 신청은 제목 앞에 [확인 필요]와 안내를 붙입니다", () => {
    const mail = buildPartnerNotifyMail({ ...sample, flagged: true });
    expect(mail.subject.startsWith("[확인 필요] [두고푸드 입점 신청]")).toBe(true);
    expect(mail.text).toContain("신청자 안내 메일은 보내지 않았습니다");
    expect(mail.html).toContain("확인 필요");
    expect(buildPartnerNotifyMail(sample).subject.startsWith("[두고푸드 입점 신청]")).toBe(true);
  });

  it("발송 방법: 설정 없음 → 보내지 않음, Gmail(SMTP) 앱 비밀번호, Resend 키가 있으면 Resend", async () => {
    expect(mailTransport()).toBe("none");
    expect(await sendPartnerNotifyMail(sample)).toBe("skipped");
    process.env.SMTP_USER = "cs.doogo@gmail.com";
    process.env.SMTP_PASS = "abcd efgh ijkl mnop";
    expect(mailTransport()).toBe("smtp");
    process.env.RESEND_API_KEY = "re_test";
    expect(mailTransport()).toBe("resend");
  });

  it("Gmail(SMTP)로 cs.doogo@gmail.com에 보내고, 답장은 신청자에게 갑니다", async () => {
    const smtp = await startFakeSmtp();
    try {
      process.env.SMTP_HOST = "127.0.0.1";
      process.env.SMTP_PORT = String(smtp.port);
      process.env.SMTP_USER = "cs.doogo@gmail.com";
      process.env.SMTP_PASS = "abcd efgh ijkl mnop";
      expect(await sendPartnerNotifyMail(sample)).toBe("sent");
      expect(smtp.auth[0]).toBe(Buffer.from("\0cs.doogo@gmail.com\0abcdefghijklmnop").toString("base64"));
      expect(smtp.rcpt).toEqual(["<cs.doogo@gmail.com>"]);
      const raw = smtp.messages[0] ?? "";
      expect(raw).toMatch(/^To: cs\.doogo@gmail\.com/m);
      expect(raw).toMatch(/^Reply-To: brand@example\.com/m);
      expect(raw).toMatch(/^From: .*<cs\.doogo@gmail\.com>/m);
      expect(decodeSubject(raw)).toBe("[두고푸드 입점 신청] [테스트] 봄날 브랜드 · 브랜드사 · 유기농 사과즙 30포");
    } finally {
      await smtp.close();
    }
  });
});

// 테스트용 SMTP 서버: AUTH PLAIN만 받고, 받은 메일 원문을 모읍니다.
async function startFakeSmtp() {
  const messages: string[] = [];
  const rcpt: string[] = [];
  const auth: string[] = [];
  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");
    let buffer = "";
    let inData = false;
    let data = "";
    const reply = (line: string) => socket.write(`${line}\r\n`);
    reply("220 fake.smtp ESMTP");
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      let index = buffer.indexOf("\r\n");
      while (index >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            messages.push(data);
            data = "";
            reply("250 OK queued");
          } else {
            data += `${line.startsWith("..") ? line.slice(1) : line}\r\n`;
          }
        } else {
          const command = line.slice(0, 4).toUpperCase();
          if (command === "EHLO") socket.write("250-fake.smtp\r\n250-AUTH PLAIN\r\n250 8BITMIME\r\n");
          else if (command === "AUTH") {
            auth.push(line.split(" ")[2] ?? "");
            reply("235 Authentication successful");
          } else if (command === "RCPT") {
            rcpt.push(line.replace(/^RCPT TO:/i, "").trim());
            reply("250 OK");
          } else if (command === "DATA") {
            inData = true;
            reply("354 End data with <CR><LF>.<CR><LF>");
          } else if (command === "QUIT") {
            reply("221 Bye");
            socket.end();
          } else reply("250 OK");
        }
        index = buffer.indexOf("\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as net.AddressInfo).port;
  return { port, messages, rcpt, auth, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

// "Subject: =?UTF-8?B?…?= =?UTF-8?Q?…?=" (여러 줄로 접힘) → 원래 글자
function decodeSubject(raw: string) {
  const header = raw.match(/^Subject: (.*(?:\r\n[ \t].*)*)/m)?.[1] ?? "";
  const words = Array.from(header.matchAll(/=\?UTF-8\?([BQ])\?([^?]*)\?=/gi));
  if (words.length === 0) return header.trim();
  const bytes = words.flatMap(([, encoding, text]) => {
    if (encoding.toUpperCase() === "B") return Array.from(Buffer.from(text, "base64"));
    return Array.from(Buffer.from(text.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))), "latin1"));
  });
  return Buffer.from(bytes).toString("utf8");
}
