// 위탁셀러 사용법 영상의 화면: 두고푸드 도매몰(발주오라) 메뉴 · 주문 목록 · 엑셀 주문 올리기, 두고푸드 DB센터 단가표 · 가격변동/품절이슈.
// 메뉴·상태·버튼 이름은 실제 도매몰과 같게 씁니다. 커서가 누르는 자리는 아래 위치 상수로 계산하므로 guide-demo.css의 크기와 맞춰 둡니다.
// 화면 안쪽 크기: 가로 324px, 세로 416px(브라우저 주소 줄 30px 제외).
import type { ReactNode } from "react";
import { Ban, Camera, Check, ChevronDown, ClipboardPen, Download, FileSpreadsheet, Headset, Home, ListChecks, Megaphone, Package, Search, Wallet, type LucideIcon } from "lucide-react";
import { Cursor, StatusStrip, appear, clickPulse, cursorPath, easeOut, prog, textPx, timed, typeTime, typed } from "./guide-demo-kit";
import type { DemoActor, DemoOrderStatus, DemoView } from "./guide-demo-scripts";

type ViewOf<K extends DemoView["kind"]> = Extract<DemoView, { kind: K }>;
type ViewProps<K extends DemoView["kind"]> = { view: ViewOf<K>; t: number; actor: DemoActor; party: DemoActor };

const VIEW_W = 324;
const STRIP = 26;
const SHOP_HEAD = 32;
const won = (value: number) => `${value.toLocaleString("ko-KR")}원`;

// 커서가 여러 곳을 차례로 누를 때: 지금 시각에 가장 가까운 클릭 효과
const pulseAt = (t: number, times: Array<number | undefined>) => times.reduce<number>((value, at) => Math.max(value, clickPulse(t, at)), 0);

function ShopHeader() {
  return (
    <div className="gd-shop-head">
      <span className="gd-shop-logo">두</span>
      <b>두고푸드 도매몰</b>
      <em>하루마켓님</em>
    </div>
  );
}

/* ───────── 도매몰 메뉴 ───────── */

const SHOP_MENU: Array<{ name: string; icon: LucideIcon; children?: string[] }> = [
  { name: "홈", icon: Home },
  { name: "상품 관리", icon: Package, children: ["상품리스트", "상품 매칭 리스트"] },
  { name: "주문 입력", icon: ClipboardPen, children: ["대량 주문 입력(엑셀)", "단일 주문 입력"] },
  { name: "주문 관리", icon: ListChecks, children: ["주문 등록 현황", "전체 주문 리스트", "주문대기", "주문접수", "배송준비중", "배송중", "배송완료"] },
  { name: "CS 관리", icon: Headset, children: ["취소 리스트", "교환 리스트", "반품 리스트"] },
  { name: "정산 관리", icon: Wallet },
  { name: "공지사항", icon: Megaphone }
];
const MENU_TOP = STRIP + SHOP_HEAD + 6;
const MENU_GROUP = 32;
const MENU_CHILD = 28;
const MENU_LEFT = 10;
const MENU_CHILD_W = 149;
const MENU_CHILD_GAP = 6;

