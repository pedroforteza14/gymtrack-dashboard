import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { generateQuotePDF } from "../lib/pdf";

const router = Router();
router.use(authMiddleware);

const quoteItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
});

const createQuoteSchema = z.object({
  clientId: z.string().optional(),
  items: z.array(quoteItemSchema).min(1),
  notes: z.string().optional(),
  validDays: z.number().int().positive().optional().default(15),
});

async function generateQuoteNumber(): Promise<string> {
  const count = await prisma.quote.count();
  return `PRE-${String(count + 1).padStart(5, "0")}`;
}

router.get("/", async (_req: AuthRequest, res: Response): Promise<void> => {
  const quotes = await prisma.quote.findMany({
    include: {
      client: { select: { name: true } },
      items: { include: { product: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(quotes);
});

router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const quote = await prisma.quote.findUnique({
    where: { id: req.params.id },
    include: {
      client: true,
      items: { include: { product: { select: { name: true, sku: true } } } },
    },
  });
  if (!quote) { res.status(404).json({ error: "Presupuesto no encontrado" }); return; }
  res.json(quote);
});

router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = createQuoteSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { clientId, items, notes, validDays } = parsed.data;

  const productIds = items.map((i) => i.productId);
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });

  let totalAmount = 0;
  const quoteItemsData = items.map((item) => {
    const product = products.find((p) => p.id === item.productId)!;
    const subtotal = item.unitPrice * item.quantity;
    totalAmount += subtotal;
    return {
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal,
    };
  });

  const quoteNumber = await generateQuoteNumber();
  const quote = await prisma.quote.create({
    data: {
      quoteNumber,
      clientId: clientId || null,
      notes,
      validDays,
      totalAmount,
      items: { create: quoteItemsData },
    },
    include: {
      client: true,
      items: { include: { product: { select: { name: true, sku: true } } } },
    },
  });
  res.status(201).json(quote);
});

router.put("/:id/status", async (req: AuthRequest, res: Response): Promise<void> => {
  const { status } = z.object({
    status: z.enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"]),
  }).parse(req.body);
  const quote = await prisma.quote.update({
    where: { id: req.params.id },
    data: { status },
  });
  res.json(quote);
});

router.delete("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  await prisma.quote.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// PDF generation
router.get("/:id/pdf", async (req: AuthRequest, res: Response): Promise<void> => {
  const quote = await prisma.quote.findUnique({
    where: { id: req.params.id },
    include: {
      client: true,
      items: { include: { product: { select: { name: true, sku: true } } } },
    },
  });
  if (!quote) { res.status(404).json({ error: "Presupuesto no encontrado" }); return; }

  const pdfData = {
    quoteNumber: quote.quoteNumber,
    createdAt: quote.createdAt,
    validDays: quote.validDays,
    status: quote.status,
    notes: quote.notes,
    client: quote.client,
    totalAmount: Number(quote.totalAmount),
    items: quote.items.map((i) => ({
      name: i.product.name,
      sku: i.product.sku,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      subtotal: Number(i.subtotal),
    })),
  };

  generateQuotePDF(pdfData, res);
});

export default router;
