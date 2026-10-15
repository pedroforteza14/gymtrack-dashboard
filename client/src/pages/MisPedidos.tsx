import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Truck, MessageCircle, AlertTriangle, Check } from "lucide-react";
import { Skeleton } from "../components/Skeleton";
import { api } from "../lib/api";
import { currency, dateShort, waLink } from "../lib/format";
import {
  etapaDe, etapaPedido, diaDelPedido, diasDeAtraso, resumenProductos, mensajeAlCliente,
} from "../lib/pedidos";
import type { Pedido, Etapa } from "../lib/pedidos";

interface VentaConPedido {
  id: string; saleNumber: string; createdAt: string;
  totalRevenue: number; pendingAmount?: number | null; paymentStatus: string;
  client?: { name: string } | null;
  items: { quantity: number; product: { name: string } }[];
  pedido: Pedido;
}

const PASOS: { etapa: Etapa; label: string; fecha: (p: Pedido) => string | null | undefined }[] = [
  { etapa: "FABRICACION", label: "En fabricación", fecha: () => null },
  { etapa: "FABRICADO", label: "Fabricado", fecha: (p) => p.fabricatedAt },
  { etapa: "LISTO", label: "Listo", fecha: (p) => p.packedAt },
  { etapa: "ENTREGADO", label: "Entregado", fecha: (p) => p.deliveredAt },
];
const ORDEN: Etapa[] = PASOS.map((p) => p.etapa);

