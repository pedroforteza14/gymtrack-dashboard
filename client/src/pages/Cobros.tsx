import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Coins, MessageCircle, CheckCircle2, Phone, Plus, X, Trash2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import { currency, dateShort } from "../lib/format";
import CountUp from "../components/CountUp";
import { Skeleton } from "../components/Skeleton";

interface Payment { id: string; amount: number; date: string; method?: string; notes?: string; }
interface Sale {
  id: string; saleNumber: string; createdAt: string;
  totalRevenue: number; pendingAmount?: number; paymentStatus: string;
  client?: { id: string; name: string } | null;
}
interface Ficha {
  id: string; fichaNumber: string; clientName: string; clientPhone?: string;
  total: number; deposit: number; estimatedDate?: string;
  fabricatedAt?: string; packedAt?: string; deliveredAt?: string;
  payments?: Payment[];
}

const METHODS = ["EFECTIVO", "TRANSFERENCIA", "TARJETA", "OTRO"] as const;
const METHOD_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo", TRANSFERENCIA: "Transferencia", TARJETA: "Tarjeta", OTRO: "Otro",
};

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
  const [payFicha, setPayFicha] = useState<(Ficha & { saldo: number }) | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<string>("EFECTIVO");
  const [payNotes, setPayNotes] = useState("");

  const { data: fichas = [], isLoading } = useQuery<Ficha[]>({
    queryKey: ["fichas"],
    queryFn: () => api.get("/fichas").then((r) => r.data),
  });

  // Ventas manuales con pago pendiente o parcial
  const { data: salesData } = useQuery<{ sales: Sale[] }>({
    queryKey: ["sales", "cobros"],
    queryFn: () => api.get("/sales?limit=200").then((r) => r.data),
  });
  const ventasPendientes = (salesData?.sales ?? [])
    .filter((v) => v.paymentStatus !== "PAID" && Number(v.pendingAmount ?? 0) > 0)
    .sort((a, b) => Number(b.pendingAmount) - Number(a.pendingAmount));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["fichas"] });
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const saldarVentaMut = useMutation({
    mutationFn: (v: Sale) => api.put(`/sales/${v.id}/payment`, { paymentStatus: "PAID", pendingAmount: 0 }),
    onSuccess: () => { refresh(); toast.success("Venta saldada 💰"); },
  });

  const addPayMut = useMutation({
    mutationFn: () => api.post(`/fichas/${payFicha!.id}/payments`, {
      amount: Number(payAmount),
      method: payMethod,
      notes: payNotes || undefined,
    }),
    onSuccess: () => { refresh(); toast.success("Pago registrado 💰"); closePay(); },
  });

  const delPayMut = useMutation({
    mutationFn: ({ fichaId, paymentId }: { fichaId: string; paymentId: string }) =>
      api.delete(`/fichas/${fichaId}/payments/${paymentId}`),
    onSuccess: () => { refresh(); toast.success("Pago eliminado"); },
  });

  function openPay(f: Ficha & { saldo: number }, full = false) {
    setPayFicha(f);
    setPayAmount(full ? String(f.saldo) : "");
    setPayMethod("EFECTIVO");
    setPayNotes("");
  }
  function closePay() { setPayFicha(null); setPayAmount(""); setPayNotes(""); }

  const pendientes = fichas
    .map((f) => ({ ...f, saldo: Number(f.total) - Number(f.deposit) }))
    .filter((f) => f.saldo > 0)
    .sort((a, b) => b.saldo - a.saldo);

  const totalVentas = ventasPendientes.reduce((s, v) => s + Number(v.pendingAmount ?? 0), 0);
  const totalPorCobrar = pendientes.reduce((s, f) => s + f.saldo, 0) + totalVentas;
  const cuentasConSaldo = pendientes.length + ventasPendientes.length;

  function recordar(f: Ficha & { saldo: number }) {
    const msg = `Hola ${f.clientName}! Te escribo de The Promise Machine 💪 Te recuerdo que queda un saldo de ${currency(f.saldo)} del pedido ${f.fichaNumber}. ¡Cualquier cosa quedo a disposición!`;
    const link = waLink(f.clientPhone, msg);
    if (link) window.open(link, "_blank");
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Coins size={24} /> Cobros pendientes</h1>
        <p className="text-gray-400 text-sm mt-1">Saldos por cobrar de pedidos y ventas</p>
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
          <p className="text-3xl font-bold text-white"><CountUp value={cuentasConSaldo} /></p>
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
            ) : cuentasConSaldo === 0 ? (
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
                <td className="px-4 py-4 text-right">
                  <p className="text-gray-400">{currency(Number(f.deposit))}</p>
                  {(f.payments?.length ?? 0) > 0 && (
                    <p className="text-[10px] text-gray-600">{f.payments!.length} pago{f.payments!.length !== 1 ? "s" : ""}</p>
                  )}
                </td>
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
                      onClick={() => openPay(f)}
                      title="Registrar un pago parcial"
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    >
                      <Plus size={13} /> Pago
                    </button>
                    <button
                      onClick={() => openPay(f, true)}
                      title="Cobrar el saldo completo"
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold bg-white text-gray-950 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      <CheckCircle2 size={13} /> Saldar
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {/* Ventas manuales con saldo pendiente */}
            {ventasPendientes.map((v) => (
              <tr key={v.id} className="hover:bg-gray-800/30">
                <td className="px-6 py-4">
                  <p className="font-mono font-medium text-white">{v.saleNumber}</p>
                  <p className="text-xs text-gray-500">Venta · {dateShort(v.createdAt)}</p>
                </td>
                <td className="px-4 py-4">
                  <p className="text-gray-100 font-medium">{v.client?.name ?? "Sin cliente"}</p>
                </td>
                <td className="px-4 py-4">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-700/60 text-gray-300">
                    {v.paymentStatus === "PARTIAL" ? "Pago parcial" : "Pago pendiente"}
                  </span>
                </td>
                <td className="px-4 py-4 text-right text-gray-300">{currency(Number(v.totalRevenue))}</td>
                <td className="px-4 py-4 text-right text-gray-400">
                  {currency(Number(v.totalRevenue) - Number(v.pendingAmount ?? 0))}
                </td>
                <td className="px-4 py-4 text-right font-bold text-yellow-400">{currency(Number(v.pendingAmount ?? 0))}</td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-1.5 justify-end">
                    <button
                      onClick={() => { if (confirm(`¿Marcar como cobrada la venta ${v.saleNumber}?`)) saldarVentaMut.mutate(v); }}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold bg-white text-gray-950 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      <CheckCircle2 size={13} /> Saldar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal de pago */}
      {payFicha && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <div>
                <h2 className="font-semibold text-white">Registrar pago</h2>
                <p className="text-xs text-gray-500">{payFicha.fichaNumber} · {payFicha.clientName}</p>
              </div>
              <button onClick={closePay} className="text-gray-400 hover:text-gray-100"><X size={20} /></button>
            </div>

            <div className="p-6 space-y-4">
              {/* Resumen */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-gray-800/60 rounded-lg p-2">
                  <p className="text-[10px] text-gray-500">Total</p>
                  <p className="text-sm font-bold text-white">{currency(Number(payFicha.total))}</p>
                </div>
                <div className="bg-gray-800/60 rounded-lg p-2">
                  <p className="text-[10px] text-gray-500">Pagado</p>
                  <p className="text-sm font-bold text-gray-300">{currency(Number(payFicha.deposit))}</p>
                </div>
                <div className="bg-gray-800/60 rounded-lg p-2">
                  <p className="text-[10px] text-gray-500">Saldo</p>
                  <p className="text-sm font-bold text-yellow-400">{currency(payFicha.saldo)}</p>
                </div>
              </div>

              {/* Pagos anteriores */}
              {(payFicha.payments?.length ?? 0) > 0 && (
                <div>
                  <label className="label">Pagos registrados</label>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {payFicha.payments!.map((p) => (
                      <div key={p.id} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="text-white font-medium">{currency(Number(p.amount))}</p>
                          <p className="text-[11px] text-gray-500">
                            {dateShort(p.date)}{p.method ? ` · ${METHOD_LABEL[p.method] ?? p.method}` : ""}{p.notes ? ` · ${p.notes}` : ""}
                          </p>
                        </div>
                        <button
                          onClick={() => { if (confirm(`¿Eliminar el pago de ${currency(Number(p.amount))}?`)) delPayMut.mutate({ fichaId: payFicha.id, paymentId: p.id }); }}
                          className="text-gray-500 hover:text-red-400 flex-shrink-0"><Trash2 size={13} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Nuevo pago */}
              <div>
                <label className="label">Monto del pago</label>
                <input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                  className="input" placeholder="0" autoFocus />
                <div className="flex gap-1.5 mt-2">
                  <button onClick={() => setPayAmount(String(payFicha.saldo))}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-800 text-gray-300 hover:bg-gray-700">
                    Todo ({currency(payFicha.saldo)})
                  </button>
                  <button onClick={() => setPayAmount(String(Math.round(payFicha.saldo / 2)))}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-800 text-gray-300 hover:bg-gray-700">
                    Mitad
                  </button>
                </div>
              </div>

              <div>
                <label className="label">Método</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {METHODS.map((m) => (
                    <button key={m} onClick={() => setPayMethod(m)}
                      className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        payMethod === m ? "bg-white text-gray-950 border-white" : "bg-gray-800 text-gray-300 border-gray-700 hover:border-gray-500"
                      }`}>
                      {METHOD_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Nota (opcional)</label>
                <input value={payNotes} onChange={(e) => setPayNotes(e.target.value)} className="input" placeholder="Ej: segunda cuota" />
              </div>
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button onClick={closePay} className="btn-secondary flex-1 justify-center">Cancelar</button>
              <button onClick={() => addPayMut.mutate()}
                disabled={!payAmount || Number(payAmount) <= 0 || addPayMut.isPending}
                className="btn-primary flex-1 justify-center">
                {addPayMut.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                Registrar pago
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
