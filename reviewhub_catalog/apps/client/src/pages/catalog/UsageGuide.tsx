// 사용방법(/how-to): 위탁셀러 · 공급사 랜딩페이지.
// 공급사 화면: 입점 절차 · 주문 처리(메일 발주 · 송장 회신) · 정산 · 사용법 영상 · FAQ · 입점 신청. 공급사에게는 별도 관리자 사이트·프로그램을 주지 않습니다:
//   정한 시간(오전 1회·오후 1회)에 발주서 메일을 받고, 출고 후 그 메일에 송장을 회신합니다. 운영 기준·영상 목록은 관리자 > 사용방법 관리(content_settings "supplier_guide").
// 위탁셀러 화면: 시작하기 · 상품 찾기 · 주문하기(두고푸드 도매몰 = 발주오라) · 주문 상태·송장 · 취소/반품/교환 · 사용법 영상 · FAQ.
//   발주 마감·송장·CS 문구는 공지사항 설정(guide_sections)을 같이 쓰고, 영상 목록은 content_settings "seller_guide"입니다.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  Ban,
  BadgeCheck,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Handshake,
  Link2,
  ListChecks,
  LogIn,
  Mail,
  Megaphone,
  MessageCircle,
  PackageCheck,
  PackageSearch,
  PlayCircle,
  Receipt,
  Search,
  ShoppingCart,
  Sparkles,
  Store,
  TrendingUp,
  Truck,
  Undo2,
  UserPlus,
  Video,
  Wallet
} from "lucide-react";
import { DEFAULT_SELLER_GUIDE, SELLER_OFFICIAL_VIDEOS, SELLER_SHOP_URL, SELLER_VIDEO_GROUPS, type SellerGuideSettings } from "@repo/shared/seller-guide";
import { DEFAULT_SUPPLIER_GUIDE, SUPPLIER_VIDEO_GROUPS, supplierVideoEmbed, type SupplierGuideSettings, type SupplierGuideVideo } from "@repo/shared/supplier-guide";
import { GuideDemoPlayer } from "./GuideDemo";
import { SUPPLIER_DEMO_SCRIPTS, demoDuration, formatDemoTime, isChapterScene, plainCaption, type DemoScript } from "./guide-demo-scripts";
import { SELLER_DEMO_SCRIPTS } from "./guide-demo-seller-scripts";
import { apiFetch } from "@/lib/api";
import type { GuideContent } from "./types";
import { PageFrame, loadGuideSettings, parseGuideContent } from "./PublicCatalog";

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

