import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

// Un item puede ser un producto del catálogo o un material suelto (descripción libre)
const itemSchema = z.object({
  productId: z.string().optional().nullable(),
  description: z.string().optional(),
  quantity: z.number().int().positive(),
  unitCost: z.number().min(0),
}).refine((i) => !!i.productId || !!i.description?.trim(), {
  message: "Indicá un producto o una descripción",
});

const createSchema = z.object({
  supplier: z.string().min(1),
  notes: z.string().optional(),
  expectedAt: z.string().optional(),
  items: z.array(itemSchema).min(1),
});

async function generateOrderNumber(): Promise<string> {
  const count = await prisma.purchaseOrder.count();
  return `OC-${String(count + 1).padStart(5, "0")}`;
}

router.get("/", async (_req: AuthRequest, res: Response): Promise<void> => {
  const orders = await prisma.purchaseOrder.findMany({
    include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(orders);
});

router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: req.params.id },
    include: { items: { include: { product: true } } },
  });
  if (!order) { res.status(404).json({ error: "Orden no encontrada" }); return; }
  res.json(order);
});

router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { supplier, notes, expectedAt, items } = parsed.data;

  const totalCost = items.reduce((s, i) => s + i.unitCost * i.quantity, 0);
  const orderNumber = await generateOrderNumber();

  const order = await prisma.purchaseOrder.create({
    data: {
      orderNumber,
      supplier,
      notes,
      totalCost,
      expectedAt: expectedAt ? new Date(expectedAt) : undefined,
      items: {
        create: items.map((i) => ({
          productId: i.productId || null,
          description: i.description || null,
          quantity: i.quantity,
          unitCost: i.unitCost,
          subtotal: i.unitCost * i.quantity,
        })),
      },
    },
    include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
  });
  res.status(201).json(order);
});

// Marcar la compra como recibida (trabajamos a pedido: no se toca stock).
// Al recibirla se registra como gasto de la empresa, para que impacte en el balance.
router.post("/:id/receive", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = z.object({
    paymentSource: z.enum(["VISA", "MASTER", "PAPA", "EFECTIVO_MP", "OTRO"]).optional(),
  }).safeParse(req.body ?? {});
  const paymentSource = parsed.success ? parsed.data.paymentSource ?? "EFECTIVO_MP" : "EFECTIVO_MP";

  const order = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
  if (!order) { res.status(404).json({ error: "Compra no encontrada" }); return; }
  if (order.status === "RECEIVED") { res.status(400).json({ error: "Ya fue recibida" }); return; }

  const receivedAt = new Date();
  await prisma.purchaseOrder.update({
    where: { id: order.id },
    data: { status: "RECEIVED", receivedAt },
  });

  // Crear el gasto asociado (si todavía no existe)
  const yaExiste = await prisma.expense.findUnique({ where: { purchaseOrderId: order.id } });
  if (!yaExiste && Number(order.totalCost) > 0) {
    await prisma.expense.create({
      data: {
        purchaseOrderId: order.id,
        date: receivedAt,
        concept: `Compra ${order.orderNumber} — ${order.supplier}`,
        amount: order.totalCost,
        paymentSource,
        expenseType: "EMPRESA",
        category: "Compras a proveedores",
      },
    });
  }
  res.json({ ok: true });
});

router.delete("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  await prisma.purchaseOrder.update({
    where: { id: req.params.id },
    data: { status: "CANCELLED" },
  });
  // Si la compra ya había generado un gasto, lo damos de baja también
  await prisma.expense.updateMany({
    where: { purchaseOrderId: req.params.id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  res.json({ ok: true });
});

export default router;
