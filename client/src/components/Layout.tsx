import { useState } from "react";
import { Link, useLocation, Navigate } from "react-router-dom";
import {
  LayoutDashboard, Package, ShoppingCart, LogOut, Menu, X,
  TrendingUp, Users, FileText, Megaphone, MonitorPlay, PieChart, ClipboardList, CalendarDays, Wallet, BarChart3, Ruler, Coins, Factory,
} from "lucide-react";
import { logout, isAuthenticated, getRole } from "../lib/auth";
import { useQuery } from "@tanstack/react-query";
import { getMe } from "../lib/auth";
import logo from "../assets/logo.png";

const ownerNav = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/products", icon: Package, label: "Productos" },
  { to: "/sales", icon: ShoppingCart, label: "Ventas" },
  { to: "/cobros", icon: Coins, label: "Cobros" },
  { to: "/clients", icon: Users, label: "Clientes" },
  { to: "/quotes", icon: FileText, label: "Presupuestos" },
  { to: "/fichas", icon: ClipboardList, label: "Fichas de pedido" },
  { to: "/produccion", icon: Factory, label: "Producción" },
  { to: "/planos", icon: Ruler, label: "Planos" },
  { to: "/expenses", icon: Wallet, label: "Gastos" },
  { to: "/analytics", icon: PieChart, label: "Analytics" },
];

const marketingNav = [
  { to: "/ads", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/ads/accounts", icon: MonitorPlay, label: "Cuentas Meta" },
  { to: "/ads/campaigns", icon: Megaphone, label: "Campañas" },
  { to: "/ads/calendar", icon: CalendarDays, label: "Calendario" },
  { to: "/ads/analytics", icon: PieChart, label: "Analytics" },
  { to: "/ads/google", icon: BarChart3, label: "Google Ads" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: getMe, retry: false });
  const role = getRole();
  const [open, setOpen] = useState(false);

  if (!isAuthenticated()) return <Navigate to="/login" replace />;

  const navItems = role === "MARKETING" ? marketingNav : ownerNav;
  const isMarketing = role === "MARKETING";

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Top bar (solo mobile) */}
      <header className="md:hidden fixed top-0 inset-x-0 h-14 bg-gray-900 border-b border-gray-800 flex items-center gap-3 px-4 z-30">
        <button onClick={() => setOpen(true)} className="text-gray-300 hover:text-white p-1 -ml-1" aria-label="Abrir menú">
          <Menu size={22} />
        </button>
        {isMarketing ? (
          <span className="font-bold text-white">AdsTrack</span>
        ) : (
          <img src={logo} alt="The Promise Machine" className="h-6 object-contain" />
        )}
      </header>

      {/* Backdrop (mobile, cuando el cajón está abierto) */}
      {open && <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setOpen(false)} />}

      {/* Sidebar (cajón en mobile, fijo en desktop) */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col
          transform transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        {/* Logo */}
        <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between animate-logo">
          {isMarketing ? (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-white">
                <TrendingUp size={18} className="text-gray-950" />
              </div>
              <div>
                <p className="font-bold text-white leading-tight">AdsTrack</p>
                <p className="text-xs text-gray-500">Gestión de campañas</p>
              </div>
            </div>
          ) : (
            <img src={logo} alt="The Promise Machine" className="h-8 object-contain" />
          )}
          {/* Cerrar (solo mobile) */}
          <button onClick={() => setOpen(false)} className="md:hidden text-gray-400 hover:text-white p-1" aria-label="Cerrar menú">
            <X size={20} />
          </button>
        </div>

        {/* Rol badge */}
        <div className="px-4 pt-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium w-full justify-center bg-gray-800 text-gray-300 border border-gray-700">
            {isMarketing ? "👤 Marketing" : "🏠 Dueño del local"}
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => {
            const active = to === "/" || to === "/ads"
              ? location.pathname === to
              : location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-white text-gray-950"
                    : "text-gray-400 hover:text-gray-100 hover:bg-gray-800"
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="px-3 py-4 border-t border-gray-800">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border bg-gray-800 border-gray-700">
              <span className="text-sm font-bold text-white">
                {user?.name?.[0]?.toUpperCase() ?? "?"}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">{user?.name ?? "..."}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main */}
      <main key={location.pathname} className="flex-1 overflow-y-auto bg-gray-950 animate-page pt-14 md:pt-0">
        {children}
      </main>
    </div>
  );
}
