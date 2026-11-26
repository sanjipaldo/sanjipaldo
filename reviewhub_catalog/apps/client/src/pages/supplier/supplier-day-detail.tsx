// 판매·정산 달력 날짜 카드의 '세부내역 보기'(2026-11-26 관리자 요청).
// - 그날 어떤 상품이 얼마(단가)에 몇 개 팔려 합계가 됐는지, 반품·배송비까지 영수증처럼 펼쳐 보여 줍니다.
// - 일반 도매는 공급가(원가) × 수량으로만 계산합니다(두고푸드 판매가는 서버가 보내지 않음). 판매수수료는 판매가 × 수량.
// - 펼쳤을 때만 서버에 묻고(GET /supplier/sales/day), 한 번 받은 날은 다시 묻지 않습니다. 펼친 채로 다른 날을 누르면 그날 내역을 바로 보여 줘요.
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ReceiptText, Truck } from "lucide-react";
import { formatPayoutLabel, formatPeriodLabel, settlementPeriodFor, type SupplierSettlementSettings } from "@repo/shared/supplier-portal";
import { SalesThumb } from "../admin/sales-widgets";
import { count, monthLabel, supplierGet, won, type SalesDayDetail } from "./supplier-api";

type DetailState = { date: string; status: "loading" | "ready" | "error"; detail?: SalesDayDetail; error?: string };

/** 이 날 판매분이 들어가는 입금 안내 */
function payoutText(date: string, settings: SupplierSettlementSettings) {
  const period = settlementPeriodFor(date, settings.cycle);
  const payout = formatPayoutLabel(period);
  const when = settings.cycle === "daily"
    ? `매일 정산 · 이 날 판매분은 ${payout}에 입금해요.`
    : settings.cycle === "weekly"
      ? `주 정산 · ${formatPeriodLabel(period)} 판매분과 함께 ${payout}에 입금해요.`
      : `월 정산 · ${monthLabel(date.slice(0, 7))} 판매분과 함께 ${payout}에 입금해요.`;
  const fee = settings.type === "wholesale"
    ? " 판매 수수료는 없어요."
    : ` 판매 수수료 ${settings.commissionRate}%는 한 달 판매 대금(배송비 제외)으로 계산해 다음 달 1~3일에 따로 청구해요.`;
  return when + fee;
}

function DetailBody({ detail, settings }: { detail: SalesDayDetail; settings: SupplierSettlementSettings }) {
  const wholesale = detail.type === "wholesale";
  const unitLabel = wholesale ? "공급가" : "판매가";
  const { totals } = detail;
  if (detail.lines.length === 0) return <p className="sup-muted-text">이 날 판매·반품 내역이 없어요.</p>;
  return (
    <>
      <p className="sup-day-detail-caption">{wholesale ? "공급가(원가) × 수량으로 계산했어요." : "판매가 × 수량으로 계산했어요."}</p>
      <ul className="sup-day-lines">
        {detail.lines.map((line) => {
          const unknown = line.unitPrice === null;
          return (
            <li key={line.key}>
              <SalesThumb src={line.imageUrl} size={40} />
              <div className="sup-day-line-head">
                <strong className="sup-day-line-name">{line.productName}</strong>
                {line.productCode && <small className="sup-day-line-code">{line.productCode}</small>}
              </div>
              <dl className="sup-day-line-calc">
                <div>
                  {/* 좁으면 '공급가 n원'과 '× n개' 사이에서만 줄이 바뀌게 */}
                  <dt><span className="sup-nowrap">{unitLabel} {unknown ? "확인 중" : won(line.unitPrice)}</span> <span className="sup-nowrap">× {count(line.quantity)}</span></dt>
                  <dd>{unknown ? "확인 중" : won(line.saleAmount)}</dd>
                </div>
                {line.returnQuantity > 0 && (
                  <>
                    <div className="is-return"><dt>반품 {count(line.returnQuantity)}</dt><dd>{unknown ? "-" : `-${won(line.returnAmount)}`}</dd></div>
                    <div className="is-subtotal"><dt>반품 뺀 금액</dt><dd>{unknown ? "확인 중" : won(line.netAmount)}</dd></div>
                  </>
                )}
              </dl>
              {line.shippingFee > 0 && <span className="sup-day-line-ship"><Truck size={13} aria-hidden="true" />배송비 {won(line.shippingFee)}</span>}
            </li>
          );
        })}
      </ul>
      <dl className="sup-money-list sup-day-sum">
        <div><dt>{wholesale ? "공급 금액 합계" : "판매 대금 합계"}<wbr /><span className="sup-nowrap">(반품 뺌)</span></dt><dd>{won(totals.goodsAmount)}</dd></div>
        <div><dt>배송비 합계</dt><dd>{totals.shippingFee ? `+${won(totals.shippingFee)}` : "0원"}</dd></div>
        <div className="is-total"><dt>이 날 판매분 <span className="sup-nowrap">정산 금액</span></dt><dd>{won(totals.payoutAmount)}</dd></div>
      </dl>
      {totals.costMissing > 0 && <p className="sup-day-detail-warn">공급가(원가)를 확인 중인 판매 {count(totals.costMissing, "줄")}은 금액에서 빠져 있어요. 두고푸드가 확인하면 채워져요.</p>}
      <p className="sup-day-detail-note">{payoutText(detail.date, settings)}</p>
    </>
  );
}

