import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

const itemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
  unitCost: z.number().min(0),
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
          productId: i.productId,
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

// Mark order as received — updates stock and costPrice
router.post("/:id/receive", async (req: AuthRequest, res: Response): Promise<void> => {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: req.params.id },
    include: { items: true },
  });
  if (!order) { res.status(404).json({ error: "Orden no encontrada" }); return; }
  if (order.status === "RECEIVED") { res.status(400).json({ error: "Ya fue recibida" }); return; }

  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: {
          stock: { increment: item.quantity },
          costPrice: item.unitCost,
        },
      });
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          type: "IN",
          quantity: item.quantity,
          reason: `Orden de compra ${order.orderNumber}`,
        },
      });
    }
    await tx.purchaseOrder.update({
      where: { id: order.id },
      data: { status: "RECEIVED", receivedAt: new Date() },
    });
  });

  res.json({ ok: true });
});

router.delete("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  await prisma.purchaseOrder.update({
    where: { id: req.params.id },
    data: { status: "CANCELLED" },
  });
  res.json({ ok: true });
});

export default router;
