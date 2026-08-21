import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Factory, ChevronLeft, User, Search, AlertTriangle, Clock, Check, Download,
  MessageCircle, History,
} from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import { currency, dateShort } from "../lib/format";

interface FichaItem { cantidad: number; producto: string; }
interface Ficha {
  id: string; fichaNumber: string; clientName: string; clientPhone?: string;
  items: FichaItem[]; total: number; deposit: number; estimatedDate?: string;
  fabricatedAt?: string; packedAt?: string; deliveredAt?: string;
}

const STAGES = [
  { key: "PENDIENTE", label: "Pendiente", dot: "bg-yellow-400", next: "Marcar fabricado" },
  { key: "FABRICADO", label: "Fabricado", dot: "bg-gray-300", next: "Marcar embalado" },
  { key: "EMBALADO", label: "Embalado", dot: "bg-blue-400", next: "Marcar entregado" },
  { key: "ENTREGADO", label: "Entregado", dot: "bg-green-400", next: "" },
] as const;
type StageKey = typeof STAGES[number]["key"];

const DAY = 86400000;

function stageOf(f: Ficha): StageKey {
  if (f.deliveredAt) return "ENTREGADO";
  if (f.packedAt) return "EMBALADO";
  if (f.fabricatedAt) return "FABRICADO";
  return "PENDIENTE";
}

// Fecha desde la que la ficha está en su etapa actual
function stageSince(f: Ficha): string | undefined {
  return f.deliveredAt ?? f.packedAt ?? f.fabricatedAt;
}
function daysInStage(f: Ficha): number | null {
  const since = stageSince(f);
  if (!since) return null;
  return Math.floor((Date.now() - new Date(since).getTime()) / DAY);
}
// Días de atraso respecto a la fecha estimada (solo si no está entregada)
function daysLate(f: Ficha): number {
  if (f.deliveredAt || !f.estimatedDate) return 0;
  const diff = Math.floor((Date.now() - new Date(f.estimatedDate).getTime()) / DAY);
  return diff > 0 ? diff : 0;
}

function payloadForStage(stage: StageKey, f: Ficha): Record<string, string | null> {
  const today = new Date().toISOString().slice(0, 10);
  const fab = f.fabricatedAt ? f.fabricatedAt.slice(0, 10) : today;
  const pack = f.packedAt ? f.packedAt.slice(0, 10) : today;
  switch (stage) {
    case "PENDIENTE": return { fabricatedAt: null, packedAt: null, deliveredAt: null };
    case "FABRICADO": return { fabricatedAt: fab, packedAt: null, deliveredAt: null };
    case "EMBALADO": return { fabricatedAt: fab, packedAt: pack, deliveredAt: null };
    case "ENTREGADO": return { fabricatedAt: fab, packedAt: pack, deliveredAt: f.deliveredAt ? f.deliveredAt.slice(0, 10) : today };
  }
}

