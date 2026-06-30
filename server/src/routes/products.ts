import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

const productSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  costPrice: z.number().min(0).default(0),
  sellPrice: z.number().min(0),
  supplier: z.string().optional(),
  stock: z.number().int().min(0).optional(),
  stockMinAlert: z.number().int().min(0).optional(),
});

router.get("/", async (_req: AuthRequest, res: Response): Promise<void> => {
  const products = await prisma.product.findMany({
    include: { category: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(products);
});

router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: { category: true, stockMovements: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
  if (!product) { res.status(404).json({ error: "Producto no encontrado" }); return; }
  res.json(product);
});

router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const product = await prisma.product.create({ data: parsed.data as any });
  res.status(201).json(product);
});

router.put("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "Producto no encontrado" }); return; }

  const product = await prisma.product.update({
    where: { id: req.params.id },
    data: parsed.data as any,
    include: { category: true },
  });

  // Track price change
  if (parsed.data.sellPrice !== undefined && Number(parsed.data.sellPrice) !== Number(existing.sellPrice)) {
    await prisma.priceHistory.create({
      data: {
        productId: product.id,
        oldPrice: existing.sellPrice,
        newPrice: parsed.data.sellPrice,
      },
    });
  }

  res.json(product);
});

router.get("/:id/price-history", async (req: AuthRequest, res: Response): Promise<void> => {
  const history = await prisma.priceHistory.findMany({
    where: { productId: req.params.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  res.json(history);
});

router.delete("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  await prisma.product.update({
    where: { id: req.params.id },
    data: { active: false },
  });
  res.json({ ok: true });
});

// Categories
router.get("/categories/all", async (_req: AuthRequest, res: Response): Promise<void> => {
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  res.json(categories);
});

router.post("/categories/create", async (req: AuthRequest, res: Response): Promise<void> => {
  const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
  const cat = await prisma.category.create({ data: { name } });
  res.status(201).json(cat);
});

export default router;
