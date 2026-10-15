import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import { getRole } from "../lib/auth";
import { currency, dateShort, waLink } from "../lib/format";
import {
  FileText, Plus, Search, X, Trash2, Download, ChevronDown, ChevronUp,
  CheckCircle, Clock, Send, XCircle, AlertCircle, ClipboardList,
  ShieldAlert, MessageCircle, Handshake, Trophy, Settings2,
} from "lucide-react";

interface Product { id: string; name: string; sku: string; sellPrice: number; }
interface Client { id: string; name: string; }
interface QuoteItem { productId: string; quantity: number; unitPrice: number; notes?: string; product?: { name: string; sku: string }; subtotal?: number; }
interface Quote {
  id: string; quoteNumber: string; status: string; totalAmount: number;
  createdAt: string; validDays: number; notes?: string; cashDiscount?: number; installments?: number;
  sentAt?: string | null; lostReason?: string | null; saleId?: string | null;
  client?: { name: string; phone?: string } | null;
  seller?: { id: string; name: string } | null;
  items: QuoteItem[];
}
interface QuoteConfig { maxDiscount: number; cashDiscountStd: number; }

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  DRAFT:            { label: "Borrador",             color: "text-gray-400 bg-gray-800",         icon: Clock },
  PENDING_APPROVAL: { label: "Esperando aprobación", color: "text-orange-300 bg-orange-900/30",  icon: ShieldAlert },
  SENT:             { label: "Enviado",              color: "text-gray-200 bg-gray-700/40",      icon: Send },
  NEGOTIATING:      { label: "En negociación",       color: "text-sky-300 bg-sky-900/30",        icon: Handshake },
  ACCEPTED:         { label: "Ganado",               color: "text-green-400 bg-green-900/30",    icon: CheckCircle },
  REJECTED:         { label: "Perdido",              color: "text-red-400 bg-red-900/30",        icon: XCircle },
  EXPIRED:          { label: "Vencido",              color: "text-yellow-400 bg-yellow-900/30",  icon: AlertCircle },
};

// "Ganado" no está en la lista: se marca con el botón, que además crea la venta
const ESTADOS_ELEGIBLES = ["DRAFT", "SENT", "NEGOTIATING", "REJECTED", "EXPIRED"];

const MOTIVOS_PERDIDA = ["Precio", "Demora en la entrega", "Compró en otro lado", "Dejó de responder", "Ya no lo necesita"];

// Pasados estos días sin respuesta, el presupuesto se marca para volver a escribir
const DIAS_PARA_SEGUIR = 3;

function diasDesde(fecha: string): number {
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000);
}