function waLink(phone: string | undefined, message: string): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (!digits.startsWith("54")) digits = "54" + digits;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export default function Produccion() {
  const qc = useQueryClient();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<StageKey | null>(null);
  const [search, setSearch] = useState("");
  const [onlyLate, setOnlyLate] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [mobileTab, setMobileTab] = useState<StageKey>("PENDIENTE");

  const { data: fichas = [], isLoading } = useQuery<Ficha[]>({
    queryKey: ["fichas"],
    queryFn: () => api.get("/fichas").then((r) => r.data),
  });

  const moveMut = useMutation({
    mutationFn: ({ f, stage }: { f: Ficha; stage: StageKey }) => api.put(`/fichas/${f.id}`, payloadForStage(stage, f)),
    onMutate: async ({ f, stage }) => {
      await qc.cancelQueries({ queryKey: ["fichas"] });
      const prev = qc.getQueryData<Ficha[]>(["fichas"]);
      qc.setQueryData<Ficha[]>(["fichas"], (old) => (old ?? []).map((x) => x.id === f.id ? { ...x, ...payloadForStage(stage, f) } : x));
      return { prev, from: stageOf(f), ficha: f };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["fichas"], ctx.prev); },
    onSuccess: (_d, vars, ctx) => {
      const label = STAGES.find((s) => s.key === vars.stage)?.label ?? "";
      const from = ctx?.from;
      toast.success(
        (t) => (
          <span className="flex items-center gap-3">
            {vars.f.fichaNumber} → {label}
            {from && (
              <button
                onClick={() => { moveMut.mutate({ f: { ...vars.f, ...payloadForStage(vars.stage, vars.f) } as Ficha, stage: from }); toast.dismiss(t.id); }}
                className="text-xs font-semibold underline text-gray-300 hover:text-white"
              >
                Deshacer
              </button>
            )}
          </span>
        ),
        { duration: 4000 }
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["fichas"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  function move(f: Ficha, stage: StageKey) {
    if (stageOf(f) === stage) return;
    moveMut.mutate({ f, stage });
  }
  function advance(f: Ficha) {
    const idx = STAGES.findIndex((s) => s.key === stageOf(f));
    const next = STAGES[idx + 1];
    if (next) move(f, next.key);
  }
  function back(f: Ficha) {
    const idx = STAGES.findIndex((s) => s.key === stageOf(f));
    const prev = STAGES[idx - 1];
    if (prev) move(f, prev.key);
  }
  function openPDF(id: string) {
    const token = localStorage.getItem("token");
    window.open(`${api.defaults.baseURL}/fichas/${id}/pdf?token=${token}`, "_blank");
  }
  function avisarEntrega(f: Ficha) {
    const link = waLink(f.clientPhone, `¡Hola ${f.clientName}! Te avisamos de The Promise Machine que tu pedido ${f.fichaNumber} ya está entregado. ¡Gracias por la compra! 💪`);
    if (link) window.open(link, "_blank");
  }

  // Filtro de búsqueda / atrasados
  const matches = (f: Ficha) => {
    const q = search.toLowerCase();
    const okSearch = !q || f.clientName.toLowerCase().includes(q) || f.fichaNumber.toLowerCase().includes(q) ||
      (f.items ?? []).some((i) => i.producto.toLowerCase().includes(q));
    const okLate = !onlyLate || daysLate(f) > 0;
    return okSearch && okLate;
  };

  // Tarjetas por columna: urgentes primero; Entregado solo últimos 7 días (salvo historial)
  function cardsFor(stage: StageKey): Ficha[] {
    let list = fichas.filter((f) => stageOf(f) === stage && matches(f));
    if (stage === "ENTREGADO" && !showHistory) {
      list = list.filter((f) => Date.now() - new Date(f.deliveredAt!).getTime() <= 7 * DAY);
    }
    return list.sort((a, b) => {
      if (stage === "ENTREGADO") {
        return new Date(b.deliveredAt!).getTime() - new Date(a.deliveredAt!).getTime(); // más reciente primero
      }
      const la = daysLate(a), lb = daysLate(b);
      if (la !== lb) return lb - la;                                  // más atrasado primero
      const ea = a.estimatedDate ? new Date(a.estimatedDate).getTime() : Infinity;
      const eb = b.estimatedDate ? new Date(b.estimatedDate).getTime() : Infinity;
      return ea - eb;                                                 // entrega más próxima primero
    });
  }

  const enProduccion = fichas.filter((f) => !f.deliveredAt);
  const atrasados = enProduccion.filter((f) => daysLate(f) > 0);
  const entregados = fichas.filter((f) => f.deliveredAt);
  const entregadosOcultos = entregados.filter((f) => Date.now() - new Date(f.deliveredAt!).getTime() > 7 * DAY).length;

  // ── Tarjeta ──────────────────────────────────────────────
  function Card({ f, stage }: { f: Ficha; stage: StageKey }) {
    const idx = STAGES.findIndex((s) => s.key === stage);
    const saldo = Number(f.total) - Number(f.deposit);
    const late = daysLate(f);
    const inStage = daysInStage(f);
    const nextLabel = STAGES[idx].next;

    return (
      <div
        draggable
        onDragStart={() => setDragId(f.id)}
        onDragEnd={() => { setDragId(null); setOverCol(null); }}
        className={`bg-gray-900 border rounded-lg p-3 cursor-grab active:cursor-grabbing transition-colors ${
          late > 0 ? "border-red-500/50 hover:border-red-500" : "border-gray-800 hover:border-gray-700"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => openPDF(f.id)} title="Ver ficha en PDF"
            className="font-mono text-xs text-gray-400 hover:text-white flex items-center gap-1">
            {f.fichaNumber} <Download size={11} />
          </button>
          {late > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full">
              <AlertTriangle size={10} /> {late}d tarde
            </span>
          )}
        </div>

        <p className="text-sm font-medium text-white flex items-center gap-1 mt-1"><User size={11} className="text-gray-500" />{f.clientName}</p>
        {f.items?.[0] && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">
            {f.items.map((i) => `${i.cantidad}× ${i.producto}`).join(", ")}
          </p>
        )}

        <div className="flex items-center justify-between mt-2 text-xs gap-2">
          <span className={late > 0 ? "text-red-400 font-medium" : "text-gray-500"}>
            {f.estimatedDate ? `🗓 ${dateShort(f.estimatedDate)}` : ""}
          </span>
          {saldo > 0 && <span className="text-yellow-400 font-medium whitespace-nowrap">Saldo {currency(saldo)}</span>}
        </div>

        {inStage !== null && stage !== "ENTREGADO" && (
          <p className="text-[10px] text-gray-600 mt-1 flex items-center gap-1">
            <Clock size={9} /> {inStage === 0 ? "hoy" : `hace ${inStage} día${inStage > 1 ? "s" : ""}`} en {STAGES[idx].label}
          </p>
        )}

        {/* Acciones */}
        <div className="flex items-center gap-1.5 mt-2.5">
          {idx > 0 && (
            <button onClick={() => back(f)} title="Volver a la etapa anterior"
              className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors flex-shrink-0">
              <ChevronLeft size={14} />
            </button>
          )}
          {nextLabel ? (
            <button onClick={() => advance(f)}
              className="flex-1 bg-white hover:bg-gray-200 text-gray-950 text-xs font-bold py-2 rounded-lg transition-colors">
              {nextLabel} →
            </button>
          ) : (
            <div className="flex-1 flex items-center gap-1.5">
              <span className="flex-1 flex items-center justify-center gap-1 text-xs text-green-400 font-medium py-2">
                <Check size={13} /> {f.deliveredAt ? dateShort(f.deliveredAt) : "Entregado"}
              </span>
              {f.clientPhone && (
                <button onClick={() => avisarEntrega(f)} title="Avisar al cliente por WhatsApp"
                  className="p-1.5 text-green-400 hover:bg-green-500/10 rounded-lg transition-colors">
                  <MessageCircle size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Factory size={24} /> Producción</h1>
        <p className="text-gray-400 text-sm mt-1">Avanzá cada pedido con el botón, o arrastralo entre columnas</p>
      </div>

      {/* Resumen */}
      {!isLoading && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
          <div className="card p-4">
            <p className="text-xs text-gray-500 mb-1">En producción</p>
            <p className="text-2xl font-bold text-white">{enProduccion.length}</p>
          </div>
          <button onClick={() => setOnlyLate((v) => !v)}
            className={`card p-4 text-left transition-colors ${onlyLate ? "border-red-500/60" : atrasados.length > 0 ? "border-red-500/30" : ""}`}>
            <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><AlertTriangle size={11} /> Atrasados</p>
            <p className={`text-2xl font-bold ${atrasados.length > 0 ? "text-red-400" : "text-white"}`}>{atrasados.length}</p>
          </button>
          <div className="card p-4">
            <p className="text-xs text-gray-500 mb-1">Entregados</p>
            <p className="text-2xl font-bold text-green-400">{entregados.length}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500 mb-1">Facturado (entregados)</p>
            <p className="text-xl md:text-2xl font-bold text-white">{currency(entregados.reduce((s, f) => s + Number(f.total), 0))}</p>
          </div>
        </div>
      )}

      {/* Buscador + filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente, ficha o producto..." className="input pl-9" />
        </div>
        {onlyLate && (
          <button onClick={() => setOnlyLate(false)} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
            <AlertTriangle size={12} /> Mostrando solo atrasados · quitar filtro
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="card p-12 text-center text-gray-500">Cargando...</div>
      ) : (
        <>
          {/* ── Mobile: pestañas + lista ───────────────────── */}
          <div className="md:hidden space-y-3">
            <div className="flex gap-1 bg-gray-800/60 rounded-lg p-1 overflow-x-auto">
              {STAGES.map((s) => {
                const n = cardsFor(s.key).length;
                return (
                  <button key={s.key} onClick={() => setMobileTab(s.key)}
                    className={`flex-1 whitespace-nowrap px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      mobileTab === s.key ? "bg-white text-gray-950" : "text-gray-400"
                    }`}>
                    {s.label} {n > 0 && <span className="opacity-60">({n})</span>}
                  </button>
                );
              })}
            </div>
            <div className="space-y-2">
              {cardsFor(mobileTab).map((f) => <Card key={f.id} f={f} stage={mobileTab} />)}
              {cardsFor(mobileTab).length === 0 && (
                <p className="text-sm text-gray-600 text-center py-10">Sin pedidos en esta etapa</p>
              )}
            </div>
          </div>

          {/* ── Desktop: kanban ────────────────────────────── */}
          <div className="hidden md:grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            {STAGES.map((col) => {
              const cards = cardsFor(col.key);
              return (
                <div
                  key={col.key}
                  onDragOver={(e) => { e.preventDefault(); setOverCol(col.key); }}
                  onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
                  onDrop={() => { const f = fichas.find((x) => x.id === dragId); if (f) move(f, col.key); setDragId(null); setOverCol(null); }}
                  className={`rounded-xl border p-3 min-h-[200px] transition-colors ${overCol === col.key ? "border-gray-500 bg-gray-800/40" : "border-gray-800 bg-gray-900/40"}`}
                >
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                      <span className="text-sm font-semibold text-gray-200">{col.label}</span>
                    </div>
                    <span className="text-xs text-gray-500">{cards.length}</span>
                  </div>

                  <div className="space-y-2">
                    {cards.map((f) => <Card key={f.id} f={f} stage={col.key} />)}
                    {cards.length === 0 && <p className="text-xs text-gray-600 text-center py-6">Sin fichas</p>}

                    {/* Historial de entregados */}
                    {col.key === "ENTREGADO" && entregadosOcultos > 0 && (
                      <button onClick={() => setShowHistory((v) => !v)}
                        className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 py-2 transition-colors">
                        <History size={12} />
                        {showHistory ? "Ocultar historial" : `Ver historial (${entregadosOcultos} anteriores)`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
