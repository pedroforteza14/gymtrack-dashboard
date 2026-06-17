import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { currency, dateShort } from "../lib/format";
import {
  FileText, Plus, Search, X, Trash2, Download, ChevronDown, ChevronUp,
  CheckCircle, Clock, Send, XCircle, AlertCircle,
} from "lucide-react";

interface Product { id: string; name: string; sku: string; sellPrice: number; }
interface Client { id: string; name: string; }
interface QuoteItem { productId: string; quantity: number; unitPrice: number; product?: { name: string; sku: string }; subtotal?: number; }
interface Quote {
  id: string; quoteNumber: string; status: string; totalAmount: number;
  createdAt: string; validDays: number; notes?: string;
  client?: { name: string } | null;
  items: QuoteItem[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  DRAFT:    { label: "Borrador",  color: "text-gray-400 bg-gray-800",   icon: Clock },
  SENT:     { label: "Enviado",   color: "text-blue-400 bg-blue-900/30", icon: Send },
  ACCEPTED: { label: "Aceptado", color: "text-green-400 bg-green-900/30", icon: CheckCircle },
  REJECTED: { label: "Rechazado", color: "text-red-400 bg-red-900/30",  icon: XCircle },
  EXPIRED:  { label: "Vencido",   color: "text-yellow-400 bg-yellow-900/30", icon: AlertCircle },
};

const STATUS_ORDER = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"];

export default function Quotes() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [clientId, setClientId] = useState("");
  const [notes, setNotes] = useState("");
  const [validDays, setValidDays] = useState(15);
  const [items, setItems] = useState<{ productId: string; quantity: number; unitPrice: number }[]>([]);

  const { data: quotes = [], isLoading } = useQuery<Quote[]>({
    queryKey: ["quotes"],
    queryFn: () => api.get("/quotes").then((r) => r.data),
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: () => api.get("/products").then((r) => r.data),
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["clients"],
    queryFn: () => api.get("/clients").then((r) => r.data),
  });

