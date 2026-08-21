import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

const MAX_FILE_CHARS = 8_000_000; // ~6 MB en base64

// ─────────────────────────── NOTAS RÁPIDAS ───────────────────────────
router.get("/notes", async (_req: AuthRequest, res: Response): Promise<void> => {
  const notes = await prisma.note.findMany({ orderBy: [{ done: "asc" }, { createdAt: "desc" }] });
  res.json(notes);
});

router.post("/notes", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = z.object({ content: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Escribí algo" }); return; }
  const note = await prisma.note.create({ data: parsed.data });
  res.status(201).json(note);
});

router.put("/notes/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = z.object({ content: z.string().optional(), done: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const note = await prisma.note.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(note);
});

router.delete("/notes/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  await prisma.note.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ─────────────────────────── ADJUNTOS ───────────────────────────
// entityType: "ficha" | "client"
router.get("/attachments/:entityType/:entityId", async (req: AuthRequest, res: Response): Promise<void> => {
  const items = await prisma.attachment.findMany({
    where: { entityType: req.params.entityType, entityId: req.params.entityId },
    select: { id: true, fileName: true, fileType: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(items);
});

router.post("/attachments", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = z.object({
    entityType: z.enum(["ficha", "client"]),
    entityId: z.string(),
    fileName: z.string().min(1),
    fileType: z.string().optional(),
    fileData: z.string().min(1),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  if (parsed.data.fileData.length > MAX_FILE_CHARS) {
    res.status(400).json({ error: "El archivo es muy grande (máx. 6 MB)" }); return;
  }
  const created = await prisma.attachment.create({
    data: parsed.data,
    select: { id: true, fileName: true, fileType: true, createdAt: true },
  });
  res.status(201).json(created);
});

router.get("/attachments/:id/file", async (req: AuthRequest, res: Response): Promise<void> => {
  const a = await prisma.attachment.findUnique({ where: { id: req.params.id } });
  if (!a) { res.status(404).json({ error: "Archivo no encontrado" }); return; }
  res.setHeader("Content-Type", a.fileType || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${a.fileName}"`);
  res.send(Buffer.from(a.fileData, "base64"));
});

router.delete("/attachments/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  await prisma.attachment.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ─────────────────────────── PAPELERA ───────────────────────────
type TrashKind = "sale" | "quote" | "ficha" | "client" | "expense";

const MODEL = {
  sale: () => prisma.sale,
  quote: () => prisma.quote,
  ficha: () => prisma.fichaPedido,
  client: () => prisma.client,
  expense: () => prisma.expense,
} as const;

// Lista todo lo eliminado (últimos 30 días)
router.get("/trash", async (_req: AuthRequest, res: Response): Promise<void> => {
  const desde = new Date(Date.now() - 30 * 86400000);
  const where = { deletedAt: { not: null, gte: desde } };

  const [sales, quotes, fichas, clients, expenses] = await Promise.all([
    prisma.sale.findMany({ where, select: { id: true, saleNumber: true, totalRevenue: true, deletedAt: true } }),
    prisma.quote.findMany({ where, select: { id: true, quoteNumber: true, totalAmount: true, deletedAt: true } }),
    prisma.fichaPedido.findMany({ where, select: { id: true, fichaNumber: true, clientName: true, total: true, deletedAt: true } }),
    prisma.client.findMany({ where, select: { id: true, name: true, deletedAt: true } }),
    prisma.expense.findMany({ where, select: { id: true, concept: true, amount: true, deletedAt: true } }),
  ]);

  const items = [
    ...sales.map((s) => ({ kind: "sale" as TrashKind, id: s.id, titulo: s.saleNumber, detalle: `$${Number(s.totalRevenue).toLocaleString("es-AR")}`, deletedAt: s.deletedAt })),
    ...quotes.map((q) => ({ kind: "quote" as TrashKind, id: q.id, titulo: q.quoteNumber, detalle: `$${Number(q.totalAmount).toLocaleString("es-AR")}`, deletedAt: q.deletedAt })),
    ...fichas.map((f) => ({ kind: "ficha" as TrashKind, id: f.id, titulo: f.fichaNumber, detalle: f.clientName, deletedAt: f.deletedAt })),
    ...clients.map((c) => ({ kind: "client" as TrashKind, id: c.id, titulo: c.name, detalle: "Cliente", deletedAt: c.deletedAt })),
    ...expenses.map((e) => ({ kind: "expense" as TrashKind, id: e.id, titulo: e.concept, detalle: `$${Number(e.amount).toLocaleString("es-AR")}`, deletedAt: e.deletedAt })),
  ].sort((a, b) => new Date(b.deletedAt!).getTime() - new Date(a.deletedAt!).getTime());

  res.json(items);
});

// Restaurar
router.post("/trash/:kind/:id/restore", async (req: AuthRequest, res: Response): Promise<void> => {
  const kind = req.params.kind as TrashKind;
  if (!MODEL[kind]) { res.status(400).json({ error: "Tipo inválido" }); return; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (MODEL[kind]() as any).update({ where: { id: req.params.id }, data: { deletedAt: null } });
  res.json({ ok: true });
});

// Eliminar definitivamente
router.delete("/trash/:kind/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const kind = req.params.kind as TrashKind;
  if (!MODEL[kind]) { res.status(400).json({ error: "Tipo inválido" }); return; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (MODEL[kind]() as any).delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;
