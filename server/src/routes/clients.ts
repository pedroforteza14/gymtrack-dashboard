import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

const clientSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

router.get("/", async (_req: AuthRequest, res: Response): Promise<void> => {
  const clients = await prisma.client.findMany({
    include: {
      _count: { select: { sales: true, quotes: true } },
      sales: {
        select: { totalRevenue: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const result = clients.map((c) => ({
    ...c,
    totalPurchases: c.sales.reduce((acc, s) => acc + Number(s.totalRevenue), 0),
    lastPurchase: c.sales[0]?.createdAt ?? null,
    salesCount: c._count.sales,
    quotesCount: c._count.quotes,
  }));

  res.json(result);
});

router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: {
      sales: {
        include: { items: { include: { product: { select: { name: true } } } } },
        orderBy: { createdAt: "desc" },
      },
      quotes: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!client) { res.status(404).json({ error: "Cliente no encontrado" }); return; }
  res.json(client);
});

router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = clientSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const data = { ...parsed.data, email: parsed.data.email || null };
  const client = await prisma.client.create({ data });
  res.status(201).json(client);
});

router.put("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = clientSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const data = { ...parsed.data, email: parsed.data.email || null };
  const client = await prisma.client.update({ where: { id: req.params.id }, data });
  res.json(client);
});

router.delete("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  await prisma.client.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;