  const createMut = useMutation({
    mutationFn: () => api.post("/quotes", { clientId: clientId || undefined, items, notes, validDays }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["quotes"] }); resetForm(); },
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.put(`/quotes/${id}/status`, { status }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/quotes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
  });

  const resetForm = () => { setShowCreate(false); setClientId(""); setNotes(""); setValidDays(15); setItems([]); };

  const addItem = () => setItems([...items, { productId: "", quantity: 1, unitPrice: 0 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, value: string | number) => {
    const updated = [...items];
    if (field === "productId") {
      const prod = products.find((p) => p.id === value);
      updated[i] = { ...updated[i], productId: value as string, unitPrice: prod ? Number(prod.sellPrice) : 0 };
    } else {
      updated[i] = { ...updated[i], [field]: value };
    }
    setItems(updated);
  };

  const total = items.reduce((acc, i) => acc + i.quantity * i.unitPrice, 0);

  const filtered = quotes.filter((q) =>
    q.quoteNumber.toLowerCase().includes(search.toLowerCase()) ||
    q.client?.name.toLowerCase().includes(search.toLowerCase())
  );

  const downloadPDF = (id: string) => {
    const token = localStorage.getItem("token");
    window.open(`http://localhost:3001/api/quotes/${id}/pdf?token=${token}`, "_blank");
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText size={24} className="text-blue-400" /> Presupuestos
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">{quotes.length} presupuestos registrados</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} /> Nuevo presupuesto
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          const count = quotes.filter((q) => q.status === key).length;
          return (
            <div key={key} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${cfg.color}`}><Icon size={16} /></div>
              <div>
                <p className="text-xs text-gray-500">{cfg.label}</p>
                <p className="text-xl font-bold text-white">{count}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por número o cliente..."
          className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500" />
      </div>

      {/* List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="py-12 text-center text-gray-500">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-500 bg-gray-900 border border-gray-800 rounded-xl">
            {search ? "Sin resultados" : "No hay presupuestos aún. ¡Creá el primero!"}
          </div>
        ) : (
          filtered.map((q) => {
            const cfg = STATUS_CONFIG[q.status];
            const Icon = cfg.icon;
            const isExpanded = expandedId === q.id;

            return (
              <div key={q.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                {/* Row */}
                <div className="flex items-center gap-4 px-4 py-3">
                  <button onClick={() => setExpandedId(isExpanded ? null : q.id)}
                    className="text-gray-500 hover:text-gray-300 transition-colors">
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  <div className="flex-1 grid grid-cols-4 gap-4 items-center">
                    <div>
                      <p className="font-mono font-semibold text-white text-sm">{q.quoteNumber}</p>
                      <p className="text-xs text-gray-500">{dateShort(q.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-300">{q.client?.name ?? <span className="text-gray-600 italic">Sin cliente</span>}</p>
                      <p className="text-xs text-gray-600">{q.items.length} producto{q.items.length !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-white">{currency(Number(q.totalAmount))}</p>
                      <p className="text-xs text-gray-600">Válido {q.validDays} días</p>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                        <Icon size={11} />{cfg.label}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => downloadPDF(q.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-xs font-medium transition-colors">
                      <Download size={13} /> PDF
                    </button>
                    <select value={q.status}
                      onChange={(e) => statusMut.mutate({ id: q.id, status: e.target.value })}
                      className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500">
                      {STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                      ))}
                    </select>
                    <button onClick={() => { if (confirm("¿Eliminar presupuesto?")) deleteMut.mutate(q.id); }}
                      className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Expanded items */}
                {isExpanded && (
                  <div className="border-t border-gray-800 px-4 py-3 bg-gray-950">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-600 uppercase">
                          <th className="text-left pb-2">Producto</th>
                          <th className="text-right pb-2">Cant.</th>
                          <th className="text-right pb-2">P. Unit.</th>
                          <th className="text-right pb-2">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {q.items.map((item, i) => (
                          <tr key={i}>
                            <td className="py-1.5 text-gray-300">{item.product?.name ?? item.productId}</td>
                            <td className="py-1.5 text-right text-gray-400">{item.quantity}</td>
                            <td className="py-1.5 text-right text-gray-400">{currency(Number(item.unitPrice))}</td>
                            <td className="py-1.5 text-right text-white font-medium">{currency(Number(item.subtotal))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {q.notes && <p className="mt-3 text-xs text-gray-500 italic border-t border-gray-800 pt-2">{q.notes}</p>}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="font-semibold text-white">Nuevo presupuesto</h2>
              <button onClick={resetForm} className="text-gray-500 hover:text-gray-300"><X size={18} /></button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              {/* Client + validity */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Cliente (opcional)</label>
                  <select value={clientId} onChange={(e) => setClientId(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500">
                    <option value="">— Sin cliente —</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Validez (días)</label>
                  <input type="number" value={validDays} onChange={(e) => setValidDays(Number(e.target.value))} min={1}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-gray-400">Productos *</label>
                  <button onClick={addItem} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                    <Plus size={12} /> Agregar producto
                  </button>
                </div>
                <div className="space-y-2">
                  {items.map((item, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5">
                        <select value={item.productId}
                          onChange={(e) => updateItem(i, "productId", e.target.value)}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500">
                          <option value="">Seleccionar...</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <input type="number" value={item.quantity} min={1}
                          onChange={(e) => updateItem(i, "quantity", Number(e.target.value))}
                          placeholder="Cant."
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
                      </div>
                      <div className="col-span-4">
                        <input type="number" value={item.unitPrice}
                          onChange={(e) => updateItem(i, "unitPrice", Number(e.target.value))}
                          placeholder="Precio"
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
                      </div>
                      <div className="col-span-1 flex justify-center">
                        <button onClick={() => removeItem(i)} className="text-gray-600 hover:text-red-400 transition-colors">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div className="py-6 text-center text-sm text-gray-600 border border-dashed border-gray-800 rounded-lg">
                      Hacé click en "Agregar producto" para comenzar
                    </div>
                  )}
                </div>
              </div>

              {/* Total preview */}
              {items.length > 0 && (
                <div className="bg-blue-600/10 border border-blue-600/20 rounded-lg px-4 py-3 flex justify-between items-center">
                  <span className="text-sm text-gray-400">Total presupuesto</span>
                  <span className="text-xl font-bold text-white">{currency(total)}</span>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Notas / condiciones</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  placeholder="Ej: Precio no incluye flete. Entrega en 15 días hábiles."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500 resize-none" />
              </div>
            </div>

            <div className="flex gap-3 px-6 pb-6 pt-2 border-t border-gray-800">
              <button onClick={resetForm} className="flex-1 py-2 border border-gray-700 text-gray-400 hover:text-white rounded-lg text-sm transition-colors">Cancelar</button>
              <button onClick={() => createMut.mutate()}
                disabled={items.length === 0 || items.some((i) => !i.productId) || createMut.isPending}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                {createMut.isPending ? "Creando..." : "Crear presupuesto"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
