import { prisma } from "./prisma";
import { calcularComision, estaCobrada, avisar } from "./comisiones";
import { mailVentaDeVendedor } from "./avisarPorMail";

/* ═══════════════════════════════════════════════════════════
   ALTA DE VENTAS

   La usan la pantalla de Ventas y el "presupuesto ganado" de la
   vendedora, así las dos calculan totales y comisión igual.
   ═══════════════════════════════════════════════════════════ */

export class ErrorDeVenta extends Error {}

export interface DatosVenta {
  items: { productId: string; quantity: number; unitPrice: number }[];
  notes?: string;
  clientId?: string | null;
  paymentMethod?: string;
  paymentStatus: string;
  pendingAmount?: number;
  date?: string;
  channel?: string | null;
  sellerId?: string | null;
  fichaId?: string | null;
}

export async function generateSaleNumber(): Promise<string> {
  const count = await prisma.sale.count();
  return `VTA-${String(count + 1).padStart(5, "0")}`;
}

/** Crea la venta con sus items y su comisión. Tira ErrorDeVenta si un producto no existe. */
export async function crearVenta(d: DatosVenta) {
  // Trabajo a pedido: no se controla stock. Solo validamos que el producto exista.
  const productIds = d.items.map((i) => i.productId);
  const products = await prisma.product.findMany({ where: { id: { in: productIds }, active: true } });

  for (const item of d.items) {
    if (!products.find((p) => p.id === item.productId)) {
      throw new ErrorDeVenta(`Producto ${item.productId} no encontrado`);
    }
  }

  const saleNumber = await generateSaleNumber();
  let totalCost = 0;
  let totalRevenue = 0;

  const saleItemsData = d.items.map((item) => {
    const product = products.find((p) => p.id === item.productId)!;
    const unitCost = Number(product.costPrice);
    const subtotal = item.unitPrice * item.quantity;
    const cost = unitCost * item.quantity;
    totalRevenue += subtotal;
    totalCost += cost;
    return {
      productId: item.productId,
      quantity: item.quantity,
      unitCost,
      unitPrice: item.unitPrice,
      subtotal,
      profit: subtotal - cost,
    };
  });

  const comision = await calcularComision({
    channel: d.channel, sellerId: d.sellerId, total: totalRevenue,
    paymentStatus: d.paymentStatus, pendingAmount: d.pendingAmount,
  });

  const sale = await prisma.sale.create({
    data: {
      saleNumber,
      notes: d.notes,
      totalCost,
      totalRevenue,
      totalProfit: totalRevenue - totalCost,
      paymentMethod: d.paymentMethod,
      paymentStatus: d.paymentStatus,
      ...(d.pendingAmount !== undefined ? { pendingAmount: d.pendingAmount } : {}),
      ...(d.clientId ? { clientId: d.clientId } : {}),
      ...(d.date ? { createdAt: new Date(d.date + "T12:00:00") } : {}),
      ...(d.channel ? { channel: d.channel } : {}),
      ...(d.sellerId ? { sellerId: d.sellerId } : {}),
      ...(d.fichaId ? { fichaId: d.fichaId } : {}),
      ...comision,
      items: { create: saleItemsData },
    },
    include: {
      client: { select: { id: true, name: true } },
      items: { include: { product: true } },
    },
  });

  return { sale, comision };
}

type VentaCreada = Awaited<ReturnType<typeof crearVenta>>;

/** Le avisa al dueño (mail + campanita) que un vendedor cargó una venta. */
export async function avisarVentaDeVendedor(vendedor: string, { sale, comision }: VentaCreada) {
  // el mail no bloquea la respuesta: si falla, queda el aviso en la campanita
  void mailVentaDeVendedor({
    vendedor,
    saleNumber: sale.saleNumber,
    cliente: sale.client?.name,
    total: Number(sale.totalRevenue),
    comision: comision.commissionAmount ? Number(comision.commissionAmount) : null,
    productos: sale.items.map((i: any) => `${i.product?.name ?? "—"} x${i.quantity}`).join(", ").slice(0, 120),
    cobrada: estaCobrada(sale.paymentStatus, sale.pendingAmount),
  });

  const cliente = sale.client?.name ? ` a ${sale.client.name}` : "";
  await avisar({
    type: "VENTA_VENDEDOR",
    title: `Nueva venta de ${vendedor}`,
    body: `${sale.saleNumber}${cliente} por $${Number(sale.totalRevenue).toLocaleString("es-AR")}` +
          (comision.commissionAmount
            ? ` · comisión $${Number(comision.commissionAmount).toLocaleString("es-AR")}`
            : ""),
    link: "/sales",
  });
}
