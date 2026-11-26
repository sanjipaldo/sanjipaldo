import { createRoot, hydrateRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './catalog.css'
import './wise-theme.css'
import { syncAuthTokenFromUrl } from "@/lib/api";
import { startAppInstallCapture } from "@/lib/app-install";

// 앱(홈 화면에 추가) 설치 창은 화면이 그려지기 전에 올 수 있어 가장 먼저 받아 둡니다.
startAppInstallCapture();

// Prerender (scripts/prerender.mjs) bakes the home page into #root at build time
// so crawlers see real content. When that markup is present we hydrate it back
// into the normal CSR app; otherwise we do a clean client render.
const rootEl = document.getElementById("root")!;

async function bootstrap() {
  await syncAuthTokenFromUrl();
  const isPrerenderedHome = window.location.pathname === "/" && rootEl.hasChildNodes();
  if (isPrerenderedHome) {
    hydrateRoot(rootEl, <App />);
  } else {
    // The static host serves the prerendered home shell for deep links too.
    // Remove that home markup before rendering another route so React does not
    // attempt to hydrate it as /notices, /guide, /sourcing, or /admin.
    rootEl.replaceChildren();
    createRoot(rootEl).render(<App />);
  }
}

void bootstrap();
