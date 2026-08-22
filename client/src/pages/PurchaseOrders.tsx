import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { Plus, Trash2, X, CheckCircle2, Package, Loader2, ShoppingBag } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import { currency, dateShort } from "../lib/format";

interface Product { id: string; name: string; sku: string; }
interface POItem { productId?: string | null; description?: string | null; quantity: number; unitCost: number; product?: { name: string; sku: string }; subtotal: number; }
interface PurchaseOrder {
  id: string; orderNumber: string; supplier: string; status: string;
  notes?: string; totalCost: number; expectedAt?: string; receivedAt?: string;
  createdAt: string; items: POItem[];
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING:   { label: "Pendiente",  color: "bg-yellow-400/10 text-yellow-400" },
  PARTIAL:   { label: "Parcial",    color: "bg-white/10 text-gray-200" },
  RECEIVED:  { label: "Recibida",   color: "bg-green-400/10 text-green-400" },
  CANCELLED: { label: "Cancelada",  color: "bg-red-400/10 text-red-400" },
};

type FormData = {
  supplier: string; notes?: string; expectedAt?: string;
  items: { productId?: string; description?: string; quantity: number; unitCost: number }[];
};

export default function PurchaseOrders() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const [paySource, setPaySource] = useState("EFECTIVO_MP");

  const { data: orders = [], isLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ["purchase-orders"],
    queryFn: () => api.get("/purchase-orders").then((r) => r.data),
  });
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: () => api.get("/products").then((r) => r.data),
  });

  const { register, handleSubmit, control, reset, watch } = useForm<FormData>({
    defaultValues: { items: [{ productId: "", description: "", quantity: 1, unitCost: 0 }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const watchedItems = watch("items");

  const createMutation = useMutation({
    mutationFn: (data: FormData) => api.post("/purchase-orders", {
      ...data,
      items: data.items.map((i) => ({ ...i, quantity: Number(i.quantity), unitCost: Number(i.unitCost) })),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchase-orders"] }); setModalOpen(false); reset(); },
  });

  const receiveMutation = useMutation({
    mutationFn: ({ id, paymentSource }: { id: string; paymentSource: string }) =>
      api.post(`/purchase-orders/${id}/receive`, { paymentSource }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expenses-summary"] });
      toast.success("Compra recibida y registrada como gasto 💸");
      setReceiving(null);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/purchase-orders/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchase-orders"] }),
  });

  const totalPreview = watchedItems.reduce((s, i) => s + (Number(i.unitCost) || 0) * (Number(i.quantity) || 0), 0);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><ShoppingBag size={24} /> Compras a proveedores</h1>
          <p className="text-gray-400 text-sm mt-1">{orders.length} compras registradas</p>
        </div>
        <button onClick={() => { reset(); setModalOpen(true); }} className="btn-primary">
          <Plus size={16} /> Nueva compra
        </button>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr className="text-left">
              <th className="px-6 py-3 text-gray-400 font-medium">Compra</th>
              <th className="px-4 py-3 text-gray-400 font-medium">Proveedor</th>
              <th className="px-4 py-3 text-gray-400 font-medium">Estado</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Total</th>
              <th className="px-4 py-3 text-gray-400 font-medium">Fecha</th>
              <th className="px-4 py-3 text-gray-400 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {isLoading ? (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">Cargando...</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">Sin compras registradas</td></tr>
            ) : orders.map((o) => {
              const st = STATUS_LABELS[o.status] ?? STATUS_LABELS.PENDING;
              return (
                <tr key={o.id} className="hover:bg-gray-800/30">
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-100">{o.orderNumber}</p>
                    <p className="text-xs text-gray-500">{o.items.length} producto{o.items.length !== 1 ? "s" : ""}</p>
                  </td>
                  <td className="px-4 py-4 text-gray-300">{o.supplier}</td>
                  <td className="px-4 py-4"><span className={`px-2 py-1 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span></td>
                  <td className="px-4 py-4 text-right font-medium text-white">{currency(Number(o.totalCost))}</td>
                  <td className="px-4 py-4 text-gray-400 text-xs">{dateShort(o.createdAt)}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      {o.status === "PENDING" && (
                        <>
                          <button
                            onClick={() => { setReceiving(o); setPaySource("EFECTIVO_MP"); }}
                            className="flex items-center gap-1 px-2 py-1 text-xs text-green-400 hover:bg-green-400/10 rounded-lg transition-colors"
                          >
                            <CheckCircle2 size={13} /> Recibir
                          </button>
                          <button
                            onClick={() => { if (confirm("¿Cancelar esta compra? Si ya generó un gasto, también se da de baja.")) cancelMutation.mutate(o.id); }}
                            className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                          >
                            <X size={13} /> Cancelar
                          </button>
                        </>
                      )}
                      {o.status === "RECEIVED" && <span className="text-xs text-gray-500">{o.receivedAt ? dateShort(o.receivedAt) : ""}</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 sticky top-0 bg-gray-900">
              <h2 className="font-semibold text-white">Nueva compra</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-100"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">Proveedor</label>
                  <input {...register("supplier", { required: true })} className="input" placeholder="Nombre del proveedor" />
                </div>
                <div>
                  <label className="label">Fecha esperada (opcional)</label>
                  <input {...register("expectedAt")} type="date" className="input" />
                </div>
                <div>
                  <label className="label">Notas (opcional)</label>
                  <input {...register("notes")} className="input" placeholder="Notas..." />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Productos</label>
                  <button type="button" onClick={() => append({ productId: "", description: "", quantity: 1, unitCost: 0 })}
                    className="text-xs text-gray-200 hover:text-gray-100 flex items-center gap-1">
                    <Plus size={12} /> Agregar
                  </button>
                </div>
                <div className="space-y-2">
                  {fields.map((field, idx) => (
                    <div key={field.id} className="grid grid-cols-12 gap-2 items-center bg-gray-800/30 rounded-lg p-2">
                      <div className="col-span-12 md:col-span-5 space-y-1.5">
                        <select {...register(`items.${idx}.productId`)} className="input text-sm">
                          <option value="">— Material / insumo suelto —</option>
                          {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                        </select>
                        {!watchedItems[idx]?.productId && (
                          <input {...register(`items.${idx}.description`)} className="input text-sm"
                            placeholder="Ej: Caño 40x40, pintura negra..." />
                        )}
                      </div>
                      <div className="col-span-3 md:col-span-2">
                        <input {...register(`items.${idx}.quantity`)} type="number" min="1" className="input text-sm" placeholder="Cant." />
                      </div>
                      <div className="col-span-4 md:col-span-3">
                        <input {...register(`items.${idx}.unitCost`)} type="number" step="0.01" className="input text-sm" placeholder="Costo unit." />
                      </div>
                      <div className="col-span-3 md:col-span-1 text-right text-xs text-gray-400">
                        {currency((Number(watchedItems[idx]?.unitCost) || 0) * (Number(watchedItems[idx]?.quantity) || 0))}
                      </div>
                      <div className="col-span-2 md:col-span-1 flex justify-end">
                        {fields.length > 1 && (
                          <button type="button" onClick={() => remove(idx)} className="text-red-400 hover:text-red-300"><Trash2 size={14} /></button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end mt-2 text-sm font-medium text-white">
                  Total: {currency(totalPreview)}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary flex-1 justify-center">Cancelar</button>
                <button type="submit" disabled={createMutation.isPending} className="btn-primary flex-1 justify-center">
                  {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />}
                  Crear compra
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal recibir compra → genera el gasto */}
      {receiving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <div>
                <h2 className="font-semibold text-white">Recibir compra</h2>
                <p className="text-xs text-gray-500">{receiving.orderNumber} · {receiving.supplier}</p>
              </div>
              <button onClick={() => setReceiving(null)} className="text-gray-400 hover:text-gray-100"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-800/60 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Se registrará como gasto de la empresa</p>
                <p className="text-2xl font-bold text-white">{currency(Number(receiving.totalCost))}</p>
              </div>
              <div>
                <label className="label">¿Con qué se pagó?</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["EFECTIVO_MP", "Efectivo / MP"],
                    ["VISA", "Tarjeta Visa"],
                    ["MASTER", "Tarjeta Master"],
                    ["PAPA", "Tarjeta Papá"],
                    ["OTRO", "Otro"],
                  ].map(([v, l]) => (
                    <button key={v} onClick={() => setPaySource(v)}
                      className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                        paySource === v ? "bg-white text-gray-950 border-white" : "bg-gray-800 text-gray-300 border-gray-700 hover:border-gray-500"
                      }`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-500">
                El gasto va a aparecer en la sección Gastos y va a impactar en el balance del mes.
              </p>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setReceiving(null)} className="btn-secondary flex-1 justify-center">Cancelar</button>
              <button onClick={() => receiveMutation.mutate({ id: receiving.id, paymentSource: paySource })}
                disabled={receiveMutation.isPending} className="btn-primary flex-1 justify-center">
                {receiveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Recibir y registrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
