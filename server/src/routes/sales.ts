import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

const saleItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
});

const createSaleSchema = z.object({
  items: z.array(saleItemSchema).min(1),
  notes: z.string().optional(),
  clientId: z.string().optional(),
});

async function generateSaleNumber(): Promise<string> {
  const count = await prisma.sale.count();
  return `VTA-${String(count + 1).padStart(5, "0")}`;
}

router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  const {
    page = "1",
    limit = "20",
    clientId,
    dateFrom,
    dateTo,
  } = req.query as Record<string, string>;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where: Record<string, unknown> = {};
  if (clientId)           where.clientId  = clientId;
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo   ? { lte: new Date(dateTo + "T23:59:59.999Z") } : {}),
    };
  }

  const [sales, total] = await prisma.$transaction([
    prisma.sale.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        items: { include: { product: { select: { name: true, sku: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: parseInt(limit),
    }),
    prisma.sale.count({ where }),
  ]);

  res.json({ sales, total, page: parseInt(page), limit: parseInt(limit) });
});

router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const sale = await prisma.sale.findUnique({
    where: { id: req.params.id },
    include: {
      client: { select: { id: true, name: true } },
      items: { include: { product: true } },
    },
  });
  if (!sale) { res.status(404).json({ error: "Venta no encontrada" }); return; }
  res.json(sale);
});

router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = createSaleSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { items, notes, clientId } = parsed.data;

  // Fetch products and validate stock
  const productIds = items.map((i) => i.productId);
  const products = await prisma.product.findMany({ where: { id: { in: productIds }, active: true } });

  for (const item of items) {
    const product = products.find((p) => p.id === item.productId);
    if (!product) {
      res.status(400).json({ error: `Producto ${item.productId} no encontrado` });
      return;
    }
    if (product.stock < item.quantity) {
      res.status(400).json({ error: `Stock insuficiente para ${product.name}. Stock actual: ${product.stock}` });
      return;
    }
  }

  const saleNumber = await generateSaleNumber();
  let totalCost = 0;
  let totalRevenue = 0;

  const saleItemsData = items.map((item) => {
    const product = products.find((p) => p.id === item.productId)!;
    const unitCost = Number(product.costPrice);
    const subtotal = item.unitPrice * item.quantity;
    const cost = unitCost * item.quantity;
    const profit = subtotal - cost;
    totalRevenue += subtotal;
    totalCost += cost;
    return {
      productId: item.productId,
      quantity: item.quantity,
      unitCost,
      unitPrice: item.unitPrice,
      subtotal,
      profit,
    };
  });

  const totalProfit = totalRevenue - totalCost;

  const sale = await prisma.$transaction(async (tx) => {
    const newSale = await tx.sale.create({
      data: {
        saleNumber,
        notes,
        totalCost,
        totalRevenue,
        totalProfit,
        ...(clientId ? { clientId } : {}),
        items: { create: saleItemsData },
      },
      include: {
        client: { select: { id: true, name: true } },
        items: { include: { product: true } },
      },
    });

    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          type: "SALE",
          quantity: -item.quantity,
          reason: `Venta ${saleNumber}`,
          saleId: newSale.id,
        },
      });
    }

    return newSale;
  });

  res.status(201).json(sale);
});

router.delete("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const sale = await prisma.sale.findUnique({
    where: { id: req.params.id },
    include: { items: true },
  });
  if (!sale) { res.status(404).json({ error: "Venta no encontrada" }); return; }

  await prisma.$transaction(async (tx) => {
    for (const item of sale.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      });
    }
    await tx.stockMovement.deleteMany({ where: { saleId: sale.id } });
    await tx.sale.delete({ where: { id: sale.id } });
  });

  res.json({ ok: true });
});

export default router;
