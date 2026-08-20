import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Minus, AlertTriangle, X, Loader2, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { dateLong } from "../lib/format";

interface Product { id: string; name: string; sku: string; stock: number; stockMinAlert: number; category?: { name: string }; active: boolean; }
interface Movement { id: string; type: string; quantity: number; reason?: string; createdAt: string; product: { name: string; sku: string }; }

const schema = z.object({
  productId: z.string().min(1, "Seleccioná un producto"),
  type: z.enum(["IN", "OUT", "ADJUSTMENT"]),
  quantity: z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)), z.number().int().positive("Debe ser positivo")),
  reason: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

const typeConfig = {
  SALE: { label: "Venta", icon: Minus, color: "text-red-400" },
  OUT: { label: "Salida", icon: Minus, color: "text-red-400" },
  IN: { label: "Entrada", icon: Plus, color: "text-green-400" },
  ADJUSTMENT: { label: "Ajuste", icon: RefreshCw, color: "text-blue-400" },
};

export default function Stock() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: () => api.get("/products").then((r) => r.data),
  });
  const { data: movData } = useQuery({
    queryKey: ["movements"],
    queryFn: () => api.get("/stock/movements?limit=50").then((r) => r.data),
    refetchInterval: 10000,
  });
  const { data: lowStock = [] } = useQuery<{ id: string; name: string; sku: string; stock: number; stockMinAlert: number }[]>({
    queryKey: ["low-stock"],
    queryFn: () => api.get("/stock/low-stock").then((r) => r.data),
  });

  const adjustMutation = useMutation({
    mutationFn: (data: unknown) => api.post("/stock/adjust", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["low-stock"] });
      setModalOpen(false);
      reset();
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: { type: "IN" },
  });

  const activeProducts = (products as Product[]).filter((p: any) => p.active !== false);
  const movements: Movement[] = movData?.movements ?? [];

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Stock</h1>
          <p className="text-gray-400 text-sm mt-1">Inventario y movimientos</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="btn-primary">
          <RefreshCw size={16} /> Ajustar stock
        </button>
      </div>

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-yellow-400" />
            <span className="font-medium text-yellow-400 text-sm">{lowStock.length} producto{lowStock.length > 1 ? "s" : ""} con stock bajo</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStock.map((p) => (
              <div key={p.id} className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-1.5 text-sm">
                <span className="text-gray-200 font-medium">{p.name}</span>
                <span className="text-yellow-400 ml-2">{p.stock} ud</span>
                <span className="text-gray-500 ml-1">(mín. {p.stockMinAlert})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inventory table */}
      <div className="card p-0 overflow-x-auto">
        <div className="px-6 py-4 border-b border-gray-800">
          <h3 className="font-semibold text-white">Inventario actual</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr className="text-left">
              <th className="px-6 py-3 text-gray-400 font-medium">Producto</th>
              <th className="px-4 py-3 text-gray-400 font-medium">Categoría</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Stock actual</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Mínimo</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {activeProducts.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500">Sin productos</td></tr>
            ) : (
              activeProducts.map((p: Product) => {
                const low = p.stock <= p.stockMinAlert;
                const out = p.stock === 0;
                return (
                  <tr key={p.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-100">{p.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{p.sku}</p>
                    </td>
                    <td className="px-4 py-4 text-gray-400">{p.category?.name ?? "—"}</td>
                    <td className="px-4 py-4 text-right">
                      <span className={`text-lg font-bold ${out ? "text-red-400" : low ? "text-yellow-400" : "text-white"}`}>
                        {p.stock}
                      </span>
                      <span className="text-gray-500 text-xs ml-1">ud</span>
                    </td>
                    <td className="px-4 py-4 text-right text-gray-400">{p.stockMinAlert}</td>
                    <td className="px-4 py-4 text-right">
                      {out ? <span className="badge-red">Sin stock</span>
                        : low ? <span className="badge-yellow">Stock bajo</span>
                        : <span className="badge-green">OK</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Movements */}
      <div className="card p-0 overflow-x-auto">
        <div className="px-6 py-4 border-b border-gray-800">
          <h3 className="font-semibold text-white">Últimos movimientos</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr className="text-left">
              <th className="px-6 py-3 text-gray-400 font-medium">Producto</th>
              <th className="px-4 py-3 text-gray-400 font-medium">Tipo</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Cantidad</th>
              <th className="px-4 py-3 text-gray-400 font-medium">Razón</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Fecha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {movements.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500">Sin movimientos</td></tr>
            ) : (
              movements.map((m) => {
                const cfg = typeConfig[m.type as keyof typeof typeConfig] ?? typeConfig.ADJUSTMENT;
                const Icon = cfg.icon;
                return (
                  <tr key={m.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-3">
                      <p className="text-gray-200">{m.product.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{m.product.sku}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1.5 text-xs font-medium ${cfg.color}`}>
                        <Icon size={12} /> {cfg.label}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-bold ${m.quantity < 0 ? "text-red-400" : "text-green-400"}`}>
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{m.reason ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">{dateLong(m.createdAt)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Adjust modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="font-semibold text-white">Ajustar stock</h2>
              <button onClick={() => { setModalOpen(false); reset(); }} className="text-gray-400 hover:text-gray-100"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit((d) => adjustMutation.mutate(d as unknown))} className="p-6 space-y-4">
              <div>
                <label className="label">Producto</label>
                <select {...register("productId")} className="input">
                  <option value="">Seleccionar...</option>
                  {activeProducts.map((p: Product) => (
                    <option key={p.id} value={p.id}>{p.name} (Stock: {p.stock})</option>
                  ))}
                </select>
                {errors.productId && <p className="text-red-400 text-xs mt-1">{errors.productId.message}</p>}
              </div>
              <div>
                <label className="label">Tipo de movimiento</label>
                <select {...register("type")} className="input">
                  <option value="IN">Entrada (agregar stock)</option>
                  <option value="OUT">Salida (quitar stock)</option>
                  <option value="ADJUSTMENT">Ajuste de inventario</option>
                </select>
              </div>
              <div>
                <label className="label">Cantidad</label>
                <input {...register("quantity")} type="number" min="1" className="input" placeholder="0" />
                {errors.quantity && <p className="text-red-400 text-xs mt-1">{errors.quantity.message}</p>}
              </div>
              <div>
                <label className="label">Razón (opcional)</label>
                <input {...register("reason")} className="input" placeholder="Compra a proveedor, merma, inventario..." />
              </div>
              {adjustMutation.error && (
                <p className="text-red-400 text-sm">{(adjustMutation.error as any)?.response?.data?.error ?? "Error"}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setModalOpen(false); reset(); }} className="btn-secondary flex-1 justify-center">Cancelar</button>
                <button type="submit" disabled={adjustMutation.isPending} className="btn-primary flex-1 justify-center">
                  {adjustMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                  Confirmar ajuste
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
