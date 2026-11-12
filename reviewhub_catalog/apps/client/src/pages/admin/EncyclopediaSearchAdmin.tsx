// 관리자 > 백과사전 검색량: 네이버 검색광고·데이터랩 키 상태와 "검색량 새로고침"(백과사전 품목 검색어를 20개씩 나눠 서버에 요청).
// 키 값은 이 화면에 보이지 않고(설정 여부만), Vercel 환경 변수에서만 넣습니다.
import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

type SearchStatus = {
  searchAd: boolean;
  datalab: boolean;
  envNames: { searchAd: string[]; datalab: string[] };
  updatedAt: string | null;
  keywordCount: number;
};
type StatRow = { keyword: string; total: number; comp?: string; months?: number[] };

async function readApi<T>(response: Response) {
  const payload = await response.json().catch(() => null) as { ok?: boolean; data?: T; error?: { message?: string } } | null;
  if (!response.ok || !payload?.ok || payload.data === undefined) throw new Error(payload?.error?.message ?? "요청을 처리하지 못했습니다.");
  return payload.data;
}

const seoulTime = (value: string | null) => value
  ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
  : "아직 없음";

export function EncyclopediaSearchAdmin() {
  const [status, setStatus] = useState<SearchStatus | null>(null);
  const [rows, setRows] = useState<StatRow[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setStatus(await readApi<SearchStatus>(await apiFetch("/catalog/admin/produce-search/status")));
      const stats = await readApi<{ keywords: Record<string, StatRow> }>(await apiFetch("/catalog/produce-search", { auth: false, silent: true }));
      setRows(Object.values(stats.keywords).sort((first, second) => second.total - first.total));
    } catch (loadError) {
      toast.error(loadError instanceof Error ? loadError.message : "검색량 상태를 불러오지 못했습니다.");
    }
  };

  useEffect(() => { void load(); }, []);

  const refresh = async () => {
    setError("");
    const { produceItems } = await import("@/lib/encyclopedia");
    const keywords = [...new Set(produceItems.map((item) => item.keyword.trim()).filter(Boolean))];
    setProgress({ done: 0, total: keywords.length });
    try {
      for (let index = 0; index < keywords.length; index += 20) {
        const chunk = keywords.slice(index, index + 20);
        await readApi(await apiFetch("/catalog/admin/produce-search/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keywords: chunk }),
          silent: true
        }));
        setProgress({ done: Math.min(index + chunk.length, keywords.length), total: keywords.length });
      }
      toast.success(`검색어 ${keywords.length}개의 검색량을 새로 받았습니다.`);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "검색량을 받지 못했습니다.");
    } finally {
      setProgress(null);
      await load();
    }
  };

  const keyLine = (ready: boolean, label: string, names: string[], note: string) => (
    <li className={ready ? "is-ready" : "is-missing"}>
      {ready ? <CheckCircle2 size={18} aria-hidden="true" /> : <CircleAlert size={18} aria-hidden="true" />}
      <div>
        <strong>{label} · {ready ? "키 있음" : "키 없음"}</strong>
        <span>{note}</span>
        <code>{names.join(" · ")}</code>
      </div>
    </li>
  );

  const peakMonth = (months?: number[]) => {
    if (!months?.length) return "-";
    const max = Math.max(...months);
    return max > 0 ? `${months.indexOf(max) + 1}월` : "-";
  };

  return (
    <>
      <div className="admin-page-heading">
        <div>
          <span>PRODUCE SEARCH</span>
          <h1>백과사전 검색량</h1>
          <p>공개 백과사전의 "네이버 검색" 칸(월 검색수·12개월 추이·연관 검색어)과 "검색이 오르는 품목"에 쓰는 값입니다. 네이버에서 직접 받아 저장하며, 다른 사이트의 숫자는 쓰지 않습니다.</p>
        </div>
      </div>
      <section className="admin-card encyclopedia-search-admin">
        <ul className="encyclopedia-search-keys">
          {keyLine(Boolean(status?.searchAd), "네이버 검색광고 API (필수)", status?.envNames.searchAd ?? ["NAVER_SEARCHAD_API_KEY", "NAVER_SEARCHAD_SECRET_KEY", "NAVER_SEARCHAD_CUSTOMER_ID"], "검색광고 시스템 › 도구 › API 사용 관리에서 엑세스라이선스·비밀키·CUSTOMER_ID를 받아 Vercel 환경 변수에 넣고 다시 배포합니다. 월 검색수·경쟁 정도·연관 검색어가 채워집니다.")}
          {keyLine(Boolean(status?.datalab), "네이버 데이터랩 API (선택)", status?.envNames.datalab ?? ["NAVER_DATALAB_CLIENT_ID", "NAVER_DATALAB_CLIENT_SECRET"], "네이버 개발자센터에서 애플리케이션(데이터랩 검색어 트렌드)을 만들고 Client ID·Secret을 넣으면 1~12월 추정 검색수 그래프가 채워집니다.")}
        </ul>
        <div className="encyclopedia-search-summary">
          <div><span>마지막 새로고침</span><strong>{seoulTime(status?.updatedAt ?? null)}</strong></div>
          <div><span>저장된 검색어</span><strong>{(status?.keywordCount ?? 0).toLocaleString("ko-KR")}개</strong></div>
          <button type="button" className="primary-action" disabled={!status?.searchAd || Boolean(progress)} onClick={() => void refresh()}>
            <RefreshCw size={16} aria-hidden="true" className={progress ? "is-spinning" : undefined} />
            {progress ? `받는 중 ${progress.done}/${progress.total}` : "검색량 새로고침"}
          </button>
        </div>
        {!status?.searchAd && <p className="encyclopedia-search-note">검색광고 API 키를 넣고 다시 배포하면 "검색량 새로고침"을 누를 수 있어요. 그 전에는 공개 화면에 검색어와 네이버 쇼핑 바로가기만 보입니다.</p>}
        {error && <p className="encyclopedia-search-error" role="alert">{error}</p>}
        {rows.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table encyclopedia-search-table">
              <thead><tr><th>검색어</th><th>최근 30일 검색수</th><th>경쟁</th><th>가장 많이 찾는 달</th></tr></thead>
              <tbody>
                {rows.slice(0, 300).map((row) => (
                  <tr key={row.keyword}><td>{row.keyword}</td><td>{row.total.toLocaleString("ko-KR")}</td><td>{row.comp ?? "-"}</td><td>{peakMonth(row.months)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
