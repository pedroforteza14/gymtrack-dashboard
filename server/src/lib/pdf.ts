import PDFDocument from "pdfkit";
import { Response } from "express";
import { LOGO_WHITE_B64 } from "./logo";

const LOGO_BUFFER = Buffer.from(LOGO_WHITE_B64, "base64");

interface QuoteItem {
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface QuoteData {
  quoteNumber: string;
  createdAt: Date;
  validDays: number;
  status: string;
  notes?: string | null;
  client?: { name: string; email?: string | null; phone?: string | null; address?: string | null } | null;
  items: QuoteItem[];
  totalAmount: number;
  cashDiscount?: number;  // % OFF en efectivo/transferencia
  installments?: number;  // cuotas sin interés
}

// Paleta monocromática (marca The Promise Machine)
const INK = "#0f0f0f";
const SOFT = "#3f3f46";
const MUTED = "#71717a";
const LINE = "#e4e4e7";
const ZEBRA = "#fafafa";

function formatARS(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(value);
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador", SENT: "Enviado", ACCEPTED: "Aceptado",
  REJECTED: "Rechazado", EXPIRED: "Vencido",
};

export function generateQuotePDF(quote: QuoteData, res: Response): void {
  const doc = new PDFDocument({ margin: 44, size: "A4" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="presupuesto-${quote.quoteNumber}.pdf"`);
  doc.pipe(res);

  const L = 44;
  const R = doc.page.width - 44;
  const W = R - L;

  // ── Header (banda negra con logo real) ───────────────────
  doc.rect(0, 0, doc.page.width, 104).fill(INK);

  doc.image(LOGO_BUFFER, L, 30, { height: 30 });
  doc.fontSize(8.5).fillColor("#a1a1aa").font("Helvetica")
    .text("Fabricación de equipamiento de gimnasio · Directo de fábrica", L, 68);
  doc.fontSize(8.5).fillColor("#a1a1aa")
    .text("thepromisemachine.com.ar", L, 80);

  // Badge PRESUPUESTO (derecha, contorno blanco)
  const bw = 150, bx = R - bw;
  doc.lineWidth(1).strokeColor("#3f3f46").roundedRect(bx, 22, bw, 44, 6).stroke();
  doc.fontSize(8).fillColor("#a1a1aa").font("Helvetica-Bold")
    .text("PRESUPUESTO", bx, 31, { width: bw, align: "center", characterSpacing: 1 });
  doc.fontSize(15).fillColor("#ffffff").font("Helvetica-Bold")
    .text(quote.quoteNumber, bx, 44, { width: bw, align: "center" });

  // ── Info strip ───────────────────────────────────────────
  let y = 128;
  const fecha = new Date(quote.createdAt).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
  const vence = new Date(new Date(quote.createdAt).getTime() + quote.validDays * 86400000)
    .toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });

  const infoCol = (label: string, value: string, x: number) => {
    doc.fontSize(7.5).fillColor(MUTED).font("Helvetica-Bold").text(label, x, y, { characterSpacing: 0.5 });
    doc.fontSize(10.5).fillColor(INK).font("Helvetica-Bold").text(value, x, y + 12);
  };
  infoCol("FECHA DE EMISIÓN", fecha, L);
  infoCol("VÁLIDO HASTA", vence, L + W / 3);
  infoCol("ESTADO", STATUS_LABEL[quote.status] ?? quote.status, L + (2 * W) / 3);
  y += 40;
  doc.rect(L, y, W, 0.8).fill(LINE);
  y += 20;

  // ── Cliente ──────────────────────────────────────────────
  if (quote.client) {
    doc.fontSize(8).fillColor(MUTED).font("Helvetica-Bold").text("PRESUPUESTO PARA", L, y, { characterSpacing: 0.5 });
    y += 13;
    doc.fontSize(12.5).fillColor(INK).font("Helvetica-Bold").text(quote.client.name, L, y);
    y += 16;
    const parts: string[] = [];
    if (quote.client.phone) parts.push(`Tel: ${quote.client.phone}`);
    if (quote.client.email) parts.push(quote.client.email);
    if (quote.client.address) parts.push(quote.client.address);
    if (parts.length) {
      doc.fontSize(9).fillColor(SOFT).font("Helvetica").text(parts.join("   ·   "), L, y);
      y += 14;
    }
    y += 10;
  }

  // ── Tabla de productos ───────────────────────────────────
  const cQty = L + 8;
  const cName = L + 55;
  const cUnit = R - 200;
  const cSub = R - 100;

  doc.rect(L, y, W, 26).fill(INK);
  doc.fontSize(8).fillColor("#ffffff").font("Helvetica-Bold")
    .text("CANT.", cQty, y + 9)
    .text("PRODUCTO", cName, y + 9)
    .text("P. UNITARIO", cUnit, y + 9, { width: 90, align: "right" })
    .text("SUBTOTAL", cSub, y + 9, { width: 90, align: "right" });
  y += 26;

  quote.items.forEach((item, i) => {
    const rowH = 24;
    if (i % 2 === 1) doc.rect(L, y, W, rowH).fill(ZEBRA);
    doc.fontSize(9.5).fillColor(INK).font("Helvetica-Bold").text(String(item.quantity), cQty, y + 7, { width: 40 });
    doc.fontSize(9.5).fillColor(SOFT).font("Helvetica")
      .text(item.name, cName, y + 7, { width: cUnit - cName - 10, ellipsis: true });
    doc.fillColor(SOFT).text(formatARS(item.unitPrice), cUnit, y + 7, { width: 90, align: "right" });
    doc.fillColor(INK).font("Helvetica-Bold").text(formatARS(item.subtotal), cSub, y + 7, { width: 90, align: "right" });
    y += rowH;
  });
  doc.rect(L, y, W, 0.8).fill(LINE);
  y += 16;

  // ── Total ────────────────────────────────────────────────
  const tw = 230, tx = R - tw;
  doc.rect(tx, y, tw, 42).fill(INK);
  doc.fontSize(10).fillColor("#a1a1aa").font("Helvetica-Bold").text("TOTAL", tx + 16, y + 15, { characterSpacing: 1 });
  doc.fontSize(17).fillColor("#ffffff").font("Helvetica-Bold").text(formatARS(quote.totalAmount), tx + 16, y + 12, { width: tw - 32, align: "right" });
  y += 42 + 22;

  // ── Formas de pago ───────────────────────────────────────
  const desc = quote.cashDiscount ?? 0;
  const cuotas = quote.installments ?? 0;
  if (desc > 0 || cuotas > 1) {
    doc.fontSize(8).fillColor(MUTED).font("Helvetica-Bold").text("FORMAS DE PAGO", L, y, { characterSpacing: 0.5 });
    y += 14;

    const opciones: { label: string; sub: string; monto: string; destacado: boolean }[] = [];

    if (desc > 0) {
      const conDesc = quote.totalAmount * (1 - desc / 100);
      opciones.push({
        label: "Efectivo o transferencia",
        sub: `${desc}% OFF · ahorrás ${formatARS(quote.totalAmount - conDesc)}`,
        monto: formatARS(conDesc),
        destacado: true,
      });
    }
    if (cuotas > 1) {
      // 3 cuotas (si aplica) y el máximo configurado
      const planes = cuotas >= 6 ? [3, cuotas] : [cuotas];
      for (const n of planes) {
        opciones.push({
          label: `${n} cuotas sin interés`,
          sub: `${n} × ${formatARS(quote.totalAmount / n)}`,
          monto: formatARS(quote.totalAmount),
          destacado: false,
        });
      }
    }

    const rowH = 30;
    opciones.forEach((o) => {
      if (o.destacado) {
        doc.roundedRect(L, y, W, rowH, 5).fill(INK);
      } else {
        doc.lineWidth(0.8).strokeColor(LINE).roundedRect(L, y, W, rowH, 5).stroke();
      }
      const txtColor = o.destacado ? "#ffffff" : INK;
      const subColor = o.destacado ? "#a1a1aa" : MUTED;
      doc.fontSize(10).fillColor(txtColor).font("Helvetica-Bold").text(o.label, L + 12, y + 7);
      doc.fontSize(8).fillColor(subColor).font("Helvetica").text(o.sub, L + 12, y + 19);
      doc.fontSize(13).fillColor(txtColor).font("Helvetica-Bold")
        .text(o.monto, R - 172, y + 9, { width: 160, align: "right" });
      y += rowH + 6;
    });
    y += 12;
  }

  // ── Notas / modificaciones ───────────────────────────────
  if (quote.notes && quote.notes.trim()) {
    doc.fontSize(8).fillColor(MUTED).font("Helvetica-Bold").text("NOTAS / CONDICIONES", L, y, { characterSpacing: 0.5 });
    y += 14;
    const boxH = Math.max(38, doc.heightOfString(quote.notes, { width: W - 24, lineGap: 2 }) + 18);
    doc.lineWidth(0.8).strokeColor(LINE).roundedRect(L, y, W, boxH, 6).stroke();
    doc.fontSize(9.5).fillColor(SOFT).font("Helvetica").text(quote.notes, L + 12, y + 10, { width: W - 24, lineGap: 2 });
    y += boxH;
  }

  // ── Footer ───────────────────────────────────────────────
  const fy = doc.page.height - 58;
  doc.rect(L, fy, W, 0.8).fill(LINE);
  doc.fontSize(8).fillColor(MUTED).font("Helvetica")
    .text(`Presupuesto válido por ${quote.validDays} días desde su emisión. Precios en pesos argentinos (ARS), sujetos a modificación sin previo aviso.`, L, fy + 12, { width: W, align: "center" });
  doc.fontSize(8.5).fillColor(INK).font("Helvetica-Bold")
    .text("THE PROMISE MACHINE  ·  thepromisemachine.com.ar", L, fy + 32, { width: W, align: "center" });

  doc.end();
}
