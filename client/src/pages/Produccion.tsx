import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Factory, ChevronLeft, ChevronRight, User } from "lucide-react";
import { api } from "../lib/api";
import { currency, dateShort } from "../lib/format";

interface FichaItem { cantidad: number; producto: string; }
interface Ficha {
  id: string; fichaNumber: string; clientName: string;
  items: FichaItem[]; total: number; deposit: number; estimatedDate?: string;
  fabricatedAt?: string; packedAt?: string; deliveredAt?: string;
}

const STAGES = [
  { key: "PENDIENTE", label: "Pendiente", dot: "bg-yellow-400" },
  { key: "FABRICADO", label: "Fabricado", dot: "bg-gray-300" },
  { key: "EMBALADO", label: "Embalado", dot: "bg-blue-400" },
  { key: "ENTREGADO", label: "Entregado", dot: "bg-green-400" },
] as const;
type StageKey = typeof STAGES[number]["key"];

function stageOf(f: Ficha): StageKey {
  if (f.deliveredAt) return "ENTREGADO";
  if (f.packedAt) return "EMBALADO";
  if (f.fabricatedAt) return "FABRICADO";
  return "PENDIENTE";
}

// Payload de fechas para dejar la ficha en un estado dado
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

export default function Produccion() {
  const qc = useQueryClient();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<StageKey | null>(null);

  const { data: fichas = [], isLoading } = useQuery<Ficha[]>({
    queryKey: ["fichas"],
    queryFn: () => api.get("/fichas").then((r) => r.data),
  });

  const moveMut = useMutation({
    mutationFn: ({ f, stage }: { f: Ficha; stage: StageKey }) => api.put(`/fichas/${f.id}`, payloadForStage(stage, f)),
    onMutate: async ({ f, stage }) => {
      await qc.cancelQueries({ queryKey: ["fichas"] });
      const prev = qc.getQueryData<Ficha[]>(["fichas"]);
      // update optimista
      qc.setQueryData<Ficha[]>(["fichas"], (old) => (old ?? []).map((x) => x.id === f.id ? { ...x, ...payloadForStage(stage, f) } : x));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["fichas"], ctx.prev); },
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
  function shift(f: Ficha, dir: -1 | 1) {
    const idx = STAGES.findIndex((s) => s.key === stageOf(f));
    const next = STAGES[idx + dir];
    if (next) move(f, next.key);
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Factory size={24} /> Producción</h1>
        <p className="text-gray-400 text-sm mt-1">Arrastrá las fichas entre columnas para ir marcando el avance del taller</p>
      </div>

      {/* Resumen */}
      {!isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="card p-4">
            <p className="text-xs text-gray-500 mb-1">En producción</p>
            <p className="text-2xl font-bold text-white">{fichas.filter((f) => !f.deliveredAt).length}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500 mb-1">Entregados</p>
            <p className="text-2xl font-bold text-green-400">{fichas.filter((f) => f.deliveredAt).length}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500 mb-1">Facturado (entregados)</p>
            <p className="text-2xl font-bold text-white">{currency(fichas.filter((f) => f.deliveredAt).reduce((s, f) => s + Number(f.total), 0))}</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="card p-12 text-center text-gray-500">Cargando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {STAGES.map((col) => {
            const cards = fichas.filter((f) => stageOf(f) === col.key);
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
                  {cards.map((f) => {
                    const idx = STAGES.findIndex((s) => s.key === col.key);
                    const saldo = Number(f.total) - Number(f.deposit);
                    return (
                      <div
                        key={f.id}
                        draggable
                        onDragStart={() => setDragId(f.id)}
                        onDragEnd={() => { setDragId(null); setOverCol(null); }}
                        className="bg-gray-900 border border-gray-800 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-gray-700"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs text-gray-400">{f.fichaNumber}</span>
                          <div className="flex gap-0.5">
                            <button onClick={() => shift(f, -1)} disabled={idx === 0} className="p-0.5 text-gray-500 hover:text-white disabled:opacity-20"><ChevronLeft size={14} /></button>
                            <button onClick={() => shift(f, 1)} disabled={idx === STAGES.length - 1} className="p-0.5 text-gray-500 hover:text-white disabled:opacity-20"><ChevronRight size={14} /></button>
                          </div>
                        </div>
                        <p className="text-sm font-medium text-white flex items-center gap-1 mt-1"><User size={11} className="text-gray-500" />{f.clientName}</p>
                        {f.items?.[0] && (
                          <p className="text-xs text-gray-500 mt-1 truncate">
                            {f.items.map((i) => `${i.cantidad}× ${i.producto}`).join(", ")}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-2 text-xs">
                          {f.estimatedDate
                            ? <span className="text-gray-500">🗓 {dateShort(f.estimatedDate)}</span>
                            : <span />}
                          {saldo > 0 && <span className="text-yellow-400 font-medium">Saldo {currency(saldo)}</span>}
                        </div>
                      </div>
                    );
                  })}
                  {cards.length === 0 && <p className="text-xs text-gray-600 text-center py-6">Sin fichas</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
