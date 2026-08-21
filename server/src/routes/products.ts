import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { generateListaPreciosPDF } from "../lib/listaPreciosPdf";

const router = Router();
router.use(authMiddleware);

const productSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(), // si viene vacío se genera solo
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
  const data = { ...parsed.data };
  if (!data.sku || !data.sku.trim()) {
    data.sku = `P-${Date.now().toString(36).toUpperCase()}`; // SKU automático
  }
  try {
    const product = await prisma.product.create({ data: data as any, select: productSelect });
    res.status(201).json(product);
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((err as any)?.code === "P2002") { res.status(400).json({ error: "Ya existe un producto con ese SKU. Usá otro o dejalo vacío." }); return; }
    console.error("Error creando producto:", err);
    res.status(500).json({ error: "No se pudo crear el producto" });
  }
});

router.put("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  if (parsed.data.imageData && parsed.data.imageData.length > MAX_IMG_CHARS) {
    res.status(400).json({ error: "La imagen es muy grande (máx. 2,5 MB)" }); return;
  }

  const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "Producto no encontrado" }); return; }

  try {
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
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((err as any)?.code === "P2002") { res.status(400).json({ error: "Ya existe un producto con ese SKU." }); return; }
    console.error("Error editando producto:", err);
    res.status(500).json({ error: "No se pudo guardar el producto" });
  }
});

// Lista de precios en PDF (token por query para abrir en pestaña nueva)
router.get("/lista-precios/pdf", async (req: AuthRequest, res: Response): Promise<void> => {
  const { line, categoryId } = req.query as Record<string, string>;
  const where: Record<string, unknown> = { active: true };
  if (line) where.line = line;
  if (categoryId) where.categoryId = categoryId;

  const products = await prisma.product.findMany({
    where,
    select: { name: true, sku: true, line: true, sellPrice: true, category: { select: { name: true } } },
    orderBy: [{ line: "asc" }, { name: "asc" }],
  });

  generateListaPreciosPDF(
    products.map((p) => ({
      name: p.name, sku: p.sku, line: p.line,
      category: p.category?.name ?? null, sellPrice: Number(p.sellPrice),
    })),
    res
  );
});

// Actualización masiva de precios por porcentaje
router.post("/bulk-price", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = z.object({
    percent: z.number().min(-90).max(500),
    line: z.string().optional(),        // filtrar por línea
    categoryId: z.string().optional(),  // o por categoría
    round: z.number().int().min(0).default(1000), // redondear a múltiplos de
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { percent, line, categoryId, round } = parsed.data;

  const where: Record<string, unknown> = { active: true };
  if (line) where.line = line;
  if (categoryId) where.categoryId = categoryId;

  const products = await prisma.product.findMany({ where, select: { id: true, sellPrice: true } });
  const factor = 1 + percent / 100;

  let updated = 0;
  for (const p of products) {
    const old = Number(p.sellPrice);
    let nuevo = old * factor;
    if (round > 0) nuevo = Math.round(nuevo / round) * round;
    if (nuevo === old) continue;
    await prisma.$transaction([
      prisma.product.update({ where: { id: p.id }, data: { sellPrice: nuevo } }),
      prisma.priceHistory.create({
        data: { productId: p.id, oldPrice: old, newPrice: nuevo, note: `Ajuste masivo ${percent > 0 ? "+" : ""}${percent}%` },
      }),
    ]);
    updated++;
  }
  res.json({ ok: true, updated, total: products.length });
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
