import { useQuery } from "@tanstack/react-query";
import { BarChart3, TrendingUp, Users, Package, ShoppingCart, Calendar } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import { api } from "../lib/api";
import { currency } from "../lib/format";

interface AnalyticsData {
  revenueByCategory: { category: string; revenue: number; profit: number; qty: number }[];
  topClients: { id: string; name: string; revenue: number; salesCount: number }[];
  monthlyTrend: { month: string; revenue: number; profit: number; count: number }[];
  stockHealth: { sinStock: number; stockBajo: number; stockOk: number };
  avgTicket: { avg: number; max: number; min: number; total: number };
  salesByDayOfWeek: { day: string; revenue: number; count: number }[];
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#84cc16"];
const STOCK_COLORS = ["#ef4444", "#f59e0b", "#10b981"];

function StatCard({ icon: Icon, label, value, sub, color }: { icon: typeof BarChart3; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${color}`}><Icon size={18} /></div>
        <span className="text-gray-400 text-sm">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm shadow-xl">
      <p className="text-gray-300 mb-1">{label}</p>
      {payload.map((p: { name: string; value: number; color: string }, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.name}: {p.name.includes("Cant") ? p.value : currency(p.value)}
        </p>
      ))}
    </div>
  );
}

export default function Analytics() {
  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["analytics-owner"],
    queryFn: () => api.get("/analytics/owner").then((r) => r.data),
  });

  if (isLoading) return <div className="p-8 text-gray-500">Cargando analytics...</div>;
  if (!data) return <div className="p-8 text-gray-500">Sin datos disponibles</div>;

  const totalStock = data.stockHealth.sinStock + data.stockHealth.stockBajo + data.stockHealth.stockOk;
  const stockData = [
    { name: "Sin stock", value: data.stockHealth.sinStock },
    { name: "Stock bajo", value: data.stockHealth.stockBajo },
    { name: "Stock OK", value: data.stockHealth.stockOk },
  ].filter((d) => d.value > 0);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <BarChart3 size={24} /> Analytics
        </h1>
        <p className="text-gray-400 text-sm mt-1">Análisis de rendimiento del negocio</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard icon={ShoppingCart} label="Ticket promedio" value={currency(data.avgTicket.avg)} sub={`Máx: ${currency(data.avgTicket.max)}`} color="bg-blue-500/10 text-blue-400" />
        <StatCard icon={TrendingUp} label="Ventas del mes" value={String(data.avgTicket.total)} sub={`Mín: ${currency(data.avgTicket.min)}`} color="bg-green-500/10 text-green-400" />
        <StatCard icon={Users} label="Clientes activos" value={String(data.topClients.length)} sub="Con compras registradas" color="bg-purple-500/10 text-purple-400" />
        <StatCard icon={Package} label="Productos" value={String(totalStock)} sub={`${data.stockHealth.sinStock} sin stock`} color="bg-yellow-500/10 text-yellow-400" />
      </div>

      {/* Monthly Trend + Stock Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-5 lg:col-span-2">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Calendar size={16} /> Tendencia mensual (últimos 6 meses)
          </h3>
          {data.monthlyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 12 }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line type="monotone" dataKey="revenue" name="Ingresos" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4, fill: "#3b82f6" }} />
                <Line type="monotone" dataKey="profit" name="Ganancia" stroke="#10b981" strokeWidth={2} dot={{ r: 4, fill: "#10b981" }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-center py-12">Aún no hay datos de ventas</p>
          )}
        </div>

        <div className="card p-5">
          <h3 className="text-white font-semibold mb-4">Salud del inventario</h3>
          {stockData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={stockData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                    {stockData.map((_, i) => <Cell key={i} fill={STOCK_COLORS[i % STOCK_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [`${v} productos`]} contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-2 mt-2">
                {stockData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: STOCK_COLORS[i] }} />
                      <span className="text-gray-300">{d.name}</span>
                    </div>
                    <span className="text-white font-medium">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-gray-500 text-center py-12">Sin productos</p>
          )}
        </div>
      </div>

      {/* Revenue by Category + Sales by Day */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="text-white font-semibold mb-4">Ingresos por categoría (mes actual)</h3>
          {data.revenueByCategory.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.revenueByCategory} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="category" tick={{ fill: "#9ca3af", fontSize: 12 }} width={100} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="revenue" name="Ingresos" radius={[0, 4, 4, 0]}>
                  {data.revenueByCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-center py-12">Sin ventas este mes</p>
          )}
        </div>

        <div className="card p-5">
          <h3 className="text-white font-semibold mb-4">Ventas por día de la semana</h3>
          {data.salesByDayOfWeek.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.salesByDayOfWeek}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="day" tick={{ fill: "#9ca3af", fontSize: 12 }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Cantidad" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-center py-12">Sin datos suficientes</p>
          )}
        </div>
      </div>

      {/* Top Clients */}
      <div className="card p-5">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Users size={16} /> Top clientes
        </h3>
        {data.topClients.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800/50">
                <tr className="text-left">
                  <th className="px-4 py-3 text-gray-400 font-medium">#</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Cliente</th>
                  <th className="px-4 py-3 text-gray-400 font-medium text-right">Ventas</th>
                  <th className="px-4 py-3 text-gray-400 font-medium text-right">Ingresos</th>
                  <th className="px-4 py-3 text-gray-400 font-medium text-right">Ticket promedio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {data.topClients.map((c, i) => (
                  <tr key={c.id} className="hover:bg-gray-800/30">
                    <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                    <td className="px-4 py-3 text-white font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{c.salesCount}</td>
                    <td className="px-4 py-3 text-right text-white font-medium">{currency(c.revenue)}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{currency(c.revenue / c.salesCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">Asigná clientes a las ventas para ver el ranking</p>
        )}
      </div>
    </div>
  );
}
