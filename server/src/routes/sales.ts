import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { cargarUsuario, esVendedor, soloDueño } from "../middleware/roles";
import { calcularComision, estaCobrada, avisar, CANAL_CON_COMISION } from "../lib/comisiones";

const router = Router();
router.use(authMiddleware);
router.use(cargarUsuario);

const saleItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
});

const createSaleSchema = z.object({
  items: z.array(saleItemSchema).min(1),
  notes: z.string().optional(),
  clientId: z.string().optional(),
  paymentMethod: z.enum(["CASH", "TRANSFER", "INSTALLMENTS", "OTHER"]).optional(),
  paymentStatus: z.enum(["PAID", "PENDING", "PARTIAL"]).default("PAID"),
  pendingAmount: z.number().min(0).optional(),
  date: z.string().optional(), // fecha real de la venta (para cargas retroactivas)
  channel: z.enum(["WHATSAPP", "MERCADO_LIBRE", "TIENDA_NUBE", "LOCAL", "OTRO"]).optional(),
  sellerId: z.string().optional(),
});

/** Un vendedor cobra sobre el total: no necesita ver costos ni márgenes. */
function segunRol(venta: any, req: AuthRequest) {
  if (!esVendedor(req) || !venta) return venta;
  const { totalCost, totalProfit, items, ...resto } = venta;
  return {
    ...resto,
    items: items?.map(({ unitCost, profit, ...i }: any) => ({
      ...i,
      product: i.product ? { name: i.product.name, sku: i.product.sku } : undefined,
    })),
  };
}

async function generateSaleNumber(): Promise<string> {
  const count = await prisma.sale.count();
  return `VTA-${String(count + 1).padStart(5, "0")}`;
}

router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  const {
    page = "1",
    limit = "20",
    clientId,
    dateFrom,
    dateTo,
  } = req.query as Record<string, string>;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where: Record<string, unknown> = { deletedAt: null };
  // un vendedor sólo puede ver sus propias ventas
  if (esVendedor(req)) where.sellerId = req.userId;
  if (clientId)           where.clientId  = clientId;
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo   ? { lte: new Date(dateTo + "T23:59:59.999Z") } : {}),
    };
  }

  const [sales, total] = await prisma.$transaction([
    prisma.sale.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        seller: { select: { id: true, name: true } },
        items: { include: { product: { select: { name: true, sku: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: parseInt(limit),
    }),
    prisma.sale.count({ where }),
  ]);

  res.json({ sales: sales.map((v) => segunRol(v, req)), total, page: parseInt(page), limit: parseInt(limit) });
});

router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const sale = await prisma.sale.findFirst({
    // un vendedor sólo puede abrir sus propias ventas
    where: { id: req.params.id, ...(esVendedor(req) ? { sellerId: req.userId } : {}) },
    include: {
      client: { select: { id: true, name: true } },
      items: { include: { product: true } },
    },
  });
  if (!sale) { res.status(404).json({ error: "Venta no encontrada" }); return; }
  res.json(segunRol(sale, req));
});