export function MenuView({ view, t, actor, party }: ViewProps<"menu">) {
  const openIndex = Math.max(0, SHOP_MENU.findIndex((group) => group.name === view.open));
  const children = SHOP_MENU[openIndex]?.children ?? [];
  const targetIndex = Math.max(0, children.indexOf(view.target));
  const openAt = view.openAt ?? 0.9;
  const fullHeight = Math.ceil(children.length / 2) * MENU_CHILD + 8;
  const expand = easeOut(prog(t, openAt + 0.05, 0.35));
  const height = fullHeight * expand;
  const groupTop = (index: number) => MENU_TOP + index * MENU_GROUP + (index > openIndex ? height : 0);
  const childrenTop = MENU_TOP + (openIndex + 1) * MENU_GROUP;
  const childPos = (index: number) => ({ left: (index % 2) * (MENU_CHILD_W + MENU_CHILD_GAP), top: 4 + Math.floor(index / 2) * MENU_CHILD });
  const target = childPos(targetIndex);
  const groupPoint: [number, number] = [MENU_LEFT + 70, groupTop(openIndex) + 15];
  const targetPoint: [number, number] = [MENU_LEFT + target.left + 74, childrenTop + target.top + 12];
  const [x, y] = cursorPath(t, [250, 392], [{ at: openAt - 0.05, to: groupPoint, move: 0.6 }, { at: view.clickAt - 0.05, to: targetPoint, move: 0.55 }]);
  const clicked = t >= view.clickAt;
  return (
    <div className="gd-view-root">
      <StatusStrip who={actor} text={clicked ? `${view.target} 화면으로 이동해요` : timed(view.status, t)} />
      <ShopHeader />
      {SHOP_MENU.map((group, index) => {
        const Icon = group.icon;
        const open = index === openIndex && t >= openAt;
        return (
          <div key={group.name} className={`gd-menu-group${open ? " is-open" : ""}`} style={{ top: groupTop(index) }}>
            <Icon size={15} strokeWidth={1.8} />
            <b>{group.name}</b>
            {group.children && <ChevronDown size={14} style={{ transform: `rotate(${(index === openIndex ? expand * 180 : 0).toFixed(1)}deg)` }} />}
          </div>
        );
      })}
      <div className="gd-menu-children" style={{ top: childrenTop, height }}>
        {children.map((child, index) => {
          const pos = childPos(index);
          const isTarget = index === targetIndex;
          return <span key={child} className={`gd-menu-child${isTarget ? " is-target" : ""}${isTarget && clicked ? " is-on" : ""}`} style={{ left: pos.left, top: pos.top }}>{child}</span>;
        })}
      </div>
      <Cursor x={x} y={y} who={party} click={pulseAt(t, [openAt, view.clickAt])} />
    </div>
  );
}

/* ───────── 도매몰 주문 목록 ───────── */

const ORD_TITLE_TOP = STRIP + SHOP_HEAD;
const ORD_TITLE_H = 34;
const ORD_HEAD_TOP = ORD_TITLE_TOP + ORD_TITLE_H;
const ORD_HEAD_H = 22;
const ORD_ROW_TOP = ORD_HEAD_TOP + ORD_HEAD_H;
const ORD_ROW_H = 48;
const ORD_CHECK_X = 19;
const ORD_BTN_H = 24;

const STATUS_TONE: Record<DemoOrderStatus, string> = {
  주문대기: "wait",
  주문접수: "accept",
  발주완료: "accept",
  배송준비중: "ready",
  배송중: "ship",
  배송완료: "done",
  취소완료: "cancel",
  반품접수: "cs",
  교환접수: "cs"
};
const SHOWS_INVOICE = new Set<DemoOrderStatus>(["배송중", "배송완료", "반품접수", "교환접수"]);

function actionButtons(actions: string[]) {
  let right = VIEW_W - 10;
  return [...actions].reverse().map((label) => {
    const width = Math.round(textPx(label, 10.5) + 18);
    const left = right - width;
    right = left - 5;
    return { label, left, width };
  }).reverse();
}

// 확인 창(취소: 제목·설명·버튼 / 반품·교환: 사유 · 상세 내용 · 사진까지). 모든 칸을 절대 위치로 둡니다.
const DLG_LEFT = 22;
const DLG_PAD = 16;
const DLG_INNER = VIEW_W - DLG_LEFT * 2 - DLG_PAD * 2;
const DLG_OPTION_W = 78;
const DLG_OPTION_GAP = 7;
const DLG_LAYOUT = {
  simple: { top: 128, buttons: 70, height: 120 },
  full: { top: 60, options: 84, detailLabel: 152, detail: 170, photos: 222, buttons: 266, height: 316 }
};

