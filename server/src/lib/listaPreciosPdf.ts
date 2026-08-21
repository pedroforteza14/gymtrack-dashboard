import PDFDocument from "pdfkit";
import { Response } from "express";
import { LOGO_BLACK_B64 } from "./logoBlack";

const LOGO = Buffer.from(LOGO_BLACK_B64, "base64");

export interface PrecioItem {
  name: string;
  sku: string;
  line?: string | null;
  category?: string | null;
  sellPrice: number;
}

const INK = "#111111";
const GRAY = "#8a8a8a";
const LINE = "#d9d9d9";
const ZEBRA = "#f7f7f7";

const ars = (v: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(v);

export function generateListaPreciosPDF(items: PrecioItem[], res: Response, opts?: { descuento?: number; cuotas?: number }): void {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="lista-precios-${new Date().toISOString().slice(0, 10)}.pdf"`);
  doc.pipe(res);

  const L = 40;
  const R = doc.page.width - 40;
  const W = R - L;
  const descuento = opts?.descuento ?? 15;
  const cuotas = opts?.cuotas ?? 6;

  // Agrupar por línea (y dentro, por categoría)
  const grupos = new Map<string, PrecioItem[]>();
  for (const it of items) {
    const key = it.line?.trim() || it.category?.trim() || "General";
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key)!.push(it);
  }

  const header = () => {
    doc.image(LOGO, L, 34, { height: 34 });
    doc.fontSize(15).fillColor(INK).font("Helvetica-Bold").text("LISTA DE PRECIOS", L + 230, 38);
    doc.fontSize(9).fillColor(GRAY).font("Helvetica")
      .text(new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" }), L + 230, 58);
    doc.lineWidth(1.2).strokeColor(INK).moveTo(L, 82).lineTo(R, 82).stroke();
  };

  const tableHeader = (y: number) => {
    doc.rect(L, y, W, 20).fill(INK);
    doc.fontSize(8).fillColor("#ffffff").font("Helvetica-Bold")
      .text("PRODUCTO", L + 8, y + 6)
      .text("SKU", R - 250, y + 6, { width: 70 })
      .text(`${cuotas} CUOTAS`, R - 175, y + 6, { width: 75, align: "right" })
      .text("PRECIO", R - 95, y + 6, { width: 87, align: "right" });
    return y + 20;
  };

  header();
  let y = 96;

  for (const [grupo, lista] of grupos) {
    // Salto de página si no entra el encabezado del grupo
    if (y > doc.page.height - 130) { doc.addPage(); header(); y = 96; }

    // Título del grupo (pastilla negra)
    doc.fontSize(9).font("Helvetica-Bold");
    const tw = doc.widthOfString(grupo.toUpperCase()) + 20;
    doc.roundedRect(L, y, tw, 18, 9).fill(INK);
    doc.fillColor("#ffffff").text(grupo.toUpperCase(), L + 10, y + 5);
    y += 24;

    y = tableHeader(y);

    lista.sort((a, b) => a.name.localeCompare(b.name)).forEach((it, i) => {
      if (y > doc.page.height - 70) {
        doc.addPage(); header(); y = 96; y = tableHeader(y);
      }
      const h = 18;
      if (i % 2 === 1) doc.rect(L, y, W, h).fill(ZEBRA);
      const cuota = it.sellPrice / cuotas;
      doc.fontSize(9).fillColor(INK).font("Helvetica")
        .text(it.name, L + 8, y + 5, { width: W - 270, ellipsis: true });
      doc.fontSize(8).fillColor(GRAY).text(it.sku, R - 250, y + 5.5, { width: 70 });
      doc.fontSize(8).fillColor(GRAY).text(ars(cuota), R - 175, y + 5.5, { width: 75, align: "right" });
      doc.fontSize(9.5).fillColor(INK).font("Helvetica-Bold").text(ars(it.sellPrice), R - 95, y + 5, { width: 87, align: "right" });
      y += h;
    });

    doc.lineWidth(0.6).strokeColor(LINE).moveTo(L, y).lineTo(R, y).stroke();
    y += 16;
  }

  // Pie en todas las páginas
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const fy = doc.page.height - 46;
    doc.lineWidth(0.6).strokeColor(LINE).moveTo(L, fy).lineTo(R, fy).stroke();
    doc.fontSize(7.5).fillColor(GRAY).font("Helvetica")
      .text(`${descuento}% OFF en efectivo y transferencia · ${cuotas} cuotas sin interés · Envíos a todo el país · Precios sujetos a modificación sin previo aviso`,
        L, fy + 8, { width: W, align: "center", lineBreak: false });
    doc.fontSize(8).fillColor(INK).font("Helvetica-Bold")
      .text("THE PROMISE MACHINE  ·  thepromisemachine.com.ar", L, fy + 22, { width: W, align: "center", lineBreak: false });
  }

  doc.end();
}
