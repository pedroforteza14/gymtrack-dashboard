import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { generateFichaPDF, FichaItem } from "../lib/fichaPdf";

const router = Router();

const itemSchema = z.object({ cantidad: z.number().int().min(0), producto: z.string() });

const fichaSchema = z.object({
  clientName: z.string().min(1),
  clientPhone: z.string().optional(),
  clientLocation: z.string().optional(),
  estimatedDate: z.string().optional().nullable(),
  items: z.array(itemSchema).default([]),
  total: z.number().min(0).default(0),
  deposit: z.number().min(0).default(0),
  paymentMethod: z.enum(["EFECTIVO", "TRANSFERENCIA", "TARJETA"]).optional().nullable(),
  deliveryType: z.enum(["RETIRO", "FLETE"]).optional().nullable(),
  deliveryVia: z.enum(["CARGO", "BUSPACK"]).optional().nullable(),
  destination: z.string().optional(),
  transportInfo: z.string().optional(),
  observations: z.string().optional(),
  fabricatedAt: z.string().optional().nullable(),
  fabricatedBy: z.string().optional().nullable(),
  packedAt: z.string().optional().nullable(),
  packedBy: z.string().optional().nullable(),
  deliveredAt: z.string().optional().nullable(),
  deliveredBy: z.string().optional().nullable(),
});

async function generateFichaNumber(): Promise<string> {
  const count = await prisma.fichaPedido.count();
  return `FP-${String(count + 1).padStart(5, "0")}`;
}

// Convierte los campos de fecha string -> Date y limpia nulls
function toData(input: z.infer<typeof fichaSchema>) {
  const dateFields = ["estimatedDate", "fabricatedAt", "packedAt", "deliveredAt"] as const;
  const data: Record<string, unknown> = { ...input };
  for (const k of dateFields) {
    data[k] = input[k] ? new Date(input[k] as string) : null;
  }
  data.items = input.items;
  return data;
}

router.get("/", authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
  const fichas = await prisma.fichaPedido.findMany({ orderBy: { createdAt: "desc" } });
  res.json(fichas);
});

router.get("/:id", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const ficha = await prisma.fichaPedido.findUnique({ where: { id: req.params.id } });
  if (!ficha) { res.status(404).json({ error: "Ficha no encontrada" }); return; }
  res.json(ficha);
});

router.post("/", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = fichaSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const fichaNumber = await generateFichaNumber();
  const ficha = await prisma.fichaPedido.create({ data: { fichaNumber, ...toData(parsed.data) } as never });
  res.status(201).json(ficha);
});

router.put("/:id", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = fichaSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const ficha = await prisma.fichaPedido.update({
    where: { id: req.params.id },
    data: toData(parsed.data as z.infer<typeof fichaSchema>) as never,
  });
  res.json(ficha);
});

router.delete("/:id", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  await prisma.fichaPedido.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// PDF (token por query para abrir en pestaña nueva)
router.get("/:id/pdf", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const ficha = await prisma.fichaPedido.findUnique({ where: { id: req.params.id } });
  if (!ficha) { res.status(404).json({ error: "Ficha no encontrada" }); return; }
  generateFichaPDF({
    fichaNumber: ficha.fichaNumber,
    date: ficha.date,
    estimatedDate: ficha.estimatedDate,
    clientName: ficha.clientName,
    clientPhone: ficha.clientPhone,
    clientLocation: ficha.clientLocation,
    items: (ficha.items as unknown as FichaItem[]) ?? [],
    total: Number(ficha.total),
    deposit: Number(ficha.deposit),
    paymentMethod: ficha.paymentMethod,
    deliveryType: ficha.deliveryType,
    deliveryVia: ficha.deliveryVia,
    destination: ficha.destination,
    transportInfo: ficha.transportInfo,
    observations: ficha.observations,
    fabricatedAt: ficha.fabricatedAt, fabricatedBy: ficha.fabricatedBy,
    packedAt: ficha.packedAt, packedBy: ficha.packedBy,
    deliveredAt: ficha.deliveredAt, deliveredBy: ficha.deliveredBy,
  }, res);
});

export default router;
