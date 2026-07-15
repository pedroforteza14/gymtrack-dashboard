import { useQuery } from "@tanstack/react-query";
import { BarChart3, Link2, CheckCircle2, TrendingUp, MousePointerClick, Eye, DollarSign } from "lucide-react";
import { api } from "../lib/api";
import { currency, pct } from "../lib/format";

interface GAStatus { connected: boolean; customerId: string | null; }
interface GACampaign {
  campaign: { id: { value: string }; name: { value: string }; status: { value: string }; startDate: { value: string }; endDate: { value: string } };
  metrics: { costMicros: { value: string }; impressions: { value: string }; clicks: { value: string }; conversions: { value: string } };
}

export default function GoogleAds() {
  const { data: status } = useQuery<GAStatus>({
    queryKey: ["google-ads-status"],
    queryFn: () => api.get("/integrations/google-ads/status").then((r) => r.data),
  });

  const { data: campaigns = [] } = useQuery<GACampaign[]>({
    queryKey: ["google-ads-campaigns"],
    queryFn: () => api.get("/integrations/google-ads/campaigns").then((r) => r.data),
    enabled: status?.connected === true,
  });

  const handleConnect = () => {
    const token = localStorage.getItem("token");
    window.location.href = `${api.defaults.baseURL}/integrations/google-ads/auth?token=${token}`;
  };

  const totals = campaigns.reduce((acc, c) => ({
    spend: acc.spend + Number(c.metrics.costMicros.value) / 1_000_000,
    impressions: acc.impressions + Number(c.metrics.impressions.value),
    clicks: acc.clicks + Number(c.metrics.clicks.value),
    conversions: acc.conversions + Number(c.metrics.conversions.value),
  }), { spend: 0, impressions: 0, clicks: 0, conversions: 0 });

  const ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <BarChart3 size={24} /> Google Ads
        </h1>
        <p className="text-gray-400 text-sm mt-1">Rendimiento de los últimos 30 días</p>
      </div>

      {/* Connection card */}
      <div className="card flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-400/10 text-blue-400 flex items-center justify-center flex-shrink-0">
            <Link2 size={18} />
          </div>
          <div>
            <p className="text-white font-medium text-sm">Google Ads</p>
            <p className="text-gray-500 text-xs">
              {status?.connected ? `Conectado · Cliente ${status.customerId}` : "Sincronizá tus campañas de Google"}
            </p>
          </div>
        </div>
        {status?.connected ? (
          <div className="flex items-center gap-1.5 text-green-400 text-sm font-medium">
            <CheckCircle2 size={16} /> Conectado
          </div>
        ) : (
          <button onClick={handleConnect} className="px-4 py-1.5 bg-blue-500 text-white text-sm font-semibold rounded-lg hover:bg-blue-400 transition-colors">
            Conectar
          </button>
        )}
      </div>

      {!status?.connected && (
        <div className="card p-6 text-center">
          <p className="text-gray-400 mb-2">Conectá tu cuenta de Google Ads para ver las métricas aquí.</p>
          <p className="text-gray-600 text-sm">Una vez conectado, vas a ver campañas, inversión, clics y conversiones en tiempo real.</p>
        </div>
      )}

      {status?.connected && campaigns.length > 0 && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { icon: DollarSign, label: "Inversión", value: currency(totals.spend), color: "bg-blue-500/10 text-blue-400" },
              { icon: Eye, label: "Impresiones", value: totals.impressions.toLocaleString("es-AR"), color: "bg-purple-500/10 text-purple-400" },
              { icon: MousePointerClick, label: "Clics", value: totals.clicks.toLocaleString("es-AR"), color: "bg-yellow-500/10 text-yellow-400" },
              { icon: TrendingUp, label: "CTR", value: pct(ctr), color: "bg-green-500/10 text-green-400" },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="card p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className={`p-2 rounded-lg ${color}`}><Icon size={18} /></div>
                  <span className="text-gray-400 text-sm">{label}</span>
                </div>
                <p className="text-2xl font-bold text-white">{value}</p>
              </div>
            ))}
          </div>

          {/* Campaigns table */}
          <div className="card p-5">
            <h3 className="text-white font-semibold mb-4">Campañas (últimos 30 días)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800/50">
                  <tr className="text-left">
                    <th className="px-4 py-3 text-gray-400 font-medium">Campaña</th>
                    <th className="px-4 py-3 text-gray-400 font-medium text-right">Inversión</th>
                    <th className="px-4 py-3 text-gray-400 font-medium text-right">Impr.</th>
                    <th className="px-4 py-3 text-gray-400 font-medium text-right">Clics</th>
                    <th className="px-4 py-3 text-gray-400 font-medium text-right">CTR</th>
                    <th className="px-4 py-3 text-gray-400 font-medium text-right">Conv.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {campaigns.map((c) => {
                    const spend = Number(c.metrics.costMicros.value) / 1_000_000;
                    const impr = Number(c.metrics.impressions.value);
                    const clicks = Number(c.metrics.clicks.value);
                    const conv = Number(c.metrics.conversions.value);
                    const campaignCtr = impr > 0 ? clicks / impr : 0;
                    const active = c.campaign.status.value === "ENABLED";
                    return (
                      <tr key={c.campaign.id.value} className="hover:bg-gray-800/30">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${active ? "bg-green-400" : "bg-gray-500"}`} />
                            <span className="text-white font-medium truncate max-w-[200px]">{c.campaign.name.value}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300">{currency(spend)}</td>
                        <td className="px-4 py-3 text-right text-gray-300">{impr.toLocaleString("es-AR")}</td>
                        <td className="px-4 py-3 text-right text-gray-300">{clicks.toLocaleString("es-AR")}</td>
                        <td className="px-4 py-3 text-right text-gray-300">{pct(campaignCtr)}</td>
                        <td className="px-4 py-3 text-right text-white font-medium">{conv}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
