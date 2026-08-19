import PDFDocument from "pdfkit";
import { Response } from "express";
import { LOGO_BLACK_B64 } from "./logoBlack";

const LOGO = Buffer.from(LOGO_BLACK_B64, "base64");

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

const INK = "#111111";
const GRAY = "#8a8a8a";
const LINE = "#c9c9c9";

const ars = (v: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(v);
const dmy = (d?: Date | null) => (d ? new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

export function generateFichaPDF(f: FichaData, res: Response): void {
  const doc = new PDFDocument({ margin: 34, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="ficha-${f.fichaNumber}.pdf"`);
  doc.pipe(res);

  const L = 34;
  const R = doc.page.width - 34;
  const W = R - L;

  doc.font("Helvetica");

  // ── Header: logo + título + N°/fechas ────────────────────
  doc.image(LOGO, L, 36, { height: 42 });

  const titleX = L + 250;
  doc.fontSize(19).fillColor(INK).font("Helvetica-Bold")
    .text("FICHA DE PEDIDO", titleX, 40)
    .text("Y FABRICACIÓN", titleX, 60);

  // Tres cajas con valores
  const boxW = 82, gap = 8;
  const boxes: [string, string][] = [
    ["N° DE PEDIDO", f.fichaNumber],
    ["FECHA", dmy(f.date)],
    ["FECHA ESTIMADA", dmy(f.estimatedDate) || "—"],
  ];
  let bx = titleX;
  const by = 90;
  boxes.forEach(([label, value]) => {
    doc.fontSize(7.5).fillColor(INK).font("Helvetica-Bold").text(label, bx, by, { width: boxW });
    doc.lineWidth(1).strokeColor(INK).roundedRect(bx, by + 12, boxW, 26, 3).stroke();
    doc.fontSize(11).fillColor(INK).font("Helvetica-Bold").text(value, bx + 6, by + 20, { width: boxW - 12, ellipsis: true });
    bx += boxW + gap;
  });

  // Regla separadora
  doc.lineWidth(1.4).strokeColor(INK).moveTo(L, 148).lineTo(R, 148).stroke();

  // ── Helper de sección: recuadro + pastilla negra ─────────
  const section = (label: string, x: number, y: number, w: number, h: number): number => {
    // recuadro del cuerpo
    doc.lineWidth(1).strokeColor(INK).roundedRect(x, y + 9, w, h - 9, 8).stroke();
    // pastilla negra
    const padX = 10;
    doc.fontSize(9).font("Helvetica-Bold");
    const tw = doc.widthOfString(label) + padX * 2;
    doc.roundedRect(x + 6, y, tw, 18, 9).fill(INK);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9).text(label, x + 6 + padX, y + 5);
    return y + 9; // top del cuerpo
  };

  const fieldLine = (label: string, value: string, x: number, y: number, lineToX: number) => {
    doc.fontSize(9.5).fillColor(INK).font("Helvetica").text(label, x, y);
    const lw = doc.widthOfString(label);
    doc.lineWidth(0.8).strokeColor(LINE).moveTo(x + lw + 6, y + 10).lineTo(lineToX, y + 10).stroke();
    if (value) doc.fontSize(10).fillColor(INK).font("Helvetica-Bold").text(value, x + lw + 10, y - 1);
  };

  const checkbox = (label: string, checked: boolean, x: number, y: number) => {
    doc.lineWidth(1).strokeColor(INK).roundedRect(x, y, 11, 11, 2).stroke();
    if (checked) { doc.fontSize(10).fillColor(INK).font("Helvetica-Bold").text("X", x + 2, y + 0.5); }
    doc.fontSize(9).fillColor(INK).font("Helvetica").text(label, x + 16, y + 1.5);
  };

  // ── 1. Datos del cliente ─────────────────────────────────
  let y = 162;
  let top = section("1. DATOS DEL CLIENTE", L, y, W, 90);
  top += 14;
  fieldLine("NOMBRE:", f.clientName, L + 16, top, R - 20);
  fieldLine("TELÉFONO:", f.clientPhone || "", L + 16, top + 22, R - 20);
  fieldLine("LOCALIDAD / PROVINCIA:", f.clientLocation || "", L + 16, top + 44, R - 20);
  y += 90 + 12;

  // ── 2. Pedido (tabla) ────────────────────────────────────
  const rows = Math.max(4, f.items.length);
  const pedidoH = 9 + 22 + rows * 24 + 8;
  section("2. PEDIDO", L, y, W, pedidoH);
  let ty = y + 9 + 12;
  const cCant = L + 16, cProd = L + 120;
  doc.fontSize(8.5).fillColor(INK).font("Helvetica-Bold")
    .text("CANTIDAD", cCant, ty, { width: 90, align: "center" })
    .text("PRODUCTO / MÁQUINA", cProd, ty);
  ty += 16;
  doc.lineWidth(0.8).strokeColor(LINE).moveTo(L + 12, ty).lineTo(R - 12, ty).stroke();
  // separador vertical entre columnas
  doc.moveTo(L + 108, y + 9 + 8).lineTo(L + 108, y + pedidoH - 6).stroke();
  for (let i = 0; i < rows; i++) {
    const it = f.items[i];
    const ry = ty + i * 24;
    if (it) {
      doc.fontSize(10).fillColor(INK).font("Helvetica").text(String(it.cantidad), cCant, ry + 7, { width: 90, align: "center" });
      doc.text(it.producto, cProd, ry + 7, { width: R - cProd - 16, ellipsis: true });
    }
    if (i < rows - 1) doc.lineWidth(0.5).strokeColor(LINE).moveTo(L + 12, ry + 24).lineTo(R - 12, ry + 24).stroke();
  }
  y += pedidoH + 12;

  // ── 3. Pago  +  4. Entrega (lado a lado) ─────────────────
  const halfW = (W - 14) / 2;
  const payX = L, entX = L + halfW + 14;
  const blockH = 108;

  // Pago
  let pTop = section("3. PAGO", payX, y, halfW, blockH) + 16;
  const saldo = Number(f.total) - Number(f.deposit);
  fieldLine("TOTAL:  $", f.total ? ars(Number(f.total)).replace("$", "").trim() : "", payX + 16, pTop, payX + halfW - 16);
  fieldLine("SEÑA:  $", f.deposit ? ars(Number(f.deposit)).replace("$", "").trim() : "", payX + 16, pTop + 22, payX + halfW - 16);
  fieldLine("SALDO:  $", ars(saldo).replace("$", "").trim(), payX + 16, pTop + 44, payX + halfW - 16);
  const pm = (f.paymentMethod || "").toUpperCase();
  const cy = pTop + 70;
  checkbox("EFECTIVO", pm === "EFECTIVO", payX + 16, cy);
  checkbox("TRANSFER.", pm === "TRANSFERENCIA", payX + 100, cy);
  checkbox("TARJETA", pm === "TARJETA", payX + 190, cy);

  // Entrega
  let eTop = section("4. ENTREGA / ENVÍO", entX, y, halfW, blockH) + 16;
  const dt = (f.deliveryType || "").toUpperCase();
  const dv = (f.deliveryVia || "").toUpperCase();
  checkbox("RETIRO POR FÁBRICA", dt === "RETIRO", entX + 16, eTop);
  checkbox("FLETE", dt === "FLETE", entX + 170, eTop);
  checkbox("VÍA CARGO", dv === "CARGO", entX + 16, eTop + 20);
  checkbox("BUSPACK", dv === "BUSPACK", entX + 120, eTop + 20);
  fieldLine("DESTINO:", f.destination || "", entX + 16, eTop + 42, entX + halfW - 16);
  fieldLine("DATOS / TRANSPORTE:", f.transportInfo || "", entX + 16, eTop + 64, entX + halfW - 16);
  y += blockH + 12;

  // ── 5. Observaciones ─────────────────────────────────────
  const obsH = 96;
  const oTop = section("5. OBSERVACIONES / PERSONALIZACIÓN", L, y, W, obsH) + 16;
  // renglones
  for (let i = 0; i < 3; i++) {
    const ly = oTop + 6 + i * 22;
    doc.lineWidth(0.6).strokeColor(LINE).moveTo(L + 16, ly).lineTo(R - 16, ly).stroke();
  }
  if (f.observations) doc.fontSize(10).fillColor(INK).font("Helvetica").text(f.observations, L + 16, oTop - 2, { width: W - 32 });
  y += obsH + 12;

  // ── 6. Control interno ───────────────────────────────────
  const ctrlH = 74;
  const cTop = section("6. CONTROL INTERNO", L, y, W, ctrlH) + 16;
  const colW = (W - 32) / 3;
  const control = (title: string, date: Date | null | undefined, by2: string | null | undefined, cx: number) => {
    checkbox(title, !!date, cx, cTop);
    doc.fontSize(8.5).fillColor(INK).font("Helvetica").text(`FECHA: ${dmy(date) || "____________"}`, cx, cTop + 22);
    doc.text(`INICIALES: ${by2 || "________"}`, cx, cTop + 38);
  };
  control("FABRICADO", f.fabricatedAt, f.fabricatedBy, L + 16);
  control("EMBALADO", f.packedAt, f.packedBy, L + 16 + colW);
  control("ENTREGADO", f.deliveredAt, f.deliveredBy, L + 16 + colW * 2);

  // ── Footer ───────────────────────────────────────────────
  doc.fontSize(8).fillColor(GRAY).font("Helvetica")
    .text("THE PROMISE MACHINE - Ficha interna de pedido y fabricación", L, doc.page.height - 30, { width: W, align: "right", lineBreak: false });

  doc.end();
}
