import PDFDocument from "pdfkit";
import { Response } from "express";

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
}

const BRAND_COLOR = "#3B5BDB";
const DARK = "#1a1a2e";
const GRAY = "#6b7280";
const LIGHT_GRAY = "#f3f4f6";

function formatARS(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(value);
}

export function generateQuotePDF(quote: QuoteData, res: Response): void {
  const doc = new PDFDocument({ margin: 50, size: "A4" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="presupuesto-${quote.quoteNumber}.pdf"`);
  doc.pipe(res);

  // ── Header ──────────────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 90).fill(DARK);

  doc.fontSize(22).fillColor("#ffffff").font("Helvetica-Bold")
    .text("THE PROMISE MACHINE", 50, 25);
  doc.fontSize(9).fillColor("#94a3b8").font("Helvetica")
    .text("Fabricantes de máquinas de gimnasio", 50, 52);
  doc.fontSize(9).fillColor("#94a3b8")
    .text("thepromisemachine.com.ar", 50, 65);

  // Quote number badge
  doc.roundedRect(doc.page.width - 180, 20, 130, 50, 6).fill(BRAND_COLOR);
  doc.fontSize(8).fillColor("#ffffff").font("Helvetica-Bold")
    .text("PRESUPUESTO", doc.page.width - 175, 28, { width: 120, align: "center" });
  doc.fontSize(14).fillColor("#ffffff").font("Helvetica-Bold")
    .text(quote.quoteNumber, doc.page.width - 175, 42, { width: 120, align: "center" });

  // ── Info row ─────────────────────────────────────────────────────────
  doc.rect(0, 90, doc.page.width, 1).fill("#e5e7eb");

  const fecha = new Date(quote.createdAt).toLocaleDateString("es-AR", {
    day: "2-digit", month: "long", year: "numeric",
  });
  const vence = new Date(
    new Date(quote.createdAt).getTime() + quote.validDays * 86400000
  ).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });

  doc.rect(0, 91, doc.page.width, 45).fill(LIGHT_GRAY);

  doc.fontSize(8).fillColor(GRAY).font("Helvetica")
    .text("FECHA DE EMISIÓN", 50, 100)
    .text("VÁLIDO HASTA", 220, 100)
    .text("ESTADO", 390, 100);

  const statusLabel: Record<string, string> = {
    DRAFT: "Borrador", SENT: "Enviado", ACCEPTED: "Aceptado",
    REJECTED: "Rechazado", EXPIRED: "Vencido",
  };

  doc.fontSize(10).fillColor(DARK).font("Helvetica-Bold")
    .text(fecha, 50, 112)
    .text(vence, 220, 112)
    .text(statusLabel[quote.status] ?? quote.status, 390, 112);

  // ── Client ────────────────────────────────────────────────────────────
  let y = 155;

  if (quote.client) {
    doc.fontSize(9).fillColor(BRAND_COLOR).font("Helvetica-Bold")
      .text("DATOS DEL CLIENTE", 50, y);
    y += 14;
    doc.rect(50, y, doc.page.width - 100, 0.5).fill("#e5e7eb");
    y += 8;

    doc.fontSize(11).fillColor(DARK).font("Helvetica-Bold")
      .text(quote.client.name, 50, y);
    y += 14;

    if (quote.client.email) {
      doc.fontSize(9).fillColor(GRAY).font("Helvetica")
        .text(`Email: ${quote.client.email}`, 50, y);
      y += 12;
    }
    if (quote.client.phone) {
      doc.fontSize(9).fillColor(GRAY).font("Helvetica")
        .text(`Teléfono: ${quote.client.phone}`, 50, y);
      y += 12;
    }
    if (quote.client.address) {
      doc.fontSize(9).fillColor(GRAY).font("Helvetica")
        .text(`Dirección: ${quote.client.address}`, 50, y);
      y += 12;
    }
    y += 12;
  }

  // ── Table header ─────────────────────────────────────────────────────
  doc.fontSize(9).fillColor(BRAND_COLOR).font("Helvetica-Bold")
    .text("DETALLE DE PRODUCTOS", 50, y);
  y += 14;

  doc.rect(50, y, doc.page.width - 100, 24).fill(DARK);
  doc.fontSize(8).fillColor("#ffffff").font("Helvetica-Bold")
    .text("PRODUCTO", 58, y + 8)
    .text("SKU", 310, y + 8)
    .text("CANT.", 375, y + 8, { width: 40, align: "right" })
    .text("P. UNIT.", 420, y + 8, { width: 65, align: "right" })
    .text("SUBTOTAL", 490, y + 8, { width: 65, align: "right" });
  y += 24;

  // ── Table rows ────────────────────────────────────────────────────────
  quote.items.forEach((item, i) => {
    const rowH = 22;
    if (i % 2 === 0) {
      doc.rect(50, y, doc.page.width - 100, rowH).fill("#f9fafb");
    }
    doc.fontSize(9).fillColor(DARK).font("Helvetica")
      .text(item.name, 58, y + 6, { width: 245, ellipsis: true })
      .text(item.sku, 310, y + 6, { width: 60 })
      .text(String(item.quantity), 375, y + 6, { width: 40, align: "right" })
      .text(formatARS(item.unitPrice), 420, y + 6, { width: 65, align: "right" })
      .text(formatARS(item.subtotal), 490, y + 6, { width: 65, align: "right" });
    y += rowH;
  });

  // ── Total ─────────────────────────────────────────────────────────────
  y += 8;
  doc.rect(50, y, doc.page.width - 100, 0.5).fill("#e5e7eb");
  y += 10;

  doc.rect(doc.page.width - 220, y, 170, 36).fill(BRAND_COLOR);
  doc.fontSize(10).fillColor("#ffffff").font("Helvetica")
    .text("TOTAL", doc.page.width - 215, y + 6, { width: 80 });
  doc.fontSize(14).fillColor("#ffffff").font("Helvetica-Bold")
    .text(formatARS(quote.totalAmount), doc.page.width - 215, y + 6, { width: 160, align: "right" });

  y += 55;

  // ── Notes ─────────────────────────────────────────────────────────────
  if (quote.notes) {
    doc.fontSize(9).fillColor(BRAND_COLOR).font("Helvetica-Bold").text("NOTAS", 50, y);
    y += 12;
    doc.fontSize(9).fillColor(GRAY).font("Helvetica")
      .text(quote.notes, 50, y, { width: doc.page.width - 100 });
    y += 30;
  }

  // ── Footer ────────────────────────────────────────────────────────────
  const footerY = doc.page.height - 60;
  doc.rect(0, footerY, doc.page.width, 60).fill(LIGHT_GRAY);
  doc.rect(0, footerY, doc.page.width, 1).fill("#e5e7eb");

  doc.fontSize(8).fillColor(GRAY).font("Helvetica")
    .text(
      "Este presupuesto tiene validez de " + quote.validDays + " días desde su emisión. " +
      "Los precios están expresados en pesos argentinos (ARS).",
      50, footerY + 12, { width: doc.page.width - 100, align: "center" }
    )
    .text("The Promise Machine — thepromisemachine.com.ar", 50, footerY + 30, {
      width: doc.page.width - 100, align: "center",
    });

  doc.end();
}
