import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { cargarUsuario, soloDueño } from "../middleware/roles";

const router = Router();
router.use(authMiddleware);
router.use(cargarUsuario);
router.use(soloDueño);   // los avisos son para el dueño

router.get("/", async (_req: AuthRequest, res: Response): Promise<void> => {
  const [items, sinLeer] = await prisma.$transaction([
    prisma.notification.findMany({ orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.notification.count({ where: { read: false } }),
  ]);
  res.json({ items, sinLeer });
});

router.post("/leer", async (req: AuthRequest, res: Response): Promise<void> => {
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : null;
  await prisma.notification.updateMany({
    where: ids ? { id: { in: ids } } : { read: false },
    data: { read: true },
  });
  res.json({ ok: true });
});

export default router;
