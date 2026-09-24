import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NotFound from "./pages/not-found/Index";
import { AdminGuard } from "./components/auth/AdminGuard";
import { AdminLoginPage, CatalogAdmin } from "./pages/admin/CatalogAdmin";
import { CatalogHome, GuidePage, NoticesPage, SourcingPage } from "./pages/catalog/PublicCatalog";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<CatalogHome />} />
          <Route path="/guide" element={<GuidePage />} />
          <Route path="/notices" element={<NoticesPage />} />
          <Route path="/sourcing" element={<SourcingPage />} />
          <Route path="/auth" element={<AdminLoginPage />} />
          <Route path="/admin" element={<AdminLoginPage />} />
          <Route path="/admin/home" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="home" /></AdminGuard>} />
          <Route path="/admin/products" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="products" /></AdminGuard>} />
          <Route path="/admin/bundles" element={<Navigate to="/admin/products" replace />} />
          <Route path="/admin/sort" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="sort" /></AdminGuard>} />
          <Route path="/admin/changes" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="changes" /></AdminGuard>} />
          <Route path="/admin/transmissions" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="transmissions" /></AdminGuard>} />
          <Route path="/admin/categories" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="categories" /></AdminGuard>} />
          <Route path="/admin/shippingPolicies" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="shippingPolicies" /></AdminGuard>} />
          <Route path="/admin/suppliers" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="suppliers" /></AdminGuard>} />
          <Route path="/admin/sales" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="sales" /></AdminGuard>} />
          <Route path="/admin/notices" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="notices" /></AdminGuard>} />
          <Route path="/admin/history" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="history" /></AdminGuard>} />
          <Route path="/admin/sourcing" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="sourcing" /></AdminGuard>} />
          <Route path="/admin/sync" element={<AdminGuard redirectTo="/admin"><CatalogAdmin section="sync" /></AdminGuard>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
