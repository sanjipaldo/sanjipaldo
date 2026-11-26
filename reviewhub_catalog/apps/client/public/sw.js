// 두고푸드 관리자·공급사 앱(홈 화면에 추가) 서비스 워커 — 2026-11-26.
// 화면·자료를 저장(캐시)하지 않습니다. 하는 일은 하나: 인터넷이 끊겨 화면을 열 수 없을 때 "인터넷 연결을 확인해 주세요" 안내를 보여 줍니다.
// 그래서 배포하면 다음 화면부터 바로 새 버전이 열리고, 예전 화면이 남지 않습니다. (등록: src/lib/app-install.ts, 범위 /admin · /supplier)
// 인터넷이 끊기면 그림 파일도 받을 수 없어, 안내 화면의 앱 아이콘은 글자로 넣어 둡니다(icon-512.png를 152px WebP로 줄인 것, 약 1.8KB —
// 아이콘을 바꾸면 같이 바꿉니다).
const OFFLINE_ICON = "data:image/webp;base64,UklGRhYHAABXRUJQVlA4WAoAAAAQAAAAlwAAlwAAQUxQSP8BAAARkOPsn9Rmf5CHMnvCGWxKRGcfAHGLab3lEJSIjpaaniPQI0FLjf7fjrKhKZAmK5s8f+mrEhETAKPrVw4P07J+6ORJ7h7qMg25c6XDvDXTCzIU8uQLzALP1OZj2H7eSmW2uW8b8zDWMUrFYrw2ptOs6JdU8K/I0iY621ZS0dX2bJJlIqSyRbIcT3cLqfTC1UdiHKXikbNR2H0jld/csxEWx0dJwMfjYpDGG0nChmtDXJRERHfAqpBkLFa9zhJJyOSsz1ZQQmx7WJUkZWV9wSJJzIh9tvlNjd+bT1gsyRmzDzbSA+0PviSoDwBmTpHcBPBairQeQCBJGsBVRpPsykGaoMMFTQQPJVHDlCppSZWypkr9QJWHjiqd/Pb/t/+//f8/vKNK90CVh5oqdUmVMqVKGlIl5IImgjtIE3SuMppkVxDQJADwWoq0HoCZUyQ3AcCniA8AYCM90P7AYnrE7ANsflPj9wY+ZRE1IvYZWBUtKgu+3gpKiC30PEsokZz1gVVBh2IF/V2kArowUOMNDRquDYHF8ZECj8cFDGf3jfqaewZjMo6qQ85gXN0t1Fa4Ooy+TIS6RLKEKc+2laqq7RlMq1nRLxX9iiwNJjfWMaoG47UBszRsP2/V0ea+bcBsNdMLMhSnT2AWeKYG89avHB6mZf3QnabuoS7TkDtXOowOAFZQOCDwBAAA8BoAnQEqmACYAD6RRJxLJaOioaezWRCwEgljbuA32cjwBnoFtbz3PZJ/tuZtOI+Zco9SO2Q8wHnSek3/U77DvRy/YHToNXf4TjjP2nrDSTHOXEsBmdSZTraNweme4wEuSR0ZtNq1Kyd+yMowrB9UYRD8MpW6NWPIqMmCVmf6a/+UemcBa7BtoyQ8i/vumgpO7j7Zk7g50cdvgI71yHIbE3LtU+HGwmGQu/aAXTV1mc8LPvLnRpMzUe5OgEULIgTP+36oQq3SeJ5+7VbXxdNcvkW/fifjPo9sGpDKdK01ZAAA/v0CT4ms99JSVZtHerZDf2GFadrf+TFdXvDvDeLtFlOuhXyACHG3BEHyK6si55NsBTfvW+Qw7ZpNe8y3cgx4auvWdJ0cMgNTMn7TvXDxdTfwG4///9tmV0rSWxJ16K7IvYtoBPqjv082zTd2gjhSj7jaNMHaLXAbBAueHHfkSWT1nAyIe25hJa/yTV5CWGNSnMssGFvtNsGy0Psvx7JIHw1Ivu4t/WrHzzQ0B3fkxnS0fhxeChJsaJuBO3Om3b53oM4ISg58cf1Pm/x/V4Zz0ED90wrSb6JRyfTMv+Ghid0J1fJMehMj79GmtuzD9xKzCM+4JhaXSn6EkY5fOsIoYQRAKMFkrbLOw7tDIRV2g1S1s4oMr8wvkVJsdRZyzPCXmSwGnEa0OKCAb0rnxNiCsZAkOnwORi/b/Ha3Qdf/M20INDc7azprnhGRDLLPsvCPF+dIXvAoQwLSuT+On5pTgRo6Qp8j2kB5+mZbwBTvFyvi98Z4VCsDVD/vKHZ0LSplpm8AVNMsf1XHMv9L+nqNA8CUjdj9liHle60pLJ5tAb94iI/ruHXBx1oYvkqzKC4VyEXCuvqh+Z4h3flJ5r2C4OE85D6HtFeQ9uDIhoMynnfU9W9dZddc3gDyrukTBEhwwhHB9dzprlbZG3mkkJyfY5LQNPr2Hfqv+TpbIqRwvJt0v5Ai59rthkIn0LBwUYjbdobLEnTpRWFwVvbkQvJ58SiHGS2OaewO7ATG0mG8f610wFvdjthAEeRY6J+ibn0wZYsCXPL0X3/C+Vwd8T+IVgkv9fJZo9ej1xqcRrEsVvPm/CLbPooZC3X8ULglK4t0GExIv6LRNC/FDJq+XzUjIzHxiqMyE5gu4QUKpuDsZvHbPb0VTPRkRmEvP5lAEm27n9hntClfe4mm+YKRVD3yi00TlwevZDNVg2sWJdr4LAk2M41+rOqUeNZGyn0VKOaannkZzhe+U7+wwTlYUPnGu24XGr30hJeYMiGOWZabc8ZirpK7x2I4azP+4KzAm7j6PJCRon3ZtvC1yaVVUqzQlOyY5ES3x3YGmFqsBnDmhfGmJ93s2ZhTl9ZK8Rye1AoUlI7DtzAYoVa8keqIrzE42yvUjIkeKAr//0BlzlYMHSxplGTOvmVLrYnDJywXbfhUzovo25kIU0JtkdN3nUVswg35xttF5g98iHxRFIw9c5k7ErLwldemsaIMtfftS1d7hOOPxH2Wg5pomLI0xO9QMYDOEFrN6OTtC3YoNfKs9xkV0/P8Q61IFWf/HNc3b4F2dI3TPhb1Jr+Xs6vUn//6hH/hpwnl6yXRrp5kcUsHX9GGu+eJriHSn34aqo+RyW5c5EEVB6zrDY0WRRc6L31RwmwnkfsQBZG3//xWIsAAAA==";
const OFFLINE_PAGE = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#159565" />
<title>인터넷 연결을 확인해 주세요 · 두고푸드</title>
<style>
  html, body { height: 100%; margin: 0; }
  body { display: grid; place-items: center; padding: 24px; box-sizing: border-box; background: #f6faf2; color: #1a1d17; font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; text-align: center; }
  main { max-width: 320px; }
  img { width: 76px; height: 76px; filter: drop-shadow(0 8px 14px rgba(31, 107, 29, .25)); }
  h1 { margin: 20px 0 8px; font-size: 20px; }
  p { margin: 0 0 22px; color: #5a6155; font-size: 14px; line-height: 1.6; }
  button { min-height: 48px; padding: 0 26px; border: 0; border-radius: 999px; background: #9fe870; color: #163300; font: inherit; font-size: 15px; font-weight: 700; }
</style>
</head>
<body>
<main>
  <img src="${OFFLINE_ICON}" alt="두고푸드" width="76" height="76" />
  <h1>인터넷 연결을 확인해 주세요</h1>
  <p>와이파이나 데이터가 연결되면<br />다시 시도를 눌러 주세요.</p>
  <button type="button" onclick="location.reload()">다시 시도</button>
</main>
</body>
</html>`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // 화면 이동을 서비스 워커가 기다리지 않게(바로 네트워크로)
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  // 화면 이동(주소 열기)만 다룹니다. API·그림·파일은 그대로 네트워크로 갑니다.
  if (event.request.mode !== "navigate") return;
  event.respondWith((async () => {
    try {
      const preloaded = await event.preloadResponse;
      if (preloaded) return preloaded;
      return await fetch(event.request);
    } catch {
      return new Response(OFFLINE_PAGE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }
  })());
});
