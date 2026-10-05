import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { api } from "../lib/api";
import { currency } from "../lib/format";
import { Skeleton } from "../components/Skeleton";

interface Metricas {
  resumen: {
    facturado: number; ventas: number; ticketPromedio: number;
    ganancia: number; porCobrar: number; clientes: number;
    repetidores: number; tasaRecompra: number;
    promedioMensual: number; proyeccionAnual: number;
    mejorMes: { mes: string; facturado: number } | null;
    peorMes: { mes: string; facturado: number } | null;
    sinCanal: number; año: number;
  };
  porMes: { mes: string; facturado: number; ventas: number; ticketPromedio: number; variacion: number | null }[];
  porCanal: { canal: string; label: string; facturado: number; ventas: number; participacion: number; ticketPromedio: number }[];
  topProductos: { nombre: string; linea: string | null; unidades: number; facturado: number }[];
  porLinea: { linea: string; facturado: number; participacion: number }[];
  topClientes: { nombre: string; compras: number; facturado: number }[];
}

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const mesCorto = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const COLORES = ["#ffffff", "#9ca3af", "#6b7280", "#4b5563", "#374151"];

function Tarjeta({ titulo, valor, pie, acento }: { titulo: string; valor: string; pie?: string; acento?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wider text-gray-500">{titulo}</p>
      <p className={`text-2xl font-semibold mt-1 ${acento ?? "text-white"}`}>{valor}</p>
      {pie && <p className="text-xs text-gray-500 mt-1">{pie}</p>}
    </div>
  );
}

const tooltipStyle = {
  contentStyle: { background: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "#e5e7eb" },
};

