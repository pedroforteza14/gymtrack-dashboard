import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Archive, Download, Search, User, Package, Coins, FileSpreadsheet,
} from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import { currency, dateShort } from "../lib/format";
import CountUp from "../components/CountUp";
import { Skeleton } from "../components/Skeleton";

interface FichaItem { cantidad: number; producto: string; }
interface Ficha {
  id: string; fichaNumber: string; date: string; estimatedDate?: string;
  clientName: string; clientPhone?: string; clientLocation?: string;
  items: FichaItem[];
  total: number; deposit: number; paymentMethod?: string;
  deliveryType?: string; deliveryVia?: string; destination?: string;
  observations?: string;
  fabricatedAt?: string; packedAt?: string; deliveredAt?: string; deliveredBy?: string;
}

const PAYMENT_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo", TRANSFERENCIA: "Transferencia", TARJETA: "Tarjeta",
};
const DELIVERY_LABEL: Record<string, string> = { RETIRO: "Retiro por fábrica", FLETE: "Flete" };

// Escapa un valor para CSV
function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCSV(rows: Ficha[]) {
  const headers = [
    "N° Ficha", "Fecha entrega", "Cliente", "Teléfono", "Localidad",
    "Productos", "Total", "Seña", "Saldo", "Método de pago",
    "Entrega", "Destino", "Fecha pedido", "Fabricado", "Embalado", "Entregado por", "Observaciones",
  ];
  const lines = rows.map((f) => [
    f.fichaNumber,
    f.deliveredAt ? dateShort(f.deliveredAt) : "",
    f.clientName,
    f.clientPhone ?? "",
    f.clientLocation ?? "",
    (f.items ?? []).map((i) => `${i.cantidad}x ${i.producto}`).join(" | "),
    Number(f.total),
    Number(f.deposit),
    Number(f.total) - Number(f.deposit),
    f.paymentMethod ? PAYMENT_LABEL[f.paymentMethod] ?? f.paymentMethod : "",
    f.deliveryType ? DELIVERY_LABEL[f.deliveryType] ?? f.deliveryType : "",
    f.destination ?? "",
    dateShort(f.date),
    f.fabricatedAt ? dateShort(f.fabricatedAt) : "",
    f.packedAt ? dateShort(f.packedAt) : "",
    f.deliveredBy ?? "",
    f.observations ?? "",
  ].map(csvCell).join(";"));

  // BOM para que Excel abra bien los acentos; ";" como separador (Excel en español)
  const csv = "﻿" + [headers.join(";"), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `entregas-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`${rows.length} entrega${rows.length !== 1 ? "s" : ""} exportada${rows.length !== 1 ? "s" : ""}`);
}

export default function Historial() {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: fichas = [], isLoading } = useQuery<Ficha[]>({
    queryKey: ["fichas"],
    queryFn: () => api.get("/fichas").then((r) => r.data),
  });

  const entregadas = fichas
    .filter((f) => f.deliveredAt)
    .filter((f) => {
      const q = search.toLowerCase();
      const okSearch = !q || f.clientName.toLowerCase().includes(q) || f.fichaNumber.toLowerCase().includes(q) ||
        (f.items ?? []).some((i) => i.producto.toLowerCase().includes(q));
      const d = new Date(f.deliveredAt!).getTime();
      const okFrom = !from || d >= new Date(from).getTime();
      const okTo = !to || d <= new Date(to + "T23:59:59").getTime();
      return okSearch && okFrom && okTo;
    })
    .sort((a, b) => new Date(b.deliveredAt!).getTime() - new Date(a.deliveredAt!).getTime());

  const totalFacturado = entregadas.reduce((s, f) => s + Number(f.total), 0);
  const totalUnidades = entregadas.reduce((s, f) => s + (f.items ?? []).reduce((n, i) => n + Number(i.cantidad || 0), 0), 0);
  const hasFilters = search || from || to;

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Archive size={24} /> Historial de entregas</h1>
          <p className="text-gray-400 text-sm mt-1">Todos los pedidos entregados, con su detalle</p>
        </div>
        <button onClick={() => exportCSV(entregadas)} disabled={entregadas.length === 0} className="btn-primary">
          <FileSpreadsheet size={16} /> Exportar a Excel
        </button>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-green-500/10 text-green-400"><Archive size={18} /></div>
            <span className="text-gray-400 text-sm">Pedidos entregados</span>
          </div>
          <p className="text-2xl font-bold text-white"><CountUp value={entregadas.length} /></p>
          {hasFilters && <p className="text-xs text-gray-500 mt-1">con los filtros aplicados</p>}
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-white/10 text-white"><Coins size={18} /></div>
            <span className="text-gray-400 text-sm">Total facturado</span>
          </div>
          <p className="text-2xl font-bold text-white"><CountUp value={totalFacturado} format={currency} /></p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-white/10 text-white"><Package size={18} /></div>
            <span className="text-gray-400 text-sm">Máquinas entregadas</span>
          </div>
          <p className="text-2xl font-bold text-white"><CountUp value={totalUnidades} /></p>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="label">Buscar</label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Cliente, ficha o producto..." className="input pl-9" />
          </div>
        </div>
        <div>
          <label className="label">Desde</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input w-auto" />
        </div>
        <div>
          <label className="label">Hasta</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input w-auto" />
        </div>
        {hasFilters && (
          <button onClick={() => { setSearch(""); setFrom(""); setTo(""); }}
            className="text-xs text-gray-400 hover:text-white pb-2.5">Limpiar filtros</button>
        )}
      </div>

      {/* Tabla */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr className="text-left">
              <th className="px-6 py-3 text-gray-400 font-medium">Entrega</th>
              <th className="px-4 py-3 text-gray-400 font-medium">Ficha</th>
              <th className="px-4 py-3 text-gray-400 font-medium">Cliente</th>
              <th className="px-4 py-3 text-gray-400 font-medium">Productos</th>
              <th className="px-4 py-3 text-gray-400 font-medium">Pago</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-right">Total</th>
              <th className="px-4 py-3 text-gray-400 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 7 }).map((_, c) => (
                  <td key={c} className="px-4 py-4"><Skeleton className="h-4 w-full" /></td>
                ))}</tr>
              ))
            ) : entregadas.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                {hasFilters ? "Sin entregas con esos filtros" : "Todavía no hay pedidos entregados"}
              </td></tr>
            ) : entregadas.map((f) => (
              <tr key={f.id} className="hover:bg-gray-800/30">
                <td className="px-6 py-4 text-gray-300 whitespace-nowrap">{dateShort(f.deliveredAt!)}</td>
                <td className="px-4 py-4 font-mono text-xs text-gray-400">{f.fichaNumber}</td>
                <td className="px-4 py-4">
                  <p className="text-gray-100 font-medium flex items-center gap-1"><User size={11} className="text-gray-500" />{f.clientName}</p>
                  {f.clientLocation && <p className="text-xs text-gray-500">{f.clientLocation}</p>}
                </td>
                <td className="px-4 py-4 text-gray-400 text-xs max-w-[240px]">
                  {(f.items ?? []).map((i) => `${i.cantidad}× ${i.producto}`).join(", ") || "—"}
                </td>
                <td className="px-4 py-4">
                  {f.paymentMethod
                    ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-700/60 text-gray-300">{PAYMENT_LABEL[f.paymentMethod] ?? f.paymentMethod}</span>
                    : <span className="text-gray-600 text-xs">—</span>}
                </td>
                <td className="px-4 py-4 text-right font-medium text-white whitespace-nowrap">{currency(Number(f.total))}</td>
                <td className="px-4 py-4">
                  <button
                    onClick={() => { const t = localStorage.getItem("token"); window.open(`${api.defaults.baseURL}/fichas/${f.id}/pdf?token=${t}`, "_blank"); }}
                    title="Ver ficha en PDF"
                    className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                    <Download size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