export function OrdersView({ view, t, actor, party }: ViewProps<"orders">) {
  const statusOf = (index: number) => {
    let status = view.rows[index].status;
    let changedAt: number | undefined;
    for (const change of view.changes ?? []) {
      if (t >= change.at && (change.rows === "all" || change.rows.includes(index))) {
        status = change.status;
        changedAt = change.at;
      }
    }
    return { status, changedAt };
  };
  const selected = (index: number) => Boolean(view.select && t >= view.select.at && (view.select.rows === "all" || view.select.rows.includes(index)));
  const buttons = actionButtons(view.actions ?? []);
  const actionButton = view.action ? buttons.find((button) => button.label === view.action?.label) : undefined;
  const dialog = view.dialog;
  const full = Boolean(dialog?.options);
  const layout = full ? DLG_LAYOUT.full : DLG_LAYOUT.simple;
  const optionPos = (index: number) => ({ left: DLG_PAD + (index % 3) * (DLG_OPTION_W + DLG_OPTION_GAP), top: DLG_LAYOUT.full.options + Math.floor(index / 3) * 32 });
  const pickIndex = dialog?.options && dialog.pick ? dialog.options.indexOf(dialog.pick) : -1;
  const buttonW = (DLG_INNER - 8) / 2;
  const stops: Array<{ at: number; to: [number, number]; move?: number }> = [];
  if (view.select) {
    const first = view.select.rows === "all" ? -1 : view.select.rows[0] ?? 0;
    stops.push({ at: view.select.at, to: first < 0 ? [ORD_CHECK_X, ORD_HEAD_TOP + ORD_HEAD_H / 2] : [ORD_CHECK_X, ORD_ROW_TOP + first * ORD_ROW_H + ORD_ROW_H / 2], move: 0.6 });
  }
  if (view.action && actionButton) stops.push({ at: view.action.at, to: [actionButton.left + actionButton.width / 2, ORD_TITLE_TOP + ORD_TITLE_H / 2] });
  if (dialog && pickIndex >= 0 && dialog.pickAt !== undefined) {
    const pos = optionPos(pickIndex);
    stops.push({ at: dialog.pickAt, to: [DLG_LEFT + pos.left + DLG_OPTION_W / 2, layout.top + pos.top + 13] });
  }
  if (dialog) stops.push({ at: dialog.confirmAt, to: [DLG_LEFT + DLG_PAD + buttonW + 8 + buttonW / 2, layout.top + layout.buttons + 17], move: full ? 0.7 : 0.55 });
  const cursor = stops.length > 0 ? cursorPath(t, [250, 400], stops) : null;
  const dialogIn = dialog ? easeOut(prog(t, dialog.at, 0.25)) * (1 - prog(t, dialog.confirmAt + 0.1, 0.25)) : 0;
  const detailStart = (dialog?.pickAt ?? 0) + 0.35;
  const detailEnd = detailStart + typeTime(dialog?.detail ?? "", 18);
  const pressed = view.action && t >= view.action.at && t < view.action.at + 0.5 ? view.action.label : "";
  return (
    <div className="gd-view-root">
      <StatusStrip who={actor} text={timed(view.status, t)} />
      <ShopHeader />
      <div className="gd-ord-title" style={{ top: ORD_TITLE_TOP }}>
        <strong>{view.page}</strong>
        <span>{view.rows.length}건</span>
      </div>
      {buttons.map((button) => (
        <span key={button.label} className={`gd-ord-btn${button.label === pressed ? " is-pressed" : ""}${button.label === view.action?.label ? ` is-main is-${view.dialog?.tone ?? "primary"}` : ""}`} style={{ left: button.left, width: button.width, top: ORD_TITLE_TOP + (ORD_TITLE_H - ORD_BTN_H) / 2 }}>
          {button.label === "엑셀 다운로드" && <Download size={11} />}{button.label}
        </span>
      ))}
      <div className="gd-ord-head" style={{ top: ORD_HEAD_TOP }}>
        <span className={`gd-check${view.select?.rows === "all" && t >= view.select.at ? " is-on" : ""}`}>{view.select?.rows === "all" && t >= view.select.at && <Check size={10} strokeWidth={3.5} />}</span>
        <b>주문 정보</b>
        <b>상태</b>
      </div>
      {view.rows.map((row, index) => {
        const { status, changedAt } = statusOf(index);
        const on = selected(index);
        const pop = changedAt !== undefined ? easeOut(prog(t, changedAt, 0.3)) : 1;
        const invoice = row.invoice && SHOWS_INVOICE.has(status);
        const invoiceStyle = changedAt !== undefined && SHOWS_INVOICE.has(status) && !SHOWS_INVOICE.has(row.status) ? appear(t, changedAt + 0.1, 0.3, 4) : undefined;
        return (
          <div key={row.no} className={`gd-ord-row${on ? " is-selected" : ""}`} style={{ top: ORD_ROW_TOP + index * ORD_ROW_H, ...(row.at !== undefined ? appear(t, row.at, 0.3, 8) : appear(t, 0.05 + index * 0.06, 0.3, 6)) }}>
            <span className={`gd-check${on ? " is-on" : ""}`}>{on && <Check size={10} strokeWidth={3.5} />}</span>
            <div className="gd-ord-info">
              <p><b>{row.name}</b><small>{row.no}</small></p>
              <p>{row.item} × {row.qty}</p>
              {invoice && <p className="gd-ord-invoice" style={invoiceStyle}>CJ대한통운 {row.invoice}</p>}
            </div>
            <em className={`gd-ord-status is-${STATUS_TONE[status]}`} style={{ transform: `scale(${(0.82 + 0.18 * pop).toFixed(3)})` }}>{status}</em>
          </div>
        );
      })}
      {dialog && dialogIn > 0.001 && (
        <>
          <div className="gd-dim" style={{ opacity: dialogIn }} />
          <div className="gd-ord-dialog" style={{ top: layout.top, height: layout.height, opacity: dialogIn, transform: `translateY(${((1 - dialogIn) * 12).toFixed(2)}px)` }}>
            <strong style={{ top: DLG_PAD }}>{dialog.title}</strong>
            {dialog.sub && <small style={{ top: 38 }}>{dialog.sub}</small>}
            {dialog.options && (
              <>
                <label style={{ top: 66 }}>반품 사유</label>
                {dialog.options.map((option, index) => {
                  const pos = optionPos(index);
                  const picked = index === pickIndex && dialog.pickAt !== undefined && t >= dialog.pickAt;
                  return <span key={option} className={`gd-dlg-option${picked ? " is-on" : ""}`} style={{ left: pos.left, top: pos.top, width: DLG_OPTION_W }}>{option}</span>;
                })}
                <label style={{ top: DLG_LAYOUT.full.detailLabel }}>상세 내용</label>
                <p className="gd-dlg-detail" style={{ top: DLG_LAYOUT.full.detail }}>
                  {typed(dialog.detail ?? "", t, detailStart, 18)}
                  {t >= detailStart && t < detailEnd + 0.1 && <i className="gd-caret" />}
                </p>
                <div className="gd-dlg-photos" style={{ top: DLG_LAYOUT.full.photos }}>
                  {Array.from({ length: dialog.photos ?? 0 }, (_, index) => (
                    <span key={index} style={appear(t, detailEnd + 0.1 + index * 0.12, 0.25, 4)}><Camera size={13} /></span>
                  ))}
                  {(dialog.photos ?? 0) > 0 && <small style={appear(t, detailEnd + 0.1 + (dialog.photos ?? 0) * 0.12, 0.25, 4)}>사진 {dialog.photos}장 · 송장·전체·문제 부위</small>}
                </div>
              </>
            )}
            <span className="gd-dlg-btn" style={{ left: DLG_PAD, top: layout.buttons, width: buttonW }}>닫기</span>
            <span className={`gd-dlg-btn is-confirm is-${dialog.tone ?? "primary"}${t >= dialog.confirmAt ? " is-pressed" : ""}`} style={{ left: DLG_PAD + buttonW + 8, top: layout.buttons, width: buttonW }}>{dialog.confirm}</span>
          </div>
        </>
      )}
      {view.toast && t >= view.toast.at && <div className="gd-shop-toast"><span style={appear(t, view.toast.at, 0.3)}><Check size={13} strokeWidth={3} /> {view.toast.text}</span></div>}
      {cursor && <Cursor x={cursor[0]} y={cursor[1]} who={party} click={pulseAt(t, stops.map((stop) => stop.at))} />}
    </div>
  );
}

