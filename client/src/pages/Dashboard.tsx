import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, ShoppingCart, Package, DollarSign, Link2, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";
import { currency, pct, dateShort } from "../lib/format";

interface DashboardData {
  thisMonth: { revenue: number; profit: number; cost: number; salesCount: number; margin: number };
  lastMonth: { revenue: number; profit: number; salesCount: number };
  totalProducts: number;
  lowStockCount: number;
  recentSales: { id: string; saleNumber: string; totalRevenue: number; totalProfit: number; createdAt: string; items: { product: { name: string } }[] }[];
  revenueByDay: { day: string; revenue: number; profit: number }[];
  topProducts: { productId: string; name: string; sku: string; totalQty: number; totalRevenue: number; totalProfit: number }[];
}

function StatCard({ label, value, sub, icon: Icon, trend, color = "blue" }: {
  label: string; value: string; sub?: string; icon: React.ElementType; trend?: number; color?: string;
}) {
  const colors: Record<string, string> = {
    blue: "bg-white/10 text-white border-white/20",
    green: "bg-green-500/10 text-green-400 border-green-500/20",
    yellow: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <div className="card flex items-start justify-between">
      <div>
        <p className="text-sm text-gray-400 mb-1">{label}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
        {trend !== undefined && (
          <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend >= 0 ? "text-green-400" : "text-red-400"}`}>
            {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(trend).toFixed(1)}% vs mes anterior
          </div>
        )}
      </div>
      <div className={`w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 ${colors[color]}`}>
        <Icon size={18} />
      </div>
    </div>
  );
}

function MeliConnectionCard() {
  const { data } = useQuery<{ connected: boolean; meliUserId: string | null }>({
    queryKey: ["meli-status"],
    queryFn: () => api.get("/integrations/meli/status").then((r) => r.data),
  });

  const handleConnect = () => {
    window.location.href = `${api.defaults.baseURL}/integrations/meli/auth`;
  };

  return (
    <div className="card flex items-center justify-between p-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-yellow-400/10 text-yellow-400 flex items-center justify-center flex-shrink-0">
          <Link2 size={18} />
        </div>
        <div>
          <p className="text-white font-medium text-sm">MercadoLibre</p>
          <p className="text-gray-500 text-xs">
            {data?.connected ? `Conectado · ID ${data.meliUserId}` : "Sincroniza ventas automáticamente"}
          </p>
        </div>
      </div>
      {data?.connected ? (
        <div className="flex items-center gap-1.5 text-green-400 text-sm font-medium">
          <CheckCircle2 size={16} /> Conectado
        </div>
      ) : (
        <button
          onClick={handleConnect}
          className="px-4 py-1.5 bg-yellow-400 text-gray-900 text-sm font-semibold rounded-lg hover:bg-yellow-300 transition-colors"
        >
          Conectar
        </button>
      )}
    </div>
  );
}

function pctChange(current: number, previous: number) {
  if (!previous) return 0;
  return ((current - previous) / previous) * 100;
}

export default function Dashboard() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => api.get("/dashboard").then((r) => r.data),
    refetchInterval: 30000,
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Cargando dashboard...</div>
      </div>
    );
  }

  const revenueChartData = data.revenueByDay.map((d) => ({
    day: new Date(d.day).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }),
    revenue: d.revenue,
    profit: d.profit,
  }));

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Resumen del negocio — {new Date().toLocaleDateString("es-AR", { month: "long", year: "numeric" })}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Ingresos del mes"
          value={currency(data.thisMonth.revenue)}
          icon={DollarSign}
          color="blue"
          trend={pctChange(data.thisMonth.revenue, data.lastMonth.revenue)}
          sub={`Costo: ${currency(data.thisMonth.cost)}`}
        />
        <StatCard
          label="Ganancia del mes"
          value={currency(data.thisMonth.profit)}
          icon={TrendingUp}
          color="green"
          trend={pctChange(data.thisMonth.profit, data.lastMonth.profit)}
          sub={`Margen: ${pct(data.thisMonth.margin)}`}
        />
        <StatCard
          label="Ventas registradas"
          value={String(data.thisMonth.salesCount)}
          icon={ShoppingCart}
          color="yellow"
          trend={pctChange(data.thisMonth.salesCount, data.lastMonth.salesCount)}
          sub="este mes"
        />
        <StatCard
          label="Productos en catálogo"
          value={String(data.totalProducts)}
          icon={Package}
          color="blue"
          sub="activos"
        />
      </div>

      {/* MercadoLibre connection */}
      <MeliConnectionCard />

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue area chart */}
        <div className="card lg:col-span-2">
          <h3 className="font-semibold text-white mb-4">Ingresos y ganancia — últimos 30 días</h3>
          {revenueChartData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-500 text-sm">Sin ventas registradas aún</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={revenueChartData}>
                <defs>
                  <linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#e5e7eb" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#e5e7eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="profit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="day" tick={{ fill: "#6b7280", fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#111827", border: "1px solid #1f2937", borderRadius: "8px" }}
                  labelStyle={{ color: "#9ca3af" }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={((v: unknown, name: unknown) => [currency(Number(v)), name === "revenue" ? "Ingresos" : "Ganancia"]) as any}
                />
                <Area type="monotone" dataKey="revenue" stroke="#e5e7eb" fill="url(#revenue)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="profit" stroke="#22c55e" fill="url(#profit)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top products */}
        <div className="card">
          <h3 className="font-semibold text-white mb-4">Top productos (mes)</h3>
          {data.topProducts.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-500 text-sm">Sin datos aún</div>
          ) : (
            <div className="space-y-3">
              {data.topProducts.map((p, i) => (
                <div key={p.productId} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-600 w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200 truncate">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.totalQty} uds · margen {pct(p.totalRevenue > 0 ? (p.totalProfit / p.totalRevenue) * 100 : 0)}</p>
                  </div>
                  <span className="text-sm font-medium text-white flex-shrink-0">{currency(p.totalRevenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent sales */}
      <div className="card">
        <h3 className="font-semibold text-white mb-4">Últimas ventas</h3>
        {data.recentSales.length === 0 ? (
          <p className="text-gray-500 text-sm">Sin ventas registradas aún</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-800">
                <th className="pb-3 text-gray-400 font-medium">#</th>
                <th className="pb-3 text-gray-400 font-medium">Productos</th>
                <th className="pb-3 text-gray-400 font-medium text-right">Ingresos</th>
                <th className="pb-3 text-gray-400 font-medium text-right">Ganancia</th>
                <th className="pb-3 text-gray-400 font-medium text-right">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {data.recentSales.map((sale) => (
                <tr key={sale.id} className="hover:bg-gray-800/30 transition-colors">
                  <td className="py-3 text-gray-200 font-mono font-medium">{sale.saleNumber}</td>
                  <td className="py-3 text-gray-300 max-w-xs truncate">
                    {sale.items.map((i) => i.product.name).join(", ")}
                  </td>
                  <td className="py-3 text-right text-white font-medium">{currency(sale.totalRevenue)}</td>
                  <td className="py-3 text-right text-green-400">{currency(sale.totalProfit)}</td>
                  <td className="py-3 text-right text-gray-400">{dateShort(sale.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
