import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Plus, RefreshCw, X, Loader2, MonitorPlay, TrendingUp, BarChart3, Eye } from "lucide-react";

interface AdAccount {
  id: string;
  metaAccountId: string;
  name: string;
  accessToken: string;
  user: { id: string; name: string; email: string };
  campaigns: { id: string; name: string; status: string }[];
}

interface User {
  id: string;
  name: string;
  email: string;
}

export default function AdAccounts() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  const [form, setForm] = useState({
    metaAccountId: "",
    name: "",
    accessToken: "",
    userId: "",
  });
  const [formError, setFormError] = useState("");

  const { data: accounts = [], isLoading } = useQuery<AdAccount[]>({
    queryKey: ["ad-accounts"],
    queryFn: () => api.get("/ad-accounts").then((r) => r.data),
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: () => api.get("/auth/users").then((r) => r.data),
  });

  const createMut = useMutation({
    mutationFn: () => api.post("/ad-accounts", form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ad-accounts"] });
      setModalOpen(false);
      setForm({ metaAccountId: "", name: "", accessToken: "", userId: "" });
      setFormError("");
    },
    onError: (e: any) => setFormError(e.response?.data?.error ?? "Error al crear cuenta"),
  });

  async function syncAccount(id: string) {
    setSyncing(id);
    try {
      await api.post(`/ad-accounts/${id}/sync`);
      qc.invalidateQueries({ queryKey: ["ad-accounts"] });
    } catch {
      // ignore
    } finally {
      setSyncing(null);
    }
  }

  const activeCampaigns = (acc: AdAccount) =>
    acc.campaigns.filter((c) => c.status === "ACTIVE").length;

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Cuentas Meta Ads</h1>
          <p className="text-gray-400 text-sm mt-1">
            {accounts.length} cuenta{accounts.length !== 1 ? "s" : ""} conectada{accounts.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button onClick={() => setModalOpen(true)} className="btn-primary">
          <Plus size={16} /> Conectar cuenta
        </button>
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div className="text-center py-16 text-gray-500">Cargando cuentas...</div>
      ) : accounts.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <MonitorPlay size={40} className="text-gray-600 mb-4" />
          <p className="text-gray-400 font-medium">No hay cuentas conectadas</p>
          <p className="text-gray-600 text-sm mt-1 mb-4">Conectá la primera cuenta de Meta Ads para empezar a trackear campañas</p>
          <button onClick={() => setModalOpen(true)} className="btn-primary">
            <Plus size={14} /> Conectar cuenta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {accounts.map((acc) => (
            <div key={acc.id} className="card space-y-4 hover:border-purple-600/40 transition-colors cursor-pointer group"
              onClick={() => navigate(`/ads/client/${acc.id}`)}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-600/20 border border-purple-600/30 flex items-center justify-center flex-shrink-0">
                    <MonitorPlay size={18} className="text-purple-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">{acc.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{acc.metaAccountId}</p>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => syncAccount(acc.id)}
                    disabled={syncing === acc.id}
                    className="p-1.5 text-gray-400 hover:text-purple-400 hover:bg-purple-400/10 rounded-lg transition-colors"
                    title="Sincronizar campañas"
                  >
                    <RefreshCw size={14} className={syncing === acc.id ? "animate-spin" : ""} />
                  </button>
                  <button
                    onClick={() => navigate(`/ads/client/${acc.id}`)}
                    className="p-1.5 text-gray-400 hover:text-purple-400 hover:bg-purple-400/10 rounded-lg transition-colors"
                    title="Ver detalle"
                  >
                    <Eye size={14} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-800/60 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-white">{acc.campaigns.length}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Campañas</p>
                </div>
                <div className="bg-gray-800/60 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-400">{activeCampaigns(acc)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Activas</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Cliente: <span className="text-gray-300">{acc.user.name}</span></span>
                <span className="text-purple-400 font-medium group-hover:underline">Ver métricas →</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats summary */}
      {accounts.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center">
              <MonitorPlay size={18} className="text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Total cuentas</p>
              <p className="text-xl font-bold text-white">{accounts.length}</p>
            </div>
          </div>
          <div className="card flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
              <BarChart3 size={18} className="text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Total campañas</p>
              <p className="text-xl font-bold text-white">
                {accounts.reduce((s, a) => s + a.campaigns.length, 0)}
              </p>
            </div>
          </div>
          <div className="card flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center">
              <TrendingUp size={18} className="text-green-400" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Campañas activas</p>
              <p className="text-xl font-bold text-white">
                {accounts.reduce((s, a) => s + activeCampaigns(a), 0)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="font-semibold text-white">Conectar cuenta Meta Ads</h2>
              <button onClick={() => { setModalOpen(false); setFormError(""); }} className="text-gray-400 hover:text-gray-100">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Nombre de la cuenta</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input"
                  placeholder="Ej: The Promise Machine - Principal"
                />
              </div>
              <div>
                <label className="label">Meta Account ID</label>
                <input
                  value={form.metaAccountId}
                  onChange={(e) => setForm({ ...form, metaAccountId: e.target.value })}
                  className="input font-mono"
                  placeholder="act_XXXXXXXXXXXXXXXX"
                />
                <p className="text-xs text-gray-500 mt-1">Lo encontrás en Meta Ads Manager → Configuración de cuenta</p>
              </div>
              <div>
                <label className="label">Access Token</label>
                <input
                  value={form.accessToken}
                  onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
                  className="input font-mono"
                  placeholder="EAAxxxxxxxxxx..."
                  type="password"
                />
                <p className="text-xs text-gray-500 mt-1">Token de acceso del sistema desde Meta for Developers</p>
              </div>
              <div>
                <label className="label">Asignar a usuario</label>
                <select
                  value={form.userId}
                  onChange={(e) => setForm({ ...form, userId: e.target.value })}
                  className="input"
                >
                  <option value="">Seleccionar usuario...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} — {u.email}</option>
                  ))}
                </select>
              </div>
              {formError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
                  {formError}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setModalOpen(false); setFormError(""); }} className="btn-secondary flex-1 justify-center">
                  Cancelar
                </button>
                <button
                  onClick={() => createMut.mutate()}
                  disabled={createMut.isPending || !form.name || !form.metaAccountId || !form.accessToken || !form.userId}
                  className="btn-primary flex-1 justify-center"
                >
                  {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                  Conectar cuenta
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
