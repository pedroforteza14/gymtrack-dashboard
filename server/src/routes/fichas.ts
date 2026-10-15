import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { generateFichaPDF, FichaItem } from "../lib/fichaPdf";
import { cargarUsuario, soloDueño } from "../middleware/roles";
import { estaCobrada } from "../lib/comisiones";

const router = Router();
// Fichas, producción y cobros son del dueño. La vendedora ve la etapa de
// sus pedidos desde sus ventas, nunca la ficha completa.
router.use(authMiddleware);
router.use(cargarUsuario);
router.use(soloDueño);

const itemSchema = z.object({ cantidad: z.number().int().min(0), producto: z.string() });

const fichaSchema = z.object({
  clientId: z.string().optional().nullable(),
  clientName: z.string().min(1),
  clientPhone: z.string().optional(),
  clientLocation: z.string().optional(),
  estimatedDate: z.string().optional().nullable(),
  items: z.array(itemSchema).default([]),
  total: z.number().min(0).default(0),
  deposit: z.number().min(0).default(0),
  paymentMethod: z.enum(["EFECTIVO", "TRANSFERENCIA", "TARJETA"]).optional().nullable(),
  deliveryType: z.enum(["RETIRO", "FLETE"]).optional().nullable(),
  deliveryVia: z.enum(["CARGO", "BUSPACK"]).optional().nullable(),
  destination: z.string().optional(),
  transportInfo: z.string().optional(),
  observations: z.string().optional(),
  fabricatedAt: z.string().optional().nullable(),
  fabricatedBy: z.string().optional().nullable(),
  packedAt: z.string().optional().nullable(),
  packedBy: z.string().optional().nullable(),
  deliveredAt: z.string().optional().nullable(),
  deliveredBy: z.string().optional().nullable(),
});

export async function generateFichaNumber(): Promise<string> {
  const count = await prisma.fichaPedido.count();
  return `FP-${String(count + 1).padStart(5, "0")}`;
}

// Convierte a Date solo los campos de fecha PRESENTES (no toca los ausentes,
// así una edición parcial no borra las fechas que no se enviaron).
function toData(input: Record<string, unknown>) {
  const data: Record<string, unknown> = { ...input };
  for (const k of ["estimatedDate", "fabricatedAt", "packedAt", "deliveredAt"] as const) {
    if (k in data) data[k] = data[k] ? new Date(data[k] as string) : null;
  }
  return data;
}

router.get("/", async (_req: AuthRequest, res: Response): Promise<void> => {
  const fichas = await prisma.fichaPedido.findMany({
    where: { deletedAt: null },
    include: {
      payments: { orderBy: { date: "asc" } },
      client: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(fichas);
});

router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const ficha = await prisma.fichaPedido.findUnique({
    where: { id: req.params.id },
    include: { payments: { orderBy: { date: "asc" } } },
  });
  if (!ficha) { res.status(404).json({ error: "Ficha no encontrada" }); return; }
  res.json(ficha);
});

// ── Pagos parciales ──────────────────────────────────────
// Recalcula `deposit` de la ficha como la suma de sus pagos
async function recalcDeposit(fichaId: string): Promise<void> {
  const pagos = await prisma.payment.findMany({ where: { fichaId }, select: { amount: true } });
  const total = pagos.reduce((s, p) => s + Number(p.amount), 0);
  const ficha = await prisma.fichaPedido.update({ where: { id: fichaId }, data: { deposit: total } });
  await syncCobroDeVenta(ficha.id, Number(ficha.total), total);
}

// Si la ficha nació de una venta de un vendedor, lo cobrado se registra en la
// ficha y la venta lo copia: así la comisión pasa a "A pagar" cuando se termina de cobrar.
async function syncCobroDeVenta(fichaId: string, total: number, cobrado: number): Promise<void> {
  const venta = await prisma.sale.findUnique({ where: { fichaId } });
  if (!venta || venta.saleNumber.startsWith("PED-")) return;
  const pendingAmount = Math.max(total - cobrado, 0);
  const paymentStatus = pendingAmount <= 0 ? "PAID" : cobrado > 0 ? "PARTIAL" : "PENDING";
  const comisionViva = venta.commissionStatus === "EN_PROCESO" || venta.commissionStatus === "A_PAGAR";
  await prisma.sale.update({
    where: { id: venta.id },
    data: {
      pendingAmount,
      paymentStatus,
      ...(comisionViva
        ? { commissionStatus: estaCobrada(paymentStatus, pendingAmount) ? "A_PAGAR" : "EN_PROCESO" }
        : {}),
    },
  });
}

router.get("/:id/payments", async (req: AuthRequest, res: Response): Promise<void> => {
  const payments = await prisma.payment.findMany({ where: { fichaId: req.params.id }, orderBy: { date: "asc" } });
  res.json(payments);
});

router.post("/:id/payments", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = z.object({
    amount: z.number().positive(),
    date: z.string().optional(),
    method: z.enum(["EFECTIVO", "TRANSFERENCIA", "TARJETA", "OTRO"]).optional(),
    notes: z.string().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const ficha = await prisma.fichaPedido.findUnique({ where: { id: req.params.id } });
  if (!ficha) { res.status(404).json({ error: "Ficha no encontrada" }); return; }

  const payment = await prisma.payment.create({
    data: {
      fichaId: req.params.id,
      amount: parsed.data.amount,
      date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
      method: parsed.data.method ?? null,
      notes: parsed.data.notes ?? null,
    },
  });
  await recalcDeposit(req.params.id);
  res.status(201).json(payment);
});

router.delete("/:id/payments/:paymentId", async (req: AuthRequest, res: Response): Promise<void> => {
  await prisma.payment.delete({ where: { id: req.params.paymentId } });
  await recalcDeposit(req.params.id);
  res.json({ ok: true });
});

// Vincula la ficha a un cliente: usa el id recibido, o busca uno con el mismo
// nombre, o lo crea. Así los pedidos aparecen en la ficha del cliente.
async function resolveClientId(data: { clientId?: string | null; clientName: string; clientPhone?: string | null }): Promise<string | null> {
  if (data.clientId) return data.clientId;
  const nombre = data.clientName?.trim();
  if (!nombre) return null;
  const existente = await prisma.client.findFirst({
    where: { name: { equals: nombre, mode: "insensitive" }, deletedAt: null },
    select: { id: true },
  });
  if (existente) return existente.id;
  const creado = await prisma.client.create({
    data: { name: nombre, phone: data.clientPhone || null },
    select: { id: true },
  });
  return creado.id;
}

router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = fichaSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const fichaNumber = await generateFichaNumber();
  const clientId = await resolveClientId(parsed.data);
  const ficha = await prisma.fichaPedido.create({
    data: { fichaNumber, ...toData({ ...parsed.data, clientId }) } as never,
  });
  res.status(201).json(ficha);
});

