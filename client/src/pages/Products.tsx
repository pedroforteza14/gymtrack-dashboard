import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, X, Search, AlertTriangle, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { currency, pct } from "../lib/format";

interface Product {
  id: string; name: string; sku: string; description?: string;
  categoryId?: string; category?: { id: string; name: string };
  costPrice: number; sellPrice: number; stock: number; stockMinAlert: number; active: boolean;
}
interface Category { id: string; name: string; }

const numField = () => z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)), z.number());
const numOptional = () => z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)), z.number().optional());

const schema = z.object({
  name: z.string().min(1, "Requerido"),
  sku: z.string().min(1, "Requerido"),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  costPrice: numField(),
  sellPrice: numField(),
  stock: numOptional(),
  stockMinAlert: numOptional(),
});
type FormData = z.infer<typeof schema>;

function margin(cost: number, sell: number) {
  if (!sell) return 0;
  return ((sell - cost) / sell) * 100;
}

export default function Products() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: () => api.get("/products").then((r) => r.data),
  });
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: () => api.get("/products/categories/all").then((r) => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (data: unknown) =>
      editing
        ? api.put(`/products/${editing.id}`, data)
        : api.post("/products", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); closeModal(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
  });

  function openCreate() { setEditing(null); reset({}); setModalOpen(true); }
  function openEdit(p: Product) {
    setEditing(p);
    reset({ name: p.name, sku: p.sku, description: p.description ?? "", categoryId: p.categoryId ?? "",
      costPrice: Number(p.costPrice), sellPrice: Number(p.sellPrice), stock: p.stock, stockMinAlert: p.stockMinAlert });
    setModalOpen(true);
  }
  function closeModal() { setModalOpen(false); setEditing(null); reset({}); }

  const filtered = products.filter((p) =>
    p.active && (
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.category?.name.toLowerCase().includes(search.toLowerCase())
    )
  );

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Productos</h1>
          <p className="text-gray-400 text-sm mt-1">{filtered.length} productos activos</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={16} /> Nuevo producto
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, SKU o categoría..."
          className="input pl-9 max-w-sm"
        />
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr className="text-left">
              <th className="px-6 py-3 text-gray-400 font-medium">Producto</th>
              <th className="px-4 py-3 text-gray-400 font-medium">Categoría</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Costo</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Precio</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Margen</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Stock</th>
              <th className="px-4 py-3 text-gray-400 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {isLoading ? (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">Sin productos</td></tr>
            ) : (
              filtered.map((p) => {
                const m = margin(Number(p.costPrice), Number(p.sellPrice));
                const lowStock = p.stock <= p.stockMinAlert;
                return (
                  <tr key={p.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-100">{p.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{p.sku}</p>
                    </td>
                    <td className="px-4 py-4">
                      {p.category ? <span className="badge-blue">{p.category.name}</span> : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-4 text-right text-gray-300">{currency(Number(p.costPrice))}</td>
                    <td className="px-4 py-4 text-right font-medium text-white">{currency(Number(p.sellPrice))}</td>
                    <td className="px-4 py-4 text-right">
                      <span className={m >= 30 ? "badge-green" : m >= 15 ? "badge-yellow" : "badge-red"}>
                        {pct(m)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {lowStock && <AlertTriangle size={13} className="text-yellow-400" />}
                        <span className={`font-medium ${lowStock ? "text-yellow-400" : "text-gray-100"}`}>{p.stock}</span>
                        <span className="text-gray-600 text-xs">ud</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => openEdit(p)} className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => { if (confirm(`¿Eliminar ${p.name}?`)) deleteMutation.mutate(p.id); }}
                          className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="font-semibold text-white">{editing ? "Editar producto" : "Nuevo producto"}</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-100 transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit((d) => saveMutation.mutate(d as unknown))} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">Nombre del producto</label>
                  <input {...register("name")} className="input" placeholder="Cinta de Correr Pro" />
                  {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
                </div>
                <div>
                  <label className="label">SKU</label>
                  <input {...register("sku")} className="input" placeholder="CARD-001" />
                  {errors.sku && <p className="text-red-400 text-xs mt-1">{errors.sku.message}</p>}
                </div>
                <div>
                  <label className="label">Categoría</label>
                  <select {...register("categoryId")} className="input">
                    <option value="">Sin categoría</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Costo</label>
                  <input {...register("costPrice")} type="number" step="0.01" className="input" placeholder="0.00" />
                  {errors.costPrice && <p className="text-red-400 text-xs mt-1">{errors.costPrice.message}</p>}
                </div>
                <div>
                  <label className="label">Precio de venta</label>
                  <input {...register("sellPrice")} type="number" step="0.01" className="input" placeholder="0.00" />
                  {errors.sellPrice && <p className="text-red-400 text-xs mt-1">{errors.sellPrice.message}</p>}
                </div>
                {!editing && (
                  <div>
                    <label className="label">Stock inicial</label>
                    <input {...register("stock")} type="number" className="input" placeholder="0" />
                  </div>
                )}
                <div>
                  <label className="label">Alerta mínimo stock</label>
                  <input {...register("stockMinAlert")} type="number" className="input" placeholder="5" />
                </div>
                <div className="col-span-2">
                  <label className="label">Descripción (opcional)</label>
                  <textarea {...register("description")} className="input resize-none" rows={2} placeholder="Descripción del producto..." />
                </div>
              </div>
              {saveMutation.error && (
                <p className="text-red-400 text-sm">{(saveMutation.error as any)?.response?.data?.error || "Error al guardar"}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="btn-secondary flex-1 justify-center">Cancelar</button>
                <button type="submit" disabled={saveMutation.isPending} className="btn-primary flex-1 justify-center">
                  {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                  {editing ? "Guardar cambios" : "Crear producto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
