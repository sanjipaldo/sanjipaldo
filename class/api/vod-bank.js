/* /api/vod-bank — 무통장 입금 자동 확인 알림 받기 (페이액션 ‘매칭완료’ 웹훅)
 *  POST { order_number, order_status: "매칭완료", processing_date }  헤더 x-webhook-key (또는 x-api-key)
 *  → 그 주문 입금 확인 → 회원이 바로 수강. 같은 알림이 여러 번 와도 한 번만 확인해요.
 *  페이액션은 HTTP 200 + { status: "success" } 를 받아야 성공으로 봐요 (아니면 5분 · 30분 뒤 다시 보내요). */
"use strict";
const { send, body, handler } = require("./_lib/http");
const PA = require("./_lib/payaction");
const BM = require("./_lib/bank");
const V = require("./_lib/vod");

module.exports = handler(["POST"], async (req, res) => {
  if (!PA.verify(req.headers || {})) return send(res, 401, { status: "error", message: "key" });
  const b = await body(req), no = String(b.order_number || "").slice(0, 40), st = String(b.order_status || "");
  if (!no) return send(res, 400, { status: "error", message: "order_number" });
  if (st !== "매칭완료") return send(res, 200, { status: "success" });
  const o = await V.get(V.K.order(no));
  if (!o) { console.error("[vod-bank] 주문 없음", no); return send(res, 200, { status: "success" }); }
  const r = await BM.confirm(no, "자동 입금 확인", { okHow: "auto", via: "payaction", paAt: String(b.processing_date || "").slice(0, 40) });
  if (!r.ok) console.error("[vod-bank] 확인 실패", no, r.message);
  else if (!r.already) {
    const total = r.amount || o.amount;
    await BM.remember({ id: "pa:" + no, at: Date.now(), got: Date.now(), name: o.depositor || "", amount: total, bank: "페이액션", st: "ok", no });
  }
  send(res, 200, { status: "success" });
});
