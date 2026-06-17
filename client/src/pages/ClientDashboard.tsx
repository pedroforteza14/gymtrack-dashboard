import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { api } from '../lib/api'
import { DollarSign, Target, TrendingUp, MousePointer } from 'lucide-react'

interface Metric {
  id: string
  date: string
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpm: number
  conversions: number
  roas: number
}

interface Campaign {
  id: string
  name: string
  status: string
  objective: string
  metrics: Metric[]
}

function StatCard({ label, value, icon: Icon, sub }: { label: string; value: string; icon: any; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} className="text-blue-400" />
        <p className="text-xs text-gray-500">{label}</p>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

export default function ClientDashboard() {
  const { accountId } = useParams<{ accountId: string }>()

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ['campaigns', accountId],
    queryFn: () => api.get(`/campaigns/account/${accountId}`).then((r) => r.data),
    enabled: !!accountId,
  })

  const allMetrics = campaigns.flatMap((c) => c.metrics)
  const totalSpend = allMetrics.reduce((s, m) => s + Number(m.spend), 0)
  const totalConversions = allMetrics.reduce((s, m) => s + m.conversions, 0)
  const avgROAS = allMetrics.length
    ? allMetrics.reduce((s, m) => s + Number(m.roas), 0) / allMetrics.length
    : 0
  const totalClicks = allMetrics.reduce((s, m) => s + m.clicks, 0)

  // Agrupar métricas por fecha para el gráfico
  const chartData = Object.values(
    allMetrics.reduce<Record<string, { date: string; spend: number; conversions: number; roas: number }>>(
      (acc, m) => {
        const day = m.date.slice(0, 10)
        if (!acc[day]) acc[day] = { date: day, spend: 0, conversions: 0, roas: 0 }
        acc[day].spend += Number(m.spend)
        acc[day].conversions += m.conversions
        acc[day].roas = (acc[day].roas + Number(m.roas)) / 2
        return acc
      },
      {}
    )
  ).sort((a, b) => a.date.localeCompare(b.date))

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">Cargando métricas...</div>
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Tus Campañas</h1>
        <p className="text-gray-400 text-sm mt-1">Resultados de los últimos 30 días</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Inversión total" value={`$${totalSpend.toFixed(2)}`} icon={DollarSign} />
        <StatCard label="Conversiones" value={totalConversions.toString()} icon={Target} />
        <StatCard label="ROAS" value={`${avgROAS.toFixed(2)}x`} icon={TrendingUp} />
        <StatCard label="Clics" value={totalClicks.toLocaleString()} icon={MousePointer} />
      </div>

      {/* Gráfico de spend */}
      {chartData.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Inversión diaria</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#e5e7eb' }}
              />
              <Line type="monotone" dataKey="spend" stroke="#3b82f6" strokeWidth={2} dot={false} name="Spend ($)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabla de campañas */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Detalle por campaña</h2>
        </div>
        {campaigns.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">Sin campañas disponibles.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 text-xs uppercase border-b border-gray-800">
                <th className="px-5 py-3">Campaña</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3">Spend</th>
                <th className="px-5 py-3">Conversiones</th>
                <th className="px-5 py-3">ROAS</th>
                <th className="px-5 py-3">CTR</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((camp) => {
                const spend = camp.metrics.reduce((s, m) => s + Number(m.spend), 0)
                const convs = camp.metrics.reduce((s, m) => s + m.conversions, 0)
                const roas = camp.metrics.length
                  ? camp.metrics.reduce((s, m) => s + Number(m.roas), 0) / camp.metrics.length
                  : 0
                const ctr = camp.metrics.length
                  ? camp.metrics.reduce((s, m) => s + Number(m.ctr), 0) / camp.metrics.length
                  : 0

                return (
                  <tr key={camp.id} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                    <td className="px-5 py-3 text-white font-medium">{camp.name}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        camp.status === 'ACTIVE'
                          ? 'bg-green-500/10 text-green-400'
                          : 'bg-gray-700 text-gray-400'
                      }`}>
                        {camp.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-300">${spend.toFixed(2)}</td>
                    <td className="px-5 py-3 text-gray-300">{convs}</td>
                    <td className="px-5 py-3">
                      <span className={`font-semibold ${
                        roas >= 3 ? 'text-green-400' : roas >= 1.5 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {roas.toFixed(2)}x
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-300">{(ctr * 100).toFixed(2)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
