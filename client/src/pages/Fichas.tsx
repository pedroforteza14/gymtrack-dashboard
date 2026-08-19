import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList, Plus, X, Trash2, Download, Loader2, Pencil, User,
} from "lucide-react";
import toast from "react-hot-toast";
import { Skeleton } from "../components/Skeleton";
import { api } from "../lib/api";
import { currency, dateShort } from "../lib/format";

interface FichaItem { cantidad: number; producto: string; }
interface Ficha {
  id: string; fichaNumber: string; date: string; estimatedDate?: string;
  clientName: string; clientPhone?: string; clientLocation?: string;
  items: FichaItem[];
  total: number; deposit: number; paymentMethod?: string;
  deliveryType?: string; deliveryVia?: string; destination?: string; transportInfo?: string;
  observations?: string;
  fabricatedAt?: string; fabricatedBy?: string;
  packedAt?: string; packedBy?: string;
  deliveredAt?: string; deliveredBy?: string;
}

function statusOf(f: Ficha): { label: string; color: string } {
  if (f.deliveredAt) return { label: "Entregado", color: "bg-green-400/10 text-green-400" };
  if (f.packedAt) return { label: "Embalado", color: "bg-white/10 text-white" };
  if (f.fabricatedAt) return { label: "Fabricado", color: "bg-white/10 text-gray-200" };
  return { label: "Pendiente", color: "bg-yellow-400/10 text-yellow-400" };
}

const empty = {
  clientName: "", clientPhone: "", clientLocation: "", estimatedDate: "",
  items: [{ cantidad: 1, producto: "" }] as FichaItem[],
  total: "", deposit: "", paymentMethod: "",
  deliveryType: "", deliveryVia: "", destination: "", transportInfo: "",
  observations: "",
  fabricatedAt: "", fabricatedBy: "", packedAt: "", packedBy: "", deliveredAt: "", deliveredBy: "",
};
type FormState = typeof empty;

