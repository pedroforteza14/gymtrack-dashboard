import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wallet, Plus, X, Pencil, Trash2, TrendingUp, TrendingDown,
  ShoppingCart, Loader2, CreditCard,
} from "lucide-react";
import { api } from "../lib/api";
import { currency } from "../lib/format";

interface Expense {
  id: string;
  date: string;
  concept: string;
  amount: number;
  paymentSource: string;
  category?: string;
  notes?: string;
}

interface Summary {
  totalSales: number;
  totalExpenses: number;
  salesProfit: number;
  balance: number;
  salesCount: number;
  expensesCount: number;
  bySource: Record<string, number>;
  byCategory: Record<string, number>;
}

const SOURCES = [
  { key: "VISA", label: "Tarjeta Visa" },
  { key: "MASTER", label: "Tarjeta Master" },
  { key: "PAPA", label: "Tarjeta Papá" },
  { key: "EFECTIVO_MP", label: "Efectivo / MP" },
  { key: "OTRO", label: "Otro" },
];
const SOURCE_LABEL: Record<string, string> = Object.fromEntries(SOURCES.map((s) => [s.key, s.label]));

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const emptyForm = { date: new Date().toISOString().slice(0, 10), concept: "", amount: "", paymentSource: "EFECTIVO_MP", category: "", notes: "" };

export default function Expenses() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: expenses = [], isLoading } = useQuery<Expense[]>({
    queryKey: ["expenses", month],
    queryFn: () => api.get(`/expenses?month=${month}`).then((r) => r.data),
  });
  const { data: summary } = useQuery<Summary>({
    queryKey: ["expenses-summary", month],
    queryFn: () => api.get(`/expenses/summary?month=${month}`).then((r) => r.data),
  });

  const saveMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      modal === "edit" && editId
        ? api.put(`/expenses/${editId}`, payload)
        : api.post("/expenses", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expenses-summary"] });
      closeModal();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expenses-summary"] });
    },
  });

  function openCreate() { setForm({ ...emptyForm, date: new Date().toISOString().slice(0, 10) }); setEditId(null); setModal("create"); }
  function openEdit(e: Expense) {
    setForm({ date: e.date.slice(0, 10), concept: e.concept, amount: String(e.amount), paymentSource: e.paymentSource, category: e.category ?? "", notes: e.notes ?? "" });
    setEditId(e.id); setModal("edit");
  }
  function closeModal() { setModal(null); setEditId(null); setForm(emptyForm); }

  function submit() {
    saveMut.mutate({
      date: form.date,
      concept: form.concept,
      amount: Number(form.amount),
      paymentSource: form.paymentSource,
      category: form.category || undefined,
      notes: form.notes || undefined,
    });
  }

  const balance = summary?.balance ?? 0;
  const monthLabel = new Date(`${month}-02`).toLocaleDateString("es-AR", { month: "long", year: "numeric" });

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Wallet size={24} /> Gastos y balance
          </h1>
          <p className="text-gray-400 text-sm mt-1 capitalize">{monthLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="input w-auto"
          />
          <button onClick={openCreate} className="btn-primary">
            <Plus size={16} /> Nuevo gasto
          </button>
        </div>
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-green-500/10 text-green-400"><ShoppingCart size={18} /></div>
            <span className="text-gray-400 text-sm">Ventas del mes</span>
          </div>
          <p className="text-2xl font-bold text-white">{currency(summary?.totalSales ?? 0)}</p>
          <p className="text-xs text-gray-500 mt-1">{summary?.salesCount ?? 0} ventas registradas</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-red-500/10 text-red-400"><TrendingDown size={18} /></div>
            <span className="text-gray-400 text-sm">Gastos del mes</span>
          </div>
          <p className="text-2xl font-bold text-white">{currency(summary?.totalExpenses ?? 0)}</p>
          <p className="text-xs text-gray-500 mt-1">{summary?.expensesCount ?? 0} gastos cargados</p>
        </div>
        <div className={`card p-5 border ${balance >= 0 ? "border-green-500/30" : "border-red-500/30"}`}>
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-lg ${balance >= 0 ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
              {balance >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            </div>
            <span className="text-gray-400 text-sm">Balance (Ganancia / Pérdida)</span>
          </div>
          <p className={`text-2xl font-bold ${balance >= 0 ? "text-green-400" : "text-red-400"}`}>{currency(balance)}</p>
          <p className="text-xs text-gray-500 mt-1">Ventas − Gastos</p>
        </div>
      </div>

      {/* Breakdown by payment source */}
      <div className="card p-5">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2"><CreditCard size={16} /> Gastos por medio de pago</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {SOURCES.map((s) => {
            const val = summary?.bySource?.[s.key] ?? 0;
            return (
              <div key={s.key} className="bg-gray-800/50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                <p className="text-lg font-bold text-white">{currency(val)}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Expenses table */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="font-semibold text-white">Detalle de gastos</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr className="text-left">
              <th className="px-6 py-3 text-gray-400 font-medium">Fecha</th>
              <th className="px-4 py-3 text-gray-400 font-medium">Concepto</th>
              <th className="px-4 py-3 text-gray-400 font-medium">Categoría</th>
              <th className="px-4 py-3 text-gray-400 font-medium">Medio de pago</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Monto</th>
              <th className="px-4 py-3 text-gray-400 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {isLoading ? (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">Cargando...</td></tr>
            ) : expenses.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">Sin gastos cargados este mes</td></tr>
            ) : expenses.map((e) => (
              <tr key={e.id} className="hover:bg-gray-800/30">
                <td className="px-6 py-3 text-gray-400">{new Date(e.date).toLocaleDateString("es-AR")}</td>
                <td className="px-4 py-3 text-gray-100 font-medium">{e.concept}</td>
                <td className="px-4 py-3 text-gray-400">{e.category || "—"}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-700/60 text-gray-300">{SOURCE_LABEL[e.paymentSource] ?? e.paymentSource}</span>
                </td>
                <td className="px-4 py-3 text-right font-medium text-white">{currency(Number(e.amount))}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => openEdit(e)} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"><Pencil size={14} /></button>
                    <button onClick={() => { if (confirm("¿Eliminar gasto?")) deleteMut.mutate(e.id); }} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="font-semibold text-white">{modal === "create" ? "Nuevo gasto" : "Editar gasto"}</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-100"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Fecha</label>
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="label">Monto</label>
                  <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input" placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className="label">Concepto</label>
                <input value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} className="input" placeholder="Ej: Nafta, Facebook, Alquiler..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Medio de pago</label>
                  <select value={form.paymentSource} onChange={(e) => setForm({ ...form, paymentSource: e.target.value })} className="input">
                    {SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Categoría (opcional)</label>
                  <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input" placeholder="Impuestos, Ocio..." />
                </div>
              </div>
              <div>
                <label className="label">Notas (opcional)</label>
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input" placeholder="Notas..." />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={closeModal} className="btn-secondary flex-1 justify-center">Cancelar</button>
              <button onClick={submit} disabled={!form.concept || !form.amount || saveMut.isPending} className="btn-primary flex-1 justify-center">
                {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                {modal === "create" ? "Cargar gasto" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
