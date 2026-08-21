import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DatabaseBackup, FileSpreadsheet, FileJson, ShieldCheck, Loader2,
  Package, Users, ShoppingCart, FileText, ClipboardList, Wallet, Ruler,
} from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import { dateShort } from "../lib/format";

interface BackupData {
  generatedAt: string;
  resumen: Record<string, number>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

const num = (v: unknown) => Number(v ?? 0);
const fecha = (v: unknown) => (v ? dateShort(String(v)) : "");

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCSV(headers: string[], rows: unknown[][]): string {
  return "﻿" + [headers.join(";"), ...rows.map((r) => r.map(csvCell).join(";"))].join("\n");
}
function download(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Arma las planillas del backup a partir de los datos
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sheets(d: BackupData): { name: string; csv: string }[] {
  return [
    {
      name: "productos",
      csv: toCSV(
        ["Nombre", "SKU", "Línea", "Categoría", "Proveedor", "Costo", "Precio", "Activo"],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (d.products ?? []).map((p: any) => [p.name, p.sku, p.line ?? "", p.category?.name ?? "", p.supplier ?? "", num(p.costPrice), num(p.sellPrice), p.active ? "Sí" : "No"])
      ),
    },
    {
      name: "clientes",
      csv: toCSV(
        ["Nombre", "Email", "Teléfono", "Dirección", "Notas", "Alta"],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (d.clients ?? []).map((c: any) => [c.name, c.email ?? "", c.phone ?? "", c.address ?? "", c.notes ?? "", fecha(c.createdAt)])
      ),
    },
    {
      name: "ventas",
      csv: toCSV(
        ["N° Venta", "Fecha", "Cliente", "Productos", "Ingresos", "Costo", "Ganancia", "Pago", "Estado", "Notas"],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (d.sales ?? []).map((s: any) => [
          s.saleNumber, fecha(s.createdAt), s.client?.name ?? "",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (s.items ?? []).map((i: any) => `${i.quantity}x ${i.product?.name ?? ""}`).join(" | "),
          num(s.totalRevenue), num(s.totalCost), num(s.totalProfit),
          s.paymentMethod ?? "", s.paymentStatus ?? "", s.notes ?? "",
        ])
      ),
    },
    {
      name: "fichas-pedido",
      csv: toCSV(
        ["N° Ficha", "Fecha", "Cliente", "Teléfono", "Localidad", "Productos", "Total", "Seña", "Saldo", "Pago", "Entrega", "Destino", "Fabricado", "Embalado", "Entregado", "Observaciones"],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (d.fichas ?? []).map((f: any) => [
          f.fichaNumber, fecha(f.date), f.clientName, f.clientPhone ?? "", f.clientLocation ?? "",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (f.items ?? []).map((i: any) => `${i.cantidad}x ${i.producto}`).join(" | "),
          num(f.total), num(f.deposit), num(f.total) - num(f.deposit),
          f.paymentMethod ?? "", f.deliveryType ?? "", f.destination ?? "",
          fecha(f.fabricatedAt), fecha(f.packedAt), fecha(f.deliveredAt), f.observations ?? "",
        ])
      ),
    },
    {
      name: "presupuestos",
      csv: toCSV(
        ["N° Presupuesto", "Fecha", "Cliente", "Productos", "Total", "Estado", "Validez (días)", "Notas"],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (d.quotes ?? []).map((q: any) => [
          q.quoteNumber, fecha(q.createdAt), q.client?.name ?? "",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (q.items ?? []).map((i: any) => `${i.quantity}x ${i.product?.name ?? ""}`).join(" | "),
          num(q.totalAmount), q.status ?? "", q.validDays ?? "", q.notes ?? "",
        ])
      ),
    },
    {
      name: "gastos",
      csv: toCSV(
        ["Fecha", "Concepto", "Monto", "Tipo", "Medio de pago", "Categoría", "Notas"],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (d.expenses ?? []).map((e: any) => [fecha(e.date), e.concept, num(e.amount), e.expenseType ?? "", e.paymentSource ?? "", e.category ?? "", e.notes ?? ""])
      ),
    },
    {
      name: "planos",
      csv: toCSV(
        ["Título", "Estado", "Empleado", "Archivo", "Notas", "Fecha"],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (d.planos ?? []).map((p: any) => [p.title, p.status ?? "", p.employee?.name ?? "", p.fileName ?? "", p.notes ?? "", fecha(p.createdAt)])
      ),
    },
  ];
}

const ICONS: Record<string, typeof Package> = {
  productos: Package, clientes: Users, ventas: ShoppingCart,
  presupuestos: FileText, fichas: ClipboardList, gastos: Wallet, planos: Ruler,
};
const LABELS: Record<string, string> = {
  productos: "Productos", clientes: "Clientes", ventas: "Ventas",
  presupuestos: "Presupuestos", fichas: "Fichas de pedido", gastos: "Gastos",
  planos: "Planos", empleados: "Empleados",
};

export default function Backup() {
  const [downloading, setDownloading] = useState<"csv" | "json" | null>(null);

  const { data, isLoading } = useQuery<BackupData>({
    queryKey: ["backup"],
    queryFn: () => api.get("/backup").then((r) => r.data),
    staleTime: 0,
  });

  async function bajarExcel() {
    if (!data) return;
    setDownloading("csv");
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      for (const s of sheets(data)) {
        download(s.csv, `backup-${s.name}-${stamp}.csv`, "text/csv;charset=utf-8;");
        await new Promise((r) => setTimeout(r, 350)); // el navegador necesita aire entre descargas
      }
      toast.success("Backup descargado en planillas de Excel");
    } finally {
      setDownloading(null);
    }
  }

  function bajarJSON() {
    if (!data) return;
    setDownloading("json");
    download(JSON.stringify(data, null, 2), `backup-completo-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
    toast.success("Backup completo descargado");
    setDownloading(null);
  }

  const resumen = data?.resumen ?? {};

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><DatabaseBackup size={24} /> Backup</h1>
        <p className="text-gray-400 text-sm mt-1">Descargá una copia de toda la información del negocio</p>
      </div>

      {/* Qué incluye */}
      <div className="card p-5">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2"><ShieldCheck size={16} /> Qué se respalda</h3>
        {isLoading ? (
          <p className="text-gray-500 text-sm">Calculando...</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(resumen).map(([key, value]) => {
              const Icon = ICONS[key] ?? Package;
              return (
                <div key={key} className="bg-gray-800/50 rounded-lg p-3 flex items-center gap-3">
                  <Icon size={16} className="text-gray-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-white leading-tight">{value}</p>
                    <p className="text-xs text-gray-500 truncate">{LABELS[key] ?? key}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Descargas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5 flex flex-col">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-green-500/10 text-green-400"><FileSpreadsheet size={18} /></div>
            <span className="text-white font-semibold">Planillas de Excel</span>
          </div>
          <p className="text-gray-400 text-sm flex-1">
            Baja una planilla por sección (productos, clientes, ventas, fichas, presupuestos, gastos y planos).
            Ideal para consultar o trabajar los datos por tu cuenta.
          </p>
          <button onClick={bajarExcel} disabled={isLoading || downloading !== null} className="btn-primary justify-center mt-4">
            {downloading === "csv" ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
            {downloading === "csv" ? "Descargando..." : "Descargar Excel"}
          </button>
        </div>

        <div className="card p-5 flex flex-col">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-white/10 text-white"><FileJson size={18} /></div>
            <span className="text-white font-semibold">Copia completa</span>
          </div>
          <p className="text-gray-400 text-sm flex-1">
            Un único archivo con absolutamente toda la información, tal cual está guardada.
            Es el respaldo que sirve para restaurar el sistema si algo falla.
          </p>
          <button onClick={bajarJSON} disabled={isLoading || downloading !== null} className="btn-secondary justify-center mt-4">
            {downloading === "json" ? <Loader2 size={16} className="animate-spin" /> : <FileJson size={16} />}
            Descargar copia completa
          </button>
        </div>
      </div>

      <div className="card p-4 border-yellow-500/20">
        <p className="text-sm text-gray-400">
          <span className="text-yellow-400 font-medium">Recomendación:</span> descargá un backup una vez por mes
          y guardalo en Drive, Dropbox o un pendrive. Las fotos de productos y los archivos de planos no se incluyen
          (se pueden volver a subir).
        </p>
      </div>
    </div>
  );
}
