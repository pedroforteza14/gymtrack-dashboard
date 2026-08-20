import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Megaphone, DollarSign, Target, Filter } from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  status: string;
  objective: string | null;
  adAccount: { id: string; name: string };
  metrics: {
    id: string;
    date: string;
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    conversions: number;
    roas: number;
  }[];
}

export default function AllCampaigns() {
  const [filterAccount, setFilterAccount] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["all-campaigns"],
    queryFn: () => api.get("/campaigns").then((r) => r.data),
  });

  const accounts = Array.from(new Set(campaigns.map((c) => c.adAccount.id))).map((id) => {
    const c = campaigns.find((x) => x.adAccount.id === id)!;
    return { id, name: c.adAccount.name };
  });

  const filtered = campaigns.filter((c) => {
    if (filterAccount && c.adAccount.id !== filterAccount) return false;
    if (filterStatus && c.status !== filterStatus) return false;
    return true;
  });

  function getCampaignMetrics(c: Campaign) {
    const spend = c.metrics.reduce((s, m) => s + Number(m.spend), 0);
    const conversions = c.metrics.reduce((s, m) => s + m.conversions, 0);
    const clicks = c.metrics.reduce((s, m) => s + m.clicks, 0);
    const impressions = c.metrics.reduce((s, m) => s + m.impressions, 0);
    const avgROAS = c.metrics.length
      ? c.metrics.reduce((s, m) => s + Number(m.roas), 0) / c.metrics.length
      : 0;
    const avgCTR = c.metrics.length
      ? c.metrics.reduce((s, m) => s + Number(m.ctr), 0) / c.metrics.length
      : 0;
    return { spend, conversions, clicks, impressions, avgROAS, avgCTR };
  }

  const totalSpend = filtered.reduce((s, c) => s + getCampaignMetrics(c).spend, 0);
  const totalConversions = filtered.reduce((s, c) => s + getCampaignMetrics(c).conversions, 0);
  const activeCampaigns = filtered.filter((c) => c.status === "ACTIVE").length;

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Campañas</h1>
          <p className="text-gray-400 text-sm mt-1">
            {filtered.length} campaña{filtered.length !== 1 ? "s" : ""} · {activeCampaigns} activa{activeCampaigns !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center">
            <Megaphone size={18} className="text-purple-400" />
          </div>
          <div>
            <p className="text-xs text-gray-400">Campañas activas</p>
            <p className="text-xl font-bold text-white">{activeCampaigns}</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
            <DollarSign size={18} className="text-blue-400" />
          </div>
          <div>
            <p className="text-xs text-gray-400">Spend total</p>
            <p className="text-xl font-bold text-white">${totalSpend.toFixed(2)}</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center">
            <Target size={18} className="text-green-400" />
          </div>
          <div>
            <p className="text-xs text-gray-400">Conversiones</p>
            <p className="text-xl font-bold text-white">{totalConversions}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-500" />
          <select
            value={filterAccount}
            onChange={(e) => setFilterAccount(e.target.value)}
            className="input w-48 text-sm"
          >
            <option value="">Todas las cuentas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="input w-36 text-sm"
        >
          <option value="">Todos los estados</option>
          <option value="ACTIVE">Activas</option>
          <option value="PAUSED">Pausadas</option>
        </select>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr className="text-left">
              <th className="px-6 py-3 text-gray-400 font-medium">Campaña</th>
              <th className="px-4 py-3 text-gray-400 font-medium">Cuenta</th>
              <th className="px-4 py-3 text-gray-400 font-medium">Estado</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Spend</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Conversiones</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">ROAS</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">CTR</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Clics</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-gray-500">Cargando campañas...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                  {campaigns.length === 0 ? "Sin campañas. Conectá una cuenta de Meta Ads primero." : "Sin resultados con los filtros aplicados."}
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const m = getCampaignMetrics(c);
                return (
                  <tr key={c.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-100">{c.name}</p>
                      {c.objective && <p className="text-xs text-gray-500">{c.objective}</p>}
                    </td>
                    <td className="px-4 py-4 text-gray-400 text-xs">{c.adAccount.name}</td>
                    <td className="px-4 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        c.status === "ACTIVE"
                          ? "bg-green-500/10 text-green-400 border border-green-500/20"
                          : "bg-gray-700/50 text-gray-400 border border-gray-700"
                      }`}>
                        {c.status === "ACTIVE" ? "Activa" : "Pausada"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right text-white font-medium">
                      ${m.spend.toFixed(2)}
                    </td>
                    <td className="px-4 py-4 text-right text-gray-300">{m.conversions}</td>
                    <td className="px-4 py-4 text-right">
                      <span className={`font-semibold ${
                        m.avgROAS >= 3 ? "text-green-400" : m.avgROAS >= 1.5 ? "text-yellow-400" : m.avgROAS > 0 ? "text-red-400" : "text-gray-600"
                      }`}>
                        {m.avgROAS > 0 ? `${m.avgROAS.toFixed(2)}x` : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right text-gray-300">
                      {m.avgCTR > 0 ? `${(m.avgCTR * 100).toFixed(2)}%` : "—"}
                    </td>
                    <td className="px-4 py-4 text-right text-gray-300">
                      {m.clicks > 0 ? m.clicks.toLocaleString() : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
