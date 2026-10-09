// 장면별 녹화: node scenes.js lp free home care student admin
const L = require("./lib");
const fs = require("fs");
const path = require("path");
const OUT = path.join(L.SP, "out");
fs.mkdirSync(OUT, { recursive: true });
const PHONE = [640, 1300], DESK = [1440, 900];
const S = L.sleep;

const scenes = {
  // 1) 강의 소개 페이지: 내려가며 둘러보고 → 수강 신청 버튼 → 신청 화면
  async lp(b) {
    const c = await L.context(b, "phone"); const p = await c.newPage();
    await p.goto(L.B + "#/p/moon"); await S(1500);
    const rec = await L.record(p, async () => {
      await S(900);
      await L.point(p, ".lp-hero .lp-btn-primary", { fy: 0.5 }); await S(500);
      await L.moveTo(p, 0.78, 0.7);
      await L.scrollBy(p, 760, 1300); await S(700);
      await L.scrollBy(p, 900, 1400); await S(800);
      await L.scrollBy(p, 1000, 1400); await S(700);
      await L.scrollBy(p, 1100, 1500); await S(800);
      await L.scrollBy(p, 1200, 1500); await S(700);
      await L.scrollBy(p, 1200, 1500); await S(600);
      await L.tap(p, 'a[href*="signup"]:has-text("수강 신청하기")', { nth: 1, after: 1500, at: 0.45 });
      await L.point(p, "#lg-name, input", {}); await S(1200);
    });
    await c.close();
    return L.encode([rec], path.join(OUT, "v-lp.mp4"), PHONE[0], PHONE[1], 28);
  },

  // 2) 무료강의 · 선물 전자책 페이지: 카운트다운 → 영상 → 전자책 3권 → 자주 묻는 질문
  async free(b) {
    const c = await L.context(b, "phone"); const p = await c.newPage();
    await p.goto(L.B + "#/free/moon"); await S(1600);
    const rec = await L.record(p, async () => {
      await S(900);
      await L.moveTo(p, 0.7, 0.62);
      await L.scrollBy(p, 640, 1200); await S(1300);
      await L.reveal(p, ".youtube-showcase", { at: 0.08, ms: 1200 }); await S(500);
      const next = await p.$$(".carousel-control");
      if (next.length > 1) { await L.tap(p, ".carousel-control", { nth: 1, after: 1100 }); }
      await L.reveal(p, ".gift-section", { at: 0.04, ms: 1300 }); await S(600);
      await L.point(p, ".gift-card", { nth: 0, fy: 0.45 }); await S(900);
      await L.reveal(p, ".gift-card", { nth: 1, at: 0.2, ms: 1000 }); await S(700);
      await L.reveal(p, ".gift-timeline", { at: 0.45, ms: 1100 }); await S(700);
      await L.reveal(p, ".fc-faq", { at: 0.12, ms: 1400 }); await S(300);
      await L.tap(p, ".fc-faq summary", { nth: 1, after: 1200 });
      await L.tap(p, ".fc-faq summary", { nth: 2, after: 1300 });
    });
    await c.close();
    return L.encode([rec], path.join(OUT, "v-free.mp4"), PHONE[0], PHONE[1], 28);
  },
  // 3) 수강생 홈: 시작 가이드 체크 → 이번 주 할 일 · 진행률 → 다음 과제 열기
  async home(b) {
    const c = await L.context(b, "phone"); const p = await c.newPage();
    await L.studentLogin(p, "이수진", "2186");
    await p.goto(L.B + "#/home"); await S(1000);
    const rec = await L.record(p, async () => {
      await S(900);
      await L.tap(p, '[data-action="toggle-guide"]', { nth: 0, after: 700 });
      await L.tap(p, '[data-action="toggle-guide"]', { nth: 1, after: 700 });
      await L.tap(p, '[data-action="toggle-guide"]', { nth: 2, after: 600 });
      await L.reveal(p, ".wf-btn", { at: 0.55, ms: 1300 }); await S(300);
      await L.point(p, ".wf-btn"); await S(700);
      await L.reveal(p, ".prog-row", { at: 0.42, ms: 900 }); await S(300);
      await L.point(p, ".prog-row", { nth: 0, fx: 0.7 }); await S(800);
      await L.tap(p, ".next-card", { at: 0.4, ms: 1300, after: 1500 });
      await L.scrollBy(p, 420, 1100); await S(900);
    });
    await c.close();
    return L.encode([rec], path.join(OUT, "v-home.mp4"), PHONE[0], PHONE[1], 28);
  },

  // 4) 커리큘럼 → 2주차 과제 → 과제 쓰고 제출 → 자동 검수 통과
  async care(b) {
    const c = await L.context(b, "phone"); const p = await c.newPage();
    await L.studentLogin(p, "이수진", "2186");
    await p.goto(L.B + "#/curriculum"); await S(1000);
    const rec = await L.record(p, async () => {
      await S(900);
      await L.scrollBy(p, 520, 1100); await S(500);
      await L.reveal(p, 'a.cw-go[href="#/missions/2"]', { at: 0.5, ms: 1400 }); await S(300);
      await L.tap(p, 'a.cw-go[href="#/missions/2"]', { after: 1000 });
      await L.tap(p, 'a[href="#/missions/2/m2-1"]', { nth: 0, at: 0.4, after: 1100 });
      await L.reveal(p, "form textarea", { at: 0.3, ms: 1100 });
      await L.tap(p, "form textarea", { after: 300 });
      await L.type(p, "form textarea", "1. 마누카꿀 UMF10+ 250g · 현지 39.9 NZD · 국내 최저 42,000원\n2. 초록입홍합 오일 60캡슐 · 현지 29.9 NZD · 국내 최저 35,000원\n3. 프로폴리스 스프레이 30ml · 현지 18.5 NZD · 국내 최저 21,000원\n4. 콜라겐 파우더 200g · 현지 45 NZD · 국내 최저 52,000원", 12);
      await S(400);
      await L.tap(p, 'form button:has-text("자동검수")', { at: 0.5, after: 1800 });
      await L.moveTo(p, 0.72, 0.6);
      await L.scrollTop(p, 0, 1200); await S(1300);
    });
    await c.close();
    return L.encode([rec], path.join(OUT, "v-care.mp4"), PHONE[0], PHONE[1], 28);
  },

  // 5) 수강생 화면 8가지 (첫 화면 탭 순서와 같은 장)
  async student(b) {
    const c = await L.context(b, "phone"); const p = await c.newPage();
    await L.studentLogin(p, "이수진", "2186");
    const c2 = await L.context(b, "phone"); const q = await c2.newPage();
    await L.studentLogin(q, "1기 체험단", "1111");
    await p.goto(L.B + "#/curriculum"); await S(900);
    const r1 = await L.record(p, async (mark) => {
      mark("tutorial");
      await S(700);
      await L.scrollBy(p, 560, 1100); await S(400);
      await L.tap(p, "a.lesson", { nth: 0, at: 0.45, after: 1300 });
      mark("mission");
      await L.go(p, "#/missions/1", 600);
      await L.tap(p, '[data-action="wk-filter"]', { nth: 1, after: 700 });
      await L.reveal(p, 'a[href="#/missions/1/m1-1"]', { nth: 0, at: 0.35, ms: 1000 });
      await L.tap(p, 'a[href="#/missions/1/m1-1"]', { nth: 0, after: 1300 });
    });
    await q.goto(L.B + "#/certificate"); await S(1000);
    const r2 = await L.record(q, async (mark) => {
      mark("cert");
      await S(800);
      await L.reveal(q, ".cert-wrap", { at: 0.12, ms: 1200 }); await S(400);
      await L.point(q, ".cert-wrap", { fy: 0.4 }); await S(1300);
    });
    await p.goto(L.B + "#/bot"); await S(900);
    const r3 = await L.record(p, async (mark) => {
      mark("bot");
      await S(500);
      await L.tap(p, '[data-action="chip"]', { nth: 2, after: 2000 });
      mark("channel");
      await L.go(p, "#/channels", 700);
      await L.scrollBy(p, 360, 1000); await S(400);
      await L.point(p, ".ch-card", { nth: 1, fy: 0.4 }); await S(1100);
      mark("guide");
      await L.go(p, "#/docs", 700);
      await L.reveal(p, '[data-action="toggle-doc"]', { nth: 0, at: 0.55, ms: 1100 });
      await L.tap(p, '[data-action="toggle-doc"]', { nth: 0, after: 1100 });
      mark("library");
      await L.go(p, "#/library", 900);
      if (await p.$(".lib-gate-ok")) await L.tap(p, ".lib-gate-ok", { after: 700 });
      await L.tap(p, "a.res-card", { nth: 0, after: 1400 });
      mark("schedule");
      await L.go(p, "#/schedule", 700);
      const days = await p.$$('[data-action="cal-pick"]');
      await L.tap(p, '[data-action="cal-pick"]', { nth: Math.min(days.length - 1, 18), after: 1000 });
      await L.tap(p, '[data-action="cal-pick"]', { nth: Math.min(days.length - 1, 23), after: 1300 });
    });
    await c.close(); await c2.close();
    return L.encode([r1, r2, r3], path.join(OUT, "v-student.mp4"), PHONE[0], PHONE[1], 29);
  },

  // 6) 강사센터: 대시보드 → 수강생 승인 · 진척도 → 과제 검수
  async admin(b) {
    const c = await L.context(b, "desk"); const p = await c.newPage();
    // 과제 검수 화면에 보일 예시 인증 사진 (서류 모양 그림)
    const img = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640"><rect width="480" height="640" fill="#f6f8fb"/><rect x="30" y="30" width="420" height="580" fill="#fff" stroke="#dce0e6" stroke-width="3"/><rect x="60" y="70" width="360" height="40" fill="#0078ff"/>' + Array.from({ length: 12 }, (_, i) => '<rect x="60" y="' + (150 + i * 34) + '" width="' + (i % 3 ? 360 : 240) + '" height="14" fill="#e1e5ec"/>').join("") + '<circle cx="365" cy="515" r="45" fill="none" stroke="#dc3c3c" stroke-width="5"/></svg>').toString("base64");
    await p.goto(L.B + "#/center/login"); await S(800);
    await p.click('[data-action="login-tab"][data-tab="instructor"]').catch(() => {});
    await p.fill("#al-id", "문원오"); await p.fill("#al-pw", "2186"); await p.click("#a-login-form button[type=submit]"); await S(1000);
    await seedAdmin(p, img);
    await p.goto(L.B + "#/center"); await p.reload(); await S(1300);
    const rec = await L.record(p, async (mark) => {
      mark("dash");
      await S(900);
      await L.point(p, ".a-kpi", { nth: 0 }); await S(600);
      await L.point(p, ".a-kpi", { nth: 3 }); await S(500);
      await L.moveTo(p, 0.62, 0.62);
      await L.scrollBy(p, 520, 1200); await S(900);
      await L.scrollBy(p, 700, 1300); await S(1000);
      await L.scrollTop(p, 0, 900); await S(300);
      mark("students");
      await L.tap(p, 'a.a-nav[href="#/center/students"]', { after: 900 });
      await L.tap(p, '[data-action="stu-approve"]', { nth: 0, after: 1100 });
      await L.tap(p, '[data-action="stu-tab"][data-k="approved"]', { after: 1000 });
      await L.moveTo(p, 0.7, 0.55);
      await L.scrollBy(p, 300, 900); await S(900);
      await L.scrollTop(p, 0, 700);
      mark("review");
      await L.tap(p, 'a.a-nav[href="#/center/reviews"]', { after: 900 });
      await L.point(p, "tr[data-action=review-open]", { nth: 0, fx: 0.35 }); await S(400);
      await L.tap(p, "tr[data-action=review-open]", { nth: 0, fx: 0.35, after: 1300 });
      await L.point(p, '[data-action="review-save"][data-status="approved"]'); await S(500);
      await L.tap(p, '[data-action="review-save"][data-status="approved"]', { after: 1500 });
    });
    await c.close();
    return L.encode([rec], path.join(OUT, "v-admin.mp4"), DESK[0], DESK[1], 29);
  }
};

