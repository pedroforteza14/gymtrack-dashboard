import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Hammer, Plus, Trash2, Search, TrendingUp, Loader2, Package } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import { currency, pct } from "../lib/format";
import { Skeleton } from "../components/Skeleton";

interface Product { id: string; name: string; sku: string; line?: string; sellPrice: number; active: boolean; }
interface Material { id: string; name: string; quantity: number; unit?: string; unitCost: number; }
interface Rentabilidad {
  id: string; name: string; sku: string; line?: string;
  sellPrice: number; costoMateriales: number; ganancia: number; margen: number; cantidadMateriales: number;
}

const emptyMat = { name: "", quantity: "1", unit: "", unitCost: "" };

export default function Materiales() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Product | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyMat);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: () => api.get("/products").then((r) => r.data),
  });
  const { data: rent = [], isLoading: loadingRent } = useQuery<Rentabilidad[]>({
    queryKey: ["rentabilidad"],
    queryFn: () => api.get("/materials/rentabilidad").then((r) => r.data),
  });
  const { data: matData } = useQuery<{ materials: Material[]; costoMateriales: number }>({
    queryKey: ["materials", selected?.id],
    queryFn: () => api.get(`/materials/product/${selected!.id}`).then((r) => r.data),
    enabled: !!selected,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["materials"] });
    qc.invalidateQueries({ queryKey: ["rentabilidad"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const addMut = useMutation({
    mutationFn: () => api.post("/materials", {
      productId: selected!.id,
      name: form.name,
      quantity: Number(form.quantity) || 1,
      unit: form.unit || undefined,
      unitCost: Number(form.unitCost) || 0,
    }),
    onSuccess: () => { refresh(); setForm(emptyMat); toast.success("Material agregado"); },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/materials/${id}`),
    onSuccess: () => { refresh(); toast.success("Material eliminado"); },
  });

  const activos = products.filter((p) => p.active);
  const filtered = activos.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const materials = matData?.materials ?? [];
  const costoTotal = matData?.costoMateriales ?? 0;
  const ganancia = selected ? Number(selected.sellPrice) - costoTotal : 0;
  const margen = selected && Number(selected.sellPrice) > 0 ? (ganancia / Number(selected.sellPrice)) * 100 : 0;

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Hammer size={24} /> Materiales y costos</h1>
        <p className="text-gray-400 text-sm mt-1">Cargá qué lleva cada máquina para saber tu ganancia real</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Selector de producto */}
        <div className="card p-0 overflow-hidden lg:col-span-1">
          <div className="p-3 border-b border-gray-800">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar producto..." className="input pl-9 text-sm" />
            </div>
          </div>
          <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-800/50">
            {filtered.slice(0, 60).map((p) => {
              const r = rent.find((x) => x.id === p.id);
              return (
                <button key={p.id} onClick={() => { setSelected(p); setForm(emptyMat); }}
                  className={`w-full text-left px-4 py-3 transition-colors ${selected?.id === p.id ? "bg-white/10" : "hover:bg-gray-800/40"}`}>
                  <p className="text-sm text-gray-100 font-medium truncate">{p.name}</p>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-xs text-gray-500 font-mono">{p.sku}</span>
                    {r ? (
                      <span className={`text-xs font-medium ${r.margen >= 40 ? "text-green-400" : r.margen >= 20 ? "text-yellow-400" : "text-red-400"}`}>
                        {pct(r.margen)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-600">sin materiales</span>
                    )}
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && <p className="text-sm text-gray-600 text-center py-8">Sin resultados</p>}
          </div>
        </div>

        {/* Detalle del producto */}
        <div className="lg:col-span-2 space-y-4">
          {!selected ? (
            <div className="card p-12 text-center text-gray-500">
              <Package size={32} className="mx-auto mb-3 text-gray-700" />
              Elegí un producto de la lista para cargar sus materiales
            </div>
          ) : (
            <>
              {/* Resumen de costos */}
              <div className="card p-5">
                <h3 className="text-white font-semibold">{selected.name}</h3>
                <p className="text-xs text-gray-500 font-mono mb-4">{selected.sku}</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-800/50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Precio de venta</p>
                    <p className="text-lg font-bold text-white">{currency(Number(selected.sellPrice))}</p>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Costo materiales</p>
                    <p className="text-lg font-bold text-gray-300">{currency(costoTotal)}</p>
                  </div>
                  <div className={`rounded-lg p-3 ${ganancia >= 0 ? "bg-green-500/10" : "bg-red-500/10"}`}>
                    <p className="text-xs text-gray-500 mb-1">Ganancia · margen</p>
                    <p className={`text-lg font-bold ${ganancia >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {currency(ganancia)} <span className="text-xs">({pct(margen)})</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Lista de materiales */}
              <div className="card p-5 space-y-3">
                <h4 className="text-sm font-semibold text-gray-300">Materiales ({materials.length})</h4>

                {materials.length > 0 && (
                  <div className="space-y-1.5">
                    {materials.map((m) => (
                      <div key={m.id} className="flex items-center justify-between bg-gray-800/40 rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm text-gray-100">{m.name}</p>
                          <p className="text-xs text-gray-500">
                            {Number(m.quantity)}{m.unit ? ` ${m.unit}` : ""} × {currency(Number(m.unitCost))}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-sm font-medium text-white">{currency(Number(m.quantity) * Number(m.unitCost))}</span>
                          <button onClick={() => { if (confirm(`¿Eliminar ${m.name}?`)) delMut.mutate(m.id); }}
                            className="text-gray-500 hover:text-red-400"><Trash2 size={13} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Agregar material */}
                <div className="grid grid-cols-12 gap-2 items-end pt-1">
                  <div className="col-span-12 md:col-span-5">
                    <label className="label">Material</label>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="input text-sm" placeholder="Ej: Caño 40x40" />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <label className="label">Cantidad</label>
                    <input type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                      className="input text-sm" />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <label className="label">Unidad</label>
                    <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
                      className="input text-sm" placeholder="m, kg, u" />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <label className="label">Costo unit.</label>
                    <input type="number" step="0.01" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
                      className="input text-sm" placeholder="0" />
                  </div>
                  <div className="col-span-12 md:col-span-1">
                    <button onClick={() => addMut.mutate()} disabled={!form.name || addMut.isPending}
                      className="btn-primary w-full justify-center">
                      {addMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={16} />}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Rentabilidad */}
      <div className="card p-0 overflow-x-auto">
        <div className="px-6 py-4 border-b border-gray-800">
          <h3 className="font-semibold text-white flex items-center gap-2"><TrendingUp size={16} /> Rentabilidad por producto</h3>
          <p className="text-xs text-gray-500 mt-0.5">Productos con materiales cargados</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr className="text-left">
              <th className="px-6 py-3 text-gray-400 font-medium">Producto</th>
              <th className="px-4 py-3 text-gray-400 font-medium">Línea</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Precio</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Costo</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Ganancia</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Margen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {loadingRent ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 6 }).map((_, c) => (
                  <td key={c} className="px-4 py-4"><Skeleton className="h-4 w-full" /></td>
                ))}</tr>
              ))
            ) : rent.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-500">
                Cargá los materiales de un producto para ver su rentabilidad real
              </td></tr>
            ) : rent.sort((a, b) => b.margen - a.margen).map((r) => (
              <tr key={r.id} className="hover:bg-gray-800/30">
                <td className="px-6 py-3">
                  <p className="text-gray-100">{r.name}</p>
                  <p className="text-xs text-gray-500 font-mono">{r.sku}</p>
                </td>
                <td className="px-4 py-3 text-gray-400">{r.line ?? "—"}</td>
                <td className="px-4 py-3 text-right text-gray-300">{currency(r.sellPrice)}</td>
                <td className="px-4 py-3 text-right text-gray-400">{currency(r.costoMateriales)}</td>
                <td className={`px-4 py-3 text-right font-medium ${r.ganancia >= 0 ? "text-green-400" : "text-red-400"}`}>{currency(r.ganancia)}</td>
                <td className="px-4 py-3 text-right">
                  <span className={r.margen >= 40 ? "badge-green" : r.margen >= 20 ? "badge-yellow" : "badge-red"}>{pct(r.margen)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
