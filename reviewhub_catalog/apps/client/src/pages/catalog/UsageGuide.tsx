// 사용방법(/how-to): 위탁셀러 · 공급사 랜딩페이지. 공급사 화면은 입점 절차 · 주문 처리(메일 발주 · 송장 회신) · 정산 · 사용법 영상 · FAQ · 입점 신청을 보여 줍니다.
// 공급사에게는 별도 관리자 사이트·프로그램을 주지 않습니다: 정한 시간(오전 1회·오후 1회)에 발주서 메일을 받고, 출고 후 그 메일에 송장을 회신합니다.
// 운영 기준과 영상 목록은 관리자 > 사용방법 관리(content_settings "supplier_guide")에서 바꾸며, 입점 제안서 PDF도 같은 값을 씁니다.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  BadgeCheck,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Handshake,
  Mail,
  MessageCircle,
  PackageCheck,
  PlayCircle,
  Receipt,
  ShoppingCart,
  Store,
  Truck,
  Undo2,
  Video,
  Wallet
} from "lucide-react";
import { DEFAULT_SUPPLIER_GUIDE, SUPPLIER_VIDEO_GROUPS, hasSupplierDemo, supplierVideoEmbed, type SupplierGuideSettings, type SupplierGuideVideo } from "@repo/shared/supplier-guide";
import { GuideDemoPlayer } from "./GuideDemo";
import { SUPPLIER_DEMO_SCRIPTS, demoDuration, formatDemoTime, isChapterScene, plainCaption } from "./guide-demo-scripts";
import { apiFetch } from "@/lib/api";
import { PageFrame } from "./PublicCatalog";

const openPartnerForm = () => window.dispatchEvent(new CustomEvent("doogo:partner-open"));
const PROPOSAL_URL = "/api/catalog/partner-proposal";
const KAKAO_URL = "https://pf.kakao.com/_NyuVn";

function AudienceTabs() {
  return (
    <nav className="usage-audience-tabs" aria-label="사용방법 대상">
      <NavLink to="/how-to/seller"><ShoppingCart size={16} /> 위탁셀러</NavLink>
      <NavLink to="/how-to/supplier"><Store size={16} /> 공급사</NavLink>
    </nav>
  );
}

function SectionHeading({ kicker, title, lead, icon }: { kicker: string; title: string; lead?: ReactNode; icon: ReactNode }) {
  return (
    <div className="usage-section-heading">
      <span className="usage-section-icon" aria-hidden="true">{icon}</span>
      <div>
        <span className="section-kicker">{kicker}</span>
        <h2>{title}</h2>
        {lead && <p>{lead}</p>}
      </div>
    </div>
  );
}

