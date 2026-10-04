import { Router, Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { cargarUsuario, soloDueño, esVendedor } from "../middleware/roles";
import { porcentajeGlobal, PORCENTAJE_POR_DEFECTO } from "../lib/comisiones";

const router = Router();
router.use(authMiddleware);
router.use(cargarUsuario);

/* ═════════ RESUMEN DE COMISIONES ═════════
   El dueño ve a todos; un vendedor ve sólo lo suyo. */
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user?.role !== "OWNER" && !esVendedor(req)) {
    res.status(403).json({ error: "No tenés permiso para ver las comisiones" });
    return;
  }
  const { desde, hasta, sellerId, estado } = req.query as Record<string, string>;

  // Las ventas anuladas siguen apareciendo: su comisión hay que descontarla
  // de la próxima liquidación, así que el dueño tiene que poder verla.
  const where: Record<string, unknown> = { commissionStatus: { not: null } };
  if (esVendedor(req)) where.sellerId = req.userId;
  else if (sellerId) where.sellerId = sellerId;
  if (estado) where.commissionStatus = estado;
  if (desde || hasta) {
    where.createdAt = {
      ...(desde ? { gte: new Date(desde) } : {}),
      ...(hasta ? { lte: new Date(hasta + "T23:59:59.999Z") } : {}),
    };
  }

  const ventas = await prisma.sale.findMany({
    where,
    select: {
      id: true, saleNumber: true, createdAt: true, totalRevenue: true,
      paymentStatus: true, pendingAmount: true, channel: true,
      commissionRate: true, commissionAmount: true,
      commissionStatus: true, commissionPaidAt: true,
      deletedAt: true,
      client: { select: { id: true, name: true } },
      seller: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const suma = (estado: string) =>
    ventas
      .filter((v) => v.commissionStatus === estado)
      .reduce((a, v) => a + Number(v.commissionAmount ?? 0), 0);

  res.json({
    ventas,
    totales: {
      enProceso: suma("EN_PROCESO"),
      aPagar:    suma("A_PAGAR"),
      pagada:    suma("PAGADA"),
      anulada:   suma("ANULADA"),
      facturado: ventas
        .filter((v) => v.commissionStatus !== "ANULADA")
        .reduce((a, v) => a + Number(v.totalRevenue), 0),
    },
  });
});

/* ═════════ LIQUIDAR ═════════
   Marca como pagadas las comisiones indicadas. Sólo el dueño. */
router.post("/liquidar", soloDueño, async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = z.object({ saleIds: z.array(z.string()).min(1) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  // sólo se liquida lo que está efectivamente cobrado
  const elegibles = await prisma.sale.findMany({
    where: { id: { in: parsed.data.saleIds }, commissionStatus: "A_PAGAR", deletedAt: null },
    select: { id: true, commissionAmount: true },
  });
  if (elegibles.length === 0) {
    res.status(400).json({ error: "Ninguna de esas comisiones está lista para liquidar" });
    return;
  }

  await prisma.sale.updateMany({
    where: { id: { in: elegibles.map((e) => e.id) } },
    data: { commissionStatus: "PAGADA", commissionPaidAt: new Date() },
  });

  res.json({
    ok: true,
    liquidadas: elegibles.length,
    monto: elegibles.reduce((a, e) => a + Number(e.commissionAmount ?? 0), 0),
  });
});

/* ═════════ AJUSTE DEL PORCENTAJE ═════════ */
router.get("/config", soloDueño, async (_req: AuthRequest, res: Response): Promise<void> => {
  res.json({ commissionRate: await porcentajeGlobal(), porDefecto: PORCENTAJE_POR_DEFECTO });
});

router.put("/config", soloDueño, async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = z.object({ commissionRate: z.number().min(0).max(100) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "El porcentaje debe estar entre 0 y 100" }); return; }

  await prisma.setting.upsert({
    where: { key: "commission_rate" },
    update: { value: String(parsed.data.commissionRate) },
    create: { key: "commission_rate", value: String(parsed.data.commissionRate) },
  });
  // Nota: sólo afecta a las ventas nuevas. Las anteriores conservan su % pactado.
  res.json({ ok: true, commissionRate: parsed.data.commissionRate });
});

/* ═════════ VENDEDORES ═════════ */
router.get("/vendedores", soloDueño, async (_req: AuthRequest, res: Response): Promise<void> => {
  const users = await prisma.user.findMany({
    where: { role: "SELLER" },
    select: { id: true, name: true, email: true, active: true, commissionRate: true, createdAt: true },
    orderBy: { name: "asc" },
  });

  const conDatos = await Promise.all(
    users.map(async (u) => {
      const ventas = await prisma.sale.findMany({
        where: { sellerId: u.id, deletedAt: null, commissionStatus: { not: "ANULADA" } },
        select: { totalRevenue: true, commissionAmount: true, commissionStatus: true },
      });
      return {
        ...u,
        ventas: ventas.length,
        facturado: ventas.reduce((a, v) => a + Number(v.totalRevenue), 0),
        comisionAPagar: ventas
          .filter((v) => v.commissionStatus === "A_PAGAR")
          .reduce((a, v) => a + Number(v.commissionAmount ?? 0), 0),
      };
    })
  );
  res.json(conDatos);
});

router.post("/vendedores", soloDueño, async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    commissionRate: z.number().min(0).max(100).optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const yaExiste = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (yaExiste) { res.status(400).json({ error: "Ya hay un usuario con ese mail" }); return; }

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      password: await bcrypt.hash(parsed.data.password, 10),
      role: "SELLER",
      ...(parsed.data.commissionRate !== undefined ? { commissionRate: parsed.data.commissionRate } : {}),
    },
    select: { id: true, name: true, email: true, role: true, commissionRate: true },
  });
  res.status(201).json(user);
});

router.put("/vendedores/:id", soloDueño, async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = z.object({
    name: z.string().min(2).optional(),
    active: z.boolean().optional(),
    commissionRate: z.number().min(0).max(100).nullable().optional(),
    password: z.string().min(6).optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const objetivo = await prisma.user.findUnique({
    where: { id: req.params.id }, select: { role: true },
  });
  if (!objetivo || objetivo.role !== "SELLER") {
    res.status(404).json({ error: "Vendedor no encontrado" });
    return;
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.active !== undefined) data.active = parsed.data.active;
  if (parsed.data.commissionRate !== undefined) data.commissionRate = parsed.data.commissionRate;
  if (parsed.data.password) data.password = await bcrypt.hash(parsed.data.password, 10);

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data,
    select: { id: true, name: true, email: true, active: true, commissionRate: true },
  });
  res.json(user);
});

export default router;
