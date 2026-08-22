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
    where: { deletedAt: null },
    include: {
      _count: { select: { quotes: true, fichas: true } },
      // todas las ventas para poder sumar el total comprado
      sales: {
        where: { deletedAt: null },
        select: { totalRevenue: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      fichas: {
        where: { deletedAt: null },
        select: { total: true, deposit: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const result = clients.map((c) => {
    const { sales, fichas, _count, ...rest } = c;
    return {
      ...rest,
      totalPurchases: sales.reduce((acc, s) => acc + Number(s.totalRevenue), 0),
      lastPurchase: sales[0]?.createdAt ?? null,
      salesCount: sales.length,
      quotesCount: _count.quotes,
      fichasCount: _count.fichas,
      // saldo que el cliente todavía debe (de sus pedidos)
      saldoPendiente: fichas.reduce((acc, f) => acc + Math.max(0, Number(f.total) - Number(f.deposit)), 0),
    };
  });

  res.json(result);
});

// Ficha 360° del cliente: sus pedidos, ventas y presupuestos
router.get("/:id/detalle", async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!client) { res.status(404).json({ error: "Cliente no encontrado" }); return; }

  const [fichas, sales, quotes] = await Promise.all([
    prisma.fichaPedido.findMany({
      where: { clientId: req.params.id, deletedAt: null },
      select: { id: true, fichaNumber: true, date: true, total: true, deposit: true, items: true, deliveredAt: true, estimatedDate: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.sale.findMany({
      where: { clientId: req.params.id, deletedAt: null },
      select: { id: true, saleNumber: true, createdAt: true, totalRevenue: true, paymentStatus: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.quote.findMany({
      where: { clientId: req.params.id, deletedAt: null },
      select: { id: true, quoteNumber: true, createdAt: true, totalAmount: true, status: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  res.json({
    client,
    fichas, sales, quotes,
    totales: {
      comprado: sales.reduce((s, x) => s + Number(x.totalRevenue), 0),
      pedidos: fichas.length,
      saldoPendiente: fichas.reduce((s, f) => s + Math.max(0, Number(f.total) - Number(f.deposit)), 0),
    },
  });
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
  await prisma.client.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
  res.json({ ok: true });
});

export default router;
