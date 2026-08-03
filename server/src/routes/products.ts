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
  line: z.string().optional(),
  imageName: z.string().optional(),
  imageType: z.string().optional(),
  imageData: z.string().optional(), // base64 sin prefijo data:
  stock: z.number().int().min(0).optional(),
  stockMinAlert: z.number().int().min(0).optional(),
});

const MAX_IMG_CHARS = 3_500_000; // ~2.6 MB en base64

// Todos los campos menos imageData (pesa). imageName indica si hay foto.
const productSelect = {
  id: true, name: true, sku: true, description: true, categoryId: true,
  costPrice: true, sellPrice: true, supplier: true, line: true,
  imageName: true, imageType: true, stock: true, stockMinAlert: true,
  active: true, createdAt: true, updatedAt: true,
  category: true,
} as const;

router.get("/", async (_req: AuthRequest, res: Response): Promise<void> => {
  const products = await prisma.product.findMany({
    select: productSelect,
    orderBy: { createdAt: "desc" },
  });
  res.json(products);
});

// Servir la foto del producto (token por query para <img> y pestaña nueva)
router.get("/:id/image", async (req: AuthRequest, res: Response): Promise<void> => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    select: { imageData: true, imageType: true, imageName: true },
  });
  if (!product?.imageData) { res.status(404).json({ error: "Sin imagen" }); return; }
  res.setHeader("Content-Type", product.imageType || "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(Buffer.from(product.imageData, "base64"));
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
  if (parsed.data.imageData && parsed.data.imageData.length > MAX_IMG_CHARS) {
    res.status(400).json({ error: "La imagen es muy grande (máx. 2,5 MB)" }); return;
  }
  const product = await prisma.product.create({ data: parsed.data as any, select: productSelect });
  res.status(201).json(product);
});

router.put("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  if (parsed.data.imageData && parsed.data.imageData.length > MAX_IMG_CHARS) {
    res.status(400).json({ error: "La imagen es muy grande (máx. 2,5 MB)" }); return;
  }

  const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "Producto no encontrado" }); return; }

  const product = await prisma.product.update({
    where: { id: req.params.id },
    data: parsed.data as any,
    select: productSelect,
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
