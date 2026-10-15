import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { cargarUsuario, esVendedor, soloDueño, soloRoles } from "../middleware/roles";
import { generateQuotePDF } from "../lib/pdf";
import { avisar, CANAL_CON_COMISION } from "../lib/comisiones";
import { crearVenta, avisarVentaDeVendedor, ErrorDeVenta } from "../lib/ventas";
import { generateFichaNumber } from "./fichas";

const router = Router();
router.use(authMiddleware);
router.use(cargarUsuario);
router.use(soloRoles("OWNER", "SELLER"));

/* ═══════════════════════════════════════════════════════════
   TOPE DE DESCUENTO DE LA VENDEDORA

   · Puede bajar el precio de lista hasta el % que fije el dueño.
   · El % OFF por efectivo puede ser hasta el estándar (15%).
   · Si se pasa, el presupuesto queda "Esperando aprobación": no
     puede descargar el PDF hasta que el dueño lo apruebe.
   ═══════════════════════════════════════════════════════════ */
const TOPE_POR_DEFECTO = 10;
const OFF_EFECTIVO_ESTANDAR = 15;

async function topeDescuento(): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { key: "seller_max_discount" } });
  const n = s ? Number(s.value) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : TOPE_POR_DEFECTO;
}

async function necesitaAprobacion(
  items: { productId: string; unitPrice: number }[],
  cashDiscount: number
): Promise<boolean> {
  if (cashDiscount > OFF_EFECTIVO_ESTANDAR) return true;
  const tope = await topeDescuento();
  const products = await prisma.product.findMany({
    where: { id: { in: items.map((i) => i.productId) } },
    select: { id: true, sellPrice: true },
  });
  return items.some((i) => {
    const lista = Number(products.find((p) => p.id === i.productId)?.sellPrice ?? 0);
    // medio peso de tolerancia por redondeos
    return lista > 0 && i.unitPrice < lista * (1 - tope / 100) - 0.5;
  });
}

const quoteItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
  notes: z.string().optional(), // observación de ese producto en particular
});

const createQuoteSchema = z.object({
  clientId: z.string().optional(),
  items: z.array(quoteItemSchema).min(1),
  notes: z.string().optional(),
  validDays: z.number().int().positive().optional().default(15),
  cashDiscount: z.number().min(0).max(90).optional().default(OFF_EFECTIVO_ESTANDAR),
  installments: z.number().int().min(1).max(24).optional().default(6),
});

const conDetalle = {
  client: true,
  seller: { select: { id: true, name: true } },
  items: { include: { product: { select: { name: true, sku: true } } } },
} as const;

async function generateQuoteNumber(): Promise<string> {
  const count = await prisma.quote.count();
  return `PRE-${String(count + 1).padStart(5, "0")}`;
}

/** Un vendedor sólo puede tocar sus propios presupuestos. */
function buscarVisible(req: AuthRequest, id: string) {
  return prisma.quote.findFirst({
    where: { id, deletedAt: null, ...(esVendedor(req) ? { sellerId: req.userId } : {}) },
    include: conDetalle,
  });
}

/* ═════════ AJUSTE DEL TOPE ═════════ */
router.get("/config", async (_req: AuthRequest, res: Response): Promise<void> => {
  res.json({ maxDiscount: await topeDescuento(), cashDiscountStd: OFF_EFECTIVO_ESTANDAR });
});

router.put("/config", soloDueño, async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = z.object({ maxDiscount: z.number().min(0).max(100) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "El tope debe estar entre 0 y 100" }); return; }
  await prisma.setting.upsert({
    where: { key: "seller_max_discount" },
    update: { value: String(parsed.data.maxDiscount) },
    create: { key: "seller_max_discount", value: String(parsed.data.maxDiscount) },
  });
  res.json({ ok: true, maxDiscount: parsed.data.maxDiscount });
});