// 공개 사용방법 설정 읽기(실패하면 기본값 그대로)
function useGuideSetting<T>(path: string, fallback: T) {
  const [guide, setGuide] = useState<T>(fallback);
  useEffect(() => {
    let active = true;
    void apiFetch(path, { auth: false, silent: true })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as { ok?: boolean; data?: { guide?: T } };
        if (active && payload.ok && payload.data?.guide) setGuide(payload.data.guide);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [path]);
  return guide;
}

const useSupplierGuide = () => useGuideSetting<SupplierGuideSettings>("/catalog/supplier-guide", DEFAULT_SUPPLIER_GUIDE);
const useSellerGuide = () => useGuideSetting<SellerGuideSettings>("/catalog/seller-guide", DEFAULT_SELLER_GUIDE);

// 공지사항 설정(발주 마감·송장 안내·CS 기준)을 위탁셀러 화면에서도 같이 씁니다.
function useNoticeGuide() {
  const [guide, setGuide] = useState<GuideContent>(() => parseGuideContent());
  useEffect(() => {
    let active = true;
    void loadGuideSettings()
      .then((settings) => { if (active && settings?.guide_sections) setGuide(parseGuideContent(settings.guide_sections)); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  return guide;
}

// 사용법 영상: 화면 1개 + 묶음별 영상 목록(주소 ?clip=영상id로 바로 열 수 있음).
// 영상 주소(YouTube·Vimeo·mp4)가 있으면 그 영상을, 없으면 기본 안내 영상(애니메이션 대본)을 재생합니다.
// 둘 다 없는 영상은 "영상 준비 중"으로 보여 줍니다.
function VideoGuide({ videos, groups: groupOrder, scripts }: { videos: SupplierGuideVideo[]; groups: readonly string[]; scripts: Record<string, DemoScript> }) {
  const demoScriptFor = (video: SupplierGuideVideo) => (!video.url.trim() && Object.prototype.hasOwnProperty.call(scripts, video.id) ? scripts[video.id] : undefined);
  const isPlayable = (video: SupplierGuideVideo) => supplierVideoEmbed(video.url).kind !== "none" || Boolean(demoScriptFor(video));
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
    const order = [...groupOrder, ...videos.map((video) => video.group)].filter((group, index, list) => list.indexOf(group) === index);
    return order.map((group) => ({ group, items: videos.filter((video) => video.group === group) })).filter((entry) => entry.items.length > 0);
  }, [videos, groupOrder]);
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
          <VideoGuide videos={guide.videos} groups={SUPPLIER_VIDEO_GROUPS} scripts={SUPPLIER_DEMO_SCRIPTS} />
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

// 도매몰 주문 상태(발주오라 도매몰과 같은 이름)와 셀러가 할 수 있는 일
const SELLER_ORDER_STATUSES = [
  { status: "주문대기", tone: "wait", meaning: "주문을 등록했고 아직 접수(결제·확인) 전이에요.", action: "바로 취소·삭제할 수 있어요." },
  { status: "주문접수", tone: "accept", meaning: "두고푸드가 주문을 접수했어요.", action: "출고 전이면 취소할 수 있어요." },
  { status: "발주완료", tone: "accept", meaning: "두고푸드가 공급사로 발주했어요.", action: "출고 작업 전까지만 취소돼요. 서둘러 주세요." },
  { status: "배송준비중", tone: "ready", meaning: "공급사가 포장·출고를 준비하고 있어요.", action: "출고 전이면 취소할 수 있어요." },
  { status: "배송중", tone: "ship", meaning: "송장번호가 등록되고 배송이 시작됐어요.", action: "송장을 확인·엑셀로 받아요. 취소 대신 반품·교환으로." },
  { status: "배송완료", tone: "done", meaning: "고객이 상품을 받았어요.", action: "문제가 있으면 수령 후 24시간 안에 반품·교환 접수." }
] as const;

const infoValue = (guide: GuideContent, label: string, fallback: string) => guide.orderInfo.find((item) => item.label === label)?.value || fallback;

export function SellerGuidePage() {
  const sellerGuide = useSellerGuide();
  const notice = useNoticeGuide();
  const cutoff = infoValue(notice, "발주 마감", "상품별 마감시간 이전 주문은 당일 접수됩니다.");
  const invoice = infoValue(notice, "송장 안내", "출고 당일 오후부터 순차적으로 송장번호가 등록됩니다.");
  const orderRule = infoValue(notice, "발주 원칙", "상품명·옵션·수취인 정보를 정확히 확인한 뒤 접수해 주세요.");
  const timeline = [
    { label: "발주 마감", value: cutoff },
    { label: "공급사 발주·출고", value: "접수된 주문은 두고푸드가 공급사로 발주합니다." },
    { label: "송장 등록", value: invoice },
    { label: "반품·교환(CS) 접수", value: notice.csSummary }
  ];
  const start = [
    { icon: <UserPlus size={20} />, title: "도매몰 이용신청", body: "두고푸드 도매몰(shop.baljuora.com/doogofood)에서 ‘로그인 또는 이용신청’을 눌러 사업자 정보를 남겨 주세요." },
    { icon: <LogIn size={20} />, title: "승인 후 로그인", body: "두고푸드가 확인해 승인하면 로그인할 수 있고, 공급가·배송비·발주 마감 같은 상세 정보와 주문 메뉴가 열립니다." },
    { icon: <Search size={20} />, title: "판매할 상품 고르기", body: "DB센터 단가표·신규상품·월별 제철상품에서 상품을 고르고, 상품 사진은 도매몰 자료실(사진자료 다운로드)에서 받습니다." },
    { icon: <Store size={20} />, title: "내 판매처에 등록·판매", body: "판매가는 자율이 기본이고 ‘지정 판매가’ 상품은 안내된 금액으로 판매합니다. 상품 이미지는 두고푸드 상품 판매 목적에만 씁니다." }
  ];
  const menus = [
    { to: "/", icon: <FileSpreadsheet size={20} />, title: "상품 단가표", body: "A단가·일반공급가·판매가·배송비·판매기간을 한 번에 봅니다." },
    { to: "/new-products", icon: <Sparkles size={20} />, title: "신규상품", body: "최근 7일 새로 들어온 상품을 등록일별로 봅니다." },
    { to: "/notices", icon: <TrendingUp size={20} />, title: "가격변동", body: "오늘과 지난 3일 바뀐 가격 · 공지용 엑셀 받기." },
    { to: "/sold-out", icon: <Ban size={20} />, title: "품절이슈", body: "최근 7일 품절된 상품을 날짜별로 봅니다." },
    { to: "/guide", icon: <Megaphone size={20} />, title: "공지사항", body: "발주 마감·송장·CS 기준과 운영 공지를 확인합니다." },
    { to: "/sourcing", icon: <PackageSearch size={20} />, title: "소싱 요청", body: "찾는 상품이 없으면 상품과 희망 조건을 남깁니다." }
  ];
  const priceTerms = [
    { label: "A단가", value: "제휴 조건이 적용된 단가입니다." },
    { label: "일반공급가", value: "일반 판매자 기준 공급가입니다. 도매몰에서는 내 거래 조건 단가가 자동으로 적용됩니다." },
    { label: "판매가", value: "자율이 기본입니다. 단가표에 ‘지정 판매가’가 있는 상품은 안내된 금액으로 판매해 주세요." },
    { label: "배송비", value: "‘배송비 무료’ 또는 금액으로 표시되고, 누르면 배송 정책(제주·도서산간 추가비 등)이 보입니다." },
    { label: "판매 상태", value: "판매중 · 품절 · 시즌종료. 품절·시즌종료 상품은 주문할 수 없습니다." }
  ];
  const orderSteps = [
    { icon: <LogIn size={20} />, title: "도매몰 로그인", body: "shop.baljuora.com/doogofood에 로그인합니다. 단가표와 같은 상품코드로 상품을 찾을 수 있습니다." },
    { icon: <ClipboardCheck size={20} />, title: "주문 입력", body: "주문 입력 › 단일 주문 입력(한 건씩) 또는 대량 주문 입력(엑셀)에서 받는 분·연락처·주소·상품코드·수량·주문번호를 넣습니다. 상품리스트에서 장바구니에 담아 주문할 수도 있습니다." },
    { icon: <Link2 size={20} />, title: "상품 매칭(엑셀 주문)", body: "엑셀로 올리면 내 판매처 상품명을 두고푸드 상품과 한 번 연결합니다. 다음부터는 자동으로 매칭되고, 상품 관리 › 상품 매칭 리스트에서 바꿀 수 있습니다." },
    { icon: <ListChecks size={20} />, title: "주문 확인·접수", body: "주문 관리 › 주문 등록 현황에서 등록한 주문을 확인합니다. 주문대기 주문은 결제·확인이 끝나면 주문접수로 바뀌고, 결제할 금액은 도매몰 위쪽 ‘결제금액보기’에서 봅니다." },
    { icon: <Truck size={20} />, title: "공급사 발주·출고·송장", body: `두고푸드가 공급사로 발주하고, 출고되면 송장번호를 등록합니다. ${invoice}` }
  ];
  const faq = [
    { q: "재고를 미리 사 둬야 하나요?", a: "아니요. 내 판매처에 상품을 올리고, 고객 주문이 들어온 만큼만 도매몰에 주문하면 됩니다. 포장·출고는 공급사가, 발주·송장 등록은 두고푸드가 합니다." },
    { q: "주문은 어디에서 하나요?", a: "두고푸드 도매몰(shop.baljuora.com/doogofood)에 로그인해 주문 입력 메뉴(단일 주문 입력 · 대량 주문 입력(엑셀))에서 넣습니다. 도매몰은 발주오라 시스템으로 운영됩니다." },
    { q: "주문이 많으면 어떻게 하나요?", a: "대량 주문 입력(엑셀)에서 내 판매처 주문서 엑셀을 그대로 올리세요. 처음 한 번 상품을 매칭해 두면 다음부터 자동으로 연결됩니다." },
    { q: "발주 마감은 언제인가요?", a: `${cutoff} 주말에 접수된 주문은 다음 영업일 마감 전 주문과 함께 순차 처리됩니다.` },
    { q: "송장번호는 언제 나오나요?", a: `${invoice} 도매몰 주문 관리 › 배송중에서 확인하고, 엑셀 다운로드로 받아 내 판매처에 발송처리하면 됩니다.` },
    { q: "주문을 취소하고 싶어요.", a: "출고 작업 전까지만 취소할 수 있고, 가능한 한 발주 당일 오전 중에 해 주세요. 주문 관리 › 전체 주문 리스트에서 주문을 고르고 ‘취소’를 누릅니다. 이미 배송중이면 반품으로 접수해 주세요." },
    { q: "반품·교환은 어떻게 하나요?", a: `${notice.csSummary} ${notice.csHow} 배송중·배송완료 주문에서 ‘반품’ 또는 ‘교환’을 눌러 접수하고, 회수는 임의로 보내지 말고 두고푸드가 안내한 주소와 방법으로 진행합니다.` },
    { q: "판매가는 자유롭게 정할 수 있나요?", a: "공급가는 두고푸드가 안내하며 판매가는 자율이 기본입니다. 단가표에 ‘지정 판매가’가 표시된 상품은 안내된 금액으로 판매해 주세요." },
    { q: "상품 이미지를 써도 되나요?", a: "두고푸드 상품 판매 목적에 한해 사용할 수 있고, 다른 용도로 재배포할 수 없습니다. 사진은 도매몰 자료실(사진자료 다운로드)에서 받을 수 있습니다." },
    { q: "가격이 바뀌거나 품절되면 어떻게 알 수 있나요?", a: "가격변동(오늘·지난 3일)과 품절이슈(최근 7일) 메뉴에서 날짜별로 확인하세요. 가격변동 엑셀을 받아 내 판매처 가격을 한 번에 바꿀 수 있습니다." },
    { q: "찾는 상품이 없어요.", a: "소싱 요청 메뉴에 상품과 희망 조건을 남겨 주시면 담당자가 확인해 연락드립니다." }
  ];
  return (
    <PageFrame>
      <main className="content-page usage-page is-seller">
        <AudienceTabs />
        <section className="usage-hero is-seller">
          <div className="usage-hero-copy">
            <span className="section-kicker">SELLER GUIDE</span>
            <h1>위탁셀러 사용방법</h1>
            <p>재고 없이 두고푸드 상품을 내 판매처에서 판매하세요. <b>단가표에서 상품을 고르고</b>, 고객 주문이 들어오면 <b>두고푸드 도매몰에 주문만 입력</b>하면 공급사 발주·출고·송장 등록은 두고푸드가 챙깁니다.</p>
            <div className="usage-hero-actions">
              <a className="usage-primary-cta" href={SELLER_SHOP_URL} target="_blank" rel="noreferrer"><ShoppingCart size={18} /> 도매몰에서 주문하기</a>
              <Link className="usage-secondary-cta" to="/"><FileSpreadsheet size={17} /> 상품 단가표 보기</Link>
            </div>
          </div>
          <aside className="usage-hero-card" aria-label="주문 처리 기준">
            <span className="usage-hero-card-title"><CalendarClock size={17} /> 주문 처리 기준</span>
            <ol>
              {timeline.map((item, index) => (
                <li key={item.label}><span className="usage-time-dot">{index + 1}</span><div><small>{item.label}</small><strong>{item.value}</strong></div></li>
              ))}
            </ol>
          </aside>
        </section>
        <nav className="usage-anchor-nav" aria-label="위탁셀러 사용방법 목차">
          <a href="#start">시작하기</a><a href="#products">상품 찾기</a><a href="#orders">주문하기</a><a href="#status">주문 상태·송장</a><a href="#cs">취소·반품</a><a href="#videos">사용법 영상</a><a href="#faq">자주 묻는 질문</a>
        </nav>

        <section className="usage-section" id="start">
          <SectionHeading kicker="GETTING STARTED" title="시작하기" lead="도매몰 이용신청만 하면 바로 시작할 수 있어요. 상품을 미리 사 둘 필요 없이, 주문이 들어온 만큼만 주문합니다." icon={<Store size={22} />} />
          <ol className="usage-step-grid usage-step-grid-4">
            {start.map((step, index) => (
              <li key={step.title}><span className="usage-step-no">{String(index + 1).padStart(2, "0")}</span><span className="usage-step-icon">{step.icon}</span><strong>{step.title}</strong><p>{step.body}</p></li>
            ))}
          </ol>
        </section>

        <section className="usage-section" id="products">
          <SectionHeading kicker="FIND PRODUCTS" title="상품 찾기 · 가격 보는 법" lead="두고푸드 DB센터(doogofood.site)에서 판매 중인 상품과 가격·배송비·판매기간을 확인하세요. 주문 전에는 가격변동·품절이슈를 꼭 확인해 주세요." icon={<Search size={22} />} />
          <div className="usage-link-grid usage-link-grid-3">
            {menus.map((menu) => (
              <Link key={menu.to} to={menu.to}><span className="usage-step-icon">{menu.icon}</span><strong>{menu.title}</strong><p>{menu.body}</p><ChevronRight size={16} aria-hidden="true" /></Link>
            ))}
          </div>
          <dl className="usage-terms usage-price-terms">
            {priceTerms.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
          </dl>
        </section>

        <section className="usage-section" id="orders">
          <SectionHeading kicker="ORDER" title="주문하기" lead={<>주문은 <b>두고푸드 도매몰</b>(발주오라 시스템, shop.baljuora.com/doogofood)에서 넣습니다. 한 건씩 넣거나, 내 판매처 주문서 엑셀을 올려 한 번에 등록할 수 있어요.</>} icon={<ShoppingCart size={22} />} />
          <ol className="usage-flow">
            {orderSteps.map((step, index) => (
              <li key={step.title}>
                <span className="usage-flow-marker"><b>{index + 1}</b></span>
                <div className="usage-flow-body"><span className="usage-flow-icon">{step.icon}</span><div><strong>{step.title}</strong><p>{step.body}</p></div></div>
              </li>
            ))}
          </ol>
          <div className="usage-note"><ClipboardCheck size={17} /><p><b>발주 마감</b> {cutoff} {orderRule} 받는 분 정보를 잘못 적어 반송되면 보상되지 않으니, 보내는 사람(송하인)에는 내 상호·연락처를 적고 주문번호로 중복 주문을 막아 주세요.</p></div>
          <div className="usage-official" aria-label="발주오라 공식 영상">
            <span><PlayCircle size={17} /> 도매몰 실제 화면은 발주오라 공식 영상으로도 볼 수 있어요</span>
            <div>
              {SELLER_OFFICIAL_VIDEOS.map((video) => (
                <a key={video.url} href={video.url} target="_blank" rel="noreferrer"><b>{video.title}</b><small>{video.channel} · YouTube</small><ExternalLink size={14} aria-hidden="true" /></a>
              ))}
            </div>
          </div>
        </section>

        <section className="usage-section" id="status">
          <SectionHeading kicker="ORDER STATUS" title="주문 상태와 송장 확인" lead="도매몰 주문 관리에서 상태별로 볼 수 있어요. 상태에 따라 취소·반품 방법이 달라집니다." icon={<ListChecks size={22} />} />
          <ol className="usage-status-list">
            {SELLER_ORDER_STATUSES.map((row) => (
              <li key={row.status}>
                <em className={`usage-status-chip is-${row.tone}`}>{row.status}</em>
                <span>{row.meaning}</span>
                <b>{row.action}</b>
              </li>
            ))}
          </ol>
          <div className="usage-note"><Truck size={17} /><p><b>송장 확인</b> {invoice} 주문 관리 › 배송중에서 송장번호를 보고 ‘엑셀 다운로드’로 받아 내 판매처에 발송처리하세요. 전체 주문 리스트에서 고객명·휴대폰번호·송장번호로 찾을 수 있습니다.</p></div>
        </section>

        <section className="usage-section" id="cs">
          <SectionHeading kicker="CANCEL & RETURN" title="취소·반품·교환" lead="출고 전이면 취소, 출고 후에는 반품·교환으로 접수합니다. 진행 상황은 도매몰 CS 관리(취소·교환·반품 리스트)에서 확인하세요." icon={<Undo2 size={22} />} />
          <div className="usage-cs-grid">
            <article>
              <strong><Undo2 size={18} /> 주문 취소</strong>
              <ul>
                <li>출고 작업 전까지만 가능해요. 가능한 한 <b>발주 당일 오전 중</b>에 해 주세요.</li>
                <li>주문 관리 › 전체 주문 리스트에서 주문을 고르고 <b>‘취소’ → ‘취소하기’</b>를 누릅니다.</li>
                <li>주문대기는 바로 취소·삭제, 주문접수·발주완료·배송준비중은 출고 전이면 취소할 수 있어요.</li>
                <li>배송중·배송완료 주문은 취소 대신 반품·교환으로 접수해 주세요.</li>
                <li>결제한 주문은 취소 승인 후 결제 수단과 운영 절차에 따라 순차 환불됩니다.</li>
              </ul>
            </article>
            <article>
              <strong><PackageCheck size={18} /> 반품·교환</strong>
              <ul>
                <li>{notice.csSummary}</li>
                <li>{notice.csHow}</li>
                <li>배송중·배송완료 주문을 고르고 <b>‘반품’ 또는 ‘교환’</b>을 눌러 사유(불량·오배송 등)와 내용을 남깁니다.</li>
                <li>임의로 반품하지 말고 두고푸드가 확인한 뒤 안내한 주소와 방법으로 보내 주세요.</li>
              </ul>
            </article>
          </div>
          {notice.csRules.length > 0 && (
            <div className="usage-cs-rules">
              <span><CircleAlert size={16} /> 반품·교환이 어려운 경우</span>
              <ul>{notice.csRules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
            </div>
          )}
        </section>

        <section className="usage-section" id="videos">
          <SectionHeading kicker="VIDEO GUIDE" title="사용법 영상" lead="단가표 보기부터 도매몰 주문 입력, 엑셀 대량 주문, 송장 확인, 취소·반품까지 짧은 영상으로 보세요." icon={<Video size={22} />} />
          <VideoGuide videos={sellerGuide.videos} groups={SELLER_VIDEO_GROUPS} scripts={SELLER_DEMO_SCRIPTS} />
        </section>

        <section className="usage-section" id="faq">
          <SectionHeading kicker="FAQ" title="자주 묻는 질문" icon={<MessageCircle size={22} />} />
          <Faq items={faq} />
          <p className="usage-disclaimer">※ 더 많은 질문은 <Link to="/guide">공지사항 › 자주 묻는 질문</Link>에서 검색할 수 있습니다. 도매몰 화면은 발주오라 업데이트에 따라 조금 달라질 수 있습니다.</p>
        </section>

        <section className="usage-cta-band">
          <div>
            <span className="section-kicker">SELL WITH DOOGO FOOD</span>
            <strong>재고 없이, 두고푸드 상품으로 판매를 시작하세요</strong>
            <p>단가표에서 상품을 고르고, 주문은 두고푸드 도매몰에서 넣으면 됩니다.</p>
          </div>
          <div className="usage-cta-actions">
            <a className="usage-primary-cta" href={SELLER_SHOP_URL} target="_blank" rel="noreferrer"><ShoppingCart size={18} /> 도매몰 이용신청·주문</a>
            <a className="usage-secondary-cta is-light" href={KAKAO_URL} target="_blank" rel="noreferrer"><MessageCircle size={17} /> 1:1 상담</a>
          </div>
        </section>
      </main>
    </PageFrame>
  );
}
