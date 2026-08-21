import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  StickyNote, Trash2, RotateCcw, Plus, Check, Loader2, AlertTriangle,
} from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import { dateShort } from "../lib/format";
import { Skeleton } from "../components/Skeleton";

interface Note { id: string; content: string; done: boolean; createdAt: string; }
interface TrashItem { kind: string; id: string; titulo: string; detalle: string; deletedAt: string; }

const KIND_LABEL: Record<string, string> = {
  sale: "Venta", quote: "Presupuesto", ficha: "Ficha", client: "Cliente", expense: "Gasto",
};

export default function Utilidades() {
  const qc = useQueryClient();
  const [newNote, setNewNote] = useState("");

  const { data: notes = [], isLoading: loadingNotes } = useQuery<Note[]>({
    queryKey: ["notes"],
    queryFn: () => api.get("/extras/notes").then((r) => r.data),
  });
  const { data: trash = [], isLoading: loadingTrash } = useQuery<TrashItem[]>({
    queryKey: ["trash"],
    queryFn: () => api.get("/extras/trash").then((r) => r.data),
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["trash"] });
    ["sales", "quotes", "fichas", "clients", "expenses", "dashboard"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] })
    );
  };

  const addNote = useMutation({
    mutationFn: () => api.post("/extras/notes", { content: newNote }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notes"] }); setNewNote(""); },
  });
  const toggleNote = useMutation({
    mutationFn: (n: Note) => api.put(`/extras/notes/${n.id}`, { done: !n.done }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes"] }),
  });
  const delNote = useMutation({
    mutationFn: (id: string) => api.delete(`/extras/notes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes"] }),
  });

  const restore = useMutation({
    mutationFn: (t: TrashItem) => api.post(`/extras/trash/${t.kind}/${t.id}/restore`, {}),
    onSuccess: () => { refreshAll(); toast.success("Restaurado ✓"); },
  });
  const purge = useMutation({
    mutationFn: (t: TrashItem) => api.delete(`/extras/trash/${t.kind}/${t.id}`),
    onSuccess: () => { refreshAll(); toast.success("Eliminado definitivamente"); },
  });

  const pendientes = notes.filter((n) => !n.done);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><StickyNote size={24} /> Notas y papelera</h1>
        <p className="text-gray-400 text-sm mt-1">Tus pendientes y lo que borraste en los últimos 30 días</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Notas */}
        <div className="card p-5 space-y-4">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <StickyNote size={16} /> Pendientes
            {pendientes.length > 0 && <span className="text-xs text-gray-500">({pendientes.length})</span>}
          </h3>

          <div className="flex gap-2">
            <input value={newNote} onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newNote.trim()) addNote.mutate(); }}
              className="input" placeholder="Ej: llamar a Juan el martes" />
            <button onClick={() => newNote.trim() && addNote.mutate()} disabled={!newNote.trim() || addNote.isPending}
              className="btn-primary">
              {addNote.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            </button>
          </div>

          <div className="space-y-1.5 max-h-[380px] overflow-y-auto">
            {loadingNotes ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
            ) : notes.length === 0 ? (
              <p className="text-sm text-gray-600 text-center py-8">Sin notas. Anotá lo que no querés olvidarte.</p>
            ) : notes.map((n) => (
              <div key={n.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${n.done ? "bg-gray-800/30" : "bg-gray-800/60"}`}>
                <button onClick={() => toggleNote.mutate(n)}
                  className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                    n.done ? "bg-green-500/20 border-green-500/50 text-green-400" : "border-gray-600 hover:border-gray-400"
                  }`}>
                  {n.done && <Check size={12} />}
                </button>
                <span className={`flex-1 text-sm ${n.done ? "text-gray-500 line-through" : "text-gray-200"}`}>{n.content}</span>
                <button onClick={() => delNote.mutate(n.id)} className="text-gray-600 hover:text-red-400 flex-shrink-0">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Papelera */}
        <div className="card p-5 space-y-4">
          <div>
            <h3 className="text-white font-semibold flex items-center gap-2">
              <Trash2 size={16} /> Papelera
              {trash.length > 0 && <span className="text-xs text-gray-500">({trash.length})</span>}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Lo borrado se guarda 30 días</p>
          </div>

          <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
            {loadingTrash ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : trash.length === 0 ? (
              <p className="text-sm text-gray-600 text-center py-8">La papelera está vacía</p>
            ) : trash.map((t) => (
              <div key={`${t.kind}-${t.id}`} className="flex items-center gap-3 bg-gray-800/50 rounded-lg px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-100 truncate">
                    <span className="text-[10px] uppercase tracking-wide text-gray-500 mr-1.5">{KIND_LABEL[t.kind] ?? t.kind}</span>
                    {t.titulo}
                  </p>
                  <p className="text-xs text-gray-500">{t.detalle} · borrado {dateShort(t.deletedAt)}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => restore.mutate(t)} title="Restaurar"
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-400 hover:bg-green-500/10 rounded-lg transition-colors">
                    <RotateCcw size={12} /> Restaurar
                  </button>
                  <button
                    onClick={() => { if (confirm(`¿Eliminar "${t.titulo}" para siempre? Esta acción no se puede deshacer.`)) purge.mutate(t); }}
                    title="Eliminar definitivamente"
                    className="p-1.5 text-gray-600 hover:text-red-400 rounded-lg transition-colors">
                    <AlertTriangle size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