/* ───────── 대량 주문 입력(엑셀) ───────── */

const UP_TITLE_TOP = STRIP + SHOP_HEAD;
const UP_DROP_TOP = UP_TITLE_TOP + 38;
const UP_DROP_H = 64;
const UP_LIST_TOP = UP_DROP_TOP + UP_DROP_H + 10;
const UP_ROW_TOP = UP_LIST_TOP + 20;
const UP_ROW_H = 40;
const UP_PICK_LEFT = 134; // 매칭 줄 왼쪽(10) + 상품 칸(124)
const UP_BTN_TOP = 366;

export function UploadView({ view, t, actor, party }: ViewProps<"upload">) {
  const dropped = t >= view.dropAt;
  const manualIndex = view.rows.findIndex((row) => !row.auto);
  const matched = view.matchAt === undefined || t >= view.matchAt;
  const registered = t >= view.registerAt;
  const stops: Array<{ at: number; to: [number, number]; move?: number }> = [{ at: view.dropAt, to: [VIEW_W / 2, UP_DROP_TOP + UP_DROP_H / 2], move: 0.8 }];
  if (manualIndex >= 0 && view.matchAt !== undefined) stops.push({ at: view.matchAt, to: [UP_PICK_LEFT + 38, UP_ROW_TOP + manualIndex * UP_ROW_H + 18] });
  stops.push({ at: view.registerAt, to: [VIEW_W / 2, UP_BTN_TOP + 19] });
  // 시작 위치: 끌고 오는 파일 카드(가로 약 120px)가 화면 안에 보이도록
  const [x, y] = cursorPath(t, [196, 396], stops);
  const ghost = 1 - prog(t, view.dropAt, 0.2);
  return (
    <div className="gd-view-root">
      <StatusStrip who={actor} text={timed(view.status, t)} />
      <ShopHeader />
      <div className="gd-ord-title" style={{ top: UP_TITLE_TOP }}>
        <strong>대량 주문 입력(엑셀)</strong>
      </div>
      <span className="gd-ord-btn is-muted" style={{ right: 10, top: UP_TITLE_TOP + 5 }}><Download size={11} />양식 다운로드</span>
      <div className={`gd-up-drop${dropped ? " is-dropped" : ""}`} style={{ top: UP_DROP_TOP, height: UP_DROP_H }}>
        {dropped ? (
          <div className="gd-up-file" style={appear(t, view.dropAt, 0.3, 6)}>
            <span className="gd-attach-icon"><FileSpreadsheet size={16} /></span>
            <span><b>{view.file}</b><small>주문 {view.orders}건 읽음</small></span>
            <em><Check size={12} strokeWidth={3} /></em>
          </div>
        ) : (
          <div className="gd-up-empty"><FileSpreadsheet size={18} /><b>엑셀 파일을 끌어다 놓으세요</b><small>또는 파일 선택</small></div>
        )}
      </div>
      <div className="gd-up-list-head" style={{ top: UP_LIST_TOP, ...appear(t, view.dropAt + 0.25, 0.3, 4) }}><b>상품 매칭</b><span>내 상품명 → 두고푸드 상품</span></div>
      {view.rows.map((row, index) => {
        const manual = !row.auto;
        const done = !manual || matched;
        return (
          <div key={row.mine} className="gd-up-row" style={{ top: UP_ROW_TOP + index * UP_ROW_H, ...appear(t, view.dropAt + 0.35 + index * 0.22, 0.3, 6) }}>
            <span className="gd-up-mine">{row.mine}</span>
            <span className="gd-up-arrow">→</span>
            {done ? <b className="gd-up-product">{row.product}</b> : <span className="gd-up-pick">상품 선택</span>}
            <em className={`gd-up-badge ${done ? (manual ? "is-matched" : "is-auto") : "is-need"}`}>{done ? (manual ? "매칭 완료" : "자동 매칭") : "매칭 필요"}</em>
          </div>
        );
      })}
      <span className={`gd-up-submit${registered ? " is-done" : matched && dropped ? " is-ready" : ""}`} style={{ top: UP_BTN_TOP }}>
        {registered ? <><Check size={14} strokeWidth={3} /> 주문대기로 등록됐어요</> : `주문 ${view.orders}건 등록`}
      </span>
      {ghost > 0.01 && <span className="gd-up-ghost" style={{ transform: `translate(${(x - 18).toFixed(1)}px, ${(y - 34).toFixed(1)}px)`, opacity: ghost }}><FileSpreadsheet size={12} /> {view.file}</span>}
      <Cursor x={x} y={y} who={party} click={pulseAt(t, stops.map((stop) => stop.at))} />
    </div>
  );
}