function useSupplierGuide() {
  const [guide, setGuide] = useState<SupplierGuideSettings>(DEFAULT_SUPPLIER_GUIDE);
  useEffect(() => {
    let active = true;
    void apiFetch("/catalog/supplier-guide", { auth: false, silent: true })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as { ok?: boolean; data?: { guide?: SupplierGuideSettings } };
        if (active && payload.ok && payload.data?.guide) setGuide(payload.data.guide);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  return guide;
}

// 사용법 영상: 화면 1개 + 묶음별 영상 목록(주소 ?clip=영상id로 바로 열 수 있음).
// 영상 주소(YouTube·Vimeo·mp4)가 있으면 그 영상을, 없으면 기본 안내 영상(애니메이션, guide-demo-scripts.ts)을 재생합니다.
// 둘 다 없는 영상은 "영상 준비 중"으로 보여 줍니다.
const demoScriptFor = (video: SupplierGuideVideo) => (!video.url.trim() && hasSupplierDemo(video.id) ? SUPPLIER_DEMO_SCRIPTS[video.id] : undefined);
const isPlayable = (video: SupplierGuideVideo) => supplierVideoEmbed(video.url).kind !== "none" || Boolean(demoScriptFor(video));

function VideoGuide({ videos }: { videos: SupplierGuideVideo[] }) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [sceneIndex, setSceneIndex] = useState(0);
  const [seek, setSeek] = useState<{ time: number; key: number }>();
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      const clip = new URLSearchParams(window.location.search).get("clip");
      if (clip) setSelectedId(clip);
    } catch {
      // 주소를 읽지 못해도 첫 영상을 보여 줍니다.
    }
  }, []);
  const selected = videos.find((video) => video.id === selectedId) ?? videos.find(isPlayable) ?? videos[0];
  const groups = useMemo(() => {
    const order = [...SUPPLIER_VIDEO_GROUPS, ...videos.map((video) => video.group)].filter((group, index, list) => list.indexOf(group) === index);
    return order.map((group) => ({ group, items: videos.filter((video) => video.group === group) })).filter((entry) => entry.items.length > 0);
  }, [videos]);
  // 좁은 화면에서는 목록이 영상 아래에 있으므로, 고른 뒤 영상이 보이게 올려 줍니다.
  const revealStage = () => {
    try {
      if (window.matchMedia("(max-width: 720px)").matches) stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      // 스크롤 실패는 무시합니다.
    }
  };
  const pick = (id: string, reveal = false) => {
    setSelectedId(id);
    setSceneIndex(0);
    setSeek(undefined);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("clip", id);
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      // 주소 갱신 실패는 무시합니다.
    }
    if (reveal) revealStage();
  };
  if (!selected) return null;
  const embed = supplierVideoEmbed(selected.url);
  const script = demoScriptFor(selected);
  const readyCount = videos.filter(isPlayable).length;
  const ordered = groups.flatMap((entry) => entry.items);
  const selectedIndex = ordered.findIndex((video) => video.id === selected.id);
  const nextVideo = ordered.slice(selectedIndex + 1).find(isPlayable);
  const sceneStart = (index: number) => (script ? script.scenes.slice(0, index).reduce((sum, scene) => sum + scene.duration, 0) : 0);
  const metaFor = (video: SupplierGuideVideo) => {
    const demo = demoScriptFor(video);
    if (demo) return video.duration || formatDemoTime(demoDuration(demo));
    return supplierVideoEmbed(video.url).kind !== "none" ? (video.duration || <PlayCircle size={15} />) : "준비 중";
  };
  let number = 0;
  return (
    <div className={`usage-video-layout${script ? " is-demo" : ""}`}>
      <div className="usage-video-stage" ref={stageRef}>
        {script ? (
          <GuideDemoPlayer
            script={script}
            label={selected.title}
            number={selectedIndex + 1}
            seek={seek}
            onScene={setSceneIndex}
            next={nextVideo ? { title: nextVideo.title, onClick: () => pick(nextVideo.id) } : undefined}
          />
        ) : (
          <div className="usage-video-frame">
            {embed.kind === "youtube" || embed.kind === "vimeo" ? (
              <iframe key={embed.src} src={embed.src} title={selected.title} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
            ) : embed.kind === "file" ? (
              <video key={embed.src} src={embed.src} controls playsInline preload="metadata" />
            ) : (
              <div className="usage-video-placeholder">
                <PlayCircle size={46} strokeWidth={1.6} aria-hidden="true" />
                <strong>{embed.kind === "link" ? "새 창에서 영상을 열어 주세요" : "영상 준비 중입니다"}</strong>
                <span>{embed.kind === "link" ? "이 영상은 외부 사이트에서 재생됩니다." : "곧 사용법 영상이 올라옵니다. 그동안 아래 안내를 참고해 주세요."}</span>
                {embed.kind === "link" && <a className="usage-video-open" href={embed.src} target="_blank" rel="noreferrer">영상 보기 <ExternalLink size={14} /></a>}
              </div>
            )}
          </div>
        )}
        <div className="usage-video-caption">
          <span>{selected.group}</span>
          <strong>{selected.title}</strong>
          {selected.description && <p>{selected.description}</p>}
        </div>
      </div>
      <aside className="usage-video-list" aria-label="사용법 영상 목록">
        <div className="usage-video-count"><Video size={16} /> 사용법 영상 {videos.length}편{readyCount === 0 ? " · 준비 중" : readyCount < videos.length ? ` · ${readyCount}편 공개` : ""}</div>
        {groups.map(({ group, items }) => (
          <div className="usage-video-group" key={group}>
            <h3>{group}</h3>
            <ol>
              {items.map((video) => {
                number += 1;
                const ready = isPlayable(video);
                const active = video.id === selected.id;
                return (
                  <li key={video.id}>
                    <button type="button" className={`usage-video-item${active ? " is-active" : ""}${ready ? "" : " is-pending"}`} onClick={() => pick(video.id, true)} aria-current={active ? "true" : undefined}>
                      <span className="usage-video-no">{String(number).padStart(2, "0")}</span>
                      <span className="usage-video-name"><b>{video.title}</b>{video.description && <small>{video.description}</small>}</span>
                      <span className="usage-video-meta">{metaFor(video)}</span>
                    </button>
                    {active && script && (
                      <ol className="usage-video-chapters" aria-label={`${video.title} 장면`}>
                        {script.scenes.map((scene, index) => (isChapterScene(scene) ? (
                          <li key={`${scene.caption.title}-${index}`}>
                            <button
                              type="button"
                              className={index === sceneIndex ? "is-current" : index < sceneIndex ? "is-past" : ""}
                              aria-current={index === sceneIndex ? "step" : undefined}
                              onClick={() => { setSeek({ time: sceneStart(index), key: Date.now() }); revealStage(); }}
                            >
                              <span className="usage-chapter-no">{script.scenes.slice(0, index + 1).filter(isChapterScene).length}</span>
                              <span className="usage-chapter-text"><small>{scene.caption.kicker}</small><b>{plainCaption(scene.caption.title)}</b></span>
                            </button>
                          </li>
                        ) : null))}
                      </ol>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </aside>
    </div>
  );
}

function Faq({ items }: { items: Array<{ q: string; a: string }> }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="usage-faq-list">
      {items.map((item, index) => {
        const expanded = open === index;
        return (
          <article key={item.q} className={expanded ? "is-open" : ""}>
            <button type="button" onClick={() => setOpen(expanded ? null : index)} aria-expanded={expanded}>
              <span><b>Q.</b>{item.q}</span><ChevronDown size={18} aria-hidden="true" />
            </button>
            {expanded && <p><b>A.</b>{item.a}</p>}
          </article>
        );
      })}
    </div>
  );
}

export function SupplierGuidePage() {
  const guide = useSupplierGuide();
  const onboarding = [
    { icon: <Handshake size={20} />, title: "입점 신청", body: "아래 ‘입점 신청하기’에서 업체 정보를 남기면 입점 제안서(PDF)를 메일로 보내 드립니다." },
    { icon: <ClipboardCheck size={20} />, title: "MD 검토·상담", body: "담당 MD가 영업일 기준 2~3일 안에 연락드려 상품·도매 공급가·판매 수수료(10%)를 상담합니다." },
    { icon: <FileSpreadsheet size={20} />, title: "상품 등록·메일 시간 정하기", body: "상세페이지·썸네일·도매 공급가(정산받을 금액)를 받아 등록하고, 발주서를 받을 메일 주소와 발송 시간(오전 1회·오후 1회)을 정합니다." },
    { icon: <BadgeCheck size={20} />, title: "판매 시작", body: "단가표·신규상품에 노출되고, 위탁셀러 주문이 정한 시간에 발주서 메일로 들어옵니다." }
  ];
  const orderSteps = [
    { icon: <ShoppingCart size={20} />, title: "위탁셀러 주문 접수", body: `위탁셀러가 두고푸드 도매몰에서 주문하면 두고푸드가 공급사별로 모읍니다. 공급사가 따로 접속하거나 입력할 것은 없습니다. 주문 마감: ${guide.orderCutoff}.` },
    { icon: <Mail size={20} />, title: "발주서 메일 받기", body: `두고푸드가 정한 시간에 공급사별 발주서(엑셀)를 메일로 보내 드립니다. 발송: ${guide.orderSendTime}. 수령인·연락처·주소·상품·수량이 담겨 있습니다.` },
    { icon: <PackageCheck size={20} />, title: "포장·출고", body: `발주서대로 포장해 출고합니다. 출고: ${guide.shipLeadTime}. 보내는 사람은 발주서에 적힌 발송인(셀러 상호)으로 표기해 주세요.` },
    { icon: <Truck size={20} />, title: "송장 회신", body: `발주서 엑셀에 택배사·송장번호를 입력해 받은 발주 메일에 그대로 회신해 주세요. 회신 마감: ${guide.invoiceDeadline}. 두고푸드가 등록해 위탁셀러에게 전달합니다.` },
    { icon: <Undo2 size={20} />, title: "취소·반품·교환", body: `출고 전 취소 요청은 바로 알려 드립니다. ${guide.returnPolicy}` }
  ];
  const timeline = [
    { label: "발주서 메일", value: guide.orderSendTime },
    { label: "주문(발주) 마감", value: guide.orderCutoff },
    { label: "출고", value: guide.shipLeadTime },
    { label: "송장 회신", value: guide.invoiceDeadline }
  ];
  const settlementRows = [
    { label: "판매 수수료", value: guide.commission },
    { label: "정산 기준", value: guide.settlementBasis },
    { label: "정산 주기", value: guide.settlementCycle },
    { label: "지급일", value: guide.settlementPayDay },
    { label: "주 정산", value: guide.settlementOption },
    { label: "세금계산서", value: guide.taxInvoice },
    { label: "정산 제외·차감", value: guide.deductions }
  ];
  const settlementFlow = ["1일~말일 주문 합계 확인(양사)", "물품 세금계산서 발행(공급사)", "판매 대금 100% 입금(두고푸드)", "수수료 10% 입금(공급사)", "수수료 세금계산서 발행(두고푸드)"];
  const faq = [
    { q: "판매 수수료가 있나요?", a: "쿠팡·네이버 스마트스토어의 판매자 수수료처럼, 판매 대금의 10%를 판매·마케팅 대행 수수료로 받습니다(마케팅·세일즈·CS·품절 안내 등 운영 비용). 팔린 만큼만 내며, 예를 들어 도매 공급가 10,000원 상품이 1개 팔리면 10,000원을 먼저 입금해 드리고 수수료 1,000원을 받습니다." },
    { q: "수수료는 언제, 어떻게 내나요?", a: `판매 대금 100%를 먼저 받으신 뒤, 매월 초(1일) 지난달 총 거래 금액의 10%를 두고푸드에 입금해 주세요. 두고푸드는 수수료 세금계산서를 발행합니다. 도매 공급가를 정할 때 이 10%를 생각해 주세요.` },
    { q: "공급사용 관리자 사이트나 프로그램을 써야 하나요?", a: "아니요. 별도 계정이나 프로그램 없이 메일로만 주고받습니다. 정한 시간에 발주서 메일을 받고, 출고한 뒤 그 메일에 송장을 회신하면 됩니다." },
    { q: "발주서는 언제, 어떻게 받나요?", a: `공급사별 발주서(엑셀)를 정한 시간에 메일로 보내 드립니다. 발송: ${guide.orderSendTime}. 메일 시간과 받는 주소는 입점 때 공급사와 함께 정하며, 주문 마감은 ${guide.orderCutoff}입니다.` },
    { q: "송장은 어떻게 보내나요?", a: `받은 발주서 엑셀에 택배사와 송장번호를 입력해 그 발주 메일에 회신해 주세요. 회신 마감: ${guide.invoiceDeadline}. 오전·오후 메일마다 한 번씩 회신하면 되고, 두고푸드가 등록해 위탁셀러에게 전달합니다.` },
    { q: "정산은 언제 받나요?", a: `${guide.settlementCycle} 기준으로 ${guide.settlementPayDay}합니다. 예) 11월 1일~30일 주문분 → 12월 1~3일 입금. ${guide.settlementOption}` },
    { q: "세금계산서는 어떻게 발행하나요?", a: guide.taxInvoice },
    { q: "취소·반품·교환은 어떻게 처리하나요?", a: `출고 전 취소 요청은 바로 알려 드립니다. ${guide.returnPolicy} ${guide.deductions}` },
    { q: "반품·CS는 어떻게 소통하나요?", a: "계약하면 두고푸드 팀원과 함께하는 카카오톡 단톡방이 만들어지고, 반품·CS·배송 문의를 그 방에서 함께 바로 처리합니다. 농수산물처럼 반품이 많은 품목은 변질·품질 저하로 생긴 반품을 공급사가 책임지며, 두고푸드와 적극 협의해 해결합니다." },
    { q: "공급가가 바뀌거나 품절되면요?", a: "단톡방이나 담당 MD에게 알려 주시면 단가표에 바로 반영되고, 가격변동·품절이슈 메뉴로 위탁셀러에게 안내됩니다." }
  ];
  return (
    <PageFrame>
      <main className="content-page usage-page is-supplier">
        <AudienceTabs />
        <section className="usage-hero">
          <div className="usage-hero-copy">
            <span className="section-kicker">SUPPLIER GUIDE</span>
            <h1>공급사 사용방법</h1>
            <p>두고푸드 입점부터 주문 처리, 정산까지 한 번에 확인하세요. 별도 관리자 사이트 없이, 정한 시간(<b>오전 1회 · 오후 1회</b>)에 오는 발주서 메일을 확인하고 출고한 뒤 <b>송장만 회신</b>하면 됩니다.</p>
            <div className="usage-hero-actions">
              <button type="button" className="usage-primary-cta" onClick={openPartnerForm}><Handshake size={18} /> 입점 신청하기</button>
              <a className="usage-secondary-cta" href={PROPOSAL_URL} target="_blank" rel="noreferrer"><FileText size={17} /> 입점 제안서 PDF 보기</a>
            </div>
          </div>
          <aside className="usage-hero-card" aria-label="하루 주문 처리 일정">
            <span className="usage-hero-card-title"><CalendarClock size={17} /> 하루 주문 처리 일정</span>
            <ol>
              {timeline.map((item, index) => (
                <li key={item.label}><span className="usage-time-dot">{index + 1}</span><div><small>{item.label}</small><strong>{item.value}</strong></div></li>
              ))}
            </ol>
          </aside>
        </section>
        <nav className="usage-anchor-nav" aria-label="공급사 사용방법 목차">
          <a href="#onboarding">입점 절차</a><a href="#orders">주문 처리</a><a href="#settlement">정산</a><a href="#videos">사용법 영상</a><a href="#faq">자주 묻는 질문</a>
        </nav>

        <section className="usage-section" id="onboarding">
          <SectionHeading kicker="ONBOARDING" title="입점 절차" lead="신청부터 판매 시작까지 보통 1~2주 정도 걸립니다(상품 수와 준비 상황에 따라 달라집니다)." icon={<Handshake size={22} />} />
          <ol className="usage-step-grid usage-step-grid-4">
            {onboarding.map((step, index) => (
              <li key={step.title}><span className="usage-step-no">{String(index + 1).padStart(2, "0")}</span><span className="usage-step-icon">{step.icon}</span><strong>{step.title}</strong><p>{step.body}</p></li>
            ))}
          </ol>
        </section>

        <section className="usage-section" id="orders">
          <SectionHeading kicker="ORDER PROCESS" title="주문 처리 방법" lead={<>별도 관리자 사이트 없이 <b>메일로</b> 주고받습니다. 두고푸드가 정한 시간(오전 1회 · 오후 1회)에 발주서 메일을 보내면, 공급사는 출고 후 그 메일에 송장만 회신합니다.</>} icon={<FileSpreadsheet size={22} />} />
          <ol className="usage-flow">
            {orderSteps.map((step, index) => (
              <li key={step.title}>
                <span className="usage-flow-marker"><b>{index + 1}</b></span>
                <div className="usage-flow-body"><span className="usage-flow-icon">{step.icon}</span><div><strong>{step.title}</strong><p>{step.body}</p></div></div>
              </li>
            ))}
          </ol>
          <div className="usage-note"><FileSpreadsheet size={17} /><p>하루 주문이 많아도 <b>오전·오후 메일 두 번</b>만 확인하고, 메일마다 송장을 한 번씩 회신하면 끝납니다. 메일 시간·받는 주소·발주서 양식은 입점 상담 때 공급사별로 맞춰 드립니다.</p></div>
        </section>

        <section className="usage-section" id="settlement">
          <SectionHeading kicker="SETTLEMENT" title="정산 안내" lead="판매 수수료는 판매 대금의 10%입니다. 판매 대금은 다음 달 1~3일에 100% 먼저 입금하고, 수수료 10%는 받으신 뒤에 입금합니다. 거래 금액이 커지면 주 정산도 가능합니다." icon={<Wallet size={22} />} />
          <div className="usage-settlement-grid">
            <dl className="usage-terms">
              {settlementRows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
            </dl>
            <div className="usage-calc-card">
              <span className="usage-calc-title"><Receipt size={17} /> 정산 예시 · 11월 판매 200만원</span>
              <div className="usage-calc-row"><span>11월 판매 대금(11/1~11/30 주문)</span><b>2,000,000원</b></div>
              <div className="usage-calc-row"><span>12/1~12/3 두고푸드 → 공급사 100% 입금</span><b>2,000,000원</b></div>
              <div className="usage-calc-row is-minus"><span>수수료 10% · 공급사 → 두고푸드(입금 확인 후)</span><b>-200,000원</b></div>
              <div className="usage-calc-total"><span>공급사 실수령</span><strong>1,800,000원</strong></div>
              <small>판매 대금은 물품 세금계산서(면세 상품은 계산서)로, 수수료는 두고푸드가 세금계산서를 발행합니다.</small>
              <a className="usage-calc-link" href={PROPOSAL_URL} target="_blank" rel="noreferrer"><CalendarClock size={15} /> 월·주 정산 달력 보기(입점 제안서 PDF)</a>
            </div>
          </div>
          <ol className="usage-chip-flow" aria-label="정산 흐름">
            {settlementFlow.map((label, index) => <li key={label}><b>{index + 1}</b>{label}</li>)}
          </ol>
        </section>

        <section className="usage-section" id="videos">
          <SectionHeading kicker="VIDEO GUIDE" title="사용법 영상" lead="짧은 영상으로 입점부터 발주 메일 받기, 송장 회신, 정산까지 한눈에 보세요." icon={<Video size={22} />} />
          <VideoGuide videos={guide.videos} />
        </section>

        <section className="usage-section" id="faq">
          <SectionHeading kicker="FAQ" title="자주 묻는 질문" icon={<MessageCircle size={22} />} />
          <Faq items={faq} />
          <p className="usage-disclaimer">※ 안내된 운영 기준은 상품과 협의 내용에 따라 달라질 수 있으며, 최종 조건은 입점 계약을 따릅니다.</p>
        </section>

        <section className="usage-cta-band">
          <div>
            <span className="section-kicker">PARTNER WITH DOOGO FOOD</span>
            <strong>좋은 상품, 두고푸드에서 판로를 넓혀 보세요</strong>
            <p>신청서를 남기면 입점 제안서(PDF)를 메일로 보내 드리고, 담당 MD가 연락드립니다.</p>
          </div>
          <div className="usage-cta-actions">
            <button type="button" className="usage-primary-cta" onClick={openPartnerForm}><Handshake size={18} /> 입점 신청하기</button>
            <a className="usage-secondary-cta is-light" href={KAKAO_URL} target="_blank" rel="noreferrer"><MessageCircle size={17} /> 1:1 상담</a>
          </div>
        </section>
      </main>
    </PageFrame>
  );
}

export function SellerGuidePage() {
  const links = [
    { to: "/", icon: <FileSpreadsheet size={20} />, title: "상품 단가표", body: "A단가·일반공급가·판매가와 배송비를 확인합니다." },
    { to: "/guide", icon: <ClipboardCheck size={20} />, title: "공지사항 · 발주 방법", body: "발주 마감 시간과 주문·CS 기준을 확인합니다." },
    { to: "/notices", icon: <Receipt size={20} />, title: "가격변동", body: "오늘과 지난 3일간 바뀐 가격을 날짜별로 봅니다." },
    { to: "/sold-out", icon: <PackageCheck size={20} />, title: "품절이슈", body: "최근 7일 품절된 상품을 날짜별로 봅니다." }
  ];
  return (
    <PageFrame>
      <main className="content-page usage-page is-seller">
        <AudienceTabs />
        <section className="usage-hero is-seller">
          <div className="usage-hero-copy">
            <span className="section-kicker">SELLER GUIDE</span>
            <h1>위탁셀러 사용방법</h1>
            <p>위탁셀러 사용방법 안내와 영상을 준비하고 있습니다. 그동안 아래 메뉴에서 단가·발주 기준·가격변동을 확인하고, 주문은 두고푸드 도매몰에서 진행해 주세요.</p>
            <div className="usage-hero-actions">
              <a className="usage-primary-cta" href="https://shop.baljuora.com/doogofood" target="_blank" rel="noreferrer"><ShoppingCart size={18} /> 도매몰에서 주문하기</a>
              <a className="usage-secondary-cta" href={KAKAO_URL} target="_blank" rel="noreferrer"><MessageCircle size={17} /> 1:1 상담</a>
            </div>
          </div>
          <aside className="usage-hero-card is-soon">
            <span className="usage-hero-card-title"><Video size={17} /> 준비 중</span>
            <p>주문 방법 · 송장 확인 · 취소/반품 접수 영상이 곧 올라옵니다.</p>
          </aside>
        </section>
        <section className="usage-section">
          <SectionHeading kicker="QUICK LINKS" title="지금 바로 확인할 수 있어요" icon={<ChevronRight size={22} />} />
          <div className="usage-link-grid">
            {links.map((link) => (
              <Link key={link.to} to={link.to}><span className="usage-step-icon">{link.icon}</span><strong>{link.title}</strong><p>{link.body}</p><ChevronRight size={16} aria-hidden="true" /></Link>
            ))}
          </div>
        </section>
      </main>
    </PageFrame>
  );
}
