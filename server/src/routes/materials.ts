import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

const materialSchema = z.object({
  productId: z.string(),
  name: z.string().min(1),
  quantity: z.number().min(0).default(1),
  unit: z.string().optional(),
  unitCost: z.number().min(0).default(0),
});

// Materiales de un producto + costo total calculado
router.get("/product/:productId", async (req: AuthRequest, res: Response): Promise<void> => {
  const materials = await prisma.material.findMany({
    where: { productId: req.params.productId },
    orderBy: { createdAt: "asc" },
  });
  const costoMateriales = materials.reduce((s, m) => s + Number(m.quantity) * Number(m.unitCost), 0);
  res.json({ materials, costoMateriales });
});

// Resumen de rentabilidad por producto (los que tienen materiales cargados)
router.get("/rentabilidad", async (_req: AuthRequest, res: Response): Promise<void> => {
  const products = await prisma.product.findMany({
    where: { active: true, materials: { some: {} } },
    select: {
      id: true, name: true, sku: true, line: true, sellPrice: true, costPrice: true,
      materials: { select: { quantity: true, unitCost: true } },
    },
    orderBy: { name: "asc" },
  });

  const rows = products.map((p) => {
    const costoMateriales = p.materials.reduce((s, m) => s + Number(m.quantity) * Number(m.unitCost), 0);
    const precio = Number(p.sellPrice);
    const ganancia = precio - costoMateriales;
    return {
      id: p.id, name: p.name, sku: p.sku, line: p.line,
      sellPrice: precio,
      costoMateriales,
      ganancia,
      margen: precio > 0 ? (ganancia / precio) * 100 : 0,
      cantidadMateriales: p.materials.length,
    };
  });
  res.json(rows);
});

router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = materialSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const material = await prisma.material.create({ data: parsed.data });
  await syncCostPrice(parsed.data.productId);
  res.status(201).json(material);
});

router.put("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = materialSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const material = await prisma.material.update({ where: { id: req.params.id }, data: parsed.data });
  await syncCostPrice(material.productId);
  res.json(material);
});

router.delete("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const material = await prisma.material.delete({ where: { id: req.params.id } });
  await syncCostPrice(material.productId);
  res.json({ ok: true });
});

// El costo del producto pasa a ser la suma de sus materiales
async function syncCostPrice(productId: string): Promise<void> {
  const materials = await prisma.material.findMany({ where: { productId }, select: { quantity: true, unitCost: true } });
  const costo = materials.reduce((s, m) => s + Number(m.quantity) * Number(m.unitCost), 0);
  await prisma.product.update({ where: { id: productId }, data: { costPrice: costo } });
}

export default router;