/** Primero lo que necesita atención: atrasados, después listos, después por fecha estimada. */
function prioridad(a: VentaConPedido, b: VentaConPedido): number {
  const atrasoA = diasDeAtraso(a.pedido), atrasoB = diasDeAtraso(b.pedido);
  if (atrasoA !== atrasoB) return atrasoB - atrasoA;
  const listoA = etapaDe(a.pedido) === "LISTO" ? 1 : 0, listoB = etapaDe(b.pedido) === "LISTO" ? 1 : 0;
  if (listoA !== listoB) return listoB - listoA;
  const estA = a.pedido.estimatedDate ? new Date(a.pedido.estimatedDate).getTime() : Infinity;
  const estB = b.pedido.estimatedDate ? new Date(b.pedido.estimatedDate).getTime() : Infinity;
  if (estA !== estB) return estA - estB;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

export default function MisPedidos() {
  const [vista, setVista] = useState<"curso" | "entregados">("curso");

  const { data: ventas = [], isLoading } = useQuery<VentaConPedido[]>({
    queryKey: ["mis-pedidos"],
    queryFn: () => api.get("/sales/pedidos").then((r) => r.data),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const enCurso = ventas.filter((v) => !v.pedido.deliveredAt).sort(prioridad);
  const entregados = ventas
    .filter((v) => v.pedido.deliveredAt)
    .sort((a, b) => new Date(b.pedido.deliveredAt!).getTime() - new Date(a.pedido.deliveredAt!).getTime());
  const atrasados = enCurso.filter((v) => diasDeAtraso(v.pedido) > 0).length;
  const listos = enCurso.filter((v) => etapaDe(v.pedido) === "LISTO").length;
  const lista = vista === "curso" ? enCurso : entregados;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Truck size={24} className="text-gray-200" /> Mis pedidos
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {enCurso.length} en curso
          {listos > 0 && <span className="text-white"> · {listos} listo{listos > 1 ? "s" : ""} para entregar</span>}
          {atrasados > 0 && <span className="text-red-400"> · {atrasados} atrasado{atrasados > 1 ? "s" : ""}</span>}
        </p>
      </div>

      <div className="flex gap-1 mb-5 bg-gray-900 border border-gray-800 rounded-lg p-1 w-fit">
        {([["curso", `En curso (${enCurso.length})`], ["entregados", `Entregados (${entregados.length})`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setVista(k)}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${vista === k ? "bg-white text-gray-950 font-medium" : "text-gray-400 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)
        ) : lista.length === 0 ? (
          <div className="py-12 text-center text-gray-500 bg-gray-900 border border-gray-800 rounded-xl text-sm">
            {vista === "curso"
              ? "No tenés pedidos en curso. Cuando marques un presupuesto como Ganado, el pedido aparece acá."
              : "Todavía no se entregó ningún pedido tuyo."}
          </div>
        ) : (
          lista.map((v) => <TarjetaPedido key={v.id} venta={v} />)
        )}
      </div>
    </div>
  );
}

function TarjetaPedido({ venta }: { venta: VentaConPedido }) {
  const p = venta.pedido;
  const etapa = etapaDe(p);
  const paso = ORDEN.indexOf(etapa);
  const atraso = diasDeAtraso(p);
  const saldo = venta.paymentStatus === "PAID" ? 0 : Number(venta.pendingAmount ?? 0);
  const productos = resumenProductos(venta.items.map((i) => (i.quantity > 1 ? `${i.product.name} x${i.quantity}` : i.product.name)));
  const wa = waLink(p.clientPhone, mensajeAlCliente(p, productos, saldo));
  const e = etapaPedido(p);

  return (
    <div className={`bg-gray-900 border rounded-xl p-4 ${atraso > 0 ? "border-red-500/50" : "border-gray-800"}`}>
      {/* Cliente y estado */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-white truncate">{p.clientName || venta.client?.name || "Cliente"}</p>
          <p className="text-sm text-gray-400 truncate">{productos}</p>
          <p className="text-xs text-gray-600 mt-0.5 font-mono">{p.fichaNumber} · {venta.saleNumber} · {dateShort(venta.createdAt)}</p>
        </div>
        <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${e.color}`}>{e.label}</span>
      </div>

      {/* Etapas */}
      <ol className="grid grid-cols-4 gap-1 mt-4" aria-label="Etapas del pedido">
        {PASOS.map((s, i) => {
          const hecho = i <= paso;
          const fecha = s.fecha(p);
          return (
            <li key={s.etapa} className="flex flex-col items-center text-center">
              <div className="flex items-center w-full">
                <div className={`h-0.5 flex-1 ${i === 0 ? "invisible" : hecho ? "bg-white" : "bg-gray-700"}`} />
                <div className={`w-5 h-5 rounded-full grid place-items-center flex-shrink-0 ${hecho ? "bg-white text-gray-950" : "border border-gray-600"}`}>
                  {hecho && <Check size={12} strokeWidth={3} />}
                </div>
                <div className={`h-0.5 flex-1 ${i === PASOS.length - 1 ? "invisible" : i < paso ? "bg-white" : "bg-gray-700"}`} />
              </div>
              <span className={`text-[11px] mt-1 ${hecho ? "text-gray-200" : "text-gray-600"}`}>{s.label}</span>
              {hecho && fecha && <span className="text-[10px] text-gray-500">{diaDelPedido(fecha)}</span>}
            </li>
          );
        })}
      </ol>

      {/* Fecha, saldo y aviso al cliente */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-gray-800">
        <div className="text-xs space-y-0.5">
          {atraso > 0 ? (
            <p className="text-red-400 flex items-center gap-1">
              <AlertTriangle size={12} /> Atrasado {atraso} día{atraso > 1 ? "s" : ""} (estaba para el {diaDelPedido(p.estimatedDate!)})
            </p>
          ) : !p.deliveredAt && p.estimatedDate ? (
            <p className="text-gray-400">Entrega aprox. {diaDelPedido(p.estimatedDate)}</p>
          ) : !p.deliveredAt ? (
            <p className="text-gray-600">Sin fecha estimada todavía</p>
          ) : null}
          {saldo > 0 && <p className="text-yellow-400">Falta cobrar {currency(saldo)}</p>}
        </div>
        {wa ? (
          <a href={wa} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-200 text-gray-950 rounded-lg text-xs font-semibold transition-colors">
            <MessageCircle size={13} /> Avisarle al cliente
          </a>
        ) : (
          <span className="text-xs text-gray-600" title="Pedile al dueño que cargue el teléfono en la ficha">
            La ficha no tiene teléfono
          </span>
        )}
      </div>
    </div>
  );
}
