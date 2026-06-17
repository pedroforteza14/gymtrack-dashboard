import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { TrendingUp, DollarSign, Target, BarChart2 } from 'lucide-react'

interface AccountSummary {
  accountId: string
  accountName: string
  client: { id: string; name: string }
  totalSpend: number
  totalConversions: number
  avgROAS: number
  campaignCount: number
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center flex-shrink-0">
        <Icon size={18} className="text-blue-400" />
      </div>
      <div>
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <p className="text-xl font-bold text-white">{value}</p>
      </div>
    </div>
  )
}

export default function AgencyDashboard() {
  const { data: accounts = [], isLoading } = useQuery<AccountSummary[]>({
    queryKey: ['campaigns-summary'],
    queryFn: () => api.get('/campaigns/summary').then((r) => r.data),
  })

  const totalSpend = accounts.reduce((s, a) => s + a.totalSpend, 0)
  const totalConversions = accounts.reduce((s, a) => s + a.totalConversions, 0)
  const avgROAS = accounts.length
    ? accounts.reduce((s, a) => s + a.avgROAS, 0) / accounts.length
    : 0

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard de Agencia</h1>
        <p className="text-gray-400 text-sm mt-1">Resumen de todos los clientes — últimos 7 días</p>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Spend total" value={`$${totalSpend.toFixed(2)}`} icon={DollarSign} />
        <StatCard label="Conversiones" value={totalConversions.toString()} icon={Target} />
        <StatCard label="ROAS promedio" value={`${avgROAS.toFixed(2)}x`} icon={TrendingUp} />
      </div>

      {/* Tabla de clientes */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
          <BarChart2 size={16} className="text-blue-400" />
          <h2 className="text-sm font-semibold text-white">Cuentas activas</h2>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Cargando...</div>
        ) : accounts.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            No hay cuentas conectadas todavía.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 text-xs uppercase border-b border-gray-800">
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Cuenta</th>
                <th className="px-5 py-3">Campañas</th>
                <th className="px-5 py-3">Spend</th>
                <th className="px-5 py-3">Conversiones</th>
                <th className="px-5 py-3">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr
                  key={acc.accountId}
                  className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors"
                >
                  <td className="px-5 py-3 text-white font-medium">{acc.client.name}</td>
                  <td className="px-5 py-3 text-gray-400">{acc.accountName}</td>
                  <td className="px-5 py-3 text-gray-300">{acc.campaignCount}</td>
                  <td className="px-5 py-3 text-gray-300">${acc.totalSpend.toFixed(2)}</td>
                  <td className="px-5 py-3 text-gray-300">{acc.totalConversions}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`font-semibold ${
                        acc.avgROAS >= 3
                          ? 'text-green-400'
                          : acc.avgROAS >= 1.5
                          ? 'text-yellow-400'
                          : 'text-red-400'
                      }`}
                    >
                      {acc.avgROAS.toFixed(2)}x
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
