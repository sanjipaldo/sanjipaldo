import { createRoot, hydrateRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './catalog.css'
import { syncAuthTokenFromUrl } from "@/lib/api";

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