export default function Metricas() {
  const { data, isLoading } = useQuery<Metricas>({
    queryKey: ["metricas"],
    queryFn: () => api.get("/metricas").then((r) => r.data),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <h1 className="page-title">Métricas</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const r = data.resumen;
  const serieMes = data.porMes.map((m) => ({ ...m, label: mesCorto(m.mes) }));
  const ultimo = data.porMes[data.porMes.length - 1];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Métricas {r.año}</h1>
        <p className="text-sm text-gray-400">Sobre {r.ventas} ventas registradas</p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tarjeta titulo="Facturado" valor={currency(r.facturado)} pie={`${r.ventas} ventas`} />
        <Tarjeta titulo="Ticket promedio" valor={currency(r.ticketPromedio)} />
        <Tarjeta titulo="Promedio por mes" valor={currency(r.promedioMensual)}
                 pie={`proyección anual ${currency(r.proyeccionAnual)}`} />
        <Tarjeta titulo="Por cobrar" valor={currency(r.porCobrar)}
                 acento={r.porCobrar > 0 ? "text-yellow-400" : "text-white"} />
        <Tarjeta titulo="Clientes" valor={String(r.clientes)}
                 pie={`${r.repetidores} repitieron (${r.tasaRecompra}%)`} />
        <Tarjeta titulo="Mejor mes" valor={r.mejorMes ? mesCorto(r.mejorMes.mes) : "—"}
                 pie={r.mejorMes ? currency(r.mejorMes.facturado) : ""} acento="text-green-400" />
        <Tarjeta titulo="Peor mes" valor={r.peorMes ? mesCorto(r.peorMes.mes) : "—"}
                 pie={r.peorMes ? currency(r.peorMes.facturado) : ""} acento="text-red-400" />
        <Tarjeta titulo="Último mes" valor={ultimo ? currency(ultimo.facturado) : "—"}
                 pie={ultimo?.variacion != null ? `${ultimo.variacion > 0 ? "+" : ""}${ultimo.variacion}% vs mes anterior` : ""}
                 acento={ultimo?.variacion != null && ultimo.variacion < 0 ? "text-red-400" : "text-green-400"} />
      </div>

      {r.sinCanal > 0 && (
        <div className="card p-3 flex items-center gap-2 text-sm border-yellow-500/20 bg-yellow-500/5">
          <AlertCircle size={15} className="text-yellow-400 flex-shrink-0" />
          <span className="text-gray-300">
            Hay <b>{r.sinCanal} ventas sin canal cargado</b>. Al completarlas vas a ver de dónde viene cada peso.
          </span>
        </div>
      )}

      {/* Facturación mensual */}
      <div className="card p-5">
        <h2 className="font-semibold text-white mb-4">Facturación mes a mes</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={serieMes}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis dataKey="label" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false}
                   tickFormatter={(v) => `${Math.round(v / 1_000_000)}M`} />
            <Tooltip {...tooltipStyle}
              formatter={((v: number) => [currency(v), "Facturado"]) as any} />
            <Bar dataKey="facturado" fill="#ffffff" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Ticket promedio */}
      <div className="card p-5">
        <h2 className="font-semibold text-white mb-1">Ticket promedio</h2>
        <p className="text-xs text-gray-500 mb-4">Cuánto deja cada venta. Si sube, estás vendiendo equipos más caros.</p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={serieMes}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis dataKey="label" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false}
                   tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [currency(v), "Ticket"]) as any} />
            <Line type="monotone" dataKey="ticketPromedio" stroke="#4ade80" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Canales */}
        <div className="card p-5">
          <h2 className="font-semibold text-white mb-4">De dónde vienen las ventas</h2>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={190}>
              <PieChart>
                <Pie data={data.porCanal} dataKey="facturado" nameKey="label"
                     cx="50%" cy="50%" innerRadius={44} outerRadius={76} paddingAngle={2}>
                  {data.porCanal.map((_, i) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}
                </Pie>
                <Tooltip {...tooltipStyle} formatter={((v: number) => currency(v)) as any} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {data.porCanal.map((c, i) => (
                <div key={c.canal} className="flex items-center gap-2 text-sm">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: COLORES[i % COLORES.length] }} />
                  <span className="text-gray-300 flex-1">{c.label}</span>
                  <span className="text-gray-500 text-xs">{c.participacion}%</span>
                  <span className="text-white font-medium">{currency(c.facturado)}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Ticket por canal: {data.porCanal.map((c) => `${c.label} ${currency(c.ticketPromedio)}`).join(" · ")}
          </p>
        </div>

        {/* Familias */}
        <div className="card p-5">
          <h2 className="font-semibold text-white mb-4">Qué se vende</h2>
          <div className="space-y-2.5">
            {data.porLinea.slice(0, 7).map((l) => (
              <div key={l.linea}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-300">{l.linea}</span>
                  <span className="text-gray-400">{currency(l.facturado)} <span className="text-gray-600">({l.participacion}%)</span></span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-white rounded-full" style={{ width: `${Math.min(100, l.participacion)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Top productos */}
        <div className="card p-0 overflow-hidden">
          <h2 className="font-semibold text-white px-5 pt-5 pb-3">Productos que más facturan</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-800/50">
              {data.topProductos.slice(0, 8).map((p, i) => (
                <tr key={i} className="hover:bg-gray-800/30">
                  <td className="pl-5 py-2.5 text-gray-600 w-8">{i + 1}</td>
                  <td className="py-2.5 text-gray-200">{p.nombre}</td>
                  <td className="py-2.5 text-right text-gray-500 text-xs w-14">{p.unidades}u</td>
                  <td className="pr-5 py-2.5 text-right text-white font-medium">{currency(p.facturado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Top clientes */}
        <div className="card p-0 overflow-hidden">
          <h2 className="font-semibold text-white px-5 pt-5 pb-3">Mejores clientes</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-800/50">
              {data.topClientes.slice(0, 8).map((c, i) => (
                <tr key={i} className="hover:bg-gray-800/30">
                  <td className="pl-5 py-2.5 text-gray-600 w-8">{i + 1}</td>
                  <td className="py-2.5 text-gray-200">{c.nombre}</td>
                  <td className="py-2.5 text-right text-gray-500 text-xs w-20">
                    {c.compras} {c.compras === 1 ? "compra" : "compras"}
                  </td>
                  <td className="pr-5 py-2.5 text-right text-white font-medium">{currency(c.facturado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mes a mes en detalle */}
      <div className="card p-0 overflow-x-auto">
        <h2 className="font-semibold text-white px-5 pt-5 pb-3">Detalle mensual</h2>
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr className="text-left">
              <th className="px-5 py-2.5 text-gray-400 font-medium">Mes</th>
              <th className="px-4 py-2.5 text-gray-400 font-medium text-right">Ventas</th>
              <th className="px-4 py-2.5 text-gray-400 font-medium text-right">Facturado</th>
              <th className="px-4 py-2.5 text-gray-400 font-medium text-right">Ticket</th>
              <th className="px-5 py-2.5 text-gray-400 font-medium text-right">vs mes anterior</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {serieMes.map((m) => (
              <tr key={m.mes} className="hover:bg-gray-800/30">
                <td className="px-5 py-2.5 text-gray-200">{m.label}</td>
                <td className="px-4 py-2.5 text-right text-gray-400">{m.ventas}</td>
                <td className="px-4 py-2.5 text-right text-white font-medium">{currency(m.facturado)}</td>
                <td className="px-4 py-2.5 text-right text-gray-400">{currency(m.ticketPromedio)}</td>
                <td className="px-5 py-2.5 text-right">
                  {m.variacion == null ? <span className="text-gray-600">—</span> : (
                    <span className={`inline-flex items-center gap-1 ${m.variacion >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {m.variacion >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                      {m.variacion > 0 ? "+" : ""}{m.variacion}%
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
