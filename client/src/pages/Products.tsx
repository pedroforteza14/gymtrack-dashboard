import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, X, Search, Loader2, Upload, ImageIcon, FileText, Percent } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import { currency } from "../lib/format";
import { SkeletonCards } from "../components/Skeleton";

interface Product {
  id: string; name: string; sku: string; description?: string;
  categoryId?: string; category?: { id: string; name: string };
  costPrice: number; sellPrice: number; supplier?: string;
  line?: string; imageName?: string;
  stock: number; stockMinAlert: number; active: boolean;
}
interface Category { id: string; name: string; }

const numField = () => z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)), z.number());
const numOptional = () => z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)), z.number().optional());

const schema = z.object({
  name: z.string().min(1, "Requerido"),
  sku: z.string().optional(),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  line: z.string().optional(),
  costPrice: numOptional(),
  sellPrice: numField(),
  supplier: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

const MAX_IMG_MB = 2.5;
const token = () => localStorage.getItem("token");
const imgUrl = (id: string) => `${api.defaults.baseURL}/products/${id}/image?token=${token()}`;

export default function Products() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [lineFilter, setLineFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [imgPreview, setImgPreview] = useState<string | null>(null); // data URL
  const [imgMeta, setImgMeta] = useState<{ name: string; type: string } | null>(null);
  const [imgErr, setImgErr] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPercent, setBulkPercent] = useState("");
  const [bulkLine, setBulkLine] = useState("");

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: () => api.get("/products").then((r) => r.data),
  });
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: () => api.get("/products/categories/all").then((r) => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload: Record<string, unknown> = { ...data };
      if (imgPreview && imgMeta) {
        payload.imageData = imgPreview.split(",")[1];
        payload.imageName = imgMeta.name;
        payload.imageType = imgMeta.type;
      }
      return editing ? api.put(`/products/${editing.id}`, payload) : api.post("/products", payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); toast.success(editing ? "Producto actualizado" : "Producto creado"); closeModal(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); toast.success("Producto eliminado"); },
  });

  const bulkMutation = useMutation({
    mutationFn: () => api.post("/products/bulk-price", {
      percent: Number(bulkPercent),
      line: bulkLine || undefined,
      round: 1000,
    }).then((r) => r.data),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(`${d.updated} precio${d.updated !== 1 ? "s" : ""} actualizado${d.updated !== 1 ? "s" : ""}`);
      setBulkOpen(false);
    },
  });

  function openListaPrecios() {
    const token = localStorage.getItem("token");
    const q = lineFilter ? `&line=${encodeURIComponent(lineFilter)}` : "";
    window.open(`${api.defaults.baseURL}/products/lista-precios/pdf?token=${token}${q}`, "_blank");
  }

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
  });

  function resetImg() { setImgPreview(null); setImgMeta(null); setImgErr(""); }
  function openCreate() { setEditing(null); reset({}); resetImg(); setModalOpen(true); }
  function openEdit(p: Product) {
    setEditing(p);
    reset({ name: p.name, sku: p.sku, description: p.description ?? "", categoryId: p.categoryId ?? "",
      line: p.line ?? "", costPrice: Number(p.costPrice), sellPrice: Number(p.sellPrice), supplier: p.supplier ?? "" });
    resetImg();
    setModalOpen(true);
  }
  function closeModal() { setModalOpen(false); setEditing(null); reset({}); resetImg(); }

  function onPickImage(f: File | null) {
    setImgErr("");
    if (!f) return;
    if (f.size > MAX_IMG_MB * 1024 * 1024) { setImgErr(`La imagen supera ${MAX_IMG_MB} MB`); return; }
    const reader = new FileReader();
    reader.onload = () => { setImgPreview(String(reader.result)); setImgMeta({ name: f.name, type: f.type || "image/jpeg" }); };
    reader.readAsDataURL(f);
  }

  const lines = Array.from(new Set(products.map((p) => p.line).filter(Boolean))) as string[];

  const filtered = products.filter((p) =>
    p.active &&
    (!lineFilter || p.line === lineFilter) &&
    (
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.category?.name.toLowerCase().includes(search.toLowerCase()) ||
      p.supplier?.toLowerCase().includes(search.toLowerCase()) ||
      p.line?.toLowerCase().includes(search.toLowerCase())
    )
  );

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Productos</h1>
          <p className="text-gray-400 text-sm mt-1">{filtered.length} productos activos</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={openListaPrecios} className="btn-secondary" title="Lista de precios en PDF">
            <FileText size={15} /> Lista de precios
          </button>
          <button onClick={() => { setBulkPercent(""); setBulkOpen(true); }} className="btn-secondary" title="Actualizar precios por porcentaje">
            <Percent size={15} /> Ajustar precios
          </button>
          <button onClick={openCreate} className="btn-primary">
            <Plus size={16} /> Nuevo producto
          </button>
        </div>
      </div>

      {/* Search + line filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, SKU, categoría, línea o proveedor..."
            className="input pl-9 w-80 max-w-full"
          />
        </div>
        {lines.length > 0 && (
          <div className="flex gap-1 bg-gray-800/60 rounded-lg p-1">
            <button onClick={() => setLineFilter("")} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${!lineFilter ? "bg-white text-gray-950" : "text-gray-400 hover:text-gray-200"}`}>Todas</button>
            {lines.map((l) => (
              <button key={l} onClick={() => setLineFilter(l)} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${lineFilter === l ? "bg-white text-gray-950" : "text-gray-400 hover:text-gray-200"}`}>{l}</button>
            ))}
          </div>
        )}
      </div>

      {/* Card grid */}
      {isLoading ? (
        <SkeletonCards count={8} />
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-gray-500">Sin productos</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((p) => (
            <div key={p.id} className="card p-0 overflow-x-auto group flex flex-col">
              {/* Image */}
              <div className="aspect-square bg-gray-800/50 flex items-center justify-center overflow-hidden relative">
                {p.imageName ? (
                  <img src={imgUrl(p.id)} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon size={40} className="text-gray-700" />
                )}
                {p.line && (
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/70 text-white backdrop-blur-sm">{p.line}</span>
                )}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(p)} className="p-1.5 bg-black/70 text-white rounded-lg hover:bg-black backdrop-blur-sm"><Pencil size={13} /></button>
                  <button onClick={() => { if (confirm(`¿Eliminar ${p.name}?`)) deleteMutation.mutate(p.id); }} className="p-1.5 bg-black/70 text-white rounded-lg hover:bg-red-600 backdrop-blur-sm"><Trash2 size={13} /></button>
                </div>
              </div>
              {/* Info */}
              <div className="p-4 flex flex-col gap-1 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-gray-100 text-sm leading-tight">{p.name}</p>
                </div>
                <p className="text-xs text-gray-500 font-mono">{p.sku}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  {p.category && <span className="badge-blue">{p.category.name}</span>}
                </div>
                <p className="text-lg font-bold text-white mt-auto pt-2">{currency(Number(p.sellPrice))}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 sticky top-0 bg-gray-900 z-10">
              <h2 className="font-semibold text-white">{editing ? "Editar producto" : "Nuevo producto"}</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-100 transition-colors"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="p-6 space-y-4">
              {/* Imagen */}
              <div>
                <label className="label">Foto del producto</label>
                <input id="prod-img" type="file" accept="image/*" className="hidden" onChange={(e) => onPickImage(e.target.files?.[0] ?? null)} />
                <label htmlFor="prod-img" className="flex items-center gap-3 border border-dashed border-gray-700 hover:border-gray-500 rounded-lg p-3 cursor-pointer transition-colors">
                  <div className="w-16 h-16 rounded-lg bg-gray-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {imgPreview ? (
                      <img src={imgPreview} alt="preview" className="w-full h-full object-cover" />
                    ) : editing?.imageName ? (
                      <img src={imgUrl(editing.id)} alt="actual" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon size={22} className="text-gray-600" />
                    )}
                  </div>
                  <div className="text-sm text-gray-400 flex items-center gap-2"><Upload size={14} /> {imgPreview ? "Cambiar imagen" : "Subir imagen (máx. 2,5 MB)"}</div>
                </label>
                {imgErr && <p className="text-red-400 text-xs mt-1">{imgErr}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">Nombre del producto</label>
                  <input {...register("name")} className="input" placeholder="Banco Multi Angular Premium" />
                  {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
                </div>
                <div>
                  <label className="label">SKU (opcional)</label>
                  <input {...register("sku")} className="input" placeholder="Se genera solo si lo dejás vacío" />
                  {errors.sku && <p className="text-red-400 text-xs mt-1">{errors.sku.message}</p>}
                </div>
                <div>
                  <label className="label">Línea</label>
                  <input {...register("line")} className="input" placeholder="Omega, Alfa..." list="lines-list" />
                  <datalist id="lines-list">{lines.map((l) => <option key={l} value={l} />)}</datalist>
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
                </div>
                <div>
                  <label className="label">Precio de venta</label>
                  <input {...register("sellPrice")} type="number" step="0.01" className="input" placeholder="0.00" />
                  {errors.sellPrice && <p className="text-red-400 text-xs mt-1">{errors.sellPrice.message}</p>}
                </div>
                <div>
                  <label className="label">Proveedor (opcional)</label>
                  <input {...register("supplier")} className="input" placeholder="Nombre del proveedor..." />
                </div>
                <div className="col-span-2">
                  <label className="label">Descripción (opcional)</label>
                  <textarea {...register("description")} className="input resize-none" rows={2} placeholder="Descripción del producto..." />
                </div>
              </div>
              {saveMutation.error && (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      {/* Modal ajuste masivo de precios */}
      {bulkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="font-semibold text-white flex items-center gap-2"><Percent size={18} /> Ajustar precios</h2>
              <button onClick={() => setBulkOpen(false)} className="text-gray-400 hover:text-gray-100"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Porcentaje de ajuste</label>
                <div className="flex items-center gap-2">
                  <input type="number" step="0.1" value={bulkPercent} onChange={(e) => setBulkPercent(e.target.value)}
                    className="input" placeholder="Ej: 15 para subir, -10 para bajar" autoFocus />
                  <span className="text-gray-400 font-bold">%</span>
                </div>
                <div className="flex gap-1.5 mt-2">
                  {[5, 10, 15, 20, 30].map((p) => (
                    <button key={p} onClick={() => setBulkPercent(String(p))}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors">
                      +{p}%
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Aplicar a</label>
                <select value={bulkLine} onChange={(e) => setBulkLine(e.target.value)} className="input">
                  <option value="">Todos los productos ({products.filter((p) => p.active).length})</option>
                  {lines.map((l) => (
                    <option key={l} value={l}>Solo línea {l} ({products.filter((p) => p.active && p.line === l).length})</option>
                  ))}
                </select>
              </div>

              {bulkPercent && !isNaN(Number(bulkPercent)) && (
                <div className="bg-gray-800/60 rounded-lg p-3 text-sm">
                  <p className="text-gray-400 text-xs mb-1">Ejemplo con un producto de {currency(500000)}:</p>
                  <p className="text-white font-medium">
                    {currency(500000)} → {currency(Math.round((500000 * (1 + Number(bulkPercent) / 100)) / 1000) * 1000)}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">Los precios se redondean a múltiplos de $1.000</p>
                </div>
              )}

              <p className="text-xs text-gray-500">
                Se guarda el historial de cada cambio. Los costos no se modifican.
              </p>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setBulkOpen(false)} className="btn-secondary flex-1 justify-center">Cancelar</button>
              <button
                onClick={() => { if (confirm(`¿Aplicar ${Number(bulkPercent) > 0 ? "+" : ""}${bulkPercent}% a los precios?`)) bulkMutation.mutate(); }}
                disabled={!bulkPercent || isNaN(Number(bulkPercent)) || bulkMutation.isPending}
                className="btn-primary flex-1 justify-center">
                {bulkMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
