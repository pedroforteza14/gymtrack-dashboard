import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { Toaster, toast } from "react-hot-toast";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Sales from "./pages/Sales";
import Clients from "./pages/Clients";
import Quotes from "./pages/Quotes";
import AgencyDashboard from "./pages/AgencyDashboard";
import ClientDashboard from "./pages/ClientDashboard";
import AdAccounts from "./pages/AdAccounts";
import AllCampaigns from "./pages/AllCampaigns";
import Analytics from "./pages/Analytics";
import MarketingAnalytics from "./pages/MarketingAnalytics";
import Fichas from "./pages/Fichas";
import Cobros from "./pages/Cobros";
import Produccion from "./pages/Produccion";
import Historial from "./pages/Historial";
import Backup from "./pages/Backup";
import Expenses from "./pages/Expenses";
import Planos from "./pages/Planos";
import CampaignCalendar from "./pages/CampaignCalendar";
import GoogleAds from "./pages/GoogleAds";
import { getRole, isAuthenticated } from "./lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function errorMessage(err: any): string {
  const e = err?.response?.data?.error;
  if (typeof e === "string") return e;
  if (e?.formErrors?.length) return e.formErrors.join(", ");
  if (err?.response?.status === 413) return "El archivo es demasiado grande.";
  return "Ocurrió un error. Probá de nuevo.";
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
  // Cualquier mutación que falle muestra un toast de error automáticamente
  mutationCache: new MutationCache({
    onError: (err) => toast.error(errorMessage(err)),
  }),
});

// Redirige a la sección correcta según el rol
function RoleRedirect() {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <Navigate to={getRole() === "MARKETING" ? "/ads" : "/"} replace />;
}

// Protege rutas por rol
function RoleRoute({ role, children }: { role: "OWNER" | "MARKETING"; children: React.ReactNode }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  if (getRole() !== role) return <Navigate to={getRole() === "MARKETING" ? "/ads" : "/"} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 2600,
          style: { background: "#111827", color: "#f3f4f6", border: "1px solid #374151", fontSize: "14px" },
          success: { iconTheme: { primary: "#22c55e", secondary: "#111827" } },
          error: { iconTheme: { primary: "#ef4444", secondary: "#111827" } },
        }}
      />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* ── OWNER routes ─────────────────────────────────── */}
          <Route path="/" element={
            <RoleRoute role="OWNER">
              <Layout><Dashboard /></Layout>
            </RoleRoute>
          } />
          <Route path="/products" element={
            <RoleRoute role="OWNER">
              <Layout><Products /></Layout>
            </RoleRoute>
          } />
          <Route path="/sales" element={
            <RoleRoute role="OWNER">
              <Layout><Sales /></Layout>
            </RoleRoute>
          } />
          <Route path="/clients" element={
            <RoleRoute role="OWNER">
              <Layout><Clients /></Layout>
            </RoleRoute>
          } />
          <Route path="/quotes" element={
            <RoleRoute role="OWNER">
              <Layout><Quotes /></Layout>
            </RoleRoute>
          } />
          <Route path="/analytics" element={
            <RoleRoute role="OWNER">
              <Layout><Analytics /></Layout>
            </RoleRoute>
          } />
          <Route path="/fichas" element={
            <RoleRoute role="OWNER">
              <Layout><Fichas /></Layout>
            </RoleRoute>
          } />
          <Route path="/cobros" element={
            <RoleRoute role="OWNER">
              <Layout><Cobros /></Layout>
            </RoleRoute>
          } />
          <Route path="/produccion" element={
            <RoleRoute role="OWNER">
              <Layout><Produccion /></Layout>
            </RoleRoute>
          } />
          <Route path="/historial" element={
            <RoleRoute role="OWNER">
              <Layout><Historial /></Layout>
            </RoleRoute>
          } />
          <Route path="/backup" element={
            <RoleRoute role="OWNER">
              <Layout><Backup /></Layout>
            </RoleRoute>
          } />
          <Route path="/expenses" element={
            <RoleRoute role="OWNER">
              <Layout><Expenses /></Layout>
            </RoleRoute>
          } />
          <Route path="/planos" element={
            <RoleRoute role="OWNER">
              <Layout><Planos /></Layout>
            </RoleRoute>
          } />

          {/* ── MARKETING routes ─────────────────────────────── */}
          <Route path="/ads" element={
            <RoleRoute role="MARKETING">
              <Layout><AgencyDashboard /></Layout>
            </RoleRoute>
          } />
          <Route path="/ads/accounts" element={
            <RoleRoute role="MARKETING">
              <Layout><AdAccounts /></Layout>
            </RoleRoute>
          } />
          <Route path="/ads/campaigns" element={
            <RoleRoute role="MARKETING">
              <Layout><AllCampaigns /></Layout>
            </RoleRoute>
          } />
          <Route path="/ads/client/:accountId" element={
            <RoleRoute role="MARKETING">
              <Layout><ClientDashboard /></Layout>
            </RoleRoute>
          } />
          <Route path="/ads/analytics" element={
            <RoleRoute role="MARKETING">
              <Layout><MarketingAnalytics /></Layout>
            </RoleRoute>
          } />
          <Route path="/ads/calendar" element={
            <RoleRoute role="MARKETING">
              <Layout><CampaignCalendar /></Layout>
            </RoleRoute>
          } />
          <Route path="/ads/google" element={
            <RoleRoute role="MARKETING">
              <Layout><GoogleAds /></Layout>
            </RoleRoute>
          } />

          {/* Fallback: redirige según rol */}
          <Route path="*" element={<RoleRedirect />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