/* ───────── 두고푸드 DB센터 단가표 ───────── */

const CAT_TITLE_TOP = STRIP;
const CAT_SEARCH_TOP = CAT_TITLE_TOP + 38;
const CAT_SEARCH_H = 32;
const CAT_CHIPS_TOP = CAT_SEARCH_TOP + CAT_SEARCH_H + 8;
const CAT_LABEL_TOP = CAT_CHIPS_TOP + 28;
const CAT_CARD_TOP = CAT_LABEL_TOP + 20;
const CAT_CARD_H = 70;
const CAT_CARD_STEP = 76;
const CAT_LEFT = 10;
// 카드 안 칸 위치(카드 왼쪽 위 기준): 강조 테두리·말풍선 자리
const CAT_FIELDS = {
  price: { left: 52, top: 45, width: 248, height: 21 },
  sale: { left: 114, top: 25, width: 86, height: 21 },
  ship: { left: 202, top: 25, width: 94, height: 21 },
  status: { left: 244, top: 4, width: 56, height: 22 }
} as const;
const CAT_CHIPS = ["전체", "🥕 농산", "🐟 수산", "🥩 축산", "🎁 선물세트"];

function markQuery(name: string, query: string): ReactNode {
  if (!query || !name.includes(query)) return name;
  const [before, ...rest] = name.split(query);
  return <>{before}<mark>{query}</mark>{rest.join(query)}</>;
}