router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = createSaleSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { items, notes, clientId, paymentMethod, paymentStatus, pendingAmount, date } = parsed.data;
  // Un vendedor siempre se asigna a sí mismo; el dueño puede elegir a quién asignársela.
  const sellerId = esVendedor(req) ? req.userId! : (parsed.data.sellerId || null);
  // Si la carga un vendedor, el canal es WhatsApp salvo que diga otra cosa.
  const channel = parsed.data.channel ?? (esVendedor(req) ? CANAL_CON_COMISION : null);

  // Trabajo a pedido: no se controla stock. Solo validamos que el producto exista.
  const productIds = items.map((i) => i.productId);
  const products = await prisma.product.findMany({ where: { id: { in: productIds }, active: true } });

  for (const item of items) {
    const product = products.find((p) => p.id === item.productId);
    if (!product) {
      res.status(400).json({ error: `Producto ${item.productId} no encontrado` });
      return;
    }
  }

  const saleNumber = await generateSaleNumber();
  let totalCost = 0;
  let totalRevenue = 0;

  const saleItemsData = items.map((item) => {
    const product = products.find((p) => p.id === item.productId)!;
    const unitCost = Number(product.costPrice);
    const subtotal = item.unitPrice * item.quantity;
    const cost = unitCost * item.quantity;
    const profit = subtotal - cost;
    totalRevenue += subtotal;
    totalCost += cost;
    return {
      productId: item.productId,
      quantity: item.quantity,
      unitCost,
      unitPrice: item.unitPrice,
      subtotal,
      profit,
    };
  });

  const totalProfit = totalRevenue - totalCost;

  const comision = await calcularComision({
    channel, sellerId, total: totalRevenue, paymentStatus, pendingAmount,
  });

  const sale = await prisma.$transaction(async (tx) => {
    const newSale = await tx.sale.create({
      data: {
        saleNumber,
        notes,
        totalCost,
        totalRevenue,
        totalProfit,
        paymentMethod,
        paymentStatus,
        ...(pendingAmount !== undefined ? { pendingAmount } : {}),
        ...(clientId ? { clientId } : {}),
        ...(date ? { createdAt: new Date(date + "T12:00:00") } : {}),
        ...(channel ? { channel } : {}),
        ...(sellerId ? { sellerId } : {}),
        ...comision,
        items: { create: saleItemsData },
      },
      include: {
        client: { select: { id: true, name: true } },
        items: { include: { product: true } },
      },
    });

    return newSale;
  });

  // Si la cargó un vendedor, le avisamos al dueño
  if (esVendedor(req)) {
    const cliente = sale.client?.name ? ` a ${sale.client.name}` : "";
    await avisar({
      type: "VENTA_VENDEDOR",
      title: `Nueva venta de ${req.user?.name ?? "un vendedor"}`,
      body: `${sale.saleNumber}${cliente} por $${Number(sale.totalRevenue).toLocaleString("es-AR")}` +
            (comision.commissionAmount
              ? ` · comisión $${Number(comision.commissionAmount).toLocaleString("es-AR")}`
              : ""),
      link: "/sales",
    });
  }

  res.status(201).json(segunRol(sale, req));
});

// Editar una venta completa (productos, cliente, fecha, pago, notas)
router.put("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = createSaleSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { items, notes, clientId, paymentMethod, paymentStatus, pendingAmount, date } = parsed.data;

  const existing = await prisma.sale.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "Venta no encontrada" }); return; }
  // un vendedor sólo edita lo suyo
  if (esVendedor(req) && existing.sellerId !== req.userId) {
    res.status(403).json({ error: "Sólo podés editar tus propias ventas" });
    return;
  }

  const data: Record<string, unknown> = {};
  if (notes !== undefined) data.notes = notes || null;
  if (clientId !== undefined) data.clientId = clientId || null;
  if (paymentMethod !== undefined) data.paymentMethod = paymentMethod || null;
  if (paymentStatus !== undefined) data.paymentStatus = paymentStatus;
  if (pendingAmount !== undefined) data.pendingAmount = pendingAmount;
  if (date) data.createdAt = new Date(date + "T12:00:00");
  // el canal define si hay comisión: sólo el dueño puede cambiarlo después
  if (parsed.data.channel !== undefined && !esVendedor(req)) data.channel = parsed.data.channel;
  // sólo el dueño puede reasignar el vendedor de una venta
  if (parsed.data.sellerId !== undefined && !esVendedor(req)) {
    data.sellerId = parsed.data.sellerId || null;
  }

  // Si vienen items, se reemplazan y se recalculan los totales
  if (items && items.length > 0) {
    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({ where: { id: { in: productIds }, active: true } });
    for (const item of items) {
      if (!products.find((p) => p.id === item.productId)) {
        res.status(400).json({ error: "Alguno de los productos no existe" });
        return;
      }
    }

    let totalCost = 0, totalRevenue = 0;
    const saleItemsData = items.map((item) => {
      const product = products.find((p) => p.id === item.productId)!;
      const unitCost = Number(product.costPrice);
      const subtotal = item.unitPrice * item.quantity;
      const cost = unitCost * item.quantity;
      totalRevenue += subtotal;
      totalCost += cost;
      return { productId: item.productId, quantity: item.quantity, unitCost, unitPrice: item.unitPrice, subtotal, profit: subtotal - cost };
    });

    data.totalCost = totalCost;
    data.totalRevenue = totalRevenue;
    data.totalProfit = totalRevenue - totalCost;

    const nuevaCom = await calcularComision({
      channel: (data.channel as string) ?? existing.channel,
      sellerId: (data.sellerId as string) ?? existing.sellerId,
      total: totalRevenue,
      paymentStatus: (data.paymentStatus as string) ?? existing.paymentStatus,
      pendingAmount: data.pendingAmount ?? existing.pendingAmount,
      // si ya tenía comisión liquidada no tocamos el % pactado
      rateExistente: existing.commissionRate != null ? Number(existing.commissionRate) : null,
    });
    if (existing.commissionStatus !== "PAGADA") Object.assign(data, nuevaCom);

    const sale = await prisma.$transaction(async (tx) => {
      await tx.saleItem.deleteMany({ where: { saleId: req.params.id } });
      return tx.sale.update({
        where: { id: req.params.id },
        data: { ...data, items: { create: saleItemsData } },
        include: {
          client: { select: { id: true, name: true } },
          items: { include: { product: { select: { name: true, sku: true } } } },
        },
      });
    });
    res.json(segunRol(sale, req));
    return;
  }

  const sale = await prisma.sale.update({
    where: { id: req.params.id },
    data,
    include: {
      client: { select: { id: true, name: true } },
      items: { include: { product: { select: { name: true, sku: true } } } },
    },
  });
  res.json(sale);
});

