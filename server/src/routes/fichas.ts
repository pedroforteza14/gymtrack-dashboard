import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { generateFichaPDF, FichaItem } from "../lib/fichaPdf";

const router = Router();

const itemSchema = z.object({ cantidad: z.number().int().min(0), producto: z.string() });

const fichaSchema = z.object({
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

async function generateFichaNumber(): Promise<string> {
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

router.get("/", authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
  const fichas = await prisma.fichaPedido.findMany({
    where: { deletedAt: null },
    include: { payments: { orderBy: { date: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(fichas);
});

router.get("/:id", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
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
  await prisma.fichaPedido.update({ where: { id: fichaId }, data: { deposit: total } });
}

router.get("/:id/payments", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const payments = await prisma.payment.findMany({ where: { fichaId: req.params.id }, orderBy: { date: "asc" } });
  res.json(payments);
});

router.post("/:id/payments", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
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

router.delete("/:id/payments/:paymentId", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  await prisma.payment.delete({ where: { id: req.params.paymentId } });
  await recalcDeposit(req.params.id);
  res.json({ ok: true });
});

router.post("/", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = fichaSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const fichaNumber = await generateFichaNumber();
  const ficha = await prisma.fichaPedido.create({ data: { fichaNumber, ...toData(parsed.data) } as never });
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
        totalRevenue: ficha.total,
        totalCost: 0,
        totalProfit: ficha.total,
        notes: `Pedido ${ficha.fichaNumber} — ${ficha.clientName}${detalle ? ` (${detalle})` : ""}`,
        createdAt: ficha.deliveredAt ?? new Date(),
      },
    });
  } else if (!delivered && existing) {
    await prisma.sale.delete({ where: { id: existing.id } });
  }
}

router.put("/:id", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = fichaSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const ficha = await prisma.fichaPedido.update({
    where: { id: req.params.id },
    data: toData(parsed.data as z.infer<typeof fichaSchema>) as never,
  });
  await syncSaleForFicha(ficha.id);
  res.json(ficha);
});

router.delete("/:id", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  await prisma.sale.deleteMany({ where: { fichaId: req.params.id } });
  await prisma.fichaPedido.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// PDF (token por query para abrir en pestaña nueva)
router.get("/:id/pdf", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
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