/**
 * hidden: 판매·반품이 없는 날은 버튼을 숨겨요. 이 부품은 날짜를 바꿔도 그대로 두어서 펼친 상태·받아 둔 내역을 기억합니다.
 * version: 달 판매 내역 응답(바뀌면 받아 둔 세부내역을 비움)
 */
export function SupplierDayDetail({ date, settings, version, hidden = false }: { date: string; settings: SupplierSettlementSettings; version?: unknown; hidden?: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DetailState | null>(null);
  const [retry, setRetry] = useState(0);
  const cache = useRef(new Map<string, SalesDayDetail>());
  const panelId = useId();

  // 달 내역을 다시 받으면(달 바꾸기·다시 불러오기) 받아 둔 세부내역도 새로 받아요.
  useEffect(() => { cache.current.clear(); }, [version]);

  useEffect(() => {
    if (!open || hidden) return;
    const cached = cache.current.get(date);
    if (cached) {
      setState({ date, status: "ready", detail: cached });
      return;
    }
    let active = true;
    setState({ date, status: "loading" });
    void supplierGet<SalesDayDetail>(`/sales/day?date=${date}`)
      .then((detail) => {
        cache.current.set(date, detail);
        if (active) setState({ date, status: "ready", detail });
      })
      .catch((failure) => { if (active) setState({ date, status: "error", error: failure instanceof Error ? failure.message : "세부내역을 불러오지 못했어요." }); });
    return () => { active = false; };
  }, [open, hidden, date, version, retry]);

  if (hidden) return null;
  const current = state?.date === date ? state : null;
  return (
    <div className={`sup-day-detail${open ? " is-open" : ""}`}>
      <button type="button" className="sup-day-detail-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        <ReceiptText size={16} aria-hidden="true" />
        <span>{open ? "세부내역 접기" : "세부내역 보기"}</span>
        <ChevronDown size={16} aria-hidden="true" className="sup-day-detail-chevron" />
      </button>
      <div id={panelId} className="sup-day-detail-panel" hidden={!open}>
        {!open ? null : !current || current.status === "loading" ? (
          <div className="admin-loading inline"><div className="spinner" /><span>세부내역을 불러오는 중…</span></div>
        ) : current.status === "error" || !current.detail ? (
          <div className="sup-day-detail-error">
            <span>{current.error ?? "세부내역을 불러오지 못했어요."}</span>
            <button type="button" className="sup-retry" onClick={() => setRetry((value) => value + 1)}>다시 불러오기</button>
          </div>
        ) : (
          <DetailBody detail={current.detail} settings={settings} />
        )}
      </div>
    </div>
  );
}