// 강사센터 녹화용 예시 수강생 (이 녹화 브라우저 안에만 · 이름은 처음부터 김OO 처럼 가림)
async function seedAdmin(p, img) {
  await p.evaluate((img) => {
    const co = DB.cohortsOf("moon").find((x) => x.name === "3기");
    const w = DB.weeksOf(co), today = DB.date.todayStr(), add = DB.date.addDays, now = Date.now();
    const names = ["김OO", "박OO", "최OO", "정OO", "오OO", "강OO", "윤OO", "한OO", "서OO", "임OO", "배OO", "신OO"];
    const ok = { pass: true, ok: [], reasons: [] };
    names.forEach((n, i) => {
      const id = "sx" + i, pending = i >= 9;
      DB.data.students.push({ id, instructorId: "moon", cohortId: co.id, name: n, phone4: String(2000 + i * 137).slice(-4), status: pending ? "pending" : "approved", memo: "", appliedAt: add(today, pending ? -(i - 8) : -14 - i) });
      if (pending) return;
      const pr = DB.emptyProgress();
      const w1 = w[0].missions, w2 = w[1].missions;
      const doneN = [7, 10, 6, 9, 5, 8, 4, 7, 3][i];
      w1.slice(0, doneN).forEach((m, k) => {
        const sub = { at: now - (6 - k * 0.3) * 86400000 - i * 3600000, text: m.type === "text" ? "1주차 과제 정리했습니다. 확인 부탁드려요!" : "", link: m.type === "link" ? "https://smartstore.naver.com/sample" : "", files: m.type === "image" ? [img] : [], result: ok };
        if (k < doneN - 1 || i % 2) sub.review = { status: "approved", comment: "잘하셨어요!", at: now - 4 * 86400000, by: "강사", byId: "moon", role: "instructor" };
        pr.submissions[m.id] = [sub];
      });
      if (i % 3 !== 2) pr.submissions[w2[0].id] = [{ at: now - (i + 1) * 2400000, text: "1. 마누카꿀 UMF10+ 250g · 현지 39.9 NZD · 국내 최저 42,000원\n2. 초록입홍합 오일 60캡슐 · 현지 29.9 NZD · 국내 35,000원\n3. 프로폴리스 스프레이 · 현지 18 NZD · 국내 21,000원", link: "", files: [], result: ok }];
      if (i % 2 === 0) pr.submissions[w2[2].id] = [{ at: now - (i + 2) * 1800000, text: "", link: "", files: [img], result: ok }];
      DB.saveProgress(id, pr);
    });
    DB.save();
  }, img);
}

(async () => {
  const names = process.argv.slice(2);
  const b = await L.browser();
  const meta = fs.existsSync(path.join(OUT, "meta.json")) ? JSON.parse(fs.readFileSync(path.join(OUT, "meta.json"), "utf8")) : {};
  for (const n of names) {
    const t = Date.now();
    const r = await scenes[n](b);
    meta[n] = r;
    const f = path.join(OUT, "v-" + n + ".mp4");
    console.log(n, "→", (fs.statSync(f).size / 1024).toFixed(0) + "KB", r.duration + "s", JSON.stringify(r.chapters), ((Date.now() - t) / 1000).toFixed(1) + "s");
  }
  fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify(meta, null, 1));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