export default function Quotes() {
  const qc = useQueryClient();
  const esDueño = getRole() === "OWNER";
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState<Record<string, string>>({});
  const [ganado, setGanado] = useState<Quote | null>(null);
  const [perdido, setPerdido] = useState<Quote | null>(null);
  const [verTope, setVerTope] = useState(false);

  // Form state
  const [clientId, setClientId] = useState("");
  const [notes, setNotes] = useState("");
  const [validDays, setValidDays] = useState(15);
  const [cashDiscount, setCashDiscount] = useState(15);
  const [installments, setInstallments] = useState(6);
  const [items, setItems] = useState<{ productId: string; quantity: number; unitPrice: number; notes?: string }[]>([]);

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

  const { data: config } = useQuery<QuoteConfig>({
    queryKey: ["quote-config"],
    queryFn: () => api.get("/quotes/config").then((r) => r.data),
  });

  const createMut = useMutation({
    mutationFn: () => api.post("/quotes", { clientId: clientId || undefined, items, notes, validDays, cashDiscount, installments }).then((r) => r.data),
    onSuccess: (q: Quote) => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      if (q.status === "PENDING_APPROVAL") toast("Presupuesto creado. Tiene más descuento del permitido: queda esperando aprobación.", { icon: "⏳", duration: 6000 });
      else toast.success("Presupuesto creado");
      resetForm();
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? "No se pudo crear"),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status, lostReason }: { id: string; status: string; lostReason?: string }) =>
      api.put(`/quotes/${id}/status`, { status, lostReason }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
    onError: (e: any) => toast.error(e.response?.data?.error ?? "No se pudo cambiar el estado"),
  });

  const aprobarMut = useMutation({
    mutationFn: (id: string) => api.post(`/quotes/${id}/aprobar`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["quotes"] }); toast.success("Descuento aprobado"); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? "No se pudo aprobar"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/quotes/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["quotes"] }); toast.success("Presupuesto eliminado"); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? "No se pudo eliminar"),
  });

  const notesMut = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      api.put(`/quotes/${id}/notes`, { notes }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["quotes"] }); toast.success("Nota guardada"); },
  });

  const navigate = useNavigate();
  const convertMut = useMutation({
    mutationFn: async (q: Quote) => {
      await api.post("/fichas", {
        clientName: q.client?.name || "Cliente",
        clientPhone: q.client?.phone || undefined,
        items: q.items.map((i) => ({ cantidad: i.quantity, producto: i.product?.name ?? "" })),
        total: Number(q.totalAmount),
        deposit: 0,
        observations: q.notes || undefined,
      });
      // el presupuesto se convierte en ficha: lo sacamos de Presupuestos
      await api.delete(`/quotes/${q.id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fichas"] });
      qc.invalidateQueries({ queryKey: ["quotes"] });
      toast.success("Convertido a ficha de pedido ✓");
      navigate("/fichas");
    },
  });

  const resetForm = () => { setShowCreate(false); setClientId(""); setNotes(""); setValidDays(15); setCashDiscount(15); setInstallments(6); setItems([]); };

  const addItem = () => setItems([...items, { productId: "", quantity: 1, unitPrice: 0, notes: "" }]);
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

  /** % que se le está bajando al precio de lista (0 si no hay descuento). */
  const descuentoDe = (item: { productId: string; unitPrice: number }) => {
    const lista = Number(products.find((p) => p.id === item.productId)?.sellPrice ?? 0);
    if (!lista || item.unitPrice >= lista) return 0;
    return ((lista - item.unitPrice) / lista) * 100;
  };
  const tope = config?.maxDiscount ?? 10;
  const offEstandar = config?.cashDiscountStd ?? 15;
  const pasaTope = !esDueño && (items.some((i) => descuentoDe(i) > tope + 0.01) || cashDiscount > offEstandar);

  const total = items.reduce((acc, i) => acc + i.quantity * i.unitPrice, 0);

  const filtered = quotes.filter((q) =>
    q.quoteNumber.toLowerCase().includes(search.toLowerCase()) ||
    q.client?.name.toLowerCase().includes(search.toLowerCase()) ||
    q.seller?.name.toLowerCase().includes(search.toLowerCase())
  );

  const ganados = quotes.filter((q) => q.status === "ACCEPTED").length;
  const perdidos = quotes.filter((q) => q.status === "REJECTED").length;
  const tasaCierre = ganados + perdidos > 0 ? Math.round((ganados / (ganados + perdidos)) * 100) : null;
  const paraSeguir = quotes.filter((q) =>
    (q.status === "SENT" || q.status === "NEGOTIATING") && diasDesde(q.sentAt ?? q.createdAt) >= DIAS_PARA_SEGUIR
  ).length;

  const downloadPDF = (id: string) => {
    const token = localStorage.getItem("token");
    window.open(`${api.defaults.baseURL}/quotes/${id}/pdf?token=${token}`, "_blank");
  };

  const cambiarEstado = (q: Quote, status: string) => {
    if (status === "REJECTED") { setPerdido(q); return; }
    statusMut.mutate({ id: q.id, status });
  };

  const mensajeSeguimiento = (q: Quote) => {
    const nombre = q.client?.name?.split(" ")[0] ?? "";
    return `Hola${nombre ? ` ${nombre}` : ""}! Te escribo por el presupuesto ${q.quoteNumber} de The Promise Machine. ` +
           `¿Pudiste verlo? Si tenés alguna duda o querés ajustar algo, avisame.`;
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText size={24} className="text-gray-200" /> {esDueño ? "Presupuestos" : "Mis presupuestos"}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {quotes.length} presupuestos
            {tasaCierre !== null && <> · cierre {tasaCierre}%</>}
            {paraSeguir > 0 && <span className="text-yellow-400"> · {paraSeguir} para volver a escribir</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {esDueño && (
            <button onClick={() => setVerTope(true)} title="Tope de descuento de los vendedores"
              className="flex items-center gap-2 border border-gray-700 hover:border-gray-500 text-gray-300 px-3 py-2 rounded-lg text-sm transition-colors">
              <Settings2 size={15} /> <span className="hidden sm:inline">Tope {tope}%</span>
            </button>
          )}
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-white hover:bg-gray-200 text-gray-950 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> <span className="hidden sm:inline">Nuevo presupuesto</span><span className="sm:hidden">Nuevo</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          const count = quotes.filter((q) => q.status === key).length;
          return (
            <div key={key} className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${cfg.color}`}><Icon size={15} /></div>
              <div className="min-w-0">
                <p className="text-[11px] text-gray-500 truncate">{cfg.label}</p>
                <p className="text-lg font-bold text-white">{count}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={esDueño ? "Buscar por número, cliente o vendedor..." : "Buscar por número o cliente..."}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gray-400" />
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
            const cfg = STATUS_CONFIG[q.status] ?? STATUS_CONFIG.DRAFT;
            const Icon = cfg.icon;
            const isExpanded = expandedId === q.id;
            const pendiente = q.status === "PENDING_APPROVAL";
            const cerrado = !!q.saleId;
            const enSeguimiento = q.status === "SENT" || q.status === "NEGOTIATING";
            const dias = enSeguimiento ? diasDesde(q.sentAt ?? q.createdAt) : 0;
            const wa = waLink(q.client?.phone, mensajeSeguimiento(q));
            // las del vendedor se cierran con "Ganado" para que no pierda la comisión
            const abierto = ["DRAFT", "SENT", "NEGOTIATING"].includes(q.status);
            const puedeGanar = !cerrado && abierto && (esDueño ? !!q.seller : true);
            const puedeCambiarEstado = !cerrado && (esDueño || !pendiente);

            return (
              <div key={q.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                {/* Row */}
                <div className="flex flex-col xl:flex-row xl:items-center gap-3 xl:gap-4 px-4 py-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button onClick={() => setExpandedId(isExpanded ? null : q.id)}
                      className="text-gray-500 hover:text-gray-300 transition-colors">
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 items-center min-w-0">
                      <div>
                        <p className="font-mono font-semibold text-white text-sm">{q.quoteNumber}</p>
                        <p className="text-xs text-gray-500">{dateShort(q.createdAt)}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-gray-300 truncate">{q.client?.name ?? <span className="text-gray-600 italic">Sin cliente</span>}</p>
                        <p className="text-xs text-gray-600">
                          {q.items.length} producto{q.items.length !== 1 ? "s" : ""}
                          {esDueño && q.seller && <> · de {q.seller.name}</>}
                        </p>
                      </div>
                      <div className="md:text-right">
                        <p className="font-semibold text-white">{currency(Number(q.totalAmount))}</p>
                        <p className="text-xs text-gray-600">Válido {q.validDays} días</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                          <Icon size={11} />{cfg.label}
                        </span>
                        {enSeguimiento && dias >= DIAS_PARA_SEGUIR && (
                          <span className="text-[11px] text-yellow-400">Hace {dias} días sin respuesta</span>
                        )}
                        {q.status === "REJECTED" && q.lostReason && (
                          <span className="text-[11px] text-gray-500">{q.lostReason}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center flex-wrap justify-end gap-1 flex-shrink-0">
                    {esDueño && pendiente && (
                      <button onClick={() => aprobarMut.mutate(q.id)} disabled={aprobarMut.isPending}
                        title="Aprobar el descuento"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-300 hover:bg-orange-200 text-gray-950 rounded-lg text-xs font-semibold transition-colors">
                        <ShieldAlert size={13} /> Aprobar
                      </button>
                    )}
                    {puedeGanar && (
                      <button onClick={() => setGanado(q)}
                        title="El cliente aceptó: crea la venta y manda el pedido a producción"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-200 text-gray-950 rounded-lg text-xs font-semibold transition-colors">
                        <Trophy size={13} /> Ganado
                      </button>
                    )}
                    {esDueño && !q.seller && !cerrado && (
                      <button onClick={() => { if (confirm(`¿Convertir ${q.quoteNumber} en una ficha de pedido?`)) convertMut.mutate(q); }}
                        title="Convertir en ficha de pedido"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-200 text-gray-950 rounded-lg text-xs font-semibold transition-colors">
                        <ClipboardList size={13} /> A ficha
                      </button>
                    )}
                    {wa && !cerrado && (
                      <a href={wa} target="_blank" rel="noopener noreferrer" title="Escribirle por WhatsApp"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700/50 hover:bg-gray-700 text-gray-200 rounded-lg text-xs font-medium transition-colors">
                        <MessageCircle size={13} /> <span className="hidden sm:inline">WhatsApp</span>
                      </a>
                    )}
                    <button onClick={() => downloadPDF(q.id)} disabled={!esDueño && pendiente}
                      title={!esDueño && pendiente ? "Se habilita cuando el dueño apruebe el descuento" : "Descargar PDF"}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700/50 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 rounded-lg text-xs font-medium transition-colors">
                      <Download size={13} /> PDF
                    </button>
                    {puedeCambiarEstado ? (
                      <select value={ESTADOS_ELEGIBLES.includes(q.status) ? q.status : ""}
                        onChange={(e) => cambiarEstado(q, e.target.value)}
                        className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-gray-400">
                        {!ESTADOS_ELEGIBLES.includes(q.status) && <option value="" disabled>{cfg.label}</option>}
                        {ESTADOS_ELEGIBLES.map((s) => (
                          <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                        ))}
                      </select>
                    ) : null}
                    {(esDueño || !cerrado) && (
                      <button onClick={() => { if (confirm("¿Eliminar presupuesto?")) deleteMut.mutate(q.id); }}
                        className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded items */}
                {isExpanded && (
                  <div className="border-t border-gray-800 px-4 py-3 bg-gray-950">
                    {pendiente && (
                      <p className="text-xs text-orange-300 mb-3">
                        {esDueño
                          ? `Tiene más descuento del permitido (tope ${tope}% sobre lista, ${offEstandar}% OFF en efectivo). Este tiene ${Number(q.cashDiscount ?? 0)}% OFF en efectivo. Revisalo y aprobalo para que se pueda mandar.`
                          : "Tiene más descuento del permitido. Cuando el dueño lo apruebe vas a poder descargar el PDF y mandarlo."}
                      </p>
                    )}
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
                            <td className="py-1.5 text-gray-300">
                              {item.product?.name ?? item.productId}
                              {item.notes && <p className="text-xs text-gray-500 italic">{item.notes}</p>}
                            </td>
                            <td className="py-1.5 text-right text-gray-400">{item.quantity}</td>
                            <td className="py-1.5 text-right text-gray-400">{currency(Number(item.unitPrice))}</td>
                            <td className="py-1.5 text-right text-white font-medium">{currency(Number(item.subtotal))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {/* Notas editables (modificaciones) */}
                    <div className="mt-3 border-t border-gray-800 pt-3">
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Notas / modificaciones</label>
                      <textarea
                        value={editNotes[q.id] ?? q.notes ?? ""}
                        onChange={(e) => setEditNotes({ ...editNotes, [q.id]: e.target.value })}
                        rows={2}
                        placeholder="Escribí una modificación, condición o aclaración para este presupuesto..."
                        className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gray-400 resize-none"
                      />
                      <div className="flex justify-end mt-2">
                        <button
                          onClick={() => notesMut.mutate({ id: q.id, notes: editNotes[q.id] ?? q.notes ?? "" })}
                          disabled={notesMut.isPending || (editNotes[q.id] ?? q.notes ?? "") === (q.notes ?? "")}
                          className="px-3 py-1.5 bg-white hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed text-gray-950 rounded-lg text-xs font-semibold transition-colors"
                        >
                          {notesMut.isPending ? "Guardando..." : "Guardar nota"}
                        </button>
                      </div>
                    </div>
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
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-gray-400">
                    <option value="">— Sin cliente —</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Validez (días)</label>
                  <input type="number" value={validDays} onChange={(e) => setValidDays(Number(e.target.value))} min={1}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-gray-400" />
                </div>
              </div>

              {/* Formas de pago */}
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Formas de pago (salen en el PDF)</label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-gray-500 mb-1 block">% OFF efectivo / transferencia</label>
                    <input type="number" value={cashDiscount} onChange={(e) => setCashDiscount(Number(e.target.value))} min={0} max={90}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-gray-400" />
                    {!esDueño && cashDiscount > offEstandar && (
                      <p className="text-[11px] text-orange-300 mt-1">Más de {offEstandar}%: lo tiene que aprobar el dueño</p>
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 mb-1 block">Cuotas sin interés</label>
                    <select value={installments} onChange={(e) => setInstallments(Number(e.target.value))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-gray-400">
                      <option value={1}>Sin cuotas</option>
                      <option value={3}>Hasta 3 cuotas</option>
                      <option value={6}>Hasta 6 cuotas</option>
                      <option value={12}>Hasta 12 cuotas</option>
                    </select>
                  </div>
                </div>

                {/* Preview de lo que verá el cliente */}
                {total > 0 && (cashDiscount > 0 || installments > 1) && (
                  <div className="mt-3 space-y-1.5">
                    {cashDiscount > 0 && (
                      <div className="flex items-center justify-between bg-white text-gray-950 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-sm font-bold">Efectivo o transferencia</p>
                          <p className="text-[11px] opacity-70">{cashDiscount}% OFF · ahorra {currency(total * cashDiscount / 100)}</p>
                        </div>
                        <span className="text-base font-bold">{currency(total * (1 - cashDiscount / 100))}</span>
                      </div>
                    )}
                    {installments > 1 && (installments >= 6 ? [3, installments] : [installments]).map((n) => (
                      <div key={n} className="flex items-center justify-between bg-gray-800/60 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-gray-200">{n} cuotas sin interés</p>
                          <p className="text-[11px] text-gray-500">{n} × {currency(total / n)}</p>
                        </div>
                        <span className="text-sm font-medium text-gray-300">{currency(total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-gray-400">Productos *</label>
                  <button onClick={addItem} className="text-xs text-gray-200 hover:text-blue-300 flex items-center gap-1">
                    <Plus size={12} /> Agregar producto
                  </button>
                </div>
                <div className="space-y-2">
                  {items.map((item, i) => {
                    const desc = descuentoDe(item);
                    return (
                      <div key={i} className="bg-gray-800/30 rounded-lg p-2 space-y-2">
                        <div className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-12 sm:col-span-5">
                            <select value={item.productId}
                              onChange={(e) => updateItem(i, "productId", e.target.value)}
                              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-gray-400">
                              <option value="">Seleccionar...</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-3 sm:col-span-2">
                            <input type="number" value={item.quantity} min={1}
                              onChange={(e) => updateItem(i, "quantity", Number(e.target.value))}
                              placeholder="Cant."
                              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-gray-400" />
                          </div>
                          <div className="col-span-8 sm:col-span-4">
                            <input type="number" value={item.unitPrice}
                              onChange={(e) => updateItem(i, "unitPrice", Number(e.target.value))}
                              placeholder="Precio"
                              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-gray-400" />
                          </div>
                          <div className="col-span-1 flex justify-center">
                            <button onClick={() => removeItem(i)} className="text-gray-600 hover:text-red-400 transition-colors">
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                        {desc > 0.01 && (
                          <p className={`text-[11px] ${!esDueño && desc > tope + 0.01 ? "text-orange-300" : "text-gray-500"}`}>
                            {Math.round(desc)}% menos que el precio de lista
                            {!esDueño && desc > tope + 0.01 && ` · pasa el tope de ${tope}%: lo tiene que aprobar el dueño`}
                          </p>
                        )}
                        {/* Observación de este producto en particular */}
                        <input value={item.notes ?? ""}
                          onChange={(e) => updateItem(i, "notes", e.target.value)}
                          placeholder="Observación de este producto (ej: en negro mate, con tapizado rojo...)"
                          className="w-full bg-gray-800/60 border border-gray-700/60 rounded-lg px-3 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-500" />
                      </div>
                    );
                  })}
                  {items.length === 0 && (
                    <div className="py-6 text-center text-sm text-gray-600 border border-dashed border-gray-800 rounded-lg">
                      Hacé click en "Agregar producto" para comenzar
                    </div>
                  )}
                </div>
              </div>

              {/* Total preview */}
              {items.length > 0 && (
                <div className="bg-gray-800/60 border border-gray-700 rounded-lg px-4 py-3 flex justify-between items-center">
                  <span className="text-sm text-gray-400">Total presupuesto</span>
                  <span className="text-xl font-bold text-white">{currency(total)}</span>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Notas / condiciones</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  placeholder="Ej: Precio no incluye flete. Entrega en 15 días hábiles."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-gray-400 resize-none" />
              </div>
            </div>

            <div className="px-6 pb-6 pt-2 border-t border-gray-800">
              {pasaTope && (
                <p className="text-xs text-orange-300 mb-2">
                  Este presupuesto va a quedar esperando la aprobación del dueño antes de poder mandarlo.
                </p>
              )}
              <div className="flex gap-3">
                <button onClick={resetForm} className="flex-1 py-2 border border-gray-700 text-gray-400 hover:text-white rounded-lg text-sm transition-colors">Cancelar</button>
                <button onClick={() => createMut.mutate()}
                  disabled={items.length === 0 || items.some((i) => !i.productId) || createMut.isPending}
                  className="flex-1 py-2 bg-white hover:bg-gray-200 disabled:opacity-50 text-gray-950 rounded-lg text-sm font-medium transition-colors">
                  {createMut.isPending ? "Creando..." : pasaTope ? "Crear y pedir aprobación" : "Crear presupuesto"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {ganado && <ModalGanado quote={ganado} onClose={() => setGanado(null)} />}
      {perdido && (
        <ModalPerdido
          quote={perdido}
          onClose={() => setPerdido(null)}
          onConfirm={(motivo) => {
            statusMut.mutate({ id: perdido.id, status: "REJECTED", lostReason: motivo });
            setPerdido(null);
          }}
        />
      )}
      {verTope && <ModalTope actual={tope} offEstandar={offEstandar} onClose={() => setVerTope(false)} />}
    </div>
  );
}

/* ─── Presupuesto ganado: crea la venta y el pedido ─── */
function ModalGanado({ quote, onClose }: { quote: Quote; onClose: () => void }) {
  const qc = useQueryClient();
  const [metodo, setMetodo] = useState("TRANSFER");
  const [cobrado, setCobrado] = useState("");

  const conOff = metodo === "CASH" || metodo === "TRANSFER";
  const off = Number(quote.cashDiscount ?? 0);
  const total = quote.items.reduce(
    (a, i) => a + Math.round(Number(i.unitPrice) * (conOff ? 1 - off / 100 : 1)) * i.quantity, 0
  );
  const pagado = Number(cobrado || 0);

  const crear = useMutation({
    mutationFn: () => api.post(`/quotes/${quote.id}/venta`, { paymentMethod: metodo, cobrado: pagado }).then((r) => r.data),
    onSuccess: (r: { saleNumber: string; fichaNumber: string }) => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["fichas"] });
      toast.success(`Venta ${r.saleNumber} creada y pedido ${r.fichaNumber} enviado a producción`, { duration: 5000 });
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? "No se pudo crear la venta"),
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-white flex items-center gap-2"><Trophy size={16} /> ¡Presupuesto ganado!</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          {quote.quoteNumber}{quote.client ? ` · ${quote.client.name}` : ""}. Se crea la venta y el pedido pasa a producción.
        </p>

        <label className="label">¿Cómo paga?</label>
        <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className="input">
          <option value="TRANSFER">Transferencia{off > 0 ? ` (${off}% OFF)` : ""}</option>
          <option value="CASH">Efectivo{off > 0 ? ` (${off}% OFF)` : ""}</option>
          <option value="INSTALLMENTS">Tarjeta en cuotas</option>
          <option value="OTHER">Otro</option>
        </select>

        <label className="label mt-3">¿Cuánto pagó ya? (seña o total)</label>
        <input type="number" min={0} max={total} className="input" placeholder="0"
          value={cobrado} onChange={(e) => setCobrado(e.target.value)} />
        <div className="flex gap-2 mt-2">
          <button onClick={() => setCobrado(String(Math.round(total / 2)))} className="text-[11px] text-gray-400 hover:text-white border border-gray-700 rounded px-2 py-0.5">50%</button>
          <button onClick={() => setCobrado(String(total))} className="text-[11px] text-gray-400 hover:text-white border border-gray-700 rounded px-2 py-0.5">Todo</button>
        </div>

        <div className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-gray-400">Total de la venta</span><span className="text-white font-semibold">{currency(total)}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Queda por cobrar</span><span className={total - pagado > 0 ? "text-yellow-400" : "text-green-400"}>{currency(Math.max(total - pagado, 0))}</span></div>
        </div>
        {pagado > total && <p className="text-xs text-red-400 mt-2">Lo cobrado no puede superar el total.</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={() => crear.mutate()} disabled={crear.isPending || pagado > total || pagado < 0}
            className="btn-primary flex-1 disabled:opacity-40">
            {crear.isPending ? "Creando..." : "Crear venta"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Presupuesto perdido: por qué se cayó ─── */
function ModalPerdido({ quote, onClose, onConfirm }: { quote: Quote; onClose: () => void; onConfirm: (motivo: string) => void }) {
  const [motivo, setMotivo] = useState("");
  const [otro, setOtro] = useState("");
  const final = motivo === "Otro" ? otro.trim() : motivo;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-white flex items-center gap-2"><XCircle size={16} /> Presupuesto perdido</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>
        <p className="text-xs text-gray-500 mb-4">{quote.quoteNumber}. ¿Por qué no se cerró? Sirve para ver qué ajustar.</p>
        <div className="flex flex-wrap gap-2">
          {[...MOTIVOS_PERDIDA, "Otro"].map((m) => (
            <button key={m} onClick={() => setMotivo(m)}
              className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${motivo === m ? "bg-white text-gray-950 border-white" : "border-gray-700 text-gray-300 hover:border-gray-500"}`}>
              {m}
            </button>
          ))}
        </div>
        {motivo === "Otro" && (
          <input autoFocus className="input mt-3" placeholder="Contá qué pasó" maxLength={200}
            value={otro} onChange={(e) => setOtro(e.target.value)} />
        )}
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={() => onConfirm(final)} disabled={!final} className="btn-primary flex-1 disabled:opacity-40">
            Marcar perdido
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Tope de descuento de los vendedores (sólo el dueño) ─── */
function ModalTope({ actual, offEstandar, onClose }: { actual: number; offEstandar: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [valor, setValor] = useState("");

  const guardar = useMutation({
    mutationFn: () => api.put("/quotes/config", { maxDiscount: Number(valor) }),
    onSuccess: () => {
      toast.success("Tope actualizado");
      qc.invalidateQueries({ queryKey: ["quote-config"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? "No se pudo guardar"),
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white flex items-center gap-2"><Settings2 size={16} /> Tope de descuento</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>
        <label className="label">Cuánto puede bajar un vendedor el precio de lista</label>
        <div className="flex items-center gap-2">
          <input type="number" step="1" min="0" max="100" className="input"
            placeholder={String(actual)} value={valor} onChange={(e) => setValor(e.target.value)} />
          <span className="text-gray-400">%</span>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Actual: {actual}%. Si se pasa, o si pone más de {offEstandar}% OFF en efectivo, el presupuesto
          queda esperando tu aprobación y no puede descargar el PDF hasta que lo apruebes.
        </p>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={() => guardar.mutate()} disabled={valor === "" || guardar.isPending} className="btn-primary flex-1 disabled:opacity-40">
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