router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  const quotes = await prisma.quote.findMany({
    where: { deletedAt: null, ...(esVendedor(req) ? { sellerId: req.userId } : {}) },
    include: {
      client: { select: { name: true, phone: true } },
      seller: { select: { id: true, name: true } },
      items: { include: { product: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(quotes);
});

router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const quote = await buscarVisible(req, req.params.id);
  if (!quote) { res.status(404).json({ error: "Presupuesto no encontrado" }); return; }
  res.json(quote);
});

router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = createQuoteSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { clientId, items, notes, validDays, cashDiscount, installments } = parsed.data;

  let totalAmount = 0;
  const quoteItemsData = items.map((item) => {
    const subtotal = item.unitPrice * item.quantity;
    totalAmount += subtotal;
    return {
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal,
      notes: item.notes || null,
    };
  });

  const vendedor = esVendedor(req);
  const aprobar = vendedor && (await necesitaAprobacion(items, cashDiscount));

  const quoteNumber = await generateQuoteNumber();
  const quote = await prisma.quote.create({
    data: {
      quoteNumber,
      clientId: clientId || null,
      notes,
      validDays,
      cashDiscount,
      installments,
      totalAmount,
      ...(vendedor ? { sellerId: req.userId } : {}),
      ...(aprobar ? { status: "PENDING_APPROVAL" as const } : {}),
      items: { create: quoteItemsData },
    },
    include: conDetalle,
  });

  if (aprobar) {
    await avisar({
      type: "PRESUPUESTO",
      title: `${req.user?.name ?? "Un vendedor"} pide aprobar un descuento`,
      body: `${quote.quoteNumber}${quote.client ? ` para ${quote.client.name}` : ""} por ` +
            `$${totalAmount.toLocaleString("es-AR")}: tiene más descuento del permitido.`,
      link: "/quotes",
    });
  }
  res.status(201).json(quote);
});

const ESTADOS_DEL_VENDEDOR = ["DRAFT", "SENT", "NEGOTIATING", "REJECTED", "EXPIRED"] as const;
const ESTADOS_MANUALES = ["DRAFT", "PENDING_APPROVAL", "SENT", "NEGOTIATING", "REJECTED", "EXPIRED"] as const;

router.put("/:id/status", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = z.object({
    // "Ganado" no se pone a mano: lo pone /venta junto con la venta
    status: z.enum(ESTADOS_MANUALES),
    lostReason: z.string().max(200).optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { status, lostReason } = parsed.data;

  const quote = await buscarVisible(req, req.params.id);
  if (!quote) { res.status(404).json({ error: "Presupuesto no encontrado" }); return; }
  if (quote.saleId) { res.status(400).json({ error: "Este presupuesto ya se convirtió en venta" }); return; }

  if (esVendedor(req)) {
    if (quote.status === "PENDING_APPROVAL") {
      res.status(403).json({ error: "Este presupuesto está esperando la aprobación del dueño" }); return;
    }
    if (!(ESTADOS_DEL_VENDEDOR as readonly string[]).includes(status)) {
      res.status(403).json({ error: "Para marcarlo como ganado usá el botón \"Ganado\"" }); return;
    }
  }

  const updated = await prisma.quote.update({
    where: { id: quote.id },
    data: {
      status,
      lostReason: status === "REJECTED" ? lostReason || null : null,
      // la primera vez que se manda arranca a contar el seguimiento
      ...(status === "SENT" && !quote.sentAt ? { sentAt: new Date() } : {}),
    },
  });
  res.json(updated);
});

// El dueño aprueba un presupuesto con más descuento del permitido
router.post("/:id/aprobar", soloDueño, async (req: AuthRequest, res: Response): Promise<void> => {
  const quote = await prisma.quote.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!quote) { res.status(404).json({ error: "Presupuesto no encontrado" }); return; }
  if (quote.status !== "PENDING_APPROVAL") { res.status(400).json({ error: "No está esperando aprobación" }); return; }
  const updated = await prisma.quote.update({ where: { id: quote.id }, data: { status: "DRAFT" } });
  res.json(updated);
});