// Sincroniza la venta de una ficha entregada:
// - si está entregada y no tiene venta → la crea (para que aparezca en Ventas/Dashboard)
// - si dejó de estar entregada y tenía venta → la borra
async function syncSaleForFicha(fichaId: string): Promise<void> {
  const ficha = await prisma.fichaPedido.findUnique({ where: { id: fichaId } });
  if (!ficha) return;
  const existing = await prisma.sale.findUnique({ where: { fichaId } });
  const delivered = !!ficha.deliveredAt;

  if (delivered && !existing) {
    const items = (ficha.items as unknown as FichaItem[]) ?? [];
    const detalle = items.map((i) => `${i.cantidad}× ${i.producto}`).join(", ");
    await prisma.sale.create({
      data: {
        saleNumber: `PED-${ficha.fichaNumber}`,
        fichaId: ficha.id,
        clientId: ficha.clientId,
        totalRevenue: ficha.total,
        totalCost: 0,
        totalProfit: ficha.total,
        notes: `Pedido ${ficha.fichaNumber} — ${ficha.clientName}${detalle ? ` (${detalle})` : ""}`,
        createdAt: ficha.deliveredAt ?? new Date(),
      },
    });
  } else if (!delivered && existing && existing.saleNumber.startsWith("PED-")) {
    // sólo se borra la venta que creó la entrega; una venta cargada por un vendedor queda
    await prisma.sale.delete({ where: { id: existing.id } });
  }
}

router.put("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = fichaSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const ficha = await prisma.fichaPedido.update({
    where: { id: req.params.id },
    data: toData(parsed.data as z.infer<typeof fichaSchema>) as never,
  });
  await syncSaleForFicha(ficha.id);
  await syncCobroDeVenta(ficha.id, Number(ficha.total), Number(ficha.deposit));
  res.json(ficha);
});

router.delete("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  // si el pedido se cae, la comisión de esa venta también (la ya pagada se descuenta a mano)
  await prisma.sale.updateMany({
    where: { fichaId: req.params.id, commissionStatus: { in: ["EN_PROCESO", "A_PAGAR"] } },
    data: { commissionStatus: "ANULADA" },
  });
  await prisma.sale.updateMany({ where: { fichaId: req.params.id }, data: { deletedAt: new Date() } });
  await prisma.fichaPedido.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
  res.json({ ok: true });
});

// PDF (token por query para abrir en pestaña nueva)
router.get("/:id/pdf", async (req: AuthRequest, res: Response): Promise<void> => {
  const ficha = await prisma.fichaPedido.findUnique({ where: { id: req.params.id } });
  if (!ficha) { res.status(404).json({ error: "Ficha no encontrada" }); return; }
  generateFichaPDF({
    fichaNumber: ficha.fichaNumber,
    date: ficha.date,
    estimatedDate: ficha.estimatedDate,
    clientName: ficha.clientName,
    clientPhone: ficha.clientPhone,
    clientLocation: ficha.clientLocation,
    items: (ficha.items as unknown as FichaItem[]) ?? [],
    total: Number(ficha.total),
    deposit: Number(ficha.deposit),
    paymentMethod: ficha.paymentMethod,
    deliveryType: ficha.deliveryType,
    deliveryVia: ficha.deliveryVia,
    destination: ficha.destination,
    transportInfo: ficha.transportInfo,
    observations: ficha.observations,
    fabricatedAt: ficha.fabricatedAt, fabricatedBy: ficha.fabricatedBy,
    packedAt: ficha.packedAt, packedBy: ficha.packedBy,
    deliveredAt: ficha.deliveredAt, deliveredBy: ficha.deliveredBy,
  }, res);
});

export default router;
