export const currency = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

export const pct = (n: number) => `${n.toFixed(1)}%`;

export const dateShort = (d: string | Date) =>
  new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d));

export const dateLong = (d: string | Date) =>
  new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

// Arma un link de WhatsApp (agrega 54 de Argentina si falta)
export function waLink(phone: string | null | undefined, message: string): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (!digits.startsWith("54")) digits = "54" + digits;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
