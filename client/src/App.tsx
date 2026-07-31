import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import PurchaseOrders from "./pages/PurchaseOrders";
import Expenses from "./pages/Expenses";
import CampaignCalendar from "./pages/CampaignCalendar";
import GoogleAds from "./pages/GoogleAds";
import { getRole, isAuthenticated } from "./lib/auth";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
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
          <Route path="/purchase-orders" element={
            <RoleRoute role="OWNER">
              <Layout><PurchaseOrders /></Layout>
            </RoleRoute>
          } />
          <Route path="/expenses" element={
            <RoleRoute role="OWNER">
              <Layout><Expenses /></Layout>
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