export default function Fichas() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [err, setErr] = useState("");

  const { data: fichas = [], isLoading } = useQuery<Ficha[]>({
    queryKey: ["fichas"],
    queryFn: () => api.get("/fichas").then((r) => r.data),
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = {
        clientName: form.clientName,
        clientPhone: form.clientPhone || undefined,
        clientLocation: form.clientLocation || undefined,
        estimatedDate: form.estimatedDate || null,
        items: form.items.filter((i) => i.producto.trim()).map((i) => ({ cantidad: Number(i.cantidad) || 0, producto: i.producto })),
        total: Number(form.total) || 0,
        deposit: Number(form.deposit) || 0,
        paymentMethod: form.paymentMethod || null,
        deliveryType: form.deliveryType || null,
        deliveryVia: form.deliveryVia || null,
        destination: form.destination || undefined,
        transportInfo: form.transportInfo || undefined,
        observations: form.observations || undefined,
        fabricatedAt: form.fabricatedAt || null, fabricatedBy: form.fabricatedBy || null,
        packedAt: form.packedAt || null, packedBy: form.packedBy || null,
        deliveredAt: form.deliveredAt || null, deliveredBy: form.deliveredBy || null,
      };
      return editId ? api.put(`/fichas/${editId}`, payload) : api.post("/fichas", payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fichas"] }); toast.success(editId ? "Ficha actualizada" : "Ficha creada"); close(); },
    onError: (e: any) => setErr(e.response?.data?.error?.formErrors?.join(", ") || "Error al guardar"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/fichas/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fichas"] }); toast.success("Ficha eliminada"); },
  });

  function openCreate() { setForm(empty); setEditId(null); setErr(""); setModalOpen(true); }
  function openEdit(f: Ficha) {
    setForm({
      clientName: f.clientName, clientPhone: f.clientPhone ?? "", clientLocation: f.clientLocation ?? "",
      estimatedDate: f.estimatedDate?.slice(0, 10) ?? "",
      items: f.items?.length ? f.items : [{ cantidad: 1, producto: "" }],
      total: String(f.total ?? ""), deposit: String(f.deposit ?? ""), paymentMethod: f.paymentMethod ?? "",
      deliveryType: f.deliveryType ?? "", deliveryVia: f.deliveryVia ?? "", destination: f.destination ?? "", transportInfo: f.transportInfo ?? "",
      observations: f.observations ?? "",
      fabricatedAt: f.fabricatedAt?.slice(0, 10) ?? "", fabricatedBy: f.fabricatedBy ?? "",
      packedAt: f.packedAt?.slice(0, 10) ?? "", packedBy: f.packedBy ?? "",
      deliveredAt: f.deliveredAt?.slice(0, 10) ?? "", deliveredBy: f.deliveredBy ?? "",
    });
    setEditId(f.id); setErr(""); setModalOpen(true);
  }
  function close() { setModalOpen(false); setEditId(null); setForm(empty); setErr(""); }

  function setItem(i: number, field: keyof FichaItem, value: string) {
    const items = [...form.items];
    items[i] = { ...items[i], [field]: field === "cantidad" ? value : value } as FichaItem;
    setForm({ ...form, items });
  }
  function addItem() { setForm({ ...form, items: [...form.items, { cantidad: 1, producto: "" }] }); }
  function removeItem(i: number) { setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) }); }

  function openPDF(id: string) {
    const token = localStorage.getItem("token");
    window.open(`${api.defaults.baseURL}/fichas/${id}/pdf?token=${token}`, "_blank");
  }

  const saldo = (Number(form.total) || 0) - (Number(form.deposit) || 0);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><ClipboardList size={24} /> Fichas de pedido</h1>
          <p className="text-gray-400 text-sm mt-1">{fichas.length} fichas · pedido y fabricación</p>
        </div>
        <button onClick={openCreate} className="btn-primary"><Plus size={16} /> Nueva ficha</button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr className="text-left">
              <th className="px-6 py-3 text-gray-400 font-medium">N°</th>
              <th className="px-4 py-3 text-gray-400 font-medium">Cliente</th>
              <th className="px-4 py-3 text-gray-400 font-medium">Estado</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Total</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Saldo</th>
              <th className="px-4 py-3 text-gray-400 font-medium">Fecha</th>
              <th className="px-4 py-3 text-gray-400 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 7 }).map((_, c) => (
                  <td key={c} className="px-4 py-4"><Skeleton className="h-4 w-full" /></td>
                ))}</tr>
              ))
            ) : fichas.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">Sin fichas cargadas. Tocá "Nueva ficha" para empezar.</td></tr>
            ) : fichas.map((f) => {
              const st = statusOf(f);
              const saldoF = Number(f.total) - Number(f.deposit);
              return (
                <tr key={f.id} className="hover:bg-gray-800/30">
                  <td className="px-6 py-4 font-mono font-medium text-white">{f.fichaNumber}</td>
                  <td className="px-4 py-4">
                    <p className="text-gray-100 font-medium">{f.clientName}</p>
                    <p className="text-xs text-gray-500">{f.clientLocation || ""}</p>
                  </td>
                  <td className="px-4 py-4"><span className={`px-2 py-1 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span></td>
                  <td className="px-4 py-4 text-right text-white font-medium">{currency(Number(f.total))}</td>
                  <td className={`px-4 py-4 text-right font-medium ${saldoF > 0 ? "text-yellow-400" : "text-green-400"}`}>{currency(saldoF)}</td>
                  <td className="px-4 py-4 text-gray-400 text-xs">{dateShort(f.date)}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openPDF(f.id)} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Descargar PDF"><Download size={14} /></button>
                      <button onClick={() => openEdit(f)} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Editar"><Pencil size={14} /></button>
                      <button onClick={() => { if (confirm(`¿Eliminar ficha ${f.fichaNumber}?`)) deleteMut.mutate(f.id); }} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors" title="Eliminar"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 sticky top-0 bg-gray-900 z-10">
              <h2 className="font-semibold text-white">{editId ? "Editar ficha" : "Nueva ficha de pedido"}</h2>
              <button onClick={close} className="text-gray-400 hover:text-gray-100"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-6">
              {/* 1. Cliente */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2"><User size={13} /> Datos del cliente</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-3 md:col-span-1"><label className="label">Nombre *</label><input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} className="input" /></div>
                  <div><label className="label">Teléfono</label><input value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} className="input" /></div>
                  <div><label className="label">Localidad / Provincia</label><input value={form.clientLocation} onChange={(e) => setForm({ ...form, clientLocation: e.target.value })} className="input" /></div>
                </div>
                <div className="mt-3 w-48"><label className="label">Fecha estimada de entrega</label><input type="date" value={form.estimatedDate} onChange={(e) => setForm({ ...form, estimatedDate: e.target.value })} className="input" /></div>
              </div>

              {/* 2. Pedido */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Pedido</p>
                  <button type="button" onClick={addItem} className="text-xs text-gray-300 hover:text-white flex items-center gap-1"><Plus size={12} /> Agregar</button>
                </div>
                <div className="space-y-2">
                  {form.items.map((it, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input type="number" min="0" value={it.cantidad} onChange={(e) => setItem(i, "cantidad", e.target.value)} className="input w-20" placeholder="Cant." />
                      <input value={it.producto} onChange={(e) => setItem(i, "producto", e.target.value)} className="input flex-1" placeholder="Producto / máquina" />
                      {form.items.length > 1 && <button type="button" onClick={() => removeItem(i)} className="text-gray-500 hover:text-red-400"><Trash2 size={14} /></button>}
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Pago */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Pago</p>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="label">Total</label><input type="number" step="0.01" value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} className="input" placeholder="0" /></div>
                  <div><label className="label">Seña</label><input type="number" step="0.01" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} className="input" placeholder="0" /></div>
                  <div><label className="label">Saldo</label><div className="input bg-gray-800/60 text-gray-300">{currency(saldo)}</div></div>
                </div>
                <div className="mt-3">
                  <label className="label">Método de pago</label>
                  <div className="flex gap-2">
                    {["EFECTIVO", "TRANSFERENCIA", "TARJETA"].map((m) => (
                      <button key={m} type="button" onClick={() => setForm({ ...form, paymentMethod: form.paymentMethod === m ? "" : m })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${form.paymentMethod === m ? "bg-white text-gray-950 border-white" : "bg-gray-800 text-gray-300 border-gray-700 hover:border-gray-500"}`}>
                        {m.charAt(0) + m.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 4. Entrega */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Entrega / envío</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {[["RETIRO", "Retiro por fábrica"], ["FLETE", "Flete"]].map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setForm({ ...form, deliveryType: form.deliveryType === v ? "" : v })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${form.deliveryType === v ? "bg-white text-gray-950 border-white" : "bg-gray-800 text-gray-300 border-gray-700 hover:border-gray-500"}`}>{l}</button>
                  ))}
                  {form.deliveryType === "FLETE" && [["CARGO", "Vía Cargo"], ["BUSPACK", "Buspack"]].map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setForm({ ...form, deliveryVia: form.deliveryVia === v ? "" : v })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${form.deliveryVia === v ? "bg-white text-gray-950 border-white" : "bg-gray-800 text-gray-300 border-gray-700 hover:border-gray-500"}`}>{l}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Destino</label><input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} className="input" /></div>
                  <div><label className="label">Datos / transporte</label><input value={form.transportInfo} onChange={(e) => setForm({ ...form, transportInfo: e.target.value })} className="input" /></div>
                </div>
              </div>

              {/* 5. Observaciones */}
              <div>
                <label className="label">Observaciones / personalización</label>
                <textarea value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} rows={2} className="input resize-none" />
              </div>

              {/* 6. Control interno */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Control interno</p>
                <div className="grid grid-cols-3 gap-3">
                  {([["Fabricado", "fabricatedAt", "fabricatedBy"], ["Embalado", "packedAt", "packedBy"], ["Entregado", "deliveredAt", "deliveredBy"]] as const).map(([label, dk, bk]) => (
                    <div key={dk} className="bg-gray-800/40 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-medium text-gray-200">{label}</p>
                      <input type="date" value={form[dk]} onChange={(e) => setForm({ ...form, [dk]: e.target.value })} className="input text-xs py-1.5" />
                      <input value={form[bk]} onChange={(e) => setForm({ ...form, [bk]: e.target.value })} className="input text-xs py-1.5" placeholder="Iniciales" />
                    </div>
                  ))}
                </div>
              </div>

              {err && <p className="text-red-400 text-sm">{err}</p>}
            </div>
            <div className="flex gap-3 px-6 pb-6 pt-2 border-t border-gray-800 sticky bottom-0 bg-gray-900">
              <button onClick={close} className="btn-secondary flex-1 justify-center">Cancelar</button>
              <button onClick={() => saveMut.mutate()} disabled={!form.clientName || saveMut.isPending} className="btn-primary flex-1 justify-center">
                {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                {editId ? "Guardar cambios" : "Crear ficha"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
