import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Coins, Check, Settings, UserPlus, X, Loader2, AlertTriangle, Mail } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import { getRole } from "../lib/auth";
import { currency, dateLong } from "../lib/format";
import { Skeleton } from "../components/Skeleton";

interface ComisionVenta {
  id: string; saleNumber: string; createdAt: string;
  totalRevenue: number; paymentStatus: string; pendingAmount?: number;
  channel?: string | null; deletedAt?: string | null;
  commissionRate?: number; commissionAmount?: number;
  commissionStatus?: string; commissionPaidAt?: string | null;
  client?: { id: string; name: string } | null;
  seller?: { id: string; name: string } | null;
}
interface Vendedor {
  id: string; name: string; email: string; active: boolean;
  commissionRate?: number | null; ventas: number; facturado: number; comisionAPagar: number;
}

const ESTADO = {
  EN_PROCESO: { label: "En proceso", clase: "bg-yellow-400/10 text-yellow-400", ayuda: "El cliente todavía debe" },
  A_PAGAR:    { label: "A pagar",    clase: "bg-green-400/10 text-green-400",   ayuda: "Venta cobrada, lista para liquidar" },
  PAGADA:     { label: "Pagada",     clase: "bg-gray-400/10 text-gray-400",     ayuda: "Ya liquidada" },
  ANULADA:    { label: "Anulada",    clase: "bg-red-400/10 text-red-400",       ayuda: "Venta dada de baja: descontar" },
} as const;

