import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Circle } from "lucide-react";
import { api } from "../lib/api";

interface Campaign {
  id: string; metaCampaignId: string; name: string; status: string;
  adAccount: { name: string };
  metrics: { date: string; spend: number; impressions: number; clicks: number; conversions: number }[];
}

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function getCalendarDays(year: number, month: number) {
  const first = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

export default function CampaignCalendar() {
  const now = new Date();
  const [year, month] = [now.getFullYear(), now.getMonth()];

  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ["campaigns-calendar"],
    queryFn: () => api.get("/campaigns?limit=200").then((r) => r.data.campaigns ?? r.data),
  });

  const cells = getCalendarDays(year, month);

  // Build a map: day → campaigns with spend that day
  const dayMap: Record<number, { name: string; account: string; spend: number }[]> = {};
  for (const c of campaigns) {
    for (const m of c.metrics ?? []) {
      const d = new Date(m.date);
      if (d.getFullYear() === year && d.getMonth() === month && m.spend > 0) {
        const day = d.getDate();
        if (!dayMap[day]) dayMap[day] = [];
        dayMap[day].push({ name: c.name, account: c.adAccount?.name ?? "", spend: Number(m.spend) });
      }
    }
  }

  const activeCampaigns = campaigns.filter((c) => c.status === "ACTIVE");

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <CalendarDays size={24} /> Calendario de campañas
        </h1>
        <p className="text-gray-400 text-sm mt-1">{MONTHS[month]} {year} · {activeCampaigns.length} campañas activas</p>
      </div>

      {/* Active campaigns legend */}
      {activeCampaigns.length > 0 && (
        <div className="card p-4">
          <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wide">Campañas activas</p>
          <div className="flex flex-wrap gap-3">
            {activeCampaigns.map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-sm">
                <Circle size={8} className="text-purple-400 fill-purple-400" />
                <span className="text-gray-300">{c.name}</span>
                <span className="text-gray-600 text-xs">· {c.adAccount?.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calendar grid */}
      <div className="card p-5">
        <div className="grid grid-cols-7 mb-2">
          {DAYS.map((d) => (
            <div key={d} className="text-center text-xs text-gray-500 font-medium py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, idx) => {
            const entries = day ? (dayMap[day] ?? []) : [];
            const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
            return (
              <div
                key={idx}
                className={`min-h-[80px] rounded-lg p-1.5 border ${
                  day ? "border-gray-800 hover:border-gray-700" : "border-transparent"
                } ${isToday ? "border-purple-500/50 bg-purple-500/5" : ""}`}
              >
                {day && (
                  <>
                    <p className={`text-xs font-medium mb-1 ${isToday ? "text-purple-400" : "text-gray-400"}`}>{day}</p>
                    <div className="space-y-0.5">
                      {entries.slice(0, 3).map((e, i) => (
                        <div key={i} className="text-xs bg-purple-600/20 text-purple-300 rounded px-1 truncate" title={`${e.name}: $${e.spend}`}>
                          {e.name}
                        </div>
                      ))}
                      {entries.length > 3 && (
                        <p className="text-xs text-gray-600">+{entries.length - 3} más</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily spend summary */}
      {Object.keys(dayMap).length > 0 && (
        <div className="card p-5">
          <h3 className="text-white font-semibold mb-4">Días con inversión este mes</h3>
          <div className="space-y-2">
            {Object.entries(dayMap)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([day, entries]) => {
                const totalSpend = entries.reduce((s, e) => s + e.spend, 0);
                return (
                  <div key={day} className="flex items-center justify-between py-2 border-b border-gray-800/50 last:border-0">
                    <span className="text-gray-400 text-sm">{day} de {MONTHS[month]}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-gray-500">{entries.length} campaña{entries.length !== 1 ? "s" : ""}</span>
                      <span className="text-white font-medium text-sm">${totalSpend.toLocaleString("es-AR")}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
