// 사용법 안내 영상(애니메이션 플레이어, 공급사·위탁셀러 공용). 장면 대본(guide-demo-scripts.ts · guide-demo-seller-scripts.ts)을 시간(초)에 따라 그립니다.
// 모든 움직임은 time 값으로 계산하므로(CSS 애니메이션 없음) 같은 시간이면 같은 화면이 나오고, 영상 파일(mp4)로도 그대로 뽑을 수 있습니다.
// 무대는 360×640(9:16) 고정 크기로 그리고 화면 폭에 맞춰 확대·축소합니다. 위탁셀러 영상은 초록 테마(.gd-stage.is-seller)입니다.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useParams } from "react-router-dom";
import { Check, ChevronRight, Clock3, FileSpreadsheet, FileText, Minus, Paperclip, Pause, Play, RotateCcw, Send } from "lucide-react";
import { DEFAULT_SELLER_GUIDE, SELLER_DEMO_VIDEO_IDS } from "@repo/shared/seller-guide";
import { DEFAULT_SUPPLIER_GUIDE, SUPPLIER_DEMO_VIDEO_IDS } from "@repo/shared/supplier-guide";
import "./guide-demo.css";
import { Avatar, Cursor, StatusStrip, appear, clamp, clickPulse, easeInOut, easeOut, highlight, lerp, lines, moveCursor, prog, timed, typeTime, typed, whoName } from "./guide-demo-kit";
import { CatalogView, FeedView, MenuView, OrdersView, UploadView } from "./guide-demo-shop";
import { DEMO_SHEET_ROWS, SUPPLIER_DEMO_SCRIPTS, demoDuration, formatDemoTime, isChapterScene, plainCaption, type DemoActor, type DemoAudience, type DemoScript, type DemoView } from "./guide-demo-scripts";
import { SELLER_DEMO_SCRIPTS } from "./guide-demo-seller-scripts";

export const DEMO_W = 360;
export const DEMO_H = 640;

type ViewOf<K extends DemoView["kind"]> = Extract<DemoView, { kind: K }>;

const ALL_DEFAULT_VIDEOS = [...DEFAULT_SUPPLIER_GUIDE.videos, ...DEFAULT_SELLER_GUIDE.videos];
const defaultTitle = (id: string) => ALL_DEFAULT_VIDEOS.find((video) => video.id === id)?.title ?? "두고푸드 사용법";
export const demoAudience = (script: DemoScript): DemoAudience => script.audience ?? "supplier";
const partyOf = (audience: DemoAudience): DemoActor => (audience === "seller" ? "seller" : "supplier");
const audienceLabel = (audience: DemoAudience) => (audience === "seller" ? "위탁셀러" : "공급사");

export function locateScene(script: DemoScript, time: number) {
  let start = 0;
  for (let index = 0; index < script.scenes.length; index += 1) {
    const scene = script.scenes[index];
    if (time < start + scene.duration || index === script.scenes.length - 1) return { scene, index, t: clamp(time - start, 0, scene.duration), start };
    start += scene.duration;
  }
  return { scene: script.scenes[0], index: 0, t: 0, start: 0 };
}

/* ───────── 장면 화면 ───────── */

function ChatView({ view, t }: { view: ViewOf<"chat">; t: number }) {
  const replyAt = view.replyAt ?? 1.2;
  const typingDots = t >= replyAt && t < replyAt + 0.3;
  return (
    <div className="gd-chat">
      <span className="gd-chat-date" style={appear(t, 0)}>{view.date}</span>
      <div className="gd-chat-ask" style={appear(t, 0.12, 0.4, 14)}>{lines(view.ask)}</div>
      {t >= replyAt && (
        <div className="gd-chat-reply" style={appear(t, replyAt, 0.3)}>
          <span className="gd-chat-who"><Avatar size={26} /> 두고푸드</span>
          <p>{typingDots ? <span className="gd-dots"><i /><i /><i /></span> : lines(typed(view.reply, t, replyAt + 0.3, 34))}</p>
        </div>
      )}
      <div className="gd-chat-input">두고푸드에 궁금한 점을 물어보세요</div>
      <small className="gd-chat-note">두고푸드 1:1 상담</small>
    </div>
  );
}