export default function Comisiones() {
  const qc = useQueryClient();
  const esDueño = getRole() === "OWNER";
  const [sel, setSel] = useState<string[]>([]);
  const [config, setConfig] = useState(false);
  const [alta, setAlta] = useState(false);

  const { data, isLoading } = useQuery<{ ventas: ComisionVenta[]; totales: Record<string, number> }>({
    queryKey: ["comisiones"],
    queryFn: () => api.get("/comisiones").then((r) => r.data),
  });

  const { data: vendedores = [] } = useQuery<Vendedor[]>({
    queryKey: ["vendedores"],
    queryFn: () => api.get("/comisiones/vendedores").then((r) => r.data),
    enabled: esDueño,
  });

  const liquidar = useMutation({
    mutationFn: (saleIds: string[]) => api.post("/comisiones/liquidar", { saleIds }),
    onSuccess: ({ data }) => {
      toast.success(`${data.liquidadas} comisión/es liquidadas por ${currency(data.monto)}`);
      setSel([]);
      qc.invalidateQueries({ queryKey: ["comisiones"] });
      qc.invalidateQueries({ queryKey: ["vendedores"] });
    },
  });

  const { data: mail } = useQuery<{ configurado: boolean }>({
    queryKey: ["avisos-mail"],
    queryFn: () => api.get("/notificaciones/mail").then((r) => r.data),
    enabled: esDueño,
  });
  const probarMail = useMutation({
    mutationFn: () => api.post("/notificaciones/mail/probar", {}),
    onSuccess: () => toast.success("Mail de prueba enviado ✓"),
    onError: (e: any) => toast.error(e.response?.data?.error ?? "No se pudo enviar"),
  });

  const ventas = data?.ventas ?? [];
  const t = data?.totales ?? {};
  const aPagar = ventas.filter((v) => v.commissionStatus === "A_PAGAR");
  const anuladasConPago = ventas.filter((v) => v.deletedAt && v.commissionPaidAt);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-title">{esDueño ? "Comisiones" : "Mis comisiones"}</h1>
          <p className="text-sm text-gray-400">
            {esDueño ? "Sobre el total de cada venta de WhatsApp" : "Lo que llevás ganado"}
          </p>
        </div>
        {esDueño && (
          <div className="flex gap-2">
            <button onClick={() => setAlta(true)} className="btn-secondary flex items-center gap-2">
              <UserPlus size={14} /> Nuevo vendedor
            </button>
            <button onClick={() => setConfig(true)} className="btn-secondary flex items-center gap-2">
              <Settings size={14} /> Porcentaje
            </button>
          </div>
        )}
      </div>

      {/* Totales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(["EN_PROCESO", "A_PAGAR", "PAGADA", "ANULADA"] as const).map((k) => {
          const clave = { EN_PROCESO: "enProceso", A_PAGAR: "aPagar", PAGADA: "pagada", ANULADA: "anulada" }[k];
          return (
            <div key={k} className="card p-4">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO[k].clase}`}>
                {ESTADO[k].label}
              </span>
              <p className="text-2xl font-semibold text-white mt-2">{currency(t[clave] ?? 0)}</p>
              <p className="text-xs text-gray-500 mt-1">{ESTADO[k].ayuda}</p>
            </div>
          );
        })}
      </div>

      {/* Avisos por mail */}
      {esDueño && (
        <div className="card p-3 flex items-center gap-3 text-sm flex-wrap">
          <Mail size={15} className={mail?.configurado ? "text-green-400" : "text-gray-500"} />
          <span className="text-gray-300 flex-1 min-w-[220px]">
            {mail?.configurado
              ? "Te llega un mail por cada venta que cargue un vendedor."
              : "Los avisos por mail están apagados: hoy sólo aparecen en la campanita."}
          </span>
          {mail?.configurado ? (
            <button onClick={() => probarMail.mutate()} disabled={probarMail.isPending}
              className="btn-secondary text-xs disabled:opacity-40">
              {probarMail.isPending ? "Enviando…" : "Enviar prueba"}
            </button>
          ) : (
            <span className="text-xs text-gray-500">
              Cargá RESEND_API_KEY y AVISOS_PARA en el servidor
            </span>
          )}
        </div>
      )}

      {/* Aviso de comisiones pagadas sobre ventas anuladas */}
      {esDueño && anuladasConPago.length > 0 && (
        <div className="card p-4 border-red-500/30 bg-red-500/5 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-red-400 font-medium">
              Hay {anuladasConPago.length} comisión/es ya pagadas sobre ventas que después se anularon
            </p>
            <p className="text-gray-400 mt-0.5">
              Son {currency(anuladasConPago.reduce((a, v) => a + Number(v.commissionAmount ?? 0), 0))} a
              descontar de la próxima liquidación: {anuladasConPago.map((v) => v.saleNumber).join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* Vendedores */}
      {esDueño && vendedores.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {vendedores.map((v) => (
            <div key={v.id} className="card p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-white">{v.name}</p>
                {!v.active && <span className="badge-red">Inactiva</span>}
              </div>
              <p className="text-xs text-gray-500">{v.email}</p>
              <div className="flex gap-4 mt-3 text-sm">
                <div><p className="text-gray-500 text-xs">Ventas</p><p className="text-gray-200">{v.ventas}</p></div>
                <div><p className="text-gray-500 text-xs">Facturado</p><p className="text-gray-200">{currency(v.facturado)}</p></div>
                <div><p className="text-gray-500 text-xs">A pagar</p><p className="text-green-400">{currency(v.comisionAPagar)}</p></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Barra de liquidación */}
      {esDueño && aPagar.length > 0 && (
        <div className="card p-4 flex items-center justify-between gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={sel.length === aPagar.length && sel.length > 0}
              onChange={(e) => setSel(e.target.checked ? aPagar.map((v) => v.id) : [])}
              className="accent-white"
            />
            Seleccionar las {aPagar.length} listas para liquidar
          </label>
          <button
            onClick={() => liquidar.mutate(sel)}
            disabled={sel.length === 0 || liquidar.isPending}
            className="btn-primary flex items-center gap-2 disabled:opacity-40"
          >
            {liquidar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Liquidar {sel.length > 0 && `(${currency(ventas.filter((v) => sel.includes(v.id)).reduce((a, v) => a + Number(v.commissionAmount ?? 0), 0))})`}
          </button>
        </div>
      )}

      {/* Detalle */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr className="text-left">
              {esDueño && <th className="px-4 py-3 w-10"></th>}
              <th className="px-4 py-3 text-gray-400 font-medium">Venta</th>
              {esDueño && <th className="px-4 py-3 text-gray-400 font-medium">Vendedora</th>}
              <th className="px-4 py-3 text-gray-400 font-medium">Cliente</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Total</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">%</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Comisión</th>
              <th className="px-4 py-3 text-gray-400 font-medium">Estado</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Fecha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: esDueño ? 9 : 7 }).map((_, c) => (
                  <td key={c} className="px-4 py-4"><Skeleton className="h-4 w-full" /></td>))}</tr>
              ))
            ) : ventas.length === 0 ? (
              <tr><td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                Todavía no hay comisiones. Se generan solas con cada venta de WhatsApp.
              </td></tr>
            ) : ventas.map((v) => {
              const est = ESTADO[(v.commissionStatus ?? "EN_PROCESO") as keyof typeof ESTADO];
              const liquidable = v.commissionStatus === "A_PAGAR";
              return (
                <tr key={v.id} className={`hover:bg-gray-800/30 ${v.deletedAt ? "opacity-60" : ""}`}>
                  {esDueño && (
                    <td className="px-4 py-4">
                      {liquidable && (
                        <input
                          type="checkbox"
                          checked={sel.includes(v.id)}
                          onChange={(e) => setSel(e.target.checked ? [...sel, v.id] : sel.filter((x) => x !== v.id))}
                          className="accent-white"
                        />
                      )}
                    </td>
                  )}
                  <td className="px-4 py-4 font-mono text-gray-200">
                    {v.saleNumber}
                    {v.deletedAt && <span className="ml-2 badge-red text-[10px]">anulada</span>}
                  </td>
                  {esDueño && <td className="px-4 py-4 text-gray-300">{v.seller?.name ?? "—"}</td>}
                  <td className="px-4 py-4 text-gray-300">{v.client?.name ?? "—"}</td>
                  <td className="px-4 py-4 text-right text-gray-300">{currency(Number(v.totalRevenue))}</td>
                  <td className="px-4 py-4 text-right text-gray-500">{v.commissionRate ?? "—"}%</td>
                  <td className="px-4 py-4 text-right font-medium text-white">{currency(Number(v.commissionAmount ?? 0))}</td>
                  <td className="px-4 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${est.clase}`}>{est.label}</span>
                  </td>
                  <td className="px-4 py-4 text-right text-gray-400">{dateLong(v.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {config && <ModalPorcentaje onClose={() => setConfig(false)} />}
      {alta && <ModalVendedor onClose={() => setAlta(false)} />}
    </div>
  );
}

/* ─── Porcentaje global ─── */
function ModalPorcentaje({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["comision-config"], queryFn: () => api.get("/comisiones/config").then((r) => r.data) });
  const [valor, setValor] = useState<string>("");

  const guardar = useMutation({
    mutationFn: () => api.put("/comisiones/config", { commissionRate: Number(valor) }),
    onSuccess: () => {
      toast.success("Porcentaje actualizado");
      qc.invalidateQueries({ queryKey: ["comision-config"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? "No se pudo guardar"),
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white flex items-center gap-2"><Coins size={16} /> Porcentaje de comisión</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>
        <label className="label">Porcentaje sobre el total de la venta</label>
        <div className="flex items-center gap-2">
          <input
            type="number" step="0.5" min="0" max="100" className="input"
            placeholder={String(data?.commissionRate ?? 3)}
            value={valor} onChange={(e) => setValor(e.target.value)}
          />
          <span className="text-gray-400">%</span>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Actual: {data?.commissionRate ?? 3}%. Cambiarlo afecta solo a las ventas nuevas —
          las comisiones ya generadas conservan el porcentaje con el que nacieron.
        </p>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={() => guardar.mutate()} disabled={!valor || guardar.isPending} className="btn-primary flex-1 disabled:opacity-40">
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Alta de vendedor ─── */
function ModalVendedor({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", email: "", password: "", commissionRate: "" });

  const crear = useMutation({
    mutationFn: () => api.post("/comisiones/vendedores", {
      name: f.name, email: f.email, password: f.password,
      ...(f.commissionRate ? { commissionRate: Number(f.commissionRate) } : {}),
    }),
    onSuccess: () => {
      toast.success("Vendedor creado");
      qc.invalidateQueries({ queryKey: ["vendedores"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? "No se pudo crear"),
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white flex items-center gap-2"><UserPlus size={16} /> Nuevo vendedor</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div><label className="label">Nombre</label>
            <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><label className="label">Mail</label>
            <input type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div><label className="label">Contraseña inicial</label>
            <input type="password" className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            <p className="text-xs text-gray-500 mt-1">Que la cambie en el primer ingreso.</p></div>
          <div><label className="label">Porcentaje propio <span className="text-gray-600">(opcional)</span></label>
            <input type="number" step="0.5" className="input" placeholder="usa el general"
              value={f.commissionRate} onChange={(e) => setF({ ...f, commissionRate: e.target.value })} /></div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={() => crear.mutate()} disabled={!f.name || !f.email || f.password.length < 6 || crear.isPending}
            className="btn-primary flex-1 disabled:opacity-40">
            {crear.isPending ? <Loader2 size={14} className="animate-spin mx-auto" /> : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}