// Actualizar el estado de cobro de una venta (usado desde Cobros)
router.put("/:id/payment", soloDueño, async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = z.object({
    paymentStatus: z.enum(["PAID", "PENDING", "PARTIAL"]).optional(),
    pendingAmount: z.number().min(0).optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const antes = await prisma.sale.findUnique({ where: { id: req.params.id } });
  if (!antes) { res.status(404).json({ error: "Venta no encontrada" }); return; }

  const data: Record<string, unknown> = { ...parsed.data };

  // la comisión sigue al estado de cobro, salvo que ya se haya liquidado
  if (antes.commissionStatus && antes.commissionStatus !== "PAGADA") {
    const cobrada = estaCobrada(
      parsed.data.paymentStatus ?? antes.paymentStatus,
      parsed.data.pendingAmount ?? antes.pendingAmount
    );
    data.commissionStatus = cobrada ? "A_PAGAR" : "EN_PROCESO";
  }

  const sale = await prisma.sale.update({ where: { id: req.params.id }, data });
  res.json(sale);
});

router.delete("/:id", soloDueño, async (req: AuthRequest, res: Response): Promise<void> => {
  const sale = await prisma.sale.findUnique({
    where: { id: req.params.id },
    include: { items: true },
  });
  if (!sale) { res.status(404).json({ error: "Venta no encontrada" }); return; }

  await prisma.$transaction(async (tx) => {
    await tx.stockMovement.deleteMany({ where: { saleId: sale.id } });
    await tx.sale.update({
      where: { id: sale.id },
      data: {
        deletedAt: new Date(),
        // al anular o devolver una venta, su comisión se cae
        ...(sale.commissionStatus ? { commissionStatus: "ANULADA" } : {}),
      },
    });
  });

  // si la comisión ya estaba liquidada, hay que avisar: es plata a descontar
  if (sale.commissionStatus === "PAGADA") {
    await avisar({
      type: "COMISION",
      title: "Se anuló una venta con comisión ya pagada",
      body: `${sale.saleNumber} por $${Number(sale.totalRevenue).toLocaleString("es-AR")}. ` +
            `Hay que descontar $${Number(sale.commissionAmount ?? 0).toLocaleString("es-AR")} de la próxima liquidación.`,
      link: "/comisiones",
    });
  }

  res.json({ ok: true });
});

export default router;
