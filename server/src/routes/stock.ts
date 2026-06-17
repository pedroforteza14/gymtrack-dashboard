import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

const adjustSchema = z.object({
  productId: z.string(),
  type: z.enum(["IN", "OUT", "ADJUSTMENT"]),
  quantity: z.number().int(),
  reason: z.string().optional(),
});

router.get("/movements", async (req: AuthRequest, res: Response): Promise<void> => {
  const { productId, page = "1", limit = "30" } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const where = productId ? { productId } : {};
  const [movements, total] = await prisma.$transaction([
    prisma.stockMovement.findMany({
      where,
      include: { product: { select: { name: true, sku: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: parseInt(limit),
    }),
    prisma.stockMovement.count({ where }),
  ]);
  res.json({ movements, total });
});

router.post("/adjust", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = adjustSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { productId, type, quantity, reason } = parsed.data;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) { res.status(404).json({ error: "Producto no encontrado" }); return; }

  const delta = type === "OUT" ? -Math.abs(quantity) : Math.abs(quantity);
  const newStock = product.stock + delta;
  if (newStock < 0) {
    res.status(400).json({ error: "El stock no puede quedar negativo" });
    return;
  }

  await prisma.$transaction([
    prisma.product.update({ where: { id: productId }, data: { stock: newStock } }),
    prisma.stockMovement.create({
      data: { productId, type, quantity: delta, reason },
    }),
  ]);

  res.json({ ok: true, newStock });
});

router.get("/low-stock", async (_req: AuthRequest, res: Response): Promise<void> => {
  const products = await prisma.product.findMany({
    where: { active: true, stock: { lte: prisma.product.fields.stockMinAlert } },
    include: { category: true },
    orderBy: { stock: "asc" },
  });
  // Workaround: compare in JS since Prisma doesn't support column comparison in where
  const low = await prisma.$queryRaw<{ id: string; name: string; sku: string; stock: number; stockMinAlert: number }[]>`
    SELECT id, name, sku, stock, stockMinAlert
    FROM Product
    WHERE active = true AND stock <= stockMinAlert
    ORDER BY stock ASC
  `;
  res.json(low);
});

export default router;
