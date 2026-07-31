import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { currency, dateShort } from "../lib/format";
import { Users, Plus, Search, Phone, Mail, MapPin, X, Pencil, Trash2, ShoppingCart } from "lucide-react";

interface Client {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  salesCount: number;
  quotesCount: number;
  totalPurchases: number;
  lastPurchase?: string;
  createdAt: string;
}

const emptyForm = { name: "", email: "", phone: "", address: "", notes: "" };

export default function Clients() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ["clients"],
    queryFn: () => api.get("/clients").then((r) => r.data),
  });

  const createMut = useMutation({
    mutationFn: (data: typeof emptyForm) => api.post("/clients", data).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clients"] }); setModal(null); },
  });

  const updateMut = useMutation({
    mutationFn: (data: typeof emptyForm) => api.put(`/clients/${selected!.id}`, data).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clients"] }); setModal(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/clients/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });

  const openCreate = () => { setForm(emptyForm); setModal("create"); };
  const openEdit = (c: Client) => {
    setSelected(c);
    setForm({ name: c.name, email: c.email ?? "", phone: c.phone ?? "", address: c.address ?? "", notes: c.notes ?? "" });
    setModal("edit");
  };

  const submit = () => modal === "create" ? createMut.mutate(form) : updateMut.mutate(form);

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users size={24} className="text-gray-200" /> Clientes
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">{clients.length} clientes registrados</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 bg-white hover:bg-gray-200 text-gray-950 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} /> Nuevo cliente
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, email o teléfono..."
          className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gray-400" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total clientes", value: clients.length },
          { label: "Total facturado", value: currency(clients.reduce((a, c) => a + c.totalPurchases, 0)) },
          { label: "Promedio por cliente", value: clients.length ? currency(clients.reduce((a, c) => a + c.totalPurchases, 0) / clients.length) : "$0" },
        ].map((s) => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className="text-xl font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-500">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            {search ? "Sin resultados para tu búsqueda" : "No hay clientes aún. ¡Agregá el primero!"}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Contacto</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Compras</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Última compra</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gray-700/50 border border-gray-600/40 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-gray-200">{c.name[0].toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="font-medium text-white">{c.name}</p>
                        {c.address && <p className="text-xs text-gray-500 flex items-center gap-1"><MapPin size={10} />{c.address}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-0.5">
                      {c.email && <p className="text-sm text-gray-400 flex items-center gap-1.5"><Mail size={12} className="text-gray-600" />{c.email}</p>}
                      {c.phone && <p className="text-sm text-gray-400 flex items-center gap-1.5"><Phone size={12} className="text-gray-600" />{c.phone}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1 text-gray-300">
                      <ShoppingCart size={13} className="text-gray-500" />{c.salesCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-green-400">{currency(c.totalPurchases)}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-500">
                    {c.lastPurchase ? dateShort(c.lastPurchase) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(c)} className="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"><Pencil size={14} /></button>
                      <button onClick={() => { if (confirm("¿Eliminar cliente?")) deleteMut.mutate(c.id); }}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="font-semibold text-white">{modal === "create" ? "Nuevo cliente" : "Editar cliente"}</h2>
              <button onClick={() => setModal(null)} className="text-gray-500 hover:text-gray-300"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              {[
                { key: "name", label: "Nombre *", placeholder: "Ej: Juan Pérez" },
                { key: "email", label: "Email", placeholder: "juan@ejemplo.com" },
                { key: "phone", label: "Teléfono", placeholder: "+54 11 1234-5678" },
                { key: "address", label: "Dirección", placeholder: "Av. Corrientes 1234, CABA" },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="text-xs text-gray-400 mb-1 block">{label}</label>
                  <input value={form[key as keyof typeof emptyForm]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    placeholder={placeholder}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-gray-400" />
                </div>
              ))}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Notas</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2} placeholder="Notas internas..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-gray-400 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setModal(null)} className="flex-1 py-2 border border-gray-700 text-gray-400 hover:text-white rounded-lg text-sm transition-colors">Cancelar</button>
              <button onClick={submit} disabled={!form.name || createMut.isPending || updateMut.isPending}
                className="flex-1 py-2 bg-white hover:bg-gray-200 disabled:opacity-50 text-gray-950 rounded-lg text-sm font-medium transition-colors">
                {createMut.isPending || updateMut.isPending ? "Guardando..." : modal === "create" ? "Crear cliente" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
