import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Coins, MessageCircle, CheckCircle2, Phone } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import { currency, dateShort } from "../lib/format";
import CountUp from "../components/CountUp";
import { Skeleton } from "../components/Skeleton";

interface Ficha {
  id: string; fichaNumber: string; clientName: string; clientPhone?: string;
  total: number; deposit: number; estimatedDate?: string;
  fabricatedAt?: string; packedAt?: string; deliveredAt?: string;
}

function statusLabel(f: Ficha): string {
  if (f.deliveredAt) return "Entregado";
  if (f.packedAt) return "Embalado";
  if (f.fabricatedAt) return "Fabricado";
  return "Pendiente";
}

// Arma un link de WhatsApp (agrega 54 de Argentina si falta)
function waLink(phone: string | undefined, message: string): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (!digits.startsWith("54")) digits = "54" + digits;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export default function Cobros() {
  const qc = useQueryClient();
  const { data: fichas = [], isLoading } = useQuery<Ficha[]>({
    queryKey: ["fichas"],
    queryFn: () => api.get("/fichas").then((r) => r.data),
  });

  const cobradoMut = useMutation({
    mutationFn: (f: Ficha) => api.put(`/fichas/${f.id}`, { deposit: Number(f.total) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fichas"] }); toast.success("Saldo cobrado 💰"); },
  });

  const pendientes = fichas
    .map((f) => ({ ...f, saldo: Number(f.total) - Number(f.deposit) }))
    .filter((f) => f.saldo > 0)
    .sort((a, b) => b.saldo - a.saldo);

  const totalPorCobrar = pendientes.reduce((s, f) => s + f.saldo, 0);

  function recordar(f: Ficha & { saldo: number }) {
    const msg = `Hola ${f.clientName}! Te escribo de The Promise Machine 💪 Te recuerdo que queda un saldo de ${currency(f.saldo)} del pedido ${f.fichaNumber}. ¡Cualquier cosa quedo a disposición!`;
    const link = waLink(f.clientPhone, msg);
    if (link) window.open(link, "_blank");
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Coins size={24} /> Cobros pendientes</h1>
        <p className="text-gray-400 text-sm mt-1">Saldos por cobrar de las fichas de pedido</p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-400"><Coins size={18} /></div>
            <span className="text-gray-400 text-sm">Total por cobrar</span>
          </div>
          <p className="text-3xl font-bold text-white"><CountUp value={totalPorCobrar} format={currency} /></p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-white/10 text-white"><MessageCircle size={18} /></div>
            <span className="text-gray-400 text-sm">Cuentas con saldo</span>
          </div>
          <p className="text-3xl font-bold text-white"><CountUp value={pendientes.length} /></p>
        </div>
      </div>

      {/* Tabla */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr className="text-left">
              <th className="px-6 py-3 text-gray-400 font-medium">Ficha</th>
              <th className="px-4 py-3 text-gray-400 font-medium">Cliente</th>
              <th className="px-4 py-3 text-gray-400 font-medium">Estado</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Total</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Seña</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Saldo</th>
              <th className="px-4 py-3 text-gray-400 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((_, c) => (
                    <td key={c} className="px-4 py-4"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : pendientes.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">🎉 No hay saldos pendientes de cobro</td></tr>
            ) : pendientes.map((f) => (
              <tr key={f.id} className="hover:bg-gray-800/30">
                <td className="px-6 py-4">
                  <p className="font-mono font-medium text-white">{f.fichaNumber}</p>
                  {f.estimatedDate && <p className="text-xs text-gray-500">Entrega: {dateShort(f.estimatedDate)}</p>}
                </td>
                <td className="px-4 py-4">
                  <p className="text-gray-100 font-medium">{f.clientName}</p>
                  {f.clientPhone && <p className="text-xs text-gray-500 flex items-center gap-1"><Phone size={10} />{f.clientPhone}</p>}
                </td>
                <td className="px-4 py-4"><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-700/60 text-gray-300">{statusLabel(f)}</span></td>
                <td className="px-4 py-4 text-right text-gray-300">{currency(Number(f.total))}</td>
                <td className="px-4 py-4 text-right text-gray-400">{currency(Number(f.deposit))}</td>
                <td className="px-4 py-4 text-right font-bold text-yellow-400">{currency(f.saldo)}</td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-1.5 justify-end">
                    <button
                      onClick={() => recordar(f)}
                      disabled={!f.clientPhone}
                      title={f.clientPhone ? "Recordar por WhatsApp" : "Sin teléfono cargado"}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors"
                    >
                      <MessageCircle size={13} /> WhatsApp
                    </button>
                    <button
                      onClick={() => { if (confirm(`¿Marcar como cobrado el saldo de ${currency(f.saldo)} de ${f.fichaNumber}?`)) cobradoMut.mutate(f); }}
                      title="Marcar saldo cobrado"
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    >
                      <CheckCircle2 size={13} /> Cobrado
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
