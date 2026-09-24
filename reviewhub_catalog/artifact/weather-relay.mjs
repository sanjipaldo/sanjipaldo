// claude.ai 페이지용 날씨 중계: Open-Meteo에서 9개 대표도시 현재 날씨를 받아
// 페이지 DB의 weather/current 문서 형식(JSON 파일)으로 저장합니다.
// 페이지(src/backend.ts)는 이 문서를 서버 코드의 Open-Meteo 응답처럼 돌려줍니다.
// 사용: node artifact/weather-relay.mjs <출력 JSON 경로>  → ArtifactData update(file_path)로 weather/current에 기록
// 이 환경의 네트워크 설정에서 api.open-meteo.com 접속이 허용되어야 합니다.
import fs from "node:fs";

// apps/server/services/catalog-operations.ts의 weatherRegions와 같은 좌표여야 합니다.
const regions = [
  ["서울", 37.5665, 126.978],
  ["인천", 37.4563, 126.7052],
  ["수원", 37.2636, 127.0286],
  ["춘천", 37.8813, 127.7298],
  ["대전", 36.3504, 127.3845],
  ["세종", 36.48, 127.289],
  ["광주", 35.1595, 126.8526],
  ["대구", 35.8714, 128.6014],
  ["제주", 33.4996, 126.5312]
];

const out = process.argv[2] || "weather-current.json";
const points = {};
for (const [name, latitude, longitude] of regions) {
  const query = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,weather_code",
    timezone: "Asia/Seoul",
    forecast_days: "1"
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${name} 날씨 요청 실패: ${response.status}`);
  const payload = await response.json();
  points[`${latitude.toFixed(4)},${longitude.toFixed(4)}`] = {
    time: payload.current?.time ?? null,
    temperature_2m: payload.current?.temperature_2m ?? null,
    weather_code: payload.current?.weather_code ?? null
  };
}
fs.writeFileSync(out, JSON.stringify({ updatedAt: new Date().toISOString(), points }));
console.log(`날씨 ${Object.keys(points).length}곳 저장: ${out}`);