export function CatalogView({ view, t, actor, party }: ViewProps<"catalog">) {
  const typing = view.typeAt !== undefined;
  const query = typing ? typed(view.query, t, view.typeAt ?? 0, 5) : view.query;
  const typedAll = !typing || query.length >= Array.from(view.query).length;
  const resultsAt = typing ? (view.typeAt ?? 0) + typeTime(view.query, 5) + 0.25 : 0;
  const focusList = view.focus ?? [];
  const current = [...focusList].reverse().find((focus) => t >= focus.at);
  const cardTop = (row: number) => CAT_CARD_TOP + row * CAT_CARD_STEP;
  const fieldCenter = (row: number, field: keyof typeof CAT_FIELDS): [number, number] => {
    const box = CAT_FIELDS[field];
    return [CAT_LEFT + box.left + box.width / 2, cardTop(row) + box.top + box.height / 2];
  };
  const stops: Array<{ at: number; to: [number, number]; move?: number }> = [];
  if (typing) stops.push({ at: (view.typeAt ?? 0) - 0.1, to: [70, CAT_SEARCH_TOP + CAT_SEARCH_H / 2], move: 0.6 });
  for (const focus of focusList) stops.push({ at: focus.at, to: fieldCenter(focus.row, focus.field), move: 0.5 });
  const cursor = stops.length > 0 ? cursorPath(t, [250, 396], stops) : null;
  const focusBox = current ? CAT_FIELDS[current.field] : undefined;
  const calloutBelow = current ? current.row < 2 : true;
  return (
    <div className="gd-view-root">
      <StatusStrip who={actor} text={timed(view.status, t)} />
      <div className="gd-cat-title" style={{ top: CAT_TITLE_TOP }}><strong>상품 단가표</strong><span>국내배송 · 해외배송</span></div>
      <div className={`gd-cat-search${typing && t >= (view.typeAt ?? 0) - 0.1 && !typedAll ? " is-active" : ""}`} style={{ top: CAT_SEARCH_TOP, height: CAT_SEARCH_H }}>
        <Search size={14} />
        {query ? <b>{query}</b> : <span>상품명·상품코드 검색</span>}
        {typing && t >= (view.typeAt ?? 0) - 0.1 && t < resultsAt && <i className="gd-caret" />}
      </div>
      <div className="gd-cat-chips" style={{ top: CAT_CHIPS_TOP }}>{CAT_CHIPS.map((chip, index) => <span key={chip} className={index === 0 ? "is-on" : ""}>{chip}</span>)}</div>
      {t >= resultsAt && <span className="gd-cat-label" style={{ top: CAT_LABEL_TOP, ...appear(t, resultsAt, 0.25, 4) }}>‘{view.query}’ 검색 결과 {view.rows.length}개</span>}
      {view.rows.map((row, index) => {
        if (t < resultsAt) return null;
        const unavailable = row.status !== "판매중";
        const fixed = row.sale !== "자율";
        return (
          <div key={row.code} className={`gd-cat-card${unavailable ? " is-unavailable" : ""}`} style={{ top: cardTop(index), ...appear(t, resultsAt + index * 0.12, 0.3, 8) }}>
            <span className="gd-cat-thumb">{row.emoji}{unavailable && <i>{row.status}</i>}</span>
            <b className="gd-cat-name">{markQuery(row.name, view.query)}</b>
            <em className={`gd-cat-status is-${row.status === "판매중" ? "on" : row.status === "품절" ? "sold" : "season"}`}>{row.status === "품절" && <Ban size={9} strokeWidth={3} />}{row.status}</em>
            <small className="gd-cat-code">{row.code}</small>
            <span className={`gd-cat-pill is-sale${fixed ? " is-fixed" : ""}`}>{fixed ? `지정 ${row.sale}` : "판매가 자율"}</span>
            <span className={`gd-cat-pill is-ship${row.ship === "무료" ? " is-free" : ""}`}>배송비 {row.ship}</span>
            <span className="gd-cat-price"><small>A단가</small><b>{won(row.a)}</b></span>
            <span className="gd-cat-price is-general"><small>일반공급가</small><b>{won(row.general)}</b></span>
          </div>
        );
      })}
      {current && focusBox && (
        <>
          <span key={`ring-${current.at}`} className="gd-cat-ring" style={{ left: CAT_LEFT + focusBox.left - 2, top: cardTop(current.row) + focusBox.top - 2, width: focusBox.width + 4, height: focusBox.height + 4, opacity: easeOut(prog(t, current.at, 0.2)) }} />
          <div
            key={`note-${current.at}`}
            className={`gd-cat-callout${calloutBelow ? " is-below" : " is-above"}`}
            style={{
              ...(calloutBelow ? { top: cardTop(current.row) + CAT_CARD_H + 6 } : { bottom: 416 - cardTop(current.row) + 6 }),
              ...appear(t, current.at + 0.05, 0.3, calloutBelow ? -6 : 6)
            }}
          >
            <i style={{ left: CAT_LEFT + focusBox.left + focusBox.width / 2 - 18 - 6 }} />
            {current.note.split("\n").map((line) => <span key={line}>{line}</span>)}
          </div>
        </>
      )}
      {cursor && <Cursor x={cursor[0]} y={cursor[1]} who={party} click={pulseAt(t, stops.map((stop) => stop.at))} />}
    </div>
  );
}

