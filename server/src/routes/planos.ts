import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();

const STATUSES = ["PENDIENTE", "EN_PROCESO", "HECHO"] as const;
const MAX_FILE_CHARS = 8_000_000; // ~6 MB en base64

// Todos los campos menos fileData (que pesa mucho). fileName indica si hay archivo.
const planoSelect = {
  id: true, title: true, notes: true, fileName: true, fileType: true,
  status: true, employeeId: true, createdAt: true, updatedAt: true,
  employee: { select: { id: true, name: true } },
} as const;

// ---------- Empleados ----------
router.get("/employees", authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
  const employees = await prisma.employee.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  res.json(employees);
});

router.post("/employees", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = z.object({ name: z.string().min(1), role: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Nombre requerido" }); return; }
  const employee = await prisma.employee.create({ data: parsed.data });
  res.status(201).json(employee);
});

router.delete("/employees/:id", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  await prisma.employee.update({ where: { id: req.params.id }, data: { active: false } });
  res.json({ ok: true });
});

// ---------- Planos ----------
const planoSchema = z.object({
  title: z.string().min(1),
  notes: z.string().optional(),
  employeeId: z.string().optional().nullable(),
  fileName: z.string().optional(),
  fileType: z.string().optional(),
  fileData: z.string().optional(), // base64 (sin prefijo data:)
});

router.get("/", authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
  const planos = await prisma.plano.findMany({
    orderBy: { createdAt: "desc" },
    select: planoSelect,
  });
  res.json(planos);
});

router.post("/", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = planoSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { fileData, ...rest } = parsed.data;
  if (fileData && fileData.length > MAX_FILE_CHARS) {
    res.status(400).json({ error: "El archivo es muy grande (máx. 6 MB)" });
    return;
  }
  const plano = await prisma.plano.create({
    data: { ...rest, employeeId: rest.employeeId || null, fileData: fileData || null },
    select: planoSelect,
  });
  res.status(201).json(plano);
});

router.put("/:id", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = z.object({
    title: z.string().optional(),
    notes: z.string().optional(),
    employeeId: z.string().optional().nullable(),
    status: z.enum(STATUSES).optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const data: Record<string, unknown> = { ...parsed.data };
  if ("employeeId" in parsed.data) data.employeeId = parsed.data.employeeId || null;
  const plano = await prisma.plano.update({
    where: { id: req.params.id },
    data,
    select: planoSelect,
  });
  res.json(plano);
});

router.delete("/:id", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  await prisma.plano.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// Descargar/ver el archivo del plano (token por query para poder abrirlo en pestaña nueva)
router.get("/:id/file", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const plano = await prisma.plano.findUnique({ where: { id: req.params.id } });
  if (!plano || !plano.fileData) { res.status(404).json({ error: "Sin archivo" }); return; }
  const buffer = Buffer.from(plano.fileData, "base64");
  res.setHeader("Content-Type", plano.fileType || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${plano.fileName || "plano"}"`);
  res.send(buffer);
});

export default router;
