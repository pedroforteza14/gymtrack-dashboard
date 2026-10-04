import { prisma } from "./prisma";

/* ═══════════════════════════════════════════════════════════
   COMISIONES

   Reglas acordadas:
   · Se calculan sobre el TOTAL de la venta (no sobre la ganancia).
   · Sólo para ventas del canal WhatsApp con vendedor asignado.
   · Nacen EN_PROCESO y pasan a A_PAGAR cuando la venta queda cobrada.
   · Si la venta se anula o se devuelve, la comisión se ANULA.
   · El porcentaje se congela en la venta: cambiar el global más
     adelante no recalcula las comisiones ya generadas.
   ═══════════════════════════════════════════════════════════ */

export const CANAL_CON_COMISION = "WHATSAPP";
export const PORCENTAJE_POR_DEFECTO = 3;

export type EstadoComision = "EN_PROCESO" | "A_PAGAR" | "PAGADA" | "ANULADA";

/** Porcentaje global configurable desde el panel. */
export async function porcentajeGlobal(): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { key: "commission_rate" } });
  const n = s ? Number(s.value) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : PORCENTAJE_POR_DEFECTO;
}

/** El % que le toca a un vendedor: el propio si tiene, si no el global. */
export async function porcentajeDe(sellerId: string | null | undefined): Promise<number> {
  if (!sellerId) return porcentajeGlobal();
  const u = await prisma.user.findUnique({
    where: { id: sellerId },
    select: { commissionRate: true },
  });
  const propio = u?.commissionRate != null ? Number(u.commissionRate) : null;
  return propio != null && propio >= 0 ? propio : porcentajeGlobal();
}

/** ¿Esta venta genera comisión? */
export function generaComision(channel?: string | null, sellerId?: string | null): boolean {
  return !!sellerId && channel === CANAL_CON_COMISION;
}

/** Cobrada = sin saldo pendiente. */
export function estaCobrada(paymentStatus: string, pendingAmount: unknown): boolean {
  const pend = pendingAmount == null ? 0 : Number(pendingAmount);
  return paymentStatus === "PAID" && pend <= 0;
}

/**
 * Calcula los campos de comisión para una venta.
 * Devuelve los valores listos para guardar (o nulos si no corresponde).
 */
export async function calcularComision(opts: {
  channel?: string | null;
  sellerId?: string | null;
  total: number;
  paymentStatus: string;
  pendingAmount?: unknown;
  /** % ya congelado, si la venta lo tenía */
  rateExistente?: number | null;
}) {
  if (!generaComision(opts.channel, opts.sellerId)) {
    return {
      commissionRate: null,
      commissionAmount: null,
      commissionStatus: null,
      commissionPaidAt: null,
    };
  }
  const rate = opts.rateExistente ?? (await porcentajeDe(opts.sellerId));
  const monto = Math.round(opts.total * (rate / 100) * 100) / 100;
  const estado: EstadoComision = estaCobrada(opts.paymentStatus, opts.pendingAmount)
    ? "A_PAGAR"
    : "EN_PROCESO";

  return {
    commissionRate: rate,
    commissionAmount: monto,
    commissionStatus: estado,
    commissionPaidAt: null,
  };
}

/** Deja un aviso para el dueño. */
export async function avisar(opts: {
  type: string;
  title: string;
  body: string;
  link?: string;
}) {
  try {
    await prisma.notification.create({ data: opts });
  } catch (e) {
    // un aviso que falla nunca debe tumbar la operación que lo originó
    console.error("No se pudo crear la notificación:", e);
  }
}
