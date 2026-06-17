import { Link, useLocation, Navigate } from "react-router-dom";
import {
  LayoutDashboard, Package, ShoppingCart, BarChart3, LogOut, Dumbbell,
  TrendingUp, Users, FileText, Megaphone, MonitorPlay,
} from "lucide-react";
import { logout, isAuthenticated, getRole } from "../lib/auth";
import { useQuery } from "@tanstack/react-query";
import { getMe } from "../lib/auth";

const ownerNav = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/products", icon: Package, label: "Productos" },
  { to: "/sales", icon: ShoppingCart, label: "Ventas" },
  { to: "/stock", icon: BarChart3, label: "Stock" },
  { to: "/clients", icon: Users, label: "Clientes" },
  { to: "/quotes", icon: FileText, label: "Presupuestos" },
];

const marketingNav = [
  { to: "/ads", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/ads/accounts", icon: MonitorPlay, label: "Cuentas Meta" },
  { to: "/ads/campaigns", icon: Megaphone, label: "Campañas" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: getMe, retry: false });
  const role = getRole();

  if (!isAuthenticated()) return <Navigate to="/login" replace />;

  const navItems = role === "MARKETING" ? marketingNav : ownerNav;
  const isMarketing = role === "MARKETING";

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-gray-800 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isMarketing ? "bg-purple-600" : "bg-blue-600"}`}>
            {isMarketing ? <TrendingUp size={18} className="text-white" /> : <Dumbbell size={18} className="text-white" />}
          </div>
          <div>
            <p className="font-bold text-white leading-tight">{isMarketing ? "AdsTrack" : "GymTrack"}</p>
            <p className="text-xs text-gray-500">{isMarketing ? "Gestión de campañas" : "Gestión de equipos"}</p>
          </div>
        </div>

        {/* Rol badge */}
        <div className="px-4 pt-3">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium w-full justify-center ${
            isMarketing ? "bg-purple-600/20 text-purple-400 border border-purple-600/30" : "bg-blue-600/20 text-blue-400 border border-blue-600/30"
          }`}>
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
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? isMarketing ? "bg-purple-600 text-white" : "bg-blue-600 text-white"
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
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border ${
              isMarketing ? "bg-purple-600/30 border-purple-600/50" : "bg-blue-600/30 border-blue-600/50"
            }`}>
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
      <main className="flex-1 overflow-y-auto bg-gray-950">
        {children}
      </main>
    </div>
  );
}