/* ───────── 가격변동 · 품절이슈 ───────── */

const FEED_TITLE_TOP = STRIP;
const FEED_TABS_TOP = FEED_TITLE_TOP + 40;
const FEED_SUM_TOP = FEED_TABS_TOP + 30;
const FEED_CARD_TOP = FEED_SUM_TOP + 36;
const FEED_CARD_H = 74;
const FEED_CARD_STEP = 82;
const FEED_BTN_LABEL = "가격변동 엑셀";

export function FeedView({ view, t, actor, party }: ViewProps<"feed">) {
  const price = view.mode === "price";
  const ups = view.items.filter((item) => (item.to ?? 0) > (item.from ?? 0)).length;
  const tabs = price
    ? [["오늘", view.items.length], ["어제", 5], ["2일 전", 2], ["3일 전", 4], ["전체", view.items.length + 11]] as const
    : [["오늘", 1], ["어제", 1], ["2일 전", 0], ["전체 · 최근 7일", view.items.length]] as const;
  const activeTab = price ? 0 : tabs.length - 1;
  const buttonWidth = Math.round(textPx(FEED_BTN_LABEL, 10.5) + 18 + 15);
  const buttonCenter: [number, number] = [VIEW_W - 10 - buttonWidth / 2, FEED_TITLE_TOP + 8 + 12];
  const download = view.download;
  const cursor = download ? cursorPath(t, [250, 396], [{ at: download.at, to: buttonCenter, move: 0.65 }]) : null;
  return (
    <div className="gd-view-root">
      <StatusStrip who={actor} text={timed(view.status, t)} />
      <div className="gd-feed-title" style={{ top: FEED_TITLE_TOP }}><strong>{price ? "가격변동" : "품절이슈"}</strong><span>2026년 11월 6일 금요일</span></div>
      {price && <span className={`gd-ord-btn is-excel${download && t >= download.at && t < download.at + 0.5 ? " is-pressed" : ""}`} style={{ right: 10, top: FEED_TITLE_TOP + 8, width: buttonWidth }}><Download size={11} />{FEED_BTN_LABEL}</span>}
      <div className="gd-feed-tabs" style={{ top: FEED_TABS_TOP }}>
        {tabs.map(([label, count], index) => <span key={label} className={index === activeTab ? "is-on" : ""}>{label} <b>{count}</b></span>)}
      </div>
      <div className="gd-feed-sum" style={{ top: FEED_SUM_TOP }}>
        {price ? <>오늘 가격변동 <b>{view.items.length}건</b> · 인상 <b className="is-up">{ups}건</b> · 인하 <b className="is-down">{view.items.length - ups}건</b></> : <>최근 7일 품절 <b>{view.items.length}건</b> · 오늘 <b className="is-up">1건</b></>}
      </div>
      {view.items.map((item, index) => {
        const up = (item.to ?? 0) > (item.from ?? 0);
        const diff = Math.abs((item.to ?? 0) - (item.from ?? 0));
        const [when, ago] = (item.when ?? "").split(" · ");
        return (
          <div key={item.code} className={`gd-feed-card${price ? "" : " is-soldout"}`} style={{ top: FEED_CARD_TOP + index * FEED_CARD_STEP, height: FEED_CARD_H, ...appear(t, 0.35 + index * 0.22, 0.3, 8) }}>
            <span className="gd-cat-thumb">{item.emoji}{!price && <i>품절</i>}</span>
            <b className="gd-feed-name">{item.name}</b>
            <small className="gd-feed-code">{item.code}{price && item.when ? ` · ${item.when}` : ""}</small>
            {price ? (
              <div className="gd-feed-change">
                <span className="gd-feed-label">A단가</span>
                <s>{won(item.from ?? 0)}</s>
                <span>→</span>
                <b>{won(item.to ?? 0)}</b>
                <em className={up ? "is-up" : "is-down"}>{up ? "▲" : "▼"} {diff.toLocaleString("ko-KR")}원 {up ? "인상" : "인하"}</em>
              </div>
            ) : (
              <div className="gd-feed-change">
                <span className="gd-feed-label">품절 처리</span>
                <b>{when}</b>
                <em className="is-sold"><Ban size={9} strokeWidth={3} /> {ago}</em>
              </div>
            )}
          </div>
        );
      })}
      {download && t >= download.at + 0.15 && <div className="gd-shop-toast"><span style={appear(t, download.at + 0.15, 0.3)}><FileSpreadsheet size={13} /> {download.file} 받았어요</span></div>}
      {cursor && <Cursor x={cursor[0]} y={cursor[1]} who={party} click={clickPulse(t, download?.at)} />}
    </div>
  );
}