function StepsView({ view, t }: { view: ViewOf<"steps">; t: number }) {
  const focus = view.focusWho && view.focusAt !== undefined ? easeOut(prog(t, view.focusAt, 0.45)) : 0;
  return (
    <div className="gd-list-view">
      <span className="gd-tag" style={appear(t, 0)}><i />{view.tag}</span>
      <p className="gd-intro" style={appear(t, 0.15)}><Avatar size={26} />{view.intro}</p>
      <div className="gd-box" style={appear(t, 0.35)}>
        <strong>{view.title}</strong>
        <ol>
          {view.items.map((item, index) => {
            const base = appear(t, 0.6 + index * 0.3, 0.3, 8);
            const dim = focus > 0 && item.who !== view.focusWho ? 1 - 0.62 * focus : 1;
            const focused = focus > 0 && item.who === view.focusWho;
            return (
              <li key={item.title} className={focused ? "is-focus" : ""} style={{ ...base, opacity: Number(base.opacity) * dim }}>
                <span className="gd-num">{index + 1}</span>
                <span className="gd-li-text"><b>{item.title}</b><small>{item.sub}</small></span>
                <em className={`gd-who is-${item.who}`}>{whoName(item.who)}</em>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

// 카카오톡 단톡방처럼 보이는 대화(두고푸드 팀 ↔ 공급사·셀러). 공급사·셀러 화면 기준이라 그쪽 말이 오른쪽.
function GroupView({ view, t }: { view: ViewOf<"group">; t: number }) {
  return (
    <div className="gd-group">
      <div className="gd-group-head"><b>{view.title}</b><span>{view.members}</span></div>
      <div className="gd-group-body">
        <span className="gd-group-day">11월 6일 금요일</span>
        {view.messages.map((message, index) => {
          if (t < message.at - 0.35) return null;
          const typing = t < message.at;
          const mine = message.who !== "doogo";
          return (
            <div key={index} className={`gd-group-msg${mine ? " is-me" : ""}`} style={appear(t, message.at - 0.35, 0.3, 8)}>
              {!mine && <Avatar size={28} />}
              <div>
                <small>{message.name}</small>
                <p>{typing ? <span className="gd-dots"><i /><i /><i /></span> : message.text}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="gd-group-input">메시지 입력</div>
    </div>
  );
}

function ChecksView({ view, t }: { view: ViewOf<"checks">; t: number }) {
  return (
    <div className="gd-list-view">
      <span className="gd-tag" style={appear(t, 0)}><i />{view.tag}</span>
      <p className="gd-intro" style={appear(t, 0.15)}><Avatar size={26} />{view.intro}</p>
      <div className="gd-box" style={appear(t, 0.35)}>
        <strong>{view.title}</strong>
        <ul>
          {view.items.map((item, index) => {
            const at = 0.6 + index * 0.34;
            const checked = t >= at + 0.25;
            const mark = item.mark ?? "ok";
            return (
              <li key={item.title} style={appear(t, at, 0.3, 8)}>
                <span className={`gd-mark ${checked ? `is-${mark}` : ""}`} style={checked ? { transform: `scale(${(0.7 + 0.3 * easeOut(prog(t, at + 0.25, 0.25))).toFixed(3)})` } : undefined}>
                  {checked && (mark === "minus" ? <Minus size={13} strokeWidth={3} /> : <Check size={13} strokeWidth={3} />)}
                </span>
                <span className="gd-li-text"><b>{item.title}</b>{item.sub && <small>{item.sub}</small>}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

const INBOX_TOP = 70;
const INBOX_ROW = 64;

function InboxView({ view, t, actor, party }: { view: ViewOf<"inbox">; t: number; actor: DemoActor; party: DemoActor }) {
  let offset = 0;
  const rows = view.mails.map((mail) => {
    const p = mail.at === undefined ? 1 : easeOut(prog(t, mail.at, 0.45));
    const top = offset;
    offset += INBOX_ROW * p;
    return { mail, p, top };
  });
  const unread = view.mails.filter((mail) => !mail.read && (mail.at === undefined || t >= mail.at)).length;
  const opened = view.openAt !== undefined && t >= view.openAt;
  let cursor: ReactNode = null;
  if (view.openAt !== undefined && t >= view.openAt - 1.0) {
    const [x, y] = moveCursor(t, [250, 330], [190, INBOX_TOP + 34], view.openAt - 0.9, 0.75);
    cursor = <Cursor x={x} y={y} who={party} click={clickPulse(t, view.openAt)} />;
  }
  return (
    <div className="gd-view-root">
      <StatusStrip who={actor} text={timed(view.status, t)} />
      <div className="gd-inbox-head"><strong>받은편지함</strong>{unread > 0 && <span>{unread}</span>}</div>
      <div className="gd-inbox-list">
        {rows.map(({ mail, p, top }, index) => (
          <div key={mail.subject} className={`gd-mail-row${mail.read ? " is-read" : ""}${opened && index === 0 ? " is-open" : ""}`} style={{ top: top + (1 - p) * -18, opacity: p }}>
            <span className="gd-mail-avatar">두</span>
            <div className="gd-mail-main">
              <div className="gd-mail-line"><b>{mail.from}</b><time>{mail.time}</time></div>
              <p>{mail.subject}</p>
              <div className="gd-mail-tags">
                {mail.attach && <span className="gd-mail-attach"><Paperclip size={10} /> 엑셀</span>}
                {mail.tag && <span className={`gd-mail-tag is-${mail.tone ?? "new"}`}>{mail.tag}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
      {cursor}
    </div>
  );
}

function AttachmentCard({ attachment, active }: { attachment: NonNullable<ViewOf<"mail">["attachment"]>; active?: boolean }) {
  return (
    <div className={`gd-attach is-${attachment.type}${active ? " is-active" : ""}`}>
      <span className="gd-attach-icon">{attachment.type === "pdf" ? <FileText size={18} /> : <FileSpreadsheet size={18} />}</span>
      <span className="gd-attach-text"><b>{attachment.name}</b><small>{attachment.meta}</small></span>
      {active && <em><Check size={12} strokeWidth={3} /> 열림</em>}
    </div>
  );
}

function MailView({ view, t, actor, party }: { view: ViewOf<"mail">; t: number; actor: DemoActor; party: DemoActor }) {
  const status = timed(view.status, t);
  if (view.mode === "reply") {
    const clickAt = view.clickAt ?? 2.4;
    const sent = t >= clickAt + 0.15;
    const reply = typed(view.reply ?? "", t, 0.55, 20);
    let cursor: ReactNode = null;
    if (t >= clickAt - 1.0 && t < clickAt + 1.2) {
      const [x, y] = moveCursor(t, [150, 260], [262, 378], clickAt - 0.9, 0.75);
      cursor = <Cursor x={x} y={y} who={party} click={clickPulse(t, clickAt)} />;
    }
    return (
      <div className="gd-view-root">
        <StatusStrip who={actor} text={status} />
        <div className="gd-compose">
          <div className="gd-compose-head"><strong>답장</strong></div>
          <div className="gd-compose-field"><span>받는 사람</span><b>{view.to}</b></div>
          <div className="gd-compose-field"><span>제목</span><b>{view.subject}</b></div>
          {view.attachment && <div style={appear(t, 0.25)}><AttachmentCard attachment={view.attachment} /></div>}
          <p className="gd-compose-body">{lines(reply)}{!sent && reply.length < Array.from(view.reply ?? "").length && <i className="gd-caret" />}</p>
          {view.quote && <blockquote style={appear(t, 0.4)}>{view.quote}</blockquote>}
        </div>
        <span className={`gd-send${sent ? " is-sent" : ""}`}>{sent ? <><Check size={13} strokeWidth={3} /> 보냄</> : <><Send size={13} /> 보내기</>}</span>
        {sent && <div className="gd-toast-wrap"><span className="gd-toast" style={appear(t, clickAt + 0.15, 0.3)}><Check size={13} strokeWidth={3} /> 회신했어요</span></div>}
        {cursor}
      </div>
    );
  }
  const clickAt = view.clickAt;
  let cursor: ReactNode = null;
  if (view.attachment && clickAt !== undefined && t >= clickAt - 1.0) {
    const [x, y] = moveCursor(t, [250, 200], [150, 366], clickAt - 0.9, 0.75);
    cursor = <Cursor x={x} y={y} who={party} click={clickPulse(t, clickAt)} />;
  }
  return (
    <div className="gd-view-root">
      <StatusStrip who={actor} text={status} />
      <div className="gd-read">
        <strong className="gd-read-subject" style={appear(t, 0)}>{view.subject}</strong>
        <div className="gd-read-from" style={appear(t, 0.12)}><span className="gd-mail-avatar">두</span><b>{view.from}</b><time>{view.time}</time></div>
        <div className="gd-read-body">
          {(view.body ?? []).map((line, index) => <p key={line} style={appear(t, 0.3 + index * 0.22)}>{line}</p>)}
        </div>
      </div>
      {view.attachment && <div className="gd-read-attach" style={appear(t, 0.9)}><AttachmentCard attachment={view.attachment} active={clickAt !== undefined && t >= clickAt + 0.1} /></div>}
      {cursor}
    </div>
  );
}

// 발주서 엑셀(고정 크기 표). 위치는 화면 좌표 계산에도 씁니다.
const SHEET_COLS = [
  { key: "no", label: "", width: 16 },
  { key: "name", label: "수령인", width: 38 },
  { key: "address", label: "주소", width: 56 },
  { key: "item", label: "상품", width: 58 },
  { key: "qty", label: "수량", width: 24 },
  { key: "courier", label: "택배사", width: 52 },
  { key: "invoice", label: "송장번호", width: 68 }
] as const;
type SheetKey = (typeof SHEET_COLS)[number]["key"];
const SHEET_LEFT = 6;
const SHEET_STRIP = 26;
const SHEET_GRID_TOP = SHEET_STRIP + 6 + 30 + 26 + 6; // 상태 줄 + 여백 + 파일 줄 + 수식 줄 + 여백
const SHEET_HEAD = 24;
const SHEET_ROW = 28;
const colX = (key: SheetKey) => {
  let x = SHEET_LEFT;
  for (const col of SHEET_COLS) {
    if (col.key === key) return x;
    x += col.width;
  }
  return x;
};
const colWidth = (key: SheetKey) => SHEET_COLS.find((col) => col.key === key)?.width ?? 40;
const COL_LETTER: Partial<Record<SheetKey, string>> = { name: "A", address: "B", item: "C", qty: "D", courier: "E", invoice: "F" };
const VIEW_FOCUS: SheetKey[] = ["name", "address", "item", "qty"];
const TYPE_ROWS = 3;
const TYPE_START = 0.45;
const TYPE_ROW_TIME = 1.15;

type SheetCell = { value: string; active?: boolean; caret?: boolean; done?: boolean };

function SheetGrid({ file, tab = "발주서", cells, focusCol, cell: cellRef, formula, registered = -1 }: {
  file: string;
  tab?: string;
  cells: (row: number, key: SheetKey) => SheetCell;
  focusCol?: SheetKey;
  cell?: string;
  formula?: string;
  registered?: number;
}) {
  return (
    <div className="gd-sheet">
      <div className="gd-sheet-file"><FileSpreadsheet size={15} /><b>{file}</b><span>엑셀</span></div>
      <div className="gd-sheet-formula"><span>{cellRef ?? "A1"}</span><i>fx</i><b>{formula ?? ""}</b></div>
      <table>
        <colgroup>{SHEET_COLS.map((col) => <col key={col.key} style={{ width: col.width }} />)}</colgroup>
        <thead>
          <tr>{SHEET_COLS.map((col) => <th key={col.key} className={focusCol === col.key ? "is-focus" : ""}>{col.label}</th>)}</tr>
        </thead>
        <tbody>
          {DEMO_SHEET_ROWS.map((row, rowIndex) => (
            <tr key={row.invoice} className={rowIndex <= registered ? "is-registered" : ""}>
              {SHEET_COLS.map((col) => {
                if (col.key === "no") return <td key={col.key} className="gd-sheet-no">{rowIndex + 2}</td>;
                const value = cells(rowIndex, col.key);
                return (
                  <td key={col.key} className={`${focusCol === col.key ? "is-focus" : ""}${value.active ? " is-active" : ""}`}>
                    {value.value}{value.caret && <i className="gd-caret" />}
                    {col.key === "invoice" && rowIndex <= registered && <span className="gd-sheet-check"><Check size={9} strokeWidth={3.5} /></span>}
                  </td>
                );
              })}
            </tr>
          ))}
          {[0, 1, 2].map((index) => <tr key={`empty-${index}`} className="is-empty">{SHEET_COLS.map((col) => <td key={col.key} className={col.key === "no" ? "gd-sheet-no" : ""}>{col.key === "no" ? DEMO_SHEET_ROWS.length + 2 + index : ""}</td>)}</tr>)}
        </tbody>
      </table>
      <div className="gd-sheet-tabs"><span className="is-on">{tab}</span><span>안내</span></div>
    </div>
  );
}

const rowValue = (row: number, key: SheetKey) => {
  const data = DEMO_SHEET_ROWS[row];
  if (!data || key === "no") return "";
  return data[key];
};

function SheetView({ view, t, duration, actor, party }: { view: ViewOf<"sheet">; t: number; duration: number; actor: DemoActor; party: DemoActor }) {
  if (view.mode === "view") {
    const slotRaw = Math.floor((t - 0.45) / 0.68);
    const slot = clamp(slotRaw, 0, VIEW_FOCUS.length - 1);
    const focusCol = t >= 0.45 && slotRaw < VIEW_FOCUS.length ? VIEW_FOCUS[slot] : undefined;
    const head = (key: SheetKey): [number, number] => [colX(key) + colWidth(key) / 2, SHEET_GRID_TOP + 14];
    const [x, y] = t < 0.45
      ? moveCursor(t, [220, 330], head(VIEW_FOCUS[0]), 0, 0.45)
      : moveCursor(t, head(VIEW_FOCUS[Math.max(0, slot - 1)]), head(VIEW_FOCUS[slot]), 0.45 + slot * 0.68, 0.35);
    const focusRow = 0;
    return (
      <div className="gd-view-root">
        <StatusStrip who={actor} text={view.status} />
        <SheetGrid
          file={view.file}
          tab={view.tab}
          focusCol={focusCol}
          cell={focusCol ? `${COL_LETTER[focusCol]}${focusRow + 2}` : "A2"}
          formula={focusCol ? rowValue(focusRow, focusCol) : rowValue(0, "name")}
          cells={(row, key) => ({ value: key === "courier" || key === "invoice" ? "" : rowValue(row, key) })}
        />
        <Cursor x={x} y={y} who={party} />
      </div>
    );
  }
  if (view.mode === "type") {
    const local = t - TYPE_START;
    const rowIndex = clamp(Math.floor(local / TYPE_ROW_TIME), 0, TYPE_ROWS - 1);
    const within = local - rowIndex * TYPE_ROW_TIME;
    const finished = local >= TYPE_ROWS * TYPE_ROW_TIME;
    const activeKey: SheetKey = within < 0.4 ? "courier" : "invoice";
    const cellText = (row: number, key: SheetKey): SheetCell => {
      if (key !== "courier" && key !== "invoice") return { value: rowValue(row, key) };
      if (t < TYPE_START || row > rowIndex || (row === rowIndex && local < 0)) return { value: "" };
      if (row < rowIndex || finished) return { value: rowValue(row, key) };
      if (key === "courier") return { value: within >= 0.25 ? rowValue(row, key) : "", active: !finished && activeKey === "courier" };
      const text = typed(rowValue(row, "invoice"), within, 0.42, 26);
      return { value: text, active: !finished && activeKey === "invoice", caret: !finished && activeKey === "invoice" && text.length < 12 };
    };
    const done = finished ? TYPE_ROWS : rowIndex + (within > 0.95 ? 1 : 0);
    const key = finished ? "invoice" : activeKey;
    const row = finished ? TYPE_ROWS - 1 : rowIndex;
    const target: [number, number] = [colX(key) + colWidth(key) - 8, SHEET_GRID_TOP + SHEET_HEAD + row * SHEET_ROW + 16];
    const [x, y] = t < TYPE_START ? moveCursor(t, [230, 340], target, 0, TYPE_START) : target;
    return (
      <div className="gd-view-root">
        <StatusStrip who={actor} text={view.status} count={`${done}/${TYPE_ROWS}`} />
        <SheetGrid
          file={view.file}
          tab={view.tab}
          cell={`${COL_LETTER[key]}${row + 2}`}
          formula={cellText(row, key).value}
          cells={cellText}
        />
        <Cursor x={x} y={y} who={party} />
      </div>
    );
  }
  const total = view.total ?? DEMO_SHEET_ROWS.length;
  const p = prog(t, 0.35, Math.max(0.5, duration - 1.1));
  const count = Math.round(total * p);
  const registered = Math.floor(p * DEMO_SHEET_ROWS.length + 0.0001) - 1;
  return (
    <div className="gd-view-root">
      <StatusStrip who={actor} text={view.status} count={`${count}/${total}`} />
      <SheetGrid file={view.file} tab={view.tab} cell="F2" formula={rowValue(0, "invoice")} registered={Math.min(DEMO_SHEET_ROWS.length - 1, registered)} cells={(row, key) => ({ value: rowValue(row, key) })} />
    </div>
  );
}

const FORM_FIELDS_TOP = 26 + 76; // 상태 줄 + 제목·설명
const FORM_FIELD_GAP = 52;
// 입력칸 글자 끝 위치(대략): 한글 12.3px, 공백 3.6px, 그 밖 7px
const textWidth = (text: string) => Array.from(text).reduce((sum, char) => sum + (/[가-힣ㄱ-ㅎ]/.test(char) ? 12.3 : char === " " ? 3.6 : 7), 0);
const caretX = (text: string) => Math.min(28 + textWidth(text), 280);

function formSchedule(view: ViewOf<"form">) {
  let at = 0.45;
  const fields = view.fields.map((field) => {
    const start = at;
    const end = start + typeTime(field.value, 17);
    at = end + 0.16;
    return { ...field, start, end };
  });
  return { fields, submitAt: view.submit ? at + 0.5 : undefined };
}

function FormView({ view, t, actor }: { view: ViewOf<"form">; t: number; actor: DemoActor }) {
  const { fields, submitAt } = formSchedule(view);
  const activeIndex = fields.findIndex((field) => t < field.end + 0.16);
  const doneCount = activeIndex === -1 ? fields.length : activeIndex;
  const submitted = submitAt !== undefined && t >= submitAt + 0.1;
  const buttonTop = FORM_FIELDS_TOP + fields.length * FORM_FIELD_GAP + 6;
  let cursorPos: [number, number];
  if (activeIndex >= 0) {
    const field = fields[activeIndex];
    const text = typed(field.value, t, field.start, 17);
    const inputTop = FORM_FIELDS_TOP + activeIndex * FORM_FIELD_GAP + 18;
    const target: [number, number] = [caretX(text) + 4, inputTop + 16];
    const prevField = fields[activeIndex - 1];
    if (prevField && t < field.start + 0.2) {
      const prevTop = FORM_FIELDS_TOP + (activeIndex - 1) * FORM_FIELD_GAP + 18;
      cursorPos = moveCursor(t, [caretX(prevField.value) + 4, prevTop + 16], target, prevField.end, field.start + 0.2 - prevField.end);
    } else if (activeIndex === 0 && t < field.start) {
      cursorPos = moveCursor(t, [240, 380], target, 0, field.start);
    } else {
      cursorPos = target;
    }
  } else {
    const last = fields[fields.length - 1];
    const lastTop = FORM_FIELDS_TOP + (fields.length - 1) * FORM_FIELD_GAP + 18;
    const from: [number, number] = [caretX(last?.value ?? "") + 4, lastTop + 16];
    cursorPos = submitAt !== undefined ? moveCursor(t, from, [190, buttonTop + 20], (last?.end ?? 0) + 0.1, Math.max(0.2, submitAt - (last?.end ?? 0) - 0.15)) : from;
  }
  return (
    <div className="gd-view-root">
      <StatusStrip who={actor} text={view.status} count={`${doneCount}/${fields.length}`} />
      <div className="gd-form-head"><strong>{view.heading}</strong><small>{view.sub}</small></div>
      {fields.map((field, index) => {
        const text = typed(field.value, t, field.start, 17);
        const active = index === activeIndex && t >= field.start - 0.1;
        return (
          <label key={field.label} className={`gd-field${active ? ` is-active is-${actor}` : ""}`} style={{ top: FORM_FIELDS_TOP + index * FORM_FIELD_GAP }}>
            <span>{field.label}</span>
            <b>{text}{active && <i className="gd-caret" />}</b>
          </label>
        );
      })}
      {view.submit && (
        <span className={`gd-form-submit${submitted ? " is-done" : ""}`} style={{ top: buttonTop }}>
          {submitted ? <><Check size={14} strokeWidth={3} /> {view.done}</> : view.submit}
        </span>
      )}
      <Cursor x={cursorPos[0]} y={cursorPos[1]} who={actor} click={clickPulse(t, submitAt)} />
    </div>
  );
}

// 확인 창 안 항목 위치(.gd-modal: top 110 + 안쪽 여백 16 + 제목 20 + 설명 16 + 목록 위 여백 12)
const CONFIRM_ITEMS_TOP = 110 + 16 + 20 + 16 + 12;
const CONFIRM_ITEM = 34;
const CONFIRM_MARK_X = 24 + 16 + 8;

function ConfirmView({ view, t, party }: { view: ViewOf<"confirm">; t: number; party: DemoActor }) {
  const dim = easeOut(prog(t, 0, 0.3));
  const checkAt = (index: number) => 0.75 + index * 0.62;
  const current = view.items.findIndex((_, index) => t < checkAt(index));
  const targetIndex = current === -1 ? view.items.length - 1 : current;
  const itemPoint = (index: number): [number, number] => [CONFIRM_MARK_X, CONFIRM_ITEMS_TOP + index * CONFIRM_ITEM + 14];
  const [x, y] = targetIndex === 0
    ? moveCursor(t, [230, 330], itemPoint(0), 0.2, 0.5)
    : moveCursor(t, itemPoint(targetIndex - 1), itemPoint(targetIndex), checkAt(targetIndex - 1) + 0.18, 0.38);
  const pulseIndex = view.items.findIndex((_, index) => t >= checkAt(index) && t <= checkAt(index) + 0.4);
  return (
    <div className="gd-view-root">
      {view.base === "sheet"
        ? <SheetGrid file="두고푸드_발주서_1106_오전.xlsx" cell="A2" formula="김민지" cells={(row, key) => ({ value: key === "courier" || key === "invoice" ? "" : rowValue(row, key) })} />
        : <div className="gd-read is-base"><strong className="gd-read-subject">[두고푸드] 11월 정산 내역 · 판매 대금 2,000,000원</strong><div className="gd-read-from"><span className="gd-mail-avatar">두</span><b>두고푸드 정산</b><time>12월 1일</time></div><div className="gd-read-body"><p>11월 1일~30일 주문분 정산 내역입니다.</p><p>확인 후 물품 세금계산서(면세 상품은 계산서)를 발행해 주세요.</p></div></div>}
      <div className="gd-dim" style={{ opacity: dim }} />
      <div className="gd-modal" style={appear(t, 0.15, 0.35, 16)}>
        <strong>{view.title}</strong>
        <small>{view.sub}</small>
        <ul>
          {view.items.map((item, index) => {
            const checked = t >= checkAt(index);
            return (
              <li key={item} className={checked ? "is-checked" : ""}>
                <span className="gd-mark" style={checked ? { transform: `scale(${(0.7 + 0.3 * easeOut(prog(t, checkAt(index), 0.25))).toFixed(3)})` } : undefined}>{checked && <Check size={12} strokeWidth={3} />}</span>
                {item}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="gd-pill-wrap"><span className="gd-pill" style={appear(t, 0.5)}>{view.pill}</span></div>
      <Cursor x={x} y={y} who={party} click={pulseIndex >= 0 ? clickPulse(t, checkAt(pulseIndex)) : 0} />
    </div>
  );
}

function DoneView({ view, t }: { view: ViewOf<"done">; t: number }) {
  const rowsEnd = 0.45 + view.rows.length * 0.28;
  const totalEnd = view.total ? rowsEnd + 0.95 : rowsEnd;
  const msgAt = totalEnd + 0.25;
  const toggleAt = msgAt + 0.75;
  const totalValue = view.total ? Math.round(view.total.value * easeOut(prog(t, rowsEnd, 0.9)) / 10) * 10 : 0;
  const toggleOn = easeInOut(prog(t, toggleAt, 0.3));
  return (
    <div className="gd-done">
      <span className="gd-done-chip" style={appear(t, 0)}><Check size={12} strokeWidth={3} /> {view.badge}</span>
      <div className="gd-done-card" style={appear(t, 0.15)}>
        <strong><Check size={15} strokeWidth={3} /> {view.title}</strong>
        <ul>
          {view.rows.map((row, index) => (
            <li key={row.label} style={appear(t, 0.45 + index * 0.28, 0.3, 8)}>
              <span>{row.label}</span>
              <b className={row.tone === "minus" ? "is-minus" : ""}>{row.value}</b>
            </li>
          ))}
        </ul>
        {view.total && (
          <div className="gd-done-total" style={appear(t, rowsEnd - 0.1, 0.3)}>
            <span>{view.total.label}</span>
            <b>{totalValue.toLocaleString("ko-KR")}{view.total.suffix}</b>
          </div>
        )}
      </div>
      {view.message && <p className="gd-done-message" style={appear(t, msgAt)}><Avatar size={26} /><span>{lines(view.message)}</span></p>}
      {view.toggle && (
        <div className="gd-done-toggle" style={appear(t, msgAt + 0.3)}>
          <span>{view.toggle}</span>
          <i className="gd-switch" style={{ background: toggleOn > 0.5 ? "#2f7de1" : "#cbd5e1" }}><b style={{ transform: `translateX(${(toggleOn * 16).toFixed(1)}px)` }} /></i>
        </div>
      )}
    </div>
  );
}

// 표지 카드: "이 영상에서 볼 내용"(장면 목록). t=0에도 모두 보이고(재생 전 화면), 재생하면 위에서부터 차례로 강조합니다.
function CoverView({ script, t, duration }: { script: DemoScript; t: number; duration: number }) {
  const chapters = script.scenes.filter(isChapterScene);
  const step = (duration - 0.5) / Math.max(1, chapters.length);
  const current = t >= 0.3 ? Math.floor((t - 0.3) / step) : -1;
  return (
    <div className="gd-cover">
      <div className="gd-cover-head">
        <strong>이 영상에서 볼 내용</strong>
        <span><Clock3 size={12} /> {formatDemoTime(demoDuration(script))}</span>
      </div>
      <ol className={chapters.length > 6 ? "is-dense" : ""}>
        {chapters.map((scene, index) => (
          <li key={`${scene.caption.title}-${index}`} className={index === current ? "is-on" : index < current ? "is-past" : ""}>
            <span className="gd-num">{index + 1}</span>
            <span className="gd-li-text"><small>{scene.caption.kicker}</small><b>{plainCaption(scene.caption.title)}</b></span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// 마무리 화면 문구(공급사: 입점 신청 / 위탁셀러: 단가표·도매몰)
const END_COPY: Record<DemoAudience, { chip: string; line: string; big: string; small: string; cta: string; ctaSub: string }> = {
  supplier: { chip: "공급사 입점 모집 중", line: "메일 두 번이면 끝나는", big: "두고푸드 공급사", small: "입점 신청하면 제안서를 메일로 바로 보내 드려요", cta: "doogofood.site에서 입점 신청", ctaSub: "사용방법 › 공급사 › 입점 신청하기" },
  seller: { chip: "재고 없이 시작하는 위탁 판매", line: "주문만 넣으면 출고는 두고푸드가", big: "두고푸드 위탁셀러", small: "단가표에서 상품을 고르고 도매몰에서 주문하세요", cta: "doogofood.site 단가표 보기", ctaSub: "주문은 두고푸드 도매몰(shop.baljuora.com/doogofood)" }
};

function EndCard({ view, t, audience }: { view: ViewOf<"end">; t: number; audience: DemoAudience }) {
  const copy = END_COPY[audience];
  return (
    <div className="gd-end">
      <img className="gd-end-logo" style={appear(t, 0.05)} src="/assets/brand/doogo-food-logo-white.png" alt="" draggable={false} />
      <p className="gd-end-tagline" style={appear(t, 0.2)}>식품 전문 도매 데이터 플랫폼</p>
      <span className="gd-end-chip" style={appear(t, 0.35)}>{copy.chip}</span>
      <p className="gd-end-line" style={appear(t, 0.55)}>{view.line ?? copy.line}</p>
      <strong className="gd-end-big" style={appear(t, 0.7, 0.4, 14)}>{view.big ?? copy.big}</strong>
      <p className="gd-end-small" style={appear(t, 0.9)}>{copy.small}</p>
      <span className="gd-end-cta" style={appear(t, 1.1, 0.4, 14)}><b>{copy.cta}</b><small>{copy.ctaSub}</small></span>
    </div>
  );
}

const BROWSER_URL: Partial<Record<DemoView["kind"], string>> = { inbox: "메일 · 받은편지함", mail: "메일", sheet: "엑셀", confirm: "엑셀", menu: "shop.baljuora.com/doogofood", upload: "shop.baljuora.com/doogofood › 대량 주문 입력(엑셀)", catalog: "doogofood.site › 상품 단가표" };

function browserUrl(view: DemoView) {
  if (view.kind === "form") return view.url;
  if (view.kind === "mail") return view.mode === "reply" ? "메일 · 답장 쓰기" : "메일 · 받은편지함";
  if (view.kind === "confirm") return view.base === "mail" ? "메일 · 받은편지함" : "엑셀";
  if (view.kind === "orders") return `shop.baljuora.com/doogofood › ${view.page}`;
  if (view.kind === "feed") return view.mode === "price" ? "doogofood.site › 가격변동" : "doogofood.site › 품절이슈";
  return BROWSER_URL[view.kind] ?? "";
}

const BROWSER_KINDS = new Set<DemoView["kind"]>(["inbox", "mail", "sheet", "form", "confirm", "menu", "orders", "upload", "catalog", "feed"]);
const isBrowserView = (kind: DemoView["kind"]) => BROWSER_KINDS.has(kind);

function SceneView({ view, t, duration, actor, party }: { view: DemoView; t: number; duration: number; actor: DemoActor; party: DemoActor }) {
  switch (view.kind) {
    case "chat": return <ChatView view={view} t={t} />;
    case "steps": return <StepsView view={view} t={t} />;
    case "checks": return <ChecksView view={view} t={t} />;
    case "group": return <GroupView view={view} t={t} />;
    case "inbox": return <InboxView view={view} t={t} actor={actor} party={party} />;
    case "mail": return <MailView view={view} t={t} actor={actor} party={party} />;
    case "sheet": return <SheetView view={view} t={t} duration={duration} actor={actor} party={party} />;
    case "form": return <FormView view={view} t={t} actor={actor} />;
    case "confirm": return <ConfirmView view={view} t={t} party={party} />;
    case "done": return <DoneView view={view} t={t} />;
    case "menu": return <MenuView view={view} t={t} actor={actor} party={party} />;
    case "orders": return <OrdersView view={view} t={t} actor={actor} party={party} />;
    case "upload": return <UploadView view={view} t={t} actor={actor} party={party} />;
    case "catalog": return <CatalogView view={view} t={t} actor={actor} party={party} />;
    case "feed": return <FeedView view={view} t={t} actor={actor} party={party} />;
    default: return null;
  }
}

// 영상 한 프레임(360×640). time은 영상 처음부터의 초.
export function DemoStage({ script, time, title, number }: { script: DemoScript; time: number; title?: string; number?: number }) {
  const { scene, index, t } = locateScene(script, time);
  const actor = timed(scene.actor, t) ?? "doogo";
  const audience = demoAudience(script);
  const party = partyOf(audience);
  if (scene.view.kind === "end") {
    return <div className={`gd-stage is-${audience} is-end`}><EndCard view={scene.view} t={t} audience={audience} /></div>;
  }
  if (scene.view.kind === "cover") {
    const coverTitle = title?.trim() || defaultTitle(script.id);
    const coverLength = Array.from(coverTitle).length;
    return (
      <div className={`gd-stage is-${audience} is-cover`}>
        <div className="gd-cover-caption">
          <span>{audienceLabel(audience)} 사용법{number ? ` ${String(number).padStart(2, "0")}` : ""}</span>
          <strong style={{ fontSize: coverLength > 14 ? 23 : 27 }}>{coverTitle}</strong>
        </div>
        <div className="gd-card is-app is-cover">
          <div className="gd-view"><CoverView script={script} t={t} duration={scene.duration} /></div>
        </div>
        <p className="gd-foot">이해를 돕기 위한 예시 화면이에요</p>
      </div>
    );
  }
  const prev = index > 0 ? script.scenes[index - 1] : undefined;
  const sameCaption = prev && prev.caption.title === scene.caption.title && prev.caption.kicker === scene.caption.kicker;
  const browser = isBrowserView(scene.view.kind);
  const titleLength = Array.from(plainCaption(scene.caption.title)).length;
  const fade = easeOut(prog(t, 0, 0.25));
  return (
    <div className={`gd-stage is-${audience}`}>
      <div className="gd-caption" style={sameCaption ? undefined : appear(t, 0, 0.35, 8)}>
        <span>{scene.caption.kicker}</span>
        <strong style={{ fontSize: titleLength > 12 ? 24 : 27 }}>{highlight(scene.caption.title)}</strong>
      </div>
      <div className="gd-actors">
        <span className={actor === party ? `is-on is-${party}` : ""}>{audienceLabel(audience)}</span>
        <span className={actor === "doogo" ? "is-on is-doogo" : ""}>두고푸드</span>
      </div>
      <div className={`gd-card ${browser ? "is-browser" : "is-app"} is-by-${actor}`}>
        {browser && <div className="gd-browser-bar"><i /><i /><i /><span>{browserUrl(scene.view)}</span></div>}
        <div className="gd-view" style={{ opacity: lerp(0.35, 1, fade) }}>
          <SceneView view={scene.view} t={t} duration={scene.duration} actor={actor} party={party} />
        </div>
      </div>
      <p className="gd-foot">이해를 돕기 위한 예시 화면이에요</p>
    </div>
  );
}

const prefersReducedMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

// 화면에 보이면 자동 재생(동작 줄이기 설정이면 직접 눌러 재생), 화면 밖·다른 탭이면 멈춤.
export function GuideDemoPlayer({ script, label, number, seek, onScene, next }: {
  script: DemoScript;
  label: string;
  number?: number;
  seek?: { time: number; key: number };
  onScene?: (index: number) => void;
  next?: { title: string; onClick: () => void };
}) {
  const duration = useMemo(() => demoDuration(script), [script]);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [scale, setScale] = useState(1);
  const timeRef = useRef(0);
  const screenRef = useRef<HTMLDivElement>(null);
  const visibleRef = useRef(false);
  const userPausedRef = useRef(false);
  const ended = time >= duration - 0.0001;

  const setBoth = useCallback((value: number) => {
    timeRef.current = value;
    setTime(value);
  }, []);

  useEffect(() => {
    setBoth(0);
    userPausedRef.current = false;
    setPlaying(visibleRef.current && !prefersReducedMotion());
  }, [script.id, setBoth]);

  useEffect(() => {
    if (!seek) return;
    setBoth(clamp(seek.time, 0, duration));
    userPausedRef.current = false;
    setPlaying(true);
  }, [seek?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const element = screenRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setScale(entry.contentRect.width / DEMO_W);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = screenRef.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      visibleRef.current = Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.45);
      if (!visibleRef.current) setPlaying(false);
      else if (!userPausedRef.current && !prefersReducedMotion() && timeRef.current < duration) setPlaying(true);
    }, { threshold: [0, 0.45, 0.8] });
    observer.observe(element);
    return () => observer.disconnect();
  }, [duration]);

  useEffect(() => {
    const onVisibility = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(0.1, (now - last) / 1000);
      last = now;
      const value = timeRef.current + delta;
      if (value >= duration) {
        setBoth(duration);
        setPlaying(false);
        return;
      }
      setBoth(value);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration, setBoth]);

  const sceneIndex = locateScene(script, time).index;
  useEffect(() => { onScene?.(sceneIndex); }, [sceneIndex, onScene]);

  const toggle = () => {
    if (ended) {
      setBoth(0);
      userPausedRef.current = false;
      setPlaying(true);
      return;
    }
    userPausedRef.current = playing;
    setPlaying(!playing);
  };
  const seekScene = (index: number) => {
    const start = script.scenes.slice(0, index).reduce((sum, scene) => sum + scene.duration, 0);
    setBoth(start);
    userPausedRef.current = false;
    setPlaying(true);
  };
  let sceneStart = 0;
  return (
    <div className={`gd-player is-${demoAudience(script)}`}>
      <div className="gd-screen" ref={screenRef} onClick={toggle} role="group" aria-label={`${label} 안내 영상 (${playing ? "재생 중, 누르면 일시정지" : "누르면 재생"})`}>
        <div className="gd-scaler" style={{ transform: `scale(${scale})` }} aria-hidden="true">
          <DemoStage script={script} time={time} title={label} number={number} />
        </div>
        {!playing && !ended && <span className="gd-bigplay" aria-hidden="true"><Play size={16} fill="currentColor" /> {time > 0 ? "이어 보기" : "영상 보기"} <small>{formatDemoTime(duration)}</small></span>}
        {ended && (
          <div className="gd-ended" onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={toggle}><RotateCcw size={16} /> 다시 보기</button>
            {next && <button type="button" className="is-next" onClick={next.onClick}>다음 영상 · {next.title} <ChevronRight size={16} /></button>}
          </div>
        )}
      </div>
      <div className="gd-controls">
        <button type="button" className="gd-play" onClick={toggle} aria-label={ended ? "다시 보기" : playing ? "일시정지" : "재생"}>
          {ended ? <RotateCcw size={16} /> : playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        </button>
        <div className="gd-segments">
          {script.scenes.map((scene, index) => {
            const start = sceneStart;
            sceneStart += scene.duration;
            const fill = clamp((time - start) / scene.duration);
            const name = scene.view.kind === "end" ? "마무리" : scene.view.kind === "cover" ? "영상 제목·볼 내용" : plainCaption(scene.caption.title);
            return (
              <button key={index} type="button" style={{ flexGrow: scene.duration }} onClick={() => seekScene(index)} aria-label={`${index + 1}번째 장면: ${name}`} title={name}>
                <i style={{ transform: `scaleX(${fill.toFixed(4)})` }} />
              </button>
            );
          })}
        </div>
        <span className="gd-time">{formatDemoTime(time)} / {formatDemoTime(duration)}</span>
      </div>
    </div>
  );
}

// 기본 영상 목록에서 몇 번째 영상인지(표지의 "사용법 0N")
const demoNumber = (id: string) => {
  const supplier = (SUPPLIER_DEMO_VIDEO_IDS as readonly string[]).indexOf(id);
  if (supplier >= 0) return supplier + 1;
  const seller = (SELLER_DEMO_VIDEO_IDS as readonly string[]).indexOf(id);
  return seller >= 0 ? seller + 1 : undefined;
};

// 개발용: 영상 파일(mp4)로 뽑을 때 쓰는 한 프레임 화면(/dev/guide-demo/:id, 개발 서버에서만 연결)
export function GuideDemoRender() {
  const { id = "overview" } = useParams();
  const script = SUPPLIER_DEMO_SCRIPTS[id] ?? SELLER_DEMO_SCRIPTS[id];
  const [time, setTime] = useState(0);
  useEffect(() => {
    if (!script) return;
    const target = window as unknown as { __guideDemo?: { duration: number; seek: (value: number) => Promise<void> } };
    target.__guideDemo = {
      duration: demoDuration(script),
      seek: (value: number) => new Promise((resolve) => {
        flushSync(() => setTime(value));
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
    };
  }, [script]);
  if (!script) return <p>없는 영상입니다: {id}</p>;
  return (
    <div className="gd-render" style={{ width: DEMO_W, height: DEMO_H }}>
      <DemoStage script={script} time={time} number={demoNumber(id)} />
    </div>
  );
}
