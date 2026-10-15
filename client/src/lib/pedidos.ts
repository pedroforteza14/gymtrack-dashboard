import { currency } from "./format";

/* ═══════════════════════════════════════════════════════════
   PEDIDOS DE LA VENDEDORA

   Una venta que salió de un presupuesto ganado tiene su ficha en
   Producción. Acá se traduce esa ficha a lo que le dice al cliente.
   ═══════════════════════════════════════════════════════════ */

export interface Pedido {
  fichaNumber: string; estimatedDate?: string | null;
  fabricatedAt?: string | null; packedAt?: string | null; deliveredAt?: string | null;
  clientName?: string; clientPhone?: string | null; deliveryType?: string | null;
}

export type Etapa = "FABRICACION" | "FABRICADO" | "LISTO" | "ENTREGADO";

export function etapaDe(p: Pedido): Etapa {
  if (p.deliveredAt) return "ENTREGADO";
  if (p.packedAt) return "LISTO";
  if (p.fabricatedAt) return "FABRICADO";
  return "FABRICACION";
}

/** En qué parte de Producción está el pedido, dicho como se lo diría al cliente. */
export function etapaPedido(p: Pedido): { label: string; color: string } {
  switch (etapaDe(p)) {
    case "ENTREGADO": return { label: "Entregado", color: "bg-green-400/10 text-green-400" };
    case "LISTO": return { label: "Listo para entregar", color: "bg-white/10 text-white" };
    case "FABRICADO": return { label: "Fabricado, falta embalar", color: "bg-gray-700/60 text-gray-200" };
    default: return { label: "En fabricación", color: "bg-yellow-400/10 text-yellow-400" };
  }
}

// la fecha estimada se guarda como día (medianoche UTC): sin esto en Argentina sale el día anterior
export const diaDelPedido = (d: string) =>
  new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(d));

/** Días de atraso respecto de la fecha estimada (0 si no está atrasado o ya se entregó). */
export function diasDeAtraso(p: Pedido): number {
  if (p.deliveredAt || !p.estimatedDate) return 0;
  const hoy = new Date();
  const hoyUTC = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const dias = Math.floor((hoyUTC - new Date(p.estimatedDate).getTime()) / 86_400_000);
  return Math.max(dias, 0);
}

/** "Banco TP-01" / "Banco TP-01 y Rack Omega" / "Banco TP-01, Rack Omega y 2 más" */
export function resumenProductos(nombres: string[]): string {
  if (nombres.length <= 2) return nombres.join(" y ");
  return `${nombres.slice(0, 2).join(", ")} y ${nombres.length - 2} más`;
}

/** Mensaje de WhatsApp para contarle al cliente cómo va su pedido. */
export function mensajeAlCliente(p: Pedido, productos: string, saldo: number): string {
  const nombre = (p.clientName ?? "").split(" ")[0];
  const hola = `Hola${nombre ? ` ${nombre}` : ""}! Te escribo de The Promise Machine.`;
  const tuPedido = `tu pedido (${productos})`;
  const debe = saldo > 0 ? ` Te recuerdo que queda un saldo de ${currency(saldo)}.` : "";

  switch (etapaDe(p)) {
    case "FABRICACION":
      return `${hola} Te cuento que ${tuPedido} ya está en fabricación` +
             (p.estimatedDate ? `, la entrega estimada es para el ${diaDelPedido(p.estimatedDate)}` : "") +
             `. Te aviso apenas esté listo.`;
    case "FABRICADO":
      return `${hola} ${cap(tuPedido)} ya está fabricado. Ahora lo embalamos y en breve está listo para entregar.`;
    case "LISTO":
      if (p.deliveryType === "RETIRO")
        return `${hola} ${cap(tuPedido)} ya está listo para retirar. ¿Qué día te queda bien pasar a buscarlo?${debe}`;
      if (p.deliveryType === "FLETE")
        return `${hola} ${cap(tuPedido)} ya está listo para despachar. ¿Me confirmás la dirección y un horario para coordinar el envío?${debe}`;
      return `${hola} ${cap(tuPedido)} ya está listo para entregar. ¿Coordinamos la entrega?${debe}`;
    case "ENTREGADO":
      return `${hola} ¿Cómo llegó ${tuPedido}? Cualquier duda con el armado o el uso, escribime.`;
  }
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