// Editar notas / validez de un presupuesto existente
router.put("/:id/notes", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = z.object({
    notes: z.string().optional(),
    validDays: z.number().int().positive().optional(),
    cashDiscount: z.number().min(0).max(90).optional(),
    installments: z.number().int().min(1).max(24).optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const quote = await buscarVisible(req, req.params.id);
  if (!quote) { res.status(404).json({ error: "Presupuesto no encontrado" }); return; }

  // lo que el dueño aprueba es lo que ve: mientras espera aprobación no se cambia el descuento
  if (esVendedor(req) && parsed.data.cashDiscount !== undefined
      && (quote.status === "PENDING_APPROVAL" || quote.saleId)) {
    res.status(403).json({ error: "No se puede cambiar el descuento de este presupuesto ahora" }); return;
  }

  // si la vendedora sube el % OFF por encima del estándar, vuelve a aprobación
  const reAprobar = esVendedor(req)
    && parsed.data.cashDiscount !== undefined
    && parsed.data.cashDiscount > OFF_EFECTIVO_ESTANDAR
    && quote.status !== "PENDING_APPROVAL";

  const updated = await prisma.quote.update({
    where: { id: quote.id },
    data: { ...parsed.data, ...(reAprobar ? { status: "PENDING_APPROVAL" as const } : {}) },
  });
  res.json(updated);
});

router.delete("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const quote = await buscarVisible(req, req.params.id);
  if (!quote) { res.status(404).json({ error: "Presupuesto no encontrado" }); return; }
  if (esVendedor(req) && quote.saleId) {
    res.status(403).json({ error: "Este presupuesto ya se convirtió en venta" }); return;
  }
  await prisma.quote.update({ where: { id: quote.id }, data: { deletedAt: new Date() } });
  res.json({ ok: true });
});

/* ═══════════════════════════════════════════════════════════
   PRESUPUESTO GANADO → VENTA + FICHA DE PEDIDO

   Se crean juntas y enlazadas: la venta lleva la comisión del
   vendedor y la ficha entra a Producción. Como la venta ya existe,
   entregar la ficha no genera otra.
   Si paga en efectivo o transferencia se aplica el % OFF del
   presupuesto, así la comisión sale sobre lo que realmente paga.
   ═══════════════════════════════════════════════════════════ */
const METODO_EN_FICHA: Record<string, "EFECTIVO" | "TRANSFERENCIA" | "TARJETA" | null> = {
  CASH: "EFECTIVO", TRANSFER: "TRANSFERENCIA", INSTALLMENTS: "TARJETA", OTHER: null,
};

