import PDFDocument from "pdfkit";
import { Response } from "express";

export interface FichaItem { cantidad: number; producto: string; }

export interface FichaData {
  fichaNumber: string;
  date: Date;
  estimatedDate?: Date | null;
  clientName: string;
  clientPhone?: string | null;
  clientLocation?: string | null;
  items: FichaItem[];
  total: number;
  deposit: number;
  paymentMethod?: string | null;
  deliveryType?: string | null;
  deliveryVia?: string | null;
  destination?: string | null;
  transportInfo?: string | null;
  observations?: string | null;
  fabricatedAt?: Date | null; fabricatedBy?: string | null;
  packedAt?: Date | null; packedBy?: string | null;
  deliveredAt?: Date | null; deliveredBy?: string | null;
}

const DARK = "#1a1a2e";
const GRAY = "#6b7280";
const LINE = "#d1d5db";
const LIGHT = "#f3f4f6";

const ars = (v: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(v);
const dmy = (d?: Date | null) => (d ? new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

export function generateFichaPDF(f: FichaData, res: Response): void {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="ficha-${f.fichaNumber}.pdf"`);
  doc.pipe(res);

  const L = 40;                       // left margin
  const R = doc.page.width - 40;      // right edge
  const W = R - L;

  // ── Header ──────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 76).fill(DARK);
  doc.fontSize(18).fillColor("#ffffff").font("Helvetica-Bold")
    .text("THE PROMISE MACHINE", L, 20);
  doc.fontSize(10).fillColor("#cbd5e1").font("Helvetica-Bold")
    .text("FICHA DE PEDIDO Y FABRICACIÓN", L, 44);

  // N° / fechas box (right)
  const boxW = 190, boxX = R - boxW;
  doc.fontSize(8).fillColor("#94a3b8").font("Helvetica")
    .text("N° DE PEDIDO", boxX, 18, { width: boxW, align: "right" });
  doc.fontSize(14).fillColor("#ffffff").font("Helvetica-Bold")
    .text(f.fichaNumber, boxX, 28, { width: boxW, align: "right" });
  doc.fontSize(8).fillColor("#94a3b8").font("Helvetica")
    .text(`FECHA: ${dmy(f.date)}    ESTIMADA: ${dmy(f.estimatedDate) || "—"}`, boxX, 50, { width: boxW, align: "right" });

  let y = 92;

  const sectionTitle = (n: string) => {
    doc.rect(L, y, W, 18).fill(LIGHT);
    doc.fontSize(9).fillColor(DARK).font("Helvetica-Bold").text(n, L + 8, y + 5);
    y += 26;
  };
  const field = (label: string, value: string, x: number, w: number, yy: number) => {
    doc.fontSize(7.5).fillColor(GRAY).font("Helvetica").text(label, x, yy);
    doc.fontSize(10).fillColor(DARK).font("Helvetica-Bold").text(value || "—", x, yy + 10, { width: w, ellipsis: true });
  };

  // ── 1. Cliente ──────────────────────────────────────────
  sectionTitle("1. DATOS DEL CLIENTE");
  field("NOMBRE", f.clientName, L, W / 3 - 10, y);
  field("TELÉFONO", f.clientPhone || "—", L + W / 3, W / 3 - 10, y);
  field("LOCALIDAD / PROVINCIA", f.clientLocation || "—", L + (2 * W) / 3, W / 3 - 10, y);
  y += 34;

  // ── 2. Pedido ───────────────────────────────────────────
  sectionTitle("2. PEDIDO");
  doc.rect(L, y, W, 18).fill(DARK);
  doc.fontSize(8).fillColor("#ffffff").font("Helvetica-Bold")
    .text("CANT.", L + 8, y + 5, { width: 50 })
    .text("PRODUCTO / MÁQUINA", L + 70, y + 5);
  y += 18;
  const rows = f.items.length ? f.items : [{ cantidad: 0, producto: "" }];
  rows.forEach((it, i) => {
    const h = 20;
    if (i % 2 === 0) doc.rect(L, y, W, h).fill("#f9fafb");
    doc.fontSize(9).fillColor(DARK).font("Helvetica")
      .text(it.cantidad ? String(it.cantidad) : "", L + 8, y + 6, { width: 50 })
      .text(it.producto || "", L + 70, y + 6, { width: W - 80, ellipsis: true });
    y += h;
  });
  doc.rect(L, y, W, 0.5).fill(LINE);
  y += 12;

  // ── 3. Pago ─────────────────────────────────────────────
  sectionTitle("3. PAGO");
  const saldo = Number(f.total) - Number(f.deposit);
  field("TOTAL", ars(Number(f.total)), L, 150, y);
  field("SEÑA", ars(Number(f.deposit)), L + 170, 150, y);
  field("SALDO", ars(saldo), L + 340, 150, y);
  y += 30;
  const methods = ["EFECTIVO", "TRANSFERENCIA", "TARJETA"];
  let mx = L;
  methods.forEach((m) => {
    const checked = (f.paymentMethod || "").toUpperCase() === m;
    doc.rect(mx, y, 10, 10).lineWidth(1).strokeColor(DARK).stroke();
    if (checked) doc.fontSize(9).fillColor(DARK).font("Helvetica-Bold").text("X", mx + 2, y + 0.5);
    doc.fontSize(9).fillColor(DARK).font("Helvetica").text(m, mx + 15, y + 1);
    mx += 130;
  });
  y += 26;

  // ── 4. Entrega ──────────────────────────────────────────
  sectionTitle("4. ENTREGA / ENVÍO");
  const checkbox = (label: string, checked: boolean, x: number, yy: number) => {
    doc.rect(x, yy, 10, 10).lineWidth(1).strokeColor(DARK).stroke();
    if (checked) doc.fontSize(9).fillColor(DARK).font("Helvetica-Bold").text("X", x + 2, yy + 0.5);
    doc.fontSize(9).fillColor(DARK).font("Helvetica").text(label, x + 15, yy + 1);
  };
  checkbox("RETIRO POR FÁBRICA", (f.deliveryType || "") === "RETIRO", L, y);
  checkbox("FLETE", (f.deliveryType || "") === "FLETE", L + 200, y);
  checkbox("VÍA CARGO", (f.deliveryVia || "") === "CARGO", L + 320, y);
  checkbox("BUSPACK", (f.deliveryVia || "") === "BUSPACK", L + 430, y);
  y += 20;
  field("DESTINO", f.destination || "—", L, W / 2 - 10, y);
  field("DATOS / TRANSPORTE", f.transportInfo || "—", L + W / 2, W / 2 - 10, y);
  y += 34;

  // ── 5. Observaciones ────────────────────────────────────
  sectionTitle("5. OBSERVACIONES / PERSONALIZACIÓN");
  doc.rect(L, y, W, 44).lineWidth(0.5).strokeColor(LINE).stroke();
  doc.fontSize(9).fillColor(DARK).font("Helvetica").text(f.observations || "", L + 8, y + 6, { width: W - 16 });
  y += 54;

  // ── 6. Control interno ──────────────────────────────────
  sectionTitle("6. CONTROL INTERNO");
  const col = W / 3;
  const control = (title: string, date?: Date | null, by?: string | null, x = L) => {
    doc.fontSize(9).fillColor(DARK).font("Helvetica-Bold").text(title, x, y);
    doc.fontSize(8).fillColor(GRAY).font("Helvetica")
      .text(`Fecha: ${dmy(date) || "________"}`, x, y + 14)
      .text(`Iniciales: ${by || "________"}`, x, y + 26);
  };
  control("FABRICADO", f.fabricatedAt, f.fabricatedBy, L);
  control("EMBALADO", f.packedAt, f.packedBy, L + col);
  control("ENTREGADO", f.deliveredAt, f.deliveredBy, L + 2 * col);
  y += 44;

  // ── Footer ──────────────────────────────────────────────
  const fy = doc.page.height - 62;
  doc.fontSize(8).fillColor(GRAY).font("Helvetica")
    .text("THE PROMISE MACHINE — Ficha interna de pedido y fabricación", L, fy, { width: W, align: "center", lineBreak: false });

  doc.end();
}
