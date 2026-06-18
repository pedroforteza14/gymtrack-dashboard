import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Trash2, Loader2, ChevronLeft, ChevronRight, Filter, User } from "lucide-react";
import { api } from "../lib/api";
import { currency, pct, dateLong } from "../lib/format";

interface Client { id: string; name: string; }
interface Product { id: string; name: string; sku: string; costPrice: number; sellPrice: number; stock: number; }
interface SaleItem { productId: string; quantity: number; unitPrice: number; }
interface Sale {
  id: string; saleNumber: string; notes?: string;
  totalCost: number; totalRevenue: number; totalProfit: number; createdAt: string;
  client?: { id: string; name: string } | null;
  items: { id: string; quantity: number; unitPrice: number; unitCost: number; subtotal: number; profit: number; product: { name: string; sku: string } }[];
}

export default function Sales() {
  const qc = useQueryClient();
  const [page, setPage]         = useState(1);
  const [modalOpen, setModal]   = useState(false);
  const [detail, setDetail]     = useState<Sale | null>(null);

  // Filtros
  const [filterClient, setFilterClient] = useState("");
  const [filterFrom,   setFilterFrom]   = useState("");
  const [filterTo,     setFilterTo]     = useState("");
  const [filtersOpen,  setFiltersOpen]  = useState(false);

  // Form nueva venta
  const [items,     setItems]     = useState<SaleItem[]>([]);
  const [notes,     setNotes]     = useState("");
  const [clientId,  setClientId]  = useState("");
  const [saleError, setSaleError] = useState("");

  // Query key incluye filtros
  const queryKey = ["sales", page, filterClient, filterFrom, filterTo];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "15" });
      if (filterClient) params.set("clientId", filterClient);
      if (filterFrom)   params.set("dateFrom", filterFrom);
      if (filterTo)     params.set("dateTo",   filterTo);
      return api.get(`/sales?${params}`).then((r) => r.data);
    },
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: () => api.get("/products").then((r) => r.data),
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["clients"],
    queryFn: () => api.get("/clients").then((r) => r.data),
  });

  const createSale = useMutation({
    mutationFn: () =>
      api.post("/sales", {
        items,
        notes: notes || undefined,
        clientId: clientId || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      closeModal();
    },
    onError: (e: any) => setSaleError(e.response?.data?.error ?? "Error al crear venta"),
  });

  const deleteSale = useMutation({
    mutationFn: (id: string) => api.delete(`/sales/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });

  const activeProducts = (products as Product[]).filter((p: any) => p.active !== false);

  function addItem() {
    if (activeProducts.length === 0) return;
    const p = activeProducts[0];
    setItems([...items, { productId: p.id, quantity: 1, unitPrice: Number(p.sellPrice) }]);
  }

  function updateItem(idx: number, field: keyof SaleItem, value: string) {
    const copy = [...items];
    if (field === "productId") {
      const p = activeProducts.find((pr) => pr.id === value)!;
      copy[idx] = { ...copy[idx], productId: value, unitPrice: Number(p.sellPrice) };
    } else {
      (copy[idx] as any)[field] = field === "quantity" ? parseInt(value) : parseFloat(value);
    }
    setItems(copy);
  }

  function removeItem(idx: number) { setItems(items.filter((_, i) => i !== idx)); }

  function closeModal() {
    setModal(false); setItems([]); setNotes(""); setClientId(""); setSaleError("");
  }

  function clearFilters() {
    setFilterClient(""); setFilterFrom(""); setFilterTo(""); setPage(1);
  }

  const hasFilters = filterClient || filterFrom || filterTo;

  const totals = items.reduce(
    (acc, item) => {
      const product = activeProducts.find((p) => p.id === item.productId);
      const cost    = product ? Number(product.costPrice) * item.quantity : 0;
      const revenue = item.unitPrice * item.quantity;
      return { revenue: acc.revenue + revenue, cost: acc.cost + cost, profit: acc.profit + (revenue - cost) };
    },
    { revenue: 0, cost: 0, profit: 0 }
  );

  const sales: Sale[] = data?.sales ?? [];
  const total: number = data?.total ?? 0;
  const totalPages    = Math.ceil(total / 15);

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Ventas</h1>
          <p className="text-gray-400 text-sm mt-1">
            {total} venta{total !== 1 ? "s" : ""}{hasFilters ? " (filtrado)" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className={`btn-secondary ${hasFilters ? "border-blue-500/50 text-blue-400" : ""}`}
          >
            <Filter size={15} />
            Filtros
            {hasFilters && (
              <span className="ml-1 bg-blue-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                {[filterClient, filterFrom, filterTo].filter(Boolean).length}
              </span>
            )}
          </button>
          <button onClick={() => setModal(true)} className="btn-primary">
            <Plus size={16} /> Nueva venta
          </button>
        </div>
      </div>

      {/* Panel de filtros */}
      {filtersOpen && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-white">Filtrar ventas</p>
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                Limpiar filtros
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Cliente</label>
              <select
                value={filterClient}
                onChange={(e) => { setFilterClient(e.target.value); setPage(1); }}
                className="input"
              >
                <option value="">Todos los clientes</option>
                {(clients as Client[]).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Desde</label>
              <input
                type="date"
                value={filterFrom}
                onChange={(e) => { setFilterFrom(e.target.value); setPage(1); }}
                className="input"
              />
            </div>
            <div>
              <label className="label">Hasta</label>
              <input
                type="date"
                value={filterTo}
                onChange={(e) => { setFilterTo(e.target.value); setPage(1); }}
                className="input"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr className="text-left">
              <th className="px-6 py-3 text-gray-400 font-medium">#</th>
              <th className="px-4 py-3 text-gray-400 font-medium">Cliente</th>
              <th className="px-4 py-3 text-gray-400 font-medium">Productos</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Costo</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Ingresos</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Ganancia</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Margen</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Fecha</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {isLoading ? (
              <tr><td colSpan={9} className="px-6 py-12 text-center text-gray-500">Cargando...</td></tr>
            ) : sales.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                  {hasFilters ? "Sin ventas con los filtros aplicados" : "Sin ventas registradas"}
                </td>
              </tr>
            ) : (
              sales.map((sale) => {
                const m = sale.totalRevenue > 0 ? (sale.totalProfit / sale.totalRevenue) * 100 : 0;
                return (
                  <tr
                    key={sale.id}
                    className="hover:bg-gray-800/30 transition-colors cursor-pointer"
                    onClick={() => setDetail(sale)}
                  >
                    <td className="px-6 py-4 text-blue-400 font-mono font-medium">{sale.saleNumber}</td>
                    <td className="px-4 py-4">
                      {sale.client ? (
                        <span className="flex items-center gap-1.5 text-gray-300">
                          <User size={12} className="text-gray-500 flex-shrink-0" />
                          {sale.client.name}
                        </span>
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-gray-300 max-w-[200px]">
                      <span className="truncate block">{sale.items.map((i) => `${i.product.name} x${i.quantity}`).join(", ")}</span>
                    </td>
                    <td className="px-4 py-4 text-right text-gray-400">{currency(Number(sale.totalCost))}</td>
                    <td className="px-4 py-4 text-right font-medium text-white">{currency(Number(sale.totalRevenue))}</td>
                    <td className="px-4 py-4 text-right text-green-400">{currency(Number(sale.totalProfit))}</td>
                    <td className="px-4 py-4 text-right">
                      <span className={m >= 30 ? "badge-green" : m >= 15 ? "badge-yellow" : "badge-red"}>{pct(m)}</span>
                    </td>
                    <td className="px-4 py-4 text-right text-gray-400">{dateLong(sale.createdAt)}</td>
                    <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          if (confirm(`¿Anular venta ${sale.saleNumber}? Se restaurará el stock.`))
                            deleteSale.mutate(sale.id);
                        }}
                        className="btn-danger"
                      >
                        Anular
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-gray-800 flex items-center justify-between">
            <span className="text-sm text-gray-400">Página {page} de {totalPages}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary px-2 py-1 text-xs disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-secondary px-2 py-1 text-xs disabled:opacity-40"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ MODAL NUEVA VENTA ═══ */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
              <h2 className="font-semibold text-white">Nueva venta</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-100"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Cliente */}
              <div>
                <label className="label">Cliente (opcional)</label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="input"
                >
                  <option value="">Sin cliente asignado</option>
                  {(clients as Client[]).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Productos */}
              <div className="space-y-3">
                {items.length === 0 && (
                  <p className="text-gray-500 text-sm text-center py-4">Agregá productos a la venta</p>
                )}
                {items.map((item, idx) => {
                  const product    = activeProducts.find((p) => p.id === item.productId);
                  const itemRev    = item.unitPrice * item.quantity;
                  const itemCost   = product ? Number(product.costPrice) * item.quantity : 0;
                  return (
                    <div key={idx} className="bg-gray-800 rounded-xl p-4 space-y-3">
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="label">Producto</label>
                          <select
                            value={item.productId}
                            onChange={(e) => updateItem(idx, "productId", e.target.value)}
                            className="input"
                          >
                            {activeProducts.map((p) => (
                              <option key={p.id} value={p.id}>{p.name} (Stock: {p.stock})</option>
                            ))}
                          </select>
                        </div>
                        <div className="w-24">
                          <label className="label">Cantidad</label>
                          <input
                            type="number" min="1" max={product?.stock}
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                            className="input"
                          />
                        </div>
                        <div className="w-36">
                          <label className="label">Precio unit.</label>
                          <input
                            type="number" step="0.01"
                            value={item.unitPrice}
                            onChange={(e) => updateItem(idx, "unitPrice", e.target.value)}
                            className="input"
                          />
                        </div>
                        <button onClick={() => removeItem(idx)} className="mt-6 text-gray-500 hover:text-red-400 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="flex gap-4 text-xs text-gray-400">
                        <span>Costo: <span className="text-gray-300">{currency(itemCost)}</span></span>
                        <span>Ingresos: <span className="text-white font-medium">{currency(itemRev)}</span></span>
                        <span>Ganancia: <span className="text-green-400">{currency(itemRev - itemCost)}</span></span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button onClick={addItem} className="btn-secondary w-full justify-center text-sm">
                <Plus size={14} /> Agregar producto
              </button>

              <div>
                <label className="label">Notas (opcional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input resize-none"
                  rows={2}
                  placeholder="Notas de la venta..."
                />
              </div>

              {/* Totales */}
              {items.length > 0 && (
                <div className="bg-gray-800/60 rounded-xl p-4 grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Costo total</p>
                    <p className="font-bold text-gray-200">{currency(totals.cost)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Ingresos</p>
                    <p className="font-bold text-white text-lg">{currency(totals.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Ganancia</p>
                    <p className="font-bold text-green-400">{currency(totals.profit)}</p>
                  </div>
                </div>
              )}

              {saleError && <p className="text-red-400 text-sm">{saleError}</p>}
            </div>

            <div className="px-6 py-4 border-t border-gray-800 flex gap-3 flex-shrink-0">
              <button onClick={closeModal} className="btn-secondary flex-1 justify-center">Cancelar</button>
              <button
                onClick={() => createSale.mutate()}
                disabled={items.length === 0 || createSale.isPending}
                className="btn-primary flex-1 justify-center"
              >
                {createSale.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                Confirmar venta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL DETALLE ═══ */}
      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setDetail(null)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <div>
                <h2 className="font-semibold text-white">{detail.saleNumber}</h2>
                {detail.client && (
                  <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                    <User size={11} /> {detail.client.name}
                  </p>
                )}
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-100"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-gray-800">
                    <th className="pb-2 text-gray-400">Producto</th>
                    <th className="pb-2 text-gray-400 text-right">Cant</th>
                    <th className="pb-2 text-gray-400 text-right">P.Unit</th>
                    <th className="pb-2 text-gray-400 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {detail.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2 text-gray-200">{item.product.name}</td>
                      <td className="py-2 text-right text-gray-400">{item.quantity}</td>
                      <td className="py-2 text-right text-gray-400">{currency(Number(item.unitPrice))}</td>
                      <td className="py-2 text-right text-white">{currency(Number(item.subtotal))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-gray-800 pt-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Costo total</span><span className="text-gray-200">{currency(Number(detail.totalCost))}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Ingresos</span><span className="text-white font-medium">{currency(Number(detail.totalRevenue))}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Ganancia</span><span className="text-green-400 font-medium">{currency(Number(detail.totalProfit))}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Margen</span><span>{pct(detail.totalRevenue > 0 ? (detail.totalProfit / detail.totalRevenue) * 100 : 0)}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Fecha</span><span className="text-gray-300">{dateLong(detail.createdAt)}</span></div>
                {detail.notes && <div className="flex justify-between"><span className="text-gray-400">Notas</span><span className="text-gray-300">{detail.notes}</span></div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