router.post("/:id/venta", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = z.object({
    paymentMethod: z.enum(["CASH", "TRANSFER", "INSTALLMENTS", "OTHER"]),
    cobrado: z.number().min(0).default(0), // seña o pago total que ya dejó
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { paymentMethod, cobrado } = parsed.data;

  const quote = await buscarVisible(req, req.params.id);
  if (!quote) { res.status(404).json({ error: "Presupuesto no encontrado" }); return; }
  if (quote.status === "PENDING_APPROVAL") {
    res.status(400).json({ error: "Primero lo tiene que aprobar el dueño" }); return;
  }

  const conOff = paymentMethod === "CASH" || paymentMethod === "TRANSFER";
  const factor = conOff ? 1 - Number(quote.cashDiscount) / 100 : 1;
  const items = quote.items.map((i) => ({
    productId: i.productId,
    quantity: i.quantity,
    unitPrice: Math.round(Number(i.unitPrice) * factor),
  }));
  const total = items.reduce((a, i) => a + i.unitPrice * i.quantity, 0);
  if (cobrado > total) { res.status(400).json({ error: "Lo cobrado no puede superar el total" }); return; }

  const pendingAmount = total - cobrado;
  const paymentStatus = pendingAmount <= 0 ? "PAID" : cobrado > 0 ? "PARTIAL" : "PENDING";

  // Se reserva el presupuesto antes de crear nada: si llegan dos "Ganado" juntos
  // (doble click, dos pestañas), sólo uno pasa y no se duplica venta ni comisión.
  const reservado = await prisma.quote.updateMany({
    where: { id: quote.id, saleId: null, status: { notIn: ["ACCEPTED", "PENDING_APPROVAL"] } },
    data: { status: "ACCEPTED" },
  });
  if (reservado.count === 0) {
    res.status(409).json({ error: "Este presupuesto ya se convirtió en venta" }); return;
  }
  const liberar = () => prisma.quote.update({ where: { id: quote.id }, data: { status: quote.status } });

  let creada;
  try {
    creada = await crearVenta({
      items,
      notes: `Presupuesto ${quote.quoteNumber}`,
      clientId: quote.clientId,
      paymentMethod,
      paymentStatus,
      pendingAmount,
      channel: quote.sellerId ? CANAL_CON_COMISION : null,
      sellerId: quote.sellerId,
    });
  } catch (e) {
    await liberar();
    if (e instanceof ErrorDeVenta) {
      res.status(400).json({ error: "Alguno de los productos ya no está en el catálogo" }); return;
    }
    throw e;
  }
  const { sale } = creada;

  const fichaNumber = await generateFichaNumber();
  const vendio = quote.seller?.name ? `Vendió: ${quote.seller.name}` : null;
  try {
    await prisma.$transaction(async (tx) => {
      const ficha = await tx.fichaPedido.create({
        data: {
          fichaNumber,
          clientId: quote.clientId,
          clientName: quote.client?.name ?? "Cliente",
          clientPhone: quote.client?.phone ?? null,
          items: quote.items.map((i) => ({
            cantidad: i.quantity,
            producto: i.notes ? `${i.product.name} — ${i.notes}` : i.product.name,
          })),
          total,
          deposit: cobrado,
          paymentMethod: METODO_EN_FICHA[paymentMethod],
          observations: [quote.notes, vendio, `Presupuesto ${quote.quoteNumber}`].filter(Boolean).join("\n"),
          ...(cobrado > 0
            ? { payments: { create: { amount: cobrado, method: METODO_EN_FICHA[paymentMethod], notes: "Al cerrar el presupuesto" } } }
            : {}),
        },
      });
      await tx.sale.update({ where: { id: sale.id }, data: { fichaId: ficha.id } });
      await tx.quote.update({ where: { id: quote.id }, data: { saleId: sale.id, lostReason: null } });
    });
  } catch (e) {
    // sin ficha no hay pedido: se deshace la venta y el presupuesto vuelve a como estaba
    await prisma.sale.delete({ where: { id: sale.id } });
    await liberar();
    throw e;
  }

  if (esVendedor(req)) await avisarVentaDeVendedor(req.user?.name ?? "un vendedor", creada);

  res.status(201).json({ saleNumber: sale.saleNumber, fichaNumber, total });
});

// PDF generation
router.get("/:id/pdf", async (req: AuthRequest, res: Response): Promise<void> => {
  const quote = await buscarVisible(req, req.params.id);
  if (!quote) { res.status(404).json({ error: "Presupuesto no encontrado" }); return; }
  if (esVendedor(req) && quote.status === "PENDING_APPROVAL") {
    res.status(403).json({ error: "Este presupuesto está esperando la aprobación del dueño" }); return;
  }

  const pdfData = {
    quoteNumber: quote.quoteNumber,
    createdAt: quote.createdAt,
    validDays: quote.validDays,
    status: quote.status,
    notes: quote.notes,
    client: quote.client,
    totalAmount: Number(quote.totalAmount),
    cashDiscount: Number(quote.cashDiscount),
    installments: quote.installments,
    items: quote.items.map((i) => ({
      name: i.product.name,
      sku: i.product.sku,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      subtotal: Number(i.subtotal),
      notes: i.notes,
    })),
  };

  generateQuotePDF(pdfData, res);
});

export default router;
