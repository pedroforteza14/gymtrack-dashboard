import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { cargarUsuario, soloDueño } from "../middleware/roles";

const router = Router();
router.use(authMiddleware);
router.use(cargarUsuario);
router.use(soloDueño);

const CANAL_LABEL: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  MERCADO_LIBRE: "Mercado Libre",
  TIENDA_NUBE: "Tienda Nube",
  LOCAL: "Local",
  OTRO: "Otro",
  SIN_DATO: "Sin registrar",
};

/* ═══════════════════════════════════════════════════════════
   MÉTRICAS DEL NEGOCIO
   Todo sale de las ventas vigentes (las anuladas no cuentan).
   ═══════════════════════════════════════════════════════════ */
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  const { desde, hasta } = req.query as Record<string, string>;
  const año = new Date().getFullYear();

  const where: Record<string, unknown> = { deletedAt: null };
  if (desde || hasta) {
    where.createdAt = {
      ...(desde ? { gte: new Date(desde) } : {}),
      ...(hasta ? { lte: new Date(hasta + "T23:59:59.999Z") } : {}),
    };
  }

  const ventas = await prisma.sale.findMany({
    where,
    select: {
      id: true, createdAt: true, totalRevenue: true, totalCost: true, totalProfit: true,
      channel: true, paymentStatus: true, pendingAmount: true,
      client: { select: { id: true, name: true } },
      seller: { select: { id: true, name: true } },
      items: {
        select: {
          quantity: true, subtotal: true,
          product: { select: { id: true, name: true, line: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const plata = (n: unknown) => Number(n ?? 0);
  const facturado = ventas.reduce((a, v) => a + plata(v.totalRevenue), 0);

  /* ── Por mes ── */
  const meses = new Map<string, { facturado: number; ventas: number; costo: number }>();
  for (const v of ventas) {
    const k = v.createdAt.toISOString().slice(0, 7);
    const m = meses.get(k) ?? { facturado: 0, ventas: 0, costo: 0 };
    m.facturado += plata(v.totalRevenue);
    m.costo += plata(v.totalCost);
    m.ventas += 1;
    meses.set(k, m);
  }
  const porMes = [...meses.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, m], i, arr) => {
      const previo = i > 0 ? arr[i - 1][1].facturado : null;
      return {
        mes,
        facturado: m.facturado,
        ventas: m.ventas,
        ticketPromedio: m.ventas ? Math.round(m.facturado / m.ventas) : 0,
        // cuánto cambió respecto del mes anterior
        variacion: previo && previo > 0 ? Math.round(((m.facturado - previo) / previo) * 1000) / 10 : null,
      };
    });

  /* ── Por canal ── */
  const canales = new Map<string, { facturado: number; ventas: number }>();
  for (const v of ventas) {
    const k = v.channel ?? "SIN_DATO";
    const c = canales.get(k) ?? { facturado: 0, ventas: 0 };
    c.facturado += plata(v.totalRevenue);
    c.ventas += 1;
    canales.set(k, c);
  }
  const porCanal = [...canales.entries()]
    .map(([canal, c]) => ({
      canal, label: CANAL_LABEL[canal] ?? canal,
      ...c,
      ticketPromedio: c.ventas ? Math.round(c.facturado / c.ventas) : 0,
      participacion: facturado ? Math.round((c.facturado / facturado) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.facturado - a.facturado);

  /* ── Productos más vendidos ── */
  const prods = new Map<string, { nombre: string; linea: string | null; unidades: number; facturado: number }>();
  for (const v of ventas) {
    for (const it of v.items) {
      if (!it.product) continue;
      const p = prods.get(it.product.id) ?? {
        nombre: it.product.name, linea: it.product.line, unidades: 0, facturado: 0,
      };
      p.unidades += it.quantity;
      p.facturado += plata(it.subtotal);
      prods.set(it.product.id, p);
    }
  }
  const topProductos = [...prods.values()].sort((a, b) => b.facturado - a.facturado).slice(0, 12);

  /* ── Por línea de producto ── */
  const lineas = new Map<string, number>();
  for (const p of prods.values()) {
    const k = p.linea || "Sin línea";
    lineas.set(k, (lineas.get(k) ?? 0) + p.facturado);
  }
  const porLinea = [...lineas.entries()]
    .map(([linea, monto]) => ({ linea, facturado: monto,
      participacion: facturado ? Math.round((monto / facturado) * 1000) / 10 : 0 }))
    .sort((a, b) => b.facturado - a.facturado);

  /* ── Mejores clientes ── */
  const clis = new Map<string, { nombre: string; compras: number; facturado: number; ultima: Date }>();
  for (const v of ventas) {
    if (!v.client) continue;
    const c = clis.get(v.client.id) ?? { nombre: v.client.name, compras: 0, facturado: 0, ultima: v.createdAt };
    c.compras += 1;
    c.facturado += plata(v.totalRevenue);
    if (v.createdAt > c.ultima) c.ultima = v.createdAt;
    clis.set(v.client.id, c);
  }
  const topClientes = [...clis.values()].sort((a, b) => b.facturado - a.facturado).slice(0, 10);
  const repetidores = [...clis.values()].filter((c) => c.compras > 1).length;

  /* ── Resumen ── */
  const mesesConVenta = porMes.length;
  const mejor = porMes.reduce((a, m) => (!a || m.facturado > a.facturado ? m : a), null as any);
  const peor  = porMes.reduce((a, m) => (!a || m.facturado < a.facturado ? m : a), null as any);

  // Proyección del año: promedio mensual × 12, sólo si hay historia suficiente
  const promedioMensual = mesesConVenta ? facturado / mesesConVenta : 0;

  res.json({
    resumen: {
      facturado,
      ventas: ventas.length,
      ticketPromedio: ventas.length ? Math.round(facturado / ventas.length) : 0,
      costo: ventas.reduce((a, v) => a + plata(v.totalCost), 0),
      ganancia: ventas.reduce((a, v) => a + plata(v.totalProfit), 0),
      porCobrar: ventas.reduce((a, v) => a + plata(v.pendingAmount), 0),
      clientes: clis.size,
      repetidores,
      tasaRecompra: clis.size ? Math.round((repetidores / clis.size) * 1000) / 10 : 0,
      promedioMensual: Math.round(promedioMensual),
      proyeccionAnual: Math.round(promedioMensual * 12),
      mejorMes: mejor ? { mes: mejor.mes, facturado: mejor.facturado } : null,
      peorMes: peor ? { mes: peor.mes, facturado: peor.facturado } : null,
      // cuántas ventas no tienen el canal cargado
      sinCanal: ventas.filter((v) => !v.channel).length,
      año,
    },
    porMes, porCanal, topProductos, porLinea, topClientes,
  });
});

export default router;
