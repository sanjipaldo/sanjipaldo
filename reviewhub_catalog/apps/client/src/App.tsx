import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NotFound from "./pages/not-found/Index";
import { AdminGuard } from "./components/auth/AdminGuard";
import { AdminLoginPage, CatalogAdmin } from "./pages/admin/CatalogAdmin";
import { lazy, Suspense, type ReactNode } from "react";
import { CatalogHome, GuidePage, NewProductsPage, NoticesPage, PageFrame, SoldOutIssuesPage, SourcingPage } from "./pages/catalog/PublicCatalog";
import { SellerGuidePage, SupplierGuidePage } from "./pages/catalog/UsageGuide";
import { GuideDemoRender } from "./pages/catalog/GuideDemo";

const queryClient = new QueryClient();

// 백과사전은 품목 데이터가 커서 들어갈 때 따로 불러옵니다.
const EncyclopediaHomePage = lazy(() => import("./pages/catalog/Encyclopedia").then((module) => ({ default: module.EncyclopediaHomePage })));
const EncyclopediaCalendarPage = lazy(() => import("./pages/catalog/Encyclopedia").then((module) => ({ default: module.EncyclopediaCalendarPage })));
const EncyclopediaFavoritesPage = lazy(() => import("./pages/catalog/Encyclopedia").then((module) => ({ default: module.EncyclopediaFavoritesPage })));
const EncyclopediaDetailPage = lazy(() => import("./pages/catalog/Encyclopedia").then((module) => ({ default: module.EncyclopediaDetailPage })));
const EncyclopediaFinderPage = lazy(() => import("./pages/catalog/EncyclopediaFinder").then((module) => ({ default: module.EncyclopediaFinderPage })));

function LazyPage({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<PageFrame><main className="content-page"><div className="catalog-loading-state"><div className="spinner" /><strong>화면을 여는 중입니다.</strong></div></main></PageFrame>}>
      {children}
    </Suspense>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<CatalogHome />} />
          <Route path="/guide" element={<GuidePage />} />
          <Route path="/new-products" element={<NewProductsPage />} />
          <Route path="/notices" element={<NoticesPage />} />
          <Route path="/sold-out" element={<SoldOutIssuesPage />} />
          <Route path="/encyclopedia" element={<LazyPage><EncyclopediaHomePage /></LazyPage>} />
          <Route path="/encyclopedia/calendar" element={<LazyPage><EncyclopediaCalendarPage /></LazyPage>} />
          <Route path="/encyclopedia/finder" element={<LazyPage><EncyclopediaFinderPage /></LazyPage>} />
          <Route path="/encyclopedia/favorites" element={<LazyPage><EncyclopediaFavoritesPage /></LazyPage>} />
          <Route path="/encyclopedia/:id" element={<LazyPage><EncyclopediaDetailPage /></LazyPage>} />
          <Route path="/how-to" element={<Navigate to="/how-to/supplier" replace />} />
          <Route path="/how-to/supplier" element={<SupplierGuidePage />} />
          <Route path="/how-to/seller" element={<SellerGuidePage />} />
          <Route path="/sourcing" element={<SourcingPage />} />
          <Route path="/auth" element={<AdminLoginPage />} />
          <Route path="/admin" element={<AdminLoginPage />} />
          <Route path="/admin/home" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="home" /></AdminGuard>} />
          <Route path="/admin/products" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="products" /></AdminGuard>} />
          <Route path="/admin/bundles" element={<Navigate to="/admin/products" replace />} />
          <Route path="/admin/newProducts" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="newProducts" /></AdminGuard>} />
          <Route path="/admin/sort" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="sort" /></AdminGuard>} />
          <Route path="/admin/changes" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="changes" /></AdminGuard>} />
          <Route path="/admin/transmissions" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="transmissions" /></AdminGuard>} />
          <Route path="/admin/categories" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="categories" /></AdminGuard>} />
          <Route path="/admin/shippingPolicies" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="shippingPolicies" /></AdminGuard>} />
          <Route path="/admin/suppliers" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="suppliers" /></AdminGuard>} />
          <Route path="/admin/sales" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="sales" /></AdminGuard>} />
          <Route path="/admin/notices" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="notices" /></AdminGuard>} />
          <Route path="/admin/usageGuide" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="usageGuide" /></AdminGuard>} />
          <Route path="/admin/encyclopedia" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="encyclopedia" /></AdminGuard>} />
          <Route path="/admin/history" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="history" /></AdminGuard>} />
          <Route path="/admin/sourcing" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="sourcing" /></AdminGuard>} />
          <Route path="/admin/sync" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="sync" /></AdminGuard>} />
          <Route path="/admin/backup" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="backup" /></AdminGuard>} />
          {/* 개발 서버 전용: 사용법 안내 영상을 mp4로 뽑을 때 쓰는 화면(scripts/render-guide-videos.mjs) */}
          {import.meta.env.DEV && <Route path="/dev/guide-demo/:id" element={<GuideDemoRender />} />}
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
