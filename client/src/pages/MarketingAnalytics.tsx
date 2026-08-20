import { useQuery } from "@tanstack/react-query";
import { BarChart3, Eye, MousePointerClick, Target, DollarSign, TrendingUp } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, Legend, LineChart, Line,
} from "recharts";
import { api } from "../lib/api";
import { currency, pct } from "../lib/format";

interface MarketingAnalyticsData {
  dailyMetrics: { date: string; spend: number; impressions: number; clicks: number; conversions: number }[];
  campaignPerformance: { name: string; status: string; spend: number; conversions: number; roas: number; ctr: number; impressions: number; clicks: number }[];
  spendByAccount: { name: string; spend: number; conversions: number; campaigns: number }[];
  funnel: { impressions: number; clicks: number; conversions: number; ctr: number; convRate: number };
}

const COLORS = ["#8b5cf6", "#a78bfa", "#c4b5fd", "#6d28d9", "#7c3aed", "#5b21b6"];

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
          {p.name}: {p.name === "Inversión" ? currency(p.value) : p.value.toLocaleString("es-AR")}
        </p>
      ))}
    </div>
  );
}

function FunnelStep({ label, value, rate, icon: Icon, color }: { label: string; value: number; rate?: string; icon: typeof Eye; color: string }) {
  return (
    <div className="flex-1 text-center">
      <div className={`inline-flex p-3 rounded-xl ${color} mb-2`}>
        <Icon size={24} />
      </div>
      <p className="text-2xl font-bold text-white">{value.toLocaleString("es-AR")}</p>
      <p className="text-gray-400 text-sm">{label}</p>
      {rate && <p className="text-xs text-purple-400 mt-1">{rate}</p>}
    </div>
  );
}

export default function MarketingAnalytics() {
  const { data, isLoading } = useQuery<MarketingAnalyticsData>({
    queryKey: ["analytics-marketing"],
    queryFn: () => api.get("/analytics/marketing").then((r) => r.data),
  });

  if (isLoading) return <div className="p-8 text-gray-500">Cargando analytics...</div>;
  if (!data) return <div className="p-8 text-gray-500">Sin datos disponibles</div>;

  const totalSpend = data.campaignPerformance.reduce((s, c) => s + c.spend, 0);
  const totalConversions = data.funnel.conversions;
  const costPerConversion = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const activeCampaigns = data.campaignPerformance.filter((c) => c.status === "ACTIVE").length;

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <BarChart3 size={24} /> Analytics de Campañas
        </h1>
        <p className="text-gray-400 text-sm mt-1">Rendimiento de los últimos 30 días</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard icon={DollarSign} label="Inversión total" value={currency(totalSpend)} sub={`${activeCampaigns} campañas activas`} color="bg-purple-500/10 text-purple-400" />
        <StatCard icon={Target} label="Conversiones" value={totalConversions.toLocaleString("es-AR")} sub={`CPA: ${currency(costPerConversion)}`} color="bg-green-500/10 text-green-400" />
        <StatCard icon={MousePointerClick} label="CTR promedio" value={pct(data.funnel.ctr)} sub={`${data.funnel.clicks.toLocaleString("es-AR")} clics totales`} color="bg-blue-500/10 text-blue-400" />
        <StatCard icon={TrendingUp} label="Conv. Rate" value={pct(data.funnel.convRate)} sub="Clics → Conversiones" color="bg-yellow-500/10 text-yellow-400" />
      </div>

      {/* Funnel */}
      {data.funnel.impressions > 0 && (
        <div className="card p-6">
          <h3 className="text-white font-semibold mb-6">Embudo de conversión</h3>
          <div className="flex items-center gap-2">
            <FunnelStep icon={Eye} label="Impresiones" value={data.funnel.impressions} color="bg-purple-500/10 text-purple-400" />
            <div className="text-gray-600 text-2xl">→</div>
            <FunnelStep icon={MousePointerClick} label="Clics" value={data.funnel.clicks} rate={`CTR: ${pct(data.funnel.ctr)}`} color="bg-blue-500/10 text-blue-400" />
            <div className="text-gray-600 text-2xl">→</div>
            <FunnelStep icon={Target} label="Conversiones" value={data.funnel.conversions} rate={`Conv: ${pct(data.funnel.convRate)}`} color="bg-green-500/10 text-green-400" />
          </div>
        </div>
      )}

      {/* Daily Spend + Conversions Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="text-white font-semibold mb-4">Inversión diaria</h3>
          {data.dailyMetrics.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={data.dailyMetrics}>
                <defs>
                  <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="spend" name="Inversión" stroke="#8b5cf6" fill="url(#spendGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-center py-12">Sin datos de inversión</p>
          )}
        </div>

        <div className="card p-5">
          <h3 className="text-white font-semibold mb-4">Clics y conversiones diarios</h3>
          {data.dailyMetrics.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data.dailyMetrics}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line type="monotone" dataKey="clicks" name="Clics" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="conversions" name="Conversiones" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-center py-12">Sin datos</p>
          )}
        </div>
      </div>

      {/* Campaign Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-5 lg:col-span-2">
          <h3 className="text-white font-semibold mb-4">Rendimiento por campaña</h3>
          {data.campaignPerformance.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800/50">
                  <tr className="text-left">
                    <th className="px-4 py-3 text-gray-400 font-medium">Campaña</th>
                    <th className="px-4 py-3 text-gray-400 font-medium text-right">Inversión</th>
                    <th className="px-4 py-3 text-gray-400 font-medium text-right">Conv.</th>
                    <th className="px-4 py-3 text-gray-400 font-medium text-right">CPA</th>
                    <th className="px-4 py-3 text-gray-400 font-medium text-right">CTR</th>
                    <th className="px-4 py-3 text-gray-400 font-medium text-right">ROAS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {data.campaignPerformance.map((c) => {
                    const cpa = c.conversions > 0 ? c.spend / c.conversions : 0;
                    return (
                      <tr key={c.name} className="hover:bg-gray-800/30">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${c.status === "ACTIVE" ? "bg-green-400" : "bg-gray-500"}`} />
                            <span className="text-white font-medium truncate max-w-[200px]">{c.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300">{currency(c.spend)}</td>
                        <td className="px-4 py-3 text-right text-white font-medium">{c.conversions}</td>
                        <td className="px-4 py-3 text-right text-gray-300">{currency(cpa)}</td>
                        <td className="px-4 py-3 text-right text-gray-300">{pct(c.ctr)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={c.roas >= 3 ? "text-green-400" : c.roas >= 1.5 ? "text-yellow-400" : "text-red-400"}>
                            {c.roas.toFixed(2)}x
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">Sin campañas con métricas</p>
          )}
        </div>

        <div className="card p-5">
          <h3 className="text-white font-semibold mb-4">Inversión por cuenta</h3>
          {data.spendByAccount.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.spendByAccount}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="spend" name="Inversión" radius={[4, 4, 0, 0]}>
                    {data.spendByAccount.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {data.spendByAccount.map((a) => (
                  <div key={a.name} className="flex items-center justify-between text-sm">
                    <span className="text-gray-300 truncate">{a.name}</span>
                    <span className="text-white font-medium">{a.conversions} conv.</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-gray-500 text-center py-8">Sin datos de cuentas</p>
          )}
        </div>
      </div>
    </div>
  );
}
